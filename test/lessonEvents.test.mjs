// test/lessonEvents.test.mjs — LESSON_PROTO_PLAN §24.3 · §24.4 · §24.5.1 (E1: 조사 · 자리표시 · 말투 · 효과 스키마 · 검사)
// E2 ~ E4 가 주인공 · 띄우기 · 뷰 · 고르기 · 흐름 테스트를 이 파일에 더한다 (테스트 안의 고정 이벤트 + 스위치를 켠 데이터 사본).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone } from "./helpers.mjs";
import * as LT from "../js/engine/lessonText.js";
import * as LE from "../js/engine/lessonEvents.js";
import * as LF from "../js/engine/lessonEffects.js";
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
  delete d.lesson_ev_coach;
  delete d.lesson_ev_story;
  assert.equal(LE.allEvents(d).length, n0);
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
  assert.match(doc, /\| 70%: \{선수\} 슈팅 \+30 \/ 30%: \{선수\} 슈팅 \+30, \{선수\} 체력 −40, \{선수\} 다음 레슨 1회 결장 \|/);
  assert.match(doc, /\{선수\\\|은\/는\} 슈팅이/);
  assert.match(doc, /덱에 「인터벌 슈팅」 추가, 코치 하르나 유대 \+15/);
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
