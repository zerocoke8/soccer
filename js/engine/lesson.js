/**
 * lesson.js — 레슨 카드 배틀, 구역 방식 (LESSON_PROTO_PLAN §14.3 ~ §14.13).
 *
 * 상태는 RunState 안의 state.lesson (LessonState, §14.13) 에 둔다. JSON 순수 객체이고 함수를 넣지 않는다.
 * 상태를 바꾸는 함수 (startLesson · playCard · benchPlayer · endLessonTurn) 는 (state, data, args) 를 받아 state 를 돌려준다.
 *   - rng 는 함수에 들어올 때 state.rngState 로 열고, 나가기 직전에 저장한다 (§8). 검증은 rng · 상태를 건드리기 전에 끝낸다.
 *   - 상태를 바꾸는 레슨 호출마다 lesson.seq +1, lesson.lastFx 를 덮어쓴다 (startLesson 은 seq 0).
 *   - rng 를 쓰는 곳: 섞기 · 흩어지기 (턴 시작, 뽑기보다 먼저) · 뽑기 · 실패 · 부상. benchPlayer 는 rng 를 쓰지 않는다.
 * 뷰 · 미리보기 · 후보 점 (getLessonView · previewCard · dropCandidates · lessonResult) 는 rng 를 쓰지 않고 상태를 바꾸지 않는다.
 *
 * 턴 (§14.3): 시작 = 벤치 비우기 → 흩어지기 → 뽑기 → 죽은 카드 다시 뽑기 / 행동 = 카드 끌어다 놓기 · 벤치 · [턴 끝] /
 *   끝 = 기본 훈련 (분위기 몫 포함) → 벤치 회복 → 분위기 감소 → 퍼펙트 판정 → 손패 버리기 → 다음 턴 또는 레슨 끝.
 * 레슨이 끝나면 (status ≠ "playing") 레슨 안의 끝 처리 (한나 endHeal · 결과 판정) 까지만 한다 — 자율 훈련은 없다.
 * 보상 · 힌트 · 결장 감소 · 기록 · phase 이동은 lessonRun.js 가 한다.
 *
 * 선수 위치는 저장하지 않는다 — lesson.zones (이번 턴 구역) 에서 zones.js 로 매번 계산한다.
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다.
 */
import { createRngFromState } from "./rng.js";
import { clamp, trainingMult, failRateForStamina, getModifier } from "./training.js";
import * as cards from "./cards.js";
import * as zones from "./zones.js";

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
  return L;
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
  return cards.resolveCardDef(data, raw, { plus: !!entry.plus && cards.canUpgrade(raw), bond });
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
    if (L.out.includes(p.id)) continue;
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
  if (!z || L.out.includes(p.id) || (L.bench || []).includes(p.id)) return { zone: z || null, g: 0, gain: 0 };
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
    if (!b.zone || L.out.includes(p.id) || L.bench.includes(p.id)) continue;
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

