// tools/lesson_scenarios.mjs — 카드 레슨 런의 스크린샷 · 주입 상태 (LESSON_PROTO_PLAN §10.2). tools/scenarios.mjs 가 OUTGAME_SCENARIOS 에 붙인다.
// 엔진(js/engine/lessonRun.js · manager.js · match.js)만으로 원하는 단계까지 감독 AI 로 걷는다 → 같은 seed · 방침이면 같은 상태.
// U1: walkLesson + 임시 화면 시나리오 몇 개 (주 선택 · 레슨 · 보상 · 상담 · 준비). U2: 주 선택 · 외출 · 미팅 · 경기 전 준비 완성 화면. I1 이 §10.2 표 전부로 늘린다.
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
    // 온천 루트 다음 시즌 1주차: 주를 쓰지 않는 무료 외출 (state.freeOuting 주입 — 1주차 레슨 주)
    name: "og_week_hotspring",
    title: "주 선택 — 1주차 + 온천 무료 외출 버튼 (freeOuting 1 주입)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_week_hotspring", data, { seed: runSeed, until: (s) => s.phase === "week" && s.turn === 1 });
      b.runState.freeOuting = 1;
      return { ...b, summary: `${b.summary} (무료 외출 1 주입)` };
    },
    ready: ".week-bar .free-outing",
    expect: { screen: "run", phase: "week", modal: false },
  },
  {
    name: "og_outing",
    title: "자유 주 외출 — 선수 7명 고르기 모달 (체력 → 외출 뒤)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_outing", data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" && s.weekOffer.actions.includes("outing") }),
    steps: [{ click: '.week-act[data-act="outing"]' }],
    ready: "#modal-root .outing-grid .outing-pick",
    expect: { screen: "run", phase: "week", modal: ".modal-md" },
  },
  {
    name: "og_meeting",
    title: "전술 미팅 모달 — 2단 (전술 | 포메이션 · 라인업 보드), 스킬 상점 없음",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_meeting", data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" && s.weekOffer.actions.includes("meeting") }),
    steps: [{ click: '.week-act[data-act="meeting"]' }],
    ready: "#modal-root .meeting-cols .lu-pitch",
    expect: { screen: "run", phase: "week", modal: ".modal-xl" },
  },
  {
    // 미팅 라인업 보드: DF1 도르비나(GK B · DF A · MF C · FW -)를 끌어 FW1 위에 — FW 빨강 · GK/DF/MF 초록 · 누른 채 캡처
    name: "og_meeting_drag",
    title: "전술 미팅 드래그 중 — DF1 을 FW1 위로: FW 빨강 · 나머지 초록, 고스트",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_meeting_drag", data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" && s.weekOffer.actions.includes("meeting") }),
    steps: [{ click: '.week-act[data-act="meeting"]' }, { drag: { from: '#modal-root .lu-slot[data-slot="DF1"]', to: '#modal-root .lu-slot[data-slot="FW1"]' } }],
    ready: ".lu-ghost",
    expect: { screen: "run", phase: "week", modal: ".modal-xl" },
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
    name: "og_prep",
    title: "경기 전 준비 — 상대 패널 + 전술 · 포메이션 · 배치 편집기 (meetingEditor)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep", data, { seed: runSeed, until: (s) => s.phase === "prep" }),
    ready: ".prep-screen .meeting-cols .lu-pitch",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 경기 전 준비 편집: DF2 아델린(MF B)을 끌어 MF1 실루엔(DF C)에 놓기 (맞바꾸기) → 자리 변경 표시 · 고유 카드 모드 변경 알약
    name: "og_prep_swap",
    title: "경기 전 준비 — DF2 ↔ MF1 맞바꾼 뒤 (← 원래 · 고유 카드 모드 변경)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep_swap", data, { seed: runSeed, until: (s) => s.phase === "prep" }),
    steps: [{ drag: { from: '.prep-edit .lu-slot[data-slot="DF2"]', to: '.prep-edit .lu-slot[data-slot="MF1"]', release: true } }],
    ready: ".prep-screen .mode-chg",
    expect: { screen: "run", phase: "prep", modal: false },
  },
];
