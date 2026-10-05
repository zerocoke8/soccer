// test/eventsUi.test.mjs — LESSON_PROTO_PLAN §24.13 (이벤트 화면, jsdom). U3: 이벤트 모달 · 결과 카드 · 카드 3택1 · 외출 이야기 · 회상 · 키 아트 · 계정 저장.
// (U4 · U5 가 깜짝 말풍선 · 레전드 화면을 더한다.)
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트한다. fetch = dataFetch(ROOT, { events: true }) (데이터 그대로) + 부트 뒤 기능 스위치를 모두 켠다
// (I1 전에는 data/lesson.json 이 꺼 둔다). 화면 검사는 테스트 안의 고정 이벤트 (ev_ui_* — data.lesson_ev_week 에 더한다) 로 하고,
// 실제 콘텐츠는 흐름 (시즌 시작 · 외출 이야기 · 회상 목록) 에만 쓴다 — 개수 · 글은 데이터에서 읽는다.
//   - 시작 화면 키 아트 (배경 + 반신 5) · [📖 회상 n/48] · 계정 저장 모양 검사 (틀리면 빈 값)
//   - startRun → createRun 에 계정 스냅샷 · 시즌 시작 이벤트 (weekOffer 없음) 배경 = 1주차 주 화면
//   - 이벤트 모달: 흉상 (주인공 · 짝 둘 · 주인공 + 코치) · 선수 2 · 미리보기 줄 · 추천 = 뷰 · 감독 AI · 반말판 글
//   - 덱 고르기 → resolveEvent(i, { uid }) · 결과 카드 → [계속] → 3택1 모달 (pick · 건너뛰기 TP)
//   - 외출 모달 이야기 배지 → 외출 → 이야기 화 → 계정 저장 합침 → 저장 삭제 · 다시 하기 뒤에도 계정 저장은 남는다
//   - 회상: 16칸 · 진행 · 본 화 / 다음 화 / 잠김 · 읽기 모달 (본문 · 두 선택지 결과)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const { KEYS } = ST;

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 10) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}

/** 테스트 안의 고정 이벤트 (주 끝 trigger — 검사를 통과하는 모양, 실제 콘텐츠에 기대지 않는다) */
const TEST_EVENTS = [
  {
    id: "ev_ui_solo", trigger: "week", title: "UI 시험 — 혼자", text: "{선수|이/가} 웃습니다.", who: { pick: "random" }, scene: "ground",
    choices: [
      { label: "팀워크를 챙긴다", effects: [{ type: "teamwork", amount: 2 }], result: "{선수|이/가} 고개를 끄덕입니다." },
      { label: "TP 를 챙긴다", effects: [{ type: "tp", amount: 40 }], result: "TP 를 받았습니다." },
    ],
    alt: { banmal: { text: "{선수|이/가} 웃는다. 반말판이다.", results: ["{선수|이/가} 끄덕인다.", "TP 다."] } },
  },
  {
    id: "ev_ui_pair", trigger: "week", title: "UI 시험 — 짝", text: "실루엔과 타리아가 함께 뜁니다.", chars: ["ch_elf_playmaker", "ch_human_runner"], scene: "nature",
    choices: [
      { label: "둘을 칭찬한다", effects: [{ type: "condition", amount: 1 }], result: "둘이 웃습니다." },
      { label: "쉬게 한다", effects: [{ type: "stamina", target: "team", amount: 5 }], result: "쉽니다." },
    ],
  },
  {
    id: "ev_ui_coach", trigger: "week", title: "UI 시험 — 코치", text: "{코치|이/가} {선수|을/를} 부릅니다.", who: { pick: "random" }, coach: "sp_coach_harr", scene: "ground",
    choices: [
      { label: "맡긴다", effects: [{ type: "bond", target: "coach", amount: 5 }], result: "유대가 올랐습니다." },
      { label: "사양한다", effects: [{ type: "tp", amount: 5 }], result: "TP 를 받았습니다." },
    ],
  },
  {
    id: "ev_ui_pick", trigger: "week", title: "UI 시험 — 카드 고르기", text: "{선수|이/가} 훈련표를 봅니다.", who: { pick: "random" }, scene: "clubhouse",
    choices: [
      { label: "카드를 다듬는다", effects: [{ type: "cardPick", op: "upgrade" }], result: "카드를 다듬었습니다." },
      { label: "그냥 둔다", effects: [{ type: "tp", amount: 1 }], result: "그대로 둡니다." },
    ],
  },
  {
    id: "ev_ui_offer", trigger: "week", title: "UI 시험 — 3택1", text: "새 훈련 카드가 들어왔습니다.", who: { pick: "none" }, scene: "town",
    choices: [
      { label: "고른다", effects: [{ type: "rewardOffer" }], result: "카드 세 장을 펼칩니다." },
      { label: "넘긴다", effects: [{ type: "tp", amount: 1 }], result: "넘깁니다." },
    ],
  },
];

