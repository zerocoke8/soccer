/**
 * manager.js — 감독 AI (LESSON_PROTO_PLAN §5.5 · 레슨은 구역 방식 §14.14). 순수 · 결정적이고 rng 를 쓰지 않는다.
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
/**
 * 코치가 붙은 카드의 덤 (§15.6 [가정]): 유대 +attach.bond 와 컷인의 값. 비슷한 EV 면 붙은 카드를 낸다.
 * 강화 · attachMult · noFail · underdog 은 previewCard 상승 · 실패율에 이미 들어 있고, 능력 effects 는 buffValue 로 센다.
 */
const ATTACH_BONUS = 6;

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

// ---------------------------------------------------------------------------
// 레슨 카드 고르기 (§14.14)
// ---------------------------------------------------------------------------

/** 체력이 이 값 미만인 경기장 선수는 벤치 후보 (§14.1 BT) */
const BENCH_BELOW = 25;
/** 대상 구역이 자기 포지션 주 스탯이면 1.2, 아니면 0.8 (§14.14 pref) */
const PREF_MAIN = 1.2;
const PREF_OTHER = 0.8;
/**
 * 덜 큰 선수 보너스 ([가정 Q1-b] §14.21): 대상 i 가 **자기 주 스탯 구역**에 서 있으면 상승에
 * ((팀 평균 주 스탯 상승 + EVEN_K0) / (i 의 주 스탯 상승 + EVEN_K0))^EVEN_POW 를 곱한다 (pref 1.2 와 함께).
 * 주 스탯 상승 = 지금 포지션의 주 스탯 2개 − 캐릭터 기본 스탯 (런 시작 값). 런 처음(모두 0)에는 1.
 * EVEN_POW 1.75 · EVEN_K0 50 = 2-2-2 lesson_sim (200런 · 경기 포함) 에서 방침 5개 모두 고르게 크기 (주 스탯 상승 최저 / 최고) ≥ 0.60 이 되는
 * 가장 약한 값 근처 (1.5 면 팀형 0.59, 2 면 0.63~0.66 — 대신 성장 · 부상이 조금씩 나빠진다).
 */
const EVEN_POW = 1.75;
const EVEN_K0 = 50;

/**
 * 카드 효과 · 방침 패시브의 가치 (초안 tools/drafts/lesson_sim.mjs value() 를 문서 상수 data.lesson.buffs 로 옮긴 것).
 * 분위기는 스택 1당 기본 훈련 +moodK × cardGainScale (0.96) × 경기장 인원 × min(남은 턴 + 1, 스택) (§14.14).
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
  const nField = cards.fieldPlayers(state).length;
  const nAct = active.length;
  const lowSt = active.filter((p) => p.stamina < 50).length;
  const moodUnit = BD.moodK * data.lesson.lesson.cardGainScale;
  const { f, T, effects, mods, consumes, zoneOf, healId } = c;
  const tPlayers = T.map((id) => playerById(state, id)).filter(Boolean);
  let val = 0;
  for (const e of effects) {
    const when = e.when || "always";
    const w = when === "success" ? (T.length ? 1 - f : 1) : when === "consume" ? (consumes ? 1 : 0) : 1;
    if (!w) continue;
    let x = 0;
    switch (e.type) {
      case "hojo": x = 0.5 * AVG_GAIN * Math.min(e.n, remaining); break;
      case "focus": x = e.n * BD.focusPer * remaining * 0.9; break;
      case "mood": x = e.n * moodUnit * nField * Math.min(remaining + 1, v("mood") + e.n); break;
      case "moodX2": x = v("mood") * moodUnit * nField * Math.min(remaining + 1, v("mood") * 2); break;
      case "noDecay": x = v("mood") * moodUnit * nField * Math.min(e.turns, remaining) * 0.6; break;
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
        else if (e.to === "target" && healId != null) {
          // 회복 단일: 그 대상이 실제로 회복하는 양 (체력 100 에서 멈춤)
          const hp = playerById(state, healId);
          x = Math.min(e.n, 40, 100 - (hp ? Number(hp.stamina) || 0 : 0)) * 0.6 + lowSt * 4;
        } else if (e.to === "target" || e.to === "mostTired") x = Math.min(e.n, 40) * 0.6 + lowSt * 4;
        else if (e.to === "targets") {
          // 대상 전원 (§15.6): n × (결장 아닌 대상 수) × 0.3 + 2 × (체력 50 미만 대상 수)
          const tin = tPlayers.filter((p) => !cards.isOut(state, p));
          x = e.n * tin.length * 0.3 + 2 * tin.filter((p) => p.stamina < 50).length;
        }
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
      case "hint": x = (e.chance ?? 1) * 25; break;
      case "condition": {
        // 컨디션 (§15.6): (chance ?? 1) × n × (4 × 남은 턴 + 6), 4 (최고) 에서 넘치는 몫은 0
        const room = Math.max(0, 4 - (Number(state.condition) || 0));
        x = (e.chance ?? 1) * Math.min(e.n, room) * (4 * remaining + 6);
        break;
      }
      default: break;
    }
    val += w * x;
  }
  // 방침 패시브 (§14.11) — 쌓는 쪽의 가치
  if (T.length) {
    const allDefenseZone = T.every((id) => lesson.DEFENSE_ZONES.includes(zoneOf[id]));
    const hasPassZone = T.some((id) => zoneOf[id] === "pass");
    if (policy === "counter" && allDefenseZone) {
      val += (1 - f) * Math.min(BD.stealCap - v("steal"), mods.stealBuild ?? 1) * BD.stealPer * 40 * (remaining > 0 ? 0.8 : 0);
    }
    if (policy === "poss" && hasPassZone) {
      val += (1 - f) * Math.min(BD.possCap - v("poss"), 1) * BD.possK * 40 * remaining * 0.7;
    }
  }
  return val;
}

/**
 * 후보 점 1개의 점수 (§14.14 EV). 낼 수 없으면 null.
 *   EV = Σ gain_i × pref_i × (1 − f) − f × (5 + 40) + 버프 가치 − 0.15 × Σ cost − 10 × (체력 40 미만 대상 수)
 *   pref_i = 주 스탯 구역이면 1.2 × even_i (덜 큰 선수 보너스 evenWeights, [가정 Q1-b]), 아니면 0.8
 *   방침별 한 줄: counter 탈취 ≥ 3이면 공격 구역 대상이 있는 카드 +30 · poss 실패 비용 + poss×8 (가드가 없을 때), 패스 구역 대상이 없는 카드 −min(2, poss)×8
 */
