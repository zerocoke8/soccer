/**
 * 레슨판 패시브 (L48 · LESSON_PROTO_PLAN §20)
 *
 *  - 선수 패시브 목록: 캐릭터의 `passiveIds` (고유 1 + 공용 2). SP 로 산다 — 주 · 상담 · 경기 전 준비 (SHOP_PHASES).
 *    패시브는 스킬 슬롯(3 = 액티브 몫)을 쓰지 않는다. 목록 3개가 그 선수가 가질 수 있는 패시브 전부다.
 *  - 선수 힌트: 레슨에서 많이 큰 선수의 목록에서 1개 — 힌트 레벨 +1 (레벨당 10% 할인, 최대 MAX_HINT_LEVEL).
 *  - 코치 파티 패시브: 편성한 코치마다 1개, 런 내내 우리 팀 경기 전체에 걸린다 (사지 않는다). 유대 80이면 `bond80` 배율.
 *    경기 스냅샷 `partyPassives` 로 넘기고, skills.collectMods 가 팀 패시브(target team)처럼 센다.
 *
 * 순수 로직: rng 는 인자로 받은 것만 쓴다. 상태를 바꾸는 함수는 이름이 말한다 (drawPlayerHint · applyBuyPassive).
 */
import { MAX_HINT_LEVEL, skillDiscountedCost } from "./training.js";

/** SP 상점을 열 수 있는 phase */
export const SHOP_PHASES = ["week", "consult", "prep"];

/** 파티 패시브 mods 키 (skills.MOD_KEYS 중 팀 전체에 쓸 수 있는 것) */
export const PARTY_MOD_KEYS = ["attack", "defense", "save", "shootPower", "staminaCost", "tensionGain", "coverBonus"];

function skillById(data, id) {
  return (Array.isArray(data.skills) ? data.skills : []).find((s) => s && s.id === id) || null;
}

function charOf(data, charId) {
  return (Array.isArray(data.characters) ? data.characters : []).find((c) => c && c.id === charId) || null;
}

function supportOf(data, id) {
  return (Array.isArray(data.supports) ? data.supports : []).find((s) => s && s.id === id) || null;
}

/** 고유 패시브인가 (그 캐릭터만의 패시브 — ownerCharId) */
export function isUniquePassive(sk) {
  return !!(sk && sk.ownerCharId);
}

/** 선수의 패시브 목록 (캐릭터 passiveIds, 데이터 순서 = 고유 먼저) */
export function passiveListOf(data, player) {
  const ch = player ? charOf(data, player.charId) : null;
  return ch && Array.isArray(ch.passiveIds) ? ch.passiveIds.slice() : [];
}

/** 그 선수가 이미 가진 스킬인가 (습득 · 처음부터) */
function owns(player, skillId) {
  return (Array.isArray(player.learnedSkillIds) && player.learnedSkillIds.includes(skillId)) || player.innateSkillId === skillId;
}

/**
 * 선수가 그 패시브를 살 수 있는가 (가격은 보지 않는다).
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function canBuyPassive(state, data, skillId, playerId) {
  const sk = skillById(data, skillId);
  if (!sk) return { ok: false, reason: `스킬 '${skillId}' 없음` };
  if (sk.kind !== "passive" || !sk.learnable) return { ok: false, reason: "살 수 있는 패시브가 아닙니다" };
  const p = (state.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: `선수 '${playerId}' 없음` };
  if (!passiveListOf(data, p).includes(skillId)) return { ok: false, reason: "그 선수의 패시브가 아닙니다" };
  if (owns(p, skillId)) return { ok: false, reason: "이미 보유" };
  if (Array.isArray(sk.positions) && sk.positions.length && !sk.positions.includes(p.position)) {
    return { ok: false, reason: `${sk.positions.join(" · ")}만` };
  }
  return { ok: true, reason: null };
}

/** 지금 값 (힌트 할인) */
export function passiveCost(state, data, skillId) {
  const sk = skillById(data, skillId);
  return skillDiscountedCost(Number(sk && sk.cost) || 0, (state.hints && state.hints[skillId]) || 0);
}

/**
 * SP 상점 뷰 (순수): 선수마다 목록 3개.
 * @returns {{ sp: number, open: boolean, players: Array<{ id, charId, name, slot, position, portraitColor, owned: number,
 *   rows: Array<{ skillId, name, description, unique, baseCost, cost, level, owned, ok, reason, affordable }> }> }}
 */
