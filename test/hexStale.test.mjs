// test/hexStale.test.mjs — 육각 경기 화면의 엔진 판 확인 (screens/hexMatch.js "엔진 판 확인", 2026-10-10 기획자 폰 "HM.ultimateList is not a function").
//   배포 직후 새 화면 모듈 + 캐시의 옛 엔진 모듈 (H2 — 필살기 API 없음 · HEX_MATCH_VERSION 1) 이 섞여도:
//   필살기 띠를 숨기고 (엔진을 부르지 않는다) 작은 안내 .hx-stale + [새로고침] (location.reload), 토스트 없음, 경기는 그대로 step 한다.
//   createMatch · step 도 없으면 경기 대신 안내 판 ([새로고침] · [처음으로]).
//   같은 오류를 매 턴 던지는 엔진이어도 토스트는 한 번 (화면의 safe 중복 막기).
//   hexFlow · hexUltUi 와 같은 손 펌프 rAF (16 ms) + 가짜 view. jsdom 이 없으면 jsdom 부분만 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const ST = await imp("js/ui/store.js");
const PX = await imp("js/ui/hexPixi.js");
const SCR = await imp("js/ui/screens/hexMatch.js");
const HM = await imp("js/engine/hexMatch.js");
const LR = await imp("js/engine/lessonRun.js");
const PR = await imp("js/ui/practice.js");

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}
const skip = !JSDOM && "jsdom 미설치";
const data = loadData();
const TICK = 400;

/** 옛 엔진 흉내 (H2 — 1f46fa1 전): 필살기 API 없음 · 판 1. step 은 입력을 받지 않는다 */
function oldEngine() {
  const o = { ...HM, HEX_MATCH_VERSION: 1 };
  delete o.ultimateList;
  delete o.ultimateStatus;
  delete o.setAutoBoth;
  return o;
}

test("hexEngineCompat: 지금 엔진 = 모두 맞음 · 옛 엔진 (필살기 API 없음 · 판 1) = 경기만 · step 없음 = 아무것도", () => {
  assert.equal(SCR.HEX_ENGINE_EXPECT, HM.HEX_MATCH_VERSION, "화면이 기대하는 판 = 지금 엔진 판");
  assert.deepEqual(SCR.hexEngineCompat(HM), { step: true, ult: true, missing: [] });
  const old = SCR.hexEngineCompat(oldEngine());
  assert.equal(old.step, true);
  assert.equal(old.ult, false);
  assert.deepEqual(old.missing, ["ultimateList", "ultimateStatus", "HEX_MATCH_VERSION 1 < 2"]);
  // 판만 낮다 · API 만 없다 → 필살기 끔
  assert.equal(SCR.hexEngineCompat({ ...HM, HEX_MATCH_VERSION: 1 }).ult, false);
  const noList = { ...HM };
  delete noList.ultimateList;
  assert.equal(SCR.hexEngineCompat(noList).ult, false);
  // 판이 더 높으면 (화면이 옛것) 받아 준다 — 새 엔진은 옛 API 를 지킨다
  assert.equal(SCR.hexEngineCompat({ ...HM, HEX_MATCH_VERSION: 3 }).ult, true);
  const noStep = { ...HM };
  delete noStep.step;
  assert.deepEqual(SCR.hexEngineCompat(noStep), { step: false, ult: false, missing: ["step"] });
  assert.equal(SCR.hexEngineCompat(null).step, false);
  assert.equal(SCR.STALE_MSG, "새 버전으로 바뀌는 중이에요 — 잠시 뒤 새로고침해 주세요");
});

