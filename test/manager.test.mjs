// test/manager.test.mjs — LESSON_PROTO_PLAN §5.5 · §9.3 · §14.14 (js/engine/manager.js 감독 AI, E5 · ZE5)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, match } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";
import * as LE from "../js/engine/lessonEvents.js";
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
    case "reward":
      // 코치 수업이 남았으면 수업 추천 (§18.8) — autoStep 의 action 모양 { kind: "teach", ... }
      return LR.getRewardView(state, data).teach.cur ? { kind: "teach", ...M.recommendTeach(state, data) } : M.recommendReward(state, data);
    case "consult": return M.recommendConsult(state, data);
    case "prep": {
      // 경기 전에 살 수 있는 패시브부터 (L48) — autoStep 의 action 모양 { kind: "passive", ... }
      const pas = M.recommendPassive(state, data);
      return pas ? { kind: "passive", ...pas } : M.recommendPrep(state, data);
    }
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
      if (rec.kind === "teach") {
        const cur = v.teach.cur;
        assert.ok(cur, "수업 차례");
        if (rec.playerId === null) assert.ok(!cur.players.some((p) => p.ok && !p.full), "빈 슬롯 후보가 있는데 받지 않기");
        else {
          const c = LR.canTeachSkill(state, data, cur.skillId, rec.playerId);
          assert.ok(c.ok && !c.full, `수업 받을 선수 ${rec.playerId}`);
          assert.equal(rec.replaceSkillId, null);
        }
        break;
      }
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
  let teaches = 0;
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
    if (r.phase === "reward" && r.action.kind === "teach") teaches += 1;
    if (playedId && playedId.startsWith("cd_u_")) uniquePlays[playedId] = (uniquePlays[playedId] || 0) + 1;
    if (roundtrip) state = clone(state);
  }
  return { state, phases, steps, uniquePlays, teaches };
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
      assert.ok(a.teaches >= 1, "코치 수업 단계를 지난다 (§18.8)");
      for (const k of Object.keys(s.hints)) assert.notEqual(data.skills.find((x) => x.id === k).kind, "active");
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
  // 스킬 (L48): 선수 패시브 — 고유 먼저 → 힌트 레벨 높은 것 → 패시브가 적은 선수 → 싼 것 → 명단 순서. 상담은 패시브만 판다 (§18.5)
  const listOf = (id) => data.characters.find((c) => c.id === P(s, id).charId).passiveIds;
  s.skillPoints = 999;
  s.trainingPoints = 100;
  const r0 = M.recommendConsult(s, data);
  assert.equal(r0.op, "skill");
  assert.equal(data.skills.find((k) => k.id === r0.skillId).ownerCharId, P(s, r0.playerId).charId, "고유 먼저");
  same(M.recommendPassive(s, data), { skillId: r0.skillId, playerId: r0.playerId });
  s.hints[listOf("p6")[0]] = 2;
  same(M.recommendConsult(s, data), { op: "skill", skillId: listOf("p6")[0], playerId: "p6" }, "힌트 레벨 높은 고유");
  s.hints[listOf("p6")[1]] = 3; // 승부사 — 이 편성에서 울리카만 가진 공용
  same(M.recommendConsult(s, data), { op: "skill", skillId: listOf("p6")[0], playerId: "p6" }, "공용은 힌트가 높아도 고유 뒤");
  LR.consultAction(s, data, { op: "skill", skillId: listOf("p6")[0], playerId: "p6" });
  for (const p of s.players) if (p.id !== "p6") p.learnedSkillIds.push(listOf(p.id)[0]);
  same(M.recommendConsult(s, data), { op: "skill", skillId: listOf("p6")[1], playerId: "p6" }, "고유가 다 팔리면 힌트 레벨 높은 공용");
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

