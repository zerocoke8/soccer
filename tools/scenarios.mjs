// tools/scenarios.mjs — tools/shot.mjs 가 쓰는 Node 측 상태 준비 (ARCHITECTURE §12.4)
// 엔진(js/engine/run.js · match.js)만으로 원하는 경기 상황 · 런 단계를 찾아 run/match 상태 JSON 을 만든다.
// UI 코드에 의존하지 않는다 → UI 가 바뀌어도 같은 상태를 주입할 수 있다.
//
//   const data = loadData();
//   const found = buildScenarioState(data, SCENARIOS[0], { runSeed: 1 });
//   // found = { runState, matchState, teams, seed, steps, preferred, summary }
//
// 시나리오 추가: 아래 SCENARIOS 배열에 객체 하나. name 이 파일 이름(<name>.png)이자 --only 접두어.
//   경기 시나리오 (01_… ~): 이 머리말의 형식. 아웃게임 시나리오 (og_…): 파일 아래 "아웃게임 시나리오" 머리말 참고.
//
// 경기 시나리오 = { name, title, matchKind, auto, viewport?, speed?, adjustSetup?(setup, data), require(s, ctx), prefer?(s, ctx), interact?, verify? }
//   viewport: 기본(1280×720 DPR 1 — 고정 스테이지 1배)이 아닌 창 크기로 찍을 때 { width, height, deviceScaleFactor, isMobile, hasTouch }
//   adjustSetup: 경기 스냅샷을 만들기 전에 고친다 (예: 상대에게 간파 사용권) — 복제본에 적용, 결정적
//   require : 반드시 만족해야 하는 조건 (캡처 시점 상태 확인에도 쓴다)
//   prefer  : 가능하면 만족시킬 조건 (없으면 require 만 만족하는 첫 상태로 대체)
//   interact: 브라우저에서 할 조작 — { type: "hover", actions: [...] } | { type: "click", action, waitMs }
//             | { type: "steps", steps: [{ click: "css 선택자" } | { hover: [액션…] } | { press: 액션, waitMs } | { wait: ms }] }
//   verify  : interact 뒤 상태 확인 (prev = 주입한 상태, live = 캡처 시점 상태) → true | "이유"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";

export { run, match };
export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_FILES = ["config", "characters", "supports", "skills", "events", "relics", "opponents", "routes"];
const OPTIONAL_FILES = ["traits", "combos"]; // v0.3 (없으면 엔진 기본값)

