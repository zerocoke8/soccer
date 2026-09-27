/**
 * effects.js — 이벤트·루트·유물 효과 적용 (ARCHITECTURE §4.4 효과 타입 13종).
 *
 * applyEffects(state, data, effects, ctx) 는 진입 시 state.rngState 로 rng 를 만들고 종료 시 저장한다.
 * 알 수 없는 type 이면 throw.
 */
import { createRngFromState } from "./rng.js";
import { STATS, clamp, mainStatOf, indexById, getModifier, MAX_HINT_LEVEL } from "./training.js";

/**
 * @typedef {Object} EffectCtx
 * @property {string|null} [playerId]   이벤트의 {player}
 * @property {string|null} [supportId]  이벤트를 일으킨 서포트 (bond target "trigger")
 * @property {string|null} [eventId]
 */

/**
 * @typedef {Object} EffectSummary
 * @property {number} applied  적용된 효과 수 (random 분기 포함)
 * @property {string[]} notes  사람용 짧은 메모 (로그 보조)
 */

/**
 * 효과 목록을 상태에 적용한다. 상태를 반환한다 (in-place).
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {Array<object>} effects
 * @param {EffectCtx} [ctx]
 * @returns {import("./run.js").RunState}
 */
export function applyEffects(state, data, effects, ctx = {}) {
  const rng = createRngFromState(state.rngState);
  applyList(state, data, effects || [], ctx || {}, rng, { applied: 0, notes: [] });
  state.rngState = rng.getState();
  return state;
}

/**
 * applyEffects 와 같지만 요약을 함께 돌려준다.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {Array<object>} effects
 * @param {EffectCtx} [ctx]
 * @returns {EffectSummary}
 */
export function applyEffectsWithSummary(state, data, effects, ctx = {}) {
  const rng = createRngFromState(state.rngState);
  const summary = { applied: 0, notes: [] };
  applyList(state, data, effects || [], ctx || {}, rng, summary);
  state.rngState = rng.getState();
  return summary;
}

/**
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {Array<object>} effects
 * @param {EffectCtx} ctx
 * @param {import("./rng.js").Rng} rng
 * @param {EffectSummary} summary
 */
function applyList(state, data, effects, ctx, rng, summary) {
  if (!Array.isArray(effects)) throw new Error("effects 는 배열이어야 합니다");
  for (const eff of effects) applyOne(state, data, eff, ctx, rng, summary);
}

/**
 * target 문자열 → 대상 선수 배열 (§4.4 target).
 * "player" | "randomPlayer" | "team" | "position:FW" | characterId
 * @param {import("./run.js").RunState} state
 * @param {string|undefined} target
 * @param {EffectCtx} ctx
 * @param {import("./rng.js").Rng} rng
 * @returns {Array<object>}
 */
export function resolveTargets(state, target, ctx, rng) {
  const players = state.players;
  const t = target === undefined || target === null ? "player" : String(target);
  if (t === "player") {
    const p = ctx.playerId ? players.find((x) => x.id === ctx.playerId) : null;
    if (p) return [p];
    const pick = rng.pick(players);
    return pick ? [pick] : [];
  }
  if (t === "randomPlayer") {
    const pick = rng.pick(players);
    return pick ? [pick] : [];
  }
  if (t === "team") return players.slice();
  if (t.startsWith("position:")) {
    const pos = t.slice("position:".length);
    return players.filter((p) => p.position === pos);
  }
  // characterId 또는 playerId
  const byChar = players.filter((p) => p.charId === t);
  if (byChar.length) return byChar;
  const byId = players.filter((p) => p.id === t);
  return byId;
}

/**
 * 미보유 유물 중 count 개를 무작위로 고른다 (부족하면 있는 만큼).
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {import("./rng.js").Rng} rng
 * @param {number} [count=3]
 * @returns {string[]}
 */
export function pickRelicChoices(state, data, rng, count = 3) {
  const owned = new Set(state.relics || []);
  const pool = (data.relics || []).filter((r) => r && !owned.has(r.id)).map((r) => r.id);
  if (pool.length === 0) return [];
  return rng.shuffle(pool).slice(0, Math.max(0, count));
}

/**
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {object} eff
 * @param {EffectCtx} ctx
 * @param {import("./rng.js").Rng} rng
 * @param {EffectSummary} summary
 */
