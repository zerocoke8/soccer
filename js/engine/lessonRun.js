/**
 * lessonRun.js — 카드 레슨 런: 15주 상태 머신 + UI 가 쓰는 공개 API (LESSON_PROTO_PLAN §5.1 · §5.4).
 *
 * UI 는 app.js 에서 이 모듈을 `ctx.run` 으로 받는다. run.js 와 이름 · 시그니처가 같은 함수
 * (createRun · getPhase · getMatchSetup · buildTeamSnapshot · finishMatch · chooseRelic · chooseRoute ·
 * getEventView · resolveEvent · finalizeRun · nextMatchView) 는 경기 · 이벤트 · 유물 · 결과 화면이 그대로 부른다.
 *
 * 흐름: 시즌마다 레슨 · 자유 · 레슨 · 자유 · 대비 (lesson.json weekKinds) → 경기 전 준비 → 경계전 → 유물 → 루트.
 *   - 주 행동 (applyWeekAction) · 레슨 (playCard …) · 보상 (코치 수업 resolveTeach → resolveReward, §18.4) · 상담 (consultAction · endConsult) ·
 *     경기 전 준비 (confirmPrep) 는 이 모듈의 phase 다.
 *   - 주 끝 · 시즌 끝처럼 이어지는 단계는 state.queue (문자열 배열) 에 넣고 continueFlow 가 멈추는 phase 까지 처리한다.
 *
 * queue 단계: "beginWeek" · "supportEventCheck" · "advanceWeek" · "seasonEnd" · "routeFriendly"
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 를 쓰지 않는다. 상태는 JSON 순수 객체.
 * 난수는 state.rngState 로만 쓰고, 함수에 들어올 때 열어 나가기 직전에 저장한다 (다른 rng 함수를 부르는 동안에는 들고 있지 않는다).
 * 상태를 바꾸는 공개 함수는 검증을 먼저 끝내고, 실패하면 상태를 바꾸지 않는다.
 */
import { createRng, createRngFromState } from "./rng.js";
import {
  STATS,
  STAT_LABELS,
  MAX_HINT_LEVEL,
  MAX_LEARNED_SKILLS as MAX_SKILL_SLOTS,
  clamp,
  getModifier,
  resolveRest,
  resolveMeeting,
} from "./training.js";
import * as run from "./run.js";
import * as cards from "./cards.js";
import * as lesson from "./lesson.js";
import * as zones from "./zones.js";
import { applyEffects } from "./effects.js";
import * as passives from "./passives.js";

// run.js 에서 그대로 다시 내보내는 것 (같은 이름 · 같은 동작).
// getMatchSetup · buildTeamSnapshot 은 다시 내보내지 않고 아래에서 감싼다 — 부상은 레슨에만 (§18.1, 유스 교체 없음).
export {
  getPhase,
  buildOpponentSnapshot,
  nextMatchView,
  getEventView,
  getEffectiveStats,
  opponentStyleHint,
  normalizeTactics,
  migrateRegisteredTeam,
  STATS,
  POSITIONS,
  FORMATIONS,
  STAT_LABELS,
  DEFENSE_TACTICS,
  DISTRIBUTION_TACTICS,
  MODIFIER_KEYS,
  MAX_LEARNED_SKILLS,
  formationSlots,
  slotPosition,
  mainStatOf,
  getModifier,
} from "./run.js";
export { lessonResult } from "./lesson.js";

export const RUN_KIND = "lessonRun";
export const RUN_VERSION = 4;
/**
 * 저장소가 받는 저장본 버전. migrateLessonRun 이 4 로 올린다:
 *   1 → 2 는 레슨 · 보상 중이 아니어야 한다 (§14.15), 2 → 3 은 늘 된다 (액티브 힌트 → SP · 수업 필드, §18.7),
 *   3 → 4 도 늘 된다 (옛 고유 스킬 → 캐릭터의 새 필살기, LESSON_PROTO_PLAN §19.13).
 */
export const SAVE_VERSIONS = [1, 2, 3, 4];

/** 사용자 입력을 기다리는 phase (continueFlow 가 여기서 멈춘다) */
const STOP_PHASES = new Set(["week", "lesson", "reward", "consult", "prep", "event", "match", "relic", "route", "finished"]);
/** 주 끝 queue */
const WEEK_END = ["supportEventCheck", "advanceWeek"];
/** 자유 주 행동 */
const FREE_ACTIONS = ["outing", "friendly", "consult", "meeting"];

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function assertData(data) {
  if (!data || typeof data !== "object") throw new Error("data 번들이 없습니다");
  if (!data.config) throw new Error("data.config 가 없습니다");
  if (!data.lesson || !data.lesson.lesson) throw new Error("data.lesson 이 없습니다 (data/lesson.json)");
  if (!data.cards) throw new Error("data.cards 가 없습니다 (data/cards.json)");
  if (!data.policies || !Array.isArray(data.policies.policies)) throw new Error("data.policies 가 없습니다 (data/policies.json)");
}

function assertPhase(state, phase) {
  if (!state || typeof state !== "object") throw new Error("state 가 없습니다");
  if (state.phase !== phase) throw new Error(`phase '${phase}' 에서만 가능합니다 (현재 '${state.phase}')`);
}

function LD(data) {
  return data.lesson;
}

function weeksPerSeason(data) {
  return LD(data).weeksPerSeason || LD(data).weekKinds.length;
}

function seasonsOf(data) {
  return data.config.seasons;
}

function playerById(state, id) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`선수 '${id}' 을(를) 찾을 수 없습니다`);
  return p;
}

function supportCard(data, supportId) {
  return data.supports.find((s) => s.id === supportId) || null;
}

/** 그 코치의 코치 카드 (없으면 null) */
function coachCardOf(data, supportId) {
  return cards.cardList(data).find((c) => c.family === "coach" && c.coach && c.coach.supportId === supportId) || null;
}

function skillById(data, id) {
  return data.skills.find((s) => s.id === id) || null;
}

/** 액티브 스킬인가 — 레슨 런에서는 코치 수업으로만 배운다 (§18.2). 상점 · 힌트 레벨에는 들어가지 않는다. */
function isActiveSkill(sk) {
  return !!sk && sk.kind === "active";
}

/** 수업을 받지 않거나 받을 선수가 없을 때 SP (lesson.json rewards.teach.declineSp, 없으면 20 — §18.2) */
function declineSpOf(data) {
  const t = LD(data).rewards && LD(data).rewards.teach;
  const v = Number(t && t.declineSp);
  return Number.isFinite(v) && v >= 0 ? v : 20;
}

/** 이름 마지막 낱말 ("코치 하르나" → "하르나", §15.5) */
function shortName(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts[parts.length - 1] || String(name || "");
}

/**
 * 경기 쪽 보기 (§18.1): 7명 모두 injuredTurns 0 인 얕은 사본. 부상은 레슨 결장에만 쓰이고, 경기에는 본인이 그대로 나온다.
 * 상태를 바꾸지 않고 rng 도 쓰지 않는다.
 */
function fieldView(state) {
  return { ...state, players: state.players.map((p) => ({ ...p, injuredTurns: 0 })) };
}

function policyOf(data, id) {
  return data.policies.policies.find((p) => p.id === id) || null;
}

function addStamina(p, n) {
  p.stamina = clamp(Math.round((Number(p.stamina) || 0) + n), 0, 100);
}

function addBond(st, n) {
  st.bond = clamp(Math.round((Number(st.bond) || 0) + n), 0, 100);
}

function addCondition(state, n) {
  state.condition = clamp(Math.round(state.condition + n), 0, 4);
}

function addTeamwork(state, n) {
  state.teamwork = clamp(Math.round(state.teamwork + n), 0, 100);
}

function log(state, text) {
  run.logLine(state, text);
}

/** 덱에 카드 추가 (uid k{nextUid}) */
function addToDeck(state, cardId, plus = false) {
  const uid = `k${state.nextUid}`;
  state.nextUid += 1;
  state.deck.push({ uid, cardId, plus: !!plus });
  return uid;
}

/** 코치 카드면 그 코치 유대 +acquire (D23) */
function acquireBond(state, data, cardId) {
  const raw = cards.getCard(data, cardId);
  if (raw.family !== "coach" || !raw.coach) return 0;
  const st = state.supports.find((s) => s.id === raw.coach.supportId);
  if (!st) return 0;
  const before = st.bond;
  addBond(st, LD(data).bond.acquire);
  return st.bond - before;
}

function deckEntry(state, uid) {
  return state.deck.find((e) => e.uid === uid) || null;
}

/** 이 덱 항목을 강화할 수 있는가 (강화 안 됨 · 강화 가능 카드) */
function upgradable(data, entry) {
  return !!entry && !entry.plus && cards.canUpgrade(cards.getCard(data, entry.cardId));
}

/** 레슨 목표 · 상한 (lesson.startLesson 과 같은 계산) */
function lessonTargets(state, data, special) {
  const ls = LD(data).lesson;
  const si = clamp((Number(state.season) || 1) - 1, 0, ls.turns.length - 1);
  let [target, cap] = ls.targets[si];
  if (special) {
    target = cards.roundCost(target * ls.special.targetMult);
    cap = cards.roundCost(cap * ls.special.capMult);
  }
  return { turns: ls.turns[si], target, cap };
}

