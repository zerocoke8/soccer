// test/lesson.test.mjs — LESSON_PROTO_PLAN §5.2 · §5.3 · §9.3 (js/engine/lesson.js 핵심 배틀, E2)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as lesson from "../js/engine/lesson.js";
import * as cards from "../js/engine/cards.js";
import { createRngFromState } from "../js/engine/rng.js";
import { formationSlots, slotPosition, FORMATIONS } from "../js/engine/training.js";

const data = loadData();
const R = cards.roundCost;

/** 기본 편성(2-2-2) 레슨 런 비슷한 상태. deckIds 를 안 주면 시작 덱 3장 + 배치된 7명의 고유 카드. */
function makeState({ seed = 7, policy = "team", deckIds = null, extra = [] } = {}) {
  const roster = run.buildRoster({ data });
  const uniques = cards.cardList(data).filter((c) => c.family === "unique" && roster.players.some((p) => p.charId === c.ownerCharId));
  const ids = (deckIds || [...data.lesson.startDeck, ...uniques.map((c) => c.id)]).concat(extra);
  return {
    kind: "lessonRun", version: 1, seed: String(seed), rngState: seed >>> 0,
    phase: "lesson", season: 1, turn: 1, turnIndex: 0, policy, formation: roster.formation,
    players: roster.players, supports: roster.supports,
    condition: 2, teamwork: 0, skillPoints: 0, trainingPoints: 0, hints: {}, relics: [], modifiers: [],
    deck: ids.map((cardId, i) => ({ uid: `k${i + 1}`, cardId, plus: false })), nextUid: ids.length + 1,
    lesson: null, log: [],
  };
}

const P = (state, id) => state.players.find((p) => p.id === id);
const byChar = (state, charId) => state.players.find((p) => p.charId === charId);
const uidOf = (state, cardId) => state.deck.find((e) => e.cardId === cardId).uid;

/** 레슨 중 손패를 지정한다 (지정한 카드를 다른 더미에서 빼 손패로, 원래 손패는 뽑을 더미 끝으로) */
function forceHand(state, uids) {
  const L = state.lesson;
  const old = L.hand.filter((u) => !uids.includes(u));
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.hand = uids.slice();
  L.drawPile.push(...old);
}

/** pred(rng) 가 참인 rngState 를 찾는다 */
function rngWhere(pred) {
  for (let s = 1; s < 100000; s++) if (pred(createRngFromState(s))) return s;
  throw new Error("rng 상태를 찾지 못했습니다");
}
/** 다음 실패 판정이 (0.95 이하 확률이면) 반드시 성공하는 rng 상태 */
const SAFE = rngWhere((r) => r.next() >= 0.96);

/** 간단한 자동 진행: 낼 수 있는 첫 카드 (탭은 후보 앞에서부터), 없으면 턴 끝 / 쉬기 */
function autoStep(state) {
  const v = lesson.getLessonView(state, data);
  const card = v.hand.find((h) => h.playable);
  if (!card) {
    if (v.canEndTurn) lesson.endLessonTurn(state, data);
    else lesson.lessonRest(state, data, { playerId: [...v.players].sort((a, b) => a.stamina - b.stamina)[0].id });
    return;
  }
  const pv = lesson.previewCard(state, data, { uid: card.uid, taps: [] });
  const taps = pv.ok ? [] : pv.tapCandidates.slice(0, pv.needTaps);
  lesson.playCard(state, data, { uid: card.uid, taps });
}
function autoLesson(state, { roundtrip = false } = {}) {
  let s = state;
  for (let i = 0; i < 200 && s.lesson.status === "playing"; i++) {
    autoStep(s);
    if (roundtrip) s = clone(s);
  }
  assert.notEqual(s.lesson.status, "playing");
  return s;
}

const M0 = 1.0; // 컨디션 2 = ×1.0, modifier 없음

// ---------------------------------------------------------------------------

test("startLesson: 목표 · 상한 · 턴 수, 섞기 · 1턴 손패 3장, 특별 ×1.3", () => {
  const s = makeState();
  lesson.startLesson(s, data, { stat: "pass" });
  const L = s.lesson;
  assert.equal(L.status, "playing");
  assert.deepEqual([L.turn, L.turns, L.target, L.cap, L.score], [1, 6, 330, 520, 0]);
  assert.equal(L.hand.length, 3);
  assert.equal(L.hand.length + L.drawPile.length, s.deck.length);
  assert.equal(L.seq, 0);
  assert.deepEqual(L.buffs, lesson.emptyBuffs());
  assert.ok(L.lastFx.some((x) => x.t === "draw"));

  const sp = makeState();
  sp.season = 3;
  lesson.startLesson(sp, data, { stat: "pass", special: true });
  assert.deepEqual([sp.lesson.turns, sp.lesson.target, sp.lesson.cap], [8, R(450 * 1.3), R(720 * 1.3)]);
  const s1 = makeState();
  lesson.startLesson(s1, data, { stat: "pass", special: true });
  assert.deepEqual([s1.lesson.target, s1.lesson.cap], [429, 676]);

  assert.throws(() => lesson.startLesson(makeState(), data, { stat: "magic" }), /종목/);
  assert.throws(() => lesson.startLesson(makeState(), data, { stat: "pass", prepCards: ["cd_basic"] }), /대비 카드가 아닙니다/);
  assert.throws(() => lesson.startLesson(s, data, { stat: "pass" }), /이미 레슨 중/);
});

