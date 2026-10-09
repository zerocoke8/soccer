// test/hexUi.test.mjs — 육각 경기 화면 (docs/HEX_AUTOBATTLE_PLAN.md §5 · §6, H1 SPEC §5 · §6 — jsdom): store.setHexMatchForTest(true) 로 켜고
// 실제 흐름 (감독 AI 로 자유 주 → 친선전) 으로 런 경기에 들어간다.
//   화면 골격 (.hex-screen · .mh · .hx-clock "2:00" · 배속 · ⏭) · WebGL 없음 → HTML 대체 화면 (getContext 를 부르지 않는다 — "Not implemented" 소음 없음) ·
//   가짜 view (hexPixi.setHexViewFactoryForTest) 로 draw 프레임 (선수 14명) · 화면이 바뀌면 view 정리 · 배속 1 → 2 → 4 → 1 ·
//   재생 기록 { seed, steps: 37 } 으로 되살리기 · 끄면 옛 경기 화면 · ⏭ → 결과 모달 → [확인] → finishMatch 1회 · 저장 · 상태 비움.
//   되살리기 경우 (seed 가 다른 상태 · 기록은 버림 / skipped 기록 = simulateAuto + 결과 / 끝난 기록 = 열자마자 결과 · 다시 그려도 모달 하나 /
//   [이어하기] = 재생 기록으로) · finishMatch 실패 → 결과를 다시 열고 다시 누르면 한 번만 기록 · discardSave · startRun · replay 가 상태 · 기록을 비운다.
// jsdom 이 없으면 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const PX = await import(pathToFileURL(path.join(ROOT, "js/ui/hexPixi.js")).href);

