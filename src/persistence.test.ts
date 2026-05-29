// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearGame, loadGame, saveGame } from "./persistence";
import { advanceTime, initialGameState } from "./game";

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("game persistence", () => {
  it("round-trips an in-progress run", () => {
    const state = advanceTime(initialGameState(123), 40);
    saveGame(state);
    const restored = loadGame();
    expect(restored).toEqual(state);
  });

  it("returns null when there is no saved run", () => {
    expect(loadGame()).toBeNull();
  });

  it("does not persist a finished run", () => {
    const ended = { ...initialGameState(), ended: true };
    saveGame(ended);
    expect(loadGame()).toBeNull();
  });

  it("clearing removes a saved run", () => {
    saveGame(initialGameState());
    expect(loadGame()).not.toBeNull();
    clearGame();
    expect(loadGame()).toBeNull();
  });

  it("ignores corrupt save data", () => {
    window.localStorage.setItem("night-med-reg:save", "{not valid json");
    expect(loadGame()).toBeNull();
  });

  it("ignores a save written under a different version", () => {
    window.localStorage.setItem(
      "night-med-reg:save",
      JSON.stringify({ version: 999, state: initialGameState() }),
    );
    expect(loadGame()).toBeNull();
  });

  it("ignores a structurally broken state", () => {
    window.localStorage.setItem(
      "night-med-reg:save",
      JSON.stringify({ version: 1, state: { nonsense: true } }),
    );
    expect(loadGame()).toBeNull();
  });
});
