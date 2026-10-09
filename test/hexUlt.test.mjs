// test/hexUlt.test.mjs — 육각 엔진 필살기 (js/engine/hexUlt.js + hexMatch.js 연결). HEX_AUTOBATTLE_PLAN §3 · 결정 8 · §4.1 · §4.2 · §6.4, H3 SPEC §1
//   게이지 (시작 · 얻기 · 상한 · 킥오프 뒤에도) · 켜기 (가득 찼을 때만) · 유형마다 터지는 상황 (슛 minLine 3 = 박스 · 세이브 = 다음 슛 ·
//   드리블 = 태클 · 수비 = 먼저 태클 + 산맥 쐐기 패스 턴 · 팀 = 바로, teamUltTurns 뒤 끝) · 배수가 p 에 닿는지 (켬 / 안 켬 비교) ·
//   옆 수비 무시 · extraLine · 확실한 배급 · 합체기 (실루엔 → 그레타, 연습 선수단) · 역컷인 · AI 규칙 · 사람 쪽은 저절로 안 켬 ·
//   simulateAuto = 양쪽 AI · 결정성 (같은 시드 + 같은 입력 = 같은 JSON, 입력 기록 다시 돌리기).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as hex from "../js/engine/hexMatch.js";
import * as U from "../js/engine/hexUlt.js";
import * as G from "../js/engine/hexGrid.js";
import { practiceSetup } from "../js/ui/practice.js";

const data = loadData();
const cfg = data.config;
const SQ = practiceSetup(LR, data, "ult-test");
const id = (c, r) => G.cellId(c, r);
const at = (ms, side, pid) => G.cellCR(ms.pos[side][pid]);
const evs = (ms, type) => ms.events.filter((e) => e.type === type);
const MAX = cfg.match.ultimate.gaugeMax;
const D = hex.HEX_DEFAULTS;
const odds = (p) => p / (1 - p);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

/** 선수 스킬 바꾼 스냅샷 (연습 선수단 기준) */
function withSkill(snap, pid, skillId, stats = null) {
  const t = clone(snap);
  const p = t.players.find((x) => x.id === pid);
  p.skillIds = skillId ? [skillId] : [];
  if (stats) Object.assign(p.stats, stats);
  return t;
}

/**
 * 장면: 판을 비우고 지정한 선수만 놓는다 (나머지 필드 선수는 먼 구석, GK 는 자기 골 앞). 게이지는 남긴다 (gauge 로 덮어쓰기).
 * ai = state.aiSides (기본: 아무도 — 시험이 켜는 것만), gauge = { "home:p7": 100, … }
 */
function scene({ home = {}, away = {}, ball, turn = 10, kind = "friendly", moveAcc = 0, homeSnap = SQ.home, awaySnap = SQ.away, ai = [], gauge = {}, humanSide = "home" } = {}) {
  const ms = hex.createMatch({ data, seed: "ult-scene", home: homeSnap, away: awaySnap, kind, humanSide });
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
  for (const [k, v] of Object.entries(gauge)) {
    const [s, pid] = k.split(":");
    ms.live[s][pid].gauge = v;
  }
  ms.turn = turn;
  ms.events = [];
  ms.aiSides = ai.slice();
  if (ball) {
    ms.ball = { holder: { side: ball.side, id: ball.id }, cell: ms.pos[ball.side][ball.id], flight: null, loose: false, holdStreak: 0 };
    ms.possessionSide = ball.side;
  }
  return ms;
}

/** 덮어쓰기를 걸고 step 한 번 (input 포함) — rolls 에 (kind, p, info) 기록 */
function stepWith(ms, { roll = null, decide = null, input = null, d = data } = {}) {
  const rolls = [];
  hex.setHexRollForTest((kind, p, info) => {
    rolls.push({ kind, p, info });
    return roll ? roll(kind, p, info) : undefined;
  });
  let used = false;
  hex.setHexDecisionForTest(decide ? () => (used ? undefined : ((used = true), decide)) : null);
  try {
    hex.step(ms, d, input);
  } finally {
    hex.setHexRollForTest(null);
    hex.setHexDecisionForTest(null);
  }
  return rolls;
}
const arm = (side, playerId) => ({ ultimates: [{ side, playerId, op: "arm" }] });
const disarm = (side, playerId) => ({ ultimates: [{ side, playerId, op: "disarm" }] });
const live = (ms, side, pid) => ms.live[side][pid];
const cutins = (ms) => evs(ms, "cutin");

/* ------------------------------------------------------------------ */
/* 게이지                                                                 */
/* ------------------------------------------------------------------ */

test("게이지: 필살기 선수만 gaugeStart · armed false, AI 쪽 = 사람이 아닌 쪽, 팀 필살기 자리 · 필살기 없는 스냅샷은 게이지 없음", () => {
  const ms = hex.createMatch({ data, seed: 1, home: SQ.home, away: SQ.away, kind: "friendly" });
  assert.equal(ms.version, 2);
  for (const side of ["home", "away"]) {
    for (const pid of ms.order[side]) {
      assert.equal(live(ms, side, pid).gauge, cfg.match.ultimate.gaugeStart);
      assert.equal(live(ms, side, pid).armed, false);
    }
  }
  assert.deepEqual(ms.aiSides, ["away"]);
  assert.deepEqual(ms.teamUlt, { home: null, away: null });
  const noUlt = clone(SQ.away);
  for (const p of noUlt.players) p.skillIds = [];
  const ms2 = hex.createMatch({ data, seed: 1, home: SQ.home, away: noUlt, kind: "goal", humanSide: "away" });
  assert.deepEqual(ms2.aiSides, ["home"]);
  for (const pid of ms2.order.away) assert.ok(!("gauge" in live(ms2, "away", pid)), "필살기 없는 상대는 게이지 없음");
  // 없는 스킬 id · 유스는 건너뜀 (육각은 검사하지 않는다)
  const odd = withSkill(SQ.home, "p7", "sk_no_such_skill");
  odd.players.find((p) => p.id === "p6").isYouth = true;
  const ms3 = hex.createMatch({ data, seed: 1, home: odd, away: SQ.away });
  assert.ok(!("gauge" in live(ms3, "home", "p7")));
  assert.ok(!("gauge" in live(ms3, "home", "p6")));
  // 상태는 JSON 만
  assert.deepEqual(JSON.parse(JSON.stringify(ms3)), ms3);
});

