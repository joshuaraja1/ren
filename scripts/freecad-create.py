"""Trusted FreeCAD runner for a validated JSON model plan. No model-authored code."""
import json
import os
import sys

import FreeCAD as App


def main():
    if len(sys.argv) != 2:
        raise ValueError("Expected only the trusted runner script")
    input_path = os.environ["REN_CAD_INPUT"]
    output_path = os.environ["REN_CAD_OUTPUT"]
    with open(input_path, encoding="utf-8") as source:
        spec = json.load(source)
    doc = App.newDocument("RenModel")
    current = None
    for index, feature in enumerate(spec["features"]):
        if feature["kind"] == "box":
            item = doc.addObject("Part::Box", "Box")
            length, width, height = feature["size"]
            item.Length, item.Width, item.Height = length, width, height
            item.Placement.Base = App.Vector(*(feature["center"][axis] - feature["size"][axis] / 2 for axis in range(3)))
        elif feature["kind"] == "cylinder":
            item = doc.addObject("Part::Cylinder", "Cylinder")
            item.Radius, item.Height = feature["radius"], feature["height"]
            axis = {"x": App.Vector(1, 0, 0), "y": App.Vector(0, 1, 0), "z": App.Vector(0, 0, 1)}[feature["axis"]]
            item.Placement = App.Placement(
                App.Vector(*feature["center"]) - axis * (feature["height"] / 2),
                App.Rotation(App.Vector(0, 0, 1), axis),
            )
        else:
            raise ValueError("Unsupported feature")
        item.Label = feature["name"]
        if index == 0:
            current = item
        else:
            result = doc.addObject("Part::Fuse" if feature["operation"] == "add" else "Part::Cut", "Combine")
            result.Base = current
            result.Tool = item
            result.Label = ("Add " if feature["operation"] == "add" else "Cut ") + feature["name"]
            current = result
        doc.recompute()
        if current.Shape.isNull() or not current.Shape.isValid() or current.Shape.Volume <= 0:
            raise ValueError("Feature produced an empty or invalid solid: " + feature["name"])
    if len(current.Shape.Solids) != 1:
        raise ValueError("The plan did not produce one connected solid")
    print("REN_CAD_VALID", round(current.Shape.Volume, 6), flush=True)
    doc.Label = spec["title"]
    doc.recompute()
    doc.saveAs(output_path)
    print("REN_CAD_SAVED", output_path, flush=True)
    App.closeDocument(doc.Name)


main()
