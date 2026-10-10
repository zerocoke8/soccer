// test/hexFeel.test.mjs — 경기 흐름 조정 (기획 2026-10-10 "롱패스 · 롱슛 · 크로스가 없고 골대 앞에서 허우적거린다")
// js/engine/hexMatch.js: 띄운 공 (땅 가로채기 없음 · 떨어지는 칸 공중볼 · 정확도 · 빠른 비행) · GK 백패스 규칙 · 크로스 자리 넓힘 ·
// 포스트로 뛰어 드는 FW · 붐비는 골 앞의 중거리 슛 · 경기를 끝내는 골 뒤 킥오프 없음.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import { STATS } from "../js/engine/training.js";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";

const data = loadData();
const cfg = data.config;
const D = hex.HEX_DEFAULTS;
const id = (c, r) => G.cellId(c, r);
const at = (ms, side, pid) => G.cellCR(ms.pos[side][pid]);
const evs = (ms, type) => ms.events.filter((e) => e.type === type);
/** data.config.hexMatch 덮어쓰기 */
const withHex = (o) => ({ ...data, config: { ...cfg, hexMatch: o } });

/** 우리 기본 편성 (× 1.8 · 팀워크 40) 과 그 미러 */
function homeSnapshot(mult = 1.8) {
  const state = run.createRun({ data, seed: "feel" });
  for (const p of state.players) for (const s of STATS) p.stats[s] = Math.min(cfg.statCap, Math.round(p.stats[s] * mult));
  state.teamwork = 40;
  return run.buildTeamSnapshot(state, data);
}
const HOME = homeSnapshot();
function mirrorOf(home) {
  const away = clone(home);
  away.name = "미러";
  away.players.forEach((p) => { p.id = "q" + p.id.slice(1); });
  return away;
}
const AWAY = mirrorOf(HOME);

/** 장면: 지정한 선수만 놓고 나머지 필드 선수는 먼 구석 (GK 는 자기 골 앞). rest = 쉬게 할 선수 "side:id" */
function scenario({ home = {}, away = {}, ball, turn = 10, kind = "friendly", moveAcc = 0, rest = [], homeSnap = HOME, awaySnap = AWAY } = {}) {
  const ms = hex.createMatch({ data, seed: "feel-scene", home: homeSnap, away: awaySnap, kind });
  const park = { home: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12]], away: [[13, 0], [12, 0], [11, 0], [10, 0], [9, 0], [8, 0]] };
  for (const side of ["home", "away"]) {
    const spec = side === "home" ? home : away;
    let k = 0;
    for (const pid of ms.order[side]) {
      let cr = spec[pid];
      if (!cr) cr = ms.roles[side][pid] === "GK" ? (side === "home" ? [0, 6] : [14, 6]) : park[side][k++];
      ms.pos[side][pid] = id(cr[0], cr[1]);
      Object.assign(ms.live[side][pid], { moveAcc, restUntil: -1 });
    }
  }
  for (const k of rest) {
    const [s, pid] = k.split(":");
    ms.live[s][pid].restUntil = turn + 5;
  }
  ms.turn = turn;
  ms.events = [];
  ms.aiSides = [];
  if (ball) {
    ms.ball = { holder: { side: ball.side, id: ball.id }, cell: ms.pos[ball.side][ball.id], flight: null, loose: false, holdStreak: 0 };
    ms.possessionSide = ball.side;
  }
  return ms;
}

/** 덮어쓰기를 걸고 n 번 step (decide 는 첫 step 에만) — 굴림 기록을 돌려준다 */
function stepN(ms, n, { roll = null, decide = null, d = data, until = null } = {}) {
  const rolls = [];
  hex.setHexRollForTest((kind, p, info) => {
    rolls.push({ kind, p, info });
    return roll ? roll(kind, p, info) : undefined;
  });
  let used = false;
  hex.setHexDecisionForTest(decide ? () => (used ? undefined : ((used = true), decide)) : null);
  try {
    for (let i = 0; i < n && !ms.finished; i++) {
      hex.step(ms, d);
      if (until && until(ms)) break;
    }
  } finally {
    hex.setHexRollForTest(null);
    hex.setHexDecisionForTest(null);
  }
  return rolls;
}

