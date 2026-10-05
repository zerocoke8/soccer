// test/eventsUi.test.mjs — LESSON_PROTO_PLAN §24.13 (이벤트 화면, jsdom). U3: 이벤트 모달 · 결과 카드 · 카드 3택1 · 외출 이야기 · 회상 · 키 아트 · 계정 저장.
// U4: 레슨 깜짝 말풍선 (§24.8 — 턴 끝에 뜬다 · 선택지 2 · 추천 · 다른 조작 잠금 · 고르기 → 결과 띠 · 다음 턴 · 퍼펙트 → 보상).
// U5: 레전드 · 메모리 카드 (§24.9 — 결과 화면 메모리 카드 줄 → 등록 팀 memoryCard · 등록 팀 없음 = 잠금 · 옛 팀 "없음" ·
//     레전드 고르기 → startRun → createRun → 시작 덱에 카드 1장 · 같은 팀 (id) 둘 = 1장 · 덱 "메모리" 띠).
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

/** 테스트 안의 고정 깜짝 이벤트 (§24.8 U4 — 말풍선 검사): 주인공 있음 (가중치 1000 — 턴 끝 후보 중 이것) · 주인공 없음 (퍼펙트로 끝나는 선택지) */
const TEST_SURPRISES = [
  {
    id: "ls_ui_talk", trigger: "surprise", title: "UI 시험 — 깜짝", text: "{선수|이/가} 손을 듭니다. \"감독님, 한 번 더 해 볼까요?\"",
    cond: { turnMin: 1 }, who: { pick: "random" }, weight: 1000,
    choices: [
      { label: "맡긴다", effects: [{ type: "nextPct", pct: 20 }], result: "{선수|이/가} 고개를 끄덕입니다." },
      { label: "점수를 챙긴다", effects: [{ type: "score", amount: 12 }, { type: "stamina", target: "player", amount: -5 }], result: "{선수|이/가} 한 바퀴 더 뜁니다." },
    ],
  },
  {
    id: "ls_ui_finish", trigger: "surprise", title: "UI 시험 — 마무리", text: "다 같이 숨을 고릅니다. 마지막 힘을 짜낼까요?",
    cond: { turnMin: 1 }, who: { pick: "none" }, weight: 0.001,
    choices: [
      { label: "끝까지 간다", effects: [{ type: "score", amount: 30 }], result: "점수가 크게 올랐습니다." },
      { label: "쉰다", effects: [{ type: "teamwork", amount: 1 }], result: "쉽니다." },
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

test("편성 레전드 도우미 (setup.js §24.9 U5): legendTeams 최신순 · 쓸 수 없는 메모리 카드 · memoryDeckOf = 엔진 시작 덱 · legendArgs 사본", async () => {
  const { loadData } = await import("./helpers.mjs");
  const data = loadData();
  const LR = await import(pathToFileURL(path.join(ROOT, "js/engine/lessonRun.js")).href);
  const CH = await import(pathToFileURL(path.join(ROOT, "js/engine/challenge.js")).href);
  const { legendTeams, memoryDeckOf, legendArgs, maxLegends, initSetup } = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/setup.js")).href);
  assert.equal(maxLegends(LR), LR.MAX_LEGENDS, "칸 수 = 엔진 MAX_LEGENDS");
  assert.equal(maxLegends(null), 2, "엔진이 없으면 2");
  assert.deepEqual(initSetup(data).legends, [], "initSetup: 레전드 없음");
  const pl = (charId, slot) => ({ charId, name: data.characters.find((c) => c.id === charId).name, slot, portraitColor: "#123456" });
  const team = (seed, at, memoryCard, extra = {}) => ({
    name: "우리 클럽", seed, createdTurnIndex: 14, registeredAt: at, formation: "2-2-2", grade: "B", score: 500,
    players: [pl("ch_dwarf_wall", "DF1"), pl("ch_spirit_keeper", "GK"), pl("ch_wolf_winger", "FW1")], ...(memoryCard === undefined ? {} : { memoryCard }), ...extra,
  });
  const uniqueId = data.cards.cards.find((c) => c.family === "unique").id;
  const teams = [
    team("a", "2026-09-01T00:00:00.000Z", { cardId: "cd_high_five", plus: true }),
    team("b", "2026-10-01T00:00:00.000Z", undefined), // 옛 팀 (메모리 카드 키 없음)
    team("c", "2026-09-15T00:00:00.000Z", { cardId: uniqueId, plus: false }), // 고유 카드 = 쓸 수 없음
    team("d", "2026-09-20T00:00:00.000Z", { cardId: "cd_basic" }, { players: [{ charId: "ch_nobody", name: "?", slot: "GK" }] }), // 선수가 없다 → 빠진다
    { ...team("s", "2026-12-01T00:00:00.000Z", null), isSample: true }, // 샘플 팀은 레전드가 아니다
    null, "x",
  ];
  const lt = legendTeams(data, { run: LR, challenge: CH }, teams);
  assert.deepEqual(lt.map((t) => t.team.seed), ["b", "c", "a"], "선수가 남은 등록 팀만 · 최신순 (등록 시각)");
  assert.deepEqual(lt.map((t) => t.teamId), ["b", "c", "a"].map((s) => CH.teamIdOf(teams.find((t) => t?.seed === s))), "팀 id = challenge.teamIdOf");
  assert.deepEqual(lt[0].players.map((p) => p.charId), ["ch_spirit_keeper", "ch_dwarf_wall", "ch_wolf_winger"], "선수 = 슬롯 순서 (GK → FW)");
  assert.deepEqual([lt[0].memoryCard, lt[0].hadMemory], [null, false], "옛 팀 = 메모리 카드 없음");
  assert.deepEqual([lt[1].memoryCard, lt[1].hadMemory], [null, true], "고유 카드 = 쓸 수 없는 메모리 카드 (엔진 검사)");
  assert.deepEqual(lt[2].memoryCard, { cardId: "cd_high_five", plus: true });
  // memoryDeckOf = 엔진 createRun 시작 덱 메모리 카드 (같은 팀 id 둘 → 1장 · 앞 레전드가 카드 없음이면 뒤 레전드 카드)
  const L = (t, charId, memoryCard = t.memoryCard) => ({ teamId: t.teamId, teamName: t.name, charId, name: "x", memoryCard, grade: t.grade, color: "#fff" });
  const combos = [
    [L(lt[2], "ch_spirit_keeper"), L(lt[2], "ch_dwarf_wall")],
    [L(lt[2], "ch_spirit_keeper", null), L(lt[2], "ch_dwarf_wall", { cardId: "cd_cooldown", plus: true })],
    [L(lt[2], "ch_spirit_keeper"), L(lt[2], "ch_dwarf_wall", { cardId: "cd_basic", plus: false })],
    [L(lt[0], "ch_wolf_winger"), L(lt[2], "ch_wolf_winger")],
    [L(lt[2], "ch_spirit_keeper"), L(lt[0], "ch_dwarf_wall", { cardId: "cd_basic", plus: true })],
  ];
  for (const legends of combos) {
    const args = legendArgs(legends);
    assert.ok(args.every((a) => Object.keys(a).join() === "teamId,teamName,charId,name,memoryCard"), "legendArgs = 엔진에 넘길 5개 키");
    const s = LR.createRun({ data, seed: "u5-deck", legends: args });
    assert.deepEqual(memoryDeckOf(legends).map((d) => [d.cardId, d.plus]), s.deck.filter((e) => e.src === "memory").map((e) => [e.cardId, e.plus]), `화면 미리보기 = 엔진 시작 덱 (${JSON.stringify(args.map((a) => a.memoryCard))})`);
  }
  assert.deepEqual(memoryDeckOf(combos[2]).map((d) => d.index), [0], "같은 팀 id 에 다른 카드 = 앞 레전드 카드만");
  assert.deepEqual(memoryDeckOf(combos[1]).map((d) => d.index), [1], "앞 레전드가 카드 없음이면 뒤 레전드 카드");
});

test("jsdom: 이벤트 모달 · 결과 카드 · 3택1 · 외출 이야기 · 회상 · 키 아트 · 계정 저장 (§24.13 U3) · 레슨 깜짝 말풍선 (§24.8 U4) · 레전드 · 메모리 카드 (§24.9 U5)", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
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

  // ---------- 레슨 깜짝 말풍선 (§24.8 · §24.13, U4) ----------
  // 실제 흐름으로 레슨 중간까지 걸은 뒤 고정 깜짝 이벤트 (TEST_SURPRISES — 실제 콘텐츠에 기대지 않는다) 를 데이터에 더한다.
  // 움직임 줄이기 (연출 타이머 0ms) 로 빨리 끝낸다 — 결과 띠는 애니메이션 없이 2.5초 뒤 지운다.
  const savedMM = g.matchMedia;
  g.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} });
  t.after(() => { g.matchMedia = savedMM; });
  {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const LSN = await import(pathToFileURL(path.join(ROOT, "js/engine/lesson.js")).href);
    const { walkLesson } = await import(pathToFileURL(path.join(ROOT, "tools/lesson_scenarios.mjs")).href);
    const { previewLines } = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/event.js")).href);
    const base = walkLesson(data, {
      seed: "sur-ui",
      until: (s) => s.phase === "lesson" && s.lesson.status === "playing" && s.lesson.turn >= 2 && s.lesson.turn <= s.lesson.turns - 2
        && !s.lesson.surprise?.pending && s.lesson.cap - s.lesson.score > 150 && !s.lesson.bench.length,
    }).state;
    data.lesson_ev_surprise.events.push(...clone(TEST_SURPRISES));
    assert.deepEqual(LE.lessonEventErrors(data), [], "고정 깜짝 이벤트 + 실제 데이터 검사 통과");
    const ui = S.store.lessonUi;
    const notBusy = () => until(() => !ui.busy, 4000);
    const putRun = (st) => {
      S.store.run = clone(st);
      S.store.match = null;
      S.store.screen = "run";
      S.render();
      return S.store.run;
    };
    const lview = () => S.run.getLessonView(S.store.run, data);
    const seqNow = () => S.store.run.lesson.seq;
    const key = (k, target = doc) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
    const fieldW = 968;
    const fieldH = 392;
    const boxOf = (el) => {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform || "");
      return m ? { l: Number(m[1]), t: Number(m[2]) } : null;
    };

    // ① 턴 끝에 뜬다: 계획을 이번 턴 끝으로 두고 [턴 끝] → 기본 훈련 연출 (턴 번호 없음) → 말풍선 · 다음 턴은 아직
    const st1 = clone(base);
    st1.lesson.surprise = { planned: true, randTurn: st1.lesson.turn, pending: null, fired: null };
    const turn0 = st1.lesson.turn;
    putRun(st1);
    assert.ok(!$(".ls-sur") && !$(".lesson-screen.surprise-on"), "아직 깜짝 없음");
    $(".ls-btns .ls-end").click();
    await notBusy();
    const L1 = S.store.run.lesson;
    assert.equal(L1.surprise.pending?.eventId, "ls_ui_talk", "턴 끝 깜짝 (고정 이벤트 — 가중치 1000)");
    assert.equal(L1.turn, turn0, "다음 턴은 시작하지 않았다");
    assert.ok(!$$(".lesson-screen .ls-pop").some((e) => /^턴 \d/.test(e.textContent.trim())), "턴 배너 없음 (기본 훈련만)");
    let vs = lview();
    const s = vs.surprise;
    assert.ok(s && s.choices.length === 2, "뷰 surprise");
    const sur = $(".lesson-screen .m-field .ls-sur-layer .ls-sur");
    assert.ok(sur && $(".lesson-screen.surprise-on"), "경기장 위 말풍선");
    assert.equal(sur.dataset.id, "ls_ui_talk");
    assert.equal(sur.querySelector(".lsr-title").textContent, s.title, "제목");
    assert.equal(sur.querySelector(".lsr-text").textContent, s.text, "본문 (자리표시 채움)");
    assert.ok(s.text.startsWith(s.name) && !s.text.includes("{"), "본문에 주인공 이름");
    assert.equal(sur.querySelector(".lsr-name").textContent, s.name, "주인공 이름");
    const charOf = (pid) => S.store.run.players.find((p) => p.id === pid).charId;
    assert.ok(sur.querySelector(".lsr-face img.pt")?.getAttribute("src").includes(`${charOf(s.playerId)}.face.webp`), "주인공 얼굴 그림");
    const cbs = $$(".ls-sur .lsr-choice");
    assert.equal(cbs.length, 2, "선택지 2");
    assert.deepEqual(cbs.map((b) => b.querySelector(".lsr-label").textContent.replace(/^\d/, "")), s.choices.map((c) => c.label), "선택지 이름 (앞 숫자 = 키)");
    assert.deepEqual(cbs.map((b) => [...b.querySelectorAll(".pv-line")].map((e) => e.textContent)), s.choices.map((c) => previewLines(c.lines, c.preview)), "미리보기 줄 = 뷰 lines");
    assert.deepEqual(cbs.map((b) => b.classList.contains("recommended")), s.choices.map((c) => c.recommended), "추천 = 뷰");
    assert.equal($$(".ls-sur .lsr-rec").length, 1, "추천 배지 하나");
    assert.equal(S.manager.recommendSurprise(S.store.run, data).choice, s.choices.findIndex((c) => c.recommended), "뷰 추천 = 감독 AI");
    assert.ok(cbs.every((b) => !b.disabled), "선택지 켜짐");
    // 자리: 늘 필드 안. 토큰 위에 들어가면 위 (꼬리), 아니면 위쪽 · 아래쪽 가운데 (꼬리 없음)
    const bx = boxOf(sur);
    assert.ok(bx && bx.l >= 0 && bx.t >= 0 && bx.l + 508 <= fieldW && bx.t + 196 <= fieldH, `필드 안 (${sur.style.transform})`);
    const yPx = (vs.positions[s.playerId].y / 100) * fieldH;
    if (yPx - 36 - 196 >= 6) {
      assert.equal(sur.dataset.pos, "above", "주인공 토큰 위");
      assert.ok(sur.querySelector(".lsr-tail.on"), "꼬리");
    } else {
      assert.ok(["top", "bottom"].includes(sur.dataset.pos), `위로 넘치면 위쪽 · 아래쪽 가운데 (${sur.dataset.pos})`);
      assert.ok(!sur.querySelector(".lsr-tail.on"), "꼬리 없음");
    }
    assert.ok($(`.lesson-screen .tok.sur-who[data-id="${s.playerId}"]`), "주인공 토큰 금색 고리");
    assert.ok($(`.ls-side .ls-row.sur-who[data-pid="${s.playerId}"]`), "명단 줄 표시");
    // 다른 조작 잠금: 손패 없음 · [턴 끝] · [내기] · 벤치 · B 키 · 숫자 3
    assert.equal($$(".ls-hand .card-face").length, 0, "손패 없음 (턴 끝에 버렸다)");
    assert.ok($(".ls-btns .ls-end").disabled && $(".ls-btns .ls-play").disabled, "[턴 끝] · [내기] 꺼짐");
    assert.ok(!vs.canEndTurn && !vs.canBench, "뷰도 잠금");
    assert.ok($$(".ls-side .ls-bench-btn").every((b) => b.disabled), "명단 [벤치] 꺼짐");
    const seqA = seqNow();
    const fieldTok = $$(".lesson-screen .tok:not(.off)")[0];
    key("b", fieldTok);
    $$(".ls-side .ls-bench-btn")[0].click();
    $(".ls-btns .ls-end").click();
    key("3");
    assert.equal(seqNow(), seqA, "잠긴 조작은 엔진을 부르지 않는다");
    assert.ok(S.store.run.lesson.surprise.pending, "그대로 기다린다");
    // dock 안내 · 기본 훈련 예상 (지난 턴 baseNext) 숨김
    const info = $(".ls-info").textContent;
    assert.ok(info.includes("선택지를 고르세요") && info.includes(s.title), `안내 (${info})`);
    assert.ok(!info.includes("예상"), "기본 훈련 예상 숨김");
    $(`.ls-row[data-pid="${s.playerId}"] .ls-pi-btn`).click();
    const foot = $(".ls-pinfo.on .pi-foot")?.textContent || "";
    assert.ok(foot.includes("깜짝 이벤트 중") && !foot.includes("예상"), `선수 정보: 기본 훈련 예상 숨김 (${foot})`);
    key("Escape");
    assert.ok(!$(".ls-pinfo.on"), "Esc = 선수 정보 닫기");
    noErrorToast("깜짝 말풍선");
    // 새로 그려도 (이어하기) 말풍선은 그대로
    S.render();
    assert.ok($(".ls-sur[data-id=\"ls_ui_talk\"]"), "다시 그려도 말풍선");

    // ② 고르기 (점수 · 체력 선택지) → actions.resolveSurprise(1) → 결과 띠 · 다음 턴
    const score0 = S.store.run.lesson.score;
    const stam0 = S.store.run.players.find((p) => p.id === s.playerId).stamina;
    const calls = [];
    const origSur = S.actions.resolveSurprise;
    S.actions.resolveSurprise = function (i) { calls.push(i); return origSur.call(this, i); };
    $('.ls-sur .lsr-choice[data-choice="1"]').click();
    S.actions.resolveSurprise = origSur;
    assert.deepEqual(calls, [1], "resolveSurprise(1)");
    assert.ok(!$(".ls-sur"), "말풍선 닫힘");
    const banner = $(".lesson-screen .ls-sres");
    assert.ok(banner, "결과 한 줄 띠");
    const resText = S.store.run.lesson.surprise.fired.result;
    assert.ok(resText.startsWith(s.name) && resText.endsWith(" 한 바퀴 더 뜁니다.") && !resText.includes("{"), `엔진 결과 글 (${resText})`);
    assert.equal(banner.querySelector(".sres-text").textContent, resText, "띠 = 결과 글");
    assert.equal(banner.querySelector(".sres-fx").textContent, S.store.run.lesson.surprise.fired.lines.join(" · "), "띠 = 받은 효과");
    assert.equal(banner.style.getPropertyValue("--t-sres"), "2500ms", "띠 길이 2.5초 (CSS 애니메이션)");
    await notBusy();
    const L2 = S.store.run.lesson;
    assert.equal(L2.surprise.pending, null, "해결");
    assert.equal(L2.turn, turn0 + 1, "다음 턴 시작");
    assert.equal(L2.score, score0 + 12, "점수 +12");
    assert.equal(S.store.run.players.find((p) => p.id === s.playerId).stamina, Math.max(0, stam0 - 5), "주인공 체력 −5");
    vs = lview();
    assert.equal(vs.surprise, null);
    assert.ok(!$(".lesson-screen.surprise-on") && !$(".ls-sur"), "말풍선 없음");
    assert.equal($$(".ls-hand .card-face").length, vs.hand.length, "새 손패");
    assert.ok(vs.hand.length > 0 && !$(".ls-btns .ls-end").disabled, "[턴 끝] 다시 켜짐");
    assert.equal($(".lh-turn-n").textContent, `${turn0 + 1}/${vs.turns}`, "HUD 턴");
    assert.ok($(".lesson-screen .ls-sres"), "띠는 다음 턴에도 잠깐 남는다 (2.5초)");
    assert.match($(".ls-info").textContent, /카드를 끌어 경기장에 놓으세요/, "평소 안내");
    noErrorToast("깜짝 고르기");

    // ③ 주인공 없는 깜짝 + 퍼펙트로 끝나는 선택지 (숫자 키 1) → 레슨 끝 → 보상 모달
    const st3 = clone(base);
    LSN.forceSurprise(st3, data, { eventId: "ls_ui_finish" });
    assert.ok(st3.lesson.surprise.pending, "주입 (forceSurprise)");
    st3.lesson.score = st3.lesson.cap - 10;
    putRun(st3);
    const sur3 = $(".ls-sur");
    assert.ok(sur3 && !sur3.querySelector(".lsr-name") && sur3.querySelector(".lsr-face"), "주인공 없음 = 이름 없이 얼굴 칸 (코치 · 표)");
    assert.equal(sur3.dataset.pos, "top", "주인공 없음 = 필드 위쪽 가운데");
    const bx3 = boxOf(sur3);
    assert.equal(bx3.l, (fieldW - 508) / 2, "가운데");
    key("1");
    await until(() => S.store.run.phase === "reward" && $("#modal-root .reward-modal"), 4000);
    assert.equal(S.store.run.phase, "reward", "퍼펙트 → 보상");
    assert.equal(S.store.run.pendingReward.result.status, "perfect");
    assert.ok($("#modal-root .reward-modal"), "보상 모달");
    noErrorToast("깜짝 퍼펙트");
    S.actions.discardSave();
  }

  // ---------- 레전드 · 메모리 카드 (§24.9 · §24.13, U5) ----------
  // 결과 화면 메모리 카드 줄 → [팀 등록] = 등록 팀 memoryCard · 등록 팀 없음 = [레전드] 잠금 · 옛 팀 "메모리 카드 없음" ·
  // 레전드 고르기 (같은 팀 둘 = 카드 1장 · 같은 팀 id 에 다른 카드 = 앞 레전드 카드) → startRun · createRun → 시작 덱에 메모리 카드 1장
  {
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const { walkLesson } = await import(pathToFileURL(path.join(ROOT, "tools/lesson_scenarios.mjs")).href);
    const { memoryDeckOf } = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/setup.js")).href);
    const memKey = (mc) => `${mc.cardId}|${mc.plus ? 1 : 0}`;
    const teamsNow = () => JSON.parse(window.localStorage.getItem(KEYS.teams) || "[]");
    const excluded = new Set(["unique", "prep", "coach"]);
    const famOf = (cardId) => data.cards.cards.find((c) => c.id === cardId).family;

    // ① 등록 팀이 없으면 [★ 레전드] 잠금 (title 안내)
    window.localStorage.removeItem(KEYS.teams);
    S.actions.newRun("");
    assert.equal(S.store.screen, "setup");
    assert.deepEqual(S.store.setup.legends, [], "initSetup: 레전드 없음");
    let lb = $(".setup-supports .og-panel-head .legend-btn");
    assert.ok(lb, "코치 패널 머리 [★ 레전드]");
    assert.ok(lb.disabled && lb.textContent.includes("레전드 0/2"), "등록 팀 없음 = 잠금");
    assert.match(lb.closest(".legend-ctl").title, /등록 팀이 없습니다/, "잠금 안내 (title)");
    lb.click();
    assert.ok(!$("#modal-root .legend-modal"), "잠긴 버튼은 모달을 열지 않는다");

    // ② 결과 화면: 메모리 카드 줄 (감독 추천) → 다른 후보로 바꿔 [팀 등록] → 등록 팀 memoryCard
    const dOff = { ...data, lesson: clone(data.lesson) };
    LE.setEventSwitches(dOff.lesson, false);
    const fin = walkLesson(dOff, { seed: "u5-mem", until: (st) => st.phase === "finished" }).state;
    S.store.run = clone(fin);
    S.store.match = null;
    S.store.final = null;
    S.store.registered = false;
    S.store.screen = "run";
    S.render();
    const memOpts = S.run.memoryCardOptions(S.store.run, data);
    const rec = S.manager.recommendMemoryCard(S.store.run, data);
    assert.ok(memOpts.length >= 2 && rec, `메모리 카드 후보 ${memOpts.length}장 · 추천`);
    assert.ok(memOpts.every((o) => !excluded.has(o.family)), "후보에 고유 · 대비 · 코치 카드 없음");
    const memRow = $(".result-screen .result-actions .res-memory");
    assert.ok(memRow, "메모리 카드 줄");
    assert.equal(memRow.nextElementSibling?.textContent, "팀 등록", "[팀 등록] 바로 왼쪽");
    assert.deepEqual(S.store.final.memory, rec, "처음엔 감독 추천이 골라져 있다");
    const chipEl = memRow.querySelector(".rm-pick .mem-chip");
    assert.equal(`${chipEl.dataset.card}|${chipEl.dataset.plus}`, memKey(rec), "칩 = 추천 카드");
    assert.ok(memRow.querySelector(".rm-pick.recommended .rm-rec"), "추천 배지");
    memRow.querySelector(".rm-pick").click();
    const mm = $("#modal-root .memory-modal");
    assert.ok(mm, "메모리 카드 고르기 모달");
    assert.deepEqual([...mm.querySelectorAll(".rm-grid .mini-card")].map((e) => e.dataset.mem), memOpts.map(memKey), "작은 카드 = memoryCardOptions (덱 순서)");
    assert.equal(mm.querySelector(".rm-grid .mini-card.selected")?.dataset.mem, memKey(rec), "추천이 골라져 있다");
    assert.equal(mm.querySelectorAll(".rm-grid .mini-card .mc-rec").length, 1, "추천 배지 하나");
    const other = memOpts.find((o) => memKey(o) !== memKey(rec));
    mm.querySelector(`.rm-grid .mini-card[data-mem="${memKey(other)}"]`).click();
    assert.equal($("#modal-root .rm-grid .mini-card.selected")?.dataset.mem, memKey(other), "다른 카드 고름");
    assert.ok($("#modal-root .rm-detail .card-face")?.textContent.includes(other.name), "고른 카드 앞면");
    $("#modal-root .rm-ok").click();
    assert.deepEqual(S.store.final.memory, { cardId: other.cardId, plus: other.plus }, "[이 카드로] = store.final.memory");
    assert.ok(!$("#modal-root .memory-modal"), "모달 닫힘");
    assert.equal($(".res-memory .rm-pick .mem-chip").dataset.card, other.cardId, "줄 칩 = 고른 카드");
    assert.ok(!$(".res-memory .rm-pick.recommended"), "추천이 아니면 배지 없음");
    const regCalls = [];
    const origReg = S.actions.registerTeam;
    S.actions.registerTeam = function (o) { regCalls.push(o); return origReg.call(this, o); };
    [...$$(".result-actions button")].find((b) => b.textContent === "팀 등록").click();
    S.actions.registerTeam = origReg;
    assert.deepEqual(regCalls, [{ memory: { cardId: other.cardId, plus: other.plus } }], "registerTeam({ memory })");
    const regTeam = teamsNow()[0];
    assert.ok(regTeam && regTeam.seed === "u5-mem", "등록 팀 저장");
    assert.deepEqual(regTeam.memoryCard, { cardId: other.cardId, plus: other.plus }, "등록 팀 memoryCard = 고른 카드");
    assert.ok($(".res-memory.done") && $(".res-memory .rm-title").textContent === "남긴 메모리 카드", "등록 뒤 = 남긴 메모리 카드");
    assert.equal($(".res-memory.done .mem-chip").dataset.card, other.cardId, "남긴 카드 칩");
    assert.ok(!$(".res-memory .rm-pick"), "등록 뒤에는 바꿀 수 없다");
    assert.ok([...$$(".result-actions button")].some((b) => b.disabled && b.textContent === "팀 등록 완료"), "[팀 등록 완료]");
    noErrorToast("메모리 카드 등록");

    // ③ 등록 팀 목록: 위 팀 (메모리 카드) · 옛 팀 (memoryCard 키 없음) · 같은 팀 id 에 다른 메모리 카드 (같은 seed · 턴 · 등록 시각 — 엔진은 앞 레전드 카드만)
    const oldTeam = { ...clone(regTeam), seed: "u5-old", registeredAt: "2026-09-01T10:00:00.000Z" };
    delete oldTeam.memoryCard;
    const twin = { ...clone(regTeam), memoryCard: { cardId: rec.cardId, plus: rec.plus } };
    window.localStorage.setItem(KEYS.teams, JSON.stringify([oldTeam, regTeam, twin])); // 저장 순서와 상관없이 최신순 (등록 시각)
    const tidOf = (t) => S.challenge.teamIdOf(t);
    assert.equal(tidOf(twin), tidOf(regTeam), "같은 팀 id (쌍둥이 저장본)");
    S.actions.discardSave();
    S.actions.newRun("");
    lb = $(".setup-supports .legend-btn");
    assert.ok(!lb.disabled, "등록 팀이 있으면 [★ 레전드] 켜짐");
    lb.click();
    const lm = () => $("#modal-root .legend-modal");
    assert.ok(lm(), "레전드 모달");
    const rows = $$("#modal-root .lg-team");
    assert.equal(rows.length, 3, "등록 팀 3");
    assert.deepEqual(rows.map((r) => r.dataset.team), [tidOf(regTeam), tidOf(twin), tidOf(oldTeam)], "최신순 (등록 시각 내림차순 · 같으면 저장 순서)");
    assert.equal(rows[0].querySelectorAll(".lg-pl").length, 7, "7명 얼굴");
    assert.ok(rows[0].querySelectorAll(".lg-pl .avatar img.pt").length >= 1, "얼굴 그림");
    assert.equal(rows[0].querySelector(".mem-chip").dataset.card, other.cardId, "등록 팀 메모리 카드 칩");
    assert.equal(rows[2].querySelector(".mem-chip.none")?.textContent, "메모리 카드 없음", "옛 등록 팀 = 메모리 카드 없음");
    assert.deepEqual($$("#modal-root .lg-slot.empty").map((e) => e.dataset.slot), ["0", "1"], "빈 칸 2");
    // 같은 팀에서 둘 (이번 런 선수와 같은 캐릭터도 된다) → 카드 1장
    const tap = (row, charId) => $$("#modal-root .lg-team")[row].querySelector(`.lg-pl[data-char="${charId}"]`).click();
    tap(0, "ch_elf_playmaker");
    tap(0, "ch_spirit_keeper");
    assert.deepEqual(S.store.setup.legends.map((l) => [l.teamId, l.charId]), [[tidOf(regTeam), "ch_elf_playmaker"], [tidOf(regTeam), "ch_spirit_keeper"]], "칸 2 = 고른 순서");
    let slots = $$("#modal-root .lg-slot.filled");
    assert.equal(slots.length, 2, "칸 2 채움");
    assert.ok(slots[0].textContent.includes("실루엔") && slots[0].querySelector(".mem-chip").dataset.card === other.cardId && slots[0].textContent.includes("시작 덱 +1"), "칸 1: 얼굴 · 이름 · 메모리 카드 (덱 +1)");
    assert.ok(slots[0].querySelector(".lg-slot-face img.pt") && slots[0].querySelector(".lg-remove"), "칸: 얼굴 그림 · ✕");
    assert.ok(slots[1].classList.contains("mem-dropped") && slots[1].textContent.includes("같은 팀 — 카드는 1장"), "칸 2: 같은 팀 → 카드 1장");
    assert.ok($("#modal-root .lg-same")?.textContent.includes("메모리 카드는 1장"), "같은 팀 안내");
    assert.deepEqual($$("#modal-root .lg-deck .mem-chip").map((e) => e.dataset.card), [other.cardId], "시작 덱 메모리 카드 = 1장");
    assert.ok($$("#modal-root .lg-pl:not(.picked)").every((b) => b.disabled), "2명이 차면 다른 얼굴 잠김");
    // ✕ → 1명, 다시 누르면 빼기 (토글)
    slots[1].querySelector(".lg-remove").click();
    assert.equal(S.store.setup.legends.length, 1, "✕ = 빼기");
    tap(0, "ch_elf_playmaker");
    assert.equal(S.store.setup.legends.length, 0, "고른 얼굴을 다시 누르면 빼기");
    // 등록한 팀의 선수 둘 (실루엔 · 네리아 — 이번 런 선수와 같은 캐릭터) → [완료] → [런 시작] → 그 팀이 남긴 메모리 카드가 시작 덱에 1장
    tap(0, "ch_elf_playmaker");
    tap(0, "ch_spirit_keeper");
    $("#modal-root .lg-done").click();
    assert.ok(!lm(), "[완료] = 닫기");
    lb = $(".setup-supports .legend-btn.has");
    assert.ok(lb && lb.textContent.includes("레전드 2/2") && lb.querySelectorAll(".lg-face").length === 2 && lb.textContent.includes("메모리 1"), `머리 버튼 = 2/2 · 얼굴 2 · 메모리 1 (${lb?.textContent})`);
    assert.match(lb.closest(".legend-ctl").title, /시작 덱 메모리 카드/, "버튼 title = 레전드 · 메모리 카드");
    S.render();
    assert.equal(S.store.setup.legends.length, 2, "다시 그려도 (편성과 함께) 레전드 유지");
    const startCalls = [];
    const origStart = S.actions.startRun;
    const startWithSpy = () => {
      S.actions.startRun = function (o) { startCalls.push(clone(o)); return origStart.call(this, o); };
      [...$$(".setup-start button")].find((b) => b.textContent === "런 시작").click();
      S.actions.startRun = origStart;
      return startCalls[startCalls.length - 1];
    };
    const regLegends = [
      { teamId: tidOf(regTeam), teamName: regTeam.name, charId: "ch_elf_playmaker", name: "실루엔", memoryCard: { cardId: other.cardId, plus: other.plus } },
      { teamId: tidOf(regTeam), teamName: regTeam.name, charId: "ch_spirit_keeper", name: "네리아", memoryCard: { cardId: other.cardId, plus: other.plus } },
    ];
    assert.deepEqual(startWithSpy().legends, regLegends, "startRun 레전드 사본 (teamId · teamName · charId · name · memoryCard)");
    let run2 = S.store.run;
    assert.ok(run2 && S.store.screen === "run", "런 시작");
    assert.deepEqual(run2.legends, regLegends, "createRun 이 받은 레전드 (state.legends)");
    let mem = run2.deck.filter((e) => e.src === "memory");
    assert.deepEqual(mem.map((e) => [e.cardId, e.plus]), [[other.cardId, other.plus]], "등록 때 남긴 메모리 카드가 시작 덱에 1장 (같은 팀 둘 = 1장)");
    const lastUnique = run2.deck.map((e) => famOf(e.cardId)).lastIndexOf("unique");
    assert.equal(run2.deck.indexOf(mem[0]), lastUnique + 1, "고유 카드 바로 뒤");
    assert.ok(["ch_elf_playmaker", "ch_spirit_keeper"].every((c) => run2.players.some((p) => p.charId === c)), "이번 런 선수와 같은 캐릭터도 레전드로");
    // 같은 팀 id 에 다른 메모리 카드 (쌍둥이 저장본): 앞 레전드 카드만 들어간다 — 화면이 엔진과 같은 규칙으로 보여 준다
    S.actions.discardSave();
    S.actions.newRun("");
    assert.deepEqual(S.store.setup.legends, [], "새 편성 = 레전드 없음");
    $(".setup-supports .legend-btn").click();
    tap(1, "ch_human_runner");
    tap(0, "ch_spirit_keeper");
    slots = $$("#modal-root .lg-slot.filled");
    assert.equal(slots[0].querySelector(".mem-chip").dataset.card, rec.cardId, "칸 1 = 쌍둥이 팀 카드 (추천 카드)");
    assert.ok(slots[1].classList.contains("mem-dropped") && slots[1].querySelector(".mem-chip").dataset.card === other.cardId, "칸 2 = 같은 팀 id → 그 카드는 들어가지 않는다 (줄 그음)");
    assert.deepEqual($$("#modal-root .lg-deck .mem-chip").map((e) => e.dataset.card), [rec.cardId], "시작 덱 = 앞 레전드 카드만");
    assert.ok($("#modal-root .lg-same"), "같은 팀 안내");
    assert.deepEqual(memoryDeckOf(S.store.setup.legends).map((d) => d.cardId), [rec.cardId], "memoryDeckOf = 엔진 규칙");
    $("#modal-root .lg-done").click();
    const wantLegends = [
      { teamId: tidOf(twin), teamName: twin.name, charId: "ch_human_runner", name: "타리아", memoryCard: { cardId: rec.cardId, plus: rec.plus } },
      { teamId: tidOf(regTeam), teamName: regTeam.name, charId: "ch_spirit_keeper", name: "네리아", memoryCard: { cardId: other.cardId, plus: other.plus } },
    ];
    assert.deepEqual(startWithSpy().legends, wantLegends, "startRun 레전드 (쌍둥이)");
    assert.equal(startCalls.length, 2, "startRun 2번");
    run2 = S.store.run;
    assert.deepEqual(run2.legends, wantLegends, "state.legends");
    mem = run2.deck.filter((e) => e.src === "memory");
    assert.deepEqual(mem.map((e) => [e.cardId, e.plus]), [[rec.cardId, rec.plus]], "시작 덱 = 화면이 보여 준 카드 (앞 레전드)");
    noErrorToast("레전드");
    // 덱 화면 "메모리" 띠: 이벤트 카드 고르기 · 3택1 배경 등 덱 작은 카드 (cards.js miniCard) · 카드 앞면 (cardFace)
    const { miniCard, cardFace } = await import(pathToFileURL(path.join(ROOT, "js/ui/cards.js")).href);
    const memView = S.run.getWeekView(run2, data).deck.find((d) => d.memory);
    assert.ok(memView, "주 뷰 덱 = memory 표시");
    const mc = miniCard(memView, { data });
    assert.ok(mc.classList.contains("memory") && mc.querySelector(".mc-mem")?.textContent === "메모리", "작은 카드 \"메모리\" 띠");
    assert.ok(!miniCard({ ...memView, memory: false }, { data }).querySelector(".mc-mem"), "메모리 카드가 아니면 띠 없음");
    const cf = cardFace({ cardId: memView.cardId, name: memView.name, family: memView.family, plus: memView.plus, memory: true }, { data });
    assert.equal(cf.querySelector(".cf-meta .cf-mem")?.textContent, "메모리", "카드 앞면 계열 줄 \"메모리\" 띠");
    S.actions.discardSave();
    window.localStorage.removeItem(KEYS.teams);
  }

  assert.deepEqual(errors, [], "페이지 오류 없음");
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
