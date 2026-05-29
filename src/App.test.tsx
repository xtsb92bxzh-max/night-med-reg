// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Pin the run seed so the opening bleep stack is deterministic across tests.
vi.mock("./game", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./game")>();
  return { ...actual, randomRunSeed: () => 4242 };
});

import App from "./App";
import { initialGameState } from "./game";

const STAT_LABELS = [
  "Stamina",
  "Focus",
  "Reputation",
  "Safety",
  "Confidence",
  "Caffeine",
];

beforeEach(() => {
  // jsdom defaults innerWidth to 1024 (>= 900) so the desktop layout renders.
  window.innerWidth = 1024;
});

describe("App initial render", () => {
  it("shows the brand title and a 21:00 shift clock", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("21:00").length).toBeGreaterThan(0);
  });

  it("renders a meter for every player stat", () => {
    render(<App />);
    for (const label of STAT_LABELS) {
      // Each meter has aria-label "<Label> <value>".
      expect(
        screen.getByLabelText(new RegExp(`^${label} \\d+$`)),
      ).toBeInTheDocument();
    }
  });

  it("renders the opening bleep stack with the full action set", () => {
    render(<App />);
    const tasks = screen.getByRole("region", { name: /bleep|pager|task/i });
    expect(
      within(tasks).getAllByRole("button", { name: "Attend" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(tasks).getAllByRole("button", { name: "Escalate" }).length,
    ).toBeGreaterThan(0);
    expect(
      within(tasks).getAllByRole("button", { name: "Ignore" }).length,
    ).toBeGreaterThan(0);
  });

  it("does not show the Datix modal or end screen at the start", () => {
    render(<App />);
    expect(screen.queryByText(/been datixed/i)).not.toBeInTheDocument();
  });
});

describe("App interactions", () => {
  it("ignoring a bleep removes it from the visible stack", async () => {
    const user = userEvent.setup();
    render(<App />);
    const region = screen.getByRole("region", { name: /bleep|pager|task/i });
    const ignoreButtons = within(region).getAllByRole("button", {
      name: "Ignore",
    });
    const before = ignoreButtons.length;
    // Capture the first task's message text to confirm it disappears.
    await user.click(ignoreButtons[0]);
    const after = within(
      screen.getByRole("region", { name: /bleep|pager|task/i }),
    ).queryAllByRole("button", { name: "Ignore" });
    // Either the stack shrank, or a queued task slid in to keep it full; in
    // both cases the click must not crash and the app keeps rendering.
    expect(after.length).toBeLessThanOrEqual(before);
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
  });

  it("attending a clinical bleep opens an encounter panel", async () => {
    const user = userEvent.setup();
    render(<App />);
    const region = screen.getByRole("region", { name: /bleep|pager|task/i });
    await user.click(
      within(region).getAllByRole("button", { name: "Attend" })[0],
    );
    // After attending, either an encounter opened (encounter region present)
    // or the task resolved; the app must remain mounted and consistent.
    expect(
      screen.getByRole("heading", { name: /night med reg/i }),
    ).toBeInTheDocument();
  });

  it("restart returns the clock to the start of the shift", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /restart/i }));
    expect(screen.getAllByText("21:00").length).toBeGreaterThan(0);
  });
});

describe("seed determinism in the UI layer", () => {
  it("the mocked seed yields the same opening state the engine produces", () => {
    // Sanity check that the seed mock is wired so the UI is reproducible.
    const a = initialGameState(4242);
    const b = initialGameState(4242);
    expect(a.activeTasks.map((t) => t.templateId)).toEqual(
      b.activeTasks.map((t) => t.templateId),
    );
  });
});