test("결정성: 같은 시드 = 같은 결과, 시드가 다르면 다른 진행", () => {
  for (const stat of ["shoot", "dribble", "pass", "defense", "physical"]) {
    const a = autoLesson(lesson.startLesson(makeState({ seed: 11 }), data, { stat }));
    const b = autoLesson(lesson.startLesson(makeState({ seed: 11 }), data, { stat }));
    assert.deepEqual(a, b, stat);
  }
  const hands = new Set();
  for (let seed = 1; seed <= 6; seed++) hands.add(JSON.stringify(lesson.startLesson(makeState({ seed }), data, { stat: "pass" }).lesson.hand));
  assert.ok(hands.size > 1);
});

test("레슨 중간 JSON 왕복 뒤 같은 손패 · 같은 판정", () => {
  for (const seed of [3, 4, 5]) {
    const a = lesson.startLesson(makeState({ seed }), data, { stat: "defense" });
    autoStep(a);
    autoStep(a);
    const b = clone(a);
    assert.deepEqual(b.lesson.hand, a.lesson.hand);
    autoLesson(a);
    const c = autoLesson(b, { roundtrip: true });
    assert.deepEqual(c, a);
  }
});

test("view · preview · lessonResult 는 상태와 rng 를 바꾸지 않는다", () => {
  const s = lesson.startLesson(makeState({ seed: 9 }), data, { stat: "shoot" });
  autoStep(s);
  const snap = JSON.stringify(s);
  const v = lesson.getLessonView(s, data);
  for (const h of v.hand) {
    lesson.previewCard(s, data, { uid: h.uid, taps: [] });
    lesson.previewCard(s, data, { uid: h.uid, taps: ["p1", "p2"] });
    lesson.previewCard(s, data, { uid: h.uid, taps: ["p6"] });
  }
  lesson.previewCard(s, data, { uid: "k999" });
  lesson.lessonResult(s, data);
  assert.equal(JSON.stringify(s), snap);

  assert.equal(v.players.length, 7);
  assert.equal(v.hand.length, s.lesson.hand.length);
  for (const k of ["season", "week", "stat", "turn", "turns", "score", "target", "cap", "status", "playsLeft", "canRest", "canEndTurn", "buffs", "chips", "piles", "seq", "lastFx"]) {
    assert.ok(k in v, k);
  }
  for (const k of ["uid", "cardId", "name", "family", "plus", "bond80", "mode", "targetKind", "needTaps", "playable", "deadReason", "power", "cost", "desc"]) {
    assert.ok(k in v.hand[0], k);
  }
});

test("카드 1장에 실패 판정 1번 — 가장 위험한 선수만 −5 (동률은 체력 낮은 쪽 → 슬롯 순서)", () => {
  const setup = (st3, st4) => {
    const s = lesson.startLesson(makeState({ deckIds: ["cd_basic", "cd_coaching", "cd_cooldown", "cd_icing"] }), data, { stat: "defense" });
    for (const p of s.players) p.stamina = 100;
    P(s, "p2").stamina = 50; // 10%
    P(s, "p3").stamina = st3;
    P(s, "p4").stamina = st4;
    forceHand(s, [uidOf(s, "cd_basic")]);
    return s;
  };
  // 실패 (첫 수 < 0.25), 부상 없음 (둘째 수 ≥ 0.5)
  const failNoInjury = rngWhere((r) => r.next() < 0.25 && r.next() >= 0.5);
  for (const [st3, st4, failer] of [[30, 30, "p3"], [30, 25, "p4"], [25, 30, "p3"]]) {
    const s = setup(st3, st4);
    const pv = lesson.previewCard(s, data, { uid: uidOf(s, "cd_basic") });
    assert.equal(pv.ok, true);
    assert.equal(pv.failRate, 0.25);
    assert.equal(pv.failerId, failer);
    const before = Object.fromEntries(s.players.map((p) => [p.id, p.stats.defense]));
    s.rngState = failNoInjury;
    lesson.playCard(s, data, { uid: uidOf(s, "cd_basic") });
    const L = s.lesson;
    assert.equal(L.stats.fails, 1);
    assert.equal(L.stats.injuries, 0);
    const fails = L.lastFx.filter((x) => x.t === "fail");
    assert.deepEqual(fails, [{ t: "fail", id: failer, n: 5, injured: false }]);
    let sum = 0;
    for (const p of s.players) {
      const d = p.stats.defense - before[p.id];
      if (p.id === failer) assert.equal(d, -5);
      else {
        assert.ok(d > 0, p.id);
        assert.equal(d, pv.targets.find((t) => t.id === p.id).gain);
      }
      sum += d;
    }
    assert.equal(L.score, sum);
    assert.deepEqual(L.out, []);
  }
  // 체력 60 이상이면 2%, 판정은 1번
  const s = setup(100, 100);
  P(s, "p2").stamina = 100;
  assert.equal(lesson.previewCard(s, data, { uid: uidOf(s, "cd_basic") }).failRate, 0.02);
});

