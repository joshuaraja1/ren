import { describe, expect, it, vi } from "vitest";
import { boundedLocalResponse } from "./local-response.js";

describe("local model discovery response", () => {
  it("stops reading a response above the size limit", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(100_001)); },
      cancel,
    });
    await expect(boundedLocalResponse(new Response(body))).rejects.toThrow("size limit");
    expect(cancel).toHaveBeenCalled();
  });
});
