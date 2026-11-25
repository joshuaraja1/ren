import { expect, it } from "vitest";
import { plainAnswer } from "./plain-answer.js";

it("removes visible markdown before Ren displays or speaks an answer", () => {
  expect(plainAnswer("**507 contributions** and **64% commits**.\n- See [activity](https://example.com) and `pull requests`."))
    .toBe("507 contributions and 64% commits.\nSee activity and pull requests.");
});