/** 레슨 시작 때 경기장에 설 선수 (결장 아님, state.players 순서) */
function lessonFieldPlayers(state) {
  return state.players.filter((p) => !((Number(p.injuredTurns) || 0) > 0));
}

/**
 * 그 구역을 중점으로 골랐을 때 한 턴에 그 구역에 서 있을 기대 인원 (흩어지기 가중치 식, 소수 1자리, §14.13).
 * 결장 선수는 빼고, 가중치는 lesson.zones.weights × (중점이면 focus.weight).
 */
function expectedInZone(state, data, zone) {
  const cfg = LD(data).zones;
  const fw = LD(data).lesson.focus.weight;
  let sum = 0;
  for (const p of lessonFieldPlayers(state)) {
    let tot = 0;
    for (const z of zones.ZONE_IDS) tot += zones.zoneWeight(cfg, p.position, z, zone, fw);
    if (tot > 0) sum += zones.zoneWeight(cfg, p.position, zone, zone, fw) / tot;
  }
  return Math.round(sum * 10) / 10;
}

/** 이번 시즌 경계전 상대 */
function goalOpponent(state, data) {
  return data.opponents.find((o) => o.role === "goal" && o.season === state.season) || null;
}

/** 대비 카드 (D10): 상대 styleHint 로 짝, 상대 tactics.shootTiming == midrange 면 두 번째를 버티기로 */
function prepCardsFor(state, data) {
  const pc = LD(data).prepCards;
  const opp = goalOpponent(state, data);
  const key = opp ? run.opponentStyleHint(opp, data).key : "mixed";
  const list = (pc[key] || pc.mixed).slice();
  if (opp && opp.tactics && opp.tactics.shootTiming === "midrange" && pc.midrangeSecond && list.length >= 2) list[1] = pc.midrangeSecond;
  return list;
}

// ---------------------------------------------------------------------------
// 뷰 헬퍼 (순수)
// ---------------------------------------------------------------------------

/** 덱 · 진열 · 보상 카드 뷰 (레슨 밖). entry = { uid?, cardId, plus } */
function cardView(state, data, entry) {
  const raw = cards.getCard(data, entry.cardId);
  const def = lesson.resolveEntry(state, data, entry);
  const up = !entry.plus && cards.canUpgrade(raw) ? lesson.resolveEntry(state, data, { cardId: entry.cardId, plus: true }) : null;
  return {
    uid: entry.uid ?? null,
    cardId: def.id,
    name: def.name,
    family: def.family,
    plus: def.plus,
    bond80: def.bond80,
    targetKind: def.target.kind,
    target: { ...def.target },
    power: def.power ?? null,
    costRate: def.costRate,
    exhaust: !!def.exhaust,
    desc: def.desc,
    ownerCharId: def.ownerCharId || null,
    coachType: def.coach ? def.coach.type : null,
    supportId: def.coach ? def.coach.supportId : null,
    canUpgrade: !!up,
    upgrade: up ? { power: up.power ?? null, desc: up.desc } : null,
    shape: cards.shapeView(def, data), // 고유 카드 모양 (L40) — 그 밖 null
  };
}

function playerView(state, data, p) {
  return {
    id: p.id,
    charId: p.charId,
    name: p.name,
    slot: p.slot,
    position: p.position,
    aptitude: p.aptitude,
    stamina: p.stamina,
    injuredTurns: p.injuredTurns,
    stats: { ...p.stats },
    growth: { ...p.growth },
    portraitColor: p.portraitColor,
    mainStats: cards.mainStatsOf(p.position),
    element: p.element,
    style: p.style,
    race: p.race,
    rarity: p.rarity,
    innateSkillId: p.innateSkillId,
    learnedSkillIds: p.learnedSkillIds.slice(),
  };
}

function coachViews(state, data) {
  const upgradeAt = LD(data).bond.upgradeAt;
  return state.supports.map((st) => {
    const sc = supportCard(data, st.id);
    const cc = coachCardOf(data, st.id);
    return {
      id: st.id,
      name: sc ? sc.name : st.id,
      type: cc ? cc.coach.type : sc ? sc.type : null,
      bond: st.bond,
      cardId: cc ? cc.id : null,
      upgraded: !!cc && !!cc.bond80 && st.bond >= upgradeAt,
      portraitColor: (sc && sc.portraitColor) || "#888888",
      hintSkillIds: sc && Array.isArray(sc.hintSkillIds) ? sc.hintSkillIds.slice() : [],
    };
  });
}

/** 지금 SP 로 살 수 있는 (선수 · 패시브) 쌍 수 (L48) */
function shopBuyableCount(state, data) {
  return passives.passiveShopView(state, data).players.reduce((n, p) => n + p.rows.filter((r) => r.affordable).length, 0);
}

function statusView(state) {
  return { condition: state.condition, teamwork: state.teamwork, sp: state.skillPoints, tp: state.trainingPoints };
}

// ---------------------------------------------------------------------------
// 시즌 계획 · 주 offer (rng)
// ---------------------------------------------------------------------------

/** 시즌 계획: 보장 행동 [상담, 미팅] 을 섞어 자유 주에 하나씩 (D3). rng 소비. */
function rollSeasonPlan(state, data) {
  const kinds = LD(data).weekKinds;
  const freeTurns = [];
  kinds.forEach((k, i) => {
    if (k === "free") freeTurns.push(i + 1);
  });
  const rng = createRngFromState(state.rngState);
  const order = rng.shuffle(LD(data).freeWeek.guaranteed || []);
  state.rngState = rng.getState();
  const guaranteed = {};
  freeTurns.forEach((t, i) => {
    if (i < order.length) guaranteed[String(t)] = order[i];
  });
  state.seasonPlan = { guaranteed };
}

/** 주 시작: weekKinds[turn-1] 로 weekOffer 를 굴린다 → phase week. rng 소비 (레슨 · 자유 주). */
function beginWeek(state, data) {
  const L = LD(data);
  const kind = L.weekKinds[state.turn - 1];
  if (kind === "lesson") {
    const rng = createRngFromState(state.rngState);
    const first = rng.pick(STATS);
    const specials = [first];
    if (rng.chance(L.lesson.special.secondChance)) specials.push(rng.pick(STATS.filter((s) => s !== first)));
    state.rngState = rng.getState();
    state.weekOffer = { kind, specials: STATS.filter((s) => specials.includes(s)) };
  } else if (kind === "free") {
    const fw = L.freeWeek;
    const guaranteed = (state.seasonPlan && state.seasonPlan.guaranteed && state.seasonPlan.guaranteed[String(state.turn)]) || null;
    const pool = (fw.pool || FREE_ACTIONS).filter((a) => a !== guaranteed);
    const rng = createRngFromState(state.rngState);
    const picked = rng.shuffle(pool).slice(0, Math.max(0, fw.slots - (guaranteed ? 1 : 0)));
    state.rngState = rng.getState();
    state.weekOffer = { kind, actions: guaranteed ? [guaranteed, ...picked] : picked, guaranteed };
  } else if (kind === "prep") {
    state.weekOffer = { kind, prepCards: prepCardsFor(state, data) };
  } else {
    throw new Error(`알 수 없는 주 종류: '${kind}'`);
  }
  state.phase = "week";
}

// ---------------------------------------------------------------------------
// queue
// ---------------------------------------------------------------------------

function advanceWeek(state, data) {
  if (state.turn === 1) state.freeOuting = 0;
  state.weekOffer = null;
  if (state.turn < weeksPerSeason(data)) {
    state.turn += 1;
    state.turnIndex += 1;
    beginWeek(state, data);
  } else {
    state.phase = "prep";
    log(state, `시즌 ${state.season} 경기 전 준비`);
  }
}

function seasonEnd(state, data) {
  if (state.season < seasonsOf(data)) {
    if (!data.routes.length) throw new Error("routes 가 비어 있습니다");
    state.pendingRoutes = data.routes.map((r) => r.id);
    state.phase = "route";
    log(state, `시즌 ${state.season} 종료. 다음 루트를 선택하세요.`);
  } else {
    state.phase = "finished";
    log(state, "모든 시즌이 끝났습니다. 런 종료.");
  }
}

function runStep(state, data, step) {
  switch (step) {
    case "beginWeek":
      beginWeek(state, data);
      break;
    case "supportEventCheck":
      if (LD(data).events && LD(data).events.support) {
        const found = run.findSupportEvent(state, data, null);
        if (found) {
          const before = { ...state.hints };
          run.fireEvent(state, data, found.event, found.supportId);
          routeEventHints(state, data, before, found.supportId); // 액티브 힌트 → 수업 대기열 (§18.3)
        }
      }
      break;
    case "advanceWeek":
      advanceWeek(state, data);
      break;
    case "seasonEnd":
      seasonEnd(state, data);
      break;
    case "routeFriendly":
      run.makeFriendlyMatch(state, data, "route");
      state.phase = "match";
      break;
    default:
      throw new Error(`알 수 없는 queue 단계: '${step}'`);
  }
}