/* ---- jsdom ---- */
let env = null;
function setup() {
  if (env) return env;
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/hex/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  for (const n of ["window", "document", "Node", "HTMLElement", "HTMLCanvasElement", "Element", "localStorage", "CustomEvent", "Event"]) g[n] = window[n];
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const reloads = { n: 0 };
  Object.defineProperty(g, "location", { value: { pathname: "/soccer/hex/", search: "", reload: () => { reloads.n++; } }, configurable: true, writable: true });
  const raf = { now: 1000, q: new Map(), id: 0 };
  window.requestAnimationFrame = (cb) => { raf.q.set(++raf.id, cb); return raf.id; };
  window.cancelAnimationFrame = (id) => { raf.q.delete(id); };
  PX.setHexViewFactoryForTest(() => ({ renderer: "webgl", dirty: true, draw() {}, destroy() {}, isLost() { return false; } }));
  const errors = [];
  const warns = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  console.warn = (...a) => { warns.push(a.map(String).join(" ")); };
  const toasts = [];
  const ctx = {
    store: ST.store, data, hexMatch: HM, run: { getMatchSetup: () => ctx.setup }, setup: null,
    actions: { finishMatch: () => {}, resetToStart: () => { ctx.resets = (ctx.resets || 0) + 1; } },
    // app.js safe 와 같다: 잡아서 토스트 (여기서는 기록)
    safe: (fn) => { try { return fn(); } catch (e) { console.error(e); toasts.push(String(e?.message ?? e)); return undefined; } },
  };
  env = { window, doc: window.document, raf, errors, warns, toasts, reloads, ctx, root: window.document.getElementById("app") };
  return env;
}
async function pump(ms, dt = 16) {
  const { raf } = env;
  for (let i = 0, n = Math.ceil(ms / dt); i < n; i++) {
    raf.now += dt;
    const cbs = [...raf.q.values()];
    raf.q.clear();
    for (const cb of cbs) cb(raf.now);
    await null;
    await null;
  }
}
function mount(engine, seed) {
  env.root.replaceChildren();
  env.errors.length = 0;
  env.warns.length = 0;
  env.toasts.length = 0;
  const su = PR.practiceSetup(LR, data, seed);
  env.ctx.setup = su;
  env.ctx.hexMatch = engine;
  env.ctx.matchMode = { label: "연습 경기", getSetup: () => su, stateKey: "practiceMatch", save: null, onFinish: () => {} };
  ST.store.practiceMatch = null;
  ST.store.matchUi.speed = 1;
  SCR.renderHexMatch(env.root, env.ctx);
  return env.root.querySelector(".hex-screen");
}

test("옛 엔진 (필살기 API 없음): 띠를 숨기고 안내 + [새로고침] · 토스트 없음 · 경기는 그대로 돈다", { skip }, async () => {
  setup();
  const calls = { step: 0 };
  const old = oldEngine();
  old.step = (s, d, input) => { calls.step++; return HM.step(s, d, input); };
  const scr = mount(old, "stale-1");
  assert.ok(scr, "육각 화면");
  const bar = scr.querySelector(":scope > .hx-ult");
  assert.ok(bar && bar.hidden, "필살기 띠 숨김");
  assert.equal(bar.children.length, 0, "버튼 없음");
  const note = scr.querySelector(":scope > .hx-stale");
  assert.ok(note && !note.hidden, "안내");
  assert.equal(note.querySelector(".hx-stale-txt").textContent, "새 버전으로 바뀌는 중이에요 — 잠시 뒤 새로고침해 주세요");
  assert.equal(note.getAttribute("role"), "status");
  assert.equal(scr.lastElementChild.className.split(" ")[0], "m-cutin", "컷인 층은 그대로 맨 위");
  await pump(900 + TICK * 12);
  const st = ST.store.practiceMatch;
  assert.ok(calls.step >= 10, `경기가 step 한다 (${calls.step})`);
  assert.equal(st.turn, calls.step, "턴 = step 수");
  assert.equal(SCR.hexViewDebug().steps, calls.step);
  assert.equal(scr.querySelector(".hx-clock").textContent !== "", true);
  assert.deepEqual(env.toasts, [], "토스트 없음 (ultimateList 를 부르지 않는다)");
  assert.deepEqual(env.errors, [], "console.error 없음");
  assert.equal(env.warns.filter((w) => w.includes("육각 엔진 판")).length, 1, "console.warn 한 번");
  // [새로고침] = location.reload
  note.querySelector("button.hx-stale-btn").click();
  assert.equal(env.reloads.n, 1);
  // ⏭ 도 그대로 (simulateAuto · 결과)
  scr.querySelector(".skip-btn").click();
  assert.ok(st.finished, "⏭ = 끝까지");
  assert.ok(env.doc.querySelector("#modal-root .score-big"), "결과");
  assert.deepEqual(env.toasts, []);
  env.doc.getElementById("modal-root").replaceChildren();
});

