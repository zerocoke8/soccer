// test/lesson.test.mjs — LESSON_PROTO_PLAN §14.3 ~ §14.13 · §14.17 (js/engine/lesson.js 구역 방식, ZE2)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as lesson from "../js/engine/lesson.js";
import * as cards from "../js/engine/cards.js";
import * as zones from "../js/engine/zones.js";
import { createRngFromState } from "../js/engine/rng.js";
import { formationSlots, slotPosition, FORMATIONS } from "../js/engine/training.js";

const data = loadData();
const R = cards.roundCost;
const ZC = data.lesson.zones;
const GS = data.lesson.lesson.cardGainScale; // 0.64

/** 기본 편성(2-2-2) 레슨 런 비슷한 상태. deckIds 를 안 주면 시작 덱 3장 + 배치된 7명의 고유 카드. */
function makeState({ seed = 7, policy = "team", deckIds = null, extra = [], squad = undefined } = {}) {
  const roster = run.buildRoster({ data, squad });
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

/** 고정 구역 픽스처: 수비 p1 p2 · 피지컬 p3 · 패스 p4 p5 · 슈팅 p6 · 드리블 p7 */
const LAYOUT = { p1: "defense", p2: "defense", p3: "physical", p4: "pass", p5: "pass", p6: "shoot", p7: "dribble" };
/** 이번 턴 구역을 지정한다 (결장 선수는 뺀다) */
function setZones(s, layout = LAYOUT) {
  const z = {};
  for (const [id, zone] of Object.entries(layout)) if (!s.lesson.out.includes(id)) z[id] = zone;
  s.lesson.zones = z;
  return s;
}
const posOf = (s) => cards.fieldPositions(s, data);
const C = ZC.centers;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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
/** 실패 판정은 하고 (첫 수 < 0.25) 부상은 없다 (둘째 수 ≥ 0.5) */
const FAIL_NO_INJURY = rngWhere((r) => r.next() < 0.25 && r.next() >= 0.5);
const safePlay = (s, uid, args = {}) => {
  s.rngState = SAFE;
  return lesson.playCard(s, data, { uid, ...args });
};
const full = (s) => {
  for (const p of s.players) p.stamina = 100;
  return s;
};

/** 간단한 자동 진행: 낼 수 있는 첫 카드의 첫 후보 점 (미리보기 ok), 없으면 턴 끝 */
function autoStep(state) {
  const v = lesson.getLessonView(state, data);
  for (const h of v.hand.filter((x) => x.playable)) {
    for (const c of lesson.dropCandidates(state, data, { uid: h.uid })) {
      const args = { uid: h.uid, at: c.at || undefined, playerId: c.playerId };
      if (lesson.previewCard(state, data, args).ok) {
        lesson.playCard(state, data, args);
        return;
      }
    }
  }
  lesson.endLessonTurn(state, data);
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
const start = (opts = {}, args = {}) => lesson.startLesson(makeState(opts), data, { zone: "physical", ...args });

/** 점수 = 기본 + 분위기 + 카드(− 실패), 스탯 순증가 = 점수 + 부 스탯 */
function checkScore(s, where = "") {
  const L = s.lesson;
  const sum = (m) => Object.values(m).reduce((a, x) => a + x, 0);
  assert.equal(L.score, sum(L.baseGains) + sum(L.moodGains) + sum(L.cardGains), `${where}: 점수 = 기본 + 분위기 + 카드`);
  const net = s.players.reduce((a, p) => a + zones.ZONE_IDS.reduce((b, z) => b + p.stats[z] - L.before[p.id][z], 0), 0);
  assert.equal(net, L.score + sum(L.subGains), `${where}: 스탯 순증가 = 점수 + 부 스탯`);
}

// ---------------------------------------------------------------------------
// 시작 · 흩어지기 · 결정성
// ---------------------------------------------------------------------------

test("startLesson: 중점 구역 · 목표 430/520 · 턴 수 · 1턴 흩어지기 + 손패 3장, 특별 = 목표 ×1.15 · 상한 ×1.2", () => {
  const s = makeState();
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { zone: "pass" });
  const L = s.lesson;
  assert.equal(L.status, "playing");
  assert.equal(L.zone, "pass");
  assert.equal(L.stat, undefined);
  assert.deepEqual([L.turn, L.turns, L.target, L.cap, L.score], [1, 6, 430, 520, 0]);
  assert.equal(L.hand.length, 3);
  assert.equal(L.hand.length + L.drawPile.length + L.removed.length, s.deck.length);
  assert.equal(L.seq, 0);
  assert.deepEqual(L.buffs, lesson.emptyBuffs());
  assert.deepEqual(L.bench, []);
  // 결장 선수는 흩어지지 않는다
  assert.deepEqual(Object.keys(L.zones), ["p1", "p2", "p3", "p4", "p5", "p6"]);
  for (const z of Object.values(L.zones)) assert.ok(zones.ZONE_IDS.includes(z));
  assert.deepEqual(L.lastFx.map((x) => x.t), ["scatter", "draw"]);
  assert.deepEqual(L.lastFx[0].zones, L.zones);
  for (const k of ["baseGains", "moodGains", "cardGains", "subGains", "benchTurns", "targeted"]) assert.deepEqual(L[k], {}, k);
  assert.deepEqual(L.stats, { plays: 0, benches: 0, fails: 0, injuries: 0 });
  for (const k of ["stat", "restTurn", "cardGainSum", "autoGains"]) assert.ok(!(k in L), k);

  const sp = makeState();
  sp.season = 3;
  lesson.startLesson(sp, data, { zone: "pass", special: true });
  assert.deepEqual([sp.lesson.turns, sp.lesson.target, sp.lesson.cap], [8, 690, 876]);
  const s1 = lesson.startLesson(makeState(), data, { zone: "pass", special: true });
  assert.deepEqual([s1.lesson.target, s1.lesson.cap], [495, 624]);
  const s2 = makeState();
  s2.season = 2;
  lesson.startLesson(s2, data, { zone: "pass", special: true });
  assert.deepEqual([s2.lesson.turns, s2.lesson.target, s2.lesson.cap], [7, 587, 744]);

  assert.throws(() => lesson.startLesson(makeState(), data, { zone: "magic" }), /중점 구역/);
  assert.throws(() => lesson.startLesson(makeState(), data, { stat: "pass" }), /중점 구역/);
  assert.throws(() => lesson.startLesson(makeState(), data, { zone: "pass", prepCards: ["cd_basic"] }), /대비 카드가 아닙니다/);
  assert.throws(() => lesson.startLesson(s, data, { zone: "pass" }), /이미 레슨 중/);
  assert.equal(lesson.lessonRest, undefined, "lessonRest 는 없어졌다");
});

test("흩어지기: 선수 1명당 rng 1번 · 결정적 · 2,000번 분포 = 가중치 ±3%p (중점 ×2) · 결장 제외", () => {
  const s = start({}, { zone: "pass" });
  // rng 1번씩: 같은 rngState 면 같은 배치, 소비량 = 출전 인원
  const r1 = createRngFromState(12345);
  const z1 = lesson.scatterZones(s, data, r1);
  const r2 = createRngFromState(12345);
  assert.deepEqual(lesson.scatterZones(s, data, r2), z1);
  const r3 = createRngFromState(12345);
  for (let i = 0; i < 7; i++) r3.next();
  assert.equal(r2.getState(), r3.getState());
  // 분포
  for (const focus of ["pass", "shoot"]) {
    const st = start({}, { zone: focus });
    const rng = createRngFromState(99);
    const count = {};
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const z = lesson.scatterZones(st, data, rng);
      for (const [id, zone] of Object.entries(z)) {
        count[id] ||= {};
        count[id][zone] = (count[id][zone] || 0) + 1;
      }
    }
    for (const p of st.players) {
      const w = Object.fromEntries(zones.ZONE_IDS.map((z) => [z, zones.zoneWeight(ZC, p.position, z, focus, 2)]));
      const tot = Object.values(w).reduce((a, x) => a + x, 0);
      for (const z of zones.ZONE_IDS) {
        const got = (count[p.id][z] || 0) / N;
        assert.ok(Math.abs(got - w[z] / tot) <= 0.03, `${focus} ${p.id} ${z}: ${got.toFixed(3)} vs ${(w[z] / tot).toFixed(3)}`);
      }
    }
  }
  // GK 는 DF 가중치 [가정 Q1-a], 중점 구역은 ×2
  assert.equal(zones.zoneWeight(ZC, "GK", "pass", "pass", 2), 40);
  // 결장 선수는 건너뛴다 (rng 도 쓰지 않는다)
  const o = start();
  o.lesson.out = ["p1", "p2"];
  const ro = createRngFromState(5);
  assert.deepEqual(Object.keys(lesson.scatterZones(o, data, ro)), ["p3", "p4", "p5", "p6", "p7"]);
  const rr = createRngFromState(5);
  for (let i = 0; i < 5; i++) rr.next();
  assert.equal(ro.getState(), rr.getState());
});

test("결정성: 같은 시드 = 같은 결과, 시드가 다르면 다른 진행 · 새 턴마다 다시 흩어진다", () => {
  for (const zone of zones.ZONE_IDS) {
    const a = autoLesson(lesson.startLesson(makeState({ seed: 11 }), data, { zone }));
    const b = autoLesson(lesson.startLesson(makeState({ seed: 11 }), data, { zone }));
    assert.deepEqual(a, b, zone);
  }
  const starts = new Set();
  for (let seed = 1; seed <= 6; seed++) starts.add(JSON.stringify(lesson.startLesson(makeState({ seed }), data, { zone: "pass" }).lesson.zones));
  assert.ok(starts.size > 1);
  const s = start({ seed: 3 });
  const seen = new Set([JSON.stringify(s.lesson.zones)]);
  for (let t = 0; t < 4; t++) {
    lesson.endLessonTurn(s, data);
    assert.equal(s.lesson.lastFx.filter((x) => x.t === "scatter").length, 1);
    const i = s.lesson.lastFx.findIndex((x) => x.t === "scatter");
    assert.ok(i < s.lesson.lastFx.findIndex((x) => x.t === "draw"), "흩어지기는 뽑기보다 먼저");
    seen.add(JSON.stringify(s.lesson.zones));
  }
  assert.ok(seen.size > 1, "턴마다 다시 흩어진다");
});

test("레슨 중간 JSON 왕복 (zones · bench 포함) 뒤 같은 손패 · 같은 판정", () => {
  for (const seed of [3, 4, 5]) {
    const a = lesson.startLesson(makeState({ seed }), data, { zone: "defense" });
    autoStep(a);
    const f = cards.fieldPlayers(a)[0];
    if (a.lesson.status === "playing" && f) lesson.benchPlayer(a, data, { playerId: f.id });
    autoStep(a);
    const b = clone(a);
    assert.deepEqual(b.lesson.zones, a.lesson.zones);
    assert.deepEqual(b.lesson.bench, a.lesson.bench);
    assert.deepEqual(lesson.getLessonView(b, data), lesson.getLessonView(a, data));
    autoLesson(a);
    const c = autoLesson(b, { roundtrip: true });
    assert.deepEqual(c, a);
  }
});

