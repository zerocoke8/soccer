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
// §14 의 기존 테스트는 붙기 없이 본다 (고정 rng 기대값 · 손패 지정이 붙기와 무관하다, §15.13). 코치 지원 테스트는 DA (실제 데이터).
data.lesson.attach.enabled = false;
const DA = loadData();
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

test("startLesson: 중점 구역 · 목표 344/416 · 턴 수 · 1턴 흩어지기 + 손패 3장, 특별 = 목표 ×1.15 · 상한 ×1.2", () => {
  const s = makeState();
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { zone: "pass" });
  const L = s.lesson;
  assert.equal(L.status, "playing");
  assert.equal(L.zone, "pass");
  assert.equal(L.stat, undefined);
  assert.deepEqual([L.turn, L.turns, L.target, L.cap, L.score], [1, 6, 344, 416, 0]);
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
  assert.deepEqual(L.stats, { plays: 0, benches: 0, fails: 0, injuries: 0, attaches: 0, cutins: 0 });
  assert.deepEqual(L.attach, { turns: [], cur: null, count: {}, log: [], hints: [] }); // 붙기 끔 → 붙을 턴 없음
  for (const k of ["stat", "restTurn", "cardGainSum", "autoGains"]) assert.ok(!(k in L), k);

  const sp = makeState();
  sp.season = 3;
  lesson.startLesson(sp, data, { zone: "pass", special: true });
  assert.deepEqual([sp.lesson.turns, sp.lesson.target, sp.lesson.cap], [8, 552, 701]);
  const s1 = lesson.startLesson(makeState(), data, { zone: "pass", special: true });
  assert.deepEqual([s1.lesson.target, s1.lesson.cap], [396, 499]);
  const s2 = makeState();
  s2.season = 2;
  lesson.startLesson(s2, data, { zone: "pass", special: true });
  assert.deepEqual([s2.lesson.turns, s2.lesson.target, s2.lesson.cap], [7, 469, 595]);

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
  assert.deepEqual(Object.keys(v.zoneCfg).sort(), ["aspect", "centers", "dropR", "ownerRadius", "pad", "pickR", "radius"]);
  assert.deepEqual([v.zoneCfg.ownerRadius, v.zoneCfg.dropR], [{ small: 8, medium: 15 }, 12]);
  assert.equal(v.benchMax, 2);
  for (const k of ["uid", "cardId", "name", "family", "plus", "bond80", "targetKind", "size", "radius", "onlyZones", "power", "cost", "heal", "playable", "deadReason", "desc", "shape", "ownerId"]) {
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
  lesson.playCard(s2, data, { uid: c2, playerId: "p2" }); // L40 이어 주기: 받는 선수 (체력 100) — 실패자는 체력 30 인 네리아
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
  const gre = uidOf(s, "cd_u_greta");
  const board = uidOf(s, "cd_tactics_board");
  const basic = uidOf(s, "cd_basic");
  forceHand(s, [gre, board, basic]);
  s.lesson.playsLeft = 3;
  s.lesson.buffs.nextPct = 0.4; // (L40 전에는 실루엔 카드가 켰다 — 지금은 코치 이레네 능력)
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

  // nextPairPct 0.5 (L40 으로 쓰는 카드는 없어졌지만 엔진에 남긴다): 중간 원에는 붙지 않고 작은 원에 붙고 소비된다
  const s2 = full(start({ extra: ["cd_one_two", "cd_fw_drill"] }));
  setZones(s2);
  const pair = uidOf(s2, "cd_one_two");
  const fw = uidOf(s2, "cd_fw_drill");
  forceHand(s2, [fw, pair]);
  s2.lesson.playsLeft = 3;
  s2.lesson.buffs.nextPairPct = 0.5;
  // 주인 둘레 작은 원 (철벽) 은 "작은 원 카드" 가 아니다 — nextPairPct 를 쓰지 않는다
  assert.equal(cards.isSmallCircle(lesson.lessonCardDef(s2, data, uidOf(s2, "cd_u_dorbina"))), false);
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
  // 고유 카드 이어 주기 (L40): 받는 후보마다 (벤치 p3 제외)
  assert.deepEqual(lesson.dropCandidates(s, data, { uid: u("cd_u_neria") }).map((c) => [c.playerId, c.ids, c.kind]),
    [["p2", ["p1", "p2"], "player"], ["p4", ["p1", "p4"], "player"], ["p5", ["p1", "p5"], "player"], ["p6", ["p1", "p6"], "player"], ["p7", ["p1", "p7"], "player"]]);
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
// ZE3 — 방침 버프 5종, 구역 기준 (§14.11). 고정 구역 LAYOUT: 수비 p1 p2 · 피지컬 p3 · 패스 p4 p5 · 슈팅 p6 · 드리블 p7
// ---------------------------------------------------------------------------

/** 기본 훈련 기대값 (분위기 몫 포함, 컨디션 2 · 효율 0): round((3.2 + 분위기 × 1.5 × 0.64) × 성장률 × 중점 배율) */
const baseWant = (s, p, z, mood = 0) => R((3.2 + mood * 1.5 * GS) * p.growth[z] * lesson.zoneMult(s.lesson, data, z));
/** 마지막 lastFx 의 기본 훈련 { id: n } */
const baseFx = (s) => Object.fromEntries(s.lesson.lastFx.filter((x) => x.t === "base").map((x) => [x.id, x.n]));

test("에이스형: 호조 (대상 카드만 1장씩 · 기본 훈련에는 없음) · 집중 몫 ÷ 원 안 인원 · focusX2 · 루틴 (단일 · 주인만, max) — 비용은 그대로", () => {
  const extra = ["cd_hojo_up", "cd_focus_routine", "cd_routine", "cd_breath", "cd_ace_training", "cd_one_point", "cd_df_drill", "cd_immerse"];
  const s = full(start({ policy: "ace", extra }, { zone: "physical" }));
  setZones(s);
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_hojo_up"), u("cd_immerse"), u("cd_focus_routine"), u("cd_routine"), u("cd_breath"), u("cd_coaching"), u("cd_basic")]);
  L.playsLeft = 7;
  lesson.playCard(s, data, { uid: u("cd_hojo_up") });
  lesson.playCard(s, data, { uid: u("cd_immerse") });
  assert.deepEqual([L.buffs.hojo, L.buffs.focus], [5, 1]);
  assert.ok(L.lastFx.some((x) => x.t === "buff" && x.key === "hojo" && x.from === 3 && x.to === 5));
  lesson.playCard(s, data, { uid: u("cd_focus_routine") });
  lesson.playCard(s, data, { uid: u("cd_routine") });
  const p4 = P(s, "p4");
  p4.stamina = 60;
  lesson.playCard(s, data, { uid: u("cd_breath"), playerId: "p4" }); // 회복 단일: 대상이 없어 호조를 쓰지 않는다, 집중 +1
  assert.deepEqual([L.buffs.hojo, L.buffs.focus, L.buffs.routine], [5, 4, 8]);
  assert.equal(p4.stamina, 85);
  const pv = lesson.previewCard(s, data, { uid: u("cd_coaching"), playerId: "p4" });
  assert.equal(pv.targets[0].gain, R((35 + 8 + 4 * 6) * p4.growth.pass * 1.5 * GS));
  assert.equal(pv.targets[0].cost, 21); // 집중 · 루틴은 비용을 올리지 않는다 (D12)
  for (const n of ["호조 ×1.5 (남은 5장)", "집중 4 → 1인 위력 +24", "루틴 → 위력 +8"]) assert.ok(pv.notes.includes(n), pv.notes.join(" / "));
  const b = p4.stats.pass;
  safePlay(s, u("cd_coaching"), { playerId: "p4" });
  assert.equal(p4.stats.pass - b, pv.targets[0].gain);
  assert.deepEqual([L.buffs.hojo, L.buffs.focus, L.buffs.routine], [4, 4, 8]); // 호조만 1장 소비
  // 기본 훈련에는 호조 · 집중 · 루틴이 붙지 않는다
  const before = Object.fromEntries(s.players.map((p) => [p.id, p.stats[LAYOUT[p.id]]]));
  lesson.endLessonTurn(s, data);
  for (const p of s.players) assert.equal(p.stats[LAYOUT[p.id]] - before[p.id], baseWant(s, p, LAYOUT[p.id]), p.id);
  assert.equal(s.lesson.buffs.hojo, 4);

  // 원 카드는 집중 몫을 원 안 인원으로 나눈다 · focusX2 · 원포인트의 집중 +1 은 다음 카드부터 · 루틴은 max
  const s2 = full(start({ policy: "ace", extra }, { zone: "pass" }));
  setZones(s2);
  const u2 = (id) => uidOf(s2, id);
  s2.lesson.buffs.focus = 2;
  s2.lesson.buffs.routine = 10;
  forceHand(s2, [u2("cd_df_drill"), u2("cd_ace_training"), u2("cd_one_point"), u2("cd_routine"), u2("cd_basic")]);
  s2.lesson.playsLeft = 5;
  const [d1, d2, d3] = [P(s2, "p1"), P(s2, "p2"), P(s2, "p3")];
  let pv2 = lesson.previewCard(s2, data, { uid: u2("cd_df_drill"), at: C.defense });
  assert.deepEqual(pv2.targets.map((t) => [t.id, t.gain, t.cost]), [["p1", R(24 * d1.growth.defense * GS), 11], ["p2", R(24 * d2.growth.defense * GS), 11]]); // 18 + 2×6÷2
  assert.ok(pv2.notes.includes("집중 2 → 1인 위력 +6"), pv2.notes.join(" / "));
  assert.ok(!pv2.notes.some((n) => n.startsWith("루틴")), "원 카드에는 루틴이 없다");
  pv2 = lesson.previewCard(s2, data, { uid: u2("cd_ace_training"), playerId: "p2" });
  assert.deepEqual([pv2.targets[0].gain, pv2.targets[0].cost], [R((30 + 10 + 24) * d2.growth.defense * GS), 18]);
  assert.ok(pv2.notes.includes("집중 2 ×2 → 1인 위력 +24"), pv2.notes.join(" / "));
  lesson.playCard(s2, data, { uid: u2("cd_routine") });
  assert.equal(s2.lesson.buffs.routine, 10);
  const b3 = d3.stats.physical;
  safePlay(s2, u2("cd_one_point"), { playerId: "p3" });
  assert.equal(d3.stats.physical - b3, R((25 + 10 + 12) * d3.growth.physical * GS));
  assert.equal(s2.lesson.buffs.focus, 3);
});

test("팀형: 분위기 → 턴 끝 기본 훈련 +0.96/스택 (대상 아님 · 분위기 몫) · 감소는 늘 1 (벤치와 무관) · 하나 된 호흡 · 분위기 ×2 · perMood · 칩 · 노트", () => {
  const extra = ["cd_high_five", "cd_mood_maker", "cd_breath_together", "cd_link_line"];
  const s = makeState({ policy: "team", extra });
  P(s, "p7").injuredTurns = 1;
  lesson.startLesson(s, data, { zone: "defense" });
  setZones(s);
  const L = s.lesson;
  const u = (id) => uidOf(s, id);
  assert.deepEqual(lesson.getLessonView(s, data).chips.map((c) => [c.label, c.value]), [["분위기", "0"]]);
  forceHand(s, [u("cd_high_five")]);
  assert.deepEqual(lesson.previewCard(s, data, { uid: u("cd_high_five") }).notes, ["분위기 0 → 3 · 기본 +2.9"]);
  const before = Object.fromEntries(s.players.map((p) => [p.id, { ...p.stats }]));
  lesson.playCard(s, data, { uid: u("cd_high_five") }); // 1장뿐 → 턴 끝 (분위기 3 으로 기본 훈련, 그 뒤 −1)
  assert.equal(L.turn, 2);
  assert.ok(!L.lastFx.some((x) => x.t === "tick"));
  let sum = 0;
  for (const p of s.players) {
    const z = LAYOUT[p.id];
    const d = p.stats[z] - before[p.id][z];
    assert.equal(d, p.id === "p7" ? 0 : R((3.2 + 3 * 1.5 * GS) * p.growth[z] * (z === "defense" ? 1.5 : 1)), p.id);
    if (p.id !== "p7") assert.equal(L.moodGains[p.id], d - L.baseGains[p.id], `${p.id} 분위기 몫`);
    sum += d;
  }
  assert.equal(L.score, sum);
  assert.ok(Object.values(L.moodGains).reduce((a, x) => a + x, 0) > 0);
  assert.deepEqual(L.cardGains, {});
  assert.deepEqual(L.targeted, {});
  assert.equal(L.buffs.mood, 2);
  const moodChip = lesson.getLessonView(s, data).chips.find((c) => c.key === "mood");
  assert.equal(`${moodChip.label} ${moodChip.value}`, "분위기 2 · 기본 +1.9");
  L.buffs.mood = 3;
  const chip3 = lesson.getLessonView(s, data).chips.find((c) => c.key === "mood");
  assert.equal(`${chip3.label} ${chip3.value}`, "분위기 3 · 기본 +2.9"); // §14.11 칩
  // 하나 된 호흡: 3턴 동안 감소 없음, 그 뒤 −1 (벤치가 있어도 −1 — 예전 쉬기 턴 −2 는 없다)
  L.buffs.mood = 4;
  forceHand(s, [u("cd_breath_together")]);
  lesson.playCard(s, data, { uid: u("cd_breath_together") });
  assert.deepEqual([L.turn, L.buffs.mood, L.buffs.noDecay], [3, 4, 2]);
  lesson.endLessonTurn(s, data);
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [4, 1]);
  lesson.endLessonTurn(s, data);
  assert.deepEqual([L.buffs.mood, L.buffs.noDecay], [4, 0]);
  lesson.benchPlayer(s, data, { playerId: "p1" });
  lesson.benchPlayer(s, data, { playerId: "p2" });
  lesson.endLessonTurn(s, data);
  assert.deepEqual([L.turn, L.buffs.mood, L.buffs.noDecay], [6, 3, 0]);
  lesson.endLessonTurn(s, data); // 마지막 턴
  assert.equal(L.buffs.mood, 2);
  assert.notEqual(L.status, "playing");

  // 분위기 ×2 (노트에 기본 몫) · 라인 연동 perMood 0.9 (1인, 비용 포함)
  const s2 = full(start({ policy: "team", extra }, { zone: "defense" }));
  setZones(s2);
  const u2 = (id) => uidOf(s2, id);
  s2.lesson.buffs.mood = 3;
  forceHand(s2, [u2("cd_mood_maker"), u2("cd_link_line")]);
  s2.lesson.playsLeft = 2;
  assert.deepEqual(lesson.previewCard(s2, data, { uid: u2("cd_mood_maker") }).notes, ["분위기 3 → 6 · 기본 +5.8"]);
  lesson.playCard(s2, data, { uid: u2("cd_mood_maker") });
  assert.equal(s2.lesson.buffs.mood, 6);
  const pv = lesson.previewCard(s2, data, { uid: u2("cd_link_line"), at: mid(C.defense, C.physical) });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p1", "p2", "p3"]);
  for (const t of pv.targets) {
    assert.equal(t.gain, R(17.4 * P(s2, t.id).growth[t.zone] * (t.zone === "defense" ? 1.5 : 1) * GS), t.id); // 12 + 0.9 × 6
    assert.equal(t.cost, R(17.4 * 0.6));
  }
  // 분위기 몫은 방침과 관계없이 기본 훈련에 붙는다 (카드 효과, D38) — 다른 방침의 칩에는 분위기가 0 이 아니면 보인다
  const s3 = full(start({ policy: "press" }, { zone: "defense" }));
  setZones(s3);
  s3.lesson.buffs.mood = 2;
  for (const pv3 of lesson.getLessonView(s3, data).players) assert.equal(pv3.baseNext, baseWant(s3, P(s3, pv3.id), LAYOUT[pv3.id], 2), pv3.id);
  assert.deepEqual(lesson.getLessonView(s3, data).chips.map((c) => [c.key, c.value, c.policy]), [["mood", "2 · 기본 +1.9", false], ["press", "0/3", true]]);
});

test("역습형: 모두 수비 구역 성공 → 탈취 +1 (stealBuild 2) · 최대 4 · 공격 구역 대상이 있으면 모두 써서 ×(1 + stealPer × 탈취) · 실패해도 사라짐 · 포지션이 아니라 서 있는 구역", () => {
  const extra = ["cd_line_up", "cd_recover", "cd_long_ball", "cd_counter_sprint", "cd_finisher", "cd_all_counter", "cd_df_drill", "cd_one_point"];
  const s = full(start({ policy: "counter", extra }, { zone: "defense" }));
  setZones(s);
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_line_up"), u("cd_df_drill"), u("cd_recover"), u("cd_long_ball"), u("cd_counter_sprint")]);
  L.playsLeft = 4; // 롱볼 추가 사용 +1
  const pvLine = lesson.previewCard(s, data, { uid: u("cd_line_up"), at: mid(C.defense, C.physical) });
  assert.deepEqual(pvLine.targets.map((t) => t.id), ["p1", "p2", "p3"]);
  assert.ok(pvLine.notes.includes("성공하면 탈취 +2 (모두 수비 구역)"), pvLine.notes.join(" / "));
  safePlay(s, u("cd_line_up"), { at: mid(C.defense, C.physical) });
  assert.equal(L.buffs.steal, 2);
  assert.ok(lesson.previewCard(s, data, { uid: u("cd_df_drill"), at: C.defense }).notes.includes("성공하면 탈취 +1 (모두 수비 구역)"));
  safePlay(s, u("cd_df_drill"), { at: C.defense });
  assert.equal(L.buffs.steal, 3);
  lesson.playCard(s, data, { uid: u("cd_recover") });
  assert.equal(L.buffs.steal, 4);
  lesson.playCard(s, data, { uid: u("cd_long_ball") });
  assert.equal(L.buffs.steal, 4);
  assert.equal(L.playsLeft, 1);
  const pv = lesson.previewCard(s, data, { uid: u("cd_counter_sprint"), at: mid(C.pass, C.dribble) });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p4", "p5", "p7"]);
  for (const t of pv.targets) assert.equal(t.gain, R(13 * P(s, t.id).growth[t.zone] * (1 + 0.4 * 4) * GS), t.id);
  assert.ok(pv.notes.includes("탈취 4 → ×2.6 (공격 구역 대상 있음)"), pv.notes.join(" / "));
  safePlay(s, u("cd_counter_sprint"), { at: mid(C.pass, C.dribble) });
  assert.equal(L.buffs.steal, 0);

  // 포지션이 아니라 구역: 수비 구역의 FW 와 함께 → 쌓기, 패스 구역의 GK → 쓰기
  const sz = full(start({ policy: "counter", extra }, { zone: "shoot" }));
  setZones(sz, { ...LAYOUT, p1: "pass", p6: "defense" });
  const uz = (id) => uidOf(sz, id);
  forceHand(sz, [uz("cd_df_drill"), uz("cd_coaching"), uz("cd_basic")]);
  sz.lesson.playsLeft = 3;
  const pvz = lesson.previewCard(sz, data, { uid: uz("cd_df_drill"), at: C.defense });
  assert.deepEqual(pvz.targets.map((t) => [t.id, t.zone]), [["p2", "defense"], ["p6", "defense"]]);
  assert.ok(pvz.notes.includes("성공하면 탈취 +1 (모두 수비 구역)"), pvz.notes.join(" / "));
  safePlay(sz, uz("cd_df_drill"), { at: C.defense });
  assert.equal(sz.lesson.buffs.steal, 1);
  const pvg = lesson.previewCard(sz, data, { uid: uz("cd_coaching"), playerId: "p1" });
  assert.equal(pvg.targets[0].gain, R(35 * P(sz, "p1").growth.pass * 1.3 * GS));
  assert.ok(pvg.notes.includes("탈취 1 → ×1.3 (공격 구역 대상 있음)"), pvg.notes.join(" / "));
  safePlay(sz, uz("cd_coaching"), { playerId: "p1" });
  assert.equal(sz.lesson.buffs.steal, 0);

  // 쓰는 카드가 실패해도 탈취는 사라진다
  const s2 = full(start({ policy: "counter", extra }, { zone: "shoot" }));
  setZones(s2);
  P(s2, "p6").stamina = 30;
  s2.lesson.buffs.steal = 3;
  const fin = uidOf(s2, "cd_finisher");
  forceHand(s2, [fin]);
  assert.equal(lesson.previewCard(s2, data, { uid: fin, playerId: "p6" }).targets[0].gain, R(30 * P(s2, "p6").growth.shoot * 1.5 * (1 + 0.45 * 3) * GS));
  s2.rngState = FAIL_NO_INJURY;
  lesson.playCard(s2, data, { uid: fin, playerId: "p6" });
  assert.equal(s2.lesson.stats.fails, 1);
  assert.equal(s2.lesson.buffs.steal, 0);

  // 실패자가 있는 수비 구역 카드는 쌓지 않는다
  const s3 = full(start({ policy: "counter", extra }, { zone: "defense" }));
  setZones(s3);
  P(s3, "p2").stamina = 30;
  forceHand(s3, [uidOf(s3, "cd_df_drill")]);
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: uidOf(s3, "cd_df_drill"), at: C.defense });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.steal], [1, 0]);

  // 전원 역습: 탈취를 썼을 때만 팀워크 +2 (L10 +6 은 따로)
  for (const [steal, cardTw] of [[2, 2], [0, 0]]) {
    const s4 = full(start({ policy: "counter", extra }, { zone: "defense" }));
    setZones(s4);
    s4.lesson.buffs.steal = steal;
    forceHand(s4, [uidOf(s4, "cd_all_counter")]);
    safePlay(s4, uidOf(s4, "cd_all_counter"));
    assert.equal(s4.teamwork, 6 + cardTw, `steal ${steal}`);
    assert.equal(s4.lesson.buffs.steal, 0);
  }

  // 방침이 다르면 (D38): 쌓기 · 쓰기 · 배율 · 노트 없음. 카드에 적힌 탈취 +1 은 그대로
  const s5 = full(start({ policy: "team", extra }, { zone: "defense" }));
  setZones(s5);
  const u5 = (id) => uidOf(s5, id);
  forceHand(s5, [u5("cd_line_up"), u5("cd_recover"), u5("cd_counter_sprint")]);
  s5.lesson.playsLeft = 3;
  safePlay(s5, u5("cd_line_up"), { at: mid(C.defense, C.physical) });
  assert.equal(s5.lesson.buffs.steal, 0);
  lesson.playCard(s5, data, { uid: u5("cd_recover") });
  assert.equal(s5.lesson.buffs.steal, 1);
  const pv5 = lesson.previewCard(s5, data, { uid: u5("cd_counter_sprint"), at: mid(C.pass, C.dribble) });
  for (const t of pv5.targets) assert.equal(t.gain, R(13 * P(s5, t.id).growth[t.zone] * GS));
  assert.deepEqual(pv5.notes, []);
  safePlay(s5, u5("cd_counter_sprint"), { at: mid(C.pass, C.dribble) });
  assert.equal(s5.lesson.buffs.steal, 1);
});

