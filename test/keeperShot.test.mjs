// test/keeperShot.test.mjs — GK 자리 · 슛 방향 (K1 — docs/SPRITE_25D_PLAN.md §12, 2026-10-06, 화면만)
//   layout.shotTarget: 골 = GK 가 없는 쪽 가장자리 (기둥 안) · 세이브 = GK 옆 (닿는 거리) · 결정적 (열쇠의 해시) · 난수 없음.
//   computeLayout keeper (2.5D 경기 화면): 공을 갖지 않은 GK (양 팀 · ④ 듀얼 수비 GK · 배급 대기의 상대 GK · 승부차기) = 자기 골문 안 골라인 바로 앞,
//   흔들어도 골문 안 · 골라인 앞 띠. 공을 가진 GK · 공 · 다른 선수 (④ 박스 깊이를 고르는 받는 선수 빼고) 는 keeper 없을 때와 같다. keeper 없음 = 예전 그대로.
//   view25.goalShapes 앞 · 뒤 층 (골문 안 GK 는 앞 층 뒤). jsdom: 2.5D 골 (GK 반대쪽 그물 안 · 높이 · GK 는 못 미치는 다이브 · 골라인 뒤 = 앞 층 뒤) ·
//   세이브 (GK 가 옆으로 날아 손에 공) · 슛 미리보기 화살표 = 같은 자리 · 평면 골도 GK 반대쪽.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { computeLayout, shotTarget, SHOT, KEEPER, JITTER } from "../js/ui/layout.js";
import * as V from "../js/ui/view25.js";
import { loadData, clone, run, match, dataFetch } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EPS = 1e-6;
const GEO25 = { aspect: 980 / 1244, tokenSize: 46 / 980 }; // screens/match.js layoutFor (2.5D)
const KEY25 = { ...GEO25, keeper: true };
const inRange = (x, [a, b]) => x >= a - EPS && x <= b + EPS;