export function loadData(root = ROOT) {
  const data = {};
  for (const n of DATA_FILES) data[n] = JSON.parse(fs.readFileSync(path.join(root, "data", `${n}.json`), "utf8"));
  for (const n of OPTIONAL_FILES) {
    const f = path.join(root, "data", `${n}.json`);
    if (fs.existsSync(f)) data[n] = JSON.parse(fs.readFileSync(f, "utf8"));
  }
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
  const setup = clone(run.getMatchSetup(runState, data));
  if (scenario.adjustSetup) scenario.adjustSetup(setup, data);
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
  if (scenario.outgame) {
    const b = scenario.build(data, { runSeed });
    return { seed: runSeed, steps: b.steps ?? 0, preferred: b.preferred !== false, matchState: null, teams: b.teams ?? null, runState: b.runState ?? null, summary: b.summary };
  }
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
/** GK 배급 대기 (2026-09-29): 세이브 · 박스 연결 차단 뒤 phase "distribution" */
export const isDistribution = (s) => !!(s && !s.finished && s.phase === "distribution" && s.distribution);
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
/** 사람(home) 측 view — require/prefer 에서 엔진 view 필드(§13.4)로 조건을 건다 */
export const viewOf = (s, data) => match.getMatchView(s, data, "home");
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
    title: "창 1280×900 — 스테이지 위아래 레터박스 (03 과 같은 상태)",
    ...AWAY_SHOT,
    viewport: { width: 1280, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  },
  {
    name: "08_cross_decision",
    title: "울릭(크로서) ③ 크로스 가능한 결정 — 공격 2×2, 크로스 받는 선수 후보 2명 박스에 (크로스 hover = 포물선)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 2) && needs(s, "attack") && carrierOf(s)?.trait === "crosser" && !!viewOf(s, data).receivers?.cross,
    prefer: (s, { data }) => viewOf(s, data).receivers.cross.candidates.length >= 2 && s.possession >= 2,
    interact: { type: "hover", actions: ["cross", "pass"] },
  },
  {
    name: "09_combo_ready",
    title: "합체기 준비 — 바람의 실을 받은 그룸바, 스킬 줄 '💥 바람의 유성' 토글 + 슛 hover",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && !!comboOption(viewOf(s, data)),
    prefer: (s) => s.ball.lineIndex === 2,
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 150 }, { hover: ["shoot"] }] },
  },
  {
    name: "10_opponent_reading",
    title: "상대 간파 — '상대가 우리 수를 읽는 중' (상대에게 간파 사용권 3)",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => { setup.away.gaanpaTickets = 3; },
    require: (s, { data }) => isDuel(s) && !!match.humanNeedsDecision(s, "home") && viewOf(s, data).opponentReading === true,
    prefer: (s) => atk(s, "home", 2) && s.possession >= 2,
  },
  {
    name: "11_defense_decision",
    title: "수비 결정 3버튼 (태클·인터셉트·버티기) + 간파 사용권 버튼, 태클 hover",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => { setup.home.gaanpaTickets = 5; }, // 자동 진행 중 레버리지 비트에서 우리 AI 도 쓰므로 넉넉히
    require: (s) => isDuel(s) && s.attackingSide === "away" && s.ball.lineIndex <= 2 && needs(s, "defense"),
    prefer: (s, { data }) => s.ball.lineIndex === 1 && viewOf(s, data).expected?.attack?.action === "dribble" && viewOf(s, data).gaanpa?.usable === true,
    interact: { type: "hover", actions: ["tackle", "intercept"] },
  },
  {
    name: "12_ult_pass",
    title: "필살 패스 — 실루엔 '✨ 바람의 실' 토글, 받는 선수 기본값 = 합체기 상대 (패스 hover)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && ultOption(viewOf(s, data))?.type === "pass",
    prefer: (s, { data }) => {
      const v = viewOf(s, data);
      return !!v.receivers?.pass?.ultimateDefaultId && v.players.home.find((p) => p.id === v.receivers.pass.ultimateDefaultId)?.ultimateSkillId;
    },
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 150 }, { hover: ["pass"] }] },
  },
  {
    // 2026-09-29 필살기 3단 연출: 차지(합체기는 첫 필살기가 아니라 0.3초) → 두 컷인 1.0초씩 → 이름 1.1초 → 2.8초 = 이름 카드 한가운데
    name: "13_combo_cutin",
    title: "합체기 컷인 — 바람의 유성 발동 (슛 클릭 뒤 2.8초, 1x: 차지 → 두 컷인 → 이름 카드)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && !!comboOption(viewOf(s, data)),
    prefer: (s) => s.ball.lineIndex === 2,
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "shoot", waitMs: 2800 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "combo") ? true : `합체기 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    name: "14_cross_beat_mid",
    title: "크로스 성공 비트 연출 중간 프레임 — 포물선 궤적 · 공 (크로스 클릭 400ms 뒤, 1x)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 2) && needs(s, "attack") && actionEnabled(s, data, "cross") &&
      tryDecision(s, data, { action: "cross" }).events.some((e) => e.type === "duel" && e.success === true && e.action === "cross"),
    prefer: (s) => s.possession >= 2,
    interact: { type: "click", action: "cross", waitMs: 400 },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "duel" && e.success && e.action === "cross") ? true : `크로스 성공 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    name: "15_tackle_beaten_mid",
    title: "드리블로 태클을 제친 비트 — 수비수가 넘어져 누운 모습 · 연계 문구 (드리블 클릭 600ms 뒤, 1x)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      viewOf(s, data).expected?.defense?.action === "tackle" &&
      tryDecision(s, data, { action: "dribble" }).events.some((e) => e.type === "duel" && e.success === true && e.action === "dribble" && e.defAction === "tackle"),
    prefer: (s, { data }) => tryDecision(s, data, { action: "dribble" }).events.some((e) => e.type === "duel" && (e.links || []).length > 0),
    interact: { type: "click", action: "dribble", waitMs: 600 },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "duel" && e.success && e.defAction === "tackle") ? true : `태클 제침 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    name: "16_skill_row_4",
    title: "스킬 줄 4개 (필살기 + 간파 + 액티브 2) — 실루엔에 스루 패스·폭발 드리블·꿰뚫어보기, 이름이 잘리지 않아야 함",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => {
      const p = setup.home.players.find((x) => (x.skillIds || []).includes("sk_wind_thread"));
      if (p) p.skillIds = [...new Set([...(p.skillIds || []), "sk_through_pass", "sk_burst_dribble", "sk_see_through"])];
    },
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      (carrierOf(s)?.skillIds || []).includes("sk_see_through") && (viewOf(s, data).skills || []).length >= 3,
    prefer: (s, { data }) => {
      const v = viewOf(s, data);
      return !!ultOption(v) && v.gaanpa?.usable === true && (v.skills || []).filter((x) => x.enabled).length >= 3;
    },
  },
  {
    name: "17_skill_row_many",
    title: "스킬 묶음 7개 (필살기 + 간파 + 액티브 5, 라인 브레이커 포함) — 2열 · 상자 안 스크롤: 필드를 덮지 않고, 이름(두 줄까지) · ✦ 비용이 잘리지 않아야 함",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => {
      const p = setup.home.players.find((x) => (x.skillIds || []).includes("sk_wind_thread"));
      if (p) {
        p.skillIds = [...new Set([...(p.skillIds || []),
          "sk_line_breaker", "sk_through_pass", "sk_burst_dribble", "sk_see_through", "sk_power_shot", "sk_rally_cry"])];
      }
    },
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      (carrierOf(s)?.skillIds || []).includes("sk_line_breaker") && (viewOf(s, data).skills || []).length >= 6,
    prefer: (s, { data }) => {
      const v = viewOf(s, data);
      return !!ultOption(v) && v.gaanpa?.usable === true;
    },
  },
  {
    // 2026-09-29 박스 연결: ④ 에서 슛 외에 컷백 패스(→ 원터치 슛) · 센터링(크로서만 → 헤더). 연결은 GK 와의 듀얼, 포제션당 1회
    name: "18_box_link_decision",
    title: "④ 박스 연결 결정 — 슛 · 컷백 패스 · 센터링(크로서 울릭) 버튼, 받는 선수 후보는 박스 안 (자동 끔, 컷백 hover)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 3) && needs(s, "attack") && actionEnabled(s, data, "pass") && !!viewOf(s, data).receivers?.pass,
    prefer: (s, { data }) => actionEnabled(s, data, "cross") && viewOf(s, data).receivers.pass.candidates.length >= 2,
    interact: { type: "hover", actions: ["pass"] },
  },
  {
    name: "19_box_link_beat_mid",
    title: "④ 컷백 패스 성공 비트 중간 프레임 — 박스 안 연결 · 받은 선수 원터치 슛 준비 (컷백 클릭 600ms 뒤, 1x)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 3) && needs(s, "attack") && actionEnabled(s, data, "pass") &&
      tryDecision(s, data, { action: "pass" }).events.some((e) => e.type === "duel" && e.success === true && e.boxLink === true),
    prefer: (s) => s.possession >= 2,
    interact: { type: "click", action: "pass", waitMs: 600 },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "duel" && e.success && e.boxLink)
        ? true
        : `박스 연결 성공 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // 2026-09-29 에이스의 외침 (표시 전용): 받으면 필살기가 준비되는 받는 선수 "줘!" + 금색 점선 + 배지 "★ 연결하면 메테오 슛"
    name: "20_ace_call",
    title: "에이스의 외침 — 우리 공격 결정, 받으면 필살 슛이 준비되는 그룸바 '줘!' · 금색 점선 · 배지 (자동 끔, hover 없음)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && viewOf(s, data).aceCall?.side === "home",
    // 정규 포제션의 외침 (마지막 공격 보장 포제션은 26_last_attack 이 보여준다 — 2026-09-30)
    prefer: (s, { data }) => {
      const c = viewOf(s, data).aceCall;
      const lastAttack = !!(s.lastAttack && s.lastAttack.possession === s.possession);
      return !lastAttack && c.reason === "gauge" && c.ultimateType === "shot" && c.actions.includes("pass") && s.ball.lineIndex >= 1 && s.ball.lineIndex <= 2;
    },
  },
  {
    // 상대 공격 중 상대 받는 선수의 외침 — 수비할 때 공이 어디로 갈지 보인다 (상대 AI 는 먼저 커밋 → 커밋한 받는 선수일 때만 외침).
    // 친선 상대에는 필살기가 없어 FW 에게 업화의 일격을 준다
    name: "21_ace_call_opponent",
    title: "에이스의 외침 (상대) — 우리 수비 결정 중 상대 AI 가 패스를 커밋한 FW '줘!' · 금색 점선 · 배지 (상대 FW 에 업화의 일격 주입, 자동 끔)",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => {
      const fw = setup.away.players.find((p) => p.position === "FW");
      if (fw) fw.skillIds = [...new Set([...(fw.skillIds || []), "sk_boss_strike"])];
    },
    require: (s, { data }) => isDuel(s) && s.attackingSide === "away" && needs(s, "defense") && viewOf(s, data).aceCall?.side === "away",
    prefer: (s, { data }) => {
      const c = viewOf(s, data).aceCall;
      return c.actions.includes("pass") && s.ball.lineIndex === 1 && s.possession >= 2;
    },
  },
  {
    // 필살기 3단 연출 ① 차지: 필드 흑백, 사용자(필살 슛) 빛남 · 듀얼 상대만 색 — 슛 클릭 150ms 뒤 (경기의 첫 필살기면 차지 0.4초)
    name: "22_ult_charge_mid",
    title: "필살기 차지 중간 프레임 — 메테오 슛 토글 + 슛 클릭 150ms 뒤 (1x): 필드 흑백 · 그룸바 빛남 · 상대 GK/수비만 색",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && (() => {
      const u = ultOption(viewOf(s, data));
      return !!u && u.type === "shot" && !u.comboName;
    })(),
    // ④ (GK 1:1) 우선 — 막히면 GK 역방향 컷인 "기적의 세이브!" (③ 은 DF 블록 "철벽 블록!" — 27_df_block_cutin)
    prefer: (s) => !s.events.some((e) => e.type === "cutin") && s.ball.lineIndex >= 3,
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "shoot", waitMs: 150 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "cutin" && e.ultimateType === "shot") ? true : `필살 슛 컷인 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  // ---- 2026-09-29 사용자 결정 3~7 (엔진 준비 — UI 는 view.distribution · 이벤트 필드로 그린다) ----
  {
    // GK 배급: 우리 GK 가 세이브(또는 박스 연결 차단)한 뒤 needsDecision "distribution" — 짧은 패스 100% / 롱패스 % + 캐논 킥
    name: "23_gk_distribution",
    title: "GK 배급 결정 — 세이브 뒤 짧은 패스 · 롱패스 두 선택지 + 캐논 킥 (네리아에 캐논 킥 주입, 자동 끔)",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => {
      const gk = setup.home.players.find((p) => p.position === "GK");
      if (gk) gk.skillIds = [...new Set([...(gk.skillIds || []), "sk_cannon_kick"])];
    },
    require: (s) => isDistribution(s) && needs(s, "distribution"),
    prefer: (s, { data }) => {
      const d = viewOf(s, data).distribution;
      return !!d && d.skills.some((k) => k.enabled) && s.possession >= 2;
    },
  },
  {
    // 롱패스 비트 중간: GK → 중원 MF (성공하는 주사위의 상태) — 버튼 data-action="long" 을 누른다
    name: "24_long_ball_mid",
    title: "GK 롱패스 비트 중간 프레임 — 롱패스 클릭 400ms 뒤 (1x, 성공: 중원 MF 에게)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDistribution(s) && needs(s, "distribution") &&
      tryDecision(s, data, { action: "long" }).events.some((e) => e.type === "distribution" && e.action === "long" && e.success === true),
    prefer: (s) => s.possession >= 2,
    interact: { type: "click", action: "long", waitMs: 400 },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "distribution" && e.action === "long" && e.success)
        ? true
        : `롱패스 성공 비트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // 결정타 칩 (클래시 바 1단계): 판정 결과 한 줄 앞의 칩 (예: "짝 적중 ×1.7", "제쳐짐 +25%") — 결과 한 줄이 떠 있는 시점 (act 0.8 + move 0.65 뒤)
    name: "25_decisive_chip",
    title: "결정타 칩 — 드리블 판정 결과 줄 앞 칩 (능력치 아닌 요인 우선), 드리블 클릭 1.7초 뒤 (1x)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      actionEnabled(s, data, "dribble") && !!chipFor(s, data, { action: "dribble" }),
    // 대표 칩(짝 적중 · 제쳐짐 · 킬패스 · 침투 · 빗나감)이 나오는 판정 우선
    prefer: (s, { data }) => {
      const c = chipFor(s, data, { action: "dribble" });
      return !!c && ["pair", "beaten", "killpass", "runner"].includes(c.id) && s.possession >= 2;
    },
    interact: { type: "click", action: "dribble", waitMs: 1700 },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => ["duel", "turnover", "save", "goal"].includes(e.type) && e.decisive)
        ? true
        : `결정타 칩 있는 판정 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // 마지막 공격 보장: 1골 뒤진 우리가 마지막 포제션을 갖지 않았으면 +1 포제션 — "추가시간 — 마지막 공격!" (view.lastAttack.active)
    name: "26_last_attack",
    title: "마지막 공격 보장 — 1골 뒤진 우리의 추가시간 포제션 (배너 '추가시간 — 마지막 공격!', 첫 결정, 자동 끔)",
    matchKind: "friendly",
    auto: false,
    require: (s) => !s.finished && !!s.lastAttack && s.lastAttack.side === "home" && s.possession === s.lastAttack.possession &&
      (isDuel(s) || isDistribution(s)),
    prefer: (s) => isDuel(s) && needs(s, "attack"),
  },
  {
    // 역방향 컷인 "철벽 블록!": ③ 필살 슛(메테오 — 박스 슛 취급)이 DF 에게 막힌 비트. 경기의 첫 필살기(차지 0.4 + 컷인 1.0) →
    // 액션 0.8 + 멈춤 0.25 → 역방향 컷인 0.8 한가운데 ≈ 2.85초
    name: "27_df_block_cutin",
    title: "철벽 블록 역방향 컷인 — ③ 메테오 슛(필살 토글 + 슛)이 DF 에게 막힘, 슛 클릭 2.85초 뒤 (1x)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 2) && needs(s, "attack") && (() => {
      const u = ultOption(viewOf(s, data));
      return !!u && u.type === "shot";
    })() && tryDecision(s, data, { action: "shoot", ultimate: true }).events.some((e) => e.type === "turnover" && e.reverseCutin && e.reverseCutin.kind === "block"),
    prefer: (s) => !s.events.some((e) => e.type === "cutin"),
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "shoot", waitMs: 2850 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "turnover" && e.reverseCutin && e.reverseCutin.kind === "block")
        ? true
        : `DF 블록(reverseCutin block) 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
];

