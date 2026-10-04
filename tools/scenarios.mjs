// tools/scenarios.mjs — tools/shot.mjs 가 쓰는 Node 측 상태 준비 (ARCHITECTURE §12.4)
// 엔진(js/engine/lessonRun.js · manager.js · match.js)만으로 원하는 경기 상황 · 런 단계를 찾아 run/match 상태 JSON 을 만든다.
// 카드 레슨 시험판(LESSON_PROTO_PLAN §10.2): 런은 모두 레슨 런(kind "lessonRun") — 감독 AI 로 걷는다 (tools/lesson_scenarios.mjs).
// UI 코드에 의존하지 않는다 → UI 가 바뀌어도 같은 상태를 주입할 수 있다.
//
//   const data = loadData();
//   const found = buildScenarioState(data, SCENARIOS[0], { runSeed: 1 });
//   // found = { runState, matchState, teams, seed, steps, preferred, summary }
//
// 시나리오 추가: 아래 SCENARIOS 배열에 객체 하나. name 이 파일 이름(<name>.png)이자 --only 접두어.
//   경기 시나리오 (01_… ~): 이 머리말의 형식. 아웃게임 시나리오 (og_…): 파일 아래 "아웃게임 시나리오" 머리말 참고.
//
// 경기 시나리오 = { name, title, matchKind, auto, viewport?, speed?, adjustRun?(runState, data), adjustSetup?(setup, data), require(s, ctx), prefer?(s, ctx), interact?, verify? }
//   viewport: 기본(1280×720 DPR 1 — 고정 스테이지 1배)이 아닌 창 크기로 찍을 때 { width, height, deviceScaleFactor, isMobile, hasTouch }
//   adjustRun: 경기 직전 런 상태를 고친다 (예: 부상 주입) — 그 뒤 lessonRun.getMatchSetup 으로 스냅샷을 만든다, 결정적
//   adjustSetup: 경기 스냅샷을 만들기 전에 고친다 (예: 상대에게 간파 사용권) — 복제본에 적용, 결정적
//   adjustMatch(ms, data): 경기를 만든 직후 상태를 고친다 (예: GK 필살 게이지 가득) — seed 마다 같게, 결정적
//   drive(ms, data): 탐색 중 사람(home) 결정을 대신 고른다 → decision | null (null = 우리 AI) — 결정적
//   slots: 기본 편성의 자리를 다른 캐릭터로 바꾼 레슨 런 (§19 새 8명 — 예 { FW1: "ch_spirit_striker" }, SQUAD_A)
//   maxSeeds: 찾을 경기 seed 수 (기본 400)
//   require : 반드시 만족해야 하는 조건 (캡처 시점 상태 확인에도 쓴다)
//   prefer  : 가능하면 만족시킬 조건 (없으면 require 만 만족하는 첫 상태로 대체)
//   interact: 브라우저에서 할 조작 — { type: "hover", actions: [...] } | { type: "click", action, waitMs }
//             | { type: "steps", steps: [{ click: "css 선택자" } | { hover: [액션…] } | { press: 액션, waitMs } | { wait: ms }] }
//   verify  : interact 뒤 상태 확인 (prev = 주입한 상태, live = 캡처 시점 상태) → true | "이유"
//   allowInnerScroll: 의도한 안쪽 스크롤 요소 이름 정규식 (shot.mjs 요약 검사에서 뺀다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/lessonRun.js"; // = 앱의 ctx.run (getMatchSetup 등은 run.js 를 그대로 다시 내보낸다)
import * as match from "../js/engine/match.js";
import * as challenge from "../js/engine/challenge.js";
import { KEYS } from "../js/ui/store.js";
import { LESSON_OG_SCENARIOS, prepareLessonMatch, lessonRegisteredTeam } from "./lesson_scenarios.mjs";

export { run, match, challenge };
export const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_FILES = ["config", "characters", "supports", "skills", "events", "relics", "opponents", "routes", "cards", "lesson", "policies"];
const OPTIONAL_FILES = ["traits", "combos", "challenge", "challenge_sample_team"]; // v0.3 (없으면 엔진 기본값) · 도전 모드 (og_challenge*)

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
/* 런 준비: 기본 편성 레슨 런 → 원하는 종류의 경기 직전(phase "match")까지       */
/* ------------------------------------------------------------------ */

/**
 * 레슨 런을 감독 AI 로 걸어 경기 직전까지 (tools/lesson_scenarios.mjs prepareLessonMatch).
 * friendly = 친선전이 열린 첫 자유 주(시즌 1 2주 또는 4주), goal = 첫 경계전.
 * @param {object} data
 * @param {{ runSeed?: string|number, kind?: "friendly"|"goal", maxSteps?: number }} opts
 * @returns {object} 레슨 RunState (phase "match", pendingMatch.kind === kind)
 */
