"""Content-addressed store for uploaded originals.

§5 of the brief: "Never overwrite original assets." That is enforced here three
ways rather than by convention -- an object's name is its own hash, an existing
object is never rewritten, and stored files are made read-only. A caller that
tries to mutate an original gets a PermissionError from the filesystem, which is
a much better failure than silent corruption discovered at publish time.

Deduplication falls out of the addressing: uploading the same bytes twice stores
one object. The Asset rows stay distinct, because the same photograph submitted to
two projects is two assets with two provenance chains.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

#: Streamed rather than read whole: video uploads run to hundreds of megabytes and
#: there is no reason for any of them to be resident.
CHUNK_BYTES = 1024 * 1024

#: Read-only for everyone, including the owner.
_READ_ONLY = 0o444


@dataclass(frozen=True)
class StoredObject:
    sha256: str
    path: Path
    size_bytes: int
    #: False when an object with this hash was already present. Callers use it to
    #: skip re-deriving thumbnails and frames for content they have seen.
    newly_stored: bool


class ContentStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def path_for(self, sha256: str) -> Path:
        """Fan out over two levels of prefix.

        A single flat directory degrades badly once a few thousand objects land in
        it, and a photogrammetry project is a few hundred objects on its own.
        """
        return self.root / sha256[:2] / sha256[2:4] / sha256

    def exists(self, sha256: str) -> bool:
        return self.path_for(sha256).is_file()

    def put_stream(self, source: BinaryIO) -> StoredObject:
        """Store a stream, returning its address.

        The hash is not known until the last byte, so the content lands in a temp
        file first and is moved into place afterwards. The move is atomic within
        the same filesystem, so a crash mid-write leaves a temp file rather than a
        half-written object under a hash that claims to describe it.
        """
        digest = hashlib.sha256()
        size = 0

        fd, tmp_name = tempfile.mkstemp(dir=self.root, prefix=".incoming-")
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "wb") as out:
                while chunk := source.read(CHUNK_BYTES):
                    digest.update(chunk)
                    size += len(chunk)
                    out.write(chunk)

            sha256 = digest.hexdigest()
            target = self.path_for(sha256)
            target.parent.mkdir(parents=True, exist_ok=True)

            if target.is_file():
                # Already stored. The existing object is authoritative and is not
                # touched -- rewriting it would violate the write-once guarantee
                # for identical content just as surely as for different content.
                tmp.unlink(missing_ok=True)
                return StoredObject(sha256, target, target.stat().st_size, newly_stored=False)

            os.replace(tmp, target)
            target.chmod(_READ_ONLY)
            return StoredObject(sha256, target, size, newly_stored=True)
        finally:
            tmp.unlink(missing_ok=True)

    def put_file(self, source: Path) -> StoredObject:
        with source.open("rb") as handle:
            return self.put_stream(handle)

    def put_bytes(self, data: bytes) -> StoredObject:
        import io

        return self.put_stream(io.BytesIO(data))

    def copy_out(self, sha256: str, destination: Path) -> Path:
        """Materialise a writable working copy.

        Every stage that needs to modify content goes through this. The copy is
        explicitly made writable, because `shutil.copy2` carries the read-only mode
        of the original across and the next stage would fail trying to write it.
        """
        source = self.path_for(sha256)
        if not source.is_file():
            raise FileNotFoundError(f"no stored object {sha256}")
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        destination.chmod(0o644)
        return destination

    def open(self, sha256: str) -> BinaryIO:
        path = self.path_for(sha256)
        if not path.is_file():
            raise FileNotFoundError(f"no stored object {sha256}")
        return path.open("rb")
