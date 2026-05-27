import { useEffect, useMemo, useState } from "react";
import { encounters, locations, taskTemplates, SHIFT_LENGTH } from "./content";
import { acceptTreat, activeEncounterView, brewCoffee, chooseEncounterOption, clarifyTask, deferPager, delegationDuration, delegatePager, dismissTreat, endingRank, escalateEncounter, escalateTask, findSnack, formatClock, handoverDebrief, handoverMemoryScore, ignorePager, initialGameState, isDelegationAppropriate, isTeamMemberAvailable, liveTasks, markEncounterForHandover, markTaskForHandover, moveTo, orderedEncounterChoices, randomRunSeed, respondToPager, takeBreak, useResource } from "./game";
import type { ActiveTask, Consequence, GameState, Location, LocationId, ResourceItemId, TeamMemberId } from "./types";

const statRows: [string, keyof GameState][] = [
  ["Stamina", "stamina"],
  ["Focus", "focus"],
  ["Reputation", "reputation"],
  ["Safety", "patientSafety"],
  ["Confidence", "clinicalConfidence"],
  ["Caffeine", "caffeine"],
];

function formatDuration(minutes: number): string {
  const safeMinutes = Math.max(0, minutes);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins.toString().padStart(2, "0")}m`;
}

function DeltaList({ consequence }: { consequence: Consequence }) {
  const entries = Object.entries(consequence).filter(([, value]) => value !== 0 && value !== undefined);
  if (!entries.length) return null;
  return (
    <div className="deltas" aria-label="Consequences">
      {entries.map(([key, value]) => (
        <span key={key} className={Number(value) >= 0 ? "positive" : "negative"}>
          {key.replace(/([A-Z])/g, " $1")}: {Number(value) > 0 ? "+" : ""}
          {value}
        </span>
      ))}
    </div>
  );
}

type CutawayRoom = {
  floor: number;
  col: number;
  span: number;
  label: string;
  group: "acute" | "ward" | "critical" | "flow" | "support" | "core";
};

const cutawayRooms: Record<LocationId, CutawayRoom> = {
  mess: { floor: 5, col: 2, span: 3, label: "Doctors' Mess", group: "support" },
  estates: { floor: 5, col: 7, span: 4, label: "Estates", group: "support" },
  respiratory: { floor: 4, col: 1, span: 3, label: "Resp", group: "ward" },
  cardiology: { floor: 4, col: 4, span: 3, label: "Cardio", group: "ward" },
  elderly: { floor: 4, col: 7, span: 3, label: "COTE", group: "ward" },
  surgical: { floor: 4, col: 10, span: 3, label: "Surg", group: "ward" },
  icu: { floor: 3, col: 1, span: 4, label: "ICU", group: "critical" },
  radiology: { floor: 3, col: 8, span: 4, label: "Radiology / CT", group: "critical" },
  mau: { floor: 2, col: 1, span: 6, label: "MAU", group: "flow" },
  pharmacy: { floor: 2, col: 9, span: 3, label: "Pharmacy", group: "support" },
  ed_resus: { floor: 1, col: 1, span: 4, label: "ED Resus", group: "acute" },
  corridor: { floor: 1, col: 5, span: 4, label: "Main Corridor", group: "core" },
  lifts: { floor: 1, col: 9, span: 3, label: "Lift Lobby", group: "core" },
};

function StatsPanel({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  return (
    <section className="compact-status" aria-labelledby="stats-title">
      <div className="brand-block">
        <h1 id="stats-title">Night Med Reg</h1>
        <span>Game only, not clinical guidance</span>
      </div>
      <div className="clock compact-clock">
        <strong>{formatClock(state.minute)}</strong>
        <span>{formatDuration(SHIFT_LENGTH - state.minute)} to 09:00</span>
      </div>
      <div className="compact-meters">
        {statRows.map(([label, key]) => {
          const value = Number(state[key]);
          return (
            <div className="meter-row compact" key={label}>
              <span>{label}</span>
              <div className="meter" aria-label={`${label} ${value}`}>
                <b style={{ width: `${value}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          );
        })}
      </div>
      <div className="compact-scores">
        <span>Score <strong>{state.score}</strong></span>
        <span>Backlog <strong>{state.pagerBacklog}</strong></span>
        <span>Safety <strong>{state.patientSafety}</strong></span>
        <span>Pressure <strong>{state.hospitalPressure}</strong></span>
        <span>Oversight <strong>{state.oversight}</strong></span>
        <span>Bird <strong>{state.birdStatus}</strong></span>
        <button className="ghost" onClick={onRestart}>Restart</button>
      </div>
    </section>
  );
}