/**
 * 남은 queue 를 멈추는 phase 까지 처리한다 (유물 후보가 남아 있으면 relic).
 * @returns {object} state
 */
function continueFlow(state, data) {
  if (state.pendingRelicChoices && state.pendingRelicChoices.length) {
    state.phase = "relic";
    return state;
  }
  state.phase = "flow";
  let guard = 0;
  while (state.queue.length > 0) {
    if (++guard > 64) throw new Error("lesson run queue 가 끝나지 않습니다");
    runStep(state, data, state.queue.shift());
    if (STOP_PHASES.has(state.phase)) return state;
  }
  throw new Error("이어 갈 단계가 없습니다 (queue 가 비었습니다)");
}

function weekEnd(state, data) {
  state.queue = WEEK_END.slice();
  return continueFlow(state, data);
}

// ---------------------------------------------------------------------------
// 공개 API — 런 생성 · 저장본
// ---------------------------------------------------------------------------

/**
 * 저장본이 레슨 런인가 (§5.1)
 * @param {any} s
 * @returns {boolean}
 */
export function isLessonRun(s) {
  return !!s && typeof s === "object" && s.kind === RUN_KIND && s.version === RUN_VERSION && typeof s.phase === "string";
}

/**
 * 저장소가 받는 레슨 런 저장본인가 (version 1 ~ 4 — 1 ~ 3 은 migrateLessonRun 으로 올린다). store.isLessonRunSave 의 원본.
 * @param {any} s
 * @returns {boolean}
 */
export function isLessonRunSave(s) {
  return !!s && typeof s === "object" && s.kind === RUN_KIND && SAVE_VERSIONS.includes(s.version) && typeof s.phase === "string";
}

/**
 * 저장본을 지금 버전으로 올릴 수 있는가: 4 → 참, 3 · 2 → 늘 참 (레슨 · 보상 · 경기 전 준비 중이어도, §18.7 · §19.13),
 * 1 → 레슨 · 보상 중이 아니어야 (§14.15).
 */
export function canMigrateLessonRun(s) {
  if (isLessonRun(s)) return true;
  if (!isLessonRunSave(s)) return false;
  if (s.version === 2 || s.version === 3) return true;
  return s.version === 1 && s.lesson == null && s.pendingReward == null;
}

/**
 * version 2 → 3 (§18.7): 액티브 힌트를 지우고 키마다 레벨 × rewards.noHintSp SP, 수업 필드 (pendingTeach · pendingReward.teach ·
 * result.teach) 를 채우고, 보상 결과 hints 에서 액티브를 뺀다. 이미 배운 액티브 · 진행 중인 레슨은 그대로.
 */
function migrateV2toV3(s, data) {
  if (!s.hints || typeof s.hints !== "object") s.hints = {};
  let n = 0;
  let sp = 0;
  for (const [id, lv] of Object.entries(s.hints)) {
    if (!isActiveSkill(skillById(data, id))) continue;
    n += 1;
    sp += Math.max(0, Number(lv) || 0) * (Number(LD(data).rewards.noHintSp) || 0);
    delete s.hints[id];
  }
  if (sp > 0) s.skillPoints = (Number(s.skillPoints) || 0) + sp;
  if (!Array.isArray(s.pendingTeach)) s.pendingTeach = [];
  const pr = s.pendingReward;
  if (pr && typeof pr === "object") {
    if (!Array.isArray(pr.teach)) pr.teach = [];
    if (pr.result && typeof pr.result === "object") {
      if (Array.isArray(pr.result.hints)) pr.result.hints = pr.result.hints.filter((h) => !isActiveSkill(skillById(data, h && h.skillId)));
      if (!Array.isArray(pr.result.teach)) pr.result.teach = [];
    }
  }
  s.version = 3;
  if (n > 0) log(s, `저장본 이행: 액티브 힌트 ${n}개 → SP +${sp}`);
}

/**
 * version 3 → 4 (LESSON_PROTO_PLAN §19.13 · L45): 선수마다 charId 의 캐릭터 innateSkillId 와 다르면 바꾼다 (옛 고유 스킬 → 새 필살기).
 * 바뀐 옛 스킬은 사라진다 (습득 목록에 넣지 않고 SP 보상도 없다 — [가정] §19.18 Q6). 습득 목록에 새 필살기 id 가 있으면 지운다 (방어).
 * 캐릭터를 찾을 수 없는 선수는 그대로. rng 를 쓰지 않는다. 레슨 · 보상 · 경기 전 준비 상태는 고유 스킬을 읽지 않으므로 그대로 둔다.
 */
function migrateV3toV4(s, data) {
  const chars = new Map(data.characters.map((c) => [c.id, c]));
  let n = 0;
  for (const p of Array.isArray(s.players) ? s.players : []) {
    const c = p && chars.get(p.charId);
    if (!c || !c.innateSkillId) continue;
    if (p.innateSkillId !== c.innateSkillId) {
      p.innateSkillId = c.innateSkillId;
      n += 1;
    }
    if (Array.isArray(p.learnedSkillIds)) p.learnedSkillIds = p.learnedSkillIds.filter((id) => id !== c.innateSkillId);
  }
  s.version = 4;
  if (n > 0) log(s, `저장본 이행: 고유 스킬 → 필살기 (${n}명)`);
}

/**
 * 저장본 이행. in-place, 멱등.
 *   - version 1 (종목 레슨): 레슨 · 보상 중이 아니면 version 2 로 — record.lessons[].stat → zone, rests → benches (§14.15).
 *     레슨 · 보상 중인 1 은 그대로 둔다 (isLessonRun 이 거짓 → UI 는 "저장 없음" + 토스트).
 *   - version 2 → 3 (§18.7, data 가 있어야 한다 — 액티브 판정 · noHintSp): migrateV2toV3. data 가 없으면 2 그대로 둔다.
 *   - version 3 → 4 (§19.13, data.characters 가 있어야 한다): migrateV3toV4. data 가 없으면 3 그대로 둔다.
 *   - version 4: tactics · modifiers 를 run.migrateRun 으로.
 * @param {object} s
 * @param {object} [data] 데이터 번들 (2 → 3 · 3 → 4 에 필요)
 * @returns {object}
 */
export function migrateLessonRun(s, data) {
  if (isLessonRunSave(s) && s.version === 1) {
    if (!canMigrateLessonRun(s)) return s;
    const rec = s.record && typeof s.record === "object" ? s.record : (s.record = { goalMatches: [], friendlies: [], losses: 0, lessons: [] });
    rec.lessons = (Array.isArray(rec.lessons) ? rec.lessons : []).map((l) => {
      const { stat, rests, ...rest } = l || {};
      return { ...rest, zone: rest.zone ?? stat ?? null, benches: rest.benches ?? rests ?? 0 };
    });
    s.version = 2;
  }
  if (isLessonRunSave(s) && s.version === 2 && data && Array.isArray(data.skills) && data.lesson) migrateV2toV3(s, data);
  if (isLessonRunSave(s) && s.version === 3 && data && Array.isArray(data.characters)) migrateV3toV4(s, data);
  if (!isLessonRun(s)) return s;
  if (!Array.isArray(s.pendingTeach)) s.pendingTeach = [];
  return run.migrateRun(s);
}

/**
 * 새 레슨 런.
 * @param {{ data: object, seed: string|number, squad?: Record<string,string>, formation?: string, supportIds?: string[],
 *           tactics?: object, policy?: string, leagueTier?: number }} params
 * @returns {object} RunState (kind "lessonRun")
 */
export function createRun({ data, seed, squad, formation, supportIds, tactics, policy, leagueTier = 1 }) {
  assertData(data);
  cards.validateAttachData(data); // 코치 지원 데이터 (§15.3)
  cards.validateShapeData(data); // 고유 카드 모양 데이터 (L40 · §16.2 ④)
  if (seed === undefined || seed === null || seed === "") throw new Error("seed 가 필요합니다");
  const pol = policy || LD(data).defaultPolicy || "team";
  if (!policyOf(data, pol)) throw new Error(`알 수 없는 훈련 방침: '${pol}'`);
  const cfg = data.config;
  const roster = run.buildRoster({ data, formation, squad, supportIds });

  const deckIds = LD(data).startDeck.slice();
  for (const p of roster.players) {
    const u = cards.cardList(data).find((c) => c.family === "unique" && c.ownerCharId === p.charId);
    if (u) deckIds.push(u.id);
  }
  for (const id of deckIds) cards.getCard(data, id);

  const rng = createRng(seed);
  const state = {
    kind: RUN_KIND,
    version: RUN_VERSION,
    seed,
    rngState: rng.getState(),
    phase: "flow",
    season: 1,
    turn: 1,
    turnIndex: 0,
    leagueTier,
    policy: pol,
    formation: roster.formation,
    tactics: run.normalizeTactics({ ...(cfg.defaultTactics || {}), ...(tactics || {}) }),
    players: roster.players,
    supports: roster.supports,
    condition: clamp(cfg.condition.start, 0, 4),
    teamwork: 0,
    skillPoints: 0,
    trainingPoints: 0,
    hints: {},
    pendingTeach: [],
    relics: [],
    modifiers: [],
    deck: deckIds.map((cardId, i) => ({ uid: `k${i + 1}`, cardId, plus: false })),
    nextUid: deckIds.length + 1,
    seasonPlan: null,
    weekOffer: null,
    freeOuting: 0,
    lesson: null,
    pendingReward: null,
    consult: null,
    currentEvent: null,
    pendingMatch: null,
    lastMatchResult: null,
    pendingRelicChoices: null,
    pendingRoutes: null,
    record: { goalMatches: [], friendlies: [], losses: 0, lessons: [] },
    usedEventIds: [],
    log: [],
    rating: null,
    queue: [],
  };
  log(state, `새 런 시작 (seed: ${seed}, 방침: ${policyOf(data, pol).name}). 시즌 1.`);
  rollSeasonPlan(state, data);
  state.queue = ["beginWeek"];
  return continueFlow(state, data);
}