test("store: 계정 저장 (KEYS.account) — 모양 검사 · 저장 삭제와 따로", async () => {
  const mem = new Map();
  const saved = globalThis.localStorage;
  const warn = console.warn;
  console.warn = () => {}; // lsGet 의 "읽기 실패" 경고 (틀린 JSON 을 일부러 넣는다)
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  };
  try {
    assert.equal(KEYS.account, "soccer-lesson.account");
    assert.deepEqual(ST.loadAccount(), { version: 1, stories: {}, coachMet: {} }, "없으면 빈 값");
    for (const bad of ["x", "[1,2]", "{", JSON.stringify({ version: 2, stories: { ch_a: 1 } }), JSON.stringify(null), "7"]) {
      mem.set(KEYS.account, bad);
      assert.deepEqual(ST.loadAccount(), { version: 1, stories: {}, coachMet: {} }, `틀린 모양 = 빈 값 (${bad})`);
    }
    mem.set(KEYS.account, JSON.stringify({ version: 1, stories: { ch_a: 2, ch_b: 0, ch_c: "1", ch_d: 7, ch_e: 1.5 }, coachMet: { sp_a: true, sp_b: 1 }, extra: 1 }));
    assert.deepEqual(ST.loadAccount(), { version: 1, stories: { ch_a: 2, ch_d: 3 }, coachMet: { sp_a: true } }, "틀린 칸만 버린다 (화 1 ~ 3 정수 · 코치 true)");
    assert.ok(ST.saveAccount({ stories: { ch_a: 3 }, coachMet: {} }));
    assert.deepEqual(JSON.parse(mem.get(KEYS.account)), { version: 1, stories: { ch_a: 3 }, coachMet: {} });
    mem.set(KEYS.run, "{}");
    mem.set(KEYS.match, "{}");
    ST.clearRunSaves();
    assert.ok(!mem.has(KEYS.run) && !mem.has(KEYS.match) && mem.has(KEYS.account), "clearRunSaves 는 계정 저장을 지우지 않는다");
  } finally {
    globalThis.localStorage = saved;
    console.warn = warn;
  }
});

test("이벤트 화면 미리보기 줄 (event.js previewLines): 확률 갈래는 갈래마다 한 줄", async () => {
  const { previewLines } = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/event.js")).href);
  assert.deepEqual(previewLines(["70%: 슈팅 +30 / 30%: 슈팅 +30, 다음 레슨 1회 결장", "팀워크 +5"]), ["70%: 슈팅 +30", "30%: 슈팅 +30, 다음 레슨 1회 결장", "팀워크 +5"]);
  assert.deepEqual(previewLines([], "컨디션 +1"), ["컨디션 +1"], "줄이 없으면 미리보기 글");
  assert.deepEqual(previewLines(["A / B"]), ["A / B"], "확률이 아니면 그대로");
});

