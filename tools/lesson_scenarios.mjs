// tools/lesson_scenarios.mjs — 카드 레슨 런의 스크린샷 · 주입 상태 (LESSON_PROTO_PLAN §10.2). tools/scenarios.mjs 가 OUTGAME_SCENARIOS 에 붙인다.
// 엔진(js/engine/lessonRun.js · manager.js · match.js)만으로 원하는 단계까지 감독 AI 로 걷는다 → 같은 seed · 방침이면 같은 상태.
// U1: walkLesson + 임시 화면 시나리오 몇 개. U2: 주 선택 · 외출 · 미팅 · 경기 전 준비. U3: 레슨. U4: 보상 모달 · 상담.
// I1: 경기 시나리오 01~27 의 런(prepareLessonMatch → scenarios.mjs prepareRun), 등록 팀(lessonRegisteredTeam — og_start · og_challenge),
//     이벤트(2차 라우팅 확인용 주입) · 유물 · 루트 · 결과.
import * as lessonRun from "../js/engine/lessonRun.js";
import * as manager from "../js/engine/manager.js";
import * as match from "../js/engine/match.js";
import { fireEvent } from "../js/engine/run.js"; // og_event 주입 전용 (1차 레슨 런에는 이벤트가 없다 — §7 D1)

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

/**
 * 경기 시나리오(01~27)용 런: 기본 편성 레슨 런을 감독 AI 로 걸어 원하는 종류의 경기 직전(phase "match")까지 (LESSON_PROTO_PLAN §10.2 prepareRun).
 * - friendly: 친선전이 열린 첫 자유 주에서 친선전을 고른다 (감독 AI 의 선택과 상관없이)
 * - goal: 감독 AI 그대로 첫 경계전까지 (그 사이 친선전 · 루트 친선전은 실제 match.js 로 치른다)
 * @returns {object} 레슨 RunState (phase "match", pendingMatch.kind === kind)
 */
export function prepareLessonMatch(data, { runSeed = 1, kind = "friendly", maxSteps = 3000 } = {}) {
  const state = defaultLessonRun(data, { seed: runSeed });
  for (let steps = 0; steps < maxSteps; steps++) {
    if (state.phase === "match" && state.pendingMatch?.kind === kind) return state;
    if (state.phase === "finished") break;
    if (kind === "friendly" && state.phase === "week" && state.weekOffer?.kind === "free" && state.weekOffer.actions.includes("friendly")) {
      lessonRun.applyWeekAction(state, data, { type: "friendly" });
      continue;
    }
    manager.autoStep(state, data, { playMatch: (setup) => playMatch(data, setup) });
  }
  throw new Error(`'${kind}' 경기에 도달하지 못했습니다 (레슨 런 seed ${runSeed}, phase ${state.phase})`);
}

/**
 * 완주한 레슨 런 → 등록 팀 (app.js registerTeam 과 같은 모양 + policy, 등록 시각은 고정). og_start · og_challenge 의 등록 팀.
 */
export function lessonRegisteredTeam(data, seed, registeredAt, policy) {
  const found = walkLesson(data, { seed, policy, until: (s) => s.phase === "finished" });
  if (!found) throw new Error(`레슨 런 ${seed} 이 끝나지 않습니다`);
  const { rating, registeredTeam: team } = lessonRun.finalizeRun(found.state, data);
  return { ...team, grade: rating.cappedGrade ?? rating.grade ?? "-", score: rating.score ?? null, registeredAt };
}

/**
 * 이벤트 모달 (2차 라우팅 확인용 주입): 1차에는 이벤트가 없다 (lesson.events.support = false). 자유 주 주 끝에 유대 60 서포트 이벤트가
 * 났다고 치고 — 편성 코치의 선택지 2개 이상인 서포트 이벤트를 run.fireEvent 로 띄우고, queue 에 advanceWeek 를 남긴다 (주 끝 흐름과 같게).
 */