test("압박형: 압박 +n (최대 3) · 비용 ×(1 + 0.2 × 압박) · 방침 배율 · noPressCost · perPress · 벤치는 압박을 바꾸지 않음 · 기본 훈련엔 압박 없음 · 라인 내리기 · 실패 리셋", () => {
  const extra = ["cd_front_press", "cd_full_press", "cd_six_sec", "cd_drop_line", "cd_all_out", "cd_gegen", "cd_attack_build"];
  const s = full(start({ policy: "press", extra }, { zone: "shoot" }));
  setZones(s);
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  const p6 = P(s, "p6");
  const AT3 = mid(C.pass, C.dribble);
  forceHand(s, [u("cd_front_press"), u("cd_full_press"), u("cd_six_sec"), u("cd_gegen"), u("cd_all_out")]);
  L.playsLeft = 4; // 풀 프레싱 추가 사용 +1
  let pv = lesson.previewCard(s, data, { uid: u("cd_front_press"), at: AT3 });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p4", "p5", "p7"]);
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost], [R(12 * P(s, t.id).growth[t.zone] * GS), 7], t.id);
  safePlay(s, u("cd_front_press"), { at: AT3 });
  assert.equal(L.buffs.press, 1);
  // 되찾기 6초 = 작은 원 (§15.7) — 슈팅 구역 중심에 놓으면 p6 혼자
  assert.equal(lesson.previewCard(s, data, { uid: u("cd_six_sec"), at: C.shoot }).targets[0].cost, R(17 * 0.6 * 1.2));
  lesson.playCard(s, data, { uid: u("cd_full_press") });
  assert.equal(L.buffs.press, 3); // 1 + 2, 최대 3
  pv = lesson.previewCard(s, data, { uid: u("cd_six_sec"), at: C.shoot });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p6"]);
  assert.deepEqual([pv.targets[0].gain, pv.targets[0].cost], [R(17 * p6.growth.shoot * 1.5 * 1.6 * GS), 10]); // 압박 2 이상 → 비용 증가 없음
  assert.ok(pv.notes.includes("압박 3 · 비용 증가 없음"), pv.notes.join(" / "));
  pv = lesson.previewCard(s, data, { uid: u("cd_gegen"), at: AT3 });
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost], [R(14 * P(s, t.id).growth[t.zone] * 1.6 * GS), 8], t.id);
  pv = lesson.previewCard(s, data, { uid: u("cd_all_out") });
  assert.equal(pv.targets.length, 7);
  for (const t of pv.targets) {
    const zm = t.zone === "shoot" ? 1.5 : 1;
    assert.deepEqual([t.gain, t.cost], [R(10.1 * P(s, t.id).growth[t.zone] * zm * 1.6 * GS), R(10.1 * 0.6 * 1.6)], t.id); // 5 + 1.7 × 3
  }
  assert.ok(pv.notes.includes("압박 3 · 비용 ×1.6"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("압박 3 → ×1.6"), pv.notes.join(" / "));
  safePlay(s, u("cd_six_sec"), { at: C.shoot });
  assert.equal(L.buffs.press, 3);

  // 벤치: 압박은 그대로 (예전 쉬기 → 압박 0 · 단계당 +4 는 없다), 기본 훈련은 압박 배율 · 비용을 받지 않는다
  const s2 = start({ policy: "press", extra }, { zone: "shoot" });
  setZones(s2);
  for (const p of s2.players) p.stamina = 50;
  s2.lesson.buffs.press = 2;
  lesson.benchPlayer(s2, data, { playerId: "p1" });
  const want = Object.fromEntries(s2.players.filter((p) => p.id !== "p1").map((p) => [p.id, baseWant(s2, p, LAYOUT[p.id])]));
  lesson.endLessonTurn(s2, data);
  assert.deepEqual(baseFx(s2), want);
  assert.equal(P(s2, "p1").stamina, 65);
  for (const id of ["p2", "p3", "p4", "p5", "p6", "p7"]) assert.equal(P(s2, id).stamina, 49, id);
  assert.equal(s2.lesson.buffs.press, 2);

  // 라인 내리기: 내린 단계 × 6 회복 (결장이 아닌 선수 — 벤치 포함), 압박 0, 다음 카드 실패 없음
  const s3 = start({ policy: "press", extra }, { zone: "shoot" });
  setZones(s3);
  for (const p of s3.players) p.stamina = 50;
  s3.lesson.buffs.press = 3;
  lesson.benchPlayer(s3, data, { playerId: "p2" });
  forceHand(s3, [uidOf(s3, "cd_drop_line"), uidOf(s3, "cd_coaching")]);
  s3.lesson.playsLeft = 2;
  assert.ok(lesson.previewCard(s3, data, { uid: uidOf(s3, "cd_drop_line") }).notes.includes("압박 3 → 0 · 출전 선수 체력 +18"));
  lesson.playCard(s3, data, { uid: uidOf(s3, "cd_drop_line") });
  for (const p of s3.players) assert.equal(p.stamina, 68, p.id);
  assert.deepEqual([s3.lesson.buffs.press, s3.lesson.buffs.nextNoFail], [0, true]);
  assert.equal(lesson.previewCard(s3, data, { uid: uidOf(s3, "cd_coaching"), playerId: "p6" }).failRate, 0);

  // 실패 → 압박 0 (압박형일 때만). 다른 방침은 비용 증가만 있고 배율 · 리셋은 없다
  for (const [policy, pressAfter] of [["press", 0], ["team", 2]]) {
    const s4 = full(start({ policy, extra }, { zone: "shoot" }));
    setZones(s4);
    s4.lesson.buffs.press = 2;
    const ab = uidOf(s4, "cd_attack_build");
    forceHand(s4, [ab]);
    const pv4 = lesson.previewCard(s4, data, { uid: ab, at: AT3 });
    const mult = policy === "press" ? 1.4 : 1;
    for (const t of pv4.targets) assert.deepEqual([t.gain, t.cost], [R(15 * P(s4, t.id).growth[t.zone] * mult * GS), R(15 * 0.6 * 1.4)], policy);
    if (policy === "press") assert.ok(pv4.notes.includes("실패하면 압박 0"), pv4.notes.join(" / "));
    P(s4, "p4").stamina = 30;
    s4.rngState = FAIL_NO_INJURY;
    lesson.playCard(s4, data, { uid: ab, at: AT3 });
    assert.equal(s4.lesson.stats.fails, 1);
    assert.equal(s4.lesson.buffs.press, pressAfter, policy);
  }
});

