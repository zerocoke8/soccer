// test/lessonRun.test.mjs — LESSON_PROTO_PLAN §5.1 · §5.4 · §9.3 · §14.13 · §14.15 (js/engine/lessonRun.js 15주 상태 머신, E4 · ZE4 구역 방식)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run, match } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as cards from "../js/engine/cards.js";
import * as ch from "../js/engine/challenge.js";
import { MAX_HINT_LEVEL } from "../js/engine/training.js";

const data = loadData();
const WPS = data.lesson.weeksPerSeason;
const WIN = { winner: "home", homeGoals: 2, awayGoals: 0 };
const LOSS = { winner: "away", homeGoals: 0, awayGoals: 1 };

const P = (state, id) => state.players.find((p) => p.id === id);
const sup = (state, id) => state.supports.find((s) => s.id === id);
const uidOf = (state, cardId) => state.deck.find((e) => e.cardId === cardId).uid;
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

/** 실패하는 호출은 상태를 바꾸지 않는다 */
function rejects(state, fn) {
  const before = JSON.stringify(state);
  assert.throws(fn);
  assert.equal(JSON.stringify(state), before);
}

/** 매 단계 불변식 (§9.3) */
function checkInvariants(state) {
  assert.equal(state.turnIndex, (state.season - 1) * WPS + state.turn - 1, "turnIndex");
  for (const p of state.players) {
    assert.ok(p.stamina >= 0 && p.stamina <= 100, `stamina ${p.stamina}`);
    assert.ok(p.injuredTurns >= 0, "injuredTurns");
  }
  for (const s of state.supports) assert.ok(s.bond >= 0 && s.bond <= 100, `bond ${s.bond}`);
  assert.ok(Number.isInteger(state.condition) && state.condition >= 0 && state.condition <= 4, `condition ${state.condition}`);
  assert.ok(state.teamwork >= 0 && state.teamwork <= 100, `teamwork ${state.teamwork}`);
  for (const lv of Object.values(state.hints)) assert.ok(lv >= 1 && lv <= MAX_HINT_LEVEL, `hint ${lv}`);
  assert.ok(state.trainingPoints >= 0 && state.skillPoints >= 0);
  const uids = state.deck.map((e) => e.uid);
  assert.equal(new Set(uids).size, uids.length, "덱 uid 중복");
  for (const u of uids) assert.ok(Number(u.slice(1)) < state.nextUid, "nextUid");
  same(JSON.parse(JSON.stringify(state)), state);
  assert.ok(LR.isLessonRun(state));
}

/** 레슨 중 손패를 지정한다 */
function forceHand(state, uids) {
  const L = state.lesson;
  const old = L.hand.filter((u) => !uids.includes(u));
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.hand = uids.slice();
  L.drawPile.push(...old);
}

/** 레슨을 [턴 끝] 만 눌러서 끝낸다 (점수 = 기본 훈련만 → 목표에 못 미친다) */
function endToEnd(state) {
  let guard = 0;
  while (state.phase === "lesson") {
    if (++guard > 20) throw new Error("레슨이 끝나지 않습니다");
    LR.endLessonTurn(state, data);
  }
}

/** 레슨을 클리어로 끝낸다: 마지막 턴으로 건너뛰고 점수 = 목표 → [턴 끝] 1번 (기본 훈련 한 번은 상한에 닿지 않는다) */
function clearLesson(state) {
  const L = state.lesson;
  L.turn = L.turns;
  L.score = L.target;
  LR.endLessonTurn(state, data);
}

/** 레슨을 퍼펙트로 끝낸다: 점수 = 상한 − 1, 실패 없음, cd_basic(전체) 1장 */
function playPerfect(state) {
  const L = state.lesson;
  L.score = L.cap - 1;
  L.buffs.nextNoFail = true;
  const uid = uidOf(state, "cd_basic");
  forceHand(state, [uid]);
  LR.playCard(state, data, { uid, at: { x: 50, y: 50 } });
}

/**
 * 단순 진행 (휴식 위주, 경기는 결과만): until(state) 이 참이 될 때까지.
 * opts.route = 고를 루트, opts.match = 경기 결과
 */
function walk(state, until, opts = {}) {
  let guard = 0;
  while (!until(state)) {
    if (++guard > 500) throw new Error(`walk 가 끝나지 않습니다 (${state.phase})`);
    switch (state.phase) {
      case "week":
        LR.applyWeekAction(state, data, { type: "rest" });
        break;
      case "lesson":
        LR.endLessonTurn(state, data);
        break;
      case "reward":
        LR.resolveReward(state, data, { pick: null });
        break;
      case "consult":
        LR.endConsult(state, data);
        break;
      case "prep":
        LR.confirmPrep(state, data, {});
        break;
      case "match":
        LR.finishMatch(state, data, opts.match || WIN);
        break;
      case "relic":
        LR.chooseRelic(state, data, state.pendingRelicChoices[0]);
        break;
      case "route":
        LR.chooseRoute(state, data, opts.route || "rt_camp");
        break;
      default:
        throw new Error(`walk: phase ${state.phase}`);
    }
  }
  return state;
}

function newRun(opts = {}) {
  return LR.createRun({ data, seed: opts.seed ?? 11, policy: opts.policy, squad: opts.squad, formation: opts.formation });
}

/** 지금 주를 자유 주로 바꾼다 (테스트용) */
function forceFree(state, actions) {
  state.weekOffer = { kind: "free", actions: actions.slice(), guaranteed: actions[0] };
}

/** 레슨 주 레슨을 시작한다 (지금 주를 레슨 주로 바꿔서). zone = 중점 구역 */
function startLessonWeek(state, zone, { specials = [] } = {}) {
  state.weekOffer = { kind: "lesson", specials };
  LR.applyWeekAction(state, data, { type: "lesson", zone });
  return state;
}

// ---------------------------------------------------------------------------

