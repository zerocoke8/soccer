// test/hexMomentUi.test.mjs — 결정의 순간 화면 (H3.5 — screens/hexMatch.js 카드 띠 · [결정 ON/OFF] · [⏸ 개입] · ⏭ · 재생 기록 choose / defend, jsdom).
//   test/hexUltUi.test.mjs 와 같은 손 펌프 rAF (프레임마다 16 ms) + 가짜 view (hexPixi.setHexViewFactoryForTest) 로 renderHexMatch 를 바로 띄운다.
//   장면은 시드를 박지 않고 엔진으로 찾는다 (사본에 step 을 돌려 state.moment 를 본다 — 화면은 같은 상태에서 같은 장면을 연다).
//   HEX_AUTOBATTLE_PLAN 결정 26 · SPEC §3: 장면이면 시계가 고를 때까지 (제한 없음) 서고 · 카드 띠 = momentView 그대로 (% · '자동' · ★ · ▾) ·
//   카드를 누르면 choose / defend (+ ★ arm) 입력이 다음 step 에 들고 재생 기록에 남는다 · [결정 OFF] = 멈추지 않음 · [⏸ 개입] = 한 번 ·
//   ⏭ = '자동' 으로 끝까지 · 합체기 장면 (★) 이 예전 알림을 대신 · 연습 · 런 둘 다 · 다시 그리면 같은 장면 · 915×412 배치 (CSS 숫자).
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
const START = 900;

/* ---- 장면 찾기 (엔진만) ---- */
const setupOf = (seed) => PR.practiceSetup(LR, data, seed);
const createFrom = (setup) => HM.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
function fillGauges(st, sides) {
  for (const s of sides) for (const lv of Object.values(st.live[s])) if (typeof lv.gauge === "number") lv.gauge = 100;
}
/**
 * 시드들을 돌며 step 뒤 state.moment 가 pred(st) 를 만족하는 첫 상태 → { setup, st (사본), n: 그때까지 step 수 }.
 * each(st) = 매 step 전 손으로 놓기 (게이지 — 연습 모드에서만: 재생 기록이 같은 상태를 만들지 않는다).
 */
function findMoment(pred, { prefix = "mu", seeds = 30, maxSteps = 600, each = null, init = null } = {}) {
  for (let k = 0; k < seeds; k++) {
    const setup = setupOf(`${prefix}-${k}`);
    const st = createFrom(setup);
    if (init) init(st);
    for (let n = 0; n < maxSteps && !st.finished; n++) {
      if (each) each(st);
      HM.step(st, data);
      if (st.moment && st.turn < 280 && pred(st)) return { setup, st: clone(st), n: n + 1 };
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
const momEl = () => scrOf().querySelector(":scope > .hx-moment");
const cardEls = () => [...scrOf().querySelectorAll(".hx-moment .hx-mc")];
const cardOf = (key) => cardEls().find((el) => el.dataset.key === key) || null;
const savedOf = () => JSON.parse(env.window.localStorage.getItem(ST.KEYS.hexMatch));

/** 상태 st (step n 번 한 것) 로 화면을 띄운다. practice = 연습 모드 (저장 없음), 아니면 런 모드 (재생 기록 — 입력 없이 n step) */
function mount(setup, st, n, { speed = 1, practice = false, moments = true } = {}) {
  leave();
  env.ctx.setup = setup;
  env.ctx.matchMode = practice ? {
    label: "연습 경기", getSetup: () => setup, stateKey: "practiceMatch", save: null, onFinish: () => {}, exits: [{ label: "나가기", onClick: () => {} }],
  } : undefined;
  ST.store[practice ? "practiceMatch" : "hexMatch"] = st;
  if (!practice) ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: n, inputs: [] });
  ST.store.matchUi.speed = speed;
  ST.store.matchUi.moments = moments;
  ST.store.matchUi.hexIntervene = false;
  env.calls.length = 0;
  SCR.renderHexMatch(env.root, env.ctx);
  assert.ok(scrOf(), "육각 화면");
  return scrOf();
}
const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : "");