export function passiveShopView(state, data) {
  const sp = Number(state.skillPoints) || 0;
  const players = (state.players || []).map((p) => {
    const rows = passiveListOf(data, p).map((skillId) => {
      const sk = skillById(data, skillId) || {};
      const has = owns(p, skillId);
      const c = has ? { ok: false, reason: "보유" } : canBuyPassive(state, data, skillId, p.id);
      const cost = passiveCost(state, data, skillId);
      return {
        skillId,
        name: sk.name || skillId,
        description: sk.description || "",
        unique: isUniquePassive(sk),
        baseCost: Number(sk.cost) || 0,
        cost,
        level: (state.hints && state.hints[skillId]) || 0,
        owned: has,
        ok: c.ok,
        reason: c.reason,
        affordable: c.ok && sp >= cost,
      };
    });
    return {
      id: p.id, charId: p.charId, name: p.name, slot: p.slot, position: p.position, portraitColor: p.portraitColor,
      owned: rows.filter((r) => r.owned).length,
      rows,
    };
  });
  return { sp, open: SHOP_PHASES.includes(state.phase), players };
}

/**
 * 패시브 사기 (검증 → 적용). phase 검사는 부르는 쪽 (lessonRun.buyPassive). 실패하면 상태를 바꾸지 않고 throw.
 * @returns {{ cost: number, name: string, player: object }}
 */
export function applyBuyPassive(state, data, skillId, playerId) {
  const c = canBuyPassive(state, data, skillId, playerId);
  if (!c.ok) throw new Error(`패시브를 살 수 없습니다: ${c.reason}`);
  const cost = passiveCost(state, data, skillId);
  if ((Number(state.skillPoints) || 0) < cost) throw new Error(`SP 가 부족합니다 (${state.skillPoints}/${cost})`);
  const p = state.players.find((x) => x.id === playerId);
  p.learnedSkillIds.push(skillId);
  state.skillPoints -= cost;
  return { cost, name: skillById(data, skillId).name, player: p };
}

/**
 * 레슨에서 많이 큰 선수 순서 (perPlayer = lessonResult.perPlayer): 5스탯 상승 합 내림차순, 같으면 명단 순서.
 * @returns {string[]} 선수 id
 */
