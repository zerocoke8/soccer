// test/hexScene.test.mjs — 육각 경기 화면 장면 계산 (js/ui/hexScene.js, 순수 함수). HEX_AUTOBATTLE_PLAN §5 · H1 SPEC §3
//   보드 → 판 (189칸 필드 안 · 거울 · 이웃 거리 · 정육각형 · 골 행 깊이 50 %) · 시계 글자 · frameAt (alpha 0/1 끝점 · 킥오프 바로 · 골 턴 ·
//   공: 가진 선수 발 앞 / 비행 / 크로스 호 (여러 턴 비행은 턴 경계에서 높이가 이어진다 · 한 턴 안에 뜨고 내려앉은 크로스도 호) / 흘러나온 공) ·
//   2칸 이상 바로 · 1칸 보간 · 쉬는 선수 경계 (restUntil = 지금 턴) · 골 슛 호 · 골망 깊이 = 골 행 안 · 결정적 (같은 입력 → 같은 출력, 입력을 바꾸지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";
import * as V from "../js/ui/view25.js";
import * as HS from "../js/ui/hexScene.js";

const data = loadData();
const SIZES = [[1244, 528], [915, 388]];
const [W, H] = SIZES[0];
const { FL, FD, RU, RV } = V.V25;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b} (±${eps})`);
const CLOCK = { turnsRegular: hex.TURNS_REGULAR, goldenTurns: hex.GOLDEN_TURNS };

const HOME = run.buildTeamSnapshot(run.createRun({ data, seed: "scene-home" }), data);
const AWAY = run.buildOpponentSnapshot(data.opponents[0], data);

/** 한 경기를 끝까지: 턴마다 { prev: sceneSnap(전), next: clone(뒤) } */
function playAll(seed, kind = "friendly") {
  const ms = hex.createMatch({ data, seed, home: HOME, away: AWAY, kind });
  const turns = [];
  while (!ms.finished) {
    const prev = HS.sceneSnap(ms);
    hex.step(ms, data);
    turns.push({ prev, next: clone(ms) });
  }
  return { first: hex.createMatch({ data, seed, home: HOME, away: AWAY, kind }), turns };
}
const MATCHES = [playAll("hs-1"), playAll("hs-2"), playAll("hs-3")];
const ALL_TURNS = MATCHES.flatMap((m) => m.turns);
const evOf = (st, type) => HS.eventsOfTurn(st).filter((e) => e.type === type);
const proj = (id) => {
  const p = HS.cellPlane(id);
  return V.projectPlane(p.u, p.v, W, H);
};

test("보드 → 판: 189칸 중심이 모두 필드 사각형 안, 보드 폭 = 필드 길이, 깊이 가운데", () => {
  assert.equal(G.ALL_CELLS.length, 189);
  for (const id of G.ALL_CELLS) {
    const { u, v } = HS.cellPlane(id);
    assert.ok(u > RU && u < RU + FL && v > RV && v < RV + FD, `칸 ${id} (${u}, ${v})`);
  }
  near(HS.HEX_PX, FL / (15 * Math.sqrt(3)), 1e-12, "HEX_PX");
  near(HS.HEX_PX, 47.88, 0.01, "HEX_PX ≈ 47.88");
  const b = HS.boardPlaneRect();
  near(b.u0, RU, 1e-9, "보드 왼쪽 = 골라인");
  near(b.u1, RU + FL, 1e-9, "보드 오른쪽 = 골라인");
  near((b.v0 + b.v1) / 2, RV + FD / 2, 1e-9, "보드 깊이 가운데");
  assert.ok(b.v0 > RV && b.v1 < RV + FD, "보드 깊이가 필드 안");
  assert.deepEqual(HS.FIELD_RECT, { u0: RU, v0: RV, u1: RU + FL, v1: RV + FD });
});

test("거울 칸 ↔ 필드 가운데에 대해 거울 u (같은 v)", () => {
  const cu = RU + FL / 2;
  for (const id of G.ALL_CELLS) {
    const a = HS.cellPlane(id);
    const b = HS.cellPlane(G.mirrorId(id));
    near(a.u + b.u, 2 * cu, 1e-9, `칸 ${id} 거울 u`);
    assert.equal(a.v, b.v, `칸 ${id} 거울 v`);
  }
  near(HS.cellPlane(G.cellId(7, 6)).u, cu, 1e-9, "센터 칸 = 필드 가운데");
});

test("이웃 중심 거리 = √3 · S (모든 칸 · 모든 이웃), 육각형 꼭짓점은 정육각형 (뾰족한 위)", () => {
  const S = HS.HEX_PX;
  for (const id of G.ALL_CELLS) {
    const a = HS.cellPlane(id);
    for (const nb of G.neighbors(id)) {
      const b = HS.cellPlane(nb);
      near(Math.hypot(a.u - b.u, a.v - b.v), Math.sqrt(3) * S, 1e-9, `${id} ↔ ${nb}`);
    }
    const cs = HS.hexCornersPlane(id);
    assert.equal(cs.length, 6);
    for (let i = 0; i < 6; i++) {
      const p = cs[i];
      const q = cs[(i + 1) % 6];
      near(Math.hypot(p.u - a.u, p.v - a.v), S, 1e-9, `${id} 꼭짓점 ${i} 반지름`);
      near(Math.hypot(p.u - q.u, p.v - q.v), S, 1e-9, `${id} 변 ${i}`);
    }
    // 뾰족한 위: 위 · 아래 꼭짓점이 중심과 같은 u
    assert.ok(cs.some((p) => Math.abs(p.u - a.u) < 1e-9 && p.v < a.v), "위 꼭짓점");
    assert.ok(cs.some((p) => Math.abs(p.u - a.u) < 1e-9 && p.v > a.v), "아래 꼭짓점");
  }
  // 이웃 칸은 변을 나눈다 (꼭짓점 두 개 공유)
  const shared = HS.hexCornersPlane(G.cellId(7, 6)).filter((p) => HS.hexCornersPlane(G.cellId(8, 6)).some((q) => Math.hypot(p.u - q.u, p.v - q.v) < 1e-9));
  assert.equal(shared.length, 2);
});

test("골 행 가운데 (행 6) = 필드 깊이 50 %, 골 행 5 ~ 7 이 view25 골문 안", () => {
  for (const c of [0, 7, 14]) near(V.planeToField(HS.cellPlane(G.cellId(c, 6)).u, HS.cellPlane(G.cellId(c, 6)).v).x, 50, 1e-9, `(${c}, 6)`);
  for (const r of G.GOAL_ROWS) {
    const x = V.planeToField(0, HS.crPlane(0, r).v).x;
    assert.ok(x > V.V25.GOAL_X0 && x < V.V25.GOAL_X1, `행 ${r} 깊이 ${x}%`);
  }
});

test("gridCells: 189칸 · 박스 양쪽 12칸 (거울) · quadScreen = projectPlane 귀퉁이", () => {
  const g = HS.gridCells();
  assert.equal(g.length, 189);
  assert.equal(g.filter((c) => c.box === -1).length, 12);
  assert.equal(g.filter((c) => c.box === 1).length, 12);
  for (const c of g) if (c.box) assert.equal(g.find((x) => x.id === G.mirrorId(c.id)).box, -c.box);
  assert.equal(HS.gridCells(), g, "한 번만 만든다");
  const q = HS.quadScreen(HS.FIELD_RECT, W, H);
  near(q[0].x, W * V.V25.FAR_INSET, 1e-6, "왼쪽 위 x");
  near(q[0].y, V.V25.FAR_Y, 1e-6, "왼쪽 위 y");
  near(q[2].x, W, 1e-6, "오른쪽 아래 x");
  near(q[3].y, H - V.V25.NEAR_PAD, 1e-6, "왼쪽 아래 y");
});

test("clockText: 정규 · 골든골 · 추가시간 · 승부차기 · 끝", () => {
  const st = (o) => ({ turn: 0, stage: "regular", stageEndTurn: 300, finished: false, ...o });
  assert.equal(HS.clockText(st({ turn: 0 }), CLOCK), "2:00");
  assert.equal(HS.clockText(st({ turn: 1 }), CLOCK), "2:00"); // 119.6 초 → 올림
  assert.equal(HS.clockText(st({ turn: 150 }), CLOCK), "1:00");
  assert.equal(HS.clockText(st({ turn: 275 }), CLOCK), "0:10");
  assert.equal(HS.clockText(st({ turn: 300 }), CLOCK), "0:00");
  assert.equal(HS.clockText(st({ turn: 0 })), "2:00", "cfg 없이도 기본값");
  assert.equal(HS.clockText(st({ turn: 300, stage: "goldenGoal", stageEndTurn: 375 }), CLOCK), "골든골 0:30");
  assert.equal(HS.clockText(st({ turn: 330, stage: "goldenGoal", stageEndTurn: 375 }), CLOCK), "골든골 0:18");
  assert.equal(HS.clockText(st({ turn: 375, stage: "goldenGoal", stageEndTurn: 375 }), CLOCK), "골든골 0:00");
  assert.equal(HS.clockText(st({ turn: 310, stage: "goldenGoal", stageEndTurn: 385 }), CLOCK), "골든골 0:30", "추가시간 뒤 늦게 시작해도 시작부터 75턴");
  assert.equal(HS.clockText(st({ turn: 305, stage: "addedTime", stageEndTurn: 325 }), CLOCK), "추가시간");
  assert.equal(HS.clockText(st({ turn: 375, stage: "penalties" }), CLOCK), "승부차기");
  assert.equal(HS.clockText(st({ turn: 300, finished: true }), CLOCK), "경기 종료");
  assert.equal(HS.clockText(st({ turn: 375, stage: "penalties", finished: true }), CLOCK), "경기 종료");
  // 실제 경기 상태
  assert.equal(HS.clockText(MATCHES[0].first, CLOCK), "2:00");
});

test("stageLabel · scoreText", () => {
  assert.equal(HS.stageLabel({ stage: "regular" }), "정규 시간");
  assert.equal(HS.stageLabel({ stage: "addedTime" }), "추가시간");
  assert.equal(HS.stageLabel({ stage: "goldenGoal" }), "골든골");
  assert.equal(HS.stageLabel({ stage: "penalties", penalties: { home: 3, away: 2 } }), "승부차기 3 : 2");
  assert.equal(HS.stageLabel({ stage: "regular", finished: true }), "경기 종료");
  assert.equal(HS.scoreText({ score: { home: 2, away: 1 } }), "2 : 1");
  assert.equal(HS.scoreText(MATCHES[0].first), "0 : 0");
});

test("easeOut: 0 → 0, 1 → 1, 처음 빠르고 끝에 느리다, 범위 밖은 자른다", () => {
  assert.equal(HS.easeOut(0), 0);
  assert.equal(HS.easeOut(1), 1);
  assert.ok(HS.easeOut(0.25) > 0.5, "처음 1/4 에 절반 넘게");
  assert.ok(HS.easeOut(0.5) - HS.easeOut(0.25) > HS.easeOut(1) - HS.easeOut(0.75), "끝으로 갈수록 느리다");
  assert.equal(HS.easeOut(-1), 0);
  assert.equal(HS.easeOut(2), 1);
});

test("frameAt 모양: 14명 · 키 · 투영 값 · 머리 위 점 · 초점", () => {
  const ms = MATCHES[0].first;
  for (const [w, h] of SIZES) {
    const f = HS.frameAt(null, ms, 0, { W: w, H: h });
    assert.equal(f.players.length, 14);
    assert.equal(new Set(f.players.map((p) => p.key)).size, 14);
    for (const p of f.players) {
      assert.equal(p.key, `${p.side}:${p.id}`);
      const c = V.projectPlane(HS.cellPlane(ms.pos[p.side][p.id]).u, HS.cellPlane(ms.pos[p.side][p.id]).v, w, h);
      near(p.sx, c.sx, 1e-9, "sx");
      near(p.sy, c.sy, 1e-9, "sy");
      near(p.s, c.s, 1e-9, "s");
      assert.equal(p.z, p.sy);
      assert.ok(p.ga > 0.45 && p.ga < 0.65, `ga ${p.ga}`);
      near(p.figure.fh, V.V25.STANDEE_H * p.s, 1e-9, "스탠디 키");
      near(p.ground.w, 38 * p.s, 1e-9, "그림자 폭");
      assert.equal(typeof p.color, "string");
      assert.equal(p.resting, false);
      const hp = HS.headPoint(p);
      assert.equal(hp.sx, p.sx);
      assert.ok(hp.sy < p.sy - p.figure.fh, "머리 위");
    }
    const car = f.players.filter((p) => p.carrier);
    assert.equal(car.length, 1, "공 가진 선수 1명");
    assert.equal(car[0].key, f.carrierKey);
    assert.equal(car[0].side, "home");
    assert.equal(f.attackRight, true);
    assert.equal(f.kickoff, true);
    assert.ok(f.focus.x > 0 && f.focus.x < 100 && f.focus.y > 0 && f.focus.y < 100);
    // 카메라 점 = tx + z · sx
    const cam = { cx: w / 2, cy: h / 2, z: 1 };
    assert.deepEqual(HS.camPoint({ sx: 10, sy: 20 }, cam, w, h), { x: 10, y: 20 });
  }
});

test("frameAt: alpha 0 / 1 끝점 = prev / next 칸의 투영 (킥오프 · 2칸 뛰기 없는 턴)", () => {
  let checked = 0;
  for (const { prev, next } of ALL_TURNS) {
    if (evOf(next, "kickoff").length || next.stage === "penalties") continue;
    const f0 = HS.frameAt(prev, next, 0, { W, H });
    const f1 = HS.frameAt(prev, next, 1, { W, H });
    const fm = HS.frameAt(prev, next, 0.5, { W, H });
    for (const p of f1.players) {
      const pc = prev.pos[p.side][p.id];
      const nc = next.pos[p.side][p.id];
      const a = proj(nc);
      near(p.sx, a.sx, 1e-9, "alpha 1 sx");
      near(p.sy, a.sy, 1e-9, "alpha 1 sy");
      const q = f0.players.find((x) => x.key === p.key);
      const b = proj(G.distance(pc, nc) >= 2 ? nc : pc);
      near(q.sx, b.sx, 1e-9, "alpha 0 sx");
      near(q.sy, b.sy, 1e-9, "alpha 0 sy");
      if (pc !== nc && G.distance(pc, nc) === 1) {
        // 가운데 = easeOut(0.5) 만큼 (판 위 직선)
        const m = fm.players.find((x) => x.key === p.key);
        const pp = HS.cellPlane(pc);
        const np = HS.cellPlane(nc);
        near(m.u, pp.u + (np.u - pp.u) * HS.easeOut(0.5), 1e-9, "보간 u");
        near(m.v, pp.v + (np.v - pp.v) * HS.easeOut(0.5), 1e-9, "보간 v");
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `움직인 선수 확인 ${checked}`);
});

test("frameAt: 2칸 이상 뛴 선수는 바로 (보간 없음)", () => {
  const { first } = MATCHES[0];
  const next = clone(first);
  next.turn = 1;
  next.events = [];
  const pid = Object.keys(next.pos.home).find((id) => next.roles.home[id] !== "GK" && !(next.ball.holder && next.ball.holder.id === id));
  const from = next.pos.home[pid];
  const occ = new Set([...Object.values(next.pos.home), ...Object.values(next.pos.away)]);
  for (const d of [2, 3]) {
    const far = G.ALL_CELLS.find((c) => !occ.has(c) && G.distance(c, from) === d);
    next.pos.home[pid] = far;
    const f = HS.frameAt(HS.sceneSnap(first), next, 0.3, { W, H });
    const p = f.players.find((x) => x.key === `home:${pid}`);
    const a = proj(far);
    near(p.sx, a.sx, 1e-9, `${d}칸: 바로 next 자리`);
    near(p.sy, a.sy, 1e-9, `${d}칸: 바로 next 자리 sy`);
  }
  // 1칸은 보간 (경계 확인)
  const one = G.neighbors(from).find((c) => !occ.has(c));
  next.pos.home[pid] = one;
  const p1 = HS.frameAt(HS.sceneSnap(first), next, 0.3, { W, H }).players.find((x) => x.key === `home:${pid}`);
  assert.ok(Math.abs(p1.sx - proj(one).sx) > 1e-6 || Math.abs(p1.sy - proj(one).sy) > 1e-6, "1칸은 보간 중 (next 자리 아님)");
});

test("frameAt: 킥오프 턴은 alpha 와 상관없이 next 자리 (경기 시작 · prev 가 있어도)", () => {
  const { first } = MATCHES[0];
  const fake = HS.sceneSnap(first);
  for (const side of ["home", "away"]) for (const id of Object.keys(fake.pos[side])) fake.pos[side][id] = G.cellId(id.length % 2 ? 3 : 11, 2);
  for (const a of [0, 0.4, 1]) {
    const f = HS.frameAt(fake, first, a, { W, H });
    assert.equal(f.kickoff, true);
    for (const p of f.players) {
      const c = proj(first.pos[p.side][p.id]);
      near(p.sx, c.sx, 1e-9, `alpha ${a} sx`);
      near(p.sy, c.sy, 1e-9, `alpha ${a} sy`);
    }
  }
});

test("frameAt: 골 턴 — 선수는 prev 자리, 공은 골망으로, 다음 그림 (null, next) 은 킥오프 자리", () => {
  const goals = ALL_TURNS.filter(({ next }) => evOf(next, "goal").length && evOf(next, "kickoff").length);
  assert.ok(goals.length > 0, "골이 난 턴이 있다");
  for (const { prev, next } of goals) {
    const gEv = evOf(next, "goal")[0];
    const f0 = HS.frameAt(prev, next, 0, { W, H });
    const f1 = HS.frameAt(prev, next, 1, { W, H });
    assert.deepEqual(f1.goal, { side: gEv.side, playerId: gEv.playerId });
    for (const p of f1.players) {
      const c = proj(prev.pos[p.side][p.id]);
      near(p.sx, c.sx, 1e-9, "골 턴 선수 = prev 자리");
    }
    // 공은 득점 팀이 공격한 골 너머
    if (gEv.side === "home") assert.ok(f1.ball.u > RU + FL, `홈 골 → 오른쪽 골망 ${f1.ball.u}`);
    else assert.ok(f1.ball.u < RU, `원정 골 → 왼쪽 골망 ${f1.ball.u}`);
    assert.ok(Math.abs(f1.ball.u - f0.ball.u) > 1, "공이 움직인다");
    // 슛은 얕은 호 (가운데 공중) · 골망 깊이는 골 행 5 ~ 7 안
    assert.ok(HS.frameAt(prev, next, 0.5, { W, H }).ball.lift > 0, "슛 호 (가운데 공중)");
    near(f1.ball.lift, 0, 1e-9, "골망에 닿으면 땅");
    const lo = HS.crPlane(0, G.GOAL_ROWS[0]).v;
    const hi = HS.crPlane(0, G.GOAL_ROWS[G.GOAL_ROWS.length - 1]).v;
    assert.ok(f1.ball.v >= lo - 1e-9 && f1.ball.v <= hi + 1e-9, `골망 깊이 = 골 행 안 (${f1.ball.v} ∈ [${lo}, ${hi}])`);
    const after = HS.frameAt(null, next, 1, { W, H });
    for (const p of after.players) near(p.sx, proj(next.pos[p.side][p.id]).sx, 1e-9, "킥오프 자리");
  }
});

test("frameAt 공: 가진 선수 발 앞 (공격 방향) · 같은 선수면 그 선수를 따라간다", () => {
  let n = 0;
  for (const { prev, next } of ALL_TURNS) {
    const h = next.ball.holder;
    if (!h || evOf(next, "kickoff").length || next.stage === "penalties") continue;
    for (const a of [0, 0.37, 1]) {
      const f = HS.frameAt(prev, next, a, { W, H });
      const p = f.players.find((x) => x.key === `${h.side}:${h.id}`);
      const same = prev.ball.holder && prev.ball.holder.side === h.side && prev.ball.holder.id === h.id;
      if (!same && a < 1) continue;
      const dx = f.ball.sx - p.sx;
      assert.ok(h.side === "home" ? dx > 0 : dx < 0, `공격 방향 앞 (${h.side}, ${dx})`);
      near(Math.abs(dx), 46 * 0.35 * p.s, 2.5, "발 앞 거리 ≈ 46 · 0.35 · s");
      assert.ok(f.ball.sy >= p.sy, "발과 같거나 조금 앞 (가까운 쪽)");
      assert.equal(f.ball.lift, 0);
      assert.equal(f.ball.shadow.sx, f.ball.sx);
      assert.equal(f.ball.shadow.sy, f.ball.sy);
      n++;
    }
  }
  assert.ok(n > 100, `가진 선수 확인 ${n}`);
});

test("frameAt 공: 비행 — alpha 0 = prev 공 칸 (또는 패스한 선수 발 앞), alpha 1 = 이번 턴 도착 칸, 크로스는 호", () => {
  let cont = 0;
  let launch = 0;
  let cross = 0;
  for (const { prev, next } of ALL_TURNS) {
    const nf = next.ball.flight;
    if (!nf || evOf(next, "kickoff").length) continue;
    const f0 = HS.frameAt(prev, next, 0, { W, H });
    const f1 = HS.frameAt(prev, next, 1, { W, H });
    const end = proj(next.ball.cell);
    near(f1.ball.shadow.sx, end.sx, 1e-9, "도착 칸 sx");
    near(f1.ball.shadow.sy, end.sy, 1e-9, "도착 칸 sy");
    assert.equal(next.ball.cell, nf.path[nf.at - 1], "엔진: 공 칸 = path[at − 1]");
    if (prev.ball.flight) {
      const st = proj(prev.ball.cell);
      near(f0.ball.shadow.sx, st.sx, 1e-9, "이어지는 비행 alpha 0");
      cont++;
    } else if (prev.ball.holder) {
      const pc = prev.pos[prev.ball.holder.side][prev.ball.holder.id];
      assert.ok(Math.abs(f0.ball.shadow.sx - proj(pc).sx) < 30, "패스한 선수 발 앞에서 출발");
      launch++;
    }
    if (nf.cross) {
      const fm = HS.frameAt(prev, next, 0.5, { W, H });
      assert.ok(fm.ball.lift > 0, "크로스 공중");
      assert.ok(fm.ball.sy < fm.ball.shadow.sy, "공이 그림자 위");
      cross++;
    } else {
      assert.equal(HS.frameAt(prev, next, 0.5, { W, H }).ball.lift, 0, "땅볼 패스");
    }
  }
  assert.ok(launch > 10, `새 비행 ${launch}`);
  assert.ok(cont + launch > 10, `비행 ${cont} + ${launch}`);
  assert.ok(cross > 0, `크로스 ${cross}`);
  // 도착 턴 (prev 비행 → next 비행 끝): alpha 0 = prev 공 칸, 크로스면 가운데에서 공중 · 끝에서 땅
  let arrive = 0;
  for (const { prev, next } of ALL_TURNS) {
    const pf = prev.ball.flight;
    if (!pf || next.ball.flight || evOf(next, "kickoff").length || evOf(next, "goal").length) continue;
    const f0 = HS.frameAt(prev, next, 0, { W, H });
    near(f0.ball.shadow.sx, proj(prev.ball.cell).sx, 1e-9, "도착 턴 alpha 0");
    const f1 = HS.frameAt(prev, next, 1, { W, H });
    near(f1.ball.lift, 0, 1e-9, "도착하면 땅");
    if (pf.cross) assert.ok(HS.frameAt(prev, next, 0.5, { W, H }).ball.lift > 0, "도착 턴 크로스 공중");
    arrive++;
  }
  assert.ok(arrive > 10, `도착 턴 ${arrive}`);
});

test("frameAt 공: 크로스 호 — 여러 턴 비행은 턴 경계에서 높이가 이어진다 (비행 전체 진행도), 한 턴 안에 뜨고 내려앉은 크로스도 호", () => {
  // 여러 턴: 턴 k 의 alpha 1 높이 = 턴 k + 1 의 alpha 0 높이 (> 0 — 턴마다 땅에 닿지 않는다)
  let multi = 0;
  for (const { turns } of MATCHES) {
    for (let i = 0; i + 1 < turns.length; i++) {
      const a = turns[i];
      const b = turns[i + 1];
      const nf = a.next.ball.flight;
      if (!nf?.cross || !b.prev.ball.flight || evOf(b.next, "kickoff").length || evOf(b.next, "goal").length) continue;
      const end = HS.frameAt(a.prev, a.next, 1, { W, H }).ball;
      const start = HS.frameAt(b.prev, b.next, 0, { W, H }).ball;
      assert.ok(end.lift > 0, `비행 중 턴 끝에도 공중 (${end.lift})`);
      near(start.lift, end.lift, 1e-9, "턴 경계에서 높이가 이어진다");
      near(start.shadow.sx, end.shadow.sx, 1e-9, "턴 경계에서 자리도 이어진다");
      multi++;
    }
  }
  assert.ok(multi > 0, `여러 턴 크로스 ${multi}`);
  // 한 턴 안에 뜨고 내려앉은 크로스 (prev · next 모두 비행 없음 — 이번 턴 pass 이벤트 cross)
  let same = 0;
  const sameTurn = (prev, next) => !prev.ball.flight && !next.ball.flight && !evOf(next, "goal").length && !evOf(next, "kickoff").length
    && evOf(next, "pass").some((e) => e.cross);
  const extra = [];
  for (let k = 4; k < 24 && ALL_TURNS.concat(extra).filter(({ prev, next }) => sameTurn(prev, next)).length < 3; k++) extra.push(...playAll(`hs-${k}`).turns);
  for (const { prev, next } of ALL_TURNS.concat(extra)) {
    if (!sameTurn(prev, next)) continue;
    assert.ok(HS.frameAt(prev, next, 0.5, { W, H }).ball.lift > 0, "한 턴 크로스도 가운데 공중");
    near(HS.frameAt(prev, next, 1, { W, H }).ball.lift, 0, 1e-9, "도착하면 땅");
    same++;
  }
  assert.ok(same > 0, `한 턴 크로스 ${same}`);
});

test("frameAt 공: 흘러나온 공 = 칸 중심", () => {
  let n = 0;
  for (const { prev, next } of ALL_TURNS) {
    if (!next.ball.loose || next.ball.holder || next.ball.flight) continue;
    const f1 = HS.frameAt(prev, next, 1, { W, H });
    const c = proj(next.ball.cell);
    near(f1.ball.sx, c.sx, 1e-9, "흘러나온 공 sx");
    near(f1.ball.sy, c.sy, 1e-9, "흘러나온 공 sy");
    assert.equal(f1.carrierKey, null);
    assert.ok(f1.players.every((p) => !p.carrier));
    n++;
  }
  // 흘러나온 공이 없는 시드여도 상태를 직접 만들어 확인
  const { first } = MATCHES[0];
  const st = clone(first);
  st.turn = 5;
  st.events = [];
  st.ball = { holder: null, cell: G.cellId(4, 3), flight: null, loose: true, holdStreak: 0 };
  const f = HS.frameAt(null, st, 1, { W, H });
  const c = proj(G.cellId(4, 3));
  near(f.ball.sx, c.sx, 1e-9, "직접 만든 흘러나온 공");
  near(f.focus.x, V.planeToField(HS.cellPlane(G.cellId(4, 3)).u, HS.cellPlane(G.cellId(4, 3)).v).x, 1e-9, "초점 = 공");
  assert.ok(n > 0, `흘러나온 공 턴 ${n}`);
});

test("frameAt: 쉬는 선수 표시 · 공격 방향 (포제션)", () => {
  const { first } = MATCHES[0];
  const st = clone(first);
  st.turn = 20;
  st.events = [];
  const pid = Object.keys(st.pos.away)[2];
  st.live.away[pid].restUntil = 21;
  st.ball.holder = { side: "away", id: Object.keys(st.pos.away)[3] };
  const f = HS.frameAt(null, st, 1, { W, H });
  assert.equal(f.players.find((p) => p.key === `away:${pid}`).resting, true);
  assert.equal(f.players.filter((p) => p.resting).length, 1);
  assert.equal(f.attackRight, false, "원정 공 → 왼쪽 공격");
  st.live.away[pid].restUntil = 20;
  assert.equal(HS.frameAt(null, st, 1, { W, H }).players.find((p) => p.key === `away:${pid}`).resting, true, "restUntil = 지금 턴 (넘어진 다음 턴) 도 쉰다");
  st.live.away[pid].restUntil = 19;
  assert.equal(HS.frameAt(null, st, 1, { W, H }).players.find((p) => p.key === `away:${pid}`).resting, false);
});

test("결정적 · 순수: 같은 입력 → 같은 frame, 입력 상태를 바꾸지 않는다", () => {
  const { prev, next } = ALL_TURNS[40];
  const before = JSON.stringify([prev, next]);
  const a = HS.frameAt(prev, next, 0.42, { W, H });
  const b = HS.frameAt(clone(prev), clone(next), 0.42, { W, H });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify([prev, next]), before);
  assert.deepEqual(HS.frameAt(prev, next, 0.42, { W: 915, H: 388 }), HS.frameAt(prev, next, 0.42, { W: 915, H: 388 }));
});

test("eventsOfTurn · sceneSnap", () => {
  const { first, turns } = MATCHES[0];
  assert.deepEqual(HS.eventsOfTurn(first).map((e) => e.type), ["kickoff"]);
  const t = turns[9].next;
  assert.ok(HS.eventsOfTurn(t).every((e) => e.turn === t.turn));
  assert.equal(HS.eventsOfTurn(t).length, t.events.filter((e) => e.turn === t.turn).length);
  const s = HS.sceneSnap(t);
  assert.deepEqual(Object.keys(s).sort(), ["ball", "pos", "possessionSide", "stage", "turn"]);
  assert.notEqual(s.pos, t.pos, "복사");
  assert.deepEqual(s.pos, t.pos);
});
