"""Runtime settings.

Storage is local-filesystem for now and S3 later; the split between `originals`
and `working` exists from the first commit because §5 forbids ever overwriting an
original, and that is far easier to guarantee with two roots than with a
convention inside one.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "storage" / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MACHINE_TWIN_", env_file=".env")

    storage_root: Path = _DEFAULT_ROOT
    database_url: str = ""

    #: Tenant for anything created locally. The column exists from the first
    #: migration even though the tool is single-tenant today: retrofitting a tenant
    #: boundary is how isolation bugs get written, and SkillBridge's own rule is
    #: that org_id is never accepted from a request field.
    default_org_id: str = "local"

    #: Frames sampled per second of video before representative selection. Not the
    #: number kept -- see pipeline.ingest.frames.
    video_sample_fps: float = 2.0
    #: How many frames survive selection, spread across the timeline.
    video_keep_frames: int = 24

    thumbnail_px: int = 512
    max_upload_mb: int = 512

    @property
    def objects_dir(self) -> Path:
        """Content-addressed originals. Write-once; never mutated, never deleted."""
        return self.storage_root / "objects"

    @property
    def working_dir(self) -> Path:
        """Derived artifacts: normalized copies, thumbnails, extracted frames."""
        return self.storage_root / "working"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite:///{self.storage_root / 'machine-twin.db'}"

    def ensure_dirs(self) -> None:
        self.objects_dir.mkdir(parents=True, exist_ok=True)
        self.working_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