test("§18.8 recommendTeach: 빈 슬롯 후보 중 지금 포지션 주 스탯 2개 합 최고 · 같으면 슬롯 순서 · 후보 없으면 받지 않기 · 바꾸지 않는다 · 상태 불변", () => {
  const s = LR.createRun({ data, seed: 11 });
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  s.lesson.attach.hints = ["sp_coach_harr", "sp_coach_harr"];
  // 하르나 수업 목록을 파워 슛 하나로 (레슨 끝 컷인 수업이 늘 파워 슛)
  const harrPs = clone(data);
  harrPs.supports.find((x) => x.id === "sp_coach_harr").teachSkillIds = ["sk_power_shot"];
  while (s.phase === "lesson") LR.endLessonTurn(s, harrPs);
  assert.equal(s.pendingReward.teach.length, 2);
  const fwScore = (id) => cardsMainOf(P(s, id).position).reduce((a, st) => a + P(s, id).stats[st], 0);
  // FW 둘: 주 스탯 합이 큰 쪽
  const before = JSON.stringify(s);
  const r = M.recommendTeach(s, data);
  assert.equal(JSON.stringify(s), before, "순수");
  const best = fwScore("p6") >= fwScore("p7") ? "p6" : "p7";
  same(r, { playerId: best, replaceSkillId: null });
  // 같으면 슬롯 순서
  for (const st of cardsMainOf("FW")) P(s, "p7").stats[st] = P(s, "p6").stats[st];
  same(M.recommendTeach(s, data), { playerId: "p6", replaceSkillId: null });
  // 더 강한 쪽이 가득이면 빈 슬롯 쪽
  P(s, "p7").stats.shoot += 50;
  same(M.recommendTeach(s, data), { playerId: "p7", replaceSkillId: null });
  P(s, "p7").learnedSkillIds = ["sk_focus_finish", "sk_big_game"]; // 패시브는 슬롯을 쓰지 않는다 (L48)
  same(M.recommendTeach(s, data), { playerId: "p7", replaceSkillId: null });
  P(s, "p7").learnedSkillIds = ["sk_burst_dribble", "sk_see_through", "sk_line_breaker"];
  same(M.recommendTeach(s, data), { playerId: "p6", replaceSkillId: null });
  // autoStep: 수업 한 단계씩 → 둘째 수업은 받을 선수 없음 (p7 가득은 바꾸지 않는다) → 받지 않기 → 그다음 보상 고르기
  const a1 = M.autoStep(s, data);
  same(a1, { phase: "reward", action: { kind: "teach", playerId: "p6", replaceSkillId: null } });
  assert.ok(P(s, "p6").learnedSkillIds.includes("sk_power_shot"));
  same(M.recommendTeach(s, data), { playerId: null });
  const sp0 = s.skillPoints;
  M.autoStep(s, data);
  assert.equal(s.pendingReward.teach[1].result, "declined", "가득인 p7 은 바꾸기로 받을 수 있었다 → declined");
  assert.equal(s.skillPoints, sp0 + data.lesson.rewards.teach.declineSp);
  assert.throws(() => M.recommendTeach(s, data), /남은 코치 수업/);
  const a3 = M.autoStep(s, data);
  assert.ok("pick" in a3.action);
  assert.equal(s.phase, "week");
});

// ---------------------------------------------------------------------------
// LESSON_PROTO_PLAN §24.11 — 이벤트 · 카드 3택1 (E2)
// ---------------------------------------------------------------------------

/** 레슨 이벤트 고정 본보기 (테스트 안) — 기대값: TP 1 = 1.5 · 컨디션 1 = 25 · 강화 25 · 삭제 15 · 3택1 35 */
const MGR_EVENTS = [
  { id: "ev_m_cond", trigger: "week", title: "쉬는 날", text: "비가 옵니다.", choices: [
    { label: "훈련한다", effects: [{ type: "tp", amount: 5 }], result: "땀을 흘렸습니다." },
    { label: "쉰다", effects: [{ type: "condition", amount: 1 }], result: "푹 쉬었습니다." }] },
  { id: "ev_m_up", trigger: "week", title: "카드 손질", text: "작전판을 펼칩니다.", choices: [
    { label: "강화한다", effects: [{ type: "cardPick", op: "upgrade" }], result: "카드가 좋아졌습니다." },
    { label: "넘긴다", effects: [{ type: "tp", amount: 1 }], result: "다음에 하기로 했습니다." }] },
  { id: "ev_m_del", trigger: "week", title: "카드 정리", text: "작전판을 정리합니다.", choices: [
    { label: "버린다", effects: [{ type: "cardPick", op: "delete" }], result: "가벼워졌습니다." },
    { label: "넘긴다", effects: [{ type: "tp", amount: 5 }], result: "다음에 하기로 했습니다." }] },
  { id: "ev_m_offer", trigger: "week", title: "후원자", text: "상자가 왔습니다.", choices: [
    { label: "연다", effects: [{ type: "rewardOffer" }], result: "카드가 들어 있습니다." },
    { label: "돌려보낸다", effects: [{ type: "tp", amount: 10 }], result: "돌려보냈습니다." }] },
];

