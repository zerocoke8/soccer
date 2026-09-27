/**
 * match.js — 경기 시뮬레이션 (ARCHITECTURE.md §7)
 *
 * API: createMatch, getMatchView, step, simulateAuto, isFinished, getResult
 *
 * 진행 규약:
 *  - createMatch 는 첫 킥오프와 첫 듀얼을 준비해 phase "decision" 상태로 반환한다.
 *  - step 한 번 = 듀얼 한 판정 (또는 승부차기 한 킥). 판정 후 다음 듀얼(필요하면 다음 포제션)을
 *    바로 준비하므로, step 직후 상태는 항상 "decision"(결정 대기) / "penalties" / "finished" 중 하나.
 *  - AI 측(= humanSide 의 반대편)은 듀얼 준비 시 먼저 선택을 커밋한다 (비공개, 텐션 즉시 소모).
 *    인간 측의 결정 필요 여부는 getMatchView().needsDecision 으로 확인.
 *  - decision = { action, skillId? }. action 없이 skillId 만 주면 스킬만 먼저 발동하고
 *    결정 대기를 유지한다 (reveal 스킬로 의도를 본 뒤 액션을 고르는 흐름).
 *
 * 순수 로직. 난수는 state.rngState 로만 (함수 단위로 createRngFromState → getState 저장).
 */

import { createRng, createRngFromState } from "./rng.js";
import { decideAttack, decideDefense } from "./ai.js";
import {
  collectMods,
  applyActive,
  getSkill,
  getPlayerActiveSkills,
  checkSkillUsable,
  emptyDuelEffects,
} from "./skills.js";

/* ------------------------------------------------------------------ */
/* 상수                                                                  */
/* ------------------------------------------------------------------ */

export const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
export const POSITIONS = ["GK", "DF", "MF", "FW"];
/** lineIndex → 그 라인을 지키는 수비 팀 포지션 */
export const POS_BY_LINE = ["FW", "MF", "DF", "GK"];
/** 공격 시작 lineIndex → 시작 선수 포지션 (§7.5) */
export const START_POS_BY_LINE = ["DF", "MF", "FW"];
export const LINE_LABELS = ["FW 라인", "MF 라인", "DF 라인", "골키퍼"];
export const ACTIONS_ATTACK = ["dribble", "pass", "shoot"];
export const ACTIONS_DEFENSE = ["tackle", "intercept", "block"];
/** 수읽기 쌍: 공격 → 그것을 읽는 수비 */
export const COUNTER = { dribble: "tackle", pass: "intercept", shoot: "block" };
/** 수비 → 그것이 읽는 공격 */
export const COUNTERED = { tackle: "dribble", intercept: "pass", block: "shoot" };
export const ACTION_LABEL = {
  dribble: "드리블", pass: "패스", shoot: "슛",
  tackle: "태클", intercept: "인터셉트", block: "블록", save: "세이브",
};
export const REVEAL_LEVELS = ["none", "partial", "full"];
const STYLE_BEATS = { power: "technique", technique: "speed", speed: "power" };
const MAX_AUTO_STEPS = 20000;

/* ------------------------------------------------------------------ */
/* 공용 헬퍼 (ai.js 도 사용)                                              */
/* ------------------------------------------------------------------ */

export function otherSide(side) {
  return side === "home" ? "away" : "home";
}

export function findPlayer(team, id) {
  if (!team || !Array.isArray(team.players) || id == null) return null;
  return team.players.find((p) => p.id === id) || null;
}

/** 현재 포제션을 포함한 남은 포제션 수 */
export function possessionsLeft(state) {
  return Math.max(0, (state.possessionsTotal || 0) - (state.possession || 0) + 1);
}

export function scoreDiffFor(state, side) {
  const s = state.score || {};
  return num(s[side]) - num(s[otherSide(side)]);
}

/** 텐션 정책의 "슛일 때": 공격이면 슛 액션, 수비면 DF 라인 이후 */
export function isShotContext(role, action, lineIndex) {
  return role === "attack" ? action === "shoot" : lineIndex >= 2;
}