test("createRun: 초기 상태 · 시작 덱 · 시즌 계획 · 1주 offer", () => {
  const s = newRun();
  checkInvariants(s);
  assert.equal(s.kind, "lessonRun");
  assert.equal(s.version, 2);
  assert.equal(s.phase, "week");
  assert.equal(s.policy, data.lesson.defaultPolicy);
  assert.equal(s.season, 1);
  assert.equal(s.turn, 1);
  assert.equal(s.trainingPoints, 0);
  assert.equal(s.record.lessons.length, 0);
  // 시작 덱 = 공용 3 + 배치된 7명의 고유 카드
  const ids = s.deck.map((e) => e.cardId);
  assert.deepEqual(ids.slice(0, 3), data.lesson.startDeck);
  assert.equal(ids.length, 10);
  for (const p of s.players) {
    const u = cards.cardList(data).find((c) => c.family === "unique" && c.ownerCharId === p.charId);
    assert.ok(ids.includes(u.id), p.charId);
  }
  assert.ok(!ids.includes("cd_u_mirka"));
  assert.equal(s.nextUid, 11);
  // 시즌 계획: 2주 · 4주에 상담 · 미팅 하나씩
  assert.deepEqual(Object.values(s.seasonPlan.guaranteed).sort(), ["consult", "meeting"]);
  assert.deepEqual(Object.keys(s.seasonPlan.guaranteed).sort(), ["2", "4"]);
  // 1주 = 레슨 주, 특별 표시 구역 1곳 (secondChance 0, §14.10)
  assert.equal(s.weekOffer.kind, "lesson");
  assert.equal(s.weekOffer.specials.length, 1);
  // 방침
  const a = newRun({ policy: "ace" });
  assert.equal(a.policy, "ace");
  assert.throws(() => LR.createRun({ data, seed: 1, policy: "nope" }));
  assert.throws(() => LR.createRun({ data, seed: "" }));
  // 같은 시드 = 같은 상태
  same(newRun(), newRun());
  // 저장본 검사
  assert.ok(LR.isLessonRun(s));
  assert.ok(!LR.isLessonRun(run.createRun({ data, seed: 1 })));
  assert.ok(!LR.isLessonRun(null));
  assert.equal(LR.migrateLessonRun(clone(s)).kind, "lessonRun");
});

test("저장 v1 → v2 이행 (§14.15): 레슨 · 보상 밖이면 올리고 기록 stat → zone · rests → benches, 레슨 · 보상 중 v1 은 거절", () => {
  const s = newRun();
  startLessonWeek(s, "pass");
  clearLesson(s);
  LR.resolveReward(s, data, { pick: null });
  assert.equal(s.phase, "week");
  // 옛 모양 (version 1) 저장본
  const v1 = clone(s);
  v1.version = 1;
  v1.record.lessons = v1.record.lessons.map(({ zone, benches, ...r }) => ({ ...r, stat: zone, rests: 3 }));
  assert.ok(!LR.isLessonRun(v1));
  assert.ok(LR.isLessonRunSave(v1));
  assert.ok(LR.canMigrateLessonRun(v1));
  assert.equal(LR.migrateLessonRun(v1), v1, "in-place");
  assert.equal(v1.version, 2);
  assert.ok(LR.isLessonRun(v1));
  const rec = v1.record.lessons[0];
  assert.equal(rec.zone, "pass");
  assert.equal(rec.benches, 3);
  assert.ok(!("stat" in rec) && !("rests" in rec));
  same(LR.migrateLessonRun(clone(v1)), v1); // 멱등
  // 이행한 저장본으로 이어서 진행된다
  walk(v1, (x) => x.phase === "week" && x.turn === 3);
  checkInvariants(v1);

  // 레슨 중 · 보상 중인 v1 은 올리지 않는다 (상태 그대로, isLessonRun 거짓 → UI 는 "저장 없음" + 토스트)
  const t = newRun();
  startLessonWeek(t, "pass");
  for (const phase of ["lesson", "reward"]) {
    if (phase === "reward") endToEnd(t);
    assert.equal(t.phase, phase);
    const old = clone(t);
    old.version = 1;
    assert.ok(LR.isLessonRunSave(old));
    assert.ok(!LR.canMigrateLessonRun(old));
    const before = JSON.stringify(old);
    LR.migrateLessonRun(old);
    assert.equal(JSON.stringify(old), before, phase);
    assert.ok(!LR.isLessonRun(old), phase);
  }
  // 그 밖의 저장본은 건드리지 않는다
  assert.equal(LR.migrateLessonRun(null), null);
  assert.ok(!LR.isLessonRunSave({ kind: "lessonRun", version: 3, phase: "week" }));
  assert.ok(!LR.canMigrateLessonRun(run.createRun({ data, seed: 1 })));
});

test("getWeekView: 레슨 주 · 자유 주 · 대비 주 모양, 순수", () => {
  const s = newRun();
  const before = JSON.stringify(s);
  const v = LR.getWeekView(s, data);
  assert.equal(JSON.stringify(s), before);
  assert.equal(v.kind, "lesson");
  assert.equal(v.lessons.length, 5);
  assert.equal(v.weeksPerSeason, WPS);
  assert.equal(v.weeksToMatch, WPS - 1);
  const [t0, c0] = data.lesson.lesson.targets[0];
  assert.deepEqual(v.lessons.map((l) => l.zone), ["shoot", "dribble", "pass", "defense", "physical"]);
  assert.equal(v.lessons.filter((l) => l.special).length, 1);
  assert.deepEqual(v.lessons.filter((l) => l.special).map((l) => l.zone), s.weekOffer.specials);
  const ZW = data.lesson.zones.weights;
  const fw = data.lesson.lesson.focus.weight;
  for (const l of v.lessons) {
    assert.deepEqual(Object.keys(l).sort(), ["boosted", "cap", "expected", "label", "prep", "special", "target", "turns", "zone"]);
    assert.equal(l.turns, data.lesson.lesson.turns[0]);
    if (l.special) {
      // 특별: 목표 ×1.15 · 상한 ×1.2 (§14.12)
      assert.equal(l.target, cards.roundCost(t0 * 1.15));
      assert.equal(l.cap, cards.roundCost(c0 * 1.2));
    } else {
      assert.equal(l.target, t0);
      assert.equal(l.cap, c0);
    }
    // expected = 그 구역을 중점으로 골랐을 때 서 있을 기대 인원 (가중치 식, 소수 1자리)
    let e = 0;
    for (const p of s.players) {
      const w = ZW[p.position];
      const tot = Object.entries(w).reduce((a, [z, n]) => a + n * (z === l.zone ? fw : 1), 0);
      e += (w[l.zone] * fw) / tot;
    }
    assert.equal(l.expected, Math.round(e * 10) / 10, `expected ${l.zone}`);
    // boosted = 그 구역이 주 스탯인 선수 (7명 모두 고유 카드가 덱에 있다)
    assert.deepEqual(l.boosted, s.players.filter((p) => cards.mainStatsOf(p.position).includes(l.zone)).map((p) => p.id), `boosted ${l.zone}`);
  }
  assert.deepEqual(v.lessons.find((l) => l.zone === "defense").boosted, ["p1", "p2", "p3"]);
  assert.deepEqual(v.lessons.find((l) => l.zone === "dribble").boosted, ["p4", "p5", "p6", "p7"]);
  // 결장 선수는 기대 인원 · boosted 에서 빠지고, 덱에 고유 카드가 없으면 boosted 가 아니다
  const t = newRun();
  P(t, "p2").injuredTurns = 1;
  t.deck = t.deck.filter((e) => e.cardId !== "cd_u_neria");
  const tv = LR.getWeekView(t, data);
  assert.deepEqual(tv.lessons.find((l) => l.zone === "defense").boosted, ["p3"]);
  assert.ok(tv.lessons.find((l) => l.zone === "defense").expected < v.lessons.find((l) => l.zone === "defense").expected);
  assert.equal(v.restGain, data.config.rest.stamina);
  assert.deepEqual(Object.keys(v.status).sort(), ["condition", "sp", "teamwork", "tp"]);
  assert.equal(v.coaches.length, 6);
  const lumi = v.coaches.find((c) => c.id === "sp_bard_lumi");
  assert.equal(lumi.type, "physical");
  assert.equal(lumi.cardId, "cd_c_lumi");
  assert.equal(v.deck.length, 10);
  assert.ok(v.nextMatch && v.nextMatch.kind === "goal");
  // 자유 주
  walk(s, (x) => x.turn === 2 && x.phase === "week");
  const f = LR.getWeekView(s, data);
  assert.equal(f.kind, "free");
  assert.equal(f.actions.length, 3);
  assert.equal(f.actions.filter((a) => a.guaranteed).length, 1);
  assert.equal(f.lessons.length, 0);
  // 대비 주
  walk(s, (x) => x.turn === 5 && x.phase === "week");
  const pv = LR.getWeekView(s, data);
  assert.equal(pv.kind, "prep");
  assert.ok(pv.lessons.every((l) => !l.special && l.prep));
  assert.deepEqual(pv.prepCards, ["cd_p_tackle", "cd_p_tackle"]);
});

