/**
 * lessonRun.js — 카드 레슨 런: 15주 상태 머신 + UI 가 쓰는 공개 API (LESSON_PROTO_PLAN §5.1 · §5.4).
 *
 * UI 는 app.js 에서 이 모듈을 `ctx.run` 으로 받는다. run.js 와 이름 · 시그니처가 같은 함수
 * (createRun · getPhase · getMatchSetup · buildTeamSnapshot · finishMatch · chooseRelic · chooseRoute ·
 * getEventView · resolveEvent · finalizeRun · nextMatchView) 는 경기 · 이벤트 · 유물 · 결과 화면이 그대로 부른다.
 *
 * 흐름: 시즌마다 레슨 · 자유 · 레슨 · 자유 · 대비 (lesson.json weekKinds) → 경기 전 준비 → 경계전 → 유물 → 루트.
 *   - 주 행동 (applyWeekAction) · 레슨 (playCard …) · 보상 (resolveReward) · 상담 (consultAction · endConsult) ·
 *     경기 전 준비 (confirmPrep) 는 이 모듈의 phase 다.
 *   - 주 끝 · 시즌 끝처럼 이어지는 단계는 state.queue (문자열 배열) 에 넣고 continueFlow 가 멈추는 phase 까지 처리한다.
 *
 * queue 단계: "beginWeek" · "supportEventCheck" · "advanceWeek" · "seasonEnd" · "routeFriendly"
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다. 상태는 JSON 순수 객체.
 * 난수는 state.rngState 로만 쓰고, 함수에 들어올 때 열어 나가기 직전에 저장한다 (다른 rng 함수를 부르는 동안에는 들고 있지 않는다).
 * 상태를 바꾸는 공개 함수는 검증을 먼저 끝내고, 실패하면 상태를 바꾸지 않는다.
 */
import { createRng, createRngFromState } from "./rng.js";
import {
  STATS,
  STAT_LABELS,
  MAX_HINT_LEVEL,
  clamp,
  getModifier,
  skillDiscountedCost,
  canLearnSkill,
  resolveRest,
  resolveMeeting,
} from "./training.js";
import * as run from "./run.js";
import * as cards from "./cards.js";
import * as lesson from "./lesson.js";
import { applyEffects } from "./effects.js";

// run.js 에서 그대로 다시 내보내는 것 (같은 이름 · 같은 동작)
export {
  getPhase,
  getMatchSetup,
  buildTeamSnapshot,
  buildOpponentSnapshot,
  nextMatchView,
  getEventView,
  getEffectiveStats,
  opponentStyleHint,
  normalizeTactics,
  migrateRegisteredTeam,
  STATS,
  POSITIONS,
  FORMATIONS,
  STAT_LABELS,
  DEFENSE_TACTICS,
  DISTRIBUTION_TACTICS,
  MODIFIER_KEYS,
  MAX_LEARNED_SKILLS,
  formationSlots,
  slotPosition,
  mainStatOf,
  getModifier,
} from "./run.js";
export { lessonResult } from "./lesson.js";
// UI 뷰 도우미 (U2 전술 미팅 · 경기 전 준비: 자리를 옮기면 고유 카드 강화 모드 종목이 바뀌는가)
export { mainStatsOf } from "./cards.js";

export const RUN_KIND = "lessonRun";
export const RUN_VERSION = 1;

/** 사용자 입력을 기다리는 phase (continueFlow 가 여기서 멈춘다) */
const STOP_PHASES = new Set(["week", "lesson", "reward", "consult", "prep", "event", "match", "relic", "route", "finished"]);
/** 주 끝 queue */
const WEEK_END = ["supportEventCheck", "advanceWeek"];
/** 자유 주 행동 */
const FREE_ACTIONS = ["outing", "friendly", "consult", "meeting"];

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function assertData(data) {
  if (!data || typeof data !== "object") throw new Error("data 번들이 없습니다");
  if (!data.config) throw new Error("data.config 가 없습니다");
  if (!data.lesson || !data.lesson.lesson) throw new Error("data.lesson 이 없습니다 (data/lesson.json)");
  if (!data.cards) throw new Error("data.cards 가 없습니다 (data/cards.json)");
  if (!data.policies || !Array.isArray(data.policies.policies)) throw new Error("data.policies 가 없습니다 (data/policies.json)");
}

function assertPhase(state, phase) {
  if (!state || typeof state !== "object") throw new Error("state 가 없습니다");
  if (state.phase !== phase) throw new Error(`phase '${phase}' 에서만 가능합니다 (현재 '${state.phase}')`);
}

function LD(data) {
  return data.lesson;
}

function weeksPerSeason(data) {
  return LD(data).weeksPerSeason || LD(data).weekKinds.length;
}

function seasonsOf(data) {
  return data.config.seasons;
}

function playerById(state, id) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`선수 '${id}' 을(를) 찾을 수 없습니다`);
  return p;
}

function supportCard(data, supportId) {
  return data.supports.find((s) => s.id === supportId) || null;
}

/** 그 코치의 코치 카드 (없으면 null) */
function coachCardOf(data, supportId) {
  return cards.cardList(data).find((c) => c.family === "coach" && c.coach && c.coach.supportId === supportId) || null;
}

function skillById(data, id) {
  return data.skills.find((s) => s.id === id) || null;
}

function policyOf(data, id) {
  return data.policies.policies.find((p) => p.id === id) || null;
}

function addStamina(p, n) {
  p.stamina = clamp(Math.round((Number(p.stamina) || 0) + n), 0, 100);
}

function addBond(st, n) {
  st.bond = clamp(Math.round((Number(st.bond) || 0) + n), 0, 100);
}

function addCondition(state, n) {
  state.condition = clamp(Math.round(state.condition + n), 0, 4);
}

function addTeamwork(state, n) {
  state.teamwork = clamp(Math.round(state.teamwork + n), 0, 100);
}

function log(state, text) {
  run.logLine(state, text);
}

/** 덱에 카드 추가 (uid k{nextUid}) */
function addToDeck(state, cardId, plus = false) {
  const uid = `k${state.nextUid}`;
  state.nextUid += 1;
  state.deck.push({ uid, cardId, plus: !!plus });
  return uid;
}

