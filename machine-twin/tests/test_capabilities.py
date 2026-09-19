"""Tests for the capability probe.

These assert the probe's *logic*, not this particular laptop's toolchain: a test
that passes only where COLMAP happens to be installed tells you nothing on CI and
fails for the next person. Host-dependent facts are asserted as invariants
("status is one of these four"), never as fixed values.
"""

from __future__ import annotations

import platform
from pathlib import Path

import pytest

from machine_twin.capabilities import (
    Capability,
    CapabilityReport,
    DependencyUnavailable,
    Host,
    Status,
    probe_all,
    probe_colmap_dense,
    probe_host,
    probe_object_capture,
    probe_python,
    select_mesh_provider,
)


def _host() -> Host:
    return Host(
        system="Darwin",
        release="25.5.0",
        machine="arm64",
        python="3.12.13",
        cpu_count=8,
        memory_gb=16.0,
    )


def _report(**caps: Capability) -> CapabilityReport:
    return CapabilityReport(host=_host(), capabilities=dict(caps))


class TestHost:
    def test_reports_real_values(self) -> None:
        host = probe_host()
        assert host.system == platform.system()
        assert host.cpu_count > 0
        assert host.memory_gb > 0


class TestPython:
    def test_matches_the_running_interpreter(self) -> None:
        cap = probe_python()
        assert cap.version == platform.python_version()
        expected = (
            Status.AVAILABLE
            if platform.python_version_tuple()[:2] == ("3", "12")
            else Status.DEGRADED
        )
        assert cap.status is expected

    def test_a_wrong_version_carries_a_fix(self) -> None:
        cap = probe_python()
        if not cap.ok:
            assert "3.12" in cap.remediation


class TestColmapDense:
    """The dense stage needs the binary AND CUDA; either missing is a flat no."""

    def test_absent_without_colmap(self) -> None:
        cap = probe_colmap_dense(
            Capability("colmap", Status.ABSENT, remediation="brew install colmap"),
            Capability("cuda", Status.AVAILABLE),
        )
        assert cap.status is Status.ABSENT
        assert cap.remediation == "brew install colmap"

    def test_absent_without_cuda(self) -> None:
        cap = probe_colmap_dense(
            Capability("colmap", Status.AVAILABLE, version="3.10"),
            Capability("cuda", Status.ABSENT, detail="macOS provides no CUDA runtime"),
        )
        assert cap.status is Status.ABSENT
        assert "CUDA" in cap.detail

    def test_unverified_cuda_is_not_treated_as_available(self) -> None:
        # A probe that could not run must never green-light a stage.
        cap = probe_colmap_dense(
            Capability("colmap", Status.AVAILABLE),
            Capability("cuda", Status.UNVERIFIED, detail="nvidia-smi failed"),
        )
        assert cap.status is Status.ABSENT


class TestRequire:
    def test_returns_an_available_capability(self) -> None:
        report = _report(blender=Capability("blender", Status.AVAILABLE, "4.2"))
        assert report.require("blender").version == "4.2"

    @pytest.mark.parametrize("status", [Status.ABSENT, Status.DEGRADED, Status.UNVERIFIED])
    def test_raises_for_anything_else(self, status: Status) -> None:
        report = _report(blender=Capability("blender", status))
        with pytest.raises(DependencyUnavailable):
            report.require("blender")

    def test_unknown_capability_is_a_key_error(self) -> None:
        with pytest.raises(KeyError):
            _report().require("nope")

    def test_error_carries_stage_code_and_remediation(self) -> None:
        cap = Capability(
            "blender",
            Status.ABSENT,
            detail="blender is not on PATH.",
            remediation="brew install --cask blender",
        )
        err = DependencyUnavailable(cap).as_error("authoring")
        assert err["stage"] == "authoring"
        assert err["code"] == "DEPENDENCY_UNAVAILABLE"
        assert err["recoverable"] is True
        assert err["remediation"] == "brew install --cask blender"


class TestMeshProviderSelection:
    def test_prefers_colmap_dense_when_it_is_usable(self) -> None:
        report = _report(
            colmap_dense=Capability("colmap_dense", Status.AVAILABLE),
            object_capture=Capability("object_capture", Status.AVAILABLE),
        )
        assert select_mesh_provider(report) == "colmap_dense"

    def test_falls_back_to_object_capture(self) -> None:
        report = _report(
            colmap_dense=Capability("colmap_dense", Status.ABSENT),
            object_capture=Capability("object_capture", Status.AVAILABLE),
        )
        assert select_mesh_provider(report) == "object_capture"

    def test_returns_none_when_no_backend_can_run(self) -> None:
        # The important case: the caller must fail the stage, not emit a placeholder.
        report = _report(
            colmap_dense=Capability("colmap_dense", Status.ABSENT),
            object_capture=Capability("object_capture", Status.UNVERIFIED),
        )
        assert select_mesh_provider(report) is None


class TestReport:
    def test_probes_every_capability_the_pipeline_asks_for(self) -> None:
        report = probe_all()
        assert set(report.capabilities) == {
            "python",
            "cuda",
            "colmap",
            "colmap_dense",
            "blender",
            "object_capture",
            "ffmpeg",
            "docker",
        }

    def test_every_status_is_valid_and_failures_explain_themselves(self) -> None:
        for cap in probe_all().capabilities.values():
            assert cap.status in set(Status)
            if not cap.ok:
                assert cap.detail or cap.remediation, f"{cap.name} fails without explanation"

    def test_json_round_trips(self) -> None:
        import json

        data = json.loads(probe_all().to_json())
        assert data["host"]["system"] == platform.system()
        assert isinstance(data["capabilities"]["python"]["status"], str)


@pytest.mark.skipif(platform.system() != "Darwin", reason="macOS-specific constraint")
class TestMacOSConstraint:
    """The finding that shapes the whole reconstruction plan."""

    def test_cuda_is_absent_and_says_why(self) -> None:
        cuda = probe_all().capabilities["cuda"]
        assert cuda.status is Status.ABSENT
        assert "CUDA" in cuda.detail

    def test_colmap_dense_is_never_selected_on_macos(self) -> None:
        assert select_mesh_provider(probe_all()) != "colmap_dense"


class TestObjectCaptureProbe:
    """Support is a hardware fact, so the probe must ask the framework, not guess."""

    def test_unverified_until_the_helper_is_built(self, tmp_path: Path) -> None:
        cap = probe_object_capture(helper=tmp_path / "not-built")
        if platform.system() == "Darwin":
            # Never AVAILABLE on the strength of a macOS version number alone.
            assert cap.status is not Status.AVAILABLE
        else:
            assert cap.status is Status.ABSENT