test("자유 주 보장 · 주 offer · 대비 카드: 시즌마다 상담 · 미팅이 한 번씩 보장된다", () => {
  const expectPrep = { 1: ["cd_p_tackle", "cd_p_tackle"], 2: ["cd_p_intercept", "cd_p_hold"], 3: ["cd_p_intercept", "cd_p_intercept"] };
  for (let seed = 1; seed <= 12; seed++) {
    const s = LR.createRun({ data, seed });
    const seen = {};
    let guard = 0;
    while (s.phase !== "finished") {
      if (++guard > 300) throw new Error("끝나지 않음");
      if (s.phase === "week") {
        const o = s.weekOffer;
        const key = s.season;
        seen[key] = seen[key] || { guaranteed: [], free: 0, lesson: 0, prep: 0 };
        if (o.kind === "free") {
          seen[key].free += 1;
          assert.equal(o.actions.length, data.lesson.freeWeek.slots);
          assert.equal(new Set(o.actions).size, o.actions.length);
          assert.equal(o.actions[0], o.guaranteed);
          assert.ok(o.actions.every((a) => data.lesson.freeWeek.pool.includes(a)));
          seen[key].guaranteed.push(o.guaranteed);
        } else if (o.kind === "lesson") {
          seen[key].lesson += 1;
          assert.equal(o.specials.length, 1);
        } else {
          seen[key].prep += 1;
          assert.equal(s.turn, 5);
          assert.deepEqual(o.prepCards, expectPrep[s.season]);
        }
        assert.equal(o.kind, data.lesson.weekKinds[s.turn - 1]);
      }
      stepRest(s);
      checkInvariants(s);
    }
    for (const season of [1, 2, 3]) {
      assert.deepEqual(seen[season].guaranteed.slice().sort(), ["consult", "meeting"], `seed ${seed} season ${season}`);
      assert.equal(seen[season].lesson, 2);
      assert.equal(seen[season].prep, 1);
    }
  }
});

/** walk 의 한 단계 */
function stepRest(s, opts = {}) {
  let done = false;
  walk(s, () => {
    if (done) return true;
    done = true;
    return false;
  }, opts);
}

test("주 행동: 휴식 · 외출 · 미팅 · 상담 · 친선전 · 레슨, 열리지 않은 행동은 거절", () => {
  // 휴식 → 다음 주
  let s = newRun();
  for (const p of s.players) p.stamina = 30;
  LR.applyWeekAction(s, data, { type: "rest" });
  assert.equal(s.turn, 2);
  assert.equal(s.turnIndex, 1);
  assert.equal(s.phase, "week");
  assert.ok(s.players.every((p) => p.stamina === 70));
  checkInvariants(s);

  // 레슨 주에 자유 주 행동은 안 된다, 자유 주에 레슨은 안 된다
  s = newRun();
  rejects(s, () => LR.applyWeekAction(s, data, { type: "consult" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "outing", playerId: "p1" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "lesson", zone: "nope" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "lesson", stat: "pass" })); // 예전 { stat } 은 받지 않는다
  rejects(s, () => LR.applyWeekAction(s, data, { type: "zzz" }));
  forceFree(s, ["consult", "meeting", "outing"]);
  rejects(s, () => LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "friendly" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "meeting", buy: { skillId: "sk_power_shot", playerId: "p1" } }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "outing", playerId: "p1", free: true }));
  rejects(s, () => LR.playCard(s, data, { uid: "k1" }));
  rejects(s, () => LR.resolveReward(s, data, {}));

  // 외출: 그 선수 +20, 7명 +10, 컨디션 +1
  s = newRun();
  for (const p of s.players) p.stamina = 50;
  forceFree(s, ["meeting", "outing", "friendly"]);
  const cond = s.condition;
  LR.applyWeekAction(s, data, { type: "outing", playerId: "p3" });
  assert.equal(P(s, "p3").stamina, 80);
  assert.ok(s.players.filter((p) => p.id !== "p3").every((p) => p.stamina === 60));
  assert.equal(s.condition, Math.min(4, cond + 1));
  assert.equal(s.turn, 2);
  assert.equal(s.phase, "week");

  // 미팅: 팀워크 +10, 전술 · 배치
  s = newRun();
  forceFree(s, ["meeting", "outing", "friendly"]);
  LR.applyWeekAction(s, data, { type: "meeting", tactics: { attack: "pass" }, swaps: [{ playerId: "p2", slot: "DF2" }] });
  assert.equal(s.teamwork, 10);
  assert.equal(s.tactics.attack, "pass");
  assert.equal(P(s, "p2").slot, "DF2");
  assert.equal(P(s, "p3").slot, "DF1");
  assert.equal(s.turn, 2);

  // 상담: phase consult → 끝내면 다음 주
  s = newRun();
  forceFree(s, ["consult", "meeting", "outing"]);
  LR.applyWeekAction(s, data, { type: "consult" });
  assert.equal(s.phase, "consult");
  assert.equal(s.turn, 1);
  assert.equal(s.consult.stock.length, 3);
  const last = cards.getCard(data, s.consult.stock[2].cardId);
  assert.equal(last.family, "coach");
  assert.ok(s.supports.some((st) => st.id === last.coach.supportId));
  for (const st of s.consult.stock.slice(0, 2)) {
    const c = cards.getCard(data, st.cardId);
    assert.ok(c.pool && (c.family === "common" || c.family === s.policy));
    assert.equal(st.price, c.family === "common" ? 20 : 30);
  }
  LR.endConsult(s, data);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 2);
  assert.equal(s.consult, null);

  // 친선전: phase match → 경기 뒤 (패배 = 유물 없음) 다음 주, 체력 −30
  s = newRun();
  forceFree(s, ["friendly", "meeting", "outing"]);
  LR.applyWeekAction(s, data, { type: "friendly" });
  assert.equal(s.phase, "match");
  assert.equal(s.pendingMatch.kind, "friendly");
  const setup = LR.getMatchSetup(s, data);
  assert.equal(setup.kind, "friendly");
  LR.finishMatch(s, data, LOSS);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 2);
  assert.ok(s.players.every((p) => p.stamina === 70));
  assert.equal(s.record.friendlies.length, 1);
  checkInvariants(s);

  // 레슨 → phase lesson (휴식은 레슨 주에도 열린다)
  s = newRun();
  const sp = s.weekOffer.specials[0];
  LR.applyWeekAction(s, data, { type: "lesson", zone: sp });
  assert.equal(s.phase, "lesson");
  assert.equal(s.lesson.zone, sp);
  assert.equal(s.lesson.special, true);
  assert.equal(s.lesson.target, cards.roundCost(data.lesson.lesson.targets[0][0] * 1.15));
  assert.equal(s.lesson.cap, cards.roundCost(data.lesson.lesson.targets[0][1] * 1.2));
  assert.equal(s.lesson.prep, false);
  assert.equal(s.lesson.status, "playing");
  assert.equal(s.lesson.seq, 0);
  checkInvariants(s);
});

