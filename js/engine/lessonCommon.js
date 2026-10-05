/**
 * lessonCommon.js — 레슨 런 공용 도우미 (LESSON_PROTO_PLAN §24.5.1 · E2).
 *
 * lessonRun.js 안에 있던 덱 · 유대 · 코치 수업 · 보상 후보 · 상담 값 도우미를 옮겼다 (동작 그대로 — lesson_sim 숫자가 같다).
 * lessonRun 과 lessonEffects (이벤트 효과 층) 가 같이 쓴다. lessonEffects 가 lessonRun 을 부르는 순환 import 를 막으려고 옮겼다.
 * 이 모듈은 lessonRun · lessonEvents · lessonEffects 를 import 하지 않는다.
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 없음. rng 는 인자로 받은 것만 쓴다 (drawHint · drawHintFrom · rollRewardOffer).
 */
import { MAX_HINT_LEVEL, MAX_LEARNED_SKILLS as MAX_SKILL_SLOTS, clamp } from "./training.js";
import * as cards from "./cards.js";

/** data/lesson.json */
export function LD(data) {
  return data.lesson;
}

export function supportCard(data, supportId) {
  return data.supports.find((s) => s.id === supportId) || null;
}

/** 그 코치의 코치 카드 (없으면 null) */
export function coachCardOf(data, supportId) {
  return cards.cardList(data).find((c) => c.family === "coach" && c.coach && c.coach.supportId === supportId) || null;
}

export function skillById(data, id) {
  return data.skills.find((s) => s.id === id) || null;
}

/** 액티브 스킬인가 — 레슨 런에서는 코치 수업으로만 배운다 (§18.2). 상점 · 힌트 레벨에는 들어가지 않는다. */
export function isActiveSkill(sk) {
  return !!sk && sk.kind === "active";
}

/** 수업을 받지 않거나 받을 선수가 없을 때 SP (lesson.json rewards.teach.declineSp, 없으면 20 — §18.2) */
export function declineSpOf(data) {
  const t = LD(data).rewards && LD(data).rewards.teach;
  const v = Number(t && t.declineSp);
  return Number.isFinite(v) && v >= 0 ? v : 20;
}

export function addBond(st, n) {
  st.bond = clamp(Math.round((Number(st.bond) || 0) + n), 0, 100);
}

/** 덱에 카드 추가 (uid k{nextUid}) */
export function addToDeck(state, cardId, plus = false) {
  const uid = `k${state.nextUid}`;
  state.nextUid += 1;
  state.deck.push({ uid, cardId, plus: !!plus });
  return uid;
}

/** 코치 카드면 그 코치 유대 +acquire (D23) */
export function acquireBond(state, data, cardId) {
  const raw = cards.getCard(data, cardId);
  if (raw.family !== "coach" || !raw.coach) return 0;
  const st = state.supports.find((s) => s.id === raw.coach.supportId);
  if (!st) return 0;
  const before = st.bond;
  addBond(st, LD(data).bond.acquire);
  return st.bond - before;
}

export function deckEntry(state, uid) {
  return state.deck.find((e) => e.uid === uid) || null;
}

/** 이 덱 항목을 강화할 수 있는가 (강화 안 됨 · 강화 가능 카드) */
export function upgradable(data, entry) {
  return !!entry && !entry.plus && cards.canUpgrade(cards.getCard(data, entry.cardId));
}

/** 상담 카드 값 (TP — 공용 · 코치 · 방침) */
export function cardPrice(data, cardId) {
  const price = LD(data).consult.price;
  const fam = cards.getCard(data, cardId).family;
  if (fam === "common") return price.common;
  if (fam === "coach") return price.coach;
  return price.policy;
}

/**
 * 코치 수업을 받을 수 있는 선수인가 (§18.4). 순수. 힌트 검사가 없다 (training.canLearnSkill 과 다른 점). 다친 선수도 받는다.
 *   액티브 · learnable 이 아님 → "수업할 수 없는 스킬", 선수 없음 → "선수 없음", 습득 · 고유로 이미 가짐 → "이미 보유",
 *   positions 밖 → "FW만" (positions 를 " · " 로 이은 것 + "만").
 * @returns {{ ok: boolean, reason: string|null, full: boolean }} full = 습득 슬롯 3개가 가득 (ok 면 바꿀 스킬을 골라야 배운다)
 */
