#!/usr/bin/env node
// tools/lesson_play.mjs — 레슨판 실제 브라우저 한 판 점검 (LESSON_PROTO_PLAN §14.19 ZI · §15.8 코치 컷인 넘기기). npm test 에는 넣지 않는다.
//
//   node tools/lesson_play.mjs <outDir> [--seed S] [--policy team] [--until season|lesson|run] [--lessons N]
//                              [--width 1280 --height 720] [--mobile] [--touch-only] [--max-min 25]
//
// 헤드리스 Chrome(puppeteer-core, tools/shot.mjs 의 서버 · 브라우저 찾기)에서 시작 화면 → 편성 → 런을 **실제 입력**으로 진행한다.
//  - 레슨: 감독 AI 추천(manager.recommendCard)을 사람 입력으로 바꿔 낸다 — 방식을 돌아가며 쓴다:
//      마우스 끌기 · 터치 끌기 · 터치 탭(카드 → 자리 → 같은 자리 한 번 더) · 마우스 클릭(카드 → 경기장) · 키보드(카드 → 1~5/← → → Enter)
//      벤치 = 토큰을 벤치 칸으로 끌기(마우스/터치) 또는 명단 [벤치], 회복 = 카드를 명단 줄로 끌기 / 카드 → 줄 탭, [턴 끝] = 클릭/탭.
//    행동마다 엔진 상태가 바뀌었는지(seq · 벤치 · 턴), 낸 카드의 실제 대상(lastFx gain · fail)이 미리보기 대상과 같은지 확인한다.
//    입력이 먹지 않으면 실패로 적고 actions 로 대신 진행한다 (요약에 남는다).
//  - 주 · 보상 · 상담 · 준비 · 경기(⏭ 스킵 → 확인) · 유물 · 루트도 화면 버튼을 눌러 진행한다 (추천대로).
//  - 화면이 바뀔 때마다 · 터치 끌기 중간 프레임을 PNG 로 남기고, 페이지 에러 · 에러 토스트 · 스크롤을 센다.
// §18 코치 수업: 보상 모달에 수업이 남아 있으면 recommendTeach 대로 선수 칩 → [가르치기] / [배우지 않기] 를 클릭 · 탭 · 키보드로 돌아가며 누르고,
//   행동마다 엔진 (learnedSkillIds · SP) 변화를 확인한다.
// --until season(기본) = 시즌 1 경계전 · 루트까지, lesson = 첫 레슨 끝까지, run = 15주 완주. --lessons N = 레슨 N번 끝나면 멈춤.
// --mobile = isMobile 뷰포트(터치 전용 기기처럼), --touch-only = 레슨 입력을 터치 방식만.
// L40 고유 카드 모양 (§16.12 U4): 모양마다 입력을 돌아가며 쓴다 — 이어 주기 = 카드 클릭 · 탭 → 주인 토큰 끌기, 연결 · 크로스 = 카드를 받는 선수 위로,
//   자리 옮기기 = 카드를 구역으로, 가로지르기 = 숫자 키, 둘레 원 · 구역 전원 = 카드 탭 두 번 (+ 마우스 · 터치 끌기 · 탭 · 클릭 · 키보드를 섞어서).
//   놓기 직전 화면 (흰 고리 대상 · 놓을 바닥 · 가로지르기 지금 바닥) 에서 읽은 행 (선수:스탯) = 실제 lastFx 행인지 본다 (실패자는 마지막 행 1개).
//   --slot SLOT=charId = 편성 화면에서 그 슬롯을 눌러 선수를 바꾼 뒤 [런 시작] (미르카 판: --slot FW2=ch_cat_trickster).
//   아직 안 낸 고유 카드가 낼 수 있으면 감독 추천 대신 먼저 낸다 (덱의 고유 카드 모두 1번 이상 — 끝에 확인). --no-cover = 늘 감독 추천대로.
// --watch-match (§19 K5) = 경기를 ⏭ 대신 자동 진행 4x 로 끝까지 보며 필살기 컷인(등급 · 합체기 · 역방향)을 세고, 엔진 이벤트 기대 장수 = 화면 장수 · 글자 잘림 없음을 확인한다.
// --d25 (docs/SPRITE_25D_PLAN.md §6 — 브랜치 outgame-sprite) = 주소 ?d25=1 로 연다 → 경기 화면이 2.5D (원근 바닥 · 세운 선수 · 카메라).
//   경기마다 .match-screen.d25 인지 보고, --watch-match 와 함께면 자동 진행 동안 카메라 배율 (.w-cam scale) 분포를 적는다 (풀코트 1 · 따라가기
//   4배속 1.2 · 1x 1.4 — 자동 진행이라 결정 확대 2배는 없어야 한다) · 배율마다 첫 장면을 찍고, 경기가 끝나면 풀코트인지 본다.
// 2차 이벤트 (LESSON_PROTO_PLAN §24.11 · §24.16, I1) — 데이터 스위치가 켜진 실제 앱:
//  - 이벤트 모달 (phase event): 감독 추천 (manager.recommendEventChoice — 화면의 "추천" 배지와 같은지 본다) 선택지를 클릭 · 탭으로 누르고,
//    고르는 선택지 (카드 1장 강화 · 삭제) 면 덱 고르기에서 추천 카드 → [확정]. 고른 뒤 결과 카드 (.evm-result — 결과 글 · 받은 효과) → [계속].
//    종류마다 (주 끝 · 시즌 시작 · 전야 · 루트 · 외출 · 이야기 · 코치) 첫 장면을 찍는다.
//  - 보상 카드 3택1 (phase cardOffer): 감독 추천 (recommendCardOffer) 카드 · [건너뛰기] → [확인].
//  - 레슨 깜짝 말풍선 (§24.8): 감독 추천 (recommendCard → kind surprise) 선택지를 클릭 · 탭 · 숫자 키로 돌아가며 누른다.
//    말풍선이 필드 안 · 선택지 2개 · [턴 끝] 잠김 · 추천 배지 = 추천인지, 고른 뒤 결과 한 줄 띠 (.ls-sres) 가 뜨는지 본다.
//  - 외출 모달: 추천 선수 줄의 "이야기 n/3화" · "일반 외출" 배지를 적고, 이야기면 그 화가 실제로 뜨는지 (이벤트 kind story · 같은 선수) 본다.
//  - --outings N = 자유 주에 외출을 고를 수 있으면 감독 추천 대신 외출을 N 번까지 고른다 (감독 AI 는 외출을 거의 고르지 않아 이야기가
//    화면에 잘 안 나온다). 상대 = 감독 AI 외출 상대 규칙 (안 본 이야기가 남은 선수 중 체력 최저, 없으면 7명 중 체력 최저) — 모달의 그 줄을 누른다.
//  - --legends = 편성 화면에서 레전드 2명 (등록 팀 = lesson_scenarios legendSampleTeams 를 localStorage 에 미리 넣는다) 을 고르고,
//    런 시작 덱에 메모리 카드가 들어갔는지 본다.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadData as loadNodeData } from "./scenarios.mjs";
import { startServer, findBrowser } from "./shot.mjs";

