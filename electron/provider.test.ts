import { describe, expect, it, vi } from "vitest";
import { askTeacher, validateAnnotations, validateFollowUps } from "./provider.js";

describe("annotation validation", () => {
  it("clamps coordinates and rejects unknown commands", () => {
    const result = validateAnnotations([
      { id: "arrow", type: "arrow", from: { x: -3, y: 2 }, to: { x: .5, y: .5 } },
      { id: "unsafe", type: "click", at: { x: .5, y: .5 } },
    ]);

    expect(result).toEqual([{ id: "arrow", type: "arrow", from: { x: 0, y: 1 }, to: { x: .5, y: .5 }, label: undefined, color: undefined }]);
  });
});

describe("follow-up validation", () => {
  it("keeps only three short, distinct questions", () => {
    expect(validateFollowUps(["  Why does that step work? ", "Why does that step work?", 4, "short", "What changes if I move it?", "Can we check the result?", "What is next?"])).toEqual([
      "Why does that step work?", "What changes if I move it?", "Can we check the result?",
    ]);
  });
});

describe("provider privacy boundary", () => {
  it("keeps screen frames local in demo mode", async () => {
    const fetchCall = vi.fn();
    vi.stubGlobal("fetch", fetchCall);
    try {
      const answer = await askTeacher({ question: "Explain this", frames: ["data:image/png;base64,test"], history: [] }, null);
      expect(fetchCall).not.toHaveBeenCalled();
      expect(answer.annotations).toEqual([]);
      expect(answer.answer).toMatch(/can't inspect your screen/i);
    } finally { vi.unstubAllGlobals(); }
  });

  it("sends an invoked question to the configured vision endpoint", async () => {
    const fetchCall = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "This is the selected part.", annotations: [], followUps: ["Why does this part matter?"] }) } }] }) }));
    vi.stubGlobal("fetch", fetchCall);
    try {
      const answer = await askTeacher({ question: "Explain this", frames: ["data:image/png;base64,test"], history: [] }, { apiKey: "test-key", model: "vision-model", baseUrl: "https://example.com/v1" });
      expect(answer.provider).toBe("vision");
      expect(answer.followUps).toEqual(["Why does this part matter?"]);
      expect(fetchCall).toHaveBeenCalledWith("https://example.com/v1/chat/completions", expect.objectContaining({ headers: expect.objectContaining({ authorization: "Bearer test-key" }), signal: expect.any(AbortSignal) }));
    } finally { vi.unstubAllGlobals(); }
  });

  it("accepts only a validated on-screen visual lesson from the provider", async () => {
    const lesson = {
      version: 1, title: "Lift", placement: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
      parts: [
        { id: "wing", label: "Wing", explanation: "Moves air down.", x: 0.2, y: 0.5 },
        { id: "air", label: "Air", explanation: "Flows around the wing.", x: 0.8, y: 0.3 },
      ],
      connections: [{ from: "air", to: "wing", label: "flows around" }],
    };
    const fetchCall = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ answer: "Air moves around the wing.", visualLesson: lesson }) } }] }) }));
    vi.stubGlobal("fetch", fetchCall);
    try {
      const request = { question: "Show how lift works", frames: [], history: [] };
      const credentials = { apiKey: "test", model: "vision", baseUrl: "https://example.com/v1" };
      expect((await askTeacher(request, credentials)).visualLesson).toEqual({ ...lesson, assumption: undefined });
      lesson.connections[0].to = "missing";
      expect((await askTeacher(request, credentials)).visualLesson).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });

  it("returns an actionable error when the provider times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "TimeoutError"); }));
    try {
      await expect(askTeacher({ question: "Explain this", frames: [], history: [] }, { apiKey: "test-key", model: "vision-model", baseUrl: "https://example.com/v1" })).rejects.toThrow(/took too long/);
    } finally { vi.unstubAllGlobals(); }
  });
});

