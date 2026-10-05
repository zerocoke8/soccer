/**
 * lessonSurprise.js — 레슨 깜짝 이벤트 (L29 · LESSON_PROTO_PLAN §24.8 · §24.5.1, E5): 계획 · 조건 · 후보 · 주인공 · 뷰.
 *
 * 흐름 (lesson.js 가 부른다):
 *   - 계획 planSurprise (startLesson, planAttachTurns 다음 — lesson.json events.surprise.enabled 일 때만):
 *     L.surprise = { planned: rng.chance(chance), randTurn: rng.int(fromTurn, turns − 1), pending: null, fired: null } (rng 2번) +
 *     턴 기록 L.turnLog · 쉬는 선수 L.rested · 다음 턴 추가 사용 L.nextExtraPlay · 연속 대상 L.streak · 마지막 대상 턴 L.lastTargeted.
 *     꺼져 있으면 이 필드를 만들지 않고 rng 도 쓰지 않는다 (1차와 같은 레슨 · 같은 rng).
 *   - 턴 기록 L.turnLog (turnLogBlank): beginTurn 이 비우고 (턴 시작에 빈 구역 emptyAtStart), playCard (plays · failed · moved) ·
 *     drawOne (reshuffled) · benchPlayer (benched) 가 쓴다. 레슨 단위 L.streak { 선수: { n, turn } } = 단일 · 주인 카드 연속 대상 턴
 *     (같은 턴은 한 번, 한 턴을 거르거나 벤치에 앉으면 끊긴다), L.lastTargeted { 선수: 턴 } = 카드 대상이 된 마지막 턴.
 *   - 띄우기 (endTurn — 상한 · 마지막 턴 검사 뒤, L.turn += 1 앞): shouldCheck (계획 있음 · 아직 없음 · fromTurn 이상) →
 *     candidates (조건 · 런 1회 · 방침 · 시즌 · 편성 · 결장 · 쉼 · 주인공 후보) → 가중치 뽑기 → pickSurpriseProtagonist → L.surprise.pending.
 *   - 해결 lesson.resolveSurprise · 뷰 surpriseView (getLessonView.surprise).
 *
 * 조건 키의 뜻 (§24.8 표 — 모두 AND, 턴 끝 기준):
 *   randomTurn = 정해 둔 무작위 턴 · turnMin = 그 턴 이상 · turnsLeftMax = 남은 턴 (turns − turn) 이하 ·
 *   halfway = 절반이 지난 턴 (turn = ⌈turns / 2⌉ — 6턴 3 · 7턴 4 · 8턴 4) · special · zoneIn (중점 구역) ·
 *   buffAtLeast · buffEquals (L.buffs[key]) · scoreToTargetMax (목표 − 점수 ≤ n) · scoreBelowTargetFrac (점수 < 목표 × f) ·
 *   capLeftMax (상한 − 점수 ≤ n) · notCleared (점수 < 목표) · notPerfect (점수 < 상한) · anyStaminaBelow (결장 · 쉼 아닌 선수) ·
 *   failedThisTurn (이번 턴 실패한 선수가 아직 결장 · 쉼이 아니다 — 실패로 다치면 빠진다) · coachCardOkThisTurn (코치 카드가 실패 없이) ·
 *   multiOkThisTurn n (원 카드가 대상 n명 이상에게 실패 없이) · reshuffledThisTurn · benchedThisTurn (지금 벤치에 앉은 선수) ·
 *   targetStreak n (연속 대상 n턴 이상인 선수) · zoneEmptyAtTurnStart (그 턴 흩어진 뒤 빈 구역) ·
 *   char { id (편성 · 결장 아님 · 쉼 아님은 늘), staminaMin · staminaMax (이상 · 이하), targetedMin · targetedMax (이번 레슨 대상 횟수),
 *          untargetedTurnsMin (대상이 안 된 연속 턴 = turn − 마지막 대상 턴), zone · zoneCountMin · aloneInZone (경기장 — 벤치 아님 — 에서
 *          그 선수 구역의 경기장 선수 수), movedThisTurn (고유 카드로 자리를 옮겼다), targetedThisTurn, ownCardThisTurn (자기 고유 카드가 실패 없이) }.
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 없음. rng 는 인자로 받은 것만 쓴다 (planSurprise · pickSurpriseProtagonist).
 * 조건 · 후보 · 뷰는 상태를 바꾸지 않는다. lesson.js 를 import 하지 않는다 (lesson.js 가 이 모듈을 부른다).
 */
