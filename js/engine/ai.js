/**
 * ai.js — 전술 AI (ARCHITECTURE.md §7.8, v0.3 §13.3)
 *
 * decideAttack(state, data, side)  → { action, receiverId|null, skillId|null, ultimate: boolean, gaanpa: "ticket"|null, values }
 * decideDefense(state, data, side) → { action, skillId|null, ultimate: boolean, gaanpa: "ticket"|null, values }
 *
 * A안 (GDD 9.9): 자동은 자기 성향값(match.tendencyValues) 1위 액션을 고른다 — 결정적, 상대를 읽지 않는다, 난수 없음.
 *  동률은 config.match.tendency.tieAttack / tieDefense 순서. 받는 선수 = 기본값(match.defaultReceiverId).
 *  의도 예측·공개(predictIntent, aiRevealForOpponent)는 폐지.
 *
 * 전술 5항목:
 *   attack      : dribble / balanced / pass          → 성향값 ×tacticBonus (pass 는 크로스 포함)
 *   shootTiming : breakAll / midrange                → 중거리 성향 0 / ×tacticBonus
 *   defense     : tackle / balanced / intercept / hold → 성향값 ×tacticBonus
 *   tension     : save / immediate / clutch          → 일반 액티브 사용 시점
 *   duelPicker  : best / matchup                     → 수비 선수 선택 (match.js setupDuel)
 *
 * 스킬 (§13.3): 효과 없는 사용 금지(버티기 + 소매치기, 박스에서 간파 등). 간파(스킬·사용권)는 레버리지 비트
 *  (line 2 공격·수비, 또는 동점·열세이고 남은 포제션 ≤ 3)에서만. 필살기는 match.aiWantsUltimate 규칙.
 *
 * 순수 로직. state 를 바꾸지 않고 난수를 쓰지 않는다 (§13.2-9: rng 는 판정 주사위만).
 */

import {
  tendencyValues,
  pickByTendency,
  defaultReceiverId,
  aiWantsUltimate,
  gaanpaStatus,
  possessionsLeft,
  scoreDiffFor,
  isShotContext,
  findPlayer,
  fxOf,
} from "./match.js";
import {
  getPlayerActiveSkills,
  getPlayerUltimate,
  checkSkillUsable,
  isGaanpaSkill,
  skillCost,
  getSkill,
  addSkillFx,
  emptyDuelEffects,
} from "./skills.js";

const TIE_ATTACK = ["dribble", "pass", "cross", "shoot"];
const TIE_DEFENSE = ["hold", "tackle", "intercept"];

