"""Stage execution bookkeeping.

Every stage runs inside a job row so §29 (independently rerunnable stages) and
§30 (skip when inputs are unchanged) have somewhere to live, and so a failure is
recorded as structured data rather than only raised.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from machine_twin.db import JobRow, MachineProjectRow, new_id, utcnow
from machine_twin.schema.models import JobState, ProjectStatus, Stage, StageError


class StageFailure(Exception):
    """A stage failed for a reason the operator can act on.

    Carries a `StageError` rather than a message so the code and remediation reach
    the API response intact -- §28's point is that a caller can tell "add more
    photographs" apart from "install COLMAP", and a flattened string cannot.
    """

    def __init__(self, error: StageError) -> None:
        self.error = error
        super().__init__(error.message)


def input_hash(parts: list[str]) -> str:
    """A stable digest of a stage's inputs.

    Sorted first: the same asset set must hash identically regardless of upload
    order, or the cache never hits.
    """
    digest = hashlib.sha256()
    for part in sorted(parts):
        digest.update(part.encode())
        digest.update(b"\x00")
    return digest.hexdigest()


def last_success(session: Session, project_id: str, stage: Stage) -> JobRow | None:
    return session.execute(
        select(JobRow)
        .where(
            JobRow.project_id == project_id,
            JobRow.stage == stage.value,
            JobRow.state == JobState.SUCCEEDED.value,
        )
        .order_by(JobRow.started_at.desc())
        .limit(1)
    ).scalar_one_or_none()


def cached(session: Session, project_id: str, stage: Stage, digest: str) -> JobRow | None:
    """The previous successful run, when this stage's inputs are unchanged."""
    previous = last_success(session, project_id, stage)
    if previous is not None and previous.input_hash == digest:
        return previous
    return None


@contextmanager
def run_stage(
    session: Session,
    project: MachineProjectRow,
    stage: Stage,
    digest: str | None = None,
) -> Iterator[JobRow]:
    """Record one run of one stage.

    A `StageFailure` is recorded and re-raised: the caller still needs to stop, and
    §28 forbids continuing past a failed stage -- but the reason has to survive in
    the job history whether or not anyone is listening to the exception.
    """
    job = JobRow(
        id=new_id(),
        project_id=project.id,
        org_id=project.org_id,
        stage=stage.value,
        state=JobState.RUNNING.value,
        input_hash=digest,
        metrics={},
    )
    session.add(job)
    session.flush()

    try:
        yield job
    except StageFailure as failure:
        job.state = JobState.FAILED.value
        job.error = failure.error.model_dump(mode="json")
        job.ended_at = utcnow()
        project.status = ProjectStatus.FAILED.value
        session.flush()
        raise
    except Exception as exc:
        # Unexpected failures are recorded too, marked as such. An unhandled
        # exception that leaves no job row is a stage that appears never to have run.
        job.state = JobState.FAILED.value
        job.error = StageError(
            stage=stage,
            code="UNEXPECTED_ERROR",
            message=f"{type(exc).__name__}: {exc}",
            recoverable=False,
        ).model_dump(mode="json")
        job.ended_at = utcnow()
        project.status = ProjectStatus.FAILED.value
        session.flush()
        raise
    else:
        job.state = JobState.SUCCEEDED.value
        job.ended_at = utcnow()
        session.flush()


def record_metrics(job: JobRow, **metrics: Any) -> None:
    job.metrics = {**(job.metrics or {}), **metrics}
