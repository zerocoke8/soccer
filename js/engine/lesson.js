/**
 * lesson.js — 레슨 카드 배틀 (LESSON_PROTO_PLAN §5.2 · §5.3).
 *
 * 상태는 RunState 안의 state.lesson (LessonState) 에 둔다. JSON 순수 객체이고 함수를 넣지 않는다.
 * 상태를 바꾸는 함수 (startLesson · playCard · lessonRest · endLessonTurn) 는 (state, data, args) 를 받아 state 를 돌려준다.
 *   - rng 는 함수에 들어올 때 state.rngState 로 열고, 나가기 직전에 저장한다 (§8). 검증은 rng · 상태를 건드리기 전에 끝낸다.
 *   - 상태를 바꾸는 레슨 호출마다 lesson.seq +1, lesson.lastFx 를 덮어쓴다 (startLesson 은 seq 0).
 * 뷰 · 미리보기 (getLessonView · previewCard · lessonResult) 는 rng 를 쓰지 않고 상태를 바꾸지 않는다.
 *
 * 레슨이 끝나면 (status ≠ "playing") 레슨 안의 끝 처리 (§5.3.3 1~3: 자율 훈련 · 한나 · 결과 판정) 까지만 한다.
 * 보상 · 힌트 · 결장 감소 · 기록 · phase 이동은 lessonRun.js (E4) 가 한다.
 *
 * 방침 버프 (E3): 버프 값 (state.lesson.buffs) 을 "읽는" 쪽 — 호조 배율 · 집중 몫 · routine · perMood · perPress ·
 * 압박 비용 배율 · 방침 배율 · 호조 소비 — 은 여기서 계산한다 (버프가 0이면 영향 없음).
 * 버프 값을 "바꾸는" 쪽 — 버프 effects (hojo · focus · mood · moodX2 · noDecay · steal · press · pressDrop · poss · possGuard · routine),
 * 방침 패시브 (§5.3.1 13번), 분위기 틱 · 감소 (§5.3.2), 쉬기의 압박 회복, chips, 미리보기 notes — 는 아래 "E3 훅" 함수 자리만 있다 (값 0).
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다.
 */
import { createRngFromState } from "./rng.js";
import { STATS, clamp, trainingMult, failRateForStamina, getModifier } from "./training.js";
import * as cards from "./cards.js";

/** 부동소수 오차 없이 반올림 */
const rnd = cards.roundCost;

/** 버프 초기값 (§5.2) */
export function emptyBuffs() {
  return {
    hojo: 0, focus: 0, mood: 0, noDecay: 0, steal: 0, press: 0, poss: 0, possGuard: 0,
    routine: 0, nextPct: 0, nextPairPct: 0, nextNoFail: false, nextCostZero: false,
  };
}

// ---------------------------------------------------------------------------
// 공용 헬퍼
// ---------------------------------------------------------------------------

function lessonData(data) {
  const L = data && data.lesson;
  if (!L || !L.lesson) throw new Error("data.lesson 이 없습니다 (data/lesson.json)");
  return L;
}

function playerById(state, id) {
  const p = (state.players || []).find((x) => x.id === id);
  if (!p) throw new Error(`선수 '${id}' 을(를) 찾을 수 없습니다`);
  return p;
}

function growthOf(p, stat) {
  const g = Number(p.growth && p.growth[stat]);
  return Number.isFinite(g) ? g : 1;
}

function assertLesson(state) {
  const L = state && state.lesson;
  if (!L) throw new Error("레슨 중이 아닙니다");
  return L;
}

/** 카드를 낼 수 있는 상태인가 (phase 가 있으면 lesson, 레슨 status playing) */
function assertPlaying(state) {
  if (state.phase !== undefined && state.phase !== null && state.phase !== "lesson") {
    throw new Error(`이 행동은 phase 'lesson' 에서만 할 수 있습니다 (지금: '${state.phase}')`);
  }
  const L = assertLesson(state);
  if (L.status !== "playing") throw new Error(`레슨이 이미 끝났습니다 (${L.status})`);
  return L;
}

/**
 * 레슨 카드 uid → { uid, cardId, plus }. k* = 덱 (state.deck), t* = 임시 대비 카드 (lesson.temp).
 * @param {object} state
 * @param {string} uid
 */
export function lessonEntry(state, uid) {
  const L = state.lesson;
  const list = typeof uid === "string" && uid.startsWith("t") ? (L && L.temp) || [] : state.deck || [];
  const e = list.find((x) => x.uid === uid);
  if (!e) throw new Error(`카드 '${uid}' 을(를) 찾을 수 없습니다`);
  return { uid, cardId: e.cardId, plus: !!e.plus };
}

/**
 * 덱 항목의 카드 정의를 해석한다 (코치 카드는 그 코치의 유대로 bond80 판정). 매번 새 객체.
 * @param {object} state
 * @param {object} data
 * @param {{ cardId: string, plus?: boolean }} entry
 */
