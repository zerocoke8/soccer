// test/hexUltUi.test.mjs — 육각 경기 화면의 필살기 (H3 — screens/hexMatch.js 필살기 띠 · 컷인 · 재생 기록 판 2, jsdom).
//   test/hexFlow.test.mjs 와 같은 손 펌프 rAF (프레임마다 16 ms) + 가짜 view (hexPixi.setHexViewFactoryForTest) 로 renderHexMatch 를 바로 띄운다.
//   선수단 = 연습 경기 셋업 (기본 선수단 vs 거울 사본 — 양쪽 7명 모두 필살기, 실루엔 → 그레타 합체기 "바람의 유성").
//   장면은 시드를 박지 않고 엔진으로 찾는다 (사본에 step 을 돌려 그 step 의 이벤트를 본다 — 화면도 같은 입력으로 같은 step 을 한다).
//   띠 7칸 · 이름 · 유형 · 등급 클래스 · 게이지 글 · 누르면 예약 → 다음 step 입력 · 재생 기록 inputs · 컷인 동안 시계 · 턴 멈춤 (등급 길이 ÷ 배속) ·
//   상대 컷인 "상대" · 합체기 이름 카드 · 역컷인은 그 턴 그림 뒤 · ⏭ 은 컷인을 닫는다 · 입력이 든 재생 기록으로 같은 상태 · 결과 표 필살기 · 합체기 ·
//   연습 모드 (저장 없음 · 홈 = 사람) · 캔버스 고리 (frame ult · ultReady).
//   H3 리뷰: 턴 전 컷인 동안 HUD · 띠 · 카메라 · 스프라이트 시계는 step 전 그대로 · 골 배너는 컷인 뒤 · 사람 쪽 합체기 대기 멈춤 + 누름 ·
//   배속을 바꾸면 컷인 남은 길이도 · ⏭ 한 입력 든 재생 기록 · 등급별 컷인 그림 · 합체기 카드 길이 · 역컷인 이름 · '상대'.
// jsdom 이 없으면 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const ST = await imp("js/ui/store.js");
const PX = await imp("js/ui/hexPixi.js");
const SCR = await imp("js/ui/screens/hexMatch.js");
const HM = await imp("js/engine/hexMatch.js");
const LR = await imp("js/engine/lessonRun.js");
const PR = await imp("js/ui/practice.js");

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}
const skip = !JSDOM && "jsdom 미설치";