test("shotTarget: 골 = GK 반대쪽 가장자리 (기둥 안) · 세이브 = GK 옆 닿는 거리 · 결정적 · 난수 없음", () => {
  assert.deepEqual(SHOT.posts, [V.V25.GOAL_X0, V.V25.GOAL_X1], "골문 = view25 GOAL_X0 · GOAL_X1 (평면 .pl-goal 38 ~ 62)");
  const realRandom = Math.random;
  Math.random = () => { throw new Error("Math.random 을 쓰면 안 된다"); };
  try {
    const sides = new Set();
    const heights = new Set();
    for (const goalSide of ["home", "away"]) {
      const line = goalSide === "home" ? 0 : 100;
      const out = goalSide === "home" ? -1 : 1;
      for (let gk = 38; gk <= 62 + EPS; gk += 0.25) {
        for (let i = 0; i < 24; i++) {
          const key = `k1|${goalSide}|${gk}|${i}`;
          const g = shotTarget({ gkX: gk, goalSide, kind: "goal", key });
          const where = `${goalSide} gk ${gk} #${i}`;
          // 기둥 안 · 가장자리 (먼 기둥 쪽 40 ~ 42 / 가까운 기둥 쪽 58 ~ 60)
          assert.ok(g.x > SHOT.posts[0] && g.x < SHOT.posts[1], `${where}: 골 x ${g.x} 기둥 안`);
          assert.ok(inRange(g.x, SHOT.far) || inRange(g.x, SHOT.near), `${where}: 가장자리 ${g.x}`);
          assert.equal(g.side, inRange(g.x, SHOT.near) ? 1 : -1, `${where}: side`);
          // GK 반대쪽: GK 가 가운데가 아니면 규칙대로, 가운데 (|x − 50| < tie) 면 해시
          if (gk <= 50 - SHOT.tie) assert.equal(g.side, 1, `${where}: GK 먼 쪽 → 가까운 기둥 쪽`);
          if (gk >= 50 + SHOT.tie) assert.equal(g.side, -1, `${where}: GK 가까운 쪽 → 먼 기둥 쪽`);
          if (inRange(gk, KEEPER.mouth)) assert.ok(Math.abs(g.x - gk) >= 7.5, `${where}: 골문 안 GK 에서 멀다 (${Math.abs(g.x - gk)})`);
          if (Math.abs(gk - 50) < SHOT.tie) sides.add(g.side);
          // 세로: 평면 기본 = 골라인 안쪽 0.5 (예전 99.5 · 0.5), 2.5D = 골라인 너머 그물 안
          assert.equal(g.y, line - out * 0.5, `${where}: 평면 골 y`);
          assert.equal(shotTarget({ gkX: gk, goalSide, kind: "goal", key, depth: 2.12 }).y, Math.round((line + out * 2.12) * 100) / 100, `${where}: 그물 안 y`);
          // 높이: 낮은 · 높은 구석 (공 바닥 — 크로스바 아래)
          assert.ok(inRange(g.lift, SHOT.low) || inRange(g.lift, SHOT.high), `${where}: lift ${g.lift}`);
          assert.ok(g.lift + 0.2 < 1, `${where}: 크로스바 아래`);
          heights.add(inRange(g.lift, SHOT.high) ? "high" : "low");
          // 결정적 (같은 열쇠 = 같은 자리, 숫자 열쇠 · JSON 왕복도)
          assert.deepEqual(shotTarget(JSON.parse(JSON.stringify({ gkX: gk, goalSide, kind: "goal", key }))), g, `${where}: 결정적`);
          // 세이브: GK 옆 (닿는 거리) · 기둥 안쪽 · GK 깊이 · 손 높이
          const gkY = line - out * 2;
          const s = shotTarget({ gkX: gk, gkY, goalSide, kind: "save", key });
          assert.ok(inRange(Math.abs(s.x - gk), SHOT.reach), `${where}: 세이브 거리 ${Math.abs(s.x - gk)}`);
          assert.ok(inRange(s.x, [SHOT.posts[0] + SHOT.postIn, SHOT.posts[1] - SHOT.postIn]), `${where}: 세이브 기둥 안쪽 ${s.x}`);
          assert.equal(s.side, Math.sign(s.x - gk), `${where}: 세이브 side`);
          assert.equal(s.y, gkY, `${where}: 세이브 y = GK 깊이`);
          assert.ok(inRange(s.lift, SHOT.handsLow) || inRange(s.lift, SHOT.handsHigh), `${where}: 손 높이 ${s.lift}`);
          assert.deepEqual(shotTarget({ gkX: gk, gkY, goalSide, kind: "save", key }), s, `${where}: 세이브 결정적`);
        }
      }
    }
    assert.deepEqual([...sides].sort(), [-1, 1], "가운데 GK 의 골 쪽은 열쇠마다 양쪽 다 나온다");
    assert.deepEqual([...heights].sort(), ["high", "low"], "낮은 · 높은 구석 둘 다");
    // 골문 밖 GK (평면 ④ 의 GK = 공 가진 선수 레인): 세이브는 골문 가운데 쪽, 골은 반대쪽 가장자리
    for (const gk of [12, 20, 30]) {
      for (let i = 0; i < 20; i++) {
        const s = shotTarget({ gkX: gk, gkY: 97, kind: "save", key: `out${i}` });
        assert.ok(s.side === 1 && inRange(s.x - gk, SHOT.reach), `골문 밖 ${gk}: 세이브는 가운데 쪽 ${s.x}`);
        assert.ok(inRange(shotTarget({ gkX: gk, kind: "goal", key: `out${i}` }).x, SHOT.near), `골문 밖 ${gk}: 골은 가까운 기둥 쪽`);
        const s2 = shotTarget({ gkX: 100 - gk, gkY: 97, kind: "save", key: `out${i}` });
        assert.ok(s2.side === -1 && inRange(100 - gk - s2.x, SHOT.reach), `골문 밖 ${100 - gk}: 세이브는 가운데 쪽`);
      }
    }
    // 기본값 (GK 정보 없음) = 가운데 GK · away 골
    const d = shotTarget({ key: "x" });
    assert.ok(d.y === 99.5 && (inRange(d.x, SHOT.far) || inRange(d.x, SHOT.near)));
  } finally {
    Math.random = realRandom;
  }
});