test("view · preview · dropCandidates · lessonResult 는 상태와 rng 를 바꾸지 않는다 (뷰 모양 §14.13)", () => {
  const s = start({ seed: 9, extra: ["cd_fw_drill", "cd_icing", "cd_finisher"] });
  autoStep(s);
  setZones(s);
  const snap = JSON.stringify(s);
  const v = lesson.getLessonView(s, data);
  for (const h of v.hand) {
    lesson.previewCard(s, data, { uid: h.uid });
    lesson.previewCard(s, data, { uid: h.uid, at: { x: 20, y: 30 } });
    lesson.previewCard(s, data, { uid: h.uid, playerId: "p6" });
    lesson.dropCandidates(s, data, { uid: h.uid });
  }
  lesson.previewCard(s, data, { uid: "k999" });
  lesson.dropCandidates(s, data, { uid: "k999" });
  lesson.lessonResult(s, data);
  assert.equal(JSON.stringify(s), snap);

  assert.equal(v.players.length, 7);
  for (const k of ["season", "week", "zone", "special", "prep", "turn", "turns", "score", "target", "cap", "status", "playsLeft",
    "zoneCfg", "positions", "bench", "benchMax", "canBench", "canEndTurn", "buffs", "chips", "hand", "piles", "players", "seq", "lastFx"]) {
    assert.ok(k in v, k);
  }
  for (const k of ["stat", "canRest"]) assert.ok(!(k in v), k);
  assert.deepEqual(Object.keys(v.zoneCfg).sort(), ["aspect", "centers", "pad", "pickR", "radius"]);
  assert.equal(v.benchMax, 2);
  for (const k of ["uid", "cardId", "name", "family", "plus", "bond80", "targetKind", "size", "radius", "onlyZones", "power", "cost", "heal", "playable", "deadReason", "desc"]) {
    assert.ok(k in v.hand[0], k);
  }
  for (const k of ["needTaps", "mode", "count"]) assert.ok(!(k in v.hand[0]), k);
  for (const k of ["id", "zone", "bench", "out", "baseNext", "failRate", "stamina"]) assert.ok(k in v.players[0], k);
  // 토큰 자리 = 경기장 선수 위치 (zones.js)
  const sv = lesson.getLessonView(s, data);
  assert.deepEqual(sv.positions, zones.zonePositions(s.lesson, s.players, ZC));
  assert.deepEqual(sv.positions.p1, { x: 16.5, y: 30 });
});

// ---------------------------------------------------------------------------
// 기본 훈련 · 벤치
// ---------------------------------------------------------------------------

test("기본 훈련: 서 있는 구역 스탯 + round(unit × 성장률 × 중점 × 컨디션 × (1 + 효율)) · 분위기 몫 · 부 스탯 없음 · 체력 −1", () => {
  for (const special of [false, true]) {
    const s = start({ extra: ["cd_high_five"] }, { zone: "pass", special });
    s.condition = 4; // ×1.2
    s.modifiers = [{ key: "trainingEfficiency", amount: 0.15, untilSeason: null }];
    setZones(s);
    s.lesson.buffs.mood = 2;
    for (const p of s.players) p.stamina = 50;
    const before = Object.fromEntries(s.players.map((p) => [p.id, { ...p.stats }]));
    const unit = 3.2 + 2 * 1.5 * GS; // 5.12
    const fm = special ? 2.0 : 1.5;
    const want = {};
    for (const p of s.players) {
      const z = LAYOUT[p.id];
      want[p.id] = R(unit * p.growth[z] * (z === "pass" ? fm : 1) * 1.2 * 1.15);
    }
    const v = lesson.getLessonView(s, data);
    for (const pv of v.players) assert.equal(pv.baseNext, want[pv.id], `baseNext ${pv.id}`);
    lesson.endLessonTurn(s, data); // 카드 0장으로도 턴 끝
    const L = s.lesson;
    assert.equal(L.turn, 2);
    for (const p of s.players) {
      const z = LAYOUT[p.id];
      for (const st of zones.ZONE_IDS) assert.equal(p.stats[st] - before[p.id][st], st === z ? want[p.id] : 0, `${special} ${p.id}.${st}`);
      assert.equal(p.stamina, 49, `${p.id} 체력 −1`);
      assert.equal(L.baseGains[p.id], R((want[p.id] * 3.2) / unit), `${p.id} 기본 몫`);
      assert.equal(L.moodGains[p.id], want[p.id] - L.baseGains[p.id], `${p.id} 분위기 몫`);
    }
    assert.deepEqual(L.targeted, {});
    assert.deepEqual(L.subGains, {});
    assert.equal(L.score, Object.values(want).reduce((a, x) => a + x, 0));
    assert.equal(L.buffs.mood, 1, "분위기 감소 −1");
    const fx = L.lastFx;
    assert.deepEqual(fx.filter((x) => x.t === "base").map((x) => [x.id, x.stat, x.n]), s.players.map((p) => [p.id, LAYOUT[p.id], want[p.id]]));
    assert.equal(fx.filter((x) => x.t === "cost" && x.src === "base").length, 7);
    assert.ok(!fx.some((x) => x.t === "tick"));
    checkScore(s, `special ${special}`);
  }
  // 상한 1000에 잘린 분은 점수에 넣지 않는다 · 결장 선수는 기본 훈련이 없다
  const s = start();
  setZones(s);
  P(s, "p6").stats.shoot = 999;
  s.lesson.out = ["p7"];
  delete s.lesson.zones.p7;
  const b7 = { ...P(s, "p7").stats };
  lesson.endLessonTurn(s, data);
  assert.equal(P(s, "p6").stats.shoot, 1000);
  assert.equal(s.lesson.baseGains.p6 + s.lesson.moodGains.p6, 1);
  assert.deepEqual(P(s, "p7").stats, b7);
  assert.equal(P(s, "p7").stamina, 100);
});

test("벤치: 최대 2명 · 대상 불가 · 기본 훈련 없음 · 턴 끝 +15 · 되돌리기 · 다음 턴 비움 · rng 를 쓰지 않는다", () => {
  const s = start({ extra: ["cd_fw_drill", "cd_icing", "cd_coaching"] });
  setZones(s);
  for (const p of s.players) p.stamina = 40;
  const L = s.lesson;
  const rng0 = s.rngState;
  lesson.benchPlayer(s, data, { playerId: "p2" });
  assert.deepEqual(L.bench, ["p2"]);
  assert.equal(L.seq, 1);
  assert.deepEqual(L.lastFx, [{ t: "bench", id: "p2", on: true }]);
  assert.equal(s.rngState, rng0);
  assert.equal(lesson.getLessonView(s, data).players.find((p) => p.id === "p2").bench, true);
  assert.equal(lesson.getLessonView(s, data).players.find((p) => p.id === "p2").baseNext, 0);
  assert.ok(!("p2" in lesson.getLessonView(s, data).positions));
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p2" }), /이미 벤치/);
  lesson.benchPlayer(s, data, { playerId: "p3" });
  assert.equal(lesson.getLessonView(s, data).canBench, false);
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p4" }), /최대 2명/);
  // 대상이 될 수 없다 (원 · 단일), 회복 단일은 된다
  const fw = uidOf(s, "cd_fw_drill");
  const coach = uidOf(s, "cd_coaching");
  const icing = uidOf(s, "cd_icing");
  forceHand(s, [fw, coach, icing]);
  L.playsLeft = 3;
  assert.deepEqual(lesson.previewCard(s, data, { uid: fw, at: C.defense }).targets.map((t) => t.id), ["p1"]);
  assert.equal(lesson.previewCard(s, data, { uid: coach, playerId: "p2" }).ok, false);
  assert.throws(() => lesson.playCard(s, data, { uid: coach, playerId: "p2" }), /고를 수 없습니다/);
  const pvI = lesson.previewCard(s, data, { uid: icing, playerId: "p2" });
  assert.deepEqual([pvI.ok, pvI.healId, pvI.targets], [true, "p2", []]);
  lesson.playCard(s, data, { uid: icing, playerId: "p2" });
  assert.equal(P(s, "p2").stamina, 70);
  // 되돌리기 → 자기 구역으로
  lesson.benchPlayer(s, data, { playerId: "p3", on: false });
  assert.deepEqual(L.bench, ["p2"]);
  assert.equal(L.zones.p3, "physical");
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p3", on: false }), /벤치에 없습니다/);
  assert.equal(L.stats.benches, 2);
  // 턴 끝: 벤치 선수는 기본 훈련 없이 +15, 나머지는 기본 훈련 + 체력 −1
  const before = Object.fromEntries(s.players.map((p) => [p.id, { ...p.stats }]));
  const st = Object.fromEntries(s.players.map((p) => [p.id, p.stamina]));
  lesson.endLessonTurn(s, data);
  assert.deepEqual(P(s, "p2").stats, before.p2);
  assert.equal(P(s, "p2").stamina, st.p2 + 15);
  assert.equal(P(s, "p3").stamina, st.p3 - 1);
  assert.ok(P(s, "p3").stats.physical > before.p3.physical);
  assert.ok(s.lesson.lastFx.some((x) => x.t === "heal" && x.id === "p2" && x.n === 15 && x.src === "bench"));
  assert.equal(s.lesson.benchTurns.p2, 1);
  // 다음 턴: 벤치는 비고 다시 흩어진다
  assert.deepEqual(s.lesson.bench, []);
  assert.ok(s.lesson.zones.p2);
  // 결장 선수 · 없는 선수 · 끝난 레슨
  s.lesson.out.push("p7");
  delete s.lesson.zones.p7;
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p7" }), /결장/);
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p99" }), /찾을 수 없습니다/);
  s.phase = "week";
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p1" }), /phase/);
});

test("주인 카드: 주인이 벤치에 있으면 낼 수 없다 (손패에 남아 playable false) · 돌아오면 다시", () => {
  const s = start();
  setZones(s);
  const nc = uidOf(s, "cd_u_neria");
  forceHand(s, [nc, uidOf(s, "cd_basic")]);
  lesson.benchPlayer(s, data, { playerId: "p1" });
  const h = lesson.getLessonView(s, data).hand[0];
  assert.deepEqual([h.playable, h.deadReason], [false, "주인이 벤치에 있습니다"]);
  assert.equal(lesson.previewCard(s, data, { uid: nc }).ok, false);
  assert.deepEqual(lesson.dropCandidates(s, data, { uid: nc }), []);
  assert.throws(() => lesson.playCard(s, data, { uid: nc }), /벤치/);
  lesson.benchPlayer(s, data, { playerId: "p1", on: false });
  assert.equal(lesson.getLessonView(s, data).hand[0].playable, true);
});

// ---------------------------------------------------------------------------
// 대상 · 상승 (§14.6 · §14.7)
// ---------------------------------------------------------------------------

