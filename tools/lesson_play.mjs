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
// --until season(기본) = 시즌 1 경계전 · 루트까지, lesson = 첫 레슨 끝까지, run = 15주 완주. --lessons N = 레슨 N번 끝나면 멈춤.
// --mobile = isMobile 뷰포트(터치 전용 기기처럼), --touch-only = 레슨 입력을 터치 방식만.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./scenarios.mjs";
import { startServer, findBrowser } from "./shot.mjs";

function parseArgs(argv) {
  const o = { outDir: null, seed: "play-1", policy: "team", until: "season", lessons: null, width: 1280, height: 720, mobile: false, touchOnly: false, maxMin: 25 };
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
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!o.outDir) o.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  if (!o.outDir) throw new Error("usage: node tools/lesson_play.mjs <outDir> [--seed S] [--policy P] [--until season|lesson|run] [--lessons N] [--width W --height H] [--mobile] [--touch-only]");
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
  const report = { errors: [], toasts: [], scroll: [], actions: {}, fails: [], fallbacks: [], targetMismatch: [], drift: [], shots: [], phases: {}, lessons: [] };
  const t0 = Date.now();
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => report.errors.push(`pageerror: ${e?.message ?? e}`));
    page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });
    await page.setViewport({ width: args.width, height: args.height, deviceScaleFactor: 1, isMobile: args.mobile, hasTouch: true });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "load" });
    await page.evaluate(() => { try { localStorage.clear(); } catch (_) { /* */ } });
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

    // ---- 시작 → 편성 (방침) → 기본 편성으로 시작 ----
    await snap("start");
    await pressText(/새 런 시작/);
    await page.waitForFunction(() => window.__soccer.store.screen === "setup", { timeout: 8000 });
    await press(`.policy-btn[data-policy="${args.policy}"]`);
    const seedBox = await boxOf("input.input");
    if (seedBox) { await mouseClickAt(center(seedBox)); await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control"); await page.keyboard.type(String(args.seed)); }
    await snap("setup");
    await pressText(/기본 편성으로 시작/);
    await page.waitForFunction(() => window.__soccer.store.screen === "run" && window.__soccer.store.run?.phase === "week", { timeout: 8000 });

    // ---- 레슨 한 행동 ----
    const MOUSE_WAYS = ["mouseDrag", "touchDrag", "touchTap", "mouseClick", "keys"];
    const TOUCH_WAYS = ["touchDrag", "touchTap"];
    let wayI = 0;
    let lessonsDone = 0;
    let touchShotDone = false;
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
    async function lessonStep() {
      await lessonIdle();
      await delay(350); // 새 손패 · 흩어지기 연출이 끝나도록 (사람처럼 한 박자 쉬고)
      const info = await S(() => {
        const { store, manager, run } = window.__soccer;
        const st = store.run;
        const rec = manager.recommendCard(st, store.data);
        const v = run.getLessonView(st, store.data);
        const card = rec.kind === "play" ? v.hand.find((c) => c.uid === rec.uid) : null;
        const pv = rec.kind === "play" ? run.previewCard(st, store.data, { uid: rec.uid, at: rec.at, playerId: rec.playerId }) : null;
        return { rec, card: card ? { uid: card.uid, name: card.name, targetKind: card.targetKind, heal: !!card.heal, size: card.size ?? null, attached: !!card.attach } : null, pvIds: pv ? (pv.targets || []).map((t) => t.id).sort() : null, healId: pv?.healId ?? null };
      });
      const before = await lessonSnap();
      const { rec, card } = info;
      const ways = args.touchOnly ? TOUCH_WAYS : MOUSE_WAYS;
      const way = ways[wayI++ % ways.length];
      const field = await boxOf(".lesson-screen .m-field");
      let label = "";
      // 내기 직전 화면에 보인 대상 (흰 고리 .tok.target) · 자리 — 끌기 · 탭은 화면 px → 필드 % 라 추천 자리와 조금 다를 수 있다
      let seen = null;
      const readSeen = async () => {
        seen = await S(() => {
          const ui = window.__soccer.store.lessonUi;
          return { ids: [...document.querySelectorAll(".lesson-screen .tok.target")].map((t) => t.dataset.id).sort(), at: ui.drag?.at ?? ui.aim?.at ?? null };
        });
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
        // 전체 · 주인 · 없음
        const cb = await boxOf(`.ls-hand .card-face[data-uid="${rec.uid}"]`);
        if (way === "mouseDrag") { label = `${card.targetKind} (마우스 끌기 → 경기장)`; await mouseDrag(center(cb), ptIn(field, { x: 50, y: 50 })); }
        else if (way === "touchDrag") { label = `${card.targetKind} (터치 끌기 → 경기장)`; await touchDrag(center(cb), ptIn(field, { x: 50, y: 50 })); }
        else if (way === "touchTap") {
          label = `${card.targetKind} (카드 탭 두 번)`;
          await tapAt(center(cb));
          await delay(150);
          const aimed = await S(() => window.__soccer.store.lessonUi.aim?.uid ?? null);
          if (aimed !== rec.uid) report.fails.push(`카드 탭 1번에 조준되지 않음 (${card.name}: 조준 ${aimed})`);
          await tapAt(center(cb));
        }
        else { label = `${card.targetKind} (카드 클릭 → [내기])`; await mouseClickAt(center(cb)); await delay(120); await press(".ls-btns .ls-play"); }
      }
      count(label.replace(/ — .*/, ""));
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
          if (r.kind === "play") a.lessonCall("playCard", { uid: r.uid, at: r.at, playerId: r.playerId });
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
      if (rec.kind === "play" && card && !card.heal && card.targetKind !== "none") {
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

    // ---- 주 · 그 밖 화면 ----
    let lastPhaseKey = "";
    const until = args.until;
    const deadline = t0 + args.maxMin * 60000;
    let guard = 0;
    while (Date.now() < deadline && guard++ < 5000) {
      const ph = await phaseNow();
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
          const r = await S(() => { const pr = window.__soccer.store.run.pendingReward; return pr ? { status: pr.result?.status, score: pr.result?.score, target: pr.result?.target } : null; });
          report.lessons.push({ season: ph.season, week: ph.turn, ...(r || {}) });
          await delay(1600); // 레슨 끝 연출
        }
        continue;
      }
      if (ph.phase === "week") {
        const rec = await S(() => { const { reason, ...a } = window.__soccer.manager.recommendWeek(window.__soccer.store.run, window.__soccer.store.data); return a; });
        let ok = false;
        if (rec.type === "lesson") ok = await press(`.week-lesson[data-zone="${rec.zone}"]`);
        else if (rec.type === "rest") ok = await press(".week-rest");
        else if (rec.type === "outing") {
          ok = await press(rec.free ? ".week-bar .free-outing" : '.week-act[data-act="outing"]');
          if (ok) { await delay(200); ok = await press("#modal-root .outing-pick.recommended"); }
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
          const sel = `.cs-skill[data-skill="${rec.skillId}"]`;
          await page.select(`${sel} .cs-sk-player`, rec.playerId).catch(() => {});
          ok = await press(`${sel} .cs-learn`);
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
      if (ph.phase === "event") { count("이벤트"); await press("#modal-root .choice-btn"); await delay(400); continue; }
      report.fails.push(`알 수 없는 phase ${ph.phase}`);
      break;
    }
    const fin = await phaseNow();
    report.end = fin;
    report.lessonsDone = lessonsDone;
    await snap(`end_${fin.phase}`);
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  // ---- 보고 ----
  log(`레슨판 한 판 점검 — seed ${args.seed} · 방침 ${args.policy} · 뷰포트 ${args.width}×${args.height}${args.mobile ? " (mobile)" : ""}${args.touchOnly ? " · 터치만" : ""} · ${Math.round((Date.now() - t0) / 1000)}초`);
  log(`  끝: ${report.end ? `${report.end.phase} 시즌 ${report.end.season} ${report.end.turn}주` : "-"} · 레슨 ${report.lessonsDone ?? 0}번`);
  for (const l of report.lessons) log(`    레슨 시즌 ${l.season} ${l.week}주: ${l.status ?? "-"} ${l.score ?? ""}/${l.target ?? ""}`);
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
