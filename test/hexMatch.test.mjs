// test/hexMatch.test.mjs — 육각 오토배틀 엔진 (js/engine/hexMatch.js). HEX_AUTOBATTLE_PLAN §2 · §6.3 · §6.5, H0 SPEC §3 ~ §5
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, run } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as ch from "../js/engine/challenge.js";
import { STATS } from "../js/engine/training.js";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";

function readData(name) {
  return JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), "utf8"));
}
const data = loadData();
data.challenge = readData("challenge");
data.challenge_sample_team = readData("challenge_sample_team");
const cfg = data.config;

/** 우리 기본 편성 (성장 배율 · 팀워크 40) 스냅샷 */
function homeSnapshot(mult = 1.8, seed = "home") {
  const state = run.createRun({ data, seed });
  for (const p of state.players) for (const s of STATS) p.stats[s] = Math.min(cfg.statCap, Math.round(p.stats[s] * mult));
  state.teamwork = 40;
  return run.buildTeamSnapshot(state, data);
}
const oppSnapshot = (i) => run.buildOpponentSnapshot(data.opponents[i], data);
/** 미러 팀 (같은 능력치 — 동점이 잘 나와 골든골 · 승부차기 확인용) */
function mirror(home) {
  const away = clone(home);
  away.side = "away";
  away.name = "미러 클럽";
  away.players.forEach((p) => { p.id = "q_" + p.id; });
  return away;
}
const HOME = homeSnapshot();
const id = (c, r) => G.cellId(c, r);

const RESULT_KEYS = ["kind", "home", "away", "homeGoals", "awayGoals", "homeName", "awayName", "winner", "stats", "events",
  "possessionsPlayed", "turnsPlayed", "stage", "seed", "lastAttack"];
const STAT_KEYS = ["shots", "duelsWon", "goals", "mvpId", "playerDuelWins", "playerGoals", "skillsUsed", "ultimatesUsed", "combos", "gaanpaUsed",
  "passes", "passesCompleted", "crosses", "interceptions", "tackles", "tacklesWon", "dribblesPast", "saves", "headers", "looseWon", "holdTurns", "carrierTurns"];

/** 매 턴 규칙: 한 턴 1칸 (킥오프 턴 제외 — 태클 실패 턴 포함), 한 칸 한 명, 판 안, GK 구역, moveAcc 0 ~ 1 */
function assertTurnRules(ms, prev, where) {
  const seen = new Set();
  const kick = ms.events.some((e) => e.type === "kickoff" && e.turn === ms.turn);
  for (const side of ["home", "away"]) {
    for (const [pid, cell] of Object.entries(ms.pos[side])) {
      assert.ok(G.isCell(cell), `${where} ${side}:${pid} 판 밖 ${cell}`);
      assert.ok(!seen.has(cell), `${where} 한 칸 두 명 ${cell}`);
      seen.add(cell);
      if (ms.roles[side][pid] === "GK") assert.ok(G.inBox(cell, side === "home" ? -1 : 1), `${where} GK 구역 밖 ${side}:${pid} ${cell}`);
      if (prev && !kick) assert.ok(G.distance(prev[side][pid], cell) <= 1, `${where} ${side}:${pid} ${prev[side][pid]} → ${cell} (2칸 이상)`);
      const acc = ms.live[side][pid].moveAcc;
      assert.ok(acc >= 0 && acc <= 1 + 1e-9, `${where} moveAcc ${acc}`);
    }
  }
}

/** 장면 만들기: 판을 비우고 지정한 선수만 놓는다 (나머지 필드 선수는 먼 구석, GK 는 자기 골 앞) */
function scenario({ home = {}, away = {}, ball, turn = 10, kind = "friendly", moveAcc = 0, homeSnap = HOME, awaySnap = oppSnapshot(0) } = {}) {
  const ms = hex.createMatch({ data, seed: "scene", home: homeSnap, away: awaySnap, kind });
  const park = { home: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12]], away: [[13, 0], [12, 0], [11, 0], [10, 0], [9, 0], [8, 0]] };
  for (const side of ["home", "away"]) {
    const spec = side === "home" ? home : away;
    let k = 0;
    for (const pid of ms.order[side]) {
      let cr = spec[pid];
      if (!cr) cr = ms.roles[side][pid] === "GK" ? (side === "home" ? [0, 6] : [14, 6]) : park[side][k++];
      ms.pos[side][pid] = id(cr[0], cr[1]);
      ms.live[side][pid] = { moveAcc, restUntil: -1 };
    }
  }
  ms.turn = turn;
  ms.events = [];
  if (ball && ball.loose) {
    ms.ball = { holder: null, cell: id(ball.loose[0], ball.loose[1]), flight: null, loose: true, holdStreak: 0 };
  } else if (ball) {
    ms.ball = { holder: { side: ball.side, id: ball.id }, cell: ms.pos[ball.side][ball.id], flight: null, loose: false, holdStreak: 0 };
    ms.possessionSide = ball.side;
  }
  return ms;
}
const evs = (ms, type) => ms.events.filter((e) => e.type === type);
const at = (ms, side, pid) => G.cellCR(ms.pos[side][pid]);

/** 테스트 덮어쓰기를 걸고 fn 을 돌린 뒤 반드시 푼다 */
function withHooks({ roll = null, decide = null }, fn) {
  hex.setHexRollForTest(roll);
  hex.setHexDecisionForTest(decide);
  try {
    return fn();
  } finally {
    hex.setHexRollForTest(null);
    hex.setHexDecisionForTest(null);
  }
}
/** 첫 step 에서만 공 가진 선수의 선택을 정한다 */
const firstTurn = (choice) => {
  let used = false;
  return () => {
    if (used) return undefined;
    used = true;
    return choice;
  };
};

test("hexMatch.js 는 rng.js · hexGrid.js 만 불러온다 (match.js · ai.js 없음)", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("../js/engine/hexMatch.js", import.meta.url)), "utf8");
  const imports = [...src.matchAll(/^\s*import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ["./hexGrid.js", "./rng.js"]);
  assert.ok(!/Math\.random|Date\.now|new Date/.test(src), "Math.random · Date 금지");
});

test("실제 스냅샷 (런 · 레슨 런 · 도전) 으로 만들어 끝까지: 결과 모양 그대로, possessions 는 무시", () => {
  const setups = [];
  for (let i = 0; i < 6; i++) setups.push({ home: HOME, away: oppSnapshot(i), kind: i % 2 ? "friendly" : "goal", seed: `real-${i}` });
  // 레슨 런
  const ls = LR.createRun({ data, seed: 11 });
  ls.weekOffer = { kind: "free", actions: ["friendly", "meeting", "outing"], guaranteed: "friendly" };
  LR.applyWeekAction(ls, data, { type: "friendly" });
  const lsu = LR.getMatchSetup(ls, data);
  setups.push({ home: lsu.home, away: lsu.away, kind: lsu.kind, seed: lsu.seed, possessions: lsu.possessions });
  // 도전 (견본 팀)
  const csu = ch.challengeSetup(ch.sampleTeam(data), 3, 1, data);
  setups.push({ home: csu.home, away: csu.away, kind: csu.kind, seed: csu.seed, possessions: csu.possessions });

  for (const su of setups) {
    const homeBefore = JSON.stringify(su.home);
    const ms = hex.createMatch({ data, ...su });
    assert.equal(JSON.stringify(su.home), homeBefore, "입력 스냅샷을 바꾸지 않는다");
    assert.equal(ms.engine, "hex");
    assert.equal(ms.version, hex.HEX_MATCH_VERSION);
    assert.equal(ms.turn, 0);
    assert.equal(ms.events[0].type, "kickoff");
    assert.equal(ms.events[0].side, "home");
    hex.simulateAuto(ms, data);
    assert.ok(hex.isFinished(ms));
    const r = hex.getResult(ms);
    assert.equal(r, ms.result, "끝난 경기는 저장된 결과");
    const keys = RESULT_KEYS.concat(r.penalties ? ["penalties"] : []);
    assert.deepEqual(Object.keys(r).sort(), keys.sort());
    for (const side of ["home", "away"]) assert.deepEqual(Object.keys(r.stats[side]).sort(), STAT_KEYS.slice().sort());
    assert.ok(["home", "away", "draw"].includes(r.winner));
    if (r.kind !== "friendly") assert.notEqual(r.winner, "draw");
    assert.equal(r.homeGoals, ms.score.home);
    assert.equal(r.awayGoals, ms.score.away);
    assert.equal(r.home, r.homeGoals);
    assert.equal(r.seed, su.seed);
    assert.equal(ms.events[ms.events.length - 1].type, "end");
    // 보기용 필드는 그대로 남는다
    assert.deepEqual(ms.home.players.map((p) => p.id), su.home.players.map((p) => p.id));
  }
  // possessions 는 무시: 값이 달라도 같은 경기
  const a = hex.createMatch({ data, seed: 5, home: HOME, away: oppSnapshot(2), possessions: 1 });
  const b = hex.createMatch({ data, seed: 5, home: HOME, away: oppSnapshot(2), possessions: 99 });
  hex.simulateAuto(a, data);
  hex.simulateAuto(b, data);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  // 끝나지 않은 경기 = provisional
  const c = hex.createMatch({ data, seed: 6, home: HOME, away: oppSnapshot(1) });
  hex.step(c, data);
  assert.equal(hex.getResult(c).provisional, true);
});