function scoreDrop(state, data, hv, def, cand, evenW) {
  const L = state.lesson;
  const pv = lesson.previewCard(state, data, { uid: hv.uid, at: cand.at || undefined, playerId: cand.playerId });
  if (!pv.ok) return null;
  // 붙은 코치의 능력 effects 를 카드 effects 뒤에 (§15.6 — 능력은 카드가 실패해도 발동, when 없음)
  const effects = [...(def.effects || []), ...((pv.attach && pv.attach.effects) || [])];
  const mods = def.mods || {};
  const T = pv.targets.map((t) => t.id);
  const f = pv.failRate || 0;
  const zoneOf = L.zones || {};
  const ps = T.map((id) => playerById(state, id));
  const hasAttackZone = T.some((id) => lesson.ATTACK_ZONES.includes(zoneOf[id]));
  const hasPassZone = T.some((id) => zoneOf[id] === "pass");
  const B = L.buffs;
  const steal = Number(B.steal) || 0;
  const poss = Number(B.poss) || 0;
  const consumes = state.policy === "counter" && hasAttackZone && steal > 0;

  let gain = 0;
  for (const t of pv.targets) {
    const p = playerById(state, t.id);
    gain += t.gain * (cards.mainStatsOf(p.position).includes(t.zone) ? PREF_MAIN * (evenW[t.id] ?? 1) : PREF_OTHER);
  }
  const cost = pv.targets.reduce((a, t) => a + t.cost, 0);
  let failLoss = data.lesson.lesson.failStatLoss + FAIL_EXTRA;
  if (state.policy === "poss" && T.length && !(Number(B.possGuard) > 0)) failLoss += poss * 8;
  let ev = gain * (1 - f) - f * failLoss;
  ev += buffValue(state, data, { f, T, effects, mods, consumes, zoneOf, healId: pv.healId });
  ev -= COST_K * cost;
  ev -= LOW_TARGET_PENALTY * ps.filter((p) => p.stamina < 40).length;
  if (pv.attach) ev += ATTACH_BONUS;
  if (state.policy === "counter" && steal >= 3 && hasAttackZone) ev += 30;
  if (state.policy === "poss" && T.length && !hasPassZone && !mods.possKeep) ev -= Math.min(data.lesson.buffs.possNoPass, poss) * 8;
  return { uid: hv.uid, cardId: hv.cardId, at: cand.at || null, playerId: cand.playerId ?? null, score: Math.round(ev * 100) / 100 };
}

/** 손패 카드 1장의 가장 좋은 후보 점. 회복 단일은 체력이 가장 낮은 선수 (출전 선수 먼저) 1명만 본다. */
function scoreCard(state, data, hv, evenW) {
  const def = lesson.lessonCardDef(state, data, hv.uid);
  let cands = lesson.dropCandidates(state, data, { uid: hv.uid });
  if (hv.heal) {
    const pick = pickTired(state, cands.map((c) => c.playerId));
    cands = cands.filter((c) => c.playerId === pick[0]).map((c) => ({ playerId: c.playerId }));
  }
  let best = null;
  for (const c of cands) {
    const s = scoreDrop(state, data, hv, def, c, evenW);
    if (s && (!best || s.score > best.score)) best = s;
  }
  return best;
}

/** 캐릭터 기본 스탯 (런 시작 값 — run.buildRoster 와 같은 반올림) */
function baseStatOf(data, p, stat) {
  const ch = (data.characters || []).find((c) => c.id === p.charId);
  return Math.round(Number(ch && ch.baseStats && ch.baseStats[stat]) || 0);
}