import { allEvents, eventById, choiceScore } from "./lessonEvents.js";
import { fillText, pickText } from "./lessonText.js";
import { describe } from "./lessonEffects.js";

/** lesson.json events.surprise 기본값 (§24.3.6) */
export const SURPRISE_DEFAULTS = Object.freeze({ chance: 0.5, fromTurn: 2 });

/** 주인공 고르기 중 깜짝 전용 (§24.3.4) */
export const SURPRISE_PICKS = Object.freeze(["turnFailer", "streaker", "coachCardTarget", "multiTarget", "mostTargeted"]);

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/**
 * lesson.json events.surprise → { enabled, chance, fromTurn } (빠진 값은 기본값).
 * @param {object} data
 */
export function surpriseCfg(data) {
  const s = data && data.lesson && data.lesson.events && data.lesson.events.surprise;
  const o = isObj(s) ? s : {};
  const ch = Number(o.chance);
  return {
    enabled: o.enabled === true,
    chance: o.chance !== undefined && Number.isFinite(ch) ? Math.max(0, Math.min(1, ch)) : SURPRISE_DEFAULTS.chance,
    fromTurn: Number.isInteger(o.fromTurn) && o.fromTurn >= 1 ? o.fromTurn : SURPRISE_DEFAULTS.fromTurn,
  };
}

/** 빈 턴 기록 (beginTurn 마다 새로). JSON 값만 */
export function turnLogBlank() {
  return { plays: [], failed: [], reshuffled: false, benched: [], moved: [], emptyAtStart: [] };
}

/** 계획이 없는 깜짝 상태 (저장본 이행 · 도구가 쓴다) */
export function surpriseBlank() {
  return { planned: false, randTurn: null, pending: null, fired: null };
}

/**
 * 깜짝 계획 (§24.8 — startLesson, planAttachTurns 다음, 켜져 있을 때만 부른다): rng 2번 (있다 · 무작위 턴) + 깜짝 필드.
 * @param {object} L  state.lesson (turns 가 정해진 뒤)
 * @param {object} data
 * @param {object} rng
 */
export function planSurprise(L, data, rng) {
  const cfg = surpriseCfg(data);
  const planned = rng.chance(cfg.chance);
  const hi = L.turns - 1;
  const randTurn = hi >= cfg.fromTurn ? rng.int(cfg.fromTurn, hi) : null;
  L.surprise = { planned, randTurn, pending: null, fired: null };
  L.turnLog = turnLogBlank();
  L.rested = [];
  L.nextExtraPlay = 0;
  L.streak = {};
  L.lastTargeted = {};
}

// ---------------------------------------------------------------------------
// 읽기 도우미 (순수)
// ---------------------------------------------------------------------------

const restedOf = (L) => (L && Array.isArray(L.rested) ? L.rested : []);
const outOf = (L) => (L && Array.isArray(L.out) ? L.out : []);
const benchOf = (L) => (L && Array.isArray(L.bench) ? L.bench : []);
const logOf = (L) => (L && isObj(L.turnLog) ? L.turnLog : turnLogBlank());
const stam = (p) => Number(p && p.stamina) || 0;

/** 결장도 쉼도 아니다 (벤치는 된다) */
function isReady(L, id) {
  return !outOf(L).includes(id) && !restedOf(L).includes(id);
}

/** 결장 · 쉼이 아닌 선수 (state.players 순서) */
export function readyPlayers(state) {
  const L = state.lesson;
  return (state.players || []).filter((p) => isReady(L, p.id));
}

/** 경기장에 서 있다 (이번 턴 구역 · 벤치 아님 · 결장 아님 · 쉼 아님) */
function onField(L, id) {
  return !!(L.zones && L.zones[id]) && !benchOf(L).includes(id) && isReady(L, id);
}

function fieldIds(state) {
  const L = state.lesson;
  return (state.players || []).filter((p) => onField(L, p.id)).map((p) => p.id);
}

function playerOfChar(state, charId) {
  return (state.players || []).find((p) => p.charId === charId) || null;
}

/** 그 캐릭터 선수가 편성돼 있고 결장 · 쉼이 아니다 */
function charReady(state, charId) {
  const p = playerOfChar(state, charId);
  return !!p && isReady(state.lesson, p.id);
}

/** 이번 턴 실패한 선수 중 아직 결장 · 쉼이 아닌 선수 id */
function failedReady(state) {
  const L = state.lesson;
  return [...new Set(logOf(L).failed)].filter((id) => isReady(L, id) && (state.players || []).some((p) => p.id === id));
}

