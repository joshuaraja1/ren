import { describe, expect, it } from "vitest";
import { RealtimeAudioBudget } from "./audio-budget.js";

describe("real-time dictation budget", () => {
  it("allows wake pre-roll and prevents rapid bulk audio", () => {
    let now = 1000;
    const budget = new RealtimeAudioBudget(16_000, () => now);
    for (let index = 0; index < 15; index += 1) expect(budget.accept(2048)).toBe(true);
    expect(budget.accept(2048)).toBe(false);
    now += 1000;
    expect(budget.accept(2048)).toBe(true);
  });
});