/** 복제 상태에 사람 결정을 넣었을 때 판정 이벤트의 결정타 칩 (없으면 null) */
function chipFor(s, data, decision) {
  const ev = tryDecision(s, data, decision).events.find((e) => ["duel", "turnover", "save", "goal"].includes(e.type) && Array.isArray(e.factors));
  return ev && ev.decisive ? ev.decisive : null;
}

/** 사람 측 결정의 필살기(세이브형 제외) */
function ultOption(view) {
  return (view.ultimateOptions || []).find((u) => u.usable && u.type !== "save") || null;
}
/** 합체기로 쓸 수 있는 필살기 (게이지 무관) */
function comboOption(view) {
  const u = ultOption(view);
  return u && u.comboName ? u : null;
}

/* ------------------------------------------------------------------ */
/* 아웃게임 시나리오 (og_*)                                                */
/* ------------------------------------------------------------------ */
// 아웃게임 시나리오 = { name: "og_…", title, outgame: true, build(data, { runSeed }), steps?, ready, expect, viewport? }
//   build(data, { runSeed }) → { runState | null, teams?, summary, steps?, preferred? }
//     runState: 주입할 런 (soccer.run). null = 저장된 런 없음 → 시작 화면. teams = 등록 팀 목록 (soccer.teams)
//   진입: runState 가 있으면 시작 화면 "이어하기" 클릭 → steps 순서대로 → ready 선택자가 보일 때까지 기다린 뒤 캡처
//   steps: [{ click: "css 선택자" } | { text: "버튼 글자 정규식" } | { wait: ms } |
//           { drag: { from: "css", to: "css", release?: false, steps?, waitMs? } }]  — drag: 실제 마우스로 끌기 (release 가 아니면 누른 채 캡처, tools/shot.mjs dragStep)
//   expect: 캡처 시점 확인 { screen: "start"|"setup"|"run", phase?: run phase, modal?: true | false | "css" (#modal-root 안) }
//   런 상태는 walkRun(기본 정책으로 런을 걷다가 조건을 만족하는 첫 결정 시점)으로 찾는다 → 같은 runSeed 면 같은 상태.

