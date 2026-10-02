/**
 * training.js — 훈련 칸 배치·훈련 결과·휴식·외출·전술 미팅 (ARCHITECTURE §6.1~6.5).
 * 공통 열거값(§2)과 소형 헬퍼도 여기서 export 한다 (run.js / effects.js 가 import).
 *
 * rng 관례: 난수를 쓰는 함수는 진입 시 state.rngState 에서 rng 를 만들고 종료 직전 저장한다.
 * 호출자는 이 함수를 부르는 동안 자기 rng 를 들고 있지 않아야 한다.
 */
import { createRngFromState } from "./rng.js";

// ---------------------------------------------------------------------------
// §2 공통 열거값
// ---------------------------------------------------------------------------
export const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
export const POSITIONS = ["GK", "DF", "MF", "FW"];
export const SLOT_TYPES = STATS;
export const STYLES = ["power", "speed", "technique"];
export const ELEMENTS = ["fire", "water", "wind", "earth", "lightning"];
export const RACES = ["human", "elf", "dwarf", "beast", "spirit", "giant"];
export const RARITIES = ["R", "SR", "SSR"];
export const APTITUDE = ["A", "B", "C", "-"];
export const FORMATIONS = {
  "2-2-2": { DF: 2, MF: 2, FW: 2 },
  "3-1-2": { DF: 3, MF: 1, FW: 2 },
  "1-3-2": { DF: 1, MF: 3, FW: 2 },
  "2-3-1": { DF: 2, MF: 3, FW: 1 },
};
/** UI 로그용 한국어 스탯 이름 */
export const STAT_LABELS = { shoot: "슈팅", dribble: "드리블", pass: "패스", defense: "수비", physical: "피지컬" };
export const MAX_LEARNED_SKILLS = 3;
export const MAX_HINT_LEVEL = 3;

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 포메이션의 슬롯 id 목록. 예: "2-2-2" → ["GK","DF1","DF2","MF1","MF2","FW1","FW2"]
 * @param {string} formation
 * @returns {string[]}
 */
export function formationSlots(formation) {
  const f = FORMATIONS[formation];
  if (!f) throw new Error(`알 수 없는 포메이션: '${formation}'`);
  const slots = ["GK"];
  for (const pos of ["DF", "MF", "FW"]) {
    for (let i = 1; i <= f[pos]; i++) slots.push(`${pos}${i}`);
  }
  return slots;
}

/**
 * 슬롯 id → 포지션. "DF2" → "DF", "GK" → "GK"
 * @param {string} slotId
 * @returns {string}
 */
export function slotPosition(slotId) {
  const pos = String(slotId).replace(/[0-9]+$/, "");
  if (!POSITIONS.includes(pos)) throw new Error(`알 수 없는 슬롯 id: '${slotId}'`);
  return pos;
}

/**
 * 포지션 주 스탯 (§6.2): GK/DF → defense, MF → pass, FW → shoot
 * @param {string} position
 * @returns {string}
 */
export function mainStatOf(position) {
  switch (position) {
    case "GK":
    case "DF":
      return "defense";
    case "MF":
      return "pass";
    case "FW":
      return "shoot";
    default:
      throw new Error(`알 수 없는 포지션: '${position}'`);
  }
}

/**
 * 배열 → id Map
 * @template T
 * @param {T[]} arr
 * @param {string} [label]
 * @returns {Map<string, T>}
 */
export function indexById(arr, label = "데이터") {
  if (!Array.isArray(arr)) throw new Error(`${label} 배열이 없습니다`);
  const m = new Map();
  for (const item of arr) {
    if (!item || typeof item.id !== "string") throw new Error(`${label} 항목에 id 가 없습니다`);
    m.set(item.id, item);
  }
  return m;
}

/**
 * Map 또는 배열에서 id 로 조회, 없으면 throw.
 * @template T
 * @param {Map<string,T>|T[]} source
 * @param {string} id
 * @param {string} label
 * @returns {T}
 */
export function getById(source, id, label = "항목") {
  const item = source instanceof Map ? source.get(id) : (source || []).find((x) => x && x.id === id);
  if (!item) throw new Error(`${label} '${id}' 을(를) 찾을 수 없습니다`);
  return item;
}

/**
 * 활성 modifier 합 (§6.7). 없으면 0.
 * @param {import("./run.js").RunState} state
 * @param {string} key
 * @returns {number}
 */
