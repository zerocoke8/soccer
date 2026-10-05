/**
 * lessonEffects.js — 레슨 런 이벤트 효과 층 (LESSON_PROTO_PLAN §24.4 · §24.5.1).
 *
 * E1: 효과 스키마 표 `EFFECTS` (type 마다 키 · 값 · 대상 · 쓸 수 있는 트리거) 와 검사 `effectErrors(eff, where, ctx)`.
 *     `lessonEvents.validateLessonEvents` 가 선택지 효과마다 부른다.
 * E2: 적용 `applyEffects(state, data, effects, ctx, rng)` · 미리보기 `describe(state, data, effects, ctx)` → { text, lines } ·
 *     고르기 `effectNeeds` (cardPick 후보) · 감독 AI 기대값 `scoreEffects` (§24.11). 아래 "E2" 절.
 *
 * - 런에 남는 효과 (§24.4.1, scope "run") 는 모든 트리거가 쓴다. 단 깜짝 (surprise) 은 §24.4.2 끝의 목록
 *   (stamina · teamwork · condition · bond · coachHint · playerHint · tp · random) 만.
 * - 레슨 안 효과 (§24.4.2, scope "lesson") 는 깜짝 전용. 적용은 ctx.applyLesson (E5 — lesson.resolveSurprise 가 넘긴다) 이 맡고,
 *   없으면 (레슨 밖) 적용하기 전에 throw 한다. 미리보기 · 기대값은 여기서 만든다.
 * - 옛 effects.js 의 적용 함수는 부르지 않는다 (MODIFIER_KEYS 목록만 같이 쓴다 — 경기가 읽는 보정 키). 범위 · 보정은 같게 다시 쓴다
 *   (statCap · 체력 0 ~ 100 · 컨디션 0 ~ 4 · 팀워크 0 ~ 100 · 유대 0 ~ 100 + bondGain · SP × (1 + skillPointGain)).
 * - lessonRun · lesson.js 를 import 하지 않는다 (순환 import 방지 — 공용 도우미는 lessonCommon).
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 없음. rng 는 인자로 받은 것만 쓴다 (applyEffects). describe · effectNeeds ·
 * scoreEffects 는 상태를 읽기만 하고 rng 를 쓰지 않는다.
 */
import { MODIFIER_KEYS } from "./effects.js";
import { STATS, STAT_LABELS, MAX_HINT_LEVEL, clamp, getModifier, mainStatOf } from "./training.js";
import { withJosa } from "./lessonText.js";
import * as cards from "./cards.js";
import * as passives from "./passives.js";
import * as C from "./lessonCommon.js";

/** 이벤트 트리거 (§24.3.2). lessonEvents 가 다시 내보낸다 */
export const TRIGGERS = Object.freeze(["week", "seasonStart", "preMatch", "route", "outing", "story", "coach", "surprise"]);

/** 트리거 한국어 이름 (오류 · 문서) */
export const TRIGGER_LABELS = Object.freeze({
  week: "주 끝 랜덤",
  seasonStart: "시즌 시작",
  preMatch: "경계전 전야",
  route: "루트",
  outing: "일반 외출",
  story: "외출 이야기",
  coach: "코치 연속",
  surprise: "레슨 깜짝",
});

/** stat 효과의 stat 값 (§24.4.1) — main = 주 스탯 1개, main2 = cards.mainStatsOf(배치 포지션) 2개 */
export const STAT_KEYS = Object.freeze([...STATS, "main", "main2", "random"]);
/** cardPick 의 op */
export const CARD_PICK_OPS = Object.freeze(["upgrade", "delete"]);
/** modifier 의 duration (옛 events.json 과 같다) */
export const MODIFIER_DURATIONS = Object.freeze(["season", "run"]);
/** 깜짝에서도 쓸 수 있는 런 효과 (§24.4.2 끝) */
export const SURPRISE_RUN_EFFECTS = Object.freeze(["stamina", "teamwork", "condition", "bond", "coachHint", "playerHint", "tp", "random"]);

const NOT_SURPRISE = TRIGGERS.filter((t) => t !== "surprise");
const SURPRISE_ONLY = ["surprise"];

/** 옛 효과 type (검사가 막는다 — §24.3.7 "금지", R17) */
export const FORBIDDEN_EFFECTS = Object.freeze({
  summonTicket: "호출권은 없어졌다 (R17)",
  hint: "옛 무작위 힌트 — 코치 쪽 장면은 coachHint · teach, 선수 쪽 장면은 playerHint (R2 ~ R4)",
  skillPoints: "→ { type: \"sp\", amount }",
  training: "훈련 칸은 없어졌다 (R17)",
  trainingSlot: "훈련 칸은 없어졌다 (R17)",
  friendship: "우정 훈련은 없어졌다 (R17)",
});

/** 옛 효과 키 (모르는 키 오류에 덧붙이는 말) */
const OLD_EFFECT_KEYS = {
  turns: "결장은 레슨 1회뿐이라 turns 를 쓰지 않는다 (R1)",
  skill: "→ skillId",
  level: "힌트 단계는 정하지 않는다 (같은 힌트가 또 나오면 +1)",
  slot: "훈련 칸은 없어졌다 (R17)",
  preview: "미리보기는 효과에서 자동으로 만든다 (R14)",
  count: "유물 · 3택1 은 늘 3개",
};

/**
 * 효과 스키마 (§24.4). type → {
 *   scope: "run" (런에 남는다) | "lesson" (레슨 안 — 깜짝 전용),
 *   label: 한국어 이름,
 *   triggers: 쓸 수 있는 트리거,
 *   keys: { 키: true (꼭) | false (있어도 된다) } — type 말고 다른 키는 오류,
 *   targets?: target 값 ("char" = "char:<캐릭터 id>"), defaultTarget?: target 을 빼면 쓰는 값 (빼면 꼭 적는다),
 * }
 * 대상 뜻: player = 이벤트 주인공 ({선수}) · team = 7명 · char:<id> = 그 선수 · randomPlayer = 무작위 1명 (결장 효과만) ·
 *   all = 결장 중인 선수 전원 (heal) · bond 의 all = 편성 코치 전원 · coach = 그 이벤트의 코치 · <supportId> = 그 코치.
 */
export const EFFECTS = Object.freeze({
  // ---- 런에 남는 효과 (§24.4.1) ----
  stat: def("run", "스탯", NOT_SURPRISE, { target: true, stat: true, amount: true }, { targets: ["player", "team", "char"] }),
  stamina: def("run", "체력", TRIGGERS, { target: true, amount: false, full: false }, { targets: ["player", "team", "char"] }),
  condition: def("run", "컨디션", TRIGGERS, { amount: true }),
  goalCondition: def("run", "다음 경계전 1회 컨디션", NOT_SURPRISE, { amount: true }),
  teamwork: def("run", "팀워크", TRIGGERS, { amount: true }),
  sp: def("run", "SP", NOT_SURPRISE, { amount: true }),
  tp: def("run", "TP", TRIGGERS, { amount: true }),
  bond: def("run", "코치 유대", TRIGGERS, { target: true, amount: true }),
  injury: def("run", "다음 레슨 1회 결장", NOT_SURPRISE, { target: false }, { targets: ["player", "randomPlayer", "char"], defaultTarget: "player" }),
  heal: def("run", "결장 해제", NOT_SURPRISE, { target: true }, { targets: ["player", "all", "char"] }),
  relic: def("run", "유물 3택1", NOT_SURPRISE, {}),
  modifier: def("run", "보정", NOT_SURPRISE, { key: true, amount: true, duration: true }),
  cardAdd: def("run", "덱에 카드 추가", NOT_SURPRISE, { cardId: true, plus: false }),
  cardPick: def("run", "덱의 카드 1장 고르기", NOT_SURPRISE, { op: true }),
  cardUpgradeRandom: def("run", "덱의 카드 1장 무작위 강화", NOT_SURPRISE, {}),
  rewardOffer: def("run", "보상 카드 3택1", NOT_SURPRISE, {}),
  uniquePlus: def("run", "고유 카드 이번 런 강화판", NOT_SURPRISE, { target: false }, { targets: ["player", "char"], defaultTarget: "player" }),
  teach: def("run", "코치 수업", NOT_SURPRISE, { skillId: true, supportId: false }),
  coachHint: def("run", "코치 수업 (무작위)", TRIGGERS, { from: true }),
  playerHint: def("run", "패시브 힌트", TRIGGERS, { target: false, skillId: false }, { targets: ["player", "char"], defaultTarget: "player" }),
  random: def("run", "확률", TRIGGERS, { chance: true, then: true, else: true }),
  // ---- 레슨 안 효과 (§24.4.2, 깜짝 전용) ----
  nextPct: def("lesson", "다음 카드 위력", SURPRISE_ONLY, { pct: true }),
  nextNoFail: def("lesson", "다음 카드 실패 판정 없음", SURPRISE_ONLY, {}),
  drawNext: def("lesson", "다음 턴 손패", SURPRISE_ONLY, { n: true }),
  extraPlayNext: def("lesson", "다음 턴 카드 추가 사용", SURPRISE_ONLY, { n: true }),
  score: def("lesson", "이번 레슨 점수", SURPRISE_ONLY, { amount: true }),
  buff: def("lesson", "방침 버프", SURPRISE_ONLY, { n: true }),
  restRemaining: def("lesson", "이번 레슨 남은 턴 쉼", SURPRISE_ONLY, { target: false, stamina: true }, { targets: ["player", "char"], defaultTarget: "player" }),
  injureNow: def("lesson", "지금 결장 (이번 레슨 남은 턴도)", SURPRISE_ONLY, { target: false }, { targets: ["player", "char"], defaultTarget: "player" }),
});