function defaultRun(data, runSeed) {
  const cfg = data.config;
  return run.createRun({
    data,
    seed: runSeed,
    squad: cfg.defaultSquad && cfg.defaultSquad.slots,
    formation: cfg.defaultSquad && cfg.defaultSquad.formation,
    supportIds: cfg.defaultSupports,
    tactics: cfg.defaultTactics,
  });
}

/** 기본 정책 한 단계: 이벤트 0번 · 훈련 추천 칸(휴식 추천이면 휴식) · 경기 자동 · 유물 첫째 · 루트 첫째 */
function policyStep(state, data, phase) {
  if (phase === "event") return run.resolveEvent(state, data, 0);
  if (phase === "turn") {
    const tv = run.getTurnView(state, data);
    return tv.recommendedAction === "rest"
      ? run.applyAction(state, data, { type: "rest" })
      : run.applyAction(state, data, { type: "train", slot: tv.recommendedSlot });
  }
  if (phase === "match") {
    const setup = run.getMatchSetup(state, data);
    const ms = createFromSetup(data, setup, setup.seed);
    match.simulateAuto(ms, data);
    return run.finishMatch(state, data, match.getResult(ms));
  }
  if (phase === "relic") return run.chooseRelic(state, data, (state.pendingRelicChoices && state.pendingRelicChoices[0]) ?? null);
  if (phase === "route") return run.chooseRoute(state, data, state.pendingRoutes[0]);
  throw new Error(`알 수 없는 phase: ${phase}`);
}