export function getModifier(state, key) {
  let sum = 0;
  for (const m of state.modifiers || []) {
    if (m.key !== key) continue;
    if (m.untilSeason !== null && m.untilSeason !== undefined && m.untilSeason < state.season) continue;
    sum += Number(m.amount) || 0;
  }
  return sum;
}

/**
 * 컨디션 단계별 훈련 배율
 * @param {object} config
 * @param {number} condition
 * @returns {number}
 */
export function trainingMult(config, condition) {
  const arr = config.condition.trainingMult;
  return arr[clamp(Math.round(condition), 0, arr.length - 1)];
}

/**
 * failRateByStamina 구간값. [[60,0.02],[40,0.10],[20,0.25],[0,0.45]] → 체력 ≥ 60 이면 0.02 …
 * @param {object} config
 * @param {number} stamina
 * @returns {number}
 */
export function failRateForStamina(config, stamina) {
  const table = config.training.failRateByStamina;
  const sorted = table.slice().sort((a, b) => b[0] - a[0]);
  for (const [threshold, rate] of sorted) {
    if (stamina >= threshold) return rate;
  }
  return sorted[sorted.length - 1][1];
}

/**
 * 스킬 할인가: cost × (1 − 0.1 × hintLevel)
 * @param {number} cost
 * @param {number} hintLevel
 * @returns {number}
 */
export function skillDiscountedCost(cost, hintLevel) {
  return Math.max(0, Math.round(cost * (1 - 0.1 * clamp(hintLevel, 0, MAX_HINT_LEVEL))));
}

/**
 * 선수가 스킬을 배울 수 있는지 (힌트·슬롯·포지션·중복). 가격은 검사하지 않는다.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {string} skillId
 * @param {string} playerId
 * @param {string|null} [positionOverride] 미팅에서 포지션이 바뀌는 경우 새 포지션
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function canLearnSkill(state, data, skillId, playerId, positionOverride = null) {
  const skills = indexById(data.skills, "skills");
  const skill = skills.get(skillId);
  if (!skill) return { ok: false, reason: `스킬 '${skillId}' 없음` };
  if (!skill.learnable) return { ok: false, reason: "학습 불가 스킬" };
  if (!(state.hints && state.hints[skillId] > 0)) return { ok: false, reason: "힌트 없음" };
  const player = (state.players || []).find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: `선수 '${playerId}' 없음` };
  if (player.learnedSkillIds.length >= MAX_LEARNED_SKILLS) return { ok: false, reason: "스킬 슬롯 가득" };
  if (player.learnedSkillIds.includes(skillId) || player.innateSkillId === skillId) return { ok: false, reason: "이미 보유" };
  const position = positionOverride || player.position;
  if (Array.isArray(skill.positions) && skill.positions.length && !skill.positions.includes(position)) {
    return { ok: false, reason: "포지션 불일치" };
  }
  return { ok: true, reason: null };
}

// ---------------------------------------------------------------------------
// §6.1 훈련 칸 배치
// ---------------------------------------------------------------------------

/**
 * 빈 placement
 * @returns {Record<string, { players: string[], supports: string[] }>}
 */
export function emptyPlacement() {
  const p = {};
  for (const s of STATS) p[s] = { players: [], supports: [] };
  return p;
}

/**
 * 매 턴 시작에 선수(부상자 제외)·서포트를 5칸에 배치. state.placement 갱신. rng 소비.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {import("./run.js").RunState}
 */
export function placeSlots(state, data) {
  const rng = createRngFromState(state.rngState);
  const weights = data.config.training.slotWeights;
  const supports = indexById(data.supports, "supports");
  const placement = emptyPlacement();

  for (const player of state.players) {
    if (player.injuredTurns > 0) continue;
    let slot;
    if (state.summon && state.summon.playerId === player.id && STATS.includes(state.summon.slot)) {
      slot = state.summon.slot;
    } else {
      const w = weights[player.position];
      if (!w) throw new Error(`slotWeights 에 포지션 '${player.position}' 이 없습니다`);
      slot = rng.weighted(STATS, (s) => w[s] || 0);
    }
    placement[slot].players.push(player.id);
  }

  for (const sp of state.supports) {
    const card = getById(supports, sp.id, "서포트");
    let slot;
    if (STATS.includes(card.type) && rng.chance(card.specialtyRate || 0)) {
      slot = card.type;
    } else {
      slot = rng.pick(STATS);
    }
    placement[slot].supports.push(sp.id);
  }

  state.placement = placement;
  state.rngState = rng.getState();
  return state;
}

