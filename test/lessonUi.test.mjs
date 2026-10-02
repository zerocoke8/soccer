// test/lessonUi.test.mjs — 카드 레슨 화면 jsdom 검사 (LESSON_PROTO_PLAN §9.3 lessonUi, U3 = 레슨 화면 · U4 = 보상 모달 · 상담 화면)
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 감독 AI 로 걸은 레슨 런(tools/lesson_scenarios.mjs)을 store.run 에 넣어 레슨 화면을 그린다.
//  - 골격: HUD(턴 점 · 점수 · 버프 칩) · 경기장 토큰 7 · 이번 레슨 명단 7 · 손패 = 뷰 손패 · [내기][쉬기][턴 끝]
//  - 카드 선택 → 토큰 탭(초록 · 빨강 · 금) → [내기] → seq +1 · 저장 · 화면은 그대로(같은 DOM) · 연출이 끝나면 선택 풀림
//  - 다시 그려도(render) 선택이 남는다, Esc = 취소, 쉬기 · 턴 끝, 레슨 끝 → reward phase (레슨 화면 inert + 보상 모달)
//  - U4 보상: 클리어 카드 고르기 · 건너뛰기(TP) · 퍼펙트 무료 강화 그리드 · 실패 [계속]
//  - U4 상담: 구매 · 강화(고른 카드는 다시 그려도 남음) · 고유 카드 삭제 확인 모달 · 스킬(배울 선수) · 오류 토스트 · 끝내기
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

