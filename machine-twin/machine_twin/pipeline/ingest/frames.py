"""Representative frame selection from a walk-around video.

§5: "avoid processing every frame blindly". A 60-second walk-around at 30fps is
1,800 frames; feeding those to structure-from-motion is mostly a way to spend an
hour matching near-duplicates, and many of them are motion-blurred because the
operator was walking.

So: sample coarsely, score every candidate for sharpness, then divide the timeline
into as many buckets as frames we intend to keep and take the sharpest from each.
The bucketing is the part that matters. Taking the globally sharpest N frames
sounds equivalent and is not -- it clusters every pick in whichever few seconds
the operator stood still, which is precisely the coverage a reconstruction cannot
use. Spreading across the timeline preserves the walk-around's viewpoint spread
and only then optimises for sharpness within each slice.
"""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

#: Candidates are scored at this width. Sharpness ranking is stable under
#: downscaling and full-resolution decoding of a few hundred frames is not free.
SCORE_WIDTH = 512

#: Below this, a frame is treated as too blurred to be worth keeping even if it is
#: the best in its bucket. Heuristic, and labelled as such wherever it surfaces --
#: it is not a calibrated threshold and must not be presented as one.
MIN_SHARPNESS = 8.0

FFMPEG_TIMEOUT_S = 900


class FrameExtractionUnavailable(RuntimeError):
    """ffmpeg is not installed, so video cannot contribute frames."""


@dataclass(frozen=True)
class FrameCandidate:
    path: Path
    timestamp_s: float
    sharpness: float


def sharpness(path: Path) -> float:
    """Variance of the Laplacian: the standard cheap focus measure.

    A sharp image has strong second derivatives at edges and therefore high
    variance; a blurred one has the edge energy smeared away. Written against
    numpy directly rather than pulling in OpenCV, which is an M2 dependency.
    """
    try:
        with Image.open(path) as img:
            grey = img.convert("L")
            if grey.width > SCORE_WIDTH:
                height = max(1, round(grey.height * SCORE_WIDTH / grey.width))
                grey = grey.resize((SCORE_WIDTH, height), Image.Resampling.BILINEAR)
            data = np.asarray(grey, dtype=np.float32)
    except Exception:  # noqa: BLE001 - an undecodable candidate scores zero
        return 0.0

    if data.shape[0] < 3 or data.shape[1] < 3:
        return 0.0

    # 4-neighbour Laplacian over the interior, by slicing rather than convolution.
    centre = data[1:-1, 1:-1]
    laplacian = 4.0 * centre - data[:-2, 1:-1] - data[2:, 1:-1] - data[1:-1, :-2] - data[1:-1, 2:]
    return float(laplacian.var())


def _extract_candidates(video: Path, out_dir: Path, sample_fps: float) -> list[Path]:
    exe = shutil.which("ffmpeg")
    if exe is None:
        raise FrameExtractionUnavailable("ffmpeg not found; install it with `brew install ffmpeg`.")

    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = out_dir / "cand_%05d.jpg"
    proc = subprocess.run(  # noqa: S603
        [
            exe,
            "-v",
            "error",
            "-i",
            str(video),
            "-vf",
            f"fps={sample_fps}",
            "-q:v",
            "2",
            str(pattern),
        ],
        capture_output=True,
        text=True,
        timeout=FFMPEG_TIMEOUT_S,
        check=False,
    )
    candidates = sorted(out_dir.glob("cand_*.jpg"))
    if not candidates:
        raise FrameExtractionUnavailable(
            f"ffmpeg produced no frames: {(proc.stderr or '').strip()[:200]}"
        )
    return candidates


def select(
    video: Path,
    out_dir: Path,
    *,
    sample_fps: float = 2.0,
    keep: int = 24,
) -> list[FrameCandidate]:
    """Extract and select representative frames, ordered by timestamp."""
    if keep < 1:
        raise ValueError("keep must be at least 1")

    candidates = _extract_candidates(video, out_dir, sample_fps)
    scored = [
        FrameCandidate(path, index / sample_fps, sharpness(path))
        for index, path in enumerate(candidates)
    ]

    if len(scored) <= keep:
        chosen = [c for c in scored if c.sharpness >= MIN_SHARPNESS] or scored
        return sorted(chosen, key=lambda c: c.timestamp_s)

    # Uniform buckets over candidate index, so viewpoint spread is preserved.
    buckets: list[list[FrameCandidate]] = [[] for _ in range(keep)]
    for index, candidate in enumerate(scored):
        slot = min(keep - 1, index * keep // len(scored))
        buckets[slot].append(candidate)

    selected: list[FrameCandidate] = []
    for bucket in buckets:
        if not bucket:
            continue
        best = max(bucket, key=lambda c: c.sharpness)
        if best.sharpness >= MIN_SHARPNESS:
            selected.append(best)

    # Every bucket blurred is a real outcome, not a bug -- but returning nothing
    # would make the video look like it had no frames at all. Keep the best
    # available and let the coverage report say the input was poor.
    if not selected:
        selected = [max(scored, key=lambda c: c.sharpness)]

    for candidate in scored:
        if candidate not in selected:
            candidate.path.unlink(missing_ok=True)

    return sorted(selected, key=lambda c: c.timestamp_s)