test("장면 멈춤 (런 모드): 시계 · 턴이 고를 때까지 선다 (제한 없음) · 카드 띠 = momentView 그대로 · 카메라 확대 · 화살표 · ▾ · 고르면 choose 입력 · 재생 기록 · 되살리기", { skip }, async () => {
  setup();
  // 받는 선수 ▾ (상위 3 중 2명 이상) 이 있는 공격 장면
  const found = findMoment((st) => ["shot", "cross", "counter"].includes(st.moment.kind)
    && HM.momentView(st, data).cards.some((c) => (c.receivers?.length || 0) > 1 && !c.auto));
  assert.ok(found, "▾ 카드가 있는 공격 장면");
  const want = HM.momentView(clone(found.st), data);
  const st = clone(found.st);
  const turn0 = st.turn;
  const scr = mount(found.setup, st, found.n);
  assert.ok(momEl() && momEl().hidden, "처음엔 숨김 (시작 전체 화면)");
  await pump(START + 48);
  const open = dbg().moment.open;
  assert.ok(open, "턴 경계에서 장면을 연다");
  assert.equal(open.kind, want.kind);
  assert.equal(open.playerId, want.playerId);
  assert.equal(momEl().hidden, false, "카드 띠 보임");
  assert.equal(scr.querySelector(":scope > .hx-ult").hidden, true, "필살기 띠 자리를 대신한다");
  // 카드 = momentView 그대로 (key · % · 이름 · 둘째 줄 · '자동' · ★)
  assert.equal(cardEls().length, want.cards.length);
  assert.ok(want.cards.length >= 2 && want.cards.length <= 4, `카드 2 ~ 4장 (${want.cards.length})`);
  want.cards.forEach((c, i) => {
    const el = cardEls()[i];
    assert.equal(el.dataset.key, c.key);
    assert.equal(el.querySelector(".hx-mc-p").textContent, pct(c.p), `${c.key} 큰 %`);
    // ★ 카드는 받는 선수를 둘째 줄 앞으로 (필살기 이름이 길다)
    assert.equal(el.querySelector(".hx-mc-lbl").textContent, c.receiverName && !c.star ? `${c.label} → ${c.receiverName}` : c.label);
    assert.equal(el.querySelector(".hx-mc-af").textContent, c.receiverName && c.star ? `→ ${c.receiverName}${c.after ? ` · ${c.after}` : ""}` : c.after || "");
    assert.equal(el.querySelector(".hx-mc-badge").hidden, !c.auto, `${c.key} '자동'`);
    assert.equal(el.classList.contains("hx-mc-auto"), !!c.auto);
    assert.equal(el.classList.contains("hx-mc-star"), !!c.star);
    if (c.estimate) assert.ok(el.querySelector(".hx-mc-pl").textContent.includes("추정"), "패스 · 크로스 = 추정");
    assert.ok(el.querySelector("button.hx-mc-pick").getAttribute("aria-label").includes(c.label));
  });
  assert.equal(cardEls().filter((el) => el.classList.contains("hx-mc-auto")).length, 1, "'자동' 은 한 장");
  assert.ok(scr.querySelector(".hx-mo-head .hx-mo-title").textContent.length > 0, "장면 이름");
  assert.equal(scr.querySelector(".hx-mo-head .hx-mo-who").textContent, want.name);
  // 밝힌 카드 = '자동' → 화살표 (frame.aim)
  const autoI = want.cards.findIndex((c) => c.auto);
  assert.ok(cardEls()[autoI].classList.contains("hx-mc-sel"), "처음 밝힌 카드 = 자동");
  // 제한 시간 없음: 10초 (25턴 넘게) 지나도 그대로
  const clock0 = scr.querySelector(".hx-clock").textContent;
  const nCalls = env.calls.length;
  await pump(10000);
  assert.equal(st.turn, turn0, "턴 그대로");
  assert.equal(dbg().steps, found.n, "step 없음");
  assert.equal(env.calls.length, nCalls);
  assert.equal(scr.querySelector(".hx-clock").textContent, clock0, "시계 멈춤");
  assert.ok(scr.querySelector(".hx-clock").classList.contains("hx-hold"));
  assert.ok(dbg().cam.z > 1.4 && dbg().cam.z <= 1.9 + 1e-6, `장면 쪽으로 확대 (z ${dbg().cam.z})`);
  if (env.views.last.aim) assert.ok(["shoot", "pass", "loft", "cross", "dribble"].includes(env.views.last.aim.kind), "화살표 종류");
  // ▾: 받는 선수 돌리기 → 그 카드가 밝아지고 이름 · % · 화살표가 바뀐다
  const ci = want.cards.findIndex((c) => (c.receivers?.length || 0) > 1 && !c.auto);
  const card = want.cards[ci];
  const el = cardEls()[ci];
  const aim0 = env.views.last.aim?.key;
  el.querySelector(".hx-mc-rcv").click();
  // 다른 카드의 ▾ 첫 누름 = 밝히기만 (보이던 받는 선수 그대로) → 두 번째부터 돌린다
  assert.equal(el.querySelector(".hx-mc-rn").textContent, `1/${card.receivers.length}`, "첫 누름은 밝히기만");
  assert.ok(el.classList.contains("hx-mc-sel"));
  el.querySelector(".hx-mc-rcv").click();
  const r1 = card.receivers[1];
  assert.equal(el.querySelector(".hx-mc-lbl").textContent, `${r1.label} → ${r1.receiverName}`, "▾ = 다음 받는 선수");
  assert.equal(el.querySelector(".hx-mc-p").textContent, pct(r1.p));
  assert.equal(el.querySelector(".hx-mc-rn").textContent, `2/${card.receivers.length}`);
  assert.equal(el.dataset.key, r1.key);
  assert.ok(el.classList.contains("hx-mc-sel") && !cardEls()[autoI].classList.contains("hx-mc-sel"), "돌린 카드가 밝힘");
  await pump(32);
  assert.ok(env.views.last.aim && env.views.last.aim.key !== aim0, "화살표가 그 받는 선수 쪽으로");
  assert.equal(st.turn, turn0, "▾ 는 고르기가 아니다");
  // 고름 → 다음 step 에 choose 입력 · 띠 닫힘 · 경기 이어감
  el.querySelector(".hx-mc-pick").click();
  assert.equal(momEl().hidden, true, "띠 닫힘");
  assert.equal(scr.querySelector(":scope > .hx-ult").hidden, false, "필살기 띠 다시");
  await pump(32);
  assert.equal(st.turn, turn0 + 1, "바로 다음 step");
  const input = { choice: { side: "home", playerId: want.playerId, key: r1.key } };
  assert.deepEqual(env.calls.at(-1), input, "step 입력 = 그 카드 input");
  assert.ok(st.events.some((e) => e.type === "choice" && e.turn === turn0 + 1 && e.key === r1.key), "엔진이 그 선택지를 둔다");
  const ref = HM.step(clone(found.st), data, clone(input));
  assert.equal(JSON.stringify(st), JSON.stringify(ref), "엔진에 바로 넣은 것과 같은 상태");
  const sv = savedOf();
  assert.deepEqual(sv.inputs, [[found.n, "home", want.playerId, "choose", r1.key]], "재생 기록 = [step, side, 선수, choose, key]");
  assert.equal(sv.steps, found.n + 1);
  assert.equal(sv.version, 3);
  // 되살리기: store 를 비우고 재생 기록으로 → 같은 상태
  const wantJson = JSON.stringify(st);
  leave();
  ST.store.hexMatch = null;
  SCR.renderHexMatch(env.root, env.ctx);
  assert.equal(JSON.stringify(ST.store.hexMatch), wantJson, "choose 가 든 재생 기록 → 같은 상태 (JSON 그대로)");
  // 입력이 없었으면 다른 경기 (선택이 실제로 바꿨다 — '자동' 이 아닌 카드)
  const noIn = SCR.hexReplay(HM, createFrom(found.setup), data, { steps: found.n + 1, inputs: [] });
  assert.notEqual(JSON.stringify(noIn), wantJson);
  leave();
  assert.deepEqual(env.errors, []);
});

