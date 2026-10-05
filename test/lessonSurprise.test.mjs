// test/lessonSurprise.test.mjs — LESSON_PROTO_PLAN §24.8 (레슨 깜짝 이벤트 L29, 슬라이스 E5): 계획 rng (끄면 rng 그대로) · 턴 기록 ·
// 조건 키 · 주인공 · 띄우기 (범위 · 레슨당 1번 · 런당 1번) · 기다리는 동안 잠금 · 해결 · 레슨 안 효과 · 쉬는 선수 · 결정성 · 저장 왕복.
// 이벤트는 테스트 안의 고정 이벤트 (실제 콘텐츠에 기대지 않는다 — §24.15). 실제 깜짝 데이터는 lessonContent.test 가 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as lesson from "../js/engine/lesson.js";
import * as LS from "../js/engine/lessonSurprise.js";
import * as LE from "../js/engine/lessonEvents.js";
import * as LF from "../js/engine/lessonEffects.js";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";
import * as cards from "../js/engine/cards.js";
import { createRngFromState } from "../js/engine/rng.js";
import { ZONE_IDS } from "../js/engine/zones.js";

const same =(a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// ---------------------------------------------------------------------------
// 고정 이벤트 · 데이터 · 상태
// ---------------------------------------------------------------------------

/** 깜짝 이벤트 하나 (본문은 {선수} — who none 이면 extra.text 로 바꾼다) */
function E(id, cond, who, choices, extra = {}) {
  return { id, trigger: "surprise", title: `깜짝 ${id}`, text: "{선수|이/가} 숨을 고르며 웃습니다.", cond, ...(who ? { who } : {}), choices, ...extra };
}
const CH = (label, effects, result = "좋습니다.") => ({ label, effects, result });
const ALWAYS = { turnMin: 1 };

/** 여러 테스트가 같이 쓰는 고정 이벤트 */
const FIX = {
  low: E("ls_f_low", { anyStaminaBelow: 30 }, { pick: "lowestStamina" },
    [CH("한 번 더 맡긴다", [{ type: "nextNoFail" }], "{선수}의 눈빛이 살아났습니다."), CH("쉬게 한다", [{ type: "restRemaining", stamina: 20 }], "{선수|이/가} 물병을 받았습니다.")],
    { weight: 3, alt: { banmal: { text: "{선수|이/가} 숨을 몰아쉰다. \"...괜찮아. 한 번 더.\"", results: ["{선수|이/가} 이를 악문다.", "{선수|이/가} 물병을 받아 든다."] } } }),
  rand: E("ls_f_rand", { randomTurn: true }, { pick: "random" },
    [CH("크게 간다", [{ type: "random", chance: 0.6, then: [{ type: "score", amount: 40 }], else: [{ type: "nextPct", pct: -20 }] }], { then: "넘었습니다.", else: "엉켰습니다." }),
      CH("차근차근", [{ type: "score", amount: 15 }])]),
  fail: E("ls_f_fail", { failedThisTurn: true }, { pick: "turnFailer" },
    [CH("같이 짚는다", [{ type: "coachHint", from: "fielded" }, { type: "nextPct", pct: -20 }]), CH("털어 버린다", [{ type: "nextNoFail" }])]),
  coach: E("ls_f_coach", { coachCardOkThisTurn: true }, { pick: "coachCardTarget" },
    [CH("다 같이 본다", [{ type: "nextPct", pct: 30 }], "{코치}의 시범이 이어졌습니다."),
      CH("따로 배운다", [{ type: "bond", target: "coach", amount: 10 }, { type: "stamina", target: "player", amount: -10 }], "{코치|이/가} {선수|을/를} 붙잡았습니다.")]),
  mood: E("ls_f_mood", { buffAtLeast: { key: "mood", n: 2 } }, { pick: "random" },
    [CH("구호를 잇는다", [{ type: "buff", n: 1 }]), CH("다음 동작", [{ type: "extraPlayNext", n: 1 }, { type: "drawNext", n: 1 }])], { policy: "team" }),
  last: E("ls_f_last", { turnsLeftMax: 1 }, { pick: "highestStamina" },
    [CH("앞장서 달린다", [{ type: "random", chance: 0.5, then: [{ type: "score", amount: 40 }], else: [{ type: "injureNow" }] }], { then: "다 같이 달렸습니다.", else: "{선수|이/가} 주저앉았습니다." }),
      CH("무리를 챙긴다", [{ type: "condition", amount: 1 }, { type: "teamwork", amount: 3 }, { type: "tp", amount: 5 }])]),
  taria: E("ls_f_taria", { benchedThisTurn: true, char: { id: "ch_human_runner", staminaMin: 60 } }, { pick: "char", charId: "ch_human_runner" },
    [CH("뛰게 둔다", [{ type: "score", amount: 25 }, { type: "stamina", target: "player", amount: -15 }], "타리아가 몇 바퀴나 돌았습니다."),
      CH("보게 한다", [{ type: "drawNext", n: 1 }, { type: "stamina", target: "player", amount: 10 }], "타리아가 끝까지 봤습니다.")]),
};

/** 깜짝을 켠 데이터 (코치 지원 붙기는 끈다 — rng · 손패를 테스트가 정한다). 고정 이벤트는 검사를 통과해야 한다 */
function sdata(events, { chance = 1, fromTurn = 2, attach = false } = {}) {
  const d = loadData();
  d.lesson.attach.enabled = attach;
  d.lesson.events.surprise = { enabled: true, chance, fromTurn };
  d.lesson_ev_surprise = { version: 1, notes: {}, events: clone(events) };
  LE.validateLessonEvents(d);
  return d;
}

/** 기본 편성 레슨 상태 (p1 네리아 GK · p2 도르비나 DF · p3 아델린 DF · p4 실루엔 MF · p5 타리아 MF · p6 울리카 FW · p7 그레타 FW) */
function makeState(d, { seed = 7, policy = "team", season = 1, extra = [] } = {}) {
  const roster = run.buildRoster({ data: d });
  const uniques = cards.cardList(d).filter((c) => c.family === "unique" && roster.players.some((p) => p.charId === c.ownerCharId));
  const ids = [...d.lesson.startDeck, ...uniques.map((c) => c.id), ...extra];
  return {
    kind: "lessonRun", version: 5, seed: String(seed), rngState: seed >>> 0,
    phase: "lesson", season, turn: 1, turnIndex: (season - 1) * 5, policy, formation: roster.formation,
    players: roster.players, supports: roster.supports,
    condition: 2, teamwork: 0, skillPoints: 0, trainingPoints: 0, hints: {}, relics: [], modifiers: [],
    deck: ids.map((cardId, i) => ({ uid: `k${i + 1}`, cardId, plus: false })), nextUid: ids.length + 1,
    lesson: null, log: [], usedEventIds: [], pendingTeach: [],
  };
}
const start = (d, opts = {}, zone = "physical") => lesson.startLesson(makeState(d, opts), d, { zone });
const P = (s, id) => s.players.find((p) => p.id === id);
const uidOf = (s, cardId) => s.deck.find((e) => e.cardId === cardId).uid;

/** 고정 구역: 수비 p1 p2 · 피지컬 p3 · 패스 p4 p5 · 슈팅 p6 · 드리블 p7 */
const LAYOUT = { p1: "defense", p2: "defense", p3: "physical", p4: "pass", p5: "pass", p6: "shoot", p7: "dribble" };
function setZones(s, layout = LAYOUT) {
  const z = {};
  for (const [id, zone] of Object.entries(layout)) if (!s.lesson.out.includes(id) && !(s.lesson.rested || []).includes(id)) z[id] = zone;
  s.lesson.zones = z;
  return s;
}
/** 손패를 지정한다 (지정한 카드를 다른 더미에서 빼 손패로, 원래 손패는 뽑을 더미 끝으로) */
function forceHand(s, uids) {
  const L = s.lesson;
  const old = L.hand.filter((u) => !uids.includes(u));
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.hand = uids.slice();
  L.drawPile.push(...old);
}
function rngWhere(pred) {
  for (let s = 1; s < 100000; s++) if (pred(createRngFromState(s))) return s;
  throw new Error("rng 상태를 찾지 못했습니다");
}
/** 다음 판정이 반드시 성공 (실패 없음) */
const SAFE = rngWhere((r) => r.next() >= 0.96);
/** 실패 판정은 하고 (첫 수 < 0.25) 부상은 없다 (둘째 수 ≥ 0.5) */
const FAIL_NO_INJURY = rngWhere((r) => r.next() < 0.25 && r.next() >= 0.5);
const full = (s) => {
  for (const p of s.players) p.stamina = 100;
  return s;
};
/** 손패의 첫 카드를 첫 후보 점에 (미리보기 ok) — 없으면 턴 끝 */
function autoStep(s, d) {
  const v = lesson.getLessonView(s, d);
  for (const h of v.hand.filter((x) => x.playable)) {
    for (const c of lesson.dropCandidates(s, d, { uid: h.uid })) {
      const args = { uid: h.uid, at: c.at || undefined, playerId: c.playerId, zone: c.zone };
      if (lesson.previewCard(s, d, args).ok) return lesson.playCard(s, d, args);
    }
  }
  return lesson.endLessonTurn(s, d);
}
const pending = (s) => s.lesson.surprise && s.lesson.surprise.pending;
const NO_MATCH = () => ({ winner: "home", homeGoals: 1, awayGoals: 0 });

// ---------------------------------------------------------------------------
// 계획 (startLesson) · 꺼짐
// ---------------------------------------------------------------------------

test("꺼져 있으면 (events.surprise.enabled false · events 블록 없음) 깜짝 필드도 rng 도 없다 — 레슨 상태 · rng 가 1차와 같다", () => {
  const off = loadData();
  off.lesson.attach.enabled = false;
  const none = clone(off);
  delete none.lesson.events;
  const a = start(off);
  const b = start(none);
  same(a, b);
  for (const k of ["surprise", "turnLog", "rested", "nextExtraPlay", "streak", "lastTargeted"]) assert.ok(!(k in a.lesson), k);
  // 레슨 끝까지 같은 진행 · 깜짝 필드 없음
  for (let i = 0; i < 200 && a.lesson.status === "playing"; i++) {
    autoStep(a, off);
    autoStep(b, none);
  }
  same(a, b);
  assert.notEqual(a.lesson.status, "playing");
  assert.ok(!("surprise" in a.lesson));
  assert.equal(lesson.getLessonView(a, off).surprise, null);
});

test("계획 (§24.8): 켜져 있으면 섞기 다음 rng 2번 (chance · int(fromTurn, turns − 1)) · 턴 기록 · 쉬는 선수 · 추가 사용 · 연속 대상 필드", () => {
  const d = sdata([], { chance: 0.5 });
  const s0 = makeState(d, { seed: 11 });
  const s = lesson.startLesson(clone(s0), d, { zone: "pass" });
  // 같은 rng 흐름을 손으로: 섞기 (덱 uid) → chance → int
  const r = createRngFromState(s0.rngState);
  r.shuffle(s0.deck.map((e) => e.uid));
  const planned = r.chance(0.5);
  const randTurn = r.int(2, s.lesson.turns - 1);
  assert.deepEqual(s.lesson.surprise, { planned, randTurn, pending: null, fired: null });
  same(s.lesson.turnLog.plays, []);
  assert.deepEqual(s.lesson.rested, []);
  assert.equal(s.lesson.nextExtraPlay, 0);
  assert.deepEqual(s.lesson.streak, {});
  assert.deepEqual(s.lesson.lastTargeted, {});
  // 턴 시작에 빈 구역 = 흩어진 뒤 아무도 없는 구역
  const occupied = new Set(Object.values(s.lesson.zones));
  assert.deepEqual(s.lesson.turnLog.emptyAtStart, ZONE_IDS.filter((z) => !occupied.has(z)));
  // 여러 seed: 무작위 턴은 [2, turns − 1] 안 (시즌 1 = 6턴, 시즌 3 = 8턴), 계획 비율은 대략 절반
  let n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    for (const season of [1, 3]) {
      const L = start(d, { seed, season }).lesson;
      assert.ok(L.surprise.randTurn >= 2 && L.surprise.randTurn <= L.turns - 1, `${seed}/${season}: ${L.surprise.randTurn}`);
      if (L.surprise.planned) n += 1;
    }
  }
  assert.ok(n > 400 * 0.35 && n < 400 * 0.65, `계획 비율 ${n}/400`);
  // chance 1 = 늘, 0 = 없음 (fromTurn 이 turns − 1 보다 크면 randTurn null)
  assert.equal(start(sdata([], { chance: 1 })).lesson.surprise.planned, true);
  assert.equal(start(sdata([], { chance: 0 })).lesson.surprise.planned, false);
  assert.equal(start(sdata([], { chance: 1, fromTurn: 9 })).lesson.surprise.randTurn, null);
});