/** 이번 턴 마지막으로 실패 없이 끝난 코치 카드 (턴 기록 plays 의 한 줄) — 없으면 null */
function lastCoachOk(L) {
  const plays = logOf(L).plays;
  for (let i = plays.length - 1; i >= 0; i--) if (plays[i].coach && !plays[i].failed) return plays[i];
  return null;
}

/** 이번 턴 마지막으로 대상 n명 이상에게 실패 없이 끝난 원 카드 — 없으면 null */
function lastMultiOk(L, n) {
  const plays = logOf(L).plays;
  for (let i = plays.length - 1; i >= 0; i--) {
    const x = plays[i];
    if (x.kind === "circle" && !x.failed && x.targets.length >= n) return x;
  }
  return null;
}

/** 지금 이어지는 연속 대상 턴 수 (이번 턴에 대상이 아니었으면 0) */
function streakOf(L, id) {
  const s = L && isObj(L.streak) ? L.streak[id] : null;
  return s && s.turn === L.turn ? Number(s.n) || 0 : 0;
}

/** 대상이 안 된 연속 턴 수 = 지금 턴 − 마지막 대상 턴 (대상이 된 적이 없으면 지금 턴) */
export function untargetedTurns(L, id) {
  const last = L && isObj(L.lastTargeted) ? Number(L.lastTargeted[id]) || 0 : 0;
  return Math.max(0, L.turn - last);
}

/** 그 이벤트의 who.pick (없으면 none) */
function whoPick(ev) {
  return (isObj(ev.who) && ev.who.pick) || "none";
}

/** 같은 값 묶음 (체력 최저 / 최고) */
function tiedBy(list, key, sign) {
  if (!list.length) return [];
  const best = Math.min(...list.map((p) => sign * key(p)));
  return list.filter((p) => sign * key(p) === best);
}

// ---------------------------------------------------------------------------
// 조건 (§24.8 표)
// ---------------------------------------------------------------------------

/** cond.char (선수 전용) */
function charCondTrue(state, L, c) {
  const p = playerOfChar(state, c.id);
  if (!p || !isReady(L, p.id)) return false;
  const st = stam(p);
  if (c.staminaMin !== undefined && st < c.staminaMin) return false;
  if (c.staminaMax !== undefined && st > c.staminaMax) return false;
  const tg = Number(L.targeted && L.targeted[p.id]) || 0;
  if (c.targetedMin !== undefined && tg < c.targetedMin) return false;
  if (c.targetedMax !== undefined && tg > c.targetedMax) return false;
  if (c.untargetedTurnsMin !== undefined && untargetedTurns(L, p.id) < c.untargetedTurnsMin) return false;
  if (c.zone !== undefined || c.zoneCountMin !== undefined || c.aloneInZone) {
    if (!onField(L, p.id)) return false;
    const z = L.zones[p.id];
    if (c.zone !== undefined && z !== c.zone) return false;
    const count = fieldIds(state).filter((id) => L.zones[id] === z).length;
    if (c.zoneCountMin !== undefined && count < c.zoneCountMin) return false;
    if (c.aloneInZone && count !== 1) return false;
  }
  const log = logOf(L);
  if (c.movedThisTurn && !log.moved.includes(p.id)) return false;
  if (c.targetedThisTurn && !log.plays.some((x) => x.targets.includes(p.id))) return false;
  if (c.ownCardThisTurn && !log.plays.some((x) => x.family === "unique" && x.ownerId === p.id && !x.failed)) return false;
  return true;
}

