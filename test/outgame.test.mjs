// test/outgame.test.mjs — 아웃게임 화면(가로 스테이지 1280×720) jsdom 검사
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 시작 → 편성(훈련 방침) → 주 선택(카드 레슨 시험판, hud.js) →
// 주 행동 6종(레슨 · 휴식 · 외출 · 전술 미팅 · 상담 · 친선전) · 무료 외출 · 대비 주 · 경기 전 준비 → 시나리오 주입(이벤트 · 유물 · 루트 · 결과)까지 각 화면이 스테이지(#stage) 안에 오류 없이 그려지고 주요 조작 요소가 있는지 본다.
// 저장 키는 js/ui/store.js KEYS ('soccer-lesson.' 앞머리, LESSON_PROTO_PLAN §2.2).
// 라인업 보드(편성 · 미팅, js/ui/lineup.js)는 포인터 이벤트로 드래그를 흉내 낸다 (jsdom 은 레이아웃이 없어 elementFromPoint 를 고정).
// 레이아웃(넘침 · 잘림)은 jsdom 이 계산하지 않으므로 tools/shot.mjs --only og 스크린샷으로 확인한다 (실제 마우스 드래그: og_setup_drag · og_meeting_drag …).
// jsdom 이 없으면(devDependency 미설치) 건너뛴다. fetch 는 fs 읽기로 폴리필한다 (ui.smoke.test.mjs 와 같은 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { KEYS } = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const { traitInfo } = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);

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

// ---- 정적 검사: 아웃게임 CSS 는 스테이지 논리 px 만 쓴다 (vw/vh · 창 크기 media query 금지 — base.css .stage 주석) ----
test("아웃게임 CSS: vw/vh/dvh 단위 · 창 크기 media query 없음, 옛 420px 폰 열 규칙 제거", () => {
  for (const f of ["css/base.css", "css/outgame.css", "css/lesson.css"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\d(?:\.\d+)?(?:vw|vh|dvh|svh|lvh|vmin|vmax)\b/.test(src), `${f}: 뷰포트 단위`);
    assert.ok(!/@media[^{]*(?:min|max)-(?:width|height)/.test(src), `${f}: 창 크기 media query`);
  }
  const og = fs.readFileSync(path.join(ROOT, "css/outgame.css"), "utf8");
  assert.ok(!/max-width:\s*420px/.test(og), "옛 세로 폰 열(420px) 규칙 제거");
  for (const sel of [".start-screen", ".setup-main", ".mini-pitch", ".topbar", ".roster", ".meeting-cols", ".ev-body", ".relic-row", ".route-row", ".result-main",
    ".sp-chips", ".lu-pool", ".lu-card", ".lu-ghost", ".lu-hint", ".drop-ok", ".drop-bad", ".lu-shake", ".meeting-board",
    ".challenge-screen", ".ch-ladder", ".ch-stage", ".ch-preview", ".ch-pitch", ".ch-result"]) {
    assert.ok(og.includes(sel), `outgame.css 에 ${sel}`);
  }
  // 카드 레슨 화면 (LESSON_PROTO_PLAN §9.2): lesson.css 는 match.css 다음에 링크
  const lesson = fs.readFileSync(path.join(ROOT, "css/lesson.css"), "utf8");
  for (const sel of [".week-screen", ".lesson-screen", ".card-face", ".reward-modal", ".consult-screen", ".prep-screen", ".policy-row", '.stage[data-mode="lesson"] #toast-root', ".ls-cutin", ".card-face.attached", ".cf-coach"]) {
    assert.ok(lesson.includes(sel), `lesson.css 에 ${sel}`);
  }
  for (const sel of [".meeting-cols", ".topbar", ".roster"]) assert.ok(og.includes(sel), `outgame.css 에 ${sel}`);
  // U2: 옛 훈련 화면(screens/training.js)은 지웠다 — 훈련 전용 규칙(훈련 칸 · 행동 바 · 훈련 시트 · 호출권 · 미팅 스킬 상점)도 없다. 미팅은 2단
  assert.ok(!fs.existsSync(path.join(ROOT, "js/ui/screens/training.js")), "screens/training.js 삭제");
  const ogNoComments = og.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const sel of [".training-screen", ".slot-rows", ".slot-row", ".actionbar", ".train-grid", ".train-go", ".summon-slots", ".shop-list", ".sheet-foot"]) {
    assert.ok(!ogNoComments.includes(sel), `outgame.css 에 훈련 전용 ${sel} 없음`);
  }
  assert.match(og, /\.meeting-cols \{[^}]*grid-template-columns: 260px minmax\(0, 1fr\);/, "미팅 2단 (260 | 1fr)");
  for (const sel of [".week-card", ".week-plan", ".outing-grid", ".prep-opp", ".prep-edit", ".aim-link", ".tok-ghost", ".aim-ghost", ".cf-ticon.s-link"]) assert.ok(lesson.includes(sel), `lesson.css 에 ${sel}`);
  // L40 (§16.7): 고유 카드 주 스탯 구역 ×1.5 표시(.wl-owners · .mode-chg)는 지웠다
  for (const sel of [".wl-owners", ".mode-chg"]) assert.ok(!lesson.includes(sel), `lesson.css 에 ${sel} 없음`);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const links = [...html.matchAll(/href="\.\/css\/([a-z]+)\.css"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["base", "outgame", "match", "lesson"], "CSS 순서: … → match → lesson");
  assert.match(html, /<title>경계전 클럽 — 카드 레슨 시험판<\/title>/);
  const base = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8");
  for (const sel of [".modal.modal-md", ".modal.modal-lg", ".modal.modal-xl", ".sheet.sheet-wide"]) assert.ok(base.includes(sel), `base.css 에 ${sel}`);
});

test("배급 전술 선택지 (labels TACTIC_OPTIONS.distribution) = 엔진 run.DISTRIBUTION_TACTICS (목록은 run.js 한 곳 — ai.js 도 가져다 쓴다)", async () => {
  const Lb = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);
  const run = await import(pathToFileURL(path.join(ROOT, "js/engine/run.js")).href);
  assert.deepEqual(Lb.TACTIC_OPTIONS.distribution.map(([k]) => k).sort(), [...run.DISTRIBUTION_TACTICS].sort());
  const aiSrc = fs.readFileSync(path.join(ROOT, "js/engine/ai.js"), "utf8");
  assert.ok(/import \{ DISTRIBUTION_TACTICS \} from "\.\/run\.js"/.test(aiSrc) && !/const DISTRIBUTION_TACTICS\s*=/.test(aiSrc), "ai.js 는 사본을 두지 않는다");
});

test("저장 키: 'soccer-lesson.' 앞머리 · loadRun 은 레슨 런 저장본만 (store 사본 = 엔진 lessonRun.isLessonRun)", async () => {
  const st = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
  const lr = await import(pathToFileURL(path.join(ROOT, "js/engine/lessonRun.js")).href);
  assert.equal(st.STORAGE_PREFIX, "soccer-lesson.");
  assert.deepEqual(Object.keys(st.KEYS).sort(), ["challenge", "challengeMatch", "match", "run", "teams"]);
  for (const [k, v] of Object.entries(st.KEYS)) assert.equal(v, `soccer-lesson.${k}`, `KEYS.${k}`);
  assert.equal(st.LESSON_RUN_KIND, lr.RUN_KIND);
  assert.equal(st.LESSON_RUN_VERSION, lr.RUN_VERSION);
  assert.deepEqual(st.LESSON_RUN_SAVE_VERSIONS, lr.SAVE_VERSIONS);
  const cases = [null, undefined, 0, "x", [], {}, { phase: "turn", seed: 1 }, { kind: "lessonRun", version: 1 }, { kind: "lessonRun", version: 2, phase: "week" },
    { kind: "lessonRun", version: "1", phase: "week" }, { kind: "run", version: 1, phase: "week" }, { kind: "lessonRun", version: 1, phase: "week" },
    { kind: "lessonRun", version: 1, phase: 3 }, { kind: "lessonRun", version: 3, phase: "week" }, { kind: "lessonRun", version: 2, phase: 3 },
    { kind: "lessonRun", version: 4, phase: "week" }, { kind: "lessonRun", version: 5, phase: "week" }];
  // store 사본 = 엔진 isLessonRunSave (version 1 ~ 4 — 1 ~ 3 은 continueRun 이 migrateLessonRun 으로 올린다, §14.15 · §18.7 · §19.13)
  for (const c of cases) assert.equal(st.isLessonRunSave(c), lr.isLessonRunSave(c), `같은 검사: ${JSON.stringify(c)}`);
  // 엔진 isLessonRun 은 version 4 만
  assert.ok(lr.isLessonRun({ kind: "lessonRun", version: 4, phase: "week" }));
  assert.ok(!lr.isLessonRun({ kind: "lessonRun", version: 3, phase: "week" }));
  assert.ok(!lr.isLessonRun({ kind: "lessonRun", version: 2, phase: "week" }));
  assert.ok(!lr.isLessonRun({ kind: "lessonRun", version: 1, phase: "week" }));
  // 코드에 본편 키 문자열('soccer.run' 등)이 남지 않았다 (UI · 도구)
  const files = ["js/ui/app.js", "js/ui/store.js", "js/ui/screens/challenge.js", "js/ui/screens/start.js", "js/ui/hud.js", "tools/shot.mjs", "tools/scenarios.mjs", "tools/lesson_scenarios.mjs"];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.doesNotMatch(src, /['"`]soccer\.(run|match|teams|challenge|challengeMatch)['"`]/, `${f}: 본편 키 문자열`);
  }
});

test("L40: lessonRun 은 mainStatsOf 를 다시 내보내지 않는다 (고유 카드 ×1.5 구역 변경 표시를 지웠다 — §16.7)", async () => {
  const lr = await import(pathToFileURL(path.join(ROOT, "js/engine/lessonRun.js")).href);
  assert.equal(lr.mainStatsOf, undefined);
});

test("편성 미니 필드 슬롯 자리: GK 왼쪽 → FW 오른쪽, 같은 줄은 위아래로 고르게", async () => {
  const { slotSpot } = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/setup.js")).href);
  const { slotsOf, FORMATIONS } = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);
  for (const f of Object.keys(FORMATIONS)) {
    const slots = slotsOf(f);
    const spots = Object.fromEntries(slots.map((s) => [s, slotSpot(s, slots)]));
    assert.ok(spots.GK.x < spots.DF1.x, `${f}: GK 가 DF 보다 왼쪽 (우리 골 = 왼쪽)`);
    const xs = ["DF", "MF", "FW"].map((p) => spots[`${p}1`]?.x);
    assert.ok(xs.every((x, i) => x != null && (i === 0 || x > xs[i - 1])), `${f}: DF < MF < FW`);
    for (const s of slots) {
      assert.ok(spots[s].x > 0 && spots[s].x < 100 && spots[s].y > 0 && spots[s].y < 100, `${f} ${s}: 필드 안`);
    }
    // 같은 포지션 줄: y 가 서로 다르고 50 중심 대칭
    for (const p of ["DF", "MF", "FW"]) {
      const ys = slots.filter((s) => s.startsWith(p)).map((s) => spots[s].y);
      assert.equal(new Set(ys).size, ys.length, `${f} ${p}: 겹치지 않음`);
      assert.ok(Math.abs(ys.reduce((a, b) => a + b, 0) / ys.length - 50) < 1e-9, `${f} ${p}: 가운데 정렬`);
    }
  }
});