// ---------------------------------------------------------------------------
// 조건 키 (§24.8 표)
// ---------------------------------------------------------------------------

test("조건 키 (§24.8): 턴 · 레슨 · 버프 · 점수 · 체력 키가 지금 레슨 상태로 참 / 거짓", () => {
  const d = sdata([]);
  const s = start(d); // 시즌 1 = 6턴, 목표 344 · 상한 416
  const L = s.lesson;
  const yes = (cond, msg) => assert.equal(LS.condTrue(s, d, { cond }), true, msg || JSON.stringify(cond));
  const no = (cond, msg) => assert.equal(LS.condTrue(s, d, { cond }), false, msg || JSON.stringify(cond));
  L.turn = 3;
  L.surprise.randTurn = 3;
  yes({ randomTurn: true });
  L.surprise.randTurn = 4;
  no({ randomTurn: true });
  yes({ turnMin: 3 });
  no({ turnMin: 4 });
  L.turn = 4;
  yes({ turnsLeftMax: 2 });
  L.turn = 3;
  no({ turnsLeftMax: 2 });
  // 절반이 지난 턴: 6턴 = 3, 7턴 = 4, 8턴 = 4
  yes({ halfway: true });
  L.turn = 4;
  no({ halfway: true });
  L.turns = 7;
  yes({ halfway: true });
  L.turns = 8;
  yes({ halfway: true });
  L.turns = 6;
  L.special = true;
  yes({ special: true });
  L.special = false;
  no({ special: true });
  yes({ zoneIn: ["physical", "defense"] });
  no({ zoneIn: ["pass"] });
  L.buffs.mood = 3;
  yes({ buffAtLeast: { key: "mood", n: 3 } });
  no({ buffAtLeast: { key: "mood", n: 4 } });
  L.buffs.steal = 3;
  yes({ buffEquals: { key: "steal", n: 3 } });
  L.buffs.steal = 4;
  no({ buffEquals: { key: "steal", n: 3 } });
  // 점수
  assert.deepEqual([L.target, L.cap], [344, 416]);
  L.score = 304;
  yes({ scoreToTargetMax: 40, notCleared: true });
  L.score = 303;
  no({ scoreToTargetMax: 40 });
  L.score = 171;
  yes({ scoreBelowTargetFrac: 0.5 });
  L.score = 172;
  no({ scoreBelowTargetFrac: 0.5 });
  L.score = 336;
  yes({ capLeftMax: 80, notPerfect: true });
  L.score = 335;
  no({ capLeftMax: 80 });
  L.score = 344;
  no({ notCleared: true });
  L.score = 416;
  no({ notPerfect: true });
  // 체력: 결장 · 쉬는 선수는 세지 않는다 (벤치는 센다)
  full(s);
  P(s, "p3").stamina = 29;
  yes({ anyStaminaBelow: 30 });
  L.bench = ["p3"];
  yes({ anyStaminaBelow: 30 }, "벤치도 센다");
  L.bench = [];
  L.rested = ["p3"];
  no({ anyStaminaBelow: 30 }, "쉬는 선수는 빼고");
  L.rested = [];
  L.out = ["p3"];
  no({ anyStaminaBelow: 30 }, "결장은 빼고");
  L.out = [];
  // 여러 키는 AND
  no({ anyStaminaBelow: 30, special: true });
  assert.throws(() => LS.condTrue(s, d, { cond: { nope: 1 } }), /모르는 키 'nope'/);
});

test("조건 키 (§24.8): 턴 기록 키 — 실패 (다친 선수는 빠진다) · 코치 카드 성공 · 원 카드 n명 모두 성공 · 다시 섞기 · 벤치 · 연속 대상 · 빈 구역", () => {
  const d = sdata([]);
  const s = start(d);
  const L = s.lesson;
  const yes = (cond, msg) => assert.equal(LS.condTrue(s, d, { cond }), true, msg || JSON.stringify(cond));
  const no = (cond, msg) => assert.equal(LS.condTrue(s, d, { cond }), false, msg || JSON.stringify(cond));
  const play = (o) => ({ uid: "k1", cardId: "cd_basic", family: "common", kind: "single", shape: null, targets: [], failed: null, coach: null, ownerId: null, ...o });
  L.turnLog = LS.turnLogBlank();
  for (const k of ["failedThisTurn", "coachCardOkThisTurn", "reshuffledThisTurn", "benchedThisTurn"]) no({ [k]: true }, k);
  no({ multiOkThisTurn: 3 });
  L.turnLog.failed = ["p3"];
  yes({ failedThisTurn: true });
  L.out = ["p3"];
  no({ failedThisTurn: true }, "실패로 다친 선수만 있으면 거짓");
  L.out = [];
  L.turnLog.plays = [play({ kind: "circle", coach: "sp_coach_harr", targets: ["p6", "p7"], failed: "p7" })];
  no({ coachCardOkThisTurn: true }, "실패한 코치 카드");
  L.turnLog.plays.push(play({ kind: "circle", coach: "sp_coach_harr", targets: ["p6", "p7"] }));
  yes({ coachCardOkThisTurn: true });
  L.turnLog.plays = [play({ kind: "circle", targets: ["p1", "p2"] })];
  no({ multiOkThisTurn: 3 }, "2명");
  L.turnLog.plays = [play({ kind: "circle", targets: ["p1", "p2", "p3"], failed: "p2" })];
  no({ multiOkThisTurn: 3 }, "실패가 있다");
  L.turnLog.plays = [play({ kind: "all", targets: ["p1", "p2", "p3", "p4"] })];
  no({ multiOkThisTurn: 3 }, "전원 카드는 원 카드가 아니다");
  L.turnLog.plays = [play({ kind: "circle", targets: ["p1", "p2", "p3"] })];
  yes({ multiOkThisTurn: 3 });
  L.turnLog.reshuffled = true;
  yes({ reshuffledThisTurn: true });
  L.turnLog.benched = ["p2"];
  yes({ benchedThisTurn: true });
  // 연속 대상: 지금 턴에 이어진 것만
  L.turn = 3;
  L.streak = { p2: { n: 3, turn: 3 }, p4: { n: 5, turn: 2 } };
  yes({ targetStreak: 3 });
  no({ targetStreak: 4 }, "p4 는 이번 턴에 끊겼다");
  L.turnLog.emptyAtStart = ["shoot"];
  yes({ zoneEmptyAtTurnStart: "shoot" });
  no({ zoneEmptyAtTurnStart: "pass" });
});