function mgrData() {
  const d = clone(data);
  for (const f of LE.EVENT_FILES) d[f] = { version: 1, notes: {}, events: [] };
  d.lesson_ev_week = { version: 1, notes: {}, events: clone(MGR_EVENTS) };
  return d;
}

test("§24.11 recommendEventChoice (기대값이 큰 쪽 · 고르는 카드 uid = 상담 강화 / 가장 약한 공용 삭제) · recommendCardOffer (보상과 같은 규칙) · autoStep 이 고르고 흐름을 잇는다 · 상태 불변", () => {
  const d = mgrData();
  const fire = (id) => {
    const s = LR.createRun({ data: d, seed: 4, policy: "team" });
    LE.fireEvent(s, d, LE.eventById(d, id), {});
    s.queue = ["advanceWeek"];
    return s;
  };
  const step = (s, want) => {
    const before = JSON.stringify(s);
    const rec = want.phase === "cardOffer" ? M.recommendCardOffer(s, d) : M.recommendEventChoice(s, d);
    assert.equal(JSON.stringify(s), before, "추천이 상태 (rngState 포함) 를 바꿨습니다");
    const r = M.autoStep(s, d, { playMatch });
    assert.equal(r.phase, want.phase);
    same(r.action, rec);
    return rec;
  };
  // 컨디션 +1 (25) > TP +5 (7.5)
  const a = fire("ev_m_cond");
  assert.deepEqual(step(a, { phase: "event" }), { choice: 1 });
  assert.equal(a.phase, "week");
  assert.equal(a.lastEvent.choice, 1);
  // 강화 (25) > TP +1 — uid = 고유가 아닌 첫 강화 가능 카드 (상담 강화와 같다)
  const u = fire("ev_m_up");
  const up = step(u, { phase: "event" });
  assert.equal(up.choice, 0);
  assert.equal(u.deck.find((e) => e.uid === up.uid).cardId, "cd_basic");
  assert.equal(u.deck.find((e) => e.uid === up.uid).plus, true);
  // 삭제 (15) > TP +5 (7.5) — uid = 가장 약한 공용 (cd_basic → cd_coaching …)
  const x = fire("ev_m_del");
  const n = x.deck.length;
  const del = step(x, { phase: "event" });
  assert.equal(del.choice, 0);
  assert.equal(x.deck.length, n - 1);
  assert.ok(!x.deck.some((e) => e.cardId === "cd_basic"), "기초 훈련부터 지운다");
  // 3택1 (35) > TP +10 (15) → phase cardOffer → 방침 > 코치 > 고유 강화 > 공용
  const o = fire("ev_m_offer");
  assert.deepEqual(step(o, { phase: "event" }), { choice: 0 });
  assert.equal(o.phase, "cardOffer");
  o.pendingCardOffer.cards = [{ cardId: "cd_one_two", plus: true, kind: "add" }, { cardId: "cd_c_harr", plus: false, kind: "add" }, { cardId: "cd_one_team", plus: false, kind: "add" }];
  const o2 = clone(o);
  assert.deepEqual(step(o, { phase: "cardOffer" }), { pick: 2 });
  assert.equal(o.deck.at(-1).cardId, "cd_one_team");
  assert.equal(o.phase, "week");
  // 덱이 20장을 넘으면 카드 추가는 건너뛴다 (TP)
  while (o2.deck.length <= 20) o2.deck.push({ uid: `k${o2.nextUid++}`, cardId: "cd_basic", plus: false });
  const tp = o2.trainingPoints;
  assert.deepEqual(step(o2, { phase: "cardOffer" }), { pick: null });
  assert.equal(o2.trainingPoints, tp + 10);
  // 감독 AI 는 rng 를 쓰지 않는다 (위 "rng 없음" 테스트) — 추천은 뷰 (recommended) 와 같다
  const v = fire("ev_m_cond");
  assert.equal(LR.getEventView(v, d).choices.findIndex((c) => c.recommended), M.recommendEventChoice(v, d).choice);
});