test("jsdom: 아웃게임 화면 전부 스테이지 안에 그려지고 주요 조작 요소가 있다", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));

  const g = globalThis;
  const saved = {};
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
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
  g.fetch = dataFetch(ROOT); // data/lesson.json 은 이벤트 기능 스위치를 끈 사본 (§24.15 — 켜려면 dataFetch(ROOT, { events: true }))
  const origConsoleError = console.error;
  const consoleErrors = [];
  console.error = (...a) => { consoleErrors.push(a.map(String).join(" ")); };
  t.after(() => {
    console.error = origConsoleError;
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  // 등록 팀 1개 (시작 화면 목록)
  window.localStorage.setItem(KEYS.teams, JSON.stringify([
    { name: "테스트 클럽", grade: "B", score: 512, formation: "2-2-2", seed: "t-1", registeredAt: "2026-09-27T10:00:00.000Z" },
  ]));
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  const S = await until(() => window.__soccer?.store?.data && window.__soccer.run && window.__soccer);
  assert.ok(S, "부트 완료");
  const stageEl = doc.getElementById("stage");
  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const btnByText = (re, root = doc) => [...root.querySelectorAll("button")].find((b) => re.test((b.textContent || "").trim()));
  const noErrorToast = (where) => assert.equal($$("#toast-root .toast-error").length, 0, `${where}: 에러 토스트 없음 (${$$("#toast-root .toast-error").map((e) => e.textContent).join(" / ")})`);
  const inStage = (sel, where) => {
    const el = $(sel);
    assert.ok(el, `${where}: ${sel}`);
    assert.ok(stageEl.contains(el), `${where}: ${sel} 는 #stage 안`);
    return el;
  };
  const closeModal = () => { const b = btnByText(/^(닫기|취소)$/, $("#modal-root")); assert.ok(b, "닫기/취소 버튼"); b.click(); };
  const data = S.store.data;

  // ---------- 시작 ----------
  const start = await until(() => $(".screen.og.start-screen"));
  inStage(".screen.og.start-screen", "시작");
  assert.ok($(".start-screen .hero h1")?.textContent.length > 0, "시작: 타이틀");
  assert.equal($$(".hero-flow li").length, 3, "시작: 런 흐름 3단계");
  assert.ok($(".hero-flow").textContent.includes(`육성 ${data.config.seasons * data.lesson.weeksPerSeason}주`), "시작: 흐름은 config · lesson 값 (15주)");
  assert.ok($(".hero-flow").textContent.includes("15주"), "시작: 15주");
  assert.match($(".hero-badge")?.textContent ?? "", /본편과 저장이 따로입니다/, "시작: 시험판 배지");
  assert.ok(btnByText(/^새 런 시작/, start), "시작: [새 런 시작]");
  assert.equal($$(".start-teams .team-row").length, 1, "시작: 등록 팀 목록");
  assert.ok($(".start-teams .og-panel-body").classList.contains("og-scroll"), "시작: 등록 팀 목록만 안쪽 스크롤");
  noErrorToast("시작");

  // ---------- 편성 ----------
  btnByText(/^새 런 시작/, start).click();
  await until(() => S.store.screen === "setup" && $(".setup-screen"));
  inStage(".screen.og.setup-screen", "편성");
  const pitch = inStage(".setup-pitch .mini-pitch.slot-cards", "편성");
  let cards = $$(".mini-pitch .slot-card");
  assert.equal(cards.length, 7, "편성: 슬롯 7개가 미니 필드 위");
  assert.ok(cards.every((c) => pitch.contains(c) && /%$/.test(c.style.left) && /%$/.test(c.style.top)), "편성: 슬롯 카드는 % 위치");
  const xOf = (c) => parseFloat(c.style.left);
  const gk = cards.find((c) => c.classList.contains("pos-GK"));
  assert.ok(gk && cards.filter((c) => c !== gk).every((c) => xOf(c) > xOf(gk)), "편성: GK 가 가장 왼쪽 (우리 골 = 왼쪽)");
  assert.ok(Math.max(...$$(".slot-card.pos-DF").map(xOf)) < Math.min(...$$(".slot-card.pos-FW").map(xOf)), "편성: DF 왼쪽 · FW 오른쪽");
  assert.ok($(".setup-pitch .formation-sel select"), "편성: 포메이션 선택");
  assert.ok($(".setup-pitch .resonance"), "편성: 원소 공명 줄");
  // 서포트: 작은 칩 2열 (아바타 xs · 이름 · 희귀도/타입, 자세한 값은 title), n/6
  assert.equal($$(".setup-supports .sp-chips .sp-chip").length, data.supports.length, "편성: 서포트 칩 전부");
  assert.equal($$(".setup-supports .sp-chip.selected").length, data.config.defaultSupports.length, "편성: 기본 서포트 선택");
  assert.ok($$(".setup-supports .sp-chip").every((c) => c.querySelector(".avatar-xs") && c.title.includes(c.querySelector(".sp-chip-nm").textContent)), "편성: 서포트 칩 = 작은 아바타 · 이름 · 자세한 값은 title");
  assert.ok($(".setup-supports .og-panel-title").textContent.includes(`${data.config.defaultSupports.length}/${data.config.defaultSupports.length}`), "편성: 서포트 n/6");
  assert.ok($$(".setup-supports .sp-chip:not(.selected)").every((c) => c.disabled), "편성: 6장이면 나머지 칩 비활성");
  $(".setup-supports .sp-chip.selected").click(); // 한 장 해제 → 5/6, 다른 칩 활성
  await until(() => $$(".setup-supports .sp-chip.selected").length === data.config.defaultSupports.length - 1);
  assert.ok($$(".setup-supports .sp-chip:not(.selected)").every((c) => !c.disabled), "편성: 5장이면 고를 수 있다");
  $$(".setup-supports .sp-chip:not(.selected)")[0].click();
  await until(() => $$(".setup-supports .sp-chip.selected").length === data.config.defaultSupports.length);
  // L48: 코치 칩 = 파티 패시브 글 + "80: …" (유대 80 글 짧게), 이름 · 유대 80 글 전체는 title
  const ppSups = data.supports.filter((x) => x.partyPassive);
  assert.ok(ppSups.length >= 1, "데이터: 코치 파티 패시브");
  for (const sp of ppSups) {
    const chip = $$(".setup-supports .sp-chip").find((c) => c.querySelector(".sp-chip-nm").textContent === sp.name);
    const ppEl = chip?.querySelector(".sp-chip-pp");
    assert.ok(ppEl && ppEl.textContent.includes(sp.partyPassive.text), `편성: ${sp.name} 칩에 파티 패시브 글`);
    assert.ok(chip.title.includes(sp.partyPassive.name) && chip.title.includes(`유대 80: ${sp.partyPassive.text80}`), `편성: ${sp.name} title = 이름 · 유대 80 글`);
    if (sp.partyPassive.text80 && sp.partyPassive.text80 !== sp.partyPassive.text) assert.ok(ppEl.querySelector(".sp-pp-80")?.textContent.startsWith(" · 80: "), `편성: ${sp.name} 유대 80 (둘째)`);
  }
  assert.ok($(".setup-pitch .setup-tactics .tac-rows"), "편성: 전술 지시 = 미니 필드 아래 한 줄 (L48)");
  assert.equal($$(".setup-tactics .tac-row select").length, 4, "편성: 전술 4개 (공격 성향 · 슛 타이밍 · 수비 성향 · 배급)");
  // 훈련 방침: 전술 패널 아래 별도 패널, <select> 가 아닌 버튼 5개 (편성 화면의 select 는 포메이션 + 전술 4)
  inStage(".setup-side .setup-policy .policy-row", "편성 방침");
  assert.equal($$(".setup-policy .policy-row button.btn-sm").length, 5, "편성: 방침 버튼 5개");
  assert.equal($$(".setup-policy select").length, 0, "편성: 방침은 select 가 아니다");
  assert.equal($$(".setup-screen select").length, 5, "편성: select = 포메이션 1 + 전술 4");
  assert.deepEqual($$(".policy-btn").map((b) => b.textContent), data.policies.policies.map((p) => p.name), "편성: 방침 이름 = data/policies.json");
  assert.equal($(".policy-btn.active").dataset.policy, data.lesson.defaultPolicy, "편성: 기본 방침");
  assert.equal($(".setup-policy .policy-desc").textContent, data.policies.policies.find((p) => p.id === data.lesson.defaultPolicy).desc);
  $('.policy-btn[data-policy="counter"]').click();
  assert.equal(S.store.setup.policy, "counter");
  assert.equal($(".setup-policy .policy-desc").textContent, data.policies.policies.find((p) => p.id === "counter").desc, "편성: 방침 설명 바뀜");
  assert.equal($('.policy-btn[data-policy="counter"]').getAttribute("aria-checked"), "true");
  // GK 배급 전술 (2026-09-29): 상황 따라(기본) · 짧게 · 길게
  const distSel = $$(".setup-tactics .tac-row").find((r) => r.textContent.includes("배급"))?.querySelector("select");
  assert.ok(distSel, "편성: 배급 전술 선택");
  assert.deepEqual([...distSel.options].map((o) => [o.value, o.textContent]), [["auto", "상황 따라"], ["short", "짧게"], ["long", "길게"]], "편성: 배급 선택지");
  assert.equal(distSel.value, data.config.defaultTactics.distribution ?? "auto", "편성: 배급 기본값");
  // 선수 풀: 캐릭터 전원 카드 (배치된 선수 = 슬롯 표시, 나머지 = 벤치), 적성 GK/DF/MF/FW
  const poolCards = $$(".setup-pool .lu-pool .lu-card");
  assert.equal(poolCards.length, data.characters.length, "편성: 선수 풀 = 캐릭터 전원");
  assert.equal($$(".lu-card.bench").length, data.characters.length - 7, "편성: 벤치 = 배치 안 된 선수");
  assert.ok(poolCards.every((c) => c.querySelectorAll(".lu-apt").length === 4 && c.querySelector(".avatar") && c.querySelector(".lu-where")), "편성: 풀 카드 = 아바타 · 적성 4칸 · 자리 표시");
  assert.deepEqual($$(".lu-card.placed .lu-where").map((e) => e.textContent).sort(), Object.keys(data.config.defaultSquad.slots).sort(), "편성: 배치된 선수 카드에 슬롯 이름");
  // 16명 (§19.14 ①, K3): 풀 = 2줄 × 8장 — 필드 선수(슬롯 순서) → 벤치(레어도 SSR → SR → R, 같으면 데이터 순서). 카드마다 필살기 칩 (등급 색 · title = 종류 · 대사)
  const charOf = (id) => data.characters.find((c) => c.id === id);
  const RANK = { SSR: 0, SR: 1, R: 2 };
  const checkPoolOrder = (where) => {
    const ids = $$(".setup-pool .lu-card").map((c) => c.dataset.pid);
    const slotsNow = Object.keys(S.store.setup.squad);
    const fieldIds = ["GK", "DF1", "DF2", "DF3", "MF1", "MF2", "MF3", "FW1", "FW2"].filter((sl) => slotsNow.includes(sl)).map((sl) => S.store.setup.squad[sl]);
    assert.deepEqual(ids.slice(0, fieldIds.length), fieldIds, `${where}: 앞 = 필드 선수 (슬롯 순서)`);
    const bench = ids.slice(fieldIds.length);
    const order = data.characters.map((c) => c.id);
    const sorted = [...bench].sort((a, b) => RANK[charOf(a).rarity] - RANK[charOf(b).rarity] || order.indexOf(a) - order.indexOf(b));
    assert.deepEqual(bench, sorted, `${where}: 벤치 = 레어도 순`);
    assert.ok($$(".setup-pool .lu-card").slice(fieldIds.length).every((c) => c.classList.contains("bench")), `${where}: 뒤 = 벤치`);
  };
  assert.equal(data.characters.length, 16, "이 브랜치 = 16명");
  assert.match(fs.readFileSync(path.join(ROOT, "css/outgame.css"), "utf8"), /\.setup-pool \.lu-pool \{[^}]*grid-template-columns: repeat\(8,/, "편성: 풀 한 줄 8장 (2줄 — CSS)");
  checkPoolOrder("편성 기본");
  for (const c of poolCards) {
    const ch = charOf(c.dataset.pid);
    const sk = data.skills.find((k) => k.id === ch.innateSkillId);
    const chip = c.querySelector(".lu-ult");
    assert.ok(chip && sk?.ultimate, `풀 카드 ${ch.name}: 필살기 칩`);
    assert.equal(chip.querySelector(".lu-ult-nm").textContent, sk.name, `${ch.name}: 칩 이름 = 필살기`);
    assert.ok(chip.classList.contains(`tier-${ch.rarity}`), `${ch.name}: 칩 등급 색 = 레어도`);
    assert.ok(chip.title.includes(sk.ultimate.cutinLine) && chip.title.includes("필살"), `${ch.name}: 칩 title = 종류 · 대사`);
    assert.ok(c.querySelector(".lu-trait")?.title.includes(traitInfo(ch.trait, data).name), `${ch.name}: 특성은 아이콘 (이름은 title)`);
  }
  assert.equal($$(".mini-pitch .slot-card .ult-mark").length, 7, "편성: 슬롯 카드 7장 모두 ✨");
  assert.ok($$(".mini-pitch .slot-card").every((c) => /필살/.test(c.title)), "편성: 슬롯 카드 title 에 필살기");
  assert.equal($$(".setup-pitch .resonance .cap-note").length, 0, "편성 기본: 주장 1명 → 주장 칩 없음");
  assert.ok($(".setup-start input.input"), "편성: seed 입력");
  assert.ok(btnByText(/^런 시작$/, $(".setup-start")) && btnByText(/^기본 편성으로 시작$/, $(".setup-start")), "편성: 시작 버튼 2개");
  assert.ok(btnByText(/처음으로/, $(".setup-screen .og-head")), "편성: ← 처음으로");
  // 포메이션 3-1-2 → DF 3명이 위아래로 (편성은 큰 카드라 y 15/50/85 — 안내 알약이 아래 카드에 가리지 않게), 슬롯 7개 유지
  const fsel = $(".formation-sel select");
  fsel.value = "3-1-2";
  fsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await until(() => $$(".slot-card.pos-DF").length === 3);
  cards = $$(".mini-pitch .slot-card");
  assert.equal(cards.length, 7, "3-1-2: 슬롯 7개");
  assert.deepEqual($$(".slot-card.pos-DF").map((c) => Math.round(parseFloat(c.style.top))), [15, 50, 85], "3-1-2: DF 3명 세로 배치 (벌림)");
  assert.equal(new Set($$(".slot-card.pos-DF").map(xOf)).size, 1, "3-1-2: DF 같은 줄");
  // 포메이션을 바꾸면 없어진 슬롯(MF2)의 타리아(DF B)가 새 DF3 로 (lineup.js reseat)
  assert.equal(S.store.setup.squad.DF3, "ch_human_runner", "3-1-2: MF2 타리아 → DF3");
  // 슬롯 탭 → 캐릭터 고르기 (넓은 모달, 4열 × 4줄 압축판 — 드래그 대신 쓰는 탭 경로). 보드와 같은 규칙: 설 수 없으면 비활성 · 빨강
  $(".slot-card.pos-MF").click();
  inStage("#modal-root .modal.modal-xl.setup-pick .pick-grid.cols-4", "캐릭터 고르기");
  assert.equal($$("#modal-root .pick-grid .char-pick").length, data.characters.length, "캐릭터 고르기: 전원");
  assert.ok($$("#modal-root .char-pick").every((b) => b.classList.contains("compact") && b.querySelector(".lu-ult") && b.querySelectorAll(".cp-txt > span").length === 4),
    "캐릭터 고르기: 압축판 4줄 (이름 · 종족 … · 적성 · 특성 + 필살기)");
  assert.ok($$("#modal-root .char-pick.pick-bad").every((b) => b.disabled) && $$("#modal-root .char-pick.pick-ok").every((b) => !b.disabled), "캐릭터 고르기: 빨강 = 비활성");
  closeModal();
  assert.equal($$("#modal-root .modal").length, 0, "캐릭터 고르기 닫힘");
  fsel.value = "2-2-2";
  fsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await until(() => $$(".slot-card.pos-DF").length === 2);
  assert.deepEqual(S.store.setup.squad, data.config.defaultSquad.slots, "2-2-2 로 돌아오면 기본 편성 그대로 (DF3 타리아 → MF2)");
  // 주장 2명 (L46): GK 슬롯 모달에서 헤르타(주장 · GK A)를 고르면 아델린과 주장 2명 → 공명 줄 칩 "주장 2명 — 팀워크 +10은 1명분". 네리아 벤치 → 풀 다시 정렬
  $('.lu-slot[data-slot="GK"]').click();
  const herta = $('#modal-root .char-pick[data-pid="ch_giant_keeper"]');
  assert.ok(herta && !herta.disabled, "GK 고르기: 헤르타 가능");
  herta.click();
  await until(() => S.store.setup.squad.GK === "ch_giant_keeper" && $(".setup-pitch .resonance .cap-note"));
  assert.match($(".setup-pitch .resonance .cap-note").textContent, /주장 2명 — 팀워크 \+10은 1명분/, "주장 2명 칩");
  checkPoolOrder("헤르타 GK");
  assert.ok($('.lu-card[data-pid="ch_spirit_keeper"]').classList.contains("bench"), "네리아 벤치");
  $('.lu-slot[data-slot="GK"]').click();
  $('#modal-root .char-pick[data-pid="ch_spirit_keeper"]').click();
  await until(() => S.store.setup.squad.GK === "ch_spirit_keeper");
  assert.equal($$(".setup-pitch .resonance .cap-note").length, 0, "네리아로 되돌리면 주장 칩 없음");
  assert.deepEqual(S.store.setup.squad, data.config.defaultSquad.slots, "기본 편성으로 되돌림");

  // ---- 드래그 (포인터 이벤트 흉내). jsdom 은 레이아웃이 없어 elementFromPoint 를 "포인터 밑 요소"로 고정한다 ----
  const PE = window.PointerEvent || window.MouseEvent;
  const ptr = (type, target, x, y) => target.dispatchEvent(new PE(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: "mouse" }));
  let under = null;
  doc.elementFromPoint = () => under;
  t.after(() => { delete doc.elementFromPoint; });
  /** from 요소를 눌러 to 위로 끌고 (release 면 놓는다). 놓은 뒤 한 틱 쉰다 — 놓은 직후 click 한 번은 보드가 삼킨다 (lineup.js suppressClick) */
  const drag = async (from, to, { release = true } = {}) => {
    under = null;
    ptr("pointerdown", from, 100, 100);
    ptr("pointermove", window, 103, 102); // 문턱(6px) 전 = 아직 탭
    assert.equal($$(".lu-ghost").length, 0, "문턱 전에는 드래그 아님");
    under = to.matches(".lu-slot, .lu-card") ? (to.querySelector(".slot-nm, b") || to) : to; // 카드 안쪽 글자 위 → 부모 카드가 놓을 곳
    ptr("pointermove", window, 300, 240);
    if (release) { ptr("pointerup", window, 300, 240); await wait(5); }
  };
  const slotEl = (sl) => $(`.lu-slot[data-slot="${sl}"]`);
  const cardEl = (id) => $(`.lu-card[data-pid="${id}"]`);
  const MIRKA = "ch_cat_trickster";
  const TARIA = "ch_human_runner";
  // 벤치 미르카(GK - · DF - · MF A · FW B)를 MF2 위로 (놓지 않음): GK·DF 빨강, MF·FW 초록 + 적성 안내, 고스트
  await drag(cardEl(MIRKA), slotEl("MF2"), { release: false });
  assert.ok(inStage(".lu-ghost", "드래그 고스트").textContent.includes("미르카"), "드래그: 고스트 = 미르카");
  assert.ok(slotEl("MF2").classList.contains("drop-hover") && $(".lu-ghost").classList.contains("ok"), "드래그: 포인터 밑 MF2 = 초록 hover");
  for (const sl of ["GK", "DF1", "DF2"]) assert.ok(slotEl(sl).classList.contains("drop-bad"), `드래그: ${sl} 빨강`);
  for (const sl of ["MF1", "MF2", "FW1", "FW2"]) assert.ok(slotEl(sl).classList.contains("drop-ok"), `드래그: ${sl} 초록`);
  assert.equal(slotEl("GK").querySelector(".lu-hint").textContent, "GK 적성 없음", "드래그: 빨강 이유");
  assert.equal(slotEl("MF2").querySelector(".lu-hint").textContent, "MF A · 타리아 벤치로", "드래그: 초록 = 적성 + 밀려나는 선수");
  assert.equal(slotEl("FW1").querySelector(".lu-hint").textContent, "FW B · 울리카 벤치로", "드래그: 적성 글자");
  assert.ok(cardEl(MIRKA).classList.contains("lu-dragging") && cardEl(MIRKA).classList.contains("drop-origin"), "드래그: 끄는 카드 = 원래 자리");
  ptr("pointerup", window, 300, 240); // MF2 에 놓기
  await wait(5);
  await until(() => S.store.setup.squad.MF2 === MIRKA);
  assert.equal($$(".lu-ghost").length, 0, "놓으면 고스트 사라짐");
  assert.ok(slotEl("MF2").dataset.pid === MIRKA && cardEl(TARIA).classList.contains("bench"), "놓기: 미르카 MF2 · 타리아 벤치");
  // 빨강(GK)에 놓기 → 거절: 흔들림 + 안내 토스트, 변경 없음
  const before = JSON.stringify(S.store.setup.squad);
  await drag(slotEl("MF2"), slotEl("GK"));
  assert.equal(JSON.stringify(S.store.setup.squad), before, "빨강에 놓기: 변경 없음");
  assert.ok(slotEl("GK").classList.contains("lu-shake"), "빨강에 놓기: 흔들림");
  assert.ok($$("#toast-root .toast-info").some((e) => /놓을 수 없음.*미르카.*GK 적성 없음/.test(e.textContent)), "빨강에 놓기: 이유 토스트");
  // 필드 선수(MF2 미르카)를 벤치 선수(타리아) 카드에 = 교체 투입
  await drag(slotEl("MF2"), cardEl(TARIA));
  await until(() => S.store.setup.squad.MF2 === TARIA);
  assert.ok(cardEl(MIRKA).classList.contains("bench"), "교체: 미르카 벤치");
  // 슬롯 → 슬롯 = 맞바꾸기 (도르비나 DF1 → GK, 네리아 → DF1)
  await drag(slotEl("DF1"), slotEl("GK"));
  await until(() => S.store.setup.squad.GK === "ch_dwarf_wall");
  assert.equal(S.store.setup.squad.DF1, "ch_spirit_keeper", "맞바꾸기: 네리아 DF1");
  // 필드 선수를 풀 빈 곳에 = 벤치로 (빈 슬롯이 생긴다)
  await drag(slotEl("FW2"), $(".lu-pool"));
  await until(() => !S.store.setup.squad.FW2);
  assert.ok(slotEl("FW2").classList.contains("empty") && $(".resonance").textContent.includes("FW2"), "벤치로: FW2 빈 슬롯 표시");
  // 끄는 중 Esc = 취소: 고스트가 사라지고, 손을 떼도 아무것도 바뀌지 않는다
  const beforeEsc = JSON.stringify(S.store.setup.squad);
  await drag(slotEl("DF1"), slotEl("DF2"), { release: false });
  assert.equal($$(".lu-ghost").length, 1, "Esc 전: 끄는 중");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal($$(".lu-ghost").length, 0, "끄는 중 Esc: 고스트 사라짐");
  ptr("pointerup", window, 300, 240);
  await wait(5);
  assert.equal(JSON.stringify(S.store.setup.squad), beforeEsc, "끄는 중 Esc: 변경 없음");
  // 탭 경로: 벤치 카드를 누르면 고름(같은 색) → 빈 슬롯 FW2 를 누르면 배치
  cardEl("ch_giant_striker").click();
  assert.ok(cardEl("ch_giant_striker").classList.contains("lu-selected") && slotEl("FW2").classList.contains("drop-ok") && slotEl("GK").classList.contains("drop-bad"), "탭: 고른 선수 기준 초록/빨강");
  // 화면 읽기: 고른 카드 aria-pressed, 자리 설명 = 알약 글 (초록/빨강을 색 없이), 선택 알림
  assert.equal(cardEl("ch_giant_striker").getAttribute("aria-pressed"), "true", "탭: 고른 카드 aria-pressed");
  assert.match(slotEl("GK").getAttribute("aria-description") || "", /^놓을 수 없음: GK /, "탭: 빨강 자리 설명");
  assert.match(slotEl("FW2").getAttribute("aria-description") || "", /^놓을 수 있음: FW /, "탭: 초록 자리 설명");
  assert.match($(".lu-pitch .lu-sr").textContent, /선택 — 놓을 자리를 고르세요/, "탭: 선택 알림 (role=status)");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.ok(!cardEl("ch_giant_striker").classList.contains("lu-selected") && !slotEl("FW2").classList.contains("drop-ok"), "탭: Esc = 취소");
  cardEl("ch_giant_striker").click();
  slotEl("GK").click(); // 빨강 → 거절, 선택 유지
  assert.equal(S.store.setup.squad.GK, "ch_dwarf_wall", "탭: 빨강 자리는 거절");
  slotEl("FW2").click();
  await until(() => S.store.setup.squad.FW2 === "ch_giant_striker");
  await drag(slotEl("GK"), slotEl("DF1")); // 원래대로
  await until(() => S.store.setup.squad.GK === "ch_spirit_keeper");
  assert.deepEqual(S.store.setup.squad, data.config.defaultSquad.slots, "드래그 · 탭 뒤 기본 편성으로 돌아옴");
  assert.equal($$("#modal-root .modal").length, 0, "드래그 · 탭 중 모달 안 열림");
  noErrorToast("편성");

  // ---------- 주 선택 (U1: hud.js 상단 바 · 선수/코치 패널 + 임시 주 패널) ----------
  const seedIn = $(".setup-start input.input");
  seedIn.value = "og-test";
  seedIn.dispatchEvent(new window.Event("input", { bubbles: true }));
  btnByText(/^기본 편성으로 시작$/).click();
  await until(() => S.store.screen === "run" && S.store.run && $(".week-screen"));
  assert.equal(S.store.run.phase, "week", "1주 = 주 선택 (시즌 시작 이벤트 없음)");
  assert.equal(S.store.run.policy, "counter", "고른 방침으로 런 시작");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).seed, "og-test", "저장 = KEYS.run");
  const wv = S.run.getWeekView(S.store.run, data);
  const OL = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);
  inStage(".screen.og.week-screen", "주 선택");
  assert.ok(!$(".week-screen").classList.contains("inert"), "주 선택: 조작 가능");
  // 상단 바: 주 점 5 + ⚔, 상태 칩 4 (컨디션 · 팀워크 · SP · TP), 호출권 없음
  assert.equal($$(".topbar .turn-pips i").length, data.lesson.weeksPerSeason, "주 점 = 시즌 주 수");
  assert.equal($$(".topbar .turn-pips i.cur").length, 1, "이번 주 1개");
  assert.ok($(".topbar .turn-pips .pip-match"), "주 점 끝 ⚔");
  assert.ok($(".topbar .tb-kind").textContent.includes("레슨 주"), "주 종류");
  assert.ok($(".topbar .next-match").textContent.includes(wv.nextMatch.styleHint), "다음 상대 성향");
  assert.ok($(".topbar .next-match").textContent.includes("4주 후 경계전"), "경계전까지 남은 주");
  assert.equal($$(".topbar .status-chip").length, 4, "상태 칩 4");
  assert.ok(/TP/.test($$(".topbar .status-chip")[3].textContent) && !/호출권/.test($(".topbar").textContent), "TP · 호출권 없음");
  assert.ok($(".topbar .tb-seed").textContent.includes("og-test") && $(".topbar .tb-seed").textContent.includes("역습형"), "seed · 방침");
  // 선수 7 · 코치 유대 6 (눈금 = 유대 80)
  assert.equal($$(".roster .ro-row").length, 7, "선수 7");
  assert.ok($$(".roster .ro-row").every((r) => r.querySelectorAll(".ro-st").length === 5 && r.querySelectorAll(".ro-st.main").length === 2), "스탯 5 · 주 스탯 쌍 강조 2");
  assert.equal($$(".roster .bond-row").length, wv.coaches.length, "코치 유대");
  assert.ok($$(".roster .bond-th").every((e) => e.style.left === `${data.lesson.bond.upgradeAt}%`), "유대 눈금 = 강화 유대");
  // 이번 주 (레슨 주): 종목 카드 5 + [휴식], 추천 1, 시즌 일정 줄 (5주 + 경계전)
  assert.equal($$(".week-lesson").length, 5, "중점 구역 5");
  assert.equal($$(".week-lesson.recommended").length, 1, "추천 1");
  assert.equal($(".week-lesson.recommended").dataset.zone, S.manager.recommendWeek(S.store.run, data).zone, "추천 = manager.recommendWeek");
  assert.ok($(".week-lesson.recommended .badge-accent").textContent === "추천", "추천 배지");
  assert.equal($$(".week-lesson .badge-gold").length, wv.lessons.filter((l) => l.special).length, "★ 특별 배지");
  // 중점 구역 카드 (§14.16): 구역 이름 · "서 있을 확률 ×2 · 상승 ×1.5" · 예상 인원(expected). 턴 수 · 일반 목표는 머리 줄에 한 번, 특별 구역 카드는 자기 목표
  assert.deepEqual($$(".week-lesson").map((e) => e.dataset.zone), wv.lessons.map((l) => l.zone), "레슨 카드: 구역 5");
  assert.ok($$(".week-lesson .wl-name").every((e, i) => e.textContent === OL.ZONE_LABELS[wv.lessons[i].zone]), "레슨 카드: 구역 이름");
  assert.ok($$(".week-lesson .wl-focus").every((e, i) => e.textContent.includes("서 있을 확률 ×2") && e.textContent.includes(wv.lessons[i].special ? "상승 ×2.0" : "상승 ×1.5")), "레슨 카드: 중점 효과");
  assert.deepEqual($$(".week-lesson .wl-exp b").map((e) => Number(e.textContent)), wv.lessons.map((l) => l.expected), "레슨 카드: 예상 인원 = expected");
  // L40: 고유 카드 주 스탯 구역 ×1.5 가 없어져 뷰의 boosted · 레슨 카드의 고유 ×1.5 얼굴(.wl-owners)을 지웠다
  assert.ok(wv.lessons.every((l) => !("boosted" in l)), "주 뷰 lessons[] 에 boosted 없음");
  assert.equal($$(".week-lesson .wl-owners").length, 0, "레슨 카드: 고유 ×1.5 칸 없음");
  const plainL = wv.lessons.find((l) => !l.special);
  assert.ok($(".week-head .week-lhead").textContent.includes(`${plainL.turns}턴`) && Number($(".week-lhead .wlh-target").textContent) === plainL.target && $(".week-lhead").textContent.includes(`퍼펙트 ${plainL.cap}`), "머리 줄: 턴 · 목표 · 퍼펙트 한 번");
  assert.deepEqual($$(".week-lesson .wl-target b").map((e) => Number(e.textContent)), wv.lessons.filter((l) => l.special).map((l) => l.target), "특별 구역 카드: 특별 목표");
  assert.ok($(".week-focus-note").textContent.includes("중점 구역"), "중점 구역 설명");
  assert.ok($(".week-rest") && $(".week-rest").textContent.includes(`+${wv.restGain}`), "휴식 (늘 열림)");
  assert.equal($$(".week-plan .wp-item").length, data.lesson.weeksPerSeason + 1, "시즌 일정: 5주 + 경계전");
  assert.equal($$(".week-plan .wp-item.cur").length, 1, "시즌 일정: 이번 주");
  assert.ok(!btnByText(/감독 추천대로/), "자동 진행 버튼 없음 (추천 배지만)");
  assert.equal($$(".week-bar .free-outing").length, 0, "무료 외출 없음 (온천 아님)");
  assert.ok($(".week-bar .ps-open") && /패시브 · SP \d+/.test($(".week-bar .ps-open").textContent), "아래 줄 [✦ 패시브 · SP] (L48)");
  assert.equal($$(".roster .bond-pp").length, (wv.partyPassives || []).length, "코치 칸 파티 패시브 (L48)");
  // 덱 · 기록 모달
  btnByText(/^덱 보기 \d+$/, $(".week-bar")).click();
  inStage("#modal-root .modal.modal-lg .deck-list", "덱");
  assert.equal($$("#modal-root .deck-item").length, S.store.run.deck.length, "덱: 카드 전부");
  closeModal();
  btnByText(/유물 \d+ · 보정 \d+ · 기록/, $(".week-bar")).click();
  inStage("#modal-root .modal.modal-lg .extras-cols", "기록");
  assert.equal($$("#modal-root .extras-col").length, 2, "기록: 2열");
  closeModal();
  noErrorToast("주 선택");

  // ---------- 주 행동 6종 (레슨 · 휴식 · 외출 · 미팅 · 상담 · 친선전) + 무료 외출 · 대비 주 · 경기 전 준비 (U2) ----------
  // 상태는 tools/lesson_scenarios.mjs (감독 AI 로 걸은 레슨 런 — shot.mjs 와 같은 상태). 자유 주 행동은 offer 를 그 행동이 열리게 맞춘다.
  const { OUTGAME_SCENARIOS: OG } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const ogState = (name) => OG.find((x) => x.name === name).build(data, { runSeed: 1 }).runState;
  const lessonWeek = ogState("og_week_lesson");
  const freeWeek = ogState("og_week_free");
  const prepWeek = ogState("og_week_prep");
  const prepState = ogState("og_prep");
  const putRun = (st) => {
    S.store.run = JSON.parse(JSON.stringify(st));
    S.store.match = null;
    S.store.screen = "run";
    S.render();
    return S.store.run;
  };
  const freeWith = (type) => {
    const st = JSON.parse(JSON.stringify(freeWeek));
    const rest = st.weekOffer.actions.filter((a) => a !== type);
    st.weekOffer.actions = [type, ...rest].slice(0, 3);
    st.weekOffer.guaranteed = st.weekOffer.actions.includes(st.weekOffer.guaranteed) ? st.weekOffer.guaranteed : type;
    return putRun(st);
  };

  // ① 레슨: 종목 카드 → phase lesson · 레슨 화면
  putRun(lessonWeek);
  $(".week-lesson.recommended").click();
  assert.equal(S.store.run.phase, "lesson", "레슨: phase lesson");
  assert.ok($(".lesson-screen"), "레슨: 레슨 화면");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).phase, "lesson", "레슨: 저장");

  // ② 휴식: 주를 쓰고 다음 주 (2주 = 자유 주)
  putRun(lessonWeek);
  $(".week-rest").click();
  assert.equal(S.store.run.phase, "week", "휴식: 다음 주 선택");
  assert.equal(S.store.run.turn, lessonWeek.turn + 1, "휴식: 주를 쓴다");
  assert.ok($(".week-screen .week-act"), "휴식: 자유 주 화면");

  // ③ 외출: 선수 7 고르기 (modal-md, 체력 → 외출 뒤) → 그 선수 +20 · 전원 +10 · 컨디션 +1, 주를 쓴다
  freeWith("outing");
  assert.equal($$(".week-act").length, 3, "자유 주: 행동 3");
  assert.equal($$(".week-act .badge-purple").length, 1, "자유 주: 이번 시즌 보장 1");
  assert.ok($$(".week-act").every((b) => b.querySelector(".wa-desc") && b.querySelector(".wa-go")), "자유 주: 행동 카드 = 설명 · 다음 화면");
  $('.week-act[data-act="outing"]').click();
  inStage("#modal-root .modal.modal-md .outing-grid", "외출");
  assert.equal($$("#modal-root .outing-pick").length, 7, "외출: 선수 7");
  assert.ok($$("#modal-root .outing-pick .op-gain").every((e) => / → /.test(e.textContent)), "외출: 체력 → 외출 뒤");
  const outP = S.store.run.players[3];
  const outBefore = { st: outP.stamina, cond: S.store.run.condition, turn: S.store.run.turn };
  $(`#modal-root .outing-pick[data-pid="${outP.id}"]`).click();
  assert.equal($$("#modal-root .overlay").length, 0, "외출: 모달 닫힘");
  assert.equal(S.store.run.turn, outBefore.turn + 1, "외출: 주를 쓴다");
  assert.equal(S.store.run.players.find((p) => p.id === outP.id).stamina, Math.min(100, outBefore.st + data.lesson.outing.picked + data.lesson.outing.team), "외출: 그 선수 +20 +10");
  assert.equal(S.store.run.condition, Math.min(4, outBefore.cond + data.lesson.outing.condition), "외출: 컨디션 +1");
  assert.ok($(".week-screen"), "외출: 다음 주 화면");

  // ④ 전술 미팅: 2단 (전술 6 | 포메이션 + 라인업 보드), 스킬 상점 없음 → [미팅 진행] = weekAction(meeting) → 팀워크 +10 · 배치 반영 · 주를 쓴다
  const mtState = JSON.parse(JSON.stringify(freeWith("meeting"))); // 전 상태 사본 (엔진은 store.run 을 바꾼다)
  $('.week-act[data-act="meeting"]').click();
  inStage("#modal-root .modal.modal-xl .meeting-cols", "미팅");
  assert.equal($$("#modal-root .meeting-col").length, 2, "미팅: 2단");
  assert.equal($$("#modal-root .meeting-col")[0].querySelectorAll("select").length, 6, "미팅: 전술 6개 (배급 포함)");
  assert.ok($$("#modal-root .meeting-col")[0].textContent.includes("배급"), "미팅: 배급 전술");
  assert.equal($$("#modal-root .meeting-board .lu-pitch.compact .lu-slot").length, 7, "미팅: 라인업 보드 슬롯 7개");
  assert.equal($$("#modal-root .meeting-board .lu-slot .ult-mark").length, 7, "미팅: 슬롯 카드 7장 모두 ✨ (필살기)");
  assert.equal($$("#modal-root .meeting-board select").length, 1, "미팅: 포메이션 선택만");
  assert.equal($$("#modal-root .lu-pool").length, 0, "미팅: 벤치 없음 (7명 전원 배치)");
  assert.ok(!$("#modal-root .shop-list") && !/스킬 상점/.test($("#modal-root").textContent), "미팅: 스킬 상점 없음");
  assert.ok($("#modal-root .badge-accent").textContent.includes(`팀워크 +${data.config.meeting.teamwork}`), "미팅: 팀워크 표시");
  const mslot = (sl) => $(`#modal-root .lu-slot[data-slot="${sl}"]`);
  const pidAt = (sl) => mslot(sl)?.dataset.pid;
  const runSlots0 = Object.fromEntries(mtState.players.map((p) => [p.slot, p.id]));
  for (const [sl, pid] of Object.entries(runSlots0)) assert.equal(pidAt(sl), pid, `미팅: 보드 처음 = 런 배치 (${sl})`);
  // 드래그: DF1(도르비나 GK B · DF A · MF C · FW -) → FW 빨강, GK 초록(⇄ 네리아)
  const dorbina = mtState.players.find((p) => p.charId === "ch_dwarf_wall");
  const neria = mtState.players.find((p) => p.charId === "ch_spirit_keeper");
  await drag(mslot(dorbina.slot), mslot("FW1"), { release: false });
  assert.ok(mslot("FW1").classList.contains("drop-bad") && mslot("FW1").querySelector(".lu-hint").textContent === "FW 적성 없음", "미팅 드래그: FW 빨강");
  assert.ok(mslot("GK").classList.contains("drop-ok") && mslot("GK").querySelector(".lu-hint").textContent === `GK B ⇄ ${neria.name}`, "미팅 드래그: GK 초록 (맞바꾸기 상대)");
  ptr("pointerup", window, 300, 240); // 빨강에 놓기 → 거절
  await wait(5);
  assert.equal(pidAt("FW1"), runSlots0.FW1, "미팅: 빨강에 놓으면 변경 없음");
  assert.equal($$("#modal-root .modal").length, 1, "미팅: 보드 밖 click 을 삼켜 모달이 닫히지 않는다");
  await drag(mslot(dorbina.slot), mslot("GK"));
  assert.ok(pidAt("GK") === dorbina.id && pidAt(dorbina.slot) === neria.id, "미팅: 도르비나 GK ⇄ 네리아");
  assert.ok(mslot("GK").textContent.includes(`원래 ${dorbina.slot}`), "미팅: 옮긴 선수에 원래 자리 표시");
  // 탭 경로: DF2(아델린 MF B) 를 누르고 → MF1(실루엔 DF C) 을 누르면 맞바꾸기
  const df2 = pidAt("DF2");
  const mf1 = pidAt("MF1");
  mslot("DF2").click();
  assert.ok(mslot("DF2").classList.contains("lu-selected") && mslot("MF1").classList.contains("drop-ok"), "미팅 탭: 고른 선수 기준 색");
  mslot("MF1").click();
  assert.ok(pidAt("DF2") === mf1 && pidAt("MF1") === df2, "미팅 탭: DF2 ⇄ MF1");
  assert.equal($$("#modal-root .mode-chg").length, 0, "미팅: L40 — 자리를 바꿔도 고유 카드는 바뀌지 않는다 (×1.5 구역 변경 표시 없음)");
  const tacSel = $('#modal-root select[data-tactic="defense"]');
  const newDef = [...tacSel.options].map((o) => o.value).find((v) => v !== mtState.tactics.defense);
  tacSel.value = newDef;
  tacSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  const boardFinal = Object.fromEntries($$("#modal-root .lu-slot").map((e) => [e.dataset.slot, e.dataset.pid]));
  let sentMeeting = null;
  const realWeekAction = S.actions.weekAction;
  S.actions.weekAction = (a) => { sentMeeting = a; return realWeekAction(a); };
  try { btnByText(/^미팅 진행$/, $("#modal-root")).click(); } finally { S.actions.weekAction = realWeekAction; }
  assert.ok(sentMeeting && sentMeeting.type === "meeting" && sentMeeting.swaps.length >= 2 && !sentMeeting.formation && !sentMeeting.buy, "미팅 진행: swaps 액션 (구매 없음)");
  assert.equal($$("#modal-root .overlay").length, 0, "미팅 진행: 모달 닫힘");
  assert.equal(S.store.run.turn, mtState.turn + 1, "미팅: 주를 쓴다");
  assert.equal(S.store.run.teamwork, Math.min(100, mtState.teamwork + data.config.meeting.teamwork), "미팅: 팀워크 +10");
  assert.equal(S.store.run.tactics.defense, newDef, "미팅: 전술 반영");
  assert.deepEqual(Object.fromEntries(S.store.run.players.map((p) => [p.slot, p.id])), boardFinal, "미팅: 엔진이 적용한 배치 = 보드 배치");
  // 다시 열고 포메이션 2-3-1 → MF3 생김 · 7명 유지 → [취소] = 변경 없음
  freeWith("meeting");
  $('.week-act[data-act="meeting"]').click();
  const msel = $("#modal-root .meeting-board .field select");
  msel.value = "2-3-1";
  msel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal($$("#modal-root .lu-slot").length, 7, "미팅: 포메이션 바꿔도 슬롯 7개");
  assert.ok(mslot("MF3") && pidAt("MF3") === runSlots0.FW2, "미팅: 2-3-1 → 없어진 FW2 선수가 MF3 로");
  assert.equal(new Set($$("#modal-root .lu-slot").map((e) => e.dataset.pid)).size, 7, "미팅: 7명 모두 한 자리씩");
  closeModal();
  assert.equal(S.store.run.formation, freeWeek.formation, "미팅 취소: 변경 없음");
  assert.equal(S.store.run.phase, "week", "미팅 취소: 주 그대로");

  // ⑤ 상담: → phase consult · 상담 화면
  freeWith("consult");
  $('.week-act[data-act="consult"]').click();
  assert.equal(S.store.run.phase, "consult", "상담: phase consult");
  assert.ok($(".consult-screen"), "상담: 상담 화면");

  // ⑥ 친선전: 확인 모달 → [경기 시작] → phase match · 경기 화면
  freeWith("friendly");
  $('.week-act[data-act="friendly"]').click();
  inStage("#modal-root .modal.modal-md", "친선전 확인");
  btnByText(/^경기 시작$/, $("#modal-root")).click();
  assert.equal(S.store.run.phase, "match", "친선전: phase match");
  assert.ok($(".match-screen"), "친선전: 경기 화면");
  assert.equal(S.store.run.pendingMatch.kind, "friendly");

  // 무료 외출 (온천 다음 시즌 1주차): 주를 쓰지 않는다 — 1주 레슨 주 그대로, 버튼 사라짐
  putRun({ ...JSON.parse(JSON.stringify(lessonWeek)), freeOuting: 1 });
  const freeBtn = $(".week-bar .free-outing");
  assert.ok(freeBtn && /무료 외출/.test(freeBtn.textContent), "무료 외출 버튼 (아래 줄)");
  freeBtn.click();
  inStage("#modal-root .modal.modal-md .outing-grid", "무료 외출");
  assert.ok($("#modal-root").textContent.includes("주를 쓰지 않습니다"));
  $("#modal-root .outing-pick").click();
  assert.equal(S.store.run.phase, "week", "무료 외출: 주 선택 그대로");
  assert.equal(S.store.run.turn, 1, "무료 외출: 주를 쓰지 않는다");
  assert.equal(S.store.run.freeOuting, 0);
  assert.equal($$(".week-bar .free-outing").length, 0, "무료 외출: 버튼 사라짐");
  assert.equal($$(".week-lesson").length, 5, "무료 외출 뒤에도 레슨 고르기");

  // 대비 주: 종목 5 (대비 레슨) + 대비 카드 미리보기 → 대비 레슨 시작
  putRun(prepWeek);
  assert.ok($(".topbar .tb-kind").textContent.includes("대비 주"));
  assert.equal($$(".week-lesson.prep").length, 5, "대비 주: 구역 5 = 대비 레슨");
  assert.equal($$(".week-lesson .badge-warn").length, 5, "대비 주: 대비 레슨 배지");
  assert.equal($$(".prep-minis .prep-mini").length, prepWeek.weekOffer.prepCards.length, "대비 주: 대비 카드 미리보기");
  assert.ok($$(".prep-mini").every((e, i) => e.textContent.includes(data.cards.cards.find((c) => c.id === prepWeek.weekOffer.prepCards[i]).name)), "대비 카드 이름");
  $('.week-lesson[data-zone="defense"]').click();
  assert.equal(S.store.run.phase, "lesson", "대비 레슨 시작");
  assert.ok(S.store.run.lesson.prep && S.store.run.lesson.temp.length === prepWeek.weekOffer.prepCards.length, "대비 레슨: 대비 카드가 덱에");

  // inert (유물 모달 배경): 주 선택 화면을 그리되 버튼은 모두 꺼진다
  putRun({ ...JSON.parse(JSON.stringify(freeWeek)), phase: "relic", pendingRelicChoices: data.relics.slice(0, 3).map((r) => r.id) });
  inStage("#modal-root .relic-row", "유물 (레슨 런)");
  assert.ok($(".week-screen.inert"), "inert: 배경 = 주 선택 화면");
  assert.ok($$(".week-screen button").length > 0 && $$(".week-screen button").every((b) => b.disabled), "inert: 버튼 전부 disabled");
  assert.equal($$(".week-screen .badge-accent.rec-badge").length, 0, "inert: 추천 없음");
  noErrorToast("주 행동");

  // ---------- 경기 전 준비: 상대 패널 + meetingEditor → [경기 시작] = confirmPrep → 경계전 ----------
  putRun(prepState);
  inStage(".screen.og.prep-screen", "경기 전 준비");
  const pv = S.run.getPrepView(S.store.run, data);
  assert.ok($(".prep-screen .topbar"), "준비: 상단 바");
  assert.ok($(".prep-opp .po-title").textContent.includes(pv.nextMatch.opponentName), "준비: 상대 이름");
  assert.ok($(".prep-opp").textContent.includes(pv.nextMatch.styleHint) && $(".prep-opp").textContent.includes(pv.nextMatch.formation), "준비: 주 성향 · 포메이션");
  assert.ok($(".prep-opp .po-bonus").textContent.includes(pv.prepBonus ? "경계전 컨디션 +1" : "보너스 없음"), "준비: 대비 레슨 보너스 표시");
  assert.equal($$(".prep-edit .meeting-col").length, 2, "준비: 편집기 2단");
  assert.equal($$(".prep-edit select").length, 7, "준비: 전술 6 + 포메이션");
  assert.ok(!/팀워크 \+/.test($(".prep-edit").textContent), "준비: 팀워크 +10 없음");
  // 필살기 ✨ (§19.14 ②): 7명 모두 슬롯 카드 이름 옆 (등급 색 = 레어도, title = 이름 · 종류)
  const prepMarks = $$(".prep-edit .lu-slot .ult-mark");
  assert.equal(prepMarks.length, 7, "준비: 슬롯 카드 7장 모두 ✨");
  for (const el of $$(".prep-edit .lu-slot")) {
    const rp = S.store.run.players.find((p) => p.id === el.dataset.pid);
    const sk = data.skills.find((k) => k.id === rp.innateSkillId);
    const mk = el.querySelector(".ult-mark");
    assert.ok(mk.classList.contains(`tier-${sk.ultimate.tier}`) && mk.title.includes(sk.name) && el.title.includes(sk.name), `준비: ${rp.name} ✨ = ${sk.name}`);
  }
  assert.equal($$(".prep-opp .cap-note").length, 0, "준비: 주장 1명 → 주장 칩 없음");
  const prepTw = S.store.run.teamwork;
  const prepTurn = S.store.run.turn;
  const pdf2 = $('.prep-edit .lu-slot[data-slot="DF2"]').dataset.pid;
  const pmf1 = $('.prep-edit .lu-slot[data-slot="MF1"]').dataset.pid;
  await drag($('.prep-edit .lu-slot[data-slot="DF2"]'), $('.prep-edit .lu-slot[data-slot="MF1"]'));
  assert.equal($$(".prep-edit .mode-chg").length, 0, "준비: 고유 ×1.5 구역 변경 표시 없음 (L40)");
  btnByText(/^경기 시작$/, $(".prep-edit")).click();
  assert.equal(S.store.run.phase, "match", "준비: [경기 시작] → 경계전");
  assert.ok($(".match-screen"), "준비: 경기 화면");
  assert.equal(S.store.run.pendingMatch.kind, "goal");
  assert.equal(S.store.run.teamwork, prepTw, "준비: 팀워크를 쓰지 않는다");
  assert.equal(S.store.run.turn, prepTurn, "준비: 주를 쓰지 않는다");
  assert.ok(S.store.run.players.find((p) => p.id === pdf2).slot === "MF1" && S.store.run.players.find((p) => p.id === pmf1).slot === "DF2", "준비: 배치 반영");
  noErrorToast("경기 전 준비");

  // ---------- 시나리오 주입: 이벤트 · 유물 · 루트 · 결과 (tools/scenarios.mjs, shot.mjs 와 같은 상태) ----------
  const { loadData, OUTGAME_SCENARIOS, clone } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = loadData();
  const inject = (name) => {
    const b = OUTGAME_SCENARIOS.find((s) => s.name === name).build(sdata, { runSeed: 1 });
    S.store.run = clone(b.runState);
    S.store.match = null;
    S.store.final = null;
    S.store.registered = false;
    S.store.screen = "run";
    S.render();
    return S.store.run;
  };

  inject("og_event");
  inStage("#modal-root .modal.modal-lg .ev-body", "이벤트(주입)");
  assert.ok($("#modal-root .ev-story .ev-cast .ev-who"), "이벤트: 등장 인물");
  assert.ok($$("#modal-root .ev-choices .choice-btn").length >= 2, "이벤트: 선택지 2개 이상 (오른쪽 세로)");
  assert.ok($$("#modal-root .choice-btn .preview").length >= 1, "이벤트: 효과 미리보기");
  assert.ok($(".week-screen.inert"), "이벤트: 배경 = 주 선택 화면 (조작 불가)");

  const relicState = inject("og_relic");
  inStage("#modal-root .modal.modal-lg .relic-row", "유물");
  assert.equal($$("#modal-root .relic-row .relic-card").length, relicState.pendingRelicChoices.length, "유물: 후보 카드가 한 줄에");
  assert.ok($(".week-screen.inert"), "유물: 배경 = 주 선택 화면");

  const routeState = inject("og_route");
  inStage(".screen.og.route-screen", "루트");
  assert.equal($$(".route-row .route-card").length, routeState.pendingRoutes.length, "루트: 카드 한 줄");
  assert.ok($$(".route-card .route-ico").every((e) => e.textContent.trim()), "루트: 아이콘");
  assert.equal($$(".sp-track .sp-node").length, Math.max(sdata.config.seasons, routeState.season + 1), "루트: 시즌 진행 칸");
  assert.equal($$(".sp-node.now").length, 1, "루트: 이번 시즌 강조");
  assert.ok($(".sp-node.now").textContent.includes("이번 시즌 경계전"), "루트: 이번 시즌 경계전 결과");
  // 루트 설명 덮어쓰기 (data/lesson.json routeOverrides — 온천 = 다음 시즌 1주차 무료 외출)
  for (const [id, ov] of Object.entries(sdata.lesson.routeOverrides || {})) {
    const i = routeState.pendingRoutes.indexOf(id);
    if (i >= 0) assert.equal($$(".route-card .desc")[i].textContent, ov.description, `루트: ${id} 설명 = routeOverrides`);
  }

  // 주장 2명 (L46, §19.14 ②): 기본 편성 + GK 헤르타 → 경기 전 준비 왼쪽 칸 "주장 2명 — 팀워크 +10은 1명분"
  inject("og_prep_captain2");
  inStage(".screen.og.prep-screen .prep-opp .po-cap .cap-note", "준비 주장 2명");
  assert.match($(".prep-opp .cap-note").textContent, /주장 2명 — 팀워크 \+10은 1명분/, "준비: 주장 2명 칩");
  // 새 편성 A (16명 중 새 8명 7명): 슬롯 카드 ✨ 등급 색 = 레어도 (SSR 헤르타 · 브론테)
  inject("og_prep_ult");
  inStage(".screen.og.prep-screen", "준비 새 편성 A");
  assert.equal($$(".prep-edit .lu-slot .ult-mark").length, 7, "준비(새 편성 A): ✨ 7");
  assert.deepEqual($$(".prep-edit .lu-slot .ult-mark.tier-SSR").map((e) => e.closest(".lu-slot").dataset.slot).sort(), ["FW1", "GK"], "준비(새 편성 A): SSR = 헤르타 · 브론테");
  assert.equal($$(".prep-opp .cap-note").length, 0, "준비(새 편성 A): 주장 1명 (헤르타) → 칩 없음");

  inject("og_result");
  inStage(".screen.og.result-screen .result-main", "결과");
  assert.ok($$(".res-players .player-result").every((r) => /필살기 /.test(r.textContent) && !/고유 /.test(r.textContent)), "결과: 선수 줄 \"필살기 X\" (L45)");
  assert.ok($(".result-left .result-hero .grade.big"), "결과: 등급 (왼쪽)");
  assert.ok($(".result-left .res-breakdown .kv") && $(".result-left .res-record") && $(".result-left .seed-box"), "결과: 점수 구성 · 경기 기록 · seed");
  assert.equal($$(".res-players .player-result").length, S.store.run.players.length, "결과: 선수 성장 (오른쪽)");
  assert.ok($$(".player-result .stat-grid").every((g) => g.querySelectorAll(".cell").length === 5), "결과: 스탯 5칸");
  const acts = $(".result-actions");
  for (const re of [/^처음으로$/, /^새 런 \(랜덤 seed\)$/, /^다시 하기/, /^팀 등록/]) assert.ok(btnByText(re, acts), `결과 버튼 줄: ${re}`);
  noErrorToast("결과");

  // ---------- 도전 모드 (2026-10-01): 시작 [도전 모드] → 팀 선택 · 사다리 · 미리보기 · 결과 모달 (tools/scenarios.mjs og_challenge* 와 같은 상태) ----------
  const ogBuild = (name) => OUTGAME_SCENARIOS.find((s) => s.name === name).build(sdata, { runSeed: 1 });
  const putStorage = (b) => {
    window.localStorage.setItem(KEYS.teams, JSON.stringify(b.teams ?? []));
    for (const [k, v] of Object.entries(b.storage || {})) window.localStorage.setItem(k, JSON.stringify(v));
  };
  S.store.run = null;
  S.store.screen = "start";
  S.render();
  // 등록 팀 저장본이 고장(선수 없음)이면 목록에서 빠진다 → 샘플 팀만
  btnByText(/도전 모드/, $(".start-menu")).click();
  inStage(".screen.og.challenge-screen", "도전(샘플)");
  assert.equal($$(".ch-team").length, 1, "도전: 고장 난 등록 팀은 빼고 샘플 팀");
  assert.ok($(".ch-team.sel.sample") && $(".ch-team .badge").textContent.includes("테스트용"), "도전: 샘플 팀 = 테스트용 표시");
  assert.deepEqual($$(".ch-stage").map((b) => b.dataset.state), ["open", ...Array(9).fill("locked")], "도전: 1단계만 열림");
  assert.ok($(".ch-reset").disabled, "도전: 진행 없음 → 진행 초기화 비활성");
  btnByText(/^처음으로$/, $(".ch-head")).click();
  assert.equal(S.store.screen, "start");

  const chB = ogBuild("og_challenge");
  putStorage(chB);
  S.store.challenge.teamId = null; // 고른 팀은 한 세션 동안 기억한다 → 새로 연 것처럼
  S.store.challenge.stage = null;
  S.render();
  btnByText(/도전 모드/, $(".start-menu")).click();
  const chScr = inStage(".screen.og.challenge-screen", "도전");
  assert.ok(chScr.querySelector(".ch-left .ch-teams .og-scroll"), "도전: 팀 목록만 안쪽 스크롤");
  assert.equal($$(".ch-team").length, 3, "도전: 샘플 + 등록 팀 2");
  const firstId = S.challenge.teamIdOf(chB.teams[0]);
  assert.equal($(".ch-team.sel")?.dataset.team, firstId, "도전: 기본 = 가장 최근 등록 팀");
  assert.deepEqual($$(".ch-stage").map((b) => b.dataset.state), ["cleared", "cleared", "cleared", "open", ...Array(6).fill("locked")], "도전: 1~3 클리어 · 4 열림 · 나머지 잠김");
  assert.equal($(".ch-stage.sel")?.dataset.stage, "4", "도전: 기본 미리보기 = 열린 가장 높은 단계");
  assert.equal($$(".ch-team-sum .ch-pl").length, 7, "도전: 고른 팀 선수 7명");
  assert.equal($$(".ch-preview .ch-pitch .ch-tok").length, 7, "도전 미리보기: 미니 필드 7명");
  assert.equal($$(".ch-preview .ch-pv-players .ch-pl").length, 7, "도전 미리보기: 선수 7줄");
  assert.equal($$('.ch-stage[data-stage="10"] .ch-feat').length, 5, "10단계 배지: 액티브 · 간파 · 필살 슛 · 필살 세이브 · 캐논 킥");
  assert.equal($$('.ch-stage[data-stage="1"] .ch-feat').length, 0, "1단계: 스킬 없음");
  assert.ok(!$(".ch-go").disabled && $(".ch-go").textContent.includes("3번째 도전"), "4단계 [도전] (2패 뒤 3번째)");
  $('.ch-stage[data-stage="7"]').click();
  assert.ok($(".ch-pv-head h3").textContent.includes("7단계") && $(".ch-pv-head h3").textContent.includes("(각성)"), "7단계 미리보기 이름");
  assert.ok($(".ch-go").disabled, "잠긴 7단계: 도전 불가");
  $('.ch-stage[data-stage="2"]').click();
  assert.ok($(".ch-go").textContent.startsWith("다시 도전"), "클리어한 단계 = 다시 도전");
  $('.ch-team[data-team="sample"]').click();
  assert.equal(S.store.challenge.teamId, "sample");
  assert.deepEqual($$(".ch-stage").map((b) => b.dataset.state), ["open", ...Array(9).fill("locked")], "팀을 바꾸면 그 팀의 진행");
  $(`.ch-team[data-team="${firstId}"]`).click();
  $(".ch-reset").click(); // confirm → true
  assert.equal($$(".ch-stage.st-cleared").length, 0, "진행 초기화 → 클리어 없음");
  noErrorToast("도전");

  // 결과: 끝난 도전 경기(샘플 팀 2단계 승리) 저장본 → [도전 모드] 가 그 경기로 → 결과 [확인] → 도전 결과 모달
  const resB = ogBuild("og_challenge_result");
  putStorage(resB);
  S.actions.resetToStart();
  assert.ok($(".start-menu .challenge-btn.resume") && /이어하기/.test($(".start-menu .challenge-btn").textContent),
    "시작 화면: 진행 중인 도전 경기 → [도전 모드 — 이어하기]");
  btnByText(/도전 모드/, $(".start-menu")).click();
  assert.equal(S.store.screen, "challengeMatch", "진행 중인 도전 경기 → 경기 화면");
  btnByText(/^확인$/, $("#modal-root")).click();
  inStage("#modal-root .modal.modal-md .ch-result", "도전 결과");
  assert.ok($(".ch-result").classList.contains("win") && $(".ch-res-title").textContent === "2단계 클리어!", "도전 결과: 2단계 클리어!");
  for (const re of [/^도전 목록$/, /^다시 도전$/, /^다음 단계/]) assert.ok(btnByText(re, $(".ch-result")), `도전 결과 버튼: ${re}`);
  btnByText(/^도전 목록$/, $(".ch-result")).click();
  assert.equal($$("#modal-root .ch-result").length, 0, "도전 목록 → 모달 닫힘");
  assert.equal($(".ch-stage.sel")?.dataset.stage, "3", "이긴 뒤 사다리 = 다음 단계");
  assert.equal(S.store.screen, "challenge");
  noErrorToast("도전 결과");

  assert.deepEqual(errors, [], "window error 없음");
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
