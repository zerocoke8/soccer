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

// ---- 레슨 화면 (U3) 시나리오 도우미 ----
const playingLesson = (s) => s.phase === "lesson" && s.lesson?.status === "playing";
const lessonHand = (data, s) => lessonRun.getLessonView(s, data).hand;
const RANGE = ["all", "line", "attack", "defense"];

/**
 * 손패 카드 하나를 다른 카드로 바꾼 레슨 상태 (스크린샷용 주입 — 짝 카드처럼 걸어서는 늦게 나오는 카드).
 * 손패 첫 장의 덱 항목 cardId 를 바꾼다 (uid · 더미는 그대로).
 */
function withHandCard(state, cardId, at = 0) {
  const uid = state.lesson.hand[at];
  const e = state.deck.find((d) => d.uid === uid);
  if (e) { e.cardId = cardId; e.plus = false; }
  return uid;
}

/**
 * 레슨 중 부상 직후 (결정적 찾기): 시즌 1 레슨 2턴째, 손패의 범위 카드를 출전 선수 체력 30(실패율 25%)에서 낸다 —
 * rng 상태를 바꿔 가며 실패 + 부상이 나오고 레슨이 계속되는 첫 경우. 걸어서는 감독 AI 가 체력을 아껴 부상이 거의 없다.
 */
function injuredLessonState(data, runSeed) {
  const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 2 && lessonHand(data, s).some((c) => RANGE.includes(c.targetKind) && c.playable) });
  if (!found) return null;
  const base = found.state;
  const card = lessonHand(data, base).find((c) => RANGE.includes(c.targetKind) && c.playable);
  for (let k = 0; k < 400; k++) {
    const st = JSON.parse(JSON.stringify(base));
    st.rngState = (base.rngState + k * 2654435761) >>> 0;
    for (const p of st.players) if (!(p.injuredTurns > 0)) p.stamina = Math.min(p.stamina, 30);
    const before = JSON.parse(JSON.stringify(st));
    lessonRun.playCard(st, data, { uid: card.uid, taps: [] });
    if (playingLesson(st) && st.lesson.out.some((id) => !st.lesson.outAtStart.includes(id))) return { state: st, before, cardId: card.cardId, steps: found.steps + 1 };
  }
  return null;
}