test("수비 위기: 압박 / 패스길 막기 / 물러서기 · 상대 성향 칩 · '자동' = AI 자세 · 고르면 defend 입력 (재생 기록 defend 줄 · 엔진 stance by input)", { skip }, async () => {
  setup();
  const found = findMoment((st) => st.moment.kind === "danger" && HM.momentView(st, data).autoKey !== "block");
  assert.ok(found, "수비 위기 장면");
  const want = HM.momentView(clone(found.st), data);
  const st = clone(found.st);
  const turn0 = st.turn;
  const scr = mount(found.setup, st, found.n, { speed: 2 });
  await pump(START / 2 + 48);
  assert.equal(dbg().moment.open?.kind, "danger");
  assert.deepEqual(cardEls().slice(0, 3).map((el) => el.dataset.key), ["press", "block", "drop"]);
  assert.ok(cardEls().slice(0, 3).every((el) => el.classList.contains("hx-mc-def")), "수비 카드 꾸밈");
  assert.equal(cardEls().find((el) => el.classList.contains("hx-mc-auto")).dataset.key, want.autoKey, "'자동' = AI 자세 규칙");
  const chip = scr.querySelector(".hx-mo-head .hx-mo-chip");
  assert.ok(chip, "상대 성향 칩");
  assert.equal(chip.textContent, `상대 ${want.carrier.name} · ${want.tendency.label}`);
  assert.ok(scr.querySelector(".hx-mo-head").classList.contains("hx-mo-danger"));
  await pump(3000);
  assert.equal(st.turn, turn0, "2배속이어도 기다린다");
  cardOf("block").querySelector(".hx-mc-pick").click();
  await pump(32);
  assert.equal(st.turn, turn0 + 1);
  assert.deepEqual(env.calls.at(-1), { defend: { side: "home", playerId: want.playerId, mode: "block" } });
  assert.ok(st.events.some((e) => e.type === "stance" && e.turn === turn0 + 1 && e.mode === "block" && e.by === "input" && e.playerId === want.playerId), "엔진 stance (input)");
  assert.deepEqual(savedOf().inputs, [[found.n, "home", want.playerId, "defend", "block"]]);
  // 되살리기 = 같은 상태
  const wantJson = JSON.stringify(st);
  leave();
  ST.store.hexMatch = null;
  SCR.renderHexMatch(env.root, env.ctx);
  assert.equal(JSON.stringify(ST.store.hexMatch), wantJson, "defend 가 든 재생 기록 → 같은 상태");
  leave();
  assert.deepEqual(env.errors, []);
});

test("★ 카드 (연습 모드): 금색 · 고르면 그 step 에 arm + choose → 그 턴 컷인 (차지 → 카드)", { skip }, async () => {
  setup();
  const found = findMoment((st) => {
    const v = HM.momentView(st, data);
    return v.cards.some((c) => c.star && c.input?.choice) && v.kind !== "combo";
  }, { prefix: "ms", each: (st) => fillGauges(st, ["home"]) });
  assert.ok(found, "★ 공격 카드가 있는 장면");
  const want = HM.momentView(clone(found.st), data);
  const star = want.cards.find((c) => c.star);
  const st = clone(found.st);
  const turn0 = st.turn;
  mount(found.setup, st, found.n, { practice: true });
  await pump(START + 48);
  assert.ok(dbg().moment.open, "장면");
  const el = cardOf(star.key);
  assert.ok(el && el.classList.contains("hx-mc-star"), "★ 카드 금색");
  assert.ok(el.querySelector(".hx-mc-lbl").textContent.startsWith("★ "), el.querySelector(".hx-mc-lbl").textContent);
  assert.ok(cardEls().length <= 4, "★ 가 있으면 일반 카드 3장까지");
  el.querySelector(".hx-mc-pick").click();
  await pump(16);
  assert.equal(st.turn, turn0 + 1);
  const call = env.calls.at(-1);
  assert.deepEqual(call.ultimates, [{ side: "home", playerId: star.playerId, op: "arm" }], "★ = 켜기");
  assert.deepEqual(call.choice, star.input.choice, "+ 그 선택지");
  assert.ok(st.events.some((e) => e.type === "cutin" && e.turn === turn0 + 1 && e.playerId === star.playerId), "그 턴에 터진다");
  assert.equal(dbg().ult.cut?.kind, "charge", "컷인 (차지 먼저)");
  assert.equal(dbg().ult.inputs, 2, "기록 = arm · choose 두 줄");
  leave();
  assert.deepEqual(env.errors, []);
});

