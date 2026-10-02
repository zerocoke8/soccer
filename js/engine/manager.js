/**
 * manager.js — 감독 AI (LESSON_PROTO_PLAN §5.5). 순수 · 결정적이고 rng 를 쓰지 않는다.
 *
 * recommend* 함수는 상태를 읽기만 하고 (뷰 · 미리보기만 부른다) 다음에 할 행동 하나를 돌려준다.
 * UI 는 그 결과에 "추천" 배지만 붙인다. autoStep 만 상태를 바꾼다 (lessonRun 공개 함수로 한 단계 진행 — 헤드리스 시뮬 · 테스트 ·
 * 개발용 ?autolesson=1 용).
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다.
 */
import * as LR from "./lessonRun.js";
import * as lesson from "./lesson.js";
import * as cards from "./cards.js";
import { STATS, canLearnSkill, skillDiscountedCost } from "./training.js";

/** 카드 가치 계산의 평균 카드 상승 (초안 시뮬 value() 의 avg) */
const AVG_GAIN = 75;
/** 실패 기대 손실의 추가분 (§5.5 EV: f × (5 + 40)) */
const FAIL_EXTRA = 40;
/** 체력 부담 계수 */
const COST_K = 0.15;
/** 체력 40 미만 대상 1명당 감점 */
const LOW_TARGET_PENALTY = 10;
/** 덱이 이 장수를 넘으면 보상 카드 추가를 건너뛴다 */
const REWARD_DECK_MAX = 20;
/** 상담 삭제를 시작하는 덱 장수 (덱 > 14) */
const CONSULT_DELETE_ABOVE = 14;
const CONSULT_DELETE_IDS = ["cd_basic", "cd_coaching"];

// ---------------------------------------------------------------------------
// 공용 헬퍼
// ---------------------------------------------------------------------------

function slotOrder(state, id) {
  return state.players.findIndex((p) => p.id === id);
}

function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

/** 주 화면 기준 출전 선수 (injuredTurns = 0). 없으면 7명 전원 */
function weekActive(state) {
  const a = state.players.filter((p) => !((Number(p.injuredTurns) || 0) > 0));
  return a.length ? a : state.players;
}

function avgStamina(list) {
  return list.length ? list.reduce((a, p) => a + (Number(p.stamina) || 0), 0) / list.length : 0;
}

/** 체력이 가장 낮은 선수 (같으면 슬롯 순서) */
function lowestStamina(state, list) {
  return list.slice().sort((a, b) => a.stamina - b.stamina || slotOrder(state, a.id) - slotOrder(state, b.id))[0] || null;
}

function growthOf(p, stat) {
  const g = Number(p.growth && p.growth[stat]);
  return Number.isFinite(g) ? g : 1;
}

/**
 * 지명 · 짝 · 파트너 탭 (§5.5, D33): 레슨 종목을 주 스탯 쌍에 가진 선수 먼저, 그중 체력 높은 순 → 성장률 높은 순 → 슬롯 순서.
 * 주 스탯 선수가 모자라면 나머지 후보에서 같은 순서로 채운다.
 */
function pickBestTargets(state, candidates, stat, need) {
  const list = candidates.map((id) => playerById(state, id)).filter(Boolean);
  const main = (p) => (cards.mainStatsOf(p.position).includes(stat) ? 1 : 0);
  list.sort(
    (a, b) =>
      main(b) - main(a) ||
      b.stamina - a.stamina ||
      growthOf(b, stat) - growthOf(a, stat) ||
      slotOrder(state, a.id) - slotOrder(state, b.id),
  );
  return list.slice(0, need).map((p) => p.id);
}

/** 탭 회복 · 쉬기: 체력이 가장 낮은 선수 (출전 선수 먼저) */
function pickTired(state, candidates) {
  const list = candidates.map((id) => playerById(state, id)).filter(Boolean);
  const active = list.filter((p) => !cards.isOut(state, p));
  const p = lowestStamina(state, active.length ? active : list);
  return p ? [p.id] : [];
}

