// tools/scenarios.mjs — tools/shot.mjs 가 쓰는 Node 측 상태 준비 (ARCHITECTURE §12.4)
// 엔진(js/engine/run.js · match.js)만으로 원하는 경기 상황을 찾아 run/match 상태 JSON 을 만든다.
// UI 코드에 의존하지 않는다 → v0.1 / v0.2 UI 어느 쪽에서도 같은 상태를 주입할 수 있다.
//
//   const data = loadData();
//   const found = buildScenarioState(data, SCENARIOS[0], { runSeed: 1 });
//   // found = { runState, matchState, seed, steps, preferred, summary }
//
// 시나리오 = { name, title, matchKind, auto, viewport?, require(s, ctx), prefer?(s, ctx), interact?, verify? }
//   require : 반드시 만족해야 하는 조건 (캡처 시점 상태 확인에도 쓴다)
//   prefer  : 가능하면 만족시킬 조건 (없으면 require 만 만족하는 첫 상태로 대체)
//   interact: 브라우저에서 할 조작 — { type: "hover", actions: [...] } | { type: "click", action, waitMs }
//   verify  : interact 뒤 상태 확인 (prev = 주입한 상태, live = 캡처 시점 상태) → true | "이유"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";

export { run, match };
export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_FILES = ["config", "characters", "supports", "skills", "events", "relics", "opponents", "routes"];

export function loadData(root = ROOT) {
  const data = {};
  for (const n of DATA_FILES) data[n] = JSON.parse(fs.readFileSync(path.join(root, "data", `${n}.json`), "utf8"));
  return data;
}

export const clone = (x) => JSON.parse(JSON.stringify(x));

/* ------------------------------------------------------------------ */
/* 런 준비: 기본 편성으로 createRun → 원하는 종류의 경기 직전(phase "match")까지     */
/* ------------------------------------------------------------------ */

/**
 * @param {object} data
 * @param {{ runSeed?: string|number, kind?: "friendly"|"goal", maxSteps?: number }} opts
 * @returns {object} RunState (phase "match", pendingMatch.kind === kind)
 */
export function prepareRun(data, { runSeed = 1, kind = "friendly", maxSteps = 500 } = {}) {
  const cfg = data.config;
  const state = run.createRun({
    data,
    seed: runSeed,
    squad: cfg.defaultSquad && cfg.defaultSquad.slots,
    formation: cfg.defaultSquad && cfg.defaultSquad.formation,
    supportIds: cfg.defaultSupports,
    tactics: cfg.defaultTactics,
  });
  for (let guard = 0; guard < maxSteps; guard++) {
    const phase = run.getPhase(state);
    if (phase === "match") {
      if (state.pendingMatch && state.pendingMatch.kind === kind) return state;
      // 원하는 종류가 아닌 경기(루트 친선전 등)는 자동으로 치르고 넘긴다
      const setup = run.getMatchSetup(state, data);
      const ms = createFromSetup(data, setup, setup.seed);
      match.simulateAuto(ms, data);
      run.finishMatch(state, data, match.getResult(ms));
      continue;
    }
    if (phase === "event") { run.resolveEvent(state, data, 0); continue; }
    if (phase === "turn") {
      if (kind === "friendly") { run.applyAction(state, data, { type: "friendly" }); continue; }
      const tv = run.getTurnView(state, data);
      if (tv.recommendedAction === "rest") run.applyAction(state, data, { type: "rest" });
      else run.applyAction(state, data, { type: "train", slot: tv.recommendedSlot });
      continue;
    }
    if (phase === "relic") { run.chooseRelic(state, data, (state.pendingRelicChoices && state.pendingRelicChoices[0]) ?? null); continue; }
    if (phase === "route") { run.chooseRoute(state, data, state.pendingRoutes[0]); continue; }
    throw new Error(`'${kind}' 경기에 도달하지 못했습니다 (phase ${phase})`);
  }
  throw new Error(`'${kind}' 경기에 도달하지 못했습니다 (${maxSteps} 단계 초과)`);
}

