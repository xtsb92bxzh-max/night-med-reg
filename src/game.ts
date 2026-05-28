import { encounters, locations, pagerEvents, SHIFT_LENGTH, taskTemplates } from "./content";
import { treatTemplates } from "./treatPack";
import type { ActivePager, ActiveTask, Consequence, Encounter, EncounterChoice, EscalationTarget, GameState, HandoverMemory, LocationId, ResourceItem, ResourceItemId, ShiftLogEntry, ShiftPhase, TaskTemplate, TeamMember, TeamMemberId, WardAcuityState, WardMomentumState } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const clinicalLocations = locations.map((location) => location.id);

const uniqueItems = <T,>(items: T[]): T[] => [...new Set(items)];

export function formatClock(minute: number): string {
  const start = 21 * 60;
  const total = start + minute;
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

export function shiftPhaseFor(minute: number): ShiftPhase {
  if (minute >= 600) return "pre_handover";
  if (minute >= 240) return "deep";
  return "early";
}

export function nextRandom(seed: number): [number, number] {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return [nextSeed / 4294967296, nextSeed];
}

export function chooseWeighted<T extends { weight: number }>(items: T[], seed: number): [T | undefined, number] {
  if (!items.length) return [undefined, seed];
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (total <= 0) return [items[0], seed];
  const [roll, nextSeed] = nextRandom(seed);
  let cursor = roll * total;
  for (const item of items) {
    cursor -= Math.max(0, item.weight);
    if (cursor <= 0) return [item, nextSeed];
  }
  return [items[items.length - 1], nextSeed];
}

function initialWardAcuity(): Record<LocationId, WardAcuityState> {
  return Object.fromEntries(
    locations.map((location) => [location.id, { level: location.risk === "volatile" ? 45 : location.risk === "high" ? 35 : location.risk === "moderate" ? 24 : 12, unresolvedRisk: 0 }]),
  ) as Record<LocationId, WardAcuityState>;
}

function initialWardMomentum(): Record<LocationId, WardMomentumState> {
  return Object.fromEntries(
    locations.map((location) => [location.id, { tags: location.risk === "volatile" ? ["fragile"] : location.id === "mau" ? ["flow"] : [], pressure: location.risk === "volatile" ? 34 : location.risk === "high" ? 26 : location.risk === "moderate" ? 18 : 8, lastShiftedAt: 0 }]),
  ) as Record<LocationId, WardMomentumState>;
}

function initialHandoverMemory(): HandoverMemory {
  return {
    notableRisks: [],
    unresolvedRisks: [],
    clarifiedRisks: [],
    escalations: [],
    deteriorations: [],
    wardHotSpots: [],
    delegatedJobs: [],
    markedTasks: [],
    resolvedEncounters: [],
  };
}

function initialLocationLastVisited(): Record<LocationId, number> {
  return Object.fromEntries(locations.map((location) => [location.id, location.id === "mau" ? 0 : -12])) as Record<LocationId, number>;
}

function initialTeam(): TeamMember[] {
  return [
    { id: "fy1", name: "FY1", role: "Keen, overloaded, good for contained jobs", busyUntil: 0, strengths: ["routine jobs", "simple prescribing", "low-risk reviews"], trust: 60, fatigue: 18, recentDelegations: 0 },
    { id: "trusted_fy2", name: "Trusted FY2", role: "Solid with sick-ish patients if briefed well", busyUntil: 0, strengths: ["urgent reviews", "handover jobs", "clear escalation"], trust: 68, fatigue: 22, recentDelegations: 0 },
    { id: "locum_no_login", name: "Locum without login", role: "Clinically useful, digitally cursed", busyUntil: 0, strengths: ["bedside assessment", "practical ward help"], trust: 42, fatigue: 28, recentDelegations: 0 },
    { id: "bed_manager", name: "Bed manager", role: "Flow, beds, transport, and applied diplomacy", busyUntil: 0, strengths: ["flow", "systems", "logistics"], trust: 58, fatigue: 20, recentDelegations: 0 },
  ];
}

function initialResources(): ResourceItem[] {
  return [
    { id: "coffee", label: "Coffee", charges: 2, description: "+caffeine, +focus, 2m", usableWhen: "always" },
    { id: "snack", label: "Snack", charges: 1, description: "+stamina, +focus, 3m", usableWhen: "always" },
    { id: "guideline_app", label: "Guideline app", charges: 2, description: "Clinical confidence during an encounter", usableWhen: "encounter" },
    { id: "abg_kit", label: "ABG kit", charges: 1, description: "Respiratory/metabolic shortcut", usableWhen: "encounter" },
    { id: "cannula_kit", label: "Cannula kit", charges: 1, description: "Use when juggling tasks: +stamina, +patient safety, +reputation, 1m", usableWhen: "task" },
    { id: "consultant_advice", label: "Consultant advice token", charges: 1, description: "Safer escalation on a hard case", usableWhen: "encounter" },
    { id: "radiology_persuasion", label: "Radiology persuasion token", charges: 1, description: "Use while tasks are active: +reputation, +patient safety, +score, 2m", usableWhen: "task" },
  ];
}

function makeTask(template: TaskTemplate, state: GameState, id = template.id): ActiveTask {
  const timeToDeterioration = rebalanceDeterioration(template);
  const intelLevel = template.vague || template.regSense || template.category === "ambiguous" ? 0 : template.trueUrgency === "nonsense" ? 2 : 1;
  return {
    id,
    templateId: template.id,
    locationId: template.locationId,
    message: template.message,
    sender: template.sender,
    source: template.source,
    claimedUrgency: template.claimedUrgency,
    trueUrgency: template.trueUrgency,
    category: template.category,
    encounterId: template.encounterId,
    createdAt: state.minute,
    seenAt: state.minute,
    lastUpdatedAt: state.minute,
    dueAt: state.minute + timeToDeterioration,
    status: "new",
    penaltyApplied: false,
    vague: Boolean(template.vague),
    regSense: Boolean(template.regSense),
    deferred: false,
    intelLevel,
    markedForHandover: false,
    escalationHint: escalationTargetFor(template),
    ignored: template.ignored,
    handledWell: template.handledWell,
    delegableTo: template.delegableTo,
    riskyDelegateTo: template.riskyDelegateTo,
    delegationDuration: template.delegationDuration,
  };
}

function escalationTargetFor(task: Pick<ActiveTask | TaskTemplate, "locationId" | "category" | "source" | "trueUrgency" | "encounterId">): EscalationTarget {
  if (task.locationId === "radiology") return "radiology";
  if (task.locationId === "icu" || task.trueUrgency === "critical" || task.category === "emergency") return "ICU";
  if (task.source === "system" || ["mau", "corridor", "lifts", "estates"].includes(task.locationId)) return "site";
  if (task.encounterId || ["cardiology", "respiratory", "elderly", "surgical", "pharmacy"].includes(task.locationId)) return "specialty";
  return "consultant";
}

function isBirdTask(task: Pick<ActiveTask, "templateId" | "message">): boolean {
  return /\b(bird|pigeon|duck|ducklings)\b/i.test(`${task.templateId} ${task.message}`);
}

function isBirdEncounter(encounter: Encounter): boolean {
  return /\b(bird|pigeon|duck|ducklings|winged)\b/i.test(`${encounter.id} ${encounter.title} ${encounter.vignette}`);
}

function sightBirdIfNeeded<T extends { birdStatus: GameState["birdStatus"] }>(state: T): T {
  return state.birdStatus === "unseen" ? { ...state, birdStatus: "sighted" } : state;
}

function resolveBirdTaskStatus(state: GameState, task: ActiveTask, outcome: "contained" | "loose" | "sighted"): GameState {
  if (!isBirdTask(task)) return state;
  if (outcome === "contained") return { ...state, birdStatus: "contained" };
  if (outcome === "loose" && state.birdStatus !== "contained") return { ...state, birdStatus: "loose" };
  return sightBirdIfNeeded(state);
}

function resolveBirdEncounterStatus(state: GameState, encounter: Encounter, choice: EncounterChoice): GameState {
  if (!isBirdEncounter(encounter)) return state;
  if (choice.id === "best" && !choice.unsafe) return { ...state, birdStatus: "contained" };
  if (choice.unsafe && state.birdStatus !== "contained") return { ...state, birdStatus: "loose" };
  return sightBirdIfNeeded(state);
}

function rebalanceDeterioration(template: TaskTemplate): number {
  const original = template.timeToDeterioration;
  if (template.trueUrgency === "critical") return clamp(original, 10, 25);
  if (template.trueUrgency === "high") return clamp(Math.max(original, original + 15), 25, 60);
  if (template.trueUrgency === "medium") return clamp(Math.max(original + 35, 60), 60, 120);
  return clamp(Math.max(original + 50, 90), 90, 180);
}

function phaseAllowed(template: TaskTemplate, phase: ShiftPhase): boolean {
  return !template.phases || template.phases.includes(phase);
}

function pickStartingTemplate(pool: TaskTemplate[], seed: number, usedIds: Set<string>): [TaskTemplate | undefined, number] {
  return chooseWeighted(pool.filter((template) => !usedIds.has(template.id)), seed);
}

function startingTasks(state: GameState): [ActiveTask[], number] {
  if (state.rngSeed === 92821) {
    return [
      ["p_sepsis", "p_drug_chart_blue", "t_reg_1"]
        .map((id) => taskTemplates.find((template) => template.id === id))
        .filter(Boolean)
        .map((template) => makeTask(template!, state)),
      state.rngSeed,
    ];
  }
  const phase = shiftPhaseFor(state.minute);
  const earlyTemplates = taskTemplates.filter((template) => phaseAllowed(template, phase));
  const pools = [
    earlyTemplates.filter((template) => ["critical", "high"].includes(template.trueUrgency) && template.source === "pager"),
    earlyTemplates.filter((template) => template.regSense || template.source === "system" || template.category === "ambiguous"),
    earlyTemplates.filter((template) => ["routine", "inappropriate", "absurd"].includes(template.category)),
  ];
  const usedIds = new Set<string>();
  let seed = state.rngSeed;
  const selected = pools.flatMap((pool) => {
    const [template, nextSeed] = pickStartingTemplate(pool.length ? pool : earlyTemplates, seed, usedIds);
    seed = nextSeed;
    if (!template) return [];
    usedIds.add(template.id);
    return [template];
  });
  return [selected.map((template) => makeTask(template, state)), seed];
}

export function randomRunSeed(): number {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] || 92821;
  }
  return (Date.now() ^ Math.floor(Math.random() * 4294967295)) >>> 0;
}

