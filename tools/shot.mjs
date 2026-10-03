#!/usr/bin/env node
// tools/shot.mjs — 화면 스크린샷 도구 (경기 01_… · 아웃게임 og_… — ARCHITECTURE §12.4). npm test 에는 넣지 않는다.
//
//   node tools/shot.mjs <outDir> [--only 03,og] [--width 1280 --height 720] [--dpr 1]
//                       [--run-seed 1] [--settle 600] [--no-freeze] [--list]
//
// 1) 내장 정적 서버(node:http, 포트 0)로 프로젝트 루트를 띄운다.
// 2) Node 에서 엔진(js/engine/lessonRun.js · manager.js · match.js)으로 시나리오 상황의 run/match 상태를 찾는다 (tools/scenarios.mjs · lesson_scenarios.mjs).
// 3) puppeteer-core + 로컬 Chrome/Edge 로 페이지를 열고 localStorage(KEYS.run / KEYS.match / KEYS.teams + 시나리오 storage — js/ui/store.js)에 주입 →
//    reload → 경기 · 저장된 런이면 시작 화면 "이어하기" 클릭 → (아웃게임) 조작 steps(클릭 · 드래그) → 뷰포트 캡처 (페이지는 스크롤하지 않는다).
// 4) 시나리오마다 파일 경로, 스테이지 배율, 페이지 · 안쪽 스크롤, 잘린 글자(카드 문구 등) · HUD · 레슨 경기장 겹침 · 원 판정(그린 원 ↔ 엔진 대상), 캡처 시점 상태 확인,
//    pageerror/console.error 를 출력. 마지막 요약 줄에 검사에 걸린 시나리오 이름.
//
// 화면은 고정 스테이지(논리 1280×720, js/ui/stage.js)라 기본 뷰포트 1280×720 DPR 1 (데스크톱, 터치 없음) = 스테이지 1배.
// --width/--height 로 다른 창 크기(1920×1080 · 1600×900 · 1024×576 · 세로 900×1200 …)에서 배율 · 레터박스를 확인한다.
// --land 는 예전 옵션 — 이제 항상 가로라 받기만 하고 무시한다.
// 자동 진행 끄기(수동 시나리오): URL 에 ?auto=0 을 붙이고, UI 가 그걸 지원하지 않으면(v0.1) "자동 ON" 버튼을 눌러 끈다.
// 타이머 고정(기본 ON): 페이지의 setTimeout/setInterval 중 지연 ≥ 100ms 인 것을 캡처 동안 보류한다 → 자동 진행이
// 캡처 전에 다음 듀얼로 넘어가지 않는다. 짧은 타이머·requestAnimationFrame·CSS 트랜지션은 그대로 돈다.
// 패스 클릭 시나리오(06)는 클릭 직전에 고정을 푼다 (비트 연출 타이머가 돌아야 하므로). --no-freeze 로 끌 수 있다.
//
// Chrome 경로: CHROME_PATH 환경변수 → 기본 설치 경로(Chrome, Edge) 순. 없으면 안내 후 exit 0.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { ROOT, loadData, SCENARIOS, buildScenarioState, describeState } from "./scenarios.mjs";
import { fitStage, STAGE_W, STAGE_H } from "../js/ui/stage.js";
import { KEYS } from "../js/ui/store.js";

const ACTION_LABELS = { dribble: "드리블", pass: "패스", cross: "크로스", shoot: "슛", tackle: "태클", intercept: "인터셉트", hold: "버티기", block: "버티기" };
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

/* ------------------------------------------------------------------ */
/* 인자                                                                  */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "usage: node tools/shot.mjs <outDir> [options]",
    "  --only a,b        시나리오 이름(정확히 같으면 그것만) 또는 접두어 (예: 03,05_penalties · og = 아웃게임 전부 · og_training = 그 하나)",
    "  --width N         뷰포트 폭 (기본 1280)   --height N  뷰포트 높이 (기본 720) — 스테이지(1280×720)가 한 배율로 맞춰진다",
    "  --dpr N           deviceScaleFactor (기본 1). 07_desktop 은 1280×900 DPR 1 고정",
    "  --land            (예전 옵션, 무시) 화면은 항상 가로",
    "  --run-seed S      런 seed (기본 1)",
    "  --settle MS       경기 화면 진입 후 캡처까지 대기 (기본 600)",
    "  --no-freeze       페이지 타이머 고정을 끈다",
    "  --list            시나리오 목록만 출력",
    "  환경변수 CHROME_PATH 로 브라우저 실행 파일 지정",
    "시나리오:",
    ...SCENARIOS.map((s) => `  ${s.name.padEnd(30)} ${s.title}`),
  ].join("\n");
}

export function parseArgs(argv) {
  const out = { outDir: null, only: null, width: null, height: null, dpr: null, land: false, runSeed: 1, settle: 600, freeze: true, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--only") out.only = String(next() || "").split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--width") out.width = parseInt(next(), 10) || null;
    else if (a === "--height") out.height = parseInt(next(), 10) || null;
    else if (a === "--dpr") out.dpr = Number(next()) || null;
    else if (a === "--land") out.land = true;
    else if (a === "--run-seed") { const v = next(); out.runSeed = /^\d+$/.test(v) ? Number(v) : v; }
    else if (a === "--settle") out.settle = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === "--no-freeze") out.freeze = false;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!out.outDir) out.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  // 뷰포트 기본값: 데스크톱 1280×720 DPR 1 (고정 스테이지 1배). 직접 준 값이 이긴다
  const def = { width: STAGE_W, height: STAGE_H, dpr: 1 };
  out.width = out.width ?? def.width;
  out.height = out.height ?? def.height;
  out.dpr = out.dpr ?? def.dpr;
  return out;
}