test("createMatch 검사: config.match · seed · kind · humanSide · players · id 중복 · position, GK 없으면 수비 최고가 GK", () => {
  const base = { data, seed: 1, home: HOME, away: oppSnapshot(0) };
  assert.throws(() => hex.createMatch({ ...base, data: { config: {} } }), /config\.match/);
  assert.throws(() => hex.createMatch({ ...base, seed: undefined }), /seed/);
  assert.throws(() => hex.createMatch({ ...base, kind: "cup" }), /kind/);
  assert.throws(() => hex.createMatch({ ...base, humanSide: "both" }), /humanSide/);
  assert.throws(() => hex.createMatch({ ...base, home: { players: [] } }), /players/);
  const dup = clone(HOME);
  dup.players[1].id = dup.players[0].id;
  assert.throws(() => hex.createMatch({ ...base, home: dup }), /중복/);
  const badPos = clone(HOME);
  badPos.players[2].position = "ST";
  assert.throws(() => hex.createMatch({ ...base, home: badPos }), /position/);
  const noGk = clone(HOME);
  noGk.players[0].position = "DF";
  delete noGk.formation;
  delete noGk.players[3].style;
  noGk.players[4].stats.shoot = "x";
  const ms = hex.createMatch({ ...base, home: noGk });
  const best = noGk.players.reduce((a, p) => (Number(p.stats.defense) > Number(a.stats.defense) ? p : a));
  assert.equal(ms.order.home[0], best.id);
  assert.equal(ms.roles.home[best.id], "GK");
  assert.equal(ms.home.formation, "2-2-2");
  assert.equal(ms.home.players[3].style, "power");
  assert.equal(ms.home.players[4].stats.shoot, 0);
  // 포메이션 칸 순서: GK, DF, MF, FW (slot 숫자)
  const shuffled = clone(HOME);
  shuffled.players.reverse();
  const ms2 = hex.createMatch({ ...base, home: shuffled });
  assert.deepEqual(ms2.order.home, ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
});

test("매 턴: 한 턴 1칸 (태클 실패 턴 포함) · 한 칸 한 명 · 판 안 · GK 구역 · 이동률 쌓인 값 ≤ 1", () => {
  let tackleFails = 0;
  for (let i = 0; i < 6; i++) {
    const ms = hex.createMatch({ data, seed: `rules-${i}`, home: HOME, away: i < 3 ? oppSnapshot(i * 2) : mirror(HOME), kind: "goal" });
    assertTurnRules(ms, null, "시작");
    while (!ms.finished) {
      const prev = clone(ms.pos);
      const stage = ms.stage;
      const n = ms.events.length;
      hex.step(ms, data);
      if (stage === "penalties") continue;
      tackleFails += ms.events.slice(n).filter((e) => e.type === "tackle" && !e.success && e.carrierTo !== e.carrierFrom).length;
      assertTurnRules(ms, prev, `경기 ${i} 턴 ${ms.turn}`);
    }
  }
  assert.ok(tackleFails > 0, "태클 실패로 엇갈려 움직인 턴도 검사했다");
});

test("결정성: 같은 시드 = 같은 JSON, 매 step clone 해도 같은 결과, 다른 시드 = 다른 이벤트", () => {
  const mk = (seed) => hex.createMatch({ data, seed, home: HOME, away: oppSnapshot(3), kind: "goal" });
  const a = hex.simulateAuto(mk("det"), data);
  const b = hex.simulateAuto(mk("det"), data);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(hex.getResult(a), hex.getResult(b));
  let c = mk("det");
  let guard = 0;
  while (!hex.isFinished(c)) {
    hex.step(c, data);
    c = clone(c);
    assert.ok(++guard < 5000);
  }
  assert.equal(JSON.stringify(c), JSON.stringify(a));
  const d = hex.simulateAuto(mk("det-2"), data);
  assert.notDeepEqual(d.events, a.events);
});

test("시계: 친선은 300턴 (+ 규칙이 켜질 때만 추가시간) 에 끝나고 무승부도 된다 · 골/아레나는 무승부 없음 · 골든골 · 승부차기 · 단계 이벤트", () => {
  let draws = 0;
  for (let i = 0; i < 30; i++) {
    const ms = hex.simulateAuto(hex.createMatch({ data, seed: `fr-${i}`, home: HOME, away: mirror(HOME), kind: "friendly" }), data);
    const r = hex.getResult(ms);
    assert.equal(r.stage, "regular");
    assert.ok(!r.penalties);
    assert.ok(!ms.events.some((e) => e.type === "goldenGoal"));
    if (ms.addedTime) {
      assert.ok(r.turnsPlayed > 300 && r.turnsPlayed <= 325, `추가시간 턴 ${r.turnsPlayed}`);
      assert.equal(evs(ms, "addedTime").length, 1);
      assert.deepEqual(r.lastAttack, { side: ms.addedTime.side, stage: "regular", turn: 300 });
    } else {
      assert.equal(r.turnsPlayed, 300);
      assert.equal(r.lastAttack, null);
    }
    if (r.winner === "draw") draws++;
  }
  assert.ok(draws > 0, "친선 무승부가 나온다");
  let golden = 0;
  let pens = 0;
  let goldenWins = 0;
  // 최소 60판, 골든골 승 · 승부차기가 아직 안 나왔으면 240판까지 더 본다 (승부차기는 미러 판의 약 3% — 표본 운에 기대지 않게)
  for (let i = 0; i < 240 && (i < 60 || !pens || !goldenWins); i++) {
    const kind = i % 2 ? "arena" : "goal";
    const ms = hex.simulateAuto(hex.createMatch({ data, seed: `gm-${i}`, home: HOME, away: mirror(HOME), kind }), data);
    const r = hex.getResult(ms);
    assert.notEqual(r.winner, "draw", `${kind} ${i} 무승부`);
    const types = ms.events.map((e) => e.type);
    if (types.includes("goldenGoal")) {
      golden++;
      assert.ok(["goldenGoal", "penalties"].includes(r.stage));
      const gTurn = ms.events.find((e) => e.type === "goldenGoal").turn;
      if (r.stage === "goldenGoal") {
        goldenWins++;
        assert.ok(!types.includes("penalties"));
        assert.ok(r.turnsPlayed <= gTurn + 75);
        assert.equal(Math.abs(r.homeGoals - r.awayGoals), 1, "골든골은 첫 골로 끝");
      }
    }
    if (r.penalties) {
      pens++;
      assert.equal(r.stage, "penalties");
      assert.equal(r.homeGoals, r.awayGoals);
      assert.notEqual(r.penalties.home, r.penalties.away);
      assert.ok(types.indexOf("goldenGoal") < types.indexOf("penalties"));
      const gTurn = ms.events.find((e) => e.type === "goldenGoal").turn;
      assert.equal(ms.events.find((e) => e.type === "penalties").turn - gTurn, hex.GOLDEN_TURNS, "골든골은 정확히 75턴");
      assert.ok(types.filter((t) => t === "penalty").length >= 6);
      assert.ok(r.turnsPlayed <= 300 + 25 + 75);
    }
  }
  assert.ok(golden > 0, "골든골이 나온다");
  assert.ok(goldenWins > 0, "골든골로 끝난 경기가 있다");
  assert.ok(pens > 0, "승부차기가 나온다");
});

test("태클은 앞쪽 3칸만: 바로 뒤 · 뒤 대각 수비는 태클하지 않는다, 앞 대각은 한다", () => {
  // 홈 공격 (→), p6 (6,6) — 짝수 행: 앞 E (7,6) · NE (6,5) · SE (6,7), 뒤 W (5,6) · NW (5,5) · SW (5,7)
  for (const action of ["hold", "dribble"]) {
    const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [5, 6], q3: [5, 5], q4: [5, 7] }, ball: { side: "home", id: "p6" } });
    withHooks({ roll: () => true, decide: firstTurn({ action }) }, () => hex.step(ms, data));
    assert.equal(evs(ms, "tackle").length, 0, `${action}: 뒤 · 뒤 대각은 태클 없음`);
  }
  for (const [c, r] of [[6, 5], [7, 6], [6, 7]]) {
    const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [c, r] }, ball: { side: "home", id: "p6" } });
    withHooks({ roll: () => true, decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
    const t = evs(ms, "tackle");
    assert.equal(t.length, 1, `앞 (${c},${r}) 은 태클`);
    assert.equal(t[0].tacklerId, "q2");
  }
  // 원정 공격 (←): q6 (8,6) 의 앞은 W (7,6) · NW (7,5) · SW (7,7) — 홈 수비가 (9,6) 이면 뒤라 없음
  const ms = scenario({ home: { p2: [9, 6] }, away: { q6: [8, 6] }, ball: { side: "away", id: "q6" } });
  withHooks({ roll: () => true, decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(evs(ms, "tackle").length, 0);
});

test("정면을 막은 수비의 태클 실패: 둘이 엇갈려 칸이 바뀌고, 태클한 수비는 다음 턴 쉰다 (이동 · 태클 · 가로채기 없음)", () => {
  // p6 (6,6) → 가려는 칸 (7,6) = q2. 앞 대각은 동료가 막음 (빈 칸 없음)
  const ms = scenario({ home: { p6: [6, 6], p4: [6, 5], p5: [6, 7] }, away: { q2: [7, 6] }, ball: { side: "home", id: "p6" }, moveAcc: 1 });
  const T = ms.turn + 1;
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "dribble", target: id(7, 6) }) }, () => hex.step(ms, data));
  const t = evs(ms, "tackle");
  assert.equal(t.length, 1);
  assert.equal(t[0].success, false);
  assert.deepEqual(at(ms, "home", "p6"), [7, 6]);
  assert.deepEqual(at(ms, "away", "q2"), [6, 6]);
  assert.equal(t[0].carrierFrom, id(6, 6));
  assert.equal(t[0].carrierTo, id(7, 6));
  assert.equal(t[0].tacklerTo, id(6, 6));
  assert.equal(ms.live.away.q2.restUntil, T + 1);
  assert.deepEqual(ms.ball.holder, { side: "home", id: "p6" });
  assert.equal(ms.stats.home.dribblesPast, 1);
  assert.equal(ms.stats.home.playerDuelWins.p6, 1);
  // 다음 턴: 쉬는 q2 는 움직이지 않는다
  const before = ms.pos.away.q2;
  withHooks({ decide: () => ({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(ms.pos.away.q2, before, "쉬는 수비는 이동 없음");
});

test("쉬는 수비는 앞쪽 3칸에 있어도 태클 · 가로채기를 못 하고 칸만 차지한다", () => {
  const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [7, 6] }, ball: { side: "home", id: "p6" } });
  ms.live.away.q2.restUntil = ms.turn + 1;
  withHooks({ roll: () => true, decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(evs(ms, "tackle").length, 0);
  // 패스 길 바로 위의 쉬는 수비 → 굴림 없음 (p4 (3,6) → p7 (6,6), 길 (4,6) (5,6) (6,6))
  const ps = scenario({ home: { p4: [3, 6], p7: [6, 6] }, away: { q2: [5, 6] }, ball: { side: "home", id: "p4" } });
  ps.live.away.q2.restUntil = ps.turn + 1;
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7" }) }, () => hex.step(ps, data));
  assert.equal(evs(ps, "intercept").length, 0);
  assert.equal(ps.pos.away.q2, id(5, 6), "칸은 그대로 차지");
});

test("앞 대각 수비의 태클 실패 (정면 드리블): 공 가진 선수는 전진, 수비는 그 선수가 있던 칸으로 미끄러진다", () => {
  const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [6, 5] }, ball: { side: "home", id: "p6" } });
  const T = ms.turn + 1;
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "dribble", target: id(7, 6) }) }, () => hex.step(ms, data));
  const t = evs(ms, "tackle");
  assert.equal(t.length, 1);
  assert.equal(t[0].tacklerId, "q2");
  assert.deepEqual(at(ms, "home", "p6"), [7, 6]);
  assert.deepEqual(at(ms, "away", "q2"), [6, 6]);
  assert.equal(ms.live.away.q2.restUntil, T + 1);
});

