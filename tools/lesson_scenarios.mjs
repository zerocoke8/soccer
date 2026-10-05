// tools/lesson_scenarios.mjs — 카드 레슨 런의 스크린샷 · 주입 상태 (LESSON_PROTO_PLAN §10.2). tools/scenarios.mjs 가 OUTGAME_SCENARIOS 에 붙인다.
// 엔진(js/engine/lessonRun.js · manager.js · match.js)만으로 원하는 단계까지 감독 AI 로 걷는다 → 같은 seed · 방침이면 같은 상태.
// U1: walkLesson + 임시 화면 시나리오 몇 개. U2: 주 선택 · 외출 · 미팅 · 경기 전 준비. U3: 레슨. U4: 보상 모달 · 상담.
// I1: 경기 시나리오 01~27 의 런(prepareLessonMatch → scenarios.mjs prepareRun), 등록 팀(lessonRegisteredTeam — og_start · og_challenge),
//     이벤트(2차 라우팅 확인용 주입) · 유물 · 루트 · 결과.
import * as lessonRun from "../js/engine/lessonRun.js";
import * as manager from "../js/engine/manager.js";
import * as match from "../js/engine/match.js";
import { fireEvent, eventById } from "../js/engine/lessonEvents.js"; // og_event 주입 전용 (레슨 이벤트 — 데이터 스위치는 꺼 둔 채, §24 E2)

export { lessonRun, manager };

const clone = (x) => JSON.parse(JSON.stringify(x));

/** 경기 결과 (실제 match.js 자동 진행) — manager.autoStep 의 playMatch */
export function playMatch(data, setup) {
  const ms = match.createMatch({ data, seed: setup.seed, home: clone(setup.home), away: clone(setup.away), possessions: setup.possessions, kind: setup.kind });
  match.simulateAuto(ms, data);
  return match.getResult(ms);
}

