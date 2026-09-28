#!/usr/bin/env node
// tools/shot.mjs — 경기 화면 스크린샷 도구 (ARCHITECTURE §12.4). npm test 에는 넣지 않는다.
//
//   node tools/shot.mjs <outDir> [--only 03,05_penalties] [--width 390 --height 844] [--dpr 2]
//                       [--run-seed 1] [--settle 600] [--no-freeze] [--list]
//
// 1) 내장 정적 서버(node:http, 포트 0)로 프로젝트 루트를 띄운다.
// 2) Node 에서 엔진(js/engine/run.js · match.js)으로 시나리오 상황의 run/match 상태를 찾는다 (tools/scenarios.mjs).
// 3) puppeteer-core + 로컬 Chrome/Edge 로 페이지를 열고 localStorage('soccer.run' / 'soccer.match')에 주입 →
//    reload → 시작 화면 "이어하기" 클릭 → 경기 화면 캡처 (fullPage, 스크롤이 생기면 이미지가 길어진다).
// 4) 시나리오마다 파일 경로, document.scrollingElement.scrollHeight, 캡처 시점 상태 확인, pageerror/console.error 를 출력.
//
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

const ACTION_LABELS = { dribble: "드리블", pass: "패스", shoot: "슛", tackle: "태클", intercept: "인터셉트", block: "블록" };
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
    "  --only a,b        시나리오 이름 또는 접두어 (예: 03,05_penalties)",
    "  --width N         폰 뷰포트 폭 (기본 390)   --height N  폰 뷰포트 높이 (기본 844)",
    "  --dpr N           폰 deviceScaleFactor (기본 2). 데스크톱(07)은 1280×900 DPR 1 고정",
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
  const out = { outDir: null, only: null, width: 390, height: 844, dpr: 2, runSeed: 1, settle: 600, freeze: true, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--only") out.only = String(next() || "").split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--width") out.width = parseInt(next(), 10) || 390;
    else if (a === "--height") out.height = parseInt(next(), 10) || 844;
    else if (a === "--dpr") out.dpr = Number(next()) || 2;
    else if (a === "--run-seed") { const v = next(); out.runSeed = /^\d+$/.test(v) ? Number(v) : v; }
    else if (a === "--settle") out.settle = Math.max(0, parseInt(next(), 10) || 0);
    else if (a === "--no-freeze") out.freeze = false;
    else if (a === "--list") out.list = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!out.outDir) out.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  return out;
}

function selectScenarios(only) {
  if (!only || !only.length) return SCENARIOS.slice();
  const picked = SCENARIOS.filter((s) => only.some((o) => s.name === o || s.name.startsWith(o)));
  const unknown = only.filter((o) => !SCENARIOS.some((s) => s.name === o || s.name.startsWith(o)));
  if (unknown.length) throw new Error(`알 수 없는 시나리오: ${unknown.join(", ")} (목록: --list)`);
  return picked;
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
  return page.evaluate(() => {
    try {
      const m = window.__soccer && window.__soccer.store && window.__soccer.store.match;
      if (m) return JSON.parse(JSON.stringify(m));
    } catch (_) { /* fall through */ }
    try { return JSON.parse(localStorage.getItem("soccer.match") || "null"); } catch (_) { return null; }
  });
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
  const vp = sc.viewport || { width: opts.width, height: opts.height, deviceScaleFactor: opts.dpr, isMobile: true, hasTouch: true };
  const out = { name: sc.name, file: path.join(opts.outDir, `${sc.name}.png`), errors: [], notes: [], viewport: vp };
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
    const url = `${baseUrl}/index.html${sc.auto === false ? "?auto=0" : ""}`;
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate((runJson, matchJson) => {
      localStorage.setItem("soccer.run", runJson);
      localStorage.setItem("soccer.match", matchJson);
    }, JSON.stringify(prepared.runState), JSON.stringify(prepared.matchState));
    await page.reload({ waitUntil: "load" });

    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /이어하기/.test(b.textContent || "")), { timeout: 15000 });
    if (opts.freeze) await page.evaluate(() => { window.__shot.frozen = true; });
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
    }

    const metrics = await page.evaluate(() => {
      // 페이지 스크롤 + 내부 스크롤 컨테이너(overflow auto/scroll 이고 내용이 넘치는 요소). 데스크톱 폰 프레임처럼
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
      return {
        scrollHeight: document.scrollingElement ? document.scrollingElement.scrollHeight : document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        scrollWidth: document.scrollingElement ? document.scrollingElement.scrollWidth : document.documentElement.scrollWidth,
        inner,
      };
    });
    await page.screenshot({ path: out.file, fullPage: true });
    out.metrics = metrics;
    out.png = pngSize(out.file);

    // 캡처 시점 상태 확인
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
    const shotCtl = await page.evaluate(() => window.__shot ? { held: window.__shot.held, skippedTicks: window.__shot.skippedTicks } : null);
    if (opts.freeze && shotCtl && (shotCtl.held || shotCtl.skippedTicks)) out.notes.push(`고정 중 보류된 타이머 ${shotCtl.held}회 · 건너뛴 틱 ${shotCtl.skippedTicks}회`);
  } finally {
    await ctxB.close().catch(() => {});
  }
  return out;
}