function matchCfg(data) {
  const m = data && data.config && data.config.match;
  if (!m) throw new Error("match: data.config.match 가 필요합니다");
  return m;
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function pct(p) {
  return Math.round(p * 100);
}

function stat(player, key) {
  return num(player && player.stats && player.stats[key], 0);
}

function levelIndex(level) {
  const i = REVEAL_LEVELS.indexOf(level);
  return i < 0 ? 0 : i;
}

/** 내 스타일이 상대 스타일에 유리하면 styleAdv, 불리하면 styleDis, 아니면 1 */
function styleMult(mine, theirs, m) {
  if (mine && theirs && STYLE_BEATS[mine] === theirs) return num(m.styleAdv, 1.25);
  if (mine && theirs && STYLE_BEATS[theirs] === mine) return num(m.styleDis, 0.8);
  return 1;
}

/** 공명 보너스 + 유물 modifiers 합 (가산치) */
function bonusOf(team, key) {
  const res = team.resonance && team.resonance.bonus ? num(team.resonance.bonus[key]) : 0;
  const mod = team.modifiers ? num(team.modifiers[key]) : 0;
  return res + mod;
}

function liveStamina(team, pid) {
  const lv = team && team.live && team.live[pid];
  return lv ? num(lv.stamina, 0) : 0;
}

function staminaMultFor(m, stamina) {
  const max = num(m.staminaMax, 100);
  return stamina <= max * num(m.lowStaminaThreshold, 0.2) ? num(m.lowStaminaMult, 0.8) : 1;
}

function bestOf(cands, scoreFn, rng) {
  if (!cands || !cands.length) return null;
  let best = -Infinity;
  let ties = [];
  for (const c of cands) {
    const s = scoreFn(c);
    if (s > best) {
      best = s;
      ties = [c];
    } else if (s === best) {
      ties.push(c);
    }
  }
  if (ties.length === 1 || !rng) return ties[0];
  return rng.pick(ties);
}

function pushEvent(state, ev) {
  state.events.push(Object.assign({ possession: state.possession }, ev));
}

function incr(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

function emptyStats() {
  return { shots: 0, duelsWon: 0, goals: 0, mvpId: null, playerDuelWins: {}, playerGoals: {} };
}

/* ------------------------------------------------------------------ */
/* 생성                                                                  */
/* ------------------------------------------------------------------ */

function initTeam(snapshot, side, m, data) {
  if (!snapshot || !Array.isArray(snapshot.players) || snapshot.players.length === 0) {
    throw new Error(`match: ${side} 팀 스냅샷에 players 가 필요합니다`);
  }
  const team = JSON.parse(JSON.stringify(snapshot));
  team.side = side;
  team.name = team.name || (side === "home" ? "홈 팀" : "원정 팀");
  team.formation = team.formation || "2-2-2";
  team.tactics = team.tactics || {};
  team.teamwork = num(team.teamwork, 0);
  team.conditionMult = num(team.conditionMult, 1) || 1;
  team.intentReveal = team.intentReveal || "none";
  team.resonance = team.resonance || null;
  team.modifiers = Object.assign(
    { shootPower: 0, defense: 0, tensionGain: 0, staminaCost: 0, intentReveal: 0, passAttack: 0 },
    team.modifiers || {}
  );
  team.tension = num(m.tension && m.tension.start, 20);
  team.live = {};
  const seen = new Set();
  for (const p of team.players) {
    if (!p || !p.id) throw new Error(`match: ${side} 팀 선수에 id 가 없습니다`);
    if (seen.has(p.id)) throw new Error(`match: ${side} 팀 선수 id 중복: ${p.id}`);
    seen.add(p.id);
    if (!POSITIONS.includes(p.position)) {
      throw new Error(`match: ${side} 팀 선수 ${p.id} 의 position 이 잘못됨: ${p.position}`);
    }
    p.name = p.name || p.id;
    p.stats = p.stats || {};
    for (const k of STATS) p.stats[k] = num(p.stats[k], 0);
    p.style = p.style || "power";
    p.skillIds = p.isYouth ? [] : Array.isArray(p.skillIds) ? p.skillIds.slice() : [];
    for (const sid of p.skillIds) getSkill(data, sid); // 참조 검증
    team.live[p.id] = { stamina: num(m.staminaMax, 100) };
  }
  return team;
}

/**
 * @param {{ data: object, seed: string|number, home: object, away: object, possessions: number,
 *           kind?: "goal"|"friendly"|"arena", humanSide?: "home"|"away" }} args
 */
export function createMatch({ data, seed, home, away, possessions, kind = "friendly", humanSide = "home" }) {
  const m = matchCfg(data);
  if (seed === undefined || seed === null) throw new Error("match.createMatch: seed 가 필요합니다");
  const total = Number(possessions);
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`match.createMatch: possessions 는 1 이상의 정수여야 합니다 (받은 값: ${possessions})`);
  }
  if (!["goal", "friendly", "arena"].includes(kind)) {
    throw new Error(`match.createMatch: kind 가 잘못됨: ${kind}`);
  }
  if (humanSide !== "home" && humanSide !== "away") throw new Error(`match.createMatch: humanSide 잘못됨: ${humanSide}`);
  const rng = createRng(seed);
  const state = {
    seed,
    rngState: rng.getState(),
    kind,
    possessionsTotal: total,
    possession: 1,
    attackingSide: "home",
    phase: "possessionEnd",
    stage: "regular", // "regular" | "extraTime" | "penalties"
    humanSide,
    home: initTeam(home, "home", m, data),
    away: initTeam(away, "away", m, data),
    ball: { carrierId: null, lineIndex: 0, chain: 0, extraLine: false },
    duel: null,
    score: { home: 0, away: 0 },
    events: [],
    stats: { home: emptyStats(), away: emptyStats() },
    penalties: null,
    finished: false,
    result: null,
  };
  pushEvent(state, {
    type: "info",
    side: null,
    text: `경기 시작 — ${state.home.name} vs ${state.away.name} (${total}포제션)`,
  });
  startPossession(state, data, "home", 0, "kickoff");
  return state;
}

/* ------------------------------------------------------------------ */
/* 포제션 시작 / 듀얼 준비                                                 */
/* ------------------------------------------------------------------ */

function pickStarter(team, lineIndex, rng) {
  const pos = START_POS_BY_LINE[lineIndex] || "FW";
  const t = team.tactics || {};
  if (t.kickoffPlayerId) {
    const k = findPlayer(team, t.kickoffPlayerId);
    if (k && k.position === pos) return k;
  }
  const scoreFn =
    lineIndex === 0
      ? (p) => stat(p, "pass")
      : lineIndex === 1
        ? (p) => stat(p, "dribble") + stat(p, "pass")
        : (p) => stat(p, "shoot");
  let cands = team.players.filter((p) => p.position === pos);
  if (!cands.length) cands = team.players.filter((p) => p.position !== "GK");
  if (!cands.length) cands = team.players.slice();
  return bestOf(cands, scoreFn, rng);
}

/**
 * 패스 수신자: newLine 1 → MF(드리블+패스 최고), 2·3 → FW(슛 최고). carrier 제외. 없으면 null.
 * rng 없으면 동률은 첫 선수 (getMatchView 용, 난수 소비 없음).
 */
function pickReceiver(team, newLine, excludeId, rng) {
  const line = Math.min(3, newLine);
  const pos = line <= 1 ? "MF" : "FW";
  const scoreFn = line <= 1 ? (p) => stat(p, "dribble") + stat(p, "pass") : (p) => stat(p, "shoot");
  const cands = team.players.filter((p) => p.position === pos && p.id !== excludeId);
  if (!cands.length) return null;
  return bestOf(cands, scoreFn, rng);
}

function pickDefender(linePlayers, carrier, tactics, rng) {
  const picker = tactics && tactics.duelPicker;
  if (picker === "matchup" && carrier) {
    const adv = linePlayers.filter((p) => STYLE_BEATS[p.style] === carrier.style);
    if (adv.length) return bestOf(adv, (p) => stat(p, "defense"), rng);
    const neutral = linePlayers.filter((p) => STYLE_BEATS[carrier.style] !== p.style);
    if (neutral.length) return bestOf(neutral, (p) => stat(p, "defense"), rng);
  }
  return bestOf(linePlayers, (p) => stat(p, "defense"), rng);
}

function startPossession(state, data, side, lineIndex, reason) {
  const team = state[side];
  const rng = createRngFromState(state.rngState);
  const carrier = pickStarter(team, lineIndex, rng);
  state.rngState = rng.getState();
  if (!carrier) throw new Error(`match: ${side} 팀에 공격을 시작할 선수가 없습니다`);
  state.attackingSide = side;
  state.ball = { carrierId: carrier.id, lineIndex: clamp(num(lineIndex, 0), 0, 2), chain: 0, extraLine: false };
  const text =
    reason === "kickoff"
      ? `${team.name} 킥오프 — ${carrier.name} 시작`
      : `${team.name} 역습! ${carrier.name}, 상대 ${LINE_LABELS[state.ball.lineIndex]}부터 공격`;
  pushEvent(state, { type: reason === "kickoff" ? "kickoff" : "counter", side, playerId: carrier.id, text });
  setupDuel(state, data);
}

