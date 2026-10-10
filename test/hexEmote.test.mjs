// test/hexEmote.test.mjs — 감정 말풍선 (기획자 요청 2026-10-10 "공을 뺏는다던지 뺏길때 머리 위에 감정표현").
//   1) hexScene.emotesOf (순수): 이벤트 규칙마다 — 태클 성공 · 가로채기 성공 (같은 턴 · 지난 턴 패스) · 공중볼을 이긴 수비 · GK 선방 ·
//      흘러나온 공을 다른 쪽이 주움 (같은 쪽은 없음) · 골 · 킥오프 · 승부차기 · prev 없음은 없음 · key · 한 선수 하나 · 최대 6 · 엔진 경기 전체.
//   2) screens/hexMatch.js (jsdom — test/hexFlow.test.mjs 와 같은 손 펌프 rAF + 가짜 view): 태클 성공 턴 = 말풍선 정확히 둘
//      (태클한 선수 "!!" · 태클당한 선수 "💦") 이 닿는 순간에 머리 근처 · 길이 뒤 사라짐 · 배속 (길이 ÷ 배속, 바닥 450 ms) ·
//      ⏭ 뒤 없음 · 컷인 동안 숨김 (턴 전 컷인 · 역컷인 — 멈췄다 이어감) · 캔버스 없음 (대체 화면) 은 없음 · 꾸밈 클래스 hx- · CSS (필터 없음 · 움직임 줄이기 ·
//      팝 · 페이드 · 멈춤) · 이름표 위 올리기 (띄울 때 정함 — 뛰지 않음) · 4배속 20 fps 에도 빠지지 않음 · 풀 ≤ 6 (다시 씀 · 남은 시간 짧은 것부터) ·
//      승부차기 = 지움 · 필드 안 자르기 (hexScene.emoteSpot).
// jsdom 이 없으면 2) 는 건너뛴다.
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
const S = await imp("js/ui/hexScene.js");
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
const clone = (x) => JSON.parse(JSON.stringify(x));
const TICK = 400;

/* ------------------------------------------------------------------ */
/* 1) emotesOf (순수)                                                    */
/* ------------------------------------------------------------------ */

/** 가짜 prev · next: 이벤트 목록 (턴 붙여서) · 턴 시작 포제션 · 공 */
function pair(turn, events, { possession = "home", holder = null, flight = null, stage = "regular" } = {}) {
  const prev = { turn: turn - 1, stage, pos: {}, ball: { holder, flight, loose: !holder && !flight }, possessionSide: possession };
  const next = { turn, stage, events };
  return { prev, next };
}
const brief = (list) => list.map((e) => `${e.kind}/${e.cause}/${e.side}:${e.id}`);

test("emotesOf: 태클 성공 = 태클한 선수 win (tackle) · 태클당한 선수 lose — 실패는 없음 · key = 턴:쪽:id:종류", () => {
  const ev = { turn: 10, type: "tackle", side: "away", tacklerId: "m_p2", carrierId: "p6", success: true };
  const { prev, next } = pair(10, [{ turn: 9, type: "receive", side: "home", playerId: "p6" }, ev], { holder: { side: "home", id: "p6" } });
  const out = S.emotesOf(prev, next);
  assert.deepEqual(brief(out), ["win/tackle/away:m_p2", "lose/tackle/home:p6"]);
  assert.deepEqual(out.map((e) => e.key), ["10:away:m_p2:win", "10:home:p6:lose"]);
  assert.deepEqual(S.emotesOf(prev, next), out, "같은 입력 = 같은 key (프레임마다 새로 띄우지 않게)");
  const fail = pair(10, [{ ...ev, success: false }], { holder: { side: "home", id: "p6" } });
  assert.deepEqual(S.emotesOf(fail.prev, fail.next), [], "태클 실패 = 없음");
});

test("emotesOf: 가로채기 성공 = 가로챈 선수 win · 그 패스를 찬 선수 lose (같은 턴 패스 · 지난 턴부터 날던 패스) — 실패 굴림은 없음", () => {
  const a = pair(10, [
    { turn: 10, type: "pass", side: "home", from: "p3", to: "p5" },
    { turn: 10, type: "intercept", side: "away", defenderId: "m_p1", success: false },
    { turn: 10, type: "intercept", side: "away", defenderId: "m_p4", success: true },
  ], { holder: { side: "home", id: "p3" } });
  assert.deepEqual(brief(S.emotesOf(a.prev, a.next)), ["win/intercept/away:m_p4", "lose/intercept/home:p3"]);
  const b = pair(12, [
    { turn: 11, type: "pass", side: "home", from: "p2", to: "p7" },
    { turn: 12, type: "intercept", side: "away", defenderId: "m_p5", success: true },
  ], { flight: { side: "home", passerId: "p2" } });
  assert.deepEqual(brief(S.emotesOf(b.prev, b.next)), ["win/intercept/away:m_p5", "lose/intercept/home:p2"], "지난 턴 패스");
  const c = pair(10, [{ turn: 10, type: "pass", side: "home", from: "p3" }, { turn: 10, type: "intercept", side: "away", defenderId: "m_p4", success: false }]);
  assert.deepEqual(S.emotesOf(c.prev, c.next), [], "살아남은 패스 = 없음");
});

test("emotesOf: 공중볼을 이긴 수비 win (aerial) · 그 크로스를 찬 선수 lose — 공격이 이기면 없음", () => {
  const lost = pair(20, [
    { turn: 19, type: "pass", side: "away", from: "m_p6", cross: true },
    { turn: 20, type: "aerial", side: "away", attackerId: "m_p7", defenderId: "p3", success: false },
  ], { possession: "away", flight: { side: "away", passerId: "m_p6", cross: true } });
  assert.deepEqual(brief(S.emotesOf(lost.prev, lost.next)), ["win/aerial/home:p3", "lose/aerial/away:m_p6"]);
  const won = pair(20, [
    { turn: 19, type: "pass", side: "away", from: "m_p6", cross: true },
    { turn: 20, type: "aerial", side: "away", attackerId: "m_p7", defenderId: "p3", success: true },
    { turn: 20, type: "receive", side: "away", playerId: "m_p7" },
  ], { possession: "away" });
  assert.deepEqual(S.emotesOf(won.prev, won.next), []);
});

test("emotesOf: GK 선방 = GK win (save) · 슛한 선수 lose", () => {
  const { prev, next } = pair(30, [
    { turn: 30, type: "shot", side: "home", playerId: "p7", success: false },
    { turn: 30, type: "save", side: "away", gkId: "m_p1" },
  ], { holder: { side: "home", id: "p7" } });
  assert.deepEqual(brief(S.emotesOf(prev, next)), ["win/save/away:m_p1", "lose/save/home:p7"]);
});

