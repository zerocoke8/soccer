// test/lessonEvents.test.mjs — LESSON_PROTO_PLAN §24.3 · §24.4 · §24.5.1 (E1: 조사 · 자리표시 · 말투 · 효과 스키마 · 검사,
// E2: 효과 적용 · 미리보기 · 대체값 · 주인공 · 띄우기 · 뷰 · 고르기 · 카드 3택1 · 기대값)
// E3 · E4 가 흐름 테스트를 이 파일에 더한다 (테스트 안의 고정 이벤트 + 데이터 사본).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone } from "./helpers.mjs";
import * as LT from "../js/engine/lessonText.js";
import * as LE from "../js/engine/lessonEvents.js";
import * as LF from "../js/engine/lessonEffects.js";
import * as LR from "../js/engine/lessonRun.js";
import { createRngFromState } from "../js/engine/rng.js";
import { canUpgrade, getCard } from "../js/engine/cards.js";
import { buildEventsDoc } from "../tools/events_doc.mjs";

const data = loadData();

// ---------------------------------------------------------------------------
// 조사 (§24.3.5)
// ---------------------------------------------------------------------------

test("hasBatchim · josa: 받침 · 받침 없음 · ㄹ 받침 (으로/로) · 한글이 아닌 끝 글자", () => {
  assert.equal(LT.hasBatchim("아델린"), true);
  assert.equal(LT.hasBatchim("네리아"), false);
  assert.equal(LT.hasBatchim("리시엘"), true, "ㄹ 도 받침");
  assert.equal(LT.hasBatchim("Bob"), false);
  assert.equal(LT.hasBatchim(""), false);
  const all = (name) => Object.fromEntries(LT.JOSA_PAIRS.map((p) => [p, LT.josa(name, p)]));
  assert.deepEqual(all("아델린"), { "이/가": "이", "은/는": "은", "을/를": "을", "과/와": "과", "으로/로": "으로", "아/야": "아", "이랑/랑": "이랑", "이에요/예요": "이에요" });
  assert.deepEqual(all("네리아"), { "이/가": "가", "은/는": "는", "을/를": "를", "과/와": "와", "으로/로": "로", "아/야": "야", "이랑/랑": "랑", "이에요/예요": "예요" });
  // ㄹ 받침: 으로/로 만 "로", 나머지는 받침 있는 꼴
  assert.deepEqual(all("리시엘"), { "이/가": "이", "은/는": "은", "을/를": "을", "과/와": "과", "으로/로": "로", "아/야": "아", "이랑/랑": "이랑", "이에요/예요": "이에요" });
  assert.equal(LT.withJosa("서울", "으로/로"), "서울로");
  assert.equal(LT.withJosa("부산", "으로/로"), "부산으로");
  // 끝 글자가 한글이 아니면 둘 다 적는다
  assert.equal(LT.josa("Bob", "이/가"), "이(가)");
  assert.equal(LT.josa("R2", "으로/로"), "으로(로)");
  assert.equal(LT.josa("", "은/는"), "은(는)");
  assert.equal(LT.withJosa("C-3", "을/를"), "C-3을(를)");
  assert.throws(() => LT.josa("네리아", "의/의"), /모르는 조사 꼴 '의\/의'/);
});

test("josa: 선수 16명 · 코치 8명 이름 전부 (data — 아델린이 · 네리아가 · 무희 셀리아가)", () => {
  // [이/가, 으로/로, 아/야] — 이름이 바뀌면 이 표도 고친다
  const PLAYERS = {
    네리아: ["네리아가", "네리아로", "네리아야"],
    도르비나: ["도르비나가", "도르비나로", "도르비나야"],
    아델린: ["아델린이", "아델린으로", "아델린아"],
    실루엔: ["실루엔이", "실루엔으로", "실루엔아"],
    타리아: ["타리아가", "타리아로", "타리아야"],
    울리카: ["울리카가", "울리카로", "울리카야"],
    그레타: ["그레타가", "그레타로", "그레타야"],
    미르카: ["미르카가", "미르카로", "미르카야"],
    헤르타: ["헤르타가", "헤르타로", "헤르타야"],
    브론테: ["브론테가", "브론테로", "브론테야"],
    나엘리스: ["나엘리스가", "나엘리스로", "나엘리스야"],
    코니: ["코니가", "코니로", "코니야"],
    온디나: ["온디나가", "온디나로", "온디나야"],
    리시엘: ["리시엘이", "리시엘로", "리시엘아"],
    카밀라: ["카밀라가", "카밀라로", "카밀라야"],
    힐디: ["힐디가", "힐디로", "힐디야"],
  };
  const COACHES = {
    "코치 하르나": "코치 하르나가",
    "무희 셀리아": "무희 셀리아가",
    "현자 오르넬라": "현자 오르넬라가",
    "주장 바르바라": "주장 바르바라가",
    "수행자 한나": "수행자 한나가",
    "음유시인 루미": "음유시인 루미가",
    "거리의 조이": "거리의 조이가",
    "학자 이레네": "학자 이레네가",
  };
  assert.deepEqual(data.characters.map((c) => c.name).sort(), Object.keys(PLAYERS).sort(), "선수 16명 이름 = 표");
  assert.deepEqual(data.supports.map((s) => s.name).sort(), Object.keys(COACHES).sort(), "코치 8명 이름 = 표");
  for (const c of data.characters) {
    const [ga, ro, ya] = PLAYERS[c.name];
    assert.equal(LT.withJosa(c.name, "이/가"), ga, c.id);
    assert.equal(LT.withJosa(c.name, "으로/로"), ro, c.id);
    assert.equal(LT.withJosa(c.name, "아/야"), ya, c.id);
    assert.equal(LT.fillText("{선수|이/가} 웃는다", { player: c.name }), `${ga} 웃는다`, c.id);
  }
  for (const s of data.supports) {
    assert.equal(LT.withJosa(s.name, "이/가"), COACHES[s.name], s.id);
    assert.equal(LT.fillText("{코치|은/는} 말한다", { coach: s.name }), `${s.name}는 말한다`, s.id);
    assert.equal(LT.fillText("{코치|과/와}", { coach: s.name }), `${s.name}와`, s.id);
  }
});

test("fillText: {선수} · {선수|조사} · {코치} · {시즌} · 모르는 자리표시는 throw", () => {
  const vars = { player: "아델린", coach: "무희 셀리아", season: 2 };
  assert.equal(LT.fillText("{선수|이/가} {코치|을/를} 부른다. 시즌 {시즌}.", vars), "아델린이 무희 셀리아를 부른다. 시즌 2.");
  assert.equal(LT.fillText("{선수}의 공 · {선수|과/와} {코치}", vars), "아델린의 공 · 아델린과 무희 셀리아");
  assert.equal(LT.fillText("{선수|이에요/예요}? {선수|이랑/랑}!", { player: "네리아" }), "네리아예요? 네리아랑!");
  assert.equal(LT.fillText("자리표시 없음", {}), "자리표시 없음");
  assert.equal(LT.fillText("{선수|은/는}", { player: { name: "실루엔" } }), "실루엔은", "{ name } 객체도 받는다");
  assert.throws(() => LT.fillText("{player}가 왔다", vars), /모르는 자리표시 '\{player\}'.*옛 표기/);
  assert.throws(() => LT.fillText("{선수|의/의}", vars), /모르는 조사 꼴 '의\/의'/);
  assert.throws(() => LT.fillText("{선수\\|이/가}", vars), /역슬래시/);
  assert.throws(() => LT.fillText("{시즌|이/가}", vars), /조사를 붙이지 않는다/);
  assert.throws(() => LT.fillText("{선수", vars), /짝 없는 '\{'/);
  assert.throws(() => LT.fillText("선수}", vars), /짝 없는 '\}'/);
  assert.throws(() => LT.fillText("{코치} 가 없다", { player: "네리아" }), /'\{코치\}' 에 넣을 값이 없습니다/);
  // scanText · bareJosaErrors (검사용)
  const s = LT.scanText("{선수|이/가} {코치} {시즌}");
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.tokens.map((t) => [t.name, t.pair]), [["선수", "이/가"], ["코치", null], ["시즌", null]]);
  assert.equal(LT.bareJosaErrors("{선수}가 웃는다").length, 1);
  assert.match(LT.bareJosaErrors("{코치}와 함께")[0], /\{코치\|과\/와\}/);
  assert.deepEqual(LT.bareJosaErrors("{선수}의 공 · {선수}에게 · {선수}도 · {선수}이다"), [], "의 · 에게 · 도 · 이다 는 조사 꼴이 아니다");
});

test("speechOf · pickText: 반말 선수는 alt.banmal (본문 + 결과), 존댓말 · 반말판 없는 이벤트는 기본 글", () => {
  assert.equal(LT.speechOf(data, "ch_dwarf_wall"), "banmal");
  for (const id of ["ch_giant_keeper", "ch_spirit_striker", "ch_spirit_dribbler", "ch_human_header", "ch_dwarf_finisher"]) assert.equal(LT.speechOf(data, id), "banmal", id);
  for (const id of ["ch_spirit_keeper", "ch_human_captain", "ch_elf_regista", "ch_rabbit_fullback", "ch_nobody"]) assert.equal(LT.speechOf(data, id), "polite", id);
  assert.equal(LT.speechOf({}, "ch_dwarf_wall"), "polite", "표가 없으면 존댓말");
  const ev = {
    text: "기본 본문",
    choices: [{ result: "A" }, { result: { then: "B1", else: "B2" } }],
    alt: { banmal: { text: "반말 본문", results: ["a", { then: "b1", else: "b2" }] } },
  };
  assert.deepEqual(LT.pickText(ev, "ch_dwarf_wall", data), { text: "반말 본문", results: ["a", { then: "b1", else: "b2" }] });
  assert.deepEqual(LT.pickText(ev, "ch_spirit_keeper", data), { text: "기본 본문", results: ["A", { then: "B1", else: "B2" }] });
  assert.deepEqual(LT.pickText(ev, null, data), { text: "기본 본문", results: ["A", { then: "B1", else: "B2" }] });
  const noAlt = { text: "기본", choices: [{ result: "x" }, { result: "y" }] };
  assert.deepEqual(LT.pickText(noAlt, "ch_dwarf_wall", data), { text: "기본", results: ["x", "y"] });
  // 실제 본보기: ev_local_kids
  const kids = LE.eventById(data, "ev_local_kids");
  const b = LT.pickText(kids, "ch_human_header", data);
  assert.notEqual(b.text, kids.text, "반말판 본문");
  assert.equal(LT.fillText(b.text, { player: "카밀라" }).includes("카밀라가 이미 공을"), true);
});

// ---------------------------------------------------------------------------
// 데이터 읽기 · 스위치
// ---------------------------------------------------------------------------

test("allEvents · eventById: 파일 7개를 잇고, 없는 파일은 건너뛰고, 데이터 사본을 바꿔도 맞다 (캐시 없음)", () => {
  assert.equal(LE.EVENT_FILES.length, 7);
  const d = clone(data);
  const n0 = LE.allEvents(d).length;
  d.lesson_ev_coach.events.push({ id: "ev_x1", trigger: "week" });
  assert.equal(LE.allEvents(d).length, n0 + 1);
  assert.equal(LE.eventById(d, "ev_x1").trigger, "week");
  const dropped = d.lesson_ev_coach.events.length + d.lesson_ev_story.events.length;
  delete d.lesson_ev_coach;
  delete d.lesson_ev_story;
  assert.equal(LE.allEvents(d).length, n0 + 1 - dropped);
  assert.equal(LE.eventById(d, "ev_x1"), null);
  assert.equal(LE.eventById(d, "ev_local_kids").id, "ev_local_kids");
  assert.deepEqual(LE.allEvents({}), []);
  // 배경: scene → 트리거 기본값 → 루트마다 (§24.12.5)
  assert.equal(LE.sceneOf(LE.eventById(d, "ev_local_kids")), "ground");
  assert.equal(LE.sceneOf({ trigger: "story" }), "nature");
  assert.equal(LE.sceneOf({ trigger: "preMatch", scene: "clubhouse" }), "clubhouse");
  assert.equal(LE.sceneOf({ trigger: "route", routeId: "rt_hotspring" }), "onsen");
  for (const id of Object.values(LE.ROUTE_SCENES).concat(Object.values(LE.DEFAULT_SCENES))) assert.ok(LE.SCENE_IDS.includes(id), id);
  assert.equal(LE.validateLessonEvents(d), true, "파일이 없어도 검사는 통과");
});

test("loadData: 기본은 이벤트 기능 스위치를 모두 끈 사본, { events: true } 는 데이터 그대로 · setEventSwitches", () => {
  const raw = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../data/lesson.json", import.meta.url)), "utf8"));
  const off = loadData().lesson.events;
  for (const k of ["week", "seasonStart", "preMatch", "route", "outing"]) assert.equal(off[k], false, k);
  assert.equal(off.coach.enabled, false);
  assert.equal(off.surprise.enabled, false);
  assert.deepEqual(off.speech, raw.events.speech, "말투 표는 그대로");
  assert.deepEqual(off.fallback, raw.events.fallback, "대체값은 그대로");
  assert.deepEqual(loadData({ events: true }).lesson, raw, "events: true = 데이터 그대로");
  for (const f of LE.EVENT_FILES) assert.ok(loadData()[f], `${f} 를 읽는다`);
  const on = LE.setEventSwitches(clone(raw), true).events;
  for (const k of ["week", "seasonStart", "preMatch", "route", "outing"]) assert.equal(on[k], true, k);
  assert.equal(on.coach.enabled, true);
  assert.equal(on.coach.gapWeeks, raw.events.coach.gapWeeks, "스위치 말고는 그대로");
  assert.equal(on.surprise.chance, raw.events.surprise.chance);
  assert.deepEqual(LE.setEventSwitches({ x: 1 }, true), { x: 1 }, "events 블록이 없으면 그대로");
});

// ---------------------------------------------------------------------------
// 효과 스키마 (§24.4)
// ---------------------------------------------------------------------------

test("EFFECTS: §24.4.1 · §24.4.2 의 type 전부 · 레슨 안 효과는 깜짝 전용 · 깜짝은 정해진 런 효과만 · 옛 효과 없음", () => {
  const RUN = ["stat", "stamina", "condition", "goalCondition", "teamwork", "sp", "tp", "bond", "injury", "heal", "relic", "modifier",
    "cardAdd", "cardPick", "cardUpgradeRandom", "rewardOffer", "uniquePlus", "teach", "coachHint", "playerHint", "random"];
  const LESSON = ["nextPct", "nextNoFail", "drawNext", "extraPlayNext", "score", "buff", "restRemaining", "injureNow"];
  assert.deepEqual(Object.keys(LF.EFFECTS).sort(), [...RUN, ...LESSON].sort());
  for (const t of RUN) {
    assert.equal(LF.EFFECTS[t].scope, "run", t);
    const nonSurprise = LE.TRIGGERS.filter((x) => x !== "surprise");
    for (const trig of nonSurprise) assert.ok(LF.effectAllowed(t, trig), `${t} @ ${trig}`);
    assert.equal(LF.effectAllowed(t, "surprise"), LF.SURPRISE_RUN_EFFECTS.includes(t), `${t} @ surprise`);
  }
  for (const t of LESSON) {
    assert.equal(LF.EFFECTS[t].scope, "lesson", t);
    assert.deepEqual([...LF.EFFECTS[t].triggers], ["surprise"], t);
  }
  for (const old of ["summonTicket", "hint", "skillPoints"]) {
    assert.equal(LF.EFFECTS[old], undefined, old);
    assert.match(LF.effectErrors({ type: old }, "x").join("\n"), /옛 효과/);
  }
  // modifier: 옛 events.json 과 같은 꼴 (key · amount · duration)
  assert.deepEqual(Object.keys(LF.EFFECTS.modifier.keys).sort(), ["amount", "duration", "key"]);
  // 문맥 없이 (스키마만) 도 쓸 수 있다
  assert.deepEqual(LF.effectErrors({ type: "stat", target: "team", stat: "pass", amount: 6 }, "x"), []);
  assert.deepEqual(LF.effectErrors({ type: "modifier", key: "shootPower", amount: 0.05, duration: "run" }, "x"), []);
  assert.match(LF.effectErrors({ type: "stat", target: "team", stat: "pass" }, "e[0]")[0], /^e\[0\]: 'stat' 에 'amount' 가 없다$/);
  assert.match(LF.effectErrors({ type: "nextPct", pct: 0.4 }, "x")[0], /% 정수/);
});

// ---------------------------------------------------------------------------
// 검사 (§24.3.7)
// ---------------------------------------------------------------------------

const EMPTY = () => ({ version: 1, notes: {}, events: [] });

/** 이벤트 파일을 모두 비우고 그 파일에 이벤트를 넣은 데이터 사본 */
function withEvents(events, file = "lesson_ev_week", base = data) {
  const d = clone(base);
  for (const f of LE.EVENT_FILES) d[f] = EMPTY();
  d[file] = { version: 1, notes: {}, events: clone(events) };
  return d;
}

/** 주 끝 본보기 (검사 통과) */
const WEEK_OK = {
  id: "ev_fixture",
  trigger: "week",
  title: "시험 이벤트",
  text: "{선수|이/가} 감독실 문을 두드립니다.\n\"감독님, 오늘 밤만 슈팅을 더 차고 싶어요.\"",
  who: { pick: "random", pos: ["FW", "MF"] },
  weeks: [1, 14],
  seasons: [1, 2, 3],
  once: "run",
  weight: 2,
  scene: "clubhouse",
  choices: [
    {
      label: "\"오늘 밤은 네 날이다.\"",
      effects: [{ type: "random", chance: 0.7,
        then: [{ type: "stat", target: "player", stat: "shoot", amount: 30 }],
        else: [{ type: "stat", target: "player", stat: "shoot", amount: 30 }, { type: "stamina", target: "player", amount: -40 }, { type: "injury", target: "player" }] }],
      result: { then: "{선수|은/는} 슈팅이 날카로워졌습니다.", else: "다음 날 아침 {선수|이/가} 다리를 절며 나타났습니다." },
    },
    { label: "쉬라고 한다", effects: [{ type: "condition", amount: 1 }], result: "{선수|이/가} 아쉬워하며 숙소로 돌아갑니다." },
  ],
  alt: { banmal: {
    text: "{선수|이/가} 감독실 문을 두드립니다.\n\"감독, 오늘 밤 슈팅 좀 더 찬다.\"",
    results: [{ then: "{선수|은/는} 슈팅이 날카로워졌습니다.", else: "다음 날 아침 {선수|이/가} 다리를 절며 나타났습니다." }, "{선수|이/가} 투덜대며 숙소로 돌아갑니다."],
  } },
};