test("부상 → out + injuredTurns 1 + 그 선수의 고유 카드 제외 (손패 · 더미 · 내던 카드)", () => {
  const failInjury = rngWhere((r) => r.next() < 0.25 && r.next() < 0.5);
  const s = lesson.startLesson(makeState(), data, { stat: "defense" });
  const neria = byChar(s, "ch_spirit_keeper");
  for (const p of s.players) p.stamina = 100;
  neria.stamina = 30;
  const neriaCard = uidOf(s, "cd_u_neria");
  forceHand(s, [uidOf(s, "cd_basic"), neriaCard, uidOf(s, "cd_coaching")]);
  s.rngState = failInjury;
  lesson.playCard(s, data, { uid: uidOf(s, "cd_basic") });
  const L = s.lesson;
  assert.deepEqual(L.out, [neria.id]);
  assert.equal(neria.injuredTurns, 1);
  assert.equal(L.stats.injuries, 1);
  assert.ok(L.removed.includes(neriaCard));
  for (const pile of ["hand", "drawPile", "discard", "exhausted"]) assert.ok(!L[pile].includes(neriaCard), pile);
  const v = lesson.getLessonView(s, data);
  const pv = v.players.find((p) => p.id === neria.id);
  assert.equal(pv.out, true);
  assert.equal(pv.injured, true);
  // 남은 레슨에서 대상이 되지 않고, 고유 카드가 다시 오지 않는다
  autoLesson(s);
  assert.equal(s.lesson.targeted[neria.id], 1);
  assert.ok(!s.lesson.autoGains[neria.id]);

  // 주인이 자기 고유 카드를 내다 다치면 그 카드도 removed 로
  const s2 = lesson.startLesson(makeState(), data, { stat: "defense" });
  const n2 = byChar(s2, "ch_spirit_keeper");
  n2.stamina = 30;
  const c2 = uidOf(s2, "cd_u_neria");
  forceHand(s2, [c2]);
  s2.rngState = failInjury;
  lesson.playCard(s2, data, { uid: c2 });
  assert.ok(s2.lesson.removed.includes(c2));
  assert.ok(!s2.lesson.discard.includes(c2));

  // 결장 중인 선수 (레슨 시작 전 부상) 의 고유 카드는 시작부터 빠지고, injuredTurns 는 lesson.js 가 줄이지 않는다
  const s3 = makeState();
  byChar(s3, "ch_spirit_keeper").injuredTurns = 2;
  lesson.startLesson(s3, data, { stat: "defense" });
  assert.deepEqual(s3.lesson.outAtStart, [byChar(s3, "ch_spirit_keeper").id]);
  assert.deepEqual(s3.lesson.removed, [uidOf(s3, "cd_u_neria")]);
  autoLesson(s3);
  assert.equal(byChar(s3, "ch_spirit_keeper").injuredTurns, 2);
});

test("범위 위력 ÷ 인원 · 1인 비용 (포메이션 4종)", () => {
  for (const fm of Object.keys(FORMATIONS)) {
    const s = makeState({ deckIds: ["cd_df_drill", "cd_attack_build", "cd_basic", "cd_coaching"] });
    formationSlots(fm).forEach((slot, i) => {
      s.players[i].slot = slot;
      s.players[i].position = slotPosition(slot);
    });
    lesson.startLesson(s, data, { stat: "defense" });
    for (const [cardId, total, filter] of [
      ["cd_df_drill", 40, (p) => p.position === "DF"],
      ["cd_attack_build", 43, (p) => p.position === "MF" || p.position === "FW"],
      ["cd_basic", 35, () => true],
    ]) {
      const uid = uidOf(s, cardId);
      forceHand(s, [uid]);
      s.lesson.playsLeft = 1;
      s.lesson.playedThisTurn = 0;
      for (const p of s.players) p.stamina = 100;
      const T = s.players.filter(filter);
      const pv = lesson.previewCard(s, data, { uid });
      assert.deepEqual(pv.targets.map((t) => t.id), T.map((p) => p.id), `${fm} ${cardId}`);
      const before = Object.fromEntries(s.players.map((p) => [p.id, p.stats.defense]));
      s.rngState = SAFE;
      lesson.playCard(s, data, { uid });
      for (const p of T) {
        assert.equal(p.stats.defense - before[p.id], R((total / T.length) * p.growth.defense * M0), `${fm} ${cardId} ${p.id}`);
        assert.equal(100 - p.stamina, R((total / T.length) * 0.6), `${fm} ${cardId} 비용`);
      }
      for (const p of s.players) if (!filter(p)) assert.equal(p.stats.defense, before[p.id]);
      if (s.lesson.status !== "playing") break;
    }
  }
});

