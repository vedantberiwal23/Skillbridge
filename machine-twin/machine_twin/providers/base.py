"""Provider protocols.

Structural typing (`Protocol`) rather than inheritance: an adapter wrapping a
subprocess, an HTTP model and an in-repo fixture have nothing in common to inherit
from, and the fixture implementations the tests run against must not have to import
the real dependency to satisfy a base class.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class Detection:
    """One component candidate from the vision stage.

    `label` is deliberately allowed to be `unknown_component`: a COCO-class detector
    has no notion of a pressure relief valve, so below-threshold regions are named
    as unknown rather than given the nearest plausible identity. §6 of the brief
    forbids inventing an identity from weak evidence.
    """

    label: str
    category: str
    confidence: float
    #: How `confidence` was produced. Stored alongside the number because an
    #: uncalibrated score presented as a probability is fake precision (§17).
    confidence_method: str
    bbox: tuple[int, int, int, int]
    source_image: str
    mask_ref: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OCRLine:
    text: str
    confidence: float
    bbox: tuple[int, int, int, int]
    source_image: str


@dataclass(frozen=True)
class SparseResult:
    """Output of structure-from-motion: camera poses and a sparse cloud."""

    sparse_path: Path
    registered_images: int
    total_images: int
    mean_reprojection_error: float | None = None

    @property
    def coverage(self) -> float:
        if self.total_images == 0:
            return 0.0
        return self.registered_images / self.total_images


@dataclass(frozen=True)
class MeshResult:
    mesh_path: Path
    #: One of the `geometry_artifact.source` values. Carried through to
    #: provenance.json so a published twin always says how its geometry was made.
    source: str
    vertex_count: int
    face_count: int
    confidence_method: str = "heuristic"


@runtime_checkable
class VisionProvider(Protocol):
    def detect(self, image: Path) -> list[Detection]: ...

    def segment(self, image: Path, detections: list[Detection]) -> list[Detection]: ...

    def ocr(self, image: Path) -> list[OCRLine]: ...


@runtime_checkable
class SparseProvider(Protocol):
    """Structure-from-motion: photographs in, camera poses out.

    CPU work that runs on any platform, which is why it is separated from mesh
    generation -- a host can support this and not that. It is also the only stage
    that can answer whether the capture actually covers the machine, because it is
    the one that knows which images failed to register.
    """

    name: str

    def sparse(self, images: list[Path], workspace: Path) -> SparseResult: ...


@runtime_checkable
class MeshProvider(Protocol):
    """Poses and photographs in, surface geometry out.

    Takes the images as well as the sparse result because the two real backends
    disagree about what they need: a COLMAP dense stage consumes the sparse
    reconstruction, while Apple's PhotogrammetrySession runs its own SfM
    internally and wants only the image directory. Passing both, and letting each
    provider ignore what it does not use, is the honest shape -- the alternative
    is a sparse result threaded into a provider that discards it.
    """

    name: str
    #: Recorded on the artifact so a published twin always says how it was made.
    source: str

    def mesh(
        self,
        images: list[Path],
        sparse: SparseResult | None,
        workspace: Path,
    ) -> MeshResult: ...


@runtime_checkable
class DocumentProvider(Protocol):
    def extract(self, document: Path) -> list[dict[str, Any]]:
        """Return page-scoped chunks.

        Every chunk carries its page number. §15: document page provenance is never
        lost, because a procedure the worker cannot trace back to a page in their
        own SOP is not usable as a safety instruction.
        """
        ...


@runtime_checkable
class LLMProvider(Protocol):
    def complete(self, system: str, user: str, *, max_tokens: int = 2048) -> str: ...


@runtime_checkable
class GeometryProcessor(Protocol):
    def decimate(self, mesh: Path, target_faces: int, out: Path) -> Path: ...

    def export_glb(self, mesh: Path, out: Path, *, draco: bool = True) -> Path: ...
