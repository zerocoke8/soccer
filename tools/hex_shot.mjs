#!/usr/bin/env node
// tools/hex_shot.mjs — 육각 경기 화면 (H1) 스크린샷 · 연기 시험 도구 (docs/HEX_AUTOBATTLE_PLAN.md §6.5). npm test 에는 넣지 않는다.
//
//   node tools/hex_shot.mjs <outDir> [--gpu] [--frames 4] [--gap 1500] [--sizes 1280x720,915x412] [--goal] [--keep-open]
//
// 1) 내장 정적 서버 (tools/shot.mjs startServer) 로 프로젝트 루트를 띄운다.
// 2) puppeteer-core + 로컬 Chrome (shot.mjs findBrowser) 을 headless 로 띄운다. --gpu 가 없으면 소프트웨어 WebGL
//    (--use-angle=swiftshader --enable-unsafe-swiftshader — 기기 GPU 와 상관없이 같은 그림). 프로필은 os.tmpdir() 아래 임시 폴더 (끝나면 지운다).
// 3) 크기마다 새 브라우저 문맥으로 /index.html?hex=1&auto=1 을 연다 (915×412 는 휴대폰처럼 isMobile · hasTouch · DPR 2.625).
//    [새 런 시작] → [기본 편성으로 시작] → window.__soccer 의 manager.autoStep 으로 친선전을 고를 수 있는 주까지 → actions.weekAction(friendly)
//    → .hex-screen canvas 와 window.__soccer.hexView.renderer === 'webgl' 을 기다린다.
// 4) 프레임 N 장을 ~gap ms 간격으로 찍는다 (<outDir>/<size>-<n>.png). 장마다 hexView 디버그 (turn · cam · score) 를 적고
//    시계가 흐르는지 (turn 증가) · 캔버스 크기 = .hx-pitch · HUD 요소가 화면 안에 보이는지 검사한다.
//    --goal: 4배속으로 첫 골까지 돌려 골 장면을 몇 장 더 찍는다 (<size>-goal-<n>.png).
//    배너 검사: 배너 (.hx-banner) 에 골 · 단계 · 승부차기 꾸밈 클래스를 잠깐 붙여 크기 · 자리 · 배경을 잰다 — 화면 안 · 경기장보다 작게 · 배경 없음
//    (전역 클래스와 겹쳐 배너가 큰 상자로 바뀌는 일을 잡는다 — 예: 예전 'stage' 꾸밈 = base.css .stage 1280×720).
// 5) [⏭] → 결과 모달 캡처 (<size>-result.png) → [확인] → 런이 match phase 를 떠났는지 · store.hexMatch null · KEYS.hexMatch 비었는지 · 캔버스가 사라졌는지.
// 6) pageerror · console.error · 실패한 요청 · 400 이상 응답을 모아 요약을 찍는다. 하나라도 있거나 검사가 실패하면 exit 1.
//
// Chrome 경로: CHROME_PATH 환경변수 → 기본 설치 경로 (shot.mjs findBrowser). 없으면 안내 후 exit 0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, findBrowser } from "./shot.mjs";
import { KEYS } from "../js/ui/store.js";

const PHONE = { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };

/* ------------------------------------------------------------------ */
/* 인자                                                                  */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "usage: node tools/hex_shot.mjs <outDir> [options]",
    "  --gpu              하드웨어 WebGL (기본: SwiftShader 소프트웨어 WebGL)",
    "  --frames N         경기 프레임 캡처 수 (기본 4)",
    "  --gap MS           프레임 간격 (기본 1500)",
    "  --sizes WxH,…      뷰포트 (기본 1280x720,915x412 — 915×412 는 휴대폰: isMobile · hasTouch · DPR 2.625)",
    "  --goal             첫 골까지 4배속으로 돌려 골 장면도 찍는다 (<size>-goal-<n>.png)",
    "  환경변수 CHROME_PATH 로 브라우저 실행 파일 지정",
  ].join("\n");
}

export function parseArgs(argv) {
  const o = { outDir: null, gpu: false, frames: 4, gap: 1500, sizes: ["1280x720", "915x412"], goal: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v == null) throw new Error(`${a} 에 값이 없습니다`);
      return v;
    };
    if (a === "--gpu") o.gpu = true;
    else if (a === "--goal") o.goal = true;
    else if (a === "--frames") o.frames = Math.max(1, Math.round(Number(val())) || 4);
    else if (a === "--gap") o.gap = Math.max(100, Math.round(Number(val())) || 1500);
    else if (a === "--sizes") o.sizes = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!o.outDir) o.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  for (const s of o.sizes) if (!/^\d+x\d+$/.test(s)) throw new Error(`--sizes 형식: WxH (받은 값 ${s})`);
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 페이지 쪽                                                              */
/* ------------------------------------------------------------------ */