test("레슨 → 보상 → 주: 클리어 보상 · 건너뛰기 TP · 중점 구역 = 코치 타입 유대 +5 · 힌트 1 · 기록 · perPlayer", () => {
  const s = newRun();
  startLessonWeek(s, "shoot");
  const harr0 = sup(s, "sp_coach_harr").bond;
  const tw0 = s.teamwork;
  LR.benchPlayer(s, data, { playerId: "p1", on: true });
  clearLesson(s);
  assert.equal(s.phase, "reward");
  assert.equal(s.lesson.status, "clear");
  assert.equal(s.trainingPoints, data.lesson.rewards.clear.tp);
  assert.equal(s.teamwork, tw0 + data.lesson.teamwork.clear);
  assert.equal(sup(s, "sp_coach_harr").bond, harr0 + data.lesson.bond.sameTypeClear);
  assert.equal(sup(s, "sp_wind_dancer").bond, data.supports.find((x) => x.id === "sp_wind_dancer").initialBond);
  assert.equal(Object.values(s.hints).reduce((a, b) => a + b, 0), 1);
  const hintId = Object.keys(s.hints)[0];
  assert.ok(s.supports.some((st) => data.supports.find((x) => x.id === st.id).hintSkillIds.includes(hintId)));
  const rec = s.record.lessons.at(-1);
  assert.deepEqual(Object.keys(rec).sort(), ["benches", "cap", "fails", "injuries", "plays", "prep", "result", "score", "special", "target", "turnIndex", "turns", "zone"]);
  assert.equal(rec.result, "clear");
  assert.equal(rec.zone, "shoot");
  assert.equal(rec.special, false);
  assert.equal(rec.turnIndex, 0);
  assert.equal(rec.turns, data.lesson.lesson.turns[0]);
  assert.equal(rec.benches, 1);
  assert.equal(rec.plays, 0);
  assert.ok(rec.score > rec.target && rec.score < rec.cap, `점수 ${rec.score}`);
  checkInvariants(s);

  const before = JSON.stringify(s);
  const v = LR.getRewardView(s, data);
  assert.equal(JSON.stringify(s), before);
  assert.equal(v.result.status, "clear");
  assert.equal(v.result.tp, 10);
  assert.equal(v.result.hints.length, 1);
  assert.equal(v.result.teamwork, 3);
  assert.ok(v.result.bond.some((b) => b.id === "sp_coach_harr" && b.gain === 5));
  assert.equal(v.result.zone, "shoot");
  assert.equal(v.result.benches, 1);
  assert.ok(!("stat" in v.result) && !("rests" in v.result));
  // perPlayer = lessonResult 모양 (§14.13)
  assert.equal(v.result.perPlayer.length, 7);
  for (const pp of v.result.perPlayer) {
    assert.deepEqual(Object.keys(pp).sort(), ["base", "benched", "byStat", "card", "id", "mood", "sub", "targeted"]);
    assert.deepEqual(Object.keys(pp.byStat).sort(), ["defense", "dribble", "pass", "physical", "shoot"]);
  }
  const pp1 = v.result.perPlayer.find((x) => x.id === "p1");
  assert.equal(pp1.benched, 1);
  assert.equal(pp1.base, 0, "벤치 선수는 기본 훈련 없음");
  // 마지막 턴 1번의 기본 훈련만 → 점수 − 목표 = 기본 + 분위기 + 카드 합 = byStat 합 (부 스탯 없음)
  const sumGain = v.result.perPlayer.reduce((a, x) => a + x.base + x.mood + x.card, 0);
  assert.equal(sumGain, rec.score - rec.target);
  assert.equal(v.result.perPlayer.reduce((a, x) => a + Object.values(x.byStat).reduce((b, n) => b + n, 0), 0), sumGain);
  assert.equal(v.offer.length, 3);
  assert.equal(new Set(v.offer.map((o) => o.cardId)).size, 3);
  for (const o of v.offer) {
    const c = cards.getCard(data, o.cardId);
    if (o.kind === "upgrade") assert.ok(c.family === "unique" && s.deck.some((e) => e.uid === o.uid && !e.plus));
    else assert.ok((c.pool && (c.family === "common" || c.family === s.policy)) || (c.family === "coach" && s.supports.some((st) => st.id === c.coach.supportId)));
  }
  assert.equal(v.freeUpgrades, 0);
  rejects(s, () => LR.resolveReward(s, data, { pick: 5 }));
  rejects(s, () => LR.resolveReward(s, data, { pick: null, upgradeUid: "k1" }));
  rejects(s, () => LR.applyWeekAction(s, data, { type: "rest" }));

  LR.resolveReward(s, data, { pick: null });
  assert.equal(s.trainingPoints, 20);
  assert.equal(s.lesson, null);
  assert.equal(s.pendingReward, null);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 2);
  checkInvariants(s);
});