function def(scope, label, triggers, keys, extra = {}) {
  const out = { scope, label, triggers: Object.freeze([...triggers]), keys: Object.freeze({ ...keys }) };
  if (extra.targets) out.targets = Object.freeze([...extra.targets]);
  if (extra.defaultTarget) out.defaultTarget = extra.defaultTarget;
  return Object.freeze(out);
}

/** 그 트리거의 이벤트가 이 효과를 쓸 수 있나 */
export function effectAllowed(type, trigger) {
  const spec = EFFECTS[type];
  return !!spec && spec.triggers.includes(trigger);
}

/**
 * 참조 검사용 id 표 (캐릭터 · 코치 · 스킬 · 카드 · 루트 · 방침).
 * @param {object} data
 */
export function buildRefIndex(data) {
  const list = (x, inner) => (Array.isArray(x) ? x : x && Array.isArray(x[inner]) ? x[inner] : []);
  const byId = (arr) => new Map(arr.filter((o) => o && typeof o.id === "string").map((o) => [o.id, o]));
  const d = data || {};
  return {
    chars: byId(list(d.characters)),
    supports: byId(list(d.supports)),
    skills: byId(list(d.skills)),
    cards: byId(list(d.cards, "cards")),
    routes: byId(list(d.routes)),
    policies: byId(list(d.policies, "policies")),
  };
}

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const show = (v) => (typeof v === "string" ? `'${v}'` : JSON.stringify(v));

/** 정수 · 범위 검사 (0 은 nonZero 면 오류) */
function intIn(v, min, max, { nonZero = false } = {}) {
  return Number.isInteger(v) && v >= min && v <= max && (!nonZero || v !== 0);
}

/**
 * @typedef {Object} EffectCheckCtx
 * @property {string} [trigger]       이벤트 트리거 (없으면 트리거 검사를 하지 않는다)
 * @property {object} [data]          참조 검사용 (없고 index 도 없으면 참조 검사를 하지 않는다)
 * @property {object} [index]         buildRefIndex(data) — 이벤트마다 다시 만들지 않으려고
 * @property {{ kind: "none"|"generic"|"fixed", charId?: string }} [protagonist]
 *           주인공: none = 없음 (target player 를 쓸 수 없다), generic = 런마다 바뀐다, fixed = 그 캐릭터로 정해짐
 * @property {Set<string>|string[]} [guaranteed]  편성 · 결장 아님이 보장된 캐릭터 (char:<id> 대상)
 * @property {boolean} [hasCoach]     그 이벤트의 코치가 있다 (coach 트리거 · coach 키 · 깜짝 coachCardOkThisTurn)
 * @property {boolean} [allowTeach]   액티브 수업 (teach) 을 줄 수 있다 (선수 전용 · 이야기 = false, R4)
 * @property {boolean} [nested]       random 의 then / else 안
 */

/**
 * 효과 하나를 검사한다 (random 이면 갈래 안도).
 * @param {object} eff
 * @param {string} where  오류 문장 앞머리 (예: "choices[0].effects[1]")
 * @param {EffectCheckCtx} [ctx]
 * @returns {string[]}  사람이 읽는 한국어 오류 문장 (없으면 빈 배열)
 */
export function effectErrors(eff, where, ctx = {}) {
  const errors = [];
  const bad = (msg) => errors.push(`${where}: ${msg}`);
  if (!isObj(eff)) {
    bad(`효과는 { type, … } 객체다 (지금 ${show(eff)})`);
    return errors;
  }
  const type = eff.type;
  if (typeof type !== "string" || !type) {
    bad("효과에 type 이 없다");
    return errors;
  }
  if (Object.prototype.hasOwnProperty.call(FORBIDDEN_EFFECTS, type)) {
    bad(`옛 효과 '${type}' 는 레슨 런에서 쓰지 않는다 — ${FORBIDDEN_EFFECTS[type]}`);
    return errors;
  }
  const spec = EFFECTS[type];
  if (!spec) {
    bad(`모르는 효과 type '${type}' (쓸 수 있는 것: ${Object.keys(EFFECTS).join(" · ")})`);
    return errors;
  }
  if (ctx.trigger && !spec.triggers.includes(ctx.trigger)) {
    const why = spec.scope === "lesson"
      ? "레슨 안 효과는 깜짝 이벤트 전용 (§24.4.2)"
      : `깜짝 이벤트가 쓸 수 있는 런 효과는 ${SURPRISE_RUN_EFFECTS.join(" · ")} 뿐 (§24.4.2)`;
    bad(`'${type}' 는 ${TRIGGER_LABELS[ctx.trigger] || ctx.trigger} 이벤트에서 쓸 수 없다 — ${why}`);
  }
  for (const k of Object.keys(eff)) {
    if (k === "type" || Object.prototype.hasOwnProperty.call(spec.keys, k)) continue;
    bad(`'${type}' 에 모르는 키 '${k}'${OLD_EFFECT_KEYS[k] ? ` — ${OLD_EFFECT_KEYS[k]}` : ""} (쓸 수 있는 키: ${Object.keys(spec.keys).join(" · ") || "없음"})`);
  }
  for (const [k, req] of Object.entries(spec.keys)) {
    if (req && eff[k] === undefined) bad(`'${type}' 에 '${k}' 가 없다`);
  }
  const ix = ctx.index || (ctx.data ? buildRefIndex(ctx.data) : null);
  if (spec.targets) targetErrors(eff, spec, ix, ctx, bad);
  valueErrors(eff, ix, ctx, bad);
  if (type === "random") {
    if (ctx.nested) bad("random 안에 random 을 넣지 않는다 (선택지 맨 위에 하나만)");
    for (const side of ["then", "else"]) {
      const branch = eff[side];
      if (branch === undefined) continue;
      if (!Array.isArray(branch)) {
        bad(`random.${side} 는 효과 배열이다`);
        continue;
      }
      branch.forEach((b, i) => errors.push(...effectErrors(b, `${where}.${side}[${i}]`, { ...ctx, index: ix, nested: true })));
    }
    if (Array.isArray(eff.then) && Array.isArray(eff.else) && eff.then.length + eff.else.length === 0) bad("random 의 then · else 가 둘 다 비었다");
  }
  return errors;
}

