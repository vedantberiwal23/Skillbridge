"""Test fixtures.

Every test gets its own storage root and database. `settings` is a module-level
singleton and `get_engine` caches, so both have to be redirected and the engine
dropped, or the first test to run pins every later one to its database file.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from machine_twin import db
from machine_twin.config import settings


@pytest.fixture(autouse=True)
def isolated_storage(tmp_path: Path) -> Iterator[Path]:
    original_root = settings.storage_root
    original_url = settings.database_url

    settings.storage_root = tmp_path / "data"
    settings.database_url = f"sqlite:///{tmp_path / 'test.db'}"
    settings.ensure_dirs()
    db.reset_engine()
    db.init_db()

    yield settings.storage_root

    db.reset_engine()
    settings.storage_root = original_root
    settings.database_url = original_url


def write_image(path: Path, *, sharp: bool = True, size: tuple[int, int] = (64, 64)) -> Path:
    """Write a JPEG that is either high or low in edge energy.

    Random noise has strong second derivatives everywhere; a flat fill has none.
    That is exactly what variance-of-Laplacian measures, so these two stand in for
    a focused frame and a motion-blurred one.
    """
    rng = np.random.default_rng(seed=abs(hash(path.name)) % (2**32))
    if sharp:
        data = rng.integers(0, 255, size=(size[1], size[0], 3), dtype=np.uint8)
    else:
        data = np.full((size[1], size[0], 3), 128, dtype=np.uint8)
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(data).save(path, "JPEG", quality=95)
    return path


@pytest.fixture
def sharp_image(tmp_path: Path) -> Path:
    return write_image(tmp_path / "sharp.jpg", sharp=True)


@pytest.fixture
def blurry_image(tmp_path: Path) -> Path:
    return write_image(tmp_path / "blurry.jpg", sharp=False)
