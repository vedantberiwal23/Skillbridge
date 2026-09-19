"""Reconstruction workspace.

COLMAP and PhotogrammetrySession both want a directory of image *files* with
ordinary names. The content store holds objects named by hash and mounted
read-only, so the workspace stages a named view of the selected assets.

Symlinks rather than copies: a 40-image set is a few hundred megabytes, both tools
only read, and copying would double the storage for no benefit. Copying is the
fallback for filesystems that refuse links.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from machine_twin.storage.content_store import ContentStore


@dataclass(frozen=True)
class Workspace:
    root: Path

    @property
    def images(self) -> Path:
        return self.root / "images"

    @property
    def database(self) -> Path:
        return self.root / "database.db"

    @property
    def sparse(self) -> Path:
        return self.root / "sparse"

    @property
    def mesh(self) -> Path:
        return self.root / "mesh"

    def prepare(self) -> None:
        for path in (self.images, self.sparse, self.mesh):
            path.mkdir(parents=True, exist_ok=True)

    def reset(self) -> None:
        """Clear derived output, keeping nothing.

        A rerun must not read a previous run's sparse model: COLMAP's mapper
        appends a new sub-model directory rather than replacing, so a stale
        `sparse/0` would silently be picked up as this run's result.
        """
        if self.root.exists():
            shutil.rmtree(self.root)
        self.prepare()


def stage_images(
    store: ContentStore,
    assets: list[tuple[str, str]],
    destination: Path,
) -> list[Path]:
    """Materialise `(sha256, filename)` pairs as named files.

    Filenames are prefixed with an index so ordering is stable and two assets that
    happen to share a filename cannot collide -- which they will, since video
    frames from two uploads are both `walkaround_f0000.jpg`.
    """
    destination.mkdir(parents=True, exist_ok=True)
    staged: list[Path] = []

    for index, (sha256, filename) in enumerate(assets):
        suffix = Path(filename).suffix or ".jpg"
        target = destination / f"{index:04d}_{Path(filename).stem}{suffix}"
        source = store.path_for(sha256)
        if not source.is_file():
            raise FileNotFoundError(f"asset object {sha256} is missing from the store")

        target.unlink(missing_ok=True)
        try:
            target.symlink_to(source)
        except OSError:
            shutil.copy2(source, target)
            target.chmod(0o644)
        staged.append(target)

    return staged