/** 액션 버튼에 마우스를 올리고(hover) 누르고 있거나(hold) 클릭한다. 찾은 버튼 설명을 반환. */
async function pressAction(page, actions, { hold = false, click = false } = {}) {
  for (const action of actions) {
    const handle = await page.evaluateHandle(pageFindActionButton, action, ACTION_LABELS[action] || action);
    const el = handle.asElement();
    if (!el) { await handle.dispose(); continue; }
    const desc = await el.evaluate((b) => `[${(b.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60)}]${b.disabled ? " (disabled)" : ""}`);
    await el.evaluate((b) => b.scrollIntoView({ block: "center", inline: "center" }));
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
  console.log(`· 서버 ${baseUrl}  브라우저 ${browserInfo.path} (${browserInfo.source})`);

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
  const scroll = m.scrollHeight > m.innerHeight + 1;
  console.log(`  scrollHeight ${m.scrollHeight} / 화면 ${m.innerHeight} → ${scroll ? `세로 스크롤 있음 (+${m.scrollHeight - m.innerHeight}px)` : "스크롤 없음"}` +
    (m.scrollWidth > m.innerWidth + 1 ? ` · 가로 넘침 scrollWidth ${m.scrollWidth}` : ""));
  for (const s of m.inner || []) {
    console.log(`  내부 스크롤: ${s.name} ${s.scrollHeight}/${s.clientHeight} (+${s.scrollHeight - s.clientHeight}px)${s.isLog ? " — 로그(허용)" : ""}`);
  }
  console.log(`  캡처 시점 상태: ${r.stateCheck}`);
  for (const n of r.notes) console.log(`  - ${n}`);
  console.log(`  콘솔 에러: ${r.errors.length ? r.errors.length + "건" : "없음"}`);
  for (const e of r.errors) console.log(`    · ${e}`);
}

function printSummary(results) {
  console.log("");
  console.log("요약");
  const rows = [["시나리오", "PNG", "scrollHeight", "스크롤", "내부 스크롤(로그 제외)", "상태", "에러"]];
  for (const r of results) {
    if (r.failed) { rows.push([r.name, "실패", "-", "-", "-", "-", "-"]); continue; }
    const m = r.metrics;
    const inner = (m.inner || []).filter((s) => !s.isLog).sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
    rows.push([
      r.name,
      r.png ? `${r.png.w}x${r.png.h}` : "-",
      `${m.scrollHeight}/${m.innerHeight}`,
      m.scrollHeight > m.innerHeight + 1 ? "있음" : "없음",
      inner.length ? `${inner[0].name} +${inner[0].scrollHeight - inner[0].clientHeight}${inner.length > 1 ? ` 외 ${inner.length - 1}` : ""}` : "없음",
      r.stateCheck === "OK" ? "OK" : "다름",
      String(r.errors.length),
    ]);
  }
  const width = (s) => [...String(s)].reduce((w, ch) => w + (/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/.test(ch) ? 2 : 1), 0);
  const cols = rows[0].map((_, i) => Math.max(...rows.map((row) => width(row[i]))));
  for (const row of rows) console.log("  " + row.map((c, i) => String(c) + " ".repeat(cols[i] - width(c))).join("  "));
  const failed = results.filter((r) => r.failed).length;
  console.log(`  ${results.length - failed}/${results.length} 캡처 완료`);
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
