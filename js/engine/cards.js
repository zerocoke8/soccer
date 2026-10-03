/**
 * cards.js — 카드 레슨 카드 정의 (LESSON_PROTO_PLAN §4.3 · §14.6 · §14.8 · §14.9).
 *
 * 데이터: data.cards = data/cards.json ({ version: 2, cards: [...] }), data.lesson = data/lesson.json, data.policies = data/policies.json.
 * 이 모듈이 하는 일:
 *   - 카드 정의 찾기 (`indexCards` · `getCard`)
 *   - 해석 (`resolveCardDef`): base → (코치이고 유대 ≥ upgradeAt) bond80 → (plus) plus. 매번 새로 계산하고 상태에 저장하지 않는다.
 *   - 대상 (`targetsFor`): 놓은 점(at, 필드 %) 또는 playerId → 선수 id. 구역 기하는 zones.js. 죽은 카드 (`deadReason`)
 *   - 비용 (`costBase` · `staminaCost`): 강화 전 기본 카드의 1인 위력 × 비용률 × 압박 배율 (1인당 — 인원과 무관)
 *   - 주 스탯 쌍 (`mainStatsOf`), 데이터 검증 (`validateCardsData`)
 *
 * 대상 종류 (§14.6): single(+onlyZones) · circle(+size) · all · owner · none. power 가 null 인 single = 회복 단일 (결장 · 벤치 포함 7명).
 * "경기장 선수" = 레슨 중 이번 턴 구역(lesson.zones)에 서 있고 벤치 · 결장이 아닌 선수 (state.players 순서 = 슬롯 순서).
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않고, 입력을 바꾸지 않으며, rng 를 쓰지 않는다.
 */
import { STATS } from "./training.js";
import * as zones from "./zones.js";

// ---------------------------------------------------------------------------
// 닫힌 목록 (§4.3 · §14.8)
// ---------------------------------------------------------------------------
export const POLICY_FAMILIES = ["ace", "team", "counter", "press", "poss"];
export const CARD_FAMILIES = ["common", ...POLICY_FAMILIES, "unique", "coach", "prep"];
export const TARGET_KINDS = ["single", "circle", "all", "owner", "none"];
export const CIRCLE_SIZES = ["small", "medium", "large"];
export const PREP_FOR = ["dribble", "pass", "midrange"];
export const EFFECT_WHEN = ["always", "success", "consume"];
export const HEAL_TO = ["target", "all", "defense", "mostTired", "owner"];
/** 강화판 · 유대 80에서 덮어쓸 수 있는 필드 */
export const PLUS_FIELDS = ["power", "effects", "mods"];
export const BOND80_FIELDS = ["power", "effects", "mods", "desc", "descPlus"];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isInt = (v) => Number.isInteger(v);


/** mods 키 → 값 검사 */
export const MOD_KEYS = {
  noFail: (v) => v === true,
  failPlus: (v) => isNum(v) && v > 0 && v < 1,
  focusX2: (v) => v === true,
  lastTurnX2: (v) => v === 1 || v === 2,
  underdog: (v) => isNum(v) && v > 0,
  stealPer: (v) => isNum(v) && v > 0,
  stealBuild: (v) => isInt(v) && v > 0,
  possX2: (v) => v === true,
  possKeep: (v) => v === true,
  noPressCost: (v) => v === "always" || v === "atLeast2",
  perMood: (v) => isNum(v) && v > 0,
  perPress: (v) => isNum(v) && v > 0,
  lessonMult: (v) =>
    !!v && Array.isArray(v.stats) && v.stats.length > 0 && v.stats.every((s) => STATS.includes(s)) && isNum(v.mult) && v.mult > 0 &&
    Object.keys(v).every((k) => k === "stats" || k === "mult"),
};