test("[결정 OFF]: 장면이 있어도 멈추지 않고 입력 없음 → [결정 ON] 으로 다시 켜면 다음 장면에서 멈춤 (store.matchUi.moments 에 남는다)", { skip }, async () => {
  setup();
  const found = findMoment((st) => st.moment.kind !== "combo");
  assert.ok(found);
  const st = clone(found.st);
  const scr = mount(found.setup, st, found.n, { moments: false, speed: 4 });
  const btn = scr.querySelector(".hx-ctl > .hx-mom-btn");
  assert.equal(btn.textContent, "결정 OFF");
  assert.equal(btn.getAttribute("aria-pressed"), "false");
  await pump(START / 4 + TICK);
  assert.ok(st.turn > found.st.turn, "멈추지 않는다");
  assert.equal(dbg().moment.opened, 0);
  assert.equal(momEl().hidden, true);
  assert.ok(env.calls.every((x) => x === null), "입력 없음 (완전 자동)");
  btn.click();
  assert.equal(btn.textContent, "결정 ON");
  assert.equal(ST.store.matchUi.moments, true, "store.matchUi 에 남는다");
  const t = await pumpUntil(() => !!dbg().moment.open || st.finished, 60000);
  assert.ok(t >= 0 && dbg().moment.open, "다음 장면에서 멈춘다");
  // 장면 중 [결정 OFF] = '자동' 으로 이어간다
  const turn1 = st.turn;
  btn.click();
  assert.equal(momEl().hidden, true, "띠 닫힘");
  await pump(32);
  assert.equal(st.turn, turn1 + 1, "이어감");
  assert.equal(env.calls.at(-1), null, "'자동' = 입력 없음");
  leave();
  assert.deepEqual(env.errors, []);
});

test("[⏸ 개입]: 다음 우리 공 · 수비 장면에서 한 번만 멈춤 ([결정 OFF] · 10초 간격 상관없음) → 고르면 꺼지고 다시 멈추지 않는다", { skip }, async () => {
  setup();
  const su = setupOf("mi-0");
  const st = createFrom(su);
  for (let i = 0; i < 4; i++) HM.step(st, data);
  const scr = mount(su, st, 4, { moments: false });
  const ib = scr.querySelector(".hx-ctl > .hx-int-btn");
  assert.equal(ib.textContent, "⏸ 개입");
  await pump(START + TICK * 2);
  assert.equal(dbg().moment.opened, 0);
  ib.click();
  assert.ok(ib.classList.contains("active") && ib.getAttribute("aria-pressed") === "true", "켬");
  assert.equal(ST.store.matchUi.hexIntervene, true);
  ib.click();
  assert.equal(ST.store.matchUi.hexIntervene, false, "다시 누르면 취소");
  ib.click();
  const t = await pumpUntil(() => !!dbg().moment.open, 30000);
  assert.ok(t >= 0, "멈춘다");
  const open = dbg().moment.open;
  // peekMoment(manual) 과 같은 장면 (state.moment 가 있으면 그것)
  const want = st.moment || HM.peekMoment(st, data, { manual: true });
  assert.equal(open.kind, want.kind);
  assert.equal(open.playerId, want.playerId);
  if (!st.moment) assert.ok(open.manual && scr.querySelector(".hx-mo-title").textContent.startsWith("⏸"), "개입 장면 표시");
  assert.equal(ST.store.matchUi.hexIntervene, false, "한 번 멈추면 꺼짐");
  assert.ok(!ib.classList.contains("active"));
  const turn0 = st.turn;
  await pump(3000);
  assert.equal(st.turn, turn0, "고를 때까지");
  cardEls().find((el) => el.classList.contains("hx-mc-auto")).querySelector(".hx-mc-pick").click();
  await pump(32);
  assert.equal(st.turn, turn0 + 1);
  // '자동' 카드도 고른 입력으로 남는다 (공격 = choice). 수비 위기의 '자동' 은 입력 없음 (AI 자세 규칙 그대로 — 고른 자세처럼 이어지지 않게)
  if (open.kind === "danger") assert.equal(env.calls.at(-1), null);
  else assert.ok(env.calls.at(-1) && env.calls.at(-1).choice, "'자동' 카드도 고른 입력으로 남는다");
  await pump(TICK * 30);
  assert.equal(dbg().moment.opened, 1, "다시 멈추지 않는다 (결정 OFF)");
  leave();
  assert.deepEqual(env.errors, []);
});

test("⏭ 장면 중: 카드 없이 ('자동') 양쪽 AI 로 끝 · 재생 기록 skipped · 입력 줄 없음 · 되살리면 같은 끝", { skip }, async () => {
  setup();
  const found = findMoment((st) => st.moment.kind === "shot" || st.moment.kind === "danger", { prefix: "mk" });
  assert.ok(found);
  const st = clone(found.st);
  const scr = mount(found.setup, st, found.n);
  await pump(START + 48);
  assert.ok(dbg().moment.open);
  scr.querySelector(".skip-btn").click();
  assert.ok(st.finished, "끝까지");
  assert.equal(momEl().hidden, true, "띠 닫힘");
  await pump(32);
  assert.equal(dbg().moment.open, null);
  assert.ok(env.modalRoot.querySelector(".score-big"), "결과");
  const sv = savedOf();
  assert.equal(sv.skipped, true);
  assert.deepEqual(sv.inputs, [], "입력 없음");
  assert.equal(JSON.stringify(SCR.hexReplay(HM, createFrom(found.setup), data, sv)), JSON.stringify(st), "같은 끝 상태");
  assert.ok(scr.querySelector(".hx-ctl > .hx-int-btn").disabled, "끝나면 개입 끔");
  leave();
  assert.deepEqual(env.errors, []);
});

