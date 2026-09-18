"""The authoring stage: reconstruction output to a browser-ready package.

Takes the mesh the reconstruction stage produced and turns it into what a viewer
can actually load -- cleaned, separated into whatever components exist, given
stable ids, decimated to three levels of detail, exported as GLB, with a poster
for the 2D fallback path.

Depends on a successful reconstruction, and says so rather than silently
producing nothing: §29 makes stages independently rerunnable, which means each one
has to state its own preconditions.
"""

from __future__ import annotations

import time
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from machine_twin.config import Settings
from machine_twin.config import settings as default_settings
from machine_twin.db import ComponentRow, GeometryArtifactRow, MachineProjectRow, new_id
from machine_twin.pipeline.authoring.blender import BlenderAuthoringProvider, BlenderError
from machine_twin.pipeline.jobs import StageFailure, cached, input_hash, record_metrics, run_stage
from machine_twin.schema.models import (
    AuthoringOutcome,
    Component,
    GeometryArtifact,
    GeometrySource,
    JobState,
    ProjectStatus,
    Stage,
    StageError,
    ValidationStatus,
)

GLB_FORMAT = "glb"


def _to_component(row: ComponentRow) -> Component:
    return Component(
        id=row.id,
        project_id=row.project_id,
        stable_id=row.stable_id,
        label=row.label,
        category=row.category,
        confidence=row.confidence,
        confidence_method=row.confidence_method,
        validation_status=ValidationStatus(row.validation_status),
        meta=row.meta or {},
    )


def _to_artifact(row: GeometryArtifactRow) -> GeometryArtifact:
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