/* ------------------------------------------------------------------ */
/* 띄운 공                                                                */
/* ------------------------------------------------------------------ */

test("띄운 공: 노린 칸 loftMin 칸 이상 패스는 lofted — 길 위 · 옆 수비의 땅 가로채기 없음 · 한 턴 loftSpeed 칸 · 받으면 기록", () => {
  assert.equal(D.loftMin, 6);
  assert.equal(D.loftSpeed, 5);
  // p4 (2,6) → p7 (11,6) 9칸: 길 위 (5,6) · 옆 (8,5) 에 수비 — 떨어지는 칸 (11,6) 둘레는 비었다
  const ms = scenario({ home: { p4: [2, 6], p7: [11, 6] }, away: { q2: [5, 6], q4: [8, 5] }, ball: { side: "home", id: "p4" } });
  const rolls = stepN(ms, 1, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(11, 6) } });
  const pass = evs(ms, "pass")[0];
  assert.equal(pass.lofted, true);
  assert.equal(pass.cross, false);
  assert.equal(ms.ball.flight.lofted, true);
  assert.equal(ms.ball.flight.at, D.loftSpeed, "첫 턴에 loftSpeed 칸");
  assert.equal(ms.stats.home.lofted, 1);
  const more = stepN(ms, 2, { roll: () => true, until: (m) => !m.ball.flight });
  const all = rolls.concat(more);
  assert.equal(all.filter((r) => r.kind === "intercept").length, 0, "땅 가로채기 굴림 없음");
  assert.equal(evs(ms, "intercept").length, 0);
  assert.ok(all.some((r) => r.kind === "accuracy"), "accFreeDist 보다 멀면 정확도 굴림");
  assert.equal(evs(ms, "receive")[0].playerId, "p7");
  assert.equal(ms.stats.home.passesCompleted, 1);
  // 5칸 패스는 땅볼 그대로 (길 옆 수비가 굴린다)
  const g = scenario({ home: { p4: [2, 6], p7: [7, 6] }, away: { q2: [5, 5] }, ball: { side: "home", id: "p4" } });
  const gr = stepN(g, 2, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(7, 6) }, until: (m) => !m.ball.flight });
  assert.equal(evs(g, "pass")[0].lofted, false);
  assert.ok(gr.some((r) => r.kind === "intercept"), "땅볼은 가로채기 굴림");
});

test("띄운 공 떨어지는 칸 공중볼: 옆 수비와 겨룬다 (지면 그 수비 공) · 이기면 받는다 · 같은 편이 없으면 흘러나온 공", () => {
  // 받는 p7 (11,6) 옆 (12,6) 에 q2
  const mk = () => scenario({ home: { p4: [2, 6], p7: [11, 6] }, away: { q2: [12, 6] }, ball: { side: "home", id: "p4" } });
  const lose = mk();
  const lr = stepN(lose, 3, { roll: (k) => (k === "aerial" ? false : true), decide: { action: "pass", receiverId: "p7", target: id(11, 6) }, until: (m) => !m.ball.flight });
  const aer = evs(lose, "aerial")[0];
  assert.ok(aer, "공중볼 겨루기");
  assert.equal(aer.lofted, true);
  assert.equal(aer.success, false);
  assert.equal(lose.ball.holder.side, "away", "진 공은 그 수비에게");
  assert.equal(lose.ball.holder.id, aer.defenderId);
  assert.equal(lr.find((r) => r.kind === "aerial").info.lofted, true);
  assert.equal(evs(lose, "header").length, 0);
  assert.equal(evs(lose, "shot").length, 0, "띄운 공은 헤더 슛이 아니다");
  const win = mk();
  stepN(win, 3, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(11, 6) }, until: (m) => !m.ball.flight });
  assert.equal(evs(win, "aerial")[0].success, true);
  assert.deepEqual(win.ball.holder, { side: "home", id: "p7" });
  assert.equal(win.stats.home.playerDuelWins.p4, 1, "공중볼을 이긴 띄운 공 = 찬 선수 겨루기 승");
  // 떨어지는 칸에 아무도 없음 (받는 선수가 닿지 못함) → 흘러나온 공
  const empty = scenario({ home: { p4: [2, 6], p7: [12, 10] }, ball: { side: "home", id: "p4" } });
  stepN(empty, 3, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(9, 6) }, until: (m) => !m.ball.flight });
  assert.equal(evs(empty, "loose").length, 1);
});