// --only a,b: 이름이 정확히 같은 시나리오가 있으면 그것만 (og_training → og_training_mid 는 빼고), 없으면 접두어 (02 → 02_…, og → og_* 전부)
export function selectScenarios(only, list = SCENARIOS) {
  if (!only || !only.length) return list.slice();
  const match = (o) => (list.some((s) => s.name === o) ? list.filter((s) => s.name === o) : list.filter((s) => s.name.startsWith(o)));
  const unknown = only.filter((o) => !match(o).length);
  if (unknown.length) throw new Error(`알 수 없는 시나리오: ${unknown.join(", ")} (목록: --list)`);
  const names = new Set(only.flatMap((o) => match(o).map((s) => s.name)));
  return list.filter((s) => names.has(s.name));
}

/* ------------------------------------------------------------------ */
/* 브라우저 찾기                                                          */
/* ------------------------------------------------------------------ */

export function findBrowser() {
  const env = process.env.CHROME_PATH;
  if (env) {
    if (fs.existsSync(env)) return { path: env, source: "CHROME_PATH" };
    console.warn(`CHROME_PATH 가 가리키는 파일이 없습니다: ${env} — 기본 경로를 찾습니다.`);
  }
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const pf = process.env.ProgramFiles || "C:/Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)";
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ];
  for (const c of cands) if (c && fs.existsSync(c)) return { path: c, source: "기본 경로" };
  return null;
}

/* ------------------------------------------------------------------ */
/* 정적 서버                                                              */
/* ------------------------------------------------------------------ */

export function startServer(root = ROOT) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (p.endsWith("/")) p += "index.html";
    const file = path.resolve(base, "." + p);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        if (p === "/favicon.ico") { res.writeHead(204); res.end(); return; } // 프로토타입엔 파비콘이 없다 → 잡음 방지
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end(`not found: ${p}`);
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/* ------------------------------------------------------------------ */
/* 페이지 쪽 코드                                                         */
/* ------------------------------------------------------------------ */

// 타이머 고정: window.__shot.frozen 이 true 인 동안 지연 ≥ minDelay 인 setTimeout 은 보류(풀리면 실행),
// setInterval 틱은 건너뛴다. 앱 스크립트보다 먼저 설치된다 (evaluateOnNewDocument).
const FREEZE_SCRIPT = `(() => {
  const W = window;
  if (W.__shot) return;
  const rST = W.setTimeout, rSI = W.setInterval, rCT = W.clearTimeout, rCI = W.clearInterval;
  const ctl = { frozen: false, minDelay: 100, held: 0, skippedTicks: 0 };
  const pending = new Map(); // app 이 받은 id → 현재 실제 id
  W.__shot = ctl;
  W.setTimeout = function (fn, delay, ...args) {
    if (typeof fn !== "function") return rST.call(W, fn, delay, ...args);
    const d = Number(delay) || 0;
    let id;
    const fire = () => {
      if (!pending.has(id)) return;
      if (ctl.frozen && d >= ctl.minDelay) { ctl.held++; pending.set(id, rST.call(W, fire, 50)); return; }
      pending.delete(id);
      fn(...args);
    };
    id = rST.call(W, fire, d);
    pending.set(id, id);
    return id;
  };
  const clear = (id) => {
    if (pending.has(id)) { rCT.call(W, pending.get(id)); pending.delete(id); }
    rCT.call(W, id);
    rCI.call(W, id);
  };
  W.clearTimeout = clear;
  W.clearInterval = clear;
  W.setInterval = function (fn, delay, ...args) {
    if (typeof fn !== "function") return rSI.call(W, fn, delay, ...args);
    const d = Number(delay) || 0;
    return rSI.call(W, () => {
      if (ctl.frozen && d >= ctl.minDelay) { ctl.skippedTicks++; return; }
      fn(...args);
    }, d);
  };
})();`;

/** 액션 버튼 찾기 (페이지 안에서 실행). data-action → 액션 영역 → 텍스트 순. */
function pageFindActionButton(action, label) {
  const usable = (b) => b && !b.disabled && b.getAttribute("aria-disabled") !== "true";
  const byData = [...document.querySelectorAll(`button[data-action="${action}"]`)];
  if (byData.length) return byData.find(usable) || byData[0];
  const firstLine = (b) => ((b.firstElementChild && b.firstElementChild.textContent) || b.textContent || "").trim();
  const isSkill = (b) => /텐션/.test(b.textContent || "");
  const hit = (b) => !isSkill(b) && firstLine(b).includes(label);
  const areas = [...document.querySelectorAll(".action-grid button, .actions button, .action-row button, [class*='action'] button")];
  const all = [...document.querySelectorAll("button")];
  return areas.find((b) => hit(b) && usable(b)) || all.find((b) => hit(b) && usable(b)) || areas.find(hit) || null;
}

async function clickButtonByText(page, re) {
  return page.evaluate((src) => {
    const rx = new RegExp(src);
    const b = [...document.querySelectorAll("button")].find((x) => rx.test((x.textContent || "").trim()) && !x.disabled);
    if (!b) return null;
    b.click();
    return (b.textContent || "").trim().replace(/\s+/g, " ");
  }, re.source);
}

async function readLiveMatch(page) {
  return page.evaluate((matchKey) => {
    try {
      const m = window.__soccer && window.__soccer.store && window.__soccer.store.match;
      if (m) return JSON.parse(JSON.stringify(m));
    } catch (_) { /* fall through */ }
    try { return JSON.parse(localStorage.getItem(matchKey) || "null"); } catch (_) { return null; }
  }, KEYS.match);
}

