// test/lessonUi.test.mjs — 카드 레슨 화면 jsdom 검사 (LESSON_PROTO_PLAN §9.3 · §14.17 lessonUi, ZU2 = 구역 방식 레슨 화면 · U4 = 보상 모달 · 상담 화면)
// index.html 을 jsdom 으로 올려 js/ui/app.js 를 부트하고, 감독 AI 로 걸은 레슨 런(tools/lesson_scenarios.mjs)을 store.run 에 넣어 레슨 화면을 그린다.
//  - 골격: HUD · 구역 바닥 5 · 토큰 = 뷰 positions · 벤치 칸 · 명단 7 · 손패 · [내기][턴 끝] ([쉬기] 없음)
//  - 클릭 조준 → 다시 그려도 조준 유지 → 경기장 클릭 → seq +1 · 저장 · 대상 = 원 안 선수 · 같은 DOM (부분 갱신)
//  - 키보드: ← → 후보 (dropCandidates) · 숫자 = 구역 중심 · Enter = 내기 · Esc = 취소, 빈 자리 = 거절 토스트
//  - 전체 카드 두 번 누르기 · 단일 카드 선수 위 클릭 · 회복 카드 명단 줄
//  - 벤치: 명단 [벤치] → 벤치 칸 · 토큰 숨김 · 칸 누르기 = 복귀 · B 키 · 최대 2명 / [턴 끝] → 새 배치 · 벤치 비움 / 레슨 끝 → 보상 모달
//  - 코치 지원 (§15.8): 붙은 카드 칩 · 코치 색 · 컷인 덮개 (누르기 · Esc · 시간 = 닫힘) · 짧은 판 · no-anim 안내 · 능력 알약
//  - U4 보상: 클리어 카드 고르기 · 건너뛰기(TP) · 퍼펙트 무료 강화 그리드 · 실패 [계속]
//  - U4 상담: 구매 · 강화(고른 카드는 다시 그려도 남음) · 고유 카드 삭제 확인 모달 · 오류 토스트 · 끝내기
//  - L48 패시브: 상담 패시브 칸 (선수 7 × 3 칩 상태 · 칩 누르기 = 습득 · [크게 보기] 모달) · 주 [✦ 패시브 · SP] 배지 → 상점 모달
//    (고유 먼저 · 할인 · 보유 · SP 부족 · 추천 · 사면 모달은 열린 채 · 저장 · 닫으면 다시 그림 · 오류 토스트) · 코치 칸 파티 패시브 ·
//    경기 전 준비 파티 패시브 목록 · [✦ 패시브] (사도 편집 중 배치 유지) · 보상 SP 칩 · 선수 힌트 · 수업 바꾸기 = 액티브만
// 연출은 prefers-reduced-motion 으로 줄여(타이머 0ms) 빨리 끝낸다. 끌기는 jsdom 에 레이아웃이 없어 lesson_layout.pointerToField 단위 테스트
// (lessonLayout.test) + 브라우저 스크린샷(tools/shot.mjs og_lesson_drag*)으로 본다. 레이아웃(넘침 · 잘림 · 겹침)도 스크린샷으로.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

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

  // ---------- 스탯 보기 (§17): 명단 줄 = 구역 스탯 · 이번 레슨 +N / 선수 정보 팝오버 = 토큰 누르기(카드 없을 때) · ⓘ(늘) · 키 · hover, Esc · 바깥 · 다시 누르기 = 닫기 ----------
  const { gradeOf } = await import(pathToFileURL(path.join(ROOT, "js/ui/dom.js")).href);
  const th = data.config.rating?.thresholds;
  const lesson3 = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "lesson" && s.lesson.status === "playing" && s.lesson.turn >= 3 }).state;
  putRun(lesson3);
  const v3 = view();
  const runP = (id) => S.store.run.players.find((p) => p.id === id);
  const gainOf = (id, k) => Math.round(runP(id).stats[k]) - Math.round(S.store.run.lesson.before[id][k]);
  const gainText = (g) => (g > 0 ? `+${g}` : g < 0 ? `−${-g}` : "+0");
  let rosterGain = false;
  for (const p of v3.players) {
    const cur = $(`.ls-row[data-pid="${p.id}"] .ls-cur`);
    assert.ok(cur, `${p.id}: 명단 두 번째 줄 (구역 스탯)`);
    if (p.out) { assert.ok(cur.classList.contains("off") && /결장/.test(cur.textContent), `${p.id}: 결장 줄`); continue; }
    const val = Math.round(runP(p.id).stats[p.zone]);
    const g = gainOf(p.id, p.zone);
    if (g) rosterGain = true;
    assert.equal(cur.dataset.stat, p.zone, `${p.id}: 서 있는 구역의 스탯`);
    assert.equal(Number(cur.dataset.value), val, `${p.id}: 지금 값 = 엔진`);
    assert.equal(Number(cur.dataset.gain), g, `${p.id}: 이번 레슨 상승 = 엔진 (지금 − 레슨 시작)`);
    assert.equal(cur.querySelector(".ls-cur-k").textContent, OL.STAT_LABELS[p.zone]);
    assert.equal(cur.querySelector(".ls-cur-v").textContent, String(val));
    assert.equal(cur.querySelector(".grade").textContent, gradeOf(val, th), "등급");
    assert.equal(cur.querySelector(".ls-cur-g").textContent, gainText(g));
    assert.ok($(`.ls-row[data-pid="${p.id}"] .ls-pi-btn`), `${p.id}: ⓘ 버튼`);
  }
  assert.ok(rosterGain, "3턴째: 명단에 오른 스탯이 보인다");
  const pop = () => $(".lesson-screen .ls-pinfo.on");
  assert.equal(pop(), null, "처음엔 팝오버 없음");
  const fid = Object.keys(v3.positions)[0];
  const ftok = $(`.tok[data-id="${fid}"]`);
  /** 팝오버 내용 = 엔진 상태 (스탯 5 · 등급 · 이번 레슨 · 성장 · 자리 · 구역 · 체력) */
  const checkPop = (id, where) => {
    const el = pop();
    assert.ok(el, `${where}: 팝오버 열림`);
    assert.equal(el.dataset.pid, id, `${where}: 그 선수`);
    const rows = [...el.querySelectorAll(".pi-row[data-stat]")];
    assert.deepEqual(rows.map((r) => r.dataset.stat), OL.STATS, `${where}: 스탯 5개`);
    const vp = view().players.find((x) => x.id === id);
    for (const r of rows) {
      const k = r.dataset.stat;
      const val = Math.round(runP(id).stats[k]);
      const g = gainOf(id, k);
      assert.equal(r.querySelector(".pi-v .pi-num").textContent, String(val), `${where} ${k}: 지금 값 = 엔진`);
      assert.equal(r.querySelector(".grade").textContent, gradeOf(val, th), `${where} ${k}: 등급`);
      assert.equal(r.querySelector(".pi-g").textContent, g ? gainText(g) : "–", `${where} ${k}: 이번 레슨 상승`);
      assert.equal(r.querySelector(".pi-gr").textContent, `×${runP(id).growth[k].toFixed(2)}`, `${where} ${k}: 성장률`);
      assert.equal(r.classList.contains("here"), !vp.out && k === vp.zone, `${where} ${k}: 지금 구역 줄`);
    }
    assert.ok(el.querySelector(".pi-slot").textContent === runP(id).slot, `${where}: 자리`);
    if (!vp.out && !vp.bench) assert.ok(el.querySelector(".pi-where").textContent.includes(OL.ZONE_LABELS[vp.zone]), `${where}: 구역`);
    assert.equal(el.querySelector(".pi-stam b").textContent, String(vp.stamina), `${where}: 체력`);
  };
  ftok.click();
  checkPop(fid, "토큰 누르기 (카드 없음)");
  assert.ok(pop().classList.contains("pinned") && pop().querySelector(".pi-x"), "누르기 = 고정 (× 버튼)");
  assert.ok(ftok.classList.contains("info-on") && $(`.ls-row[data-pid="${fid}"]`).classList.contains("info-on"), "토큰 · 명단 줄 표시");
  assert.equal($(`.ls-row[data-pid="${fid}"] .ls-pi-btn`).getAttribute("aria-expanded"), "true", "ⓘ aria-expanded");
  assert.equal(S.store.run.lesson.seq, lesson3.lesson.seq, "엔진 호출 없음");
  ftok.click();
  assert.equal(pop(), null, "같은 토큰 다시 = 닫기");
  ftok.click();
  key("Escape");
  assert.equal(pop(), null, "Esc = 닫기");
  ftok.click();
  $(".lesson-screen .lh").dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true }));
  assert.equal(pop(), null, "바깥 누르기 = 닫기");
  key("Enter", ftok);
  checkPop(fid, "토큰 포커스 + Enter");
  key("i", ftok);
  assert.equal(pop(), null, "I = 다시 닫기 (토글)");
  key("i", ftok);
  assert.ok(pop(), "I = 열기");
  pop().querySelector(".pi-x").click();
  assert.equal(pop(), null, "× = 닫기");
  // 명단 줄 누르기 (카드 없음) = 팝오버 (명단 줄 왼쪽), 다른 선수 토큰 누르기 = 그 선수로
  const fid2 = Object.keys(v3.positions)[1];
  $(`.ls-row[data-pid="${fid2}"]`).click();
  checkPop(fid2, "명단 줄 누르기");
  $(`.tok[data-id="${fid}"] .tok-name`).dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0 })); // 바깥(다른 토큰) 누르기 → 닫고, click → 그 선수로 연다
  assert.equal(pop(), null, "다른 토큰 pointerdown = 바깥 누르기");
  ftok.click();
  checkPop(fid, "다른 토큰 누르기");
  key("Escape");
  // hover (데스크톱): 잠깐 뒤 열리고 (고정 아님) 떠나면 닫힌다
  ftok.dispatchEvent(new window.MouseEvent("pointerenter", { bubbles: false }));
  await until(() => pop(), 1000);
  assert.ok(pop() && pop().classList.contains("hover") && !pop().querySelector(".pi-x"), "hover = 고정 아닌 팝오버");
  ftok.dispatchEvent(new window.MouseEvent("pointerleave", { bubbles: false }));
  assert.equal(pop(), null, "떠나면 닫힌다");
  // 벤치 줄: "벤치" + 돌아갈 구역 스탯, 팝오버도 벤치
  $(`.ls-row[data-pid="${fid2}"] .ls-bench-btn`).click();
  assert.deepEqual(S.store.run.lesson.bench, [fid2], "[벤치] (팝오버와 상관없이)");
  const bcur = $(`.ls-row[data-pid="${fid2}"] .ls-cur`);
  assert.ok(bcur.classList.contains("on-bench") && bcur.querySelector(".ls-cur-bench") && bcur.dataset.stat === v3.zones[fid2], "벤치 줄 = 벤치 + 돌아갈 구역 스탯");
  $(`.ls-row[data-pid="${fid2}"] .ls-pi-btn`).click();
  checkPop(fid2, "벤치 선수 ⓘ");
  assert.match(pop().querySelector(".pi-where").textContent, /벤치/);
  key("Escape");
  noErrorToast("스탯 보기 — 카드 없음");

  // 카드를 골랐으면 토큰 누르기 = 자리 고르기 그대로 (팝오버 아님) — 단일 카드는 그 선수에게 낸다
  const one3 = withHand(lesson3, "cd_coaching", 0);
  putRun(one3.s);
  cardOf(one3.uid).click();
  stubField();
  const pick3 = lessonRun.dropCandidates(S.store.run, data, { uid: one3.uid })[0];
  $(`.tok[data-id="${pick3.playerId}"]`).dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: (pick3.at.x / 100) * 968, clientY: (pick3.at.y / 100) * 392 }));
  assert.equal(pop(), null, "카드를 골랐으면 토큰 누르기로 팝오버가 열리지 않는다");
  assert.equal(S.store.run.lesson.seq, one3.s.lesson.seq + 1, "토큰 누르기 = 그 선수에게 낸다 (조준 그대로)");
  assert.deepEqual(fxIds(), [pick3.playerId]);
  await notBusy();
  // 조준 중 hover 도 열지 않는다 · I 키는 늘 연다
  putRun(one3.s);
  cardOf(one3.uid).click();
  const atok = $(`.tok[data-id="${pick3.playerId}"]`);
  atok.dispatchEvent(new window.MouseEvent("pointerenter", { bubbles: false }));
  await wait(150);
  assert.equal(pop(), null, "조준 중 hover = 팝오버 없음");
  key("i", atok);
  checkPop(pick3.playerId, "조준 중 I 키");
  assert.equal(ui.aim?.uid, one3.uid, "I 키: 조준 유지");
  key("Escape");
  assert.equal(pop(), null, "Esc = 팝오버 먼저 닫기");
  assert.equal(ui.aim?.uid, one3.uid, "조준은 남는다");
  // ⓘ 는 카드를 골랐어도 연다 (조준 유지 · 내지 않음), 다시 = 닫기
  $(`.ls-row[data-pid="${fid}"] .ls-pi-btn`).click();
  checkPop(fid, "조준 중 ⓘ");
  assert.equal(ui.aim?.uid, one3.uid, "ⓘ: 조준 유지");
  assert.equal(S.store.run.lesson.seq, one3.s.lesson.seq, "ⓘ: 내지 않는다");
  assert.ok($(".lesson-screen.aiming"), "조준 표시 그대로");
  $(`.ls-row[data-pid="${fid}"] .ls-pi-btn`).click();
  assert.equal(pop(), null, "ⓘ 다시 = 닫기");
  $(`.ls-row[data-pid="${fid}"] .ls-pi-btn`).click();
  key("Escape");
  assert.equal(pop(), null);
  key("Escape");
  assert.equal(ui.aim, null, "두 번째 Esc = 조준 취소");
  noErrorToast("스탯 보기 — 조준 중");

  // ---------- 고유 카드 모양 (§16.7, L40): 앞면 칩 · 이어 주기 · 자리 옮기기 · 가로지르기 · 둘레 원 — 판정 = 엔진 (UI 는 점 · 선수 · 구역만) ----------
  /** 구역 주입 (슬롯 순서) + 손패 첫 장 = cardId (코치 지원은 뗀다) · 이번 턴 2장 */
  const shapeFix = (base, cardId, zoneList) => {
    const { s, uid } = withHand(base, cardId, 0);
    s.lesson.bench = [];
    s.lesson.zones = Object.fromEntries(s.players.map((p, i) => [p.id, zoneList[i]]));
    if (s.lesson.attach?.cur?.uid === uid) s.lesson.attach.cur = null;
    s.lesson.playsLeft = Math.max(2, s.lesson.playsLeft); // 낸 뒤에도 같은 턴 (옮긴 자리 · 대형을 본다)
    return { s, uid };
  };
  const Z_LINK = ["defense", "defense", "physical", "pass", "dribble", "shoot", "shoot"];
  const Z_MOVE = ["defense", "defense", "physical", "pass", "pass", "shoot", "dribble"];
  const fxOf = (t) => (S.store.run.lesson?.lastFx || []).filter((e) => e.t === t);
  // 앞면: 모양 칩 · 아이콘 · 배율 칩 · 비용 "/명"
  const lk = shapeFix(lesson1, "cd_u_neria", Z_LINK);
  putRun(lk.s);
  const lkFace = cardOf(lk.uid);
  assert.ok(lkFace.classList.contains("sh-link") && lkFace.querySelector(".cf-target.shape .cf-ticon.s-link"), "이어 주기 앞면: 모양 칩 + 아이콘");
  assert.match(lkFace.querySelector(".cf-target").textContent, /^이어 주기$/);
  assert.equal(lkFace.querySelector(".cf-pmult.shape").textContent, "받는 쪽 ×1.3", "배율 칩");
  assert.match(lkFace.querySelector(".cf-cost").textContent, /^체력 −\d+ \/명$/, "두 명이 비용을 낸다 (/명)");
  assert.equal(lkFace.querySelector(".cf-desc").textContent, "주인 체력 +10", "문구: 칩 · 위력 줄과 겹치는 말은 뺀다");
  assert.equal($$(".ls-hand .card-face .cf-pmult").filter((e) => /주 스탯/.test(e.textContent)).length, 0, "주 스탯 구역 ×1.5 칩 없음");
  // 이어 주기 조준: 주인 빛 (끄는 출발점) · 받는 후보 = 엔진 후보 · 안내
  lkFace.click();
  const lkCard = view().hand.find((c) => c.uid === lk.uid);
  const lkOwner = lkCard.ownerId;
  const lkCands = lessonRun.dropCandidates(S.store.run, data, { uid: lk.uid });
  assert.ok($(`.tok[data-id="${lkOwner}"]`).classList.contains("shape-src"), "주인 토큰 = 끄는 출발점");
  assert.deepEqual($$(".tok.cand").map((e) => e.dataset.id).sort(), lkCands.map((c) => c.playerId).sort(), "받는 후보 초록 테 = 엔진 후보");
  assert.match($(".ls-info").textContent, /네리아에서 받을 선수에게 끌어 놓으세요/, "dock 안내");
  // 조준 중 주인 토큰 누르기 = 벤치가 아니다 · 내지도 않는다
  const ownTok = $(`.tok[data-id="${lkOwner}"]`);
  ownTok.querySelector(".tok-face").dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
  window.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
  stubField();
  const ownAt = view().positions[lkOwner];
  ownTok.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: (ownAt.x / 100) * 968, clientY: (ownAt.y / 100) * 392 }));
  assert.equal(S.store.run.lesson.seq, lk.s.lesson.seq, "주인 토큰 누르기 = 내지 않는다");
  assert.deepEqual(S.store.run.lesson.bench, [], "조준 중 주인 토큰 = 벤치가 아니다");
  assert.equal(ui.aim?.uid, lk.uid, "조준 유지");
  // 키보드: → = 첫 받는 후보 → 선 · 대상 2명 · 받는 선수 "+N ×1.3" → Enter
  key("ArrowRight");
  assert.equal(ui.aim.playerId, lkCands[0].playerId, "→ = 받는 후보 (playerId)");
  assert.ok($(".aim-link.on.solid.ok"), "주인 → 받는 선수 선 (이어 주기 = 실선)");
  const lkPv = lessonRun.previewCard(S.store.run, data, { uid: lk.uid, playerId: lkCands[0].playerId, at: lkCands[0].at });
  const recvRow = lkPv.targets.find((t) => t.id === lkCands[0].playerId);
  assert.equal($(`.tok[data-id="${recvRow.id}"] .tok-name`).textContent, `+${recvRow.gain} ×1.3`, "받는 선수 말풍선 +N ×1.3");
  assert.match($(".ls-info .ls-cand").textContent, /네리아 → /, "후보 라벨 = 주인 → 받는 선수");
  key("Enter");
  assert.equal(S.store.run.lesson.seq, lk.s.lesson.seq + 1, "Enter = 내기");
  assert.deepEqual(fxIds(), [lkOwner, lkCands[0].playerId].sort(), "대상 = 주인 + 받는 선수 (엔진)");
  assert.deepEqual(fxOf("pass").map((e) => [e.from, e.to]), [[lkOwner, lkCands[0].playerId]], "pass fx");
  await notBusy();
  // 받는 선수를 누르면 그 선수에게 (클릭)
  putRun(lk.s);
  cardOf(lk.uid).click();
  stubField();
  const lkLast = lkCands[lkCands.length - 1];
  clickField({ x: lkLast.at.x + 0.5, y: lkLast.at.y + 0.8 });
  assert.equal(S.store.run.lesson.seq, lk.s.lesson.seq + 1, "받는 선수 위 클릭 = 내기");
  assert.deepEqual(fxIds(), [lkOwner, lkLast.playerId].sort(), "누른 선수가 받는다");
  await notBusy();
  noErrorToast("이어 주기");

  // 자리 옮기기 (타리아): 숫자 3 = 슈팅 구역 → 유령 · 화살표 · 바닥 강조 → Enter → move fx · 새 구역
  const mv = shapeFix(lesson1, "cd_u_taria", Z_MOVE);
  putRun(mv.s);
  const mvFace = cardOf(mv.uid);
  assert.ok(mvFace.querySelector(".cf-ticon.s-move") && /^체력 −\d+$/.test(mvFace.querySelector(".cf-cost").textContent), "자리 옮기기 앞면: 아이콘 · 비용 한 명");
  mvFace.click();
  const mvOwner = view().hand.find((c) => c.uid === mv.uid).ownerId;
  assert.match($(".ls-info").textContent, /타리아를 옮길 구역에 놓으세요/);
  key("3");
  assert.equal(ui.aim.zone, "shoot", "3 = 슈팅 구역 (zone)");
  assert.ok($(".aim-ghost.on") && $(".aim-arrow.on.ok") && $('.zone-pad.aim[data-zone="shoot"]'), "유령 · 화살표 · 놓을 구역 바닥");
  const mvPv = lessonRun.previewCard(S.store.run, data, { uid: mv.uid, zone: "shoot" });
  assert.match($(".aim-tag").textContent, new RegExp(`^\\+${mvPv.targets[0].gain} ×1\\.3 · 기본 `), "꼬리표 +N ×1.3 · 기본 ±b");
  assert.match($(".ls-info .ls-zsum").textContent, /기본 훈련/, "dock: 기본 훈련 변화");
  key("Enter");
  assert.equal(S.store.run.lesson.seq, mv.s.lesson.seq + 1, "Enter = 내기");
  assert.deepEqual(fxOf("move").map((e) => [e.id, e.to]), [[mvOwner, "shoot"]], "move fx");
  assert.equal(S.store.run.lesson.zones[mvOwner], "shoot", "주인이 슈팅 구역으로");
  await notBusy();
  assert.equal(Number($(`.tok[data-id="${mvOwner}"]`).dataset.x), view().positions[mvOwner].x, "토큰 = 옮긴 뒤 자리");
  // 구역 바닥 클릭 = 그 구역
  putRun(mv.s);
  cardOf(mv.uid).click();
  stubField();
  clickField(data.lesson.zones.centers.defense);
  assert.equal(S.store.run.lesson.zones[mvOwner], "defense", "수비 구역 바닥 클릭 = 수비 구역으로");
  await notBusy();
  noErrorToast("자리 옮기기");

  // 가로지르기 (미르카 편성): 지금 구역 숫자는 무시 · 다른 구역 → 두 행 (두 스탯)
  const mkBase = walkLesson(data, { seed: "lesson-ui", slots: { FW2: "ch_cat_trickster" }, until: (s) => s.phase === "lesson" && s.lesson.status === "playing" }).state;
  const mk = shapeFix(mkBase, "cd_u_mirka", Z_MOVE);
  putRun(mk.s);
  cardOf(mk.uid).click();
  const mkOwner = view().hand.find((c) => c.uid === mk.uid).ownerId;
  assert.equal(S.store.run.lesson.zones[mkOwner], "dribble");
  assert.ok($('.zone-pad.from[data-zone="dribble"]'), "지금 구역 바닥 (.from)");
  key("5");
  assert.equal(ui.aim.zone ?? null, null, "지금 구역(5 = 드리블) 숫자는 무시");
  key("3");
  assert.equal(ui.aim.zone, "shoot");
  assert.match($(".aim-tag").textContent, /드리블 · \+\d+ 슈팅/, "꼬리표 +a 드리블 · +b 슈팅");
  key("Enter");
  assert.deepEqual(S.store.run.lesson.lastFx.filter((e) => e.t === "gain" && e.id === mkOwner).map((e) => e.stat), ["dribble", "shoot"], "두 행 = 두 스탯");
  assert.equal(S.store.run.lesson.zones[mkOwner], "shoot", "놓은 구역에 선다");
  await notBusy();
  noErrorToast("가로지르기");

  // 둘레 작은 원 (도르비나): 카드를 누르는 순간 주인 중심 원 · 대상 = 엔진 · 실패 없음 → 한 번 더 = 내기
  const wl = shapeFix(lesson1, "cd_u_dorbina", ["defense", "defense", "defense", "pass", "pass", "shoot", "physical"]);
  putRun(wl.s);
  cardOf(wl.uid).click();
  const wlPv = lessonRun.previewCard(S.store.run, data, { uid: wl.uid });
  assert.ok($(".aim-circle.on.owner.sz-small"), "주인 둘레 작은 원");
  assert.deepEqual($$(".tok.target").map((e) => e.dataset.id).sort(), [...new Set(wlPv.targets.map((t) => t.id))].sort(), "원 안 = 엔진 대상");
  assert.equal(wlPv.failRate, 0, "실패 없음");
  assert.match($(".ls-info").textContent, /실패 없음/);
  cardOf(wl.uid).click();
  assert.equal(S.store.run.lesson.seq, wl.s.lesson.seq + 1, "두 번 누르기 = 내기");
  await notBusy();
  // 구역 전원 (아델린): 주인 구역 바닥 강조
  const az = shapeFix(lesson1, "cd_u_adeline", ["defense", "physical", "physical", "physical", "pass", "shoot", "dribble"]);
  putRun(az.s);
  cardOf(az.uid).click();
  assert.ok($('.zone-pad.aim[data-zone="physical"]'), "구역 전원: 주인 구역 바닥");
  assert.equal($$(".tok.target").length, 3, "그 구역 3명");
  key("Escape");
  assert.ok(!$(".zone-pad.aim"), "Esc = 강조 지움");
  // 크로스 (L47): 슈팅 구역이 비면 드리블 구역 바닥 강조 · 슈팅 · 드리블 둘 다 비면 낼 수 없음 띠
  const cf = shapeFix(lesson1, "cd_u_ulrika", ["defense", "defense", "physical", "pass", "pass", "shoot", "dribble"]);
  putRun(cf.s);
  assert.ok(!cardOf(cf.uid).querySelector(".cf-reason"), "크로스: 드리블 구역에 받을 선수가 있으면 낼 수 있다");
  cardOf(cf.uid).click();
  assert.ok($('.zone-pad.aim[data-zone="dribble"]') && !$('.zone-pad.aim[data-zone="shoot"]'), "크로스 대체: 드리블 구역 바닥");
  key("Escape");
  const cx = shapeFix(lesson1, "cd_u_ulrika", ["defense", "defense", "physical", "pass", "pass", "shoot", "pass"]);
  putRun(cx.s);
  assert.match(cardOf(cx.uid).querySelector(".cf-reason").textContent, /슈팅·드리블 구역에 받을 선수가 없습니다/, "크로스: 낼 수 없는 이유");
  noErrorToast("고유 카드 모양");

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
  // 클리어 (퍼펙트 아님) 보상이 나오는 첫 시드 — 밸런스가 바뀌면 (L40 · L48 등) 시드 "lesson-ui" 의 레슨이 모두 퍼펙트일 수 있다 (L48: 숫자 시드 1 에서 나온다)
  const clearSeeds = ["lesson-ui", "lesson-ui-2", "lesson-ui-3", 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let clearWalk = null;
  for (const seed of clearSeeds) {
    clearWalk = walkLesson(data, { seed, until: (s) => s.phase === "reward" && s.pendingReward?.result?.status === "clear" && s.pendingReward.offer.length > 0 });
    if (clearWalk) break;
  }
  assert.ok(clearWalk, `클리어 보상 상태 (시드 ${clearSeeds.length}개 안에서)`);
  // 코치 수업 (§18.6) 이 남은 보상이면 화면 버튼으로 감독 추천대로 받고 (선수 칩 → [가르치기] / [배우지 않기]) 그 뒤 상태를 돌려준다
  const teachUi = (st) => {
    putRun(st);
    for (let i = 0; i < 12 && $(".reward-modal .rw-teach"); i++) {
      const tr = S.manager.recommendTeach(S.store.run, data);
      if (tr.playerId) {
        $(`.rw-teach-pl[data-pid="${tr.playerId}"]`).click();
        $(".rw-teach-ok").click();
      } else $(".rw-teach-skip").click();
    }
    assert.ok(!$(".reward-modal .rw-teach"), "수업이 모두 끝남");
    return clone(S.store.run);
  };

  // =====================================================================
  // 코치 수업 (§18.6): 문구 · 조사 · 선수 칩 (회색 이유 · 추천) · [가르치기] → 습득 · 다음 수업 · 가득 → 바꿀 스킬 · 받지 않기 · 받을 선수 없음
  // =====================================================================
  assert.equal(OL.objParticle("파워 슛"), "을", "조사: 받침 있음");
  assert.equal(OL.objParticle("스루 패스"), "를", "조사: 받침 없음");
  assert.equal(OL.objParticle("함성"), "을");
  assert.equal(OL.objParticle("XYZ"), "을(를)", "한글이 아니면 을(를)");
  // 수업 2개가 남았고, 첫 수업을 받을 수 있는 선수가 2명 이상 (하나를 가득으로 만들어도 빈 슬롯 추천이 남게) 인 보상 상태
  const teachOk = (s) => {
    if (s.phase !== "reward" || !(s.pendingReward.offer.length > 0)) return false;
    const tl = (s.pendingReward.teach || []).filter((t) => t.result === null);
    return tl.length >= 2 && s.players.filter((p) => lessonRun.canTeachSkill(s, data, tl[0].skillId, p.id).ok).length >= 2;
  };
  let teachWalk = null;
  for (let i = 1; i <= 40 && !teachWalk; i++) teachWalk = walkLesson(data, { seed: i, until: teachOk });
  assert.ok(teachWalk, "수업 2개가 남은 보상 상태");
  const teach0 = teachWalk.state;
  const tList = teach0.pendingReward.teach;
  // 두 수업을 모두 받을 수 있는 선수 하나를 가득 (액티브 3 — 포지션 제한 없는 액티브, 두 수업 스킬 말고) + 패시브 1 로 만들어 바꾸기 줄을 본다.
  // L48: 스킬 칸 3 = 액티브 몫 — 패시브는 칸을 쓰지 않고 바꾸기 줄에도 없다 (엔진 resolveTeach 가 패시브 바꾸기를 거절)
  const freeActs = data.skills.filter((k) => k.kind === "active" && k.learnable && !(k.positions || []).length && k.id !== tList[0].skillId && k.id !== tList[1].skillId).map((k) => k.id);
  const fullP = teach0.players.find((p) => lessonRun.canTeachSkill(teach0, data, tList[1].skillId, p.id).ok && lessonRun.canTeachSkill(teach0, data, tList[0].skillId, p.id).ok);
  assert.ok(fullP && freeActs.length >= 3);
  const fullPas = lessonRun.getPassiveShopView(teach0, data).players.find((x) => x.id === fullP.id).rows.find((r) => r.ok).skillId;
  fullP.learnedSkillIds = [...freeActs.slice(0, 3), fullPas];
  putRun(teach0);
  let tv = lessonRun.getRewardView(S.store.run, data).teach;
  assert.ok($(".reward-modal .rw-teach"), "수업 칸");
  assert.equal($$(".reward-modal .rw-offer").length + $$(".reward-modal .rw-deck").length, 0, "수업 중에는 카드 고르기 · 무료 강화 없음");
  assert.match($(".rw-teach-title").textContent, /코치 수업 1\/2/, "머리 1/2");
  assert.equal($(".rw-teach-line").textContent, `${tv.cur.coachShort} 코치가 '${tv.cur.name}'${OL.objParticle(tv.cur.name)} 가르쳐 줍니다`, "문구");
  assert.ok($(".rw-teach-face"), "코치 얼굴");
  assert.equal($$(".rw-teach-pl").length, 7, "선수 칩 7");
  for (const p of tv.cur.players) {
    const el = $(`.rw-teach-pl[data-pid="${p.id}"]`);
    assert.equal(el.disabled, !p.ok, `${p.name}: 받을 수 있으면 켜짐`);
    if (!p.ok) assert.ok(el.textContent.includes(p.reason), `${p.name}: 회색 이유`);
    if (p.ok && p.full) assert.match(el.textContent, /가득 — 바꾸기/);
  }
  const trec = S.manager.recommendTeach(S.store.run, data);
  assert.ok(trec.playerId, "빈 슬롯 선수 추천");
  assert.ok($(`.rw-teach-pl[data-pid="${trec.playerId}"]`).classList.contains("recommended"), "추천 배지 = recommendTeach");
  assert.equal($$(".rw-teach-pl.selected").length, 0, "미리 고르지 않는다");
  assert.ok($(".rw-teach-ok").disabled, "고르기 전 [가르치기] 꺼짐");
  assert.ok($(".rw-teach-skip").textContent.includes(`SP +${tv.declineSp}`), "[배우지 않기 · SP +20]");
  // 선수 고르기 (모달 안에서만) → [가르치기] → 엔진 습득 · 저장 · 다음 수업 2/2
  const pick1 = trec.playerId;
  const snapT = JSON.stringify(S.store.run);
  $(`.rw-teach-pl[data-pid="${pick1}"]`).click();
  assert.equal(JSON.stringify(S.store.run), snapT, "고르기는 엔진을 부르지 않는다");
  assert.ok($(`.rw-teach-pl[data-pid="${pick1}"]`).classList.contains("selected") && !$(".rw-teach-ok").disabled, "고름 → [가르치기] 켜짐");
  assert.match($(".rw-summary").textContent, /빈 칸에 배웁니다/);
  const okBtn = $(".rw-teach-ok");
  okBtn.click();
  okBtn.click(); // 연타 — 엔진 1번
  const pl1 = S.store.run.players.find((p) => p.id === pick1);
  assert.ok(pl1.learnedSkillIds.includes(tList[0].skillId), "습득 (엔진)");
  assert.equal(S.store.run.pendingReward.teach[0].result, "learned");
  assert.equal(S.store.run.pendingReward.teach[1].result, null, "연타해도 다음 수업은 그대로");
  assert.ok(savedRun().players.find((p) => p.id === pick1).learnedSkillIds.includes(tList[0].skillId), "저장");
  assert.match($(".rw-teach-title").textContent, /코치 수업 2\/2/, "다음 수업 2/2");
  assert.ok($$(".rw-chip.teach").some((c) => c.textContent.includes(pl1.name)), "끝난 수업 칩 (수업 … → 선수)");
  noErrorToast("수업 1");
  // 가득인 선수 → 바꿀 스킬 줄 · 고르기 전 [가르치기] 꺼짐 → 바꾸기 (그 자리)
  tv = lessonRun.getRewardView(S.store.run, data).teach;
  const gray = tv.cur.players.find((p) => !p.ok);
  if (gray) assert.ok($(`.rw-teach-pl[data-pid="${gray.id}"]`).disabled && $(`.rw-teach-pl[data-pid="${gray.id}"]`).textContent.includes(gray.reason), "포지션 · 보유 이유 회색");
  assert.equal($$(".rw-teach-rep").length, 0, "고르기 전 바꿀 스킬 줄 없음");
  assert.match($(`.rw-teach-pl[data-pid="${fullP.id}"]`).textContent, /●●● 가득 — 바꾸기/, "액티브 3 = 가득 (패시브는 세지 않는다)");
  $(`.rw-teach-pl[data-pid="${fullP.id}"]`).click();
  assert.ok($(".rw-teach-rep"), "가득 → 바꿀 액티브 줄");
  assert.equal($$(".rw-teach-rep .rw-rep-btn").length, 3, "바꿀 수 있는 것 = 액티브 3개");
  assert.deepEqual($$(".rw-teach-rep .rw-rep-btn").map((b) => b.dataset.skill), freeActs.slice(0, 3), "패시브는 바꾸기 목록에 없다");
  assert.equal($$(`.rw-rep-btn[data-skill="${fullPas}"]`).length, 0, "패시브 버튼 없음");
  assert.ok($(".rw-teach-ok").disabled, "바꿀 스킬 고르기 전 [가르치기] 꺼짐");
  const repId = freeActs[1];
  $(`.rw-rep-btn[data-skill="${repId}"]`).click();
  assert.ok(!$(".rw-teach-ok").disabled, "바꿀 스킬 고름 → 켜짐");
  assert.match($(".rw-summary").textContent, /→/);
  $(".rw-teach-ok").click();
  assert.deepEqual(S.store.run.players.find((p) => p.id === fullP.id).learnedSkillIds, [freeActs[0], tList[1].skillId, freeActs[2], fullPas], "바꾸기 = 그 자리 (패시브는 그대로)");
  assert.equal(S.store.run.pendingReward.teach[1].replaced, repId);
  // 수업이 모두 끝남 → 카드 고르기
  assert.ok(!$(".rw-teach") && $(".rw-offer .card-face"), "수업 끝 → 카드 고르기");
  assert.equal($$(".rw-chip.teach").length, 2, "수업 칩 2");
  assert.equal(S.store.run.phase, "reward");
  noErrorToast("수업 2");
  // 받지 않기 → SP +20 · 다음 수업
  putRun(teach0);
  const sp0t = S.store.run.skillPoints;
  $(".rw-teach-skip").click();
  assert.equal(S.store.run.skillPoints, sp0t + tv.declineSp, "받지 않기 SP");
  assert.equal(S.store.run.pendingReward.teach[0].result, "declined");
  assert.match($(".rw-teach-title").textContent, /2\/2/);
  assert.ok($$(".rw-chip.teach").some((c) => c.textContent.includes(`SP +${tv.declineSp}`)), "수업 칩 SP");
  // 받을 선수 없음 → 선수 칩 모두 회색 · 안내 · [SP +20 받기] 하나
  const none0 = clone(teach0);
  const fwOnly = data.skills.find((k) => k.kind === "active" && k.learnable && (k.positions || []).length === 1 && k.positions[0] === "FW");
  none0.pendingReward.teach[0].skillId = fwOnly.id;
  for (const p of none0.players) if (p.position === "FW") p.learnedSkillIds = [fwOnly.id];
  putRun(none0);
  assert.equal($$(".rw-teach-pl:not(:disabled)").length, 0, "받을 선수 없음 = 모두 회색");
  assert.match($(".rw-teach-none").textContent, /받을 수 있는 선수가 없습니다/);
  assert.equal($$(".rw-teach-ok").length, 0, "[가르치기] 없음");
  assert.match($(".rw-teach-skip").textContent, /SP \+\d+ 받기/);
  $(".rw-teach-skip").click();
  assert.equal(S.store.run.pendingReward.teach[0].result, "none", "받을 선수 없음 → none");
  noErrorToast("받을 선수 없음");

  const clearReward = teachUi(clearWalk.state);

  // ---------- 클리어: 골격 · 카드 고르기 → [확인] ----------
  putRun(clearReward);
  let rv = lessonRun.getRewardView(S.store.run, data);
  assert.ok($(".lesson-screen.inert") && $("#modal-root .reward-modal"), "보상 = 레슨 화면 inert + 모달");
  assert.match($(".rw-status").textContent, /클리어/, "결과 머리");
  assert.ok($(".rw-score-n").textContent === String(rv.result.score) && $(".rw-score-t").textContent.includes(String(rv.result.target)), "점수 · 목표");
  assert.equal($$(".rw-players .rw-pl").length, 7, "선수 7 상승");
  assert.ok($(".rw-chip.tp").textContent.includes(`+${rv.result.tp}`), "TP 칩");
  // L48: SP 칩 = 이번 레슨 SP 합 (레슨 SP + 힌트 없음 SP) — TP 바로 옆
  assert.ok(rv.result.sp > 0 && rv.result.spLesson > 0, "클리어 = 레슨 SP");
  assert.ok($(".rw-chip.sp") && $(".rw-chip.sp").textContent.includes(`+${rv.result.sp}`), "SP 칩 = result.sp");
  assert.equal($(".rw-chip.tp").nextElementSibling, $(".rw-chip.sp"), "SP 칩은 TP 칩 옆");
  // L48: 선수 힌트 (src "player") = 선수 얼굴 + "울리카 · 측면 질주 Lv1"
  const plHints = rv.result.hints.filter((x) => x.src === "player");
  assert.ok(plHints.length >= 1, "클리어 = 선수 힌트");
  assert.equal($$(".rw-chip.hint .rw-hint-pl").length, plHints.length, "선수 힌트 줄 = src player");
  for (const x of plHints) {
    const el = $(`.rw-chip.hint .rw-hint-pl[data-pid="${x.playerId}"]`);
    assert.ok(el && el.querySelector(".avatar.rw-face"), `${x.playerName}: 선수 얼굴`);
    assert.ok(el.textContent.includes(`${x.playerName} · ${x.name} Lv${x.level}`), `"${x.playerName} · ${x.name} Lv${x.level}"`);
  }
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
  const perf = teachUi(perfectRewardState(data, 1).state);
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
  // 목표치가 낮아 실패 레슨이 드물다 → 마지막 턴의 레슨 점수를 0 으로 두고 턴을 끝내 실패 보상을 만든다
  const lastTurn = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "lesson" && s.lesson?.status === "playing" && s.lesson.turn === s.lesson.turns });
  assert.ok(lastTurn, "레슨 마지막 턴");
  const failT = clone(lastTurn.state);
  failT.lesson.score = 0;
  lessonRun.endLessonTurn(failT, data);
  assert.equal(failT.pendingReward?.result?.status, "fail", "실패 레슨 보상");
  // 실패 레슨도 컷인 수업은 받는다 (§18.3) — 수업 하나를 넣어 수업 → "보상 없음" 순서를 본다
  if (!failT.pendingReward.teach.some((t) => t.result === null)) failT.pendingReward.teach.push({ skillId: "sk_rally_cry", supportId: failT.supports[0].id, src: "cutin", result: null, playerId: null, replaced: null, sp: 0 });
  putRun(failT);
  assert.ok($(".rw-teach") && $(".rw-status").textContent.includes("실패"), "실패 레슨 수업 칸");
  assert.match($(".rw-teach .rw-sec-head").textContent, /다음 주로/);
  const failReward = teachUi(failT);
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
  // 패시브 힌트 (L48): 선수마다 고유 패시브에 힌트 Lv2 → 상점 할인 (원가 취소선 · Lv)
  for (const p of lessonRun.getPassiveShopView(consult0, data).players) {
    const uq = p.rows.find((r) => r.unique);
    if (uq) consult0.hints[uq.skillId] = 2;
  }
  putRun(consult0);
  let cv = lessonRun.getConsultView(S.store.run, data);
  assert.ok($(".consult-screen .consult-cols"), "상담 화면 3단");
  assert.equal($$(".cs-stock .cs-item").length, cv.stock.length, "진열");
  assert.ok($$(".cs-stock .cs-item").every((e, i) => e.textContent.includes(`${cv.stock[i].price} TP`)), "가격");
  assert.equal($$(".cs-deck-grid .mini-card").length, cv.deck.length, "덱 그리드");
  // L48: 패시브 칸 = 선수 7 × 자기 패시브 3 (고유 먼저) — 상점 뷰 (getPassiveShopView) 와 같은 칩 상태 · 액티브는 코치 수업 안내
  const shop0 = lessonRun.getPassiveShopView(S.store.run, data);
  assert.equal($(".cs-skills .og-panel-title").textContent, "패시브 (SP)", "패시브 칸 머리");
  assert.equal($$(".cs-skills .ps-grid.compact .ps-row").length, 7, "선수 7줄");
  assert.equal($$(".cs-skill").length, 0, "옛 스킬 줄 (선수 select) 없음");
  const chipKey = (r) => (r.owned ? "owned" : !r.ok ? "locked" : !r.affordable ? "poor" : "buy");
  for (const p of shop0.players) {
    const chips = $$(`.cs-skills .ps-row[data-pid="${p.id}"] .ps-chip`);
    assert.equal(chips.length, p.rows.length, `${p.name}: 칩 = 자기 패시브 ${p.rows.length}`);
    assert.ok(chips[0].classList.contains("unique") && chips[0].dataset.skill === p.rows.find((r) => r.unique).skillId, `${p.name}: 고유 먼저`);
    for (const r of p.rows) {
      const el = $(`.cs-skills .ps-chip[data-pid="${p.id}"][data-skill="${r.skillId}"]`);
      assert.equal(el.dataset.state, chipKey(r), `${p.name} '${r.name}': 상태 ${chipKey(r)}`);
      assert.equal(el.disabled, chipKey(r) !== "buy", `${p.name} '${r.name}': 살 수 있을 때만 켜짐`);
      assert.ok(el.title.includes(r.description), `${p.name} '${r.name}': 설명은 title`);
      if (chipKey(r) === "buy" && r.level > 0) {
        assert.equal(el.querySelector(".ps-base")?.textContent, String(r.baseCost), `${r.name}: 원가 취소선`);
        assert.ok(el.querySelector(".ps-cost b").textContent === String(r.cost) && el.querySelector(".ps-lv").textContent === `Lv${r.level}`, `${r.name}: 할인 값 · Lv`);
      }
      if (chipKey(r) === "locked") assert.ok(el.textContent.includes(r.reason), `${r.name}: 이유`);
    }
  }
  assert.match($(".cs-active-note").textContent, /액티브 스킬은 레슨 보상에서 코치가 가르쳐 줍니다\./, "액티브 안내");
  assert.ok($(".cs-head .cs-tp").textContent.includes("200") && $(".cs-head .cs-sp").textContent.includes("600"), "TP · SP");
  assert.ok($(".cs-detail.empty"), "고른 카드 없음 안내");
  const crec = S.manager.recommendConsult(S.store.run, data);
  assert.ok($$(".consult-screen .recommended").length >= 1 || crec.op === "end", "추천 배지");
  if (crec.op === "skill") assert.ok($(`.cs-skills .ps-chip[data-pid="${crec.playerId}"][data-skill="${crec.skillId}"]`).classList.contains("recommended"), "패시브 추천 = recommendConsult skill");

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

  // 패시브: 칩 누르기 = consultAction skill 1번 → 습득 · SP −(힌트 할인 값) · 저장 · 칩 ✓ 보유 (다시 그림)
  const shopC = lessonRun.getPassiveShopView(S.store.run, data);
  const buyP = shopC.players.find((p) => p.rows.some((r) => r.affordable && r.level > 0));
  const buyR = buyP.rows.find((r) => r.affordable && r.level > 0);
  const sp0 = S.store.run.skillPoints;
  const passivesBefore = S.store.run.players.map((p) => p.learnedSkillIds.length);
  $(`.cs-skills .ps-chip[data-pid="${buyP.id}"][data-skill="${buyR.skillId}"]`).click();
  assert.ok(S.store.run.players.find((p) => p.id === buyP.id).learnedSkillIds.includes(buyR.skillId), "패시브 습득 (그 선수)");
  assert.deepEqual(S.store.run.players.map((p, i) => p.learnedSkillIds.length - passivesBefore[i]), S.store.run.players.map((p) => (p.id === buyP.id ? 1 : 0)), "다른 선수는 그대로");
  assert.equal(S.store.run.skillPoints, sp0 - buyR.cost, "SP −할인 값");
  assert.ok(buyR.cost < buyR.baseCost, "힌트 할인이 걸린 값");
  assert.ok(savedRun().players.find((p) => p.id === buyP.id).learnedSkillIds.includes(buyR.skillId), "저장");
  assert.equal($(`.cs-skills .ps-chip[data-pid="${buyP.id}"][data-skill="${buyR.skillId}"]`).dataset.state, "owned", "칩 ✓ 보유");
  assert.ok($(".cs-head .cs-sp").textContent.includes(String(sp0 - buyR.cost)), "머리 SP 갱신");
  // [크게 보기] = 같은 상점 모달 (설명 줄) — 닫기
  $(".cs-skills .cs-ps-open").click();
  assert.ok($("#modal-root .modal.passive-shop"), "[크게 보기] → 상점 모달");
  assert.equal($$("#modal-root .ps-row").length, 7, "모달: 선수 7줄");
  assert.equal($$("#modal-root .ps-desc").length, shopC.players.reduce((n, p) => n + p.rows.length, 0), "모달: 칩마다 설명 줄");
  assert.equal($(`#modal-root .ps-chip[data-pid="${buyP.id}"][data-skill="${buyR.skillId}"]`).dataset.state, "owned", "모달: 산 패시브 ✓");
  $("#modal-root .ps-close").click();
  assert.equal($$("#modal-root .overlay").length, 0, "모달 닫힘");
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

  // ---------- 경기 전 준비: 부상 선수는 레슨만 쉬고 경기는 그대로 출전 (§18.1 · §18.6) ----------
  const prep0 = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "prep" }).state;
  for (const p of prep0.players) p.injuredTurns = 0; // 진행 중 부상은 지우고 한 명만 다치게 한다
  prep0.players[2].injuredTurns = 1;
  putRun(prep0);
  assert.ok($(".prep-screen .po-out"), "부상 줄");
  assert.match($(".po-out").textContent, /부상 1명 — 레슨만 쉬고 경기는 그대로 출전/);
  assert.ok(!/유스/.test($(".prep-screen").textContent), "유스 문구 없음");
  assert.ok($(".po-out .po-out-p").textContent.includes(prep0.players[2].name));
  prep0.players[2].injuredTurns = 0;
  putRun(prep0);
  assert.match($(".prep-opp").textContent, /부상 선수 없음 — 7명 모두 출전/);
  noErrorToast("경기 전 준비");

  // =====================================================================
  // L48 패시브: 주 [✦ 패시브 · SP] 버튼 · 배지 → 상점 모달 (칩 상태 · 사기 = 모달 열린 채 · 저장 · 닫으면 다시 그림) · 오류 토스트 ·
  //            주 코치 칸 파티 패시브 · 경기 전 준비 파티 패시브 목록 · [✦ 패시브] (사도 편집 중인 배치 유지)
  // =====================================================================
  const week0 = walkLesson(data, { seed: "lesson-ui", until: (s) => s.phase === "week" && s.turn >= 2 }).state;
  week0.skillPoints = 0;
  putRun(week0);
  let wv = lessonRun.getWeekView(S.store.run, data);
  assert.equal(wv.shopBuyable, 0);
  assert.ok($(".week-bar .ps-open") && /패시브 · SP 0/.test($(".week-bar .ps-open").textContent), "주: [✦ 패시브 · SP 0]");
  assert.ok(!$(".week-bar .ps-badge") && !$(".week-bar .ps-open").classList.contains("has-buy"), "SP 0 → 배지 없음");
  // 고유 패시브마다 힌트 Lv (1 ~ 3 돌아가며) · SP 100 (값 100 넘는 칩 = SP 부족)
  lessonRun.getPassiveShopView(week0, data).players.forEach((p, i) => { const uq = p.rows.find((r) => r.unique && r.ok); if (uq) week0.hints[uq.skillId] = 1 + (i % 3); });
  week0.skillPoints = 100;
  putRun(week0);
  wv = lessonRun.getWeekView(S.store.run, data);
  assert.ok(wv.shopBuyable > 0);
  assert.equal($(".week-bar .ps-open .ps-badge").textContent, String(wv.shopBuyable), "배지 = shopBuyable");
  assert.ok($(".week-bar .ps-open").classList.contains("has-buy") && /SP 100/.test($(".week-bar .ps-open").textContent));
  // 코치 칸 파티 패시브 (이름 · 글, 유대 80 = ★)
  assert.ok(wv.partyPassives.length >= 1, "주 뷰 partyPassives");
  for (const pp of wv.partyPassives) {
    const el = $(`.roster .bond-row[data-coach="${pp.coachId}"] .bond-pp`);
    assert.ok(el && el.textContent.includes(pp.name) && el.textContent.includes(pp.text), `코치 칸: ${pp.coachName} 파티 패시브 '${pp.name}'`);
    assert.equal(el.classList.contains("up"), pp.upgraded);
  }
  // 상점 모달: 선수 7 × 3 — 고유 먼저 ("고유" 표시) · 상태 (보유 / 이유 / SP 부족 / 살 수 있음) · 힌트 할인 · 설명
  $(".week-bar .ps-open").click();
  assert.ok($("#modal-root .modal.modal-xl.passive-shop"), "주: [✦ 패시브] → 상점 모달");
  let sv = lessonRun.getPassiveShopView(S.store.run, data);
  assert.equal($$("#modal-root .ps-row").length, 7, "선수 7줄");
  assert.match($("#modal-root .ps-sp").textContent, /SP 100/);
  for (const p of sv.players) {
    const row = $(`#modal-root .ps-row[data-pid="${p.id}"]`);
    assert.ok(row.querySelector(".ps-who .avatar") && row.querySelector(".ps-who").textContent.includes(p.name) && row.querySelector(".ps-who").textContent.includes(`보유 ${p.owned}/${p.rows.length}`), `${p.name}: 얼굴 · 이름 · 보유 수`);
    const chips = [...row.querySelectorAll(".ps-chip")];
    assert.equal(chips.length, 3, `${p.name}: 칩 3`);
    assert.ok(chips[0].classList.contains("unique") && chips[0].querySelector(".ps-uq").textContent === "고유" && chips.slice(1).every((c) => !c.querySelector(".ps-uq")), `${p.name}: 고유 먼저 · "고유" 표시`);
    for (const r of p.rows) {
      const el = row.querySelector(`.ps-chip[data-skill="${r.skillId}"]`);
      assert.equal(el.dataset.state, chipKey(r), `${p.name} '${r.name}' 상태`);
      assert.equal(el.querySelector(".ps-desc").textContent, r.description, `${r.name}: 설명 줄`);
      if (chipKey(r) === "owned") assert.match(el.textContent, /✓ 보유/);
      if (chipKey(r) === "poor") assert.ok(el.disabled && el.querySelector(".ps-cost.bad"), `${r.name}: SP 부족 = 꺼짐 · 빨간 값`);
      if (r.level > 0 && chipKey(r) !== "owned" && r.ok) {
        assert.equal(el.querySelector(".ps-base").textContent, String(r.baseCost), `${r.name}: 원가 취소선`);
        assert.equal(el.querySelector(".ps-lv").textContent, `힌트 Lv${r.level}`);
      }
    }
  }
  const prec = S.manager.recommendPassive(S.store.run, data);
  assert.ok(prec && $(`#modal-root .ps-chip[data-pid="${prec.playerId}"][data-skill="${prec.skillId}"]`).classList.contains("recommended"), "추천 = manager.recommendPassive");
  // 꺼진 칩 (SP 부족) 누르기 = 아무것도 안 함
  const poorRow = sv.players.flatMap((p) => p.rows.map((r) => ({ p, r }))).find((x) => chipKey(x.r) === "poor");
  assert.ok(poorRow, "SP 100 → SP 부족 칩이 있다");
  {
    const snapP = JSON.stringify(S.store.run);
    $(`#modal-root .ps-chip[data-pid="${poorRow.p.id}"][data-skill="${poorRow.r.skillId}"]`).click();
    assert.equal(JSON.stringify(S.store.run), snapP, "SP 부족 칩 = 엔진 호출 없음");
  }
  // 사기: 추천 칩 → 엔진 buyPassive · SP −값 · 저장 · 모달은 열린 채 (칩 ✓ · 반짝) · 주는 그대로
  const buyRow = sv.players.find((p) => p.id === prec.playerId).rows.find((r) => r.skillId === prec.skillId);
  const wTurn = S.store.run.turn;
  $(`#modal-root .ps-chip[data-pid="${prec.playerId}"][data-skill="${prec.skillId}"]`).click();
  assert.ok(S.store.run.players.find((p) => p.id === prec.playerId).learnedSkillIds.includes(prec.skillId), "모달 사기 → 습득");
  assert.equal(S.store.run.skillPoints, 100 - buyRow.cost, "SP −값");
  assert.ok(savedRun().players.find((p) => p.id === prec.playerId).learnedSkillIds.includes(prec.skillId) && savedRun().skillPoints === 100 - buyRow.cost, "저장");
  assert.equal(S.store.run.phase, "week", "주 그대로");
  assert.equal(S.store.run.turn, wTurn, "주를 쓰지 않는다");
  assert.ok($("#modal-root .passive-shop"), "모달은 열린 채");
  const boughtEl = $(`#modal-root .ps-chip[data-pid="${prec.playerId}"][data-skill="${prec.skillId}"]`);
  assert.ok(boughtEl.dataset.state === "owned" && boughtEl.classList.contains("just") && boughtEl.disabled, "산 칩 = ✓ 보유 (반짝)");
  assert.match($("#modal-root .ps-sp").textContent, new RegExp(`SP ${100 - buyRow.cost}`), "모달 SP 갱신");
  assert.ok($$("#toast-root .toast-info").some((e) => e.textContent.includes(buyRow.name)), "로그 토스트");
  assert.ok(/SP 100/.test($(".week-bar .ps-open").textContent), "닫기 전 배경은 그대로");
  $("#modal-root .ps-close").click();
  assert.equal($$("#modal-root .overlay").length, 0, "닫기");
  wv = lessonRun.getWeekView(S.store.run, data);
  assert.ok(new RegExp(`SP ${100 - buyRow.cost}`).test($(".week-bar .ps-open").textContent), "닫으면 주 화면 다시 그림 (SP)");
  assert.equal($(".week-bar .ps-badge")?.textContent ?? "0", String(wv.shopBuyable || 0), "배지 갱신");
  noErrorToast("패시브 상점 (주)");
  // 오류: 이미 가진 패시브를 다시 사기 → 오류 토스트 · 상태 그대로 · false
  const snapW = JSON.stringify(S.store.run);
  assert.equal(S.actions.buyPassive({ skillId: prec.skillId, playerId: prec.playerId }), false, "실패 = false");
  assert.equal(JSON.stringify(S.store.run), snapW, "실패 = 상태 그대로");
  assert.ok($$("#toast-root .toast-error").some((e) => /살 수 없습니다/.test(e.textContent)), "오류 토스트 (엔진 문구)");
  for (const e of $$("#toast-root .toast")) e.remove();
  consoleErrors.length = 0; // safe() 가 남긴 의도한 오류
  // 유대 80 코치 = ★ 금색
  const w80 = clone(S.store.run);
  w80.supports[0].bond = data.lesson.bond.upgradeAt;
  putRun(w80);
  assert.ok($(`.roster .bond-row[data-coach="${w80.supports[0].id}"] .bond-pp.up`)?.textContent.includes("★"), "유대 80 = ★");

  // 경기 전 준비: 왼쪽 칸 파티 패시브 목록 · 편집기 아래 [✦ 패시브] — 사도 편집 중인 배치 · 전술은 그대로, 상단 바 SP 만 갱신
  const prepP = clone(prep0);
  prepP.skillPoints = 300;
  prepP.supports[0].bond = data.lesson.bond.upgradeAt;
  putRun(prepP);
  const pv = lessonRun.getPrepView(S.store.run, data);
  assert.ok(pv.partyPassives.length >= 1 && pv.shopBuyable > 0);
  assert.equal($$(".prep-opp .po-party .pp-item").length, pv.partyPassives.length, "준비: 파티 패시브 = 편성 코치");
  assert.match($(".prep-opp .po-party").textContent, /이번 경기 내내/);
  for (const pp of pv.partyPassives) {
    const el = $(`.prep-opp .pp-item[data-coach="${pp.coachId}"]`);
    assert.ok(el.querySelector(".avatar") && el.querySelector(".pp-name").textContent === pp.name && el.querySelector(".pp-text").textContent === pp.text, `준비: ${pp.coachName} — 얼굴 · 이름 · 글`);
    assert.equal(!!el.querySelector(".pp-up"), pp.upgraded, `준비: ${pp.name} 유대 80 표시`);
    if (!pp.upgraded && pp.text80) assert.ok(el.querySelector(".pp-80") && el.title.includes(pp.text80), `준비: ${pp.name} 유대 80 글`);
  }
  assert.equal($(".prep-edit .ps-open .ps-badge").textContent, String(pv.shopBuyable), "준비: [✦ 패시브] 배지");
  const pDf2 = $('.prep-edit .lu-slot[data-slot="DF2"]').dataset.pid;
  const pMf1 = $('.prep-edit .lu-slot[data-slot="MF1"]').dataset.pid;
  $('.prep-edit .lu-slot[data-slot="DF2"]').click();
  $('.prep-edit .lu-slot[data-slot="MF1"]').click(); // 탭으로 맞바꾸기 (편집기 안에서만)
  assert.equal($('.prep-edit .lu-slot[data-slot="MF1"]').dataset.pid, pDf2, "준비: 편집 중 맞바꿈");
  $(".prep-edit .ps-open").click();
  assert.ok($("#modal-root .passive-shop"), "준비: 상점 모달");
  const prec2 = S.manager.recommendPassive(S.store.run, data);
  const cost2 = lessonRun.getPassiveShopView(S.store.run, data).players.find((p) => p.id === prec2.playerId).rows.find((r) => r.skillId === prec2.skillId).cost;
  $(`#modal-root .ps-chip[data-pid="${prec2.playerId}"][data-skill="${prec2.skillId}"]`).click();
  assert.equal(S.store.run.phase, "prep");
  assert.equal(S.store.run.skillPoints, 300 - cost2, "준비: SP −값");
  $("#modal-root .ps-close").click();
  assert.equal($('.prep-edit .lu-slot[data-slot="MF1"]').dataset.pid, pDf2, "준비: 사고 닫아도 편집 중인 배치 그대로");
  assert.equal($('.prep-edit .lu-slot[data-slot="DF2"]').dataset.pid, pMf1);
  assert.ok($(".prep-screen .topbar").textContent.includes(`SP ${300 - cost2}`), "준비: 상단 바 SP 갱신");
  assert.ok(new RegExp(`SP ${300 - cost2}`).test($(".prep-edit .ps-open").textContent), "준비: 버튼 SP 갱신");
  $(".prep-edit .prep-go").click();
  assert.equal(S.store.run.phase, "match", "준비: [경기 시작]");
  assert.ok(S.store.run.players.find((p) => p.id === pDf2).slot === "MF1", "준비: 사기 전에 맞바꾼 배치로 경기");
  noErrorToast("패시브 (준비)");
  S.store.screen = "start"; // 경기 화면 타이머를 멈춘다 (render 가 matchUi.timer 를 지운다)
  S.render();
  assert.deepEqual(consoleErrors, [], "console.error 없음");
});