export function resolveEntry(state, data, entry) {
  const raw = cards.getCard(data, entry.cardId);
  let bond = 0;
  if (raw.family === "coach" && raw.coach) {
    const st = (state.supports || []).find((s) => s.id === raw.coach.supportId);
    bond = st ? Number(st.bond) || 0 : 0;
  }
  return cards.resolveCardDef(data, raw, { plus: !!entry.plus && cards.canUpgrade(raw), bond });
}

/** uid 의 카드 정의 (lessonEntry + resolveEntry) */
export function lessonCardDef(state, data, uid) {
  return resolveEntry(state, data, lessonEntry(state, uid));
}

/** 이 uid 가 charId 주인의 고유 카드인가 */
function isUniqueOf(state, data, uid, charId) {
  const c = cards.getCard(data, lessonEntry(state, uid).cardId);
  return c.family === "unique" && c.ownerCharId === charId;
}

function supportFailReduction(data, supportId) {
  const sp = (data.supports || []).find((s) => s.id === supportId);
  return sp ? Number(sp.failRateReduction) || 0 : 0;
}

function addStamina(p, n, fx) {
  const before = Number(p.stamina) || 0;
  p.stamina = clamp(before + n, 0, 100);
  const d = p.stamina - before;
  if (d !== 0 && fx) fx.push({ t: "heal", id: p.id, n: d });
  return d;
}

function addTeamwork(state, n, fx) {
  const before = Number(state.teamwork) || 0;
  state.teamwork = clamp(before + n, 0, 100);
  const d = state.teamwork - before;
  if (d !== 0 && fx) fx.push({ t: "tw", n: d });
  return d;
}

function setBuff(L, key, value, fx) {
  const from = L.buffs[key];
  if (from === value) return;
  L.buffs[key] = value;
  if (fx) fx.push({ t: "buff", key, from, to: value });
}

// ---------------------------------------------------------------------------
// 방침 버프 — 읽는 쪽 (§5.3.1 4 · 5 · 7번). 버프가 0이면 영향 없음.
// ---------------------------------------------------------------------------

/** 1인 위력에 더하는 집중 몫: focus × focusPer × (focusX2 ? 2 : 1) / |T| */
function focusShare(data, L, ctx) {
  if (!ctx.n) return 0;
  const B = lessonData(data).buffs;
  return (L.buffs.focus * B.focusPer * (ctx.mods.focusX2 ? 2 : 1)) / ctx.n;
}

/** 압박 비용 배율: 1 + pressCostK × press (noPressCost always · atLeast2 && press ≥ 2 → 1) */
function pressCostMultOf(data, L, mods) {
  const press = L.buffs.press || 0;
  if (mods.noPressCost === "always") return 1;
  if (mods.noPressCost === "atLeast2" && press >= 2) return 1;
  return 1 + lessonData(data).buffs.pressCostK * press;
}

