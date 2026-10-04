/**
 * lessonEffects.js — 레슨 런 이벤트 효과 층 (LESSON_PROTO_PLAN §24.4 · §24.5.1).
 *
 * E1: 효과 스키마 표 `EFFECTS` (type 마다 키 · 값 · 대상 · 쓸 수 있는 트리거) 와 검사 `effectErrors(eff, where, ctx)`.
 *     `lessonEvents.validateLessonEvents` 가 선택지 효과마다 부른다.
 * E2: `applyEffects(state, data, effects, ctx, rng)` · `describe(state, data, effects, ctx)` 를 더한다 (이 파일).
 *
 * - 런에 남는 효과 (§24.4.1, scope "run") 는 모든 트리거가 쓴다. 단 깜짝 (surprise) 은 §24.4.2 끝의 목록
 *   (stamina · teamwork · condition · bond · coachHint · playerHint · tp · random) 만.
 * - 레슨 안 효과 (§24.4.2, scope "lesson") 는 깜짝 전용.
 * - 옛 effects.js 의 적용 함수는 부르지 않는다 (MODIFIER_KEYS 목록만 같이 쓴다 — 경기가 읽는 보정 키).
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 없음, 입력을 바꾸지 않는다.
 */
import { MODIFIER_KEYS } from "./effects.js";
import { STATS } from "./training.js";
import { withJosa } from "./lessonText.js";

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