test("대상 판정: 원 (놓은 점 · 0명 거절 · 경계) · 단일 pickR · onlyZones · 전체 · 미리보기 circle", () => {
  const s = full(start({ extra: ["cd_fw_drill", "cd_one_two", "cd_defense_org", "cd_finisher"] }));
  setZones(s);
  const u = (id) => uidOf(s, id);
  forceHand(s, [u("cd_fw_drill"), u("cd_one_two"), u("cd_defense_org"), u("cd_finisher"), u("cd_basic"), u("cd_coaching")]);
  const ids = (pv) => pv.targets.map((t) => t.id);
  let pv = lesson.previewCard(s, data, { uid: u("cd_fw_drill"), at: C.pass });
  assert.deepEqual([pv.ok, ids(pv), pv.kind], [true, ["p4", "p5"], "circle"]);
  assert.deepEqual(pv.circle, { x: 50, y: 30, r: 9 });
  pv = lesson.previewCard(s, data, { uid: u("cd_fw_drill"), at: { x: 90, y: 90 } });
  assert.deepEqual([pv.ok, pv.reason, pv.circle], [false, "원 안에 선수가 없습니다", { x: 90, y: 90, r: 9 }]);
  pv = lesson.previewCard(s, data, { uid: u("cd_fw_drill") });
  assert.deepEqual([pv.ok, pv.reason], [false, "원을 놓을 자리를 고르세요"]);
  assert.deepEqual(ids(lesson.previewCard(s, data, { uid: u("cd_one_two"), at: mid(posOf(s).p4, posOf(s).p5) })), ["p4", "p5"]);
  assert.deepEqual(ids(lesson.previewCard(s, data, { uid: u("cd_defense_org"), at: mid(C.defense, C.physical) })), ["p1", "p2", "p3"]);
  assert.deepEqual(ids(lesson.previewCard(s, data, { uid: u("cd_basic") })), ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  // 단일
  assert.deepEqual(ids(lesson.previewCard(s, data, { uid: u("cd_coaching"), at: { x: 81, y: 31 } })), ["p6"]);
  assert.equal(lesson.previewCard(s, data, { uid: u("cd_coaching"), at: { x: 70, y: 50 } }).ok, false);
  assert.equal(lesson.previewCard(s, data, { uid: u("cd_coaching") }).reason, "선수 위에 놓으세요");
  assert.equal(lesson.previewCard(s, data, { uid: u("cd_finisher"), playerId: "p1" }).ok, false);
  assert.deepEqual(ids(lesson.previewCard(s, data, { uid: u("cd_finisher"), playerId: "p7" })), ["p7"]);
  // 실제로 내면 같은 대상
  const before = Object.fromEntries(s.players.map((p) => [p.id, p.stamina]));
  s.lesson.playsLeft = 2;
  safePlay(s, u("cd_fw_drill"), { at: C.pass });
  assert.deepEqual(Object.keys(s.lesson.targeted).sort(), ["p4", "p5"]);
  for (const p of s.players) assert.equal(before[p.id] - p.stamina, ["p4", "p5"].includes(p.id) ? 11 : 0, p.id);
  assert.throws(() => lesson.playCard(s, data, { uid: u("cd_one_two"), at: { x: 90, y: 90 } }), /원 안에 선수가 없습니다/);
});

test("상승 = 서 있는 구역의 스탯: round(1인 위력 × 성장률 × M × 0.64), 부 스탯 = round(g × 0.36 × 부 성장률), 점수 = 구역 스탯만", () => {
  const s = full(start({ deckIds: ["cd_coaching", "cd_basic", "cd_cooldown"] }, { zone: "physical" }));
  setZones(s, { ...LAYOUT, p1: "shoot" }); // GK 가 슈팅 구역에 가 있다 (L33)
  s.condition = 4; // ×1.2
  s.modifiers = [{ key: "trainingEfficiency", amount: 0.15, untilSeason: null }];
  const p = P(s, "p1");
  const uid = uidOf(s, "cd_coaching");
  forceHand(s, [uid, uidOf(s, "cd_basic")]);
  s.lesson.playsLeft = 2; // 턴이 끝나지 않게 (기본 훈련이 섞이지 않게)
  const b = { ...p.stats };
  const pv = lesson.previewCard(s, data, { uid, playerId: "p1" });
  safePlay(s, uid, { playerId: "p1" });
  const g = R(35 * p.growth.shoot * 1.2 * 1.15 * GS);
  assert.equal(pv.targets[0].gain, g);
  assert.deepEqual([pv.targets[0].zone, pv.targets[0].stat, pv.targets[0].focus], ["shoot", "shoot", false]);
  assert.equal(p.stats.shoot - b.shoot, g);
  assert.equal(p.stats.dribble - b.dribble, R(g * 0.36 * p.growth.dribble)); // shoot → dribble
  assert.equal(s.lesson.cardGains.p1, g);
  assert.equal(p.stamina, 100 - 21);
  assert.equal(s.lesson.seq, 1);
  checkScore(s);

  // 중점 구역 ×1.5, 특별 중점 ×2.0
  for (const [special, m] of [[false, 1.5], [true, 2.0]]) {
    const t = full(start({ deckIds: ["cd_coaching", "cd_basic", "cd_cooldown"] }, { zone: "pass", special }));
    setZones(t);
    const c = uidOf(t, "cd_coaching");
    forceHand(t, [c]);
    const p4 = P(t, "p4");
    const pv4 = lesson.previewCard(t, data, { uid: c, playerId: "p4" });
    assert.equal(pv4.targets[0].gain, R(35 * p4.growth.pass * m * GS), `special ${special}`);
    assert.equal(pv4.targets[0].focus, true);
    assert.equal(lesson.previewCard(t, data, { uid: c, playerId: "p6" }).targets[0].gain, R(35 * P(t, "p6").growth.shoot * GS));
  }

  // 상한 1000에 잘린 분은 점수에 들어가지 않는다
  const s2 = full(start({ deckIds: ["cd_coaching", "cd_basic", "cd_cooldown"] }));
  setZones(s2);
  P(s2, "p6").stats.shoot = 998;
  forceHand(s2, [uidOf(s2, "cd_coaching"), uidOf(s2, "cd_basic")]);
  s2.lesson.playsLeft = 2;
  safePlay(s2, uidOf(s2, "cd_coaching"), { playerId: "p6" });
  assert.equal(P(s2, "p6").stats.shoot, 1000);
  assert.equal(s2.lesson.score, 2);
});

test("원 · 전체 위력은 1인당 (인원이 많을수록 합계가 크다) · 비용도 1인당 (포메이션 4종)", () => {
  for (const fm of Object.keys(FORMATIONS)) {
    const s = makeState({ deckIds: ["cd_basic", "cd_defense_org", "cd_coaching", "cd_cooldown"] });
    formationSlots(fm).forEach((slot, i) => {
      s.players[i].slot = slot;
      s.players[i].position = slotPosition(slot);
    });
    lesson.startLesson(s, data, { zone: "shoot" });
    setZones(s, { p1: "defense", p2: "defense", p3: "defense", p4: "defense", p5: "physical", p6: "physical", p7: "pass" });
    full(s);
    const uid = uidOf(s, "cd_defense_org");
    forceHand(s, [uid, uidOf(s, "cd_basic")]);
    const pv = lesson.previewCard(s, data, { uid, at: mid(C.defense, C.physical) });
    // 수비 4명 대형(R 5.5)은 모두, 피지컬 2명도 모두 → 6명
    assert.deepEqual(pv.targets.map((t) => t.id), ["p1", "p2", "p3", "p4", "p5", "p6"], fm);
    for (const t of pv.targets) {
      const p = P(s, t.id);
      assert.equal(t.gain, R(15 * p.growth[t.zone] * GS), `${fm} ${t.id}`);
      assert.equal(t.cost, 9, `${fm} 1인 비용`);
    }
    assert.equal(pv.total, pv.targets.reduce((a, t) => a + t.gain, 0));
  }
});

test("카드 1장에 실패 판정 1번 — 가장 위험한 선수만 서 있는 구역 −5 (동률은 체력 낮은 쪽 → 슬롯 순서)", () => {
  const setup = (st3, st4) => {
    const s = start({ deckIds: ["cd_basic", "cd_coaching", "cd_cooldown", "cd_icing"] });
    setZones(s);
    for (const p of s.players) p.stamina = 100;
    P(s, "p2").stamina = 50; // 10%
    P(s, "p3").stamina = st3;
    P(s, "p4").stamina = st4;
    forceHand(s, [uidOf(s, "cd_basic"), uidOf(s, "cd_coaching")]);
    s.lesson.playsLeft = 2;
    return s;
  };
  for (const [st3, st4, failer] of [[30, 30, "p3"], [30, 25, "p4"], [25, 30, "p3"]]) {
    const s = setup(st3, st4);
    const pv = lesson.previewCard(s, data, { uid: uidOf(s, "cd_basic") });
    assert.equal(pv.ok, true);
    assert.equal(pv.failRate, 0.25);
    assert.equal(pv.failerId, failer);
    const before = Object.fromEntries(s.players.map((p) => [p.id, { ...p.stats }]));
    s.rngState = FAIL_NO_INJURY;
    lesson.playCard(s, data, { uid: uidOf(s, "cd_basic") });
    const L = s.lesson;
    assert.equal(L.stats.fails, 1);
    assert.equal(L.stats.injuries, 0);
    const z = LAYOUT[failer];
    assert.deepEqual(L.lastFx.filter((x) => x.t === "fail"), [{ t: "fail", id: failer, stat: z, n: 5, injured: false }]);
    for (const p of s.players) {
      const d = p.stats[LAYOUT[p.id]] - before[p.id][LAYOUT[p.id]];
      if (p.id === failer) assert.equal(d, -5);
      else assert.equal(d, pv.targets.find((t) => t.id === p.id).gain, p.id);
    }
    assert.equal(L.cardGains[failer], -5);
    assert.deepEqual(L.out, []);
    checkScore(s);
  }
  const s = setup(100, 100);
  P(s, "p2").stamina = 100;
  assert.equal(lesson.previewCard(s, data, { uid: uidOf(s, "cd_basic") }).failRate, 0.02);
});

test("부상 → out + zones · bench 에서 빠짐 + injuredTurns 1 + 그 선수의 고유 카드 제외", () => {
  const failInjury = rngWhere((r) => r.next() < 0.25 && r.next() < 0.5);
  const s = full(start());
  setZones(s);
  const neria = byChar(s, "ch_spirit_keeper");
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
  assert.ok(!(neria.id in L.zones));
  assert.ok(!(neria.id in lesson.getLessonView(s, data).positions));
  const v = lesson.getLessonView(s, data).players.find((p) => p.id === neria.id);
  assert.deepEqual([v.out, v.injured, v.zone], [true, true, null]);
  // 남은 레슨에서 흩어지지 않고 대상이 되지 않는다
  autoLesson(s);
  assert.equal(s.lesson.targeted[neria.id], 1);
  assert.ok(!(neria.id in s.lesson.zones));

  // 주인이 자기 고유 카드를 내다 다치면 그 카드도 removed 로
  const s2 = full(start());
  setZones(s2);
  byChar(s2, "ch_spirit_keeper").stamina = 30;
  const c2 = uidOf(s2, "cd_u_neria");
  forceHand(s2, [c2, uidOf(s2, "cd_basic")]);
  s2.rngState = failInjury;
  lesson.playCard(s2, data, { uid: c2 });
  assert.ok(s2.lesson.removed.includes(c2));
  assert.ok(!s2.lesson.discard.includes(c2));

  // 결장 중인 선수 (레슨 시작 전 부상) 의 고유 카드는 시작부터 빠지고, injuredTurns 는 lesson.js 가 줄이지 않는다
  const s3 = makeState();
  byChar(s3, "ch_spirit_keeper").injuredTurns = 2;
  lesson.startLesson(s3, data, { zone: "defense" });
  assert.deepEqual(s3.lesson.outAtStart, [byChar(s3, "ch_spirit_keeper").id]);
  assert.deepEqual(s3.lesson.removed, [uidOf(s3, "cd_u_neria")]);
  autoLesson(s3);
  assert.equal(byChar(s3, "ch_spirit_keeper").injuredTurns, 2);
});

test("고유 카드: 주인 1명 · 주 스탯 구역이면 ×1.5 (비용 21, 아니면 14) · 캐릭터 효과는 늘", () => {
  for (const [zone, mult, cost] of [["defense", 1.5, 21], ["physical", 1.5, 21], ["shoot", 1, 14]]) {
    const s = full(start({}, { zone: "pass" })); // 중점 구역 밖에서 본다
    setZones(s, { ...LAYOUT, p1: zone });
    const neria = P(s, "p1");
    neria.stamina = 50;
    const nc = uidOf(s, "cd_u_neria");
    forceHand(s, [nc, uidOf(s, "cd_basic")]);
    s.lesson.playsLeft = 2;
    const h = lesson.getLessonView(s, data).hand[0];
    assert.deepEqual([h.targetKind, h.power, h.cost, h.heal], ["owner", 35, cost, false], zone);
    const pv = lesson.previewCard(s, data, { uid: nc });
    assert.deepEqual(pv.targets.map((t) => [t.id, t.zone, t.unique15]), [["p1", zone, mult > 1]]);
    const b = neria.stats[zone];
    safePlay(s, nc);
    assert.equal(neria.stats[zone] - b, R(35 * mult * neria.growth[zone] * GS), zone);
    assert.equal(neria.stamina, 50 - cost + 15, `${zone}: 비용 · 주인 체력 +15`);
    assert.equal(s.lesson.buffs.nextNoFail, true);
    assert.deepEqual(s.lesson.targeted, { p1: 1 });
  }
  // 강화판 44 × 1.5 = 66, 비용은 강화 전 기준 21
  const s = full(start());
  setZones(s);
  s.deck.find((e) => e.cardId === "cd_u_dorbina").plus = true;
  const dc = uidOf(s, "cd_u_dorbina");
  forceHand(s, [dc, uidOf(s, "cd_basic")]);
  const pv = lesson.previewCard(s, data, { uid: dc });
  assert.deepEqual([pv.targets[0].gain, pv.targets[0].cost], [R(66 * P(s, "p2").growth.defense * GS), 21]);
  // 미르카 (기본 편성 밖) 고유 카드는 주인이 명단에 없어 낼 수 없다
  const m = start({ extra: ["cd_u_mirka"] });
  forceHand(m, [uidOf(m, "cd_u_mirka"), uidOf(m, "cd_basic")]);
  assert.equal(lesson.getLessonView(m, data).hand[0].playable, false);
});

test("코치 카드 ×1.3 은 코치 타입 구역에 선 대상만 · 실패율 감소 · 유대 +8 · 대비 카드 ×1.5 는 lessonMult 구역 대상만", () => {
  const s = full(start({ extra: ["cd_c_ornella", "cd_c_hanna"] }, { zone: "physical" }));
  setZones(s);
  const orn = uidOf(s, "cd_c_ornella");
  forceHand(s, [orn, uidOf(s, "cd_basic")]);
  const pv = lesson.previewCard(s, data, { uid: orn, at: mid(C.pass, C.dribble) });
  assert.deepEqual(pv.targets.map((t) => [t.id, t.zone, t.coach]), [["p4", "pass", true], ["p5", "pass", true], ["p7", "dribble", false]]);
  for (const t of pv.targets) assert.equal(t.gain, R(15 * P(s, t.id).growth[t.zone] * (t.coach ? 1.3 : 1) * GS), t.id);
  const bond = s.supports.find((x) => x.id === "sp_elder_sage").bond;
  safePlay(s, orn, { at: mid(C.pass, C.dribble) });
  assert.equal(s.supports.find((x) => x.id === "sp_elder_sage").bond, bond + 8);
  // 한나: 실패율 −0.05
  const s2 = start({ extra: ["cd_c_hanna"] });
  setZones(s2);
  for (const p of s2.players) p.stamina = 30;
  const hn = uidOf(s2, "cd_c_hanna");
  forceHand(s2, [hn]);
  assert.equal(lesson.previewCard(s2, data, { uid: hn }).failRate, 0.2);
  // 대비 카드: 이번 레슨만 t* uid, 인터셉트 = 수비 · 패스 구역 대상만 ×1.5
  const s3 = full(lesson.startLesson(makeState(), data, { zone: "physical", prep: true, prepCards: ["cd_p_tackle", "cd_p_intercept"] }));
  assert.deepEqual(s3.lesson.temp, [{ uid: "t1", cardId: "cd_p_tackle" }, { uid: "t2", cardId: "cd_p_intercept" }]);
  setZones(s3);
  forceHand(s3, ["t1", "t2"]);
  const at = mid(C.defense, C.physical);
  const tk = lesson.previewCard(s3, data, { uid: "t1", at });
  const ic = lesson.previewCard(s3, data, { uid: "t2", at });
  assert.deepEqual(tk.targets.map((t) => t.id), ["p1", "p2", "p3"]);
  for (const t of tk.targets) assert.equal(t.gain, R(14 * P(s3, t.id).growth[t.zone] * 1.5 * (t.zone === "physical" ? 1.5 : 1) * GS), `태클 ${t.id}`);
  for (const t of ic.targets) assert.equal(t.gain, R(14 * P(s3, t.id).growth[t.zone] * (t.zone === "defense" ? 1.5 : 1) * (t.zone === "physical" ? 1.5 : 1) * GS), `인터셉트 ${t.id}`);
  safePlay(s3, "t1", { at });
  assert.ok(s3.lesson.discard.includes("t1"));
  assert.equal(s3.deck.length, 10);
});

test("다음 카드 효과: nextPct · nextCostZero 는 대상 카드에서 소비 · nextPairPct 는 작은 원 카드에서만", () => {
  const s = full(start({ extra: ["cd_tactics_board"] }));
  setZones(s);
  const sil = uidOf(s, "cd_u_silluen");
  const gre = uidOf(s, "cd_u_greta");
  const board = uidOf(s, "cd_tactics_board");
  const basic = uidOf(s, "cd_basic");
  forceHand(s, [sil, gre, board, basic]);
  s.lesson.playsLeft = 4;
  safePlay(s, sil);
  assert.equal(s.lesson.buffs.nextPct, 0.4);
  s.lesson.buffs.nextPct = 0.4;
  safePlay(s, gre); // 대상 카드라 nextPct 를 쓴다
  assert.deepEqual([s.lesson.buffs.nextPct, s.lesson.buffs.nextCostZero], [0, true]);
  s.lesson.buffs.nextPct = 0.4;
  lesson.playCard(s, data, { uid: board }); // 대상 없는 카드는 소비하지 않는다
  assert.deepEqual([s.lesson.buffs.nextPct, s.lesson.buffs.nextCostZero], [0.4, true]);
  const pv = lesson.previewCard(s, data, { uid: basic });
  for (const t of pv.targets) {
    const p = P(s, t.id);
    assert.equal(t.gain, R(6 * p.growth[t.zone] * (t.zone === "physical" ? 1.5 : 1) * 1.4 * GS), t.id);
    assert.equal(t.cost, 0);
  }
  safePlay(s, basic);
  assert.deepEqual([s.lesson.buffs.nextPct, s.lesson.buffs.nextCostZero], [0, false]);

  // 울리카 → nextPairPct 0.5: 중간 원에는 붙지 않고 작은 원에 붙고 소비된다
  const s2 = full(start({ extra: ["cd_one_two", "cd_fw_drill"] }));
  setZones(s2);
  const ul = uidOf(s2, "cd_u_ulrika");
  const pair = uidOf(s2, "cd_one_two");
  const fw = uidOf(s2, "cd_fw_drill");
  forceHand(s2, [ul, fw, pair]);
  s2.lesson.playsLeft = 3;
  safePlay(s2, ul);
  assert.equal(s2.lesson.buffs.nextPairPct, 0.5);
  const atPair = mid(posOf(s2).p4, posOf(s2).p5);
  const pvFw = lesson.previewCard(s2, data, { uid: fw, at: C.pass });
  for (const t of pvFw.targets) assert.equal(t.gain, R(18 * P(s2, t.id).growth.pass * GS));
  safePlay(s2, fw, { at: C.pass });
  assert.equal(s2.lesson.buffs.nextPairPct, 0.5);
  const pv2 = lesson.previewCard(s2, data, { uid: pair, at: atPair });
  for (const t of pv2.targets) assert.equal(t.gain, R(20 * P(s2, t.id).growth.pass * 1.5 * GS));
  safePlay(s2, pair, { at: atPair });
  assert.equal(s2.lesson.buffs.nextPairPct, 0);
});

test("L10 팀워크: |T| ≥ 2 → 성공 인원 − 1, 레슨당 8까지 (짝 +2 규칙 없음) · 카드 효과 팀워크는 상한 밖", () => {
  const s = full(start({ deckIds: ["cd_basic", "cd_basic", "cd_one_two", "cd_coaching", "cd_one_two"] }));
  setZones(s);
  const [b1, b2] = s.deck.filter((e) => e.cardId === "cd_basic").map((e) => e.uid);
  const [pa, pb] = s.deck.filter((e) => e.cardId === "cd_one_two").map((e) => e.uid);
  forceHand(s, [pa, b1, b2, pb]);
  s.lesson.playsLeft = 4;
  const atPair = mid(posOf(s).p4, posOf(s).p5);
  safePlay(s, pa, { at: atPair });
  assert.equal(s.teamwork, 1 + 2); // 성공 2명 → +1, 카드 +2
  safePlay(s, b1);
  assert.equal(s.teamwork, 3 + 6);
  safePlay(s, b2);
  assert.equal(s.teamwork, 9 + 1); // 상한 8 까지 1 남음
  assert.equal(s.lesson.twAccrued, 8);
  safePlay(s, pb, { at: atPair });
  assert.equal(s.teamwork, 10 + 2); // 카드 효과만
});

test("점수 = 7명 구역 스탯 상승 (기본 + 분위기 + 카드 − 실패, 부 스탯 제외) · lessonResult perPlayer", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const s = makeState({ seed, extra: ["cd_fw_drill", "cd_one_two", "cd_high_five", "cd_icing"] });
    for (const p of s.players) p.stamina = 45; // 실패가 나오게
    lesson.startLesson(s, data, { zone: "dribble" });
    if (seed % 2) lesson.benchPlayer(s, data, { playerId: Object.keys(s.lesson.zones)[0] });
    autoLesson(s);
    checkScore(s, `seed ${seed}`);
    const res = lesson.lessonResult(s, data);
    assert.equal(res.zone, "dribble");
    assert.equal(res.perPlayer.reduce((a, x) => a + x.base + x.mood + x.card, 0), s.lesson.score, `seed ${seed}`);
    for (const x of res.perPlayer) {
      const sum = Object.values(x.byStat).reduce((a, n) => a + n, 0);
      assert.equal(sum, x.base + x.mood + x.card + x.sub, `seed ${seed} ${x.id}: byStat`);
      for (const k of ["id", "byStat", "base", "mood", "card", "sub", "targeted", "benched"]) assert.ok(k in x, k);
      assert.ok(!("auto" in x) && !("gain" in x));
    }
    if (seed % 2) assert.ok(res.benches >= 1 && res.perPlayer.some((x) => x.benched >= 1));
    for (const k of ["zone", "special", "prep", "score", "target", "cap", "status", "turns", "turnReached", "plays", "benches", "fails", "injuries", "twAccrued", "endHeal", "lumiFlag", "outAtStart", "out"]) {
      assert.ok(k in res, k);
    }
    for (const p of s.players) assert.ok(p.stamina >= 0 && p.stamina <= 100);
  }
});