/** 코치 카드면 그 코치 유대 +acquire (D23) */
function acquireBond(state, data, cardId) {
  const raw = cards.getCard(data, cardId);
  if (raw.family !== "coach" || !raw.coach) return 0;
  const st = state.supports.find((s) => s.id === raw.coach.supportId);
  if (!st) return 0;
  const before = st.bond;
  addBond(st, LD(data).bond.acquire);
  return st.bond - before;
}

function deckEntry(state, uid) {
  return state.deck.find((e) => e.uid === uid) || null;
}

/** 이 덱 항목을 강화할 수 있는가 (강화 안 됨 · 강화 가능 카드) */
function upgradable(data, entry) {
  return !!entry && !entry.plus && cards.canUpgrade(cards.getCard(data, entry.cardId));
}

/** 레슨 종목 목표 · 상한 (lesson.startLesson 과 같은 계산) */
function lessonTargets(state, data, special) {
  const ls = LD(data).lesson;
  const si = clamp((Number(state.season) || 1) - 1, 0, ls.turns.length - 1);
  let [target, cap] = ls.targets[si];
  if (special) {
    target = cards.roundCost(target * ls.special.targetMult);
    cap = cards.roundCost(cap * ls.special.targetMult);
  }
  return { turns: ls.turns[si], target, cap };
}

/** 이번 시즌 경계전 상대 */
function goalOpponent(state, data) {
  return data.opponents.find((o) => o.role === "goal" && o.season === state.season) || null;
}

/** 대비 카드 (D10): 상대 styleHint 로 짝, 상대 tactics.shootTiming == midrange 면 두 번째를 버티기로 */
function prepCardsFor(state, data) {
  const pc = LD(data).prepCards;
  const opp = goalOpponent(state, data);
  const key = opp ? run.opponentStyleHint(opp, data).key : "mixed";
  const list = (pc[key] || pc.mixed).slice();
  if (opp && opp.tactics && opp.tactics.shootTiming === "midrange" && pc.midrangeSecond && list.length >= 2) list[1] = pc.midrangeSecond;
  return list;
}

// ---------------------------------------------------------------------------
// 뷰 헬퍼 (순수)
// ---------------------------------------------------------------------------

/** 덱 · 진열 · 보상 카드 뷰 (레슨 밖). entry = { uid?, cardId, plus } */
function cardView(state, data, entry) {
  const raw = cards.getCard(data, entry.cardId);
  const def = lesson.resolveEntry(state, data, entry);
  const up = !entry.plus && cards.canUpgrade(raw) ? lesson.resolveEntry(state, data, { cardId: entry.cardId, plus: true }) : null;
  return {
    uid: entry.uid ?? null,
    cardId: def.id,
    name: def.name,
    family: def.family,
    plus: def.plus,
    bond80: def.bond80,
    targetKind: def.target.kind,
    target: { ...def.target },
    power: def.power ?? null,
    costRate: def.costRate,
    exhaust: !!def.exhaust,
    desc: def.desc,
    ownerCharId: def.ownerCharId || null,
    coachType: def.coach ? def.coach.type : null,
    supportId: def.coach ? def.coach.supportId : null,
    canUpgrade: !!up,
    upgrade: up ? { power: up.power ?? null, desc: up.desc } : null,
  };
}

function playerView(state, data, p) {
  return {
    id: p.id,
    charId: p.charId,
    name: p.name,
    slot: p.slot,
    position: p.position,
    aptitude: p.aptitude,
    stamina: p.stamina,
    injuredTurns: p.injuredTurns,
    stats: { ...p.stats },
    growth: { ...p.growth },
    portraitColor: p.portraitColor,
    mainStats: cards.mainStatsOf(p.position),
    element: p.element,
    style: p.style,
    race: p.race,
    rarity: p.rarity,
    innateSkillId: p.innateSkillId,
    learnedSkillIds: p.learnedSkillIds.slice(),
  };
}

function coachViews(state, data) {
  const upgradeAt = LD(data).bond.upgradeAt;
  return state.supports.map((st) => {
    const sc = supportCard(data, st.id);
    const cc = coachCardOf(data, st.id);
    return {
      id: st.id,
      name: sc ? sc.name : st.id,
      type: cc ? cc.coach.type : sc ? sc.type : null,
      bond: st.bond,
      cardId: cc ? cc.id : null,
      upgraded: !!cc && !!cc.bond80 && st.bond >= upgradeAt,
      portraitColor: (sc && sc.portraitColor) || "#888888",
      hintSkillIds: sc && Array.isArray(sc.hintSkillIds) ? sc.hintSkillIds.slice() : [],
    };
  });
}

function statusView(state) {
  return { condition: state.condition, teamwork: state.teamwork, sp: state.skillPoints, tp: state.trainingPoints };
}

// ---------------------------------------------------------------------------
// 시즌 계획 · 주 offer (rng)
// ---------------------------------------------------------------------------

/** 시즌 계획: 보장 행동 [상담, 미팅] 을 섞어 자유 주에 하나씩 (D3). rng 소비. */
function rollSeasonPlan(state, data) {
  const kinds = LD(data).weekKinds;
  const freeTurns = [];
  kinds.forEach((k, i) => {
    if (k === "free") freeTurns.push(i + 1);
  });
  const rng = createRngFromState(state.rngState);
  const order = rng.shuffle(LD(data).freeWeek.guaranteed || []);
  state.rngState = rng.getState();
  const guaranteed = {};
  freeTurns.forEach((t, i) => {
    if (i < order.length) guaranteed[String(t)] = order[i];
  });
  state.seasonPlan = { guaranteed };
}

/** 주 시작: weekKinds[turn-1] 로 weekOffer 를 굴린다 → phase week. rng 소비 (레슨 · 자유 주). */
function beginWeek(state, data) {
  const L = LD(data);
  const kind = L.weekKinds[state.turn - 1];
  if (kind === "lesson") {
    const rng = createRngFromState(state.rngState);
    const first = rng.pick(STATS);
    const specials = [first];
    if (rng.chance(L.lesson.special.secondChance)) specials.push(rng.pick(STATS.filter((s) => s !== first)));
    state.rngState = rng.getState();
    state.weekOffer = { kind, specials: STATS.filter((s) => specials.includes(s)) };
  } else if (kind === "free") {
    const fw = L.freeWeek;
    const guaranteed = (state.seasonPlan && state.seasonPlan.guaranteed && state.seasonPlan.guaranteed[String(state.turn)]) || null;
    const pool = (fw.pool || FREE_ACTIONS).filter((a) => a !== guaranteed);
    const rng = createRngFromState(state.rngState);
    const picked = rng.shuffle(pool).slice(0, Math.max(0, fw.slots - (guaranteed ? 1 : 0)));
    state.rngState = rng.getState();
    state.weekOffer = { kind, actions: guaranteed ? [guaranteed, ...picked] : picked, guaranteed };
  } else if (kind === "prep") {
    state.weekOffer = { kind, prepCards: prepCardsFor(state, data) };
  } else {
    throw new Error(`알 수 없는 주 종류: '${kind}'`);
  }
  state.phase = "week";
}