test("보상: 코치 카드 획득 유대 +15, 고유 강화 후보, 퍼펙트 TP · 힌트 2 · 무료 강화", () => {
  // 코치 카드 고르기 → 덱 +1, 유대 +15
  let s = newRun();
  startLessonWeek(s, "pass");
  clearLesson(s);
  s.pendingReward.offer = [
    { cardId: "cd_c_harr", plus: false, kind: "add" },
    { cardId: "cd_u_neria", plus: true, kind: "upgrade", uid: uidOf(s, "cd_u_neria") },
  ];
  const b0 = sup(s, "sp_coach_harr").bond;
  const n0 = s.deck.length;
  LR.resolveReward(s, data, { pick: 0 });
  assert.equal(s.deck.length, n0 + 1);
  assert.equal(s.deck.at(-1).cardId, "cd_c_harr");
  assert.equal(s.deck.at(-1).uid, `k${n0 + 1}`);
  assert.equal(sup(s, "sp_coach_harr").bond, b0 + data.lesson.bond.acquire);
  assert.equal(s.trainingPoints, 10); // 건너뛰기가 아니므로 +10 없음

  // 고유 강화 후보 고르기 → plus
  s = newRun();
  startLessonWeek(s, "pass");
  clearLesson(s);
  s.pendingReward.offer = [{ cardId: "cd_u_neria", plus: true, kind: "upgrade", uid: uidOf(s, "cd_u_neria") }];
  LR.resolveReward(s, data, { pick: 0 });
  assert.equal(s.deck.find((e) => e.cardId === "cd_u_neria").plus, true);
  assert.equal(s.deck.length, 10);

  // 퍼펙트: TP 20, 힌트 2, 무료 강화 1, 남은 턴 체력 보너스
  s = newRun();
  startLessonWeek(s, "defense");
  for (const p of s.players) p.stamina = 60;
  playPerfect(s);
  assert.equal(s.phase, "reward");
  assert.equal(s.lesson.status, "perfect");
  assert.equal(s.trainingPoints, data.lesson.rewards.perfect.tp);
  assert.equal(Object.values(s.hints).reduce((a, b) => a + b, 0), 2);
  assert.equal(s.pendingReward.freeUpgrades, 1);
  assert.equal(s.teamwork >= 3, true);
  assert.equal(sup(s, "sp_iron_captain").bond, 20 + 5);
  const v = LR.getRewardView(s, data);
  assert.ok(v.upgradable.length >= 9);
  assert.ok(!v.upgradable.includes("nope"));
  const basic = uidOf(s, "cd_basic");
  // 뷰 deck = 덱 카드 뷰 (무료 강화 그리드 · 강화 후 미리보기): 덱 순서 · uid · canUpgrade = upgradable
  assert.deepEqual(v.deck.map((c) => c.uid), s.deck.map((e) => e.uid));
  assert.deepEqual(v.deck.filter((c) => c.canUpgrade).map((c) => c.uid), v.upgradable);
  const basicView = v.deck.find((c) => c.uid === basic);
  assert.equal(basicView.targetKind, "all");
  assert.equal(basicView.power, 6);
  assert.deepEqual(basicView.upgrade.power, 8);
  rejects(s, () => LR.resolveReward(s, data, { pick: null, upgradeUid: "k999" }));
  LR.resolveReward(s, data, { pick: null, upgradeUid: basic });
  assert.equal(s.deck.find((e) => e.uid === basic).plus, true);
  assert.equal(s.trainingPoints, 30);
  checkInvariants(s);
});

test("보상: 실패 → 후보 없음 · TP 없음, 힌트 후보가 없으면 SP +10, 퍼펙트 강화판 확률은 후보에만", () => {
  let s = newRun();
  startLessonWeek(s, "dribble");
  endToEnd(s);
  assert.equal(s.lesson.status, "fail");
  assert.ok(s.lesson.score > 0, "기본 훈련은 늘 있다");
  assert.equal(s.phase, "reward");
  assert.equal(s.trainingPoints, 0);
  assert.deepEqual(s.pendingReward.offer, []);
  assert.deepEqual(s.hints, {});
  assert.equal(s.record.lessons.at(-1).result, "fail");
  const v = LR.getRewardView(s, data);
  assert.equal(v.skipTp, 0);
  rejects(s, () => LR.resolveReward(s, data, { pick: 0 }));
  LR.resolveReward(s, data, { pick: null });
  assert.equal(s.trainingPoints, 0);
  assert.equal(s.phase, "week");

  // 힌트 스킬이 모두 레벨 3 → 힌트 대신 SP +10
  s = newRun();
  for (const st of s.supports) for (const id of data.supports.find((x) => x.id === st.id).hintSkillIds) s.hints[id] = MAX_HINT_LEVEL;
  startLessonWeek(s, "dribble");
  clearLesson(s);
  assert.equal(s.skillPoints, data.lesson.rewards.noHintSp);
  assert.equal(s.pendingReward.result.sp, 10);
  assert.equal(s.pendingReward.result.hints.length, 0);
});

test("코치 카드: 낼 때 유대 +8 (보상 결과에 보인다), 유대 80 이상이면 강화판", () => {
  const s = newRun();
  s.deck.push({ uid: `k${s.nextUid}`, cardId: "cd_c_celia", plus: false });
  s.nextUid += 1;
  startLessonWeek(s, "shoot");
  const uid = uidOf(s, "cd_c_celia");
  forceHand(s, [uid]);
  const b0 = sup(s, "sp_wind_dancer").bond;
  const cand = LR.dropCandidates(s, data, { uid })[0];
  assert.ok(cand && cand.ids.length >= 1);
  s.lesson.buffs.nextNoFail = true;
  LR.playCard(s, data, { uid, at: cand.at });
  assert.equal(sup(s, "sp_wind_dancer").bond, b0 + data.lesson.bond.play);
  clearLesson(s);
  assert.ok(s.pendingReward.result.bond.some((b) => b.id === "sp_wind_dancer" && b.gain === 8));

  // 유대 80: 셀리아 카드 power 20 → 24 (bond80), 주 화면 coaches.upgraded
  sup(s, "sp_wind_dancer").bond = 80;
  s.pendingReward.offer = [{ cardId: "cd_c_celia", plus: false, kind: "add" }, { cardId: "cd_c_celia", plus: true, kind: "add" }];
  const v = LR.getRewardView(s, data);
  assert.equal(v.offer[0].bond80, true);
  assert.equal(v.offer[0].power, 24);
  assert.equal(v.offer[1].power, 30); // 강화판 = bond80 power × 1.25
  LR.resolveReward(s, data, { pick: 0 });
  assert.equal(sup(s, "sp_wind_dancer").bond, 95);
  const wv = LR.getWeekView(s, data);
  assert.equal(wv.coaches.find((c) => c.id === "sp_wind_dancer").upgraded, true);
  assert.equal(wv.coaches.find((c) => c.id === "sp_coach_harr").upgraded, false);
});

test("결장 단위 = 열린 레슨: 레슨 시작부터 빠지면 끝날 때 −1, 경기 스냅샷에서 유스", () => {
  const s = newRun();
  P(s, "p2").injuredTurns = 2;
  startLessonWeek(s, "pass");
  assert.deepEqual(s.lesson.outAtStart, ["p2"]);
  assert.ok(s.lesson.removed.includes(uidOf(s, "cd_u_dorbina")));
  assert.ok(!("p2" in s.lesson.zones), "결장 선수는 흩어지지 않는다");
  endToEnd(s);
  assert.equal(P(s, "p2").injuredTurns, 1);
  LR.resolveReward(s, data, { pick: null });
  // 주 휴식 · 외출은 결장을 줄이지 않는다
  walk(s, (x) => x.phase === "week" && x.turn === 3);
  assert.equal(P(s, "p2").injuredTurns, 1);
  startLessonWeek(s, "pass");
  endToEnd(s);
  assert.equal(P(s, "p2").injuredTurns, 0);
  LR.resolveReward(s, data, { pick: null });

  // 경기 전 준비 때 결장 중이면 경계전에서 유스
  walk(s, (x) => x.phase === "prep");
  P(s, "p5").injuredTurns = 1;
  const pv = LR.getPrepView(s, data);
  assert.deepEqual(pv.injuredOut, ["p5"]);
  LR.confirmPrep(s, data, {});
  const setup = LR.getMatchSetup(s, data);
  const youth = setup.home.players.find((p) => p.replacesPlayerId === "p5");
  assert.ok(youth && youth.isYouth);
  assert.equal(setup.home.players.filter((p) => p.isYouth).length, 1);

  // 출전 선수가 0명이면 레슨이 바로 끝나고 보상 단계로 (결장 −1)
  const t = newRun();
  for (const p of t.players) p.injuredTurns = 1;
  startLessonWeek(t, "shoot");
  assert.equal(t.phase, "reward");
  assert.equal(t.pendingReward.result.status, "fail");
  assert.ok(t.players.every((p) => p.injuredTurns === 0));
});

