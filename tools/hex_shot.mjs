#!/usr/bin/env node
// tools/hex_shot.mjs — 육각 경기 화면 (H1) 스크린샷 · 연기 시험 도구 (docs/HEX_AUTOBATTLE_PLAN.md §6.5). npm test 에는 넣지 않는다.
//
//   node tools/hex_shot.mjs <outDir> [--gpu] [--frames 4] [--gap 1500] [--sizes 1280x720,915x412] [--goal] [--practice] [--seed h2-7] [--hunt-ms 90000]
//
// 1) 내장 정적 서버 (tools/shot.mjs startServer) 로 프로젝트 루트를 띄운다.
// 2) puppeteer-core + 로컬 Chrome (shot.mjs findBrowser) 을 headless 로 띄운다. --gpu 가 없으면 소프트웨어 WebGL
//    (--use-angle=swiftshader --enable-unsafe-swiftshader — 기기 GPU 와 상관없이 같은 그림). 프로필은 os.tmpdir() 아래 임시 폴더 (끝나면 지운다).
// 3) 크기마다 새 브라우저 문맥으로 /index.html?hex=1&auto=1 을 연다 (915×412 는 휴대폰처럼 isMobile · hasTouch · DPR 2.625).
//    [새 런 시작] → [기본 편성으로 시작] → window.__soccer 의 manager.autoStep 으로 친선전을 고를 수 있는 주까지 → actions.weekAction(friendly)
//    → .hex-screen canvas 와 window.__soccer.hexView.renderer === 'webgl' 을 기다린다.
//    --practice: 런 대신 시작 화면 [⚽ 연습 경기] (회상 바로 아래인지 검사) → 기본 선수단 vs 거울 사본 (실루엔 · 아델린이 양쪽에).
//      스프라이트 (실루엔 시트 10장 · 아델린 정지 그림) 가 다 올라올 때까지 기다리고 양쪽 실루엔이 스프라이트로 그려지는지 본다.
//      경기 시드는 --seed (기본 h2-7 — 4턴 원정 실루엔 태클 실패 · 67턴 홈 실루엔 골: 동작이 일찍 다 나온다, 'random' = 화면이 고른 시드).
//      연습 경기는 동작 사냥 (아래) 을 먼저 하고 그다음 프레임 N 장 · 골 장면을 찍는다.
// 4) 프레임 N 장을 ~gap ms 간격으로 찍는다 (<outDir>/<size>-<n>.png). 장마다 hexView 디버그 (turn · cam · score) 를 적고
//    시계가 흐르는지 (turn 증가) · 캔버스 크기 = .hx-pitch · HUD 요소가 화면 안에 보이는지 검사한다.
//    --goal: 4배속으로 첫 골까지 돌려 골 장면을 몇 장 더 찍는다 (<size>-goal-<n>.png).
//    배너 검사: 배너 (.hx-banner) 에 골 · 단계 · 승부차기 꾸밈 클래스를 잠깐 붙여 크기 · 자리 · 배경을 잰다 — 화면 안 · 경기장보다 작게 · 배경 없음
//    (전역 클래스와 겹쳐 배너가 큰 상자로 바뀌는 일을 잡는다 — 예: 예전 'stage' 꾸밈 = base.css .stage 1280×720).
//    --practice 동작 사냥: 실루엔 동작 (run · dribble · pass · kick · tackle · fall · celebrate · header · block) 마다 처음 보이는 순간
//      (한 번 동작은 재생이 40 % 넘게 간 칸) 에 화면 루프 시계를 멈추고 (rAF 가상 시간 배율 0) 찍는다 → <size>-act-<동작>.png.
//      그 장면의 실루엔을 카메라 좌표로 잘라 확대한 사진도 → <size>-act-<동작>-zoom.png. 못 본 동작은 요약에 적는다 (실패 아님 — 경기마다 다르다).
// 5) [⏭] → 결과 모달 캡처 (<size>-result.png) → [확인] → 런이 match phase 를 떠났는지 · store.hexMatch null · KEYS.hexMatch 비었는지 · 캔버스가 사라졌는지.
//    --practice: [다시 하기] → 새 경기 (시드가 바뀌고 turn 0) → [⏭] → [확인] → 시작 화면 · store.practiceMatch null · 런 없음 · KEYS.hexMatch 비었는지 · 캔버스 정리.
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
    "  --practice         런 대신 시작 화면 [⚽ 연습 경기] (실루엔 · 아델린이 양쪽) — 동작마다 멈춰 찍기 (<size>-act-<동작>.png)",
    "  --seed S           --practice 경기 시드 (기본 h2-7, random = 화면이 고른 시드)",
    "  --hunt-ms MS       --practice 동작 사냥 최대 시간 (화면 시계 기준, 기본 90000)",
    "  환경변수 CHROME_PATH 로 브라우저 실행 파일 지정",
  ].join("\n");
}

