import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { App } from "./App";
import type { RenBridge } from "./contracts";

describe("Ren ambient shell", () => {
  it("presents a zero-configuration wake and point flow", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /how can i help/i })).toBeVisible();
    expect(screen.getByText(/hey ren, explain this/i)).toBeVisible();
    expect(screen.getByText(/point at anything on your screen/i)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /ask ren/i })).toBeVisible();
  });

  it("supports the click and type fallback without a desktop bridge", async () => {
    render(<App />);
    const input = await screen.findByRole("textbox", { name: /ask ren/i });
    fireEvent.change(input, { target: { value: "Explain the part I am pointing at" } });
    fireEvent.click(screen.getByRole("button", { name: /send question/i }));

    expect(await screen.findByText(/packaged desktop app will use your current screen/i)).toBeVisible();
  });

  it("keeps the microphone fallback honest when local recognition is unavailable", async () => {
    render(<App />);
    const input = await screen.findByRole("textbox", { name: /ask ren/i });
    fireEvent.click(screen.getByRole("button", { name: /start listening/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/local speech recognition is unavailable/i);
    expect(input).toHaveFocus();
    expect(screen.getByRole("heading", { name: /how can i help/i })).toBeVisible();
  });

  it("shows where screen images will go before accepting a provider key", async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: /connect ai/i }));
    expect(screen.getByText(/sends your question and a screen snapshot to/i)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /provider url/i })).toHaveValue("https://api.openai.com/v1");
    expect(screen.getByLabelText(/api key/i)).toHaveAttribute("type", "password");
  });

  it("asks about the circled region without requiring a typed prompt", async () => {
    let selected: (() => void) | undefined;
    const ask = vi.fn(async () => ({ answer: "Look at the circled part.", annotations: [], provider: "demo" as const }));
    window.ren = {
      permissionStatus: async () => ({ ready: true, microphone: "granted", screen: "granted", interaction: "granted" }),
      primarySource: async () => ({ id: "screen", name: "Main display", thumbnail: "" }),
      wakeAvailable: async () => false,
      onFocusSelection: (listener: () => void) => { selected = listener; return () => { selected = undefined; }; },
      setExpanded: async () => {},
      speechStop: async () => {},
      captureContext: async () => ({ frames: ["data:image/png;base64,dGVzdA=="], pointer: { x: 0.5, y: 0.5 }, focus: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 } }),
      ask,
    } as unknown as RenBridge;
    try {
      render(<App />);
      fireEvent.click(await screen.findByRole("button", { name: /open ren/i }));
      await screen.findByText(/point at anything/i);
      act(() => selected?.());
      await waitFor(() => expect(ask).toHaveBeenCalledWith(expect.objectContaining({
        question: expect.stringContaining("area I circled"),
        focus: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 },
      })));
    } finally {
      window.ren = undefined;
    }
  });
});