/** 깜짝 본보기: 코치 카드 성공 턴 ({코치} · bond coach · 레슨 안 효과) */
const SURPRISE_OK = {
  id: "ls_fixture_coach",
  trigger: "surprise",
  title: "한 번만 더",
  text: "\"{코치}님, 방금 그거 한 번만 더 보여 주세요!\"",
  cond: { coachCardOkThisTurn: true, turnMin: 2 },
  who: { pick: "coachCardTarget" },
  weight: 1,
  choices: [
    { label: "\"다음 카드에 실어 봐.\"", effects: [{ type: "nextPct", pct: 30 }], result: "{선수|이/가} 고개를 끄덕입니다." },
    { label: "{코치}에게 맡긴다", effects: [{ type: "bond", target: "coach", amount: 10 }, { type: "stamina", target: "player", amount: -10 }], result: "{코치|이/가} 웃으며 한 번 더 시범을 보입니다." },
  ],
};

/** 깜짝 본보기: 방침 + 선수 조건 */
const SURPRISE_POLICY_OK = {
  id: "ls_fixture_policy",
  trigger: "surprise",
  title: "소리가 사라졌다",
  text: "{선수|이/가} 눈을 감습니다. \"…조용해요.\"",
  policy: "ace",
  cond: { buffAtLeast: { key: "focus", n: 2 }, char: { id: "ch_spirit_keeper", targetedMax: 0 }, turnMin: 3 },
  who: { pick: "char", charId: "ch_spirit_keeper" },
  choices: [
    { label: "그대로 둔다", effects: [{ type: "buff", n: 1 }, { type: "restRemaining", stamina: 20 }], result: "네리아가 숨을 고릅니다." },
    { label: "한 장 더", effects: [{ type: "random", chance: 0.5, then: [{ type: "extraPlayNext", n: 1 }], else: [{ type: "injureNow" }] }], result: { then: "손이 하나 더 갑니다.", else: "네리아가 주저앉았습니다." } },
  ],
};

/** 이야기 본보기 3화 (네리아) */
const STORY_OK = [1, 2, 3].map((ep) => ({
  id: `out_fixture_${ep}`,
  trigger: "story",
  story: { charId: "ch_spirit_keeper", ep },
  title: `호수 ${ep}화`,
  text: "네리아가 호숫가에 앉아 있습니다.\n\"감독님, 물소리 들리세요?\"",
  scene: "nature",
  choices: [
    { label: "같이 듣는다", effects: ep === 3 ? [{ type: "uniquePlus" }, { type: "condition", amount: 1 }] : [{ type: "playerHint", skillId: "sk_calm_keeper" }], result: "물소리가 가라앉았습니다." },
    { label: "돌아가자고 한다", effects: [{ type: "stat", target: "player", stat: "main2", amount: 8 + ep }, { type: "teamwork", amount: 5 }], result: "네리아가 웃었습니다." },
  ],
}));

/** 코치 연속 본보기 3단계 (하르나) */
const COACH_OK = [1, 2, 3].map((step) => ({
  id: `ev_coach_fixture_${step}`,
  trigger: "coach",
  chain: { supportId: "sp_coach_harr", step },
  bondAtLeast: LE.COACH_STEP_BONDS[step - 1],
  title: `하르나 ${step}`,
  text: "{코치|이/가} 호루라기를 붑니다.\n\"{선수}, 골문부터 봐!\" {선수|이/가} 고개를 듭니다.",
  choices: [
    { label: "맡긴다", effects: [{ type: "teach", skillId: "sk_power_shot", supportId: "sp_coach_harr" }, { type: "stat", target: "player", stat: "shoot", amount: 15 }], result: "{선수|이/가} 슛을 배웠습니다." },
    { label: "카드를 받는다", effects: [{ type: "cardAdd", cardId: "cd_c_harr" }, { type: "bond", target: "coach", amount: 5 }], result: "{코치|은/는} 인터벌 슈팅을 적어 주었습니다." },
  ],
}));

/** 나머지 트리거 본보기 */
const MISC_OK = [
  { id: "ev_fixture_s1", trigger: "seasonStart", seasons: [1], title: "개막", text: "관중석이 비어 있습니다.", choices: [
    { label: "인사한다", effects: [{ type: "rewardOffer" }], result: "박수가 나왔습니다." },
    { label: "훈련한다", effects: [{ type: "cardPick", op: "upgrade" }], result: "땀을 흘렸습니다." }] },
  { id: "ev_fixture_pre1", trigger: "preMatch", seasons: [1], who: { pick: "lowestStamina" }, title: "전야", text: "{선수|이/가} 잠들지 못합니다.", choices: [
    { label: "간파를 준비한다", effects: [{ type: "modifier", key: "gaanpaTicket", amount: 1, duration: "season" }], result: "작전판이 채워졌습니다." },
    { label: "푹 재운다", effects: [{ type: "goalCondition", amount: 1 }, { type: "stamina", target: "player", full: true }], result: "{선수|이/가} 깊이 잠들었습니다." }] },
  { id: "ev_fixture_route", trigger: "route", routeId: "rt_hotspring", title: "온천", text: "김이 오릅니다.", choices: [
    { label: "쉰다", effects: [{ type: "heal", target: "all" }, { type: "bond", target: "all", amount: 5 }], result: "모두 몸을 녹였습니다." },
    { label: "유물을 찾는다", effects: [{ type: "relic" }, { type: "tp", amount: -10 }], result: "낡은 상자가 나왔습니다." }] },
  { id: "ev_fixture_outing", trigger: "outing", weight: 1, title: "{선수}의 이야기", text: "{선수|이/가} 장터를 걷습니다.\n\"감독님, 저거 맛있어 보여요.\"", choices: [
    { label: "사 준다", effects: [{ type: "stamina", target: "player", full: true }], result: "{선수|이/가} 웃었습니다." },
    { label: "같이 걷는다", effects: [{ type: "random", chance: 0.5, then: [{ type: "playerHint" }], else: [{ type: "stamina", target: "player", amount: -10 }] }], result: { then: "무언가 깨달았습니다.", else: "다리가 아픕니다." } }],
    alt: { banmal: { text: "{선수|이/가} 장터를 걷습니다.\n\"감독, 저거 맛있겠다.\"", results: ["{선수|이/가} 웃었다.", { then: "무언가 깨달았습니다.", else: "다리가 아픕니다." }] } } },
  // 짝 이벤트: chars all + char:<id> 대상, 그 선수 패시브 힌트
  { id: "ev_fixture_pair", trigger: "week", chars: ["ch_wolf_winger", "ch_giant_striker"], charMode: "all", weeks: [2, 14], title: "한 뼘 더", text: "울리카와 그레타가 남아 크로스를 맞춥니다.", choices: [
    { label: "끝까지 본다", effects: [{ type: "stat", target: "char:ch_wolf_winger", stat: "pass", amount: 15 }, { type: "playerHint", target: "char:ch_giant_striker", skillId: "sk_focus_finish" }], result: "공이 머리에 닿았습니다." },
    { label: "들여보낸다", effects: [{ type: "uniquePlus", target: "char:ch_wolf_winger" }], result: "둘이 투덜대며 들어갑니다." }] },
  // 코치 편성 조건 + 수업 (supportId)
  { id: "ev_fixture_monk", trigger: "week", coach: "sp_mountain_monk", cond: { avgStaminaBelow: 50 }, who: { pick: "lowestStamina" }, weightIf: { cond: { anyInjured: true }, weight: 3 }, once: false, title: "닫힌 문", text: "{코치|이/가} 문을 닫습니다. \"오늘은 닫는다.\"", choices: [
    { label: "따른다", effects: [{ type: "teach", skillId: "sk_iron_tackle", supportId: "sp_mountain_monk" }, { type: "coachHint", from: "coach" }], result: "조용한 하루였습니다." },
    { label: "연다", effects: [{ type: "cardUpgradeRandom" }, { type: "sp", amount: 15 }], result: "{선수|이/가} 땀을 흘렸습니다." }] },
];