export function initialGameState(seed = 92821): GameState {
  const base: GameState = {
    minute: 0,
    locationId: "mau",
    stamina: 82,
    focus: 78,
    reputation: 50,
    patientSafety: 72,
    pagerBacklog: 3,
    clinicalConfidence: 45,
    caffeine: 25,
    score: 0,
    handoverQuality: 35,
    emergenciesHandled: 0,
    patientsStabilised: 0,
    dangerousDelays: 0,
    inappropriateAvoided: 0,
    breaksTaken: 0,
    datix: 0,
    consultantEscalations: 0,
    chaosSurvived: 0,
    birdStatus: "unseen",
    rngSeed: seed,
    shiftPhase: "early",
    activeTasks: [],
    completedTaskIds: [],
    nextTaskSpawnAt: 32,
    wardAcuity: initialWardAcuity(),
    wardMomentum: initialWardMomentum(),
    regSense: 18,
    hospitalPressure: 32,
    oversight: 68,
    locationLastVisited: initialLocationLastVisited(),
    activePagerIds: [],
    resolvedPagerIds: [],
    deferredPagerIds: [],
    completedEncounterIds: [],
    activeEncounterStepId: undefined,
    handoverGrillingDone: false,
    handoverMemory: initialHandoverMemory(),
    escalations: [],
    team: initialTeam(),
    items: ["Guideline app", "Coffee", "ABG kit"],
    resources: initialResources(),
    log: [{ minute: 0, text: "21:00 handover complete. You are the medical registrar. The bleep has opinions.", tone: "neutral" }],
    ended: false,
  };
  const [activeTasks, rngSeed] = startingTasks(base);
  return { ...base, rngSeed, activeTasks, activePagerIds: activeTasks.map((task) => task.id) };
}

export function applyConsequence(state: GameState, consequence: Consequence): GameState {
  const datixFired = (consequence.datix ?? 0) > 0;
  return checkEnding({
    ...state,
    minute: Math.max(0, state.minute + (consequence.time ?? 0)),
    stamina: clamp(state.stamina + (consequence.stamina ?? 0)),
    focus: clamp(state.focus + (consequence.focus ?? 0)),
    reputation: clamp(state.reputation + (consequence.reputation ?? 0)),
    patientSafety: clamp(state.patientSafety + (consequence.patientSafety ?? 0)),
    pagerBacklog: Math.max(0, state.pagerBacklog + (consequence.pagerBacklog ?? 0)),
    clinicalConfidence: clamp(state.clinicalConfidence + (consequence.clinicalConfidence ?? 0)),
    caffeine: clamp(state.caffeine + (consequence.caffeine ?? 0)),
    score: state.score + (consequence.score ?? 0),
    handoverQuality: clamp(state.handoverQuality + (consequence.handoverQuality ?? 0)),
    emergenciesHandled: state.emergenciesHandled + (consequence.emergenciesHandled ?? 0),
    patientsStabilised: state.patientsStabilised + (consequence.patientsStabilised ?? 0),
    dangerousDelays: state.dangerousDelays + (consequence.dangerousDelays ?? 0),
    inappropriateAvoided: state.inappropriateAvoided + (consequence.inappropriateAvoided ?? 0),
    breaksTaken: state.breaksTaken + (consequence.breaksTaken ?? 0),
    datix: state.datix + (consequence.datix ?? 0),
    consultantEscalations: state.consultantEscalations + (consequence.consultantEscalations ?? 0),
    chaosSurvived: state.chaosSurvived + (consequence.chaosSurvived ?? 0),
    datixAlert: datixFired ? true : state.datixAlert,
  });
}

export function dismissDatixAlert(state: GameState): GameState {
  const next = addLog({ ...state, datixAlert: undefined, minute: state.minute + 3 }, "Datix form submitted. That's 3 minutes you'll never get back.", "bad");
  return runShiftDirector(next, 3);
}

export function addLog(state: GameState, text: string, tone: ShiftLogEntry["tone"] = "neutral"): GameState {
  return {
    ...state,
    log: [{ minute: state.minute, text, tone }, ...state.log].slice(0, 20),
  };
}

function remember(state: GameState, updates: Partial<HandoverMemory>): GameState {
  return {
    ...state,
    handoverMemory: {
      notableRisks: uniqueItems([...state.handoverMemory.notableRisks, ...(updates.notableRisks ?? [])]).slice(-12),
      unresolvedRisks: uniqueItems([...state.handoverMemory.unresolvedRisks, ...(updates.unresolvedRisks ?? [])]).slice(-12),
      clarifiedRisks: uniqueItems([...state.handoverMemory.clarifiedRisks, ...(updates.clarifiedRisks ?? [])]).slice(-12),
      escalations: uniqueItems([...state.handoverMemory.escalations, ...(updates.escalations ?? [])]).slice(-12),
      deteriorations: uniqueItems([...state.handoverMemory.deteriorations, ...(updates.deteriorations ?? [])]).slice(-12),
      wardHotSpots: uniqueItems([...state.handoverMemory.wardHotSpots, ...(updates.wardHotSpots ?? [])]).slice(-8),
      delegatedJobs: uniqueItems([...state.handoverMemory.delegatedJobs, ...(updates.delegatedJobs ?? [])]).slice(-12),
      markedTasks: uniqueItems([...state.handoverMemory.markedTasks, ...(updates.markedTasks ?? [])]).slice(-12),
      resolvedEncounters: uniqueItems([...state.handoverMemory.resolvedEncounters, ...(updates.resolvedEncounters ?? [])]).slice(-12),
    },
  };
}

function removeRememberedUnresolved(state: GameState, task: ActiveTask): GameState {
  return {
    ...state,
    handoverMemory: {
      ...state.handoverMemory,
      unresolvedRisks: state.handoverMemory.unresolvedRisks.filter((item) => item !== task.message),
    },
  };
}