function eventInjectedState(data, runSeed) {
  const found = walkLesson(data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" });
  if (!found) return null;
  const st = found.state;
  const ids = new Set(st.supports.map((x) => x.id));
  const ev = data.events.find((e) => e.trigger === "support" && ids.has(e.supportId) && (e.choices || []).length >= 2);
  if (!ev) return null;
  const sup = st.supports.find((x) => x.id === ev.supportId);
  sup.bond = Math.max(sup.bond, Number(ev.bondAtLeast) || 0);
  fireEvent(st, data, ev, ev.supportId);
  st.queue = ["advanceWeek"];
  return { state: st, steps: found.steps, eventId: ev.id };
}

/** 레슨 런 한 줄 요약 (shot.mjs 출력용) */
export function describeLessonRun(state) {
  if (!state) return "저장된 런 없음";
  const kind = state.weekOffer?.kind ?? "-";
  const ls = state.lesson ? ` · 레슨 ${state.lesson.zone} 중점 턴 ${state.lesson.turn}/${state.lesson.turns} 점수 ${state.lesson.score}/${state.lesson.target}` : "";
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
  // 마지막 턴은 빼고 (구역 방식: 카드를 내 남은 사용이 0 이면 턴이 끝나 마지막 턴이면 레슨이 끝난다)
  const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 2 && s.lesson.turn < s.lesson.turns && lessonHand(data, s).some((c) => RANGE.includes(c.targetKind) && c.playable) });
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

/**
 * 퍼펙트 보상 (결정적): 3턴째 이후 범위 카드가 있는 레슨에서 점수를 퍼펙트 − 1 로 두고 그 카드를 엔진에서 낸다 → phase reward (퍼펙트 · 보상 후보 있음).
 * 걸어서는 퍼펙트가 드물다.
 */
export function perfectRewardState(data, runSeed) {
  const rangeCard = (s) => lessonHand(data, s).find((c) => RANGE.includes(c.targetKind) && c.playable);
  const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && !!rangeCard(s) && s.season >= 1 && s.turnIndex >= 2 });
  if (!found) return null;
  const st = found.state;
  st.lesson.score = st.lesson.cap - 1;
  lessonRun.playCard(st, data, { uid: rangeCard(st).uid, taps: [] });
  if (st.phase !== "reward" || st.pendingReward?.result?.status !== "perfect") return null;
  return { state: st, steps: found.steps + 1 };
}

/** 방침 버프가 쌓인 레슨 (그 방침 버프 칩 값이 0 이 아닌 3턴째 이후) — 없으면 그냥 3턴째 */
function policyLessonState(data, runSeed, policy) {
  const hasBuff = (s) => lessonRun.getLessonView(s, data).chips.some((c) => c.policy && (Number(s.lesson.buffs[c.key]) || 0) > 0);
  return walkLesson(data, { seed: runSeed, policy, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && hasBuff(s) })
    || walkLesson(data, { seed: runSeed, policy, until: (s) => playingLesson(s) && s.lesson.turn === 3 });
}

// ---- 구역 방식 조준 · 끌기 시나리오 도우미 (ZU2) ----
const FIELD = ".lesson-screen .m-field";
/** 후보 점 중 대상이 가장 많은 점 (같으면 앞 — 구역 중심 → 선수 → 가운데 점 순서) */
const mostTargets = (list) => list.reduce((best, c) => (!best || c.ids.length > best.ids.length ? c : best), null);

/**
 * 레슨 중(기본 2턴째 이후) 손패 첫 장을 cardId 로 바꾼 상태 + 그 카드의 후보 점 (info: { uid, cardId, at, ids }).
 * choose(list, state) 로 후보 점을 고른다 (기본 = 첫 후보).
 */
function injectCard(name, data, runSeed, cardId, { until, choose } = {}) {
  const b = walkOrThrow(name, data, { seed: runSeed, until: until || ((s) => playingLesson(s) && s.lesson.turn >= 2) });
  const uid = withHandCard(b.runState, cardId, 0);
  const list = lessonRun.dropCandidates(b.runState, data, { uid });
  const cd = choose ? choose(list, b.runState) : list[0];
  return { ...b, info: { uid, cardId, at: cd?.at ? { x: cd.at.x, y: cd.at.y } : null, ids: cd?.ids || [] }, summary: `${b.summary} (손패 첫 장 = ${cardId} 주입)` };
}