test("띄운 공 정확도: 땅볼과 같은 곡선 (× loftAccMult) — 빗나가면 노린 칸 옆에 떨어진다", () => {
  const p4 = HOME.players.find((p) => p.id === "p4");
  const d = 9;
  const want = (mult) => Math.min(1, Math.max(D.accMin, 1 - (d - D.accFreeDist) * D.accDropPerCell * mult * (D.accPassRef - p4.stats.pass / 1000)));
  for (const mult of [1, 2]) {
    const ms = scenario({ home: { p4: [2, 6], p7: [11, 6] }, ball: { side: "home", id: "p4" } });
    const r = stepN(ms, 1, { roll: (k) => (k === "accuracy" ? false : true), decide: { action: "pass", receiverId: "p7", target: id(11, 6) }, d: withHex({ loftAccMult: mult }) });
    const acc = r.find((x) => x.kind === "accuracy");
    assert.ok(Math.abs(acc.p - want(mult)) < 1e-12, `정확도 × ${mult}: ${acc.p} ≠ ${want(mult)}`);
    const pass = evs(ms, "pass")[0];
    assert.equal(pass.accurate, false);
    assert.equal(G.distance(pass.target, id(11, 6)), 1, "빗나가면 노린 칸 옆");
  }
});

test("AI 띄운 공: 압박받는 수비는 막힌 짧은 패스 대신 비어 있는 FW 에게 길게 · 띄운 공을 안 쓰면 (loftMin 99) 그러지 않는다", () => {
  // p2 (DF, 3,6) 앞에 q6 · q7 (압박), 짧은 받을 곳 p4 (5,4) 옆에 q4, 앞쪽 p7 (11,6) 는 비었다. 나머지는 쉰다
  const sc = () => scenario({
    home: { p2: [3, 6], p4: [5, 4], p7: [11, 6] },
    away: { q6: [4, 6], q7: [4, 5], q4: [6, 4] },
    ball: { side: "home", id: "p2" },
    rest: ["home:p3", "home:p5", "home:p6"],
  });
  const ms = sc();
  stepN(ms, 1, { roll: () => true });
  const pass = evs(ms, "pass")[0];
  assert.ok(pass && pass.lofted && pass.to === "p7", `띄운 공으로 p7 (${JSON.stringify(pass)})`);
  const off = sc();
  stepN(off, 1, { roll: () => true, d: withHex({ loftMin: 99 }) });
  const p2 = evs(off, "pass")[0];
  assert.ok(!p2 || p2.to !== "p7" || !p2.lofted, "띄운 공이 없으면 길게 차지 않는다");
});

/* ------------------------------------------------------------------ */
/* GK 백패스                                                              */
/* ------------------------------------------------------------------ */

test("GK 백패스: 압박받을 때만 · GK 가 방금 준 공이면 돌려주지 않는다", () => {
  // p2 (DF, 1,6) 앞쪽 3칸을 q4 · q5 · q6 이 막았다 (지키기 · 드리블은 거의 뺏긴다) — 다른 같은 편은 모두 쉰다 (GK 만 받을 수 있다)
  const sc = (from) => {
    const ms = scenario({
      home: { p2: [1, 6] },
      away: { q6: [2, 6], q5: [1, 5], q4: [1, 7] },
      ball: { side: "home", id: "p2" },
      rest: ["home:p3", "home:p4", "home:p5", "home:p6", "home:p7"],
    });
    if (from) ms.ball.from = from;
    return ms;
  };
  const a = sc(null);
  stepN(a, 1, { roll: () => true });
  assert.equal(evs(a, "pass")[0]?.to, "p1", "막혔을 때 GK 에게 돌려준다");
  const b = sc({ side: "home", id: "p1", to: "p2" });
  stepN(b, 1, { roll: () => true });
  assert.ok(!evs(b, "pass").some((e) => e.to === "p1"), "GK 가 방금 준 공은 GK 에게 돌려주지 않는다");
  // 압박이 없으면 GK 에게 주지 않는다
  const c = scenario({ home: { p2: [2, 6] }, away: { q6: [6, 6] }, ball: { side: "home", id: "p2" }, rest: ["home:p3", "home:p4", "home:p5", "home:p6", "home:p7"] });
  stepN(c, 1, { roll: () => true });
  assert.ok(!evs(c, "pass").some((e) => e.to === "p1"), "압박이 없으면 백패스 없음");
  // receive 가 ball.from 을 남기고, 공이 넘어가면 지운다
  const r = scenario({ home: { p2: [2, 6] }, ball: { side: "home", id: "p1" } });
  stepN(r, 2, { roll: () => true, decide: { action: "pass", receiverId: "p2", target: id(2, 6) }, until: (m) => !m.ball.flight });
  assert.deepEqual(r.ball.from, { side: "home", id: "p1", to: "p2" });
});