// ---------------------------------------------------------------------------
// 턴 · 끝 (§14.3 · §14.12)
// ---------------------------------------------------------------------------

test("퍼펙트: 카드로 상한에 닿으면 즉시 끝 (그 턴 기본 훈련 · 벤치 회복 없음) + 남은 턴 × 5 · 턴 끝 기본 훈련으로 닿아도 퍼펙트 · 클리어 · 실패", () => {
  const s = full(start());
  setZones(s);
  s.lesson.cap = 10;
  s.lesson.target = 5;
  for (const p of s.players) p.stamina = 50;
  lesson.benchPlayer(s, data, { playerId: "p7" });
  const uid = uidOf(s, "cd_basic");
  forceHand(s, [uid, uidOf(s, "cd_coaching")]);
  safePlay(s, uid);
  const L = s.lesson;
  assert.equal(L.status, "perfect");
  assert.equal(L.turn, 1);
  assert.ok(!L.lastFx.some((x) => ["turnEnd", "draw", "base", "scatter"].includes(x.t)));
  assert.deepEqual(L.lastFx.at(-1), { t: "end", status: "perfect" });
  for (const p of s.players) assert.equal(p.stamina, (p.id === "p7" ? 50 : 50 - 4) + 5 * (6 - 1), p.id);
  assert.deepEqual(L.baseGains, {});
  assert.throws(() => lesson.playCard(s, data, { uid: uidOf(s, "cd_coaching"), playerId: "p1" }), /끝났습니다/);
  assert.throws(() => lesson.endLessonTurn(s, data), /끝났습니다/);
  assert.equal(lesson.getLessonView(s, data).canEndTurn, false);
  assert.equal(lesson.getLessonView(s, data).canBench, false);

  // 턴 끝 기본 훈련으로 상한에 닿으면 그 턴까지 쓴 것으로 센다
  const t = full(start());
  setZones(t);
  t.lesson.cap = 5;
  t.lesson.target = 3;
  lesson.endLessonTurn(t, data);
  assert.equal(t.lesson.status, "perfect");
  assert.equal(t.lesson.turn, 1);
  for (const p of t.players) assert.equal(p.stamina, 100); // 기본 훈련 −1 뒤 퍼펙트 +25 → 100 에서 멈춘다

  // 클리어 · 실패: 6턴을 다 쓰면 점수로 판정
  const clear = lesson.startLesson(makeState({ seed: 2 }), data, { zone: "defense" });
  clear.lesson.target = 1;
  clear.lesson.cap = 100000;
  autoLesson(clear);
  assert.equal(clear.lesson.status, "clear");
  assert.equal(clear.lesson.turn, 6);
  const fail = lesson.startLesson(makeState({ seed: 2 }), data, { zone: "defense" });
  fail.lesson.target = 99999;
  fail.lesson.cap = 100000;
  autoLesson(fail);
  assert.equal(fail.lesson.status, "fail");
});