/** 방침 버프가 쌓인 레슨 (그 방침 버프 칩 값이 0 이 아닌 3턴째 이후) — 없으면 그냥 3턴째 */
function policyLessonState(data, runSeed, policy) {
  const hasBuff = (s) => lessonRun.getLessonView(s, data).chips.some((c) => c.policy && (Number(s.lesson.buffs[c.key]) || 0) > 0);
  return walkLesson(data, { seed: runSeed, policy, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && hasBuff(s) })
    || walkLesson(data, { seed: runSeed, policy, until: (s) => playingLesson(s) && s.lesson.turn === 3 });
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
    name: "og_lesson",
    title: "레슨 1턴 — HUD · 경기장 토큰 7 · 손패 3장 · 이번 레슨 명단",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson", data, { seed: runSeed, until: (s) => s.phase === "lesson" }),
    ready: ".lesson-screen .ls-hand .card-face",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 지명 카드(개인 지도)를 고른 상태: 출전 선수 초록 · 안내 "대상 선수를 누르세요 (0/1)"
    name: "og_lesson_pick",
    title: "레슨 — 지명 카드를 고름: 고를 수 있는 선수 초록 · 안내 (0/1)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_pick", data, { seed: runSeed, until: (s) => playingLesson(s) && lessonHand(data, s).some((c) => c.cardId === "cd_coaching" && c.playable) }),
    steps: [{ click: '.ls-hand .card-face[data-card="cd_coaching"]' }],
    ready: ".lesson-screen .tok.pickable",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 지명 대상까지 고른 상태: 말풍선 "+N" · 점수 막대 미리보기 · [내기] 켜짐
    name: "og_lesson_aim",
    title: "레슨 — 지명 카드 + 대상(MF1) 고름: 말풍선 +N · 점수 미리보기 · [내기]",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_aim", data, { seed: runSeed, until: (s) => playingLesson(s) && lessonHand(data, s).some((c) => c.cardId === "cd_coaching" && c.playable) }),
    steps: [{ click: '.ls-hand .card-face[data-card="cd_coaching"]' }, { click: '.tok[data-id="p4"] .tok-face' }],
    ready: ".lesson-screen .tok.picked.has-bubble",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 짝 카드(원투 패스 — 손패 첫 장을 바꿔 넣음)에 1명만 고른 상태: .tok.picked 1 · 안내 (1/2)
    name: "og_lesson_pair",
    title: "레슨 — 짝 카드 탭 1/2: 고른 1명 금색 · 나머지 초록",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_lesson_pair", data, { seed: runSeed, until: (s) => s.phase === "lesson" });
      withHandCard(b.runState, "cd_one_two", 0);
      return { ...b, summary: `${b.summary} (손패 첫 장 = 원투 패스 주입)` };
    },
    steps: [{ click: '.ls-hand .card-face[data-card="cd_one_two"]' }, { click: '.tok[data-id="p4"] .tok-face' }],
    ready: ".lesson-screen .tok.picked",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 범위 카드(기초 훈련 — 전원)를 낸 직후: 대상이 훈련장으로 달려가 "+N" 팝 (타이머를 잠깐 풀었다가 다시 고정)
    name: "og_lesson_mid",
    title: "레슨 — 기초 훈련을 낸 직후: 7명이 훈련장으로 우르르 · +N 팝",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_mid", data, { seed: runSeed, until: (s) => playingLesson(s) && lessonHand(data, s).some((c) => c.cardId === "cd_basic" && c.playable) }),
    steps: [
      { click: '.ls-hand .card-face[data-card="cd_basic"]' },
      { click: '.ls-btns .ls-play' , waitMs: 0 },
      { freeze: false }, { wait: 430 }, { freeze: true },
    ],
    ready: ".lesson-screen .m-pop",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 체력이 낮은 선수 2명 이상: 막대 · 숫자 빨강/주황, 토큰 왼쪽 위 실패율 경고
    name: "og_lesson_tired",
    title: "레슨 — 지친 선수: 체력 막대 색 · 실패율 경고(⚠25%)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_tired", data, { seed: runSeed, until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 40).length >= 2 }),
    ready: ".lesson-screen .tok-warn.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // [쉬기] 를 누른 상태: 7명 초록 · 말풍선 +20 · 안내
    name: "og_lesson_rest",
    title: "레슨 — [쉬기] 누름: 쉴 선수 고르기 (7명 초록 · +20)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_rest", data, { seed: runSeed, until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 40).length >= 2 }),
    steps: [{ click: ".ls-btns .ls-rest" }],
    ready: ".lesson-screen .tok.pickable",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    name: "og_lesson_injury",
    title: "레슨 — 부상 직후: 빨간 '부상' 토큰 · 명단 결장 · 고유 카드 제외",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = injuredLessonState(data, runSeed);
      if (!found) throw new Error("[og_lesson_injury] 부상 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (체력 30 으로 낮춰 범위 카드 — 부상 찾기)` };
    },
    ready: ".lesson-screen .tok.injured",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 위 부상 상태의 직전에서 같은 카드를 브라우저에서 낸다 (같은 rng → 같은 실패 · 부상): 빨간 "실패 −5 · 부상!" 팝 연출 중
    name: "og_lesson_fail",
    title: "레슨 — 실패 · 부상 연출 중 (빨간 팝)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = injuredLessonState(data, runSeed);
      if (!found) throw new Error("[og_lesson_fail] 부상 상태를 찾지 못했습니다");
      return { runState: found.before, steps: found.steps - 1, info: { cardId: found.cardId }, preferred: true, summary: `${describeLessonRun(found.before)} (다음 카드 = 실패 · 부상)` };
    },
    steps: (prepared) => [
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` }, { click: ".ls-btns .ls-play", waitMs: 0 },
      { freeze: false }, { wait: 430 }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-hand .card-face",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 팀형 · 분위기 > 0 에서 범위 카드 1장 = 턴 끝: 분위기 틱 금색 "+N" 팝 · 가운데 "턴 n — 분위기 +N" (연출 1.25초 지점)
    name: "og_lesson_turnend",
    title: "레슨 — 턴 끝 연출: 분위기 틱 +N · 턴 배너",
    outgame: true,
    build: (data, { runSeed }) => {
      const rangeCard = (s) => lessonHand(data, s).find((c) => RANGE.includes(c.targetKind) && c.playable);
      const found = walkLesson(data, { seed: runSeed, policy: "team", until: (s) => playingLesson(s) && s.lesson.buffs.mood > 0 && s.lesson.playsLeft === 1 && !!rangeCard(s) });
      if (!found) throw new Error("[og_lesson_turnend] 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, info: { cardId: rangeCard(found.state).cardId }, preferred: true, summary: describeLessonRun(found.state) };
    },
    steps: (prepared) => [
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` }, { click: ".ls-btns .ls-play", waitMs: 0 },
      { freeze: false }, { wait: 1250 }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-pop.mood",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 점수를 퍼펙트 1 전으로 주입하고 범위 카드: 레슨 끝 배너 "퍼펙트!" (보상 모달 전)
    name: "og_lesson_end",
    title: "레슨 — 퍼펙트 배너 (레슨 끝 연출, 보상 모달 직전)",
    outgame: true,
    build: (data, { runSeed }) => {
      const rangeCard = (s) => lessonHand(data, s).find((c) => RANGE.includes(c.targetKind) && c.playable);
      const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && !!rangeCard(s) });
      if (!found) throw new Error("[og_lesson_end] 상태를 찾지 못했습니다");
      found.state.lesson.score = found.state.lesson.cap - 1;
      return { runState: found.state, steps: found.steps, info: { cardId: rangeCard(found.state).cardId }, preferred: true, summary: `${describeLessonRun(found.state)} (점수 = 퍼펙트 − 1 주입)` };
    },
    steps: (prepared) => [
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` }, { click: ".ls-btns .ls-play", waitMs: 0 },
      { freeze: false }, { wait: 1300 }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-pop.big",
    expect: { screen: "run", phase: "reward", modal: false },
  },
  {
    // 손패 4장 이상 (다음 턴 손패 +): 카드가 겹쳐서 600 px 안에
    name: "og_lesson_hand4",
    title: "레슨 — 손패 4장 이상: 겹쳐 놓기",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_hand4", data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.hand.length >= 4 }),
    ready: ".lesson-screen .ls-hand.overlap",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 개발용 ?autolesson=1: 레슨 화면이 600ms 마다 감독 추천 행동을 낸다 — 타이머를 4초 풀었다가 다시 고정 (몇 장 낸 뒤 모습)
    name: "og_lesson_auto",
    title: "레슨 ?autolesson=1 — 감독 추천 자동 진행 4초 뒤",
    outgame: true,
    query: { autolesson: 1 },
    build: (data, { runSeed }) => walkOrThrow("og_lesson_auto", data, { seed: runSeed, until: (s) => s.phase === "lesson" }),
    steps: [{ freeze: false }, { wait: 4000 }, { freeze: true }],
    ready: ".lesson-screen .ls-hand .card-face",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  ...["ace", "team", "counter", "press", "poss"].map((policy) => ({
    name: `og_lesson_${policy}`,
    title: `레슨 — ${policy} 방침 3턴째 이후: 버프 칩`,
    outgame: true,
    build: (data, { runSeed }) => {
      const found = policyLessonState(data, runSeed, policy);
      if (!found) throw new Error(`[og_lesson_${policy}] 상태를 찾지 못했습니다`);
      return { runState: found.state, steps: found.steps, preferred: true, summary: describeLessonRun(found.state) };
    },
    ready: ".lesson-screen .lh-chip",
    expect: { screen: "run", phase: "lesson", modal: false },
  })),
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