// ---------------------------------------------------------------------------
// 주 (phase week)
// ---------------------------------------------------------------------------

/**
 * 주 선택 화면 뷰 (§5.4.4). 순수.
 */
export function getWeekView(state, data) {
  assertData(data);
  const offer = state.weekOffer || { kind: LD(data).weekKinds[state.turn - 1] };
  const kind = offer.kind;
  const wps = weeksPerSeason(data);
  const lessons =
    kind === "lesson" || kind === "prep"
      ? zones.ZONE_IDS.map((zone) => {
          const special = kind === "lesson" && Array.isArray(offer.specials) && offer.specials.includes(zone);
          return {
            zone,
            label: STAT_LABELS[zone],
            special,
            prep: kind === "prep",
            ...lessonTargets(state, data, special),
            expected: expectedInZone(state, data, zone),
          };
        })
      : [];
  return {
    phase: state.phase,
    season: state.season,
    week: state.turn,
    weekIndex: state.turnIndex,
    kind,
    seasons: seasonsOf(data),
    weeksPerSeason: wps,
    weekKinds: LD(data).weekKinds.slice(),
    policy: state.policy,
    nextMatch: run.nextMatchView(state, data),
    weeksToMatch: Math.max(0, wps - state.turn),
    status: statusView(state),
    lessons,
    prepCards: kind === "prep" && Array.isArray(offer.prepCards) ? offer.prepCards.slice() : [],
    actions: kind === "free" && Array.isArray(offer.actions) ? offer.actions.map((type) => ({ type, guaranteed: type === offer.guaranteed })) : [],
    freeOuting: (state.freeOuting || 0) > 0 && state.turn === 1,
    restGain: Math.round(data.config.rest.stamina * (1 + getModifier(state, "restEffect"))),
    players: state.players.map((p) => playerView(state, data, p)),
    coaches: coachViews(state, data),
    partyPassives: passives.partyPassivesFor(state, data), // 코치 파티 패시브 (L48)
    shopBuyable: shopBuyableCount(state, data), // 지금 SP 로 살 수 있는 패시브 수 (L48 — 주 화면 [패시브] 버튼 배지)
    deck: state.deck.map((e) => ({ uid: e.uid, cardId: e.cardId, name: cards.getCard(data, e.cardId).name, family: cards.getCard(data, e.cardId).family, plus: !!e.plus })),
    hints: { ...state.hints },
    relics: state.relics.slice(),
    modifiers: state.modifiers.map((m) => ({ ...m })),
    record: { goalMatches: state.record.goalMatches.slice(), friendlies: state.record.friendlies.slice(), losses: state.record.losses, lessons: state.record.lessons.slice() },
    lastMatchResult: state.lastMatchResult,
    log: state.log.slice(-20),
  };
}

/** 외출 효과: 그 선수 +picked, 7명 +team, 컨디션 +condition */
function doOuting(state, data, p) {
  const o = LD(data).outing;
  addStamina(p, o.picked);
  for (const x of state.players) addStamina(x, o.team);
  addCondition(state, o.condition);
}

/**
 * 주 행동 (§5.4.1 표).
 * @param {object} state
 * @param {object} data
 * @param {{ type: "lesson", zone: string } | { type: "rest" } | { type: "outing", playerId: string, free?: boolean } |
 *         { type: "meeting", tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }> } |
 *         { type: "consult" } | { type: "friendly" }} action
 * @returns {object} state
 */
export function applyWeekAction(state, data, action) {
  assertData(data);
  assertPhase(state, "week");
  if (!action || typeof action.type !== "string") throw new Error("action.type 이 필요합니다");
  run.migrateRun(state);
  const offer = state.weekOffer;
  if (!offer) throw new Error("이번 주 offer 가 없습니다");
  const offered = (t) => offer.kind === "free" && Array.isArray(offer.actions) && offer.actions.includes(t);

  switch (action.type) {
    case "lesson": {
      if (offer.kind !== "lesson" && offer.kind !== "prep") throw new Error("이번 주에는 레슨이 없습니다");
      if (!zones.ZONE_IDS.includes(action.zone)) throw new Error(`알 수 없는 중점 구역: '${action.zone}'`);
      const prep = offer.kind === "prep";
      const special = !prep && Array.isArray(offer.specials) && offer.specials.includes(action.zone);
      const bondBefore = {};
      for (const st of state.supports) bondBefore[st.id] = st.bond;
      lesson.startLesson(state, data, { zone: action.zone, special, prep, prepCards: prep ? offer.prepCards || [] : [] });
      state.lesson.bondBefore = bondBefore;
      state.phase = "lesson";
      log(state, `${prep ? "대비 레슨" : special ? "특별 레슨" : "레슨"}[${STAT_LABELS[action.zone]} 중점] 시작`);
      if (state.lesson.status !== "playing") afterLesson(state, data);
      return state;
    }
    case "rest": {
      const r = resolveRest(state, data);
      log(state, `휴식: 전원 체력 +${r.staminaGain}${r.conditionUp ? ", 컨디션 상승" : ""}`);
      return weekEnd(state, data);
    }
    case "outing": {
      const p = playerById(state, action.playerId);
      if (action.free) {
        if (!((state.freeOuting || 0) > 0 && state.turn === 1)) throw new Error("무료 외출을 쓸 수 없습니다");
        doOuting(state, data, p);
        state.freeOuting -= 1;
        log(state, `무료 외출: ${p.name} (체력 +${LD(data).outing.picked}, 전원 +${LD(data).outing.team}, 컨디션 +${LD(data).outing.condition})`);
        return state;
      }
      if (!offered("outing")) throw new Error("이번 주에는 외출이 열려 있지 않습니다");
      doOuting(state, data, p);
      log(state, `외출: ${p.name} (체력 +${LD(data).outing.picked}, 전원 +${LD(data).outing.team}, 컨디션 +${LD(data).outing.condition})`);
      return weekEnd(state, data);
    }
    case "meeting": {
      if (!offered("meeting")) throw new Error("이번 주에는 전술 미팅이 열려 있지 않습니다");
      if (action.buy) throw new Error("스킬 구매는 상담에서 합니다");
      const r = resolveMeeting(state, data, { tactics: action.tactics, formation: action.formation, swaps: action.swaps });
      state.tactics = run.normalizeTactics(state.tactics);
      let text = `전술 미팅: 팀워크 +${r.teamworkGain}`;
      if (r.formationChanged) text += `, 포메이션 ${state.formation}`;
      if (r.swapped) text += `, 포지션 변경 ${r.swapped}`;
      log(state, text);
      return weekEnd(state, data);
    }
    case "consult": {
      if (!offered("consult")) throw new Error("이번 주에는 상담이 열려 있지 않습니다");
      state.consult = rollConsult(state, data);
      state.phase = "consult";
      log(state, "상담 시작");
      return state;
    }
    case "friendly": {
      if (!offered("friendly")) throw new Error("이번 주에는 친선전이 열려 있지 않습니다");
      run.makeFriendlyMatch(state, data, "friendly");
      state.queue = WEEK_END.slice();
      state.phase = "match";
      return state;
    }
    default:
      throw new Error(`알 수 없는 주 행동: '${action.type}'`);
  }
}

// ---------------------------------------------------------------------------
// 레슨 (phase lesson) — lesson.js 를 감싸고, 끝나면 afterLesson
// ---------------------------------------------------------------------------

function afterIfEnded(state, data) {
  if (state.lesson && state.lesson.status !== "playing") afterLesson(state, data);
  return state;
}

/** 카드 1장 내기 (lesson.playCard). 레슨이 끝나면 보상 단계로. */
export function playCard(state, data, args) {
  assertPhase(state, "lesson");
  lesson.playCard(state, data, args);
  // 코치 컷인 로그 (§15.5): "코치 하르나 지원 (인터벌 슈팅)"
  const ci = state.lesson && state.lesson.lastFx && state.lesson.lastFx[0];
  if (ci && ci.t === "cutin") {
    const sc = supportCard(data, ci.supportId);
    log(state, `${sc ? sc.name : ci.supportId} 지원 (${cards.getCard(data, ci.cardId).name})`);
  }
  return afterIfEnded(state, data);
}

/** 벤치로 보내기 / 돌아오기 (lesson.benchPlayer, §14.5) */
export function benchPlayer(state, data, args) {
  assertPhase(state, "lesson");
  lesson.benchPlayer(state, data, args);
  return state;
}