test("죽은 카드: 턴 시작에 대상 후보 0명인 카드는 버리고 다시 뽑는다 (마무리 일격) · 출전 0명이면 바로 끝", () => {
  let checked = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    // MF · FW 결장 → GK · DF 3명만 흩어진다 (공격 구역에 아무도 없는 턴이 자주 나온다)
    const s = makeState({ seed, deckIds: ["cd_finisher", "cd_finisher", "cd_basic", "cd_coaching", "cd_cooldown", "cd_icing", "cd_fw_drill", "cd_hojo_up"] });
    for (const id of ["p4", "p5", "p6", "p7"]) P(s, id).injuredTurns = 1;
    lesson.startLesson(s, data, { zone: "defense" });
    for (let i = 0; i < 100 && s.lesson.status === "playing"; i++) {
      if (s.lesson.playedThisTurn === 0) {
        const noAttack = Object.values(s.lesson.zones).every((z) => lesson.DEFENSE_ZONES.includes(z));
        for (const u of s.lesson.hand) {
          const dead = cards.deadReason(s, lesson.lessonCardDef(s, data, u));
          assert.equal(dead, null, `seed ${seed} 턴 ${s.lesson.turn}: 죽은 카드 ${u}`);
        }
        if (noAttack) checked += 1;
        assert.equal(s.lesson.hand.length, 3);
      }
      autoStep(s);
    }
  }
  assert.ok(checked > 0, "공격 구역이 빈 턴을 확인했다");
  // 행동 중에 낼 수 없게 된 카드는 손패에 남는다 (playable false)
  const s = full(start({ deckIds: ["cd_finisher", "cd_basic", "cd_coaching"] }));
  setZones(s);
  forceHand(s, [uidOf(s, "cd_finisher"), uidOf(s, "cd_basic")]);
  setZones(s, { p1: "defense", p2: "defense", p3: "physical", p4: "defense", p5: "physical", p6: "defense", p7: "physical" });
  const v = lesson.getLessonView(s, data).hand[0];
  assert.deepEqual([v.playable, v.deadReason], [false, "그 구역에 선수가 없습니다"]);
  assert.throws(() => lesson.playCard(s, data, { uid: uidOf(s, "cd_finisher"), playerId: "p1" }));

  const none = makeState();
  for (const p of none.players) p.injuredTurns = 1;
  lesson.startLesson(none, data, { zone: "pass" });
  assert.equal(none.lesson.status, "fail");
  assert.equal(none.lesson.hand.length, 0);
});

test("추가 사용 · 다음 턴 손패 · exhaust · 카드 0장 턴 끝 (남은 추가 사용을 버린다)", () => {
  const s = full(start({ deckIds: ["cd_tactics_board", "cd_cooldown", "cd_basic", "cd_coaching", "cd_icing", "cd_mood_maker", "cd_fw_drill"] }));
  setZones(s);
  const board = uidOf(s, "cd_tactics_board");
  const cool = uidOf(s, "cd_cooldown");
  const mm = uidOf(s, "cd_mood_maker");
  forceHand(s, [board, cool, mm]);
  lesson.playCard(s, data, { uid: board });
  assert.equal(s.lesson.playsLeft, 1);
  assert.equal(s.lesson.drawNext, 1);
  assert.equal(s.lesson.turn, 1);
  assert.equal(lesson.getLessonView(s, data).canEndTurn, true);
  P(s, "p3").stamina = 50;
  const hv = lesson.getLessonView(s, data).hand.find((h) => h.uid === cool);
  assert.deepEqual([hv.heal, hv.cost, hv.power, hv.targetKind], [true, null, null, "single"]);
  assert.equal(lesson.dropCandidates(s, data, { uid: cool }).length, 7);
  lesson.playCard(s, data, { uid: cool, playerId: "p3" });
  assert.equal(P(s, "p3").stamina, 70);
  assert.equal(s.lesson.playsLeft, 1);
  assert.deepEqual(s.lesson.targeted, {}, "회복 단일은 대상으로 세지 않는다");
  lesson.playCard(s, data, { uid: mm });
  assert.ok(s.lesson.exhausted.includes(mm));
  assert.equal(s.lesson.turn, 2);
  assert.equal(s.lesson.hand.length, 4);
  assert.equal(s.lesson.drawNext, 0);
  assert.equal(s.lesson.seq, 3);
  // 카드를 내지 않아도 턴 끝
  const t = s.lesson.turn;
  lesson.endLessonTurn(s, data);
  assert.equal(s.lesson.turn, t + 1);
  assert.equal(s.lesson.playsLeft, 1);
  autoLesson(s);
  for (const pile of ["hand", "drawPile", "discard"]) assert.ok(!s.lesson[pile].includes(mm));
});