test("지키기 + 태클 실패: 둘 다 제자리, 수비는 그 자리에서 넘어진다 · 태클 성공이면 공을 뺏는다", () => {
  const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [7, 6] }, ball: { side: "home", id: "p6" } });
  const T = ms.turn + 1;
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(evs(ms, "tackle")[0].success, false);
  assert.deepEqual(at(ms, "home", "p6"), [6, 6]);
  assert.deepEqual(at(ms, "away", "q2"), [7, 6]);
  assert.equal(ms.live.away.q2.restUntil, T + 1);
  assert.equal(ms.stats.home.holdTurns, 1);
  // 성공
  const ok = scenario({ home: { p6: [6, 6] }, away: { q2: [7, 6] }, ball: { side: "home", id: "p6" } });
  const poss = ok.possessions;
  withHooks({ roll: (k) => (k === "tackle" ? false : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(ok, data));
  assert.equal(evs(ok, "tackle")[0].success, true);
  assert.deepEqual(ok.ball.holder, { side: "away", id: "q2" });
  assert.deepEqual(at(ok, "home", "p6"), [6, 6]);
  assert.deepEqual(at(ok, "away", "q2"), [7, 6]);
  assert.equal(ok.live.away.q2.restUntil, -1, "뺏은 수비는 쉬지 않는다");
  assert.equal(ok.live.home.p6.restUntil, -1, "뺏긴 선수도 쉬지 않는다");
  assert.equal(ok.possessions, poss + 1);
  assert.equal(ok.stats.away.tacklesWon, 1);
});

test("가로채기: 그 턴에 공이 지난 칸 위 · 옆 수비만, 한 패스에 한 사람 한 번", () => {
  // p4 (2,6) → p7 (11,6): 길 (3..11, 6) 9칸 = 3턴. q2 (5,5) 는 1턴째 (5,6) · 2턴째 (6,6) 둘 다 옆 → 한 번만
  // q4 (12,6) 는 3턴째 칸 (11,6) 옆에만 닿는다 → 3턴째에만 굴린다 (남은 길 전체가 아니라 그 턴에 지난 칸만)
  const ms = scenario({ home: { p4: [2, 6], p7: [11, 6] }, away: { q2: [5, 5], q3: [8, 2], q4: [12, 6] }, ball: { side: "home", id: "p4" } });
  const rolls = [];
  withHooks({
    roll: (k, p, info) => {
      if (k === "intercept") rolls.push(info.defenderId);
      return true;
    },
    decide: () => ({ action: "pass", receiverId: "p7", target: id(11, 6) }),
  }, () => {
    for (let i = 0; i < 3 && !evs(ms, "receive").length && !evs(ms, "loose").length; i++) hex.step(ms, data);
  });
  const pass = evs(ms, "pass")[0];
  assert.equal(pass.target, id(11, 6));
  const path = G.line(pass.fromCell, pass.target).slice(1);
  const ints = evs(ms, "intercept");
  assert.ok(ints.length >= 1);
  assert.equal(new Set(rolls).size, rolls.length, "한 수비 한 번");
  assert.equal(rolls.filter((x) => x === "q2").length, 1);
  assert.deepEqual(ints.filter((e) => e.defenderId === "q4").map((e) => e.turn), [pass.turn + 2], "q4 는 3턴째에만");
  for (const e of ints) {
    const k = e.turn - pass.turn;
    const seg = path.slice(k * 3, k * 3 + 3);
    assert.ok(seg.some((c) => c === e.cell || G.distance(c, e.cell) === 1), `턴 ${e.turn} 수비 ${e.defenderId} 칸 ${e.cell} 은 그 턴 지난 칸 위 · 옆`);
  }
  assert.equal(evs(ms, "receive")[0].playerId, "p7");
  assert.equal(ms.stats.home.passesCompleted, 1);
  assert.equal(ms.stats.home.playerDuelWins.p4, 1, "가로채기 굴림을 이긴 패스 = 패스한 선수 겨루기 승 1번");
  // 길에서 먼 수비는 굴리지 않는다
  const far = scenario({ home: { p4: [2, 6], p7: [5, 6] }, away: { q2: [4, 10] }, ball: { side: "home", id: "p4" } });
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7" }) }, () => hex.step(far, data));
  assert.equal(evs(far, "intercept").length, 0);
  // 가로채기 성공: 공은 그 수비에게, 포제션 +1
  const cut = scenario({ home: { p4: [3, 6], p7: [7, 6] }, away: { q2: [5, 6] }, ball: { side: "home", id: "p4" } });
  withHooks({ roll: (k) => (k === "intercept" ? false : undefined), decide: firstTurn({ action: "pass", receiverId: "p7" }) }, () => hex.step(cut, data));
  assert.equal(evs(cut, "intercept")[0].success, true);
  assert.equal(cut.ball.holder.side, "away");
  assert.equal(cut.stats.away.interceptions, 1);
});

