// test/hexFlow.test.mjs — 육각 경기 화면의 시간 흐름 (screens/hexMatch.js · hexPixi.js — H1 SPEC §4 · §5, jsdom).
//   requestAnimationFrame 을 손으로 돌리는 펌프 (프레임마다 16 ms) + 가짜 view (hexPixi.setHexViewFactoryForTest) 로
//   앱 흐름 없이 renderHexMatch 를 바로 띄운다 (ctx.run.getMatchSetup = 시험이 고른 셋업 — 골든골 · 승부차기가 나는 'goal' 경기).
//   골 연출 ("골!" + 득점자 · 시계 멈춤 · 골 장면 뒤 킥오프 자리) · 동점골 → 골든골 (골 배너 먼저, 단계 배너는 골 장면 뒤) ·
//   골든골 결승골 (공이 골망에 남는다) · 추가시간 · 승부차기 (한 킥 ~0.9 초 · PK 점수) · 꾸밈 클래스는 모두 hx- ·
//   배속을 바꿔도 보간 진행도가 이어진다 · WebGL 문맥 잃음 (다시 만들기 · 버티면 횟수 0 · 연달아 4번째 → 대체 화면 · 만드는 도중 잃은 view 는 버림) ·
//   화면을 떠나면 view · 리스너 · rAF 정리 · hexPixi 가 만드는 도중 실패하면 앱 · 텍스처 · 캔버스를 지우고 null.
// jsdom 이 없으면 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData, run } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const ST = await imp("js/ui/store.js");
const PX = await imp("js/ui/hexPixi.js");
const SCR = await imp("js/ui/screens/hexMatch.js");
const HS = await imp("js/ui/hexScene.js");
const V25 = await imp("js/ui/view25.js");
const HM = await imp("js/engine/hexMatch.js");

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const data = loadData();
const HOME = run.buildTeamSnapshot(run.createRun({ data, seed: "flow-home" }), data);
const AWAY = run.buildOpponentSnapshot(data.opponents[0], data);
const { RU, FL } = V25.V25;
const W = 1244;
const H = 528;

/* ---- jsdom 한 번 (파일 전체) ---- */
let env = null;
function setup(t) {
  if (env) return env;
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "HTMLCanvasElement", "Element", "localStorage", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.HTMLCanvasElement = window.HTMLCanvasElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);

  // 손 펌프 rAF
  const raf = { now: 1000, q: new Map(), id: 0 };
  window.requestAnimationFrame = (cb) => { raf.q.set(++raf.id, cb); return raf.id; };
  window.cancelAnimationFrame = (id) => { raf.q.delete(id); };

  // visibilitychange 리스너 수
  const vis = { n: 0 };
  const doc = window.document;
  const add = doc.addEventListener.bind(doc);
  const rem = doc.removeEventListener.bind(doc);
  const seen = new Set();
  doc.addEventListener = (type, fn, o) => { if (type === "visibilitychange" && !seen.has(fn)) { seen.add(fn); vis.n++; } return add(type, fn, o); };
  doc.removeEventListener = (type, fn, o) => { if (type === "visibilitychange" && seen.has(fn)) { seen.delete(fn); vis.n--; } return rem(type, fn, o); };

  // 가짜 view
  const views = { calls: 0, list: [], opts: null, next: null, last: null, frames: 0 };
  const stubView = () => {
    const v = {
      renderer: "webgl", destroyed: 0, lost: false,
      dirty: true, // 매 프레임 다시 그리게 (views.last = 그 프레임의 그림)
      draw(frame, cam) { views.last = frame; views.cam = cam; views.frames++; },
      destroy() { v.destroyed++; },
      isLost() { return v.lost; },
    };
    return v;
  };
  PX.setHexViewFactoryForTest((host, opts) => {
    views.calls++;
    views.opts = opts;
    if (views.next) {
      const f = views.next;
      views.next = null;
      return f(host, opts);
    }
    const v = stubView();
    views.list.push(v);
    return v;
  });

  const realError = console.error;
  const errors = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };

  const root = doc.getElementById("app");
  const modalRoot = doc.getElementById("modal-root");
  const ctx = {
    store: ST.store, data, hexMatch: HM, run: { getMatchSetup: () => ctx.setup }, setup: null,
    actions: { finishMatch: () => {}, resetToStart: () => {} },
  };
  env = { window, doc, raf, vis, views, stubView, errors, root, modalRoot, ctx };
  process.on("exit", () => { console.error = realError; });
  t.after(() => {}); // 파일 끝까지 같은 문서를 쓴다
  env.restore = () => {
    console.error = realError;
    PX.setHexViewFactoryForTest(null);
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    try { root.replaceChildren(); } catch { /* ignore */ }
    window.close();
  };
  return env;
}

