// test/lessonRules.test.mjs — 엔진 감사 (ENGINE AUDIT): 규칙 항목 중 다른 테스트가 직접 보지 않던 것.
//   OUTGAME_LESSON_draft 10.1 키 매핑 (trainingEfficiency · injuryRate · bondGain · hintRate · restEffect + D30),
//   D6 턴 끝 틱 퍼펙트 → 런 보상 (D5), D22 대비 레슨 부상 → 경계전 유스 → 다음 레슨 −1, 경기 전 준비 뷰 prepBonus.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as lesson from "../js/engine/lesson.js";
import * as cards from "../js/engine/cards.js";
import { createRngFromState } from "../js/engine/rng.js";

const data = loadData();
const R = cards.roundCost;
const WIN = { winner: "home", homeGoals: 2, awayGoals: 0 };
const P = (s, id) => s.players.find((p) => p.id === id);
const sup = (s, id) => s.supports.find((x) => x.id === id);

function rngWhere(pred) {
  for (let s = 1; s < 200000; s++) if (pred(createRngFromState(s))) return s;
  throw new Error("rng 상태를 찾지 못했습니다");
}
/** 다음 실패 판정이 나지 않는 rng 상태 */
const SAFE = rngWhere((r) => r.next() >= 0.96);
/** 다음 실패 판정(≤ 45%)과 부상 판정(50%)이 모두 나는 rng 상태 */
const FAIL_INJURE = rngWhere((r) => r.next() < 0.4 && r.next() < 0.4);

function newRun(opts = {}) {
  return LR.createRun({ data, seed: opts.seed ?? 11, policy: opts.policy });
}

/** 휴식 위주로 until 까지 걷는다 */
function walk(s, until) {
  for (let g = 0; !until(s); g++) {
    if (g > 500) throw new Error(`walk (${s.phase})`);
    if (s.phase === "week") LR.applyWeekAction(s, data, { type: "rest" });
    else if (s.phase === "lesson") LR.lessonRest(s, data, { playerId: "p1" });
    else if (s.phase === "reward") LR.resolveReward(s, data, { pick: null });
    else if (s.phase === "consult") LR.endConsult(s, data);
    else if (s.phase === "prep") LR.confirmPrep(s, data, {});
    else if (s.phase === "match") LR.finishMatch(s, data, WIN);
    else if (s.phase === "relic") LR.chooseRelic(s, data, s.pendingRelicChoices[0]);
    else if (s.phase === "route") LR.chooseRoute(s, data, "rt_camp");
    else throw new Error(s.phase);
  }
  return s;
}

function forceHand(s, uids) {
  const L = s.lesson;
  const old = L.hand.filter((u) => !uids.includes(u));
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.hand = uids.slice();
  L.drawPile.push(...old);
}

function startLessonWeek(s, stat, specials = []) {
  s.weekOffer = { kind: "lesson", specials };
  LR.applyWeekAction(s, data, { type: "lesson", stat });
  return s;
}

const addDeck = (s, cardId) => {
  const uid = `k${s.nextUid++}`;
  s.deck.push({ uid, cardId, plus: false });
  return uid;
};

// ---------------------------------------------------------------------------

test("10.1 키 매핑: trainingEfficiency = 카드 상승 · 분위기 틱 배율, injuryRate = 카드 실패율 +%p (뷰 포함)", () => {
  const s = newRun();
  s.modifiers.push({ key: "trainingEfficiency", amount: 0.2, untilSeason: null }, { key: "injuryRate", amount: 0.05, untilSeason: null });
  startLessonWeek(s, "pass");
  const uid = s.deck.find((e) => e.cardId === "cd_coaching").uid;
  forceHand(s, [uid]);
  const pv = LR.previewCard(s, data, { uid, taps: ["p4"] });
  assert.equal(R(pv.failRate * 100), 7, "체력 100: 2% + 5%p");
  assert.equal(R(LR.getLessonView(s, data).players[0].failRate * 100), 7);
  const p4 = P(s, "p4");
  const before = p4.stats.pass;
  s.lesson.buffs.mood = 2;
  s.rngState = SAFE;
  LR.playCard(s, data, { uid, taps: ["p4"] }); // 손패가 비어 턴 끝 → 분위기 틱
  const card = R(35 * p4.growth.pass * 1.2);
  const tick = R(2 * 1.5 * p4.growth.pass * 1.2);
  assert.equal(p4.stats.pass - before, card + tick);
});