// ---------------------------------------------------------------------------
// §6.2 훈련 계산 (미리보기 / 실행 공용)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} SlotPreview
 * @property {string} type
 * @property {number} eff
 * @property {Array<{ playerId: string, gains: Record<string, number>, staminaCost: number, failRate: number }>} perPlayer
 * @property {Array<{ playerId: string, slot: string, gains: Record<string, number> }>} freePlayers
 * @property {number} totalGain
 * @property {number} maxFailRate
 * @property {boolean} friendship
 * @property {Array<{ supportId: string, amount: number }>} bondGain
 * @property {number} teamworkGain
 */

/**
 * 칸 T 를 골랐을 때의 결정적 미리보기 (rng 소비 없음, 상태 변경 없음).
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {string} slotType
 * @returns {SlotPreview}
 */
export function previewSlot(state, data, slotType) {
  if (!STATS.includes(slotType)) throw new Error(`알 수 없는 훈련 칸: '${slotType}'`);
  const cfg = data.config;
  const tr = cfg.training;
  const cap = cfg.statCap;
  const placement = state.placement || emptyPlacement();
  const slot = placement[slotType] || { players: [], supports: [] };
  const supportsData = indexById(data.supports, "supports");
  const playersById = new Map(state.players.map((p) => [p.id, p]));

  const condMult = trainingMult(cfg, state.condition);
  const n = slot.players.length;

  let bonusSum = 0;
  let friendshipSum = 0;
  let failReduction = 0;
  for (const spId of slot.supports) {
    const card = getById(supportsData, spId, "서포트");
    const st = state.supports.find((s) => s.id === spId);
    bonusSum += Number(card.trainingBonus) || 0;
    failReduction += Number(card.failRateReduction) || 0;
    if (st && st.bond >= tr.friendshipThreshold && card.type === slotType) {
      friendshipSum += Number(card.friendshipBonus) || 0;
    }
  }
  const eff =
    condMult *
    (1 + bonusSum) *
    (1 + friendshipSum) *
    (1 + tr.crowdBonusPerExtraPlayer * Math.max(0, n - 1)) *
    (1 + getModifier(state, "trainingEfficiency"));

  const subStat = tr.subStatMap[slotType];
  const injuryMod = getModifier(state, "injuryRate");

  const perPlayer = [];
  let totalGain = 0;
  let maxFailRate = 0;
  for (const pid of slot.players) {
    const p = playersById.get(pid);
    if (!p) throw new Error(`placement 의 선수 '${pid}' 가 없습니다`);
    const mainGain = Math.round(tr.mainGain * (p.growth[slotType] ?? 1) * eff);
    const subGain = Math.round(tr.subGain * (p.growth[subStat] ?? 1) * eff);
    const gains = {};
    gains[slotType] = Math.max(0, Math.min(mainGain, cap - p.stats[slotType]));
    gains[subStat] = Math.max(0, Math.min(subGain, cap - p.stats[subStat]));
    const failRate = clamp(failRateForStamina(cfg, p.stamina) + injuryMod - failReduction, 0, 0.95);
    perPlayer.push({ playerId: pid, gains, staminaCost: tr.staminaCost, failRate });
    totalGain += gains[slotType] + gains[subStat];
    if (failRate > maxFailRate) maxFailRate = failRate;
  }

  const freePlayers = [];
  for (const other of STATS) {
    if (other === slotType) continue;
    for (const pid of placement[other].players) {
      const p = playersById.get(pid);
      if (!p) continue;
      const base = Math.round(tr.mainGain * (p.growth[other] ?? 1) * condMult);
      const g = Math.max(0, Math.min(Math.round(base * tr.freeTrainRatio), cap - p.stats[other]));
      const gains = {};
      gains[other] = g;
      freePlayers.push({ playerId: pid, slot: other, gains });
      totalGain += g;
    }
  }

  const bondPer = tr.bondPerTraining + getModifier(state, "bondGain");
  const bondGain = slot.supports.map((spId) => {
    const st = state.supports.find((s) => s.id === spId);
    const cur = st ? st.bond : 0;
    return { supportId: spId, amount: Math.max(0, Math.min(Math.round(bondPer), 100 - cur)) };
  });

  return {
    type: slotType,
    eff,
    perPlayer,
    freePlayers,
    totalGain,
    maxFailRate,
    friendship: friendshipSum > 0,
    bondGain,
    teamworkGain: tr.teamworkPerExtraPlayer * Math.max(0, n - 1),
  };
}