export function prepareRun(data, { runSeed = 1, kind = "friendly", maxSteps, slots } = {}) {
  return prepareLessonMatch(data, { runSeed, kind, maxSteps, slots });
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
    if (scenario.adjustMatch) scenario.adjustMatch(ms, data); // 경기 시작 상태 주입 (예: GK 게이지 가득) — 결정적
    for (let steps = 0; steps <= maxSteps; steps++) {
      if (scenario.require(ms, ctx)) {
        if (!scenario.prefer || scenario.prefer(ms, ctx)) return { seed, steps, matchState: clone(ms), preferred: true };
        if (!fallback) fallback = { seed, steps, matchState: clone(ms), preferred: false };
      }
      if (ms.finished) break;
      // drive: 사람(home) 결정을 대신 고른다 (null = 우리 AI) — 합체기 짝처럼 AI 가 거의 만들지 않는 장면용, 결정적
      match.step(ms, data, scenario.drive ? scenario.drive(ms, data) ?? null : null);
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
    return {
      seed: runSeed, steps: b.steps ?? 0, preferred: b.preferred !== false, matchState: null, teams: b.teams ?? null, runState: b.runState ?? null,
      storage: b.storage ?? null, summary: b.summary, info: b.info ?? null, // info: 조작 단계 함수(steps(prepared))가 쓰는 값
    };
  }
  const runState = prepareRun(data, { runSeed, kind: scenario.matchKind || "friendly", slots: scenario.slots });
  if (scenario.adjustRun) scenario.adjustRun(runState, data); // 런 상태 주입 (예: 부상 — 28_injured_plays), 결정적
  const found = findMatchState(data, runState, scenario, { maxSeeds: maxSeeds ?? scenario.maxSeeds, maxSteps });
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

/** 28_injured_plays: 주입한 부상 선수 (adjustRun 이 채운다 — 캡처 시점 require 도 같은 값을 본다) */
const INJURED = { id: null };

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
    title: "울리카(크로서) ③ 크로스 가능한 결정 — 공격 2×2, 크로스 받는 선수 후보 2명 박스에 (크로스 hover = 포물선)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "home", 2) && needs(s, "attack") && carrierOf(s)?.trait === "crosser" && !!viewOf(s, data).receivers?.cross,
    prefer: (s, { data }) => viewOf(s, data).receivers.cross.candidates.length >= 2 && s.possession >= 2,
    interact: { type: "hover", actions: ["cross", "pass"] },
  },
  {
    name: "09_combo_ready",
    title: "합체기 준비 — 바람의 실을 받은 그레타, 스킬 줄 '💥 바람의 유성' 토글 + 슛 hover",
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
      // §19 E1: 받는 선수 기본값이 등록된 합체기 짝일 때 (16명 모두 필살기라 "필살기 보유"만으로는 합체기 상대가 아니다)
      const v = viewOf(s, data);
      const u = ultOption(v);
      const rid = v.receivers?.pass?.ultimateDefaultId;
      const r = rid ? v.players.home.find((p) => p.id === rid) : null;
      return !!(u && r && r.ultimateSkillId && (data.combos || []).some((c) => c.a === u.skillId && c.b === r.ultimateSkillId));
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
    allowInnerScroll: /skill-row/, // 스킬 묶음 상자 안 스크롤은 의도 (shot.mjs 요약 검사에서 뺀다)
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
    title: "④ 박스 연결 결정 — 슛 · 컷백 패스 · 센터링(크로서 울리카) 버튼, 받는 선수 후보는 박스 안 (자동 끔, 컷백 hover)",
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
    title: "에이스의 외침 — 우리 공격 결정, 받으면 필살 슛이 준비되는 그레타 '줘!' · 금색 점선 · 배지 (자동 끔, hover 없음)",
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
    title: "필살기 차지 중간 프레임 — 메테오 슛 토글 + 슛 클릭 150ms 뒤 (1x): 필드 흑백 · 그레타 빛남 · 상대 GK/수비만 색",
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
    // 합체기(바람의 유성)가 아닌 혼자 쓰는 필살 슛만 — 합체기는 컷인이 둘이라 2.85초에 아직 이름 카드다.
    // 레슨 런 팀은 실루엔 게이지가 자주 함께 차서 합체기가 되므로 실루엔의 바람의 실을 뺀다 (adjustSetup)
    adjustSetup: (setup) => {
      for (const p of setup.home.players) p.skillIds = (p.skillIds || []).filter((id) => id !== "sk_wind_thread");
    },
    maxSeeds: 1000, // 레슨 런 첫 친선전에서는 seed 465 에서 처음 나온다
    require: (s, { data }) => atk(s, "home", 2) && needs(s, "attack") && (() => {
      const u = ultOption(viewOf(s, data));
      return !!u && u.type === "shot" && !u.comboName;
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
  {
    // §18.1 부상은 레슨에만: 시즌 1 경계전 직전 DF2(players[2]) 에 레슨 결장 2 를 주입 — 경기에는 본인이 그대로 나온다
    // (유스 없음 · 스탯 · 스킬 그대로). 우리 빌드업(① 우리 진영) 자동 진행 장면.
    name: "28_injured_plays",
    title: "부상 선수 경기 출전 — DF2 레슨 결장 2 주입, 경계전에 본인 출전 (유스 없음, §18.1)",
    matchKind: "goal",
    auto: true,
    adjustRun: (rs) => {
      const p = rs.players[2];
      p.injuredTurns = 2;
      INJURED.id = p.id;
    },
    require: (s) => isDuel(s) && s.attackingSide === "home" && s.home.players.length === 7 &&
      !s.home.players.some((p) => p.isYouth) && (!INJURED.id || s.home.players.some((p) => p.id === INJURED.id)),
  },
  // ---- §19 (K4) 새 필살기 종류 · 등급별 컷인 · 대사 · 합체기 이름 · 확정 배급 ----
  {
    // E2 필살 수비: ③ 우리 최종 수비 라인(상대 line 2)에서 도르비나 '✨ 산맥 쐐기' 토글 → 수비 3종 모두 켜짐, 기대 % 에 ×1.6
    name: "29_ult_defense",
    title: "필살 수비 — 도르비나 '✨ 산맥 쐐기' 토글, 상대 파이널 서드 수비 결정 (태클 hover: 버튼 · 기대 % · 칩)",
    matchKind: "friendly",
    auto: false,
    require: (s, { data }) => atk(s, "away", 2) && needs(s, "defense") && ultOption(viewOf(s, data))?.type === "defense",
    prefer: (s) => s.possession >= 2,
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 150 }, { hover: ["tackle"] }] },
  },
  {
    // E3 팀 필살기 + E5 R 짧은 컷인: 아델린(DF2) 빌드업 공 · '불꽃 호령' 토글 + 패스 → 차지 0.2 + 컷인 0.6초 (경기 첫 필살기)
    // / 0.15 + 0.5초 (그 뒤) — 480ms 뒤는 두 경우 모두 컷인 한가운데
    name: "30_ult_team_cutin",
    title: "팀 필살기 R 컷인 — 아델린 '불꽃 호령' 토글 + 패스 480ms 뒤 (1x): 짧은 띠 · 종류 칩 '필살 호령' · 대사 한 줄",
    matchKind: "friendly",
    auto: false,
    // 빌드업 공은 패스가 가장 높은 DF(도르비나) → 킥오프 선수 전술로 아델린 (엔진 pickStarter tactics.kickoffPlayerId)
    adjustSetup: (setup) => { setup.home.tactics = { ...(setup.home.tactics || {}), kickoffPlayerId: setup.home.players.find((p) => p.charId === "ch_human_captain")?.id }; },
    // 빌드업 공을 잡을 때 게이지가 차 있는 일이 드물다 → 경기 시작 때 아델린 게이지 가득 (우리 AI 는 지고 있을 때만 쓴다)
    adjustMatch: (ms) => {
      const p = ms.home.players.find((x) => x.charId === "ch_human_captain");
      if (p && ms.home.live?.[p.id]) ms.home.live[p.id].gauge = 100;
    },
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && actionEnabled(s, data, "pass") &&
      ultOption(viewOf(s, data))?.type === "team",
    prefer: (s) => !s.events.some((e) => e.type === "cutin"),
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "pass", waitMs: 480 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "cutin" && e.ultimateType === "team" && e.tier === "R" && e.line)
        ? true
        : `팀 필살기 R 컷인 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // E4 필살 드리블 extraLine: 코니(DF1 — 기본 편성의 도르비나 자리) 빌드업 공 '달토끼 도약' 토글 → 드리블 화살표가 ① → ③ (두 구역 전진)
    name: "31_ult_dribble_extra",
    title: "필살 드리블 — 코니 '✨ 달토끼 도약' 토글, 빌드업 드리블 hover: 화살표 ① → ③ '두 구역 전진' (기본 편성 DF1 = 코니)",
    matchKind: "friendly",
    auto: false,
    slots: { DF1: "ch_rabbit_fullback" },
    prefer: (s) => s.possession >= 2 && !(s.lastAttack && s.lastAttack.possession === s.possession),
    // 빌드업 공은 패스가 가장 높은 DF(아델린) → 킥오프 선수 전술로 코니
    adjustSetup: (setup) => { setup.home.tactics = { ...(setup.home.tactics || {}), kickoffPlayerId: setup.home.players.find((p) => p.charId === "ch_rabbit_fullback")?.id }; },
    require: (s, { data }) => atk(s, "home", 0) && needs(s, "attack") && carrierOf(s)?.charId === "ch_rabbit_fullback" &&
      ultOption(viewOf(s, data))?.type === "dribble",
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 150 }, { hover: ["dribble"] }] },
  },
  {
    // E1 합체기 (등록된 짝): 실루엔 바람의 실 → 브론테 낙뢰 = 풍뢰일섬 — 13 과 같은 시점 (차지 → 두 컷인 → 이름 카드 한가운데 2.8초)
    name: "32_combo_thunder",
    title: "합체기 '풍뢰일섬' — 실루엔 바람의 실을 받은 브론테 낙뢰 (슛 클릭 2.8초 뒤 이름 카드 · 두 이름, 기본 편성 FW1 = 브론테)",
    matchKind: "friendly",
    auto: false,
    slots: { FW1: "ch_spirit_striker" },
    // 우리 AI 는 실루엔이 ② 에서 박스로 패스할 일이 드물다 → 탐색 중 실루엔 공이면 ② 드리블, ③ 이면 바람의 실 패스 → 브론테 (박스)
    drive: (s, data) => {
      if (!isDuel(s) || s.attackingSide !== "home" || !needs(s, "attack") || carrierOf(s)?.charId !== "ch_elf_playmaker") return null;
      if (s.ball.lineIndex === 1 && actionEnabled(s, data, "dribble")) return { action: "dribble" };
      const v = viewOf(s, data);
      const u = ultOption(v);
      const bronte = s.home.players.find((p) => p.charId === "ch_spirit_striker")?.id;
      if (s.ball.lineIndex === 2 && u?.skillId === "sk_wind_thread" && v.receivers?.pass?.candidates?.includes(bronte)) {
        return { action: "pass", ultimate: true, receiverId: bronte };
      }
      return null;
    },
    maxSeeds: 1000,
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && needs(s, "attack") && comboOption(viewOf(s, data))?.comboName === "풍뢰일섬",
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "shoot", waitMs: 2800 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "combo" && e.name === "풍뢰일섬") ? true : `풍뢰일섬 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // §19.3-10 확정 배급: 헤르타(GK) 대지의 손바닥 세이브 뒤 배급 결정 — 롱패스 카드 % 칸 "확정 (대지의 손바닥)", 실패 줄 없음 (롱패스 hover)
    name: "33_save_sure_dist",
    title: "확정 배급 — 헤르타 '대지의 손바닥' 세이브 뒤 GK 배급 결정: 롱패스 '확정 (대지의 손바닥)' (기본 편성 GK = 헤르타, 롱패스 hover)",
    matchKind: "friendly",
    auto: false,
    slots: { GK: "ch_giant_keeper" },
    // GK 는 게이지가 거의 차지 않는다 (듀얼 승이 드묾) → 경기 시작 때 헤르타 게이지 가득 (AI 는 동점 · 열세면 필살 세이브)
    adjustMatch: (ms) => {
      const gk = ms.home.players.find((p) => p.position === "GK");
      if (gk && ms.home.live?.[gk.id]) ms.home.live[gk.id].gauge = 100;
    },
    require: (s, { data }) => isDistribution(s) && needs(s, "distribution") && !!viewOf(s, data).distribution?.sure,
    interact: { type: "hover", actions: ["long"] },
  },
  {
    // E5 SR 컷인: 온디나(MF1 — 실루엔 자리) '급류' 토글 + 드리블 → 차지 0.3 + 컷인 0.8초 (첫) / 0.25 + 0.7초 — 650ms 뒤
    name: "34_cutin_sr_line",
    title: "SR 컷인 — 온디나 '급류' 토글 + 드리블 650ms 뒤 (1x): 중간 띠 · 종류 칩 '필살 드리블' · 대사 (기본 편성 MF1 = 온디나)",
    matchKind: "friendly",
    auto: false,
    slots: { MF1: "ch_spirit_dribbler" }, // 중원 시작 공 = 드리블 + 패스가 가장 높은 MF → 실루엔 자리에 온디나
    require: (s, { data }) => isDuel(s) && s.attackingSide === "home" && s.ball.lineIndex <= 2 && needs(s, "attack") &&
      carrierOf(s)?.charId === "ch_spirit_dribbler" && ultOption(viewOf(s, data))?.type === "dribble",
    prefer: (s) => !s.events.some((e) => e.type === "cutin"),
    interact: { type: "steps", steps: [{ click: ".skill-row .ult-btn:not(:disabled)" }, { wait: 120 }, { press: "dribble", waitMs: 650 }] },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "cutin" && e.skillId === "sk_rapids" && e.tier === "SR" && e.line)
        ? true
        : `급류 SR 컷인 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
  {
    // 34 의 상대 쪽 판 (.cut.side-away — 오른쪽에서 들어오는 띠): 상대 MF 에게 급류 주입. 우리 결정 뒤 상대 AI 가 다음 듀얼에서
    // 급류를 먼저 커밋 → 결과 한 줄 뒤 컷인 (판정 비트 뒤 컷인). 캡처 시점 = 액션 0.8 (+ 공 뺏김 멈춤 0.25) + 재배치 0.65 + 결과 0.95
    // + SR 차지 0.3 (첫 필살기) / 0.25 + 컷인 절반 0.4 / 0.35 — awayRapidsPlan 이 누를 액션과 대기 시간을 함께 계산한다
    name: "34_cutin_sr_line_away",
    title: "SR 컷인 (상대) — 상대 MF '급류' (주입): 우리 결정 뒤 상대 AI 가 커밋한 컷인 (판정 결과 뒤 컷인 한가운데, 1x)",
    matchKind: "friendly",
    auto: false,
    adjustSetup: (setup) => {
      for (const p of setup.away.players) if (p.position === "MF") p.skillIds = [...new Set([...(p.skillIds || []), "sk_rapids"])];
    },
    require: (s, { data }) => !!awayRapidsPlan(s, data),
    interact: {
      type: "steps",
      steps: [{ press: (ms, data) => awayRapidsPlan(ms, data)?.action, waitMs: (ms, data) => awayRapidsPlan(ms, data)?.waitMs ?? 3100 }],
    },
    verify: (prev, live) => {
      if (!live) return "캡처 시점 경기 상태를 읽지 못함";
      const fresh = (live.events || []).slice((prev.events || []).length);
      return fresh.some((e) => e.type === "cutin" && e.side === "away" && e.skillId === "sk_rapids")
        ? true
        : `상대 급류 컷인 이벤트 없음 (${fresh.map((e) => e.type).join(",") || "-"})`;
    },
  },
];

/**
 * 34_cutin_sr_line_away: 우리 결정(공격 드리블 · 패스 / 수비 태클 · 인터셉트 · 버티기 — 필살기 없이) 하나로 판정 비트가 공 뺏김 · 돌파
 * (골 · 세이브 · 역방향 컷인 없음)이고, 그 뒤 컷인이 상대 급류 하나뿐인 첫 액션 → { action, waitMs } | null.
 * waitMs = screens/match.js 연출 길이 (T · CUT_TIER SR)로 계산한 컷인 한가운데 (1x).
 */
function awayRapidsPlan(s, data) {
  if (!isDuel(s) || s.ball.lineIndex > 2) return null;
  const role = s.attackingSide === "home" ? "attack" : "defense";
  if (!needs(s, role)) return null;
  const firstCut = !s.events.some((e) => e.type === "cutin");
  for (const action of role === "attack" ? ["dribble", "pass"] : ["tackle", "intercept", "hold"]) {
    if (!actionEnabled(s, data, action)) continue;
    const { events } = tryDecision(s, data, { action });
    const i = events.findIndex((e) => ["duel", "turnover", "save", "goal"].includes(e.type));
    if (i < 0 || !["duel", "turnover"].includes(events[i].type) || events[i].reverseCutin) continue;
    if (events.slice(0, i).some((e) => e.type === "cutin" || e.type === "combo")) continue;
    const cuts = events.slice(i + 1).filter((e) => e.type === "cutin" || e.type === "combo");
    if (cuts.length !== 1 || cuts[0].side !== "away" || cuts[0].skillId !== "sk_rapids") continue;
    const hold = events[i].type === "turnover" ? 250 : 0;
    const waitMs = 800 + hold + 650 + 950 + (firstCut ? 300 + 400 : 250 + 350);
    return { action, waitMs };
  }
  return null;
}

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
// 아웃게임 시나리오 = { name: "og_…", title, outgame: true, build(data, { runSeed }), steps?, ready, expect, viewport?, query? }
//   build(data, { runSeed }) → { runState | null, teams?, storage?, summary, steps?, preferred?, info? }
//     runState: 주입할 레슨 런 (KEYS.run). null = 저장된 런 없음 → 시작 화면. teams = 등록 팀 목록 (KEYS.teams)
//              레슨판(js/ui/store.js loadRun)은 레슨 런(kind "lessonRun")만 이어하기로 연다
//     storage: 그 밖의 localStorage { 키: 값 } (도전 모드 KEYS.challenge 진행 · KEYS.challengeMatch 진행 중 경기 — 부트는 시작 화면,
//              [도전 모드](이어하기) 를 눌러야 그 경기로 간다)
//     info: 조작 단계 함수 steps(prepared) 가 쓰는 값 (예: 누를 카드 uid)
//   진입: runState 가 있으면 시작 화면 "이어하기" 클릭 → steps 순서대로 → ready 선택자가 보일 때까지 기다린 뒤 캡처
//   steps: 배열 또는 (prepared) => 배열. [{ click: "css 선택자" } | { text: "버튼 글자 정규식" } | { wait: ms } | { freeze: bool } |
//           { drag: { from: "css", to: "css", release?: false, steps?, waitMs? } }]  — drag: 실제 마우스로 끌기 (release 가 아니면 누른 채 캡처, tools/shot.mjs dragStep)
//   expect: 캡처 시점 확인 { screen: "start"|"setup"|"run"|"challenge"|"challengeMatch", phase?: run phase, modal?: true | false | "css" (#modal-root 안) }
//   query: URL 파라미터 (예: 레슨 { autolesson: 1 })
//   레슨 런 상태는 tools/lesson_scenarios.mjs walkLesson (감독 AI 로 걷다가 조건을 만족하는 첫 상태) → 같은 runSeed 면 같은 상태.

/** 새 편성 A (LESSON_PROTO_PLAN §19.16 — 2-2-2, 모두 적성 A) */
export const SQUAD_A = {
  GK: "ch_giant_keeper", DF1: "ch_elf_regista", DF2: "ch_rabbit_fullback", MF1: "ch_spirit_dribbler", MF2: "ch_elf_archer", FW1: "ch_spirit_striker", FW2: "ch_human_header",
};

/** 등록 팀 (완주한 레슨 런 — 방침을 달리해 두 팀이 서로 다르게) */
const registeredTeam = (data, runSeed, registeredAt, policy) => lessonRegisteredTeam(data, runSeed, registeredAt, policy);

export const OUTGAME_SCENARIOS = [
  {
    name: "og_start",
    title: "시작 화면 — 저장된 런 없음, 등록 팀 2개 (감독 AI 로 완주한 레슨 런 — 역습형 · 팀형)",
    outgame: true,
    build: (data, { runSeed }) => {
      const teams = [
        registeredTeam(data, `${runSeed}-b`, "2026-09-28T10:00:00.000Z", "counter"),
        registeredTeam(data, runSeed, "2026-09-27T10:00:00.000Z", "team"),
      ];
      return { runState: null, teams, summary: `저장된 런 없음 · 등록 팀 ${teams.map((t) => `${t.grade}(${t.seed})`).join(", ")}` };
    },
    ready: ".hero",
    expect: { screen: "start", modal: false },
  },
  {
    name: "og_setup",
    title: "편성 화면 — 새 런 시작 (기본 편성 · 코치 6장 · 훈련 방침 5버튼)",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작]" }),
    steps: [{ text: "새 런 시작" }],
    ready: ".setup-policy .policy-row",
    expect: { screen: "setup", modal: false },
  },
  {
    // 라인업 보드 (js/ui/lineup.js): 벤치 미르카(GK - · DF - · MF A · FW B)를 끌어 MF2(타리아) 위에 — 누른 채 캡처
    name: "og_setup_drag",
    title: "편성 드래그 중 — 벤치 미르카를 MF2 위로: GK·DF 빨강(적성 없음) · MF·FW 초록(적성 표시), 고스트",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 미르카 카드 끌기" }),
    steps: [{ text: "새 런 시작" }, { drag: { from: '.lu-card[data-pid="ch_cat_trickster"]', to: '.lu-slot[data-slot="MF2"]' } }],
    ready: ".lu-ghost",
    expect: { screen: "setup", modal: false },
  },
  {
    // 놓기 확인 (--width/--height 를 바꿔 배율이 달라도 같은 자리에 놓이는지): 미르카 → MF2, 타리아는 벤치로
    name: "og_setup_drop",
    title: "편성 드래그 놓기 — 미르카를 MF2 에 놓음 → 타리아 벤치 (ready = MF2 에 미르카)",
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
  // ---- 16명 편성 (LESSON_PROTO_PLAN §19.14 ①, K3): 선수 풀 2줄 × 8장 · 필살기 칩 · 고르기 모달 4열 · 주장 2명 칩 ----
  {
    // 새 편성 A (GK 헤르타 · DF 나엘리스 · 코니 · MF 온디나 · 리시엘 · FW 브론테 · 카밀라)를 벤치 카드 7장을 끌어 만든다 → 벤치 = 옛 8명 + 힐디 (레어도 순)
    name: "og_setup16",
    title: "편성 16명 — 새 편성 A 를 끌어 놓기 7번으로: 필드 7 (슬롯 순서) · 벤치 9 (SSR → SR → R) · 필살기 칩",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 새 편성 A 끌어 놓기 7번" }),
    steps: [{ text: "새 런 시작" }, ...Object.entries(SQUAD_A).map(([slot, cid]) => ({ drag: { from: `.lu-card[data-pid="${cid}"]`, to: `.lu-slot[data-slot="${slot}"]`, release: true } }))],
    ready: Object.entries(SQUAD_A).map(([slot, cid]) => `.lu-slot[data-slot="${slot}"][data-pid="${cid}"]`).join(" ~ "),
    expect: { screen: "setup", modal: false },
  },
  {
    // 1-3-2 (MF 3장이 필드 높이 안에) — 기본 편성에서 포메이션만 바꿈 (MF3 = 그레타 C → 적성 경고)
    name: "og_setup16_132",
    title: "편성 16명 — 포메이션 1-3-2: MF 3장 · 필드 슬롯 · 선수 풀 2줄",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 포메이션 1-3-2" }),
    steps: [{ text: "새 런 시작" }, { select: { sel: ".formation-sel select", value: "1-3-2" } }],
    ready: '.lu-slot[data-slot="MF3"]',
    expect: { screen: "setup", modal: false },
  },
  {
    // 슬롯 누르기 → 선수 고르기 모달 16명 (4열 × 4줄, 그 슬롯 적성 순 · 빨강 비활성 · 필살기 칩)
    name: "og_setup_pick",
    title: "편성 — MF1 슬롯 누르기 → 선수 고르기 모달 16명 (4열 × 4줄 · 스크롤 없음)",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → MF1 슬롯 누르기" }),
    steps: [{ text: "새 런 시작" }, { click: '.lu-slot[data-slot="MF1"]' }],
    ready: "#modal-root .pick-grid.cols-4 .char-pick",
    expect: { screen: "setup", modal: ".setup-pick" },
  },
  {
    // GK 헤르타(주장) + DF2 아델린(주장) → 공명 줄에 "주장 2명 — 팀워크 +10은 1명분" (L46). 네리아는 벤치
    name: "og_setup_captain2",
    title: "편성 — 주장 2명 (GK 헤르타 + 아델린): 공명 줄 주장 칩",
    outgame: true,
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] → 헤르타 → GK" }),
    steps: [{ text: "새 런 시작" }, { drag: { from: '.lu-card[data-pid="ch_giant_keeper"]', to: '.lu-slot[data-slot="GK"]', release: true } }],
    ready: ".setup-pitch .resonance .cap-note",
    expect: { screen: "setup", modal: false },
  },
  {
    // 터치 기기 915×412 (가로 폰): 무대가 통째로 줄어도 16명 풀 2줄 · 필드 · 옆 칸이 잘리지 않는다
    name: "og_setup16_touch",
    title: "편성 16명 — 터치 915×412 (무대 축소 · 잘림 · 스크롤 없음)",
    outgame: true,
    viewport: { width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    build: () => ({ runState: null, summary: "저장된 런 없음 → [새 런 시작] (터치)" }),
    steps: [{ tap: "button.btn-primary.btn-lg" }],
    ready: ".setup-policy .policy-row",
    expect: { screen: "setup", modal: false },
  },
  // ---- 도전 모드 (2026-10-01, js/ui/screens/challenge.js) ----
  {
    name: "og_challenge",
    title: "도전 모드 — 등록 팀 2개, 첫 팀 1~3단계 클리어 · 4단계 2패 · 5~10단계 잠김, 4단계 미리보기",
    outgame: true,
    build: (data, { runSeed }) => {
      const teams = [
        registeredTeam(data, `${runSeed}-b`, "2026-09-28T10:00:00.000Z", "counter"),
        registeredTeam(data, runSeed, "2026-09-27T10:00:00.000Z", "team"),
      ];
      const id = challenge.teamIdOf(teams[0]);
      const plays = [[1, true, 2, 0], [2, false, 1, 2], [2, true, 3, 1], [3, true, 1, 0], [4, false, 0, 1], [4, false, 1, 2]];
      const progress = recordPlays(challenge.emptyProgress(), id, plays);
      return {
        runState: null,
        teams,
        storage: { [KEYS.challenge]: progress },
        summary: `등록 팀 ${teams.map((t) => `${t.grade}(${t.seed})`).join(", ")} · 첫 팀(${id}) 클리어 ${challenge.teamProgress(progress, id).cleared}단계`,
      };
    },
    steps: [{ text: "도전 모드" }, { click: '.ch-stage[data-stage="4"]' }],
    ready: '.ch-stage.sel[data-stage="4"]',
    expect: { screen: "challenge", modal: false },
  },
  {
    name: "og_challenge_sample",
    title: "도전 모드 — 등록 팀 없음 → 테스트용 샘플 팀, 1단계만 열림",
    outgame: true,
    build: () => ({ runState: null, teams: [], summary: "등록 팀 없음 · 진행 기록 없음 → 샘플 팀" }),
    steps: [{ text: "도전 모드" }],
    ready: ".ch-ladder .ch-stage",
    expect: { screen: "challenge", modal: false },
  },
  {
    // 진행 중인 도전 경기(샘플 팀 3단계 1회차, 막 시작)를 주입 → 시작 화면 [도전 모드 — 이어하기] (부트는 늘 시작 화면)
    name: "og_challenge_resume",
    title: "시작 화면 — 진행 중인 도전 경기 저장됨 → [도전 모드 — 이어하기] (3단계 1회차)",
    outgame: true,
    build: (data) => challengeInProgress(data, 3),
    ready: ".start-menu .challenge-btn.resume",
    expect: { screen: "start", modal: false },
  },
  {
    // 같은 저장본 → [도전 모드 — 이어하기] → 도전 경기 화면 (오른쪽 위 [나가기] [포기], 헤더 "도전 3단계")
    name: "og_challenge_match",
    title: "도전 경기 화면 — 이어하기로 복원, 오른쪽 위 [나가기] [포기] (수동)",
    outgame: true,
    auto: false,
    build: (data) => challengeInProgress(data, 3),
    steps: [{ text: "도전 모드" }],
    ready: ".match-screen .m-exits",
    expect: { screen: "challengeMatch", modal: false },
  },
  {
    // 진행 중인 도전 경기(끝난 경기 — 샘플 팀이 이긴 2단계)를 주입 → [도전 모드] 가 그 경기로 → 결과 모달 [확인] → 도전 결과 모달 (기록 1회)
    name: "og_challenge_result",
    title: "도전 결과 — 샘플 팀 2단계 승리 ([도전 모드 — 이어하기] 복원 → 경기 결과 [확인] → 도전 결과 모달: 다음 단계 · 다시 도전 · 도전 목록)",
    outgame: true,
    build: (data) => {
      const team = challenge.sampleTeam(data);
      if (!team) throw new Error("[og_challenge_result] data/challenge_sample_team.json 이 없습니다");
      const id = challenge.teamIdOf(team);
      let progress = recordPlays(challenge.emptyProgress(), id, [[1, true, 2, 1]]);
      // 2단계: 이길 때까지 도전 번호를 올린다 (진 판은 기록) — 결정적
      for (let attempt = 1; attempt <= 40; attempt++) {
        const setup = challenge.challengeSetup(team, 2, attempt, data);
        const ms = createFromSetup(data, setup, setup.seed);
        match.simulateAuto(ms, data);
        const r = match.getResult(ms);
        if (r.winner === "home") {
          return {
            runState: null,
            teams: [],
            storage: {
              [KEYS.challenge]: progress,
              [KEYS.challengeMatch]: { version: 1, teamId: id, stage: 2, attempt, seed: setup.seed, team, match: ms },
            },
            summary: `샘플 팀 2단계 ${attempt}회차 승리 ${r.homeGoals}:${r.awayGoals}${r.penalties ? ` (승부차기 ${r.penalties.home}:${r.penalties.away})` : ""} — 끝난 경기 주입`,
          };
        }
        progress = challenge.recordResult(progress, id, 2, { ...r, attempt, at: "2026-10-01T09:00:00.000Z" });
      }
      throw new Error("[og_challenge_result] 40번 안에 2단계를 이기지 못했습니다");
    },
    steps: [{ text: "도전 모드" }, { text: "^확인$" }],
    ready: "#modal-root .ch-result",
    expect: { screen: "challenge", modal: ".ch-result" },
  },
  // 카드 레슨 런 (tools/lesson_scenarios.mjs — 감독 AI 로 걸은 레슨 런 저장본)
  ...LESSON_OG_SCENARIOS,
];
SCENARIOS.push(...OUTGAME_SCENARIOS);

/** 진행 중인 도전 경기 저장본: 샘플 팀이 1~(stage−1) 단계를 이긴 진행 + stage 단계 1회차 막 시작한 경기 (KEYS.challengeMatch) */
function challengeInProgress(data, stage) {
  const team = challenge.sampleTeam(data);
  if (!team) throw new Error("[og_challenge] data/challenge_sample_team.json 이 없습니다");
  const id = challenge.teamIdOf(team);
  const plays = [];
  for (let s = 1; s < stage; s++) plays.push([s, true, 2, 1]);
  const progress = recordPlays(challenge.emptyProgress(), id, plays);
  const attempt = challenge.nextAttempt(progress, id, stage);
  const setup = challenge.challengeSetup(team, stage, attempt, data);
  const ms = createFromSetup(data, setup, setup.seed);
  return {
    runState: null,
    teams: [],
    storage: {
      [KEYS.challenge]: progress,
      [KEYS.challengeMatch]: { version: 1, teamId: id, stage, attempt, resets: 0, seed: setup.seed, team, match: ms },
    },
    summary: `샘플 팀 ${stage}단계 ${attempt}회차 진행 중 (시드 ${setup.seed}) — 시작 화면 [도전 모드 — 이어하기]`,
  };
}

/** 도전 진행 기록 만들기: plays = [[단계, 승?, 우리 골, 상대 골], …] 순서대로 (도전 번호 자동) */
function recordPlays(progress, teamId, plays) {
  let p = progress;
  for (const [stage, win, home, away] of plays) {
    p = challenge.recordResult(p, teamId, stage, { win, homeGoals: home, awayGoals: away, at: "2026-10-01T09:00:00.000Z" });
  }
  return p;
}