/** 자동 진행 끄기. ?auto=0 이 먹었으면 "url", 아니면 버튼 클릭("button") → 최후엔 store 직접 수정("store"). */
async function ensureManual(page) {
  const autoNow = () => page.evaluate(() => {
    const ui = window.__soccer && window.__soccer.store && window.__soccer.store.matchUi;
    if (ui && typeof ui.auto === "boolean") return ui.auto;
    const b = [...document.querySelectorAll("button")].find((x) => /자동/.test(x.textContent || ""));
    if (!b) return null;
    if (b.getAttribute("aria-pressed")) return b.getAttribute("aria-pressed") === "true";
    return /자동\s*ON/i.test(b.textContent || "");
  });
  let auto = await autoNow();
  if (auto === false) return { method: "url", ok: true };
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const b = btns.find((x) => /자동\s*ON/i.test((x.textContent || "").trim()))
      || btns.find((x) => /자동/.test(x.textContent || "") && x.getAttribute("aria-pressed") === "true");
    if (!b || b.disabled) return null;
    b.click();
    return (b.textContent || "").trim();
  });
  await delay(150);
  auto = await autoNow();
  if (clicked && auto !== true) return { method: `button("${clicked}")`, ok: true };
  const forced = await page.evaluate(() => {
    const s = window.__soccer;
    if (!s || !s.store || !s.store.matchUi) return false;
    s.store.matchUi.auto = false;
    if (typeof s.render === "function") s.render();
    return true;
  });
  await delay(150);
  auto = await autoNow();
  return { method: forced ? "store+render" : "실패", ok: auto === false };
}

/* ------------------------------------------------------------------ */
/* 시나리오 실행                                                          */
/* ------------------------------------------------------------------ */

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function pngSize(file) {
  try {
    const b = fs.readFileSync(file);
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return null;
  }
}

async function newContext(browser) {
  if (typeof browser.createBrowserContext === "function") return browser.createBrowserContext();
  if (typeof browser.createIncognitoBrowserContext === "function") return browser.createIncognitoBrowserContext();
  return browser.defaultBrowserContext();
}