export function canTeachSkill(state, data, skillId, playerId) {
  const sk = skillById(data, skillId);
  if (!sk || !sk.learnable || !isActiveSkill(sk)) return { ok: false, reason: "수업할 수 없는 스킬", full: false };
  const p = (state.players || []).find((x) => x.id === playerId);
  if (!p) return { ok: false, reason: "선수 없음", full: false };
  const learned = Array.isArray(p.learnedSkillIds) ? p.learnedSkillIds : [];
  // 슬롯 3 = 액티브 몫 (L48 — 패시브는 자기 목록 3개로 따로)
  const full = learned.filter((id) => isActiveSkill(skillById(data, id))).length >= MAX_SKILL_SLOTS;
  if (learned.includes(skillId) || p.innateSkillId === skillId) return { ok: false, reason: "이미 보유", full };
  if (Array.isArray(sk.positions) && sk.positions.length && !sk.positions.includes(p.position)) {
    return { ok: false, reason: `${sk.positions.join(" · ")}만`, full };
  }
  return { ok: true, reason: null, full };
}

/**
 * 힌트 후보인가 (§18.3): 배울 수 있는 스킬 중
 *   - 패시브 (그 밖) — 힌트 레벨 3 미만 (지금 그대로)
 *   - 액티브 — 누군가 새로 배울 수 있다 (포지션이 맞고 그 스킬이 없는 선수 1명 이상, 슬롯이 가득이어도 바꾸기로 배울 수 있다)
 */
export function hintCandidate(state, data, id) {
  const sk = skillById(data, id);
  if (!sk || !sk.learnable) return false;
  if (isActiveSkill(sk)) return state.players.some((p) => canTeachSkill(state, data, id, p.id).ok);
  return (state.hints[id] || 0) < MAX_HINT_LEVEL;
}

/**
 * 뽑은 힌트 적용: 패시브 = 힌트 레벨 +1 (상점 할인 · 진열), 액티브 = state.hints 를 건드리지 않는다 (호출한 쪽이 수업으로).
 * @returns {{ skillId: string, level: number, supportId: string, active: boolean }}
 */
export function grantHint(state, data, skillId, supportId) {
  if (isActiveSkill(skillById(data, skillId))) return { skillId, level: 0, supportId, active: true };
  state.hints[skillId] = clamp((state.hints[skillId] || 0) + 1, 0, MAX_HINT_LEVEL);
  return { skillId, level: state.hints[skillId], supportId, active: false };
}

/**
 * 코치가 주는 스킬 목록 (L48): 레슨판은 `teachSkillIds` (수업할 액티브만 — 패시브는 선수 목록 · 선수 힌트로 옮겼다).
 * 없으면 옛 `hintSkillIds`. 코치가 없으면 null.
 */
export function coachSkillList(data, supportId) {
  const sc = supportCard(data, supportId);
  if (!sc) return null;
  if (Array.isArray(sc.teachSkillIds)) return sc.teachSkillIds;
  return Array.isArray(sc.hintSkillIds) ? sc.hintSkillIds : null;
}

/**
 * 힌트 1개 뽑기 (D26): hintRate 가중으로 편성 코치 → 그 코치 스킬 중 균등 (후보 = hintCandidate). 후보가 없으면 null.
 * rng 호출 수 · 순서는 §18 전과 같다 (후보 목록만 다르다).
 * @returns {{ skillId: string, level: number, supportId: string, active: boolean }|null}
 */
export function drawHint(state, data, rng) {
  const cands = [];
  for (const st of state.supports) {
    const list = coachSkillList(data, st.id);
    if (!list) continue;
    const sc = supportCard(data, st.id);
    const skills = list.filter((id) => hintCandidate(state, data, id));
    if (skills.length) cands.push({ supportId: st.id, skills, w: Number(sc.hintRate) || 0 });
  }
  if (!cands.length) return null;
  const c = rng.weighted(cands, (x) => x.w);
  const skillId = rng.pick(c.skills);
  return grantHint(state, data, skillId, c.supportId);
}