test("emotesOf: 흘러나온 공 — 공이 없던 쪽이 주우면 win (loose) · 마지막으로 가진 선수 lose, 같은 쪽이 주우면 없음", () => {
  // 지난 턴 패스가 빈 칸에 떨어짐 → 이번 턴 상대가 주움
  const a = pair(40, [
    { turn: 38, type: "pass", side: "home", from: "p4", to: "p6" },
    { turn: 39, type: "loose", cell: 50 },
    { turn: 40, type: "looseWon", side: "away", playerId: "m_p5", cell: 50 },
  ], { possession: "home" });
  assert.deepEqual(brief(S.emotesOf(a.prev, a.next)), ["win/loose/away:m_p5", "lose/loose/home:p4"]);
  // 같은 턴에 패스 → 튐 → 상대가 주움
  const b = pair(40, [
    { turn: 40, type: "pass", side: "home", from: "p4", to: "p6" },
    { turn: 40, type: "loose", cell: 50 },
    { turn: 40, type: "looseWon", side: "away", playerId: "m_p5", cell: 50 },
  ], { holder: { side: "home", id: "p4" } });
  assert.deepEqual(brief(S.emotesOf(b.prev, b.next)), ["win/loose/away:m_p5", "lose/loose/home:p4"]);
  // 우리 쪽이 다시 주움 = 없음
  const c = pair(40, [
    { turn: 39, type: "pass", side: "home", from: "p4" }, { turn: 39, type: "loose", cell: 50 },
    { turn: 40, type: "looseWon", side: "home", playerId: "p6", cell: 50 },
  ], { possession: "home" });
  assert.deepEqual(S.emotesOf(c.prev, c.next), []);
});

test("emotesOf: 골 턴 · 골든골 결승골 · 킥오프 턴 · 승부차기 · prev 없음 · 이벤트 없음 = 없음", () => {
  const tackle = { turn: 50, type: "tackle", side: "away", tacklerId: "m_p2", carrierId: "p6", success: true };
  const goal = pair(50, [tackle, { turn: 50, type: "shot", side: "away", playerId: "m_p2", success: true },
    { turn: 50, type: "goal", side: "away", playerId: "m_p2" }, { turn: 50, type: "kickoff", side: "home", playerId: "p6" }]);
  assert.deepEqual(S.emotesOf(goal.prev, goal.next), [], "골 (골 장면이 이미 기뻐한다)");
  const golden = pair(50, [tackle, { turn: 50, type: "goal", side: "away", playerId: "m_p2" }], { stage: "goldenGoal" });
  assert.deepEqual(S.emotesOf(golden.prev, golden.next), [], "골든골 결승골 (킥오프 없음)");
  const ko = pair(1, [{ turn: 1, type: "kickoff", side: "home", playerId: "p6" }, { ...tackle, turn: 1 }]);
  assert.deepEqual(S.emotesOf(ko.prev, ko.next), [], "킥오프 턴");
  const pens = pair(400, [{ turn: 400, type: "penalty", side: "home", playerId: "p7", defenderId: "m_p1", success: false }], { stage: "penalties" });
  assert.deepEqual(S.emotesOf(pens.prev, pens.next), [], "승부차기");
  const toPens = pair(300, [{ ...tackle, turn: 300 }, { turn: 300, type: "penalties" }]);
  assert.deepEqual(S.emotesOf(toPens.prev, toPens.next), [], "승부차기로 넘어가는 턴");
  const t = pair(50, [tackle]);
  assert.deepEqual(S.emotesOf(null, t.next), [], "prev 없음 (시작 · 이어하기 · ⏭ 뒤)");
  assert.deepEqual(S.emotesOf(t.prev, { turn: 51, stage: "regular", events: [tackle] }), [], "이번 턴 이벤트 없음");
});

test("emotesOf: 한 선수는 한 턴에 하나 (뒤 이벤트) · 최대 EMOTE_MAX (뒤에서부터)", () => {
  // 태클로 딴 선수가 같은 턴에 슛 → 선방: 그 선수는 lose (뒤 이벤트)
  const a = pair(60, [
    { turn: 60, type: "tackle", side: "away", tacklerId: "m_p2", carrierId: "p6", success: true },
    { turn: 60, type: "shot", side: "away", playerId: "m_p2", success: false },
    { turn: 60, type: "save", side: "home", gkId: "p1" },
  ], { holder: { side: "home", id: "p6" } });
  assert.deepEqual(brief(S.emotesOf(a.prev, a.next)), ["lose/tackle/home:p6", "win/save/home:p1", "lose/save/away:m_p2"]);
  const evs = [];
  for (let i = 0; i < 5; i++) evs.push({ turn: 70, type: "tackle", side: "away", tacklerId: `m_t${i}`, carrierId: `c${i}`, success: true });
  const b = pair(70, evs);
  const out = S.emotesOf(b.prev, b.next);
  assert.equal(S.EMOTE_MAX, 6);
  assert.equal(out.length, 6);
  assert.deepEqual(brief(out).slice(0, 2), ["win/tackle/away:m_t2", "lose/tackle/home:c2"], "뒤 6개");
});

/**
 * 독립 기대값 (엔진 공 상태로 마지막 공 가진 선수를 따라간다 — emotesOf 의 이벤트 목록 거꾸로 읽기와 다른 길):
 * 턴 전 공 가진 선수 · 날던 패스를 찬 선수에서 출발해 이번 턴 이벤트를 차례로 — 태클 · 가로채기 · 공중볼 · 선방 · 흘러나온 공.
 */