test("상승 식: 1인 = round(위력 × 성장률 × M), 부 스탯 = round(g × 0.36 × 부 성장률), 점수 = 주 스탯만", () => {
  const s = lesson.startLesson(makeState({ deckIds: ["cd_coaching", "cd_basic", "cd_cooldown"] }), data, { stat: "shoot" });
  s.condition = 4; // ×1.2
  s.modifiers = [{ key: "trainingEfficiency", amount: 0.15, untilSeason: null }];
  const p = P(s, "p6");
  const uid = uidOf(s, "cd_coaching");
  forceHand(s, [uid]);
  const b = { ...p.stats };
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid, taps: ["p6"] });
  const g = R(35 * p.growth.shoot * 1.2 * 1.15);
  assert.equal(p.stats.shoot - b.shoot, g);
  assert.equal(p.stats.dribble - b.dribble, R(g * 0.36 * p.growth.dribble)); // shoot → dribble
  assert.equal(s.lesson.score, g);
  assert.equal(s.lesson.cardGainSum, g);
  assert.equal(p.stamina, 100 - 21);
  assert.equal(s.lesson.seq, 1);

  // 상한 1000에 잘린 분은 점수에 들어가지 않는다
  const s2 = lesson.startLesson(makeState({ deckIds: ["cd_coaching", "cd_basic", "cd_cooldown"] }), data, { stat: "shoot" });
  P(s2, "p6").stats.shoot = 998;
  forceHand(s2, [uidOf(s2, "cd_coaching")]);
  s2.rngState = SAFE;
  lesson.playCard(s2, data, { uid: uidOf(s2, "cd_coaching"), taps: ["p6"] });
  assert.equal(P(s2, "p6").stats.shoot, 1000);
  assert.equal(s2.lesson.score, 2);
});

test("점수 = 7명 종목 순증가 (−5 포함, 부 스탯 · 자율 훈련 제외) — 레슨 전체", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = makeState({ seed });
    for (const p of s.players) p.stamina = 45; // 실패가 나오게
    lesson.startLesson(s, data, { stat: "dribble" });
    autoLesson(s);
    const res = lesson.lessonResult(s, data);
    const sum = res.perPlayer.reduce((a, x) => a + x.gain, 0);
    assert.equal(sum, s.lesson.score, `seed ${seed}`);
    const total = s.players.reduce((a, p) => a + p.stats.dribble - s.lesson.before[p.id].dribble, 0);
    assert.equal(total, s.lesson.score + Object.values(s.lesson.autoGains).reduce((a, x) => a + x, 0));
    for (const p of s.players) assert.ok(p.stamina >= 0 && p.stamina <= 100);
  }
});

test("고유 카드 두 모드 — 배치 포지션의 주 스탯이면 강화, 아니면 지원 (배치를 바꾸면 모드가 바뀐다)", () => {
  // 네리아 (GK): 수비 레슨 = 강화 53 · 비용 21
  const s = lesson.startLesson(makeState(), data, { stat: "defense" });
  const neria = byChar(s, "ch_spirit_keeper");
  const nc = uidOf(s, "cd_u_neria");
  forceHand(s, [nc]);
  const v = lesson.getLessonView(s, data).hand[0];
  assert.deepEqual([v.mode, v.targetKind, v.power, v.cost], ["power", "owner", 53, 21]);
  const b = neria.stats.defense;
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: nc });
  assert.equal(neria.stats.defense - b, R(53 * neria.growth.defense));
  assert.equal(neria.stamina, 79);

  // 슈팅 레슨 = 지원 모드: 상승 · 비용 없음, 다음 카드 실패 없음 + 네리아 체력 +15
  const s2 = lesson.startLesson(makeState(), data, { stat: "shoot" });
  const n2 = byChar(s2, "ch_spirit_keeper");
  n2.stamina = 50;
  const c2 = uidOf(s2, "cd_u_neria");
  forceHand(s2, [c2, uidOf(s2, "cd_basic")]);
  const v2 = lesson.getLessonView(s2, data).hand[0];
  assert.deepEqual([v2.mode, v2.targetKind, v2.power, v2.cost, v2.needTaps], ["support", "none", null, null, 0]);
  const b2 = n2.stats.shoot;
  lesson.playCard(s2, data, { uid: c2 });
  assert.equal(n2.stats.shoot, b2);
  assert.equal(n2.stamina, 65);
  assert.equal(s2.lesson.buffs.nextNoFail, true);
  assert.deepEqual(s2.lesson.targeted, {});

  // 네리아를 FW 로 옮기면 슈팅 레슨에서 강화 모드
  const s3 = makeState();
  const n3 = byChar(s3, "ch_spirit_keeper");
  const g3 = byChar(s3, "ch_giant_striker");
  [n3.slot, n3.position, g3.slot, g3.position] = [g3.slot, "FW", n3.slot, "GK"];
  lesson.startLesson(s3, data, { stat: "shoot" });
  forceHand(s3, [uidOf(s3, "cd_u_neria"), uidOf(s3, "cd_u_greta")]);
  const modes = lesson.getLessonView(s3, data).hand.map((h) => h.mode);
  assert.deepEqual(modes, ["power", "support"]);
});