/** 사람 쪽 (홈) 그레타가 실루엔의 바람의 실을 받아 합체기 대기가 된 직후 · 엔진 장면 combo (양쪽 AI 로 돌려 찾고 홈을 사람으로 되돌린다) */
function findComboMoment() {
  for (let k = 0; k < 40; k++) {
    const su = setupOf(`uh-${k}`);
    const st = createFrom(su);
    HM.setAutoBoth(st);
    for (let n = 0; n < 1500 && !st.finished; n++) {
      if (typeof st.live.home.p4?.gauge === "number") st.live.home.p4.gauge = 100;
      HM.step(st, data);
      if (st.moment?.kind === "combo" && st.stage === "regular" && st.turn < 280) {
        st.aiSides = ["away"];
        return { setup: su, st: clone(st), n: n + 1 };
      }
    }
  }
  return null;
}

test("합체기 장면 ([결정 ON]): 예전 '합체기!' 알림 대신 ★ 합체기 카드 — 고르면 arm, 같은 대기로 다시 멈추지 않는다", { skip }, async () => {
  setup();
  const found = findComboMoment();
  assert.ok(found, "합체기 장면");
  const want = HM.momentView(clone(found.st), data);
  const star = want.cards.find((c) => c.star);
  const st = clone(found.st);
  const turn0 = st.turn;
  const scr = mount(found.setup, st, found.n, { practice: true, speed: 4 });
  await pump(START / 4 + 48);
  assert.equal(dbg().moment.open?.kind, "combo");
  assert.equal(scr.querySelector(".hx-mo-title").textContent, "합체기 찬스");
  assert.equal(dbg().ult.comboWait, null, "예전 알림 (comboHold) 없음");
  assert.ok(!scr.querySelector(".hx-banner").classList.contains("hx-combo-call"));
  await pump(4000);
  assert.equal(st.turn, turn0, "4배속이어도 고를 때까지 (예전 2.5 초 알림이 아니다)");
  if (star) {
    assert.ok(star.ult?.combo, "★ = 합체기");
    assert.ok(cardOf(star.key).querySelector(".hx-mc-lbl").textContent.includes(star.ult.comboName));
    cardOf(star.key).querySelector(".hx-mc-pick").click();
    await pump(16);
    assert.equal(st.turn, turn0 + 1);
    assert.deepEqual(env.calls.at(-1).ultimates, [{ side: "home", playerId: star.playerId, op: "arm" }], "그 step 에 arm");
    assert.ok(st.events.some((e) => e.turn === turn0 + 1 && (e.type === "combo" || e.type === "cutin")) || st.live.home[star.playerId].armed, "엔진이 받았다");
  } else {
    cardEls()[0].querySelector(".hx-mc-pick").click();
    await pump(16);
    assert.equal(st.turn, turn0 + 1);
  }
  await pump(TICK);
  assert.equal(dbg().ult.comboWait, null, "같은 대기로 예전 알림을 다시 띄우지 않는다");
  leave();
  assert.deepEqual(env.errors, []);
});

test("연습 모드 · 다시 그리기: 열린 장면은 다시 그려도 같은 장면으로 다시 연다 (엔진 state.moment) · 저장 없음 · 고르면 연습도 입력", { skip }, async () => {
  setup();
  const found = findMoment((st) => st.moment.kind !== "combo", { prefix: "mp" });
  assert.ok(found);
  const st = clone(found.st);
  const before = env.window.localStorage.getItem(ST.KEYS.hexMatch);
  mount(found.setup, st, found.n, { practice: true });
  await pump(START + 48);
  const o1 = dbg().moment.open;
  assert.ok(o1);
  // 다시 그리기 (app render — 같은 store.practiceMatch)
  leave();
  SCR.renderHexMatch(env.root, env.ctx);
  assert.equal(ST.store.practiceMatch, st, "같은 상태를 이어받는다");
  await pump(START + 48);
  const o2 = dbg().moment.open;
  assert.ok(o2, "다시 연다");
  assert.equal(o2.kind, o1.kind);
  assert.equal(o2.turn, o1.turn);
  assert.deepEqual(o2.cards.map((c) => c.key), o1.cards.map((c) => c.key));
  cardEls()[0].querySelector(".hx-mc-pick").click();
  await pump(16);
  assert.equal(st.turn, found.st.turn + 1);
  assert.notEqual(env.calls.at(-1), null, "연습도 입력");
  assert.equal(env.window.localStorage.getItem(ST.KEYS.hexMatch), before, "연습 = 저장 없음");
  leave();
  assert.deepEqual(env.errors, []);
});

