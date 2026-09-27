/**
 * skills.js — 경기 스킬 효과 (ARCHITECTURE.md §4.3, §7.7)
 *
 * - collectMods(team, playerId, ctx): 패시브 스킬 배율 수집 (self/team, when, actions, positions)
 * - applyActive(state, side, playerId, skill, ctx): 액티브/고유 스킬 8종 효과 적용 (텐션 소모 포함)
 *
 * 순수 로직. DOM/Date/Math.random 사용 금지. 난수 필요 없음.
 *
 * ctx 규약 (match.js가 만들어 넘김):
 *   { data, action, phase: "attack"|"defense", lineIndex, chain, possessionsLeft, scoreDiff,
 *     opponentStyle, isGoalMatch, stamina, staminaMax }
 *   - data: 데이터 번들 (data.skills 필요). 계약의 ctx 목록에 없지만 skills.js가 skill을 조회하기 위해 추가.
 *   - scoreDiff: 배율을 수집하는 팀(team) 기준 (우리 득점 − 상대 득점).
 *   - stamina: 듀얼 당사자의 경기 체력. lowStamina 판정은 스킬 소유자 본인의 live 체력을 우선 사용.
 */

export const MOD_KEYS = ["attack", "defense", "staminaCost", "tensionGain", "save", "shootPower", "coverBonus"];

const ACTIVE_EFFECTS = ["boost", "extraLine", "reveal", "steal", "recover", "chainBoost", "shield", "powerShot"];

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

/** 선수의 active/unique 스킬만. */
export function getPlayerActiveSkills(data, player) {
  return getPlayerSkills(data, player).filter(
    (sk) => (sk.kind === "active" || sk.kind === "unique") && sk.active
  );
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
 * @param {object} team  state.home / state.away (TeamSnapshot + live)
 * @param {string} playerId 듀얼 당사자
 * @param {object} ctx
 * @returns {object} mods (곱 배율)
 */
export function collectMods(team, playerId, ctx) {
  const mods = emptyMods();
  if (!team || !Array.isArray(team.players)) return mods;
  if (!ctx || !ctx.data) throw new Error("skills.collectMods: ctx.data 가 필요합니다");
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
      const m = pv.mods || {};
      for (const k of Object.keys(m)) {
        if (!(k in mods)) continue;
        const v = Number(m[k]);
        if (Number.isFinite(v)) mods[k] *= v;
      }
    }
  }
  return mods;
}

/* ------------------------------------------------------------------ */
/* 액티브 / 고유                                                         */
/* ------------------------------------------------------------------ */

/** 이번 듀얼에 적용되는 액티브 효과 누적 객체 (state.duel.effects[side]). */
export function emptyDuelEffects() {
  return {
    attackMult: 1,
    defenseMult: 1,
    shootMult: 1,
    extraStamina: 0,
    extraLine: false,
    reveal: false,
    steal: false,
    usedSkillId: null,
  };
}

function ensureEffects(state, side) {
  if (!state.duel) throw new Error("skills.applyActive: 진행 중인 듀얼이 없습니다");
  if (!state.duel.effects) state.duel.effects = { home: emptyDuelEffects(), away: emptyDuelEffects() };
  if (!state.duel.effects[side]) state.duel.effects[side] = emptyDuelEffects();
  return state.duel.effects[side];
}