test("조건 키 (§24.8): char — 편성 · 결장 아님 · 쉼 아님은 늘, 체력 · 대상 횟수 · 대상 안 된 턴 · 구역 · 구역 인원 · 혼자 · 옮김 · 이번 턴 대상 · 자기 고유 카드", () => {
  const d = sdata([]);
  const s = full(start(d));
  setZones(s);
  const L = s.lesson;
  L.turnLog = LS.turnLogBlank();
  const yes = (c, msg) => assert.equal(LS.condTrue(s, d, { cond: { char: c } }), true, msg || JSON.stringify(c));
  const no = (c, msg) => assert.equal(LS.condTrue(s, d, { cond: { char: c } }), false, msg || JSON.stringify(c));
  const T = "ch_human_runner"; // p5 타리아 (패스 구역)
  yes({ id: T });
  no({ id: "ch_cat_trickster" }, "편성에 없다");
  L.out = ["p5"];
  no({ id: T }, "결장");
  L.out = [];
  L.rested = ["p5"];
  no({ id: T }, "쉼");
  L.rested = [];
  P(s, "p5").stamina = 60;
  yes({ id: T, staminaMin: 60 });
  no({ id: T, staminaMin: 61 });
  P(s, "p5").stamina = 29;
  yes({ id: T, staminaMax: 29 });
  no({ id: T, staminaMax: 28 });
  L.targeted = { p5: 2 };
  yes({ id: T, targetedMin: 2 });
  no({ id: T, targetedMin: 3 });
  no({ id: T, targetedMax: 1 });
  yes({ id: T, targetedMax: 2 });
  // 대상이 안 된 턴 = 지금 턴 − 마지막 대상 턴 (없으면 지금 턴)
  L.turn = 4;
  L.lastTargeted = { p5: 2 };
  assert.equal(LS.untargetedTurns(L, "p5"), 2);
  assert.equal(LS.untargetedTurns(L, "p6"), 4);
  yes({ id: T, untargetedTurnsMin: 2 });
  no({ id: T, untargetedTurnsMin: 3 });
  // 구역: 경기장 (벤치 아님)
  yes({ id: T, zone: "pass" });
  no({ id: T, zone: "shoot" });
  yes({ id: T, zoneCountMin: 2 }, "패스 구역 p4 · p5");
  no({ id: T, zoneCountMin: 3 });
  no({ id: T, aloneInZone: true });
  L.bench = ["p4"];
  yes({ id: T, aloneInZone: true }, "p4 가 벤치면 혼자");
  L.bench = ["p5"];
  no({ id: T, zone: "pass" }, "벤치에 앉은 선수는 구역에 서 있지 않다");
  L.bench = [];
  yes({ id: "ch_wolf_winger", aloneInZone: true }, "슈팅 구역 p6 혼자");
  no({ id: T, movedThisTurn: true });
  L.turnLog.moved = ["p5"];
  yes({ id: T, movedThisTurn: true });
  no({ id: T, targetedThisTurn: true });
  L.turnLog.plays = [{ uid: "k9", cardId: "cd_u_taria", family: "unique", kind: "owner", shape: "move", targets: ["p5"], failed: "p5", coach: null, ownerId: "p5" }];
  yes({ id: T, targetedThisTurn: true });
  no({ id: T, ownCardThisTurn: true }, "자기 고유 카드가 실패했다");
  L.turnLog.plays[0].failed = null;
  yes({ id: T, ownCardThisTurn: true });
  no({ id: "ch_wolf_winger", ownCardThisTurn: true });
});

// ---------------------------------------------------------------------------
// 턴 기록 (실제 카드 · 벤치 · 뽑기)
// ---------------------------------------------------------------------------

test("턴 기록: playCard (대상 · 실패 · 코치 · 고유 주인 · 옮김) · benchPlayer (벤치 · 연속 끊김) · 뽑기 다시 섞기 · beginTurn 이 비운다 · 연속 대상은 단일 · 주인 카드만", () => {
  const d = sdata([]); // 깜짝은 켰지만 이벤트가 없다 — 뜨지 않는다
  const s = full(start(d, { extra: ["cd_c_harr", "cd_coaching", "cd_coaching", "cd_coaching", "cd_coaching"] }));
  const L = s.lesson;
  const coachings = s.deck.filter((e) => e.cardId === "cd_coaching").map((e) => e.uid);
  // 1턴: 단일 카드 → p3
  setZones(s);
  forceHand(s, [coachings[0]]);
  s.rngState = SAFE;
  lesson.playCard(s, d, { uid: coachings[0], playerId: "p3" });
  // 손패가 비어 턴이 끝났다 → 2턴 기록은 비었다 (playsLeft 1)
  assert.equal(L.turn, 2);
  same(L.turnLog.plays, []);
  assert.deepEqual(L.streak.p3, { n: 1, turn: 1 });
  assert.equal(L.lastTargeted.p3, 1);
  // 2턴: 코치 카드 (원, 슈팅 구역) 성공 → 기록에 coach · kind circle
  setZones(s);
  const harr = uidOf(s, "cd_c_harr");
  forceHand(s, [harr, coachings[1]]);
  L.playsLeft = 2;
  s.rngState = SAFE;
  lesson.playCard(s, d, { uid: harr, at: { ...d.lesson.zones.centers.shoot } });
  const p0 = L.turnLog.plays[0];
  assert.deepEqual([p0.cardId, p0.kind, p0.coach, p0.failed, p0.family], ["cd_c_harr", "circle", "sp_coach_harr", null, "coach"]);
  assert.deepEqual(p0.targets, ["p6"]);
  assert.equal(L.streak.p6, undefined, "원 카드는 연속 대상에 세지 않는다");
  assert.equal(L.lastTargeted.p6, 2);
  // 같은 턴 단일 카드 → p3 연속 2
  s.rngState = SAFE;
  lesson.playCard(s, d, { uid: coachings[1], playerId: "p3" });
  assert.equal(L.turn, 3);
  // 3턴: 벤치 → 기록 · 연속 끊김, 돌아오면 기록에서 빠진다
  setZones(s);
  assert.deepEqual(L.streak.p3, { n: 2, turn: 2 });
  lesson.benchPlayer(s, d, { playerId: "p3" });
  assert.deepEqual(L.turnLog.benched, ["p3"]);
  assert.equal(L.streak.p3, undefined);
  lesson.benchPlayer(s, d, { playerId: "p3", on: false });
  assert.deepEqual(L.turnLog.benched, []);
  // 실패 (다치지 않음) → failed · plays[].failed (턴이 끝나지 않게 2장)
  const taria = uidOf(s, "cd_u_taria");
  P(s, "p4").stamina = 5;
  forceHand(s, [coachings[2], taria]);
  L.playsLeft = 2;
  s.rngState = FAIL_NO_INJURY;
  lesson.playCard(s, d, { uid: coachings[2], playerId: "p4" });
  assert.equal(L.turn, 3);
  assert.deepEqual(L.turnLog.failed, ["p4"]);
  assert.equal(L.turnLog.plays[0].failed, "p4");
  assert.ok(!L.out.includes("p4"), "다치지 않았다");
  assert.ok(LS.condTrue(s, d, { cond: { failedThisTurn: true } }));
  // 타리아 고유 카드 (자리 옮기기) → moved · 고유 카드 주인 · 연속 대상에 센다
  s.rngState = SAFE;
  lesson.playCard(s, d, { uid: taria, zone: "shoot" });
  assert.ok(L.lastFx.some((f) => f.t === "move" && f.id === "p5"));
  assert.deepEqual(L.streak.p5, { n: 1, turn: 3 }, "고유 카드 주인은 연속 대상에 센다");
  assert.equal(L.turn, 4, "손패가 비어 턴 끝 → 4턴 기록은 새로");
  same(L.turnLog.moved, []);
  // 4턴: 옮김 기록 (턴이 안 끝나게 2장) — 3턴에 이어 연속 2
  setZones(s);
  forceHand(s, [taria, coachings[0]]);
  L.playsLeft = 2;
  s.rngState = SAFE;
  lesson.playCard(s, d, { uid: taria, zone: "dribble" });
  assert.deepEqual(L.turnLog.moved, ["p5"]);
  assert.deepEqual(L.turnLog.plays.map((x) => [x.cardId, x.family, x.kind, x.shape, x.ownerId]), [["cd_u_taria", "unique", "owner", "move", "p5"]]);
  assert.deepEqual(L.streak.p5, { n: 2, turn: 4 });
  assert.ok(LS.condTrue(s, d, { cond: { char: { id: "ch_human_runner", movedThisTurn: true, ownCardThisTurn: true, targetedThisTurn: true } } }));
});