function cfgMatch(data) {
  const m = data && data.config && data.config.match;
  if (!m) throw new Error("ai: data.config.match 가 필요합니다");
  return m;
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function tieOrder(m, role) {
  const t = m.tendency || {};
  if (role === "attack") return Array.isArray(t.tieAttack) && t.tieAttack.length ? t.tieAttack : TIE_ATTACK;
  return Array.isArray(t.tieDefense) && t.tieDefense.length ? t.tieDefense : TIE_DEFENSE;
}

/** 레버리지 비트 (§13.3): line 2 공격·수비, 또는 동점·열세이고 남은 포제션 ≤ 3 */
export function isLeverage(state, side) {
  const line = num(state.ball && state.ball.lineIndex, 0);
  return line >= 2 || (scoreDiffFor(state, side) <= 0 && possessionsLeft(state) <= 3);
}

/* ------------------------------------------------------------------ */
/* 스킬 사용 결정                                                         */
/* ------------------------------------------------------------------ */

function useWhenOk(useWhen, role, action, diff, left) {
  const w = useWhen || "anyDuel";
  if (w === "attackDuel") return role === "attack";
  if (w === "defenseDuel") return role === "defense";
  if (w === "beforeShoot") return role === "attack" && action === "shoot";
  if (w === "anyDuel") return true;
  if (w === "whenTrailing") return diff < 0;
  if (w.startsWith("lastPossessions:")) {
    const n = Number(w.slice("lastPossessions:".length));
    return Number.isFinite(n) && left <= n;
  }
  return true;
}

/** 효과가 이 상황에서 의미가 있는지 (낭비 방지, §13.3) */
function effectSensible(sk, role, action, state, side, m) {
  const e = sk.active.effect;
  const p = sk.active.params || {};
  const line = num(state.ball && state.ball.lineIndex, 0);
  switch (e) {
    case "boost": {
      const acts = Array.isArray(p.actions) && p.actions.length ? p.actions : null;
      if (p.attack != null && p.defense == null) return role === "attack" && (!acts || acts.includes(action));
      if (p.defense != null && p.attack == null) return role === "defense";
      return true;
    }
    case "extraLine":
      return role === "attack" && action !== "shoot";
    case "powerShot":
      return role === "attack" && action === "shoot";
    case "readBoost":
      return role === "defense" && line < 3;
    case "negateRead": {
      const acts = Array.isArray(p.actions) && p.actions.length ? p.actions : null;
      return role === "attack" && line < 3 && (!acts || acts.includes(action));
    }
    case "steal":
      // 버티기로 막으면 역습 이점이 없어 소매치기 무의미
      return role === "defense" && line < 3 && action !== "hold";
    case "rally": {
      const live = (state[side] && state[side].live) || {};
      const amount = num(p.stamina, 30);
      const max = num(m.staminaMax, 100);
      const tired = Object.values(live).some((lv) => num(lv.stamina, max) <= max - amount);
      const beaten = role === "defense" && !!(state.ball && state.ball.pending && state.ball.pending.beaten);
      return tired || beaten;
    }
    default:
      return false;
  }
}

/**
 * 이 듀얼에서 쓸 일반 액티브를 고른다 (없으면 null). active.ai.useWhen / minTension + tactics.tension 규칙.
 * @param {"attack"|"defense"} role
 */
export function chooseSkill(state, data, side, player, role, action) {
  if (!player || player.isYouth) return null;
  const m = cfgMatch(data);
  const team = state[side];
  const tactics = team.tactics || {};
  const line = num(state.ball && state.ball.lineIndex, 0);
  const left = possessionsLeft(state);
  const diff = scoreDiffFor(state, side);
  // 슛 상황 = 파이널 서드 이후 공격·수비 (§13.3 기본 레버리지: line 2 공격·수비) 또는 슛
  const shot = isShotContext(role, action, line) || line >= 2;
  const leverage = isLeverage(state, side);
  const policy = tactics.tension || "immediate";
  let best = null;
  let bestCost = -1;
  for (const sk of getPlayerActiveSkills(data, player)) {
    if (!checkSkillUsable(state, data, side, player.id, sk, role).ok) continue;
    const cost = skillCost(team, sk);
    const ai = sk.active.ai || {};
    const base = num(sk.tension, 0);
    const minT = base > 0 ? num(ai.minTension, 0) * (cost / base) : num(ai.minTension, 0);
    if (num(team.tension, 0) < Math.max(cost, minT)) continue;
    if (!useWhenOk(ai.useWhen, role, action, diff, left)) continue;
    if (!effectSensible(sk, role, action, state, side, m)) continue;
    if (isGaanpaSkill(sk) && !leverage) continue;
    if (policy === "save" && !(left <= 3 || shot)) continue;
    if (policy === "clutch" && !((diff <= 0 && left <= 3) || shot)) continue;
    if (cost > bestCost) {
      best = sk;
      bestCost = cost;
    }
  }
  return best ? best.id : null;
}

/** 간파 사용권: 레버리지 비트에서, 상대가 먼저 간파하지 않았으면 */
function wantTicket(state, data, side) {
  if (num(state[side] && state[side].gaanpaTickets, 0) <= 0) return false;
  if (!isLeverage(state, side)) return false;
  return gaanpaStatus(state, data, side, "ticket").usable;
}

function fxWithSkill(state, side, data, skillId) {
  const fx = Object.assign(emptyDuelEffects(), fxOf(state, side));
  if (skillId) addSkillFx(fx, getSkill(data, skillId));
  return fx;
}

/* ------------------------------------------------------------------ */
/* 공격                                                                  */
/* ------------------------------------------------------------------ */

/**
 * @returns {{ action: string, receiverId: string|null, skillId: string|null, ultimate: boolean, gaanpa: "ticket"|null, values: object }}
 */
export function decideAttack(state, data, side) {
  const m = cfgMatch(data);
  const team = state[side];
  if (!team) throw new Error(`ai.decideAttack: 팀 없음: ${side}`);
  const line = num(state.ball && state.ball.lineIndex, 0);
  const carrier = findPlayer(team, state.ball && state.ball.carrierId);
  if (!carrier) throw new Error(`ai.decideAttack: ${side} 팀 공 소유자가 없습니다`);
  const values = tendencyValues(state, data, side, carrier.id);
  const action = line >= 3 ? "shoot" : pickByTendency(values, tieOrder(m, "attack")) || "dribble";
  const skillId = chooseSkill(state, data, side, carrier, "attack", action);
  const fx = skillId ? fxWithSkill(state, side, data, skillId) : null;
  let receiverId = null;
  let ultimate = false;
  if (action === "pass" || action === "cross") {
    // 필살 패스를 쓸 수 있으면: 합체기 가치를 반영한 기본 받는 선수로 AI 규칙(받는 선수가 필살기 보유자 · 박스 도착 · 마지막 2포제션) 판단
    const ult = getPlayerUltimate(data, carrier);
    if (ult && ult.ultimate.type === "pass") {
      const fxU = Object.assign(emptyDuelEffects(), fx || fxOf(state, side), { ult: Object.assign({ skillId: ult.id }, ult.ultimate) });
      const rU = defaultReceiverId(state, data, side, action, fxU);
      if (aiWantsUltimate(state, data, side, carrier, "attack", action, rU, fx)) {
        ultimate = true;
        receiverId = rU;
      }
    }
    if (!ultimate) receiverId = defaultReceiverId(state, data, side, action, fx);
  } else {
    ultimate = aiWantsUltimate(state, data, side, carrier, "attack", action, null, fx);
  }
  const skillIsGaanpa = !!(skillId && isGaanpaSkill(getSkill(data, skillId)));
  const gaanpa = !skillIsGaanpa && wantTicket(state, data, side) ? "ticket" : null;
  return { action, receiverId, skillId, ultimate, gaanpa, values };
}

/* ------------------------------------------------------------------ */
/* 수비                                                                  */
/* ------------------------------------------------------------------ */

/**
 * @returns {{ action: string, skillId: string|null, ultimate: boolean, gaanpa: "ticket"|null, values: object }}
 *   line 3(GK)에서는 action "save" (필살 세이브는 aiWantsUltimate 규칙)
 */
export function decideDefense(state, data, side) {
  const m = cfgMatch(data);
  const team = state[side];
  if (!team) throw new Error(`ai.decideDefense: 팀 없음: ${side}`);
  const line = num(state.ball && state.ball.lineIndex, 0);
  const defender = state.duel ? findPlayer(team, state.duel.defenderId) : null;
  if (!defender || state.attackingSide === side) return { action: "save", skillId: null, ultimate: false, gaanpa: null, values: {} };
  if (line >= 3) {
    const skillId = chooseSkill(state, data, side, defender, "defense", "save");
    const ultimate = aiWantsUltimate(state, data, side, defender, "defense", "save");
    return { action: "save", skillId, ultimate, gaanpa: null, values: {} };
  }
  const values = tendencyValues(state, data, side, defender.id);
  const action = pickByTendency(values, tieOrder(m, "defense")) || "hold";
  const skillId = chooseSkill(state, data, side, defender, "defense", action);
  const ultimate = aiWantsUltimate(state, data, side, defender, "defense", action);
  const skillIsGaanpa = !!(skillId && isGaanpaSkill(getSkill(data, skillId)));
  const gaanpa = !skillIsGaanpa && wantTicket(state, data, side) ? "ticket" : null;
  return { action, skillId, ultimate, gaanpa, values };
}
