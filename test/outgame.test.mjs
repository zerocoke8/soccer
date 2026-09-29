// test/outgame.test.mjs — 아웃게임 화면(가로 스테이지 1280×720) jsdom 검사
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 시작 → 편성 → 훈련(시트 · 미팅 · 호출권 · 기록 · 확인) →
// 시나리오 주입(이벤트 · 유물 · 루트 · 결과)까지 각 화면이 스테이지(#stage) 안에 오류 없이 그려지고 주요 조작 요소가 있는지 본다.
// 레이아웃(넘침 · 잘림)은 jsdom 이 계산하지 않으므로 tools/shot.mjs --only og 스크린샷으로 확인한다.
// jsdom 이 없으면(devDependency 미설치) 건너뛴다. fetch 는 fs 읽기로 폴리필한다 (ui.smoke.test.mjs 와 같은 방식).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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
  for (const f of ["css/base.css", "css/outgame.css"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\d(?:\.\d+)?(?:vw|vh|dvh|svh|lvh|vmin|vmax)\b/.test(src), `${f}: 뷰포트 단위`);
    assert.ok(!/@media[^{]*(?:min|max)-(?:width|height)/.test(src), `${f}: 창 크기 media query`);
  }
  const og = fs.readFileSync(path.join(ROOT, "css/outgame.css"), "utf8");
  assert.ok(!/max-width:\s*420px/.test(og), "옛 세로 폰 열(420px) 규칙 제거");
  for (const sel of [".start-screen", ".setup-main", ".mini-pitch", ".training-screen", ".slot-rows", ".roster", ".actionbar", ".meeting-cols", ".ev-body", ".relic-row", ".route-row", ".result-main"]) {
    assert.ok(og.includes(sel), `outgame.css 에 ${sel}`);
  }
  const base = fs.readFileSync(path.join(ROOT, "css/base.css"), "utf8");
  for (const sel of [".modal.modal-md", ".modal.modal-lg", ".modal.modal-xl", ".sheet.sheet-wide"]) assert.ok(base.includes(sel), `base.css 에 ${sel}`);
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
  g.fetch = async (url) => {
    const rel = String(url).replace(/^\.\//, "");
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    const text = fs.readFileSync(p, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
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
  window.localStorage.setItem("soccer.teams", JSON.stringify([
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
  assert.ok($(".hero-flow").textContent.includes(`육성 ${data.config.seasons * data.config.turnsPerSeason}턴`), "시작: 흐름은 config 값");
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
  assert.equal($$(".setup-side .support-card").length, data.supports.length, "편성: 서포트 카드 전부");
  assert.equal($$(".setup-side .support-card.selected").length, data.config.defaultSupports.length, "편성: 기본 서포트 선택");
  assert.equal($$(".setup-side .grid-3 select").length, 3, "편성: 전술 3개");
  assert.ok($(".setup-start input.input"), "편성: seed 입력");
  assert.ok(btnByText(/^런 시작$/, $(".setup-start")) && btnByText(/^기본 편성으로 시작$/, $(".setup-start")), "편성: 시작 버튼 2개");
  assert.ok(btnByText(/처음으로/, $(".setup-screen .og-head")), "편성: ← 처음으로");
  // 포메이션 3-1-2 → DF 3명이 위아래로 (y 25/50/75), 슬롯 7개 유지
  const fsel = $(".formation-sel select");
  fsel.value = "3-1-2";
  fsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await until(() => $$(".slot-card.pos-DF").length === 3);
  cards = $$(".mini-pitch .slot-card");
  assert.equal(cards.length, 7, "3-1-2: 슬롯 7개");
  assert.deepEqual($$(".slot-card.pos-DF").map((c) => Math.round(parseFloat(c.style.top))), [25, 50, 75], "3-1-2: DF 3명 세로 배치");
  assert.equal(new Set($$(".slot-card.pos-DF").map(xOf)).size, 1, "3-1-2: DF 같은 줄");
  // 슬롯 → 캐릭터 고르기 (넓은 모달, 2열)
  $(".slot-card.pos-MF").click();
  inStage("#modal-root .modal.modal-lg .pick-grid", "캐릭터 고르기");
  assert.equal($$("#modal-root .pick-grid .char-pick").length, data.characters.length, "캐릭터 고르기: 전원");
  closeModal();
  assert.equal($$("#modal-root .modal").length, 0, "캐릭터 고르기 닫힘");
  fsel.value = "2-2-2";
  fsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await until(() => $$(".slot-card.pos-DF").length === 2);
  noErrorToast("편성");

  // ---------- 훈련 ----------
  const seedIn = $(".setup-start input.input");
  seedIn.value = "og-test";
  seedIn.dispatchEvent(new window.Event("input", { bubbles: true }));
  btnByText(/^기본 편성으로 시작$/).click();
  await until(() => S.store.screen === "run" && S.store.run && $(".training-screen"));
  // 시작 이벤트: 넓은 모달 (이야기 | 선택지), 배경 훈련 화면은 비활성
  for (let i = 0; i < 5 && S.store.run.phase === "event"; i++) {
    inStage("#modal-root .modal.modal-lg .ev-body .event-text", "이벤트");
    assert.ok($("#modal-root .ev-choices .choice-btn"), "이벤트: 선택지");
    assert.ok($(".training-screen.inert") && $$(".training-screen .slot-row").every((b) => b.disabled), "이벤트: 배경 훈련 화면 비활성");
    $("#modal-root .choice-btn").click();
    await until(() => S.store.run.phase !== "event" || !$("#modal-root .choice-btn"));
  }
  assert.equal(S.store.run.phase, "turn");
  const tv = S.run.getTurnView(S.store.run, data);
  inStage(".screen.og.training-screen", "훈련");
  assert.ok(!$(".training-screen").classList.contains("inert"), "훈련: 조작 가능");
  // 상단 바
  assert.equal($$(".topbar .turn-pips i").length, data.config.turnsPerSeason, "훈련: 턴 점 = 시즌 턴 수");
  assert.equal($$(".topbar .turn-pips i.cur").length, 1, "훈련: 현재 턴 1개");
  assert.ok($(".topbar .next-match").textContent.includes(tv.nextMatch.styleHint), "훈련: 다음 상대 성향");
  assert.equal($$(".topbar .status-chip").length, 4, "훈련: 컨디션 · 팀워크 · SP · 호출권");
  assert.ok($(".topbar .tb-seed").textContent.includes("og-test"), "훈련: seed");
  // 훈련 칸 5열
  const rows = $$(".slot-rows > .slot-row");
  assert.equal(rows.length, 5, "훈련: 칸 5개");
  assert.equal(rows.filter((r) => r.classList.contains("recommended")).length, 1, "훈련: 추천 1칸");
  assert.equal($$(".slot-row .sl-pl").length, tv.slots.reduce((n, s) => n + s.players.length, 0), "훈련: 칸 선수 줄 = 배치 선수 수");
  assert.equal($$(".slot-row .sl-sp").length, tv.slots.reduce((n, s) => n + s.supports.length, 0), "훈련: 칸 서포트 줄 = 배치 서포트 수");
  for (const [i, r] of rows.entries()) {
    assert.ok(r.querySelector(".slot-meta").textContent.includes("합계") && r.querySelector(".slot-meta").textContent.includes("실패 최대"), `칸 ${i}: 합계 · 실패`);
    assert.ok(r.querySelector(".slot-gauge .bar"), `칸 ${i}: 합계 막대`);
  }
  // 선수 패널
  assert.equal($$(".roster .ro-row").length, tv.players.length, "훈련: 선수 패널 7명");
  assert.ok($$(".roster .ro-row").every((r) => r.querySelectorAll(".ro-st").length === 5 && r.querySelector(".ro-stam .bar")), "훈련: 선수마다 스탯 5 · 체력 막대");
  assert.equal($$(".roster .bond-row").length, tv.supports.length, "훈련: 서포트 유대");
  // 행동 바: 기록 + 휴식 · 외출 · 미팅 · 친선전 · 호출권
  const bar = $(".actionbar");
  assert.equal(bar.querySelectorAll("button").length, 6, "행동 바 버튼 6개");
  for (const re of [/기록/, /휴식$/, /외출$/, /미팅$/, /친선전$/, /호출권 \d+$/]) assert.ok(btnByText(re, bar), `행동 바: ${re}`);

  // 훈련 상세 시트 (넓은 하단 시트, 2열)
  rows.find((r) => r.classList.contains("recommended")).click();
  inStage("#modal-root .sheet.sheet-wide", "훈련 시트");
  assert.ok($("#modal-root .train-grid") || $("#modal-root .sheet p"), "훈련 시트: 선수 2열");
  assert.ok(btnByText(/^훈련하기$/, $("#modal-root")), "훈련 시트: [훈련하기]");
  closeModal();
  // 기록 (유물 · 보정 · 최근 기록)
  btnByText(/기록/, bar).click();
  inStage("#modal-root .modal.modal-lg .extras-cols", "기록");
  assert.equal($$("#modal-root .extras-col").length, 2, "기록: 2열");
  closeModal();
  // 휴식 확인
  btnByText(/휴식$/, bar).click();
  inStage("#modal-root .modal.modal-md", "휴식 확인");
  assert.ok(btnByText(/^실행$/, $("#modal-root")), "휴식 확인: [실행]");
  closeModal();
  // 전술 미팅: 3열 (전술 5 · 포메이션 1 + 포지션 7 · 스킬 상점)
  btnByText(/미팅$/, bar).click();
  inStage("#modal-root .modal.modal-xl .meeting-cols", "미팅");
  assert.equal($$("#modal-root .meeting-col").length, 3, "미팅: 3열");
  assert.equal($$("#modal-root .meeting-col")[0].querySelectorAll("select").length, 5, "미팅: 전술 5개");
  assert.equal($$("#modal-root .pos-assign select").length, 7, "미팅: 포지션 7개");
  assert.ok(btnByText(/^미팅 진행$/, $("#modal-root")), "미팅: [미팅 진행]");
  const msel = $$("#modal-root .meeting-col")[1].querySelector(".field select");
  msel.value = "2-3-1";
  msel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal($$("#modal-root .pos-assign select").length, 7, "미팅: 포메이션 바꿔도 포지션 7개");
  assert.ok($$("#modal-root .pos-assign .slot-tag").some((e) => e.textContent === "MF3"), "미팅: 2-3-1 → MF3");
  closeModal();
  assert.equal(S.store.run.formation, "2-2-2", "미팅 취소: 변경 없음");
  // 호출권: 선수 3열 → 칸 5개 한 줄
  if (Number(tv.summonTickets) > 0) {
    btnByText(/호출권 \d+$/, bar).click();
    inStage("#modal-root .modal.modal-lg .pick-grid.cols-3", "호출권");
    assert.equal($$("#modal-root .pick-grid .char-pick").length, tv.players.filter((p) => !(p.injuredTurns > 0)).length, "호출권: 부상 아닌 선수");
    $("#modal-root .char-pick").click();
    inStage("#modal-root .summon-slots", "호출권 칸");
    assert.equal($$("#modal-root .summon-slots button").length, 5, "호출권: 칸 5개");
    closeModal();
  }
  assert.equal($$("#modal-root .overlay").length, 0, "훈련: 모달 전부 닫힘");
  noErrorToast("훈련");

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
  assert.ok($(".training-screen.inert"), "이벤트: 배경 훈련 화면");

  const relicState = inject("og_relic");
  inStage("#modal-root .modal.modal-lg .relic-row", "유물");
  assert.equal($$("#modal-root .relic-row .relic-card").length, relicState.pendingRelicChoices.length, "유물: 후보 카드가 한 줄에");
  assert.ok($(".training-screen.inert"), "유물: 배경 훈련 화면");

  const routeState = inject("og_route");
  inStage(".screen.og.route-screen", "루트");
  assert.equal($$(".route-row .route-card").length, routeState.pendingRoutes.length, "루트: 카드 한 줄");
  assert.ok($$(".route-card .route-ico").every((e) => e.textContent.trim()), "루트: 아이콘");
  assert.equal($$(".sp-track .sp-node").length, Math.max(sdata.config.seasons, routeState.season + 1), "루트: 시즌 진행 칸");
  assert.equal($$(".sp-node.now").length, 1, "루트: 이번 시즌 강조");
  assert.ok($(".sp-node.now").textContent.includes("이번 시즌 경계전"), "루트: 이번 시즌 경계전 결과");

  inject("og_result");
  inStage(".screen.og.result-screen .result-main", "결과");
  assert.ok($(".result-left .result-hero .grade.big"), "결과: 등급 (왼쪽)");
  assert.ok($(".result-left .res-breakdown .kv") && $(".result-left .res-record") && $(".result-left .seed-box"), "결과: 점수 구성 · 경기 기록 · seed");
  assert.equal($$(".res-players .player-result").length, S.store.run.players.length, "결과: 선수 성장 (오른쪽)");
  assert.ok($$(".player-result .stat-grid").every((g) => g.querySelectorAll(".cell").length === 5), "결과: 스탯 5칸");
  const acts = $(".result-actions");
  for (const re of [/^처음으로$/, /^새 런 \(랜덤 seed\)$/, /^다시 하기/, /^팀 등록/]) assert.ok(btnByText(re, acts), `결과 버튼 줄: ${re}`);
  noErrorToast("결과");

  assert.deepEqual(errors, [], "window error 없음");
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
