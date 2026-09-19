"""COLMAP structure-from-motion.

Sparse only. COLMAP's dense stage (`patch_match_stereo`) is a CUDA-only code path
and macOS has no CUDA runtime, so the mesh comes from a different provider -- see
`object_capture.py` and the capability report.

Sparse is still run on every platform, and not merely as a step toward geometry:
it is the only stage that knows which photographs failed to register, which is the
one honest measure of whether a capture actually covers the machine.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

from machine_twin.pipeline.reconstruct.workspace import Workspace
from machine_twin.providers import SparseResult

#: Generous, because exhaustive matching is O(n^2) in image count and runs on CPU.
#: A 40-image set takes minutes; the ceiling exists to stop a runaway job, not to
#: bound normal work.
STEP_TIMEOUT_S = 3600


class ColmapError(RuntimeError):
    """A COLMAP step failed. Carries the step name and COLMAP's own message."""

    def __init__(self, step: str, message: str) -> None:
        self.step = step
        self.message = message
        super().__init__(f"colmap {step}: {message}")


def _colmap() -> str:
    exe = shutil.which("colmap")
    if exe is None:
        raise ColmapError(
            "resolve", "colmap is not on PATH. Install it with `brew install colmap`."
        )
    return exe


def _run(step: str, args: list[str]) -> str:
    proc = subprocess.run(  # noqa: S603
        [_colmap(), step, *args],
        capture_output=True,
        text=True,
        timeout=STEP_TIMEOUT_S,
        check=False,
    )
    output = f"{proc.stdout}\n{proc.stderr}".strip()
    if proc.returncode != 0:
        raise ColmapError(step, output[-500:] or f"exited {proc.returncode}")
    return output


@lru_cache(maxsize=8)
def _options(step: str) -> str:
    """This COLMAP build's option list for one command, cached per process."""
    proc = subprocess.run(  # noqa: S603
        [_colmap(), step, "-h"], capture_output=True, text=True, timeout=60, check=False
    )
    return f"{proc.stdout}\n{proc.stderr}"


#: COLMAP renamed the GPU toggles between major versions -- 3.x spells them
#: `SiftExtraction.use_gpu` / `SiftMatching.use_gpu`, 4.x `FeatureExtraction.use_gpu`
#: / `FeatureMatching.use_gpu`. Passing an unknown option is a hard parse error, not
#: a warning, so the spelling is read from the binary's own help rather than pinned
#: to whichever version happened to be installed when this was written.
_GPU_FLAGS = {
    "feature_extractor": ("--FeatureExtraction.use_gpu", "--SiftExtraction.use_gpu"),
    "exhaustive_matcher": ("--FeatureMatching.use_gpu", "--SiftMatching.use_gpu"),
}


def _disable_gpu(step: str) -> list[str]:
    """Force the CPU path, in whatever spelling this build understands.

    GPU SIFT needs an OpenGL context that a headless subprocess on macOS does not
    reliably get, and this COLMAP is built without GPU support at all. Returns an
    empty list when the build exposes no such option, so a GPU-less build is not
    handed a flag it never declared.
    """
    help_text = _options(step)
    for flag in _GPU_FLAGS.get(step, ()):
        if flag.lstrip("-") in help_text:
            return [flag, "0"]
    return []


#: COLMAP exits non-zero when it cannot build any model -- which happens for two
#: completely different reasons. A broken installation is the tool's problem; a
#: capture with no overlap between views is the operator's, and the fix is to
#: re-shoot. Conflating them tells someone to reinstall COLMAP when what they need
#: is more photographs, so the "nothing matched" case is recognised and returned as
#: a zero-registration result for the coverage assessment to explain.
_NO_MODEL = re.compile(
    r"Failed to create any sparse model|No images with matches|"
    r"no images with matches",
    re.IGNORECASE,
)


_STATS = {
    "cameras": re.compile(r"Cameras:\s*(\d+)"),
    "images": re.compile(r"Images:\s*(\d+)"),
    "registered": re.compile(r"Registered images:\s*(\d+)"),
    "points": re.compile(r"Points:\s*(\d+)"),
    "error": re.compile(r"Mean reprojection error:\s*([\d.]+)"),
}


def _analyze(model: Path) -> dict[str, float]:
    """Read model statistics from COLMAP rather than parsing its binary output.

    `model_analyzer` is the supported way to ask, and it avoids taking a pycolmap
    dependency purely to count registered images.
    """
    output = _run("model_analyzer", ["--path", str(model)])
    stats: dict[str, float] = {}
    for key, pattern in _STATS.items():
        match = pattern.search(output)
        if match:
            stats[key] = float(match.group(1))
    return stats


def _best_model(sparse_dir: Path) -> Path | None:
    """Pick the largest sub-model.

    The mapper writes `sparse/0`, `sparse/1`, ... when it cannot join every image
    into one reconstruction -- which is exactly what happens on a capture with a
    gap. The largest is the real machine; the rest are fragments, and quietly
    taking `sparse/0` would sometimes pick a fragment.
    """
    models = [p for p in sorted(sparse_dir.glob("*")) if (p / "cameras.bin").is_file()]
    if not models:
        return None
    if len(models) == 1:
        return models[0]
    return max(models, key=lambda m: (m / "images.bin").stat().st_size)


class ColmapSparseProvider:
    """Structure-from-motion via the COLMAP CLI."""

    name = "colmap"

    def sparse(self, images: list[Path], workspace: Path) -> SparseResult:
        work = Workspace(workspace)
        work.prepare()
        image_dir = images[0].parent if images else work.images

        # The CPU path is selected up front rather than discovered by a crash;
        # see _disable_gpu for why the flag name is looked up instead of pinned.
        _run(
            "feature_extractor",
            [
                "--database_path",
                str(work.database),
                "--image_path",
                str(image_dir),
                "--ImageReader.single_camera",
                "1",
                *_disable_gpu("feature_extractor"),
            ],
        )
        _run(
            "exhaustive_matcher",
            ["--database_path", str(work.database), *_disable_gpu("exhaustive_matcher")],
        )
        try:
            _run(
                "mapper",
                [
                    "--database_path",
                    str(work.database),
                    "--image_path",
                    str(image_dir),
                    "--output_path",
                    str(work.sparse),
                ],
            )
        except ColmapError as exc:
            if not _NO_MODEL.search(exc.message):
                raise
            # Not a tool failure. The images simply do not overlap enough to
            # reconstruct, which the coverage assessment turns into advice.
            return SparseResult(
                sparse_path=work.sparse,
                registered_images=0,
                total_images=len(images),
            )

        model = _best_model(work.sparse)
        if model is None:
            # Not an exception: zero registered images is a real outcome of a poor
            # capture, and the coverage assessment turns it into a recommendation.
            return SparseResult(
                sparse_path=work.sparse,
                registered_images=0,
                total_images=len(images),
            )

        stats = _analyze(model)
        return SparseResult(
            sparse_path=model,
            registered_images=int(stats.get("registered", 0)),
            total_images=len(images),
            mean_reprojection_error=stats.get("error"),
        )