/**
 * 기본 편성 런을 기본 정책으로 걷다가 require(+prefer)를 만족하는 첫 결정 시점의 복제본을 돌려준다 (결정적).
 * @param {{ runSeed?, require: (state, ctx) => boolean, prefer?: (state, ctx) => boolean, maxSteps? }} opts  ctx = { phase, data }
 * @returns {{ state, steps, preferred } | null}
 */
export function walkRun(data, { runSeed = 1, require, prefer, maxSteps = 800 } = {}) {
  const state = defaultRun(data, runSeed);
  let fallback = null;
  for (let steps = 0; steps <= maxSteps; steps++) {
    const phase = run.getPhase(state);
    const ctx = { phase, data };
    if (require(state, ctx)) {
      if (!prefer || prefer(state, ctx)) return { state: clone(state), steps, preferred: true };
      if (!fallback) fallback = { state: clone(state), steps, preferred: false };
    }
    if (phase === "finished") break;
    policyStep(state, data, phase);
  }
  return fallback;
}

/** 런 상태 한 줄 요약 (shot.mjs 출력용) */
export function describeRun(state, data) {
  if (!state) return "저장된 런 없음";
  const phase = run.getPhase(state);
  let extra = "";
  if (phase === "turn") {
    const tv = run.getTurnView(state, data);
    const stam = (tv.players || []).map((p) => Number(p.stamina) || 0);
    const fr = (tv.slots || []).flatMap((sl) => (sl.supports || []).filter((x) => x.friendship)).length;
    extra = ` · SP ${tv.skillPoints} · 상점 ${(tv.shop || []).length} · 체력 ${Math.min(...stam)}~${Math.max(...stam)} · 우정 ${fr} · 호출권 ${tv.summonTickets}`;
  } else if (phase === "event") {
    const ev = run.getEventView(state, data);
    extra = ` · "${ev.title}" 선택지 ${ev.choices.length}${ev.support ? ` · 서포트 ${ev.support.name}` : ""}${ev.player ? ` · 선수 ${ev.player.name}` : ""}`;
  } else if (phase === "relic") {
    extra = ` · 유물 후보 ${(state.pendingRelicChoices || []).length}`;
  } else if (phase === "route") {
    extra = ` · 루트 후보 ${(state.pendingRoutes || []).length}`;
  }
  return `${phase} · 시즌 ${state.season} ${state.turn}턴 (turnIndex ${state.turnIndex})${extra} · 패배 ${state.record?.losses ?? 0} · seed ${state.seed}`;
}

