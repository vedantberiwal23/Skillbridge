"""The write-once guarantee.

§5 says originals are never overwritten. These tests assert the mechanism rather
than the intention: the store refuses to rewrite, and the filesystem refuses to
let anyone else.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest

from machine_twin.storage.content_store import ContentStore


@pytest.fixture
def store(tmp_path: Path) -> ContentStore:
    return ContentStore(tmp_path / "objects")


class TestAddressing:
    def test_same_bytes_give_the_same_address(self, store: ContentStore) -> None:
        first = store.put_bytes(b"hydraulic power unit")
        second = store.put_bytes(b"hydraulic power unit")
        assert first.sha256 == second.sha256
        assert first.path == second.path

    def test_second_store_is_reported_as_a_duplicate(self, store: ContentStore) -> None:
        assert store.put_bytes(b"pump").newly_stored is True
        assert store.put_bytes(b"pump").newly_stored is False

    def test_different_bytes_do_not_collide(self, store: ContentStore) -> None:
        assert store.put_bytes(b"pump").sha256 != store.put_bytes(b"valve").sha256

    def test_size_is_recorded(self, store: ContentStore) -> None:
        assert store.put_bytes(b"x" * 1234).size_bytes == 1234


class TestWriteOnce:
    def test_stored_objects_are_read_only_on_disk(self, store: ContentStore) -> None:
        stored = store.put_bytes(b"relief valve")
        with pytest.raises(PermissionError):
            stored.path.open("wb")

    def test_restoring_identical_content_does_not_rewrite(self, store: ContentStore) -> None:
        first = store.put_bytes(b"reservoir")
        mtime = first.path.stat().st_mtime_ns
        second = store.put_bytes(b"reservoir")
        assert second.path.stat().st_mtime_ns == mtime

    def test_no_temp_files_survive(self, store: ContentStore) -> None:
        store.put_bytes(b"filter")
        assert list(store.root.glob(".incoming-*")) == []


class TestWorkingCopies:
    def test_copy_out_is_writable(self, store: ContentStore, tmp_path: Path) -> None:
        # The original is read-only and copy2 carries mode across, so without an
        # explicit chmod every downstream stage would fail on its own working copy.
        stored = store.put_bytes(b"directional valve")
        copy = store.copy_out(stored.sha256, tmp_path / "work" / "copy.bin")
        copy.write_bytes(b"modified")
        assert copy.read_bytes() == b"modified"

    def test_modifying_a_copy_leaves_the_original_intact(
        self, store: ContentStore, tmp_path: Path
    ) -> None:
        stored = store.put_bytes(b"directional valve")
        copy = store.copy_out(stored.sha256, tmp_path / "copy.bin")
        copy.write_bytes(b"modified")
        assert stored.path.read_bytes() == b"directional valve"

    def test_missing_object_raises(self, store: ContentStore, tmp_path: Path) -> None:
        with pytest.raises(FileNotFoundError):
            store.copy_out("0" * 64, tmp_path / "nope.bin")


class TestStreaming:
    def test_large_streams_hash_correctly(self, store: ContentStore) -> None:
        import hashlib

        payload = b"a" * (3 * 1024 * 1024 + 17)  # spans several chunks unevenly
        stored = store.put_stream(io.BytesIO(payload))
        assert stored.sha256 == hashlib.sha256(payload).hexdigest()
        assert stored.size_bytes == len(payload)