// ---------------------------------------------------------------------------
// queue
// ---------------------------------------------------------------------------

function advanceWeek(state, data) {
  if (state.turn === 1) state.freeOuting = 0;
  state.weekOffer = null;
  if (state.turn < weeksPerSeason(data)) {
    state.turn += 1;
    state.turnIndex += 1;
    beginWeek(state, data);
  } else {
    state.phase = "prep";
    log(state, `시즌 ${state.season} 경기 전 준비`);
  }
}

function seasonEnd(state, data) {
  if (state.season < seasonsOf(data)) {
    if (!data.routes.length) throw new Error("routes 가 비어 있습니다");
    state.pendingRoutes = data.routes.map((r) => r.id);
    state.phase = "route";
    log(state, `시즌 ${state.season} 종료. 다음 루트를 선택하세요.`);
  } else {
    state.phase = "finished";
    log(state, "모든 시즌이 끝났습니다. 런 종료.");
  }
}

function runStep(state, data, step) {
  switch (step) {
    case "beginWeek":
      beginWeek(state, data);
      break;
    case "supportEventCheck":
      if (LD(data).events && LD(data).events.support) {
        const found = run.findSupportEvent(state, data, null);
        if (found) run.fireEvent(state, data, found.event, found.supportId);
      }
      break;
    case "advanceWeek":
      advanceWeek(state, data);
      break;
    case "seasonEnd":
      seasonEnd(state, data);
      break;
    case "routeFriendly":
      run.makeFriendlyMatch(state, data, "route");
      state.phase = "match";
      break;
    default:
      throw new Error(`알 수 없는 queue 단계: '${step}'`);
  }
}

/**
 * 남은 queue 를 멈추는 phase 까지 처리한다 (유물 후보가 남아 있으면 relic).
 * @returns {object} state
 */
function continueFlow(state, data) {
  if (state.pendingRelicChoices && state.pendingRelicChoices.length) {
    state.phase = "relic";
    return state;
  }
  state.phase = "flow";
  let guard = 0;
  while (state.queue.length > 0) {
    if (++guard > 64) throw new Error("lesson run queue 가 끝나지 않습니다");
    runStep(state, data, state.queue.shift());
    if (STOP_PHASES.has(state.phase)) return state;
  }
  throw new Error("이어 갈 단계가 없습니다 (queue 가 비었습니다)");
}

function weekEnd(state, data) {
  state.queue = WEEK_END.slice();
  return continueFlow(state, data);
}

// ---------------------------------------------------------------------------
// 공개 API — 런 생성 · 저장본
// ---------------------------------------------------------------------------

/**
 * 저장본이 레슨 런인가 (§5.1)
 * @param {any} s
 * @returns {boolean}
 */
export function isLessonRun(s) {
  return !!s && typeof s === "object" && s.kind === RUN_KIND && s.version === RUN_VERSION && typeof s.phase === "string";
}

/**
 * 저장본 이행 (지금은 tactics · modifiers 만 run.migrateRun 으로). in-place, 멱등.
 * @param {object} s
 * @returns {object}
 */
export function migrateLessonRun(s) {
  if (!isLessonRun(s)) return s;
  return run.migrateRun(s);
}

/**
 * 새 레슨 런.
 * @param {{ data: object, seed: string|number, squad?: Record<string,string>, formation?: string, supportIds?: string[],
 *           tactics?: object, policy?: string, leagueTier?: number }} params
 * @returns {object} RunState (kind "lessonRun")
 */
export function createRun({ data, seed, squad, formation, supportIds, tactics, policy, leagueTier = 1 }) {
  assertData(data);
  if (seed === undefined || seed === null || seed === "") throw new Error("seed 가 필요합니다");
  const pol = policy || LD(data).defaultPolicy || "team";
  if (!policyOf(data, pol)) throw new Error(`알 수 없는 훈련 방침: '${pol}'`);
  const cfg = data.config;
  const roster = run.buildRoster({ data, formation, squad, supportIds });

  const deckIds = LD(data).startDeck.slice();
  for (const p of roster.players) {
    const u = cards.cardList(data).find((c) => c.family === "unique" && c.ownerCharId === p.charId);
    if (u) deckIds.push(u.id);
  }
  for (const id of deckIds) cards.getCard(data, id);

  const rng = createRng(seed);
  const state = {
    kind: RUN_KIND,
    version: RUN_VERSION,
    seed,
    rngState: rng.getState(),
    phase: "flow",
    season: 1,
    turn: 1,
    turnIndex: 0,
    leagueTier,
    policy: pol,
    formation: roster.formation,
    tactics: run.normalizeTactics({ ...(cfg.defaultTactics || {}), ...(tactics || {}) }),
    players: roster.players,
    supports: roster.supports,
    condition: clamp(cfg.condition.start, 0, 4),
    teamwork: 0,
    skillPoints: 0,
    trainingPoints: 0,
    hints: {},
    relics: [],
    modifiers: [],
    deck: deckIds.map((cardId, i) => ({ uid: `k${i + 1}`, cardId, plus: false })),
    nextUid: deckIds.length + 1,
    seasonPlan: null,
    weekOffer: null,
    freeOuting: 0,
    lesson: null,
    pendingReward: null,
    consult: null,
    currentEvent: null,
    pendingMatch: null,
    lastMatchResult: null,
    pendingRelicChoices: null,
    pendingRoutes: null,
    record: { goalMatches: [], friendlies: [], losses: 0, lessons: [] },
    usedEventIds: [],
    log: [],
    rating: null,
    queue: [],
  };
  log(state, `새 런 시작 (seed: ${seed}, 방침: ${policyOf(data, pol).name}). 시즌 1.`);
  rollSeasonPlan(state, data);
  state.queue = ["beginWeek"];
  return continueFlow(state, data);
}

