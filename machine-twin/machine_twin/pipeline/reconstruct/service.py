"""The reconstruction stage.

Images in, mesh out -- with two gates that exist to stop the pipeline producing
geometry nobody should trust:

1.  Too few images is rejected before any work happens.
2.  Poor registration stops the stage. §8 forbids claiming accurate reconstruction
    when coverage is poor, and §28 forbids continuing past a failed stage, so a
    capture that only half registers produces a recommendation, not a mesh.

Sparse and mesh come from different providers because they have different
requirements: COLMAP's sparse stage runs on CPU anywhere, while its dense stage
needs CUDA that macOS does not have. The mesh backend is therefore chosen from the
capability report at runtime rather than imported at the call site.
"""

from __future__ import annotations

import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from machine_twin.capabilities import DependencyUnavailable, get_report, select_mesh_provider
from machine_twin.config import Settings
from machine_twin.config import settings as default_settings
from machine_twin.db import AssetRow, GeometryArtifactRow, MachineProjectRow, new_id
from machine_twin.pipeline.jobs import StageFailure, cached, input_hash, record_metrics, run_stage
from machine_twin.pipeline.reconstruct import coverage as coverage_mod
from machine_twin.pipeline.reconstruct.colmap import ColmapError, ColmapSparseProvider
from machine_twin.pipeline.reconstruct.object_capture import (
    ObjectCaptureError,
    ObjectCaptureMeshProvider,
)
from machine_twin.pipeline.reconstruct.workspace import Workspace, stage_images
from machine_twin.providers import MeshProvider, SparseProvider
from machine_twin.schema.models import (
    AssetKind,
    CoverageReport,
    GeometryArtifact,
    GeometrySource,
    JobState,
    ProjectStatus,
    ReconstructionOutcome,
    Stage,
    StageError,
    ValidationStatus,
)
from machine_twin.storage.content_store import ContentStore

#: Asset kinds that can feed photogrammetry. Frames count: a walk-around video is
#: a legitimate capture, and by this point selection has already discarded the
#: blurred majority.
RECONSTRUCTABLE = (AssetKind.IMAGE.value, AssetKind.FRAME.value)

MESH_PROVIDERS: dict[str, type[MeshProvider]] = {
    "object_capture": ObjectCaptureMeshProvider,
}


def _to_report(cov: coverage_mod.Coverage) -> CoverageReport:
    return CoverageReport(
        status=cov.status.value,
        fraction=round(cov.fraction, 4),
        registered=cov.registered,
        total=cov.total,
        recommendation=cov.recommendation,
        method=cov.method,
    )


