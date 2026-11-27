"""Off-screen regression check for a saved Ren FreeCAD model."""
import os

import FreeCAD as App
import Part

doc = App.openDocument(os.environ["REN_CAD_VERIFY"])
solid = doc.Objects[-1].Shape
print("REN_INSPECT", solid.Volume, len(solid.Solids), len(doc.Objects), flush=True)
box = solid.BoundBox
print("REN_BOUNDS", box.XMin, box.YMin, box.ZMin, box.XMax, box.YMax, box.ZMax, flush=True)
for item in doc.Objects:
    print("REN_FEATURE", item.Name, item.Label, item.TypeId, flush=True)
step_path = os.path.splitext(os.environ["REN_CAD_VERIFY"])[0] + ".step"
if os.path.isfile(step_path):
    step = Part.Shape()
    step.read(step_path)
    print("REN_STEP", step.Volume, len(step.Solids), flush=True)
App.closeDocument(doc.Name)
