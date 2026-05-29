// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";

vi.mock("./game", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./game")>();
  return { ...actual, randomRunSeed: () => 4242 };
});

import App from "./App";

beforeEach(() => {
  window.innerWidth = 1024;
});

describe("accessibility", () => {
  it("the opening desktop layout has no axe violations", async () => {
    const { container } = render(<App />);
    const results = await axe(container, {
      // Colour-contrast needs real rendered styles, which jsdom does not
      // compute; we audit structure/roles/labels here and leave contrast to
      // the Lighthouse step in CI.
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });

  it("the mobile layout has no axe violations", async () => {
    window.innerWidth = 600;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { container } = render(<App />);
    const results = await axe(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