test("915×412 배치 (CSS 숫자 — 스테이지 1280×720 을 0.572 배): 카드 ≥ 44 CSS px · 큰 % · 둘째 줄 글자 · 띠는 경기장 아래 · 컨트롤 2 × 2 와 안 겹침", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/match.css"), "utf8");
  const rule = (sel) => {
    const i = css.indexOf(`${sel} {`);
    assert.ok(i >= 0, `규칙 ${sel}`);
    return css.slice(i, css.indexOf("}", i));
  };
  const px = (sel, prop) => {
    const m = rule(sel).match(new RegExp(`(?:^|[;{\\s])${prop}:\\s*(\\d+(?:\\.\\d+)?)px`));
    assert.ok(m, `${sel} ${prop}`);
    return Number(m[1]);
  };
  const k = Math.min(915 / 1280, 412 / 720);
  const P = ".match-screen.hex-screen";
  assert.ok(px(`${P} .hx-mc`, "height") * k >= 44, `카드 높이 ${px(`${P} .hx-mc`, "height") * k} CSS px`);
  assert.ok(px(`${P} .hx-mc-p`, "font-size") * k >= 16, "큰 %");
  assert.ok(px(`${P} .hx-mc-lbl`, "font-size") * k >= 10.5, "카드 이름");
  assert.ok(px(`${P} .hx-mc-af`, "font-size") * k >= 9.5, "둘째 줄");
  // % 이름 (골 · 가로채기 추정 · 슛 실점 …) · '자동' 꼬리표 · 머리표 글자 · ▾ 번호도 폰 바닥 9 CSS px 넘게 (2026-10-10 리뷰: 7.4 CSS px 였다)
  for (const sel of [".hx-mc-pl", ".hx-mc-badge", ".hx-mo-wait", ".hx-mo-chip", ".hx-mc-rn"]) assert.ok(px(`${P} ${sel}`, "font-size") * k >= 9, `${sel} ${px(`${P} ${sel}`, "font-size") * k} CSS px`);
  assert.ok(px(`${P} .hx-mc-rcv`, "width") * k >= 22, "▾ 칸 폭 (세로 칸 — 높이는 카드 전체)");
  // 띠: 아래 8 + 높이 96 → 위 끝 616 ≥ 경기장 (필드 영역) 아래 끝 720 − pad 6 − fb 102 = 612
  const top = 720 - px(`${P} .hx-moment`, "bottom") - px(`${P} .hx-moment`, "height");
  assert.ok(top >= 720 - 6 - 102, `띠 위 끝 ${top}`);
  // 컨트롤 (왼쪽 pad 6 + 8, 폭 122) 은 띠 (left 140) 와 안 겹친다
  assert.ok(6 + 8 + px(`${P} .hx-ctl`, "width") <= px(`${P} .hx-moment`, "left"), "컨트롤 · 띠");
  assert.ok(px(`${P} .hx-ctl .btn`, "height") * k >= 20, "컨트롤 버튼");
});

test("hexScene.momentFocus · momentAim (순수): 틀 = 공 가진 선수 core · 받는 선수 · 붙은 상대, 화살표 = 슛은 공격 방향 골 · 띄운 공은 호 · 패스길 막기는 X · 수비는 하늘색", async () => {
  const S = await imp("js/ui/hexScene.js");
  const W = 1244;
  const H = 528;
  const atk = findMoment((st) => {
    const v = HM.momentView(st, data);
    return v.cards.some((c) => c.kind === "shoot") && v.cards.some((c) => c.kind === "loft");
  }, { prefix: "mf" });
  assert.ok(atk, "슛 · 띄운 공 카드가 있는 장면");
  const v = HM.momentView(atk.st, data);
  const shoot = v.cards.find((c) => c.kind === "shoot");
  const loft = v.cards.find((c) => c.kind === "loft");
  const f = S.momentFocus(atk.st, v, loft);
  assert.ok(f.players.some((p) => p.side === "home" && p.id === v.carrier.id && p.core), "공 가진 선수 core");
  assert.ok(f.players.some((p) => p.id === String(loft.receiverId) && !p.opt), "고른 카드 받는 선수 = 꼭");
  assert.deepEqual(f.cells, [loft.target], "노린 칸");
  const a1 = S.momentAim(atk.st, v, shoot, W, H);
  assert.equal(a1.kind, "shoot");
  assert.ok(a1.to.sx > a1.from.sx, "홈 = 오른쪽 골");
  assert.equal(a1.lift, 0);
  const a2 = S.momentAim(atk.st, v, loft, W, H);
  assert.equal(a2.kind, "loft");
  assert.ok(a2.lift > 0, "띄운 공 = 호");
  assert.notEqual(a1.key, a2.key);
  assert.equal(S.momentAim(atk.st, v, { ...shoot, kind: "hold", choiceKey: "hold" }, W, H), null, "지키기 = 없음");
  const dg = findMoment((st) => st.moment.kind === "danger" && HM.momentView(st, data).cards.find((c) => c.key === "block")?.receiverId, { prefix: "mf" });
  assert.ok(dg);
  const dv = HM.momentView(dg.st, data);
  const bl = S.momentAim(dg.st, dv, dv.cards.find((c) => c.key === "block"), W, H);
  assert.ok(bl.block && bl.tone === "def" && bl.kind === "block");
  assert.equal(S.momentAim(dg.st, dv, dv.cards.find((c) => c.key === "press"), W, H).kind, "press");
  assert.equal(S.momentAim(dg.st, dv, dv.cards.find((c) => c.key === "drop"), W, H).kind, "drop");
  // 골문 틀 (2026-10-10 스크린샷 — 슈팅 찬스에 골이 화면 밖): 슛 카드 · 슈팅 찬스 = 상대 GK 꼭, 수비 위기 = 우리 GK opt
  const gkOf = (st, side) => Object.entries(st.roles[side]).find(([, r]) => r === "GK")[0];
  const fs1 = S.momentFocus(atk.st, v, shoot);
  assert.ok(fs1.players.some((p) => p.side === "away" && p.id === gkOf(atk.st, "away") && !p.opt), "슛 카드 = 상대 GK 꼭");
  const fd = S.momentFocus(dg.st, dv, dv.cards.find((c) => c.key === "block"));
  assert.ok(fd.players.some((p) => p.side === dv.side && p.id === gkOf(dg.st, dv.side) && p.opt), "수비 위기 = 우리 GK opt");
});