/** dt 16 ms 프레임으로 ms 만큼 (프레임마다 마이크로태스크를 비운다 — view Promise) */
async function pump(ms, dt = 16) {
  const { raf } = env;
  const n = Math.ceil(ms / dt);
  for (let i = 0; i < n; i++) {
    raf.now += dt;
    const cbs = [...raf.q.values()];
    raf.q.clear();
    for (const cb of cbs) cb(raf.now);
    await null;
    await null;
  }
}

function leave() {
  env.root.replaceChildren();
  env.modalRoot.replaceChildren();
}

/** 셋업 (seed · kind) 의 경기를 steps 만큼 돌린 상태로 화면을 띄운다 */
function mount(seed, steps, { kind = "goal", speed = 1 } = {}) {
  leave();
  env.ctx.setup = { seed, home: HOME, away: AWAY, kind };
  const st = HM.createMatch({ data, seed, home: HOME, away: AWAY, possessions: undefined, kind });
  for (let i = 0; i < steps; i++) HM.step(st, data);
  ST.store.hexMatch = st;
  ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed, steps });
  ST.store.matchUi.speed = speed;
  env.views.last = null;
  SCR.renderHexMatch(env.root, env.ctx);
  const scr = env.root.querySelector(".hex-screen");
  assert.ok(scr, "육각 화면");
  assert.equal(ST.store.hexMatch, st, "띄운 상태를 이어받는다");
  return { st, scr };
}

const dbg = () => SCR.hexViewDebug();
function bannerOf(scr) {
  const b = scr.querySelector(".hx-banner");
  return {
    cls: [...b.classList], shown: b.classList.contains("hx-show"),
    text: b.querySelector(".hx-banner-txt").textContent, sub: b.querySelector(".hx-banner-sub").textContent,
  };
}
/** 화면 꾸밈 클래스는 모두 hx- (전역 .stage · .goal · .show 와 겹치지 않게 — base.css .stage 는 1280×720 상자) */
function assertScopedClasses(scr) {
  for (const sel of [".hx-banner", ".hx-clock", ".hx-name"]) {
    for (const c of scr.querySelector(sel).classList) assert.ok(c.startsWith("hx-"), `${sel} 클래스 '${c}' 는 hx- 앞머리`);
  }
}
const typesOfStep = (st) => HS.eventsOfTurn(st).map((e) => e.type);

/**
 * 시드 hf-0, hf-1, … 를 돌려 pred(이번 step 이벤트 종류, 상태) 가 처음 맞는 { seed, step } — 엔진 흐름을 조정해도
 * (경기 흐름 2026-10-10 처럼) 시드 · step 번호를 손으로 고치지 않게. mount(seed, step − 1) 다음 step 이 그 장면.
 */
function findScene(pred, { minStep = 1 } = {}) {
  for (let i = 0; i < 400; i++) {
    const seed = `hf-${i}`;
    const st = HM.createMatch({ data, seed, home: HOME, away: AWAY, kind: "goal" });
    for (let n = 1; !st.finished && n < 2000; n++) {
      const e0 = st.events.length;
      HM.step(st, data);
      if (n >= minStep && pred(st.events.slice(e0).map((e) => e.type), st)) return { seed, step: n };
    }
  }
  throw new Error("findScene: 장면 없음");
}