// ---------------------------------------------------------------------------
// 레슨 카드 고르기 (§5.5 카드 고르기)
// ---------------------------------------------------------------------------

/**
 * 카드 효과 · 방침 패시브의 가치 (초안 tools/drafts/lesson_sim.mjs value() 를 문서 상수 data.lesson.buffs 로 옮긴 것).
 * 방침 버프 (탈취 · 압박 · 점유) 는 run 방침이 맞을 때만 값이 있다 (다른 방침에서는 쌓여도 쓰이지 않는다).
 */
function buffValue(state, data, c) {
  const L = state.lesson;
  const BD = data.lesson.buffs;
  const B = L.buffs;
  const policy = state.policy;
  const v = (k) => Number(B[k]) || 0;
  const remaining = Math.max(0, L.turns - L.turn);
  const active = cards.activePlayers(state);
  const nAct = active.length;
  const lowSt = active.filter((p) => p.stamina < 50).length;
  const { f, T, effects, mods, consumes } = c;
  let val = 0;
  for (const e of effects) {
    const when = e.when || "always";
    const w = when === "success" ? (T.length ? 1 - f : 1) : when === "consume" ? (consumes ? 1 : 0) : 1;
    if (!w) continue;
    let x = 0;
    switch (e.type) {
      case "hojo": x = 0.5 * AVG_GAIN * Math.min(e.n, remaining); break;
      case "focus": x = e.n * BD.focusPer * remaining * 0.9; break;
      case "mood": {
        const n = Math.min(remaining + 1, v("mood") + e.n);
        x = e.n * BD.moodK * nAct * n * 0.8;
        break;
      }
      case "moodX2": x = v("mood") * BD.moodK * nAct * Math.min(remaining + 1, v("mood")) * 0.8; break;
      case "noDecay": x = v("mood") * BD.moodK * nAct * Math.min(e.turns, remaining) * 0.6; break;
      case "routine": x = Math.max(0, e.n - v("routine")) * remaining * 0.7; break;
      case "steal":
        if (policy === "counter") x = Math.min(BD.stealCap - v("steal"), e.n) * BD.stealPer * 40 * (remaining > 0 ? 0.8 : 0);
        break;
      case "press":
        if (policy === "press") x = Math.min(BD.pressCap - v("press"), e.n) * (BD.pressK * 40 * remaining * 0.6 - 4);
        break;
      case "pressDrop":
        if (v("press") > 0) {
          x = v("press") * nAct * e.perStage * 0.3 + lowSt * 3;
          if (policy === "press" && remaining > 1) x -= v("press") * BD.pressK * 40 * 0.8;
        }
        break;
      case "poss":
        if (policy === "poss") x = Math.min(BD.possCap - v("poss"), e.n) * BD.possK * 40 * remaining * 0.7;
        break;
      case "possGuard":
        if (policy === "poss") x = v("poss") * BD.possK * 40 * remaining * 0.1 + 5;
        break;
      case "heal":
        if (e.n < 0) x = e.n * 0.6;
        else if (e.to === "tap" || e.to === "mostTired") x = Math.min(e.n, 40) * 0.6 + lowSt * 4;
        else if (e.to === "all") x = e.n * nAct * 0.3 + lowSt * 2;
        else x = 8 + lowSt * 2;
        break;
      case "teamwork": x = e.n * 2; break;
      case "nextPct": x = AVG_GAIN * e.pct; break;
      case "nextPairPct": x = 20; break;
      case "nextNoFail":
      case "nextCostZero": x = 15; break;
      case "extraPlay": x = AVG_GAIN * 0.8 * e.n; break;
      case "drawNext": x = AVG_GAIN * 0.25 * e.n; break;
      case "endHeal": x = e.n * nAct * 0.3; break;
      case "lumiFlag": x = 10; break;
      default: break;
    }
    val += w * x;
  }
  // 방침 패시브 (§5.3.1 13번) — 쌓는 쪽의 가치
  if (T.length) {
    const ps = T.map((id) => playerById(state, id));
    const allDefense = ps.every((p) => p.position === "GK" || p.position === "DF");
    const hasMF = ps.some((p) => p.position === "MF");
    if (policy === "counter" && allDefense) {
      val += (1 - f) * Math.min(BD.stealCap - v("steal"), mods.stealBuild ?? 1) * BD.stealPer * 40 * (remaining > 0 ? 0.8 : 0);
    }
    if (policy === "poss" && hasMF) {
      val += (1 - f) * Math.min(BD.possCap - v("poss"), 1) * BD.possK * 40 * remaining * 0.7;
    }
  }
  return val;
}