function parseArgs(argv) {
  const o = { outDir: null, seed: "play-1", policy: "team", until: "season", lessons: null, width: 1280, height: 720, mobile: false, touchOnly: false, maxMin: 25, slots: {}, coverUniques: true, watchMatch: false, legends: false, outings: 0, d25: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--seed") o.seed = next();
    else if (a === "--policy") o.policy = next();
    else if (a === "--until") o.until = next();
    else if (a === "--lessons") o.lessons = parseInt(next(), 10) || null;
    else if (a === "--width") o.width = parseInt(next(), 10) || 1280;
    else if (a === "--height") o.height = parseInt(next(), 10) || 720;
    else if (a === "--mobile") o.mobile = true;
    else if (a === "--touch-only") o.touchOnly = true;
    else if (a === "--max-min") o.maxMin = Number(next()) || 25;
    else if (a === "--slot") { const [k, v] = String(next() || "").split("="); if (!k || !v) throw new Error("--slot SLOT=charId"); o.slots[k] = v; }
    else if (a === "--no-cover") o.coverUniques = false;
    else if (a === "--watch-match") o.watchMatch = true;
    else if (a === "--d25") o.d25 = true;
    else if (a === "--legends") o.legends = true;
    else if (a === "--outings") o.outings = Math.max(0, parseInt(next(), 10) || 0);
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!o.outDir) o.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  if (!o.outDir) throw new Error("usage: node tools/lesson_play.mjs <outDir> [--seed S] [--policy P] [--until season|lesson|run] [--lessons N] [--width W --height H] [--mobile] [--touch-only] [--slot FW2=ch_cat_trickster] [--no-cover] [--watch-match] [--d25] [--legends] [--outings N]");
  return o;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e) {
    console.log("puppeteer-core 를 불러올 수 없습니다 — `npm i` 후 다시 실행하세요.");
    return;
  }
  const bi = findBrowser();
  if (!bi) { console.log("Chrome/Edge 를 찾지 못했습니다 (CHROME_PATH)."); return; }
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const server = await startServer(ROOT);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({ executablePath: bi.path, headless: true, args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--lang=ko-KR"] });
  const log = (...a) => console.log(...a);
  const report = { errors: [], toasts: [], scroll: [], actions: {}, fails: [], fallbacks: [], targetMismatch: [], drift: [], shots: [], phases: {}, lessons: [], teach: [], matches: [],
    // 2차 이벤트 (I1): 고른 이벤트 · 결과 카드 · 3택1 · 깜짝 · 외출 · 레전드
    events: [], resultCards: 0, offers: [], surprises: [], outings: [], legends: null };
  // --legends: 등록 팀 (노드에서 런 3번 — lesson_scenarios.legendSampleTeams) 을 미리 만든다
  let legendTeams = null;
  if (args.legends) {
    const { legendSampleTeams } = await import("./lesson_scenarios.mjs");
    legendTeams = legendSampleTeams(loadNodeData(ROOT), args.seed);
  }
  let teachN = 0;
  const uniquePlays = {}; // 낸 고유 카드 cardId → { name, kind, chip, n, ways: Set }
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => report.errors.push(`pageerror: ${e?.message ?? e}`));
    page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });
    await page.setViewport({ width: args.width, height: args.height, deviceScaleFactor: 1, isMobile: args.mobile, hasTouch: true });
    // --d25: 2.5D 경기 화면 (store.isD25 — 주소를 모듈을 읽을 때 한 번 본다, 아래 reload 도 같은 주소)
    await page.goto(`${baseUrl}/index.html${args.d25 ? "?d25=1" : ""}`, { waitUntil: "load" });
    await page.evaluate((teams) => {
      try {
        localStorage.clear();
        if (teams) localStorage.setItem("soccer-lesson.teams", JSON.stringify(teams)); // js/ui/store.js KEYS.teams
      } catch (_) { /* */ }
    }, legendTeams);
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => window.__soccer?.store?.data && [...document.querySelectorAll("button")].some((b) => /새 런 시작/.test(b.textContent || "")), { timeout: 20000 });

    // ---- 입력 도우미 (좌표 = 화면 px, 스테이지 배율을 거친 값) ----
    const boxOf = async (sel, idx = 0) => {
      const els = await page.$$(sel);
      const el = els[idx];
      if (!el) { for (const e of els) await e.dispose(); return null; }
      const b = await el.boundingBox();
      for (const e of els) await e.dispose();
      return b && b.width > 0 ? b : null;
    };
    const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const ptIn = (b, at) => ({ x: b.x + (b.width * at.x) / 100, y: b.y + (b.height * at.y) / 100 });
    const mouseClickAt = async (p) => { await page.mouse.move(p.x, p.y, { steps: 4 }); await page.mouse.click(p.x, p.y); };
    const tapAt = async (p) => { await page.touchscreen.tap(p.x, p.y); };
    const press = async (sel, how = "mouse", idx = 0) => {
      const b = await boxOf(sel, idx);
      if (!b) return false;
      const c = center(b);
      // 화면(뷰포트) 밖으로 밀려난 버튼은 사람이 누를 수 없다 → 실패로 적는다 (예: 모달이 넘쳐 [확인]이 아래로)
      if (c.x < 0 || c.y < 0 || c.x > args.width || c.y > args.height) { report.fails.push(`화면 밖 요소: ${sel} (${Math.round(c.x)}, ${Math.round(c.y)})`); return false; }
      if (how === "touch") await tapAt(c); else await mouseClickAt(c);
      return true;
    };
    const pressText = async (re, how = "mouse", scope = "") => {
      const idx = await page.evaluate((src, scope) => {
        const rx = new RegExp(src);
        const all = [...document.querySelectorAll(`${scope} button`)];
        return all.findIndex((b) => rx.test((b.textContent || "").trim()) && !b.disabled && b.offsetParent !== null);
      }, re.source, scope);
      if (idx < 0) return false;
      return press(`${scope} button`, how, idx);
    };
    // onHold: 놓기 직전 (누른 채) — 화면에 보이는 대상을 읽는다
    const mouseDrag = async (a, b, { steps = 14, onHold = null } = {}) => {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(a.x + 3, a.y - 3, { steps: 2 });
      await page.mouse.move(b.x, b.y, { steps });
      await delay(60);
      if (onHold) await onHold();
      await page.mouse.up();
    };
    const touchDrag = async (a, b, { steps = 14, shot = null, onHold = null } = {}) => {
      await page.touchscreen.touchStart(a.x, a.y);
      for (let i = 1; i <= steps; i++) {
        await page.touchscreen.touchMove(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
        await delay(16);
      }
      await delay(60);
      if (shot) await snap(shot);
      if (onHold) await onHold();
      await page.touchscreen.touchEnd();
    };
    let shotN = 0;
    const snap = async (name) => {
      const f = path.join(outDir, `${String(++shotN).padStart(2, "0")}_${name}.png`);
      await page.screenshot({ path: f });
      const m = await page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
      if (m.sh > m.ih + 1 || m.sw > m.iw + 1) report.scroll.push(`${name}: ${m.sw}×${m.sh} / ${m.iw}×${m.ih}`);
      report.shots.push(f);
      return f;
    };
    const S = (fn, ...a) => page.evaluate(fn, ...a);
    const phaseNow = () => S(() => ({ screen: window.__soccer.store.screen, phase: window.__soccer.store.run?.phase ?? null, season: window.__soccer.store.run?.season ?? null, turn: window.__soccer.store.run?.turn ?? null }));
    const errToasts = async () => S(() => [...document.querySelectorAll("#toast-root .toast-error")].map((t) => t.textContent.trim()));
    const count = (k) => { report.actions[k] = (report.actions[k] || 0) + 1; };

    // ---- --watch-match (§19 K5): 경기를 ⏭ 없이 자동 진행(4x)으로 끝까지 보며 필살기 컷인을 센다 ----
    // .m-cutin 에 새로 붙는 카드(.cut)를 MutationObserver 로 모으고, 등급(tier-R · SR · 없음 = SSR) · 합체기 · 역방향 첫 장면을 찍는다.
    // 끝에 엔진 이벤트(cutin · combo · reverseCutin)에서 기대한 카드 수 = 화면 카드 수인지, 대사 · 이름 줄이 잘리지 않았는지 본다.
    async function watchMatch(ph) {
      const tag = `s${ph.season}w${ph.turn}`;
      await S(() => {
        const w = window;
        w.__k5cuts = [];
        const layer = document.querySelector(".match-screen .m-cutin");
        if (!layer) return;
        const clip = (el) => !!el && el.scrollWidth > el.clientWidth + 1;
        new MutationObserver(() => {
          for (const el of layer.querySelectorAll(":scope > .cut")) {
            if (el.__k5) continue;
            el.__k5 = 1;
            w.__k5cuts.push({
              cls: el.className,
              name: el.querySelector(".cut-txt b")?.textContent ?? el.textContent.slice(0, 40),
              line: el.querySelector(".cut-line")?.textContent ?? null,
              clipped: clip(el.querySelector(".cut-line")) || clip(el.querySelector(".cut-txt b")) || clip(el.querySelector(".cut-txt small")),
            });
          }
        }).observe(layer, { childList: true });
      });
      for (let k = 0; k < 3; k++) {
        const sp = await S(() => document.querySelector(".match-screen .speed-btn")?.dataset.speed ?? null);
        if (sp === "4" || sp == null) break;
        await press(".match-screen .speed-btn");
        await delay(150);
      }
      const snapped = new Set();
      const camZ = {}; // --d25: 카메라 배율 표본 (.w-cam scale)
      const tEnd = Date.now() + 8 * 60 * 1000;
      let done = false;
      while (Date.now() < tEnd) {
        const st = await S(() => {
          const c = document.querySelector(".match-screen .m-cutin.show > .cut");
          const kind = !c ? null : c.classList.contains("cut-rev") ? "rev" : c.classList.contains("cut-name") ? "combo" : ([...c.classList].find((x) => x.startsWith("tier-")) || "tier-SSR");
          const fin = [...document.querySelectorAll("#modal-root button")].some((b) => (b.textContent || "").trim() === "확인" && !b.disabled);
          const m = /scale\(([\d.]+)\)/.exec(document.querySelector(".match-screen .w-cam")?.style.transform || "");
          return { kind, fin, z: m ? m[1] : null };
        });
        if (st.z) camZ[st.z] = (camZ[st.z] || 0) + 1;
        if (args.d25 && st.z && !snapped.has(`z${st.z}`)) { snapped.add(`z${st.z}`); await snap(`${tag}_match_cam_z${st.z}`); }
        if (st.kind && !snapped.has(st.kind)) { snapped.add(st.kind); await snap(`${tag}_match_cut_${st.kind}`); }
        if (st.fin) { done = true; break; }
        await delay(120);
      }
      if (!done) { report.fails.push(`${tag} 경기가 자동 진행으로 끝나지 않음 (8분)`); return; }
      const res = await S(() => {
        const evs = window.__soccer.store.match?.events || [];
        const cutins = evs.filter((e) => e.type === "cutin").length;
        const combos = evs.filter((e) => e.type === "combo").length;
        const revs = evs.filter((e) => e.reverseCutin).length;
        const tiers = {};
        for (const e of evs) if (e.type === "cutin") tiers[e.tier || "없음"] = (tiers[e.tier || "없음"] || 0) + 1;
        const types = {};
        for (const e of evs) if (e.type === "cutin") types[e.ultimateType] = (types[e.ultimateType] || 0) + 1;
        const score = window.__soccer.store.match?.score ?? null;
        return { cutins, combos, revs, tiers, types, score, seen: window.__k5cuts || [] };
      });
      // 합체기 1번 = 받은 선수 cutin 1장 → 컷인 2장 + 이름 카드 1장 (+2)
      const expected = res.cutins + 2 * res.combos + res.revs;
      const clipped = res.seen.filter((c) => c.clipped);
      report.matches.push({ tag, ...res, expected, seenN: res.seen.length, clipped: clipped.length, shots: [...snapped], camZ });
      if (res.seen.length !== expected) report.fails.push(`${tag} 경기 컷인: 엔진 기대 ${expected}장 ≠ 화면 ${res.seen.length}장`);
      if (args.d25) {
        // 2.5D 카메라 (§5): 자동 진행 = 풀코트 1 · 따라가기 (4배속 1.2 · 배속을 바꾸기 전 1.4) 만 — 결정 확대 (2배) 는 없다, 끝 = 풀코트
        const zs = Object.keys(camZ);
        if (!zs.length) report.fails.push(`${tag} 2.5D 카메라 층 (.w-cam) 이 없음`);
        for (const z of zs) if (!["1", "1.2", "1.4"].includes(z)) report.fails.push(`${tag} 자동 진행 중 카메라 z ${z} (1 · 1.2 · 1.4 만 기대)`);
        await delay(500);
        const endZ = await S(() => /scale\(([\d.]+)\)/.exec(document.querySelector(".match-screen .w-cam")?.style.transform || "")?.[1] ?? null);
        if (endZ !== "1") report.fails.push(`${tag} 경기 끝 카메라 z ${endZ} (풀코트 1 기대)`);
      }
      for (const c of clipped) report.fails.push(`${tag} 컷인 글자 잘림: ${c.name} (${c.cls})`);
      count("경기: 자동 진행 4x 끝까지");
    }

    // ---- 시작 → 편성 (방침) → 기본 편성으로 시작 ----
    await snap("start");
    await pressText(/새 런 시작/);
    await page.waitForFunction(() => window.__soccer.store.screen === "setup", { timeout: 8000 });
    await press(`.policy-btn[data-policy="${args.policy}"]`);
    const seedBox = await boxOf("input.input");
    if (seedBox) { await mouseClickAt(center(seedBox)); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.type(String(args.seed)); }
    const slotList = Object.entries(args.slots);
    for (const [slot, charId] of slotList) {
      // 슬롯 누르기 → 선수 고르기 모달 → 그 선수 (실제 입력)
      const name = await S((cid) => (window.__soccer.store.data.characters || []).find((c) => c.id === cid)?.name ?? null, charId);
      if (!name) throw new Error(`캐릭터 '${charId}' 없음`);
      if (!(await press(`.setup-screen .lu-slot[data-slot="${slot}"]`))) { report.fails.push(`편성 슬롯 ${slot}을 누르지 못함`); continue; }
      await page.waitForSelector("#modal-root .char-pick", { timeout: 4000 }).catch(() => {});
      const idx = await S((nm) => [...document.querySelectorAll("#modal-root .char-pick")].findIndex((b) => (b.textContent || "").includes(nm) && !b.disabled), name);
      if (idx < 0) { report.fails.push(`선수 고르기 모달에 ${name} 없음`); continue; }
      await delay(350); // 모달이 다 뜬 뒤
      await snap(`setup_pick_${slot}`);
      await press("#modal-root .char-pick", "mouse", idx);
      await delay(200);
      const now = await S((sl) => document.querySelector(`.setup-screen .lu-slot[data-slot="${sl}"]`)?.dataset.pid ?? null, slot);
      if (now !== charId) report.fails.push(`편성 ${slot} = ${now} (${charId} 아님)`);
    }
    // --legends (§24.9): [★ 레전드] → 등록 팀 0 · 1 의 첫 선수 (다른 팀 둘 = 메모리 카드 2장) → [완료]
    let legendPicked = null;
    if (args.legends) {
      const how = args.touchOnly ? "touch" : "mouse";
      if (!(await press(".setup-supports .legend-btn", how))) report.fails.push("[★ 레전드] 버튼을 누르지 못함");
      else {
        await page.waitForSelector("#modal-root .legend-modal .lg-team", { timeout: 4000 }).catch(() => report.fails.push("레전드 모달이 뜨지 않음"));
        await delay(300);
        for (const ti of [0, 1]) {
          if (!(await press(`#modal-root .lg-team[data-idx="${ti}"] .lg-pl:not([disabled])`, how))) report.fails.push(`등록 팀 ${ti} 선수를 누르지 못함`);
          await delay(150);
        }
        await snap("setup_legends");
        legendPicked = await S(() => (window.__soccer.store.setup?.legends || []).map((l) => ({ teamId: l.teamId, charId: l.charId, name: l.name, memoryCard: l.memoryCard || null })));
        if ((legendPicked || []).length !== 2) report.fails.push(`레전드 2명을 고르지 못함 (${(legendPicked || []).length}명)`);
        await press("#modal-root .lg-done", how);
        await delay(250);
      }
    }
    await snap("setup");
    if (slotList.length) await pressText(/^런 시작$/);
    else await pressText(/기본 편성으로 시작/);
    await page.waitForFunction(() => window.__soccer.store.screen === "run" && ["week", "event"].includes(window.__soccer.store.run?.phase), { timeout: 8000 });
    if (args.legends) {
      // 시작 덱의 메모리 카드 = 고른 레전드의 메모리 카드 (팀마다 1장 — 다른 팀 둘이면 2장)
      const mem = await S(() => ({ deck: (window.__soccer.store.run.deck || []).filter((e) => e.src === "memory").map((e) => `${e.cardId}${e.plus ? "+" : ""}`), legends: (window.__soccer.store.run.legends || []).length }));
      const want = [...new Set((legendPicked || []).filter((l) => l.memoryCard).map((l) => l.teamId))].length;
      report.legends = { picked: (legendPicked || []).map((l) => `${l.name}(${l.memoryCard ? `${l.memoryCard.cardId}${l.memoryCard.plus ? "+" : ""}` : "카드 없음"})`), deck: mem.deck, stateLegends: mem.legends };
      if (mem.legends !== (legendPicked || []).length) report.fails.push(`런 state.legends ${mem.legends}명 ≠ 고른 ${(legendPicked || []).length}명`);
      if (mem.deck.length !== want) report.fails.push(`시작 덱 메모리 카드 ${mem.deck.length}장 ≠ 기대 ${want}장`);
    }

    // ---- 레슨 한 행동 ----
    const MOUSE_WAYS = ["mouseDrag", "touchDrag", "touchTap", "mouseClick", "keys"];
    const TOUCH_WAYS = ["touchDrag", "touchTap"];
    // L40 고유 카드 모양별 입력 (§16.12 U4) — 첫 번째 = 계획의 대표 조작, 나머지는 마우스 · 터치를 섞어 돌아가며
    const SHAPE_WAYS = {
      link: ["ownerDragMouse", "ownerDragTouch", "cardTouchDrag", "keys", "tapTwice", "cardMouseDrag"],
      pick: ["cardMouseDrag", "cardTouchDrag", "tapTwice", "mouseClick", "ownerDragTouch", "keys"],
      cross: ["cardMouseDrag", "cardTouchDrag", "tapTwice", "ownerDragMouse", "mouseClick", "keys"],
      move: ["cardMouseDrag", "cardTouchDrag", "ownerDragTouch", "tapTwice", "keys", "ownerDragMouse", "mouseClick"],
      carry: ["keys", "cardTouchDrag", "ownerDragMouse", "tapTwice", "cardMouseDrag", "ownerDragTouch", "mouseClick"],
    };
    const SHAPE_WAY_LABEL = {
      ownerDragMouse: "카드 클릭 → 주인 토큰 마우스 끌기", ownerDragTouch: "카드 탭 → 주인 토큰 터치 끌기",
      cardMouseDrag: "카드 마우스 끌기", cardTouchDrag: "카드 터치 끌기", tapTwice: "카드 탭 → 자리 탭 → 한 번 더",
      mouseClick: "카드 클릭 → 자리 클릭", keys: "카드 클릭 → 숫자 · ←→ → Enter",
    };
    // 주인 둘레 원 · 구역 전원 · 마무리 (놓을 자리가 없는 모양) — 첫 번째 = 터치 두 번
    const OWNER_WAYS = ["touchTap", "mouseDrag", "mouseClick", "touchDrag"];
    const shapeWayI = {};
    const shapeShots = new Set();
    let ownerWayI = 0;
    const uniquesPlayed = new Set(); // 낸 고유 카드 cardId (이번 판)
    let wayI = 0;
    let lessonsDone = 0;
    let touchShotDone = false;
    let lessonCut0 = 0; // 이번 레슨이 시작될 때의 cutN — 레슨마다 본 컷인 수 (§15 기획 "레슨당 2~4번")
    let cutN = 0; // 본 코치 컷인 수 (§15.8 — 3번 중 2번은 탭 · 클릭으로 넘기고, 1번은 저절로 닫힐 때까지 본다)
    const lessonIdle = () => page.waitForFunction(() => {
      const s = window.__soccer.store;
      if (s.run?.phase !== "lesson") return true;
      const ui = s.lessonUi;
      return !!(ui && !ui.busy && !ui.drag && ui.shownSeq === s.run.lesson?.seq && document.querySelector(".lesson-screen .ls-hand"));
    }, { timeout: 20000, polling: 50 });
    const lessonSnap = () => S(() => {
      const s = window.__soccer.store;
      const L = s.run.lesson;
      return { phase: s.run.phase, seq: L?.seq ?? null, turn: L?.turn ?? null, bench: (L?.bench || []).slice(), hand: (L?.hand || []).slice(), score: L?.score ?? null };
    });
    // ---- 레슨 깜짝 말풍선 (§24.8 · §24.13, I1): 감독 추천 선택지를 클릭 · 탭 · 숫자 키로 돌아가며 ----
    let surN = 0;
    async function surpriseStep(rec) {
      await page.waitForSelector(".lesson-screen .ls-sur .lsr-choice:not([disabled])", { timeout: 4000 }).catch(() => {});
      await delay(200);
      const bub = await S(() => {
        const b = document.querySelector(".lesson-screen .ls-sur");
        if (!b) return null;
        const f = document.querySelector(".lesson-screen .m-field")?.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        const btns = [...b.querySelectorAll(".lsr-choice")];
        const L = window.__soccer.store.run.lesson;
        return {
          id: b.dataset.id, pos: b.dataset.pos || null, turn: L.turn, seq: L.seq,
          inField: !!f && r.left >= f.left - 1 && r.right <= f.right + 1 && r.top >= f.top - 1 && r.bottom <= f.bottom + 1,
          choices: btns.length, recIdx: btns.findIndex((x) => x.classList.contains("recommended")),
          endDisabled: !!document.querySelector(".lesson-screen .ls-btns .ls-end")?.disabled,
          text: (b.querySelector(".lsr-text")?.textContent || "").trim(),
          clipped: [...b.querySelectorAll(".lsr-text, .lsr-label, .lsr-title")].some((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2),
        };
      });
      if (!bub) {
        report.fails.push(`깜짝 말풍선이 뜨지 않음 (${rec.eventId})`);
        report.fallbacks.push("레슨 깜짝");
        await S((c) => { window.__soccer.actions.resolveSurprise(c); window.__soccer.render(); }, rec.choice);
        return;
      }
      surN++;
      const tag = `깜짝 ${bub.id}`;
      if (bub.choices !== 2) report.fails.push(`${tag}: 선택지 ${bub.choices}개`);
      if (!bub.inField) report.fails.push(`${tag}: 말풍선이 필드 밖 (${bub.pos})`);
      if (!bub.endDisabled) report.fails.push(`${tag}: 기다리는 동안 [턴 끝]이 잠기지 않음`);
      if (bub.recIdx !== rec.choice) report.fails.push(`${tag}: 화면 추천 ${bub.recIdx} ≠ 감독 추천 ${rec.choice}`);
      if (!bub.text) report.fails.push(`${tag}: 본문이 비었음`);
      if (bub.clipped) report.fails.push(`${tag}: 말풍선 글자 잘림`);
      if (surN === 1) await snap("lesson_surprise");
      // 잠김 확인: [턴 끝]을 눌러도 턴이 넘어가지 않는다 (첫 깜짝에서만)
      if (surN === 1) {
        await press(".lesson-screen .ls-btns .ls-end", args.touchOnly ? "touch" : "mouse");
        await delay(200);
        const still = await S(() => !!window.__soccer.store.run.lesson?.surprise?.pending);
        if (!still) report.fails.push(`${tag}: 잠긴 [턴 끝]을 누르자 깜짝이 사라짐`);
      }
      const how = args.touchOnly ? "touch" : ["mouse", "touch", "key"][surN % 3];
      const sel = `.lesson-screen .ls-sur .lsr-choice[data-choice="${rec.choice}"]`;
      if (how === "key") await page.keyboard.press(String(rec.choice + 1));
      else await press(sel, how);
      const done = await page.waitForFunction(() => {
        const s = window.__soccer.store;
        return s.run.phase !== "lesson" || !s.run.lesson?.surprise?.pending;
      }, { timeout: 4000, polling: 50 }).then(() => true, () => false);
      count(`레슨 깜짝 (${how === "key" ? "숫자 키" : how === "touch" ? "탭" : "클릭"})`);
      if (!done) {
        report.fails.push(`${tag}: 선택지 입력이 먹지 않음 (${how})`);
        report.fallbacks.push("레슨 깜짝");
        await S((c) => { window.__soccer.actions.resolveSurprise(c); window.__soccer.render(); }, rec.choice);
        return;
      }
      const banner = await page.waitForSelector(".lesson-screen .ls-sres", { timeout: 1500 }).then(() => true, () => false);
      if (surN === 1 && banner) await snap("lesson_surprise_result");
      report.surprises.push({ id: bub.id, choice: rec.choice, how, pos: bub.pos, banner });
    }

    async function lessonStep() {
      await lessonIdle();
      await delay(350); // 새 손패 · 흩어지기 연출이 끝나도록 (사람처럼 한 박자 쉬고)
      const info = await S((cover) => {
        const { store, manager, run } = window.__soccer;
        const st = store.run;
        const data = store.data;
        let rec = manager.recommendCard(st, data);
        const v = run.getLessonView(st, data);
        // 고유 카드 모두 1번 이상 (§16.12 U4): 아직 안 낸 고유 카드가 낼 수 있으면 감독 추천 대신 그 카드 — 후보 중 미리보기 상승 합이 가장 큰 자리
        let forced = false;
        if (cover && rec.kind !== "bench" && rec.kind !== "surprise") {
          const done = new Set(cover);
          for (const c of v.hand) {
            if (!c.shape || !c.playable || done.has(c.cardId)) continue;
            if (rec.kind === "play" && rec.uid === c.uid) break;
            const needsZone = c.shape.needs === "zone";
            let best = null;
            for (const cd of run.dropCandidates(st, data, { uid: c.uid })) {
              const a = { uid: c.uid, at: cd.at || undefined, playerId: cd.playerId, zone: needsZone ? cd.zone : undefined };
              const p = run.previewCard(st, data, a);
              if (p.ok && (!best || p.total > best.total)) best = { total: p.total, a };
            }
            if (best) {
              rec = { kind: "play", uid: c.uid, score: null };
              if (best.a.at) rec.at = best.a.at;
              if (best.a.playerId != null) rec.playerId = best.a.playerId;
              if (best.a.zone != null) rec.zone = best.a.zone;
              forced = true;
              break;
            }
          }
        }
        const card = rec.kind === "play" ? v.hand.find((c) => c.uid === rec.uid) : null;
        const pv = rec.kind === "play" ? run.previewCard(st, data, { uid: rec.uid, at: rec.at, playerId: rec.playerId, zone: rec.zone }) : null;
        // 모양 카드: 놓을 화면 점 (필드 %) — 받는 선수 위치 · 구역 바닥 안에서 토큰과 가장 먼 점 (탭 · 클릭이 토큰 · 주인 위로 가지 않게)
        let shapeAt = null;
        let zoneKey = null;
        if (card?.shape?.needs === "player" && rec.playerId) shapeAt = { ...v.positions[rec.playerId] };
        if (card?.shape?.needs === "zone" && rec.zone) {
          const Z = v.zoneCfg;
          const c0 = Z.centers[rec.zone];
          const pts = Object.values(v.positions || {});
          let best = null;
          for (const r of [0, 2, 4, 6]) {
            for (let k = 0; k < (r ? 16 : 1); k++) {
              const ang = (2 * Math.PI * k) / 16;
              const p = { x: c0.x + r * Math.cos(ang), y: c0.y + (r * Math.sin(ang)) / Z.aspect };
              if (p.x < 2 || p.x > 98 || p.y < 2 || p.y > 98) continue;
              const dmin = Math.min(99, ...pts.map((q) => Math.hypot(q.x - p.x, (q.y - p.y) * Z.aspect)));
              if (!best || dmin > best.d + 1e-9) best = { d: dmin, p };
            }
          }
          shapeAt = best ? best.p : { ...c0 };
          const key = document.querySelector(`.lesson-screen .zone-chip[data-zone="${rec.zone}"] .zc-key`);
          zoneKey = key ? key.textContent.trim() : null;
        }
        return {
          rec, forced,
          card: card ? {
            uid: card.uid, cardId: card.cardId, name: card.name, targetKind: card.targetKind, heal: !!card.heal, size: card.size ?? null, attached: !!card.attach,
            shape: card.shape ? { kind: card.shape.kind, needs: card.shape.needs || null, chip: card.shape.chip, cross: !!(card.shape.onlyZones && card.shape.onlyZones.length) } : null,
            ownerId: card.ownerId ?? null,
          } : null,
          pvIds: pv ? [...new Set((pv.targets || []).map((t) => t.id))].sort() : null,
          pvRows: pv ? (pv.targets || []).map((t) => `${t.id}:${t.stat}`) : null,
          pvShape: pv?.shape ? { receiverId: pv.shape.receiverId ?? null, to: pv.shape.to ?? null } : null,
          shapeAt, zoneKey,
          healId: pv?.healId ?? null,
        };
      }, args.coverUniques ? [...uniquesPlayed] : null);
      const before = await lessonSnap();
      const { rec, card } = info;
      if (rec.kind === "surprise") { await surpriseStep(rec); return; }
      if (info.forced) count("고유 카드 먼저 (아직 안 낸 카드)");
      const ways = args.touchOnly ? TOUCH_WAYS : MOUSE_WAYS;
      const way = ways[wayI++ % ways.length];
      const field = await boxOf(".lesson-screen .m-field");
      let label = "";
      // 내기 직전 화면에 보인 대상 (흰 고리 .tok.target) · 자리 — 끌기 · 탭은 화면 px → 필드 % 라 추천 자리와 조금 다를 수 있다
      let seen = null;
      const readSeen = async () => {
        seen = await S((sh, owner) => {
          const s = window.__soccer.store;
          const ui = s.lessonUi;
          const ids = [...document.querySelectorAll(".lesson-screen .tok.target")].map((t) => t.dataset.id).sort();
          const out = { ids, at: ui.drag?.at ?? ui.aim?.at ?? null };
          if (!sh) return out;
          // 모양 카드 — 화면에 보인 행 (선수:구역 스탯): 자리 옮기기 = 놓을 바닥 (.zone-pad.aim), 가로지르기 = 지금 바닥 (.from) + 놓을 바닥,
          // 그 밖 = 그 선수가 선 구역. 받는 선수 = 선이 닿은 후보 (.tok.target 중 주인 아닌 선수)
          const pad = (cls) => [...document.querySelectorAll(`.lesson-screen .zone-pad.${cls}`)].map((e) => e.dataset.zone);
          const aimPads = pad("aim");
          const fromPads = pad("from");
          const zones = s.run.lesson.zones || {};
          const rows = [];
          for (const id of [owner, ...ids.filter((x) => x !== owner)]) {
            if (!ids.includes(id)) continue;
            if (id === owner && sh.kind === "move") rows.push(`${id}:${aimPads[0] ?? "?"}`);
            else if (id === owner && sh.kind === "carry") rows.push(`${id}:${fromPads[0] ?? "?"}`, `${id}:${aimPads[0] ?? "?"}`);
            else rows.push(`${id}:${zones[id]}`);
          }
          out.rows = rows;
          out.zone = sh.needs === "zone" ? aimPads[0] ?? null : null;
          out.receiverId = sh.needs === "player" ? ids.find((x) => x !== owner) ?? null : null;
          out.ownerZone = zones[owner] ?? null;
          out.badPad = !!document.querySelector(".lesson-screen .zone-pad.bad");
          out.line = (document.querySelector(".lesson-screen .aim-link.on")?.className || "").replace(/\s+/g, " ").trim() || null;
          out.arrow = !!document.querySelector(".lesson-screen .aim-arrow.on");
          out.ghost = !!document.querySelector(".lesson-screen .aim-ghost.on");
          return out;
        }, card?.shape ?? null, card?.ownerId ?? null);
      };
      if (rec.kind === "endTurn") {
        const how = way.startsWith("touch") ? "touch" : "mouse";
        label = `턴 끝 (${how})`;
        await press(".ls-btns .ls-end", how);
      } else if (rec.kind === "bench") {
        const tok = await boxOf(`.lesson-screen .tok[data-id="${rec.playerId}"] .tok-face`);
        const bench = await boxOf(".lesson-screen .ls-bench");
        if (way === "mouseClick" || way === "keys" || !tok || !bench) {
          label = "벤치 (명단 [벤치])";
          await press(`.ls-row[data-pid="${rec.playerId}"] .ls-bench-btn`);
        } else if (way.startsWith("touch")) {
          label = "벤치 (토큰 터치 끌기)";
          await touchDrag(center(tok), center(bench));
        } else {
          label = "벤치 (토큰 마우스 끌기)";
          await mouseDrag(center(tok), center(bench));
        }
      } else if (card?.heal) {
        const row = await boxOf(`.ls-row[data-pid="${rec.playerId}"]`);
        const cb = await boxOf(`.ls-hand .card-face[data-uid="${rec.uid}"]`);
        if (way === "touchDrag") { label = "회복 (카드 → 명단 줄 터치 끌기)"; await touchDrag(center(cb), center(row)); }
        else if (way === "mouseDrag") { label = "회복 (카드 → 명단 줄 마우스 끌기)"; await mouseDrag(center(cb), center(row)); }
        else {
          const how = way.startsWith("touch") ? "touch" : "mouse";
          label = `회복 (카드 → 명단 줄 ${how === "touch" ? "탭" : "클릭"})`;
          await press(`.ls-hand .card-face[data-uid="${rec.uid}"]`, how);
          await delay(120);
          await press(`.ls-row[data-pid="${rec.playerId}"]`, how);
        }
      } else if (card?.shape?.needs) {
        // L40 고유 카드 — 받는 선수 · 구역이 필요한 모양 (§16.7). 모양마다 방식을 돌아가며 (첫 번째 = 계획의 대표 조작):
        //   이어 주기 = 주인 토큰 끌기, 연결 · 크로스 = 카드를 받는 선수 위로, 자리 옮기기 = 카드를 구역으로, 가로지르기 = 숫자 키
        const sh = card.shape;
        const kind = sh.cross ? "cross" : sh.kind;
        let list = SHAPE_WAYS[kind] || SHAPE_WAYS.pick;
        if (args.touchOnly) list = list.filter((w) => /touch|tap/i.test(w));
        const wi = shapeWayI[kind] || 0;
        shapeWayI[kind] = wi + 1;
        const sway = list[wi % list.length];
        const cb = await boxOf(`.ls-hand .card-face[data-uid="${rec.uid}"]`);
        const P = ptIn(field, info.shapeAt);
        const ownerFace = async () => boxOf(`.lesson-screen .tok[data-id="${card.ownerId}"] .tok-face`);
        const aimOn = () => S((uid) => window.__soccer.store.lessonUi.aim?.uid === uid, rec.uid);
        const where = sh.needs === "zone" ? `구역 ${rec.zone}` : `받는 선수 ${rec.playerId}`;
        const shotKey = `${kind}-${sway}`;
        const holdShot = !shapeShots.has(shotKey) ? `lesson_${kind}_${sway}` : null;
        if (holdShot) shapeShots.add(shotKey);
        const hold = async () => { await readSeen(); if (holdShot) await snap(holdShot); };
        label = `${sh.chip} (${SHAPE_WAY_LABEL[sway]})`;
        if (sway === "cardMouseDrag") await mouseDrag(center(cb), P, { onHold: hold });
        else if (sway === "cardTouchDrag") await touchDrag(center(cb), P, { onHold: hold });
        else if (sway === "ownerDragMouse" || sway === "ownerDragTouch") {
          // 조준 먼저 (카드 클릭 · 탭) → 주인 토큰을 받는 선수 · 구역으로 끌기
          if (sway === "ownerDragMouse") await mouseClickAt(center(cb)); else await tapAt(center(cb));
          await delay(150);
          if (!(await aimOn())) report.fails.push(`카드 ${sway === "ownerDragMouse" ? "클릭" : "탭"}에 조준되지 않음 (${card.name})`);
          const ob = await ownerFace();
          if (!ob) report.fails.push(`주인 토큰을 찾지 못함 (${card.name})`);
          else if (sway === "ownerDragMouse") await mouseDrag(center(ob), P, { onHold: hold });
          else await touchDrag(center(ob), P, { onHold: hold });
        } else if (sway === "tapTwice") {
          await tapAt(center(cb));
          await delay(150);
          await tapAt(P);
          await delay(150);
          const placed = await S(() => { const a = window.__soccer.store.lessonUi.aim; return !!(a && (a.at || a.playerId || a.zone)); });
          if (!placed) report.fails.push(`터치 탭 1번에 ${sh.needs === "zone" ? "구역" : "받는 선수"}가 정해지지 않음 (${card.name})`);
          await hold();
          await tapAt(P);
        } else if (sway === "mouseClick") {
          await mouseClickAt(center(cb));
          await delay(120);
          await page.mouse.move(P.x, P.y, { steps: 5 });
          await delay(120);
          await hold();
          await page.mouse.click(P.x, P.y);
        } else {
          // 키보드: 카드 클릭 → (구역 모양) 숫자 키 / (받는 선수 모양) → 로 후보 돌기 → Enter
          await mouseClickAt(center(cb));
          await delay(100);
          const dock = await boxOf(".ls-dock .ls-info");
          if (dock) await page.mouse.move(dock.x + 10, dock.y + 10);
          let ok = false;
          if (sh.needs === "zone") {
            if (info.zoneKey) await page.keyboard.press(info.zoneKey);
            await delay(60);
            ok = await S((z) => window.__soccer.store.lessonUi.aim?.zone === z, rec.zone);
            if (!ok) {
              // 가로지르기는 지금 구역 숫자를 무시한다 · 자리 옮기기 제자리는 숫자 키로 고를 수 있다 — 안 되면 → 로 후보
              const n = await S((uid) => window.__soccer.run.dropCandidates(window.__soccer.store.run, window.__soccer.store.data, { uid }).length, rec.uid);
              for (let k = 0; k < n && !ok; k++) {
                await page.keyboard.press("ArrowRight");
                await delay(40);
                ok = await S((z) => window.__soccer.store.lessonUi.aim?.zone === z, rec.zone);
              }
              if (ok) report.fails.push(`숫자 키 ${info.zoneKey}로 구역 ${rec.zone}이 골라지지 않아 → 후보로 (${card.name})`);
            }
          } else {
            const n = await S((uid) => window.__soccer.run.dropCandidates(window.__soccer.store.run, window.__soccer.store.data, { uid }).length, rec.uid);
            for (let k = 0; k < n && !ok; k++) {
              await page.keyboard.press("ArrowRight");
              await delay(40);
              ok = await S((pid) => window.__soccer.store.lessonUi.aim?.playerId === pid, rec.playerId);
            }
          }
          if (!ok) report.fails.push(`키보드로 ${where}를 고르지 못함 (${card.name})`);
          await delay(60);
          await hold();
          await page.keyboard.press("Enter");
        }
        count(`모양 ${kind}: ${SHAPE_WAY_LABEL[sway]}`);
        if (seen) {
          // 놓기 직전 화면이 고른 받는 선수 · 구역과 같은가 (끌기 · 탭은 화면 px → 필드 % 라 다르면 drift 로)
          if (sh.needs === "zone" && seen.zone !== rec.zone) report.drift.push(`${card.name} ${label}: 고른 구역 ${rec.zone} → 화면 ${seen.zone}`);
          if (sh.needs === "player" && seen.receiverId !== rec.playerId) report.drift.push(`${card.name} ${label}: 고른 선수 ${rec.playerId} → 화면 ${seen.receiverId}`);
          if (seen.badPad) report.fails.push(`놓기 직전 빨간 바닥 (.zone-pad.bad) — ${card.name} ${label}`);
          if (sh.needs === "player" && !seen.line) report.fails.push(`놓기 직전 패스 선 (.aim-link.on) 없음 — ${card.name} ${label}`);
          if (sh.needs === "zone" && seen.zone !== seen.ownerZone && !(seen.arrow && seen.ghost)) report.fails.push(`놓기 직전 화살표 · 유령 없음 — ${card.name} ${label}`);
        }
      } else if (card && (card.targetKind === "circle" || card.targetKind === "single")) {
        const cb = await boxOf(`.ls-hand .card-face[data-uid="${rec.uid}"]`);
        const p = ptIn(field, rec.at);
        if (way === "mouseDrag") { label = `${card.targetKind} (마우스 끌기)`; await mouseDrag(center(cb), p, { onHold: readSeen }); }
        else if (way === "touchDrag") {
          label = `${card.targetKind} (터치 끌기)`;
          const shot = !touchShotDone && card.targetKind === "circle" ? "lesson_touch_drag" : null;
          if (shot) touchShotDone = true;
          await touchDrag(center(cb), p, { shot, onHold: readSeen });
        } else if (way === "touchTap") {
          label = `${card.targetKind} (터치 탭: 카드 → 자리 → 한 번 더)`;
          await tapAt(center(cb));
          await delay(150);
          await tapAt(p);
          await delay(150);
          const placed = await S(() => window.__soccer.store.lessonUi.aim?.at ?? null);
          if (!placed) report.fails.push(`터치 탭 1번에 자리가 놓이지 않음 (${card.name})`);
          await readSeen();
          await tapAt(p);
        } else if (way === "mouseClick") {
          label = `${card.targetKind} (마우스: 카드 클릭 → 경기장 클릭)`;
          await mouseClickAt(center(cb));
          await delay(120);
          await page.mouse.move(p.x, p.y, { steps: 5 });
          await delay(120);
          await readSeen();
          await page.mouse.click(p.x, p.y);
        } else {
          // 키보드: 카드 클릭 → 후보 돌기(→)로 추천 자리와 같은 후보를 찾아 Enter
          label = `${card.targetKind} (키보드 → … Enter)`;
          await mouseClickAt(center(cb));
          await delay(100);
          // 마우스가 경기장 위에 있으면 hover 가 자리를 덮으므로 dock 으로 치운다
          const info2 = await boxOf(".ls-dock .ls-info");
          if (info2) await page.mouse.move(info2.x + 10, info2.y + 10);
          const n = await S((uid) => window.__soccer.run.dropCandidates(window.__soccer.store.run, window.__soccer.store.data, { uid }).length, rec.uid);
          let ok = false;
          for (let k = 0; k < n && !ok; k++) {
            await page.keyboard.press("ArrowRight");
            await delay(40);
            ok = await S((recAt) => { const a = window.__soccer.store.lessonUi.aim?.at; return !!(a && recAt && Math.abs(a.x - recAt.x) < 0.01 && Math.abs(a.y - recAt.y) < 0.01); }, rec.at);
          }
          if (!ok) label += " — 추천 자리가 후보에 없어 마지막 후보로";
          await delay(60);
          await readSeen();
          await page.keyboard.press("Enter");
        }
      } else if (card) {
        // 전체 · 주인 · 없음 · (L40) 주인 둘레 원 · 구역 전원 · 마무리 — 고유 카드는 모양별로 돌아가며 (첫 번째 = 터치 두 번)
        const cb = await boxOf(`.ls-hand .card-face[data-uid="${rec.uid}"]`);
        const ownerWays = args.touchOnly ? OWNER_WAYS.filter((x) => x.startsWith("touch")) : OWNER_WAYS;
        const w = card.shape ? ownerWays[ownerWayI++ % ownerWays.length] : way;
        const tk = card.shape ? card.shape.chip : card.targetKind;
        const holdShot = card.shape && !shapeShots.has(`${card.shape.kind}-${card.shape.chip}`) ? `lesson_${card.shape.kind}_${w}` : null;
        if (holdShot) shapeShots.add(`${card.shape.kind}-${card.shape.chip}`);
        const hold = async () => { await readSeen(); if (holdShot) await snap(holdShot); };
        if (w === "mouseDrag") { label = `${tk} (마우스 끌기 → 경기장)`; await mouseDrag(center(cb), ptIn(field, { x: 50, y: 50 }), { onHold: card.shape ? hold : null }); }
        else if (w === "touchDrag") { label = `${tk} (터치 끌기 → 경기장)`; await touchDrag(center(cb), ptIn(field, { x: 50, y: 50 }), { onHold: card.shape ? hold : null }); }
        else if (w === "touchTap") {
          label = `${tk} (카드 탭 두 번)`;
          await tapAt(center(cb));
          await delay(150);
          const aimed = await S(() => window.__soccer.store.lessonUi.aim?.uid ?? null);
          if (aimed !== rec.uid) report.fails.push(`카드 탭 1번에 조준되지 않음 (${card.name}: 조준 ${aimed})`);
          if (card.shape) await hold();
          await tapAt(center(cb));
        }
        else {
          label = `${tk} (카드 클릭 → [내기])`;
          await mouseClickAt(center(cb));
          await delay(120);
          if (card.shape) await hold();
          await press(".ls-btns .ls-play");
        }
        if (card.shape) count(`모양 ${card.shape.kind}: ${label.replace(/^.*\(|\)$/g, "")}`);
      }
      if (!card?.shape) count(label.replace(/ — .*/, "")); // 고유 카드는 위에서 "모양 …" 으로 센다
      // 바뀌었는가
      const changed = await page.waitForFunction((b, kind, pid) => {
        const s = window.__soccer.store;
        const L = s.run.lesson;
        if (s.run.phase !== "lesson" || !L) return true;
        if (kind === "bench") return (L.bench || []).includes(pid);
        if (kind === "endTurn") return L.turn !== b.turn;
        return L.seq !== b.seq;
      }, { timeout: 4000, polling: 50 }, before, rec.kind, rec.playerId ?? null).then(() => true, () => false);
      if (!changed) {
        report.fails.push(`입력이 먹지 않음: ${label} (${card?.name ?? rec.kind}, 턴 ${before.turn})`);
        await page.mouse.up().catch(() => {});
        await page.keyboard.press("Escape").catch(() => {});
        await delay(200);
        await S((r) => {
          const a = window.__soccer.actions;
          if (r.kind === "play") a.lessonCall("playCard", { uid: r.uid, at: r.at, playerId: r.playerId, zone: r.zone });
          else if (r.kind === "bench") a.lessonCall("benchPlayer", { playerId: r.playerId, on: true });
          else a.lessonCall("endLessonTurn");
          window.__soccer.render();
        }, rec);
        report.fallbacks.push(label);
        return;
      }
      if (rec.kind === "play" && card?.attached) {
        // 코치 지원 카드를 냈다 → 컷인 덮개 (§15.8 ②): 탭 · 클릭 = 넘기기 (덮개 아래 dock 을 눌러도 연출 중이라 아무 일 없어야 한다)
        const shown = await page.waitForSelector(".lesson-screen .ls-cutin.on", { timeout: 1500 }).then(() => true, () => false);
        if (!shown) report.fails.push(`컷인이 뜨지 않음 (${card.name})`);
        else {
          cutN++;
          if (cutN === 1) await snap("lesson_cutin");
          if (cutN % 3 !== 0) {
            const how = way.startsWith("touch") ? "touch" : "mouse";
            const b = await boxOf(".lesson-screen .ls-cutin.on");
            const p = { x: b.x + b.width / 2, y: b.y + b.height * 0.85 };
            if (how === "touch") await tapAt(p); else await mouseClickAt(p);
            const closed = await page.waitForFunction(() => !document.querySelector(".lesson-screen .ls-cutin.on"), { timeout: 400, polling: 20 }).then(() => true, () => false);
            if (!closed) report.fails.push(`컷인을 ${how === "touch" ? "탭" : "클릭"}으로 넘기지 못함 (${card.name})`);
            count(`컷인 넘기기 (${how === "touch" ? "탭" : "클릭"})`);
          } else {
            const closed = await page.waitForFunction(() => !document.querySelector(".lesson-screen .ls-cutin.on"), { timeout: 2500, polling: 50 }).then(() => true, () => false);
            if (!closed) report.fails.push(`컷인이 저절로 닫히지 않음 (${card.name})`);
            count("컷인 끝까지 보기");
          }
        }
      }
      if (rec.kind === "play" && card?.shape) {
        uniquesPlayed.add(card.cardId);
        const u = (uniquePlays[card.cardId] ||= { name: card.name, kind: card.shape.cross ? "cross" : card.shape.kind, chip: card.shape.chip, n: 0, ways: new Set() });
        u.n++;
        u.ways.add(label.replace(/^.*\(|\)$/g, "").replace(/ — .*/, ""));
      }
      if (rec.kind === "play" && card?.shape) {
        // L40 행 단위 (§16.12 U4): 실제 행 = lastFx 의 gain · fail (선수:스탯 — 가로지르기는 주인 두 행). 실패자는 마지막 행 1개만 남는다
        const fx = await S(() => (window.__soccer.store.run.lesson?.lastFx || []).filter((f) => f.t === "gain" || f.t === "fail").map((f) => ({ t: f.t, row: `${f.id}:${f.stat}`, id: f.id })));
        const actual = fx.map((f) => f.row);
        const failer = fx.find((f) => f.t === "fail")?.id ?? null;
        const collapse = (rows) => {
          if (!failer) return rows;
          const mine = rows.filter((r) => r.startsWith(`${failer}:`));
          return rows.filter((r) => !r.startsWith(`${failer}:`) || r === mine[mine.length - 1]);
        };
        const norm = (rows) => [...rows].sort().join(",");
        const exp = collapse(seen?.rows || info.pvRows || []);
        if (norm(actual) !== norm(exp)) report.targetMismatch.push(`${card.name} ${label}: ${seen ? "화면" : "미리보기"} 행 ${exp.join(",")} / 실제 ${actual.join(",")}`);
        if (seen?.rows && norm(collapse(seen.rows)) !== norm(collapse(info.pvRows || []))) {
          report.drift.push(`${card.name} ${label}: 추천 행 ${(info.pvRows || []).join(",")} → 화면 행 ${seen.rows.join(",")}`);
        }
        const mv = await S(() => (window.__soccer.store.run.lesson?.lastFx || []).filter((f) => f.t === "move" || f.t === "pass").map((f) => f.t));
        const k = card.shape.kind;
        if ((k === "move" && seen?.zone && seen.zone !== seen.ownerZone) || k === "carry") { if (!mv.includes("move")) report.fails.push(`옮기기 fx 없음 — ${card.name} ${label}`); }
        if ((k === "link" || k === "pick") && !mv.includes("pass")) report.fails.push(`패스 fx 없음 — ${card.name} ${label}`);
      } else if (rec.kind === "play" && card && !card.heal && card.targetKind !== "none") {
        // 실제 대상 = lastFx 의 gain · fail (카드 몫). 자리를 고르는 카드는 놓기 직전 화면에 보인 대상과, 나머지는 추천 미리보기와 비교
        const ids = await S(() => [...new Set((window.__soccer.store.run.lesson?.lastFx || []).filter((f) => f.t === "gain" || f.t === "fail").map((f) => f.id))].sort());
        const exp = seen ? seen.ids : info.pvIds || [];
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        if (!same(ids, exp)) report.targetMismatch.push(`${card.name} ${label}: ${seen ? "화면" : "미리보기"} ${exp.join(",")} / 실제 ${ids.join(",")}`);
        if (seen && !same(seen.ids, info.pvIds || [])) {
          report.drift.push(`${card.name} ${label}: 추천 자리 (${rec.at.x}, ${rec.at.y}) ${(info.pvIds || []).join(",")} → 놓은 자리 (${seen.at?.x}, ${seen.at?.y}) ${seen.ids.join(",")}`);
        }
      }
    }

    // ---- 2차 이벤트 (§24.13, I1): 이벤트 모달 · 결과 카드 · 보상 카드 3택1 ----
    const evShots = new Set();
    let evWay = 0;
    const evHow = () => (args.touchOnly ? "touch" : ["mouse", "touch"][evWay++ % 2]);
    const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
    /** 결과 카드가 떠 있으면 [계속] (처음 보는 종류는 찍는다). 떠 있었으면 true */
    async function resultCardStep(tag, kind) {
      const on = await S(() => !!document.querySelector("#modal-root .evm-result .evm-continue"));
      if (!on) return false;
      await delay(200);
      const r = await S(() => {
        const st = window.__soccer.store.run;
        return {
          text: (document.querySelector("#modal-root .evm-res-text")?.textContent || "").trim(),
          fx: document.querySelectorAll("#modal-root .evm-fx li").length,
          result: st.lastEvent?.result ?? null, lines: (st.lastEvent?.lines || []).length,
        };
      });
      if (!r.text) report.fails.push(`${tag} 결과 카드 글이 비었음`);
      if (norm(r.text) !== norm(r.result)) report.fails.push(`${tag} 결과 카드 글 ≠ lastEvent.result`);
      if (/[{}]/.test(r.text)) report.fails.push(`${tag} 결과 카드에 자리표시가 남음: ${r.text.slice(0, 40)}`);
      const key = `result-${kind || "?"}`;
      if (!evShots.has(key)) { evShots.add(key); await snap(`${tag}_result_${kind || "event"}`); }
      report.resultCards++;
      await press("#modal-root .evm-result .evm-continue", args.touchOnly || report.resultCards % 2 ? "touch" : "mouse"); // 결과 카드는 이벤트 선택지와 따로 클릭 · 탭을 번갈아
      const closed = await page.waitForFunction(() => !document.querySelector("#modal-root .evm-result"), { timeout: 3000, polling: 50 }).then(() => true, () => false);
      if (!closed) {
        report.fails.push(`${tag} 결과 카드 [계속]이 먹지 않음`);
        report.fallbacks.push("결과 카드");
        await S(() => window.__soccer.actions.closeEventResult());
      }
      return true;
    }
    async function eventStep(ph) {
      const tag = `s${ph.season}w${ph.turn}`;
      await page.waitForSelector("#modal-root .event-modal .choice-btn", { timeout: 6000 }).catch(() => {});
      await delay(300);
      const info = await S(() => {
        const { store, run, manager, lessonEvents } = window.__soccer;
        const st = store.run;
        const data = store.data;
        const v = run.getEventView(st, data);
        const rec = manager.recommendEventChoice(st, data);
        const btns = [...document.querySelectorAll("#modal-root .event-modal .choice-btn")];
        const sp = (data.lesson && data.lesson.events && data.lesson.events.speech) || {};
        const pc = v.player ? (st.players.find((p) => p.id === v.player.id) || {}).charId : null;
        const ev = lessonEvents && lessonEvents.eventById ? lessonEvents.eventById(data, st.currentEvent?.eventId) : null;
        const ch = v.choices[rec.choice] || {};
        return {
          id: st.currentEvent?.eventId ?? null, kind: v.kind, badge: v.badge, title: v.title, text: v.text, lastSeq: st.lastEvent?.seq ?? null, rec,
          needs: !!(ch.needs && ch.needs.candidates && ch.needs.candidates.length), op: ch.needs ? ch.needs.op : null,
          nChoices: v.choices.length, btns: btns.length, recIdx: btns.findIndex((b) => b.classList.contains("recommended")),
          busts: document.querySelectorAll("#modal-root .evm-bust").length, bustArt: document.querySelectorAll("#modal-root .evm-bust img.pt").length,
          // 흉상이 있어야 하는 이벤트 = 주인공 · 코치 · 등장 선수 (art.charIds) 가 있는 것 (시즌 시작 같은 주인공 없음은 흉상 없이)
          castWanted: !!(v.player || v.support || (v.art && ((v.art.charIds || []).length || v.art.supportId))),
          scene: v.scene, sceneImg: !!document.querySelector("#modal-root .evm-scene"),
          shownText: (document.querySelector("#modal-root .event-modal .event-text")?.textContent || "").trim(),
          shownTitle: (document.querySelector("#modal-root .event-modal .evm-title")?.textContent || "").trim(),
          banmal: pc ? sp[pc] === "banmal" : false, alt: !!(ev && ev.alt && ev.alt.banmal), who: v.player ? v.player.name : null,
          story: ev && ev.story ? ev.story : null, chain: ev && ev.chain ? ev.chain : null,
        };
      });
      const et = `${tag} 이벤트 ${info.id}`;
      if (info.btns !== info.nChoices || info.btns !== 2) report.fails.push(`${et}: 선택지 버튼 ${info.btns}개 (뷰 ${info.nChoices})`);
      if (info.recIdx !== info.rec.choice) report.fails.push(`${et}: 화면 추천 ${info.recIdx} ≠ 감독 추천 ${info.rec.choice}`);
      if (norm(info.shownText) !== norm(info.text)) report.fails.push(`${et}: 화면 본문 ≠ 뷰 본문`);
      if (/[{}]/.test(info.shownText) || /[{}]/.test(info.shownTitle)) report.fails.push(`${et}: 자리표시가 남음`);
      if (info.castWanted && !info.busts) report.fails.push(`${et}: 흉상이 없음`);
      if (info.kind === "story") {
        // 외출 이야기: 바로 앞 외출의 선수 · 다음 화와 같아야 한다 (§24.7)
        const o = report.outings.at(-1);
        if (!o || o.charId !== info.story?.charId || o.next !== info.story?.ep) report.fails.push(`${et}: 이야기 ${info.story?.charId} ${info.story?.ep}화 ≠ 외출 ${o ? `${o.charId} ${o.next}화` : "없음"}`);
      }
      const key = `ev-${info.kind}`;
      if (!evShots.has(key)) { evShots.add(key); await snap(`${tag}_event_${info.kind}`); }
      if (info.banmal && info.alt && !evShots.has("ev-banmal")) { evShots.add("ev-banmal"); await snap(`${tag}_event_banmal`); }
      const how = evHow();
      let ok = await press(`#modal-root .event-modal .choice-btn[data-choice="${info.rec.choice}"]`, how);
      if (ok && info.needs) {
        // 덱 고르기 (§24.5.3): 추천 카드 → [확정]
        ok = await page.waitForSelector("#modal-root .evm-deck", { timeout: 2000 }).then(() => true, () => false);
        if (!ok) report.fails.push(`${et}: 덱 고르기가 열리지 않음`);
        else {
          await delay(150);
          // 감독 추천 카드가 처음부터 골라져 있으면 (화면이 recommendEventChoice.uid 를 미리 고른다) 누르지 않는다 — 다시 누르면 고르기가 풀린다
          const cardSel = `#modal-root .evm-deck .mini-card[data-uid="${info.rec.uid}"]`;
          const pre = await S((sel) => !!document.querySelector(sel)?.classList.contains("selected"), cardSel);
          if (!pre) ok = await press(cardSel, how);
          else count("이벤트 덱 고르기: 추천 카드가 미리 골라져 있음");
          await delay(150);
          const selOk = await S((sel) => !!document.querySelector(sel)?.classList.contains("selected"), cardSel);
          if (!selOk) report.fails.push(`${et}: 덱 고르기에서 추천 카드 ${info.rec.uid} 가 골라지지 않음`);
          if (!evShots.has("ev-pick")) { evShots.add("ev-pick"); await snap(`${tag}_event_pick_${info.op}`); }
          if (ok) ok = await press("#modal-root .evm-pick-ok:not([disabled])", how);
        }
      }
      const resolved = ok && await page.waitForFunction((s0) => (window.__soccer.store.run.lastEvent?.seq ?? null) !== s0, { timeout: 4000, polling: 50 }, info.lastSeq).then(() => true, () => false);
      count(`이벤트 (${how === "touch" ? "탭" : "클릭"}${info.needs ? " · 덱 고르기" : ""})`);
      if (!resolved) {
        report.fails.push(`${et}: 선택지 입력이 먹지 않음 (${how})`);
        report.fallbacks.push("이벤트");
        await S((r) => { window.__soccer.actions.resolveEvent(r.choice, r.uid ? { uid: r.uid } : {}); }, info.rec);
      }
      report.events.push({ season: ph.season, week: ph.turn, id: info.id, kind: info.kind, badge: info.badge, choice: info.rec.choice, pick: info.needs ? info.op : null, how, banmal: info.banmal, alt: info.alt, who: info.who, story: info.story, chain: info.chain, sceneImg: info.sceneImg, bustArt: info.bustArt });
      const shown = await page.waitForSelector("#modal-root .evm-result .evm-continue", { timeout: 3000 }).then(() => true, () => false);
      if (!shown) report.fails.push(`${et}: 결과 카드가 뜨지 않음`);
      else await resultCardStep(tag, info.kind);
    }
    async function cardOfferStep(ph) {
      const tag = `s${ph.season}w${ph.turn}`;
      await page.waitForSelector("#modal-root .card-offer-modal .cof-ok", { timeout: 6000 }).catch(() => {});
      await delay(250);
      const info = await S(() => {
        const { store, manager } = window.__soccer;
        return { rec: manager.recommendCardOffer(store.run, store.data), n: document.querySelectorAll("#modal-root .cof-offer .card-face").length, deck: store.run.deck.length, tp: store.run.trainingPoints };
      });
      if (info.n !== 3) report.fails.push(`${tag} 3택1: 카드 ${info.n}장`);
      if (!report.offers.length) await snap(`${tag}_card_offer`);
      const how = evHow();
      let ok = info.rec.pick != null ? await press("#modal-root .cof-offer .card-face", how, info.rec.pick) : await press("#modal-root .cof-skip", how);
      await delay(150);
      if (ok) ok = await press("#modal-root .cof-ok:not([disabled])", how);
      const moved = ok && await page.waitForFunction(() => window.__soccer.store.run.phase !== "cardOffer", { timeout: 4000, polling: 50 }).then(() => true, () => false);
      count(`3택1 (${how === "touch" ? "탭" : "클릭"})`);
      if (!moved) {
        report.fails.push(`${tag} 3택1 입력이 먹지 않음 (${how})`);
        report.fallbacks.push("3택1");
        await S((p) => window.__soccer.actions.resolveCardOffer({ pick: p }), info.rec.pick ?? null);
      }
      const after = await S(() => ({ deck: window.__soccer.store.run.deck.length, tp: window.__soccer.store.run.trainingPoints }));
      if (info.rec.pick == null && !(after.tp > info.tp)) report.fails.push(`${tag} 3택1 건너뛰기 뒤 TP 가 늘지 않음`);
      report.offers.push({ season: ph.season, week: ph.turn, pick: info.rec.pick, deck: `${info.deck}→${after.deck}` });
    }

    // ---- 주 · 그 밖 화면 ----
    let lastPhaseKey = "";
    let outingsForced = 0;
    const until = args.until;
    const deadline = t0 + args.maxMin * 60000;
    let guard = 0;
    while (Date.now() < deadline && guard++ < 5000) {
      const ph = await phaseNow();
      // 이벤트 결과 카드 (화면 전용 — 다음 phase 화면보다 먼저 뜬다): [계속]
      if (ph.phase !== "lesson" && (await resultCardStep(`s${ph.season}w${ph.turn}`, null))) continue;
      const key = `${ph.phase}-${ph.season}-${ph.turn}`;
      if (ph.phase !== "lesson" && key !== lastPhaseKey) {
        if (ph.phase === "reward") await page.waitForSelector("#modal-root .reward-modal", { timeout: 8000 }).catch(() => {}); // 레슨 끝 연출 뒤에 뜬다
        await delay(250);
        await snap(`s${ph.season}w${ph.turn}_${ph.phase}`);
        report.phases[ph.phase] = (report.phases[ph.phase] || 0) + 1;
        lastPhaseKey = key;
        for (const t of await errToasts()) report.toasts.push(`${key}: ${t}`);
      }
      if (ph.phase === "finished") break;
      if (until === "season" && ph.season >= 2) break;
      if (until === "lesson" && lessonsDone >= 1) break;
      if (args.lessons && lessonsDone >= args.lessons) break;

      if (ph.phase === "lesson") {
        if (key !== lastPhaseKey) {
          lastPhaseKey = key;
          report.phases.lesson = (report.phases.lesson || 0) + 1;
          await lessonIdle();
          await snap(`s${ph.season}w${ph.turn}_lesson_start`);
        }
        await lessonStep();
        const after = await phaseNow();
        if (after.phase !== "lesson") {
          lessonsDone++;
          const r = await S(() => {
            const pr = window.__soccer.store.run.pendingReward;
            const res = pr?.result;
            return res ? { status: res.status, score: res.score, target: res.target, attaches: res.attaches ?? 0, cutins: Array.isArray(res.cutins) ? res.cutins.length : (res.cutins ?? 0) } : null;
          });
          report.lessons.push({ season: ph.season, week: ph.turn, seenCut: cutN - lessonCut0, ...(r || {}) });
          lessonCut0 = cutN;
          await delay(1600); // 레슨 끝 연출
        }
        continue;
      }
      if (ph.phase === "week") {
        let rec = await S(() => { const { reason, ...a } = window.__soccer.manager.recommendWeek(window.__soccer.store.run, window.__soccer.store.data); return a; });
        if (args.outings > outingsForced && rec.type !== "outing") {
          // --outings: 외출을 고를 수 있는 자유 주면 외출 (상대 = manager outingPartner 와 같은 규칙)
          const alt = await S(() => {
            const st = window.__soccer.store.run;
            const v = window.__soccer.run.getWeekView(st, window.__soccer.store.data);
            if (!(v.actions || []).some((a) => a.type === "outing")) return null;
            const stam = (p) => Number((st.players.find((x) => x.id === p.id) || {}).stamina) || 0;
            const withStory = (v.players || []).filter((p) => p.story && p.story.next !== null);
            const pool = withStory.length ? withStory : v.players || [];
            let best = null;
            for (const p of pool) if (!best || stam(p) < stam(best)) best = p;
            return best ? { type: "outing", playerId: best.id, forced: true } : null;
          });
          if (alt) { rec = alt; outingsForced++; count("주: 외출 (--outings)"); }
        }
        let ok = false;
        if (rec.type === "lesson") ok = await press(`.week-lesson[data-zone="${rec.zone}"]`);
        else if (rec.type === "rest") ok = await press(".week-rest");
        else if (rec.type === "outing") {
          ok = await press(rec.free ? ".week-bar .free-outing" : '.week-act[data-act="outing"]');
          if (ok) {
            await page.waitForSelector("#modal-root .outing-pick", { timeout: 3000 }).catch(() => {});
            await delay(250);
            // 추천 줄의 배지 (이야기 n/3화 · 일반 외출) — 엔진 getWeekView players[].story 와 같은지
            const pickSel = rec.forced ? `#modal-root .outing-pick[data-pid="${rec.playerId}"]` : "#modal-root .outing-pick.recommended";
            const o = await S((pid, sel) => {
              const b = document.querySelector(sel);
              const st = window.__soccer.store.run;
              const v = window.__soccer.run.getWeekView(st, window.__soccer.store.data);
              const p = (v.players || []).find((x) => x.id === pid);
              return {
                pid: b?.dataset.pid ?? null, story: b?.dataset.story || "", badge: (b?.querySelector(".op-story")?.textContent || "").trim(),
                engineNext: p?.story?.next ?? null, name: p?.name ?? null, charId: (st.players.find((x) => x.id === pid) || {}).charId ?? null,
                rows: document.querySelectorAll("#modal-root .outing-pick").length, storyRows: document.querySelectorAll("#modal-root .outing-pick .op-story:not(.op-plain)").length,
              };
            }, rec.playerId, pickSel);
            if (o.pid !== rec.playerId) report.fails.push(`외출 모달 추천 줄 ${o.pid} ≠ 감독 추천 ${rec.playerId}`);
            if (String(o.engineNext ?? "") !== o.story) report.fails.push(`외출 배지 ${o.story || "일반"} ≠ 엔진 다음 화 ${o.engineNext ?? "없음"} (${o.name})`);
            report.outings.push({ season: ph.season, week: ph.turn, free: !!rec.free, forced: !!rec.forced, name: o.name, charId: o.charId, next: o.engineNext, badge: o.badge, storyRows: o.storyRows, rows: o.rows });
            if (report.outings.length === 1) await snap(`s${ph.season}w${ph.turn}_outing_modal`);
            ok = await press(pickSel);
          }
        } else if (rec.type === "meeting") {
          ok = await press('.week-act[data-act="meeting"]');
          if (ok) { await delay(250); await snap(`s${ph.season}w${ph.turn}_meeting`); ok = await pressText(/미팅 진행/, "mouse", "#modal-root"); }
        } else if (rec.type === "friendly") {
          ok = await press('.week-act[data-act="friendly"]');
          if (ok) { await delay(200); ok = await pressText(/경기 시작/, "mouse", "#modal-root"); }
        } else ok = await press(`.week-act[data-act="${rec.type}"]`);
        count(`주: ${rec.type}`);
        if (!ok) { report.fallbacks.push(`주 ${rec.type}`); await S((a) => window.__soccer.actions.weekAction(a), rec); }
        const moved = await page.waitForFunction((k) => { const r = window.__soccer.store.run; return `${r.phase}-${r.season}-${r.turn}` !== k || r.phase !== "week"; }, { timeout: 8000, polling: 50 }, key).then(() => true, () => false);
        if (!moved) {
          report.fails.push(`주 행동 뒤 화면이 바뀌지 않음 (${rec.type})`);
          report.fallbacks.push(`주 ${rec.type}`);
          await S((a) => { window.__soccer.closeOverlays?.(); window.__soccer.actions.weekAction(a); }, rec);
        }
        continue;
      }
      if (ph.phase === "reward") {
        await page.waitForSelector("#modal-root .reward-modal", { timeout: 8000 }).catch(() => report.fails.push("보상 모달이 뜨지 않음"));
        await delay(300);
        // §18 코치 수업 단계 — 수업이 남아 있으면 감독 추천(recommendTeach)대로 선수 칩 → [가르치기] (또는 [배우지 않기]) 를 누른다.
        //   입력은 돌아가며: 마우스 클릭 · 터치 탭 · 키보드 (focus → Enter). 행동마다 pendingReward.teach 항목이 하나 끝났는지 본다.
        const teachCur = await S(() => !!window.__soccer.store.run.pendingReward?.teach?.some?.((t) => !t.result));
        if (teachCur) {
          const tinfo = await S(() => {
            const st = window.__soccer.store.run;
            const done = st.pendingReward.teach.filter((t) => t.result).length;
            const cur = st.pendingReward.teach.find((t) => !t.result);
            return { done, total: st.pendingReward.teach.length, skillId: cur?.skillId, learned0: JSON.stringify(st.players.map((p) => p.learnedSkillIds || [])), sp0: st.skillPoints };
          });
          const rec = await S(() => window.__soccer.manager.recommendTeach(window.__soccer.store.run, window.__soccer.store.data));
          const how = args.touchOnly ? "touch" : (["mouse", "touch", "key"])[teachN++ % 3];
          const hit = async (sel) => {
            if (how !== "key") return press(sel, how);
            if (!(await boxOf(sel))) return false;
            await page.focus(sel).catch(() => {});
            const focused = await S((s) => document.activeElement === document.querySelector(s), sel);
            if (!focused) return false;
            await page.keyboard.press("Enter");
            return true;
          };
          let ok;
          if (rec.playerId) {
            ok = await hit(`#modal-root .rw-teach-pl[data-pid="${rec.playerId}"]`);
            await delay(150);
            if (ok) {
              await snap(`s${ph.season}w${ph.turn}_teach${tinfo.done + 1}_pick`);
              ok = await hit("#modal-root .rw-teach-ok:not([disabled])");
            }
          } else ok = await hit("#modal-root .rw-teach-skip");
          count(`코치 수업 (${how === "key" ? "키보드" : how === "touch" ? "탭" : "클릭"}) — ${rec.playerId ? "가르치기" : "받지 않기"}`);
          const advanced = ok && await page.waitForFunction((d) => (window.__soccer.store.run.pendingReward?.teach || []).filter((t) => t.result).length > d || window.__soccer.store.run.phase !== "reward", { timeout: 4000, polling: 50 }, tinfo.done).then(() => true, () => false);
          if (!advanced) {
            report.fails.push(`코치 수업 입력이 먹지 않음 (${how}, ${tinfo.skillId})`);
            report.fallbacks.push("코치 수업");
            await S((r) => window.__soccer.actions.resolveTeach(r), rec);
          } else {
            // 엔진 변화 확인: 받은 선수의 learnedSkillIds 에 그 스킬 / 받지 않기면 SP +declineSp
            const chk = await S((pid, sk) => {
              const st = window.__soccer.store.run;
              const p = st.players.find((x) => x.id === pid);
              return { has: !!p && (p.learnedSkillIds || []).includes(sk), sp: st.skillPoints, name: p?.name ?? null };
            }, rec.playerId, tinfo.skillId);
            if (rec.playerId && !chk.has) report.fails.push(`수업 뒤 선수에게 스킬이 없음 (${tinfo.skillId} → ${rec.playerId})`);
            if (!rec.playerId && !(chk.sp > tinfo.sp0)) report.fails.push(`받지 않기 뒤 SP 가 늘지 않음 (${tinfo.sp0} → ${chk.sp})`);
            report.teach.push({ season: ph.season, week: ph.turn, skillId: tinfo.skillId, to: rec.playerId ? chk.name : "SP", how, step: `${tinfo.done + 1}/${tinfo.total}` });
          }
          await delay(200);
          continue;
        }
        const rec = await S(() => window.__soccer.manager.recommendReward(window.__soccer.store.run, window.__soccer.store.data));
        const status = await S(() => window.__soccer.store.run.pendingReward?.result?.status);
        let ok;
        if (status === "fail") ok = await pressText(/^계속$/, "mouse", "#modal-root");
        else {
          if (rec.pick != null) await press("#modal-root .rw-offer .card-face", "mouse", rec.pick);
          else await press("#modal-root .rw-skip");
          if (rec.upgradeUid) await press(`#modal-root .rw-deck .mini-card[data-uid="${rec.upgradeUid}"]`);
          await delay(150);
          await snap(`s${ph.season}w${ph.turn}_reward_pick`);
          ok = await press("#modal-root .rw-ok");
        }
        count("보상");
        const moved = await page.waitForFunction(() => window.__soccer.store.run.phase !== "reward", { timeout: 8000 }).then(() => true, () => false);
        if (!moved) {
          report.fails.push("보상 뒤 화면이 바뀌지 않음");
          report.fallbacks.push("보상");
          await S((r) => window.__soccer.actions.resolveReward(r), rec);
        }
        continue;
      }
      if (ph.phase === "consult") {
        const rec = await S(() => window.__soccer.manager.recommendConsult(window.__soccer.store.run, window.__soccer.store.data));
        // 바뀌었는지 볼 기준은 누르기 전에
        const before = await S(() => JSON.stringify([window.__soccer.store.run.trainingPoints, window.__soccer.store.run.skillPoints, window.__soccer.store.run.deck.length, window.__soccer.store.run.phase]));
        let ok = false;
        if (rec.op === "end") ok = await press(".consult-screen .cs-end");
        else if (rec.op === "buy") ok = await press(`.cs-item[data-index="${rec.index}"] .cs-buy-btn`);
        else if (rec.op === "skill") {
          // L48 패시브 상점 압축판: 선수 줄의 패시브 칩을 누르면 바로 산다
          ok = await press(`.consult-screen .ps-chip[data-skill="${rec.skillId}"][data-pid="${rec.playerId}"]`);
        } else if (rec.op === "upgrade" || rec.op === "delete") {
          ok = await press(`.cs-deck-grid .mini-card[data-uid="${rec.uid}"]`);
          await delay(120);
          if (ok) ok = await press(rec.op === "upgrade" ? ".cs-ops .cs-upgrade" : ".cs-ops .cs-delete");
          await delay(150);
          if (ok && rec.op === "delete" && (await boxOf("#modal-root .cs-confirm-del"))) ok = await press("#modal-root .cs-confirm-del");
        }
        count(`상담: ${rec.op}`);
        const changed = ok && await page.waitForFunction((b) => JSON.stringify([window.__soccer.store.run.trainingPoints, window.__soccer.store.run.skillPoints, window.__soccer.store.run.deck.length, window.__soccer.store.run.phase]) !== b, { timeout: 3000 }, before).then(() => true, () => false);
        if (!changed && (await phaseNow()).phase === "consult") {
          report.fallbacks.push(`상담 ${rec.op}`);
          await S((a) => { if (a.op === "end") window.__soccer.actions.endConsult(); else window.__soccer.actions.consultAction(a); }, rec);
        }
        continue;
      }
      if (ph.phase === "prep") {
        const ok = await pressText(/경기 시작/, "mouse", ".prep-screen");
        count("준비: 경기 시작");
        if (!ok) { report.fallbacks.push("준비"); await S(() => window.__soccer.actions.confirmPrep({})); }
        const moved = await page.waitForFunction(() => window.__soccer.store.run.phase !== "prep", { timeout: 8000 }).then(() => true, () => false);
        if (!moved) {
          report.fails.push("준비 뒤 화면이 바뀌지 않음");
          report.fallbacks.push("준비");
          await S(() => window.__soccer.actions.confirmPrep({}));
        }
        continue;
      }
      if (ph.phase === "match") {
        await page.waitForSelector(".match-screen .skip-btn", { timeout: 10000 }).catch(() => {});
        await delay(600);
        await snap(`s${ph.season}w${ph.turn}_match`);
        // --d25: 경기 화면이 2.5D 인가 (주소 ?d25=1), 아니면 평면인가
        const is25 = await S(() => !!document.querySelector(".match-screen.d25"));
        if (is25 !== !!args.d25) report.fails.push(`s${ph.season}w${ph.turn} 경기 화면 ${is25 ? "2.5D" : "평면"} (--d25 ${args.d25 ? "켬" : "끔"})`);
        if (args.watchMatch) await watchMatch(ph);
        for (let k = 0; k < 40 && (await phaseNow()).phase === "match"; k++) {
          if (await boxOf(".match-screen .skip-btn:not([disabled])")) await press(".match-screen .skip-btn:not([disabled])");
          await delay(500);
          if (await pressText(/^확인$/, "mouse", "#modal-root")) { await delay(400); break; }
        }
        count("경기: ⏭ → 확인");
        if ((await phaseNow()).phase === "match") report.fails.push("경기가 끝나지 않음");
        continue;
      }
      if (ph.phase === "relic") { count("유물"); if (!(await press("#modal-root .relic-card"))) report.fallbacks.push("유물"); await delay(400); continue; }
      if (ph.phase === "route") { count("루트"); if (!(await press(".route-card"))) report.fallbacks.push("루트"); await delay(400); continue; }
      if (ph.phase === "event") { await eventStep(ph); continue; }
      if (ph.phase === "cardOffer") { await cardOfferStep(ph); continue; }
      report.fails.push(`알 수 없는 phase ${ph.phase}`);
      break;
    }
    const fin = await phaseNow();
    report.end = fin;
    report.deckUniques = await S(() => [...new Set((window.__soccer.store.run.deck || []).map((e) => e.cardId).filter((id) => id.startsWith("cd_u_")))]);
    report.squad = await S(() => window.__soccer.store.run.players.map((p) => `${p.position}:${p.name}`).join(" "));
    report.lessonsDone = lessonsDone;
    report.learned = await S(() => window.__soccer.store.run.players.map((p) => `${p.name}[${(p.learnedSkillIds || []).join(",")}]`).join(" "));
    await snap(`end_${fin.phase}`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  // ---- 보고 ----
  log(`레슨판 한 판 점검 — seed ${args.seed} · 방침 ${args.policy} · 뷰포트 ${args.width}×${args.height}${args.mobile ? " (mobile)" : ""}${args.touchOnly ? " · 터치만" : ""}${args.d25 ? " · 2.5D (?d25=1)" : ""} · ${Math.round((Date.now() - t0) / 1000)}초`);
  log(`  끝: ${report.end ? `${report.end.phase} 시즌 ${report.end.season} ${report.end.turn}주` : "-"} · 레슨 ${report.lessonsDone ?? 0}번`);
  for (const l of report.lessons) log(`    레슨 시즌 ${l.season} ${l.week}주: ${l.status ?? "-"} ${l.score ?? ""}/${l.target ?? ""} · 붙기 ${l.attaches ?? "-"} · 컷인 ${l.cutins ?? "-"} (화면 ${l.seenCut})`);
  if (report.lessons.length) {
    const cs = report.lessons.map((l) => l.seenCut);
    const inBand = cs.filter((n) => n >= 2 && n <= 4).length;
    log(`  컷인 (화면): 레슨당 평균 ${(cs.reduce((x, y) => x + y, 0) / cs.length).toFixed(2)} · 2~4번 ${inBand}/${cs.length} · 분포 ${[0, 1, 2, 3, 4, 5].map((k) => `${k === 5 ? "5+" : k}:${cs.filter((n) => (k === 5 ? n >= 5 : n === k)).length}`).join(" ")}`);
    const mis = report.lessons.filter((l) => l.cutins != null && l.cutins !== l.seenCut);
    if (mis.length) report.fails.push(`엔진 컷인 수 ≠ 화면 컷인 수: ${mis.map((l) => `시즌 ${l.season} ${l.week}주 ${l.cutins}/${l.seenCut}`).join(", ")}`);
  }
  log(`  코치 수업 ${report.teach.length}번 (화면 입력):`);
  for (const t of report.teach) log(`    시즌 ${t.season} ${t.week}주 ${t.step}: ${t.skillId} → ${t.to} (${t.how === "key" ? "키보드" : t.how === "touch" ? "탭" : "클릭"})`);
  if (args.watchMatch) {
    log(`  경기 자동 진행 (--watch-match) ${report.matches.length}경기:`);
    for (const m of report.matches) {
      const fmtMap = (o) => Object.entries(o).map(([k, n]) => `${k} ${n}`).join(" · ") || "-";
      log(`    ${m.tag}: ${m.score ? `${m.score.home}:${m.score.away}` : "-"} · 필살기 cutin ${m.cutins} (등급 ${fmtMap(m.tiers)} / 종류 ${fmtMap(m.types)}) · 합체기 ${m.combos} · 역방향 ${m.revs} → 화면 카드 ${m.seenN}/${m.expected} · 잘림 ${m.clipped} · 찍은 장면 ${m.shots.join(", ") || "-"}${args.d25 ? ` · 카메라 z 표본 ${fmtMap(m.camZ || {})}` : ""}`);
    }
  }
  // 2차 이벤트 (I1)
  {
    const byKind = {};
    for (const e of report.events) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    log(`  이벤트 ${report.events.length}개 (화면 입력): ${Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(" · ") || "-"} · 결과 카드 ${report.resultCards} · 덱 고르기 ${report.events.filter((e) => e.pick).length} · 반말 주인공 ${report.events.filter((e) => e.banmal).length} (반말판 글 ${report.events.filter((e) => e.banmal && e.alt).length}) · 배경 그림 ${report.events.filter((e) => e.sceneImg).length}/${report.events.length}`);
    for (const e of report.events) log(`    시즌 ${e.season} ${e.week}주 [${e.badge}] ${e.id}${e.who ? ` (${e.who}${e.banmal ? " · 반말" : ""})` : ""} → 선택지 ${e.choice + 1}${e.pick ? ` · 카드 ${e.pick === "delete" ? "삭제" : "강화"}` : ""} (${e.how === "touch" ? "탭" : "클릭"})`);
    log(`  보상 카드 3택1 ${report.offers.length}번: ${report.offers.map((o) => `시즌 ${o.season} ${o.week}주 ${o.pick == null ? "건너뛰기" : `${o.pick + 1}번`} (덱 ${o.deck})`).join(" · ") || "-"}`);
    log(`  외출 ${report.outings.length}번: ${report.outings.map((o) => `시즌 ${o.season} ${o.week}주 ${o.name} [${o.badge}]${o.free ? " (무료)" : ""}${o.forced ? " (--outings)" : ""} · 이야기 배지 줄 ${o.storyRows}/${o.rows}`).join(" · ") || "-"}`);
    log(`  레슨 깜짝 ${report.surprises.length}번: ${report.surprises.map((x) => `${x.id} → ${x.choice + 1} (${x.how === "key" ? "숫자 키" : x.how === "touch" ? "탭" : "클릭"} · ${x.pos}${x.banner ? "" : " · 결과 띠 없음"})`).join(" · ") || "-"}`);
    if (report.legends) log(`  레전드: ${report.legends.picked.join(" · ")} → 시작 덱 메모리 카드 ${report.legends.deck.join(" · ") || "없음"} (state.legends ${report.legends.stateLegends})`);
    const coach = report.events.filter((e) => e.chain).map((e) => `${e.chain.supportId}#${e.chain.step}`);
    if (coach.length) log(`  코치 연속 이벤트: ${coach.join(" · ")}`);
    const story = report.events.filter((e) => e.story).map((e) => `${e.story.charId}#${e.story.ep}`);
    if (story.length) log(`  외출 이야기: ${story.join(" · ")}`);
  }
  log(`  런 끝 습득 스킬: ${report.learned ?? "-"}`);
  log(`  편성: ${report.squad ?? "-"}`);
  log("  고유 카드 (모양 · 낸 수 · 입력):");
  for (const id of report.deckUniques || []) {
    const u = uniquePlays[id];
    log(`    ${id}: ${u ? `${u.name} · ${u.chip} (${u.kind}) · ${u.n}번 · ${[...u.ways].join(" / ")}` : "안 냄"}`);
  }
  const missing = (report.deckUniques || []).filter((id) => !uniquePlays[id]);
  if (args.coverUniques && missing.length) report.fails.push(`덱의 고유 카드 중 안 낸 카드: ${missing.join(", ")}`);
  log(`  화면: ${Object.entries(report.phases).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
  log("  입력:");
  for (const [k, n] of Object.entries(report.actions).sort()) log(`    ${k}: ${n}`);
  const bad = (title, list) => { log(`  ${title}: ${list.length ? `${list.length}건` : "없음"}`); for (const x of list) log(`    · ${x}`); };
  bad("입력 실패", report.fails);
  bad("actions 로 대신한 것", report.fallbacks);
  bad("대상 불일치 (화면 · 미리보기 ≠ 실제)", report.targetMismatch);
  log(`  참고 — 추천 자리와 놓은 자리(화면 px → 필드 %)의 차이로 대상이 바뀐 것: ${report.drift.length ? `${report.drift.length}건` : "없음"}`);
  for (const x of report.drift) log(`    · ${x}`);
  bad("에러 토스트", report.toasts);
  bad("페이지 에러", report.errors);
  bad("스크롤", report.scroll);
  log(`  스크린샷 ${report.shots.length}장: ${outDir}`);
  const ok = !report.fails.length && !report.fallbacks.length && !report.targetMismatch.length && !report.toasts.length && !report.errors.length && !report.scroll.length;
  log(ok ? "  점검 통과" : "  점검 걸림");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exitCode = 1;
});
