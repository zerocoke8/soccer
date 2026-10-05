/**
 * lessonEvents.js — 레슨 런 이벤트 (LESSON_PROTO_PLAN §24.3 · §24.5.1).
 *
 * E1: 데이터 읽기 · 검사 (E2 가 "cardPick 은 한 선택지에 하나까지" 규칙을 더했다 — 고르는 카드 uid 는 한 장).
 *   - EVENT_FILES: data/lesson_ev_*.json 7개 (js/ui/app.js · test/helpers.mjs · tools/lesson_sim.mjs · tools/scenarios.mjs 의 목록과 같다 —
 *     test/lessonContent 가 비교한다). 파일마다 `{ version: 1, notes: { [charId|supportId]: { arc, setting[] } }, events: [] }`.
 *   - allEvents(data) · eventById(data, id): 7개 파일을 이어 붙여 한 목록으로 본다 (없는 파일은 건너뛴다, 캐시 없음).
 *   - validateLessonEvents(data): §24.3.7 규칙 전부. 오류를 모두 모아 "레슨 이벤트 데이터: …" 한 번에 throw, 통과면 true.
 *   - setEventSwitches(lesson, on): lesson.json events 의 기능 스위치를 모두 켜거나 끈다 (테스트 · 도구용 — 데이터 사본에).
 * E2: 주인공 pickProtagonist · 띄우기 fireEvent · 뷰 getEventView · 고르기 resolveEvent · 감독 AI 기대값 choiceScore.
 *   - resolveEvent 는 효과 · 결과 문구 · lastEvent · 기록 갈고리까지 하고 phase 를 "flow" 로 둔다. 흐름 잇기 (continueFlow) 는
 *     lessonRun.resolveEvent 가 한다 (lessonEvents 는 lessonRun 을 import 하지 않는다 — 순환 import 방지).
 * E3: 흐름 자격 eligible · 주 끝 랜덤 pickWeekEvent · 일반 외출 pickOutingEvent · 고정 (시즌 시작 · 전야 · 루트) pickFixedEvent ·
 *   기능 스위치 switchOn · 주 끝 조건 weekCondOk · 가중치 eventWeight. queue 단계 (weekSlot …) 는 lessonRun 이 부른다 (§24.2).
 * E4 (이 판): 코치 연속 이벤트 (§24.6) coachReady · pickCoachEvent · 주인공 coachTarget (coachTargetCandidates),
 *   외출 이야기 (§24.7) storyNext · pickStoryEvent · storyList (회상), 계정 스냅샷 normalizeAccount · accountMerge (화면이 저장할 때).
 *   고른 뒤 기록 (onEventResolved): 이야기 → storySeen · storyEps, 코치 → coachSteps (계정 첫 만남은 coachSteps 의 1단계).
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 를 쓰지 않는다. 상태를 바꾸는 함수 (fireEvent · resolveEvent · setEventSwitches) 말고는
 * 입력을 바꾸지 않는다. rng 는 state.rngState 로만 (fireEvent · resolveEvent 가 한 번 열고 나갈 때 저장), 뷰 · 기대값은 rng 를 쓰지 않는다.
 */
import { createRngFromState } from "./rng.js";
import { logLine } from "./run.js";
import { TRIGGERS, TRIGGER_LABELS, effectErrors, buildRefIndex, describe, applyEffects, effectNeeds, scoreEffects } from "./lessonEffects.js";
import { scanText, bareJosaErrors, fillText, pickText } from "./lessonText.js";
import { POSITIONS, STATS } from "./training.js";
import { ZONE_IDS } from "./zones.js";
import { POLICY_FAMILIES, mainStatsOf } from "./cards.js";
import { coachCardOf } from "./lessonCommon.js";

export { TRIGGERS, TRIGGER_LABELS };

/** 레슨 런 이벤트 데이터 파일 (data/<이름>.json) — 슬라이스마다 하나 (§24.3.1) */
export const EVENT_FILES = Object.freeze([
  "lesson_ev_surprise",
  "lesson_ev_week",
  "lesson_ev_story",
  "lesson_ev_fixed",
  "lesson_ev_new_a",
  "lesson_ev_new_b",
  "lesson_ev_coach",
]);

/** 주인공 고르기 (§24.3.4) */
export const WHO_PICKS = Object.freeze([
  "none", "random", "char", "lowestStamina", "highestStamina", "partner", "coachTarget",
  "turnFailer", "streaker", "coachCardTarget", "multiTarget", "mostTargeted",
]);
const GENERAL_PICKS = ["none", "random", "char", "lowestStamina", "highestStamina"];
/** 트리거마다 쓸 수 있는 who.pick (외출 · 이야기 · 코치는 주인공이 정해져 있다) */
export const WHO_PICKS_BY_TRIGGER = Object.freeze({
  week: GENERAL_PICKS,
  seasonStart: GENERAL_PICKS,
  preMatch: GENERAL_PICKS,
  route: GENERAL_PICKS,
  outing: ["partner"],
  story: ["partner"],
  coach: ["coachTarget"],
  surprise: [...GENERAL_PICKS, "turnFailer", "streaker", "coachCardTarget", "multiTarget", "mostTargeted"],
});
/** pos · zone 으로 좁힐 수 있는 pick */
const NARROWABLE_PICKS = ["random", "lowestStamina", "highestStamina"];

/** 주 끝 · weightIf 조건 키 (§24.3.3) — 모두 AND */
export const COND_KEYS = Object.freeze(["anyStaminaBelow", "avgStaminaBelow", "anyInjured", "teamworkBelow", "conditionBelow", "conditionAtLeast"]);

/** 깜짝 조건 키 (§24.8) — 모두 AND */
export const SURPRISE_COND_KEYS = Object.freeze([
  "randomTurn", "turnMin", "turnsLeftMax", "halfway",
  "special", "zoneIn",
  "buffAtLeast", "buffEquals",
  "scoreToTargetMax", "scoreBelowTargetFrac", "capLeftMax", "notCleared", "notPerfect",
  "anyStaminaBelow",
  "failedThisTurn", "coachCardOkThisTurn", "multiOkThisTurn", "reshuffledThisTurn", "benchedThisTurn", "targetStreak",
  "char",
  "zoneEmptyAtTurnStart",
]);

/** 깜짝 cond.char 의 키 (§24.8) — 그 선수가 편성 · 결장 아님 · 쉼 아님은 늘 걸린다 */
export const SURPRISE_CHAR_KEYS = Object.freeze([
  "id", "staminaMin", "staminaMax", "targetedMin", "targetedMax", "untargetedTurnsMin",
  "zone", "zoneCountMin", "aloneInZone", "movedThisTurn", "targetedThisTurn", "ownCardThisTurn",
]);

/** 배경 그림 (§24.12.5) */
export const SCENE_IDS = Object.freeze(["title", "ground", "clubhouse", "town", "stands", "nature", "onsen"]);

/** scene 이 없을 때 트리거 기본값 (§24.12.5). 루트는 루트마다. 깜짝은 레슨 화면 위 말풍선이라 배경이 없다 */
export const DEFAULT_SCENES = Object.freeze({
  week: "ground", coach: "ground", story: "nature", outing: "nature", seasonStart: "stands", preMatch: "stands",
});
export const ROUTE_SCENES = Object.freeze({ rt_camp: "ground", rt_expedition: "nature", rt_hotspring: "onsen" });

/** 코치 연속 이벤트 단계별 유대 문턱 (§24.6 — step 1 · 2 · 3). lesson.json bond.eventSteps 가 없을 때의 값 */
export const COACH_STEP_BONDS = Object.freeze([0, 40, 80]);

/** bond.eventSteps 가 맞는 꼴인가: [2단계, 3단계] 정수, 0 < a < b ≤ 100 */
const okEventSteps = (es) => Array.isArray(es) && es.length === 2 && es.every((n) => Number.isInteger(n)) && es[0] > 0 && es[0] < es[1] && es[1] <= 100;

/**
 * 코치 연속 이벤트 단계별 유대 문턱 [1단계 0, 2단계, 3단계] — lesson.json bond.eventSteps ([40, 80], E4) 에서, 없거나 꼴이 틀리면
 * COACH_STEP_BONDS (틀린 꼴은 검사가 오류로 알린다). 이벤트의 bondAtLeast 는 이 값과 같아야 한다 (검사).
 * @param {object} data
 * @returns {number[]}
 */
export function coachStepBonds(data) {
  const es = data && data.lesson && data.lesson.bond ? data.lesson.bond.eventSteps : undefined;
  return okEventSteps(es) ? [0, es[0], es[1]] : COACH_STEP_BONDS.slice();
}
/** 외출 이야기 화 (§24.7) */
export const STORY_EPS = Object.freeze([1, 2, 3]);
/** 시즌 (1 ~ 3) */
const SEASONS = [1, 2, 3];

/** 이벤트 키: 모든 트리거 공통 + 트리거별 (꼭 · 있어도 됨) — §24.3.2 표 */
const COMMON_KEYS = ["id", "trigger", "title", "text", "scene", "choices", "alt"];
export const EVENT_KEYS = Object.freeze({
  week: { required: [], optional: ["who", "chars", "charMode", "coach", "weeks", "weekList", "seasons", "once", "weight", "weightIf", "cond"] },
  seasonStart: { required: ["seasons"], optional: ["who"] },
  preMatch: { required: ["seasons"], optional: ["who"] },
  route: { required: ["routeId"], optional: ["who"] },
  outing: { required: [], optional: ["weight", "who"] },
  story: { required: ["story"], optional: ["who"] },
  coach: { required: ["chain", "bondAtLeast"], optional: ["who"] },
  surprise: { required: ["cond"], optional: ["who", "chars", "charMode", "policy", "weight", "seasons"] },
});

/** 옛 events.json 키 (모르는 키 오류에 덧붙이는 말) */
const OLD_EVENT_KEYS = {
  supportId: "옛 events.json 키 → 코치 편성 조건은 coach, 코치 연속 이벤트는 chain.supportId",
  characterId: "옛 events.json 키 → 편성 조건은 chars, 주인공은 who { pick: \"char\", charId }",
  minTurnIndex: "옛 events.json 키 → weeks [a, b] (주 번호 turnIndex 0 ~ 14)",
  notes: "메모는 파일의 notes 에 (charId · supportId 별)",
};
/** 옛 선택지 키 */
const OLD_CHOICE_KEYS = {
  text: "→ label (감독의 결정)",
  preview: "미리보기는 효과에서 자동으로 만든다 (R14)",
  resultText: "→ result",
};

const ID_RE = /^[a-z][a-z0-9_]*$/;
const FILE_KEYS = ["version", "notes", "events"];

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const show = (v) => (typeof v === "string" ? `'${v}'` : JSON.stringify(v));
const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isBranch = (r) => isObj(r) && Object.prototype.hasOwnProperty.call(r, "then") && Object.prototype.hasOwnProperty.call(r, "else");

