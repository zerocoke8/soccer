// test/hexSw.test.mjs — 육각 시험판 서비스 워커 (루트 sw.js · js/ui/swRegister.js · app.js 부트, 2026-10-10 "HM.ultimateList is not a function").
//   sw.js: vm 에 가짜 self (registration.scope = /soccer/hex/) 로 읽고 fetch 이벤트를 흉내 낸다 — 같은 origin · 범위 안 · GET · 페이지 이동 아님 ·
//   스크립트 / 스타일 / JSON (destination 또는 .js · .mjs · .css · .json) 만 respondWith(fetch(request, { cache: 'no-cache' })), 실패하면 fetch(request).
//   페이지 이동 · 그림 · 스프라이트 시트 · 다른 origin · 범위 밖 · POST 는 손대지 않는다. install → skipWaiting, activate → clients.claim. Cache Storage 없음.
//   swRegister: HEX_SITE 이고 navigator.serviceWorker 가 있을 때만 register('./sw.js') (기다리지 않음 · 실패는 console.warn).
//   app.js 부트 (jsdom, 주소 /soccer/hex/ + 가짜 navigator.serviceWorker): 등록을 시도하고 (등록이 끝나지 않아도) 시작 화면을 그린다.
//   (navigator.serviceWorker 가 없는 jsdom 부트는 test/ui.smoke · hexPractice 가 그대로 지나간다.)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SW_SRC = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
const SCOPE = "https://zerocoke8.github.io/soccer/hex/";

/** sw.js 를 가짜 self 로 읽는다 → { on: 이벤트 이름 → 처리기, fetches: fetch 호출 기록, self } */
function loadSw({ fetchImpl } = {}) {
  const on = {};
  const fetches = [];
  const calls = { skipWaiting: 0, claim: 0, unregister: 0 };
  const self = {
    registration: { scope: SCOPE, unregister: () => { calls.unregister++; return Promise.resolve(true); } },
    clients: { claim: () => { calls.claim++; return Promise.resolve(); } },
    skipWaiting: () => { calls.skipWaiting++; return Promise.resolve(); },
    addEventListener: (type, fn) => { on[type] = fn; },
  };
  const fetch = (req, init) => {
    fetches.push({ req, init });
    return fetchImpl ? fetchImpl(req, init, fetches.length) : Promise.resolve({ ok: true, status: 200, from: init?.cache ?? "default" });
  };
  const ctx = vm.createContext({ self, fetch, URL, Promise, console });
  vm.runInContext(SW_SRC, ctx, { filename: "sw.js" });
  return { on, fetches, calls, self, ctx };
}
/** 가짜 fetch 이벤트 → { responded, response } */
function fire(sw, req) {
  let responded = null;
  sw.on.fetch({ request: { method: "GET", mode: "cors", destination: "", ...req }, respondWith: (p) => { responded = p; } });
  return responded;
}

test("sw.js: 문법 · 처리기 (install → skipWaiting, activate → clients.claim, fetch) · Cache Storage 를 쓰지 않는다 · LF", async () => {
  assert.doesNotThrow(() => new vm.Script(SW_SRC, { filename: "sw.js" }), "파싱");
  assert.ok(!SW_SRC.includes("\r"), "LF 줄 끝");
  assert.ok(!/\bcaches\b/.test(SW_SRC.replace(/^\s*\/\/.*$/gm, "")), "Cache Storage (caches) 를 쓰지 않는다");
  const sw = loadSw();
  assert.deepEqual(Object.keys(sw.on).sort(), ["activate", "fetch", "install"]);
  sw.on.install({ waitUntil: () => {} });
  assert.equal(sw.calls.skipWaiting, 1, "install → skipWaiting");
  let waited = null;
  sw.on.activate({ waitUntil: (p) => { waited = p; } });
  assert.equal(sw.calls.claim, 1, "activate → clients.claim");
  assert.ok(waited && typeof waited.then === "function", "activate 는 claim 을 기다린다");
  assert.equal(sw.calls.unregister, 0);
});

