// test/lessonUi.test.mjs — 카드 레슨 화면 jsdom 검사 (LESSON_PROTO_PLAN §9.3 · §14.17 lessonUi, ZU2 = 구역 방식 레슨 화면 · U4 = 보상 모달 · 상담 화면)
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 감독 AI 로 걸은 레슨 런(tools/lesson_scenarios.mjs)을 store.run 에 넣어 레슨 화면을 그린다.
//  - 골격: HUD · 구역 바닥 5 · 토큰 = 뷰 positions · 벤치 칸 · 명단 7 · 손패 · [내기][턴 끝] ([쉬기] 없음)
//  - 클릭 조준 → 다시 그려도 조준 유지 → 경기장 클릭 → seq +1 · 저장 · 대상 = 원 안 선수 · 같은 DOM (부분 갱신)
//  - 키보드: ← → 후보 (dropCandidates) · 숫자 = 구역 중심 · Enter = 내기 · Esc = 취소, 빈 자리 = 거절 토스트
//  - 전체 카드 두 번 누르기 · 단일 카드 선수 위 클릭 · 회복 카드 명단 줄
//  - 벤치: 명단 [벤치] → 벤치 칸 · 토큰 숨김 · 칸 누르기 = 복귀 · B 키 · 최대 2명 / [턴 끝] → 새 배치 · 벤치 비움 / 레슨 끝 → 보상 모달
//  - 코치 지원 (§15.8): 붙은 카드 칩 · 코치 색 · 컷인 덮개 (누르기 · Esc · 시간 = 닫힘) · 짧은 판 · no-anim 안내 · 능력 알약
//  - U4 보상: 클리어 카드 고르기 · 건너뛰기(TP) · 퍼펙트 무료 강화 그리드 · 실패 [계속]
//  - U4 상담: 구매 · 강화(고른 카드는 다시 그려도 남음) · 고유 카드 삭제 확인 모달 · 스킬(배울 선수) · 오류 토스트 · 끝내기
// 연출은 prefers-reduced-motion 으로 줄여(타이머 0ms) 빨리 끝낸다. 끌기는 jsdom 에 레이아웃이 없어 lesson_layout.pointerToField 단위 테스트
// (lessonLayout.test) + 브라우저 스크린샷(tools/shot.mjs og_lesson_drag*)으로 본다. 레이아웃(넘침 · 잘림 · 겹침)도 스크린샷으로.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { KEYS } = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const OL = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);

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