// ---------------------------------------------------------------------------
// 읽기
// ---------------------------------------------------------------------------

/**
 * 7개 파일의 이벤트를 이어 붙인 목록 (파일 순서 · 파일 안 순서). 없는 파일 · events 가 배열이 아닌 파일은 건너뛴다.
 * 캐시하지 않는다 (테스트가 데이터 사본을 바꿔도 맞다).
 * @param {object} data
 * @returns {object[]}
 */
export function allEvents(data) {
  const out = [];
  for (const f of EVENT_FILES) {
    const file = data ? data[f] : null;
    if (!file || !Array.isArray(file.events)) continue;
    for (const ev of file.events) if (ev) out.push(ev);
  }
  return out;
}

/**
 * @param {object} data
 * @param {string} id
 * @returns {object|null}
 */
export function eventById(data, id) {
  for (const f of EVENT_FILES) {
    const file = data ? data[f] : null;
    if (!file || !Array.isArray(file.events)) continue;
    const ev = file.events.find((e) => e && e.id === id);
    if (ev) return ev;
  }
  return null;
}

/** 그 이벤트의 배경 그림 id (scene → 트리거 · 루트 기본값 → ground) */
export function sceneOf(ev) {
  if (!ev) return "ground";
  if (typeof ev.scene === "string" && SCENE_IDS.includes(ev.scene)) return ev.scene;
  if (ev.trigger === "route") return ROUTE_SCENES[ev.routeId] || "ground";
  return DEFAULT_SCENES[ev.trigger] || "ground";
}

/** lesson.json events 의 기능 스위치 (§24.3.6) */
export const EVENT_SWITCHES = Object.freeze(["week", "seasonStart", "preMatch", "route", "outing", "coach.enabled", "surprise.enabled"]);

/**
 * 기능 스위치를 모두 켜거나 끈다 (그 객체를 바꾼다 — 데이터 사본에만 쓴다). events 블록이 없으면 그대로.
 * 말투 표 · 대체값 · 그 밖의 키는 건드리지 않는다.
 * @param {object} lessonData  data.lesson (lesson.json)
 * @param {boolean} on
 * @returns {object} lessonData
 */
export function setEventSwitches(lessonData, on) {
  const ev = lessonData && lessonData.events;
  if (!isObj(ev)) return lessonData;
  const v = !!on;
  for (const k of ["week", "seasonStart", "preMatch", "route", "outing"]) ev[k] = v;
  ev.coach = { ...(isObj(ev.coach) ? ev.coach : {}), enabled: v };
  ev.surprise = { ...(isObj(ev.surprise) ? ev.surprise : {}), enabled: v };
  return lessonData;
}

// ---------------------------------------------------------------------------
// 검사 (§24.3.7)
// ---------------------------------------------------------------------------

/**
 * 레슨 이벤트 데이터를 검사한다. 오류를 모두 모아 한 번에 던진다.
 * @param {object} data
 * @returns {true}
 * @throws {Error} "레슨 이벤트 데이터: 오류 N개\n- <파일> <이벤트 id>: <이유>\n…"
 */
export function validateLessonEvents(data) {
  const errors = lessonEventErrors(data);
  if (errors.length) throw new Error(`레슨 이벤트 데이터: 오류 ${errors.length}개\n${errors.map((e) => `- ${e}`).join("\n")}`);
  return true;
}

/**
 * validateLessonEvents 의 오류 목록 (던지지 않는다). 한 줄 = "<파일>.json <이벤트 id>: <이유>".
 * @param {object} data
 * @returns {string[]}
 */
export function lessonEventErrors(data) {
  const errors = [];
  const ix = buildRefIndex(data);
  const lastWeek = weekCount(data) - 1;
  const bonds = coachStepBonds(data);
  const seenIds = new Map(); // id → 파일 이름
  const stories = new Map(); // charId → [{ ep, label }]
  const chains = new Map(); // supportId → [{ step, label }]
  for (const f of EVENT_FILES) {
    const file = data ? data[f] : undefined;
    if (file === undefined || file === null) continue; // 없는 파일은 오류가 아니다 (콘텐츠가 들어오는 중)
    const fname = `${f}.json`;
    const fileErr = (msg) => errors.push(`${fname}: ${msg}`);
    if (!isObj(file)) {
      fileErr("파일은 { version, notes, events } 객체다");
      continue;
    }
    for (const k of Object.keys(file)) if (!FILE_KEYS.includes(k)) fileErr(`파일에 모르는 키 '${k}' (쓸 수 있는 키: ${FILE_KEYS.join(" · ")})`);
    if (file.version !== 1) fileErr(`version 은 1 (지금 ${show(file.version)})`);
    if (file.notes !== undefined) notesErrors(file.notes, ix, fileErr);
    if (!Array.isArray(file.events)) {
      fileErr("events 는 배열이다");
      continue;
    }
    file.events.forEach((ev, i) => {
      const label = `${fname} ${isObj(ev) && typeof ev.id === "string" && ev.id ? ev.id : `events[${i}]`}`;
      const err = (msg) => errors.push(`${label}: ${msg}`);
      eventErrors(ev, { data, ix, lastWeek, bonds, err });
      if (!isObj(ev)) return;
      if (typeof ev.id === "string" && ev.id) {
        if (seenIds.has(ev.id)) err(`id 가 겹친다 (${seenIds.get(ev.id)} 에도 있다) — 파일 7개 전체에서 하나`);
        else seenIds.set(ev.id, fname);
      }
      if (ev.trigger === "story" && isObj(ev.story) && typeof ev.story.charId === "string") {
        if (!stories.has(ev.story.charId)) stories.set(ev.story.charId, []);
        stories.get(ev.story.charId).push({ ep: ev.story.ep, label });
      }
      if (ev.trigger === "coach" && isObj(ev.chain) && typeof ev.chain.supportId === "string") {
        if (!chains.has(ev.chain.supportId)) chains.set(ev.chain.supportId, []);
        chains.get(ev.chain.supportId).push({ step: ev.chain.step, label });
      }
    });
  }
  // 이야기: 캐릭터마다 1 · 2 · 3화가 하나씩 (하나도 없으면 오류가 아니다)
  for (const [charId, list] of stories) {
    const name = ix.chars.get(charId)?.name || charId;
    setErrors(list, "ep", STORY_EPS, (n) => `${n}화`, `이야기 ${name} (${charId})`, errors);
  }
  // 코치 연속: 코치마다 1 · 2 · 3단계가 하나씩 (하나도 없으면 오류가 아니다)
  for (const [supportId, list] of chains) {
    const name = ix.supports.get(supportId)?.name || supportId;
    setErrors(list, "step", [1, 2, 3], (n) => `${n}단계`, `코치 연속 ${name} (${supportId})`, errors);
  }
  // lesson.json events.speech (말투 표 — §24.3.5)
  const speech = data && data.lesson && data.lesson.events && data.lesson.events.speech;
  if (speech !== undefined) {
    if (!isObj(speech)) errors.push("lesson.json events.speech: { charId: \"banmal\" | \"polite\" } 객체다");
    else {
      for (const [id, v] of Object.entries(speech)) {
        if (!ix.chars.has(id)) errors.push(`lesson.json events.speech: 없는 캐릭터 '${id}'`);
        if (v !== "banmal" && v !== "polite") errors.push(`lesson.json events.speech.${id}: banmal · polite 만 (지금 ${show(v)})`);
      }
    }
  }
  // lesson.json bond.eventSteps (코치 연속 2 · 3단계 유대 문턱 — §24.3.6, E4)
  const es = data && data.lesson && data.lesson.bond ? data.lesson.bond.eventSteps : undefined;
  if (es !== undefined && !okEventSteps(es)) errors.push(`lesson.json bond.eventSteps: [2단계, 3단계] 유대 문턱 정수 두 개, 0 < 2단계 < 3단계 ≤ 100 (지금 ${show(es)})`);
  return errors;
}

/** 시즌 3개 × 주 수 (lesson.json weeksPerSeason, 기본 5) */
function weekCount(data) {
  const wps = data && data.lesson && Number.isInteger(data.lesson.weeksPerSeason) ? data.lesson.weeksPerSeason : 5;
  return wps * SEASONS.length;
}

/** 이야기 · 코치 묶음: 있으면 1 · 2 · 3 이 하나씩 */
function setErrors(list, key, want, unit, what, errors) {
  const count = new Map();
  for (const it of list) count.set(it[key], (count.get(it[key]) || 0) + 1);
  for (const it of list) {
    if (count.get(it[key]) > 1) errors.push(`${it.label}: ${what} — ${unit(it[key])}가 둘 이상이다`);
  }
  const missing = want.filter((n) => !count.has(n));
  if (missing.length) {
    errors.push(`${list[0].label}: ${what} 묶음이 모자란다 — ${missing.map(unit).join(" · ")}가 없다 (있으면 ${want.map(unit).join(" · ")} 모두)`);
  }
}

/** 파일 notes: { [charId | supportId]: { arc, setting[] } } */
function notesErrors(notes, ix, fileErr) {
  if (!isObj(notes)) {
    fileErr("notes 는 { charId: { arc, setting } } 객체다");
    return;
  }
  for (const [id, n] of Object.entries(notes)) {
    if (!ix.chars.has(id) && !ix.supports.has(id)) fileErr(`notes '${id}': 캐릭터 · 코치 id 가 아니다`);
    if (!isObj(n)) {
      fileErr(`notes '${id}': { arc, setting } 객체다`);
      continue;
    }
    for (const k of Object.keys(n)) if (k !== "arc" && k !== "setting") fileErr(`notes '${id}': 모르는 키 '${k}' (arc · setting)`);
    if (!nonEmpty(n.arc)) fileErr(`notes '${id}': arc (이야기 줄기 한 줄) 가 비었다`);
    if (n.setting !== undefined && !(Array.isArray(n.setting) && n.setting.every(nonEmpty))) fileErr(`notes '${id}': setting 은 글 배열이다`);
  }
}

/**
 * 이벤트 하나의 검사 문맥: 주인공 · 편성 보장 선수 · 코치 · 수업 가능.
 * @returns {{ protagonist: { kind: "none"|"generic"|"fixed", charId?: string }, guaranteed: Set<string>, hasCoach: boolean, allowTeach: boolean }}
 */