test("대비 레슨 · 경기 전 준비: 주와 팀워크를 쓰지 않고 경계전으로, 대비 클리어 = 경계전 컨디션 +1", () => {
  const s = newRun();
  walk(s, (x) => x.phase === "week" && x.turn === 5);
  assert.equal(s.weekOffer.kind, "prep");
  LR.applyWeekAction(s, data, { type: "lesson", zone: "defense" });
  assert.equal(s.lesson.prep, true);
  assert.equal(s.lesson.special, false);
  assert.equal(s.lesson.zone, "defense");
  assert.deepEqual(s.lesson.temp.map((t) => t.cardId), ["cd_p_tackle", "cd_p_tackle"]);
  clearLesson(s);
  assert.ok(s.modifiers.some((m) => m.key === "goalMatchCondition" && m.amount === 1 && m.untilSeason === 1 && m.source === "prepLesson"));
  assert.equal(s.pendingReward.result.prepBonus, true);
  LR.resolveReward(s, data, { pick: null });
  assert.equal(s.phase, "prep");
  assert.equal(s.turn, 5);
  assert.equal(s.turnIndex, 4);
  checkInvariants(s);

  const pv = LR.getPrepView(s, data);
  assert.equal(pv.prepBonus, true);
  assert.equal(pv.nextMatch.kind, "goal");
  rejects(s, () => LR.applyWeekAction(s, data, { type: "rest" }));
  rejects(s, () => LR.confirmPrep(s, data, { formation: "9-9-9" }));
  const tw = s.teamwork;
  LR.confirmPrep(s, data, { tactics: { defense: "tackle" }, swaps: [{ playerId: "p4", slot: "MF2" }] });
  assert.equal(s.phase, "match");
  assert.equal(s.teamwork, tw);
  assert.equal(s.turn, 5);
  assert.equal(s.tactics.defense, "tackle");
  assert.equal(P(s, "p4").slot, "MF2");
  assert.equal(s.pendingMatch.kind, "goal");
  const setup = LR.getMatchSetup(s, data);
  const cond = Math.min(4, s.condition + 1);
  assert.equal(setup.home.conditionMult, data.config.condition.matchMult[cond]);
  // 경계전 승리 → 유물 → 루트
  LR.finishMatch(s, data, WIN);
  assert.equal(s.phase, "relic");
  assert.equal(s.record.goalMatches.length, 1);
  LR.chooseRelic(s, data, s.pendingRelicChoices[0]);
  assert.equal(s.phase, "route");
  assert.equal(s.relics.length, 1);
  checkInvariants(s);
  // 경계전 패배 → 유물 없음 → 루트
  const t = newRun({ seed: 3 });
  walk(t, (x) => x.phase === "match" && x.pendingMatch.kind === "goal");
  LR.finishMatch(t, data, LOSS);
  assert.equal(t.phase, "route");
  assert.equal(t.record.losses, 1);
});

test("루트: 온천 무료 외출 (주를 쓰지 않음, 1주차 뒤 사라짐), 원정 친선전, 캠프 modifier", () => {
  // 온천
  let s = newRun();
  walk(s, (x) => x.phase === "route");
  for (const p of s.players) p.stamina = 20;
  LR.chooseRoute(s, data, "rt_hotspring");
  assert.equal(s.season, 2);
  assert.equal(s.turn, 1);
  assert.equal(s.turnIndex, WPS);
  assert.equal(s.phase, "week");
  assert.equal(s.freeOuting, 1);
  assert.ok(s.players.every((p) => p.stamina === 100));
  assert.equal(s.condition, 4);
  assert.equal(LR.getWeekView(s, data).freeOuting, true);
  assert.deepEqual(Object.values(s.seasonPlan.guaranteed).sort(), ["consult", "meeting"]);
  for (const p of s.players) p.stamina = 50;
  const offer = JSON.stringify(s.weekOffer);
  LR.applyWeekAction(s, data, { type: "outing", playerId: "p4", free: true });
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 1);
  assert.equal(s.freeOuting, 0);
  assert.equal(JSON.stringify(s.weekOffer), offer);
  assert.equal(P(s, "p4").stamina, 80);
  assert.equal(P(s, "p1").stamina, 60);
  rejects(s, () => LR.applyWeekAction(s, data, { type: "outing", playerId: "p4", free: true }));
  checkInvariants(s);
  // 쓰지 않아도 1주차가 끝나면 사라진다
  s.freeOuting = 1;
  LR.applyWeekAction(s, data, { type: "rest" });
  assert.equal(s.turn, 2);
  assert.equal(s.freeOuting, 0);
  assert.equal(LR.getWeekView(s, data).freeOuting, false);

  // 원정: 친선전 먼저 (그 시즌 친선 상대 중 최강) → 패배면 1주
  s = newRun();
  walk(s, (x) => x.phase === "route");
  LR.chooseRoute(s, data, "rt_expedition");
  assert.equal(s.phase, "match");
  assert.equal(s.pendingMatch.reason, "route");
  assert.equal(s.season, 2);
  LR.finishMatch(s, data, LOSS);
  assert.equal(s.phase, "week");
  assert.equal(s.turn, 1);
  assert.equal(s.record.friendlies.at(-1).reason, "route");
  checkInvariants(s);
  // 원정 승리 = 유물 확정 → 유물 → 1주
  s = newRun();
  walk(s, (x) => x.phase === "route");
  LR.chooseRoute(s, data, "rt_expedition");
  LR.finishMatch(s, data, WIN);
  assert.equal(s.phase, "relic");
  LR.chooseRelic(s, data, s.pendingRelicChoices[0]);
  assert.equal(s.phase, "week");
  assert.equal(s.weekOffer.kind, "lesson");

  // 캠프: 다음 시즌 훈련 효율 · 부상률 (시즌 2 동안), 시즌 3에서 만료
  s = newRun();
  walk(s, (x) => x.phase === "route");
  rejects(s, () => LR.chooseRoute(s, data, "rt_nope"));
  const eff0 = run.getModifier(s, "trainingEfficiency"); // 유물 몫 (런 지속)
  LR.chooseRoute(s, data, "rt_camp");
  assert.ok(Math.abs(run.getModifier(s, "trainingEfficiency") - eff0 - 0.2) < 1e-9);
  assert.ok(s.modifiers.some((m) => m.key === "injuryRate" && m.untilSeason === 2));
  walk(s, (x) => x.phase === "route");
  LR.chooseRoute(s, data, "rt_camp");
  assert.equal(s.season, 3);
  assert.deepEqual(s.modifiers.filter((m) => m.key === "trainingEfficiency" && m.untilSeason !== null).map((m) => m.untilSeason), [3]);
});