test("10.1 키 매핑: bondGain 은 코치 카드를 낼 때만 (+8 + 3), 카드 획득 +15 · 같은 종목 클리어 +5 에는 더하지 않는다", () => {
  const s = newRun();
  s.modifiers.push({ key: "bondGain", amount: 3, untilSeason: null });
  const uid = addDeck(s, "cd_c_harr");
  startLessonWeek(s, "shoot");
  const b0 = sup(s, "sp_coach_harr").bond;
  forceHand(s, [uid]);
  s.rngState = SAFE;
  LR.playCard(s, data, { uid });
  assert.equal(sup(s, "sp_coach_harr").bond, b0 + 8 + 3);
  s.lesson.score = s.lesson.target; // 클리어 → 같은 종목(슈팅) 코치 +5
  while (s.phase === "lesson") LR.lessonRest(s, data, { playerId: "p1" });
  assert.equal(sup(s, "sp_coach_harr").bond, b0 + 11 + 5);
  // 보상에서 코치 카드 획득 +15 (bondGain 없음)
  s.pendingReward.offer = [{ cardId: "cd_c_celia", plus: false, kind: "add" }];
  const c0 = sup(s, "sp_wind_dancer").bond;
  LR.resolveReward(s, data, { pick: 0 });
  assert.equal(sup(s, "sp_wind_dancer").bond, c0 + 15);
});

test("10.1 키 매핑: hintRate 는 클리어 때 힌트 1개 더 (확률), 실패 레슨에는 없다", () => {
  const s = newRun();
  s.modifiers.push({ key: "hintRate", amount: 1, untilSeason: null });
  startLessonWeek(s, "pass");
  s.lesson.score = s.lesson.target;
  while (s.phase === "lesson") LR.lessonRest(s, data, { playerId: "p1" });
  assert.equal(s.pendingReward.result.status, "clear");
  assert.equal(s.pendingReward.result.hints.length + s.pendingReward.result.sp / data.lesson.rewards.noHintSp, 2);

  const t = newRun();
  t.modifiers.push({ key: "hintRate", amount: 1, untilSeason: null });
  startLessonWeek(t, "pass");
  while (t.phase === "lesson") LR.lessonRest(t, data, { playerId: "p1" });
  assert.equal(t.pendingReward.result.status, "fail");
  assert.equal(t.pendingReward.result.hints.length, 0);
  assert.equal(t.pendingReward.result.sp, 0);
});

test("10.1 키 매핑 · D30: restEffect 는 주 휴식에만, 레슨 중 쉬기는 늘 +20 / +5", () => {
  const s = newRun();
  s.modifiers.push({ key: "restEffect", amount: -0.3, untilSeason: null });
  for (const p of s.players) p.stamina = 10;
  assert.equal(LR.getWeekView(s, data).restGain, 28);
  LR.applyWeekAction(s, data, { type: "rest" });
  assert.ok(s.players.every((p) => p.stamina === 38));
  walk(s, (x) => x.phase === "week" && x.weekOffer.kind === "lesson");
  for (const p of s.players) p.stamina = 10;
  startLessonWeek(s, "pass");
  LR.lessonRest(s, data, { playerId: "p3" });
  assert.equal(P(s, "p3").stamina, 30);
  assert.ok(s.players.filter((p) => p.id !== "p3").every((p) => p.stamina === 15));
});

test("D5 · D6: 턴 끝 분위기 틱으로 상한에 닿아도 퍼펙트 — 그 턴까지 쓴 것으로 세고, 보상은 TP 20 · 힌트 2 · 무료 강화 1 (클리어 보상과 겹치지 않음)", () => {
  const s = newRun({ policy: "team" });
  startLessonWeek(s, "pass");
  const L = s.lesson;
  L.turn = 3;
  L.score = L.cap - 1;
  L.buffs.mood = 5;
  for (const p of s.players) p.stamina = 40;
  const tp0 = s.trainingPoints;
  const tw0 = s.teamwork;
  LR.lessonRest(s, data, { playerId: "p1" });
  assert.equal(s.phase, "reward");
  const r = s.pendingReward.result;
  assert.equal(r.status, "perfect");
  assert.equal(r.turnReached, 3);
  assert.equal(s.trainingPoints - tp0, data.lesson.rewards.perfect.tp);
  assert.equal(r.hints.length + r.sp / data.lesson.rewards.noHintSp, data.lesson.rewards.perfect.hints);
  assert.equal(s.pendingReward.freeUpgrades, 1);
  assert.equal(s.teamwork - tw0, data.lesson.teamwork.clear);
  // 체력: 쉬기 (p1 +20 · 나머지 +5) → 자율 훈련 +10 (대상 없음) → 퍼펙트 5 × (6 − 3)
  assert.equal(P(s, "p1").stamina, 40 + 20 + 10 + 15);
  assert.equal(P(s, "p2").stamina, 40 + 5 + 10 + 15);
});

