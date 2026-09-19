"""Domain models.

These are the contract the API speaks and the package format serialises. The ORM
mirrors them; it does not replace them, because the published twin package has to
be readable without a database.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class ProjectStatus(StrEnum):
    CREATED = "created"
    INGESTING = "ingesting"
    ANALYZING = "analyzing"
    RECONSTRUCTING = "reconstructing"
    AUTHORING = "authoring"
    REVIEW = "review"
    VALIDATED = "validated"
    PUBLISHED = "published"
    FAILED = "failed"


class AssetKind(StrEnum):
    IMAGE = "image"
    VIDEO = "video"
    CAD = "cad"
    DOCUMENT = "document"
    #: Derived from a video during ingestion. Kept distinct from IMAGE so the
    #: reconstruction stage can report how much of its input was uploaded directly
    #: versus sampled, which changes how coverage should be read.
    FRAME = "frame"


class ValidationStatus(StrEnum):
    """The four-state ladder. There is no path from GENERATED to PUBLISHED."""

    GENERATED = "generated"
    REVIEW_REQUIRED = "review_required"
    VALIDATED = "validated"
    REJECTED = "rejected"


class GeometrySource(StrEnum):
    """How a piece of geometry came to exist. Ranked by trustworthiness, and
    recorded on every artifact so a published twin always says what it is."""

    CAD = "cad"
    PHOTOGRAMMETRY = "photogrammetry"
    OBJECT_CAPTURE = "object_capture"
    AI_GENERATED = "ai_generated"
    MANUAL = "manual"
    HYBRID = "hybrid"


class Stage(StrEnum):
    INGEST = "ingest"
    ANALYZE = "analyze"
    RECONSTRUCT = "reconstruct"
    AUTHOR = "author"
    SEMANTICIZE = "semanticize"
    VALIDATE = "validate"
    PUBLISH = "publish"


class JobState(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    #: Inputs unchanged since the last successful run (§30). Not a failure.
    SKIPPED = "skipped"


# ---------------------------------------------------------------------------


class MachineProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    manufacturer: str | None = None
    model: str | None = None
    machine_type: str | None = None
    description: str | None = None


class MachineProject(BaseModel):
    id: str
    org_id: str
    name: str
    manufacturer: str | None = None
    model: str | None = None
    machine_type: str | None = None
    description: str | None = None
    status: ProjectStatus
    created_at: datetime
    updated_at: datetime

    asset_counts: dict[str, int] = Field(default_factory=dict)


class Asset(BaseModel):
    id: str
    project_id: str
    org_id: str
    kind: AssetKind
    filename: str
    #: Content address of the original. Two uploads of the same bytes share one
    #: stored object; the Asset rows stay distinct.
    sha256: str
    size_bytes: int
    content_type: str
    thumbnail_path: str | None = None
    #: EXIF, page counts, durations, frame provenance. Shape varies by kind.
    meta: dict[str, Any] = Field(default_factory=dict)
    #: Set on assets derived from another (video frames), so nothing in the
    #: pipeline has to guess where a frame came from.
    derived_from: str | None = None
    created_at: datetime


class IngestResult(BaseModel):
    asset: Asset
    #: Frames extracted when the asset was a video. Empty otherwise.
    derived: list[Asset] = Field(default_factory=list)
    #: Non-fatal notes: stripped EXIF, missing ffmpeg, unreadable PDF page.
    warnings: list[str] = Field(default_factory=list)


class StageError(BaseModel):
    """The structured error every stage returns on failure (§28).

    `recoverable` distinguishes "fix the input and retry" from "this project
    cannot proceed", which is what decides whether the UI offers a retry.
    """

    stage: Stage | str
    code: str
    message: str
    recoverable: bool = True
    remediation: str = ""


class CoverageReport(BaseModel):
    """Whether the capture actually covers the machine.

    Surfaced on its own endpoint as well as inside the reconstruction outcome,
    because §8 requires the system to say the capture is insufficient rather than
    silently producing a bad model from it.
    """

    status: str
    fraction: float
    registered: int
    total: int
    recommendation: str
    method: str


class GeometryArtifact(BaseModel):
    id: str
    project_id: str
    path: str
    format: str
    source: GeometrySource
    lod: int = 0
    vertex_count: int = 0
    face_count: int = 0
    confidence: float | None = None
    confidence_method: str
    validation_status: ValidationStatus
    meta: dict[str, Any] = Field(default_factory=dict)


class ReconstructionOutcome(BaseModel):
    job_id: str
    state: JobState
    image_count: int
    coverage: CoverageReport | None = None
    sparse_provider: str | None = None
    mesh_provider: str | None = None
    geometry: GeometryArtifact | None = None
    error: StageError | None = None
    duration_s: float | None = None


class Component(BaseModel):
    id: str
    project_id: str
    stable_id: str
    label: str
    category: str
    confidence: float | None = None
    confidence_method: str
    validation_status: ValidationStatus
    meta: dict[str, Any] = Field(default_factory=dict)


class AuthoringOutcome(BaseModel):
    job_id: str
    state: JobState
    machine_id: str | None = None
    components: list[Component] = Field(default_factory=list)
    lods: list[GeometryArtifact] = Field(default_factory=list)
    poster_path: str | None = None
    error: StageError | None = None
    duration_s: float | None = None
