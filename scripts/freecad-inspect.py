"""Off-screen regression check for a saved Ren FreeCAD model."""
import os

import FreeCAD as App

doc = App.openDocument(os.environ["REN_CAD_VERIFY"])
solid = doc.Objects[-1].Shape
print("REN_INSPECT", solid.Volume, len(solid.Solids), len(doc.Objects), flush=True)
App.closeDocument(doc.Name)