function walkOrThrow(name, data, opts) {
  const found = walkRun(data, opts);
  if (!found) throw new Error(`[${name}] 조건을 만족하는 런 상태를 찾지 못했습니다`);
  return { runState: found.state, steps: found.steps, preferred: found.preferred, summary: describeRun(found.state, data) };
}

/** 완주한 런 → 등록 팀 (app.js registerTeam 과 같은 모양, 등록 시각은 고정) */
function registeredTeam(data, runSeed, registeredAt) {
  const found = walkRun(data, { runSeed, require: (s, { phase }) => phase === "finished" });
  if (!found) throw new Error(`런 ${runSeed} 이 끝나지 않습니다`);
  const { rating, registeredTeam: team } = run.finalizeRun(found.state, data);
  return { ...team, grade: rating.cappedGrade ?? rating.grade ?? "-", score: rating.score ?? null, registeredAt };
}

/** 시즌 2 후반 훈련 턴: SP · 스킬 상점 · 우정 훈련 · 체력 차이가 보이는 상태 (og_training_mid · 시트 · 미팅) */
const MID_TURN = {
  require: (s, { phase }) => phase === "turn" && s.turnIndex >= 9,
  prefer: (s, { data }) => {
    const tv = run.getTurnView(s, data);
    const stam = tv.players.map((p) => Number(p.stamina) || 0);
    const fr = tv.slots.some((sl) => (sl.supports || []).some((x) => x.friendship));
    return tv.skillPoints > 0 && (tv.shop || []).length >= 3 && Math.max(...stam) - Math.min(...stam) >= 30 && fr;
  },
};