test("게이지 얻기: 턴마다 +gaugePerTurn · 태클 성공 +gaugeDuelWin · 패스 받기 +gaugeReceive · 골 +gaugeGoal (겨루기 승 더해) · 상한 · 킥오프 뒤에도 남음", () => {
  // 지키기 태클 성공: 태클한 m_p6 +duel, 나머지 턴 게이지만
  const ms = scene({ home: { p6: [6, 6] }, away: { m_p6: [7, 6] }, ball: { side: "home", id: "p6" }, gauge: { "away:m_p6": 40, "home:p6": 40, "home:p4": 99.9 } });
  stepWith(ms, { roll: (k) => (k === "tackle" ? false : undefined), decide: { action: "hold" } });
  assert.equal(evs(ms, "tackle")[0].success, true);
  assert.equal(live(ms, "away", "m_p6").gauge, 40 + D.gaugeDuelWin + D.gaugePerTurn);
  assert.equal(live(ms, "home", "p6").gauge, 40 + D.gaugePerTurn);
  assert.equal(live(ms, "home", "p4").gauge, MAX, "상한");
  // 패스 받기
  const pm = scene({ home: { p4: [5, 6], p7: [7, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p7": 20 } });
  stepWith(pm, { decide: { action: "pass", receiverId: "p7", target: id(7, 6) } });
  assert.equal(evs(pm, "receive").length, 1);
  assert.equal(live(pm, "home", "p7").gauge, 20 + D.gaugeReceive + D.gaugePerTurn);
  // 골: 겨루기 승 + 골, 킥오프로 live 를 다시 만들어도 게이지 · 켬은 남는다
  const gm = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": 50, "home:p4": MAX, "home:p5": 77 } });
  live(gm, "home", "p4").armed = true;
  stepWith(gm, { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(evs(gm, "goal").length, 1);
  assert.equal(evs(gm, "kickoff").length, 1);
  assert.equal(live(gm, "home", "p7").gauge, 50 + D.gaugeDuelWin + D.gaugeGoal + D.gaugePerTurn);
  assert.equal(live(gm, "home", "p4").gauge, MAX);
  assert.equal(live(gm, "home", "p4").armed, true, "가득 찬 채 켠 것은 골 뒤에도 켠 채로");
  assert.equal(live(gm, "home", "p5").gauge, 77 + D.gaugePerTurn);
  assert.equal(live(gm, "home", "p4").moveAcc, 0, "킥오프 live 는 새로");
});

test("켜기: 게이지가 가득 찼을 때만 · 끄기는 게이지 그대로 · 없는 선수 · 필살기 없는 선수 · 승부차기 · 끝난 경기는 무시", () => {
  const ms = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: { "home:p7": MAX - 0.1, "home:p5": MAX } });
  stepWith(ms, { input: { ultimates: [{ side: "home", playerId: "p7", op: "arm" }, { side: "home", playerId: "p5", op: "arm" }, { side: "home", playerId: "nobody", op: "arm" }, { side: "x", playerId: "p5", op: "arm" }, null] } });
  assert.equal(live(ms, "home", "p7").armed, false, "99.9 은 안 됨");
  assert.equal(live(ms, "home", "p5").armed, true);
  stepWith(ms, { input: disarm("home", "p5") });
  assert.equal(live(ms, "home", "p5").armed, false);
  assert.equal(live(ms, "home", "p5").gauge, MAX, "끄면 게이지 그대로");
  // 숫자 id 도 문자열로 맞춰 받는다
  stepWith(ms, { input: { ultimates: [{ side: "home", playerId: "p5", op: "arm" }] } });
  assert.equal(live(ms, "home", "p5").armed, true);
  assert.deepEqual(U.armCheck(ms, data, "home", "p5", ms.turn + 1), { ok: false, reason: "이미 켬", skill: data.skills.find((s) => s.id === "sk_lightning_dash"), combo: false });
  // 필살기 없는 선수
  const t = withSkill(SQ.home, "p6", null);
  const m2 = scene({ homeSnap: t, home: { p6: [3, 3] }, ball: { side: "home", id: "p6" } });
  assert.equal(U.armCheck(m2, data, "home", "p6", 11).reason, "필살기 없음");
  // 승부차기 · 끝난 경기
  const pk = scene({ gauge: { "home:p5": MAX } });
  pk.stage = "penalties";
  hex.step(pk, data, arm("home", "p5"));
  assert.equal(live(pk, "home", "p5").armed, false);
  assert.equal(U.armCheck(pk, data, "home", "p5", pk.turn + 1).reason, "승부차기");
  assert.equal(evs(pk, "cutin").length, 0);
});

/* ------------------------------------------------------------------ */
/* 슛 · 세이브                                                             */
/* ------------------------------------------------------------------ */

test("필살 슛 (메테오): 켜면 슛 거리에서 그 턴에 슛을 고른다 · 컷인 → 슛 · 게이지 0 · 박스 밖도 박스 계수 · shoot × gkMult 가 p 에 닿는다", () => {
  // 그레타 (12,6): 골까지 3 = 박스 밖, 슛 거리 3 안. 막는 수비 없음
  const mk = () => scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX } });
  const base = mk();
  const r0 = stepWith(base, { roll: () => false, decide: { action: "shoot" } });
  const p0 = r0.find((r) => r.kind === "shot").p;
  assert.equal(cutins(base).length, 0);
  const ms = mk();
  const r1 = stepWith(ms, { roll: () => false, input: arm("home", "p7") }); // 선택 덮어쓰기 없음 — 켠 필살기가 슛을 고른다
  const shot = evs(ms, "shot")[0];
  assert.ok(shot, "슛을 골랐다");
  assert.equal(shot.box, false);
  const types = ms.events.map((e) => e.type);
  assert.ok(types.indexOf("cutin") < types.indexOf("shot"), "컷인이 슛보다 먼저");
  const c = cutins(ms)[0];
  assert.deepEqual(c, { turn: 11, type: "cutin", side: "home", playerId: "p7", skillId: "sk_meteor_shot", ultimateType: "shot", tier: "SSR", line: "땅이 먼저 울릴 거야.", combo: false });
  assert.equal(live(ms, "home", "p7").gauge, 0, "게이지 0 (그 턴 게이지도 없음)");
  assert.equal(live(ms, "home", "p7").armed, false);
  assert.equal(ms.stats.home.ultimatesUsed, 1);
  const p1 = r1.find((r) => r.kind === "shot").p;
  const u = data.skills.find((s) => s.id === "sk_meteor_shot").ultimate;
  const boxCoef = cfg.match.actionCoef.shoot / cfg.match.actionCoef.midrangeShoot;
  near(odds(p1) / odds(p0), (u.shoot * boxCoef) / u.gkMult, "슛 배수");
  // 막혔으면 역컷인 (기적의 세이브!)
  assert.deepEqual(shot.reverseCutin, { kind: "save", side: "away", playerId: "m_p1", text: "기적의 세이브!", skillId: "sk_meteor_shot", ultimateType: "shot", combo: false });
});

test("필살 슛 minLine 3 (담금질 일격): 박스 밖에서는 슛을 고르지도 터지지도 않고 켠 채로 · 박스 안 슛에서 터진다", () => {
  const snap = withSkill(SQ.home, "p7", "sk_forge_finish");
  const ms = scene({ homeSnap: snap, home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX } });
  stepWith(ms, { roll: () => false, decide: { action: "shoot" }, input: arm("home", "p7") });
  assert.equal(evs(ms, "shot").length, 1);
  assert.equal(cutins(ms).length, 0, "박스 밖 슛은 안 터짐");
  assert.equal(live(ms, "home", "p7").armed, true, "켠 채로 (게이지 그대로)");
  assert.equal(live(ms, "home", "p7").gauge, MAX);
  const st = hex.ultimateStatus(ms, data, "home", "p7");
  assert.equal(st.armed, true);
  // 박스 안 (13,6) — 켠 상태로 공을 주면 슛을 고르고 터진다
  const m2 = scene({ homeSnap: snap, home: { p7: [13, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX } });
  live(m2, "home", "p7").armed = true;
  assert.equal(hex.ultimateStatus(m2, data, "home", "p7").canNow, true);
  const r = stepWith(m2, { roll: () => false });
  assert.equal(evs(m2, "shot")[0].box, true);
  assert.equal(cutins(m2).length, 1);
  // 배수: shoot 1.3 / gkMult 0.9 (같은 칸 · 켜지 않은 슛과 비교)
  const m3 = scene({ homeSnap: snap, home: { p7: [13, 6] }, ball: { side: "home", id: "p7" } });
  const r3 = stepWith(m3, { roll: () => false, decide: { action: "shoot" } });
  near(odds(r.find((x) => x.kind === "shot").p) / odds(r3.find((x) => x.kind === "shot").p), 1.3 / 0.9, "minLine 슛 배수");
});

test("필살 세이브: 늘 예약 — 슛이 올 때까지 켠 채로, 다음 슛에서 터진다 (saveMult) · 확실한 배급 = 다음 패스 정확도 1 · 가로채기 없음", () => {
  const ms = scene({ home: { p2: [3, 3] }, away: { m_p6: [8, 8] }, ball: { side: "away", id: "m_p6" }, gauge: { "home:p1": MAX } });
  stepWith(ms, { input: arm("home", "p1"), decide: { action: "hold" } });
  assert.equal(live(ms, "home", "p1").armed, true);
  assert.equal(cutins(ms).length, 0, "슛이 없으면 안 터짐");
  assert.equal(hex.ultimateStatus(ms, data, "home", "p1").canNow, false, "세이브는 늘 예약");
  // 슛: 켠 GK vs 안 켠 GK
  const mk = (armed, snap = SQ.home) => {
    const m = scene({ homeSnap: snap, away: { m_p7: [2, 6] }, ball: { side: "away", id: "m_p7" }, gauge: { "home:p1": MAX } });
    live(m, "home", "p1").armed = armed;
    return m;
  };
  const a = mk(false);
  const ra = stepWith(a, { roll: () => false, decide: { action: "shoot" } });
  const b = mk(true);
  const rb = stepWith(b, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(cutins(b).length, 1);
  assert.equal(cutins(b)[0].playerId, "p1");
  assert.equal(cutins(b)[0].ultimateType, "save");
  near(odds(rb.find((x) => x.kind === "shot").p) / odds(ra.find((x) => x.kind === "shot").p), 1 / 1.6, "saveMult 1.6");
  assert.equal(live(b, "home", "p1").sureDist, undefined, "만조의 장벽은 확실한 배급 없음");
  // 대지의 손바닥 (sureDistribution): 막은 뒤 GK 의 다음 패스 — 먼 패스도 정확도 굴림 없음 · 길 옆 수비도 가로채기 굴림 없음
  const palm = withSkill(SQ.home, "p1", "sk_earth_palm");
  const c = mk(true, palm);
  stepWith(c, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(live(c, "home", "p1").sureDist, true);
  assert.deepEqual(c.ball.holder, { side: "home", id: "p1" });
  c.pos.home.p7 = id(10, 6);
  c.pos.away.m_p6 = id(5, 5); // 길 바로 옆
  c.events = [];
  const rc = stepWith(c, { roll: () => false, decide: { action: "pass", receiverId: "p7", target: id(10, 6) } });
  assert.equal(rc.filter((x) => x.kind === "accuracy" || x.kind === "intercept").length, 0, "정확도 · 가로채기 굴림 없음");
  assert.equal(evs(c, "pass")[0].accurate, true);
  assert.equal(c.ball.flight.sure, true);
  assert.equal(live(c, "home", "p1").sureDist, false, "한 번 쓰면 끝");
  // 같은 패스를 확실한 배급 없이 → 굴림이 있다
  const d0 = mk(false, palm);
  stepWith(d0, { roll: () => false, decide: { action: "shoot" } });
  d0.pos.home.p7 = id(10, 6);
  d0.pos.away.m_p6 = id(5, 5);
  const rd = stepWith(d0, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(10, 6) } });
  assert.ok(rd.some((x) => x.kind === "accuracy") && rd.some((x) => x.kind === "intercept"));
});

/* ------------------------------------------------------------------ */
/* 패스                                                                  */
/* ------------------------------------------------------------------ */

/** 패스 비교용 (굴림 p 가 maxP 에 닿지 않게): 실루엔 패스를 낮추고 원정 MF 둘의 수비 · 패스를 올린다 */
const PASS_HOME = withSkill(SQ.home, "p4", "sk_wind_thread", { pass: 120 });
const PASS_AWAY = (() => {
  const t = withSkill(SQ.away, "m_p4", "sk_wind_thread", { defense: 500, pass: 500 });
  return withSkill(t, "m_p5", "sk_lightning_dash", { defense: 500, pass: 500 });
})();
/** 홈 패스 장면: 실루엔 (4,6) → 그레타 (9,6), 길 위 · 옆에 원정 수비 둘 */
function passScene(opts = {}) {
  return scene({ homeSnap: PASS_HOME, awaySnap: PASS_AWAY, home: { p4: [4, 6], p7: [9, 6] }, away: { m_p5: [6, 5], m_p4: [6, 7] }, ball: { side: "home", id: "p4" }, gauge: { "home:p4": MAX }, ...opts });
}
const PASS_TO_P7 = { action: "pass", receiverId: "p7", target: id(9, 6) };

test("필살 패스 (바람의 실): 켜면 그 턴에 패스 · 컷인 → pass · 가로채기 굴림마다 attack × 옆 수비 무시 (negateRead) · 받은 선수 게이지 receiverGauge", () => {
  const a = passScene();
  const ra = stepWith(a, { roll: () => true, decide: PASS_TO_P7 });
  const b = passScene();
  live(b, "home", "p4").armed = true;
  const rb = stepWith(b, { roll: () => true, decide: PASS_TO_P7 });
  const types = b.events.map((e) => e.type);
  assert.ok(types.indexOf("cutin") >= 0 && types.indexOf("cutin") < types.indexOf("pass"), "컷인 → pass");
  assert.equal(b.ball.flight === null || b.ball.flight.ult.skillId === "sk_wind_thread", true);
  const ia = ra.filter((x) => x.kind === "intercept");
  const ib = rb.filter((x) => x.kind === "intercept");
  assert.ok(ia.length >= 1 && ia.length === ib.length, "같은 수비가 굴린다");
  const cover = cfg.match.coverBonusPerExtraDefender;
  for (let i = 0; i < ia.length; i++) {
    assert.equal(ia[i].info.defenderId, ib[i].info.defenderId);
    near(odds(ib[i].p) / odds(ia[i].p), 1.5 * (1 + cover * ia[i].info.helpers), `굴림 ${i} (helpers ${ia[i].info.helpers})`);
  }
  assert.ok(ia.some((x) => x.info.helpers > 0), "옆 수비가 있는 굴림도 비교했다");
  // 도착할 때까지
  for (let t = 0; t < 3 && !evs(b, "receive").length; t++) stepWith(b, { roll: () => true });
  assert.equal(evs(b, "receive")[0].playerId, "p7");
  const g7 = live(b, "home", "p7").gauge;
  assert.ok(g7 >= 30 + 50 && g7 < 30 + 50 + D.gaugeReceive, `receiverGauge 50 (${g7})`);
  // 필살 패스를 쓴 선수는 그 패스로 게이지를 얻지 않는다 (가로채기를 살아남아도)
  assert.ok(live(b, "home", "p4").gauge < D.gaugeDuelWin, "패스한 실루엔은 겨루기 승 게이지 없음");
});

test("필살 패스 nextDuelBonus: 받은 선수의 다음 겨루기 (3턴 안) 공격 × (1 + 0.5) — 쓰면 끝 · 3턴 지나면 끝", () => {
  const b = passScene({ away: {} });
  live(b, "home", "p4").armed = true;
  for (let t = 0; t < 4 && !evs(b, "receive").length; t++) stepWith(b, { decide: t === 0 ? PASS_TO_P7 : null });
  const rt = evs(b, "receive")[0].turn;
  assert.deepEqual(live(b, "home", "p7").nextBonus, { bonus: 0.5, until: rt + D.nextBonusTurns });
  // 다음 겨루기 = 슛 (같은 칸에서 보너스 없이 쏜 슛과 비교)
  b.pos.home.p7 = id(13, 6);
  b.ball.cell = id(13, 6);
  const r1 = stepWith(b, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(live(b, "home", "p7").nextBonus, null, "쓰면 끝");
  const c = scene({ home: { p7: [13, 6] }, ball: { side: "home", id: "p7" }, turn: b.turn - 1 });
  const r2 = stepWith(c, { roll: () => false, decide: { action: "shoot" } });
  near(odds(r1.find((x) => x.kind === "shot").p) / odds(r2.find((x) => x.kind === "shot").p), 1.5, "다음 겨루기 +50%");
  // 3턴 지나면 사라진다
  const e = scene({ home: { p7: [5, 3] }, ball: { side: "home", id: "p7" } });
  live(e, "home", "p7").nextBonus = { bonus: 0.5, until: 12 };
  stepWith(e, { decide: { action: "hold" } });
  stepWith(e, { decide: { action: "hold" } });
  assert.ok(live(e, "home", "p7").nextBonus, "턴 12 까지는 남음");
  stepWith(e, { decide: { action: "hold" } });
  assert.equal(live(e, "home", "p7").nextBonus, null, "턴 13 에 끝");
});

test("필살 패스 extraLine (심해 물길): 첫 가로채기 성공 1번은 무시 · actions [pass] 라 크로스에는 안 터진다", () => {
  const snap = withSkill(PASS_HOME, "p4", "sk_deep_current");
  const ms = passScene({ homeSnap: snap });
  live(ms, "home", "p4").armed = true;
  stepWith(ms, { roll: (k) => (k === "intercept" ? false : true), decide: PASS_TO_P7 });
  const ints = evs(ms, "intercept");
  assert.equal(ints[0].success, false);
  assert.equal(ints[0].extraLine, true, "첫 성공은 무시");
  assert.equal(ints[1].success, true, "두 번째는 가로챔");
  assert.deepEqual(ints[1].reverseCutin, { kind: "passCut", side: "away", playerId: ints[1].defenderId, text: "필살 패스 차단!", skillId: "sk_deep_current", ultimateType: "pass", combo: false });
  // 크로스 자리에서 크로스 → 안 터지고 켠 채로
  const cr = scene({ homeSnap: snap, home: { p4: [10, 1], p7: [13, 5] }, ball: { side: "home", id: "p4" }, gauge: { "home:p4": MAX } });
  live(cr, "home", "p4").armed = true;
  stepWith(cr, { roll: () => true, decide: { action: "cross", receiverId: "p7", target: id(13, 5) } });
  assert.equal(evs(cr, "pass")[0].cross, true);
  assert.equal(cutins(cr).length, 0);
  assert.equal(live(cr, "home", "p4").armed, true);
});

/* ------------------------------------------------------------------ */
/* 드리블                                                                 */
/* ------------------------------------------------------------------ */

test("필살 드리블: 태클이 올 때 드리블을 고르고 터진다 (attack 배수) · 태클이 없으면 켠 채로 · 막히면 역컷인 (철벽 블록!)", () => {
  const mk = (snap = SQ.home) => scene({ homeSnap: snap, home: { p5: [6, 6] }, away: { m_p6: [7, 6] }, ball: { side: "home", id: "p5" }, gauge: { "home:p5": MAX } });
  const a = mk();
  const ra = stepWith(a, { roll: () => true, decide: { action: "dribble" } });
  const b = mk();
  const rb = stepWith(b, { roll: () => false, input: arm("home", "p5") }); // 선택 덮어쓰기 없음
  const tk = evs(b, "tackle")[0];
  assert.ok(tk, "태클이 왔다");
  assert.equal(rb.find((x) => x.kind === "tackle").info.action, "dribble", "켠 필살 드리블이 드리블을 골랐다");
  const types = b.events.map((e) => e.type);
  assert.ok(types.indexOf("cutin") < types.indexOf("tackle"));
  near(odds(rb.find((x) => x.kind === "tackle").p) / odds(ra.find((x) => x.kind === "tackle").p), 1.3, "attack 1.3");
  assert.equal(tk.success, true);
  assert.deepEqual(tk.reverseCutin, { kind: "block", side: "away", playerId: "m_p6", text: "철벽 블록!", skillId: "sk_lightning_dash", ultimateType: "dribble", combo: false });
  // 태클할 수비가 없으면 안 터지고 켠 채로
  const c = scene({ home: { p5: [6, 6] }, ball: { side: "home", id: "p5" }, gauge: { "home:p5": MAX } });
  assert.equal(hex.ultimateStatus(c, data, "home", "p5").canNow, false);
  stepWith(c, { input: arm("home", "p5") });
  assert.equal(cutins(c).length, 0);
  assert.equal(live(c, "home", "p5").armed, true);
  assert.equal(hex.ultimateStatus(c, data, "home", "p5").reason.startsWith("예약"), true);
});

test("필살 드리블 negateRead (급류): 옆 수비 +10% 없음 · extraLine (달토끼 도약): 굴림 없이 태클 실패 → 전진", () => {
  const cover = cfg.match.coverBonusPerExtraDefender;
  const rapids = withSkill(SQ.home, "p5", "sk_rapids");
  const mk = (snap) => scene({ homeSnap: snap, home: { p5: [6, 6] }, away: { m_p6: [7, 6], m_p5: [5, 6] }, ball: { side: "home", id: "p5" }, gauge: { "home:p5": MAX } });
  const a = mk(rapids);
  const ra = stepWith(a, { roll: () => true, decide: { action: "dribble" } });
  const b = mk(rapids);
  live(b, "home", "p5").armed = true;
  const rb = stepWith(b, { roll: () => true, decide: { action: "dribble" } });
  const ta = ra.find((x) => x.kind === "tackle");
  assert.equal(ta.info.helpers, 1, "뒤에 붙은 수비가 돕는다");
  near(odds(rb.find((x) => x.kind === "tackle").p) / odds(ta.p), 1.6 * (1 + cover), "attack 1.6 · 옆 수비 무시");
  // 달토끼 도약
  const hop = withSkill(SQ.home, "p5", "sk_moon_hop");
  const c = mk(hop);
  live(c, "home", "p5").armed = true;
  const rc = stepWith(c, { decide: { action: "dribble" } });
  assert.equal(rc.filter((x) => x.kind === "tackle").length, 0, "태클 굴림 없음");
  const tk = evs(c, "tackle")[0];
  assert.equal(tk.success, false);
  assert.equal(tk.p, 0);
  assert.equal(tk.extraLine, true);
  assert.notEqual(tk.carrierTo, tk.carrierFrom);
  assert.equal(c.pos.home.p5, tk.carrierTo, "가던 칸으로 전진");
  assert.equal(cutins(c).length, 1);
});

/* ------------------------------------------------------------------ */
/* 수비                                                                  */
/* ------------------------------------------------------------------ */

test("필살 수비 (산맥 쐐기): 앞쪽 3칸이면 다른 수비보다 먼저 태클 · defense × 1.6 · 패스 턴에도 공이 떠나기 전에 태클 (성공 = 패스 없음, 실패 = 패스는 나가고 수비는 넘어짐)", () => {
  // 우선순위: 정면 (7,6) m_p3 · 앞 대각 (6,5) m_p2 — 켠 m_p2 가 태클
  const pr = scene({ home: { p6: [6, 6] }, away: { m_p3: [7, 6], m_p2: [6, 5] }, ball: { side: "home", id: "p6" }, gauge: { "away:m_p2": MAX } });
  stepWith(pr, { roll: () => true, decide: { action: "hold" }, input: arm("away", "m_p2") });
  assert.equal(evs(pr, "tackle")[0].tacklerId, "m_p2");
  assert.equal(cutins(pr)[0].playerId, "m_p2");
  const pr0 = scene({ home: { p6: [6, 6] }, away: { m_p3: [7, 6], m_p2: [6, 5] }, ball: { side: "home", id: "p6" } });
  stepWith(pr0, { roll: () => true, decide: { action: "hold" } });
  assert.equal(evs(pr0, "tackle")[0].tacklerId, "m_p3", "안 켜면 정면 수비");
  // 배수 (같은 수비 한 명)
  const mk = () => scene({ home: { p6: [6, 6] }, away: { m_p2: [7, 6] }, ball: { side: "home", id: "p6" }, gauge: { "away:m_p2": MAX } });
  const a = mk();
  const ra = stepWith(a, { roll: () => true, decide: { action: "hold" } });
  const b = mk();
  live(b, "away", "m_p2").armed = true;
  const rb = stepWith(b, { roll: () => true, decide: { action: "hold" } });
  near(odds(rb.find((x) => x.kind === "tackle").p) / odds(ra.find((x) => x.kind === "tackle").p), 1 / 1.6, "defense 1.6");
  // 패스 턴 (쐐기): 성공 → 공을 뺏고 패스 없음
  const pass = { action: "pass", receiverId: "p7", target: id(9, 8) };
  const w = () => {
    const m = scene({ home: { p6: [6, 6], p7: [9, 8] }, away: { m_p2: [7, 6] }, ball: { side: "home", id: "p6" }, gauge: { "away:m_p2": MAX } });
    live(m, "away", "m_p2").armed = true;
    return m;
  };
  const s1 = w();
  stepWith(s1, { roll: (k) => (k === "tackle" ? false : true), decide: pass });
  assert.equal(evs(s1, "tackle")[0].success, true);
  assert.equal(evs(s1, "pass").length, 0, "패스는 없던 일");
  assert.deepEqual(s1.ball.holder, { side: "away", id: "m_p2" });
  // 실패 → 패스가 나가고, 수비는 제자리에서 넘어지고, 공 가진 선수도 제자리
  const s2 = w();
  const T = s2.turn + 1;
  stepWith(s2, { roll: () => true, decide: pass });
  const types = s2.events.map((e) => e.type);
  assert.deepEqual(types.slice(0, 3), ["cutin", "tackle", "pass"]);
  assert.equal(live(s2, "away", "m_p2").restUntil, T + 1);
  assert.deepEqual(at(s2, "away", "m_p2"), [7, 6]);
  assert.equal(evs(s2, "pass")[0].fromCell, id(6, 6));
  // 슛 턴도
  const s3 = scene({ home: { p7: [12, 6] }, away: { m_p2: [13, 6] }, ball: { side: "home", id: "p7" }, gauge: { "away:m_p2": MAX } });
  live(s3, "away", "m_p2").armed = true;
  stepWith(s3, { roll: (k) => (k === "tackle" ? false : undefined), decide: { action: "shoot" } });
  assert.equal(evs(s3, "tackle")[0].success, true);
  assert.equal(evs(s3, "shot").length, 0);
  // 안 켰으면 패스 턴 태클 없음
  const s4 = scene({ home: { p6: [6, 6], p7: [9, 8] }, away: { m_p2: [7, 6] }, ball: { side: "home", id: "p6" } });
  stepWith(s4, { roll: () => true, decide: pass });
  assert.equal(evs(s4, "tackle").length, 0);
});

test("필살 수비 (쐐기 없는 수비): 패스 턴에는 태클하지 않고 켠 채로 (게이지 그대로) · 가로채기 굴림에서 터진다 · 서 있는 자리면 canNow", () => {
  const d2 = clone(data);
  d2.skills = d2.skills.concat([{ id: "sk_test_guard", name: "시험 수비", kind: "unique", description: "필살 수비: 시험", ultimate: { type: "defense", defense: 1.5, tier: "R", cutinLine: "막는다" } }]);
  const awaySnap = withSkill(SQ.away, "m_p2", "sk_test_guard");
  const ms = scene({ awaySnap, home: { p6: [6, 6], p7: [3, 9] }, away: { m_p2: [7, 6] }, ball: { side: "home", id: "p6" } });
  // scene 은 data 로 만들었으므로 게이지가 없다 — d2 로 다시 붙인다
  ms.live.away.m_p2.gauge = MAX;
  ms.live.away.m_p2.armed = false;
  const st = hex.ultimateStatus(ms, d2, "away", "m_p2");
  assert.equal(st.canNow, true, "공 가진 상대의 앞쪽 3칸");
  stepWith(ms, { d: d2, roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(3, 9) }, input: arm("away", "m_p2") });
  assert.equal(evs(ms, "pass").length, 1);
  assert.equal(evs(ms, "tackle").length, 0, "패스 턴 태클 없음");
  assert.equal(evs(ms, "intercept").length, 0, "뒤로 가는 패스 — 길 옆이 아니다");
  assert.equal(live(ms, "away", "m_p2").armed, true);
  assert.equal(live(ms, "away", "m_p2").gauge, MAX);
  // 가로채기 굴림: 켠 수비가 길 옆에서 굴리면 터지고 defense 배수
  const ints = (armed) => {
    const m = scene({ awaySnap, home: { p4: [4, 6], p7: [9, 6] }, away: { m_p2: [6, 5] }, ball: { side: "home", id: "p4" } });
    m.live.away.m_p2.gauge = MAX;
    m.live.away.m_p2.armed = armed;
    const r = stepWith(m, { d: d2, roll: () => true, decide: PASS_TO_P7 });
    return { m, p: r.find((x) => x.kind === "intercept").p };
  };
  const a = ints(false);
  const b = ints(true);
  assert.equal(cutins(b.m).length, 1);
  assert.equal(cutins(a.m).length, 0);
  near(odds(b.p) / odds(a.p), 1 / 1.5, "가로채기 defense 1.5");
});

/* ------------------------------------------------------------------ */
/* 팀                                                                   */
/* ------------------------------------------------------------------ */

test("팀 필살기 (불꽃 호령): 켜는 턴에 바로 터지고 teamUltTurns 턴 동안 공격 · 수비 × teamMult · 겹치지 않음 · 끝나면 다시", () => {
  const mk = () => scene({ home: { p6: [6, 6] }, away: { m_p6: [7, 6] }, ball: { side: "home", id: "p6" }, gauge: { "home:p3": MAX } });
  const a = mk();
  const ra = stepWith(a, { roll: () => true, decide: { action: "hold" } });
  const b = mk();
  const T = b.turn + 1;
  assert.equal(hex.ultimateStatus(b, data, "home", "p3").canNow, true);
  const rb = stepWith(b, { roll: () => true, decide: { action: "hold" }, input: arm("home", "p3") });
  assert.equal(b.events[0].type, "cutin", "그 턴 첫 이벤트");
  assert.equal(b.events[0].playerId, "p3");
  assert.deepEqual(b.teamUlt.home, { playerId: "p3", skillId: "sk_flame_command", mult: 1.08, until: T + D.teamUltTurns - 1 });
  assert.equal(live(b, "home", "p3").gauge, 0);
  near(odds(rb.find((x) => x.kind === "tackle").p) / odds(ra.find((x) => x.kind === "tackle").p), 1.08, "공격 × 1.08");
  // 수비 쪽도: 원정이 공을 갖고 홈이 태클
  const dA = scene({ home: { p6: [7, 6] }, away: { m_p6: [8, 6] }, ball: { side: "away", id: "m_p6" } });
  const rdA = stepWith(dA, { roll: () => true, decide: { action: "hold" } });
  const dB = scene({ home: { p6: [7, 6] }, away: { m_p6: [8, 6] }, ball: { side: "away", id: "m_p6" } });
  dB.teamUlt.home = { playerId: "p3", skillId: "sk_flame_command", mult: 1.08, until: 99 };
  const rdB = stepWith(dB, { roll: () => true, decide: { action: "hold" } });
  near(odds(rdB.find((x) => x.kind === "tackle").p) / odds(rdA.find((x) => x.kind === "tackle").p), 1 / 1.08, "수비 × 1.08");
  // 겹치지 않음: 발동 중에는 게이지가 차도 못 켠다
  live(b, "home", "p3").gauge = MAX;
  assert.equal(hex.ultimateStatus(b, data, "home", "p3").canNow, false);
  stepWith(b, { input: arm("home", "p3") });
  assert.equal(cutins(b).length, 1);
  assert.equal(live(b, "home", "p3").armed, false);
  // teamUltTurns 뒤 끝
  while (b.turn < T + D.teamUltTurns - 1) stepWith(b);
  assert.ok(b.teamUlt.home, "마지막 턴까지 남음");
  stepWith(b);
  assert.equal(b.teamUlt.home, null, "끝");
  live(b, "home", "p3").gauge = MAX;
  stepWith(b, { input: arm("home", "p3") });
  assert.equal(cutins(b).length, 2, "끝나면 다시 쓸 수 있다");
});

/* ------------------------------------------------------------------ */
/* 합체기                                                                 */
/* ------------------------------------------------------------------ */

test("합체기 (연습 선수단 실루엔 → 그레타 = 바람의 유성): 필살 패스를 받은 짝은 게이지와 상관없이 켜고 쏜다 · 게이지 그대로 · × comboBonus · combo 이벤트", () => {
  // 그레타 (12,6) = 골까지 3 = 슛 거리 (3) 안
  const ms = scene({ home: { p4: [9, 6], p7: [12, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p4": MAX, "home:p7": 10 } });
  stepWith(ms, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(12, 6) }, input: arm("home", "p4") });
  assert.equal(evs(ms, "receive")[0].playerId, "p7");
  const T0 = ms.turn;
  assert.deepEqual(live(ms, "home", "p7").combo, { passerId: "p4", skillId: "sk_wind_thread", name: "바람의 유성", until: T0 + D.comboReadyTurns });
  const st = hex.ultimateStatus(ms, data, "home", "p7");
  assert.equal(st.comboReady, true);
  assert.equal(st.comboName, "바람의 유성");
  assert.equal(st.ready, false);
  assert.equal(U.armCheck(ms, data, "home", "p7", ms.turn + 1).ok, true, "게이지가 모자라도 켤 수 있다");
  // 사람 쪽: 안 누르면 안 쓴다
  const idle = clone(ms);
  stepWith(idle, { roll: () => false, decide: { action: "hold" } });
  assert.equal(cutins(idle).length, 1, "실루엔 것만");
  // 누르면: 슛 거리 — 슛을 고르고 합체기
  const g7 = live(ms, "home", "p7").gauge;
  const r = stepWith(ms, { roll: () => false, input: arm("home", "p7") });
  const c = cutins(ms)[1];
  assert.deepEqual([c.playerId, c.combo], ["p7", true]);
  const combo = evs(ms, "combo")[0];
  assert.deepEqual(combo, { turn: T0 + 1, type: "combo", side: "home", name: "바람의 유성", skillIds: ["sk_wind_thread", "sk_meteor_shot"], playerIds: ["p4", "p7"] });
  assert.equal(ms.stats.home.combos, 1);
  assert.equal(ms.stats.home.ultimatesUsed, 2);
  assert.equal(live(ms, "home", "p7").gauge, g7, "합체기는 게이지를 쓰지 않는다 (그 턴 게이지도 없음)");
  // 배수: 같은 장면, 합체기 없이 게이지로 켠 메테오 → comboBonus 만큼 차이 (다음 겨루기 +50% 는 둘 다)
  const solo = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, turn: T0, gauge: { "home:p7": MAX } });
  live(solo, "home", "p7").armed = true;
  live(solo, "home", "p7").nextBonus = { bonus: 0.5, until: T0 + 3 };
  const rs = stepWith(solo, { roll: () => false });
  near(odds(r.find((x) => x.kind === "shot").p) / odds(rs.find((x) => x.kind === "shot").p), cfg.match.ultimate.comboBonus, "comboBonus");
});

test("합체기 대기: 공을 잃거나 comboReadyTurns 가 지나면 끝 (합체기로만 켠 것도 꺼짐) · AI 는 늘 쓴다 · 합체기 짝이 아니면 대기 없음", () => {
  // 3턴 지나면 끝 — 그레타가 공을 지키는 동안 (슛 거리 밖)
  const ms = scene({ home: { p4: [3, 6], p7: [5, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p4": MAX, "home:p7": 10 } });
  stepWith(ms, { roll: () => true, decide: { action: "pass", receiverId: "p7", target: id(5, 6) }, input: arm("home", "p4") });
  assert.ok(live(ms, "home", "p7").combo);
  stepWith(ms, { decide: { action: "hold" }, input: arm("home", "p7") });
  assert.equal(live(ms, "home", "p7").armed, true, "합체기로 켬 (슛 거리 밖이라 대기)");
  stepWith(ms, { decide: { action: "hold" } });
  stepWith(ms, { decide: { action: "hold" } });
  assert.ok(live(ms, "home", "p7").combo, "3턴째까지");
  stepWith(ms, { decide: { action: "hold" } });
  assert.equal(live(ms, "home", "p7").combo, null);
  assert.equal(live(ms, "home", "p7").armed, false, "게이지가 안 찼으면 꺼진다");
  assert.equal(cutins(ms).length, 1);
  // AI (원정): 받은 다음 턴에 저절로 켜고 쏜다
  const aw = scene({ away: { m_p4: [5, 6], m_p7: [2, 6] }, ball: { side: "away", id: "m_p4" }, gauge: { "away:m_p4": MAX, "away:m_p7": 0 }, ai: ["away"] });
  stepWith(aw, { roll: () => true, decide: { action: "pass", receiverId: "m_p7", target: id(2, 6) } });
  assert.equal(cutins(aw)[0].playerId, "m_p4", "AI 가 필살 패스를 켰다 (짝이 경기장에 있음)");
  assert.ok(live(aw, "away", "m_p7").combo);
  stepWith(aw, { roll: () => false });
  const c = cutins(aw)[1];
  assert.deepEqual([c.playerId, c.combo], ["m_p7", true]);
  // 짝이 아닌 받는 선수 (울리카) 는 대기 없음
  const nb = scene({ home: { p4: [3, 6], p6: [5, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p4": MAX } });
  stepWith(nb, { roll: () => true, decide: { action: "pass", receiverId: "p6", target: id(5, 6) }, input: arm("home", "p4") });
  assert.equal(evs(nb, "receive")[0].playerId, "p6");
  assert.equal(live(nb, "home", "p6").combo, undefined);
  // data.combos 가 없으면 기본 (바람의 유성) 만
  assert.equal(U.comboName({}, "sk_wind_thread", "sk_meteor_shot"), "바람의 유성");
  assert.equal(U.comboName({}, "sk_lightning_arrow", "sk_sky_header"), null);
  assert.equal(U.comboName(data, "sk_lightning_arrow", "sk_sky_header"), "하늘 과녁");
});

/* ------------------------------------------------------------------ */
/* 크로스 · 공중볼 · 헤더 (H3 리뷰 ENG-2 · ENG-3 · F3)                         */
/* ------------------------------------------------------------------ */

/** 크로스 장면: 울리카 (12,2) 측면 → 그레타 (13,5) 박스, 원정 도르비나 (12,5) 가 공중볼 수비 (GK 는 떨어진 (14,10)). 크로스는 그 턴에 도착 */
const CROSS_HOME = withSkill(withSkill(SQ.home, "p6", "sk_lightning_arrow"), "p7", "sk_sky_header");
function crossScene(opts = {}) {
  return scene({ homeSnap: CROSS_HOME, home: { p6: [12, 2], p7: [13, 5] }, away: { m_p2: [12, 5], m_p1: [14, 10] }, ball: { side: "home", id: "p6" }, ...opts });
}
const CROSS_TO_P7 = { action: "cross", receiverId: "p7", target: id(13, 5) };

test("필살 크로스 (뇌전 화살): 공중볼 공격 × attack 1.5 · 지면 역컷인 passCut (막힌 필살기) · 필살 수비가 공중볼에서 터진다 (defense) · 공중볼 게이지", () => {
  // 안 켬 vs 켬: 공중볼 odds × 1.5 (크로스는 땅 가로채기가 없다 — [구현 결정] attack 은 공중볼에)
  const a = crossScene({ gauge: { "home:p6": 40, "away:m_p2": 20 } });
  const ra = stepWith(a, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  const b = crossScene({ gauge: { "home:p6": MAX } });
  live(b, "home", "p6").armed = true;
  const rb = stepWith(b, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  const pa = ra.find((x) => x.kind === "aerial");
  const pb = rb.find((x) => x.kind === "aerial");
  assert.ok(pa && pb, "공중볼 굴림");
  assert.equal(pa.info.defenderId, "m_p2");
  near(odds(pb.p) / odds(pa.p), 1.5, "공중볼 attack 1.5");
  assert.equal(cutins(b)[0].skillId, "sk_lightning_arrow");
  // 공중볼 이김: 크로스한 선수 +gaugeDuelWin (필살기를 안 쓴 크로스만) · 헤더가 막히면 GK +gaugeDuelWin
  assert.equal(evs(a, "aerial")[0].success, true);
  assert.equal(live(a, "home", "p6").gauge, 40 + D.gaugeDuelWin + D.gaugePerTurn);
  assert.equal(evs(a, "save").length, 1);
  assert.equal(live(a, "away", "m_p1").gauge, cfg.match.ultimate.gaugeStart + D.gaugeDuelWin + D.gaugePerTurn, "선방 게이지");
  assert.ok(live(b, "home", "p6").gauge < D.gaugeDuelWin, "필살 크로스를 쓴 선수는 공중볼 게이지 없음");
  // 지면: 역컷인 passCut (막힌 필살기 이름까지) · 이긴 수비 +gaugeDuelWin
  const c = crossScene({ gauge: { "home:p6": MAX, "away:m_p2": 20 } });
  live(c, "home", "p6").armed = true;
  stepWith(c, { roll: () => false, decide: CROSS_TO_P7 });
  const ae = evs(c, "aerial")[0];
  assert.equal(ae.success, false);
  assert.deepEqual(ae.reverseCutin, { kind: "passCut", side: "away", playerId: "m_p2", text: "필살 패스 차단!", skillId: "sk_lightning_arrow", ultimateType: "pass", combo: false });
  assert.deepEqual(c.ball.holder, { side: "away", id: "m_p2" });
  assert.equal(live(c, "away", "m_p2").gauge, 20 + D.gaugeDuelWin + D.gaugePerTurn, "공중볼 이긴 수비 게이지");
  // 필살 수비 (산맥 쐐기) 를 켠 공중볼 수비: 공중볼에서 터지고 수비 × 1.6
  const d = crossScene({ gauge: { "away:m_p2": MAX } });
  live(d, "away", "m_p2").armed = true;
  const rd = stepWith(d, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  near(odds(rd.find((x) => x.kind === "aerial").p) / odds(pa.p), 1 / 1.6, "공중볼 defense 1.6");
  assert.deepEqual(cutins(d).map((e) => e.playerId), ["m_p2"]);
  assert.equal(live(d, "away", "m_p2").gauge, 0);
  assert.equal(live(d, "away", "m_p2").armed, false);
});

test("하늘 가르기 (headerMult): 박스 헤더에서 터진다 — shoot 1.3 × headerMult 1.1 · 박스 밖 슛에서는 켠 채로", () => {
  const mk = (armed) => {
    const m = crossScene({ gauge: { "home:p7": MAX } });
    live(m, "home", "p7").armed = armed;
    return m;
  };
  const a = mk(false);
  const ra = stepWith(a, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  const b = mk(true);
  const rb = stepWith(b, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  const ha = ra.find((x) => x.kind === "header");
  const hb = rb.find((x) => x.kind === "header");
  assert.ok(ha && hb, "헤더 굴림");
  near(odds(hb.p) / odds(ha.p), 1.3 * 1.1, "헤더 shoot × headerMult");
  assert.deepEqual(cutins(b).map((e) => [e.playerId, e.skillId, e.combo]), [["p7", "sk_sky_header", false]]);
  assert.ok(evs(b, "shot")[0].header);
  // 박스 밖 (12,6) 보통 슛: minLine 3 → 안 터지고 켠 채로
  const o = scene({ homeSnap: CROSS_HOME, home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX } });
  live(o, "home", "p7").armed = true;
  stepWith(o, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(cutins(o).length, 0);
  assert.equal(live(o, "home", "p7").armed, true);
});

test("크로스 합체기 (하늘 과녁 · 바람의 유성): 필살 크로스를 받아 바로 헤더 → 게이지와 상관없이 저절로 합체기 (사람 쪽 · AI 쪽 모두) · 게이지 그대로", () => {
  for (const ai of [[], ["home"]]) {
    const ms = crossScene({ gauge: { "home:p6": MAX, "home:p7": 30 }, ai });
    live(ms, "home", "p6").armed = true;
    const r = stepWith(ms, { roll: () => true, decide: CROSS_TO_P7 });
    const c = cutins(ms);
    assert.deepEqual(c.map((e) => [e.playerId, e.combo]), [["p6", false], ["p7", true]], `aiSides ${ai}`);
    assert.deepEqual(evs(ms, "combo")[0], { turn: ms.turn, type: "combo", side: "home", name: "하늘 과녁", skillIds: ["sk_lightning_arrow", "sk_sky_header"], playerIds: ["p6", "p7"] });
    assert.equal(ms.stats.home.combos, 1);
    assert.equal(live(ms, "home", "p7").gauge, 30 + D.gaugeReceive, "합체기는 게이지를 쓰지 않는다 (받기 게이지까지, 그 뒤는 없음)");
    assert.equal(live(ms, "home", "p7").armed, false);
    // 배수: 하늘 가르기 1.3 × 1.1 × comboBonus × 다음 겨루기 (뇌전 화살 0.3)
    const h = r.find((x) => x.kind === "header");
    const base = crossScene({ gauge: { "home:p7": 30 } });
    const rh = stepWith(base, { roll: () => true, decide: CROSS_TO_P7 }).find((x) => x.kind === "header");
    near(odds(h.p) / odds(rh.p), 1.3 * 1.1 * cfg.match.ultimate.comboBonus * 1.3, "합체기 헤더 배수");
  }
  // 게이지로 이미 켠 받는 선수 (바람의 실 크로스 → 메테오): 합체기로 터지고 게이지 그대로
  const snap = withSkill(SQ.home, "p6", "sk_wind_thread");
  const ms = scene({ homeSnap: snap, home: { p6: [12, 2], p7: [13, 5] }, away: { m_p2: [12, 5], m_p1: [14, 10] }, ball: { side: "home", id: "p6" }, gauge: { "home:p6": MAX, "home:p7": MAX } });
  live(ms, "home", "p6").armed = true;
  live(ms, "home", "p7").armed = true;
  stepWith(ms, { roll: (k) => k === "aerial", decide: CROSS_TO_P7 });
  assert.deepEqual(cutins(ms).map((e) => [e.playerId, e.skillId, e.combo]), [["p6", "sk_wind_thread", false], ["p7", "sk_meteor_shot", true]]);
  assert.equal(evs(ms, "combo")[0].name, "바람의 유성");
  assert.equal(live(ms, "home", "p7").gauge, MAX, "게이지 그대로");
  // 막히면 역컷인에 합체기 표시
  assert.deepEqual(evs(ms, "shot")[0].reverseCutin, { kind: "save", side: "away", playerId: "m_p1", text: "기적의 세이브!", skillId: "sk_meteor_shot", ultimateType: "shot", combo: true });
});

test("합체기로만 켠 것: 동료 골 킥오프로 대기가 사라지면 다음 턴에 꺼진다 (게이지 그대로 · 안 터짐) · 받은 선수가 태클로 공을 잃어도 끝 (H3 리뷰 ENG-1 · F3)", () => {
  // 그레타 (11,1) 측면 — 합체기 대기 (손으로) · 게이지 50 · 사람이 켬 → 슛 거리 밖이라 울리카 (13,4) 에게 크로스 → 헤더 골 → 킥오프
  const ms = scene({ home: { p7: [11, 1], p6: [13, 4] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": 50 } });
  live(ms, "home", "p7").combo = { passerId: "p4", skillId: "sk_wind_thread", name: "바람의 유성", until: ms.turn + 3 };
  stepWith(ms, { roll: () => true, decide: { action: "cross", receiverId: "p6", target: id(13, 4) }, input: arm("home", "p7") });
  assert.equal(evs(ms, "goal")[0].playerId, "p6");
  assert.equal(evs(ms, "kickoff").length, 1);
  assert.equal(cutins(ms).length, 0, "그레타는 크로스 — 메테오는 안 터짐");
  assert.equal(live(ms, "home", "p7").combo, undefined, "킥오프 live 에는 대기가 없다");
  const g = live(ms, "home", "p7").gauge;
  stepWith(ms);
  assert.equal(live(ms, "home", "p7").armed, false, "대기 없이 게이지가 안 찼으면 꺼진다");
  near(live(ms, "home", "p7").gauge, Math.round((g + D.gaugePerTurn) * 10) / 10, "게이지 그대로 (턴 게이지만)");
  assert.equal(hex.ultimateStatus(ms, data, "home", "p7").reason.startsWith("충전"), true);
  // 태클로 공을 잃으면 (3턴 안) 대기 끝 · 합체기로만 켠 것도 꺼짐
  const tk = scene({ home: { p7: [5, 6] }, away: { m_p6: [6, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": 10 } });
  live(tk, "home", "p7").combo = { passerId: "p4", skillId: "sk_wind_thread", name: "바람의 유성", until: tk.turn + 3 };
  live(tk, "home", "p7").armed = true;
  stepWith(tk, { roll: (k) => (k === "tackle" ? false : undefined), decide: { action: "hold" } });
  assert.deepEqual(tk.ball.holder, { side: "away", id: "m_p6" });
  assert.ok(live(tk, "home", "p7").combo, "그 턴은 아직");
  stepWith(tk);
  assert.equal(live(tk, "home", "p7").combo, null, "공을 잃었으니 끝");
  assert.equal(live(tk, "home", "p7").armed, false);
  assert.equal(cutins(tk).length, 0);
});

test("게이지 얻기 (겨루기): 가로채기 한 수비 · 굴림을 살아남은 패스 (패스한 선수, 도착 때) · 선방한 GK — 각 +gaugeDuelWin", () => {
  // 가로채기 성공: 첫 굴림 수비
  const a = passScene({ gauge: { "home:p4": 40 } });
  stepWith(a, { roll: (k) => (k === "intercept" ? false : true), decide: PASS_TO_P7 });
  const ie = evs(a, "intercept")[0];
  assert.equal(ie.success, true);
  assert.equal(live(a, "away", ie.defenderId).gauge, cfg.match.ultimate.gaugeStart + D.gaugeDuelWin + D.gaugePerTurn);
  // 모두 살아남음 → 도착 때 패스한 선수 +gaugeDuelWin
  const b = passScene({ gauge: { "home:p4": 40 } });
  stepWith(b, { roll: () => true, decide: PASS_TO_P7 });
  let n = 1;
  while (!evs(b, "receive").length && n < 4) { stepWith(b, { roll: () => true }); n++; }
  assert.equal(evs(b, "receive")[0].playerId, "p7");
  assert.ok(evs(b, "intercept").length >= 1);
  near(live(b, "home", "p4").gauge, 40 + D.gaugeDuelWin + n * D.gaugePerTurn, "굴림을 살아남은 패스");
  // 선방
  const c = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" } });
  stepWith(c, { roll: () => false, decide: { action: "shoot" } });
  assert.equal(evs(c, "save").length, 1);
  assert.equal(live(c, "away", "m_p1").gauge, cfg.match.ultimate.gaugeStart + D.gaugeDuelWin + D.gaugePerTurn);
});

test("AI 규칙: 추가시간에는 준비된 필살기를 모두 켠다 (조건 없는 패스 · 수비 · 팀도)", () => {
  const full = {};
  for (const pid of SQ.away.players.map((p) => p.id)) full[`away:${pid}`] = MAX;
  const ms = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"], turn: 100 });
  ms.stage = "addedTime";
  ms.stageEndTurn = 125;
  ms.addedTime = { side: "home", startTurn: 100, endTurn: null, reason: null };
  stepWith(ms, { decide: { action: "hold" } });
  for (const pid of ["m_p2", "m_p6"]) assert.equal(live(ms, "away", pid).armed, true, `${pid} 추가시간`);
  assert.ok(ms.teamUlt.away, "팀도");
});

test("ultimateStatus canNow (지금!): 드리블 = 공 + 앞쪽 3칸 태클 수비 · 패스 = 공을 가짐 · 크로스만 되는 패스 = 측면에서만", () => {
  const ms = scene({ home: { p5: [6, 6] }, away: { m_p6: [7, 6] }, ball: { side: "home", id: "p5" }, gauge: { "home:p5": MAX } });
  assert.equal(hex.ultimateStatus(ms, data, "home", "p5").canNow, true, "드리블 — 태클이 온다");
  assert.equal(hex.ultimateStatus(ms, data, "home", "p5").reason, "지금 쓰기");
  for (const pid of ["p4", "p6"]) {
    const m = scene({ home: { [pid]: [6, 6] }, ball: { side: "home", id: pid }, gauge: { [`home:${pid}`]: MAX } });
    assert.equal(hex.ultimateStatus(m, data, "home", pid).canNow, true, `${pid} 패스 — 공을 가짐`);
  }
  const off = scene({ homeSnap: CROSS_HOME, home: { p6: [8, 6] }, ball: { side: "home", id: "p6" }, gauge: { "home:p6": MAX } });
  const so = hex.ultimateStatus(off, data, "home", "p6");
  assert.equal(so.canNow, false, "뇌전 화살 (크로스만) — 측면이 아니면");
  assert.equal(so.reason, "누르면 예약 — 크로스 자리에서");
  const on = scene({ homeSnap: CROSS_HOME, home: { p6: [12, 2] }, ball: { side: "home", id: "p6" }, gauge: { "home:p6": MAX } });
  assert.equal(hex.ultimateStatus(on, data, "home", "p6").canNow, true, "측면 크로스 자리");
});

/* ------------------------------------------------------------------ */
/* AI 규칙                                                               */
/* ------------------------------------------------------------------ */

test("AI 규칙: 사람 쪽은 저절로 안 켠다 · 슛 · 드리블 · 세이브는 준비되면 · 패스는 공격 진영이나 짝 · 수비는 상대가 우리 진영 · 팀은 지고 있을 때 · 마지막 50턴은 모두", () => {
  const full = {};
  for (const s of ["home", "away"]) for (const pid of SQ[s].players.map((p) => p.id)) full[`${s}:${pid}`] = MAX;
  // 공: 홈 (사람) 이 자기 진영 (3,3) — 원정 AI 기준 상대 공이 원정의 공격 진영 쪽 (원정 자기 진영 열 11)
  const ms = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"] });
  stepWith(ms, { decide: { action: "hold" } });
  for (const pid of ms.order.home) assert.equal(live(ms, "home", pid).armed, false, `사람 쪽 ${pid} 는 안 켬`);
  const armed = (pid) => live(ms, "away", pid).armed;
  assert.equal(armed("m_p1"), true, "세이브");
  assert.equal(armed("m_p7"), true, "슛");
  assert.equal(armed("m_p5"), true, "드리블");
  assert.equal(armed("m_p4"), true, "패스 — 합체기 짝 (그레타) 이 경기장에");
  assert.equal(armed("m_p6"), false, "패스 — 짝 없음 · 우리 공 아님");
  assert.equal(armed("m_p2"), false, "수비 — 상대 공이 우리 진영 밖");
  assert.equal(armed("m_p3"), false, "팀 — 비김");
  assert.equal(ms.teamUlt.away, null);
  // 상대 공이 원정 진영으로 (홈 열 9 → 원정 자기 진영 열 5) → 수비 켬
  const m2 = scene({ home: { p6: [9, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"] });
  stepWith(m2, { decide: { action: "hold" } });
  assert.equal(live(m2, "away", "m_p2").armed, true);
  // 원정 공 · 원정 공격 진영 (홈 열 5 = 원정 자기 진영 열 9) → 울리카 패스 켬 (켠 다음 그 턴에 패스로 터질 수 있다)
  const m3 = scene({ away: { m_p5: [5, 9] }, ball: { side: "away", id: "m_p5" }, gauge: { "away:m_p6": MAX }, ai: ["away"] });
  stepWith(m3, { decide: { action: "hold" } });
  assert.equal(live(m3, "away", "m_p6").armed, true);
  // 지고 있으면 팀 필살기 (켜는 턴에 바로)
  const m4 = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: { "away:m_p3": MAX }, ai: ["away"] });
  m4.score.home = 1;
  stepWith(m4, { decide: { action: "hold" } });
  assert.equal(cutins(m4)[0].playerId, "m_p3");
  assert.ok(m4.teamUlt.away);
  // 마지막 50턴: 조건 없이 모두 (팀도)
  const m5 = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"], turn: 300 - D.aiUltLastTurns });
  stepWith(m5, { decide: { action: "hold" } });
  for (const pid of ["m_p2", "m_p6"]) assert.equal(live(m5, "away", pid).armed, true, `${pid} 마지막 50턴`);
  assert.ok(m5.teamUlt.away, "팀도");
  const m6 = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"], turn: 300 - D.aiUltLastTurns - 1 });
  stepWith(m6, { decide: { action: "hold" } });
  assert.equal(live(m6, "away", "m_p6").armed, false, "그 전 턴은 아직");
  // 골든골 내내
  const m7 = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"], turn: 100 });
  m7.stage = "goldenGoal";
  m7.stageEndTurn = 400;
  stepWith(m7, { decide: { action: "hold" } });
  assert.equal(live(m7, "away", "m_p6").armed, true);
  // 사람 쪽을 AI 로 (⏭ · simulateAuto)
  const m8 = scene({ home: { p6: [3, 3] }, ball: { side: "home", id: "p6" }, gauge: full, ai: ["away"] });
  hex.setAutoBoth(m8);
  assert.deepEqual(m8.aiSides, ["home", "away"]);
  stepWith(m8, { decide: { action: "hold" } });
  assert.equal(live(m8, "home", "p7").armed, true);
});

test("simulateAuto = 양쪽 AI: 연습 선수단 경기에서 양쪽 다 필살기를 쓰고, 기록 = 컷인 수 · 합체기 = combo 이벤트 · 사람 쪽만 두면 사람 쪽은 0", () => {
  const kinds = new Set();
  for (let i = 0; i < 6; i++) {
    const ms = hex.createMatch({ data, seed: `ult-auto-${i}`, home: SQ.home, away: SQ.away, kind: "goal" });
    hex.simulateAuto(ms, data);
    assert.deepEqual(ms.aiSides, ["home", "away"]);
    for (const side of ["home", "away"]) {
      const n = cutins(ms).filter((e) => e.side === side).length;
      assert.ok(n > 0, `${i} ${side} 필살기`);
      assert.equal(ms.stats[side].ultimatesUsed, n);
      assert.equal(ms.stats[side].combos, evs(ms, "combo").filter((e) => e.side === side).length);
      assert.equal(hex.getResult(ms).stats[side].ultimatesUsed, n);
    }
    for (const e of cutins(ms)) kinds.add(e.ultimateType);
    for (const e of ms.events) if (e.reverseCutin) kinds.add("rev-" + e.reverseCutin.kind);
  }
  for (const t of ["shot", "pass", "save", "defense", "team"]) assert.ok(kinds.has(t), `유형 ${t} 가 나왔다`);
  assert.ok(kinds.has("rev-save") || kinds.has("rev-passCut") || kinds.has("rev-block"), "역컷인이 나왔다");
  // 사람 쪽 (홈) 은 아무것도 안 누르면 0
  const ms = hex.createMatch({ data, seed: "ult-human", home: SQ.home, away: SQ.away, kind: "friendly" });
  while (!ms.finished) hex.step(ms, data);
  assert.equal(ms.stats.home.ultimatesUsed, 0);
  assert.ok(ms.stats.away.ultimatesUsed > 0);
});

/* ------------------------------------------------------------------ */
/* 화면용 상태                                                             */
/* ------------------------------------------------------------------ */

test("ultimateStatus / ultimateList: 포메이션 순서 7명 · 이름 · 유형 · 등급 · 게이지 · 준비 · 예약 · 지금 쓰기 (canNow) · 필살기 없는 선수", () => {
  const ms = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX, "home:p4": 55.5 } });
  const list = hex.ultimateList(ms, data, "home");
  assert.deepEqual(list.map((x) => x.playerId), ms.order.home);
  assert.deepEqual(list.map((x) => x.type), ["save", "defense", "team", "pass", "dribble", "pass", "shot"]);
  const p7 = list[6];
  assert.equal(p7.name, "메테오 슛");
  assert.equal(p7.tier, "SSR");
  assert.equal(p7.line, "땅이 먼저 울릴 거야.");
  assert.ok(p7.description.startsWith("필살 슛:"));
  assert.equal(p7.ready, true);
  assert.equal(p7.canNow, true, "공을 갖고 슛 거리");
  assert.equal(p7.reason, "지금 쓰기");
  const p4 = list[3];
  assert.deepEqual([p4.gauge, p4.max, p4.ready, p4.canNow, p4.reason], [55.5, MAX, false, false, "충전 55%"]);
  assert.equal(list[0].canNow, false, "세이브는 늘 예약");
  assert.equal(list[2].canNow, true, "팀은 바로");
  // 수비: 공 가진 상대의 앞쪽 3칸에 섰을 때만
  const dm = scene({ away: { m_p6: [8, 6] }, home: { p2: [7, 6], p3: [9, 6] }, ball: { side: "away", id: "m_p6" } });
  assert.equal(hex.ultimateStatus(dm, data, "home", "p2").canNow, true, "원정 공격 (←) 의 정면");
  assert.equal(hex.ultimateStatus(dm, data, "home", "p2").reason.startsWith("누르면 예약") || hex.ultimateStatus(dm, data, "home", "p2").reason.startsWith("충전"), true);
  dm.live.home.p2.restUntil = 99;
  assert.equal(hex.ultimateStatus(dm, data, "home", "p2").canNow, false, "넘어져 쉬면 아님");
  // 필살기 없는 선수 · 없는 id
  const t = withSkill(SQ.home, "p6", null);
  const nm = scene({ homeSnap: t });
  const s6 = hex.ultimateStatus(nm, data, "home", "p6");
  assert.equal(s6.has, false);
  assert.equal(s6.gauge, null);
  assert.equal(hex.ultimateStatus(nm, data, "home", "zz").has, false);
  assert.equal(hex.ultimateList(nm, data, "home").length, 7);
  // 끝난 경기 · 승부차기
  nm.stage = "penalties";
  assert.equal(hex.ultimateStatus(nm, data, "home", "p7").reason, "승부차기");
});

/* ------------------------------------------------------------------ */
/* 결정성 · 입력 기록                                                       */
/* ------------------------------------------------------------------ */

/** 사람 쪽 (홈) 이 "준비되면 바로 누름" 으로 경기를 돌리며 입력 기록 [stepIndex, side, playerId, op] 을 남긴다 */
function playWithPresses(seed) {
  const ms = hex.createMatch({ data, seed, home: SQ.home, away: SQ.away, kind: "goal" });
  const log = [];
  let k = 0;
  while (!ms.finished) {
    const ups = [];
    for (const st of hex.ultimateList(ms, data, "home")) {
      if (st.has && !st.armed && (st.ready || st.comboReady) && ms.stage !== "penalties") ups.push({ side: "home", playerId: st.playerId, op: "arm" });
    }
    if (k === 40) ups.push({ side: "home", playerId: "p5", op: "disarm" }); // 끄기도 섞는다 (안 켰으면 무시)
    for (const u of ups) log.push([k, u.side, u.playerId, u.op]);
    hex.step(ms, data, ups.length ? { ultimates: ups } : null);
    k++;
  }
  return { ms, log, steps: k };
}
function replay(seed, log, steps) {
  const ms = hex.createMatch({ data, seed, home: SQ.home, away: SQ.away, kind: "goal" });
  for (let i = 0; i < steps && !ms.finished; i++) {
    const ups = log.filter((x) => x[0] === i).map(([, side, playerId, op]) => ({ side, playerId, op }));
    hex.step(ms, data, ups.length ? { ultimates: ups } : null);
  }
  return ms;
}

test("결정성: 같은 시드 + 같은 입력 = 같은 JSON · 입력 기록을 그 step 에 다시 넣으면 같은 경기 · 입력이 경기를 바꾼다", () => {
  const a = playWithPresses("ult-det");
  const b = playWithPresses("ult-det");
  assert.equal(JSON.stringify(a.ms), JSON.stringify(b.ms));
  assert.ok(a.ms.stats.home.ultimatesUsed > 0, "사람 쪽이 실제로 썼다");
  const r = replay("ult-det", a.log, a.steps);
  assert.equal(JSON.stringify(r), JSON.stringify(a.ms), "입력 기록 다시 돌리기");
  // 중간까지 돌리고 JSON 으로 저장 → 이어서 돌려도 같다
  const half = replay("ult-det", a.log, Math.floor(a.steps / 2));
  const resumed = JSON.parse(JSON.stringify(half));
  for (let i = Math.floor(a.steps / 2); i < a.steps && !resumed.finished; i++) {
    const ups = a.log.filter((x) => x[0] === i).map(([, side, playerId, op]) => ({ side, playerId, op }));
    hex.step(resumed, data, ups.length ? { ultimates: ups } : null);
  }
  assert.equal(JSON.stringify(resumed), JSON.stringify(a.ms));
  // 입력 없이 = 다른 경기
  const none = replay("ult-det", [], a.steps);
  assert.notEqual(JSON.stringify(none.events), JSON.stringify(a.ms.events));
  assert.equal(none.stats.home.ultimatesUsed, 0);
});