test("상담: 구매 · 강화 · 삭제 · 스킬, 검증이 실패하면 상태 불변", () => {
  const s = newRun({ policy: "counter" });
  forceFree(s, ["consult", "meeting", "outing"]);
  LR.applyWeekAction(s, data, { type: "consult" });
  rejects(s, () => LR.consultAction(s, data, { op: "buy", index: 0 })); // TP 0
  s.trainingPoints = 200;
  const v0 = LR.getConsultView(s, data);
  assert.equal(v0.stock.length, 3);
  assert.ok(v0.stock.every((x) => x.affordable));
  assert.equal(v0.upgradesLeft, 1);
  assert.equal(v0.deletesLeft, 1);
  const coach = cards.getCard(data, s.consult.stock[2].cardId);
  const b0 = sup(s, coach.coach.supportId).bond;
  const tp0 = s.trainingPoints;
  LR.consultAction(s, data, { op: "buy", index: 2 });
  assert.equal(s.trainingPoints, tp0 - 30);
  assert.equal(sup(s, coach.coach.supportId).bond, Math.min(100, b0 + 15));
  assert.equal(s.deck.at(-1).cardId, coach.id);
  assert.equal(s.consult.stock[2].bought, true);
  rejects(s, () => LR.consultAction(s, data, { op: "buy", index: 2 }));
  rejects(s, () => LR.consultAction(s, data, { op: "buy", index: 9 }));
  // 강화 (방문당 1번)
  rejects(s, () => LR.consultAction(s, data, { op: "upgrade", uid: "k999" }));
  LR.consultAction(s, data, { op: "upgrade", uid: "k1" });
  assert.equal(s.deck[0].plus, true);
  assert.equal(s.trainingPoints, tp0 - 60);
  rejects(s, () => LR.consultAction(s, data, { op: "upgrade", uid: "k2" }));
  // 삭제 (방문당 1번)
  LR.consultAction(s, data, { op: "delete", uid: "k2" });
  assert.ok(!s.deck.some((e) => e.uid === "k2"));
  assert.equal(s.trainingPoints, tp0 - 85);
  rejects(s, () => LR.consultAction(s, data, { op: "delete", uid: "k3" }));
  // 스킬: 힌트 없음 → 거절, 힌트 + SP → 습득 (할인가)
  rejects(s, () => LR.consultAction(s, data, { op: "skill", skillId: "sk_power_shot", playerId: "p7" }));
  s.hints.sk_power_shot = 2;
  s.skillPoints = 10;
  rejects(s, () => LR.consultAction(s, data, { op: "skill", skillId: "sk_power_shot", playerId: "p7" }));
  s.skillPoints = 500;
  const skill = data.skills.find((x) => x.id === "sk_power_shot");
  const view = LR.getConsultView(s, data);
  const row = view.skills.find((x) => x.skillId === "sk_power_shot");
  assert.equal(row.cost, Math.round(skill.cost * 0.8));
  assert.ok(row.eligiblePlayers.includes("p7"));
  LR.consultAction(s, data, { op: "skill", skillId: "sk_power_shot", playerId: "p7" });
  assert.ok(P(s, "p7").learnedSkillIds.includes("sk_power_shot"));
  assert.equal(s.skillPoints, 500 - row.cost);
  rejects(s, () => LR.consultAction(s, data, { op: "skill", skillId: "sk_power_shot", playerId: "p7" }));
  rejects(s, () => LR.consultAction(s, data, { op: "zzz" }));
  rejects(s, () => LR.consultAction(s, data, null));
  checkInvariants(s);

  // 덱 최소 5장
  const t = newRun();
  forceFree(t, ["consult", "meeting", "outing"]);
  LR.applyWeekAction(t, data, { type: "consult" });
  t.trainingPoints = 100;
  t.deck = t.deck.slice(0, data.lesson.consult.minDeck);
  rejects(t, () => LR.consultAction(t, data, { op: "delete", uid: "k1" }));
  // 고유 카드도 지울 수 있다
  t.deck.push({ uid: `k${t.nextUid}`, cardId: "cd_icing", plus: false });
  t.nextUid += 1;
  LR.consultAction(t, data, { op: "delete", uid: uidOf(t, "cd_u_neria") });
  assert.ok(!t.deck.some((e) => e.cardId === "cd_u_neria"));
  LR.endConsult(t, data);
  assert.equal(t.phase, "week");
});

