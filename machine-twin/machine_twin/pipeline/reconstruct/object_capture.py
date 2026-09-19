"""Mesh generation via Apple Object Capture.

The mesh backend on macOS, because COLMAP's dense stage needs CUDA. Driven as a
subprocess around a compiled Swift helper: PhotogrammetrySession is an async Swift
API with a long-running output stream, and a subprocess boundary keeps that out of
the pipeline's process entirely.

The helper ignores the sparse result. PhotogrammetrySession runs its own
structure-from-motion internally and takes only an image directory -- we still run
COLMAP sparse first, for the coverage assessment it alone can produce.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from machine_twin.capabilities import OBJECT_CAPTURE_HELPER
from machine_twin.providers import MeshResult, SparseResult
from machine_twin.schema.models import GeometrySource

#: Photogrammetry is slow and this is a laptop. The cap is a runaway guard.
RECONSTRUCT_TIMEOUT_S = 7200

#: USDZ because PhotogrammetrySession writes it natively. Blender imports it at
#: M5 and the GLB the browser needs is exported from there.
OUTPUT_NAME = "model.usdz"

DETAIL_LEVELS = ("preview", "reduced", "medium", "full", "raw")


class ObjectCaptureError(RuntimeError):
    pass


class ObjectCaptureMeshProvider:
    name = "object_capture"
    source = GeometrySource.OBJECT_CAPTURE.value

    def __init__(self, helper: Path | None = None, detail: str = "medium") -> None:
        if detail not in DETAIL_LEVELS:
            raise ValueError(f"detail must be one of {DETAIL_LEVELS}")
        self.helper = helper or OBJECT_CAPTURE_HELPER
        self.detail = detail

    def mesh(
        self,
        images: list[Path],
        sparse: SparseResult | None,
        workspace: Path,
    ) -> MeshResult:
        if not self.helper.exists():
            raise ObjectCaptureError(
                f"Object Capture helper not built at {self.helper}. "
                "Run `make build-object-capture`."
            )
        if not images:
            raise ObjectCaptureError("no images to reconstruct")

        image_dir = images[0].parent
        out_dir = Path(workspace) / "mesh"
        out_dir.mkdir(parents=True, exist_ok=True)
        output = out_dir / OUTPUT_NAME

        proc = subprocess.run(  # noqa: S603
            [str(self.helper), "reconstruct", str(image_dir), str(output), self.detail],
            capture_output=True,
            text=True,
            timeout=RECONSTRUCT_TIMEOUT_S,
            check=False,
        )

        payload = {}
        if proc.stdout:
            try:
                payload = json.loads(proc.stdout.splitlines()[-1])
            except (json.JSONDecodeError, IndexError):
                payload = {}

        if proc.returncode != 0 or not output.is_file():
            reason = payload.get("reason") or (proc.stderr or "").strip()[-400:]
            raise ObjectCaptureError(reason or "reconstruction produced no model")

        vertices, faces = _count_geometry(output)
        return MeshResult(
            mesh_path=output,
            source=self.source,
            vertex_count=vertices,
            face_count=faces,
            confidence_method="not_reported_by_provider",
        )


def _count_geometry(path: Path) -> tuple[int, int]:
    """Vertex and face counts, or zeros when they cannot be read.

    USDZ needs a USD reader to count properly, and neither trimesh nor a USD
    library is a dependency until M5 opens the file in Blender anyway. Returning
    zeros is deliberate: a fabricated count would be exactly the kind of invented
    number §38 forbids. M5 fills these in from Blender, which has to load the mesh
    regardless.
    """
    return 0, 0