/**
 * 손패 카드 1장의 점수 (§5.5 EV). 낼 수 없으면 null.
 *   EV = Σgain×(1−f) − f×(failStatLoss + 40) + 버프 가치 − 0.15×Σcost − 체력 40 미만 대상 1명당 10
 *   방침별 한 줄: counter 탈취 ≥ 3이면 공격진이 낀 카드 +30 · poss 실패 비용 + poss×8 (가드가 없을 때), MF 없는 대상 카드 −min(2, poss)×8
 */
function scoreCard(state, data, hv) {
  const L = state.lesson;
  let taps = [];
  if (hv.needTaps > 0) {
    const pv0 = lesson.previewCard(state, data, { uid: hv.uid, taps: [] });
    const cand = pv0.tapCandidates || [];
    taps = hv.targetKind === "tap" ? pickTired(state, cand) : pickBestTargets(state, cand, L.stat, hv.needTaps);
    if (taps.length < hv.needTaps) return null;
  }
  const pv = lesson.previewCard(state, data, { uid: hv.uid, taps });
  if (!pv.ok) return null;
  const def = lesson.lessonCardDef(state, data, hv.uid);
  const mode = cards.cardMode(state, def, L.stat);
  const effects = mode === "support" ? (def.support && def.support.effects) || [] : def.effects || [];
  const mods = mode === "support" ? {} : def.mods || {};
  const T = pv.targets.map((t) => t.id);
  const f = pv.failRate || 0;
  const ps = T.map((id) => playerById(state, id));
  const hasAttack = ps.some((p) => p.position === "MF" || p.position === "FW");
  const hasMF = ps.some((p) => p.position === "MF");
  const B = L.buffs;
  const steal = Number(B.steal) || 0;
  const poss = Number(B.poss) || 0;
  const consumes = state.policy === "counter" && hasAttack && steal > 0;

  const gain = pv.targets.reduce((a, t) => a + t.gain, 0);
  const cost = pv.targets.reduce((a, t) => a + t.cost, 0);
  let failLoss = data.lesson.lesson.failStatLoss + FAIL_EXTRA;
  if (state.policy === "poss" && T.length && !(Number(B.possGuard) > 0)) failLoss += poss * 8;
  let ev = gain * (1 - f) - f * failLoss;
  ev += buffValue(state, data, { f, T, effects, mods, consumes });
  ev -= COST_K * cost;
  ev -= LOW_TARGET_PENALTY * ps.filter((p) => p.stamina < 40).length;
  if (state.policy === "counter" && steal >= 3 && hasAttack) ev += 30;
  if (state.policy === "poss" && T.length && !hasMF && !mods.possKeep) ev -= Math.min(data.lesson.buffs.possNoMF, poss) * 8;
  return { uid: hv.uid, cardId: hv.cardId, taps, score: Math.round(ev * 100) / 100 };
}

/**
 * 레슨 중 다음 행동 (§5.5). 순수.
 * @returns {{ kind: "play", uid: string, taps: string[], score: number } | { kind: "rest", playerId: string } | { kind: "endTurn" }}
 */