/**
 * 스킬 사용 가능 여부 + 이유.
 * @param {object} state MatchState
 * @param {object} data
 * @param {"home"|"away"} side
 * @param {string} playerId
 * @param {object} skill
 * @param {"attack"|"defense"} role 이 선수의 현재 역할
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function checkSkillUsable(state, data, side, playerId, skill, role) {
  if (!skill || !skill.active || !(skill.kind === "active" || skill.kind === "unique")) {
    return { ok: false, reason: "액티브 스킬이 아님" };
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
  const phase = skill.active.phase || "any";
  if (phase !== "any" && phase !== role) {
    return { ok: false, reason: phase === "attack" ? "공격 시에만" : "수비 시에만" };
  }
  const cost = Number(skill.tension) || 0;
  if ((team.tension || 0) < cost) return { ok: false, reason: "텐션 부족" };
  const fx = state.duel && state.duel.effects && state.duel.effects[side];
  if (fx && fx.usedSkillId) return { ok: false, reason: "이번 듀얼에 이미 사용" };
  return { ok: true, reason: null };
}

export function isSkillUsable(state, data, side, playerId, skill, role) {
  return checkSkillUsable(state, data, side, playerId, skill, role).ok;
}

/**
 * 액티브/고유 스킬 사용. 텐션을 소모하고 효과를 적용한다.
 * - boost/extraLine/reveal/steal/shield/powerShot: 이번 듀얼 효과(state.duel.effects[side])에 기록
 * - recover/chainBoost: 즉시 적용
 * - unique 사용 시 events에 type "cutin", active는 type "skill"
 * @param {object} state MatchState
 * @param {"home"|"away"} side
 * @param {string} playerId
 * @param {object} skill skills.json 항목
 * @param {object} ctx { phase, action, lineIndex, data? }
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
  const cost = Number(skill.tension) || 0;
  if ((team.tension || 0) < cost) {
    throw new Error(`skills.applyActive: 텐션 부족 (${team.tension} < ${cost}) ${skill.id}`);
  }
  team.tension = round1(team.tension - cost);

  const fx = ensureEffects(state, side);
  const params = skill.active.params || {};
  const staminaMax = (ctx.staminaMax != null) ? ctx.staminaMax : 100;
  let detail = "";

  switch (effect) {
    case "boost": {
      const a = Number(params.attack);
      const d = Number(params.defense);
      if (Number.isFinite(a)) fx.attackMult *= a;
      if (Number.isFinite(d)) fx.defenseMult *= d;
      detail = Number.isFinite(a) ? `공격 ×${a}` : Number.isFinite(d) ? `수비 ×${d}` : "";
      break;
    }
    case "extraLine":
      fx.extraLine = true;
      detail = "성공 시 한 라인 추가 전진";
      break;
    case "reveal":
      fx.reveal = true;
      detail = "상대 의도 공개";
      break;
    case "steal":
      fx.steal = true;
      detail = "성공 시 역습 라인 +1";
      break;
    case "recover": {
      const amount = Number.isFinite(Number(params.amount)) ? Number(params.amount) : 20;
      if (team.live) {
        for (const pid of Object.keys(team.live)) {
          const lv = team.live[pid];
          lv.stamina = round1(Math.min(staminaMax, Math.max(0, (lv.stamina || 0) + amount)));
        }
      }
      detail = `팀 전원 체력 +${amount}`;
      break;
    }
    case "chainBoost": {
      const amount = Number.isFinite(Number(params.amount)) ? Number(params.amount) : 1;
      if (state.ball) state.ball.chain = (state.ball.chain || 0) + amount;
      detail = `연계 스택 +${amount}`;
      break;
    }
    case "shield": {
      const d = Number.isFinite(Number(params.defense)) ? Number(params.defense) : 1.4;
      fx.defenseMult *= d;
      detail = `수비 ×${d}`;
      break;
    }
    case "powerShot": {
      const s = Number.isFinite(Number(params.shoot)) ? Number(params.shoot) : 1.5;
      const st = Number.isFinite(Number(params.stamina)) ? Number(params.stamina) : 0;
      fx.shootMult *= s;
      fx.extraStamina += st;
      detail = `슛 위력 ×${s}`;
      break;
    }
    default:
      break;
  }
  fx.usedSkillId = skill.id;

  if (Array.isArray(state.events)) {
    const isUnique = skill.kind === "unique";
    state.events.push({
      possession: state.possession,
      type: isUnique ? "cutin" : "skill",
      side,
      playerId,
      skillId: skill.id,
      effect,
      text: isUnique
        ? `★ ${player.name}, 필살기 [${skill.name}] 발동! ${detail}`.trim()
        : `${player.name}, [${skill.name}] 발동! ${detail}`.trim(),
    });
  }
  return fx;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}