test("dropCandidates: 단일 = 후보 선수 위치 · 원 = 구역 중심 → 선수 → 가운데 점 (대상 집합 중복 없음) · 전체 · 주인 · 없음 = 한 점 · 회복 = 7명", () => {
  const s = full(start({ extra: ["cd_fw_drill", "cd_finisher", "cd_icing", "cd_hojo_up", "cd_one_two"] }));
  setZones(s);
  lesson.benchPlayer(s, data, { playerId: "p3" });
  const u = (id) => uidOf(s, id);
  forceHand(s, ["cd_fw_drill", "cd_finisher", "cd_icing", "cd_hojo_up", "cd_one_two", "cd_basic", "cd_u_neria"].map(u));
  const pos = posOf(s);
  const fin = lesson.dropCandidates(s, data, { uid: u("cd_finisher") });
  assert.deepEqual(fin.map((c) => c.playerId), ["p4", "p5", "p6", "p7"]);
  for (const c of fin) assert.deepEqual(c.at, pos[c.playerId]);
  const circ = lesson.dropCandidates(s, data, { uid: u("cd_fw_drill") });
  assert.deepEqual(circ.slice(0, 4).map((c) => c.zone), ["shoot", "dribble", "pass", "defense"]);
  assert.equal(new Set(circ.map((c) => c.ids.join(","))).size, circ.length);
  for (const c of [...circ, ...lesson.dropCandidates(s, data, { uid: u("cd_one_two") })]) {
    const uid = circ.includes(c) ? u("cd_fw_drill") : u("cd_one_two");
    const pv = lesson.previewCard(s, data, { uid, at: c.at });
    assert.equal(pv.ok, true);
    assert.deepEqual(pv.targets.map((t) => t.id), c.ids);
    assert.ok(!c.ids.includes("p3"), "벤치 선수는 후보 대상이 아니다");
  }
  const heal = lesson.dropCandidates(s, data, { uid: u("cd_icing") });
  assert.deepEqual(heal.map((c) => c.playerId), ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  assert.equal(heal[2].at, null, "벤치 선수는 경기장 위치가 없다");
  assert.deepEqual(lesson.dropCandidates(s, data, { uid: u("cd_hojo_up") }), [{ at: { x: 50, y: 50 }, ids: [], kind: "field" }]);
  assert.deepEqual(lesson.dropCandidates(s, data, { uid: u("cd_basic") })[0].ids, ["p1", "p2", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(lesson.dropCandidates(s, data, { uid: u("cd_u_neria") })[0].ids, ["p1"]);
});

test("검증 실패 시 상태 불변 · phase 검사", () => {
  const s = full(start({ extra: ["cd_fw_drill"] }));
  setZones(s);
  const uid = uidOf(s, "cd_coaching");
  const fw = uidOf(s, "cd_fw_drill");
  forceHand(s, [uid, fw]);
  const snap = JSON.stringify(s);
  assert.throws(() => lesson.playCard(s, data, { uid }));
  assert.throws(() => lesson.playCard(s, data, { uid, playerId: "p99" }));
  assert.throws(() => lesson.playCard(s, data, { uid, at: { x: 0, y: 99 } }));
  assert.throws(() => lesson.playCard(s, data, { uid: fw }));
  assert.throws(() => lesson.playCard(s, data, { uid: fw, at: { x: "a", y: 1 } }));
  assert.throws(() => lesson.playCard(s, data, { uid: "k999", playerId: "p4" }), /손패/);
  assert.throws(() => lesson.benchPlayer(s, data, { playerId: "p99" }));
  s.phase = "week";
  assert.throws(() => lesson.playCard(s, data, { uid, playerId: "p4" }), /phase/);
  assert.throws(() => lesson.endLessonTurn(s, data), /phase/);
  s.phase = "lesson";
  assert.equal(JSON.stringify(s), snap);
});

// ---------------------------------------------------------------------------
// E3 — 방침 버프 5종 (옛 기준). zone-pending:ZE3
// ---------------------------------------------------------------------------

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("에이스형: 호조 (더하면 쌓임 · 대상 카드만 1장씩) · 집중 몫 ÷ 인원 · focusX2 · 루틴 (지명만, max) — 비용은 그대로", () => {
  const extra = ["cd_hojo_up", "cd_focus_routine", "cd_routine", "cd_breath", "cd_ace_training", "cd_one_point", "cd_df_drill", "cd_immerse"];
  const s = full(lesson.startLesson(makeState({ policy: "ace", extra }), data, { stat: "pass" }));
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_hojo_up"), u("cd_immerse"), u("cd_focus_routine"), u("cd_routine"), u("cd_breath"), u("cd_coaching")]);
  L.playsLeft = 6;
  lesson.playCard(s, data, { uid: u("cd_hojo_up") });
  lesson.playCard(s, data, { uid: u("cd_immerse") });
  assert.deepEqual([L.buffs.hojo, L.buffs.focus], [5, 1]);
  assert.ok(L.lastFx.some((x) => x.t === "buff" && x.key === "hojo" && x.from === 3 && x.to === 5));
  lesson.playCard(s, data, { uid: u("cd_focus_routine") });
  lesson.playCard(s, data, { uid: u("cd_routine") });
  const p4 = P(s, "p4");
  p4.stamina = 60;
  lesson.playCard(s, data, { uid: u("cd_breath"), taps: ["p4"] }); // tap 카드: 호조를 쓰지 않는다, 집중 +1
  assert.deepEqual([L.buffs.hojo, L.buffs.focus, L.buffs.routine], [5, 4, 8]);
  assert.equal(p4.stamina, 85);
  const pv = lesson.previewCard(s, data, { uid: u("cd_coaching"), taps: ["p4"] });
  assert.equal(pv.targets[0].gain, R((35 + 8 + 4 * 6) * p4.growth.pass * 1.5));
  assert.equal(pv.targets[0].cost, 21); // 집중 · 루틴은 비용을 올리지 않는다 (D12)
  assert.ok(pv.notes.includes("호조 ×1.5 (남은 5장)"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("집중 4 → 1인 위력 +24"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("루틴 → 위력 +8"), pv.notes.join(" / "));
  const b = p4.stats.pass;
  safePlay(s, u("cd_coaching"), ["p4"]);
  assert.equal(p4.stats.pass - b, pv.targets[0].gain);
  assert.deepEqual([L.buffs.hojo, L.buffs.focus, L.buffs.routine], [4, 4, 8]); // 호조만 1장 소비

  // 범위 카드는 집중 몫을 인원으로 나눈다 · focusX2 · 원포인트의 집중 +1 은 다음 카드부터 · 루틴은 max
  const s2 = full(lesson.startLesson(makeState({ policy: "ace", extra }), data, { stat: "defense" }));
  const u2 = (id) => uidOf(s2, id);
  s2.lesson.buffs.focus = 2;
  s2.lesson.buffs.routine = 10;
  forceHand(s2, [u2("cd_df_drill"), u2("cd_ace_training"), u2("cd_one_point"), u2("cd_routine")]);
  const [d2, d3] = [P(s2, "p2"), P(s2, "p3")];
  let pv2 = lesson.previewCard(s2, data, { uid: u2("cd_df_drill") });
  assert.deepEqual(pv2.targets.map((t) => [t.gain, t.cost]), [[R(26 * d2.growth.defense), 12], [R(26 * d3.growth.defense), 12]]);
  pv2 = lesson.previewCard(s2, data, { uid: u2("cd_ace_training"), taps: ["p2"] });
  assert.deepEqual([pv2.targets[0].gain, pv2.targets[0].cost], [R((30 + 10 + 24) * d2.growth.defense), 18]);
  s2.lesson.playsLeft = 4;
  lesson.playCard(s2, data, { uid: u2("cd_routine") });
  assert.equal(s2.lesson.buffs.routine, 10);
  const b3 = d3.stats.defense;
  safePlay(s2, u2("cd_one_point"), ["p3"]);
  assert.equal(d3.stats.defense - b3, R((25 + 10 + 12) * d3.growth.defense));
  assert.equal(s2.lesson.buffs.focus, 3);
});

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("팀형: 분위기 틱 (출전 선수 · 점수만, 대상 아님) · 감소 1 / 쉬기 턴 2 · 하나 된 호흡 · 분위기 ×2 · perMood (비용 포함)", () => {
  const extra = ["cd_high_five", "cd_mood_maker", "cd_breath_together", "cd_link_line"];
  const s = makeState({ policy: "team", extra });
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { stat: "defense" });
  const L = s.lesson;
  const u = (id) => uidOf(s, id);
  forceHand(s, [u("cd_high_five")]);
  const before = Object.fromEntries(s.players.map((p) => [p.id, p.stats.defense]));
  lesson.playCard(s, data, { uid: u("cd_high_five") }); // 1장뿐 → 턴 끝
  assert.equal(L.turn, 2);
  assert.deepEqual(L.lastFx.filter((x) => x.t === "tick").map((x) => x.id), ["p1", "p2", "p3", "p4", "p5", "p6"]);
  let sum = 0;
  for (const p of s.players) {
    const d = p.stats.defense - before[p.id];
    assert.equal(d, p.id === "p7" ? 0 : R(3 * 1.5 * p.growth.defense), p.id);
    sum += d;
  }
  assert.equal(L.score, sum);
  assert.equal(L.cardGainSum, 0);
  assert.deepEqual(L.targeted, {});
  assert.equal(L.buffs.mood, 2);
  // 쉬기 턴: 틱은 들어가고 −2
  lesson.lessonRest(s, data, { playerId: "p1" });
  assert.equal(L.lastFx.filter((x) => x.t === "tick").length, 6);
  assert.equal(L.buffs.mood, 0);
  // 하나 된 호흡: 3턴 동안 감소 없음 (쉬기 턴 포함), 그 뒤 쉬기 턴 −2
  L.buffs.mood = 4;
  forceHand(s, [u("cd_breath_together")]);
  lesson.playCard(s, data, { uid: u("cd_breath_together") });
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [4, 2]);
  lesson.lessonRest(s, data, { playerId: "p1" });
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [4, 1]);
  lesson.lessonRest(s, data, { playerId: "p1" });
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [4, 0]);
  lesson.lessonRest(s, data, { playerId: "p1" }); // 마지막 턴 (6)
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [2, 0]);
  assert.notEqual(L.status, "playing");

  const s2 = full(lesson.startLesson(makeState({ policy: "team", extra }), data, { stat: "defense" }));
  const u2 = (id) => uidOf(s2, id);
  s2.lesson.buffs.mood = 3;
  forceHand(s2, [u2("cd_mood_maker"), u2("cd_link_line")]);
  s2.lesson.playsLeft = 2;
  assert.ok(lesson.previewCard(s2, data, { uid: u2("cd_mood_maker") }).notes.includes("분위기 3 → 6"));
  lesson.playCard(s2, data, { uid: u2("cd_mood_maker") });
  assert.equal(s2.lesson.buffs.mood, 6);
  const pv = lesson.previewCard(s2, data, { uid: u2("cd_link_line") });
  assert.equal(pv.targets.length, 3);
  for (const t of pv.targets) {
    assert.equal(t.gain, R((50 / 3) * P(s2, t.id).growth.defense)); // (35 + 2.5 × 6) / 3
    assert.equal(t.cost, R((50 / 3) * 0.6));
  }
});

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("역습형: 수비진 성공 → 탈취 +1 (stealBuild 2) · 최대 4 · 공격진이 끼면 모두 써서 ×(1 + stealPer × 탈취) · 실패해도 사라짐 · consume", () => {
  const extra = ["cd_line_up", "cd_recover", "cd_long_ball", "cd_counter_sprint", "cd_finisher", "cd_all_counter", "cd_df_drill"];
  const s = full(lesson.startLesson(makeState({ policy: "counter", extra }), data, { stat: "defense" }));
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_line_up"), u("cd_df_drill"), u("cd_recover"), u("cd_long_ball"), u("cd_counter_sprint")]);
  L.playsLeft = 4; // 롱볼 추가 사용 +1
  const pvLine = lesson.previewCard(s, data, { uid: u("cd_line_up") });
  assert.ok(pvLine.notes.includes("성공하면 탈취 +2"), pvLine.notes.join(" / "));
  safePlay(s, u("cd_line_up"));
  assert.equal(L.buffs.steal, 2);
  safePlay(s, u("cd_df_drill"));
  assert.equal(L.buffs.steal, 3);
  lesson.playCard(s, data, { uid: u("cd_recover") });
  assert.equal(L.buffs.steal, 4);
  lesson.playCard(s, data, { uid: u("cd_long_ball") });
  assert.equal(L.buffs.steal, 4);
  assert.equal(L.playsLeft, 1);
  const pv = lesson.previewCard(s, data, { uid: u("cd_counter_sprint") });
  for (const t of pv.targets) assert.equal(t.gain, R(9 * P(s, t.id).growth.defense * (1 + 0.4 * 4)));
  assert.ok(pv.notes.includes("탈취 4 → ×2.6 (탈취를 모두 씀)"), pv.notes.join(" / "));
  safePlay(s, u("cd_counter_sprint"));
  assert.equal(L.buffs.steal, 0);

  // 쓰는 카드가 실패해도 탈취는 사라진다
  const s2 = full(lesson.startLesson(makeState({ policy: "counter", extra }), data, { stat: "shoot" }));
  P(s2, "p6").stamina = 30;
  s2.lesson.buffs.steal = 3;
  const fin = uidOf(s2, "cd_finisher");
  forceHand(s2, [fin]);
  assert.equal(lesson.previewCard(s2, data, { uid: fin, taps: ["p6"] }).targets[0].gain, R(30 * P(s2, "p6").growth.shoot * (1 + 0.45 * 3)));
  s2.rngState = FAIL_NO_INJURY;
  lesson.playCard(s2, data, { uid: fin, taps: ["p6"] });
  assert.equal(s2.lesson.stats.fails, 1);
  assert.equal(s2.lesson.buffs.steal, 0);

  // 실패자가 있는 수비진 카드는 쌓지 않는다
  const s3 = full(lesson.startLesson(makeState({ policy: "counter", extra }), data, { stat: "defense" }));
  P(s3, "p2").stamina = 30;
  forceHand(s3, [uidOf(s3, "cd_df_drill")]);
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: uidOf(s3, "cd_df_drill") });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.steal], [1, 0]);

  // 전원 역습: 탈취를 썼을 때만 팀워크 +2 (L10 +6 은 따로)
  for (const [steal, cardTw] of [[2, 2], [0, 0]]) {
    const s4 = full(lesson.startLesson(makeState({ policy: "counter", extra }), data, { stat: "defense" }));
    s4.lesson.buffs.steal = steal;
    forceHand(s4, [uidOf(s4, "cd_all_counter")]);
    safePlay(s4, uidOf(s4, "cd_all_counter"));
    assert.equal(s4.teamwork, 6 + cardTw, `steal ${steal}`);
    assert.equal(s4.lesson.buffs.steal, 0);
  }

  // 방침이 다르면 (D38): 쌓기 · 쓰기 · 배율 없음. 카드에 적힌 탈취 +1 은 그대로
  const s5 = full(lesson.startLesson(makeState({ policy: "team", extra }), data, { stat: "defense" }));
  const u5 = (id) => uidOf(s5, id);
  forceHand(s5, [u5("cd_line_up"), u5("cd_recover"), u5("cd_counter_sprint")]);
  s5.lesson.playsLeft = 3;
  safePlay(s5, u5("cd_line_up"));
  assert.equal(s5.lesson.buffs.steal, 0);
  lesson.playCard(s5, data, { uid: u5("cd_recover") });
  assert.equal(s5.lesson.buffs.steal, 1);
  const pv5 = lesson.previewCard(s5, data, { uid: u5("cd_counter_sprint") });
  for (const t of pv5.targets) assert.equal(t.gain, R(9 * P(s5, t.id).growth.defense));
  assert.deepEqual(pv5.notes, []);
  safePlay(s5, u5("cd_counter_sprint"));
  assert.equal(s5.lesson.buffs.steal, 1);
});

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("압박형: 압박 +n (최대 3) · 비용 ×(1 + 0.2 × 압박) · 방침 배율 · noPressCost · perPress · 쉬기 회복 · 라인 내리기 · 실패 리셋", () => {
  const extra = ["cd_front_press", "cd_full_press", "cd_six_sec", "cd_drop_line", "cd_all_out", "cd_gegen", "cd_attack_build"];
  const s = full(lesson.startLesson(makeState({ policy: "press", extra }), data, { stat: "shoot" }));
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  const p6 = P(s, "p6");
  forceHand(s, [u("cd_front_press"), u("cd_full_press"), u("cd_six_sec"), u("cd_gegen"), u("cd_all_out")]);
  L.playsLeft = 4; // 풀 프레싱 추가 사용 +1
  let pv = lesson.previewCard(s, data, { uid: u("cd_front_press") });
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost], [R(8.5 * P(s, t.id).growth.shoot), 5]);
  safePlay(s, u("cd_front_press"));
  assert.equal(L.buffs.press, 1);
  assert.equal(lesson.previewCard(s, data, { uid: u("cd_six_sec"), taps: ["p6"] }).targets[0].cost, R(28 * 0.6 * 1.2));
  lesson.playCard(s, data, { uid: u("cd_full_press") });
  assert.equal(L.buffs.press, 3); // 1 + 2, 최대 3
  pv = lesson.previewCard(s, data, { uid: u("cd_six_sec"), taps: ["p6"] });
  assert.deepEqual([pv.targets[0].gain, pv.targets[0].cost], [R(28 * p6.growth.shoot * 1.6), 17]); // 압박 2 이상 → 비용 증가 없음
  pv = lesson.previewCard(s, data, { uid: u("cd_gegen") });
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost], [R(10 * P(s, t.id).growth.shoot * 1.6), 6]);
  pv = lesson.previewCard(s, data, { uid: u("cd_all_out") });
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost], [R((60 / 7) * P(s, t.id).growth.shoot * 1.6), R((60 / 7) * 0.6 * 1.6)]);
  assert.ok(pv.notes.includes("압박 3 · 비용 ×1.6"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("압박 3 → ×1.6"), pv.notes.join(" / "));
  safePlay(s, u("cd_six_sec"), ["p6"]);
  assert.equal(L.buffs.press, 3);

  // 쉬기: 출전 선수 +4 × 단계, 압박 0
  const s2 = lesson.startLesson(makeState({ policy: "press", extra }), data, { stat: "shoot" });
  for (const p of s2.players) p.stamina = 50;
  s2.lesson.buffs.press = 2;
  lesson.lessonRest(s2, data, { playerId: "p1" });
  assert.equal(P(s2, "p1").stamina, 50 + 20 + 8);
  for (const id of ["p2", "p3", "p4", "p5", "p6", "p7"]) assert.equal(P(s2, id).stamina, 50 + 5 + 8);
  assert.equal(s2.lesson.buffs.press, 0);

  // 라인 내리기: 내린 단계 × 6 회복, 압박 0, 다음 카드 실패 없음
  const s3 = lesson.startLesson(makeState({ policy: "press", extra }), data, { stat: "shoot" });
  for (const p of s3.players) p.stamina = 50;
  s3.lesson.buffs.press = 3;
  forceHand(s3, [uidOf(s3, "cd_drop_line"), uidOf(s3, "cd_coaching")]);
  s3.lesson.playsLeft = 2;
  assert.ok(lesson.previewCard(s3, data, { uid: uidOf(s3, "cd_drop_line") }).notes.includes("압박 3 → 0 · 출전 선수 체력 +18"));
  lesson.playCard(s3, data, { uid: uidOf(s3, "cd_drop_line") });
  for (const p of s3.players) assert.equal(p.stamina, 68);
  assert.deepEqual([s3.lesson.buffs.press, s3.lesson.buffs.nextNoFail], [0, true]);
  assert.equal(lesson.previewCard(s3, data, { uid: uidOf(s3, "cd_coaching"), taps: ["p6"] }).failRate, 0);

  // 실패 → 압박 0 (압박형일 때만). 다른 방침은 비용 증가만 있고 배율 · 리셋은 없다
  for (const [policy, pressAfter] of [["press", 0], ["team", 2]]) {
    const s4 = full(lesson.startLesson(makeState({ policy, extra }), data, { stat: "shoot" }));
    s4.lesson.buffs.press = 2;
    const ab = uidOf(s4, "cd_attack_build");
    forceHand(s4, [ab]);
    const pv4 = lesson.previewCard(s4, data, { uid: ab });
    const mult = policy === "press" ? 1.4 : 1;
    for (const t of pv4.targets) assert.deepEqual([t.gain, t.cost], [R((43 / 4) * P(s4, t.id).growth.shoot * mult), R((43 / 4) * 0.6 * 1.4)], policy);
    P(s4, "p6").stamina = 30;
    s4.rngState = FAIL_NO_INJURY;
    lesson.playCard(s4, data, { uid: ab });
    assert.equal(s4.lesson.stats.fails, 1);
    assert.equal(s4.lesson.buffs.press, pressAfter, policy);
  }
});

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("점유형: MF가 낀 카드 성공 +1 · MF 없음 −2 (possKeep 유지) · 실패 0 / 가드 · 최대 8 · ×(1 + 0.05 × 점유) · possX2", () => {
  const extra = ["cd_mid_control", "cd_triangle", "cd_circulate", "cd_tempo", "cd_dominate", "cd_back_build", "cd_df_drill", "cd_attack_build"];
  const s = full(lesson.startLesson(makeState({ policy: "poss", extra }), data, { stat: "pass" }));
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_mid_control"), u("cd_triangle"), u("cd_df_drill"), u("cd_back_build"), u("cd_circulate")]);
  L.playsLeft = 5;
  safePlay(s, u("cd_mid_control"));
  assert.equal(L.buffs.poss, 3); // 기본 +1 + 카드 +2
  safePlay(s, u("cd_triangle"), ["p4", "p2"]);
  assert.equal(L.buffs.poss, 6);
  const pvDf = lesson.previewCard(s, data, { uid: u("cd_df_drill") });
  assert.ok(pvDf.notes.includes("점유 −2"), pvDf.notes.join(" / "));
  safePlay(s, u("cd_df_drill"));
  assert.equal(L.buffs.poss, 4);
  safePlay(s, u("cd_back_build"));
  assert.equal(L.buffs.poss, 4);
  L.buffs.poss = 7;
  lesson.playCard(s, data, { uid: u("cd_circulate") });
  assert.equal(L.buffs.poss, 8);

  // 배율: ×(1 + 0.05 × 점유), 지배하는 중원은 2배
  const s2 = full(lesson.startLesson(makeState({ policy: "poss", extra }), data, { stat: "pass" }));
  s2.lesson.buffs.poss = 4;
  forceHand(s2, [uidOf(s2, "cd_dominate"), uidOf(s2, "cd_attack_build")]);
  let pv = lesson.previewCard(s2, data, { uid: uidOf(s2, "cd_dominate") });
  for (const t of pv.targets) assert.equal(t.gain, R(8 * P(s2, t.id).growth.pass * 1.4));
  pv = lesson.previewCard(s2, data, { uid: uidOf(s2, "cd_attack_build") });
  for (const t of pv.targets) assert.equal(t.gain, R((43 / 4) * P(s2, t.id).growth.pass * 1.2));
  assert.ok(pv.notes.includes("점유 4 → ×1.2"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("성공하면 점유 +1"), pv.notes.join(" / "));

  // 실패: 가드가 있으면 가드 −1 (점유 유지), 없으면 0
  const s3 = full(lesson.startLesson(makeState({ policy: "poss", extra }), data, { stat: "pass" }));
  const u3 = (id) => uidOf(s3, id);
  P(s3, "p4").stamina = 30;
  s3.lesson.buffs.poss = 6;
  forceHand(s3, [u3("cd_tempo"), u3("cd_mid_control"), u3("cd_coaching"), u3("cd_df_drill")]);
  s3.lesson.playsLeft = 3;
  assert.ok(lesson.previewCard(s3, data, { uid: u3("cd_mid_control") }).notes.includes("실패하면 점유 6을 잃음"));
  lesson.playCard(s3, data, { uid: u3("cd_tempo") });
  assert.equal(s3.lesson.buffs.possGuard, 1);
  assert.equal(s3.lesson.drawNext, 1);
  assert.ok(lesson.previewCard(s3, data, { uid: u3("cd_mid_control") }).notes.includes("실패해도 점유 유지 (가드 1)"));
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: u3("cd_mid_control") });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.poss, s3.lesson.buffs.possGuard], [1, 6, 0]); // 성공 효과 +2 도 없음
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: u3("cd_coaching"), taps: ["p4"] });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.poss], [2, 0]);

  // 방침이 다르면 (D38): ± · 배율 없음, 카드의 점유 +2 는 그대로
  const s4 = full(lesson.startLesson(makeState({ policy: "team", extra }), data, { stat: "pass" }));
  s4.lesson.buffs.poss = 4;
  forceHand(s4, [uidOf(s4, "cd_df_drill"), uidOf(s4, "cd_mid_control")]);
  s4.lesson.playsLeft = 2;
  for (const t of lesson.previewCard(s4, data, { uid: uidOf(s4, "cd_df_drill") }).targets) assert.equal(t.gain, R(20 * P(s4, t.id).growth.pass));
  safePlay(s4, uidOf(s4, "cd_df_drill"));
  assert.equal(s4.lesson.buffs.poss, 4);
  safePlay(s4, uidOf(s4, "cd_mid_control"));
  assert.equal(s4.lesson.buffs.poss, 6);
});