export function recommendCard(state, data) {
  const L = state && state.lesson;
  if (!L || state.phase !== "lesson") throw new Error("레슨 중이 아닙니다");
  if (L.status !== "playing") throw new Error(`레슨이 이미 끝났습니다 (${L.status})`);
  const view = lesson.getLessonView(state, data);
  const active = cards.activePlayers(state);
  const scored = [];
  for (const hv of view.hand) {
    if (!hv.playable) continue;
    const s = scoreCard(state, data, hv);
    if (s) scored.push(s);
  }
  // 점수 높은 순, 같으면 손패 순서
  let best = null;
  for (const s of scored) if (!best || s.score > best.score) best = s;

  let restV = active.filter((p) => p.stamina < 40).length * 18 + (active.some((p) => p.stamina < 20) ? 30 : 0);
  // 압박형: 압박 ≥ 2이고 체력 40 미만 출전 선수가 있으면 라인 내리기 우선, 없으면 쉬기를 미룬다
  if (state.policy === "press" && (Number(L.buffs.press) || 0) >= 2 && active.some((p) => p.stamina < 40)) {
    const drop = scored.find((s) => s.cardId === "cd_drop_line");
    if (drop) return { kind: "play", uid: drop.uid, taps: drop.taps, score: drop.score };
    restV *= 0.5;
  }
  const tired = avgStamina(active) < 40;
  if (!best || tired || restV > best.score) {
    if (view.canRest) {
      const p = lowestStamina(state, active.length ? active : state.players);
      return { kind: "rest", playerId: p.id };
    }
    if (view.canEndTurn) return { kind: "endTurn" };
  }
  if (best) return { kind: "play", uid: best.uid, taps: best.taps, score: best.score };
  return view.canRest ? { kind: "rest", playerId: lowestStamina(state, state.players).id } : { kind: "endTurn" };
}

// ---------------------------------------------------------------------------
// 주 고르기 (§5.5 주 고르기)
// ---------------------------------------------------------------------------

function teamTotal(state, stat) {
  return state.players.reduce((a, p) => a + (Number(p.stats[stat]) || 0), 0);
}

/** 주 스탯 합: 그 종목을 주 스탯 쌍에 가진 선수들의 합 */
function mainStatTotal(state, stat) {
  return state.players.reduce((a, p) => a + (cards.mainStatsOf(p.position).includes(stat) ? Number(p.stats[stat]) || 0 : 0), 0);
}

/** 다음 상대 대응 종목 (D34): 수비, 수비가 이미 7명 합 1위면 패스 */
function counterStat(state) {
  const def = teamTotal(state, "defense");
  const top = STATS.every((s) => s === "defense" || teamTotal(state, s) < def);
  return top ? "pass" : "defense";
}

/** 지금 살 수 있는 힌트 스킬이 있는가 (힌트 · SP · 배울 수 있는 선수) */
function hasBuyableSkill(state, data) {
  for (const [skillId, level] of Object.entries(state.hints || {})) {
    if (!(level > 0)) continue;
    const sk = data.skills.find((s) => s.id === skillId);
    if (!sk || !sk.learnable) continue;
    if (state.skillPoints < skillDiscountedCost(Number(sk.cost) || 0, level)) continue;
    if (state.players.some((p) => canLearnSkill(state, data, skillId, p.id).ok)) return true;
  }
  return false;
}

/**
 * 주 행동 추천 (§5.5). 순수.
 * @returns {{ type: string, stat?: string, playerId?: string, free?: boolean, reason: string }}
 */