let JSDOM = null;
let VirtualConsole = null;
try {
  ({ JSDOM, VirtualConsole } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}

test("jsdom: 육각 경기 화면 — 골격 · 대체 화면 · 가짜 view 프레임 · 배속 · 되살리기 · 옛 화면 · ⏭ 결과 → finishMatch 1회", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const noise = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => noise.push(`jsdomError: ${e?.message ?? e}`));
  vc.on("error", (...a) => noise.push(`console.error: ${a.join(" ")}`));
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true, virtualConsole: vc });
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
  const realError = console.error;
  const errors = [];
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  t.after(() => {
    console.error = realError;
    ST.setHexMatchForTest(null);
    PX.setHexViewFactoryForTest(null);
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  assert.equal(ST.isHexMatch(), false, "테스트 기본 = 옛 화면 (location 없이 읽은 store)");
  ST.setHexMatchForTest(true);
  assert.equal(ST.isHexMatch(), true);
  assert.equal(globalThis.WebGLRenderingContext, undefined, "jsdom 에는 WebGL 이 없다");
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  const S = window.__soccer;
  assert.ok(S.hexMatch && typeof S.hexMatch.createMatch === "function", "육각 엔진 모듈 (window.__soccer.hexMatch)");
  assert.equal(S.hexView, null, "육각 화면을 연 적이 없으면 hexView = null");

  // 실제 흐름: 기본 편성으로 런 → 감독 AI 로 친선전이 열린 자유 주까지 (그동안 경기는 옛 엔진으로 자동)
  [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")).click();
  await until(() => S.store.screen === "setup");
  [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("기본 편성으로 시작")).click();
  await until(() => S.store.screen === "run" && S.store.run);
  const playMatch = (setup) => {
    const ms0 = S.match.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
    S.match.simulateAuto(ms0, S.store.data);
    return S.match.getResult(ms0);
  };
  const friendlyOpen = (st) => st.phase === "week" && st.weekOffer?.kind === "free" && st.weekOffer.actions.includes("friendly");
  for (let i = 0; i < 3000 && !friendlyOpen(S.store.run) && S.store.run.phase !== "finished"; i++) S.manager.autoStep(S.store.run, S.store.data, { playMatch });
  assert.ok(friendlyOpen(S.store.run), "친선전이 열린 자유 주");
  S.render();
  const ui = S.store.matchUi;
  ui.speed = 1;
  let finishCalls = 0;
  const origFinish = S.actions.finishMatch;
  S.actions.finishMatch = (r) => { finishCalls++; return origFinish(r); };
  S.actions.weekAction({ type: "friendly" });

  // ---- 골격 ----
  const scr = await until(() => S.store.run.phase === "match" && doc.querySelector(".hex-screen"));
  assert.ok(scr, "육각 경기 화면");
  assert.ok(scr.classList.contains("match-screen") && scr.classList.contains("screen"), ".screen.match-screen.hex-screen");
  assert.equal(scr.dataset.screen, "match");
  assert.equal(doc.getElementById("stage").dataset.mode, "match");
  assert.equal(doc.querySelectorAll(".hex-screen").length, 1);
  assert.equal(S.store.match, null, "옛 엔진 상태는 만들지 않는다");
  const hm = S.store.hexMatch;
  assert.ok(hm && hm.engine === "hex" && hm.version === S.hexMatch.HEX_MATCH_VERSION, "store.hexMatch = 육각 엔진 상태");
  const setup = S.run.getMatchSetup(S.store.run, S.store.data);
  assert.equal(hm.seed, setup.seed, "셋업 seed");
  assert.equal(hm.kind, "friendly");
  assert.deepEqual(JSON.parse(window.localStorage.getItem(ST.KEYS.hexMatch)), { version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: 0 }, "재생 기록 저장");
  for (const sel of [".hx-pitch", ".mh", ".hx-clock", ".hx-ctl", ".hx-banner"]) assert.ok(scr.querySelector(`:scope > ${sel}`), `화면 바로 아래 ${sel}`);
  assert.ok(scr.querySelector(".hx-pitch > .hx-field > .hx-name"), "이름표 층 = 필드 영역");
  assert.ok(scr.querySelector(".mh > .mh-team.home > .nm") && scr.querySelector(".mh > .mh-team.away > .nm"), "팀 이름 (예전 클래스)");
  assert.equal(scr.querySelector(".mh-team.home .nm").textContent, hm.home.name);
  assert.equal(scr.querySelector(".mh-score").textContent, "0 : 0");
  assert.equal(scr.querySelector(".mh-sub").textContent, "친선전 · 정규 시간");
  assert.equal(scr.querySelector(".hx-clock").textContent, "2:00", "시계 2:00 (300턴 × 0.4초)");
  const speedBtn = scr.querySelector(".hx-ctl > button.btn.speed-btn");
  const skipBtn = scr.querySelector(".hx-ctl > button.btn.skip-btn");
  assert.ok(speedBtn && skipBtn, "배속 · ⏭ 버튼");
  assert.equal(skipBtn.textContent, "⏭");
  assert.equal(skipBtn.title, "결과까지 스킵");
  // WebGL 없음 → 캔버스 없이 HTML 안내, 경기는 그대로
  await until(() => S.hexView?.renderer === "fallback");
  assert.equal(S.hexView.renderer, "fallback", "WebGL 이 없으면 대체 화면");
  assert.equal(scr.querySelector("canvas"), null, "캔버스 없음");
  assert.equal(scr.querySelector(".hx-fallback").hidden, false, "대체 안내가 보인다");
  assert.match(scr.querySelector(".hx-fallback").textContent, /이 기기에서는 경기장을 그릴 수 없어요/);
  // 경기는 rAF 로 진행된다 (시작 0.9 초 전체 화면 뒤 한 턴 0.4 초)
  await until(() => S.store.hexMatch.turn >= 4, 6000);
  assert.ok(S.store.hexMatch.turn >= 4, "대체 화면에서도 경기가 돈다");
  assert.equal(S.hexView.steps, S.store.hexMatch.turn, "step 수 = 턴 (정규 시간)");
  assert.equal(JSON.parse(window.localStorage.getItem(ST.KEYS.hexMatch)).steps, S.hexView.steps, "step 마다 재생 기록");
  await until(() => scr.querySelector(".hx-clock").textContent !== "2:00");
  assert.notEqual(scr.querySelector(".hx-clock").textContent, "2:00", "시계가 줄어든다 (4턴 = 1.6초)");

  // ---- 가짜 view: draw 프레임 · 화면이 바뀌면 정리 ----
  const draws = [];
  let destroyed = 0;
  let factoryOpts = null;
  PX.setHexViewFactoryForTest((host, opts) => {
    factoryOpts = opts;
    return { renderer: "webgl", draw: (frame, cam) => draws.push({ frame, cam }), destroy: () => { destroyed++; } };
  });
  S.render();
  const scr2 = await until(() => doc.querySelector(".hex-screen"));
  assert.notEqual(scr2, scr, "새 화면");
  assert.equal(S.store.hexMatch, hm, "store.hexMatch 를 그대로 이어받는다");
  await until(() => draws.length >= 3);
  assert.ok(draws.length >= 3, "가짜 view 에 draw");
  assert.equal(S.hexView.renderer, "webgl");
  assert.equal(factoryOpts.W, 1244, "필드 영역 W (jsdom 기본)");
  assert.equal(factoryOpts.H, 528);
  assert.equal(typeof factoryOpts.onContextLost, "function");
  assert.ok(factoryOpts.resolution >= 1 && factoryOpts.resolution <= 2, "해상도 1 ~ 2");
  for (const d of draws) {
    assert.equal(d.frame.players.length, 14, "선수 14명");
    assert.ok(d.frame.ball && Number.isFinite(d.frame.ball.sx) && Number.isFinite(d.frame.ball.sy), "공");
    assert.ok(d.cam.z >= 1 && d.cam.z <= 2, "카메라 z");
  }
  assert.equal(scr2.querySelector(".hx-fallback").hidden, true, "view 가 있으면 대체 안내는 숨김");
  S.render(); // 화면이 바뀌면 이전 view 를 정리한다
  await until(() => destroyed >= 1);
  assert.equal(destroyed, 1, "이전 화면의 view.destroy 1회");
  PX.setHexViewFactoryForTest(null);

  // ---- 배속 1 → 2 → 4 → 1 ----
  {
    const btn = () => doc.querySelector(".hex-screen .speed-btn");
    assert.equal(btn().textContent, "1x");
    const seen = [];
    for (let i = 0; i < 3; i++) {
      btn().click();
      seen.push([ui.speed, btn().textContent]);
    }
    assert.deepEqual(seen, [[2, "2x"], [4, "4x"], [1, "1x"]], "배속 순환");
  }

  // ---- 되살리기: 재생 기록 { seed, steps: 37 } → 같은 셋업 + 37 step ----
  {
    S.store.hexMatch = null;
    ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: 37 });
    S.render();
    const fresh = S.hexMatch.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
    for (let i = 0; i < 37; i++) S.hexMatch.step(fresh, S.store.data);
    const st = S.store.hexMatch;
    assert.ok(st && st !== hm, "새로 되살린 상태");
    assert.equal(st.turn, fresh.turn, "37 step 뒤 턴");
    assert.deepEqual(st.pos, fresh.pos, "자리도 같다");
    assert.deepEqual(st.score, fresh.score);
    assert.equal(S.hexView.steps, 37);
  }

  // ---- 끄면 옛 경기 화면 (흐름 그대로) ----
  ST.setHexMatchForTest(false);
  S.render();
  {
    const old = await until(() => doc.querySelector(".match-screen"));
    assert.ok(old && !old.classList.contains("hex-screen"), "옛 .match-screen");
    assert.ok(old.querySelector(".pitch > .m-field"), "옛 잔디 · 규칙 영역");
    assert.equal(doc.querySelector(".hex-screen"), null);
    assert.ok(S.store.match && S.store.match.version === 3, "옛 엔진 상태");
  }
  ST.setHexMatchForTest(true);
  S.store.match = null;
  ST.saveMatch(null);
  S.render();
  const scr3 = await until(() => doc.querySelector(".hex-screen"));
  assert.ok(scr3, "다시 육각 화면");

  // ---- 되살리기 경우들 (SPEC §5 만들기 · 이어받기 · 되살리기, §2 continueRun) ----
  const savedHex = () => JSON.parse(window.localStorage.getItem(ST.KEYS.hexMatch));
  const modals = () => doc.querySelectorAll("#modal-root .score-big").length;
  const freshMatch = () => S.hexMatch.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
  {
    // seed 가 다른 메모리 상태 · 재생 기록 → 버리고 새 경기 (steps 0 으로 다시 저장)
    S.store.hexMatch = S.hexMatch.createMatch({ data: S.store.data, seed: "stale-seed", home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
    ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: "stale-seed", steps: 12 });
    S.render();
    assert.equal(S.store.hexMatch.seed, setup.seed, "다른 seed 의 상태는 버린다");
    assert.equal(S.store.hexMatch.turn, 0, "새 경기");
    assert.deepEqual(savedHex(), { version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: 0 }, "새 재생 기록");
  }
  {
    // ⏭ 했던 재생 기록 (skipped) → simulateAuto 로 되살리고 열자마자 결과 · 다시 그려도 결과 모달은 하나
    S.store.hexMatch = null;
    ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: 5, skipped: true });
    S.render();
    const want = freshMatch();
    S.hexMatch.simulateAuto(want, S.store.data);
    assert.ok(S.store.hexMatch.finished, "skipped → 끝까지");
    assert.deepEqual(S.store.hexMatch.score, want.score, "같은 결과 (재생이 정확)");
    assert.equal(modals(), 1, "결과 모달");
    S.render();
    S.render();
    assert.equal(modals(), 1, "다시 그려도 결과 모달 하나");
    assert.equal(doc.querySelectorAll(".hex-screen").length, 1);
    assert.equal(savedHex().skipped, true, "skipped 기록 그대로");
  }
  {
    // 끝까지 간 재생 기록 (skipped 아님) → 열자마자 결과. steps 가 넘쳐도 (999) 끝에서 멈춘다
    const want = freshMatch();
    let n = 0;
    while (!want.finished) { S.hexMatch.step(want, S.store.data); n++; }
    for (const steps of [n, 999]) {
      S.store.hexMatch = null;
      ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps });
      S.render();
      assert.ok(S.store.hexMatch.finished, `steps ${steps} → 끝`);
      assert.equal(S.store.hexMatch.turn, want.turn);
      assert.deepEqual(S.store.hexMatch.score, want.score);
      assert.equal(modals(), 1, `steps ${steps} → 열자마자 결과`);
    }
  }
  {
    // [이어하기] (continueRun): store.hexMatch 를 비우고 화면이 재생 기록으로 되살린다
    ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: setup.seed, steps: 21 });
    const before = S.store.hexMatch;
    S.actions.continueRun();
    assert.equal(S.store.run.phase, "match", "저장된 런 = 경기 phase");
    const st = S.store.hexMatch;
    assert.ok(st && st !== before, "재생 기록으로 새로 되살림");
    const want = freshMatch();
    for (let i = 0; i < 21; i++) S.hexMatch.step(want, S.store.data);
    assert.equal(st.turn, want.turn);
    assert.deepEqual(st.pos, want.pos);
    assert.equal(S.hexView.steps, 21);
    assert.equal(modals(), 0, "아직 안 끝났다 — 모달 없음");
  }
  const scrSkip = await until(() => doc.querySelector(".hex-screen"));

  // ---- ⏭ → 결과 모달 → [확인] → finishMatch 1회 ----
  scrSkip.querySelector(".skip-btn").click();
  assert.ok(S.store.hexMatch.finished, "⏭ = 끝까지");
  assert.equal(JSON.parse(window.localStorage.getItem(ST.KEYS.hexMatch)).skipped, true, "재생 기록 skipped");
  const modal = await until(() => doc.querySelector("#modal-root .score-big"));
  assert.ok(modal, "결과 모달");
  const res = S.store.hexMatch.result;
  assert.equal(modal.textContent, `${res.homeGoals} : ${res.awayGoals}`);
  assert.equal(doc.querySelector("#modal-root h2").textContent, "친선전 결과");
  const rows = [...doc.querySelectorAll("#modal-root .stats-table tbody tr")].map((tr) => tr.firstElementChild.textContent);
  assert.deepEqual(rows, ["슛", "겨루기 승", "골", "패스 (성공/시도)", "가로채기", "태클 성공", "MVP"], "결과 표");
  assert.ok(doc.querySelector("#modal-root .result-verdict"));
  assert.equal(scrSkip.querySelector(".skip-btn").disabled, true, "끝나면 ⏭ 비활성");
  assert.equal(scrSkip.querySelector(".hx-clock").textContent, "경기 종료");
  const okBtn = () => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인");
  // finishMatch 실패 (run.settleMatch 가 아무것도 바꾸기 전에 던진다) → app 이 다시 그리고 화면이 결과를 다시 연다 · 런 · 상태 · 기록 그대로
  {
    const winner = res.winner;
    res.winner = "bogus";
    const runBefore = JSON.stringify(S.store.run);
    const errN = errors.length;
    okBtn().click();
    assert.equal(finishCalls, 1);
    assert.equal(S.store.run.phase, "match", "실패하면 경기 phase 그대로");
    assert.equal(JSON.stringify(S.store.run), runBefore, "런은 바뀌지 않았다");
    assert.equal(modals(), 1, "결과를 다시 연다");
    assert.equal(S.store.hexMatch?.result, res, "store.hexMatch 그대로");
    assert.equal(savedHex().skipped, true, "재생 기록 그대로");
    assert.ok(errors.length > errN, "실패는 console.error (app.js safe)");
    errors.length = errN;
    res.winner = winner;
  }
  const ok = okBtn();
  ok.click();
  ok.click();
  await until(() => S.store.run.phase !== "match");
  assert.notEqual(S.store.run.phase, "match", "경기 phase 를 떠났다");
  assert.equal(finishCalls, 2, "finishMatch 실패 1회 + 다시 눌러 1회 (두 번 눌러도 한 번)");
  assert.equal(window.localStorage.getItem(ST.KEYS.hexMatch), null, "재생 기록 지움");
  assert.equal(S.store.hexMatch, null, "store.hexMatch 비움");
  assert.equal(doc.querySelector(".hex-screen"), null, "육각 화면이 내려갔다");
  await wait(60);

  // ---- 런 경기를 비우는 곳 (SPEC §2): discardSave · startRun · replay 가 store.hexMatch · KEYS.hexMatch 를 함께 비운다 ----
  const dirty = () => {
    S.store.hexMatch = { engine: "hex", version: S.hexMatch.HEX_MATCH_VERSION, seed: "x" };
    ST.saveHexMatch({ version: ST.HEX_SAVE_VERSION, seed: "x", steps: 3 });
    assert.ok(window.localStorage.getItem(ST.KEYS.hexMatch));
  };
  const cleared = (why) => {
    assert.equal(S.store.hexMatch, null, `${why}: store.hexMatch`);
    assert.equal(window.localStorage.getItem(ST.KEYS.hexMatch), null, `${why}: KEYS.hexMatch`);
  };
  dirty();
  S.actions.discardSave();
  cleared("discardSave");
  dirty();
  const dsq = S.store.data.config.defaultSquad;
  S.actions.startRun({
    squad: { ...dsq.slots }, formation: dsq.formation || "2-2-2", supportIds: [...(S.store.data.config.defaultSupports || [])],
    tactics: { ...(S.store.data.config.defaultTactics || {}) }, seed: "hex-clear",
  });
  assert.ok(S.store.run, "새 런");
  cleared("startRun");
  dirty();
  S.actions.replay("hex-clear-2");
  cleared("replay");
  await wait(60);

  // ---- 소음 없음 ----
  assert.deepEqual(noise.filter((m) => /Not implemented|getContext/.test(m)), [], "getContext 소음 없음");
  assert.deepEqual(errors, [], "console.error 없음");
  assert.deepEqual(noise, [], "jsdom 오류 없음");
});