/** target 검사 (값 · 주인공 · 편성 보장) */
function targetErrors(eff, spec, ix, ctx, bad) {
  const type = eff.type;
  const t = eff.target === undefined ? spec.defaultTarget : eff.target;
  if (t === undefined) return; // 빠진 키는 위에서 말했다
  const allowed = spec.targets.map((x) => (x === "char" ? "char:<캐릭터 id>" : x)).join(" · ");
  if (typeof t !== "string") {
    bad(`'${type}' 의 target 은 문자열 (${allowed})`);
    return;
  }
  if (t.startsWith("char:")) {
    if (!spec.targets.includes("char")) {
      bad(`'${type}' 의 target '${t}' — 쓸 수 있는 것: ${allowed}`);
      return;
    }
    const id = t.slice(5);
    if (ix && !ix.chars.has(id)) {
      bad(`'${type}' 의 target '${t}': 없는 캐릭터`);
      return;
    }
    const g = ctx.guaranteed instanceof Set ? ctx.guaranteed : new Set(ctx.guaranteed || []);
    if (ctx.guaranteed !== undefined && !g.has(id)) {
      bad(`'${type}' 의 target '${t}': 편성이 보장되지 않은 선수 — chars (charMode all) · who.charId · 이야기 주인공 · 깜짝 cond.char.id 에 있는 선수만`);
    }
    return;
  }
  if (t.startsWith("position:")) {
    bad(`'${type}' 의 target '${t}' — 포지션 대상은 없다. who.pos 로 주인공을 좁힌다 (쓸 수 있는 것: ${allowed})`);
    return;
  }
  if (!spec.targets.includes(t)) {
    bad(`'${type}' 의 target '${t}' — 쓸 수 있는 것: ${allowed}`);
    return;
  }
  if (t === "player" && ctx.protagonist && ctx.protagonist.kind === "none") {
    bad(`'${type}' 가 주인공 (player) 을 가리키는데 이 이벤트는 주인공이 없다 — who.pick 을 적거나 target 을 바꾼다`);
  }
}

/** 효과 type 별 값 · 참조 검사 */
function valueErrors(eff, ix, ctx, bad) {
  const type = eff.type;
  const has = (k) => eff[k] !== undefined;
  const amount = (min, max, what = "amount") => {
    if (has(what) && !intIn(eff[what], min, max, { nonZero: true })) bad(`'${type}' 의 ${what} 는 0 이 아닌 정수 ${min} ~ ${max} (지금 ${show(eff[what])})`);
  };
  switch (type) {
    case "stat":
      if (has("stat") && !STAT_KEYS.includes(eff.stat)) bad(`stat 의 stat ${show(eff.stat)} — 쓸 수 있는 것: ${STAT_KEYS.join(" · ")}`);
      amount(-100, 100);
      break;
    case "stamina":
      if (has("full") && eff.full !== true) bad("stamina 의 full 은 true 만 (완전 회복)");
      if (has("full") && has("amount")) bad("stamina 는 amount 와 full 중 하나만");
      if (!has("full") && !has("amount")) bad("stamina 에 amount 또는 full 이 없다");
      amount(-100, 100);
      break;
    case "condition":
      amount(-4, 4);
      break;
    case "goalCondition":
      amount(-4, 4);
      break;
    case "teamwork":
      amount(-100, 100);
      break;
    case "sp":
    case "tp":
      amount(-200, 200);
      break;
    case "bond": {
      amount(-100, 100);
      const t = eff.target;
      if (t === undefined) break;
      if (typeof t !== "string" || !t) bad(`bond 의 target 은 all · coach · <코치 id> (지금 ${show(t)})`);
      else if (t === "coach") {
        if (ctx.hasCoach === false) bad("bond 의 target 'coach' — 이 이벤트에는 코치가 없다 (coach 트리거 · coach 키 · 깜짝 coachCardOkThisTurn 일 때만)");
      } else if (t !== "all" && ix && !ix.supports.has(t)) {
        bad(`bond 의 target '${t}' — all · coach · <코치 id> 중 하나 (없는 코치)`);
      }
      break;
    }
    case "modifier":
      if (has("key") && !MODIFIER_KEYS.includes(eff.key)) bad(`modifier 의 key ${show(eff.key)} — effects.MODIFIER_KEYS 안의 것만 (${MODIFIER_KEYS.join(" · ")})`);
      if (has("amount") && !(typeof eff.amount === "number" && Number.isFinite(eff.amount) && eff.amount !== 0)) bad(`modifier 의 amount 는 0 이 아닌 수 (0.1 = +10%, 사용권 1) (지금 ${show(eff.amount)})`);
      if (has("duration") && !MODIFIER_DURATIONS.includes(eff.duration)) bad(`modifier 의 duration ${show(eff.duration)} — season · run 만`);
      break;
    case "cardAdd": {
      if (has("plus") && typeof eff.plus !== "boolean") bad("cardAdd 의 plus 는 true · false");
      if (!has("cardId")) break;
      if (typeof eff.cardId !== "string") {
        bad("cardAdd 의 cardId 는 카드 id 문자열");
        break;
      }
      const card = ix ? ix.cards.get(eff.cardId) : null;
      if (ix && !card) bad(`cardAdd 의 cardId '${eff.cardId}': 없는 카드`);
      else if (card && (card.family === "unique" || card.family === "prep")) bad(`cardAdd 의 '${eff.cardId}' 는 ${card.family === "unique" ? "고유" : "대비"} 카드 — 덱에 넣을 수 없다 (고유 카드는 uniquePlus)`);
      break;
    }
    case "cardPick":
      if (has("op") && !CARD_PICK_OPS.includes(eff.op)) bad(`cardPick 의 op ${show(eff.op)} — upgrade · delete 만`);
      break;
    case "teach": {
      if (ctx.allowTeach === false) bad("선수 전용 · 이야기 이벤트는 액티브 수업 (teach) 을 주지 않는다 — 그 선수 패시브 힌트 (playerHint) 나 스탯으로 (R4 · L48)");
      const sk = has("skillId") && ix ? ix.skills.get(eff.skillId) : null;
      if (has("skillId") && ix && !sk) bad(`teach 의 skillId ${show(eff.skillId)}: 없는 스킬`);
      else if (sk && sk.kind !== "active") bad(`teach 의 '${eff.skillId}' (${sk.name}) 는 액티브가 아니다 (${sk.kind}) — 패시브는 playerHint`);
      if (has("supportId")) {
        const sp = ix ? ix.supports.get(eff.supportId) : null;
        if (ix && !sp) bad(`teach 의 supportId ${show(eff.supportId)}: 없는 코치`);
        else if (sp && sk && !(Array.isArray(sp.teachSkillIds) && sp.teachSkillIds.includes(eff.skillId))) {
          bad(`teach: ${withJosa(sp.name, "은/는")} '${eff.skillId}' (${sk.name}) 를 가르치지 않는다 (teachSkillIds: ${(sp.teachSkillIds || []).join(" · ")})`);
        }
      }
      break;
    }
    case "coachHint": {
      const f = eff.from;
      if (!has("from")) break;
      if (typeof f !== "string" || !f) bad("coachHint 의 from 은 fielded · coach · <코치 id>");
      else if (f === "coach") {
        if (ctx.hasCoach === false) bad("coachHint 의 from 'coach' — 이 이벤트에는 코치가 없다");
      } else if (f !== "fielded" && ix && !ix.supports.has(f)) bad(`coachHint 의 from '${f}' — fielded · coach · <코치 id> 중 하나 (없는 코치)`);
      break;
    }
    case "playerHint": {
      if (!has("skillId")) break;
      const sk = ix ? ix.skills.get(eff.skillId) : null;
      if (ix && !sk) {
        bad(`playerHint 의 skillId ${show(eff.skillId)}: 없는 스킬`);
        break;
      }
      if (sk && sk.kind !== "passive") {
        bad(`playerHint 의 '${eff.skillId}' (${sk.name}) 는 패시브가 아니다 (${sk.kind}) — 액티브는 코치 수업 (teach)`);
        break;
      }
      const t = eff.target === undefined ? "player" : eff.target;
      let owner = null;
      if (typeof t === "string" && t.startsWith("char:")) owner = t.slice(5);
      else if (t === "player" && ctx.protagonist) {
        if (ctx.protagonist.kind === "fixed") owner = ctx.protagonist.charId;
        else if (ctx.protagonist.kind === "generic") {
          bad("playerHint: 주인공이 정해지지 않은 이벤트는 skillId 없이 쓴다 — 그 선수 패시브 목록에서 뽑는다 (R3)");
          break;
        }
      }
      const ch = owner && ix ? ix.chars.get(owner) : null;
      if (ch && !(Array.isArray(ch.passiveIds) && ch.passiveIds.includes(eff.skillId))) {
        bad(`playerHint: '${eff.skillId}' (${sk ? sk.name : "?"}) 는 ${ch.name}의 패시브 목록 (${(ch.passiveIds || []).join(" · ")}) 에 없다 (R3 · L48)`);
      }
      break;
    }
    case "random":
      if (has("chance") && !(typeof eff.chance === "number" && eff.chance > 0 && eff.chance < 1)) bad(`random 의 chance 는 0 과 1 사이 (0.7 = 70%) (지금 ${show(eff.chance)})`);
      break;
    case "nextPct":
      if (has("pct") && !intIn(eff.pct, -100, 200, { nonZero: true })) bad(`nextPct 의 pct 는 % 정수 (40 = +40%, −20 = −20%) (지금 ${show(eff.pct)})`);
      break;
    case "drawNext":
    case "extraPlayNext":
    case "buff":
      if (has("n") && !intIn(eff.n, 1, 3)) bad(`'${type}' 의 n 은 1 ~ 3 정수 (지금 ${show(eff.n)})`);
      break;
    case "score":
      amount(-200, 200);
      break;
    case "restRemaining":
      if (has("stamina") && !intIn(eff.stamina, 0, 100)) bad(`restRemaining 의 stamina 는 0 ~ 100 정수 (지금 ${show(eff.stamina)})`);
      break;
    default:
      break;
  }
}