/** 테스트 안의 간단한 정책 (감독 AI 없이): 한 단계 진행. 쓴 행동 종류를 kinds 에 센다. */
function policyStep(state, kinds) {
  const bump = (k) => (kinds[k] = (kinds[k] || 0) + 1);
  switch (state.phase) {
    case "week": {
      const v = LR.getWeekView(state, data);
      const avg = state.players.reduce((a, p) => a + p.stamina, 0) / state.players.length;
      if (v.freeOuting) {
        const low = [...state.players].sort((a, b) => a.stamina - b.stamina)[0];
        LR.applyWeekAction(state, data, { type: "outing", playerId: low.id, free: true });
        return bump("freeOuting");
      }
      if (avg < 40 || (state.season === 1 && v.kind === "prep")) {
        LR.applyWeekAction(state, data, { type: "rest" });
        return bump("rest");
      }
      if (v.kind === "free") {
        // 보장 행동은 시즌마다 번갈아, 그 밖은 열린 것 중 아직 덜 쓴 것
        const types = v.actions.map((a) => a.type);
        const type = types.slice().sort((a, b) => (kinds[a] || 0) - (kinds[b] || 0))[0];
        if (type === "outing") LR.applyWeekAction(state, data, { type, playerId: state.players[state.turnIndex % 7].id });
        else if (type === "meeting") LR.applyWeekAction(state, data, { type, tactics: { attack: "balanced" } });
        else LR.applyWeekAction(state, data, { type });
        return bump(type);
      }
      const pick = v.lessons.find((l) => l.special) || v.lessons[state.turnIndex % 5];
      LR.applyWeekAction(state, data, { type: "lesson", zone: pick.zone });
      return bump(v.kind === "prep" ? "prepLesson" : "lesson");
    }
    case "lesson": {
      const v = LR.getLessonView(state, data);
      // 체력 30 미만 경기장 선수는 벤치로 (한 번에 1명, 한 턴 최대 2명)
      const tired = v.canBench ? v.players.find((p) => !p.out && !p.bench && p.zone && p.stamina < 30) : null;
      if (tired) {
        LR.benchPlayer(state, data, { playerId: tired.id, on: true });
        return bump("bench");
      }
      const card = v.hand.find((h) => h.playable);
      const cand = card ? LR.dropCandidates(state, data, { uid: card.uid })[0] : null;
      if (!cand) {
        LR.endLessonTurn(state, data);
        return bump("endTurn");
      }
      LR.playCard(state, data, { uid: card.uid, at: cand.at || undefined, playerId: cand.playerId });
      return bump("play");
    }
    case "reward": {
      const v = LR.getRewardView(state, data);
      LR.resolveReward(state, data, { pick: v.offer.length ? 0 : null, upgradeUid: v.upgradable[0] ?? null });
      return bump(v.offer.length ? "rewardPick" : "rewardNone");
    }
    case "consult": {
      const v = LR.getConsultView(state, data);
      const sk = v.skills.find((x) => x.affordable && x.eligiblePlayers.length);
      if (sk) {
        LR.consultAction(state, data, { op: "skill", skillId: sk.skillId, playerId: sk.eligiblePlayers[0] });
        return bump("skill");
      }
      const i = v.stock.findIndex((x) => x.affordable);
      if (i >= 0) {
        LR.consultAction(state, data, { op: "buy", index: i });
        return bump("buy");
      }
      LR.endConsult(state, data);
      return bump("endConsult");
    }
    case "prep":
      LR.confirmPrep(state, data, {});
      return bump("prep");
    case "match": {
      const setup = LR.getMatchSetup(state, data);
      const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
      match.simulateAuto(ms, data);
      LR.finishMatch(state, data, match.getResult(ms));
      return bump(setup.kind === "goal" ? "goalMatch" : "friendlyMatch");
    }
    case "relic":
      LR.chooseRelic(state, data, state.pendingRelicChoices[0]);
      return bump("relic");
    case "route": {
      const routeId = state.season === 1 ? "rt_hotspring" : "rt_expedition";
      LR.chooseRoute(state, data, routeId);
      return bump("route");
    }
    default:
      throw new Error(`policyStep: phase ${state.phase}`);
  }
}

function playLessonRun(seed, policy, { roundtrip = false } = {}) {
  let state = LR.createRun({ data, seed, policy });
  const kinds = {};
  const phases = new Set([state.phase]);
  let steps = 0;
  while (state.phase !== "finished") {
    if (++steps > 1500) throw new Error(`런이 끝나지 않습니다 (${state.phase})`);
    policyStep(state, kinds);
    phases.add(state.phase);
    checkInvariants(state);
    if (roundtrip) state = clone(state);
  }
  return { state, kinds, phases, steps };
}

test("15주 완주 (테스트 안의 간단한 정책 · 실제 경기): 불변식 · 결정성 · 등록 팀 → 도전 모드 스냅샷 → 경기", () => {
  for (const [seed, policy] of [[1, "ace"], [2, "counter"]]) {
    const a = playLessonRun(seed, policy, { roundtrip: true });
    const b = playLessonRun(seed, policy);
    same(a.state, b.state);
    const s = a.state;
    assert.equal(s.season, 3);
    assert.equal(s.turn, WPS);
    assert.equal(s.turnIndex, 3 * WPS - 1);
    assert.equal(s.record.goalMatches.length, 3);
    // 레슨 = 레슨 주 6 + 대비 레슨 2 (시즌 1 대비 주는 휴식)
    assert.equal(s.record.lessons.length, a.kinds.lesson + a.kinds.prepLesson);
    assert.ok(a.kinds.lesson >= 1 && a.kinds.prepLesson === 2, JSON.stringify(a.kinds));
    for (const ph of ["week", "lesson", "reward", "prep", "match", "route", "finished"]) assert.ok(a.phases.has(ph), `phase ${ph}`);
    assert.ok(a.kinds.consult >= 1 && a.kinds.meeting >= 1 && a.kinds.rest >= 1 && a.kinds.freeOuting === 1, JSON.stringify(a.kinds));
    assert.ok(a.kinds.route === 2);
    assert.ok(a.kinds.play >= 10 && a.kinds.bench >= 1, JSON.stringify(a.kinds));
    assert.equal(s.record.lessons.reduce((x, l) => x + l.benches, 0), a.kinds.bench);
    assert.ok(a.kinds.friendlyMatch >= 1); // 원정 친선전
    assert.equal(s.weekOffer, null);
    assert.equal(s.lesson, null);

    // 끝 → 평가 · 등록 팀
    const fin = LR.finalizeRun(s, data);
    assert.equal(fin.registeredTeam.policy, policy);
    assert.equal(fin.registeredTeam.createdTurnIndex, 14);
    assert.equal(fin.registeredTeam.players.length, 7);
    assert.ok(fin.rating && typeof fin.rating.score === "number");
    const regd = JSON.parse(JSON.stringify(fin.registeredTeam));
    const home = ch.buildChallengeTeamSnapshot(regd, data, { kind: "goal" });
    assert.equal(home.players.length, 7);
    const away = run.buildOpponentSnapshot(data.opponents.find((o) => o.role === "goal" && o.season === 3), data);
    const ms = match.createMatch({ data, seed: 5, home, away, possessions: 6, kind: "friendly" });
    match.simulateAuto(ms, data);
    const r = match.getResult(ms);
    assert.ok(["home", "away", "draw"].includes(r.winner));
  }
});

test("뷰는 순수 (주 · 보상 · 상담 · 준비 · 레슨), 레슨 중 JSON 왕복 뒤 같은 결과", () => {
  const s = newRun({ seed: 5 });
  const check = (fn) => {
    const before = JSON.stringify(s);
    fn();
    assert.equal(JSON.stringify(s), before);
  };
  check(() => LR.getWeekView(s, data));
  startLessonWeek(s, "pass");
  check(() => LR.getLessonView(s, data));
  for (const uid of s.lesson.hand) {
    check(() => LR.previewCard(s, data, { uid, at: { x: 50, y: 30 } }));
    check(() => LR.dropCandidates(s, data, { uid }));
  }
  // JSON 왕복 뒤 같은 진행
  const c = clone(s);
  const kindsA = {};
  const kindsB = {};
  for (let i = 0; i < 6 && s.phase === "lesson"; i++) {
    policyStep(s, kindsA);
    policyStep(c, kindsB);
    same(s, c);
  }
  endToEnd(s);
  check(() => LR.getRewardView(s, data));
  check(() => LR.lessonResult(s, data));
  LR.resolveReward(s, data, { pick: null });
  forceFree(s, ["consult", "meeting", "outing"]);
  LR.applyWeekAction(s, data, { type: "consult" });
  check(() => LR.getConsultView(s, data));
  LR.endConsult(s, data);
  walk(s, (x) => x.phase === "prep");
  check(() => LR.getPrepView(s, data));
  check(() => LR.nextMatchView(s, data));
});