function alterWardMomentum(state: GameState, locationId: LocationId, pressureDelta: number, tags: WardMomentumState["tags"] = [], removeTags: WardMomentumState["tags"] = []): GameState {
  const current = state.wardMomentum[locationId];
  const nextTags = uniqueItems([...current.tags.filter((tag) => !removeTags.includes(tag)), ...tags]);
  return {
    ...state,
    wardMomentum: {
      ...state.wardMomentum,
      [locationId]: {
        tags: nextTags,
        pressure: clamp(current.pressure + pressureDelta),
        lastShiftedAt: state.minute,
      },
    },
  };
}

function momentumTagsForTask(task: ActiveTask): WardMomentumState["tags"] {
  if (task.source === "system") return ["systemBlocked"];
  if (task.regSense || task.vague || task.category === "ambiguous") return ["quietlyUnsafe"];
  if (["critical", "high"].includes(task.trueUrgency)) return ["fragile"];
  if (task.locationId === "mau") return ["flow"];
  return [];
}

function taskRiskLabel(task: ActiveTask): string {
  return `${task.message} (${locations.find((location) => location.id === task.locationId)?.name ?? task.locationId})`;
}

export function handoverMemoryScore(state: GameState): number {
  const memory = state.handoverMemory;
  const markedLiveTasks = state.activeTasks.filter((task) => task.markedForHandover).length;
  return clamp(
    state.handoverQuality +
      memory.markedTasks.length * 2 +
      memory.clarifiedRisks.length * 3 +
      memory.escalations.length * 3 +
      memory.resolvedEncounters.length * 3 +
      markedLiveTasks * 4 -
      memory.deteriorations.length * 3 -
      Math.max(0, state.activeTasks.filter((task) => ["critical", "high"].includes(task.trueUrgency) && !task.markedForHandover).length - 1) * 5,
  );
}

export function handoverDebrief(state: GameState): string[] {
  const memory = state.handoverMemory;
  const strongest = memory.escalations[0] ?? memory.clarifiedRisks[0] ?? memory.resolvedEncounters[0] ?? "You kept enough structure in the noise for the day team to start safely.";
  const unresolved = state.activeTasks.find((task) => ["critical", "high", "medium"].includes(task.trueUrgency));
  const delegation = state.team.reduce((best, member) => member.recentDelegations > best.recentDelegations ? member : best, state.team[0]);
  const hotWard = locations.reduce((best, location) => {
    const bestPressure = state.wardMomentum[best.id].pressure + state.wardAcuity[best.id].level;
    const pressure = state.wardMomentum[location.id].pressure + state.wardAcuity[location.id].level;
    return pressure > bestPressure ? location : best;
  }, locations[0]);
  return [
    `Strongest handover point: ${strongest}`,
    unresolved ? `Unresolved risk: ${unresolved.markedForHandover ? "flagged" : "not clearly flagged"} - ${unresolved.message}` : "Unresolved risk: no live clinical issue dominated the desk at 09:00.",
    `Delegation pattern: ${delegation.name} carried ${delegation.recentDelegations} job${delegation.recentDelegations === 1 ? "" : "s"}; trust ${delegation.trust}, fatigue ${delegation.fatigue}.`,
    `Ward that shaped the night: ${hotWard.name}, with ${state.wardMomentum[hotWard.id].tags.join(", ") || "plain old background pressure"}.`,
  ];
}

function fallbackPagerTasks(state: GameState): ActiveTask[] {
  const taskIds = new Set(state.activeTasks.map((task) => task.id));
  return state.activePagerIds
    .filter((id) => !taskIds.has(id))
    .map((id) => {
      const event = pagerEvents.find((pager) => pager.id === id);
      const template = taskTemplates.find((item) => item.id === id);
      if (!event || !template) return undefined;
      return makeTask(template, state, event.id);
    })
    .filter(Boolean) as ActiveTask[];
}

export function liveTasks(state: GameState): ActiveTask[] {
  return [...state.activeTasks, ...fallbackPagerTasks(state)].sort((a, b) => {
    const urgency = { critical: 0, high: 1, medium: 2, low: 3, nonsense: 4 };
    return urgency[a.trueUrgency] - urgency[b.trueUrgency] || a.dueAt - b.dueAt;
  });
}

export function activePagers(state: GameState): ActivePager[] {
  return liveTasks(state).map((task) => ({
    id: task.id,
    locationId: task.locationId,
    message: task.message,
    sender: task.sender,
    claimedUrgency: task.claimedUrgency,
    trueUrgency: task.trueUrgency,
    timeToDeterioration: Math.max(0, task.dueAt - state.minute),
    category: task.category,
    encounterId: task.encounterId,
    ignored: task.ignored,
    handledWell: task.handledWell,
    age: state.minute - task.createdAt,
    deferred: task.deferred,
  }));
}

function syncLegacyPagerIds(state: GameState): GameState {
  return { ...state, activePagerIds: state.activeTasks.map((task) => task.id), pagerBacklog: state.activeTasks.filter((task) => task.source !== "treat").length };
}

function updateTeamAvailability(state: GameState): GameState {
  return {
    ...state,
    team: state.team.map((member) => member.busyUntil <= state.minute ? { ...member, busyUntil: 0, fatigue: clamp(member.fatigue - 2) } : member),
  };
}

export function isTeamMemberAvailable(state: GameState, memberId: TeamMemberId): boolean {
  const member = state.team.find((item) => item.id === memberId);
  return Boolean(member && member.busyUntil <= state.minute);
}

export function delegationDuration(task: ActiveTask, memberId: TeamMemberId): number {
  const explicit = task.delegationDuration?.[memberId];
  if (explicit) return Math.max(20, Math.min(34, explicit));
  const base = task.trueUrgency === "critical" ? 30 : task.trueUrgency === "high" ? 28 : task.trueUrgency === "medium" ? 24 : 20;
  const adjusted =
    memberId === "locum_no_login" && task.encounterId ? base - 3 :
    memberId === "locum_no_login" && (task.source === "system" || ["routine", "inappropriate"].includes(task.category)) ? base + 6 :
    memberId === "bed_manager" && task.source === "system" ? base - 3 :
    memberId === "bed_manager" ? base + 4 :
    memberId === "trusted_fy2" ? base - 2 :
    base;
  return Math.max(20, Math.min(34, adjusted));
}

function adjustedDelegationDuration(state: GameState, task: ActiveTask, memberId: TeamMemberId): number {
  const member = state.team.find((item) => item.id === memberId);
  const base = delegationDuration(task, memberId);
  if (!member) return base;
  const trustAdjustment = member.trust >= 70 ? -3 : member.trust < 40 ? 4 : 0;
  const fatigueAdjustment = member.fatigue >= 65 ? 5 : member.fatigue >= 45 ? 2 : 0;
  const intelAdjustment = task.intelLevel >= 2 ? -4 : task.intelLevel >= 1 ? -2 : 2;
  return Math.max(20, Math.min(40, base + trustAdjustment + fatigueAdjustment + intelAdjustment));
}

export function isDelegationAppropriate(task: ActiveTask, memberId: TeamMemberId): boolean {
  if (task.delegableTo?.includes(memberId)) return true;
  if (task.riskyDelegateTo?.includes(memberId)) return false;
  if (task.regSense || task.source === "reg_sense") return false;
  if (task.trueUrgency === "critical") return false;
  if (memberId === "fy1") return ["low", "nonsense"].includes(task.trueUrgency) || (task.trueUrgency === "medium" && ["routine", "inappropriate", "absurd"].includes(task.category)) || (task.trueUrgency === "high" && task.category === "routine");
  if (memberId === "trusted_fy2") return task.category !== "emergency";
  if (memberId === "locum_no_login") return Boolean(task.encounterId) || task.source === "system" || task.trueUrgency === "medium";
  if (memberId === "bed_manager") return task.source === "system" || ["routine", "inappropriate", "absurd"].includes(task.category) || task.locationId === "mau";
  return false;
}

function pressureReliefForTask(task: ActiveTask): number {
  const urgencyRelief =
    task.trueUrgency === "critical" ? 14 :
    task.trueUrgency === "high" ? 10 :
    task.trueUrgency === "medium" ? 6 :
    task.trueUrgency === "low" ? 3 :
    2;
  const systemsRelief = task.source === "system" ? 3 : 0;
  const regSenseRelief = task.regSense ? 3 : 0;
  return urgencyRelief + systemsRelief + regSenseRelief;
}

function pressureDeltaForEncounterChoice(choice: EncounterChoice): number {
  if (choice.unsafe) return 8;
  return choice.id === "best" ? -12 : -6;
}

