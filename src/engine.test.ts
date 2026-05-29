import { describe, expect, it } from "vitest";
import {
  advanceTime,
  consumeResource,
  delegatePager,
  endingRank,
  initialGameState,
  nextRandom,
  respondToPager,
  spawnTask,
} from "./game";
import type { GameState } from "./types";

describe("RNG determinism and reproducibility", () => {
  it("nextRandom is a pure function of its seed", () => {
    expect(nextRandom(42)).toEqual(nextRandom(42));
    expect(nextRandom(42)).not.toEqual(nextRandom(43));
  });

  it("nextRandom stays within the unit interval", () => {
    let seed = 1;
    for (let i = 0; i < 500; i += 1) {
      const [value, next] = nextRandom(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      seed = next;
    }
  });

  it("the same seed produces an identical opening state", () => {
    expect(initialGameState(777)).toEqual(initialGameState(777));
  });

  it("the same seed produces an identical long spawn sequence", () => {
    const run = (seed: number) => {
      let state: GameState = {
        ...initialGameState(seed),
        activeTasks: [],
        activePagerIds: [],
        nextTaskSpawnAt: 0,
      };
      const spawned: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        state = spawnTask({ ...state, activeTasks: [], activePagerIds: [] });
        spawned.push(state.activeTasks[0]?.templateId ?? "none");
      }
      return spawned;
    };
    expect(run(31337)).toEqual(run(31337));
    expect(run(31337)).not.toEqual(run(99999));
  });

  it("two identical seeded playthroughs diverge for nothing", () => {
    const play = (seed: number) => {
      let state = initialGameState(seed);
      for (let i = 0; i < 12; i += 1) state = advanceTime(state, 20);
      return state;
    };
    expect(play(5150)).toEqual(play(5150));
  });
});

describe("stat clamping invariants", () => {
  it("never lets bounded stats leave the 0..100 range across a long run", () => {
    let state = initialGameState(2024);
    const bounded: (keyof GameState)[] = [
      "stamina",
      "focus",
      "reputation",
      "patientSafety",
      "clinicalConfidence",
      "caffeine",
      "handoverQuality",
      "oversight",
      "hospitalPressure",
    ];
    for (let i = 0; i < 36 && !state.ended; i += 1) {
      state = advanceTime(state, 20);
      for (const key of bounded) {
        const value = Number(state[key]);
        expect(
          value,
          `${key} below 0 at minute ${state.minute}`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          value,
          `${key} above 100 at minute ${state.minute}`,
        ).toBeLessThanOrEqual(100);
      }
    }
  });

  it("a flood of positive caffeine cannot exceed 100", () => {
    let state: GameState = {
      ...initialGameState(),
      caffeine: 95,
      resources: initialGameState().resources.map((item) =>
        item.id === "coffee" ? { ...item, charges: 5 } : item,
      ),
      nextTaskSpawnAt: 999,
    };
    for (let i = 0; i < 5; i += 1) state = consumeResource(state, "coffee");
    expect(state.caffeine).toBeLessThanOrEqual(100);
  });
});

describe("resource guards", () => {
  it("a resource with no charges is a no-op for stats", () => {
    const base = initialGameState();
    const state: GameState = {
      ...base,
      resources: base.resources.map((item) =>
        item.id === "coffee" ? { ...item, charges: 0 } : item,
      ),
    };
    const next = consumeResource(state, "coffee");
    expect(next.caffeine).toBe(state.caffeine);
    expect(next.focus).toBe(state.focus);
  });

  it("an encounter-only resource does nothing without an active encounter", () => {
    const state: GameState = {
      ...initialGameState(),
      activeEncounterId: undefined,
    };
    const next = consumeResource(state, "consultant_advice");
    expect(next.patientSafety).toBe(state.patientSafety);
    expect(
      next.resources.find((item) => item.id === "consultant_advice")!.charges,
    ).toBe(
      state.resources.find((item) => item.id === "consultant_advice")!.charges,
    );
  });
});

describe("team capacity edge cases", () => {
  it("delegating to an already-busy member leaves the task in the stack", () => {
    const state = initialGameState();
    const first = delegatePager(state, "p_drug_chart_blue", "fy1");
    // fy1 is now busy; a second delegation to fy1 should be refused.
    const second = delegatePager(first, "t_reg_1", "fy1");
    expect(second.activeTasks.some((task) => task.id === "t_reg_1")).toBe(true);
    expect(second.log[0].text.toLowerCase()).toContain("not available");
  });
});

describe("shift-end and ending conditions", () => {
  it("clamps the clock to the shift length and never overshoots", () => {
    const state: GameState = { ...initialGameState(), minute: 700 };
    const next = advanceTime(state, 60);
    expect(next.minute).toBe(720);
  });

  it("reaching the shift end with grilling already done finishes the run", () => {
    const state: GameState = {
      ...initialGameState(),
      minute: 719,
      handoverGrillingDone: true,
      activeEncounterId: undefined,
    };
    const next = advanceTime(state, 5);
    expect(next.ended).toBe(true);
    expect(next.endingReason).toContain("Morning handover");
  });

  it("hospital pressure at maximum with a critical task ends the shift", () => {
    const state: GameState = {
      ...initialGameState(),
      hospitalPressure: 100,
      activePagerIds: ["p_vt"],
    };
    // p_vt is a critical bleep already on the opening stack; advancing time
    // runs the ending check.
    const hasCritical = state.activeTasks.some((task) =>
      ["critical", "high"].includes(task.trueUrgency),
    );
    expect(hasCritical).toBe(true);
    const next = advanceTime(state, 1);
    expect(next.ended).toBe(true);
    expect(next.endingReason).toContain("Hospital pressure");
  });

  it("endingRank rewards a strong run over a disastrous one", () => {
    const strong: GameState = {
      ...initialGameState(),
      score: 400,
      patientSafety: 90,
      reputation: 80,
      handoverQuality: 80,
      oversight: 80,
      hospitalPressure: 20,
      dangerousDelays: 0,
      datix: 0,
    };
    const disaster: GameState = {
      ...initialGameState(),
      score: 0,
      patientSafety: 10,
      reputation: 10,
      handoverQuality: 10,
      oversight: 5,
      hospitalPressure: 95,
      dangerousDelays: 6,
      datix: 5,
    };
    const ranks = [
      "Please Attend Debrief",
      "Datix Magnet",
      "Med Reg By Technicality",
      "Functioning Human",
      "Safe Pair of Hands",
      "Consultant Material",
    ];
    expect(ranks.indexOf(endingRank(strong))).toBeGreaterThan(
      ranks.indexOf(endingRank(disaster)),
    );
  });
});

describe("responding to a clinical pager opens its encounter", () => {
  it("attending a sepsis bleep enters the matching encounter", () => {
    const state: GameState = {
      ...initialGameState(),
      activePagerIds: ["p_sepsis"],
    };
    const next = respondToPager(state, "p_sepsis");
    expect(next.activeEncounterId).toBe("sepsis_hypotension");
  });
});