const otherOf = (s) => (s === "home" ? "away" : "home");
function oracleEmotes(before, lastIn, evs) {
  const out = new Map();
  const put = (side, id, kind, cause) => { const k = `${side}:${id}`; out.delete(k); out.set(k, `${kind}/${cause}/${k}`); };
  let last = before.holder ? { ...before.holder } : before.flight ? { side: before.flight.side, id: before.flight.passerId } : lastIn;
  let passer = before.flight ? { side: before.flight.side, id: before.flight.passerId } : null;
  let shooter = null;
  for (const e of evs) {
    switch (e.type) {
      case "pass": passer = { side: e.side, id: e.from }; last = { ...passer }; break;
      case "receive": last = { side: e.side, id: e.playerId }; passer = null; break;
      case "kickoff": last = { side: e.side, id: e.playerId }; break;
      case "tackle": if (e.success) { put(e.side, e.tacklerId, "win", "tackle"); put(otherOf(e.side), e.carrierId, "lose", "tackle"); last = { side: e.side, id: e.tacklerId }; } break;
      case "intercept": if (e.success) { put(e.side, e.defenderId, "win", "intercept"); assert.ok(passer, "가로챈 패스를 찬 선수"); put(passer.side, passer.id, "lose", "intercept"); last = { side: e.side, id: e.defenderId }; passer = null; } break;
      case "aerial": if (!e.success) { put(otherOf(e.side), e.defenderId, "win", "aerial"); assert.ok(passer, "진 크로스를 찬 선수"); put(passer.side, passer.id, "lose", "aerial"); last = { side: otherOf(e.side), id: e.defenderId }; passer = null; } break;
      case "shot": shooter = { side: e.side, id: e.playerId }; last = shooter; break;
      case "save": put(e.side, e.gkId, "win", "save"); put(shooter.side, shooter.id, "lose", "save"); last = { side: e.side, id: e.gkId }; break;
      case "loose": passer = null; break;
      case "looseWon":
        if (last && last.side !== e.side) { put(e.side, e.playerId, "win", "loose"); put(last.side, last.id, "lose", "loose"); }
        last = { side: e.side, id: e.playerId }; passer = null; break;
      default: break;
    }
  }
  return { list: [...out.values()].slice(-S.EMOTE_MAX), last };
}

test("emotesOf: 엔진 경기 (친선 · 목표 경기 + 양쪽 AI 필살기) — 턴마다 독립 기대값과 정확히 같다 (누가 · win/lose · 까닭 · 차례 · key), 다섯 규칙이 모두 나온다", () => {
  const seen = { tackle: 0, intercept: 0, aerial: 0, save: 0, loose: 0, quiet: 0 };
  let rnd = 12345;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const run = (seed, kind, ults) => {
    const su = PR.practiceSetup(LR, data, seed);
    const st = HM.createMatch({ data, seed: su.seed, home: su.home, away: su.away, possessions: su.possessions, kind });
    if (ults) HM.setAutoBoth(st);
    let last = st.ball.holder ? { ...st.ball.holder } : null;
    for (let guard = 0; !st.finished && guard < 3000; guard++) {
      if (ults) for (const s of ["home", "away"]) for (const lv of Object.values(st.live[s])) if (typeof lv.gauge === "number" && rand() < 0.02) lv.gauge = 100;
      const before = clone({ holder: st.ball.holder || null, flight: st.ball.flight || null });
      const snap = S.sceneSnap(st);
      const n0 = st.events.length;
      HM.step(st, data);
      const evs = st.events.slice(n0);
      const out = S.emotesOf(snap, st);
      const o = oracleEmotes(before, last, evs);
      last = o.last;
      const quiet = st.stage === "penalties" || evs.some((e) => ["goal", "kickoff", "penalty", "penalties"].includes(e.type));
      if (quiet) { seen.quiet++; assert.deepEqual(out, [], `${seed} 턴 ${st.turn} 조용한 턴`); continue; }
      assert.deepEqual(brief(out), o.list, `${seed} 턴 ${st.turn}: ${evs.map((e) => e.type).join(",")}`);
      for (const m of out) {
        assert.equal(m.key, `${st.turn}:${m.side}:${m.id}:${m.kind}`);
        assert.ok(st[m.side].players.some((p) => String(p.id) === m.id), `턴 ${st.turn} 말풍선 선수 ${m.side}:${m.id}`);
        if (m.kind === "win") seen[m.cause]++;
      }
    }
    assert.ok(st.finished, `${seed} 끝까지`);
  };
  for (let i = 0; i < 8; i++) { run(`emo-full-${i}`, "friendly", false); run(`emo-goal-${i}`, "goal", true); }
  for (const k of ["tackle", "intercept", "aerial", "save", "loose", "quiet"]) assert.ok(seen[k] > 0, `${k} 가 나온다 ${JSON.stringify(seen)}`);
});

test("emoteSpot: 필드 영역 안으로 자른다 — 위 = top + 말풍선 높이 (시계 · 점수 밑), 아래 = H − 2, 옆 = 반폭 + 2, 안쪽은 그대로", () => {
  const W = 915, H = 300, bw = 34, bh = 38, top = 16;
  assert.deepEqual(S.emoteSpot({ x: 400, y: 150 }, bw, bh, W, H, top), { x: 400, y: 150 }, "안쪽 그대로");
  assert.deepEqual(S.emoteSpot({ x: 400, y: -40 }, bw, bh, W, H, top), { x: 400, y: top + bh }, "위로 나가면 시계 · 점수 밑");
  assert.deepEqual(S.emoteSpot({ x: 400, y: top + bh - 1 }, bw, bh, W, H, top), { x: 400, y: top + bh });
  assert.deepEqual(S.emoteSpot({ x: 400, y: H + 50 }, bw, bh, W, H, top), { x: 400, y: H - 2 }, "아래 (필살기 띠 위)");
  assert.deepEqual(S.emoteSpot({ x: -30, y: 150 }, bw, bh, W, H, top), { x: bw / 2 + 2, y: 150 }, "왼쪽");
  assert.deepEqual(S.emoteSpot({ x: W + 5, y: 150 }, 50, bh, W, H, top), { x: W - 25 - 2, y: 150 }, "오른쪽 (말풍선 폭만큼)");
  assert.deepEqual(S.emoteSpot({ x: W + 5, y: -5 }, bw, bh, W, H, top), { x: W - bw / 2 - 2, y: top + bh }, "모서리");
});

/* ------------------------------------------------------------------ */
/* 2) 화면 (jsdom)                                                      */
/* ------------------------------------------------------------------ */

const setupOf = (seed) => PR.practiceSetup(LR, data, seed);
const createFrom = (setup) => HM.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
function fillGauges(st, sides) {
  for (const s of sides) for (const lv of Object.values(st.live[s])) if (typeof lv.gauge === "number") lv.gauge = 100;
}
/**
 * 시드들을 돌며 pred(이번 step 이벤트, 말풍선, step 전 상태) 를 처음 만족하는 step → { setup, before (사본), n: 그 step 전 step 수, evs, emotes }.
 * init(st) = 경기를 만든 직후 손으로 놓기 (게이지 — 화면도 같은 상태에서 같은 step 을 한다).
 */