test("턴 기록: 다시 섞기 (뽑을 더미가 비어 버린 더미를 섞은 턴) · 연속 대상 n턴 이어짐 · 한 턴 거르면 1 부터", () => {
  const d = sdata([]);
  const s = full(start(d, { season: 3, extra: ["cd_coaching", "cd_coaching", "cd_coaching"] }));
  const L = s.lesson;
  const coachings = s.deck.filter((e) => e.cardId === "cd_coaching").map((e) => e.uid);
  const playOn = (uid, id) => {
    setZones(s);
    forceHand(s, [uid]);
    s.rngState = SAFE;
    lesson.playCard(s, d, { uid, playerId: id });
  };
  playOn(coachings[0], "p3"); // 1턴
  playOn(coachings[1], "p3"); // 2턴
  playOn(coachings[2], "p3"); // 3턴
  assert.deepEqual(L.streak.p3, { n: 3, turn: 3 });
  // 4턴: 대상이 아니다 → 5턴에 다시 대상이면 1
  lesson.endLessonTurn(s, d);
  playOn(coachings[0], "p3"); // 5턴
  assert.deepEqual(L.streak.p3, { n: 1, turn: 5 });
  // 다시 섞기: 뽑을 더미를 비우고 턴을 넘기면 새 턴 기록에 reshuffled
  L.discard.push(...L.drawPile);
  L.drawPile = [];
  lesson.endLessonTurn(s, d);
  assert.equal(L.turn, 7, "시즌 3 = 8턴");
  assert.equal(L.turnLog.reshuffled, true);
});

// ---------------------------------------------------------------------------
// 주인공 (§24.3.4)
// ---------------------------------------------------------------------------

test("주인공 후보 (§24.3.4): turnFailer · streaker (같으면 체력 최저) · coachCardTarget · multiTarget · mostTargeted · lowest / highest + zone · pos · random 좁혀 없으면 전원 · char · 결장 · 쉼 제외", () => {
  const d = sdata([]);
  const s = full(start(d));
  setZones(s);
  const L = s.lesson;
  L.turnLog = LS.turnLogBlank();
  const pool = (who, cond = {}) => LS.protagonistPool(s, d, { who, cond });
  L.turnLog.failed = ["p3", "p5"];
  assert.deepEqual(pool({ pick: "turnFailer" }), ["p3", "p5"]);
  L.out = ["p3"];
  assert.deepEqual(pool({ pick: "turnFailer" }), ["p5"], "다친 선수는 빼고");
  L.out = [];
  L.turn = 3;
  L.streak = { p2: { n: 3, turn: 3 }, p4: { n: 3, turn: 3 }, p6: { n: 2, turn: 3 } };
  P(s, "p2").stamina = 40;
  P(s, "p4").stamina = 30;
  assert.deepEqual(pool({ pick: "streaker" }, { targetStreak: 3 }), ["p4"]);
  P(s, "p2").stamina = 30;
  assert.deepEqual(pool({ pick: "streaker" }, { targetStreak: 3 }), ["p2", "p4"]);
  L.turnLog.plays = [
    { uid: "a", cardId: "cd_c_harr", family: "coach", kind: "circle", shape: null, targets: ["p6", "p7"], failed: null, coach: "sp_coach_harr", ownerId: null },
    { uid: "b", cardId: "cd_link_line", family: "team", kind: "circle", shape: null, targets: ["p1", "p2", "p3"], failed: null, coach: null, ownerId: null },
  ];
  assert.deepEqual(pool({ pick: "coachCardTarget" }), ["p6", "p7"]);
  assert.deepEqual(pool({ pick: "multiTarget" }, { multiOkThisTurn: 3 }), ["p1", "p2", "p3"]);
  L.targeted = { p1: 2, p2: 3, p3: 3 };
  assert.deepEqual(pool({ pick: "mostTargeted" }), ["p2", "p3"]);
  full(s);
  P(s, "p1").stamina = 50;
  P(s, "p2").stamina = 40;
  assert.deepEqual(pool({ pick: "lowestStamina", zone: "defense" }), ["p2"]);
  assert.deepEqual(pool({ pick: "highestStamina", zone: "defense" }), ["p1"]);
  P(s, "p5").stamina = 90;
  assert.deepEqual(pool({ pick: "highestStamina", pos: ["MF"] }), ["p4"], "p4 100 > p5 90");
  assert.deepEqual(pool({ pick: "lowestStamina" }), ["p2"]);
  L.zones = { ...L.zones, p6: "pass" };
  delete L.zones.p7;
  L.out = ["p7"];
  assert.deepEqual(pool({ pick: "random", zone: "shoot" }), ["p1", "p2", "p3", "p4", "p5", "p6"], "슈팅 구역에 아무도 없으면 결장 아닌 전원");
  L.rested = ["p1"];
  assert.ok(!pool({ pick: "random" }).includes("p1"));
  assert.deepEqual(pool({ pick: "char", charId: "ch_spirit_keeper" }), [], "쉬는 선수");
  assert.deepEqual(pool({ pick: "char", charId: "ch_human_runner" }), ["p5"]);
  assert.deepEqual(pool({ pick: "none" }), []);
  // 고르기: 후보 하나면 rng 를 쓰지 않는다, 여럿이면 rng.pick
  const r = createRngFromState(5);
  assert.equal(LS.pickSurpriseProtagonist(s, d, { who: { pick: "char", charId: "ch_human_runner" }, cond: {} }, r), "p5");
  assert.equal(r.getState(), 5);
  const picked = LS.pickSurpriseProtagonist(s, d, { who: { pick: "random" }, cond: {} }, r);
  assert.notEqual(r.getState(), 5);
  assert.ok(["p2", "p3", "p4", "p5", "p6"].includes(picked));
  assert.equal(LS.pickSurpriseProtagonist(s, d, { who: { pick: "none" }, cond: {} }, r), null);
});

test("후보 (candidates): 범위 · 런 1회 · 방침 · 시즌 · chars (all / any, 결장 · 쉼) · 주인공 후보가 없으면 뺀다", () => {
  const evs = [
    E("ls_f_a", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])]),
    E("ls_f_pol", ALWAYS, { pick: "random" }, [CH("가", [{ type: "buff", n: 1 }]), CH("나", [{ type: "score", amount: 10 }])], { policy: "counter" }),
    E("ls_f_s3", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])], { seasons: [3] }),
    E("ls_f_pair", ALWAYS, { pick: "char", charId: "ch_spirit_keeper" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])], { chars: ["ch_spirit_keeper", "ch_dwarf_wall"] }),
    E("ls_f_any", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])], { chars: ["ch_cat_trickster", "ch_dwarf_wall"], charMode: "any" }),
    E("ls_f_nofail", ALWAYS, { pick: "turnFailer" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])]),
    E("ls_f_none", ALWAYS, null, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])], { text: "코치진이 박수를 칩니다." }),
  ];
  const d = sdata(evs);
  const s = full(start(d));
  const ids = () => LS.candidates(s, d).map((e) => e.id);
  assert.deepEqual(ids(), [], "1턴 끝은 범위 밖 (fromTurn 2)");
  s.lesson.turn = 2;
  assert.deepEqual(ids(), ["ls_f_a", "ls_f_pair", "ls_f_any", "ls_f_none"]);
  s.lesson.turn = 6;
  assert.deepEqual(ids(), [], "마지막 턴 끝은 범위 밖");
  s.lesson.turn = 2;
  s.usedEventIds = ["ls_f_a"];
  s.policy = "counter";
  s.season = 3;
  assert.deepEqual(ids(), ["ls_f_pol", "ls_f_s3", "ls_f_pair", "ls_f_any", "ls_f_none"]);
  s.lesson.out = ["p2"];
  assert.deepEqual(ids(), ["ls_f_pol", "ls_f_s3", "ls_f_none"], "도르비나 결장 → 짝 (all) · any (미르카 없음) 둘 다 빠진다");
  s.lesson.out = [];
  s.lesson.rested = ["p1"];
  assert.ok(!ids().includes("ls_f_pair"), "네리아가 쉬면 빠진다");
  s.lesson.rested = [];
  s.lesson.turnLog.failed = ["p4"];
  assert.ok(ids().includes("ls_f_nofail"), "실패한 선수가 있으면 turnFailer 이벤트도 후보");
  // shouldCheck: 계획 · 아직 없음 · 기다리는 것 없음 · 켜짐
  assert.equal(LS.shouldCheck(s, d), true);
  s.lesson.surprise.planned = false;
  assert.equal(LS.shouldCheck(s, d), false);
  s.lesson.surprise.planned = true;
  s.lesson.surprise.fired = { eventId: "x" };
  assert.equal(LS.shouldCheck(s, d), false);
  s.lesson.surprise.fired = null;
  const off = clone(d);
  off.lesson.events.surprise.enabled = false;
  assert.equal(LS.shouldCheck(s, off), false);
});