export function eventCheckContext(ev) {
  const trig = ev.trigger;
  const who = isObj(ev.who) ? ev.who : null;
  let protagonist;
  if (trig === "story") protagonist = { kind: "fixed", charId: isObj(ev.story) ? ev.story.charId : undefined };
  else if (trig === "coach" || trig === "outing") protagonist = { kind: "generic" };
  else if (!who || who.pick === "none") protagonist = { kind: "none" };
  else if (who.pick === "char") protagonist = { kind: "fixed", charId: who.charId };
  else protagonist = { kind: "generic" };
  const guaranteed = new Set();
  if (trig === "story" && isObj(ev.story) && typeof ev.story.charId === "string") guaranteed.add(ev.story.charId);
  if (Array.isArray(ev.chars) && (ev.charMode === undefined || ev.charMode === "all" || ev.chars.length === 1)) {
    for (const c of ev.chars) if (typeof c === "string") guaranteed.add(c);
  }
  const condChar = trig === "surprise" && isObj(ev.cond) && isObj(ev.cond.char) ? ev.cond.char : null;
  if (condChar && typeof condChar.id === "string") guaranteed.add(condChar.id);
  const hasCoach = trig === "coach" || typeof ev.coach === "string" || (trig === "surprise" && isObj(ev.cond) && ev.cond.coachCardOkThisTurn === true);
  // 선수 전용 (이야기 · 주인공 고정 · 그 선수(들) 편성 조건 · 깜짝 선수 조건) 은 액티브 수업을 주지 않는다 (R4) — 코치 편성 조건이 있으면 준다
  const charSpecific = trig === "story" || protagonist.kind === "fixed" || guaranteed.size > 0;
  const allowTeach = trig === "coach" || typeof ev.coach === "string" || !charSpecific;
  return { protagonist, guaranteed, hasCoach, allowTeach };
}

/** 이벤트 하나 (§24.3.7 — 모양 · 글 · 선택지 · 참조) */
function eventErrors(ev, { data, ix, lastWeek, bonds = COACH_STEP_BONDS, err }) {
  if (!isObj(ev)) {
    err(`이벤트는 객체다 (지금 ${show(ev)})`);
    return;
  }
  // ---- 모양 ----
  if (typeof ev.id !== "string" || !ID_RE.test(ev.id)) err(`id 꼴이 틀렸다 — 영문 소문자로 시작, 소문자 · 숫자 · _ 만 (지금 ${show(ev.id)})`);
  const trig = ev.trigger;
  if (!TRIGGERS.includes(trig)) {
    err(`trigger ${show(trig)} — 쓸 수 있는 것: ${TRIGGERS.join(" · ")}`);
    return;
  }
  const tl = TRIGGER_LABELS[trig];
  const keys = EVENT_KEYS[trig];
  const allowed = new Set([...COMMON_KEYS, ...keys.required, ...keys.optional]);
  for (const k of Object.keys(ev)) {
    if (allowed.has(k)) continue;
    err(`${tl} 이벤트에 모르는 키 '${k}'${OLD_EVENT_KEYS[k] ? ` — ${OLD_EVENT_KEYS[k]}` : ""} (쓸 수 있는 키: ${[...keys.required, ...keys.optional].join(" · ") || "공통 키만"})`);
  }
  for (const k of keys.required) if (ev[k] === undefined) err(`${tl} 이벤트에는 '${k}' 가 꼭 있다`);
  const cx = eventCheckContext(ev);

  // ---- 트리거별 키 ----
  if (ev.who !== undefined) whoErrors(ev, ix, cx, err);
  if (ev.chars !== undefined) {
    if (!Array.isArray(ev.chars) || ev.chars.length === 0) err("chars 는 캐릭터 id 배열 (1개 이상)");
    else {
      if (new Set(ev.chars).size !== ev.chars.length) err("chars 에 같은 캐릭터가 두 번 있다");
      for (const c of ev.chars) if (!ix.chars.has(c)) err(`chars: 없는 캐릭터 ${show(c)}`);
    }
  }
  if (ev.charMode !== undefined) {
    if (ev.chars === undefined) err("charMode 는 chars 와 같이 쓴다");
    if (ev.charMode !== "all" && ev.charMode !== "any") err(`charMode ${show(ev.charMode)} — all · any 만`);
  }
  if (ev.coach !== undefined && !ix.supports.has(ev.coach)) err(`coach: 없는 코치 ${show(ev.coach)}`);
  if (ev.weeks !== undefined) {
    const w = ev.weeks;
    if (!(Array.isArray(w) && w.length === 2 && intIn(w[0], 0, lastWeek) && intIn(w[1], 0, lastWeek) && w[0] <= w[1])) {
      err(`weeks 는 [a, b] (주 번호 turnIndex 0 ~ ${lastWeek}, a ≤ b) (지금 ${show(w)})`);
    }
    if (ev.weekList !== undefined) err("weeks 와 weekList 는 하나만 쓴다");
  }
  if (ev.weekList !== undefined) {
    const w = ev.weekList;
    if (!(Array.isArray(w) && w.length > 0 && w.every((x) => intIn(x, 0, lastWeek)) && new Set(w).size === w.length)) {
      err(`weekList 는 주 번호 (0 ~ ${lastWeek}) 배열, 겹치지 않게 (지금 ${show(w)})`);
    }
  }
  if (ev.seasons !== undefined) {
    const s = ev.seasons;
    if (!(Array.isArray(s) && s.length > 0 && s.every((x) => SEASONS.includes(x)) && new Set(s).size === s.length)) {
      err(`seasons 는 시즌 (1 ~ 3) 배열, 겹치지 않게 (지금 ${show(s)})`);
    } else if ((trig === "seasonStart" || trig === "preMatch") && s.length !== 1) {
      err(`${tl} 이벤트의 seasons 는 시즌 하나 ([n]) (지금 ${show(s)})`);
    }
  }
  if (ev.once !== undefined && !(ev.once === "run" || ev.once === "season" || ev.once === false)) {
    err(`once ${show(ev.once)} — "run" (기본) · "season" · false (반복) 만`);
  }
  if (ev.weight !== undefined && !(typeof ev.weight === "number" && Number.isFinite(ev.weight) && ev.weight > 0)) {
    err(`weight 는 0 보다 큰 수 (지금 ${show(ev.weight)})`);
  }
  if (ev.weightIf !== undefined) {
    const wi = ev.weightIf;
    if (!isObj(wi)) err("weightIf 는 { cond, weight } 객체다");
    else {
      for (const k of Object.keys(wi)) if (k !== "cond" && k !== "weight") err(`weightIf 에 모르는 키 '${k}' (cond · weight)`);
      if (!(typeof wi.weight === "number" && Number.isFinite(wi.weight) && wi.weight > 0)) err(`weightIf.weight 는 0 보다 큰 수 (지금 ${show(wi.weight)})`);
      if (wi.cond === undefined) err("weightIf 에 cond 가 없다");
      else weekCondErrors(wi.cond, "weightIf.cond", err);
    }
  }
  if (ev.cond !== undefined) {
    if (trig === "surprise") surpriseCondErrors(ev, ix, err);
    else weekCondErrors(ev.cond, "cond", err);
  }
  if (ev.routeId !== undefined && !ix.routes.has(ev.routeId)) err(`routeId: 없는 루트 ${show(ev.routeId)}`);
  if (ev.story !== undefined) {
    const st = ev.story;
    if (!isObj(st)) err("story 는 { charId, ep } 객체다");
    else {
      for (const k of Object.keys(st)) if (k !== "charId" && k !== "ep") err(`story 에 모르는 키 '${k}' (charId · ep)`);
      if (!ix.chars.has(st.charId)) err(`story.charId: 없는 캐릭터 ${show(st.charId)}`);
      if (!STORY_EPS.includes(st.ep)) err(`story.ep 는 1 · 2 · 3 (지금 ${show(st.ep)})`);
    }
  }
  if (ev.chain !== undefined) {
    const ch = ev.chain;
    if (!isObj(ch)) err("chain 은 { supportId, step } 객체다");
    else {
      for (const k of Object.keys(ch)) if (k !== "supportId" && k !== "step") err(`chain 에 모르는 키 '${k}' (supportId · step)`);
      if (!ix.supports.has(ch.supportId)) err(`chain.supportId: 없는 코치 ${show(ch.supportId)}`);
      if (![1, 2, 3].includes(ch.step)) err(`chain.step 은 1 · 2 · 3 (지금 ${show(ch.step)})`);
      else if (ev.bondAtLeast !== undefined && ev.bondAtLeast !== bonds[ch.step - 1]) {
        err(`bondAtLeast 는 ${ch.step}단계면 ${bonds[ch.step - 1]} (${bonds.join(" · ")} — lesson.json bond.eventSteps) (지금 ${show(ev.bondAtLeast)})`);
      }
    }
  }
  if (ev.bondAtLeast !== undefined && !bonds.includes(ev.bondAtLeast)) err(`bondAtLeast 는 ${bonds.join(" · ")} (지금 ${show(ev.bondAtLeast)})`);
  if (ev.policy !== undefined) {
    const ids = ix.policies.size ? [...ix.policies.keys()] : POLICY_FAMILIES;
    if (!ids.includes(ev.policy)) err(`policy ${show(ev.policy)} — ${ids.join(" · ")} 중 하나`);
  }
  if (ev.scene !== undefined && !SCENE_IDS.includes(ev.scene)) err(`scene ${show(ev.scene)} — ${SCENE_IDS.join(" · ")} 중 하나 (§24.12.5)`);

  // ---- 글 ----
  if (!nonEmpty(ev.title)) err("title 이 비었다");
  if (!nonEmpty(ev.text)) err("text (본문) 가 비었다");
  const texts = []; // [where, 글]
  const addText = (where, s) => {
    if (typeof s === "string") texts.push([where, s]);
  };
  addText("title", ev.title);
  addText("text", ev.text);

  // ---- 선택지 ----
  const choices = Array.isArray(ev.choices) ? ev.choices : null;
  if (!choices) err("choices 는 배열이다 (선택지 2개)");
  else if (choices.length !== 2) err(`선택지는 정확히 2개 (지금 ${choices.length}개)`);
  const ectx = { trigger: trig, data, index: ix, ...cx };
  (choices || []).forEach((c, ci) => {
    const at = `choices[${ci}]`;
    if (!isObj(c)) {
      err(`${at}: 선택지는 { label, effects, result } 객체다`);
      return;
    }
    for (const k of Object.keys(c)) {
      if (k === "label" || k === "effects" || k === "result") continue;
      err(`${at}: 모르는 키 '${k}'${OLD_CHOICE_KEYS[k] ? ` — ${OLD_CHOICE_KEYS[k]}` : ""} (label · effects · result)`);
    }
    if (!nonEmpty(c.label)) err(`${at}.label (감독의 결정) 이 비었다`);
    addText(`${at}.label`, c.label);
    let randoms = 0;
    if (!Array.isArray(c.effects)) err(`${at}.effects 는 효과 배열이다`);
    else {
      c.effects.forEach((e, ei) => {
        for (const m of effectErrors(e, `${at}.effects[${ei}]`, ectx)) err(m);
        if (isObj(e) && e.type === "random") randoms++;
      });
      if (randoms > 1) err(`${at}: random 은 선택지 맨 위에 하나까지 (지금 ${randoms}개)`);
      // 한 갈래에 relic 과 rewardOffer 를 같이 쓰지 않는다 (둘 다 고르는 단계)
      const top = c.effects.filter((e) => isObj(e) && e.type !== "random").map((e) => e.type);
      const rnd = c.effects.find((e) => isObj(e) && e.type === "random");
      const paths = rnd ? ["then", "else"].map((s) => [...top, ...(Array.isArray(rnd[s]) ? rnd[s].filter(isObj).map((e) => e.type) : [])]) : [top];
      if (paths.some((p) => p.includes("relic") && p.includes("rewardOffer"))) err(`${at}: 한 선택지 (갈래) 에 relic 과 rewardOffer 를 같이 쓰지 않는다`);
      // 고르는 카드 (uid) 는 한 번에 하나 — 갈래 둘을 합쳐 cardPick 하나까지 (E2 · §24.5.3)
      const picks = [...top, ...(rnd ? ["then", "else"].flatMap((s) => (Array.isArray(rnd[s]) ? rnd[s].filter(isObj).map((e) => e.type) : [])) : [])].filter((t) => t === "cardPick").length;
      if (picks > 1) err(`${at}: cardPick 은 한 선택지에 하나까지 (갈래를 합쳐서 — 고르는 카드는 한 장, 지금 ${picks}개)`);
    }
    const r = c.result;
    if (isBranch(r)) {
      for (const k of Object.keys(r)) if (k !== "then" && k !== "else") err(`${at}.result 에 모르는 키 '${k}' (then · else)`);
      if (!nonEmpty(r.then) || !nonEmpty(r.else)) err(`${at}.result 의 then · else 문구가 비었다`);
      addText(`${at}.result.then`, r.then);
      addText(`${at}.result.else`, r.else);
      if (Array.isArray(c.effects) && randoms === 0) err(`${at}.result 가 갈래 ({ then, else }) 인데 선택지 맨 위에 random 이 없다`);
    } else {
      if (!nonEmpty(r)) err(`${at}.result (결과 문구) 가 비었다${isObj(r) ? " — 갈래면 { then, else }" : ""}`);
      addText(`${at}.result`, r);
      if (randoms === 1 && nonEmpty(r)) err(`${at}: random 이 있으면 result 는 갈래마다 { then, else } 로 쓴다`);
    }
  });

  // ---- 반말판 (§24.3.5) ----
  if (ev.alt !== undefined) {
    const alt = ev.alt;
    if (!isObj(alt)) err("alt 는 { banmal: { text, results } } 객체다");
    else {
      for (const k of Object.keys(alt)) if (k !== "banmal") err(`alt 에 모르는 키 '${k}' (banmal 만)`);
      const b = alt.banmal;
      if (b !== undefined) {
        if (cx.protagonist.kind === "none") err("alt.banmal: 주인공이 없는 이벤트에는 반말판을 쓰지 않는다 (who.pick)");
        if (!isObj(b)) err("alt.banmal 은 { text, results } 객체다");
        else {
          for (const k of Object.keys(b)) if (k !== "text" && k !== "results") err(`alt.banmal 에 모르는 키 '${k}' (text · results)`);
          if (!nonEmpty(b.text)) err("alt.banmal.text 가 비었다");
          addText("alt.banmal.text", b.text);
          if (!Array.isArray(b.results)) err("alt.banmal.results 는 선택지마다 결과 문구 배열이다");
          else {
            if (choices && b.results.length !== choices.length) err(`alt.banmal.results 길이 ${b.results.length} ≠ 선택지 수 ${choices.length}`);
            b.results.forEach((r, i) => {
              const at = `alt.banmal.results[${i}]`;
              const base = choices && isObj(choices[i]) ? choices[i].result : undefined;
              if (isBranch(r)) {
                if (!nonEmpty(r.then) || !nonEmpty(r.else)) err(`${at} 의 then · else 문구가 비었다`);
                if (base !== undefined && !isBranch(base)) err(`${at}: 기본 result 는 문자열인데 반말판은 갈래다`);
                addText(`${at}.then`, r.then);
                addText(`${at}.else`, r.else);
              } else {
                if (!nonEmpty(r)) err(`${at} 가 비었다`);
                if (isBranch(base)) err(`${at}: 기본 result 가 갈래 ({ then, else }) 면 반말판도 갈래다`);
                addText(at, r);
              }
            });
          }
        }
      }
    }
  }

  // ---- 자리표시 · 조사 (§24.3.5) ----
  const used = new Set();
  for (const [where, s] of texts) {
    const { tokens, errors } = scanText(s);
    for (const m of errors) err(`${where}: ${m}`);
    for (const m of bareJosaErrors(s)) err(`${where}: ${m}`);
    for (const t of tokens) used.add(t.name);
  }
  if (used.has("선수") && cx.protagonist.kind === "none") err("{선수} 를 쓰는데 주인공이 없다 — who.pick 을 적는다 (none 이면 {선수} 를 쓰지 않는다)");
  if (used.has("코치") && !cx.hasCoach) err("{코치} 는 코치 연속 이벤트 · coach 키 (코치 편성 조건) · 깜짝 coachCardOkThisTurn 조건일 때만 쓴다");
}

