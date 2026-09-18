"""Command line entry point.

`machine-twin verify` is Milestone 0's deliverable: a capability report the
pipeline reads at runtime, and a human reads before trusting a milestone claim.
"""

from __future__ import annotations

import argparse
import sys
from typing import TextIO

from machine_twin.capabilities import (
    CapabilityReport,
    Status,
    probe_all,
    select_mesh_provider,
)

_MARK = {
    Status.AVAILABLE: "ok  ",
    Status.DEGRADED: "warn",
    Status.ABSENT: "MISS",
    Status.UNVERIFIED: "?   ",
}


def render(report: CapabilityReport, out: TextIO) -> None:
    host = report.host
    print("HOST", file=out)
    print(
        f"  {host.system} {host.release} · {host.machine} · "
        f"{host.cpu_count} cores · {host.memory_gb} GB · python {host.python}",
        file=out,
    )
    print(file=out)

    print("CAPABILITIES", file=out)
    width = max(len(n) for n in report.capabilities) if report.capabilities else 0
    for name, cap in report.capabilities.items():
        version = f" {cap.version}" if cap.version else ""
        print(f"  [{_MARK[cap.status]}] {name.ljust(width)}{version}", file=out)
        if cap.detail:
            print(f"         {cap.detail}", file=out)
        if cap.remediation and not cap.ok:
            print(f"         fix: {cap.remediation}", file=out)
    print(file=out)

    provider = select_mesh_provider(report)
    print("MESH STRATEGY", file=out)
    if provider is None:
        print("  none available - the reconstruction stage cannot produce a mesh.", file=out)
        print("  Resolve one of the mesh capabilities above before Milestone 4.", file=out)
    else:
        print(f"  {provider}", file=out)


def cmd_verify(args: argparse.Namespace) -> int:
    report = probe_all()
    if args.json:
        print(report.to_json())
    else:
        render(report, sys.stdout)

    # Exit non-zero only on things that block the API from running at all. A
    # missing COLMAP is expected before Milestone 3 and must not fail the check --
    # `verify` reports the host, it does not assert a finished environment.
    blocking = [c for n, c in report.capabilities.items() if n == "python" and not c.ok]
    return 1 if blocking else 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="machine-twin")
    sub = parser.add_subparsers(dest="command", required=True)

    verify = sub.add_parser("verify", help="probe host capabilities")
    verify.add_argument("--json", action="store_true", help="emit the raw report")
    verify.set_defaults(func=cmd_verify)

    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
