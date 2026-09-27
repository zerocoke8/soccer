/**
 * ai.js — 전술 AI (ARCHITECTURE.md §7.8)
 *
 * decideAttack(state, data, side)  → { action, skillId|null }
 * decideDefense(state, data, side) → { action, skillId|null }
 *
 * 전술 5항목이 모두 영향을 준다:
 *   attack      : dribble / balanced / pass         → 해당 액션 +0.15
 *   shootTiming : breakAll / midrange               → line 2 중거리 슛 여부 (midrange: 추정 성공률 ≥ 0.35)
 *   defense     : tackle / balanced / intercept / readIntent → 수비 편향, 공개 의도 가중
 *   tension     : save / immediate / clutch         → 액티브 스킬 사용 시점
 *   duelPicker  : best / matchup                    → 수비 선수 선택 (match.js setupDuel 에서 사용)
 *   (kickoffPlayerId: 공격 시작 선수 — match.js §7.5)
 *
 * AI는 상대보다 먼저 결정하므로 "공개된 의도"는 상대 AI의 결정을 미리 계산한 예측이다
 * (aiRevealForOpponent 수준으로 열화). reveal 스킬을 쓴 AI는 판정 시점에 실제 선택에 맞춰 카운터한다(match.js).
 *
 * 순수 로직. 난수는 state.rngState 로만.
 */

import { createRngFromState } from "./rng.js";
import {
  computeOdds,
  getAttackActions,
  getDefenseActions,
  revealLevelFor,
  possessionsLeft,
  scoreDiffFor,
  isShotContext,
  findPlayer,
  otherSide,
  COUNTERED,
} from "./match.js";
import { getPlayerActiveSkills, checkSkillUsable } from "./skills.js";

function cfgMatch(data) {
  const m = data && data.config && data.config.match;
  if (!m) throw new Error("ai: data.config.match 가 필요합니다");
  return m;
}

function isLowStamina(m, team, playerId) {
  const lv = team.live && team.live[playerId];
  if (!lv) return false;
  return lv.stamina <= (m.staminaMax || 100) * (m.lowStaminaThreshold || 0.2);
}

function argmax(keys, scores) {
  let best = null;
  let bs = -Infinity;
  for (const k of keys) {
    const s = scores[k];
    if (Number.isFinite(s) && s > bs) {
      bs = s;
      best = k;
    }
  }
  return best;
}

function normalize(dist) {
  let total = 0;
  for (const k of Object.keys(dist)) total += Math.max(0, dist[k] || 0);
  if (total <= 0) {
    const keys = Object.keys(dist);
    for (const k of keys) dist[k] = 1 / keys.length;
    return dist;
  }
  for (const k of Object.keys(dist)) dist[k] = Math.max(0, dist[k] || 0) / total;
  return dist;
}

/* ------------------------------------------------------------------ */
/* 의도 예측 (상대 AI를 미리 돌려 본다)                                   */
/* ------------------------------------------------------------------ */

/**
 * side 가 볼 수 있는 수준으로 상대 의도를 예측한다.
 * @param {"attack"|"defense"} oppRole 상대의 역할
 * @returns {{ level: string, candidates: string[] }}
 */
