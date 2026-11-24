import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";

describe("Ren ambient shell", () => {
  it("presents a zero-configuration wake and point flow", async () => {
    render(<App />);

    expect(await screen.findByRole("heading", { name: /how can i help/i })).toBeVisible();
    expect(screen.getByText(/say “hey ren”/i)).toBeVisible();
    expect(screen.getByText(/point with your cursor/i)).toBeVisible();
    expect(screen.getByLabelText(/ask ren/i)).toBeVisible();
  });

  it("supports the click and type fallback without a desktop bridge", async () => {
    render(<App />);
    const input = await screen.findByLabelText(/ask ren/i);
    fireEvent.change(input, { target: { value: "Explain the part I am pointing at" } });
    fireEvent.click(screen.getByRole("button", { name: "↑" }));

    expect(await screen.findByText(/packaged desktop app will use your current screen/i)).toBeVisible();
  });
});
