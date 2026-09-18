"""The real COLMAP adapter, against real rendered imagery.

Marked slow and deselected by default: it renders 24 views in Blender and runs a
full structure-from-motion solve, which takes the better part of a minute. It is
the only test that proves the adapter actually drives COLMAP, so it must exist --
the fake-provider tests in test_reconstruct.py check the stage's judgement, not
its ability to speak to the binary.

Both halves of the fixture matter. The high-texture render must register; the
low-texture one must *fail* to, because a pipeline that claims success on
unreconstructable input is the failure mode §38 is about.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from machine_twin.pipeline.reconstruct import coverage as coverage_mod
from machine_twin.pipeline.reconstruct.colmap import ColmapSparseProvider, _disable_gpu, _options

pytestmark = pytest.mark.slow

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "render_synthetic_machine.py"
#: 36, because 24 does not reconstruct -- see MIN_IMAGES in coverage.py for the
#: measurements. Using a failing view count here would test the wrong thing.
VIEWS = 36

needs_colmap = pytest.mark.skipif(shutil.which("colmap") is None, reason="colmap not installed")
needs_blender = pytest.mark.skipif(shutil.which("blender") is None, reason="blender not installed")


@pytest.fixture(scope="module")
def rendered(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Render the synthetic machine once for the whole module."""
    if shutil.which("blender") is None:
        pytest.skip("blender not installed")
    out = tmp_path_factory.mktemp("synthetic")
    subprocess.run(
        [
            "blender",
            "--background",
            "--python",
            str(FIXTURE),
            "--",
            "--out",
            str(out),
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
    images = sorted(out.glob("*.jpg"))
    assert len(images) == VIEWS, f"fixture rendered {len(images)} of {VIEWS} views"
    return out


@needs_colmap
class TestGpuFlagDetection:
    """COLMAP renamed these between major versions; passing an unknown option is a
    hard parse error, so the spelling is read from the binary rather than pinned."""

    def test_a_flag_is_chosen_that_this_build_declares(self) -> None:
        flags = _disable_gpu("feature_extractor")
        assert flags, "no GPU toggle found for feature_extractor"
        assert flags[0].lstrip("-") in _options("feature_extractor")

    def test_matcher_flag_matches_this_build_too(self) -> None:
        flags = _disable_gpu("exhaustive_matcher")
        assert flags
        assert flags[0].lstrip("-") in _options("exhaustive_matcher")

    def test_an_unknown_step_yields_no_flags_rather_than_a_guess(self) -> None:
        assert _disable_gpu("not_a_colmap_command") == []


@needs_colmap
@needs_blender
class TestRealSolve:
    def test_a_well_textured_capture_registers(self, rendered: Path, tmp_path: Path) -> None:
        result = ColmapSparseProvider().sparse(sorted(rendered.glob("*.jpg")), tmp_path / "work")

        assert result.total_images == VIEWS
        assert result.registered_images == VIEWS
        assert result.mean_reprojection_error is not None
        # Sub-pixel on synthetic imagery. A real capture is looser; this is the
        # fixture asserting the solve converged, not a quality bar for the product.
        assert result.mean_reprojection_error < 2.0

    def test_coverage_reads_good(self, rendered: Path, tmp_path: Path) -> None:
        result = ColmapSparseProvider().sparse(sorted(rendered.glob("*.jpg")), tmp_path / "work")
        assert coverage_mod.assess(result).status is coverage_mod.CoverageStatus.GOOD

    def test_a_model_directory_is_produced(self, rendered: Path, tmp_path: Path) -> None:
        result = ColmapSparseProvider().sparse(sorted(rendered.glob("*.jpg")), tmp_path / "work")
        assert (result.sparse_path / "cameras.bin").is_file()
        assert (result.sparse_path / "images.bin").is_file()

    def test_a_featureless_capture_is_reported_insufficient(self, tmp_path: Path) -> None:
        """The negative half.

        Flat, untextured frames give SIFT nothing to key on. The first version of
        the render fixture was accidentally like this and registered 12 of 36 --
        the pipeline correctly refused it, which is the behaviour under test here.
        """
        from tests.conftest import write_image

        images_dir = tmp_path / "flat"
        images = [
            write_image(images_dir / f"v{i:03d}.jpg", sharp=False, size=(640, 480))
            for i in range(VIEWS)
        ]
        result = ColmapSparseProvider().sparse(images, tmp_path / "work")

        assert result.registered_images < result.total_images
        assert not coverage_mod.assess(result).usable