function findStep(pred, { seeds = 30, init = null, maxSteps = 300, prefix = "emo" } = {}) {
  for (let k = 0; k < seeds; k++) {
    const setup = setupOf(`${prefix}-${k}`);
    const st = createFrom(setup);
    if (init) init(st);
    for (let n = 0; n < maxSteps && !st.finished; n++) {
      const before = clone(st);
      const snap = S.sceneSnap(st);
      const n0 = st.events.length;
      HM.step(st, data);
      const evs = st.events.slice(n0);
      const emotes = S.emotesOf(snap, st);
      if (n >= 3 && pred(evs, emotes, before)) return { setup, before, n, evs, emotes };
    }
  }
  return null;
}

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
  const views = { last: null, cam: null, frames: 0, none: false, anim: false };
  PX.setHexViewFactoryForTest(() => (views.none ? null : {
    renderer: "webgl", dirty: true,
    // views.anim = 캐릭터가 있는 선수를 모두 움직이는 스프라이트로 그린다고 답한다 (낮은 자세 말풍선 시험)
    spriteKind(charId) { return views.anim && charId ? "anim" : null; },
    draw(frame, cam) { views.last = frame; views.cam = cam; views.frames++; },
    destroy() {}, isLost() { return false; },
  }));
  const errors = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  const doc = window.document;
  const ctx = { store: ST.store, data, hexMatch: HM, run: { getMatchSetup: () => ctx.setup }, setup: null, actions: { finishMatch: () => {}, resetToStart: () => {} } };
  env = { window, doc, raf, views, errors, ctx, root: doc.getElementById("app"), modalRoot: doc.getElementById("modal-root") };
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
const shown = () => [...scrOf().querySelectorAll(".hx-field > .hx-emote")].filter((el) => !el.hidden && !el.classList.contains("hx-paused"));
/** 연습 모드로 상태 st (step n 번 한 것) 를 띄운다 */
function mount(setup, st, { speed = 1 } = {}) {
  leave();
  env.ctx.setup = setup;
  env.ctx.matchMode = { label: "연습 경기", getSetup: () => setup, stateKey: "practiceMatch", save: null, onFinish: () => {}, exits: [] };
  ST.store.practiceMatch = st;
  ST.store.matchUi.speed = speed;
  SCR.renderHexMatch(env.root, env.ctx);
  assert.ok(scrOf(), "육각 화면");
  return scrOf();
}

/** 그 step 전 상태에서 1 + n step 안에 골이 나는가 (골 턴은 말풍선을 지운다 — 길이를 재는 장면에서 뺀다) */
function goalSoon(before, n = 10) {
  const st = clone(before);
  for (let i = 0; i <= n && !st.finished; i++) {
    const n0 = st.events.length;
    HM.step(st, data);
    if (st.events.slice(n0).some((e) => e.type === "goal")) return true;
  }
  return false;
}
/** 태클 성공 턴 (말풍선 정확히 둘 · 컷인 · 골 · 킥오프 없음 · 그 뒤 10 step 안에 골 없음) */
let TACKLE = null;
function tackleScene() {
  TACKLE ||= findStep((evs, emotes, before) => emotes.length === 2 && evs.some((e) => e.type === "tackle" && e.success)
    && !evs.some((e) => ["cutin", "combo", "intercept", "save", "looseWon", "aerial"].includes(e.type) || e.reverseCutin) && !goalSoon(before));
  assert.ok(TACKLE, "태클 성공 장면");
  return TACKLE;
}
/** 닿는 순간 진행도 (화면 release 와 같은 식 — hexPixi ONE_SHOT_MIN 150) */
const contactAt = (speed) => Math.min(0.75, S.BALL_RELEASE * Math.max(PX.ONE_SHOT_MIN, TICK / speed) / (TICK / speed));