/** who (§24.3.4) */
function whoErrors(ev, ix, cx, err) {
  const who = ev.who;
  const trig = ev.trigger;
  if (!isObj(who)) {
    err("who 는 { pick, … } 객체다");
    return;
  }
  for (const k of Object.keys(who)) if (!["pick", "pos", "zone", "charId"].includes(k)) err(`who 에 모르는 키 '${k}' (pick · pos · zone · charId)`);
  if (!WHO_PICKS.includes(who.pick)) {
    err(`who.pick ${show(who.pick)} — 쓸 수 있는 것: ${WHO_PICKS.join(" · ")}`);
    return;
  }
  const ok = WHO_PICKS_BY_TRIGGER[trig];
  if (!ok.includes(who.pick)) err(`who.pick '${who.pick}' 는 ${TRIGGER_LABELS[trig]} 이벤트에서 쓸 수 없다 (쓸 수 있는 것: ${ok.join(" · ")})`);
  if (who.pos !== undefined) {
    if (!NARROWABLE_PICKS.includes(who.pick)) err(`who.pos 는 ${NARROWABLE_PICKS.join(" · ")} 와만 쓴다`);
    if (!(Array.isArray(who.pos) && who.pos.length > 0 && who.pos.every((p) => POSITIONS.includes(p)) && new Set(who.pos).size === who.pos.length)) {
      err(`who.pos 는 포지션 배열 (${POSITIONS.join(" · ")}) (지금 ${show(who.pos)})`);
    }
  }
  if (who.zone !== undefined) {
    if (trig !== "surprise") err("who.zone 은 레슨 안 (깜짝) 이벤트에서만 쓴다");
    if (!NARROWABLE_PICKS.includes(who.pick)) err(`who.zone 은 ${NARROWABLE_PICKS.join(" · ")} 와만 쓴다`);
    if (!ZONE_IDS.includes(who.zone)) err(`who.zone ${show(who.zone)} — ${ZONE_IDS.join(" · ")} 중 하나`);
  }
  if (who.pick === "char") {
    if (who.charId === undefined) err("who.pick 'char' 에는 who.charId 가 있다");
    else if (!ix.chars.has(who.charId)) err(`who.charId: 없는 캐릭터 ${show(who.charId)}`);
    else if (!cx.guaranteed.has(who.charId)) err(`who.charId '${who.charId}' 는 편성 조건에도 적는다 — chars (all) 또는 깜짝 cond.char.id`);
  } else if (who.charId !== undefined) err("who.charId 는 pick 'char' 와만 쓴다");
}

/** 주 끝 · weightIf 조건 (§24.3.3) */
const COND_RULES = {
  anyStaminaBelow: (v) => intIn(v, 1, 100) || "1 ~ 100 정수",
  avgStaminaBelow: (v) => intIn(v, 1, 100) || "1 ~ 100 정수",
  anyInjured: (v) => v === true || "true 만",
  teamworkBelow: (v) => intIn(v, 1, 100) || "1 ~ 100 정수",
  conditionBelow: (v) => intIn(v, 1, 4) || "1 ~ 4 정수",
  conditionAtLeast: (v) => intIn(v, 0, 4) || "0 ~ 4 정수",
};

function weekCondErrors(cond, where, err) {
  if (!isObj(cond)) {
    err(`${where} 는 { 키: 값 } 객체다`);
    return;
  }
  if (Object.keys(cond).length === 0) err(`${where} 가 비었다 (조건이 없으면 빼면 된다)`);
  for (const [k, v] of Object.entries(cond)) {
    if (!COND_KEYS.includes(k)) {
      err(`${where} 에 모르는 키 '${k}'${SURPRISE_COND_KEYS.includes(k) ? " — 레슨 깜짝 전용 조건" : ""} (쓸 수 있는 키: ${COND_KEYS.join(" · ")})`);
      continue;
    }
    const r = COND_RULES[k](v);
    if (r !== true) err(`${where}.${k} 는 ${r} (지금 ${show(v)})`);
  }
}

/** 깜짝 조건 (§24.8) */
function surpriseCondErrors(ev, ix, err) {
  const cond = ev.cond;
  if (!isObj(cond)) {
    err("cond 는 { 키: 값 } 객체다");
    return;
  }
  if (Object.keys(cond).length === 0) err("깜짝 이벤트의 cond 가 비었다 — 무작위 이벤트면 { randomTurn: true }");
  const flag = (v) => v === true || "true 만";
  const zone = (v) => ZONE_IDS.includes(v) || `${ZONE_IDS.join(" · ")} 중 하나`;
  const rules = {
    randomTurn: flag,
    turnMin: (v) => intIn(v, 1, 8) || "1 ~ 8 정수",
    turnsLeftMax: (v) => intIn(v, 0, 8) || "0 ~ 8 정수",
    halfway: flag,
    special: flag,
    zoneIn: (v) => (Array.isArray(v) && v.length > 0 && v.every((z) => ZONE_IDS.includes(z)) && new Set(v).size === v.length) || `구역 배열 (${ZONE_IDS.join(" · ")})`,
    buffAtLeast: (v) => buffRule(v, ev, ix),
    buffEquals: (v) => buffRule(v, ev, ix),
    scoreToTargetMax: (v) => intIn(v, 0, 2000) || "0 이상 정수",
    scoreBelowTargetFrac: (v) => (typeof v === "number" && v > 0 && v <= 1) || "0 보다 크고 1 이하 (목표치의 몫)",
    capLeftMax: (v) => intIn(v, 0, 2000) || "0 이상 정수",
    notCleared: flag,
    notPerfect: flag,
    anyStaminaBelow: (v) => intIn(v, 1, 100) || "1 ~ 100 정수",
    failedThisTurn: flag,
    coachCardOkThisTurn: flag,
    multiOkThisTurn: (v) => intIn(v, 2, 7) || "2 ~ 7 정수 (원 카드 대상 수)",
    reshuffledThisTurn: flag,
    benchedThisTurn: flag,
    targetStreak: (v) => intIn(v, 2, 8) || "2 ~ 8 정수",
    char: (v) => charCondRule(v, ix),
    zoneEmptyAtTurnStart: zone,
  };
  for (const [k, v] of Object.entries(cond)) {
    if (!SURPRISE_COND_KEYS.includes(k)) {
      err(`cond 에 모르는 키 '${k}' — 깜짝 조건은 §24.8 표의 키만 (${SURPRISE_COND_KEYS.join(" · ")})`);
      continue;
    }
    const r = rules[k](v);
    if (r === true) continue;
    for (const m of Array.isArray(r) ? r : [r]) err(`cond.${k}: ${m} (지금 ${show(v)})`);
  }
}

