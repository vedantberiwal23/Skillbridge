"""Runtime capability probing.

Every pipeline stage depends on an external tool that may or may not exist on the
host: COLMAP, Blender, a CUDA runtime, Apple's Object Capture. The pipeline reads
this report at startup so an unavailable stage fails immediately with a named
cause and a fix, rather than three stages later inside a subprocess stack trace.

Two rules this module exists to enforce:

1.  A probe reports what it actually observed. Where it cannot test something it
    says so (`Status.UNVERIFIED`) rather than guessing optimistically. A capability
    report that is confidently wrong is worse than one that admits a gap.
2.  Nothing here fabricates an answer to keep a pipeline green. `require()` raises.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any

PROBE_TIMEOUT_S = 20


class Status(StrEnum):
    """Outcome of a single probe."""

    AVAILABLE = "available"
    ABSENT = "absent"
    #: Present but not usable for what we need (e.g. COLMAP built without CUDA).
    DEGRADED = "degraded"
    #: Could not be determined — the probe itself could not run. Never treated as
    #: available; callers must resolve it before depending on the capability.
    UNVERIFIED = "unverified"


@dataclass(frozen=True)
class Capability:
    name: str
    status: Status
    version: str | None = None
    detail: str = ""
    #: Concrete next action when status is not AVAILABLE. Shown verbatim to the user.
    remediation: str = ""

    @property
    def ok(self) -> bool:
        return self.status is Status.AVAILABLE


@dataclass(frozen=True)
class Host:
    system: str
    release: str
    machine: str
    python: str
    cpu_count: int
    memory_gb: float


@dataclass
class CapabilityReport:
    host: Host
    capabilities: dict[str, Capability] = field(default_factory=dict)

    def get(self, name: str) -> Capability:
        try:
            return self.capabilities[name]
        except KeyError:
            raise KeyError(f"no such capability probed: {name!r}") from None

    def require(self, name: str) -> Capability:
        """Return the capability, or raise if it is not usable.

        Called at the top of any stage that shells out. DEGRADED and UNVERIFIED
        both raise: a stage must not run against a tool we could not confirm.
        """
        cap = self.get(name)
        if not cap.ok:
            raise DependencyUnavailable(cap)
        return cap

    def to_dict(self) -> dict[str, Any]:
        return {
            "host": asdict(self.host),
            "capabilities": {
                k: {**asdict(v), "status": v.status.value} for k, v in self.capabilities.items()
            },
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)


class DependencyUnavailable(RuntimeError):
    """Raised when a stage needs a capability the host does not have.

    Carries the structured shape the API returns for a failed stage, so the
    remediation reaches the user instead of being flattened into a message.
    """

    code = "DEPENDENCY_UNAVAILABLE"

    def __init__(self, capability: Capability) -> None:
        self.capability = capability
        super().__init__(f"{capability.name}: {capability.status.value} - {capability.detail}")

    def as_error(self, stage: str) -> dict[str, Any]:
        return {
            "stage": stage,
            "code": self.code,
            "message": f"{self.capability.name} is {self.capability.status.value}. "
            f"{self.capability.detail}".strip(),
            "recoverable": True,
            "remediation": self.capability.remediation,
        }


# ---------------------------------------------------------------------------
# subprocess helper
# ---------------------------------------------------------------------------


def _run(cmd: list[str], timeout: int = PROBE_TIMEOUT_S) -> tuple[int, str]:
    """Run a probe command. Returns (returncode, stdout+stderr).

    Tools disagree about which stream carries version banners and which carries
    build-configuration errors, and the CUDA signal we need from COLMAP arrives on
    stderr. Merging them is deliberate.
    """
    try:
        proc = subprocess.run(  # noqa: S603
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return 127, str(exc)
    return proc.returncode, f"{proc.stdout}\n{proc.stderr}".strip()


# ---------------------------------------------------------------------------
# probes
# ---------------------------------------------------------------------------


def probe_host() -> Host:
    try:
        mem_bytes = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        memory_gb = round(mem_bytes / 1024**3, 1)
    except (ValueError, OSError, AttributeError):
        memory_gb = 0.0
    return Host(
        system=platform.system(),
        release=platform.release(),
        machine=platform.machine(),
        python=platform.python_version(),
        cpu_count=os.cpu_count() or 0,
        memory_gb=memory_gb,
    )


def probe_python() -> Capability:
    major, minor = platform.python_version_tuple()[:2]
    version = platform.python_version()
    if (int(major), int(minor)) == (3, 12):
        return Capability("python", Status.AVAILABLE, version)
    return Capability(
        "python",
        Status.DEGRADED,
        version,
        detail=(
            "Project requires 3.12. Open3D, PyTorch, ultralytics and pycolmap do not "
            f"publish wheels for {version}."
        ),
        remediation="uv venv --python 3.12 && uv sync",
    )


def probe_cuda() -> Capability:
    """Is there a CUDA runtime for COLMAP's dense stage?

    On macOS the answer is a flat no and needs no probing: Apple has shipped no
    CUDA-capable driver stack for years, and there is no CUDA toolkit for arm64
    Darwin. This matters because COLMAP's `patch_match_stereo` -- the step that
    produces the dense cloud a mesh is built from -- is a CUDA-only code path.
    """
    if platform.system() == "Darwin":
        return Capability(
            "cuda",
            Status.ABSENT,
            detail="macOS provides no CUDA runtime, so COLMAP dense stereo cannot run here.",
            remediation=(
                "Use a non-COLMAP mesh provider (object_capture on this host, "
                "openmvs elsewhere). See ReconstructionProvider."
            ),
        )

    if shutil.which("nvidia-smi") is None:
        return Capability(
            "cuda",
            Status.ABSENT,
            detail="nvidia-smi not found.",
            remediation="Install NVIDIA drivers, or use a CPU mesh provider.",
        )

    rc, out = _run(["nvidia-smi", "--query-gpu=name,driver_version", "--format=csv,noheader"])
    if rc != 0:
        return Capability(
            "cuda",
            Status.UNVERIFIED,
            detail=f"nvidia-smi present but failed: {out[:200]}",
            remediation="Check the driver installation.",
        )
    return Capability("cuda", Status.AVAILABLE, detail=out.splitlines()[0].strip() if out else "")


_COLMAP_VERSION_RE = re.compile(r"COLMAP\s+(\d+\.\d+(?:\.\d+)?)", re.IGNORECASE)


def probe_colmap() -> Capability:
    """COLMAP, for sparse structure-from-motion.

    Sparse SfM (feature extraction, matching, mapper) runs on CPU everywhere, so
    this probe only establishes that the binary works. Dense capability is probed
    separately -- the two have very different requirements and only one of them is
    portable.
    """
    exe = shutil.which("colmap")
    if exe is None:
        return Capability(
            "colmap",
            Status.ABSENT,
            detail="colmap is not on PATH.",
            remediation="brew install colmap",
        )

    rc, out = _run([exe, "help"])
    if rc not in (0, 1):
        return Capability(
            "colmap",
            Status.UNVERIFIED,
            detail=f"`colmap help` exited {rc}: {out[:200]}",
            remediation="Check the COLMAP installation.",
        )

    match = _COLMAP_VERSION_RE.search(out)
    # COLMAP states its own build configuration in the banner, e.g.
    # "COLMAP 4.2.0 (Commit Unknown on Unknown without GPU support)". That is the
    # authoritative answer about the dense stage and is cheaper and more reliable
    # than inferring it from the platform.
    gpu_less = bool(re.search(r"without\s+GPU\s+support", out, re.IGNORECASE))
    detail = f"sparse SfM available at {exe}"
    if gpu_less:
        detail += " (built without GPU support: dense stage unavailable)"
    return Capability(
        "colmap",
        Status.AVAILABLE,
        version=match.group(1) if match else None,
        detail=detail,
    )


def probe_colmap_dense(colmap: Capability, cuda: Capability) -> Capability:
    """COLMAP's dense stage, which needs both the binary and a CUDA build.

    Ordering matters: without the binary there is nothing to ask, and without CUDA
    the answer is already no. Only when both hold do we run COLMAP itself and read
    its own account of how it was built -- the authoritative source, since a binary
    can be present on a CUDA host and still have been compiled without it.
    """
    if not colmap.ok:
        return Capability(
            "colmap_dense",
            Status.ABSENT,
            detail="COLMAP is not installed.",
            remediation=colmap.remediation,
        )
    if "without GPU support" in colmap.detail:
        # COLMAP said so itself. No need to guess, and no need to run it.
        return Capability(
            "colmap_dense",
            Status.DEGRADED,
            version=colmap.version,
            detail="COLMAP reports it was built without GPU support; patch_match_stereo "
            "cannot run.",
            remediation="Use a non-COLMAP mesh provider, or install a CUDA-enabled COLMAP.",
        )
    if cuda.status is not Status.AVAILABLE:
        return Capability(
            "colmap_dense",
            Status.ABSENT,
            detail=f"No CUDA runtime: {cuda.detail}",
            remediation=cuda.remediation,
        )

    exe = shutil.which("colmap") or "colmap"
    # Deliberately pointed at a path that cannot exist: we want COLMAP to reject
    # the invocation and tell us why. A build without CUDA says so before it ever
    # looks at the workspace.
    _, out = _run([exe, "patch_match_stereo", "--workspace_path", "/nonexistent-probe"])
    if re.search(r"without\s+CUDA|CUDA\s+support", out, re.IGNORECASE):
        return Capability(
            "colmap_dense",
            Status.DEGRADED,
            detail="COLMAP was compiled without CUDA support.",
            remediation="Use a non-COLMAP mesh provider, or rebuild COLMAP with CUDA.",
        )
    return Capability(
        "colmap_dense",
        Status.AVAILABLE,
        detail="patch_match_stereo appears usable.",
    )


_BLENDER_VERSION_RE = re.compile(r"Blender\s+(\d+\.\d+(?:\.\d+)?)")
BLENDER_MIN_MAJOR = 4


def probe_blender() -> Capability:
    """Blender, run headless as the authoring stage.

    Checked for a major version because the Python API is version-sensitive enough
    that our scripts pin against it; discovering a 3.x API mismatch inside a
    background subprocess is a bad way to spend an afternoon.
    """
    exe = shutil.which("blender") or "/Applications/Blender.app/Contents/MacOS/Blender"
    if not os.path.exists(exe) and shutil.which("blender") is None:
        return Capability(
            "blender",
            Status.ABSENT,
            detail="blender is not on PATH and not in /Applications.",
            remediation="brew install --cask blender",
        )

    rc, out = _run([exe, "--version"])
    if rc != 0:
        return Capability(
            "blender",
            Status.UNVERIFIED,
            detail=f"`blender --version` exited {rc}: {out[:200]}",
            remediation="Check the Blender installation.",
        )

    match = _BLENDER_VERSION_RE.search(out)
    if match is None:
        return Capability(
            "blender",
            Status.UNVERIFIED,
            detail=f"could not parse a version from: {out[:200]}",
            remediation="Check the Blender installation.",
        )

    version = match.group(1)
    if int(version.split(".")[0]) < BLENDER_MIN_MAJOR:
        return Capability(
            "blender",
            Status.DEGRADED,
            version=version,
            detail=f"Blender {version} is older than the required {BLENDER_MIN_MAJOR}.x API.",
            remediation="brew install --cask blender",
        )
    return Capability("blender", Status.AVAILABLE, version=version, detail=exe)


OBJECT_CAPTURE_MIN_MACOS = 12

#: The compiled Swift helper that fronts PhotogrammetrySession. Overridable so a
#: packaged install can point at a binary outside the source tree.
OBJECT_CAPTURE_HELPER = Path(
    os.environ.get(
        "MACHINE_TWIN_OBJECT_CAPTURE_HELPER",
        Path(__file__).resolve().parent.parent
        / "tools"
        / "object-capture"
        / "object-capture-helper",
    )
)


def probe_object_capture(helper: Path | None = None) -> Capability:
    """Apple Object Capture (RealityKit PhotogrammetrySession).

    The primary mesh path on this host, because COLMAP's dense stage cannot run on
    macOS. Support is a hardware question -- GPU and memory -- not an OS version
    question, so the only honest probe is to ask the framework itself. That means
    building the Swift helper first; until it exists this reports UNVERIFIED rather
    than inferring support from a version number that does not determine it.
    """
    if platform.system() != "Darwin":
        return Capability(
            "object_capture",
            Status.ABSENT,
            detail="Object Capture is macOS-only.",
            remediation="Use the openmvs mesh provider on this platform.",
        )

    mac_version = platform.mac_ver()[0]
    try:
        major = int(mac_version.split(".")[0])
    except (ValueError, IndexError):
        major = 0
    if major and major < OBJECT_CAPTURE_MIN_MACOS:
        return Capability(
            "object_capture",
            Status.DEGRADED,
            version=mac_version,
            detail=f"Object Capture needs macOS {OBJECT_CAPTURE_MIN_MACOS}+; found {mac_version}.",
            remediation="Update macOS, or use the openmvs mesh provider.",
        )

    binary = helper or OBJECT_CAPTURE_HELPER
    if not binary.exists():
        rc, _ = _run(["xcrun", "--find", "swiftc"])
        if rc != 0:
            return Capability(
                "object_capture",
                Status.ABSENT,
                version=mac_version,
                detail="swiftc not found; the helper binary cannot be built.",
                remediation="xcode-select --install",
            )
        return Capability(
            "object_capture",
            Status.UNVERIFIED,
            version=mac_version,
            detail="swiftc is present but the helper has not been built.",
            remediation="make build-object-capture",
        )

    rc, out = _run([str(binary), "probe"])
    try:
        payload = json.loads(out.splitlines()[0]) if out else {}
    except (json.JSONDecodeError, IndexError):
        return Capability(
            "object_capture",
            Status.UNVERIFIED,
            version=mac_version,
            detail=f"helper returned unparseable output: {out[:200]}",
            remediation="make build-object-capture",
        )

    if rc == 0 and payload.get("supported") is True:
        return Capability(
            "object_capture",
            Status.AVAILABLE,
            version=mac_version,
            detail=f"PhotogrammetrySession supported; helper at {binary}",
        )

    return Capability(
        "object_capture",
        Status.DEGRADED,
        version=mac_version,
        detail=payload.get("reason", "PhotogrammetrySession reported no support."),
        remediation="Use the openmvs mesh provider, or run on Apple Silicon hardware.",
    )


def probe_ffmpeg() -> Capability:
    exe = shutil.which("ffmpeg")
    if exe is None:
        return Capability(
            "ffmpeg",
            Status.ABSENT,
            detail="ffmpeg is not on PATH; video frame extraction is unavailable.",
            remediation="brew install ffmpeg",
        )
    _, out = _run([exe, "-version"])
    first = out.splitlines()[0] if out else ""
    match = re.search(r"ffmpeg version (\S+)", first)
    return Capability("ffmpeg", Status.AVAILABLE, version=match.group(1) if match else None)


def probe_docker() -> Capability:
    exe = shutil.which("docker")
    if exe is None:
        return Capability(
            "docker",
            Status.ABSENT,
            detail="docker is not on PATH; Postgres and OpenMVS fallbacks are unavailable.",
            remediation="Install Docker Desktop.",
        )
    rc, out = _run([exe, "--version"])
    if rc != 0:
        return Capability("docker", Status.UNVERIFIED, detail=out[:200])
    match = re.search(r"Docker version (\S+?),", out)
    return Capability("docker", Status.AVAILABLE, version=match.group(1) if match else None)


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------

#: Mesh providers in preference order. The first whose capability is AVAILABLE wins.
#: CAD and photogrammetry outrank generated geometry; this list is about which
#: photogrammetry backend the host can actually run, not about geometry quality.
MESH_PROVIDER_PREFERENCE = (
    ("colmap_dense", "colmap_dense"),
    ("object_capture", "object_capture"),
)


def probe_all() -> CapabilityReport:
    report = CapabilityReport(host=probe_host())

    colmap = probe_colmap()
    cuda = probe_cuda()

    for cap in (
        probe_python(),
        cuda,
        colmap,
        probe_colmap_dense(colmap, cuda),
        probe_blender(),
        probe_object_capture(),
        probe_ffmpeg(),
        probe_docker(),
    ):
        report.capabilities[cap.name] = cap

    return report


def select_mesh_provider(report: CapabilityReport) -> str | None:
    """Pick the mesh backend this host can actually run, or None.

    Returning None is a real answer and callers must handle it: on a host with
    neither a CUDA COLMAP nor a working Object Capture helper, the reconstruction
    stage has no mesh path and must fail rather than emit a placeholder.
    """
    for cap_name, provider in MESH_PROVIDER_PREFERENCE:
        cap = report.capabilities.get(cap_name)
        if cap is not None and cap.ok:
            return provider
    return None


_CACHED: CapabilityReport | None = None


def get_report(*, refresh: bool = False) -> CapabilityReport:
    """The capability report, probed once per process.

    Probing shells out to half a dozen binaries; doing that per request would put
    several hundred milliseconds on every call. `refresh` exists because a user who
    has just run `brew install colmap` should not have to restart the service.
    """
    global _CACHED
    if _CACHED is None or refresh:
        _CACHED = probe_all()
    return _CACHED
