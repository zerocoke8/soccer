// test/d25Cam.test.mjs — 2.5D 경기 화면 카메라 (docs/SPRITE_25D_PLAN.md §5 · §6 — D2, jsdom): 테스트용 store.setD25ForTest(true) 로 켜고
// tools/scenarios.mjs 의 장면 상태를 주입한다. .w-cam 의 transform (translate(W/2 − z·cx, H/2 − z·cy) scale(z)) · --cam-z · --t-cam 을 본다.
//   자동 킥오프 = 풀코트 (z 1) → 첫 비트 재배치 = 공 따라가기 (4배속 1.2) · 공이 창 안 / 수동 킥오프 배치 (d25_2v1) = 잠깐 풀코트 → 결정 확대 2배
//   (0.35초) · 듀얼 둘이 창 안 → 카드 결정 → 액션 (지금 z) → 재배치 = 따라가기 → 다시 결정 확대 / ⏭ = 풀코트 순간 /
//   줄인 움직임 = 카메라도 순간 (--t-cam 0ms) / 평면 모드는 카메라 없음.
// jsdom 이 없으면 건너뛴다. 평면 경기 화면 검사는 test/ui.smoke.test.mjs, 2.5D 화면 구조는 test/d25Ui.test.mjs (고치지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const V = await import(pathToFileURL(path.join(ROOT, "js/ui/view25.js")).href);

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 15) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}
const W = 1244; // jsdom = 레이아웃 없음 → 경기 화면 기본 필드 영역 (screens/match.js)
const H = 528;
/** .w-cam 의 transform → { tx, ty, z, win (월드 창) } */
function camOf(el) {
  const m = /^translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)$/.exec(el?.style.transform || "");
  if (!m) return null;
  const [tx, ty, z] = m.slice(1).map(Number);
  return { tx, ty, z, win: { l: -tx / z, r: (W - tx) / z, t: -ty / z, b: (H - ty) / z } };
}
const pos = (el) => {
  const m = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el?.style.transform || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const inWin = (p, win) => p && p[0] > win.l && p[0] < win.r && p[1] > win.t && p[1] < win.b;

test("jsdom: 2.5D 카메라 — 풀코트 · 공 따라가기 (4배속 1.2) · 결정 확대 2배 · 결정 뒤 따라가기 · ⏭ 풀코트 · 줄인 움직임 순간", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
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
  g.fetch = dataFetch(ROOT);
  t.after(() => {
    ST.setD25ForTest(null);
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  const S = window.__soccer;
  assert.ok(S && S.store.data, "데이터 로드됨");
  const ui = S.store.matchUi;
  const { loadData, buildScenarioState, SCENARIOS } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = loadData();
  const inject = (name, { auto = false } = {}) => {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    ui.auto = auto;
    ui.speed = 4;
    ui.intervene = false;
    S.store.run = prep.runState;
    S.store.match = prep.matchState;
    S.store.screen = "run";
    S.render();
    const scr = doc.querySelector(".match-screen");
    return {
      scr,
      cam: () => camOf(scr.querySelector(".w-cam")),
      tcam: () => scr.querySelector(".pitch").style.getPropertyValue("--t-cam"),
      camz: () => scr.querySelector(".m-field").style.getPropertyValue("--cam-z"),
    };
  };

  ST.setD25ForTest(true);
  // ---- 자동 킥오프 (경기 첫 장면): 풀코트 → 첫 비트 재배치 = 공 따라가기 (4배속 1.2) ----
  {
    const { scr, cam, tcam, camz } = inject("d25_kickoff", { auto: true });
    assert.ok(scr.classList.contains("d25"));
    assert.equal(scr.querySelector(".w-cam").style.transform, "translate(0px, 0px) scale(1)", "킥오프 배치 = 풀코트 (z 1)");
    assert.equal(camz(), "1");
    assert.equal(tcam(), "0ms", "화면 열기 = 순간");
    assert.match(scr.querySelector(".w-sky").style.transform, /^translate\(0px, 0px\)$/, "하늘 = 이동 0");
    // 첫 비트 (T.start · 4배속 175ms 뒤): 액션은 지금 z (1 = 전체), 재배치 = 따라가기 1.2
    const f = await until(() => { const c = cam(); return c && c.z === V.CAM.Z_FOLLOW_FAST ? c : null; }, 6000);
    assert.ok(f, `재배치 뒤 공 따라가기 z 1.2 (지금 ${scr.querySelector(".w-cam").style.transform})`);
    assert.equal(camz(), "1.2", "--cam-z = z (글자 1 / z)");
    assert.equal(tcam(), `${Math.round(650 / 4)}ms`, "재배치와 같은 길이 (--t-move · 4배속)");
    const ball = scr.querySelector(".m-ball");
    assert.ok(inWin(pos(ball), f.win), `공이 카메라 창 안 ${pos(ball)} ${JSON.stringify(f.win)}`);
    // 하늘 = 카메라 이동의 30%
    const sky = pos(scr.querySelector(".w-sky"));
    assert.ok(Math.abs(sky[0] - f.tx * V.CAM.SKY) < 0.11 && Math.abs(sky[1] - f.ty * V.CAM.SKY) < 0.11, `하늘 시차 ${sky} ≈ 0.3 × (${f.tx}, ${f.ty})`);
    // 자동 진행 중에는 결정 확대 (2배) 가 없다: 몇 비트 동안 z ∈ { 1, 1.2 }
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < 1500) { const c = cam(); if (c) seen.add(c.z); await wait(20); }
    for (const z of seen) assert.ok(z === 1 || z === V.CAM.Z_FOLLOW_FAST, `자동 진행 z ${z}`);
    S.actions.resetToStart();
  }

  // ---- 사람 수비 결정 (d25_decide_defense — 킥오프 배치가 아니다): 화면을 열자마자 결정 확대 2배 (순간) ----
  {
    const { scr, cam, tcam, camz } = inject("d25_decide_defense");
    const c = cam();
    assert.equal(c.z, V.CAM.Z_DECIDE, `사람이 고를 차례 = 결정 확대 2배 (${scr.querySelector(".w-cam").style.transform})`);
    assert.equal(camz(), "2", "--cam-z = 2 (글자 1/2)");
    assert.equal(tcam(), "0ms", "화면 열기 = 순간");
    const view = S.match.getMatchView(S.store.match, S.store.data, "home");
    for (const [side, id] of [["away", view.carrier.id], ["home", view.defender.id]]) {
      assert.ok(inWin(pos(scr.querySelector(`.tok[data-side="${side}"][data-id="${id}"]`)), c.win), `듀얼 ${side}:${id} 가 창 안`);
    }
    S.actions.resetToStart();
  }

  // ---- 수동 킥오프 배치 (d25_2v1 — 실루엔 공): 잠깐 풀코트 → 결정 확대 (외치는 선수까지 틀) → 카드 결정 → 액션 · 재배치 = 따라가기 → 다시 결정 확대 ----
  {
    const { scr, cam, tcam, camz } = inject("d25_2v1");
    assert.equal(scr.querySelector(".w-cam").style.transform, "translate(0px, 0px) scale(1)", "화면을 연 킥오프 배치: 잠깐 풀코트");
    const d = await until(() => { const c = cam(); return c && c.z > 1 ? c : null; }, 3000);
    assert.ok(d, `사람이 고를 차례 = 결정 확대 (지금 ${scr.querySelector(".w-cam").style.transform})`);
    assert.ok(d.z >= V.CAM.Z_FOLLOW && d.z <= V.CAM.Z_DECIDE, `결정 틀 z ${d.z} (1.4 ~ 2)`);
    assert.equal(camz(), String(d.z), "--cam-z = z (글자 1 / z)");
    assert.equal(tcam(), `${V.CAM.DECIDE_MS}ms`, "결정 확대 = 0.35초");
    // 듀얼 둘 (공 가진 선수 · 수비) · 에이스의 외침 선수의 발이 창 안, 창은 월드 사각형 안
    const view = S.match.getMatchView(S.store.match, S.store.data, "home");
    const carrier = scr.querySelector(`.tok[data-side="home"][data-id="${view.carrier.id}"]`);
    const defender = scr.querySelector(`.tok[data-side="away"][data-id="${view.defender.id}"]`);
    assert.ok(inWin(pos(carrier), d.win) && inWin(pos(defender), d.win), "듀얼 둘이 창 안");
    const caller = scr.querySelector(".tok.calling");
    assert.ok(caller, "에이스의 외침 (d25_2v1 — 그레타 '줘!')");
    assert.ok(inWin(pos(caller), d.win), "외치는 선수도 창 안 (탭해서 받는 선수로 고를 수 있게)");
    const wr = V.worldRect(W, H);
    assert.ok(d.win.l >= wr.x0 - 0.2 && d.win.r <= wr.x1 + 0.2 && d.win.t >= wr.y0 - 0.2 && d.win.b <= wr.y1 + 0.2, "창 ⊂ 월드");
    // 이름표가 달린 선수는 발이 창 안 (창 밖 선수의 이름표는 달지 않는다)
    for (const el of scr.querySelectorAll(".tok.named")) assert.ok(inWin(pos(el), d.win), `이름표 선수 ${el.dataset.id} 는 창 안`);
    // 받는 선수 탭 (확대 중): 다른 후보를 고르면 틀이 그 선수까지 넓어진다 — 결정 확대 그대로 (1.4 ~ 2, 0.35초), 고른 선수의 발이 창 안
    const other = scr.querySelector(".tok.pickable:not(.picked)");
    assert.ok(other, "고르지 않은 받는 선수 후보");
    other.click();
    const c2 = cam();
    assert.ok(other.classList.contains("picked"), "확대 중 탭 = 받는 선수 고름");
    assert.ok(c2.z >= V.CAM.Z_FOLLOW && c2.z <= V.CAM.Z_DECIDE, `고른 뒤도 결정 틀 (z ${c2.z})`);
    assert.ok(inWin(pos(other), c2.win) && inWin(pos(carrier), c2.win) && inWin(pos(defender), c2.win), "고른 받는 선수 · 듀얼 둘이 창 안");
    assert.equal(tcam(), `${V.CAM.DECIDE_MS}ms`);
    // 카드 결정 (드리블) → 액션 = 지금 z 로 공이 갈 곳 (--t-act) → 재배치 = 따라가기 1.2 (--t-move)
    const db = scr.querySelector('button[data-action="dribble"]');
    assert.ok(db && !db.disabled, "드리블 카드");
    db.click();
    const act = await until(() => (scr.querySelector(".m-field").classList.contains("phase-act") && tcam() === `${Math.round(800 / 4)}ms` ? cam() : null), 3000);
    assert.ok(act, "액션 카메라 (--t-act 200ms)");
    assert.equal(act.z, c2.z, "액션 중 = 지금 z (결정 틀의 z)");
    const mv = await until(() => (scr.querySelector(".m-field").classList.contains("phase-move") ? cam() : null), 3000);
    assert.ok(mv, "재배치");
    assert.ok(mv.z === V.CAM.Z_FOLLOW_FAST || mv.z === 1, `결정 뒤 재배치 = 따라가기 (킥오프면 전체) — z ${mv.z}`);
    // 비트가 끝나고 다시 사람 차례면 결정 확대 (1.4 ~ 2), 아니면 따라가기
    await until(() => !ui.busy, 4000);
    await wait(30);
    const after = cam();
    const v2 = S.match.getMatchView(S.store.match, S.store.data, "home");
    if (v2.needsDecision && !v2.finished) assert.ok(after.z >= V.CAM.Z_FOLLOW && after.z <= V.CAM.Z_DECIDE, `다음 결정 = 결정 확대 (z ${after.z})`);
    // ⏭ = 풀코트 순간
    scr.querySelector(".skip-btn").click();
    assert.equal(scr.querySelector(".w-cam").style.transform, "translate(0px, 0px) scale(1)", "⏭ = 풀코트");
    assert.equal(tcam(), "0ms", "⏭ = 순간");
    assert.equal(camz(), "1");
    assert.ok(doc.querySelector("#modal-root .score-big"), "결과 모달");
    S.actions.resetToStart();
  }

  // ---- 줄인 움직임 (prefers-reduced-motion): 결정 확대도 순간 (--t-cam 0ms) ----
  {
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    try {
      const { scr, cam, tcam } = inject("d25_decide_attack");
      const c = cam();
      assert.ok(c && c.z > 1, "킥오프가 아닌 결정 = 화면을 열자마자 결정 확대");
      // 자동 ON → 사람 차례가 아니다 → 공 따라가기 (평소 0.35초 트랜지션 → 줄인 움직임 = 순간)
      scr.querySelector(".auto-btn").click();
      const f = cam();
      assert.equal(f.z, V.CAM.Z_FOLLOW_FAST, "자동 ON = 따라가기 (4배속 1.2)");
      assert.equal(tcam(), "0ms", "줄인 움직임 = 카메라 순간");
    } finally {
      window.matchMedia = mm;
      S.actions.resetToStart();
    }
  }

  // ---- 평면 모드: 카메라 없음 ----
  ST.setD25ForTest(false);
  {
    const { scr } = inject("d25_2v1");
    assert.equal(scr.querySelector(".w-cam"), null, "평면: 카메라 층 없음");
    assert.equal(scr.querySelector(".m-field").style.getPropertyValue("--cam-z"), "", "평면: --cam-z 없음");
    assert.equal(scr.querySelector(".pitch").style.getPropertyValue("--t-cam"), "");
    S.actions.resetToStart();
  }
});
