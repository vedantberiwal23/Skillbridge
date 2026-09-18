"""Frame selection against a real video.

Skipped where ffmpeg is absent rather than mocked: the thing worth testing is that
the selection spreads across the timeline, and a mock of ffmpeg would only test
the mock.
"""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from machine_twin.pipeline.ingest import frames

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")

VIDEO_SECONDS = 6
VIDEO_FPS = 10


@pytest.fixture
def video(tmp_path: Path) -> Path:
    out = tmp_path / "walkaround.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=duration={VIDEO_SECONDS}:size=320x240:rate={VIDEO_FPS}",
            "-pix_fmt",
            "yuv420p",
            str(out),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return out


class TestSelection:
    def test_keeps_at_most_what_was_asked_for(self, video: Path, tmp_path: Path) -> None:
        # 6s at 10fps is 60 frames; sampling at 2fps gives 12 candidates, of which
        # 4 survive. The point of the stage is that 60 never reach reconstruction.
        selected = frames.select(video, tmp_path / "frames", sample_fps=2.0, keep=4)
        assert 0 < len(selected) <= 4

    def test_frames_are_spread_across_the_timeline(self, video: Path, tmp_path: Path) -> None:
        # The property that distinguishes bucketed selection from "sharpest N":
        # picks must span the walk-around, not cluster in one sharp stretch.
        selected = frames.select(video, tmp_path / "frames", sample_fps=2.0, keep=4)
        assert len(selected) >= 2
        span = selected[-1].timestamp_s - selected[0].timestamp_s
        assert span > VIDEO_SECONDS / 2

    def test_results_are_ordered_by_timestamp(self, video: Path, tmp_path: Path) -> None:
        selected = frames.select(video, tmp_path / "frames", sample_fps=2.0, keep=5)
        assert [f.timestamp_s for f in selected] == sorted(f.timestamp_s for f in selected)

    def test_unselected_candidates_are_cleaned_up(self, video: Path, tmp_path: Path) -> None:
        out = tmp_path / "frames"
        selected = frames.select(video, out, sample_fps=2.0, keep=3)
        assert len(list(out.glob("cand_*.jpg"))) == len(selected)

    def test_every_selected_frame_exists_on_disk(self, video: Path, tmp_path: Path) -> None:
        for frame in frames.select(video, tmp_path / "frames", sample_fps=2.0, keep=3):
            assert frame.path.is_file()

    def test_keep_larger_than_candidates_returns_them_all(
        self, video: Path, tmp_path: Path
    ) -> None:
        selected = frames.select(video, tmp_path / "frames", sample_fps=1.0, keep=100)
        assert 0 < len(selected) <= VIDEO_SECONDS + 1

    def test_keep_must_be_positive(self, video: Path, tmp_path: Path) -> None:
        with pytest.raises(ValueError, match="at least 1"):
            frames.select(video, tmp_path / "frames", keep=0)


class TestVideoIngest:
    """A video becomes a parent asset plus FRAME children, not a pile of images."""

    def test_frames_are_registered_against_the_video(self, video: Path) -> None:
        from fastapi.testclient import TestClient

        from machine_twin.api.app import app

        client = TestClient(app)
        project = client.post("/projects", json={"name": "HPU-400"}).json()

        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("walkaround.mp4", video.read_bytes(), "video/mp4"))],
        )
        assert response.status_code == 201

        result = response.json()[0]
        assert result["asset"]["kind"] == "video"
        assert len(result["derived"]) > 0

        for frame in result["derived"]:
            assert frame["kind"] == "frame"
            # Provenance leads back to the upload the operator actually made.
            assert frame["derived_from"] == result["asset"]["id"]
            assert "timestamp_s" in frame["meta"]
            # §17: the number carries its method so no reader reads it as calibrated.
            assert frame["meta"]["sharpness_method"] == "laplacian_variance_heuristic"

    def test_video_metadata_is_probed(self, video: Path) -> None:
        from fastapi.testclient import TestClient

        from machine_twin.api.app import app

        client = TestClient(app)
        project = client.post("/projects", json={"name": "HPU-400"}).json()
        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("walkaround.mp4", video.read_bytes(), "video/mp4"))],
        )
        meta = response.json()[0]["asset"]["meta"]
        assert meta["duration_s"] == pytest.approx(VIDEO_SECONDS, abs=0.5)
        assert meta["frames_extracted"] > 0

    def test_the_video_gets_a_thumbnail_from_its_first_kept_frame(self, video: Path) -> None:
        from fastapi.testclient import TestClient

        from machine_twin.api.app import app

        client = TestClient(app)
        project = client.post("/projects", json={"name": "HPU-400"}).json()
        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("walkaround.mp4", video.read_bytes(), "video/mp4"))],
        )
        result = response.json()[0]
        assert result["asset"]["thumbnail_path"] == result["derived"][0]["thumbnail_path"]