// ===========================================================================
// E2 — 적용 · 미리보기 · 고르기 · 기대값 (§24.4 · §24.5.3 · §24.11)
// ===========================================================================

const MINUS = "−";
const signed = (n) => (n < 0 ? `${MINUS}${-n}` : `+${n}`);

/** modifier 키 한국어 이름 (미리보기 · 검토 문서) */
export const MODIFIER_LABELS = Object.freeze({
  trainingEfficiency: "레슨 상승",
  injuryRate: "부상률",
  restEffect: "휴식 효과",
  bondGain: "유대 획득",
  hintRate: "힌트율",
  skillPointGain: "SP 획득",
  goalMatchCondition: "경계전 컨디션",
  shootPower: "경기 슛 위력",
  defense: "경기 수비",
  passAttack: "경기 패스",
  tensionGain: "텐션 획득",
  staminaCost: "체력 소모",
  lossPenaltyHalf: "패배 페널티 절반",
  dribbleStaminaRefund: "드리블 체력 환급",
  gaanpaTicket: "간파 사용권",
  gaanpaCostHalf: "간파 비용 절반",
});
/** 정수로 세는 보정 (나머지는 % — 0.1 = +10%) */
export const COUNT_MODIFIERS = Object.freeze(["goalMatchCondition", "lossPenaltyHalf", "gaanpaTicket", "gaanpaCostHalf"]);
/** 방침 버프 한국어 이름 */
export const BUFF_LABELS = Object.freeze({ hojo: "호조", focus: "집중", mood: "분위기", steal: "탈취", press: "압박", poss: "점유" });

/** lesson.json events.fallback (§24.3.6) — 없는 값은 기본값 */
export function fallbackOf(data) {
  const f = (data && data.lesson && data.lesson.events && data.lesson.events.fallback) || {};
  const n = (v, d) => (v !== undefined && v !== null && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    injuredStamina: n(f.injuredStamina, -20),
    uniquePlusTp: n(f.uniquePlusTp, 20),
    cardPickTp: n(f.cardPickTp, 10),
    offerSkipTp: n(f.offerSkipTp, 10),
    noHintSp: n(f.noHintSp, 10),
  };
}

/** 레슨 안 효과인가 (§24.4.2) */
export function isLessonEffect(type) {
  return !!EFFECTS[type] && EFFECTS[type].scope === "lesson";
}

/**
 * @typedef {Object} ApplyCtx
 * @property {string|null} [eventId]
 * @property {string} [trigger]          이벤트 트리거 (modifier 미리보기: preMatch 의 season = "이번 경계전")
 * @property {string|null} [playerId]   주인공 ({선수}, target "player")
 * @property {string|null} [supportId]  그 이벤트의 코치 (bond "coach" · coachHint "coach")
 * @property {string[]} [charIds]
 * @property {string} [uid]             cardPick 으로 고른 덱 카드
 * @property {string} [policy]          방침 버프 이름 (없으면 state.policy)
 * @property {(state: object, data: object, eff: object, rng: object) => (string|string[]|void)} [applyLesson]
 *           레슨 안 효과 적용 (E5 — lesson.resolveSurprise 가 넘긴다). 없으면 레슨 안 효과는 적용 전에 throw.
 */

const playerOf = (state, id) => (id ? (state.players || []).find((p) => p.id === id) || null : null);
const isInjured = (p) => (Number(p && p.injuredTurns) || 0) > 0;
const shortName = (name) => {
  const parts = String(name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || String(name || "");
};
const supportName = (data, id) => {
  const sc = C.supportCard(data, id);
  return sc ? shortName(sc.name) : String(id);
};
const cardName = (data, cardId) => {
  const c = cards.cardList(data).find((x) => x.id === cardId);
  return c ? c.name : String(cardId);
};
const skillName = (data, id) => {
  const sk = C.skillById(data, id);
  return sk ? sk.name : String(id);
};
const statLabel = (stat) => STAT_LABELS[stat] || stat;

/** 효과 목록 + random 갈래 안까지 (깊이 1) */
function flatEffects(effects) {
  const out = [];
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!e || typeof e !== "object") continue;
    out.push(e);
    if (e.type === "random") {
      for (const side of ["then", "else"]) for (const b of Array.isArray(e[side]) ? e[side] : []) if (b && typeof b === "object") out.push(b);
    }
  }
  return out;
}

/** 효과의 target (빠지면 스키마 기본값, 그래도 없으면 player) */
function targetKey(eff) {
  const spec = EFFECTS[eff.type];
  return eff.target === undefined ? (spec && spec.defaultTarget) || "player" : eff.target;
}

/**
 * target → 대상 선수 목록. randomPlayer 는 null (무작위 — 적용 때 rng 로).
 * player = 주인공 (없으면 빈 목록), team = 7명, all = 결장 중인 선수 전원 (heal), char:<id> = 그 캐릭터 선수.
 */
function targetsOf(state, eff, ctx) {
  const t = targetKey(eff);
  if (t === "player") {
    const p = playerOf(state, ctx.playerId);
    return p ? [p] : [];
  }
  if (t === "team") return state.players.slice();
  if (t === "all") return state.players.filter(isInjured);
  if (t === "randomPlayer") return null;
  if (typeof t === "string" && t.startsWith("char:")) return state.players.filter((p) => p.charId === t.slice(5));
  return [];
}

/** 대상 이름 (미리보기) */
function targetLabel(state, eff, ctx) {
  const t = targetKey(eff);
  if (t === "team") return "7명";
  if (t === "all") return "결장 중인 선수 전원";
  if (t === "randomPlayer") return "무작위 1명";
  const list = targetsOf(state, eff, ctx) || [];
  if (list.length) return list.map((p) => p.name).join(" · ");
  if (typeof t === "string" && t.startsWith("char:")) return `${t.slice(5)} (편성 안 됨)`;
  return "선수";
}

/** 이 선수의 고유 카드 덱 항목 (강화 안 된 것 먼저) */
function uniqueEntryOf(state, data, charId) {
  const list = state.deck.filter((e) => {
    const c = cards.cardList(data).find((x) => x.id === e.cardId);
    return c && c.family === "unique" && c.ownerCharId === charId;
  });
  return list.find((e) => !e.plus) || list[0] || null;
}

/** cardPick 후보 (상담과 같은 조건 — 강화: upgradable, 삭제: 덱이 minDeck 장 아래로 줄지 않게) */
function pickCandidates(state, data, op) {
  if (op === "upgrade") return state.deck.filter((e) => C.upgradable(data, e));
  if (op === "delete") {
    const min = Number(C.LD(data).consult && C.LD(data).consult.minDeck) || 0;
    return state.deck.length - 1 >= min ? state.deck.slice() : [];
  }
  return [];
}

/**
 * 고르는 선택지 (cardPick) 의 후보 — 뷰의 choices[].needs 와 resolveEvent 의 uid 검사 (§24.5.3). 순수.
 * 선택지 맨 위 · random 갈래 안의 첫 cardPick (검사가 한 선택지에 하나까지로 막는다). 없으면 null.
 * @returns {{ op: "upgrade"|"delete", candidates: Array<{ uid: string, cardId: string, name: string, plus: boolean }> }|null}
 */