test("크로스는 땅 가로채기가 없다 · 도착 칸에서 공중볼 → 헤더", () => {
  // p4 측면 (10,1) → 박스 p6 (13,6): 길 위 (11,3) 에 수비가 있어도 굴림 없음
  const ms = scenario({ home: { p4: [10, 1], p6: [13, 6] }, away: { q2: [11, 3], q3: [12, 4] }, ball: { side: "home", id: "p4" }, moveAcc: 0 });
  const kinds = [];
  withHooks({
    roll: (k) => {
      kinds.push(k);
      return k === "aerial" ? true : k === "header" ? false : undefined;
    },
    decide: firstTurn({ action: "cross", receiverId: "p6", target: id(13, 6) }),
  }, () => {
    for (let i = 0; i < 3 && !evs(ms, "shot").length && !evs(ms, "receive").length && !evs(ms, "loose").length; i++) hex.step(ms, data);
  });
  assert.equal(evs(ms, "pass")[0].cross, true);
  assert.equal(ms.stats.home.crosses, 1);
  assert.equal(evs(ms, "intercept").length, 0);
  assert.ok(!kinds.includes("intercept"));
  const shot = evs(ms, "shot")[0];
  assert.ok(kinds.includes("aerial") || !shot, "헤더 전에는 공중볼 겨루기");
  if (shot) {
    assert.equal(shot.header, true);
    assert.equal(ms.stats.home.headers, 1);
    assert.equal(evs(ms, "save").length, 1);
  } else {
    assert.equal(evs(ms, "receive")[0].playerId, "p6");
  }
});

test("흘러나온 공: 이동 순서에서 먼저 들어간 선수가 줍는다 (홀수 턴 홈 먼저 · 짝수 턴 원정 먼저)", () => {
  for (const [turn, side] of [[10, "home"], [11, "away"]]) {
    const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [8, 6] }, ball: { loose: [7, 6] }, turn, moveAcc: 1 });
    hex.step(ms, data);
    const w = evs(ms, "looseWon");
    assert.equal(w.length, 1);
    assert.equal(w[0].side, side);
    assert.equal(w[0].cell, id(7, 6));
    assert.equal(ms.ball.loose, false);
    assert.equal(ms.ball.holder.side, side);
    assert.equal(ms.stats[side].looseWon, 1);
  }
  // 빈 칸에 떨어진 패스 = 흘러나온 공
  const ms = scenario({ home: { p4: [3, 6], p7: [3, 10] }, ball: { side: "home", id: "p4" } });
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7", target: id(6, 6) }) }, () => hex.step(ms, data));
  assert.equal(evs(ms, "loose").length, 1);
  assert.equal(ms.ball.loose, true);
  assert.equal(ms.ball.cell, id(6, 6));
});

test("추가시간: 300턴 끝에 정확히 1골 뒤진 팀이 공을 가졌을 때만, 한 번, 최대 25턴", () => {
  const mk = (score, ballSide) => {
    const ms = scenario({ home: { p6: [5, 6] }, away: { q6: [9, 6] }, ball: ballSide === "home" ? { side: "home", id: "p6" } : { side: "away", id: "q6" }, turn: 299 });
    ms.score = { ...score };
    return ms;
  };
  const a = mk({ home: 0, away: 1 }, "home");
  withHooks({ decide: firstTurn({ action: "hold" }) }, () => hex.step(a, data));
  assert.equal(a.stage, "addedTime");
  assert.deepEqual(evs(a, "addedTime").map((e) => e.side), ["home"]);
  assert.deepEqual(a.lastAttack, { side: "home", stage: "regular", turn: 300 });
  assert.equal(a.stageEndTurn, 325);
  hex.simulateAuto(a, data);
  assert.ok(a.finished);
  assert.ok(a.addedTime.endTurn > 300 && a.addedTime.endTurn <= 325);
  assert.ok(["shot", "lost", "time"].includes(a.addedTime.reason));
  assert.equal(evs(a, "addedTime").length, 1, "한 번만");
  // 2골 차 · 동점 친선 · 공이 앞선 팀에 있으면 그대로 끝
  for (const [score, side] of [[{ home: 0, away: 2 }, "home"], [{ home: 1, away: 1 }, "home"], [{ home: 0, away: 1 }, "away"]]) {
    const ms = mk(score, side);
    withHooks({ decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
    assert.ok(ms.finished, JSON.stringify(score) + side);
    assert.equal(ms.addedTime, null);
    assert.equal(ms.turn, 300);
  }
  // 날아가는 그 팀 패스도 "공을 가짐"
  const f = mk({ home: 1, away: 0 }, "away");
  f.pos.away.q7 = id(3, 6);
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "q7", target: id(3, 6) }) }, () => hex.step(f, data));
  assert.equal(f.stage, "addedTime");
  assert.equal(f.addedTime.side, "away");
});

test("GK 는 자기 구역 (골 칸 2칸 이내) 을 떠나지 않는다 — 바로 밖에 흘러나온 공이 있어도", () => {
  const ms = scenario({ home: { p1: [1, 6] }, ball: { loose: [2, 6] }, moveAcc: 1 });
  for (let i = 0; i < 8 && !ms.finished; i++) {
    hex.step(ms, data);
    assert.ok(G.inBox(ms.pos.home.p1, -1), `GK ${G.cellCR(ms.pos.home.p1)}`);
  }
  // GK 가 공을 잡으면 패스만 한다 (드리블 · 지키기 없음)
  const gk = scenario({ home: { p1: [0, 6], p2: [3, 5] }, ball: { side: "home", id: "p1" } });
  hex.step(gk, data);
  assert.equal(evs(gk, "pass").length, 1);
  assert.equal(gk.stats.home.holdTurns, 0);
});