function buffRule(v, ev, ix) {
  if (!isObj(v) || Object.keys(v).some((k) => k !== "key" && k !== "n")) return "{ key, n } 객체";
  if (!intIn(v.n, 0, 10)) return "n 은 0 ~ 10 정수";
  if (ev.policy === undefined) return "방침 버프 조건은 이벤트 맨 위 policy 와 같이 쓴다";
  const pol = ix.policies.get(ev.policy);
  const buffs = pol && Array.isArray(pol.buffs) ? pol.buffs : null;
  if (buffs && !buffs.includes(v.key)) return `key 는 ${ev.policy} 방침의 버프 (${buffs.join(" · ")})`;
  return true;
}

function charCondRule(v, ix) {
  if (!isObj(v)) return `{ ${SURPRISE_CHAR_KEYS.join(", ")} } 객체`;
  const out = [];
  for (const k of Object.keys(v)) if (!SURPRISE_CHAR_KEYS.includes(k)) out.push(`모르는 키 '${k}' (${SURPRISE_CHAR_KEYS.join(" · ")})`);
  if (v.id === undefined) out.push("id (그 선수) 가 없다");
  else if (!ix.chars.has(v.id)) out.push(`없는 캐릭터 ${show(v.id)}`);
  const ints = { staminaMin: [0, 100], staminaMax: [0, 100], targetedMin: [0, 20], targetedMax: [0, 20], untargetedTurnsMin: [1, 8], zoneCountMin: [1, 7] };
  for (const [k, [lo, hi]] of Object.entries(ints)) if (v[k] !== undefined && !intIn(v[k], lo, hi)) out.push(`${k} 는 ${lo} ~ ${hi} 정수`);
  if (v.zone !== undefined && !ZONE_IDS.includes(v.zone)) out.push(`zone 은 ${ZONE_IDS.join(" · ")} 중 하나`);
  for (const k of ["aloneInZone", "movedThisTurn", "targetedThisTurn", "ownCardThisTurn"]) if (v[k] !== undefined && v[k] !== true) out.push(`${k} 는 true 만`);
  return out.length ? out : true;
}

// ---------------------------------------------------------------------------
// E2 — 주인공 · 띄우기 · 뷰 · 고르기 (§24.3.4 · §24.5.2 · §24.11)
// ---------------------------------------------------------------------------

/** 깜짝 전용 주인공 고르기 (E5 — 레슨 안 턴 기록이 필요하다) */
const SURPRISE_PICKS = ["turnFailer", "streaker", "coachCardTarget", "multiTarget", "mostTargeted"];

/** 이벤트 종류 배지 (§24.13) */
export const KIND_BADGES = Object.freeze({
  week: "주 끝", seasonStart: "시즌 시작", preMatch: "경계전 전야", route: "루트", outing: "외출", story: "이야기", coach: "코치", surprise: "레슨 깜짝",
});

const isInjured = (p) => (Number(p && p.injuredTurns) || 0) > 0;
const playerOf = (state, id) => (id ? (state.players || []).find((p) => p.id === id) || null : null);
const supportOf = (data, id) => (id ? (data.supports || []).find((s) => s && s.id === id) || null : null);

/** 그 이벤트의 기본 who.pick (who 가 없을 때 — 외출 · 이야기 = 외출 상대, 코치 = coachTarget, 그 밖 = 없음) */
function defaultPick(ev) {
  if (ev.trigger === "outing" || ev.trigger === "story") return "partner";
  if (ev.trigger === "coach") return "coachTarget";
  return "none";
}

/**
 * 주인공 ({선수}) 을 고른다 (§24.3.4). 결장 선수는 빼고 (외출 상대만 예외), 무작위 · 같은 값 깨기에만 rng 를 쓴다.
 *   none → null · random → 결장 아닌 선수 중 (pos = 배치 포지션으로 좁힌다, 좁혀서 없으면 결장 아닌 선수 전원) ·
 *   char → who.charId 선수 (편성 안 됐으면 random) · lowestStamina / highestStamina → 체력 최저 / 최고 (같으면 무작위, pos 가능) ·
 *   partner → ctx.partnerId (결장이어도) · 이야기 → 그 캐릭터 선수 ·
 *   coachTarget (E4) → 이번 런 그 코치 카드 대상 최다 → 같으면 코치 종목이 주 스탯인 선수 → 그래도 같으면 무작위 (결장 제외,
 *   coachTargetCandidates — 코치 = ctx.supportId · chain.supportId · coach).
 *   ctx.playerId 가 있으면 그 선수 (도구 · 테스트용 — 주입).
 * 깜짝 전용 (turnFailer …) 은 E5.
 * @param {object} state
 * @param {object} data
 * @param {object} ev
 * @param {{ playerId?: string, partnerId?: string }} [ctx]
 * @param {object} rng  createRngFromState 로 연 rng (저장은 부르는 쪽)
 * @returns {string|null} 선수 id
 */
export function pickProtagonist(state, data, ev, ctx = {}, rng) {
  const c = ctx || {};
  if (c.playerId) {
    if (!playerOf(state, c.playerId)) throw new Error(`주인공 '${c.playerId}' 이(가) 편성에 없습니다`);
    return c.playerId;
  }
  if (ev.trigger === "story" && isObj(ev.story)) {
    const p = state.players.find((x) => x.charId === ev.story.charId);
    if (p) return p.id;
    if (playerOf(state, c.partnerId)) return c.partnerId;
    throw new Error(`이야기 ${ev.id}: ${ev.story.charId} 이(가) 편성에 없습니다`);
  }
  const who = isObj(ev.who) ? ev.who : {};
  let pick = who.pick || defaultPick(ev);
  if (SURPRISE_PICKS.includes(pick)) throw new Error(`주인공 '${pick}' 은(는) 레슨 깜짝 (E5) 에서 정한다`);
  switch (pick) {
    case "none":
      return null;
    case "partner": {
      const p = playerOf(state, c.partnerId);
      if (!p) throw new Error(`${ev.id}: 외출 상대 (ctx.partnerId) 가 없습니다`);
      return p.id;
    }
    case "char": {
      const p = state.players.find((x) => x.charId === who.charId);
      if (p) return p.id;
      pick = "random";
      break;
    }
    case "coachTarget": {
      // E4 (§24.3.4): 대상 최다 → 코치 종목 주 스탯 → 무작위 (rng 는 마지막 무작위에만)
      const sid = c.supportId || (isObj(ev.chain) ? ev.chain.supportId : null) || (typeof ev.coach === "string" ? ev.coach : null);
      const tied = coachTargetCandidates(state, data, sid);
      if (!tied.length) return null;
      return tied.length === 1 ? tied[0] : rng.pick(tied);
    }
    default:
      break;
  }
  const healthy = state.players.filter((p) => !isInjured(p));
  const base = healthy.length ? healthy : state.players.slice();
  const narrowed = Array.isArray(who.pos) && who.pos.length ? base.filter((p) => who.pos.includes(p.position)) : base;
  const pool = narrowed.length ? narrowed : base;
  if (!pool.length) return null;
  if (pick === "lowestStamina" || pick === "highestStamina") {
    const sign = pick === "lowestStamina" ? 1 : -1;
    const best = Math.min(...pool.map((p) => sign * (Number(p.stamina) || 0)));
    const tied = pool.filter((p) => sign * (Number(p.stamina) || 0) === best);
    return tied.length === 1 ? tied[0].id : rng.pick(tied).id;
  }
  return rng.pick(pool).id;
}

/** 뷰 · 효과용 선수 모양 */
function playerBrief(p) {
  if (!p) return null;
  return {
    id: p.id, charId: p.charId, name: p.name, portraitColor: p.portraitColor || "#888888", slot: p.slot, position: p.position,
    stamina: p.stamina, injured: isInjured(p),
  };
}

/** currentEvent 에 남길 ctx (JSON 값만) */
function plainCtx(ctx) {
  const out = {};
  for (const [k, v] of Object.entries(ctx || {})) {
    if (v === null || ["string", "number", "boolean"].includes(typeof v)) out[k] = v;
  }
  return out;
}

/**
 * 이벤트를 띄운다 (§24.5.1): 주인공 · 코치 · 등장 선수 → state.currentEvent, 사용 기록 (usedEventIds · 시즌 1회면 usedEventSeasons ·
 * 일반 외출이면 outingSeen 주머니 — 다 봤으면 비우고 다시), eventSeq + 1, phase "event". rng = 주인공 고르기에만 (한 번 열고 저장).
 * @param {object} state
 * @param {object} data
 * @param {object} ev  레슨 이벤트 (data/lesson_ev_*.json 안에 있어야 한다)
 * @param {{ kind?: string, partnerId?: string, playerId?: string, supportId?: string, routeId?: string, free?: boolean }} [ctx]
 * @returns {object} state
 */
export function fireEvent(state, data, ev, ctx = {}) {
  if (!state || typeof state !== "object") throw new Error("state 가 없습니다");
  if (!isObj(ev) || typeof ev.id !== "string") throw new Error("이벤트가 없습니다");
  if (!eventById(data, ev.id)) throw new Error(`레슨 이벤트 '${ev.id}' 이(가) 데이터에 없습니다`);
  if (ev.trigger === "surprise") throw new Error("깜짝 이벤트는 레슨 안에서 띄운다 (E5)");
  if (state.currentEvent) throw new Error(`이미 떠 있는 이벤트가 있습니다 (${state.currentEvent.eventId})`);
  const c = ctx || {};
  const rng = createRngFromState(state.rngState);
  const playerId = pickProtagonist(state, data, ev, c, rng);
  state.rngState = rng.getState();
  const supportId = c.supportId || (ev.trigger === "coach" && isObj(ev.chain) ? ev.chain.supportId : null) || (typeof ev.coach === "string" ? ev.coach : null) || null;
  let charIds = [];
  if (ev.trigger === "story" && isObj(ev.story)) charIds = [ev.story.charId];
  else if (Array.isArray(ev.chars)) charIds = ev.chars.filter((id) => state.players.some((p) => p.charId === id));
  state.currentEvent = { eventId: ev.id, playerId, supportId, charIds, kind: c.kind || ev.trigger, ctx: plainCtx(c) };
  if (!Array.isArray(state.usedEventIds)) state.usedEventIds = [];
  if (!state.usedEventIds.includes(ev.id)) state.usedEventIds.push(ev.id);
  if (ev.once === "season") {
    if (!isObj(state.usedEventSeasons)) state.usedEventSeasons = {};
    const list = Array.isArray(state.usedEventSeasons[ev.id]) ? state.usedEventSeasons[ev.id] : [];
    if (!list.includes(state.season)) state.usedEventSeasons[ev.id] = [...list, state.season];
  }
  // 일반 외출 주머니 (E3 · §24.7): 데이터의 외출 이벤트를 모두 봤으면 비우고 다시 쌓는다
  if (ev.trigger === "outing") {
    const ids = allEvents(data).filter((e) => isObj(e) && e.trigger === "outing").map((e) => e.id);
    let seen = Array.isArray(state.outingSeen) ? state.outingSeen.slice() : [];
    if (ids.length && ids.every((id) => seen.includes(id))) seen = [];
    if (!seen.includes(ev.id)) seen.push(ev.id);
    state.outingSeen = seen;
  }
  state.eventSeq = (Number(state.eventSeq) || 0) + 1;
  state.phase = "event";
  return state;
}