async function runScenario(browser, baseUrl, sc, prepared, opts) {
  const vp = sc.viewport || { width: opts.width, height: opts.height, deviceScaleFactor: opts.dpr, isMobile: false, hasTouch: false };
  const out = { name: sc.name, file: path.join(opts.outDir, `${sc.name}.png`), errors: [], notes: [], viewport: vp, allowInnerScroll: sc.allowInnerScroll || null };
  const ctxB = await newContext(browser);
  const page = await ctxB.newPage();
  try {
    page.on("pageerror", (e) => out.errors.push(`pageerror: ${e && e.message ? e.message : String(e)}`));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const loc = m.location && m.location();
      out.errors.push(`console.error: ${m.text()}${loc && loc.url ? ` (${loc.url.replace(baseUrl, "")}:${loc.lineNumber ?? ""})` : ""}`);
    });
    page.on("requestfailed", (r) => out.errors.push(`requestfailed: ${r.url().replace(baseUrl, "")} ${r.failure()?.errorText ?? ""}`));
    page.on("response", (r) => { if (r.status() >= 400) out.errors.push(`HTTP ${r.status()}: ${r.url().replace(baseUrl, "")}`); });

    await page.setViewport(vp);
    await page.evaluateOnNewDocument(FREEZE_SCRIPT);
    const q = new URLSearchParams();
    if (sc.auto === false) q.set("auto", "0");
    for (const [k, val] of Object.entries(sc.query || {})) q.set(k, String(val)); // 시나리오 URL 파라미터 (예: 레슨 ?autolesson=1)
    const qs = q.toString();
    await page.goto(`${baseUrl}/index.html${qs ? `?${qs}` : ""}`, { waitUntil: "load" });
    const json = (v) => (v == null ? null : JSON.stringify(v));
    // 그 밖의 키 (아웃게임 시나리오 storage — 도전 모드 KEYS.challenge · KEYS.challengeMatch)
    const extra = Object.entries(prepared.storage || {}).map(([k, v]) => [k, json(v)]);
    await page.evaluate((keys, runJson, matchJson, teamsJson, extraKv) => {
      const put = (k, v) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v));
      put(keys.run, runJson);
      put(keys.match, matchJson);
      put(keys.teams, teamsJson);
      for (const [k, v] of extraKv) put(k, v);
    }, { run: KEYS.run, match: KEYS.match, teams: KEYS.teams }, json(prepared.runState), json(prepared.matchState), json(prepared.teams), extra);
    await page.reload({ waitUntil: "load" });

    // 시작 화면 (데이터 로드 끝). 진행 중인 도전 경기가 주입돼도 부트는 시작 화면 ([도전 모드 — 이어하기] 를 눌러야 경기로)
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /새 런 시작|이어하기/.test(b.textContent || "")), { timeout: 15000 });
    if (opts.freeze) await page.evaluate(() => { window.__shot.frozen = true; });

    if (sc.outgame) await enterOutgame(page, sc, prepared, opts, out);
    else await enterMatch(page, sc, prepared, opts, out);

    const metrics = await page.evaluate(() => {
      // 페이지 스크롤 + 안쪽 스크롤 컨테이너(overflow auto/scroll 이고 내용이 넘치는 요소). 스테이지(고정 크기) 안이라
      // 페이지는 안 늘어나도 안쪽이 스크롤되는 경우를 잡는다. 이름에 log 가 들어간 요소는 로그(허용)로 표시.
      const inner = [];
      for (const el of document.querySelectorAll("body *")) {
        if (!el.clientHeight || el.scrollHeight <= el.clientHeight + 1) continue;
        const oy = getComputedStyle(el).overflowY;
        if (oy !== "auto" && oy !== "scroll") continue;
        const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
        const name = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
        inner.push({ name, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, isLog: /log/i.test(name) });
      }
      // 잘린 글자 (가독성): 스킬 묶음 버튼 이름 · 레슨 카드 앞면(이름 · 대상 · 위력 · 효과 문구 · 낼 수 없는 이유) · 작은 카드 이름 ·
      // 보상 선수 이름 · 방침 설명이 말줄임(가로) · 줄 제한 넘침(세로, line-clamp)으로 잘렸는가 (§14.3 · LESSON_PROTO_PLAN §10.2)
      const clipped = [...document.querySelectorAll([
        ".skill-row .sk-nm", ".card-face .cf-name", ".card-face .cf-desc", ".card-face .cf-power", ".card-face .cf-target", ".card-face .cf-reason",
        ".mini-card .mc-name", ".rw-pl-nm", ".rw-pl-split", ".rw-pl-by", ".card-face .cf-cost", ".week-lesson .wl-focus", ".week-lesson .wl-target", ".week-lhead",
        ".policy-desc", ".ls-nm b", ".lesson-screen .tok-name",
      ].join(", "))]
        .map((el) => {
          // 말줄임은 소수 픽셀만 넘쳐도 생긴다 → 정수 scrollWidth 대신 글자 Range 크기와 요소 크기(소수)를 비교
          const rg = document.createRange();
          rg.selectNodeContents(el);
          const needW = rg.getBoundingClientRect().width;
          const haveW = el.getBoundingClientRect().width;
          // 두 줄 제한(-webkit-line-clamp): 넘친 줄은 scrollHeight 로 (글자 Range 높이는 폰트 여백이 섞여 쓰지 않는다)
          const clamp = getComputedStyle(el).webkitLineClamp;
          const overH = clamp && clamp !== "none" && el.scrollHeight > el.clientHeight + 1;
          return { el, needW, haveW, overH, sh: el.scrollHeight, ch: el.clientHeight };
        })
        .filter((x) => x.haveW > 0 && (x.needW > x.haveW + 0.5 || x.overH))
        .map((x) => `${(x.el.textContent || "").trim()} ${x.needW.toFixed(1)}/${x.haveW.toFixed(1)}${x.overH ? ` 높이 ${x.sh}/${x.ch}` : ""}`);
      // HUD 겹침 (LESSON_PROTO_PLAN §10.2): 떠 있는 토스트가 레슨 HUD(점수 막대 · 턴 점)를 가리는가
      const rectOf = (el) => el.getBoundingClientRect();
      const cut = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const hud = [...document.querySelectorAll(".lesson-screen .lh-score, .lesson-screen .lh-pips")];
      const overlaps = [];
      for (const t of document.querySelectorAll("#toast-root .toast")) {
        for (const el of hud) {
          if (cut(rectOf(t), rectOf(el)) > 0) overlaps.push(`토스트 "${(t.textContent || "").trim().slice(0, 30)}" ↔ ${el.className}`);
        }
      }
      // 레슨 경기장 겹침 (LESSON_PROTO_PLAN §14.19 ZU2): 토큰 이름표끼리 · 이름표 ↔ 다른 토큰 얼굴 · 구역 라벨 ↔ 토큰 얼굴 · 이름표 · 실패율 표
      const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05; };
      const toks = [...document.querySelectorAll(".lesson-screen .tok-layer .tok:not(.off)")].filter(vis);
      const nameOf = (t) => (t.querySelector(".tok-nm")?.textContent || t.dataset.id || "").trim();
      const parts = [];
      for (const t of toks) {
        const nm = t.querySelector(".tok-name");
        const face = t.querySelector(".tok-face");
        const warn = t.querySelector(".tok-warn.on");
        if (nm && vis(nm)) parts.push({ tok: t, kind: "이름표", r: rectOf(nm) });
        if (face) parts.push({ tok: t, kind: "얼굴", r: rectOf(face) });
        if (warn && vis(warn)) parts.push({ tok: t, kind: "실패율", r: rectOf(warn) });
      }
      for (const c of document.querySelectorAll(".lesson-screen .zone-chip")) if (vis(c)) parts.push({ tok: null, kind: `구역 라벨 ${(c.textContent || "").trim().slice(0, 8)}`, r: rectOf(c), chip: true });
      const tag = document.querySelector(".lesson-screen .aim-tag.on");
      if (tag && vis(tag)) parts.push({ tok: null, kind: "원 꼬리표", r: rectOf(tag), tag: true });      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], b = parts[j];
        if ((a.tag || b.tag) && !(a.chip || b.chip)) continue; // 꼬리표는 구역 라벨과만 (선수 위는 조준 중 잠깐)
        if (a.tok && a.tok === b.tok) continue; // 같은 토큰 안 (얼굴 ↔ 자기 이름표)
        if (a.kind === "얼굴" && b.kind === "얼굴") continue; // 얼굴끼리는 대형 간격(§14.2)이 보장
        if (cut(a.r, b.r) > 4) overlaps.push(`레슨 ${a.tok ? nameOf(a.tok) + " " : ""}${a.kind} ↔ ${b.tok ? nameOf(b.tok) + " " : ""}${b.kind}`);
      }
      // 꼬리표가 경기장 밖으로 나가는가 (경기장 overflow 에 잘린다)
      const fieldEl = document.querySelector(".lesson-screen .m-field");
      if (tag && vis(tag) && fieldEl) {
        const fr = rectOf(fieldEl), tr = rectOf(tag);
        if (tr.left < fr.left - 1 || tr.top < fr.top - 1 || tr.right > fr.right + 1 || tr.bottom > fr.bottom + 1) overlaps.push(`레슨 원 꼬리표가 경기장 밖 "${(tag.textContent || "").trim()}"`);
      }
      // 원 판정 (LESSON_PROTO_PLAN §14.2 · ZI): 그린 원(.aim-circle — 타원 박스) 안에 얼굴 중심이 있는 토큰 = 엔진 미리보기 대상(.target).
      // 테두리 ±3px 안의 토큰은 건너뛴다 (반올림 · 테두리 두께)
      const circ = document.querySelector(".lesson-screen .aim-circle.on");
      if (circ && vis(circ)) {
        const cr = rectOf(circ);
        const ex = cr.left + cr.width / 2, ey = cr.top + cr.height / 2, rx = cr.width / 2, ry = cr.height / 2;
        for (const t of toks) {
          const face = t.querySelector(".tok-face");
          if (!face || rx <= 0 || ry <= 0) continue;
          const fr = rectOf(face);
          const d = Math.hypot((fr.left + fr.width / 2 - ex) / rx, (fr.top + fr.height / 2 - ey) / ry);
          if (Math.abs(d - 1) * Math.min(rx, ry) < 3) continue;
          const inside = d < 1;
          const target = t.classList.contains("target");
          if (inside !== target) overlaps.push(`원 판정 ${t.dataset.id} ${nameOf(t)}: 그림 ${inside ? "안" : "밖"} · 대상 ${target ? "예" : "아니오"}`);
        }
      }
      // 고정 스테이지: 배율 · 위치 (js/ui/stage.js), 스테이지 밖으로 넘친 가로 폭 (#app 논리 px)
      const stageEl = document.getElementById("stage");
      const r = stageEl ? stageEl.getBoundingClientRect() : null;
      const app = document.getElementById("app");
      return {
        clipped,
        overlaps,
        scrollHeight: document.scrollingElement ? document.scrollingElement.scrollHeight : document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        scrollWidth: document.scrollingElement ? document.scrollingElement.scrollWidth : document.documentElement.scrollWidth,
        inner,
        stage: r ? {
          scale: Number(getComputedStyle(document.documentElement).getPropertyValue("--stage-scale")) || null,
          x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
          portraitHint: document.documentElement.classList.contains("stage-portrait"),
          appOverflowX: app ? Math.max(0, app.scrollWidth - app.clientWidth) : 0,
        } : null,
      };
    });
    await page.screenshot({ path: out.file }); // 뷰포트 그대로 (페이지는 스크롤하지 않는다)
    out.metrics = metrics;
    out.png = pngSize(out.file);

    // 캡처 시점 상태 확인
    if (sc.outgame) out.stateCheck = await checkOutgame(page, sc);
    else await checkMatch(page, sc, prepared, opts, out);
    const shotCtl = await page.evaluate(() => window.__shot ? { held: window.__shot.held, skippedTicks: window.__shot.skippedTicks } : null);
    if (opts.freeze && shotCtl && (shotCtl.held || shotCtl.skippedTicks)) out.notes.push(`고정 중 보류된 타이머 ${shotCtl.held}회 · 건너뛴 틱 ${shotCtl.skippedTicks}회`);
  } finally {
    await ctxB.close().catch(() => {});
  }
  return out;
}