/** effects type → 필드 검사 (type · when 말고 이 필드만 허용) */
export const EFFECT_TYPES = {
  hojo: { n: (v) => isInt(v) && v > 0 },
  focus: { n: (v) => isInt(v) && v > 0 },
  mood: { n: (v) => isInt(v) && v > 0 },
  moodX2: {},
  noDecay: { turns: (v) => isInt(v) && v > 0 },
  steal: { n: (v) => isInt(v) && v > 0 },
  press: { n: (v) => isInt(v) && v > 0 },
  pressDrop: { perStage: (v) => isNum(v) && v > 0 },
  poss: { n: (v) => isInt(v) && v > 0 },
  possGuard: { n: (v) => isInt(v) && v > 0 },
  heal: { to: (v) => HEAL_TO.includes(v), n: (v) => isInt(v) && v !== 0 },
  teamwork: { n: (v) => isInt(v) && v > 0 },
  nextPct: { pct: (v) => isNum(v) && v > 0 },
  nextPairPct: { pct: (v) => isNum(v) && v > 0 },
  nextNoFail: {},
  nextCostZero: {},
  routine: { n: (v) => isInt(v) && v > 0 },
  extraPlay: { n: (v) => isInt(v) && v > 0 },
  drawNext: { n: (v) => isInt(v) && v > 0 },
  endHeal: { n: (v) => isInt(v) && v > 0 },
  lumiFlag: {},
};

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

/** 부동소수 오차 없이 반올림 (예: 7.5 × 0.6 = 4.5 → 5) */
export function roundCost(x) {
  return Math.round(Number(x.toFixed(9)));
}

// ---------------------------------------------------------------------------
// 찾기 · 해석
// ---------------------------------------------------------------------------

/**
 * 카드 배열. data.cards 가 { cards } 이든 배열이든 받는다.
 * @param {object} data
 * @returns {object[]}
 */
export function cardList(data) {
  const c = data && data.cards;
  const list = Array.isArray(c) ? c : c && c.cards;
  if (!Array.isArray(list)) throw new Error("data.cards 가 없습니다 (data/cards.json)");
  return list;
}

const indexCache = new WeakMap();

/**
 * 카드 id → 정의 Map (같은 cards 배열이면 캐시를 쓴다. 정의는 바꾸지 말 것).
 * @param {object} data
 * @returns {Map<string, object>}
 */
export function indexCards(data) {
  const list = cardList(data);
  let m = indexCache.get(list);
  if (!m) {
    m = new Map();
    for (const card of list) m.set(card.id, card);
    indexCache.set(list, m);
  }
  return m;
}

/**
 * @param {object} data
 * @param {string} cardId
 * @returns {object} 원본 정의 (바꾸지 말 것)
 */
export function getCard(data, cardId) {
  const card = indexCards(data).get(cardId);
  if (!card) throw new Error(`카드 '${cardId}' 을(를) 찾을 수 없습니다`);
  return card;
}

/** 강화할 수 있는 카드인가 (대비 카드 = plus: null 은 안 된다) */
export function canUpgrade(card) {
  return !!card && card.family !== "prep" && card.plus !== null;
}

/**
 * 카드 정의 해석. 덮어쓰기 순서: base → (코치 && bond ≥ lesson.bond.upgradeAt) bond80 → (plus) plus.
 * 코치 카드처럼 plus 가 없는 카드의 강화판은 그 시점 power × 1.25 (반올림).
 * @param {object} data
 * @param {string|object} card 카드 id 또는 원본 정의
 * @param {{ plus?: boolean, bond?: number }} [opts]
 * @returns {object} 새 객체: 원본 필드 + { plus: bool, bond80: bool, costRate, basePower, baseMods, desc }
 *   (plus · bond80 은 "적용됐는가" 불리언, descPlus 는 desc 로 합쳐진다. 유대 80판의 문구는 bond80.desc · bond80.descPlus)
 */