/** 기본 편성 레슨 런 (slots = 기본 편성의 자리를 다른 캐릭터로 — 미르카 장면 { FW2: "ch_cat_trickster" }) */
export function defaultLessonRun(data, { seed = 1, policy, slots } = {}) {
  const cfg = data.config;
  return lessonRun.createRun({
    data,
    seed,
    squad: cfg.defaultSquad && { ...cfg.defaultSquad.slots, ...(slots || {}) },
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
export function walkLesson(data, { seed = 1, policy, until, maxSteps = 3000, slots } = {}) {
  const state = defaultLessonRun(data, { seed, policy, slots });
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
export function prepareLessonMatch(data, { runSeed = 1, kind = "friendly", maxSteps = 3000, slots } = {}) {
  const state = defaultLessonRun(data, { seed: runSeed, slots }); // slots: 기본 편성의 자리를 다른 캐릭터로 (§19 경기 장면 29 ~ 34)
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
 * 이벤트 모달 (2차 레슨 이벤트 주입 — 데이터 스위치는 꺼 둔 채): 자유 주 주 끝에 주 끝 랜덤 이벤트가 났다고 치고 —
 * 레슨 이벤트 ev_local_kids (data/lesson_ev_week.json 본보기) 를 lessonEvents.fireEvent 로 띄우고, queue 에 advanceWeek 를 남긴다
 * (주 끝 흐름과 같게 — 고르면 다음 주로).
 */
function eventInjectedState(data, runSeed) {
  const found = walkLesson(data, { seed: runSeed, until: (s) => s.phase === "week" && s.weekOffer?.kind === "free" });
  if (!found) return null;
  const st = found.state;
  const ev = eventById(data, "ev_local_kids");
  if (!ev) return null;
  fireEvent(st, data, ev, { kind: "week" });
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

/**
 * 보상 상태의 남은 코치 수업 (§18.4) 을 감독 추천대로 엔진에서 처리한다 (카드 고르기 장면용 — 수업 칸은 og_reward_teach*).
 * @returns {object} 같은 state
 */
export function finishTeach(data, st) {
  for (let i = 0; i < 12 && st.phase === "reward" && (st.pendingReward?.teach || []).some((t) => t.result === null); i++) {
    lessonRun.resolveTeach(st, data, manager.recommendTeach(st, data));
  }
  return st;
}
/** walkOrThrow + 남은 코치 수업 처리 (보상 카드 고르기 장면) */
function walkRewardOrThrow(name, data, opts) {
  const b = walkOrThrow(name, data, opts);
  const n = (b.runState.pendingReward?.teach || []).filter((t) => t.result === null).length;
  finishTeach(data, b.runState);
  return n ? { ...b, summary: `${b.summary} (코치 수업 ${n}개 감독 추천으로 처리)` } : b;
}
/** 코치 수업이 남은 보상 (§18.6) — minPending 개 이상, status 가 주어지면 그 결과 */
const teachPending = (minPending = 1, status = null) => (s) => s.phase === "reward"
  && (s.pendingReward?.teach || []).filter((t) => t.result === null).length >= minPending && (!status || s.pendingReward.result?.status === status);
/** 포지션 제한 없는 액티브 3개 (가득 장면 주입 — L48: 스킬 칸 3 = 액티브 몫, 패시브는 칸을 쓰지 않는다) */
const freeActives = (data) => data.skills.filter((k) => k.kind === "active" && k.learnable && !(k.positions || []).length).map((k) => k.id);

/**
 * 패시브 상점 장면 (L48): SP · 힌트 레벨 · 보유를 섞어 주입 — 칩 상태 4가지 (보유 ✓ · 살 수 있음 · SP 부족 · 포지션 밖) 와 힌트 할인 (취소선) 이 한 화면에.
 * 선수마다 첫 패시브(고유)에 힌트 Lv (1 ~ 3 돌아가며), 첫 두 선수는 공용 패시브 하나 보유.
 */
function shopInject(data, st, sp = 120) {
  st.skillPoints = sp;
  const view = lessonRun.getPassiveShopView(st, data);
  view.players.forEach((p, i) => {
    const uq = p.rows.find((r) => r.unique && r.ok);
    if (uq) st.hints[uq.skillId] = Math.max(st.hints[uq.skillId] || 0, 1 + (i % 3));
    const pl = st.players.find((x) => x.id === p.id);
    const common = p.rows.find((r) => !r.unique && r.ok);
    if (i < 2 && common && !pl.learnedSkillIds.includes(common.skillId)) pl.learnedSkillIds.push(common.skillId);
  });
  return st;
}
/** 편성 코치 하나를 유대 80 으로 (파티 패시브 한 단계 위 · ★ 표시) */
function bond80(data, st, at = 0) {
  const up = Number(data.lesson?.bond?.upgradeAt) || 80;
  const sup = st.supports[at];
  if (sup) sup.bond = Math.max(sup.bond, up);
  return sup;
}

// ---- 레슨 화면 (U3) 시나리오 도우미 ----
const playingLesson = (s) => s.phase === "lesson" && s.lesson?.status === "playing";
const lessonHand = (data, s) => lessonRun.getLessonView(s, data).hand;
/** 전체 카드 (경기장 전원 — 자리를 고르지 않는다) */
const isAllCard = (c) => c.targetKind === "all";

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
 * 레슨 중 부상 직후 (결정적 찾기): 시즌 1 레슨 2턴째, 손패의 전체 카드를 출전 선수 체력 30(실패율 25%)에서 낸다 —
 * rng 상태를 바꿔 가며 실패 + 부상이 나오고 레슨이 계속되는 첫 경우. 걸어서는 감독 AI 가 체력을 아껴 부상이 거의 없다.
 */
function injuredLessonState(data, runSeed) {
  // 마지막 턴은 빼고 (구역 방식: 카드를 내 남은 사용이 0 이면 턴이 끝나 마지막 턴이면 레슨이 끝난다)
  const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 2 && s.lesson.turn < s.lesson.turns && lessonHand(data, s).some((c) => isAllCard(c) && c.playable) });
  if (!found) return null;
  const base = found.state;
  const card = lessonHand(data, base).find((c) => isAllCard(c) && c.playable);
  for (let k = 0; k < 400; k++) {
    const st = JSON.parse(JSON.stringify(base));
    st.rngState = (base.rngState + k * 2654435761) >>> 0;
    for (const p of st.players) if (!(p.injuredTurns > 0)) p.stamina = Math.min(p.stamina, 30);
    const before = JSON.parse(JSON.stringify(st));
    lessonRun.playCard(st, data, { uid: card.uid });
    if (playingLesson(st) && st.lesson.out.some((id) => !st.lesson.outAtStart.includes(id))) return { state: st, before, cardId: card.cardId, steps: found.steps + 1 };
  }
  return null;
}

/**
 * 스탯 보기 장면 (§17): 레슨 중 부상 직후 (injuredLessonState — 상승이 쌓였고 부상 1명) + 체력이 가장 낮은 경기장 선수 1명 벤치 (엔진 benchPlayer).
 * cardId 를 주면 손패 첫 장을 그 카드로. info = { uid, injuredId, benchId, rightId (경기장 맨 오른쪽 — 팝오버가 왼쪽으로), leftId (맨 왼쪽) }
 */
function rosterState(name, data, runSeed, { cardId } = {}) {
  const found = injuredLessonState(data, runSeed);
  if (!found) throw new Error(`[${name}] 부상 상태를 찾지 못했습니다`);
  const st = found.state;
  const injuredId = st.lesson.out.find((id) => !st.lesson.outAtStart.includes(id));
  const benchId = tiredest(data, st);
  lessonRun.benchPlayer(st, data, { playerId: benchId, on: true });
  const uid = cardId ? withHandCard(st, cardId, 0) : null;
  const v = lessonRun.getLessonView(st, data);
  const onField = Object.entries(v.positions).sort((a, b) => a[1].x - b[1].x || a[1].y - b[1].y);
  return {
    runState: st, steps: found.steps + 1, preferred: true,
    info: { uid, injuredId, benchId, rightId: onField[onField.length - 1][0], leftId: onField[0][0] },
    summary: `${describeLessonRun(st)} (부상 찾기 + ${benchId} 벤치${cardId ? ` + 손패 첫 장 = ${cardId}` : ""})`,
  };
}

/**
 * 퍼펙트 보상 (결정적): 3턴째 이후 전체 카드가 있는 레슨에서 점수를 퍼펙트 − 1 로 두고 그 카드를 엔진에서 낸다 → phase reward (퍼펙트 · 보상 후보 있음).
 * 걸어서는 퍼펙트가 드물다.
 */
export function perfectRewardState(data, runSeed) {
  const rangeCard = (s) => lessonHand(data, s).find((c) => isAllCard(c) && c.playable);
  const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && !!rangeCard(s) && s.season >= 1 && s.turnIndex >= 2 });
  if (!found) return null;
  const st = found.state;
  st.lesson.score = st.lesson.cap - 1;
  lessonRun.playCard(st, data, { uid: rangeCard(st).uid });
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

// ---- 코치 지원 · 컷인 시나리오 도우미 (§15.8, L37) ----
/** 슈팅 구역에 선 경기장 선수 수 */
const inZone = (s, z) => Object.entries(s.lesson.zones || {}).filter(([id, zz]) => zz === z && !s.lesson.bench.includes(id) && !s.lesson.out.includes(id)).length;
/**
 * 코치 지원이 붙은 레슨 (스크린샷용 주입): 조건(기본 2턴째 이후 · 낼 수 있음 · 그 코치 편성)을 만족하는 레슨에서 손패 첫 장을 cardId 로 바꾸고
 * supportId 코치를 붙인다 (lesson.attach.cur — 엔진은 붙는 턴 · 카드를 rng 로 정하므로 장면을 고르려면 주입). 강화 전 카드라 upgrade = "plus".
 * cutins = 이번 레슨 앞선 컷인 수 (1 이상 = 짧은 컷인). info = { uid, cardId, supportId, at, ids } (choose 로 고른 후보 점)
 */
function attachInject(name, data, runSeed, cardId, supportId, { cutins = 0, until, choose } = {}) {
  const base = (s) => playingLesson(s) && s.lesson.turn >= 2 && s.lesson.playsLeft >= 1 && (s.supports || []).some((x) => x.id === supportId);
  const b = walkOrThrow(name, data, { seed: runSeed, until: (s) => base(s) && (!until || until(s)) });
  const st = b.runState;
  const uid = withHandCard(st, cardId, 0);
  const L = st.lesson;
  const A = L.attach || (L.attach = { turns: [], cur: null, count: {}, log: [], hints: [] });
  A.cur = { uid, supportId, turn: L.turn, upgrade: "plus" };
  A.count[supportId] = (A.count[supportId] || 0) + 1;
  A.log.push({ turn: L.turn, supportId, uid, cardId, played: false });
  L.stats.attaches = (L.stats.attaches || 0) + 1;
  L.stats.cutins = cutins;
  const list = lessonRun.dropCandidates(st, data, { uid });
  const cd = choose ? choose(list, st) : list[0];
  return { ...b, info: { uid, cardId, supportId, at: cd?.at ? { x: cd.at.x, y: cd.at.y } : null, ids: cd?.ids || [] }, summary: `${b.summary} (손패 첫 장 = ${cardId} + ${supportId} 지원 주입, 앞선 컷인 ${cutins})` };
}
/** 하르나(슈팅 구역 ×1.5) + 인터벌 슈팅(중간 원): 슈팅 구역에 2명 이상 선 레슨, 원 = 슈팅 구역 중심 */
const harnaShoot = (name, data, runSeed, opts = {}) => attachInject(name, data, runSeed, "cd_c_harr", "sp_coach_harr", {
  ...opts, until: (s) => inZone(s, "shoot") >= 2,
  choose: (list) => list.find((c) => c.kind === "zone" && c.zone === "shoot") || mostTargets(list),
});
/** 낸다: 카드 클릭(조준) → hover → 타이머 풀고 경기장 클릭 → wait ms → CSS 애니메이션 · 타이머 고정 (연출 중간 프레임) */
const playMid = (prepared, ms) => [
  { click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } },
  { freeze: false }, { clickAt: { sel: FIELD, ...prepared.info.at }, waitMs: 0 }, { wait: ms }, { pauseAnim: true }, { freeze: true },
];

// ---- 고유 카드 모양 시나리오 도우미 (§16.7, L40) ----
/** 미르카 편성 (FW2 = 미르카 — 기본 편성에는 없다) */
const MIRKA = { FW2: "ch_cat_trickster" };
/** 새 편성 A (§19.16, 2-2-2 모두 적성 A): GK 헤르타 · DF 나엘리스 · 코니 · MF 온디나 · 리시엘 · FW 브론테 · 카밀라. NEW_HILDI = FW1 힐디 (새 고유 8장 중 나머지 4장용) */
const SQUAD_A = {
  GK: "ch_giant_keeper", DF1: "ch_elf_regista", DF2: "ch_rabbit_fullback", MF1: "ch_spirit_dribbler", MF2: "ch_elf_archer", FW1: "ch_spirit_striker", FW2: "ch_human_header",
};
const NEW_HILDI = { ...SQUAD_A, FW1: "ch_dwarf_finisher" };
/**
 * 고유 카드 모양 장면: 2턴째 이후 (마지막 턴 아님 · 결장 없음 · 낼 수 있음) 레슨에서 구역을 주입하고 (슬롯 순서 7개) 손패 앞 장들을 cardIds 로 바꾼다.
 * 코치 지원이 그 자리에 붙어 있으면 뗀다 (모양만 보이게). info = { uid (첫 장), uids, ownerId, pos: 경기장 위치, centers: 구역 중심 }
 */
function shapeScene(name, data, runSeed, cardIds, zoneList, { slots } = {}) {
  const b = walkOrThrow(name, data, {
    seed: runSeed, slots,
    until: (s) => playingLesson(s) && s.lesson.turn >= 2 && s.lesson.turn < s.lesson.turns && !s.lesson.out.length && s.lesson.playsLeft >= 1 && s.lesson.hand.length >= cardIds.length,
  });
  const st = b.runState;
  st.lesson.bench = [];
  if (zoneList) st.lesson.zones = Object.fromEntries(st.players.map((p, i) => [p.id, zoneList[i]]));
  // 손패에 이미 있는 고유 카드는 그대로 쓰고 (같은 카드가 두 장 보이지 않게), 없는 카드만 남은 앞 칸에 주입한다
  const cardOfUid = (uid) => st.deck.find((d) => d.uid === uid)?.cardId;
  const have = new Map(st.lesson.hand.map((uid) => [cardOfUid(uid), uid]));
  const taken = new Set(cardIds.map((id) => have.get(id)).filter(Boolean));
  const free = st.lesson.hand.map((uid, i) => (taken.has(uid) ? -1 : i)).filter((i) => i >= 0);
  const uids = cardIds.map((id) => have.get(id) || withHandCard(st, id, free.shift()));
  if (st.lesson.attach?.cur && uids.includes(st.lesson.attach.cur.uid)) st.lesson.attach.cur = null;
  const v = lessonRun.getLessonView(st, data);
  const card = v.hand.find((c) => c.uid === uids[0]);
  return {
    ...b,
    info: { uid: uids[0], uids, cardId: cardIds[0], ownerId: card?.ownerId ?? null, pos: v.positions, centers: v.zoneCfg.centers },
    summary: `${b.summary} (손패 = ${cardIds.join(" · ")}${zoneList ? `, 구역 주입: ${zoneList.join(" · ")}` : ""})`,
  };
}
const handSel = (uid) => `.ls-hand .card-face[data-uid="${uid}"]`;
const ownerFace = (prepared) => `.lesson-screen .tok[data-id="${prepared.info.ownerId}"] .tok-face`;
/** 경기장 점 = 선수 위치 · 구역 중심 (필드 %) */
const atPlayer = (prepared, id) => ({ x: prepared.info.pos[id].x, y: prepared.info.pos[id].y });
const atZone = (prepared, z) => ({ x: prepared.info.centers[z].x, y: prepared.info.centers[z].y });
/** 장면 배치 (슬롯 순서 GK · DF1 · DF2 · MF1 · MF2 · FW1 · FW2 = 네리아 · 도르비나 · 아델린 · 실루엔 · 타리아 · 울리카 · 그레타/미르카) */
const Z_LINK = ["defense", "defense", "physical", "pass", "dribble", "shoot", "shoot"];
const Z_CROSS = ["defense", "defense", "physical", "pass", "shoot", "dribble", "shoot"];
const Z_CROSS_FALLBACK = ["defense", "defense", "physical", "pass", "pass", "shoot", "dribble"];
const Z_CROSS_DEAD = ["defense", "defense", "physical", "pass", "pass", "shoot", "pass"];
const Z_WALL = ["defense", "defense", "defense", "pass", "pass", "shoot", "physical"];
const Z_ZONE = ["defense", "physical", "physical", "physical", "pass", "shoot", "dribble"];
const Z_POST = ["defense", "defense", "pass", "shoot", "dribble", "shoot", "shoot"];
const Z_MOVE = ["defense", "defense", "physical", "pass", "pass", "shoot", "dribble"];
/** 새 편성 (슬롯 순서 GK · DF1 · DF2 · MF1 · MF2 · FW1 · FW2): FW 두 명 슈팅 구역 (마무리 ×2 · 크로스 받을 선수) */
const Z_NEW = ["defense", "defense", "physical", "dribble", "pass", "shoot", "shoot"];

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
  // ---- 패시브 (L48): [✦ 패시브] 상점 모달 · 코치 파티 패시브 ----
  {
    // 시즌 2 레슨 주 + 첫 코치 유대 80 (주입): 코치 칸 파티 패시브 (★ = 유대 80) · 아래 줄 [✦ 패시브 · SP ③]
    name: "og_week_party",
    title: "주 선택 — 코치 칸 파티 패시브 (유대 80 ★) · [✦ 패시브] 배지",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_week_party", data, { seed: runSeed, until: (s) => s.phase === "week" && s.season === 2 && s.weekOffer?.kind === "lesson" });
      shopInject(data, b.runState);
      const sup = bond80(data, b.runState, 0);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 · ${sup?.id} 유대 80 주입)` };
    },
    ready: ".week-screen .roster .bond-pp.up",
    expect: { screen: "run", phase: "week", modal: false },
  },
  {
    // [✦ 패시브] → 상점 모달: 선수 7 × 3 (고유 먼저) · 힌트 할인 취소선 · 보유 ✓ · SP 부족 흐리게 · 포지션 밖 회색 이유 · 추천
    name: "og_passive_shop",
    title: "패시브 상점 모달 (주 선택) — 선수 7 × 고유 1 + 공용 2 · 할인 · 보유 · SP 부족 · 추천",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_passive_shop", data, { seed: runSeed, until: (s) => s.phase === "week" && s.season === 2 && s.weekOffer?.kind === "lesson" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 고유 힌트 Lv1~3 · 첫 두 선수 공용 1 보유 주입)` };
    },
    steps: [{ click: ".week-bar .ps-open" }],
    ready: "#modal-root .passive-shop .ps-chip.st-owned",
    expect: { screen: "run", phase: "week", modal: ".passive-shop" },
  },
  {
    // 상점에서 추천 칩을 눌러 산 직후: 그 칩 ✓ 보유 (초록 반짝) · SP 줄어듦 · 모달은 열린 채 · 토스트 "패시브: … 습득"
    name: "og_passive_shop_bought",
    title: "패시브 상점 — 추천 칩을 눌러 산 직후 (✓ 보유 · SP 감소 · 모달 그대로)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_passive_shop_bought", data, { seed: runSeed, until: (s) => s.phase === "week" && s.season === 2 && s.weekOffer?.kind === "lesson" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 주입 → 추천 칩 구매)` };
    },
    steps: [{ click: ".week-bar .ps-open" }, { click: "#modal-root .ps-chip.recommended" }, { pauseAnim: true }],
    ready: "#modal-root .passive-shop .ps-chip.just.st-owned",
    expect: { screen: "run", phase: "week", modal: ".passive-shop" },
  },
  {
    // 터치 915×412 (가로 폰): [✦ 패시브] 탭 → 상점 모달 (무대가 통째로 줄어도 잘림 · 스크롤 없음)
    name: "og_passive_shop_touch",
    title: "패시브 상점 — 터치 915×412: 버튼 탭 → 모달 (잘림 · 스크롤 없음)",
    outgame: true,
    viewport: { width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_passive_shop_touch", data, { seed: runSeed, until: (s) => s.phase === "week" && s.season === 2 && s.weekOffer?.kind === "lesson" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 주입, 터치)` };
    },
    steps: [{ tap: ".week-bar .ps-open" }],
    ready: "#modal-root .passive-shop .ps-chip",
    expect: { screen: "run", phase: "week", modal: ".passive-shop" },
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
    // 터치 (hasTouch 뷰포트, 실제 터치 탭): 중간 원 카드 탭 → 경기장 구역 가운데 탭 = 원을 그 자리에 놓기 (아직 내지 않음 — 같은 자리 한 번 더 · [내기])
    name: "og_lesson_touch",
    title: "레슨 — 터치: 카드 탭 → 경기장 탭 = 원 놓기 (한 번 더 탭하면 낸다)",
    outgame: true,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
    build: (data, { runSeed }) => injectCard("og_lesson_touch", data, runSeed, "cd_mf_drill", { choose: mostTargets }),
    steps: (prepared) => [{ tap: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { tapAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen.aiming .aim-circle.on.ok",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 터치 끌기 중 (누른 채): 큰 원 카드를 손가락으로 경기장에 — 원 · 대상 강조 (터치 포인터 → 같은 끌기 코드)
    name: "og_lesson_touch_drag",
    title: "레슨 — 터치로 카드 끄는 중 (큰 원, 누른 채)",
    outgame: true,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: true },
    build: (data, { runSeed }) => injectCard("og_lesson_touch_drag", data, runSeed, "cd_attack_build", { choose: mostTargets }),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: FIELD, at: prepared.info.at, steps: 14, touch: true } }],
    ready: ".lesson-screen.dragging .aim-circle.on.ok",
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
  // ---- 고유 카드 모양 (§16.7, L40): 모양 칩 · 이어 주기 · 연결 · 크로스 · 둘레 원 · 구역 전원 · 자리 옮기기 · 가로지르기 ----
  {
    // 손패 고유 카드 4장 앞면: 모양 칩 · 아이콘 · 배율 칩 · 비용 (/명 · 한 명)
    name: "og_lesson_u_hand",
    title: "레슨 — 고유 카드 앞면 (이어 주기 · 자리 옮기기 · 크로스 · 둘레 중간 원)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_hand", data, runSeed, ["cd_u_neria", "cd_u_taria", "cd_u_ulrika", "cd_u_greta"], Z_CROSS),
    ready: ".lesson-screen .card-face.sh-link .cf-ticon.s-link",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 손패 고유 카드 나머지 4장 (미르카 편성): 연결 · 둘레 작은 원 · 구역 전원 · 가로지르기
    name: "og_lesson_u_hand2",
    title: "레슨 — 고유 카드 앞면 (연결 · 둘레 작은 원 · 구역 전원 · 가로지르기)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_hand2", data, runSeed, ["cd_u_silluen", "cd_u_dorbina", "cd_u_adeline", "cd_u_mirka"], Z_MOVE, { slots: MIRKA }),
    ready: ".lesson-screen .card-face.sh-carry .cf-ticon.s-carry",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  // ---- 새 고유 카드 8장 (LESSON_PROTO_PLAN §19.12 ⑥ · §19.14 ⑥, K3): 앞면 2장면 + 마무리 조준 ----
  {
    // 새 편성 A 손패: 헤르타 골문 앞 허들(구역 전원) · 브론테 번개 원터치(마무리) · 나엘리스 물길 롱패스(연결) · 코니 토끼굴 오버래핑(자리 옮기기)
    name: "og_lesson_u_hand3",
    title: "레슨 — 새 고유 카드 앞면 (구역 전원 · 마무리 · 연결 · 자리 옮기기 — 헤르타 · 브론테 · 나엘리스 · 코니)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_hand3", data, runSeed, ["cd_u_herta", "cd_u_bronte", "cd_u_naelis", "cd_u_coni"], Z_NEW, { slots: SQUAD_A }),
    ready: ".lesson-screen .card-face.sh-owner .cf-ticon.s-owner",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 새 편성 (FW1 힐디) 손패: 온디나 물살 타기(가로지르기) · 리시엘 과녁 크로스(크로스) · 카밀라 공중볼 경합(둘레 중간 원) · 힐디 담금질 슈팅(마무리)
    name: "og_lesson_u_hand4",
    title: "레슨 — 새 고유 카드 앞면 (가로지르기 · 크로스 · 둘레 중간 원 · 마무리 — 온디나 · 리시엘 · 카밀라 · 힐디)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_hand4", data, runSeed, ["cd_u_ondina", "cd_u_risiel", "cd_u_camila", "cd_u_hildi"], Z_NEW, { slots: NEW_HILDI }),
    ready: ".lesson-screen .card-face.sh-cross .cf-ticon.s-cross",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 마무리 (§16.7 — U3 때는 주인이 없어 못 찍은 장면): 브론테 카드를 누름 → 주인 토큰 빛 · 슈팅 구역이면 "×2"
    name: "og_lesson_u_finish",
    title: "레슨 — 마무리: 브론테 번개 원터치 조준 (주인 빛 · 슈팅 구역 ×2)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_finish", data, runSeed, ["cd_u_bronte"], Z_NEW, { slots: SQUAD_A }),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }],
    ready: ".lesson-screen.aiming .tok.shape-owner",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 이어 주기: 조준 → 네리아 토큰을 끌어 슈팅 구역 울리카 위에 (누른 채) — 선 + 공 · 받는 선수 "+N ×1.3" · 꼬리표
    name: "og_lesson_u_link",
    title: "레슨 — 이어 주기: 네리아 토큰을 끌어 받는 선수에게 (선 · ×1.3)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_link", data, runSeed, ["cd_u_neria"], Z_LINK),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { drag: { from: ownerFace(prepared), to: FIELD, at: atPlayer(prepared, "p6"), steps: 16 } }],
    ready: ".lesson-screen.dragging .aim-link.on.solid.ok",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 이어 주기 조준 (끌기 전): 네리아 빛 (끄는 출발점) · 받는 후보 초록 테 · dock 안내 "네리아에서 받을 선수에게 끌어 놓으세요"
    name: "og_lesson_u_link_aim",
    title: "레슨 — 이어 주기 조준: 주인 빛 · 받는 후보 · 안내",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_link_aim", data, runSeed, ["cd_u_neria"], Z_LINK),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }],
    ready: ".lesson-screen .tok.shape-src",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 이어 주기 끄는 중 — 받는 선수가 아닌 빈 자리 (빨강 선 · 이유)
    name: "og_lesson_u_link_bad",
    title: "레슨 — 이어 주기 끄는 중: 빈 자리 (빨강 · 받을 선수 위에)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_link_bad", data, runSeed, ["cd_u_neria"], Z_LINK),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { drag: { from: ownerFace(prepared), to: FIELD, at: { x: 50, y: 55 }, steps: 12 } }],
    ready: ".lesson-screen .aim-link.on.bad",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 연결: 조준 hover 그레타 (슈팅) — 점선 · "+N ×1.5"
    name: "og_lesson_u_pick",
    title: "레슨 — 연결: 실루엔 + 고른 선수 (점선 · ×1.5)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_pick", data, runSeed, ["cd_u_silluen"], Z_LINK),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: FIELD, ...atPlayer(prepared, "p7") } }],
    ready: ".lesson-screen .aim-link.on.dash.ok",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 크로스: 슈팅 구역 바닥 빛 · 그 밖 선수 흐리게 · 울리카 → 슈팅 구역 그레타 (주황 점선)
    name: "og_lesson_u_cross",
    title: "레슨 — 크로스: 슈팅 구역 강조 · 울리카 → 슈팅 구역 선수",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_cross", data, runSeed, ["cd_u_ulrika"], Z_CROSS),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: FIELD, ...atPlayer(prepared, "p7") } }],
    ready: ".lesson-screen .zone-pad.aim[data-zone=shoot]",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 크로스 대체 (L47): 슈팅 구역에 울리카 혼자 → 드리블 구역 바닥 빛 · 울리카 → 드리블 구역 그레타
    name: "og_lesson_u_cross_fallback",
    title: "레슨 — 크로스 대체: 슈팅 구역이 비면 드리블 구역 선수",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_cross_fallback", data, runSeed, ["cd_u_ulrika"], Z_CROSS_FALLBACK),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: FIELD, ...atPlayer(prepared, "p7") } }],
    ready: ".lesson-screen .zone-pad.aim[data-zone=dribble]",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 크로스를 낼 수 없음: 슈팅 구역에 울리카 혼자 · 드리블 구역도 비었다 — 카드 흐림 + 이유 띠
    name: "og_lesson_u_cross_dead",
    title: "레슨 — 크로스 낼 수 없음 (슈팅 · 드리블 구역에 받을 선수 없음)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_cross_dead", data, runSeed, ["cd_u_ulrika"], Z_CROSS_DEAD),
    ready: ".lesson-screen .card-face.dim .cf-reason",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 둘레 작은 원: 카드를 누르는 순간 도르비나 중심 원 · 원 안 선수 +N · 실패 없음
    name: "og_lesson_u_wall",
    title: "레슨 — 둘레 작은 원: 도르비나 중심 원 (실패 없음)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_wall", data, runSeed, ["cd_u_dorbina"], Z_WALL),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }],
    ready: ".lesson-screen .aim-circle.on.owner.sz-small",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 구역 전원: 아델린 구역 바닥 빛 · 그 구역 전원 +N · 팀워크 +2
    name: "og_lesson_u_zone",
    title: "레슨 — 구역 전원: 아델린 구역 바닥 · 팀워크 +2",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_zone", data, runSeed, ["cd_u_adeline"], Z_ZONE),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }],
    ready: ".lesson-screen .zone-pad.aim",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 둘레 중간 원: 그레타 중심 원 · 그레타 "+N ×1.5"
    name: "og_lesson_u_post",
    title: "레슨 — 둘레 중간 원: 그레타 중심 · 주인 ×1.5",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_post", data, runSeed, ["cd_u_greta"], Z_POST),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }],
    ready: ".lesson-screen .aim-circle.on.owner.sz-medium",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 자리 옮기기: 조준 → 타리아 토큰을 끌어 슈팅 구역에 (누른 채) — 포인터 유령 · 슈팅 바닥 · 화살표 · 옮길 자리 점 · "+N ×1.3 · 기본 +b"
    name: "og_lesson_u_move",
    title: "레슨 — 자리 옮기기: 타리아 토큰을 슈팅 구역으로 끄는 중",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_move", data, runSeed, ["cd_u_taria"], Z_MOVE),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { drag: { from: ownerFace(prepared), to: FIELD, at: { x: 83, y: 26 }, steps: 16 } }],
    ready: ".lesson-screen .aim-ghost.on.follow",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 자리 옮기기 — 카드를 끌어 수비 구역에 (누른 채): 같은 표시
    name: "og_lesson_u_move_card",
    title: "레슨 — 자리 옮기기: 카드를 수비 구역으로 끄는 중",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_move_card", data, runSeed, ["cd_u_taria"], Z_MOVE),
    steps: (prepared) => [{ drag: { from: handSel(prepared.info.uid), to: FIELD, at: atZone(prepared, "defense"), steps: 16 } }],
    ready: ".lesson-screen.dragging .aim-arrow.on",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 자리 옮기기 조준 + 키 3 (슈팅): 옮긴 자리 유령 · 화살표 · 꼬리표 · dock 기본 훈련 변화
    name: "og_lesson_u_move_key",
    title: "레슨 — 자리 옮기기 키보드: 3 = 슈팅 구역 (유령 · 화살표)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_move_key", data, runSeed, ["cd_u_taria"], Z_MOVE),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: ".ls-dock .ls-info", x: 50, y: 50 } }, { key: "3" }],
    ready: ".lesson-screen .aim-ghost.on:not(.follow)",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 자리 옮기기를 낸 직후: 타리아가 슈팅 구역으로 뛰어가 두 대형이 다시 모인 뒤 훈련 동작
    name: "og_lesson_u_move_after",
    title: "레슨 — 자리 옮기기를 낸 뒤: 옮긴 대형 · 훈련 동작",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_move_after", data, runSeed, ["cd_u_taria"], Z_MOVE),
    steps: (prepared) => [
      { click: handSel(prepared.info.uid) }, { freeze: false }, { clickAt: { sel: FIELD, ...atZone(prepared, "shoot") }, waitMs: 0 }, { wait: 600 }, { pauseAnim: true }, { freeze: true },
    ],
    ready: ".lesson-screen .tok.drilling",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 가로지르기 (미르카 편성): 조준 hover 슈팅 구역 — 지금 구역(드리블) 하늘 점선 · 놓을 구역 분홍 · 꼬리표 "+a 드리블 · +b 슈팅"
    name: "og_lesson_u_carry",
    title: "레슨 — 가로지르기: 미르카 드리블 → 슈팅 (두 바닥 · 두 스탯)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_carry", data, runSeed, ["cd_u_mirka"], Z_MOVE, { slots: MIRKA }),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: FIELD, ...atZone(prepared, "shoot") } }],
    ready: ".lesson-screen .zone-pad.from",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 가로지르기를 지금 구역에: 빨강 "다른 구역에 놓으세요"
    name: "og_lesson_u_carry_bad",
    title: "레슨 — 가로지르기를 지금 구역에 (빨강 — 다른 구역에)",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_carry_bad", data, runSeed, ["cd_u_mirka"], Z_MOVE, { slots: MIRKA }),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { hoverAt: { sel: FIELD, x: atZone(prepared, "dribble").x + 5, y: atZone(prepared, "dribble").y - 8 } }],
    ready: ".lesson-screen .zone-pad.bad",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 가로지르기를 낸 뒤: 두 스탯 두 팝 (위아래)
    name: "og_lesson_u_carry_play",
    title: "레슨 — 가로지르기를 낸 뒤: 두 구역 스탯 두 팝",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_carry_play", data, runSeed, ["cd_u_mirka"], Z_MOVE, { slots: MIRKA }),
    steps: (prepared) => [
      { click: handSel(prepared.info.uid) }, { freeze: false }, { clickAt: { sel: FIELD, ...atZone(prepared, "shoot") }, waitMs: 0 }, { wait: 900 }, { pauseAnim: true }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-pop.row1",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 이어 주기를 낸 직후: 공 호가 네리아 → 울리카로 (중간 프레임)
    name: "og_lesson_u_link_play",
    title: "레슨 — 이어 주기를 낸 직후: 공이 받는 선수에게",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_link_play", data, runSeed, ["cd_u_neria"], Z_LINK),
    steps: (prepared) => [
      { click: handSel(prepared.info.uid) }, { freeze: false }, { clickAt: { sel: FIELD, ...atPlayer(prepared, "p6") }, waitMs: 0 }, { wait: 150 }, { pauseAnim: true }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-ball",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 이어 주기를 낸 뒤: 받는 선수 "+N ×1.3" 팝 (모양 색)
    name: "og_lesson_u_link_pop",
    title: "레슨 — 이어 주기를 낸 뒤: 받는 선수 +N ×1.3",
    outgame: true,
    build: (data, { runSeed }) => shapeScene("og_lesson_u_link_pop", data, runSeed, ["cd_u_neria"], Z_LINK),
    steps: (prepared) => [
      { click: handSel(prepared.info.uid) }, { freeze: false }, { clickAt: { sel: FIELD, ...atPlayer(prepared, "p6") }, waitMs: 0 }, { wait: 760 }, { pauseAnim: true }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-pop.shape",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 전체 카드(기초 훈련)를 낸 직후: 경기장 7명이 제자리에서 훈련 동작 · "+N" 팝 (타이머를 풀고 [내기] → 430ms 뒤 다시 고정)
    name: "og_lesson_mid",
    title: "레슨 — 기초 훈련(전체)을 낸 직후: 7명 제자리 훈련 · +N 팝",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_lesson_mid", data, { seed: runSeed, until: (s) => playingLesson(s) && lessonHand(data, s).some((c) => c.cardId === "cd_basic" && c.playable) }),
    steps: [
      { click: '.ls-hand .card-face[data-card="cd_basic"]' },
      { freeze: false }, { click: ".ls-btns .ls-play", waitMs: 0 }, { wait: 430 }, { freeze: true },
    ],
    ready: ".lesson-screen .m-pop",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  // ---- 코치 지원 · 컷인 (§15.8, L37) ----
  {
    // 손패에 코치가 붙은 카드: 코치 색 테두리 · 빛 · 줄무늬 띠 · 메타 줄 코치 칩 (얼굴 + "하르나 지원") · 코치 색 "+" · dock 지원 줄
    name: "og_lesson_attach",
    title: "레슨 — 코치 지원이 붙은 카드 (하르나 → 인터벌 슈팅+)",
    outgame: true,
    build: (data, { runSeed }) => harnaShoot("og_lesson_attach", data, runSeed),
    ready: ".lesson-screen .card-face.attached .cf-coach",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 붙은 카드 조준 (슈팅 구역 중심): ×1.5 가 걸린 대상 "+N" = 코치 색 말풍선 · 노트 맨 앞 "하르나 지원 · 슈팅 구역 ×1.5"
    name: "og_lesson_attach_aim",
    title: "레슨 — 하르나 지원 카드 조준: 코치 색 +N · 지원 노트",
    outgame: true,
    build: (data, { runSeed }) => harnaShoot("og_lesson_attach_aim", data, runSeed),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { hoverAt: { sel: FIELD, ...prepared.info.at } }],
    ready: ".lesson-screen .tok-name.bub.att",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 붙은 카드를 끄는 중 (손패 위, 누른 채): 유령 = 코치 색 테두리 · 코치 얼굴 · "하르나 지원"
    name: "og_lesson_attach_drag",
    title: "레슨 — 하르나 지원 카드 끄는 중 (유령에 코치 얼굴)",
    outgame: true,
    build: (data, { runSeed }) => harnaShoot("og_lesson_attach_drag", data, runSeed),
    steps: (prepared) => [{ drag: { from: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]`, to: ".lesson-screen .ls-info", steps: 8 } }],
    ready: ".drag-ghost.card-ghost.attached .dg-coach",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 첫 컷인 중간 (0.9초 중 0.42초): 덮개 · 코치 타입 색 띠 · 얼굴 · 이름 · 대사 · 능력 · 낸 카드 · "탭하여 넘기기"
    name: "og_lesson_cutin",
    title: "레슨 — 코치 컷인 (첫 번, 중간 프레임): 하르나 · 골문을 보는 눈",
    outgame: true,
    build: (data, { runSeed }) => harnaShoot("og_lesson_cutin", data, runSeed),
    steps: (prepared) => playMid(prepared, 420),
    ready: ".ls-cutin.on .lc-band",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 컷인이 끝난 뒤 능력 연출: 슈팅 구역 대상 "+N ×1.5" (코치 색) · 훈련 고리 코치 색 · 경기장 가운데 능력 알약 (유대 +5)
    name: "og_lesson_cutin_after",
    title: "레슨 — 컷인 뒤 능력 연출: +N ×1.5 (코치 색) · 능력 알약",
    outgame: true,
    build: (data, { runSeed }) => harnaShoot("og_lesson_cutin_after", data, runSeed),
    steps: (prepared) => playMid(prepared, 1480),
    ready: ".lesson-screen .ls-abil",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 두 번째 컷인 (짧은 판 0.6초 중 0.25초): 오르넬라 → 2인 1조 드릴 (새 작은 원 카드) — 섬광 · 얼굴 튀기 · "탭하여 넘기기" 없음
    name: "og_lesson_cutin_short",
    title: "레슨 — 코치 컷인 (두 번째, 짧은 판): 오르넬라 · 2인 1조 드릴",
    outgame: true,
    build: (data, { runSeed }) => attachInject("og_lesson_cutin_short", data, runSeed, "cd_pair_drill", "sp_elder_sage", {
      cutins: 1, choose: (list) => list.find((c) => c.ids.length === 2) || mostTargets(list),
    }),
    steps: (prepared) => playMid(prepared, 250),
    ready: ".ls-cutin.on.short .lc-band",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 움직임 줄이기 (prefers-reduced-motion): 컷인 덮개 없이 dock 안내 칸에 "바르바라 지원 발동 — 다치지 않는 법 · 이 카드 실패 없음"
    name: "og_lesson_cutin_noanim",
    title: "레슨 — 움직임 줄이기: 컷인 대신 안내 칸 (바르바라 지원 발동)",
    outgame: true,
    reducedMotion: true,
    build: (data, { runSeed }) => attachInject("og_lesson_cutin_noanim", data, runSeed, "cd_mf_drill", "sp_iron_captain", { choose: mostTargets }),
    steps: (prepared) => [{ click: `.ls-hand .card-face[data-uid="${prepared.info.uid}"]` }, { clickAt: { sel: FIELD, ...prepared.info.at }, waitMs: 400 }],
    ready: ".lesson-screen .ls-cut-recap",
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
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (체력 30 으로 낮춰 전체 카드 — 부상 찾기)` };
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
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` },
      { freeze: false }, { click: ".ls-btns .ls-play", waitMs: 0 }, { wait: 430 }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-hand .card-face",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  // ---- 스탯 보기 (§17): 명단 줄 구역 스탯 · 이번 레슨 +N · 선수 정보 팝오버 (토큰 누르기 · hover · ⓘ — 카드를 골라도) ----
  {
    // 명단 7줄: 서 있는 구역의 지금 스탯 · 등급 · 이번 레슨 +N — 벤치 줄(돌아갈 구역) · 레슨 중 부상 줄 · 지친 줄도 읽힌다
    name: "og_lesson_roster",
    title: "레슨 — 명단: 구역 스탯 · 이번 레슨 +N (벤치 · 부상 줄 포함)",
    outgame: true,
    build: (data, { runSeed }) => rosterState("og_lesson_roster", data, runSeed),
    ready: ".lesson-screen .ls-row.benched .ls-cur.on-bench",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 카드를 고르지 않고 오른쪽 끝 토큰을 누름 → 토큰 왼쪽에 팝오버 (스탯 5 · 등급 · 이번 레슨 · 성장, 지금 구역 줄 강조)
    name: "og_lesson_info_tok",
    title: "레슨 — 토큰 누르기 = 선수 정보 팝오버 (토큰 옆)",
    outgame: true,
    build: (data, { runSeed }) => rosterState("og_lesson_info_tok", data, runSeed),
    steps: (prepared) => [{ click: `.lesson-screen .tok[data-id="${prepared.info.rightId}"] .tok-face` }],
    ready: ".lesson-screen .ls-pinfo.on.pinned",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 마우스를 토큰에 올림 (데스크톱 hover) → 잠깐 뒤 팝오버 (× 없음 · 누를 수 없음)
    name: "og_lesson_info_hover",
    title: "레슨 — 토큰 hover = 선수 정보 팝오버 (고정 아님)",
    outgame: true,
    build: (data, { runSeed }) => rosterState("og_lesson_info_hover", data, runSeed),
    steps: (prepared) => [{ hoverAt: { sel: `.lesson-screen .tok[data-id="${prepared.info.leftId}"] .tok-face`, x: 50, y: 50 }, waitMs: 250 }],
    ready: ".lesson-screen .ls-pinfo.on.hover",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 카드를 고른 채 (조준 모드) 명단 ⓘ → 명단 줄 왼쪽에 팝오버, 조준은 그대로
    name: "og_lesson_info_aim",
    title: "레슨 — 카드 조준 중 명단 ⓘ = 선수 정보 팝오버 (조준 유지)",
    outgame: true,
    build: (data, { runSeed }) => rosterState("og_lesson_info_aim", data, runSeed, { cardId: "cd_mf_drill" }),
    steps: (prepared) => [{ click: handSel(prepared.info.uid) }, { click: `.ls-row[data-pid="${prepared.info.rightId}"] .ls-pi-btn` }],
    ready: ".lesson-screen.aiming .ls-pinfo.on.pinned",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 터치 기기 915×412 (가로 폰): 토큰 탭 = 팝오버 — 무대가 통째로 줄어도 잘림 · 스크롤 없음
    name: "og_lesson_info_touch",
    title: "레슨 — 터치 915×412: 토큰 탭 = 선수 정보 팝오버",
    outgame: true,
    viewport: { width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    build: (data, { runSeed }) => rosterState("og_lesson_info_touch", data, runSeed),
    steps: (prepared) => [{ tap: `.lesson-screen .tok[data-id="${prepared.info.leftId}"] .tok-face` }],
    ready: ".lesson-screen .ls-pinfo.on.pinned",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 터치 915×412: 카드 탭(조준) → 명단 ⓘ 탭 = 팝오버 (조준 유지)
    name: "og_lesson_info_touch_aim",
    title: "레슨 — 터치 915×412: 카드 조준 중 ⓘ 탭 = 선수 정보 팝오버",
    outgame: true,
    viewport: { width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    build: (data, { runSeed }) => rosterState("og_lesson_info_touch_aim", data, runSeed, { cardId: "cd_mf_drill" }),
    steps: (prepared) => [{ tap: handSel(prepared.info.uid) }, { tap: `.ls-row[data-pid="${prepared.info.injuredId}"] .ls-pi-btn` }],
    ready: ".lesson-screen.aiming .ls-pinfo.on.pinned",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 팀형 · 분위기 > 0 에서 전체 카드 1장 = 턴 끝: 기본 훈련(분위기 몫 포함) "+N" 팝 · 가운데 "턴 n — 기본 훈련 +N" (연출 1.25초 지점)
    name: "og_lesson_turnend",
    title: "레슨 — 턴 끝 연출: 기본 훈련 +N (분위기 몫 포함) · 턴 배너",
    outgame: true,
    build: (data, { runSeed }) => {
      // 코치 지원이 붙은 카드는 빼고 (컷인이 먼저라 1.25초 지점이 달라진다). 붙기 rng (§15) 로 seed 1 에서 못 찾으면 seed 를 바꿔 찾는다
      const rangeCard = (s) => lessonHand(data, s).find((c) => isAllCard(c) && c.playable && !c.attach);
      // 퍼펙트까지 여유가 있어야 턴 끝 연출이 나온다 (카드 한 장으로 퍼펙트면 레슨이 끝난다)
      const cond = (s) => playingLesson(s) && s.lesson.buffs.mood > 0 && s.lesson.playsLeft === 1 && !!rangeCard(s) && s.lesson.turn < s.lesson.turns && s.lesson.cap - s.lesson.score > 150;
      let found = null;
      for (let k = 0; k < 30 && !found; k++) found = walkLesson(data, { seed: k ? `${runSeed}-turnend-${k}` : runSeed, policy: "team", until: cond });
      if (!found) throw new Error("[og_lesson_turnend] 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, info: { cardId: rangeCard(found.state).cardId }, preferred: true, summary: describeLessonRun(found.state) };
    },
    steps: (prepared) => [
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` },
      { freeze: false }, { click: ".ls-btns .ls-play", waitMs: 0 }, { wait: 1250 }, { freeze: true },
    ],
    ready: ".lesson-screen .ls-pop.base",
    expect: { screen: "run", phase: "lesson", modal: false },
  },
  {
    // 점수를 퍼펙트 1 전으로 주입하고 전체 카드: 레슨 끝 배너 "퍼펙트!" (보상 모달 전)
    name: "og_lesson_end",
    title: "레슨 — 퍼펙트 배너 (레슨 끝 연출, 보상 모달 직전)",
    outgame: true,
    build: (data, { runSeed }) => {
      const rangeCard = (s) => lessonHand(data, s).find((c) => isAllCard(c) && c.playable && !c.attach); // 코치 지원 카드면 컷인이 먼저라 1.3초 지점이 달라진다
      const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn >= 3 && !!rangeCard(s) });
      if (!found) throw new Error("[og_lesson_end] 상태를 찾지 못했습니다");
      found.state.lesson.score = found.state.lesson.cap - 1;
      return { runState: found.state, steps: found.steps, info: { cardId: rangeCard(found.state).cardId }, preferred: true, summary: `${describeLessonRun(found.state)} (점수 = 퍼펙트 − 1 주입)` };
    },
    steps: (prepared) => [
      { click: `.ls-hand .card-face[data-card="${prepared.info.cardId}"]` },
      { freeze: false }, { click: ".ls-btns .ls-play", waitMs: 0 }, { wait: 1300 }, { freeze: true },
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
    build: (data, { runSeed }) => walkRewardOrThrow("og_reward_clear", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }),
    ready: "#modal-root .reward-modal .rw-offer .card-face",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 선수 힌트 (L48, src "player"): 퍼펙트 보상 = 선수 힌트 2 — 힌트 칩 "(얼굴) 울리카 · 측면 질주 Lv1" · SP 칩 (TP 옆, 레슨 SP)
    name: "og_reward_player_hint",
    title: "레슨 결과 — 선수 힌트 (얼굴 · 선수 · 패시브 Lv) · SP 칩 (TP 옆)",
    outgame: true,
    build: (data, { runSeed }) => walkRewardOrThrow("og_reward_player_hint", data, {
      seed: runSeed,
      until: (s) => s.phase === "reward" && s.pendingReward?.offer.length > 0 && (s.pendingReward.result?.hints || []).filter((x) => x.src === "player").length >= 2,
    }),
    ready: "#modal-root .reward-modal .rw-chip.hint .rw-hint-pl",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 보상 후보에 고유 카드 강화 (주입 — 후보 첫 장 = 덱의 네리아 고유 카드 강화판): 앞면 모양 칩 · 아이콘 · 배율 칩
    name: "og_reward_unique",
    title: "레슨 결과 — 보상 후보에 고유 카드 강화 (모양 칩 · 배율 칩)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkRewardOrThrow("og_reward_unique", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 });
      const st = b.runState;
      const e = st.deck.find((d) => d.cardId === "cd_u_neria");
      st.pendingReward.offer[0] = { cardId: "cd_u_neria", plus: true, kind: "upgrade", uid: e.uid };
      return { ...b, summary: `${b.summary} (보상 후보 첫 장 = 네리아 고유 카드 강화 주입)` };
    },
    ready: "#modal-root .reward-modal .rw-offer .card-face.sh-link",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 클리어 보상에서 카드 1장(추천 카드, 없으면 첫 장)을 고른 상태: 금색 테두리 · 설명 · [확인] 켜짐
    name: "og_reward_pick",
    title: "레슨 결과 — 카드를 고른 상태 (설명 · [확인] 켜짐)",
    outgame: true,
    build: (data, { runSeed }) => walkRewardOrThrow("og_reward_pick", data, { seed: runSeed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }),
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
      finishTeach(data, found.state);
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (점수 = 퍼펙트 − 1 주입 후 전체 카드)` };
    },
    steps: [{ click: "#modal-root .rw-offer .card-face" }, { click: "#modal-root .rw-deck .mini-card.recommended" }],
    ready: "#modal-root .reward-modal .rw-deck .mini-card.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  // 퍼펙트 + 덱이 큰 경우 (덱 주입 — ZI 브라우저 점검에서 시즌 3 덱 18장이 [확인]을 화면 밖으로 밀어냈다): 16장(2줄) · 18장 · 24장(3줄 촘촘) · 32장(4줄)
  ...[16, 18, 24, 32].map((n) => ({
    name: `og_reward_perfect_${n}`,
    title: `레슨 결과 — 퍼펙트 · 덱 ${n}장: 무료 강화 그리드가 [확인]을 밀어내지 않는가`,
    outgame: true,
    build: (data, { runSeed }) => {
      const found = perfectRewardState(data, runSeed);
      if (!found) throw new Error(`[og_reward_perfect_${n}] 상태를 찾지 못했습니다`);
      const st = finishTeach(data, found.state);
      const extra = ["cd_fw_drill", "cd_mf_drill", "cd_df_drill", "cd_gk_session", "cd_attack_build", "cd_defense_org", "cd_one_two", "cd_one_on_one", "cd_tactics_board", "cd_icing"];
      while (st.deck.length < n) { st.deck.push({ uid: `k${st.nextUid}`, cardId: extra[st.deck.length % extra.length], plus: st.deck.length % 4 === 0 }); st.nextUid += 1; }
      return { runState: st, steps: found.steps, preferred: true, summary: `${describeLessonRun(st)} (퍼펙트 주입 · 덱 ${n}장 주입)` };
    },
    steps: [{ click: "#modal-root .rw-offer .card-face" }, { click: "#modal-root .rw-deck .mini-card.recommended" }],
    ready: "#modal-root .reward-modal .rw-deck .mini-card.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  })),
  {
    name: "og_reward_fail",
    title: "레슨 결과 — 실패: 결과 머리 + 보상 없음 + [계속]",
    outgame: true,
    build: (data, { runSeed }) => {
      // L39 (목표 20% 낮춤) · L40 보정 뒤로 감독 AI 레슨은 거의 실패하지 않는다 → 마지막 턴 점수를 낮춰 주입하고 [턴 끝] (엔진이 실패로 끝낸다)
      const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn === s.lesson.turns });
      if (!found) throw new Error("[og_reward_fail] 마지막 턴을 찾지 못했습니다");
      const st = found.state;
      st.lesson.score = Math.floor(st.lesson.target * 0.6);
      lessonRun.endLessonTurn(st, data);
      if (st.phase !== "reward" || st.pendingReward?.result?.status !== "fail") throw new Error("[og_reward_fail] 실패 결과가 아닙니다");
      finishTeach(data, st);
      return { runState: st, steps: found.steps + 1, preferred: true, summary: `${describeLessonRun(st)} (마지막 턴 점수 주입 → 실패)` };
    },
    ready: "#modal-root .reward-modal .rw-none",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  // ---- 코치 수업 (§18.6): 액티브 힌트 → 보상 모달 수업 칸 (카드 고르기 대신) ----
  {
    // 빈 슬롯 · 추천 배지 (수업 1/n, 선수 7 칩 — 포지션 밖 · 이미 보유는 회색)
    name: "og_reward_teach",
    title: "레슨 결과 — 클리어 · 코치 수업: '○○ 코치가 …을 가르쳐 줍니다' · 받을 선수 7 (추천 · 회색 이유)",
    outgame: true,
    build: (data, { runSeed }) => {
      // 클리어 보상의 수업을 먼저 (퍼펙트 · 수업 2개는 og_reward_teach_multi), 없으면 아무 수업
      const found = walkLesson(data, { seed: runSeed, until: teachPending(1, "clear") }) || walkLesson(data, { seed: runSeed, until: teachPending(1) });
      if (!found) throw new Error("[og_reward_teach] 수업이 남은 보상을 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: describeLessonRun(found.state) };
    },
    ready: "#modal-root .reward-modal .rw-teach-pl.recommended",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 추천 선수를 고른 상태: 금색 테두리 · 요약 "…에게 '…' — 빈 칸에 배웁니다" · [가르치기] 켜짐
    name: "og_reward_teach_pick",
    title: "레슨 결과 — 코치 수업: 선수를 고름 ([가르치기] 켜짐)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_reward_teach_pick", data, { seed: runSeed, until: teachPending(1) }),
    steps: [{ click: "#modal-root .rw-teach-pl.recommended" }],
    ready: "#modal-root .rw-teach-pl.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 수업 2개 보상에서 첫 수업을 엔진으로 끝낸 뒤 (칩 "수업 … → 선수") 둘째 수업: 받을 수 있는 첫 선수를 가득(액티브 3 + 패시브 1) 으로 주입 → 그 선수 고름 →
    // 바꿀 액티브 줄 (패시브는 칸을 쓰지 않아 목록에 없다 — L48) · 둘째 액티브 고름 (취소선)
    name: "og_reward_teach_full",
    title: "레슨 결과 — 코치 수업 2/2: 가득인 선수 → 바꿀 액티브 줄 (패시브는 빠짐 · 고른 스킬은 사라짐)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_reward_teach_full", data, { seed: runSeed, until: teachPending(2) });
      const st = b.runState;
      lessonRun.resolveTeach(st, data, manager.recommendTeach(st, data));
      const cur = lessonRun.getRewardView(st, data).teach.cur;
      const acts = freeActives(data).filter((id) => id !== cur.skillId).slice(0, 3);
      const p = st.players.find((x) => cur.players.find((c) => c.id === x.id)?.ok);
      const pas = lessonRun.getPassiveShopView(st, data).players.find((x) => x.id === p.id).rows.find((r) => r.ok)?.skillId;
      p.learnedSkillIds = [...acts.slice(0, 3), ...(pas ? [pas] : [])];
      return { ...b, info: { pid: p.id, rep: p.learnedSkillIds[1] }, summary: `${b.summary} (첫 수업 처리 · ${p.name} 액티브 3 + 패시브 1 주입)` };
    },
    steps: (prepared) => [{ click: `#modal-root .rw-teach-pl[data-pid="${prepared.info.pid}"]` }, { click: `#modal-root .rw-rep-btn[data-skill="${prepared.info.rep}"]` }],
    ready: "#modal-root .rw-teach-rep .rw-rep-btn.selected",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 받을 선수 없음 (주입): 수업 = FW 전용 액티브, FW 2명이 이미 보유 → 선수 칩 모두 회색 · 안내 · [SP +20 받기] 하나
    name: "og_reward_teach_none",
    title: "레슨 결과 — 코치 수업: 받을 선수 없음 (모두 회색 · SP +20 받기)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_reward_teach_none", data, { seed: runSeed, until: teachPending(1) });
      const st = b.runState;
      const fw = data.skills.find((k) => k.kind === "active" && k.learnable && (k.positions || []).length === 1 && k.positions[0] === "FW");
      st.pendingReward.teach.find((t) => t.result === null).skillId = fw.id;
      for (const p of st.players) if (p.position === "FW" && !p.learnedSkillIds.includes(fw.id)) p.learnedSkillIds = [...p.learnedSkillIds.slice(0, 2), fw.id];
      return { ...b, summary: `${b.summary} (수업 = ${fw.name} · FW 보유 주입)` };
    },
    ready: "#modal-root .rw-teach-none",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 퍼펙트 + 수업 2개: 수업 1/2 (무료 강화 · 카드 고르기는 수업 뒤 단계)
    name: "og_reward_teach_multi",
    title: "레슨 결과 — 퍼펙트 · 코치 수업 1/2 (카드 고르기 · 무료 강화는 수업 뒤)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = walkLesson(data, { seed: runSeed, until: teachPending(2, "perfect") }) || walkLesson(data, { seed: runSeed, until: teachPending(2) });
      if (!found) throw new Error("[og_reward_teach_multi] 수업 2개가 남은 보상을 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: describeLessonRun(found.state) };
    },
    ready: "#modal-root .reward-modal .rw-teach-title",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 실패 레슨 + 컷인 수업 (주입 — 실패 레슨도 컷인 힌트는 받는다): 실패 머리 · 수업 칸 · "수업이 끝나면 다음 주로"
    name: "og_reward_teach_fail",
    title: "레슨 결과 — 실패 + 코치 지원 수업 (수업 뒤 보상 없음)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = walkLesson(data, { seed: runSeed, until: (s) => playingLesson(s) && s.lesson.turn === s.lesson.turns });
      if (!found) throw new Error("[og_reward_teach_fail] 마지막 턴을 찾지 못했습니다");
      const st = found.state;
      st.lesson.score = Math.floor(st.lesson.target * 0.6);
      lessonRun.endLessonTurn(st, data);
      if (st.phase !== "reward" || st.pendingReward?.result?.status !== "fail") throw new Error("[og_reward_teach_fail] 실패 결과가 아닙니다");
      if (!st.pendingReward.teach.some((t) => t.result === null)) {
        const sup = st.supports.find((x) => (data.supports.find((d) => d.id === x.id)?.hintSkillIds || []).includes("sk_rally_cry")) || st.supports[0];
        st.pendingReward.teach.push({ skillId: "sk_rally_cry", supportId: sup.id, src: "cutin", result: null, playerId: null, replaced: null, sp: 0 });
      }
      return { runState: st, steps: found.steps + 1, preferred: true, summary: `${describeLessonRun(st)} (마지막 턴 점수 주입 → 실패 · 컷인 수업)` };
    },
    ready: "#modal-root .reward-modal .rw-teach",
    expect: { screen: "run", phase: "reward", modal: ".reward-modal" },
  },
  {
    // 터치 915×412: 수업 칸 선수 칩을 손가락으로 탭 → 고름 (무대가 통째로 줄어도 잘림 · 스크롤 없음)
    name: "og_reward_teach_touch",
    title: "레슨 결과 — 터치 915×412: 코치 수업 선수 칩 탭",
    outgame: true,
    viewport: { width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    build: (data, { runSeed }) => walkOrThrow("og_reward_teach_touch", data, { seed: runSeed, until: teachPending(1) }),
    steps: [{ tap: "#modal-root .rw-teach-pl.recommended" }],
    ready: "#modal-root .rw-teach-pl.selected",
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
    // 꽉 찬 상담 (주입): 패시브 힌트 7개 · 덱 +10장(24장) · TP 200 · SP 600 — 패시브 칸 (선수 7 × 3) · 덱 6줄이 스크롤 없이 들어가는지
    name: "og_consult_full",
    title: "상담 — 꽉 참: 패시브 힌트 7 · SP 600 (선수 7 × 3 칩) · 덱 24장 (TP · SP 주입)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_full", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      const st = b.runState;
      st.trainingPoints = 200;
      st.skillPoints = 600;
      // 상담은 패시브만 판다 (§18.5) — 편성 코치 힌트의 패시브 먼저, 모자라면 다른 학습 패시브
      const isPassive = (id) => data.skills.find((k) => k.id === id)?.kind === "passive";
      const coachIds = st.supports.flatMap((x) => (data.supports.find((d) => d.id === x.id)?.hintSkillIds || [])).filter(isPassive);
      const ids = [...new Set([...coachIds, ...data.skills.filter((k) => k.kind === "passive" && k.learnable).map((k) => k.id)])];
      ids.slice(0, 7).forEach((id, i) => { st.hints[id] = 1 + (i % 3); });
      const extra = ["cd_fw_drill", "cd_mf_drill", "cd_df_drill", "cd_gk_session", "cd_attack_build", "cd_defense_org", "cd_one_two", "cd_one_on_one", "cd_tactics_board", "cd_icing"];
      while (st.deck.length < 24) { st.deck.push({ uid: `k${st.nextUid}`, cardId: extra[st.deck.length % extra.length], plus: st.deck.length % 3 === 0 }); st.nextUid += 1; }
      return { ...b, summary: `${b.summary} (힌트 7 · 덱 24 · TP 200 · SP 600 주입)` };
    },
    ready: ".consult-screen .ps-grid.compact .ps-chip",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 상담 패시브 칸 (L48): 걸어 온 그대로 + SP 300 (주입) — 머리 "패시브 (SP)" · 선수 7 × 3 칩 · 액티브 안내 한 줄
    name: "og_consult_passive",
    title: "상담 — 패시브 칸 (선수 7 × 고유 1 + 공용 2) · 액티브는 코치 수업 안내",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_passive", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      const st = b.runState;
      st.skillPoints = Math.max(st.skillPoints, 300);
      return { ...b, summary: `${b.summary} (SP 300 주입)` };
    },
    ready: ".consult-screen .ps-grid.compact .ps-chip",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 상담 패시브 칸 (L48, 주입 shopInject): 힌트 할인 (취소선 · Lv) · 보유 ✓ · SP 부족 · 포지션 밖 · 추천 (recommendConsult skill)
    name: "og_consult_passives",
    title: "상담 — 패시브 칸: 힌트 할인 · 보유 ✓ · SP 부족 · 추천 (SP 120 · 힌트 · 보유 주입)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_passives", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 고유 힌트 Lv1~3 · 첫 두 선수 공용 1 보유 주입)` };
    },
    ready: ".consult-screen .ps-grid.compact .ps-chip.st-owned",
    expect: { screen: "run", phase: "consult", modal: false },
  },
  {
    // 상담 [크게 보기] → 같은 상점 모달 (설명 줄까지)
    name: "og_consult_passives_modal",
    title: "상담 — [크게 보기] → 패시브 상점 모달 (주 · 경기 전 준비와 같은 모달)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_passives_modal", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 주입)` };
    },
    steps: [{ click: ".consult-screen .cs-ps-open" }],
    ready: "#modal-root .passive-shop .ps-chip",
    expect: { screen: "run", phase: "consult", modal: ".passive-shop" },
  },
  {
    // 옛 고유 패시브 4개 (L45) → L48 에서 그 캐릭터의 고유 패시브: 밀물의 벽 = 네리아(GK) · 주장의 외침 = 아델린 · 지치지 않는 다리 = 타리아 ·
    // 고양이 페인트 = 미르카 (기본 편성에 없음). 힌트 Lv1 주입 → 그 선수 칩에 할인 · Lv
    name: "og_consult_old_innate",
    title: "상담 — 옛 고유 패시브 (L48: 네리아 · 아델린 · 타리아 고유) 힌트 Lv1 할인",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_consult_old_innate", data, { seed: runSeed, until: (s) => s.phase === "consult" });
      const st = b.runState;
      st.skillPoints = Math.max(st.skillPoints, 400);
      for (const id of ["sk_tide_wall", "sk_captain_call", "sk_tireless", "sk_feint"]) st.hints[id] = Math.max(st.hints[id] || 0, 1);
      return { ...b, summary: `${b.summary} (옛 고유 패시브 힌트 4 · SP 400 주입)` };
    },
    ready: '.consult-screen .ps-chip[data-skill="sk_tide_wall"]',
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
    // 경기 전 준비 편집: DF2 아델린(MF B)을 끌어 MF1 실루엔(DF C)에 놓기 (맞바꾸기) → 자리 변경 표시 ("← 원래")
    name: "og_prep_swap",
    title: "경기 전 준비 — DF2 ↔ MF1 맞바꾼 뒤 (← 원래)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep_swap", data, { seed: runSeed, until: (s) => s.phase === "prep" }),
    steps: [{ drag: { from: '.prep-edit .lu-slot[data-slot="DF2"]', to: '.prep-edit .lu-slot[data-slot="MF1"]', release: true } }],
    ready: ".prep-screen .lu-slot[data-slot=\"MF1\"] .warn",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 부상 선수 (주입 — DF2 레슨 결장 2): 경기 전 준비 "부상 1명 — 레슨만 쉬고 경기는 그대로 출전" (유스 없음, §18.1)
    name: "og_prep_injured",
    title: "경기 전 준비 — 부상 선수: 레슨만 쉬고 경기는 그대로 출전",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_prep_injured", data, { seed: runSeed, until: (s) => s.phase === "prep" });
      b.runState.players[2].injuredTurns = 2;
      return { ...b, summary: `${b.summary} (${b.runState.players[2].name} 부상 2 주입)` };
    },
    ready: ".prep-screen .po-out",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 새 편성 A 의 경기 전 준비: 슬롯 카드 이름 옆 ✨ (등급 색 — SSR 헤르타 · 브론테, SR 나엘리스 · 온디나 · 리시엘, R 코니 · 카밀라)
    name: "og_prep_ult",
    title: "경기 전 준비 — 새 편성 A: 슬롯 카드 필살기 ✨ (등급 색)",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep_ult", data, { seed: runSeed, slots: SQUAD_A, until: (s) => s.phase === "prep" }),
    ready: ".prep-screen .lu-slot .ult-mark.tier-SSR",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 기본 편성 + GK 헤르타 (주장 2명 — 헤르타 · 아델린): 왼쪽 칸 "주장 2명 — 팀워크 +10은 1명분" (L46)
    name: "og_prep_captain2",
    title: "경기 전 준비 — 주장 2명 (GK 헤르타 + 아델린): 주장 칩",
    outgame: true,
    build: (data, { runSeed }) => walkOrThrow("og_prep_captain2", data, { seed: runSeed, slots: { GK: "ch_giant_keeper" }, until: (s) => s.phase === "prep" }),
    ready: ".prep-screen .po-cap .cap-note",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 경기 전 준비 (L48): 왼쪽 칸 코치 파티 패시브 6 (첫 코치 유대 80 ★ 주입) · 편집기 아래 [✦ 패시브 · SP ③] [경기 시작]
    name: "og_prep_party",
    title: "경기 전 준비 — 코치 파티 패시브 6 (유대 80 하나) · [✦ 패시브] 버튼",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_prep_party", data, { seed: runSeed, until: (s) => s.phase === "prep" });
      shopInject(data, b.runState);
      const sup = bond80(data, b.runState, 0);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 · ${sup?.id} 유대 80 주입)` };
    },
    ready: ".prep-screen .po-party .pp-item.up",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 경기 전 준비 + 부상 + 주장 2명 (가장 긴 왼쪽 칸): 파티 패시브 목록이 아래 안내와 겹치지 않는가
    name: "og_prep_party_long",
    title: "경기 전 준비 — 파티 패시브 + 부상 1 + 주장 2명 (왼쪽 칸이 가장 길 때)",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_prep_party_long", data, { seed: runSeed, slots: { GK: "ch_giant_keeper" }, until: (s) => s.phase === "prep" });
      b.runState.players[2].injuredTurns = 2;
      return { ...b, summary: `${b.summary} (GK 헤르타 · ${b.runState.players[2].name} 부상 2 주입)` };
    },
    ready: ".prep-screen .po-party .pp-item",
    expect: { screen: "run", phase: "prep", modal: false },
  },
  {
    // 경기 전 준비에서 [✦ 패시브] → 상점 모달 (편집기 뒤)
    name: "og_prep_shop",
    title: "경기 전 준비 — [✦ 패시브] → 상점 모달",
    outgame: true,
    build: (data, { runSeed }) => {
      const b = walkOrThrow("og_prep_shop", data, { seed: runSeed, until: (s) => s.phase === "prep" });
      shopInject(data, b.runState);
      return { ...b, summary: `${b.summary} (SP 120 · 힌트 · 보유 주입)` };
    },
    steps: [{ click: ".prep-edit .ps-open" }],
    ready: "#modal-root .passive-shop .ps-chip",
    expect: { screen: "run", phase: "prep", modal: ".passive-shop" },
  },
  // ---- 이벤트 · 유물 · 루트 · 결과 (레슨 런, I1) ----
  {
    name: "og_event",
    title: "이벤트 모달 — 주 끝 랜덤 이벤트 ev_local_kids (레슨 이벤트 주입, 배경 = 주 선택 화면 inert)",
    outgame: true,
    build: (data, { runSeed }) => {
      const found = eventInjectedState(data, runSeed);
      if (!found) throw new Error("[og_event] 이벤트를 주입할 상태를 찾지 못했습니다");
      return { runState: found.state, steps: found.steps, preferred: true, summary: `${describeLessonRun(found.state)} (레슨 이벤트 ${found.eventId} 주입 — 스위치는 꺼 둠)` };
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
