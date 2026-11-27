import { describe, expect, it } from "vitest";
import { confirmedWakeQuestion } from "./wake-confirmation";

describe("wake transcript confirmation", () => {
  it.each([
    ["Hey Ren, what is this?", "what is this?"],
    ["Hey Ran. Explain this diagram", "Explain this diagram"],
    ["Hey Ryan, tell me more", "tell me more"],
    ["Hey Run, continue", "continue"],
    ["Hey, Wren!", ""],
  ])("accepts a spoken-name variant in %s", (transcript, question) => {
    expect(confirmedWakeQuestion(transcript)).toBe(question);
  });

  it.each(["The show is still playing", "Hey there, what is this?", "Hey Brian, tell me more", "Hey Rain, what is this?", "Hey Ron, what is this?", "Hey Friend, look here", "They ran away"])(
    "rejects ordinary speech in %s", (transcript) => {
      expect(confirmedWakeQuestion(transcript)).toBeNull();
    },
  );
});