export function resolveCardDef(data, card, { plus = false, bond = 0 } = {}) {
  const raw = typeof card === "string" ? getCard(data, card) : card;
  if (!raw || typeof raw.id !== "string") throw new Error("카드 정의가 필요합니다");
  const d = clone(raw);
  delete d.plus;
  delete d.bond80;
  delete d.descPlus;
  d.mods = d.mods || {};
  d.effects = d.effects || [];

  const upgradeAt = data && data.lesson && data.lesson.bond && isNum(data.lesson.bond.upgradeAt) ? data.lesson.bond.upgradeAt : 80;
  const bond80 = raw.family === "coach" && !!raw.bond80 && (Number(bond) || 0) >= upgradeAt;
  if (bond80) {
    const over = clone(raw.bond80);
    delete over.desc; // 문구는 아래에서 고른다
    delete over.descPlus;
    Object.assign(d, over);
  }

  if (plus) {
    if (!canUpgrade(raw)) throw new Error(`카드 '${raw.id}' 은(는) 강화할 수 없습니다`);
    if (raw.plus) Object.assign(d, clone(raw.plus));
    else if (isNum(d.power)) d.power = Math.round(d.power * 1.25);
  }

  const defaultRate = data && data.lesson && data.lesson.lesson && isNum(data.lesson.lesson.costRate) ? data.lesson.lesson.costRate : 0.6;
  d.costRate = isNum(raw.costRate) ? raw.costRate : defaultRate;
  d.plus = !!plus;
  d.bond80 = bond80;
  d.basePower = isNum(raw.power) ? raw.power : null;
  d.baseMods = clone(raw.mods || {});
  // 문구: 유대 80판이면 bond80.desc · bond80.descPlus (없으면 기본 문구)
  const src = bond80 && raw.bond80.desc ? raw.bond80 : raw;
  d.desc = plus && src.descPlus ? src.descPlus : src.desc;
  return d;
}


// ---------------------------------------------------------------------------
// 포지션 · 출전 · 경기장
// ---------------------------------------------------------------------------

/**
 * 포지션의 주 스탯 쌍 (OUTGAME_CARDS §3): GK · DF → [defense, physical], MF → [dribble, pass], FW → [shoot, dribble].
 * training.mainStatOf(1개)는 그대로 둔다 (D31).
 * @param {string} position
 * @returns {string[]}
 */
export function mainStatsOf(position) {
  switch (position) {
    case "GK":
    case "DF":
      return ["defense", "physical"];
    case "MF":
      return ["dribble", "pass"];
    case "FW":
      return ["shoot", "dribble"];
    default:
      throw new Error(`알 수 없는 포지션: '${position}'`);
  }
}

/** 이 선수가 지금 결장인가 (레슨 중이면 lesson.out, 아니면 injuredTurns > 0) */
export function isOut(state, player) {
  if (state.lesson && Array.isArray(state.lesson.out)) return state.lesson.out.includes(player.id);
  return (Number(player.injuredTurns) || 0) > 0;
}

/** 출전 선수 = 결장이 아닌 선수 (벤치 포함, state.players 순서) */
export function activePlayers(state) {
  return (state.players || []).filter((p) => !isOut(state, p));
}

/** 이번 턴 벤치에 있는가 */
export function isBenched(state, id) {
  return !!(state.lesson && Array.isArray(state.lesson.bench) && state.lesson.bench.includes(id));
}

/** 경기장 선수 (이번 턴 구역에 서 있고 벤치 · 결장이 아닌 선수, state.players 순서) */
export function fieldPlayers(state) {
  const L = state.lesson;
  if (!L || !L.zones) return [];
  return (state.players || []).filter((p) => L.zones[p.id] && !isBenched(state, p.id) && !isOut(state, p));
}

/** 경기장 선수 위치 { id: {x, y} } (zones.zonePositions — 결장은 뺀다) */
export function fieldPositions(state, data) {
  const L = state.lesson;
  if (!L || !L.zones) return {};
  const ids = new Set(fieldPlayers(state).map((p) => p.id));
  const all = zones.zonePositions(L, state.players.filter((p) => ids.has(p.id)), zoneCfg(data));
  return all;
}

/** data.lesson.zones */
export function zoneCfg(data) {
  const cfg = data && data.lesson && data.lesson.zones;
  if (!cfg) throw new Error("data.lesson.zones 가 없습니다 (data/lesson.json)");
  return cfg;
}

/** 고유 카드 주인 (명단에 없으면 null) */
export function ownerOf(state, def) {
  if (!def || !def.ownerCharId) return null;
  return (state.players || []).find((p) => p.charId === def.ownerCharId) || null;
}

/** 회복 단일 카드인가 (single + power null) — 결장 · 벤치 포함 7명 중 1명에게 회복만 */
export function isHealSingle(def) {
  return !!def && def.target && def.target.kind === "single" && !isNum(def.power);
}

/** 작은 원 카드인가 (nextPairPct · 예전 "짝 카드") */
export function isSmallCircle(def) {
  return !!def && def.target && def.target.kind === "circle" && def.target.size === "small";
}

