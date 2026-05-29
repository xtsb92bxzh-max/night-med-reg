import "@testing-library/jest-dom/vitest";
import { afterEach, expect, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";

// Register the jest-axe accessibility matcher for the component test suites.
expect.extend(toHaveNoViolations);

// React Testing Library: unmount components between tests.
afterEach(() => {
  cleanup();
});

// jsdom does not implement matchMedia, which useIsMobile() relies on. Provide
// a desktop-by-default stub so components render their non-mobile layout.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