/** 효과 ctx (lessonEffects) */
function effectCtx(ev, cur) {
  return {
    eventId: ev.id,
    trigger: ev.trigger,
    playerId: cur.playerId || null,
    supportId: cur.supportId || null,
    charIds: Array.isArray(cur.charIds) ? cur.charIds.slice() : [],
    policy: typeof ev.policy === "string" ? ev.policy : undefined,
  };
}

/** 글 자리표시 값 */
function textVars(state, data, cur) {
  const p = playerOf(state, cur.playerId);
  const sc = supportOf(data, cur.supportId);
  return { player: p ? p.name : undefined, coach: sc ? sc.name : undefined, season: state.season };
}

/** 종류 배지 (§24.13): "주 끝" · "이야기 2/3화" · "코치 · 첫 만남 / 유대 40 / 유대 80" … */
function badgeOf(ev, kind) {
  if (ev.trigger === "story" && isObj(ev.story)) return `이야기 ${ev.story.ep}/${STORY_EPS.length}화`;
  if (ev.trigger === "coach" && isObj(ev.chain)) return ev.chain.step === 1 ? "코치 · 첫 만남" : `코치 · 유대 ${ev.bondAtLeast}`;
  return KIND_BADGES[kind] || KIND_BADGES[ev.trigger] || "이벤트";
}

function currentOrThrow(state, data) {
  if (!state || state.phase !== "event") throw new Error(`phase 'event' 에서만 가능합니다 (현재 '${state && state.phase}')`);
  const cur = state.currentEvent;
  if (!cur) throw new Error("currentEvent 가 없습니다");
  const ev = eventById(data, cur.eventId);
  if (!ev) throw new Error(`레슨 이벤트 '${cur.eventId}' 을(를) 찾을 수 없습니다`);
  return { cur, ev };
}

/**
 * 이벤트 모달 뷰 (§24.5.2). 순수 — rng · 상태 변경 없음.
 * 지금 screens/event.js 가 읽는 모양 (title · text · player · support · choices[{ text, preview }]) 에
 * kind · badge · scene · art { charIds, supportId } · players (짝) · choices[].lines · .needs · .recommended 를 더했다.
 * 글은 lessonText 로 채운다 (조사 · 반말판).
 */
export function getEventView(state, data) {
  const { cur, ev } = currentOrThrow(state, data);
  const player = playerOf(state, cur.playerId);
  const sc = supportOf(data, cur.supportId);
  const supState = sc ? (state.supports || []).find((s) => s.id === sc.id) || null : null;
  const vars = textVars(state, data, cur);
  const fill = (s) => fillText(s, vars);
  const texts = pickText(ev, player ? player.charId : null, data);
  const ctx = effectCtx(ev, cur);
  const charIds = Array.isArray(cur.charIds) && cur.charIds.length ? cur.charIds.slice() : player ? [player.charId] : [];
  const pairPlayers = Array.isArray(cur.charIds) && cur.charIds.length >= 2
    ? cur.charIds.map((id) => state.players.find((p) => p.charId === id)).filter(Boolean)
    : player ? [player] : [];
  const view = {
    eventId: ev.id,
    trigger: ev.trigger,
    kind: cur.kind || ev.trigger,
    badge: badgeOf(ev, cur.kind || ev.trigger),
    scene: sceneOf(ev),
    title: fill(ev.title),
    text: fill(texts.text),
    art: { charIds, supportId: cur.supportId || null },
    player: playerBrief(player),
    players: pairPlayers.map(playerBrief),
    support: sc ? { id: sc.id, name: sc.name, portraitColor: sc.portraitColor || "#888888", type: sc.type, bond: supState ? supState.bond : null } : null,
    choices: [],
  };
  view.choices = ev.choices.map((c) => {
    const d = describe(state, data, c.effects, ctx);
    const label = fill(c.label);
    return { text: label, label, preview: d.text, lines: d.lines, needs: effectNeeds(state, data, c.effects), recommended: false };
  });
  const scores = view.choices.map((_, i) => choiceScore(state, data, view, i));
  let best = 0;
  scores.forEach((s, i) => {
    if (s > scores[best]) best = i;
  });
  if (view.choices[best]) view.choices[best].recommended = true;
  return view;
}

/**
 * 선택지 i 의 기대값 (감독 AI · 추천 배지 — §24.11 [가정]). 순수.
 * view = getEventView 결과 (eventId · player · support) — E5 의 깜짝 뷰 ({ id, playerId }) 도 받는다.
 * @returns {number}
 */
export function choiceScore(state, data, view, i) {
  const ev = eventById(data, view && (view.eventId || view.id));
  if (!ev) throw new Error(`레슨 이벤트 '${view && (view.eventId || view.id)}' 을(를) 찾을 수 없습니다`);
  const c = ev.choices[i];
  if (!c) throw new Error(`선택지 번호가 잘못되었습니다: ${i}`);
  const ctx = {
    eventId: ev.id,
    trigger: ev.trigger,
    playerId: (view.player && view.player.id) || view.playerId || null,
    supportId: (view.support && view.support.id) || view.supportId || null,
    charIds: (view.art && view.art.charIds) || [],
    policy: typeof ev.policy === "string" ? ev.policy : undefined,
  };
  return scoreEffects(state, data, c.effects, ctx);
}

/**
 * 고른 뒤 기록 (E4 — 띄울 때가 아니라 **고른 순간**에 본 것으로 센다, §24.7). rng 없음 · 같은 이벤트를 두 번 세지 않는다.
 *   이야기 → state.storySeen (id) · state.storyEps[charId] = 이번 런에 본 가장 큰 화 (accountMerge 가 data 없이 합치게).
 *   코치 연속 → state.coachSteps[supportId] (이번 런에 본 단계, 오름차순) — 1단계 = 계정 첫 만남 (accountMerge 의 coachMet).
 * @param {object} state
 * @param {object} _data
 * @param {object} ev
 * @param {{ choice: number, branch: string|null, kind: string, playerId: string|null, supportId: string|null, ctx: object }} _info
 */
function onEventResolved(state, _data, ev, _info) {
  if (ev.trigger === "story" && isObj(ev.story)) {
    if (!Array.isArray(state.storySeen)) state.storySeen = [];
    if (!state.storySeen.includes(ev.id)) state.storySeen.push(ev.id);
    if (!isObj(state.storyEps)) state.storyEps = {};
    const c = ev.story.charId;
    state.storyEps[c] = Math.max(Number(state.storyEps[c]) || 0, ev.story.ep);
  }
  if (ev.trigger === "coach" && isObj(ev.chain)) {
    if (!isObj(state.coachSteps)) state.coachSteps = {};
    const sid = ev.chain.supportId;
    const list = Array.isArray(state.coachSteps[sid]) ? state.coachSteps[sid] : [];
    if (!list.includes(ev.chain.step)) state.coachSteps[sid] = [...list, ev.chain.step].sort((a, b) => a - b);
  }
}

/**
 * 이벤트 선택지를 고른다 (§24.5.2). 검사를 먼저 끝내고 (선택지 번호 · 고르는 카드 uid · 글) 그 뒤에 바꾼다.
 * rng 를 한 번 열어 효과를 적용하고 저장 → state.lastEvent { seq, eventId, title, kind, choice, label, branch, result, lines } →
 * 로그 → currentEvent 비움 → 기록 갈고리 → phase "flow". 흐름 잇기는 부르는 쪽 (lessonRun.resolveEvent → continueFlow).
 * @param {object} state
 * @param {object} data
 * @param {number} choiceIndex
 * @param {{ uid?: string }} [opts]  고르는 선택지 (cardPick) 면 덱 카드 uid 가 꼭 있어야 한다
 * @returns {object} state
 */
export function resolveEvent(state, data, choiceIndex, { uid } = {}) {
  const { cur, ev } = currentOrThrow(state, data);
  const idx = Number(choiceIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ev.choices.length) {
    throw new Error(`선택지 번호가 잘못되었습니다: ${choiceIndex} (0~${ev.choices.length - 1})`);
  }
  const choice = ev.choices[idx];
  const player = playerOf(state, cur.playerId);
  const vars = textVars(state, data, cur);
  const fill = (s) => fillText(s, vars);
  // 글을 먼저 채운다 (바꾸기 전에 실패하게)
  const title = fill(ev.title);
  const label = fill(choice.label);
  const raw = pickText(ev, player ? player.charId : null, data).results[idx];
  const results = isBranch(raw) ? { then: fill(raw.then), else: fill(raw.else) } : { then: fill(raw), else: fill(raw) };
  // 적용 (applyEffects 가 uid · 레슨 안 효과 · 주인공을 바꾸기 전에 검사한다)
  const ctx = { ...effectCtx(ev, cur), uid: uid === undefined || uid === null ? undefined : String(uid) };
  const rng = createRngFromState(state.rngState);
  const out = applyEffects(state, data, choice.effects, ctx, rng);
  state.rngState = rng.getState();
  const result = out.branch === "else" ? results.else : results.then;
  state.lastEvent = {
    seq: Number(state.eventSeq) || 0,
    eventId: ev.id,
    title,
    kind: cur.kind || ev.trigger,
    choice: idx,
    label,
    branch: out.branch,
    result,
    lines: out.lines.slice(),
    playerId: cur.playerId || null,
    supportId: cur.supportId || null,
  };
  logLine(state, `[${title}] ${label} → ${out.lines.length ? out.lines.join(", ") : "효과 없음"}`);
  state.currentEvent = null;
  onEventResolved(state, data, ev, { choice: idx, branch: out.branch, kind: cur.kind || ev.trigger, playerId: cur.playerId || null, supportId: cur.supportId || null, ctx: cur.ctx || {} });
  state.phase = "flow";
  return state;
}

