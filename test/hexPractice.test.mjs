// test/hexPractice.test.mjs — 연습 경기 (시작 화면 [⚽ 연습 경기], 2026-10-09 사용자 요청 — js/ui/practice.js · app.js practiceMatchMode · screens/hexMatch.js 경기 모드 훅).
//   순수: 기본 선수단 스냅샷 = 새 런 (lessonRun.createRun) + config.practice 스탯 · 팀워크 (시즌 3 잘 키운 팀, 2026-10-10) 의 buildTeamSnapshot ·
//   practice 블록이 없으면 새 런 시작 스탯 그대로 · 거울 상대 (side away · '연습 상대' · id 'm_' · charId 그대로).
//   jsdom: 버튼이 [📖 회상] 바로 아래 · 누르면 육각 경기 화면 (육각 런 경기가 꺼져 있어도) · HUD "연습 경기" · 선수 14명 (7 + 7) · 상대 id m_* · 이름 같음 ·
//   localStorage 를 한 글자도 쓰지 않는다 · 다시 그려도 같은 경기 · ⏭ → "연습 경기 결과" → [다시 하기] = 새 시드 · 턴 0 → ⏭ → [확인] = 시작 화면 ·
//   경기 phase 에 멈춘 런 (육각 · 재생 기록) 이 연습 → [나가기] 뒤에도 그대로 (store.run · store.hexMatch · KEYS 모두) · [이어하기] 로 런 경기를 끝까지.
//   화면 쪽 H2 배선 (기록하는 가짜 view — draw(frame, cam, timing)): 골 장면 득점자 celebrate → 킥오프 자리 모두 idle · timing { clock 증가, speed, turnMs } ·
//   4배속 차는 턴 release = min(0.75, BALL_RELEASE × max(ONE_SHOT_MIN, 턴 ms) / 턴 ms) · 이름표 키 = view.spriteKind 가 스프라이트라 할 때만 72 · s ·
//   그림이 멈춰 있어도 view.animating 이면 계속 draw.
// jsdom 이 없으면 jsdom 부분만 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch, loadData } from "./helpers.mjs";
import * as lessonRun from "../js/engine/lessonRun.js";
import * as hexMatch from "../js/engine/hexMatch.js";
import { practiceSetup, defaultSquadSnapshot, mirrorTeam, applyPracticeStats, PRACTICE_AWAY_NAME, PRACTICE_ID_PREFIX } from "../js/ui/practice.js";
import * as V from "../js/ui/view25.js";
import { BALL_RELEASE } from "../js/ui/hexScene.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