function setupDuel(state, data) {
  const atk = state.attackingSide;
  const def = otherSide(atk);
  const line = state.ball.lineIndex;
  const defTeam = state[def];
  const carrier = findPlayer(state[atk], state.ball.carrierId);
  const rng = createRngFromState(state.rngState);
  let defender;
  let cover = 0;
  if (line >= 3) {
    defender =
      defTeam.players.find((p) => p.position === "GK") ||
      bestOf(defTeam.players, (p) => stat(p, "defense"), rng);
  } else {
    let linePlayers = defTeam.players.filter((p) => p.position === POS_BY_LINE[line]);
    if (!linePlayers.length) linePlayers = defTeam.players.filter((p) => p.position !== "GK");
    if (!linePlayers.length) linePlayers = defTeam.players.slice();
    defender = pickDefender(linePlayers, carrier, defTeam.tactics, rng);
    cover = Math.max(0, linePlayers.length - 1);
  }
  state.rngState = rng.getState();
  state.duel = {
    defenderId: defender.id,
    coverCount: cover,
    homeChoice: null,
    awayChoice: null,
    revealToHome: null,
    effects: { home: emptyDuelEffects(), away: emptyDuelEffects() },
  };
  state.phase = "decision";

  const human = state.humanSide || "home";
  const ai = otherSide(human);
  commitAI(state, data, ai); // AI가 먼저 결정 (비공개)
  if (humanNeedsDecision(state, human)) {
    state.duel.revealToHome = computeReveal(state, data, human);
  } else {
    commitAI(state, data, human); // 결정 없는 경우(GK 세이브) 자동
  }
}

/** humanSide 가 이번 듀얼에서 결정해야 하면 "attack"|"defense", 아니면 null */
export function humanNeedsDecision(state, side) {
  if (!state || state.finished || state.phase !== "decision" || !state.duel) return null;
  const choice = state.duel[side + "Choice"];
  if (choice && choice.action) return null;
  if (state.attackingSide === side) return "attack";
  if (state.ball.lineIndex < 3) return "defense";
  return null;
}

/** viewer 가 상대 의도를 보는 수준 ("none"|"partial"|"full") */
export function revealLevelFor(state, data, viewer) {
  const m = matchCfg(data);
  const opp = state[otherSide(viewer)];
  const me = state[viewer];
  let lv = levelIndex(opp.intentReveal) + Math.round(num(me.modifiers && me.modifiers.intentReveal));
  if (viewer !== (state.humanSide || "home")) {
    lv = Math.max(lv, levelIndex(m.aiRevealForOpponent || "none"));
  }
  return REVEAL_LEVELS[clamp(lv, 0, REVEAL_LEVELS.length - 1)];
}

/**
 * 상대(AI)가 이번 듀얼에 reveal 스킬을 커밋했으면, 커밋된 액션은 판정 시 viewer 의 실제 선택에 맞춰 카운터로 바뀐다
 * (resolveDuel). 그 액션을 "공개 정보"로 보여 주면 항상 틀리므로 공개 대신 countered 로 표시한다.
 */
function isCountered(state, viewer) {
  const opp = otherSide(viewer);
  const fx = state.duel && state.duel.effects && state.duel.effects[opp];
  const choice = state.duel && state.duel[opp + "Choice"];
  return !!(fx && fx.reveal && choice && choice.byAI);
}

function counteredIntent() {
  return { level: "none", candidates: [], countered: true };
}

function computeReveal(state, data, viewer) {
  const opp = otherSide(viewer);
  const choice = state.duel[opp + "Choice"];
  if (!choice || !choice.action || choice.action === "save") return null;
  if (isCountered(state, viewer)) return counteredIntent();
  const level = revealLevelFor(state, data, viewer);
  if (level === "none") return { level, candidates: [] };
  if (level === "full") return { level, candidates: [choice.action] };
  const rng = createRngFromState(state.rngState);
  const pool = (state.attackingSide === opp ? getAttackActions(state, opp) : getDefenseActions(state, opp))
    .filter((a) => a.enabled && a.action !== choice.action)
    .map((a) => a.action);
  const other = rng.pick(pool);
  const candidates = other ? rng.shuffle([choice.action, other]) : [choice.action];
  state.rngState = rng.getState();
  return { level, candidates };
}

function commitAI(state, data, side) {
  const role = state.attackingSide === side ? "attack" : "defense";
  const choice = role === "attack" ? decideAttack(state, data, side) : decideDefense(state, data, side);
  commitChoice(state, data, side, choice, true);
}

/**
 * 선택 커밋. 액션 검증 + 스킬 사용(applyActive). byAI 는 reveal 카운터 처리용.
 * choice.action 이 null 이면 스킬만 사용하고 결정은 유지.
 */
function commitChoice(state, data, side, choice, byAI) {
  if (!state.duel) throw new Error("match: 진행 중인 듀얼이 없습니다");
  const role = state.attackingSide === side ? "attack" : "defense";
  const line = state.ball.lineIndex;
  const participantId = role === "attack" ? state.ball.carrierId : state.duel.defenderId;
  const participant = findPlayer(state[side], participantId);
  if (!participant) throw new Error(`match: ${side} 팀 듀얼 당사자를 찾을 수 없습니다`);

  let action = choice && choice.action ? choice.action : null;
  if (role === "defense" && line >= 3) {
    action = "save";
  } else if (action) {
    const list = role === "attack" ? getAttackActions(state, side) : getDefenseActions(state, side);
    const ok = list.find((a) => a.action === action && a.enabled);
    if (!ok) throw new Error(`match: 지금 사용할 수 없는 액션입니다: ${action} (${role}, line ${line})`);
  }

  let skillId = choice && choice.skillId ? choice.skillId : null;
  if (skillId) {
    const sk = getSkill(data, skillId);
    const chk = checkSkillUsable(state, data, side, participant.id, sk, role);
    if (!chk.ok) throw new Error(`match: 스킬 ${skillId} 사용 불가 — ${chk.reason}`);
    applyActive(state, side, participant.id, sk, {
      phase: role,
      action,
      lineIndex: line,
      staminaMax: num(matchCfg(data).staminaMax, 100),
    });
  }
  const prev = state.duel[side + "Choice"];
  state.duel[side + "Choice"] = {
    action,
    skillId: skillId || (prev && prev.skillId) || null,
    byAI: !!byAI,
  };
  return state.duel[side + "Choice"];
}