test("GK 배급: 비어 있는 짧은 패스 (DF 둘레 shortFreeDist 칸 안에 상대 없음) 가 있으면 짧게 · loftCostFree 0 이거나 DF 가 압박받으면 FW 에게 길게", () => {
  // GK p1 (0,6) 공. DF p2 (2,8) · FW p7 (10,9) — 상대 q7 (5,6) 은 둘 다에서 멀다
  const sc = (extra = {}) => scenario({
    home: { p2: [2, 8], p7: [10, 9] },
    away: { q7: [5, 6], ...extra },
    ball: { side: "home", id: "p1" },
    rest: ["home:p3", "home:p4", "home:p5", "home:p6"],
  });
  const a = sc();
  stepN(a, 1, { roll: () => true });
  assert.deepEqual([evs(a, "pass")[0].to, evs(a, "pass")[0].lofted], ["p2", false], "비어 있는 DF 에게 짧게");
  const b = sc();
  stepN(b, 1, { roll: () => true, d: withHex({ loftCostFree: 0 }) });
  assert.deepEqual([evs(b, "pass")[0].to, evs(b, "pass")[0].lofted], ["p7", true], "벌점이 없으면 걷어내듯 길게 (예전)");
  const c = sc({ q6: [3, 8] }); // DF 바로 옆에 상대 — 짧은 패스가 비어 있지 않다
  stepN(c, 1, { roll: () => true });
  assert.deepEqual([evs(c, "pass")[0].to, evs(c, "pass")[0].lofted], ["p7", true], "짧은 패스가 막히면 길게");
});

