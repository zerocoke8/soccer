// test/manager.test.mjs — LESSON_PROTO_PLAN §5.5 · §9.3 (js/engine/manager.js 감독 AI, E5)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, match } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";

const data = loadData();
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const P = (state, id) => state.players.find((p) => p.id === id);
const uidOf = (state, cardId) => state.deck.find((e) => e.cardId === cardId).uid;

/** 실제 경기 (match.js simulateAuto) */
function playMatch(setup) {
  const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
  match.simulateAuto(ms, data);
  return match.getResult(ms);
}

/** 지금 phase 의 추천 (상태를 바꾸지 않아야 한다) */
function recommendFor(state) {
  switch (state.phase) {
    case "week": return M.recommendWeek(state, data);
    case "lesson": return M.recommendCard(state, data);
    case "reward": return M.recommendReward(state, data);
    case "consult": return M.recommendConsult(state, data);
    case "prep": return M.recommendPrep(state, data);
    default: return null;
  }
}

/** 추천이 유효한 행동인가 (뷰 기준) */
function checkValid(state, rec) {
  switch (state.phase) {
    case "week": {
      const v = LR.getWeekView(state, data);
      if (rec.type === "lesson") assert.ok(v.lessons.some((l) => l.stat === rec.stat), `레슨 ${rec.stat}`);
      else if (rec.type === "outing" && rec.free) assert.ok(v.freeOuting);
      else if (rec.type !== "rest") assert.ok(v.actions.some((a) => a.type === rec.type), `자유 주 행동 ${rec.type}`);
      assert.equal(typeof rec.reason, "string");
      break;
    }
    case "lesson": {
      const v = LR.getLessonView(state, data);
      if (rec.kind === "play") {
        assert.ok(v.hand.some((h) => h.uid === rec.uid && h.playable), "낼 수 있는 카드");
        assert.ok(LR.previewCard(state, data, { uid: rec.uid, taps: rec.taps }).ok, "미리보기 ok");
      } else if (rec.kind === "rest") assert.ok(v.canRest);
      else assert.ok(v.canEndTurn);
      break;
    }
    case "reward": {
      const v = LR.getRewardView(state, data);
      if (rec.pick !== null) assert.ok(rec.pick >= 0 && rec.pick < v.offer.length);
      if (rec.upgradeUid !== null) assert.ok(v.upgradable.includes(rec.upgradeUid));
      break;
    }
    default:
      break;
  }
}

function playManagerRun(seed, policy, { roundtrip = false } = {}) {
  let state = LR.createRun({ data, seed, policy });
  const phases = {};
  let steps = 0;
  while (state.phase !== "finished") {
    if (++steps > 400) throw new Error(`정해진 단계 수 안에 끝나지 않습니다 (${state.phase})`);
    const before = JSON.stringify(state);
    const rec = recommendFor(state);
    assert.equal(JSON.stringify(state), before, "추천이 상태(rngState 포함)를 바꿨습니다");
    if (rec) checkValid(state, rec);
    const r = M.autoStep(state, data, { playMatch });
    phases[r.phase] = (phases[r.phase] || 0) + 1;
    if (rec) same(r.action, rec);
    if (roundtrip) state = clone(state);
  }
  return { state, phases, steps };
}

// ---------------------------------------------------------------------------

test("감독 AI 15주 완주 (실제 경기, 시드 2 × 방침 ace · counter): 유효한 추천 · 상태 불변 · 결정성 · 단계 수", () => {
  for (const policy of ["ace", "counter"]) {
    for (const seed of [1, 2]) {
      const a = playManagerRun(seed, policy, { roundtrip: true });
      const b = playManagerRun(seed, policy);
      same(a.state, b.state);
      const s = a.state;
      assert.equal(s.phase, "finished");
      assert.equal(s.record.goalMatches.length, 3);
      assert.ok(s.record.lessons.length >= 6, `레슨 ${s.record.lessons.length}`);
      for (const ph of ["week", "lesson", "reward", "prep", "match", "route"]) assert.ok(a.phases[ph] > 0, `phase ${ph}`);
      assert.ok(a.steps < 400);
      assert.equal(M.autoStep(s, data, { playMatch }).action, null);
      const fin = LR.finalizeRun(s, data);
      assert.equal(fin.registeredTeam.policy, policy);
    }
  }
});

test("감독 AI는 rng 를 쓰지 않는다 (Math.random · Date · rng import 없음)", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../js/engine/manager.js", import.meta.url)), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const bad of ["Math.random", "Date", "createRng", "rngState", "rng.js", "document", "localStorage"]) assert.ok(!code.includes(bad), bad);
});

