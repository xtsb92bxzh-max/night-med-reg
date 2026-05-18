import { describe, expect, it } from "vitest";
import { encounters, locations, pagerEvents, SHIFT_LENGTH, taskTemplates } from "./content";
import { bleepPackTasks } from "./bleepPack";
import { advanceTime, chooseEncounterOption, chooseWeighted, delegatePager, delegationDuration, endingRank, ignorePager, initialGameState, isDelegationAppropriate, orderedEncounterChoices, moveTo, respondToPager, spawnTask, takeBreak, useResource } from "./game";
import type { GameState } from "./types";

describe("Night Med Reg core logic", () => {
  it("advances time and spawns pager pressure", () => {
    const state = initialGameState();
    const next = advanceTime(state, 33);
    expect(next.minute).toBeGreaterThan(state.minute);
    expect(next.activeTasks.length).toBeGreaterThanOrEqual(state.activeTasks.length);
  });

  it("uses a 12-hour night shift", () => {
    expect(SHIFT_LENGTH).toBe(720);
  });

  it("selects weighted events deterministically with a seed", () => {
    const pool = [{ id: "a", weight: 1 }, { id: "b", weight: 99 }];
    const [first, firstSeed] = chooseWeighted(pool, 12345);
    const [second, secondSeed] = chooseWeighted(pool, 12345);
    expect(first).toEqual(second);
    expect(firstSeed).toBe(secondSeed);
  });

  it("applies movement costs", () => {
    const state = initialGameState();
    const next = moveTo(state, "corridor");
    expect(next.locationId).toBe("corridor");
    expect(next.minute).toBeGreaterThan(0);
    expect(next.stamina).toBeLessThan(state.stamina);
  });

  it("entering a new clinical area starts a location challenge", () => {
    const state = initialGameState();
    const next = moveTo(state, "ed_resus");
    expect(next.locationId).toBe("ed_resus");
    expect(next.activeEncounterId).toBe("acute_asthma");
  });

  it("movement is locked while a challenge is active", () => {
    const state = { ...initialGameState(), activeEncounterId: "acute_asthma" };
    const next = moveTo(state, "ed_resus");
    expect(next.locationId).toBe("mau");
    expect(next.activeEncounterId).toBe("acute_asthma");
  });

  it("urgent ignored events damage patient safety", () => {
    const state = { ...initialGameState(), activePagerIds: ["p_asthma"] };
    const next = ignorePager(state, "p_asthma");
    expect(next.patientSafety).toBeLessThan(state.patientSafety);
    expect(next.dangerousDelays).toBeGreaterThan(state.dangerousDelays);
  });

  it("time advancement during breaks generates or worsens live tasks", () => {
    const state = { ...initialGameState(), locationId: "mess" as const, activeTasks: [] };
    const next = takeBreak({ ...state, nextTaskSpawnAt: 1 });
    expect(next.minute).toBeGreaterThan(state.minute);
    expect(next.activeTasks.length).toBeGreaterThan(0);
  });

  it("vague Reg Sense tasks stay overdue after later harm", () => {
    const state = {
      ...initialGameState(),
      minute: 30,
      activeTasks: [{
        ...initialGameState().activeTasks[2],
        id: "reg-test",
        templateId: "t_reg_1",
        dueAt: 31,
        trueUrgency: "high" as const,
        regSense: true,
        vague: true,
      }],
      activePagerIds: ["reg-test"],
    };
    const next = advanceTime(state, 2);
    expect(next.patientSafety).toBeLessThan(state.patientSafety);
    expect(next.activeTasks.some((task) => task.id === "reg-test" && task.status === "deteriorated")).toBe(true);
    expect(next.log.some((entry) => entry.text.includes("Reg Sense"))).toBe(true);
  });

  it("deteriorated bleeps remain visible and only apply penalties once", () => {
    const state = {
      ...initialGameState(),
      minute: 20,
      activeTasks: [{ ...initialGameState().activeTasks[0], dueAt: 21, penaltyApplied: false }],
      activePagerIds: ["p_sepsis"],
    };
    const once = advanceTime(state, 2);
    const twice = advanceTime(once, 2);
    expect(once.activeTasks.some((task) => task.id === "p_sepsis" && task.status === "deteriorated")).toBe(true);
    expect(twice.datix).toBe(once.datix);
    expect(twice.patientSafety).toBe(once.patientSafety);
  });

  it("ward acuity rises when urgent tasks remain unresolved", () => {
    const state = initialGameState();
    const before = state.wardAcuity.mau.level;
    const next = advanceTime(state, 10);
    expect(next.wardAcuity.mau.level).toBeGreaterThanOrEqual(before);
  });

  it("oversight drops when the registrar stays put while areas go unseen", () => {
    const state = initialGameState();
    const next = advanceTime(state, 35);
    expect(next.oversight).toBeLessThan(state.oversight);
    expect(next.hospitalPressure).toBeGreaterThan(state.hospitalPressure);
  });

  it("moving to a ward refreshes oversight for that area", () => {
    const state = advanceTime(initialGameState(), 20);
    const next = moveTo(state, "respiratory");
    expect(next.locationLastVisited.respiratory).toBe(next.minute);
    expect(next.oversight).toBeGreaterThanOrEqual(state.oversight);
  });

  it("moving between locations keeps the same bleep stack", () => {
    const state = { ...initialGameState(), nextTaskSpawnAt: 999 };
    const before = state.activeTasks.map((task) => `${task.id}:${task.message}`);
    const corridor = moveTo(state, "corridor");
    const after = corridor.activeTasks.map((task) => `${task.id}:${task.message}`);
    expect(after).toEqual(before);
  });

  it("small time advances do not backfill the bleep stack before scheduled spawn", () => {
    const state = { ...initialGameState(), nextTaskSpawnAt: 100 };
    const next = advanceTime(state, 10);
    expect(next.activeTasks.map((task) => task.id)).toEqual(state.activeTasks.map((task) => task.id));
  });

  it("scheduled task spawning happens only after nextTaskSpawnAt", () => {
    const state = { ...initialGameState(), activeTasks: [], activePagerIds: [], nextTaskSpawnAt: 20 };
    const before = advanceTime(state, 19);
    const after = advanceTime(state, 21);
    expect(before.activeTasks.length).toBe(state.activeTasks.length);
    expect(after.activeTasks.length).toBeGreaterThan(state.activeTasks.length);
    expect(after.nextTaskSpawnAt).toBeGreaterThan(after.minute);
  });

  it("there is enough time to visit all major hospital areas", () => {
    let state: GameState = { ...initialGameState(), activeEncounterId: undefined, nextTaskSpawnAt: 999 };
    const route = ["corridor", "ed_resus", "corridor", "mau", "respiratory", "corridor", "cardiology", "corridor", "elderly", "surgical", "pharmacy", "corridor", "icu", "corridor", "radiology", "lifts", "mess", "lifts", "estates"] as const;
    for (const locationId of route) {
      state = { ...state, activeEncounterId: undefined };
      state = moveTo(state, locationId);
    }
    expect(state.minute).toBeLessThan(SHIFT_LENGTH / 3);
    expect(new Set(route).size).toBeGreaterThanOrEqual(locations.length - 1);
  });

  it("low-value ignored events can be efficient", () => {
    const state = { ...initialGameState(), activePagerIds: ["p_drug_chart_blue"] };
    const next = ignorePager(state, "p_drug_chart_blue");
    expect(next.patientSafety).toBe(state.patientSafety);
    expect(next.inappropriateAvoided).toBeGreaterThan(state.inappropriateAvoided);
  });

  it("pressure is manageable: handling routine work reduces it", () => {
    const state = { ...initialGameState(), hospitalPressure: 70, nextTaskSpawnAt: 999 };
    const next = respondToPager(state, "p_drug_chart_blue");
    expect(next.hospitalPressure).toBeLessThan(state.hospitalPressure);
  });

  it("pressure is manageable: appropriate delegation reduces it", () => {
    const state = { ...initialGameState(), hospitalPressure: 70 };
    const next = delegatePager(state, "p_drug_chart_blue", "fy1");
    expect(next.hospitalPressure).toBeLessThan(state.hospitalPressure);
  });

  it("pressure is manageable: a quiet break can cool the shift down", () => {
    const state = { ...initialGameState(), locationId: "mess" as const, activeTasks: [], activePagerIds: [], hospitalPressure: 60, nextTaskSpawnAt: 999 };
    const next = takeBreak(state);
    expect(next.hospitalPressure).toBeLessThan(state.hospitalPressure);
  });

  it("delegation occupies the selected team member", () => {
    const state = initialGameState();
    const next = delegatePager(state, "p_drug_chart_blue", "fy1");
    const fy1 = next.team.find((member) => member.id === "fy1")!;
    expect(fy1.busyUntil - next.minute).toBeGreaterThanOrEqual(20);
    expect(next.activeTasks.some((task) => task.id === "p_drug_chart_blue")).toBe(false);
  });

  it("delegation durations usually sit in the 20-30 minute range", () => {
    const state = initialGameState();
    const routineTask = state.activeTasks.find((task) => task.id === "p_drug_chart_blue")!;
    const sickTask = state.activeTasks.find((task) => task.id === "p_sepsis")!;
    expect(delegationDuration(routineTask, "fy1")).toBeGreaterThanOrEqual(20);
    expect(delegationDuration(routineTask, "trusted_fy2")).toBeGreaterThanOrEqual(20);
    expect(delegationDuration(sickTask, "trusted_fy2")).toBeGreaterThanOrEqual(28);
  });

  it("delegation suitability depends on the team member and task", () => {
    const state = initialGameState();
    const routineTask = state.activeTasks.find((task) => task.id === "p_drug_chart_blue")!;
    const sickTask = state.activeTasks.find((task) => task.id === "p_sepsis")!;
    expect(isDelegationAppropriate(routineTask, "fy1")).toBe(true);
    expect(isDelegationAppropriate(sickTask, "fy1")).toBe(false);
    expect(isDelegationAppropriate(sickTask, "trusted_fy2")).toBe(false);
  });

  it("routine and system work has more delegation options", () => {
    const state = initialGameState();
    const routineTask = state.activeTasks.find((task) => task.id === "p_drug_chart_blue")!;
    const systemTemplate = taskTemplates.find((task) => task.id === "t_bed_gridlock")!;
    const systemTask = { ...routineTask, ...systemTemplate, templateId: systemTemplate.id, createdAt: 0, seenAt: 0, lastUpdatedAt: 0, dueAt: 80, status: "new" as const, deferred: false, vague: false, regSense: false, penaltyApplied: false };
    expect(isDelegationAppropriate(routineTask, "fy1")).toBe(true);
    expect(isDelegationAppropriate(systemTask, "bed_manager")).toBe(true);
    expect(isDelegationAppropriate(systemTask, "locum_no_login")).toBe(true);
  });

  it("busy team members cannot be reused immediately", () => {
    const state = initialGameState();
    const first = delegatePager(state, "p_drug_chart_blue", "fy1");
    const second = delegatePager(first, "t_reg_1", "fy1");
    expect(second.activeTasks.some((task) => task.id === "t_reg_1")).toBe(true);
    expect(second.log[0].text).toContain("not available");
  });

  it("responding to clinical pager opens a multi-step encounter and choices resolve it", () => {
    const state = { ...initialGameState(), activePagerIds: ["p_sepsis"] };
    const attending = respondToPager(state, "p_sepsis");
    expect(attending.activeEncounterId).toBe("sepsis_hypotension");
    expect(attending.activeEncounterStepId).toBe("assessment");
    const assessed = chooseEncounterOption(attending, "assessment_best");
    expect(assessed.activeEncounterId).toBe("sepsis_hypotension");
    expect(assessed.activeEncounterStepId).toBe("management");
    const resolved = chooseEncounterOption(assessed, "best");
    expect(resolved.activeEncounterId).toBeUndefined();
    expect(resolved.patientsStabilised).toBeGreaterThan(state.patientsStabilised);
    expect(resolved.completedEncounterIds).toContain("sepsis_hypotension");
  });

  it("encounter choices are not always shown with the best answer first", () => {
    const state = respondToPager(initialGameState(), "p_sepsis");
    const encounter = encounters.find((item) => item.id === "sepsis_hypotension")!;
    expect(orderedEncounterChoices(state, encounter)[0].id).not.toBe("assessment_best");
  });

  it("clickable resources apply effects and consume charges", () => {
    const state = { ...initialGameState(), focus: 40, caffeine: 10, nextTaskSpawnAt: 999 };
    const next = useResource(state, "coffee");
    expect(next.focus).toBeGreaterThan(state.focus);
    expect(next.caffeine).toBeGreaterThan(state.caffeine);
    expect(next.resources.find((item) => item.id === "coffee")!.charges).toBe(state.resources.find((item) => item.id === "coffee")!.charges - 1);
  });

  it("resources can be earned outside the doctors' mess", () => {
    const template = taskTemplates.find((task) => task.id === "t_pharmacy_code")!;
    const task = {
      ...initialGameState().activeTasks[0],
      ...template,
      id: "pharmacy-resource",
      templateId: template.id,
      encounterId: undefined,
      createdAt: 0,
      seenAt: 0,
      lastUpdatedAt: 0,
      dueAt: 100,
      status: "new" as const,
      deferred: false,
      vague: false,
      regSense: false,
      penaltyApplied: false,
    };
    const state = { ...initialGameState(), activeTasks: [task], activePagerIds: [task.id], resources: initialGameState().resources.map((item) => item.id === "snack" ? { ...item, charges: 0 } : item) };
    const next = respondToPager(state, task.id);
    expect(next.resources.find((item) => item.id === "snack")!.charges).toBeGreaterThan(0);
  });

  it("bird status changes when the bird is sighted, contained, or ignored", () => {
    const template = taskTemplates.find((task) => task.id === "p_bird")!;
    const baseTask = {
      ...initialGameState().activeTasks[0],
      ...template,
      id: "bird-test",
      templateId: "p_bird",
      encounterId: undefined,
      createdAt: 0,
      seenAt: 0,
      lastUpdatedAt: 0,
      dueAt: 100,
      status: "new" as const,
      deferred: false,
      vague: false,
      regSense: false,
      penaltyApplied: false,
    };
    const sighted = { ...initialGameState(), activeTasks: [baseTask], activePagerIds: [baseTask.id], birdStatus: "sighted" as const };
    expect(respondToPager(sighted, "bird-test").birdStatus).toBe("contained");
    expect(ignorePager(sighted, "bird-test").birdStatus).toBe("loose");
  });

  it("newer bird bleeps mark the bird as sighted as soon as they enter the stack", () => {
    const base = initialGameState();
    const existingTask = base.activeTasks[0];
    const activeTasks = taskTemplates
      .filter((template) => template.id !== "corridor_pigeon")
      .map((template) => ({ ...existingTask, id: `existing-${template.id}`, templateId: template.id, locationId: template.locationId }));
    const next = spawnTask({ ...base, locationId: "corridor", activeTasks, activePagerIds: activeTasks.map((task) => task.id), birdStatus: "unseen" });
    expect(next.activeTasks.some((task) => task.templateId === "corridor_pigeon")).toBe(true);
    expect(next.birdStatus).toBe("sighted");
  });

  it("newer bird bleeps can be contained or left loose", () => {
    const base = initialGameState();
    const pigeon = taskTemplates.find((task) => task.id === "corridor_pigeon")!;
    const duck = taskTemplates.find((task) => task.id === "lifts_duck_family")!;
    const pigeonTask = { ...base.activeTasks[0], ...pigeon, id: "pigeon-test", templateId: pigeon.id, encounterId: undefined, dueAt: 180, status: "new" as const, penaltyApplied: false };
    const duckTask = { ...base.activeTasks[0], ...duck, id: "duck-test", templateId: duck.id, encounterId: undefined, dueAt: 180, status: "new" as const, penaltyApplied: false };
    expect(respondToPager({ ...base, activeTasks: [pigeonTask], activePagerIds: [pigeonTask.id], birdStatus: "sighted" }, pigeonTask.id).birdStatus).toBe("contained");
    expect(ignorePager({ ...base, activeTasks: [duckTask], activePagerIds: [duckTask.id], birdStatus: "sighted" }, duckTask.id).birdStatus).toBe("loose");
  });

  it("run ends at handover", () => {
    const state = { ...initialGameState(), minute: 718 };
    const next = advanceTime(state, 5);
    expect(next.ended).toBe(false);
    expect(next.activeEncounterId).toBe("consultant_grilling");
  });

  it("consultant grilling can be completed to end the shift", () => {
    const state = { ...initialGameState(), minute: 718 };
    const grilling = advanceTime(state, 5);
    const ended = chooseEncounterOption(grilling, "best");
    expect(ended.ended).toBe(true);
    expect(ended.handoverGrillingDone).toBe(true);
    expect(ended.endingReason).toContain("consultant grilling");
  });

  it("a competent seeded route can win after consultant grilling", () => {
    const state = { ...initialGameState(), minute: 718, score: 180, patientSafety: 88, reputation: 72, handoverQuality: 72, oversight: 72, hospitalPressure: 24, activeTasks: [], activePagerIds: [] };
    const grilling = advanceTime(state, 5);
    const ended = chooseEncounterOption(grilling, "best");
    expect(ended.ended).toBe(true);
    expect(["Safe Pair of Hands", "Consultant Material"]).toContain(endingRank(ended));
  });

  it("run ends on patient safety collapse", () => {
    const state = { ...initialGameState(), patientSafety: 2, activePagerIds: ["p_vt"] };
    const next = ignorePager(state, "p_vt");
    expect(next.ended).toBe(true);
    expect(next.endingReason).toContain("Patient safety");
  });

  it("restart state is clean", () => {
    const a = initialGameState();
    const b = initialGameState();
    expect(a).toEqual(b);
  });

  it("different run seeds produce different opening bleep stacks", () => {
    const a = initialGameState(92821).activeTasks.map((task) => task.templateId);
    const b = initialGameState(123456789).activeTasks.map((task) => task.templateId);
    expect(a).not.toEqual(b);
  });

  it("data-driven encounters are valid", () => {
    expect(encounters.length).toBeGreaterThanOrEqual(25);
    expect(pagerEvents.length).toBeGreaterThanOrEqual(25);
    expect(taskTemplates.length).toBeGreaterThanOrEqual(40);
    expect(taskTemplates.filter((task) => task.source === "system").length).toBeGreaterThanOrEqual(15);
    for (const encounter of encounters) {
      expect(encounter.choices.length).toBeGreaterThanOrEqual(3);
      expect(encounter.choices.some((choice) => choice.id === "best")).toBe(true);
      expect(encounter.choices.some((choice) => choice.unsafe)).toBe(true);
    }
  });

  it("scenario pack tasks point to real multi-step encounters", () => {
    const packTasks = taskTemplates.filter((task) => task.id.startsWith("pack_"));
    expect(packTasks.length).toBe(12);
    for (const task of packTasks) {
      const encounter = encounters.find((item) => item.id === task.encounterId);
      expect(encounter).toBeTruthy();
      expect(encounter?.steps?.length).toBeGreaterThanOrEqual(2);
      expect(encounter?.steps?.[0].choices.some((choice) => choice.nextStepId)).toBe(true);
      expect(encounter?.choices.some((choice) => choice.id === "best")).toBe(true);
      expect(encounter?.choices.some((choice) => choice.unsafe)).toBe(true);
    }
  });

  it("imported Reg Sense pack remains vague, non-delegable, and phase-aware", () => {
    const importedRegSenseTasks = taskTemplates.filter((task) => task.sender === "Your reg sense" && !task.id.startsWith("t_reg_"));
    expect(importedRegSenseTasks.length).toBe(26);
    for (const task of importedRegSenseTasks) {
      expect(task.source).toBe("reg_sense");
      expect(task.regSense).toBe(true);
      expect(task.vague).toBe(true);
      expect(task.category).toBe("ambiguous");
      expect(task.delegableTo).toEqual([]);
      expect(task.riskyDelegateTo).toEqual(["fy1", "trusted_fy2", "locum_no_login", "bed_manager"]);
      expect(task.phases?.length).toBeGreaterThan(0);
    }
  });

  it("imported bleep pack has valid locations, safe encounter links, and clamped delegation durations", () => {
    expect(bleepPackTasks.length).toBe(42);
    const locationIds = new Set(locations.map((location) => location.id));
    const encounterIds = new Set(encounters.map((encounter) => encounter.id));
    for (const task of bleepPackTasks) {
      expect(locationIds.has(task.locationId)).toBe(true);
      if (task.encounterId) expect(encounterIds.has(task.encounterId)).toBe(true);
      for (const duration of Object.values(task.delegationDuration ?? {})) {
        expect(duration).toBeGreaterThan(0);
        const activeTask = { ...initialGameState().activeTasks[0], ...task, templateId: task.id, createdAt: 0, seenAt: 0, lastUpdatedAt: 0, dueAt: 180, status: "new" as const, deferred: false, penaltyApplied: false };
        const memberId = Object.entries(task.delegationDuration ?? {}).find(([, value]) => value === duration)?.[0];
        if (memberId) expect(delegationDuration(activeTask, memberId as never)).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("mess camping cannot safely reach handover", () => {
    let state: GameState = { ...initialGameState(), locationId: "mess" };
    const startingOversight = state.oversight;
    for (let i = 0; i < 50 && !state.ended; i += 1) {
      state = takeBreak(state);
    }
    expect(state.ended || state.patientSafety < 55 || state.hospitalPressure > 75).toBe(true);
    expect(state.oversight).toBeLessThan(startingOversight);
  });
});