function alterWardAcuity(state: GameState, locationId: LocationId, levelDelta: number, riskDelta: number): GameState {
  const current = state.wardAcuity[locationId];
  return {
    ...state,
    wardAcuity: {
      ...state.wardAcuity,
      [locationId]: {
        level: clamp(current.level + levelDelta),
        unresolvedRisk: clamp(current.unresolvedRisk + riskDelta),
      },
    },
  };
}

function refreshOversightAt(state: GameState, locationId: LocationId, amount: number): GameState {
  const wasStale = state.minute - state.locationLastVisited[locationId] > 28;
  const acuity = state.wardAcuity[locationId];
  const pressureRelief = wasStale ? 4 : acuity.level > 55 || acuity.unresolvedRisk > 30 ? 3 : amount >= 8 ? 2 : 1;
  const next = {
    ...state,
    oversight: clamp(state.oversight + amount),
    hospitalPressure: clamp(state.hospitalPressure - pressureRelief),
    locationLastVisited: {
      ...state.locationLastVisited,
      [locationId]: state.minute,
    },
  };
  return alterWardAcuity(next, locationId, wasStale ? -6 : -3, wasStale ? -4 : -2);
}

function staleLocations(state: GameState): LocationId[] {
  return clinicalLocations.filter((locationId) => state.minute - state.locationLastVisited[locationId] > 28);
}

function applyOversightPressure(state: GameState, elapsedMinutes: number): GameState {
  const stale = staleLocations(state);
  const currentAreaFocusPenalty = elapsedMinutes >= 8 ? 1 : 0;
  const rawLoss = Math.ceil(elapsedMinutes / 10) + Math.floor(stale.length / 3) + currentAreaFocusPenalty;
  const oversightLoss = state.shiftPhase === "pre_handover" ? Math.floor(rawLoss / 2) : rawLoss;
  let next = {
    ...state,
    oversight: clamp(state.oversight - oversightLoss),
    hospitalPressure: clamp(state.hospitalPressure + Math.floor(stale.length / 4) + (state.oversight < 35 ? 4 : 0)),
  };

  for (const locationId of stale.slice(0, 4)) {
    next = alterWardAcuity(next, locationId, state.oversight < 45 ? 2 : 1, 1);
  }
  return next;
}

function candidateTemplates(state: GameState): TaskTemplate[] {
  const activeTemplateIds = new Set(state.activeTasks.map((task) => task.templateId));
  const phase = shiftPhaseFor(state.minute);
  return taskTemplates
    .filter((template) => !activeTemplateIds.has(template.id))
    .filter((template) => !template.phases || template.phases.includes(phase))
    .map((template) => {
      const localBonus = template.locationId === state.locationId ? 5 : 0;
      const acuityBonus = Math.floor(state.wardAcuity[template.locationId].level / 18);
      const momentum = state.wardMomentum[template.locationId];
      const momentumBonus = Math.floor(momentum.pressure / 8) + (momentum.tags.includes("systemBlocked") && template.source === "system" ? 6 : 0) + (momentum.tags.includes("quietlyUnsafe") && (template.vague || template.category === "ambiguous") ? 6 : 0) + (momentum.tags.includes("fragile") && ["critical", "high"].includes(template.trueUrgency) ? 6 : 0);
      const pressureBonus = state.hospitalPressure > 65 && ["critical", "high"].includes(template.trueUrgency) ? 4 : 0;
      const regSenseBonus = template.regSense && state.regSense > 35 ? (state.shiftPhase === "deep" ? 2 : 3) : 0;
      return { ...template, weight: template.weight + localBonus + acuityBonus + momentumBonus + pressureBonus + regSenseBonus };
    });
}

function nextSpawnDelay(state: GameState, seed: number): [number, number] {
  const phase = shiftPhaseFor(state.minute);
  const [roll, nextSeed] = nextRandom(seed);
  const range = phase === "early" ? [25, 45] : phase === "deep" ? [18, 35] : [15, 30];
  const pressureAdjustment = state.hospitalPressure > 70 || state.oversight < 35 ? -8 : state.hospitalPressure < 35 && state.oversight > 65 ? 6 : 0;
  const delay = Math.max(10, Math.round(range[0] + roll * (range[1] - range[0]) + pressureAdjustment));
  return [delay, nextSeed];
}

export function spawnTask(state: GameState): GameState {
  const [template, rngSeed] = chooseWeighted(candidateTemplates(state), state.rngSeed);
  if (!template) return { ...state, rngSeed };
  const taskId = `${template.id}-${state.minute}-${rngSeed}`;
  const task = makeTask(template, { ...state, rngSeed }, taskId);
  const next = syncLegacyPagerIds(resolveBirdTaskStatus({
    ...state,
    rngSeed,
    activeTasks: [...state.activeTasks, task],
    completedTaskIds: [...new Set([...state.completedTaskIds, template.id])],
    regSense: clamp(state.regSense + (task.regSense ? 6 : 1)),
  }, task, "sighted"));
  const label = task.regSense ? "Reg Sense" : task.source === "handover" ? "Handover" : task.source === "system" ? "System" : "Bleep";
  return addLog(next, `${label}: ${task.message}`, task.trueUrgency === "critical" ? "bad" : "neutral");
}

function deteriorateTask(state: GameState, task: ActiveTask): GameState {
  if (task.penaltyApplied) return state;
  const severityMultiplier = Math.min(1.5, Math.max(1, state.wardAcuity[task.locationId].level / 45));
  const momentum = state.wardMomentum[task.locationId];
  const momentumMultiplier = momentum.tags.includes("fragile") || momentum.tags.includes("quietlyUnsafe") ? 1.25 : 1;
  const amplified = {
    ...task.ignored,
    patientSafety: Math.round((task.ignored.patientSafety ?? 0) * severityMultiplier * momentumMultiplier),
    dangerousDelays: task.trueUrgency === "critical" || task.trueUrgency === "high" ? Math.max(1, task.ignored.dangerousDelays ?? 0) : task.ignored.dangerousDelays,
    datix: ["critical", "high", "medium"].includes(task.trueUrgency) ? Math.max(1, task.ignored.datix ?? 0) : task.ignored.datix,
  };
  let next = applyConsequence(state, amplified);
  next = {
    ...next,
    activeTasks: next.activeTasks.map((item) => item.id === task.id ? { ...item, status: "deteriorated", deterioratedAt: next.minute, penaltyApplied: true, lastUpdatedAt: next.minute } : item),
    hospitalPressure: clamp(next.hospitalPressure + 8),
    regSense: task.regSense ? clamp(next.regSense - 8) : next.regSense,
  };
  next = resolveBirdTaskStatus(next, task, "loose");
  next = alterWardAcuity(next, task.locationId, 12, 16);
  next = alterWardMomentum(next, task.locationId, 12, ["fragile", "quietlyUnsafe"]);
  next = remember(next, { deteriorations: [taskRiskLabel(task)], unresolvedRisks: [task.message], wardHotSpots: [task.locationId] });
  if (task.regSense && task.encounterId) {
    return addLog(syncLegacyPagerIds(next), `Reg Sense missed: ${task.message}. It is now overdue and unsafe.`, "bad");
  }
  return addLog(syncLegacyPagerIds(next), `Delayed: ${task.message}. The situation deteriorated.`, "bad");
}

function tickTaskDeterioration(state: GameState): GameState {
  let next = state;
  for (const task of [...next.activeTasks]) {
    if (next.minute >= task.dueAt && ["critical", "high", "medium"].includes(task.trueUrgency)) {
      next = deteriorateTask(next, task);
    }
  }
  return syncLegacyPagerIds(next);
}

