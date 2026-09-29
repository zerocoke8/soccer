/**
 * skills.js — 경기 스킬 효과 (ARCHITECTURE.md §4.3, §7.7, v0.3 §13.1·13.2-12·13)
 *
 * - collectMods(team, playerId, ctx): 패시브 스킬 배율 수집 (self/team, when, actions, positions) — v0.2 그대로
 * - 일반 액티브 (kind "active", `active.effect`): boost / extraLine / powerShot / readBoost / negateRead / steal / rally
 *   applyActive(state, side, playerId, skill, ctx) 가 팀 텐션을 쓰고 이번 듀얼 효과(state.duel.effects[side])에 기록한다.
 * - 필살기 (kind "unique", `ultimate` 객체, 텐션 0): 개인 필살 게이지를 쓴다 — 게이지·발동은 match.js 가 관리.
 *   getPlayerUltimate(data, player) 로 조회.
 * - 간파 = readBoost(수비) 또는 행동 제한 없는 negateRead(공격) 일반 액티브 (isGaanpaSkill). 스루 패스처럼 actions 가 있는
 *   negateRead 는 간파가 아니다 (상대 선택을 읽지 않는 패스 스킬).
 * - 2026-09-29 GK 배급: longPassBoost (캐논 킥, phase "distribution") — 듀얼이 아니라 GK 롱패스 배급에서만 쓴다
 *   (isDistributionSkill · checkDistributionSkill). 텐션 소모·이벤트는 match.js 의 배급 판정이 한다 (applyActive 는 듀얼 전용).
 *
 * 순수 로직. DOM/Date/Math.random 사용 금지. 난수 필요 없음.
 *
 * ctx 규약 (collectMods, match.js 가 만들어 넘김):
 *   { data, action, phase: "attack"|"defense", lineIndex, chain, possessionsLeft, scoreDiff,
 *     opponentStyle, isGoalMatch, stamina, staminaMax }
 */

export const MOD_KEYS = ["attack", "defense", "staminaCost", "tensionGain", "save", "shootPower", "coverBonus"];

/**
 * v0.3 일반 액티브 effect 어휘 (§13.1). 이전 reveal / recover / chainBoost / shield 는 폐지.
 * longPassBoost (2026-09-29): GK 롱패스 배급 ×params.longPass, 성공하면 공격 첫 듀얼 +params.nextDuelBonus — 배급 전용
 */
export const ACTIVE_EFFECTS = ["boost", "extraLine", "powerShot", "readBoost", "negateRead", "steal", "rally", "longPassBoost"];
/** 듀얼이 아니라 GK 배급(match phase "distribution")에서 쓰는 effect */
export const DISTRIBUTION_EFFECTS = ["longPassBoost"];
/** 필살기 종류 */
export const ULTIMATE_TYPES = ["shot", "pass", "save"];

/* ------------------------------------------------------------------ */
/* 스킬 조회                                                            */
/* ------------------------------------------------------------------ */

const mapCache = new WeakMap();

/** data.skills → Map(id → skill). data.skills 배열 단위로 캐시. */
export function getSkillMap(data) {
  if (!data || !Array.isArray(data.skills)) {
    throw new Error("skills: data.skills 배열이 필요합니다");
  }
  let map = mapCache.get(data.skills);
  if (!map) {
    map = new Map();
    for (const sk of data.skills) {
      if (sk && sk.id) map.set(sk.id, sk);
    }
    mapCache.set(data.skills, map);
  }
  return map;
}

/** id로 스킬을 찾는다. 없으면 throw. */
export function getSkill(data, skillId) {
  const sk = getSkillMap(data).get(skillId);
  if (!sk) throw new Error(`skills: 스킬 id를 찾을 수 없습니다: ${skillId}`);
  return sk;
}

/** 선수가 가진 스킬 객체 목록. 유스 대체 선수(isYouth)는 스킬 없음. */
export function getPlayerSkills(data, player) {
  if (!player || player.isYouth) return [];
  const ids = Array.isArray(player.skillIds) ? player.skillIds : [];
  return ids.map((id) => getSkill(data, id));
}

/** 일반 액티브 스킬만 (kind "active" + active 정의). 필살기는 getPlayerUltimate. */
export function getPlayerActiveSkills(data, player) {
  return getPlayerSkills(data, player).filter((sk) => sk.kind === "active" && sk.active);
}

