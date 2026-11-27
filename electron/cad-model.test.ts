import { join } from "node:path";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { createFreeCadModel, freeCadCommand, planCadModel, validateCadSpec, wantsCadCreation, type CadSpec } from "./cad-model.js";

const bracket: CadSpec = {
  title: "Mounting bracket",
  assumptions: ["Dimensions are illustrative millimeters"],
  features: [
    { name: "Base plate", kind: "box", operation: "add", center: [0, 0, 2.5], size: [60, 30, 5] },
    { name: "Upright flange", kind: "box", operation: "add", center: [0, -12.5, 12.5], size: [60, 5, 25] },
    { name: "Left hole", kind: "cylinder", operation: "cut", center: [-20, 5, 2.5], radius: 3, height: 10, axis: "z" },
    { name: "Right hole", kind: "cylinder", operation: "cut", center: [20, 5, 2.5], radius: 3, height: 10, axis: "z" },
  ],
};
const execFileAsync = promisify(execFile);

describe("native CAD model creation", () => {
  it("routes file creation, not teaching requests or solver runs", () => {
    expect(wantsCadCreation("Create a 3D CAD model of a bracket")).toBe(true);
    expect(wantsCadCreation("Can you build a CAD model of a phone stand?")).toBe(true);
    expect(wantsCadCreation("I want to design a bracket in FreeCAD; do it for me")).toBe(true);
    expect(wantsCadCreation("Create a CAD model in this software for me")).toBe(false);
    expect(wantsCadCreation("Create a CAD model in Fusion 360 for me")).toBe(false);
    expect(wantsCadCreation("Show me how to create a CAD model of a bracket")).toBe(false);
    expect(wantsCadCreation("Help me design a CAD bracket in FreeCAD")).toBe(false);
    expect(wantsCadCreation("Teach me to create a CAD model in FreeCAD")).toBe(false);
    expect(wantsCadCreation("Draw a CAD diagram of a bracket")).toBe(false);
    expect(wantsCadCreation("Create a CAD model and run FEA")).toBe(false);
  });

  it("rejects executable content, invalid geometry, and unbounded plans", () => {
    expect(validateCadSpec(bracket)).toEqual(bracket);
    expect(() => validateCadSpec({ ...bracket, features: [{ ...bracket.features[0], operation: "cut" }] })).toThrow(/first CAD feature/);
    expect(() => validateCadSpec({ ...bracket, features: [{ ...bracket.features[0], size: [0, 30, 5] }] })).toThrow(/box size/);
    expect(() => validateCadSpec({ ...bracket, features: Array.from({ length: 33 }, (_, index) => ({ ...bracket.features[0], name: `Part ${index}` })) })).toThrow(/feature count/);
    expect(() => validateCadSpec({ ...bracket, title: "model; import os" })).toThrow(/title/);
  });

  it("uses model output only as validated geometry data", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(bracket) } }] }) })));
    try {
      const result = await planCadModel("Create a CAD bracket", { apiKey: "test", model: "gpt-6-sol", baseUrl: "https://example.com/v1" });
      expect(result).toEqual(bracket);
    } finally { vi.unstubAllGlobals(); }
  });

  it.skipIf(!freeCadCommand())("creates a native single-solid FreeCAD document off screen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ren-cad-test-"));
    try {
      const script = join(process.cwd(), "scripts", "freecad-create.py");
      const output = await createFreeCadModel(bracket, directory, script);
      expect(output.endsWith(".FCStd")).toBe(true);
      expect((await stat(output)).size).toBeGreaterThan(1_000);
      expect((await stat(output.replace(/\.FCStd$/, ".step"))).size).toBeGreaterThan(1_000);
      const inspect = join(process.cwd(), "scripts", "freecad-inspect.py");
      const { stdout, stderr } = await execFileAsync(freeCadCommand()!, [inspect], { env: { ...process.env, REN_CAD_VERIFY: output } });
      const match = stdout.match(/REN_INSPECT\s+([\d.]+)\s+(\d+)\s+(\d+)/);
      expect(match, stdout + stderr).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThan(14_000);
      expect(Number(match![1])).toBeLessThan(15_000);
      expect(match![2]).toBe("1");
      expect(Number(match![3])).toBeGreaterThanOrEqual(7);
      const step = stdout.match(/REN_STEP\s+([\d.]+)\s+(\d+)/);
      expect(step, stdout + stderr).not.toBeNull();
      expect(Number(step![1])).toBeCloseTo(Number(match![1]), 4);
      expect(step![2]).toBe("1");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