test("결과 · 기록: 골 = 점수 (승부차기 제외), 슛 ≥ 골, 패스 성공 ≤ 패스, MVP = 골×3 + 겨루기 승", () => {
  for (let i = 0; i < 8; i++) {
    const ms = hex.simulateAuto(hex.createMatch({ data, seed: `st-${i}`, home: HOME, away: i % 2 ? mirror(HOME) : oppSnapshot(i % 6), kind: "goal" }), data);
    const r = hex.getResult(ms);
    for (const side of ["home", "away"]) {
      const s = r.stats[side];
      assert.equal(s.goals, ms.score[side]);
      assert.equal(Object.values(s.playerGoals).reduce((a, b) => a + b, 0), s.goals);
      assert.ok(s.shots >= s.goals);
      assert.ok(s.passesCompleted <= s.passes);
      assert.ok(s.crosses <= s.passes);
      assert.ok(s.tacklesWon <= s.tackles);
      assert.ok(s.holdTurns <= s.carrierTurns);
      assert.equal(Object.values(s.playerDuelWins).reduce((a, b) => a + b, 0), s.duelsWon);
      const ids = new Set([...Object.keys(s.playerDuelWins), ...Object.keys(s.playerGoals)]);
      if (!ids.size) assert.equal(s.mvpId, null);
      else {
        const score = (pid) => (s.playerGoals[pid] || 0) * 3 + (s.playerDuelWins[pid] || 0);
        const best = Math.max(...[...ids].map(score));
        assert.equal(score(s.mvpId), best);
      }
      assert.equal(ms.stats[side].mvpId, s.mvpId);
      assert.equal(s.skillsUsed + s.ultimatesUsed + s.combos + s.gaanpaUsed, 0, "H3 · H4 전에는 0");
    }
    // 골 뒤 킥오프는 골 먹은 쪽 (같은 턴) — 골든골 골은 경기 끝
    for (const g of evs(ms, "goal")) {
      const ko = ms.events.find((e) => e.type === "kickoff" && e.turn === g.turn);
      if (ms.events.some((e) => e.type === "end" && e.turn === g.turn)) assert.equal(ko, undefined, "끝난 골 뒤 킥오프 없음");
      else assert.equal(ko.side, g.side === "home" ? "away" : "home", `턴 ${g.turn} 골 뒤 킥오프는 골 먹은 쪽`);
    }
    if (r.penalties) {
      const kicks = ms.penalties.kicks;
      assert.equal(kicks.filter((k) => k.side === "home" && k.success).length, r.penalties.home);
    }
  }
});

test("HEX_DEFAULTS 를 data.config.hexMatch 로 덮어쓸 수 있다 (정규 턴 수)", () => {
  const d2 = { ...data, config: { ...cfg, hexMatch: { turnsRegular: 40 } } };
  const ms = hex.simulateAuto(hex.createMatch({ data: d2, seed: 3, home: HOME, away: oppSnapshot(1), kind: "friendly" }), d2);
  assert.ok(ms.turn === 40 || (ms.addedTime && ms.turn <= 65));
  assert.ok(Object.isFrozen(hex.HEX_DEFAULTS));
  assert.equal(hex.HEX_DEFAULTS.turnsRegular, hex.TURNS_REGULAR);
});

/* ------------------------------------------------------------------ */
/* 정해진 규칙 하나씩 (문서 §2 · §6.5 · 결정 5 · 9 · 10 · 12 · 19 · 20)            */
/* ------------------------------------------------------------------ */

/** 원정 스냅샷 (수비 성향만 바꿈) */
function awayWithDefense(defense, i = 4) {
  const a = oppSnapshot(i);
  a.tactics = { ...a.tactics, defense };
  return a;
}

test("수비 성향 압박 인원 (결정 19): 태클 2 · 균형 / 인터셉트 / 버티기 1 — 태클하는 수비도 세고, 쉬는 수비는 빼고", () => {
  // 홈 p6 (6,6) 지키기, 앞쪽 3칸 (7,6) · (6,5) · (6,7). q4 (7,5) · q5 (7,7) 은 한 걸음이면 앞쪽 3칸
  const front3 = G.frontCells(id(6, 6), 1);
  const pressing = (ms, skip) => Object.entries(ms.pos.away).filter(([pid, c]) => pid !== skip && front3.includes(c)).length;
  for (const defense of ["tackle", "balanced", "intercept", "hold"]) {
    const n = defense === "tackle" ? 2 : 1;
    for (const turn of [10, 11]) {
      // 태클 없는 턴: n 명이 앞쪽 3칸으로
      const a = scenario({ awaySnap: awayWithDefense(defense), home: { p6: [6, 6] }, away: { q4: [7, 5], q5: [7, 7] }, ball: { side: "home", id: "p6" }, moveAcc: 1, turn });
      withHooks({ decide: firstTurn({ action: "hold" }) }, () => hex.step(a, data));
      assert.equal(evs(a, "tackle").length, 0);
      assert.equal(pressing(a, null), n, `${defense} 턴 ${turn}: 태클 없는 턴 압박 ${n}`);
      // 태클 턴: q6 (7,6) 이 태클 → 그 수비가 한 자리 — 나머지 n − 1 명만 더 온다
      const b = scenario({ awaySnap: awayWithDefense(defense), home: { p6: [6, 6] }, away: { q4: [7, 5], q5: [7, 7], q6: [7, 6] }, ball: { side: "home", id: "p6" }, moveAcc: 1, turn });
      withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(b, data));
      assert.equal(evs(b, "tackle")[0].tacklerId, "q6");
      assert.equal(pressing(b, "q6"), n - 1, `${defense} 턴 ${turn}: 태클 턴은 태클한 수비 포함 ${n}`);
      // 넘어진 다음 턴: 바로 뒤 (5,6) 에 쉬는 q6 은 압박 자리를 차지하지 않는다 → 그대로 n 명
      const c = scenario({ awaySnap: awayWithDefense(defense), home: { p6: [6, 6] }, away: { q4: [7, 5], q5: [7, 7], q6: [5, 6] }, ball: { side: "home", id: "p6" }, moveAcc: 1, turn });
      c.live.away.q6.restUntil = c.turn + 1;
      withHooks({ decide: firstTurn({ action: "hold" }) }, () => hex.step(c, data));
      assert.equal(c.pos.away.q6, id(5, 6), "쉬는 수비는 제자리");
      assert.equal(pressing(c, "q6"), n, `${defense} 턴 ${turn}: 쉬는 수비는 압박 인원에서 빠진다`);
    }
  }
});

test("가려는 칸 맡아 두기 (§2.2-3): 공 가진 선수의 드리블 칸에는 아무도 못 들어간다 — 상대가 먼저 움직이는 턴에도", () => {
  // p6 (6,6) → 가려는 칸 (7,6) (빈 칸). q2 (6,5) 가 태클 (공 지킴) 이라 p6 은 이동 단계에서 묶여 있다가 태클 뒤에 들어간다.
  // q3 (8,6) (태클 성향 압박 1명 = 가장 가까운 수비) · 동료 p7 (7,7) 은 한 걸음이면 (7,6)
  for (const turn of [10, 11]) {
    const ms = scenario({ home: { p6: [6, 6], p7: [7, 7] }, away: { q2: [6, 5], q3: [8, 6] }, ball: { side: "home", id: "p6" }, moveAcc: 1, turn });
    withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "dribble", target: id(7, 6) }) }, () => hex.step(ms, data));
    const t = evs(ms, "tackle")[0];
    assert.equal(t.tacklerId, "q2");
    assert.equal(t.success, false);
    assert.deepEqual(at(ms, "home", "p6"), [7, 6], `턴 ${turn + 1}: 맡아 둔 칸으로 들어간다`);
    assert.notEqual(ms.pos.away.q3, id(7, 6));
    assert.notEqual(ms.pos.home.p7, id(7, 6));
    assert.equal(ms.stats.home.dribblesPast, 1);
  }
});

test("태클 실패 · 가던 칸이 태클한 수비 말고 다른 사람에게 막힘: 둘 다 제자리, 수비만 넘어진다 (GK 미끄러지기 제한 포함)", () => {
  // p6 (12,6) 은 GK 구역 밖, 정면 (13,6) = GK q1 (구역 안). 앞 대각 (12,5) · (12,7) = q2 · q3.
  // 드리블로 (13,6) 을 노림 → GK 는 미끄러질 칸 (12,6) 이 구역 밖이라 태클 못 함 → q2 · q3 중 하나
  const ms = scenario({ home: { p6: [12, 6] }, away: { q1: [13, 6], q2: [12, 5], q3: [12, 7] }, ball: { side: "home", id: "p6" } });
  const T = ms.turn + 1;
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "dribble", target: id(13, 6) }) }, () => hex.step(ms, data));
  const t = evs(ms, "tackle");
  assert.equal(t.length, 1);
  assert.notEqual(t[0].tacklerId, "q1", "구역 밖으로는 GK 태클 없음");
  assert.equal(t[0].success, false);
  assert.equal(ms.pos.away.q1, id(13, 6));
  assert.deepEqual(at(ms, "home", "p6"), [12, 6], "가던 칸이 막혀 제자리");
  assert.equal(t[0].carrierTo, t[0].carrierFrom);
  assert.equal(t[0].tacklerTo, t[0].tacklerFrom);
  assert.equal(ms.pos.away[t[0].tacklerId], t[0].tacklerFrom);
  assert.equal(ms.live.away[t[0].tacklerId].restUntil, T + 1);
  assert.equal(ms.live.away.q1.restUntil, -1, "GK 는 넘어지지 않는다");
  assert.equal(ms.stats.home.dribblesPast, 0);
  // 지키기는 GK 도 태클 (늘)
  const hold = scenario({ home: { p6: [12, 6] }, away: { q1: [13, 6] }, ball: { side: "home", id: "p6" } });
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(hold, data));
  assert.equal(evs(hold, "tackle")[0].tacklerId, "q1");
  // 미끄러질 칸이 구역 안 (13,5) 이면 드리블에도 GK 태클
  const inZone = scenario({ home: { p6: [13, 5] }, away: { q1: [14, 6] }, ball: { side: "home", id: "p6" } });
  withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "dribble", target: id(14, 6) }) }, () => hex.step(inZone, data));
  assert.equal(evs(inZone, "tackle")[0].tacklerId, "q1");
});