/** 원 카드 반지름 (u). 원이 아니면 null */
export function circleRadius(def, data) {
  if (!def || def.target.kind !== "circle") return null;
  const r = zoneCfg(data).radius[def.target.size];
  if (!isNum(r)) throw new Error(`알 수 없는 원 크기 '${def.target.size}'`);
  return r;
}

/**
 * 주인이 자기 배치 포지션의 주 스탯 구역에 서 있는가 (고유 카드 ×1.5, §14.10).
 * @returns {boolean}
 */
export function ownerOnMainZone(state, def) {
  const owner = ownerOf(state, def);
  const z = owner && state.lesson && state.lesson.zones ? state.lesson.zones[owner.id] : null;
  return !!z && mainStatsOf(owner.position).includes(z);
}

/**
 * 단일 카드의 후보 선수 id. 회복 단일 = 7명 전원 (결장 · 벤치 포함), 그 밖 = 경기장 선수 (onlyZones 가 있으면 그 구역에 선 선수만).
 * 단일이 아니면 [].
 */
export function singleCandidates(state, def) {
  if (!def || def.target.kind !== "single") return [];
  if (isHealSingle(def)) return (state.players || []).map((p) => p.id);
  const only = def.target.onlyZones;
  const Z = (state.lesson && state.lesson.zones) || {};
  return fieldPlayers(state).filter((p) => !only || only.includes(Z[p.id])).map((p) => p.id);
}

/**
 * 대상 T (§14.6). 잘못된 인자 · 대상 0명이면 throw.
 *   single: { playerId } 또는 { at } (놓은 점에서 pickR 안 가장 가까운 후보, 회복 단일은 경기장 위 토큰 또는 playerId)
 *   circle: { at } 필수 — 원 안의 경기장 선수 전원 (슬롯 순서)
 *   all: 경기장 선수 전원 · owner: [주인] (벤치 · 결장이면 throw) · none: []
 * 회복 단일은 회복 대상 1명 [id] 를 돌려준다 (상승 대상은 아니다 — lesson.js 가 구분한다).
 * @param {object} state
 * @param {object} def resolveCardDef 결과 (원본 정의도 된다)
 * @param {{ at?: {x:number, y:number}, playerId?: string }} [args]
 * @param {object} data data.lesson.zones 를 읽는다
 * @returns {string[]} 선수 id
 */
export function targetsFor(state, def, args = {}, data) {
  const a = args || {};
  const kind = def.target.kind;
  switch (kind) {
    case "none":
      return [];
    case "all": {
      const ids = fieldPlayers(state).map((p) => p.id);
      if (!ids.length) throw new Error(`'${def.name}': 경기장에 선수가 없습니다`);
      return ids;
    }
    case "owner": {
      const owner = ownerOf(state, def);
      if (!owner) throw new Error(`'${def.name}': 주인이 명단에 없습니다`);
      if (isOut(state, owner)) throw new Error(`'${def.name}': 주인이 결장 중입니다`);
      if (isBenched(state, owner.id)) throw new Error(`'${def.name}': 주인이 벤치에 있습니다`);
      if (!fieldPlayers(state).some((p) => p.id === owner.id)) throw new Error(`'${def.name}': 주인이 경기장에 없습니다`);
      return [owner.id];
    }
    case "single": {
      const cands = singleCandidates(state, def);
      if (a.playerId != null) {
        if (!cands.includes(a.playerId)) throw new Error(`'${def.name}': 선수 '${a.playerId}' 은(는) 고를 수 없습니다`);
        return [a.playerId];
      }
      if (!a.at) throw new Error(`'${def.name}': 선수 위에 놓아야 합니다`);
      const cfg = zoneCfg(data);
      const at = zones.clampPoint(a.at);
      const id = zones.nearestWithin(fieldPositions(state, data), at, cfg.pickR, cfg.aspect, cands);
      if (!id) throw new Error(`'${def.name}': 놓은 자리에 고를 수 있는 선수가 없습니다`);
      return [id];
    }
    case "circle": {
      if (!a.at) throw new Error(`'${def.name}': 원을 놓을 자리(at)가 필요합니다`);
      const cfg = zoneCfg(data);
      const ids = zones.inCircle(fieldPositions(state, data), zones.clampPoint(a.at), circleRadius(def, data), cfg.aspect);
      if (!ids.length) throw new Error(`'${def.name}': 원 안에 선수가 없습니다`);
      return ids;
    }
    default:
      throw new Error(`알 수 없는 대상 종류 '${kind}'`);
  }
}