test("골 연출: \"골!\" + 득점자 · 시계 멈춤 · 골 장면 동안 공은 골망 · 장면 뒤 킥오프 자리 · 그다음 턴", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  const sc = findScene((ty) => ty.includes("goal") && ty.includes("kickoff") && !ty.includes("end"), { minStep: 20 });
  const { st, scr } = mount(sc.seed, sc.step - 1);
  await pump(950); // 시작 0.9 초 전체 화면 → 다음 step = shot, goal, kickoff
  assert.equal(dbg().steps, sc.step);
  assert.deepEqual(typesOfStep(st).filter((x) => ["goal", "kickoff"].includes(x)), ["goal", "kickoff"], `시드 ${sc.seed} step ${sc.step} = 골`);
  const gEv = HS.eventsOfTurn(st).find((e) => e.type === "goal");
  const b = bannerOf(scr);
  assert.equal(b.text, "골!");
  assert.ok(b.shown && b.cls.includes("hx-goal") && b.cls.includes(`hx-${gEv.side}`), `골 배너 클래스 ${b.cls}`);
  const scorer = st[gEv.side].players.find((p) => String(p.id) === String(gEv.playerId)).name;
  assert.ok(b.sub.includes(scorer) && b.sub.includes(HS.scoreText(st)), `득점자 · 점수 ${b.sub}`);
  assertScopedClasses(scr);
  const turn = st.turn;
  const clock = scr.querySelector(".hx-clock").textContent;
  await pump(1300); // 골 턴 0.4 초 + 장면 1.1 초 안
  assert.equal(st.turn, turn, "골 장면 동안 다음 턴으로 가지 않는다 (시계 멈춤)");
  assert.equal(scr.querySelector(".hx-clock").textContent, clock, "시계 글자 그대로");
  assert.equal(bannerOf(scr).text, "골!");
  const inNet = env.views.last.ball.u;
  assert.ok(gEv.side === "home" ? inNet > RU + FL : inNet < RU, `골 장면: 공은 골망 (${inNet})`);
  await pump(300); // 장면 (1.5 초) 뒤 = 킥오프 자리
  assert.equal(st.turn, turn);
  const ko = HS.frameAt(null, st, 1, { W, H });
  for (const p of env.views.last.players) {
    const q = ko.players.find((x) => x.key === p.key);
    assert.ok(Math.abs(p.sx - q.sx) < 1e-9 && Math.abs(p.sy - q.sy) < 1e-9, `킥오프 자리 ${p.key}`);
  }
  await pump(450); // 2.0 초 = 다음 step
  assert.equal(dbg().steps, sc.step + 1, "골 연출 뒤 다음 턴");
  leave();
  await pump(32);
});

test("동점골 → 골든골 (한 step): \"골!\" 먼저, 골든골 배너는 골 장면 뒤 · 시계 '골든골 0:30'", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  const sc = findScene((ty) => ty.includes("goal") && ty.includes("goldenGoal"));
  const { st, scr } = mount(sc.seed, sc.step - 1);
  await pump(950);
  assert.equal(dbg().steps, sc.step);
  const types = typesOfStep(st);
  assert.ok(types.includes("goal") && types.includes("goldenGoal"), `시드 ${sc.seed} step ${sc.step} = 동점골 + 골든골 (${types})`);
  let b = bannerOf(scr);
  assert.equal(b.text, "골!", "골 배너가 덮이지 않는다");
  assert.ok(!b.cls.includes("hx-stage"));
  assert.equal(scr.querySelector(".hx-clock").textContent, "골든골 0:30");
  assert.ok(scr.querySelector(".hx-clock").classList.contains("hx-golden"));
  assertScopedClasses(scr);
  await pump(1300);
  assert.equal(bannerOf(scr).text, "골!", "골 장면 동안은 골 배너");
  await pump(300);
  b = bannerOf(scr);
  assert.equal(b.text, "골든골", "골 장면 뒤 골든골 배너");
  assert.equal(b.sub, "먼저 넣는 쪽이 이긴다");
  assert.deepEqual(b.cls, ["hx-banner", "hx-show", "hx-stage"], "단계 배너 클래스 (전역 .stage 아님)");
  assert.ok(!scr.querySelector(".hx-banner").classList.contains("stage"));
  leave();
  await pump(32);
});

test("골든골 결승골: 킥오프 없음 → 골 장면 뒤에도 공은 골망, 그 뒤 결과", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  const sc = findScene((ty, s) => ty.includes("goal") && ty.includes("end") && s.stage === "goldenGoal");
  const { st, scr } = mount(sc.seed, sc.step - 1);
  await pump(950);
  assert.equal(dbg().steps, sc.step);
  assert.ok(st.finished && st.stage === "goldenGoal", "골든골로 끝");
  assert.deepEqual(typesOfStep(st).filter((x) => ["goal", "kickoff", "end"].includes(x)), ["goal", "end"], "킥오프 없음");
  const gEv = HS.eventsOfTurn(st).find((e) => e.type === "goal");
  const net = (u) => (gEv.side === "home" ? u > RU + FL : u < RU);
  assert.equal(bannerOf(scr).text, "골!");
  await pump(1000);
  assert.ok(net(env.views.last.ball.u), "골 장면: 골망");
  await pump(900); // 골 장면 (1.5 초) 지나서
  assert.ok(net(env.views.last.ball.u), `골 장면 뒤에도 골망 (${env.views.last.ball.u}) — 슛 칸으로 돌아가지 않는다`);
  assert.equal(env.modalRoot.querySelector(".score-big"), null, "결과는 아직");
  await pump(1200); // 끝 0.8 초 + 골 2.0 초 = 2.8 초
  assert.ok(env.modalRoot.querySelector(".score-big"), "결과 모달");
  assert.equal(env.modalRoot.querySelectorAll(".score-big").length, 1);
  leave();
  await pump(32);
});