test("연습 경기 셋업: 기본 선수단 = 새 런 + config.practice (시즌 3 스탯 · 팀워크) · 블록 없으면 시작 스탯 · 거울 상대 · 육각 경기가 끝까지 돈다", () => {
  const data = loadData();
  const cfg = data.config;
  const setup = practiceSetup(lessonRun, data, "practice-unit-1");
  assert.equal(setup.seed, "practice-unit-1");
  assert.equal(setup.kind, "friendly");
  assert.equal(setup.possessions, cfg.friendly.possessions);
  // 우리 팀 = 기본 편성으로 만든 새 런 + config.practice 스탯 · 팀워크의 스냅샷
  const freshRun = () => lessonRun.createRun({
    data, seed: "other-seed", squad: { ...cfg.defaultSquad.slots }, formation: cfg.defaultSquad.formation,
    supportIds: [...cfg.defaultSupports], tactics: { ...cfg.defaultTactics },
  });
  const st = applyPracticeStats(freshRun(), cfg.practice);
  assert.deepEqual(setup.home, lessonRun.buildTeamSnapshot(st, data), "새 런 + practice 의 buildTeamSnapshot 과 같다 (시드와 상관없음)");
  // 스탯 · 팀워크 = config.practice 블록 그대로 (기본 편성은 모두 기질 A — 배수 1)
  const P = cfg.practice;
  assert.ok(P && P.stats && P.label && P.source, "config.practice 블록 (label · teamwork · stats · source)");
  assert.equal(setup.home.teamwork, P.teamwork, "팀워크 = practice.teamwork");
  assert.equal(setup.away.teamwork, P.teamwork, "상대 팀워크도 같다");
  for (const p of setup.home.players) {
    assert.deepEqual(p.stats, P.stats[p.charId], `${p.name} 스탯 = practice.stats.${p.charId}`);
  }
  assert.deepEqual(Object.keys(P.stats).sort(), Object.values(cfg.defaultSquad.slots).sort(), "practice.stats = 기본 편성 7명");
  // practice 블록이 없으면 새 런 시작 스탯 · 팀워크 그대로
  const noP = { ...data, config: { ...cfg } };
  delete noP.config.practice;
  const plain = defaultSquadSnapshot(lessonRun, noP);
  assert.deepEqual(plain, lessonRun.buildTeamSnapshot(freshRun(), noP), "블록 없음 = 새 런 스냅샷");
  assert.notDeepEqual(plain.players.map((p) => p.stats), setup.home.players.map((p) => p.stats), "블록이 스탯을 바꾼다");
  // 블록에 없는 캐릭터 · 값이 아닌 칸은 시작 스탯 그대로
  const part = applyPracticeStats(freshRun(), { teamwork: "x", stats: { ch_giant_striker: { shoot: 999, pass: null } } });
  const start = freshRun();
  const g = (s, id) => s.players.find((p) => p.charId === id).stats;
  assert.equal(g(part, "ch_giant_striker").shoot, 999);
  assert.equal(g(part, "ch_giant_striker").pass, g(start, "ch_giant_striker").pass, "null 칸 = 시작 스탯");
  assert.deepEqual(g(part, "ch_elf_playmaker"), g(start, "ch_elf_playmaker"), "줄 없는 캐릭터 = 시작 스탯");
  assert.equal(part.teamwork, start.teamwork, "팀워크 값이 아니면 그대로");
  assert.equal(setup.home.side, "home");
  assert.equal(setup.home.formation, "2-2-2");
  const bySlot = Object.fromEntries(setup.home.players.map((p) => [p.slot, p.charId]));
  assert.deepEqual(bySlot, cfg.defaultSquad.slots, "기본 편성 (실루엔 MF1 · 아델린 DF2 포함)");
  assert.equal(bySlot.MF1, "ch_elf_playmaker");
  assert.equal(bySlot.DF2, "ch_human_captain");
  // 거울 상대
  const a = setup.away;
  assert.equal(a.side, "away");
  assert.equal(a.name, PRACTICE_AWAY_NAME);
  assert.equal(a.players.length, setup.home.players.length);
  setup.home.players.forEach((p, i) => {
    const q = a.players[i];
    assert.equal(q.id, `${PRACTICE_ID_PREFIX}${p.id}`, "id 앞머리 m_");
    assert.equal(q.charId, p.charId, "charId 그대로 (초상 · 스프라이트)");
    assert.equal(q.name, p.name);
    assert.deepEqual(q.stats, p.stats, "같은 스탯");
  });
  assert.deepEqual(a.tactics, setup.home.tactics);
  // 깊은 사본 — 원본을 바꾸지 않는다
  const home = defaultSquadSnapshot(lessonRun, data);
  const m = mirrorTeam(home);
  m.players[0].stats.speed = -1;
  assert.notEqual(home.players[0].stats.speed, -1);
  assert.ok(!home.players[0].id.startsWith(PRACTICE_ID_PREFIX));
  // 육각 엔진이 받는다
  const ms = hexMatch.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
  hexMatch.simulateAuto(ms, data);
  assert.ok(ms.finished);
  assert.ok(["home", "away", "draw"].includes(hexMatch.getResult(ms).winner));
});

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