function condKeyTrue(state, L, k, v) {
  const log = logOf(L);
  switch (k) {
    case "randomTurn":
      return v === true && isObj(L.surprise) && L.surprise.randTurn !== null && L.turn === L.surprise.randTurn;
    case "turnMin":
      return L.turn >= v;
    case "turnsLeftMax":
      return L.turns - L.turn <= v;
    case "halfway":
      return L.turn === Math.ceil(L.turns / 2);
    case "special":
      return !!L.special;
    case "zoneIn":
      return Array.isArray(v) && v.includes(L.zone);
    case "buffAtLeast":
      return (Number(L.buffs && L.buffs[v.key]) || 0) >= v.n;
    case "buffEquals":
      return (Number(L.buffs && L.buffs[v.key]) || 0) === v.n;
    case "scoreToTargetMax":
      return L.target - L.score <= v;
    case "scoreBelowTargetFrac":
      return L.score < L.target * v;
    case "capLeftMax":
      return L.cap - L.score <= v;
    case "notCleared":
      return L.score < L.target;
    case "notPerfect":
      return L.score < L.cap;
    case "anyStaminaBelow":
      return readyPlayers(state).some((p) => stam(p) < v);
    case "failedThisTurn":
      return failedReady(state).length > 0;
    case "coachCardOkThisTurn":
      return !!lastCoachOk(L);
    case "multiOkThisTurn":
      return !!lastMultiOk(L, v);
    case "reshuffledThisTurn":
      return log.reshuffled === true;
    case "benchedThisTurn":
      return log.benched.length > 0;
    case "targetStreak":
      return readyPlayers(state).some((p) => streakOf(L, p.id) >= v);
    case "char":
      return isObj(v) && charCondTrue(state, L, v);
    case "zoneEmptyAtTurnStart":
      return log.emptyAtStart.includes(v);
    default:
      throw new Error(`깜짝 조건: 모르는 키 '${k}'`);
  }
}

/**
 * 깜짝 이벤트의 cond 가 지금 (이 턴 끝) 참인가 (§24.8 — 모두 AND). 순수.
 * 런 1회 · 방침 · 시즌 · 편성 (chars) · 주인공 후보는 candidates 가 따로 본다.
 * @param {object} state  레슨 중 (state.lesson)
 * @param {object} data
 * @param {object} ev  trigger "surprise"
 * @returns {boolean}
 */
