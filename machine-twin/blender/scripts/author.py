"""Blender authoring: reconstruction output in, browser-ready GLB out.

Run headless by `machine_twin.pipeline.authoring.blender`, never by hand:

    blender --background --python blender/scripts/author.py -- \
        --input model.usdz --out-dir authoring/ --project-id <id>

Responsibilities, in order: import, clean, separate into components, mint stable
ids, decimate to LODs, export GLB, render a poster. Results are printed as a
single JSON line prefixed with AUTHORING_RESULT so the driver never has to parse
Blender's chatty log.

On component separation, plainly: Object Capture returns **one merged mesh**. A
photogrammetry scan has no notion of parts -- it is a single surface that happens
to have a pump-shaped region on it. Splitting by loose geometry is the only
separation available without semantics, and on a clean scan it usually finds one
shell. So this script reports the number of components it actually found and
labels every one `unknown_component`. It does not invent a hierarchy. Real part
identification needs the vision masks projected onto the surface (M2/M6) or a
person doing it in the review UI, and pretending otherwise would ship a
"component hierarchy" containing one component named after a guess.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy  # type: ignore[import-not-found]

#: Per level of detail: (mesh decimation ratio, texture scale). LOD0 is untouched.
#:
#: Both halves are needed, and the texture half does most of the work. Measured on
#: the first run of this script, decimating geometry alone:
#:
#:     LOD0  5285 verts  1519580 bytes
#:     LOD1  2388 verts  1498796 bytes   (-1.4%)
#:     LOD2   964 verts  1484840 bytes   (-2.3%)
#:
#: Cutting the mesh by 82% moved the file by 2%, because a photogrammetry GLB is
#: almost entirely baked texture -- albedo, normal and AO. An LOD scheme that only
#: decimates geometry is therefore no LOD scheme at all on the network, which is
#: exactly the budget that matters for a worker on a 2g connection.
LOD_LEVELS = (
    (1.0, 1.0),
    (0.45, 0.5),
    (0.18, 0.25),
)

#: Islands smaller than this fraction of the largest component are scan debris --
#: floating fragments of ground plane or background that photogrammetry always
#: produces. Dropped rather than presented as components.
DEBRIS_VOLUME_FRACTION = 0.02

#: Merge threshold for duplicate vertices, in metres of the imported scale.
MERGE_DISTANCE = 0.0005

POSTER_RESOLUTION = (1200, 900)


def log(message: str) -> None:
    print(f"[author] {message}", file=sys.stderr)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            collection.remove(block)


def import_mesh(path: Path) -> list[bpy.types.Object]:
    suffix = path.suffix.lower()
    if suffix in (".usdz", ".usd", ".usdc", ".usda"):
        bpy.ops.wm.usd_import(filepath=str(path))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(path))
    elif suffix == ".ply":
        bpy.ops.wm.ply_import(filepath=str(path))
    elif suffix == ".stl":
        bpy.ops.wm.stl_import(filepath=str(path))
    else:
        raise SystemExit(f"unsupported input format: {suffix}")

    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"no mesh found in {path}")
    return meshes


def select_only(objects: list[bpy.types.Object]) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def clean(meshes: list[bpy.types.Object]) -> None:
    """Weld duplicate vertices, drop loose edges, make normals consistent.

    Photogrammetry output is watertight-ish but noisy at seams, and inconsistent
    normals make a GLB render with black patches in a browser -- a defect that
    looks like a broken model rather than a dirty scan.
    """
    for obj in meshes:
        select_only([obj])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=MERGE_DISTANCE)
        bpy.ops.mesh.delete_loose()
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")


def bbox_volume(obj: bpy.types.Object) -> float:
    x, y, z = obj.dimensions
    return float(x * y * z)


def separate_components(meshes: list[bpy.types.Object]) -> list[bpy.types.Object]:
    """Split into disconnected shells.

    The only separation possible without semantics. Returns the surviving
    components sorted largest-first, which is what makes id assignment
    deterministic across runs.
    """
    for obj in meshes:
        select_only([obj])
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE")
        bpy.ops.object.mode_set(mode="OBJECT")

    components = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    components.sort(key=bbox_volume, reverse=True)
    if not components:
        return []

    largest = bbox_volume(components[0])
    kept: list[bpy.types.Object] = []
    for obj in components:
        if largest > 0 and bbox_volume(obj) / largest < DEBRIS_VOLUME_FRACTION:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        kept.append(obj)
    return kept


def assign_ids(components: list[bpy.types.Object], project_id: str) -> list[dict[str, object]]:
    """Mint stable component ids.

    These are the identity the whole system hangs on: they become
    `AssetHotspot.id` in SkillBridge, so tapping a part in the viewer resolves to
    this row. They are minted once and never regenerated -- a human renaming a
    component in review changes its *label*, never its id.

    The label starts as `unknown_component` because nothing here knows what any of
    these shells are.
    """
    manifest: list[dict[str, object]] = []
    for index, obj in enumerate(components, start=1):
        stable_id = f"SKB_COMPONENT_{index:03d}"
        obj.name = stable_id
        obj.data.name = f"{stable_id}_mesh"

        # Origin to the component's own centre so rotation and explode views in
        # the viewer pivot sensibly instead of around the scan origin.
        select_only([obj])
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")

        manifest.append(
            {
                "stable_id": stable_id,
                "label": "unknown_component",
                "category": "unknown",
                "vertex_count": len(obj.data.vertices),
                "face_count": len(obj.data.polygons),
                "dimensions": [round(d, 4) for d in obj.dimensions],
                "location": [round(v, 4) for v in obj.location],
                "validation_status": "review_required",
            }
        )

    log(f"{len(manifest)} component(s) after separation")
    return manifest


def frame_all() -> tuple[tuple[float, float, float], float]:
    """Centre of everything, and a radius that encloses it."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        return (0.0, 0.0, 0.0), 1.0

    corners = [obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2)
    radius = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) / 2 or 1.0
    return centre, radius