test("jsdom: [⚽ 연습 경기] — 회상 아래 버튼 · 육각 화면 · 거울 상대 · 저장 없음 · 다시 하기 · 확인 · 멈춘 런은 그대로", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
  const PX = await import(pathToFileURL(path.join(ROOT, "js/ui/hexPixi.js")).href);
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
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  assert.equal(ST.isHexMatch(), false, "런 경기는 옛 화면 (테스트 기본) — 연습 경기는 그래도 육각");
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  const btnText = (txt) => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes(txt));
  await until(() => btnText("새 런 시작"));
  const S = window.__soccer;
  const ls = window.localStorage;
  const dumpLs = () => JSON.stringify(Object.fromEntries(Array.from({ length: ls.length }, (_, i) => ls.key(i)).sort().map((k) => [k, ls.getItem(k)])));
  const modalBtn = (txt) => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === txt);

  // ---- 시작 화면: [📖 회상] 바로 아래 ----
  const rec = doc.querySelector(".start-menu .recollection-btn");
  assert.ok(rec, "회상 버튼 (이야기 데이터가 있다)");
  const pbtn = rec.nextElementSibling;
  assert.ok(pbtn && pbtn.matches("button.btn.btn-block.btn-col.practice-btn"), "회상 바로 다음 = 연습 경기 버튼");
  assert.equal(pbtn.firstElementChild.textContent, "⚽ 연습 경기");
  assert.equal(pbtn.querySelector(".btn-sub").textContent, "기본 선수단끼리 바로 경기 · 기록 안 남음");
  assert.equal(doc.querySelectorAll(".practice-btn").length, 1);

  // ---- 연습 경기 열기 (가짜 view 로 프레임) ----
  const draws = [];
  PX.setHexViewFactoryForTest(() => ({ renderer: "webgl", draw: (frame) => draws.push(frame), destroy: () => {} }));
  const lsBefore = dumpLs();
  S.store.matchUi.speed = 1;
  pbtn.click();
  assert.equal(S.store.screen, "practice");
  const scr = await until(() => doc.querySelector(".hex-screen"));
  assert.ok(scr, "육각 경기 화면 (런 육각이 꺼져 있어도)");
  assert.equal(doc.getElementById("stage").dataset.mode, "match");
  const pm = S.store.practiceMatch;
  assert.ok(pm && pm.engine === "hex" && pm.kind === "friendly", "store.practiceMatch = 육각 엔진 상태");
  assert.equal(pm.seed, S.store.practiceSeed);
  assert.match(String(pm.seed), /^practice-/);
  assert.equal(S.store.hexMatch, null, "런 육각 상태는 건드리지 않는다");
  assert.equal(S.store.match, null);
  assert.equal(S.store.run, null);
  assert.equal(scr.querySelector(".mh-sub").textContent, "연습 경기 · 정규 시간", "HUD 아랫줄 = 연습 경기");
  assert.equal(scr.querySelector(".mh-team.away .nm").textContent, "연습 상대");
  assert.equal(pm.home.players.length, 7);
  assert.equal(pm.away.players.length, 7);
  assert.ok(pm.away.players.every((p) => p.id.startsWith("m_")), "상대 id = m_*");
  assert.deepEqual(pm.away.players.map((p) => p.name), pm.home.players.map((p) => p.name), "상대 이름 = 우리 이름");
  assert.deepEqual(pm.away.players.map((p) => p.charId), pm.home.players.map((p) => p.charId), "charId 같음");
  const exits = [...scr.querySelectorAll(".m-exits > button.m-exit")];
  assert.deepEqual(exits.map((b) => b.textContent), ["나가기"], "나가기 버튼");
  await until(() => draws.length >= 3);
  for (const f of draws) {
    assert.equal(f.players.length, 14, "선수 14명");
    assert.equal(f.players.filter((p) => p.side === "home").length, 7);
    assert.equal(f.players.filter((p) => p.side === "away").length, 7);
  }
  assert.ok(draws.at(-1).players.some((p) => p.side === "away" && p.charId === "ch_elf_playmaker"), "상대에도 실루엔");
  await until(() => S.store.practiceMatch.turn >= 3, 6000);
  assert.ok(S.store.practiceMatch.turn >= 3, "경기가 돈다");
  // 다시 그려도 같은 경기 (같은 시드 · 상태 이어받기)
  S.render();
  assert.equal(S.store.practiceMatch, pm, "다시 그려도 같은 상태");
  assert.equal(doc.querySelectorAll(".hex-screen").length, 1);

  // ---- ⏭ → 결과 → [다시 하기] ----
  doc.querySelector(".hex-screen .skip-btn").click();
  assert.ok(pm.finished, "⏭ = 끝까지");
  await until(() => doc.querySelector("#modal-root .score-big"));
  assert.equal(doc.querySelector("#modal-root h2").textContent, "연습 경기 결과");
  assert.ok(modalBtn("다시 하기") && modalBtn("확인"), "[다시 하기] · [확인]");
  S.render(); // 끝난 연습을 다시 그려도 결과 모달 하나 (skipped 는 메모리에 남는다)
  assert.equal(doc.querySelectorAll("#modal-root .score-big").length, 1);
  const seed1 = S.store.practiceSeed;
  S.store.matchUi.hexIntervene = true; // 남은 ⏸ 개입 (경기 중 눌러 두고 장면 전에 끝난 경우 — 2026-10-10 리뷰)
  modalBtn("다시 하기").click();
  assert.equal(S.store.matchUi.hexIntervene, false, "[다시 하기] = 새 경기 — ⏸ 개입이 새지 않는다");
  const pm2 = S.store.practiceMatch;
  assert.ok(pm2 && pm2 !== pm, "새 경기");
  assert.notEqual(pm2.seed, seed1, "새 시드");
  assert.equal(pm2.turn, 0, "턴 0");
  assert.equal(pm2.finished, false);
  assert.equal(doc.querySelectorAll("#modal-root .score-big").length, 0, "결과 모달 닫힘");
  assert.equal(S.store.screen, "practice");

  // ---- ⏭ → [확인] = 시작 화면 ----
  doc.querySelector(".hex-screen .skip-btn").click();
  await until(() => modalBtn("확인"));
  S.store.matchUi.hexIntervene = true;
  modalBtn("확인").click();
  assert.equal(S.store.matchUi.hexIntervene, false, "[확인] (나가기) 도 ⏸ 개입을 끈다");
  assert.equal(S.store.screen, "start");
  assert.equal(S.store.practiceMatch, null, "연습 상태 비움");
  assert.ok(doc.querySelector(".start-screen"), "시작 화면");
  assert.equal(doc.querySelector(".hex-screen"), null);
  assert.equal(dumpLs(), lsBefore, "localStorage 를 한 글자도 쓰지 않았다");

  // ---- 화면 쪽 H2 배선 (기록하는 가짜 view): 골 장면 · timing · release · 이름표 키 · animating ----
  {
    const HM = S.hexMatch;
    const data = S.store.data;
    const SIL = "ch_elf_playmaker";
    // 앞쪽 (≤ 120 턴) 에 골 (+ 킥오프) 이 있는 시드 → 골 바로 전 턴까지 돌린 상태를 연습 상태로 넣는다
    let goalSeed = null;
    let before = 0;
    for (let i = 0; i < 40 && !goalSeed; i++) {
      const seed = `practice-screen-goal-${i}`;
      const su = practiceSetup(lessonRun, data, seed);
      const ms = HM.createMatch({ data, seed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind });
      for (let k = 0; k < 120 && !ms.finished; k++) {
        const n0 = ms.events.length;
        HM.step(ms, data);
        const evs = ms.events.slice(n0);
        if (evs.some((e) => e.type === "goal") && evs.some((e) => e.type === "kickoff")) { goalSeed = seed; before = k; break; }
      }
    }
    assert.ok(goalSeed, "앞쪽에 골이 있는 시드");
    const su = practiceSetup(lessonRun, data, goalSeed);
    const pre = HM.createMatch({ data, seed: goalSeed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind });
    for (let k = 0; k < before; k++) HM.step(pre, data);
    const goalTurn = pre.turn + 1;

    const rec = [];
    let anim = false;
    PX.setHexViewFactoryForTest(() => ({
      renderer: "webgl", draw: (frame, cam, timing) => rec.push({ frame, timing }), destroy: () => {},
      get animating() { return anim; },
      spriteKind: (id) => (id === SIL ? "anim" : null),
    }));
    S.store.matchUi.speed = 4;
    doc.querySelector(".practice-btn").click();
    await until(() => doc.querySelector(".hex-screen"));
    S.store.practiceSeed = goalSeed;
    S.store.practiceMatch = pre;
    S.render(); // 같은 시드의 상태를 이어받는다
    assert.equal(S.store.practiceMatch, pre);
    rec.length = 0;
    await until(() => pre.turn >= goalTurn + 2 && rec.some((r) => r.frame.release > 0), 8000);
    assert.ok(pre.turn >= goalTurn + 2, "골 턴을 지나 경기가 돈다");
    const gEv = pre.events.find((e) => e.type === "goal" && e.turn === goalTurn);
    assert.ok(gEv, "골 턴");
    const scorer = `${gEv.side}:${gEv.playerId}`;
    const gf = rec.filter((r) => r.frame.turn === goalTurn).map((r) => r.frame);
    assert.ok(gf.some((f) => f.players.find((p) => p.key === scorer).act === "celebrate"), "골 장면 득점자 = celebrate");
    const kf = gf.at(-1);
    assert.ok(kf.kickoff && kf.players.every((p) => p.act === "idle"), "골 뒤 킥오프 자리 = 모두 idle");
    // timing: 4배속
    const tick = ST.hexTickMs();
    assert.ok(rec.every((r) => r.timing && r.timing.speed === 4 && r.timing.turnMs === tick / 4), "timing { speed 4, turnMs = 한 턴 / 4 }");
    for (let i = 1; i < rec.length; i++) assert.ok(rec[i].timing.clock >= rec[i - 1].timing.clock, "스프라이트 시계는 줄지 않는다");
    assert.ok(rec.at(-1).timing.clock > rec[0].timing.clock, "스프라이트 시계가 흐른다");
    // 4배속 release
    const tm4 = tick / 4;
    const rel4 = Math.min(0.75, (BALL_RELEASE * Math.max(PX.ONE_SHOT_MIN, tm4)) / tm4);
    const kicks = rec.filter((r) => r.frame.release > 0);
    assert.ok(kicks.length > 0, "차는 턴 프레임");
    for (const r of kicks) assert.ok(Math.abs(r.frame.release - rel4) < 1e-9, `4배속 release ${r.frame.release} ≈ ${rel4}`);
    // 이름표 키: view 가 스프라이트로 그리는 캐릭터만 72 · s, 나머지는 스탠디 키
    const f0 = rec.at(-1).frame;
    for (const p of f0.players) {
      const want = p.charId === SIL ? V.figureSize(p.s, { w: 1, h: 1, footX: 0.5 }).fh : V.figureSize(p.s).fh;
      assert.ok(Math.abs(p.figure.fh - want) < 1e-9, `${p.key} (${p.charId}) 키 ${p.figure.fh} ≈ ${want}`);
    }
    // 배속 버튼 4 → 1: timing 이 따른다
    doc.querySelector(".hex-screen .speed-btn").click();
    assert.equal(S.store.matchUi.speed, 1);
    const n1 = rec.length;
    await until(() => rec.length > n1 + 2);
    assert.equal(rec.at(-1).timing.speed, 1);
    assert.equal(rec.at(-1).timing.turnMs, tick);
    // ⏭ → 결과: 그림이 멈추면 draw 도 멈추고, view.animating 이면 계속 그린다
    doc.querySelector(".hex-screen .skip-btn").click();
    await until(() => modalBtn("확인"));
    const settled = async () => {
      for (let i = 0; i < 60; i++) {
        const n = rec.length;
        await wait(150);
        if (rec.length === n) return true;
      }
      return false;
    };
    assert.ok(await settled(), "멈춘 그림은 다시 그리지 않는다");
    anim = true;
    const n2 = rec.length;
    await wait(200);
    assert.ok(rec.length >= n2 + 3, `view.animating → 계속 draw (${rec.length - n2})`);
    anim = false;
    assert.ok(await settled(), "animating 이 꺼지면 다시 멈춘다");
    modalBtn("확인").click();
    assert.equal(S.store.screen, "start");
    assert.equal(S.store.practiceMatch, null);
    PX.setHexViewFactoryForTest(() => ({ renderer: "webgl", draw: () => {}, destroy: () => {} }));
    assert.equal(dumpLs(), lsBefore, "localStorage 그대로");
  }

  // ---- 경기 phase 에 멈춘 런 (육각 · 재생 기록) → 연습 → [나가기] → 런 그대로 → [이어하기] ----
  ST.setHexMatchForTest(true);
  btnText("새 런 시작").click();
  await until(() => S.store.screen === "setup");
  btnText("기본 편성으로 시작").click();
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
  S.actions.weekAction({ type: "friendly" });
  await until(() => S.store.run.phase === "match" && doc.querySelector(".hex-screen"));
  assert.equal(doc.querySelector(".hex-screen .m-exits"), null, "런 경기에는 나가기 버튼이 없다");
  await until(() => S.store.hexMatch?.turn >= 3, 6000);
  S.actions.resetToStart(); // 경기 중 시작 화면으로 (런은 메모리 · 저장 모두 경기 phase 그대로)
  assert.equal(S.store.screen, "start");
  const runHex = S.store.hexMatch;
  assert.ok(runHex && runHex.engine === "hex");
  const snap = { run: JSON.stringify(S.store.run), hex: JSON.stringify(runHex), ls: dumpLs() };
  assert.ok(ls.getItem(ST.KEYS.hexMatch), "런 재생 기록이 있다");
  await wait(500); // 멈춘 런 화면의 루프가 더 돌지 않는다
  assert.equal(JSON.stringify(runHex), snap.hex, "떠난 런 경기는 멈췄다");

  doc.querySelector(".practice-btn").click();
  await until(() => S.store.practiceMatch?.turn >= 2, 6000);
  assert.ok(S.store.practiceMatch.turn >= 2, "연습 경기가 돈다");
  doc.querySelector(".hex-screen .m-exits .m-exit").click(); // [나가기]
  assert.equal(S.store.screen, "start");
  assert.equal(S.store.practiceMatch, null);
  await wait(60);
  assert.equal(S.store.hexMatch, runHex, "store.hexMatch 같은 객체");
  assert.equal(JSON.stringify(runHex), snap.hex, "store.hexMatch 그대로");
  assert.equal(JSON.stringify(S.store.run), snap.run, "store.run 그대로");
  assert.equal(dumpLs(), snap.ls, "localStorage (KEYS.run · KEYS.hexMatch …) 그대로");

  // [이어하기]: 재생 기록으로 런 경기를 되살려 끝까지
  const savedSteps = JSON.parse(ls.getItem(ST.KEYS.hexMatch)).steps;
  btnText("이어하기").click();
  await until(() => doc.querySelector(".hex-screen"));
  assert.equal(S.store.run.phase, "match");
  assert.equal(S.hexView.steps, savedSteps, "재생 기록 step 수 그대로");
  assert.equal(S.store.hexMatch.turn, runHex.turn, "멈춘 자리에서");
  assert.deepEqual(S.store.hexMatch.pos, runHex.pos);
  assert.equal(doc.querySelector(".hex-screen .mh-sub").textContent.split(" · ")[0], "친선전", "런 경기 HUD");
  doc.querySelector(".hex-screen .skip-btn").click();
  await until(() => modalBtn("확인"));
  assert.equal(doc.querySelector("#modal-root h2").textContent, "친선전 결과");
  assert.equal(modalBtn("다시 하기"), undefined, "런 경기에는 [다시 하기] 가 없다");
  modalBtn("확인").click();
  await until(() => S.store.run.phase !== "match");
  assert.notEqual(S.store.run.phase, "match", "런 경기를 끝냈다");
  assert.equal(ls.getItem(ST.KEYS.hexMatch), null);
  await wait(60);

  // ---- 소음 없음 ----
  assert.deepEqual(errors, [], "console.error 없음");
  assert.deepEqual(noise, [], "jsdom 오류 없음");
});