test("탭 대상: 지명 = 주 스탯 쌍 선수 중 체력 최고 (같으면 성장률), 탭 회복 = 체력 최저", () => {
  const s = LR.createRun({ data, seed: 3, policy: "team" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", stat: "pass" });
  const L = s.lesson;
  const coaching = uidOf(s, "cd_coaching");
  const keep = (uids) => {
    for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
    L.drawPile.push(...L.hand);
    L.hand = uids.slice();
  };
  keep([coaching]);
  for (const p of s.players) p.stamina = 90;
  P(s, "p5").stamina = 95; // MF (pass 주 스탯) 중 체력 최고
  P(s, "p1").stamina = 100; // GK 는 pass 가 주 스탯이 아니다
  let r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  same(r.taps, ["p5"]);
  // 체력이 같으면 성장률 높은 쪽
  P(s, "p5").stamina = 90;
  P(s, "p4").stamina = 90;
  const better = P(s, "p4").growth.pass >= P(s, "p5").growth.pass ? "p4" : "p5";
  r = M.recommendCard(s, data);
  same(r.taps, [better]);
  // 탭 회복 카드: 체력 최저
  const cool = uidOf(s, "cd_cooldown");
  keep([cool]);
  P(s, "p6").stamina = 30;
  r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  same(r.taps, ["p6"]);
});

test("쉬기: 출전 평균 체력 < 40이면 첫 행동에서 쉬기, 1장 낸 뒤에는 턴 끝", () => {
  const s = LR.createRun({ data, seed: 4, policy: "ace" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", stat: "defense" });
  for (const p of s.players) p.stamina = 30;
  P(s, "p3").stamina = 10;
  const r = M.recommendCard(s, data);
  same(r, { kind: "rest", playerId: "p3" });
  s.lesson.playedThisTurn = 1;
  s.lesson.playsLeft = 1;
  same(M.recommendCard(s, data), { kind: "endTurn" });
});

test("주 고르기: 무료 외출 → 체력 → 특별 레슨 → 대응 종목, 자유 주 순서", () => {
  const s = LR.createRun({ data, seed: 5, policy: "team" });
  // 레슨 주: 특별 레슨
  s.weekOffer = { kind: "lesson", specials: ["shoot"] };
  assert.equal(M.recommendWeek(s, data).stat, "shoot");
  // 대비 주: 다음 상대 대응 종목 (수비, 수비가 7명 합 1위면 패스)
  s.weekOffer = { kind: "prep", prepCards: ["cd_p_tackle", "cd_p_tackle"] };
  for (const p of s.players) p.stats.defense = 0;
  assert.equal(M.recommendWeek(s, data).stat, "defense");
  for (const p of s.players) p.stats.defense = 900;
  assert.equal(M.recommendWeek(s, data).stat, "pass");
  // 체력 < 40 → 휴식
  for (const p of s.players) p.stamina = 35;
  assert.equal(M.recommendWeek(s, data).type, "rest");
  // 자유 주
  s.weekOffer = { kind: "free", actions: ["consult", "meeting", "friendly"], guaranteed: "consult" };
  for (const p of s.players) p.stamina = 45;
  assert.equal(M.recommendWeek(s, data).type, "rest"); // < 50
  for (const p of s.players) p.stamina = 80;
  s.trainingPoints = 0;
  s.teamwork = 50;
  assert.equal(M.recommendWeek(s, data).type, "meeting");
  s.trainingPoints = 20;
  assert.equal(M.recommendWeek(s, data).type, "consult");
  s.trainingPoints = 0;
  s.teamwork = 100;
  assert.equal(M.recommendWeek(s, data).type, "friendly");
  s.weekOffer = { kind: "free", actions: ["outing", "meeting", "friendly"], guaranteed: "meeting" };
  for (const p of s.players) p.stamina = 60;
  P(s, "p2").stamina = 55;
  const r = M.recommendWeek(s, data);
  assert.equal(r.type, "outing");
  assert.equal(r.playerId, "p2");
  // 무료 외출이 먼저
  s.freeOuting = 1;
  s.turn = 1;
  const f = M.recommendWeek(s, data);
  assert.equal(f.type, "outing");
  assert.equal(f.free, true);
});

test("보상: 방침 > 코치 > 고유 강화 > 공용, 덱 > 20이면 추가 건너뛰기, 무료 강화는 첫 고유 카드", () => {
  const s = LR.createRun({ data, seed: 6, policy: "counter" });
  s.phase = "reward";
  s.pendingReward = {
    offer: [
      { cardId: "cd_fw_drill", plus: true, kind: "add" },
      { cardId: "cd_c_harr", plus: false, kind: "add" },
      { cardId: "cd_recover", plus: false, kind: "add" },
    ],
    freeUpgrades: 1,
    result: {},
  };
  same(M.recommendReward(s, data), { pick: 2, upgradeUid: "k4" });
  s.pendingReward.offer[2] = { cardId: "cd_u_neria", plus: true, kind: "upgrade", uid: "k4" };
  same(M.recommendReward(s, data), { pick: 1, upgradeUid: "k4" });
  s.pendingReward.offer[1] = { cardId: "cd_icing", plus: false, kind: "add" };
  same(M.recommendReward(s, data), { pick: 2, upgradeUid: "k5" }); // 고른 강화와 같은 카드는 피한다
  while (s.deck.length <= 20) s.deck.push({ uid: `k${s.nextUid++}`, cardId: "cd_icing", plus: false });
  s.pendingReward.offer[2] = { cardId: "cd_recover", plus: false, kind: "add" };
  same(M.recommendReward(s, data), { pick: null, upgradeUid: "k4" });
  const before = JSON.stringify(s);
  M.recommendReward(s, data);
  assert.equal(JSON.stringify(s), before);
});

test("상담: 스킬 → 방침 · 코치 구매 → 고유 아닌 강화 → 덱 > 14면 삭제 → 끝", () => {
  const s = LR.createRun({ data, seed: 7, policy: "press" });
  s.weekOffer = { kind: "free", actions: ["consult", "meeting", "outing"], guaranteed: "consult" };
  LR.applyWeekAction(s, data, { type: "consult" });
  s.consult.stock = [
    { cardId: "cd_fw_drill", price: 20, bought: false },
    { cardId: "cd_gegen", price: 30, bought: false },
    { cardId: "cd_c_harr", price: 30, bought: false },
  ];
  // 스킬: 힌트 있는 스킬 + SP
  const sp = data.supports.find((x) => x.id === s.supports[0].id);
  const skillId = sp.hintSkillIds.find((id) => {
    const sk = data.skills.find((k) => k.id === id);
    return sk && sk.learnable;
  });
  s.hints[skillId] = 2;
  s.skillPoints = 999;
  s.trainingPoints = 100;
  const r1 = M.recommendConsult(s, data);
  assert.equal(r1.op, "skill");
  assert.equal(r1.skillId, skillId);
  s.skillPoints = 0;
  same(M.recommendConsult(s, data), { op: "buy", index: 1 });
  LR.consultAction(s, data, { op: "buy", index: 1 });
  same(M.recommendConsult(s, data), { op: "buy", index: 2 });
  LR.consultAction(s, data, { op: "buy", index: 2 });
  const r3 = M.recommendConsult(s, data);
  assert.equal(r3.op, "upgrade");
  assert.equal(r3.uid, "k1"); // cd_basic (고유가 아닌 첫 카드)
  LR.consultAction(s, data, r3);
  s.trainingPoints = 100;
  same(M.recommendConsult(s, data), { op: "end" }); // 덱 12장 ≤ 14
  while (s.deck.length <= 14) s.deck.push({ uid: `k${s.nextUid++}`, cardId: "cd_icing", plus: false });
  same(M.recommendConsult(s, data), { op: "delete", uid: "k1" });
  LR.consultAction(s, data, { op: "delete", uid: "k1" });
  same(M.recommendConsult(s, data), { op: "end" });
  M.autoStep(s, data, {});
  assert.equal(s.phase, "week");
});

test("방침별 한 줄: counter 탈취 ≥ 3이면 공격진 카드 +30, press 압박 ≥ 2 · 지친 선수 → 라인 내리기 우선", () => {
  const s = LR.createRun({ data, seed: 8, policy: "counter" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", stat: "shoot" });
  const L = s.lesson;
  const basic = uidOf(s, "cd_basic");
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => u !== basic);
  L.drawPile.push(...L.hand);
  L.hand = [basic];
  const low = M.recommendCard(s, data);
  L.buffs.steal = 3;
  const high = M.recommendCard(s, data);
  assert.equal(high.uid, basic);
  // 배율 (×1.9) 몫 + 30
  assert.ok(high.score > low.score + 30, `${low.score} → ${high.score}`);

  const t = LR.createRun({ data, seed: 8, policy: "press" });
  t.deck.push({ uid: `k${t.nextUid++}`, cardId: "cd_drop_line", plus: false });
  t.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(t, data, { type: "lesson", stat: "shoot" });
  const T = t.lesson;
  const drop = uidOf(t, "cd_drop_line");
  for (const pile of ["drawPile", "discard", "hand"]) T[pile] = T[pile].filter((u) => u !== drop && u !== "k1");
  T.drawPile.push(...T.hand);
  T.hand = ["k1", drop];
  for (const p of t.players) p.stamina = 70;
  P(t, "p6").stamina = 30;
  T.buffs.press = 2;
  const r = M.recommendCard(t, data);
  assert.equal(r.kind, "play");
  assert.equal(r.uid, drop);
});