export function recommendWeek(state, data) {
  if (!state || state.phase !== "week") throw new Error("phase 'week' 에서만 추천합니다");
  const view = LR.getWeekView(state, data);
  if (view.freeOuting) {
    const p = lowestStamina(state, state.players);
    return { type: "outing", playerId: p.id, free: true, reason: "무료 외출 (주를 쓰지 않음)" };
  }
  const avg = avgStamina(weekActive(state));
  if (view.kind === "lesson" || view.kind === "prep") {
    if (avg < 40) return { type: "rest", reason: `출전 선수 평균 체력 ${Math.round(avg)} < 40` };
    const stats = view.lessons.map((l) => l.stat);
    const specials = view.lessons.filter((l) => l.special).map((l) => l.stat);
    if (specials.length) {
      const stat = specials.slice().sort((a, b) => teamTotal(state, a) - teamTotal(state, b) || STATS.indexOf(a) - STATS.indexOf(b))[0];
      return { type: "lesson", stat, reason: "특별 레슨" };
    }
    const cs = counterStat(state);
    if (stats.includes(cs)) return { type: "lesson", stat: cs, reason: "다음 상대 대응 종목" };
    const stat = stats.slice().sort((a, b) => mainStatTotal(state, a) - mainStatTotal(state, b) || STATS.indexOf(a) - STATS.indexOf(b))[0];
    return { type: "lesson", stat, reason: "주 스탯 합이 가장 낮은 종목" };
  }
  // 자유 주
  const open = new Set(view.actions.map((a) => a.type));
  if (avg < 50) return { type: "rest", reason: `출전 선수 평균 체력 ${Math.round(avg)} < 50` };
  if (open.has("consult") && (state.trainingPoints >= data.lesson.consult.price.common || hasBuyableSkill(state, data))) {
    return { type: "consult", reason: "TP · 힌트 스킬 사용" };
  }
  if (open.has("meeting") && state.teamwork < 100) return { type: "meeting", reason: "팀워크 +10" };
  if (open.has("friendly") && avg >= 70) return { type: "friendly", reason: "체력 여유 — 친선전" };
  if (open.has("outing")) {
    const p = lowestStamina(state, state.players);
    return { type: "outing", playerId: p.id, reason: "체력이 가장 낮은 선수와 외출" };
  }
  return { type: "rest", reason: "할 일이 없어 휴식" };
}

// ---------------------------------------------------------------------------
// 보상 · 상담 · 준비
// ---------------------------------------------------------------------------

function rewardRank(state, o) {
  if (o.kind === "upgrade") return 2;
  if (o.family === state.policy) return 4;
  if (o.family === "coach") return 3;
  return 1;
}

/**
 * 보상 추천 (§5.5). 순수.
 * 방침 > 코치 > 고유 강화 > 공용 (같으면 강화판, 그다음 번호 순). 덱이 20장을 넘으면 카드 추가는 건너뛴다 (고유 강화는 덱이 늘지 않아 고른다).
 * 무료 강화: 덱 순서상 첫 번째 강화 안 된 고유 카드, 없으면 첫 번째 강화할 수 있는 카드.
 * @returns {{ pick: number|null, upgradeUid: string|null }}
 */
export function recommendReward(state, data) {
  const v = LR.getRewardView(state, data);
  const deckFull = state.deck.length > REWARD_DECK_MAX;
  let pick = null;
  let bestKey = null;
  v.offer.forEach((o, i) => {
    if (deckFull && o.kind !== "upgrade") return;
    const key = rewardRank(state, o) * 2 + (o.plus ? 1 : 0);
    if (bestKey === null || key > bestKey) {
      bestKey = key;
      pick = i;
    }
  });
  let upgradeUid = null;
  if (v.freeUpgrades > 0 && v.upgradable.length) {
    const taken = pick !== null && v.offer[pick].kind === "upgrade" ? v.offer[pick].uid : null;
    const list = v.upgradable.filter((u) => u !== taken);
    const isUnique = (uid) => cards.getCard(data, state.deck.find((e) => e.uid === uid).cardId).family === "unique";
    upgradeUid = list.find(isUnique) ?? list[0] ?? null;
  }
  return { pick, upgradeUid };
}

/**
 * 상담 추천 (§5.5): 다음 op 하나, 없으면 { op: "end" }. 순수.
 *   1. 살 수 있는 힌트 스킬 (힌트 레벨 높은 것부터, 배울 수 있는 첫 선수)
 *   2. TP ≥ 30이면 방침 · 코치 카드 구매 (방침 먼저)
 *   3. 고유가 아닌 첫 카드 강화
 *   4. 덱 > 14면 cd_basic · cd_coaching 삭제
 */
