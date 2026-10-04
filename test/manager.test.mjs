// test/manager.test.mjs — LESSON_PROTO_PLAN §5.5 · §9.3 · §14.14 (js/engine/manager.js 감독 AI, E5 · ZE5)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, match } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";
import { mainStatsOf as cardsMainOf } from "../js/engine/cards.js";
import { ZONE_IDS } from "../js/engine/zones.js";

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
      if (rec.type === "lesson") assert.ok(v.lessons.some((l) => l.zone === rec.zone), `레슨 ${rec.zone}`);
      else if (rec.type === "outing" && rec.free) assert.ok(v.freeOuting);
      else if (rec.type !== "rest") assert.ok(v.actions.some((a) => a.type === rec.type), `자유 주 행동 ${rec.type}`);
      assert.equal(typeof rec.reason, "string");
      break;
    }
    case "lesson": {
      const v = LR.getLessonView(state, data);
      if (rec.kind === "play") {
        const h = v.hand.find((x) => x.uid === rec.uid && x.playable);
        assert.ok(h, "낼 수 있는 카드");
        const pv = LR.previewCard(state, data, { uid: rec.uid, at: rec.at, playerId: rec.playerId, zone: rec.zone });
        assert.ok(pv.ok, "미리보기 ok");
        if (["single", "circle", "all", "owner"].includes(h.targetKind) && !h.heal) assert.ok(pv.targets.length >= 1, "놓을 점에 대상 ≥ 1");
        // 고유 카드 모양 (§16.9): 구역이 필요한 모양은 zone, 받는 선수가 필요한 모양은 주인이 아닌 경기장 선수
        const needs = h.shape ? h.shape.needs : null;
        if (needs === "zone") assert.ok(ZONE_IDS.includes(rec.zone), `구역 ${rec.zone}`);
        else assert.equal(rec.zone, undefined, "구역이 필요 없는 카드에 zone");
        if (needs === "player") {
          assert.ok(rec.playerId in v.positions && rec.playerId !== h.ownerId, `받는 선수 ${rec.playerId}`);
          assert.equal(pv.shape.receiverId, rec.playerId);
        }
        if (h.shape && h.shape.kind === "carry") assert.notEqual(rec.zone, state.lesson.zones[h.ownerId], "가로지르기는 다른 구역");
      } else if (rec.kind === "bench") {
        assert.ok(v.canBench && rec.playerId in v.positions, "벤치로 보낼 수 있는 경기장 선수");
      } else assert.ok(v.canEndTurn);
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

function playManagerRun(seed, policy, { roundtrip = false, squad } = {}) {
  let state = LR.createRun({ data, seed, policy, ...(squad ? { squad } : {}) });
  const phases = {};
  const uniquePlays = {};
  let steps = 0;
  while (state.phase !== "finished") {
    if (++steps > 400) throw new Error(`정해진 단계 수 안에 끝나지 않습니다 (${state.phase})`);
    const before = JSON.stringify(state);
    const rec = recommendFor(state);
    assert.equal(JSON.stringify(state), before, "추천이 상태(rngState 포함)를 바꿨습니다");
    if (rec) checkValid(state, rec);
    const playedId = rec && state.phase === "lesson" && rec.kind === "play" ? (state.deck.find((e) => e.uid === rec.uid) || {}).cardId : null;
    const r = M.autoStep(state, data, { playMatch });
    phases[r.phase] = (phases[r.phase] || 0) + 1;
    if (rec) same(r.action, rec);
    if (playedId && playedId.startsWith("cd_u_")) uniquePlays[playedId] = (uniquePlays[playedId] || 0) + 1;
    if (roundtrip) state = clone(state);
  }
  return { state, phases, steps, uniquePlays };
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

/** 손패를 지정한 카드만으로 (나머지는 뽑을 더미로) */
function keepHand(s, uids) {
  const L = s.lesson;
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => !uids.includes(u));
  L.drawPile.push(...L.hand);
  L.hand = uids.slice();
}
/** 2-2-2 고정 배치: GK · DF1 수비, DF2 피지컬, MF1 패스, MF2 드리블, FW 둘 슈팅 */
const LAYOUT = { p1: "defense", p2: "defense", p3: "physical", p4: "pass", p5: "dribble", p6: "shoot", p7: "shoot" };

test("단일 · 회복 대상 (§14.14 후보 점): 단일 = EV 최고 선수 위 · 덜 큰 선수 보너스 [가정 Q1-b] · 회복 = 체력 최저", () => {
  const s = LR.createRun({ data, seed: 3, policy: "team" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  s.lesson.zones = { ...LAYOUT };
  const coaching = uidOf(s, "cd_coaching");
  keepHand(s, [coaching]);
  for (const p of s.players) p.stamina = 90;
  // 런 처음: 모두 주 스탯 상승 0 → 보너스 1
  for (const w of Object.values(M.evenWeights(s, data))) assert.equal(w, 1);
  // 패스 중점 (×1.5) 에 선 MF 실루엔 (패스 성장 1.3, 주 스탯 구역) 이 EV 최고
  let r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  assert.equal(r.uid, coaching);
  assert.equal(r.playerId, "p4");
  same(r.at, LR.getLessonView(s, data).positions.p4);
  // 실루엔이 이미 많이 컸으면 (주 스탯 +300) 보너스가 1 아래로 → 다른 선수를 고른다
  const p4 = P(s, "p4");
  p4.stats.pass += 150;
  p4.stats.dribble += 150;
  const w = M.evenWeights(s, data);
  assert.ok(w.p4 < 1, `p4 ${w.p4}`);
  for (const id of ["p1", "p2", "p3", "p5", "p6", "p7"]) assert.ok(w[id] > 1, `${id} ${w[id]}`);
  assert.equal(M.mainGrowth(s, data, p4), 300);
  r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  assert.notEqual(r.playerId, "p4");
  const pv = LR.previewCard(s, data, { uid: r.uid, at: r.at, playerId: r.playerId });
  assert.ok(pv.ok && pv.targets.length === 1 && pv.targets[0].id === r.playerId);
  // 보너스는 주 스탯 구역에 선 대상에만: 고른 선수는 자기 주 스탯 구역에 서 있다
  assert.ok(cardsMainOf(P(s, r.playerId).position).includes(LAYOUT[r.playerId]));
  // 회복 단일: 체력이 가장 낮은 선수 (playerId)
  const cool = uidOf(s, "cd_cooldown");
  keepHand(s, [cool]);
  P(s, "p6").stamina = 30;
  r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  assert.equal(r.uid, cool);
  assert.equal(r.playerId, "p6");
});

test("벤치 (§14.14): 카드를 내기 전 체력 < 25 경기장 선수를 최저부터 1명씩, 최대 2명 · 카드를 낸 뒤에는 벤치 없음", () => {
  const s = LR.createRun({ data, seed: 4, policy: "ace" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "defense" });
  s.lesson.zones = { ...LAYOUT };
  for (const p of s.players) p.stamina = 30;
  P(s, "p3").stamina = 10;
  P(s, "p5").stamina = 20;
  P(s, "p6").stamina = 24;
  same(M.recommendCard(s, data), { kind: "bench", playerId: "p3" });
  M.autoStep(s, data, {});
  assert.deepEqual(s.lesson.bench, ["p3"]);
  same(M.recommendCard(s, data), { kind: "bench", playerId: "p5" });
  M.autoStep(s, data, {});
  assert.deepEqual(s.lesson.bench, ["p3", "p5"]);
  // 벤치가 찼다 (최대 2) → p6 (24) 은 벤치로 가지 않는다
  const r = M.recommendCard(s, data);
  assert.notEqual(r.kind, "bench");
  if (r.kind === "play") assert.ok(r.playerId !== "p3" && r.playerId !== "p5");
  // 카드를 낸 뒤에는 벤치를 추천하지 않는다
  const t = LR.createRun({ data, seed: 4, policy: "ace" });
  t.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(t, data, { type: "lesson", zone: "defense" });
  for (const p of t.players) p.stamina = 30;
  P(t, "p2").stamina = 5;
  assert.equal(M.recommendCard(t, data).kind, "bench");
  t.lesson.playedThisTurn = 1;
  assert.notEqual(M.recommendCard(t, data).kind, "bench");
  // 체력 25 이상이면 벤치 없음
  t.lesson.playedThisTurn = 0;
  P(t, "p2").stamina = 25;
  assert.notEqual(M.recommendCard(t, data).kind, "bench");
});

test("주 고르기: 무료 외출 → 체력 → 특별 레슨 → 대응 종목, 자유 주 순서", () => {
  const s = LR.createRun({ data, seed: 5, policy: "team" });
  // 레슨 주: 특별 레슨
  s.weekOffer = { kind: "lesson", specials: ["shoot"] };
  assert.equal(M.recommendWeek(s, data).zone, "shoot");
  // 대비 주: 다음 상대 대응 종목 (수비, 수비가 7명 합 1위면 패스)
  s.weekOffer = { kind: "prep", prepCards: ["cd_p_tackle", "cd_p_tackle"] };
  for (const p of s.players) p.stats.defense = 0;
  assert.equal(M.recommendWeek(s, data).zone, "defense");
  for (const p of s.players) p.stats.defense = 900;
  assert.equal(M.recommendWeek(s, data).zone, "pass");
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
  LR.applyWeekAction(s, data, { type: "lesson", zone: "shoot" });
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
  LR.applyWeekAction(t, data, { type: "lesson", zone: "shoot" });
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

test("코치 지원 (§15.6): 붙은 카드 = 능력 effects 가치 + ATTACH_BONUS 6 · 같은 카드 2장이면 붙은 쪽 · 새 effect 말 가치", () => {
  const s = LR.createRun({ data, seed: 3, policy: "team" });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  s.lesson.zones = { ...LAYOUT };
  for (const p of s.players) p.stamina = 90;
  const coaching = uidOf(s, "cd_coaching");
  keepHand(s, [coaching]);
  const L = s.lesson;
  const remaining = L.turns - L.turn;
  const at = (supportId) => {
    L.attach.cur = supportId ? { uid: coaching, supportId, turn: L.turn, upgrade: "none" } : null;
    const r = M.recommendCard(s, data);
    assert.equal(r.kind, "play");
    assert.equal(r.uid, coaching);
    return r;
  };
  const base = at(null);
  const d = (supportId) => {
    const b = at(null); // 컨디션은 상승 배율에도 들어가므로 매번 다시 잰다
    const r = at(supportId);
    assert.equal(b.playerId, base.playerId);
    assert.equal(r.playerId, base.playerId, supportId); // 대상이 1명이라 모든 후보 점에 같은 값이 더해진다
    return Math.round((r.score - b.score) * 100) / 100;
  };
  assert.equal(d("sp_wind_dancer"), 75 * 0.25 + 6); // drawNext 1
  assert.equal(d("sp_elder_sage"), 3 * 2 + 0.5 * 25 + 6); // teamwork 3 · hint 50%
  assert.equal(d("sp_river_scholar"), 75 * 0.3 + 6); // nextPct 0.3
  assert.equal(d("sp_mountain_monk"), 10 * 1 * 0.3 + 6); // heal targets: 대상 1명 · 체력 50 이상
  P(s, base.playerId).stamina = 45;
  const b45 = at(null);
  const r45 = at("sp_mountain_monk");
  assert.equal(r45.playerId, b45.playerId);
  assert.equal(Math.round((r45.score - b45.score) * 100) / 100, 10 * 0.3 + 2 + 6); // 체력 50 미만 대상 +2
  P(s, base.playerId).stamina = 90;
  s.condition = 2;
  assert.equal(d("sp_bard_lumi"), Math.round((0.25 * 1 * (4 * remaining + 6) + 6) * 100) / 100); // condition 25%
  s.condition = 4;
  assert.equal(d("sp_bard_lumi"), 6); // 컨디션 최고면 능력 가치 0, 덤만
  // 강화 · 배율 능력은 미리보기 상승에 들어 있어 덤 6 보다 크다 (하르나: 슈팅 구역 대상이 있을 때만)
  assert.ok(d("sp_iron_captain") >= 6);
  L.attach.cur = null;
  // 같은 카드 2장: 붙은 쪽을 낸다 (손패 순서상 뒤에 있어도)
  const e0 = s.deck.find((e) => e.cardId === "cd_basic");
  s.deck.push({ ...e0, uid: `${e0.uid}_b` });
  const two = [e0.uid, `${e0.uid}_b`];
  keepHand(s, [two[0], two[1]]);
  L.attach.cur = { uid: two[1], supportId: "sp_wind_dancer", turn: L.turn, upgrade: "none" };
  const r = M.recommendCard(s, data);
  assert.equal(r.kind, "play");
  assert.equal(r.uid, two[1]);
  // 감독 AI 는 상태를 바꾸지 않는다
  assert.equal(L.attach.cur.uid, two[1]);
});

test("고유 카드 모양 (§16.9): 자리 옮기기 = 특별 중점 구역으로 · EV 에 baseDelta (기본 훈련 변화) 그대로", () => {
  for (const zone of ["defense", "physical", "shoot"]) {
    const s = LR.createRun({ data, seed: 3, policy: "team" });
    if (!s.deck.some((e) => e.cardId === "cd_u_taria")) s.deck.push({ uid: `k${s.nextUid++}`, cardId: "cd_u_taria", plus: false });
    s.weekOffer = { kind: "lesson", specials: [zone] };
    LR.applyWeekAction(s, data, { type: "lesson", zone });
    s.lesson.zones = { ...LAYOUT };
    for (const p of s.players) p.stamina = 90;
    const taria = uidOf(s, "cd_u_taria");
    keepHand(s, [taria]);
    const owner = s.players.find((p) => p.charId === "ch_human_runner").id;
    assert.equal(s.lesson.zones[owner], "dribble");
    const r = M.recommendCard(s, data);
    assert.equal(r.kind, "play");
    assert.equal(r.uid, taria);
    assert.equal(r.zone, zone, `특별 ${zone} 구역으로 옮긴다`);
    // 기본 훈련 변화만 바꾼다 (분위기 → 기본 훈련 단위): 점수 차 = baseDelta 차 (카드 상승은 그대로)
    const pv0 = LR.previewCard(s, data, { uid: taria, zone });
    s.lesson.buffs.mood = 10;
    const r10 = M.recommendCard(s, data);
    const pv10 = LR.previewCard(s, data, { uid: taria, zone });
    same(pv10.targets.map((t) => t.gain), pv0.targets.map((t) => t.gain));
    assert.ok(pv10.shape.baseDelta > pv0.shape.baseDelta, `${pv0.shape.baseDelta} → ${pv10.shape.baseDelta}`);
    assert.equal(r10.zone, zone);
    assert.equal(Math.round((r10.score - r.score) * 100) / 100, pv10.shape.baseDelta - pv0.shape.baseDelta);
    // 낸다: 타리아가 그 구역으로 옮기고, 턴 끝 기본 훈련도 그 구역 (내기 1번으로 턴이 끝나 다음 턴 흩어지기가 온다 — fx 로 본다)
    LR.playCard(s, data, { uid: r10.uid, at: r10.at, playerId: r10.playerId, zone: r10.zone });
    const fx = s.lesson.lastFx;
    assert.ok(fx.some((f) => f.t === "move" && f.id === owner && f.from === "dribble" && f.to === zone));
    const end = fx.findIndex((f) => f.t === "turnEnd");
    const base = fx.slice(0, end).find((f) => f.t === "base" && f.id === owner);
    assert.ok(base && base.stat === zone, `기본 훈련 ${base && base.stat}`);
  }
});

test("고유 카드 모양 (§16.9): 이어 주기 · 연결 · 크로스 = 받는 선수, 가로지르기 = 다른 구역 · 후보 미리보기 모두 ok · 상태 불변", () => {
  const s = LR.createRun({ data, seed: 3, policy: "team", squad: { ...data.config.defaultSquad.slots, FW2: "ch_cat_trickster" } });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  s.lesson.zones = { ...LAYOUT };
  for (const p of s.players) p.stamina = 90;
  for (const cardId of ["cd_u_neria", "cd_u_silluen", "cd_u_ulrika", "cd_u_mirka"]) {
    if (!s.deck.some((e) => e.cardId === cardId)) s.deck.push({ uid: `k${s.nextUid++}`, cardId, plus: false });
    const uid = uidOf(s, cardId);
    keepHand(s, [uid]);
    const r = M.recommendCard(s, data);
    assert.equal(r.kind, "play", cardId);
    checkValid(s, r);
    const h = LR.getLessonView(s, data).hand.find((x) => x.uid === uid);
    if (cardId === "cd_u_ulrika") assert.equal(s.lesson.zones[r.playerId], "shoot", "크로스는 슈팅 구역 선수");
    if (cardId === "cd_u_mirka") {
      assert.equal(h.shape.kind, "carry");
      assert.notEqual(r.zone, s.lesson.zones[h.ownerId]);
    }
    // 같은 후보 중 최고: 후보마다 다른 받는 선수 · 구역을 강제로 넣어 비교한다 (rng 없음)
    const cands = LR.dropCandidates(s, data, { uid });
    assert.ok(cands.length >= 1);
    const before = JSON.stringify(s);
    for (const c of cands) {
      const pv = LR.previewCard(s, data, { uid, at: c.at, playerId: c.playerId, zone: c.zone });
      assert.ok(pv.ok, `${cardId} 후보 ${c.playerId ?? c.zone}`);
    }
    assert.equal(JSON.stringify(s), before);
  }
});

test("감독 AI 15주 완주 · 미르카 편성 (FW2 = 미르카): 가로지르기 추천이 유효하고 고유 카드 모양이 나온다", () => {
  const squad = { ...data.config.defaultSquad.slots, FW2: "ch_cat_trickster" };
  const a = playManagerRun(1, "team", { squad, roundtrip: true });
  const b = playManagerRun(1, "team", { squad });
  same(a.state, b.state);
  assert.equal(a.state.phase, "finished");
  assert.equal(a.state.record.goalMatches.length, 3);
  assert.ok(a.state.players.some((p) => p.charId === "ch_cat_trickster"));
  assert.ok((a.uniquePlays.cd_u_mirka || 0) >= 1, `미르카 카드 ${JSON.stringify(a.uniquePlays)}`);
  assert.ok(Object.keys(a.uniquePlays).length >= 4, `고유 카드 종류 ${JSON.stringify(a.uniquePlays)}`);
});