test("추가시간 · 승부차기: 단계 배너 (hx-stage) · 시계 글자 · 승부차기 한 킥 ~0.9 초 · PK 점수", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  {
    const sc = findScene((ty) => ty.includes("addedTime"));
    const { st, scr } = mount(sc.seed, sc.step - 1);
    await pump(950);
    assert.ok(typesOfStep(st).includes("addedTime"), `시드 ${sc.seed} step ${sc.step} = 추가시간`);
    const b = bannerOf(scr);
    assert.equal(b.text, "추가시간");
    assert.deepEqual(b.cls, ["hx-banner", "hx-show", "hx-stage"]);
    assert.equal(scr.querySelector(".hx-clock").textContent, "추가시간");
    assert.ok(scr.querySelector(".mh").classList.contains("last-attack"));
    assertScopedClasses(scr);
  }
  {
    const sc = findScene((ty) => ty.includes("penalties"));
    const { st, scr } = mount(sc.seed, sc.step - 1);
    await pump(950);
    assert.ok(typesOfStep(st).includes("penalties"), `시드 ${sc.seed} step ${sc.step} = 승부차기`);
    assert.equal(bannerOf(scr).text, "승부차기");
    assert.ok(bannerOf(scr).cls.includes("hx-stage"));
    assert.equal(scr.querySelector(".hx-clock").textContent, "승부차기");
    const s0 = dbg().steps;
    await pump(930); // 한 킥 0.9 초
    assert.equal(dbg().steps, s0 + 1, "한 킥");
    const kick = HS.eventsOfTurn(st).find((e) => e.type === "penalty");
    assert.ok(kick, "penalty 이벤트");
    const b = bannerOf(scr);
    assert.equal(b.text, kick.success ? "성공" : "실패");
    assert.ok(b.cls.includes("hx-pk") && b.cls.includes(kick.success ? "hx-ok" : "hx-miss") && b.cls.includes(`hx-${kick.side}`), `PK 배너 ${b.cls}`);
    assert.ok(scr.querySelector(".mh-sub").textContent.includes(`승부차기 ${st.penalties.home} : ${st.penalties.away}`), "머리 줄 PK 점수");
    assertScopedClasses(scr);
    await pump(900 * 3);
    if (!st.finished) {
      const d = dbg().steps - s0 - 1;
      assert.ok(d >= 2 && d <= 3, `0.9 초마다 한 킥 (${d})`);
    }
  }
  leave();
  await pump(32);
});

test("배속을 바꿔도 보간이 이어진다 (4x → 1x → 2x → 4x, 같은 턴 안)", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  // 골 · 킥오프가 없는 턴 몇 개가 이어지는 곳
  const probe = HM.createMatch({ data, seed: "hf-0", home: HOME, away: AWAY, kind: "goal" });
  let k = 0;
  const quiet = [];
  while (quiet.length < 3 && k < 250) {
    HM.step(probe, data);
    k++;
    const ty = typesOfStep(probe);
    if (ty.includes("goal") || ty.includes("kickoff")) quiet.length = 0;
    else quiet.push(k);
  }
  const start = quiet[0] - 1;
  const { st, scr } = mount("hf-0", start, { speed: 4 });
  await pump(256); // 시작 0.9 / 4 초 (첫 프레임은 dt 0)
  assert.equal(dbg().steps, start + 1);
  await pump(48);
  const btn = scr.querySelector(".speed-btn");
  const seq = [];
  for (const expect of [1, 2, 4]) {
    const before = { turn: env.views.last.turn, alpha: env.views.last.alpha };
    btn.click();
    assert.equal(ST.store.matchUi.speed, expect);
    await pump(16);
    const after = { turn: env.views.last.turn, alpha: env.views.last.alpha };
    seq.push([before.alpha.toFixed(3), after.alpha.toFixed(3)]);
    assert.equal(after.turn, before.turn, "같은 턴");
    assert.ok(after.alpha >= before.alpha - 1e-9 && after.alpha - before.alpha < 0.2, `보간 진행도가 이어진다 ${before.alpha} → ${after.alpha} (${expect}x)`);
  }
  assert.equal(st.turn, env.views.last.turn);
  leave();
  await pump(32);
});