// ---------------------------------------------------------------------------
// LESSON_PROTO_PLAN §24.2 · §24.15 — 이벤트 흐름 (E3): 감독 AI 15주 완주
// ---------------------------------------------------------------------------

/** E3 흐름 본보기 (테스트 안): 주 끝 (반복 · 1회 · 시즌 1회 · 조건) · 시즌 시작 3 · 전야 3 · 루트 3 · 일반 외출 2 */
function flowEvents() {
  const res = (effects, text) => (effects.some((e) => e.type === "random") ? { then: text, else: `${text} (다른 갈래)` } : text);
  const choices = (a, b) => [
    { label: "그렇게 한다", effects: a, result: res(a, "그렇게 했습니다.") },
    { label: "다르게 한다", effects: b, result: res(b, "다르게 했습니다.") },
  ];
  const ev = (id, trigger, patch, a = [{ type: "tp", amount: 5 }], b = [{ type: "teamwork", amount: 3 }]) => (
    { id, trigger, title: "흐름 시험", text: "바람이 붑니다.", choices: choices(a, b), ...patch });
  return [
    ev("ev_mf_rain", "week", { once: false, weight: 2 }, [{ type: "condition", amount: 1 }]),
    ev("ev_mf_tired", "week", { cond: { avgStaminaBelow: 70 }, who: { pick: "lowestStamina" }, once: "season", text: "{선수|이/가} 지쳐 보입니다." },
      [{ type: "stamina", target: "player", amount: 20 }], [{ type: "random", chance: 0.5, then: [{ type: "stat", target: "player", stat: "random", amount: 5 }], else: [{ type: "tp", amount: 5 }] }]),
    ev("ev_mf_pick", "week", { weeks: [2, 12] }, [{ type: "cardPick", op: "upgrade" }], [{ type: "rewardOffer" }]),
    ev("ev_mf_pair", "week", { chars: ["ch_wolf_winger", "ch_giant_striker"], charMode: "all" }, [{ type: "stat", target: "char:ch_wolf_winger", stat: "pass", amount: 5 }]),
    ...[1, 2, 3].map((n) => ev(`ev_mf_s${n}`, "seasonStart", { seasons: [n] }, [{ type: "rewardOffer" }])),
    ...[1, 2, 3].map((n) => ev(`ev_mf_pre${n}`, "preMatch", { seasons: [n], who: { pick: "highestStamina" }, text: "{선수|이/가} 잠들지 못합니다." }, [{ type: "goalCondition", amount: 1 }])),
    ...["rt_camp", "rt_expedition", "rt_hotspring"].map((r) => ev(`ev_mf_${r}`, "route", { routeId: r }, [{ type: "relic" }])),
    ev("ev_mf_out1", "outing", { text: "{선수|이/가} 장터를 걷습니다." }, [{ type: "stamina", target: "player", full: true }]),
    ev("ev_mf_out2", "outing", { text: "{선수|이/가} 강가에 앉습니다." }, [{ type: "playerHint" }]),
  ];
}

function flowMgrData(events = flowEvents(), on = ["week", "seasonStart", "preMatch", "route", "outing"]) {
  const d = clone(data);
  for (const f of LE.EVENT_FILES) d[f] = { version: 1, notes: {}, events: [] };
  d.lesson_ev_week = { version: 1, notes: {}, events: clone(events) };
  for (const k of on) d.lesson.events[k] = true;
  return d;
}