// ---------------------------------------------------------------------------
// E3 — 흐름 자격 · 고르기 (§24.2 · §24.3.2 ~ §24.3.4 · §24.7)
// ---------------------------------------------------------------------------

/** eligible 이 고르는 트리거 — 이야기 · 코치는 순서가 정해져 있어 따로 (storyNext · coachReady, E4), 깜짝은 E5 (레슨 안) */
const FLOW_TRIGGERS = ["week", "seasonStart", "preMatch", "route", "outing"];

/**
 * lesson.json events 의 기능 스위치가 켜져 있는가 (§24.3.6). 블록 · 키가 없으면 꺼짐.
 * @param {object} data
 * @param {"week"|"seasonStart"|"preMatch"|"route"|"outing"|"coach"|"surprise"} name  coach · surprise 는 .enabled
 * @returns {boolean}
 */
export function switchOn(data, name) {
  const ev = data && data.lesson && data.lesson.events;
  if (!isObj(ev)) return false;
  if (name === "coach" || name === "surprise") return isObj(ev[name]) && ev[name].enabled === true;
  return ev[name] === true;
}

/**
 * 주 끝 조건 (§24.3.3 — week 의 cond · weightIf.cond, 모두 AND). 순수.
 *   anyStaminaBelow = 결장 아닌 선수 중 체력 n 미만이 있다 · avgStaminaBelow = 7명 (결장 포함) 평균 체력 n 미만 ·
 *   anyInjured = 결장 중인 선수가 있다 · teamworkBelow · conditionBelow (미만) · conditionAtLeast (이상).
 * @param {object} state
 * @param {object|undefined} cond  없으면 참
 * @returns {boolean}
 */
export function weekCondOk(state, cond) {
  if (cond === undefined || cond === null) return true;
  if (!isObj(cond)) throw new Error(`주 끝 조건은 { 키: 값 } 객체입니다 (받은 값: ${show(cond)})`);
  const ps = Array.isArray(state.players) ? state.players : [];
  const st = (p) => Number(p.stamina) || 0;
  for (const [k, v] of Object.entries(cond)) {
    let ok;
    switch (k) {
      case "anyStaminaBelow":
        ok = ps.some((p) => !isInjured(p) && st(p) < v);
        break;
      case "avgStaminaBelow":
        ok = ps.length > 0 && ps.reduce((a, p) => a + st(p), 0) / ps.length < v;
        break;
      case "anyInjured":
        ok = ps.some(isInjured) === (v === true);
        break;
      case "teamworkBelow":
        ok = (Number(state.teamwork) || 0) < v;
        break;
      case "conditionBelow":
        ok = (Number(state.condition) || 0) < v;
        break;
      case "conditionAtLeast":
        ok = (Number(state.condition) || 0) >= v;
        break;
      default:
        throw new Error(`주 끝 조건: 모르는 키 '${k}' (쓸 수 있는 키: ${COND_KEYS.join(" · ")})`);
    }
    if (!ok) return false;
  }
  return true;
}

/**
 * 고를 때의 가중치: weightIf 조건이 참이면 weightIf.weight, 아니면 weight (없으면 1). 순수.
 * @returns {number}
 */
export function eventWeight(state, ev) {
  if (isObj(ev.weightIf) && weekCondOk(state, ev.weightIf.cond)) return ev.weightIf.weight;
  return typeof ev.weight === "number" ? ev.weight : 1;
}

/** 그 캐릭터 선수가 편성돼 있고 결장이 아니다 */
const charReady = (state, charId) => (state.players || []).some((p) => p.charId === charId && !isInjured(p));

/** 주 끝 랜덤 한 개의 자격 (주 번호 · 시즌은 부르는 쪽) */
function weekEventOk(state, ev) {
  const ti = Number(state.turnIndex) || 0;
  if (Array.isArray(ev.weeks) && !(ti >= ev.weeks[0] && ti <= ev.weeks[1])) return false;
  if (Array.isArray(ev.weekList) && !ev.weekList.includes(ti)) return false;
  const once = ev.once === undefined ? "run" : ev.once;
  if (once === "run" && Array.isArray(state.usedEventIds) && state.usedEventIds.includes(ev.id)) return false;
  if (once === "season") {
    const list = isObj(state.usedEventSeasons) && Array.isArray(state.usedEventSeasons[ev.id]) ? state.usedEventSeasons[ev.id] : [];
    if (list.includes(state.season)) return false;
  }
  if (once === false && state.lastWeekEventId === ev.id) return false; // 반복 이벤트도 바로 다음 주에는 다시 뜨지 않는다
  if (Array.isArray(ev.chars) && ev.chars.length) {
    const any = ev.charMode === "any";
    if (any ? !ev.chars.some((c) => charReady(state, c)) : !ev.chars.every((c) => charReady(state, c))) return false;
  }
  if (typeof ev.coach === "string" && !(state.supports || []).some((s) => s.id === ev.coach)) return false;
  return weekCondOk(state, ev.cond);
}

/**
 * 지금 띄울 수 있는 이벤트 (§24.3.2 · §24.7) — 데이터 순서 (파일 7개 · 파일 안 순서). 순수 · rng 없음.
 *   week: weeks [a, b] 또는 weekList (turnIndex 0 ~ 14) · seasons · once (run = usedEventIds · season = usedEventSeasons ·
 *         false = 반복, 지난 주 슬롯 (lastWeekEventId) 과 같은 id 는 빼고) · chars (all / any — 편성 · 결장 아님) · coach (편성) · cond.
 *   seasonStart · preMatch: seasons 에 지금 시즌. route: routeId = opts.routeId (반복).
 *   outing: 이번 런에 안 본 것 (outingSeen), 모두 봤으면 전부 (주머니를 다시 채운다 — fireEvent 가 비운다).
 * @param {object} state
 * @param {object} data
 * @param {"week"|"seasonStart"|"preMatch"|"route"|"outing"} trigger
 * @param {{ routeId?: string }} [opts]
 * @returns {object[]}
 */
export function eligible(state, data, trigger, opts = {}) {
  if (!FLOW_TRIGGERS.includes(trigger)) {
    throw new Error(`eligible: 트리거 '${trigger}' 은(는) 흐름 자격으로 고르지 않습니다 (${FLOW_TRIGGERS.join(" · ")} — 이야기는 storyNext · 코치는 coachReady, 깜짝은 레슨 안)`);
  }
  const o = opts || {};
  const list = allEvents(data).filter((ev) => isObj(ev) && ev.trigger === trigger);
  if (trigger === "outing") {
    const seen = Array.isArray(state.outingSeen) ? state.outingSeen : [];
    const fresh = list.filter((ev) => !seen.includes(ev.id));
    return fresh.length ? fresh : list;
  }
  return list.filter((ev) => {
    if (Array.isArray(ev.seasons) && !ev.seasons.includes(state.season)) return false;
    if (trigger === "route") return ev.routeId === o.routeId;
    if (trigger === "week") return weekEventOk(state, ev);
    return true; // seasonStart · preMatch — 시즌으로만
  });
}

/** 가중치 뽑기 (후보가 있을 때만 rng 를 한 번 열고 저장) */
function weightedPick(state, pool) {
  if (!pool.length) return null;
  const rng = createRngFromState(state.rngState);
  const ev = rng.weighted(pool, (e) => eventWeight(state, e));
  state.rngState = rng.getState();
  return ev || null;
}

/**
 * 주 끝 랜덤 1개 (§24.2 weekSlot): eligible(week) 에서 가중치 (weight · weightIf) 로 뽑는다. 후보가 없으면 null — rng 를 쓰지 않는다.
 * 상태는 rngState 만 바꾼다 (띄우기는 부르는 쪽 — fireEvent).
 * @returns {object|null}
 */
export function pickWeekEvent(state, data) {
  return weightedPick(state, eligible(state, data, "week"));
}

/**
 * 일반 외출 1개 (§24.7 — 이야기는 E4): 이번 런에 안 본 것 (다 봤으면 전부) 에서 가중치로. 후보가 없으면 null (rng 없음).
 * @returns {object|null}
 */
export function pickOutingEvent(state, data) {
  return weightedPick(state, eligible(state, data, "outing"));
}

/**
 * 고정 이벤트 (시즌 시작 · 경계전 전야 · 루트): 자격이 있는 것 중 데이터 순서로 첫 번째 [구현 결정 — 고정이라 뽑지 않는다]. 순수 · rng 없음.
 * @param {"seasonStart"|"preMatch"|"route"} trigger
 * @param {{ routeId?: string }} [opts]
 * @returns {object|null}
 */
export function pickFixedEvent(state, data, trigger, opts = {}) {
  if (!["seasonStart", "preMatch", "route"].includes(trigger)) throw new Error(`pickFixedEvent: 고정 이벤트 트리거가 아닙니다 ('${trigger}')`);
  return eligible(state, data, trigger, opts)[0] || null;
}

// ---------------------------------------------------------------------------
// E4 — 계정 스냅샷 · 코치 연속 이벤트 (§24.6 · L50) · 외출 이야기 (§24.7 · L30)
// ---------------------------------------------------------------------------

/** 키를 정렬한 새 객체 (계정 모양을 늘 같게 — 여러 번 합쳐도 같은 JSON) */
function sortedObj(o) {
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}

/**
 * 계정 스냅샷 정규화 (§24.5.2 · §24.7): { stories: { [charId]: 1 ~ 3 }, coachMet: { [supportId]: true } } — 새 객체, 키 정렬.
 * 없거나 모양이 틀리면 빈 값. 칸 하나가 틀리면 그 칸만 버린다 (id 꼴 · 화는 1 이상 정수 — 3 보다 크면 3, 0 은 "안 봄" 이라 뺀다 ·
 * coachMet 은 true 만). version 같은 다른 키도 버린다. 데이터에 없는 id 는 그대로 둔다 (콘텐츠가 바뀌어도 진행을 잃지 않게).
 * @param {any} account
 * @returns {{ stories: Record<string, number>, coachMet: Record<string, true> }}
 */
export function normalizeAccount(account) {
  const stories = {};
  const coachMet = {};
  if (isObj(account)) {
    if (isObj(account.stories)) {
      for (const [id, ep] of Object.entries(account.stories)) {
        if (ID_RE.test(id) && Number.isInteger(ep) && ep >= 1) stories[id] = Math.min(STORY_EPS.length, ep);
      }
    }
    if (isObj(account.coachMet)) {
      for (const [id, v] of Object.entries(account.coachMet)) if (ID_RE.test(id) && v === true) coachMet[id] = true;
    }
  }
  return { stories: sortedObj(stories), coachMet: sortedObj(coachMet) };
}