export function runShiftDirector(state: GameState, elapsedMinutes: number): GameState {
  if (state.ended) return state;
  const highRiskTasks = state.activeTasks.filter((task) => ["critical", "high"].includes(task.trueUrgency)).length;
  const quietWellControlled = state.activeTasks.length <= 1 && highRiskTasks === 0 && state.oversight > 60;
  const passivePressure =
    Math.ceil(elapsedMinutes / 8) +
    Math.max(0, state.activeTasks.length - 3) +
    (state.locationId === "mess" && state.activeTasks.length > 0 ? 6 : 0) -
    (quietWellControlled ? Math.ceil(elapsedMinutes / 15) : 0);
  let next = updateTeamAvailability({
    ...state,
    shiftPhase: shiftPhaseFor(state.minute),
    hospitalPressure: clamp(state.hospitalPressure + passivePressure),
    regSense: clamp(state.regSense + Math.ceil(elapsedMinutes / 8)),
  });
  next = applyOversightPressure(next, elapsedMinutes);

  for (const locationId of clinicalLocations) {
    const activeHere = next.activeTasks.filter((task) => task.locationId === locationId).length;
    if (activeHere > 0) next = alterWardAcuity(next, locationId, activeHere, activeHere * 2);
    if (activeHere > 0) next = alterWardMomentum(next, locationId, Math.ceil(activeHere / 2), activeHere >= 2 ? ["fragile"] : []);
  }

  next = tickTaskDeterioration(next);
  while (!next.ended && !next.activeEncounterId && next.minute >= next.nextTaskSpawnAt) {
    next = spawnTask(next);
    const [delay, rngSeed] = nextSpawnDelay(next, next.rngSeed);
    next = { ...next, rngSeed, nextTaskSpawnAt: next.minute + delay };
  }
  return syncLegacyPagerIds(next);
}

export function spawnPager(state: GameState): GameState {
  return spawnTask(state);
}

function triggerLocationEncounter(state: GameState): GameState {
  if (state.activeEncounterId || state.ended) return state;
  const encounter = encounters.find((item) => item.locationId === state.locationId && !state.completedEncounterIds.includes(item.id));
  if (!encounter) return state;
  const next = { ...state, activeEncounterId: encounter.id, activeEncounterStepId: firstEncounterStepId(encounter.id) };
  return addLog(isBirdEncounter(encounter) ? sightBirdIfNeeded(next) : next, `On arrival: ${encounter.title}`, encounter.category === "emergency" ? "bad" : "neutral");
}

export function advanceTime(state: GameState, minutes: number): GameState {
  let next = applyConsequence(state, { time: minutes, stamina: -Math.ceil(minutes / 6), focus: -Math.ceil(minutes / 8) });
  next = runShiftDirector(next, minutes);
  return checkEnding(next);
}

const treatSpawnLocations: LocationId[] = ["ed_resus", "mau", "respiratory", "cardiology", "elderly", "surgical", "icu", "radiology", "pharmacy", "estates"];

function maybeTreatOnArrival(state: GameState): GameState {
  if (!treatSpawnLocations.includes(state.locationId)) return state;
  if (state.activeTasks.some((t) => t.source === "treat")) return state;
  const [roll, rngSeed] = nextRandom(state.rngSeed);
  const chance = 0.18 + (state.stamina < 40 ? 0.08 : 0);
  if (roll > chance) return { ...state, rngSeed };
  const candidates = treatTemplates.filter((t) => t.locationIds.length === 0 || t.locationIds.includes(state.locationId));
  if (!candidates.length) return { ...state, rngSeed };
  const [treatRoll, nextSeed] = nextRandom(rngSeed);
  const template = candidates[Math.floor(treatRoll * candidates.length)];
  const treat: ActiveTask = {
    id: `treat-${template.id}-${state.minute}`,
    templateId: template.id,
    locationId: state.locationId,
    message: template.message,
    sender: template.flavour,
    source: "treat",
    claimedUrgency: "offered",
    trueUrgency: "low",
    category: "routine",
    createdAt: state.minute,
    seenAt: state.minute,
    lastUpdatedAt: state.minute,
    dueAt: state.minute + 999,
    status: "new",
    intelLevel: 2,
    vague: false,
    regSense: false,
    deferred: false,
    markedForHandover: false,
    ignored: {},
    handledWell: template.consequence,
    delegableTo: [],
    riskyDelegateTo: [],
    delegationDuration: {},
  };
  return addLog(
    syncLegacyPagerIds({ ...state, rngSeed: nextSeed, activeTasks: [...state.activeTasks, treat] }),
    `Treat: ${treat.message}`,
    "good",
  );
}

export function acceptTreat(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || task.source !== "treat" || state.ended) return state;
  const next = applyConsequence(removeTask(state, task), task.handledWell);
  return addLog(syncLegacyPagerIds(next), `Accepted: ${task.message}`, "good");
}

export function dismissTreat(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || task.source !== "treat" || state.ended) return state;
  return addLog(removeTask(state, task), `Declined: ${task.message}`, "neutral");
}

export function moveTo(state: GameState, locationId: LocationId): GameState {
  const current = locations.find((location) => location.id === state.locationId)!;
  const destination = locations.find((location) => location.id === locationId)!;
  if (!current.links.includes(locationId) || state.ended || state.activeEncounterId) return state;
  const friction = 0;
  let next = advanceTime(state, destination.timeCost + friction);
  next = { ...next, locationId };
  next = refreshOversightAt(next, locationId, locationId === "corridor" ? 4 : 8);
  next = alterWardMomentum(next, locationId, -4, [], ["quietlyUnsafe"]);
  next = addLog(next, `Moved to ${destination.name}. ${destination.quirk}`, friction ? "bad" : "neutral");
  next = maybeTreatOnArrival(next);
  return triggerLocationEncounter(next);
}

function findTask(state: GameState, taskId: string): ActiveTask | undefined {
  return liveTasks(state).find((task) => task.id === taskId || task.templateId === taskId);
}

function removeTask(state: GameState, task: ActiveTask): GameState {
  return removeRememberedUnresolved(syncLegacyPagerIds({
    ...state,
    activeTasks: state.activeTasks.filter((item) => item.id !== task.id),
    activePagerIds: state.activePagerIds.filter((id) => id !== task.id),
    resolvedPagerIds: [...state.resolvedPagerIds, task.id],
  }), task);
}

export function clarifyTask(state: GameState, taskId: string): GameState {
  if (state.ended) return state;
  const task = findTask(state, taskId);
  if (!task) return state;
  if (task.intelLevel >= 2) return addLog(state, `Already clear enough: ${task.message}`, "neutral");
  const cost = task.vague || task.regSense ? 4 : 2;
  const nextIntel = (Math.min(2, task.intelLevel + 1) as ActiveTask["intelLevel"]);
  const activeTasks = state.activeTasks.map((item) => item.id === task.id ? {
    ...item,
    intelLevel: nextIntel,
    clarifiedAt: state.minute + cost,
    lastUpdatedAt: state.minute + cost,
    dueAt: item.trueUrgency === "critical" ? Math.max(item.dueAt, state.minute + 8) : item.dueAt + (task.intelLevel === 0 ? 8 : 4),
  } : item);
  let next = advanceTime({
    ...state,
    activeTasks,
    handoverQuality: clamp(state.handoverQuality + 2),
    clinicalConfidence: clamp(state.clinicalConfidence + 2),
  }, cost);
  next = remember(next, { clarifiedRisks: [taskRiskLabel(task)], unresolvedRisks: ["critical", "high", "medium"].includes(task.trueUrgency) ? [task.message] : [] });
  next = alterWardMomentum(next, task.locationId, -2, task.regSense || task.vague ? ["quietlyUnsafe"] : []);
  const intelNote = nextIntel === 1
    ? "Safe to escalate now. Delegation will run faster."
    : "Full picture. Escalation will score higher; delegation runs at its fastest.";
  return addLog(syncLegacyPagerIds(next), `Clarified: ${task.message}. ${intelNote}`, "good");
}

export function markTaskForHandover(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || state.ended) return state;
  const activeTasks = state.activeTasks.map((item) => item.id === task.id ? { ...item, markedForHandover: true } : item);
  const next = remember({ ...state, activeTasks, handoverQuality: clamp(state.handoverQuality + 3) }, { markedTasks: [taskRiskLabel(task)], unresolvedRisks: ["critical", "high", "medium"].includes(task.trueUrgency) ? [task.message] : [] });
  return addLog(syncLegacyPagerIds(next), `Marked for handover: ${task.message}`, "good");
}

function escalationTimingForTask(state: GameState, task: ActiveTask): "early" | "late" | "premature" {
  const remaining = task.dueAt - state.minute;
  if (task.status === "deteriorated" || remaining <= 8) return "late";
  if (task.intelLevel < 1) return "premature";
  return "early";
}