test("2골 선승 골: '골!' 배너 아랫줄에 '2골 선승' · 바로 경기 종료 (킥오프 없음) → 결과", { skip }, async () => {
  setup();
  let found = null;
  for (let k = 0; k < 20 && !found; k++) {
    const su = setupOf(`mw-${k}`);
    const st = createFrom(su);
    for (let n = 0; n < 600 && !st.finished; n++) {
      const before = clone(st);
      const e0 = st.events.length;
      HM.step(st, data);
      if (st.events.slice(e0).some((e) => e.type === "end" && e.reason === "goals")) found = { setup: su, st: before, n };
    }
  }
  assert.ok(found, "2골 선승으로 끝나는 경기");
  const st = clone(found.st);
  mount(found.setup, st, found.n, { moments: false, speed: 1 });
  const b = scrOf().querySelector(".hx-banner");
  const t = await pumpUntil(() => b.classList.contains("hx-show") && b.classList.contains("hx-goal"), 8000);
  assert.ok(t >= 0, "'골!' 배너");
  assert.ok(st.finished, "그 턴에 끝");
  assert.ok(b.querySelector(".hx-banner-sub").textContent.endsWith("· 2골 선승"), b.querySelector(".hx-banner-sub").textContent);
  assert.ok(!st.events.slice(-3).some((e) => e.type === "kickoff"), "킥오프 없음");
  const r = await pumpUntil(() => !!env.modalRoot.querySelector(".score-big"), 15000);
  assert.ok(r >= 0, "결과 모달");
  leave();
  assert.deepEqual(env.errors, []);
});

/* ---- H3.5 리뷰 고침 (2026-10-10) ---- */

test("장면 전에 띠에서 눌러 둔 켜기 + '아끼기' (★ 아닌 카드): 그 선수의 켜기 줄을 지운다 — step 에 필살기 입력 없음 · 컷인 없음 (장면이 그 선수 입력의 유일한 출처)", { skip }, async () => {
  setup();
  const found = findMoment((st) => st.moment.kind === "ult" && HM.momentView(st, data)?.cards.some((c) => c.key === "auto" && c.kind === "wait"),
    { prefix: "ra", each: (st) => fillGauges(st, ["home"]) });
  assert.ok(found, "팀 필살기 장면");
  const st = clone(found.st);
  const turn0 = st.turn;
  const pid = HM.momentView(st, data).playerId;
  const scr = mount(found.setup, st, found.n, { practice: true });
  await pump(100); // 시작 그림 (턴 경계 전) — 띠가 보인다
  const btn = scr.querySelector(`.hx-ult .hx-ult-btn[data-player="${pid}"]`);
  assert.ok(btn, "그 선수 버튼");
  btn.click();
  await pump(16); // 디버그 객체는 프레임마다
  assert.deepEqual(dbg().ult.queued, [{ playerId: pid, op: "arm" }], "켜기 줄");
  await pump(START + 48);
  assert.equal(dbg().moment.open?.kind, "ult");
  assert.ok(scr.querySelector(":scope > .hx-ult").hidden, "장면 동안 띠는 숨는다");
  cardOf("auto").querySelector(".hx-mc-pick").click();
  await pump(32);
  assert.equal(st.turn, turn0 + 1);
  assert.equal(env.calls.at(-1), null, "'아끼기' = 입력 없음 (눌러 둔 켜기도 지움)");
  assert.ok(!st.events.some((e) => e.turn === turn0 + 1 && e.type === "cutin" && e.playerId === pid), "컷인 없음");
  assert.ok(!(st.teamUlt?.home && st.teamUlt.home.playerId === pid), "팀 필살기 안 켜짐");
  leave();
  assert.deepEqual(env.errors, []);
});

test("⏸ 개입을 눌러 두고 장면 전에 경기가 끝나면 (2골 선승): 끝날 때 꺼진다 · 버튼 꺼짐 (다음 연습 경기 첫 킥오프에서 멈추지 않는다)", { skip }, async () => {
  setup();
  let found = null;
  for (let k = 0; k < 40 && !found; k++) {
    const su = setupOf(`rb-${k}`);
    const st = createFrom(su);
    for (let n = 0; n < 600 && !st.finished && !found; n++) {
      const before = clone(st);
      const e0 = st.events.length;
      HM.step(st, data);
      const endEv = st.events.slice(e0).find((e) => e.type === "end" && e.reason === "goals");
      if (endEv && !HM.peekMoment(before, data, { manual: true }) && !before.moment) found = { setup: su, st: before, n };
    }
  }
  assert.ok(found, "다음 step 에 2골 선승으로 끝나고 개입 장면이 없는 판");
  const st = clone(found.st);
  const scr = mount(found.setup, st, found.n, { practice: true });
  await pump(100);
  const ib = scr.querySelector(".hx-ctl > .hx-int-btn");
  ib.click();
  assert.equal(ST.store.matchUi.hexIntervene, true);
  await pumpUntil(() => st.finished, 4000);
  assert.ok(st.finished);
  assert.equal(dbg().moment.opened, 0, "장면 없이 끝");
  assert.equal(ST.store.matchUi.hexIntervene, false, "끝나면 꺼진다");
  assert.ok(ib.disabled && !ib.classList.contains("active"), "버튼 꺼짐");
  await pumpUntil(() => !!env.modalRoot.querySelector(".score-big"), 8000);
  // 다음 경기 (턴 0) — 시작 킥오프에 '⏸ 개입' 장면이 없다
  const su2 = setupOf("rb-next");
  const st2 = createFrom(su2);
  leave();
  env.ctx.setup = su2;
  env.ctx.matchMode.getSetup = () => su2;
  ST.store.practiceMatch = st2;
  env.calls.length = 0;
  SCR.renderHexMatch(env.root, env.ctx);
  await pump(START + 48);
  assert.equal(dbg().moment.open, null, "첫 킥오프에서 멈추지 않는다");
  leave();
  assert.deepEqual(env.errors, []);
});