/**
 * @typedef {Object} TrainingResult
 * @property {string} slot
 * @property {Array<{ playerId: string, success: boolean, gains: Record<string, number>, loss: number, injured: boolean, staminaCost: number }>} results
 * @property {Array<{ playerId: string, gains: Record<string, number> }>} free
 * @property {Array<{ supportId: string, amount: number }>} bondGain
 * @property {Array<{ supportId: string, skillId: string, level: number }>} hints
 * @property {number} teamworkGain
 * @property {boolean} friendship
 */

/**
 * 훈련 실행 (§6.2). 상태 변경 + rng 소비. 결과 요약을 반환한다 (로그는 run.js 가 쓴다).
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {string} slotType
 * @returns {TrainingResult}
 */
export function resolveTraining(state, data, slotType) {
  const preview = previewSlot(state, data, slotType);
  const rng = createRngFromState(state.rngState);
  const cfg = data.config;
  const tr = cfg.training;
  const cap = cfg.statCap;
  const supportsData = indexById(data.supports, "supports");
  const skillsData = indexById(data.skills || [], "skills");
  const playersById = new Map(state.players.map((p) => [p.id, p]));
  const slot = (state.placement || emptyPlacement())[slotType];

  const results = [];
  for (const pp of preview.perPlayer) {
    const p = playersById.get(pp.playerId);
    const failed = rng.chance(pp.failRate);
    let injured = false;
    let loss = 0;
    if (failed) {
      loss = Math.min(tr.failStatLoss, p.stats[slotType]);
      p.stats[slotType] = Math.max(0, p.stats[slotType] - tr.failStatLoss);
      if (rng.chance(tr.injuryChanceOnFail)) {
        injured = true;
        p.injuredTurns = Math.max(p.injuredTurns || 0, tr.injuryTurns);
      }
    } else {
      for (const [stat, g] of Object.entries(pp.gains)) {
        p.stats[stat] = Math.min(cap, p.stats[stat] + g);
      }
      p.trainedCount = (p.trainedCount || 0) + 1;
    }
    p.stamina = clamp(p.stamina - tr.staminaCost, 0, 100);
    results.push({
      playerId: p.id,
      success: !failed,
      gains: failed ? {} : pp.gains,
      loss,
      injured,
      staminaCost: tr.staminaCost,
    });
  }

  // 유대 + 힌트
  const bondGain = [];
  const hints = [];
  const hintMod = getModifier(state, "hintRate");
  for (const spId of slot.supports) {
    const st = state.supports.find((s) => s.id === spId);
    const card = getById(supportsData, spId, "서포트");
    if (st) {
      const before = st.bond;
      st.bond = clamp(Math.round(st.bond + tr.bondPerTraining + getModifier(state, "bondGain")), 0, 100);
      bondGain.push({ supportId: spId, amount: st.bond - before });
    }
    const hintIds = Array.isArray(card.hintSkillIds)
      ? card.hintSkillIds.filter((id) => skillsData.size === 0 || (skillsData.has(id) && skillsData.get(id).learnable))
      : [];
    if (hintIds.length > 0 && rng.chance((Number(card.hintRate) || 0) + hintMod)) {
      const skillId = rng.pick(hintIds);
      const cur = state.hints[skillId] || 0;
      if (cur < MAX_HINT_LEVEL) {
        state.hints[skillId] = cur + 1;
        hints.push({ supportId: spId, skillId, level: state.hints[skillId] });
      }
    }
  }

  // 팀워크
  state.teamwork = clamp(state.teamwork + preview.teamworkGain, 0, 100);

  // 다른 칸 자율 훈련
  const free = [];
  for (const fp of preview.freePlayers) {
    const p = playersById.get(fp.playerId);
    if (!p) continue;
    for (const [stat, g] of Object.entries(fp.gains)) {
      p.stats[stat] = Math.min(cap, p.stats[stat] + g);
    }
    free.push({ playerId: fp.playerId, gains: fp.gains });
  }

  state.rngState = rng.getState();
  return {
    slot: slotType,
    results,
    free,
    bondGain,
    hints,
    teamworkGain: preview.teamworkGain,
    friendship: preview.friendship,
  };
}

