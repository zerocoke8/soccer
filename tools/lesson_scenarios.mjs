// tools/lesson_scenarios.mjs — 카드 레슨 런의 스크린샷 · 주입 상태 (LESSON_PROTO_PLAN §10.2). tools/scenarios.mjs 가 OUTGAME_SCENARIOS 에 붙인다.
// 엔진(js/engine/lessonRun.js · manager.js · match.js)만으로 원하는 단계까지 감독 AI 로 걷는다 → 같은 seed · 방침이면 같은 상태.
// U1: walkLesson + 임시 화면 시나리오 몇 개 (주 선택 · 레슨 · 보상 · 상담 · 준비). I1 이 §10.2 표 전부로 늘린다.
import * as lessonRun from "../js/engine/lessonRun.js";
import * as manager from "../js/engine/manager.js";
import * as match from "../js/engine/match.js";

export { lessonRun, manager };

const clone = (x) => JSON.parse(JSON.stringify(x));

/** 경기 결과 (실제 match.js 자동 진행) — manager.autoStep 의 playMatch */
export function playMatch(data, setup) {
  const ms = match.createMatch({ data, seed: setup.seed, home: clone(setup.home), away: clone(setup.away), possessions: setup.possessions, kind: setup.kind });
  match.simulateAuto(ms, data);
  return match.getResult(ms);
}

/** 기본 편성 레슨 런 */
export function defaultLessonRun(data, { seed = 1, policy } = {}) {
  const cfg = data.config;
  return lessonRun.createRun({
    data,
    seed,
    squad: cfg.defaultSquad && cfg.defaultSquad.slots,
    formation: cfg.defaultSquad && cfg.defaultSquad.formation,
    supportIds: cfg.defaultSupports,
    tactics: cfg.defaultTactics,
    policy: policy || data.lesson.defaultPolicy,
  });
}

/**
 * 감독 AI 로 걷다가 until(state) 를 만족하는 첫 상태의 복제본 (결정적). 못 찾으면 null.
 * @param {object} data
 * @param {{ seed?, policy?, until: (state) => boolean, maxSteps? }} opts
 * @returns {{ state: object, steps: number } | null}
 */
export function walkLesson(data, { seed = 1, policy, until, maxSteps = 3000 } = {}) {
  const state = defaultLessonRun(data, { seed, policy });
  for (let steps = 0; steps <= maxSteps; steps++) {
    if (until(state)) return { state: clone(state), steps };
    if (state.phase === "finished") break;
    manager.autoStep(state, data, { playMatch: (setup) => playMatch(data, setup) });
  }
  return null;
}

/** 레슨 런 한 줄 요약 (shot.mjs 출력용) */
export function describeLessonRun(state) {
  if (!state) return "저장된 런 없음";
  const kind = state.weekOffer?.kind ?? "-";
  const ls = state.lesson ? ` · 레슨 ${state.lesson.stat} 턴 ${state.lesson.turn}/${state.lesson.turns} 점수 ${state.lesson.score}/${state.lesson.target}` : "";
  return `${state.phase} · 시즌 ${state.season} ${state.turn}주 (${kind})${ls} · 방침 ${state.policy} · TP ${state.trainingPoints} · seed ${state.seed}`;
}

function walkOrThrow(name, data, opts) {
  const found = walkLesson(data, opts);
  if (!found) throw new Error(`[${name}] 조건을 만족하는 레슨 런 상태를 찾지 못했습니다`);
  return { runState: found.state, steps: found.steps, preferred: true, summary: describeLessonRun(found.state) };
}

// 아웃게임 시나리오 모양은 tools/scenarios.mjs 머리말 (og_*). 진입 = 시작 화면 [이어하기] (레슨 런 저장본)
export const LESSON_OG_SCENARIOS = [
  {
    name: "og_week_lesson",
    title: "주 선택 — 시즌 1 1주 레슨 주 (특별 ★ · 추천)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_week_lesson", data, { seed: runSeed, until: (s) => s.phase === "week" }),
    ready: ".week-screen .week-lesson",
    expect: { screen: "run", phase: "week", modal: false },
  },
  {
    name: "og_week_free",
    title: "주 선택 — 자유 주 (행동 3 + 휴식 · 보장 배지)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_week_free", data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" }),
    ready: ".week-screen .week-act",
    expect: { screen: "run", phase: "week", modal: false },
  },
  {
    name: "og_week_prep",
    title: "주 선택 — 대비 주 (5주, 대비 카드 2장)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_week_prep", data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "prep" }),
    ready: ".week-screen .week-lesson",
    expect: { screen: "run", phase: "week", modal: false },
  },
  {
    name: "og_lesson_temp",
    title: "레슨 (임시 화면) — 1턴 손패 3장",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_temp", data, { seed: runSeed, until: (s) => s.phase === "lesson" }),
    ready: ".lesson-screen .lt-card",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    name: "og_reward_temp",
    title: "레슨 결과 (임시 모달) — 보상 카드",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_reward_temp", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.offer?.length > 0 }),
    ready: "#modal-root .reward-modal",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    name: "og_consult_temp",
    title: "상담 (임시 화면) — 진열 · 덱 · 스킬",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_consult_temp", data, { seed: runSeed, until: (s) => s.phase === "consult" }),
    ready: ".consult-screen",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    name: "og_prep_temp",
    title: "경기 전 준비 (임시 화면)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep_temp", data, { seed: runSeed, until: (s) => s.phase === "prep" }),
    ready: ".prep-screen .prep-go",
    expect: { screen: "run", phase: "prep", modal: false },
  },
];
