"""Author a CAD assembly into a browser-ready GLB, preserving part structure.

Distinct from the photogrammetry authoring path, and deliberately so. That one
has to *infer* parts by splitting connected geometry, and on a scan it finds one
shell. A CAD assembly already knows its parts, so the job here is to not destroy
that: each OBJ group becomes one object, keeps its SKB_COMPONENT id, and keeps
its material.

This is the half of a Machine Twin photographs cannot supply - separable,
nameable internals - so part identity is the whole point of the conversion.
"""

from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
import bpy

LOD_LEVELS = ((1.0, 1.0), (0.45, 1.0), (0.18, 1.0))
POSTER_RESOLUTION = (1200, 900)


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.cameras, bpy.data.lights):
        for b in list(coll):
            coll.remove(b)


def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def import_parts(src: Path):
    """Import an assembly, one object per part.

    glTF is the preferred input format from CAD: it carries per-part appearances
    natively, where a STEP round-trip drops them to a single default grey. OBJ is
    kept as a fallback, where `split_groups` is what stops the whole assembly
    collapsing into one mesh and losing every part id.
    """
    suffix = src.suffix.lower()
    if suffix in (".gltf", ".glb"):
        bpy.ops.import_scene.gltf(filepath=str(src))
    elif suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(src), use_split_groups=True,
                              use_split_objects=True)
    else:
        raise SystemExit(f"unsupported input: {suffix}")
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def frame_all():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pts = [obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
    xs, ys, zs = [p.x for p in pts], [p.y for p in pts], [p.z for p in pts]
    centre = ((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, (min(zs)+max(zs))/2)
    radius = max(max(xs)-min(xs), max(ys)-min(ys), max(zs)-min(zs)) / 2 or 1.0
    return centre, radius


def export_glb(out_dir: Path, name: str, ratio: float):
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if ratio < 1.0:
        for o in meshes:
            m = o.modifiers.new(name="lod", type="DECIMATE")
            m.ratio = ratio
            select_only([o])
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError:
                o.modifiers.remove(m)

    path = out_dir / name
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB",
                              use_selection=True,
                              export_draco_mesh_compression_enable=False,
                              export_yup=True)
    verts = sum(len(o.data.vertices) for o in meshes)
    faces = sum(len(o.data.polygons) for o in meshes)
    size = path.stat().st_size if path.is_file() else 0
    print(f"[cad] {name}: {verts} verts, {faces} faces, {size} bytes, {len(meshes)} parts")
    return {"file": name, "ratio": ratio, "vertex_count": verts,
            "face_count": faces, "size_bytes": size}


def render_poster(out_dir: Path):
    centre, radius = frame_all()
    bpy.ops.object.light_add(type="SUN", location=(centre[0]+radius*2, centre[1]-radius*2, centre[2]+radius*3))
    bpy.context.active_object.data.energy = 3.0
    bpy.ops.object.light_add(type="AREA", location=(centre[0]-radius*2, centre[1]+radius*2, centre[2]+radius*2))
    bpy.context.active_object.data.energy = max(50.0, radius*radius*3)
    bpy.context.active_object.data.size = radius*4

    # Orthographic, sized to the bounding sphere. A perspective camera needs the
    # distance solved against the FOV, and CAD arrives in whatever units the
    # author used - millimetres here - so that guess was framing a fragment.
    d = radius * 4.0
    bpy.ops.object.camera_add(location=(centre[0]+d*0.6, centre[1]-d*0.7, centre[2]+d*0.35))
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = radius * 2.5
    cam.data.clip_start = radius * 0.01
    cam.data.clip_end = d * 4
    tgt = bpy.data.objects.new("t", None); bpy.context.collection.objects.link(tgt)
    tgt.location = centre
    c = cam.constraints.new(type="TRACK_TO"); c.target = tgt
    c.track_axis, c.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
    bpy.context.scene.camera = cam

    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try: sc.render.engine = eng; break
        except TypeError: continue
    sc.render.resolution_x, sc.render.resolution_y = POSTER_RESOLUTION
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.quality = 90
    path = out_dir / "poster.webp"
    sc.render.filepath = str(path)
    try:
        bpy.ops.render.render(write_still=True)
    except RuntimeError as e:
        print(f"[cad] poster failed: {e}")
        return None
    return path.name if path.is_file() else None


def main():
    argv = sys.argv[sys.argv.index("--")+1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--obj", required=True, type=Path)  # or .gltf/.glb
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--project-id", default="cad")
    a = ap.parse_args(argv)
    a.out_dir.mkdir(parents=True, exist_ok=True)

    clear()
    meshes = import_parts(a.obj)
    print(f"[cad] imported {len(meshes)} parts")

    manifest = []
    # Sorted by volume so ids are deterministic across re-imports.
    meshes.sort(key=lambda o: -(o.dimensions[0] * o.dimensions[1] * o.dimensions[2]))
    for index, o in enumerate(meshes, start=1):
        source_name = o.name
        o.name = f"SKB_COMPONENT_{index:03d}"
        select_only([o])
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        mats = [m.name for m in o.data.materials if m]
        manifest.append({
            "stable_id": o.name,
            "source_name": source_name,
            "label": "unknown_component",
            "category": "unknown",
            "vertex_count": len(o.data.vertices),
            "face_count": len(o.data.polygons),
            "dimensions": [round(d, 5) for d in o.dimensions],
            "location": [round(v, 5) for v in o.location],
            "materials": mats,
            "validation_status": "review_required",
        })

    poster = render_poster(a.out_dir)

    lods = []
    for level, (name, (ratio, _)) in enumerate(
            zip(("machine.glb", "lod1.glb", "lod2.glb"), LOD_LEVELS, strict=True)):
        if level > 0:
            clear()
            import_parts(a.obj)
        lods.append({**export_glb(a.out_dir, name, ratio), "lod": level})

    print("AUTHORING_RESULT " + json.dumps({
        "machine_id": f"SKB_MACHINE_{a.project_id[:8].upper()}",
        "components": manifest, "lods": lods, "poster": poster,
    }))


if __name__ == "__main__":
    main()