// ---------------------------------------------------------------------------
// 띄우기 · 잠금 · 해결
// ---------------------------------------------------------------------------

test("띄우기 (§24.8): fromTurn 끝부터 · 마지막 턴 끝에는 없음 · 무작위 턴 이벤트는 정해 둔 턴에만 · 다음 턴을 시작하지 않고 멈춘다 (fx surprise)", () => {
  const always = E("ls_f_always", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])]);
  // fromTurn 2: 1턴 끝은 그냥 넘어가고 2턴 끝에 뜬다
  const d = sdata([always]);
  const s = start(d);
  lesson.endLessonTurn(s, d);
  assert.equal(s.lesson.turn, 2);
  assert.equal(pending(s), null);
  lesson.endLessonTurn(s, d);
  const pend = pending(s);
  assert.ok(pend);
  assert.deepEqual([pend.eventId, pend.turn, s.lesson.turn, s.lesson.hand.length, s.lesson.playsLeft], ["ls_f_always", 2, 2, 0, 0]);
  assert.ok(s.lesson.lastFx.some((f) => f.t === "surprise" && f.eventId === "ls_f_always" && f.playerId === pend.playerId));
  assert.ok(!s.lesson.lastFx.some((f) => f.t === "scatter"), "다음 턴을 시작하지 않았다");
  assert.deepEqual(s.usedEventIds, ["ls_f_always"]);
  // fromTurn 3
  const d3 = sdata([always], { fromTurn: 3 });
  const s3 = start(d3);
  lesson.endLessonTurn(s3, d3);
  lesson.endLessonTurn(s3, d3);
  assert.equal(pending(s3), null);
  lesson.endLessonTurn(s3, d3);
  assert.equal(pending(s3).turn, 3);
  // 마지막 턴 끝에만 맞는 조건 → 뜨지 않는다
  const lastOnly = E("ls_f_lastonly", { turnsLeftMax: 0 }, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])]);
  const dl = sdata([lastOnly]);
  const sl = start(dl);
  for (let i = 0; i < 20 && sl.lesson.status === "playing"; i++) lesson.endLessonTurn(sl, dl);
  assert.notEqual(sl.lesson.status, "playing");
  assert.equal(sl.lesson.surprise.fired, null);
  // 무작위 턴 이벤트: 정해 둔 턴 끝에 뜬다 (여러 seed)
  const dr = sdata([FIX.rand]);
  for (let seed = 1; seed <= 12; seed++) {
    const sr = start(dr, { seed });
    const want = sr.lesson.surprise.randTurn;
    while (!pending(sr)) lesson.endLessonTurn(sr, dr);
    assert.equal(pending(sr).turn, want, `seed ${seed}`);
  }
  // 계획이 없으면 (chance 0) 조건이 맞아도 뜨지 않는다
  const d0 = sdata([always], { chance: 0 });
  const s0 = start(d0);
  for (let i = 0; i < 20 && s0.lesson.status === "playing"; i++) lesson.endLessonTurn(s0, d0);
  assert.equal(s0.lesson.surprise.fired, null);
});

test("기다리는 동안 (§24.8): 카드 내기 · 벤치 · 턴 끝 · forceSurprise 는 throw, 뷰 = surprise 말풍선 · canEndTurn / canBench false · 해결 검사는 바꾸기 전에", () => {
  const d = sdata([FIX.low]);
  const s = full(start(d, { extra: ["cd_coaching"] }));
  P(s, "p6").stamina = 20;
  lesson.endLessonTurn(s, d);
  lesson.endLessonTurn(s, d);
  assert.ok(pending(s));
  assert.equal(pending(s).playerId, "p6");
  const uid = s.deck[0].uid;
  assert.throws(() => lesson.playCard(s, d, { uid, at: { x: 50, y: 50 } }), /깜짝/);
  assert.throws(() => lesson.benchPlayer(s, d, { playerId: "p1" }), /깜짝/);
  assert.throws(() => lesson.endLessonTurn(s, d), /깜짝/);
  assert.throws(() => lesson.forceSurprise(s, d, { eventId: "ls_f_low" }), /깜짝/);
  const v = lesson.getLessonView(s, d);
  assert.equal(v.canEndTurn, false);
  assert.equal(v.canBench, false);
  assert.deepEqual(v.hand, []);
  const sv = v.surprise;
  assert.deepEqual([sv.id, sv.playerId, sv.charId, sv.name, sv.title], ["ls_f_low", "p6", "ch_wolf_winger", "울리카", "깜짝 ls_f_low"]);
  assert.equal(sv.text, "울리카가 숨을 고르며 웃습니다.");
  assert.deepEqual(sv.choices.map((c) => c.label), ["한 번 더 맡긴다", "쉬게 한다"]);
  assert.deepEqual(sv.choices.map((c) => c.preview), ["다음 카드 실패 판정 없음", "울리카 이번 레슨 남은 턴 쉼 (대상 제외, 체력 +20)"]);
  assert.equal(sv.choices.filter((c) => c.recommended).length, 1);
  // 해결 검사: 선택지 번호 · 기다리는 것 없음 — 바꾸지 않는다
  const before = JSON.stringify(s);
  assert.throws(() => lesson.resolveSurprise(s, d, { choice: 2 }), /선택지 번호/);
  assert.throws(() => lesson.resolveSurprise(s, d, {}), /선택지 번호/);
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => lesson.resolveSurprise(start(d), d, { choice: 0 }), /기다리는 레슨 깜짝/);
  // 뷰 · 미리보기는 순수
  lesson.getLessonView(s, d);
  assert.equal(JSON.stringify(s), before);
});

test("반말판 (§24.3.5): 주인공이 반말 선수면 alt.banmal 본문 · 결과 문구", () => {
  const d = sdata([FIX.low]);
  const s = full(start(d));
  // 그레타 (p7) 자리에 헤르타 (반말) 를 넣는다
  const herta = d.characters.find((c) => c.id === "ch_giant_keeper");
  Object.assign(P(s, "p7"), { charId: herta.id, name: herta.name });
  P(s, "p7").stamina = 10;
  lesson.endLessonTurn(s, d);
  lesson.endLessonTurn(s, d);
  const sv = lesson.getLessonView(s, d).surprise;
  assert.equal(sv.playerId, "p7");
  assert.equal(sv.text, "헤르타가 숨을 몰아쉰다. \"...괜찮아. 한 번 더.\"");
  lesson.resolveSurprise(s, d, { choice: 0 });
  assert.equal(s.lesson.surprise.fired.result, "헤르타가 이를 악문다.");
  assert.ok(s.lesson.lastFx.some((f) => f.t === "surpriseResult" && f.text === "헤르타가 이를 악문다."));
});

test("해결 (§24.8): 효과 → fx surpriseResult → pending 비움 · fired 기록 → 다음 턴 시작 (손패 · 흩어지기) · seq · rng 저장 · 레슨당 1번 · 런당 1번", () => {
  const a = E("ls_f_a", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }], "가를 골랐습니다."), CH("나", [{ type: "score", amount: 10 }], "나를 골랐습니다.")]);
  const b = E("ls_f_b", ALWAYS, { pick: "random" }, [CH("가", [{ type: "nextNoFail" }]), CH("나", [{ type: "score", amount: 10 }])]);
  const d = sdata([a, b]);
  const s = full(start(d));
  lesson.endLessonTurn(s, d);
  lesson.endLessonTurn(s, d);
  const first = pending(s).eventId;
  const seq = s.lesson.seq;
  const rng0 = s.rngState;
  lesson.resolveSurprise(s, d, { choice: 0 });
  const L = s.lesson;
  assert.equal(L.surprise.pending, null);
  assert.deepEqual([L.surprise.fired.eventId, L.surprise.fired.choice, L.surprise.fired.branch, L.surprise.fired.turn], [first, 0, null, 2]);
  assert.equal(L.turn, 3);
  assert.equal(L.hand.length, 3);
  assert.equal(L.playsLeft, 1);
  assert.equal(L.buffs.nextNoFail, true);
  assert.equal(L.seq, seq + 1);
  assert.notEqual(s.rngState, rng0, "다음 턴 흩어지기 · 뽑기");
  assert.deepEqual(L.lastFx.map((f) => f.t).slice(0, 3), ["buff", "surpriseResult", "scatter"]);
  const res = L.lastFx.find((f) => f.t === "surpriseResult");
  assert.deepEqual([res.eventId, res.choice, res.lines], [first, 0, ["다음 카드 실패 판정 없음"]]);
  assert.equal(lesson.getLessonView(s, d).surprise, null);
  assert.equal(lesson.getLessonView(s, d).canEndTurn, true);
  // 레슨당 1번: 조건이 늘 참이어도 이번 레슨에는 더 없다
  for (let i = 0; i < 20 && L.status === "playing"; i++) lesson.endLessonTurn(s, d);
  assert.equal(L.surprise.fired.eventId, first);
  // 런당 1번: 다음 레슨은 다른 이벤트, 그다음은 없다
  const s2 = lesson.startLesson(s, d, { zone: "pass" });
  while (!pending(s2) && s2.lesson.status === "playing") lesson.endLessonTurn(s2, d);
  const second = pending(s2).eventId;
  assert.notEqual(second, first);
  lesson.resolveSurprise(s2, d, { choice: 1 });
  for (let i = 0; i < 20 && s2.lesson.status === "playing"; i++) lesson.endLessonTurn(s2, d);
  const s3 = lesson.startLesson(s2, d, { zone: "pass" });
  for (let i = 0; i < 20 && s3.lesson.status === "playing"; i++) lesson.endLessonTurn(s3, d);
  assert.equal(s3.lesson.surprise.fired, null);
  assert.deepEqual(s3.usedEventIds.slice().sort(), ["ls_f_a", "ls_f_b"]);
});