function locationTaskSummary(state: GameState, locationId: LocationId) {
  const tasks = liveTasks(state).filter((task) => task.locationId === locationId);
  return {
    total: tasks.length,
    urgent: tasks.some((task) => ["critical", "high"].includes(task.trueUrgency)),
    deteriorated: tasks.some((task) => task.status === "deteriorated"),
  };
}

function LocationStatusBadges({ state, location }: { state: GameState; location: Location }) {
  const taskSummary = locationTaskSummary(state, location.id);
  const staleMinutes = Math.max(0, state.minute - state.locationLastVisited[location.id]);
  const highAcuity = state.wardAcuity[location.id].level > 60;
  return (
    <span className="node-badges" aria-hidden="true">
      {taskSummary.total > 0 && <b className={taskSummary.urgent || taskSummary.deteriorated ? "task-badge urgent" : "task-badge"}>{taskSummary.total}</b>}
      {highAcuity && <b className="heat-badge">!</b>}
      {staleMinutes > 28 && <b className="stale-badge">?</b>}
    </span>
  );
}

function CutawayRoomButton({ state, location, lockedByEncounter, isAnimating, animatingTo, onTravel }: { state: GameState; location: Location; lockedByEncounter: boolean; isAnimating: boolean; animatingTo?: LocationId; onTravel: (locationId: LocationId) => void }) {
  const here = locations.find((item) => item.id === state.locationId)!;
  const available = here.links.includes(location.id);
  const current = location.id === here.id;
  const movingHere = animatingTo === location.id;
  const taskSummary = locationTaskSummary(state, location.id);
  const stale = state.minute - state.locationLastVisited[location.id] > 28;
  const hotAcuity = state.wardAcuity[location.id].level > 60;
  const room = cutawayRooms[location.id];
  const className = [
    "cutaway-room",
    room.group,
    current ? "current" : "",
    movingHere ? "moving-here" : "",
    available ? "available" : "locked",
    taskSummary.urgent || taskSummary.deteriorated ? "urgent" : "",
    stale ? "stale" : "",
    hotAcuity ? "hot" : "",
  ].filter(Boolean).join(" ");
  return (
    <button
      className={className}
      style={{ gridColumn: `${room.col} / span ${room.span}` }}
      disabled={!available || current || state.ended || lockedByEncounter || isAnimating}
      onClick={() => onTravel(location.id)}
      title={`${location.name}: ${location.quirk}`}
      aria-label={`${location.name}${current ? ", current location" : ""}${taskSummary.total ? `, ${taskSummary.total} live task${taskSummary.total === 1 ? "" : "s"}` : ""}`}
    >
      <span>{room.label}</span>
      <small>{location.timeCost}m</small>
      <LocationStatusBadges state={state} location={location} />
      {(current || movingHere) && <RegistrarMarker moving={movingHere} />}
    </button>
  );
}

function RegistrarMarker({ moving = false }: { moving?: boolean }) {
  return (
    <div className={moving ? "registrar-marker moving" : "registrar-marker"} aria-hidden="true">
      <span className="registrar-dot" />
      <strong>Med Reg</strong>
    </div>
  );
}