/* ------------------------------------------------------------------ */
/* 액션 목록                                                             */
/* ------------------------------------------------------------------ */

function fmtMult(x) {
  return String(Math.round(num(x, 1) * 100) / 100);
}

/** DF 라인 중거리 슛 힌트. "위력" = actionCoef.midrangeShoot / actionCoef.shoot (GK 앞 슛 대비) — config 에서 계산 */
function midrangeHint(data) {
  const m = data && data.config && data.config.match;
  if (!m || !m.actionCoef) return "위력 감소 · vs 블록에 약함";
  const ratio = num(m.actionCoef.midrangeShoot, 1) / (num(m.actionCoef.shoot, 1) || 1);
  return `위력 ×${fmtMult(ratio)} · vs 블록에 약함`;
}

/** 수읽기 배율 힌트 — config.match.readBonus */
function readHint(data) {
  const m = data && data.config && data.config.match;
  return m ? `수읽기 ×${fmtMult(num(m.readBonus, 1))}` : "수읽기 보너스";
}

/** side(공격 팀)의 현재 라인에서 가능한 공격 액션. data 를 주면 힌트의 배율을 config 에서 계산한다 */
export function getAttackActions(state, side, data = null) {
  const line = state.ball ? state.ball.lineIndex : 0;
  const team = state[side];
  const carrier = findPlayer(team, state.ball && state.ball.carrierId);
  const isAtk = state.attackingSide === side && !!carrier && !state.finished;
  const receiver = isAtk && line < 3 ? pickReceiver(team, line + 1, carrier.id, null) : null;
  const dribbleOn = isAtk && line < 3;
  const passOn = isAtk && line < 3 && !!receiver;
  const shootOn = isAtk && line >= 2;
  return [
    {
      action: "dribble", enabled: dribbleOn, label: "드리블",
      hint: dribbleOn ? "vs 태클에 약함" : line >= 3 ? "슛만 가능" : "불가",
    },
    {
      action: "pass", enabled: passOn, label: "패스",
      hint: passOn
        ? `→ ${receiver.name} · vs 인터셉트에 약함`
        : line >= 3 ? "슛만 가능" : line === 2 ? "같은 라인 FW 동료 없음" : "패스 상대 없음",
    },
    {
      action: "shoot", enabled: shootOn, label: line === 2 ? "중거리 슛" : "슛",
      hint: shootOn ? (line === 2 ? midrangeHint(data) : "GK와 1:1") : "DF 라인까지 전진 필요",
    },
  ];
}