function escalationConsequence(target: EscalationTarget, timing: "early" | "late" | "premature", intelLevel: ActiveTask["intelLevel"] = 1): Consequence {
  if (timing === "premature") return { time: 3, focus: -4, reputation: -4, score: -5 };
  if (timing === "late") return { time: 5, patientSafety: 3, reputation: -1, clinicalConfidence: 3, handoverQuality: 3, consultantEscalations: 1, score: 20 };
  const intelBonus = intelLevel >= 2 ? 5 : 0;
  return { time: target === "ICU" ? 5 : 4, patientSafety: 5 + intelBonus, reputation: 2, clinicalConfidence: 4, handoverQuality: 4, consultantEscalations: target === "consultant" || target === "ICU" ? 1 : 0, score: 35 + intelBonus };
}

export function escalateTask(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || state.ended) return state;
  const target = task.escalationHint ?? escalationTargetFor(task);
  const timing = escalationTimingForTask(state, task);
  const record = { id: `${task.id}:${state.minute}:${target}`, minute: state.minute, target, subject: task.message, locationId: task.locationId, timing };
  let next = applyConsequence(state, escalationConsequence(target, timing, task.intelLevel));
  next = {
    ...next,
    escalations: [...next.escalations, record],
    activeTasks: next.activeTasks.map((item) => item.id === task.id ? { ...item, intelLevel: Math.max(item.intelLevel, 1) as ActiveTask["intelLevel"], markedForHandover: true, lastUpdatedAt: next.minute, dueAt: timing === "late" ? Math.max(next.minute + 6, item.dueAt) : item.dueAt + 8 } : item),
    hospitalPressure: clamp(next.hospitalPressure + (timing === "premature" ? 2 : -4)),
  };
  next = runShiftDirector(next, escalationConsequence(target, timing, task.intelLevel).time ?? 0);
  next = remember(next, { escalations: [`${target} for ${task.message}`], markedTasks: [taskRiskLabel(task)], unresolvedRisks: [task.message] });
  next = alterWardMomentum(next, task.locationId, timing === "premature" ? 1 : -5, [], timing === "early" ? ["fragile"] : []);
  const timingText = timing === "early" ? "early enough to help" : timing === "late" ? "late, but still useful" : "a bit theatrical";
  return addLog(syncLegacyPagerIds(next), `Escalated to ${target}: ${task.message}. Timing: ${timingText}.`, timing === "premature" ? "neutral" : "good");
}

export function markEncounterForHandover(state: GameState): GameState {
  const encounter = encounters.find((item) => item.id === state.activeEncounterId);
  if (!encounter || state.ended) return state;
  const next = remember({ ...state, handoverQuality: clamp(state.handoverQuality + 4) }, { markedTasks: [`${encounter.title} (${locations.find((location) => location.id === encounter.locationId)?.name ?? encounter.locationId})`], unresolvedRisks: [encounter.title] });
  return addLog(next, `Marked active encounter for handover: ${encounter.title}`, "good");
}

export function escalateEncounter(state: GameState): GameState {
  const encounter = encounters.find((item) => item.id === state.activeEncounterId);
  if (!encounter || state.ended) return state;
  const target = escalationTargetFor({ ...encounter, source: "pager" as const, trueUrgency: encounter.category === "emergency" ? "critical" : "high", encounterId: encounter.id });
  const record = { id: `encounter:${encounter.id}:${state.minute}:${target}`, minute: state.minute, target, subject: encounter.title, locationId: encounter.locationId, timing: "early" as const };
  let next = applyConsequence(state, escalationConsequence(target, "early"));
  next = {
    ...next,
    escalations: [...next.escalations, record],
    hospitalPressure: clamp(next.hospitalPressure - 4),
  };
  next = runShiftDirector(next, escalationConsequence(target, "early").time ?? 0);
  next = remember(next, { escalations: [`${target} for ${encounter.title}`], markedTasks: [encounter.title], unresolvedRisks: [encounter.title] });
  next = alterWardMomentum(next, encounter.locationId, -4);
  return addLog(next, `Escalated to ${target}: ${encounter.title}.`, "good");
}

export function respondToPager(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || state.ended) return state;
  let next = removeTask(resolveBirdTaskStatus({ ...state, locationId: task.locationId }, task, "sighted"), task);
  next = advanceTime(next, 5);
  next = refreshOversightAt(next, task.locationId, task.regSense ? 10 : 7);
  next = alterWardAcuity(next, task.locationId, -8, -10);
  next = alterWardMomentum(next, task.locationId, -6, [], ["quietlyUnsafe"]);
  if (task.encounterId) {
    next = { ...next, activeEncounterId: task.encounterId, activeEncounterStepId: firstEncounterStepId(task.encounterId) };
    next = remember(next, { notableRisks: [taskRiskLabel(task)] });
    return addLog(next, `You attend: ${task.message}`, "neutral");
  }
  next = applyConsequence(next, task.handledWell);
  next = { ...next, hospitalPressure: clamp(next.hospitalPressure - pressureReliefForTask(task)) };
  next = resolveBirdTaskStatus(next, task, "contained");
  next = maybeAwardResource(next, task);
  next = remember(next, { resolvedEncounters: [taskRiskLabel(task)] });
  return addLog(syncLegacyPagerIds(next), `Handled: ${task.message}`, "good");
}

export function deferPager(state: GameState, taskId: string): GameState {
  if (state.ended) return state;
  const task = findTask(state, taskId);
  if (!task) return state;
  const vaguePenalty = task.intelLevel === 0 && (task.vague || task.regSense || ["critical", "high"].includes(task.trueUrgency)) ? 5 : 0;
  const activeTasks = state.activeTasks.map((item) => item.id === task.id ? { ...item, deferred: true, status: "deferred" as const, lastUpdatedAt: state.minute, dueAt: Math.max(state.minute + 6, item.dueAt - 4 - vaguePenalty) } : item);
  let next = advanceTime({ ...state, activeTasks, deferredPagerIds: [...new Set([...state.deferredPagerIds, task.id])], hospitalPressure: clamp(state.hospitalPressure + 4 + (vaguePenalty ? 2 : 0)) }, 3);
  next = alterWardAcuity(next, task.locationId, 3 + (vaguePenalty ? 2 : 0), 4 + vaguePenalty);
  next = alterWardMomentum(next, task.locationId, 4 + vaguePenalty, momentumTagsForTask(task));
  if (vaguePenalty) next = remember(next, { unresolvedRisks: [task.message], wardHotSpots: [task.locationId] });
  return addLog(next, `Deferred: ${task.message}`, task.trueUrgency === "critical" ? "bad" : "neutral");
}

export function ignorePager(state: GameState, taskId: string): GameState {
  const task = findTask(state, taskId);
  if (!task || state.ended) return state;
  let next = applyConsequence(state, task.ignored);
  next = resolveBirdTaskStatus(next, task, "loose");
  next = removeTask(next, task);
  next = alterWardAcuity(next, task.locationId, ["critical", "high"].includes(task.trueUrgency) ? 10 : 3, task.vague ? 10 : 5);
  next = alterWardMomentum(next, task.locationId, ["critical", "high"].includes(task.trueUrgency) ? 12 : 5, momentumTagsForTask(task));
  next = { ...next, hospitalPressure: clamp(next.hospitalPressure + (task.trueUrgency === "nonsense" ? -2 : 6)) };
  if (["critical", "high", "medium"].includes(task.trueUrgency)) next = remember(next, { unresolvedRisks: [task.message], deteriorations: [taskRiskLabel(task)], wardHotSpots: [task.locationId] });
  const tone = ["critical", "high"].includes(task.trueUrgency) ? "bad" : "good";
  return addLog(next, `Ignored: ${task.message}`, tone);
}