test("검사: 실제 데이터 · 모든 트리거의 본보기 (이야기 3화 · 코치 3단계 · 짝 · 깜짝 · 고정 · 외출) 는 통과한다", () => {
  assert.equal(LE.validateLessonEvents(data), true);
  const d = withEvents([WEEK_OK, ...MISC_OK]);
  d.lesson_ev_surprise = { version: 1, notes: {}, events: clone([SURPRISE_OK, SURPRISE_POLICY_OK]) };
  d.lesson_ev_story = { version: 1, notes: { ch_spirit_keeper: { arc: "호수를 떠난 정령", setting: ["호수의 어른들 [가정]"] } }, events: clone(STORY_OK) };
  d.lesson_ev_coach = { version: 1, notes: { sp_coach_harr: { arc: "한 골 차 라이벌" } }, events: clone(COACH_OK) };
  assert.deepEqual(LE.lessonEventErrors(d), []);
  assert.equal(LE.validateLessonEvents(d), true);
  // 검토 문서 (tools/events_doc.mjs) 도 오류 없이 만든다 — 표 칸의 | 는 \|
  const doc = buildEventsDoc(d);
  assert.match(doc, /^#### ev_fixture — 시험 이벤트$/m);
  assert.match(doc, /^- 트리거: 주 끝 · 주 1~14 · 시즌 1~3 · 조건 없음 · 가중치 2 · 1회용$/m);
  assert.match(doc, /^> \(반말판: "감독, 오늘 밤 슈팅 좀 더 찬다\."\)$/m);
  // 효과 칸 = 엔진 미리보기 (lessonEffects.describe) — 예시 주인공 (FW · MF 중 하나) 이름으로
  const ex = doc.match(/^- 주인공: FW · MF 중 무작위 \(결장 제외\) \(예시: (.+)\)$/m);
  assert.ok(ex, "예시 주인공");
  const nm = ex[1];
  assert.ok(doc.includes(`| 70%: ${nm} 슈팅 +30 / 30%: ${nm} 슈팅 +30, ${nm} 체력 −40, ${nm} 다음 레슨 1회 결장 |`), "random 미리보기");
  assert.match(doc, /\{선수\\\|은\/는\} 슈팅이/);
  assert.match(doc, /덱에 「인터벌 슈팅」 추가, 하르나 유대 \+15/);
  // 주인공이 정해진 이벤트 (이야기 · 짝) 는 그 선수 — 이야기 3화 A = 네리아 고유 카드 강화판
  assert.match(doc, /\| 같이 듣는다 \| 네리아 고유 카드 「물결 세이브 루틴」 이번 런 동안 강화판, 컨디션 \+1 \|/);
  assert.match(doc, /\| 끝까지 본다 \| 울리카 패스 \+15, 그레타 · 막판 집중 힌트 1 \|/);
  assert.match(doc, /- \*\*네리아\*\* \(`ch_spirit_keeper`\) — 호수를 떠난 정령/);
  assert.ok(!/undefined|\?\s\|/.test(doc), "빈 칸 없음");
});

/**
 * 잘못된 본보기 하나 = 규칙 하나 (§24.3.7). [이름, 데이터를 만드는 함수, 오류 문장 정규식, 오류 수 (기본 1)].
 * 오류 줄은 "<파일>.json <이벤트 id>: …" (파일 단위 오류는 "<파일>.json: …").
 */
const W = (patch) => withEvents([{ ...clone(WEEK_OK), ...patch }]);
const WC = (ci, patch) => {
  const ev = clone(WEEK_OK);
  ev.choices[ci] = { ...ev.choices[ci], ...patch };
  return withEvents([ev]);
};
const plain = (patch = {}) => ({ ...clone(WEEK_OK), alt: undefined, choices: [
  { label: "A", effects: [{ type: "teamwork", amount: 5 }], result: "가." },
  { label: "B", effects: [{ type: "condition", amount: 1 }], result: "나." }], ...patch });
const drop = (ev, ...keys) => {
  const out = clone(ev);
  for (const k of keys) delete out[k];
  return out;
};
const BAD = [
  ["파일: events 가 배열이 아니다", () => { const d = withEvents([]); d.lesson_ev_week.events = {}; return d; }, /^lesson_ev_week\.json: events 는 배열이다$/],
  ["파일: version", () => { const d = withEvents([WEEK_OK]); d.lesson_ev_week.version = 2; return d; }, /^lesson_ev_week\.json: version 은 1/],
  ["파일: 모르는 키", () => { const d = withEvents([WEEK_OK]); d.lesson_ev_week.extra = 1; return d; }, /^lesson_ev_week\.json: 파일에 모르는 키 'extra'/],
  ["파일: notes 의 id", () => { const d = withEvents([WEEK_OK]); d.lesson_ev_week.notes = { ch_nobody: { arc: "x" } }; return d; }, /notes 'ch_nobody': 캐릭터 · 코치 id 가 아니다/],
  ["id 꼴", () => W({ id: "Ev-Fixture" }), /^lesson_ev_week\.json Ev-Fixture: id 꼴이 틀렸다/],
  ["id 겹침 (파일 7개 전체)", () => { const d = withEvents([WEEK_OK]); d.lesson_ev_fixed.events = [clone(WEEK_OK)]; return d; }, /^lesson_ev_fixed\.json ev_fixture: id 가 겹친다 \(lesson_ev_week\.json 에도 있다\)/],
  ["trigger 값", () => W({ trigger: "random" }), /^lesson_ev_week\.json ev_fixture: trigger 'random' — 쓸 수 있는 것/],
  ["트리거별 꼭 있는 키 (route → routeId)", () => withEvents([drop({ ...clone(WEEK_OK), trigger: "route" }, "weeks", "seasons", "once", "weight")]), /루트 이벤트에는 'routeId' 가 꼭 있다/],
  ["옛 키 (minTurnIndex)", () => W({ minTurnIndex: 3 }), /모르는 키 'minTurnIndex' — 옛 events\.json 키 → weeks/],
  ["트리거에 없는 키 (seasonStart 의 weight)", () => withEvents([{ ...drop(clone(MISC_OK[0])), weight: 2 }]), /시즌 시작 이벤트에 모르는 키 'weight'/],
  ["title 비었다", () => W({ title: " " }), /title 이 비었다/],
  ["text 비었다", () => W({ text: "", alt: undefined }), /text \(본문\) 가 비었다/],
  ["선택지 label 비었다", () => WC(1, { label: "" }), /choices\[1\]\.label \(감독의 결정\) 이 비었다/],
  ["result 비었다", () => WC(1, { result: "" }), /choices\[1\]\.result \(결과 문구\) 가 비었다/],
  ["옛 선택지 키 (preview)", () => WC(1, { preview: "컨디션 +1" }), /choices\[1\]: 모르는 키 'preview' — 미리보기는 효과에서 자동/],
  ["모르는 자리표시 ({player})", () => W({ text: "{player}가 왔다.\n\"…\"" }), /text: 모르는 자리표시 '\{player\}'/],
  ["조사 꼴 ({선수|의/의})", () => W({ title: "{선수|의/의} 밤" }), /title: '\{선수\|의\/의\}': 모르는 조사 꼴/],
  ["조사 역슬래시 ({선수\\|이/가})", () => WC(1, { result: "{선수\\|이/가} 돌아갑니다." }), /역슬래시 없이/],
  ["손으로 붙인 조사 ({선수}가)", () => WC(1, { result: "{선수}가 돌아갑니다." }), /'\{선수\}가' — 조사는 이름에 따라 바뀐다/],
  ["주인공 없음 + {선수}", () => withEvents([drop(plain({ title: "{선수}의 밤" }), "who", "alt")]), /\{선수\} 를 쓰는데 주인공이 없다/],
  ["{코치} — 코치 없는 이벤트", () => W({ title: "{코치}의 밤" }), /\{코치\} 는 코치 연속 이벤트 · coach 키/],
  ["result 갈래인데 random 없음", () => WC(1, { result: { then: "가.", else: "나." } }), /choices\[1\]\.result 가 갈래 \(\{ then, else \}\) 인데 선택지 맨 위에 random 이 없다/, 2],
  ["random 인데 result 가 문자열", () => { const d = WC(0, { result: "가." }); d.lesson_ev_week.events[0].alt.banmal.results[0] = "가."; return d; }, /choices\[0\]: random 이 있으면 result 는 갈래마다/],
  ["반말판 results 길이", () => { const d = W({}); d.lesson_ev_week.events[0].alt.banmal.results.pop(); return d; }, /alt\.banmal\.results 길이 1 ≠ 선택지 수 2/],
  ["반말판 갈래 모양", () => { const d = W({}); d.lesson_ev_week.events[0].alt.banmal.results[0] = "가."; return d; }, /alt\.banmal\.results\[0\]: 기본 result 가 갈래/],
  ["주인공 없는 이벤트의 반말판", () => withEvents([drop({ ...plain(), alt: { banmal: { text: "울타리 너머가 소란해.", results: ["가.", "나."] } }, text: "울타리 너머가 소란합니다." }, "who")]), /반말판을 쓰지 않는다/],
  ["선택지 3개", () => { const ev = clone(WEEK_OK); ev.choices.push(clone(ev.choices[1])); delete ev.alt; return withEvents([ev]); }, /선택지는 정확히 2개 \(지금 3개\)/],
  ["모르는 효과 type", () => WC(1, { effects: [{ type: "boost", amount: 1 }] }), /choices\[1\]\.effects\[0\]: 모르는 효과 type 'boost'/],
  ["효과의 꼭 있는 키 (stat amount)", () => WC(1, { effects: [{ type: "stat", target: "player", stat: "pass" }] }), /'stat' 에 'amount' 가 없다/],
  ["효과의 옛 키 (injury turns)", () => WC(1, { effects: [{ type: "injury", target: "player", turns: 2 }] }), /모르는 키 'turns' — 결장은 레슨 1회뿐이라/],
  ["효과 값 (stat 이름)", () => WC(1, { effects: [{ type: "stat", target: "team", stat: "speed", amount: 5 }] }), /stat 의 stat 'speed'/],
  ["레슨 안 효과를 주 끝 이벤트에", () => WC(1, { effects: [{ type: "nextPct", pct: 20 }] }), /'nextPct' 는 주 끝 랜덤 이벤트에서 쓸 수 없다 — 레슨 안 효과는 깜짝 이벤트 전용/],
  ["깜짝에 허용되지 않은 런 효과 (sp)", () => { const ev = clone(SURPRISE_OK); ev.choices[0].effects = [{ type: "sp", amount: 10 }]; return withEvents([ev], "lesson_ev_surprise"); }, /'sp' 는 레슨 깜짝 이벤트에서 쓸 수 없다 — 깜짝 이벤트가 쓸 수 있는 런 효과는/],
  ["random 안의 random", () => { const d = W({}); d.lesson_ev_week.events[0].choices[0].effects[0].then = [{ type: "random", chance: 0.5, then: [], else: [{ type: "tp", amount: 5 }] }]; return d; }, /effects\[0\]\.then\[0\]: random 안에 random 을 넣지 않는다/],
  ["맨 위 random 두 개", () => { const d = W({}); const c = d.lesson_ev_week.events[0].choices[0]; c.effects.push(clone(c.effects[0])); return d; }, /choices\[0\]: random 은 선택지 맨 위에 하나까지 \(지금 2개\)/],
  ["random chance 범위", () => { const d = W({}); d.lesson_ev_week.events[0].choices[0].effects[0].chance = 70; return d; }, /random 의 chance 는 0 과 1 사이/],
  ["relic + rewardOffer 한 선택지", () => WC(1, { effects: [{ type: "relic" }, { type: "rewardOffer" }] }), /relic 과 rewardOffer 를 같이 쓰지 않는다/],
  ["cardPick 두 개 (갈래를 합쳐서 — E2)", () => { const d = W({}); d.lesson_ev_week.events[0].choices[0].effects[0].else.push({ type: "cardPick", op: "delete" }); d.lesson_ev_week.events[0].choices[0].effects[0].then.push({ type: "cardPick", op: "upgrade" }); return d; }, /choices\[0\]: cardPick 은 한 선택지에 하나까지 \(갈래를 합쳐서 — 고르는 카드는 한 장, 지금 2개\)/],
  ["없는 캐릭터 (chars)", () => W({ chars: ["ch_nobody"] }), /chars: 없는 캐릭터 'ch_nobody'/],
  ["who.charId 가 편성 조건에 없다", () => W({ who: { pick: "char", charId: "ch_spirit_keeper" } }), /who\.charId 'ch_spirit_keeper' 는 편성 조건에도 적는다/],
  ["who.pick 트리거 (주 끝에 partner)", () => W({ who: { pick: "partner" } }), /who\.pick 'partner' 는 주 끝 랜덤 이벤트에서 쓸 수 없다/],
  ["playerHint 에 액티브", () => withEvents([{ ...clone(MISC_OK[4]), choices: [{ ...clone(MISC_OK[4].choices[0]), effects: [{ type: "playerHint", target: "char:ch_giant_striker", skillId: "sk_power_shot" }] }, clone(MISC_OK[4].choices[1])] }]), /'sk_power_shot' \(파워 슛\) 는 패시브가 아니다/],
  ["playerHint 가 그 선수 목록 밖", () => withEvents([{ ...clone(MISC_OK[4]), choices: [{ ...clone(MISC_OK[4].choices[0]), effects: [{ type: "playerHint", target: "char:ch_giant_striker", skillId: "sk_flank_run" }] }, clone(MISC_OK[4].choices[1])] }]), /'sk_flank_run' \(.+\) 는 그레타의 패시브 목록/],
  ["playerHint skillId — 주인공이 정해지지 않은 이벤트 (R3)", () => WC(1, { effects: [{ type: "playerHint", skillId: "sk_big_game" }] }), /주인공이 정해지지 않은 이벤트는 skillId 없이 쓴다/],
  ["teach 에 패시브", () => WC(1, { effects: [{ type: "teach", skillId: "sk_big_game" }] }), /teach 의 'sk_big_game' \(.+\) 는 액티브가 아니다/],
  ["teach — 그 코치가 가르치지 않는 액티브", () => WC(1, { effects: [{ type: "teach", skillId: "sk_rally_cry", supportId: "sp_coach_harr" }] }), /코치 하르나는 'sk_rally_cry' \(함성\) 를 가르치지 않는다/],
  ["teach — 선수 전용 이벤트 (R4)", () => withEvents([{ ...clone(MISC_OK[4]), choices: [{ ...clone(MISC_OK[4].choices[0]), effects: [{ type: "teach", skillId: "sk_rally_cry" }] }, clone(MISC_OK[4].choices[1])] }]), /선수 전용 · 이야기 이벤트는 액티브 수업 \(teach\) 을 주지 않는다/],
  ["cardAdd 고유 카드", () => WC(1, { effects: [{ type: "cardAdd", cardId: "cd_u_neria" }] }), /cardAdd 의 'cd_u_neria' 는 고유 카드/],
  ["cardAdd 없는 카드", () => WC(1, { effects: [{ type: "cardAdd", cardId: "cd_nothing" }] }), /cardAdd 의 cardId 'cd_nothing': 없는 카드/],
  ["modifier key", () => WC(1, { effects: [{ type: "modifier", key: "intentReveal", amount: 1, duration: "season" }] }), /modifier 의 key 'intentReveal'/],
  ["modifier duration", () => WC(1, { effects: [{ type: "modifier", key: "shootPower", amount: 0.05, duration: "match" }] }), /modifier 의 duration 'match' — season · run 만/],
  ["옛 효과 summonTicket", () => WC(1, { effects: [{ type: "summonTicket", amount: 1 }] }), /옛 효과 'summonTicket' 는 레슨 런에서 쓰지 않는다 — 호출권/],
  ["옛 효과 hint (무작위 풀)", () => WC(1, { effects: [{ type: "hint", skill: "random", level: 1 }] }), /옛 효과 'hint'/],
  ["주인공 없는 이벤트의 target player", () => withEvents([drop(plain({ choices: [{ label: "A", effects: [{ type: "stat", target: "player", stat: "pass", amount: 5 }], result: "가." }, { label: "B", effects: [{ type: "tp", amount: 5 }], result: "나." }], text: "비가 옵니다." }), "who", "alt")]), /'stat' 가 주인공 \(player\) 을 가리키는데 이 이벤트는 주인공이 없다/],
  ["char:<id> 대상 — 편성 보장 없음", () => WC(1, { effects: [{ type: "stat", target: "char:ch_spirit_keeper", stat: "pass", amount: 5 }] }), /target 'char:ch_spirit_keeper': 편성이 보장되지 않은 선수/],
  ["bond coach — 코치 없는 이벤트", () => WC(1, { effects: [{ type: "bond", target: "coach", amount: 5 }] }), /bond 의 target 'coach' — 이 이벤트에는 코치가 없다/],
  ["scene", () => W({ scene: "beach" }), /scene 'beach' — title · ground/],
  ["weeks 범위", () => W({ weeks: [0, 15] }), /weeks 는 \[a, b\] \(주 번호 turnIndex 0 ~ 14/],
  ["seasons 값", () => W({ seasons: [0, 1] }), /seasons 는 시즌 \(1 ~ 3\) 배열/],
  ["once 값", () => W({ once: true }), /once true — "run" \(기본\)/],
  ["seasonStart 의 seasons 는 하나", () => withEvents([{ ...clone(MISC_OK[0]), seasons: [1, 2] }]), /시즌 시작 이벤트의 seasons 는 시즌 하나/],
  ["없는 루트", () => withEvents([{ ...clone(MISC_OK[2]), routeId: "rt_beach" }]), /routeId: 없는 루트 'rt_beach'/],
  ["주 끝 cond 에 깜짝 조건 키", () => W({ cond: { failedThisTurn: true } }), /cond 에 모르는 키 'failedThisTurn' — 레슨 깜짝 전용 조건/],
  ["깜짝 cond 없음", () => withEvents([drop(SURPRISE_OK, "cond")], "lesson_ev_surprise"), /레슨 깜짝 이벤트에는 'cond' 가 꼭 있다/, 3],
  ["깜짝 cond 모르는 키", () => withEvents([{ ...clone(SURPRISE_OK), cond: { coachCardOkThisTurn: true, lowStamina: 30 } }], "lesson_ev_surprise"), /cond 에 모르는 키 'lowStamina' — 깜짝 조건은 §24\.8 표의 키만/],
  ["깜짝 cond.char 모르는 키", () => withEvents([{ ...clone(SURPRISE_POLICY_OK), cond: { ...clone(SURPRISE_POLICY_OK.cond), char: { id: "ch_spirit_keeper", happy: true } } }], "lesson_ev_surprise"), /cond\.char: 모르는 키 'happy'/],
  ["방침 버프 조건에 policy 없음", () => withEvents([drop(SURPRISE_POLICY_OK, "policy")], "lesson_ev_surprise"), /cond\.buffAtLeast: 방침 버프 조건은 이벤트 맨 위 policy 와 같이 쓴다/],
  ["이야기 묶음이 모자람 (1화만)", () => withEvents([STORY_OK[0]], "lesson_ev_story"), /이야기 네리아 \(ch_spirit_keeper\) 묶음이 모자란다 — 2화 · 3화가 없다/],
  ["이야기 teach (R4)", () => { const s = clone(STORY_OK); s[1].choices[0].effects = [{ type: "teach", skillId: "sk_power_shot" }]; return withEvents(s, "lesson_ev_story"); }, /out_fixture_2: choices\[0\]\.effects\[0\]: 선수 전용 · 이야기 이벤트는 액티브 수업/],
  ["코치 연속 묶음이 모자람 (3단계 없음)", () => withEvents(COACH_OK.slice(0, 2), "lesson_ev_coach"), /코치 연속 코치 하르나 \(sp_coach_harr\) 묶음이 모자란다 — 3단계가 없다/],
  ["코치 연속 bondAtLeast ↔ 단계", () => { const c = clone(COACH_OK); c[1].bondAtLeast = 80; return withEvents(c, "lesson_ev_coach"); }, /bondAtLeast 는 2단계면 40/],
  ["lesson.json 말투 표", () => { const d = withEvents([WEEK_OK]); d.lesson.events.speech.ch_dwarf_wall = "rude"; return d; }, /^lesson\.json events\.speech\.ch_dwarf_wall: banmal · polite 만/],
];

test(`검사: 잘못된 본보기 ${BAD.length}개 — 규칙마다 막고 "파일 이벤트: 이유" 한국어 한 줄`, () => {
  assert.ok(BAD.length >= 20);
  for (const [name, make, re, count = 1] of BAD) {
    const d = make();
    const errs = LE.lessonEventErrors(d);
    assert.equal(errs.length, count, `${name}: 오류 ${count}개여야 한다 — ${JSON.stringify(errs, null, 1)}`);
    assert.ok(errs.some((e) => re.test(e)), `${name}: ${re} — ${JSON.stringify(errs, null, 1)}`);
    for (const e of errs) assert.match(e, /^(lesson_ev_[a-z_]+\.json( [A-Za-z0-9_\-[\]]+)?|lesson\.json events\.speech[.a-z_]*): \S/, `${name}: 파일 · 이벤트를 적은 줄 — ${e}`);
    assert.throws(() => LE.validateLessonEvents(d), (err) => {
      assert.match(err.message, /^레슨 이벤트 데이터: 오류 \d+개\n- /, name);
      assert.ok(err.message.includes(errs[0]), name);
      return true;
    });
  }
});

test("검사: 오류를 모두 모아 한 번에 던진다 (한 줄에 하나 · 파일과 이벤트 id)", () => {
  const ev = clone(WEEK_OK);
  ev.title = "";
  ev.scene = "beach";
  ev.choices[1].effects = [{ type: "summonTicket" }];
  const other = { ...clone(WEEK_OK), id: "ev_other", weeks: [3, 1] };
  const d = withEvents([ev, other]);
  d.lesson_ev_coach.events = [clone(COACH_OK[0])];
  let msg = "";
  assert.throws(() => LE.validateLessonEvents(d), (e) => { msg = e.message; return true; });
  const lines = msg.split("\n");
  assert.equal(lines[0], "레슨 이벤트 데이터: 오류 5개");
  assert.equal(lines.length, 6);
  assert.ok(lines.some((l) => l.startsWith("- lesson_ev_week.json ev_fixture: title 이 비었다")));
  assert.ok(lines.some((l) => l.startsWith("- lesson_ev_week.json ev_fixture: scene 'beach'")));
  assert.ok(lines.some((l) => l.startsWith("- lesson_ev_week.json ev_fixture: choices[1].effects[0]: 옛 효과 'summonTicket'")));
  assert.ok(lines.some((l) => l.startsWith("- lesson_ev_week.json ev_other: weeks 는")));
  assert.ok(lines.some((l) => l.startsWith("- lesson_ev_coach.json ev_coach_fixture_1: 코치 연속 코치 하르나 (sp_coach_harr) 묶음이 모자란다 — 2단계 · 3단계가 없다")));
});

// ===========================================================================
// E2 — 효과 적용 · 미리보기 · 대체값 · 주인공 · 띄우기 · 뷰 · 고르기 · 3택1 · 기대값 (§24.4 · §24.5 · §24.11)
// 테스트 안의 고정 이벤트 + 데이터 사본 (기능 스위치는 꺼 둔 채 — 흐름 단계는 E3, 여기서는 fireEvent 로 바로 띄운다).
// 기본 편성: p1 네리아 GK · p2 도르비나 DF (반말) · p3 아델린 DF · p4 실루엔 MF · p5 타리아 MF · p6 울리카 FW · p7 그레타 FW,
// 코치: 하르나 · 셀리아 · 오르넬라 · 바르바라 · 한나 · 루미.
// ===========================================================================

const P = (s, id) => s.players.find((p) => p.id === id);
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const run0 = (d = data, seed = 7) => LR.createRun({ data: d, seed });
const cardName = (id) => data.cards.cards.find((c) => c.id === id).name;
const skillName = (id) => data.skills.find((k) => k.id === id).name;

/** 효과를 바로 적용 (rng 를 열고 저장 — lessonEvents.resolveEvent 와 같게). 기본 주인공 p1 */
function apply(s, effects, ctx = {}, d = data) {
  const rng = createRngFromState(s.rngState);
  const out = LF.applyEffects(s, d, effects, { playerId: "p1", ...ctx }, rng);
  s.rngState = rng.getState();
  return out;
}
const desc = (s, effects, ctx = {}, d = data) => LF.describe(s, d, effects, { playerId: "p1", ...ctx });

/** 실패하는 호출은 상태를 바꾸지 않는다 */
function rejects(state, fn, re) {
  const before = JSON.stringify(state);
  assert.throws(fn, re);
  assert.equal(JSON.stringify(state), before, "상태 그대로");
}

test("E2 효과: stat (player · team · char · main · main2 · random) · stamina · condition · goalCondition · teamwork · sp · tp — 미리보기 = 적용, 범위 (statCap · 0 ~ 100 · 0 ~ 4)", () => {
  const s = run0();
  const cap = data.config.statCap;
  // stat
  assert.deepEqual(desc(s, [{ type: "stat", target: "player", stat: "shoot", amount: 15 }]), { text: "네리아 슈팅 +15", lines: ["네리아 슈팅 +15"] });
  const sh = P(s, "p1").stats.shoot;
  assert.deepEqual(apply(s, [{ type: "stat", target: "player", stat: "shoot", amount: 15 }]), { branch: null, lines: ["네리아 슈팅 +15"] });
  assert.equal(P(s, "p1").stats.shoot, sh + 15);
  const passes = s.players.map((p) => p.stats.pass);
  assert.equal(desc(s, [{ type: "stat", target: "team", stat: "pass", amount: 6 }]).text, "7명 패스 +6");
  apply(s, [{ type: "stat", target: "team", stat: "pass", amount: 6 }]);
  s.players.forEach((p, i) => assert.equal(p.stats.pass, passes[i] + 6, p.name));
  // main2 = cards.mainStatsOf(배치 포지션) — 그레타 FW: 슈팅 · 드리블
  assert.equal(desc(s, [{ type: "stat", target: "char:ch_giant_striker", stat: "main2", amount: 10 }]).text, "그레타 주 스탯 2개 (슈팅 · 드리블) +10씩");
  const g = { ...P(s, "p7").stats };
  assert.deepEqual(apply(s, [{ type: "stat", target: "char:ch_giant_striker", stat: "main2", amount: 10 }]).lines, ["그레타 슈팅 · 드리블 +10씩"]);
  assert.deepEqual([P(s, "p7").stats.shoot - g.shoot, P(s, "p7").stats.dribble - g.dribble, P(s, "p7").stats.pass - g.pass], [10, 10, 0]);
  // main = 포지션 주 스탯 1개 (GK = 수비)
  assert.equal(desc(s, [{ type: "stat", target: "player", stat: "main", amount: 5 }]).text, "네리아 주 스탯 (수비) +5");
  // random = 5스탯 중 하나 (rng)
  const before = Object.values(P(s, "p3").stats).reduce((a, b) => a + b, 0);
  assert.equal(desc(s, [{ type: "stat", target: "player", stat: "random", amount: 7 }], { playerId: "p3" }).text, "아델린 무작위 스탯 +7");
  const rl = apply(s, [{ type: "stat", target: "player", stat: "random", amount: 7 }], { playerId: "p3" }).lines[0];
  assert.match(rl, /^아델린 (슈팅|드리블|패스|수비|피지컬) \+7$/);
  assert.equal(Object.values(P(s, "p3").stats).reduce((a, b) => a + b, 0), before + 7);
  // 상한 · 0
  P(s, "p1").stats.pass = cap - 3;
  apply(s, [{ type: "stat", target: "player", stat: "pass", amount: 10 }]);
  assert.equal(P(s, "p1").stats.pass, cap);
  P(s, "p1").stats.dribble = 4;
  apply(s, [{ type: "stat", target: "player", stat: "dribble", amount: -10 }]);
  assert.equal(P(s, "p1").stats.dribble, 0);
  // stamina: 0 ~ 100 · 완전 회복
  P(s, "p2").stamina = 50;
  assert.equal(desc(s, [{ type: "stamina", target: "player", full: true }], { playerId: "p2" }).text, "도르비나 체력 완전 회복");
  apply(s, [{ type: "stamina", target: "player", amount: 60 }], { playerId: "p2" });
  assert.equal(P(s, "p2").stamina, 100);
  P(s, "p2").stamina = 30;
  apply(s, [{ type: "stamina", target: "player", full: true }], { playerId: "p2" });
  assert.equal(P(s, "p2").stamina, 100);
  for (const p of s.players) p.stamina = 5;
  assert.equal(desc(s, [{ type: "stamina", target: "team", amount: -10 }]).text, "7명 체력 −10");
  apply(s, [{ type: "stamina", target: "team", amount: -10 }]);
  assert.ok(s.players.every((p) => p.stamina === 0));
  // condition 0 ~ 4 · teamwork 0 ~ 100
  s.condition = 3;
  assert.deepEqual(apply(s, [{ type: "condition", amount: 2 }]).lines, ["컨디션 +2"]);
  assert.equal(s.condition, 4);
  s.teamwork = 98;
  apply(s, [{ type: "teamwork", amount: 5 }]);
  assert.equal(s.teamwork, 100);
  // goalCondition = 이번 시즌 경계전 1회 (대비 레슨 보너스와 같은 꼴)
  assert.equal(desc(s, [{ type: "goalCondition", amount: 1 }]).text, "다음 경계전 1회만 컨디션 +1");
  apply(s, [{ type: "goalCondition", amount: 1 }], { eventId: "ev_x" });
  assert.deepEqual(s.modifiers.at(-1), { key: "goalMatchCondition", amount: 1, untilSeason: 1, source: "event:ev_x" });
  // sp: × (1 + skillPointGain) · tp: 0 아래로 안 간다
  s.modifiers.push({ key: "skillPointGain", amount: 0.5, untilSeason: null });
  const sp0 = s.skillPoints;
  assert.equal(desc(s, [{ type: "sp", amount: 10 }]).text, "SP +15");
  apply(s, [{ type: "sp", amount: 10 }]);
  assert.equal(s.skillPoints, sp0 + 15);
  s.trainingPoints = 5;
  assert.equal(desc(s, [{ type: "tp", amount: -10 }]).text, "TP −10");
  apply(s, [{ type: "tp", amount: -10 }]);
  assert.equal(s.trainingPoints, 0);
});

test("E2 효과: bond (all · coach · 코치 id · bondGain · 0 ~ 100 · 편성 안 된 코치) · modifier (시즌 · 런 · 전야 문구)", () => {
  const s = run0();
  const b = (id) => s.supports.find((x) => x.id === id).bond;
  const b0 = s.supports.map((x) => x.bond);
  assert.equal(desc(s, [{ type: "bond", target: "all", amount: 5 }]).text, "편성 코치 전원 유대 +5");
  apply(s, [{ type: "bond", target: "all", amount: 5 }]);
  s.supports.forEach((x, i) => assert.equal(x.bond, b0[i] + 5));
  assert.equal(desc(s, [{ type: "bond", target: "coach", amount: 10 }], { supportId: "sp_wind_dancer" }).text, "셀리아 유대 +10");
  const c0 = b("sp_wind_dancer");
  apply(s, [{ type: "bond", target: "coach", amount: 10 }], { supportId: "sp_wind_dancer" });
  assert.equal(b("sp_wind_dancer"), c0 + 10);
  // bondGain 은 양수에 더한다 (effects.js 와 같다)
  s.modifiers.push({ key: "bondGain", amount: 2, untilSeason: null });
  const h0 = b("sp_coach_harr");
  assert.equal(desc(s, [{ type: "bond", target: "sp_coach_harr", amount: 15 }]).text, "하르나 유대 +17");
  apply(s, [{ type: "bond", target: "sp_coach_harr", amount: 15 }]);
  assert.equal(b("sp_coach_harr"), h0 + 17);
  apply(s, [{ type: "bond", target: "sp_coach_harr", amount: 100 }]);
  assert.equal(b("sp_coach_harr"), 100);
  // 편성되지 않은 코치: 미리보기에 적고 적용은 아무것도 하지 않는다
  assert.equal(desc(s, [{ type: "bond", target: "sp_street_striker", amount: 5 }]).text, "조이 유대 +7 (편성되지 않아 효과 없음)");
  const snap = JSON.stringify(s.supports);
  assert.deepEqual(apply(s, [{ type: "bond", target: "sp_street_striker", amount: 5 }]).lines, []);
  assert.equal(JSON.stringify(s.supports), snap);
  // modifier: { key, amount, untilSeason } — season = 이번 시즌, run = null
  assert.equal(desc(s, [{ type: "modifier", key: "trainingEfficiency", amount: 0.1, duration: "season" }]).text, "이번 시즌 레슨 상승 +10%");
  assert.equal(desc(s, [{ type: "modifier", key: "gaanpaTicket", amount: 1, duration: "season" }], { trigger: "preMatch" }).text, "이번 경계전 간파 사용권 1");
  assert.equal(desc(s, [{ type: "modifier", key: "shootPower", amount: 0.05, duration: "run" }]).text, "런 동안 경기 슛 위력 +5%");
  apply(s, [{ type: "modifier", key: "trainingEfficiency", amount: 0.1, duration: "season" }, { type: "modifier", key: "shootPower", amount: 0.05, duration: "run" }], { eventId: "ev_m" });
  assert.deepEqual(s.modifiers.slice(-2), [
    { key: "trainingEfficiency", amount: 0.1, untilSeason: 1, source: "event:ev_m" },
    { key: "shootPower", amount: 0.05, untilSeason: null, source: "event:ev_m" },
  ]);
});

test("E2 효과: injury (레슨 1회 · 이미 결장이면 체력 −20, 미리보기도 · randomPlayer = 결장 아닌 선수) · heal (주인공 · 전원)", () => {
  const s = run0();
  assert.equal(desc(s, [{ type: "injury" }], { playerId: "p5" }).text, "타리아 다음 레슨 1회 결장");
  assert.deepEqual(apply(s, [{ type: "injury" }], { playerId: "p5" }).lines, ["타리아 다음 레슨 1회 결장"]);
  assert.equal(P(s, "p5").injuredTurns, 1);
  // 이미 결장 → 결장 대신 체력 −20 (lesson.json events.fallback.injuredStamina)
  assert.equal(data.lesson.events.fallback.injuredStamina, -20);
  P(s, "p5").stamina = 70;
  assert.equal(desc(s, [{ type: "injury", target: "player" }], { playerId: "p5" }).text, "타리아 체력 −20 (이미 결장 중)");
  assert.deepEqual(apply(s, [{ type: "injury", target: "player" }], { playerId: "p5" }).lines, ["타리아 체력 −20 (이미 결장 중)"]);
  assert.deepEqual([P(s, "p5").injuredTurns, P(s, "p5").stamina], [1, 50]);
  // 무작위 1명: 결장 아닌 선수 중
  for (const p of s.players) if (p.id !== "p3" && p.id !== "p5") p.injuredTurns = 1;
  assert.match(desc(s, [{ type: "injury", target: "randomPlayer" }]).text, /^무작위 1명 다음 레슨 1회 결장 \(이미 결장이면 체력 −20\)$/);
  assert.deepEqual(apply(s, [{ type: "injury", target: "randomPlayer" }]).lines, ["아델린 다음 레슨 1회 결장"]);
  // heal
  assert.equal(desc(s, [{ type: "heal", target: "all" }]).text, "결장 중인 선수 전원 결장 해제 (7명)");
  apply(s, [{ type: "heal", target: "player" }], { playerId: "p5" });
  assert.equal(P(s, "p5").injuredTurns, 0);
  apply(s, [{ type: "heal", target: "all" }]);
  assert.ok(s.players.every((p) => p.injuredTurns === 0));
  assert.equal(desc(s, [{ type: "heal", target: "all" }]).text, "결장 중인 선수 전원 결장 해제 (지금은 없음)");
});

test("E2 효과: 덱 — cardAdd (+ 코치 카드 유대 +15) · cardPick (상담과 같은 후보 · uid 검사 · 대체 TP +10) · cardUpgradeRandom · uniquePlus (대체 TP +20)", () => {
  const s = run0();
  const deck0 = s.deck.length;
  // cardAdd
  assert.equal(desc(s, [{ type: "cardAdd", cardId: "cd_one_two" }]).text, `덱에 「${cardName("cd_one_two")}」 추가`);
  assert.equal(desc(s, [{ type: "cardAdd", cardId: "cd_c_harr" }]).text, `덱에 「${cardName("cd_c_harr")}」 추가, 하르나 유대 +15`);
  assert.equal(desc(s, [{ type: "cardAdd", cardId: "cd_c_joy" }]).text, `덱에 「${cardName("cd_c_joy")}」 추가`, "편성 안 된 코치 카드 = 유대 없음");
  const hb = s.supports.find((x) => x.id === "sp_coach_harr").bond;
  apply(s, [{ type: "cardAdd", cardId: "cd_one_two", plus: true }, { type: "cardAdd", cardId: "cd_c_harr" }]);
  assert.equal(s.deck.length, deck0 + 2);
  assert.deepEqual(s.deck.slice(-2).map((e) => [e.cardId, e.plus]), [["cd_one_two", true], ["cd_c_harr", false]]);
  assert.equal(s.supports.find((x) => x.id === "sp_coach_harr").bond, hb + 15);
  // cardPick 강화: 후보 = upgradable (강화 안 됨 · 강화 가능)
  const needs = LF.effectNeeds(s, data, [{ type: "cardPick", op: "upgrade" }]);
  assert.equal(needs.op, "upgrade");
  const upg = s.deck.filter((e) => !e.plus && canUpgrade(getCard(data, e.cardId)));
  assert.deepEqual(needs.candidates.map((c) => c.uid), upg.map((e) => e.uid));
  assert.deepEqual(Object.keys(needs.candidates[0]).sort(), ["cardId", "name", "plus", "uid"]);
  assert.equal(desc(s, [{ type: "cardPick", op: "upgrade" }]).text, "덱의 카드 1장 강화 (고른다)");
  rejects(s, () => apply(s, [{ type: "tp", amount: 5 }, { type: "cardPick", op: "upgrade" }]), /덱의 카드 1장을 골라야 합니다 \(강화 — uid\)/);
  const plusUid = s.deck.find((e) => e.plus).uid;
  rejects(s, () => apply(s, [{ type: "cardPick", op: "upgrade" }], { uid: plusUid }), /고를 수 없습니다 \(강화 후보가 아님\)/);
  const target = needs.candidates[0];
  assert.deepEqual(apply(s, [{ type: "cardPick", op: "upgrade" }], { uid: target.uid }).lines, [`「${target.name}+」 강화`]);
  assert.equal(s.deck.find((e) => e.uid === target.uid).plus, true);
  // cardPick 삭제: 덱이 minDeck (5) 아래로 줄지 않게
  const del = s.deck[0];
  apply(s, [{ type: "cardPick", op: "delete" }], { uid: del.uid });
  assert.ok(!s.deck.some((e) => e.uid === del.uid));
  const small = run0();
  small.deck = small.deck.slice(0, data.lesson.consult.minDeck);
  assert.deepEqual(LF.effectNeeds(small, data, [{ type: "cardPick", op: "delete" }]).candidates, []);
  assert.equal(desc(small, [{ type: "cardPick", op: "delete" }]).text, "TP +10 (덱이 5장 아래로 줄지 않아 삭제할 카드 없음)");
  const tp0 = small.trainingPoints;
  assert.deepEqual(apply(small, [{ type: "cardPick", op: "delete" }]).lines, ["TP +10 (삭제할 카드 없음)"]);
  assert.equal(small.trainingPoints, tp0 + 10);
  // 강화할 카드가 없으면 TP +10 (고르지 않는다)
  for (const e of small.deck) e.plus = true;
  assert.equal(desc(small, [{ type: "cardPick", op: "upgrade" }]).text, "TP +10 (강화할 카드 없음)");
  assert.equal(desc(small, [{ type: "cardUpgradeRandom" }]).text, "TP +10 (강화할 카드 없음)");
  apply(small, [{ type: "cardPick", op: "upgrade" }, { type: "cardUpgradeRandom" }]);
  assert.equal(small.trainingPoints, tp0 + 30);
  // cardUpgradeRandom: 강화할 수 있는 카드 중 하나
  const r = run0();
  const n0 = r.deck.filter((e) => e.plus).length;
  assert.match(apply(r, [{ type: "cardUpgradeRandom" }]).lines[0], /^「.+\+」 강화 \(무작위\)$/);
  assert.equal(r.deck.filter((e) => e.plus).length, n0 + 1);
  // uniquePlus: 그 선수 고유 카드 → 강화판, 이미 강화판 · 덱에 없음 → TP +20
  const u = run0();
  const un = cardName("cd_u_neria");
  assert.equal(desc(u, [{ type: "uniquePlus" }]).text, `네리아 고유 카드 「${un}」 이번 런 동안 강화판`);
  apply(u, [{ type: "uniquePlus" }]);
  assert.equal(u.deck.find((e) => e.cardId === "cd_u_neria").plus, true);
  assert.equal(desc(u, [{ type: "uniquePlus" }]).text, `TP +20 (네리아 고유 카드 「${un}」 이미 강화판)`);
  const t1 = u.trainingPoints;
  assert.deepEqual(apply(u, [{ type: "uniquePlus" }]).lines, ["TP +20 (네리아 고유 카드가 이미 강화판)"]);
  assert.equal(u.trainingPoints, t1 + 20);
  u.deck = u.deck.filter((e) => e.cardId !== "cd_u_dorbina");
  assert.equal(desc(u, [{ type: "uniquePlus", target: "char:ch_dwarf_wall" }]).text, "TP +20 (덱에 도르비나 고유 카드가 없음)");
});

test("E2 효과: rewardOffer → pendingCardOffer · relic → pendingRelicChoices (남은 유물 없음) · 이미 3택1 이 있으면 바꾸기 전에 throw", () => {
  const s = run0();
  assert.equal(desc(s, [{ type: "rewardOffer" }]).text, "보상 카드 3택1");
  apply(s, [{ type: "rewardOffer" }], { eventId: "ev_offer" });
  assert.equal(s.pendingCardOffer.src, "ev_offer");
  assert.equal(s.pendingCardOffer.cards.length, data.lesson.rewards.offer);
  for (const c of s.pendingCardOffer.cards) assert.ok(["add", "upgrade"].includes(c.kind) && typeof c.cardId === "string");
  rejects(s, () => apply(s, [{ type: "tp", amount: 5 }, { type: "rewardOffer" }]), /고르지 않은 보상 카드 3택1 이 이미 있습니다/);
  // relic
  const r = run0();
  apply(r, [{ type: "relic" }]);
  assert.equal(r.pendingRelicChoices.length, 3);
  assert.ok(r.pendingRelicChoices.every((id) => data.relics.some((x) => x.id === id)));
  const all = run0();
  all.relics = data.relics.map((x) => x.id);
  assert.equal(desc(all, [{ type: "relic" }]).text, "유물 3택1 (남은 유물 없음)");
  assert.deepEqual(apply(all, [{ type: "relic" }]).lines, ["유물 3택1 (남은 유물 없음)"]);
  assert.equal(all.pendingRelicChoices, null);
});

test("E2 효과: teach (맡을 코치 · 없으면 코치 힌트 · 남은 레슨 없음 → 런 끝 SP) · coachHint (fielded · coach · id · 후보 없음 → SP +10) · playerHint (이름 · 무작위 · Lv3 → SP +10)", () => {
  const s = run0();
  // supportId 가 있으면 그 코치, 없으면 그 액티브를 가르치는 첫 편성 코치 (함성 = 루미)
  assert.equal(desc(s, [{ type: "teach", skillId: "sk_power_shot", supportId: "sp_coach_harr" }]).text, "코치 수업: 파워 슛 (하르나 — 다음 레슨 보상에서 가르칠 선수를 고른다)");
  assert.equal(desc(s, [{ type: "teach", skillId: "sk_rally_cry" }]).text, "코치 수업: 함성 (루미 — 다음 레슨 보상에서 가르칠 선수를 고른다)");
  apply(s, [{ type: "teach", skillId: "sk_power_shot", supportId: "sp_coach_harr" }, { type: "teach", skillId: "sk_rally_cry" }]);
  assert.deepEqual(s.pendingTeach.map((t) => [t.skillId, t.supportId, t.src, t.result]), [["sk_power_shot", "sp_coach_harr", "event", null], ["sk_rally_cry", "sp_bard_lumi", "event", null]]);
  assert.ok(!("sk_power_shot" in s.hints), "액티브는 힌트 레벨이 아니다");
  // 가르칠 편성 코치가 없는 액티브 (루미 대신 조이 — 함성) → 코치 힌트 (편성 코치 액티브 중 무작위 → 수업)
  const o = LR.createRun({ data, seed: 7, supportIds: ["sp_coach_harr", "sp_wind_dancer", "sp_elder_sage", "sp_iron_captain", "sp_mountain_monk", "sp_street_striker"] });
  const taught = new Set(o.supports.flatMap((st) => data.supports.find((x) => x.id === st.id).teachSkillIds));
  assert.ok(!taught.has("sk_rally_cry"));
  assert.equal(desc(o, [{ type: "teach", skillId: "sk_rally_cry" }]).text, "코치 수업 1 (편성 코치 액티브 중 무작위) — 함성을 가르칠 편성 코치가 없음");
  apply(o, [{ type: "teach", skillId: "sk_rally_cry" }]);
  assert.equal(o.pendingTeach.length, 1);
  assert.ok(taught.has(o.pendingTeach[0].skillId) && o.pendingTeach[0].supportId);
  // coachHint: 그 코치 (coach = 이벤트의 코치) 의 수업 목록에서
  assert.equal(desc(s, [{ type: "coachHint", from: "coach" }], { supportId: "sp_coach_harr" }).text, "코치 수업 1 (하르나 액티브 중 무작위)");
  apply(s, [{ type: "coachHint", from: "coach" }], { supportId: "sp_coach_harr" });
  const last = s.pendingTeach.at(-1);
  assert.equal(last.supportId, "sp_coach_harr");
  assert.ok(["sk_power_shot", "sk_see_through"].includes(last.skillId));
  apply(s, [{ type: "coachHint", from: "sp_elder_sage" }]);
  assert.equal(s.pendingTeach.at(-1).supportId, "sp_elder_sage");
  // 후보가 없으면 SP +10 (미리보기도)
  const d = clone(data);
  for (const sc of d.supports) sc.teachSkillIds = [];
  for (const f of LE.EVENT_FILES) d[f] = EMPTY(); // 실제 콘텐츠는 코치 수업 목록을 참조한다 — 목록을 비우는 이 사본에서는 뺀다
  const n = run0(d);
  assert.equal(desc(n, [{ type: "coachHint", from: "fielded" }], {}, d).text, "SP +10 (가르칠 코치 스킬 없음)");
  const sp0 = n.skillPoints;
  assert.deepEqual(apply(n, [{ type: "coachHint", from: "fielded" }], {}, d).lines, ["SP +10 (가르칠 코치 스킬 없음)"]);
  assert.equal(n.skillPoints, sp0 + 10);
  // playerHint: 이름이 있으면 그 스킬 (그 선수 목록 · 아직 없음 · Lv3 미만), 없으면 그 선수 목록에서 무작위
  const h = run0();
  assert.equal(desc(h, [{ type: "playerHint", skillId: "sk_calm_keeper" }]).text, `네리아 · ${skillName("sk_calm_keeper")} 힌트 1`);
  apply(h, [{ type: "playerHint", skillId: "sk_calm_keeper" }]);
  assert.equal(h.hints.sk_calm_keeper, 1);
  h.hints.sk_calm_keeper = 3;
  assert.equal(desc(h, [{ type: "playerHint", skillId: "sk_calm_keeper" }]).text, `SP +10 (네리아 · ${skillName("sk_calm_keeper")} 힌트를 더 줄 수 없음)`);
  const hs = h.skillPoints;
  apply(h, [{ type: "playerHint", skillId: "sk_calm_keeper" }]);
  assert.equal(h.skillPoints, hs + 10);
  assert.equal(desc(h, [{ type: "playerHint", target: "player" }], { playerId: "p6" }).text, "울리카 패시브 힌트 1");
  const line = apply(h, [{ type: "playerHint" }], { playerId: "p6" }).lines[0];
  const list = data.characters.find((c) => c.id === "ch_wolf_winger").passiveIds;
  assert.ok(list.some((id) => line === `울리카 · ${skillName(id)} 힌트 Lv1`), line);
  // 남은 레슨이 없으면 (마지막 대비 주가 지난 뒤) 미리보기 = SP, 대기열에 넣고 런 끝에 SP 로 바꾼다 (lessonRun)
  const end = run0();
  Object.assign(end, { season: 3, turn: 5, turnIndex: 14, phase: "event", queue: ["advanceWeek"] });
  assert.equal(desc(end, [{ type: "teach", skillId: "sk_rally_cry" }]).text, "코치 수업: 함성 → 남은 레슨이 없어 런 끝에 SP +20");
  assert.equal(desc(end, [{ type: "coachHint", from: "fielded" }]).text, "코치 수업 1 → 남은 레슨이 없어 런 끝에 SP +20");
  assert.deepEqual(apply(end, [{ type: "teach", skillId: "sk_rally_cry" }]).lines, ["코치 수업: 함성 (루미) (남은 레슨이 없어 런 끝에 SP +20)"]);
  // 이번 주가 아직 시작 전이면 (queue 에 beginWeek) 그 주도 센다
  Object.assign(end, { season: 2, turn: 1, turnIndex: 5, queue: ["beginWeek"] });
  assert.match(desc(end, [{ type: "teach", skillId: "sk_rally_cry" }]).text, /다음 레슨 보상에서/);
});

test("E2 효과: random (맨 위 1개 · 갈래 반환 · 같은 rngState = 같은 갈래) · 레슨 안 효과는 미리보기만, 레슨 밖 적용은 바꾸기 전에 throw (E5 갈고리) · 미리보기는 순수", () => {
  const eff = [{ type: "random", chance: 0.5, then: [{ type: "tp", amount: 10 }], else: [{ type: "sp", amount: 10 }, { type: "condition", amount: 1 }] }];
  const s = run0();
  assert.equal(desc(s, eff).text, "50%: TP +10 / 50%: SP +10, 컨디션 +1");
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const a = run0(data, seed);
    const b = clone(a);
    const ra = apply(a, eff);
    const rb = apply(b, eff);
    same(a, b);
    assert.deepEqual(ra, rb);
    seen.add(ra.branch);
    assert.deepEqual(ra.lines, ra.branch === "then" ? ["TP +10"] : ["SP +10", "컨디션 +1"]);
  }
  assert.deepEqual([...seen].sort(), ["else", "then"], "12 seed 안에 두 갈래 모두");
  // 레슨 안 효과
  const lessonOnly = [{ type: "nextPct", pct: 40 }, { type: "nextNoFail" }, { type: "drawNext", n: 1 }, { type: "extraPlayNext", n: 1 }, { type: "score", amount: 40 },
    { type: "restRemaining", stamina: 20 }, { type: "injureNow" }];
  assert.deepEqual(desc(s, lessonOnly).lines, ["다음 카드 위력 +40%", "다음 카드 실패 판정 없음", "다음 턴 손패 +1", "다음 턴 카드 1장 더 낼 수 있다", "이번 레슨 점수 +40",
    "네리아 이번 레슨 남은 턴 쉼 (대상 제외, 체력 +20)", "네리아 결장 (이번 레슨 남은 턴도)"]);
  assert.equal(desc(s, [{ type: "buff", n: 1 }]).text, "분위기 +1", "팀형 방침 버프");
  for (const e of lessonOnly) rejects(s, () => apply(s, [{ type: "tp", amount: 5 }, e]), /레슨 안 효과라 레슨 깜짝 이벤트에서만 적용한다/);
  // E5 갈고리 (ctx.applyLesson) 가 있으면 그것이 적용한다
  const calls = [];
  const out = apply(s, [{ type: "score", amount: 40 }, { type: "tp", amount: 5 }], { applyLesson: (st, d, e) => { calls.push(e.type); return "점수 +40 (갈고리)"; } });
  assert.deepEqual(calls, ["score"]);
  assert.deepEqual(out.lines, ["점수 +40 (갈고리)", "TP +5"]);
  // 주인공이 필요한 효과에 주인공이 없으면 바꾸기 전에 throw · 모르는 type
  rejects(s, () => apply(s, [{ type: "tp", amount: 5 }, { type: "stat", target: "player", stat: "pass", amount: 5 }], { playerId: null }), /주인공 \(ctx\.playerId\) 이 없습니다/);
  rejects(s, () => apply(s, [{ type: "boost" }]), /알 수 없는 효과 type: 'boost'/);
  // 미리보기 · 고르기 후보 · 기대값은 상태 (rngState 포함) 를 바꾸지 않는다
  const before = JSON.stringify(s);
  for (const e of [...eff, ...lessonOnly, { type: "cardPick", op: "upgrade" }, { type: "rewardOffer" }, { type: "teach", skillId: "sk_rally_cry" }, { type: "coachHint", from: "fielded" }, { type: "playerHint" }, { type: "injury", target: "randomPlayer" }]) {
    desc(s, [e]);
    LF.effectNeeds(s, data, [e]);
    LF.scoreEffects(s, data, [e], { playerId: "p1" });
  }
  assert.equal(JSON.stringify(s), before);
});

// ---- 주인공 · 띄우기 · 뷰 · 고르기 ----

/** E2 고정 이벤트: 고르는 카드 · 3택1 · 짝 · 코치 · 이야기 */
const EV_PICK = {
  id: "ev_fx_pick", trigger: "week", who: { pick: "lowestStamina" }, title: "카드 정리", text: "{선수|이/가} 카드 더미를 들고 옵니다.\n\"감독님, 이거 하나만 손봐 주세요.\"", scene: "clubhouse",
  choices: [
    { label: "강화한다", effects: [{ type: "cardPick", op: "upgrade" }], result: "{선수|이/가} 만족합니다." },
    { label: "버린다", effects: [{ type: "cardPick", op: "delete" }, { type: "tp", amount: 5 }], result: "{선수|은/는} 더미를 가볍게 했습니다." },
  ],
  alt: { banmal: { text: "{선수|이/가} 카드 더미를 들고 옵니다.\n\"감독, 이거 하나만 봐 줘.\"", results: ["{선수|이/가} 고개를 끄덕입니다.", "{선수|은/는} 더미를 가볍게 했습니다."] } },
};
const EV_OFFER = {
  id: "ev_fx_offer", trigger: "seasonStart", seasons: [1], title: "개막 선물", text: "후원자가 상자를 놓고 갑니다.",
  choices: [
    { label: "연다", effects: [{ type: "rewardOffer" }], result: "카드가 세 장 들어 있습니다." },
    { label: "돌려보낸다", effects: [{ type: "relic" }], result: "대신 낡은 상자를 받았습니다." },
  ],
};

function e2Data() {
  const d = withEvents([WEEK_OK, ...MISC_OK, EV_PICK, EV_OFFER]);
  d.lesson_ev_story = { version: 1, notes: {}, events: clone(STORY_OK) };
  d.lesson_ev_coach = { version: 1, notes: {}, events: clone(COACH_OK) };
  return d;
}
const E2D = e2Data();
/** 기본 편성 런에 이벤트를 띄운다 (주 끝처럼 queue = advanceWeek) */
function fired(id, ctx = {}, { d = E2D, seed = 7, mut } = {}) {
  const s = LR.createRun({ data: d, seed });
  if (mut) mut(s);
  LE.fireEvent(s, d, LE.eventById(d, id), ctx);
  s.queue = ["advanceWeek"];
  return s;
}

test("E2 주인공 (§24.3.4): random · pos · char · lowest/highest (같으면 무작위) · partner (결장이어도) · 이야기 · ctx.playerId · 결장 제외 · 깜짝 전용은 E5", () => {
  const d = E2D;
  const pick = (s, ev, ctx = {}) => {
    const rng = createRngFromState(s.rngState);
    return LE.pickProtagonist(s, d, ev, ctx, rng);
  };
  const s = run0(d);
  const ev = (patch) => ({ ...clone(WEEK_OK), ...patch });
  // random + pos (FW · MF) → 그 포지션 중, 결장 제외 · 좁혀서 없으면 결장 아닌 전원
  for (let seed = 1; seed <= 6; seed++) assert.ok(["MF", "FW"].includes(P(s, pick(run0(d, seed), ev({}))).position));
  const fwOnly = clone(s);
  P(fwOnly, "p6").injuredTurns = 1;
  assert.equal(pick(fwOnly, ev({ who: { pick: "random", pos: ["FW"] } })), "p7");
  P(fwOnly, "p7").injuredTurns = 1;
  assert.notEqual(P(fwOnly, pick(fwOnly, ev({ who: { pick: "random", pos: ["FW"] } }))).injuredTurns, 1, "FW 가 모두 결장 → 결장 아닌 전원 중");
  const one = clone(s);
  for (const p of one.players) if (p.id !== "p3") p.injuredTurns = 1;
  assert.equal(pick(one, ev({ who: { pick: "random" } })), "p3");
  // char
  assert.equal(pick(s, { ...clone(MISC_OK[4]), who: { pick: "char", charId: "ch_wolf_winger" } }), "p6");
  // lowest / highest (pos) — 같으면 무작위 (그 중에서)
  const st = clone(s);
  st.players.forEach((p, i) => (p.stamina = 50 + i));
  P(st, "p4").stamina = 20;
  assert.equal(pick(st, ev({ who: { pick: "lowestStamina" } })), "p4");
  P(st, "p4").injuredTurns = 1;
  assert.equal(pick(st, ev({ who: { pick: "lowestStamina" } })), "p1", "결장 선수는 빼고");
  assert.equal(pick(st, ev({ who: { pick: "highestStamina", pos: ["DF", "GK"] } })), "p3");
  P(st, "p2").stamina = 52;
  const tie = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const t = clone(st);
    t.rngState = run0(d, seed).rngState;
    tie.add(pick(t, ev({ who: { pick: "highestStamina", pos: ["DF"] } })));
  }
  assert.deepEqual([...tie].sort(), ["p2", "p3"], "같은 체력이면 무작위");
  // none · partner (결장이어도) · 이야기 · ctx.playerId · coachTarget (E4 전까지 무작위)
  assert.equal(pick(s, MISC_OK[0]), null);
  const inj = clone(s);
  P(inj, "p5").injuredTurns = 1;
  assert.equal(pick(inj, MISC_OK[3], { partnerId: "p5" }), "p5");
  assert.throws(() => pick(inj, MISC_OK[3], {}), /외출 상대/);
  assert.equal(pick(s, STORY_OK[1], { partnerId: "p3" }), "p1", "이야기 = 그 캐릭터");
  assert.equal(pick(s, ev({}), { playerId: "p2" }), "p2");
  assert.throws(() => pick(s, ev({}), { playerId: "p9" }), /편성에 없습니다/);
  assert.ok(P(s, pick(s, COACH_OK[0])));
  assert.throws(() => pick(s, SURPRISE_OK), /레슨 깜짝 \(E5\)/);
});