export function createFromSetup(data, setup, seed) {
  // UI(js/ui/screens/match.js)와 같은 인자로 만든다 (humanSide 기본 "home")
  return match.createMatch({
    data, seed, home: clone(setup.home), away: clone(setup.away), possessions: setup.possessions, kind: setup.kind,
  });
}

/* ------------------------------------------------------------------ */
/* 경기 상황 탐색                                                         */
/* ------------------------------------------------------------------ */

/**
 * 여러 seed 로 경기를 만들고 step(자동)을 반복하며 require(+prefer) 를 만족하는 첫 상태를 찾는다.
 * seed 순서: pendingMatch.seed, 1, 2, … maxSeeds (결정적 → 같은 입력이면 같은 상태).
 * @returns {{ seed, steps, matchState, preferred } | null}
 */
export function findMatchState(data, runState, scenario, { maxSeeds = 400, maxSteps = 800 } = {}) {
  const setup = run.getMatchSetup(runState, data);
  const ctx = { data };
  const seeds = [setup.seed];
  for (let i = 1; i <= maxSeeds; i++) seeds.push(i);
  let fallback = null;
  for (const seed of seeds) {
    const ms = createFromSetup(data, setup, seed);
    for (let steps = 0; steps <= maxSteps; steps++) {
      if (scenario.require(ms, ctx)) {
        if (!scenario.prefer || scenario.prefer(ms, ctx)) return { seed, steps, matchState: clone(ms), preferred: true };
        if (!fallback) fallback = { seed, steps, matchState: clone(ms), preferred: false };
      }
      if (ms.finished) break;
      match.step(ms, data, null);
    }
  }
  return fallback;
}

/**
 * 시나리오 하나의 주입 상태를 만든다. runState.pendingMatch.seed 를 찾은 match.seed 로 맞춘다
 * (app.js continueRun 은 match.seed === run.pendingMatch.seed 일 때만 저장된 경기를 복원).
 */
export function buildScenarioState(data, scenario, { runSeed = 1, maxSeeds, maxSteps } = {}) {
  const runState = prepareRun(data, { runSeed, kind: scenario.matchKind || "friendly" });
  const found = findMatchState(data, runState, scenario, { maxSeeds, maxSteps });
  if (!found) throw new Error(`[${scenario.name}] 조건을 만족하는 경기 상태를 찾지 못했습니다`);
  const rs = clone(runState);
  rs.pendingMatch.seed = found.matchState.seed;
  return { ...found, runState: rs, summary: describeState(found.matchState) };
}

/* ------------------------------------------------------------------ */
/* 조건 헬퍼                                                              */
/* ------------------------------------------------------------------ */

export const isDuel = (s) => !!(s && !s.finished && s.phase === "decision" && s.duel && s.ball);
export const atk = (s, side, line) => isDuel(s) && s.attackingSide === side && s.ball.lineIndex === line;
export const needs = (s, role) => match.humanNeedsDecision(s, "home") === role;
export const carrierOf = (s) => {
  const team = s && s[s.attackingSide];
  return team && s.ball ? team.players.find((p) => p.id === s.ball.carrierId) || null : null;
};
export function actionEnabled(s, data, action) {
  const list = s.attackingSide === "home" ? match.getAttackActions(s, "home", data) : match.getDefenseActions(s, "home", data);
  return list.some((a) => a.action === action && a.enabled !== false);
}
/** 복제 상태에 사람 결정을 넣어 한 듀얼 진행 → 새 이벤트 목록 */
export function tryDecision(s, data, decision) {
  const c = clone(s);
  const before = c.events.length;
  match.step(c, data, decision);
  return { state: c, events: c.events.slice(before) };
}
export function passSucceeds(s, data) {
  const { events } = tryDecision(s, data, { action: "pass" });
  return events.some((e) => e.type === "duel" && e.success === true && e.action === "pass");
}