test("sw.js fetch: 같은 origin · /soccer/hex/ 안 · GET · 스크립트 / 스타일 / JSON 만 no-cache 로 다시 확인", async () => {
  const sw = loadSw();
  const yes = [
    { url: `${SCOPE}js/engine/hexMatch.js`, destination: "script" }, // import('../engine/hexMatch.js')
    { url: `${SCOPE}js/ui/screens/hexMatch.js`, destination: "script" },
    { url: `${SCOPE}js/ui/app.js`, destination: "script", mode: "cors" },
    { url: `${SCOPE}vendor/pixi.min.mjs`, destination: "script" },
    { url: `${SCOPE}css/match.css`, destination: "style", mode: "no-cors" },
    { url: `${SCOPE}data/config.json`, destination: "" }, // app.js loadData fetch (destination 빈칸 — 경로로)
    { url: `${SCOPE}data/sprites.json?x=1`, destination: "" },
    { url: `${SCOPE}js/ui/hexScene.js`, destination: "" }, // 경로만으로도
    { url: `${SCOPE}some/thing`, destination: "json" },
  ];
  for (const r of yes) {
    const n = sw.fetches.length;
    const p = fire(sw, r);
    assert.ok(p, `가로챈다: ${r.url}`);
    const res = await p;
    assert.equal(sw.fetches.length, n + 1, "fetch 한 번");
    assert.equal(sw.fetches.at(-1).init?.cache, "no-cache", "cache: 'no-cache' (ETag 확인 → 304)");
    assert.equal(sw.fetches.at(-1).req.url, r.url, "같은 요청");
    assert.equal(res.from, "no-cache");
  }
  const no = [
    { url: SCOPE, mode: "navigate", destination: "document" }, // 페이지 이동
    { url: `${SCOPE}index.html`, mode: "navigate", destination: "document" },
    { url: `${SCOPE}js/fake.js`, mode: "navigate", destination: "document" }, // 이동이면 .js 라도
    { url: `${SCOPE}img/portraits/x.webp`, destination: "image" },
    { url: `${SCOPE}art/sprites/neria_sheet.png`, destination: "image" }, // 스프라이트 시트
    { url: `${SCOPE}img/sheet.png`, destination: "" },
    { url: `${SCOPE}font.woff2`, destination: "font" },
    { url: `${SCOPE}js/ui/app.js`, method: "POST", destination: "" }, // POST
    { url: `${SCOPE}data/config.json`, method: "HEAD", destination: "" },
    { url: "https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs", destination: "script" }, // 다른 origin
    { url: "https://fonts.googleapis.com/css2?family=X", destination: "style" },
    { url: "https://zerocoke8.github.io/soccer/js/ui/app.js", destination: "script" }, // 범위 밖 (본편)
    { url: "https://zerocoke8.github.io/soccer/lesson/js/ui/app.js", destination: "script" }, // 범위 밖 (레슨판)
    { url: "https://zerocoke8.github.io/soccer/hexagon/a.js", destination: "script" }, // 앞머리만 같은 다른 폴더
    { url: "not a url", destination: "script" },
  ];
  for (const r of no) {
    const n = sw.fetches.length;
    assert.equal(fire(sw, r), null, `손대지 않는다: ${r.method ?? "GET"} ${r.mode ?? ""} ${r.url}`);
    assert.equal(sw.fetches.length, n, "fetch 도 안 부른다");
  }
});

test("sw.js fetch: no-cache 확인이 실패하면 (오프라인) 평소 fetch(request) 로 한 번 더", async () => {
  const sw = loadSw({ fetchImpl: (req, init, k) => (k === 1 ? Promise.reject(new TypeError("offline")) : Promise.resolve({ ok: true, from: init?.cache ?? "default" })) });
  const res = await fire(sw, { url: `${SCOPE}js/engine/hexMatch.js`, destination: "script" });
  assert.equal(sw.fetches.length, 2);
  assert.equal(sw.fetches[0].init?.cache, "no-cache");
  assert.equal(sw.fetches[1].init, undefined, "두 번째는 요청 그대로");
  assert.equal(res.from, "default");
});

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}