export function condTrue(state, data, ev) {
  const L = state && state.lesson;
  if (!L) return false;
  const cond = isObj(ev && ev.cond) ? ev.cond : {};
  for (const [k, v] of Object.entries(cond)) if (!condKeyTrue(state, L, k, v)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// 주인공 (§24.3.4)
// ---------------------------------------------------------------------------

/**
 * 주인공 후보 (마지막 무작위 앞의 같은 순위 선수 id, state.players 순서). 순수 · rng 없음. 결장 · 쉼 선수는 빼고 (벤치는 된다).
 *   none → [] · char → 그 선수 · random → pos (배치 포지션) · zone (경기장에서 그 구역) 으로 좁힌다 (좁혀서 없으면 전원) ·
 *   lowestStamina · highestStamina → 그중 체력 최저 / 최고 · turnFailer → 이번 턴 실패한 선수 ·
 *   streaker → 연속 대상 턴이 가장 긴 선수 (cond.targetStreak 이상, 같으면 체력 최저) · coachCardTarget → 실패 없이 끝난 마지막 코치 카드의 대상 ·
 *   multiTarget → 실패 없이 끝난 마지막 원 카드 (대상 cond.multiOkThisTurn · 기본 3명 이상) 의 대상 · mostTargeted → 이번 레슨 대상 최다.
 * @returns {string[]}
 */
export function protagonistPool(state, data, ev) {
  const L = state.lesson;
  const who = isObj(ev.who) ? ev.who : {};
  const cond = isObj(ev.cond) ? ev.cond : {};
  const ready = readyPlayers(state);
  const ids = (list) => list.map((p) => p.id);
  const keep = (idList) => ready.filter((p) => idList.includes(p.id));
  switch (whoPick(ev)) {
    case "none":
      return [];
    case "char": {
      const p = playerOfChar(state, who.charId);
      return p && isReady(L, p.id) ? [p.id] : [];
    }
    case "random":
    case "lowestStamina":
    case "highestStamina": {
      let pool = ready;
      if (Array.isArray(who.pos) && who.pos.length) pool = pool.filter((p) => who.pos.includes(p.position));
      if (typeof who.zone === "string") pool = pool.filter((p) => onField(L, p.id) && L.zones[p.id] === who.zone);
      if (!pool.length) pool = ready;
      if (who.pick === "random") return ids(pool);
      return ids(tiedBy(pool, stam, who.pick === "lowestStamina" ? 1 : -1));
    }
    case "turnFailer":
      return ids(keep(failedReady(state)));
    case "streaker": {
      const min = Number.isInteger(cond.targetStreak) ? cond.targetStreak : 1;
      const list = ready.filter((p) => streakOf(L, p.id) >= min);
      if (!list.length) return [];
      return ids(tiedBy(tiedBy(list, (p) => streakOf(L, p.id), -1), stam, 1));
    }
    case "coachCardTarget": {
      const play = lastCoachOk(L);
      return play ? ids(keep(play.targets)) : [];
    }
    case "multiTarget": {
      const play = lastMultiOk(L, Number.isInteger(cond.multiOkThisTurn) ? cond.multiOkThisTurn : 3);
      return play ? ids(keep(play.targets)) : [];
    }
    case "mostTargeted":
      return ids(tiedBy(ready, (p) => Number(L.targeted && L.targeted[p.id]) || 0, -1));
    default:
      return [];
  }
}

/**
 * 주인공 고르기 (§24.3.4). 후보가 하나면 rng 를 쓰지 않고, 여럿이면 rng.pick. who.pick none 이거나 후보가 없으면 null.
 * @returns {string|null}
 */
export function pickSurpriseProtagonist(state, data, ev, rng) {
  if (whoPick(ev) === "none") return null;
  const pool = protagonistPool(state, data, ev);
  if (!pool.length) return null;
  return pool.length === 1 ? pool[0] : rng.pick(pool);
}

/** 이번 턴 그 이벤트의 코치 ({코치} · bond "coach" · coachHint "coach") = 실패 없이 끝난 마지막 코치 카드의 코치 (없으면 null) */
export function surpriseCoach(state) {
  const play = lastCoachOk(state.lesson);
  return play ? play.coach : null;
}

/** 등장 선수 (그림 · 짝): chars 중 편성된 선수 · cond.char.id · who.charId */
export function surpriseCharIds(state, ev) {
  const out = [];
  const add = (id) => {
    if (typeof id === "string" && !out.includes(id) && playerOfChar(state, id)) out.push(id);
  };
  if (Array.isArray(ev.chars)) ev.chars.forEach(add);
  if (isObj(ev.cond) && isObj(ev.cond.char)) add(ev.cond.char.id);
  if (isObj(ev.who) && ev.who.pick === "char") add(ev.who.charId);
  return out;
}

// ---------------------------------------------------------------------------
// 후보 · 띄울지
// ---------------------------------------------------------------------------

/**
 * 지금 (턴 끝) 볼 차례인가: 켜져 있고 · 계획됨 · 이번 레슨에 아직 없고 · 기다리는 것도 없고 · fromTurn ≤ turn ≤ turns − 1 · 진행 중.
 * @returns {boolean}
 */
export function shouldCheck(state, data) {
  const L = state && state.lesson;
  const S = L && L.surprise;
  if (!isObj(S) || !S.planned || S.fired || S.pending) return false;
  const cfg = surpriseCfg(data);
  if (!cfg.enabled || L.status !== "playing") return false;
  return L.turn >= cfg.fromTurn && L.turn <= L.turns - 1;
}

/** 그 깜짝 이벤트를 지금 띄울 수 있나 (런 1회 · 방침 · 시즌 · 편성 · 조건 · 주인공 후보) */
function eventOk(state, data, ev) {
  if (!isObj(ev) || ev.trigger !== "surprise") return false;
  if (Array.isArray(state.usedEventIds) && state.usedEventIds.includes(ev.id)) return false;
  if (typeof ev.policy === "string" && ev.policy !== state.policy) return false;
  if (Array.isArray(ev.seasons) && !ev.seasons.includes(state.season)) return false;
  if (Array.isArray(ev.chars) && ev.chars.length) {
    const any = ev.charMode === "any";
    if (any ? !ev.chars.some((c) => charReady(state, c)) : !ev.chars.every((c) => charReady(state, c))) return false;
  }
  if (!condTrue(state, data, ev)) return false;
  if (whoPick(ev) !== "none" && !protagonistPool(state, data, ev).length) return false;
  return true;
}

/**
 * 지금 (턴 끝) 띄울 수 있는 깜짝 이벤트 (데이터 순서). 순수 · rng 없음. 계획 (planned · fired) 은 보지 않는다 — shouldCheck.
 * 기본 범위 fromTurn ≤ turn ≤ turns − 1 밖이면 [].
 * @returns {object[]}
 */
export function candidates(state, data) {
  const L = state && state.lesson;
  if (!L || L.status !== "playing") return [];
  const cfg = surpriseCfg(data);
  if (L.turn < cfg.fromTurn || L.turn > L.turns - 1) return [];
  return allEvents(data).filter((ev) => eventOk(state, data, ev));
}

/** 고를 때의 가중치 (weight, 없으면 1) */
export function surpriseWeight(ev) {
  return typeof ev.weight === "number" && ev.weight > 0 ? ev.weight : 1;
}

// ---------------------------------------------------------------------------
// 글 · 뷰
// ---------------------------------------------------------------------------

/**
 * 기다리는 깜짝의 글 (자리표시 · 조사 · 반말판). 바꾸기 전에 실패하게 resolveSurprise 가 먼저 부른다.
 * @returns {{ title: string, text: string, labels: string[], results: Array<{ then: string, else: string }> }}
 */
export function surpriseTexts(state, data, ev, pend) {
  const p = (state.players || []).find((x) => x.id === pend.playerId) || null;
  const sc = pend.supportId ? (data.supports || []).find((s) => s.id === pend.supportId) || null : null;
  const vars = { player: p ? p.name : undefined, coach: sc ? sc.name : undefined, season: state.season };
  const fill = (s) => fillText(s, vars);
  const t = pickText(ev, p ? p.charId : null, data);
  return {
    title: fill(ev.title),
    text: fill(t.text),
    labels: ev.choices.map((c) => fill(c.label)),
    results: t.results.map((r) => (isObj(r) ? { then: fill(r.then), else: fill(r.else) } : { then: fill(r), else: fill(r) })),
  };
}

/** 효과 ctx (lessonEffects — 주인공 · 코치 · 등장 선수 · 방침) */
export function surpriseCtx(ev, pend) {
  return {
    eventId: ev.id,
    trigger: "surprise",
    playerId: pend.playerId || null,
    supportId: pend.supportId || null,
    charIds: Array.isArray(pend.charIds) ? pend.charIds.slice() : [],
    policy: typeof ev.policy === "string" ? ev.policy : undefined,
  };
}

/**
 * 레슨 뷰의 깜짝 말풍선 (§24.8 — 기다리는 것이 없으면 null). 순수 · rng 없음.
 * @returns {{ id: string, eventId: string, title: string, text: string, playerId: string|null, charId: string|null, name: string|null,
 *            supportId: string|null, turn: number, art: { charIds: string[], supportId: string|null },
 *            choices: Array<{ label: string, preview: string, lines: string[], recommended: boolean }> }|null}
 */
export function surpriseView(state, data) {
  const L = state && state.lesson;
  const pend = L && isObj(L.surprise) ? L.surprise.pending : null;
  if (!pend) return null;
  const ev = eventById(data, pend.eventId);
  if (!ev || ev.trigger !== "surprise") return missingView(state, pend);
  const p = (state.players || []).find((x) => x.id === pend.playerId) || null;
  const t = surpriseTexts(state, data, ev, pend);
  const ctx = surpriseCtx(ev, pend);
  const view = {
    id: ev.id,
    eventId: ev.id,
    title: t.title,
    text: t.text,
    playerId: p ? p.id : null,
    charId: p ? p.charId : null,
    name: p ? p.name : null,
    supportId: pend.supportId || null,
    turn: pend.turn,
    art: { charIds: ctx.charIds.length ? ctx.charIds : p ? [p.charId] : [], supportId: pend.supportId || null },
    choices: [],
  };
  view.choices = ev.choices.map((c, i) => {
    const d = describe(state, data, c.effects, ctx);
    return { label: t.labels[i], preview: d.text, lines: d.lines, recommended: false };
  });
  const scores = view.choices.map((_, i) => choiceScore(state, data, view, i));
  let best = 0;
  scores.forEach((s, i) => {
    if (s > scores[best]) best = i;
  });
  if (view.choices[best]) view.choices[best].recommended = true;
  return view;
}

/** 데이터에서 빠진 깜짝 (저장한 뒤 콘텐츠가 바뀌었다) 의 말풍선 — 효과 없이 "계속한다" 하나 (lesson.resolveSurprise 가 그대로 잇는다) */
export const MISSING_LABEL = "계속한다";
function missingView(state, pend) {
  const p = (state.players || []).find((x) => x.id === pend.playerId) || null;
  return {
    id: pend.eventId, eventId: pend.eventId, missing: true,
    title: "레슨 깜짝", text: "이 깜짝 이벤트는 데이터에서 빠졌습니다. 레슨을 이어 갑니다.",
    playerId: p ? p.id : null, charId: p ? p.charId : null, name: p ? p.name : null,
    supportId: pend.supportId || null, turn: pend.turn,
    art: { charIds: p ? [p.charId] : [], supportId: pend.supportId || null },
    choices: [{ label: MISSING_LABEL, preview: "효과 없음", lines: [], recommended: true }],
  };
}

/** 이 이벤트가 데이터의 깜짝 이벤트인가 (도구 · 검사용) */
export function isSurpriseEvent(data, id) {
  const ev = eventById(data, id);
  return !!ev && ev.trigger === "surprise";
}
