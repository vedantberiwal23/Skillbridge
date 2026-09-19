"""Swappable backends for every stage that depends on an external model or tool.

The brief's §38 rule -- "use interfaces so models can be replaced", "do not tightly
couple the application to one AI provider" -- is load-bearing here for a specific
reason: the mesh backend is not a preference, it is a function of the host. COLMAP
owns sparse SfM everywhere, but the dense stage needs CUDA and this is an Apple
Silicon machine, so the backend that produces an actual mesh has to be selectable
at runtime from the capability report rather than imported at the call site.
"""

from machine_twin.providers.base import (
    DocumentProvider,
    GeometryProcessor,
    LLMProvider,
    MeshProvider,
    MeshResult,
    SparseProvider,
    SparseResult,
    VisionProvider,
)

__all__ = [
    "DocumentProvider",
    "GeometryProcessor",
    "LLMProvider",
    "MeshProvider",
    "MeshResult",
    "SparseProvider",
    "SparseResult",
    "VisionProvider",
]