test("드리블 가려는 칸 (§2.2-2): 앞쪽 3칸 중 골에 가장 가까운 빈 칸 (같으면 정면 → 앞 대각 순서)", () => {
  const dribbleTo = (home) => {
    const ms = scenario({ home, ball: { side: "home", id: "p6" }, moveAcc: 1 });
    withHooks({ decide: firstTurn({ action: "dribble" }) }, () => hex.step(ms, data));
    return at(ms, "home", "p6");
  };
  // (6,6): 앞쪽 3칸 모두 골까지 8 → 정면 (7,6)
  assert.deepEqual(dribbleTo({ p6: [6, 6] }), [7, 6]);
  // (12,1): 정면 (13,1) 4 · 앞 위 (13,0) 5 · 앞 아래 (13,2) 3 → (13,2)
  assert.deepEqual(dribbleTo({ p6: [12, 1] }), [13, 2]);
  // (13,2) 를 동료가 막음 → 남은 빈 칸 중 가까운 정면 (13,1)
  assert.deepEqual(dribbleTo({ p6: [12, 1], p7: [13, 2] }), [13, 1]);
});

test("이동률 (결정 5 · §2.3): rate 0.8 선수는 정해진 박자로 5턴에 4번 (주사위 없음)", () => {
  const home = clone(HOME);
  const p6 = home.players.find((p) => p.id === "p6");
  p6.stats.dribble = 333;
  p6.stats.physical = 334; // s = 333.5 → rate = 0.7 + 0.3·0.3335 ≈ 0.80
  p6.style = "power";
  const ms = scenario({ homeSnap: home, home: { p6: [2, 6] }, ball: { loose: [13, 6] }, moveAcc: 0 });
  const moves = [];
  for (let i = 0; i < 5; i++) {
    const before = ms.pos.home.p6;
    hex.step(ms, data);
    moves.push(ms.pos.home.p6 !== before ? 1 : 0);
  }
  assert.deepEqual(moves, [0, 1, 1, 1, 1]);
  assert.ok(Math.abs(ms.live.home.p6.moveAcc) < 0.01, "5턴 뒤 쌓인 값은 다시 0 근처");
});

test("슛 막는 수비: 슛한 선수 앞쪽 3칸의 턴 시작 칸 — GK · 쉬는 수비는 빼고, 막는 수비마다 골 확률이 내려간다", () => {
  // p7 (12,6) 슛: 앞쪽 3칸 (13,6) = GK, (12,5) = q2, (12,7) = q3
  const shot = (away, rest) => {
    const ms = scenario({ home: { p7: [12, 6] }, away, ball: { side: "home", id: "p7" } });
    for (const pid of rest) ms.live.away[pid].restUntil = ms.turn + 1;
    withHooks({ roll: (k) => (k === "shot" ? false : undefined), decide: firstTurn({ action: "shoot" }) }, () => hex.step(ms, data));
    return evs(ms, "shot")[0];
  };
  const one = shot({ q1: [13, 6], q2: [12, 5], q3: [12, 7] }, ["q2"]);
  assert.equal(one.blockers, 1, "GK · 쉬는 q2 는 빼고");
  const two = shot({ q1: [13, 6], q2: [12, 5], q3: [12, 7] }, []);
  assert.equal(two.blockers, 2);
  const none = shot({ q1: [13, 6] }, []);
  assert.equal(none.blockers, 0);
  assert.ok(none.p > one.p && one.p > two.p, `${none.p} > ${one.p} > ${two.p}`);
  // 턴 시작 칸: q3 (13,7) 은 그 턴 이동으로 앞쪽 3칸에 들어올 수 있어도 슛은 이동 전에 떠난다 → 0
  const late = shot({ q1: [14, 6], q3: [13, 8] }, []);
  assert.equal(late.blockers, 0);
});

test("헤더를 막는 수비는 크로스가 도착한 뒤 (이동 뒤) 칸으로 센다 [구현 결정]", () => {
  // p4 (11,2) → p6 (13,6) 크로스. q4 (12,8) 은 턴 시작엔 p6 앞쪽 3칸 밖, 그 턴 이동으로 앞쪽 3칸에 들어온다
  const p6c = id(13, 6);
  const fr = G.frontCells(p6c, 1);
  const ms = scenario({ home: { p4: [11, 2], p6: [13, 6] }, away: { q4: [12, 8] }, ball: { side: "home", id: "p4" }, moveAcc: 1 });
  let startIn = null;
  withHooks({ roll: (k) => (k === "aerial" ? true : k === "header" ? false : undefined), decide: firstTurn({ action: "cross", receiverId: "p6", target: p6c }) }, () => {
    for (let i = 0; i < 3 && !evs(ms, "shot").length; i++) {
      startIn = fr.includes(ms.pos.away.q4);
      hex.step(ms, data);
    }
  });
  const shot = evs(ms, "shot")[0];
  assert.equal(shot.header, true);
  assert.equal(startIn, false, "헤더 턴 시작엔 앞쪽 3칸 밖");
  assert.ok(fr.includes(ms.pos.away.q4), "이동 뒤엔 앞쪽 3칸 안");
  assert.equal(shot.blockers, 1);
});

test("가로채기 순서: 먼저 지나는 칸 → 같은 칸이면 길 위가 옆보다 먼저 · 패스한 선수 옆에만 있는 수비는 굴리지 않는다", () => {
  // p4 (3,6) → p7 (6,6): 길 (4,6) (5,6) (6,6). q5 (2,5) 는 p4 옆에만, q2 (3,5) 는 (4,6) 옆, q3 은 (4,6) 위, q4 는 (5,6) 위.
  // q2 · q3 은 공까지 거리 1 로 같고 이동 순서는 q2 (DF 앞 slot) 가 먼저 — 그래도 길 위 q3 이 먼저 굴린다
  const ms = scenario({ home: { p4: [3, 6], p7: [6, 6] }, away: { q2: [3, 5], q3: [4, 6], q4: [5, 6], q5: [2, 5] }, ball: { side: "home", id: "p4" } });
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7", target: id(6, 6) }) }, () => hex.step(ms, data));
  assert.deepEqual(evs(ms, "intercept").map((e) => e.defenderId), ["q3", "q2", "q4"]);
});

