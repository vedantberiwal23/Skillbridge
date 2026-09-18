"""Authoring stage: preconditions, id minting, rerun behaviour.

Driven with a fake provider. The real Blender run is exercised by the slow
integration test; what matters here is what the stage does with the result --
particularly that stable ids survive a rerun and that a rerun does not
accumulate duplicate components.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from machine_twin.api.app import app
from machine_twin.db import GeometryArtifactRow, MachineProjectRow, new_id, session_scope
from machine_twin.pipeline.authoring.blender import AuthoringResult, BlenderError
from machine_twin.pipeline.authoring.service import AuthoringService
from machine_twin.pipeline.jobs import StageFailure
from machine_twin.schema.models import GeometrySource, JobState, ValidationStatus


class FakeBlender:
    name = "blender"

    def __init__(self, components: int = 1, fail: bool = False) -> None:
        self.components = components
        self.fail = fail
        self.calls = 0

    def author(self, source: Path, out_dir: Path, project_id: str) -> AuthoringResult:
        self.calls += 1
        if self.fail:
            raise BlenderError("blender exploded")

        out_dir.mkdir(parents=True, exist_ok=True)
        lods = []
        for level, (ratio, texture) in enumerate([(1.0, 1.0), (0.45, 0.5), (0.18, 0.25)]):
            name = "machine.glb" if level == 0 else f"lod{level}.glb"
            (out_dir / name).write_bytes(b"glTF-fake")
            lods.append(
                {
                    "file": name,
                    "ratio": ratio,
                    "texture_scale": texture,
                    "vertex_count": 1000 // (level + 1),
                    "face_count": 2000 // (level + 1),
                    "size_bytes": 100,
                    "lod": level,
                }
            )
        (out_dir / "poster.webp").write_bytes(b"webp-fake")
        return AuthoringResult(
            machine_id=f"SKB_MACHINE_{project_id[:8].upper()}",
            components=[
                {
                    "stable_id": f"SKB_COMPONENT_{i:03d}",
                    "label": "unknown_component",
                    "category": "unknown",
                    "vertex_count": 500,
                    "face_count": 900,
                    "dimensions": [1.0, 1.0, 1.0],
                }
                for i in range(1, self.components + 1)
            ],
            lods=lods,
            poster="poster.webp",
        )


def make_project(with_mesh: bool = True, tmp_path: Path | None = None) -> str:
    client = TestClient(app)
    project = client.post("/projects", json={"name": "HPU-400"}).json()

    if with_mesh:
        assert tmp_path is not None
        mesh = tmp_path / "model.usdz"
        mesh.write_bytes(b"usdz-fake")
        with session_scope() as session:
            row = session.get(MachineProjectRow, project["id"])
            assert row is not None
            session.add(
                GeometryArtifactRow(
                    id=new_id(),
                    project_id=row.id,
                    org_id=row.org_id,
                    path=str(mesh),
                    format="usdz",
                    source=GeometrySource.OBJECT_CAPTURE.value,
                    lod=0,
                    validation_status=ValidationStatus.GENERATED.value,
                    meta={},
                )
            )
    return str(project["id"])


def run(service: AuthoringService, project_id: str, **kwargs: Any) -> Any:
    with session_scope() as session:
        project = session.get(MachineProjectRow, project_id)
        assert project is not None
        return service.run(session, project, **kwargs)


class TestPreconditions:
    def test_refuses_without_a_reconstruction(self) -> None:
        service = AuthoringService(provider=FakeBlender())  # type: ignore[arg-type]
        with pytest.raises(StageFailure) as exc:
            run(service, make_project(with_mesh=False))
        assert exc.value.error.code == "NO_RECONSTRUCTION"
        assert "reconstruct" in exc.value.error.remediation

    def test_refuses_when_the_mesh_is_gone(self, tmp_path: Path) -> None:
        project_id = make_project(tmp_path=tmp_path)
        (tmp_path / "model.usdz").unlink()
        service = AuthoringService(provider=FakeBlender())  # type: ignore[arg-type]
        with pytest.raises(StageFailure) as exc:
            run(service, project_id)
        assert exc.value.error.code == "RECONSTRUCTION_MISSING"

    def test_blender_failure_is_structured(self, tmp_path: Path) -> None:
        service = AuthoringService(provider=FakeBlender(fail=True))  # type: ignore[arg-type]
        with pytest.raises(StageFailure) as exc:
            run(service, make_project(tmp_path=tmp_path))
        assert exc.value.error.code == "AUTHORING_FAILED"


class TestOutput:
    def test_produces_three_lods(self, tmp_path: Path) -> None:
        outcome = run(
            AuthoringService(provider=FakeBlender()),  # type: ignore[arg-type]
            make_project(tmp_path=tmp_path),
        )
        assert outcome.state is JobState.SUCCEEDED
        assert [a.lod for a in outcome.lods] == [0, 1, 2]

    def test_components_require_review_and_are_unnamed(self, tmp_path: Path) -> None:
        # Separation by connected geometry is not a classifier. Nothing here knows
        # what any shell is, so nothing claims to.
        outcome = run(
            AuthoringService(provider=FakeBlender(components=3)),  # type: ignore[arg-type]
            make_project(tmp_path=tmp_path),
        )
        assert len(outcome.components) == 3
        for component in outcome.components:
            assert component.label == "unknown_component"
            assert component.validation_status is ValidationStatus.REVIEW_REQUIRED
            assert component.confidence is None
            assert component.confidence_method == "not_estimated"

    def test_glb_inherits_the_mesh_provenance(self, tmp_path: Path) -> None:
        # Authoring reshapes geometry; it does not originate it.
        outcome = run(
            AuthoringService(provider=FakeBlender()),  # type: ignore[arg-type]
            make_project(tmp_path=tmp_path),
        )
        assert all(a.source is GeometrySource.OBJECT_CAPTURE for a in outcome.lods)

    def test_machine_id_is_derived_from_the_project(self, tmp_path: Path) -> None:
        project_id = make_project(tmp_path=tmp_path)
        outcome = run(AuthoringService(provider=FakeBlender()), project_id)  # type: ignore[arg-type]
        assert outcome.machine_id == f"SKB_MACHINE_{project_id[:8].upper()}"


class TestRerun:
    def test_unchanged_inputs_are_skipped(self, tmp_path: Path) -> None:
        provider = FakeBlender()
        service = AuthoringService(provider=provider)  # type: ignore[arg-type]
        project_id = make_project(tmp_path=tmp_path)

        run(service, project_id)
        assert run(service, project_id).state is JobState.SKIPPED
        assert provider.calls == 1

    def test_forced_rerun_does_not_duplicate_components(self, tmp_path: Path) -> None:
        # The invariant the hotspots depend on: one row per stable id. Accumulating
        # instead of replacing would give two components claiming the same id.
        provider = FakeBlender(components=2)
        service = AuthoringService(provider=provider)  # type: ignore[arg-type]
        project_id = make_project(tmp_path=tmp_path)

        run(service, project_id)
        outcome = run(service, project_id, force=True)

        assert len(outcome.components) == 2
        assert len({c.stable_id for c in outcome.components}) == 2
        assert len(outcome.lods) == 3

    def test_stable_ids_survive_a_rerun(self, tmp_path: Path) -> None:
        provider = FakeBlender(components=2)
        service = AuthoringService(provider=provider)  # type: ignore[arg-type]
        project_id = make_project(tmp_path=tmp_path)

        first = {c.stable_id for c in run(service, project_id).components}
        second = {c.stable_id for c in run(service, project_id, force=True).components}
        assert first == second


class TestApi:
    def test_stage_and_endpoints(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
        service = AuthoringService(provider=FakeBlender(components=2))  # type: ignore[arg-type]
        monkeypatch.setattr("machine_twin.api.app.AuthoringService", lambda: service)
        client = TestClient(app)
        project_id = make_project(tmp_path=tmp_path)

        assert client.post(f"/projects/{project_id}/stages/author").status_code == 200
        components = client.get(f"/projects/{project_id}/components").json()
        assert len(components) == 2
        assert components[0]["stable_id"] == "SKB_COMPONENT_001"

        assert client.get(f"/projects/{project_id}/model?lod=0").status_code == 200
        assert client.get(f"/projects/{project_id}/model?lod=2").status_code == 200
        assert client.get(f"/projects/{project_id}/poster").status_code == 200

    def test_missing_lod_is_404_naming_what_exists(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        service = AuthoringService(provider=FakeBlender())  # type: ignore[arg-type]
        monkeypatch.setattr("machine_twin.api.app.AuthoringService", lambda: service)
        client = TestClient(app)
        project_id = make_project(tmp_path=tmp_path)
        client.post(f"/projects/{project_id}/stages/author")

        response = client.get(f"/projects/{project_id}/model?lod=7")
        assert response.status_code == 404
        assert "available" in response.json()["detail"]

    def test_model_before_authoring_is_404(self, tmp_path: Path) -> None:
        client = TestClient(app)
        project_id = make_project(tmp_path=tmp_path)
        response = client.get(f"/projects/{project_id}/model")
        assert response.status_code == 404
        assert "author stage" in response.json()["detail"]