test("점유형: 패스 구역 대상 성공 +1 · 패스 구역 없음 −2 (possKeep 유지) · 실패 0 / 가드 · 최대 8 · ×(1 + 0.05 × 점유) · possX2 · 포지션이 아니라 서 있는 구역", () => {
  const extra = ["cd_mid_control", "cd_triangle", "cd_circulate", "cd_tempo", "cd_dominate", "cd_back_build", "cd_df_drill", "cd_attack_build", "cd_one_point"];
  const s = full(start({ policy: "poss", extra }, { zone: "pass" }));
  setZones(s);
  const u = (id) => uidOf(s, id);
  const L = s.lesson;
  forceHand(s, [u("cd_mid_control"), u("cd_triangle"), u("cd_df_drill"), u("cd_back_build"), u("cd_circulate")]);
  L.playsLeft = 5;
  safePlay(s, u("cd_mid_control"), { at: C.pass });
  assert.equal(L.buffs.poss, 3); // 기본 +1 + 카드 +2
  const pos = posOf(s);
  safePlay(s, u("cd_triangle"), { at: mid(pos.p4, pos.p5) });
  assert.equal(L.buffs.poss, 6);
  const pvDf = lesson.previewCard(s, data, { uid: u("cd_df_drill"), at: C.defense });
  assert.ok(pvDf.notes.includes("점유 −2 (패스 구역 대상 없음)"), pvDf.notes.join(" / "));
  safePlay(s, u("cd_df_drill"), { at: C.defense });
  assert.equal(L.buffs.poss, 4);
  const pvBb = lesson.previewCard(s, data, { uid: u("cd_back_build"), at: mid(C.defense, C.physical) });
  assert.ok(pvBb.notes.includes("패스 구역 대상 없어도 점유 유지"), pvBb.notes.join(" / "));
  safePlay(s, u("cd_back_build"), { at: mid(C.defense, C.physical) });
  assert.equal(L.buffs.poss, 4);
  L.buffs.poss = 7;
  lesson.playCard(s, data, { uid: u("cd_circulate") });
  assert.equal(L.buffs.poss, 8);

  // 포지션이 아니라 구역: 패스 구역의 GK → +1, 슈팅 구역의 MF → −2, 작은 원(삼각형 패스)에 패스 구역이 없으면 −2 뒤 카드 +2
  const sz = full(start({ policy: "poss", extra }, { zone: "shoot" }));
  setZones(sz, { ...LAYOUT, p1: "pass", p4: "shoot" });
  const uz = (id) => uidOf(sz, id);
  sz.lesson.buffs.poss = 3;
  forceHand(sz, [uz("cd_coaching"), uz("cd_one_point"), uz("cd_triangle"), uz("cd_basic")]);
  sz.lesson.playsLeft = 4;
  safePlay(sz, uz("cd_coaching"), { playerId: "p1" });
  assert.equal(sz.lesson.buffs.poss, 4);
  assert.ok(lesson.previewCard(sz, data, { uid: uz("cd_one_point"), playerId: "p4" }).notes.includes("점유 −2 (패스 구역 대상 없음)"));
  safePlay(sz, uz("cd_one_point"), { playerId: "p4" });
  assert.equal(sz.lesson.buffs.poss, 2);
  const pz = posOf(sz);
  const pvT = lesson.previewCard(sz, data, { uid: uz("cd_triangle"), at: mid(pz.p4, pz.p6) });
  assert.deepEqual(pvT.targets.map((t) => [t.id, t.zone]), [["p4", "shoot"], ["p6", "shoot"]]);
  safePlay(sz, uz("cd_triangle"), { at: mid(pz.p4, pz.p6) });
  assert.equal(sz.lesson.buffs.poss, 2); // max(0, 2 − 2) + 2

  // 배율: ×(1 + 0.05 × 점유), 지배하는 중원은 2배
  const s2 = full(start({ policy: "poss", extra }, { zone: "pass" }));
  setZones(s2);
  s2.lesson.buffs.poss = 4;
  forceHand(s2, [uidOf(s2, "cd_dominate"), uidOf(s2, "cd_attack_build")]);
  const AT3 = mid(C.pass, C.dribble);
  let pv = lesson.previewCard(s2, data, { uid: uidOf(s2, "cd_dominate"), at: AT3 });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p4", "p5", "p7"]);
  for (const t of pv.targets) assert.equal(t.gain, R(11 * P(s2, t.id).growth[t.zone] * (t.zone === "pass" ? 1.5 : 1) * 1.4 * GS), t.id);
  assert.ok(pv.notes.includes("점유 4 → ×1.4"), pv.notes.join(" / "));
  pv = lesson.previewCard(s2, data, { uid: uidOf(s2, "cd_attack_build"), at: AT3 });
  for (const t of pv.targets) assert.equal(t.gain, R(15 * P(s2, t.id).growth[t.zone] * (t.zone === "pass" ? 1.5 : 1) * 1.2 * GS), t.id);
  assert.ok(pv.notes.includes("점유 4 → ×1.2"), pv.notes.join(" / "));
  assert.ok(pv.notes.includes("성공하면 점유 +1"), pv.notes.join(" / "));

  // 실패: 가드가 있으면 가드 −1 (점유 유지), 없으면 0
  const s3 = full(start({ policy: "poss", extra }, { zone: "pass" }));
  setZones(s3);
  const u3 = (id) => uidOf(s3, id);
  P(s3, "p4").stamina = 30;
  s3.lesson.buffs.poss = 6;
  forceHand(s3, [u3("cd_tempo"), u3("cd_mid_control"), u3("cd_coaching"), u3("cd_df_drill")]);
  s3.lesson.playsLeft = 3;
  assert.ok(lesson.previewCard(s3, data, { uid: u3("cd_mid_control"), at: C.pass }).notes.includes("실패하면 점유 6을 잃음"));
  lesson.playCard(s3, data, { uid: u3("cd_tempo") });
  assert.equal(s3.lesson.buffs.possGuard, 1);
  assert.equal(s3.lesson.drawNext, 1);
  assert.ok(lesson.previewCard(s3, data, { uid: u3("cd_mid_control"), at: C.pass }).notes.includes("실패해도 점유 유지 (가드 1)"));
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: u3("cd_mid_control"), at: C.pass });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.poss, s3.lesson.buffs.possGuard], [1, 6, 0]); // 성공 효과 +2 도 없음
  s3.rngState = FAIL_NO_INJURY;
  lesson.playCard(s3, data, { uid: u3("cd_coaching"), playerId: "p4" });
  assert.deepEqual([s3.lesson.stats.fails, s3.lesson.buffs.poss], [2, 0]);

  // 방침이 다르면 (D38): ± · 배율 없음, 카드의 점유 +2 는 그대로
  const s4 = full(start({ policy: "team", extra }, { zone: "shoot" }));
  setZones(s4);
  s4.lesson.buffs.poss = 4;
  forceHand(s4, [uidOf(s4, "cd_df_drill"), uidOf(s4, "cd_mid_control")]);
  s4.lesson.playsLeft = 2;
  for (const t of lesson.previewCard(s4, data, { uid: uidOf(s4, "cd_df_drill"), at: C.defense }).targets) assert.equal(t.gain, R(18 * P(s4, t.id).growth.defense * GS));
  safePlay(s4, uidOf(s4, "cd_df_drill"), { at: C.defense });
  assert.equal(s4.lesson.buffs.poss, 4);
  safePlay(s4, uidOf(s4, "cd_mid_control"), { at: C.pass });
  assert.equal(s4.lesson.buffs.poss, 6);
});

test("뷰 chips: 방침 버프는 0이어도, 그 밖은 0이 아니거나 켜진 것만 (순서 고정) · 분위기 칩 \"분위기 3 · 기본 +2.9\"", () => {
  const want = { ace: [["hojo", "0장"], ["focus", "0"]], team: [["mood", "0"]], counter: [["steal", "0/4"]], press: [["press", "0/3"]], poss: [["poss", "0/8"]] };
  for (const [policy, chips] of Object.entries(want)) {
    const s = start({ policy }, { zone: "pass" });
    const v = lesson.getLessonView(s, data);
    assert.deepEqual(v.chips.map((c) => [c.key, c.value]), chips, policy);
    assert.ok(v.chips.every((c) => c.policy === true && typeof c.label === "string"));
  }
  const s = start({ policy: "ace" }, { zone: "pass" });
  Object.assign(s.lesson.buffs, { hojo: 2, steal: 2, nextPct: 0.4, nextPairPct: 0.5, nextCostZero: true, noDecay: 3, routine: 8, mood: 5 });
  const chips = lesson.getLessonView(s, data).chips;
  assert.deepEqual(chips.map((c) => [c.key, c.label, c.value]), [
    ["hojo", "호조", "2장"], ["focus", "집중", "0"], ["routine", "루틴", "+8"], ["mood", "분위기", "5 · 기본 +4.8"], ["noDecay", "분위기 유지", "3턴"],
    ["steal", "탈취", "2/4"], ["nextPct", "다음 카드", "+40%"], ["nextPairPct", "다음 작은 원", "+50%"], ["nextCostZero", "비용 0", "다음 1장"],
  ]);
  assert.deepEqual(chips.filter((c) => c.policy).map((c) => c.key), ["hojo", "focus"]);
  // 칩 문구의 분위기 몫 = 분위기 × moodK × cardGainScale (소수 1자리)
  for (const [m, txt] of [[1, "1 · 기본 +1.0"], [3, "3 · 기본 +2.9"], [10, "10 · 기본 +9.6"]]) {
    const t = start({ policy: "team" }, { zone: "pass" });
    t.lesson.buffs.mood = m;
    assert.equal(lesson.getLessonView(t, data).chips[0].value, txt);
  }
});

// ---------------------------------------------------------------------------
// 퍼즈: 76장 전부 "내기 → 오류 없음" (방침 5개 × 시드 20 × 중점 구역 5곳, 무작위 놓을 점 · 벤치 · 턴 끝, 매 행동 불변식)
// ZE2 가 구역 방식으로 옮겼다 (탭 → 무작위 drop 점 · dropCandidates, 쉬기 → 벤치). ZE3 가 방침 불변식을 더했다 (expectBuffs).
// ---------------------------------------------------------------------------

const BUFF_KEYS = ["hojo", "focus", "routine", "mood", "noDecay", "steal", "press", "poss", "possGuard"];
const pickBuffs = (B) => Object.fromEntries(BUFF_KEYS.map((k) => [k, Number(B[k]) || 0]));

/**
 * 방침 불변식 모델 (§14.11 · §14.7 10~12번 · §14.3 턴 끝 ③): 카드 1장(또는 턴 끝)을 낸 뒤 버프가 어떻게 되어야 하나.
 * zs = 대상의 구역 (실패자 포함), failed = 실패자 있음, def = 낸 카드 (강화 · 유대 80 반영), turnEnded = 그 행동으로 턴 끝이 돌았음.
 */
function expectBuffs(policy, B0, zs, failed, def, turnEnded) {
  const b = pickBuffs(B0);
  const n = zs.length;
  const mods = (def && def.mods) || {};
  const hasAttack = zs.some((z) => lesson.ATTACK_ZONES.includes(z));
  const allDefense = n > 0 && zs.every((z) => lesson.DEFENSE_ZONES.includes(z));
  let consumed = false;
  if (n) {
    if (b.hojo > 0) b.hojo -= 1; // 대상 있는 카드만 호조 1장
    if (policy === "counter") {
      if (hasAttack) {
        consumed = b.steal > 0;
        b.steal = 0;
      } else if (allDefense && !failed) b.steal = Math.min(4, b.steal + (mods.stealBuild ?? 1));
    } else if (policy === "poss") {
      if (failed) {
        if (b.possGuard > 0) b.possGuard -= 1;
        else b.poss = 0;
      } else if (zs.includes("pass")) b.poss = Math.min(8, b.poss + 1);
      else if (!mods.possKeep) b.poss = Math.max(0, b.poss - 2);
    } else if (policy === "press" && failed) b.press = 0;
  }
  for (const e of (def && def.effects) || []) {
    const when = e.when || "always";
    if ((when === "success" && failed) || (when === "consume" && !consumed)) continue;
    if (["hojo", "focus", "mood", "possGuard"].includes(e.type)) b[e.type] += e.n;
    else if (e.type === "moodX2") b.mood *= 2;
    else if (e.type === "noDecay") b.noDecay = Math.max(b.noDecay, e.turns);
    else if (e.type === "routine") b.routine = Math.max(b.routine, e.n);
    else if (e.type === "steal") b.steal = Math.min(4, b.steal + e.n);
    else if (e.type === "press") b.press = Math.min(3, b.press + e.n);
    else if (e.type === "poss") b.poss = Math.min(8, b.poss + e.n);
    else if (e.type === "pressDrop") b.press = 0;
  }
  if (turnEnded) {
    if (b.noDecay > 0) b.noDecay -= 1;
    else if (b.mood > 0) b.mood -= 1;
  }
  return b;
}

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
  // 분위기 칩 = "분위기 n · 기본 +x" (팀형은 0 이어도 칩이 있다)
  const moodChip = lesson.getLessonView(s, data).chips.find((c) => c.key === "mood");
  if (B.mood > 0 || s.policy === "team") {
    assert.equal(moodChip && moodChip.value, B.mood > 0 ? `${B.mood} · 기본 +${(Math.round(B.mood * 1.5 * GS * 10) / 10).toFixed(1)}` : "0", `${where}: 분위기 칩`);
  } else assert.equal(moodChip, undefined, `${where}: 분위기 칩 없음`);
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

