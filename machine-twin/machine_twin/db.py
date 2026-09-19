"""Persistence.

SQLite now, Postgres at M6 when the semantic graph and pgvector arrive. Going
through SQLAlchemy from the first commit is what makes that a URL change rather
than a rewrite.

`org_id` is on every table from this first schema. The tool is single-tenant and
local today; adding a tenant column to a populated database later is how isolation
bugs get written, and the value is always resolved server-side, never read from a
request field.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from machine_twin.config import settings
from machine_twin.schema.models import (
    AssetKind,
    JobState,
    ProjectStatus,
    Stage,
    ValidationStatus,
)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class MachineProjectRow(Base):
    __tablename__ = "machine_project"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    org_id: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(200))
    manufacturer: Mapped[str | None] = mapped_column(String(200), default=None)
    model: Mapped[str | None] = mapped_column(String(200), default=None)
    machine_type: Mapped[str | None] = mapped_column(String(200), default=None)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    status: Mapped[str] = mapped_column(String(32), default=ProjectStatus.CREATED.value)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AssetRow(Base):
    __tablename__ = "asset"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("machine_project.id", ondelete="CASCADE"), index=True
    )
    org_id: Mapped[str] = mapped_column(String(64), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    filename: Mapped[str] = mapped_column(String(512))
    # Not unique: the same bytes can legitimately be an asset of two projects, and
    # each carries its own provenance chain.
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    content_type: Mapped[str] = mapped_column(String(128))
    thumbnail_path: Mapped[str | None] = mapped_column(String(1024), default=None)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    derived_from: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("asset.id", ondelete="CASCADE"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JobRow(Base):
    """One run of one pipeline stage.

    `input_hash` is the cache key §30 asks for: a stage whose inputs are unchanged
    since its last success is skipped rather than recomputed. Storing it per job
    rather than per project is what makes stages independently rerunnable (§29).
    """

    __tablename__ = "job"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("machine_project.id", ondelete="CASCADE"), index=True
    )
    org_id: Mapped[str] = mapped_column(String(64), index=True)
    stage: Mapped[str] = mapped_column(String(32))
    state: Mapped[str] = mapped_column(String(16), default=JobState.PENDING.value)
    input_hash: Mapped[str | None] = mapped_column(String(64), default=None, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    # Structured, never a flattened string: the remediation has to survive to the UI.
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON, default=None)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class ComponentRow(Base):
    """One identified part of a machine.

    `stable_id` is the identity SkillBridge consumes: it becomes `AssetHotspot.id`
    in the published package, so tapping a part in the viewer resolves here. It is
    minted once at first detection and never regenerated -- renaming a component
    in review changes its `label`, never its id, because a changed id silently
    breaks every hotspot, document link and assessment that referenced it.
    """

    __tablename__ = "component"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("machine_project.id", ondelete="CASCADE"), index=True
    )
    org_id: Mapped[str] = mapped_column(String(64), index=True)
    stable_id: Mapped[str] = mapped_column(String(64), index=True)
    label: Mapped[str] = mapped_column(String(200), default="unknown_component")
    category: Mapped[str] = mapped_column(String(64), default="unknown")
    parent_id: Mapped[str | None] = mapped_column(String(32), default=None)
    confidence: Mapped[float | None] = mapped_column(Float, default=None)
    confidence_method: Mapped[str] = mapped_column(String(64), default="not_estimated")
    validation_status: Mapped[str] = mapped_column(
        String(24), default=ValidationStatus.GENERATED.value
    )
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class GeometryArtifactRow(Base):
    """One piece of geometry and its provenance.

    `source` and `validation_status` are not optional metadata. A published twin
    must always be able to say how each piece of its geometry came to exist and
    who confirmed it, and geometry that enters the system without those fields set
    is geometry that can later be mistaken for engineering truth.
    """

    __tablename__ = "geometry_artifact"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("machine_project.id", ondelete="CASCADE"), index=True
    )
    org_id: Mapped[str] = mapped_column(String(64), index=True)
    component_id: Mapped[str | None] = mapped_column(String(32), default=None, index=True)
    path: Mapped[str] = mapped_column(String(1024))
    format: Mapped[str] = mapped_column(String(16))
    source: Mapped[str] = mapped_column(String(32))
    lod: Mapped[int] = mapped_column(Integer, default=0)
    vertex_count: Mapped[int] = mapped_column(Integer, default=0)
    face_count: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float | None] = mapped_column(Float, default=None)
    confidence_method: Mapped[str] = mapped_column(String(64), default="heuristic")
    validation_status: Mapped[str] = mapped_column(
        String(24), default=ValidationStatus.GENERATED.value
    )
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


_engine = None
_SessionFactory: sessionmaker[Session] | None = None


def get_engine() -> Any:
    global _engine
    if _engine is None:
        settings.ensure_dirs()
        _engine = create_engine(settings.resolved_database_url, future=True)
    return _engine


def init_db() -> None:
    Base.metadata.create_all(get_engine())


@contextmanager
def session_scope() -> Iterator[Session]:
    global _SessionFactory
    if _SessionFactory is None:
        _SessionFactory = sessionmaker(bind=get_engine(), expire_on_commit=False, future=True)
    session = _SessionFactory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_engine() -> None:
    """Drop cached engine and session factory.

    Tests point `settings.storage_root` at a tmp_path per test; without this the
    first engine would pin every later test to the first test's database file.
    """
    global _engine, _SessionFactory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionFactory = None


__all__ = [
    "AssetKind",
    "AssetRow",
    "Base",
    "ComponentRow",
    "GeometryArtifactRow",
    "JobRow",
    "JobState",
    "MachineProjectRow",
    "ProjectStatus",
    "ValidationStatus",
    "Stage",
    "init_db",
    "new_id",
    "reset_engine",
    "session_scope",
    "utcnow",
]