// ---------------------------------------------------------------------------
// 주 (phase week)
// ---------------------------------------------------------------------------

/**
 * 주 선택 화면 뷰 (§5.4.4). 순수.
 */
export function getWeekView(state, data) {
  assertData(data);
  const offer = state.weekOffer || { kind: LD(data).weekKinds[state.turn - 1] };
  const kind = offer.kind;
  const wps = weeksPerSeason(data);
  const lessons =
    kind === "lesson" || kind === "prep"
      ? STATS.map((stat) => {
          const special = kind === "lesson" && Array.isArray(offer.specials) && offer.specials.includes(stat);
          return { stat, label: STAT_LABELS[stat], special, prep: kind === "prep", ...lessonTargets(state, data, special) };
        })
      : [];
  return {
    phase: state.phase,
    season: state.season,
    week: state.turn,
    weekIndex: state.turnIndex,
    kind,
    seasons: seasonsOf(data),
    weeksPerSeason: wps,
    weekKinds: LD(data).weekKinds.slice(),
    policy: state.policy,
    nextMatch: run.nextMatchView(state, data),
    weeksToMatch: Math.max(0, wps - state.turn),
    status: statusView(state),
    lessons,
    prepCards: kind === "prep" && Array.isArray(offer.prepCards) ? offer.prepCards.slice() : [],
    actions: kind === "free" && Array.isArray(offer.actions) ? offer.actions.map((type) => ({ type, guaranteed: type === offer.guaranteed })) : [],
    freeOuting: (state.freeOuting || 0) > 0 && state.turn === 1,
    restGain: Math.round(data.config.rest.stamina * (1 + getModifier(state, "restEffect"))),
    players: state.players.map((p) => playerView(state, data, p)),
    coaches: coachViews(state, data),
    deck: state.deck.map((e) => ({ uid: e.uid, cardId: e.cardId, name: cards.getCard(data, e.cardId).name, family: cards.getCard(data, e.cardId).family, plus: !!e.plus })),
    hints: { ...state.hints },
    relics: state.relics.slice(),
    modifiers: state.modifiers.map((m) => ({ ...m })),
    record: { goalMatches: state.record.goalMatches.slice(), friendlies: state.record.friendlies.slice(), losses: state.record.losses, lessons: state.record.lessons.slice() },
    lastMatchResult: state.lastMatchResult,
    log: state.log.slice(-20),
  };
}

/** 외출 효과: 그 선수 +picked, 7명 +team, 컨디션 +condition */
function doOuting(state, data, p) {
  const o = LD(data).outing;
  addStamina(p, o.picked);
  for (const x of state.players) addStamina(x, o.team);
  addCondition(state, o.condition);
}

/**
 * 주 행동 (§5.4.1 표).
 * @param {object} state
 * @param {object} data
 * @param {{ type: "lesson", stat: string } | { type: "rest" } | { type: "outing", playerId: string, free?: boolean } |
 *         { type: "meeting", tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }> } |
 *         { type: "consult" } | { type: "friendly" }} action
 * @returns {object} state
 */
export function applyWeekAction(state, data, action) {
  assertData(data);
  assertPhase(state, "week");
  if (!action || typeof action.type !== "string") throw new Error("action.type 이 필요합니다");
  run.migrateRun(state);
  const offer = state.weekOffer;
  if (!offer) throw new Error("이번 주 offer 가 없습니다");
  const offered = (t) => offer.kind === "free" && Array.isArray(offer.actions) && offer.actions.includes(t);

  switch (action.type) {
    case "lesson": {
      if (offer.kind !== "lesson" && offer.kind !== "prep") throw new Error("이번 주에는 레슨이 없습니다");
      if (!STATS.includes(action.stat)) throw new Error(`알 수 없는 레슨 종목: '${action.stat}'`);
      const prep = offer.kind === "prep";
      const special = !prep && Array.isArray(offer.specials) && offer.specials.includes(action.stat);
      const bondBefore = {};
      for (const st of state.supports) bondBefore[st.id] = st.bond;
      lesson.startLesson(state, data, { stat: action.stat, special, prep, prepCards: prep ? offer.prepCards || [] : [] });
      state.lesson.bondBefore = bondBefore;
      state.phase = "lesson";
      log(state, `${prep ? "대비 레슨" : special ? "특별 레슨" : "레슨"}[${STAT_LABELS[action.stat]}] 시작`);
      if (state.lesson.status !== "playing") afterLesson(state, data);
      return state;
    }
    case "rest": {
      const r = resolveRest(state, data);
      log(state, `휴식: 전원 체력 +${r.staminaGain}${r.conditionUp ? ", 컨디션 상승" : ""}`);
      return weekEnd(state, data);
    }
    case "outing": {
      const p = playerById(state, action.playerId);
      if (action.free) {
        if (!((state.freeOuting || 0) > 0 && state.turn === 1)) throw new Error("무료 외출을 쓸 수 없습니다");
        doOuting(state, data, p);
        state.freeOuting -= 1;
        log(state, `무료 외출: ${p.name} (체력 +${LD(data).outing.picked}, 전원 +${LD(data).outing.team}, 컨디션 +${LD(data).outing.condition})`);
        return state;
      }
      if (!offered("outing")) throw new Error("이번 주에는 외출이 열려 있지 않습니다");
      doOuting(state, data, p);
      log(state, `외출: ${p.name} (체력 +${LD(data).outing.picked}, 전원 +${LD(data).outing.team}, 컨디션 +${LD(data).outing.condition})`);
      return weekEnd(state, data);
    }
    case "meeting": {
      if (!offered("meeting")) throw new Error("이번 주에는 전술 미팅이 열려 있지 않습니다");
      if (action.buy) throw new Error("스킬 구매는 상담에서 합니다");
      const r = resolveMeeting(state, data, { tactics: action.tactics, formation: action.formation, swaps: action.swaps });
      state.tactics = run.normalizeTactics(state.tactics);
      let text = `전술 미팅: 팀워크 +${r.teamworkGain}`;
      if (r.formationChanged) text += `, 포메이션 ${state.formation}`;
      if (r.swapped) text += `, 포지션 변경 ${r.swapped}`;
      log(state, text);
      return weekEnd(state, data);
    }
    case "consult": {
      if (!offered("consult")) throw new Error("이번 주에는 상담이 열려 있지 않습니다");
      state.consult = rollConsult(state, data);
      state.phase = "consult";
      log(state, "상담 시작");
      return state;
    }
    case "friendly": {
      if (!offered("friendly")) throw new Error("이번 주에는 친선전이 열려 있지 않습니다");
      run.makeFriendlyMatch(state, data, "friendly");
      state.queue = WEEK_END.slice();
      state.phase = "match";
      return state;
    }
    default:
      throw new Error(`알 수 없는 주 행동: '${action.type}'`);
  }
}