/** 필살기 (kind "unique" 이고 ultimate 객체가 있는 첫 스킬) 또는 null */
export function getPlayerUltimate(data, player) {
  return getPlayerSkills(data, player).find((sk) => sk.kind === "unique" && sk.ultimate && typeof sk.ultimate === "object") || null;
}

/** 패스·크로스 negateRead 에 받은 선수 다음 듀얼 보너스(nextDuelBonus)가 붙은 액티브 (스루 패스) — ④ 박스 연결에서도 의미가 있다 */
export function hasLinkBonus(skill) {
  const a = skill && skill.active;
  return !!(a && a.effect === "negateRead" && Number(a.params && a.params.nextDuelBonus) > 0);
}

/** GK 배급 스킬 (캐논 킥 — effect longPassBoost): 듀얼에서는 쓸 수 없고 롱패스 배급에서만 */
export function isDistributionSkill(skill) {
  return !!(skill && skill.active && DISTRIBUTION_EFFECTS.includes(skill.active.effect));
}

/** 간파 스킬: 수비 readBoost, 또는 행동 제한 없는 공격 negateRead (§13.2-8) */
export function isGaanpaSkill(skill) {
  if (!skill || !skill.active) return false;
  const e = skill.active.effect;
  if (e === "readBoost") return true;
  if (e === "negateRead") {
    const acts = skill.active.params && skill.active.params.actions;
    return !(Array.isArray(acts) && acts.length);
  }
  return false;
}

/** 팀 텐션 비용. 간파 비용 반값(gaanpaCostHalf) 반영 */
export function skillCost(team, skill) {
  const base = Number(skill && skill.tension) || 0;
  if (isGaanpaSkill(skill) && hasCostHalf(team)) return round1(base * 0.5);
  return base;
}

function hasCostHalf(team) {
  if (!team) return false;
  if (team.gaanpaCostHalf === true) return true;
  if (typeof team.gaanpaCostHalf === "number" && team.gaanpaCostHalf > 0) return true;
  return !!(team.modifiers && Number(team.modifiers.gaanpaCostHalf) > 0);
}

/* ------------------------------------------------------------------ */
/* 패시브                                                               */
/* ------------------------------------------------------------------ */

/** 모든 배율 1인 mods 객체. */
export function emptyMods() {
  const m = {};
  for (const k of MOD_KEYS) m[k] = 1;
  return m;
}

/**
 * passive.when 조건 판정.
 * @param {string} when
 * @param {object} ctx
 * @param {number} ownerStamina 스킬 소유자의 경기 체력
 * @param {number} staminaMax
 */
export function matchesWhen(when, ctx, ownerStamina, staminaMax) {
  const w = when || "always";
  if (w === "always") return true;
  if (w === "trailing") return (ctx.scoreDiff || 0) < 0;
  if (w === "leading") return (ctx.scoreDiff || 0) > 0;
  if (w === "tied") return (ctx.scoreDiff || 0) === 0;
  if (w === "goalMatch") return !!ctx.isGoalMatch;
  if (w === "lowStamina") {
    const max = staminaMax || 100;
    const st = Number.isFinite(ownerStamina) ? ownerStamina : (Number.isFinite(ctx.stamina) ? ctx.stamina : max);
    return st <= max * 0.2;
  }
  if (w.startsWith("lastPossessions:")) {
    const n = Number(w.slice("lastPossessions:".length));
    return Number.isFinite(n) && Number.isFinite(ctx.possessionsLeft) && ctx.possessionsLeft <= n;
  }
  if (w.startsWith("chain>=")) {
    const n = Number(w.slice("chain>=".length));
    return Number.isFinite(n) && (ctx.chain || 0) >= n;
  }
  if (w.startsWith("vsStyle:")) {
    const style = w.slice("vsStyle:".length);
    return !!ctx.opponentStyle && ctx.opponentStyle === style;
  }
  // element:… 등 정의되지 않은 조건은 미발동
  return false;
}

/**
 * 팀의 패시브 스킬 배율을 수집한다.
 * - target "self": 소유자가 듀얼 당사자(playerId)일 때만
 * - target "team": 팀 전원의 듀얼에 적용 (소유자 본인 포함)
 * - positions: 소유자의 현재 슬롯 포지션 기준
 * - actions: ctx.action 이 목록에 있을 때만
 * @returns {object} mods (곱 배율)
 */