def scale_textures(factor: float) -> int:
    """Downscale every image in the file. Returns how many were touched."""
    if factor >= 1.0:
        return 0
    touched = 0
    for image in bpy.data.images:
        width, height = image.size
        if width < 2 or height < 2:
            continue
        image.scale(max(1, int(width * factor)), max(1, int(height * factor)))
        touched += 1
    return touched


def export_glb(out_dir: Path, name: str, ratio: float, texture_scale: float) -> dict[str, object]:
    """Export one level of detail.

    Decimation is applied to a duplicate and undone afterwards, so each LOD is
    derived from the full-resolution mesh rather than from the previous level --
    chaining decimations compounds the error and the smallest LOD ends up far
    worse than its ratio suggests.
    """
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    if ratio < 1.0:
        for obj in meshes:
            modifier = obj.modifiers.new(name="lod", type="DECIMATE")
            modifier.ratio = ratio
            select_only([obj])
            bpy.ops.object.modifier_apply(modifier=modifier.name)

    scaled = scale_textures(texture_scale)

    path = out_dir / name
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_yup=True,
    )

    verts = sum(len(o.data.vertices) for o in meshes)
    faces = sum(len(o.data.polygons) for o in meshes)
    size = path.stat().st_size if path.is_file() else 0
    log(f"{name}: {verts} verts, {faces} faces, {size} bytes")
    return {
        "file": name,
        "ratio": ratio,
        "texture_scale": texture_scale,
        "textures_scaled": scaled,
        "vertex_count": verts,
        "face_count": faces,
        "size_bytes": size,
    }


def render_poster(out_dir: Path) -> str | None:
    """Render the 2D fallback still.

    Not decoration: SkillBridge's viewer shows this whenever the device or network
    cannot carry live 3D, and tap-a-part has to keep working against it. A twin
    without a poster silently loses the low-bandwidth path.
    """
    centre, radius = frame_all()

    bpy.ops.object.light_add(type="SUN", location=(centre[0] + radius * 2, centre[1] - radius * 2,
                                                   centre[2] + radius * 3))
    bpy.context.active_object.data.energy = 3.0
    bpy.ops.object.light_add(type="AREA", location=(centre[0] - radius * 2, centre[1] + radius * 2,
                                                    centre[2] + radius * 2))
    bpy.context.active_object.data.energy = radius * radius * 260.0
    bpy.context.active_object.data.size = radius * 4

    distance = radius * 3.2
    bpy.ops.object.camera_add(
        location=(
            centre[0] + distance * math.cos(math.radians(35)),
            centre[1] - distance * math.sin(math.radians(55)),
            centre[2] + distance * 0.55,
        )
    )
    camera = bpy.context.active_object
    target = bpy.data.objects.new("poster_target", None)
    bpy.context.collection.objects.link(target)
    target.location = centre
    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = POSTER_RESOLUTION
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 88

    path = out_dir / "poster.webp"
    scene.render.filepath = str(path)
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as exc:
        log(f"poster render failed: {exc}")
        return None
    return path.name if path.is_file() else None


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--project-id", required=True)
    args = parser.parse_args(argv)

    args.out_dir.mkdir(parents=True, exist_ok=True)

    clear_scene()
    meshes = import_mesh(args.input)
    clean(meshes)
    components = separate_components(meshes)
    manifest = assign_ids(components, args.project_id)

    # Poster first: the LOD passes mutate geometry in place.
    poster = render_poster(args.out_dir)

    lods = []
    names = ("machine.glb", "lod1.glb", "lod2.glb")
    for level, (name, (ratio, texture_scale)) in enumerate(
        zip(names, LOD_LEVELS, strict=True)
    ):
        if level > 0:
            # Re-import to derive each level from the original. Chaining would
            # compound both the decimation error and the texture resampling, so
            # the smallest level would end up far worse than its ratios suggest.
            clear_scene()
            reimported = import_mesh(args.input)
            clean(reimported)
            assign_ids(separate_components(reimported), args.project_id)
        lods.append({**export_glb(args.out_dir, name, ratio, texture_scale), "lod": level})

    print(
        "AUTHORING_RESULT "
        + json.dumps(
            {
                "machine_id": f"SKB_MACHINE_{args.project_id[:8].upper()}",
                "components": manifest,
                "lods": lods,
                "poster": poster,
            }
        )
    )


if __name__ == "__main__":
    main()