/** side(수비 팀)의 현재 라인에서 가능한 수비 액션. line 3(GK)은 전부 비활성(세이브 자동). data 를 주면 힌트 배율을 config 에서 계산 */
export function getDefenseActions(state, side, data = null) {
  const line = state.ball ? state.ball.lineIndex : 0;
  const isDef = state.attackingSide !== side && !!state.duel && !state.finished;
  const base = isDef && line < 3;
  const read = readHint(data);
  return [
    { action: "tackle", enabled: base, label: "태클", hint: base ? `드리블에 강함 (${read})` : line >= 3 ? "GK 세이브 자동" : "불가" },
    { action: "intercept", enabled: base, label: "인터셉트", hint: base ? `패스에 강함 (${read})` : line >= 3 ? "GK 세이브 자동" : "불가" },
    {
      action: "block", enabled: isDef && line === 2, label: "블록",
      hint: isDef && line === 2 ? "슛에 강함 · (수비+피지컬)/2" : line >= 3 ? "GK 세이브 자동" : "DF 라인에서만",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* 판정 공식 (§7.4)                                                       */
/* ------------------------------------------------------------------ */

/**
 * 현재 듀얼의 공격력/수비력/성공률.
 * @param {{ action: string, defAction?: string|null, useEffects?: boolean }} opts
 *   defAction null = 수비 선택 미지(추정용: 수읽기 없음, 계수 1)
 */
export function computeOdds(state, data, { action, defAction = null, useEffects = true } = {}) {
  const m = matchCfg(data);
  const atkSide = state.attackingSide;
  const defSide = otherSide(atkSide);
  const atkTeam = state[atkSide];
  const defTeam = state[defSide];
  const duel = state.duel || {};
  const carrier = findPlayer(atkTeam, state.ball.carrierId);
  const defender = findPlayer(defTeam, duel.defenderId);
  if (!carrier || !defender) throw new Error("match.computeOdds: 듀얼 당사자가 없습니다");
  if (!ACTIONS_ATTACK.includes(action)) throw new Error(`match.computeOdds: 공격 액션 잘못됨: ${action}`);
  const line = state.ball.lineIndex;
  const isGK = line >= 3;
  const dAction = isGK ? "save" : defAction;
  const fxA = useEffects && duel.effects && duel.effects[atkSide] ? duel.effects[atkSide] : emptyDuelEffects();
  const fxD = useEffects && duel.effects && duel.effects[defSide] ? duel.effects[defSide] : emptyDuelEffects();
  const staminaMax = num(m.staminaMax, 100);
  const base = {
    data,
    lineIndex: line,
    chain: num(state.ball.chain),
    possessionsLeft: possessionsLeft(state),
    isGoalMatch: state.kind === "goal",
    staminaMax,
  };
  const stA = liveStamina(atkTeam, carrier.id);
  const stD = liveStamina(defTeam, defender.id);
  const modsA = collectMods(atkTeam, carrier.id, {
    ...base, action, phase: "attack", scoreDiff: scoreDiffFor(state, atkSide), opponentStyle: defender.style, stamina: stA,
  });
  const modsD = collectMods(defTeam, defender.id, {
    ...base, action: dAction || "defense", phase: "defense", scoreDiff: scoreDiffFor(state, defSide), opponentStyle: carrier.style, stamina: stD,
  });

  // 공격력
  const coefA = action === "shoot" && line === 2 ? num(m.actionCoef.midrangeShoot, 0.7) : num(m.actionCoef[action], 1);
  const styleA = styleMult(carrier.style, defender.style, m);
  const condA = num(atkTeam.conditionMult, 1) || 1;
  const stamA = staminaMultFor(m, stA);
  let skillA = modsA.attack * num(fxA.attackMult, 1);
  if (action === "shoot") {
    skillA *= modsA.shootPower * num(fxA.shootMult, 1) * (state.ball.extraLine ? 1.2 : 1);
  }
  const chainTerm = action === "shoot" ? 1 + num(m.passChainBonus, 0.1) * num(state.ball.chain) : 1;
  const twTerm = action === "pass" ? 1 + num(m.teamworkPassBonusPer100, 0.1) * num(atkTeam.teamwork) / 100 : 1;
  const bonusA = 1 + (action === "shoot" ? bonusOf(atkTeam, "shootPower") : action === "pass" ? bonusOf(atkTeam, "passAttack") : 0);
  const att = stat(carrier, action) * coefA * styleA * condA * stamA * skillA * chainTerm * twTerm * Math.max(0, bonusA);

  // 수비력
  const styleD = styleMult(defender.style, carrier.style, m);
  const condD = num(defTeam.conditionMult, 1) || 1;
  const stamD = staminaMultFor(m, stD);
  let skillD = modsD.defense * num(fxD.defenseMult, 1);
  let statD;
  let coefD;
  let read = false;
  let coverTerm = 1;
  if (isGK) {
    statD = stat(defender, "defense");
    coefD = num(m.actionCoef.save, 1);
    skillD *= modsD.save;
  } else {
    statD = dAction === "block" ? (stat(defender, "defense") + stat(defender, "physical")) / 2 : stat(defender, "defense");
    coefD = dAction ? num(m.actionCoef[dAction], 1) : 1;
    read = !!dAction && COUNTER[action] === dAction;
    coverTerm = 1 + num(m.coverBonusPerExtraDefender, 0.1) * num(duel.coverCount) * modsD.coverBonus;
  }
  const bonusD = Math.max(0, 1 + bonusOf(defTeam, "defense"));
  const def = statD * coefD * styleD * condD * stamD * skillD * coverTerm * (read ? num(m.readBonus, 1.5) : 1) * bonusD;

  const raw = att + def > 0 ? att / (att + def) : 0.5;
  const p = clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
  return { att, def, p, read, modsA, modsD, carrier, defender, atkSide, defSide, action, defAction: dAction, isGK, line };
}

/* ------------------------------------------------------------------ */
/* 체력 / 텐션                                                            */
/* ------------------------------------------------------------------ */

function spendStamina(state, m, side, player, base, mods) {
  const team = state[side];
  const lv = team.live && team.live[player.id];
  if (!lv) return 0;
  const physFactor = clamp(1 - stat(player, "physical") / 2000, 0.25, 1);
  const bonus = Math.max(0, 1 + bonusOf(team, "staminaCost"));
  const cost = Math.max(0, num(base) * physFactor * bonus * (mods ? num(mods.staminaCost, 1) : 1));
  lv.stamina = round1(clamp(lv.stamina - cost, 0, num(m.staminaMax, 100)));
  return cost;
}

function addTension(state, m, side, base, mods) {
  const team = state[side];
  const mult = Math.max(0, 1 + bonusOf(team, "tensionGain")) * (mods ? num(mods.tensionGain, 1) : 1);
  team.tension = round1(clamp(num(team.tension) + num(base) * mult, 0, num(m.tension && m.tension.max, 100)));
}

/* ------------------------------------------------------------------ */
/* 판정 진행                                                             */
/* ------------------------------------------------------------------ */

function resolveDuel(state, data) {
  const m = matchCfg(data);
  const atkSide = state.attackingSide;
  const defSide = otherSide(atkSide);
  const atkTeam = state[atkSide];
  const duel = state.duel;
  const line = state.ball.lineIndex;
  const isGK = line >= 3;
  const atkChoice = duel[atkSide + "Choice"] || {};
  const defChoice = duel[defSide + "Choice"] || {};
  let action = atkChoice.action;
  let defAction = isGK ? "save" : defChoice.action;
  if (!action) throw new Error("match.resolveDuel: 공격 액션이 결정되지 않았습니다");
  if (!isGK && !defAction) throw new Error("match.resolveDuel: 수비 액션이 결정되지 않았습니다");
  const fxA = duel.effects[atkSide];
  const fxD = duel.effects[defSide];

  // reveal 스킬을 쓴 AI는 상대의 실제 선택에 맞춰 카운터
  if (!isGK && fxD.reveal && defChoice.byAI) {
    const c = COUNTER[action];
    if (getDefenseActions(state, defSide).some((a) => a.action === c && a.enabled)) defAction = c;
  }
  if (fxA.reveal && atkChoice.byAI) {
    const opts = getAttackActions(state, atkSide)
      .filter((a) => a.enabled && COUNTER[a.action] !== defAction)
      .map((a) => a.action);
    if (opts.length) {
      let best = null;
      let bp = -1;
      for (const a of opts) {
        const p = computeOdds(state, data, { action: a, defAction }).p;
        if (p > bp) { bp = p; best = a; }
      }
      if (best) action = best;
    }
  }
  duel[atkSide + "Choice"] = Object.assign({}, atkChoice, { action });
  duel[defSide + "Choice"] = Object.assign({}, defChoice, { action: defAction });

  const odds = computeOdds(state, data, { action, defAction });
  const { carrier, defender, p, read, modsA, modsD } = odds;
  const rng = createRngFromState(state.rngState);
  const success = rng.chance(p);

  // 체력 소모
  const baseA = num(m.staminaCost && m.staminaCost[action]) + (action === "shoot" ? num(fxA.extraStamina) : 0);
  spendStamina(state, m, atkSide, carrier, baseA, modsA);
  spendStamina(state, m, defSide, defender, num(m.staminaCost && m.staminaCost.defend), modsD);
  if (action === "shoot") state.stats[atkSide].shots += 1;

  const pc = pct(p);
  const readTag = read ? " [수읽기]" : "";
  const aLabel = action === "shoot" && line === 2 ? "중거리 슛" : ACTION_LABEL[action];
  const dLabel = ACTION_LABEL[defAction] || defAction;
  state.phase = "resolved";

  if (success) {
    state.stats[atkSide].duelsWon += 1;
    incr(state.stats[atkSide].playerDuelWins, carrier.id);
    addTension(state, m, atkSide, num(m.tension && m.tension.duelWin, 10), modsA);

    if (action === "shoot") {
      state.score[atkSide] += 1;
      state.stats[atkSide].goals += 1;
      incr(state.stats[atkSide].playerGoals, carrier.id);
      addTension(state, m, atkSide, num(m.tension && m.tension.goal, 20), modsA);
      pushEvent(state, {
        type: "goal", side: atkSide, success: true, playerId: carrier.id, action, defAction, p,
        text: `${carrier.name}, ${aLabel}… 골!!! (${pc}%)  [${state.home.name} ${state.score.home} : ${state.score.away} ${state.away.name}]`,
      });
      state.rngState = rng.getState();
      endPossession(state, data, defSide, 0, "kickoff");
      return;
    }

    let newLine = line + 1;
    if (fxA.extraLine) {
      if (newLine >= 3) state.ball.extraLine = true; // DF 라인 돌파 후 → 슛 위력 +20%
      else newLine += 1;
    }
    newLine = Math.min(3, newLine);

    if (action === "dribble") {
      state.ball.lineIndex = newLine;
      if (atkTeam.modifiers && num(atkTeam.modifiers.dribbleStaminaRefund) > 0 && rng.chance(num(atkTeam.modifiers.dribbleStaminaRefund))) {
        const lv = atkTeam.live[carrier.id];
        if (lv) lv.stamina = round1(clamp(lv.stamina + 5, 0, num(m.staminaMax, 100)));
      }
      const extra = fxA.extraLine ? (state.ball.extraLine ? " 슛 위력 +20%!" : " 한 라인 추가 전진!") : "";
      pushEvent(state, {
        type: "duel", side: atkSide, success: true, playerId: carrier.id, defenderId: defender.id, action, defAction, p,
        text: `${carrier.name}, 드리블 돌파 성공! ${defender.name}의 ${dLabel} 제침 (${pc}%)${extra}`,
      });
    } else {
      const receiver = pickReceiver(atkTeam, newLine, carrier.id, rng) || carrier;
      state.ball.lineIndex = newLine;
      state.ball.carrierId = receiver.id;
      state.ball.chain = num(state.ball.chain) + 1;
      const extra = fxA.extraLine ? (state.ball.extraLine ? " 슛 위력 +20%!" : " 한 라인 추가 전진!") : "";
      pushEvent(state, {
        type: "duel", side: atkSide, success: true, playerId: carrier.id, receiverId: receiver.id, defenderId: defender.id, action, defAction, p,
        text: `${carrier.name} → ${receiver.name}, 패스 성공! ${defender.name}의 ${dLabel} 통과 (${pc}%) 연계 ${state.ball.chain}${extra}`,
      });
    }
    state.rngState = rng.getState();
    setupDuel(state, data);
    return;
  }

  // 실패 → 턴오버
  state.stats[defSide].duelsWon += 1;
  incr(state.stats[defSide].playerDuelWins, defender.id);
  addTension(state, m, defSide, isGK ? num(m.tension && m.tension.save, 15) : num(m.tension && m.tension.steal, 15), modsD);
  pushEvent(state, {
    type: isGK ? "save" : "turnover", side: atkSide, success: false, playerId: carrier.id, defenderId: defender.id, action, defAction, p,
    text: isGK
      ? `${defender.name}, 세이브! ${carrier.name}의 슛 막아냄 (${pc}%)`
      : `${defender.name}, ${dLabel}!${readTag} ${carrier.name}의 ${aLabel} 차단 (${pc}%)`,
  });
  let startLine = line === 0 ? 2 : line === 1 ? 1 : 0;
  if (fxD.steal) startLine = Math.min(2, startLine + 1);
  state.rngState = rng.getState();
  endPossession(state, data, defSide, startLine, "counter");
}

function endPossession(state, data, nextSide, startLine, reason) {
  state.duel = null;
  state.phase = "possessionEnd";
  state.possession += 1;
  if (state.possession > state.possessionsTotal) {
    if (checkEnd(state, data)) return;
  }
  startPossession(state, data, nextSide, startLine, reason);
}

/** 종료/연장/승부차기 전이. true = 더 진행할 포제션 없음(종료 또는 승부차기) */
function checkEnd(state, data) {
  const m = matchCfg(data);
  const tied = state.score.home === state.score.away;
  if (state.stage === "regular") {
    if (state.kind === "friendly" || !tied) {
      finishMatch(state, data);
      return true;
    }
    const extra = Math.max(1, Math.round(num(m.extraTimePossessions, 2)));
    state.stage = "extraTime";
    state.possessionsTotal += extra;
    pushEvent(state, { type: "extraTime", side: null, text: `동점! 연장전 ${extra}포제션 돌입` });
    return false;
  }
  if (state.stage === "extraTime") {
    if (!tied) {
      finishMatch(state, data);
      return true;
    }
    state.stage = "penalties";
    state.phase = "penalties";
    initPenalties(state);
    pushEvent(state, { type: "penalties", side: null, text: `연장에도 동점! 승부차기 (각 ${Math.max(1, num(m.penaltyShots, 5))}회)` });
    return true;
  }
  finishMatch(state, data);
  return true;
}

/* ------------------------------------------------------------------ */
/* 승부차기                                                              */
/* ------------------------------------------------------------------ */

function initPenalties(state) {
  const order = (side) => {
    const t = state[side];
    const non = t.players.filter((p) => p.position !== "GK").sort((a, b) => stat(b, "shoot") - stat(a, "shoot"));
    const gks = t.players.filter((p) => p.position === "GK");
    return non.concat(gks).map((p) => p.id);
  };
  state.penalties = {
    home: 0,
    away: 0,
    taken: { home: 0, away: 0 },
    order: { home: order("home"), away: order("away") },
    turn: "home",
    suddenDeath: false,
    kicks: [],
  };
}

function penaltyKick(state, data) {
  const m = matchCfg(data);
  const pen = state.penalties;
  if (!pen) {
    initPenalties(state);
    return penaltyKick(state, data);
  }
  const side = pen.turn;
  const opp = otherSide(side);
  const team = state[side];
  const oppTeam = state[opp];
  const order = pen.order[side];
  const shooter = findPlayer(team, order[pen.taken[side] % order.length]);
  const gk = oppTeam.players.find((p) => p.position === "GK") || bestOf(oppTeam.players, (p) => stat(p, "defense"), null);
  if (!shooter || !gk) throw new Error("match.penaltyKick: 키커 또는 골키퍼가 없습니다");
  const staminaMax = num(m.staminaMax, 100);
  const base = { data, lineIndex: 3, chain: 0, possessionsLeft: 0, isGoalMatch: state.kind === "goal", staminaMax };
  const modsA = collectMods(team, shooter.id, {
    ...base, action: "shoot", phase: "attack", scoreDiff: pen[side] - pen[opp], opponentStyle: gk.style, stamina: liveStamina(team, shooter.id),
  });
  const modsD = collectMods(oppTeam, gk.id, {
    ...base, action: "save", phase: "defense", scoreDiff: pen[opp] - pen[side], opponentStyle: shooter.style, stamina: liveStamina(oppTeam, gk.id),
  });
  const att = stat(shooter, "shoot") * num(m.actionCoef.shoot, 1) * styleMult(shooter.style, gk.style, m)
    * (num(team.conditionMult, 1) || 1) * modsA.attack * modsA.shootPower * Math.max(0, 1 + bonusOf(team, "shootPower"));
  const def = stat(gk, "defense") * num(m.actionCoef.save, 1) * styleMult(gk.style, shooter.style, m)
    * (num(oppTeam.conditionMult, 1) || 1) * modsD.defense * modsD.save * Math.max(0, 1 + bonusOf(oppTeam, "defense"));
  const raw = att + def > 0 ? att / (att + def) : 0.5;
  const p = clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
  const rng = createRngFromState(state.rngState);
  const success = rng.chance(p);
  state.rngState = rng.getState();

  pen.taken[side] += 1;
  if (success) pen[side] += 1;
  pen.kicks.push({ side, playerId: shooter.id, success, p });
  state.stats[side].shots += 1;
  pushEvent(state, {
    type: "penalty", side, success, playerId: shooter.id, defenderId: gk.id, p,
    text: `승부차기 ${pen.taken[side]}번 ${shooter.name}: ${success ? "골!" : `${gk.name} 세이브!`} (${pct(p)}%) [${pen.home}-${pen.away}]`,
  });
  pen.turn = opp;

  const N = Math.max(1, Math.round(num(m.penaltyShots, 5)));
  const th = pen.taken.home;
  const ta = pen.taken.away;
  let over = false;
  if (th <= N && ta <= N) {
    const remH = N - th;
    const remA = N - ta;
    if (pen.home + remH < pen.away || pen.away + remA < pen.home) over = true;
    else if (th === N && ta === N && pen.home !== pen.away) over = true;
    if (th === N && ta === N && pen.home === pen.away) pen.suddenDeath = true;
  } else if (th === ta && pen.home !== pen.away) {
    over = true;
  }
  if (over) finishMatch(state, data);
}

/* ------------------------------------------------------------------ */
/* 종료                                                                  */
/* ------------------------------------------------------------------ */

function computeMvp(st) {
  let best = null;
  let bs = -Infinity;
  const ids = new Set([...Object.keys(st.playerDuelWins || {}), ...Object.keys(st.playerGoals || {})]);
  for (const id of ids) {
    const s = num(st.playerGoals && st.playerGoals[id]) * 3 + num(st.playerDuelWins && st.playerDuelWins[id]);
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

function buildResult(state, provisional) {
  const s = state.score;
  let winner = s.home > s.away ? "home" : s.away > s.home ? "away" : "draw";
  let penalties;
  if (state.penalties) {
    penalties = { home: state.penalties.home, away: state.penalties.away };
    if (penalties.home !== penalties.away) winner = penalties.home > penalties.away ? "home" : "away";
  }
  const stats = JSON.parse(JSON.stringify(state.stats));
  for (const side of ["home", "away"]) stats[side].mvpId = computeMvp(stats[side]);
  const result = {
    kind: state.kind,
    home: s.home,
    away: s.away,
    homeGoals: s.home,
    awayGoals: s.away,
    homeName: state.home.name,
    awayName: state.away.name,
    winner,
    stats,
    events: state.events.slice(),
    possessionsPlayed: Math.min(state.possession - 1, state.possessionsTotal),
    stage: state.stage,
    seed: state.seed,
  };
  if (penalties) result.penalties = penalties;
  if (provisional) result.provisional = true;
  return result;
}

function finishMatch(state, data) {
  state.finished = true;
  state.phase = "finished";
  state.duel = null;
  const s = state.score;
  let winnerText = s.home > s.away ? `${state.home.name} 승리` : s.away > s.home ? `${state.away.name} 승리` : "무승부";
  let penText = "";
  if (state.penalties) {
    const pen = state.penalties;
    penText = ` (승부차기 ${pen.home}-${pen.away})`;
    if (pen.home !== pen.away) winnerText = pen.home > pen.away ? `${state.home.name} 승리` : `${state.away.name} 승리`;
  }
  pushEvent(state, {
    type: "end", side: null,
    text: `경기 종료 — ${state.home.name} ${s.home} : ${s.away} ${state.away.name}${penText} · ${winnerText}`,
  });
  state.result = buildResult(state, false);
  for (const side of ["home", "away"]) state.stats[side].mvpId = state.result.stats[side].mvpId;
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                              */
/* ------------------------------------------------------------------ */

/**
 * 한 듀얼(또는 승부차기 한 킥) 진행.
 * @param {object} state
 * @param {object} data
 * @param {{ action?: string, skillId?: string }|null} decision humanSide 가 needsDecision 상태일 때만 사용
 * @param {"home"|"away"} [humanSide] 기본 state.humanSide ("home")
 * @returns {object} state
 */
export function step(state, data, decision = null, humanSide = undefined) {
  if (!state || state.finished) return state;
  matchCfg(data);
  const human = humanSide || state.humanSide || "home";
  state.humanSide = human;

  if (state.phase === "penalties") {
    penaltyKick(state, data);
    return state;
  }
  if (state.phase !== "decision" || !state.duel) {
    // 외부에서 만든/possessionEnd 상태: 듀얼을 준비하고 반환 (UI가 결정 기회를 가짐)
    if (!state.ball || !state.ball.carrierId) {
      startPossession(state, data, state.attackingSide || "home", num(state.ball && state.ball.lineIndex, 0), "kickoff");
    } else {
      setupDuel(state, data);
    }
    return state;
  }

  const need = humanNeedsDecision(state, human);
  if (need) {
    if (decision && (decision.action || decision.skillId)) {
      if (!decision.action) {
        // 스킬만 먼저 사용 → 결정 대기 유지
        commitChoice(state, data, human, { action: null, skillId: decision.skillId }, false);
        if (state.duel.effects[human].reveal && !isCountered(state, human)) {
          const opp = state.duel[otherSide(human) + "Choice"];
          if (opp && opp.action && opp.action !== "save") {
            state.duel.revealToHome = { level: "full", candidates: [opp.action] };
          }
        }
        return state;
      }
      commitChoice(state, data, human, decision, false);
    } else {
      commitAI(state, data, human);
    }
  }
  const ai = otherSide(human);
  const aiChoice = state.duel[ai + "Choice"];
  if (!(aiChoice && aiChoice.action)) commitAI(state, data, ai);
  const hChoice = state.duel[human + "Choice"];
  if (!(hChoice && hChoice.action)) commitAI(state, data, human);

  resolveDuel(state, data);
  return state;
}

export function simulateAuto(state, data) {
  let guard = 0;
  while (state && !state.finished) {
    step(state, data, null);
    if (++guard > MAX_AUTO_STEPS) throw new Error("match.simulateAuto: 진행이 끝나지 않습니다 (무한 루프 방지)");
  }
  return state;
}

export function isFinished(state) {
  return !!(state && state.finished);
}

/**
 * 결과. 종료 전이면 현재 스코어 기준의 임시 결과(provisional: true).
 * home/away 는 득점 수(run.record 와 동일 의미), homeGoals/awayGoals 동일 값, homeName/awayName 팀 이름.
 */
export function getResult(state) {
  if (!state) return null;
  if (state.finished && state.result) return state.result;
  return buildResult(state, true);
}

function playersView(team, state, side, m) {
  const carrierId = state.attackingSide === side && state.ball ? state.ball.carrierId : null;
  const defenderId = state.attackingSide !== side && state.duel ? state.duel.defenderId : null;
  return team.players.map((p) => ({
    id: p.id,
    name: p.name,
    slot: p.slot,
    position: p.position,
    style: p.style,
    element: p.element,
    portraitColor: p.portraitColor,
    isYouth: !!p.isYouth,
    stamina: liveStamina(team, p.id),
    staminaMax: num(m.staminaMax, 100),
    isCarrier: p.id === carrierId,
    isDefender: p.id === defenderId,
  }));
}

/**
 * UI용 뷰 (상태 변경 없음, 난수 소비 없음).
 */
export function getMatchView(state, data, humanSide = undefined) {
  const m = matchCfg(data);
  const human = humanSide || state.humanSide || "home";
  const atk = state.attackingSide;
  const def = otherSide(atk);
  const atkTeam = state[atk];
  const defTeam = state[def];
  const ball = state.ball || {};
  const duel = state.duel;
  const line = num(ball.lineIndex, 0);
  const carrier = ball.carrierId ? findPlayer(atkTeam, ball.carrierId) : null;
  const defender = duel ? findPlayer(defTeam, duel.defenderId) : null;
  const need = humanNeedsDecision(state, human);
  const role = atk === human ? "attack" : "defense";
  const active = !state.finished && state.phase === "decision" && !!duel;
  const staminaMax = num(m.staminaMax, 100);

  let actions = [];
  if (active) {
    actions = (role === "attack" ? getAttackActions(state, human, data) : getDefenseActions(state, human, data))
      .map((a) => Object.assign({}, a, { enabled: a.enabled && !!need }));
  }

  const participant = role === "attack" ? carrier : defender;
  let skills = [];
  if (active && participant) {
    skills = getPlayerActiveSkills(data, participant).map((sk) => {
      const chk = checkSkillUsable(state, data, human, participant.id, sk, role);
      return {
        skillId: sk.id,
        name: sk.name,
        tension: num(sk.tension),
        enabled: !!need && chk.ok,
        reason: need ? chk.reason : "결정 차례가 아님",
        description: sk.description || "",
        kind: sk.kind,
        effect: sk.active.effect,
      };
    });
  }

  let intent = null;
  if (active && line < 3) {
    const oppChoice = duel[otherSide(human) + "Choice"];
    if (oppChoice && oppChoice.action) {
      if (isCountered(state, human)) {
        // 상대 AI 가 reveal 을 썼다: 커밋 액션은 우리 선택에 맞춰 바뀌므로 공개 정보로 쓸 수 없다
        intent = counteredIntent();
      } else if (human === (state.humanSide || "home") && duel.revealToHome) {
        intent = { level: duel.revealToHome.level, candidates: duel.revealToHome.candidates.slice() };
      } else {
        const level = revealLevelFor(state, data, human);
        intent = { level, candidates: level === "none" ? [] : [oppChoice.action] };
      }
      if (!intent.countered && duel.effects && duel.effects[human] && duel.effects[human].reveal) {
        intent = { level: "full", candidates: [oppChoice.action] };
      }
    }
  }

  let lineLabel;
  if (state.phase === "penalties") lineLabel = "승부차기";
  else if (line >= 3) lineLabel = role === "attack" ? "슛 vs 상대 GK" : "상대 슛 vs 우리 GK";
  else lineLabel = `${role === "attack" ? "상대" : "우리"} ${LINE_LABELS[line]} ${role === "attack" ? "돌파" : "수비"}`;

  const pen = state.penalties;
  return {
    score: { home: state.score.home, away: state.score.away },
    possession: Math.min(state.possession, state.possessionsTotal),
    possessionsTotal: state.possessionsTotal,
    attackingSide: atk,
    humanSide: human,
    lineIndex: line,
    lineLabel,
    chain: num(ball.chain),
    extraLine: !!ball.extraLine,
    stage: state.stage,
    kind: state.kind,
    names: { home: state.home.name, away: state.away.name },
    carrier: carrier
      ? { id: carrier.id, name: carrier.name, side: atk, stamina: liveStamina(atkTeam, carrier.id), staminaMax, position: carrier.position, slot: carrier.slot, style: carrier.style, portraitColor: carrier.portraitColor }
      : null,
    defender: defender
      ? { id: defender.id, name: defender.name, side: def, stamina: liveStamina(defTeam, defender.id), staminaMax, coverCount: num(duel.coverCount), position: defender.position, slot: defender.slot, style: defender.style, portraitColor: defender.portraitColor }
      : null,
    needsDecision: need,
    actions,
    skills,
    intent,
    tension: { home: state.home.tension, away: state.away.tension },
    tensionMax: num(m.tension && m.tension.max, 100),
    players: { home: playersView(state.home, state, "home", m), away: playersView(state.away, state, "away", m) },
    recentEvents: state.events.slice(-6),
    phase: state.phase,
    finished: !!state.finished,
    result: state.result,
    penalties: pen ? { home: pen.home, away: pen.away, turn: pen.turn, taken: { home: pen.taken.home, away: pen.taken.away }, suddenDeath: pen.suddenDeath } : null,
  };
}