/** 경기장에서 구역 바닥 · 선수와 먼 빈 자리 (아래 터치라인 가운데) */
function emptySpot() {
  return { x: 50, y: 93 };
}

/** 경기장 선수 중 체력 최저 (같으면 슬롯 순서) */
function tiredest(data, state) {
  const v = lessonRun.getLessonView(state, data);
  return v.players.filter((p) => v.positions[p.id]).sort((a, b) => a.stamina - b.stamina)[0].id;
}

/** 이번 턴 흩어진 결과를 바꾼 레슨 (zones 주입 — 위치는 zones 에서 계산되므로 엔진 뷰가 그대로 따라온다). zones = 슬롯 순서 구역 7개 */
function crowdState(name, data, runSeed, zoneList) {
  const b = walkOrThrow(name, data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 2 && !s.lesson.out.length });
  const st = b.runState;
  st.lesson.bench = [];
  st.lesson.zones = Object.fromEntries(st.players.map((p, i) => [p.id, zoneList[i]]));
  return { ...b, summary: `${b.summary} (구역 주입: ${zoneList.join(" · ")})` };
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
  // ---- 구역 방식 조준 · 끌기 · 벤치 (§14.16, ZU2). 경기장 점 = .m-field 박스 % = 엔진 필드 % ----
  {
    // 단일 카드(개인 지도)를 눌러 조준 모드: 고를 수 있는 선수 초록 테 · 구역 라벨에 키 1~5 · 안내
    name: "og_lesson_aim_pick",
    title: "레슨 — 단일 카드 조준 모드 (클릭): 후보 선수 초록 · 키 1~5",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_aim_pick", data, runSeed, "cd_coaching"),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }],
    ready: ".lesson-screen.aiming .tok.cand",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 단일 카드 조준 + 마우스를 선수 위에: 십자 · 대상 흰 고리 · 이름표 자리에 "+N" · 점수 막대 미리보기 · [내기]
    name: "og_lesson_aim_single",
    title: "레슨 — 단일 카드 조준 hover: 십자 · +N 말풍선 · 점수 미리보기",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_aim_single", data, runSeed, "cd_coaching"),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen .aim-cross.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 큰 원 카드 조준 hover: 대상이 가장 많은 후보 점 (두 구역 사이) — 원 · 대상 말풍선 · 꼬리표 "n명 · +N"
    name: "og_lesson_aim",
    title: "레슨 — 큰 원 조준 hover: 원 안 선수 강조 · 말풍선 · 꼬리표",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_aim", data, runSeed, "cd_attack_build", { choose: mostTargets }),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen .aim-circle.on.ok",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 작은 원(원투 패스) 조준: 같은 구역 두 선수 사이 → 2명
    name: "og_lesson_small",
    title: "레슨 — 작은 원 조준: 두 선수 사이 (2명)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_small", data, runSeed, "cd_one_two", { choose: (list) => list.find((c) => c.kind === "between" && c.ids.length === 2) || mostTargets(list) }),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen .aim-circle.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 키보드 대체 조작: 중간 원 카드 클릭 → → 두 번 (dropCandidates 후보 2번) — 원 · 안내 "후보 2/n · …"
    name: "og_lesson_keys",
    title: "레슨 — 키보드 조준: 카드 클릭 → 오른쪽 화살표 ×2 (후보 2번)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_keys", data, runSeed, "cd_mf_drill"),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: ".ls-dock .ls-info", x: 50, y: 50 } }, { key: "ArrowRight", times: 2 }],
    ready: ".lesson-screen .ls-cand",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끄는 중 (누른 채): 중간 원 카드를 구역 가운데로 — 유령 대신 원 · 대상 강조 · dock 합계
    name: "og_lesson_drag",
    title: "레슨 — 카드 끄는 중 (중간 원 → 구역 가운데, 누른 채)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_drag", data, runSeed, "cd_mf_drill", { choose: mostTargets }),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: FIELD, at: prepared.info.at, steps: 16 } }],
    ready: ".lesson-screen.dragging .aim-circle.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끄는 중, 아직 손패 위 (경기장 밖): 카드 유령이 포인터를 따른다
    name: "og_lesson_drag_ghost",
    title: "레슨 — 카드 끄는 중 (경기장 밖: 카드 유령)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_drag_ghost", data, runSeed, "cd_mf_drill"),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: ".ls-dock .ls-info", at: { x: 20, y: 30 }, steps: 10 } }],
    ready: ".lesson-screen .drag-ghost.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끄는 중: 원 안에 아무도 없는 자리 → 빨간 점선 · "원 안에 선수가 없습니다"
    name: "og_lesson_drag_bad",
    title: "레슨 — 카드 끄는 중 (빈 자리: 빨간 원)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_drag_bad", data, runSeed, "cd_mf_drill", { choose: () => ({ at: emptySpot(data) }) }),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: FIELD, at: prepared.info.at, steps: 14 } }],
    ready: ".lesson-screen .aim-circle.on.bad",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끄는 중: 단일 카드를 선수 위로 — 십자 · 대상 1명
    name: "og_lesson_drag_single",
    title: "레슨 — 단일 카드 끄는 중 (선수 위)",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_drag_single", data, runSeed, "cd_coaching", { choose: (list) => list[list.length - 1] }),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: FIELD, at: prepared.info.at, steps: 14 } }],
    ready: ".lesson-screen .aim-cross.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끄는 중: 회복 카드(쿨다운)를 명단 줄 위로 — 그 줄 · 토큰 청록, 안내 "체력 +20"
    name: "og_lesson_drag_heal",
    title: "레슨 — 회복 카드 끄는 중 (명단 줄 위)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = injectCard("og_lesson_drag_heal", data, runSeed, "cd_cooldown", { until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 60).length >= 2 });
      const low = b.runState.players.slice().sort((x, y) => x.stamina - y.stamina)[0];
      return { ...b, info: { ...b.info, pid: low.id } };
    },
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: `.ls-row[data-pid="${prepared.info.pid}"]`, steps: 14 } }],
    ready: ".lesson-screen .ls-row.heal-target",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 토큰 끄는 중: 지친 선수를 벤치 칸 위로 — 벤치 칸 초록 · 토큰 유령
    name: "og_lesson_drag_bench",
    title: "레슨 — 지친 선수 토큰을 벤치 칸으로 끄는 중",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_lesson_drag_bench", data, { seed: runSeed, until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 40).length >= 2 });
      return { ...b, info: { pid: tiredest(data, b.runState) } };
    },
    steps: (prepared) => [{ drag: { from: `.lesson-screen .tok[data-id="${prepared.info.pid}"] .tok-face`, to: ".ls-bench", steps: 14 } }],
    ready: ".lesson-screen .ls-bench.drop-ok",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 끌어다 놓기 (놓음): 중간 원을 구역 가운데에 놓으면 그대로 낸다 → 제자리 훈련 · +N 팝 (실제 포인터 끌기 → playCard)
    name: "og_lesson_drop",
    title: "레슨 — 카드를 끌어다 놓음 → 내기 · +N 팝",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_drop", data, runSeed, "cd_mf_drill", { choose: mostTargets }),
    steps: (prepared) => [{ freeze: false }, { drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: FIELD, at: prepared.info.at, steps: 14, release: true, waitMs: 420 } }, { freeze: true }],
    ready: ".lesson-screen .ls-pop.good",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 토큰을 벤치 칸에 끌어다 놓음 → benchPlayer (벤치 칸에 그 선수, 남은 선수 대형 다시)
    name: "og_lesson_drop_bench",
    title: "레슨 — 지친 선수를 벤치 칸에 끌어다 놓음",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_lesson_drop_bench", data, { seed: runSeed, until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 40).length >= 2 });
      return { ...b, info: { pid: tiredest(data, b.runState) } };
    },
    steps: (prepared) => [{ drag: { from: `.lesson-screen .tok[data-id="${prepared.info.pid}"] .tok-face`, to: ".ls-bench", steps: 14, release: true, waitMs: 500 } }],
    ready: ".lesson-screen .ls-bench-slot.filled",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 명단 [벤치] 두 번: 지친 선수 2명이 벤치 칸에 (턴 끝 +15), 칸이 꽉 참
    name: "og_lesson_bench",
    title: "레슨 — 벤치 2명 (명단 [벤치]): 벤치 칸 · 남은 대형",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_lesson_bench", data, { seed: runSeed, until: (s) => playingLesson(s) && s.players.filter((p) => p.stamina < 40).length >= 2 });
      const v = lessonRun.getLessonView(b.runState, data);
      const ids = v.players.filter((p) => v.positions[p.id]).sort((x, y) => x.stamina - y.stamina).slice(0, 2).map((p) => p.id);
      return { ...b, info: { ids } };
    },
    steps: (prepared) => prepared.info.ids.map((id) => ({ click: `.ls-row[data-pid="${id}"] .ls-bench-btn`, waitMs: 400 })),
    ready: ".lesson-screen .ls-bench.full",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // [턴 끝] 연출 중간: 기본 훈련 팝 뒤 새 턴 흩어지기 — 토큰이 새 자리로 뛰어가는 중 (타이머를 잠깐 풀었다가 다시 고정)
    name: "og_lesson_scatter",
    title: "레슨 — 턴 끝 흩어지기 연출 중 (토큰이 새 자리로)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_scatter", data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn === 2 }),
    steps: [{ freeze: false }, { click: ".ls-btns .ls-end", waitMs: 0 }, { wait: 840 }, { freeze: true }],
    ready: ".lesson-screen .m-field.scatter",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // [턴 끝] 직후: 기본 훈련 "+N" 회색 팝이 경기장 선수 전원에게 동시에 · 턴 배너 (흩어지기 전)
    name: "og_lesson_base",
    title: "레슨 — 턴 끝 기본 훈련 팝 (전원 동시) · 턴 배너",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_base", data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn === 2 }),
    steps: [{ freeze: false }, { click: ".ls-btns .ls-end", waitMs: 0 }, { wait: 330 }, { freeze: true }],
    ready: ".lesson-screen .ls-pop.base",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 카드를 낸 직후 (중간 원): 대상이 제자리에서 훈련 동작 (구역 색 고리) → "+N" 팝
    name: "og_lesson_play",
    title: "레슨 — 중간 원 카드를 낸 직후: 제자리 훈련 동작 · +N 팝",
    outgame: true,
    build: (data, { runSeed }) => injectCard("og_lesson_play", data, runSeed, "cd_mf_drill", { choose: mostTargets }),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { freeze: false }, { clickAt: { sel: FIELD, ...prepared.info.at }, waitMs: 0 }, { wait: 420 }, { freeze: true }],
    ready: ".lesson-screen .ls-pop.good",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 한 구역에 6명 (위 줄 패스 구역) + 1명: 짧은 이름표 · 바깥쪽 자리 · 라벨 겹침 없음 (zones 주입)
    name: "og_lesson_crowd",
    title: "레슨 — 한 구역에 6명 (패스) + 1명: 대형 · 짧은 이름표",
    outgame: true,
    build: (data, { runSeed }) => crowdState("og_lesson_crowd", data, runSeed, ["pass", "pass", "pass", "pass", "pass", "pass", "physical"]),
    ready: ".lesson-screen .tok.short",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 아래 줄 드리블 구역에 7명 전원: 맨 아래 이름표 · 라벨 칩이 필드 안
    name: "og_lesson_crowd7",
    title: "레슨 — 한 구역에 7명 (드리블, 아래 줄)",
    outgame: true,
    build: (data, { runSeed }) => crowdState("og_lesson_crowd7", data, runSeed, ["dribble", "dribble", "dribble", "dribble", "dribble", "dribble", "dribble"]),
    ready: ".lesson-screen .tok.short",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 6명 대형에 중간 원 조준: 6명 모두 이름표 자리에 "+N"
    name: "og_lesson_crowd_aim",
    title: "레슨 — 6명 대형 + 중간 원 조준 (구역 가운데)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = crowdState("og_lesson_crowd_aim", data, runSeed, ["shoot", "shoot", "shoot", "shoot", "shoot", "shoot", "defense"]);
      const uid = withHandCard(b.runState, "cd_mf_drill", 0);
      return { ...b, info: { uid, at: data.lesson.zones.centers.shoot } };
    },
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen .aim-circle.on.ok",
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
    name: "og_lesson_injury",
    title: "레슨 — 부상 직후: 경기장에서 빠짐 · 명단 '부상' · 고유 카드 제외",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = injuredLessonState(data, runSeed);
      if (!found) throw new Error("[og_lesson_injury] 부상 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (체력 30 으로 낮춰 범위 카드 — 부상 찾기)` };
    },
    ready: ".lesson-screen .ls-row.out",
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
    // 팀형 · 분위기 > 0 에서 전체 카드 1장 = 턴 끝: 기본 훈련(분위기 몫 포함) "+N" 팝 · 가운데 "턴 n — 기본 훈련 +N" (연출 1.25초 지점)
    name: "og_lesson_turnend",
    title: "레슨 — 턴 끝 연출: 기본 훈련 +N (분위기 몫 포함) · 턴 배너",
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
    ready: ".lesson-screen .ls-pop.base",
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
    name: "og_reward_clear",
    title: "레슨 결과 — 클리어: 점수 막대 · 보상 칩 · 선수 7 · 카드 3장 + 건너뛰기",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_reward_clear", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }),
    ready: "#modal-root .reward-modal .rw-offer .card-face",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 클리어 보상에서 카드 1장(추천 카드, 없으면 첫 장)을 고른 상태: 금색 테두리 · 설명 · [확인] 켜짐
    name: "og_reward_pick",
    title: "레슨 결과 — 카드를 고른 상태 (설명 · [확인] 켜짐)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_reward_pick", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }),
    steps: [{ click: "#modal-root .rw-offer .card-face.recommended" }],
    ready: "#modal-root .rw-offer .card-face.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 점수를 퍼펙트 − 1 로 주입하고 범위 카드를 엔진에서 낸 직후 (결정적): TP 20 · 힌트 2 · 무료 강화 덱 그리드
    name: "og_reward_perfect",
    title: "레슨 결과 — 퍼펙트: 카드 3장 + 무료 강화 덱 그리드 (카드 · 무료 강화 고름)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = perfectRewardState(data, runSeed);
      if (!found) throw new Error("[og_reward_perfect] 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (점수 = 퍼펙트 − 1 주입 후 범위 카드)` };
    },
    steps: [{ click: "#modal-root .rw-offer .card-face" }, { click: "#modal-root .rw-deck .mini-card.recommended" }],
    ready: "#modal-root .reward-modal .rw-deck .mini-card.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    name: "og_reward_fail",
    title: "레슨 결과 — 실패: 결과 머리 + 보상 없음 + [계속]",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_reward_fail", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "fail" }),
    ready: "#modal-root .reward-modal .rw-none",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 힌트 스킬이 있는 상담 (TP · SP 가 쌓인 뒤)
    name: "og_consult",
    title: "상담 — 진열 3 (가격 · 구매) · 덱 그리드 · 스킬 (SP)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_consult", data, { seed: runSeed, until: (s) => s.phase === "consult" && Object.keys(s.hints).length >= 2 && s.trainingPoints >= 30 }),
    ready: ".consult-screen .cs-stock .card-face",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 덱의 강화할 수 있는 카드를 고른 상태: 지금 → 강화 후 카드 · [강화] [삭제]
    name: "og_consult_pick",
    title: "상담 — 덱 카드를 고름: 지금 → 강화 후 · [강화 30 TP] [삭제 25 TP]",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_pick", data, { seed: runSeed, until: (s) => s.phase === "consult" && Object.keys(s.hints).length >= 2 && s.trainingPoints >= 30 });
      const v = lessonRun.getConsultView(b.runState, data);
      const c = v.deck.find((d) => d.canUpgrade && d.family !== "unique") || v.deck[0];
      return { ...b, info: { uid: c.uid } };
    },
    steps: (prepared) => [{ click: `.cs-deck-grid .mini-card[data-uid="${prepared.info.uid}"]` }],
    ready: ".consult-screen .cs-detail .card-face",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 꽉 찬 상담 (주입): 힌트 스킬 7개 · 덱 +10장(24장) · TP 200 · SP 600 — 스킬 줄 압축 · 덱 6줄이 스크롤 없이 들어가는지
    name: "og_consult_full",
    title: "상담 — 꽉 참: 스킬 7 (압축) · 덱 24장 (TP · SP 주입)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_full", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      const st = b.runState;
      st.trainingPoints = 200;
      st.skillPoints = 600;
      const ids = st.supports.flatMap((x) => (data.supports.find((d) => d.id === x.id)?.hintSkillIds || []));
      ids.slice(0, 7).forEach((id, i) => { st.hints[id] = 1 + (i % 3); });
      const extra = ["cd_fw_drill", "cd_mf_drill", "cd_df_drill", "cd_gk_session", "cd_attack_build", "cd_defense_org", "cd_one_two", "cd_one_on_one", "cd_tactics_board", "cd_icing"];
      while (st.deck.length < 24) { st.deck.push({ uid: `k${st.nextUid}`, cardId: extra[st.deck.length % extra.length], plus: st.deck.length % 3 === 0 }); st.nextUid += 1; }
      return { ...b, summary: `${b.summary} (힌트 7 · 덱 24 · TP 200 · SP 600 주입)` };
    },
    ready: ".consult-screen .cs-skill",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 고유 카드 [삭제] → 확인 모달
    name: "og_consult_delete",
    title: "상담 — 고유 카드 삭제 확인 모달",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_delete", data, { seed: runSeed, until: (s) => s.phase === "consult" && s.trainingPoints >= 25 });
      const v = lessonRun.getConsultView(b.runState, data);
      const c = v.deck.find((d) => d.family === "unique");
      return { ...b, info: { uid: c.uid } };
    },
    steps: (prepared) => [{ click: `.cs-deck-grid .mini-card[data-uid="${prepared.info.uid}"]` }, { click: ".cs-ops .cs-delete" }],
    ready: "#modal-root .cs-confirm",
    expect: { screen: "run", phase: "consult", modal: ".modal-md" },
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
  // ---- 이벤트 · 유물 · 루트 · 결과 (레슨 런, I1) ----
  {
    name: "og_event",
    title: "이벤트 모달 — 유대 60 서포트 이벤트 (2차 라우팅 확인용 주입, 배경 = 주 선택 화면 inert)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = eventInjectedState(data, runSeed);
      if (!found) throw new Error("[og_event] 이벤트를 주입할 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (이벤트 ${found.eventId} 주입 — 1차에는 나오지 않음)` };
    },
    ready: "#modal-root .choice-btn",
    expect: { screen: "run", phase: "event", modal: ".modal" },
  },
  {
    name: "og_relic",
    title: "유물 선택 모달 — 경계전 승리 뒤 (배경 = 주 선택 화면 inert)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_relic", data, { seed: runSeed, until: (s) => s.phase === "relic" }),
    ready: "#modal-root .relic-card",
    expect: { screen: "run", phase: "relic", modal: ".modal" },
  },
  {
    name: "og_route",
    title: "시즌 종료 — 경계전 결과 · 다음 시즌 루트 (온천 설명 = lesson.json routeOverrides)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_route", data, { seed: runSeed, until: (s) => s.phase === "route" }),
    ready: ".route-card",
    expect: { screen: "run", phase: "route", modal: false },
  },
  {
    name: "og_result",
    title: "런 결과 화면 — 15주를 감독 AI 로 완주한 레슨 런의 최종 평가 · 선수 · seed",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_result", data, { seed: runSeed, until: (s) => s.phase === "finished" }),
    ready: ".result-hero",
    expect: { screen: "run", phase: "finished", modal: false },
  },
];