class AuthoringService:
    def __init__(
        self,
        config: Settings | None = None,
        provider: BlenderAuthoringProvider | None = None,
    ) -> None:
        self.settings = config or default_settings
        self.provider = provider or BlenderAuthoringProvider()

    def _source(self, session: Session, project_id: str) -> GeometryArtifactRow:
        """The most recent reconstruction output.

        Filtered to lod 0 and non-GLB: rerunning authoring must consume the
        reconstruction's mesh again, not the GLB a previous authoring run wrote.
        """
        row = session.execute(
            select(GeometryArtifactRow)
            .where(
                GeometryArtifactRow.project_id == project_id,
                GeometryArtifactRow.format != GLB_FORMAT,
                GeometryArtifactRow.lod == 0,
            )
            .order_by(GeometryArtifactRow.created_at.desc())
            .limit(1)
        ).scalar_one_or_none()

        if row is None:
            raise StageFailure(
                StageError(
                    stage=Stage.AUTHOR,
                    code="NO_RECONSTRUCTION",
                    message="This project has no reconstructed mesh to author.",
                    remediation="Run the reconstruct stage first.",
                )
            )
        if not Path(row.path).is_file():
            raise StageFailure(
                StageError(
                    stage=Stage.AUTHOR,
                    code="RECONSTRUCTION_MISSING",
                    message=f"The recorded mesh is gone from disk: {row.path}",
                    remediation="Re-run the reconstruct stage with force=true.",
                )
            )
        return row

    def _out_dir(self, project_id: str) -> Path:
        return self.settings.working_dir / project_id / "authoring"

    def run(
        self,
        session: Session,
        project: MachineProjectRow,
        *,
        force: bool = False,
    ) -> AuthoringOutcome:
        source = self._source(session, project.id)
        digest = input_hash([source.id, self.provider.name])

        if not force:
            previous = cached(session, project.id, Stage.AUTHOR, digest)
            if previous is not None:
                return AuthoringOutcome(
                    job_id=previous.id,
                    state=JobState.SKIPPED,
                    machine_id=(previous.metrics or {}).get("machine_id"),
                    components=self.components(session, project.id),
                    lods=self.glb_artifacts(session, project.id),
                    poster_path=(previous.metrics or {}).get("poster_path"),
                )

        started = time.monotonic()
        with run_stage(session, project, Stage.AUTHOR, digest) as job:
            project.status = ProjectStatus.AUTHORING.value
            out_dir = self._out_dir(project.id)

            try:
                result = self.provider.author(Path(source.path), out_dir, project.id)
            except BlenderError as exc:
                raise StageFailure(
                    StageError(
                        stage=Stage.AUTHOR,
                        code="AUTHORING_FAILED",
                        message=str(exc),
                        remediation="Check that Blender is installed and the mesh is readable.",
                    )
                ) from exc

            # Replace rather than accumulate: a rerun re-derives components from the
            # same mesh, and keeping the previous run's rows would duplicate every
            # stable id and break the one-id-one-part invariant the hotspots need.
            for stale in session.execute(
                select(ComponentRow).where(ComponentRow.project_id == project.id)
            ).scalars():
                session.delete(stale)
            for stale_art in session.execute(
                select(GeometryArtifactRow).where(
                    GeometryArtifactRow.project_id == project.id,
                    GeometryArtifactRow.format == GLB_FORMAT,
                )
            ).scalars():
                session.delete(stale_art)
            session.flush()

            for entry in result.components:
                session.add(
                    ComponentRow(
                        id=new_id(),
                        project_id=project.id,
                        org_id=project.org_id,
                        stable_id=str(entry["stable_id"]),
                        label=str(entry.get("label", "unknown_component")),
                        category=str(entry.get("category", "unknown")),
                        # No confidence: separation by connected geometry is not a
                        # classifier and produces nothing to be confident about.
                        confidence=None,
                        confidence_method="not_estimated",
                        validation_status=ValidationStatus.REVIEW_REQUIRED.value,
                        meta={
                            "vertex_count": entry.get("vertex_count"),
                            "face_count": entry.get("face_count"),
                            "dimensions": entry.get("dimensions"),
                            "separation_method": "loose_geometry",
                        },
                    )
                )

            for lod in result.lods:
                path = out_dir / str(lod["file"])
                session.add(
                    GeometryArtifactRow(
                        id=new_id(),
                        project_id=project.id,
                        org_id=project.org_id,
                        path=str(path),
                        format=GLB_FORMAT,
                        # The GLB inherits the provenance of the mesh it came from.
                        # Authoring reshapes geometry; it does not originate it.
                        source=source.source,
                        lod=int(lod["lod"]),
                        vertex_count=int(lod.get("vertex_count", 0)),
                        face_count=int(lod.get("face_count", 0)),
                        confidence=None,
                        confidence_method="not_reported_by_provider",
                        validation_status=ValidationStatus.GENERATED.value,
                        meta={
                            "decimation_ratio": lod.get("ratio"),
                            "texture_scale": lod.get("texture_scale"),
                            "size_bytes": lod.get("size_bytes"),
                            "derived_from_artifact": source.id,
                            "authoring_provider": self.provider.name,
                        },
                    )
                )

            session.flush()

            poster_path = str(out_dir / result.poster) if result.poster else None
            duration = time.monotonic() - started
            record_metrics(
                job,
                machine_id=result.machine_id,
                component_count=len(result.components),
                poster_path=poster_path,
                duration_s=round(duration, 2),
            )
            project.status = ProjectStatus.REVIEW.value

            return AuthoringOutcome(
                job_id=job.id,
                state=JobState.SUCCEEDED,
                machine_id=result.machine_id,
                components=self.components(session, project.id),
                lods=self.glb_artifacts(session, project.id),
                poster_path=poster_path,
                duration_s=round(duration, 2),
            )

    def components(self, session: Session, project_id: str) -> list[Component]:
        rows = (
            session.execute(
                select(ComponentRow)
                .where(ComponentRow.project_id == project_id)
                .order_by(ComponentRow.stable_id)
            )
            .scalars()
            .all()
        )
        return [_to_component(row) for row in rows]

    def glb_artifacts(self, session: Session, project_id: str) -> list[GeometryArtifact]:
        rows = (
            session.execute(
                select(GeometryArtifactRow)
                .where(
                    GeometryArtifactRow.project_id == project_id,
                    GeometryArtifactRow.format == GLB_FORMAT,
                )
                .order_by(GeometryArtifactRow.lod)
            )
            .scalars()
            .all()
        )
        return [_to_artifact(row) for row in rows]