test("D22: 대비 레슨에서 다치면 바로 뒤 경계전 · 원정 친선전에서 유스, 다음 시즌 첫 레슨이 끝나면 −1", () => {
  const s = newRun();
  walk(s, (x) => x.phase === "week" && x.turn === 5);
  LR.applyWeekAction(s, data, { type: "lesson", stat: "defense" });
  const uid = s.deck.find((e) => e.cardId === "cd_coaching").uid;
  forceHand(s, [uid]);
  P(s, "p4").stamina = 10;
  s.rngState = FAIL_INJURE;
  LR.playCard(s, data, { uid, taps: ["p4"] });
  assert.equal(s.lesson.stats.injuries, 1);
  assert.ok(s.lesson.out.includes("p4"));
  assert.ok(s.lesson.removed.includes(s.deck.find((e) => e.cardId === "cd_u_silluen").uid));
  walk(s, (x) => x.phase === "prep");
  assert.equal(P(s, "p4").injuredTurns, 1);
  assert.deepEqual(LR.getPrepView(s, data).injuredOut, ["p4"]);
  LR.confirmPrep(s, data, {});
  assert.ok(LR.getMatchSetup(s, data).home.players.some((p) => p.isYouth && p.replacesPlayerId === "p4"));
  LR.finishMatch(s, data, WIN);
  LR.chooseRelic(s, data, s.pendingRelicChoices[0]);
  LR.chooseRoute(s, data, "rt_expedition");
  assert.equal(s.phase, "match");
  assert.ok(LR.getMatchSetup(s, data).home.players.some((p) => p.isYouth && p.replacesPlayerId === "p4"), "원정 친선전도 유스");
  walk(s, (x) => x.phase === "week");
  assert.equal(P(s, "p4").injuredTurns, 1, "주 시작만으로는 줄지 않는다");
  startLessonWeek(s, "pass");
  assert.deepEqual(s.lesson.outAtStart, ["p4"]);
  while (s.phase === "lesson") LR.lessonRest(s, data, { playerId: "p1" });
  assert.equal(P(s, "p4").injuredTurns, 0);
});

test("경기 전 준비 뷰 prepBonus = 이번 시즌 대비 레슨 클리어만 (유물 '낡은 주장 완장' 의 경계전 컨디션은 아니다)", () => {
  const s = newRun();
  s.relics.push("rl_captain_band");
  s.modifiers.push({ key: "goalMatchCondition", amount: 1, untilSeason: null, source: "relic:rl_captain_band" });
  walk(s, (x) => x.phase === "prep");
  assert.equal(LR.getPrepView(s, data).prepBonus, false, "대비 레슨을 쉬었으면 false");

  const t = newRun();
  t.modifiers.push({ key: "goalMatchCondition", amount: 1, untilSeason: null, source: "relic:rl_captain_band" });
  walk(t, (x) => x.phase === "week" && x.turn === 5);
  LR.applyWeekAction(t, data, { type: "lesson", stat: "defense" });
  t.lesson.score = t.lesson.target;
  while (t.phase === "lesson") LR.lessonRest(t, data, { playerId: "p1" });
  LR.resolveReward(t, data, { pick: null });
  assert.equal(LR.getPrepView(t, data).prepBonus, true);
  // 다음 시즌 경기 전 준비에서는 지난 시즌 대비 보너스가 남지 않는다
  walk(t, (x) => x.phase === "prep" && x.season === 2);
  assert.equal(LR.getPrepView(t, data).prepBonus, false);
});

test("뷰 · 미리보기 · lessonResult 는 rng 를 쓰지 않는다 (rngState 그대로) — 레슨 · 보상 · 상담 · 준비 · 주", () => {
  const s = newRun({ seed: 4 });
  const pure = (fn) => {
    const b = JSON.stringify(s);
    fn();
    assert.equal(JSON.stringify(s), b);
  };
  pure(() => LR.getWeekView(s, data));
  startLessonWeek(s, "dribble");
  pure(() => {
    LR.getLessonView(s, data);
    for (const uid of s.lesson.hand) LR.previewCard(s, data, { uid, taps: [] });
    lesson.lessonResult(s, data);
  });
  s.lesson.score = s.lesson.cap;
  LR.lessonRest(s, data, { playerId: "p1" });
  pure(() => LR.getRewardView(s, data));
});