/** 감독 AI 로 끝까지 (실제 경기). 띄운 이벤트를 트리거별로 센다 */
function autoRun(d, seed, policy) {
  const s = LR.createRun({ data: d, seed, policy });
  const by = {};
  const phases = {};
  let guard = 0;
  while (s.phase !== "finished") {
    if (++guard > 3000) throw new Error(`런이 끝나지 않습니다 (${s.phase})`);
    if (s.phase === "event") {
      const t = LE.eventById(d, s.currentEvent.eventId).trigger;
      by[t] = (by[t] || 0) + 1;
    }
    phases[s.phase] = (phases[s.phase] || 0) + 1;
    M.autoStep(s, d, { playMatch });
  }
  return { s, by, phases };
}

test("§24.2 E3 감독 AI 15주 완주 (이벤트 스위치 켬 · 고정 본보기): 시즌 시작 3 · 전야 3 · 루트 2 · 주 끝 · 카드 3택1 · 유물 · 결정성 · 스위치를 끄거나 띄울 것이 없으면 이벤트 없는 데이터와 같은 최종 상태", () => {
  const d = flowMgrData();
  const a = autoRun(d, 21, "team");
  assert.equal(a.by.seasonStart, 3);
  assert.equal(a.by.preMatch, 3);
  assert.equal(a.by.route, 2, "감독 AI 루트 = 캠프 · 원정");
  assert.ok(a.by.week >= 3, JSON.stringify(a.by));
  assert.ok(a.phases.cardOffer >= 3, "시즌 시작의 3택1");
  assert.equal(a.s.currentEvent, null);
  assert.equal(a.s.eventSeq, Object.values(a.by).reduce((x, y) => x + y, 0));
  same(JSON.parse(JSON.stringify(a.s)), a.s);
  const b = autoRun(d, 21, "team");
  same(a.s, b.s);
  // 스위치를 모두 끄면 · 켜도 이벤트 파일이 비었으면: 이벤트 없는 데이터와 같은 최종 상태 (같은 흐름 · 같은 rng)
  const plain = autoRun(data, 21, "team").s;
  for (const dd of [flowMgrData(flowEvents(), []), flowMgrData([])]) {
    const r = autoRun(dd, 21, "team");
    assert.deepEqual(r.by, {});
    same(r.s, plain);
  }
});

test("§24.2 E3 감독 AI: 무료 외출 → 외출 이벤트 (추천 선택지) → 같은 주의 추천 행동 · 외출 주는 외출 이벤트만", () => {
  const d = flowMgrData();
  const s = LR.createRun({ data: d, seed: 4, policy: "team" });
  M.autoStep(s, d, { playMatch }); // 시즌 1 시작 이벤트
  if (s.phase === "cardOffer") M.autoStep(s, d, { playMatch });
  assert.equal(s.phase, "week");
  // 온천 다음 시즌 1주처럼 무료 외출 1번
  s.freeOuting = 1;
  const offer = JSON.stringify(s.weekOffer);
  const r = M.autoStep(s, d, { playMatch });
  assert.deepEqual([r.action.type, r.action.free], ["outing", true]);
  assert.deepEqual([s.phase, s.currentEvent.kind], ["event", "outing"]);
  const e = M.autoStep(s, d, { playMatch });
  assert.equal(e.phase, "event");
  assert.deepEqual([s.phase, s.turn, s.freeOuting], ["week", 1, 0]);
  assert.equal(JSON.stringify(s.weekOffer), offer);
  assert.notEqual(M.recommendWeek(s, d).free, true, "무료 외출은 한 번");
});

// ---------------------------------------------------------------------------
// LESSON_PROTO_PLAN §24.6 · §24.7 — E4 코치 연속 · 외출 이야기: 외출 상대 · 감독 AI 15주 완주 · 계정 carry
// ---------------------------------------------------------------------------