function HospitalSchematicMap({ state, lockedByEncounter, animatingTo, onTravel }: { state: GameState; lockedByEncounter: boolean; animatingTo?: LocationId; onTravel: (locationId: LocationId) => void }) {
  const isAnimating = Boolean(animatingTo);
  const floors = [5, 4, 3, 2, 1];
  return (
    <div className="cutaway-wrap" aria-label="Hospital cutaway map">
      <div className="building-label" aria-hidden="true">Fictional NHS District General Hospital</div>
      {floors.map((floor) => (
        <div className="cutaway-floor" key={floor}>
          <div className="floor-label">F{floor}</div>
          <div className="floor-rooms">
            {locations.filter((location) => cutawayRooms[location.id].floor === floor).map((location) => (
              <CutawayRoomButton
                key={location.id}
                state={state}
                location={location}
                lockedByEncounter={lockedByEncounter}
                isAnimating={isAnimating}
                animatingTo={animatingTo}
                onTravel={onTravel}
              />
            ))}
            <div className="lift-core" aria-hidden="true">Lift / stairs</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MapPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [animatingTo, setAnimatingTo] = useState<LocationId | undefined>();
  const here = locations.find((location) => location.id === state.locationId)!;
  const lockedByEncounter = Boolean(state.activeEncounterId);
  const staleCount = locations.filter((location) => state.minute - state.locationLastVisited[location.id] > 28).length;
  const handleTravel = (locationId: LocationId) => {
    if (animatingTo || lockedByEncounter || state.ended) return;
    setAnimatingTo(locationId);
    window.setTimeout(() => {
      setState(moveTo(state, locationId));
      setAnimatingTo(undefined);
    }, 420);
  };
  return (
    <section className="panel map-panel" aria-labelledby="map-title">
      <div className="panel-heading">
        <h2 id="map-title">Hospital Map</h2>
        <span className={`risk ${here.risk}`}>{here.risk}</span>
      </div>
      <HospitalSchematicMap state={state} lockedByEncounter={lockedByEncounter} animatingTo={animatingTo} onTravel={handleTravel} />
      <div className="location-card">
        <h3>{here.name}</h3>
        <p>{here.flavour}</p>
      </div>
      {(() => {
        const treat = state.activeTasks.find((t) => t.source === "treat" && t.locationId === state.locationId);
        return treat ? (
          <div className="treat-offer">
            <strong>{treat.message}</strong>
            <p>{treat.sender}</p>
            <DeltaList consequence={treat.handledWell} />
            <div className="treat-offer-actions">
              <button className="primary" onClick={() => setState(acceptTreat(state, treat.id))}>Accept</button>
              <button className="ghost" onClick={() => setState(dismissTreat(state, treat.id))}>Decline</button>
            </div>
          </div>
        ) : null;
      })()}
      {staleCount > 0 && <p className="oversight-warning">Oversight fading: {staleCount} area{staleCount === 1 ? "" : "s"} not recently reviewed.</p>}
      {lockedByEncounter && <p className="map-lock">Resolve the active challenge before moving on.</p>}
      {state.locationId === "mess" && state.activeTasks.length > 0 && <p className="map-lock">Hospital pressure will rise if you rest with unresolved live tasks.</p>}
      {state.locationId === "mess" && staleCount > 0 && <p className="oversight-warning">A mess break will cost oversight while other areas go unseen.</p>}
      {state.locationId === "mess" && (
        <div className="recovery-actions">
          <button className="primary wide" disabled={state.ended} onClick={() => setState(takeBreak(state))}>Take a nine-minute break</button>
          <button disabled={state.ended} onClick={() => setState(brewCoffee(state))} title="+caffeine and focus, costs 3m">Make coffee</button>
          <button disabled={state.ended} onClick={() => setState(findSnack(state))} title="+stamina and focus, costs 4m">Find snack</button>
        </div>
      )}
      {["corridor", "lifts", "pharmacy"].includes(state.locationId) && (
        <div className="recovery-actions">
          <button disabled={state.ended} onClick={() => setState(findSnack(state))} title="+stamina, small focus boost, costs 4m">Try vending/snack run</button>
        </div>
      )}
    </section>
  );
}

function taskClass(task: ActiveTask): string {
  return [
    "pager",
    task.trueUrgency,
    task.source === "treat" ? "treat" : "",
    task.regSense ? "reg-sense-task" : "",
    task.status === "deteriorated" ? "deteriorated" : "",
    task.markedForHandover ? "handover-marked" : "",
  ].filter(Boolean).join(" ");
}

const delegateOrder: TeamMemberId[] = ["fy1", "trusted_fy2", "locum_no_login", "bed_manager"];

function DelegationControls({ state, task, setState, expanded, onToggle }: { state: GameState; task: ActiveTask; setState: (state: GameState) => void; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <button className="ghost" onClick={onToggle} aria-expanded={expanded} title="Ask a team member to handle this bleep. Good fits clear the task; risky fits can create harm or delay.">{expanded ? "Close delegation" : "Delegate"}</button>
      {expanded && (
        <div className="delegate-grid" aria-label={`Delegate ${task.message}`}>
          {delegateOrder.map((memberId) => {
            const member = state.team.find((item) => item.id === memberId)!;
            const available = isTeamMemberAvailable(state, memberId);
            const appropriate = isDelegationAppropriate(task, memberId);
            const duration = delegationDuration(task, memberId);
            return (
              <button
                key={memberId}
                className={appropriate ? "delegate-good" : "delegate-risk"}
                disabled={!available}
                title={`${member.name}: ${appropriate ? "appropriate delegation clears pressure and builds trust" : "risky delegation may harm safety or bounce back"} · ${duration}m`}
                onClick={() => setState(delegatePager(state, task.id, memberId))}
              >
                {member.name}
                <small>{available ? `${duration}m ${appropriate ? "fit" : "risk"}` : `busy ${member.busyUntil - state.minute}m`}</small>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function TaskPanel({ state, setState, limit, compact = false }: { state: GameState; setState: (state: GameState) => void; limit?: number; compact?: boolean }) {
  const tasks = liveTasks(state);
  const visibleTasks = typeof limit === "number" ? tasks.slice(0, limit) : tasks;
  const regSenseTasks = tasks.filter((task) => task.regSense);
  const [expandedDelegateTaskId, setExpandedDelegateTaskId] = useState<string | undefined>();
  return (
    <section className={compact ? "panel pager-panel compact-panel" : "panel pager-panel"} aria-labelledby="pager-title">
      <div className="panel-heading">
        <h2 id="pager-title">{compact ? "Priority Bleeps" : "Bleep Stack"}</h2>
        <span>{tasks.length} active{limit && tasks.length > visibleTasks.length ? ` · top ${visibleTasks.length}` : ""}</span>
      </div>
      {regSenseTasks.length > 0 && !compact && (
        <div className="reg-sense-strip">
          <strong>Reg Sense</strong>
          <span>{regSenseTasks.length} vague concern{regSenseTasks.length === 1 ? "" : "s"} worth a look before they become bleeps.</span>
        </div>
      )}
      <div className="pager-list">
        {tasks.length === 0 && <p className="muted">A rare silence. Deeply suspicious.</p>}
        {visibleTasks.map((task) => (
          task.source === "treat" ? (
            <article className={compact ? `${taskClass(task)} compact` : taskClass(task)} key={task.id}>
              <div>
                <strong>{task.message}</strong>
                {!compact && <p className="muted">{task.sender}</p>}
                <DeltaList consequence={task.handledWell} />
              </div>
              <div className="pager-actions">
                <button className="primary" onClick={() => setState(acceptTreat(state, task.id))}>Accept</button>
                <button className="ghost" onClick={() => setState(dismissTreat(state, task.id))}>Decline</button>
              </div>
            </article>
          ) : (
            <article className={compact ? `${taskClass(task)} compact` : taskClass(task)} key={task.id}>
              <div>
                <strong>{task.message}</strong>
                {!compact && <p>{task.sender} · {task.source.replace("_", " ")} · claimed {task.claimedUrgency} · true risk {task.trueUrgency}</p>}
                <small>
                  {task.status === "deteriorated" ? "overdue / Datix risk logged" : task.status} · intel {task.intelLevel}/2{task.markedForHandover ? " · handover" : ""} · received {state.minute - task.createdAt}m ago · {locations.find((location) => location.id === task.locationId)?.name} · {Math.max(0, task.dueAt - state.minute)}m to deterioration
                </small>
              </div>
              <div className="pager-actions">
                <button onClick={() => setState(respondToPager(state, task.id))}>Attend</button>
                <button onClick={() => setState(clarifyTask(state, task.id))} disabled={task.intelLevel >= 2}>Clarify</button>
                <button onClick={() => setState(escalateTask(state, task.id))}>Escalate</button>
                <button onClick={() => setState(markTaskForHandover(state, task.id))} disabled={task.markedForHandover} title="Flag this as something the day team should explicitly know about at 09:00">Handover</button>
                <button onClick={() => setState(deferPager(state, task.id))}>Defer</button>
                <button className="danger" onClick={() => setState(ignorePager(state, task.id))}>Ignore</button>
                <DelegationControls
                  state={state}
                  task={task}
                  setState={setState}
                  expanded={expandedDelegateTaskId === task.id}
                  onToggle={() => setExpandedDelegateTaskId(expandedDelegateTaskId === task.id ? undefined : task.id)}
                />
              </div>
            </article>
          )
        ))}
      </div>
    </section>
  );
}

function EncounterPanel({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const encounter = encounters.find((item) => item.id === state.activeEncounterId);
  if (!encounter) {
    return (
      <section className="panel encounter-panel" aria-labelledby="encounter-title">
        <h2 id="encounter-title">Active Encounter</h2>
        <p className="muted">No patient currently in front of you. This condition is usually transient.</p>
      </section>
    );
  }
  const step = activeEncounterView(encounter, state.activeEncounterStepId);
  const display = step ?? encounter;
  const choices = orderedEncounterChoices(state, encounter);
  return (
    <section className="panel encounter-panel active" aria-labelledby="encounter-title">
      <div className="panel-heading">
        <h2 id="encounter-title">{encounter.title}</h2>
        <div className="encounter-actions">
          <button className="ghost" onClick={() => setState(escalateEncounter(state))}>Escalate</button>
          <button className="ghost" onClick={() => setState(markEncounterForHandover(state))} title="Flag this active patient problem for the morning handover">Handover</button>
        </div>
      </div>
      {step?.title && <h3>{step.title}</h3>}
      <p className="vignette">{display.vignette}</p>
      <div className="clinical-grid">
        <div><strong>Observations</strong><p>{display.observations}</p></div>
        <div><strong>Examination</strong><p>{display.examination}</p></div>
        <div><strong>Investigations</strong><p>{display.investigations.join(" · ")}</p></div>
      </div>
      <div className="choices">
        {choices.map((choice) => (
          <button key={choice.id} className={choice.unsafe ? "choice unsafe" : "choice"} onClick={() => setState(chooseEncounterOption(state, choice.id))}>
            <strong>{choice.label}</strong>
            <span>{choice.detail}</span>
            <DeltaList consequence={choice.consequence} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ResourcesPanel({ state, setState, mode = "all" }: { state: GameState; setState: (state: GameState) => void; mode?: "all" | "team" | "resources" }) {
  const canUse = (resourceId: ResourceItemId) => {
    const resource = state.resources.find((item) => item.id === resourceId);
    if (!resource || resource.charges <= 0) return false;
    if (resource.usableWhen === "encounter") return Boolean(state.activeEncounterId);
    if (resource.usableWhen === "task") return state.activeTasks.length > 0;
    return true;
  };
  return (
    <section className="panel resources-panel" aria-labelledby="resources-title">
      <h2 id="resources-title">{mode === "team" ? "Team" : mode === "resources" ? "Resources" : "Resources"}</h2>
      {mode !== "resources" && (
        <>
          <div className="team-list">
            {state.team.map((member) => (
              <div key={member.id} className={member.busyUntil > state.minute ? "team-member busy" : "team-member"}>
                <strong>{member.name}</strong>
                <span>{member.busyUntil > state.minute ? `Busy ${member.busyUntil - state.minute}m` : "Available"}</span>
                <span>Trust {member.trust} · fatigue {member.fatigue} · jobs {member.recentDelegations}</span>
                <small>{member.role}</small>
              </div>
            ))}
          </div>
          <div className="chips">
            {state.allies.map((ally) => <span key={ally}>{ally}</span>)}
          </div>
        </>
      )}
      {mode !== "team" && (
        <div className="resource-grid">
          {state.resources.map((resource) => (
            <button
              key={resource.id}
              className="resource-button"
              disabled={!canUse(resource.id)}
              title={resource.description}
              onClick={() => setState(useResource(state, resource.id))}
            >
              <strong>{resource.label}</strong>
              <span>{resource.charges} left</span>
              <small>{resource.description}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function LogPanel({ state }: { state: GameState }) {
  return (
    <section className="panel log-panel" aria-labelledby="log-title">
      <h2 id="log-title">Shift Log</h2>
      <ol>
        {state.log.map((entry, index) => (
          <li className={entry.tone} key={`${entry.minute}-${index}`}>
            <time>{formatClock(entry.minute)}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AcuityPanel({ state }: { state: GameState }) {
  return (
    <section className="panel details-panel" aria-labelledby="details-title">
      <h2 id="details-title">Oversight And Acuity</h2>
      <div className="acuity-grid" aria-label="Ward acuity">
        {locations.filter((location) => ["volatile", "high", "moderate"].includes(location.risk)).map((location) => (
          <span key={location.id} className={state.wardAcuity[location.id].level > 60 || state.minute - state.locationLastVisited[location.id] > 28 ? "acuity hot" : "acuity"}>
            {location.name}: acuity {state.wardAcuity[location.id].level} · momentum {state.wardMomentum[location.id].pressure} · {state.wardMomentum[location.id].tags.join(", ") || "steady"} · seen {Math.max(0, state.minute - state.locationLastVisited[location.id])}m ago
          </span>
        ))}
      </div>
      <div className="summary-grid">
        <span>Pressure <strong>{state.hospitalPressure}</strong></span>
        <span>Oversight <strong>{state.oversight}</strong></span>
        <span>Reg Sense <strong>{state.regSense}</strong></span>
        <span>Datix <strong>{state.datix}</strong></span>
        <span>Handover memory <strong>{handoverMemoryScore(state)}</strong></span>
        <span>Escalations <strong>{state.escalations.length}</strong></span>
      </div>
    </section>
  );
}

type DrawerId = "resources" | "team" | "log" | "bleeps" | "details";

function BottomDrawers({ state, setState }: { state: GameState; setState: (state: GameState) => void }) {
  const [openDrawer, setOpenDrawer] = useState<DrawerId | undefined>();
  const toggle = (drawer: DrawerId) => setOpenDrawer(openDrawer === drawer ? undefined : drawer);
  return (
    <section className="drawer-shell" aria-label="Secondary game panels">
      <div className="drawer-tabs">
        <button className={openDrawer === "resources" ? "active" : ""} onClick={() => toggle("resources")}>Resources</button>
        <button className={openDrawer === "team" ? "active" : ""} onClick={() => toggle("team")}>Team</button>
        <button className={openDrawer === "log" ? "active" : ""} onClick={() => toggle("log")}>Log</button>
        <button className={openDrawer === "bleeps" ? "active" : ""} onClick={() => toggle("bleeps")}>All Bleeps</button>
        <button className={openDrawer === "details" ? "active" : ""} onClick={() => toggle("details")}>Details</button>
      </div>
      {openDrawer && (
        <div className="drawer-panel">
          {openDrawer === "resources" && <ResourcesPanel state={state} setState={setState} mode="resources" />}
          {openDrawer === "team" && <ResourcesPanel state={state} setState={setState} mode="team" />}
          {openDrawer === "log" && <LogPanel state={state} />}
          {openDrawer === "bleeps" && <TaskPanel state={state} setState={setState} />}
          {openDrawer === "details" && <AcuityPanel state={state} />}
        </div>
      )}
    </section>
  );
}

function EndScreen({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const rank = endingRank(state);
  return (
    <div className="end-screen" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <div className="end-card">
        <h2 id="end-title">{rank}</h2>
        <p>{state.endingReason}</p>
        <div className="debrief-list" aria-label="Handover debrief">
          {handoverDebrief(state).map((line) => <p key={line}>{line}</p>)}
        </div>
        <div className="summary-grid">
          <span>Score <strong>{state.score}</strong></span>
          <span>Patients stabilised <strong>{state.patientsStabilised}</strong></span>
          <span>Emergencies handled <strong>{state.emergenciesHandled}</strong></span>
          <span>Dangerous delays <strong>{state.dangerousDelays}</strong></span>
          <span>Handover quality <strong>{state.handoverQuality}</strong></span>
          <span>Handover memory <strong>{handoverMemoryScore(state)}</strong></span>
          <span>Breaks taken <strong>{state.breaksTaken}</strong></span>
          <span>NHS chaos survived <strong>{state.chaosSurvived}</strong></span>
          <span>Bird status <strong>{state.birdStatus}</strong></span>
          <span>Hospital pressure <strong>{state.hospitalPressure}</strong></span>
          <span>Oversight <strong>{state.oversight}</strong></span>
          <span>Reg Sense <strong>{state.regSense}</strong></span>
          <span>Patient safety <strong>{state.patientSafety}</strong></span>
          <span>Open tasks <strong>{state.activeTasks.filter((t) => t.source !== "treat").length}</strong></span>
        </div>
        <button className="primary wide" onClick={onRestart}>Start another night</button>
      </div>
    </div>
  );
}

type MobileTab = "map" | "encounter" | "tasks" | "info";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 900);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 899px)");
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener("change", update);
    update();
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function MobileHeader({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  return (
    <header className="mobile-header">
      <div className="mob-brand">Night Med Reg</div>
      <div className="mob-time">
        <strong>{formatClock(state.minute)}</strong>
        <small>{formatDuration(SHIFT_LENGTH - state.minute)}</small>
      </div>
      <div className="mob-vitals">
        <div className="mob-vital-row">
          <span>Stam</span>
          <div className="meter" aria-label={`Stamina ${state.stamina}`}><b style={{ width: `${state.stamina}%` }} /></div>
        </div>
        <div className="mob-vital-row">
          <span>Safe</span>
          <div className="meter" aria-label={`Safety ${state.patientSafety}`}><b style={{ width: `${state.patientSafety}%` }} /></div>
        </div>
      </div>
      <button className="mob-restart" onClick={onRestart} aria-label="Restart game">↺</button>
    </header>
  );
}

function MobileInfoTab({ state, setState, onRestart }: { state: GameState; setState: (s: GameState) => void; onRestart: () => void }) {
  return (
    <div className="mobile-info-content">
      <section className="panel">
        <div className="panel-heading">
          <h2>Shift Status</h2>
          <button className="ghost" onClick={onRestart}>Restart</button>
        </div>
        <div className="clock">
          <strong>{formatClock(state.minute)}</strong>
          <span>{formatDuration(SHIFT_LENGTH - state.minute)} to 09:00</span>
        </div>
        {statRows.map(([label, key]) => {
          const value = Number(state[key]);
          return (
            <div className="meter-row" key={label}>
              <span>{label}</span>
              <div className="meter" aria-label={`${label} ${value}`}>
                <b style={{ width: `${value}%` }} />
              </div>
              <strong>{value}</strong>
            </div>
          );
        })}
        <div className="score-grid">
          <span>Score <strong>{state.score}</strong></span>
          <span>Backlog <strong>{state.pagerBacklog}</strong></span>
          <span>Pressure <strong>{state.hospitalPressure}</strong></span>
          <span>Oversight <strong>{state.oversight}</strong></span>
          <span>Reg Sense <strong>{state.regSense}</strong></span>
          <span>Bird <strong>{state.birdStatus}</strong></span>
        </div>
      </section>
      <ResourcesPanel state={state} setState={setState} />
      <LogPanel state={state} />
      <AcuityPanel state={state} />
    </div>
  );
}

function MobileTabBar({ active, onChange, state }: { active: MobileTab; onChange: (tab: MobileTab) => void; state: GameState }) {
  const taskCount = liveTasks(state).filter((t) => t.source !== "treat").length;
  const hasEncounter = Boolean(state.activeEncounterId);
  return (
    <nav className="mobile-tab-bar" aria-label="Game panels">
      <button className={active === "map" ? "mob-tab active" : "mob-tab"} onClick={() => onChange("map")}>Map</button>
      <button className={active === "encounter" ? "mob-tab active" : "mob-tab"} onClick={() => onChange("encounter")}>
        {hasEncounter ? "Encounter ●" : "Encounter"}
      </button>
      <button className={active === "tasks" ? "mob-tab active" : "mob-tab"} onClick={() => onChange("tasks")}>
        {taskCount > 0 ? `Bleeps ${taskCount}` : "Bleeps"}
      </button>
      <button className={active === "info" ? "mob-tab active" : "mob-tab"} onClick={() => onChange("info")}>Info</button>
    </nav>
  );
}

export default function App() {
  const newRun = () => initialGameState(randomRunSeed());
  const [state, setState] = useState<GameState>(() => newRun());
  const currentEncounter = useMemo(() => encounters.find((item) => item.id === state.activeEncounterId), [state.activeEncounterId]);
  const isMobile = useIsMobile();
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");

  useEffect(() => {
    if (state.activeEncounterId) setMobileTab("encounter");
  }, [state.activeEncounterId]);

  if (isMobile) {
    return (
      <main className="app mobile-app">
        <MobileHeader state={state} onRestart={() => setState(newRun())} />
        <div className="mobile-content">
          {mobileTab === "map" && <MapPanel state={state} setState={setState} />}
          {mobileTab === "encounter" && <EncounterPanel state={state} setState={setState} />}
          {mobileTab === "tasks" && <TaskPanel state={state} setState={setState} />}
          {mobileTab === "info" && <MobileInfoTab state={state} setState={setState} onRestart={() => setState(newRun())} />}
        </div>
        <MobileTabBar active={mobileTab} onChange={setMobileTab} state={state} />
        {state.ended && <EndScreen state={state} onRestart={() => setState(newRun())} />}
      </main>
    );
  }

  return (
    <main className="app">
      <StatsPanel state={state} onRestart={() => setState(newRun())} />
      <div className={state.activeEncounterId ? "layout encounter-mode" : "layout"}>
        <section className="centre-column">
          <div className="phase-strip">
            <span>{currentEncounter ? "Challenge in front of you" : `${state.shiftPhase.replace("_", " ")} · next possible bleep ${formatDuration(Math.max(0, state.nextTaskSpawnAt - state.minute))}`}</span>
            <span>Fictional NHS DGH · night shift</span>
          </div>
          <EncounterPanel state={state} setState={setState} />
          <MapPanel state={state} setState={setState} />
        </section>
        <aside className="right-column">
          <TaskPanel state={state} setState={setState} limit={3} compact />
        </aside>
      </div>
      <BottomDrawers state={state} setState={setState} />
      {state.ended && <EndScreen state={state} onRestart={() => setState(newRun())} />}
    </main>
  );
}