test("울리카: 강화 모드는 1명 더 탭 (파트너 위력 18 · 비용 7), 짝 팀워크 +2 + 카드 +1 · 지원 모드 nextPairPct", () => {
  const s = lesson.startLesson(makeState(), data, { stat: "shoot" });
  const ul = byChar(s, "ch_wolf_winger");
  const uid = uidOf(s, "cd_u_ulrika");
  forceHand(s, [uid]);
  const pv0 = lesson.previewCard(s, data, { uid, taps: [] });
  assert.equal(pv0.ok, false);
  assert.equal(pv0.needTaps, 1);
  assert.ok(!pv0.tapCandidates.includes(ul.id));
  assert.equal(pv0.tapCandidates.length, 6);
  assert.deepEqual(pv0.blocked, [{ id: ul.id, reason: "카드 주인" }]);
  assert.throws(() => lesson.playCard(s, data, { uid, taps: [] }), /1명/);
  assert.throws(() => lesson.playCard(s, data, { uid, taps: [ul.id] }), /고를 수 없습니다/);
  const partner = P(s, "p7");
  const pv = lesson.previewCard(s, data, { uid, taps: ["p7"] });
  assert.equal(pv.ok, true);
  assert.deepEqual(pv.targets.map((t) => [t.id, t.cost]), [[ul.id, 21], ["p7", 7]]);
  const [bu, bp] = [ul.stats.shoot, partner.stats.shoot];
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid, taps: ["p7"] });
  assert.equal(ul.stats.shoot - bu, R(53 * ul.growth.shoot));
  assert.equal(partner.stats.shoot - bp, R(18 * partner.growth.shoot));
  assert.equal(s.teamwork, 2 + 1);
  assert.equal(s.lesson.twAccrued, 2);

  // 수비 레슨 = 지원 모드: nextPairPct 0.5 → 다음 짝 카드 ×1.5, 그 뒤 0
  const s2 = lesson.startLesson(makeState({ extra: ["cd_one_two"] }), data, { stat: "defense" });
  const u2 = uidOf(s2, "cd_u_ulrika");
  const pair = uidOf(s2, "cd_one_two");
  forceHand(s2, [u2, pair]);
  s2.lesson.playsLeft = 2;
  lesson.playCard(s2, data, { uid: u2 });
  assert.equal(s2.lesson.buffs.nextPairPct, 0.5);
  const [a, b] = [P(s2, "p2"), P(s2, "p3")];
  const pv2 = lesson.previewCard(s2, data, { uid: pair, taps: ["p2", "p3"] });
  assert.equal(pv2.targets[0].gain, R(20 * a.growth.defense * 1.5));
  assert.equal(pv2.targets[1].gain, R(20 * b.growth.defense * 1.5));
  s2.rngState = SAFE;
  lesson.playCard(s2, data, { uid: pair, taps: ["p2", "p3"] });
  assert.equal(s2.lesson.buffs.nextPairPct, 0);
});

test("다음 카드 효과: 실루엔 지원 nextPct · 그레타 nextCostZero 는 대상 카드에서 소비, 대상 없는 카드는 소비하지 않는다", () => {
  const s = lesson.startLesson(makeState({ extra: ["cd_tactics_board"] }), data, { stat: "defense" });
  const sil = uidOf(s, "cd_u_silluen");
  const gre = uidOf(s, "cd_u_greta");
  const board = uidOf(s, "cd_tactics_board");
  const basic = uidOf(s, "cd_basic");
  forceHand(s, [sil, gre, board, basic]);
  s.lesson.playsLeft = 3;
  lesson.playCard(s, data, { uid: sil });
  lesson.playCard(s, data, { uid: gre });
  lesson.playCard(s, data, { uid: board });
  assert.equal(s.lesson.buffs.nextPct, 0.4);
  assert.equal(s.lesson.buffs.nextCostZero, true);
  const pv = lesson.previewCard(s, data, { uid: basic });
  for (const t of pv.targets) {
    const p = P(s, t.id);
    assert.equal(t.gain, R(5 * p.growth.defense * 1.4));
    assert.equal(t.cost, 0);
  }
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: basic });
  assert.equal(s.lesson.buffs.nextPct, 0);
  assert.equal(s.lesson.buffs.nextCostZero, false);
});

test("퍼펙트: 카드로 상한에 닿으면 즉시 끝 + 남은 턴 × 5 체력 (턴 끝 처리 없음) · 클리어 · 실패", () => {
  const s = lesson.startLesson(makeState(), data, { stat: "defense" });
  s.lesson.cap = 10;
  s.lesson.target = 5;
  for (const p of s.players) p.stamina = 50;
  const uid = uidOf(s, "cd_basic");
  forceHand(s, [uid, uidOf(s, "cd_coaching")]);
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid });
  const L = s.lesson;
  assert.equal(L.status, "perfect");
  assert.equal(L.turn, 1);
  assert.ok(!L.lastFx.some((x) => x.t === "turnEnd" || x.t === "draw"));
  assert.deepEqual(L.lastFx.at(-1), { t: "end", status: "perfect" });
  for (const p of s.players) assert.equal(p.stamina, 50 - 3 + 5 * (6 - 1));
  assert.throws(() => lesson.playCard(s, data, { uid: uidOf(s, "cd_coaching"), taps: ["p1"] }), /끝났습니다/);
  assert.equal(lesson.getLessonView(s, data).canRest, false);

  // 클리어 · 실패: 6턴을 다 쓰면 점수로 판정
  const clear = lesson.startLesson(makeState({ seed: 2 }), data, { stat: "defense" });
  clear.lesson.target = 1;
  clear.lesson.cap = 100000;
  autoLesson(clear);
  assert.equal(clear.lesson.status, "clear");
  assert.equal(clear.lesson.turn, 6);
  const fail = lesson.startLesson(makeState({ seed: 2 }), data, { stat: "defense" });
  fail.lesson.target = 99999;
  fail.lesson.cap = 100000;
  autoLesson(fail);
  assert.equal(fail.lesson.status, "fail");
});