/** 방침 배율 (run 방침이 맞을 때만, T ≠ ∅ 일 때만) */
function policyMult(state, data, L, ctx) {
  if (!ctx.n) return 1;
  const B = lessonData(data).buffs;
  switch (state.policy) {
    case "counter":
      return ctx.usesSteal ? 1 + (ctx.mods.stealPer ?? B.stealPer) * (L.buffs.steal || 0) : 1;
    case "poss":
      return 1 + B.possK * (L.buffs.poss || 0) * (ctx.mods.possX2 ? 2 : 1);
    case "press":
      return 1 + B.pressK * (L.buffs.press || 0);
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// E3 훅 — 버프 값을 바꾸는 쪽. E2 에서는 아무것도 하지 않는다 (값 0).
// ---------------------------------------------------------------------------

/** 버프 effects (hojo · focus · mood · moodX2 · noDecay · steal · press · pressDrop · poss · possGuard · routine). E3. */
export const BUFF_EFFECT_TYPES = ["hojo", "focus", "mood", "moodX2", "noDecay", "steal", "press", "pressDrop", "poss", "possGuard", "routine"];

// eslint-disable-next-line no-unused-vars
function applyBuffEffect(state, data, effect, play) {
  // E3: 버프 effects. E2 에서는 값 0 (아무것도 하지 않는다).
}

/**
 * 방침 패시브 (§5.3.1 13번): counter 탈취 쌓기 · 쓰기, poss ± · 가드, press 실패 리셋.
 * play.consumed (이 카드가 탈취를 썼는가) 를 정한다. E3.
 */
// eslint-disable-next-line no-unused-vars
function applyPolicyPassive(state, data, play) {
  play.consumed = false;
}

/** 턴 끝 분위기 틱 · 감소 (§5.3.2 턴 끝 1 · 2). E3. */
// eslint-disable-next-line no-unused-vars
function turnEndBuffs(state, data, fx) {}

/** 레슨 중 쉬기의 압박 회복 (+4 × 단계, 압박 0). E3. */
// eslint-disable-next-line no-unused-vars
function restBuffs(state, data, fx) {}

/** 뷰의 버프 칩 (방침에 맞는 것과 0이 아닌 것만). E3. */
// eslint-disable-next-line no-unused-vars
function buffChips(state, data) {
  return [];
}

/** 미리보기 노트 문구 ("탈취 3 → ×1.9" 등). E3. */
// eslint-disable-next-line no-unused-vars
function previewNotes(state, data, plan) {
  return [];
}

// ---------------------------------------------------------------------------
// 카드 계산 (순수) — §5.3.1 1~7번
// ---------------------------------------------------------------------------

/**
 * 카드 1장을 냈을 때의 계산 (rng 없음, 상태 변경 없음). 잘못된 입력은 throw.
 * @returns {{ entry, def, mode, kind, T: string[], effects: object[], rows: object[], f: number, failerId: string|null, M: number, ctx: object }}
 */
function planPlay(state, data, uid, taps) {
  const L = state.lesson;
  if (!L.hand.includes(uid)) throw new Error(`카드 '${uid}' 은(는) 손패에 없습니다`);
  const LD = lessonData(data);
  const cfg = data.config;
  const entry = lessonEntry(state, uid);
  const def = resolveEntry(state, data, entry);
  const mode = cards.cardMode(state, def, L.stat);
  const kind = cards.effectiveKind(def, mode);
  const dead = cards.deadReason(state, def, { mode });
  if (dead) throw new Error(`'${def.name}': ${dead}`);
  const tapList = Array.isArray(taps) ? taps.slice() : [];
  const T = cards.targetsFor(state, def, tapList, { mode });
  const effects = mode === "support" ? (def.support && def.support.effects) || [] : def.effects || [];
  const mods = def.mods || {};
  const B = L.buffs;
  const players = T.map((id) => playerById(state, id));
  const n = T.length;
  const isRange = cards.RANGE_KINDS.includes(kind);
  const partnerIndex = kind === "owner" && def.target.partner ? 1 : -1;
  const ctx = {
    n,
    mods,
    pairCard: n > 0 && cards.isPairCard(def),
    usesSteal: n > 0 && players.some((p) => p.position === "MF" || p.position === "FW"),
    allDefense: n > 0 && players.every((p) => p.position === "GK" || p.position === "DF"),
    hasMF: players.some((p) => p.position === "MF"),
  };

  // 4. 1인 위력 (소수 유지)
  const share = focusShare(data, L, ctx);
  const power = players.map((p, i) => {
    let base;
    if (isRange) base = (def.power + (mods.perMood || 0) * (B.mood || 0) + (mods.perPress || 0) * (B.press || 0)) / n;
    else if (i === partnerIndex) base = def.target.partner.power;
    else base = def.power + (kind === "single" ? B.routine || 0 : 0);
    return base + share;
  });

  // 5. 비용
  const pcm = pressCostMultOf(data, L, mods);
  const costs = players.map((p, i) =>
    cards.staminaCost(def, {
      count: n, mood: B.mood || 0, press: B.press || 0, partner: i === partnerIndex, pressCostMult: pcm, costZero: !!B.nextCostZero,
    }),
  );

  // 6. 실패율 (비용 내기 전 체력)
  const noFail = !!mods.noFail || !!B.nextNoFail;
  const injuryMod = getModifier(state, "injuryRate");
  const reduce = def.family === "coach" && def.coach ? supportFailReduction(data, def.coach.supportId) : 0;
  const rates = players.map((p) =>
    noFail ? 0 : clamp(failRateForStamina(cfg, Number(p.stamina) || 0) + injuryMod + (mods.failPlus || 0) - reduce, 0, 0.95),
  );
  const f = n ? Math.max(...rates) : 0;
  let failerId = null;
  if (f > 0) {
    // 실패율 높은 쪽 → 체력 낮은 쪽 → 슬롯 순서 (D21)
    const order = (id) => state.players.findIndex((p) => p.id === id);
    let best = 0;
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      const b = players[best];
      if (rates[i] > rates[best] ||
        (rates[i] === rates[best] && (p.stamina < b.stamina || (p.stamina === b.stamina && order(p.id) < order(b.id))))) best = i;
    }
    failerId = players[best].id;
  }

  // 7. 배율 M
  const ls = LD.lesson;
  let M = trainingMult(cfg, Number(state.condition) || 0);
  if (n && (B.hojo || 0) > 0) M *= LD.buffs.hojoMult;
  M *= 1 + (L.special ? ls.special.gainBonus : 0) + getModifier(state, "trainingEfficiency");
  if (def.family === "coach" && def.coach && def.coach.type === L.stat) M *= ls.coachSameTypeMult;
  if (mods.lastTurnX2 && L.turn > L.turns - mods.lastTurnX2) M *= 2;
  if (mods.underdog && L.score < L.target) M *= 1 + mods.underdog;
  if (mods.lessonMult && mods.lessonMult.stats.includes(L.stat)) M *= mods.lessonMult.mult;
  M *= 1 + (B.nextPct || 0) + (ctx.pairCard ? B.nextPairPct || 0 : 0);
  M *= policyMult(state, data, L, ctx);

  // 10번의 상승 (실패하지 않았을 때). 실제 오른 양은 상한 1000에 잘린 값.
  const cap = cfg.statCap;
  const sub = cfg.training.subStatMap[L.stat];
  const rows = players.map((p, i) => {
    const g = rnd(power[i] * growthOf(p, L.stat) * M);
    const gain = Math.max(0, Math.min(g, cap - p.stats[L.stat]));
    const sg = rnd(g * ls.subGainRatio * growthOf(p, sub));
    const subGain = Math.max(0, Math.min(sg, cap - p.stats[sub]));
    return { id: p.id, power: power[i], g, gain, subGain, cost: costs[i], failRate: rates[i] };
  });

  return { entry, def, mode, kind, T, taps: tapList, effects, rows, f, failerId, M, pressCostMult: pcm, ctx, buffsBefore: { ...B } };
}

// ---------------------------------------------------------------------------
// 뽑기 · 턴 · 끝 (§5.3.2 · §5.3.3)
// ---------------------------------------------------------------------------

function drawOne(L, rng) {
  if (!L.drawPile.length) {
    if (!L.discard.length) return false;
    L.drawPile = rng.shuffle(L.discard);
    L.discard = [];
  }
  L.hand.push(L.drawPile.shift());
  return true;
}

function deadOf(state, data, uid) {
  return cards.deadReason(state, lessonCardDef(state, data, uid));
}

/** 턴 시작: 출전 0명이면 끝, 아니면 3 + drawNext 장 뽑기 + 죽은 카드 다시 뽑기 */
function beginTurn(state, data, rng, fx) {
  const L = state.lesson;
  if (cards.activePlayers(state).length === 0) return finishLesson(state, data, fx); // D45
  const n = lessonData(data).lesson.hand + (L.drawNext || 0);
  L.drawNext = 0;
  L.playsLeft = 1;
  L.playedThisTurn = 0;
  L.restTurn = false;
  for (let i = 0; i < n; i++) if (!drawOne(L, rng)) break;
  const limit = L.drawPile.length + L.discard.length + L.hand.length;
  for (let k = 0; k < limit; k++) {
    const idx = L.hand.findIndex((uid) => deadOf(state, data, uid));
    if (idx < 0) break;
    const [dead] = L.hand.splice(idx, 1);
    L.discard.push(dead);
    if (!drawOne(L, rng)) break;
  }
  fx.push({ t: "draw", uids: L.hand.slice() });
}

/** 턴 끝: (E3 분위기) → 퍼펙트 판정 → 손패 버림 → 마지막 턴이면 끝, 아니면 다음 턴 시작 */
function endTurn(state, data, rng, fx) {
  const L = state.lesson;
  turnEndBuffs(state, data, fx);
  fx.push({ t: "turnEnd", turn: L.turn });
  if (L.score >= L.cap) return finishLesson(state, data, fx);
  L.discard.push(...L.hand);
  L.hand = [];
  if (L.turn >= L.turns) return finishLesson(state, data, fx);
  L.turn += 1;
  beginTurn(state, data, rng, fx);
}

/** 레슨 끝 (§5.3.3 1~3): 자율 훈련 → 한나 효과 → 결과 판정 (+ 퍼펙트 체력) */
function finishLesson(state, data, fx) {
  const L = state.lesson;
  const ls = lessonData(data).lesson;
  const cap = data.config.statCap;
  const stat = L.stat;

  // 1. 자율 훈련
  const targetedIds = Object.keys(L.targeted).filter((id) => L.targeted[id] > 0);
  const avg = targetedIds.length ? L.cardGainSum / targetedIds.length : 0;
  const auto = rnd(avg * ls.autoTrainRatio);
  L.autoGains = {};
  for (const p of state.players) {
    if (L.targeted[p.id] || L.out.includes(p.id)) continue;
    const g = Math.max(0, Math.min(auto, cap - p.stats[stat]));
    p.stats[stat] += g;
    L.autoGains[p.id] = g;
    if (g) fx.push({ t: "gain", id: p.id, stat, n: g, sub: 0, auto: true });
    addStamina(p, ls.autoTrainStamina, fx);
  }

  // 2. 한나 효과
  if (L.endHeal > 0) for (const p of cards.activePlayers(state)) addStamina(p, L.endHeal, fx);

  // 3. 결과
  if (L.score >= L.cap) {
    L.status = "perfect";
    const bonus = ls.perfectStaminaPerTurn * Math.max(0, L.turns - L.turn);
    if (bonus > 0) for (const p of state.players) addStamina(p, bonus, fx);
  } else {
    L.status = L.score >= L.target ? "clear" : "fail";
  }
  L.playsLeft = 0;
  fx.push({ t: "end", status: L.status });
}

/** 선수 부상: out 에 넣고 injuredTurns = max(cur, 1), 그 선수의 고유 카드를 손패 · 더미에서 removed 로 */
function injure(state, data, p) {
  const L = state.lesson;
  if (!L.out.includes(p.id)) L.out.push(p.id);
  p.injuredTurns = Math.max(Number(p.injuredTurns) || 0, 1);
  for (const pile of ["hand", "drawPile", "discard"]) {
    L[pile] = L[pile].filter((uid) => {
      if (isUniqueOf(state, data, uid, p.charId)) {
        L.removed.push(uid);
        return false;
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// 카드 effects (§4.3 · §5.3.1 14번)
// ---------------------------------------------------------------------------

function healTargets(state, data, to, play) {
  const active = cards.activePlayers(state);
  switch (to) {
    case "tap":
      return play.taps.length ? [playerById(state, play.taps[0])] : [];
    case "all":
      return active;
    case "defense":
      return active.filter((p) => p.position === "GK" || p.position === "DF");
    case "mostTired": {
      let best = null;
      for (const p of active) if (!best || p.stamina < best.stamina) best = p;
      return best ? [best] : [];
    }
    case "owner": {
      const owner = cards.ownerOf(state, play.def);
      return owner ? [owner] : [];
    }
    default:
      throw new Error(`알 수 없는 heal 대상 '${to}'`);
  }
}

function applyEffect(state, data, e, play) {
  const L = state.lesson;
  const fx = play.fx;
  switch (e.type) {
    case "heal":
      for (const p of healTargets(state, data, e.to, play)) addStamina(p, e.n, fx);
      return;
    case "teamwork":
      addTeamwork(state, e.n, fx);
      return;
    case "nextPct":
      setBuff(L, "nextPct", (L.buffs.nextPct || 0) + e.pct, fx);
      return;
    case "nextPairPct":
      setBuff(L, "nextPairPct", (L.buffs.nextPairPct || 0) + e.pct, fx);
      return;
    case "nextNoFail":
      setBuff(L, "nextNoFail", true, fx);
      return;
    case "nextCostZero":
      setBuff(L, "nextCostZero", true, fx);
      return;
    case "extraPlay":
      play.extraPlay += e.n;
      return;
    case "drawNext":
      L.drawNext = (L.drawNext || 0) + e.n;
      return;
    case "endHeal":
      L.endHeal = (L.endHeal || 0) + e.n;
      return;
    case "lumiFlag":
      L.lumiFlag = true;
      return;
    default:
      if (BUFF_EFFECT_TYPES.includes(e.type)) return applyBuffEffect(state, data, e, play);
      throw new Error(`알 수 없는 effect '${e.type}'`);
  }
}

// ---------------------------------------------------------------------------
// 공개 API — 상태를 바꾸는 함수
// ---------------------------------------------------------------------------

/**
 * 레슨 시작: 목표 · 상한, 결장 처리, 결장 선수의 고유 카드 제외, 대비 카드, 섞기, 1턴 뽑기.
 * phase 는 바꾸지 않는다 (lessonRun 이 정한다). 출전 선수가 0명이면 바로 끝난다 (status ≠ playing).
 * @param {object} state RunState (players · deck · season · condition · rngState …)
 * @param {object} data
 * @param {{ stat: string, special?: boolean, prep?: boolean, prepCards?: string[] }} args
 * @returns {object} state
 */
export function startLesson(state, data, { stat, special = false, prep = false, prepCards = [] } = {}) {
  const LD = lessonData(data);
  if (!STATS.includes(stat)) throw new Error(`알 수 없는 레슨 종목: '${stat}'`);
  if (state.lesson && state.lesson.status === "playing") throw new Error("이미 레슨 중입니다");
  if (!Array.isArray(state.deck)) throw new Error("state.deck 이 없습니다");
  if (!Array.isArray(prepCards)) throw new Error("prepCards 는 배열이어야 합니다");
  for (const id of prepCards) {
    if (cards.getCard(data, id).family !== "prep") throw new Error(`'${id}' 은(는) 대비 카드가 아닙니다`);
  }
  const ls = LD.lesson;
  const si = clamp((Number(state.season) || 1) - 1, 0, ls.turns.length - 1);
  const turns = ls.turns[si];
  let [target, cap] = ls.targets[si];
  if (special) {
    target = rnd(target * ls.special.targetMult);
    cap = rnd(cap * ls.special.targetMult);
  }

  const outAtStart = state.players.filter((p) => (Number(p.injuredTurns) || 0) > 0).map((p) => p.id);
  const outChars = new Set(state.players.filter((p) => outAtStart.includes(p.id)).map((p) => p.charId));
  const removed = [];
  const pile = [];
  for (const e of state.deck) {
    const c = cards.getCard(data, e.cardId);
    if (c.family === "unique" && outChars.has(c.ownerCharId)) removed.push(e.uid);
    else pile.push(e.uid);
  }
  const temp = prepCards.map((cardId, i) => ({ uid: `t${i + 1}`, cardId }));
  const before = {};
  for (const p of state.players) before[p.id] = { ...p.stats };

  const rng = createRngFromState(state.rngState);
  state.lesson = {
    stat, special: !!special, prep: !!prep,
    turn: 1, turns, target, cap, score: 0,
    status: "playing",
    playsLeft: 1, playedThisTurn: 0, restTurn: false,
    drawPile: rng.shuffle([...pile, ...temp.map((t) => t.uid)]), hand: [], discard: [], exhausted: [],
    removed, temp,
    drawNext: 0,
    buffs: emptyBuffs(),
    outAtStart, out: outAtStart.slice(),
    targeted: {}, cardGainSum: 0,
    twAccrued: 0, endHeal: 0, lumiFlag: false,
    autoGains: {}, before,
    seq: 0, lastFx: [],
    stats: { plays: 0, rests: 0, fails: 0, injuries: 0 },
  };
  const fx = [];
  beginTurn(state, data, rng, fx);
  state.lesson.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 카드 1장 내기 (§5.3.1). 끝나면 턴 끝이나 레슨 끝까지 진행한다.
 * @param {object} state
 * @param {object} data
 * @param {{ uid: string, taps?: string[] }} args
 * @returns {object} state
 */
export function playCard(state, data, { uid, taps } = {}) {
  const L = assertPlaying(state);
  if (!(L.playsLeft >= 1)) throw new Error("이번 턴에는 더 낼 수 없습니다");
  const plan = planPlay(state, data, uid, taps); // 1~7 (검증 포함, 상태 변경 없음)
  const LD = lessonData(data);
  const ls = LD.lesson;
  const rng = createRngFromState(state.rngState);
  const fx = [];
  const { def, T, rows } = plan;
  const stat = L.stat;
  const sub = data.config.training.subStatMap[stat];
  L.hand.splice(L.hand.indexOf(uid), 1);
  L.stats.plays += 1;

  // 8. 비용
  for (const r of rows) {
    const p = playerById(state, r.id);
    const before = Number(p.stamina) || 0;
    p.stamina = clamp(before - r.cost, 0, 100);
    if (before !== p.stamina) fx.push({ t: "cost", id: p.id, n: before - p.stamina });
  }

  // 9. 실패 판정 (카드 1장에 1번)
  const failerId = plan.f > 0 && rng.chance(plan.f) ? plan.failerId : null;

  // 10. 상승 · 실패
  for (const r of rows) {
    const p = playerById(state, r.id);
    if (r.id === failerId) {
      const loss = Math.min(ls.failStatLoss, p.stats[stat]);
      p.stats[stat] -= loss;
      L.score -= loss;
      L.stats.fails += 1;
      const injured = rng.chance(ls.injuryChanceOnFail);
      if (injured) {
        injure(state, data, p);
        L.stats.injuries += 1;
      }
      fx.push({ t: "fail", id: p.id, n: loss, injured });
    } else {
      p.stats[stat] += r.gain;
      p.stats[sub] += r.subGain;
      L.score += r.gain;
      L.cardGainSum += r.gain;
      fx.push({ t: "gain", id: p.id, stat, n: r.gain, sub: r.subGain });
    }
  }

  // 11. L10 팀워크 (|T| ≥ 2, 레슨당 lessonCap 까지)
  if (T.length >= 2) {
    const tw = LD.teamwork;
    const successes = T.length - (failerId ? 1 : 0);
    let add = plan.ctx.pairCard ? (failerId ? 0 : tw.pair) : Math.max(0, successes - 1) * tw.perExtraTarget;
    add = Math.min(add, Math.max(0, tw.lessonCap - L.twAccrued));
    if (add > 0) {
      L.twAccrued += add;
      addTeamwork(state, add, fx);
    }
  }

  // 12. 일회성 버프 소비 (T ≠ ∅)
  if (T.length) {
    if (L.buffs.hojo > 0) setBuff(L, "hojo", L.buffs.hojo - 1, fx);
    setBuff(L, "nextPct", 0, fx);
    setBuff(L, "nextNoFail", false, fx);
    setBuff(L, "nextCostZero", false, fx);
    if (plan.ctx.pairCard) setBuff(L, "nextPairPct", 0, fx);
  }

  // 13. 방침 패시브 (E3)
  const play = { ...plan, failerId, consumed: false, extraPlay: 0, fx };
  applyPolicyPassive(state, data, play);

  // 14. 카드 effects
  const success = !failerId;
  for (const e of plan.effects) {
    const when = e.when || "always";
    if (when === "success" && !success) continue;
    if (when === "consume" && !play.consumed) continue;
    applyEffect(state, data, e, play);
  }
  if (def.family === "coach" && def.coach) {
    const st = (state.supports || []).find((s) => s.id === def.coach.supportId);
    if (st) st.bond = clamp(Math.round((Number(st.bond) || 0) + LD.bond.play + getModifier(state, "bondGain")), 0, 100);
  }

  // 15. 기록 · 카드 이동
  for (const id of T) L.targeted[id] = (L.targeted[id] || 0) + 1;
  const owner = def.family === "unique" ? cards.ownerOf(state, def) : null;
  if (owner && L.out.includes(owner.id)) L.removed.push(uid);
  else if (def.exhaust) L.exhausted.push(uid);
  else L.discard.push(uid);

  // 16. 퍼펙트 판정 → 17. 사용 횟수
  if (L.score >= L.cap) {
    finishLesson(state, data, fx);
  } else {
    L.playedThisTurn += 1;
    L.playsLeft = L.playsLeft - 1 + play.extraPlay;
    if (L.playsLeft <= 0 || L.hand.length === 0) endTurn(state, data, rng, fx);
  }

  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 레슨 중 쉬기: 턴의 첫 행동일 때만. 고른 선수 +rest.picked, 나머지 출전 선수 +rest.others. 그 턴을 끝낸다.
 * 고른 선수는 7명 중 아무나 (결장 선수도 — 탭 카드와 같다).
 * @param {object} state
 * @param {object} data
 * @param {{ playerId: string }} args
 * @returns {object} state
 */
export function lessonRest(state, data, { playerId } = {}) {
  const L = assertPlaying(state);
  if (L.playedThisTurn > 0) throw new Error("쉬기는 그 턴의 첫 행동일 때만 할 수 있습니다");
  const picked = playerById(state, playerId);
  const rest = lessonData(data).lesson.rest;
  const rng = createRngFromState(state.rngState);
  const fx = [];
  addStamina(picked, rest.picked, fx);
  for (const p of cards.activePlayers(state)) if (p.id !== picked.id) addStamina(p, rest.others, fx);
  restBuffs(state, data, fx);
  L.restTurn = true;
  L.stats.rests += 1;
  endTurn(state, data, rng, fx);
  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 턴 끝 (카드를 1장 이상 낸 뒤에만). 남은 추가 사용은 버린다.
 * @param {object} state
 * @param {object} data
 * @returns {object} state
 */
export function endLessonTurn(state, data) {
  const L = assertPlaying(state);
  if (!(L.playedThisTurn > 0)) throw new Error("카드를 1장 이상 낸 뒤에 턴을 끝낼 수 있습니다 (아니면 쉬기)");
  const rng = createRngFromState(state.rngState);
  const fx = [];
  L.playsLeft = 0;
  endTurn(state, data, rng, fx);
  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

// ---------------------------------------------------------------------------
// 뷰 (순수, rng 없음)
// ---------------------------------------------------------------------------

function playerFailRate(state, data, p) {
  return clamp(failRateForStamina(data.config, Number(p.stamina) || 0) + getModifier(state, "injuryRate"), 0, 0.95);
}

function cardView(state, data, uid) {
  const L = state.lesson;
  const entry = lessonEntry(state, uid);
  const def = resolveEntry(state, data, entry);
  const mode = cards.cardMode(state, def, L.stat);
  const kind = cards.effectiveKind(def, mode);
  const dead = cards.deadReason(state, def, { mode });
  const { need } = cards.tapCandidates(state, def, { mode });
  const B = L.buffs;
  let count = null;
  let cost = null;
  if (kind !== "none" && kind !== "tap" && !dead) {
    count = cards.RANGE_KINDS.includes(kind) ? cards.targetsFor(state, def, [], { mode }).length : 1;
    cost = cards.staminaCost(def, {
      count, mood: B.mood || 0, press: B.press || 0, pressCostMult: pressCostMultOf(data, L, def.mods || {}), costZero: !!B.nextCostZero,
    });
  }
  const playing = L.status === "playing";
  return {
    uid, cardId: def.id, name: def.name, family: def.family, plus: def.plus, bond80: def.bond80,
    mode, targetKind: kind, needTaps: need,
    playable: playing && L.playsLeft >= 1 && !dead,
    deadReason: dead,
    power: mode === "support" ? null : def.power,
    count, cost,
    exhaust: !!def.exhaust,
    desc: def.desc,
  };
}

/**
 * 레슨 화면 뷰 (§5.3.4). 순수.
 * @param {object} state
 * @param {object} data
 */
export function getLessonView(state, data) {
  const L = assertLesson(state);
  const playing = L.status === "playing";
  return {
    season: state.season, week: state.turn,
    stat: L.stat, special: L.special, prep: L.prep, policy: state.policy || null,
    turn: L.turn, turns: L.turns, score: L.score, target: L.target, cap: L.cap, status: L.status,
    playsLeft: L.playsLeft,
    canRest: playing && L.playedThisTurn === 0,
    canEndTurn: playing && L.playedThisTurn > 0,
    buffs: { ...L.buffs },
    chips: buffChips(state, data),
    hand: L.hand.map((uid) => cardView(state, data, uid)),
    piles: { draw: L.drawPile.length, discard: L.discard.length, exhausted: L.exhausted.length, removed: L.removed.length },
    players: state.players.map((p) => ({
      id: p.id, name: p.name, slot: p.slot, position: p.position, portraitColor: p.portraitColor,
      stamina: p.stamina,
      out: L.out.includes(p.id),
      injured: L.out.includes(p.id) && !L.outAtStart.includes(p.id),
      targeted: L.targeted[p.id] || 0,
      failRate: playerFailRate(state, data, p),
    })),
    seq: L.seq,
    lastFx: L.lastFx.map((x) => ({ ...x })),
  };
}

function blockedReason(state, def, kind, p) {
  if (cards.isOut(state, p) && kind !== "tap") return "결장 중";
  if (kind === "single" && def.target.only && !def.target.only.includes(p.position)) return `${def.target.only.join("·")}만`;
  if (kind === "owner") {
    const owner = cards.ownerOf(state, def);
    if (owner && owner.id === p.id) return "카드 주인";
  }
  return "고를 수 없음";
}

/**
 * 카드 미리보기 (§5.3.4). 순수. 탭이 모자라면 ok: false 와 tapCandidates 를 돌려준다.
 * @param {object} state
 * @param {object} data
 * @param {{ uid: string, taps?: string[] }} args
 */
export function previewCard(state, data, { uid, taps } = {}) {
  const out = {
    ok: false, reason: null, mode: null,
    needTaps: 0, tapCandidates: [], blocked: [],
    targets: [], failRate: 0, failerId: null, notes: [],
  };
  const L = state && state.lesson;
  if (!L) return { ...out, reason: "레슨 중이 아닙니다" };
  if (L.status !== "playing") return { ...out, reason: "레슨이 끝났습니다" };
  if (!L.hand.includes(uid)) return { ...out, reason: "손패에 없는 카드입니다" };
  const def = lessonCardDef(state, data, uid);
  const mode = cards.cardMode(state, def, L.stat);
  const kind = cards.effectiveKind(def, mode);
  out.mode = mode;
  const dead = cards.deadReason(state, def, { mode });
  if (dead) return { ...out, reason: dead };
  const tapList = Array.isArray(taps) ? taps.slice() : [];
  const { need, candidates } = cards.tapCandidates(state, def, { mode });
  out.needTaps = need;
  out.tapCandidates = candidates.filter((id) => !tapList.includes(id));
  if (need > 0) {
    out.blocked = state.players.filter((p) => !candidates.includes(p.id)).map((p) => ({ id: p.id, reason: blockedReason(state, def, kind, p) }));
  }
  if (tapList.length < need) return { ...out, reason: `선수 ${need - tapList.length}명을 더 고르세요` };
  if (!(L.playsLeft >= 1)) return { ...out, reason: "이번 턴에는 더 낼 수 없습니다" };
  let plan;
  try {
    plan = planPlay(state, data, uid, tapList);
  } catch (e) {
    return { ...out, reason: e.message };
  }
  return {
    ...out,
    ok: true,
    targets: plan.rows.map((r) => ({ id: r.id, gain: r.gain, sub: r.subGain, cost: r.cost, failRate: r.failRate })),
    failRate: plan.f,
    failerId: plan.failerId,
    notes: previewNotes(state, data, plan),
  };
}

/**
 * 끝난 레슨의 결과 요약 (보상 화면 · lessonRun 기록용). 순수.
 * perPlayer: gain = 종목 순증가 − 자율 훈련, sub = 부 스탯 증가, auto = 자율 훈련.
 * @param {object} state
 * @param {object} data
 */
export function lessonResult(state, data) {
  const L = assertLesson(state);
  const stat = L.stat;
  const sub = data.config.training.subStatMap[stat];
  return {
    stat, special: L.special, prep: L.prep,
    score: L.score, target: L.target, cap: L.cap, status: L.status,
    turns: L.turns, turnReached: L.turn,
    plays: L.stats.plays, rests: L.stats.rests, fails: L.stats.fails, injuries: L.stats.injuries,
    twAccrued: L.twAccrued, endHeal: L.endHeal, lumiFlag: L.lumiFlag,
    outAtStart: L.outAtStart.slice(), out: L.out.slice(),
    perPlayer: state.players.map((p) => {
      const b = (L.before && L.before[p.id]) || p.stats;
      const auto = (L.autoGains && L.autoGains[p.id]) || 0;
      return { id: p.id, gain: p.stats[stat] - b[stat] - auto, sub: p.stats[sub] - b[sub], auto, targeted: L.targeted[p.id] || 0 };
    }),
  };
}
