import { describe, expect, it, vi } from "vitest";
import { askTeacher, validateAnnotations } from "./provider.js";

describe("annotation validation", () => {
  it("clamps coordinates and rejects unknown commands", () => {
    const result = validateAnnotations([
      { id: "arrow", type: "arrow", from: { x: -3, y: 2 }, to: { x: .5, y: .5 } },
      { id: "unsafe", type: "click", at: { x: .5, y: .5 } },
    ]);

    expect(result).toEqual([{ id: "arrow", type: "arrow", from: { x: 0, y: 1 }, to: { x: .5, y: .5 }, label: undefined, color: undefined }]);
  });
});

describe("provider privacy boundary", () => {
  it("keeps screen frames local in demo mode", async () => {
    const fetchCall = vi.fn();
    vi.stubGlobal("fetch", fetchCall);
    try {
      await askTeacher({ question: "Explain this", frames: ["data:image/png;base64,test"], history: [] }, null);
      expect(fetchCall).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it("sends an invoked question to the configured vision endpoint", async () => {
    const fetchCall = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "This is the selected part.", annotations: [] }) } }] }) }));
    vi.stubGlobal("fetch", fetchCall);
    try {
      const answer = await askTeacher({ question: "Explain this", frames: ["data:image/png;base64,test"], history: [] }, { apiKey: "test-key", model: "vision-model", baseUrl: "https://example.com/v1" });
      expect(answer.provider).toBe("vision");
      expect(fetchCall).toHaveBeenCalledWith("https://example.com/v1/chat/completions", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer test-key" }) }));
    } finally { vi.unstubAllGlobals(); }
  });
});

