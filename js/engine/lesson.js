/**
 * lesson.js — 레슨 카드 배틀, 구역 방식 (LESSON_PROTO_PLAN §14.3 ~ §14.13).
 *
 * 상태는 RunState 안의 state.lesson (LessonState, §14.13) 에 둔다. JSON 순수 객체이고 함수를 넣지 않는다.
 * 상태를 바꾸는 함수 (startLesson · playCard · benchPlayer · endLessonTurn) 는 (state, data, args) 를 받아 state 를 돌려준다.
 *   - rng 는 함수에 들어올 때 state.rngState 로 열고, 나가기 직전에 저장한다 (§8). 검증은 rng · 상태를 건드리기 전에 끝낸다.
 *   - 상태를 바꾸는 레슨 호출마다 lesson.seq +1, lesson.lastFx 를 덮어쓴다 (startLesson 은 seq 0).
 *   - rng 를 쓰는 곳: 섞기 · 코치 지원 붙을 턴 (레슨 시작, 섞기 뒤) · 깜짝 계획 (레슨 시작, 붙을 턴 다음 — 켜져 있을 때만 2번) ·
 *     흩어지기 (턴 시작, 뽑기보다 먼저) · 뽑기 · 코치 지원 붙기 (턴 시작, 뽑기 뒤) · 실패 · 부상 · 지원 능력의 확률 (hint · condition) ·
 *     깜짝 고르기 · 주인공 (턴 끝, 다음 턴 시작 앞) · 깜짝 효과 (resolveSurprise — random · 힌트). benchPlayer 는 rng 를 쓰지 않는다.
 * 뷰 · 미리보기 · 후보 점 (getLessonView · previewCard · dropCandidates · lessonResult) 는 rng 를 쓰지 않고 상태를 바꾸지 않는다.
 *
 * 턴 (§14.3): 시작 = 벤치 비우기 → 흩어지기 → 뽑기 → 죽은 카드 다시 뽑기 / 행동 = 카드 끌어다 놓기 · 벤치 · [턴 끝] /
 *   끝 = 기본 훈련 (분위기 몫 포함) → 벤치 회복 → 분위기 감소 → 퍼펙트 판정 → 손패 버리기 → 다음 턴 또는 레슨 끝.
 * 레슨이 끝나면 (status ≠ "playing") 레슨 안의 끝 처리 (한나 endHeal · 결과 판정) 까지만 한다 — 자율 훈련은 없다.
 * 보상 · 힌트 · 결장 감소 · 기록 · phase 이동은 lessonRun.js 가 한다.
 *
 * 선수 위치는 저장하지 않는다 — lesson.zones (이번 턴 구역) 에서 zones.js 로 매번 계산한다.
 *   L52 (§23): 대형 흔들림은 lesson.layoutSeed (레슨 시작 때 런 seed · 주 번호 해시) · lesson.turn · 구역 · 선수 id 의 해시 — rng 를 쓰지 않는다.
 *
 * 코치 지원 · 컷인 (§15.1 ~ §15.5): 레슨 시작에 붙을 턴 attach.count 개 (C3 에서 4~5 — 컷인이 레슨당 2~4번이 되게) 를 정하고, 그 턴 시작에 편성 코치 1명이 손패 1장에 붙는다
 *   (lesson.attach.cur). 붙은 카드는 그 턴만 한 단계 강화되고, 내면 컷인 fx · 코치 능력 (lesson.json attach.abilities) · 유대.
 *
 * 레슨 깜짝 이벤트 (L29 · §24.8, E5 — 조건 · 후보 · 주인공 · 뷰는 lessonSurprise.js):
 *   - lesson.json events.surprise.enabled 일 때만 startLesson 이 계획한다 (lesson.surprise · turnLog · rested · nextExtraPlay · streak ·
 *     lastTargeted). 꺼져 있으면 이 필드가 없고 rng 도 쓰지 않는다 — 1차와 같은 레슨.
 *   - 턴 기록: beginTurn 이 비우고 playCard · drawOne · benchPlayer 가 쓴다 (lesson.turnLog 가 있을 때만).
 *   - 띄우기: endTurn 의 상한 · 마지막 턴 검사 뒤, 다음 턴 앞 → lesson.surprise.pending + fx { t: "surprise" } 를 남기고 멈춘다.
 *     기다리는 동안 playCard · benchPlayer · endLessonTurn 은 throw, 뷰는 surprise 를 싣고 canEndTurn · canBench = false.
 *   - 해결 resolveSurprise: 효과 (레슨 안 효과는 여기 applyLessonEffect, 런 효과는 lessonEffects) → fx { t: "surpriseResult" } →
 *     상한이면 레슨 끝, 아니면 다음 턴.
 *   - 쉬는 선수 (lesson.rested — "남은 턴 쉼") 는 결장처럼 빠진다 (cards.isOut): 흩어지기 · 대상 · 기본 훈련 · 벤치 없음. 벤치 칸과 따로 센다.
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다.
 */
import { createRngFromState } from "./rng.js";
import { clamp, trainingMult, failRateForStamina, getModifier, STAT_LABELS } from "./training.js";
import * as cards from "./cards.js";
import * as zones from "./zones.js";
import * as surprise from "./lessonSurprise.js";
import { eventById } from "./lessonEvents.js";
import { applyEffects } from "./lessonEffects.js";

/** 부동소수 오차 없이 반올림 */
const rnd = cards.roundCost;

/** 공격 구역 · 수비 구역 (§14.11) */
export const ATTACK_ZONES = ["shoot", "dribble", "pass"];
export const DEFENSE_ZONES = ["defense", "physical"];

/** 버프 초기값 (§5.2) */
export function emptyBuffs() {
  return {
    hojo: 0, focus: 0, mood: 0, noDecay: 0, steal: 0, press: 0, poss: 0, possGuard: 0,
    routine: 0, nextPct: 0, nextPairPct: 0, nextNoFail: false, nextCostZero: false,
  };
}

// ---------------------------------------------------------------------------
// 공용 헬퍼
// ---------------------------------------------------------------------------

function lessonData(data) {
  const L = data && data.lesson;
  if (!L || !L.lesson || !L.zones) throw new Error("data.lesson 이 없습니다 (data/lesson.json)");
  return L;
}

function playerById(state, id) {
  const p = (state.players || []).find((x) => x.id === id);
  if (!p) throw new Error(`선수 '${id}' 을(를) 찾을 수 없습니다`);
  return p;
}

function growthOf(p, stat) {
  const g = Number(p.growth && p.growth[stat]);
  return Number.isFinite(g) ? g : 1;
}

function assertLesson(state) {
  const L = state && state.lesson;
  if (!L) throw new Error("레슨 중이 아닙니다");
  return L;
}

/** 행동할 수 있는 상태인가 (phase 가 있으면 lesson, 레슨 status playing) */
function assertPlaying(state) {
  if (state.phase !== undefined && state.phase !== null && state.phase !== "lesson") {
    throw new Error(`이 행동은 phase 'lesson' 에서만 할 수 있습니다 (지금: '${state.phase}')`);
  }
  const L = assertLesson(state);
  if (L.status !== "playing") throw new Error(`레슨이 이미 끝났습니다 (${L.status})`);
  if (surprisePending(L)) throw new Error("레슨 깜짝 이벤트의 선택지를 먼저 고르세요 (resolveSurprise)");
  return L;
}

/** 기다리는 깜짝 이벤트 (없으면 null) */
function surprisePending(L) {
  return (L && L.surprise && L.surprise.pending) || null;
}

/** 이번 레슨의 남은 턴을 쉬는 선수 (깜짝 "남은 턴 쉼" — 없으면 빈 배열) */
function restedOf(L) {
  return Array.isArray(L.rested) ? L.rested : [];
}

/** 결장이거나 쉬는 중 (흩어지기 · 기본 훈련 · 벤치에서 빠진다) */
function isAway(L, id) {
  return L.out.includes(id) || restedOf(L).includes(id);
}

/** 카드 이름 접두 "'카드': " 를 뗀 오류 문구 (미리보기 reason 용) */
function plainReason(msg) {
  return String(msg || "").replace(/^'[^']*':\s*/, "");
}

/**
 * 레슨 카드 uid → { uid, cardId, plus }. k* = 덱 (state.deck), t* = 임시 대비 카드 (lesson.temp).
 * @param {object} state
 * @param {string} uid
 */
export function lessonEntry(state, uid) {
  const L = state.lesson;
  const list = typeof uid === "string" && uid.startsWith("t") ? (L && L.temp) || [] : state.deck || [];
  const e = list.find((x) => x.uid === uid);
  if (!e) throw new Error(`카드 '${uid}' 을(를) 찾을 수 없습니다`);
  return { uid, cardId: e.cardId, plus: !!e.plus };
}

/**
 * 덱 항목의 카드 정의를 해석한다 (코치 카드는 그 코치의 유대로 bond80 판정). 매번 새 객체.
 * @param {object} state
 * @param {object} data
 * @param {{ cardId: string, plus?: boolean }} entry
 */
export function resolveEntry(state, data, entry) {
  const raw = cards.getCard(data, entry.cardId);
  let bond = 0;
  if (raw.family === "coach" && raw.coach) {
    const st = (state.supports || []).find((s) => s.id === raw.coach.supportId);
    bond = st ? Number(st.bond) || 0 : 0;
  }
  // 코치 지원이 붙은 카드는 이번 턴만 강화판 (§15.2 — 덱의 plus 는 바꾸지 않는다)
  const cur = entry.uid != null && state.lesson ? attachOf(state.lesson).cur : null;
  const attachPlus = !!cur && cur.uid === entry.uid && cur.upgrade === "plus";
  return cards.resolveCardDef(data, raw, { plus: (!!entry.plus || attachPlus) && cards.canUpgrade(raw), bond });
}

/** uid 의 카드 정의 (lessonEntry + resolveEntry) */
export function lessonCardDef(state, data, uid) {
  return resolveEntry(state, data, lessonEntry(state, uid));
}

/** 이 uid 가 charId 주인의 고유 카드인가 */
function isUniqueOf(state, data, uid, charId) {
  const c = cards.getCard(data, lessonEntry(state, uid).cardId);
  return c.family === "unique" && c.ownerCharId === charId;
}

function supportFailReduction(data, supportId) {
  const sp = (data.supports || []).find((s) => s.id === supportId);
  return sp ? Number(sp.failRateReduction) || 0 : 0;
}

// ---------------------------------------------------------------------------
// 코치 지원 (§15.1 ~ §15.5) — 공용 헬퍼
// ---------------------------------------------------------------------------

/** attach 가 없는 저장본 (C1 전) 을 읽을 때의 빈 값 — 이번 레슨은 붙기 없음 (§15.5) */
const EMPTY_ATTACH = Object.freeze({ turns: Object.freeze([]), cur: null, count: Object.freeze({}), log: Object.freeze([]), hints: Object.freeze([]) });

function newAttach() {
  return { turns: [], cur: null, count: {}, log: [], hints: [] };
}

/** 읽기용 lesson.attach (없으면 빈 값, 상태를 바꾸지 않는다) */
function attachOf(L) {
  return (L && L.attach) || EMPTY_ATTACH;
}

/** 쓰기용 lesson.attach (없으면 만든다) */
function attachState(L) {
  if (!L.attach) L.attach = newAttach();
  return L.attach;
}

/** data.lesson.attach (없으면 {}) — 수치 읽기용 */
function attachData(data) {
  return (data && data.lesson && data.lesson.attach) || {};
}

/** 붙기가 켜져 있으면 data.lesson.attach, 아니면 null */
function attachCfg(data) {
  const A = attachData(data);
  return A.enabled ? A : null;
}

/**
 * 코치의 지원 능력 (data.lesson.attach.abilities[supportId]) — 없으면 null.
 * @param {object} data
 * @param {string} supportId
 * @returns {{ name: string, text: string, needs?: string, mods?: object, effects?: object[] }|null}
 */
export function attachAbility(data, supportId) {
  const ab = attachData(data).abilities;
  return (ab && ab[supportId]) || null;
}

/** 붙을 수 있는 편성 코치 (능력이 있는 코치, 편성 순서) */
function attachCoaches(state, data) {
  return (state.supports || []).filter((st) => attachAbility(data, st.id));
}

function supportDef(data, supportId) {
  return (data.supports || []).find((s) => s.id === supportId) || null;
}

/** "코치 하르나" → "하르나" (이름의 마지막 낱말) */
function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || String(name || "");
}

/** 코치의 코치 카드 타입 (없으면 supports.json type) */
function coachTypeOf(data, supportId) {
  const c = cards.cardList(data).find((x) => x.family === "coach" && x.coach && x.coach.supportId === supportId);
  if (c) return c.coach.type;
  const sc = supportDef(data, supportId);
  return sc ? sc.type : null;
}

