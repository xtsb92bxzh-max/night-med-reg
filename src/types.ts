export type LocationId =
  | "ed_resus"
  | "mau"
  | "respiratory"
  | "cardiology"
  | "elderly"
  | "surgical"
  | "icu"
  | "radiology"
  | "pharmacy"
  | "mess"
  | "corridor"
  | "lifts"
  | "estates";

export type EventCategory =
  | "emergency"
  | "urgent"
  | "routine"
  | "inappropriate"
  | "absurd"
  | "ambiguous";

export type ShiftPhase = "early" | "deep" | "pre_handover";

export type TaskSource = "pager" | "handover" | "reg_sense" | "ward_round" | "system";

export type TeamMemberId = "fy1" | "trusted_fy2" | "locum_no_login" | "bed_manager";

export type TaskStatus = "new" | "deferred" | "delegated" | "deteriorated" | "resolved";

export type ResourceItemId =
  | "coffee"
  | "snack"
  | "guideline_app"
  | "abg_kit"
  | "cannula_kit"
  | "consultant_advice"
  | "radiology_persuasion"
  | "handover_notes";

export type Consequence = Partial<{
  time: number;
  stamina: number;
  focus: number;
  reputation: number;
  patientSafety: number;
  pagerBacklog: number;
  clinicalConfidence: number;
  caffeine: number;
  score: number;
  handoverQuality: number;
  emergenciesHandled: number;
  patientsStabilised: number;
  dangerousDelays: number;
  inappropriateAvoided: number;
  breaksTaken: number;
  datix: number;
  consultantEscalations: number;
  chaosSurvived: number;
}>;

export interface Location {
  id: LocationId;
  name: string;
  flavour: string;
  links: LocationId[];
  timeCost: number;
  risk: "low" | "moderate" | "high" | "volatile";
  categories: EventCategory[];
  quirk: string;
}

export interface EncounterChoice {
  id: string;
  label: string;
  detail: string;
  consequence: Consequence;
  feedback: string;
  unlockAlly?: string;
  unlockItem?: string;
  nextStepId?: string;
  resolves?: boolean;
  unsafe?: boolean;
}

export interface EncounterStep {
  id: string;
  title?: string;
  vignette: string;
  observations: string;
  examination: string;
  investigations: string[];
  choices: EncounterChoice[];
}

export interface Encounter {
  id: string;
  title: string;
  locationId: LocationId;
  category: EventCategory;
  vignette: string;
  observations: string;
  examination: string;
  investigations: string[];
  choices: EncounterChoice[];
  steps?: EncounterStep[];
}

export interface PagerEvent {
  id: string;
  locationId: LocationId;
  message: string;
  sender: string;
  claimedUrgency: string;
  trueUrgency: "critical" | "high" | "medium" | "low" | "nonsense";
  timeToDeterioration: number;
  category: EventCategory;
  encounterId?: string;
  ignored: Consequence;
  handledWell: Consequence;
}

export interface ActivePager extends PagerEvent {
  age: number;
  deferred: boolean;
}

export interface ActiveTask {
  id: string;
  templateId: string;
  locationId: LocationId;
  message: string;
  sender: string;
  source: TaskSource;
  claimedUrgency: string;
  trueUrgency: "critical" | "high" | "medium" | "low" | "nonsense";
  category: EventCategory;
  encounterId?: string;
  createdAt: number;
  seenAt: number;
  lastUpdatedAt: number;
  dueAt: number;
  status: TaskStatus;
  deterioratedAt?: number;
  penaltyApplied?: boolean;
  vague: boolean;
  regSense: boolean;
  deferred: boolean;
  ignored: Consequence;
  handledWell: Consequence;
  delegableTo?: TeamMemberId[];
  riskyDelegateTo?: TeamMemberId[];
  delegationDuration?: Partial<Record<TeamMemberId, number>>;
}

export interface TaskTemplate {
  id: string;
  locationId: LocationId;
  message: string;
  sender: string;
  source: TaskSource;
  claimedUrgency: string;
  trueUrgency: "critical" | "high" | "medium" | "low" | "nonsense";
  category: EventCategory;
  encounterId?: string;
  timeToDeterioration: number;
  vague?: boolean;
  regSense?: boolean;
  weight: number;
  phases?: ShiftPhase[];
  ignored: Consequence;
  handledWell: Consequence;
  delegableTo?: TeamMemberId[];
  riskyDelegateTo?: TeamMemberId[];
  delegationDuration?: Partial<Record<TeamMemberId, number>>;
}

export interface EventPool {
  locationId?: LocationId;
  phase?: ShiftPhase;
  templates: TaskTemplate[];
}

export interface WardAcuityState {
  level: number;
  unresolvedRisk: number;
}

export interface TeamMember {
  id: TeamMemberId;
  name: string;
  role: string;
  busyUntil: number;
  strengths: string[];
}

export interface ShiftLogEntry {
  minute: number;
  text: string;
  tone?: "good" | "bad" | "neutral";
}

export interface ResourceItem {
  id: ResourceItemId;
  label: string;
  charges: number;
  description: string;
  usableWhen: "always" | "encounter" | "task";
}

export interface GameState {
  minute: number;
  locationId: LocationId;
  stamina: number;
  focus: number;
  reputation: number;
  patientSafety: number;
  pagerBacklog: number;
  clinicalConfidence: number;
  caffeine: number;
  score: number;
  handoverQuality: number;
  emergenciesHandled: number;
  patientsStabilised: number;
  dangerousDelays: number;
  inappropriateAvoided: number;
  breaksTaken: number;
  datix: number;
  consultantEscalations: number;
  chaosSurvived: number;
  birdStatus: "unseen" | "sighted" | "loose" | "contained" | "consulted";
  rngSeed: number;
  shiftPhase: ShiftPhase;
  activeTasks: ActiveTask[];
  completedTaskIds: string[];
  nextTaskSpawnAt: number;
  wardAcuity: Record<LocationId, WardAcuityState>;
  regSense: number;
  hospitalPressure: number;
  oversight: number;
  locationLastVisited: Record<LocationId, number>;
  activePagerIds: string[];
  resolvedPagerIds: string[];
  deferredPagerIds: string[];
  completedEncounterIds: string[];
  activeEncounterId?: string;
  activeEncounterStepId?: string;
  handoverGrillingDone: boolean;
  team: TeamMember[];
  allies: string[];
  items: string[];
  resources: ResourceItem[];
  log: ShiftLogEntry[];
  ended: boolean;
  endingReason?: string;
}