test("화면: 태클 성공 턴 = 말풍선 둘 (태클한 선수 '!!' win · 태클당한 선수 '💦' lose) 이 닿는 순간에 머리 위 · 따라감 · 900 ms 뒤 사라짐", { skip }, async () => {
  setup();
  const sc = tackleScene();
  const tk = sc.evs.find((e) => e.type === "tackle" && e.success);
  const st = clone(sc.before);
  const scr = mount(sc.setup, st);
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.equal(st.turn, sc.before.turn + 1);
  assert.equal(shown().length, 0, "step 직후 (보간 0) 는 없음");
  const t = await pumpUntil(() => shown().length > 0, 1000);
  const at = contactAt(1) * TICK;
  assert.ok(t >= at - 32 && t <= at + 16, `닿는 순간 ≈ ${Math.round(at)} ms (${t} ms)`);
  const els = shown();
  assert.equal(els.length, 2, "정확히 둘");
  const win = els.find((el) => el.classList.contains("hx-emote-win"));
  const lose = els.find((el) => el.classList.contains("hx-emote-lose"));
  assert.ok(win && lose, els.map((el) => el.className).join(" | "));
  assert.equal(win.textContent, "!!", "태클로 뺏으면 '!!'");
  assert.ok(win.classList.contains("hx-emote-steal") && win.classList.contains(`hx-${tk.side}`));
  assert.equal(lose.textContent, "💦");
  assert.equal(win.dataset.key, `${st.turn}:${tk.side}:${tk.tacklerId}:win`);
  assert.equal(lose.dataset.key, `${st.turn}:${tk.side === "home" ? "away" : "home"}:${tk.carrierId}:lose`);
  for (const el of els) {
    for (const c of el.classList) assert.ok(c.startsWith("hx-"), `클래스 '${c}' 는 hx- 앞머리`);
    assert.equal(el.getAttribute("aria-hidden"), "true");
    const b = el.querySelector(".hx-emote-b");
    assert.equal(b.style.getPropertyValue("--hx-emo"), "900ms", "길이 900 ms (1배속)");
  }
  // 머리 위: 그 프레임의 머리 점 × 카메라. 띄운 턴에 그 턴 끝 공을 가질 선수 (태클한 선수) 는 처음부터 이름표 높이 (jsdom 18) + 2 만큼 위
  // (이름표는 넘기는 때 뒤에 뜬다), 공을 잃은 선수는 머리 점 그대로
  const holder = st.ball.holder;
  assert.ok(holder && holder.side === tk.side && String(holder.id) === String(tk.tacklerId), "태클한 선수가 공을 가진다");
  const check = (label) => {
    const fr = env.views.last;
    for (const m of dbg().emotes) {
      const p = fr.players.find((x) => x.key === `${m.side}:${m.id}`);
      const pt = S.camPoint(S.headPoint(p), env.views.cam, 1244, 528);
      const lifted = m.side === tk.side && m.id === String(tk.tacklerId);
      assert.equal(m.lift, lifted, `${label} ${m.key} 올리기`);
      assert.ok(Math.abs(m.x - pt.x) <= 1, `${label} x ${m.x} ≈ 머리 ${pt.x}`);
      assert.ok(Math.abs(m.y - (pt.y - (lifted ? 20 : 0))) <= 0.11, `${label} y ${m.y} = 머리 ${pt.y}${lifted ? " − 20 (이름표 위)" : ""}`);
      const el = scrOf().querySelector(`.hx-emote[data-key="${m.key}"]`);
      assert.ok(el.style.transform.startsWith(`translate(${Math.round(m.x * 10) / 10}px, ${Math.round(m.y * 10) / 10}px)`), el.style.transform);
    }
  };
  check("처음");
  await pump(160);
  check("따라감 (160 ms 뒤 — 보간된 머리 점 · 카메라)");
  // 사라짐: 띄운 뒤 900 ms (다음 턴에도 이어서 따라간다 — 다음 턴들의 말풍선은 key 가 다르다)
  const keys = new Set(sc.emotes.map((m) => m.key));
  const mine = () => dbg().emotes.filter((m) => keys.has(m.key));
  assert.equal(mine().length, 2, "같은 턴 안에서 다시 띄우지 않는다 (key)");
  const gone = await pumpUntil(() => mine().length === 0, 2000);
  assert.ok(gone + 160 >= 900 - 32 && gone + 160 <= 900 + 32, `길이 ≈ 900 ms (${gone + 160})`);
  for (const k of keys) assert.equal(scrOf().querySelector(`.hx-emote:not([hidden])[data-key="${k}"]`), null, `그 턴 말풍선 DOM 도 숨김 (${k})`);
  assert.ok(scrOf().querySelectorAll(".hx-field > .hx-emote").length <= S.EMOTE_MAX, "풀 ≤ 6");
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 움직이는 스프라이트의 낮은 자세 (태클 · 넘어짐) 면 말풍선을 키의 몫만큼 내리고, 자세가 풀리면 부드럽게 머리 위로", { skip }, async () => {
  setup();
  const LOW = { tackle: 0.33, fall: 0.25 }; // hexMatch EMOTE_LOW
  const sc = tackleScene();
  const st = clone(sc.before);
  env.views.anim = true;
  try {
    mount(sc.setup, st);
    await pumpUntil(() => dbg().steps === 1, 3000);
    await pumpUntil(() => shown().length > 0, 1000);
    const fr = env.views.last;
    const z = env.views.cam.z;
    let low = 0;
    for (const m of dbg().emotes) {
      const p = fr.players.find((x) => x.key === `${m.side}:${m.id}`);
      assert.ok(p.charId, "연습 선수는 캐릭터가 있다");
      const want = (LOW[p.act] || 0) * p.figure.fh * z;
      if (want > 0) low += 1;
      // 처음 프레임은 바로 그 자리 (이름표가 같은 선수 위면 내리지 않는다)
      const pt = S.camPoint(S.headPoint(p), env.views.cam, 1244, 528);
      if (m.drop > 0) assert.ok(Math.abs(m.drop - Math.round(want * 10) / 10) <= 0.11 && Math.abs(m.y - (pt.y + want)) <= 1, `${p.act} 내림 ${m.drop} ≈ ${want} · y ${m.y} ≈ ${pt.y + want}`);
      else assert.ok(want === 0 || m.y < pt.y, `${p.act}: 안 내리면 이름표 위 (${m.y} < ${pt.y})`);
    }
    assert.ok(low >= 1, "태클한 선수 (act tackle) 는 낮은 자세");
    assert.ok(dbg().emotes.some((m) => m.drop > 0), "적어도 하나는 내려감");
    // 자세가 바뀌면 (다음 턴들) 내림이 한 번에 뛰지 않고 따라간다: 프레임마다 바뀌는 양 ≤ 몫 전체의 1/4
    let prev = new Map(dbg().emotes.map((m) => [m.key, m.drop]));
    for (let i = 0; i < 30 && dbg().emotes.length; i++) {
      await pump(16);
      for (const m of dbg().emotes) {
        if (prev.has(m.key)) assert.ok(Math.abs(m.drop - prev.get(m.key)) <= 0.25 * 0.33 * 240 * z + 0.2, `한 프레임 ${prev.get(m.key)} → ${m.drop}`);
      }
      prev = new Map(dbg().emotes.map((m) => [m.key, m.drop]));
    }
  } finally {
    env.views.anim = false;
    leave();
  }
  assert.deepEqual(env.errors, []);
});

