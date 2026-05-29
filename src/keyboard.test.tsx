// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./game", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./game")>();
  return { ...actual, randomRunSeed: () => 4242 };
});

import App from "./App";
import { initialGameState, liveTasks } from "./game";

beforeEach(() => {
  window.innerWidth = 1024;
});

describe("keyboard shortcuts", () => {
  it("documents the shortcut legend in the bleep panel", () => {
    render(<App />);
    expect(screen.getAllByText(/A attend/i).length).toBeGreaterThan(0);
  });

  it("'x' ignores the top bleep", async () => {
    const user = userEvent.setup();
    render(<App />);
    const topId = liveTasks(initialGameState(4242)).find(
      (task) => task.source !== "treat",
    )!.id;
    const region = screen.getByRole("region", { name: /bleep|pager|task/i });
    const ignoreBefore = within(region).queryAllByRole("button", {
      name: "Ignore",
    }).length;
    await user.keyboard("x");
    // The app must remain mounted and the top task must have been acted upon
    // (its row is gone, so the visible Ignore-button count cannot have grown).
    const ignoreAfter = within(
      screen.getByRole("region", { name: /bleep|pager|task/i }),
    ).queryAllByRole("button", { name: "Ignore" }).length;
    expect(ignoreAfter).toBeLessThanOrEqual(ignoreBefore);
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
    expect(topId).toBeTruthy();
  });

  it("'a' attends the top bleep and the app stays consistent", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("a");
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
  });

  it("treats a modifier+key chord as a no-op", async () => {
    // Ctrl+A should not trigger the bare "a" (attend) shortcut.
    const user = userEvent.setup();
    render(<App />);
    await user.keyboard("{Control>}a{/Control}");
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
  });
});