export function effectNeeds(state, data, effects) {
  const pick = flatEffects(effects).find((e) => e.type === "cardPick");
  if (!pick) return null;
  const candidates = pickCandidates(state, data, pick.op).map((e) => ({ uid: e.uid, cardId: e.cardId, name: cardName(data, e.cardId), plus: !!e.plus }));
  return { op: pick.op, candidates };
}

/** 수업 (teach) 을 맡을 코치: supportId, 없으면 그 액티브를 가르치는 첫 편성 코치 (state.supports 순), 그래도 없으면 null */
function teacherOf(state, data, eff) {
  if (eff.supportId) return eff.supportId;
  const st = state.supports.find((s) => (C.coachSkillList(data, s.id) || []).includes(eff.skillId));
  return st ? st.id : null;
}

/** coachHint 후보가 있는가 (drawHint · drawHintFrom 과 같은 후보 — rng 없이) */
function coachHintPossible(state, data, from, ctx) {
  const has = (sid) => (C.coachSkillList(data, sid) || []).some((id) => C.hintCandidate(state, data, id));
  if (from === "fielded") {
    return state.supports.some((st) => {
      const sc = C.supportCard(data, st.id);
      return has(st.id) && (Number(sc && sc.hintRate) || 0) > 0;
    });
  }
  const sid = from === "coach" ? ctx.supportId : from;
  return !!sid && has(sid);
}

/** playerHint 후보 (그 선수 · skillId 가 있으면 그 스킬만 — 그 선수 목록 · 아직 없음 · 포지션 · 힌트 Lv3 미만) */
function playerHintCands(state, data, p, skillId) {
  if (!p) return [];
  if (skillId) {
    const ok = passives.canBuyPassive(state, data, skillId, p.id).ok && ((state.hints && state.hints[skillId]) || 0) < MAX_HINT_LEVEL;
    return ok ? [skillId] : [];
  }
  return passives.playerHintCands(state, data, p.id);
}

/** SP 효과의 실제 값 (양수면 × (1 + skillPointGain), effects.js 와 같다) */
const spGain = (state, amount) => (amount > 0 ? Math.round(amount * (1 + getModifier(state, "skillPointGain"))) : Math.round(amount));
/** 유대 효과의 실제 값 (양수면 + bondGain, effects.js 와 같다) */
const bondDelta = (state, amount) => amount + (amount > 0 ? getModifier(state, "bondGain") : 0);

function relicPool(state, data) {
  const owned = new Set(state.relics || []);
  return (data.relics || []).filter((r) => r && !owned.has(r.id)).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// 미리보기 (§24.4.1 — 데이터에 쓰지 않고 지금 상태로 만든다)
// ---------------------------------------------------------------------------

/**
 * 효과 목록 → 한국어 미리보기 (지금 상태: 이름 · 대체값 · 남은 레슨). 순수 — rng · 상태 변경 없음.
 * @param {object} state
 * @param {object} data
 * @param {object[]} effects
 * @param {ApplyCtx} [ctx]
 * @returns {{ text: string, lines: string[] }}  lines = 효과 한 줄씩 (random 은 "70%: … / 30%: …" 한 줄), text = lines 를 ", " 로
 */
export function describe(state, data, effects, ctx = {}) {
  const lines = (Array.isArray(effects) ? effects : []).map((e) => describeOne(state, data, e, ctx || {}));
  return { text: lines.length ? lines.join(", ") : "효과 없음", lines };
}

function describeList(state, data, effects, ctx) {
  const list = Array.isArray(effects) ? effects : [];
  return list.length ? list.map((e) => describeOne(state, data, e, ctx)).join(", ") : "효과 없음";
}

function describeOne(state, data, e, ctx) {
  if (!e || typeof e !== "object") return "?";
  const fb = fallbackOf(data);
  const a = Number(e.amount) || 0;
  switch (e.type) {
    case "stat": {
      const who = targetLabel(state, e, ctx);
      const one = targetKey(e) === "team" ? null : (targetsOf(state, e, ctx) || [])[0] || null;
      if (e.stat === "main2") {
        const pair = one ? ` (${cards.mainStatsOf(one.position).map(statLabel).join(" · ")})` : "";
        return `${who} 주 스탯 2개${pair} ${signed(a)}씩`;
      }
      if (e.stat === "main") return `${who} 주 스탯${one ? ` (${statLabel(mainStatOf(one.position))})` : ""} ${signed(a)}`;
      if (e.stat === "random") return `${who} 무작위 스탯 ${signed(a)}`;
      return `${who} ${statLabel(e.stat)} ${signed(a)}`;
    }
    case "stamina":
      return e.full ? `${targetLabel(state, e, ctx)} 체력 완전 회복` : `${targetLabel(state, e, ctx)} 체력 ${signed(a)}`;
    case "condition":
      return `컨디션 ${signed(a)}`;
    case "goalCondition":
      return `다음 경계전 1회만 컨디션 ${signed(a)}`;
    case "teamwork":
      return `팀워크 ${signed(a)}`;
    case "sp":
      return `SP ${signed(spGain(state, a))}`;
    case "tp":
      return `TP ${signed(a)}`;
    case "bond": {
      const d = bondDelta(state, a);
      if (e.target === "all") return `편성 코치 전원 유대 ${signed(d)}`;
      const sid = e.target === "coach" ? ctx.supportId : e.target;
      if (!sid) return `코치 유대 ${signed(d)}`;
      const fielded = state.supports.some((s) => s.id === sid);
      return `${supportName(data, sid)} 유대 ${signed(d)}${fielded ? "" : " (편성되지 않아 효과 없음)"}`;
    }
    case "injury": {
      const list = targetsOf(state, e, ctx);
      if (list === null) return `무작위 1명 다음 레슨 1회 결장 (이미 결장이면 체력 ${signed(fb.injuredStamina)})`;
      if (!list.length) return `${targetLabel(state, e, ctx)} 다음 레슨 1회 결장`;
      return list.map((p) => (isInjured(p) ? `${p.name} 체력 ${signed(fb.injuredStamina)} (이미 결장 중)` : `${p.name} 다음 레슨 1회 결장`)).join(", ");
    }
    case "heal": {
      if (targetKey(e) === "all") {
        const n = state.players.filter(isInjured).length;
        return n ? `결장 중인 선수 전원 결장 해제 (${n}명)` : "결장 중인 선수 전원 결장 해제 (지금은 없음)";
      }
      const list = targetsOf(state, e, ctx) || [];
      return list.length && !list.some(isInjured) ? `${targetLabel(state, e, ctx)} 결장 해제 (결장 중이 아님)` : `${targetLabel(state, e, ctx)} 결장 해제`;
    }
    case "relic":
      return relicPool(state, data).length ? "유물 3택1" : "유물 3택1 (남은 유물 없음)";
    case "modifier": {
      const dur = e.duration === "run" ? "런 동안" : ctx.trigger === "preMatch" ? "이번 경계전" : "이번 시즌";
      const label = MODIFIER_LABELS[e.key] || e.key;
      const amt = COUNT_MODIFIERS.includes(e.key) ? (a > 0 ? String(a) : signed(a)) : `${signed(Math.round(a * 1000) / 10)}%`;
      return `${dur} ${label} ${amt}`;
    }
    case "cardAdd": {
      const raw = cards.cardList(data).find((x) => x.id === e.cardId);
      let coach = "";
      if (raw && raw.family === "coach" && raw.coach && state.supports.some((s) => s.id === raw.coach.supportId)) {
        coach = `, ${supportName(data, raw.coach.supportId)} 유대 +${Number(C.LD(data).bond && C.LD(data).bond.acquire) || 0}`;
      }
      return `덱에 「${cardName(data, e.cardId)}${e.plus ? "+" : ""}」 추가${coach}`;
    }
    case "cardPick": {
      const n = pickCandidates(state, data, e.op).length;
      if (e.op === "delete") {
        return n ? "덱의 카드 1장 삭제 (고른다)" : `TP ${signed(fb.cardPickTp)} (덱이 ${Number(C.LD(data).consult.minDeck) || 0}장 아래로 줄지 않아 삭제할 카드 없음)`;
      }
      return n ? "덱의 카드 1장 강화 (고른다)" : `TP ${signed(fb.cardPickTp)} (강화할 카드 없음)`;
    }
    case "cardUpgradeRandom":
      return pickCandidates(state, data, "upgrade").length ? "덱의 카드 1장 무작위 강화" : `TP ${signed(fb.cardPickTp)} (강화할 카드 없음)`;
    case "rewardOffer":
      return "보상 카드 3택1";
    case "uniquePlus": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      if (!p) return `${targetLabel(state, e, ctx)} 고유 카드 이번 런 동안 강화판`;
      const entry = uniqueEntryOf(state, data, p.charId);
      if (!entry) return `TP ${signed(fb.uniquePlusTp)} (덱에 ${p.name} 고유 카드가 없음)`;
      if (!C.upgradable(data, entry)) return `TP ${signed(fb.uniquePlusTp)} (${p.name} 고유 카드 「${cardName(data, entry.cardId)}」 이미 강화판)`;
      return `${p.name} 고유 카드 「${cardName(data, entry.cardId)}」 이번 런 동안 강화판`;
    }
    case "teach": {
      const skill = skillName(data, e.skillId);
      const teacher = teacherOf(state, data, e);
      if (!teacher) return `${describeOne(state, data, { type: "coachHint", from: "fielded" }, ctx)} — ${withJosa(skill, "을/를")} 가르칠 편성 코치가 없음`;
      if (C.lessonsLeft(state, data) === 0) return `코치 수업: ${skill} → 남은 레슨이 없어 런 끝에 SP +${C.declineSpOf(data)}`;
      return `코치 수업: ${skill} (${supportName(data, teacher)} — 다음 레슨 보상에서 가르칠 선수를 고른다)`;
    }
    case "coachHint": {
      const from = e.from === "fielded" ? "편성 코치" : supportName(data, e.from === "coach" ? ctx.supportId : e.from);
      if (!coachHintPossible(state, data, e.from, ctx)) return `SP ${signed(fb.noHintSp)} (가르칠 코치 스킬 없음)`;
      if (C.lessonsLeft(state, data) === 0) return `코치 수업 1 → 남은 레슨이 없어 런 끝에 SP +${C.declineSpOf(data)}`;
      return `코치 수업 1 (${from} 액티브 중 무작위)`;
    }
    case "playerHint": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      const who = targetLabel(state, e, ctx);
      if (p && !playerHintCands(state, data, p, e.skillId).length) {
        return `SP ${signed(fb.noHintSp)} (${who}${e.skillId ? ` · ${skillName(data, e.skillId)}` : ""} 힌트를 더 줄 수 없음)`;
      }
      return e.skillId ? `${who} · ${skillName(data, e.skillId)} 힌트 1` : `${who} 패시브 힌트 1`;
    }
    case "random": {
      const p = Math.round(Number(e.chance) * 100);
      return `${p}%: ${describeList(state, data, e.then, ctx)} / ${100 - p}%: ${describeList(state, data, e.else, ctx)}`;
    }
    // ---- 레슨 안 효과 (§24.4.2 — E5 가 다듬는다) ----
    case "nextPct":
      return `다음 카드 위력 ${signed(Number(e.pct) || 0)}%`;
    case "nextNoFail":
      return "다음 카드 실패 판정 없음";
    case "drawNext":
      return `다음 턴 손패 +${e.n}`;
    case "extraPlayNext":
      return `다음 턴 카드 ${e.n}장 더 낼 수 있다`;
    case "score":
      return `이번 레슨 점수 ${signed(a)}`;
    case "buff": {
      const pol = ((data.policies && data.policies.policies) || []).find((x) => x.id === (ctx.policy || state.policy));
      const key = pol && Array.isArray(pol.buffs) ? pol.buffs[0] : null;
      return `${(key && BUFF_LABELS[key]) || "방침 버프"} +${e.n}`;
    }
    case "restRemaining":
      return `${targetLabel(state, e, ctx)} 이번 레슨 남은 턴 쉼 (대상 제외, 체력 +${e.stamina})`;
    case "injureNow":
      return `${targetLabel(state, e, ctx)} 결장 (이번 레슨 남은 턴도)`;
    default:
      return `${e.type}?`;
  }
}

