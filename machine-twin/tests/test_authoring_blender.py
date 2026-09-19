"""The real Blender authoring run.

Marked slow: it renders the fixture, solves it, meshes it and authors it, which is
the whole pipeline. It exists because the fake-provider tests in test_authoring.py
cannot catch a Blender API change -- and Blender's Python API does change between
major versions, which is exactly the class of breakage that silently produces no
GLB at all.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from machine_twin.pipeline.authoring.blender import BlenderAuthoringProvider, BlenderError
from machine_twin.pipeline.reconstruct.colmap import ColmapSparseProvider
from machine_twin.pipeline.reconstruct.object_capture import ObjectCaptureMeshProvider

pytestmark = pytest.mark.slow

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "render_synthetic_machine.py"
VIEWS = 36

needs_blender = pytest.mark.skipif(shutil.which("blender") is None, reason="blender not installed")
needs_colmap = pytest.mark.skipif(shutil.which("colmap") is None, reason="colmap not installed")


@pytest.fixture(scope="module")
def authored(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Render, solve, mesh and author once for the module."""
    if shutil.which("blender") is None or shutil.which("colmap") is None:
        pytest.skip("blender and colmap are both required")

    root = tmp_path_factory.mktemp("authored")
    images_dir = root / "images"

    subprocess.run(
        [
            "blender",
            "--background",
            "--python",
            str(FIXTURE),
            "--",
            "--out",
            str(images_dir),
            "--views",
            str(VIEWS),
            "--width",
            "800",
            "--height",
            "600",
        ],
        check=True,
        capture_output=True,
        timeout=1800,
    )
    images = sorted(images_dir.glob("*.jpg"))

    sparse = ColmapSparseProvider().sparse(images, root / "sfm")
    assert sparse.registered_images == VIEWS, f"fixture only registered {sparse.registered_images}"

    mesh = ObjectCaptureMeshProvider().mesh(images, sparse, root / "mesh")
    out_dir = root / "authoring"
    BlenderAuthoringProvider().author(mesh.mesh_path, out_dir, "abcdef0123456789")
    return out_dir


@needs_blender
@needs_colmap
class TestAuthoredOutput:
    def test_all_three_lods_exist(self, authored: Path) -> None:
        for name in ("machine.glb", "lod1.glb", "lod2.glb"):
            assert (authored / name).is_file(), f"{name} missing"

    def test_glbs_are_real_gltf(self, authored: Path) -> None:
        # The magic bytes. A zero-length or HTML-error file would otherwise pass a
        # bare existence check.
        for name in ("machine.glb", "lod1.glb", "lod2.glb"):
            assert (authored / name).read_bytes()[:4] == b"glTF"

    def test_lods_shrink_substantially(self, authored: Path) -> None:
        """Texture scaling, not decimation, is what makes an LOD worth having.

        Decimating geometry alone moved these files by about 2%, because a
        photogrammetry GLB is almost entirely baked texture. The assertion is
        deliberately demanding: anything less means the texture pass regressed.
        """
        sizes = [(authored / n).stat().st_size for n in ("machine.glb", "lod1.glb", "lod2.glb")]
        assert sizes[1] < sizes[0] * 0.6, f"lod1 barely shrank: {sizes}"
        assert sizes[2] < sizes[0] * 0.2, f"lod2 barely shrank: {sizes}"

    def test_poster_is_rendered(self, authored: Path) -> None:
        poster = authored / "poster.webp"
        assert poster.is_file()
        assert poster.stat().st_size > 1000

    def test_component_names_are_stable_ids(self, authored: Path) -> None:
        # The GLB node name is what a viewer reads back, so the stable id has to
        # survive export -- not just exist in the database.
        blob = (authored / "machine.glb").read_bytes()
        assert b"SKB_COMPONENT_001" in blob


@needs_blender
class TestFailures:
    def test_a_missing_mesh_is_reported(self, tmp_path: Path) -> None:
        with pytest.raises(BlenderError, match="no mesh to author"):
            BlenderAuthoringProvider().author(tmp_path / "nope.usdz", tmp_path / "out", "p1")

    def test_an_unreadable_mesh_fails_loudly(self, tmp_path: Path) -> None:
        # Blender exits 0 on some script failures, so the driver keys on the absent
        # result line rather than the return code.
        broken = tmp_path / "broken.usdz"
        broken.write_bytes(b"not a usd file")
        with pytest.raises(BlenderError):
            BlenderAuthoringProvider().author(broken, tmp_path / "out", "p1")