export function recommendConsult(state, data) {
  const v = LR.getConsultView(state, data);
  const skills = v.skills
    .filter((s) => s.affordable && s.eligiblePlayers.length)
    .sort((a, b) => b.level - a.level);
  if (skills.length) return { op: "skill", skillId: skills[0].skillId, playerId: skills[0].eligiblePlayers[0] };
  if (v.tp >= 30) {
    const buyable = v.stock.map((s, i) => ({ s, i })).filter(({ s }) => s.affordable);
    const pol = buyable.find(({ s }) => s.card.family === state.policy) || buyable.find(({ s }) => s.card.family === "coach");
    if (pol) return { op: "buy", index: pol.i };
  }
  if (v.upgradesLeft > 0 && v.tp >= v.prices.upgrade) {
    const c = v.deck.find((d) => d.canUpgrade && d.family !== "unique");
    if (c) return { op: "upgrade", uid: c.uid };
  }
  if (v.deletesLeft > 0 && v.deck.length > CONSULT_DELETE_ABOVE && v.deck.length - 1 >= v.minDeck && v.tp >= v.prices.delete) {
    for (const id of CONSULT_DELETE_IDS) {
      const c = v.deck.find((d) => d.cardId === id);
      if (c) return { op: "delete", uid: c.uid };
    }
  }
  return { op: "end" };
}

/** 경기 전 준비 추천: 편성을 그대로 둔다 */
export function recommendPrep(_state, _data) {
  return {};
}

// ---------------------------------------------------------------------------
// 한 단계 진행
// ---------------------------------------------------------------------------

/**
 * 감독 AI 로 한 단계 진행한다 (상태를 바꾼다). 유물은 첫 번째, 루트는 (season − 1) % 루트 수 번째.
 * @param {object} state
 * @param {object} data
 * @param {{ playMatch?: (setup: object) => object }} [opts] match phase 에서 playMatch(getMatchSetup 결과) → 경기 결과
 * @returns {{ phase: string, action: object|null }} 무엇을 했는지 (finished 면 action null, 상태 그대로)
 */
export function autoStep(state, data, { playMatch } = {}) {
  const phase = state.phase;
  switch (phase) {
    case "week": {
      const a = recommendWeek(state, data);
      const { reason, ...action } = a;
      LR.applyWeekAction(state, data, action);
      return { phase, action: a };
    }
    case "lesson": {
      const a = recommendCard(state, data);
      if (a.kind === "play") LR.playCard(state, data, { uid: a.uid, taps: a.taps });
      else if (a.kind === "rest") LR.lessonRest(state, data, { playerId: a.playerId });
      else LR.endLessonTurn(state, data);
      return { phase, action: a };
    }
    case "reward": {
      const a = recommendReward(state, data);
      LR.resolveReward(state, data, a);
      return { phase, action: a };
    }
    case "consult": {
      const a = recommendConsult(state, data);
      if (a.op === "end") LR.endConsult(state, data);
      else LR.consultAction(state, data, a);
      return { phase, action: a };
    }
    case "prep": {
      const a = recommendPrep(state, data);
      LR.confirmPrep(state, data, a);
      return { phase, action: a };
    }
    case "match": {
      if (typeof playMatch !== "function") throw new Error("autoStep: match phase 에는 opts.playMatch 가 필요합니다");
      const setup = LR.getMatchSetup(state, data);
      const result = playMatch(setup);
      LR.finishMatch(state, data, result);
      return { phase, action: { kind: setup.kind, result } };
    }
    case "relic": {
      const id = Array.isArray(state.pendingRelicChoices) && state.pendingRelicChoices.length ? state.pendingRelicChoices[0] : null;
      LR.chooseRelic(state, data, id);
      return { phase, action: { relicId: id } };
    }
    case "route": {
      const routes = state.pendingRoutes;
      const id = routes[(state.season - 1) % routes.length];
      LR.chooseRoute(state, data, id);
      return { phase, action: { routeId: id } };
    }
    case "event": {
      LR.resolveEvent(state, data, 0);
      return { phase, action: { choice: 0 } };
    }
    case "finished":
      return { phase, action: null };
    default:
      throw new Error(`autoStep: 알 수 없는 phase '${phase}'`);
  }
}