test("자율 훈련: 대상이 안 된 출전 선수만 round(카드 상승 합 ÷ 대상 수 × 0.35) · 체력 +10", () => {
  const s = makeState({ deckIds: ["cd_coaching", "cd_coaching", "cd_coaching", "cd_basic", "cd_cooldown"] });
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { stat: "pass" });
  const c = s.lesson.hand.find((u) => s.deck.find((e) => e.uid === u).cardId === "cd_coaching") || "k1";
  forceHand(s, [c]);
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: c, taps: ["p4"] });
  const gain = s.lesson.cardGainSum;
  assert.ok(gain > 0);
  while (s.lesson.turn < s.lesson.turns) lesson.lessonRest(s, data, { playerId: "p4" });
  const before = Object.fromEntries(s.players.map((p) => [p.id, { pass: p.stats.pass, stamina: p.stamina }]));
  P(s, "p2").stamina = 10;
  lesson.lessonRest(s, data, { playerId: "p4" }); // 마지막 턴
  assert.notEqual(s.lesson.status, "playing");
  const auto = R(gain * 0.35);
  for (const p of s.players) {
    if (p.id === "p4" || p.id === "p7") {
      assert.equal(p.stats.pass, before[p.id].pass, p.id);
      assert.ok(!s.lesson.autoGains[p.id]);
    } else {
      assert.equal(p.stats.pass - before[p.id].pass, auto, p.id);
      assert.equal(s.lesson.autoGains[p.id], auto);
    }
  }
  assert.equal(P(s, "p2").stamina, 10 + 5 + 10);
  assert.equal(P(s, "p7").stamina, before.p7.stamina);
  const res = lesson.lessonResult(s, data);
  assert.equal(res.perPlayer.find((x) => x.id === "p1").auto, auto);
  assert.equal(res.perPlayer.find((x) => x.id === "p1").gain, 0);
});

test("죽은 카드: 대상이 0명인 카드는 턴 시작에 버리고 다시 뽑는다 · 출전 0명이면 바로 끝", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = makeState({ seed, deckIds: ["cd_fw_drill", "cd_finisher", "cd_basic", "cd_coaching", "cd_cooldown", "cd_icing", "cd_u_ulrika"] });
    P(s, "p6").injuredTurns = 1;
    P(s, "p7").injuredTurns = 1;
    lesson.startLesson(s, data, { stat: "shoot" });
    const fw = uidOf(s, "cd_fw_drill");
    assert.ok(s.lesson.removed.includes(uidOf(s, "cd_u_ulrika")));
    for (let i = 0; i < 100 && s.lesson.status === "playing"; i++) {
      if (s.lesson.playedThisTurn === 0) {
        assert.ok(!s.lesson.hand.includes(fw), `seed ${seed} 턴 ${s.lesson.turn}`);
        assert.equal(s.lesson.hand.length, 3);
      }
      autoStep(s);
    }
  }
  // 마무리 일격: MF · FW 가 모두 결장이면 죽은 카드
  const s = makeState({ deckIds: ["cd_finisher", "cd_basic", "cd_coaching"] });
  for (const id of ["p4", "p5", "p6", "p7"]) P(s, id).injuredTurns = 1;
  lesson.startLesson(s, data, { stat: "shoot" });
  forceHand(s, [uidOf(s, "cd_finisher")]);
  const v = lesson.getLessonView(s, data).hand[0];
  assert.equal(v.playable, false);
  assert.ok(v.deadReason);
  assert.throws(() => lesson.playCard(s, data, { uid: uidOf(s, "cd_finisher"), taps: ["p1"] }));

  const none = makeState();
  for (const p of none.players) p.injuredTurns = 1;
  lesson.startLesson(none, data, { stat: "pass" });
  assert.equal(none.lesson.status, "fail");
  assert.equal(none.lesson.hand.length, 0);
});

test("추가 사용 · 다음 턴 손패 · exhaust", () => {
  const s = lesson.startLesson(makeState({ deckIds: ["cd_tactics_board", "cd_cooldown", "cd_basic", "cd_coaching", "cd_icing", "cd_mood_maker", "cd_fw_drill"] }), data, { stat: "pass" });
  const board = uidOf(s, "cd_tactics_board");
  const cool = uidOf(s, "cd_cooldown");
  const mm = uidOf(s, "cd_mood_maker");
  forceHand(s, [board, cool, mm]);
  lesson.playCard(s, data, { uid: board });
  assert.equal(s.lesson.playsLeft, 1);
  assert.equal(s.lesson.drawNext, 1);
  assert.equal(s.lesson.turn, 1);
  assert.equal(lesson.getLessonView(s, data).canRest, false);
  assert.equal(lesson.getLessonView(s, data).canEndTurn, true);
  P(s, "p3").stamina = 50;
  assert.equal(lesson.previewCard(s, data, { uid: cool }).needTaps, 1);
  lesson.playCard(s, data, { uid: cool, taps: ["p3"] });
  assert.equal(P(s, "p3").stamina, 70);
  assert.equal(s.lesson.playsLeft, 1);
  lesson.playCard(s, data, { uid: mm }); // 분위기 ×2 (E3) — exhaust 로 빠진다
  assert.ok(s.lesson.exhausted.includes(mm));
  assert.equal(s.lesson.turn, 2);
  assert.equal(s.lesson.hand.length, 4);
  assert.equal(s.lesson.drawNext, 0);
  assert.equal(s.lesson.seq, 3);
  autoLesson(s);
  for (const pile of ["hand", "drawPile", "discard"]) assert.ok(!s.lesson[pile].includes(mm));
});