/** 레슨 턴 끝 (lesson.endLessonTurn) */
export function endLessonTurn(state, data) {
  assertPhase(state, "lesson");
  lesson.endLessonTurn(state, data);
  return afterIfEnded(state, data);
}

/** 레슨 화면 뷰 (순수) */
export function getLessonView(state, data) {
  return lesson.getLessonView(state, data);
}

/** 카드 미리보기 (순수) */
export function previewCard(state, data, args) {
  return lesson.previewCard(state, data, args);
}

/** 후보 놓을 점 (순수, §14.14) */
export function dropCandidates(state, data, args) {
  return lesson.dropCandidates(state, data, args);
}

/**
 * 힌트 후보인가 (§18.3): 배울 수 있는 스킬 중
 *   - 패시브 (그 밖) — 힌트 레벨 3 미만 (지금 그대로)
 *   - 액티브 — 누군가 새로 배울 수 있다 (포지션이 맞고 그 스킬이 없는 선수 1명 이상, 슬롯이 가득이어도 바꾸기로 배울 수 있다)
 */
function hintCandidate(state, data, id) {
  const sk = skillById(data, id);
  if (!sk || !sk.learnable) return false;
  if (isActiveSkill(sk)) return state.players.some((p) => canTeachSkill(state, data, id, p.id).ok);
  return (state.hints[id] || 0) < MAX_HINT_LEVEL;
}

/**
 * 뽑은 힌트 적용: 패시브 = 힌트 레벨 +1 (상점 할인 · 진열), 액티브 = state.hints 를 건드리지 않는다 (호출한 쪽이 수업으로).
 * @returns {{ skillId: string, level: number, supportId: string, active: boolean }}
 */
function grantHint(state, data, skillId, supportId) {
  if (isActiveSkill(skillById(data, skillId))) return { skillId, level: 0, supportId, active: true };
  state.hints[skillId] = clamp((state.hints[skillId] || 0) + 1, 0, MAX_HINT_LEVEL);
  return { skillId, level: state.hints[skillId], supportId, active: false };
}

/**
 * 코치가 주는 스킬 목록 (L48): 레슨판은 `teachSkillIds` (수업할 액티브만 — 패시브는 선수 목록 · 선수 힌트로 옮겼다).
 * 없으면 옛 `hintSkillIds`. 코치가 없으면 null.
 */