// ---------------------------------------------------------------------------
// 레슨 (phase lesson) — lesson.js 를 감싸고, 끝나면 afterLesson
// ---------------------------------------------------------------------------

function afterIfEnded(state, data) {
  if (state.lesson && state.lesson.status !== "playing") afterLesson(state, data);
  return state;
}

/** 카드 1장 내기 (lesson.playCard). 레슨이 끝나면 보상 단계로. */
export function playCard(state, data, args) {
  assertPhase(state, "lesson");
  lesson.playCard(state, data, args);
  return afterIfEnded(state, data);
}

/** 레슨 중 쉬기 (lesson.lessonRest) */
export function lessonRest(state, data, args) {
  assertPhase(state, "lesson");
  lesson.lessonRest(state, data, args);
  return afterIfEnded(state, data);
}

/** 레슨 턴 끝 (lesson.endLessonTurn) */
export function endLessonTurn(state, data) {
  assertPhase(state, "lesson");
  lesson.endLessonTurn(state, data);
  return afterIfEnded(state, data);
}

/** 레슨 화면 뷰 (순수) */
export function getLessonView(state, data) {
  return lesson.getLessonView(state, data);
}

/** 카드 미리보기 (순수) */
export function previewCard(state, data, args) {
  return lesson.previewCard(state, data, args);
}

/**
 * 힌트 1개 뽑기 (D26): hintRate 가중으로 편성 코치 → 그 코치 스킬 중 균등 (레벨 3 제외). 후보가 없으면 null.
 * @returns {{ skillId: string, level: number, supportId: string }|null}
 */
function drawHint(state, data, rng) {
  const cands = [];
  for (const st of state.supports) {
    const sc = supportCard(data, st.id);
    if (!sc || !Array.isArray(sc.hintSkillIds)) continue;
    const skills = sc.hintSkillIds.filter((id) => {
      const sk = skillById(data, id);
      return sk && sk.learnable && (state.hints[id] || 0) < MAX_HINT_LEVEL;
    });
    if (skills.length) cands.push({ supportId: st.id, skills, w: Number(sc.hintRate) || 0 });
  }
  if (!cands.length) return null;
  const c = rng.weighted(cands, (x) => x.w);
  const skillId = rng.pick(c.skills);
  state.hints[skillId] = clamp((state.hints[skillId] || 0) + 1, 0, MAX_HINT_LEVEL);
  return { skillId, level: state.hints[skillId], supportId: c.supportId };
}

/** 보상 후보 (§5.4.3 5, D7 · D8). rng. */
function rollRewardOffer(state, data, rng, status, special) {
  const R = LD(data).rewards;
  const w = R.weights;
  const cand = [];
  for (const c of cards.cardList(data)) {
    if (!c.pool) continue;
    if (c.family === "common") cand.push({ kind: "add", cardId: c.id, w: w.common });
    else if (c.family === state.policy) cand.push({ kind: "add", cardId: c.id, w: w.policy });
  }
  for (const st of state.supports) {
    const cc = coachCardOf(data, st.id);
    const sc = supportCard(data, st.id);
    if (cc) cand.push({ kind: "add", cardId: cc.id, w: (w.coachBase * (Number(sc && sc.specialtyRate) || 0)) / w.coachRef });
  }
  for (const e of state.deck) {
    const raw = cards.getCard(data, e.cardId);
    if (raw.family === "unique" && upgradable(data, e)) cand.push({ kind: "upgrade", cardId: e.cardId, uid: e.uid, w: w.uniquePlus });
  }
  const offer = [];
  let pool = cand.filter((c) => c.w > 0);
  while (offer.length < R.offer && pool.length) {
    const pick = rng.weighted(pool, (c) => c.w);
    offer.push(pick);
    pool = pool.filter((c) => c.cardId !== pick.cardId);
  }
  const pc = R.plusChance;
  const chance = Math.min(pc.max, (special ? pc.special : 0) + (status === "perfect" ? pc.perfect : 0));
  return offer.map((o) => {
    if (o.kind === "upgrade") return { cardId: o.cardId, plus: true, kind: "upgrade", uid: o.uid };
    const plus = chance > 0 && cards.canUpgrade(cards.getCard(data, o.cardId)) && rng.chance(chance);
    return { cardId: o.cardId, plus, kind: "add" };
  });
}

/**
 * 레슨이 끝난 직후 (§5.4.3 afterLesson): 결과 보상 · 힌트 · 결장 감소 · 기록 · 보상 후보 → phase reward.
 */