test("E2 fireEvent: currentEvent { eventId, playerId, supportId, charIds, kind, ctx } · usedEventIds · usedEventSeasons (once season) · eventSeq · phase event · 검사", () => {
  const s = fired("ev_fixture", { playerId: "p2", partnerId: "p9", fn: () => 1 });
  assert.deepEqual(s.currentEvent, { eventId: "ev_fixture", playerId: "p2", supportId: null, charIds: [], kind: "week", ctx: { playerId: "p2", partnerId: "p9" } });
  assert.equal(s.phase, "event");
  assert.deepEqual(s.usedEventIds, ["ev_fixture"]);
  assert.equal(s.eventSeq, 1);
  assert.deepEqual(s.usedEventSeasons, {});
  same(clone(s), s);
  // 이미 떠 있으면 · 데이터에 없으면 · 깜짝이면 throw (상태 그대로)
  rejects(s, () => LE.fireEvent(s, E2D, LE.eventById(E2D, "ev_fixture"), {}), /이미 떠 있는 이벤트/);
  const t = run0(E2D);
  rejects(t, () => LE.fireEvent(t, E2D, { ...clone(WEEK_OK), id: "ev_nowhere" }, {}), /데이터에 없습니다/);
  // 코치 조건 · 짝 · 코치 연속 · 시즌 1회
  const m = fired("ev_fixture_monk");
  assert.equal(m.currentEvent.supportId, "sp_mountain_monk");
  const pair = fired("ev_fixture_pair");
  assert.deepEqual(pair.currentEvent.charIds, ["ch_wolf_winger", "ch_giant_striker"]);
  const c3 = fired("ev_coach_fixture_3");
  assert.equal(c3.currentEvent.supportId, "sp_coach_harr");
  assert.equal(c3.currentEvent.kind, "coach");
  const d = clone(E2D);
  d.lesson_ev_week.events.find((e) => e.id === "ev_fixture_monk").once = "season";
  const ss = fired("ev_fixture_monk", {}, { d });
  assert.deepEqual(ss.usedEventSeasons, { ev_fixture_monk: [1] });
});

