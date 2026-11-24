import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "./App";

describe("Ren app shell", () => {
  it("presents the zero-configuration learning flow", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /learn right where you are/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /choose a screen/i })).toBeEnabled();
    expect(screen.getByLabelText(/ask about your screen/i)).toBeVisible();
    expect(screen.getByText(/no subject setup required/i)).toBeVisible();
  });

  it("explains the private on-demand capture before sharing", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /choose a screen/i }));

    expect(await screen.findByRole("dialog", { name: /choose a screen or window/i })).toBeVisible();
    expect(screen.getByText(/only captures a short visual burst/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /browser preview/i })).toBeEnabled();
  });
});