export function topGrowers(perPlayer) {
  const total = (x) => Object.values(x.byStat || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  return (perPlayer || [])
    .map((x, i) => ({ id: x.id, g: total(x), i }))
    .sort((a, b) => b.g - a.g || a.i - b.i)
    .map((x) => x.id);
}

/** 선수 힌트 후보: 그 선수 목록 중 아직 없고 · 살 수 있는 포지션이고 · 힌트 레벨이 최대 미만인 패시브 */
export function playerHintCands(state, data, playerId) {
  const p = (state.players || []).find((x) => x.id === playerId);
  if (!p) return [];
  return passiveListOf(data, p).filter((id) => canBuyPassive(state, data, id, p.id).ok && ((state.hints && state.hints[id]) || 0) < MAX_HINT_LEVEL);
}

/**
 * 선수 힌트 1개 (rng — 후보 중 균등). 힌트 레벨 +1. 후보가 없으면 null (rng 를 쓰지 않는다).
 * @returns {{ skillId: string, level: number, playerId: string }|null}
 */
export function drawPlayerHint(state, data, rng, playerId) {
  const cands = playerHintCands(state, data, playerId);
  if (!cands.length) return null;
  const skillId = cands.length === 1 ? cands[0] : rng.pick(cands);
  if (!state.hints || typeof state.hints !== "object") state.hints = {};
  state.hints[skillId] = Math.min(MAX_HINT_LEVEL, (state.hints[skillId] || 0) + 1);
  return { skillId, level: state.hints[skillId], playerId };
}

/** 코치의 파티 패시브 정의 (supports.json partyPassive), 없으면 null */
export function partyPassiveDef(data, supportId) {
  const sc = supportOf(data, supportId);
  return sc && sc.partyPassive ? sc.partyPassive : null;
}

/**
 * 편성 코치들의 파티 패시브 (경기 스냅샷 · 뷰 공용, 순수). 유대 80 이상이면 bond80 배율 · text80.
 * @param {object} state supports: [{ id, bond }]
 * @returns {Array<{ id: string, coachId: string, coachName: string, name: string, when: string, mods: object,
 *   actions: string[]|null, upgraded: boolean, text: string, text80: string }>}
 */
export function partyPassivesFor(state, data) {
  const upAt = Number(data && data.lesson && data.lesson.bond && data.lesson.bond.upgradeAt) || 80;
  const out = [];
  for (const st of state.supports || []) {
    const pp = partyPassiveDef(data, st.id);
    if (!pp) continue;
    const sc = supportOf(data, st.id);
    const upgraded = (Number(st.bond) || 0) >= upAt && !!pp.bond80;
    out.push({
      id: `pp_${st.id}`,
      coachId: st.id,
      coachName: sc.name,
      name: pp.name,
      when: pp.when || "always",
      mods: { ...(upgraded ? pp.bond80 : pp.mods) },
      actions: Array.isArray(pp.actions) && pp.actions.length ? pp.actions.slice() : null,
      upgraded,
      text: upgraded && pp.text80 ? pp.text80 : pp.text || "",
      text80: pp.text80 || "",
    });
  }
  return out;
}

/**
 * 데이터 검증 (테스트 · 로더): 캐릭터 passiveIds = 패시브 3개 (고유 = 첫째, ownerCharId = 그 캐릭터, 고유는 한 캐릭터에만) ·
 * 코치 partyPassive (name · text · when · mods ⊂ PARTY_MOD_KEYS, 배율 > 0, bond80 같은 키) · teachSkillIds = 배울 수 있는 액티브.
 * @returns {true} 문제가 있으면 throw (모든 문제를 한 번에)
 */
export function validatePassiveData(data) {
  const errors = [];
  const chars = Array.isArray(data.characters) ? data.characters : [];
  const seenUnique = new Map();
  for (const ch of chars) {
    const at = `캐릭터 '${ch.id}'`;
    const list = ch.passiveIds;
    if (!Array.isArray(list) || list.length !== 3 || new Set(list).size !== 3) {
      errors.push(`${at}: passiveIds 는 서로 다른 패시브 3개여야 합니다`);
      continue;
    }
    list.forEach((id, i) => {
      const sk = skillById(data, id);
      if (!sk) return errors.push(`${at}: 모르는 스킬 '${id}'`);
      if (sk.kind !== "passive" || !sk.learnable) errors.push(`${at}: '${id}' 는 배울 수 있는 패시브가 아닙니다`);
      if (i === 0 && sk.ownerCharId !== ch.id) errors.push(`${at}: 첫째 '${id}' 는 이 캐릭터의 고유 패시브여야 합니다 (ownerCharId)`);
      if (i > 0 && sk.ownerCharId) errors.push(`${at}: '${id}' 는 고유 패시브라 공용 자리에 쓸 수 없습니다`);
      if (i === 0) {
        if (seenUnique.has(id)) errors.push(`${at}: 고유 패시브 '${id}' 를 '${seenUnique.get(id)}' 도 씁니다`);
        seenUnique.set(id, ch.id);
      }
    });
  }
  for (const sk of Array.isArray(data.skills) ? data.skills : []) {
    if (sk.ownerCharId && !chars.some((c) => c.id === sk.ownerCharId)) errors.push(`스킬 '${sk.id}': 모르는 ownerCharId '${sk.ownerCharId}'`);
  }
  for (const sc of Array.isArray(data.supports) ? data.supports : []) {
    const at = `코치 '${sc.id}'`;
    if (Array.isArray(sc.teachSkillIds)) {
      for (const id of sc.teachSkillIds) {
        const sk = skillById(data, id);
        if (!sk || sk.kind !== "active" || !sk.learnable) errors.push(`${at}: teachSkillIds '${id}' 는 배울 수 있는 액티브가 아닙니다`);
      }
    }
    const pp = sc.partyPassive;
    if (!pp) continue;
    if (typeof pp.name !== "string" || !pp.name.trim()) errors.push(`${at}: partyPassive.name 이 없습니다`);
    if (typeof pp.text !== "string" || !pp.text.trim()) errors.push(`${at}: partyPassive.text 가 없습니다`);
    const checkMods = (mods, key) => {
      if (!mods || typeof mods !== "object" || !Object.keys(mods).length) return errors.push(`${at}: partyPassive.${key} 가 비었습니다`);
      for (const [k, v] of Object.entries(mods)) {
        if (!PARTY_MOD_KEYS.includes(k)) errors.push(`${at}: partyPassive.${key} 의 모르는 키 '${k}'`);
        if (!(typeof v === "number" && Number.isFinite(v) && v > 0)) errors.push(`${at}: partyPassive.${key}.${k} 는 0보다 큰 수`);
      }
    };
    checkMods(pp.mods, "mods");
    if (pp.bond80) {
      checkMods(pp.bond80, "bond80");
      if (pp.mods && Object.keys(pp.bond80).sort().join() !== Object.keys(pp.mods).sort().join()) errors.push(`${at}: partyPassive.bond80 은 mods 와 같은 키여야 합니다`);
    }
  }
  if (errors.length) throw new Error(`패시브 데이터 오류:\n- ${errors.join("\n- ")}`);
  return true;
}