test("E2 getEventView: 지금 event.js 모양 (title · text · player · support · choices[{ text, preview }]) + kind · badge · scene · art · players · lines · needs · recommended, 조사 · 반말판, 순수", () => {
  // 반말 선수 (도르비나) → alt.banmal, 존댓말 선수 (실루엔) → 기본 글. 조사는 이름에 맞게
  const b = fired("ev_fixture", { playerId: "p2" });
  const before = JSON.stringify(b);
  const v = LR.getEventView(b, E2D);
  assert.equal(JSON.stringify(b), before, "뷰는 순수 (rngState 포함)");
  assert.equal(v.text, "도르비나가 감독실 문을 두드립니다.\n\"감독, 오늘 밤 슈팅 좀 더 찬다.\"");
  assert.equal(v.title, "시험 이벤트");
  assert.deepEqual(v.player, { id: "p2", charId: "ch_dwarf_wall", name: "도르비나", portraitColor: P(b, "p2").portraitColor, slot: "DF1", position: "DF", stamina: 100, injured: false });
  assert.equal(v.support, null);
  assert.deepEqual([v.kind, v.badge, v.scene, v.trigger, v.eventId], ["week", "주 끝", "clubhouse", "week", "ev_fixture"]);
  assert.deepEqual(v.art, { charIds: ["ch_dwarf_wall"], supportId: null });
  assert.deepEqual(v.players.map((p) => p.id), ["p2"]);
  assert.equal(v.choices.length, 2);
  assert.equal(v.choices[0].text, "\"오늘 밤은 네 날이다.\"");
  assert.equal(v.choices[0].preview, "70%: 도르비나 슈팅 +30 / 30%: 도르비나 슈팅 +30, 도르비나 체력 −40, 도르비나 다음 레슨 1회 결장");
  assert.deepEqual(v.choices[1].lines, ["컨디션 +1"]);
  assert.equal(v.choices[0].needs, null);
  assert.equal(v.choices.filter((c) => c.recommended).length, 1);
  const p = fired("ev_fixture", { playerId: "p4" });
  assert.equal(LR.getEventView(p, E2D).text, "실루엔이 감독실 문을 두드립니다.\n\"감독님, 오늘 밤만 슈팅을 더 차고 싶어요.\"");
  // 짝: players 2명 · art.charIds · 기본 배경 (주 끝 = ground)
  const pv = LR.getEventView(fired("ev_fixture_pair"), E2D);
  assert.deepEqual(pv.players.map((x) => x.name), ["울리카", "그레타"]);
  assert.deepEqual(pv.art.charIds, ["ch_wolf_winger", "ch_giant_striker"]);
  assert.equal(pv.scene, "ground");
  assert.equal(pv.player, null);
  // 코치: support (유대) · 배지 · {코치} 칭호까지
  const cv = LR.getEventView(fired("ev_coach_fixture_1", { playerId: "p6" }), E2D);
  assert.deepEqual(cv.support, { id: "sp_coach_harr", name: "코치 하르나", portraitColor: data.supports.find((x) => x.id === "sp_coach_harr").portraitColor, type: data.supports.find((x) => x.id === "sp_coach_harr").type, bond: 25 });
  assert.equal(cv.badge, "코치 · 첫 만남");
  assert.equal(cv.text, "코치 하르나가 호루라기를 붑니다.\n\"울리카, 골문부터 봐!\" 울리카가 고개를 듭니다.");
  assert.equal(cv.choices[1].preview, `덱에 「${cardName("cd_c_harr")}」 추가, 하르나 유대 +15, 하르나 유대 +5`);
  assert.equal(LR.getEventView(fired("ev_coach_fixture_3"), E2D).badge, "코치 · 유대 80");
  // 이야기: 배지 n/3화 · 기본 배경 nature 는 scene 으로 덮인다
  const sv = LR.getEventView(fired("out_fixture_2", { partnerId: "p1" }), E2D);
  assert.deepEqual([sv.badge, sv.scene, sv.kind], ["이야기 2/3화", "nature", "story"]);
  // 시즌 시작 (주인공 없음) · 기본 배경 stands
  const ov = LR.getEventView(fired("ev_fx_offer"), E2D);
  assert.deepEqual([ov.badge, ov.scene, ov.player], ["시즌 시작", "stands", null]);
  // 고르는 선택지: needs { op, candidates[{ uid, cardId, name, plus }] }
  const k = fired("ev_fx_pick");
  const kv = LR.getEventView(k, E2D);
  assert.equal(kv.choices[0].needs.op, "upgrade");
  assert.deepEqual(kv.choices[0].needs.candidates, k.deck.filter((e) => !e.plus && canUpgrade(getCard(data, e.cardId))).map((e) => ({ uid: e.uid, cardId: e.cardId, name: cardName(e.cardId), plus: false })));
  assert.equal(kv.choices[1].needs.op, "delete");
  assert.equal(kv.choices[1].needs.candidates.length, k.deck.length);
  // phase event 가 아니면 throw
  assert.throws(() => LR.getEventView(run0(E2D), E2D), /phase 'event'/);
});