test("판 2 재생 기록 (rules 2) 경기: [결정 —] 꺼짐 · 못 누름 · ⏸ 개입은 공격 장면만 (수비 장면 없음) · 저장 rules: 2 그대로", { skip }, async () => {
  setup();
  // rules 2 경기에서 ⏸ 개입 (manual) 이 수비 장면이었을 판 (예전) — 지금은 null
  let found = null;
  for (let k = 0; k < 30 && !found; k++) {
    const su = setupOf(`rc-${k}`);
    const st = HM.createMatch({ data, seed: su.seed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind, rules: 2 });
    for (let n = 0; n < 300 && !st.finished && !found; n++) {
      HM.step(st, data);
      const h = st.ball.holder;
      if (n > 10 && h && h.side === "away" && st.stage === "regular") found = { setup: su, n: n + 1 };
    }
  }
  assert.ok(found);
  leave();
  env.ctx.setup = found.setup;
  env.ctx.matchMode = undefined;
  ST.store.hexMatch = null;
  ST.saveHexMatch({ version: 2, seed: found.setup.seed, steps: found.n, inputs: [] });
  ST.store.matchUi.moments = true;
  ST.store.matchUi.hexIntervene = false;
  ST.store.matchUi.speed = 1;
  SCR.renderHexMatch(env.root, env.ctx);
  const st = ST.store.hexMatch;
  assert.equal(st.rules, 2, "판 2 기록 = 규칙 판 2");
  const scr = scrOf();
  const mb = scr.querySelector(".hx-ctl > .hx-mom-btn");
  assert.equal(mb.textContent, "결정 —");
  assert.ok(mb.disabled, "못 누름");
  mb.click();
  assert.equal(ST.store.matchUi.moments, true, "누르지 않는다 (설정 그대로)");
  assert.equal(HM.peekMoment(st, data, { manual: true }), null, "공 가진 상대 — 수비 장면 없음");
  scr.querySelector(".hx-ctl > .hx-int-btn").click();
  const t = await pumpUntil(() => !!dbg().moment.open || st.finished, 60000);
  assert.ok(t >= 0);
  if (dbg().moment.open) assert.notEqual(dbg().moment.open.kind, "danger", "공격 장면만");
  assert.equal(savedOf().rules, 2, "저장 rules: 2");
  leave();
  assert.deepEqual(env.errors, []);
});

test("장면 이름표: 고르는 선수 · 밝힌 카드의 받는 선수 머리 위 HTML 이름표 (.hx-mo-tag) · 다른 카드 ▾ 첫 누름은 밝히기만 (받는 선수 그대로)", { skip }, async () => {
  setup();
  const found = findMoment((st) => {
    const v = HM.momentView(st, data);
    return v.kind === "danger" || v.cards.filter((c) => c.receivers && c.receivers.length > 1).length >= 1;
  }, { prefix: "mt" });
  assert.ok(found);
  const st = clone(found.st);
  const want = HM.momentView(clone(found.st), data);
  const scr = mount(found.setup, st, found.n, { practice: true });
  await pump(START + 48);
  assert.ok(dbg().moment.open);
  const tags = () => [...scr.querySelectorAll(".hx-field > .hx-mo-tag")].filter((el) => !el.hidden).map((el) => el.textContent);
  const nameOf = (side, id) => st[side].players.find((p) => p.id === id).name;
  const carrier = st.ball.holder;
  // 고르는 선수 (공 가진 선수면 원래 이름표) + 밝힌 카드의 받는 선수
  const sel = want.cards.find((c) => c.auto) || want.cards[0];
  const expect = [];
  if (!(carrier.side === want.side && carrier.id === want.playerId)) expect.push(nameOf(want.side, want.playerId));
  if (sel.receiverId != null) expect.push(nameOf(sel.receiverSide || want.side, sel.receiverId));
  assert.deepEqual(tags(), expect);
  // ▾ : 다른 카드의 첫 누름 = 밝히기만 (1/n 그대로), 두 번째 = 돌림
  const i = want.cards.findIndex((c) => c.receivers && c.receivers.length > 1 && !c.auto);
  if (i >= 0) {
    const el = cardEls()[i];
    const rb = el.querySelector(".hx-mc-rcv");
    rb.click();
    assert.ok(el.classList.contains("hx-mc-sel"), "밝힘");
    assert.equal(rb.querySelector(".hx-mc-rn").textContent, `1/${want.cards[i].receivers.length}`, "첫 누름은 그대로");
    await pump(32);
    assert.ok(tags().includes(nameOf(want.side, want.cards[i].receivers[0].receiverId)), "그 받는 선수 이름표");
    rb.click();
    assert.equal(rb.querySelector(".hx-mc-rn").textContent, `2/${want.cards[i].receivers.length}`);
    await pump(32);
    assert.ok(tags().includes(nameOf(want.side, want.cards[i].receivers[1].receiverId)));
  }
  cardEls()[0].querySelector(".hx-mc-pick").click();
  await pump(32);
  assert.deepEqual(tags(), [], "장면이 닫히면 이름표도");
  leave();
  assert.deepEqual(env.errors, []);
});