function afterLesson(state, data) {
  const L = state.lesson;
  const D = LD(data);
  const res = lesson.lessonResult(state, data);
  const status = res.status;
  const ok = status === "clear" || status === "perfect";
  const rng = createRngFromState(state.rngState);

  // 1. 결과 보상
  let tp = 0;
  let hintCount = 0;
  let freeUpgrades = 0;
  let teamwork = 0;
  let condition = 0;
  let prepBonus = false;
  if (status === "perfect") {
    tp = D.rewards.perfect.tp;
    hintCount = D.rewards.perfect.hints;
    freeUpgrades = D.rewards.perfect.freeUpgrades || 0;
  } else if (status === "clear") {
    tp = D.rewards.clear.tp;
    hintCount = D.rewards.clear.hints;
  }
  if (ok) {
    state.trainingPoints += tp;
    const twBefore = state.teamwork;
    addTeamwork(state, D.teamwork.clear);
    teamwork = state.teamwork - twBefore;
    for (const st of state.supports) {
      const cc = coachCardOf(data, st.id);
      if (cc && cc.coach.type === L.stat) addBond(st, D.bond.sameTypeClear);
    }
    if (L.lumiFlag) {
      const before = state.condition;
      addCondition(state, 1);
      condition = state.condition - before;
    }
    if (L.prep) {
      state.modifiers.push({ key: "goalMatchCondition", amount: 1, untilSeason: state.season, source: "prepLesson" });
      prepBonus = true;
    }
    // 2. 힌트 (+ hintRate modifier 확률로 1개 더)
    const extra = getModifier(state, "hintRate");
    if (extra > 0 && rng.chance(extra)) hintCount += 1;
  }
  const hints = [];
  let sp = 0;
  for (let i = 0; i < hintCount; i++) {
    const h = drawHint(state, data, rng);
    if (h) hints.push(h);
    else {
      sp += D.rewards.noHintSp;
      state.skillPoints += D.rewards.noHintSp;
    }
  }

  // 3. 결장 감소: 레슨 시작부터 빠진 선수
  for (const id of L.outAtStart) {
    const p = playerById(state, id);
    p.injuredTurns = Math.max(0, (Number(p.injuredTurns) || 0) - 1);
  }

  // 4. 기록 · 로그
  state.record.lessons.push({
    turnIndex: state.turnIndex,
    stat: L.stat,
    special: L.special,
    prep: L.prep,
    score: L.score,
    target: L.target,
    cap: L.cap,
    result: status,
    turns: L.turn,
    plays: res.plays,
    rests: res.rests,
    fails: res.fails,
    injuries: res.injuries,
  });
  const label = { perfect: "퍼펙트", clear: "클리어", fail: "실패" }[status] || status;
  log(state, `${L.prep ? "대비 레슨" : L.special ? "특별 레슨" : "레슨"}[${STAT_LABELS[L.stat]}] ${label} — 점수 ${L.score} / ${L.target} / ${L.cap}${tp ? `, TP +${tp}` : ""}${hints.length ? `, 힌트 ${hints.length}` : ""}`);

  // 5. 보상 후보
  const offer = ok ? rollRewardOffer(state, data, rng, status, L.special) : [];
  state.rngState = rng.getState();

  // 유대 변화 (레슨 중 코치 카드 +8, 같은 종목 +5)
  const bond = [];
  for (const st of state.supports) {
    const before = L.bondBefore && typeof L.bondBefore[st.id] === "number" ? L.bondBefore[st.id] : st.bond;
    if (st.bond !== before) {
      const sc = supportCard(data, st.id);
      bond.push({ id: st.id, name: sc ? sc.name : st.id, gain: st.bond - before, bond: st.bond });
    }
  }

  // 6. phase reward
  state.pendingReward = {
    offer,
    freeUpgrades,
    result: {
      stat: L.stat,
      special: L.special,
      prep: L.prep,
      score: L.score,
      target: L.target,
      cap: L.cap,
      status,
      turns: L.turns,
      turnReached: L.turn,
      tp,
      sp,
      hints: hints.map((h) => ({ skillId: h.skillId, level: h.level, supportId: h.supportId, name: (skillById(data, h.skillId) || {}).name || h.skillId })),
      teamwork,
      twAccrued: L.twAccrued,
      condition,
      prepBonus,
      bond,
      plays: res.plays,
      rests: res.rests,
      fails: res.fails,
      injuries: res.injuries,
      perPlayer: res.perPlayer.map((x) => ({ id: x.id, gain: x.gain, sub: x.sub, auto: x.auto, targeted: x.targeted })),
    },
  };
  state.phase = "reward";
  return state;
}

// ---------------------------------------------------------------------------
// 보상 (phase reward)
// ---------------------------------------------------------------------------

/** 보상 모달 뷰 (§5.4.4). 순수. */
export function getRewardView(state, data) {
  assertPhase(state, "reward");
  const pr = state.pendingReward;
  if (!pr) throw new Error("pendingReward 가 없습니다");
  return {
    result: JSON.parse(JSON.stringify(pr.result)),
    offer: pr.offer.map((o) => ({ ...cardView(state, data, { uid: o.uid ?? null, cardId: o.cardId, plus: o.plus }), kind: o.kind, uid: o.uid ?? null })),
    freeUpgrades: pr.freeUpgrades,
    upgradable: pr.freeUpgrades > 0 ? state.deck.filter((e) => upgradable(data, e)).map((e) => e.uid) : [],
    skipTp: pr.offer.length ? LD(data).rewards.skipTp : 0,
  };
}

/**
 * 보상 고르기 (§5.4.3). pick = offer 번호 | null(건너뛰기), upgradeUid = 무료 강화할 덱 카드 (없으면 그 기회는 사라진다).
 * @returns {object} state
 */
export function resolveReward(state, data, { pick = null, upgradeUid = null } = {}) {
  assertData(data);
  assertPhase(state, "reward");
  const pr = state.pendingReward;
  if (!pr) throw new Error("pendingReward 가 없습니다");
  // 검증
  let chosen = null;
  if (pick !== null && pick !== undefined) {
    if (!Number.isInteger(pick) || pick < 0 || pick >= pr.offer.length) throw new Error(`보상 번호가 잘못되었습니다: ${pick}`);
    chosen = pr.offer[pick];
    if (chosen.kind === "upgrade" && !upgradable(data, deckEntry(state, chosen.uid))) throw new Error("강화할 수 없는 카드입니다");
  }
  if (upgradeUid !== null && upgradeUid !== undefined) {
    if (!(pr.freeUpgrades > 0)) throw new Error("무료 강화가 없습니다");
    if (!upgradable(data, deckEntry(state, upgradeUid))) throw new Error(`카드 '${upgradeUid}' 은(는) 강화할 수 없습니다`);
    if (chosen && chosen.kind === "upgrade" && chosen.uid === upgradeUid) throw new Error("같은 카드를 두 번 강화할 수 없습니다");
  }
  // 적용
  const parts = [];
  if (chosen) {
    const name = cards.getCard(data, chosen.cardId).name;
    if (chosen.kind === "add") {
      addToDeck(state, chosen.cardId, chosen.plus);
      const b = acquireBond(state, data, chosen.cardId);
      parts.push(`카드 획득: ${name}${chosen.plus ? "+" : ""}${b ? ` (유대 +${b})` : ""}`);
    } else {
      deckEntry(state, chosen.uid).plus = true;
      parts.push(`카드 강화: ${name}+`);
    }
  } else if (pr.offer.length) {
    state.trainingPoints += LD(data).rewards.skipTp;
    parts.push(`보상 건너뛰기: TP +${LD(data).rewards.skipTp}`);
  }
  if (upgradeUid !== null && upgradeUid !== undefined) {
    const e = deckEntry(state, upgradeUid);
    e.plus = true;
    parts.push(`무료 강화: ${cards.getCard(data, e.cardId).name}+`);
  }
  if (parts.length) log(state, parts.join(", "));
  state.lesson = null;
  state.pendingReward = null;
  return weekEnd(state, data);
}