// ---------------------------------------------------------------------------
// §6.3 휴식 / §6.4 외출 / §6.5 전술 미팅 / 친선전 체력
// ---------------------------------------------------------------------------

/**
 * 휴식: 전원 체력 += rest.stamina × (1 + restEffect); conditionUpChance 로 컨디션 +1. rng 소비.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {{ staminaGain: number, conditionUp: boolean }}
 */
export function resolveRest(state, data) {
  const rng = createRngFromState(state.rngState);
  const rest = data.config.rest;
  const gain = Math.round(rest.stamina * (1 + getModifier(state, "restEffect")));
  for (const p of state.players) p.stamina = clamp(p.stamina + gain, 0, 100);
  const conditionUp = rng.chance(rest.conditionUpChance);
  if (conditionUp) state.condition = clamp(state.condition + 1, 0, 4);
  state.rngState = rng.getState();
  return { staminaGain: gain, conditionUp };
}

/**
 * 장착한 friend 타입 서포트 id (첫 장). 없으면 null.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {string|null}
 */
export function findFriendSupportId(state, data) {
  const supportsData = indexById(data.supports, "supports");
  for (const sp of state.supports) {
    const card = supportsData.get(sp.id);
    if (card && card.type === "friend") return sp.id;
  }
  return null;
}

/**
 * 외출 (§6.4). rng 소비 없음. 서포트 이벤트 발생은 run.js 가 반환값을 보고 처리한다.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {{ friendSupportId: string|null, bondGain: number, staminaGain: number }}
 */
export function resolveOuting(state, data) {
  const out = data.config.outing;
  const friendId = findFriendSupportId(state, data);
  state.condition = clamp(state.condition + out.condition, 0, 4);
  if (friendId) {
    const st = state.supports.find((s) => s.id === friendId);
    const before = st.bond;
    st.bond = clamp(Math.round(st.bond + out.bond + getModifier(state, "bondGain")), 0, 100);
    return { friendSupportId: friendId, bondGain: st.bond - before, staminaGain: 0 };
  }
  for (const p of state.players) p.stamina = clamp(p.stamina + out.teamStamina, 0, 100);
  return { friendSupportId: null, bondGain: 0, staminaGain: out.teamStamina };
}

/**
 * 스쿼드 배치 검증 (createRun / 미팅 공용). 문제가 있으면 throw.
 * @param {object} data
 * @param {string} formation
 * @param {Record<string, string>} slotToCharId  { slotId: characterId }
 * @returns {Record<string, { position: string, aptitude: string }>} slot → 포지션/적성
 */
export function validateSquad(data, formation, slotToCharId) {
  const slots = formationSlots(formation);
  const chars = indexById(data.characters, "characters");
  const given = Object.keys(slotToCharId || {});
  for (const s of given) {
    if (!slots.includes(s)) throw new Error(`포메이션 ${formation} 에 없는 슬롯: '${s}'`);
  }
  const seen = new Set();
  const out = {};
  for (const slot of slots) {
    const charId = slotToCharId[slot];
    if (!charId) throw new Error(`슬롯 '${slot}' 이 비어 있습니다`);
    if (seen.has(charId)) throw new Error(`캐릭터 '${charId}' 가 두 슬롯에 배치되었습니다`);
    seen.add(charId);
    const ch = getById(chars, charId, "캐릭터");
    const position = slotPosition(slot);
    const apt = (ch.aptitude && ch.aptitude[position]) || "-";
    if (apt === "-") throw new Error(`'${ch.name}' 은(는) ${position} 적성이 없어 배치할 수 없습니다`);
    if (position === "GK" && apt !== "A" && apt !== "B") {
      throw new Error(`GK 는 적성 A/B 만 배치할 수 있습니다 ('${ch.name}' 은 ${apt})`);
    }
    out[slot] = { position, aptitude: apt };
  }
  return out;
}