test("E2 resolveEvent: 효과 · 갈래 결과 문구 (반말판) · lastEvent · 로그 · currentEvent 비움 · 흐름 (주 끝 advanceWeek) · JSON 왕복 결정성", () => {
  const branches = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const s = fired("ev_fixture", { playerId: "p2" }, { seed });
    const c = clone(s);
    const shoot = P(s, "p2").stats.shoot;
    LR.resolveEvent(s, E2D, 0);
    LR.resolveEvent(c, E2D, 0);
    same(s, c);
    const le = s.lastEvent;
    branches.add(le.branch);
    assert.deepEqual([le.seq, le.eventId, le.title, le.kind, le.choice, le.label, le.playerId, le.supportId], [1, "ev_fixture", "시험 이벤트", "week", 0, "\"오늘 밤은 네 날이다.\"", "p2", null]);
    assert.equal(P(s, "p2").stats.shoot, shoot + 30);
    if (le.branch === "then") {
      assert.equal(le.result, "도르비나는 슈팅이 날카로워졌습니다.");
      assert.deepEqual(le.lines, ["도르비나 슈팅 +30"]);
    } else {
      assert.equal(le.result, "다음 날 아침 도르비나가 다리를 절며 나타났습니다.");
      assert.deepEqual(le.lines, ["도르비나 슈팅 +30", "도르비나 체력 −40", "도르비나 다음 레슨 1회 결장"]);
      assert.equal(P(s, "p2").injuredTurns, 1);
    }
    assert.equal(s.currentEvent, null);
    assert.equal(s.phase, "week", "주 끝 queue (advanceWeek) 로 다음 주");
    assert.equal(s.turn, 2);
    assert.ok(s.log.some((l) => l.text === `[시험 이벤트] "오늘 밤은 네 날이다." → ${le.lines.join(", ")}`));
  }
  assert.deepEqual([...branches].sort(), ["else", "then"]);
  // 반말판 결과 (갈래 없는 선택지)
  const s = fired("ev_fixture", { playerId: "p2" });
  LR.resolveEvent(s, E2D, 1);
  assert.equal(s.lastEvent.result, "도르비나가 투덜대며 숙소로 돌아갑니다.");
  assert.equal(s.lastEvent.branch, null);
  // lessonEvents.resolveEvent 만 부르면 phase flow (흐름 잇기는 lessonRun)
  const f = fired("ev_fixture", { playerId: "p4" });
  LE.resolveEvent(f, E2D, 1);
  assert.equal(f.phase, "flow");
  assert.equal(f.lastEvent.result, "실루엔이 아쉬워하며 숙소로 돌아갑니다.");
});

test("E2 resolveEvent 검사: 선택지 번호 · 고르는 카드 uid (없음 · 후보 아님) 는 바꾸기 전에 throw · uid 가 맞으면 그 카드 · 후보가 없으면 TP", () => {
  const s = fired("ev_fx_pick");
  rejects(s, () => LR.resolveEvent(s, E2D, 2), /선택지 번호가 잘못되었습니다: 2/);
  rejects(s, () => LR.resolveEvent(s, E2D, -1), /선택지 번호/);
  rejects(s, () => LR.resolveEvent(s, E2D, 0), /덱의 카드 1장을 골라야 합니다/);
  const done = s.deck[0];
  done.plus = true;
  rejects(s, () => LR.resolveEvent(s, E2D, 0, { uid: done.uid }), /고를 수 없습니다 \(강화 후보가 아님\)/);
  rejects(s, () => LR.resolveEvent(s, E2D, 0, { uid: "k999" }), /고를 수 없습니다/);
  const v = LR.getEventView(s, E2D);
  const uid = v.choices[0].needs.candidates[1].uid;
  LR.resolveEvent(s, E2D, 0, { uid });
  assert.equal(s.deck.find((e) => e.uid === uid).plus, true);
  assert.equal(s.phase, "week");
  // 삭제 + TP (한 선택지)
  const d = fired("ev_fx_pick");
  const n = d.deck.length;
  const tp = d.trainingPoints;
  LR.resolveEvent(d, E2D, 1, { uid: d.deck[0].uid });
  assert.equal(d.deck.length, n - 1);
  assert.equal(d.trainingPoints, tp + 5);
  // 후보가 없으면 uid 없이 TP +10 (대체값)
  const e = fired("ev_fx_pick", {}, { mut: (x) => { for (const c of x.deck) c.plus = true; } });
  assert.equal(LR.getEventView(e, E2D).choices[0].preview, "TP +10 (강화할 카드 없음)");
  const tp2 = e.trainingPoints;
  LR.resolveEvent(e, E2D, 0);
  assert.equal(e.trainingPoints, tp2 + 10);
});

test("E2 카드 3택1 (§24.5.3): rewardOffer → phase cardOffer (흐름 멈춤) → 고르기 (덱 + 코치 카드 유대) · 건너뛰기 TP +10 · 검사 · 그 뒤 흐름 · 유물은 relic", () => {
  const s = fired("ev_fx_offer");
  LR.resolveEvent(s, E2D, 0);
  assert.equal(s.phase, "cardOffer");
  assert.deepEqual(s.queue, ["advanceWeek"], "남은 흐름은 그대로");
  const v = LR.getCardOfferView(s, E2D);
  assert.equal(v.cards.length, 3);
  assert.deepEqual([v.src, v.title, v.skipTp], ["ev_fx_offer", "개막 선물", 10]);
  for (const c of v.cards) assert.ok(c.name && c.cardId && ["add", "upgrade"].includes(c.kind));
  same(JSON.parse(JSON.stringify(s)), s);
  rejects(s, () => LR.resolveCardOffer(s, E2D, { pick: 3 }), /카드 번호가 잘못되었습니다: 3/);
  rejects(s, () => LR.resolveCardOffer(s, E2D, { pick: 1.5 }), /카드 번호/);
  const c = clone(s);
  const n = s.deck.length;
  const i = v.cards.findIndex((x) => x.kind === "add");
  LR.resolveCardOffer(s, E2D, { pick: i });
  assert.equal(s.pendingCardOffer, null);
  assert.equal(s.deck.length, n + 1);
  assert.equal(s.deck.at(-1).cardId, v.cards[i].cardId);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 2);
  // 건너뛰기 = TP +offerSkipTp
  const tp = c.trainingPoints;
  LR.resolveCardOffer(c, E2D, { pick: null });
  assert.equal(c.trainingPoints, tp + data.lesson.events.fallback.offerSkipTp);
  assert.equal(c.deck.length, n);
  // 코치 카드를 고르면 유대 +15, 고유 카드 강화 후보면 그 카드가 강화판
  const k = fired("ev_fx_offer");
  LR.resolveEvent(k, E2D, 0);
  k.pendingCardOffer.cards = [{ cardId: "cd_c_harr", plus: false, kind: "add" }, { cardId: "cd_u_neria", plus: true, kind: "upgrade", uid: k.deck.find((e) => e.cardId === "cd_u_neria").uid }, { cardId: "cd_one_two", plus: false, kind: "add" }];
  const k2 = clone(k);
  const hb = k.supports.find((x) => x.id === "sp_coach_harr").bond;
  LR.resolveCardOffer(k, E2D, { pick: 0 });
  assert.equal(k.supports.find((x) => x.id === "sp_coach_harr").bond, hb + 15);
  LR.resolveCardOffer(k2, E2D, { pick: 1 });
  assert.equal(k2.deck.find((e) => e.cardId === "cd_u_neria").plus, true);
  assert.equal(k2.deck.length, n, "강화는 덱이 늘지 않는다");
  // 유물 → relic phase 가 먼저
  const r = fired("ev_fx_offer");
  LR.resolveEvent(r, E2D, 1);
  assert.equal(r.phase, "relic");
  LR.chooseRelic(r, E2D, r.pendingRelicChoices[0]);
  assert.equal(r.phase, "week");
  // phase 가 아니면 throw
  assert.throws(() => LR.getCardOfferView(run0(E2D), E2D), /phase 'cardOffer'/);
});

test("E2 choiceScore (§24.11 [가정]): 표 · 확률은 기대값 · 대체값 · 추천 = 기대값이 큰 쪽 (같으면 0번), 순수", () => {
  const s = fired("ev_fixture", { playerId: "p2" });
  const v = LR.getEventView(s, E2D);
  const before = JSON.stringify(s);
  // 0: 70% 슈팅 +30 / 30% 슈팅 +30 · 체력 −40 (×0.3) · 결장 −40 → 0.7 × 30 + 0.3 × (30 − 12 − 40) = 14.4
  assert.equal(LE.choiceScore(s, E2D, v, 0), 14.4);
  // 1: 컨디션 +1 = 25 (최고 단계까지 남은 만큼)
  assert.equal(LE.choiceScore(s, E2D, v, 1), 25);
  assert.deepEqual(v.choices.map((c) => c.recommended), [false, true]);
  assert.equal(JSON.stringify(s), before);
  s.condition = 4;
  assert.equal(LE.choiceScore(s, E2D, v, 1), 0, "컨디션 최고면 0");
  assert.deepEqual(LR.getEventView(s, E2D).choices.map((c) => c.recommended), [true, false]);
  // 표 값
  const t = run0(E2D);
  const sc = (effects, ctx = {}) => LF.scoreEffects(t, E2D, effects, { playerId: "p1", ...ctx });
  assert.equal(sc([{ type: "stat", target: "team", stat: "pass", amount: 6 }]), 42);
  assert.equal(sc([{ type: "stat", target: "player", stat: "main2", amount: 10 }]), 20);
  assert.equal(sc([{ type: "teach", skillId: "sk_rally_cry" }]), 40);
  assert.equal(sc([{ type: "playerHint" }]), 20);
  assert.equal(sc([{ type: "cardAdd", cardId: "cd_one_two" }, { type: "rewardOffer" }, { type: "relic" }]), 30 + 35 + 50);
  assert.equal(sc([{ type: "tp", amount: 20 }, { type: "sp", amount: 10 }, { type: "teamwork", amount: 5 }]), 30 + 10 + 15);
  P(t, "p1").stamina = 40;
  assert.equal(sc([{ type: "stamina", target: "player", amount: 20 }]), 12, "체력 50 미만이면 ×2");
  assert.equal(sc([{ type: "nextPct", pct: 40 }, { type: "extraPlayNext", n: 1 }, { type: "drawNext", n: 1 }, { type: "buff", n: 1 }]), 32 + 80 + 30 + 30);
  // 대체값: 이미 강화판 → TP +20 = 30
  t.deck.find((e) => e.cardId === "cd_u_neria").plus = true;
  assert.equal(sc([{ type: "uniquePlus" }]), 30);
});

test("E2 og_event 장면 (tools/lesson_scenarios.mjs): 레슨 이벤트 ev_local_kids 를 lessonEvents.fireEvent 로 주입 → 고르면 다음 주", async () => {
  const { loadData: sload, OUTGAME_SCENARIOS } = await import("../tools/scenarios.mjs");
  const sdata = sload();
  const b = OUTGAME_SCENARIOS.find((x) => x.name === "og_event").build(sdata, { runSeed: 1 });
  const s = clone(b.runState);
  assert.equal(s.phase, "event");
  assert.equal(s.currentEvent.eventId, "ev_local_kids");
  const v = LR.getEventView(s, sdata);
  assert.ok(v.player && v.choices.length === 2 && v.choices.every((c) => c.preview));
  const turn = s.turn;
  LR.resolveEvent(s, sdata, 1);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, turn + 1);
  assert.equal(s.pendingTeach.at(-1).skillId, "sk_rally_cry");
});

// ---------------------------------------------------------------------------
// E3 — 흐름 자격 · 고르기 (§24.2 · §24.3.2 ~ §24.3.4 · §24.7)
// ---------------------------------------------------------------------------

/** E3 주 끝 본보기 (주인공 없음 · rng 를 쓰지 않는 효과) */
const E3_BASE = {
  id: "ev_e3", trigger: "week", title: "비 오는 날", text: "아침부터 비가 옵니다.",
  choices: [
    { label: "쉰다", effects: [{ type: "tp", amount: 5 }], result: "푹 쉬었습니다." },
    { label: "뛴다", effects: [{ type: "teamwork", amount: 5 }], result: "흠뻑 젖었습니다." },
  ],
};
const wk = (id, patch = {}) => ({ ...clone(E3_BASE), id, ...patch });
const fx = (id, trigger, patch = {}) => ({ ...clone(E3_BASE), id, trigger, ...patch });
/** 이벤트를 넣은 데이터 (스위치 꺼짐 — createRun 은 이벤트 없이 1주) + 기본 편성 런 */
function e3(events, { seed = 7, mut, file = "lesson_ev_week" } = {}) {
  const d = withEvents(events, file);
  const s = LR.createRun({ data: d, seed });
  if (mut) mut(s);
  return { d, s };
}
const ids = (list) => list.map((e) => e.id);