/** 코치 이름 · 짧은 이름 · 색 · 타입 */
function coachInfo(data, supportId) {
  const sc = supportDef(data, supportId);
  const name = sc ? sc.name : supportId;
  return { supportId, name, short: shortName(name), color: (sc && sc.portraitColor) || null, coachType: coachTypeOf(data, supportId) };
}

/** 이 uid 에 지금 붙은 지원 { cur, ability } | null */
function attachOn(state, data, uid) {
  const cur = attachOf(state.lesson).cur;
  if (!cur || cur.uid !== uid) return null;
  const ability = attachAbility(data, cur.supportId);
  return ability ? { cur, ability } : null;
}

/** 붙은 카드의 위력 배율 (upgrade "pct" 면 1 + overPct, 아니면 1) */
function attachPowerMult(data, att) {
  return att && att.cur.upgrade === "pct" ? 1 + (Number(attachData(data).overPct) || 0) : 1;
}

/** 능력 needs 로 붙을 수 있는 손패 카드인가 (§15.1 ② — 낼 수 없는 카드에는 붙지 않는다) */
function attachable(state, data, uid, needs) {
  const def = lessonCardDef(state, data, uid);
  if (cards.deadReason(state, def)) return false;
  if (!needs) return true;
  if (!Number.isFinite(def.power) || def.target.kind === "none" || cards.isHealSingle(def)) return false;
  if (needs === "fail" && def.mods && def.mods.noFail) return false;
  return true;
}

/** 붙는 순간의 강화 방식 (§15.2): 강화 전 · 강화 가능 → plus / 위력 있음 → pct / 그 밖 → none */
function attachUpgradeOf(state, data, uid) {
  const entry = lessonEntry(state, uid);
  const raw = cards.getCard(data, entry.cardId);
  if (!entry.plus && cards.canUpgrade(raw)) return "plus";
  return Number.isFinite(resolveEntry(state, data, entry).power) ? "pct" : "none";
}

/** 이 uid 가 그 코치 자신의 코치 카드인가 */
function isOwnCoachCard(state, data, uid, supportId) {
  const c = cards.getCard(data, lessonEntry(state, uid).cardId);
  return c.family === "coach" && !!c.coach && c.coach.supportId === supportId;
}

/**
 * 붙을 턴 정하기 (§15.1 ① — startLesson, 덱 섞기 뒤 · 1턴 시작 전). 코치가 없거나 꺼져 있으면 rng 를 쓰지 않는다.
 */
function planAttachTurns(state, data, rng) {
  const L = state.lesson;
  L.attach = newAttach();
  const cfg = attachCfg(data);
  if (!cfg || !attachCoaches(state, data).length) return;
  const k = Math.min(rng.int(cfg.count.min, cfg.count.max), L.turns);
  const all = Array.from({ length: L.turns }, (_, i) => i + 1);
  L.attach.turns = rng.shuffle(all).slice(0, k).sort((a, b) => a - b);
}

/**
 * 붙이기 (§15.1 ② — beginTurn, 죽은 카드 다시 뽑기 뒤). 후보가 없으면 다음 턴으로 미룬다.
 * 코치 = 레어도 가중 × (이번 레슨 붙은 적 있으면 repeatWeight), 카드 = 후보 균등 (그 코치 자신의 코치 카드 ×ownCardWeight).
 */
function attachTurn(state, data, rng, fx) {
  const L = state.lesson;
  const A = attachState(L);
  A.cur = null;
  const cfg = attachCfg(data);
  if (!cfg || !A.turns.includes(L.turn)) return;
  const pairs = [];
  for (const st of attachCoaches(state, data)) {
    const ab = attachAbility(data, st.id);
    const cands = L.hand.filter((uid) => attachable(state, data, uid, ab.needs));
    if (cands.length) pairs.push({ st, cands });
  }
  if (!pairs.length) {
    const next = L.turn + 1;
    if (next <= L.turns && !A.turns.includes(next)) {
      A.turns.push(next);
      A.turns.sort((a, b) => a - b);
    }
    return;
  }
  const rw = cfg.rarityWeight || {};
  const pick = rng.weighted(pairs, (x) => {
    const sc = supportDef(data, x.st.id);
    return (Number(rw[sc && sc.rarity]) || 0) * (A.count[x.st.id] ? cfg.repeatWeight : 1);
  });
  const supportId = pick.st.id;
  const uid = rng.weighted(pick.cands, (u) => (isOwnCoachCard(state, data, u, supportId) ? cfg.ownCardWeight : 1));
  const upgrade = attachUpgradeOf(state, data, uid);
  A.cur = { uid, supportId, turn: L.turn, upgrade };
  A.count[supportId] = (A.count[supportId] || 0) + 1;
  A.log.push({ turn: L.turn, supportId, uid, cardId: lessonEntry(state, uid).cardId, played: false });
  L.stats.attaches = (L.stats.attaches || 0) + 1;
  fx.push({ t: "attach", uid, supportId, upgrade });
}

/** 능력 노트 문구 (§15.5 — "하르나 지원 · 슈팅 구역 ×1.5") */
function attachNote(state, data, supportId, ability) {
  const L = state.lesson;
  const parts = [];
  const m = ability.mods || {};
  if (m.lessonMult) parts.push(`${m.lessonMult.stats.map((x) => STAT_LABELS[x] || x).join("·")} 구역 ×${fmt(m.lessonMult.mult)}`);
  if (m.noFail) parts.push("실패 없음");
  if (m.underdog) parts.push(L.score < L.target ? `목표 미만 ×${fmt(1 + m.underdog)}` : "목표 이상이라 효과 없음");
  for (const e of ability.effects || []) {
    switch (e.type) {
      case "drawNext": parts.push(`다음 턴 손패 +${e.n}`); break;
      case "teamwork": parts.push(`팀워크 +${e.n}`); break;
      case "hint": parts.push(`힌트 ${Math.round(e.chance * 100)}%`); break;
      case "heal": parts.push(`${e.to === "targets" ? "대상 " : ""}체력 +${e.n}`); break;
      case "condition": parts.push(`컨디션 +${e.n}${e.chance != null && e.chance < 1 ? ` ${Math.round(e.chance * 100)}%` : ""}`); break;
      case "nextPct": parts.push(`다음 카드 +${Math.round(e.pct * 100)}%`); break;
      default: parts.push(e.type); break;
    }
  }
  return [`${coachInfo(data, supportId).short} 지원`, ...parts].join(" · ");
}

function addStamina(p, n, fx, src) {
  const before = Number(p.stamina) || 0;
  p.stamina = clamp(before + n, 0, 100);
  const d = p.stamina - before;
  if (d !== 0 && fx) fx.push(src ? { t: "heal", id: p.id, n: d, src } : { t: "heal", id: p.id, n: d });
  return d;
}

function addTeamwork(state, n, fx) {
  const before = Number(state.teamwork) || 0;
  state.teamwork = clamp(before + n, 0, 100);
  const d = state.teamwork - before;
  if (d !== 0 && fx) fx.push({ t: "tw", n: d });
  return d;
}

function setBuff(L, key, value, fx) {
  const from = L.buffs[key];
  if (from === value) return;
  L.buffs[key] = value;
  if (fx) fx.push({ t: "buff", key, from, to: value });
}

function addTo(map, id, n) {
  map[id] = (map[id] || 0) + n;
}

/** 구역 상승 배율: 중점 구역이면 focus.mult (특별이면 specialMult), 아니면 1 (§14.4 · §14.7) */
export function zoneMult(L, data, zone) {
  const F = lessonData(data).lesson.focus;
  if (zone !== L.zone) return 1;
  return L.special ? F.specialMult : F.mult;
}

/** 컨디션 × (1 + Σ훈련 효율) — 카드 · 기본 훈련 공통 */
function commonMult(state, data) {
  return trainingMult(data.config, Number(state.condition) || 0) * (1 + getModifier(state, "trainingEfficiency"));
}

// ---------------------------------------------------------------------------
// 흩어지기 · 기본 훈련 · 벤치 (§14.3 · §14.4 · §14.5)
// ---------------------------------------------------------------------------

/**
 * 흩어지기 (§14.3): 결장이 아닌 선수마다 (slot 순서) rng.next() 1번으로 구역을 고른다.
 * 가중치 = data.lesson.zones.weights[배치 포지션][구역] × (중점 구역이면 focus.weight). 결과는 lesson.zones 에 저장한다.
 * @param {object} state 레슨 중 (state.lesson)
 * @param {object} data
 * @param {object} rng createRng 결과
 * @returns {Object<string,string>} { 선수 id: 구역 }
 */
export function scatterZones(state, data, rng) {
  const L = state.lesson;
  const LD = lessonData(data);
  const cfg = LD.zones;
  const fw = LD.lesson.focus.weight;
  const out = {};
  for (const p of state.players) {
    if (isAway(L, p.id)) continue; // 결장 · 쉬는 선수 (깜짝 "남은 턴 쉼") 는 흩어지지 않는다
    out[p.id] = rng.weighted(zones.ZONE_IDS, (z) => zones.zoneWeight(cfg, p.position, z, L.zone, fw));
  }
  L.zones = out;
  return out;
}

/** 기본 훈련 1인 단위 = base.gain + 분위기 × moodK × cardGainScale (§14.4) */
function baseUnit(state, data) {
  const LD = lessonData(data);
  const mood = Number(state.lesson.buffs.mood) || 0;
  return LD.lesson.base.gain + mood * LD.buffs.moodK * LD.lesson.cardGainScale;
}

/**
 * 이번 턴 끝 기본 훈련 예상 (상한 1000 에 잘린 값). 경기장 선수가 아니면 0.
 * @returns {{ zone: string|null, g: number, gain: number }}
 */
function baseGainOf(state, data, p) {
  const L = state.lesson;
  const z = L.zones && L.zones[p.id];
  if (!z || isAway(L, p.id) || (L.bench || []).includes(p.id)) return { zone: z || null, g: 0, gain: 0 };
  const g = rnd(baseUnit(state, data) * growthOf(p, z) * zoneMult(L, data, z) * commonMult(state, data));
  const gain = Math.max(0, Math.min(g, data.config.statCap - p.stats[z]));
  return { zone: z, g, gain };
}

/**
 * 턴 끝 ① 기본 훈련 · ② 벤치 회복.
 * 기본 훈련: 경기장 선수마다 그 구역 스탯 + g (부 스탯 없음, 실패 · 부상 없음, 대상 횟수에 세지 않음), 체력 −base.stamina.
 * 분위기 몫은 moodGains, 나머지는 baseGains (§14.4). 벤치: 체력 +bench.recover, benchTurns +1.
 */
function turnEndTraining(state, data, fx) {
  const L = state.lesson;
  const ls = lessonData(data).lesson;
  const unit = baseUnit(state, data);
  for (const p of state.players) {
    const b = baseGainOf(state, data, p);
    if (!b.zone || isAway(L, p.id) || L.bench.includes(p.id)) continue;
    if (b.gain > 0) {
      p.stats[b.zone] += b.gain;
      L.score += b.gain;
      const basePart = rnd((b.gain * ls.base.gain) / unit);
      addTo(L.baseGains, p.id, basePart);
      addTo(L.moodGains, p.id, b.gain - basePart);
      fx.push({ t: "base", id: p.id, stat: b.zone, n: b.gain });
    }
    const before = Number(p.stamina) || 0;
    p.stamina = clamp(before - ls.base.stamina, 0, 100);
    if (before !== p.stamina) fx.push({ t: "cost", id: p.id, n: before - p.stamina, src: "base" });
  }
  for (const id of L.bench) {
    const p = playerById(state, id);
    addTo(L.benchTurns, id, 1);
    addStamina(p, ls.bench.recover, fx, "bench");
  }
}

// ---------------------------------------------------------------------------
// 방침 버프 — 읽는 쪽 (§14.7 3 · 4 · 6번). 버프가 0이면 영향 없음.
// ---------------------------------------------------------------------------

/** 1인 위력에 더하는 집중 몫: focus × focusPer × (focusX2 ? 2 : 1) / 행 수 (고유 카드 가로지르기는 2행, 그 밖은 |T|) */
function focusShare(data, L, ctx) {
  if (!ctx.n) return 0;
  const B = lessonData(data).buffs;
  return (L.buffs.focus * B.focusPer * (ctx.mods.focusX2 ? 2 : 1)) / ctx.nRows;
}

/** 압박 비용 배율: 1 + pressCostK × press (noPressCost always · atLeast2 && press ≥ 2 → 1) */
function pressCostMultOf(data, L, mods) {
  const press = L.buffs.press || 0;
  if (mods.noPressCost === "always") return 1;
  if (mods.noPressCost === "atLeast2" && press >= 2) return 1;
  return 1 + lessonData(data).buffs.pressCostK * press;
}

