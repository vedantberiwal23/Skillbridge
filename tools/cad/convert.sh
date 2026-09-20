#!/usr/bin/env bash
#
# Convert a CAD assembly into browser-ready GLB, preserving part separation.
#
#   ./convert.sh <input> <output-dir>
#
# Input may be .step/.stp, or .gltf/.glb/.obj.
#
# Which format to give it, measured on the same source assembly:
#
#   STEP export   37 parts, 28,984 verts,  5 colours, mostly one default grey
#   glTF export   37 parts, 68,832 verts, 14 colours, correct
#
# Onshape's STEP export tessellates coarsely and drops most appearances; its
# glTF export keeps both. Prefer glTF where the exporter offers it. STEP still
# works, and is the right choice when glTF is not available.
#
# Requires Blender. STEP additionally requires OpenCascade:
#   brew install --cask blender
#   pip install -r requirements.txt     # only for .step input

set -euo pipefail

SRC="${1:-}"
OUT="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$SRC" || -z "$OUT" ]]; then
  echo "usage: ./convert.sh <input.step|.gltf|.glb|.obj> <output-dir>" >&2
  exit 64
fi
if [[ ! -f "$SRC" ]]; then
  echo "no such file: $SRC" >&2
  exit 66
fi
if ! command -v blender >/dev/null 2>&1; then
  echo "blender is not on PATH. Install it with: brew install --cask blender" >&2
  exit 69
fi

mkdir -p "$OUT"
ext="${SRC##*.}"
ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"

case "$ext" in
  step|stp)
    # STEP is boundary representation: it has to be tessellated into meshes
    # first, and that pass is also what recovers part names and colours.
    echo "== tessellating STEP =="
    python3 "$HERE/step_reader.py" "$SRC" "$OUT/assembly.obj"
    MESH="$OUT/assembly.obj"
    ;;
  gltf|glb|obj)
    MESH="$SRC"
    ;;
  *)
    echo "unsupported input: .$ext (use .step .stp .gltf .glb .obj)" >&2
    exit 65
    ;;
esac

echo "== authoring GLB =="
blender --background --python "$HERE/cad_author.py" -- \
  --obj "$MESH" --out-dir "$OUT" --project-id "$(basename "${SRC%.*}")" \
  2>&1 | grep -E '^\[cad\]' || true

echo
echo "output in $OUT:"
ls -la "$OUT"/*.glb "$OUT"/poster.webp 2>/dev/null | awk '{printf "  %-16s %8.0f KB\n", $NF, $5/1024}'
echo
echo "To use in the app, copy the full-detail model and poster into web/public/twin/:"
echo "  cp $OUT/machine.glb  web/public/twin/machine.glb"
echo "  cp $OUT/poster.webp  web/public/twin/poster.webp"