async function clickText(page, text, root = "") {
  return page.evaluate((t, r) => {
    const b = [...document.querySelectorAll(`${r} button`)].find((x) => (x.textContent || "").trim().includes(t) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, text, root);
}

/** 친선전 run 경기까지 (ui.smoke 와 같은 길: 자유 주까지 autoStep → weekAction friendly) */
async function enterFriendly(page) {
  return page.evaluate(() => {
    const S = window.__soccer;
    const playMatch = (setup) => {
      const ms0 = S.match.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
      S.match.simulateAuto(ms0, S.store.data);
      return S.match.getResult(ms0);
    };
    const open = (st) => st.phase === "week" && st.weekOffer?.kind === "free" && st.weekOffer.actions.includes("friendly");
    let n = 0;
    for (; n < 3000 && !open(S.store.run) && S.store.run.phase !== "finished"; n++) S.manager.autoStep(S.store.run, S.store.data, { playMatch });
    if (!open(S.store.run)) return { ok: false, phase: S.store.run.phase, n };
    S.render();
    S.actions.weekAction({ type: "friendly" });
    return { ok: true, n, phase: S.store.run.phase };
  });
}

/** 화면 검사: 캔버스 크기 · HUD 요소가 뷰포트 안에 보이는가 · 가로 스크롤 */
async function inspect(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const vis = (el) => {
      if (!el) return { ok: false, why: "없음" };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const inView = r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      const shown = cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05;
      return { ok: inView && shown, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 40) };
    };
    const cv = q(".hex-screen .hx-pitch canvas");
    const pitch = q(".hex-screen .hx-pitch");
    const cr = cv?.getBoundingClientRect();
    const pr = pitch?.getBoundingClientRect();
    const clip = (el) => (el ? el.scrollWidth > el.clientWidth + 1 : false);
    return {
      canvas: cv ? { w: cv.width, h: cv.height, css: [Math.round(cr.width), Math.round(cr.height)], pitch: [Math.round(pr.width), Math.round(pr.height)], match: Math.abs(cr.width - pr.width) < 2 && Math.abs(cr.height - pr.height) < 2 } : null,
      hud: {
        home: vis(q(".hex-screen .mh-team.home .nm")),
        away: vis(q(".hex-screen .mh-team.away .nm")),
        score: vis(q(".hex-screen .mh-score")),
        sub: vis(q(".hex-screen .mh-sub")),
        clock: vis(q(".hex-screen .hx-clock")),
        speed: vis(q(".hex-screen .speed-btn")),
        skip: vis(q(".hex-screen .skip-btn")),
      },
      clipped: { home: clip(q(".hex-screen .mh-team.home .nm")), away: clip(q(".hex-screen .mh-team.away .nm")), sub: clip(q(".hex-screen .mh-sub")) },
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
      name: (() => { const n = q(".hex-screen .hx-name"); return n && !n.hidden ? vis(n) : null; })(),
      dbg: JSON.parse(JSON.stringify(window.__soccer.hexView || null)),
    };
  });
}

/** 배너 꾸밈마다 잠깐 붙여 재고 되돌린다 (한 evaluate 안 — 화면 루프와 섞이지 않는다) */
async function probeBanners(page) {
  return page.evaluate(() => {
    const b = document.querySelector(".hex-screen .hx-banner");
    const pitch = document.querySelector(".hex-screen .hx-pitch");
    if (!b || !pitch) return { error: "배너 · 경기장 없음" };
    const txt = b.querySelector(".hx-banner-txt");
    const sub = b.querySelector(".hx-banner-sub");
    const keep = { cls: b.className, txt: txt.textContent, sub: sub.textContent };
    const pr = pitch.getBoundingClientRect();
    const out = [];
    for (const [cls, t, st] of [
      ["hx-banner hx-show hx-goal hx-home", "골!", "선수 · 1 : 0"],
      ["hx-banner hx-show hx-stage", "골든골", "먼저 넣는 쪽이 이긴다"],
      ["hx-banner hx-show hx-stage", "승부차기", ""],
      ["hx-banner hx-show hx-pk hx-away hx-miss", "실패", "선수 · 승부차기 2 : 3"],
    ]) {
      b.className = cls;
      txt.textContent = t;
      sub.textContent = st;
      const r = b.getBoundingClientRect();
      const tr = txt.getBoundingClientRect();
      const bg = getComputedStyle(b).backgroundColor;
      const inView = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && tr.top >= pr.top - 1 && tr.bottom <= pr.bottom + 1;
      const small = r.width < pr.width * 0.8 && r.height < pr.height * 0.5;
      const clear = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      out.push({ cls, text: t, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], bg, ok: inView && small && clear });
    }
    b.className = keep.cls;
    txt.textContent = keep.txt;
    sub.textContent = keep.sub;
    return { list: out };
  });
}