test("jsdom: 레슨 화면 (구역) — 골격 · 조준 · 키보드 · 벤치 · 턴 끝 · 레슨 끝 → 보상 모달 · 상담", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
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

  // ---------- 골격 (§14.16): HUD · 구역 바닥 5 · 토큰 = 뷰 positions · 벤치 칸 · 명단 7 · 손패 · [내기][턴 끝] ----------
  putRun(lesson1);
  const scr = $(".lesson-screen");
  assert.ok(scr && !scr.classList.contains("lesson-temp"), "레슨 화면 (임시 화면 아님)");
  assert.equal(doc.getElementById("stage").dataset.mode, "lesson", "스테이지 모드 lesson (토스트는 손패 위)");
  let v = view();
  assert.ok($(".lesson-screen .lh .lh-title h2").textContent.includes(`${OL.STAT_LABELS[v.zone]} 중점`), "HUD 제목 = 중점 구역");
  assert.equal($$(".lh-pips i").length, v.turns, "턴 점 = 레슨 턴 수");
  assert.equal($(".lh-score-n").textContent, String(v.score), "점수");
  assert.ok($(".lh-score-t").textContent.includes(String(v.target)) && $(".lh-score-t").textContent.includes(String(v.cap)), "목표 · 퍼펙트");
  assert.equal($$(".lh-chip").length, v.chips.length, "버프 칩 = 뷰 chips");
  assert.ok($(".lesson-screen .pitch .m-field .pitch-bg"), "경기장 = 경기 화면 마크업 (.pitch > .m-field > .pitch-bg)");
  assert.equal($$(".lesson-screen .zone-pad").length, 5, "구역 바닥 5");
  assert.deepEqual($$(".lesson-screen .zone-pad").map((e) => e.dataset.zone).sort(), [...OL.ZONE_IDS].sort(), "구역 5곳");
  assert.ok($(`.zone-pad.focus[data-zone="${v.zone}"]`) && $$(".zone-pad.focus").length === 1, "중점 구역 바닥 = 금색 1곳");
  assert.equal($$(".lesson-screen .zone-chip").length, 5, "구역 라벨 5");
  assert.ok($(`.zone-chip.focus[data-zone="${v.zone}"]`).textContent.includes(OL.ZONE_LABELS[v.zone]), "중점 구역 라벨");
  assert.equal($$(".lesson-screen .tok-layer .tok.home").length, 7, "토큰 7");
  const onField = Object.keys(v.positions);
  assert.equal($$(".lesson-screen .tok:not(.off)").length, onField.length, "경기장 선수 토큰만 보인다");
  for (const id of onField) {
    const el = $(`.tok[data-id="${id}"]`);
    assert.equal(Number(el.dataset.x), v.positions[id].x, `${id} 토큰 x = 뷰 positions`);
    assert.equal(Number(el.dataset.y), v.positions[id].y, `${id} 토큰 y = 뷰 positions`);
    assert.ok(el.classList.contains(`z-${v.zones[id]}`), `${id} 구역 색`);
    assert.match(el.getAttribute("aria-label"), new RegExp(OL.ZONE_LABELS[v.zones[id]]), "aria-label 에 구역");
  }
  assert.ok($$(".lesson-screen .tok").every((e) => /translate\(/.test(e.style.transform)), "토큰은 translate 로 놓인다");
  assert.ok($(".ls-side .ls-bench") && $$(".ls-bench-slot").length === v.benchMax && $$(".ls-bench-slot.empty").length === v.benchMax, "벤치 칸 2 (비었음)");
  assert.equal($$(".ls-side .ls-row").length, 7, "명단 7");
  assert.equal($$(".ls-rest").length, 0, "[쉬기] 없음 (벤치로 바뀜)");
  assert.equal($$(".ls-hand .card-face").length, v.hand.length, "손패 = 뷰 손패");
  assert.ok($$(".ls-hand .card-face").every((c) => c.querySelector(".cf-name") && c.querySelector(".cf-target") && c.querySelector(".cf-desc")), "카드 앞면: 이름 · 대상 · 문구");
  const rec0 = S.manager.recommendCard(S.store.run, data);
  assert.equal($$(".ls-hand .card-face.recommended").length, rec0.kind === "play" ? 1 : 0, "추천 카드 배지 (manager.recommendCard)");
  assert.ok($(".ls-btns .ls-play").disabled, "[내기] 꺼짐 (조준 전)");
  assert.equal($(".ls-btns .ls-end").disabled, !v.canEndTurn, "[턴 끝] = canEndTurn (카드 0장이어도)");
  assert.match($(".ls-info").textContent, /카드를 끌어 경기장에 놓으세요/);
  assert.match($(".ls-piles").textContent, new RegExp(`덱 ${v.piles.draw}`), "덱 더미 수");
  noErrorToast("골격");

  // jsdom 에는 레이아웃이 없다 → 경기장 사각형을 1280×720 무대의 크기(968×392)로 흉내 내고, 필드 % → client px 로 클릭한다
  const fieldEl = () => $(".lesson-screen .m-field");
  const stubField = () => {
    fieldEl().getBoundingClientRect = () => ({ left: 0, top: 0, right: 968, bottom: 392, width: 968, height: 392, x: 0, y: 0 });
  };
  const clickField = (at, opts = {}) => fieldEl().dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: (at.x / 100) * 968, clientY: (at.y / 100) * 392, ...opts }));
  const key = (k, target = doc) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true }));
  const fxIds = () => [...new Set((S.store.run.lesson?.lastFx || []).filter((e) => e.t === "gain" || e.t === "fail").map((e) => e.id))].sort();

  // ---------- 클릭 조준 → 다시 그려도 조준 유지 → 경기장 클릭 → seq +1 · 저장 ----------
  const circ = withHand(lesson1, "cd_mf_drill", 0); // 중간 원
  putRun(circ.s);
  const cardOf = (uid) => $(`.ls-hand .card-face[data-uid="${uid}"]`);
  cardOf(circ.uid).click();
  assert.equal(ui.aim?.uid, circ.uid, "카드 클릭 → 조준 모드 (lessonUi.aim)");
  assert.ok(cardOf(circ.uid).classList.contains("selected") && $(".lesson-screen.aiming"), "조준 카드 강조 · 화면 aiming");
  assert.ok($(".ls-btns .ls-play").disabled, "자리를 고르기 전 [내기] 꺼짐");
  assert.match($(".ls-info").textContent, /원을 놓을 자리/);
  const domBefore = $(".lesson-screen");
  S.render(); // 다시 그리기 (app.render → lessonUi.gen +1) — 조준은 남는다
  assert.notEqual($(".lesson-screen"), domBefore, "render() = 새 화면");
  assert.equal(ui.aim?.uid, circ.uid, "다시 그려도 조준 유지");
  assert.ok(cardOf(circ.uid).classList.contains("selected") && $(".lesson-screen.aiming"), "다시 그려도 강조 유지");
  const circCands = lessonRun.dropCandidates(S.store.run, data, { uid: circ.uid });
  assert.ok(circCands.length >= 2, "원 후보 점");
  const cd0 = circCands.reduce((b, c) => (c.ids.length > b.ids.length ? c : b));
  stubField();
  const seq0 = S.store.run.lesson.seq;
  const scr2 = $(".lesson-screen");
  const tokEl = $(`.tok[data-id="${cd0.ids[0]}"]`);
  clickField(cd0.at);
  assert.equal(S.store.run.lesson.seq, seq0 + 1, "경기장 클릭 → playCard → seq +1");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).lesson.seq, seq0 + 1, "레슨 호출마다 저장 (soccer-lesson.run)");
  assert.deepEqual(fxIds(), cd0.ids.slice().sort(), "원 안 선수 = 실제 대상 (엔진이 정한다)");
  assert.ok(ui.busy, "연출 중 busy");
  $$(".ls-hand .card-face")[0]?.click(); // 연출 중 입력은 무시
  assert.equal(ui.aim, null, "연출 중 카드 클릭 무시");
  await notBusy();
  assert.equal($(".lesson-screen"), scr2, "카드를 내도 화면 DOM 은 그대로 (부분 갱신)");
  assert.equal($(`.tok[data-id="${cd0.ids[0]}"]`), tokEl, "토큰 DOM 도 그대로");
  assert.ok(!tokEl.classList.contains("drilling"), "훈련 동작 끝");
  assert.equal(ui.aim, null, "낸 뒤 조준 풀림");
  assert.equal(ui.shownSeq, S.store.run.lesson.seq, "보여 준 seq");
  v = view();
  assert.equal($(".lh-score-n").textContent, String(v.score), "점수 갱신");
  assert.equal($$(".ls-hand .card-face").length, v.hand.length, "손패 갱신");
  noErrorToast("클릭 조준");

  // ---------- 키보드: 조준 → ← → 후보 (원 · 대상 강조 · 안내) → 숫자 = 구역 중심 → Enter ----------
  putRun(circ.s);
  cardOf(circ.uid).click();
  key("ArrowRight");
  assert.equal(ui.aim.idx, 0, "→ = 첫 후보");
  assert.deepEqual(ui.aim.at, circCands[0].at, "후보 점 = dropCandidates");
  assert.ok($(".aim-circle.on.ok"), "조준 원 (대상 있음)");
  assert.equal($$(".lesson-screen .tok.target").length, circCands[0].ids.length, "원 안 선수 = 흰 고리");
  const pv0 = lessonRun.previewCard(S.store.run, data, { uid: circ.uid, at: circCands[0].at });
  const t0 = pv0.targets[0];
  assert.equal($(`.tok[data-id="${t0.id}"] .tok-name`).textContent, `+${t0.gain}`, "이름표 자리에 예상 상승");
  assert.equal($(".lh-delta").textContent, `+${pv0.total}`, "점수 막대 미리보기 = 합계");
  assert.match($(".ls-info").textContent, new RegExp(`대상 ${pv0.targets.length}명 · 합계 \\+${pv0.total}`), "dock 안내 합계");
  assert.match($(".ls-info .ls-cand").textContent, new RegExp(`후보 1/${circCands.length}`), "후보 번호 라벨");
  assert.ok(!$(".ls-btns .ls-play").disabled, "[내기] 켜짐");
  key("ArrowRight");
  assert.equal(ui.aim.idx, 1);
  key("ArrowLeft");
  key("ArrowLeft");
  assert.equal(ui.aim.idx, circCands.length - 1, "← 는 거꾸로 돈다");
  key("2");
  assert.deepEqual(ui.aim.at, data.lesson.zones.centers.pass, "2 = 패스 구역 중심 (위 줄 왼 → 오)");
  key("ArrowRight");
  const seqK = S.store.run.lesson.seq;
  key("Enter");
  assert.equal(S.store.run.lesson.seq, seqK + 1, "Enter = 내기");
  assert.deepEqual(fxIds(), circCands[0].ids.slice().sort(), "키보드 후보 대상");
  await notBusy();

  // ---------- Esc = 조준 취소 · 빈 자리 클릭 = 거절(토스트) ----------
  putRun(circ.s);
  cardOf(circ.uid).click();
  stubField();
  const emptyAt = [[50, 97], [50, 3], [3, 97], [97, 97], [3, 3], [97, 3], [50, 52]].map(([x, y]) => ({ x, y }))
    .find((at) => !lessonRun.previewCard(S.store.run, data, { uid: circ.uid, at }).ok);
  assert.ok(emptyAt, "빈 자리");
  clickField(emptyAt);
  assert.equal(S.store.run.lesson.seq, circ.s.lesson.seq, "원 안에 선수가 없으면 내지 않는다");
  assert.ok($$("#toast-root .toast").some((e) => /원 안에 선수가 없습니다/.test(e.textContent)), "이유 토스트");
  for (const e of $$("#toast-root .toast")) e.remove();
  key("Escape");
  assert.equal(ui.aim, null, "Esc = 취소");
  assert.ok(!$(".lesson-screen.aiming") && $$(".tok.target").length === 0, "조준 표시 지움");

  // ---------- 전체 카드: 경기장 전원 강조 → 한 번 더 누르면 낸다 ----------
  const all = withHand(lesson1, "cd_basic", 0);
  putRun(all.s);
  cardOf(all.uid).click();
  assert.equal($$(".tok.target").length, Object.keys(view().positions).length, "전체: 경기장 전원 대상");
  assert.ok($(".lesson-screen .m-field.aim-all"), "경기장 전체 빛");
  assert.ok($$(".tok.target .tok-name").every((b) => /^\+\d+$/.test(b.textContent)), "대상 이름표 자리 +N");
  cardOf(all.uid).click();
  assert.equal(S.store.run.lesson.seq, all.s.lesson.seq + 1, "전체 카드: 한 번 더 누르면 낸다");
  await notBusy();

  // ---------- 단일 카드: 후보 초록 → 선수 위 클릭 = 그 선수 ----------
  const one = withHand(lesson1, "cd_coaching", 0);
  putRun(one.s);
  cardOf(one.uid).click();
  const oneCands = lessonRun.dropCandidates(S.store.run, data, { uid: one.uid });
  assert.equal($$(".tok.cand").length, oneCands.length, "단일: 후보 선수 초록 테");
  const pick = oneCands[oneCands.length - 1];
  stubField();
  clickField({ x: pick.at.x + 0.8, y: pick.at.y + 1 }); // 토큰 가장자리 (pickR 안)
  assert.equal(S.store.run.lesson.seq, one.s.lesson.seq + 1, "선수 위 클릭 = 내기");
  assert.deepEqual(fxIds(), [pick.playerId], "가장 가까운 선수가 대상");
  await notBusy();

  // ---------- 회복 카드: 명단 줄을 누르면 그 선수 (벤치 · 결장도 — playerId) ----------
  const cool = withHand(lesson1, "cd_cooldown", 0);
  cool.s.players[2].stamina = 30;
  putRun(cool.s);
  cardOf(cool.uid).click();
  assert.equal($$(".ls-row.pickable").length, 7, "회복 카드: 명단 7줄 고를 수 있음");
  const healId = cool.s.players[2].id;
  $(`.ls-row[data-pid="${healId}"]`).click();
  assert.equal(S.store.run.lesson.seq, cool.s.lesson.seq + 1, "명단 줄 = 회복 카드 내기");
  assert.equal(S.store.run.players[2].stamina, 50, "체력 +20");
  await notBusy();
  assert.equal(S.store.run.lesson.turn, cool.s.lesson.turn, "추가 사용 +1 → 같은 턴");
  noErrorToast("카드 종류별 조준");

  // ---------- 벤치: 명단 [벤치] → 벤치 칸 · 토큰 숨김 · 대형 다시 · 칸 누르기 = 복귀 · B 키 · 최대 2명 ----------
  putRun(lesson1);
  const fieldIds = Object.keys(view().positions);
  const b1 = fieldIds[0];
  $(`.ls-row[data-pid="${b1}"] .ls-bench-btn`).click();
  assert.deepEqual(S.store.run.lesson.bench, [b1], "benchPlayer(on)");
  assert.deepEqual(JSON.parse(window.localStorage.getItem(KEYS.run)).lesson.bench, [b1], "벤치도 저장");
  assert.ok($(`.ls-bench-slot.filled[data-pid="${b1}"]`), "벤치 칸에 그 선수");
  assert.ok($(`.tok[data-id="${b1}"]`).classList.contains("off"), "경기장 토큰은 숨김");
  assert.equal($(`.ls-row[data-pid="${b1}"] .ls-bench-btn`).textContent, "복귀", "명단 버튼 = 복귀");
  for (const id of Object.keys(view().positions)) assert.equal(Number($(`.tok[data-id="${id}"]`).dataset.x), view().positions[id].x, "남은 선수 = 새 대형");
  $(`.ls-bench-slot.filled[data-pid="${b1}"]`).click();
  assert.deepEqual(S.store.run.lesson.bench, [], "벤치 칸 누르기 = 복귀 (on: false)");
  assert.ok(!$(`.tok[data-id="${b1}"]`).classList.contains("off"), "토큰이 경기장으로");
  key("b", $(`.tok[data-id="${fieldIds[1]}"]`));
  assert.deepEqual(S.store.run.lesson.bench, [fieldIds[1]], "토큰 포커스 + B = 벤치");
  $(`.ls-row[data-pid="${fieldIds[2]}"] .ls-bench-btn`).click();
  assert.equal(S.store.run.lesson.bench.length, 2);
  assert.ok($(".ls-bench.full") && $(`.ls-row[data-pid="${fieldIds[3]}"] .ls-bench-btn`).disabled, "최대 2명 → [벤치] 꺼짐");
  assert.match($(".ls-bench-note").textContent, /최대 2명/);
  noErrorToast("벤치");

  // ---------- 턴 끝 (카드 0장이어도) → 벤치 비움 · 새 배치 (토큰 = 새 positions) · 새 손패 ----------
  const turn0 = S.store.run.lesson.turn;
  $(".ls-btns .ls-end").click();
  await notBusy();
  assert.equal(S.store.run.lesson.turn, turn0 + 1, "[턴 끝] → 다음 턴");
  assert.deepEqual(S.store.run.lesson.bench, [], "다음 턴 벤치 비움");
  v = view();
  assert.equal($(".lh-turn-n").textContent, `${turn0 + 1}/${v.turns}`, "턴 표시 갱신");
  assert.equal($$(".lesson-screen .tok:not(.off)").length, Object.keys(v.positions).length, "벤치 선수도 경기장으로");
  for (const id of Object.keys(v.positions)) {
    assert.equal(Number($(`.tok[data-id="${id}"]`).dataset.x), v.positions[id].x, `${id} 새 배치 x`);
    assert.equal(Number($(`.tok[data-id="${id}"]`).dataset.y), v.positions[id].y, `${id} 새 배치 y`);
  }
  assert.equal($$(".ls-hand .card-face").length, v.hand.length, "새 손패");
  assert.equal($$(".ls-bench-slot.filled").length, 0, "벤치 칸 비움");
  noErrorToast("턴 끝");

  // ---------- 코치 지원 (§15.8, L37): 붙은 카드 = 코치 칩 · 코치 색 → 내면 컷인 덮개 (누르면 넘김) → 카드 연출 + 능력 알약 · 두 번째 = 짧은 판 · no-anim = 덮개 없이 안내 ----------
  /** 손패 첫 장을 cardId 로 바꾸고 supportId 코치를 붙인 상태 (엔진 붙기는 rng — 장면을 고르려면 주입). cutins = 이번 레슨 앞선 컷인 수 */
  const withAttach = (st, cardId, supportId, cutins = 0) => {
    const { s, uid } = withHand(st, cardId, 0);
    const Ls = s.lesson;
    Ls.attach = Ls.attach || { turns: [], cur: null, count: {}, log: [], hints: [] };
    Ls.attach.cur = { uid, supportId, turn: Ls.turn, upgrade: "plus" };
    Ls.attach.log.push({ turn: Ls.turn, supportId, uid, cardId, played: false });
    Ls.stats.cutins = cutins;
    return { s, uid };
  };
  const harr = data.supports.find((x) => x.id === "sp_coach_harr");
  const sage = data.supports.find((x) => x.id === "sp_elder_sage");
  assert.ok(lesson1.supports.some((x) => x.id === harr.id) && lesson1.supports.some((x) => x.id === sage.id), "기본 편성에 하르나 · 오르넬라");
  const att1 = withAttach(lesson1, "cd_basic", harr.id);
  putRun(att1.s);
  const attCard = cardOf(att1.uid);
  assert.ok(attCard.classList.contains("attached") && attCard.classList.contains("co-shoot"), "붙은 카드: .attached + 코치 타입 색 (하르나 = 슈팅)");
  assert.equal($$(".ls-hand .card-face.attached").length, 1, "붙은 카드는 1장");
  assert.match(attCard.querySelector(".cf-meta .cf-coach").textContent, /하르나 지원/, "메타 줄 맨 앞 코치 칩");
  assert.equal(attCard.querySelector(".cf-meta").firstElementChild, attCard.querySelector(".cf-coach"), "칩은 메타 줄 맨 앞 (겹친 손패에서도 보이는 왼쪽)");
  assert.equal(attCard.querySelector(".cf-coach .avatar").textContent, "하", "코치 얼굴 = 짧은 이름 첫 글자");
  assert.ok(attCard.querySelector(".cf-plus.att"), "지원 강화 \"+\" = 코치 색");
  assert.match(attCard.title, /코치 하르나 지원 — 이번 턴만 강화 · 내면: 슈팅 구역 대상 \+50%/, "카드 title");
  assert.match($(".ls-info .ls-att-line").textContent, /하르나 지원 → 기초 훈련\+/, "dock 지원 줄");
  assert.match($(".ls-info .ls-att-sub").textContent, /내면 골문을 보는 눈 · 슈팅 구역 대상 \+50%/, "dock 지원 능력 줄");
  assert.ok($(".lesson-screen").classList.contains("co-shoot"), "화면 코치 색 (조준 말풍선 · 연출)");
  // no-anim (이 테스트는 움직임 줄이기): 덮개 없이 낸다 → 안내 칸 "하르나 지원 발동"
  attCard.click();
  attCard.click();
  assert.equal(S.store.run.lesson.seq, att1.s.lesson.seq + 1, "붙은 카드 내기");
  assert.equal(S.store.run.lesson.lastFx[0].t, "cutin", "엔진 컷인 fx");
  assert.equal($$(".ls-cutin.on").length, 0, "no-anim: 컷인 덮개 없음");
  await notBusy();
  assert.match($(".ls-info .ls-cut-recap").textContent, /하르나 지원 발동/, "no-anim: 안내 칸에 지원 발동");
  assert.match($(".ls-info").textContent, /골문을 보는 눈 — 슈팅 구역 대상 \+50%/);
  assert.equal(S.store.run.lesson.stats.cutins, 1);
  noErrorToast("코치 지원 no-anim");

  // 연출 켬 (움직임 줄이기 끔): 컷인 덮개 → 누르면 넘김 → 카드 연출 (코치 색 고리) + 능력 알약
  const mmReduce = g.matchMedia;
  g.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} });
  try {
    putRun(att1.s);
    assert.ok(!$(".lesson-screen").classList.contains("no-anim"), "연출 켬");
    cardOf(att1.uid).click();
    cardOf(att1.uid).click();
    assert.equal(S.store.run.lesson.seq, att1.s.lesson.seq + 1);
    const cut = $(".ls-cutin.on");
    assert.ok(cut && cut.classList.contains("co-shoot") && cut.classList.contains("first"), "컷인 덮개 (첫 번 · 코치 타입 색)");
    assert.equal($(".ls-cutin .lc-txt b").textContent, "코치 하르나", "코치 이름");
    assert.match($(".ls-cutin .lc-txt small").textContent, /코치 지원 · 슈팅/);
    assert.equal($(".ls-cutin .lc-line").textContent, `“${data.lesson.attach.abilities[harr.id].line}”`, "코치 대사 (lesson.json line)");
    assert.match($(".ls-cutin .lc-sub").textContent, /골문을 보는 눈\s*슈팅 구역 대상 \+50%/, "능력 이름 · 문구");
    assert.equal($(".ls-cutin .lc-face").textContent, "하");
    assert.match($(".ls-cutin .lc-card").textContent, /기초 훈련/, "낸 카드");
    assert.ok($(".ls-cutin .lc-skip") && !$(".ls-cutin .lc.short"), "첫 컷인: 긴 판 + \"탭하여 넘기기\"");
    assert.equal($(".ls-cutin").style.getPropertyValue("--t-cut"), `${data.lesson.attach.cutinMs.first}ms`, "길이 = cutinMs.first");
    assert.ok(ui.busy, "컷인 동안 입력 막음 (busy)");
    assert.match($(".ls-info .ls-cut-note").textContent, /하르나 지원 발동/, "안내 칸");
    assert.equal($$(".tok.drilling").length, 0, "컷인이 먼저 — 카드 연출은 아직");
    $(".ls-cutin").dispatchEvent(new window.Event("pointerdown", { bubbles: true, cancelable: true }));
    assert.equal($$(".ls-cutin.on").length, 0, "누르면 바로 닫힘 (넘기기)");
    assert.ok($$(".tok.drilling.att-drill").length > 0, "닫히면 카드 연출 — 훈련 고리 = 코치 색");
    const abil = await until(() => $(".lesson-screen .ls-abil"), 2000);
    assert.ok(abil, "능력 알약 (경기장)");
    assert.match(abil.textContent, /골문을 보는 눈/);
    assert.match(abil.textContent, /유대 \+5/, "유대 +5");
    assert.equal(abil.querySelector(".la-face").textContent, "하");
    await until(() => !ui.busy, 5000);
    assert.ok(!ui.busy, "연출 끝");
    assert.equal(S.store.run.supports.find((x) => x.id === harr.id).bond, att1.s.supports.find((x) => x.id === harr.id).bond + data.lesson.attach.bond, "하르나 유대 +5");
    noErrorToast("컷인 넘기기");

    // 두 번째 컷인 (repeat 1) = 짧은 판 · "탭하여 넘기기" 없음 · 저절로 닫힌다 (cutinMs.repeat)
    const att2 = withAttach(lesson1, "cd_basic", sage.id, 1);
    putRun(att2.s);
    assert.ok(cardOf(att2.uid).classList.contains("co-pass"), "오르넬라 = 패스 색");
    cardOf(att2.uid).click();
    cardOf(att2.uid).click();
    assert.ok($(".ls-cutin.on.short .lc.short"), "두 번째 컷인 = 짧은 판");
    assert.equal($$(".ls-cutin .lc-skip").length, 0, "짧은 판: 안내 문구 없음");
    assert.equal($(".ls-cutin").style.getPropertyValue("--t-cut"), `${data.lesson.attach.cutinMs.repeat}ms`, "길이 = cutinMs.repeat");
    assert.equal($(".ls-cutin .lc-txt b").textContent, "현자 오르넬라");
    await until(() => !$(".ls-cutin.on"), 2000);
    assert.equal($$(".ls-cutin.on").length, 0, "저절로 닫힘");
    await until(() => !ui.busy, 5000);
    // Esc 로 넘기기
    putRun(att2.s);
    cardOf(att2.uid).click();
    cardOf(att2.uid).click();
    assert.ok($(".ls-cutin.on"));
    key("Escape");
    assert.equal($$(".ls-cutin.on").length, 0, "Esc = 넘기기");
    await until(() => !ui.busy, 5000);
    noErrorToast("짧은 컷인");
  } finally {
    g.matchMedia = mmReduce;
  }

  // ---------- 레슨 끝 → reward phase: 레슨 화면 inert + 보상 모달 ----------
  const fin = withHand(lesson1, "cd_basic", 0);
  fin.s.lesson.score = fin.s.lesson.cap - 1; // 다음 상승으로 퍼펙트
  putRun(fin.s);
  cardOf(fin.uid).click();
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
  // 클리어 (퍼펙트 아님) 보상이 나오는 첫 시드 — 밸런스가 바뀌면 (L40 등) 시드 "lesson-ui" 의 레슨이 모두 퍼펙트일 수 있다
  const clearWalk = ["lesson-ui", "lesson-ui-2", "lesson-ui-3", "lesson-ui-4", "lesson-ui-5"]
    .map((seed) => walkLesson(data, { seed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 }))
    .find(Boolean);
  assert.ok(clearWalk, "클리어 보상 상태 (시드 5개 안에서)");
  const clearReward = clearWalk.state;

  // ---------- 클리어: 골격 · 카드 고르기 → [확인] ----------
  putRun(clearReward);
  let rv = lessonRun.getRewardView(S.store.run, data);
  assert.ok($(".lesson-screen.inert") && $("#modal-root .reward-modal"), "보상 = 레슨 화면 inert + 모달");
  assert.match($(".rw-status").textContent, /클리어/, "결과 머리");
  assert.ok($(".rw-score-n").textContent === String(rv.result.score) && $(".rw-score-t").textContent.includes(String(rv.result.target)), "점수 · 목표");
  assert.equal($$(".rw-players .rw-pl").length, 7, "선수 7 상승");
  assert.ok($(".rw-chip.tp").textContent.includes(`+${rv.result.tp}`), "TP 칩");
  // 코치 지원 칩 (§15.8 ③): "코치 지원 N번" + 코치 얼굴, 컷인 힌트 = 얼굴 + "지원"
  assert.equal($$(".rw-chip.coach-sup").length, rv.result.cutins.length ? 1 : 0, "코치 지원 칩 (\"지원 N번\") = 컷인이 있으면");
  if (rv.result.cutins.length) {
    assert.match($(".rw-chip.coach-sup").textContent, new RegExp(`지원 ${rv.result.cutins.length}번`));
    assert.equal($$(".rw-chip.coach-sup .rw-face").length, new Set(rv.result.cutins.map((c) => c.supportId)).size, "코치 얼굴 = 컷인 코치");
  }
  assert.equal($$(".rw-chip.hint .rw-hint-src").length, rv.result.hints.filter((x) => x.src === "cutin").length, "컷인 힌트 = \"지원\" 표시");
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
  // 목표치가 낮아 실패 레슨이 드물다 → 실패가 나오는 시드를 찾는다
  let failWalk = null;
  for (let i = 0; i < 40 && !failWalk; i++) {
    failWalk = walkLesson(data, { seed: i ? `lesson-ui-${i}` : "lesson-ui", until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "fail" });
  }
  assert.ok(failWalk, "실패 레슨이 나오는 시드");
  const failReward = failWalk.state;
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