/** 방침 배율 (run 방침이 맞을 때만, T ≠ ∅ 일 때만) — §14.11 */
function policyMult(state, data, L, ctx) {
  if (!ctx.n) return 1;
  const B = lessonData(data).buffs;
  switch (state.policy) {
    case "counter":
      return ctx.hasAttackZone ? 1 + (ctx.mods.stealPer ?? B.stealPer) * (L.buffs.steal || 0) : 1;
    case "poss":
      return 1 + B.possK * (L.buffs.poss || 0) * (ctx.mods.possX2 ? 2 : 1);
    case "press":
      return 1 + B.pressK * (L.buffs.press || 0);
    default:
      return 1;
  }
}

// ---------------------------------------------------------------------------
// 방침 버프 — 바꾸는 쪽: 버프 effects · 방침 패시브 · 분위기 감소 · 칩 · 미리보기 노트
// ---------------------------------------------------------------------------

/** 버프 effects (hojo · focus · mood · moodX2 · noDecay · steal · press · pressDrop · poss · possGuard · routine) */
export const BUFF_EFFECT_TYPES = ["hojo", "focus", "mood", "moodX2", "noDecay", "steal", "press", "pressDrop", "poss", "possGuard", "routine"];

/** 방침 → 그 방침의 버프 키 (data/policies.json 이 없을 때의 기본값) */
const POLICY_BUFFS_FALLBACK = { ace: ["hojo", "focus"], team: ["mood"], counter: ["steal"], press: ["press"], poss: ["poss"] };

/** 버프 칩 순서와 라벨 (뷰 chips 의 label) */
export const BUFF_CHIP_LABELS = {
  hojo: "호조", focus: "집중", routine: "루틴", mood: "분위기", noDecay: "분위기 유지",
  steal: "탈취", press: "압박", poss: "점유", possGuard: "점유 가드",
  nextPct: "다음 카드", nextPairPct: "다음 작은 원", nextNoFail: "실패 없음", nextCostZero: "비용 0",
};

/** 배율 · 소수 표시 (소수 둘째 자리까지, 끝의 0 은 뺀다) */
function fmt(x) {
  return String(Math.round(x * 100) / 100);
}

/** 숫자 뒤 목적격 조사 (한국어 읽기: 0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 → 을, 그 밖 → 를) */
function objParticle(n) {
  const d = Math.abs(Math.trunc(n)) % 10;
  return [0, 1, 3, 6, 7, 8].includes(d) ? "을" : "를";
}

/** 이 run 의 방침이 가진 버프 키 */
function policyBuffKeys(state, data) {
  const list = (data.policies && data.policies.policies) || [];
  const p = list.find((x) => x.id === state.policy);
  if (p && Array.isArray(p.buffs)) return p.buffs;
  return POLICY_BUFFS_FALLBACK[state.policy] || [];
}

/**
 * 버프 effect 1개. 카드에 적힌 효과라서 방침과 관계없이 늘 적용한다 (D38).
 * 상한: steal ≤ stealCap, press ≤ pressCap, poss ≤ possCap. 분위기 · 호조 · 집중 · 가드는 상한 없이 쌓인다.
 */
function applyBuffEffect(state, data, e, play) {
  const L = state.lesson;
  const B = lessonData(data).buffs;
  const fx = play.fx;
  const v = (k) => Number(L.buffs[k]) || 0;
  switch (e.type) {
    case "hojo":
    case "focus":
    case "mood":
    case "possGuard":
      setBuff(L, e.type, v(e.type) + e.n, fx);
      return;
    case "moodX2":
      setBuff(L, "mood", v("mood") * 2, fx);
      return;
    case "noDecay":
      setBuff(L, "noDecay", Math.max(v("noDecay"), e.turns), fx);
      return;
    case "routine":
      setBuff(L, "routine", Math.max(v("routine"), e.n), fx);
      return;
    case "steal":
      setBuff(L, "steal", Math.min(B.stealCap, v("steal") + e.n), fx);
      return;
    case "press":
      setBuff(L, "press", Math.min(B.pressCap, v("press") + e.n), fx);
      return;
    case "poss":
      setBuff(L, "poss", Math.min(B.possCap, v("poss") + e.n), fx);
      return;
    case "pressDrop": {
      const dropped = v("press");
      if (dropped > 0) for (const p of cards.activePlayers(state)) addStamina(p, rnd(dropped * e.perStage), fx);
      setBuff(L, "press", 0, fx);
      return;
    }
    default:
      throw new Error(`알 수 없는 버프 effect '${e.type}'`);
  }
}

/**
 * 방침 패시브 (§14.11). run 의 방침이 맞을 때만, 그리고 T ≠ ∅ 일 때만 (D38).
 *   counter: T 에 공격 구역 선수가 있으면 탈취를 쓴다 (steal → 0, 실패해도). 쓴 탈취가 1 이상이면 play.consumed = true.
 *            T 가 전부 수비 구역이고 실패자가 없으면 steal = min(cap, steal + (stealBuild ?? 1)).
 *   poss:    실패자 → (가드가 있으면 가드 −1, 아니면 poss 0) / 성공 + 패스 구역 → +1 / 성공 + 패스 구역 없음 → −possNoPass (possKeep 이면 유지).
 *   press:   실패자 → press 0.
 */
function applyPolicyPassive(state, data, play) {
  play.consumed = false;
  if (!play.T.length) return;
  const L = state.lesson;
  const B = lessonData(data).buffs;
  const { ctx, fx } = play;
  const failed = !!play.failerId;
  const v = (k) => Number(L.buffs[k]) || 0;
  switch (state.policy) {
    case "counter":
      if (ctx.hasAttackZone) {
        if (v("steal") > 0) {
          play.consumed = true;
          setBuff(L, "steal", 0, fx);
        }
      } else if (ctx.allDefenseZone && !failed) {
        setBuff(L, "steal", Math.min(B.stealCap, v("steal") + (ctx.mods.stealBuild ?? 1)), fx);
      }
      return;
    case "poss":
      if (failed) {
        if (v("possGuard") > 0) setBuff(L, "possGuard", v("possGuard") - 1, fx);
        else setBuff(L, "poss", 0, fx);
      } else if (ctx.hasPassZone) {
        setBuff(L, "poss", Math.min(B.possCap, v("poss") + 1), fx);
      } else if (!ctx.mods.possKeep) {
        setBuff(L, "poss", Math.max(0, v("poss") - B.possNoPass), fx);
      }
      return;
    case "press":
      if (failed) setBuff(L, "press", 0, fx);
      return;
    default:
      return;
  }
}

/** 턴 끝 ③ 분위기 감소: noDecay > 0 이면 noDecay −1 (감소 없음), 아니면 mood −1 (0 에서 멈춘다). 방침과 관계없다. */
function turnEndBuffs(state, data, fx) {
  const L = state.lesson;
  const mood = Number(L.buffs.mood) || 0;
  if ((Number(L.buffs.noDecay) || 0) > 0) setBuff(L, "noDecay", L.buffs.noDecay - 1, fx);
  else if (mood > 0) setBuff(L, "mood", mood - 1, fx);
}

/** 분위기 n 스택의 기본 훈련 1인 몫 (= n × moodK × cardGainScale, 소수 1자리 문구) — §14.4 · §14.11 */
function moodBaseText(data, n) {
  const LD = lessonData(data);
  return (Math.round(n * LD.buffs.moodK * LD.lesson.cardGainScale * 10) / 10).toFixed(1);
}

/** 버프 칩 1개의 값 문구 (분위기: "3 · 기본 +2.9" — 라벨과 합쳐 "분위기 3 · 기본 +2.9") */
function chipValue(data, key, val) {
  const B = lessonData(data).buffs;
  switch (key) {
    case "mood": return val > 0 ? `${val} · 기본 +${moodBaseText(data, val)}` : String(val);
    case "hojo": return `${val}장`;
    case "routine": return `+${val}`;
    case "noDecay": return `${val}턴`;
    case "steal": return `${val}/${B.stealCap}`;
    case "press": return `${val}/${B.pressCap}`;
    case "poss": return `${val}/${B.possCap}`;
    case "nextPct":
    case "nextPairPct": return `+${Math.round(val * 100)}%`;
    case "nextNoFail":
    case "nextCostZero": return "다음 1장";
    default: return String(val);
  }
}

/** 뷰의 버프 칩: 방침에 맞는 버프는 0 이어도, 그 밖은 0 이 아니거나 켜진 것만. 순서는 BUFF_CHIP_LABELS. */
function buffChips(state, data) {
  const L = state.lesson;
  const mine = policyBuffKeys(state, data);
  const chips = [];
  for (const key of Object.keys(BUFF_CHIP_LABELS)) {
    const val = L.buffs[key];
    const on = typeof val === "boolean" ? val : (Number(val) || 0) !== 0;
    if (!on && !mine.includes(key)) continue;
    chips.push({ key, label: BUFF_CHIP_LABELS[key], value: chipValue(data, key, typeof val === "boolean" ? val : Number(val) || 0), policy: mine.includes(key) });
  }
  return chips;
}

/**
 * 미리보기 노트 문구 (§14.11). plan 은 planPlay 결과 (카드를 내기 전 상태 기준).
 */
