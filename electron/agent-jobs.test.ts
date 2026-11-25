import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentJobManager, detectAgentJobIntent, type AgentJobSnapshot } from "./agent-jobs.js";

const credentials = { apiKey: "test-key", model: "gpt-6-sol", baseUrl: "https://api.openai.com/v1" };
const frames = ["data:image/png;base64,YWJj"];
const reply = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.unstubAllGlobals());

describe("voice agent job intent", () => {
  it("routes explicit natural language jobs and leaves ordinary questions alone", () => {
    expect(detectAgentJobIntent("Hey Ren, start an agent job to explain this circuit")).toBe("explain this circuit");
    expect(detectAgentJobIntent("Investigate why this engine can hover")).toBe("Investigate why this engine can hover");
    expect(detectAgentJobIntent("Compare these two designs")).toBe("Compare these two designs");
    expect(detectAgentJobIntent("Build me a plan for understanding this diagram")).toBe("Build me a plan for understanding this diagram");
    expect(detectAgentJobIntent("Spawn an agent to study this circuit")).toBe("study this circuit");
    expect(detectAgentJobIntent("Find 10 TikTok creators for my business")).toBe("Find 10 TikTok creators for my business");
    expect(detectAgentJobIntent("How does this engine hover?")).toBeNull();
    expect(detectAgentJobIntent("Draw a diagram of this engine")).toBeNull();
  });
});

describe("AgentJobManager", () => {
  it("uses cited web research for a voice-requested creator search", async () => {
    const web = new Response(JSON.stringify({ output: [
      { type: "web_search_call", action: { type: "search", query: "TikTok creators" } },
      { type: "message", content: [{ type: "output_text", text: "Creator A posts on TikTok.", annotations: [{ type: "url_citation", title: "Creator A", url: "https://example.com/creator-a" }] }] },
    ] }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ objectives: [
        { question: "What kind of business is visible?", tool: "screen_inspection" },
        { question: "Find relevant TikTok creators", tool: "web_search" },
      ] }))
      .mockResolvedValueOnce(reply({ finding: "The screen shows a fitness brand." }))
      .mockResolvedValueOnce(web)
      .mockResolvedValueOnce(reply({ answer: "Creator A may fit this fitness brand." }));
    vi.stubGlobal("fetch", fetchMock);
    const manager = new AgentJobManager();
    const started = manager.start({ task: "Find 10 TikTok creators for my business", frames }, credentials);
    for (let i = 0; i < 20 && manager.get(started.id)?.status === "running"; i++) await tick();
    const completed = manager.get(started.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.scope).toBe("current screen + web");
    expect(completed?.stage).toBe("Partial result");
    expect(completed?.answer).toContain("only 1 cited source");
    expect(completed?.sources).toEqual([{ title: "Creator A", url: "https://example.com/creator-a" }]);
    expect(fetchMock.mock.calls[2][0]).toBe("https://api.openai.com/v1/responses");
    const webInput = JSON.parse(fetchMock.mock.calls[2][1].body).input;
    expect(webInput).toContain("Find 10 TikTok creators for my business");
    expect(webInput).not.toContain("The screen shows a fitness brand");
    expect(webInput).not.toContain("Find relevant TikTok creators");
  });

  it("does not send a current-screen job to web search even if the planner asks", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply({ objectives: [
      { question: "Inspect the current screen", tool: "screen_inspection" },
      { question: "Search for private text from the screenshot", tool: "web_search" },
    ] }));
    vi.stubGlobal("fetch", fetchMock);
    const manager = new AgentJobManager();
    const started = manager.start({ task: "Analyze my current screen", frames }, credentials);
    for (let i = 0; i < 20 && manager.get(started.id)?.status === "running"; i++) await tick();
    expect(manager.get(started.id)?.status).toBe("failed");
    expect(started.scope).toBe("current screen");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("runs model-selected investigation objectives, synthesizes them, and emits progress", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ objectives: [
        { question: "Trace engine power", tool: "screen_inspection" },
        { question: "Trace lift balance", tool: "reasoning" },
      ] }))
      .mockResolvedValueOnce(reply({ finding: "The engine drives the lift fan." }))
      .mockResolvedValueOnce(reply({ finding: "Control outlets balance roll." }))
      .mockResolvedValueOnce(reply({ answer: "The engine powers the fan and rear nozzle. The fan and exhaust create lift, while outlets balance the jet." }));
    vi.stubGlobal("fetch", fetchMock);
    const manager = new AgentJobManager();
    const events: AgentJobSnapshot[] = [];
    manager.onUpdate((snapshot) => events.push(snapshot));
    const started = manager.start({ task: "Explain how the jet hovers", frames }, credentials);
    expect(started.status).toBe("running");
    for (let i = 0; i < 20 && manager.get(started.id)?.status === "running"; i++) await tick();
    const completed = manager.get(started.id);
    expect(completed?.status).toBe("completed");
    expect(completed?.completedSteps).toBe(4);
    expect(completed?.answer).toContain("fan and rear nozzle");
    expect(events.map((event) => event.stage)).toEqual([
      "Planning the investigation", "Investigating the first question", "Investigating question 2", "Connecting the findings", "Complete",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(firstBody.reasoning_effort).toBe("medium");
    expect(firstBody.messages[1].content[1].image_url.url).toBe(frames[0]);
    const finalBody = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(finalBody.messages[1].content).toHaveLength(1);
    expect(finalBody.messages[1].content[0].text).toContain("Trace lift balance");
    const reasoningBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(reasoningBody.messages[1].content).toHaveLength(1);
  });

  it("rejects invalid frames and concurrent jobs", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const manager = new AgentJobManager();
    expect(() => manager.start({ task: "Research this", frames: ["https://example.com/screenshot"] }, credentials)).toThrow("Invalid screen frames");
    expect(() => manager.start({ task: "Research this", frames }, null)).toThrow("Connect a vision model");
    const job = manager.start({ task: "Research this", frames }, credentials);
    expect(() => manager.start({ task: "Research that", frames }, credentials)).toThrow("already running");
    expect(manager.cancel(job.id)).toBe(true);
    expect(manager.get(job.id)?.status).toBe("cancelled");
    expect(manager.cancel(job.id)).toBe(false);
  });

  it("reports a failed job when the model omits an investigation plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ objectives: [{ question: "one", tool: "reasoning" }] })));
    const manager = new AgentJobManager();
    const job = manager.start({ task: "Investigate this", frames }, credentials);
    for (let i = 0; i < 10 && manager.get(job.id)?.status === "running"; i++) await tick();
    expect(manager.get(job.id)?.status).toBe("failed");
    expect(manager.get(job.id)?.error).toContain("useful investigation plan");
  });
});