function applyOne(state, data, eff, ctx, rng, summary) {
  if (!eff || typeof eff.type !== "string") throw new Error(`효과에 type 이 없습니다: ${JSON.stringify(eff)}`);
  const cfg = data.config;
  const amount = Number(eff.amount) || 0;

  switch (eff.type) {
    case "stat": {
      const targets = resolveTargets(state, eff.target, ctx, rng);
      for (const p of targets) {
        let stat = eff.stat;
        if (stat === "main" || stat === undefined || stat === null) stat = mainStatOf(p.position);
        else if (stat === "random") stat = rng.pick(STATS);
        if (!STATS.includes(stat)) throw new Error(`stat 효과의 알 수 없는 스탯: '${eff.stat}'`);
        p.stats[stat] = clamp(Math.round(p.stats[stat] + amount), 0, cfg.statCap);
      }
      summary.applied++;
      break;
    }
    case "stamina": {
      const targets = resolveTargets(state, eff.target, ctx, rng);
      for (const p of targets) p.stamina = clamp(Math.round(p.stamina + amount), 0, 100);
      summary.applied++;
      break;
    }
    case "condition": {
      state.condition = clamp(Math.round(state.condition + amount), 0, 4);
      summary.applied++;
      break;
    }
    case "teamwork": {
      state.teamwork = clamp(Math.round(state.teamwork + amount), 0, 100);
      summary.applied++;
      break;
    }
    case "bond": {
      const t = eff.target === undefined || eff.target === null ? "trigger" : String(eff.target);
      const delta = amount + (amount > 0 ? getModifier(state, "bondGain") : 0);
      let targets;
      if (t === "trigger") {
        if (!ctx.supportId) {
          // 트리거 서포트가 없는 이벤트(랜덤 등)에서 "trigger" 는 무시한다
          targets = [];
        } else targets = state.supports.filter((s) => s.id === ctx.supportId);
      } else if (t === "all") targets = state.supports.slice();
      else targets = state.supports.filter((s) => s.id === t);
      for (const s of targets) s.bond = clamp(Math.round(s.bond + delta), 0, 100);
      summary.applied++;
      break;
    }
    case "hint": {
      const skills = indexById(data.skills || [], "skills");
      let skillId = eff.skill;
      if (skillId === "random" || skillId === undefined || skillId === null) {
        const pool = (data.skills || []).filter((s) => s.learnable && (state.hints[s.id] || 0) < MAX_HINT_LEVEL).map((s) => s.id);
        skillId = rng.pick(pool);
        if (!skillId) {
          summary.applied++;
          break;
        }
      } else if (!skills.has(skillId)) {
        throw new Error(`hint 효과의 스킬 '${skillId}' 이 skills.json 에 없습니다`);
      }
      const level = Math.max(1, Math.round(Number(eff.level) || 1));
      state.hints[skillId] = clamp((state.hints[skillId] || 0) + level, 0, MAX_HINT_LEVEL);
      summary.applied++;
      break;
    }
    case "skillPoints": {
      const mult = amount > 0 ? 1 + getModifier(state, "skillPointGain") : 1;
      state.skillPoints = Math.max(0, Math.round(state.skillPoints + amount * mult));
      summary.applied++;
      break;
    }
    case "injury": {
      const turns = Math.max(1, Math.round(Number(eff.turns) || cfg.training.injuryTurns || 1));
      const targets = resolveTargets(state, eff.target, ctx, rng);
      for (const p of targets) p.injuredTurns = Math.max(p.injuredTurns || 0, turns);
      summary.applied++;
      break;
    }
    case "heal": {
      const targets = resolveTargets(state, eff.target, ctx, rng);
      for (const p of targets) p.injuredTurns = 0;
      summary.applied++;
      break;
    }
    case "relic": {
      const count = Math.max(1, Math.round(Number(eff.count) || 3));
      const choices = pickRelicChoices(state, data, rng, count);
      if (choices.length > 0) state.pendingRelicChoices = choices;
      summary.applied++;
      break;
    }
    case "summonTicket": {
      state.summonTickets = Math.max(0, Math.round(state.summonTickets + (amount || 1)));
      summary.applied++;
      break;
    }
    case "modifier": {
      if (typeof eff.key !== "string" || !eff.key) throw new Error("modifier 효과에 key 가 없습니다");
      const duration = eff.duration === "run" ? "run" : "season";
      state.modifiers.push({
        key: eff.key,
        amount: Number(eff.amount) || 0,
        untilSeason: duration === "season" ? state.season : null,
      });
      summary.applied++;
      break;
    }
    case "random": {
      const chance = Number(eff.chance);
      if (!Number.isFinite(chance)) throw new Error("random 효과에 chance 가 없습니다");
      const branch = rng.chance(chance) ? eff.then : eff.else;
      applyList(state, data, Array.isArray(branch) ? branch : [], ctx, rng, summary);
      break;
    }
    default:
      throw new Error(`알 수 없는 효과 type: '${eff.type}'`);
  }
}