export function delegatePager(state: GameState, taskId: string, memberId: TeamMemberId = "trusted_fy2"): GameState {
  const task = findTask(state, taskId);
  if (!task || state.ended) return state;
  const member = state.team.find((item) => item.id === memberId);
  if (!member || member.busyUntil > state.minute) {
    return addLog(state, `${member?.name ?? "Team member"} is not available for delegation.`, "bad");
  }
  const duration = adjustedDelegationDuration(state, task, memberId);
  const appropriate = isDelegationAppropriate(task, memberId);
  const consequence = appropriate
    ? { reputation: 1, score: 25, pagerBacklog: -1 }
    : { patientSafety: -7, reputation: -3, dangerousDelays: task.trueUrgency === "critical" || task.trueUrgency === "high" ? 1 : 0 };
  let next = applyConsequence(state, consequence);
  next = {
    ...next,
    team: next.team.map((item) => item.id === memberId ? {
      ...item,
      busyUntil: next.minute + duration,
      trust: clamp(item.trust + (appropriate ? (item.id === "fy1" ? 6 : 4) : -8)),
      fatigue: clamp(item.fatigue + Math.ceil(duration / 6) + (appropriate ? 0 : 6)),
      recentDelegations: item.recentDelegations + 1,
    } : item),
    completedTaskIds: [...new Set([...next.completedTaskIds, task.templateId])],
    hospitalPressure: clamp(next.hospitalPressure + (appropriate ? -Math.max(3, Math.floor(pressureReliefForTask(task) / 2)) : 5)),
  };
  if (appropriate || !["critical", "high"].includes(task.trueUrgency)) {
    next = removeTask(next, task);
    if (appropriate) next = maybeAwardResource(next, task);
    next = resolveBirdTaskStatus(next, task, appropriate ? "contained" : "loose");
  } else {
    next = {
      ...next,
      activeTasks: next.activeTasks.map((item) => item.id === task.id ? { ...item, status: "deferred", deferred: true, lastUpdatedAt: next.minute, dueAt: Math.max(next.minute + 4, item.dueAt - 10) } : item),
    };
    next = resolveBirdTaskStatus(next, task, "loose");
  }
  next = alterWardAcuity(next, task.locationId, appropriate ? -4 : 5, appropriate ? -5 : 7);
  next = alterWardMomentum(next, task.locationId, appropriate ? -3 : 7, appropriate ? [] : momentumTagsForTask(task), appropriate ? ["systemBlocked"] : []);
  next = remember(next, { delegatedJobs: [`${task.message} -> ${member.name}`], unresolvedRisks: appropriate ? [] : [task.message] });
  return addLog(next, appropriate ? `Delegated to ${member.name} for ${duration}m: ${task.message}` : `Poor delegation to ${member.name}: ${task.message}`, appropriate ? "good" : "bad");
}

function hashText(value: string): number {
  return value.split("").reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
}