/**
 * 지금 낼 수 없는 이유 (§14.3 죽은 카드 · 행동 중 낼 수 없게 된 카드): 대상 후보가 0명이면 문자열, 낼 수 있으면 null.
 * 원 · 전체 카드는 경기장에 1명이라도 있으면 낼 수 있다. 회복 단일 · 대상 없는 카드는 늘 낼 수 있다.
 * @param {object} state
 * @param {object} def
 * @returns {string|null}
 */
export function deadReason(state, def) {
  const kind = def.target.kind;
  if (kind === "none" || isHealSingle(def)) return null;
  if (kind === "owner") {
    const owner = ownerOf(state, def);
    if (!owner) return "주인이 명단에 없습니다";
    if (isOut(state, owner)) return "주인이 결장 중입니다";
    if (isBenched(state, owner.id)) return "주인이 벤치에 있습니다";
    return fieldPlayers(state).some((p) => p.id === owner.id) ? null : "주인이 경기장에 없습니다";
  }
  if (!fieldPlayers(state).length) return "경기장에 선수가 없습니다";
  if (kind === "single" && !singleCandidates(state, def).length) return "그 구역에 선수가 없습니다";
  return null;
}

// ---------------------------------------------------------------------------
// 비용 (§14.7 4번 · D12 · D25)
// ---------------------------------------------------------------------------

/**
 * 비용 기준 = 강화 전 기본 카드의 1인 위력 (perMood · perPress 몫 포함, 집중 · routine · 강화판 · 유대 80 증가분 제외).
 * 고유 카드는 주 스탯 구역 배율(mainMult)을 곱한 값 (35 × 1.5 = 52.5).
 * @param {object} def resolveCardDef 결과 (원본 정의도 된다)
 * @param {{ mood?: number, press?: number, mainMult?: number }} [opts]
 * @returns {number} 소수 유지. 위력 없는 카드는 0
 */
export function costBase(def, { mood = 0, press = 0, mainMult = 1 } = {}) {
  const basePower = isNum(def.basePower) ? def.basePower : def.power;
  if (!isNum(basePower)) return 0;
  const kind = def.target.kind;
  if (kind === "none") return 0;
  if (kind === "owner") return basePower * (isNum(mainMult) ? mainMult : 1);
  const mods = def.baseMods || def.mods || {};
  return basePower + (mods.perMood || 0) * mood + (mods.perPress || 0) * press;
}

/**
 * 대상 1인 체력 비용 = round(costBase × costRate × pressCostMult), costZero 면 0.
 * @param {object} def resolveCardDef 결과
 * @param {{ mood?: number, press?: number, mainMult?: number, pressCostMult?: number, costZero?: boolean }} [opts]
 * @returns {number}
 */