test("쉬기는 그 턴의 첫 행동일 때만 (+20 / 출전 +5) · 턴 끝은 카드를 낸 뒤에만 (남은 추가 사용을 버린다)", () => {
  const s = makeState({ deckIds: ["cd_tactics_board", "cd_tactics_board", "cd_basic", "cd_coaching", "cd_icing", "cd_fw_drill", "cd_mf_drill", "cd_df_drill"] });
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { stat: "pass" });
  for (const p of s.players) p.stamina = 50;
  assert.throws(() => lesson.endLessonTurn(s, data), /1장 이상/);
  const handBefore = s.lesson.hand.slice();
  lesson.lessonRest(s, data, { playerId: "p2" });
  assert.equal(P(s, "p2").stamina, 70);
  for (const id of ["p1", "p3", "p4", "p5", "p6"]) assert.equal(P(s, id).stamina, 55);
  assert.equal(P(s, "p7").stamina, 50);
  assert.equal(s.lesson.turn, 2);
  assert.equal(s.lesson.stats.rests, 1);
  for (const u of handBefore) assert.ok(s.lesson.discard.includes(u));
  assert.equal(s.lesson.seq, 1);
  // 결장 선수도 쉬기로 고를 수 있다
  lesson.lessonRest(s, data, { playerId: "p7" });
  assert.equal(P(s, "p7").stamina, 70);

  const board = uidOf(s, "cd_tactics_board");
  forceHand(s, [board, uidOf(s, "cd_basic")]);
  lesson.playCard(s, data, { uid: board });
  assert.equal(s.lesson.playsLeft, 1);
  assert.throws(() => lesson.lessonRest(s, data, { playerId: "p1" }), /첫 행동/);
  const turn = s.lesson.turn;
  lesson.endLessonTurn(s, data);
  assert.equal(s.lesson.turn, turn + 1);
  assert.equal(s.lesson.playsLeft, 1);
  assert.equal(s.lesson.hand.length, 4); // 전술 보드 drawNext 1
});

test("L10 팀워크: 다인 카드 = 성공 인원 − 1, 레슨당 8까지 · 카드 효과 팀워크는 상한 밖", () => {
  const s = lesson.startLesson(makeState({ deckIds: ["cd_basic", "cd_basic", "cd_one_two", "cd_coaching"] }), data, { stat: "pass" });
  const [b1, b2] = s.deck.filter((e) => e.cardId === "cd_basic").map((e) => e.uid);
  const pair = uidOf(s, "cd_one_two");
  forceHand(s, [b1, b2, pair]);
  s.lesson.playsLeft = 3;
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: b1 });
  assert.equal(s.teamwork, 6);
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: b2 });
  assert.equal(s.teamwork, 8);
  assert.equal(s.lesson.twAccrued, 8);
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: pair, taps: ["p4", "p5"] });
  assert.equal(s.teamwork, 10); // 짝 +2 는 상한에 막히고, 카드 효과 +2 만
  assert.equal(s.lesson.twAccrued, 8);
});