class ReconstructionService:
    def __init__(
        self,
        config: Settings | None = None,
        sparse_provider: SparseProvider | None = None,
    ) -> None:
        self.settings = config or default_settings
        self.store = ContentStore(self.settings.objects_dir)
        self.sparse_provider = sparse_provider or ColmapSparseProvider()

    # -- providers --------------------------------------------------------

    def resolve_mesh_provider(self) -> MeshProvider:
        """Pick the mesh backend this host can run.

        Raises rather than falling back to a stub: a host with no usable backend
        has no mesh path, and the stage must say so.
        """
        report = get_report()
        name = select_mesh_provider(report)
        if name is None:
            raise StageFailure(
                StageError(
                    stage=Stage.RECONSTRUCT,
                    code="NO_MESH_PROVIDER",
                    message="No mesh backend is available on this host.",
                    recoverable=True,
                    remediation=(
                        "On macOS run `make build-object-capture`. Elsewhere, install "
                        "a CUDA-capable COLMAP. See GET /capabilities."
                    ),
                )
            )
        factory = MESH_PROVIDERS.get(name)
        if factory is None:
            raise StageFailure(
                StageError(
                    stage=Stage.RECONSTRUCT,
                    code="MESH_PROVIDER_NOT_IMPLEMENTED",
                    message=f"Capability report selected {name!r}, which has no adapter yet.",
                    recoverable=False,
                )
            )
        return factory()

    # -- inputs -----------------------------------------------------------

    def _assets(self, session: Session, project_id: str) -> list[AssetRow]:
        return list(
            session.execute(
                select(AssetRow)
                .where(AssetRow.project_id == project_id, AssetRow.kind.in_(RECONSTRUCTABLE))
                .order_by(AssetRow.created_at)
            )
            .scalars()
            .all()
        )

    def _workspace(self, project_id: str) -> Workspace:
        return Workspace(self.settings.working_dir / project_id / "reconstruction")

    # -- the stage --------------------------------------------------------

    def run(
        self,
        session: Session,
        project: MachineProjectRow,
        *,
        force: bool = False,
    ) -> ReconstructionOutcome:
        assets = self._assets(session, project.id)
        mesh_provider = self.resolve_mesh_provider()

        digest = input_hash(
            [a.sha256 for a in assets] + [self.sparse_provider.name, mesh_provider.name]
        )

        if not force:
            previous = cached(session, project.id, Stage.RECONSTRUCT, digest)
            if previous is not None:
                # §30: unchanged inputs are not recomputed. Reported as SKIPPED
                # rather than silently returning a stale success, so the operator
                # can see why nothing ran.
                return ReconstructionOutcome(
                    job_id=previous.id,
                    state=JobState.SKIPPED,
                    image_count=len(assets),
                    coverage=CoverageReport(**previous.metrics["coverage"])
                    if previous.metrics.get("coverage")
                    else None,
                    sparse_provider=self.sparse_provider.name,
                    mesh_provider=mesh_provider.name,
                    geometry=self._latest_geometry(session, project.id),
                )

        started = time.monotonic()
        with run_stage(session, project, Stage.RECONSTRUCT, digest) as job:
            project.status = ProjectStatus.RECONSTRUCTING.value

            undersized = coverage_mod.too_few_images(len(assets))
            if undersized is not None:
                record_metrics(job, coverage=_to_report(undersized).model_dump())
                raise StageFailure(
                    StageError(
                        stage=Stage.RECONSTRUCT,
                        code="INSUFFICIENT_IMAGE_COUNT",
                        message=undersized.recommendation,
                        remediation=undersized.recommendation,
                    )
                )

            work = self._workspace(project.id)
            work.reset()
            staged = stage_images(self.store, [(a.sha256, a.filename) for a in assets], work.images)

            try:
                sparse = self.sparse_provider.sparse(staged, work.root)
            except ColmapError as exc:
                raise StageFailure(
                    StageError(
                        stage=Stage.RECONSTRUCT,
                        code="SPARSE_RECONSTRUCTION_FAILED",
                        message=f"{exc.step} failed: {exc.message}",
                        remediation="Check that COLMAP is installed and the images are readable.",
                    )
                ) from exc
            except DependencyUnavailable as exc:
                raise StageFailure(StageError(**exc.as_error(Stage.RECONSTRUCT.value))) from exc

            cov = coverage_mod.assess(sparse)
            record_metrics(
                job,
                coverage=_to_report(cov).model_dump(),
                registered_images=sparse.registered_images,
                mean_reprojection_error=sparse.mean_reprojection_error,
            )

            if not cov.usable:
                # The stage stops here. Producing a mesh from a capture this poor
                # would be exactly the fabricated output §38 forbids.
                raise StageFailure(
                    StageError(
                        stage=Stage.RECONSTRUCT,
                        code="INSUFFICIENT_CAMERA_COVERAGE",
                        message=(
                            f"Registered {sparse.registered_images} of {sparse.total_images} "
                            f"images ({cov.fraction:.0%})."
                        ),
                        remediation=cov.recommendation,
                    )
                )

            try:
                mesh = mesh_provider.mesh(staged, sparse, work.root)
            except ObjectCaptureError as exc:
                raise StageFailure(
                    StageError(
                        stage=Stage.RECONSTRUCT,
                        code="MESH_GENERATION_FAILED",
                        message=str(exc),
                        remediation="Review the coverage report and recapture if needed.",
                    )
                ) from exc

            artifact = GeometryArtifactRow(
                id=new_id(),
                project_id=project.id,
                org_id=project.org_id,
                path=str(mesh.mesh_path),
                format=mesh.mesh_path.suffix.lstrip(".") or "usdz",
                source=mesh.source,
                vertex_count=mesh.vertex_count,
                face_count=mesh.face_count,
                # No confidence value: neither backend reports a calibrated one, and
                # inventing a number here is precisely the fake precision §17 bans.
                confidence=None,
                confidence_method=mesh.confidence_method,
                validation_status=ValidationStatus.GENERATED.value,
                meta={
                    "sparse_provider": self.sparse_provider.name,
                    "mesh_provider": mesh_provider.name,
                    "registered_images": sparse.registered_images,
                    "total_images": sparse.total_images,
                    "coverage_method": cov.method,
                },
            )
            session.add(artifact)
            session.flush()

            duration = time.monotonic() - started
            record_metrics(job, duration_s=round(duration, 2), mesh_path=str(mesh.mesh_path))
            project.status = ProjectStatus.REVIEW.value

            return ReconstructionOutcome(
                job_id=job.id,
                state=JobState.SUCCEEDED,
                image_count=len(assets),
                coverage=_to_report(cov),
                sparse_provider=self.sparse_provider.name,
                mesh_provider=mesh_provider.name,
                geometry=_to_geometry(artifact),
                duration_s=round(duration, 2),
            )

    def _latest_geometry(self, session: Session, project_id: str) -> GeometryArtifact | None:
        row = session.execute(
            select(GeometryArtifactRow)
            .where(GeometryArtifactRow.project_id == project_id)
            .order_by(GeometryArtifactRow.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        return _to_geometry(row) if row else None


def _to_geometry(row: GeometryArtifactRow) -> GeometryArtifact:
    return GeometryArtifact(
        id=row.id,
        project_id=row.project_id,
        path=row.path,
        format=row.format,
        source=GeometrySource(row.source),
        lod=row.lod,
        vertex_count=row.vertex_count,
        face_count=row.face_count,
        confidence=row.confidence,
        confidence_method=row.confidence_method,
        validation_status=ValidationStatus(row.validation_status),
        meta=row.meta or {},
    )


__all__ = ["ReconstructionService", "Workspace", "Path"]