// ---------------------------------------------------------------------------
// 상담 (phase consult)
// ---------------------------------------------------------------------------

function cardPrice(data, cardId) {
  const price = LD(data).consult.price;
  const fam = cards.getCard(data, cardId).family;
  if (fam === "common") return price.common;
  if (fam === "coach") return price.coach;
  return price.policy;
}

/** 상담 진열 (§5.4.3): 편성 코치 카드 1장 (specialtyRate 가중) + pool 공용 · 내 방침 카드 2장. rng. */
function rollConsult(state, data) {
  const C = LD(data).consult;
  const rng = createRngFromState(state.rngState);
  const coachCands = state.supports
    .map((st) => ({ card: coachCardOf(data, st.id), w: Number((supportCard(data, st.id) || {}).specialtyRate) || 0 }))
    .filter((x) => x.card);
  const pool = cards.cardList(data).filter((c) => c.pool && (c.family === "common" || c.family === state.policy));
  const nPool = Math.max(0, C.stock - (coachCands.length ? 1 : 0));
  const picks = rng.shuffle(pool).slice(0, nPool).map((c) => c.id);
  if (coachCands.length) picks.push(rng.weighted(coachCands, (x) => x.w).card.id);
  state.rngState = rng.getState();
  return {
    stock: picks.map((cardId) => ({ cardId, price: cardPrice(data, cardId), bought: false })),
    upgradesLeft: C.upgradesPerVisit,
    deletesLeft: C.deletesPerVisit,
  };
}

/** 상담 화면 뷰 (§5.4.4). 순수. */
export function getConsultView(state, data) {
  assertPhase(state, "consult");
  const c = state.consult;
  if (!c) throw new Error("상담 중이 아닙니다");
  const C = LD(data).consult;
  const skills = Object.entries(state.hints)
    .filter(([, lv]) => lv > 0)
    .map(([skillId, level]) => {
      const sk = skillById(data, skillId);
      if (!sk || !sk.learnable) return null;
      const baseCost = Number(sk.cost) || 0;
      const cost = skillDiscountedCost(baseCost, level);
      return {
        skillId,
        name: sk.name,
        kind: sk.kind,
        description: sk.description || "",
        positions: sk.positions || null,
        baseCost,
        cost,
        level,
        affordable: state.skillPoints >= cost,
        eligiblePlayers: state.players.filter((p) => canLearnSkill(state, data, skillId, p.id).ok).map((p) => p.id),
      };
    })
    .filter(Boolean);
  return {
    tp: state.trainingPoints,
    sp: state.skillPoints,
    stock: c.stock.map((s) => ({
      card: cardView(state, data, { cardId: s.cardId, plus: false }),
      cardId: s.cardId,
      price: s.price,
      bought: s.bought,
      affordable: !s.bought && state.trainingPoints >= s.price,
    })),
    deck: state.deck.map((e) => cardView(state, data, e)),
    upgradesLeft: c.upgradesLeft,
    deletesLeft: c.deletesLeft,
    prices: { ...C.price },
    minDeck: C.minDeck,
    skills,
    players: state.players.map((p) => playerView(state, data, p)),
  };
}

/**
 * 상담 행동 1개 (§5.4.3 표). 검증이 실패하면 상태를 바꾸지 않고 throw.
 * @param {{ op: "buy", index: number } | { op: "upgrade", uid: string } | { op: "delete", uid: string } |
 *         { op: "skill", skillId: string, playerId: string }} op
 * @returns {object} state
 */