test("WebGL 문맥 잃음: 다시 만들기 · 버티면 횟수 0 · 연달아 4번째면 대체 화면 · 만드는 도중 잃은 view 는 버린다", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  const { views } = env;
  const c0 = views.calls;
  const { st, scr } = mount("hf-0", 0, { kind: "friendly" });
  await pump(100);
  assert.equal(views.calls, c0 + 1);
  assert.equal(dbg().renderer, "webgl");
  const note = scr.querySelector(".hx-note");
  const fb = scr.querySelector(".hx-fallback");
  // 오래 버틴 view 다음의 잃음은 처음부터 센다 → 다섯 번 잃어도 다시 그린다
  for (let i = 1; i <= 5; i++) {
    const v = views.list.at(-1);
    const turn = st.turn;
    views.opts.onContextLost();
    assert.equal(v.destroyed, 1, `잃은 view 정리 (${i})`);
    assert.equal(note.hidden, false, "다시 그리는 중…");
    await pump(16);
    assert.equal(dbg().renderer, "lost");
    assert.equal(JSON.parse(env.window.localStorage.getItem(ST.KEYS.hexMatch)).steps, st.turn, "저장");
    await pump(1100);
    assert.equal(views.calls, c0 + 1 + i, `다시 만듦 (${i})`);
    assert.equal(dbg().renderer, "webgl");
    assert.equal(note.hidden, true);
    assert.ok(st.turn >= turn, "엔진 상태 그대로 (처음으로 돌아가지 않는다)");
    await pump(5100);
  }
  // 연달아 (5 초 안에) 잃으면 4번째에 대체 화면
  const c1 = views.calls;
  for (let i = 1; i <= 4; i++) {
    views.opts.onContextLost();
    if (i < 4) {
      await pump(1100);
      assert.equal(dbg().renderer, "webgl", `연달아 ${i}번째는 다시 그린다`);
    }
  }
  await pump(32);
  assert.equal(dbg().renderer, "fallback", "연달아 4번째 → 대체 화면");
  assert.equal(fb.hidden, false);
  assert.equal(note.hidden, true);
  await pump(2500);
  assert.equal(views.calls, c1 + 3, "대체 화면이면 더 만들지 않는다");
  const s0 = dbg().steps;
  await pump(1000);
  assert.ok(dbg().steps > s0, "경기는 계속");

  // 만드는 도중 잃음 (app.init 뒤 그림 읽는 중): 다 만든 view 를 받지 않고 지운 뒤 1 초 뒤 다시
  {
    let resolveView = null;
    const pending = env.stubView();
    views.next = () => new Promise((r) => { resolveView = () => r(pending); });
    const { scr: s2 } = mount("hf-0", 10, { kind: "friendly" });
    await pump(50);
    assert.equal(dbg().renderer, "pending");
    views.opts.onContextLost();
    resolveView();
    await pump(32);
    assert.equal(pending.destroyed, 1, "죽은 문맥 view 는 버린다");
    assert.notEqual(dbg().renderer, "webgl");
    assert.equal(s2.querySelector(".hx-note").hidden, false);
    const c2 = views.calls;
    await pump(1100);
    assert.equal(views.calls, c2 + 1, "다시 만든다");
    assert.equal(dbg().renderer, "webgl");
    assert.equal(views.list.at(-1).destroyed, 0);
    // view.isLost() 가 참이면 (잃음 이벤트를 못 들었어도) 마찬가지
    views.opts.onContextLost();
    const dead = env.stubView();
    dead.lost = true;
    views.next = () => dead;
    await pump(1100);
    assert.equal(dead.destroyed, 1, "isLost view 는 버린다");
    assert.notEqual(dbg().renderer, "webgl");
    await pump(1100);
    assert.equal(dbg().renderer, "webgl", "그다음 view 로 다시 그린다");
  }
  leave();
  await pump(32);
});

