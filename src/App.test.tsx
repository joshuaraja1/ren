import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("Ren app shell", () => {
  it("presents the zero-configuration learning flow", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /learn right where you are/i })).toBeVisible();
    expect(screen.getByRole("button", { name: /choose a screen/i })).toBeEnabled();
    expect(screen.getByLabelText(/ask about your screen/i)).toBeVisible();
    expect(screen.getByText(/no subject setup required/i)).toBeVisible();
  });
});