// zone-pending:ZE3 — 옛 탭 · 쉬기 · 배치 라인 기준 방침 테스트. ZE3 가 구역 기준(§14.11)으로 다시 쓰고 켠다.
test.skip("뷰 chips: 방침 버프는 0이어도, 그 밖은 0이 아니거나 켜진 것만 (순서 고정)", () => {
  const want = { ace: [["hojo", "0장"], ["focus", "0"]], team: [["mood", "0"]], counter: [["steal", "0/4"]], press: [["press", "0/3"]], poss: [["poss", "0/8"]] };
  for (const [policy, chips] of Object.entries(want)) {
    const s = lesson.startLesson(makeState({ policy }), data, { stat: "pass" });
    const v = lesson.getLessonView(s, data);
    assert.deepEqual(v.chips.map((c) => [c.key, c.value]), chips, policy);
    assert.ok(v.chips.every((c) => c.policy === true && typeof c.label === "string"));
  }
  const s = lesson.startLesson(makeState({ policy: "ace" }), data, { stat: "pass" });
  Object.assign(s.lesson.buffs, { hojo: 2, steal: 2, nextPct: 0.4, nextCostZero: true, noDecay: 3, routine: 8 });
  const chips = lesson.getLessonView(s, data).chips;
  assert.deepEqual(chips.map((c) => [c.key, c.label, c.value]), [
    ["hojo", "호조", "2장"], ["focus", "집중", "0"], ["routine", "루틴", "+8"], ["noDecay", "분위기 유지", "3턴"],
    ["steal", "탈취", "2/4"], ["nextPct", "다음 카드", "+40%"], ["nextCostZero", "비용 0", "다음 1장"],
  ]);
  assert.deepEqual(chips.filter((c) => c.policy).map((c) => c.key), ["hojo", "focus"]);
});

