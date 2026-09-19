"""Capture coverage assessment.

§8: "The system should detect insufficient image coverage" and "Do NOT claim
accurate reconstruction when coverage is poor."

Coverage is measured as the fraction of submitted images that structure-from-motion
managed to register. That is a genuine signal and not a proxy: an image fails to
register when it shares too few matched features with the rest of the set, which is
exactly what a gap in the walk-around looks like. It does not tell us *which*
direction is missing -- that needs the pose distribution, and is honest future work
rather than something to fake now.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from machine_twin.providers import SparseResult

#: Below this many images, a reconstruction is not worth attempting.
#:
#: Measured, not guessed. On the synthetic fixture, holding everything else equal:
#:
#:     24 views (15 deg apart), 960x720  ->   7/24 registered
#:     24 views (15 deg apart), 800x600  ->   7/24 registered
#:     36 views (10 deg apart), 800x600  ->  36/36 registered
#:
#: So what governs registration is the *angular step between consecutive views*,
#: not resolution and not raw image count. Doubling the pixels changed nothing;
#: closing the gap from 15 to 10 degrees took it from failing to perfect. An
#: earlier version of this file set the floor at 12 and advised "one every 15
#: degrees" -- both were well inside the range that does not reconstruct.
#:
#: One synthetic object is indicative, not universal; a glossier or less textured
#: subject will need more. The floor is therefore a refusal threshold, and the
#: recommendation asks for the spacing actually observed to work.
MIN_IMAGES = 24

#: Full-orbit target in the operator guidance: 10 degrees between views.
RECOMMENDED_IMAGES = 36

#: Registration fractions. Heuristic thresholds, labelled as such wherever they
#: surface: they are chosen from how COLMAP behaves on typical object captures,
#: not derived from a calibrated study of this pipeline's inputs.
GOOD = 0.85
USABLE = 0.70


class CoverageStatus(StrEnum):
    GOOD = "good"
    USABLE = "usable"
    INSUFFICIENT = "insufficient"


@dataclass(frozen=True)
class Coverage:
    status: CoverageStatus
    fraction: float
    registered: int
    total: int
    recommendation: str
    #: Named so no reader mistakes the thresholds for calibrated values (§17).
    method: str = "registration_ratio_heuristic"

    @property
    def usable(self) -> bool:
        return self.status is not CoverageStatus.INSUFFICIENT


def too_few_images(count: int) -> Coverage | None:
    """Reject an undersized set before spending an hour matching it."""
    if count >= MIN_IMAGES:
        return None
    return Coverage(
        status=CoverageStatus.INSUFFICIENT,
        fraction=0.0,
        registered=0,
        total=count,
        recommendation=(
            f"Only {count} images supplied; at least {MIN_IMAGES} are needed, and "
            f"about {RECOMMENDED_IMAGES} gives a reliable result. Walk a full circle "
            "around the machine taking one photograph roughly every 10 degrees, "
            "keeping the whole machine in frame and overlapping each view heavily "
            "with the last."
        ),
    )


def assess(result: SparseResult) -> Coverage:
    fraction = result.coverage
    unregistered = result.total_images - result.registered_images

    if result.registered_images == 0:
        return Coverage(
            CoverageStatus.INSUFFICIENT,
            0.0,
            0,
            result.total_images,
            "No images could be registered. The photographs may not overlap, or the "
            "subject may be too featureless or reflective for photogrammetry. "
            f"Re-shoot with more overlap: about {RECOMMENDED_IMAGES} views, "
            "one roughly every 10 degrees.",
        )

    if fraction >= GOOD:
        return Coverage(
            CoverageStatus.GOOD,
            fraction,
            result.registered_images,
            result.total_images,
            f"{result.registered_images} of {result.total_images} images registered.",
        )

    if fraction >= USABLE:
        return Coverage(
            CoverageStatus.USABLE,
            fraction,
            result.registered_images,
            result.total_images,
            f"{unregistered} of {result.total_images} images failed to register. "
            "The reconstruction will proceed but may have gaps. Add views around the "
            "unregistered angles; consecutive photographs should be about 10 degrees "
            "apart.",
        )

    return Coverage(
        CoverageStatus.INSUFFICIENT,
        fraction,
        result.registered_images,
        result.total_images,
        f"Only {result.registered_images} of {result.total_images} images registered "
        f"({fraction:.0%}). Capture additional overlapping images -- consecutive "
        "photographs about 10 degrees apart, roughly "
        f"{RECOMMENDED_IMAGES} for a full orbit.",
    )