test("막은 뒤 GK 는 gkSaveHold 턴 공을 쥐고 기다린다 (패스 · 태클 없음) → 그다음 배급 · gkSaveHold 0 이면 바로", () => {
  // 원정 q7 (2,6) 이 슛 → 홈 GK p1 (0,6) 선방. q6 (0,5) 는 GK 앞쪽 칸 (태클할 수 있는 자리), DF p2 (3,9) 는 비었다
  const sc = () => scenario({
    home: { p2: [3, 9] },
    away: { q7: [2, 6], q6: [0, 5] },
    ball: { side: "away", id: "q7" },
    rest: ["home:p3", "home:p4", "home:p5", "home:p6", "home:p7"],
  });
  assert.ok(G.frontCells(id(0, 6), 1).includes(id(0, 5)), "q6 는 GK 앞쪽 3칸");
  const ms = sc();
  stepN(ms, 1, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(evs(ms, "save").length, 1);
  assert.deepEqual(ms.ball.holder, { side: "home", id: "p1" });
  assert.equal(ms.ball.saveHold, ms.turn + D.gkSaveHold);
  assert.equal(D.gkSaveHold, 1);
  ms.events = [];
  stepN(ms, 1, { roll: () => true });
  assert.equal(evs(ms, "pass").length + evs(ms, "tackle").length, 0, "쥐고 기다리는 턴: 패스 · 태클 없음");
  assert.deepEqual(ms.ball.holder, { side: "home", id: "p1" });
  stepN(ms, 1, { roll: () => true });
  assert.equal(evs(ms, "pass")[0]?.from, "p1", "그다음 턴에 배급");
  const now = sc();
  const d0 = withHex({ gkSaveHold: 0 });
  stepN(now, 1, { roll: () => false, decide: { action: "shoot" }, d: d0 });
  now.events = [];
  stepN(now, 1, { roll: () => true, d: d0 });
  assert.equal(evs(now, "pass")[0]?.from, "p1", "gkSaveHold 0 이면 바로 배급");
});

test("미드필드 전환: 열 loftMidOc ~ loftMidMax 의 MF 는 반대쪽 빈 측면으로 띄운 공 (switchBonus · loftCostMid) · 그 규칙이 없으면 짧게", () => {
  // MF p4 (6,9) 공 — 옆에 q6 (7,9) · q5 (8,8). 반대쪽 p5 (7,3) 는 비었고, 짧은 곳 p6 (5,7)
  const sc = () => scenario({
    home: { p4: [6, 9], p5: [7, 3], p6: [5, 7] },
    away: { q6: [7, 9], q5: [8, 8] },
    ball: { side: "home", id: "p4" },
    rest: ["home:p2", "home:p3", "home:p7"],
  });
  const a = sc();
  stepN(a, 1, { roll: () => true });
  const pa = evs(a, "pass")[0];
  assert.deepEqual([pa.to, pa.lofted], ["p5", true], "반대쪽으로 전환");
  assert.ok(Math.abs(G.cellCR(pa.intended)[1] - 9) >= D.switchRows);
  const b = sc();
  stepN(b, 1, { roll: () => true, d: withHex({ switchBonus: 0, loftCostMid: D.loftCost }) });
  assert.equal(evs(b, "pass")[0].to, "p6", "전환 규칙이 없으면 짧게");
});

test("되돌려주기 (핑퐁 방지): 자기 진영 깊은 곳에서 방금 나에게 준 같은 편에게 되돌려주지 않고 앞으로 · 길게 — 벌점 0 이면 되돌려준다 · 앞쪽 (열 ≥ returnPassOc) 은 그대로", () => {
  // p2 (DF, 3,4) 가 p3 (DF, 3,7) 에게서 방금 받았다. q6 · q5 가 p2 를 압박 · MF p4 (6,8) 옆에 q4 — 나머지 같은 편은 쉰다
  const sc = (dx = 0, from = { side: "home", id: "p3", to: "p2" }) => {
    const ms = scenario({
      home: { p2: [3 + dx, 4], p3: [3 + dx, 7], p4: [6 + dx, 8] },
      away: { q6: [4 + dx, 4], q5: [4 + dx, 3], q4: [7 + dx, 7] },
      ball: { side: "home", id: "p2" },
      rest: ["home:p5", "home:p6", "home:p7"],
    });
    ms.ball.from = from;
    return ms;
  };
  const pick = (ms, d) => {
    stepN(ms, 1, { roll: () => true, d });
    return evs(ms, "pass")[0] || null;
  };
  const off = withHex({ returnPassPenalty: 0 });
  const p0 = pick(sc(), off);
  assert.equal(p0?.to, "p3", "벌점 0 이면 짧게 되돌려준다 (장면 확인)");
  const p1 = pick(sc(), data);
  assert.equal(p1?.to, "p4", "되돌려주지 않고 앞쪽 MF 에게");
  // 받은 공이 다른 사람 것이면 (ball.from 이 p3 가 아니면) 그대로 p3 에게 줄 수 있다
  const p2 = pick(sc(0, { side: "home", id: "p4", to: "p2" }), data);
  assert.equal(p2?.to, "p3", "다른 선수가 준 공이면 벌점 없음");
  // 자기 진영 앞쪽 (열 ≥ returnPassOc) 에서는 벌점이 없다 (2:1 패스 자리)
  assert.ok(3 + 3 >= D.returnPassOc);
  const p3 = pick(sc(3), data);
  const p3off = pick(sc(3), off);
  assert.equal(p3?.to, p3off?.to, "앞쪽에서는 벌점이 선택을 바꾸지 않는다");
  // 흘러나온 공을 주워도 남는다: launchPass 가 ball.from 을 찬 선수로 둔다
  const r = scenario({ home: { p2: [2, 6] }, ball: { side: "home", id: "p1" } });
  stepN(r, 1, { roll: () => true, decide: { action: "pass", receiverId: "p2", target: id(4, 6) } });
  assert.deepEqual(r.ball.from, { side: "home", id: "p1", to: "p2" });
});

/* ------------------------------------------------------------------ */
/* 크로스                                                                */
/* ------------------------------------------------------------------ */

test("크로스 자리 넓힘: 자기 진영 열 crossFromOc(8) 의 측면에서도 크로스 · 뛰어 들어가는 박스 칸을 노린다", () => {
  assert.equal(D.crossFromOc, 8);
  // p5 (MF) 측면 (8,1), FW p7 (12,4) 는 박스 바로 밖 — 옆 박스 칸으로 뛰어 들어간다
  const ms = scenario({ home: { p5: [8, 1], p7: [12, 4] }, away: { q2: [5, 1] }, ball: { side: "home", id: "p5" }, moveAcc: 1 });
  assert.ok(G.distToGoal(ms.pos.home.p7, 1) > G.BOX_DIST, "받는 선수는 지금 박스 밖");
  stepN(ms, 1, { roll: () => true });
  const pass = evs(ms, "pass")[0];
  assert.ok(pass && pass.cross, `크로스 (${JSON.stringify(pass)})`);
  assert.equal(pass.to, "p7");
  assert.ok(G.distToGoal(pass.intended, 1) <= G.BOX_DIST, "노린 칸은 박스");
  assert.notEqual(pass.intended, id(12, 4), "받는 선수가 뛰어 들어갈 칸");
  // 예전 기준 (열 9) 이면 (8,1) 은 크로스 자리가 아니다
  const old = scenario({ home: { p5: [8, 1], p7: [12, 4] }, away: { q2: [5, 1] }, ball: { side: "home", id: "p5" }, moveAcc: 1 });
  stepN(old, 1, { roll: () => true, d: withHex({ crossFromOc: 9 }) });
  assert.ok(!evs(old, "pass").some((e) => e.cross), "crossFromOc 9 면 크로스 없음");
});

test("공이 측면 크로스 자리면 FW 는 가까운 · 먼 포스트로, 측면 MF 는 측면 행에 · 공격 MF 는 박스 밖 (edgeColMF)", () => {
  // p5 (MF2, 아래쪽 행) 가 측면 (10,11) 에서 지킨다 — 상대 없음. 10턴 동안 자리를 잡는다
  const ms = scenario({ home: { p5: [10, 11], p4: [7, 4], p6: [9, 4], p7: [9, 8] }, ball: { side: "home", id: "p5" }, moveAcc: 1 });
  const hold = { action: "hold" };
  for (let i = 0; i < 10; i++) stepN(ms, 1, { decide: hold });
  // 공 행 11 (> 6): 가까운 포스트 = (13, 7), 먼 포스트 = (12, 4). FW 시작 행 4 · 8 중 공 쪽 (8) 이 가까운 포스트
  // (자리에 상대가 붙어 있으면 한 칸 비킨다 — 대형 자리 규칙 그대로)
  assert.ok(G.distance(ms.pos.home.p7, id(D.postCols[0], 7)) <= 1, `공 쪽 FW → 가까운 포스트 (${at(ms, "home", "p7")})`);
  assert.ok(G.distance(ms.pos.home.p6, id(D.postCols[1], 4)) <= 1, `다른 FW → 먼 포스트 (${at(ms, "home", "p6")})`);
  assert.ok(G.distToGoal(ms.pos.home.p6, 1) <= G.BOX_DIST && G.distToGoal(ms.pos.home.p7, 1) <= G.BOX_DIST, "두 포스트 모두 박스");
  const [c4, r4] = at(ms, "home", "p4");
  assert.ok(c4 <= D.edgeColMF, `공격 MF 는 열 ${D.edgeColMF} 까지 (${c4})`);
  assert.equal(r4, D.wideRows[0], "위쪽 MF 는 위 측면 행");
});

/* ------------------------------------------------------------------ */
/* 중거리 슛                                                              */
/* ------------------------------------------------------------------ */

test("골 앞이 붐비면 중거리 슛: 앞이 막혔고 슛과 골 사이 상대 ≥ crowdShotN 이면 박스 밖 (거리 4) 에서 때린다 · 붐빔 규칙을 끄면 옆으로 내준다", () => {
  const snap = clone(HOME);
  snap.players.find((p) => p.id === "p7").stats.shoot = 400; // 사거리 round(3 + 400/350) = 4
  // p7 (11,6) 골까지 4. 정면 (12,6) 에 q2 (태클 — 다가가기 막힘), 사이에 q3 (13,5) · q4 (13,7). 옆 같은 편 p6 (11,9)
  const sc = () => scenario({
    homeSnap: snap,
    home: { p7: [11, 6], p6: [11, 9] },
    away: { q2: [12, 6], q3: [13, 5], q4: [13, 7] },
    ball: { side: "home", id: "p7" },
    rest: ["home:p2", "home:p3", "home:p4", "home:p5"],
  });
  const ms = sc();
  assert.equal(G.distToGoal(ms.pos.home.p7, 1), 4);
  stepN(ms, 1, { roll: () => false });
  const shot = evs(ms, "shot")[0];
  assert.ok(shot, "붐빌 때 중거리 슛");
  assert.equal(shot.box, false);
  assert.equal(shot.dist, 4);
  // 붐빔 규칙 끔 (crowdShotN 99): 같은 수비를 막는 수비로 깎아 슛 값이 내려가 옆 같은 편에게 준다
  const no = sc();
  stepN(no, 1, { roll: () => false, d: withHex({ crowdShotN: 99 }) });
  assert.equal(evs(no, "shot").length, 0, "붐빔 규칙이 없으면 슛 안 함");
  assert.equal(evs(no, "pass")[0].to, "p6");
});

test("사거리 끝에서 바로 쏘지 않는다: 앞이 비었으면 한 칸 앞 슛 값 (lookShotMult) 으로 다가가고 · lookShotMult 0 이면 그 자리에서 쏜다", () => {
  const snap = clone(HOME);
  snap.players.find((p) => p.id === "p7").stats.shoot = 700; // 사거리 round(3 + 700/350) = 5
  // p7 (11,6) 골까지 4 — 앞쪽 3칸은 비었다 (q2 · q3 · q4 는 박스 앞 (13, *)). 같은 편은 모두 쉰다
  const sc = () => scenario({
    homeSnap: snap,
    home: { p7: [11, 6] },
    away: { q2: [13, 6], q3: [13, 4], q4: [13, 8] },
    ball: { side: "home", id: "p7" },
    rest: ["home:p2", "home:p3", "home:p4", "home:p5", "home:p6"],
    moveAcc: 1,
  });
  const ms = sc();
  stepN(ms, 1, { roll: () => false });
  assert.equal(evs(ms, "shot").length, 0, "한 칸 다가간다");
  assert.equal(G.distToGoal(ms.pos.home.p7, 1), 3, "드리블로 거리 3");
  assert.deepEqual(ms.ball.holder, { side: "home", id: "p7" });
  const now = sc();
  stepN(now, 1, { roll: () => false, d: withHex({ lookShotMult: 0 }) });
  assert.equal(evs(now, "shot")[0]?.dist, 4, "앞을 보지 않으면 거리 4 에서 쏜다");
});

test("박스 밖 슛 골 확률: 박스 바로 밖 (3) 보다 한 칸마다 × longShotDecay · 슛 사거리 round(3 + 슛/350)", () => {
  const p7 = HOME.players.find((p) => p.id === "p7");
  const range = Math.round(D.shotRangeBase + p7.stats.shoot / D.shotRangeDiv);
  const pAt = (c) => {
    const ms = scenario({ home: { p7: [c, 6] }, ball: { side: "home", id: "p7" } });
    const r = stepN(ms, 1, { roll: () => false, decide: { action: "shoot" } });
    return { p: r.find((x) => x.kind === "shot").p, d: G.distToGoal(id(c, 6), 1) };
  };
  const a = pAt(12); // 거리 3
  const b = pAt(11); // 거리 4
  assert.equal(a.d, 3);
  assert.equal(b.d, 4);
  assert.ok(Math.abs(b.p / a.p - D.longShotDecay) < 1e-12, `${b.p} / ${a.p}`);
  assert.ok(range >= 4, `사거리 ${range}`);
});

/* ------------------------------------------------------------------ */
/* 경기를 끝내는 골                                                        */
/* ------------------------------------------------------------------ */

test("경기를 끝내는 골 (정규 마지막 턴) 뒤에는 킥오프가 없다 · 동점골 (goal 매치) 이면 킥오프 뒤 골든골 · 1골 차로 만든 골이면 킥오프 뒤 추가시간", () => {
  for (const [kind, score, endsMatch] of [["friendly", { home: 1, away: 0 }, true], ["goal", { home: 0, away: 1 }, false], ["friendly", { home: 0, away: 0 }, false]]) {
    const ms = scenario({ kind, turn: 299, home: { p7: [13, 6] }, ball: { side: "home", id: "p7" } });
    ms.score = { ...score };
    stepN(ms, 1, { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
    assert.equal(ms.turn, 300);
    assert.equal(evs(ms, "goal").length, 1);
    const ko = evs(ms, "kickoff").filter((e) => e.turn === 300);
    if (endsMatch) {
      assert.ok(ms.finished, "끝");
      assert.equal(ko.length, 0, "끝난 골 뒤 킥오프 없음");
      assert.deepEqual(evs(ms, "end").map((e) => e.turn), [300]);
    } else {
      assert.equal(ms.finished, false);
      assert.equal(ms.stage, kind === "goal" ? "goldenGoal" : "addedTime", "동점 → 골든골 · 1골 뒤진 쪽이 킥오프 공 → 추가시간");
      assert.equal(ko.length, 1, "킥오프");
      assert.equal(ko[0].side, "away");
    }
  }
});

/* ------------------------------------------------------------------ */
/* 거울 대칭 (새 규칙)                                                     */
/* ------------------------------------------------------------------ */

test("새 규칙의 거울 대칭: 띄운 공 · 크로스 · 중거리 장면이 거울 장면 (원정 공격) 에서 거울상 선택", () => {
  const flipCR = ([c, r]) => G.cellCR(G.mirrorId(id(c, r)));
  const scenes = [
    { home: { p2: [3, 6], p4: [5, 4], p7: [11, 6] }, away: { q6: [4, 6], q7: [4, 5], q4: [6, 4] }, rest: ["p3", "p5", "p6"], ball: "p2" },
    { home: { p5: [8, 1], p7: [12, 4] }, away: { q2: [5, 1] }, rest: [], ball: "p5", moveAcc: 1 },
  ];
  for (const sc of scenes) {
    const A = scenario({ home: sc.home, away: sc.away, ball: { side: "home", id: sc.ball }, moveAcc: sc.moveAcc || 0, rest: sc.rest.map((p) => "home:" + p), turn: 10 });
    // 거울: 같은 선수단을 원정으로 (id 그대로 q ↔ p 바꿔 놓기), 칸 거울, 먼저 움직이는 팀도 바꾸려고 턴 + 1
    const toQ = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ["q" + k.slice(1), flipCR(v)]));
    const toP = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ["p" + k.slice(1), flipCR(v)]));
    const B = scenario({ home: toP(sc.away), away: toQ(sc.home), ball: { side: "away", id: "q" + sc.ball.slice(1) }, moveAcc: sc.moveAcc || 0, rest: sc.rest.map((p) => "away:q" + p.slice(1)), turn: 11 });
    stepN(A, 1, { roll: () => true });
    stepN(B, 1, { roll: () => true });
    const pa = evs(A, "pass")[0];
    const pb = evs(B, "pass")[0];
    assert.ok(pa && pb, "둘 다 패스");
    assert.equal(pb.to, "q" + pa.to.slice(1));
    assert.equal(pb.intended, G.mirrorId(pa.intended));
    assert.equal(pb.lofted, pa.lofted);
    assert.equal(pb.cross, pa.cross);
  }
});