/** 이야기 본보기 3화 · 코치 연속 본보기 3단계 (rng 를 쓰지 않는 효과) */
const e4Story = (charId, slug) => [1, 2, 3].map((ep) => ({
  id: `out_mf_${slug}_${ep}`, trigger: "story", story: { charId, ep }, title: `이야기 ${ep}`, text: "강가를 걷습니다.",
  choices: [
    { label: "듣는다", effects: [{ type: "stat", target: "player", stat: "pass", amount: 3 }], result: "물소리가 들립니다." },
    { label: "돌아간다", effects: [{ type: "tp", amount: 5 }], result: "해가 집니다." },
  ],
}));
const e4Coach = (sid, slug) => [1, 2, 3].map((step) => ({
  id: `ev_coach_mf_${slug}_${step}`, trigger: "coach", chain: { supportId: sid, step }, bondAtLeast: [0, 40, 80][step - 1],
  title: `코치 ${step}`, text: "{코치|이/가} {선수|을/를} 부릅니다.",
  choices: [
    { label: "배운다", effects: [{ type: "stat", target: "player", stat: "shoot", amount: 5 }], result: "{선수|이/가} 배웠습니다." },
    { label: "듣는다", effects: [{ type: "bond", target: "coach", amount: 5 }], result: "{코치|이/가} 웃습니다." },
  ],
}));
const E4_MGR = [...e4Story("ch_spirit_keeper", "neria"), ...e4Story("ch_human_runner", "taria"), ...e4Coach("sp_coach_harr", "harr"), ...e4Coach("sp_wind_dancer", "celia"), ...e4Coach("sp_elder_sage", "ornella")];
/** flowMgrData + coach 스위치 (events.coach.enabled) */
function e4MgrData(events, on, coach = false) {
  const d = flowMgrData(events, on);
  d.lesson.events.coach.enabled = coach;
  return d;
}

test("§24.7 E4 감독 AI 외출 상대: 안 본 이야기 화가 남은 선수 중 체력이 가장 낮은 선수 (없으면 지금 규칙) · 무료 외출도 · 외출 이벤트가 꺼져 있으면 지금 규칙 · 외출 여부는 그대로 · 순수", () => {
  const d = e4MgrData(E4_MGR, ["outing"]);
  const setup = (dd, account) => {
    const s = LR.createRun({ data: dd, seed: 4, policy: "team", account });
    s.weekOffer = { kind: "free", actions: ["outing"], guaranteed: "outing" };
    for (const p of s.players) p.stamina = 60;
    P(s, "p3").stamina = 55; // 이야기가 없는 선수 중 가장 낮다
    P(s, "p5").stamina = 58; // 이야기가 남은 선수 (타리아) 중 가장 낮다
    P(s, "p1").stamina = 59;
    return s;
  };
  const s = setup(d);
  const before = JSON.stringify(s);
  const r = M.recommendWeek(s, d);
  assert.deepEqual([r.type, r.playerId], ["outing", "p5"]);
  assert.match(r.reason, /안 본 이야기 \(1화\)/);
  assert.equal(JSON.stringify(s), before, "추천은 순수");
  // 계정에서 두 선수 이야기를 다 봤으면 지금 규칙 (7명 중 체력 최저)
  const done = setup(d, { stories: { ch_spirit_keeper: 3, ch_human_runner: 3 } });
  assert.deepEqual([M.recommendWeek(done, d).playerId, M.recommendWeek(done, d).reason], ["p3", "체력이 가장 낮은 선수와 외출"]);
  // 한 명만 남았으면 그 선수 (체력이 더 높아도)
  const one = setup(d, { stories: { ch_human_runner: 3 } });
  assert.equal(M.recommendWeek(one, d).playerId, "p1");
  // 외출 이벤트 스위치가 꺼져 있으면 이야기가 뜨지 않으니 지금 규칙
  const off = e4MgrData(E4_MGR, []);
  assert.equal(M.recommendWeek(setup(off), off).playerId, "p3");
  // 외출을 할지는 그대로 (평균 체력 50 미만이면 휴식)
  const tired = setup(d);
  for (const p of tired.players) p.stamina = 40;
  assert.equal(M.recommendWeek(tired, d).type, "rest");
  // 무료 외출도 같은 규칙 · autoStep 이 그 선수와 나가 이야기 1화
  const f = setup(d);
  f.freeOuting = 1;
  const rf = M.recommendWeek(f, d);
  assert.deepEqual([rf.type, rf.free, rf.playerId], ["outing", true, "p5"]);
  assert.match(rf.reason, /이야기 1화/);
  M.autoStep(f, d, { playMatch });
  assert.deepEqual([f.phase, f.currentEvent.eventId, f.currentEvent.playerId], ["event", "out_mf_taria_1", "p5"]);
  M.autoStep(f, d, { playMatch });
  assert.deepEqual([f.phase, f.turn, f.storySeen], ["week", 1, ["out_mf_taria_1"]]);
});