test("E3 eligible (주 끝 §24.3.2): weeks · weekList (turnIndex) · seasons · once run / season / false (지난 주 슬롯) · chars all / any (결장 아님) · coach 편성 · 데이터 순서 · 순수", () => {
  const evs = [
    wk("ev_e3_all"),
    wk("ev_e3_weeks", { weeks: [3, 4] }),
    wk("ev_e3_list", { weekList: [0, 7] }),
    wk("ev_e3_s2", { seasons: [2] }),
    wk("ev_e3_season", { once: "season" }),
    wk("ev_e3_repeat", { once: false }),
    wk("ev_e3_pair", { chars: ["ch_wolf_winger", "ch_giant_striker"], charMode: "all" }),
    wk("ev_e3_any", { chars: ["ch_wolf_winger", "ch_cat_trickster"], charMode: "any" }),
    wk("ev_e3_absent", { chars: ["ch_cat_trickster"] }),
    wk("ev_e3_monk", { coach: "sp_mountain_monk" }),
    wk("ev_e3_joy", { coach: "sp_street_striker" }),
  ];
  const { d, s } = e3(evs);
  const at = (patch, mut) => {
    const t = clone(s);
    Object.assign(t, patch);
    if (mut) mut(t);
    const before = JSON.stringify(t);
    const out = ids(LE.eligible(t, d, "week"));
    assert.equal(JSON.stringify(t), before, "eligible 는 순수");
    return out;
  };
  // 시즌 1 · 1주 (turnIndex 0): 편성에 없는 미르카 · 조이 · 주 3 ~ 4 · 시즌 2 만 빠진다 (데이터 순서 그대로)
  assert.deepEqual(at({}), ["ev_e3_all", "ev_e3_list", "ev_e3_season", "ev_e3_repeat", "ev_e3_pair", "ev_e3_any", "ev_e3_monk"]);
  // 주 번호 = turnIndex (시즌을 이어서 0 ~ 14)
  assert.ok(at({ turnIndex: 3 }).includes("ev_e3_weeks") && at({ turnIndex: 4 }).includes("ev_e3_weeks"));
  assert.ok(!at({ turnIndex: 5 }).includes("ev_e3_weeks"));
  assert.ok(at({ turnIndex: 7 }).includes("ev_e3_list") && !at({ turnIndex: 1 }).includes("ev_e3_list"));
  assert.ok(at({ season: 2, turnIndex: 5 }).includes("ev_e3_s2"));
  // once: run (기본) = usedEventIds · season = 그 시즌에 봤으면 · false = 반복 (지난 주 슬롯과 같은 id 만 빠진다)
  const used = ["ev_e3_all", "ev_e3_season", "ev_e3_repeat"];
  const u = at({ usedEventIds: used, usedEventSeasons: { ev_e3_season: [1] } });
  assert.ok(!u.includes("ev_e3_all") && !u.includes("ev_e3_season") && u.includes("ev_e3_repeat"));
  assert.ok(at({ season: 2, usedEventIds: used, usedEventSeasons: { ev_e3_season: [1] } }).includes("ev_e3_season"), "다음 시즌이면 다시");
  assert.ok(!at({ lastWeekEventId: "ev_e3_repeat" }).includes("ev_e3_repeat"), "반복 이벤트도 바로 다음 주에는 안 뜬다");
  assert.ok(at({ lastWeekEventId: "ev_e3_all" }).includes("ev_e3_all"), "1회용은 usedEventIds 로만");
  // chars: all = 모두 편성 · 결장 아님, any = 하나라도
  const inj = (id) => (t) => (t.players.find((p) => p.id === id).injuredTurns = 1);
  assert.ok(!at({}, inj("p7")).includes("ev_e3_pair"), "그레타 결장 → 짝 이벤트 없음");
  assert.ok(at({}, inj("p7")).includes("ev_e3_any"));
  assert.ok(!at({}, inj("p6")).includes("ev_e3_any"), "울리카 결장 · 미르카 편성 안 됨 → any 도 없음");
  // coach: 편성된 코치 (유대와 상관없이)
  assert.ok(!at({}, (t) => (t.supports = t.supports.filter((x) => x.id !== "sp_mountain_monk"))).includes("ev_e3_monk"));
  // 다른 트리거는 섞이지 않는다
  assert.deepEqual(ids(LE.eligible(s, d, "seasonStart")), []);
});

test("E3 주 끝 조건 cond (§24.3.3 — 모두 AND) · weightIf 가중치 · weekCondOk 순수 · 모르는 키는 throw", () => {
  const { d, s } = e3([
    wk("ev_e3_tired", { cond: { anyStaminaBelow: 50 } }),
    wk("ev_e3_avg", { cond: { avgStaminaBelow: 50 } }),
    wk("ev_e3_inj", { cond: { anyInjured: true } }),
    wk("ev_e3_tw", { cond: { teamworkBelow: 10 } }),
    wk("ev_e3_low", { cond: { conditionBelow: 2 } }),
    wk("ev_e3_high", { cond: { conditionAtLeast: 3 } }),
    wk("ev_e3_and", { cond: { anyInjured: true, conditionAtLeast: 3 } }),
    wk("ev_e3_w", { weight: 2, weightIf: { cond: { anyInjured: true }, weight: 5 } }),
  ]);
  const on = (mut) => {
    const t = clone(s);
    mut(t);
    return ids(LE.eligible(t, d, "week"));
  };
  // 시작: 체력 100 · 팀워크 0 · 컨디션 시작값
  const c0 = s.condition;
  const base = on(() => {});
  assert.ok(!base.includes("ev_e3_tired") && !base.includes("ev_e3_avg") && !base.includes("ev_e3_inj"));
  assert.ok(base.includes("ev_e3_tw"), "팀워크 0 < 10");
  assert.equal(base.includes("ev_e3_low"), c0 < 2);
  assert.equal(base.includes("ev_e3_high"), c0 >= 3);
  // anyStaminaBelow: 결장 아닌 선수만 본다
  assert.ok(on((t) => (P(t, "p3").stamina = 40)).includes("ev_e3_tired"));
  assert.ok(!on((t) => Object.assign(P(t, "p3"), { stamina: 40, injuredTurns: 1 })).includes("ev_e3_tired"), "결장 선수는 빼고");
  // avgStaminaBelow: 7명 평균 (결장 포함)
  assert.ok(!on((t) => (P(t, "p3").stamina = 0)).includes("ev_e3_avg"), "한 명만 0 이면 평균 85.7");
  assert.ok(on((t) => t.players.forEach((p) => (p.stamina = 49))).includes("ev_e3_avg"));
  // anyInjured · teamwork · condition · AND
  assert.ok(on((t) => (P(t, "p2").injuredTurns = 2)).includes("ev_e3_inj"));
  assert.ok(!on((t) => (t.teamwork = 10)).includes("ev_e3_tw"));
  assert.ok(on((t) => (t.condition = 1)).includes("ev_e3_low") && !on((t) => (t.condition = 2)).includes("ev_e3_low"));
  assert.ok(on((t) => (t.condition = 3)).includes("ev_e3_high"));
  assert.ok(!on((t) => (t.condition = 3)).includes("ev_e3_and"));
  assert.ok(on((t) => Object.assign(t, { condition: 4 }) && (P(t, "p1").injuredTurns = 1)).includes("ev_e3_and"));
  // weightIf: 조건이 참이면 그 가중치, 아니면 weight (없으면 1)
  const w = LE.eventById(d, "ev_e3_w");
  assert.equal(LE.eventWeight(s, w), 2);
  const t = clone(s);
  P(t, "p5").injuredTurns = 1;
  assert.equal(LE.eventWeight(t, w), 5);
  assert.equal(LE.eventWeight(s, LE.eventById(d, "ev_e3_tw")), 1);
  // weekCondOk: 없으면 참 · 순수 · 모르는 키 throw
  const before = JSON.stringify(s);
  assert.equal(LE.weekCondOk(s, undefined), true);
  assert.equal(LE.weekCondOk(s, { teamworkBelow: 1 }), true);
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => LE.weekCondOk(s, { failedThisTurn: true }), /모르는 키 'failedThisTurn'/);
});

test("E3 pickWeekEvent · pickOutingEvent (가중치 뽑기 — 같은 rngState = 같은 결과, 후보가 없으면 null · rng 그대로) · pickFixedEvent (데이터 순서 첫 번째 · rng 없음) · 흐름 밖 트리거는 throw · switchOn", () => {
  const { d, s } = e3([
    wk("ev_e3_light", { weight: 1, weeks: [0, 13] }),
    wk("ev_e3_heavy", { weight: 4, weeks: [0, 13] }),
    fx("ev_e3_s1a", "seasonStart", { seasons: [1] }),
    fx("ev_e3_s1b", "seasonStart", { seasons: [1] }),
    fx("ev_e3_s2", "seasonStart", { seasons: [2] }),
    fx("ev_e3_pre1", "preMatch", { seasons: [1] }),
    fx("ev_e3_camp", "route", { routeId: "rt_camp" }),
    fx("ev_e3_spa", "route", { routeId: "rt_hotspring" }),
  ]);
  // 가중치 뽑기: rngState 를 한 번 쓰고, 같은 rngState 면 같은 이벤트
  const count = { ev_e3_light: 0, ev_e3_heavy: 0 };
  for (let seed = 1; seed <= 200; seed++) {
    const t = clone(s);
    t.rngState = LR.createRun({ data: d, seed }).rngState;
    const r0 = t.rngState;
    const c = clone(t);
    const ev = LE.pickWeekEvent(t, d);
    assert.equal(LE.pickWeekEvent(c, d).id, ev.id);
    assert.equal(t.rngState, c.rngState);
    assert.notEqual(t.rngState, r0, "rng 를 썼다");
    count[ev.id] += 1;
  }
  assert.ok(count.ev_e3_heavy > count.ev_e3_light * 2, JSON.stringify(count));
  // 후보가 없으면 null — rngState 그대로 (스위치가 켜져도 띄울 것이 없으면 rng 를 쓰지 않는다)
  const late = clone(s);
  late.turnIndex = 14;
  const r0 = late.rngState;
  assert.equal(LE.pickWeekEvent(late, d), null);
  assert.equal(LE.pickOutingEvent(late, d), null, "외출 이벤트가 없는 데이터");
  assert.equal(late.rngState, r0);
  // 고정: 그 시즌 · 그 루트의 첫 번째, rng 없음
  const before = JSON.stringify(s);
  assert.equal(LE.pickFixedEvent(s, d, "seasonStart").id, "ev_e3_s1a");
  assert.equal(LE.pickFixedEvent({ ...clone(s), season: 2 }, d, "seasonStart").id, "ev_e3_s2");
  assert.equal(LE.pickFixedEvent({ ...clone(s), season: 3 }, d, "seasonStart"), null);
  assert.equal(LE.pickFixedEvent(s, d, "preMatch").id, "ev_e3_pre1");
  assert.equal(LE.pickFixedEvent(s, d, "route", { routeId: "rt_hotspring" }).id, "ev_e3_spa");
  assert.equal(LE.pickFixedEvent(s, d, "route", { routeId: "rt_expedition" }), null);
  assert.equal(LE.pickFixedEvent(s, d, "route", {}), null);
  assert.equal(JSON.stringify(s), before, "고정 고르기는 순수");
  // 이야기 · 코치 · 깜짝은 흐름 자격이 아니다 (E4 storyNext · coachReady · E5)
  assert.throws(() => LE.eligible(s, d, "story"), /이야기는 storyNext · 코치는 coachReady/);
  assert.throws(() => LE.eligible(s, d, "surprise"), /흐름 자격으로 고르지 않습니다/);
  assert.throws(() => LE.pickFixedEvent(s, d, "week"), /고정 이벤트 트리거가 아닙니다/);
  // 기능 스위치 (§24.3.6)
  assert.equal(LE.switchOn(d, "week"), false, "테스트 데이터는 모두 꺼짐");
  const on = clone(d);
  LE.setEventSwitches(on.lesson, true);
  for (const k of ["week", "seasonStart", "preMatch", "route", "outing", "coach", "surprise"]) assert.equal(LE.switchOn(on, k), true, k);
  assert.equal(LE.switchOn({ lesson: {} }, "week"), false, "events 블록이 없으면 꺼짐");
});

test("E3 일반 외출 주머니 (§24.7): 이번 런에 안 본 것 중 가중치로 · 다 보면 비우고 다시 · fireEvent 가 outingSeen 에 남긴다 · 주인공 = 외출 상대 (결장이어도)", () => {
  const outing = (id, weight = 1) => fx(id, "outing", {
    weight, title: "{선수}의 하루", text: "{선수|이/가} 장터를 걷습니다.",
    choices: [
      { label: "따라간다", effects: [{ type: "stamina", target: "player", amount: 10 }], result: "{선수|이/가} 웃었습니다." },
      { label: "돌아간다", effects: [{ type: "tp", amount: 5 }], result: "해가 집니다." },
    ],
  });
  const { d, s } = e3([outing("ev_e3_o1"), outing("ev_e3_o2", 2), outing("ev_e3_o3")], { file: "lesson_ev_fixed" });
  P(s, "p5").injuredTurns = 1;
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const pool = ids(LE.eligible(s, d, "outing"));
    assert.deepEqual(pool, ["ev_e3_o1", "ev_e3_o2", "ev_e3_o3"].filter((id) => !seen.includes(id)), `${i}번째: 안 본 것만`);
    const ev = LE.pickOutingEvent(s, d);
    LE.fireEvent(s, d, ev, { partnerId: "p5" });
    assert.equal(s.currentEvent.playerId, "p5", "결장이어도 외출 상대");
    assert.equal(s.currentEvent.kind, "outing");
    seen.push(ev.id);
    assert.deepEqual(s.outingSeen, seen);
    s.currentEvent = null;
  }
  // 다 봤으면 전부가 후보 → 띄우면 주머니를 비우고 그것부터
  assert.deepEqual(ids(LE.eligible(s, d, "outing")), ["ev_e3_o1", "ev_e3_o2", "ev_e3_o3"]);
  const ev = LE.pickOutingEvent(s, d);
  LE.fireEvent(s, d, ev, { partnerId: "p2" });
  assert.deepEqual(s.outingSeen, [ev.id]);
  // 외출 이벤트는 런 1회 규칙 없이 주머니로만 고른다 (usedEventIds 에는 남는다)
  assert.ok(s.usedEventIds.includes(ev.id));
});

// ---------------------------------------------------------------------------
// LESSON_PROTO_PLAN §24.6 · §24.7 — E4 코치 연속 이벤트 · 외출 이야기 · 계정 스냅샷 (테스트 안의 고정 이벤트)
// ---------------------------------------------------------------------------

/** 코치 연속 본보기 3단계 (코치 id · slug) — 효과는 rng 를 쓰지 않는다 */
const coachFx = (sid, slug) => [1, 2, 3].map((step) => ({
  id: `ev_coach_fx_${slug}_${step}`, trigger: "coach", chain: { supportId: sid, step }, bondAtLeast: LE.COACH_STEP_BONDS[step - 1],
  title: `${slug} ${step}단계`, text: "{코치|이/가} 손짓합니다.\n{선수|이/가} 다가갑니다.",
  choices: [
    { label: "배운다", effects: [{ type: "stat", target: "player", stat: "pass", amount: 5 }], result: "{선수|이/가} 고개를 끄덕입니다." },
    { label: "듣는다", effects: [{ type: "bond", target: "coach", amount: 5 }], result: "{코치|이/가} 웃습니다." },
  ],
}));
/** 이야기 본보기 3화 (타리아 — 제목에 {선수|과/와}) */
const STORY_RUNNER = [1, 2, 3].map((ep) => ({
  id: `out_fixture_runner_${ep}`, trigger: "story", story: { charId: "ch_human_runner", ep },
  title: `{선수|과/와} 달리기 ${ep}화`, text: "타리아가 강둑을 달립니다.\n\"감독님, 한 바퀴만 더요.\"", scene: "nature",
  choices: [
    { label: "같이 뛴다", effects: [{ type: "stat", target: "player", stat: "physical", amount: 5 }], result: "타리아가 웃었습니다." },
    { label: "기다린다", effects: [{ type: "tp", amount: 5 }], result: "해가 집니다." },
  ],
}));
/** 코치 (하르나 · 셀리아) 연속 + 이야기 (네리아 · 타리아) 를 넣은 데이터 사본 (스위치 꺼짐) */
function e4Data({ coach = [...coachFx("sp_coach_harr", "harr"), ...coachFx("sp_wind_dancer", "celia")], stories = [...STORY_OK, ...STORY_RUNNER], mut } = {}) {
  const d = withEvents(coach, "lesson_ev_coach");
  d.lesson_ev_story = { version: 1, notes: {}, events: clone(stories) };
  if (mut) mut(d);
  return d;
}
const E4D = e4Data();
const readyIds = (s, d = E4D) => LE.coachReady(s, d).map((r) => `${r.supportId}:${r.step}`);
const supOf = (s, id) => s.supports.find((x) => x.id === id);

test("E4 계정 스냅샷: normalizeAccount (없음 · 틀린 꼴 → 빈 값, 칸마다 거르기 · 3 위는 3 · 키 정렬) · accountMerge (이야기 = 큰 화 · 코치 = 1단계 합집합 · 멱등 · 입력 그대로)", () => {
  const empty = { stories: {}, coachMet: {} };
  for (const bad of [undefined, null, 3, "x", [], { stories: 3, coachMet: [] }]) assert.deepEqual(LE.normalizeAccount(bad), empty, JSON.stringify(bad));
  const raw = {
    version: 1,
    stories: { ch_spirit_keeper: 2, ch_dwarf_wall: 9, ch_human_captain: 0, ch_elf_playmaker: 1.5, "Bad Id": 1, ch_wolf_winger: "2" },
    coachMet: { sp_wind_dancer: true, sp_coach_harr: true, sp_elder_sage: 1 },
    extra: 1,
  };
  const n = LE.normalizeAccount(raw);
  same(n, { stories: { ch_dwarf_wall: 3, ch_spirit_keeper: 2 }, coachMet: { sp_coach_harr: true, sp_wind_dancer: true } });
  same(LE.normalizeAccount(n), n);
  // 합치기: 이번 런 storyEps (가장 큰 화) · coachSteps 의 1단계 (2단계만 있으면 계정에서 이미 만난 코치)
  const state = { storyEps: { ch_spirit_keeper: 1, ch_wolf_winger: 2 }, coachSteps: { sp_elder_sage: [1, 2], sp_iron_captain: [2] } };
  const before = JSON.stringify([raw, state]);
  const m = LE.accountMerge(raw, state);
  same(m, {
    version: 1,
    stories: { ch_dwarf_wall: 3, ch_spirit_keeper: 2, ch_wolf_winger: 2 },
    coachMet: { sp_coach_harr: true, sp_elder_sage: true, sp_wind_dancer: true },
  });
  assert.equal(JSON.stringify([raw, state]), before, "입력을 바꾸지 않는다");
  same(LE.accountMerge(m, state), m);
  same(LE.accountMerge(LE.accountMerge(m, state), state), m);
  same(LE.accountMerge(null, {}), { version: 1, stories: {}, coachMet: {} });
  same(LE.accountMerge(undefined, LR.createRun({ data, seed: 7 })), { version: 1, stories: {}, coachMet: {} });
  // createRun: state.account = 정규화한 스냅샷 (없으면 빈 값 — v5 기본과 같은 모양 · 같은 자리)
  same(LR.createRun({ data, seed: 7, account: raw }).account, n);
  const plain = LR.createRun({ data, seed: 7 });
  same(plain.account, empty);
  assert.deepEqual(Object.keys(LR.createRun({ data, seed: 7, account: raw })), Object.keys(plain), "키 순서 그대로");
  same({ ...LR.createRun({ data, seed: 7, account: raw }), account: empty }, plain, "스위치가 꺼져 있으면 계정은 다른 것을 바꾸지 않는다");
  // lessonRun 도 다시 내보낸다 (화면 ctx.run)
  assert.equal(LR.accountMerge, LE.accountMerge);
  assert.equal(LR.storyList, LE.storyList);
  assert.equal(LR.normalizeAccount, LE.normalizeAccount);
});