test("화면: 한 선수 머리 위에는 말풍선 하나 — 다음 턴에 같은 선수가 또 받으면 지난 턴 것을 바꾼다 (겹치지 않게)", { skip }, async () => {
  setup();
  // 연달아 두 턴 말풍선이 있고 같은 선수가 두 턴 다 받는 장면 (컷인 · 역컷인 없음 — 시간이 그대로 흐르게)
  const calm = (evs) => !evs.some((e) => ["cutin", "combo"].includes(e.type) || e.reverseCutin);
  let sc = null;
  for (let k = 0; k < 40 && !sc; k++) {
    const setup = setupOf(`emo2-${k}`);
    const st = createFrom(setup);
    let prev = null;
    for (let n = 0; n < 300 && !st.finished && !sc; n++) {
      const before = clone(st);
      const snap = S.sceneSnap(st);
      const n0 = st.events.length;
      HM.step(st, data);
      const evs = st.events.slice(n0);
      const emotes = S.emotesOf(snap, st);
      const cur = { before, evs, emotes };
      if (n >= 4 && prev && prev.emotes.length && emotes.length && calm(prev.evs) && calm(evs)
        && emotes.some((m) => prev.emotes.some((q) => q.side === m.side && q.id === m.id))) sc = { setup, before: prev.before, first: prev.emotes, second: emotes };
      prev = cur;
    }
  }
  assert.ok(sc, "연달아 같은 선수가 말풍선을 받는 장면");
  const st = clone(sc.before);
  mount(sc.setup, st);
  await pumpUntil(() => dbg().steps === 1, 3000);
  const k1 = new Set(sc.first.map((m) => m.key));
  assert.ok((await pumpUntil(() => dbg().emotes.some((m) => k1.has(m.key)), 1000)) >= 0, "첫 턴 말풍선");
  await pumpUntil(() => dbg().steps === 2, 3000);
  const k2 = new Set(sc.second.map((m) => m.key));
  assert.ok((await pumpUntil(() => dbg().emotes.some((m) => k2.has(m.key)), 1000)) >= 0, "다음 턴 말풍선");
  const list = dbg().emotes;
  const who = list.map((m) => `${m.side}:${m.id}`);
  assert.equal(new Set(who).size, who.length, `선수마다 하나: ${list.map((m) => m.key).join(", ")}`);
  for (const m of sc.second) {
    const now = list.find((x) => x.side === m.side && x.id === m.id);
    assert.equal(now?.key, m.key, `${m.side}:${m.id} 는 새 턴 말풍선`);
  }
  // DOM 도 같은 선수 둘이 아니다
  const vis = shown().map((el) => el.dataset.key.split(":").slice(1, 3).join(":"));
  assert.equal(new Set(vis).size, vis.length, vis.join(", "));
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 배속 — 길이 = 900 ms ÷ 배속 (바닥 450 ms), 닿는 순간도 그 배속의 release", { skip }, async () => {
  setup();
  const sc = tackleScene();
  for (const [speed, dur] of [[2, 450], [4, 450]]) {
    const st = clone(sc.before);
    mount(sc.setup, st, { speed });
    await pumpUntil(() => dbg().steps === 1, 3000);
    const t = await pumpUntil(() => shown().length > 0, 1000, 8);
    const at = contactAt(speed) * TICK / speed;
    assert.ok(t >= at - 24 && t <= at + 8, `${speed}x 닿는 순간 ≈ ${Math.round(at)} ms (${t})`);
    assert.equal(shown().length, 2);
    for (const el of shown()) assert.equal(el.querySelector(".hx-emote-b").style.getPropertyValue("--hx-emo"), `${dur}ms`, `${speed}x 길이`);
    assert.ok(dbg().emotes.every((m) => m.dur === dur));
    const keys = new Set(sc.emotes.map((m) => m.key));
    const gone = await pumpUntil(() => !dbg().emotes.some((m) => keys.has(m.key)), 2000, 8);
    assert.ok(Math.abs(gone - dur) <= 24, `${speed}x 사라짐 ${gone} ≈ ${dur}`);
  }
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: ⏭ 뒤에는 말풍선 없음 · 캔버스 없는 대체 화면에도 없음", { skip }, async () => {
  setup();
  const sc = tackleScene();
  mount(sc.setup, clone(sc.before));
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.ok(await pumpUntil(() => shown().length === 2, 1000) >= 0);
  scrOf().querySelector(".skip-btn").click();
  await pump(32);
  assert.equal(shown().length, 0, "⏭ 이 지운다");
  assert.deepEqual(dbg().emotes, []);
  assert.equal([...scrOf().querySelectorAll(".hx-emote")].filter((el) => !el.hidden).length, 0);
  // 대체 화면 (view 없음)
  env.views.none = true;
  try {
    const st = clone(sc.before);
    const scr = mount(sc.setup, st);
    await pumpUntil(() => dbg().steps === 1, 3000);
    await pump(TICK);
    assert.equal(dbg().renderer, "fallback");
    assert.equal(scr.querySelector(".hx-fallback").hidden, false);
    assert.equal(scr.querySelectorAll(".hx-emote").length, 0, "대체 화면 = 말풍선 없음");
  } finally {
    env.views.none = false;
  }
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 턴 전 컷인 동안은 말풍선 없음 → 컷인 뒤 그 턴의 닿는 순간에", { skip }, async () => {
  setup();
  const sc = findStep((evs, emotes) => emotes.length > 0 && evs.some((e) => e.type === "cutin") && !evs.some((e) => e.reverseCutin || e.type === "combo"),
    { init: (st) => fillGauges(st, ["away"]), prefix: "emc", seeds: 40 });
  assert.ok(sc, "컷인 + 말풍선 장면");
  // 같은 init (게이지) 으로 그 step 전 상태를 화면에
  mount(sc.setup, clone(sc.before));
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.ok(dbg().ult.cut, "턴 전 컷인");
  let frames = 0;
  while (dbg().ult.cut || dbg().ult.hold) {
    assert.equal(shown().length, 0, "컷인 동안 말풍선 없음");
    frames++;
    await pump(16);
  }
  assert.ok(frames > 10, `컷인이 돌았다 (${frames})`);
  const t = await pumpUntil(() => shown().length > 0, 1000);
  assert.ok(t >= contactAt(1) * TICK - 48 && t <= contactAt(1) * TICK + 16, `컷인 뒤 닿는 순간 (${t} ms)`);
  assert.deepEqual(dbg().emotes.map((m) => m.key).sort(), sc.emotes.map((m) => m.key).sort());
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 역컷인 (그 턴 그림 뒤) 동안은 말풍선을 숨기고 시간을 멈춘다 → 끝나면 남은 시간만큼 다시", { skip }, async () => {
  setup();
  // 다음 step 이 또 턴 전 컷인이면 (그것도 말풍선을 멈춘다) 이 시험의 "끝나면 다시" 를 볼 수 없다 — 그런 장면은 뺀다
  const cutinNext = (before) => {
    const st = clone(before);
    HM.step(st, data);
    const n0 = st.events.length;
    HM.step(st, data);
    return st.events.slice(n0).some((e) => e.type === "cutin" || e.type === "combo");
  };
  const sc = findStep((evs, emotes, before) => emotes.length > 0 && evs.some((e) => e.reverseCutin) && !evs.some((e) => e.type === "cutin" || e.type === "combo") && !cutinNext(before),
    { init: (st) => { HM.setAutoBoth(st); fillGauges(st, ["home", "away"]); }, prefix: "emr", seeds: 60, maxSteps: 400 });
  assert.ok(sc, "역컷인 + 말풍선 장면 (턴 전 컷인 없음 — 지난 턴부터 날던 필살 패스 등)");
  const st = clone(sc.before);
  mount(sc.setup, st);
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.ok(await pumpUntil(() => shown().length > 0, 1000) >= 0, "닿는 순간 말풍선");
  assert.ok(await pumpUntil(() => dbg().ult.cut?.kind === "reverse", 1000) >= 0, "역컷인");
  await pump(16);
  const left0 = dbg().emotes.map((m) => m.left);
  assert.ok(left0.length > 0 && left0.every((x) => x > 0));
  assert.equal(shown().length, 0, "역컷인 동안 숨김");
  assert.ok(dbg().emotes.every((m) => m.paused), "hx-paused");
  await pump(200);
  assert.deepEqual(dbg().emotes.map((m) => m.left), left0, "시간 멈춤");
  await pumpUntil(() => !dbg().ult.cut, 3000);
  await pump(16);
  assert.ok(shown().length > 0, "역컷인 뒤 다시 보인다");
  assert.ok(dbg().emotes.every((m) => !m.paused));
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 골 턴 — 지난 턴 말풍선도 '골!' 배너와 함께 지운다 · 골 턴에는 새 말풍선 없음", { skip }, async () => {
  setup();
  // 말풍선이 난 step 바로 다음 step 이 골
  let sc = null;
  for (let k = 0; k < 30 && !sc; k++) {
    const su = setupOf(`emg-${k}`);
    const st = createFrom(su);
    let prevHad = null;
    for (let n = 0; n < 300 && !st.finished; n++) {
      const before = clone(st);
      const snap = S.sceneSnap(st);
      const n0 = st.events.length;
      HM.step(st, data);
      const evs = st.events.slice(n0);
      if (prevHad && evs.some((e) => e.type === "goal") && !evs.some((e) => e.type === "cutin")) { sc = { setup: su, before: prevHad.before, emotes: prevHad.emotes }; break; }
      const em = S.emotesOf(snap, st);
      prevHad = em.length && !evs.some((e) => e.type === "cutin" || e.reverseCutin) ? { before, emotes: em } : null;
    }
  }
  assert.ok(sc, "말풍선 턴 → 골 턴 장면");
  const scr = mount(sc.setup, clone(sc.before));
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.ok(await pumpUntil(() => shown().length > 0, 1000) >= 0, "말풍선 턴");
  await pumpUntil(() => dbg().steps === 2, 2000);
  await pump(16);
  assert.ok(scr.querySelector(".hx-banner").classList.contains("hx-goal"), "골 턴");
  assert.equal(shown().length, 0, "골 턴 = 말풍선 없음 (지난 턴 것도)");
  assert.deepEqual(dbg().emotes, []);
  await pump(TICK + 400);
  assert.equal(shown().length, 0, "골 장면 동안도 없음");
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 이름표 위 올리기는 뛰지 않는다 — 태클 턴 + 다음 두 턴 동안 (말풍선 y − 머리 y) 가 프레임마다 거의 그대로 (이름표가 떠나면 미끄러져 내려옴), 이름표가 뜨면 말풍선은 이미 그 위", { skip }, async (t) => {
  setup();
  const sc = tackleScene();
  const tk = sc.evs.find((e) => e.type === "tackle" && e.success);
  const st = clone(sc.before);
  const scr = mount(sc.setup, st);
  const nameEl = scr.querySelector(".hx-name");
  await pumpUntil(() => dbg().steps === 1, 3000);
  await pumpUntil(() => shown().length > 0, 1000);
  const winKey = `${st.turn}:${tk.side}:${tk.tacklerId}:win`;
  const st0 = st.turn;
  let down = false;
  const prevOff = new Map();
  let tagFrames = 0;
  let frames = 0;
  while (dbg().steps <= 3 && frames < 400) {
    const fr = env.views.last;
    for (const m of dbg().emotes) {
      if (m.paused) { prevOff.delete(m.key); continue; }
      const p = fr.players.find((x) => x.key === `${m.side}:${m.id}`);
      const pt = S.camPoint(S.headPoint(p), env.views.cam, 1244, 528);
      const off = m.y - pt.y;
      if (prevOff.has(m.key)) assert.ok(Math.abs(off - prevOff.get(m.key)) <= 4, `${m.key} 한 프레임 ${prevOff.get(m.key).toFixed(1)} → ${off.toFixed(1)} (턴 ${dbg().turn})`);
      prevOff.set(m.key, off);
      if (m.key === winKey && dbg().turn > st0 && nameEl.textContent !== p.name && off > -1) down = true;
      // 태클 턴에 이름표가 이 선수 위에 뜨면 말풍선 꼬리 끝은 이미 이름표 위 (jsdom 이름표 18 + 2)
      if (!nameEl.hidden && nameEl.textContent === p.name && m.key === winKey && dbg().turn === st0) {
        tagFrames++;
        assert.ok(off <= -20 + 0.11, `이름표 위 (${off.toFixed(1)})`);
      }
    }
    await pump(16);
    frames++;
  }
  assert.ok(tagFrames > 3, `태클한 선수 이름표가 말풍선 아래에 떴다 (${tagFrames} 프레임)`);
  t.diagnostic(`이름표가 떠난 뒤 머리 위로 내려옴: ${down}`);
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 낮은 자세 · 올리기 섞여도 (움직이는 스프라이트) 120 턴 동안 말풍선이 머리에서 한 번에 뛰지 않는다", { skip }, async () => {
  setup();
  env.views.anim = true;
  try {
    const su = setupOf("emo-hop");
    const st = createFrom(su);
    mount(su, st);
    const prevOff = new Map();
    let checked = 0;
    for (let i = 0; i < 4000 && dbg().steps < 120 && !st.finished; i++) {
      await pump(16);
      const fr = env.views.last;
      const z = env.views.cam.z;
      for (const m of dbg().emotes) {
        if (m.paused) { prevOff.delete(m.key); continue; }
        const p = fr.players.find((x) => x.key === `${m.side}:${m.id}`);
        const pt = S.camPoint(S.headPoint(p), env.views.cam, 1244, 528);
        const off = m.y - pt.y;
        // 목표 사이 가장 큰 거리 (낮은 자세 0.33 × 키 + 이름표 20) 의 한 프레임 몫 (EMOTE_LOW_TAU 90 ms · 16 ms) + 여유
        const lim = (0.33 * p.figure.fh * z + 20) * (1 - Math.exp(-16 / 90)) + 1;
        if (prevOff.has(m.key)) { assert.ok(Math.abs(off - prevOff.get(m.key)) <= lim, `${m.key} 한 프레임 ${prevOff.get(m.key).toFixed(1)} → ${off.toFixed(1)} (≤ ${lim.toFixed(1)})`); checked++; }
        prevOff.set(m.key, off);
      }
    }
    assert.ok(checked > 200, `잰 프레임 ${checked}`);
  } finally {
    env.views.anim = false;
    leave();
  }
  assert.deepEqual(env.errors, []);
});

