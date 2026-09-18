"""API round-trip, including M1's completion criterion.

"Done when assets round-trip with originals provably untouched" -- so the last
class here reads the stored bytes back and compares them to what was uploaded,
rather than trusting that nothing wrote to them.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from machine_twin.api.app import app
from machine_twin.config import settings
from machine_twin.storage.content_store import ContentStore
from tests.conftest import write_image


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def make_project(client: TestClient, name: str = "HPU-400") -> dict[str, Any]:
    response = client.post("/projects", json={"name": name, "manufacturer": "Parker"})
    assert response.status_code == 201
    return response.json()


class TestProjects:
    def test_create_returns_the_project(self, client: TestClient) -> None:
        project = make_project(client)
        assert project["name"] == "HPU-400"
        assert project["status"] == "created"
        assert project["org_id"] == settings.default_org_id

    def test_org_id_is_never_taken_from_the_request(self, client: TestClient) -> None:
        # The tenant is resolved server-side. A client that tries to set it is
        # ignored, not honoured and not rejected -- the field simply is not input.
        response = client.post("/projects", json={"name": "X", "org_id": "other-tenant"})
        assert response.status_code == 201
        assert response.json()["org_id"] == settings.default_org_id

    def test_get_unknown_project_is_404(self, client: TestClient) -> None:
        assert client.get("/projects/deadbeef").status_code == 404

    def test_list_is_newest_first(self, client: TestClient) -> None:
        make_project(client, "first")
        make_project(client, "second")
        names = [p["name"] for p in client.get("/projects").json()]
        assert names[0] == "second"

    def test_name_is_required(self, client: TestClient) -> None:
        assert client.post("/projects", json={"name": ""}).status_code == 422


class TestUpload:
    def test_images_are_ingested(self, client: TestClient, tmp_path: Path) -> None:
        project = make_project(client)
        files = [
            (
                "files",
                ("front.jpg", write_image(tmp_path / "front.jpg").read_bytes(), "image/jpeg"),
            ),
            ("files", ("rear.jpg", write_image(tmp_path / "rear.jpg").read_bytes(), "image/jpeg")),
        ]
        response = client.post(f"/projects/{project['id']}/assets", files=files)
        assert response.status_code == 201

        results = response.json()
        assert len(results) == 2
        assert all(r["asset"]["kind"] == "image" for r in results)
        assert all(r["asset"]["thumbnail_path"] for r in results)

    def test_project_moves_to_ingesting(self, client: TestClient, tmp_path: Path) -> None:
        project = make_project(client)
        client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        assert client.get(f"/projects/{project['id']}").json()["status"] == "ingesting"

    def test_asset_counts_are_reported(self, client: TestClient, tmp_path: Path) -> None:
        project = make_project(client)
        client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        assert client.get(f"/projects/{project['id']}").json()["asset_counts"]["image"] == 1

    def test_an_unsupported_file_alone_is_a_400(self, client: TestClient) -> None:
        project = make_project(client)
        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("notes.txt", b"hello", "text/plain"))],
        )
        assert response.status_code == 400
        assert response.json()["detail"]["code"] == "UNSUPPORTED_ASSET_TYPE"

    def test_one_bad_file_does_not_discard_the_good_ones(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        # 30 photographs with one stray screenshot should yield 29 assets and a
        # warning, not a failed batch.
        project = make_project(client)
        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("good.jpg", write_image(tmp_path / "g.jpg").read_bytes(), "image/jpeg")),
                ("files", ("notes.txt", b"hello", "text/plain")),
            ],
        )
        assert response.status_code == 201
        results = response.json()
        assert len(results) == 1
        assert any("notes.txt" in w for w in results[0]["warnings"])

    def test_upload_to_unknown_project_is_404(self, client: TestClient, tmp_path: Path) -> None:
        response = client.post(
            "/projects/deadbeef/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        assert response.status_code == 404

    def test_duplicate_uploads_share_one_object_but_stay_distinct_assets(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        project = make_project(client)
        payload = write_image(tmp_path / "same.jpg").read_bytes()
        response = client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", payload, "image/jpeg")),
                ("files", ("b.jpg", payload, "image/jpeg")),
            ],
        )
        assets = [r["asset"] for r in response.json()]
        assert assets[0]["sha256"] == assets[1]["sha256"]
        assert assets[0]["id"] != assets[1]["id"]


class TestListingAndThumbnails:
    def test_assets_can_be_filtered_by_kind(self, client: TestClient, tmp_path: Path) -> None:
        project = make_project(client)
        client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        assert len(client.get(f"/projects/{project['id']}/assets?kind=image").json()) == 1
        assert client.get(f"/projects/{project['id']}/assets?kind=video").json() == []

    def test_thumbnail_is_served(self, client: TestClient, tmp_path: Path) -> None:
        project = make_project(client)
        upload = client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        asset_id = upload.json()[0]["asset"]["id"]
        response = client.get(f"/assets/{asset_id}/thumbnail")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/webp"

    def test_unknown_asset_thumbnail_is_404(self, client: TestClient) -> None:
        assert client.get("/assets/deadbeef/thumbnail").status_code == 404


class TestOriginalsAreUntouched:
    """M1's completion criterion, asserted against the bytes on disk."""

    def test_stored_bytes_match_the_upload_exactly(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        project = make_project(client)
        payload = write_image(tmp_path / "front.jpg", size=(320, 240)).read_bytes()

        upload = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("front.jpg", payload, "image/jpeg"))],
        )
        asset = upload.json()[0]["asset"]

        store = ContentStore(settings.objects_dir)
        with store.open(asset["sha256"]) as handle:
            stored = handle.read()

        assert stored == payload
        assert hashlib.sha256(stored).hexdigest() == asset["sha256"]
        assert asset["size_bytes"] == len(payload)

    def test_the_stored_original_cannot_be_written(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        project = make_project(client)
        payload = write_image(tmp_path / "front.jpg").read_bytes()
        upload = client.post(
            f"/projects/{project['id']}/assets",
            files=[("files", ("front.jpg", payload, "image/jpeg"))],
        )
        path = ContentStore(settings.objects_dir).path_for(upload.json()[0]["asset"]["sha256"])
        with pytest.raises(PermissionError):
            path.open("ab")

    def test_thumbnails_live_outside_the_object_store(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        # Derived artifacts must never land in the write-once store, or
        # regenerating one would mean trying to overwrite an immutable object.
        project = make_project(client)
        upload = client.post(
            f"/projects/{project['id']}/assets",
            files=[
                ("files", ("a.jpg", write_image(tmp_path / "a.jpg").read_bytes(), "image/jpeg"))
            ],
        )
        thumb = Path(upload.json()[0]["asset"]["thumbnail_path"])
        assert settings.working_dir in thumb.parents
        assert settings.objects_dir not in thumb.parents


class TestCapabilities:
    def test_report_is_exposed_with_the_mesh_decision(self, client: TestClient) -> None:
        # The UI needs to tell an operator reconstruction is unavailable before
        # they upload 30 photographs, not after.
        payload = client.get("/capabilities").json()
        assert "python" in payload["capabilities"]
        assert "mesh_provider" in payload
