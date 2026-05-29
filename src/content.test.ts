import { describe, expect, it } from "vitest";
import { encounters, locations, pagerEvents, taskTemplates } from "./content";
import { bleepPackTasks } from "./bleepPack";
import {
  activeEncounterView,
  chooseEncounterOption,
  firstEncounterStepId,
  initialGameState,
  orderedEncounterChoices,
} from "./game";
import type { Encounter, GameState } from "./types";

const locationIds = new Set(locations.map((location) => location.id));
const encounterIds = new Set(encounters.map((encounter) => encounter.id));

/**
 * Drive an encounter from its first step to resolution, always taking a
 * forward-moving choice. Returns the resulting state plus a visited-step trail
 * so tests can assert termination and that every step was reachable.
 */
function walkEncounter(
  encounter: Encounter,
  pickUnsafe = false,
): { state: GameState; steps: string[]; iterations: number } {
  let state: GameState = {
    ...initialGameState(),
    activeEncounterId: encounter.id,
    activeEncounterStepId: firstEncounterStepId(encounter.id),
  };
  const steps: string[] = [];
  let iterations = 0;
  while (state.activeEncounterId && iterations < 25) {
    iterations += 1;
    const view = activeEncounterView(encounter, state.activeEncounterStepId);
    // Single-step encounters have no authored/synthetic step; the engine falls
    // back to the encounter's own choices, so mirror that here.
    const choices = view?.choices ?? encounter.choices;
    expect(
      choices.length,
      `encounter ${encounter.id} has no resolvable choices`,
    ).toBeGreaterThan(0);
    steps.push(view?.id ?? "base");
    // Prefer a forward (multi-step) choice so we exercise every step; fall back
    // to a terminal choice to actually resolve the encounter.
    const forward = choices.find((choice) => choice.nextStepId);
    const terminal = choices.find((choice) => !choice.nextStepId);
    const pickById = (wanted: string) =>
      choices.find((choice) => choice.id === wanted);
    const chosen =
      (forward ?? terminal)!.nextStepId !== undefined
        ? (forward ?? terminal)!
        : pickUnsafe
          ? (pickById("unsafe") ?? terminal!)
          : (pickById("best") ?? terminal!);
    state = chooseEncounterOption(state, chosen.id);
  }
  return { state, steps, iterations };
}

describe("content schema integrity", () => {
  it("has no duplicate encounter ids", () => {
    expect(encounterIds.size).toBe(encounters.length);
  });

  it("has no duplicate task template ids", () => {
    const ids = taskTemplates.map((task) => task.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every task template targets a real location", () => {
    for (const task of taskTemplates) {
      expect(
        locationIds.has(task.locationId),
        `${task.id} -> ${task.locationId}`,
      ).toBe(true);
    }
  });

  it("every task/pager/bleep encounter link resolves to a real encounter", () => {
    const linked = [...taskTemplates, ...pagerEvents, ...bleepPackTasks];
    for (const item of linked) {
      if (item.encounterId) {
        expect(
          encounterIds.has(item.encounterId),
          `${item.id} -> ${item.encounterId}`,
        ).toBe(true);
      }
    }
  });

  it("every encounter exposes a non-empty title, vignette, and choices", () => {
    for (const encounter of encounters) {
      expect(encounter.title.length, encounter.id).toBeGreaterThan(0);
      expect(encounter.vignette.length, encounter.id).toBeGreaterThan(0);
      expect(encounter.choices.length, encounter.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("every encounter sits in a real location", () => {
    for (const encounter of encounters) {
      expect(locationIds.has(encounter.locationId), encounter.id).toBe(true);
    }
  });

  it("multi-step encounters only point nextStepId at steps that exist", () => {
    for (const encounter of encounters) {
      if (!encounter.steps?.length) continue;
      const stepIds = new Set(encounter.steps.map((step) => step.id));
      for (const step of encounter.steps) {
        // Step ids within an encounter must be unique.
        expect(
          encounter.steps.filter((other) => other.id === step.id).length,
          `${encounter.id}:${step.id}`,
        ).toBe(1);
        for (const choice of step.choices) {
          if (choice.nextStepId) {
            expect(
              stepIds.has(choice.nextStepId),
              `${encounter.id}:${step.id} -> ${choice.nextStepId}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("choice ids are unique within each step", () => {
    for (const encounter of encounters) {
      const steps = encounter.steps ?? [
        { id: "base", choices: encounter.choices },
      ];
      for (const step of steps) {
        const ids = step.choices.map((choice) => choice.id);
        expect(new Set(ids).size, `${encounter.id}:${step.id}`).toBe(
          ids.length,
        );
      }
    }
  });
});

describe("every encounter is playable to resolution", () => {
  const playable = encounters.filter(
    (encounter) => encounter.id !== "consultant_grilling",
  );

  it.each(playable.map((encounter) => [encounter.id, encounter] as const))(
    "%s resolves on a forward/best path without getting stuck",
    (_id, encounter) => {
      const { state, iterations } = walkEncounter(encounter);
      expect(state.activeEncounterId, `${encounter.id} never resolved`).toBe(
        undefined,
      );
      expect(iterations).toBeLessThan(25);
      expect(state.completedEncounterIds).toContain(encounter.id);
    },
  );

  it.each(playable.map((encounter) => [encounter.id, encounter] as const))(
    "%s also resolves when unsafe choices are taken",
    (_id, encounter) => {
      const { state, iterations } = walkEncounter(encounter, true);
      expect(state.activeEncounterId).toBe(undefined);
      expect(iterations).toBeLessThan(25);
    },
  );
});

describe("unsafe clinical choices raise a Datix alert", () => {
  // Find authored choices whose consequence files a Datix and confirm the
  // alert flag is raised so the UI modal can fire.
  const datixChoices = encounters.flatMap((encounter) => {
    const steps = encounter.steps ?? [
      { id: "base", choices: encounter.choices },
    ];
    return steps.flatMap((step) =>
      step.choices
        .filter((choice) => (choice.consequence.datix ?? 0) > 0)
        .map((choice) => ({ encounter, step, choice })),
    );
  });

  it("there is at least one Datix-bearing choice to exercise", () => {
    expect(datixChoices.length).toBeGreaterThan(0);
  });

  it.each(datixChoices.map((entry) => [entry.encounter.id, entry] as const))(
    "%s fires datixAlert and increments the Datix count",
    (_id, { encounter, step, choice }) => {
      const state: GameState = {
        ...initialGameState(),
        activeEncounterId: encounter.id,
        activeEncounterStepId: encounter.steps?.length ? step.id : undefined,
      };
      const next = chooseEncounterOption(state, choice.id);
      expect(next.datixAlert).toBe(true);
      expect(next.datix).toBeGreaterThan(state.datix);
    },
  );
});

describe("orderedEncounterChoices", () => {
  it("returns every choice exactly once for the active step", () => {
    const encounter = encounters.find(
      (item) => item.id === "sepsis_hypotension",
    )!;
    const state: GameState = {
      ...initialGameState(),
      activeEncounterId: encounter.id,
      activeEncounterStepId: firstEncounterStepId(encounter.id),
    };
    const ordered = orderedEncounterChoices(state, encounter);
    const view = activeEncounterView(encounter, state.activeEncounterStepId)!;
    expect(ordered.map((choice) => choice.id).sort()).toEqual(
      view.choices.map((choice) => choice.id).sort(),
    );
  });
});