const data = loadData();
data.portraits = JSON.parse(fs.readFileSync(path.join(ROOT, "data/portraits.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const TICK = 400;
const CUT = { SSR: [400, 1000], SR: [300, 800], R: [200, 600] }; // 경기 첫 필살기: 차지 · 카드 (ms, 1배속)
const CUT_SHORT = { SSR: [300, 900], SR: [250, 700], R: [150, 500] };

/* ---- 장면 찾기 (엔진만) ---- */
const setupOf = (seed) => PR.practiceSetup(LR, data, seed);
const createFrom = (setup) => HM.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
function fillGauges(st, sides) {
  for (const s of sides) for (const lv of Object.values(st.live[s])) if (typeof lv.gauge === "number") lv.gauge = 100;
}
/**
 * 시드들을 돌며 pred(이번 step 이벤트, step 전 상태) 를 처음 만족하는 step 을 찾는다 → { setup, before: 그 step 전 상태 (사본), n: 그 step 전 step 수, evs }.
 * init(st) = 경기를 만든 직후 손으로 놓기 (게이지 · AI 쪽). refill = 매 step 전에 그 쪽 게이지를 가득.
 */
function findStep(pred, { seeds = 40, init = null, refill = null, maxSteps = 2000, prefix = "uu" } = {}) {
  for (let k = 0; k < seeds; k++) {
    const setup = setupOf(`${prefix}-${k}`);
    const st = createFrom(setup);
    if (init) init(st);
    for (let n = 0; n < maxSteps && !st.finished; n++) {
      if (refill) fillGauges(st, refill);
      const before = clone(st);
      const n0 = st.events.length;
      HM.step(st, data);
      const evs = st.events.slice(n0);
      if (pred(evs, before)) return { setup, before, n, evs };
    }
  }
  return null;
}

/* ---- jsdom 한 번 (파일 전체) ---- */
let env = null;
function setup() {
  if (env) return env;
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  for (const n of ["window", "document", "Node", "HTMLElement", "HTMLCanvasElement", "Element", "localStorage", "CustomEvent", "Event"]) g[n] = window[n];
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const raf = { now: 1000, q: new Map(), id: 0 };
  window.requestAnimationFrame = (cb) => { raf.q.set(++raf.id, cb); return raf.id; };
  window.cancelAnimationFrame = (id) => { raf.q.delete(id); };
  const views = { last: null, frames: 0 };
  PX.setHexViewFactoryForTest(() => ({
    renderer: "webgl", dirty: true,
    draw(frame, cam, opts) { views.last = frame; views.cam = cam; views.opts = opts; views.frames++; },
    destroy() {}, isLost() { return false; },
  }));
  const errors = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  const doc = window.document;
  const calls = []; // HM.step 에 들어간 입력 (null 포함)
  const hmSpy = { ...HM, step: (s, d, input) => { calls.push(input ?? null); return HM.step(s, d, input); } };
  const ctx = {
    store: ST.store, data, hexMatch: hmSpy, run: { getMatchSetup: () => ctx.setup }, setup: null,
    actions: { finishMatch: () => {}, resetToStart: () => {} },
  };
  env = { window, doc, raf, views, errors, calls, ctx, root: doc.getElementById("app"), modalRoot: doc.getElementById("modal-root") };
  return env;
}

function closeModal() {
  env.modalRoot.replaceChildren();
}

async function pump(ms, dt = 16) {
  const { raf } = env;
  const n = Math.ceil(ms / dt);
  for (let i = 0; i < n; i++) {
    raf.now += dt;
    const cbs = [...raf.q.values()];
    raf.q.clear();
    for (const cb of cbs) cb(raf.now);
    await null;
    await null;
  }
}
/** pred 가 참이 될 때까지 (최대 ms) — 걸린 ms (못 찾으면 -1) */
async function pumpUntil(pred, ms = 5000, dt = 16) {
  for (let t = 0; t <= ms; t += dt) {
    if (pred()) return t;
    await pump(dt, dt);
  }
  return -1;
}
function leave() {
  env.root.replaceChildren();
  env.modalRoot.replaceChildren();
}
const dbg = () => SCR.hexViewDebug();
const scrOf = () => env.root.querySelector(".hex-screen");
const btns = () => [...scrOf().querySelectorAll(".hx-ult > .hx-ult-btn")];
const btnOf = (id) => scrOf().querySelector(`.hx-ult-btn[data-player="${id}"]`);
const labelOf = (id) => btnOf(id).querySelector(".hx-ult-st").textContent;
const cutEl = () => scrOf().querySelector(".m-cutin.show .cut");

/**
 * 상태 st (step n 번 한 것) 로 화면을 띄운다. practice = 연습 모드 (save: null · stateKey practiceMatch), 아니면 런 모드 (KEYS.hexMatch 재생 기록).
 */
function mount(setup, st, n, { speed = 1, practice = false, inputs = [] } = {}) {
  leave();
  env.ctx.setup = setup;
  env.ctx.matchMode = practice ? {
    label: "연습 경기", getSetup: () => setup, stateKey: "practiceMatch", save: null, onFinish: () => {}, exits: [{ label: "나가기", onClick: () => {} }],
  } : undefined;
  ST.store[practice ? "practiceMatch" : "hexMatch"] = st;
  if (!practice) ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: n, inputs });
  ST.store.matchUi.speed = speed;
  ST.store.matchUi.moments = false; // H3.5 결정의 순간 끔 (H3 필살기 띠 · 합체기 대기 알림 = [결정 OFF] 흐름 — 장면 멈춤은 test/hexMomentUi.test.mjs)
  env.calls.length = 0;
  SCR.renderHexMatch(env.root, env.ctx);
  assert.ok(scrOf(), "육각 화면");
  return scrOf();
}

test("필살기 띠: 7칸 (포메이션 순서 · 이름 · 유형 · 등급 클래스) · 게이지 글 · 누르면 예약 → 다음 step 입력 · 재생 기록 · 우리 컷인 · 되살리기", { skip }, async () => {
  setup();
  const su = setupOf("uu-tap");
  const st = createFrom(su);
  for (let i = 0; i < 3; i++) HM.step(st, data);
  const scr = mount(su, st, 3);
  assert.ok(scr.querySelector(":scope > .hx-ult"), "화면 바로 아래 .hx-ult");
  assert.ok(scr.querySelector(":scope > .m-cutin"), "컷인 층");
  assert.equal(scr.lastElementChild.className.split(" ")[0], "m-cutin", "컷인 층은 맨 위");
  const list = HM.ultimateList(st, data, "home");
  assert.equal(btns().length, 7, "7칸");
  btns().forEach((b, i) => {
    const u = list[i];
    assert.equal(b.dataset.player, u.playerId, "포메이션 칸 순서");
    assert.equal(b.querySelector(".hx-ult-nm").textContent, st.home.players.find((p) => p.id === u.playerId).name, "선수 이름");
    assert.ok(b.classList.contains(`ut-${u.type}`) && b.classList.contains(`tier-${u.tier}`), `유형 · 등급 클래스 ${b.className}`);
    assert.ok(b.title.includes(u.name) && b.title.includes(u.line), "title = 스킬 이름 · 대사");
    assert.ok(b.querySelector(".hx-ult-face"), "얼굴 칸");
    assert.ok(b.querySelector(".hx-ult-face > img.hx-ult-img"), "초상 그림 (data.portraits)");
  });
  assert.deepEqual(btns().map((b) => b.dataset.type).sort(), ["defense", "dribble", "pass", "pass", "save", "shot", "team"], "기본 선수단 유형");
  // 게이지 글: 충전 n% (엔진 게이지 그대로) — 몇 턴 흘러도 같이 바뀐다
  const pctOf = (id) => `충전 ${Math.floor(st.live.home[id].gauge)}%`;
  for (const u of list) assert.equal(labelOf(u.playerId), pctOf(u.playerId));
  await pump(900 + TICK * 6);
  assert.ok(dbg().steps >= 8, "흐른다");
  for (const u of list) assert.equal(labelOf(u.playerId), pctOf(u.playerId), "턴마다 게이지 글");
  // 준비 전 버튼은 눌러도 아무것도 (입력 줄 없음)
  const team = list.find((u) => u.type === "team").playerId;
  btnOf(team).click();
  assert.equal(dbg().ult?.queued?.length ?? 0, 0);
  assert.equal(labelOf(team), pctOf(team));
  // 입력 없이 돌다가 팀 필살기 (아델린) 게이지가 저절로 가득 찬 상태로 다시 띄운다 → "지금!" (팀 = 켜는 턴에 바로).
  //   손으로 채우지 않는다 — 아래 되살리기 (재생 기록 = 시드 + 입력) 가 같은 상태를 만들어야 하므로
  const full = findStep((evs, before) => before.live.home[team].gauge >= 100 && !before.finished, { seeds: 10, prefix: "uu-tap", maxSteps: 290 });
  assert.ok(full, "팀 필살기 게이지가 가득 차는 경기");
  const su2 = full.setup;
  const st2 = clone(full.before);
  mount(su2, st2, full.n);
  assert.equal(labelOf(team), "지금!", "팀 필살기 = 지금!");
  await pump(32);
  assert.ok(btnOf(team).classList.contains("hx-ready") && btnOf(team).classList.contains("hx-now"));
  assert.ok(env.views.last.players.find((p) => p.key === `home:${team}`).ultReady, "캔버스 가는 분홍 고리 (frame ultReady)");
  assert.ok(!env.views.last.players.find((p) => p.key === `away:m_${team}`).ultReady, "상대는 준비 고리 없음");
  // 누름 → 즉시 예약 (줄) → 다시 누르면 취소 → 또 누르면 예약
  btnOf(team).click();
  assert.equal(labelOf(team), "예약");
  assert.ok(btnOf(team).classList.contains("hx-armed") && btnOf(team).classList.contains("hx-pending"));
  assert.equal(btnOf(team).getAttribute("aria-pressed"), "true");
  btnOf(team).click();
  assert.equal(labelOf(team), "지금!", "줄에서 뺀다");
  btnOf(team).click();
  assert.equal(labelOf(team), "예약");
  const idx = dbg().steps;
  const nCalls = env.calls.length;
  await pumpUntil(() => dbg().steps > idx, 2000);
  assert.deepEqual(env.calls[nCalls], { ultimates: [{ side: "home", playerId: team, op: "arm" }] }, "다음 step 이 입력을 받는다");
  assert.equal(env.calls[nCalls + 1], undefined);
  const saved = JSON.parse(env.window.localStorage.getItem(ST.KEYS.hexMatch));
  assert.deepEqual(saved.inputs, [[idx, "home", team, "arm"]], "재생 기록 inputs = [stepIndex, side, playerId, op]");
  assert.equal(saved.steps, idx + 1);
  assert.equal(saved.version, ST.HEX_SAVE_VERSION); // 판 3 (H3.5)
  // 팀 필살기는 켜는 턴에 바로 → 우리 컷인 (R) — "상대" 없음
  const cut = st2.events.filter((e) => e.type === "cutin" && e.side === "home" && e.turn === st2.turn);
  assert.equal(cut.length, 1);
  assert.equal(cut[0].playerId, team);
  assert.equal(dbg().ult.cut?.kind, "charge", "차지 먼저");
  await pump(CUT.R[0] + 20);
  const el = cutEl();
  assert.ok(el && el.classList.contains("tier-R") && el.classList.contains("side-home") && el.classList.contains("ut-team"), `우리 컷인 카드 ${el?.className}`);
  assert.ok(!el.querySelector("small").textContent.startsWith("상대"), "우리 컷인은 '상대' 없음");
  assert.ok(el.querySelector(".cut-face > img.cut-art"), "R = 얼굴 그림");
  assert.ok(el.querySelector(".cut-face").classList.contains("art-face"), "R = face 판");
  assert.ok(el.querySelector(".cut-line").textContent.includes(cut[0].line), "대사");
  assert.ok(env.views.last.players.find((p) => p.key === `home:${team}`).ult, "쓰는 턴 = 캔버스 분홍 고리 · 빛 (frame ult)");
  assert.equal(labelOf(team), "예약", "컷인 동안 띠는 step 전 그림 (방금 보낸 켬 = 예약) — 그 턴 결과 (발동 중 · 게이지 0) 를 미리 보이지 않는다");
  assert.equal(dbg().ult.hold, true);
  await pump(CUT.R[1] + TICK + 100);
  assert.equal(cutEl(), null, "컷인 끝");
  assert.equal(labelOf(team), "발동 중", "팀 필살기 발동 중");
  btnOf(team).click();
  assert.equal(dbg().ult.queued.length, 0, "발동 중에는 눌러도 무시");
  // 되살리기: 화면을 떠나 store 를 비우고 재생 기록 (입력 포함) 으로 → 같은 상태
  await pump(TICK * 3);
  leave();
  const want = JSON.stringify(st2);
  const sv = JSON.parse(env.window.localStorage.getItem(ST.KEYS.hexMatch));
  assert.equal(sv.inputs.length, 1);
  ST.store.hexMatch = null;
  SCR.renderHexMatch(env.root, env.ctx);
  const back = ST.store.hexMatch;
  assert.ok(back && back !== st2, "재생 기록으로 새로 되살림");
  assert.equal(JSON.stringify(back), want, "입력이 든 재생 기록 → 같은 상태 (JSON 그대로)");
  assert.equal(dbg().steps, sv.steps);
  // ⏭ (입력이 든 경기): 재생 기록 = steps + inputs + skipped → 다시 돌리면 (입력대로 steps 뒤 simulateAuto) 같은 끝 상태
  scrOf().querySelector(".skip-btn").click();
  assert.ok(back.finished);
  const skv = JSON.parse(env.window.localStorage.getItem(ST.KEYS.hexMatch));
  assert.equal(skv.skipped, true);
  assert.deepEqual(skv.inputs, sv.inputs, "입력 기록 그대로");
  assert.deepEqual(back.aiSides, ["home", "away"]);
  assert.equal(JSON.stringify(SCR.hexReplay(HM, createFrom(su2), data, skv)), JSON.stringify(back), "⏭ 한 입력 든 재생 기록 → 같은 끝 상태");
  closeModal();
  leave();
  env.window.localStorage.setItem(ST.KEYS.hexMatch, JSON.stringify(sv));
  // 입력이 없으면 다른 경기 (입력이 실제로 결과를 바꿨다)
  const noInput = SCR.hexReplay(HM, createFrom(su2), data, { steps: sv.steps, inputs: [] });
  assert.notEqual(JSON.stringify(noInput), want, "입력 없이 돌리면 다르다");
  // 판 1 재생 기록 (입력 없음) 도 받는다
  leave();
  ST.store.hexMatch = null;
  env.window.localStorage.setItem(ST.KEYS.hexMatch, JSON.stringify({ version: 1, seed: su2.seed, steps: 5 }));
  SCR.renderHexMatch(env.root, env.ctx);
  assert.equal(ST.store.hexMatch.turn, 5, "판 1 = 입력 없이 5 step");
  leave();
  assert.deepEqual(env.errors, []);
});

test("상대 컷인: 그 턴 그림 전에 차지 + 카드, 그동안 시계 · 턴 멈춤 = 등급 길이 ÷ 배속 · '상대' · 첫 필살기 뒤는 짧게", { skip }, async () => {
  setup();
  // 상대 게이지를 처음부터 가득 → AI 가 켠다. 그 경기의 첫 필살기 step (cutin 1개 · 합체기 · 역컷인 · 골 · 킥오프 없음)
  const found = findStep((evs, before) => {
    const cuts = evs.filter((e) => e.type === "cutin");
    return cuts.length === 1 && cuts[0].side === "away" && !before.events.some((e) => e.type === "cutin")
      && !evs.some((e) => e.type === "combo" || e.reverseCutin || e.type === "goal" || e.type === "kickoff");
  }, { init: (st) => fillGauges(st, ["away"]), seeds: 30, maxSteps: 60 });
  assert.ok(found, "상대 첫 필살기 장면");
  const cut = found.evs.find((e) => e.type === "cutin");
  const [ch, cd] = CUT[cut.tier];
  for (const speed of [1, 2]) {
    const st = clone(found.before);
    const scr = mount(found.setup, st, found.n, { speed });
    const clock0 = () => scr.querySelector(".hx-clock").textContent;
    await pumpUntil(() => dbg().steps === found.n + 1, 3000);
    assert.equal(env.calls.at(-1), null, "사람 입력 없음");
    const turn = st.turn;
    const clockAt = clock0();
    assert.equal(dbg().ult.cut?.kind, "charge", "차지");
    assert.equal(scr.querySelector(".m-cutin.show"), null, "차지 동안은 어두운 판 없음 (캔버스 고리만)");
    assert.ok(env.views.last.players.find((p) => p.key === `away:${cut.playerId}`).ult, "필살기 선수 = frame ult");
    assert.equal(env.views.last.alpha, 0, "그 턴 그림은 처음에서 멈춤");
    await pump(ch / speed + 20);
    const el = cutEl();
    assert.ok(el && el.classList.contains(`tier-${cut.tier}`) && el.classList.contains("side-away"), `.m-cutin.show .cut.tier-${cut.tier} (${el?.className})`);
    assert.ok(el.querySelector("small").textContent.startsWith(`상대 ${st.away.players.find((p) => p.id === cut.playerId).name}`), "상대 컷인 = '상대 이름 · 유형'");
    assert.equal(el.querySelector(".cut-type").textContent.length > 0, true);
    assert.equal(el.style.getPropertyValue("--t-cut"), `${Math.round(cd / speed)}ms`, "카드 길이 ÷ 배속");
    const preset = cut.tier === "R" ? "face" : cut.tier === "SR" ? "bust" : "half";
    assert.ok(el.querySelector(".cut-face").classList.contains(`art-${preset}`), `${cut.tier} = ${preset} 그림`);
    // 컷인 끝 + 한 턴 직전까지 같은 턴 · 시계 그대로
    await pump(cd / speed - 60);
    assert.ok(cutEl(), "아직 카드");
    assert.equal(dbg().steps, found.n + 1);
    assert.equal(st.turn, turn);
    assert.equal(clock0(), clockAt, "시계 멈춤");
    assert.equal(env.views.last.alpha, 0, "카드 동안 보간 0");
    await pump(80);
    assert.equal(cutEl(), null, "카드 끝");
    await pump(TICK / speed - 100);
    assert.equal(dbg().steps, found.n + 1, "그 뒤 한 턴 그림");
    assert.ok(env.views.last.alpha > 0.5, "턴 그림이 움직인다");
    await pump(120);
    assert.equal(dbg().steps, found.n + 2, "다음 step = 차지 + 카드 + 한 턴 뒤");
  }
  // 경기의 두 번째 필살기는 짧은 길이
  const second = findStep((evs, before) => {
    const cuts = evs.filter((e) => e.type === "cutin");
    return cuts.length === 1 && before.events.some((e) => e.type === "cutin") && !evs.some((e) => e.type === "combo" || e.reverseCutin || e.type === "goal");
  }, { init: (st) => fillGauges(st, ["away"]), seeds: 30, maxSteps: 120 });
  assert.ok(second);
  const c2 = second.evs.find((e) => e.type === "cutin");
  mount(second.setup, clone(second.before), second.n);
  await pumpUntil(() => dbg().steps === second.n + 1, 3000);
  await pump(CUT_SHORT[c2.tier][0] + 20);
  assert.equal(cutEl()?.style.getPropertyValue("--t-cut"), `${CUT_SHORT[c2.tier][1]}ms`, "두 번째부터 짧은 카드");
  // 카드 도중 배속 1x → 2x: 남은 카드 길이 · 다음 턴 길이가 반으로
  mount(found.setup, clone(found.before), found.n, { speed: 1 });
  await pumpUntil(() => dbg().steps === found.n + 1, 3000);
  await pumpUntil(() => dbg().ult.cut?.kind === "cut", 2000);
  await pump(160);
  const left = dbg().ult.cut.left;
  scrOf().querySelector(".speed-btn").click();
  await pump(16);
  assert.ok(Math.abs(dbg().ult.cut.left - (left / 2 - 16)) <= 2, `남은 카드 ${left} → ${dbg().ult.cut.left}`);
  const tEnd = await pumpUntil(() => !dbg().ult.cut, 2000);
  assert.ok(tEnd >= left / 2 - 16 - 32 && tEnd <= left / 2 + 16, `카드 끝 ${tEnd} ms`);
  const tNext = await pumpUntil(() => dbg().steps === found.n + 2, 2000);
  assert.ok(tNext >= TICK / 2 - 32 && tNext <= TICK / 2 + 32, `다음 step = 한 턴 ÷ 2 (${tNext} ms)`);
  leave();
  assert.deepEqual(env.errors, []);
});

test("합체기: 두 선수 카드 (1/2 · 2/2) + 이름 카드 '바람의 유성' · 역컷인은 그 턴 그림 뒤 · ⏭ 은 컷인을 닫는다 · 결과 표", { skip }, async () => {
  setup();
  const both = (st) => { HM.setAutoBoth(st); fillGauges(st, ["home", "away"]); };
  const combo = findStep((evs) => evs.some((e) => e.type === "combo"), { init: both, refill: ["home", "away"], seeds: 30, prefix: "uc" });
  assert.ok(combo, "합체기 장면");
  const ce = combo.evs.find((e) => e.type === "combo");
  assert.equal(ce.name, "바람의 유성");
  {
    const st = clone(combo.before);
    mount(combo.setup, st, combo.n);
    await pumpUntil(() => dbg().steps === combo.n + 1, 3000);
    const seen = [];
    for (let t = 0; t < 8000 && dbg().ult.cut; t += 16) {
      const el = cutEl();
      const tag = el ? (el.classList.contains("cut-name") ? "name" : el.classList.contains("part-1") ? "p1" : el.classList.contains("part-2") ? "p2" : "cut") : null;
      if (tag && seen.at(-1) !== tag) {
        seen.push(tag);
        (seen.dur ||= {})[tag] = el.style.getPropertyValue("--t-cut");
        if (tag === "p1") seen.art = el.querySelector(".cut-face").className;
      }
      if (tag === "name" && !seen.nameText) {
        seen.nameText = el.querySelector("b").textContent;
        seen.sub = el.querySelector(".cut-sub").textContent;
        seen.duo = el.querySelectorAll(".cut-duo").length;
      }
      await pump(16);
    }
    const i1 = seen.indexOf("p1");
    assert.ok(i1 >= 0 && seen[i1 + 1] === "p2" && seen[i1 + 2] === "name", `카드 순서 ${seen.join(",")}`);
    assert.equal(seen.nameText, "바람의 유성", "이름 카드");
    const sideTeam = st[ce.side].players;
    assert.equal(seen.sub, `${sideTeam.find((p) => p.id === ce.playerIds[0]).name} → ${sideTeam.find((p) => p.id === ce.playerIds[1]).name}`);
    assert.equal(seen.duo, 2, "두 흉상");
    assert.deepEqual([seen.dur.p1, seen.dur.p2, seen.dur.name], ["1000ms", "1000ms", "1100ms"], "합체기 카드 길이 (1배속)");
    assert.ok(seen.art.includes("art-half"), `합체기 카드 = 반신 (${seen.art})`);
  }
  // 역컷인: 이번 step 이벤트에 reverseCutin — 그 턴의 컷인 · 그림이 끝난 뒤에 .cut-rev
  const rev = findStep((evs) => evs.some((e) => e.reverseCutin) && !evs.some((e) => e.type === "goal"), { init: both, refill: ["home", "away"], seeds: 30, prefix: "ur" });
  assert.ok(rev, "역컷인 장면");
  const re = rev.evs.find((e) => e.reverseCutin);
  {
    const st = clone(rev.before);
    mount(rev.setup, st, rev.n);
    await pumpUntil(() => dbg().steps === rev.n + 1, 3000);
    // 앞 컷인 (있으면) 이 끝날 때까지
    const tPre = await pumpUntil(() => !dbg().ult.cut, 10000);
    assert.ok(tPre >= 0);
    assert.equal(cutEl(), null);
    assert.equal(dbg().ult.post, 1, "역컷인 대기");
    // 그 턴 그림 (한 턴 = 400 ms) 이 끝나야 역컷인 — 그동안 턴 보간이 움직인다
    const tRev = await pumpUntil(() => !!scrOf().querySelector(".m-cutin.show .cut-rev"), 2000);
    assert.ok(tRev >= TICK - 40 && tRev <= TICK + 40, `역컷인은 턴 그림 뒤 (${tRev} ms, 앞 컷인 ${tPre} ms)`);
    assert.equal(env.views.last.alpha, 1, "턴 그림 끝 자리");
    const el = cutEl();
    assert.ok(el && el.classList.contains("cut-rev") && el.classList.contains(`rev-${re.reverseCutin.kind}`) && el.classList.contains("cut-save"), `역컷인 ${el?.className}`);
    assert.equal(el.querySelector("b").textContent, re.reverseCutin.text);
    assert.equal(el.classList.contains(`side-${re.reverseCutin.side}`), true, "막은 쪽");
    const small = el.querySelector("small").textContent;
    assert.equal(small.startsWith("상대 "), re.reverseCutin.side !== "home", `'상대' = 막은 쪽이 사람 쪽이 아닐 때 (${small})`);
    const blocked = re.reverseCutin.combo ? "합체기" : data.skills.find((x) => x.id === re.reverseCutin.skillId).name;
    assert.ok(small.includes(`${blocked} `), `막힌 필살기 이름 (엔진 reverseCutin.skillId) — ${small}`);
    const rf = el.querySelector(".cut-face");
    assert.ok(rf.classList.contains("art-bust") && rf.querySelector("img.cut-art"), "막은 선수 흉상");
    const blocker = st[re.reverseCutin.side].players.find((p) => p.id === re.reverseCutin.playerId);
    assert.ok(rf.querySelector("img.cut-art").src.includes(blocker.charId), "막은 선수 (그 쪽) 그림");
    assert.equal(dbg().steps, rev.n + 1, "역컷인 동안 다음 step 없음");
    assert.equal(el.style.getPropertyValue("--t-cut"), `${re.reverseCutin && !rev.before.events.some((e) => e.reverseCutin) ? 800 : 700}ms`);
    // ⏭ → 컷인 닫힘 · 결과 (필살기 · 합체기 줄)
    scrOf().querySelector(".skip-btn").click();
    assert.equal(scrOf().querySelector(".m-cutin.show"), null, "⏭ = 컷인 닫힘");
    assert.equal(scrOf().querySelector(".m-cutin").children.length, 0);
    await pump(16);
    assert.equal(dbg().ult.cut, null, "컷인 없음");
    assert.ok(st.finished);
    const rows = [...env.modalRoot.querySelectorAll(".stats-table tbody tr")].map((tr) => [...tr.children].map((td) => td.textContent));
    assert.deepEqual(rows.map((r) => r[0]), ["슛", "겨루기 승", "골", "패스 (성공/시도)", "가로채기", "태클 성공", "필살기", "합체기", "MVP"]);
    const r = HM.getResult(st);
    const row = (k) => rows.find((x) => x[0] === k);
    assert.deepEqual(row("필살기").slice(1), [String(r.stats.home.ultimatesUsed), String(r.stats.away.ultimatesUsed)]);
    assert.deepEqual(row("합체기").slice(1), [String(r.stats.home.combos), String(r.stats.away.combos)]);
    assert.ok(btns().every((b) => b.disabled), "끝나면 띠 꺼짐");
    await pump(200);
    assert.equal(scrOf().querySelector(".m-cutin.show"), null, "다시 뜨지 않는다");
  }
  leave();
  assert.deepEqual(env.errors, []);
});

test("역컷인 이름: 여러 턴 날아간 필살 패스가 다음 step 에 막혀도 막힌 필살기 이름 (엔진 reverseCutin.skillId — 같은 step 에 cutin 이 없다) (H3 리뷰 H3S-5 · F8)", { skip }, async () => {
  setup();
  const both = (st) => { HM.setAutoBoth(st); fillGauges(st, ["home", "away"]); };
  const found = findStep((evs) => {
    const e = evs.find((x) => x.reverseCutin && x.reverseCutin.kind === "passCut");
    return !!e && !evs.some((x) => x.type === "cutin" || x.type === "goal");
  }, { init: both, refill: ["home", "away"], seeds: 30, prefix: "urn" });
  assert.ok(found, "다음 step 에 막힌 필살 패스");
  const rc = found.evs.find((x) => x.reverseCutin).reverseCutin;
  assert.ok(rc.skillId, "엔진이 막힌 필살기를 싣는다");
  mount(found.setup, clone(found.before), found.n);
  await pumpUntil(() => dbg().steps === found.n + 1, 3000);
  assert.ok(await pumpUntil(() => !!scrOf().querySelector(".m-cutin.show .cut-rev"), 2000) >= 0);
  const small = cutEl().querySelector("small").textContent;
  const name = rc.combo ? "합체기" : data.skills.find((x) => x.id === rc.skillId).name;
  assert.ok(small.includes(`${name} 차단`), `'${name} 차단' (${small})`);
  leave();
  assert.deepEqual(env.errors, []);
});

test("턴 전 컷인 동안 그 턴 결과를 미리 보이지 않는다: 점수 · 시계 · ⏭ · 카메라 · 스프라이트 시계는 step 전 그대로 → 컷인 뒤 점수 · '골!' (H3 리뷰 F1 · H3S-1 · H3S-2)", { skip }, async () => {
  setup();
  // 게이지는 처음에만 채운다 (refill 없음) — 몇 step 앞 상태를 같은 입력 (없음) 으로 다시 만들 수 있게
  const both = (st) => { HM.setAutoBoth(st); fillGauges(st, ["home", "away"]); };
  const found = findStep((evs, before) => evs.some((e) => e.type === "cutin" && e.ultimateType === "shot") && evs.some((e) => e.type === "goal")
    && !evs.some((e) => e.type === "combo") && before.turn >= 4, { init: both, seeds: 40, prefix: "ug", maxSteps: 800 });
  assert.ok(found, "필살 슛 골 장면");
  // 3 step 앞에서 띄운다 — 카메라가 공을 따라 당겨진 채로 그 step 을 맞게 (골 턴의 전체 화면으로 미리 빠지면 보인다)
  const st = createFrom(found.setup);
  both(st);
  for (let i = 0; i < found.n - 3; i++) HM.step(st, data);
  const scr = mount(found.setup, st, found.n - 3);
  await pumpUntil(() => dbg().steps === found.n && !dbg().ult.hold && !dbg().ult.cut, 8000);
  await pump(TICK - 40);
  assert.equal(dbg().steps, found.n);
  assert.equal(JSON.stringify(st), JSON.stringify(found.before), "같은 step 전 상태");
  const score0 = scr.querySelector(".mh-score").textContent;
  const clock0 = scr.querySelector(".hx-clock").textContent;
  assert.ok(dbg().cam.z > 1.01, `카메라가 당겨져 있다 (z ${dbg().cam.z})`);
  await pumpUntil(() => dbg().steps === found.n + 1, 3000);
  assert.notEqual(`${st.score.home} : ${st.score.away}`, score0, "엔진은 이미 골");
  const cam0 = JSON.stringify(dbg().cam);
  const clk0 = env.views.opts.clock;
  let frames = 0;
  while (dbg().ult.cut) {
    assert.equal(dbg().ult.hold, true);
    assert.equal(scr.querySelector(".mh-score").textContent, score0, "컷인 동안 점수 = step 전");
    assert.equal(scr.querySelector(".hx-clock").textContent, clock0, "시계 = step 전");
    assert.ok(!scr.querySelector(".hx-banner").classList.contains("hx-show"), "'골!' 은 아직");
    assert.equal(JSON.stringify(dbg().cam), cam0, "카메라 = step 전 자리");
    assert.equal(env.views.opts.clock, clk0, "스프라이트 시계 멈춤 (그 턴 한 번 동작이 컷인 뒤에)");
    assert.equal(env.views.last.alpha, 0);
    assert.equal(scr.querySelector(".skip-btn").disabled, false);
    frames++;
    await pump(16);
  }
  assert.ok(frames > 30, `컷인이 돌았다 (${frames} 프레임)`);
  assert.equal(dbg().ult.hold, false);
  await pump(16);
  assert.equal(scr.querySelector(".mh-score").textContent, `${st.score.home} : ${st.score.away}`, "컷인 뒤 점수");
  assert.ok(scr.querySelector(".hx-banner").classList.contains("hx-show") && scr.querySelector(".hx-banner").classList.contains("hx-goal"), "컷인 뒤 '골!'");
  assert.ok(env.views.opts.clock > clk0, "스프라이트 시계 다시");
  leave();
  assert.deepEqual(env.errors, []);
});

/** 사람 쪽 (홈) 그레타가 실루엔의 바람의 실을 받아 합체기 대기가 된 직후 상태 (양쪽 AI 로 돌려 찾고 홈을 사람으로 되돌린다) */
function findHumanCombo() {
  for (let k = 0; k < 40; k++) {
    const su = setupOf(`uh-${k}`);
    const st = createFrom(su);
    HM.setAutoBoth(st);
    for (let n = 0; n < 1500 && !st.finished; n++) {
      if (typeof st.live.home.p4?.gauge === "number") st.live.home.p4.gauge = 100;
      HM.step(st, data);
      const lv = st.live.home.p7;
      if (lv?.combo && !lv.armed && st.ball.holder?.side === "home" && st.ball.holder.id === "p7" && st.stage === "regular" && st.turn < 280) {
        // 뒤 4턴 (입력 없음 · 상대만 AI) 이 조용한 장면만 — 컷인 · 골 · 킥오프 연출이 끼면 "comboHold 뒤 TICK × 3 에 3턴" 을 잴 수 없다
        //   (연습 스탯이 시즌 3 으로 바뀐 뒤 (2026-10-10) 첫 장면 바로 뒤에 상대 컷인 · 골이 끼었다)
        const probe = clone(st);
        probe.aiSides = ["away"];
        const e0 = probe.events.length;
        for (let i = 0; i < 4 && !probe.finished; i++) HM.step(probe, data);
        if (probe.events.slice(e0).some((e) => ["cutin", "combo", "goal", "kickoff"].includes(e.type))) continue;
        st.aiSides = ["away"];
        return { setup: su, st, n: n + 1 };
      }
    }
  }
  return null;
}

test("사람 쪽 합체기: 대기가 생기면 다음 step 전에 멈춤 + '합체기!' · 금색 버튼 → 누르면 바로 다음 step 에 arm · 안 누르면 comboHold 뒤 이어감 (같은 대기 한 번) (H3 리뷰 H3S-3 · F5)", { skip }, async () => {
  setup();
  const found = findHumanCombo();
  assert.ok(found, "그레타 합체기 대기 장면");
  const turn0 = found.st.turn;
  // 4배속 · 누름
  {
    const st = clone(found.st);
    const scr = mount(found.setup, st, found.n, { practice: true, speed: 4 });
    assert.equal(labelOf("p7"), "합체기");
    assert.ok(btnOf("p7").classList.contains("hx-ready") && btnOf("p7").classList.contains("hx-combo"), btnOf("p7").className);
    assert.ok(btnOf("p7").title.includes("바람의 유성"));
    await pump(900 / 4 + 48);
    assert.ok(dbg().ult.comboWait > 0, "합체기 대기 멈춤");
    assert.equal(st.turn, turn0, "step 없음");
    assert.equal(scr.querySelector(".hx-banner .hx-banner-txt").textContent, "합체기!");
    assert.ok(scr.querySelector(".hx-banner").classList.contains("hx-show"));
    await pump(1200);
    assert.equal(st.turn, turn0, "4배속이어도 기다린다");
    const nCalls = env.calls.length;
    btnOf("p7").click();
    assert.equal(labelOf("p7"), "예약");
    await pump(16);
    assert.equal(st.turn, turn0 + 1, "누르면 바로 다음 step");
    assert.deepEqual(env.calls[nCalls], { ultimates: [{ side: "home", playerId: "p7", op: "arm" }] }, "그 step 에 arm");
    assert.ok(!scr.querySelector(".hx-banner").classList.contains("hx-show"), "알림 닫힘");
    const evs = st.events.filter((e) => e.turn === turn0 + 1);
    assert.ok(st.live.home.p7.armed || evs.some((e) => e.type === "combo"), "엔진이 받았다 (켬 또는 합체기)");
    assert.equal(dbg().ult.inputs, 1);
  }
  // 1배속 · 안 누름: comboHold 뒤 이어가고, 같은 대기로 다시 멈추지 않는다
  {
    const st = clone(found.st);
    mount(found.setup, st, found.n, { practice: true, speed: 1 });
    await pump(900 + 32);
    assert.ok(dbg().ult.comboWait > 0);
    const t = await pumpUntil(() => st.turn > turn0, 4000);
    assert.ok(t >= 2500 - 100 && t <= 2500 + 100, `comboHold 뒤 (${t} ms)`);
    assert.equal(env.calls.at(-1), null, "입력 없음");
    await pump(TICK * 3);
    assert.equal(dbg().ult.comboWait, null, "같은 대기는 한 번만");
    assert.ok(st.turn >= turn0 + 3);
  }
  leave();
  ST.store.practiceMatch = null;
  assert.deepEqual(env.errors, []);
});

test("연습 모드: 홈 = 사람 · 띠는 홈 선수 · 저장 없음 · 누르면 다음 step 입력 · 다시 그려도 입력 기록 · 승부차기 · 끝에는 무시", { skip }, async () => {
  setup();
  const su = setupOf("uu-practice");
  const st = createFrom(su);
  for (let i = 0; i < 2; i++) HM.step(st, data);
  const before = JSON.stringify(Object.keys(env.window.localStorage).sort().map((k) => [k, env.window.localStorage.getItem(k)]));
  mount(su, st, 2, { practice: true });
  assert.deepEqual(st.aiSides, ["away"], "AI = 상대만");
  assert.ok(btns().every((b) => !b.dataset.player.startsWith("m_")), "띠 = 홈 (사람) 선수");
  const shotId = HM.ultimateList(st, data, "home").find((u) => u.type === "shot").playerId;
  st.live.home[shotId].gauge = 100;
  const s0 = dbg().steps;
  await pumpUntil(() => dbg().steps > s0, 3000);
  assert.ok(["준비", "지금!"].includes(labelOf(shotId)));
  btnOf(shotId).click();
  assert.equal(labelOf(shotId), "예약");
  // 다시 그리기 (같은 상태 이어받기) — 줄은 화면 것이라 사라지고, 엔진 상태는 그대로
  const idx = dbg().steps;
  await pumpUntil(() => dbg().steps > idx, 2000);
  assert.ok(st.live.home[shotId].armed || st.events.some((e) => e.type === "cutin" && e.playerId === shotId), "엔진에 켜짐 (또는 이미 터짐)");
  leave();
  SCR.renderHexMatch(env.root, env.ctx);
  assert.equal(ST.store.practiceMatch, st, "같은 상태 이어받기");
  assert.equal(dbg().ult.inputs, 1, "입력 기록 그대로 (WeakMap)");
  if (st.live.home[shotId].armed) {
    assert.equal(labelOf(shotId), "예약", "엔진 켬 = 예약");
    btnOf(shotId).click();
    assert.ok(["준비", "지금!"].includes(labelOf(shotId)), `끄기 줄 → ${labelOf(shotId)}`);
    await pump(16);
    assert.deepEqual(dbg().ult.queued, [{ playerId: shotId, op: "disarm" }]);
  }
  const after = JSON.stringify(Object.keys(env.window.localStorage).sort().map((k) => [k, env.window.localStorage.getItem(k)]));
  assert.equal(after, before, "연습은 localStorage 를 쓰지 않는다");
  // 승부차기: 띠 꺼짐 · 누름 무시 (손으로 단계만 바꿔 다시 그린다 — 시작 0.9 초 안에는 step 없음)
  st.stage = "penalties";
  leave();
  SCR.renderHexMatch(env.root, env.ctx);
  await pump(32);
  assert.ok(btns().every((b) => b.disabled), "승부차기 = 꺼짐");
  btns()[0].click();
  assert.equal(dbg().ult.queued.length, 0);
  leave();
  ST.store.practiceMatch = null;
  assert.deepEqual(env.errors, []);
});