/** 경기 시나리오: 이어하기 → 경기 화면 → (수동이면 자동 끄기) → 조작 */
async function enterMatch(page, sc, prepared, opts, out) {
  const cont = await clickButtonByText(page, /이어하기/);
  if (!cont) throw new Error("시작 화면에 '이어하기' 버튼이 없습니다");

  try {
    await page.waitForFunction(() => {
      const s = window.__soccer && window.__soccer.store;
      const inMatch = !s || (s.screen === "run" && s.run && s.run.phase === "match" && s.match);
      return inMatch && !!document.querySelector(".match-screen, [data-screen='match'], .match");
    }, { timeout: 8000 });
  } catch {
    out.notes.push("경기 화면 요소(.match-screen)를 찾지 못함 — 그대로 캡처");
  }

  if (sc.auto === false) {
    const m = await ensureManual(page);
    out.notes.push(`자동 끔: ${m.method}${m.ok ? "" : " (여전히 자동 ON 으로 보임)"}`);
  }
  await delay(opts.settle);

  // 경기 화면이 제대로 복원됐는지: 주입한 경기 그대로인가
  const restored = await readLiveMatch(page);
  if (!restored || restored.seed !== prepared.matchState.seed) {
    out.notes.push(`주의: 저장된 경기가 복원되지 않음 (live seed ${restored ? restored.seed : "-"} / 주입 ${prepared.matchState.seed})`);
  }

  if (sc.interact && sc.interact.type === "hover") {
    const r = await pressAction(page, sc.interact.actions, { hold: true });
    out.notes.push(r ? `hover+누르기: ${r}` : "hover 할 액션 버튼을 찾지 못함");
    await delay(400);
  } else if (sc.interact && sc.interact.type === "click") {
    if (opts.freeze) await page.evaluate(() => { window.__shot.frozen = false; });
    const r = await pressAction(page, [sc.interact.action], { click: true });
    if (!r) out.notes.push(`'${sc.interact.action}' 버튼을 찾지 못함`);
    else out.notes.push(`클릭: ${r} → ${sc.interact.waitMs ?? 250}ms 뒤 캡처`);
    await delay(sc.interact.waitMs ?? 250);
  } else if (sc.interact && sc.interact.type === "steps") {
    // 여러 단계 조작 (v0.3): 스킬 줄 버튼 클릭(선택자) → 액션 hover / 액션 클릭(연출 타이머가 돌도록 고정 해제) → 대기
    for (const st of sc.interact.steps || []) {
      if (st.click) {
        const r = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          el.click();
          return (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
        }, st.click);
        out.notes.push(r ? `클릭 ${st.click}: [${r}]` : `'${st.click}' 을 찾지 못함`);
      } else if (st.hover) {
        const r = await pressAction(page, st.hover, { hold: true });
        out.notes.push(r ? `hover+누르기: ${r}` : "hover 할 액션 버튼을 찾지 못함");
        await delay(300);
      } else if (st.press) {
        if (opts.freeze) await page.evaluate(() => { window.__shot.frozen = false; });
        const r = await pressAction(page, [st.press], { click: true });
        out.notes.push(r ? `클릭: ${r} → ${st.waitMs ?? 250}ms 뒤 캡처` : `'${st.press}' 버튼을 찾지 못함`);
        await delay(st.waitMs ?? 250);
      } else if (st.wait) {
        await delay(st.wait);
      }
    }
  }
}

