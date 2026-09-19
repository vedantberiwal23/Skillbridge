"""Read a STEP assembly into named, coloured per-part geometry.

    python3 step_reader.py assembly.step out/assembly.obj

Standalone on purpose: it imports nothing beyond the standard library and
OpenCascade, so it can live outside the pipeline that first needed it.


Uses OpenCascade's XCAF layer rather than a plain shape read, because the two
things worth having live there and nowhere else: the assembly's part boundaries
and each part's colour. A plain read returns one fused solid, which throws away
exactly what makes CAD worth importing.

OCP is an optional dependency (`uv sync --extra cad`) and is imported inside the
function so the rest of the service runs without it.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

#: Tessellation chord deviation, in model units. Smaller is finer and slower.
LINEAR_DEFLECTION = 0.35
ANGULAR_DEFLECTION = 0.3


class StepReadError(RuntimeError):
    pass


@dataclass(frozen=True)
class StepImport:
    obj_path: Path
    mtl_path: Path
    part_count: int
    vertex_count: int
    colour_count: int


def read(source: Path, out_obj: Path) -> StepImport:
    """Tessellate a STEP assembly to OBJ, one group per part, colours in the MTL."""
    try:
        from OCP.BRep import BRep_Tool
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.IFSelect import IFSelect_ReturnStatus
        from OCP.Quantity import Quantity_Color
        from OCP.STEPCAFControl import STEPCAFControl_Reader
        from OCP.TCollection import TCollection_AsciiString, TCollection_ExtendedString
        from OCP.TDataStd import TDataStd_Name
        from OCP.TDF import TDF_Label, TDF_LabelSequence
        from OCP.TDocStd import TDocStd_Document
        from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
        from OCP.TopExp import TopExp_Explorer
        from OCP.TopLoc import TopLoc_Location
        from OCP.TopoDS import TopoDS
        from OCP.XCAFApp import XCAFApp_Application
        from OCP.XCAFDoc import XCAFDoc_ColorType, XCAFDoc_DocumentTool
    except ImportError as exc:  # pragma: no cover - depends on the optional extra
        raise StepReadError(
            "STEP import needs the CAD extra. Install it with `uv sync --extra cad`."
        ) from exc

    if not source.is_file():
        raise StepReadError(f"no STEP file at {source}")

    app = XCAFApp_Application.GetApplication_s()
    doc = TDocStd_Document(TCollection_ExtendedString("MDTV-XCAF"))
    app.NewDocument(TCollection_ExtendedString("MDTV-XCAF"), doc)

    reader = STEPCAFControl_Reader()
    reader.SetColorMode(True)
    reader.SetNameMode(True)
    if reader.ReadFile(str(source)) != IFSelect_ReturnStatus.IFSelect_RetDone:
        raise StepReadError(f"could not parse {source.name} as STEP")
    reader.Transfer(doc)

    shape_tool = XCAFDoc_DocumentTool.ShapeTool_s(doc.Main())
    color_tool = XCAFDoc_DocumentTool.ColorTool_s(doc.Main())

    def part_name(label: TDF_Label) -> str:
        attr = TDataStd_Name()
        if label.FindAttribute(TDataStd_Name.GetID_s(), attr):
            try:
                return str(TCollection_AsciiString(attr.Get()).ToCString())
            except Exception:  # noqa: BLE001
                return str(attr.Get())
        return ""

    def colour_of(
        label: TDF_Label, fallback: tuple[float, float, float]
    ) -> tuple[float, float, float]:
        shape = shape_tool.GetShape_s(label)
        if shape is None or shape.IsNull():
            return fallback
        c = Quantity_Color()
        for ctype in (XCAFDoc_ColorType.XCAFDoc_ColorSurf, XCAFDoc_ColorType.XCAFDoc_ColorGen):
            if color_tool.GetColor(shape, ctype, c):
                return (c.Red(), c.Green(), c.Blue())
        return fallback

    parts: list[tuple[str, tuple[float, float, float], object]] = []

    def walk(label: TDF_Label, inherited: tuple[float, float, float]) -> None:
        colour = colour_of(label, inherited)
        if shape_tool.IsAssembly_s(label):
            children = TDF_LabelSequence()
            shape_tool.GetComponents_s(label, children)
            for i in range(1, children.Length() + 1):
                child = children.Value(i)
                ref = TDF_Label()
                if shape_tool.GetReferredShape_s(child, ref):
                    walk(ref, colour_of(child, colour))
                else:
                    walk(child, colour)
            return
        shape = shape_tool.GetShape_s(label)
        if shape is None or shape.IsNull():
            return
        parts.append((part_name(label) or f"part_{len(parts):03d}", colour, shape))

    roots = TDF_LabelSequence()
    shape_tool.GetFreeShapes(roots)
    for i in range(1, roots.Length() + 1):
        walk(roots.Value(i), (0.7, 0.7, 0.7))

    if not parts:
        raise StepReadError(f"{source.name} contains no solid parts")

    out_obj.parent.mkdir(parents=True, exist_ok=True)
    mtl_path = out_obj.with_suffix(".mtl")
    materials: dict[str, tuple[float, float, float]] = {}
    vert_offset = 1

    with out_obj.open("w") as obj:
        obj.write(f"mtllib {mtl_path.name}\n")
        for index, (name, colour, shape) in enumerate(parts, start=1):
            BRepMesh_IncrementalMesh(shape, LINEAR_DEFLECTION, False, ANGULAR_DEFLECTION, True)
            # One OBJ group per CAD part - this is what becomes a component id.
            stable = f"SKB_COMPONENT_{index:03d}"
            material = f"mat_{index:03d}"
            materials[material] = colour
            obj.write(f"\ng {stable}\nusemtl {material}\n# source part: {name}\n")

            solids = TopExp_Explorer(shape, TopAbs_SOLID)
            while solids.More():
                faces = TopExp_Explorer(TopoDS.Solid_s(solids.Current()), TopAbs_FACE)
                while faces.More():
                    loc = TopLoc_Location()
                    tri = BRep_Tool.Triangulation_s(TopoDS.Face_s(faces.Current()), loc)
                    if tri is not None:
                        trsf = loc.Transformation()
                        for i in range(1, tri.NbNodes() + 1):
                            p = tri.Node(i).Transformed(trsf)
                            obj.write(f"v {p.X():.5f} {p.Y():.5f} {p.Z():.5f}\n")
                        for i in range(1, tri.NbTriangles() + 1):
                            a, b, c = tri.Triangle(i).Get()
                            obj.write(
                                f"f {vert_offset + a - 1} {vert_offset + b - 1} "
                                f"{vert_offset + c - 1}\n"
                            )
                        vert_offset += tri.NbNodes()
                    faces.Next()
                solids.Next()

    with mtl_path.open("w") as mtl:
        for material, (r, g, b) in materials.items():
            mtl.write(f"newmtl {material}\nKd {r:.4f} {g:.4f} {b:.4f}\nKa 0 0 0\nNs 40\n\n")

    return StepImport(
        obj_path=out_obj,
        mtl_path=mtl_path,
        part_count=len(parts),
        vertex_count=vert_offset - 1,
        colour_count=len(set(materials.values())),
    )


if __name__ == "__main__":
    import sys

    if len(sys.argv) != 3:
        print("usage: step_reader.py <input.step> <output.obj>", file=sys.stderr)
        raise SystemExit(64)

    result = read(Path(sys.argv[1]), Path(sys.argv[2]))
    print(f"parts    {result.part_count}")
    print(f"vertices {result.vertex_count}")
    print(f"colours  {result.colour_count}")
    print(f"wrote    {result.obj_path} and {result.mtl_path.name}")
