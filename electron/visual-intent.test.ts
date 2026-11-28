import { expect, it } from "vitest";
import { likelyVisualFollowUp, requestedVisualDimension, wantsPriorAssemblyGuide, wantsPriorVisualIn3D, wantsReferenceRecreation, wantsVisualCreation } from "./visual-intent.js";

it("renders only when the learner explicitly asks for a visual", () => {
  expect(wantsVisualCreation("Can you recreate that jet for me and explain it? ")).toBe(true);
  expect(wantsVisualCreation("Draw the airplane on my screen")).toBe(true);
  expect(wantsVisualCreation("Show me a 3D model of this")).toBe(true);
  expect(wantsVisualCreation("Show a diagram of how it hovers")).toBe(true);
  expect(wantsVisualCreation("Can you diagram the engine and lift fan?")).toBe(true);
  expect(wantsVisualCreation("Model the circulatory system in 3D")).toBe(true);
  expect(wantsVisualCreation("A 3D model of the solar system, please")).toBe(true);
  expect(wantsVisualCreation("Can you build out a 3D diagram showing the engine and parts?")).toBe(true);
  expect(wantsVisualCreation("Animate attaching a mini camera to a Raspberry Pi 5")).toBe(true);
  expect(wantsVisualCreation("Show me exactly how to attach a camera to this Raspberry Pi 5")).toBe(true);
  expect(wantsVisualCreation("Animate attaching a bicycle wheel to its fork")).toBe(true);
  expect(wantsVisualCreation("Show installing a desk lamp shade onto its stem")).toBe(true);
  expect(wantsVisualCreation("Animate connecting a turbine to a generator")).toBe(true);
  expect(wantsVisualCreation("How does this diagram work?")).toBe(false);
  expect(wantsVisualCreation("How does this jet work? ")).toBe(false);
  expect(wantsVisualCreation("How do I connect a camera module to this Pi?")).toBe(true);
  expect(requestedVisualDimension("How do I connect a camera module to this Pi?")).toBe(3);
  expect(wantsVisualCreation("How do I build a job application agent?")).toBe(false);
  expect(wantsVisualCreation("Show how to install RAM into a server")).toBe(true);
  expect(requestedVisualDimension("Show how to install RAM into a server")).toBe(3);
  expect(wantsVisualCreation("How do I connect an app to a server?")).toBe(false);
  expect(wantsVisualCreation("How do I build a 3D CAD model of a bracket?")).toBe(false);
  expect(wantsVisualCreation("How do I build an FEA mesh for a wing?")).toBe(false);
  expect(wantsVisualCreation("Create a 3D CAD model of a bracket")).toBe(false);
  expect(wantsVisualCreation("Run FEA on this bracket")).toBe(false);
  expect(wantsVisualCreation("Create a summary in plain English")).toBe(false);
  expect(wantsVisualCreation("Generate an email in Spanish")).toBe(false);
  expect(wantsVisualCreation("Create a chart showing these values")).toBe(true);
  expect(wantsVisualCreation("Draw a diagram of how an FEA mesh works")).toBe(true);
  expect(wantsVisualCreation("From this CAD drawing, show how to attach the camera to the board")).toBe(true);
  for (const request of [
    "Create a mesh and run a structural FEA on this bracket",
    "How do I set up thermal simulation in CAD?",
    "Build a parametric CAD model of a phone enclosure",
    "Analyze vibration modes with FEM",
  ]) expect(wantsVisualCreation(request)).toBe(false);
  for (const request of [
    "Draw a diagram of the fixed support and applied force on this bracket",
    "Show a schematic of the thermal boundary conditions",
  ]) expect(wantsVisualCreation(request)).toBe(true);
  expect(wantsPriorAssemblyGuide("How do I do that?")).toBe(true);
  expect(wantsPriorAssemblyGuide("Show me how to do it")).toBe(true);
  expect(wantsPriorAssemblyGuide("Repeat the steps")).toBe(true);
  expect(wantsPriorAssemblyGuide("Replay it")).toBe(true);
  expect(wantsPriorAssemblyGuide("Restart the animation")).toBe(true);
  expect(wantsPriorAssemblyGuide("Show me that again")).toBe(true);
  expect(wantsPriorAssemblyGuide("How does this diagram work?")).toBe(false);
});

