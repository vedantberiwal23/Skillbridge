"""Ingestion: classification, metadata, and frame selection."""

from __future__ import annotations

from pathlib import Path

import pytest

from machine_twin.pipeline.ingest import frames, metadata, thumbnails
from machine_twin.schema.models import AssetKind
from tests.conftest import write_image


class TestClassification:
    @pytest.mark.parametrize(
        ("filename", "expected"),
        [
            ("front.jpg", AssetKind.IMAGE),
            ("REAR.JPEG", AssetKind.IMAGE),
            ("walkaround.mp4", AssetKind.VIDEO),
            ("pump.MOV", AssetKind.VIDEO),
            ("assembly.step", AssetKind.CAD),
            ("housing.stl", AssetKind.CAD),
            ("manual.pdf", AssetKind.DOCUMENT),
        ],
    )
    def test_known_types(self, filename: str, expected: AssetKind) -> None:
        assert metadata.classify(filename) is expected

    @pytest.mark.parametrize("filename", ["notes.txt", "archive.zip", "noextension"])
    def test_unknown_types_are_rejected_with_a_usable_message(self, filename: str) -> None:
        with pytest.raises(metadata.UnsupportedAsset) as exc:
            metadata.classify(filename)
        assert "Accepted" in str(exc.value)

    def test_content_type_is_derived_from_the_suffix(self) -> None:
        assert metadata.content_type("front.jpg") == "image/jpeg"
        assert metadata.content_type("manual.pdf") == "application/pdf"
        assert metadata.content_type("mystery.bin") == "application/octet-stream"


class TestImageMetadata:
    def test_dimensions_are_extracted(self, tmp_path: Path) -> None:
        image = write_image(tmp_path / "front.jpg", size=(120, 80))
        meta = metadata.extract(image, AssetKind.IMAGE)
        assert (meta["width"], meta["height"]) == (120, 80)

    def test_a_corrupt_file_reports_rather_than_raises(self, tmp_path: Path) -> None:
        # An unreadable upload must still produce an asset row with a recorded
        # reason; rejecting it outright loses the operator's file.
        broken = tmp_path / "broken.jpg"
        broken.write_bytes(b"not a jpeg")
        assert "unreadable" in metadata.extract(broken, AssetKind.IMAGE)


class TestCadMetadata:
    def test_format_is_recorded_without_claiming_it_was_parsed(self, tmp_path: Path) -> None:
        cad = tmp_path / "assembly.step"
        cad.write_text("ISO-10303-21;")
        meta = metadata.extract(cad, AssetKind.CAD)
        assert meta["format"] == "step"
        assert meta["parsed"] is False


class TestSharpness:
    def test_noise_scores_above_flat_fill(self, sharp_image: Path, blurry_image: Path) -> None:
        assert frames.sharpness(sharp_image) > frames.sharpness(blurry_image)

    def test_flat_fill_scores_near_zero(self, blurry_image: Path) -> None:
        assert frames.sharpness(blurry_image) < frames.MIN_SHARPNESS

    def test_undecodable_input_scores_zero(self, tmp_path: Path) -> None:
        broken = tmp_path / "broken.jpg"
        broken.write_bytes(b"nope")
        assert frames.sharpness(broken) == 0.0


class TestThumbnails:
    def test_image_thumbnail_is_bounded(self, tmp_path: Path) -> None:
        from PIL import Image

        source = write_image(tmp_path / "big.jpg", size=(2000, 1000))
        out = thumbnails.generate(source, tmp_path / "t.webp", max_px=256)
        assert out is not None
        with Image.open(out) as img:
            assert max(img.size) <= 256

    def test_cad_has_no_thumbnail(self, tmp_path: Path) -> None:
        cad = tmp_path / "a.step"
        cad.write_text("ISO-10303-21;")
        assert thumbnails.for_asset(AssetKind.CAD, cad, tmp_path / "t.webp") is None

    def test_a_corrupt_image_yields_no_thumbnail_rather_than_raising(self, tmp_path: Path) -> None:
        broken = tmp_path / "broken.jpg"
        broken.write_bytes(b"nope")
        assert thumbnails.generate(broken, tmp_path / "t.webp") is None