test("코치 카드: 같은 종목 ×1.3 · 실패율 감소 · 유대 +8 · 유대 80 강화판 · lastTurnX2 · underdog · noFail", () => {
  const extra = ["cd_c_harr", "cd_c_hanna", "cd_c_barbara", "cd_c_joy", "cd_c_ornella"];
  const s = lesson.startLesson(makeState({ extra }), data, { stat: "shoot" });
  const harr = uidOf(s, "cd_c_harr");
  forceHand(s, [harr]);
  const fw = s.players.filter((p) => p.position === "FW");
  let pv = lesson.previewCard(s, data, { uid: harr });
  fw.forEach((p, i) => assert.equal(pv.targets[i].gain, R(20 * p.growth.shoot * 1.3)));
  s.lesson.turn = s.lesson.turns; // 마지막 턴 ×2
  pv = lesson.previewCard(s, data, { uid: harr });
  fw.forEach((p, i) => assert.equal(pv.targets[i].gain, R(20 * p.growth.shoot * 1.3 * 2)));
  const bond = s.supports.find((x) => x.id === "sp_coach_harr").bond;
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: harr });
  assert.equal(s.supports.find((x) => x.id === "sp_coach_harr").bond, bond + 8);

  // 한나 (실패율 −0.05) · endHeal · 다른 종목이면 ×1.3 없음
  const s2 = lesson.startLesson(makeState({ extra }), data, { stat: "shoot" });
  for (const p of s2.players) p.stamina = 30;
  const hanna = uidOf(s2, "cd_c_hanna");
  forceHand(s2, [hanna]);
  pv = lesson.previewCard(s2, data, { uid: hanna });
  assert.equal(pv.failRate, 0.2);
  assert.equal(pv.targets[0].gain, R(5 * P(s2, "p1").growth.shoot));
  s2.rngState = SAFE;
  lesson.playCard(s2, data, { uid: hanna });
  assert.equal(s2.lesson.endHeal, 5);

  // 바르바라: 실패 판정 없음 (체력 0이어도)
  const s3 = lesson.startLesson(makeState({ extra }), data, { stat: "defense" });
  for (const p of s3.players) p.stamina = 0;
  const bar = uidOf(s3, "cd_c_barbara");
  forceHand(s3, [bar]);
  assert.equal(lesson.previewCard(s3, data, { uid: bar }).failRate, 0);

  // 조이: 점수 < 목표면 ×1.5
  const s4 = lesson.startLesson(makeState({ extra }), data, { stat: "dribble" });
  const joy = uidOf(s4, "cd_c_joy");
  forceHand(s4, [joy]);
  const p6 = P(s4, "p6");
  assert.equal(lesson.previewCard(s4, data, { uid: joy, taps: ["p6"] }).targets[0].gain, R(40 * p6.growth.dribble * 1.5));
  s4.lesson.score = s4.lesson.target;
  assert.equal(lesson.previewCard(s4, data, { uid: joy, taps: ["p6"] }).targets[0].gain, R(40 * p6.growth.dribble));

  // 오르넬라: 유대 80 이면 강화판 (합계 50, 팀워크 +3), 강화(+)는 그 위에 ×1.25
  const s5 = makeState({ extra });
  s5.supports.find((x) => x.id === "sp_elder_sage").bond = 80;
  lesson.startLesson(s5, data, { stat: "dribble" });
  const orn = uidOf(s5, "cd_c_ornella");
  forceHand(s5, [orn]);
  let cv = lesson.getLessonView(s5, data).hand[0];
  assert.deepEqual([cv.bond80, cv.power, cv.cost], [true, 50, 6]);
  s5.deck.find((e) => e.uid === orn).plus = true;
  cv = lesson.getLessonView(s5, data).hand[0];
  assert.deepEqual([cv.plus, cv.power, cv.cost], [true, 63, 6]);
  s5.rngState = SAFE;
  const tw = s5.teamwork;
  lesson.playCard(s5, data, { uid: orn });
  assert.equal(s5.teamwork - tw, 3 + 3); // 4명 성공 → L10 +3, 카드 +3
});

test("대비 카드: 이번 레슨만 t* uid 로 들어가고 lessonMult 종목이면 ×1.5", () => {
  const s = lesson.startLesson(makeState(), data, { stat: "defense", prep: true, prepCards: ["cd_p_tackle", "cd_p_intercept"] });
  assert.deepEqual(s.lesson.temp, [{ uid: "t1", cardId: "cd_p_tackle" }, { uid: "t2", cardId: "cd_p_intercept" }]);
  assert.equal(s.lesson.hand.length + s.lesson.drawPile.length, s.deck.length + 2);
  forceHand(s, ["t1"]);
  const defs = s.players.filter((p) => p.position === "GK" || p.position === "DF");
  const pv = lesson.previewCard(s, data, { uid: "t1" });
  defs.forEach((p, i) => assert.equal(pv.targets[i].gain, R((40 / 3) * p.growth.defense * 1.5)));
  s.rngState = SAFE;
  lesson.playCard(s, data, { uid: "t1" });
  assert.ok(s.lesson.discard.includes("t1"));
  assert.equal(s.deck.length, 10); // 덱에는 들어가지 않는다

  const s2 = lesson.startLesson(makeState(), data, { stat: "shoot", prep: true, prepCards: ["cd_p_tackle", "cd_p_hold"] });
  forceHand(s2, ["t1", "t2"]);
  const p2 = P(s2, "p2");
  assert.equal(lesson.previewCard(s2, data, { uid: "t1" }).targets.find((t) => t.id === "p2").gain, R((40 / 3) * p2.growth.shoot));
  assert.equal(lesson.previewCard(s2, data, { uid: "t2" }).targets.find((t) => t.id === "p2").gain, R(20 * p2.growth.shoot));
});

test("특별 레슨 상승 +50%, 검증 실패 시 상태 불변", () => {
  const s = lesson.startLesson(makeState(), data, { stat: "pass", special: true });
  const uid = uidOf(s, "cd_coaching");
  forceHand(s, [uid]);
  const p4 = P(s, "p4");
  assert.equal(lesson.previewCard(s, data, { uid, taps: ["p4"] }).targets[0].gain, R(35 * p4.growth.pass * 1.5));
  const snap = JSON.stringify(s);
  assert.throws(() => lesson.playCard(s, data, { uid, taps: [] }));
  assert.throws(() => lesson.playCard(s, data, { uid, taps: ["p4", "p5"] }));
  assert.throws(() => lesson.playCard(s, data, { uid: "k999", taps: ["p4"] }), /손패/);
  assert.throws(() => lesson.lessonRest(s, data, { playerId: "p99" }));
  s.phase = "week";
  assert.throws(() => lesson.playCard(s, data, { uid, taps: ["p4"] }), /phase/);
  s.phase = "lesson";
  assert.equal(JSON.stringify(s), snap);
});