test("퍼즈: 76장 전부 내기 → 오류 없음 (방침 5개 × 시드 20 × 중점 구역 5곳, 무작위 놓을 점 · 벤치 · 턴 끝 · 매 행동 불변식)", () => {
  const all = cards.cardList(data);
  assert.equal(all.length, 76);
  const prepIds = all.filter((c) => c.family === "prep").map((c) => c.id);
  const deckIds = all.filter((c) => c.family !== "prep").map((c) => c.id);
  const formations = Object.keys(FORMATIONS);
  const mirkaSquad = { ...data.config.defaultSquad.slots, MF2: "ch_cat_trickster" };
  // §19.16 새 편성 A · B (새 8명의 고유 카드가 손에 들어온다)
  const newA = { GK: "ch_giant_keeper", DF1: "ch_elf_regista", DF2: "ch_rabbit_fullback", MF1: "ch_spirit_dribbler", MF2: "ch_elf_archer", FW1: "ch_spirit_striker", FW2: "ch_human_header" };
  const newB = { ...newA, FW2: "ch_dwarf_finisher" };
  let plays = 0;
  let lessons = 0;
  let benches = 0;
  let baseTicks = 0;
  const statuses = { perfect: 0, clear: 0, fail: 0 };
  const policyHits = { ace: 0, team: 0, counter: 0, press: 0, poss: 0 };
  for (const policy of ["ace", "team", "counter", "press", "poss"]) {
    const played = new Set();
    for (let seed = 1; seed <= 20; seed++) {
      for (const [si, zone] of zones.ZONE_IDS.entries()) {
        const r = createRngFromState((seed * 1000 + si * 37 + policy.length * 7919) >>> 0);
        const squad = r.pick([undefined, mirkaSquad, newA, newB]);
        // 덱 = 고유가 아닌 카드 전부 + 그 편성 주인의 고유 카드 2장씩 (§19.12 ⑥ — 16명 중 7명이라 주인이 없는 고유 9장은 넣지 않고,
        // 편성 4가지로 나뉜 고유 카드가 방침마다 한 번은 손에 들어오게 2장씩)
        const owners = new Set(Object.values(squad || data.config.defaultSquad.slots));
        const owned = deckIds.filter((id) => owners.has(cards.getCard(data, id).ownerCharId));
        const deck = [...deckIds.filter((id) => cards.getCard(data, id).family !== "unique"), ...owned, ...owned];
        const s = makeState({ seed: seed * 31 + si, policy, deckIds: deck, squad });
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
            const b0 = pickBuffs(s.lesson.buffs);
            if (v.bench.length && (r.chance(0.4) || !v.canBench || !field.length)) lesson.benchPlayer(s, data, { playerId: r.pick(v.bench), on: false });
            else lesson.benchPlayer(s, data, { playerId: r.pick(field) });
            assert.deepEqual(pickBuffs(s.lesson.buffs), b0, `${where}: 벤치는 버프를 바꾸지 않는다`);
            benches += 1;
          } else if (roll < 0.2 || !playable.length) {
            const benched = s.lesson.bench.map((id) => ({ id, st: { ...P(s, id).stats } }));
            const b0 = pickBuffs(s.lesson.buffs);
            lesson.endLessonTurn(s, data);
            for (const b of benched) assert.deepEqual(P(s, b.id).stats, b.st, `${where}: 벤치 선수 ${b.id} 기본 훈련 0`);
            // 기본 훈련 = 뷰의 baseNext (분위기 몫 포함, 압박 · 호조 · 방침 배율 없음)
            const got = Object.fromEntries(s.lesson.lastFx.filter((x) => x.t === "base").map((x) => [x.id, x.n]));
            const wantBase = Object.fromEntries(v.players.filter((x) => x.baseNext > 0).map((x) => [x.id, x.baseNext]));
            assert.deepEqual(got, wantBase, `${where}: 기본 훈련 = baseNext`);
            assert.deepEqual(pickBuffs(s.lesson.buffs), expectBuffs(policy, b0, [], false, null, true), `${where}: 턴 끝 분위기 감소`);
            baseTicks += Object.keys(got).length;
          } else {
            const h = r.pick(playable);
            const snap = JSON.stringify(s);
            let args;
            const needs = h.shape && h.shape.needs;
            if (h.targetKind === "circle" && r.chance(0.3)) {
              args = { uid: h.uid, at: { x: r.int(0, 100), y: r.int(0, 100) } }; // 무작위 자리 (0명이면 거절)
            } else if (h.shape && r.chance(0.3)) {
              // L40 모양 인자 무작위: 놓은 점 · 선수 (주인 · 벤치 · 결장 포함) · 구역 (모르는 구역 포함) — 틀리면 거절
              const k = r.int(0, 2);
              args = { uid: h.uid };
              if (k === 0) args.at = { x: r.int(0, 100), y: r.int(0, 100) };
              else if (k === 1) args.playerId = r.pick(s.players).id;
              else args.zone = r.pick([...zones.ZONE_IDS, "MF"]);
            } else {
              const cands = lesson.dropCandidates(s, data, { uid: h.uid });
              assert.ok(cands.length, `${where}: ${h.cardId} 후보 점이 없다`);
              const c = r.pick(cands);
              args = { uid: h.uid, at: c.at || undefined, playerId: c.playerId };
              if (needs === "zone" && r.chance(0.5)) args = { uid: h.uid, zone: c.zone };
            }
            const pv = lesson.previewCard(s, data, args);
            assert.equal(JSON.stringify(s), snap, `${where}: preview 순수`);
            assert.ok(Array.isArray(pv.notes) && pv.notes.every((n) => typeof n === "string"));
            if (!pv.ok) {
              assert.ok(h.targetKind === "circle" || (h.shape && (needs || args.at || args.playerId || args.zone)), `${where}: ${h.cardId} ${pv.reason}`);
              assert.throws(() => lesson.playCard(s, data, args));
              assert.equal(JSON.stringify(s), snap, `${where}: 거절 뒤 상태 불변`);
              continue;
            }
            const def = lesson.lessonCardDef(s, data, h.uid);
            const b0 = pickBuffs(s.lesson.buffs);
            const turn0 = s.lesson.turn;
            const mv = pv.shape && pv.shape.to && pv.shape.from !== pv.shape.to ? { id: pv.shape.ownerId, to: pv.shape.to } : null;
            const st0 = Object.fromEntries(s.players.map((p) => [p.id, p.stamina]));
            lesson.playCard(s, data, args);
            const fx = s.lesson.lastFx;
            // 미리보기 = 실제 (상승 · 비용, 행 순서) — 상한에 닿아 끝난 경우도 같다
            const gfx = fx.filter((x) => x.t === "gain" || x.t === "fail");
            if (!fx.some((x) => x.t === "fail")) assert.deepEqual(gfx.map((x) => [x.id, x.stat, x.n]), pv.targets.map((t) => [t.id, t.stat, t.gain]), `${where}: ${h.cardId} 미리보기 = 실제 상승`);
            const cfx = fx.filter((x) => x.t === "cost" && !x.src);
            const wantCost = pv.targets.filter((t) => t.cost > 0 && st0[t.id] > 0).map((t) => [t.id, Math.min(t.cost, st0[t.id])]);
            assert.deepEqual(cfx.map((x) => [x.id, x.n]), wantCost, `${where}: ${h.cardId} 비용 = 서로 다른 대상마다 1번`);
            // 옮기기: 성공 · 실패와 상관없이 놓은 구역으로 (부상이면 구역에서 빠진다), fx move 가 비용 앞
            if (mv) {
              const mfx = fx.findIndex((x) => x.t === "move");
              assert.ok(mfx >= 0 && (cfx.length === 0 || mfx < fx.indexOf(cfx[0])), `${where}: move fx 가 비용 앞`);
              if (!fx.some((x) => x.t === "turnEnd") && !s.lesson.out.includes(mv.id)) assert.equal(s.lesson.zones[mv.id], mv.to, `${where}: 옮긴 구역`);
            }
            const failed = fx.some((x) => x.t === "fail");
            const turnEnded = fx.some((x) => x.t === "turnEnd");
            assert.ok(turnEnded || s.lesson.turn === turn0, `${where}: 턴`);
            const zs = pv.targets.map((t) => t.zone);
            assert.deepEqual(pickBuffs(s.lesson.buffs), expectBuffs(policy, b0, zs, failed, def, turnEnded), `${where}: ${h.cardId} 방침 버프 (${zs.join(",")}${failed ? " 실패" : ""})`);
            if (pv.targets.length) policyHits[policy] += 1;
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
  for (const [k, n] of Object.entries(policyHits)) assert.ok(n > 300, `${k}: 대상 있는 카드 ${n}`);
});

// ---------------------------------------------------------------------------
// §15 코치 지원 · 컷인 (L37) — DA = 붙기를 켠 실제 데이터 (data/lesson.json attach)
// ---------------------------------------------------------------------------

const SUP = (id, bond = 20) => ({ id, bond, firedEventIds: [] });
const ALL_COACHES = ["sp_coach_harr", "sp_wind_dancer", "sp_elder_sage", "sp_iron_captain", "sp_mountain_monk", "sp_bard_lumi", "sp_street_striker", "sp_river_scholar"];
/** 붙기 켠 레슨 시작 (opts.supports 로 편성 코치를 바꾼다) */
function startA(opts = {}, args = {}) {
  const s = makeState(opts);
  if (opts.supports) s.supports = opts.supports.map((x) => (typeof x === "string" ? SUP(x) : x));
  return lesson.startLesson(s, DA, { zone: "physical", ...args });
}
/** 이번 턴 붙기를 직접 정한다 (능력만 보려면 upgrade "none") */
function attachTo(s, uid, supportId, upgrade = "none") {
  const A = s.lesson.attach;
  A.cur = { uid, supportId, turn: s.lesson.turn, upgrade };
  A.log.push({ turn: s.lesson.turn, supportId, uid, cardId: lesson.lessonEntry(s, uid).cardId, played: false });
}
/** 다음 턴에 붙도록 하고 그 턴 손패 = uids (뽑을 더미 맨 앞) 로 만든 뒤 턴을 끝낸다 → 붙은 cur */
function attachNextTurn(s, uids, { count = {} } = {}) {
  const L = s.lesson;
  L.attach.turns = [L.turn + 1];
  L.attach.count = { ...count };
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.drawPile.unshift(...uids);
  lesson.endLessonTurn(s, DA);
  return s.lesson.attach.cur;
}
const uidsOf = (s, cardId) => s.deck.filter((e) => e.cardId === cardId).map((e) => e.uid);
/** 첫 실패 판정은 통과 (≥ 0.96), 둘째 수 조건 */
const SAFE_THEN = (pred) => rngWhere((r) => r.next() >= 0.96 && pred(r.next()));
const HINT_YES = SAFE_THEN((x) => x < 0.5);
const HINT_NO = SAFE_THEN((x) => x >= 0.5);
const LUMI_YES = SAFE_THEN((x) => x < 0.25);
const LUMI_NO = SAFE_THEN((x) => x >= 0.25);
const FAIL_INJURY = rngWhere((r) => r.next() < 0.25 && r.next() < 0.5);
/** 능력 테스트용: 고정 구역 · 체력 100 · 손패 지정 · 사용 2번 */
function abilityState(supportId, hand, { extra = [], layout = LAYOUT, supports } = {}) {
  const s = full(startA({ supports: supports || [supportId], extra }));
  setZones(s, layout);
  const uids = hand.map((id) => uidOf(s, id));
  forceHand(s, uids);
  s.lesson.playsLeft = 2;
  return { s, L: s.lesson, uids };
}
const bondOf = (s, id) => s.supports.find((x) => x.id === id).bond;

test("§15.1 ① 붙을 턴: 레슨 시작에 count.min~max 개 (C3: 4~5) · 서로 다른 턴 · 오름차순 · 같은 rngState → 같은 턴 · 코치 · 카드", () => {
  const seen = new Set();
  const { min: cMin, max: cMax } = DA.lesson.attach.count;
  for (let seed = 1; seed <= 300; seed++) {
    const s = startA({ seed });
    const { turns } = s.lesson.attach;
    assert.ok(turns.length >= cMin && turns.length <= Math.min(cMax, s.lesson.turns), `seed ${seed}: ${turns}`);
    assert.equal(new Set(turns).size, turns.length);
    assert.deepEqual(turns, turns.slice().sort((a, b) => a - b));
    assert.ok(turns.every((t) => Number.isInteger(t) && t >= 1 && t <= s.lesson.turns));
    seen.add(turns.length);
    // 1턴이 붙을 턴이면 시작 fx 에 attach (draw 뒤)
    const fxT = s.lesson.lastFx.map((x) => x.t);
    if (turns.includes(1)) {
      assert.deepEqual(fxT, ["scatter", "draw", "attach"], `seed ${seed}`);
      assert.ok(s.lesson.hand.includes(s.lesson.attach.cur.uid));
      assert.equal(s.lesson.stats.attaches, 1);
    } else {
      assert.deepEqual(fxT, ["scatter", "draw"]);
      assert.equal(s.lesson.attach.cur, null);
    }
  }
  assert.deepEqual([...seen].sort(), Array.from({ length: cMax - cMin + 1 }, (_, i) => cMin + i));
  // 결정성: 같은 시드 → 같은 상태 (턴 끝까지)
  const runIt = () => {
    const s = startA({ seed: 42 });
    for (let i = 0; i < 6 && s.lesson.status === "playing"; i++) lesson.endLessonTurn(s, DA);
    return s;
  };
  const a = runIt();
  assert.equal(JSON.stringify(a), JSON.stringify(runIt()));
  assert.equal(a.lesson.attach.log.length, a.lesson.attach.turns.length, "끝까지 간 레슨은 붙을 턴마다 1번씩 붙었다");
  assert.equal(a.lesson.stats.attaches, a.lesson.attach.log.length);
  assert.equal(a.lesson.attach.cur, null, "레슨 끝 → 떨어진다");
});

test("§15.1 ① 코치 없음 · enabled false · attach 없는 데이터 → rng 소비가 예전과 같다", () => {
  const NOATT = loadData();
  delete NOATT.lesson.attach;
  for (const seed of [1, 7, 99]) {
    const ref = lesson.startLesson(makeState({ seed }), NOATT, { zone: "pass" });
    const noCoach = makeState({ seed });
    noCoach.supports = [];
    lesson.startLesson(noCoach, DA, { zone: "pass" });
    const off = lesson.startLesson(makeState({ seed }), data, { zone: "pass" }); // data = enabled false
    for (const s of [noCoach, off]) {
      assert.equal(s.rngState, ref.rngState, `seed ${seed}`);
      assert.deepEqual([s.lesson.drawPile, s.lesson.hand, s.lesson.zones], [ref.lesson.drawPile, ref.lesson.hand, ref.lesson.zones]);
      assert.deepEqual(s.lesson.attach, { turns: [], cur: null, count: {}, log: [], hints: [] });
    }
    // 코치가 있으면 붙을 턴을 정하느라 rng 를 더 쓴다
    assert.notEqual(startA({ seed }, { zone: "pass" }).lesson.attach.turns.length, 0);
  }
});

test("§15.1 ② 코치 고르기: 레어도 가중 SSR 3 · SR 2 · R 1 (±3%p) · 이번 레슨에 붙은 코치 ×0.5", () => {
  const N = 2000;
  const tally = {};
  for (let seed = 1; seed <= N; seed++) {
    const s = startA({ seed, deckIds: ["cd_basic", "cd_basic", "cd_basic", "cd_basic"] }); // 기본 편성 6명: 하르나 · 오르넬라 SSR, 셀리아 · 바르바라 · 루미 SR, 한나 R
    const cur = attachNextTurn(s, uidsOf(s, "cd_basic").slice(0, 3));
    tally[cur.supportId] = (tally[cur.supportId] || 0) + 1;
  }
  const want = { sp_coach_harr: 3, sp_elder_sage: 3, sp_wind_dancer: 2, sp_iron_captain: 2, sp_bard_lumi: 2, sp_mountain_monk: 1 };
  for (const [id, w] of Object.entries(want)) {
    const got = (tally[id] || 0) / N;
    assert.ok(Math.abs(got - w / 13) <= 0.03, `${id}: ${got.toFixed(3)} vs ${(w / 13).toFixed(3)}`);
  }
  // 반복 ×0.5: 하르나가 이미 붙었으면 하르나 1.5 : 오르넬라 3 → 33%
  let harr = 0;
  for (let seed = 1; seed <= N; seed++) {
    const s = startA({ seed, deckIds: ["cd_basic", "cd_basic", "cd_basic", "cd_basic"], supports: ["sp_coach_harr", "sp_elder_sage"] });
    if (attachNextTurn(s, uidsOf(s, "cd_basic").slice(0, 3), { count: { sp_coach_harr: 1 } }).supportId === "sp_coach_harr") harr += 1;
  }
  assert.ok(Math.abs(harr / N - 1 / 3) <= 0.03, `반복 ×0.5: ${harr / N}`);
});

test("§15.1 ② 카드 고르기: needs (power · fail) 로 거른다 · 자기 코치 카드 ×3 · 후보가 없으면 다음 턴으로 미룬다", () => {
  const deckIds = ["cd_hojo_up", "cd_icing", "cd_tactics_board", "cd_basic", "cd_c_barbara", "cd_c_harr", "cd_coaching"];
  for (let seed = 1; seed <= 40; seed++) {
    // 하르나 (needs power): 대상 없음 · 회복 단일에는 붙지 않는다
    let s = full(startA({ seed, deckIds, supports: ["sp_coach_harr"] }));
    let cur = attachNextTurn(s, [uidOf(s, "cd_hojo_up"), uidOf(s, "cd_icing"), uidOf(s, "cd_basic")]);
    assert.equal(cur.uid, uidOf(s, "cd_basic"), `seed ${seed}: 하르나`);
    // 바르바라 (needs fail): 이미 실패 없는 카드 (방벽 훈련) 에는 붙지 않는다 — 자기 코치 카드여도
    s = full(startA({ seed, deckIds, supports: ["sp_iron_captain"] }));
    cur = attachNextTurn(s, [uidOf(s, "cd_c_barbara"), uidOf(s, "cd_basic"), uidOf(s, "cd_tactics_board")]);
    assert.equal(cur.uid, uidOf(s, "cd_basic"), `seed ${seed}: 바르바라`);
    // 셀리아 (needs 없음): 대상 없는 카드에도 붙는다
    s = full(startA({ seed, deckIds, supports: ["sp_wind_dancer"] }));
    cur = attachNextTurn(s, [uidOf(s, "cd_hojo_up"), uidOf(s, "cd_icing"), uidOf(s, "cd_tactics_board")]);
    assert.ok(cur && s.lesson.hand.includes(cur.uid), `seed ${seed}: 셀리아`);
  }
  // 후보가 없으면 다음 턴으로 미룬다 (rng 를 쓰지 않는다), 마지막 턴이면 없어진다
  const s = full(startA({ seed: 3, deckIds, supports: ["sp_coach_harr"] }));
  const turn0 = s.lesson.turn;
  const cur = attachNextTurn(s, [uidOf(s, "cd_hojo_up"), uidOf(s, "cd_icing"), uidOf(s, "cd_tactics_board")]);
  assert.equal(cur, null);
  assert.deepEqual(s.lesson.attach.turns, [turn0 + 1, turn0 + 2]);
  assert.deepEqual(s.lesson.attach.log, []);
  assert.ok(!s.lesson.lastFx.some((x) => x.t === "attach"));
  s.lesson.turn = s.lesson.turns - 1;
  const cur2 = attachNextTurn(s, [uidOf(s, "cd_hojo_up"), uidOf(s, "cd_icing"), uidOf(s, "cd_tactics_board")]);
  assert.equal(cur2, null);
  assert.deepEqual(s.lesson.attach.turns, [s.lesson.turns], "마지막 턴 뒤로는 미루지 않는다");
  // 자기 코치 카드 ×3: [인터벌 슈팅, 기초 훈련, 개인 지도] → 3 / 5
  const N = 2000;
  let own = 0;
  for (let seed = 1; seed <= N; seed++) {
    const t = full(startA({ seed, deckIds, supports: ["sp_coach_harr"] }));
    if (attachNextTurn(t, [uidOf(t, "cd_c_harr"), uidOf(t, "cd_basic"), uidOf(t, "cd_coaching")]).uid === uidOf(t, "cd_c_harr")) own += 1;
  }
  assert.ok(Math.abs(own / N - 0.6) <= 0.035, `자기 코치 카드: ${own / N}`);
});

test("§15.2 이번 턴만 한 단계 강화: 강화 전 → 강화판 (뷰 · 미리보기 · 실제 같음, 비용 그대로) · 강화판 → 위력 ×1.2 · 효과 카드 강화판 → none · 덱 그대로", () => {
  const FW = ["cd_fw_drill", "cd_fw_drill", "cd_fw_drill"];
  // 강화 전 중간 원 18 → 강화판 23
  let s = full(startA({ seed: 5, deckIds: FW, supports: ["sp_wind_dancer"] }));
  let cur = attachNextTurn(s, s.deck.map((e) => e.uid));
  assert.equal(cur.upgrade, "plus");
  setZones(s);
  let v = lesson.getLessonView(s, DA).hand.find((h) => h.uid === cur.uid);
  assert.deepEqual([v.plus, v.power, v.cost, v.desc], [true, 23, 11, "중간 원 · 1인 23"]);
  assert.deepEqual(v.attach, { supportId: "sp_wind_dancer", name: "무희 셀리아", short: "셀리아", color: "#7ed957", coachType: "dribble",
    abilityName: "바람의 스텝", abilityText: "다음 턴 손패 +1", upgrade: "plus" });
  const other = lesson.getLessonView(s, DA).hand.find((h) => h.uid !== cur.uid);
  assert.deepEqual([other.plus, other.power, other.attach], [false, 18, null]);
  let pv = lesson.previewCard(s, DA, { uid: cur.uid, at: C.pass });
  for (const t of pv.targets) assert.deepEqual([t.gain, t.cost, t.attachMult], [R(23 * P(s, t.id).growth[t.zone] * GS), 11, 1], t.id);
  const before = Object.fromEntries(s.players.map((p) => [p.id, p.stats.pass]));
  s.rngState = SAFE;
  s.lesson.playsLeft = 2; // 턴이 끝나지 않게 (기본 훈련이 섞이지 않는다)
  lesson.playCard(s, DA, { uid: cur.uid, at: C.pass });
  for (const t of pv.targets) assert.equal(P(s, t.id).stats.pass - before[t.id], t.gain, `${t.id} 실제 = 미리보기`);
  assert.ok(s.deck.every((e) => e.plus === false), "덱의 plus 는 바뀌지 않는다");

  // 이미 강화판 → 위력 ×1.2 (focus 몫 전), 비용 그대로
  s = full(startA({ seed: 5, deckIds: FW, supports: ["sp_wind_dancer"] }));
  for (const e of s.deck) e.plus = true;
  cur = attachNextTurn(s, s.deck.map((e) => e.uid));
  assert.equal(cur.upgrade, "pct");
  setZones(s);
  v = lesson.getLessonView(s, DA).hand.find((h) => h.uid === cur.uid);
  assert.deepEqual([v.plus, v.power, v.cost], [true, R(23 * 1.2), 11]);
  pv = lesson.previewCard(s, DA, { uid: cur.uid, at: C.pass });
  for (const t of pv.targets) assert.equal(t.gain, R(23 * 1.2 * P(s, t.id).growth[t.zone] * GS), t.id);
  s.lesson.buffs.focus = 2; // 집중 몫은 ×1.2 뒤에 더한다
  pv = lesson.previewCard(s, DA, { uid: cur.uid, at: C.pass });
  for (const t of pv.targets) assert.equal(t.gain, R((23 * 1.2 + (2 * 6) / 2) * P(s, t.id).growth[t.zone] * GS), `${t.id} 집중`);

  // 효과 카드 강화판 → none (강화 없음, 능력만)
  s = full(startA({ seed: 5, deckIds: ["cd_tactics_board", "cd_tactics_board", "cd_tactics_board"], supports: ["sp_wind_dancer"] }));
  for (const e of s.deck) e.plus = true;
  cur = attachNextTurn(s, s.deck.map((e) => e.uid));
  assert.equal(cur.upgrade, "none");
  v = lesson.getLessonView(s, DA).hand.find((h) => h.uid === cur.uid);
  assert.deepEqual([v.power, v.desc], [null, "다음 턴 손패 +2, 추가 사용 +1"]);
  // 효과 카드 강화 전 → 강화판 효과 (전술 보드+ = 손패 +2) + 셀리아 +1
  s = full(startA({ seed: 5, deckIds: ["cd_tactics_board", "cd_tactics_board", "cd_tactics_board"], supports: ["sp_wind_dancer"] }));
  cur = attachNextTurn(s, s.deck.map((e) => e.uid));
  assert.equal(cur.upgrade, "plus");
  lesson.playCard(s, DA, { uid: cur.uid });
  assert.equal(s.lesson.drawNext, 2 + 1);
});

test("§15.1 ③ 떨어지기: 턴 끝 (안 냈다) · 낸 뒤 · 부상으로 그 고유 카드가 빠짐 · 레슨 끝", () => {
  // 턴 끝
  let s = full(startA({ seed: 9, deckIds: ["cd_fw_drill", "cd_fw_drill", "cd_fw_drill", "cd_basic", "cd_basic", "cd_basic"], supports: ["sp_wind_dancer"] }));
  const cur = attachNextTurn(s, uidsOf(s, "cd_fw_drill"));
  assert.ok(cur);
  s.lesson.attach.turns = [];
  lesson.endLessonTurn(s, DA);
  assert.equal(s.lesson.attach.cur, null);
  assert.ok(lesson.getLessonView(s, DA).hand.every((h) => h.attach === null && h.plus === false), "강화도 사라진다");
  assert.deepEqual(s.lesson.attach.log.map((x) => x.played), [...s.lesson.attach.log.map(() => false)]);
  // 낸 뒤
  let r = abilityState("sp_wind_dancer", ["cd_basic", "cd_coaching"]);
  attachTo(r.s, r.uids[0], "sp_wind_dancer");
  r.s.rngState = SAFE;
  lesson.playCard(r.s, DA, { uid: r.uids[0] });
  assert.equal(r.L.attach.cur, null);
  assert.equal(r.L.attach.log.at(-1).played, true);
  // 부상: 타리아(p5) 고유 카드에 붙어 있다가 p5 가 다쳐 그 카드가 빠진다
  r = abilityState("sp_wind_dancer", ["cd_coaching", "cd_u_taria"]);
  attachTo(r.s, r.uids[1], "sp_wind_dancer", "plus");
  P(r.s, "p5").stamina = 10;
  r.s.rngState = FAIL_INJURY;
  lesson.playCard(r.s, DA, { uid: r.uids[0], playerId: "p5" });
  assert.ok(r.L.out.includes("p5") && r.L.removed.includes(r.uids[1]));
  assert.equal(r.L.attach.cur, null);
  // 레슨 끝
  s = full(startA({ seed: 9, supports: ["sp_wind_dancer"] }));
  attachTo(s, s.lesson.hand[0], "sp_wind_dancer");
  s.lesson.turn = s.lesson.turns;
  lesson.endLessonTurn(s, DA);
  assert.notEqual(s.lesson.status, "playing");
  assert.equal(s.lesson.attach.cur, null);
});

test("§15.4 하르나: 슈팅 구역에 선 대상 ×1.5 (attachMult) · 미리보기 노트 · 컷인 fx 맨 앞 · 유대 +5 · 기록", () => {
  const { s, L, uids } = abilityState("sp_coach_harr", ["cd_fw_drill", "cd_basic"], { extra: ["cd_fw_drill"], layout: { ...LAYOUT, p7: "shoot" } });
  attachTo(s, uids[0], "sp_coach_harr");
  let pv = lesson.previewCard(s, DA, { uid: uids[0], at: C.shoot });
  assert.deepEqual(pv.targets.map((t) => [t.id, t.attachMult]), [["p6", 1.5], ["p7", 1.5]]);
  for (const t of pv.targets) assert.equal(t.gain, R(18 * P(s, t.id).growth.shoot * 1.5 * GS), t.id);
  assert.equal(pv.notes[0], "하르나 지원 · 슈팅 구역 ×1.5");
  assert.deepEqual(pv.attach, { supportId: "sp_coach_harr", name: "골문을 보는 눈", text: "슈팅 구역 대상 +50%", upgrade: "none", effects: [], note: "하르나 지원 · 슈팅 구역 ×1.5" });
  // 슈팅 구역이 아니면 ×1
  const pv2 = lesson.previewCard(s, DA, { uid: uids[0], at: C.pass });
  for (const t of pv2.targets) assert.deepEqual([t.attachMult, t.gain], [1, R(18 * P(s, t.id).growth.pass * GS)], t.id);
  // 붙지 않은 카드의 미리보기에는 없다
  const pv3 = lesson.previewCard(s, DA, { uid: uids[1] });
  assert.equal(pv3.attach, null);
  assert.ok(pv3.targets.every((t) => t.attachMult === 1));
  const harr0 = bondOf(s, "sp_coach_harr");
  const st0 = { p6: P(s, "p6").stats.shoot, p7: P(s, "p7").stats.shoot };
  s.rngState = SAFE;
  lesson.playCard(s, DA, { uid: uids[0], at: C.shoot });
  for (const t of pv.targets) assert.equal(P(s, t.id).stats.shoot - st0[t.id], t.gain, t.id);
  assert.deepEqual(L.lastFx[0], { t: "cutin", supportId: "sp_coach_harr", uid: uids[0], cardId: "cd_fw_drill", coach: "코치 하르나", name: "골문을 보는 눈", text: "슈팅 구역 대상 +50%", repeat: 0 });
  assert.equal(L.lastFx[1].t, "cost");
  assert.equal(bondOf(s, "sp_coach_harr"), harr0 + 5);
  assert.ok(L.lastFx.some((x) => x.t === "bond" && x.supportId === "sp_coach_harr" && x.n === 5));
  assert.deepEqual([L.stats.cutins, L.attach.cur, L.attach.log.at(-1).played], [1, null, true]);
  const res = lesson.lessonResult(s, DA);
  assert.deepEqual(res.cutins, [{ supportId: "sp_coach_harr", name: "코치 하르나", cardId: "cd_fw_drill", cardName: "FW 라인 드릴", turn: L.turn }]);
  assert.equal(lesson.getLessonView(s, DA).cutins, 1);
});

test("§15.4 셀리아 · 오르넬라 · 이레네: 다음 턴 손패 +1 · 팀워크 +3 · 50% 힌트 · 다음 카드 +30%", () => {
  // 셀리아
  let r = abilityState("sp_wind_dancer", ["cd_basic", "cd_coaching"]);
  attachTo(r.s, r.uids[0], "sp_wind_dancer");
  assert.equal(lesson.previewCard(r.s, DA, { uid: r.uids[0] }).notes[0], "셀리아 지원 · 다음 턴 손패 +1");
  r.s.rngState = SAFE;
  lesson.playCard(r.s, DA, { uid: r.uids[0] });
  assert.equal(r.L.drawNext, 1);
  // 오르넬라: 단일 카드라 L10 팀워크 없음 → +3 은 능력 몫, 힌트 50%
  for (const [state, want] of [[HINT_YES, ["sp_elder_sage"]], [HINT_NO, []]]) {
    r = abilityState("sp_elder_sage", ["cd_coaching", "cd_basic"]);
    attachTo(r.s, r.uids[0], "sp_elder_sage");
    assert.equal(lesson.previewCard(r.s, DA, { uid: r.uids[0], playerId: "p4" }).notes[0], "오르넬라 지원 · 팀워크 +3 · 힌트 50%");
    const tw0 = r.s.teamwork;
    r.s.rngState = state;
    lesson.playCard(r.s, DA, { uid: r.uids[0], playerId: "p4" });
    assert.equal(r.s.teamwork - tw0, 3);
    assert.deepEqual(r.L.attach.hints, want);
    assert.equal(r.L.lastFx.some((x) => x.t === "hint" && x.supportId === "sp_elder_sage" && x.src === "cutin"), want.length > 0);
    assert.deepEqual(lesson.lessonResult(r.s, DA).cutinHints, want);
  }
  // 이레네: 이 카드의 버프 소비 뒤에 걸리므로 다음 카드에 +30%
  r = abilityState("sp_river_scholar", ["cd_coaching", "cd_basic"], { supports: ["sp_river_scholar"] });
  attachTo(r.s, r.uids[0], "sp_river_scholar");
  assert.equal(lesson.previewCard(r.s, DA, { uid: r.uids[0], playerId: "p4" }).notes[0], "이레네 지원 · 다음 카드 +30%");
  r.s.rngState = SAFE;
  lesson.playCard(r.s, DA, { uid: r.uids[0], playerId: "p4" });
  assert.equal(r.L.buffs.nextPct, 0.3);
  const pv = lesson.previewCard(r.s, DA, { uid: r.uids[1] });
  assert.equal(pv.targets.find((t) => t.id === "p4").gain, R(6 * P(r.s, "p4").growth.pass * 1.3 * GS));
});

test("§15.4 바르바라 · 한나 · 루미: 실패 판정 없음 · 대상 전원 체력 +10 · 25% 컨디션 +1 (0~4)", () => {
  // 바르바라: 지친 대상이어도 실패율 0, 실패할 rng 여도 실패 없음
  let r = abilityState("sp_iron_captain", ["cd_fw_drill", "cd_basic"], { extra: ["cd_fw_drill"] });
  for (const id of ["p4", "p5"]) P(r.s, id).stamina = 15;
  assert.ok(lesson.previewCard(r.s, DA, { uid: r.uids[0], at: C.pass }).failRate > 0, "붙기 전에는 실패율이 있다");
  attachTo(r.s, r.uids[0], "sp_iron_captain");
  const pvB = lesson.previewCard(r.s, DA, { uid: r.uids[0], at: C.pass });
  assert.deepEqual([pvB.failRate, pvB.failerId, pvB.notes[0]], [0, null, "바르바라 지원 · 실패 없음"]);
  r.s.rngState = FAIL_NO_INJURY;
  lesson.playCard(r.s, DA, { uid: r.uids[0], at: C.pass });
  assert.equal(r.L.stats.fails, 0);
  assert.ok(!r.L.lastFx.some((x) => x.t === "fail"));
  // 한나: 대상 (p4 p5) 체력 −11 +10, 대상 밖은 그대로
  r = abilityState("sp_mountain_monk", ["cd_fw_drill", "cd_basic"], { extra: ["cd_fw_drill"] });
  for (const p of r.s.players) p.stamina = 50;
  attachTo(r.s, r.uids[0], "sp_mountain_monk");
  assert.equal(lesson.previewCard(r.s, DA, { uid: r.uids[0], at: C.pass }).notes[0], "한나 지원 · 대상 체력 +10");
  r.s.rngState = SAFE;
  lesson.playCard(r.s, DA, { uid: r.uids[0], at: C.pass });
  for (const p of r.s.players) assert.equal(p.stamina, ["p4", "p5"].includes(p.id) ? 50 - 11 + 10 : 50, p.id);
  // 루미: 전체 카드 (실패 판정 1번) 뒤 25%
  for (const [state, cond0, want, fxWant] of [[LUMI_YES, 2, 3, true], [LUMI_NO, 2, 2, false], [LUMI_YES, 4, 4, false], [LUMI_YES, 0, 1, true]]) {
    r = abilityState("sp_bard_lumi", ["cd_basic", "cd_coaching"]);
    r.s.condition = cond0;
    attachTo(r.s, r.uids[0], "sp_bard_lumi");
    assert.equal(lesson.previewCard(r.s, DA, { uid: r.uids[0] }).notes[0], "루미 지원 · 컨디션 +1 25%");
    r.s.rngState = state;
    lesson.playCard(r.s, DA, { uid: r.uids[0] });
    assert.equal(r.s.condition, want, `컨디션 ${cond0}`);
    assert.equal(r.L.lastFx.some((x) => x.t === "condition" && x.n === 1 && x.src === "cutin"), fxWant);
  }
});

test("§15.4 조이: 점수가 목표 미만이면 ×1.5 (카드 underdog 과 따로 곱한다) · 자기 코치 카드면 유대 +8 +5", () => {
  const sup = ["sp_street_striker"];
  let r = abilityState("sp_street_striker", ["cd_coaching", "cd_basic"], { supports: sup });
  attachTo(r.s, r.uids[0], "sp_street_striker");
  let pv = lesson.previewCard(r.s, DA, { uid: r.uids[0], playerId: "p4" });
  assert.deepEqual([pv.targets[0].attachMult, pv.targets[0].gain], [1.5, R(35 * P(r.s, "p4").growth.pass * 1.5 * GS)]);
  assert.equal(pv.notes[0], "조이 지원 · 목표 미만 ×1.5");
  r.L.score = r.L.target;
  pv = lesson.previewCard(r.s, DA, { uid: r.uids[0], playerId: "p4" });
  assert.deepEqual([pv.targets[0].attachMult, pv.targets[0].gain], [1, R(35 * P(r.s, "p4").growth.pass * GS)]);
  assert.equal(pv.notes[0], "조이 지원 · 목표 이상이라 효과 없음");
  // 골목 슈팅 (작은 원, underdog 0.5) + 조이 능력 → ×1.5 × 1.5, 슈팅 구역 코치 ×1.3
  r = abilityState("sp_street_striker", ["cd_c_joy", "cd_basic"], { supports: sup, extra: ["cd_c_joy"] });
  attachTo(r.s, r.uids[0], "sp_street_striker");
  pv = lesson.previewCard(r.s, DA, { uid: r.uids[0], at: C.shoot });
  assert.deepEqual(pv.targets.map((t) => t.id), ["p6"]);
  assert.equal(pv.targets[0].gain, R(24 * P(r.s, "p6").growth.shoot * 1.5 * 1.5 * 1.3 * GS));
  const b0 = bondOf(r.s, "sp_street_striker");
  r.s.rngState = SAFE;
  lesson.playCard(r.s, DA, { uid: r.uids[0], at: C.shoot });
  assert.equal(bondOf(r.s, "sp_street_striker"), b0 + 8 + 5, "코치 카드 +8 · 지원 +5");
});

test("§15.4 컷인 repeat 셈 · 카드가 실패해도 능력 발동 · 뷰 attach · JSON 왕복 · attach 없는 저장본 · 뷰 · 미리보기 순수", () => {
  const { s, L, uids } = abilityState("sp_coach_harr", ["cd_basic", "cd_coaching", "cd_fw_drill"], { extra: ["cd_fw_drill"], supports: ["sp_coach_harr", "sp_bard_lumi"] });
  L.playsLeft = 3;
  attachTo(s, uids[0], "sp_coach_harr", "plus");
  // 뷰: 붙은 코치 · 칩
  const before = JSON.stringify(s);
  const v = lesson.getLessonView(s, DA);
  assert.deepEqual(v.attach, { uid: uids[0], supportId: "sp_coach_harr", name: "코치 하르나", short: "하르나", color: "#ff7a3d", coachType: "shoot",
    ability: { name: "골문을 보는 눈", text: "슈팅 구역 대상 +50%" }, upgrade: "plus" });
  assert.equal(v.hand[0].attach.short, "하르나");
  assert.deepEqual([v.hand[0].power, v.hand[0].plus], [8, true]);
  lesson.previewCard(s, DA, { uid: uids[0] });
  lesson.previewCard(s, DA, { uid: uids[2], at: C.shoot });
  lesson.dropCandidates(s, DA, { uid: uids[0] });
  lesson.lessonResult(s, DA);
  assert.equal(JSON.stringify(s), before, "뷰 · 미리보기 · 후보 점 · 결과는 상태 · rngState 를 바꾸지 않는다");
  // JSON 왕복: 같은 결과
  const c = clone(s);
  assert.deepEqual(lesson.getLessonView(c, DA), v);
  s.rngState = SAFE;
  c.rngState = SAFE;
  lesson.playCard(s, DA, { uid: uids[0] });
  lesson.playCard(c, DA, { uid: uids[0] });
  assert.equal(JSON.stringify(c), JSON.stringify(s));
  assert.equal(L.lastFx[0].repeat, 0);
  // 두 번째 컷인 (루미) — 실패한 카드여도 능력은 발동
  attachTo(s, uids[1], "sp_bard_lumi");
  P(s, "p4").stamina = 10;
  s.condition = 2;
  s.rngState = rngWhere((r) => r.next() < 0.25 && r.next() >= 0.5 && r.next() < 0.25); // 실패 · 부상 없음 · 컨디션
  lesson.playCard(s, DA, { uid: uids[1], playerId: "p4" });
  assert.ok(L.lastFx.some((x) => x.t === "fail"));
  assert.deepEqual([L.lastFx[0].t, L.lastFx[0].repeat, s.condition], ["cutin", 1, 3]);
  assert.equal(L.stats.cutins, 2);
  assert.equal(lesson.lessonResult(s, DA).cutins.length, 2);

  // attach 가 없는 저장본 (C1 전): 붙기 없음으로 읽는다
  const old = abilityState("sp_coach_harr", ["cd_basic", "cd_coaching"]).s;
  delete old.lesson.attach;
  delete old.lesson.stats.attaches;
  delete old.lesson.stats.cutins;
  const ov = lesson.getLessonView(old, DA);
  assert.deepEqual([ov.attach, ov.cutins, ov.hand.every((h) => h.attach === null)], [null, 0, true]);
  assert.deepEqual(lesson.lessonResult(old, DA).cutins, []);
  old.rngState = SAFE;
  lesson.playCard(old, DA, { uid: old.lesson.hand[0] });
  for (let i = 0; i < 8 && old.lesson.status === "playing"; i++) lesson.endLessonTurn(old, DA);
  assert.deepEqual(old.lesson.attach.log, [], "이번 레슨은 붙기 없음");
});

test("§15 퍼즈: 붙기 켠 레슨 100판 (코치 8명) — 붙을 턴마다 1번 · 컷인 = 낸 붙은 카드 · 결정성 · JSON 왕복 · 능력 8개 모두 발동", () => {
  const pool = cards.cardList(DA).filter((c) => c.family === "common" || c.family === "team" || c.family === "coach").map((c) => c.id);
  const fired = new Set();
  let cutins = 0;
  let attaches = 0;
  const playLesson = (seed, zone) => {
    const r = createRngFromState((seed * 7919 + zone.length) >>> 0);
    let s = makeState({ seed, deckIds: pool });
    s.supports = ALL_COACHES.map((id) => SUP(id, r.int(0, 100)));
    for (const p of s.players) p.stamina = r.int(30, 100);
    lesson.startLesson(s, DA, { zone });
    const allUids = s.deck.map((e) => e.uid).sort();
    for (let step = 0; step < 300 && s.lesson.status === "playing"; step++) {
      const where = `seed ${seed} ${zone} #${step}`;
      const L = s.lesson;
      if (L.attach.cur) assert.ok(L.hand.includes(L.attach.cur.uid) || L.removed.includes(L.attach.cur.uid), `${where}: 붙은 카드는 손패에`);
      const v = lesson.getLessonView(s, DA);
      const playable = v.hand.filter((h) => h.playable);
      if (!playable.length || r.chance(0.15)) {
        lesson.endLessonTurn(s, DA);
      } else {
        const h = r.pick(playable);
        const c = r.pick(lesson.dropCandidates(s, DA, { uid: h.uid }));
        const args = { uid: h.uid, at: c.at || undefined, playerId: c.playerId };
        const pv = lesson.previewCard(s, DA, args);
        assert.ok(pv.ok, `${where}: ${pv.reason}`);
        const wasAttached = L.attach.cur && L.attach.cur.uid === h.uid ? L.attach.cur.supportId : null;
        assert.equal(!!pv.attach, !!wasAttached, `${where}: 미리보기 attach`);
        if (wasAttached) assert.equal(pv.notes[0], pv.attach.note);
        lesson.playCard(s, DA, args);
        const fx = s.lesson.lastFx;
        assert.equal(fx.filter((x) => x.t === "cutin").length, wasAttached ? 1 : 0, `${where}: 컷인`);
        if (wasAttached) {
          assert.deepEqual([fx[0].t, fx[0].supportId], ["cutin", wasAttached], `${where}: 컷인 맨 앞`);
          fired.add(wasAttached);
        }
      }
      checkInvariants(s, allUids, where);
      s = clone(s);
    }
    return s;
  };
  for (let seed = 1; seed <= 20; seed++) {
    for (const zone of zones.ZONE_IDS) {
      const s = playLesson(seed, zone);
      const L = s.lesson;
      const A = L.attach;
      assert.ok(A.turns.length >= 2 && A.turns.length <= 4 + 1, `${seed} ${zone}: ${A.turns}`);
      assert.deepEqual(A.log.map((x) => x.turn), A.turns.filter((t) => t <= L.turn), `${seed} ${zone}: 붙을 턴마다 1번`);
      assert.equal(L.stats.attaches, A.log.length);
      assert.equal(L.stats.cutins, A.log.filter((x) => x.played).length);
      assert.equal(A.cur, null);
      cutins += L.stats.cutins;
      attaches += L.stats.attaches;
      if (seed <= 2) assert.equal(JSON.stringify(playLesson(seed, zone)), JSON.stringify(s), "결정성");
    }
  }
  assert.deepEqual([...fired].sort(), ALL_COACHES.slice().sort(), "능력 8개 모두 발동");
  assert.ok(attaches >= 200 && cutins > 0, `attaches ${attaches} · cutins ${cutins}`);
});

// ---------------------------------------------------------------------------
// L40 고유 카드 모양 (LESSON_PROTO_PLAN §16.3 ③ · ④ · §16.4 · §16.5)
// ---------------------------------------------------------------------------

/** 상승 기대값: round(1인 위력 × 성장률 × 중점 배율 × 모양 배율 × 0.64) (컨디션 2 · 효율 0 = ×1) */
const wantGain = (s, id, zone, power, mult = 1) => R(power * P(s, id).growth[zone] * lesson.zoneMult(s.lesson, data, zone) * mult * GS);
const MIRKA = () => ({ ...data.config.defaultSquad.slots, FW2: "ch_cat_trickster" });
/** 중점 = 슈팅 (픽스처에서 슈팅은 p6 한 명), 체력 100, 손패 = [card, cd_basic], 사용 2번 */
/** L40 고유 카드 수치 (U2 보정값 — 데이터에서 읽는다): 1인 위력 · 강화판 위력 · 1인 비용 */
const UPOW = (id) => cards.getCard(data, id).power;
const UPLUS = (id) => cards.getCard(data, id).plus.power;
const UCOST = (id) => R(UPOW(id) * cards.getCard(data, id).costRate);

function shapeState(cardId, { layout = LAYOUT, squad, zone = "shoot", policy = "team", extra = [] } = {}) {
  const s = full(start({ squad, policy, extra }, { zone }));
  setZones(s, layout);
  const uid = uidOf(s, cardId);
  forceHand(s, [uid, uidOf(s, "cd_basic")]);
  s.lesson.playsLeft = 2;
  return { s, L: s.lesson, uid };
}
const gainFx = (s) => s.lesson.lastFx.filter((x) => x.t === "gain").map((x) => [x.id, x.stat, x.n]);
const costFx = (s) => s.lesson.lastFx.filter((x) => x.t === "cost" && !x.src).map((x) => [x.id, x.n]);
const pvRows = (pv) => pv.targets.map((t) => [t.id, t.stat, t.gain]);

test("L40 이어 주기 · 연결: 주인 + 받는 선수 (×1.3 · ×1.5) · 비용 둘 다 · fx cost → pass → gain · L10 팀워크 · 미리보기 = 실제 · 선 · 노트", () => {
  const { s, L, uid } = shapeState("cd_u_neria");
  P(s, "p1").stamina = 50;
  const pos = posOf(s);
  // 입력 없음 → ok:false 이지만 모양 블록은 준다 (선 없음)
  const pv0 = lesson.previewCard(s, data, { uid });
  assert.deepEqual([pv0.ok, pv0.reason, pv0.shape.kind, pv0.shape.ownerId, pv0.shape.line], [false, "받을 선수 위에 놓으세요", "link", "p1", null]);
  // 빈 자리 위: 주인 → 놓은 점 선 (ok:false)
  const pvAir = lesson.previewCard(s, data, { uid, at: { x: 50, y: 95 } });
  assert.deepEqual([pvAir.ok, pvAir.reason, pvAir.shape.line], [false, "받을 선수 위에 놓으세요", { from: pos.p1, to: { x: 50, y: 95 } }]);
  // 받는 선수 위
  const pv = lesson.previewCard(s, data, { uid, at: pos.p4 });
  assert.equal(pv.ok, true);
  assert.deepEqual(pvRows(pv), [["p1", "defense", wantGain(s, "p1", "defense", 20)], ["p4", "pass", wantGain(s, "p4", "pass", 20, 1.3)]]);
  assert.deepEqual(pv.targets.map((t) => [t.role, t.shapeMult, t.cost]), [["owner", 1, 8], ["recv", 1.3, 8]]);
  assert.deepEqual([pv.shape.receiverId, pv.shape.line], ["p4", { from: pos.p1, to: pos.p4 }]);
  assert.equal(pv.notes[0], "받는 선수 ×1.3");
  assert.ok(!pv.targets.some((t) => "unique15" in t), "unique15 는 지웠다");
  const tw0 = s.teamwork;
  safePlay(s, uid, { at: pos.p4 });
  assert.deepEqual(gainFx(s), pvRows(pv), "미리보기 = 실제");
  const fx = L.lastFx.map((x) => x.t);
  assert.deepEqual(fx.slice(0, 5), ["cost", "cost", "pass", "gain", "gain"]);
  assert.deepEqual(L.lastFx.find((x) => x.t === "pass"), { t: "pass", from: "p1", to: "p4" });
  assert.deepEqual(costFx(s), [["p1", 8], ["p4", 8]]);
  assert.equal(P(s, "p1").stamina, 50 - 8 + 10, "주인 체력 +10 (남긴 효과)");
  assert.equal(s.teamwork - tw0, 1, "L10: 서로 다른 성공 2명 − 1");
  assert.deepEqual(L.targeted, { p1: 1, p4: 1 });
  assert.equal(L.buffs.nextNoFail, false, "지운 효과: 다음 카드 실패 없음");
  // playerId 로도 (연결 ×1.5, 경기장 어디든)
  const k = shapeState("cd_u_silluen");
  const pk = lesson.previewCard(k.s, data, { uid: k.uid, playerId: "p7" });
  assert.deepEqual(pvRows(pk), [["p4", "pass", wantGain(k.s, "p4", "pass", 20)], ["p7", "dribble", wantGain(k.s, "p7", "dribble", 20, 1.5)]]);
  assert.equal(pk.notes[0], "고른 선수 ×1.5");
  safePlay(k.s, k.uid, { playerId: "p7" });
  assert.deepEqual(gainFx(k.s), pvRows(pk));
  assert.equal(k.L.buffs.nextPct, 0, "지운 효과: 다음 카드 +40%");
  // 틀린 받는 선수: 주인 · 벤치
  const b = shapeState("cd_u_silluen");
  lesson.benchPlayer(b.s, data, { playerId: "p6" });
  for (const args of [{ playerId: "p4" }, { playerId: "p6" }, { at: posOf(b.s).p4 }]) {
    const snap = JSON.stringify(b.s);
    assert.equal(lesson.previewCard(b.s, data, { uid: b.uid, ...args }).ok, false, JSON.stringify(args));
    assert.throws(() => lesson.playCard(b.s, data, { uid: b.uid, ...args }), /받을/);
    assert.equal(JSON.stringify(b.s), snap, "거절 뒤 상태 불변");
  }
});

test("L40 크로스: 슈팅 구역 1명과 · 팀워크 +1 (모양) + L10 · 슈팅 구역이 비면 낼 수 없다 (손패 playable false · 턴 시작 다시 뽑기 대상)", () => {
  const { s, L, uid } = shapeState("cd_u_ulrika", { layout: { ...LAYOUT, p7: "shoot" }, zone: "pass" });
  const pos = posOf(s);
  const pv = lesson.previewCard(s, data, { uid, at: pos.p7 });
  assert.deepEqual(pvRows(pv), [["p6", "shoot", wantGain(s, "p6", "shoot", UPOW("cd_u_ulrika"))], ["p7", "shoot", wantGain(s, "p7", "shoot", UPOW("cd_u_ulrika"))]]);
  assert.deepEqual(pv.notes.slice(0, 1), ["팀워크 +1"]);
  assert.deepEqual(lesson.previewCard(s, data, { uid }).reason, "슈팅 구역 선수 위에 놓으세요");
  assert.deepEqual(lesson.previewCard(s, data, { uid, at: pos.p4 }).reason, "슈팅 구역 선수 위에 놓으세요");
  assert.deepEqual(lesson.dropCandidates(s, data, { uid }).map((c) => c.playerId), ["p7"]);
  const tw0 = s.teamwork;
  safePlay(s, uid, { at: pos.p7 });
  assert.deepEqual(gainFx(s), pvRows(pv));
  assert.equal(s.teamwork - tw0, 2, "모양 팀워크 +1 + L10 +1");
  assert.equal(L.buffs.nextPairPct, 0, "지운 효과: 다음 작은 원 +50%");
  // 슈팅 구역에 울리카 혼자: 죽은 카드
  const d = shapeState("cd_u_ulrika");
  const h = lesson.getLessonView(d.s, data).hand[0];
  assert.deepEqual([h.playable, h.deadReason], [false, "슈팅 구역에 받을 선수가 없습니다"]);
  assert.deepEqual(lesson.dropCandidates(d.s, data, { uid: d.uid }), []);
  assert.equal(lesson.previewCard(d.s, data, { uid: d.uid, playerId: "p4" }).reason, "슈팅 구역에 받을 선수가 없습니다");
  assert.throws(() => lesson.playCard(d.s, data, { uid: d.uid, playerId: "p4" }), /슈팅 구역에 받을 선수가 없습니다/);
});

test("L40 주인 둘레 원 · 주인 구역: 철벽 실패 판정 없음 (rng 안 씀) · 타깃맨 주인 ×1.5 · 주장 팀워크 +2 · 원 = 주인 중심", () => {
  // 철벽 스쿼트 (도르비나 p2): 체력이 낮아도 실패율 0, rng 를 쓰지 않는다
  const w = shapeState("cd_u_dorbina");
  P(w.s, "p2").stamina = 5;
  P(w.s, "p1").stamina = 5;
  const pv = lesson.previewCard(w.s, data, { uid: w.uid, at: { x: 90, y: 90 } }); // 놓은 자리는 무시
  assert.deepEqual([pv.ok, pv.failRate, pv.failerId], [true, 0, null]);
  assert.deepEqual(pv.shape.circle, { ...posOf(w.s).p2, r: 8 });
  assert.deepEqual(pvRows(pv), [["p2", "defense", wantGain(w.s, "p2", "defense", UPOW("cd_u_dorbina"))], ["p1", "defense", wantGain(w.s, "p1", "defense", UPOW("cd_u_dorbina"))]]);
  assert.ok(pv.notes.includes("실패 없음 (철벽)"));
  assert.equal(lesson.getLessonView(w.s, data).hand[0].shape.noFail, true);
  const rng0 = (w.s.rngState = FAIL_INJURY);
  lesson.playCard(w.s, data, { uid: w.uid });
  assert.equal(w.s.rngState, rng0, "실패 판정 rng 를 쓰지 않는다");
  assert.deepEqual(gainFx(w.s), pvRows(pv));
  assert.equal(w.L.stats.fails, 0);
  // 포스트 플레이 (그레타 p7 드리블): 드리블 무리 전원, 주인 ×1.5
  const g = shapeState("cd_u_greta", { layout: { ...LAYOUT, p5: "dribble", p6: "dribble" } });
  const pg = lesson.previewCard(g.s, data, { uid: g.uid });
  assert.deepEqual(pvRows(pg), [
    ["p7", "dribble", wantGain(g.s, "p7", "dribble", UPOW("cd_u_greta"), 1.5)], ["p5", "dribble", wantGain(g.s, "p5", "dribble", UPOW("cd_u_greta"))],
    ["p6", "dribble", wantGain(g.s, "p6", "dribble", UPOW("cd_u_greta"))],
  ]);
  assert.equal(pg.notes[0], "그레타 ×1.5");
  assert.equal(pg.shape.circle.r, 15);
  safePlay(g.s, g.uid);
  assert.deepEqual(gainFx(g.s), pvRows(pg));
  assert.deepEqual(costFx(g.s), ["p7", "p5", "p6"].map((id) => [id, UCOST("cd_u_greta")]));
  assert.equal(g.L.buffs.nextCostZero, true, "남긴 효과: 다음 카드 비용 0");
  // 주장의 호령 (아델린 p3 피지컬): 피지컬 무리 전원, 팀워크 +2 (모양) + L10 +1
  const a = shapeState("cd_u_adeline", { layout: { ...LAYOUT, p1: "physical" } });
  const pa = lesson.previewCard(a.s, data, { uid: a.uid });
  assert.deepEqual(pa.targets.map((t) => t.id), ["p3", "p1"]);
  assert.equal(pa.shape.zone, "physical");
  assert.equal(pa.notes[0], "팀워크 +2");
  const tw0 = a.s.teamwork;
  safePlay(a.s, a.uid);
  assert.equal(a.s.teamwork - tw0, 3);
  assert.deepEqual(gainFx(a.s), pvRows(pa));
});

test("L40 자리 옮기기: 놓은 구역으로 옮겨 ×1.3 · 비용 앞 move fx · 위치 다시 모임 · 턴 끝 기본 훈련도 새 구역 · 벤치 갔다 와도 새 구역 · 미리보기 positionsAfter · baseDelta", () => {
  const { s, L, uid } = shapeState("cd_u_taria"); // 타리아 p5 패스 → 슈팅 (중점)
  const C = ZC.centers;
  // 구역 놓기: 구역 바닥 위 (at) · zone · 지금 구역 (옮기지 않음)
  const pv0 = lesson.previewCard(s, data, { uid });
  assert.deepEqual([pv0.ok, pv0.reason, pv0.shape.from, pv0.shape.to], [false, "구역 위에 놓으세요", "pass", null]);
  assert.equal(lesson.previewCard(s, data, { uid, at: { x: 5, y: 95 } }).reason, "구역 위에 놓으세요");
  const pv = lesson.previewCard(s, data, { uid, at: { x: C.shoot.x + 3, y: C.shoot.y + 4 } });
  assert.equal(pv.ok, true);
  assert.deepEqual(pvRows(pv), [["p5", "shoot", wantGain(s, "p5", "shoot", UPOW("cd_u_taria"), 1.3)]]);
  assert.deepEqual([pv.shape.from, pv.shape.to, pv.shape.zone], ["pass", "shoot", "shoot"]);
  assert.equal(pv.notes[0], "타리아 → 슈팅 구역 · 기본 훈련도");
  // 옮긴 뒤 위치 = 두 대형이 다시 모인다
  const after = zones.zonePositions({ zones: { ...L.zones, p5: "shoot" }, bench: [] }, s.players, ZC);
  assert.deepEqual(pv.shape.positionsAfter, after);
  // 기본 훈련 변화 = 새 구역 − 지금 구역 (중점 ×1.5 가 붙는다)
  const p5 = P(s, "p5");
  const baseOf = (z) => R(3.2 * p5.growth[z] * lesson.zoneMult(L, data, z));
  assert.equal(pv.shape.baseDelta, baseOf("shoot") - baseOf("pass"));
  assert.equal(lesson.getLessonView(s, data).players.find((p) => p.id === "p5").baseNext, baseOf("pass"), "미리보기는 상태를 바꾸지 않는다");
  // 지금 구역에 놓으면 옮기지 않고 그 자리 ×1.3
  const stay = lesson.previewCard(s, data, { uid, zone: "pass" });
  assert.deepEqual([stay.ok, stay.shape.positionsAfter, stay.shape.baseDelta, stay.notes[0]], [true, null, 0, "타리아 패스 구역 그대로"]);
  assert.deepEqual(pvRows(stay), [["p5", "pass", wantGain(s, "p5", "pass", UPOW("cd_u_taria"), 1.3)]]);
  // 낸다
  safePlay(s, uid, { at: { x: C.shoot.x + 3, y: C.shoot.y + 4 } });
  assert.deepEqual(L.lastFx[0], { t: "move", id: "p5", from: "pass", to: "shoot" });
  assert.equal(L.lastFx[1].t, "cost");
  assert.deepEqual(gainFx(s), pvRows(pv));
  assert.equal(L.zones.p5, "shoot");
  assert.equal(L.drawNext, 1, "남긴 효과: 다음 턴 손패 +1");
  const v = lesson.getLessonView(s, data);
  assert.deepEqual(v.positions, after);
  assert.equal(v.players.find((p) => p.id === "p5").zone, "shoot");
  assert.equal(v.players.find((p) => p.id === "p5").baseNext, baseOf("shoot"), "턴 끝 기본 훈련 예상도 새 구역");
  // 그 뒤에 내는 카드의 판정도 새 자리 기준 (중간 원을 슈팅 구역 중심에 → p5 · p6)
  assert.deepEqual(cards.targetsFor(s, cards.resolveCardDef(data, "cd_fw_drill"), { at: C.shoot }, data), ["p5", "p6"]);
  // 벤치 갔다 와도 새 구역
  lesson.benchPlayer(s, data, { playerId: "p5" });
  lesson.benchPlayer(s, data, { playerId: "p5", on: false });
  assert.equal(L.zones.p5, "shoot");
  // 턴 끝 기본 훈련 = 새 구역 스탯
  const sh0 = p5.stats.shoot;
  lesson.endLessonTurn(s, data);
  const base = s.lesson.lastFx.find((x) => x.t === "base" && x.id === "p5");
  assert.deepEqual([base.stat, base.n], ["shoot", baseOf("shoot")]);
  assert.equal(p5.stats.shoot, sh0 + baseOf("shoot"));
  // 다음 턴은 흩어지기가 다시 정한다 (rng)
  assert.ok(s.lesson.lastFx.some((x) => x.t === "scatter"));
});

test("L40 옮기기 + 실패 · 부상: 실패해도 옮긴다 · 손실은 놓은 구역 스탯 · 부상이면 구역에서 빠진다", () => {
  const f = shapeState("cd_u_taria");
  const p5 = P(f.s, "p5");
  p5.stamina = 20;
  const pv = lesson.previewCard(f.s, data, { uid: f.uid, zone: "defense" });
  assert.ok(pv.failRate > 0 && pv.failerId === "p5");
  const def0 = p5.stats.defense;
  f.s.rngState = FAIL_NO_INJURY;
  lesson.playCard(f.s, data, { uid: f.uid, zone: "defense" });
  assert.equal(f.L.zones.p5, "defense", "실패해도 옮겼다");
  assert.deepEqual(f.L.lastFx.find((x) => x.t === "fail"), { t: "fail", id: "p5", stat: "defense", n: 5, injured: false });
  assert.equal(p5.stats.defense, def0 - 5);
  checkScore(f.s, "옮기기 실패");
  const j = shapeState("cd_u_taria");
  P(j.s, "p5").stamina = 20;
  j.s.rngState = FAIL_INJURY;
  lesson.playCard(j.s, data, { uid: j.uid, zone: "defense" });
  assert.ok(j.L.out.includes("p5") && !("p5" in j.L.zones), "부상 → 구역에서 빠짐");
  assert.ok(j.L.removed.includes(j.uid), "부상한 주인의 고유 카드 → removed");
});

test("L40 가로지르기: 두 구역 스탯 · 두 부 스탯 · 비용 1번 · 팀워크 0 · 주인은 놓은 구역에 · 같은 구역 거절 · 집중 몫 ÷ 행 수 · 실패 손실은 놓은 구역", () => {
  const { s, L, uid } = shapeState("cd_u_mirka", { squad: MIRKA() }); // 미르카 p7 드리블
  const m = P(s, "p7");
  assert.equal(m.charId, "ch_cat_trickster");
  assert.equal(lesson.previewCard(s, data, { uid, zone: "dribble" }).reason, "다른 구역에 놓으세요");
  assert.equal(lesson.previewCard(s, data, { uid, at: ZC.centers.dribble }).reason, "다른 구역에 놓으세요");
  assert.deepEqual(lesson.dropCandidates(s, data, { uid }).map((c) => c.zone), ["shoot", "pass", "defense", "physical"]);
  L.buffs.focus = 2; // 집중 몫 = 2 × 6 / 행 수 2 = 6 (행마다)
  const pv = lesson.previewCard(s, data, { uid, zone: "pass" });
  assert.deepEqual(pvRows(pv), [["p7", "dribble", wantGain(s, "p7", "dribble", UPOW("cd_u_mirka") + 6)], ["p7", "pass", wantGain(s, "p7", "pass", UPOW("cd_u_mirka") + 6)]]);
  assert.deepEqual(pv.targets.map((t) => [t.subStat, t.cost]), [["pass", UCOST("cd_u_mirka")], ["shoot", 0]], "부 스탯 · 비용은 첫 행에만");
  assert.equal(pv.notes[0], "미르카 드리블 → 패스 · 두 구역");
  assert.ok(pv.notes.some((n) => n.startsWith("집중 2 → 1인 위력 +6")));
  const st0 = { ...m.stats };
  const tw0 = s.teamwork;
  safePlay(s, uid, { zone: "pass" });
  assert.deepEqual(gainFx(s), pvRows(pv));
  assert.deepEqual(costFx(s), [["p7", UCOST("cd_u_mirka")]]);
  const [g1, g2] = L.lastFx.filter((x) => x.t === "gain");
  assert.equal(m.stats.dribble, st0.dribble + g1.n);
  assert.equal(m.stats.pass, st0.pass + g1.sub + g2.n, "드리블 행의 부 스탯 = 패스");
  assert.equal(m.stats.shoot, st0.shoot + g2.sub, "패스 행의 부 스탯 = 슈팅");
  assert.equal(s.teamwork, tw0, "1명이라 L10 팀워크 0");
  assert.deepEqual(L.targeted, { p7: 1 });
  assert.equal(L.zones.p7, "pass", "놓은 구역에 선다");
  assert.equal(L.playsLeft, 2, "남긴 효과: 추가 사용 +1 (2 − 1 + 1)");
  checkScore(s, "가로지르기");
  // 실패: 두 행 모두 상승 없음, 손실은 놓은 구역 스탯 1번
  const f = shapeState("cd_u_mirka", { squad: MIRKA() });
  P(f.s, "p7").stamina = 20;
  const pass0 = P(f.s, "p7").stats.physical;
  f.s.rngState = FAIL_NO_INJURY;
  lesson.playCard(f.s, data, { uid: f.uid, zone: "physical" });
  assert.deepEqual(f.L.lastFx.filter((x) => x.t === "fail" || x.t === "gain"), [{ t: "fail", id: "p7", stat: "physical", n: 5, injured: false }]);
  assert.equal(P(f.s, "p7").stats.physical, pass0 - 5);
  assert.equal(f.L.zones.p7, "physical");
});

test("L40 방침 문맥 = 행 구역 (옮긴 뒤): 역습형 옮겨서 공격 구역 → 탈취 사용 · 가로지르기 수비 → 피지컬 → 쌓기 · 점유형 받는 선수 패스 구역 +1", () => {
  // 역습형: 타리아가 패스 → 수비로 옮기면 모두 수비 구역 → 탈취 +1
  const a = shapeState("cd_u_taria", { policy: "counter" });
  safePlay(a.s, a.uid, { zone: "defense" });
  assert.equal(a.L.buffs.steal, 1);
  // 타리아가 수비 → 슈팅으로 옮기면 공격 구역 → 탈취를 쓴다 (×(1 + 0.3 × 2))
  const b = shapeState("cd_u_taria", { policy: "counter", layout: { ...LAYOUT, p5: "defense" } });
  b.L.buffs.steal = 2;
  const pv = lesson.previewCard(b.s, data, { uid: b.uid, zone: "shoot" });
  assert.equal(pv.targets[0].gain, wantGain(b.s, "p5", "shoot", UPOW("cd_u_taria"), 1.3 * 1.6));
  safePlay(b.s, b.uid, { zone: "shoot" });
  assert.equal(b.L.buffs.steal, 0);
  // 가로지르기 수비 → 피지컬: 두 행 모두 수비 구역 → 쌓는다
  const c = shapeState("cd_u_mirka", { policy: "counter", squad: MIRKA(), layout: { ...LAYOUT, p7: "defense" } });
  safePlay(c.s, c.uid, { zone: "physical" });
  assert.equal(c.L.buffs.steal, 1);
  // 가로지르기 수비 → 패스: 공격 행이 있다 → 쌓지 않는다
  const d = shapeState("cd_u_mirka", { policy: "counter", squad: MIRKA(), layout: { ...LAYOUT, p7: "defense" } });
  safePlay(d.s, d.uid, { zone: "pass" });
  assert.equal(d.L.buffs.steal, 0);
  // 점유형: 네리아 (수비) → 실루엔 (패스 구역) 이어 주기 → 점유 +1
  const e = shapeState("cd_u_neria", { policy: "poss" });
  safePlay(e.s, e.uid, { playerId: "p4" });
  assert.equal(e.L.buffs.poss, 1);
  const f2 = shapeState("cd_u_neria", { policy: "poss" });
  f2.L.buffs.poss = 3;
  safePlay(f2.s, f2.uid, { playerId: "p3" }); // 수비 → 피지컬: 패스 구역 없음 → −2
  assert.equal(f2.L.buffs.poss, 1);
});

test("L40 루틴은 주인 행만 · 호조 1장 · 코치 지원: 고유 카드에 붙는다 (plus 위력만, 모양 그대로) · 하르나 행 구역별 · 바르바라는 철벽에 안 붙는다 · 한나 heal targets = 서로 다른 T", () => {
  // 루틴 +8: 주인 행만
  const r = shapeState("cd_u_neria");
  r.L.buffs.routine = 8;
  const pv = lesson.previewCard(r.s, data, { uid: r.uid, playerId: "p4" });
  assert.deepEqual(pvRows(pv), [["p1", "defense", wantGain(r.s, "p1", "defense", 28)], ["p4", "pass", wantGain(r.s, "p4", "pass", 20, 1.3)]]);
  // 하르나 (슈팅 구역 ×1.5) 를 타리아에: 슈팅으로 옮기면 그 행 ×1.5, 강화판 위력
  const h = abilityState("sp_coach_harr", ["cd_u_taria", "cd_basic"]);
  attachTo(h.s, h.uids[0], "sp_coach_harr", "plus");
  const ph = lesson.previewCard(h.s, DA, { uid: h.uids[0], zone: "shoot" });
  assert.equal(ph.targets[0].attachMult, 1.5);
  assert.equal(ph.targets[0].gain, R(UPLUS("cd_u_taria") * P(h.s, "p5").growth.shoot * lesson.zoneMult(h.L, DA, "shoot") * 1.3 * 1.5 * GS));
  assert.equal(lesson.previewCard(h.s, DA, { uid: h.uids[0], zone: "defense" }).targets[0].attachMult, 1);
  assert.equal(lesson.getLessonView(h.s, DA).hand[0].shape.kind, "move", "강화판도 모양 그대로");
  // 하르나를 가로지르기에: 놓은 구역이 슈팅이면 그 행만 ×1.5
  const hm = full(startA({ supports: ["sp_coach_harr"], squad: MIRKA() }));
  setZones(hm);
  const mu = uidOf(hm, "cd_u_mirka");
  forceHand(hm, [mu, uidOf(hm, "cd_basic")]);
  attachTo(hm, mu, "sp_coach_harr");
  assert.deepEqual(lesson.previewCard(hm, DA, { uid: mu, zone: "shoot" }).targets.map((t) => [t.zone, t.attachMult]), [["dribble", 1], ["shoot", 1.5]]);
  // 한나 (대상 전원 체력 +10): 가로지르기는 1명이라 1번
  const hn = full(startA({ supports: ["sp_mountain_monk"], squad: MIRKA() }));
  setZones(hn);
  const hu = uidOf(hn, "cd_u_mirka");
  forceHand(hn, [hu, uidOf(hn, "cd_basic")]);
  hn.lesson.playsLeft = 2;
  attachTo(hn, hu, "sp_mountain_monk");
  P(hn, "p7").stamina = 50;
  hn.rngState = SAFE;
  lesson.playCard(hn, DA, { uid: hu, zone: "pass" });
  assert.equal(P(hn, "p7").stamina, 50 - UCOST("cd_u_mirka") - 5 + 10, "비용 · 남긴 효과 −5 · 한나 +10 (1번)");
  // 바르바라 (needs fail): 철벽 스쿼트 (모양 noFail) 에는 붙지 않는다
  for (let seed = 1; seed <= 10; seed++) {
    const b = full(startA({ seed, supports: ["sp_iron_captain"] }));
    const cur = attachNextTurn(b, [uidOf(b, "cd_u_dorbina"), uidOf(b, "cd_basic"), uidOf(b, "cd_cooldown")]);
    assert.equal(cur && cur.uid, uidOf(b, "cd_basic"), `seed ${seed}: 바르바라`);
  }
});

test("L40 피니셔 (주인 없는 특성 — 데이터 사본): 슈팅 구역이면 ×2, 아니면 ×1 · 노트", () => {
  const d = clone(data);
  d.characters.find((c) => c.id === "ch_giant_striker").trait = "finisher";
  for (const [zone, mult, note] of [["shoot", 2, "슈팅 구역 ×2"], ["dribble", 1, "슈팅 구역이 아니라 ×1"]]) {
    const s = full(lesson.startLesson(makeState(), d, { zone: "pass" }));
    setZones(s, { ...LAYOUT, p7: zone });
    const u = uidOf(s, "cd_u_greta");
    forceHand(s, [u, uidOf(s, "cd_basic")]);
    s.lesson.playsLeft = 2;
    const pv = lesson.previewCard(s, d, { uid: u });
    assert.deepEqual(pvRows(pv), [["p7", zone, R(UPOW("cd_u_greta") * P(s, "p7").growth[zone] * mult * GS)]]);
    assert.equal(pv.notes[0], note);
    assert.deepEqual(lesson.dropCandidates(s, d, { uid: u }), [{ at: posOf(s).p7, ids: ["p7"], kind: "owner" }]);
    s.rngState = SAFE;
    lesson.playCard(s, d, { uid: u });
    assert.deepEqual(gainFx(s), pvRows(pv));
  }
});

test("L40 뷰 · 후보: 손패 shape · ownerId · 비용 = 1인 비용 · dropCandidates 모양별 · 순수 · JSON 왕복 · 같은 rngState 같은 결과", () => {
  const s = full(start({ squad: MIRKA(), extra: ["cd_u_greta"] }, { zone: "shoot" }));
  setZones(s, { ...LAYOUT, p6: "shoot", p1: "shoot" });
  const U = (id) => uidOf(s, id);
  const ids = ["cd_u_neria", "cd_u_dorbina", "cd_u_adeline", "cd_u_silluen", "cd_u_taria", "cd_u_ulrika", "cd_u_mirka"];
  forceHand(s, ids.map(U));
  const snap = JSON.stringify(s);
  const v = lesson.getLessonView(s, data);
  assert.deepEqual(v.hand.map((h) => [h.cardId, h.shape.kind, h.shape.needs, h.ownerId, h.cost]), [
    ["cd_u_neria", "link", "player", "p1"], ["cd_u_dorbina", "ownerCircle", null, "p2"], ["cd_u_adeline", "ownerZone", null, "p3"],
    ["cd_u_silluen", "pick", "player", "p4"], ["cd_u_taria", "move", "zone", "p5"], ["cd_u_ulrika", "pick", "player", "p6"],
    ["cd_u_mirka", "carry", "zone", "p7"],
  ].map((x) => [...x, UCOST(x[0])]));
  assert.deepEqual(v.hand[1].shape, cards.shapeView(lesson.lessonCardDef(s, data, U("cd_u_dorbina")), data));
  const pos = posOf(s);
  const dc = (id) => lesson.dropCandidates(s, data, { uid: U(id) });
  assert.deepEqual(dc("cd_u_neria").map((c) => c.playerId), ["p2", "p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(dc("cd_u_ulrika"), [{ at: pos.p1, playerId: "p1", ids: ["p6", "p1"], kind: "player" }]);
  assert.deepEqual(dc("cd_u_taria").map((c) => [c.zone, c.ids, c.kind]), zones.ZONE_IDS.map((z) => [z, ["p5"], "zone"]));
  assert.deepEqual(dc("cd_u_taria")[0].at, ZC.centers.shoot);
  assert.deepEqual(dc("cd_u_mirka").map((c) => c.zone), ["shoot", "pass", "defense", "physical"]);
  assert.deepEqual(dc("cd_u_dorbina"), [{ at: pos.p2, ids: ["p2"], kind: "owner" }]); // 수비에 혼자 (p1 은 슈팅)
  assert.deepEqual(dc("cd_u_adeline"), [{ at: pos.p3, ids: ["p3"], kind: "owner" }]);
  // 모든 후보 → 미리보기 ok, 대상 = 후보 ids
  for (const id of ids) for (const c of dc(id)) {
    const pv = lesson.previewCard(s, data, { uid: U(id), at: c.at, playerId: c.playerId, zone: c.zone });
    assert.equal(pv.ok, true, `${id} ${c.playerId || c.zone || ""}`);
    assert.deepEqual([...new Set(pv.targets.map((t) => t.id))], c.ids, id);
  }
  assert.equal(JSON.stringify(s), snap, "뷰 · 후보 · 미리보기는 상태를 바꾸지 않는다");
  // JSON 왕복 뒤 같은 rngState → 같은 결과 (옮기기 포함)
  s.lesson.playsLeft = 3;
  const t = clone(s);
  for (const st of [s, t]) {
    lesson.playCard(st, data, { uid: U("cd_u_taria"), zone: "defense" });
    lesson.playCard(st, data, { uid: U("cd_u_mirka"), at: ZC.centers.physical });
    lesson.playCard(st, data, { uid: U("cd_u_neria"), playerId: "p5" });
  }
  assert.equal(JSON.stringify(s), JSON.stringify(t));
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