export function describeState(s) {
  const c = carrierOf(s);
  const pos = s.phase === "penalties"
    ? `승부차기 ${s.penalties?.home ?? 0}:${s.penalties?.away ?? 0} (킥 ${s.penalties?.kicks?.length ?? 0}회, 다음 ${s.penalties?.turn})`
    : `${s.attackingSide} 공격 lineIndex ${s.ball?.lineIndex}${c ? ` · 공: ${c.name}(${c.slot})` : ""}`;
  return `${pos} · ${s.phase} · 포제션 ${Math.min(s.possession, s.possessionsTotal)}/${s.possessionsTotal}` +
    ` · ${s.score.home}:${s.score.away} · ${s.kind} seed ${s.seed}`;
}

/* ------------------------------------------------------------------ */
/* 시나리오 (파일명 = name)                                                */
/* ------------------------------------------------------------------ */

const AWAY_SHOT = {
  matchKind: "friendly",
  auto: true,
  // v0.1 회귀: 상대가 우리 박스에서 슛 직전(lineIndex 3)
  require: (s) => atk(s, "away", 3),
  prefer: (s) => carrierOf(s)?.position === "FW" && s.possession >= 3,
};

export const SCENARIOS = [
  {
    name: "01_home_buildup",
    title: "우리 빌드업 (① 우리 진영, 자동)",
    matchKind: "friendly",
    auto: true,
    require: (s) => atk(s, "home", 0),
    prefer: (s) => s.possession >= 3,
  },
  {
    name: "02_home_final_third_decision",
    title: "우리 파이널 서드 수동 결정 (③, 자동 끔 + 액션 버튼 hover)",
    matchKind: "friendly",
    auto: false,
    require: (s) => atk(s, "home", 2) && needs(s, "attack"),
    prefer: (s, { data }) => actionEnabled(s, data, "pass") && s.possession >= 2,
    interact: { type: "hover", actions: ["pass", "dribble", "shoot"] },
  },
  {
    name: "03_away_shot",
    title: "상대 ④ 슈팅 — v0.1 회귀 (우리 필드 선수 전원이 공 뒤여야 함)",
    ...AWAY_SHOT,
  },
  {
    name: "04_away_danger",
    title: "상대 ③ 위험 (우리 DF 라인 수비, 자동)",
    matchKind: "friendly",
    auto: true,
    require: (s) => atk(s, "away", 2) && needs(s, "defense"),
    prefer: (s) => s.possession >= 2,
  },
  {
    name: "05_penalties",
    title: "승부차기 (목표 경기 동점)",
    matchKind: "goal",
    auto: true,
    require: (s) => !s.finished && s.phase === "penalties" && !!s.penalties,
    prefer: (s) => (s.penalties.kicks?.length ?? 0) >= 3,
  },
  {
    name: "06_pass_beat_mid",
    title: "패스 성공 비트 연출 중간 프레임 (자동 끔, 패스 클릭 250ms 뒤)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      actionEnabled(s, data, "pass") && passSucceeds(s, data),
    prefer: (s) => s.ball.lineIndex === 1,
    interact: { type: "click", action: "pass", waitMs: 250 },
    // 캡처 시점: 패스가 판정되어 공이 한 단계 전진했어야 한다
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      const ok = fresh.some((e) => e.type === "duel" && e.success === true && e.action === "pass");
      if (!ok) return `패스 성공 이벤트 없음 (새 이벤트 ${fresh.length}개: ${fresh.map((e) => e.type).join(",") || "-"})`;
      if (live.attackingSide !== "home" || live.ball?.lineIndex !== prev.ball.lineIndex + 1) {
        return `공 위치가 예상과 다름 (${live.attackingSide} lineIndex ${live.ball?.lineIndex})`;
      }
      return true;
    },
  },
  {
    name: "07_desktop",
    title: "데스크톱 1280×900 (03 과 같은 상태)",
    ...AWAY_SHOT,
    viewport: { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
];