// ---------------------------------------------------------------------------
// 적용
// ---------------------------------------------------------------------------

/** 주인공 (ctx.playerId) 이 있어야 하는 효과인가 */
function needsProtagonist(e) {
  const spec = EFFECTS[e.type];
  if (!spec || !spec.targets) return false;
  return targetKey(e) === "player";
}

/**
 * 효과 목록을 상태에 적용한다 (in-place). 적힌 순서대로, 같은 선택지의 효과는 모두 같은 주인공 (ctx) 을 가리킨다.
 * 검사를 먼저 끝내고 (모르는 type · 주인공 · 고르는 카드 uid · 레슨 안 효과 · 3택1 겹침) 실패하면 상태를 바꾸지 않고 throw.
 * rng 는 부르는 쪽이 연 것 (state.rngState) 을 받고, 저장도 부르는 쪽이 한다.
 * @param {object} state
 * @param {object} data
 * @param {object[]} effects
 * @param {ApplyCtx} ctx
 * @param {{ chance: Function, pick: Function, weighted: Function, shuffle: Function }} rng
 * @returns {{ branch: "then"|"else"|null, lines: string[] }}  branch = 맨 위 random 의 갈래, lines = 실제로 일어난 일 (한국어)
 */
export function applyEffects(state, data, effects, ctx = {}, rng) {
  const list = Array.isArray(effects) ? effects : [];
  const c = ctx || {};
  // ---- 검사 (상태를 바꾸기 전에) ----
  for (const e of flatEffects(list)) {
    if (!EFFECTS[e.type]) throw new Error(`알 수 없는 효과 type: '${e.type}'`);
    if (isLessonEffect(e.type) && typeof c.applyLesson !== "function") {
      throw new Error(`'${e.type}' 는 레슨 안 효과라 레슨 깜짝 이벤트에서만 적용한다 (§24.4.2)`);
    }
    if (e.type === "rewardOffer" && state.pendingCardOffer) throw new Error("고르지 않은 보상 카드 3택1 이 이미 있습니다");
    if (needsProtagonist(e) && !playerOf(state, c.playerId)) throw new Error(`'${e.type}' 가 주인공을 가리키는데 주인공 (ctx.playerId) 이 없습니다`);
  }
  const needs = effectNeeds(state, data, list);
  if (needs && needs.candidates.length && !needs.candidates.some((x) => x.uid === c.uid)) {
    const what = needs.op === "delete" ? "삭제" : "강화";
    throw new Error(c.uid ? `카드 '${c.uid}' 은(는) 고를 수 없습니다 (${what} 후보가 아님)` : `덱의 카드 1장을 골라야 합니다 (${what} — uid)`);
  }
  if (!rng) throw new Error("applyEffects: rng 가 필요합니다");
  // ---- 적용 ----
  const out = { branch: null, lines: [] };
  for (const e of list) {
    if (e.type === "random") {
      const ok = rng.chance(Number(e.chance));
      out.branch = ok ? "then" : "else";
      const branch = ok ? e.then : e.else;
      for (const b of Array.isArray(branch) ? branch : []) applyOne(state, data, b, c, rng, out.lines);
    } else applyOne(state, data, e, c, rng, out.lines);
  }
  return out;
}

function addStamina(p, n) {
  p.stamina = clamp(Math.round((Number(p.stamina) || 0) + n), 0, 100);
}

function addSp(state, n) {
  state.skillPoints = Math.max(0, Math.round((Number(state.skillPoints) || 0) + n));
}

function addTp(state, n) {
  state.trainingPoints = Math.max(0, Math.round((Number(state.trainingPoints) || 0) + n));
}

function pushTeach(state, skillId, supportId) {
  if (!Array.isArray(state.pendingTeach)) state.pendingTeach = [];
  state.pendingTeach.push(C.teachEntry(skillId, supportId, "event"));
}

/** 수업 1개 줄 (남은 레슨이 없으면 런 끝에 SP 로 바뀐다 — lessonRun 시즌 끝) */
function teachLine(state, data, skillId, supportId) {
  const tail = C.lessonsLeft(state, data) === 0 ? ` (남은 레슨이 없어 런 끝에 SP +${C.declineSpOf(data)})` : "";
  return `코치 수업: ${skillName(data, skillId)}${supportId ? ` (${supportName(data, supportId)})` : ""}${tail}`;
}