/* ------------------------------------------------------------------ */
/* computeLayout keeper — 실제 엔진 view                                  */
/* ------------------------------------------------------------------ */
function engineViews() {
  const out = [];
  const play = (ms) => {
    for (let g = 0; g < 3000; g++) {
      out.push({ view: match.getMatchView(ms, data), seed: ms.seed });
      if (match.isFinished(ms)) return;
      match.step(ms, data, null);
    }
  };
  const st = run.createRun({ data, seed: "k1-keeper", formation: "2-2-2" });
  st.teamwork = 40;
  const home = run.buildTeamSnapshot(st, data);
  for (const opp of data.opponents.slice(0, 3)) {
    const away = run.buildOpponentSnapshot(opp, data);
    for (const seed of [1, 2]) play(match.createMatch({ data, seed: `k1|${opp.id}|${seed}`, home, away, possessions: 8, kind: "friendly" }));
  }
  // 승부차기까지 가는 미러 매치 하나
  const mirror = clone(home);
  mirror.side = "away";
  mirror.name = "미러 클럽";
  mirror.players.forEach((p) => { p.id = `q_${p.id}`; });
  for (let seed = 1; seed <= 200; seed++) {
    if (match.simulateAuto(match.createMatch({ data, seed, home, away: mirror, possessions: 8, kind: "goal" }), data).stage !== "penalties") continue;
    play(match.createMatch({ data, seed, home, away: mirror, possessions: 8, kind: "goal" }));
    break;
  }
  return out;
}
const data = loadData();
const VIEWS = engineViews();