it("turns a follow-up into a 3D view of the existing subject", () => {
  expect(wantsVisualCreation("Make it 3D")).toBe(true);
  expect(requestedVisualDimension("Make it 3D")).toBe(3);
  expect(wantsPriorVisualIn3D("Make it 3D")).toBe(true);
  expect(wantsPriorVisualIn3D("Can you build out a 3D diagram showing where the engine and parts are?")).toBe(true);
  expect(wantsPriorVisualIn3D("Can you build out a 3D diagram kind of showing me clearly where the engine and the parts are?")).toBe(true);
  expect(wantsPriorVisualIn3D("Show me the same thing in 3D")).toBe(true);
  expect(wantsPriorVisualIn3D("Can I rotate that diagram? ")).toBe(true);
  expect(wantsPriorVisualIn3D("Draw a 3D model of a human heart")).toBe(false);
  expect(wantsPriorVisualIn3D("Build a 3D diagram showing parts of an F-35")).toBe(false);
  expect(wantsPriorVisualIn3D("Make a new 3D diagram of a turbine")).toBe(false);
  expect(wantsPriorVisualIn3D("Show this F-35 in 3D")).toBe(false);
  expect(wantsPriorVisualIn3D("Show where the engine is in a 3D F-35 model")).toBe(false);
  expect(wantsVisualCreation("Show this F-35 in 3D")).toBe(true);
  expect(requestedVisualDimension("Draw a diagram of how a turbine works")).toBe(2);
});

it("uses visible pixels only for appearance recreation, not a new explanatory diagram", () => {
  expect(wantsReferenceRecreation("Draw a diagram explaining this jet in your own way")).toBe(false);
  expect(wantsReferenceRecreation("Show me how this diagram works")).toBe(false);
  expect(wantsReferenceRecreation("Recreate this visible phone exactly")).toBe(true);
  expect(wantsReferenceRecreation("Draw a 3D exploded view of this phone on my screen")).toBe(true);
  expect(wantsReferenceRecreation("Turn this turbine into a diagram")).toBe(true);
  expect(wantsReferenceRecreation("Draw a new diagram inspired by this page")).toBe(false);
  expect(wantsReferenceRecreation("Show me exactly how to attach a camera to this Raspberry Pi 5")).toBe(true);
  expect(wantsReferenceRecreation("Show me how to attach a camera to the Raspberry Pi 5 on my screen")).toBe(true);
  expect(wantsReferenceRecreation("Draw a diagram of this circuit and label its parts")).toBe(true);
  expect(wantsReferenceRecreation("Show me a model of the phone visible on screen")).toBe(true);
  expect(wantsReferenceRecreation("Make a rotatable 3D model of this microscope")).toBe(true);
  expect(wantsReferenceRecreation("Show how to attach the lens to this telescope in 3D")).toBe(true);
  expect(wantsReferenceRecreation("Render the mechanical clock on my screen in 3D")).toBe(true);
  expect(wantsReferenceRecreation("Draw a diagram explaining this microscope in your own way")).toBe(false);
});

it("keeps 2D requests flat and routes arbitrary object models to 3D", () => {
  expect(requestedVisualDimension("Draw a 2D circuit diagram explaining current flow")).toBe(2);
  expect(requestedVisualDimension("Draw a flat 2D F-35B hover schematic")).toBe(2);
  expect(requestedVisualDimension("Make a 3D model of a human heart I can rotate")).toBe(3);
  expect(requestedVisualDimension("Show me a 3D turbine mechanism")).toBe(3);
  expect(requestedVisualDimension("Make a 3D model of this flat circuit board")).toBe(3);
  expect(requestedVisualDimension("3D diagram of a flat-screen TV")).toBe(3);
  expect(requestedVisualDimension("Show me a 3D printer diagram")).toBe(2);
  expect(requestedVisualDimension("Draw a diagram of an unknown machine")).toBe(2);
  expect(requestedVisualDimension("Model the circulatory system in 3D and let me turn it around")).toBe(3);
  expect(requestedVisualDimension("A 3D cutaway of a steam engine")).toBe(3);
  expect(wantsVisualCreation("Show the phone assembly step by step")).toBe(true);
  expect(requestedVisualDimension("Show the phone assembly step by step")).toBe(3);
  expect(wantsPriorVisualIn3D("Show how to assemble it step by step")).toBe(true);
  expect(wantsVisualCreation("Replay the assembly")).toBe(true);
  expect(wantsPriorVisualIn3D("Replay the assembly")).toBe(true);
  expect(requestedVisualDimension("Replay the assembly")).toBe(3);
  expect(requestedVisualDimension("Animate attaching a mini camera to a Raspberry Pi 5")).toBe(3);
  expect(requestedVisualDimension("Show me exactly how to attach a camera to this Raspberry Pi 5")).toBe(3);
  expect(requestedVisualDimension("Animate attaching a bicycle wheel to its fork")).toBe(3);
});

it("keeps a referenced diagram visible while a follow-up is prepared", () => {
  expect(likelyVisualFollowUp("Why does the fan help?", "Hover thrust", ["Lift fan", "Engine"])).toBe(true);
  expect(likelyVisualFollowUp("How does it stay level?", "Hover thrust", ["Lift fan"])).toBe(true);
  expect(likelyVisualFollowUp("What is this page?", "Hover thrust", ["Lift fan"])).toBe(false);
  expect(likelyVisualFollowUp("New topic: explain this document", "Hover thrust", ["Lift fan"])).toBe(false);
});