test("화면: 4배속 · 20 fps (50 ms 프레임) 에도 태클 턴 말풍선 둘이 빠지지 않는다 (닿는 순간 창에 프레임이 없으면 다음 step 직전에)", { skip }, async () => {
  setup();
  const sc = tackleScene();
  const keys = new Set(sc.emotes.map((m) => m.key));
  for (const dt of [50, 66]) {
    mount(sc.setup, clone(sc.before), { speed: 4 });
    const got = new Set();
    for (let i = 0; i < 200 && dbg().steps < 3; i++) {
      await pump(dt, dt);
      for (const m of dbg().emotes) if (keys.has(m.key)) got.add(m.key);
    }
    assert.deepEqual([...got].sort(), [...keys].sort(), `${dt} ms 프레임: 태클 턴 말풍선 (${[...got].join(", ")})`);
  }
  leave();
  assert.deepEqual(env.errors, []);
});

test("화면: 풀 ≤ 6 — 턴마다 6개씩 (시험 목록) 이어 띄워도 .hx-emote 는 6개를 다시 쓰고, 넘치면 남은 시간이 가장 짧은 것부터 바꾼다", { skip }, async () => {
  setup();
  const su = setupOf("emo-pool");
  const st = createFrom(su);
  // 턴마다 다른 6 선수 (양 팀 돌아가며) — 이번 턴 key
  SCR.setHexEmotesForTest((prev, next) => {
    if (!prev) return [];
    const all = [...next.home.players.map((p) => ["home", String(p.id)]), ...next.away.players.map((p) => ["away", String(p.id)])];
    const out = [];
    for (let i = 0; i < S.EMOTE_MAX; i++) {
      const [side, id] = all[(next.turn * 5 + i) % all.length];
      const kind = i % 2 ? "lose" : "win";
      out.push({ side, id, kind, cause: "tackle", key: `${next.turn}:${side}:${id}:${kind}` });
    }
    return out;
  });
  try {
    const scr = mount(su, st, { speed: 2 });
    const els = () => scr.querySelectorAll(".hx-field > .hx-emote").length;
    let full = 0;
    let fresh = 0;
    let at50 = null;
    let prevFull = null;
    for (let i = 0; i < 6000 && dbg().steps < 150 && !st.finished; i++) {
      await pump(16);
      assert.ok(els() <= S.EMOTE_MAX, `.hx-emote ${els()} ≤ 6 (step ${dbg().steps})`);
      assert.ok(dbg().emotes.length <= S.EMOTE_MAX && shown().length <= S.EMOTE_MAX);
      const turnsNow = new Set(dbg().emotes.map((m) => m.key.split(":")[0]));
      if (dbg().emotes.length === S.EMOTE_MAX) {
        full++;
        // 지난 프레임에 지난 턴 것으로 다 찬 상태에서 새 턴 6개를 띄우면 남는 것은 모두 그 턴 것 (남은 시간이 짧은 지난 턴 것부터 바꿨다)
        if (prevFull && turnsNow.size === 1 && !prevFull.has([...turnsNow][0])) fresh++;
      }
      prevFull = dbg().emotes.length === S.EMOTE_MAX ? turnsNow : null;
      if (dbg().steps === 50 && at50 == null) at50 = els();
    }
    assert.ok(dbg().steps >= 150 || st.finished, `step ${dbg().steps}`);
    assert.ok(full > 20 && fresh > 5, `6개 찬 프레임 ${full} · 막 바꾼 새 턴 6개 ${fresh}`);
    assert.equal(at50, S.EMOTE_MAX, "50 step 에 칸 6개");
    assert.equal(els(), at50, "150 step 에도 그대로 (새로 만들지 않고 다시 쓴다)");
  } finally {
    SCR.setHexEmotesForTest(null);
    leave();
  }
  assert.deepEqual(env.errors, []);
});