test("jsdom: 레슨 화면 — 골격 · 카드 선택 · 탭 · 내기 · 다시 그리기 · 쉬기 · 턴 끝 · 레슨 끝 → 보상 모달 · 상담", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
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
  assert.deepEqual(consoleErrors, [], "console.error 없음 (레슨)");

  // =====================================================================
  // U4 보상 모달 (phase reward): 고르기 · 건너뛰기 · 무료 강화 · 실패 [계속]
  // =====================================================================
  const { perfectRewardState } = await import(pathToFileURL(path.join(ROOT, "tools/lesson_scenarios.mjs")).href);
  const savedRun = () => JSON.parse(window.localStorage.getItem(KEYS.run));
  const clearReward = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }).state;

  // ---------- 클리어: 골격 · 카드 고르기 → [확인] ----------
  putRun(clearReward);
  let rv = lessonRun.getRewardView(S.store.run, data);
  assert.ok($(".lesson-screen.inert") && $("#modal-root .reward-modal"), "보상 = 레슨 화면 inert + 모달");
  assert.match($(".rw-status").textContent, /클리어/, "결과 머리");
  assert.ok($(".rw-score-n").textContent === String(rv.result.score) && $(".rw-score-t").textContent.includes(String(rv.result.target)), "점수 · 목표");
  assert.equal($$(".rw-players .rw-pl").length, 7, "선수 7 상승");
  assert.ok($(".rw-chip.tp").textContent.includes(`+${rv.result.tp}`), "TP 칩");
  assert.equal($$(".rw-offer .card-face").length, rv.offer.length, "보상 카드 = offer");
  assert.ok($(".rw-skip").textContent.includes(`TP +${rv.skipTp}`), "건너뛰기 TP");
  assert.equal($$(".rw-deck").length, 0, "클리어 = 무료 강화 없음");
  const rrec = S.manager.recommendReward(S.store.run, data);
  if (rrec.pick !== null) assert.ok($$(".rw-offer .card-face")[rrec.pick].classList.contains("recommended"), "추천 카드 배지");
  assert.equal($$(".rw-offer .card-face.selected").length, 0, "미리 고르지 않는다");
  assert.ok($(".rw-ok").disabled, "고르기 전 [확인] 꺼짐");
  $(".rw-ok").click();
  assert.equal(S.store.run.phase, "reward", "꺼진 [확인] = 아무것도 안 함");
  const addIdx = rv.offer.findIndex((o) => o.kind === "add");
  assert.ok(addIdx >= 0);
  $$(".rw-offer .card-face")[addIdx].click();
  assert.ok($$(".rw-offer .card-face")[addIdx].classList.contains("selected"), "고른 카드 강조");
  assert.ok(!$(".rw-ok").disabled, "[확인] 켜짐");
  assert.match($(".rw-explain").textContent, /덱에 추가/);
  $$(".rw-offer .card-face")[addIdx].click(); // 다시 누르면 해제
  assert.ok($(".rw-ok").disabled, "다시 누르면 해제");
  $$(".rw-offer .card-face")[addIdx].click();
  const deckLen0 = S.store.run.deck.length;
  const tp0 = S.store.run.trainingPoints;
  $(".rw-ok").click();
  assert.notEqual(S.store.run.phase, "reward", "[확인] → 보상 끝");
  assert.equal(S.store.run.deck.length, deckLen0 + 1, "덱 +1");
  assert.equal(S.store.run.deck.at(-1).cardId, rv.offer[addIdx].cardId, "고른 카드가 덱에");
  assert.equal(S.store.run.trainingPoints, tp0, "고르면 TP 그대로");
  assert.equal(S.store.run.lesson, null);
  assert.equal(savedRun().deck.length, deckLen0 + 1, "저장");
  assert.equal($$("#modal-root .reward-modal").length, 0, "모달 닫힘");
  noErrorToast("보상 고르기");

  // ---------- 건너뛰기 → TP +10 ----------
  putRun(clearReward);
  $(".rw-skip").click();
  assert.ok($(".rw-skip").classList.contains("selected") && !$(".rw-ok").disabled, "건너뛰기 고름");
  $(".rw-ok").click();
  assert.equal(S.store.run.trainingPoints, clearReward.trainingPoints + rv.skipTp, "건너뛰기 TP");
  assert.equal(S.store.run.deck.length, clearReward.deck.length, "덱 그대로");

  // ---------- 퍼펙트: 무료 강화 덱 그리드 ----------
  const perf = perfectRewardState(data, 1).state;
  putRun(perf);
  rv = lessonRun.getRewardView(S.store.run, data);
  assert.match($(".rw-status").textContent, /퍼펙트/);
  assert.equal($$(".rw-deck .mini-card").length, perf.deck.length, "덱 그리드 = 덱");
  assert.equal($$(".rw-deck .mini-card:not(:disabled)").length, rv.upgradable.length, "강화할 수 있는 카드만 켜짐");
  assert.match($(".rw-free .rw-sec-head").textContent, /사라집니다/, "안 고르면 사라진다는 안내");
  const upOffer = rv.offer.findIndex((o) => o.kind === "upgrade");
  if (upOffer >= 0) {
    // 보상으로 강화하는 카드는 무료 강화 그리드에서 꺼진다 (같은 카드 두 번 강화 금지)
    $$(".rw-offer .card-face")[upOffer].click();
    assert.ok($(`.rw-deck .mini-card[data-uid="${rv.offer[upOffer].uid}"]`).disabled, "보상 강화 카드 = 그리드 꺼짐");
    $$(".rw-offer .card-face")[upOffer].click();
  }
  const pAdd = rv.offer.findIndex((o) => o.kind === "add");
  const freeUid = rv.upgradable.find((u) => !(upOffer >= 0 && u === rv.offer[upOffer].uid));
  $$(".rw-offer .card-face")[pAdd].click();
  $(`.rw-deck .mini-card[data-uid="${freeUid}"]`).click();
  assert.ok($(`.rw-deck .mini-card[data-uid="${freeUid}"]`).classList.contains("selected"), "무료 강화 카드 고름");
  assert.match($(".rw-up-line").textContent, /강화 후/, "강화 후 한 줄");
  assert.match($(".rw-summary").textContent, /무료 강화/);
  $(".rw-ok").click();
  assert.equal(S.store.run.deck.find((e) => e.uid === freeUid).plus, true, "무료 강화 = plus");
  assert.equal(S.store.run.deck.length, perf.deck.length + 1, "카드 획득 + 무료 강화");
  noErrorToast("퍼펙트 보상");

  // ---------- 실패: 보상 없음 · [계속] ----------
  const failReward = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "fail" }).state;
  putRun(failReward);
  assert.match($(".rw-status").textContent, /실패/);
  assert.ok($(".rw-none") && $$(".rw-offer").length === 0, "보상 없음");
  assert.ok(!$(".rw-ok").disabled && $(".rw-ok").textContent === "계속", "[계속]");
  $(".rw-ok").click();
  $(".rw-ok")?.click(); // 연타해도 1번 (모달은 이미 닫혔다)
  assert.notEqual(S.store.run.phase, "reward");
  assert.equal(S.store.run.trainingPoints, failReward.trainingPoints, "실패 = TP 없음");
  noErrorToast("실패 보상");

  // =====================================================================
  // U4 상담 (phase consult): 진열 구매 · 덱 강화 · 삭제(고유 = 확인 모달) · 스킬 · 오류 토스트 · 끝내기
  // =====================================================================
  const consult0 = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "consult" }).state;
  consult0.trainingPoints = 200;
  consult0.skillPoints = 600;
  for (const st of consult0.supports) for (const id of (data.supports.find((x) => x.id === st.id)?.hintSkillIds || []).slice(0, 1)) consult0.hints[id] = 2;
  putRun(consult0);
  let cv = lessonRun.getConsultView(S.store.run, data);
  assert.ok($(".consult-screen .consult-cols"), "상담 화면 3단");
  assert.equal($$(".cs-stock .cs-item").length, cv.stock.length, "진열");
  assert.ok($$(".cs-stock .cs-item").every((e, i) => e.textContent.includes(`${cv.stock[i].price} TP`)), "가격");
  assert.equal($$(".cs-deck-grid .mini-card").length, cv.deck.length, "덱 그리드");
  assert.equal($$(".cs-skill").length, cv.skills.length, "스킬 줄");
  assert.ok(cv.skills.length >= 2);
  assert.ok($(".cs-head .cs-tp").textContent.includes("200") && $(".cs-head .cs-sp").textContent.includes("600"), "TP · SP");
  assert.ok($(".cs-detail.empty"), "고른 카드 없음 안내");
  const crec = S.manager.recommendConsult(S.store.run, data);
  assert.ok($$(".consult-screen .recommended").length >= 1 || crec.op === "end", "추천 배지");

  // 구매
  const price0 = cv.stock[0].price;
  $('.cs-item[data-index="0"] .cs-buy-btn').click();
  assert.equal(S.store.run.consult.stock[0].bought, true, "구매 → bought");
  assert.equal(S.store.run.trainingPoints, 200 - price0, "TP −가격");
  assert.equal(S.store.run.deck.at(-1).cardId, cv.stock[0].cardId, "덱에 추가");
  assert.equal(savedRun().consult.stock[0].bought, true, "행동마다 저장");
  assert.ok($('.cs-item[data-index="0"] .cs-buy-btn').disabled && $('.cs-item[data-index="0"]').classList.contains("bought"), "구매함");

  // 덱 카드 고르기 → 다시 그려도 남음 → 강화
  cv = lessonRun.getConsultView(S.store.run, data);
  const upCard = cv.deck.find((c) => c.canUpgrade && c.family !== "unique");
  $(`.cs-deck-grid .mini-card[data-uid="${upCard.uid}"]`).click();
  assert.equal(S.store.consultUi.selectedUid, upCard.uid, "고른 카드 → consultUi");
  assert.equal($$(".cs-detail .card-face").length, 2, "지금 → 강화 후 카드");
  S.render();
  assert.ok($(`.cs-deck-grid .mini-card[data-uid="${upCard.uid}"]`).classList.contains("selected"), "다시 그려도 선택 유지");
  const tpU = S.store.run.trainingPoints;
  $(".cs-ops .cs-upgrade").click();
  assert.equal(S.store.run.deck.find((e) => e.uid === upCard.uid).plus, true, "강화 → plus");
  assert.equal(S.store.run.trainingPoints, tpU - cv.prices.upgrade, "TP −30");
  assert.equal(S.store.run.consult.upgradesLeft, 0);
  assert.ok($(".cs-ops .cs-upgrade").disabled, "강화한 카드 · 남은 강화 0 → 꺼짐");

  // 고유 카드 삭제 = 확인 모달 (취소 → 그대로, 삭제 → 엔진)
  const uq = cv.deck.find((c) => c.family === "unique");
  $(`.cs-deck-grid .mini-card[data-uid="${uq.uid}"]`).click();
  const deckN = S.store.run.deck.length;
  $(".cs-ops .cs-delete").click();
  assert.ok($("#modal-root .cs-confirm"), "고유 카드 삭제 확인 모달");
  assert.equal(S.store.run.deck.length, deckN, "확인 전에는 그대로");
  [...doc.querySelectorAll("#modal-root .cs-confirm button")].find((b) => b.textContent === "취소").click();
  assert.equal($$("#modal-root .cs-confirm").length, 0, "취소 → 모달 닫힘");
  assert.equal(S.store.run.deck.length, deckN);
  $(".cs-ops .cs-delete").click();
  $("#modal-root .cs-confirm-del").click();
  assert.equal(S.store.run.deck.length, deckN - 1, "삭제");
  assert.ok(!S.store.run.deck.some((e) => e.uid === uq.uid), "그 카드가 덱에서 빠짐");
  assert.equal(S.store.run.consult.deletesLeft, 0);
  assert.equal(S.store.consultUi.selectedUid, null, "지운 카드 선택 풀림");
  const basicUid = S.store.run.deck.find((e) => e.cardId === "cd_basic").uid;
  $(`.cs-deck-grid .mini-card[data-uid="${basicUid}"]`).click();
  assert.ok($(".cs-ops .cs-delete").disabled, "남은 삭제 0 → 꺼짐");

  // 스킬: 선수 고르기(select) → [배우기]
  cv = lessonRun.getConsultView(S.store.run, data);
  const sk = cv.skills.find((x) => x.affordable && x.eligiblePlayers.length >= 2) || cv.skills.find((x) => x.affordable && x.eligiblePlayers.length);
  const row = $(`.cs-skill[data-skill="${sk.skillId}"]`);
  const who = sk.eligiblePlayers.at(-1);
  const selEl = row.querySelector(".cs-sk-player");
  selEl.value = who;
  selEl.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(S.store.consultUi.skillPick[sk.skillId], who, "배울 선수 → consultUi");
  const sp0 = S.store.run.skillPoints;
  row.querySelector(".cs-learn").click();
  assert.ok(S.store.run.players.find((p) => p.id === who).learnedSkillIds.includes(sk.skillId), "스킬 습득");
  assert.equal(S.store.run.skillPoints, sp0 - sk.cost, "SP −비용");
  noErrorToast("상담");

  // 오류는 토스트 · 상태 그대로 (이미 산 진열 카드를 다시 사기)
  const snap = JSON.stringify(S.store.run);
  S.actions.consultAction({ op: "buy", index: 0 });
  assert.equal(JSON.stringify(S.store.run), snap, "실패한 op = 상태 그대로");
  assert.ok($$("#toast-root .toast-error").some((e) => /이미 산 카드/.test(e.textContent)), "오류 토스트");
  assert.ok($(".consult-screen"), "상담 화면 그대로");
  for (const e of $$("#toast-root .toast")) e.remove();
  consoleErrors.length = 0; // safe() 가 남긴 의도한 오류

  // 끝내기 → 주 끝
  $(".cs-head .cs-end").click();
  assert.notEqual(S.store.run.phase, "consult", "상담 끝");
  assert.equal(S.store.run.consult, null);
  assert.equal(S.store.consultUi.selectedUid, null);
  assert.equal(savedRun().phase, S.store.run.phase, "저장");
  noErrorToast("상담 끝");
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
