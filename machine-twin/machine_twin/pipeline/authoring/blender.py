"""Driver for the headless Blender authoring script.

Blender is invoked as a subprocess, never imported: `bpy` is only importable
inside Blender's own interpreter, which is a different Python from the project's.

The script prints one `AUTHORING_RESULT <json>` line. Blender's log is verbose,
writes to both streams and includes lines that look like results, so the driver
matches that prefix rather than trying to interpret the log.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCRIPT = Path(__file__).resolve().parents[3] / "blender" / "scripts" / "author.py"

RESULT_PREFIX = "AUTHORING_RESULT "

#: Decimation and three GLB exports of a scan-sized mesh. Generous; a runaway guard.
AUTHORING_TIMEOUT_S = 3600


class BlenderError(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthoringResult:
    machine_id: str
    components: list[dict[str, Any]]
    lods: list[dict[str, Any]]
    poster: str | None


class BlenderAuthoringProvider:
    name = "blender"

    def __init__(self, executable: str | None = None, script: Path | None = None) -> None:
        self.executable = executable or shutil.which("blender") or "blender"
        self.script = script or SCRIPT

    def author(self, source: Path, out_dir: Path, project_id: str) -> AuthoringResult:
        if shutil.which(self.executable) is None and not Path(self.executable).exists():
            raise BlenderError(
                "blender is not on PATH. Install it with `brew install --cask blender`."
            )
        if not self.script.is_file():
            raise BlenderError(f"authoring script missing at {self.script}")
        if not source.is_file():
            raise BlenderError(f"no mesh to author at {source}")

        out_dir.mkdir(parents=True, exist_ok=True)
        proc = subprocess.run(  # noqa: S603
            [
                self.executable,
                "--background",
                "--python",
                str(self.script),
                "--",
                "--input",
                str(source),
                "--out-dir",
                str(out_dir),
                "--project-id",
                project_id,
            ],
            capture_output=True,
            text=True,
            timeout=AUTHORING_TIMEOUT_S,
            check=False,
        )

        combined = f"{proc.stdout}\n{proc.stderr}"
        payload = None
        for line in combined.splitlines():
            if line.startswith(RESULT_PREFIX):
                payload = line[len(RESULT_PREFIX) :]

        if payload is None:
            # Blender exits 0 on some script failures, so a missing result line is
            # the real signal, not the return code.
            raise BlenderError(
                f"authoring produced no result (exit {proc.returncode}): {combined.strip()[-400:]}"
            )

        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise BlenderError(f"unparseable authoring result: {payload[:200]}") from exc

        return AuthoringResult(
            machine_id=data["machine_id"],
            components=data.get("components", []),
            lods=data.get("lods", []),
            poster=data.get("poster"),
        )