test("jsdom: 이벤트 모달 · 결과 카드 · 3택1 · 외출 이야기 · 회상 · 키 아트 · 계정 저장 (§24.13 U3)", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
  const g = globalThis;
  const saved = {};
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle", "Image"];
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, "navigator", { value: window.navigator, configurable: true, writable: true }); } catch { /* node 21+ 읽기 전용 */ }
  g.confirm = () => true;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  g.Image = window.Image;
  const realFetch = g.fetch;
  g.fetch = dataFetch(ROOT, { events: true }); // 데이터 그대로 (부트 뒤 스위치를 켠다)
  const origConsoleError = console.error;
  const consoleErrors = [];
  console.error = (...a) => { consoleErrors.push(a.map(String).join(" ")); };
  t.after(() => {
    console.error = origConsoleError;
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  // 계정 저장: 그레타 2화까지 봤다
  window.localStorage.setItem(KEYS.account, JSON.stringify({ version: 1, stories: { ch_giant_striker: 2 }, coachMet: {} }));
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  const S = await until(() => window.__soccer?.store?.data && window.__soccer.run && window.__soccer.lessonEvents && window.__soccer);
  assert.ok(S, "부트 완료");
  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const data = S.store.data;
  const LE = S.lessonEvents;
  const noErrorToast = (where) => assert.equal($$("#toast-root .toast-error").length, 0, `${where}: 에러 토스트 없음 (${$$("#toast-root .toast-error").map((e) => e.textContent).join(" / ")})`);
  LE.setEventSwitches(data.lesson, true);
  data.lesson_ev_week.events.push(...JSON.parse(JSON.stringify(TEST_EVENTS)));
  assert.deepEqual(LE.lessonEventErrors(data), [], "고정 이벤트 + 실제 데이터 검사 통과");
  const stories = LE.storyList(data);
  const account = () => JSON.parse(window.localStorage.getItem(KEYS.account) || "null");

  // ---------- 시작 화면: 키 아트 · [📖 회상] ----------
  S.render();
  assert.ok($(".start-screen .hero.has-art .hero-bg"), "키 아트: 배경 그림 (title)");
  assert.ok($(".hero-bg").getAttribute("src").includes("img/scenes/title.webp"), "키 아트 배경 = title");
  const castIds = ["ch_spirit_keeper", "ch_wolf_winger", "ch_elf_playmaker", "ch_giant_striker", "ch_giant_keeper"].filter((id) => data.portraits?.chars?.[id]);
  assert.deepEqual($$(".hero-cast .hc").map((e) => e.dataset.char), castIds, "키 아트: 반신 5명 (네리아 · 울리카 · 실루엔 · 그레타 · 헤르타)");
  assert.ok($$(".hero-cast .hc-img").every((im) => /\.half\.webp/.test(im.getAttribute("src"))), "반신 그림");
  assert.ok($(".hero h1")?.textContent.length > 0 && $$(".hero-flow li").length === 3 && $(".hero-badge"), "키 아트 위 글: 제목 · 흐름 3단계 · 배지");
  const recBtn = $(".start-menu .recollection-btn");
  assert.ok(recBtn, "[📖 회상]");
  assert.ok(recBtn.textContent.includes(`2/${stories.length}`), `회상 버튼 진행 2/${stories.length} (${recBtn.textContent})`);

  // ---------- startRun → 계정 스냅샷 · 시즌 시작 이벤트 (weekOffer 없음) ----------
  const cfg = data.config;
  S.actions.startRun({ squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation, supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: data.lesson.defaultPolicy, seed: "ev-ui" });
  const st = S.store.run;
  assert.deepEqual(st.account.stories, { ch_giant_striker: 2 }, "createRun 에 계정 스냅샷 (본 이야기)");
  assert.equal(st.phase, "event", "시즌 시작 이벤트");
  assert.equal(st.weekOffer, null, "시즌 시작 이벤트 때는 weekOffer 가 없다");
  assert.ok($(".week-screen.inert") && !$(".week-screen.week-blank"), "배경 = 주 화면 (빈 배경이 아님)");
  assert.equal($$(".week-screen.inert .week-lesson").length, 5, "배경 = 1주차 레슨 주 (중점 구역 카드 5)");
  assert.ok($("#modal-root .event-modal .evm-kind.k-seasonStart"), "시즌 시작 배지");
  assert.ok($$("#modal-root .event-modal .choice-btn").length === 2, "선택지 2");
  noErrorToast("시즌 시작");

  const pid = (charId) => st.players.find((p) => p.charId === charId).id;
  /** 떠 있는 이벤트를 고정 이벤트로 바꾼다 (끝나면 같은 주로 — resumeWeek) */
  const fire = (id, ctx = {}) => {
    const s = S.store.run;
    s.currentEvent = null;
    s.queue = ["resumeWeek"];
    LE.fireEvent(s, data, LE.eventById(data, id), { kind: "week", ...ctx });
    S.render();
    return S.run.getEventView(s, data);
  };

  // ---------- 이벤트 모달: 흉상 · 선택지 · 미리보기 · 추천 · 반말판 ----------
  let v = fire("ev_ui_solo", { playerId: pid("ch_human_captain") });
  const modal = () => $("#modal-root .modal.event-modal");
  assert.ok(modal(), "이벤트 모달 (modal-xl event-modal)");
  assert.ok(modal().querySelector(".evm-band .evm-scene")?.getAttribute("src").includes("img/scenes/ground.webp"), "배경 띠 = scene 그림");
  assert.equal(modal().querySelector(".evm-title").textContent, "UI 시험 — 혼자");
  assert.equal(modal().querySelector(".evm-kind").textContent, "주 끝", "종류 배지");
  let busts = $$("#modal-root .evm-cast .evm-bust");
  assert.equal(busts.length, 1, "흉상 1 (주인공)");
  assert.equal(busts[0].dataset.id, pid("ch_human_captain"), "주인공 흉상 = 아델린");
  assert.ok(busts[0].querySelector("img.pt")?.getAttribute("src").includes("ch_human_captain.bust.webp"), "흉상 그림 (bust)");
  assert.ok(busts[0].textContent.includes("아델린") && busts[0].textContent.includes("선수 · "), "흉상 이름 · 역할");
  assert.equal(modal().querySelector(".event-text").textContent, "아델린이 웃습니다.", "존댓말 선수 = 기본 글 (조사)");
  const btns = $$("#modal-root .choice-btn");
  assert.equal(btns.length, 2, "선택지 2");
  assert.deepEqual(btns.map((b) => b.querySelector(".cb-label").textContent), ["팀워크를 챙긴다", "TP 를 챙긴다"]);
  assert.deepEqual(btns.map((b) => [...b.querySelectorAll(".pv-line")].map((e) => e.textContent)), v.choices.map((c) => c.lines), "미리보기 줄 = 뷰 lines");
  const recI = v.choices.findIndex((c) => c.recommended);
  assert.equal(S.manager.recommendEventChoice(S.store.run, data).choice, recI, "뷰 추천 = 감독 AI");
  assert.deepEqual(btns.map((b) => b.classList.contains("recommended")), v.choices.map((c) => c.recommended), "추천 배지 = 뷰");
  assert.equal($$("#modal-root .choice-btn .cb-rec").length, 1, "추천 배지 하나");
  // 반말판 (도르비나 — lesson.json events.speech banmal)
  fire("ev_ui_solo", { playerId: pid("ch_dwarf_wall") });
  assert.equal(modal().querySelector(".event-text").textContent, "도르비나가 웃는다. 반말판이다.", "반말 선수 = alt.banmal 글");
  // 짝 이벤트: 주인공 없음 → 등장 선수 둘
  v = fire("ev_ui_pair");
  assert.equal(v.player, null, "짝 이벤트 = 주인공 없음");
  busts = $$("#modal-root .evm-cast .evm-bust");
  assert.deepEqual(busts.map((b) => b.dataset.id), [pid("ch_elf_playmaker"), pid("ch_human_runner")], "흉상 둘 = 등장 선수 (art.charIds)");
  assert.ok($("#modal-root .evm.cast-2"), "두 명 틀");
  // 코치 편성 이벤트: 주인공 + 코치
  fire("ev_ui_coach", { playerId: pid("ch_giant_striker") });
  busts = $$("#modal-root .evm-cast .evm-bust");
  assert.deepEqual(busts.map((b) => b.dataset.kind), ["player", "coach"], "흉상 = 주인공 · 코치");
  assert.equal(busts[1].dataset.id, "sp_coach_harr");
  assert.ok(busts[1].querySelector("img.pt")?.getAttribute("src").includes("sp_coach_harr.bust.webp"), "코치 흉상 그림");
  assert.ok(/코치 · 유대 \d+/.test(busts[1].textContent), "코치 유대");
  assert.equal(modal().querySelector(".event-text").textContent, "코치 하르나가 그레타를 부릅니다.", "{코치} · {선수} 조사");
  noErrorToast("이벤트 모달");

  // ---------- 덱 고르기 (cardPick) → resolveEvent(i, { uid }) → 결과 카드 ----------
  v = fire("ev_ui_pick", { playerId: pid("ch_human_runner") });
  const cands = v.choices[0].needs.candidates;
  assert.ok(cands.length > 0, "강화 후보가 있다");
  const pickBtn = $("#modal-root .choice-btn.needs-pick");
  assert.ok(pickBtn && pickBtn.dataset.choice === "0", "고르는 선택지 표시");
  pickBtn.click();
  assert.ok($("#modal-root .evm.picking"), "같은 모달 안 덱 고르기");
  assert.equal($$("#modal-root .evm-deck .mini-card").length, S.store.run.deck.length, "덱 전체 (작은 카드)");
  assert.deepEqual($$("#modal-root .evm-deck .mini-card:not(.disabled)").map((e) => e.dataset.uid).sort(), cands.map((c) => c.uid).sort(), "누를 수 있는 카드 = 후보");
  assert.equal($$("#modal-root .evm-cast .evm-bust").length, 0, "덱 고르기 중에는 흉상을 접는다");
  $("#modal-root .evm-back").click();
  assert.ok(!$("#modal-root .evm.picking") && $$("#modal-root .choice-btn").length === 2, "[← 다른 선택지] = 선택지로");
  $("#modal-root .choice-btn.needs-pick").click();
  const target = cands[cands.length - 1].uid;
  if ($("#modal-root .evm-deck .mini-card.selected")?.dataset.uid !== target) $(`#modal-root .evm-deck .mini-card[data-uid="${target}"]`).click();
  assert.equal($("#modal-root .evm-deck .mini-card.selected")?.dataset.uid, target, "고른 카드");
  assert.ok(!$("#modal-root .evm-pick-ok").disabled, "[강화 확정] 켜짐");
  const origResolve = S.actions.resolveEvent;
  const calls = [];
  S.actions.resolveEvent = function (i, o) { calls.push({ i, o }); return origResolve.call(this, i, o); };
  const seqBefore = Number(S.store.run.eventSeq);
  $("#modal-root .evm-pick-ok").click();
  S.actions.resolveEvent = origResolve;
  assert.deepEqual(calls, [{ i: 0, o: { uid: target } }], "resolveEvent(0, { uid })");
  assert.equal(S.store.run.deck.find((e) => e.uid === target).plus, true, "고른 카드 강화");
  assert.equal(S.store.run.phase, "week", "흐름은 다음 phase 로 (resumeWeek)");
  assert.equal(S.store.run.lastEvent.seq, seqBefore, "lastEvent = 방금 이벤트");
  // 결과 카드 (화면 전용): 주 화면보다 먼저
  assert.ok($("#modal-root .evm-result"), "결과 카드");
  assert.ok($(".week-screen.inert"), "결과 카드 배경 = 주 화면 (조작 불가)");
  assert.equal($("#modal-root .evm-result .evm-res-text").textContent, "카드를 다듬었습니다.", "결과 문구");
  assert.deepEqual($$("#modal-root .evm-fx li").map((e) => e.textContent), S.store.run.lastEvent.lines, "받은 효과 줄 = lastEvent.lines");
  assert.ok($("#modal-root .evm-res-choice").textContent.includes("카드를 다듬는다"), "고른 선택지");
  $("#modal-root .evm-continue").click();
  assert.equal(S.store.eventUi.resultSeq, null, "[계속] = 결과 카드 닫힘");
  assert.ok(!$("#modal-root .evm-result") && $(".week-screen:not(.inert)"), "[계속] → 주 화면 (조작 가능)");
  noErrorToast("덱 고르기");

  // ---------- 결과 카드 → 3택1 모달 (pick) ----------
  fire("ev_ui_offer");
  assert.equal($$("#modal-root .evm-cast .evm-bust").length, 0, "주인공 없는 이벤트 = 흉상 없음");
  $('#modal-root .choice-btn[data-choice="0"]').click();
  assert.equal(S.store.run.phase, "cardOffer", "보상 카드 3택1 phase");
  assert.ok($("#modal-root .evm-result") && !$("#modal-root .card-offer-modal"), "결과 카드가 3택1 모달보다 먼저");
  $("#modal-root .evm-continue").click();
  assert.ok($("#modal-root .card-offer-modal"), "[계속] → 3택1 모달");
  assert.ok($(".week-screen.inert"), "3택1 배경 = 주 화면 (조작 불가)");
  const offer = S.run.getCardOfferView(S.store.run, data);
  assert.equal($$("#modal-root .card-offer-modal .rw-offer-slot .card-face").length, offer.cards.length, "카드 앞면 = 후보");
  assert.ok($("#modal-root .card-offer-modal .cof-src").textContent.includes("UI 시험 — 3택1"), "출처 이벤트 제목");
  assert.ok($("#modal-root .cof-skip").textContent.includes(`TP +${offer.skipTp}`), "[건너뛰기 TP +10]");
  const recPick = S.manager.recommendCardOffer(S.store.run, data).pick;
  if (recPick !== null) assert.ok($$("#modal-root .rw-offer-slot .card-face")[recPick].classList.contains("recommended"), "추천 카드");
  assert.ok($("#modal-root .cof-ok").disabled, "고르기 전 [확인] 꺼짐");
  const deckN = S.store.run.deck.length;
  $$("#modal-root .rw-offer-slot .card-face")[0].click();
  assert.ok(!$("#modal-root .cof-ok").disabled, "고르면 [확인]");
  $("#modal-root .cof-ok").click();
  assert.equal(S.store.run.deck.length, offer.cards[0].kind === "upgrade" ? deckN : deckN + 1, "카드 획득");
  assert.equal(S.store.run.phase, "week");
  assert.ok(!$("#modal-root .card-offer-modal"), "3택1 모달 닫힘");
  // 건너뛰기 = TP +10
  fire("ev_ui_offer");
  S.actions.resolveEvent(0);
  S.actions.closeEventResult();
  const tp0 = S.store.run.trainingPoints;
  $("#modal-root .cof-skip").click();
  assert.ok($("#modal-root .cof-skip").classList.contains("selected"), "건너뛰기 고름");
  $("#modal-root .cof-ok").click();
  assert.equal(S.store.run.trainingPoints, tp0 + offer.skipTp, "건너뛰기 TP +10");
  assert.equal(S.store.run.phase, "week");
  noErrorToast("3택1");

  // ---------- 외출 모달: 흉상 · 이야기 n/3화 · 일반 외출 → 외출 이야기 → 계정 저장 ----------
  const s = S.store.run;
  s.account = { stories: { ch_giant_striker: 2, ch_spirit_keeper: 3 }, coachMet: {} };
  s.weekOffer = { kind: "free", actions: ["outing", "meeting", "consult"], guaranteed: null };
  s.phase = "week";
  S.render();
  $('.week-act[data-act="outing"]').click();
  const rows = $$("#modal-root .outing-grid .outing-pick");
  assert.equal(rows.length, 7, "외출 모달 선수 7");
  const storyOf = (charId) => rows.find((r) => r.dataset.pid === pid(charId)).querySelector(".op-story")?.textContent;
  assert.equal(storyOf("ch_giant_striker"), "이야기 3/3화", "그레타 = 다음 3화");
  assert.equal(storyOf("ch_spirit_keeper"), "일반 외출", "네리아 = 다 봤다 → 일반 외출");
  assert.equal(storyOf("ch_human_captain"), "이야기 1/3화", "아델린 = 1화");
  assert.ok(rows.every((r) => r.querySelector(".avatar.op-bust")), "선수 줄 흉상 칸");
  assert.ok(rows.some((r) => r.querySelector(".avatar.op-bust.bust img.pt")?.getAttribute("src").includes(".bust.webp")), "흉상 그림");
  rows.find((r) => r.dataset.pid === pid("ch_giant_striker")).click();
  const cur = S.store.run.currentEvent;
  assert.equal(S.store.run.phase, "event", "외출 → 외출 이벤트");
  const ep3 = LE.eventById(data, cur.eventId);
  assert.deepEqual(ep3.story, { charId: "ch_giant_striker", ep: 3 }, "그레타 3화 (계정 2화 + 1)");
  assert.equal($("#modal-root .evm-kind.k-story").textContent, "이야기 3/3화", "이야기 배지");
  assert.equal(account().stories.ch_giant_striker, 2, "띄울 때는 아직 세지 않는다");
  const nonPick = [...$$("#modal-root .choice-btn")].find((b) => !b.classList.contains("needs-pick"));
  nonPick.click();
  assert.equal(account().stories.ch_giant_striker, 3, "고른 순간 계정 저장에 합친다 (engine → accountMerge)");
  assert.ok($("#modal-root .evm-result"), "외출 이야기 결과 카드");
  noErrorToast("외출 이야기");

  // ---------- 저장 삭제 · 다시 하기 → 계정 저장은 남는다 ----------
  S.actions.closeEventResult();
  assert.ok(window.localStorage.getItem(KEYS.run), "런 저장");
  S.actions.discardSave();
  assert.equal(window.localStorage.getItem(KEYS.run), null, "저장 삭제 = 런 저장 지움");
  assert.equal(account().stories.ch_giant_striker, 3, "저장 삭제 뒤에도 계정 저장 (본 이야기) 은 남는다");
  S.actions.replay("again");
  assert.equal(account().stories.ch_giant_striker, 3, "다시 하기 뒤에도 남는다");
  S.actions.resetToStart();

  // ---------- 회상 ----------
  window.localStorage.setItem(KEYS.account, JSON.stringify({ version: 1, stories: { ch_giant_striker: 1, ch_spirit_keeper: 3 }, coachMet: {} }));
  S.render();
  $(".start-menu .recollection-btn").click();
  assert.equal(S.store.screen, "recollection", "[회상] → 회상 화면");
  assert.ok($(".screen.og.recollection-screen"), "회상 화면");
  assert.equal($$(".rc-grid .rc-cell").length, data.characters.length, "선수 칸 16");
  assert.ok($(".rc-total").textContent.includes(`4/${stories.length}`), `본 이야기 4/${stories.length} (${$(".rc-total").textContent})`);
  assert.equal($('.rc-cell[data-char="ch_spirit_keeper"]').dataset.seen, "3");
  assert.ok($('.rc-cell[data-char="ch_spirit_keeper"]').textContent.includes("3/3"), "네리아 3/3");
  $('.rc-cell[data-char="ch_giant_striker"]').click();
  assert.ok($('.rc-cell.selected[data-char="ch_giant_striker"]'), "그레타 고름");
  const eps = $$(".rc-eps .rc-ep");
  assert.deepEqual(eps.map((e) => e.dataset.state), ["seen", "next", "locked"], "1화 본 화 · 2화 다음 화 · 3화 잠김");
  const greta1 = stories.find((x) => x.charId === "ch_giant_striker" && x.ep === 1);
  assert.ok(eps[0].tagName === "BUTTON" && eps[0].textContent.includes(greta1.title), "본 화 = 제목 · 누를 수 있다");
  assert.ok(eps[1].tagName !== "BUTTON" && eps[1].textContent.includes("외출하면 볼 수 있다") && eps[1].textContent.includes("???"), "다음 화 = 외출하면 볼 수 있다 (제목 숨김)");
  assert.ok(eps[2].textContent.includes("???") && !eps[2].textContent.includes("외출하면"), "잠긴 화 = 실루엣 · ???");
  eps[0].click();
  const rm = $("#modal-root .rc-read-modal");
  assert.ok(rm, "읽기 모달");
  const ev1 = LE.eventById(data, greta1.id);
  const texts = await import(pathToFileURL(path.join(ROOT, "js/engine/lessonText.js")).href);
  const vars = { player: "그레타", season: "?" };
  assert.equal(rm.querySelector(".event-text").textContent, texts.fillText(texts.pickText(ev1, "ch_giant_striker", data).text, vars), "본문 (자리표시 채움)");
  assert.equal(rm.querySelectorAll(".rc-choice").length, ev1.choices.length, "두 선택지");
  ev1.choices.forEach((c, i) => {
    const el = rm.querySelectorAll(".rc-choice")[i];
    assert.ok(el.textContent.includes(texts.fillText(c.label, vars)), `선택지 ${i} 이름`);
    const r = c.result;
    const want = typeof r === "string" ? [r] : [r.then, r.else];
    assert.equal(el.querySelectorAll(".rc-choice-res").length, want.length, `선택지 ${i} 결과 (갈래 모두)`);
    want.forEach((w) => assert.ok(el.textContent.includes(texts.fillText(w, vars)), `선택지 ${i} 결과 문구`));
  });
  assert.equal(S.store.run, null, "회상은 런과 상관없다 (효과 없음)");
  rm.querySelector(".rc-close").click();
  assert.ok(!$("#modal-root .rc-read-modal"), "[닫기]");
  [...$$(".rc-head button")].find((b) => b.textContent === "처음으로").click();
  assert.equal(S.store.screen, "start");
  noErrorToast("회상");

  assert.deepEqual(errors, [], "페이지 오류 없음");
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