/** coachHint 적용: 액티브 → 수업 대기열, 패시브 → 힌트 레벨 (grantHint 가 이미 올렸다), 후보 없음 → SP */
function applyCoachHint(state, data, from, ctx, rng, lines) {
  const fb = fallbackOf(data);
  let h = null;
  if (from === "fielded") h = C.drawHint(state, data, rng);
  else {
    const sid = from === "coach" ? ctx.supportId : from;
    h = sid ? C.drawHintFrom(state, data, rng, sid) : null;
  }
  if (!h) {
    addSp(state, fb.noHintSp);
    lines.push(`SP ${signed(fb.noHintSp)} (가르칠 코치 스킬 없음)`);
  } else if (h.active) {
    pushTeach(state, h.skillId, h.supportId);
    lines.push(teachLine(state, data, h.skillId, h.supportId));
  } else lines.push(`${skillName(data, h.skillId)} 힌트 Lv${h.level}`);
}

function applyOne(state, data, e, ctx, rng, lines) {
  const fb = fallbackOf(data);
  const a = Number(e.amount) || 0;
  const cap = Number(data.config && data.config.statCap) || 1000;
  switch (e.type) {
    case "stat": {
      const list = targetsOf(state, e, ctx) || [];
      const done = [];
      for (const p of list) {
        let stats;
        if (e.stat === "main2") stats = cards.mainStatsOf(p.position);
        else if (e.stat === "main") stats = [mainStatOf(p.position)];
        else if (e.stat === "random") stats = [rng.pick(STATS)];
        else stats = [e.stat];
        for (const s of stats) p.stats[s] = clamp(Math.round((Number(p.stats[s]) || 0) + a), 0, cap);
        done.push({ p, stats });
      }
      if (targetKey(e) === "team") lines.push(describeOne(state, data, e, ctx));
      else for (const { p, stats } of done) lines.push(`${p.name} ${stats.map(statLabel).join(" · ")} ${signed(a)}${stats.length > 1 ? "씩" : ""}`);
      break;
    }
    case "stamina": {
      for (const p of targetsOf(state, e, ctx) || []) {
        if (e.full) p.stamina = 100;
        else addStamina(p, a);
      }
      lines.push(describeOne(state, data, e, ctx));
      break;
    }
    case "condition":
      state.condition = clamp(Math.round((Number(state.condition) || 0) + a), 0, 4);
      lines.push(`컨디션 ${signed(a)}`);
      break;
    case "goalCondition":
      // 대비 레슨 클리어의 경계전 컨디션과 같은 꼴 (afterLesson) — 이번 시즌 경계전 1회
      state.modifiers.push({ key: "goalMatchCondition", amount: a, untilSeason: state.season, source: ctx.eventId ? `event:${ctx.eventId}` : "event" });
      lines.push(`다음 경계전 1회만 컨디션 ${signed(a)}`);
      break;
    case "teamwork":
      state.teamwork = clamp(Math.round((Number(state.teamwork) || 0) + a), 0, 100);
      lines.push(`팀워크 ${signed(a)}`);
      break;
    case "sp": {
      const n = spGain(state, a);
      addSp(state, n);
      lines.push(`SP ${signed(n)}`);
      break;
    }
    case "tp":
      addTp(state, a);
      lines.push(`TP ${signed(a)}`);
      break;
    case "bond": {
      const d = bondDelta(state, a);
      let list;
      if (e.target === "all") list = state.supports.slice();
      else {
        const sid = e.target === "coach" ? ctx.supportId : e.target;
        list = sid ? state.supports.filter((s) => s.id === sid) : [];
      }
      for (const st of list) st.bond = clamp(Math.round((Number(st.bond) || 0) + d), 0, 100);
      if (e.target === "all") lines.push(`편성 코치 전원 유대 ${signed(d)}`);
      else if (list.length) lines.push(`${supportName(data, list[0].id)} 유대 ${signed(d)}`);
      break;
    }
    case "injury": {
      let list = targetsOf(state, e, ctx);
      if (list === null) {
        const healthy = state.players.filter((p) => !isInjured(p));
        const pick = rng.pick(healthy.length ? healthy : state.players);
        list = pick ? [pick] : [];
      }
      for (const p of list) {
        if (isInjured(p)) {
          addStamina(p, fb.injuredStamina);
          lines.push(`${p.name} 체력 ${signed(fb.injuredStamina)} (이미 결장 중)`);
        } else {
          p.injuredTurns = 1; // 레슨 1회만 (§18.1 — 경기는 나온다)
          lines.push(`${p.name} 다음 레슨 1회 결장`);
        }
      }
      break;
    }
    case "heal": {
      const healed = (targetsOf(state, e, ctx) || []).filter(isInjured);
      for (const p of healed) p.injuredTurns = 0;
      lines.push(healed.length ? `${healed.map((p) => p.name).join(" · ")} 결장 해제` : "결장 해제 (결장 중인 선수 없음)");
      break;
    }
    case "relic": {
      // 옛 effects.js 의 relic 과 같다: 갖지 않은 유물 중 3개 → pendingRelicChoices → phase relic
      const pool = relicPool(state, data);
      const choices = pool.length ? rng.shuffle(pool).slice(0, 3) : [];
      if (choices.length) state.pendingRelicChoices = choices;
      lines.push(choices.length ? "유물 3택1" : "유물 3택1 (남은 유물 없음)");
      break;
    }
    case "modifier":
      state.modifiers.push({ key: e.key, amount: Number(e.amount) || 0, untilSeason: e.duration === "run" ? null : state.season, source: ctx.eventId ? `event:${ctx.eventId}` : "event" });
      lines.push(describeOne(state, data, e, ctx));
      break;
    case "cardAdd": {
      C.addToDeck(state, e.cardId, !!e.plus);
      const b = C.acquireBond(state, data, e.cardId);
      const raw = cards.getCard(data, e.cardId);
      lines.push(`덱에 「${raw.name}${e.plus ? "+" : ""}」 추가${b ? `, ${supportName(data, raw.coach.supportId)} 유대 +${b}` : ""}`);
      break;
    }
    case "cardPick": {
      const entry = C.deckEntry(state, ctx.uid);
      const ok = !!entry && pickCandidates(state, data, e.op).some((x) => x.uid === entry.uid);
      if (!ok) {
        addTp(state, fb.cardPickTp);
        lines.push(`TP ${signed(fb.cardPickTp)} (${e.op === "delete" ? "삭제" : "강화"}할 카드 없음)`);
      } else if (e.op === "delete") {
        state.deck = state.deck.filter((x) => x.uid !== entry.uid);
        lines.push(`「${cardName(data, entry.cardId)}${entry.plus ? "+" : ""}」 삭제`);
      } else {
        entry.plus = true;
        lines.push(`「${cardName(data, entry.cardId)}+」 강화`);
      }
      break;
    }
    case "cardUpgradeRandom": {
      const cands = pickCandidates(state, data, "upgrade");
      if (!cands.length) {
        addTp(state, fb.cardPickTp);
        lines.push(`TP ${signed(fb.cardPickTp)} (강화할 카드 없음)`);
      } else {
        const entry = rng.pick(cands);
        entry.plus = true;
        lines.push(`「${cardName(data, entry.cardId)}+」 강화 (무작위)`);
      }
      break;
    }
    case "rewardOffer": {
      const offer = C.rollRewardOffer(state, data, rng, "event", false);
      if (!offer.length) {
        addTp(state, fb.offerSkipTp);
        lines.push(`TP ${signed(fb.offerSkipTp)} (고를 카드 없음)`);
      } else {
        state.pendingCardOffer = { cards: offer.map((o) => ({ ...o })), src: ctx.eventId || null };
        lines.push("보상 카드 3택1");
      }
      break;
    }
    case "uniquePlus": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      const entry = p ? uniqueEntryOf(state, data, p.charId) : null;
      if (entry && C.upgradable(data, entry)) {
        entry.plus = true;
        lines.push(`${p.name} 고유 카드 「${cardName(data, entry.cardId)}+」 이번 런 동안 강화판`);
      } else {
        addTp(state, fb.uniquePlusTp);
        lines.push(`TP ${signed(fb.uniquePlusTp)} (${p ? `${p.name} 고유 카드가 ${entry ? "이미 강화판" : "덱에 없음"}` : "고유 카드 없음"})`);
      }
      break;
    }
    case "teach": {
      const teacher = teacherOf(state, data, e);
      if (!teacher) applyCoachHint(state, data, "fielded", ctx, rng, lines);
      else {
        pushTeach(state, e.skillId, teacher);
        lines.push(teachLine(state, data, e.skillId, teacher));
      }
      break;
    }
    case "coachHint":
      applyCoachHint(state, data, e.from, ctx, rng, lines);
      break;
    case "playerHint": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      let h = null;
      if (p && e.skillId) {
        if (playerHintCands(state, data, p, e.skillId).length) {
          if (!state.hints || typeof state.hints !== "object") state.hints = {};
          state.hints[e.skillId] = Math.min(MAX_HINT_LEVEL, (state.hints[e.skillId] || 0) + 1);
          h = { skillId: e.skillId, level: state.hints[e.skillId] };
        }
      } else if (p) h = passives.drawPlayerHint(state, data, rng, p.id);
      if (h) lines.push(`${p.name} · ${skillName(data, h.skillId)} 힌트 Lv${h.level}`);
      else {
        addSp(state, fb.noHintSp);
        lines.push(`SP ${signed(fb.noHintSp)} (힌트를 더 줄 수 없음)`);
      }
      break;
    }
    default: {
      if (isLessonEffect(e.type)) {
        const text = describeOne(state, data, e, ctx);
        const r = ctx.applyLesson(state, data, e, rng);
        if (Array.isArray(r)) lines.push(...r);
        else lines.push(typeof r === "string" && r ? r : text);
        break;
      }
      throw new Error(`알 수 없는 효과 type: '${e.type}'`);
    }
  }
}

