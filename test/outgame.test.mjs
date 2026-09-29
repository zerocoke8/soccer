// test/outgame.test.mjs — 아웃게임 화면(가로 스테이지 1280×720) jsdom 검사
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 시작 → 편성 → 훈련(시트 · 미팅 · 호출권 · 기록 · 확인) →
// 시나리오 주입(이벤트 · 유물 · 루트 · 결과)까지 각 화면이 스테이지(#stage) 안에 오류 없이 그려지고 주요 조작 요소가 있는지 본다.
// 라인업 보드(편성 · 미팅, js/ui/lineup.js)는 포인터 이벤트로 드래그를 흉내 낸다 (jsdom 은 레이아웃이 없어 elementFromPoint 를 고정).
// 레이아웃(넘침 · 잘림)은 jsdom 이 계산하지 않으므로 tools/shot.mjs --only og 스크린샷으로 확인한다 (실제 마우스 드래그: og_setup_drag · og_meeting_drag …).
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
  for (const sel of [".start-screen", ".setup-main", ".mini-pitch", ".training-screen", ".slot-rows", ".roster", ".actionbar", ".meeting-cols", ".ev-body", ".relic-row", ".route-row", ".result-main",
    ".sp-chips", ".lu-pool", ".lu-card", ".lu-ghost", ".lu-hint", ".drop-ok", ".drop-bad", ".lu-shake", ".meeting-board"]) {
    assert.ok(og.includes(sel), `outgame.css 에 ${sel}`);
  }
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
  assert.equal($$(".setup-tactics .tac-row select").length, 4, "편성: 전술 4개 (공격 성향 · 슛 타이밍 · 수비 성향 · 배급)");
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
  // 포메이션을 바꾸면 없어진 슬롯(MF2)의 타린(DF B)이 새 DF3 로 (lineup.js reseat)
  assert.equal(S.store.setup.squad.DF3, "ch_human_runner", "3-1-2: MF2 타린 → DF3");
  // 슬롯 탭 → 캐릭터 고르기 (넓은 모달, 2열 — 드래그 대신 쓰는 탭 경로). 보드와 같은 규칙: 설 수 없으면 비활성 · 빨강
  $(".slot-card.pos-MF").click();
  inStage("#modal-root .modal.modal-lg .pick-grid", "캐릭터 고르기");
  assert.equal($$("#modal-root .pick-grid .char-pick").length, data.characters.length, "캐릭터 고르기: 전원");
  assert.ok($$("#modal-root .char-pick.pick-bad").every((b) => b.disabled) && $$("#modal-root .char-pick.pick-ok").every((b) => !b.disabled), "캐릭터 고르기: 빨강 = 비활성");
  closeModal();
  assert.equal($$("#modal-root .modal").length, 0, "캐릭터 고르기 닫힘");
  fsel.value = "2-2-2";
  fsel.dispatchEvent(new window.Event("change", { bubbles: true }));
  await until(() => $$(".slot-card.pos-DF").length === 2);
  assert.deepEqual(S.store.setup.squad, data.config.defaultSquad.slots, "2-2-2 로 돌아오면 기본 편성 그대로 (DF3 타린 → MF2)");

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
  const TARIN = "ch_human_runner";
  // 벤치 미르카(GK - · DF - · MF A · FW B)를 MF2 위로 (놓지 않음): GK·DF 빨강, MF·FW 초록 + 적성 안내, 고스트
  await drag(cardEl(MIRKA), slotEl("MF2"), { release: false });
  assert.ok(inStage(".lu-ghost", "드래그 고스트").textContent.includes("미르카"), "드래그: 고스트 = 미르카");
  assert.ok(slotEl("MF2").classList.contains("drop-hover") && $(".lu-ghost").classList.contains("ok"), "드래그: 포인터 밑 MF2 = 초록 hover");
  for (const sl of ["GK", "DF1", "DF2"]) assert.ok(slotEl(sl).classList.contains("drop-bad"), `드래그: ${sl} 빨강`);
  for (const sl of ["MF1", "MF2", "FW1", "FW2"]) assert.ok(slotEl(sl).classList.contains("drop-ok"), `드래그: ${sl} 초록`);
  assert.equal(slotEl("GK").querySelector(".lu-hint").textContent, "GK 적성 없음", "드래그: 빨강 이유");
  assert.equal(slotEl("MF2").querySelector(".lu-hint").textContent, "MF A · 타린 벤치로", "드래그: 초록 = 적성 + 밀려나는 선수");
  assert.equal(slotEl("FW1").querySelector(".lu-hint").textContent, "FW B · 울릭 벤치로", "드래그: 적성 글자");
  assert.ok(cardEl(MIRKA).classList.contains("lu-dragging") && cardEl(MIRKA).classList.contains("drop-origin"), "드래그: 끄는 카드 = 원래 자리");
  ptr("pointerup", window, 300, 240); // MF2 에 놓기
  await wait(5);
  await until(() => S.store.setup.squad.MF2 === MIRKA);
  assert.equal($$(".lu-ghost").length, 0, "놓으면 고스트 사라짐");
  assert.ok(slotEl("MF2").dataset.pid === MIRKA && cardEl(TARIN).classList.contains("bench"), "놓기: 미르카 MF2 · 타린 벤치");
  // 빨강(GK)에 놓기 → 거절: 흔들림 + 안내 토스트, 변경 없음
  const before = JSON.stringify(S.store.setup.squad);
  await drag(slotEl("MF2"), slotEl("GK"));
  assert.equal(JSON.stringify(S.store.setup.squad), before, "빨강에 놓기: 변경 없음");
  assert.ok(slotEl("GK").classList.contains("lu-shake"), "빨강에 놓기: 흔들림");
  assert.ok($$("#toast-root .toast-info").some((e) => /놓을 수 없음.*미르카.*GK 적성 없음/.test(e.textContent)), "빨강에 놓기: 이유 토스트");
  // 필드 선수(MF2 미르카)를 벤치 선수(타린) 카드에 = 교체 투입
  await drag(slotEl("MF2"), cardEl(TARIN));
  await until(() => S.store.setup.squad.MF2 === TARIN);
  assert.ok(cardEl(MIRKA).classList.contains("bench"), "교체: 미르카 벤치");
  // 슬롯 → 슬롯 = 맞바꾸기 (돌바르 DF1 → GK, 네리아 → DF1)
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
  // 전술 미팅: 3열 (전술 6 — 배급 포함 · 포메이션 + 라인업 보드(슬롯 7, 끌어서 맞바꾸기) · 스킬 상점)
  btnByText(/미팅$/, bar).click();
  inStage("#modal-root .modal.modal-xl .meeting-cols", "미팅");
  assert.equal($$("#modal-root .meeting-col").length, 3, "미팅: 3열");
  assert.equal($$("#modal-root .meeting-col")[0].querySelectorAll("select").length, 6, "미팅: 전술 6개 (배급 포함)");
  assert.ok($$("#modal-root .meeting-col")[0].textContent.includes("배급"), "미팅: 배급 전술");
  assert.equal($$("#modal-root .meeting-board .lu-pitch.compact .lu-slot").length, 7, "미팅: 라인업 보드 슬롯 7개");
  assert.equal($$("#modal-root .meeting-board select").length, 1, "미팅: 포지션 드롭다운 대신 보드 (포메이션 선택만)");
  assert.equal($$("#modal-root .lu-pool").length, 0, "미팅: 벤치 없음 (7명 전원 배치)");
  assert.ok(btnByText(/^미팅 진행$/, $("#modal-root")), "미팅: [미팅 진행]");
  const mslot = (sl) => $(`#modal-root .lu-slot[data-slot="${sl}"]`);
  const pidAt = (sl) => mslot(sl)?.dataset.pid;
  const runSlots0 = Object.fromEntries(S.store.run.players.map((p) => [p.slot, p.id]));
  for (const [sl, pid] of Object.entries(runSlots0)) assert.equal(pidAt(sl), pid, `미팅: 보드 처음 = 런 배치 (${sl})`);
  // 드래그: DF1(돌바르 GK B · DF A · MF C · FW -) → FW 빨강, GK 초록(⇄ 네리아)
  const dolbar = S.store.run.players.find((p) => p.charId === "ch_dwarf_wall");
  const neria = S.store.run.players.find((p) => p.charId === "ch_spirit_keeper");
  await drag(mslot(dolbar.slot), mslot("FW1"), { release: false });
  assert.ok(mslot("FW1").classList.contains("drop-bad") && mslot("FW1").querySelector(".lu-hint").textContent === "FW 적성 없음", "미팅 드래그: FW 빨강");
  assert.ok(mslot("GK").classList.contains("drop-ok") && mslot("GK").querySelector(".lu-hint").textContent === `GK B ⇄ ${neria.name}`, "미팅 드래그: GK 초록 (맞바꾸기 상대)");
  ptr("pointerup", window, 300, 240); // 빨강에 놓기 → 거절
  await wait(5);
  assert.equal(pidAt("FW1"), runSlots0.FW1, "미팅: 빨강에 놓으면 변경 없음");
  assert.equal($$("#modal-root .modal").length, 1, "미팅: 보드 밖 click 을 삼켜 모달이 닫히지 않는다");
  await drag(mslot(dolbar.slot), mslot("GK"));
  assert.ok(pidAt("GK") === dolbar.id && pidAt(dolbar.slot) === neria.id, "미팅: 돌바르 GK ⇄ 네리아 (돌바르 원래 자리로)");
  assert.ok(mslot("GK").textContent.includes(`원래 ${dolbar.slot}`), "미팅: 옮긴 선수에 원래 자리 표시");
  // 탭 경로: 선수를 누르고 → 다른 선수를 누르면 맞바꾸기 (MF1 ⇄ MF2)
  const mf1 = pidAt("MF1");
  const mf2 = pidAt("MF2");
  mslot("MF1").click();
  assert.ok(mslot("MF1").classList.contains("lu-selected") && mslot("MF2").classList.contains("drop-ok"), "미팅 탭: 고른 선수 기준 색");
  mslot("MF2").click();
  assert.ok(pidAt("MF1") === mf2 && pidAt("MF2") === mf1, "미팅 탭: MF1 ⇄ MF2");
  // [미팅 진행] 이 만드는 액션을 가로채 엔진 resolveMeeting 으로 적용 → 최종 배치 = 보드 배치
  const boardFinal = Object.fromEntries($$("#modal-root .lu-slot").map((e) => [e.dataset.slot, e.dataset.pid]));
  let sent = null;
  const realDo = S.actions.doAction;
  S.actions.doAction = (a) => { sent = a; };
  try { btnByText(/^미팅 진행$/, $("#modal-root")).click(); } finally { S.actions.doAction = realDo; }
  assert.ok(sent && sent.type === "meeting" && Array.isArray(sent.swaps) && sent.swaps.length >= 2 && !sent.formation, "미팅 진행: swaps 액션");
  const { resolveMeeting } = await import(pathToFileURL(path.join(ROOT, "js/engine/training.js")).href);
  const probe = JSON.parse(JSON.stringify(S.store.run));
  resolveMeeting(probe, data, sent);
  assert.deepEqual(Object.fromEntries(probe.players.map((p) => [p.slot, p.id])), boardFinal, "미팅 진행: 엔진이 적용한 배치 = 보드 배치");
  assert.equal($$("#modal-root .overlay").length, 0, "미팅 진행: 모달 닫힘");
  // 다시 열면 런 배치 그대로 (가로챘으므로 적용 안 됨), 포메이션 2-3-1 → MF3 생김 · 7명 유지
  btnByText(/미팅$/, bar).click();
  inStage("#modal-root .meeting-board", "미팅 다시");
  const msel = $("#modal-root .meeting-board .field select");
  msel.value = "2-3-1";
  msel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal($$("#modal-root .lu-slot").length, 7, "미팅: 포메이션 바꿔도 슬롯 7개");
  assert.ok(mslot("MF3") && pidAt("MF3") === runSlots0.FW2, "미팅: 2-3-1 → 없어진 FW2 선수가 MF3 로");
  assert.equal(new Set($$("#modal-root .lu-slot").map((e) => e.dataset.pid)).size, 7, "미팅: 7명 모두 한 자리씩");
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