function previewNotes(state, data, plan) {
  const L = state.lesson;
  const BD = lessonData(data).buffs;
  const B = L.buffs;
  const v = (k) => Number(B[k]) || 0;
  const { ctx } = plan;
  const notes = [];
  if (ctx.n) {
    if (v("hojo") > 0) notes.push(`호조 ×${fmt(BD.hojoMult)} (남은 ${v("hojo")}장)`);
    if (v("focus") > 0) {
      const share = (v("focus") * BD.focusPer * (ctx.mods.focusX2 ? 2 : 1)) / ctx.nRows;
      notes.push(`집중 ${v("focus")}${ctx.mods.focusX2 ? " ×2" : ""} → 1인 위력 +${fmt(share)}`);
    }
    if ((plan.kind === "single" || plan.kind === "owner") && v("routine") > 0) notes.push(`루틴 → 위력 +${v("routine")}`);
    if (v("press") > 0) {
      notes.push(plan.pressCostMult === 1 ? `압박 ${v("press")} · 비용 증가 없음` : `압박 ${v("press")} · 비용 ×${fmt(plan.pressCostMult)}`);
    }
    const failRisk = plan.f > 0;
    switch (state.policy) {
      case "counter":
        if (ctx.hasAttackZone && v("steal") > 0) {
          notes.push(`탈취 ${v("steal")} → ×${fmt(1 + (ctx.mods.stealPer ?? BD.stealPer) * v("steal"))} (공격 구역 대상 있음)`);
        } else if (ctx.allDefenseZone && v("steal") < BD.stealCap) {
          notes.push(`성공하면 탈취 +${Math.min(BD.stealCap - v("steal"), ctx.mods.stealBuild ?? 1)} (모두 수비 구역)`);
        }
        break;
      case "poss":
        if (v("poss") > 0) notes.push(`점유 ${v("poss")} → ×${fmt(1 + BD.possK * v("poss") * (ctx.mods.possX2 ? 2 : 1))}`);
        if (failRisk && v("poss") > 0) {
          notes.push(v("possGuard") > 0 ? `실패해도 점유 유지 (가드 ${v("possGuard")})` : `실패하면 점유 ${v("poss")}${objParticle(v("poss"))} 잃음`);
        }
        if (ctx.hasPassZone) {
          if (v("poss") < BD.possCap) notes.push("성공하면 점유 +1");
        } else if (ctx.mods.possKeep) {
          if (v("poss") > 0) notes.push("패스 구역 대상 없어도 점유 유지");
        } else if (v("poss") > 0) {
          notes.push(`점유 −${Math.min(v("poss"), BD.possNoPass)} (패스 구역 대상 없음)`);
        }
        break;
      case "press":
        if (v("press") > 0) {
          notes.push(`압박 ${v("press")} → ×${fmt(1 + BD.pressK * v("press"))}`);
          if (failRisk) notes.push("실패하면 압박 0");
        }
        break;
      default:
        break;
    }
  } else {
    let mood = v("mood");
    for (const e of plan.effects) {
      if (e.type === "pressDrop" && v("press") > 0) notes.push(`압박 ${v("press")} → 0 · 출전 선수 체력 +${rnd(v("press") * e.perStage)}`);
      if (e.type === "mood") mood += e.n;
      if (e.type === "moodX2") mood *= 2;
    }
    // 분위기 → 턴 끝 기본 훈련 1인 몫 (§14.11 팀형 — 효과는 방침과 관계없이 붙는다, D38)
    if (mood !== v("mood")) notes.push(`분위기 ${v("mood")} → ${mood} · 기본 +${moodBaseText(data, mood)}`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// 카드 계산 (순수) — §14.7 1~6번 · 8번의 상승 값
// ---------------------------------------------------------------------------

/**
 * 카드 1장을 냈을 때의 계산 (rng 없음, 상태 변경 없음). 잘못된 입력은 throw.
 * 상승은 행(row)마다: 보통 카드는 대상 1명 = 1행, 고유 카드는 모양의 행 (cards.shapePlan — 가로지르기는 주인 2행, §16.3 ③).
 * 비용 · 실패 · 팀워크 · 대상 횟수는 서로 다른 선수(T) 단위. 행의 cost 는 그 선수의 첫 행에만 (두 번째 행은 0 — Σ cost = 실제 비용).
 * @param {object} state
 * @param {object} data
 * @param {string} uid
 * @param {{ at?: {x,y}, playerId?: string, zone?: string }} args
 * @returns {{ entry, def, kind, T: string[], healId: string|null, effects: object[], rows: object[], f: number,
 *            failerId: string|null, pressCostMult: number, cost: number, ctx: object, buffsBefore: object, shape: object|null }}
 */
function planPlay(state, data, uid, args) {
  const L = state.lesson;
  if (!L.hand.includes(uid)) throw new Error(`카드 '${uid}' 은(는) 손패에 없습니다`);
  const LD = lessonData(data);
  const ls = LD.lesson;
  const cfg = data.config;
  const entry = lessonEntry(state, uid);
  const def = resolveEntry(state, data, entry);
  const kind = def.target.kind;
  const dead = cards.deadReason(state, def);
  if (dead) throw new Error(`'${def.name}': ${dead}`);
  const heal = cards.isHealSingle(def);
  const a = args || {};
  // 고유 카드 = 주인 특성의 모양 (§16.3 ②), 그 밖 = 대상 종류 (§14.6)
  const sp = def.shape ? cards.shapePlan(state, def, a, data) : null;
  const sel = sp ? sp.T : cards.targetsFor(state, def, a, data);
  const T = heal ? [] : sel;
  const healId = heal ? sel[0] : null;
  const effects = def.effects || [];
  const mods = def.mods || {};
  const B = L.buffs;
  const players = T.map((id) => playerById(state, id));
  const rowSpecs = sp ? sp.rows : T.map((id) => ({ id, zone: L.zones[id], role: null, shapeMult: 1 }));
  const n = T.length;
  const att = attachOn(state, data, uid); // 코치 지원 (§15.4)
  const am = (att && att.ability.mods) || {};
  const attPow = attachPowerMult(data, att);
  // 방침 문맥은 행 구역 (옮긴 뒤) 으로 (§16.3 ③ 11번)
  const ctx = {
    n,
    nRows: rowSpecs.length,
    mods,
    smallCircle: n > 0 && cards.isSmallCircle(def),
    hasAttackZone: n > 0 && rowSpecs.some((r) => ATTACK_ZONES.includes(r.zone)),
    allDefenseZone: n > 0 && rowSpecs.every((r) => DEFENSE_ZONES.includes(r.zone)),
    hasPassZone: rowSpecs.some((r) => r.zone === "pass"),
  };

  // 3. 1인 위력 (소수 유지, 행마다). 고유 카드는 주 스탯 배율 없음 (L40), 루틴은 단일 · 주인 행만
  const share = focusShare(data, L, ctx);
  const rowPower = (rs) => {
    let base;
    if (kind === "owner") base = def.power;
    else base = def.power + (mods.perMood || 0) * (B.mood || 0) + (mods.perPress || 0) * (B.press || 0);
    if (kind === "single" || (kind === "owner" && rs.role === "owner")) base += B.routine || 0;
    return base * attPow + share; // 붙은 카드 pct 강화는 focus 몫 전 (§15.2)
  };

  // 4. 비용 (서로 다른 선수 1명당, 강화 전 기본 위력 기준)
  const pcm = pressCostMultOf(data, L, mods);
  const cost = cards.staminaCost(def, { mood: B.mood || 0, press: B.press || 0, pressCostMult: pcm, costZero: !!B.nextCostZero });

  // 5. 실패율 (비용 내기 전 체력)
  const noFail = !!mods.noFail || !!am.noFail || !!B.nextNoFail;
  const injuryMod = getModifier(state, "injuryRate");
  const reduce = def.family === "coach" && def.coach ? supportFailReduction(data, def.coach.supportId) : 0;
  const rates = players.map((p) =>
    noFail ? 0 : clamp(failRateForStamina(cfg, Number(p.stamina) || 0) + injuryMod + (mods.failPlus || 0) - reduce, 0, 0.95),
  );
  const f = n ? Math.max(...rates) : 0;
  let failerId = null;
  if (f > 0) {
    // 실패율 높은 쪽 → 체력 낮은 쪽 → 슬롯 순서 (D21)
    const order = (id) => state.players.findIndex((p) => p.id === id);
    let best = 0;
    for (let i = 1; i < players.length; i++) {
      const p = players[i];
      const b = players[best];
      if (rates[i] > rates[best] ||
        (rates[i] === rates[best] && (p.stamina < b.stamina || (p.stamina === b.stamina && order(p.id) < order(b.id))))) best = i;
    }
    failerId = players[best].id;
  }

  // 6. 배율 M (행마다 — 구역 · 모양 배율에 따라 다르다)
  let M0 = commonMult(state, data);
  if (n && (B.hojo || 0) > 0) M0 *= LD.buffs.hojoMult;
  if (mods.lastTurnX2 && L.turn > L.turns - mods.lastTurnX2) M0 *= 2;
  if (mods.underdog && L.score < L.target) M0 *= 1 + mods.underdog;
  const attUnder = am.underdog && L.score < L.target ? 1 + am.underdog : 1; // 능력 mods 는 카드 mods 와 따로 곱한다
  M0 *= attUnder;
  M0 *= 1 + (B.nextPct || 0) + (ctx.smallCircle ? B.nextPairPct || 0 : 0);
  M0 *= policyMult(state, data, L, ctx);
  M0 *= ls.cardGainScale;

  // 8번의 상승 (실패하지 않았을 때). 실제 오른 양은 상한 1000에 잘린 값 — 같은 선수의 두 행은 앞 행이 오른 뒤 기준.
  const cap = cfg.statCap;
  const running = {};
  const seen = new Set();
  const rows = rowSpecs.map((rs) => {
    const p = playerById(state, rs.id);
    const st = running[p.id] || (running[p.id] = { ...p.stats });
    const z = rs.zone;
    const coach = def.family === "coach" && !!def.coach && def.coach.type === z;
    const focus = z === L.zone;
    let M = M0 * zoneMult(L, data, z) * rs.shapeMult;
    if (coach) M *= ls.coachSameTypeMult;
    if (mods.lessonMult && mods.lessonMult.stats.includes(z)) M *= mods.lessonMult.mult;
    const attLM = am.lessonMult && am.lessonMult.stats.includes(z) ? am.lessonMult.mult : 1;
    M *= attLM;
    const sub = cfg.training.subStatMap[z];
    const power = rowPower(rs);
    const g = rnd(power * growthOf(p, z) * M);
    const gain = Math.max(0, Math.min(g, cap - st[z]));
    st[z] += gain;
    const sg = rnd(g * ls.subGainRatio * growthOf(p, sub));
    const subGain = Math.max(0, Math.min(sg, cap - st[sub]));
    st[sub] += subGain;
    const first = !seen.has(p.id);
    seen.add(p.id);
    return {
      id: p.id, zone: z, stat: z, subStat: sub, power, M, g, gain, subGain, cost: first ? cost : 0, failRate: rates[T.indexOf(p.id)],
      coach, focus, role: rs.role, shapeMult: rs.shapeMult,
      attachMult: att ? attUnder * attLM : 1,
    };
  });

  const attach = att ? { supportId: att.cur.supportId, upgrade: att.cur.upgrade, ability: att.ability } : null;
  return { entry, def, kind, T, healId, effects, rows, f, failerId, pressCostMult: pcm, cost, ctx, buffsBefore: { ...B }, attach, shape: sp };
}

// ---------------------------------------------------------------------------
// 뽑기 · 턴 · 끝 (§14.3)
// ---------------------------------------------------------------------------

function drawOne(L, rng) {
  if (!L.drawPile.length) {
    if (!L.discard.length) return false;
    L.drawPile = rng.shuffle(L.discard);
    L.discard = [];
    if (L.turnLog) L.turnLog.reshuffled = true; // 깜짝 턴 기록 (reshuffledThisTurn)
  }
  L.hand.push(L.drawPile.shift());
  return true;
}

function deadOf(state, data, uid) {
  return cards.deadReason(state, lessonCardDef(state, data, uid));
}

/**
 * 턴 시작: 출전 0명이면 끝, 아니면 ① 벤치 비우기 (깜짝 턴 기록도) ② 흩어지기 ③ 3 + drawNext 장 뽑기 ④ 죽은 카드 다시 뽑기
 * ⑤ playsLeft 1 (+ 깜짝 "다음 턴 추가 사용" nextExtraPlay)
 */
function beginTurn(state, data, rng, fx) {
  const L = state.lesson;
  if (cards.activePlayers(state).length === 0) return finishLesson(state, data, fx); // D45
  L.bench = [];
  if (L.turnLog) L.turnLog = surprise.turnLogBlank();
  const zoneMap = scatterZones(state, data, rng);
  fx.push({ t: "scatter", zones: { ...zoneMap } });
  if (L.turnLog) L.turnLog.emptyAtStart = zones.ZONE_IDS.filter((z) => !Object.values(zoneMap).includes(z));
  const n = lessonData(data).lesson.hand + (L.drawNext || 0);
  L.drawNext = 0;
  L.playsLeft = 1;
  if (L.nextExtraPlay) {
    L.playsLeft += L.nextExtraPlay;
    L.nextExtraPlay = 0;
  }
  L.playedThisTurn = 0;
  for (let i = 0; i < n; i++) if (!drawOne(L, rng)) break;
  const limit = L.drawPile.length + L.discard.length + L.hand.length;
  for (let k = 0; k < limit; k++) {
    const idx = L.hand.findIndex((uid) => deadOf(state, data, uid));
    if (idx < 0) break;
    const [dead] = L.hand.splice(idx, 1);
    L.discard.push(dead);
    if (!drawOne(L, rng)) break;
  }
  fx.push({ t: "draw", uids: L.hand.slice() });
  attachTurn(state, data, rng, fx);
}

/**
 * 턴 끝 (§14.3): ① 기본 훈련 ② 벤치 회복 ③ 분위기 감소 ④ 퍼펙트 판정 ⑤ 손패 버림 ⑥ 마지막 턴이면 끝,
 * ⑦ 레슨 깜짝 (§24.8 — 띄우면 다음 턴을 시작하지 않고 멈춘다), 아니면 다음 턴 시작.
 * forced = 도구 · 테스트가 띄울 깜짝 ({ ev, playerId?, supportId? } — forceSurprise). 없으면 계획 · 조건대로.
 */
function endTurn(state, data, rng, fx, forced = null) {
  const L = state.lesson;
  turnEndTraining(state, data, fx);
  turnEndBuffs(state, data, fx);
  fx.push({ t: "turnEnd", turn: L.turn });
  if (L.score >= L.cap) return finishLesson(state, data, fx);
  L.discard.push(...L.hand);
  L.hand = [];
  if (L.attach) L.attach.cur = null; // 안 낸 지원은 턴 끝에 떨어진다 (§15.1 ③)
  if (L.turn >= L.turns) return finishLesson(state, data, fx);
  if (forced ? fireSurprise(state, data, rng, fx, forced.ev, { ...forced, forced: true }) : checkSurprise(state, data, rng, fx)) return;
  L.turn += 1;
  beginTurn(state, data, rng, fx);
}

// ---------------------------------------------------------------------------
// 레슨 깜짝 이벤트 (L29 · §24.8, E5) — 띄우기 · 레슨 안 효과
// ---------------------------------------------------------------------------

/** 턴 끝 깜짝 확인: 계획 · 범위 → 후보 → 가중치 뽑기 (rng) → 띄우기. 띄웠으면 true */
function checkSurprise(state, data, rng, fx) {
  if (!surprise.shouldCheck(state, data)) return false;
  const list = surprise.candidates(state, data);
  if (!list.length) return false;
  const ev = rng.weighted(list, surprise.surpriseWeight);
  return fireSurprise(state, data, rng, fx, ev, {});
}

/**
 * 깜짝을 띄운다: 주인공 (opts.playerId 가 없으면 후보 중 — 여럿이면 rng) · 코치 (실패 없이 끝난 이번 턴 코치 카드) →
 * lesson.surprise.pending, 런 1회 기록 (usedEventIds), fx { t: "surprise" }. 이번 턴은 더 낼 수 없다.
 */
function fireSurprise(state, data, rng, fx, ev, opts) {
  const L = state.lesson;
  if (!L.surprise) L.surprise = surprise.surpriseBlank();
  let playerId = opts.playerId || null;
  if (!playerId) {
    playerId = surprise.pickSurpriseProtagonist(state, data, ev, rng);
    // 도구가 조건 없이 띄운 것 (forceSurprise) 은 후보가 없으면 결장 · 쉼 아닌 첫 선수
    if (!playerId && opts.forced && ev.who && ev.who.pick && ev.who.pick !== "none") {
      const first = surprise.readyPlayers(state)[0];
      playerId = first ? first.id : null;
    }
  }
  const supportId = opts.supportId || surprise.surpriseCoach(state);
  L.surprise.pending = { eventId: ev.id, playerId, supportId: supportId || null, charIds: surprise.surpriseCharIds(state, ev), turn: L.turn };
  if (!Array.isArray(state.usedEventIds)) state.usedEventIds = [];
  if (!state.usedEventIds.includes(ev.id)) state.usedEventIds.push(ev.id);
  L.playsLeft = 0;
  fx.push({ t: "surprise", eventId: ev.id, playerId, supportId: supportId || null });
  return true;
}

/** 깜짝 효과의 대상 선수 (target player = 주인공 · char:<id> = 그 캐릭터 선수) */
function surpriseTarget(state, e, pend) {
  const t = e.target === undefined ? "player" : e.target;
  if (typeof t === "string" && t.startsWith("char:")) return state.players.find((p) => p.charId === t.slice(5)) || null;
  return pend.playerId ? playerById(state, pend.playerId) : null;
}

/** "+40" · "−20" */
function signedText(n) {
  return n < 0 ? `−${-n}` : `+${n}`;
}

/**
 * 레슨 안 효과 1개 (§24.4.2 — lessonEffects.applyEffects 의 ctx.applyLesson). 결과 한 줄 (한국어) 을 돌려준다.
 *   nextPct (L.buffs.nextPct += pct/100, −100% 아래로는 내려가지 않는다) · nextNoFail · drawNext (다음 턴 손패) ·
 *   extraPlayNext (L.nextExtraPlay → 다음 beginTurn 의 playsLeft) · score (점수에만 — L.surprise.bonus 에도 적는다) ·
 *   buff (지금 방침의 버프 한 단위 × n — key 가 있으면 그 버프, applyBuffEffect 의 상한) ·
 *   restRemaining (L.rested — 남은 턴 대상 · 흩어지기 · 기본 훈련 제외, 벤치에서도 뺀다, 체력 +stamina 지금) · injureNow (injure).
 */
function applyLessonEffect(state, data, e, pend, fx) {
  const L = state.lesson;
  switch (e.type) {
    case "nextPct": {
      const v = Math.max(-1, Math.round(((Number(L.buffs.nextPct) || 0) + e.pct / 100) * 1000) / 1000);
      setBuff(L, "nextPct", v, fx);
      return `다음 카드 위력 ${signedText(e.pct)}%`;
    }
    case "nextNoFail":
      setBuff(L, "nextNoFail", true, fx);
      return "다음 카드 실패 판정 없음";
    case "drawNext":
      L.drawNext = (L.drawNext || 0) + e.n;
      return `다음 턴 손패 +${e.n}`;
    case "extraPlayNext":
      L.nextExtraPlay = (Number(L.nextExtraPlay) || 0) + e.n;
      return `다음 턴 카드 ${e.n}장 더 낼 수 있다`;
    case "score": {
      L.score += e.amount;
      L.surprise.bonus = (Number(L.surprise.bonus) || 0) + e.amount;
      fx.push({ t: "score", n: e.amount, src: "surprise" });
      return `이번 레슨 점수 ${signedText(e.amount)}`;
    }
    case "buff": {
      const keys = policyBuffKeys(state, data);
      const key = e.key || keys[0] || null;
      if (!key) return "방침 버프 없음 (효과 없음)";
      const before = Number(L.buffs[key]) || 0;
      applyBuffEffect(state, data, { type: key, n: e.n }, { fx });
      const after = Number(L.buffs[key]) || 0;
      const label = BUFF_CHIP_LABELS[key] || key;
      return after === before ? `${label} 이미 최대 (효과 없음)` : `${label} ${before} → ${after}`;
    }
    case "restRemaining": {
      const p = surpriseTarget(state, e, pend);
      if (!p) return "쉴 선수 없음";
      if (!isAway(L, p.id)) {
        if (!Array.isArray(L.rested)) L.rested = [];
        L.rested.push(p.id);
        L.bench = L.bench.filter((id) => id !== p.id);
        delete L.zones[p.id];
        fx.push({ t: "rest", id: p.id });
      }
      addStamina(p, Number(e.stamina) || 0, fx, "surprise");
      return `${p.name} 이번 레슨 남은 턴 쉼 (체력 +${Number(e.stamina) || 0})`;
    }
    case "injureNow": {
      const p = surpriseTarget(state, e, pend);
      if (!p) return "결장할 선수 없음";
      if (L.out.includes(p.id)) return `${p.name} 이미 결장 중`;
      L.rested = restedOf(L).filter((id) => id !== p.id);
      injure(state, data, p);
      L.stats.injuries += 1;
      fx.push({ t: "injure", id: p.id, src: "surprise" });
      return `${p.name} 결장 (이번 레슨 남은 턴 · 다음 레슨 1회)`;
    }
    default:
      throw new Error(`알 수 없는 레슨 안 효과 '${e.type}'`);
  }
}

/**
 * 깜짝 턴 기록 (§24.8 — lesson.turnLog 가 있을 때만): 낸 카드 한 줄 { uid, cardId, family, kind (대상 종류), shape (고유 카드 모양),
 * targets (서로 다른 대상), failed (실패 선수 | null), coach (코치 카드의 코치 | null), ownerId (고유 카드 주인 | null) } · 실패 선수 ·
 * 마지막 대상 턴 L.lastTargeted · 연속 대상 L.streak { n, turn } — 단일 카드 대상 · 고유 카드의 주인 · 받는 선수만 센다
 * (원 · 구역의 동료는 세지 않는다 — R6). 같은 턴에 두 번 대상이 돼도 한 번, 지난 턴에 이어지면 +1, 아니면 1 부터.
 */
function recordPlay(L, { uid, def, plan, failerId, ownerId }) {
  const kind = def.target.kind;
  L.turnLog.plays.push({
    uid, cardId: def.id, family: def.family, kind, shape: def.shape ? def.shape.kind : null,
    targets: plan.T.slice(), failed: failerId || null,
    coach: def.family === "coach" && def.coach ? def.coach.supportId : null,
    ownerId: ownerId || null,
  });
  if (failerId && !L.turnLog.failed.includes(failerId)) L.turnLog.failed.push(failerId);
  if (!L.lastTargeted || typeof L.lastTargeted !== "object") L.lastTargeted = {};
  for (const id of plan.T) L.lastTargeted[id] = L.turn;
  if (kind !== "single" && kind !== "owner") return;
  if (!L.streak || typeof L.streak !== "object") L.streak = {};
  const ids = [...new Set(plan.rows.filter((r) => kind === "single" || r.role === "owner" || r.role === "recv").map((r) => r.id))];
  for (const id of ids) {
    const s = L.streak[id];
    if (s && s.turn === L.turn) continue;
    L.streak[id] = { n: s && s.turn === L.turn - 1 ? s.n + 1 : 1, turn: L.turn };
  }
}

/** 레슨 끝: 한나 효과 (결장이 아닌 선수) → 결과 판정 (+ 퍼펙트 체력, 7명) */
function finishLesson(state, data, fx) {
  const L = state.lesson;
  const ls = lessonData(data).lesson;
  if (L.endHeal > 0) for (const p of cards.activePlayers(state)) addStamina(p, L.endHeal, fx);
  if (L.score >= L.cap) {
    L.status = "perfect";
    const bonus = ls.perfectStaminaPerTurn * Math.max(0, L.turns - L.turn);
    if (bonus > 0) for (const p of state.players) addStamina(p, bonus, fx);
  } else {
    L.status = L.score >= L.target ? "clear" : "fail";
  }
  L.playsLeft = 0;
  if (L.attach) L.attach.cur = null;
  fx.push({ t: "end", status: L.status });
}

/** 선수 부상: out 에 넣고 zones · bench 에서 빼고, injuredTurns = max(cur, 1), 그 선수의 고유 카드를 손패 · 더미에서 removed 로 */
function injure(state, data, p) {
  const L = state.lesson;
  if (!L.out.includes(p.id)) L.out.push(p.id);
  delete L.zones[p.id];
  L.bench = L.bench.filter((id) => id !== p.id);
  p.injuredTurns = Math.max(Number(p.injuredTurns) || 0, 1);
  for (const pile of ["hand", "drawPile", "discard"]) {
    L[pile] = L[pile].filter((uid) => {
      if (isUniqueOf(state, data, uid, p.charId)) {
        L.removed.push(uid);
        if (L.attach && L.attach.cur && L.attach.cur.uid === uid) L.attach.cur = null;
        return false;
      }
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// 카드 effects (§14.7 12번)
// ---------------------------------------------------------------------------

function healTargets(state, data, to, play) {
  const active = cards.activePlayers(state);
  switch (to) {
    case "target":
      if (play.healId) return [playerById(state, play.healId)];
      return play.T.length ? [playerById(state, play.T[0])] : [];
    case "all":
      return active;
    case "defense":
      return active.filter((p) => p.position === "GK" || p.position === "DF");
    case "mostTired": {
      let best = null;
      for (const p of active) if (!best || p.stamina < best.stamina) best = p;
      return best ? [best] : [];
    }
    case "owner": {
      const owner = cards.ownerOf(state, play.def);
      return owner ? [owner] : [];
    }
    case "targets": // 이 카드의 대상 T 중 결장이 아닌 선수 전원 (실패자 포함, §15.3)
      return play.T.map((id) => playerById(state, id)).filter((p) => !cards.isOut(state, p));
    default:
      throw new Error(`알 수 없는 heal 대상 '${to}'`);
  }
}

function applyEffect(state, data, e, play) {
  const L = state.lesson;
  const fx = play.fx;
  switch (e.type) {
    case "heal":
      for (const p of healTargets(state, data, e.to, play)) addStamina(p, e.n, fx);
      return;
    case "teamwork":
      addTeamwork(state, e.n, fx);
      return;
    case "nextPct":
      setBuff(L, "nextPct", (L.buffs.nextPct || 0) + e.pct, fx);
      return;
    case "nextPairPct":
      setBuff(L, "nextPairPct", (L.buffs.nextPairPct || 0) + e.pct, fx);
      return;
    case "nextNoFail":
      setBuff(L, "nextNoFail", true, fx);
      return;
    case "nextCostZero":
      setBuff(L, "nextCostZero", true, fx);
      return;
    case "extraPlay":
      play.extraPlay += e.n;
      return;
    case "drawNext":
      L.drawNext = (L.drawNext || 0) + e.n;
      return;
    case "endHeal":
      L.endHeal = (L.endHeal || 0) + e.n;
      return;
    case "lumiFlag":
      L.lumiFlag = true;
      return;
    case "condition": {
      // (chance 가 있으면 rng.chance 성공일 때) 컨디션 +n, 0~4 에서 멈춘다 (§15.3)
      if (e.chance != null && !play.rng.chance(e.chance)) return;
      const before = Number(state.condition) || 0;
      state.condition = clamp(before + e.n, 0, 4);
      const d = state.condition - before;
      if (d !== 0) fx.push(play.supportId ? { t: "condition", n: d, src: "cutin" } : { t: "condition", n: d });
      return;
    }
    case "hint":
      // 코치 지원 능력 전용: 성공하면 그 코치의 힌트 1개를 레슨이 끝날 때 받는다 (lessonRun, §15.5)
      if (!play.supportId) throw new Error("hint 는 코치 지원 능력에만 쓸 수 있습니다");
      if (play.rng.chance(e.chance)) {
        attachState(L).hints.push(play.supportId);
        fx.push({ t: "hint", supportId: play.supportId, src: "cutin" });
      }
      return;
    default:
      if (BUFF_EFFECT_TYPES.includes(e.type)) return applyBuffEffect(state, data, e, play);
      throw new Error(`알 수 없는 effect '${e.type}'`);
  }
}

// ---------------------------------------------------------------------------
// 공개 API — 상태를 바꾸는 함수
// ---------------------------------------------------------------------------

/**
 * 레슨 시작: 중점 구역 · 특별 · 목표 · 상한 → 결장 · 고유 카드 제외 · 대비 카드 → 섞기 → 1턴 시작 (흩어지기 · 뽑기).
 * phase 는 바꾸지 않는다 (lessonRun 이 정한다). 출전 선수가 0명이면 바로 끝난다 (status ≠ playing).
 * @param {object} state RunState (players · deck · season · condition · rngState …)
 * @param {object} data
 * @param {{ zone: string, special?: boolean, prep?: boolean, prepCards?: string[] }} args zone = 중점 구역
 * @returns {object} state
 */
export function startLesson(state, data, { zone, special = false, prep = false, prepCards = [] } = {}) {
  const LD = lessonData(data);
  if (!zones.ZONE_IDS.includes(zone)) throw new Error(`알 수 없는 중점 구역: '${zone}'`);
  if (state.lesson && state.lesson.status === "playing") throw new Error("이미 레슨 중입니다");
  if (!Array.isArray(state.deck)) throw new Error("state.deck 이 없습니다");
  if (!Array.isArray(prepCards)) throw new Error("prepCards 는 배열이어야 합니다");
  for (const id of prepCards) {
    if (cards.getCard(data, id).family !== "prep") throw new Error(`'${id}' 은(는) 대비 카드가 아닙니다`);
  }
  const ls = LD.lesson;
  const si = clamp((Number(state.season) || 1) - 1, 0, ls.turns.length - 1);
  const turns = ls.turns[si];
  let [target, cap] = ls.targets[si];
  if (special) {
    target = rnd(target * ls.special.targetMult);
    cap = rnd(cap * ls.special.capMult);
  }

  const outAtStart = state.players.filter((p) => (Number(p.injuredTurns) || 0) > 0).map((p) => p.id);
  const outChars = new Set(state.players.filter((p) => outAtStart.includes(p.id)).map((p) => p.charId));
  const removed = [];
  const pile = [];
  for (const e of state.deck) {
    const c = cards.getCard(data, e.cardId);
    if (c.family === "unique" && outChars.has(c.ownerCharId)) removed.push(e.uid);
    else pile.push(e.uid);
  }
  const temp = prepCards.map((cardId, i) => ({ uid: `t${i + 1}`, cardId }));
  const before = {};
  for (const p of state.players) before[p.id] = { ...p.stats };

  const rng = createRngFromState(state.rngState);
  state.lesson = {
    zone, special: !!special, prep: !!prep,
    turn: 1, turns, target, cap, score: 0,
    status: "playing",
    playsLeft: 1, playedThisTurn: 0,
    zones: {}, bench: [],
    // L52 배치 씨앗 (§23): 런 seed · 주 번호 해시 — 선수 자리 흔들림에만 쓴다 (rngState 는 건드리지 않는다)
    layoutSeed: zones.layoutSeedOf(state.seed, state.turnIndex),
    drawPile: rng.shuffle([...pile, ...temp.map((t) => t.uid)]), hand: [], discard: [], exhausted: [],
    removed, temp,
    drawNext: 0,
    buffs: emptyBuffs(),
    outAtStart, out: outAtStart.slice(),
    targeted: {},
    baseGains: {}, moodGains: {}, cardGains: {}, subGains: {}, benchTurns: {},
    twAccrued: 0, endHeal: 0, lumiFlag: false,
    before,
    seq: 0, lastFx: [],
    stats: { plays: 0, benches: 0, fails: 0, injuries: 0, attaches: 0, cutins: 0 },
    attach: newAttach(),
  };
  planAttachTurns(state, data, rng);
  // 레슨 깜짝 계획 (§24.8): 켜져 있을 때만 rng 2번 + 깜짝 필드. 꺼져 있으면 필드도 rng 도 없다 (1차와 같은 레슨)
  if (surprise.surpriseCfg(data).enabled) surprise.planSurprise(state.lesson, data, rng);
  const fx = [];
  beginTurn(state, data, rng, fx);
  state.lesson.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 카드 1장 내기 (§14.7). 끝나면 턴 끝이나 레슨 끝까지 진행한다.
 * @param {object} state
 * @param {object} data
 * @param {{ uid: string, at?: {x:number, y:number}, playerId?: string, zone?: string }} args at = 놓은 점 (필드 %),
 *   playerId = 고른 선수 (단일 · 받는 선수), zone = 고른 구역 (고유 카드 자리 옮기기 · 가로지르기)
 * @returns {object} state
 */
export function playCard(state, data, { uid, at, playerId, zone } = {}) {
  const L = assertPlaying(state);
  if (!(L.playsLeft >= 1)) throw new Error("이번 턴에는 더 낼 수 없습니다");
  const plan = planPlay(state, data, uid, { at, playerId, zone }); // 1~6 (검증 포함, 상태 변경 없음)
  const LD = lessonData(data);
  const ls = LD.lesson;
  const rng = createRngFromState(state.rngState);
  const fx = [];
  const { def, T, rows } = plan;
  const att = plan.attach;
  L.hand.splice(L.hand.indexOf(uid), 1);
  L.stats.plays += 1;

  // 0. 코치 컷인 (§15.4 — 비용 fx 보다 앞, repeat = 이번 레슨 앞선 컷인 수)
  if (att) {
    const ci = coachInfo(data, att.supportId);
    fx.push({
      t: "cutin", supportId: att.supportId, uid, cardId: def.id, coach: ci.name,
      name: att.ability.name, text: att.ability.text, repeat: L.stats.cutins || 0,
    });
  }

  // 7. 옮기기 (고유 카드 자리 옮기기 · 가로지르기, §16.3 ③): 비용 · 실패 판정 앞, 성공과 상관없이 — 이미 달려갔다
  const sp = plan.shape;
  if (sp && sp.move) {
    L.zones[sp.move.id] = sp.move.to;
    fx.push({ t: "move", id: sp.move.id, from: sp.move.from, to: sp.move.to });
    if (L.turnLog && !L.turnLog.moved.includes(sp.move.id)) L.turnLog.moved.push(sp.move.id); // 깜짝 턴 기록 (movedThisTurn)
  }

  // 7. 비용 지불 (서로 다른 선수마다 1번)
  for (const id of T) {
    const p = playerById(state, id);
    const before = Number(p.stamina) || 0;
    p.stamina = clamp(before - plan.cost, 0, 100);
    if (before !== p.stamina) fx.push({ t: "cost", id: p.id, n: before - p.stamina });
  }
  if (sp && sp.receiverId) fx.push({ t: "pass", from: sp.ownerId, to: sp.receiverId });

  // 7. 실패 판정 (카드 1장에 1번)
  const failerId = plan.f > 0 && rng.chance(plan.f) ? plan.failerId : null;
  // 실패자의 모든 행은 상승 없음, 손실은 마지막 행 구역 스탯에서 1번 (가로지르기 · 자리 옮기기 = 놓은 구역)
  const failRows = failerId ? rows.filter((r) => r.id === failerId) : [];
  const lossRow = failRows.length ? failRows[failRows.length - 1] : null;

  // 8. 상승 · 실패 (행 구역의 스탯)
  for (const r of rows) {
    const p = playerById(state, r.id);
    if (r.id === failerId) {
      if (r !== lossRow) continue;
      const loss = Math.min(ls.failStatLoss, p.stats[r.stat]);
      p.stats[r.stat] -= loss;
      L.score -= loss;
      addTo(L.cardGains, p.id, -loss);
      L.stats.fails += 1;
      const injured = rng.chance(ls.injuryChanceOnFail);
      if (injured) {
        injure(state, data, p);
        L.stats.injuries += 1;
      }
      fx.push({ t: "fail", id: p.id, stat: r.stat, n: loss, injured });
    } else {
      p.stats[r.stat] += r.gain;
      p.stats[r.subStat] += r.subGain;
      L.score += r.gain;
      addTo(L.cardGains, p.id, r.gain);
      addTo(L.subGains, p.id, r.subGain);
      fx.push({ t: "gain", id: p.id, stat: r.stat, n: r.gain, sub: r.subGain, subStat: r.subStat });
    }
  }

  // 9. L10 팀워크 (|T| ≥ 2 → 성공 인원 − 1, 레슨당 lessonCap 까지)
  if (T.length >= 2) {
    const tw = LD.teamwork;
    const successes = T.length - (failerId ? 1 : 0);
    let add = Math.max(0, successes - 1) * tw.perExtraTarget;
    add = Math.min(add, Math.max(0, tw.lessonCap - L.twAccrued));
    if (add > 0) {
      L.twAccrued += add;
      addTeamwork(state, add, fx);
    }
  }

  // 10. 일회성 버프 소비 (T ≠ ∅)
  if (T.length) {
    if (L.buffs.hojo > 0) setBuff(L, "hojo", L.buffs.hojo - 1, fx);
    setBuff(L, "nextPct", 0, fx);
    setBuff(L, "nextNoFail", false, fx);
    setBuff(L, "nextCostZero", false, fx);
    if (plan.ctx.smallCircle) setBuff(L, "nextPairPct", 0, fx);
  }

  // 11. 방침 패시브 (run 방침이 맞고 T ≠ ∅ 일 때만)
  const play = { ...plan, failerId, consumed: false, extraPlay: 0, fx, rng, supportId: null };
  applyPolicyPassive(state, data, play);

  // 12. 카드 effects
  const success = !failerId;
  for (const e of plan.effects) {
    const when = e.when || "always";
    if (when === "success" && !success) continue;
    if (when === "consume" && !play.consumed) continue;
    applyEffect(state, data, e, play);
  }
  if (def.family === "coach" && def.coach) {
    const st = (state.supports || []).find((s) => s.id === def.coach.supportId);
    if (st) st.bond = clamp(Math.round((Number(st.bond) || 0) + LD.bond.play + getModifier(state, "bondGain")), 0, 100);
  }

  // 12b. 코치 지원 능력 effects (나열 순서 — 카드가 실패해도 발동, rng 는 hint · condition 의 chance 만)
  // 12c. 그 코치 유대 +attach.bond · 13. 기록
  if (att) {
    const aplay = { ...play, supportId: att.supportId };
    for (const e of att.ability.effects || []) applyEffect(state, data, e, aplay);
    play.extraPlay = aplay.extraPlay;
    const st = (state.supports || []).find((s) => s.id === att.supportId);
    if (st) {
      const before = Number(st.bond) || 0;
      st.bond = clamp(Math.round(before + (Number(attachData(data).bond) || 0) + getModifier(state, "bondGain")), 0, 100);
      if (st.bond !== before) fx.push({ t: "bond", supportId: att.supportId, n: st.bond - before });
    }
    const A = attachState(L);
    for (let i = A.log.length - 1; i >= 0; i--) {
      if (A.log[i].uid === uid && A.cur && A.log[i].turn === A.cur.turn) {
        A.log[i].played = true;
        break;
      }
    }
    A.cur = null;
    L.stats.cutins = (L.stats.cutins || 0) + 1;
  }

  // 13. 기록 · 카드 이동 · 퍼펙트 · 사용 횟수
  for (const id of T) L.targeted[id] = (L.targeted[id] || 0) + 1;
  const owner = def.family === "unique" ? cards.ownerOf(state, def) : null;
  if (L.turnLog) recordPlay(L, { uid, def, plan, failerId, ownerId: owner ? owner.id : null });
  if (owner && L.out.includes(owner.id)) L.removed.push(uid);
  else if (def.exhaust) L.exhausted.push(uid);
  else L.discard.push(uid);

  if (L.score >= L.cap) {
    finishLesson(state, data, fx);
  } else {
    L.playedThisTurn += 1;
    L.playsLeft = L.playsLeft - 1 + play.extraPlay;
    if (L.playsLeft <= 0 || L.hand.length === 0) endTurn(state, data, rng, fx);
  }

  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 벤치로 보내기 / 벤치에서 돌아오기 (§14.5). rng 를 쓰지 않는다.
 * 벤치 선수는 이번 턴 기본 훈련이 없고 카드 대상이 될 수 없으며, 턴 끝에 체력 +bench.recover. 한 턴 최대 bench.max 명.
 * 돌아오면 이번 턴 자기 구역 (lesson.zones, 바뀌지 않음) 으로 간다.
 * @param {object} state
 * @param {object} data
 * @param {{ playerId: string, on?: boolean }} args on 기본 true
 * @returns {object} state
 */
export function benchPlayer(state, data, { playerId, on = true } = {}) {
  const L = assertPlaying(state);
  const p = playerById(state, playerId);
  const max = lessonData(data).lesson.bench.max;
  if (on) {
    if (L.out.includes(p.id)) throw new Error(`${p.name || p.id}: 결장 중인 선수는 벤치로 보낼 수 없습니다`);
    if (restedOf(L).includes(p.id)) throw new Error(`${p.name || p.id}: 이번 레슨은 쉬는 중입니다`);
    if (L.bench.includes(p.id)) throw new Error(`${p.name || p.id}: 이미 벤치에 있습니다`);
    if (!L.zones[p.id]) throw new Error(`${p.name || p.id}: 경기장에 없습니다`);
    if (L.bench.length >= max) throw new Error(`벤치는 한 턴에 최대 ${max}명입니다`);
    L.bench.push(p.id);
    L.stats.benches += 1;
    // 깜짝 턴 기록 (benchedThisTurn) · 벤치에 앉으면 연속 대상이 끊긴다 (R6)
    if (L.turnLog && !L.turnLog.benched.includes(p.id)) L.turnLog.benched.push(p.id);
    if (L.streak && L.streak[p.id]) delete L.streak[p.id];
  } else {
    if (!L.bench.includes(p.id)) throw new Error(`${p.name || p.id}: 벤치에 없습니다`);
    L.bench = L.bench.filter((id) => id !== p.id);
    if (L.turnLog) L.turnLog.benched = L.turnLog.benched.filter((id) => id !== p.id);
  }
  L.seq += 1;
  L.lastFx = [{ t: "bench", id: p.id, on: !!on }];
  return state;
}

/**
 * 턴 끝 (카드를 내지 않아도 된다 — 기본 훈련이 늘 있다). 남은 추가 사용은 버린다.
 * @param {object} state
 * @param {object} data
 * @returns {object} state
 */
export function endLessonTurn(state, data) {
  const L = assertPlaying(state);
  const rng = createRngFromState(state.rngState);
  const fx = [];
  L.playsLeft = 0;
  endTurn(state, data, rng, fx);
  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 레슨 깜짝 이벤트 선택지를 고른다 (§24.8). 검사 (기다리는 깜짝 · 선택지 번호 · 글 · 효과 검사) 를 먼저 끝내고 그 뒤에 바꾼다.
 * rng 를 한 번 열어: 효과 (레슨 안 효과 = applyLessonEffect, 런 효과 = lessonEffects — 코치 bond "coach" = 이번 턴 코치 카드의 코치) →
 * fx { t: "surpriseResult", eventId, choice, branch, text, lines } → pending 을 비우고 fired 에 남긴다 →
 * 점수 ≥ 상한이면 레슨 끝 (퍼펙트), 아니면 L.turn + 1 · 다음 턴 시작 → seq · lastFx · rng 저장.
 * phase 이동 (레슨이 끝났으면 보상) 은 lessonRun.resolveSurprise 가 한다.
 * 기다리던 깜짝이 데이터에서 빠졌으면 (저장한 뒤 콘텐츠가 바뀌었다) 선택지는 0 ("계속한다") 하나 — 효과 없이 잇는다 (fired.missing).
 * @param {object} state
 * @param {object} data
 * @param {{ choice: number }} args
 * @returns {object} state
 */
export function resolveSurprise(state, data, { choice } = {}) {
  if (state.phase !== undefined && state.phase !== null && state.phase !== "lesson") {
    throw new Error(`이 행동은 phase 'lesson' 에서만 할 수 있습니다 (지금: '${state.phase}')`);
  }
  const L = assertLesson(state);
  if (L.status !== "playing") throw new Error(`레슨이 이미 끝났습니다 (${L.status})`);
  const pend = surprisePending(L);
  if (!pend) throw new Error("기다리는 레슨 깜짝 이벤트가 없습니다");
  const found = eventById(data, pend.eventId);
  // 저장한 뒤 데이터에서 빠진 깜짝: 효과 없이 "계속한다" 하나 (뷰 = lessonSurprise 의 빈 말풍선)
  const ev = found && found.trigger === "surprise" ? found : null;
  const nChoices = ev ? ev.choices.length : 1;
  const idx = Number(choice);
  if (!Number.isInteger(idx) || idx < 0 || idx >= nChoices) {
    throw new Error(`선택지 번호가 잘못되었습니다: ${choice} (0~${nChoices - 1})`);
  }
  const texts = ev
    ? surprise.surpriseTexts(state, data, ev, pend) // 글을 먼저 (바꾸기 전에 실패하게)
    : { title: "레슨 깜짝", labels: [surprise.MISSING_LABEL], results: [{ then: "", else: "" }] };
  const rng = createRngFromState(state.rngState);
  const fx = [];
  let out = { branch: null, lines: [] };
  if (ev) {
    const ctx = { ...surprise.surpriseCtx(ev, pend), applyLesson: (st, d, e) => applyLessonEffect(st, d, e, pend, fx) };
    out = applyEffects(state, data, ev.choices[idx].effects, ctx, rng); // 검사 실패면 아무것도 바꾸지 않고 throw
  }
  const result = out.branch === "else" ? texts.results[idx].else : texts.results[idx].then;
  fx.push({ t: "surpriseResult", eventId: pend.eventId, choice: idx, branch: out.branch, text: result, lines: out.lines.slice() });
  L.surprise.pending = null;
  L.surprise.fired = {
    eventId: pend.eventId, turn: pend.turn, playerId: pend.playerId || null, supportId: pend.supportId || null,
    choice: idx, branch: out.branch, title: texts.title, label: texts.labels[idx], result, lines: out.lines.slice(),
    ...(ev ? {} : { missing: true }),
  };
  if (L.score >= L.cap) finishLesson(state, data, fx);
  else if (L.turn >= L.turns) finishLesson(state, data, fx);
  else {
    L.turn += 1;
    beginTurn(state, data, rng, fx);
  }
  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

/**
 * 도구 · 테스트용 (장면 · 콘텐츠 검사): 지금 턴을 끝내고 (endLessonTurn 과 같다) 그 깜짝 이벤트를 조건 · 계획과 상관없이 띄운다.
 * 주인공 = opts.playerId, 없으면 그 이벤트의 후보 (여럿이면 rng), 후보가 없으면 결장 · 쉼 아닌 첫 선수. 코치 = opts.supportId,
 * 없으면 이번 턴 코치 카드. 깜짝 필드가 없는 레슨 (꺼져 있을 때) 에는 계획 없는 빈 값을 만든다. 이번 턴 끝에 레슨이 끝나면 띄우지 않는다.
 * @param {object} state
 * @param {object} data
 * @param {{ eventId: string, playerId?: string, supportId?: string }} opts
 * @returns {object} state
 */
export function forceSurprise(state, data, { eventId, playerId, supportId } = {}) {
  const L = assertPlaying(state);
  const ev = eventById(data, eventId);
  if (!ev || ev.trigger !== "surprise") throw new Error(`레슨 깜짝 이벤트 '${eventId}' 이(가) 데이터에 없습니다`);
  if (playerId != null) playerById(state, playerId);
  if (!L.surprise) L.surprise = surprise.surpriseBlank();
  if (!L.turnLog) L.turnLog = surprise.turnLogBlank();
  if (!Array.isArray(L.rested)) L.rested = [];
  if (!Number.isFinite(L.nextExtraPlay)) L.nextExtraPlay = 0;
  const rng = createRngFromState(state.rngState);
  const fx = [];
  L.playsLeft = 0;
  endTurn(state, data, rng, fx, { ev, playerId: playerId || null, supportId: supportId || null });
  L.seq += 1;
  L.lastFx = fx;
  state.rngState = rng.getState();
  return state;
}

// ---------------------------------------------------------------------------
// 뷰 (순수, rng 없음)
// ---------------------------------------------------------------------------

function playerFailRate(state, data, p) {
  return clamp(failRateForStamina(data.config, Number(p.stamina) || 0) + getModifier(state, "injuryRate"), 0, 0.95);
}

function cardView(state, data, uid) {
  const L = state.lesson;
  const entry = lessonEntry(state, uid);
  const def = resolveEntry(state, data, entry);
  const kind = def.target.kind;
  const dead = cards.deadReason(state, def);
  const heal = cards.isHealSingle(def);
  const B = L.buffs;
  let cost = null;
  if (!heal && kind !== "none") {
    cost = cards.staminaCost(def, {
      mood: B.mood || 0, press: B.press || 0, pressCostMult: pressCostMultOf(data, L, def.mods || {}), costZero: !!B.nextCostZero,
    });
  }
  const owner = def.shape ? cards.ownerOf(state, def) : null;
  const playing = L.status === "playing";
  const att = attachOn(state, data, uid);
  let attach = null;
  if (att) {
    const ci = coachInfo(data, att.cur.supportId);
    attach = {
      supportId: ci.supportId, name: ci.name, short: ci.short, color: ci.color, coachType: ci.coachType,
      abilityName: att.ability.name, abilityText: att.ability.text, upgrade: att.cur.upgrade,
    };
  }
  return {
    uid, cardId: def.id, name: def.name, family: def.family, plus: def.plus, bond80: def.bond80,
    targetKind: kind,
    size: kind === "circle" ? def.target.size : null,
    radius: kind === "circle" ? cards.circleRadius(def, data) : null,
    onlyZones: def.target.onlyZones ? def.target.onlyZones.slice() : null,
    heal,
    playable: playing && L.playsLeft >= 1 && !dead,
    deadReason: dead,
    power: Number.isFinite(def.power) ? rnd(def.power * attachPowerMult(data, att)) : null,
    cost,
    exhaust: !!def.exhaust,
    desc: def.desc,
    attach,
    shape: handShapeView(state, data, def), // 고유 카드 모양 (L40, §16.3 ④) — 그 밖 null
    ownerId: owner ? owner.id : null,
  };
}

/** 지금 붙은 지원의 뷰 (§15.5) — 없으면 null */
function attachView(state, data) {
  const cur = attachOf(state.lesson).cur;
  const ability = cur && attachAbility(data, cur.supportId);
  if (!ability) return null;
  const ci = coachInfo(data, cur.supportId);
  return { uid: cur.uid, ...ci, ability: { name: ability.name, text: ability.text }, upgrade: cur.upgrade };
}

/**
 * 레슨 화면 뷰 (§14.13). 순수.
 * @param {object} state
 * @param {object} data
 */
export function getLessonView(state, data) {
  const L = assertLesson(state);
  const LD = lessonData(data);
  const Z = LD.zones;
  const pending = !!surprisePending(L);
  const playing = L.status === "playing";
  const live = playing && !pending; // 깜짝을 기다리는 동안은 손패 · 벤치 · [턴 끝] 을 잠근다 (§24.8)
  const bench = (L.bench || []).slice();
  const rested = restedOf(L);
  return {
    season: state.season, week: state.turn,
    zone: L.zone, special: L.special, prep: L.prep, policy: state.policy || null,
    zoneMult: L.special ? LD.lesson.focus.specialMult : LD.lesson.focus.mult,
    turn: L.turn, turns: L.turns, score: L.score, target: L.target, cap: L.cap, status: L.status,
    playsLeft: L.playsLeft,
    zoneCfg: {
      centers: JSON.parse(JSON.stringify(Z.centers)), radius: { ...Z.radius }, aspect: Z.aspect, pad: Z.pad, pickR: Z.pickR,
      ownerRadius: { ...(Z.ownerRadius || {}) }, dropR: Z.dropR,
    },
    positions: cards.fieldPositions(state, data),
    zones: { ...(L.zones || {}) },
    bench, benchMax: LD.lesson.bench.max,
    canBench: live && bench.length < LD.lesson.bench.max,
    canEndTurn: live,
    buffs: { ...L.buffs },
    chips: buffChips(state, data),
    hand: L.hand.map((uid) => cardView(state, data, uid)),
    attach: attachView(state, data),
    cutins: Number(L.stats && L.stats.cutins) || 0,
    piles: { draw: L.drawPile.length, discard: L.discard.length, exhausted: L.exhausted.length, removed: L.removed.length },
    players: state.players.map((p) => {
      const injuredOut = L.out.includes(p.id);
      const rest = rested.includes(p.id);
      const out = injuredOut || rest; // 쉬는 선수 (깜짝 "남은 턴 쉼") 도 이번 레슨은 빠진다 — rested 로 가른다
      return {
        id: p.id, name: p.name, slot: p.slot, position: p.position, portraitColor: p.portraitColor,
        stamina: p.stamina,
        zone: out ? null : (L.zones && L.zones[p.id]) || null,
        bench: bench.includes(p.id),
        out,
        rested: rest,
        injured: injuredOut && !L.outAtStart.includes(p.id),
        targeted: L.targeted[p.id] || 0,
        baseNext: playing ? baseGainOf(state, data, p).gain : 0,
        failRate: playerFailRate(state, data, p),
      };
    }),
    // 기다리는 레슨 깜짝 말풍선 (§24.8 — 없으면 null): { id, title, text, playerId, charId, choices [{ label, preview, lines, recommended }] }
    surprise: pending ? surprise.surpriseView(state, data) : null,
    seq: L.seq,
    lastFx: L.lastFx.map((x) => JSON.parse(JSON.stringify(x))),
  };
}

/**
 * 고유 카드 모양 노트 (§16.3 ④ — 미리보기 노트 맨 앞, 코치 지원 노트 다음). plan 은 planPlay 결과.
 */
function shapeNotes(state, plan) {
  const sh = plan.def.shape;
  const sp = plan.shape;
  if (!sh || !sp) return [];
  const owner = playerById(state, sp.ownerId);
  const name = owner.name || owner.id;
  const lbl = (z) => STAT_LABELS[z] || z;
  const notes = [];
  switch (sh.kind) {
    case "link":
    case "pick":
      if (sh.recvMult !== 1) notes.push(`${sh.kind === "link" ? "받는" : "고른"} 선수 ×${fmt(sh.recvMult)}`);
      break;
    case "ownerCircle":
    case "ownerZone":
      if (sh.ownerMult !== 1) notes.push(`${name} ×${fmt(sh.ownerMult)}`);
      break;
    case "move":
      notes.push(sp.move ? `${name} → ${lbl(sp.move.to)} 구역 · 기본 훈련도` : `${name} ${lbl(sp.zone)} 구역 그대로`);
      break;
    case "carry":
      notes.push(`${name} ${lbl(sp.move.from)} → ${lbl(sp.move.to)} · 두 구역`);
      break;
    case "owner":
      if (sh.zoneMult) {
        const zl = cards.zoneLabels(sh.zoneMult.zones);
        notes.push(sh.zoneMult.zones.includes(sp.rows[0].zone) ? `${zl} 구역 ×${fmt(sh.zoneMult.mult)}` : `${zl} 구역이 아니라 ×1`);
      }
      break;
    default:
      break;
  }
  if (sh.mods && sh.mods.noFail) notes.push(`실패 없음 (${sh.traitName})`);
  for (const e of sh.effects || []) if (e.type === "teamwork") notes.push(`팀워크 +${e.n}`);
  return notes;
}

/**
 * 미리보기의 모양 블록 (§16.3 ④). sp = shapePlan 결과 (입력이 아직 없거나 틀리면 null — 그래도 선 · 구역 표시는 준다).
 * @returns {{ kind, label, chip, ownerId, receiverId, line, circle, zone, from, to, positionsAfter, baseDelta }}
 */
/** 손패 모양 뷰: shapeView + zonesNow (지금 받는 선수를 고를 구역 — 크로스는 슈팅 구역이 비면 대체 구역, L47) */
function handShapeView(state, data, def) {
  const v = cards.shapeView(def, data);
  if (v && v.onlyZones) v.zonesNow = cards.receiverZones(state, def);
  return v;
}

function shapePreview(state, data, def, point, zone, sp) {
  const sh = def.shape;
  const L = state.lesson;
  const owner = cards.ownerOf(state, def);
  const pos = cards.fieldPositions(state, data);
  const ownerId = owner ? owner.id : null;
  const opos = ownerId ? pos[ownerId] : null;
  const out = {
    kind: sh.kind, label: sh.label, chip: sh.chip, ownerId,
    receiverId: null, line: null, circle: null, zone: null, from: null, to: null, positionsAfter: null, baseDelta: null,
  };
  if (!opos) return out;
  const needs = cards.SHAPE_NEEDS[sh.kind];
  if (sp) {
    out.receiverId = sp.receiverId;
    out.circle = sp.circle ? { ...sp.circle } : null;
    out.zone = sp.zone;
  }
  if (needs === "player") {
    const to = sp ? pos[sp.receiverId] : point;
    if (to) out.line = { from: { ...opos }, to: { x: to.x, y: to.y } };
  } else if (needs === "zone") {
    const from = L.zones[ownerId];
    let to = sp ? sp.zone : null;
    if (!to && zone != null && zones.ZONE_IDS.includes(zone)) to = zone;
    if (!to && point) to = zones.zoneAt(point, lessonData(data).zones);
    out.from = from;
    out.to = to;
    if (sp) {
      out.baseDelta = 0;
      if (sp.move) {
        // 옮긴 뒤: 다시 모인 대형 · 이번 턴 끝 주인 기본 훈련 (새 구역 − 지금 구역)
        const hyp = { ...state, lesson: { ...L, zones: { ...L.zones, [ownerId]: sp.move.to } } };
        out.positionsAfter = cards.fieldPositions(hyp, data);
        out.baseDelta = baseGainOf(hyp, data, owner).gain - baseGainOf(state, data, owner).gain;
      }
    }
  }
  return out;
}

/**
 * 카드 미리보기 (§14.13 · §16.3 ④). 순수 · rng 없음.
 * at 이 필요한 카드(원 · 단일)에 at · playerId 가 없거나 대상이 0명이면 ok: false.
 * 고유 카드: 받는 선수 (playerId · at) · 구역 (zone · at) 이 필요한 모양은 그것이 없으면 ok: false, shape 블록은 그래도 준다.
 * 회복 단일은 targets 가 비고 healId 에 회복 대상을 돌려준다.
 * targets 는 행마다 (가로지르기는 같은 id 두 줄 — stat 이 다르고 cost 는 첫 줄에만).
 * @param {object} state
 * @param {object} data
 * @param {{ uid: string, at?: {x:number, y:number}, playerId?: string, zone?: string }} args
 * @returns {{ ok, reason, kind, at, circle: {x,y,r}|null, targets: object[], healId, failRate, failerId, total, notes, attach, shape }}
 */
export function previewCard(state, data, { uid, at, playerId, zone } = {}) {
  const out = {
    ok: false, reason: null, kind: null, at: null, circle: null, healId: null,
    targets: [], failRate: 0, failerId: null, total: 0, notes: [], attach: null, shape: null,
  };
  const L = state && state.lesson;
  if (!L) return { ...out, reason: "레슨 중이 아닙니다" };
  if (L.status !== "playing") return { ...out, reason: "레슨이 끝났습니다" };
  if (!L.hand.includes(uid)) return { ...out, reason: "손패에 없는 카드입니다" };
  const def = lessonCardDef(state, data, uid);
  const kind = def.target.kind;
  out.kind = kind;
  const att = attachOn(state, data, uid);
  if (att) {
    out.attach = {
      supportId: att.cur.supportId, name: att.ability.name, text: att.ability.text, upgrade: att.cur.upgrade,
      effects: JSON.parse(JSON.stringify(att.ability.effects || [])), note: attachNote(state, data, att.cur.supportId, att.ability),
    };
  }
  let point = null;
  if (at) {
    try {
      point = zones.clampPoint(at);
    } catch (e) {
      return { ...out, reason: e.message };
    }
    out.at = point;
  }
  if (kind === "circle" && point) out.circle = { x: point.x, y: point.y, r: cards.circleRadius(def, data) };
  const dead = cards.deadReason(state, def);
  if (dead) return { ...out, reason: dead };
  const sh = def.shape;
  const needs = sh ? cards.SHAPE_NEEDS[sh.kind] : null;
  // 모양 계획 (입력이 틀려도 미리보기 선 · 구역 표시는 준다)
  let sp = null;
  if (sh) {
    try {
      sp = cards.shapePlan(state, def, { at: point, playerId, zone }, data);
    } catch (_) {
      sp = null;
    }
    out.shape = shapePreview(state, data, def, point, zone, sp);
  }
  if (kind === "circle" && !point) return { ...out, reason: "원을 놓을 자리를 고르세요" };
  if (kind === "single" && !point && playerId == null) return { ...out, reason: "선수 위에 놓으세요" };
  if (needs === "player" && !point && playerId == null) {
    return { ...out, reason: cards.receiverHint(cards.receiverZones(state, def)) };
  }
  if (needs === "zone" && !point && zone == null) return { ...out, reason: "구역 위에 놓으세요" };
  if (!(L.playsLeft >= 1)) return { ...out, reason: "이번 턴에는 더 낼 수 없습니다" };
  let plan;
  try {
    plan = planPlay(state, data, uid, { at: point, playerId, zone });
  } catch (e) {
    return { ...out, reason: plainReason(e.message) };
  }
  const targets = plan.rows.map((r) => ({
    id: r.id, zone: r.zone, stat: r.stat, gain: r.gain, sub: r.subGain, subStat: r.subStat, cost: r.cost, failRate: r.failRate,
    coach: r.coach, focus: r.focus, role: r.role, shapeMult: r.shapeMult, attachMult: r.attachMult,
  }));
  const notes = [...shapeNotes(state, plan), ...previewNotes(state, data, plan)];
  if (out.attach) notes.unshift(out.attach.note);
  return {
    ...out,
    ok: true,
    healId: plan.healId,
    targets,
    failRate: plan.f,
    failerId: plan.failerId,
    total: targets.reduce((a, t) => a + t.gain, 0),
    notes,
  };
}

/**
 * 후보 놓을 점 (§14.14 · §16.3 ④) — 감독 AI · 키보드 대체 조작용. 순수.
 *   단일: 후보 선수마다 그 위치 (playerId) · 원: zones.candidatePoints (구역 중심 → 선수 → 가운데 점, 대상 집합이 같으면 하나로)
 *   전체 · 없음: (50, 50) 한 점 · 회복 단일: 7명 각각 { playerId } (경기장 선수는 at 도)
 *   고유 카드 (모양): 이어 주기 · 연결 · 크로스 = 받는 후보마다 { at: 그 선수 위치, playerId, ids: [주인, 그 선수], kind: "player" }
 *     자리 옮기기 = 5구역 { at: 구역 중심, zone, ids: [주인], kind: "zone" } (지금 구역 포함, ZONE_IDS 순서) · 가로지르기 = 지금 구역을 뺀 4구역
 *     주인 둘레 원 · 주인 구역 · 마무리 = 한 점 { at: 주인 위치, ids: T, kind: "owner" }
 * 낼 수 없는 카드 (손패에 없음 · 죽은 카드 · 레슨 끝) 는 [].
 * @returns {{ at: {x,y}|null, playerId?: string, ids: string[], kind: string, zone?: string, zones?: string[], players?: string[] }[]}
 */
export function dropCandidates(state, data, { uid } = {}) {
  const L = state && state.lesson;
  if (!L || L.status !== "playing" || !L.hand.includes(uid)) return [];
  const def = lessonCardDef(state, data, uid);
  if (cards.deadReason(state, def)) return [];
  const cfg = lessonData(data).zones;
  const pos = cards.fieldPositions(state, data);
  const kind = def.target.kind;
  if (def.shape) {
    const sh = def.shape;
    const oid = cards.ownerOf(state, def).id;
    switch (cards.SHAPE_NEEDS[sh.kind]) {
      case "player":
        return cards.shapeReceivers(state, def).map((id) => ({ at: { ...pos[id] }, playerId: id, ids: [oid, id], kind: "player" }));
      case "zone": {
        const from = L.zones[oid];
        return zones.ZONE_IDS.filter((z) => sh.kind !== "carry" || z !== from)
          .map((z) => ({ at: { ...cfg.centers[z] }, zone: z, ids: [oid], kind: "zone" }));
      }
      default:
        return [{ at: { ...pos[oid] }, ids: cards.shapePlan(state, def, {}, data).T, kind: "owner" }];
    }
  }
  if (cards.isHealSingle(def)) {
    return state.players.map((p) => ({ at: pos[p.id] ? { ...pos[p.id] } : null, playerId: p.id, ids: [p.id], kind: "player" }));
  }
  if (kind === "single") {
    return zones.candidatePoints(pos, cfg, { kind: "single", ids: cards.singleCandidates(state, def) });
  }
  if (kind === "circle") {
    return zones.candidatePoints(pos, cfg, { kind: "circle", size: def.target.size, zoneOf: L.zones });
  }
  const ids = kind === "all" ? Object.keys(pos) : [];
  return [{ at: { x: 50, y: 50 }, ids, kind: "field" }];
}

/**
 * 끝난 레슨의 결과 요약 (보상 화면 · lessonRun 기록용). 순수.
 * perPlayer: byStat = 스탯별 순증가 (부 스탯 포함), base · mood · card = 구역 스탯 상승 (기본 훈련 · 분위기 몫 · 카드 − 실패),
 *            sub = 부 스탯 상승, targeted = 카드 대상 횟수, benched = 벤치에서 보낸 턴 수.
 * @param {object} state
 * @param {object} data
 */
export function lessonResult(state, data) {
  const L = assertLesson(state);
  return {
    zone: L.zone, special: L.special, prep: L.prep,
    score: L.score, target: L.target, cap: L.cap, status: L.status,
    turns: L.turns, turnReached: L.turn,
    plays: L.stats.plays, benches: L.stats.benches, fails: L.stats.fails, injuries: L.stats.injuries,
    twAccrued: L.twAccrued, endHeal: L.endHeal, lumiFlag: L.lumiFlag,
    attaches: Number(L.stats.attaches) || 0,
    cutins: attachOf(L).log.filter((x) => x.played).map((x) => ({
      supportId: x.supportId, name: coachInfo(data, x.supportId).name, cardId: x.cardId,
      cardName: cards.getCard(data, x.cardId).name, turn: x.turn,
    })),
    cutinHints: attachOf(L).hints.slice(),
    outAtStart: L.outAtStart.slice(), out: L.out.slice(),
    perPlayer: state.players.map((p) => {
      const b = (L.before && L.before[p.id]) || p.stats;
      const byStat = {};
      for (const z of zones.ZONE_IDS) byStat[z] = (p.stats[z] || 0) - (b[z] || 0);
      return {
        id: p.id, byStat,
        base: L.baseGains[p.id] || 0, mood: L.moodGains[p.id] || 0, card: L.cardGains[p.id] || 0, sub: L.subGains[p.id] || 0,
        targeted: L.targeted[p.id] || 0, benched: L.benchTurns[p.id] || 0,
      };
    }),
  };
}