test("E4 coachReady (§24.6): 1단계 = 레슨에 나옴 (coachSeen) · 2단계 = 1단계 + 유대 40 · 3단계 = 2단계 + 유대 80 · 낮은 단계 먼저 → 편성 순 · 이벤트가 있어야 · 편성 코치만 · 순수", () => {
  const s = LR.createRun({ data: E4D, seed: 7 });
  assert.deepEqual(readyIds(s), [], "레슨에 나온 코치가 없다");
  // 1단계: 레슨에 나온 코치 — 편성 순, 이벤트가 없는 코치 (오르넬라) 는 빠진다
  s.coachSeen = { sp_wind_dancer: true, sp_elder_sage: true, sp_coach_harr: true };
  const before = JSON.stringify(s);
  assert.deepEqual(readyIds(s), ["sp_coach_harr:1", "sp_wind_dancer:1"]);
  assert.equal(JSON.stringify(s), before, "순수");
  assert.equal(LE.coachReady(s, E4D)[0].ev.id, "ev_coach_fx_harr_1");
  // 2단계: 1단계를 봤고 유대 ≥ 40 — 낮은 단계 먼저 (셀리아 1단계 → 하르나 2단계)
  s.coachSteps = { sp_coach_harr: [1] };
  supOf(s, "sp_coach_harr").bond = 39;
  assert.deepEqual(readyIds(s), ["sp_wind_dancer:1"]);
  supOf(s, "sp_coach_harr").bond = 40;
  assert.deepEqual(readyIds(s), ["sp_wind_dancer:1", "sp_coach_harr:2"]);
  // 3단계: 2단계를 이번 런에 봤고 유대 ≥ 80
  s.coachSteps = { sp_coach_harr: [1, 2], sp_wind_dancer: [1] };
  supOf(s, "sp_coach_harr").bond = 79;
  assert.deepEqual(readyIds(s), []);
  supOf(s, "sp_coach_harr").bond = 80;
  supOf(s, "sp_wind_dancer").bond = 100;
  assert.deepEqual(readyIds(s), ["sp_wind_dancer:2", "sp_coach_harr:3"], "단계가 낮은 쪽 먼저 (편성은 하르나가 앞)");
  s.coachSteps = { sp_coach_harr: [1, 2, 3], sp_wind_dancer: [1, 2, 3] };
  assert.deepEqual(readyIds(s), [], "3단계 뒤에는 없다");
  // 유대가 높아도 1단계를 보지 않았으면 (계정에서도) 2단계는 없다
  const t = LR.createRun({ data: E4D, seed: 7 });
  supOf(t, "sp_coach_harr").bond = 100;
  assert.deepEqual(readyIds(t), []);
  // 편성에 없는 코치는 보지 않는다 · 데이터에 그 단계가 없으면 그 코치는 건너뛴다
  const u = LR.createRun({ data: E4D, seed: 7 });
  u.coachSeen = { sp_street_striker: true };
  assert.deepEqual(readyIds(u), []);
  const harrOnly = e4Data({ coach: coachFx("sp_coach_harr", "harr") });
  u.coachSeen = { sp_wind_dancer: true };
  assert.deepEqual(readyIds(u, harrOnly), []);
  assert.equal(LE.coachEventOf(harrOnly, "sp_coach_harr", 2).id, "ev_coach_fx_harr_2");
  assert.equal(LE.coachEventOf(harrOnly, "sp_wind_dancer", 1), null);
});

test("E4 첫 만남은 계정 1회 (firstMeet account): 계정에서 만난 코치는 1단계를 건너뛰고 유대 40부터 (레슨에 나오지 않아도) · firstMeet run 이면 런마다 1단계 (레슨에 나와야)", () => {
  const s = LR.createRun({ data: E4D, seed: 7, account: { coachMet: { sp_coach_harr: true } } });
  same(s.account, { stories: {}, coachMet: { sp_coach_harr: true } });
  s.coachSeen = { sp_coach_harr: true, sp_wind_dancer: true };
  assert.deepEqual(readyIds(s), ["sp_wind_dancer:1"], "하르나 1단계는 건너뜀 · 유대 25 < 40");
  supOf(s, "sp_coach_harr").bond = 40;
  assert.deepEqual(readyIds(s), ["sp_wind_dancer:1", "sp_coach_harr:2"]);
  s.coachSeen = {};
  assert.deepEqual(readyIds(s), ["sp_coach_harr:2"], "2단계는 유대 · 1단계 (계정) 만 본다");
  s.coachSteps = { sp_coach_harr: [2] };
  supOf(s, "sp_coach_harr").bond = 80;
  assert.deepEqual(readyIds(s), ["sp_coach_harr:3"]);
  // firstMeet run: 계정과 상관없이 1단계부터 — 1단계는 레슨에 나와야
  const dr = e4Data({ mut: (d) => (d.lesson.events.coach.firstMeet = "run") });
  const r = LR.createRun({ data: dr, seed: 7, account: { coachMet: { sp_coach_harr: true } } });
  supOf(r, "sp_coach_harr").bond = 40;
  assert.deepEqual(readyIds(r, dr), []);
  r.coachSeen = { sp_coach_harr: true };
  assert.deepEqual(readyIds(r, dr), ["sp_coach_harr:1"]);
});

test("E4 유대 문턱 = lesson.json bond.eventSteps ([40, 80]) · bondAtLeast 는 그 값과 같아야 (검사) · 틀린 eventSteps 는 검사 오류 + 기본값", () => {
  assert.deepEqual(data.lesson.bond.eventSteps, [40, 80]);
  assert.equal(data.lesson.bond.eventAt, 60, "eventAt 은 그대로 (lesson_sim 표시용)");
  assert.deepEqual(LE.coachStepBonds(data), [0, 40, 80]);
  const d = e4Data({
    coach: coachFx("sp_coach_harr", "harr").map((e, i) => ({ ...e, bondAtLeast: [0, 30, 70][i] })),
    mut: (x) => (x.lesson.bond.eventSteps = [30, 70]),
  });
  assert.equal(LE.validateLessonEvents(d), true);
  assert.deepEqual(LE.coachStepBonds(d), [0, 30, 70]);
  const s = LR.createRun({ data: d, seed: 7 });
  s.coachSteps = { sp_coach_harr: [1] };
  supOf(s, "sp_coach_harr").bond = 30;
  assert.deepEqual(readyIds(s, d), ["sp_coach_harr:2"]);
  // 문턱만 바꾸고 이벤트를 그대로 두면 검사 오류
  const bad = e4Data({ mut: (x) => (x.lesson.bond.eventSteps = [30, 70]) });
  assert.throws(() => LE.validateLessonEvents(bad), /bondAtLeast 는 2단계면 30 \(0 · 30 · 70/);
  for (const es of [[80, 40], [40], "40", [0, 80], [40, 101], [40.5, 80]]) {
    const b = clone(data);
    b.lesson.bond.eventSteps = es;
    assert.throws(() => LE.validateLessonEvents(b), /lesson\.json bond\.eventSteps: \[2단계, 3단계\]/, JSON.stringify(es));
    assert.deepEqual(LE.coachStepBonds(b), [0, 40, 80], "틀린 꼴이면 기본값");
  }
});

test("E4 pickCoachEvent: 2주 연속 금지 (gapWeeks 1 — lastCoachTurnIndex) · gapWeeks 0 · 2 · 준비된 것이 없으면 null · 순수", () => {
  const s = LR.createRun({ data: E4D, seed: 7 });
  assert.equal(LE.pickCoachEvent(s, E4D), null);
  s.coachSeen = { sp_coach_harr: true };
  s.turnIndex = 5;
  const before = JSON.stringify(s);
  assert.equal(LE.pickCoachEvent(s, E4D).ev.id, "ev_coach_fx_harr_1");
  assert.equal(JSON.stringify(s), before);
  s.lastCoachTurnIndex = 4;
  assert.equal(LE.pickCoachEvent(s, E4D), null, "바로 앞 주 슬롯이 코치 이벤트");
  s.lastCoachTurnIndex = 3;
  assert.equal(LE.pickCoachEvent(s, E4D).supportId, "sp_coach_harr", "한 주 쉬었으면 다시");
  const g0 = e4Data({ mut: (d) => (d.lesson.events.coach.gapWeeks = 0) });
  s.lastCoachTurnIndex = 4;
  assert.ok(LE.pickCoachEvent(s, g0), "gapWeeks 0 = 연속도 된다");
  const g2 = e4Data({ mut: (d) => (d.lesson.events.coach.gapWeeks = 2) });
  s.lastCoachTurnIndex = 3;
  assert.equal(LE.pickCoachEvent(s, g2), null);
  s.lastCoachTurnIndex = 2;
  assert.ok(LE.pickCoachEvent(s, g2));
});

test("E4 주인공 coachTarget (§24.3.4): 이번 런 그 코치 카드 대상 최다 → 같으면 코치 종목이 주 스탯 → 그래도 같으면 무작위 (결장 제외) · 하나면 rng 를 쓰지 않는다 · 같은 rngState = 같은 선수", () => {
  const s = LR.createRun({ data: E4D, seed: 7 });
  const cand = (t, sid = "sp_coach_harr") => LE.coachTargetCandidates(t, E4D, sid);
  // 대상 기록이 없으면 모두 0 → 코치 종목이 주 스탯인 선수
  assert.deepEqual(cand(s), ["p6", "p7"], "하르나 = 슈팅 → FW");
  assert.deepEqual(cand(s, "sp_elder_sage"), ["p4", "p5"], "오르넬라 = 패스 → MF");
  assert.deepEqual(cand(s, "sp_bard_lumi"), ["p1", "p2", "p3"], "루미 = 코치 카드 종목 피지컬 (L28) → GK · DF");
  // 대상 최다 → 동률이면 주 스탯 → 주 스탯인 선수가 없으면 동률 그대로
  s.coachTargets = { sp_coach_harr: { p2: 3, p4: 3, p6: 1 } };
  assert.deepEqual(cand(s), ["p2", "p4"]);
  s.coachTargets.sp_coach_harr.p7 = 3;
  assert.deepEqual(cand(s), ["p7"]);
  s.coachTargets.sp_coach_harr.p6 = 4;
  assert.deepEqual(cand(s), ["p6"], "최다가 먼저");
  P(s, "p6").injuredTurns = 1;
  assert.deepEqual(cand(s), ["p7"], "결장 제외");
  for (const p of s.players) p.injuredTurns = 1;
  assert.deepEqual(cand(s), ["p6"], "모두 결장이면 전원 중");
  // fireEvent (코치 연속): 후보가 하나면 rng 를 쓰지 않는다
  const one = LR.createRun({ data: E4D, seed: 7 });
  one.coachTargets = { sp_coach_harr: { p3: 2 } };
  const r0 = one.rngState;
  LE.fireEvent(one, E4D, LE.eventById(E4D, "ev_coach_fx_harr_2"), { kind: "coach", supportId: "sp_coach_harr" });
  assert.deepEqual([one.currentEvent.playerId, one.currentEvent.supportId, one.currentEvent.kind, one.rngState], ["p3", "sp_coach_harr", "coach", r0]);
  // 동률이면 rng — 같은 rngState 면 같은 선수, seed 에 따라 둘 다 나온다
  const picks = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const t = LR.createRun({ data: E4D, seed });
    const c = clone(t);
    LE.fireEvent(t, E4D, LE.eventById(E4D, "ev_coach_fx_harr_1"), {});
    LE.fireEvent(c, E4D, LE.eventById(E4D, "ev_coach_fx_harr_1"), {});
    assert.equal(t.currentEvent.playerId, c.currentEvent.playerId);
    assert.equal(t.currentEvent.supportId, "sp_coach_harr", "chain.supportId");
    picks.add(t.currentEvent.playerId);
  }
  assert.deepEqual([...picks].sort(), ["p6", "p7"]);
});

test("E4 이야기 다음 화 (§24.7): min(3, 계정 + 이번 런) + 1 · 그 화가 데이터에 있어야 · pickStoryEvent · storyList (회상 — 캐릭터 순 · 화 순 · {선수} 채움) · 순수", () => {
  const nk = "ch_spirit_keeper";
  const s = LR.createRun({ data: E4D, seed: 7 });
  const before = JSON.stringify(s);
  assert.equal(LE.storyNext(s, E4D, nk), 1);
  assert.equal(LE.pickStoryEvent(s, E4D, nk).id, "out_fixture_1");
  assert.equal(LE.storyNext(s, E4D, "ch_dwarf_wall"), null, "이야기가 없는 캐릭터");
  assert.equal(LE.pickStoryEvent(s, E4D, "ch_dwarf_wall"), null);
  assert.equal(JSON.stringify(s), before, "순수");
  s.storyEps = { [nk]: 1 };
  assert.equal(LE.storyNext(s, E4D, nk), 2, "이번 런에 1화");
  // 계정 스냅샷에서 이어 간다
  const a = LR.createRun({ data: E4D, seed: 7, account: { stories: { [nk]: 2, ch_human_runner: 1 } } });
  assert.equal(LE.storyNext(a, E4D, nk), 3);
  assert.equal(LE.storyNext(a, E4D, "ch_human_runner"), 2);
  a.storyEps = { [nk]: 3 };
  assert.equal(LE.storyNext(a, E4D, nk), null, "3화까지 봤다");
  assert.equal(LE.storyNext(LR.createRun({ data: E4D, seed: 7, account: { stories: { [nk]: 3 } } }), E4D, nk), null);
  // 그 화가 데이터에 없으면 null (콘텐츠가 들어오는 중)
  const d2 = clone(E4D);
  d2.lesson_ev_story.events = d2.lesson_ev_story.events.filter((e) => !(e.story.charId === nk && e.story.ep === 2));
  assert.equal(LE.storyNext(s, d2, nk), null);
  // 회상 목록: 캐릭터 순 (characters.json — 네리아 → 타리아) · 화 순 · 제목의 {선수} 는 그 이름
  const list = LE.storyList(E4D);
  assert.deepEqual(list.map((x) => `${x.charId}:${x.ep}`), [1, 2, 3].map((n) => `${nk}:${n}`).concat([1, 2, 3].map((n) => `ch_human_runner:${n}`)));
  assert.deepEqual(list[0], { charId: nk, name: "네리아", ep: 1, id: "out_fixture_1", title: "호수 1화" });
  assert.deepEqual(list[3], { charId: "ch_human_runner", name: "타리아", ep: 1, id: "out_fixture_runner_1", title: "타리아와 달리기 1화" });
  const noStory = clone(data);
  for (const f of LE.EVENT_FILES) if (noStory[f]) noStory[f].events = noStory[f].events.filter((e) => e.trigger !== "story"); // 새 8명 이야기는 new_a · new_b 파일에 있다
  assert.deepEqual(LE.storyList(noStory), [], "이야기가 없으면 빈 목록");
});

test("E4 고른 순간에 센다 (§24.7): 이야기 storySeen · storyEps (띄울 때는 아직) · 코치 coachSteps (1단계 = 계정 첫 만남) · 두 번 세지 않는다 · accountMerge · JSON 왕복", () => {
  const s = LR.createRun({ data: E4D, seed: 7 });
  LE.fireEvent(s, E4D, LE.eventById(E4D, "out_fixture_1"), { kind: "story", partnerId: "p1" });
  s.queue = ["advanceWeek"];
  same([s.storySeen, s.storyEps], [[], {}]);
  assert.equal(LR.getEventView(s, E4D).badge, "이야기 1/3화");
  const c = clone(s);
  LR.resolveEvent(s, E4D, 1);
  assert.deepEqual(s.storySeen, ["out_fixture_1"]);
  assert.deepEqual(s.storyEps, { ch_spirit_keeper: 1 });
  LR.resolveEvent(c, E4D, 1);
  same(c, s, "JSON 왕복 뒤에 골라도 같다");
  // 코치 연속: 고를 때 coachSteps
  LE.fireEvent(s, E4D, LE.eventById(E4D, "ev_coach_fx_harr_1"), { kind: "coach", supportId: "sp_coach_harr" });
  s.queue = ["advanceWeek"];
  same(s.coachSteps, {});
  assert.equal(LR.getEventView(s, E4D).badge, "코치 · 첫 만남");
  LR.resolveEvent(s, E4D, 1);
  assert.deepEqual(s.coachSteps, { sp_coach_harr: [1] });
  // 같은 이벤트를 다시 골라도 (주입) 두 번 세지 않는다
  LE.fireEvent(s, E4D, LE.eventById(E4D, "out_fixture_1"), { partnerId: "p1" });
  s.queue = ["advanceWeek"];
  LR.resolveEvent(s, E4D, 0);
  assert.deepEqual(s.storySeen, ["out_fixture_1"]);
  same(LE.accountMerge({ version: 1, stories: { ch_human_runner: 3 }, coachMet: {} }, s), {
    version: 1, stories: { ch_human_runner: 3, ch_spirit_keeper: 1 }, coachMet: { sp_coach_harr: true },
  });
});