async function checkMatch(page, sc, prepared, opts, out) {
  const live = await readLiveMatch(page);
  out.liveSummary = live ? describeState(live) : null;
  if (sc.verify) {
    const v = sc.verify(prepared.matchState, live);
    out.stateCheck = v === true ? "OK" : `다름: ${v}`;
  } else if (!live) {
    out.stateCheck = "다름: 캡처 시점 상태를 읽지 못함";
  } else {
    const sameEvents = (live.events || []).length === (prepared.matchState.events || []).length;
    const req = sc.require(live, { data: opts.data });
    out.stateCheck = sameEvents && req ? "OK" : `다름: ${sameEvents ? "" : "경기가 진행됨, "}${req ? "" : "조건 불충족, "}지금 ${out.liveSummary}`.replace(/, 지금/, " — 지금");
  }
}

/** 아웃게임 시나리오: (저장된 런이면) 이어하기 → steps (실제 마우스 클릭 — 스테이지 배율을 거친 좌표) → ready 대기 */
async function enterOutgame(page, sc, prepared, opts, out) {
  // steps 는 배열, 또는 상태 준비 결과(prepared)를 받아 배열을 돌려주는 함수 (예: 손패의 특정 uid 를 누르기)
  const steps = typeof sc.steps === "function" ? sc.steps(prepared) : sc.steps || [];
  if (prepared.runState) {
    const cont = await clickButtonByText(page, /이어하기/);
    if (!cont) throw new Error("시작 화면에 '이어하기' 버튼이 없습니다");
    await delay(150);
  }
  for (const st of steps) {
    if (st.wait) { await delay(st.wait); continue; }
    // 타이머 고정 켜기/끄기 (연출 중간을 찍을 때: 클릭 → { freeze: false } → { wait } → { freeze: true })
    if (Object.prototype.hasOwnProperty.call(st, "freeze")) {
      if (opts.freeze) await page.evaluate((v) => { if (window.__shot) window.__shot.frozen = v; }, !!st.freeze);
      continue;
    }
    if (st.drag) { out.notes.push(await dragStep(page, st.drag)); continue; }
    // 키 누르기 (레슨 조준 키보드 — ← → 후보 · 1~5 구역 · Enter · Esc): { key: "ArrowRight", times?: 2 }
    if (st.key) {
      for (let i = 0; i < (st.times ?? 1); i++) await page.keyboard.press(st.key);
      out.notes.push(`키 ${st.key}${(st.times ?? 1) > 1 ? ` ×${st.times}` : ""}`);
      await delay(st.waitMs ?? 150);
      continue;
    }
    // 터치 탭 (시나리오 viewport.hasTouch — 실제 터치 이벤트 → pointerType "touch"): { tap: sel } · { tapAt: { sel, x, y } }
    if (st.tap || st.tapAt) {
      const t = st.tapAt || { sel: st.tap, x: 50, y: 50 };
      const pt = await pointIn(page, t);
      if (!pt) { out.notes.push(`'${t.sel}' 을 찾지 못함`); continue; }
      await page.touchscreen.tap(pt.x, pt.y);
      out.notes.push(`탭 ${t.sel}${st.tapAt ? ` (${t.x}%, ${t.y}%)` : ""} → (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
      await delay(st.waitMs ?? 200);
      continue;
    }
    // 요소 안의 한 점(요소 박스 %)으로 마우스 이동 / 클릭 — 레슨 경기장 조준 (§14.16): { hoverAt | clickAt: { sel, x, y } }
    if (st.hoverAt || st.clickAt) {
      const t = st.hoverAt || st.clickAt;
      const pt = await pointIn(page, t);
      if (!pt) { out.notes.push(`'${t.sel}' 을 찾지 못함`); continue; }
      await page.mouse.move(pt.x, pt.y, { steps: 6 });
      if (st.clickAt) await page.mouse.click(pt.x, pt.y);
      out.notes.push(`${st.clickAt ? "클릭" : "hover"} ${t.sel} (${t.x}%, ${t.y}%) → (${Math.round(pt.x)}, ${Math.round(pt.y)})`);
      await delay(st.waitMs ?? 200);
      continue;
    }
    const handle = await page.evaluateHandle((sel, textSrc) => {
      if (sel) return document.querySelector(sel);
      const rx = new RegExp(textSrc);
      return [...document.querySelectorAll("button")].find((b) => rx.test((b.textContent || "").trim()) && !b.disabled) || null;
    }, st.click || null, st.text || null);
    const el = handle.asElement();
    const what = st.click || `/${st.text}/`;
    if (!el) { await handle.dispose(); out.notes.push(`'${what}' 을 찾지 못함`); continue; }
    const box = await el.boundingBox();
    const label = await el.evaluate((b) => (b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40));
    await el.dispose();
    if (!box) { out.notes.push(`'${what}' 이 보이지 않음`); continue; }
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    out.notes.push(`클릭 ${what}: [${label}]`);
    await delay(st.waitMs ?? 200);
  }
  if (sc.ready) {
    try {
      await page.waitForSelector(sc.ready, { timeout: 5000 });
    } catch {
      out.notes.push(`'${sc.ready}' 이 나타나지 않음 — 그대로 캡처`);
    }
  }
  await delay(opts.settle);
}

/**
 * 드래그 단계 (라인업 보드 js/ui/lineup.js): from 요소 가운데에서 누르고 → to 요소 가운데로 여러 번 나눠 움직이고 →
 * release 면 놓는다, 아니면 누른 채로 두어 끄는 중 화면(초록/빨강 자리 · 고스트)을 캡처한다.
 * 좌표는 puppeteer boundingBox(화면 px — 스테이지 배율을 거친 값) 그대로라 --width/--height 를 바꿔도 같은 곳에 놓인다.
 * touch 면 손가락(touchscreen — 시나리오 viewport.hasTouch)으로 끈다.
 * @param {{ from: string, to: string, at?: { x, y }, release?: boolean, steps?: number, waitMs?: number, touch?: boolean }} d
 */
async function dragStep(page, d) {
  const boxOf = async (sel) => {
    const el = await page.$(sel);
    if (!el) return null;
    const box = await el.boundingBox();
    await el.dispose();
    return box;
  };
  const a = await boxOf(d.from);
  const b = await boxOf(d.to);
  if (!a || !b) return `드래그: '${!a ? d.from : d.to}' 을 찾지 못함`;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  // at = to 요소 박스 안의 점 (%) — 레슨 경기장의 필드 좌표에 놓기
  const bx = d.at ? b.x + (b.width * d.at.x) / 100 : b.x + b.width / 2;
  const by = d.at ? b.y + (b.height * d.at.y) / 100 : b.y + b.height / 2;
  const n = d.steps ?? 12;
  if (d.touch) {
    await page.touchscreen.touchStart(ax, ay);
    for (let i = 1; i <= n; i++) {
      await page.touchscreen.touchMove(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
      await delay(16);
    }
    if (d.release) await page.touchscreen.touchEnd();
  } else {
    await page.mouse.move(ax, ay);
    await page.mouse.down();
    await page.mouse.move(ax + 4, ay + 4, { steps: 2 }); // 문턱(6px) 전: 아직 탭
    await page.mouse.move(bx, by, { steps: n });
    if (d.release) await page.mouse.up();
  }
  await delay(d.waitMs ?? 150);
  return `${d.touch ? "터치 " : ""}드래그 ${d.from} → ${d.to} (${Math.round(ax)},${Math.round(ay)} → ${Math.round(bx)},${Math.round(by)})${d.release ? " 놓음" : " — 누른 채 캡처"}`;
}

/** 요소 박스 안의 점 (x · y = 박스 %) → 화면 px. 요소가 없으면 null */
async function pointIn(page, t) {
  const el = await page.$(t.sel);
  if (!el) return null;
  const box = await el.boundingBox();
  await el.dispose();
  if (!box) return null;
  return { x: box.x + (box.width * (t.x ?? 50)) / 100, y: box.y + (box.height * (t.y ?? 50)) / 100 };
}

/** 아웃게임 캡처 시점 확인: store.screen · run.phase · 모달 · ready 선택자 */
async function checkOutgame(page, sc) {
  const live = await page.evaluate((ready) => {
    const s = window.__soccer && window.__soccer.store;
    const overlays = [...document.querySelectorAll("#modal-root .overlay > .modal, #modal-root .overlay > .sheet")];
    return {
      screen: s ? s.screen : null,
      phase: s && s.run ? s.run.phase : null,
      overlays: overlays.map((el) => el.className),
      ready: ready ? !!document.querySelector(ready) : true,
    };
  }, sc.ready || null);
  const exp = sc.expect || {};
  const bad = [];
  if (exp.screen && live.screen !== exp.screen) bad.push(`화면 ${live.screen}`);
  if (exp.phase && live.phase !== exp.phase) bad.push(`phase ${live.phase}`);
  if (exp.modal === false && live.overlays.length) bad.push(`모달 열림 (${live.overlays.join(" / ")})`);
  if (exp.modal === true && !live.overlays.length) bad.push("모달 없음");
  if (typeof exp.modal === "string" && !(await page.$(`#modal-root ${exp.modal}`))) bad.push(`모달 ${exp.modal} 없음 (${live.overlays.join(" / ") || "-"})`);
  if (!live.ready) bad.push(`${sc.ready} 없음`);
  return bad.length ? `다름: ${bad.join(", ")}` : "OK";
}

/** 액션 버튼에 마우스를 올리고(hover) 누르고 있거나(hold) 클릭한다. 찾은 버튼 설명을 반환. */
async function pressAction(page, actions, { hold = false, click = false } = {}) {
  for (const action of actions) {
    const handle = await page.evaluateHandle(pageFindActionButton, action, ACTION_LABELS[action] || action);
    const el = handle.asElement();
    if (!el) { await handle.dispose(); continue; }
    const desc = await el.evaluate((b) => `[${(b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60)}]${b.disabled ? " (disabled)" : ""}`);
    await el.evaluate((b) => b.scrollIntoView({ block: "nearest", inline: "nearest" }));
    await delay(80);
    const box = await el.boundingBox();
    await el.dispose();
    if (!box) continue;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y, { steps: 4 });
    if (click) {
      await page.mouse.click(x, y);
      return `${action} ${desc}`;
    }
    if (hold) {
      await delay(150);
      await page.mouse.down(); // 누르고 있기 (놓지 않는다 → 결정은 보내지 않음)
    }
    return `${action} ${desc}`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* main                                                                  */
/* ------------------------------------------------------------------ */

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  if (args.help || args.list) { console.log(usage()); return; }
  if (!args.outDir) { console.error(usage()); process.exitCode = 1; return; }

  let scenarios;
  try {
    scenarios = selectScenarios(args.only);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e) {
    console.log("puppeteer-core 를 불러올 수 없습니다 — 프로젝트 루트에서 `npm i` 후 다시 실행하세요.");
    console.log(`(${e && e.message ? e.message : e})`);
    return;
  }
  const browserInfo = findBrowser();
  if (!browserInfo) {
    console.log("Chrome/Edge 실행 파일을 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.");
    console.log('  예) CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" node tools/shot.mjs shots');
    return;
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const data = loadData();

  // 상태 준비 (Node, 결정적)
  const prepared = new Map();
  for (const sc of scenarios) {
    const t0 = Date.now();
    prepared.set(sc.name, buildScenarioState(data, sc, { runSeed: args.runSeed }));
    const p = prepared.get(sc.name);
    console.log(`· 상태 준비 ${sc.name}: ${p.summary} (seed ${p.seed}, ${p.steps} step${p.preferred ? "" : ", 선호 조건 불충족 → 대체"}, ${Date.now() - t0}ms)`);
  }

  const server = await startServer(ROOT);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const fit = fitStage(args.width, args.height);
  console.log(`· 서버 ${baseUrl}  브라우저 ${browserInfo.path} (${browserInfo.source})  뷰포트 ${args.width}×${args.height} DPR ${args.dpr} → 스테이지 ${STAGE_W}×${STAGE_H} ×${+fit.scale.toFixed(4)} @ (${fit.x}, ${fit.y})${args.land ? " (--land: 무시, 항상 가로)" : ""}`);

  let browser;
  const results = [];
  try {
    browser = await puppeteer.launch({
      executablePath: browserInfo.path,
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--lang=ko-KR"],
    });
    for (const sc of scenarios) {
      const opts = { ...args, outDir, data };
      let r;
      try {
        r = await runScenario(browser, baseUrl, sc, prepared.get(sc.name), opts);
      } catch (e) {
        r = { name: sc.name, file: null, failed: String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e), errors: [], notes: [] };
      }
      results.push(r);
      printScenario(sc, prepared.get(sc.name), r);
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }

  printSummary(results);
  if (results.some((r) => r.failed)) process.exitCode = 1;
}

function printScenario(sc, prep, r) {
  console.log("");
  console.log(`[${sc.name}] ${sc.title}`);
  console.log(`  주입 상태: ${prep.summary}`);
  if (r.failed) { console.log(`  실패: ${r.failed}`); return; }
  const vp = r.viewport;
  console.log(`  파일: ${r.file}${r.png ? ` (${r.png.w}×${r.png.h}px, 뷰포트 ${vp.width}×${vp.height} DPR ${vp.deviceScaleFactor})` : ""}`);
  const m = r.metrics;
  if (m.stage) {
    const st = m.stage;
    console.log(`  스테이지 ×${st.scale != null ? +st.scale.toFixed(4) : "?"} → ${st.w}×${st.h} @ (${st.x}, ${st.y})${st.portraitHint ? " · 세로 창 안내 표시" : ""}${st.appOverflowX ? ` · 가로 넘침 +${st.appOverflowX}px (#app)` : ""}`);
  } else {
    console.log("  스테이지: #stage 없음");
  }
  const scroll = m.scrollHeight > m.innerHeight + 1;
  console.log(`  scrollHeight ${m.scrollHeight} / 화면 ${m.innerHeight} → ${scroll ? `세로 스크롤 있음 (+${m.scrollHeight - m.innerHeight}px)` : "스크롤 없음"}` +
    (m.scrollWidth > m.innerWidth + 1 ? ` · 가로 넘침 scrollWidth ${m.scrollWidth}` : ""));
  for (const s of m.inner || []) {
    console.log(`  내부 스크롤: ${s.name} ${s.scrollHeight}/${s.clientHeight} (+${s.scrollHeight - s.clientHeight}px)${s.isLog ? " — 로그(허용)" : ""}`);
  }
  if ((m.clipped || []).length) console.log(`  잘린 글자: ${m.clipped.join(" · ")}`);
  if ((m.overlaps || []).length) console.log(`  겹침 (HUD · 레슨 경기장): ${m.overlaps.join(" · ")}`);
  console.log(`  캡처 시점 상태: ${r.stateCheck}`);
  for (const n of r.notes) console.log(`  - ${n}`);
  console.log(`  콘솔 에러: ${r.errors.length ? r.errors.length + "건" : "없음"}`);
  for (const e of r.errors) console.log(`    · ${e}`);
}

function printSummary(results) {
  console.log("");
  console.log("요약");
  const rows = [["시나리오", "PNG", "배율", "scrollHeight", "스크롤", "내부 스크롤(로그 제외)", "잘린 글자", "겹침", "상태", "에러"]];
  for (const r of results) {
    if (r.failed) { rows.push([r.name, "실패", "-", "-", "-", "-", "-", "-", "-", "-"]); continue; }
    const m = r.metrics;
    const inner = (m.inner || []).filter((s) => !s.isLog).sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    rows.push([
      r.name,
      r.png ? `${r.png.w}x${r.png.h}` : "-",
      m.stage && m.stage.scale != null ? String(+m.stage.scale.toFixed(3)) : "-",
      `${m.scrollHeight}/${m.innerHeight}`,
      m.scrollHeight > m.innerHeight + 1 ? "있음" : "없음",
      inner.length ? `${inner[0].name} +${inner[0].scrollHeight - inner[0].clientHeight}${inner.length > 1 ? ` 외 ${inner.length - 1}` : ""}` : "없음",
      String((m.clipped || []).length),
      String((m.overlaps || []).length),
      r.stateCheck === "OK" ? "OK" : "다름",
      String(r.errors.length),
    ]);
  }
  const width = (s) => [...String(s)].reduce((w, ch) => w + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(ch) ? 2 : 1), 0);
  const cols = rows[0].map((_, i) => Math.max(...rows.map((row) => width(row[i]))));
  for (const row of rows) console.log("  " + row.map((c, i) => String(c) + " ".repeat(cols[i] - width(c))).join("  "));
  const failed = results.filter((r) => r.failed).length;
  console.log(`  ${results.length - failed}/${results.length} 캡처 완료`);
  // 검사에 걸린 시나리오 (실패 · 페이지 스크롤 · 로그가 아닌 안쪽 스크롤 · 잘린 글자 · HUD 겹침 · 상태 다름 · 에러)
  const bad = results.filter((r) => {
    if (r.failed) return true;
    const m = r.metrics;
    const okInner = (x) => x.isLog || (r.allowInnerScroll && r.allowInnerScroll.test(x.name));
    return m.scrollHeight > m.innerHeight + 1 || (m.inner || []).some((x) => !okInner(x)) || (m.clipped || []).length ||
      (m.overlaps || []).length || r.stateCheck !== "OK" || r.errors.length;
  });
  console.log(bad.length ? `  검사 걸림 ${bad.length}: ${bad.map((r) => r.name).join(", ")}` : "  검사 통과 (스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 없음)");
}

function isEntry() {
  try {
    return path.resolve(process.argv[1] || "").toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntry()) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
  });
}