test("jsdom: /soccer/hex/ 부트 → sw.js 등록 시도 (가짜 serviceWorker — 끝나지 않아도 시작 화면은 그린다)", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/hex/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "location", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
  for (const n of names) saved[n] = Object.getOwnPropertyDescriptor(g, n);
  const set = (n, v) => Object.defineProperty(g, n, { value: v, configurable: true, writable: true });
  set("window", window);
  set("document", window.document);
  set("Node", window.Node);
  set("HTMLElement", window.HTMLElement);
  set("Element", window.Element);
  set("localStorage", window.localStorage);
  set("location", window.location); // store.HEX_SITE 가 이 주소를 읽는다
  const regs = [];
  const nav = Object.create(window.navigator);
  Object.defineProperty(nav, "serviceWorker", { value: { register: (u, o) => { regs.push([u, o]); return new Promise(() => {}); } }, configurable: true });
  set("navigator", nav);
  set("confirm", () => true);
  set("CustomEvent", window.CustomEvent);
  set("Event", window.Event);
  set("getComputedStyle", window.getComputedStyle.bind(window));
  const realFetch = g.fetch;
  g.fetch = dataFetch(ROOT);
  const realError = console.error;
  const errors = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  t.after(() => {
    console.error = realError;
    for (const n of names) {
      try { if (saved[n]) Object.defineProperty(g, n, saved[n]); else delete g[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
  assert.equal(ST.HEX_SITE, true, "주소 /soccer/hex/ = 육각 시험판");
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  assert.deepEqual(regs, [["./sw.js", undefined]], "부트가 바로 (데이터를 기다리기 전에) 등록을 건다 — 한 번");
  const doc = window.document;
  const start = await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  assert.ok(start, "등록이 끝나지 않아도 시작 화면");
  assert.equal(doc.title, "경계전 클럽 — 육각 오토배틀 시험판");
  assert.equal(regs.length, 1);
  assert.deepEqual(errors, []);
  assert.equal(doc.querySelectorAll("#toast-root .toast").length, 0, "토스트 없음");
});

test("swRegister: HEX_SITE + navigator.serviceWorker 일 때만 register('./sw.js') — 기다리지 않음 · 실패는 console.warn 만", async () => {
  const R = await import(pathToFileURL(path.join(ROOT, "js/ui/swRegister.js")).href);
  assert.equal(R.SW_URL, "./sw.js");
  const mk = (impl) => {
    const calls = [];
    return { calls, nav: { serviceWorker: { register: (u, o) => { calls.push([u, o]); return impl ? impl() : new Promise(() => {}); } } } };
  };
  // 육각 시험판 + serviceWorker → 시도
  const a = mk();
  assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: a.nav }), true);
  assert.deepEqual(a.calls, [["./sw.js", undefined]], "범위 = sw.js 폴더 (/soccer/hex/)");
  // 다른 사이트 (본편 · 레슨 · 스프라이트) → 안 함
  const b = mk();
  assert.equal(R.registerHexServiceWorker({ hexSite: false, nav: b.nav }), false);
  assert.equal(b.calls.length, 0);
  // serviceWorker 없음 (jsdom · 오래된 브라우저 · 비보안 주소) → 안 함, 오류 없음
  assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: {} }), false);
  assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: undefined }), false);
  assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: { serviceWorker: undefined } }), false);
  // 실패 (거절 · 바로 던짐) → console.warn 만
  const warns = [];
  const realWarn = console.warn;
  console.warn = (...x) => warns.push(x.map(String).join(" "));
  try {
    const c = mk(() => Promise.reject(new Error("SecurityError")));
    assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: c.nav }), true);
    await new Promise((r) => setTimeout(r, 0));
    const d = { serviceWorker: { register: () => { throw new Error("sync boom"); } } };
    assert.equal(R.registerHexServiceWorker({ hexSite: true, nav: d }), false);
  } finally {
    console.warn = realWarn;
  }
  assert.equal(warns.length, 2, warns.join(" | "));
  assert.ok(warns[0].includes("SecurityError") && warns[1].includes("sync boom"));
  // 기본값 = store.HEX_SITE (이 파일은 위 jsdom 부트가 먼저 /soccer/hex/ 로 store.js 를 읽었다 — 없으면 false)
  const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
  const e = mk();
  assert.equal(R.registerHexServiceWorker({ nav: e.nav }), ST.HEX_SITE);
  assert.equal(e.calls.length, ST.HEX_SITE ? 1 : 0);
});