test("computeLayout keeper (2.5D): 공을 갖지 않은 GK = 자기 골문 안 골라인 바로 앞 (④ 듀얼 수비 · 배급 · 승부차기 · 끝난 경기), 흔들어도 골문 안 — 나머지는 그대로", () => {
  const count = { play: 0, duelGk: 0, dist: 0, pen: 0, fin: 0, carrierGk: 0, jit: 0 };
  for (const [i, { view, seed }] of VIEWS.entries()) {
    const where = `view #${i} (${view.phase}${view.finished ? " · 끝" : ""})`;
    const A = computeLayout(view, GEO25);
    const K = computeLayout(view, KEY25);
    assert.deepEqual(computeLayout(view, { ...GEO25, keeper: false }), A, `${where}: keeper false = 예전 그대로`);
    assert.deepEqual(K.ball, A.ball, `${where}: 공 그대로`);
    assert.equal(K.carrierId, A.carrierId);
    assert.equal(K.defenderId, A.defenderId);
    const byA = new Map(A.tokens.map((t) => [`${t.side}:${t.id}`, t]));
    const box = K.mode === "play" && K.attackStep >= 3;
    for (const t of K.tokens) {
      const a = byA.get(`${t.side}:${t.id}`);
      assert.equal(t.role, a.role, `${where}: ${t.id} 역할 그대로`);
      // 골문 자리 GK = 공을 갖지 않은 GK (승부차기는 막는 GK 만 — 차는 팀 GK 는 박스 밖 반원 그대로)
      const keeper = K.mode === "penalties" ? t.id === K.defenderId && t.side !== K.attackingSide : t.position === "GK" && t.role !== "carrier";
      if (!keeper) {
        // 공을 가진 GK (배급 · 세이브로 끝난 경기) · 필드 선수는 그대로 (④ 받는 선수 후보는 박스 깊이를 GK 자리로 다시 고를 수 있다)
        if (!(box && t.role === "receiver")) assert.deepEqual([t.x, t.y], [a.x, a.y], `${where}: ${t.side}:${t.id} 그대로`);
        if (t.position === "GK") count.carrierGk++;
        continue;
      }
      // 자기 골문 안 (가로 50 ± half · 골문 기둥 안), 골라인에서 KEEPER.depth
      const line = t.side === "home" ? 0 : 100;
      // 가로: 골문 안 (규칙 자리 = 50 ± half — 골로 끝난 경기의 실점 GK 만 반대쪽 끝 KEEPER.mouth[0] 으로 다이브한 모습)
      assert.ok(inRange(t.x, KEEPER.mouth), `${where}: ${t.side} GK x ${t.x} 골문 안`);
      if (!view.finished) assert.ok(inRange(t.x, [50 - KEEPER.half, 50 + KEEPER.half]), `${where}: ${t.side} GK x ${t.x}`);
      assert.ok(Math.abs(Math.abs(t.y - line) - KEEPER.depth) < EPS, `${where}: ${t.side} GK 골라인 앞 ${t.y}`);
      if (K.mode === "penalties") { assert.equal(t.x, 50, `${where}: 승부차기 GK 가운데`); count.pen++; }
      else if (view.finished) count.fin++;
      else if (K.dist) count.dist++;
      else count.play++;
      if (t.role === "defender") {
        count.duelGk++;
        assert.equal(t.id, K.defenderId);
        // 공과 자기 골 사이 (공 앞) — 듀얼 수비 그대로
        assert.ok(Math.abs(t.y - line) < Math.abs(K.ball.y - line), `${where}: ④ GK 는 공과 골 사이`);
      }
    }
    // 흔들어도 (J2 — 2.5D 기본): 골문 안 KEEPER.mouth · 골라인 앞 depthBand · GK 크기 비낌
    const J = computeLayout(view, { ...KEY25, jitter: { seed } });
    const byK = new Map(K.tokens.map((t) => [`${t.side}:${t.id}`, t]));
    for (const t of J.tokens) {
      if (K.mode === "penalties" ? t.id !== K.defenderId || t.side === K.attackingSide : t.position !== "GK" || t.role === "carrier") continue;
      const r = byK.get(`${t.side}:${t.id}`);
      const line = t.side === "home" ? 0 : 100;
      assert.ok(inRange(t.x, KEEPER.mouth), `${where}: 흔든 GK x ${t.x} 골문 안`);
      assert.ok(inRange(Math.abs(t.y - line), KEEPER.depthBand), `${where}: 흔든 GK 골라인 앞 ${t.y}`);
      if (K.mode !== "penalties") {
        assert.ok(Math.abs(t.x - r.x) <= JITTER.gkAx + EPS && Math.abs(t.y - r.y) <= JITTER.gkAy + EPS, `${where}: GK 크기 비낌`);
        if (t.x !== r.x || t.y !== r.y) count.jit++;
      }
    }
  }
  for (const [k, n] of Object.entries(count)) assert.ok(n > 0, `${k} 장면이 있어야 한다 (${JSON.stringify(count)})`);
});

test("view25 goalShapes 층 (K1): 뒤 = 뒤 · 먼 옆 그물 · 먼 기둥, 앞 = 지붕 · 가까운 옆 그물 · 가까운 기둥 + 크로스바 — 골문 안 GK 는 앞 층 뒤", () => {
  const W = 1244;
  const H = 528;
  for (const end of ["home", "away"]) {
    const g = V.goalShapes(end, W, H);
    const { back, front, frontSy } = g.layers;
    assert.deepEqual(back.nets, [g.nets[0], g.nets[1]], `${end}: 뒤 그물 · 먼 옆`);
    assert.deepEqual(front.nets, [g.nets[2], g.nets[3]], `${end}: 지붕 · 가까운 옆`);
    assert.deepEqual(back.frame, [g.frame[2], g.frame[3]], `${end}: 먼 기둥`);
    assert.deepEqual(front.frame, [g.frame[0], g.frame[1], g.frame[2]], `${end}: 가까운 기둥 + 크로스바`);
    assert.equal(back.grid.length + front.grid.length, g.grid.length, `${end}: 그물 줄 = 두 층`);
    assert.equal(frontSy, g.frame[0][1], `${end}: 앞 층 깊이 = 가까운 기둥 아래`);
    // 골문 안 GK (흔든 자리 끝까지) 의 발 = 앞 층보다 먼 쪽 (화면 y 작다), 가까운 기둥 바깥 (x > 62) 선수는 앞
    const line = end === "home" ? 0 : 100;
    for (const x of [KEEPER.mouth[0], 50, KEEPER.mouth[1]]) {
      for (const d of KEEPER.depthBand) assert.ok(V.project(x, Math.abs(line - d), W, H).sy < frontSy - 5, `${end}: GK (${x}) 는 앞 층 뒤`);
    }
    assert.ok(V.project(64, Math.abs(line - 2), W, H).sy > frontSy, `${end}: 가까운 기둥보다 가까운 선수는 앞`);
  }
});