/* ------------------------------------------------------------------ */
/* 한 크기                                                                */
/* ------------------------------------------------------------------ */

async function runSize(browser, baseUrl, size, opts) {
  const [w, h] = size.split("x").map(Number);
  const phone = size === "915x412" || (w <= 1000 && h <= 500);
  const viewport = phone ? { width: w, height: h, ...PHONE } : { width: w, height: h, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const out = { size, viewport, files: [], frames: [], checks: [], errors: [] };
  const fail = (msg) => out.checks.push({ ok: false, msg });
  const pass = (msg) => out.checks.push({ ok: true, msg });
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => out.errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") out.errors.push(`console.error: ${m.text()}`); });
    page.on("requestfailed", (r) => out.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
    page.on("response", (r) => { if (r.status() >= 400) out.errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    await page.setViewport(viewport);
    await page.goto(`${baseUrl}/index.html?hex=1&auto=1`, { waitUntil: "load" });
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("새 런 시작")), { timeout: 15000 });
    await clickText(page, "새 런 시작");
    await page.waitForFunction(() => window.__soccer?.store?.screen === "setup", { timeout: 8000 });
    if (!(await clickText(page, "기본 편성으로 시작"))) throw new Error("[기본 편성으로 시작] 버튼이 없습니다");
    await page.waitForFunction(() => window.__soccer.store.screen === "run" && window.__soccer.store.run, { timeout: 8000 });
    const ent = await enterFriendly(page);
    if (!ent.ok) throw new Error(`친선전 주를 찾지 못했습니다 (phase ${ent.phase}, ${ent.n} 걸음)`);
    await page.waitForFunction(() => window.__soccer.store.run?.phase === "match" && document.querySelector(".hex-screen"), { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector(".hex-screen canvas") && window.__soccer.hexView?.renderer && window.__soccer.hexView.renderer !== "pending", { timeout: 15000 });
    const renderer = await page.evaluate(() => window.__soccer.hexView.renderer);
    if (renderer === "webgl") pass("renderer webgl"); else fail(`renderer = ${renderer} (webgl 이어야 한다)`);
    await sleep(400); // 얼굴 그림 · 첫 그리기

    // 프레임
    for (let i = 0; i < opts.frames; i++) {
      if (i) await sleep(opts.gap);
      const file = path.join(opts.outDir, `${size}-${i}.png`);
      await page.screenshot({ path: file });
      const ins = await inspect(page);
      out.files.push(file);
      out.frames.push({ file, turn: ins.dbg?.turn, stage: ins.dbg?.stage, score: ins.dbg?.score, cam: ins.dbg?.cam, fps: ins.dbg?.fps, clock: ins.hud.clock.text, name: ins.name?.text ?? null });
      if (i === 0) {
        if (ins.canvas?.match) pass(`캔버스 = .hx-pitch (${ins.canvas.css.join("×")}, 버퍼 ${ins.canvas.w}×${ins.canvas.h})`);
        else fail(`캔버스 크기가 .hx-pitch 와 다르다: ${JSON.stringify(ins.canvas)}`);
        const bad = Object.entries(ins.hud).filter(([, v]) => !v.ok).map(([k, v]) => `${k} ${JSON.stringify(v)}`);
        if (bad.length) fail(`HUD 가 화면 밖 · 안 보임: ${bad.join("; ")}`); else pass("HUD (이름 · 점수 · 보조 줄 · 시계 · 배속 · ⏭) 보임");
        const cl = Object.entries(ins.clipped).filter(([, v]) => v).map(([k]) => k);
        if (cl.length) fail(`HUD 글자 잘림: ${cl.join(", ")}`);
        if (ins.hscroll) fail("가로 스크롤이 생겼다");
      }
      if (ins.name && !ins.name.ok) fail(`이름표가 화면 밖: ${JSON.stringify(ins.name)}`);
    }
    const turns = out.frames.map((f) => f.turn);
    if (turns.length > 1 && turns.every((t, i) => !i || t > turns[i - 1])) pass(`경기가 흐른다 (turn ${turns.join(" → ")}, 시계 ${out.frames.map((f) => f.clock).join(" → ")})`);
    else if (turns.length > 1) fail(`turn 이 늘지 않는다: ${turns.join(", ")}`);
    // 카메라 떨림: 2초 동안 매 프레임 cam 을 떠서 한 프레임 이동량 · 방향 뒤집힘을 본다
    const camProbe = await page.evaluate(() => new Promise((resolve) => {
      const pts = [];
      const t0 = performance.now();
      const tick = () => {
        const c = window.__soccer.hexView?.cam;
        if (c) pts.push([c.cx, c.cy, c.z]);
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else resolve(pts);
      };
      requestAnimationFrame(tick);
    }));
    {
      let maxStep = 0;
      let flips = 0;
      for (let i = 1; i < camProbe.length; i++) {
        const [x0, y0] = camProbe[i - 1];
        const [x1, y1, z1] = camProbe[i];
        maxStep = Math.max(maxStep, Math.hypot(x1 - x0, y1 - y0) * z1);
        if (i > 1) {
          const [xa, ya] = camProbe[i - 2];
          const d0 = [x0 - xa, y0 - ya];
          const d1 = [x1 - x0, y1 - y0];
          if (Math.hypot(...d0) > 0.5 && Math.hypot(...d1) > 0.5 && d0[0] * d1[0] + d0[1] * d1[1] < 0) flips += 1;
        }
      }
      out.cam = { samples: camProbe.length, maxStep: Math.round(maxStep * 10) / 10, flips };
      if (maxStep > 30 || flips > 2) fail(`카메라가 튄다 (한 프레임 최대 ${out.cam.maxStep}px · 방향 뒤집힘 ${flips}번 / ${camProbe.length} 프레임)`);
      else pass(`카메라 부드러움 (한 프레임 최대 ${out.cam.maxStep}px · 뒤집힘 ${flips} / ${camProbe.length} 프레임)`);
    }
    {
      const pb = await probeBanners(page);
      if (pb.error) fail(`배너 검사: ${pb.error}`);
      else {
        const bad = pb.list.filter((x) => !x.ok);
        if (bad.length) fail(`배너가 화면 밖 · 너무 큼 · 배경 있음: ${JSON.stringify(bad)}`);
        else pass(`배너 ${pb.list.length}가지 (골 · 골든골 · 승부차기 · PK) 화면 안 · 작게 · 배경 없음`);
      }
    }
    const zs = out.frames.map((f) => f.cam?.z ?? 1);
    if (zs.some((z) => z > 1.05)) pass(`카메라 따라가기 (z ${zs.map((z) => z.toFixed(2)).join(", ")})`);
    else fail(`카메라가 확대하지 않았다 (z ${zs.join(", ")})`);

    // 골 장면 (선택)
    if (opts.goal) {
      await page.evaluate(() => { window.__soccer.store.matchUi.speed = 4; });
      const ok = await page.waitForFunction(() => { const d = window.__soccer.hexView; return d && (d.score.home + d.score.away > 0 || d.finished); }, { timeout: 120000, polling: 16 }).then(() => true, () => false);
      if (ok) {
        for (const [i, ms] of [[0, 60], [1, 250], [2, 400], [3, 500]]) {
          await sleep(ms);
          const file = path.join(opts.outDir, `${size}-goal-${i}.png`);
          await page.screenshot({ path: file });
          out.files.push(file);
          const d = await page.evaluate(() => window.__soccer.hexView);
          out.frames.push({ file, turn: d?.turn, stage: d?.stage, score: d?.score, cam: d?.cam });
        }
        await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; });
      } else fail("2분 안에 골이 나지 않았다 (--goal)");
    }

    // ⏭ → 결과 → 확인
    if (!(await page.evaluate(() => { const b = document.querySelector(".hex-screen .skip-btn"); if (!b || b.disabled) return false; b.click(); return true; }))) {
      fail("⏭ 버튼을 누를 수 없다");
    }
    const modal = await page.waitForFunction(() => document.querySelector("#modal-root .score-big"), { timeout: 6000 }).then(() => true, () => false);
    if (!modal) throw new Error("⏭ 뒤 결과 모달이 열리지 않았다");
    await sleep(500);
    const rfile = path.join(opts.outDir, `${size}-result.png`);
    await page.screenshot({ path: rfile });
    out.files.push(rfile);
    const res = await page.evaluate(() => ({
      score: document.querySelector("#modal-root .score-big")?.textContent,
      verdict: document.querySelector("#modal-root .result-verdict")?.textContent,
      rows: document.querySelectorAll("#modal-root .stats-table tbody tr").length,
      modalFits: (() => { const m = document.querySelector("#modal-root .modal"); if (!m) return null; const r = m.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && m.scrollHeight <= m.clientHeight + 1; })(),
    }));
    out.result = res;
    if (res.rows >= 7) pass(`결과 모달 ${res.score} ${res.verdict} · 표 ${res.rows}줄`); else fail(`결과 표 줄 수 ${res.rows}`);
    if (res.modalFits === false) fail("결과 모달이 화면에 다 들어가지 않는다 (스크롤 · 잘림)");
    if (!(await clickText(page, "확인", "#modal-root"))) throw new Error("결과 모달의 [확인] 이 없다");
    const left = await page.waitForFunction(() => window.__soccer.store.run?.phase !== "match", { timeout: 6000 }).then(() => true, () => false);
    const after = await page.evaluate((key) => ({
      phase: window.__soccer.store.run?.phase, hexMatch: window.__soccer.store.hexMatch, saved: localStorage.getItem(key),
      canvas: !!document.querySelector("canvas"), screen: document.querySelector("#app > .screen")?.dataset?.screen ?? null,
    }), KEYS.hexMatch);
    out.after = after;
    if (left && after.hexMatch == null && after.saved == null && !after.canvas) pass(`런 계속 (phase ${after.phase}, hexMatch · 저장 비움, 캔버스 정리)`);
    else fail(`확인 뒤 상태가 이상하다: ${JSON.stringify(after)}`);
    await sleep(300);
  } catch (e) {
    fail(`예외: ${e && e.message ? e.message : e}`);
  } finally {
    await context.close().catch(() => {});
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* main                                                                  */
/* ------------------------------------------------------------------ */

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (opts.help || !opts.outDir) {
    console.log(usage());
    if (!opts.help) process.exitCode = 2;
    return;
  }
  opts.outDir = path.resolve(opts.outDir);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const browserInfo = findBrowser();
  if (!browserInfo) {
    console.log("Chrome/Edge 를 찾지 못했습니다 — CHROME_PATH 환경변수로 지정하세요. (건너뜀)");
    return;
  }
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e) {
    console.error("puppeteer-core 가 없습니다 — npm install 후 다시 실행하세요.");
    process.exitCode = 1;
    return;
  }
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "hex-shot-"));
  const args = ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--lang=ko-KR"];
  if (!opts.gpu) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  const browser = await puppeteer.launch({ executablePath: browserInfo.path, headless: true, userDataDir: udd, args });
  const results = [];
  try {
    const gl = await (async () => {
      const p = await browser.newPage();
      try {
        return await p.evaluate(() => {
          const c = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
          const ext = c && c.getExtension("WEBGL_debug_renderer_info");
          return c ? (ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "webgl") : "없음";
        });
      } finally {
        await p.close();
      }
    })();
    console.log(`브라우저 ${browserInfo.path} (${browserInfo.source}) · ${opts.gpu ? "GPU" : "SwiftShader"} · WebGL: ${gl}`);
    for (const size of opts.sizes) results.push(await runSize(browser, baseUrl, size, opts));
  } finally {
    await browser.close().catch(() => {});
    server.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(udd, { recursive: true, force: true }); break; } catch { await sleep(300); } // Windows: 브라우저가 파일을 늦게 놓는다
    }
  }

  let bad = 0;
  for (const r of results) {
    console.log(`\n== ${r.size} (${r.viewport.isMobile ? `휴대폰 DPR ${r.viewport.deviceScaleFactor}` : "데스크톱 DPR 1"})`);
    for (const f of r.frames) console.log(`  ${path.basename(f.file)}  turn ${f.turn} ${f.stage ?? ""} ${f.clock ? `시계 ${f.clock}` : ""} 점수 ${f.score ? `${f.score.home}:${f.score.away}` : "-"} cam z ${f.cam ? f.cam.z.toFixed(2) : "-"}${f.name ? ` 이름표 ${f.name}` : ""}${f.fps ? ` fps ${f.fps}` : ""}`);
    if (r.result) console.log(`  ${r.size}-result.png  ${r.result.score} ${r.result.verdict}`);
    for (const c of r.checks) console.log(`  ${c.ok ? "OK  " : "FAIL"} ${c.msg}`);
    for (const e of r.errors) console.log(`  ERR  ${e}`);
    const n = r.checks.filter((c) => !c.ok).length + r.errors.length;
    bad += n;
  }
  console.log(`\n${bad ? `실패 ${bad}건` : "통과"} — ${results.map((r) => `${r.size}: ${r.files.length}장`).join(", ")} → ${opts.outDir}`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