/**
 * 계정 저장소에 이번 런 진행을 합친다 (§24.7 — 화면이 엔진 호출마다 저장한 뒤 부른다). 순수 · 멱등 (여러 번 불러도 같다) · 새 객체.
 *   stories[charId] = max(계정 값, 이번 런에 본 가장 큰 화 — state.storyEps), coachMet = 계정 ∪ 이번 런에 고른 코치 1단계 (state.coachSteps).
 * @param {any} account  계정 저장 (soccer-lesson.account — 틀린 모양은 빈 값으로)
 * @param {object} state  레슨 런 상태
 * @returns {{ version: 1, stories: Record<string, number>, coachMet: Record<string, true> }}
 */
export function accountMerge(account, state) {
  const acc = normalizeAccount(account);
  const stories = { ...acc.stories };
  const coachMet = { ...acc.coachMet };
  const eps = state && isObj(state.storyEps) ? state.storyEps : {};
  for (const [id, ep] of Object.entries(eps)) {
    if (ID_RE.test(id) && Number.isInteger(ep) && ep >= 1) stories[id] = Math.max(stories[id] || 0, Math.min(STORY_EPS.length, ep));
  }
  const steps = state && isObj(state.coachSteps) ? state.coachSteps : {};
  for (const [id, list] of Object.entries(steps)) if (ID_RE.test(id) && Array.isArray(list) && list.includes(1)) coachMet[id] = true;
  return { version: 1, stories: sortedObj(stories), coachMet: sortedObj(coachMet) };
}

/** lesson.json events.coach (없으면 빈 값) */
function coachCfg(data) {
  const c = data && data.lesson && data.lesson.events && data.lesson.events.coach;
  return isObj(c) ? c : {};
}

/**
 * 그 코치 · 단계의 코치 연속 이벤트 (trigger coach, chain { supportId, step } — 데이터 순서 첫 번째, 없으면 null).
 * @returns {object|null}
 */
export function coachEventOf(data, supportId, step) {
  return allEvents(data).find((e) => isObj(e) && e.trigger === "coach" && isObj(e.chain) && e.chain.supportId === supportId && e.chain.step === step) || null;
}

/**
 * 지금 준비된 코치 연속 이벤트 (§24.6). 순수 · rng 없음. 기능 스위치 · 2주 연속 금지는 보지 않는다 (pickCoachEvent).
 * 편성 코치마다 다음 단계 하나 (이번 런에 본 단계 = state.coachSteps):
 *   1 첫 만남 — 레슨에 나왔다 (state.coachSeen) · 이번 런에 안 봤다 · firstMeet "account" (기본) 면 계정에서도 안 만났다.
 *   2 유대 ≥ 2단계 문턱 (bond.eventSteps[0], 40) — 1단계를 이번 런에 봤다, 또는 firstMeet "account" 이고 계정에서 만났다 (1단계 건너뜀).
 *   3 유대 ≥ 3단계 문턱 (80) — 2단계를 이번 런에 봤다.
 * 그 단계의 이벤트가 데이터에 있어야 한다. 순서: 낮은 단계 먼저, 같으면 편성 순 (state.supports)
 * [구현 결정 — 코치마다 다음 단계는 하나뿐이라 "낮은 단계 먼저" 는 코치 사이의 순서다].
 * firstMeet "run" 이면 계정과 상관없이 런마다 1단계부터 본다.
 * @returns {Array<{ supportId: string, step: 1|2|3, ev: object }>}
 */
export function coachReady(state, data) {
  const sups = state && Array.isArray(state.supports) ? state.supports : [];
  const firstMeet = coachCfg(data).firstMeet === "run" ? "run" : "account";
  const bonds = coachStepBonds(data);
  const met = normalizeAccount(state && state.account).coachMet;
  const seen = state && isObj(state.coachSeen) ? state.coachSeen : {};
  const steps = state && isObj(state.coachSteps) ? state.coachSteps : {};
  const out = [];
  sups.forEach((st, order) => {
    const id = st && st.id;
    if (typeof id !== "string") return;
    const done = Array.isArray(steps[id]) ? steps[id] : [];
    const skipFirst = firstMeet === "account" && met[id] === true;
    const step = done.includes(2) ? 3 : done.includes(1) || skipFirst ? 2 : 1;
    if (done.includes(step)) return;
    const ok = step === 1 ? seen[id] === true : (Number(st.bond) || 0) >= bonds[step - 1];
    if (!ok) return;
    const ev = coachEventOf(data, id, step);
    if (ev) out.push({ supportId: id, step, ev, order });
  });
  out.sort((a, b) => a.step - b.step || a.order - b.order);
  return out.map(({ supportId, step, ev }) => ({ supportId, step, ev }));
}

/**
 * 이번 주 끝 슬롯의 코치 연속 이벤트 (§24.6 — weekSlot 이 주 끝 랜덤보다 먼저 본다): coachReady 의 첫 번째.
 * events.coach.gapWeeks (기본 1): 마지막 코치 이벤트의 주 (state.lastCoachTurnIndex) 에서 gapWeeks 주 안이면 null
 * — 바로 앞 주 슬롯이 코치 이벤트였으면 이번 주는 주 끝 랜덤. 순수 · rng 없음. 스위치 (events.coach.enabled) 는 부르는 쪽이 본다.
 * @returns {{ supportId: string, step: number, ev: object }|null}
 */
export function pickCoachEvent(state, data) {
  const g = coachCfg(data).gapWeeks;
  const gap = Number.isInteger(g) && g >= 0 ? g : 1;
  const last = state ? state.lastCoachTurnIndex : null;
  if (Number.isInteger(last) && (Number(state.turnIndex) || 0) - last <= gap) return null;
  return coachReady(state, data)[0] || null;
}

/** 그 코치의 종목: 코치 카드 coach.type (루미 = 피지컬, L28), 코치 카드가 없으면 supports.json type 이 스탯일 때 그것 */
function coachTypeOf(data, supportId) {
  const cc = supportId ? coachCardOf(data, supportId) : null;
  if (cc && cc.coach && STATS.includes(cc.coach.type)) return cc.coach.type;
  const sc = supportOf(data, supportId);
  return sc && STATS.includes(sc.type) ? sc.type : null;
}

/**
 * 주인공 coachTarget 후보 (§24.3.4 · 초안 5.0) — 마지막 무작위 앞의 같은 순위 선수 id (state.players 순서). 순수 · rng 없음.
 *   결장 아닌 선수 (모두 결장이면 전원) 중 이번 런 그 코치 카드의 대상이 된 횟수 (state.coachTargets[supportId]) 가 가장 많은 선수 →
 *   같으면 코치 종목이 지금 포지션의 주 스탯 (cards.mainStatsOf) 인 선수 (그런 선수가 없으면 그대로).
 *   하나면 그 선수, 여럿이면 pickProtagonist 가 rng 로 고른다.
 * @param {object} state
 * @param {object} data
 * @param {string|null} supportId
 * @returns {string[]}
 */
export function coachTargetCandidates(state, data, supportId) {
  const players = state && Array.isArray(state.players) ? state.players : [];
  const healthy = players.filter((p) => !isInjured(p));
  const base = healthy.length ? healthy : players.slice();
  if (!base.length) return [];
  const row = supportId && isObj(state.coachTargets) && isObj(state.coachTargets[supportId]) ? state.coachTargets[supportId] : {};
  const n = (p) => Number(row[p.id]) || 0;
  const most = Math.max(...base.map(n));
  let tied = base.filter((p) => n(p) === most);
  const type = coachTypeOf(data, supportId);
  if (type && tied.length > 1) {
    const typed = tied.filter((p) => mainStatsOf(p.position).includes(type));
    if (typed.length) tied = typed;
  }
  return tied.map((p) => p.id);
}

/**
 * 그 캐릭터 · 화의 외출 이야기 (trigger story, story { charId, ep } — 데이터 순서 첫 번째, 없으면 null).
 * @returns {object|null}
 */
export function storyEventOf(data, charId, ep) {
  return allEvents(data).find((e) => isObj(e) && e.trigger === "story" && isObj(e.story) && e.story.charId === charId && e.story.ep === ep) || null;
}

/**
 * 그 캐릭터의 다음 이야기 화 (§24.7): min(3, 계정에서 본 화 + 이번 런에 본 화) + 1 — 3 이하이고 그 화가 데이터에 있으면 그 화, 아니면 null.
 * 이번 런에 본 화 = state.storyEps (고른 순간에 센다). 이야기는 1 · 2 · 3화 차례로만 뜨므로 "계정 + 이번 런 수" = max(계정, 이번 런 가장 큰 화).
 * 순수. 기능 스위치는 보지 않는다 (외출 이벤트 단계 · 주 화면이 본다).
 * @param {object} state
 * @param {object} data
 * @param {string} charId
 * @returns {1|2|3|null}
 */
export function storyNext(state, data, charId) {
  const acc = normalizeAccount(state && state.account).stories[charId] || 0;
  const runEp = state && isObj(state.storyEps) ? Number(state.storyEps[charId]) || 0 : 0;
  const next = Math.min(STORY_EPS.length, Math.max(acc, runEp)) + 1;
  if (next > STORY_EPS.length) return null;
  return storyEventOf(data, charId, next) ? next : null;
}

/**
 * 외출 이벤트 단계의 이야기 (§24.7): 외출 상대의 다음 화가 있으면 그 이벤트 (확정 — rng 없음), 없으면 null (일반 외출 주머니).
 * @returns {object|null}
 */
export function pickStoryEvent(state, data, charId) {
  const ep = storyNext(state, data, charId);
  return ep ? storyEventOf(data, charId, ep) : null;
}

/**
 * 회상 목록 (§24.7 — 시작 화면 [회상] 이 쓴다, 엔진 상태와 상관없다): 데이터의 외출 이야기
 * [{ charId, name, ep, id, title }] — 캐릭터 순 (data.characters, 없는 캐릭터는 뒤에 id 순), 화 순. 순수.
 * title 의 {선수} 는 그 캐릭터 이름으로 채운다 (채울 수 없는 자리표시가 있으면 그대로).
 * @param {object} data
 * @returns {Array<{ charId: string, name: string, ep: number, id: string, title: string }>}
 */
export function storyList(data) {
  const chars = data && Array.isArray(data.characters) ? data.characters : [];
  const rank = (id) => {
    const i = chars.findIndex((c) => c && c.id === id);
    return i < 0 ? chars.length : i;
  };
  return allEvents(data)
    .filter((e) => isObj(e) && e.trigger === "story" && isObj(e.story) && typeof e.story.charId === "string")
    .map((e) => {
      const ch = chars.find((c) => c && c.id === e.story.charId);
      const name = ch && ch.name ? ch.name : e.story.charId;
      let title = typeof e.title === "string" ? e.title : "";
      try {
        title = fillText(title, { player: name });
      } catch (_) {
        // 채울 수 없는 자리표시 — 글 그대로
      }
      return { charId: e.story.charId, name, ep: e.story.ep, id: e.id, title };
    })
    .sort((a, b) => rank(a.charId) - rank(b.charId) || (a.charId < b.charId ? -1 : a.charId > b.charId ? 1 : 0) || a.ep - b.ep);
}