function shuffleChoices(choices: EncounterChoice[], seed: number): EncounterChoice[] {
  const result = [...choices];
  let currentSeed = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    const [roll, nextSeed] = nextRandom(currentSeed);
    currentSeed = nextSeed;
    const j = Math.floor(roll * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const syntheticStepEncounterIds = new Set(["sepsis_hypotension", "copd_hypercapnia", "nstemi", "aki_hyperkalaemia", "delirium", "ugi_bleed", "pe_risk", "end_of_life"]);

export function firstEncounterStepId(encounterId: string): string | undefined {
  const encounter = encounters.find((item) => item.id === encounterId);
  return encounter?.steps?.[0]?.id ?? (syntheticStepEncounterIds.has(encounterId) ? "assessment" : undefined);
}

export function currentEncounterStep(encounter?: Encounter, stepId?: string) {
  if (!encounter?.steps?.length) return undefined;
  return encounter.steps.find((step) => step.id === stepId) ?? encounter.steps[0];
}

export function activeEncounterView(encounter?: Encounter, stepId?: string) {
  if (!encounter) return undefined;
  const authoredStep = currentEncounterStep(encounter, stepId);
  if (authoredStep) return authoredStep;
  if (syntheticStepEncounterIds.has(encounter.id) && stepId === "assessment") {
    return {
      id: "assessment",
      title: "Assessment And Prioritisation",
      vignette: encounter.vignette,
      observations: encounter.observations,
      examination: encounter.examination,
      investigations: encounter.investigations,
      choices: [
        {
          id: "assessment_best",
          label: "Do an ABCDE review, identify immediate risks, and ask for the right help early",
          detail: "You build a working problem representation before committing to treatment.",
          feedback: "The situation is clearer, and the ward team understand what you are worried about.",
          consequence: { time: 6, focus: -3, clinicalConfidence: 2, score: 20 },
          nextStepId: "management",
        },
        {
          id: "assessment_partial",
          label: "Review the notes and latest bloods before seeing the patient",
          detail: "Some useful context, but the patient is still deteriorating in real time.",
          feedback: "You find clues, but lose bedside momentum.",
          consequence: { time: 8, focus: -4, patientSafety: -2 },
          nextStepId: "management",
        },
        {
          id: "assessment_unsafe",
          label: "Give telephone advice and ask the ward to call back if worse",
          detail: "This underestimates the risk and leaves the team without a plan.",
          feedback: "The bleep returns sharper and less optional.",
          consequence: { time: 5, patientSafety: -6, reputation: -2, dangerousDelays: 1 },
          nextStepId: "management",
          unsafe: true,
        },
      ],
    };
  }
  return undefined;
}

export function orderedEncounterChoices(state: GameState, encounter: Encounter): EncounterChoice[] {
  const step = activeEncounterView(encounter, state.activeEncounterStepId);
  const baseChoices = step?.choices ?? encounter.choices;
  const choices = encounter.id === "consultant_grilling" ? baseChoices.map((choice) => {
    const memoryScore = handoverMemoryScore(state);
    let modified = choice;
    if (choice.id === "best" && memoryScore >= 65) {
      modified = { ...modified, label: "Give a structured risk handover backed by the things you flagged overnight", consequence: { ...modified.consequence, handoverQuality: (modified.consequence.handoverQuality ?? 0) + 6, reputation: (modified.consequence.reputation ?? 0) + 3, score: (modified.consequence.score ?? 0) + 80 } };
    }
    if (choice.id === "unsafe" && memoryScore < 45) {
      modified = { ...modified, label: "Try to imply the night was quieter than the memory trail suggests", consequence: { ...modified.consequence, handoverQuality: (modified.consequence.handoverQuality ?? 0) - 6, reputation: (modified.consequence.reputation ?? 0) - 3, score: (modified.consequence.score ?? 0) - 80 } };
    }
    if (state.birdStatus === "contained" && choice.id === "best") {
      modified = { ...modified, consequence: { ...modified.consequence, score: (modified.consequence.score ?? 0) + 30 } };
    }
    if (state.birdStatus === "loose" && choice.id === "unsafe") {
      modified = { ...modified, consequence: { ...modified.consequence, reputation: (modified.consequence.reputation ?? 0) - 3, score: (modified.consequence.score ?? 0) - 20 } };
    }
    return modified;
  }) : baseChoices;
  return shuffleChoices(choices, state.rngSeed ^ hashText(`${encounter.id}:${step?.id ?? "base"}`));
}

export function chooseEncounterOption(state: GameState, choiceId: string): GameState {
  const encounter = encounters.find((item) => item.id === state.activeEncounterId);
  const step = activeEncounterView(encounter, state.activeEncounterStepId);
  const choices = step?.choices ?? encounter?.choices;
  const choice = choices?.find((item) => item.id === choiceId);
  if (!encounter || !choice || state.ended) return state;
  let next = applyConsequence(state, choice.consequence);
  const elapsed = choice.consequence.time ?? 0;
  if (elapsed > 0) next = runShiftDirector(next, elapsed);
  if (choice.unlockItem && !next.items.includes(choice.unlockItem)) next = { ...next, items: [...next.items, choice.unlockItem] };
  if (choice.nextStepId) {
    next = refreshOversightAt(next, encounter.locationId, choice.unsafe ? 1 : 4);
    next = alterWardAcuity(next, encounter.locationId, choice.unsafe ? 5 : -4, choice.unsafe ? 7 : -5);
    return addLog({ ...syncLegacyPagerIds(next), activeEncounterStepId: choice.nextStepId }, `${encounter.title}: ${choice.feedback}`, choice.unsafe ? "bad" : "neutral");
  }
  next = {
    ...next,
    activeEncounterId: undefined,
    activeEncounterStepId: undefined,
    handoverGrillingDone: encounter.id === "consultant_grilling" ? true : next.handoverGrillingDone,
    completedEncounterIds: [...new Set([...next.completedEncounterIds, encounter.id])],
    resolvedPagerIds: [...next.resolvedPagerIds, `encounter:${encounter.id}`],
    hospitalPressure: clamp(next.hospitalPressure + pressureDeltaForEncounterChoice(choice)),
  };
  next = refreshOversightAt(next, encounter.locationId, choice.unsafe ? 1 : 6);
  next = alterWardAcuity(next, encounter.locationId, choice.unsafe ? 8 : -12, choice.unsafe ? 12 : -16);
  next = alterWardMomentum(next, encounter.locationId, choice.unsafe ? 9 : -7, choice.unsafe ? ["fragile"] : [], choice.unsafe ? [] : ["quietlyUnsafe"]);
  next = resolveBirdEncounterStatus(next, encounter, choice);
  if (!choice.unsafe && choice.id === "best") next = maybeAwardEncounterResource(next, encounter);
  next = remember(next, choice.unsafe ? { unresolvedRisks: [encounter.title], wardHotSpots: [encounter.locationId] } : { resolvedEncounters: [encounter.title] });
  next = addLog(syncLegacyPagerIds(next), `${encounter.title}: ${choice.feedback}`, choice.unsafe ? "bad" : choice.id === "best" ? "good" : "neutral");
  if (encounter.id === "consultant_grilling") {
    return { ...next, minute: SHIFT_LENGTH, ended: true, endingReason: "Morning handover survived, including consultant grilling." };
  }
  return next;
}

export function takeBreak(state: GameState): GameState {
  if (state.locationId !== "mess" || state.ended) return state;
  const caffeineHit = state.items.includes("Coffee") ? 12 : 0;
  let next = applyConsequence(state, { time: 9, stamina: 16, focus: 10, caffeine: caffeineHit, breaksTaken: 1, score: state.activeTasks.length ? -10 : 20 });
  next = { ...next, oversight: clamp(next.oversight - (state.activeTasks.length ? 8 : 4)), hospitalPressure: clamp(next.hospitalPressure - (state.activeTasks.length ? 0 : 8)) };
  next = runShiftDirector(next, 9 + Math.min(8, state.activeTasks.length * 2 + state.breaksTaken));
  const warning = state.activeTasks.length ? "Hospital pressure rises while you rest; the bleep finds you anyway." : "You take nine protected-ish minutes in the mess.";
  return addLog(next, warning, state.activeTasks.length ? "bad" : "good");
}

export function brewCoffee(state: GameState): GameState {
  if (state.ended || state.locationId !== "mess") return state;
  let next = applyConsequence(state, { time: 3, caffeine: 16, focus: 5, stamina: 2, score: state.activeTasks.length ? 0 : 5 });
  next = runShiftDirector({ ...next, hospitalPressure: clamp(next.hospitalPressure + (state.activeTasks.length ? 2 : 0)) }, 3);
  return addLog(syncLegacyPagerIds(next), state.activeTasks.length ? "You make coffee while the bleep stack watches you make choices." : "You make coffee. It tastes like survival with undertones of kettle.", "good");
}

export function findSnack(state: GameState): GameState {
  if (state.ended || !["mess", "corridor", "lifts", "pharmacy"].includes(state.locationId)) return state;
  const pharmacyBonus = state.locationId === "pharmacy" ? 3 : 0;
  let next = applyConsequence(state, { time: 4, stamina: 12 + pharmacyBonus, focus: 3, caffeine: 2, score: state.activeTasks.length ? 0 : 5 });
  next = runShiftDirector({ ...next, hospitalPressure: clamp(next.hospitalPressure + (state.activeTasks.length ? 1 : -1)) }, 4);
  const source = state.locationId === "pharmacy" ? "The pharmacy hatch produces a medically unlicensed biscuit." : state.locationId === "mess" ? "You find a snack in the mess cupboard and choose not to inspect the expiry date." : "The vending machine accepts your coins after a brief ethical debate.";
  return addLog(syncLegacyPagerIds(next), source, "good");
}

function changeResourceCharges(resources: ResourceItem[], resourceId: ResourceItemId, delta: number): ResourceItem[] {
  return resources.map((resource) => resource.id === resourceId ? { ...resource, charges: Math.max(0, resource.charges + delta) } : resource);
}

function maybeAwardResource(state: GameState, task: ActiveTask): GameState {
  const award: ResourceItemId | undefined =
    task.source === "system" && task.locationId === "pharmacy" ? "snack" :
    task.locationId === "radiology" ? "radiology_persuasion" :
    task.category === "routine" && task.trueUrgency === "medium" ? "cannula_kit" :
    task.category === "absurd" ? "coffee" :
    undefined;
  if (!award) return state;
  return { ...state, resources: changeResourceCharges(state.resources, award, 1) };
}

function maybeAwardEncounterResource(state: GameState, encounter: Encounter): GameState {
  const award: ResourceItemId | undefined =
    encounter.locationId === "radiology" ? "radiology_persuasion" :
    ["copd_hypercapnia", "dka", "aki_hyperkalaemia"].includes(encounter.id) ? "abg_kit" :
    undefined;
  if (!award) return state;
  return { ...state, resources: changeResourceCharges(state.resources, award, 1) };
}

export function useResource(state: GameState, resourceId: ResourceItemId): GameState {
  const resource = state.resources.find((item) => item.id === resourceId);
  if (!resource || resource.charges <= 0 || state.ended) return addLog(state, `${resource?.label ?? "Resource"} is not available.`, "bad");
  if (resource.usableWhen === "encounter" && !state.activeEncounterId) return addLog(state, `${resource.label} is only useful while a patient is in front of you.`, "neutral");
  if (resource.usableWhen === "task" && state.activeTasks.length === 0) return addLog(state, `${resource.label} needs a live task to make a difference.`, "neutral");

  const effects: Record<ResourceItemId, Consequence> = {
    coffee: { time: 2, caffeine: 18, focus: 6, score: 5 },
    snack: { time: 3, stamina: 14, focus: 4, score: 5 },
    guideline_app: { time: 2, focus: 5, clinicalConfidence: 7, score: 10 },
    abg_kit: { time: 1, focus: 3, patientSafety: 4, clinicalConfidence: 3 },
    cannula_kit: { time: 1, stamina: 3, patientSafety: 4, reputation: 2 },
    consultant_advice: { time: 4, patientSafety: 5, reputation: 4, clinicalConfidence: 5, consultantEscalations: 1 },
    radiology_persuasion: { time: 2, reputation: 3, patientSafety: 3, score: 15 },
  };
  let next = applyConsequence(state, effects[resourceId]);
  next = { ...next, resources: changeResourceCharges(next.resources, resourceId, -1) };
  if ((effects[resourceId].time ?? 0) > 0) next = runShiftDirector(next, effects[resourceId].time ?? 0);
  return addLog(syncLegacyPagerIds(next), `Used resource: ${resource.label}.`, "good");
}

export function checkEnding(state: GameState): GameState {
  if (state.ended) return state;
  if (state.minute >= SHIFT_LENGTH && !state.handoverGrillingDone && !state.activeEncounterId) {
    return addLog({ ...state, minute: SHIFT_LENGTH, activeEncounterId: "consultant_grilling", activeEncounterStepId: firstEncounterStepId("consultant_grilling"), locationId: "mau" }, "Surprise final task: consultant grilling at handover.", "bad");
  }
  if (state.minute >= SHIFT_LENGTH && state.activeEncounterId === "consultant_grilling") return { ...state, minute: SHIFT_LENGTH };
  if (state.minute >= SHIFT_LENGTH) return { ...state, minute: SHIFT_LENGTH, ended: true, endingReason: "Morning handover reached." };
  if (state.patientSafety <= 0) return { ...state, ended: true, endingReason: "Patient safety collapsed before handover." };
  if (state.stamina <= 0 || state.focus <= 0) return { ...state, ended: true, endingReason: "Registrar collapse: fatigue and cognitive load won." };
  if (state.oversight <= 0 && state.hospitalPressure > 80) return { ...state, ended: true, endingReason: "Oversight collapsed: the hospital ran away from you." };
  if (state.hospitalPressure >= 100 && state.activeTasks.some((task) => ["critical", "high"].includes(task.trueUrgency))) return { ...state, ended: true, endingReason: "Hospital pressure overwhelmed the night team." };
  return state;
}

export function endingRank(state: GameState): string {
  const total = state.score + state.patientSafety * 6 + state.reputation * 3 + handoverMemoryScore(state) * 3 + state.oversight * 2 - state.dangerousDelays * 90 - state.datix * 60 - state.hospitalPressure * 2;
  if (total >= 1000) return "Consultant Material";
  if (total >= 760) return "Safe Pair of Hands";
  if (total >= 540) return "Functioning Human";
  if (total >= 340) return "Med Reg By Technicality";
  if (total >= 150) return "Datix Magnet";
  return "Please Attend Debrief";
}