// ---------------------------------------------------------------------------
// 감독 AI 기대값 (§24.11 [가정]) — 순수
// ---------------------------------------------------------------------------

/**
 * 기대값 표 (§24.11 [가정]). 표에 없는 것: 경계전 컨디션 1 = 20 · 보정 (modifier) 시즌 20 / 런 40 · 결장 해제 1명 = 40 ·
 * 남은 턴 쉼 = 체력 값 − 20 (그동안 못 크는 몫) [가정].
 */
export const SCORE = Object.freeze({
  stat: 1, stamina: 0.3, lowStaminaMult: 2, lowStaminaBelow: 50, condition: 25, teamwork: 3, sp: 1, tp: 1.5, bond: 1,
  teach: 40, playerHint: 20, cardAdd: 30, upgrade: 25, delete: 15, rewardOffer: 35, relic: 50, injury: -40, heal: 40,
  goalCondition: 20, modifierSeason: 20, modifierRun: 40,
  score: 1, nextPct: 0.8, nextNoFail: 15, drawNext: 30, extraPlayNext: 80, buff: 30, injureNow: -40, restLost: 20,
});

/**
 * 효과 목록의 기대값 (감독 AI · 추천 배지). 확률은 기대값, 대체값 (이미 결장 → 체력, 강화판 → TP …) 은 대체값으로. 순수.
 * @returns {number}
 */
export function scoreEffects(state, data, effects, ctx = {}) {
  let v = 0;
  for (const e of Array.isArray(effects) ? effects : []) v += scoreOne(state, data, e, ctx || {});
  return Math.round(v * 100) / 100;
}

/** 체력 n 의 값: 실제로 바뀌는 양 × 0.3, 체력 50 미만이면 × 2 */
function staminaValue(p, n) {
  const st = Number(p.stamina) || 0;
  const real = n > 0 ? Math.min(n, 100 - st) : Math.max(n, -st);
  return real * SCORE.stamina * (st < SCORE.lowStaminaBelow ? SCORE.lowStaminaMult : 1);
}

function scoreOne(state, data, e, ctx) {
  if (!e || typeof e !== "object") return 0;
  const fb = fallbackOf(data);
  const a = Number(e.amount) || 0;
  const tpV = (n) => n * SCORE.tp;
  switch (e.type) {
    case "stat":
      return (targetsOf(state, e, ctx) || []).length * (e.stat === "main2" ? 2 : 1) * a * SCORE.stat;
    case "stamina":
      return (targetsOf(state, e, ctx) || []).reduce((s, p) => s + staminaValue(p, e.full ? 100 : a), 0);
    case "condition": {
      const c = Number(state.condition) || 0;
      return (a > 0 ? Math.min(a, 4 - c) : Math.max(a, -c)) * SCORE.condition;
    }
    case "goalCondition":
      return a * SCORE.goalCondition;
    case "teamwork": {
      const t = Number(state.teamwork) || 0;
      return (a > 0 ? Math.min(a, 100 - t) : Math.max(a, -t)) * SCORE.teamwork;
    }
    case "sp":
      return spGain(state, a) * SCORE.sp;
    case "tp":
      return tpV(a);
    case "bond": {
      const sid = e.target === "coach" ? ctx.supportId : e.target;
      const n = e.target === "all" ? state.supports.length : state.supports.some((s) => s.id === sid) ? 1 : 0;
      return n * bondDelta(state, a) * SCORE.bond;
    }
    case "injury": {
      const list = targetsOf(state, e, ctx);
      if (list === null) return SCORE.injury;
      return list.reduce((s, p) => s + (isInjured(p) ? staminaValue(p, fb.injuredStamina) : SCORE.injury), 0);
    }
    case "heal":
      return (targetsOf(state, e, ctx) || []).filter(isInjured).length * SCORE.heal;
    case "relic":
      return relicPool(state, data).length ? SCORE.relic : 0;
    case "modifier":
      return Math.sign(Number(e.amount) || 0) * (e.duration === "run" ? SCORE.modifierRun : SCORE.modifierSeason);
    case "cardAdd":
      return SCORE.cardAdd;
    case "cardPick":
      return pickCandidates(state, data, e.op).length ? (e.op === "delete" ? SCORE.delete : SCORE.upgrade) : tpV(fb.cardPickTp);
    case "cardUpgradeRandom":
      return pickCandidates(state, data, "upgrade").length ? SCORE.upgrade : tpV(fb.cardPickTp);
    case "rewardOffer":
      return SCORE.rewardOffer;
    case "uniquePlus": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      const entry = p ? uniqueEntryOf(state, data, p.charId) : null;
      return entry && C.upgradable(data, entry) ? SCORE.upgrade : tpV(fb.uniquePlusTp);
    }
    case "teach":
      if (!teacherOf(state, data, e)) return scoreOne(state, data, { type: "coachHint", from: "fielded" }, ctx);
      return C.lessonsLeft(state, data) === 0 ? C.declineSpOf(data) * SCORE.sp : SCORE.teach;
    case "coachHint":
      if (!coachHintPossible(state, data, e.from, ctx)) return fb.noHintSp * SCORE.sp;
      return C.lessonsLeft(state, data) === 0 ? C.declineSpOf(data) * SCORE.sp : SCORE.teach;
    case "playerHint": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      return p && playerHintCands(state, data, p, e.skillId).length ? SCORE.playerHint : fb.noHintSp * SCORE.sp;
    }
    case "random": {
      const ch = Number(e.chance) || 0;
      const side = (list) => (Array.isArray(list) ? list : []).reduce((s, x) => s + scoreOne(state, data, x, ctx), 0);
      return ch * side(e.then) + (1 - ch) * side(e.else);
    }
    case "nextPct":
      return (Number(e.pct) || 0) * SCORE.nextPct;
    case "nextNoFail":
      return SCORE.nextNoFail;
    case "drawNext":
      return (Number(e.n) || 0) * SCORE.drawNext;
    case "extraPlayNext":
      return (Number(e.n) || 0) * SCORE.extraPlayNext;
    case "score":
      return a * SCORE.score;
    case "buff":
      return (Number(e.n) || 0) * SCORE.buff;
    case "restRemaining": {
      const p = (targetsOf(state, e, ctx) || [])[0] || null;
      return (p ? staminaValue(p, Number(e.stamina) || 0) : 0) - SCORE.restLost;
    }
    case "injureNow":
      return SCORE.injureNow;
    default:
      return 0;
  }
}
