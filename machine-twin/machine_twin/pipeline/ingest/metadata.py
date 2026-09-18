"""Asset type detection and metadata extraction.

Metadata is extracted at ingest because later stages depend on it and reopening
every original to ask again is wasteful -- but also because some of it is the
reconstruction stage's input, not decoration. EXIF focal length and camera model
tell COLMAP whether images share an intrinsic model; orientation decides whether a
photograph is rotated before feature extraction.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from machine_twin.schema.models import AssetKind

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".webp"}
VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".mkv"}
CAD_SUFFIXES = {".step", ".stp", ".iges", ".igs", ".stl", ".obj"}
DOCUMENT_SUFFIXES = {".pdf"}

_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".heic": "image/heic",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".pdf": "application/pdf",
    ".step": "model/step",
    ".stp": "model/step",
    ".iges": "model/iges",
    ".igs": "model/iges",
    ".stl": "model/stl",
    ".obj": "model/obj",
}

#: EXIF tags worth keeping. The first three are reconstruction inputs; the rest
#: place the capture in time and space for provenance.
_EXIF_KEEP = {
    "Make",
    "Model",
    "LensModel",
    "FocalLength",
    "FocalLengthIn35mmFilm",
    "Orientation",
    "ExifImageWidth",
    "ExifImageHeight",
    "DateTimeOriginal",
    "FNumber",
    "ISOSpeedRatings",
    "ExposureTime",
}


class UnsupportedAsset(ValueError):
    """Raised for a file type the pipeline has no stage for."""


def classify(filename: str) -> AssetKind:
    suffix = Path(filename).suffix.lower()
    if suffix in IMAGE_SUFFIXES:
        return AssetKind.IMAGE
    if suffix in VIDEO_SUFFIXES:
        return AssetKind.VIDEO
    if suffix in CAD_SUFFIXES:
        return AssetKind.CAD
    if suffix in DOCUMENT_SUFFIXES:
        return AssetKind.DOCUMENT
    raise UnsupportedAsset(
        f"unsupported file type {suffix or '(none)'}. "
        f"Accepted: images, video, CAD ({', '.join(sorted(CAD_SUFFIXES))}), PDF."
    )


def content_type(filename: str) -> str:
    return _CONTENT_TYPES.get(Path(filename).suffix.lower(), "application/octet-stream")


def _exif(path: Path) -> dict[str, Any]:
    from PIL import ExifTags, Image

    try:
        with Image.open(path) as img:
            raw = img.getexif()
            if not raw:
                return {}
            named = {ExifTags.TAGS.get(tag, str(tag)): value for tag, value in raw.items()}
    except Exception:  # noqa: BLE001 - a corrupt header must not fail the upload
        return {}

    out: dict[str, Any] = {}
    for key in _EXIF_KEEP:
        if key not in named:
            continue
        value = named[key]
        # EXIF rationals and bytes are not JSON-serialisable; the metadata column is
        # JSON, so anything exotic is stringified rather than dropped.
        if isinstance(value, (int, float, str)):
            out[key] = value
        elif isinstance(value, bytes):
            out[key] = value.decode("utf-8", errors="replace")
        else:
            out[key] = str(value)
    return out


def image_metadata(path: Path) -> dict[str, Any]:
    from PIL import Image

    meta: dict[str, Any] = {}
    try:
        with Image.open(path) as img:
            meta["width"], meta["height"] = img.size
            meta["mode"] = img.mode
    except Exception as exc:  # noqa: BLE001
        meta["unreadable"] = str(exc)
        return meta

    exif = _exif(path)
    if exif:
        meta["exif"] = exif
        # Surfaced to the top level because the reconstruction stage groups images
        # by intrinsic model and should not have to dig for it.
        if "FocalLength" in exif:
            meta["focal_length"] = exif["FocalLength"]
        if "Model" in exif:
            meta["camera"] = exif["Model"]
    return meta


def document_metadata(path: Path) -> dict[str, Any]:
    import pymupdf

    meta: dict[str, Any] = {}
    try:
        with pymupdf.open(path) as doc:
            meta["page_count"] = doc.page_count
            info = doc.metadata or {}
            for key in ("title", "author", "subject"):
                if info.get(key):
                    meta[key] = info[key]
            # Whether the PDF carries a text layer decides between straight
            # extraction and OCR at M7, and it is far cheaper to answer now.
            sample = "".join(doc[i].get_text() for i in range(min(3, doc.page_count)))
            meta["has_text_layer"] = len(sample.strip()) > 32
    except Exception as exc:  # noqa: BLE001
        meta["unreadable"] = str(exc)
    return meta


def video_metadata(path: Path) -> dict[str, Any]:
    """Probe a video with ffprobe.

    Returns `{"probe_unavailable": ...}` rather than raising when ffprobe is
    absent: an upload should still succeed and be visible, with frame extraction
    reported as unavailable, rather than the whole asset being rejected.
    """
    exe = shutil.which("ffprobe")
    if exe is None:
        return {"probe_unavailable": "ffprobe not found"}

    try:
        proc = subprocess.run(  # noqa: S603
            [
                exe,
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        payload = json.loads(proc.stdout or "{}")
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        return {"probe_unavailable": str(exc)}

    meta: dict[str, Any] = {}
    fmt = payload.get("format", {})
    if "duration" in fmt:
        meta["duration_s"] = float(fmt["duration"])

    video = next((s for s in payload.get("streams", []) if s.get("codec_type") == "video"), None)
    if video:
        meta["width"] = video.get("width")
        meta["height"] = video.get("height")
        meta["codec"] = video.get("codec_name")
        rate = video.get("avg_frame_rate", "0/0")
        try:
            num, _, den = rate.partition("/")
            meta["fps"] = round(float(num) / float(den), 3) if float(den) else None
        except (ValueError, ZeroDivisionError):
            meta["fps"] = None
    return meta


def cad_metadata(path: Path) -> dict[str, Any]:
    """Identify the format only.

    Parsing STEP/IGES assemblies is M9 work and needs OpenCascade, which is not a
    dependency yet. Recording the format now means a CAD upload is accepted and
    visible rather than rejected, without pretending it has been understood.
    """
    return {
        "format": path.suffix.lower().lstrip("."),
        "parsed": False,
        "note": "CAD parsing lands at M9; the file is stored and classified only.",
    }


def extract(path: Path, kind: AssetKind) -> dict[str, Any]:
    if kind in (AssetKind.IMAGE, AssetKind.FRAME):
        return image_metadata(path)
    if kind is AssetKind.DOCUMENT:
        return document_metadata(path)
    if kind is AssetKind.VIDEO:
        return video_metadata(path)
    return cad_metadata(path)