/** 1인 위력에 더하는 집중 몫: focus × focusPer × (focusX2 ? 2 : 1) / |T| */
function focusShare(data, L, ctx) {
  if (!ctx.n) return 0;
  const B = lessonData(data).buffs;
  return (L.buffs.focus * B.focusPer * (ctx.mods.focusX2 ? 2 : 1)) / ctx.n;
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
      const share = (v("focus") * BD.focusPer * (ctx.mods.focusX2 ? 2 : 1)) / ctx.n;
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
 * @param {object} state
 * @param {object} data
 * @param {string} uid
 * @param {{ at?: {x,y}, playerId?: string }} args
 * @returns {{ entry, def, kind, T: string[], healId: string|null, effects: object[], rows: object[], f: number,
 *            failerId: string|null, pressCostMult: number, ctx: object, buffsBefore: object }}
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
  const sel = cards.targetsFor(state, def, args || {}, data);
  const T = heal ? [] : sel;
  const healId = heal ? sel[0] : null;
  const effects = def.effects || [];
  const mods = def.mods || {};
  const B = L.buffs;
  const players = T.map((id) => playerById(state, id));
  const zoneOf = (id) => L.zones[id];
  const n = T.length;
  const ctx = {
    n,
    mods,
    smallCircle: n > 0 && cards.isSmallCircle(def),
    hasAttackZone: n > 0 && T.some((id) => ATTACK_ZONES.includes(zoneOf(id))),
    allDefenseZone: n > 0 && T.every((id) => DEFENSE_ZONES.includes(zoneOf(id))),
    hasPassZone: T.some((id) => zoneOf(id) === "pass"),
  };

  // 3. 1인 위력 (소수 유지)
  const unique15 = def.family === "unique" && cards.ownerOnMainZone(state, def);
  const mainMult = unique15 ? ls.unique.mainMult : 1;
  const share = focusShare(data, L, ctx);
  const power = players.map(() => {
    let base;
    if (kind === "owner") base = def.power * mainMult;
    else base = def.power + (mods.perMood || 0) * (B.mood || 0) + (mods.perPress || 0) * (B.press || 0);
    if (kind === "single" || kind === "owner") base += B.routine || 0;
    return base + share;
  });

  // 4. 비용 (1인당, 강화 전 기본 위력 기준)
  const pcm = pressCostMultOf(data, L, mods);
  const cost = cards.staminaCost(def, { mood: B.mood || 0, press: B.press || 0, mainMult, pressCostMult: pcm, costZero: !!B.nextCostZero });

  // 5. 실패율 (비용 내기 전 체력)
  const noFail = !!mods.noFail || !!B.nextNoFail;
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

  // 6. 배율 M_i (대상마다 — 구역에 따라 다르다)
  let M0 = commonMult(state, data);
  if (n && (B.hojo || 0) > 0) M0 *= LD.buffs.hojoMult;
  if (mods.lastTurnX2 && L.turn > L.turns - mods.lastTurnX2) M0 *= 2;
  if (mods.underdog && L.score < L.target) M0 *= 1 + mods.underdog;
  M0 *= 1 + (B.nextPct || 0) + (ctx.smallCircle ? B.nextPairPct || 0 : 0);
  M0 *= policyMult(state, data, L, ctx);
  M0 *= ls.cardGainScale;

  // 8번의 상승 (실패하지 않았을 때). 실제 오른 양은 상한 1000에 잘린 값.
  const cap = cfg.statCap;
  const rows = players.map((p, i) => {
    const z = zoneOf(p.id);
    const coach = def.family === "coach" && !!def.coach && def.coach.type === z;
    const focus = z === L.zone;
    let M = M0 * zoneMult(L, data, z);
    if (coach) M *= ls.coachSameTypeMult;
    if (mods.lessonMult && mods.lessonMult.stats.includes(z)) M *= mods.lessonMult.mult;
    const sub = cfg.training.subStatMap[z];
    const g = rnd(power[i] * growthOf(p, z) * M);
    const gain = Math.max(0, Math.min(g, cap - p.stats[z]));
    const sg = rnd(g * ls.subGainRatio * growthOf(p, sub));
    const subGain = Math.max(0, Math.min(sg, cap - p.stats[sub]));
    return {
      id: p.id, zone: z, stat: z, subStat: sub, power: power[i], M, g, gain, subGain, cost, failRate: rates[i],
      coach, focus, unique15: def.family === "unique" && unique15,
    };
  });

  return { entry, def, kind, T, healId, effects, rows, f, failerId, pressCostMult: pcm, ctx, buffsBefore: { ...B } };
}

// ---------------------------------------------------------------------------
// 뽑기 · 턴 · 끝 (§14.3)
// ---------------------------------------------------------------------------

function drawOne(L, rng) {
  if (!L.drawPile.length) {
    if (!L.discard.length) return false;
    L.drawPile = rng.shuffle(L.discard);
    L.discard = [];
  }
  L.hand.push(L.drawPile.shift());
  return true;
}

function deadOf(state, data, uid) {
  return cards.deadReason(state, lessonCardDef(state, data, uid));
}

/** 턴 시작: 출전 0명이면 끝, 아니면 ① 벤치 비우기 ② 흩어지기 ③ 3 + drawNext 장 뽑기 ④ 죽은 카드 다시 뽑기 ⑤ playsLeft 1 */
function beginTurn(state, data, rng, fx) {
  const L = state.lesson;
  if (cards.activePlayers(state).length === 0) return finishLesson(state, data, fx); // D45
  L.bench = [];
  const zoneMap = scatterZones(state, data, rng);
  fx.push({ t: "scatter", zones: { ...zoneMap } });
  const n = lessonData(data).lesson.hand + (L.drawNext || 0);
  L.drawNext = 0;
  L.playsLeft = 1;
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
}

