// test/lessonUi.test.mjs — 카드 레슨 화면 jsdom 검사 (LESSON_PROTO_PLAN §9.3 lessonUi, U3 = 레슨 화면 부분)
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 감독 AI 로 걸은 레슨 런(tools/lesson_scenarios.mjs)을 store.run 에 넣어 레슨 화면을 그린다.
//  - 골격: HUD(턴 점 · 점수 · 버프 칩) · 경기장 토큰 7 · 이번 레슨 명단 7 · 손패 = 뷰 손패 · [내기][쉬기][턴 끝]
//  - 카드 선택 → 토큰 탭(초록 · 빨강 · 금) → [내기] → seq +1 · 저장 · 화면은 그대로(같은 DOM) · 연출이 끝나면 선택 풀림
//  - 다시 그려도(render) 선택이 남는다, Esc = 취소, 쉬기 · 턴 끝, 레슨 끝 → reward phase (레슨 화면 inert + 보상 모달)
// 연출은 prefers-reduced-motion 으로 줄여(타이머 0ms) 빨리 끝낸다. 레이아웃(넘침 · 잘림)은 tools/shot.mjs og_lesson* 스크린샷으로 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { KEYS } = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);

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

test("jsdom: 레슨 화면 — 골격 · 카드 선택 · 탭 · 내기 · 다시 그리기 · 쉬기 · 턴 끝 · 레슨 끝 → 보상", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/lesson/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const saved = {};
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "KeyboardEvent", "getComputedStyle", "matchMedia", "requestAnimationFrame"];
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
  g.KeyboardEvent = window.KeyboardEvent;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  g.matchMedia = (q) => ({ matches: /reduce/.test(q), addEventListener() {}, removeEventListener() {} }); // 연출 타이머 0ms
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
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  const S = await until(() => window.__soccer?.store?.data && window.__soccer.run && window.__soccer.manager && window.__soccer);
  assert.ok(S, "부트 완료");
  const data = S.store.data;
  const ui = S.store.lessonUi;
  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const noErrorToast = (where) => assert.equal($$("#toast-root .toast-error").length, 0, `${where}: 에러 토스트 없음 (${$$("#toast-root .toast-error").map((e) => e.textContent).join(" / ")})`);
  const { walkLesson, lessonRun } = await import(pathToFileURL(path.join(ROOT, "tools/lesson_scenarios.mjs")).href);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const view = () => lessonRun.getLessonView(S.store.run, data);
  const putRun = (st) => {
    S.store.run = clone(st);
    S.store.match = null;
    S.store.screen = "run";
    S.render();
    return S.store.run;
  };
  /** 손패 at 번째 카드를 cardId 로 바꾼 상태 (덱 항목 주입) */
  const withHand = (st, cardId, at = 0) => {
    const s = clone(st);
    const uid = s.lesson.hand[at];
    const e = s.deck.find((d) => d.uid === uid);
    e.cardId = cardId;
    e.plus = false;
    return { s, uid };
  };
  const notBusy = () => until(() => !ui.busy, 4000);
  const lesson1 = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "lesson" && s.lesson.status === "playing" }).state;

  // ---------- 골격 ----------
  putRun(lesson1);
  const scr = $(".lesson-screen");
  assert.ok(scr && !scr.classList.contains("lesson-temp"), "레슨 화면 (임시 화면 아님)");
  assert.equal(doc.getElementById("stage").dataset.mode, "lesson", "스테이지 모드 lesson (토스트는 손패 위)");
  let v = view();
  assert.ok($(".lesson-screen .lh .lh-title h2").textContent.includes(data.lesson ? "레슨" : ""), "HUD 제목");
  assert.equal($$(".lh-pips i").length, v.turns, "턴 점 = 레슨 턴 수");
  assert.equal($(".lh-score-n").textContent, String(v.score), "점수");
  assert.ok($(".lh-score-t").textContent.includes(String(v.target)) && $(".lh-score-t").textContent.includes(String(v.cap)), "목표 · 퍼펙트");
  assert.equal($$(".lh-chip").length, v.chips.length, "버프 칩 = 뷰 chips");
  assert.ok($(".lesson-screen .pitch .m-field .pitch-bg"), "경기장 = 경기 화면 마크업 (.pitch > .m-field > .pitch-bg)");
  assert.equal($$(".lesson-screen .pitch .zone").length, 5, "5구역");
  assert.equal($$(".lesson-screen .tok-layer .tok.home").length, 7, "토큰 7");
  assert.ok($$(".lesson-screen .tok").every((e) => /translate\(/.test(e.style.transform)), "토큰은 translate 로 놓인다");
  const gkTok = $$(".lesson-screen .tok").find((e) => v.players.find((p) => p.id === e.dataset.id)?.position === "GK");
  const xOf = (e) => Number(e.dataset.x);
  assert.ok($$(".lesson-screen .tok").every((e) => e === gkTok || xOf(e) > xOf(gkTok)), "GK 토큰이 가장 왼쪽 (우리 골)");
  assert.ok($(".drill-layer .drill-zone") && $(".drill-label").textContent.includes("훈련장"), "훈련장 표시");
  assert.equal($$(".ls-side .ls-row").length, 7, "이번 레슨 명단 7");
  assert.equal($$(".ls-hand .card-face").length, v.hand.length, "손패 = 뷰 손패");
  assert.ok($$(".ls-hand .card-face").every((c) => c.querySelector(".cf-name") && c.querySelector(".cf-target") && c.querySelector(".cf-desc")), "카드 앞면: 이름 · 대상 · 문구");
  assert.equal($$(".ls-hand .card-face.recommended").length, S.manager.recommendCard(S.store.run, data).kind === "play" ? 1 : 0, "추천 카드 배지 (manager.recommendCard)");
  assert.ok($(".ls-btns .ls-play").disabled, "[내기] 꺼짐 (카드 안 고름)");
  assert.equal($(".ls-btns .ls-rest").disabled, !v.canRest, "[쉬기] = canRest");
  assert.ok($(".ls-btns .ls-end").disabled, "[턴 끝] 꺼짐 (아직 안 냄)");
  assert.match($(".ls-info").textContent, /카드를 고르세요/);
  assert.match($(".ls-piles").textContent, new RegExp(`덱 ${v.piles.draw}`), "덱 더미 수");
  noErrorToast("골격");

  // ---------- 지명 카드: 선택 → 초록/빨강 → 다시 그려도 선택 유지 → 탭 → 말풍선 → 내기 ----------
  const pick = withHand(lesson1, "cd_coaching", 0);
  // 한 명을 결장으로 (빨강 확인용): 레슨 out + injuredTurns
  const outId = pick.s.players.find((p) => p.position === "DF").id;
  pick.s.lesson.out.push(outId);
  pick.s.lesson.outAtStart.push(outId);
  pick.s.players.find((p) => p.id === outId).injuredTurns = 1;
  putRun(pick.s);
  const card0 = () => $(`.ls-hand .card-face[data-uid="${pick.uid}"]`);
  card0().click();
  assert.equal(ui.selectedUid, pick.uid, "카드 선택 → lessonUi.selectedUid");
  assert.ok(card0().classList.contains("selected"), "고른 카드 강조");
  assert.equal($$(".tok.pickable").length, 6, "지명: 출전 선수 6 초록");
  assert.ok($(`.tok[data-id="${outId}"]`).classList.contains("blocked"), "결장 선수 빨강");
  assert.equal($(`.tok[data-id="${outId}"] .tok-bubble`).textContent, "결장 중", "빨강 이유 말풍선");
  assert.ok($(`.tok[data-id="${outId}"]`).classList.contains("out") && $(`.tok[data-id="${outId}"] .tok-out`).textContent === "결장", "결장 토큰 표시");
  assert.match($(".ls-info").textContent, /대상 선수를 누르세요 \(0\/1\)/);
  assert.ok($(".ls-btns .ls-play").disabled, "탭 전 [내기] 꺼짐");
  const domBefore = $(".lesson-screen");
  S.render(); // 다시 그리기 (app.render → lessonUi.gen +1) — 선택은 남는다
  assert.notEqual($(".lesson-screen"), domBefore, "render() = 새 화면");
  assert.equal(ui.selectedUid, pick.uid, "다시 그려도 선택 유지");
  assert.ok(card0().classList.contains("selected") && $$(".tok.pickable").length === 6, "다시 그려도 강조 유지");
  // 빨강 토큰을 누르면 거절 (탭 없음)
  $(`.tok[data-id="${outId}"]`).click();
  assert.deepEqual(ui.taps, [], "빨강 탭 = 거절");
  const target = view().players.find((p) => !p.out && p.position === "MF").id;
  $(`.tok[data-id="${target}"]`).click();
  assert.deepEqual(ui.taps, [target], "토큰 탭 → taps");
  assert.ok($(`.tok[data-id="${target}"]`).classList.contains("picked"), "고른 토큰 금색");
  const pv = lessonRun.previewCard(S.store.run, data, { uid: pick.uid, taps: [target] });
  assert.ok(pv.ok);
  assert.ok($(`.tok[data-id="${target}"] .tok-bubble`).textContent.startsWith(`+${pv.targets[0].gain}`), "말풍선 = 예상 상승");
  assert.ok(!$(".ls-btns .ls-play").disabled, "[내기] 켜짐");
  assert.equal($(".lh-delta").textContent, `+${pv.targets[0].gain}`, "점수 미리보기");
  // 같은 토큰을 다시 누르면 해제, 다시 고르기
  $(`.tok[data-id="${target}"]`).click();
  assert.deepEqual(ui.taps, [], "다시 누르면 해제");
  $$(`.ls-row`).find((r) => r.dataset.pid === target).click(); // 명단 줄로도 고를 수 있다
  assert.deepEqual(ui.taps, [target], "명단 줄 탭");
  const seq0 = S.store.run.lesson.seq;
  const scr2 = $(".lesson-screen");
  const tokEl = $(`.tok[data-id="${target}"]`);
  $(".ls-btns .ls-play").click();
  assert.equal(S.store.run.lesson.seq, seq0 + 1, "내기 → seq +1");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).lesson.seq, seq0 + 1, "레슨 호출마다 저장 (soccer-lesson.run)");
  assert.ok(ui.busy, "연출 중 busy");
  const handNow = $$(".ls-hand .card-face").length;
  $$(".ls-hand .card-face")[0]?.click(); // 연출 중 입력은 무시
  assert.equal(ui.selectedUid, null, "연출 중 카드 선택 무시");
  await notBusy();
  assert.equal($(".lesson-screen"), scr2, "카드를 내도 화면 DOM 은 그대로 (부분 갱신)");
  assert.equal($(`.tok[data-id="${target}"]`), tokEl, "토큰 DOM 도 그대로");
  assert.ok(!tokEl.classList.contains("drilling"), "훈련 지점에서 제자리로");
  assert.equal(ui.selectedUid, null, "낸 뒤 선택 풀림");
  assert.deepEqual(ui.taps, []);
  assert.equal(ui.shownSeq, S.store.run.lesson.seq, "보여 준 seq");
  v = view();
  assert.equal($(".lh-score-n").textContent, String(v.score), "점수 갱신");
  assert.equal($$(".ls-hand .card-face").length, v.hand.length, "손패 갱신");
  assert.ok(handNow >= 1);
  noErrorToast("내기");

  // ---------- 범위 카드: 탭 없이 두 번 누르기 = 내기, Esc = 취소 ----------
  const rng = withHand(lesson1, "cd_basic", 0);
  putRun(rng.s);
  $(`.ls-hand .card-face[data-uid="${rng.uid}"]`).click();
  assert.equal($$(".tok.target").length, 7, "전원: 대상 7 강조");
  assert.ok($$(".tok.target .tok-bubble").every((b) => /^\+\d+/.test(b.textContent)), "대상 말풍선 +N");
  doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(ui.selectedUid, null, "Esc = 취소");
  assert.equal($$(".tok.target").length, 0);
  $(`.ls-hand .card-face[data-uid="${rng.uid}"]`).click();
  $(`.ls-hand .card-face[data-uid="${rng.uid}"]`).click();
  assert.equal(S.store.run.lesson.seq, 1, "탭 없는 카드: 한 번 더 누르면 낸다");
  await notBusy();

  // ---------- 쉬기: 탭 모드 → 선수 1명 → lessonRest (턴 끝) ----------
  putRun(lesson1);
  const turn0 = S.store.run.lesson.turn;
  $(".ls-btns .ls-rest").click();
  assert.ok(ui.restPick && $$(".tok.pickable").length === 7, "쉬기: 7명 초록");
  assert.match($(".ls-info").textContent, /쉬기/);
  const restId = view().players[2].id;
  const stBefore = S.store.run.players.find((p) => p.id === restId).stamina;
  $(`.tok[data-id="${restId}"]`).click();
  assert.equal(S.store.run.lesson.stats.rests, 1, "lessonRest 호출");
  assert.equal(S.store.run.players.find((p) => p.id === restId).stamina, Math.min(100, stBefore + data.lesson.lesson.rest.picked), "고른 선수 +20");
  await notBusy();
  assert.equal(S.store.run.lesson.turn, turn0 + 1, "쉬기 = 턴 끝");
  assert.equal($$(".lh-pips i.cur").length, 1);
  assert.equal($(".lh-turn-n").textContent, `${turn0 + 1}/${S.store.run.lesson.turns}`, "턴 표시 갱신");
  assert.ok(!ui.restPick);

  // ---------- 턴 끝: 추가 사용 카드(쿨다운) 뒤 [턴 끝] ----------
  const cool = withHand(lesson1, "cd_cooldown", 0);
  putRun(cool.s);
  $(`.ls-hand .card-face[data-uid="${cool.uid}"]`).click();
  assert.equal($$(".tok.pickable").length, 7, "회복 카드: 7명 고를 수 있음");
  $(`.tok[data-id="${view().players[0].id}"]`).click();
  $(".ls-btns .ls-play").click();
  await notBusy();
  assert.equal(S.store.run.lesson.turn, 1, "추가 사용 +1 → 같은 턴");
  assert.ok(!$(".ls-btns .ls-end").disabled, "[턴 끝] 켜짐");
  assert.ok($(".ls-btns .ls-rest").disabled, "1장 낸 뒤 [쉬기] 꺼짐");
  $(".ls-btns .ls-end").click();
  await notBusy();
  assert.equal(S.store.run.lesson.turn, 2, "[턴 끝] → 다음 턴");
  noErrorToast("쉬기 · 턴 끝");

  // ---------- 레슨 끝 → reward phase: 레슨 화면 inert + 보상 모달 ----------
  const fin = withHand(lesson1, "cd_basic", 0);
  fin.s.lesson.score = fin.s.lesson.cap - 1; // 다음 상승으로 퍼펙트
  putRun(fin.s);
  $(`.ls-hand .card-face[data-uid="${fin.uid}"]`).click();
  $(".ls-btns .ls-play").click();
  assert.equal(S.store.run.phase, "reward", "퍼펙트 → reward phase (엔진)");
  assert.ok($(".lesson-screen:not(.inert)"), "연출이 끝날 때까지 레슨 화면");
  await until(() => $(".lesson-screen.inert") && $("#modal-root .reward-modal"), 4000);
  assert.ok($(".lesson-screen.inert"), "보상 배경 = 레슨 화면 inert");
  assert.ok($("#modal-root .reward-modal"), "보상 모달");
  assert.ok($$(".lesson-screen.inert .ls-hand .card-face").every((c) => c.disabled), "inert: 카드 비활성");
  assert.ok($$(".lesson-screen.inert .ls-btns button").every((b) => b.disabled), "inert: 버튼 비활성");
  noErrorToast("레슨 끝");

  // ---------- 새로고침(이어하기) 뒤 지난 연출은 다시 재생하지 않는다 ----------
  putRun(lesson1);
  const mid = clone(S.store.run);
  window.localStorage.setItem(KEYS.run, JSON.stringify(mid));
  S.actions.continueRun();
  assert.equal(ui.shownSeq, S.store.run.lesson.seq);
  assert.ok(!ui.busy, "이어하기: 연출 없음");
  assert.equal($$("#modal-root .overlay").length, 0);
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