export function collectMods(team, playerId, ctx) {
  const mods = emptyMods();
  if (!ctx || !ctx.data) throw new Error("skills.collectMods: ctx.data 가 필요합니다");
  forEachActivePassive(team, playerId, ctx, (sk) => {
    const m = sk.passive.mods || {};
    for (const k of Object.keys(m)) {
      if (!(k in mods)) continue;
      const v = Number(m[k]);
      if (Number.isFinite(v)) mods[k] *= v;
    }
  });
  return mods;
}

/**
 * collectMods 와 같은 규칙으로 이번 듀얼에 붙는 패시브 스킬 목록 (결정타 칩 이름용 — 표시 전용).
 * @returns {Array<{ skillId: string, name: string, ownerId: string, mods: object }>}
 */
export function collectModSources(team, playerId, ctx) {
  const out = [];
  if (!ctx || !ctx.data) throw new Error("skills.collectModSources: ctx.data 가 필요합니다");
  forEachActivePassive(team, playerId, ctx, (sk, owner) => {
    out.push({ skillId: sk.id, name: sk.name, ownerId: owner.id, mods: Object.assign({}, sk.passive.mods || {}) });
  });
  return out;
}

/** 이번 듀얼(ctx)에 발동하는 패시브 스킬마다 fn(skill, owner) — collectMods · collectModSources 공용 */
function forEachActivePassive(team, playerId, ctx, fn) {
  if (!team || !Array.isArray(team.players)) return;
  const staminaMax = ctx.staminaMax || 100;
  for (const owner of team.players) {
    if (!owner || owner.isYouth) continue;
    const ids = Array.isArray(owner.skillIds) ? owner.skillIds : [];
    for (const sid of ids) {
      const sk = getSkill(ctx.data, sid);
      if (sk.kind !== "passive" || !sk.passive) continue;
      const pv = sk.passive;
      const target = pv.target || "self";
      if (target === "self" && owner.id !== playerId) continue;
      if (Array.isArray(sk.positions) && sk.positions.length && !sk.positions.includes(owner.position)) continue;
      if (Array.isArray(pv.actions) && pv.actions.length && ctx.action && !pv.actions.includes(ctx.action)) continue;
      const ownerLive = team.live && team.live[owner.id];
      const ownerStamina = ownerLive && Number.isFinite(ownerLive.stamina) ? ownerLive.stamina : undefined;
      if (!matchesWhen(pv.when, ctx, ownerStamina, staminaMax)) continue;
      fn(sk, owner);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 이번 듀얼 효과                                                         */
/* ------------------------------------------------------------------ */

/**
 * 이번 듀얼에 적용되는 효과 누적 객체 (state.duel.effects[side]).
 *  attackMult / attackActions : boost 공격 배율과 적용 액션 (null = 전부)
 *  defenseMult, noMissPenalty, noFailPenalty, noStamina : boost 옵션
 *  extraLine                  : 성공 시 한 구역 추가 전진
 *  shootMult / midrangeCoef / extraStamina : powerShot
 *  readMult                   : readBoost (0 = 없음) — 짝 맞힘 배율 대체
 *  negateRead / negateActions : 상대 짝 맞힘 ×1.0 (negateActions null = 전 액션)
 *  nextDuelBonus              : 패스·크로스 성공 시 받은 선수 다음 듀얼 보너스 (스루 패스)
 *  steal                      : { plus, tension, cappedNextBonus } | null
 *  usedSkillId                : 이번 듀얼에 쓴 일반 액티브 (팀당 1개)
 *  gaanpa                     : "skill" | "ticket" | null — 이 팀이 이번 듀얼에 간파를 썼다
 *  ult                        : 필살기 { skillId, type, …params } | null
 *  combo                      : 합체기 { name, passerId, passerSkillId } | null
 */
export function emptyDuelEffects() {
  return {
    attackMult: 1,
    attackActions: null,
    defenseMult: 1,
    noMissPenalty: false,
    noFailPenalty: false,
    noStamina: false,
    extraLine: false,
    shootMult: 1,
    midrangeCoef: null,
    extraStamina: 0,
    readMult: 0,
    negateRead: false,
    negateActions: null,
    nextDuelBonus: 0,
    steal: null,
    usedSkillId: null,
    gaanpa: null,
    ult: null,
    combo: null,
  };
}

/**
 * 스킬 effect 를 효과 객체 fx 에 더한다 (부수 효과 없음 — 텐션·체력·이벤트는 applyActive).
 * 미리보기(getMatchView)와 실제 발동이 같은 함수를 쓴다.
 * @returns {string} 한 줄 설명
 */
export function addSkillFx(fx, skill) {
  if (!skill || !skill.active) throw new Error(`skills.addSkillFx: active 정의가 없는 스킬: ${skill && skill.id}`);
  const effect = skill.active.effect;
  if (!ACTIVE_EFFECTS.includes(effect)) {
    throw new Error(`skills: 알 수 없는 effect "${effect}" (${skill.id})`);
  }
  const p = skill.active.params || {};
  const numOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  switch (effect) {
    case "boost": {
      const parts = [];
      if (p.attack != null) {
        fx.attackMult *= numOr(p.attack, 1);
        if (Array.isArray(p.actions) && p.actions.length) fx.attackActions = p.actions.slice();
        parts.push(`공격 ×${numOr(p.attack, 1)}`);
      }
      if (p.defense != null) {
        fx.defenseMult *= numOr(p.defense, 1);
        parts.push(`수비 ×${numOr(p.defense, 1)}`);
      }
      if (p.noMissPenalty) { fx.noMissPenalty = true; parts.push("빗나감 페널티 없음"); }
      if (p.noFailPenalty) { fx.noFailPenalty = true; parts.push("뚫려도 손해 없음"); }
      if (p.noStamina) { fx.noStamina = true; parts.push("성공 시 체력 소모 없음"); }
      return parts.join(", ");
    }
    case "extraLine":
      fx.extraLine = true;
      return "성공 시 한 구역 추가 전진";
    case "powerShot": {
      const s = numOr(p.shoot, 1.5);
      fx.shootMult *= s;
      if (p.midrangeCoef != null) fx.midrangeCoef = numOr(p.midrangeCoef, null);
      fx.extraStamina += numOr(p.stamina, 0);
      return `슛 위력 ×${s}${p.midrangeCoef != null ? ` · 중거리 계수 ${numOr(p.midrangeCoef, 1)}` : ""}`;
    }
    case "readBoost": {
      const r = numOr(p.readMult, 2.0);
      fx.readMult = Math.max(fx.readMult || 0, r);
      return `간파 — 짝을 맞히면 ×${r}`;
    }
    case "negateRead": {
      fx.negateRead = true;
      fx.negateActions = Array.isArray(p.actions) && p.actions.length ? p.actions.slice() : null;
      if (p.nextDuelBonus != null) fx.nextDuelBonus = Math.max(fx.nextDuelBonus || 0, numOr(p.nextDuelBonus, 0));
      const who = fx.negateActions ? "이번 패스" : "간파 — 이번 듀얼";
      return `${who} 상대 짝 맞힘 무효${p.nextDuelBonus ? ` · 받은 선수 다음 듀얼 +${Math.round(numOr(p.nextDuelBonus, 0) * 100)}%` : ""}`;
    }
    case "steal":
      fx.steal = { plus: numOr(p.plus, 1), tension: numOr(p.tension, 0), cappedNextBonus: numOr(p.cappedNextBonus, 0) };
      return `막으면 역습 +${numOr(p.plus, 1)}`;
    case "rally":
      return `전원 체력 +${numOr(p.stamina, 30)}${p.clearBeaten ? ", 제쳐짐 해제" : ""}${p.teamMult ? `, 이번 포제션 팀 판정 ×${numOr(p.teamMult, 1)}` : ""}`;
    case "longPassBoost": {
      // GK 배급 전용 (match.js 배급 판정이 읽는다 — 듀얼 효과 객체에는 쓰이지 않음)
      const lp = numOr(p.longPass, 1.5);
      fx.longPassMult = numOr(fx.longPassMult, 1) * lp;
      fx.longPassNextBonus = Math.max(numOr(fx.longPassNextBonus, 0), numOr(p.nextDuelBonus, 0));
      return `롱패스 ×${lp}${p.nextDuelBonus ? ` · 성공하면 첫 듀얼 +${Math.round(numOr(p.nextDuelBonus, 0) * 100)}%` : ""}`;
    }
    default:
      return "";
  }
}

function ensureEffects(state, side) {
  if (!state.duel) throw new Error("skills.applyActive: 진행 중인 듀얼이 없습니다");
  if (!state.duel.effects) state.duel.effects = { home: emptyDuelEffects(), away: emptyDuelEffects() };
  if (!state.duel.effects[side]) state.duel.effects[side] = emptyDuelEffects();
  return state.duel.effects[side];
}

/**
 * 일반 액티브 사용 가능 여부 + 이유.
 * @param {"attack"|"defense"} role 이 선수의 현재 역할
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function checkSkillUsable(state, data, side, playerId, skill, role) {
  if (!skill || !skill.active || skill.kind !== "active") {
    return { ok: false, reason: skill && skill.ultimate ? "필살기는 게이지로 사용" : "액티브 스킬이 아님" };
  }
  const team = state[side];
  if (!team) return { ok: false, reason: "팀 없음" };
  const player = (team.players || []).find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "선수 없음" };
  if (player.isYouth) return { ok: false, reason: "유스 선수는 스킬 없음" };
  if (!Array.isArray(player.skillIds) || !player.skillIds.includes(skill.id)) {
    return { ok: false, reason: "보유하지 않은 스킬" };
  }
  if (Array.isArray(skill.positions) && skill.positions.length && !skill.positions.includes(player.position)) {
    return { ok: false, reason: "포지션 조건 불충족" };
  }
  // GK 배급 스킬(캐논 킥)은 듀얼에서 쓰지 않는다 — 배급 결정은 checkDistributionSkill
  if (isDistributionSkill(skill)) return { ok: false, reason: "GK 롱패스 배급에서만" };
  const phase = skill.active.phase || "any";
  if (phase !== "any" && phase !== role) {
    return { ok: false, reason: phase === "attack" ? "공격 시에만" : "수비 시에만" };
  }
  const duel = state.duel;
  const fx = duel && duel.effects && duel.effects[side];
  const line = state.ball ? Number(state.ball.lineIndex) || 0 : 0;
  // 박스(④, GK 1:1 · 박스 연결)에서 의미 없는 효과: 추가 전진(extraLine), 짝 없는 GK 상대 짝 무효(negateRead).
  // 단 받은 선수 보너스(nextDuelBonus)가 붙은 negateRead(스루 패스)는 박스 연결에서 그 보너스가 받은 선수의 원터치 슛·헤더에 붙는다
  // (필살 패스 바람의 실과 같은 규칙) → 연결이 남아 있으면 쓸 수 있다.
  if (line >= 3 && !isGaanpaSkill(skill)) {
    const e = skill.active.effect;
    if (e === "extraLine" || (e === "negateRead" && !hasLinkBonus(skill))) return { ok: false, reason: "박스에서는 효과 없음" };
    if (hasLinkBonus(skill) && state.ball && state.ball.boxLinkUsed) return { ok: false, reason: "박스 연결은 포제션당 1회" };
  }
  if (isGaanpaSkill(skill)) {
    if (line >= 3) return { ok: false, reason: "박스에서는 간파 불가" };
    const opp = side === "home" ? "away" : "home";
    if (duel && duel.gaanpaSide === opp) return { ok: false, reason: "상대가 먼저 간파" };
    if (fx && fx.gaanpa) return { ok: false, reason: "이번 듀얼에 이미 간파" };
  }
  if (fx && fx.usedSkillId) return { ok: false, reason: "이번 듀얼에 이미 사용" };
  const cost = skillCost(team, skill);
  if ((team.tension || 0) < cost) return { ok: false, reason: "텐션 부족" };
  return { ok: true, reason: null };
}

export function isSkillUsable(state, data, side, playerId, skill, role) {
  return checkSkillUsable(state, data, side, playerId, skill, role).ok;
}

/**
 * GK 배급 스킬(longPassBoost) 사용 가능 여부 — match phase "distribution" 에서 배급하는 GK 만, 롱패스와 함께.
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function checkDistributionSkill(state, data, side, playerId, skill) {
  if (!isDistributionSkill(skill) || skill.kind !== "active") return { ok: false, reason: "배급 스킬이 아님" };
  const team = state && state[side];
  if (!team) return { ok: false, reason: "팀 없음" };
  const player = (team.players || []).find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "선수 없음" };
  if (player.isYouth) return { ok: false, reason: "유스 선수는 스킬 없음" };
  if (!Array.isArray(player.skillIds) || !player.skillIds.includes(skill.id)) return { ok: false, reason: "보유하지 않은 스킬" };
  if (Array.isArray(skill.positions) && skill.positions.length && !skill.positions.includes(player.position)) {
    return { ok: false, reason: "포지션 조건 불충족" };
  }
  const d = state.distribution;
  if (state.phase !== "distribution" || !d || d.side !== side || d.gkId !== playerId) return { ok: false, reason: "GK 롱패스 배급에서만" };
  const cost = skillCost(team, skill);
  if ((team.tension || 0) < cost) return { ok: false, reason: "텐션 부족" };
  return { ok: true, reason: null };
}

/**
 * 일반 액티브 사용. 팀 텐션을 쓰고 이번 듀얼 효과에 기록한다.
 * rally 는 즉시: 전원 체력 +stamina, clearBeaten 이면 제쳐짐 해제(state.ball.pending.beaten, 커버 복구),
 * 이번 포제션 팀 판정 ×teamMult (state.possessionFx[side].teamMult).
 * 간파 스킬이면 duel.gaanpaSide 를 기록한다 (먼저 쓴 쪽만 효과 — 확인은 checkSkillUsable).
 * 이벤트 type "skill" (seq 포함).
 * @param {object} ctx { staminaMax? }
 * @returns {object} 이번 듀얼 효과 객체
 */
export function applyActive(state, side, playerId, skill, ctx = {}) {
  if (!skill || !skill.active) throw new Error(`skills.applyActive: active 정의가 없는 스킬: ${skill && skill.id}`);
  const effect = skill.active.effect;
  if (!ACTIVE_EFFECTS.includes(effect)) {
    throw new Error(`skills.applyActive: 알 수 없는 effect "${effect}" (${skill.id})`);
  }
  const team = state[side];
  if (!team) throw new Error(`skills.applyActive: 팀 없음: ${side}`);
  const player = (team.players || []).find((p) => p.id === playerId);
  if (!player) throw new Error(`skills.applyActive: 선수 없음: ${playerId}`);
  const cost = skillCost(team, skill);
  if ((team.tension || 0) < cost) {
    throw new Error(`skills.applyActive: 텐션 부족 (${team.tension} < ${cost}) ${skill.id}`);
  }
  team.tension = round1(team.tension - cost);

  const fx = ensureEffects(state, side);
  const detail = addSkillFx(fx, skill);
  fx.usedSkillId = skill.id;
  if (isGaanpaSkill(skill)) {
    fx.gaanpa = "skill";
    if (state.duel && !state.duel.gaanpaSide) state.duel.gaanpaSide = side;
  }

  if (effect === "rally") {
    const p = skill.active.params || {};
    const staminaMax = ctx.staminaMax != null ? ctx.staminaMax : 100;
    const amount = Number.isFinite(Number(p.stamina)) ? Number(p.stamina) : 30;
    if (team.live) {
      for (const pid of Object.keys(team.live)) {
        const lv = team.live[pid];
        lv.stamina = round1(Math.min(staminaMax, Math.max(0, (lv.stamina || 0) + amount)));
      }
    }
    if (p.clearBeaten && state.ball && state.ball.pending && state.attackingSide !== side && state.ball.pending.beaten) {
      state.ball.pending.beaten = false;
      if (state.duel && Number.isFinite(state.duel.baseCover)) state.duel.coverCount = state.duel.baseCover;
    }
    const tm = Number.isFinite(Number(p.teamMult)) ? Number(p.teamMult) : 1;
    if (!state.possessionFx) state.possessionFx = { home: { teamMult: 1 }, away: { teamMult: 1 } };
    if (!state.possessionFx[side]) state.possessionFx[side] = { teamMult: 1 };
    state.possessionFx[side].teamMult = Math.max(Number(state.possessionFx[side].teamMult) || 1, tm);
  }

  if (Array.isArray(state.events)) {
    state.events.push({
      possession: state.possession,
      seq: state.events.length,
      type: "skill",
      side,
      playerId,
      skillId: skill.id,
      effect,
      gaanpa: isGaanpaSkill(skill),
      cost,
      text: `${player.name}, [${skill.name}] 발동! ${detail}`.trim(),
    });
  }
  return fx;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}