export function parseArgs(argv) {
  const o = { outDir: null, gpu: false, frames: 4, gap: 1500, sizes: ["1280x720", "915x412"], goal: false, practice: false, seed: "h2-7", huntMs: 90000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v == null) throw new Error(`${a} 에 값이 없습니다`);
      return v;
    };
    if (a === "--gpu") o.gpu = true;
    else if (a === "--goal") o.goal = true;
    else if (a === "--practice") o.practice = true;
    else if (a === "--seed") o.seed = val();
    else if (a === "--hunt-ms") o.huntMs = Math.max(1000, Math.round(Number(val())) || 90000);
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

/* ---- --practice ---- */

/** 실루엔 (움직이는 스프라이트) · 아델린 (정지 스프라이트) */
const ANIM_CHAR = "ch_elf_playmaker";
const STATIC_CHAR = "ch_human_captain";
/** 동작 사냥: 꼭 볼 동작 · 보이면 찍는 동작 */
const HUNT_NEED = ["run", "dribble", "pass", "kick", "tackle", "fall", "celebrate"];
const HUNT_EXTRA = ["header", "block"];
/** 가상 시간 배율 — '멈춤' (0 이 아니라 아주 작게: 화면 루프 dt > 0 이라 카메라도 그 자리) */
const FREEZE = 1e-6;
/** 동작 사냥 중 가상 시간 배율 (1배속 경기를 두 배 빨리 — 화면 루프 dt 상한 100 ms 안) */
const HUNT_SCALE = 2;

/** 디버그 값 → 움직이는 스프라이트 선수 동작 한 줄 ("home run, away idle") */
function actLine(d) {
  const s = (d?.sprites || []).filter((x) => x.kind === "anim").map((x) => `${x.key.split(":")[0]} ${x.act}`).join(", ");
  return s || undefined;
}

/**
 * rAF 가상 시간 (문서마다 처음에): window.__hexClock.scale 배로 시간이 흐른다 (1 = 그대로).
 * 동작 사냥 window.__hunt = { on, want: [동작], seen: {}, hit: null } 이 켜져 있으면 매 프레임 (화면 루프 뒤) hexView.sprites 를 보고
 * 실루엔이 아직 못 본 동작을 충분히 (반복 150 ms · 한 번 동작 40 % · 넘어짐 · 세리머니 60 %) 재생 중이고 화면 안이면 시간을 멈추고 hit 에 적는다.
 */
function installClock(page) {
  return page.evaluateOnNewDocument((animChar, freeze) => {
    const real = window.requestAnimationFrame.bind(window);
    const clock = { scale: 1, virt: 0, last: null };
    window.__hexClock = clock;
    const check = () => {
      const hu = window.__hunt;
      if (!hu || hu.hit || !hu.on) return;
      const d = window.__soccer?.hexView;
      const list = d?.sprites;
      if (!list || d.finished) return;
      const cv = document.querySelector(".hex-screen .hx-pitch canvas");
      if (!cv) return;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      for (const sp of list) {
        if (sp.charId !== animChar || sp.kind !== "anim" || hu.seen[sp.act] || !hu.want.includes(sp.act)) continue;
        const hold = sp.act === "fall" || sp.act === "celebrate";
        const loop = sp.act === "run" || sp.act === "dribble" || sp.act === "idle";
        const ready = loop ? sp.t >= 150 : sp.dur > 0 && sp.t / sp.dur >= (hold ? 0.6 : 0.4);
        const b = sp.box;
        const inView = b && b[2] > 4 && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H;
        if (!ready || !inView) continue;
        clock.scale = freeze;
        hu.hit = { ...sp, turn: d.turn, speed: d.speed, score: d.score, W, H };
        return;
      }
    };
    window.requestAnimationFrame = (cb) => real((t) => {
      if (clock.last == null) clock.last = t;
      clock.virt += (t - clock.last) * clock.scale;
      clock.last = t;
      cb(clock.virt);
      try { check(); } catch (_) { /* 디버그 값이 아직 없다 */ }
    });
  }, ANIM_CHAR, FREEZE);
}