test("해결: random 갈래 (같은 rngState = 같은 갈래, 결과 문구 then / else) · 점수가 상한에 닿으면 퍼펙트로 끝 (남은 턴 퍼펙트 체력)", () => {
  const d = sdata([FIX.rand]);
  const seen = new Set();
  for (let seed = 1; seed <= 30 && seen.size < 2; seed++) {
    const s = full(start(d, { seed }));
    while (!pending(s)) lesson.endLessonTurn(s, d);
    const c = clone(s);
    lesson.resolveSurprise(s, d, { choice: 0 });
    lesson.resolveSurprise(c, d, { choice: 0 });
    same(s, c, "같은 상태 · 같은 갈래");
    const f = s.lesson.surprise.fired;
    seen.add(f.branch);
    assert.equal(f.result, f.branch === "then" ? "넘었습니다." : "엉켰습니다.");
    if (f.branch === "then") assert.equal(s.lesson.surprise.bonus, 40);
    else assert.equal(s.lesson.buffs.nextPct, -0.2);
  }
  assert.deepEqual([...seen].sort(), ["else", "then"]);
  // 상한: 점수 +40 으로 상한에 닿으면 끝 (퍼펙트) — 다음 턴을 시작하지 않는다
  const top = E("ls_f_top", ALWAYS, { pick: "random" }, [CH("간다", [{ type: "score", amount: 40 }]), CH("만다", [{ type: "tp", amount: 5 }])]);
  const dt = sdata([top]);
  const s = full(start(dt));
  lesson.endLessonTurn(s, dt);
  lesson.endLessonTurn(s, dt);
  s.lesson.score = s.lesson.cap - 30;
  for (const p of s.players) p.stamina = 50;
  const sv = lesson.getLessonView(s, dt).surprise;
  assert.equal(sv.choices[0].preview, "이번 레슨 점수 +40 (상한에 닿아 퍼펙트로 끝)");
  lesson.resolveSurprise(s, dt, { choice: 0 });
  assert.equal(s.lesson.status, "perfect");
  assert.equal(s.lesson.turn, 2);
  const bonus = dt.lesson.lesson.perfectStaminaPerTurn * (s.lesson.turns - 2);
  assert.ok(s.players.every((p) => p.stamina === 50 + bonus), "남은 턴 퍼펙트 체력");
  assert.deepEqual(s.lesson.lastFx.map((f) => f.t).filter((t) => t === "surpriseResult" || t === "end"), ["surpriseResult", "end"]);
});

// ---------------------------------------------------------------------------
// 레슨 안 효과 (§24.4.2)
// ---------------------------------------------------------------------------

/** 그 효과 하나짜리 고정 이벤트를 2턴 끝에 띄우고 (forceSurprise) 0번을 고른다 */
function applyOne(effects, { who = { pick: "char", charId: "ch_human_runner" }, cond = { char: { id: "ch_human_runner" } }, policy, prep, playerId, supportId, extra = [], seedState } = {}) {
  const ev = E("ls_f_one", cond, who, [CH("가", effects, "골랐습니다."), CH("나", [{ type: "tp", amount: 1 }])], policy ? { policy } : {});
  const d = sdata([ev], { chance: 0 }); // 계획은 없고 forceSurprise 로만
  const s = full(start(d, { policy: policy || "team", extra }));
  if (prep) prep(s);
  lesson.endLessonTurn(s, d);
  if (seedState) s.rngState = seedState;
  lesson.forceSurprise(s, d, { eventId: "ls_f_one", playerId, supportId });
  assert.ok(pending(s), "forceSurprise 가 띄웠다");
  const view = lesson.getLessonView(s, d).surprise;
  lesson.resolveSurprise(s, d, { choice: 0 });
  return { s, d, view };
}

test("레슨 안 효과: nextPct (± · −100% 아래 없음) · nextNoFail · drawNext (다음 턴 손패) · extraPlayNext (다음 턴 playsLeft, 한 번만)", () => {
  let r = applyOne([{ type: "nextPct", pct: 40 }]);
  assert.equal(r.s.lesson.buffs.nextPct, 0.4);
  assert.ok(r.s.lesson.lastFx.some((f) => f.t === "buff" && f.key === "nextPct" && f.to === 0.4));
  r = applyOne([{ type: "nextPct", pct: -20 }], { prep: (s) => (s.lesson.buffs.nextPct = 0.1) });
  assert.equal(r.s.lesson.buffs.nextPct, -0.1);
  r = applyOne([{ type: "nextPct", pct: -100 }, { type: "nextPct", pct: -100 }]);
  assert.equal(r.s.lesson.buffs.nextPct, -1);
  r = applyOne([{ type: "nextNoFail" }]);
  assert.equal(r.s.lesson.buffs.nextNoFail, true);
  // 다음 카드 실패율 0 (체력이 낮아도)
  r.s.players.forEach((p) => (p.stamina = 10));
  setZones(r.s);
  const single = r.s.lesson.hand.find((u) => lesson.lessonCardDef(r.s, r.d, u).target.kind === "single" && Number.isFinite(lesson.lessonCardDef(r.s, r.d, u).power));
  if (single) assert.equal(lesson.previewCard(r.s, r.d, { uid: single, playerId: "p1" }).failRate, 0);
  r = applyOne([{ type: "drawNext", n: 1 }]);
  assert.equal(r.s.lesson.hand.length, 4);
  assert.equal(r.s.lesson.drawNext, 0);
  r = applyOne([{ type: "extraPlayNext", n: 1 }]);
  assert.equal(r.s.lesson.playsLeft, 2);
  assert.equal(r.s.lesson.nextExtraPlay, 0);
  lesson.endLessonTurn(r.s, r.d);
  assert.equal(r.s.lesson.playsLeft, 1, "다음 턴부터는 다시 1");
});

test("레슨 안 효과: score (점수에만 · bonus 기록 — 점수 = 기본 + 분위기 + 카드 + 깜짝) · buff (방침 버프 한 단위 · key · 상한)", () => {
  let r = applyOne([{ type: "score", amount: 40 }]);
  const L = r.s.lesson;
  const sum = (m) => Object.values(m).reduce((a, x) => a + x, 0);
  assert.equal(L.surprise.bonus, 40);
  assert.equal(L.score, sum(L.baseGains) + sum(L.moodGains) + sum(L.cardGains) + L.surprise.bonus);
  assert.ok(L.lastFx.some((f) => f.t === "score" && f.n === 40 && f.src === "surprise"));
  // 팀형: 분위기 +1 (방침의 첫 버프) — 3 → (1 · 2턴 끝 감소) 1 → +1 = 2
  r = applyOne([{ type: "buff", n: 1 }], { policy: "team", prep: (s) => (s.lesson.buffs.mood = 3) });
  assert.equal(r.s.lesson.buffs.mood, 2);
  assert.equal(r.view.choices[0].preview, "분위기 +1 (1 → 2)");
  // 역습형: 탈취 상한 4 — 이미 4면 그대로, 미리보기 "이미 최대"
  r = applyOne([{ type: "buff", n: 1 }], { policy: "counter", prep: (s) => (s.lesson.buffs.steal = 4) });
  assert.equal(r.s.lesson.buffs.steal, 4);
  assert.match(r.view.choices[0].preview, /이미 최대 4/);
  assert.match(r.s.lesson.surprise.fired.lines[0], /탈취 이미 최대/);
  // 압박형: 압박 +1단계 (2 → 3, 최대)
  r = applyOne([{ type: "buff", n: 1 }], { policy: "press", prep: (s) => (s.lesson.buffs.press = 2) });
  assert.equal(r.s.lesson.buffs.press, 3);
  assert.equal(r.view.choices[0].preview, "압박 +1단계 (2 → 3, 최대)");
  // 에이스형: key 로 호조 · 집중을 가른다 (key 가 없으면 첫 버프 = 호조)
  r = applyOne([{ type: "buff", n: 1, key: "focus" }], { policy: "ace" });
  assert.deepEqual([r.s.lesson.buffs.focus, r.s.lesson.buffs.hojo], [1, 0]);
  r = applyOne([{ type: "buff", n: 1 }], { policy: "ace" });
  assert.deepEqual([r.s.lesson.buffs.focus, r.s.lesson.buffs.hojo], [0, 1]);
  assert.equal(r.view.choices[0].preview, "호조 +1장 (0 → 1)");
});

