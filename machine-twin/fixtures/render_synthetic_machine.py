"""Render a synthetic machine from many viewpoints, as a reconstruction fixture.

Run under Blender, not the project interpreter:

    blender --background --python fixtures/render_synthetic_machine.py -- \
        --out fixtures/synthetic-hpu --views 36

Why this exists: §38 says that when a dependency or input is unavailable, create a
deterministic test fixture rather than pretend the real thing ran. Reconstruction
cannot be tested honestly without a multi-view image set, and until real
photographs of a real machine exist, rendered views of a known object are the only
input that exercises the same code path -- with the advantage that camera poses
are known exactly, so registration can be checked against ground truth.

The geometry is built from primitives here in this file. Nothing is imported from
any third-party content source.

Two details matter for photogrammetry and are easy to get wrong:

- The subject carries a high-frequency procedural texture. An untextured render is
  a flat-shaded surface with no local features, and SIFT finds nothing to match --
  the reconstruction fails for reasons that have nothing to do with the pipeline.
- The ground plane is textured but the world background is not. A textured
  background would sit effectively at infinity and produce matches with no
  parallax, which biases the solve; the ground gives a real planar reference that
  moves correctly between views.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy  # type: ignore[import-not-found]  # provided by Blender's interpreter

#: Kept modest: the fixture runs in CI-ish conditions on a laptop, and COLMAP's
#: exhaustive matcher is O(n^2).
DEFAULT_VIEWS = 36
DEFAULT_RESOLUTION = (960, 720)

#: Orbit geometry. A single elevation ring is enough to register; two would be
#: better for a real capture and is what the operator guidance recommends.
ORBIT_RADIUS = 7.0
ORBIT_HEIGHT = 3.0


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(collection):
            collection.remove(block)


def noisy_material(
    name: str,
    base: tuple[float, float, float],
    scale: float,
    *,
    contrast: float = 0.62,
) -> bpy.types.Material:
    """A material whose base colour carries high-contrast procedural noise.

    The noise is the whole point, and the first version of this fixture got it
    wrong in an instructive way: dark base colours with a gentle ramp produced
    renders that looked fine and registered 12 of 36 views, because SIFT had
    almost no local contrast to key on. Feature detection responds to *contrast*,
    not to colour, so the ramp now swings wide around a mid-grey and the scale is
    set per object relative to its size.

    This stands in for what photographs of real equipment always have: casting
    grain, machining marks, paint texture, dirt.
    """
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links

    bsdf = nodes["Principled BSDF"]

    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 12.0
    noise.inputs["Roughness"].default_value = 0.62

    ramp = nodes.new("ShaderNodeValToRGB")
    # Tight band around the noise midpoint: everything outside saturates, which is
    # what turns soft cloud-like noise into crisp high-frequency speckle.
    ramp.color_ramp.elements[0].position = 0.5 - contrast / 2
    ramp.color_ramp.elements[1].position = 0.5 + contrast / 2

    def clamp(value: float) -> float:
        return max(0.0, min(1.0, value))

    dark = tuple(clamp(channel * 0.45) for channel in base)
    light = tuple(clamp(channel * 1.6 + 0.28) for channel in base)
    ramp.color_ramp.elements[0].color = (*dark, 1.0)
    ramp.color_ramp.elements[1].color = (*light, 1.0)

    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # Varying roughness too: a uniformly rough surface shades flatly under a
    # moving camera, and specular variation gives matching more to work with.
    rough_ramp = nodes.new("ShaderNodeValToRGB")
    rough_ramp.color_ramp.elements[0].color = (0.35, 0.35, 0.35, 1.0)
    rough_ramp.color_ramp.elements[1].color = (0.85, 0.85, 0.85, 1.0)
    links.new(noise.outputs["Fac"], rough_ramp.inputs["Fac"])
    links.new(rough_ramp.outputs["Color"], bsdf.inputs["Roughness"])

    return material


def add(primitive: str, name: str, material: bpy.types.Material, **kwargs: object) -> None:
    getattr(bpy.ops.mesh, primitive)(**kwargs)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(material)


def build_machine() -> None:
    """A hydraulic-power-unit-shaped arrangement of primitives.

    Deliberately not a real machine: this is a reconstruction target, and what it
    needs is varied surface orientation, concavities and scale range, all of which
    a box with a few cylinders on it provides.
    """
    steel = noisy_material("Steel", (0.38, 0.40, 0.43), 90.0)
    painted = noisy_material("Painted", (0.20, 0.36, 0.48), 70.0)
    brass = noisy_material("Brass", (0.52, 0.42, 0.20), 130.0)
    # The plane is 40 units across, so a scale that looks high here is not: at 14
    # the ground had one feature every three units and read as flat grey.
    ground = noisy_material("Ground", (0.34, 0.33, 0.31), 420.0, contrast=0.5)

    # Reservoir: the bulk of the unit.
    add("primitive_cube_add", "reservoir", painted, size=2.0, location=(0, 0, 1.0))
    bpy.context.active_object.scale = (1.6, 1.0, 1.0)

    # Electric motor, lying on top.
    add(
        "primitive_cylinder_add", "motor", steel,
        radius=0.55, depth=1.8, location=(-0.7, 0, 2.6), rotation=(0, math.pi / 2, 0),
    )
    # Pump, coupled to the motor.
    add(
        "primitive_cylinder_add", "pump", steel,
        radius=0.38, depth=0.9, location=(0.85, 0, 2.6), rotation=(0, math.pi / 2, 0),
    )
    # Relief valve and gauge: small features that test detail retention.
    add("primitive_cylinder_add", "relief_valve", brass,
        radius=0.16, depth=0.7, location=(1.45, 0.35, 2.3))
    add("primitive_cylinder_add", "gauge", brass,
        radius=0.22, depth=0.12, location=(1.55, -0.45, 2.1), rotation=(math.pi / 2, 0, 0))
    # Filter canister.
    add("primitive_cylinder_add", "filter", steel,
        radius=0.25, depth=1.0, location=(-1.4, 0.6, 2.4))

    # Frame feet, giving the silhouette something to break up.
    for index, (x, y) in enumerate([(-1.4, -0.8), (1.4, -0.8), (-1.4, 0.8), (1.4, 0.8)]):
        add("primitive_cube_add", f"foot_{index}", steel, size=0.36, location=(x, y, 0.18))

    add("primitive_plane_add", "ground", ground, size=40.0, location=(0, 0, 0))


def setup_lighting() -> None:
    # Softer key with real fill. The first pass ran the sun hot enough to clip the
    # ground to white, destroying exactly the texture the fixture exists to provide.
    bpy.ops.object.light_add(type="SUN", location=(6, -6, 12))
    bpy.context.active_object.data.energy = 1.8
    bpy.ops.object.light_add(type="AREA", location=(-7, 5, 8))
    bpy.context.active_object.data.energy = 300.0
    bpy.context.active_object.data.size = 10.0
    bpy.ops.object.light_add(type="AREA", location=(5, 7, 5))
    bpy.context.active_object.data.energy = 180.0
    bpy.context.active_object.data.size = 10.0

    world = bpy.data.worlds.new("World") if not bpy.data.worlds else bpy.data.worlds[0]
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.20, 0.22, 0.26, 1.0)


def setup_camera() -> tuple[bpy.types.Object, bpy.types.Object]:
    target = bpy.data.objects.new("target", None)
    bpy.context.collection.objects.link(target)
    target.location = (0, 0, 1.6)

    bpy.ops.object.camera_add(location=(ORBIT_RADIUS, 0, ORBIT_HEIGHT))
    camera = bpy.context.active_object
    camera.data.lens = 35.0

    constraint = camera.constraints.new(type="TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    bpy.context.scene.camera = camera
    return camera, target


def configure_render(resolution: tuple[int, int]) -> None:
    scene = bpy.context.scene
    # EEVEE: this is a feature-matching fixture, not a beauty render, and Cycles
    # would cost minutes per view for no benefit to the reconstruction.
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 92


def render_orbit(camera: bpy.types.Object, out: Path, views: int) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    for index in range(views):
        angle = 2 * math.pi * index / views
        # Elevation alternates slightly between views. A single perfectly circular
        # orbit is a degenerate configuration for bundle adjustment; a little
        # vertical variation is also what a person walking around actually does.
        height = ORBIT_HEIGHT + (0.6 if index % 2 else -0.6)
        camera.location = (
            ORBIT_RADIUS * math.cos(angle),
            ORBIT_RADIUS * math.sin(angle),
            height,
        )
        path = out / f"view_{index:03d}.jpg"
        bpy.context.scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        written.append(path)

    return written


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--views", type=int, default=DEFAULT_VIEWS)
    parser.add_argument("--width", type=int, default=DEFAULT_RESOLUTION[0])
    parser.add_argument("--height", type=int, default=DEFAULT_RESOLUTION[1])
    args = parser.parse_args(argv)

    clear_scene()
    build_machine()
    setup_lighting()
    camera, _ = setup_camera()
    configure_render((args.width, args.height))
    written = render_orbit(camera, args.out, args.views)

    print(f"RENDERED {len(written)} views to {args.out}")


if __name__ == "__main__":
    main()