test("도착 칸에 상대: 받는 선수에게 가장 가까운 옆 빈 칸으로 튄다 · 옆이 다 막혔으면 그 상대가 갖는다 (looseWon 기록 +1)", () => {
  // p4 (3,6) → (6,6) 에 쉬는 q2. 받는 p7 (8,8)
  const ms = scenario({ home: { p4: [3, 6], p7: [8, 8] }, away: { q2: [6, 6] }, ball: { side: "home", id: "p4" } });
  ms.live.away.q2.restUntil = ms.turn + 1;
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7", target: id(6, 6) }) }, () => hex.step(ms, data));
  const loose = evs(ms, "loose");
  assert.equal(loose.length, 1);
  assert.equal(evs(ms, "receive").length, 0);
  assert.ok(ms.ball.loose);
  const occ = new Set([...Object.values(ms.pos.home), ...Object.values(ms.pos.away)]);
  const free = G.neighbors(id(6, 6)).filter((c) => !occ.has(c));
  assert.ok(free.includes(loose[0].cell));
  const rc = ms.pos.home.p7;
  for (const c of free) assert.ok(G.distance(loose[0].cell, rc) <= G.distance(c, rc));
  // 옆 6칸이 모두 (쉬는 선수로) 막힘 → (6,6) 의 쉬는 q2 가 공을 갖는다
  const nb = G.neighbors(id(6, 6)).map((c) => G.cellCR(c));
  const full = scenario({
    home: { p4: [3, 6], p7: [10, 10], p5: nb[0], p6: nb[1] },
    away: { q2: [6, 6], q3: nb[2], q4: nb[3], q5: nb[4], q6: nb[5] },
    ball: { side: "home", id: "p4" },
  });
  for (const pid of ["p5", "p6"]) full.live.home[pid].restUntil = full.turn + 1;
  for (const pid of ["q2", "q3", "q4", "q5", "q6"]) full.live.away[pid].restUntil = full.turn + 1;
  withHooks({ roll: () => true, decide: firstTurn({ action: "pass", receiverId: "p7", target: id(6, 6) }) }, () => hex.step(full, data));
  assert.deepEqual(full.ball.holder, { side: "away", id: "q2" });
  assert.deepEqual(evs(full, "looseWon").map((e) => e.playerId), ["q2"]);
  assert.equal(full.stats.away.looseWon, 1, "이벤트와 기록이 같다");
});

test("쉬는 수비는 태클을 돕지 않고 (+10%) 공중볼에도 끼지 않는다", () => {
  const tackleP = (away, rest) => {
    const ms = scenario({ home: { p6: [6, 6] }, away, ball: { side: "home", id: "p6" } });
    if (rest) ms.live.away.q3.restUntil = ms.turn + 1;
    withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
    return evs(ms, "tackle")[0];
  };
  const solo = tackleP({ q2: [7, 6] }, false);
  const helped = tackleP({ q2: [7, 6], q3: [5, 6] }, false);
  const restHelp = tackleP({ q2: [7, 6], q3: [5, 6] }, true);
  assert.ok(helped.p > solo.p, "옆 수비 1명이 돕는다");
  assert.equal(restHelp.p, solo.p, "쉬는 수비는 돕지 않는다");
  // 크로스 (11,2) → p6 (12,7): 떨어질 칸 옆 q4 (12,8, 수비 최고) 가 쉬면 공중볼 상대가 아니다 (GK 등 다른 수비만)
  const strong = oppSnapshot(0);
  strong.players.find((p) => p.id === "q4").stats.defense = 999;
  for (const rest of [false, true]) {
    const ms = scenario({ awaySnap: strong, home: { p4: [11, 2], p6: [12, 7] }, away: { q4: [12, 8] }, ball: { side: "home", id: "p4" } });
    if (rest) ms.live.away.q4.restUntil = ms.turn + 5;
    withHooks({ roll: (k) => (k === "aerial" ? true : k === "header" ? false : undefined), decide: firstTurn({ action: "cross", receiverId: "p6", target: id(12, 7) }) }, () => {
      for (let i = 0; i < 3 && !evs(ms, "receive").length; i++) hex.step(ms, data);
    });
    assert.equal(evs(ms, "receive")[0].playerId, "p6");
    const aer = evs(ms, "aerial");
    if (rest) assert.ok(aer.every((e) => e.defenderId !== "q4"), "쉬는 수비는 공중볼 없음");
    else assert.deepEqual(aer.map((e) => e.defenderId), ["q4"], "공중볼 겨루기 = 버티기 값 최고");
  }
});

test("골든골 (결정 10): 300턴 동점 → 킥오프 없이 그대로 75턴 → 승부차기 5명씩 (모두 넣으면 10킥 뒤 서든데스)", () => {
  const ms = scenario({ home: { p6: [6, 6] }, ball: { side: "home", id: "p6" }, turn: 299, kind: "goal" });
  ms.score = { home: 1, away: 1 };
  const holder = clone(ms.ball.holder);
  withHooks({ roll: (k) => (k === "shot" || k === "header" ? false : undefined), decide: firstTurn({ action: "hold" }) }, () => {
    hex.step(ms, data);
    assert.equal(ms.stage, "goldenGoal");
    assert.equal(ms.turn, 300);
    assert.equal(ms.stageEndTurn, 300 + hex.GOLDEN_TURNS);
    assert.equal(evs(ms, "kickoff").length, 0, "골든골은 킥오프 없이 이어서");
    assert.deepEqual(ms.ball.holder, holder);
    while (ms.stage !== "penalties") hex.step(ms, data);
  });
  assert.equal(ms.turn, 375);
  assert.equal(evs(ms, "penalties")[0].turn, 375);
  // 승부차기: 모두 넣으면 5 : 5 → 서든데스, 그다음 홈 골 · 원정 실축이면 끝
  let k = 0;
  withHooks({ roll: (kind) => (kind === "penalty" ? (++k <= 10 ? true : k === 11) : undefined) }, () => {
    for (let i = 0; i < 10; i++) hex.step(ms, data);
    assert.equal(ms.penalties.kicks.length, 10);
    assert.equal(ms.penalties.suddenDeath, true);
    assert.ok(!ms.finished);
    hex.step(ms, data);
    hex.step(ms, data);
  });
  assert.ok(ms.finished);
  assert.equal(ms.penalties.kicks.length, 12);
  assert.equal(hex.getResult(ms).winner, "home");
  assert.equal(ms.turn, 375, "승부차기 중에는 턴이 늘지 않는다");
});