/**
 * 전술 미팅 (§6.5). 팀워크 += meeting.teamwork, 전술/포메이션/스왑/스킬 구매 1회. rng 소비 없음.
 * 모든 검증을 먼저 하고 나서 상태를 바꾼다 (실패 시 상태 불변).
 * swaps: { playerId, slot } — 그 선수를 그 슬롯으로. 슬롯에 다른 선수가 있으면 자리를 맞바꾼다.
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @param {{ tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }>, buy?: { skillId: string, playerId: string } }} action
 * @param {{ teamwork?: boolean }} [opts]  teamwork === false 면 팀워크를 올리지 않는다 (레슨 런의 경기 전 준비 등)
 * @returns {{ teamworkGain: number, formationChanged: boolean, swapped: number, bought: { skillId: string, playerId: string, cost: number } | null }}
 */
export function resolveMeeting(state, data, action, opts = {}) {
  const cfg = data.config;
  const formation = action.formation || state.formation;
  if (!FORMATIONS[formation]) throw new Error(`알 수 없는 포메이션: '${formation}'`);
  const newSlots = formationSlots(formation);

  // 1) 새 슬롯 배치 계산 (검증만)
  const assign = new Map(state.players.map((p) => [p.id, p.slot]));
  const swaps = Array.isArray(action.swaps) ? action.swaps : [];
  for (const sw of swaps) {
    if (!sw || !assign.has(sw.playerId)) throw new Error(`스왑 대상 선수 '${sw && sw.playerId}' 가 없습니다`);
    if (!newSlots.includes(sw.slot)) throw new Error(`포메이션 ${formation} 에 없는 슬롯: '${sw.slot}'`);
    const from = assign.get(sw.playerId);
    let occupant = null;
    for (const [pid, s] of assign) if (s === sw.slot && pid !== sw.playerId) occupant = pid;
    assign.set(sw.playerId, sw.slot);
    if (occupant) assign.set(occupant, from);
  }
  const slotToChar = {};
  for (const p of state.players) {
    const slot = assign.get(p.id);
    if (slotToChar[slot]) throw new Error(`슬롯 '${slot}' 에 선수가 둘 이상입니다`);
    slotToChar[slot] = p.charId;
  }
  const formationChanged = formation !== state.formation;
  const changed = formationChanged || swaps.length > 0;
  let slotInfo = null;
  if (changed) slotInfo = validateSquad(data, formation, slotToChar);

  // 2) 구매 검증
  let bought = null;
  if (action.buy) {
    const { skillId, playerId } = action.buy;
    const newPos = slotInfo && assign.has(playerId) ? slotInfo[assign.get(playerId)].position : null;
    const check = canLearnSkill(state, data, skillId, playerId, newPos);
    if (!check.ok) throw new Error(`스킬 구매 불가: ${check.reason}`);
    const skill = getById(data.skills, skillId, "스킬");
    const cost = skillDiscountedCost(skill.cost || 0, state.hints[skillId] || 0);
    if (state.skillPoints < cost) throw new Error(`스킬 포인트 부족 (${state.skillPoints}/${cost})`);
    bought = { skillId, playerId, cost };
  }

  // 3) 적용
  const teamworkGain = opts && opts.teamwork === false ? 0 : cfg.meeting.teamwork;
  state.teamwork = clamp(state.teamwork + teamworkGain, 0, 100);
  if (action.tactics && typeof action.tactics === "object") {
    state.tactics = { ...state.tactics, ...action.tactics };
  }
  if (changed) {
    state.formation = formation;
    for (const p of state.players) {
      const slot = assign.get(p.id);
      p.slot = slot;
      p.position = slotInfo[slot].position;
      p.aptitude = slotInfo[slot].aptitude;
    }
  }
  if (bought) {
    const player = state.players.find((p) => p.id === bought.playerId);
    player.learnedSkillIds.push(bought.skillId);
    state.skillPoints -= bought.cost;
  }
  return { teamworkGain, formationChanged, swapped: swaps.length, bought };
}

/**
 * 친선전 체력 소모: 부상 아닌 전원 −friendly.staminaCost
 * @param {import("./run.js").RunState} state
 * @param {object} data
 * @returns {import("./run.js").RunState}
 */
export function applyFriendlyStaminaCost(state, data) {
  const cost = data.config.friendly.staminaCost;
  for (const p of state.players) {
    if (p.injuredTurns > 0) continue;
    p.stamina = clamp(p.stamina - cost, 0, 100);
  }
  return state;
}
