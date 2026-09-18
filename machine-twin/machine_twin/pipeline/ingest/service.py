"""Ingestion: upload to stored asset.

The stage that guarantees §5's "never overwrite original assets". Originals go to
the content store, which is write-once and read-only on disk; everything derived
here -- thumbnails, extracted frames -- lives under a separate working root and is
regenerable.

A video becomes a parent asset plus a set of FRAME children rather than being
replaced by its frames. The reconstruction stage consumes the frames, but the
provenance chain has to lead back to the upload the operator actually made.
"""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import BinaryIO

from sqlalchemy.orm import Session

from machine_twin.config import Settings
from machine_twin.config import settings as default_settings
from machine_twin.db import AssetRow, MachineProjectRow, new_id
from machine_twin.pipeline.ingest import frames as frames_mod
from machine_twin.pipeline.ingest import metadata as metadata_mod
from machine_twin.pipeline.ingest import thumbnails
from machine_twin.schema.models import Asset, AssetKind, IngestResult
from machine_twin.storage.content_store import ContentStore


def to_model(row: AssetRow) -> Asset:
    return Asset(
        id=row.id,
        project_id=row.project_id,
        org_id=row.org_id,
        kind=AssetKind(row.kind),
        filename=row.filename,
        sha256=row.sha256,
        size_bytes=row.size_bytes,
        content_type=row.content_type,
        thumbnail_path=row.thumbnail_path,
        meta=row.meta or {},
        derived_from=row.derived_from,
        created_at=row.created_at,
    )


class IngestService:
    def __init__(self, config: Settings | None = None) -> None:
        self.settings = config or default_settings
        self.settings.ensure_dirs()
        self.store = ContentStore(self.settings.objects_dir)

    # -- paths ------------------------------------------------------------

    def _thumb_path(self, project_id: str, asset_id: str) -> Path:
        return self.settings.working_dir / project_id / "thumbs" / f"{asset_id}.webp"

    def _frames_dir(self, project_id: str, asset_id: str) -> Path:
        return self.settings.working_dir / project_id / "frames" / asset_id

    # -- ingestion --------------------------------------------------------

    def ingest(
        self,
        session: Session,
        project: MachineProjectRow,
        filename: str,
        stream: BinaryIO,
    ) -> IngestResult:
        """Store one upload and everything derivable from it.

        Raises `UnsupportedAsset` before storing anything, so an unusable file
        never takes up an object slot.
        """
        kind = metadata_mod.classify(filename)
        stored = self.store.put_stream(stream)
        warnings: list[str] = []

        # Read metadata straight from the stored object. It is read-only, which is
        # fine for reading, and a working copy here would be a pure waste on the
        # hot path of a 30-image upload.
        source = stored.path
        meta = metadata_mod.extract(source, kind)
        if "unreadable" in meta:
            warnings.append(f"{filename}: metadata unreadable ({meta['unreadable']})")
        if "probe_unavailable" in meta:
            warnings.append(f"{filename}: {meta['probe_unavailable']}")

        asset_id = new_id()
        thumb = thumbnails.for_asset(
            kind, source, self._thumb_path(project.id, asset_id), max_px=self.settings.thumbnail_px
        )

        row = AssetRow(
            id=asset_id,
            project_id=project.id,
            org_id=project.org_id,
            kind=kind.value,
            filename=filename,
            sha256=stored.sha256,
            size_bytes=stored.size_bytes,
            content_type=metadata_mod.content_type(filename),
            thumbnail_path=str(thumb) if thumb else None,
            meta=meta,
        )
        session.add(row)
        session.flush()

        derived: list[AssetRow] = []
        if kind is AssetKind.VIDEO:
            derived, frame_warnings = self._ingest_frames(session, project, row)
            warnings.extend(frame_warnings)

        return IngestResult(
            asset=to_model(row),
            derived=[to_model(d) for d in derived],
            warnings=warnings,
        )

    def _ingest_frames(
        self,
        session: Session,
        project: MachineProjectRow,
        video: AssetRow,
    ) -> tuple[list[AssetRow], list[str]]:
        """Extract representative frames and register each as its own asset."""
        warnings: list[str] = []
        work_dir = self._frames_dir(project.id, video.id)

        # ffmpeg needs a path with the real extension to pick a demuxer; the stored
        # object is named by its hash. A temporary symlink is cheaper than copying
        # a several-hundred-megabyte video, and avoids writing to the store.
        suffix = Path(video.filename).suffix or ".mp4"
        with tempfile.TemporaryDirectory() as tmp:
            link = Path(tmp) / f"source{suffix}"
            try:
                link.symlink_to(self.store.path_for(video.sha256))
            except OSError:
                link = self.store.copy_out(video.sha256, link)

            try:
                candidates = frames_mod.select(
                    link,
                    work_dir,
                    sample_fps=self.settings.video_sample_fps,
                    keep=self.settings.video_keep_frames,
                )
            except frames_mod.FrameExtractionUnavailable as exc:
                # The video is still a valid asset; it simply contributes no frames.
                warnings.append(f"{video.filename}: {exc}")
                return [], warnings

        rows: list[AssetRow] = []
        for index, candidate in enumerate(candidates):
            stored = self.store.put_file(candidate.path)
            frame_id = new_id()
            meta = metadata_mod.image_metadata(candidate.path)
            meta.update(
                {
                    "frame_index": index,
                    "timestamp_s": round(candidate.timestamp_s, 3),
                    "sharpness": round(candidate.sharpness, 2),
                    # Named so no reader mistakes this for a calibrated measure (§17).
                    "sharpness_method": "laplacian_variance_heuristic",
                    "source_video_asset": video.id,
                }
            )
            thumb = thumbnails.generate(
                candidate.path,
                self._thumb_path(project.id, frame_id),
                max_px=self.settings.thumbnail_px,
            )
            row = AssetRow(
                id=frame_id,
                project_id=project.id,
                org_id=project.org_id,
                kind=AssetKind.FRAME.value,
                filename=f"{Path(video.filename).stem}_f{index:04d}.jpg",
                sha256=stored.sha256,
                size_bytes=stored.size_bytes,
                content_type="image/jpeg",
                thumbnail_path=str(thumb) if thumb else None,
                meta=meta,
                derived_from=video.id,
            )
            session.add(row)
            rows.append(row)

        # The video's own thumbnail is its first kept frame -- the only preview it
        # can have, and it is now guaranteed to be one of the sharper ones.
        if rows and rows[0].thumbnail_path and not video.thumbnail_path:
            video.thumbnail_path = rows[0].thumbnail_path

        video.meta = {**(video.meta or {}), "frames_extracted": len(rows)}
        session.flush()
        return rows, warnings
