import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeAction, parseComputerAction, planComputerAction, screenPoint } from "./computer-operator.js";
import { wantsComputerExecution } from "./computer-intent.js";

afterEach(() => vi.unstubAllGlobals());

describe("computer action boundary", () => {
  it("maps image fractions to Electron/Quartz screen points, including an offset display", () => {
    const bounds = { x: -1440, y: 180, width: 1440, height: 900 };
    expect(screenPoint({ x: 0, y: 0 }, bounds)).toEqual({ x: -1440, y: 180 });
    expect(screenPoint({ x: 1, y: 1 }, bounds)).toEqual({ x: -1, y: 1079 });
    expect(nativeAction({ action: "drag", from: { x: 0.25, y: 0.5 }, to: { x: 0.75, y: 0.5 } }, bounds)).toEqual({
      action: "drag", from: { x: -1080, y: 630 }, to: { x: -361, y: 630 },
    });
  });

  it("rejects invalid, oversized, or invented actions", () => {
    expect(() => parseComputerAction({ action: "click", x: 1.2, y: 0.3 })).toThrow();
    expect(() => parseComputerAction({ action: "drag", from: { x: 0, y: 0 }, to: { x: -1, y: 0 } })).toThrow();
    expect(() => parseComputerAction({ action: "type", text: "x".repeat(1001) })).toThrow();
    expect(() => parseComputerAction({ action: "key", key: "Cmd+Q" })).toThrow();
    expect(() => parseComputerAction({ action: "shell", command: "rm -rf /" })).toThrow();
    expect(parseComputerAction({ action: "click", x: 0.4, y: 0.6 })).toEqual({ action: "click", x: 0.4, y: 0.6 });
  });

  it("routes an explicit delegation after guidance without routing an ordinary explanation", () => {
    const history = [{ role: "user" as const, content: "Walk me through meshing this part in the CAD software" }];
    expect(wantsComputerExecution("Do it for me", history)).toBe(true);
    expect(wantsComputerExecution("Click the visible button for me")).toBe(true);
    expect(wantsComputerExecution("I want to design a bracket in Blender. Can you do it for me?")).toBe(true);
    expect(wantsComputerExecution("Run FEA in this software")).toBe(true);
    expect(wantsComputerExecution("Configure the titration in this app")).toBe(true);
    expect(wantsComputerExecution("Create a CAD model in Fusion 360 for me")).toBe(true);
    expect(wantsComputerExecution("How does meshing work?", history)).toBe(false);
    expect(wantsComputerExecution("How do I click the mesh button?", history)).toBe(false);
    expect(wantsComputerExecution("Do this math for me")).toBe(false);
  });

  it("sends one screenshot and accepts only one structured next action", async () => {
    const fetchMock = vi.fn(async (_url, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages[1].content[1].image_url.url).toBe("data:image/png;base64,AAAA");
      expect(body.messages[1].content[0].text).toContain("Task: place a box");
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"click","x":0.3,"y":0.7}' } }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await planComputerAction("place a box", "data:image/png;base64,AAAA", [], { apiKey: "test", baseUrl: "https://api.openai.com/v1", model: "test" })).toEqual({ action: "click", x: 0.3, y: 0.7 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