/** 선수의 런 동안 주 스탯 상승 (지금 포지션의 주 스탯 2개, 0 아래로는 세지 않는다) */
export function mainGrowth(state, data, p) {
  return Math.max(0, cards.mainStatsOf(p.position).reduce((a, s) => a + (Number(p.stats[s]) || 0) - baseStatOf(data, p, s), 0));
}

/**
 * 덜 큰 선수 보너스 배율 { id: w } ([가정 Q1-b]). 팀 평균보다 덜 큰 선수 > 1, 더 큰 선수 < 1.
 * w = ((평균 + EVEN_K0) / (그 선수 + EVEN_K0))^EVEN_POW — 7명 (결장 포함) 평균.
 */
export function evenWeights(state, data) {
  const g = Object.fromEntries(state.players.map((p) => [p.id, mainGrowth(state, data, p)]));
  const ids = Object.keys(g);
  const avg = ids.reduce((a, id) => a + g[id], 0) / Math.max(1, ids.length);
  const out = {};
  for (const id of ids) out[id] = Math.round(Math.pow((avg + EVEN_K0) / (g[id] + EVEN_K0), EVEN_POW) * 1000) / 1000;
  return out;
}

/** 회복 대상: 체력이 가장 낮은 선수 (출전 선수 먼저) */
function pickTired(state, candidates) {
  const list = candidates.map((id) => playerById(state, id)).filter(Boolean);
  const active = list.filter((p) => !cards.isOut(state, p));
  const p = lowestStamina(state, active.length ? active : list);
  return p ? [p.id] : [];
}

function playAction(s) {
  const a = { kind: "play", uid: s.uid, score: s.score };
  if (s.at) a.at = s.at;
  if (s.playerId != null) a.playerId = s.playerId;
  return a;
}

/**
 * 레슨 중 다음 행동 (§14.14). 순수.
 *   1. 벤치 먼저: 그 턴에 카드를 아직 내지 않았고 벤치가 남았고 체력 < 25 인 경기장 선수가 있으면 → 체력 최저 (슬롯 순서) 1명
 *   2. 카드마다 후보 점 (dropCandidates) → previewCard 로 EV
 *   3. 최고 EV ≤ 0 이면 endTurn. 같은 EV 면 손패 순서 → 후보 순서
 * @returns {{ kind: "bench", playerId: string } | { kind: "play", uid: string, at?: {x,y}, playerId?: string, score: number } | { kind: "endTurn" }}
 */
export function recommendCard(state, data) {
  const L = state && state.lesson;
  if (!L || state.phase !== "lesson") throw new Error("레슨 중이 아닙니다");
  if (L.status !== "playing") throw new Error(`레슨이 이미 끝났습니다 (${L.status})`);
  const view = lesson.getLessonView(state, data);
  if (L.playedThisTurn === 0 && view.canBench) {
    const tired = cards.fieldPlayers(state).filter((p) => p.stamina < BENCH_BELOW);
    if (tired.length) return { kind: "bench", playerId: lowestStamina(state, tired).id };
  }
  const scored = [];
  const evenW = evenWeights(state, data);
  for (const hv of view.hand) {
    if (!hv.playable) continue;
    const s = scoreCard(state, data, hv, evenW);
    if (s) scored.push(s);
  }
  // 압박형: 압박 ≥ 2이고 체력 40 미만 출전 선수가 있으면 라인 내리기 우선
  if (state.policy === "press" && (Number(L.buffs.press) || 0) >= 2 && cards.activePlayers(state).some((p) => p.stamina < 40)) {
    const drop = scored.find((s) => s.cardId === "cd_drop_line");
    if (drop) return playAction(drop);
  }
  let best = null;
  for (const s of scored) if (!best || s.score > best.score) best = s;
  if (!best || best.score <= 0) return { kind: "endTurn" };
  return playAction(best);
}

// ---------------------------------------------------------------------------
// 주 고르기 (§5.5 주 고르기)
// ---------------------------------------------------------------------------

function teamTotal(state, stat) {
  return state.players.reduce((a, p) => a + (Number(p.stats[stat]) || 0), 0);
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
 * @returns {{ type: string, zone?: string, playerId?: string, free?: boolean, reason: string }}
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
    const stats = view.lessons.map((l) => l.zone);
    const specials = view.lessons.filter((l) => l.special).map((l) => l.zone);
    if (specials.length) {
      const zone = specials.slice().sort((a, b) => teamTotal(state, a) - teamTotal(state, b) || STATS.indexOf(a) - STATS.indexOf(b))[0];
      return { type: "lesson", zone, reason: "특별 레슨" };
    }
    const cs = counterStat(state);
    if (stats.includes(cs)) return { type: "lesson", zone: cs, reason: "다음 상대 대응 구역" };
    const zone = stats.slice().sort((a, b) => teamTotal(state, a) - teamTotal(state, b) || STATS.indexOf(a) - STATS.indexOf(b))[0];
    return { type: "lesson", zone, reason: "7명 합이 가장 낮은 구역" };
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
      if (a.kind === "play") LR.playCard(state, data, { uid: a.uid, at: a.at, playerId: a.playerId });
      else if (a.kind === "bench") LR.benchPlayer(state, data, { playerId: a.playerId, on: true });
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