test("화면을 떠나면: view 정리 · visibilitychange 리스너 · rAF 가 남지 않는다", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  leave();
  await pump(32);
  const n0 = env.vis.n;
  assert.equal(env.raf.q.size, 0, "떠난 화면의 rAF 없음");
  mount("hf-0", 3, { kind: "friendly" });
  await pump(100);
  assert.equal(env.vis.n, n0 + 1, "리스너 하나");
  const v = env.views.list.at(-1);
  leave();
  await pump(32);
  assert.equal(v.destroyed, 1, "view.destroy 1회");
  assert.equal(env.vis.n, n0, "visibilitychange 리스너를 뗐다");
  assert.equal(env.raf.q.size, 0, "rAF 루프가 멈췄다");
  assert.deepEqual(env.errors, [], "console.error 없음");
});

test("hexPixi: 만드는 도중 (app.init 뒤) 실패하면 앱 · 구운 텍스처 · 캔버스를 지우고 null (2D 캔버스 메모리 한도)", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  setup(t);
  const { window, doc } = env;
  const log = { appDestroyed: 0, textures: [], texDestroyed: 0, canvas: null };
  class Container {
    constructor() { this.children = []; this.position = { set() {} }; this.scale = { set() {} }; }
    addChild(...c) { this.children.push(...c); return c[0]; }
  }
  class Sprite extends Container { constructor(tex) { super(); this.texture = tex; } }
  class CanvasSource { constructor(o) { this.resource = o.resource; } }
  class Texture {
    constructor(o) { this.source = o.source; log.textures.push(this); }
    destroy() { log.texDestroyed++; }
  }
  class Application {
    async init() { this.canvas = doc.createElement("canvas"); log.canvas = this.canvas; this.stage = new Container(); }
    destroy() { log.appDestroyed++; }
  }
  const fake = {
    Application, Container, Sprite, Texture, CanvasSource, ImageSource: CanvasSource,
    Graphics: Container, PerspectiveMesh: Container, isWebGLSupported: () => true,
  };
  // 작은 캔버스 (하늘 4×128) 는 되고 큰 캔버스 (잔디 · 바깥 잔디) 는 2D 문맥 없음 = iOS 캔버스 메모리 한도
  const g2d = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const proto = window.HTMLCanvasElement.prototype;
  const realGet = proto.getContext;
  proto.getContext = function (type) { return type === "2d" && this.width * this.height < 1e6 ? g2d : null; };
  const hadGL = Object.prototype.hasOwnProperty.call(globalThis, "WebGLRenderingContext");
  globalThis.WebGLRenderingContext = function WebGLRenderingContext() {};
  const warn = console.warn;
  const warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  PX.setHexViewFactoryForTest(null);
  PX.setPixiModuleForTest(fake);
  try {
    const host = doc.createElement("div");
    doc.body.append(host);
    let lostCalls = 0;
    const v = await PX.createHexView(host, { W, H, width: 1268, height: 708, origin: { x: 12, y: 78 }, data, resolution: 1, onContextLost: () => { lostCalls++; } });
    assert.equal(v, null, "실패 → null (화면은 대체 화면)");
    assert.equal(log.appDestroyed, 1, "Pixi 앱 정리 (WebGL 문맥 · 이벤트 리스너 · ticker)");
    assert.ok(log.textures.length >= 1, "실패 전에 구운 텍스처가 있었다 (하늘)");
    assert.equal(log.texDestroyed, log.textures.length, "구운 텍스처도 모두 지움");
    assert.equal(host.querySelector("canvas"), null, "붙였던 캔버스를 뗐다");
    assert.equal(log.canvas.parentNode, null);
    log.canvas.dispatchEvent(new window.Event("webglcontextlost", { cancelable: true }));
    assert.equal(lostCalls, 0, "문맥 잃음 리스너도 뗐다");
    assert.ok(warns.some((w) => /2D 캔버스를 만들 수 없습니다/.test(w)), `분명한 오류 (${warns.join(" | ")})`);
    host.remove();
  } finally {
    console.warn = warn;
    proto.getContext = realGet;
    if (hadGL) { /* 원래 있던 값 — jsdom 에는 없다 */ } else delete globalThis.WebGLRenderingContext;
    PX.setPixiModuleForTest(null);
    env.restore();
  }
});