test("tools/lesson_sim.mjs --final-stats: 인자 · 고르기 규칙 (top25 · goal3 · all) · 캐릭터별 평균 (반올림) · 팀워크", async () => {
  const LS = await import("../tools/lesson_sim.mjs");
  assert.equal(LS.parseArgs([]).finalStats, null);
  assert.equal(LS.parseArgs(["--final-stats"]).finalStats, "top25");
  assert.equal(LS.parseArgs(["--final-stats", "goal3", "--runs", "3"]).finalStats, "goal3");
  assert.equal(LS.parseArgs(["--final-stats", "--runs", "3"]).runs, 3, "규칙이 아닌 다음 인자는 그대로 읽는다");
  const row = (policy, sum, teamwork, goal3, v) => ({ policy, sum, teamwork, goal3, stats: { a: { shoot: v, dribble: v, pass: v, defense: v, physical: v } } });
  const finals = [row("team", 10, 80, false, 1), row("ace", 40, 100, true, 4), row("ace", 30, 90, true, 3), row("press", 20, 70, false, 2),
    row("team", 5, 60, true, 0), row("poss", 25, 50, false, 2), row("poss", 35, 100, false, 3), row("press", 15, 40, false, 1)];
  const top = LS.finalStatsReport(finals, "top25");
  assert.equal(top.selected, 2, "8런의 25 % = 2런 (합 40 · 35)");
  assert.equal(top.stats.a.shoot, 4, "(4 + 3) / 2 = 3.5 → 4");
  assert.equal(top.teamwork, 100);
  assert.deepEqual(top.byPolicy, { ace: 1, poss: 1 });
  assert.equal(top.goal3Rate, 0.5);
  const g3 = LS.finalStatsReport(finals, "goal3");
  assert.equal(g3.selected, 3);
  assert.equal(g3.stats.a.pass, Math.round(7 / 3));
  assert.equal(LS.finalStatsReport(finals, "all").selected, 8);
  // 실제 시뮬 1런 (경기 없음): finals 줄이 기본 편성 7명 · 스탯 5개
  const data = LS.loadData();
  const sum = LS.summarize(data, LS.parseArgs(["--runs", "1", "--seed", "fs", "--no-match", "--final-stats"]), "team");
  assert.equal(sum.finals.length, 1);
  assert.deepEqual(Object.keys(sum.finals[0].stats).sort(), Object.values(data.config.defaultSquad.slots).sort());
  for (const st of Object.values(sum.finals[0].stats)) assert.deepEqual(Object.keys(st), ["shoot", "dribble", "pass", "defense", "physical"]);
  assert.equal(LS.summarize(data, LS.parseArgs(["--runs", "1", "--seed", "fs", "--no-match"]), "team").finals, undefined, "플래그 없으면 finals 없음");
});