test("레슨 안 효과: restRemaining (쉬는 선수 — 흩어지기 · 대상 · 기본 훈련 · 벤치 제외, 벤치 칸과 따로, 체력 +N 지금) · injureNow (결장 · 다음 레슨 1회 · 고유 카드 제외)", () => {
  const ev = (effects) => E("ls_f_one", { char: { id: "ch_human_runner" } }, { pick: "char", charId: "ch_human_runner" }, [CH("가", effects), CH("나", [{ type: "tp", amount: 1 }])]);
  // --- 쉬기 ---
  let d = sdata([ev([{ type: "restRemaining", stamina: 20 }])], { chance: 0 });
  let s = start(d);
  for (const p of s.players) p.stamina = 50;
  lesson.endLessonTurn(s, d); // 2턴
  setZones(s);
  lesson.benchPlayer(s, d, { playerId: "p5" });
  lesson.forceSurprise(s, d, { eventId: "ls_f_one" });
  const st0 = P(s, "p5").stamina; // 벤치 회복 +15 뒤
  lesson.resolveSurprise(s, d, { choice: 0 });
  let L = s.lesson;
  assert.deepEqual(L.rested, ["p5"]);
  assert.equal(P(s, "p5").stamina, Math.min(100, st0 + 20));
  assert.ok(!("p5" in L.zones), "다음 턴에 흩어지지 않는다");
  assert.ok(!L.bench.includes("p5"));
  assert.equal(cards.isOut(s, P(s, "p5")), true);
  assert.equal(cards.isRested(s, "p5"), true);
  assert.ok(!cards.activePlayers(s).some((p) => p.id === "p5"));
  assert.ok(!cards.fieldPlayers(s).some((p) => p.id === "p5"));
  assert.throws(() => lesson.benchPlayer(s, d, { playerId: "p5" }), /쉬는 중/);
  const tariaUid = s.deck.find((e) => e.cardId === "cd_u_taria").uid;
  assert.equal(cards.deadReason(s, lesson.lessonCardDef(s, d, tariaUid)), "주인이 이번 레슨은 쉬는 중입니다");
  const pv = lesson.getLessonView(s, d).players.find((p) => p.id === "p5");
  assert.deepEqual([pv.out, pv.rested, pv.injured, pv.zone, pv.baseNext], [true, true, false, null, 0]);
  assert.equal(L.bench.length, 0, "벤치 칸을 쓰지 않는다");
  // 남은 턴: 기본 훈련 · 체력 소모 없음, 다른 선수는 그대로
  const st1 = P(s, "p5").stamina;
  const stat1 = { ...P(s, "p5").stats };
  for (let i = 0; i < 20 && L.status === "playing"; i++) lesson.endLessonTurn(s, d);
  assert.equal(L.status, "fail");
  assert.equal(P(s, "p5").stamina, st1);
  same(P(s, "p5").stats, stat1);
  assert.equal(P(s, "p5").injuredTurns || 0, 0, "쉼은 결장이 아니다 (다음 레슨은 나온다)");
  // --- 지금 결장 ---
  d = sdata([ev([{ type: "injureNow" }])], { chance: 0 });
  s = start(d);
  for (const p of s.players) p.stamina = 80;
  lesson.endLessonTurn(s, d);
  lesson.forceSurprise(s, d, { eventId: "ls_f_one" });
  const inj0 = s.lesson.stats.injuries;
  lesson.resolveSurprise(s, d, { choice: 0 });
  L = s.lesson;
  assert.ok(L.out.includes("p5"));
  assert.equal(P(s, "p5").injuredTurns, 1);
  assert.equal(L.stats.injuries, inj0 + 1);
  assert.ok(L.removed.includes(tariaUid), "고유 카드는 이번 레슨에서 빠진다");
  assert.ok(L.lastFx.some((f) => f.t === "injure" && f.id === "p5" && f.src === "surprise"));
  assert.equal(lesson.getLessonView(s, d).players.find((p) => p.id === "p5").injured, true);
  assert.equal(L.surprise.fired.lines[0], "타리아 결장 (이번 레슨 남은 턴 · 다음 레슨 1회)");
});

test("깜짝의 런 효과 (§24.4.2 끝): 코치 유대 (coach = 이번 턴 코치 카드의 코치) · 체력 · 팀워크 · 컨디션 · TP · coachHint → 그 레슨 보상의 수업 (마지막 레슨이어도 SP 로 바꾸지 않는다)", () => {
  const d = sdata([FIX.coach, FIX.last], { chance: 0 });
  // 코치 카드를 실패 없이 낸 턴 끝 → {코치} = 하르나
  const s = full(start(d, { extra: ["cd_c_harr", "cd_coaching"] }));
  setZones(s);
  const harr = uidOf(s, "cd_c_harr");
  forceHand(s, [harr]);
  s.lesson.turn = 2;
  s.rngState = SAFE;
  s.lesson.surprise.planned = true; // 계획만 켜고 (chance 0 데이터) 조건대로 띄운다
  d.lesson.events.surprise.chance = 1;
  lesson.playCard(s, d, { uid: harr, at: { ...d.lesson.zones.centers.shoot } });
  const pend = pending(s);
  assert.ok(pend, "코치 카드 성공 턴 끝");
  assert.deepEqual([pend.eventId, pend.supportId, pend.playerId], ["ls_f_coach", "sp_coach_harr", "p6"]);
  const sv = lesson.getLessonView(s, d).surprise;
  assert.equal(sv.choices[1].preview, "하르나 유대 +10, 울리카 체력 −10");
  const bond0 = s.supports.find((x) => x.id === "sp_coach_harr").bond;
  const st0 = P(s, "p6").stamina;
  lesson.resolveSurprise(s, d, { choice: 1 });
  assert.equal(s.supports.find((x) => x.id === "sp_coach_harr").bond, bond0 + 10);
  assert.equal(P(s, "p6").stamina, st0 - 10);
  assert.equal(s.lesson.surprise.fired.result, "코치 하르나가 울리카를 붙잡았습니다.");
  // 컨디션 · 팀워크 · TP
  const r = applyOne([{ type: "condition", amount: 1 }, { type: "teamwork", amount: 3 }, { type: "tp", amount: 5 }]);
  assert.deepEqual([r.s.condition, r.s.teamwork, r.s.trainingPoints], [3, 3, 5]);
  // coachHint: 레슨 안에서는 지금 레슨이 남은 레슨 — 마지막 주 (turnIndex 14) 대비 레슨이어도 "SP 로" 가 아니다
  const ch = E("ls_f_hint", { char: { id: "ch_human_runner" } }, { pick: "char", charId: "ch_human_runner" }, [CH("가", [{ type: "coachHint", from: "fielded" }]), CH("나", [{ type: "tp", amount: 1 }])]);
  const dh = sdata([ch], { chance: 0 });
  const sh = full(start(dh, { season: 3 }));
  Object.assign(sh, { turnIndex: 14, turn: 5 });
  lesson.endLessonTurn(sh, dh);
  lesson.forceSurprise(sh, dh, { eventId: "ls_f_hint" });
  assert.equal(lesson.getLessonView(sh, dh).surprise.choices[0].preview, "코치 수업 1 (편성 코치 액티브 중 무작위)");
  lesson.resolveSurprise(sh, dh, { choice: 0 });
  assert.equal(sh.pendingTeach.length, 1);
  assert.equal(sh.pendingTeach[0].src, "event");
});

test("깜짝에서 얻은 코치 수업은 그 레슨의 보상에서 가르친다 (lessonRun — resolveSurprise → afterLesson 의 수업 대기열 맨 앞)", () => {
  const ch = E("ls_f_hint", { char: { id: "ch_human_runner" } }, { pick: "char", charId: "ch_human_runner" }, [CH("가", [{ type: "coachHint", from: "fielded" }]), CH("나", [{ type: "tp", amount: 1 }])]);
  const d = sdata([ch], { chance: 0 });
  const s = LR.createRun({ data: d, seed: 3 });
  assert.equal(s.phase, "week");
  LR.applyWeekAction(s, d, { type: "lesson", zone: "pass" });
  LR.endLessonTurn(s, d);
  lesson.forceSurprise(s, d, { eventId: "ls_f_hint" });
  LR.resolveSurprise(s, d, { choice: 0 });
  assert.ok(s.log.some((x) => /^레슨 깜짝 \[깜짝 ls_f_hint\] 가 → 코치 수업: /.test(x.text)), s.log.map((x) => x.text).join(" / "));
  assert.equal(s.pendingTeach.length, 1);
  const skill = s.pendingTeach[0].skillId;
  while (s.phase === "lesson") LR.endLessonTurn(s, d);
  assert.equal(s.phase, "reward");
  assert.equal(s.pendingTeach.length, 0);
  assert.equal(s.pendingReward.teach[0].skillId, skill);
  assert.equal(s.pendingReward.teach[0].src, "event");
});

// ---------------------------------------------------------------------------
// lessonRun · 결정성 · 저장
// ---------------------------------------------------------------------------