test("추가시간 (결정 20): 뒤진 팀이 공을 잃으면 그 턴에 끝난다 (reason lost)", () => {
  const ms = scenario({ home: { p6: [6, 6] }, ball: { side: "home", id: "p6" }, turn: 299, kind: "goal" });
  ms.score = { home: 0, away: 1 };
  withHooks({ decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(ms.stage, "addedTime");
  // 다음 턴: 앞쪽 빈 칸에 수비를 세우고 지키기 → 태클 성공 (공 잃음)
  const taken = new Set([...Object.values(ms.pos.home), ...Object.values(ms.pos.away)]);
  ms.pos.away.q2 = G.frontCells(ms.pos.home.p6, 1).find((c) => !taken.has(c));
  withHooks({ roll: (k) => (k === "tackle" ? false : undefined), decide: () => ({ action: "hold" }) }, () => hex.step(ms, data));
  assert.equal(evs(ms, "tackle")[0].success, true);
  assert.equal(ms.addedTime.reason, "lost");
  assert.equal(ms.addedTime.endTurn, 301);
  assert.ok(ms.finished);
  assert.equal(hex.getResult(ms).winner, "away");
});

test("숫자 id 도 받는다 (문자열로 맞춤) · getResult(null) · simulateAuto(null) 은 예전처럼 null", () => {
  const num = clone(HOME);
  num.players.forEach((p, i) => { p.id = i + 1; });
  num.tactics = { ...num.tactics, kickoffPlayerId: 6 };
  const ms = hex.createMatch({ data, seed: 1, home: num, away: oppSnapshot(0), kind: "goal" });
  assert.deepEqual(ms.home.players.map((p) => p.id), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.equal(ms.events[0].playerId, "6", "kickoffPlayerId 도 문자열로");
  for (const seed of [1, 2, 3]) {
    const m2 = hex.simulateAuto(hex.createMatch({ data, seed, home: num, away: oppSnapshot(0), kind: "goal" }), data);
    assert.ok(m2.finished);
  }
  assert.equal(num.players[0].id, 1, "입력 스냅샷은 그대로");
  const dup = clone(HOME);
  dup.players[0].id = 1;
  dup.players[1].id = "1";
  assert.throws(() => hex.createMatch({ data, seed: 1, home: dup, away: oppSnapshot(0) }), /중복/);
  assert.equal(hex.getResult(null), null);
  assert.equal(hex.simulateAuto(null, data), null);
  assert.equal(hex.isFinished(null), false);
});

test("hexMatch 덮어쓰기에서 tackleCoef null = config.match.actionCoef.tackle (다른 키의 null 은 기본값)", () => {
  const tackleP = (d) => {
    const ms = scenario({ home: { p6: [6, 6] }, away: { q2: [7, 6] }, ball: { side: "home", id: "p6" } });
    withHooks({ roll: (k) => (k === "tackle" ? true : undefined), decide: firstTurn({ action: "hold" }) }, () => hex.step(ms, d));
    return evs(ms, "tackle")[0].p;
  };
  const withOver = (o) => ({ ...data, config: { ...cfg, hexMatch: o } });
  const def = tackleP(data);
  assert.equal(tackleP(withOver({ tackleCoef: hex.HEX_DEFAULTS.tackleCoef })), def);
  const cfgCoef = tackleP(withOver({ tackleCoef: cfg.match.actionCoef.tackle }));
  assert.notEqual(cfgCoef, def);
  assert.equal(tackleP(withOver({ tackleCoef: null })), cfgCoef, "null = config 값");
  assert.equal(tackleP(withOver({ turnsRegular: null })), def, "다른 키의 null 은 기본값");
});

/* ------------------------------------------------------------------ */
/* 좌우 대칭: 한 장면과 그 거울 장면은 같은 주사위로 정확히 거울상으로 흘러간다       */
/* ------------------------------------------------------------------ */

const swapSideReal = (s) => (s === "home" ? "away" : "home");
const EVENT_CELL_KEYS = ["fromCell", "target", "intended", "cell", "carrierFrom", "carrierTo", "tacklerFrom", "tacklerTo"];
/** 비교용 모습. flip = 거울 틀로 옮김 (두 팀 맞바꿈 · 칸 거울), dt = 턴 밀기 */
function viewOf(ms, flip, dt) {
  const m = flip ? G.mirrorId : (c) => c;
  const swapSide = flip ? swapSideReal : (s) => s;
  const pos = { home: {}, away: {} };
  for (const s of ["home", "away"]) for (const [pid, c] of Object.entries(ms.pos[s])) pos[swapSide(s)][pid] = m(c);
  const shift = (L) => Object.fromEntries(Object.entries(L).map(([pid, v]) => [pid, { moveAcc: v.moveAcc, restUntil: v.restUntil >= 0 ? v.restUntil + dt : v.restUntil }]));
  const b = ms.ball;
  return {
    turn: ms.turn + dt,
    pos,
    live: { [swapSide("home")]: shift(ms.live.home), [swapSide("away")]: shift(ms.live.away) },
    ball: {
      holder: b.holder ? { side: swapSide(b.holder.side), id: b.holder.id } : null,
      cell: m(b.cell),
      flight: b.flight ? { ...b.flight, side: swapSide(b.flight.side), path: b.flight.path.map(m), target: m(b.flight.target), intendedTarget: m(b.flight.intendedTarget) } : null,
      loose: b.loose,
      holdStreak: b.holdStreak,
    },
    score: { [swapSide("home")]: ms.score.home, [swapSide("away")]: ms.score.away },
    possessions: ms.possessions,
    rngState: ms.rngState,
    events: ms.events.map((e) => {
      const o = { ...e, turn: e.turn + dt };
      if (o.side) o.side = swapSide(o.side);
      for (const k of EVENT_CELL_KEYS) if (typeof o[k] === "number") o[k] = m(o[k]);
      if (o.score) o.score = { [swapSide("home")]: o.score.home, [swapSide("away")]: o.score.away };
      return o;
    }),
  };
}
const mirrorView = (ms, dt) => viewOf(ms, true, dt);
const plainView = (ms) => viewOf(ms, false, 0);
/**
 * 거울 장면: 원정 스냅샷을 홈으로 · 홈 스냅샷을 원정으로 만들고, 자리 · 공 · 이동률 · 점수를 거울로 옮긴다.
 * 턴은 1 밀어 "먼저 움직이는 팀" (홀수 턴 홈) 도 맞바꾼다. 같은 시드라 주사위 상태도 같다.
 */
function mirrorMatch(A, homeSnap, awaySnap) {
  const B = hex.createMatch({ data, seed: A.seed, home: awaySnap, away: homeSnap, kind: A.kind });
  const v = mirrorView(A, 1);
  B.pos = clone(v.pos);
  B.live = clone(v.live);
  B.ball = clone(v.ball);
  B.events = clone(v.events);
  B.score = clone(v.score);
  B.turn = v.turn;
  B.possessions = A.possessions;
  B.possessionSide = A.possessionSide ? swapSideReal(A.possessionSide) : null;
  B.rngState = A.rngState;
  return B;
}

test("좌우 대칭 (판 + 엔진): 거울 장면은 같은 주사위로 매 턴 정확히 거울상 — 자리 · 공 · 이벤트 · 점수 (골 · 킥오프 포함)", () => {
  let goals = 0;
  let passes = 0;
  let tackles = 0;
  for (let k = 0; k < 4; k++) {
    const awaySnap = k % 2 ? mirror(HOME) : oppSnapshot(k);
    const A = hex.createMatch({ data, seed: `sym-${k}`, home: HOME, away: awaySnap, kind: "friendly" });
    const B = mirrorMatch(A, HOME, awaySnap);
    assert.deepEqual(plainView(B), mirrorView(A, 1), "시작 장면이 거울상");
    for (let t = 0; t < 200; t++) {
      hex.step(A, data);
      hex.step(B, data);
      assert.deepEqual(plainView(B), mirrorView(A, 1), `sym-${k} 턴 ${A.turn} 에서 거울이 깨짐`);
    }
    goals += A.score.home + A.score.away;
    passes += evs(A, "pass").length;
    tackles += evs(A, "tackle").length;
  }
  assert.ok(goals > 0 && passes > 0 && tackles > 0, "골 · 패스 · 태클이 나오는 구간을 비교했다");
});

test("좌우 대칭 (장면): 공 가진 선수의 선택 · 가려는 칸 · 패스 칸과 동률 이웃 고르기가 거울 장면에서 거울상", () => {
  const scenes = [
    // 홈 공격 (→) 홀수 행 측면 — 드리블 / 크로스 / 패스 중 하나
    { home: { p6: [9, 3], p7: [11, 6], p4: [7, 8] }, away: { q2: [12, 5], q3: [11, 8] }, ball: { side: "home", id: "p6" } },
    // 압박 받는 가운데 빌드업
    { home: { p4: [6, 5], p5: [4, 7], p7: [9, 6] }, away: { q6: [7, 5], q4: [7, 7] }, ball: { side: "home", id: "p4" } },
    // 원정 공격 (←) 박스 근처
    { home: { p2: [2, 5], p3: [3, 8] }, away: { q6: [4, 6], q7: [3, 3] }, ball: { side: "away", id: "q6" } },
    // 세로로 똑바로 가는 쫓기: (7,6) → 흘러나온 공 (7,4) — 이웃 (7,5) · (6,5) 이 거리 · 직선거리 모두 같은 동률
    { home: { p6: [7, 6] }, away: {}, ball: { loose: [7, 4] }, moveAcc: 1 },
  ];
  const kinds = new Set();
  for (const [i, sc] of scenes.entries()) {
    for (const turn of [10, 11]) {
      const A = scenario({ ...sc, turn });
      const B = mirrorMatch(A, HOME, oppSnapshot(0));
      for (let t = 0; t < 3 && !A.finished; t++) {
        const n = A.events.length;
        hex.step(A, data);
        hex.step(B, data);
        for (const e of A.events.slice(n)) kinds.add(e.type);
        assert.deepEqual(plainView(B), mirrorView(A, 1), `장면 ${i} (턴 ${turn}) step ${t + 1}`);
      }
    }
  }
  assert.ok(kinds.has("pass") || kinds.has("tackle"), "선택이 실제로 나온 장면을 비교했다");
  // 동률 쫓기: 홈은 (7,5) 로 (홈 기준 순서 E, NE, SE, …), 거울 장면의 원정은 그 거울 (6,5) 로 — 같은 칸이 아니다
  const A = scenario({ home: { p6: [7, 6] }, ball: { loose: [7, 4] }, moveAcc: 1, turn: 10 });
  const B = mirrorMatch(A, HOME, oppSnapshot(0));
  hex.step(A, data);
  hex.step(B, data);
  assert.deepEqual(at(A, "home", "p6"), [7, 5]);
  assert.deepEqual(at(B, "away", "p6"), [6, 5]);
});
