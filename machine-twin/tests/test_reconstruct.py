"""Reconstruction stage logic.

Driven with fake providers rather than real COLMAP. What is under test here is the
stage's judgement -- when it refuses to proceed, what it records, when it skips -
and a real solve would make those tests slow, non-deterministic and unrunnable on
a host without the toolchain. The real COLMAP adapter is exercised separately in
test_reconstruct_colmap.py against generated imagery.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from machine_twin.api.app import app
from machine_twin.db import MachineProjectRow, session_scope
from machine_twin.pipeline.jobs import StageFailure, input_hash
from machine_twin.pipeline.reconstruct import coverage as coverage_mod
from machine_twin.pipeline.reconstruct.service import ReconstructionService
from machine_twin.providers import MeshResult, SparseResult
from machine_twin.schema.models import GeometrySource, JobState
from tests.conftest import write_image


class FakeSparse:
    """Registers a fixed fraction of whatever it is given."""

    name = "fake_sparse"

    def __init__(self, registered: int | None = None) -> None:
        self.registered = registered
        self.calls = 0

    def sparse(self, images: list[Path], workspace: Path) -> SparseResult:
        self.calls += 1
        total = len(images)
        return SparseResult(
            sparse_path=Path(workspace) / "sparse",
            registered_images=total if self.registered is None else self.registered,
            total_images=total,
            mean_reprojection_error=0.42,
        )


class FakeMesh:
    name = "object_capture"
    source = GeometrySource.OBJECT_CAPTURE.value

    def __init__(self) -> None:
        self.calls = 0

    def mesh(self, images: list[Path], sparse: SparseResult | None, workspace: Path) -> MeshResult:
        self.calls += 1
        out = Path(workspace) / "mesh" / "model.usdz"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"fake-usdz")
        return MeshResult(out, self.source, vertex_count=1024, face_count=2048)


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch) -> ReconstructionService:
    svc = ReconstructionService(sparse_provider=FakeSparse())
    mesh = FakeMesh()
    monkeypatch.setattr(svc, "resolve_mesh_provider", lambda: mesh)
    svc.fake_mesh = mesh  # type: ignore[attr-defined]
    return svc


def seed(client: TestClient, count: int = 24) -> str:
    project = client.post("/projects", json={"name": "HPU-400"}).json()
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        files = [
            (
                "files",
                (
                    f"v{i}.jpg",
                    write_image(Path(tmp) / f"v{i}.jpg", size=(160, 120)).read_bytes(),
                    "image/jpeg",
                ),
            )
            for i in range(count)
        ]
        client.post(f"/projects/{project['id']}/assets", files=files)
    return str(project["id"])


def run(service: ReconstructionService, project_id: str, **kwargs: object):  # type: ignore[no-untyped-def]
    with session_scope() as session:
        project = session.get(MachineProjectRow, project_id)
        assert project is not None
        return service.run(session, project, **kwargs)  # type: ignore[arg-type]


class TestGates:
    def test_too_few_images_is_refused_before_any_work(
        self, service: ReconstructionService
    ) -> None:
        client = TestClient(app)
        project_id = seed(client, 4)

        with pytest.raises(StageFailure) as exc:
            run(service, project_id)

        assert exc.value.error.code == "INSUFFICIENT_IMAGE_COUNT"
        assert exc.value.error.remediation
        # The expensive part never ran.
        assert service.sparse_provider.calls == 0  # type: ignore[attr-defined]

    def test_poor_registration_stops_before_mesh_generation(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # §8/§28: a half-registered capture must not silently become a mesh.
        svc = ReconstructionService(sparse_provider=FakeSparse(registered=5))
        mesh = FakeMesh()
        monkeypatch.setattr(svc, "resolve_mesh_provider", lambda: mesh)

        client = TestClient(app)
        project_id = seed(client)

        with pytest.raises(StageFailure) as exc:
            run(svc, project_id)

        assert exc.value.error.code == "INSUFFICIENT_CAMERA_COVERAGE"
        assert "additional" in exc.value.error.remediation.lower()
        assert mesh.calls == 0

    def test_zero_registration_explains_why(self, monkeypatch: pytest.MonkeyPatch) -> None:
        svc = ReconstructionService(sparse_provider=FakeSparse(registered=0))
        monkeypatch.setattr(svc, "resolve_mesh_provider", lambda: FakeMesh())
        client = TestClient(app)

        with pytest.raises(StageFailure) as exc:
            run(svc, seed(client))

        assert "featureless or reflective" in exc.value.error.remediation


class TestSuccess:
    def test_produces_a_generated_artifact(self, service: ReconstructionService) -> None:
        client = TestClient(app)
        outcome = run(service, seed(client))

        assert outcome.state is JobState.SUCCEEDED
        assert outcome.geometry is not None
        # Every mesh enters the ladder at GENERATED. There is no shortcut.
        assert outcome.geometry.validation_status.value == "generated"
        assert outcome.geometry.source is GeometrySource.OBJECT_CAPTURE

    def test_no_confidence_value_is_invented(self, service: ReconstructionService) -> None:
        # §17: neither backend reports a calibrated confidence, so none is stored.
        outcome = run(service, seed(TestClient(app)))
        assert outcome.geometry is not None
        assert outcome.geometry.confidence is None
        assert outcome.geometry.confidence_method

    def test_coverage_is_reported_with_its_method(self, service: ReconstructionService) -> None:
        outcome = run(service, seed(TestClient(app)))
        assert outcome.coverage is not None
        assert outcome.coverage.status == "good"
        assert outcome.coverage.method == "registration_ratio_heuristic"

    def test_provenance_records_both_providers(self, service: ReconstructionService) -> None:
        outcome = run(service, seed(TestClient(app)))
        assert outcome.geometry is not None
        assert outcome.geometry.meta["sparse_provider"] == "fake_sparse"
        assert outcome.geometry.meta["mesh_provider"] == "object_capture"


class TestCaching:
    def test_unchanged_inputs_are_skipped(self, service: ReconstructionService) -> None:
        client = TestClient(app)
        project_id = seed(client)

        run(service, project_id)
        calls_after_first = service.sparse_provider.calls  # type: ignore[attr-defined]

        second = run(service, project_id)
        assert second.state is JobState.SKIPPED
        assert service.sparse_provider.calls == calls_after_first  # type: ignore[attr-defined]

    def test_force_recomputes(self, service: ReconstructionService) -> None:
        client = TestClient(app)
        project_id = seed(client)

        run(service, project_id)
        before = service.sparse_provider.calls  # type: ignore[attr-defined]
        outcome = run(service, project_id, force=True)

        assert outcome.state is JobState.SUCCEEDED
        assert service.sparse_provider.calls == before + 1  # type: ignore[attr-defined]

    def test_hash_is_order_independent(self) -> None:
        assert input_hash(["b", "a"]) == input_hash(["a", "b"])

    def test_hash_changes_with_content(self) -> None:
        assert input_hash(["a"]) != input_hash(["a", "b"])


class TestCoverageThresholds:
    @pytest.mark.parametrize(
        ("registered", "total", "expected"),
        [(24, 24, "good"), (22, 24, "good"), (18, 24, "usable"), (12, 24, "insufficient")],
    )
    def test_bands(self, registered: int, total: int, expected: str) -> None:
        result = SparseResult(Path("/tmp"), registered, total)
        assert coverage_mod.assess(result).status.value == expected

    def test_recommendation_is_always_actionable(self) -> None:
        for registered in (0, 5, 18, 24):
            cov = coverage_mod.assess(SparseResult(Path("/tmp"), registered, 24))
            assert len(cov.recommendation) > 20


class TestApi:
    def test_failed_stage_returns_the_structured_error(
        self, service: ReconstructionService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("machine_twin.api.app.ReconstructionService", lambda: service)
        client = TestClient(app)
        project_id = seed(client, 3)

        response = client.post(f"/projects/{project_id}/stages/reconstruct")
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "INSUFFICIENT_IMAGE_COUNT"
        assert detail["recoverable"] is True
        assert detail["remediation"]

    def test_failures_are_recorded_in_job_history(
        self, service: ReconstructionService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A failed stage that leaves no job row looks like a stage that never ran.
        monkeypatch.setattr("machine_twin.api.app.ReconstructionService", lambda: service)
        client = TestClient(app)
        project_id = seed(client, 3)
        client.post(f"/projects/{project_id}/stages/reconstruct")

        jobs = client.get(f"/projects/{project_id}/jobs").json()
        assert jobs[0]["state"] == "failed"
        assert jobs[0]["error"]["code"] == "INSUFFICIENT_IMAGE_COUNT"

    def test_coverage_endpoint_reads_the_recorded_run(
        self, service: ReconstructionService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("machine_twin.api.app.ReconstructionService", lambda: service)
        client = TestClient(app)
        project_id = seed(client)
        client.post(f"/projects/{project_id}/stages/reconstruct")

        coverage = client.get(f"/projects/{project_id}/coverage").json()
        assert coverage["status"] == "good"
        assert coverage["registered"] == 24

    def test_unknown_stage_is_404(self) -> None:
        client = TestClient(app)
        project_id = seed(client, 1)
        assert client.post(f"/projects/{project_id}/stages/teleport").status_code == 404

    def test_geometry_is_listed(
        self, service: ReconstructionService, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("machine_twin.api.app.ReconstructionService", lambda: service)
        client = TestClient(app)
        project_id = seed(client)
        client.post(f"/projects/{project_id}/stages/reconstruct")

        geometry = client.get(f"/projects/{project_id}/geometry").json()
        assert len(geometry) == 1
        assert geometry[0]["source"] == "object_capture"