function coachSkillList(data, supportId) {
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
function drawHint(state, data, rng) {
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
function drawHintFrom(state, data, rng, supportId) {
  const list = coachSkillList(data, supportId);
  if (!list) return null;
  const skills = list.filter((id) => hintCandidate(state, data, id));
  if (!skills.length) return null;
  const skillId = rng.pick(skills);
  return grantHint(state, data, skillId, supportId);
}

/** 수업 항목 (pendingReward.teach[], §18.3) */
function teachEntry(skillId, supportId, src) {
  return { skillId, supportId: supportId || null, src, result: null, playerId: null, replaced: null, sp: 0 };
}

/**
 * 이벤트 효과로 늘어난 액티브 힌트를 되돌리고 수업 대기열 (state.pendingTeach) 로 (§18.3 — 1차는 이벤트가 꺼져 있다).
 * 레벨이 n 늘었어도 수업은 1번. before = 처리 전 state.hints 사본.
 */
function routeEventHints(state, data, before, supportId) {
  for (const [id, lv] of Object.entries(state.hints)) {
    const prev = Number(before[id]) || 0;
    if (!(lv > prev) || !isActiveSkill(skillById(data, id))) continue;
    if (prev > 0) state.hints[id] = prev;
    else delete state.hints[id];
    if (!Array.isArray(state.pendingTeach)) state.pendingTeach = [];
    state.pendingTeach.push(teachEntry(id, supportId, "event"));
  }
}

/** 보상 후보 (§5.4.3 5, D7 · D8). rng. */
function rollRewardOffer(state, data, rng, status, special) {
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
 * 레슨이 끝난 직후 (§5.4.3 afterLesson): 결과 보상 · 힌트 · 결장 감소 · 기록 · 보상 후보 → phase reward.
 */
function afterLesson(state, data) {
  const L = state.lesson;
  const D = LD(data);
  const res = lesson.lessonResult(state, data);
  const status = res.status;
  const ok = status === "clear" || status === "perfect";
  const rng = createRngFromState(state.rngState);

  // 1. 결과 보상
  let tp = 0;
  let spLesson = 0;
  let hintCount = 0;
  let playerHintCount = 0;
  let freeUpgrades = 0;
  let teamwork = 0;
  let condition = 0;
  let prepBonus = false;
  if (status === "perfect" || status === "clear") {
    const R = D.rewards[status];
    tp = R.tp;
    spLesson = Number(R.sp) || 0;
    hintCount = R.hints;
    playerHintCount = Number(R.playerHints) || 0;
    freeUpgrades = R.freeUpgrades || 0;
  }
  if (ok) {
    state.trainingPoints += tp;
    state.skillPoints += spLesson; // 레슨 SP (L48 — SP 수입 약 3배)
    const twBefore = state.teamwork;
    addTeamwork(state, D.teamwork.clear);
    teamwork = state.teamwork - twBefore;
    for (const st of state.supports) {
      const cc = coachCardOf(data, st.id);
      if (cc && cc.coach.type === L.zone) addBond(st, D.bond.sameTypeClear);
    }
    if (L.lumiFlag) {
      const before = state.condition;
      addCondition(state, 1);
      condition = state.condition - before;
    }
    if (L.prep) {
      state.modifiers.push({ key: "goalMatchCondition", amount: 1, untilSeason: state.season, source: "prepLesson" });
      prepBonus = true;
    }
    // 2. 힌트 (+ hintRate modifier 확률로 1개 더)
    const extra = getModifier(state, "hintRate");
    if (extra > 0 && rng.chance(extra)) hintCount += 1;
  }
  // 패시브 힌트 → hints (레벨 +1), 액티브 힌트 → teach (코치 수업, §18.3). 이벤트 수업 대기열이 맨 앞.
  const hints = [];
  const teach = (Array.isArray(state.pendingTeach) ? state.pendingTeach : []).map((t) => teachEntry(t.skillId, t.supportId, t.src || "event"));
  state.pendingTeach = [];
  let sp = spLesson;
  const take = (h, src) => {
    if (h && h.active) teach.push(teachEntry(h.skillId, h.supportId, src));
    else if (h) hints.push({ skillId: h.skillId, level: h.level, supportId: h.supportId || null, playerId: h.playerId || null, src });
    else {
      sp += D.rewards.noHintSp;
      state.skillPoints += D.rewards.noHintSp;
    }
  };
  for (let i = 0; i < hintCount; i++) take(drawHint(state, data, rng), "clear");
  // 2a. 선수 힌트 (L48): 이번 레슨에서 많이 큰 선수부터, 한 명에 1개씩 그 선수 패시브 목록에서 (후보가 없는 선수는 건너뛴다)
  if (playerHintCount > 0) {
    let got = 0;
    for (const pid of passives.topGrowers(res.perPlayer)) {
      if (got >= playerHintCount) break;
      const h = passives.drawPlayerHint(state, data, rng, pid);
      if (h) {
        take(h, "player");
        got += 1;
      }
    }
    for (; got < playerHintCount; got++) take(null, "player");
  }
  // 2b. 컷인 힌트 (§15.5): 레슨 중 코치 능력으로 얻은 힌트 — 결과와 상관없이, 그 코치의 힌트 1개씩
  for (const supportId of res.cutinHints || []) take(drawHintFrom(state, data, rng, supportId), "cutin");

  // 3. 결장 감소: 레슨 시작부터 빠진 선수
  for (const id of L.outAtStart) {
    const p = playerById(state, id);
    p.injuredTurns = Math.max(0, (Number(p.injuredTurns) || 0) - 1);
  }

  // 4. 기록 · 로그
  state.record.lessons.push({
    turnIndex: state.turnIndex,
    zone: L.zone,
    special: L.special,
    prep: L.prep,
    score: L.score,
    target: L.target,
    cap: L.cap,
    result: status,
    turns: L.turn,
    plays: res.plays,
    benches: res.benches,
    fails: res.fails,
    injuries: res.injuries,
    attaches: res.attaches,
    cutins: res.cutins.length,
  });
  const label = { perfect: "퍼펙트", clear: "클리어", fail: "실패" }[status] || status;
  log(state, `${L.prep ? "대비 레슨" : L.special ? "특별 레슨" : "레슨"}[${STAT_LABELS[L.zone]} 중점] ${label} — 점수 ${L.score} / ${L.target} / ${L.cap}${tp ? `, TP +${tp}` : ""}${hints.length ? `, 힌트 ${hints.length}` : ""}${teach.length ? `, 코치 수업 ${teach.length}` : ""}`);

  // 5. 보상 후보
  const offer = ok ? rollRewardOffer(state, data, rng, status, L.special) : [];
  state.rngState = rng.getState();

  // 유대 변화 (레슨 중 코치 카드 +8, 중점 구역 = 코치 타입 +5)
  const bond = [];
  for (const st of state.supports) {
    const before = L.bondBefore && typeof L.bondBefore[st.id] === "number" ? L.bondBefore[st.id] : st.bond;
    if (st.bond !== before) {
      const sc = supportCard(data, st.id);
      bond.push({ id: st.id, name: sc ? sc.name : st.id, gain: st.bond - before, bond: st.bond });
    }
  }

  // 6. phase reward
  state.pendingReward = {
    offer,
    freeUpgrades,
    teach,
    result: {
      zone: L.zone,
      special: L.special,
      prep: L.prep,
      score: L.score,
      target: L.target,
      cap: L.cap,
      status,
      turns: L.turns,
      turnReached: L.turn,
      tp,
      sp,
      spLesson,
      hints: hints.map((h) => ({
        skillId: h.skillId, level: h.level, supportId: h.supportId, playerId: h.playerId, src: h.src,
        name: (skillById(data, h.skillId) || {}).name || h.skillId,
        playerName: h.playerId ? (playerById(state, h.playerId) || {}).name || h.playerId : null,
      })),
      teach: [], // 끝난 수업 요약 (resolveTeach 가 채운다, §18.4)
      attaches: res.attaches,
      cutins: res.cutins.map((c) => ({ ...c })),
      teamwork,
      twAccrued: L.twAccrued,
      condition,
      prepBonus,
      bond,
      plays: res.plays,
      benches: res.benches,
      fails: res.fails,
      injuries: res.injuries,
      // lessonResult 모양 그대로: { id, byStat, base, mood, card, sub, targeted, benched } (§14.13)
      perPlayer: res.perPlayer.map((x) => ({ ...x, byStat: { ...x.byStat } })),
    },
  };
  state.phase = "reward";
  return state;
}

// ---------------------------------------------------------------------------
// 보상 (phase reward)
// ---------------------------------------------------------------------------

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

/** 코치 표시 (수업 · 뷰). supportId 가 없으면 (이벤트) "코치진" */
function teachCoach(data, supportId) {
  const sc = supportId ? supportCard(data, supportId) : null;
  return {
    coachName: sc ? sc.name : "코치진",
    coachShort: sc ? shortName(sc.name) : "코치진",
    coachColor: (sc && sc.portraitColor) || "#888888",
  };
}

function skillName(data, id) {
  const sk = skillById(data, id);
  return sk ? sk.name : id;
}

/** 보상 뷰의 수업 칸 (§18.4). 순수. */
function teachView(state, data, pr) {
  const list = Array.isArray(pr.teach) ? pr.teach : [];
  const idx = list.findIndex((t) => t.result === null);
  const view = {
    total: list.length,
    index: idx < 0 ? list.length : idx,
    declineSp: declineSpOf(data),
    list: list.map((t) => ({
      skillId: t.skillId,
      name: skillName(data, t.skillId),
      supportId: t.supportId,
      ...teachCoach(data, t.supportId),
      src: t.src,
      result: t.result,
      playerId: t.playerId,
      replaced: t.replaced,
      replacedName: t.replaced ? skillName(data, t.replaced) : null,
      sp: t.sp,
    })),
    cur: null,
  };
  if (idx < 0) return view;
  const t = list[idx];
  const sk = skillById(data, t.skillId) || {};
  const players = state.players.map((p) => {
    const c = canTeachSkill(state, data, t.skillId, p.id);
    return {
      id: p.id,
      charId: p.charId,
      name: p.name,
      slot: p.slot,
      position: p.position,
      portraitColor: p.portraitColor,
      injured: (Number(p.injuredTurns) || 0) > 0,
      ok: c.ok,
      reason: c.reason,
      full: c.full,
      learned: p.learnedSkillIds.map((id) => ({ skillId: id, name: skillName(data, id), kind: (skillById(data, id) || {}).kind || null })),
    };
  });
  view.cur = {
    skillId: t.skillId,
    name: sk.name || t.skillId,
    kind: sk.kind || null,
    description: sk.description || "",
    positions: Array.isArray(sk.positions) && sk.positions.length ? sk.positions.slice() : null,
    supportId: t.supportId,
    ...teachCoach(data, t.supportId),
    src: t.src,
    noneEligible: !players.some((p) => p.ok),
    players,
  };
  return view;
}

/** 보상 모달 뷰 (§5.4.4 · 수업 §18.4). 순수. */
export function getRewardView(state, data) {
  assertPhase(state, "reward");
  const pr = state.pendingReward;
  if (!pr) throw new Error("pendingReward 가 없습니다");
  return {
    teach: teachView(state, data, pr),
    result: JSON.parse(JSON.stringify(pr.result)),
    offer: pr.offer.map((o) => ({ ...cardView(state, data, { uid: o.uid ?? null, cardId: o.cardId, plus: o.plus }), kind: o.kind, uid: o.uid ?? null })),
    freeUpgrades: pr.freeUpgrades,
    upgradable: pr.freeUpgrades > 0 ? state.deck.filter((e) => upgradable(data, e)).map((e) => e.uid) : [],
    skipTp: pr.offer.length ? LD(data).rewards.skipTp : 0,
    deck: state.deck.map((e) => cardView(state, data, e)), // 무료 강화 그리드 · "강화 후" 미리보기 (U4)
  };
}

/**
 * 코치 수업 1개 처리 (§18.4) — pendingReward.teach 중 result 가 null 인 첫 항목. rng 를 쓰지 않는다. 검증이 실패하면 상태 그대로.
 *   playerId 없음 → 배우지 않는다: result "declined" (받을 수 있는 선수가 있었다) | "none" (없었다), SP +declineSp.
 *   playerId 있음 → canTeachSkill 이 ok 여야 한다. 슬롯이 가득이면 replaceSkillId (그 선수의 습득 스킬) 를 그 자리에서 바꾸고,
 *   빈 슬롯이 있으면 replaceSkillId 는 오류 (실수 방지). 뺀 스킬은 사라진다 (환불 없음 [가정]).
 * @param {{ playerId?: string|null, replaceSkillId?: string|null }} args
 * @returns {object} state (phase reward 그대로)
 */
export function resolveTeach(state, data, { playerId = null, replaceSkillId = null } = {}) {
  assertData(data);
  assertPhase(state, "reward");
  const pr = state.pendingReward;
  if (!pr) throw new Error("pendingReward 가 없습니다");
  const t = (Array.isArray(pr.teach) ? pr.teach : []).find((x) => x.result === null);
  if (!t) throw new Error("남은 코치 수업이 없습니다");
  const name = skillName(data, t.skillId);
  const coach = teachCoach(data, t.supportId);
  const coachLabel = t.supportId ? `${coach.coachShort} 코치` : coach.coachName;
  const hasRep = replaceSkillId !== null && replaceSkillId !== undefined;
  let text;
  let p = null;
  if (playerId === null || playerId === undefined) {
    if (hasRep) throw new Error("수업을 받지 않을 때는 바꿀 스킬을 고르지 않습니다");
    const any = state.players.some((x) => canTeachSkill(state, data, t.skillId, x.id).ok);
    const sp = declineSpOf(data);
    t.result = any ? "declined" : "none";
    t.sp = sp;
    state.skillPoints += sp;
    text = any ? `수업: '${name}' 받지 않음 — SP +${sp}` : `수업: '${name}' — 받을 선수 없음, SP +${sp}`;
  } else {
    const c = canTeachSkill(state, data, t.skillId, playerId);
    if (!c.ok) throw new Error(`수업 불가: ${c.reason}`);
    p = playerById(state, playerId);
    if (c.full) {
      if (!hasRep) throw new Error("스킬 슬롯이 가득입니다 — 바꿀 스킬을 고르세요");
      const i = p.learnedSkillIds.indexOf(replaceSkillId);
      if (i < 0) throw new Error(`'${replaceSkillId}' 은(는) ${p.name} 의 습득 스킬이 아닙니다`);
      if (!isActiveSkill(skillById(data, replaceSkillId))) throw new Error(`'${skillName(data, replaceSkillId)}' 은(는) 패시브라 바꿀 수 없습니다 — 액티브만 바꿉니다`);
      p.learnedSkillIds[i] = t.skillId;
      t.replaced = replaceSkillId;
    } else {
      if (hasRep) throw new Error("빈 슬롯이 있어 바꿀 스킬을 고르지 않습니다");
      p.learnedSkillIds.push(t.skillId);
    }
    t.result = "learned";
    t.playerId = p.id;
    text = `수업: ${coachLabel} → ${p.name} '${name}' 습득${t.replaced ? ` ('${skillName(data, t.replaced)}' 대신)` : ""}`;
  }
  if (!Array.isArray(pr.result.teach)) pr.result.teach = [];
  pr.result.teach.push({
    skillId: t.skillId,
    name,
    supportId: t.supportId,
    src: t.src,
    result: t.result,
    playerId: t.playerId,
    playerName: p ? p.name : null,
    replaced: t.replaced,
    replacedName: t.replaced ? skillName(data, t.replaced) : null,
    sp: t.sp,
  });
  log(state, text);
  return state;
}

/**
 * 보상 고르기 (§5.4.3). pick = offer 번호 | null(건너뛰기), upgradeUid = 무료 강화할 덱 카드 (없으면 그 기회는 사라진다).
 * @returns {object} state
 */
export function resolveReward(state, data, { pick = null, upgradeUid = null } = {}) {
  assertData(data);
  assertPhase(state, "reward");
  const pr = state.pendingReward;
  if (!pr) throw new Error("pendingReward 가 없습니다");
  // 검증
  if (Array.isArray(pr.teach) && pr.teach.some((t) => t.result === null)) throw new Error("코치 수업을 먼저 끝내세요");
  let chosen = null;
  if (pick !== null && pick !== undefined) {
    if (!Number.isInteger(pick) || pick < 0 || pick >= pr.offer.length) throw new Error(`보상 번호가 잘못되었습니다: ${pick}`);
    chosen = pr.offer[pick];
    if (chosen.kind === "upgrade" && !upgradable(data, deckEntry(state, chosen.uid))) throw new Error("강화할 수 없는 카드입니다");
  }
  if (upgradeUid !== null && upgradeUid !== undefined) {
    if (!(pr.freeUpgrades > 0)) throw new Error("무료 강화가 없습니다");
    if (!upgradable(data, deckEntry(state, upgradeUid))) throw new Error(`카드 '${upgradeUid}' 은(는) 강화할 수 없습니다`);
    if (chosen && chosen.kind === "upgrade" && chosen.uid === upgradeUid) throw new Error("같은 카드를 두 번 강화할 수 없습니다");
  }
  // 적용
  const parts = [];
  if (chosen) {
    const name = cards.getCard(data, chosen.cardId).name;
    if (chosen.kind === "add") {
      addToDeck(state, chosen.cardId, chosen.plus);
      const b = acquireBond(state, data, chosen.cardId);
      parts.push(`카드 획득: ${name}${chosen.plus ? "+" : ""}${b ? ` (유대 +${b})` : ""}`);
    } else {
      deckEntry(state, chosen.uid).plus = true;
      parts.push(`카드 강화: ${name}+`);
    }
  } else if (pr.offer.length) {
    state.trainingPoints += LD(data).rewards.skipTp;
    parts.push(`보상 건너뛰기: TP +${LD(data).rewards.skipTp}`);
  }
  if (upgradeUid !== null && upgradeUid !== undefined) {
    const e = deckEntry(state, upgradeUid);
    e.plus = true;
    parts.push(`무료 강화: ${cards.getCard(data, e.cardId).name}+`);
  }
  if (parts.length) log(state, parts.join(", "));
  state.lesson = null;
  state.pendingReward = null;
  return weekEnd(state, data);
}

// ---------------------------------------------------------------------------
// 상담 (phase consult)
// ---------------------------------------------------------------------------

function cardPrice(data, cardId) {
  const price = LD(data).consult.price;
  const fam = cards.getCard(data, cardId).family;
  if (fam === "common") return price.common;
  if (fam === "coach") return price.coach;
  return price.policy;
}

/** 상담 진열 (§5.4.3): 편성 코치 카드 1장 (specialtyRate 가중) + pool 공용 · 내 방침 카드 2장. rng. */
function rollConsult(state, data) {
  const C = LD(data).consult;
  const rng = createRngFromState(state.rngState);
  const coachCands = state.supports
    .map((st) => ({ card: coachCardOf(data, st.id), w: Number((supportCard(data, st.id) || {}).specialtyRate) || 0 }))
    .filter((x) => x.card);
  const pool = cards.cardList(data).filter((c) => c.pool && (c.family === "common" || c.family === state.policy));
  const nPool = Math.max(0, C.stock - (coachCands.length ? 1 : 0));
  const picks = rng.shuffle(pool).slice(0, nPool).map((c) => c.id);
  if (coachCands.length) picks.push(rng.weighted(coachCands, (x) => x.w).card.id);
  state.rngState = rng.getState();
  return {
    stock: picks.map((cardId) => ({ cardId, price: cardPrice(data, cardId), bought: false })),
    upgradesLeft: C.upgradesPerVisit,
    deletesLeft: C.deletesPerVisit,
  };
}

/**
 * 상담 스킬 진열 (§18.5 · L48): SP 로 파는 것은 **패시브만** (액티브는 코치 수업). 진열 = 선수마다 자기 패시브 목록 3개
 * (passives.passiveShopView 를 한 줄씩 편 것 — 선수 · 스킬 한 쌍이 한 줄, 이미 가진 것은 뺀다). 순수.
 */
function consultSkillRows(state, data) {
  const rows = [];
  for (const p of passives.passiveShopView(state, data).players) {
    for (const r of p.rows) {
      if (r.owned) continue;
      rows.push({
        skillId: r.skillId,
        playerId: p.id,
        playerName: p.name,
        name: r.name,
        kind: "passive",
        unique: r.unique,
        description: r.description,
        positions: (skillById(data, r.skillId) || {}).positions || null,
        baseCost: r.baseCost,
        cost: r.cost,
        level: r.level,
        ok: r.ok,
        reason: r.reason,
        affordable: r.affordable,
        eligiblePlayers: r.ok ? [p.id] : [],
      });
    }
  }
  return rows;
}

/** 상담 화면 뷰 (§5.4.4). 순수. skills = 패시브만 (consultSkillRows, §18.5) */
export function getConsultView(state, data) {
  assertPhase(state, "consult");
  const c = state.consult;
  if (!c) throw new Error("상담 중이 아닙니다");
  const C = LD(data).consult;
  const skills = consultSkillRows(state, data);
  return {
    tp: state.trainingPoints,
    sp: state.skillPoints,
    stock: c.stock.map((s) => ({
      card: cardView(state, data, { cardId: s.cardId, plus: false }),
      cardId: s.cardId,
      price: s.price,
      bought: s.bought,
      affordable: !s.bought && state.trainingPoints >= s.price,
    })),
    deck: state.deck.map((e) => cardView(state, data, e)),
    upgradesLeft: c.upgradesLeft,
    deletesLeft: c.deletesLeft,
    prices: { ...C.price },
    minDeck: C.minDeck,
    skills,
    players: state.players.map((p) => playerView(state, data, p)),
  };
}

/**
 * 상담 행동 1개 (§5.4.3 표). 검증이 실패하면 상태를 바꾸지 않고 throw.
 * @param {{ op: "buy", index: number } | { op: "upgrade", uid: string } | { op: "delete", uid: string } |
 *         { op: "skill", skillId: string, playerId: string }} op
 * @returns {object} state
 */
export function consultAction(state, data, op) {
  assertData(data);
  assertPhase(state, "consult");
  const c = state.consult;
  if (!c) throw new Error("상담 중이 아닙니다");
  if (!op || typeof op.op !== "string") throw new Error("op 가 필요합니다");
  const C = LD(data).consult;
  switch (op.op) {
    case "buy": {
      const s = Number.isInteger(op.index) ? c.stock[op.index] : null;
      if (!s) throw new Error(`진열 번호가 잘못되었습니다: ${op.index}`);
      if (s.bought) throw new Error("이미 산 카드입니다");
      if (state.trainingPoints < s.price) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${s.price})`);
      state.trainingPoints -= s.price;
      s.bought = true;
      addToDeck(state, s.cardId, false);
      const b = acquireBond(state, data, s.cardId);
      log(state, `상담: ${cards.getCard(data, s.cardId).name} 구매 (TP −${s.price}${b ? `, 유대 +${b}` : ""})`);
      return state;
    }
    case "upgrade": {
      if (!(c.upgradesLeft > 0)) throw new Error("이번 상담의 강화를 이미 썼습니다");
      const e = deckEntry(state, op.uid);
      if (!upgradable(data, e)) throw new Error(`카드 '${op.uid}' 은(는) 강화할 수 없습니다`);
      if (state.trainingPoints < C.price.upgrade) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${C.price.upgrade})`);
      state.trainingPoints -= C.price.upgrade;
      c.upgradesLeft -= 1;
      e.plus = true;
      log(state, `상담: ${cards.getCard(data, e.cardId).name}+ 강화 (TP −${C.price.upgrade})`);
      return state;
    }
    case "delete": {
      if (!(c.deletesLeft > 0)) throw new Error("이번 상담의 삭제를 이미 썼습니다");
      const e = deckEntry(state, op.uid);
      if (!e) throw new Error(`카드 '${op.uid}' 이(가) 덱에 없습니다`);
      if (state.deck.length - 1 < C.minDeck) throw new Error(`덱은 ${C.minDeck}장 아래로 줄일 수 없습니다`);
      if (state.trainingPoints < C.price.delete) throw new Error(`TP 가 부족합니다 (${state.trainingPoints}/${C.price.delete})`);
      state.trainingPoints -= C.price.delete;
      c.deletesLeft -= 1;
      state.deck = state.deck.filter((x) => x.uid !== e.uid);
      log(state, `상담: ${cards.getCard(data, e.cardId).name} 삭제 (TP −${C.price.delete})`);
      return state;
    }
    case "skill": {
      const known = skillById(data, op.skillId);
      if (isActiveSkill(known)) throw new Error("액티브 스킬은 코치 수업으로 배웁니다");
      if (known && known.kind !== "passive") throw new Error("상담에서는 패시브 스킬만 배울 수 있습니다");
      const r = passives.applyBuyPassive(state, data, op.skillId, op.playerId);
      log(state, `상담: ${r.player.name} — '${r.name}' 습득 (SP −${r.cost})`);
      return state;
    }
    default:
      throw new Error(`알 수 없는 상담 행동: '${op.op}'`);
  }
}

/** 상담 끝 → 주 끝 */
export function endConsult(state, data) {
  assertData(data);
  assertPhase(state, "consult");
  state.consult = null;
  log(state, "상담 끝");
  return weekEnd(state, data);
}

// ---------------------------------------------------------------------------
// 경기 전 준비 (phase prep) · 경기 · 유물 · 루트 · 이벤트 · 끝
// ---------------------------------------------------------------------------

/** 경기 전 준비 뷰 (§5.4.4). 순수. */
export function getPrepView(state, data) {
  assertPhase(state, "prep");
  return {
    nextMatch: run.nextMatchView(state, data),
    formation: state.formation,
    tactics: { ...state.tactics },
    players: state.players.map((p) => playerView(state, data, p)),
    injuredOut: state.players.filter((p) => (Number(p.injuredTurns) || 0) > 0).map((p) => p.id),
    partyPassives: passives.partyPassivesFor(state, data), // 코치 파티 패시브 (L48)
    shopBuyable: shopBuyableCount(state, data),
    // 대비 레슨 클리어 보너스만 (유물 '낡은 주장 완장' 의 goalMatchCondition 은 대비 레슨 표시가 아니다)
    prepBonus: state.modifiers.some(
      (m) => m.key === "goalMatchCondition" && m.source === "prepLesson" && (m.untilSeason === null || m.untilSeason === undefined || m.untilSeason >= state.season),
    ),
    status: statusView(state),
  };
}

/**
 * 경기 전 준비 확정: 전술 · 포메이션 · 배치 (팀워크 없음, 주를 쓰지 않는다) → 경계전 (phase match).
 * @param {{ tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }> }} args
 */
export function confirmPrep(state, data, { tactics, formation, swaps } = {}) {
  assertData(data);
  assertPhase(state, "prep");
  run.migrateRun(state);
  const r = resolveMeeting(state, data, { tactics, formation, swaps }, { teamwork: false });
  state.tactics = run.normalizeTactics(state.tactics);
  if (r.formationChanged || r.swapped) log(state, `경기 전 준비: ${r.formationChanged ? `포메이션 ${state.formation}` : ""}${r.swapped ? ` 포지션 변경 ${r.swapped}` : ""}`.trim());
  run.makeGoalMatch(state, data);
  state.queue = ["seasonEnd"];
  state.phase = "match";
  return state;
}

/**
 * 우리 팀 경기 스냅샷 (§18.1): 다친 선수도 본인이 그대로 나온다 (유스 교체 · 스탯 벌칙 없음). 순수 — 저장 상태의 injuredTurns 는 그대로.
 * 옛 런 (run.buildTeamSnapshot 을 직접 부르는 쪽) 은 지금처럼 유스로 바꾼다.
 */
export function buildTeamSnapshot(state, data) {
  return withParty(run.buildTeamSnapshot(fieldView(state), data), state, data);
}

/** 경기 세팅 (run.getMatchSetup 과 같은 모양 · 시드 · 규칙, home 에 유스 없음 — §18.1). 순수. home 에 코치 파티 패시브 (L48) */
export function getMatchSetup(state, data) {
  const setup = run.getMatchSetup(fieldView(state), data);
  withParty(setup.home, state, data);
  return setup;
}

/** 우리 팀 스냅샷에 코치 파티 패시브를 싣는다 (L48 — 편성하면 처음부터, 유대 80이면 한 단계 위). 없으면 키를 두지 않는다 */
function withParty(team, state, data) {
  const pp = passives.partyPassivesFor(state, data);
  if (pp.length) team.partyPassives = pp;
  return team;
}

/** 코치 파티 패시브 뷰 (준비 · 주 · 편성 표시용, 순수) */
export function getPartyPassives(state, data) {
  return passives.partyPassivesFor(state, data);
}

/** SP 상점 뷰 (L48 — 주 · 상담 · 경기 전 준비에서 연다). 순수. */
export function getPassiveShopView(state, data) {
  return passives.passiveShopView(state, data);
}

/**
 * 패시브 사기 (L48): phase 가 주 · 상담 · 경기 전 준비일 때. 그 선수 패시브 목록 안 · 아직 없음 · 포지션 · SP. 실패하면 상태 그대로 throw.
 * @param {{ skillId: string, playerId: string }} args
 */
export function buyPassive(state, data, { skillId, playerId } = {}) {
  assertData(data);
  if (!passives.SHOP_PHASES.includes(state.phase)) throw new Error(`지금(${state.phase})은 패시브를 살 수 없습니다`);
  const r = passives.applyBuyPassive(state, data, skillId, playerId);
  log(state, `패시브: ${r.player.name} — '${r.name}' 습득 (SP −${r.cost})`);
  return state;
}

/**
 * 경기 끝 (run.settleMatch) → 유물 후보가 있으면 relic, 아니면 흐름을 잇는다.
 * 친선전이면 다친 선수도 경기에 나왔으므로 체력 −friendly.staminaCost 를 낸다 (settleMatch 는 다친 선수를 빼므로 여기서 보탠다, §18.1).
 */
export function finishMatch(state, data, matchResult) {
  assertData(data);
  assertPhase(state, "match");
  if (!state.pendingMatch) throw new Error("pendingMatch 가 없습니다");
  if (!matchResult || typeof matchResult !== "object") throw new Error("matchResult 가 필요합니다");
  run.migrateRun(state);
  const friendly = state.pendingMatch.kind !== "goal";
  const injured = state.players.filter((p) => (Number(p.injuredTurns) || 0) > 0).map((p) => p.id);
  const { relicChoices } = run.settleMatch(state, data, matchResult);
  if (friendly) {
    const cost = Number(data.config.friendly.staminaCost) || 0;
    for (const id of injured) addStamina(playerById(state, id), -cost);
  }
  if (relicChoices.length) {
    state.pendingRelicChoices = relicChoices;
    state.phase = "relic";
    return state;
  }
  return continueFlow(state, data);
}

/** 유물 고르기 (run.applyRelicChoice) → 흐름을 잇는다 */
export function chooseRelic(state, data, relicId) {
  assertData(data);
  assertPhase(state, "relic");
  run.migrateRun(state);
  if ((relicId === null || relicId === undefined) && !(Array.isArray(state.pendingRelicChoices) && state.pendingRelicChoices.length)) {
    state.pendingRelicChoices = null;
    return continueFlow(state, data);
  }
  run.applyRelicChoice(state, data, relicId);
  return continueFlow(state, data);
}

/**
 * 루트 고르기 (§5.4.2): 시즌 +1 → 만료 modifier 제거 → 루트 효과 → (온천) 무료 외출 → 시즌 계획 → [원정 친선전] → 1주 시작.
 * 루트 이벤트 · 시즌 시작 이벤트는 없다.
 */
export function chooseRoute(state, data, routeId) {
  assertData(data);
  assertPhase(state, "route");
  run.migrateRun(state);
  if (!Array.isArray(state.pendingRoutes) || !state.pendingRoutes.includes(routeId)) throw new Error(`루트 '${routeId}' 은(는) 선택지에 없습니다`);
  const route = data.routes.find((r) => r.id === routeId);
  if (!route) throw new Error(`루트 '${routeId}' 이(가) 없습니다`);
  state.pendingRoutes = null;
  state.season += 1;
  state.turn = 1;
  state.turnIndex = (state.season - 1) * weeksPerSeason(data);
  state.modifiers = state.modifiers.filter((m) => m.untilSeason === null || m.untilSeason === undefined || m.untilSeason >= state.season);
  log(state, `루트 선택: ${route.name}. 시즌 ${state.season} 시작.`);
  applyEffects(state, data, route.effects || [], { playerId: null, supportId: null, eventId: null });
  const ov = (LD(data).routeOverrides || {})[routeId];
  if (ov && ov.freeOuting) state.freeOuting = ov.freeOuting;
  rollSeasonPlan(state, data);
  state.queue = [];
  if (route.forcedFriendly) state.queue.push("routeFriendly");
  state.queue.push("beginWeek");
  return continueFlow(state, data);
}

/** 이벤트 선택 (1차에는 쓰지 않는다) → 흐름을 잇는다 */
export function resolveEvent(state, data, choiceIndex) {
  assertData(data);
  assertPhase(state, "event");
  if (!state.currentEvent) throw new Error("currentEvent 가 없습니다");
  run.migrateRun(state);
  const before = { ...state.hints };
  const supportId = state.currentEvent.supportId || null;
  run.applyEventChoice(state, data, choiceIndex);
  routeEventHints(state, data, before, supportId); // 이벤트 효과로 늘어난 액티브 힌트 → 다음 보상의 코치 수업 (§18.3)
  return continueFlow(state, data);
}

/**
 * 런 끝 평가 (run.finalizeRun) + registeredTeam.policy (D44).
 * @returns {{ rating: object, registeredTeam: object }}
 */
export function finalizeRun(state, data) {
  const out = run.finalizeRun(state, data);
  out.registeredTeam.policy = state.policy;
  return out;
}