export function staminaCost(def, opts = {}) {
  if (opts.costZero) return 0;
  const rate = isNum(def.costRate) ? def.costRate : 0.6;
  const mult = isNum(opts.pressCostMult) ? opts.pressCostMult : 1;
  return roundCost(costBase(def, opts) * rate * mult);
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

function checkEffects(list, where, errors) {
  if (!Array.isArray(list)) {
    errors.push(`${where}: effects 가 배열이 아닙니다`);
    return;
  }
  list.forEach((e, i) => {
    const at = `${where}.effects[${i}]`;
    if (!e || typeof e !== "object") return errors.push(`${at}: 객체가 아닙니다`);
    const spec = EFFECT_TYPES[e.type];
    if (!spec) return errors.push(`${at}: 알 수 없는 effect '${e.type}'`);
    for (const k of Object.keys(e)) {
      if (k === "type") continue;
      if (k === "when") {
        if (!EFFECT_WHEN.includes(e.when)) errors.push(`${at}: when '${e.when}' 이(가) 목록에 없습니다`);
        continue;
      }
      if (!spec[k]) errors.push(`${at}: '${e.type}' 에 없는 필드 '${k}'`);
      else if (!spec[k](e[k])) errors.push(`${at}: '${e.type}.${k}' 값이 잘못됐습니다 (${JSON.stringify(e[k])})`);
    }
    for (const k of Object.keys(spec)) if (!(k in e)) errors.push(`${at}: '${e.type}' 에 '${k}' 가 없습니다`);
  });
}

function checkMods(mods, where, errors) {
  if (!mods || typeof mods !== "object" || Array.isArray(mods)) return errors.push(`${where}: mods 가 객체가 아닙니다`);
  for (const [k, v] of Object.entries(mods)) {
    if (!MOD_KEYS[k]) errors.push(`${where}: 알 수 없는 mod '${k}'`);
    else if (!MOD_KEYS[k](v)) errors.push(`${where}: mod '${k}' 값이 잘못됐습니다 (${JSON.stringify(v)})`);
  }
}

function checkPower(v, where, errors) {
  if (!isInt(v) || v <= 0) errors.push(`${where}: power 는 양의 정수여야 합니다 (${JSON.stringify(v)})`);
}

/**
 * cards · lesson · policies 데이터 검증. 문제가 있으면 모두 모아 throw, 없으면 true.
 * characters · supports · lesson · policies 가 data 에 있으면 교차 검사도 한다.
 * @param {object} data
 * @returns {true}
 */
export function validateCardsData(data) {
  const errors = [];
  const list = cardList(data);
  const seen = new Set();
  const charIds = Array.isArray(data.characters) ? new Set(data.characters.map((c) => c.id)) : null;
  const supportIds = Array.isArray(data.supports) ? new Set(data.supports.map((s) => s.id)) : null;
  const owners = new Set();
  const coachSupports = new Set();
  const TOP = ["id", "name", "family", "start", "pool", "target", "power", "costRate", "mods", "effects", "exhaust", "plus", "bond80",
    "ownerCharId", "coach", "prepFor", "desc", "descPlus"];

  for (const c of list) {
    const at = `카드 '${c && c.id}'`;
    if (!c || typeof c.id !== "string" || !/^cd_[a-z0-9_]+$/.test(c.id)) {
      errors.push(`${at}: id 형식이 잘못됐습니다`);
      continue;
    }
    if (seen.has(c.id)) errors.push(`${at}: id 가 겹칩니다`);
    seen.add(c.id);
    for (const k of Object.keys(c)) if (!TOP.includes(k)) errors.push(`${at}: 알 수 없는 필드 '${k}'`);
    if (typeof c.name !== "string" || !c.name) errors.push(`${at}: name 이 없습니다`);
    if (typeof c.desc !== "string" || !c.desc) errors.push(`${at}: desc 가 없습니다`);
    if (c.descPlus !== undefined && typeof c.descPlus !== "string") errors.push(`${at}: descPlus 는 문자열이어야 합니다`);
    if (!CARD_FAMILIES.includes(c.family)) errors.push(`${at}: 알 수 없는 family '${c.family}'`);
    const fam = c.family;

    // start · pool
    if (typeof c.start !== "boolean") errors.push(`${at}: start 는 불리언이어야 합니다`);
    if (c.start && fam !== "common") errors.push(`${at}: 시작 덱 카드는 공용이어야 합니다`);
    const wantPool = (fam === "common" && !c.start) || POLICY_FAMILIES.includes(fam);
    if (c.pool !== wantPool) errors.push(`${at}: pool 은 ${wantPool} 이어야 합니다`);
    if (typeof c.exhaust !== "boolean") errors.push(`${at}: exhaust 는 불리언이어야 합니다`);

    // target · power
    const t = c.target;
    if (!t || !TARGET_KINDS.includes(t.kind)) {
      errors.push(`${at}: 알 수 없는 target.kind '${t && t.kind}'`);
    } else {
      const allowed = { single: ["onlyZones"], circle: ["size"] }[t.kind] || [];
      for (const k of Object.keys(t)) if (k !== "kind" && !allowed.includes(k)) errors.push(`${at}: target 에 없는 필드 '${k}'`);
      if (t.kind === "circle" && !CIRCLE_SIZES.includes(t.size)) errors.push(`${at}: target.size '${t.size}' 이(가) 원 크기가 아닙니다`);
      if (t.onlyZones !== undefined && (!Array.isArray(t.onlyZones) || !t.onlyZones.length || !t.onlyZones.every((z) => zones.ZONE_IDS.includes(z))))
        errors.push(`${at}: target.onlyZones 가 잘못됐습니다`);
      if (t.kind === "owner" && fam !== "unique") errors.push(`${at}: owner 대상은 고유 카드만`);
      const heals = (c.effects || []).filter((e) => e && e.type === "heal" && e.to === "target");
      if (t.kind === "none") {
        if (c.power !== null) errors.push(`${at}: none 카드의 power 는 null 이어야 합니다`);
      } else if (t.kind === "single" && c.power === null) {
        // 회복 단일: heal target 이 있어야 한다, onlyZones 는 쓸 수 없다
        if (!heals.length) errors.push(`${at}: 위력 없는 단일 카드는 heal target 효과가 있어야 합니다`);
        if (t.onlyZones !== undefined) errors.push(`${at}: 회복 단일 카드에는 onlyZones 를 쓸 수 없습니다`);
      } else checkPower(c.power, at, errors);
      if (heals.length && !(t.kind === "single" && c.power === null)) errors.push(`${at}: heal target 은 위력 없는 단일 카드만`);
    }
    if (c.costRate !== undefined && !(isNum(c.costRate) && c.costRate > 0 && c.costRate <= 1)) errors.push(`${at}: costRate 가 잘못됐습니다`);
    checkMods(c.mods, at, errors);
    checkEffects(c.effects, at, errors);

    // plus
    if (fam === "prep") {
      if (c.plus !== null) errors.push(`${at}: 대비 카드는 plus: null 이어야 합니다 (강화 불가)`);
    } else if (fam === "coach") {
      if (c.plus !== undefined) errors.push(`${at}: 코치 카드는 plus 없이 ×1.25 규칙을 쓴다`);
    } else if (!c.plus || typeof c.plus !== "object") {
      errors.push(`${at}: plus 가 없습니다`);
    } else {
      for (const k of Object.keys(c.plus)) if (!PLUS_FIELDS.includes(k)) errors.push(`${at}: plus 에 없는 필드 '${k}'`);
      if ("power" in c.plus) checkPower(c.plus.power, `${at}.plus`, errors);
      if ("power" in c.plus && c.power === null) errors.push(`${at}: 위력 없는 카드의 plus 에 power`);
      if ("effects" in c.plus) checkEffects(c.plus.effects, `${at}.plus`, errors);
      if ("mods" in c.plus) checkMods(c.plus.mods, `${at}.plus`, errors);
      if (Object.keys(c.plus).length === 0) errors.push(`${at}: plus 가 비었습니다`);
    }

    // bond80 · coach
    if (fam === "coach") {
      if (!c.coach || typeof c.coach !== "object") errors.push(`${at}: coach 가 없습니다`);
      else {
        if (!STATS.includes(c.coach.type)) errors.push(`${at}: coach.type '${c.coach.type}' 이(가) 스탯이 아닙니다`);
        if (supportIds && !supportIds.has(c.coach.supportId)) errors.push(`${at}: coach.supportId '${c.coach.supportId}' 이(가) supports 에 없습니다`);
        if (coachSupports.has(c.coach.supportId)) errors.push(`${at}: 코치 '${c.coach.supportId}' 의 카드가 두 장입니다`);
        coachSupports.add(c.coach.supportId);
      }
      if (!c.bond80 || typeof c.bond80 !== "object" || !Object.keys(c.bond80).length) errors.push(`${at}: bond80 이 없습니다`);
      else {
        for (const k of Object.keys(c.bond80)) if (!BOND80_FIELDS.includes(k)) errors.push(`${at}: bond80 에 없는 필드 '${k}'`);
        if ("power" in c.bond80) checkPower(c.bond80.power, `${at}.bond80`, errors);
        if ("effects" in c.bond80) checkEffects(c.bond80.effects, `${at}.bond80`, errors);
        if ("mods" in c.bond80) checkMods(c.bond80.mods, `${at}.bond80`, errors);
        for (const k of ["desc", "descPlus"]) if (k in c.bond80 && (typeof c.bond80[k] !== "string" || !c.bond80[k])) errors.push(`${at}: bond80.${k} 는 문자열이어야 합니다`);
      }
    } else {
      if (c.coach !== undefined) errors.push(`${at}: coach 는 코치 카드만`);
      if (c.bond80 !== undefined) errors.push(`${at}: bond80 은 코치 카드만`);
    }

    // unique
    if (fam === "unique") {
      if (t && t.kind !== "owner") errors.push(`${at}: 고유 카드의 대상은 owner`);
      if (typeof c.ownerCharId !== "string") errors.push(`${at}: ownerCharId 가 없습니다`);
      else {
        if (charIds && !charIds.has(c.ownerCharId)) errors.push(`${at}: ownerCharId '${c.ownerCharId}' 이(가) characters 에 없습니다`);
        if (owners.has(c.ownerCharId)) errors.push(`${at}: '${c.ownerCharId}' 의 고유 카드가 두 장입니다`);
        owners.add(c.ownerCharId);
      }
    } else if (c.ownerCharId !== undefined) errors.push(`${at}: ownerCharId 는 고유 카드만`);

    // prep
    if (fam === "prep") {
      if (!PREP_FOR.includes(c.prepFor)) errors.push(`${at}: prepFor '${c.prepFor}' 이(가) 목록에 없습니다`);
    } else if (c.prepFor !== undefined) errors.push(`${at}: prepFor 는 대비 카드만`);
  }

  // lesson.json 교차 검사
  const L = data.lesson;
  if (L) {
    const card = (id) => indexCards(data).get(id);
    if (!Array.isArray(L.startDeck) || !L.startDeck.length) errors.push("lesson.startDeck 이 없습니다");
    else for (const id of L.startDeck) if (!card(id) || !card(id).start) errors.push(`lesson.startDeck: '${id}' 은(는) 시작 카드가 아닙니다`);
    if (!Array.isArray(L.weekKinds) || L.weekKinds.length !== L.weeksPerSeason) errors.push("lesson.weekKinds 길이가 weeksPerSeason 과 다릅니다");
    else for (const k of L.weekKinds) if (!["lesson", "free", "prep"].includes(k)) errors.push(`lesson.weekKinds: 알 수 없는 주 '${k}'`);
    const seasons = data.config && data.config.seasons;
    const ls = L.lesson || {};
    if (!Array.isArray(ls.turns) || (seasons && ls.turns.length !== seasons)) errors.push("lesson.lesson.turns 길이가 시즌 수와 다릅니다");
    if (!Array.isArray(ls.targets) || (seasons && ls.targets.length !== seasons) || !ls.targets.every((x) => Array.isArray(x) && x.length === 2 && x[0] < x[1]))
      errors.push("lesson.lesson.targets 가 잘못됐습니다 ([목표, 상한] × 시즌)");
    if (!isNum(ls.costRate)) errors.push("lesson.lesson.costRate 가 없습니다");
    const pc = L.prepCards || {};
    for (const key of ["dribble", "pass", "mixed"]) {
      if (!Array.isArray(pc[key]) || pc[key].length !== 2) errors.push(`lesson.prepCards.${key} 는 2장이어야 합니다`);
      else for (const id of pc[key]) if (!card(id) || card(id).family !== "prep") errors.push(`lesson.prepCards.${key}: '${id}' 은(는) 대비 카드가 아닙니다`);
    }
    if (!card(pc.midrangeSecond) || card(pc.midrangeSecond).family !== "prep") errors.push("lesson.prepCards.midrangeSecond 가 대비 카드가 아닙니다");
    const policyIds = data.policies && Array.isArray(data.policies.policies) ? data.policies.policies.map((p) => p.id) : null;
    if (policyIds && !policyIds.includes(L.defaultPolicy)) errors.push(`lesson.defaultPolicy '${L.defaultPolicy}' 이(가) policies 에 없습니다`);
  }

  // policies.json
  const P = data.policies;
  if (P) {
    const ids = Array.isArray(P.policies) ? P.policies.map((p) => p.id) : [];
    if (JSON.stringify(ids) !== JSON.stringify(POLICY_FAMILIES)) errors.push(`policies 는 ${POLICY_FAMILIES.join(", ")} 순서여야 합니다`);
    for (const p of P.policies || []) {
      if (typeof p.name !== "string" || !p.name || typeof p.desc !== "string" || !p.desc) errors.push(`방침 '${p.id}': name · desc 가 없습니다`);
      if (!Array.isArray(p.buffs) || !p.buffs.length) errors.push(`방침 '${p.id}': buffs 가 없습니다`);
    }
  }

  if (errors.length) throw new Error(`카드 데이터 오류 ${errors.length}건:\n- ${errors.join("\n- ")}`);
  return true;
}