test("§24.6 · §24.7 E4 감독 AI 15주 완주 (코치 연속 · 이야기 본보기 · 스위치 켬): 끝까지 · 결정적 · 코치 이벤트 2주 연속 없음 · 계정 carry 면 다음 런은 1단계를 건너뛰고 이야기를 이어 간다 · 스위치를 끄면 이벤트 없는 데이터와 같은 최종 상태", () => {
  const events = [...flowEvents(), ...E4_MGR];
  const d = e4MgrData(events, ["week", "seasonStart", "preMatch", "route", "outing"], true);
  const runA = (account) => {
    const s = LR.createRun({ data: d, seed: 21, policy: "team", account });
    const by = {};
    const coachWeeks = [];
    let guard = 0;
    while (s.phase !== "finished") {
      if (++guard > 3000) throw new Error(`런이 끝나지 않습니다 (${s.phase})`);
      if (s.phase === "event") {
        const t = LE.eventById(d, s.currentEvent.eventId).trigger;
        by[t] = (by[t] || 0) + 1;
        if (t === "coach") coachWeeks.push(s.turnIndex);
      }
      M.autoStep(s, d, { playMatch });
    }
    return { s, by, coachWeeks };
  };
  const a = runA();
  assert.ok(a.by.coach >= 2, JSON.stringify(a.by));
  for (let i = 1; i < a.coachWeeks.length; i++) assert.ok(a.coachWeeks[i] - a.coachWeeks[i - 1] >= 2, `2주 연속 코치: ${a.coachWeeks}`);
  assert.ok(Object.values(a.s.coachSteps).every((l) => l.includes(1)), "계정이 비었으면 1단계부터");
  assert.equal(a.s.storySeen.length, a.by.story || 0, "이야기는 고른 만큼");
  assert.equal(a.s.currentEvent, null);
  same(JSON.parse(JSON.stringify(a.s)), a.s);
  same(runA().s, a.s, "결정적");
  // 계정 carry: 1단계를 본 코치는 다음 런에서 건너뛴다 · 이야기는 이어서
  const acc = LE.accountMerge(null, a.s);
  same(LE.accountMerge(acc, a.s), acc);
  const b = runA(acc);
  for (const [sid, steps] of Object.entries(b.s.coachSteps)) if (acc.coachMet[sid]) assert.ok(!steps.includes(1), `${sid} 1단계는 계정에서 봤다`);
  for (const id of b.s.storySeen) {
    const ev = LE.eventById(d, id);
    assert.ok(ev.story.ep > (acc.stories[ev.story.charId] || 0), `${id} 는 계정 다음 화`);
  }
  // 스위치를 모두 끄면 (본보기 · 계정이 있어도) 이벤트 없는 데이터와 같은 최종 상태
  const plain = (() => {
    const s = LR.createRun({ data, seed: 21, policy: "team" });
    while (s.phase !== "finished") M.autoStep(s, data, { playMatch });
    return s;
  })();
  const dOff = e4MgrData(events, [], false);
  const off = LR.createRun({ data: dOff, seed: 21, policy: "team", account: acc });
  while (off.phase !== "finished") M.autoStep(off, dOff, { playMatch });
  same({ ...off, account: plain.account }, plain);
});