export function consultAction(state, data, op) {
  assertData(data);
  assertPhase(state, "consult");
  const c = state.consult;
  if (!c) throw new Error("상담 중이 아닙니다");
  if (!op || typeof op.op !== "string") throw new Error("op 가 필요합니다");
  const C = LD(data).consult;
  switch (op.op) {
    case "buy": {
      const s = Number.isInteger(op.index) ? c.stock[op.index] : null;
      if (!s) throw new Error(`진열 번호가 잘못되었습니다: ${op.index}`);
      if (s.bought) throw new Error("이미 산 카드입니다");
      if (state.trainingPoints < s.price) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${s.price})`);
      state.trainingPoints -= s.price;
      s.bought = true;
      addToDeck(state, s.cardId, false);
      const b = acquireBond(state, data, s.cardId);
      log(state, `상담: ${cards.getCard(data, s.cardId).name} 구매 (TP −${s.price}${b ? `, 유대 +${b}` : ""})`);
      return state;
    }
    case "upgrade": {
      if (!(c.upgradesLeft > 0)) throw new Error("이번 상담의 강화를 이미 썼습니다");
      const e = deckEntry(state, op.uid);
      if (!upgradable(data, e)) throw new Error(`카드 '${op.uid}' 은(는) 강화할 수 없습니다`);
      if (state.trainingPoints < C.price.upgrade) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${C.price.upgrade})`);
      state.trainingPoints -= C.price.upgrade;
      c.upgradesLeft -= 1;
      e.plus = true;
      log(state, `상담: ${cards.getCard(data, e.cardId).name}+ 강화 (TP −${C.price.upgrade})`);
      return state;
    }
    case "delete": {
      if (!(c.deletesLeft > 0)) throw new Error("이번 상담의 삭제를 이미 썼습니다");
      const e = deckEntry(state, op.uid);
      if (!e) throw new Error(`카드 '${op.uid}' 이(가) 덱에 없습니다`);
      if (state.deck.length - 1 < C.minDeck) throw new Error(`덱은 ${C.minDeck}장 아래로 줄일 수 없습니다`);
      if (state.trainingPoints < C.price.delete) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${C.price.delete})`);
      state.trainingPoints -= C.price.delete;
      c.deletesLeft -= 1;
      state.deck = state.deck.filter((x) => x.uid !== e.uid);
      log(state, `상담: ${cards.getCard(data, e.cardId).name} 삭제 (TP −${C.price.delete})`);
      return state;
    }
    case "skill": {
      const check = canLearnSkill(state, data, op.skillId, op.playerId);
      if (!check.ok) throw new Error(`스킬 구매 불가: ${check.reason}`);
      const sk = skillById(data, op.skillId);
      const cost = skillDiscountedCost(Number(sk.cost) || 0, state.hints[op.skillId] || 0);
      if (state.skillPoints < cost) throw new Error(`스킬 포인트 부족 (${state.skillPoints}/${cost})`);
      const p = playerById(state, op.playerId);
      p.learnedSkillIds.push(op.skillId);
      state.skillPoints -= cost;
      log(state, `상담: ${p.name} 이(가) '${sk.name}' 습득 (SP −${cost})`);
      return state;
    }
    default:
      throw new Error(`알 수 없는 상담 행동: '${op.op}'`);
  }
}

/** 상담 끝 → 주 끝 */
export function endConsult(state, data) {
  assertData(data);
  assertPhase(state, "consult");
  state.consult = null;
  log(state, "상담 끝");
  return weekEnd(state, data);
}

// ---------------------------------------------------------------------------
// 경기 전 준비 (phase prep) · 경기 · 유물 · 루트 · 이벤트 · 끝
// ---------------------------------------------------------------------------

/** 경기 전 준비 뷰 (§5.4.4). 순수. */
export function getPrepView(state, data) {
  assertPhase(state, "prep");
  return {
    nextMatch: run.nextMatchView(state, data),
    formation: state.formation,
    tactics: { ...state.tactics },
    players: state.players.map((p) => playerView(state, data, p)),
    injuredOut: state.players.filter((p) => (Number(p.injuredTurns) || 0) > 0).map((p) => p.id),
    // 대비 레슨 클리어 보너스만 (유물 '낡은 주장 완장' 의 goalMatchCondition 은 대비 레슨 표시가 아니다)
    prepBonus: state.modifiers.some(
      (m) => m.key === "goalMatchCondition" && m.source === "prepLesson" && (m.untilSeason === null || m.untilSeason === undefined || m.untilSeason >= state.season),
    ),
    status: statusView(state),
  };
}

/**
 * 경기 전 준비 확정: 전술 · 포메이션 · 배치 (팀워크 없음, 주를 쓰지 않는다) → 경계전 (phase match).
 * @param {{ tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }> }} args
 */
export function confirmPrep(state, data, { tactics, formation, swaps } = {}) {
  assertData(data);
  assertPhase(state, "prep");
  run.migrateRun(state);
  const r = resolveMeeting(state, data, { tactics, formation, swaps }, { teamwork: false });
  state.tactics = run.normalizeTactics(state.tactics);
  if (r.formationChanged || r.swapped) log(state, `경기 전 준비: ${r.formationChanged ? `포메이션 ${state.formation}` : ""}${r.swapped ? ` 포지션 변경 ${r.swapped}` : ""}`.trim());
  run.makeGoalMatch(state, data);
  state.queue = ["seasonEnd"];
  state.phase = "match";
  return state;
}

/**
 * 경기 끝 (run.settleMatch) → 유물 후보가 있으면 relic, 아니면 흐름을 잇는다.
 */
export function finishMatch(state, data, matchResult) {
  assertData(data);
  assertPhase(state, "match");
  if (!state.pendingMatch) throw new Error("pendingMatch 가 없습니다");
  if (!matchResult || typeof matchResult !== "object") throw new Error("matchResult 가 필요합니다");
  run.migrateRun(state);
  const { relicChoices } = run.settleMatch(state, data, matchResult);
  if (relicChoices.length) {
    state.pendingRelicChoices = relicChoices;
    state.phase = "relic";
    return state;
  }
  return continueFlow(state, data);
}

/** 유물 고르기 (run.applyRelicChoice) → 흐름을 잇는다 */
export function chooseRelic(state, data, relicId) {
  assertData(data);
  assertPhase(state, "relic");
  run.migrateRun(state);
  if ((relicId === null || relicId === undefined) && !(Array.isArray(state.pendingRelicChoices) && state.pendingRelicChoices.length)) {
    state.pendingRelicChoices = null;
    return continueFlow(state, data);
  }
  run.applyRelicChoice(state, data, relicId);
  return continueFlow(state, data);
}

/**
 * 루트 고르기 (§5.4.2): 시즌 +1 → 만료 modifier 제거 → 루트 효과 → (온천) 무료 외출 → 시즌 계획 → [원정 친선전] → 1주 시작.
 * 루트 이벤트 · 시즌 시작 이벤트는 없다.
 */
export function chooseRoute(state, data, routeId) {
  assertData(data);
  assertPhase(state, "route");
  run.migrateRun(state);
  if (!Array.isArray(state.pendingRoutes) || !state.pendingRoutes.includes(routeId)) throw new Error(`루트 '${routeId}' 은(는) 선택지에 없습니다`);
  const route = data.routes.find((r) => r.id === routeId);
  if (!route) throw new Error(`루트 '${routeId}' 이(가) 없습니다`);
  state.pendingRoutes = null;
  state.season += 1;
  state.turn = 1;
  state.turnIndex = (state.season - 1) * weeksPerSeason(data);
  state.modifiers = state.modifiers.filter((m) => m.untilSeason === null || m.untilSeason === undefined || m.untilSeason >= state.season);
  log(state, `루트 선택: ${route.name}. 시즌 ${state.season} 시작.`);
  applyEffects(state, data, route.effects || [], { playerId: null, supportId: null, eventId: null });
  const ov = (LD(data).routeOverrides || {})[routeId];
  if (ov && ov.freeOuting) state.freeOuting = ov.freeOuting;
  rollSeasonPlan(state, data);
  state.queue = [];
  if (route.forcedFriendly) state.queue.push("routeFriendly");
  state.queue.push("beginWeek");
  return continueFlow(state, data);
}

/** 이벤트 선택 (1차에는 쓰지 않는다) → 흐름을 잇는다 */
export function resolveEvent(state, data, choiceIndex) {
  assertData(data);
  assertPhase(state, "event");
  if (!state.currentEvent) throw new Error("currentEvent 가 없습니다");
  run.migrateRun(state);
  run.applyEventChoice(state, data, choiceIndex);
  return continueFlow(state, data);
}

/**
 * 런 끝 평가 (run.finalizeRun) + registeredTeam.policy (D44).
 * @returns {{ rating: object, registeredTeam: object }}
 */
export function finalizeRun(state, data) {
  const out = run.finalizeRun(state, data);
  out.registeredTeam.policy = state.policy;
  return out;
}