// ---------------------------------------------------------------------------
// 퍼즈: 66장 전부 "내기 → 오류 없음" (방침 5개 × 시드 20 × 중점 구역 5곳, 무작위 놓을 점 · 벤치 · 턴 끝, 매 행동 불변식)
// ZE2 가 구역 방식으로 옮겼다 (탭 → 무작위 drop 점 · dropCandidates, 쉬기 → 벤치). ZE3 가 방침 불변식을 더한다.
// ---------------------------------------------------------------------------

/** 매 행동 뒤 불변식 */
function checkInvariants(s, allUids, where) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), s, `${where}: JSON 왕복`);
  const L = s.lesson;
  for (const p of s.players) {
    assert.ok(Number.isInteger(p.stamina) && p.stamina >= 0 && p.stamina <= 100, `${where}: ${p.id} 체력 ${p.stamina}`);
    for (const k of Object.keys(p.stats)) assert.ok(Number.isInteger(p.stats[k]) && p.stats[k] >= 0 && p.stats[k] <= 1000, `${where}: ${p.id}.${k}`);
  }
  assert.ok(Number.isInteger(s.teamwork) && s.teamwork >= 0 && s.teamwork <= 100, `${where}: 팀워크`);
  for (const sp of s.supports) assert.ok(sp.bond >= 0 && sp.bond <= 100, `${where}: 유대`);
  const B = L.buffs;
  for (const k of ["hojo", "focus", "mood", "noDecay", "steal", "press", "poss", "possGuard", "routine"]) {
    assert.ok(Number.isInteger(B[k]) && B[k] >= 0, `${where}: buffs.${k} = ${B[k]}`);
  }
  assert.ok(B.steal <= 4 && B.press <= 3 && B.poss <= 8, `${where}: 버프 상한`);
  const piles = [...L.hand, ...L.drawPile, ...L.discard, ...L.exhausted, ...L.removed];
  assert.deepEqual(piles.slice().sort(), allUids, `${where}: 더미 합 = 덱 + 대비 카드`);
  checkScore(s, where);
  assert.ok(L.twAccrued <= 8);
  assert.ok(L.bench.length <= 2, `${where}: 벤치 ≤ 2`);
  for (const id of L.bench) assert.ok(L.zones[id] && !L.out.includes(id), `${where}: 벤치 선수 ${id}`);
  for (const id of L.out) assert.ok(!(id in L.zones), `${where}: 결장 ${id} 은 구역에 없다`);
  if (L.status === "playing") {
    assert.ok(L.playsLeft >= 1, `${where}: playsLeft`);
    assert.ok(L.hand.length >= 1, `${where}: 손패`);
  } else {
    assert.equal(L.status, L.score >= L.cap ? "perfect" : L.score >= L.target ? "clear" : "fail", `${where}: 결과`);
  }
}

test("퍼즈: 66장 전부 내기 → 오류 없음 (방침 5개 × 시드 20 × 중점 구역 5곳, 무작위 놓을 점 · 벤치 · 턴 끝 · 매 행동 불변식)", () => {
  const all = cards.cardList(data);
  assert.equal(all.length, 66);
  const prepIds = all.filter((c) => c.family === "prep").map((c) => c.id);
  const deckIds = all.filter((c) => c.family !== "prep").map((c) => c.id);
  const formations = Object.keys(FORMATIONS);
  const mirkaSquad = { ...data.config.defaultSquad.slots, MF2: "ch_cat_trickster" };
  let plays = 0;
  let lessons = 0;
  let benches = 0;
  let baseTicks = 0;
  const statuses = { perfect: 0, clear: 0, fail: 0 };
  for (const policy of ["ace", "team", "counter", "press", "poss"]) {
    const played = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      for (const [si, zone] of zones.ZONE_IDS.entries()) {
        const r = createRngFromState((seed * 1000 + si * 37 + policy.length * 7919) >>> 0);
        const s = makeState({ seed: seed * 31 + si, policy, deckIds, squad: r.chance(0.4) ? mirkaSquad : undefined });
        const fm = r.pick(formations);
        formationSlots(fm).forEach((slot, i) => {
          s.players[i].slot = slot;
          s.players[i].position = slotPosition(slot);
        });
        s.formation = fm;
        for (const e of s.deck) e.plus = r.chance(0.3) && cards.canUpgrade(cards.getCard(data, e.cardId));
        for (const sp of s.supports) sp.bond = r.int(0, 100);
        for (const p of s.players) p.stamina = r.int(10, 100);
        if (r.chance(0.2)) r.pick(s.players).injuredTurns = 1;
        s.condition = r.int(0, 4);
        s.season = r.int(1, 3);
        s.teamwork = r.int(0, 100);
        if (r.chance(0.2)) s.modifiers = [{ key: "trainingEfficiency", amount: 0.1, untilSeason: null }, { key: "injuryRate", amount: 0.03, untilSeason: null }];
        const prep = r.chance(0.5);
        lesson.startLesson(s, data, { zone, special: !prep && r.chance(0.3), prep, prepCards: prep ? prepIds : [] });
        const allUids = [...s.deck.map((e) => e.uid), ...s.lesson.temp.map((t) => t.uid)].sort();
        const tag = `${policy} seed ${seed} ${zone}`;
        checkInvariants(s, allUids, `${tag} 시작`);
        for (let step = 0; step < 400 && s.lesson.status === "playing"; step++) {
          const where = `${tag} #${step}`;
          const v = lesson.getLessonView(s, data);
          const playable = v.hand.filter((h) => h.playable);
          const roll = r.next();
          const seq = s.lesson.seq;
          const field = Object.keys(v.positions);
          if (roll < 0.1 && ((v.canBench && field.length) || v.bench.length)) {
            // 벤치로 / 벤치에서 (벤치 선수는 이번 턴 기본 훈련이 없다)
            if (v.bench.length && (r.chance(0.4) || !v.canBench || !field.length)) lesson.benchPlayer(s, data, { playerId: r.pick(v.bench), on: false });
            else lesson.benchPlayer(s, data, { playerId: r.pick(field) });
            benches += 1;
          } else if (roll < 0.2 || !playable.length) {
            const benched = s.lesson.bench.map((id) => ({ id, st: { ...P(s, id).stats } }));
            lesson.endLessonTurn(s, data);
            for (const b of benched) assert.deepEqual(P(s, b.id).stats, b.st, `${where}: 벤치 선수 ${b.id} 기본 훈련 0`);
            baseTicks += s.lesson.lastFx.filter((x) => x.t === "base").length;
          } else {
            const h = r.pick(playable);
            const snap = JSON.stringify(s);
            let args;
            if (h.targetKind === "circle" && r.chance(0.3)) {
              args = { uid: h.uid, at: { x: r.int(0, 100), y: r.int(0, 100) } }; // 무작위 자리 (0명이면 거절)
            } else {
              const cands = lesson.dropCandidates(s, data, { uid: h.uid });
              assert.ok(cands.length, `${where}: ${h.cardId} 후보 점이 없다`);
              const c = r.pick(cands);
              args = { uid: h.uid, at: c.at || undefined, playerId: c.playerId };
            }
            const pv = lesson.previewCard(s, data, args);
            assert.equal(JSON.stringify(s), snap, `${where}: preview 순수`);
            assert.ok(Array.isArray(pv.notes) && pv.notes.every((n) => typeof n === "string"));
            if (!pv.ok) {
              assert.equal(h.targetKind, "circle", `${where}: ${h.cardId} ${pv.reason}`);
              assert.throws(() => lesson.playCard(s, data, args));
              assert.equal(JSON.stringify(s), snap, `${where}: 거절 뒤 상태 불변`);
              continue;
            }
            lesson.playCard(s, data, args);
            played.add(h.cardId);
            plays += 1;
          }
          assert.equal(s.lesson.seq, seq + 1, `${where}: seq`);
          checkInvariants(s, allUids, where);
        }
        assert.notEqual(s.lesson.status, "playing", `${tag}: 끝나지 않음`);
        lesson.getLessonView(s, data);
        lesson.lessonResult(s, data);
        statuses[s.lesson.status] += 1;
        lessons += 1;
      }
    }
    assert.deepEqual(all.map((c) => c.id).filter((id) => !played.has(id)), [], `${policy}: 한 번도 내지 않은 카드`);
  }
  assert.equal(lessons, 500);
  assert.ok(plays > 3000, `plays ${plays}`);
  assert.ok(benches > 300 && baseTicks > 2000, `benches ${benches} · base ${baseTicks}`);
  assert.ok(statuses.perfect + statuses.clear > 0 && statuses.fail > 0, JSON.stringify(statuses));
});
