"""Thumbnail generation.

Derived, never stored in the content store: thumbnails are regenerable from an
original and the content store is reserved for things that must never change.
"""

from __future__ import annotations

from pathlib import Path

from machine_twin.schema.models import AssetKind

#: WebP because the review UI loads hundreds at a time and the size difference
#: over JPEG is worth the encode.
THUMBNAIL_FORMAT = "WEBP"
THUMBNAIL_QUALITY = 80


def generate(source: Path, destination: Path, *, max_px: int = 512) -> Path | None:
    """Write a thumbnail, or return None when the source has no visual form."""
    from PIL import Image, ImageOps

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with Image.open(source) as img:
            # EXIF orientation applied here so the review UI shows photographs the
            # way they were taken. The original is untouched -- the reconstruction
            # stage reads the EXIF tag itself and must see it unrotated.
            oriented = ImageOps.exif_transpose(img) or img
            oriented.thumbnail((max_px, max_px), Image.Resampling.LANCZOS)
            if oriented.mode not in ("RGB", "RGBA"):
                oriented = oriented.convert("RGB")
            oriented.save(destination, THUMBNAIL_FORMAT, quality=THUMBNAIL_QUALITY)
    except Exception:  # noqa: BLE001 - a missing thumbnail must not fail an upload
        return None
    return destination


def first_page(source: Path, destination: Path, *, max_px: int = 512) -> Path | None:
    """Render page one of a PDF as its thumbnail."""
    import pymupdf

    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with pymupdf.open(source) as doc:
            if doc.page_count == 0:
                return None
            page = doc[0]
            scale = max_px / max(page.rect.width, page.rect.height)
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale))
            pixmap.save(destination)
    except Exception:  # noqa: BLE001
        return None
    return destination


def for_asset(
    kind: AssetKind, source: Path, destination: Path, *, max_px: int = 512
) -> Path | None:
    if kind in (AssetKind.IMAGE, AssetKind.FRAME):
        return generate(source, destination, max_px=max_px)
    if kind is AssetKind.DOCUMENT:
        return first_page(source, destination, max_px=max_px)
    # Video thumbnails come from the first selected frame; CAD has no preview
    # until M9 gives us a way to tessellate it.
    return None