function predictIntent(state, data, side, oppRole) {
  const opp = otherSide(side);
  const level = revealLevelFor(state, data, side);
  if (level === "none") return { level, candidates: [] };
  const duel = state.duel;
  const committed = duel && duel[opp + "Choice"] && duel[opp + "Choice"].action;
  let a;
  if (committed && committed !== "save") {
    // 상대가 이미 커밋한 듀얼: 인간 측 자동 진행은 화면에 보이는 공개 정보를 그대로 쓴다
    if (side === (state.humanSide || "home") && duel.revealToHome) {
      return { level: duel.revealToHome.level, candidates: duel.revealToHome.candidates.slice() };
    }
    a = committed;
  } else {
    const pred =
      oppRole === "defense"
        ? decideDefense(state, data, opp, { noPredict: true })
        : decideAttack(state, data, opp, { noPredict: true });
    a = pred && pred.action;
  }
  if (!a || a === "save") return { level, candidates: [] };
  if (level === "full") return { level, candidates: [a] };
  const rng = createRngFromState(state.rngState);
  const pool = (oppRole === "defense" ? getDefenseActions(state, opp) : getAttackActions(state, opp))
    .filter((x) => x.enabled && x.action !== a)
    .map((x) => x.action);
  const other = rng.pick(pool);
  const candidates = other ? rng.shuffle([a, other]) : [a];
  state.rngState = rng.getState();
  return { level, candidates };
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

/** 효과가 이 상황에서 의미가 있는지 (낭비 방지). */
function effectSensible(sk, role, action, state, side, m) {
  const e = sk.active.effect;
  const p = sk.active.params || {};
  const line = state.ball ? state.ball.lineIndex : 0;
  switch (e) {
    case "powerShot":
      return role === "attack" && action === "shoot";
    case "extraLine":
      return role === "attack" && action !== "shoot";
    case "chainBoost":
      return role === "attack";
    case "boost":
      if (p.attack != null && p.defense == null) return role === "attack";
      if (p.defense != null && p.attack == null) return role === "defense";
      return true;
    case "shield":
      return role === "defense";
    case "steal":
      return role === "defense" && line >= 1 && line <= 2;
    case "recover": {
      // 최소 한 명은 회복량을 온전히 받을 수 있을 때만 (낭비 방지)
      const live = state[side].live || {};
      const ids = Object.keys(live);
      if (!ids.length) return false;
      const amount = Number.isFinite(Number(p.amount)) ? Number(p.amount) : 20;
      const max = m.staminaMax || 100;
      return ids.some((id) => (live[id].stamina || 0) <= max - amount);
    }
    case "reveal":
      return true;
    default:
      return true;
  }
}

/**
 * 이 듀얼에서 쓸 액티브/고유 스킬을 고른다 (없으면 null).
 * active.ai.useWhen / minTension + tactics.tension 규칙.
 * @param {"attack"|"defense"} role
 */
export function chooseSkill(state, data, side, player, role, action) {
  if (!player || player.isYouth) return null;
  const m = cfgMatch(data);
  const team = state[side];
  const tactics = team.tactics || {};
  const line = state.ball ? state.ball.lineIndex : 0;
  const left = possessionsLeft(state);
  const diff = scoreDiffFor(state, side);
  const shot = isShotContext(role, action, line);
  const policy = tactics.tension || "immediate";
  let best = null;
  for (const sk of getPlayerActiveSkills(data, player)) {
    if (!checkSkillUsable(state, data, side, player.id, sk, role).ok) continue;
    const ai = sk.active.ai || {};
    if ((team.tension || 0) < (Number(ai.minTension) || 0)) continue;
    if (!useWhenOk(ai.useWhen, role, action, diff, left)) continue;
    if (!effectSensible(sk, role, action, state, side, m)) continue;
    if (policy === "save" && !(left <= 3 || shot)) continue;
    if (policy === "clutch" && !((diff <= 0 && left <= 3) || shot)) continue;
    if (!best || (Number(sk.tension) || 0) > (Number(best.tension) || 0)) best = sk;
  }
  return best ? best.id : null;
}

/* ------------------------------------------------------------------ */
/* 공격                                                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {object} state MatchState
 * @param {object} data
 * @param {"home"|"away"} side
 * @param {{ noPredict?: boolean }} [opts] 내부용: 상대 의도 예측 생략(재귀 방지)
 * @returns {{ action: string, skillId: string|null }}
 */
export function decideAttack(state, data, side, opts = {}) {
  const m = cfgMatch(data);
  const team = state[side];
  if (!team) throw new Error(`ai.decideAttack: 팀 없음: ${side}`);
  const tactics = team.tactics || {};
  const line = state.ball ? state.ball.lineIndex : 0;
  const carrier = findPlayer(team, state.ball && state.ball.carrierId);
  if (!carrier) throw new Error(`ai.decideAttack: ${side} 팀 공 소유자가 없습니다`);
  let rng = createRngFromState(state.rngState);

  const enabled =
    state.attackingSide === side
      ? getAttackActions(state, side).filter((a) => a.enabled).map((a) => a.action)
      : [];
  if (!enabled.length) {
    state.rngState = rng.getState();
    return { action: line >= 3 ? "shoot" : "dribble", skillId: null };
  }
  const hasDuel = !!(state.duel && state.duel.defenderId);

  let intent = null;
  if (!opts.noPredict && line < 3 && hasDuel) {
    state.rngState = rng.getState();
    intent = predictIntent(state, data, side, "defense");
    rng = createRngFromState(state.rngState);
  }

  // 성공 확률 추정: 공개된 수비 후보(full 1개 / partial 2개)가 있으면 그 후보들에 대한 평균,
  // 없으면 가능한 수비 액션 전체(균등)에 대한 평균 → 수읽기 위험이 자연스럽게 반영된다.
  const est = {};
  if (hasDuel && line < 3) {
    const defPool =
      intent && intent.candidates.length
        ? intent.candidates
        : getDefenseActions(state, otherSide(side)).filter((d) => d.enabled).map((d) => d.action);
    for (const a of enabled) {
      if (!defPool.length) {
        est[a] = computeOdds(state, data, { action: a, defAction: null }).p;
        continue;
      }
      let sum = 0;
      for (const d of defPool) sum += computeOdds(state, data, { action: a, defAction: d }).p;
      est[a] = sum / defPool.length;
    }
  } else {
    for (const a of enabled) est[a] = hasDuel ? computeOdds(state, data, { action: a, defAction: null }).p : 0.5;
  }

  const low = isLowStamina(m, team, carrier.id);
  const scores = {};
  for (const a of enabled) {
    let s = est[a];
    if (tactics.attack === "dribble" && a === "dribble") s += 0.15;
    if (tactics.attack === "pass" && a === "pass") s += 0.15;
    if (low) {
      if (a === "pass") s += 0.2;
      if (a === "dribble") s -= 0.1;
    }
    s += rng.next() * 0.2 - 0.1;
    scores[a] = s;
  }

  let action;
  if (line >= 3) {
    action = "shoot";
  } else if (line === 2) {
    const midrange = tactics.shootTiming === "midrange";
    const nonShoot = enabled.filter((a) => a !== "shoot");
    if (enabled.includes("shoot") && midrange && est.shoot >= 0.35) action = "shoot";
    else action = argmax(nonShoot.length ? nonShoot : enabled, scores);
  } else {
    action = argmax(enabled, scores);
  }
  if (!action) action = enabled[0];

  const skillId = chooseSkill(state, data, side, carrier, "attack", action);
  state.rngState = rng.getState();
  return { action, skillId };
}

/* ------------------------------------------------------------------ */
/* 수비                                                                  */
/* ------------------------------------------------------------------ */

/**
 * @param {object} state MatchState
 * @param {object} data
 * @param {"home"|"away"} side
 * @param {{ noPredict?: boolean }} [opts]
 * @returns {{ action: string, skillId: string|null }}  line 3(GK)에서는 action "save"
 */
export function decideDefense(state, data, side, opts = {}) {
  const m = cfgMatch(data);
  const team = state[side];
  if (!team) throw new Error(`ai.decideDefense: 팀 없음: ${side}`);
  const tactics = team.tactics || {};
  const line = state.ball ? state.ball.lineIndex : 0;
  let rng = createRngFromState(state.rngState);
  const defender = state.duel ? findPlayer(team, state.duel.defenderId) : null;

  if (line >= 3 || !defender || state.attackingSide === side) {
    const skillId = defender && state.attackingSide !== side
      ? chooseSkill(state, data, side, defender, "defense", "save")
      : null;
    state.rngState = rng.getState();
    return { action: "save", skillId };
  }

  const enabled = getDefenseActions(state, side).filter((a) => a.enabled).map((a) => a.action);
  if (!enabled.length) {
    state.rngState = rng.getState();
    return { action: "tackle", skillId: null };
  }

  const atkSide = otherSide(side);
  const atkTeam = state[atkSide];
  const at = atkTeam.tactics || {};
  const carrier = findPlayer(atkTeam, state.ball.carrierId);
  const atkEnabled = getAttackActions(state, atkSide).filter((a) => a.enabled).map((a) => a.action);

  // 상대 전술로 액션 분포 추정 (전술 편향 0.2 가 뒤집을 수 있을 정도로만 기울임)
  let prior = { dribble: 0.45, pass: 0.45, shoot: 0.1 };
  if (at.attack === "dribble") prior = { dribble: 0.55, pass: 0.35, shoot: 0.1 };
  else if (at.attack === "pass") prior = { dribble: 0.35, pass: 0.55, shoot: 0.1 };
  prior.shoot = line === 2 ? (at.shootTiming === "midrange" ? 0.35 : 0.05) : 0;
  if (carrier && isLowStamina(m, atkTeam, carrier.id)) {
    prior.pass += 0.2;
    prior.dribble = Math.max(0.05, prior.dribble - 0.2);
  }
  for (const a of Object.keys(prior)) if (!atkEnabled.includes(a)) prior[a] = 0;
  normalize(prior);

  // 공개된(예측된) 의도
  let intent = null;
  if (!opts.noPredict) {
    state.rngState = rng.getState();
    intent = predictIntent(state, data, side, "attack");
    rng = createRngFromState(state.rngState);
  }
  if (intent && intent.candidates.length) {
    const onehot = { dribble: 0, pass: 0, shoot: 0 };
    for (const c of intent.candidates) if (c in onehot) onehot[c] = 1 / intent.candidates.length;
    const w =
      tactics.defense === "readIntent"
        ? (intent.level === "full" ? 1.0 : 0.8)
        : (intent.level === "full" ? 0.7 : 0.4);
    for (const a of Object.keys(prior)) prior[a] = prior[a] * (1 - w) + onehot[a] * w;
  }

  const scores = {};
  for (const d of enabled) {
    let s = prior[COUNTERED[d]] || 0;
    if (tactics.defense === "tackle" && d === "tackle") s += 0.2;
    if (tactics.defense === "intercept" && d === "intercept") s += 0.2;
    s += rng.next() * 0.2 - 0.1;
    scores[d] = s;
  }
  const action = argmax(enabled, scores) || enabled[0];
  const skillId = chooseSkill(state, data, side, defender, "defense", action);
  state.rngState = rng.getState();
  return { action, skillId };
}