/** 턴 끝 (§14.3): ① 기본 훈련 ② 벤치 회복 ③ 분위기 감소 ④ 퍼펙트 판정 ⑤ 손패 버림 ⑥ 마지막 턴이면 끝, 아니면 다음 턴 시작 */
function endTurn(state, data, rng, fx) {
  const L = state.lesson;
  turnEndTraining(state, data, fx);
  turnEndBuffs(state, data, fx);
  fx.push({ t: "turnEnd", turn: L.turn });
  if (L.score >= L.cap) return finishLesson(state, data, fx);
  L.discard.push(...L.hand);
  L.hand = [];
  if (L.turn >= L.turns) return finishLesson(state, data, fx);
  L.turn += 1;
  beginTurn(state, data, rng, fx);
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
    stats: { plays: 0, benches: 0, fails: 0, injuries: 0 },
  };
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
 * @param {{ uid: string, at?: {x:number, y:number}, playerId?: string }} args at = 놓은 점 (필드 %)
 * @returns {object} state
 */
export function playCard(state, data, { uid, at, playerId } = {}) {
  const L = assertPlaying(state);
  if (!(L.playsLeft >= 1)) throw new Error("이번 턴에는 더 낼 수 없습니다");
  const plan = planPlay(state, data, uid, { at, playerId }); // 1~6 (검증 포함, 상태 변경 없음)
  const LD = lessonData(data);
  const ls = LD.lesson;
  const rng = createRngFromState(state.rngState);
  const fx = [];
  const { def, T, rows } = plan;
  L.hand.splice(L.hand.indexOf(uid), 1);
  L.stats.plays += 1;

  // 7. 비용 지불
  for (const r of rows) {
    const p = playerById(state, r.id);
    const before = Number(p.stamina) || 0;
    p.stamina = clamp(before - r.cost, 0, 100);
    if (before !== p.stamina) fx.push({ t: "cost", id: p.id, n: before - p.stamina });
  }

  // 7. 실패 판정 (카드 1장에 1번)
  const failerId = plan.f > 0 && rng.chance(plan.f) ? plan.failerId : null;

  // 8. 상승 · 실패 (서 있는 구역의 스탯)
  for (const r of rows) {
    const p = playerById(state, r.id);
    if (r.id === failerId) {
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
  const play = { ...plan, failerId, consumed: false, extraPlay: 0, fx };
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

  // 13. 기록 · 카드 이동 · 퍼펙트 · 사용 횟수
  for (const id of T) L.targeted[id] = (L.targeted[id] || 0) + 1;
  const owner = def.family === "unique" ? cards.ownerOf(state, def) : null;
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
    if (L.bench.includes(p.id)) throw new Error(`${p.name || p.id}: 이미 벤치에 있습니다`);
    if (!L.zones[p.id]) throw new Error(`${p.name || p.id}: 경기장에 없습니다`);
    if (L.bench.length >= max) throw new Error(`벤치는 한 턴에 최대 ${max}명입니다`);
    L.bench.push(p.id);
    L.stats.benches += 1;
  } else {
    if (!L.bench.includes(p.id)) throw new Error(`${p.name || p.id}: 벤치에 없습니다`);
    L.bench = L.bench.filter((id) => id !== p.id);
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
    const mainMult = def.family === "unique" && cards.ownerOnMainZone(state, def) ? lessonData(data).lesson.unique.mainMult : 1;
    cost = cards.staminaCost(def, {
      mood: B.mood || 0, press: B.press || 0, mainMult, pressCostMult: pressCostMultOf(data, L, def.mods || {}), costZero: !!B.nextCostZero,
    });
  }
  const playing = L.status === "playing";
  return {
    uid, cardId: def.id, name: def.name, family: def.family, plus: def.plus, bond80: def.bond80,
    targetKind: kind,
    size: kind === "circle" ? def.target.size : null,
    radius: kind === "circle" ? cards.circleRadius(def, data) : null,
    onlyZones: def.target.onlyZones ? def.target.onlyZones.slice() : null,
    heal,
    playable: playing && L.playsLeft >= 1 && !dead,
    deadReason: dead,
    power: Number.isFinite(def.power) ? def.power : null,
    cost,
    exhaust: !!def.exhaust,
    desc: def.desc,
  };
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
  const playing = L.status === "playing";
  const bench = (L.bench || []).slice();
  return {
    season: state.season, week: state.turn,
    zone: L.zone, special: L.special, prep: L.prep, policy: state.policy || null,
    zoneMult: L.special ? LD.lesson.focus.specialMult : LD.lesson.focus.mult,
    turn: L.turn, turns: L.turns, score: L.score, target: L.target, cap: L.cap, status: L.status,
    playsLeft: L.playsLeft,
    zoneCfg: { centers: JSON.parse(JSON.stringify(Z.centers)), radius: { ...Z.radius }, aspect: Z.aspect, pad: Z.pad, pickR: Z.pickR },
    positions: cards.fieldPositions(state, data),
    zones: { ...(L.zones || {}) },
    bench, benchMax: LD.lesson.bench.max,
    canBench: playing && bench.length < LD.lesson.bench.max,
    canEndTurn: playing,
    buffs: { ...L.buffs },
    chips: buffChips(state, data),
    hand: L.hand.map((uid) => cardView(state, data, uid)),
    piles: { draw: L.drawPile.length, discard: L.discard.length, exhausted: L.exhausted.length, removed: L.removed.length },
    players: state.players.map((p) => {
      const out = L.out.includes(p.id);
      return {
        id: p.id, name: p.name, slot: p.slot, position: p.position, portraitColor: p.portraitColor,
        stamina: p.stamina,
        zone: out ? null : (L.zones && L.zones[p.id]) || null,
        bench: bench.includes(p.id),
        out,
        injured: out && !L.outAtStart.includes(p.id),
        targeted: L.targeted[p.id] || 0,
        baseNext: playing ? baseGainOf(state, data, p).gain : 0,
        failRate: playerFailRate(state, data, p),
      };
    }),
    seq: L.seq,
    lastFx: L.lastFx.map((x) => JSON.parse(JSON.stringify(x))),
  };
}

/**
 * 카드 미리보기 (§14.13). 순수 · rng 없음.
 * at 이 필요한 카드(원 · 단일)에 at · playerId 가 없거나 대상이 0명이면 ok: false.
 * 회복 단일은 targets 가 비고 healId 에 회복 대상을 돌려준다.
 * @param {object} state
 * @param {object} data
 * @param {{ uid: string, at?: {x:number, y:number}, playerId?: string }} args
 * @returns {{ ok, reason, kind, at, circle: {x,y,r}|null, targets: object[], healId, failRate, failerId, total, notes }}
 */
export function previewCard(state, data, { uid, at, playerId } = {}) {
  const out = {
    ok: false, reason: null, kind: null, at: null, circle: null, healId: null,
    targets: [], failRate: 0, failerId: null, total: 0, notes: [],
  };
  const L = state && state.lesson;
  if (!L) return { ...out, reason: "레슨 중이 아닙니다" };
  if (L.status !== "playing") return { ...out, reason: "레슨이 끝났습니다" };
  if (!L.hand.includes(uid)) return { ...out, reason: "손패에 없는 카드입니다" };
  const def = lessonCardDef(state, data, uid);
  const kind = def.target.kind;
  out.kind = kind;
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
  if (kind === "circle" && !point) return { ...out, reason: "원을 놓을 자리를 고르세요" };
  if (kind === "single" && !point && playerId == null) return { ...out, reason: "선수 위에 놓으세요" };
  if (!(L.playsLeft >= 1)) return { ...out, reason: "이번 턴에는 더 낼 수 없습니다" };
  let plan;
  try {
    plan = planPlay(state, data, uid, { at: point, playerId });
  } catch (e) {
    return { ...out, reason: plainReason(e.message) };
  }
  const targets = plan.rows.map((r) => ({
    id: r.id, zone: r.zone, stat: r.stat, gain: r.gain, sub: r.subGain, subStat: r.subStat, cost: r.cost, failRate: r.failRate,
    coach: r.coach, focus: r.focus, unique15: r.unique15,
  }));
  return {
    ...out,
    ok: true,
    healId: plan.healId,
    targets,
    failRate: plan.f,
    failerId: plan.failerId,
    total: targets.reduce((a, t) => a + t.gain, 0),
    notes: previewNotes(state, data, plan),
  };
}

/**
 * 후보 놓을 점 (§14.14) — 감독 AI · 키보드 대체 조작용. 순수.
 *   단일: 후보 선수마다 그 위치 (playerId) · 원: zones.candidatePoints (구역 중심 → 선수 → 가운데 점, 대상 집합이 같으면 하나로)
 *   전체 · 주인 · 없음: (50, 50) 한 점 · 회복 단일: 7명 각각 { playerId } (경기장 선수는 at 도)
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
  if (cards.isHealSingle(def)) {
    return state.players.map((p) => ({ at: pos[p.id] ? { ...pos[p.id] } : null, playerId: p.id, ids: [p.id], kind: "player" }));
  }
  if (kind === "single") {
    return zones.candidatePoints(pos, cfg, { kind: "single", ids: cards.singleCandidates(state, def) });
  }
  if (kind === "circle") {
    return zones.candidatePoints(pos, cfg, { kind: "circle", size: def.target.size, zoneOf: L.zones });
  }
  const ids = kind === "owner" ? cards.targetsFor(state, def, {}, data) : kind === "all" ? Object.keys(pos) : [];
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