test("화면: 승부차기 단계가 되면 보이던 말풍선도 지운다", { skip }, async () => {
  setup();
  const sc = tackleScene();
  const st = clone(sc.before);
  mount(sc.setup, st);
  await pumpUntil(() => dbg().steps === 1, 3000);
  assert.ok(await pumpUntil(() => shown().length === 2, 1000) >= 0);
  st.stage = "penalties"; // 화면이 그리는 같은 상태 (다음 step 전 한 프레임)
  await pump(16);
  assert.equal(shown().length, 0, "승부차기 = 말풍선 없음");
  assert.deepEqual(dbg().emotes, []);
  assert.equal([...scrOf().querySelectorAll(".hx-emote")].filter((el) => !el.hidden).length, 0);
  leave();
});

test("CSS: .hx-emote 규칙은 .match-screen.hex-screen 아래 · 필터 없음 · 움직임 줄이기 = 애니메이션 없음 · 흰 말풍선 꼬리 · 팝 (0 → 1.15 → 1) · 끝 페이드 · 컷인 동안 멈춤", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/match.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").filter((r) => r.includes("hx-emote"));
  assert.ok(rules.length >= 6);
  for (const r of rules) {
    const sel = r.split("{")[0].trim();
    if (!sel.includes("hx-emote") || sel.startsWith("@keyframes") || /^\s*\d+%/.test(sel)) continue;
    const s = sel.replace(/^@media[^{]*\{?\s*/, "");
    for (const part of s.split(",")) assert.ok(part.trim().startsWith(".match-screen.hex-screen") || part.trim().startsWith("@keyframes") || /^\d/.test(part.trim()), `범위: ${part.trim()}`);
    assert.ok(!/(^|[^-])filter\s*:/.test(r) && !/backdrop-filter/.test(r), `필터 없음: ${sel}`);
  }
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.match-screen\.hex-screen \.hx-emote-b \{ animation: none !important; \}/);
  assert.match(css, /\.hx-emote-b::after \{[^}]*border-top: 8px solid #fff/);
  assert.match(css, /\.hx-emote\.hx-paused \{ visibility: hidden; \}/);
  // 컷인 동안 숨기기만 하면 CSS 애니메이션은 계속 돌아 (both 채움 = 투명) 컷인 뒤 보이지 않는 말풍선이 된다 → 멈춤
  assert.match(css, /\.match-screen\.hex-screen \.hx-emote\.hx-paused \.hx-emote-b \{ animation-play-state: paused; \}/);
  assert.match(css, /\.hx-emote-b \{[^}]*animation: hx-emote var\(--hx-emo, 900ms\) linear both;/, "길이 = --hx-emo");
  const kf = css.match(/@keyframes hx-emote \{([\s\S]*?)\n\}/);
  assert.ok(kf, "@keyframes hx-emote");
  assert.match(kf[1], /0% \{ transform: scale\(0\); opacity: 1;/, "팝 시작 = 0");
  assert.match(kf[1], /13% \{ transform: scale\(1\.15\);/, "팝 넘침 1.15");
  assert.match(kf[1], /20% \{ transform: scale\(1\); opacity: 1; \}/, "팝 끝 (길이의 20 %)");
  assert.match(kf[1], /72% \{ transform: scale\(1\); opacity: 1; \}/, "유지");
  assert.match(kf[1], /100% \{ transform: scale\(1\); opacity: 0; \}/, "끝 28 % 페이드");
});