test("지금 엔진: 안내 없음 · 띠 7칸 (평소 그대로)", { skip }, async () => {
  setup();
  const scr = mount(HM, "stale-ok");
  assert.equal(scr.querySelector(".hx-stale"), null, "안내 없음");
  const bar = scr.querySelector(":scope > .hx-ult");
  assert.ok(!bar.hidden);
  assert.equal(bar.querySelectorAll(".hx-ult-btn").length, 7);
  await pump(900 + TICK * 3);
  assert.ok(SCR.hexViewDebug().steps >= 2);
  assert.deepEqual(env.toasts, []);
  assert.equal(env.warns.filter((w) => w.includes("육각 엔진 판")).length, 0);
});

test("같은 오류를 매 턴 던지는 엔진: 토스트는 한 번 (화면 safe 중복 막기) · 경기는 그대로", { skip }, async () => {
  setup();
  let thrown = 0;
  const bad = { ...HM, ultimateList: () => { thrown++; throw new TypeError("boom from engine"); } };
  const scr = mount(bad, "stale-dedupe");
  await pump(900 + TICK * 10);
  assert.ok(thrown >= 10, `여러 번 불렀다 (${thrown})`);
  assert.deepEqual(env.toasts, ["boom from engine"], "토스트 한 번");
  assert.equal(env.errors.length, thrown, "나머지는 console.error 만");
  assert.ok(SCR.hexViewDebug().steps >= 8, "경기는 돈다");
  assert.equal(scr.querySelector(".hx-stale"), null, "API 는 있으니 안내는 없음");
  // 다른 오류 글은 따로 한 번
  const bad2 = { ...HM, ultimateList: () => { throw new Error(`n${thrown++ % 2}`); } };
  mount(bad2, "stale-dedupe-2");
  await pump(900 + TICK * 6);
  assert.deepEqual(env.toasts.slice().sort(), ["n0", "n1"], "글마다 한 번");
});

test("step 도 없는 엔진: 경기 대신 안내 판 ([새로고침] · [처음으로])", { skip }, async () => {
  setup();
  const broken = { ...HM };
  delete broken.step;
  env.reloads.n = 0;
  const scr = mount(broken, "stale-nostep");
  assert.ok(scr, "화면");
  assert.equal(scr.querySelector(".hx-pitch"), null, "경기장 없음");
  assert.equal(scr.querySelector(".hx-stale-panel").textContent, SCR.STALE_MSG);
  const btns = [...scr.querySelectorAll("button")];
  assert.deepEqual(btns.map((b) => b.textContent), ["새로고침", "처음으로"]);
  btns[0].click();
  assert.equal(env.reloads.n, 1);
  env.ctx.resets = 0;
  btns[1].click();
  assert.equal(env.ctx.resets, 1);
  await pump(200);
  assert.deepEqual(env.toasts, []);
  assert.equal(ST.store.practiceMatch, null, "경기 상태를 만들지 않는다");
});

test("장면 모듈 판 확인: emotesOf 가 없는 옛 hexScene 은 맞지 않음 (말풍선 끄고 새로고침 안내)", async () => {
  const { hexSceneCompat } = await import("../js/ui/screens/hexMatch.js");
  const S = await import("../js/ui/hexScene.js");
  assert.equal(hexSceneCompat(S), true);
  assert.equal(hexSceneCompat({ frameAt() {}, clockText() {} }), false); // H2 판처럼 emotesOf 가 없다
  assert.equal(hexSceneCompat(null), false);
});