/** localStorage 전부 (키 순서대로) — 연습 경기가 아무것도 쓰지 않았는지 비교 */
const storageDump = (page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

/** 시작 화면 [⚽ 연습 경기] → 육각 경기 · 스프라이트가 다 올라올 때까지 */
async function enterPractice(page, out, pass, fail, seed) {
  await page.waitForFunction(() => document.querySelector(".practice-btn"), { timeout: 15000 });
  const btn = await page.evaluate(() => {
    const b = document.querySelector(".practice-btn");
    const prev = b.previousElementSibling;
    const hasRec = !!document.querySelector(".recollection-btn");
    return {
      text: (b.textContent || "").trim(),
      prev: prev ? prev.className : null,
      ok: hasRec ? !!prev?.classList.contains("recollection-btn") : !!prev?.classList.contains("challenge-btn"),
      hasRec,
    };
  });
  if (btn.ok && btn.text.includes("연습 경기")) pass(`[⚽ 연습 경기] 버튼 = ${btn.hasRec ? "회상" : "도전 모드"} 바로 아래 (${btn.text})`);
  else fail(`연습 경기 버튼 자리 · 글자: ${JSON.stringify(btn)}`);
  out.storageBefore = await storageDump(page);
  await page.evaluate(() => document.querySelector(".practice-btn").click());
  await page.waitForFunction(() => window.__soccer?.store?.screen === "practice" && document.querySelector(".hex-screen"), { timeout: 8000 });
  // 정한 시드로 다시 (같은 경기 = 같은 장면 — 화면 시드는 연습마다 새로라서)
  if (seed && seed !== "random") await page.evaluate((sd) => { const S = window.__soccer; S.store.practiceSeed = sd; S.store.practiceMatch = null; S.render(); }, seed);
  await page.waitForFunction(() => document.querySelector(".hex-screen canvas") && window.__soccer.hexView?.renderer && window.__soccer.hexView.renderer !== "pending", { timeout: 15000 });
  const hud = await page.evaluate(() => ({
    sub: document.querySelector(".hex-screen .mh-sub")?.textContent || "",
    home: document.querySelector(".hex-screen .mh-team.home .nm")?.textContent || "",
    away: document.querySelector(".hex-screen .mh-team.away .nm")?.textContent || "",
    exits: [...document.querySelectorAll(".hex-screen .m-exits button")].map((b) => b.textContent.trim()),
    seed: window.__soccer.store.practiceSeed,
  }));
  out.practice = { seed: hud.seed };
  if (hud.sub.includes("연습 경기") && hud.away.includes("연습 상대") && hud.exits.includes("나가기")) pass(`연습 경기 HUD (${hud.home} vs ${hud.away} · ${hud.sub.trim()} · [${hud.exits.join("·")}])`);
  else fail(`연습 경기 HUD: ${JSON.stringify(hud)}`);
  // 스프라이트: 실루엔 시트 전부 · 아델린 정지 그림이 양쪽에 (view.stats 는 30 프레임마다)
  const ready = await page.waitForFunction((ac, sc) => {
    const d = window.__soccer.hexView;
    const c = d?.tex?.chars;
    const sp = d?.sprites || [];
    return !!(c && c[ac]?.kind === "anim" && c[ac].acts.length >= 10 && c[sc]?.kind === "static"
      && sp.filter((x) => x.charId === ac && x.kind === "anim").length === 2 && sp.filter((x) => x.charId === sc && x.kind === "static").length === 2);
  }, { timeout: 25000, polling: 100 }, ANIM_CHAR, STATIC_CHAR).then(() => true, () => false);
  const st = await page.evaluate(() => ({ tex: window.__soccer.hexView?.tex, sprites: window.__soccer.hexView?.sprites }));
  out.tex = st.tex;
  const keys = (st.sprites || []).map((x) => `${x.key}=${x.kind}`);
  if (ready) pass(`스프라이트: 실루엔 양쪽 움직임 (시트 ${st.tex.chars[ANIM_CHAR].acts.length}장) · 아델린 양쪽 정지 그림 [${keys.join(", ")}] · 텍스처 ${st.tex.textures}개 ${(st.tex.bytes / 1048576).toFixed(1)} MB`);
  else fail(`스프라이트가 다 올라오지 않았다: ${JSON.stringify(st.tex?.chars)} [${keys.join(", ")}]`);
}

/** 동작 사냥 (머리 주석 4 --practice) — 못 본 동작은 note (경기마다 다르다) */
async function huntActs(page, size, opts, out, pass) {
  const want = [...HUNT_NEED, ...HUNT_EXTRA];
  const seen = {};
  await page.evaluate((w, k) => {
    window.__soccer.store.matchUi.speed = 1;
    window.__hunt = { on: true, want: w, seen: {}, hit: null };
    window.__hexClock.scale = k;
  }, want, HUNT_SCALE);
  const t0 = await page.evaluate(() => window.__hexClock.virt);
  let fast = false;
  for (;;) {
    const st = await page.evaluate(() => ({ hit: window.__hunt.hit, virt: window.__hexClock.virt, fin: !!window.__soccer.hexView?.finished }));
    if (st.hit) {
      const hit = st.hit;
      await sleep(150); // 멈춘 그림이 한 번 더 그려지게
      const file = path.join(opts.outDir, `${size}-act-${hit.act}.png`);
      await page.screenshot({ path: file });
      out.files.push(file);
      // 그 선수를 잘라 확대 (발밑 · 공 · 방향을 자세히)
      // 상자는 캔버스 CSS px (변환 전) — 휴대폰은 스테이지 전체를 CSS 로 줄이므로 화면 px = 상자 × (보이는 폭 / clientWidth)
      const cr = await page.evaluate(() => { const c = document.querySelector(".hex-screen .hx-pitch canvas"); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, r.width / (c.clientWidth || r.width)]; });
      const now = await page.evaluate((k) => (window.__soccer.hexView?.sprites || []).find((x) => x.key === k), hit.key);
      const b = ((now && now.box) || hit.box).map((v) => v * cr[4]);
      const zw = Math.min(cr[2], Math.max(b[3] * 2.2, 160));
      const zh = Math.min(cr[3], zw * 0.75);
      const zx = Math.min(cr[0] + cr[2] - zw, Math.max(cr[0], cr[0] + b[0] + b[2] / 2 - zw / 2));
      const zy = Math.min(cr[1] + cr[3] - zh, Math.max(cr[1], cr[1] + b[1] + b[3] * 0.6 - zh / 2));
      const zfile = path.join(opts.outDir, `${size}-act-${hit.act}-zoom.png`);
      await page.screenshot({ path: zfile, clip: { x: zx, y: zy, width: zw, height: zh, scale: 2 } });
      out.files.push(zfile);
      seen[hit.act] = true;
      out.frames.push({ file, hunt: true, turn: hit.turn, score: hit.score, act: `${hit.act} ${hit.key} 칸 ${hit.frame} · ${hit.t}/${hit.dur} ms · 얼굴 ${hit.flip}${hit.want !== hit.act ? ` (frame 동작 ${hit.want})` : ""}` });
      await page.evaluate((a, k) => { window.__hunt.seen[a] = true; window.__hunt.hit = null; window.__hexClock.scale = k; }, hit.act, HUNT_SCALE);
      continue;
    }
    if (HUNT_NEED.every((a) => seen[a])) break;
    if (st.fin || st.virt - t0 > opts.huntMs) break;
    // 세리머니만 남으면 2배속 (다음 골까지 빨리)
    if (!fast && HUNT_NEED.every((a) => seen[a] || a === "celebrate")) {
      fast = true;
      await page.evaluate(() => { window.__soccer.store.matchUi.speed = 2; });
    }
    await sleep(40);
  }
  await page.evaluate(() => { window.__hunt.on = false; window.__hexClock.scale = 1; window.__soccer.store.matchUi.speed = 1; });
  out.hunt = Object.keys(seen);
  const miss = HUNT_NEED.filter((a) => !seen[a]);
  const extra = HUNT_EXTRA.filter((a) => seen[a]);
  if (!miss.length) pass(`실루엔 동작 ${HUNT_NEED.length}가지 다 찍음${extra.length ? ` (+ ${extra.join(" · ")})` : ""}`);
  else out.notes.push(`실루엔 동작 못 봄: ${miss.join(" · ")} (이 경기에서는 — 실패 아님)${extra.length ? ` · 덤 ${extra.join(" · ")}` : ""}`);
}