test("lessonRun.resolveSurprise: phase lesson 에서만 · 점수가 상한에 닿으면 바로 보상 단계 · 기다리는 동안 LR.playCard / endLessonTurn 은 throw", () => {
  const top = E("ls_f_top", ALWAYS, { pick: "random" }, [CH("간다", [{ type: "score", amount: 200 }]), CH("만다", [{ type: "tp", amount: 5 }])]);
  const d = sdata([top]);
  const s = LR.createRun({ data: d, seed: 9 });
  LR.applyWeekAction(s, d, { type: "lesson", zone: "pass" });
  while (!pending(s)) LR.endLessonTurn(s, d);
  assert.throws(() => LR.endLessonTurn(s, d), /깜짝/);
  assert.throws(() => LR.playCard(s, d, { uid: s.deck[0].uid, at: { x: 50, y: 50 } }), /깜짝/);
  assert.equal(LR.getLessonView(s, d).surprise.id, "ls_f_top");
  s.lesson.score = s.lesson.cap - 150;
  LR.resolveSurprise(s, d, { choice: 0 });
  assert.equal(s.lesson.status, "perfect");
  assert.equal(s.phase, "reward");
  assert.throws(() => LR.resolveSurprise(s, d, { choice: 0 }), /phase 'lesson'/);
});

test("결정성 · JSON 왕복 · v5 저장본 다시 읽기 (깜짝을 기다리는 중) — 같은 seed 면 같은 깜짝 · 같은 결과", () => {
  const d = sdata(Object.values(FIX));
  const go = (seed, roundtrip) => {
    let s = LR.createRun({ data: d, seed, policy: "team" });
    const trail = [];
    let guard = 0;
    while (s.phase !== "finished") {
      if (++guard > 3000) throw new Error("끝나지 않는다");
      if (s.phase === "lesson" && pending(s)) {
        trail.push(`${s.turnIndex}:${pending(s).eventId}:${pending(s).playerId}`);
        if (roundtrip) {
          s = JSON.parse(JSON.stringify(s));
          LR.migrateLessonRun(s, d);
          assert.ok(LR.isLessonRun(s));
        }
      }
      M.autoStep(s, d, { playMatch: NO_MATCH });
      if (roundtrip) s = JSON.parse(JSON.stringify(s));
    }
    return { s, trail };
  };
  const a = go("det-1", false);
  const b = go("det-1", true);
  assert.ok(a.trail.length >= 2, `깜짝 ${a.trail.length}`);
  assert.deepEqual(a.trail, b.trail);
  same(a.s.players, b.s.players);
  same(a.s.usedEventIds, b.s.usedEventIds);
  assert.equal(a.s.rngState, b.s.rngState);
  // 런당 같은 깜짝은 한 번
  const ids = a.trail.map((x) => x.split(":")[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("저장한 뒤 데이터에서 빠진 깜짝: 말풍선은 \"계속한다\" 하나 (효과 없음) · 고르면 효과 없이 다음 턴 · 다른 선택지 번호는 throw · 감독 AI 도 넘어간다", () => {
  const d = sdata([FIX.rand]);
  const s = full(start(d));
  while (!pending(s)) lesson.endLessonTurn(s, d);
  const gone = clone(d);
  gone.lesson_ev_surprise.events = [];
  const v = lesson.getLessonView(s, gone).surprise;
  assert.deepEqual([v.missing, v.choices.length, v.choices[0].label, v.choices[0].preview, v.choices[0].recommended], [true, 1, "계속한다", "효과 없음", true]);
  const turn = s.lesson.turn;
  const before = JSON.stringify(s);
  assert.throws(() => lesson.resolveSurprise(s, gone, { choice: 1 }), /선택지 번호/);
  assert.equal(JSON.stringify(s), before);
  const t = clone(s);
  lesson.resolveSurprise(s, gone, { choice: 0 });
  assert.deepEqual([s.lesson.turn, s.lesson.surprise.pending, s.lesson.surprise.fired.missing, s.lesson.surprise.fired.lines], [turn + 1, null, true, []]);
  // 감독 AI (lessonRun 런 상태로)
  t.phase = "lesson";
  assert.deepEqual(M.recommendSurprise(t, gone), { choice: 0, eventId: "ls_f_rand" });
});

test("감독 AI 15주 완주 (방침 5개, 깜짝 켬 · 고정 이벤트): 깜짝이 뜨고 고른다 · 뷰는 늘 surprise 를 싣는다 · 끄면 같은 seed 에서 깜짝 필드가 없다", () => {
  const d = sdata(Object.values(FIX));
  let total = 0;
  for (const policy of ["ace", "team", "counter", "press", "poss"]) {
    const s = LR.createRun({ data: d, seed: `all-${policy}`, policy });
    let guard = 0;
    while (s.phase !== "finished") {
      if (++guard > 3000) throw new Error(`${policy}: 끝나지 않는다`);
      if (s.phase === "lesson" && pending(s)) {
        total += 1;
        const v = LR.getLessonView(s, d);
        assert.ok(v.surprise && v.surprise.choices.length === 2 && !v.canEndTurn && !v.canBench);
        assert.ok(!/[{}]/.test(v.surprise.text + v.surprise.title + v.surprise.choices.map((c) => c.label + c.preview).join("")), v.surprise.text);
        const rec = M.recommendCard(s, d);
        assert.equal(rec.kind, "surprise");
      }
      M.autoStep(s, d, { playMatch: NO_MATCH });
    }
    assert.ok(s.log.filter((x) => x.text.startsWith("레슨 깜짝 [")).length >= 1, `${policy}: 로그`);
  }
  assert.ok(total >= 10, `깜짝 ${total}`);
  // 끄면: 깜짝 필드 없음 · 로그 없음
  const off = clone(d);
  off.lesson.events.surprise.enabled = false;
  const s = LR.createRun({ data: off, seed: "all-team", policy: "team" });
  let sawLesson = false;
  while (s.phase !== "finished") {
    if (s.phase === "lesson") {
      sawLesson = true;
      assert.ok(!("surprise" in s.lesson) && !("turnLog" in s.lesson));
    }
    M.autoStep(s, off, { playMatch: NO_MATCH });
  }
  assert.ok(sawLesson);
  assert.ok(!s.log.some((x) => x.text.startsWith("레슨 깜짝")));
});

test("미리보기 (lessonEffects.describe) — 레슨 안 효과 글 (§24.4.2 예시) · 레슨 밖 적용은 throw", () => {
  const d = sdata([]);
  const s = full(start(d));
  const ctx = { playerId: "p5", trigger: "surprise" };
  const t = (e) => LF.describe(s, d, [e], ctx).text;
  assert.equal(t({ type: "nextPct", pct: 40 }), "다음 카드 위력 +40%");
  assert.equal(t({ type: "nextPct", pct: -20 }), "다음 카드 위력 −20%");
  assert.equal(t({ type: "nextNoFail" }), "다음 카드 실패 판정 없음");
  assert.equal(t({ type: "drawNext", n: 1 }), "다음 턴 손패 +1");
  assert.equal(t({ type: "extraPlayNext", n: 1 }), "다음 턴 카드 1장 더 낼 수 있다");
  assert.equal(t({ type: "score", amount: 40 }), "이번 레슨 점수 +40");
  assert.equal(t({ type: "buff", n: 1 }), "분위기 +1 (0 → 1)");
  assert.equal(t({ type: "restRemaining", stamina: 20 }), "타리아 이번 레슨 남은 턴 쉼 (대상 제외, 체력 +20)");
  assert.equal(t({ type: "injureNow" }), "타리아 결장 (이번 레슨 남은 턴도)");
  // 레슨 밖 (ctx.applyLesson 없음) 적용은 바꾸기 전에 throw
  const before = JSON.stringify(s);
  assert.throws(() => LF.applyEffects(s, d, [{ type: "tp", amount: 5 }, { type: "score", amount: 10 }], ctx, createRngFromState(1)), /레슨 안 효과/);
  assert.equal(JSON.stringify(s), before);
});

test("검사: buff 의 key 는 방침 버프 · 이벤트 맨 위 policy 와 같이 · 그 방침의 버프만", () => {
  const ok = E("ls_f_k", ALWAYS, { pick: "random" }, [CH("가", [{ type: "buff", n: 1, key: "focus" }]), CH("나", [{ type: "buff", n: 1, key: "hojo" }])], { policy: "ace" });
  sdata([ok]);
  const errs = (ev) => {
    const d = loadData();
    d.lesson_ev_surprise = { version: 1, notes: {}, events: [ev] };
    return LE.lessonEventErrors(d).join("\n");
  };
  assert.match(errs({ ...ok, choices: [CH("가", [{ type: "buff", n: 1, key: "speed" }]), ok.choices[1]] }), /buff 의 key 'speed' — 방침 버프/);
  const { policy, ...noPol } = ok;
  void policy;
  assert.match(errs(noPol), /buff 의 key 는 이벤트 맨 위 policy 와 같이 쓴다/);
  assert.match(errs({ ...ok, policy: "team" }), /buff 의 key 'focus' 는 team 방침의 버프가 아니다/);
});