export const OUTGAME_SCENARIOS = [
  {
    name: "og_start",
    title: "시작 화면 — 저장된 런 없음, 등록 팀 2개",
    outgame: true,
    build: (data, { runSeed }) => {
      const teams = [
        registeredTeam(data, `${runSeed}-b`, "2026-09-28T10:00:00.000Z"),
        registeredTeam(data, runSeed, "2026-09-27T10:00:00.000Z"),
      ];
      return { runState: null, teams, summary: `저장된 런 없음 · 등록 팀 ${teams.map((t) => `${t.grade}(${t.seed})`).join(", ")}` };
    },
    ready: ".hero",
    expect: { screen: "start", modal: false },
  },
  {
    name: "og_setup",
    title: "편성 화면 — 새 런 시작 (기본 편성 · 서포트 6장)",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작]" }),
    steps: [{ text: "새 런 시작" }],
    ready: ".slot-cards",
    expect: { screen: "setup", modal: false },
  },
  {
    // 라인업 보드 (js/ui/lineup.js): 벤치 미르카(GK - · DF - · MF A · FW B)를 끌어 MF2(타린) 위에 — 누른 채 캡처
    name: "og_setup_drag",
    title: "편성 드래그 중 — 벤치 미르카를 MF2 위로: GK·DF 빨강(적성 없음) · MF·FW 초록(적성 표시), 고스트",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 미르카 카드 끌기" }),
    steps: [{ text: "새 런 시작" }, { drag: { from: '.lu-card[data-pid="ch_cat_trickster"]', to: '.lu-slot[data-slot="MF2"]' } }],
    ready: ".lu-ghost",
    expect: { screen: "setup", modal: false },
  },
  {
    // 놓기 확인 (--width/--height 를 바꿔 배율이 달라도 같은 자리에 놓이는지): 미르카 → MF2, 타린은 벤치로
    name: "og_setup_drop",
    title: "편성 드래그 놓기 — 미르카를 MF2 에 놓음 → 타린 벤치 (ready = MF2 에 미르카)",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 미르카 → MF2 놓기" }),
    steps: [{ text: "새 런 시작" }, { drag: { from: '.lu-card[data-pid="ch_cat_trickster"]', to: '.lu-slot[data-slot="MF2"]', release: true } }],
    ready: '.lu-slot[data-slot="MF2"][data-pid="ch_cat_trickster"]',
    expect: { screen: "setup", modal: false },
  },
  {
    // 빨강에 놓기: 미르카 → GK (적성 -) → 흔들림 + 안내 토스트, 변경 없음 (ready = GK 는 그대로 네리아)
    name: "og_setup_reject",
    title: "편성 빨강 자리에 놓기 — 미르카를 GK 에 놓음 → 거절 (흔들림 · 토스트, GK 네리아 그대로)",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 미르카 → GK 놓기" }),
    steps: [{ text: "새 런 시작" }, { drag: { from: '.lu-card[data-pid="ch_cat_trickster"]', to: '.lu-slot[data-slot="GK"]', release: true, waitMs: 120 } }],
    ready: '.lu-slot[data-slot="GK"][data-pid="ch_spirit_keeper"].lu-shake',
    expect: { screen: "setup", modal: false },
  },
  {
    name: "og_training",
    title: "첫 훈련 턴 — 이벤트 모달 없음 (시작 이벤트가 있으면 0번으로 처리)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_training", data, { runSeed, require: (s, { phase }) => phase === "turn" }),
    ready: ".slot-row",
    expect: { screen: "run", phase: "turn", modal: false },
  },
  {
    name: "og_training_mid",
    title: "시즌 2 후반 훈련 턴 — SP · 스킬 상점 · 우정 훈련(★) · 힌트(💡) · 체력 차이",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_training_mid", data, { runSeed, ...MID_TURN }),
    ready: ".slot-row",
    expect: { screen: "run", phase: "turn", modal: false },
  },
  {
    name: "og_train_sheet",
    title: "훈련 상세 하단 시트 — og_training_mid 에서 추천 칸 탭",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_train_sheet", data, { runSeed, ...MID_TURN }),
    steps: [{ click: ".slot-row.recommended" }],
    ready: "#modal-root .sheet",
    expect: { screen: "run", phase: "turn", modal: ".sheet" },
  },
  {
    name: "og_meeting",
    title: "전술 미팅 모달 — 전술 · 포메이션 · 스킬 상점, 첫 스킬 [구매] 선택 (og_training_mid + SP 200 주입)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_meeting", data, { runSeed, ...MID_TURN });
      b.runState.skillPoints = 200; // 상점 스킬을 살 수 있게 (구매 · 배울 선수 선택 모양)
      return { ...b, summary: `${describeRun(b.runState, data)} (SP 200 주입)` };
    },
    steps: [{ text: "미팅$" }, { text: "^구매$" }],
    ready: "#modal-root .modal select",
    expect: { screen: "run", phase: "turn", modal: ".modal" },
  },
  {
    // 미팅 라인업 보드: DF1 돌바르(GK B · DF A · MF C · FW -)를 끌어 FW1 위에 — FW 빨강(적성 없음) · GK/DF/MF 초록(맞바꾸기) · 누른 채 캡처
    name: "og_meeting_drag",
    title: "전술 미팅 드래그 중 — 돌바르(DF1)를 FW1 위로: FW 빨강 · 나머지 초록(⇄ 맞바꾸기), 고스트",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_meeting_drag", data, { runSeed, ...MID_TURN }),
    steps: [{ text: "미팅$" }, { drag: { from: '#modal-root .lu-slot[data-slot="DF1"]', to: '#modal-root .lu-slot[data-slot="FW1"]' } }],
    ready: ".lu-ghost",
    expect: { screen: "run", phase: "turn", modal: ".modal" },
  },
  {
    // 미팅 놓기: DF1 돌바르 → GK (네리아와 맞바꾸기: 네리아 DF C 가능) — ready = GK 에 돌바르(p2), DF1 에 네리아(p1) (기본 편성 선수 id = 슬롯 순서)
    name: "og_meeting_drop",
    title: "전술 미팅 드래그 놓기 — 돌바르를 GK 에 놓음 → 네리아 DF1 (맞바꾸기)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_meeting_drop", data, { runSeed, ...MID_TURN }),
    steps: [{ text: "미팅$" }, { drag: { from: '#modal-root .lu-slot[data-slot="DF1"]', to: '#modal-root .lu-slot[data-slot="GK"]', release: true } }],
    ready: '#modal-root .lu-slot[data-slot="GK"][data-pid="p2"] ~ .lu-slot[data-slot="DF1"][data-pid="p1"]',
    expect: { screen: "run", phase: "turn", modal: ".modal" },
  },
  {
    name: "og_event",
    title: "이벤트 모달 — 서포트 이벤트, 선택지 2개 (배경 = 훈련 화면)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_event", data, {
      runSeed,
      require: (s, { phase }) => phase === "event",
      prefer: (s, { data: d }) => { const ev = run.getEventView(s, d); return !!ev.support && ev.choices.length >= 2; },
    }),
    ready: "#modal-root .choice-btn",
    expect: { screen: "run", phase: "event", modal: ".modal" },
  },
  {
    name: "og_relic",
    title: "유물 선택 모달 (배경 = 훈련 화면)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_relic", data, { runSeed, require: (s, { phase }) => phase === "relic" }),
    ready: "#modal-root .relic-card",
    expect: { screen: "run", phase: "relic", modal: ".modal" },
  },
  {
    name: "og_route",
    title: "시즌 종료 — 이번 시즌 경계전 결과 · 다음 시즌 루트 선택",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_route", data, { runSeed, require: (s, { phase }) => phase === "route" }),
    ready: ".route-card",
    expect: { screen: "run", phase: "route", modal: false },
  },
  {
    name: "og_result",
    title: "런 결과 화면 — 완주한 런의 최종 평가 · 선수 · seed",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_result", data, { runSeed, require: (s, { phase }) => phase === "finished" }),
    ready: ".result-hero",
    expect: { screen: "run", phase: "finished", modal: false },
  },
];
SCENARIOS.push(...OUTGAME_SCENARIOS);