/** 연습 경기 끝: [⏭] → 결과 → [다시 하기] → 새 경기 → [⏭] → [확인] → 시작 화면 */
async function finishPractice(page, size, opts, out, pass, fail) {
  const skip = () => page.evaluate(() => { const b = document.querySelector(".hex-screen .skip-btn"); if (!b || b.disabled) return false; b.click(); return true; });
  const modal = () => page.waitForFunction(() => document.querySelector("#modal-root .score-big"), { timeout: 6000 }).then(() => true, () => false);
  if (!(await skip())) fail("⏭ 버튼을 누를 수 없다");
  if (!(await modal())) throw new Error("⏭ 뒤 결과 모달이 열리지 않았다");
  await sleep(500);
  const rfile = path.join(opts.outDir, `${size}-result.png`);
  await page.screenshot({ path: rfile });
  out.files.push(rfile);
  const res = await page.evaluate(() => ({
    title: document.querySelector("#modal-root h2")?.textContent,
    score: document.querySelector("#modal-root .score-big")?.textContent,
    verdict: document.querySelector("#modal-root .result-verdict")?.textContent,
    rows: document.querySelectorAll("#modal-root .stats-table tbody tr").length,
    again: !!document.querySelector("#modal-root .again-btn"),
    modalFits: (() => { const m = document.querySelector("#modal-root .modal"); if (!m) return null; const r = m.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && m.scrollHeight <= m.clientHeight + 1; })(),
  }));
  out.result = res;
  if (res.rows >= 7 && res.title === "연습 경기 결과" && res.again) pass(`결과 모달 "${res.title}" ${res.score} ${res.verdict} · 표 ${res.rows}줄 · [다시 하기]`);
  else fail(`연습 결과 모달: ${JSON.stringify(res)}`);
  if (res.modalFits === false) fail("결과 모달이 화면에 다 들어가지 않는다 (스크롤 · 잘림)");
  // [다시 하기] → 새 시드 · 처음부터
  const seed0 = out.practice?.seed;
  await page.evaluate(() => document.querySelector("#modal-root .again-btn").click());
  const again = await page.waitForFunction((s0) => {
    const S = window.__soccer.store;
    return S.screen === "practice" && S.practiceSeed && S.practiceSeed !== s0 && document.querySelector(".hex-screen canvas") && !document.querySelector("#modal-root .score-big");
  }, { timeout: 8000 }, seed0).then(() => true, () => false);
  const ag = await page.evaluate(() => ({ seed: window.__soccer.store.practiceSeed, turn: window.__soccer.store.practiceMatch?.turn ?? null }));
  if (again && (ag.turn ?? 0) <= 1) pass(`[다시 하기] → 새 경기 (시드 ${ag.seed}, turn ${ag.turn})`);
  else fail(`[다시 하기] 뒤: ${JSON.stringify({ again, ...ag, seed0 })}`);
  await page.waitForFunction(() => window.__soccer.hexView?.renderer === "webgl", { timeout: 15000 }).catch(() => {});
  await sleep(700);
  const afile = path.join(opts.outDir, `${size}-again.png`);
  await page.screenshot({ path: afile });
  out.files.push(afile);
  if (!(await skip())) fail("다시 하기 뒤 ⏭ 버튼을 누를 수 없다");
  if (!(await modal())) throw new Error("다시 하기 뒤 결과 모달이 열리지 않았다");
  await sleep(300);
  if (!(await clickText(page, "확인", "#modal-root"))) throw new Error("결과 모달의 [확인] 이 없다");
  const left = await page.waitForFunction(() => window.__soccer.store.screen === "start", { timeout: 6000 }).then(() => true, () => false);
  await sleep(300);
  const after = await page.evaluate(() => ({
    screen: window.__soccer.store.screen, practiceMatch: window.__soccer.store.practiceMatch, run: !!window.__soccer.store.run, hexMatch: window.__soccer.store.hexMatch,
    canvas: !!document.querySelector("canvas"),
  }));
  const same = (await storageDump(page)) === out.storageBefore;
  const mem = await page.evaluate(async () => { try { return (await import("/js/ui/hexPixi.js")).hexPixiMemory(); } catch (e) { return { error: String(e) }; } });
  out.after = { ...after, storage: same ? "같음" : "바뀜", mem };
  if (left && after.practiceMatch == null && !after.run && after.hexMatch == null && !after.canvas && same && mem.textures === 0)
    pass("[확인] → 시작 화면 (practiceMatch · 런 · hexMatch 없음, localStorage 그대로, 캔버스 · 텍스처 0)");
  else fail(`확인 뒤 상태가 이상하다: ${JSON.stringify(out.after)}`);
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
  const out = { size, viewport, files: [], frames: [], checks: [], errors: [], notes: [] };
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
    if (opts.practice) await installClock(page);
    await page.goto(`${baseUrl}/index.html?hex=1&auto=1`, { waitUntil: "load" });
    if (opts.practice) {
      await enterPractice(page, out, pass, fail, opts.seed);
      await huntActs(page, size, opts, out, pass);
    }
    else {
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("새 런 시작")), { timeout: 15000 });
      await clickText(page, "새 런 시작");
      await page.waitForFunction(() => window.__soccer?.store?.screen === "setup", { timeout: 8000 });
      if (!(await clickText(page, "기본 편성으로 시작"))) throw new Error("[기본 편성으로 시작] 버튼이 없습니다");
      await page.waitForFunction(() => window.__soccer.store.screen === "run" && window.__soccer.store.run, { timeout: 8000 });
      const ent = await enterFriendly(page);
      if (!ent.ok) throw new Error(`친선전 주를 찾지 못했습니다 (phase ${ent.phase}, ${ent.n} 걸음)`);
      await page.waitForFunction(() => window.__soccer.store.run?.phase === "match" && document.querySelector(".hex-screen"), { timeout: 8000 });
      await page.waitForFunction(() => document.querySelector(".hex-screen canvas") && window.__soccer.hexView?.renderer && window.__soccer.hexView.renderer !== "pending", { timeout: 15000 });
    }
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
      out.frames.push({ file, turn: ins.dbg?.turn, stage: ins.dbg?.stage, score: ins.dbg?.score, cam: ins.dbg?.cam, fps: ins.dbg?.fps, clock: ins.hud.clock.text, name: ins.name?.text ?? null, act: actLine(ins.dbg) });
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
    const flow = out.frames.filter((f) => !f.hunt); // 동작 사냥 사진 (멈춘 시계) 은 빼고
    const turns = flow.map((f) => f.turn);
    if (turns.length > 1 && turns.every((t, i) => !i || t > turns[i - 1])) pass(`경기가 흐른다 (turn ${turns.join(" → ")}, 시계 ${flow.map((f) => f.clock).join(" → ")})`);
    else if (turns.length > 1) fail(`turn 이 늘지 않는다: ${turns.join(", ")}`);
    // 카메라 떨림: 2초 동안 매 프레임 cam 을 떠서 한 프레임 이동량 · 방향 뒤집힘을 본다
    const camProbe = await page.evaluate(() => new Promise((resolve) => {
      const pts = [];
      const t0 = performance.now();
      const tick = () => {
        const d = window.__soccer.hexView;
        const c = d?.cam;
        if (c) pts.push([c.cx, c.cy, c.z, performance.now(), d.score.home + d.score.away]);
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else resolve(pts);
      };
      requestAnimationFrame(tick);
    }));
    {
      let maxStep = 0;
      let flips = 0;
      let goalAt = -Infinity;
      let goals = 0;
      for (let i = 1; i < camProbe.length; i++) {
        // 골 뒤 1.6 초 (골 장면 — 카메라가 일부러 전체로 빠르게 빠진다) 는 따라가기 떨림 잣대에서 뺀다
        if (camProbe[i][4] !== camProbe[i - 1][4]) { goalAt = camProbe[i][3]; goals += 1; }
        if (camProbe[i][3] - goalAt < 1600) continue;
        const [x0, y0, , t0] = camProbe[i - 1];
        const [x1, y1, z1, t1] = camProbe[i];
        // 60 fps 한 프레임 (16.7 ms) 으로 맞춘 이동량 — 헤드리스 (특히 휴대폰 DPR 2.625 SwiftShader) 프레임이 느려도 같은 잣대
        maxStep = Math.max(maxStep, (Math.hypot(x1 - x0, y1 - y0) * z1 * 16.7) / Math.max(16.7, t1 - t0));
        if (i > 1) {
          const [xa, ya] = camProbe[i - 2];
          const d0 = [x0 - xa, y0 - ya];
          const d1 = [x1 - x0, y1 - y0];
          if (Math.hypot(...d0) > 0.5 && Math.hypot(...d1) > 0.5 && d0[0] * d1[0] + d0[1] * d1[1] < 0) flips += 1;
        }
      }
      out.cam = { samples: camProbe.length, maxStep: Math.round(maxStep * 10) / 10, flips, goals };
      if (maxStep > 30 || flips > 2) fail(`카메라가 튄다 (60 fps 한 프레임 최대 ${out.cam.maxStep}px · 방향 뒤집힘 ${flips}번 / ${camProbe.length} 프레임)`);
      else pass(`카메라 부드러움 (60 fps 한 프레임 최대 ${out.cam.maxStep}px · 뒤집힘 ${flips} / ${camProbe.length} 프레임${goals ? ` · 골 장면 ${goals}번 뺌` : ""})`);
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
    const zs = out.frames.filter((f) => !f.hunt).map((f) => f.cam?.z ?? 1);
    if (zs.some((z) => z > 1.05)) pass(`카메라 따라가기 (z ${zs.map((z) => z.toFixed(2)).join(", ")})`);
    else fail(`카메라가 확대하지 않았다 (z ${zs.join(", ")})`);

    // 골 장면 (선택)
    if (opts.goal) {
      const g0 = await page.evaluate(() => { const d = window.__soccer.hexView; window.__soccer.store.matchUi.speed = 4; return d.score.home + d.score.away; });
      const ok = await page.waitForFunction((n) => { const d = window.__soccer.hexView; return d && (d.score.home + d.score.away > n || d.finished); }, { timeout: 120000, polling: 16 }, g0).then(() => true, () => false);
      if (ok) {
        for (const [i, ms] of [[0, 60], [1, 250], [2, 400], [3, 500]]) {
          await sleep(ms);
          const file = path.join(opts.outDir, `${size}-goal-${i}.png`);
          await page.screenshot({ path: file });
          out.files.push(file);
          const d = await page.evaluate(() => window.__soccer.hexView);
          out.frames.push({ file, turn: d?.turn, stage: d?.stage, score: d?.score, cam: d?.cam, act: actLine(d) });
        }
        await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; });
      } else fail("2분 안에 골이 나지 않았다 (--goal)");
    }

    if (opts.practice) {
      await finishPractice(page, size, opts, out, pass, fail);
      await sleep(300);
      return out;
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
    for (const f of r.frames) console.log(`  ${path.basename(f.file)}  turn ${f.turn} ${f.stage ?? ""} ${f.clock ? `시계 ${f.clock}` : ""} 점수 ${f.score ? `${f.score.home}:${f.score.away}` : "-"} cam z ${f.cam ? f.cam.z.toFixed(2) : "-"}${f.name ? ` 이름표 ${f.name}` : ""}${f.fps && f.fps < 1000 ? ` fps ${f.fps}` : ""}${f.act ? ` [${f.act}]` : ""}`);
    if (r.result) console.log(`  ${r.size}-result.png  ${r.result.score} ${r.result.verdict}`);
    for (const c of r.checks) console.log(`  ${c.ok ? "OK  " : "FAIL"} ${c.msg}`);
    for (const e of r.errors) console.log(`  ERR  ${e}`);
    for (const n of r.notes) console.log(`  NOTE ${n}`);
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