/* ------------------------------------------------------------------ */
/* jsdom — 경기 화면 슛 연출                                               */
/* ------------------------------------------------------------------ */
let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 10) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}
/** inline transform "translate(Xpx, Ypx) …" → [X, Y] */
const pos = (el) => {
  const m = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el?.style.transform || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const lift = (el) => {
  const m = /translateY\(\s*([-\d.]+)px\)/.exec(el?.style.transform || "");
  return m ? -Number(m[1]) : 0;
};

test("jsdom: 2.5D 슛 연출 — 골 = GK 반대쪽 그물 안 (높이 · 앞 층 뒤) · GK 는 못 미친다, 세이브 = GK 가 옆으로 날아 손에 공, 미리보기 = 같은 자리, 평면 골도 GK 반대쪽", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, "navigator", { value: window.navigator, configurable: true, writable: true }); } catch { /* node 21+ 읽기 전용이면 무시 */ }
  g.confirm = () => true;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const realFetch = g.fetch;
  g.fetch = dataFetch(ROOT);
  t.after(() => {
    ST.setD25ForTest(null);
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  const S = window.__soccer;
  const ui = S.store.matchUi;
  const SC = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const { createRng } = await import(pathToFileURL(path.join(ROOT, "js/engine/rng.js")).href);
  const sdata = SC.loadData();
  // 우리 ④ 슛 결정 (GK 와 1:1) — 같은 상태에 골 · 세이브가 나오는 rng 를 넣는다 (컷인 없음)
  const prep = SC.buildScenarioState(sdata, {
    name: "k1_shot", matchKind: "friendly",
    require: (s, { data: d }) => SC.atk(s, "home", 3) && SC.needs(s, "attack") && SC.actionEnabled(s, d, "shoot") && s.possession >= 2,
  }, { runSeed: 1 });
  const rngFor = (want) => {
    for (let i = 0; i < 400; i++) {
      const c = clone(prep.matchState);
      c.rngState = createRng(`k1test${i}`).getState();
      const { events } = SC.tryDecision(c, sdata, { action: "shoot" });
      if (events.some((e) => e.type === "cutin" || e.type === "combo")) continue;
      const main = events.find((e) => e.type === "goal" || e.type === "save");
      if (main && main.type === want && !main.reverseCutin) return createRng(`k1test${i}`).getState();
    }
    throw new Error(`rng for ${want}`);
  };
  const inject = (rngState) => {
    ui.auto = false;
    ui.speed = 4;
    ui.intervene = false;
    S.store.run = clone(prep.runState);
    S.store.match = { ...clone(prep.matchState), rngState };
    S.store.screen = "run";
    S.render();
    return doc.querySelector(".match-screen");
  };
  const W = 1244;
  const H = 528;
  /** 슛 직전 화면에서 상대 GK (토큰 · 필드 자리) · 슛 열쇠 (screens/match.js shotKey — 경기 seed · 포제션 · 마지막 비트 seq) */
  const before = (scr) => {
    const view = S.match.getMatchView(S.store.match, S.store.data, "home");
    const gkP = S.store.match.away.players.find((p) => p.position === "GK");
    const el = scr.querySelector(`.tok[data-side="away"][data-id="${gkP.id}"]`);
    return { view, el, x: Number(el.dataset.x), y: Number(el.dataset.y), key: `K1|${S.store.match.seed}|${view.possession}|${view.lastBeat?.seq ?? ""}` };
  };
  const shoot = async (scr) => {
    const b = await until(() => { const x = scr.querySelector('button[data-action="shoot"]'); return x && !x.disabled ? x : null; }, 4000);
    assert.ok(b, "슛 카드");
    b.click();
    await until(() => ui.busy, 2000);
  };

  // ---- 2.5D 골 ----
  ST.setD25ForTest(true);
  {
    const scr = inject(rngFor("goal"));
    await until(() => scr.querySelector('button[data-action="shoot"]:not([disabled])'), 4000);
    const K = before(scr);
    assert.ok(Math.abs(K.y - 98) < 0.6 && K.x >= KEEPER.mouth[0] && K.x <= KEEPER.mouth[1], `GK 는 골문 안 골라인 앞 (${K.x}, ${K.y})`);
    // 앞 층 (가까운 기둥 · 크로스바 · 지붕 · 가까운 옆 그물) = 토큰 층 안, z = 100 + 가까운 기둥 깊이의 화면 y
    const front = scr.querySelector(".tok-layer > svg.w-goals-front");
    assert.ok(front && front.querySelectorAll(".goal-front polyline.frame").length === 2, "골대 앞 층 둘");
    const frontZ = 100 + Math.round(Math.round(V.goalShapes("away", W, H).layers.frontSy * 10) / 10);
    assert.equal(Number(front.style.zIndex), frontZ, "앞 층 z = 가까운 기둥 깊이");
    assert.ok(Number(K.el.style.zIndex) < frontZ, "골문 안 GK 는 앞 층 뒤");
    const aim = shotTarget({ gkX: K.x, gkY: K.y, goalSide: "away", kind: "goal", key: K.key });
    // 슛 미리보기 화살표 = 같은 쪽 (골라인 위 그 자리)
    const sb = scr.querySelector('button[data-action="shoot"]');
    sb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    const ar = scr.querySelector(".g-arrow line.ar-shoot");
    assert.ok(ar, "슛 화살표");
    const tip = V.project(aim.x, 99, W, H);
    assert.ok(Math.abs(Number(ar.getAttribute("x2")) - tip.sx) < 0.11 && Math.abs(Number(ar.getAttribute("y2")) - tip.sy) < 0.11, "화살표 끝 = 골 자리 (골라인)");
    sb.dispatchEvent(new window.Event("pointerleave"));
    await shoot(scr);
    const ball = scr.querySelector(".m-ball");
    await until(() => scr.querySelector(".g-trail path.trail.shot"), 2000);
    // 공: 땅 점 = 골라인 너머 그물 안 · 가로 = 골 자리 (GK 반대쪽), 공 글자는 떠 있다
    const bp = pos(ball);
    const f = V.unproject(bp[0], bp[1], W, H);
    assert.ok(Math.abs(f.x - aim.x) < 0.05, `공 x ${f.x} = 골 자리 ${aim.x}`);
    assert.ok(f.y > 100 && f.y < 100 + (V.V25.GOAL_DEPTH / V.V25.FL) * 100, `공은 그물 안 (y ${f.y})`);
    assert.ok(Math.abs(f.x - K.x) >= 7.5, "GK 에서 먼 쪽");
    assert.ok(lift(ball.querySelector("span")) > 3, "슛이 뜬다");
    assert.ok(scr.querySelector(".g-trail line.trail.ground"), "바닥 그림자 길");
    // GK: 공 쪽으로 조금 (못 미친다) + 뒤로 젖힌 다이브
    const gp = V.unproject(...pos(K.el), W, H);
    const dx = gp.x - K.x;
    assert.ok(Math.sign(dx) === Math.sign(aim.x - K.x) && Math.abs(dx) <= 3 + 0.05 && Math.abs(aim.x - gp.x) > 4, `GK 옆 걸음 ${dx} (못 미친다)`);
    await until(() => K.el.classList.contains("dive"), 1000);
    const ang = parseFloat(K.el.style.getPropertyValue("--dive-r"));
    assert.ok(K.el.classList.contains("face-l") ? ang > 0 : ang < 0, `골 = 뒤로 젖힘 (${ang})`);
    // 골라인을 넘으면 공은 앞 층 바로 뒤 (그물 안에 보인다)
    assert.ok(await until(() => ball.style.zIndex === String(frontZ - 1), 1500), "그물 안 공 = 앞 층 뒤");
    await until(() => !ui.busy, 8000);
    assert.equal(ball.querySelector("span").style.transform, "", "재배치 뒤 공 글자는 땅으로");
    assert.equal(ball.style.zIndex, "", "재배치 뒤 공 겹침 순서 그대로");
    S.actions.resetToStart();
  }
  // ---- 2.5D 세이브 ----
  {
    const scr = inject(rngFor("save"));
    await until(() => scr.querySelector('button[data-action="shoot"]:not([disabled])'), 4000);
    const K = before(scr);
    const aim = shotTarget({ gkX: K.x, gkY: K.y, goalSide: "away", kind: "save", key: K.key });
    await shoot(scr);
    const ball = scr.querySelector(".m-ball");
    await until(() => scr.querySelector(".g-trail path.trail.shot"), 2000);
    // GK = 세이브 자리까지 옆으로 (닿는 거리), 다이브 + 잡기, 앞으로 (공 쪽) 기울기
    const [gx, gy] = pos(K.el);
    const gp = V.unproject(gx, gy, W, H);
    assert.ok(Math.abs(gp.x - aim.x) < 0.06 && inRange(Math.abs(aim.x - K.x), SHOT.reach), `GK 옆으로 ${gp.x - K.x}`);
    await until(() => K.el.classList.contains("dive") && K.el.classList.contains("catching"), 1000);
    const ang = parseFloat(K.el.style.getPropertyValue("--dive-r"));
    const faceL = K.el.classList.contains("face-l");
    assert.ok(faceL ? ang < 0 : ang > 0, `세이브 = 앞으로 (${ang})`);
    // 공 = GK 손: 땅 점은 GK 와 같은 깊이 (화면 y), 앞쪽 (슛 온 쪽), 공 글자는 손 높이
    const [bx, by] = pos(ball);
    assert.ok(Math.abs(by - gy) < 0.6, `공 땅 점 = GK 깊이 (${by} vs ${gy})`);
    assert.ok(faceL ? bx < gx - 10 : bx > gx + 10, "공은 GK 앞쪽 (뻗은 손)");
    assert.ok(lift(ball.querySelector("span")) > 10, "공은 손 높이");
    assert.equal(ball.style.zIndex, "", "세이브 공은 GK 앞 (기본 겹침 — 선수 위)");
    await until(() => !ui.busy, 8000);
    S.actions.resetToStart();
  }
  // ---- 평면: GK 자리는 예전 그대로 (공 가진 선수 레인), 골은 GK 반대쪽 가장자리 (골라인 안쪽 0.5) ----
  ST.setD25ForTest(false);
  {
    const scr = inject(rngFor("goal"));
    await until(() => scr.querySelector('button[data-action="shoot"]:not([disabled])'), 4000);
    const K = before(scr);
    const carrier = scr.querySelector(".tok.role-carrier");
    assert.equal(K.x, Number(carrier.dataset.x), "평면 ④ GK = 공 가진 선수 레인 (예전 그대로)");
    const aim = shotTarget({ gkX: K.x, gkY: K.y, goalSide: "away", kind: "goal", key: K.key });
    await shoot(scr);
    const ball = scr.querySelector(".m-ball");
    await until(() => scr.querySelector(".g-trail line.trail"), 2000);
    const [bx, by] = pos(ball);
    assert.ok(Math.abs(bx - (99.5 / 100) * W) < 0.11 && Math.abs(by - (aim.x / 100) * H) < 0.11, `평면 골 = (${aim.x}, 99.5)`);
    assert.ok(Math.abs(aim.x - K.x) >= 7.5, "GK 반대쪽");
    await until(() => !ui.busy, 8000);
    S.actions.resetToStart();
  }
});