/**
 * 그 코치 한 명의 힌트 1개 (§15.5 컷인 힌트): 그 코치 hintSkillIds 중 후보 (hintCandidate) 균등. 없으면 null.
 * @returns {{ skillId: string, level: number, supportId: string, active: boolean }|null}
 */
export function drawHintFrom(state, data, rng, supportId) {
  const list = coachSkillList(data, supportId);
  if (!list) return null;
  const skills = list.filter((id) => hintCandidate(state, data, id));
  if (!skills.length) return null;
  const skillId = rng.pick(skills);
  return grantHint(state, data, skillId, supportId);
}

/** 수업 항목 (pendingReward.teach[], §18.3) */
export function teachEntry(skillId, supportId, src) {
  return { skillId, supportId: supportId || null, src, result: null, playerId: null, replaced: null, sp: 0 };
}

/** 보상 후보 (§5.4.3 5, D7 · D8). rng. */
export function rollRewardOffer(state, data, rng, status, special) {
  const R = LD(data).rewards;
  const w = R.weights;
  const cand = [];
  for (const c of cards.cardList(data)) {
    if (!c.pool) continue;
    if (c.family === "common") cand.push({ kind: "add", cardId: c.id, w: w.common });
    else if (c.family === state.policy) cand.push({ kind: "add", cardId: c.id, w: w.policy });
  }
  for (const st of state.supports) {
    const cc = coachCardOf(data, st.id);
    const sc = supportCard(data, st.id);
    if (cc) cand.push({ kind: "add", cardId: cc.id, w: (w.coachBase * (Number(sc && sc.specialtyRate) || 0)) / w.coachRef });
  }
  for (const e of state.deck) {
    const raw = cards.getCard(data, e.cardId);
    if (raw.family === "unique" && upgradable(data, e)) cand.push({ kind: "upgrade", cardId: e.cardId, uid: e.uid, w: w.uniquePlus });
  }
  const offer = [];
  let pool = cand.filter((c) => c.w > 0);
  while (offer.length < R.offer && pool.length) {
    const pick = rng.weighted(pool, (c) => c.w);
    offer.push(pick);
    pool = pool.filter((c) => c.cardId !== pick.cardId);
  }
  const pc = R.plusChance;
  const chance = Math.min(pc.max, (special ? pc.special : 0) + (status === "perfect" ? pc.perfect : 0));
  return offer.map((o) => {
    if (o.kind === "upgrade") return { cardId: o.cardId, plus: true, kind: "upgrade", uid: o.uid };
    const plus = chance > 0 && cards.canUpgrade(cards.getCard(data, o.cardId)) && rng.chance(chance);
    return { cardId: o.cardId, plus, kind: "add" };
  });
}

/**
 * 지금부터 남은 레슨 기회 수 (레슨 · 대비 주) — 이벤트 수업이 받힐 레슨이 남았는가 (§24.4.1 teach "남은 레슨 없음 → SP").
 * 이번 주가 아직 시작 전이면 (phase week · queue 에 beginWeek / resumeWeek) 이번 주도 센다. 레슨 주에 쉬면 레슨이 없을 수 있다 (어림).
 * 순수.
 * @returns {number}
 */
export function lessonsLeft(state, data) {
  const kinds = LD(data).weekKinds;
  const wps = LD(data).weeksPerSeason || kinds.length;
  const total = (Number(data.config && data.config.seasons) || 3) * wps;
  if (state.phase === "finished") return 0;
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const upcoming = state.phase === "week" || queue.includes("beginWeek") || queue.includes("resumeWeek");
  const from = (Number(state.turnIndex) || 0) + (upcoming ? 0 : 1);
  let n = 0;
  for (let i = from; i < total; i++) {
    const k = kinds[i % wps];
    if (k === "lesson" || k === "prep") n += 1;
  }
  return n;
}
