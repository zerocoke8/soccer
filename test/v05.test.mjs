// test/v05.test.mjs — ARCHITECTURE §13 (GDD v0.5 듀얼 개편 · 연계 · 간파 · 필살기 · 액티브) 경기 엔진 계약
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, run, match } from "./helpers.mjs";
import * as ai from "../js/engine/ai.js";
import * as skills from "../js/engine/skills.js";
import { createRng, createRngFromState } from "../js/engine/rng.js";

const readJson = (n) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../data/${n}.json`, import.meta.url)), "utf8"));
const data = loadData();
data.traits = readJson("traits");
data.combos = readJson("combos");
const M = data.config.match;
const EPS = 1e-9;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${msg}: ${a} ≠ ${b}`);

/* ------------------------------------------------------------------ */
/* 합성 팀 (스탯·특성·스킬을 정확히 통제)                                   */
/* ------------------------------------------------------------------ */

const FORM = [["GK", "GK"], ["DF1", "DF"], ["DF2", "DF"], ["MF1", "MF"], ["MF2", "MF"], ["FW1", "FW"], ["FW2", "FW"]];
const BASE = { shoot: 400, dribble: 400, pass: 400, defense: 400, physical: 400 };

/** over: { [slot]: { stats?, trait?, skillIds?, style? }, team: { …팀 필드 } } */
function team(prefix, over = {}) {
  return {
    name: prefix === "h" ? "홈" : "원정",
    formation: "2-2-2",
    tactics: { attack: "balanced", shootTiming: "breakAll", defense: "balanced", tension: "immediate", duelPicker: "best" },
    teamwork: 0,
    conditionMult: 1,
    resonance: null,
    modifiers: {},
    players: FORM.map(([slot, position]) => {
      const o = over[slot] || {};
      return {
        id: `${prefix}_${slot}`, name: `${prefix}${slot}`, slot, position, style: o.style || "power", element: "fire",
        stats: { ...BASE, ...(o.stats || {}) }, skillIds: o.skillIds || [], trait: o.trait === undefined ? null : o.trait,
      };
    }),
    ...(over.team || {}),
  };
}

function mk(homeOver = {}, awayOver = {}, opts = {}) {
  return match.createMatch({
    data, seed: opts.seed ?? 1, home: team("h", homeOver), away: team("a", awayOver),
    possessions: opts.possessions ?? 8, kind: opts.kind ?? "goal",
  });
}

/** 공을 원하는 자리에 놓고 듀얼을 다시 준비한다 (AI 커밋 포함). ball: 추가 공 필드 */
function place(ms, { atk = "home", line = 0, carrier, ball = {} }) {
  ms.attackingSide = atk;
  ms.ball = {
    carrierId: carrier, lineIndex: line, chain: 0, extraLine: false, oneTouch: false, receivedVia: null, lastPasserId: null,
    receivedFresh: false, comboReadyId: null, comboFrom: null, pending: { beaten: false, interceptFail: false, nextBonus: 0 }, ...ball,
  };
  ms.duel = null;
  ms.phase = "possessionEnd";
  match.step(ms, data);
  assert.equal(ms.phase, "decision");
  return ms;
}

const RESOLVE = ["duel", "turnover", "save", "goal"];

/** decision 으로 한 번 진행하되 판정 결과(공격 성공 여부)를 강제 — rngState 를 바꿔 가며 찾는다 */
function forced(ms, decision, success) {
  for (let s = 1; s < 800; s++) {
    const c = clone(ms);
    c.rngState = createRng(`force${s}`).getState();
    const n0 = c.events.length;
    match.step(c, data, decision);
    const ev = c.events.slice(n0).find((e) => RESOLVE.includes(e.type));
    if (ev && ev.success === success) return { ms: c, ev, fresh: c.events.slice(n0) };
  }
  throw new Error(`강제 결과(${success})를 찾지 못함`);
}

const odds = (ms, action, defAction, extra = {}) => match.computeOdds(ms, data, { action, defAction, ...extra });

/* ------------------------------------------------------------------ */
/* 1. A안 결정성                                                         */
/* ------------------------------------------------------------------ */

test("A안: 자동 선택은 성향 1위 (결정적) · ai 는 상태·난수를 건드리지 않음 · step 당 난수 = 판정 주사위 1회", () => {
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "a-plan" }), data);
  let checked = 0;
  let rolls = 0;
  for (const oppId of ["op_s1_ironhoof", "op_s2_silverleaf", "op_s3_emberthrone"]) {
    const away = run.buildOpponentSnapshot(data.opponents.find((o) => o.id === oppId), data);
    for (let seed = 1; seed <= 6; seed++) {
      const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
      let guard = 0;
      while (!match.isFinished(ms) && guard++ < 3000) {
        if (ms.phase === "decision") {
          const snap = JSON.stringify(ms);
          for (const side of ["home", "away"]) {
            const f = ms.attackingSide === side ? ai.decideAttack : ai.decideDefense;
            const a1 = f(ms, data, side);
            const a2 = f(ms, data, side);
            assert.deepEqual(a1, a2, "같은 상태 → 같은 자동 선택");
            if (!(ms.attackingSide !== side && ms.ball.lineIndex >= 3)) {
              assert.equal(a1.action, match.autoAction(ms, data, side), "decide = 성향 1위");
            }
          }
          assert.equal(JSON.stringify(ms), snap, "ai / tendencyValues 는 상태(rngState 포함)를 바꾸지 않는다");
          // 사람 측 자동: 결정 전 view.expected = 실제 커밋 액션 (간파로 바뀐 경우 제외)
          const v = match.getMatchView(ms, data);
          const role = v.needsDecision;
          const before = ms.rngState;
          const n0 = ms.events.length;
          match.step(ms, data, null);
          const ev = ms.events.slice(n0).find((e) => RESOLVE.includes(e.type));
          if (role && ev && !ev.readBy) {
            if (role === "attack") assert.equal(ev.action, v.expected.attack.action);
            else assert.equal(ev.defAction, v.expected.defense.action);
            checked++;
          }
          // 난수: 판정 주사위 1회 (+ dribbleStaminaRefund 유물 없음)
          if (ev) {
            const r = createRngFromState(before);
            r.next();
            assert.equal(ms.rngState, r.getState(), "step 한 번 = 판정 주사위 한 번");
            rolls++;
          }
          continue;
        }
        match.step(ms, data, null);
      }
    }
  }
  assert.ok(checked > 150 && rolls > 200, `checked ${checked}, rolls ${rolls}`);
});

test("A안: 성향값 = 스탯 × 계수 × 특성 × 전술 × 체력 규칙, 동률 순서, 중거리(breakAll 0 / midrange ×midrangeTactic — 1위를 뒤집는다)", () => {
  const ms = mk({ DF1: { stats: { pass: 500, dribble: 300 } }, FW1: { stats: { shoot: 900, dribble: 300, pass: 300 } } });
  place(ms, { line: 0, carrier: "h_DF1" });
  const tv = match.tendencyValues(ms, data, "home");
  near(tv.dribble, 300 * M.actionCoef.dribble, "드리블");
  near(tv.pass, 500 * M.actionCoef.pass, "패스");
  assert.equal(match.autoAction(ms, data, "home"), "pass");
  // 체력 20% 이하: 드리블 ×0.7, 패스 ×1.2
  ms.home.live.h_DF1.stamina = 10;
  const low = match.tendencyValues(ms, data, "home");
  near(low.dribble, 300 * M.actionCoef.dribble * M.tendency.lowStaminaDribble, "저체력 드리블");
  near(low.pass, 500 * M.actionCoef.pass * M.tendency.lowStaminaPass, "저체력 패스");
  // 중거리: breakAll → 0, midrange → ×midrangeTactic (중거리 계수 0.6 이 드리블·패스 2.2 보다 낮아 ×tacticBonus 로는 못 뒤집어 따로 둔다)
  place(ms, { line: 2, carrier: "h_FW1" });
  assert.equal(match.tendencyValues(ms, data, "home").shoot, 0);
  assert.equal(match.autoAction(ms, data, "home"), "dribble", "breakAll: 슈터도 돌파");
  ms.home.tactics.shootTiming = "midrange";
  near(match.tendencyValues(ms, data, "home").shoot, 900 * M.actionCoef.midrangeShoot * M.tendency.midrangeTactic, "중거리 midrange");
  assert.equal(match.autoAction(ms, data, "home"), "shoot", "midrange: 슈팅이 드리블·패스보다 충분히 높은 선수는 중거리 1위");
  const even = mk({ team: { tactics: { attack: "balanced", shootTiming: "midrange", defense: "balanced", tension: "immediate", duelPicker: "best" } } });
  place(even, { line: 2, carrier: "h_FW1" });
  assert.equal(match.autoAction(even, data, "home"), "dribble", "midrange 라도 스탯이 고르면 돌파");
  // 수비 동률 → hold, 버티기 = 수비 × holdMult (철벽 ×1.15)
  const md = mk({}, { FW1: { trait: "wall" } });
  place(md, { line: 0, carrier: "h_DF1" });
  const dv = match.tendencyValues(md, data, "away");
  assert.deepEqual(Object.keys(dv), ["tackle", "intercept", "hold"]);
  const def = md.away.players.find((p) => p.id === md.duel.defenderId);
  if (def.trait === "wall") near(dv.hold, 400 * M.holdMult * 1.15, "철벽 버티기");
  else assert.equal(dv.hold, dv.tackle);
  const mt = mk();
  place(mt, { line: 0, carrier: "h_DF1" });
  assert.equal(match.autoAction(mt, data, "away"), "hold", "태클 = 인터셉트 = 버티기 → tieDefense 첫 항목");
  assert.equal(match.autoAction(mt, data, "home"), "dribble", "드리블 = 패스 → tieAttack 첫 항목");
});

/* ------------------------------------------------------------------ */
/* 2. 수비 스탯 · 배율                                                    */
/* ------------------------------------------------------------------ */

test("수비 스탯·배율: 태클 (수비+피지컬)/2 × 태클 계수 · 인터셉트 (수비+패스)/2 × 인터셉트 계수 · 버티기 수비 × holdMult, 짝 ×readBonus · 빗나감 ×0.8 · 버티기 짝 없음 ×1.0 · 중거리 ×1.5", () => {
  const ms = mk({}, { DF1: { stats: { defense: 500, physical: 300, pass: 200 } }, DF2: { stats: { defense: 100 } } });
  place(ms, { line: 2, carrier: "h_FW1" });
  ms.duel.defenderId = "a_DF1";
  ms.duel.coverCount = 0;
  // 필드 수비 세 행동의 계수 (L51: 셋 다 0.6 — 데이터에서 읽는다)
  const T = 400 * M.actionCoef.tackle;
  const I = 350 * M.actionCoef.intercept;
  const H = 500 * M.holdMult;
  const cases = [
    ["dribble", "tackle", T * M.readBonus],
    ["pass", "tackle", T * M.missMult],
    ["pass", "intercept", I * M.readBonus],
    ["dribble", "intercept", I * M.missMult],
    ["dribble", "hold", H],
    ["pass", "hold", H],
    ["shoot", "hold", H * M.holdVsMidrange],
    ["shoot", "tackle", T * M.missMult],
  ];
  for (const [a, d, exp] of cases) near(odds(ms, a, d).def, exp, `${a} vs ${d}`);
  // 공격력: 드리블/패스 ×2.2, 중거리 ×0.6
  near(odds(ms, "dribble", "hold").att, 400 * M.actionCoef.dribble, "드리블 공격");
  near(odds(ms, "shoot", "hold").att, 400 * M.actionCoef.midrangeShoot, "중거리 공격");
  // 철벽: 버티기 ×1.15
  ms.away.players.find((p) => p.id === "a_DF1").trait = "wall";
  near(odds(ms, "dribble", "hold").def, H * 1.15, "철벽");
  ms.away.players.find((p) => p.id === "a_DF1").trait = null;
  // 효과: 빗나감 페널티 없음 / 간파 ×2.0 / 상대 짝 무효
  const fxD = { ...skills.emptyDuelEffects(), noMissPenalty: true };
  near(odds(ms, "pass", "tackle", { fxD }).def, T, "noMissPenalty");
  const rb = { ...skills.emptyDuelEffects(), readMult: 2.0 };
  near(odds(ms, "dribble", "tackle", { fxD: rb }).def, T * 2.0, "readBoost 태클 짝");
  near(odds(ms, "shoot", "hold", { fxD: rb }).def, H * 2.0, "readBoost 버티기 vs 중거리");
  near(odds(ms, "pass", "tackle", { fxD: rb }).def, T * M.missMult, "readBoost 는 빗나감엔 무관");
  const ng = { ...skills.emptyDuelEffects(), negateRead: true };
  near(odds(ms, "dribble", "tackle", { fxA: ng }).def, T, "negateRead → 짝 ×1.0");
  near(odds(ms, "shoot", "hold", { fxA: ng }).def, H, "negateRead → 중거리 버티기 ×1.0");
  assert.equal(odds(ms, "dribble", "tackle", { fxA: ng }).read, false);
});

/* ------------------------------------------------------------------ */
/* 3. 뚫림 결과                                                           */
/* ------------------------------------------------------------------ */

test("뚫림 결과: 태클 → 제쳐짐(+25%, 커버 0) · 인터셉트 → +10% · 버티기 → 없음 · 바위 방벽 → 없음 · 한 번 쓰고 지움 · GK 면 보너스만", () => {
  const ms = mk();
  place(ms, { line: 0, carrier: "h_DF1" });
  const withDef = (d, fx = {}) => {
    const c = clone(ms);
    c.duel.awayChoice = { ...c.duel.awayChoice, action: d };
    Object.assign(c.duel.effects.away, fx);
    return c;
  };
  // 태클 뚫림
  const t = forced(withDef("tackle"), { action: "dribble" }, true).ms;
  assert.equal(t.ball.lineIndex, 1);
  assert.equal(t.ball.pending.beaten, true);
  assert.equal(t.duel.coverCount, 0, "제쳐짐: 그 듀얼 커버 0");
  assert.equal(t.duel.baseCover, 1);
  const tOdds = odds(t, "dribble", "hold");
  near(tOdds.bonus.parts.beaten, M.beatenBonus, "제쳐짐 보너스");
  const tClear = clone(t); tClear.ball.pending.beaten = false;
  near(tOdds.att / odds(tClear, "dribble", "hold").att, 1 + M.beatenBonus, "공격 ×1.25");
  // 한 번 쓰고 지움: 다음 듀얼(성공) 뒤에는 없다
  const t2 = forced(t, { action: "dribble" }, true).ms;
  if (t2.duel && t2.ball.lineIndex < 3 && t2.duel.awayChoice.action !== "tackle") assert.equal(t2.ball.pending.beaten, false);
  // 인터셉트 뚫림
  const i = forced(withDef("intercept"), { action: "dribble" }, true).ms;
  assert.equal(i.ball.pending.interceptFail, true);
  assert.equal(i.ball.pending.beaten, false);
  assert.equal(i.duel.coverCount, 1, "인터셉트 뚫림은 커버 유지");
  near(odds(i, "dribble", "hold").bonus.parts.interceptFail, M.interceptFailBonus, "+10%");
  // 버티기 뚫림 · 바위 방벽
  const h = forced(withDef("hold"), { action: "dribble" }, true).ms;
  assert.deepEqual(h.ball.pending, { beaten: false, interceptFail: false, nextBonus: 0 });
  const s = forced(withDef("tackle", { noFailPenalty: true }), { action: "dribble" }, true).ms;
  assert.equal(s.ball.pending.beaten, false, "noFailPenalty → 제쳐짐 없음");
  // 다음이 GK: 보너스만
  const g = mk();
  place(g, { line: 2, carrier: "h_FW1" });
  g.duel.awayChoice = { ...g.duel.awayChoice, action: "tackle" };
  const gk = forced(g, { action: "dribble" }, true).ms;
  assert.equal(gk.ball.lineIndex, 3);
  assert.equal(gk.ball.pending.beaten, true);
  near(odds(gk, "shoot", "save").bonus.parts.beaten, M.beatenBonus, "GK 듀얼에도 +25%");
});

/* ------------------------------------------------------------------ */
/* 4. 역습 시작 표                                                        */
/* ------------------------------------------------------------------ */

test("역습 시작 표: 기본 2/1/0 · 인터셉트 +1 · 소매치기 +1 · 상한 2 (텐션 / 첫 듀얼 +15%) · 버티기 = 한 구역 물러남 1/0/0 · 세이브 0 · 빠른 배급 1", () => {
  const steal = { plus: 1, tension: 10, cappedNextBonus: 0.15 };
  const rows = [
    // [line, 수비, steal, 기대 시작 line, 추가 텐션, 첫 듀얼 보너스]
    [0, "tackle", false, 2, 0, 0],
    [1, "tackle", false, 1, 0, 0],
    [2, "tackle", false, 0, 0, 0],
    [0, "intercept", false, 2, M.counterCapTension, 0],
    [1, "intercept", false, 2, 0, 0],
    [2, "intercept", false, 1, 0, 0],
    // 버티기: 뺏은 자리(기본 표)에서 holdStartBack(1) 구역 물러남, 소매치기 무시 (GDD #54)
    [0, "hold", false, 1, 0, 0],
    [1, "hold", true, 0, 0, 0],
    [2, "hold", false, 0, 0, 0],
    [1, "tackle", true, 2, steal.tension, 0],
    [2, "tackle", true, 1, steal.tension, 0],
    [1, "intercept", true, 2, steal.tension, steal.cappedNextBonus],
    [0, "tackle", true, 2, steal.tension, steal.cappedNextBonus],
  ];
  for (const [line, d, st, start, tBonus, nb] of rows) {
    const ms = mk();
    place(ms, { atk: "away", line, carrier: line === 0 ? "a_DF1" : line === 1 ? "a_MF1" : "a_FW1" });
    ms.duel.awayChoice = { ...ms.duel.awayChoice, action: "dribble" };
    if (st) ms.duel.effects.home.steal = { ...steal };
    const t0 = ms.home.tension;
    const { ms: after, ev } = forced(ms, { action: d }, false);
    const where = `line ${line} ${d}${st ? "+steal" : ""}`;
    assert.equal(ev.toStep, start, `${where}: 역습 시작`);
    assert.equal(after.attackingSide, "home");
    assert.equal(after.ball.lineIndex, start, where);
    assert.equal(after.home.tension, Math.min(M.tension.max, t0 + M.tension.steal + tBonus), `${where}: 텐션`);
    assert.equal(after.ball.pending.nextBonus, nb, `${where}: 역습 첫 듀얼 보너스`);
    if (nb) near(odds(after, "dribble", "hold").bonus.parts.next, nb, "첫 듀얼 +15%");
  }
  // GK 세이브 → GK 배급 대기 (2026-09-29: 골킥 · 빠른 배급 역습 대신 배급 — 빠른 배급은 롱패스 +25%)
  for (const trait of [null, "distributor"]) {
    const ms = mk({ GK: { trait } });
    place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
    const { ms: after, ev } = forced(ms, null, false);
    assert.equal(ev.type, "save");
    assert.deepEqual({ c: ev.counterStart, s: ev.toStep, t: ev.toAttackingSide, n: ev.nextDistribution }, { c: 0, s: 0, t: "home", n: true }, `세이브 ${trait}`);
    assert.equal(after.phase, "distribution");
    assert.deepEqual(after.distribution, { side: "home", gkId: "h_GK", from: "save", possession: after.possession });
    assert.deepEqual({ a: after.attackingSide, c: after.ball.carrierId, l: after.ball.lineIndex, d: after.duel }, { a: "home", c: "h_GK", l: 0, d: null });
  }
});

/* ------------------------------------------------------------------ */
/* 5. 크로스 · 헤더 · 원터치                                               */
/* ------------------------------------------------------------------ */

test("크로스: 크로서만 파이널 서드에서, 후보 = FW 전원 + 피지컬 최고 MF · 성공 → 헤더(원터치 ×0.85, 타깃맨 +25%)", () => {
  const ms = mk({
    FW1: { trait: "crosser", stats: { pass: 500, dribble: 300 } },
    FW2: { trait: "targetman", stats: { shoot: 500, physical: 700 } },
    MF1: { stats: { physical: 500 } },
    MF2: { stats: { physical: 600 } },
  });
  place(ms, { line: 2, carrier: "h_FW1" });
  const acts = Object.fromEntries(match.getAttackActions(ms, "home", data).map((a) => [a.action, a.enabled]));
  assert.deepEqual(acts, { dribble: true, pass: true, cross: true, shoot: true });
  const v = match.getMatchView(ms, data);
  assert.deepEqual(v.receivers.cross.candidates, ["h_MF2", "h_FW2"], "FW 전원 + 피지컬 최고 MF (carrier 제외, 슬롯 순서)");
  assert.equal(v.receivers.cross.defaultId, "h_FW2", "헤더 값 최고 (타깃맨)");
  assert.equal(v.receivers.pass.candidates.join(), "h_FW2", "파이널 서드 패스 = 같은 라인 다른 FW");
  // 크로스 판정: (패스+드리블)/2 × cross 계수 × (1 + 크로서 10%)
  const c = odds(ms, "cross", "hold");
  near(c.att, 400 * M.actionCoef.cross * 1.1, "크로스 공격");
  // 크로스(공중볼) ↔ 버티기 짝 ×holdVsCross, 인터셉트는 빗나감 ×missMult (2026-09-29, 인터셉트 스탯 = 버티기 스탯 = 400)
  near(odds(ms, "cross", "hold").def / odds(ms, "cross", "intercept").def, M.holdVsCross / M.missMult, "크로스 ↔ 버티기 짝");
  assert.equal(odds(ms, "cross", "hold").pair, "read");
  assert.equal(odds(ms, "cross", "intercept").pair, "miss");
  // 비크로서 / line 1 은 불가
  const n = clone(ms); n.home.players.find((p) => p.id === "h_FW1").trait = null;
  assert.equal(match.getAttackActions(n, "home", data).find((a) => a.action === "cross").enabled, false);
  const l1 = mk({ FW1: { trait: "crosser" } });
  place(l1, { line: 1, carrier: "h_FW1" });
  assert.equal(match.getAttackActions(l1, "home", data).find((a) => a.action === "cross").enabled, false);
  // 성공 → 박스, 헤더
  const { ms: after, ev } = forced(ms, { action: "cross" }, true);
  assert.equal(ev.receiverId, "h_FW2");
  assert.equal(ev.via, "cross");
  assert.equal(after.ball.lineIndex, 3);
  assert.equal(after.ball.oneTouch, true);
  assert.equal(after.ball.receivedVia, "cross");
  assert.equal(after.ball.chain, 1);
  const hv = match.getMatchView(after, data);
  assert.equal(hv.actions.find((a) => a.action === "shoot").label, "헤더");
  const h = odds(after, "shoot", "save");
  assert.equal(h.header, true);
  assert.ok(h.links.includes("header") && h.links.includes("oneTouch"));
  const amp = 1;
  near(h.bonus.parts.targetman, 0.25 * amp, "타깃맨");
  // 헤더 스탯 (슈팅+피지컬)/2 × header 계수, 연계 1
  const plain = clone(after); plain.ball.oneTouch = false; plain.home.players.find((p) => p.id === "h_FW2").trait = null;
  const hp = odds(plain, "shoot", "save");
  near(hp.att, 600 * M.actionCoef.header * (1 + M.passChainBonus), "헤더 공격 (타깃맨 없이, 연계 1)");
  near(h.def / hp.def, M.oneTouchGk, "원터치 GK ×0.85");
});

test("원터치: 패스로 박스 도착 = 원터치(헤더 아님), 드리블 도착 = 아님, 라인 브레이커로 박스 도착 = 원터치 + 슛 +20%", () => {
  const ms = mk();
  place(ms, { line: 2, carrier: "h_FW1" });
  const p = forced(ms, { action: "pass" }, true).ms;
  assert.equal(p.ball.oneTouch, true);
  assert.equal(p.ball.receivedVia, "pass");
  assert.equal(odds(p, "shoot", "save").header, false);
  const d = forced(ms, { action: "dribble" }, true).ms;
  assert.equal(d.ball.oneTouch, false);
  const lb = clone(ms);
  lb.duel.effects.home.extraLine = true;
  const e = forced(lb, { action: "dribble" }, true).ms;
  assert.equal(e.ball.oneTouch, true);
  assert.equal(e.ball.extraLine, true);
  const base = clone(e); base.ball.extraLine = false; base.ball.oneTouch = false;
  near(odds(e, "shoot", "save").att / odds(base, "shoot", "save").att, 1.2, "extraLine 슛 +20%");
  near(odds(e, "shoot", "save").def / odds(base, "shoot", "save").def, M.oneTouchGk, "원터치");
});

/* ------------------------------------------------------------------ */
/* 6. 받는 선수                                                           */
/* ------------------------------------------------------------------ */

test("받는 선수: 기본 = 도착 구역 주 액션 판정값 최고(상대 무관·동률 슬롯 순서) · decision.receiverId · 후보 아니면 throw · outcomesByReceiver", () => {
  const ms = mk({ MF1: { stats: { dribble: 300, pass: 300 } }, MF2: { stats: { dribble: 500, pass: 300 } } });
  place(ms, { line: 0, carrier: "h_DF1" });
  const v = match.getMatchView(ms, data);
  assert.deepEqual(v.receivers.pass.candidates, ["h_MF1", "h_MF2"]);
  assert.equal(v.receivers.pass.defaultId, "h_MF2");
  assert.equal(v.receiverPreview.id, "h_MF2");
  assert.equal(match.defaultReceiverId(ms, data, "home", "pass"), "h_MF2");
  assert.ok(v.outcomesByReceiver.pass.h_MF1 && v.outcomesByReceiver.pass.h_MF2);
  assert.equal(v.outcomesByReceiver.pass.h_MF1.success.receiver.id, "h_MF1");
  assert.equal(v.outcomes.pass.success.receiver.id, "h_MF2", "outcomes 는 기본 수신자 기준");
  assert.ok(Number.isInteger(v.outcomesByReceiver.pass.h_MF1.expectedPct));
  // 직접 고르기
  const { ev } = forced(ms, { action: "pass", receiverId: "h_MF1" }, true);
  assert.equal(ev.receiverId, "h_MF1");
  assert.throws(() => match.step(clone(ms), data, { action: "pass", receiverId: "h_FW1" }), /받을 수 없는 선수/);
  assert.throws(() => match.step(clone(ms), data, { action: "pass", receiverId: "h_DF1" }), /받을 수 없는 선수/);
  // 받은 직후 특성(침투)이 기본값을 바꾼다: MF1 침투 → 드리블 300 × 1.15 = 345 vs MF2 ... 동률 만들기
  const r = mk({ MF1: { trait: "runner", stats: { dribble: 400, pass: 100 } }, MF2: { stats: { dribble: 440, pass: 100 } } });
  place(r, { line: 0, carrier: "h_DF1" });
  assert.equal(match.defaultReceiverId(r, data, "home", "pass"), "h_MF1", "침투 ×1.15 (460) > 440");
  // 박스 도착: 슛 값 × (1 + 피니셔)
  const f = mk({ FW1: { stats: { shoot: 400 } }, FW2: { trait: "finisher", stats: { shoot: 360 } } });
  place(f, { line: 2, carrier: "h_MF1" });
  assert.deepEqual(match.getMatchView(f, data).receivers.pass.candidates, ["h_FW1", "h_FW2"]);
  assert.equal(match.defaultReceiverId(f, data, "home", "pass"), "h_FW2", "360 × 1.15 = 414 > 400");
  // 상대 정보 미사용: 상대 스탯을 바꿔도 기본값 동일
  const f2 = clone(f); for (const p of f2.away.players) p.stats.defense = 50;
  assert.equal(match.defaultReceiverId(f2, data, "home", "pass"), "h_FW2");
});

/* ------------------------------------------------------------------ */
/* 7. 연계 특성 · 8. 상한 · 9. 팀워크 증폭                                  */
/* ------------------------------------------------------------------ */

test("연계 특성: 킬패스(첫 듀얼, 중거리 제외) · 피니셔 · 침투 · 볼 운반(빌드업·중원 드리블 +10%, 드리블 체력 −30%) · 주장(증폭 단계)", () => {
  // 킬패스: MF1 → FW1 (line 1 → 2), FW1 첫 듀얼 +20%, 중거리엔 없음
  const ms = mk({ MF1: { trait: "killpass" } });
  place(ms, { line: 1, carrier: "h_MF1" });
  const k = forced(ms, { action: "pass", receiverId: "h_FW1" }, true).ms;
  assert.equal(k.ball.carrierId, "h_FW1");
  assert.equal(k.ball.lastPasserId, "h_MF1");
  assert.equal(k.ball.receivedFresh, true);
  near(odds(k, "dribble", "hold").bonus.parts.killpass, 0.2, "킬패스 드리블");
  near(odds(k, "pass", "hold").bonus.parts.killpass, 0.2, "킬패스 패스");
  assert.equal(odds(k, "shoot", "hold").bonus.parts.killpass, undefined, "중거리 제외");
  assert.ok(odds(k, "dribble", "hold").links.includes("killpass"));
  // 첫 듀얼이 끝나면 사라진다
  const k2 = forced(k, { action: "dribble" }, true).ms;
  assert.equal(k2.ball.receivedFresh, false);
  assert.equal(odds(k2, "shoot", "save").bonus.parts.killpass, undefined);
  // 킬패스 → 박스 슛도 첫 듀얼
  const kb = mk({ MF1: { trait: "killpass" } });
  place(kb, { line: 2, carrier: "h_MF1" });
  const kbs = forced(kb, { action: "pass", receiverId: "h_FW1" }, true).ms;
  near(odds(kbs, "shoot", "save").bonus.parts.killpass, 0.2, "킬패스 박스 슛");
  // 피니셔: 받은 직후 박스 슛 +15%
  const f = mk({ FW2: { trait: "finisher" } });
  place(f, { line: 2, carrier: "h_FW1" });
  const fs2 = forced(f, { action: "pass", receiverId: "h_FW2" }, true).ms;
  near(odds(fs2, "shoot", "save").bonus.parts.finisher, 0.15, "피니셔");
  // 침투: 받은 직후 드리블 +15%, 두 번째 드리블엔 없음
  const r = mk({ MF2: { trait: "runner" } });
  place(r, { line: 0, carrier: "h_DF1" });
  const rs = forced(r, { action: "pass", receiverId: "h_MF2" }, true).ms;
  near(odds(rs, "dribble", "hold").bonus.parts.runner, 0.15, "침투");
  assert.ok(odds(rs, "dribble", "hold").links.includes("runner"));
  assert.equal(odds(rs, "pass", "hold").bonus.parts.runner, undefined, "침투는 드리블만");
  const rs2 = forced(rs, { action: "dribble" }, true).ms;
  if (rs2.ball.lineIndex < 3) assert.equal(odds(rs2, "dribble", "hold").bonus.parts.runner, undefined);
  // 볼 운반: 빌드업(line 0) 드리블 +10%, 드리블 체력 ×0.7
  const c = mk({ DF1: { trait: "carrier" } });
  place(c, { line: 0, carrier: "h_DF1" });
  near(odds(c, "dribble", "hold").bonus.parts.carrier, 0.1, "볼 운반 빌드업");
  const nc = mk();
  place(nc, { line: 0, carrier: "h_DF1" });
  const c1 = forced(c, { action: "dribble" }, true).ms;
  const n1 = forced(nc, { action: "dribble" }, true).ms;
  const spent = (s) => M.staminaMax - s.home.live.h_DF1.stamina;
  assert.ok(Math.abs(spent(c1) / spent(n1) - 0.7) < 0.01, `드리블 체력 −30%: ${spent(c1) / spent(n1)}`);
  // 빌드업·중원(line ≤ buildupMaxLine = 1)까지. line 0 공 소유자는 항상 DF 라 MF 보유자(미르카·키라)는 line 1 에서 받아 발동한다
  const cl1 = clone(c1);
  if (cl1.ball.lineIndex === 1) near(odds(cl1, "dribble", "hold").bonus.parts.carrier, 0.1, "볼 운반 중원(DF 가 몰고 올라감)");
  const cm = mk({ MF1: { trait: "carrier" } });
  place(cm, { line: 1, carrier: "h_MF1" });
  near(odds(cm, "dribble", "hold").bonus.parts.carrier, 0.1, "볼 운반 MF 중원");
  assert.equal(odds(cm, "pass", "hold").bonus.parts.carrier, undefined, "드리블만");
  near(match.tendencyValues(cm, data, "home").dribble / match.tendencyValues(place(mk(), { line: 1, carrier: "h_MF1" }), data, "home").dribble, 1.1, "성향값도 ×1.1");
  const c2 = mk({ MF1: { trait: "carrier" } });
  place(c2, { line: 2, carrier: "h_MF1" });
  assert.equal(odds(c2, "dribble", "hold").bonus.parts.carrier, undefined, "파이널 서드에서는 없음");
});

test("보너스 합 상한 +60% · 팀워크 증폭 (60/80/100 → ×1.1/1.2/1.3, 가산 부분만, 주장 +10, 크로서 비증폭)", () => {
  const ms = mk();
  place(ms, { line: 1, carrier: "h_MF1", ball: { pending: { beaten: true, interceptFail: false, nextBonus: 0.5 } } });
  const o = odds(ms, "dribble", "hold");
  near(o.bonus.total, 0.75, "합");
  near(o.bonus.capped, M.bonusCap, "상한");
  const base = clone(ms); base.ball.pending = { beaten: false, interceptFail: false, nextBonus: 0 };
  near(o.att / odds(base, "dribble", "hold").att, 1 + M.bonusCap, "공격 × (1 + 0.6)");
  // 증폭
  const kp = (teamwork, captain = false) => {
    const s = mk({ MF1: { trait: "killpass" }, DF2: { trait: captain ? "captain" : null }, team: { teamwork } });
    place(s, { line: 1, carrier: "h_FW1", ball: { lastPasserId: "h_MF1", receivedFresh: true } });
    return odds(s, "dribble", "hold").bonus.parts.killpass;
  };
  near(kp(59), 0.2, "59");
  near(kp(60), 0.2 * 1.1, "60");
  near(kp(80), 0.2 * 1.2, "80");
  near(kp(100), 0.2 * 1.3, "100");
  near(kp(50, true), 0.2 * 1.1, "주장: 50 + 10 = 60 → ×1.1");
  near(kp(90, true), 0.2 * 1.3, "주장: 90 + 10 = 100 → ×1.3");
  assert.equal(match.teamworkAmp({ teamwork: 79, players: [] }, data), 1.1);
  const cr = mk({ FW1: { trait: "crosser" }, team: { teamwork: 100 } });
  place(cr, { line: 2, carrier: "h_FW1" });
  near(odds(cr, "cross", "hold").bonus.parts.crosser, 0.1, "크로서는 증폭하지 않음");
});

/* ------------------------------------------------------------------ */
/* 10. 간파                                                              */
/* ------------------------------------------------------------------ */

test("간파 사용권: 텐션 0 · 경기당 수 만큼 · 수비 = 짝 ×readMult, 공격 = 상대 짝 무효 · 비용 반값 · 박스 불가", () => {
  const ms = mk({}, {}, {});
  ms.home.gaanpaTickets = 1;
  place(ms, { atk: "away", line: 1, carrier: "a_MF1" });
  const v = match.getMatchView(ms, data);
  assert.deepEqual(
    { usable: v.gaanpa.usable, source: v.gaanpa.source, cost: v.gaanpa.cost, tickets: v.gaanpa.tickets },
    { usable: true, source: "ticket", cost: 0, tickets: 1 },
  );
  const t0 = ms.home.tension;
  match.step(ms, data, { gaanpa: true });
  assert.equal(match.getMatchView(ms, data).needsDecision, "defense", "결정 대기 유지");
  assert.equal(ms.home.gaanpaTickets, 0);
  assert.equal(ms.home.tension, t0, "텐션 0");
  assert.equal(ms.duel.effects.home.gaanpa, "ticket");
  assert.equal(ms.duel.effects.home.readMult, 2.0);
  assert.equal(ms.duel.gaanpaSide, "home");
  const ev = ms.events.at(-1);
  assert.equal(ev.type, "skill");
  assert.equal(ev.ticket, true);
  assert.throws(() => match.step(clone(ms), data, { gaanpa: true }), /간파 사용 불가/);
  // 사용권이 없으면 불가
  const n = mk();
  place(n, { atk: "away", line: 1, carrier: "a_MF1" });
  assert.equal(match.getMatchView(n, data).gaanpa.reason, "간파 스킬·사용권 없음");
  // 공격 사용권 = negateRead
  const a = mk();
  a.home.gaanpaTickets = 1;
  place(a, { line: 1, carrier: "h_MF1" });
  match.step(a, data, { gaanpa: "ticket" });
  assert.equal(a.duel.effects.home.negateRead, true);
  assert.equal(a.duel.effects.home.negateActions, null);
  // 박스: 불가
  const b = mk({ FW1: { skillIds: ["sk_see_through"] } });
  b.home.gaanpaTickets = 1;
  place(b, { line: 3, carrier: "h_FW1" });
  const bv = match.getMatchView(b, data);
  assert.equal(bv.gaanpa.usable, false);
  assert.equal(bv.gaanpa.reason, "박스에서는 간파 불가");
  assert.equal(bv.skills.find((s) => s.skillId === "sk_see_through").reason, "박스에서는 간파 불가");
  // 스냅샷 필드: gaanpaTickets · gaanpaCostHalf (비용 −50%)
  const half = match.createMatch({
    data, seed: 1, possessions: 8, kind: "goal",
    home: { ...team("h", { MF1: { skillIds: ["sk_eagle_eye"] } }), gaanpaTickets: 2, gaanpaCostHalf: true },
    away: team("a"),
  });
  assert.equal(half.home.gaanpaTickets, 2);
  place(half, { atk: "away", line: 1, carrier: "a_MF1" });
  half.home.tension = 100;
  const eagle = data.skills.find((s) => s.id === "sk_eagle_eye");
  const hv = match.getMatchView(half, data);
  if (half.duel.defenderId === "h_MF1") {
    assert.equal(hv.skills.find((s) => s.skillId === "sk_eagle_eye").cost, eagle.tension * 0.5);
    match.step(half, data, { skillId: "sk_eagle_eye" });
    assert.equal(half.home.tension, 100 - eagle.tension * 0.5, "간파 스킬 비용 반값");
  }
  assert.equal(skills.skillCost({ gaanpaCostHalf: true }, eagle), eagle.tension * 0.5);
  assert.equal(skills.skillCost({ gaanpaCostHalf: true }, data.skills.find((s) => s.id === "sk_through_pass")), 25, "스루 패스는 간파가 아님");
  // modifiers.gaanpaTicket 에서도 읽는다
  const mod = match.createMatch({ data, seed: 1, possessions: 8, home: { ...team("h"), modifiers: { gaanpaTicket: 1 } }, away: team("a") });
  assert.equal(mod.home.gaanpaTickets, 1);
});

test("간파 먼저 쓴 쪽만: AI 가 먼저 간파 → 우리 간파(스킬·사용권) 비활성, AI 는 판정 때 우리 실제 선택에 맞춰 공격을 바꾼다", () => {
  // 상대(away) FW 가 꿰뚫어보기(공격 간파) + 텐션 충분 → line 2 (레버리지) 에서 먼저 커밋
  const ms = mk({ DF1: { skillIds: ["sk_eagle_eye"] }, DF2: { skillIds: ["sk_eagle_eye"] } }, { FW1: { skillIds: ["sk_see_through"], stats: { dribble: 500, pass: 450 } } });
  ms.away.tension = 100;
  ms.home.tension = 100;
  ms.home.gaanpaTickets = 1;
  place(ms, { atk: "away", line: 2, carrier: "a_FW1" });
  assert.equal(ms.duel.gaanpaSide, "away", "AI 가 레버리지 비트에서 간파");
  assert.equal(ms.duel.effects.away.negateRead, true);
  const v = match.getMatchView(ms, data);
  assert.equal(v.opponentReading, true);
  assert.equal(v.gaanpa.usable, false);
  assert.equal(v.gaanpa.reason, "상대가 먼저 간파");
  assert.equal(v.skills.find((s) => s.skillId === "sk_eagle_eye").enabled, false);
  assert.throws(() => match.step(clone(ms), data, { gaanpa: true }), /상대가 먼저 간파/);
  // 우리가 hold 를 고르면 AI 는 hold 상대 성공 확률 최고 공격으로 바꾼다
  for (const d of ["hold", "tackle", "intercept"]) {
    const expAtk = match.bestAttackResponse(ms, data, d).action;
    const { ev } = forced(ms, { action: d }, true);
    assert.equal(ev.action, expAtk, `${d} 에 대한 최선 공격`);
    assert.equal(ev.readBy, "away");
    const vv = v.actions.find((a) => a.action === d);
    const p = 1 - match.computeOdds(ms, data, { action: expAtk, defAction: d }).p;
    assert.equal(vv.expectedPct, Math.round(p * 100), "기대 % = 상대 대응 기준");
    // 결과 미리보기도 대응 기준 (정확)
    const exp = v.outcomes[d].fail;
    assert.equal(ev.toZone, exp.zone, `${d} 뚫림 결과 = 미리보기`);
  }
  // 반대로 우리가 먼저 쓰면 (사람 공격) AI 는 간파하지 않는다
  const h = mk({ FW1: { skillIds: ["sk_see_through"] } }, { DF1: { skillIds: ["sk_eagle_eye"] }, DF2: { skillIds: ["sk_eagle_eye"] } });
  h.away.tension = 0;
  place(h, { line: 2, carrier: "h_FW1" });
  assert.equal(h.duel.gaanpaSide, null, "텐션 0 → AI 간파 없음");
  h.home.tension = 100; h.away.tension = 100;
  match.step(h, data, { skillId: "sk_see_through" });
  assert.equal(h.duel.gaanpaSide, "home");
  const aw = match.getMatchView(h, data);
  assert.equal(aw.opponentReading, false);
});

/* ------------------------------------------------------------------ */
/* 11. 필살기                                                             */
/* ------------------------------------------------------------------ */

test("필살기 게이지: 보유자만 시작 gaugeStart · 듀얼 승 onDuelWin · 받음 onReceive · 골 onGoal · 상한 gaugeMax · 준비 = 가득 (config 값)", () => {
  const ms = mk({ MF1: { skillIds: ["sk_wind_thread"] }, FW1: { skillIds: ["sk_meteor_shot"] } });
  const U = M.ultimate;
  const cap = (x) => Math.min(x, U.gaugeMax); // 증가량 튜닝으로 합이 상한을 넘을 수 있다
  assert.equal(ms.home.live.h_MF1.gauge, U.gaugeStart);
  assert.equal(ms.home.live.h_FW1.gauge, U.gaugeStart);
  assert.equal(ms.home.live.h_DF1.gauge, undefined, "보유자만");
  // 받음 +onReceive
  place(ms, { line: 0, carrier: "h_DF1" });
  const r = forced(ms, { action: "pass", receiverId: "h_MF1" }, true).ms;
  assert.equal(r.home.live.h_MF1.gauge, cap(U.gaugeStart + U.onReceive));
  // 듀얼 승 +onDuelWin (드리블 성공)
  const w = forced(r, { action: "dribble" }, true).ms;
  assert.equal(w.home.live.h_MF1.gauge, cap(cap(U.gaugeStart + U.onReceive) + U.onDuelWin));
  // 골: 승 +onDuelWin + 골 +onGoal
  const g = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  place(g, { line: 3, carrier: "h_FW1" });
  const gg = forced(g, { action: "shoot" }, true).ms;
  assert.equal(gg.home.live.h_FW1.gauge, cap(cap(U.gaugeStart + U.onDuelWin) + U.onGoal));
  // 수비 승도 +onDuelWin
  const d = mk({ DF1: { skillIds: ["sk_meteor_shot"] }, DF2: { stats: { defense: 100 } } });
  place(d, { atk: "away", line: 2, carrier: "a_FW1" });
  if (d.duel.defenderId === "h_DF1") {
    const dd = forced(d, { action: "hold" }, false).ms;
    assert.equal(dd.home.live.h_DF1.gauge, cap(U.gaugeStart + U.onDuelWin));
  }
  // 상한 · 준비
  const f = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  f.home.live.h_FW1.gauge = 95;
  place(f, { line: 3, carrier: "h_FW1" });
  assert.equal(match.getMatchView(f, data).ultimate.home.h_FW1.ready, false);
  const ff = forced(f, { action: "shoot" }, true).ms;
  assert.equal(ff.home.live.h_FW1.gauge, U.gaugeMax, "상한 100");
});

test("필살 슛: 파이널 서드에서도 박스 슛 취급(계수 shoot) · 위력 ×2 · 막는 쪽 ×0.7 · 쓰면 게이지 0 · cutin 이벤트 · 잘못된 사용 throw", () => {
  const ms = mk({ FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 600 } } });
  ms.home.live.h_FW1.gauge = 100;
  place(ms, { line: 2, carrier: "h_FW1" });
  const v = match.getMatchView(ms, data);
  assert.equal(v.ultimate.home.h_FW1.ready, true);
  const opt = v.ultimateOptions[0];
  assert.deepEqual({ id: opt.skillId, type: opt.type, usable: opt.usable }, { id: "sk_meteor_shot", type: "shot", usable: true });
  assert.deepEqual(Object.keys(opt.expectedPct), ["shoot"]);
  assert.throws(() => match.step(clone(ms), data, { action: "dribble", ultimate: true }), /슛과 함께만/);
  assert.throws(() => match.step(clone(ms), data, { ultimate: true }), /액션과 함께/);
  const meteor = data.skills.find((s) => s.id === "sk_meteor_shot").ultimate;
  const fxU = { ...skills.emptyDuelEffects(), ult: { skillId: "sk_meteor_shot", ...meteor } };
  const withU = odds(ms, "shoot", "tackle", { fxA: fxU });
  const without = odds(ms, "shoot", "tackle");
  near(withU.att / without.att, (M.actionCoef.shoot * meteor.shoot) / M.actionCoef.midrangeShoot, "박스 슛 계수 × 2");
  near(withU.def / without.def, meteor.gkMult, "막는 쪽 ×0.7");
  assert.equal(odds(ms, "shoot", "hold", { fxA: fxU }).pair, "hold", "박스 슛 취급 → 버티기 중거리 배율 없음");
  assert.equal(opt.expectedPct.shoot, Math.round(odds(ms, "shoot", ms.duel.awayChoice.action, { fxA: fxU }).p * 100));
  const n0 = ms.events.length;
  const { ms: after, fresh } = forced(ms, { action: "shoot", ultimate: true }, true);
  const cut = fresh.find((e) => e.type === "cutin");
  assert.deepEqual({ skillId: cut.skillId, playerId: cut.playerId, ultimateType: cut.ultimateType }, { skillId: "sk_meteor_shot", playerId: "h_FW1", ultimateType: "shot" });
  assert.equal(after.home.live.h_FW1.gauge, 0, "쓰면 0 (그 듀얼에서 얻은 게이지도 없음)");
  assert.equal(after.stats.home.ultimatesUsed, 1);
  void n0;
  // 준비 안 됨
  const nr = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  place(nr, { line: 2, carrier: "h_FW1" });
  assert.throws(() => match.step(clone(nr), data, { action: "shoot", ultimate: true }), /게이지 부족/);
  assert.equal(match.getMatchView(nr, data).ultimateOptions[0].usable, false);
  // AI: 준비된 필살 슛은 성향에 반영 → line 2 에서 슛 + 필살기
  const a = mk({}, { FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 600, dribble: 400 } } });
  a.away.live.a_FW1.gauge = 100;
  place(a, { atk: "away", line: 2, carrier: "a_FW1" });
  assert.equal(a.duel.awayChoice.action, "shoot");
  assert.equal(a.duel.awayChoice.ultimate, true);
  assert.equal(a.duel.effects.away.ult.type, "shot");
  assert.equal(a.away.live.a_FW1.gauge, 0);
});

test("필살 패스 → 합체기: ×1.5 + 짝 무효 · 받은 선수 다음 듀얼 +50% · 게이지 +50 · 합체기(게이지 무관, 소모 없음, ×1.2, cutin → combo 이름)", () => {
  const ms = mk({ MF1: { skillIds: ["sk_wind_thread"] }, FW1: { skillIds: ["sk_meteor_shot"] } });
  const wt = data.skills.find((s) => s.id === "sk_wind_thread").ultimate;
  ms.home.live.h_MF1.gauge = 100;
  place(ms, { line: 1, carrier: "h_MF1" });
  const fxP = { ...skills.emptyDuelEffects(), ult: { skillId: "sk_wind_thread", ...wt } };
  near(odds(ms, "pass", "intercept", { fxA: fxP }).att / odds(ms, "pass", "intercept").att, wt.attack, "패스 ×1.5");
  near(odds(ms, "pass", "intercept", { fxA: fxP }).def / odds(ms, "pass", "hold").def, 1, "짝 무효 → 인터셉트 ×1.0 (인터셉트 스탯 = 버티기 스탯 = 400)");
  assert.throws(() => match.step(clone(ms), data, { action: "dribble", ultimate: true }), /패스·크로스와 함께만/);
  const { ms: a, fresh } = forced(ms, { action: "pass", receiverId: "h_FW1", ultimate: true }, true);
  assert.ok(fresh.some((e) => e.type === "cutin" && e.ultimateType === "pass"));
  assert.equal(a.home.live.h_MF1.gauge, 0);
  assert.equal(a.home.live.h_FW1.gauge, M.ultimate.gaugeStart + wt.receiverGauge, "받은 선수 +50 (+15 아님)");
  assert.equal(a.ball.comboReadyId, "h_FW1");
  near(a.ball.pending.nextBonus, wt.nextDuelBonus, "다음 듀얼 +50%");
  near(odds(a, "dribble", "hold").bonus.parts.next, wt.nextDuelBonus, "보너스 합에 들어감");
  // 합체기: 게이지 80 이어도 준비
  const v = match.getMatchView(a, data);
  assert.equal(v.ultimate.home.h_FW1.ready, true);
  assert.equal(v.ultimate.home.h_FW1.combo, true);
  const opt = v.ultimateOptions[0];
  assert.equal(opt.usable, true);
  assert.equal(opt.comboName, data.combos[0].name);
  const g0 = a.home.live.h_FW1.gauge;
  const n0 = a.events.length;
  match.step(a, data, { action: "shoot", ultimate: true });
  const evs = a.events.slice(n0);
  const cut = evs.find((e) => e.type === "cutin");
  const combo = evs.find((e) => e.type === "combo");
  assert.ok(cut && combo, "cutin + combo");
  assert.equal(cut.combo, true);
  assert.ok(evs.indexOf(combo) === evs.indexOf(cut) + 1, "combo 는 cutin 바로 뒤");
  assert.equal(combo.name, "바람의 유성");
  assert.deepEqual(combo.skillIds, ["sk_wind_thread", "sk_meteor_shot"]);
  assert.deepEqual(combo.playerIds, ["h_MF1", "h_FW1"]);
  const shot = evs.find((e) => RESOLVE.includes(e.type));
  assert.ok(shot.links.some((l) => l.id === "combo"));
  // 게이지 소모 없음 (그 듀얼 획득도 없음)
  assert.equal(a.home.live.h_FW1.gauge, g0);
  assert.equal(a.stats.home.combos, 1);
  // 합체기 배율 ×1.2
  const b = forced(ms, { action: "pass", receiverId: "h_FW1", ultimate: true }, true).ms;
  const meteor = data.skills.find((s) => s.id === "sk_meteor_shot").ultimate;
  const cfx = { ...skills.emptyDuelEffects(), ult: { skillId: "sk_meteor_shot", ...meteor }, combo: { name: "x" } };
  const nfx = { ...skills.emptyDuelEffects(), ult: { skillId: "sk_meteor_shot", ...meteor } };
  near(odds(b, "shoot", "hold", { fxA: cfx }).att / odds(b, "shoot", "hold", { fxA: nfx }).att, M.ultimate.comboBonus, "합체기 ×1.2");
  // 다음 듀얼에서 안 쓰면 사라진다
  const c = forced(b, { action: "dribble" }, true).ms;
  assert.equal(c.ball.comboReadyId, null);
  // AI: 받는 선수가 필살기 보유자면 필살 패스 → 다음 듀얼 합체기
  const ai2 = mk({}, { MF1: { skillIds: ["sk_wind_thread"], stats: { pass: 600 } }, FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 700 } }, FW2: { stats: { shoot: 100, dribble: 100, pass: 100 } } });
  ai2.away.live.a_MF1.gauge = 100;
  place(ai2, { atk: "away", line: 1, carrier: "a_MF1" });
  assert.equal(ai2.duel.awayChoice.action, "pass");
  assert.equal(ai2.duel.awayChoice.receiverId, "a_FW1");
  assert.equal(ai2.duel.awayChoice.ultimate, true);
  const ai3 = forced(ai2, { action: "hold" }, true).ms;
  assert.equal(ai3.ball.comboReadyId, "a_FW1");
  assert.equal(ai3.duel.effects.away.ult.skillId, "sk_meteor_shot", "합체기는 바로 다음 듀얼에서 커밋");
  assert.ok(ai3.duel.effects.away.combo);
  assert.ok(ai3.events.some((e) => e.type === "combo"));
});

test("필살 패스 받는 선수: 합체기 가치 반영 기본값(ultimateDefaultId) · 자동 진행 미리보기 변형(receiverPreviewBySkill[필살기]) = 실제", () => {
  // FW1 = 메테오(드리블 약함), FW2 = 드리블 강함 → 보통 기본값 FW2, 필살 패스면 합체기 가치로 FW1
  const ms = mk({ MF1: { skillIds: ["sk_wind_thread"] }, FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 600, dribble: 200, pass: 200 } }, FW2: { stats: { dribble: 600 } } });
  ms.home.live.h_MF1.gauge = 100;
  place(ms, { line: 1, carrier: "h_MF1" });
  const v = match.getMatchView(ms, data);
  assert.equal(v.receivers.pass.defaultId, "h_FW2");
  assert.equal(v.receivers.pass.ultimateDefaultId, "h_FW1");
  assert.equal(v.receiverPreview.id, "h_FW2");
  assert.equal(v.receiverPreviewBySkill.sk_wind_thread.id, "h_FW1", "필살 패스 변형");
  assert.equal(v.outcomesBySkill.sk_wind_thread.pass.success.receiver.id, "h_FW1");
  // 수동: 필살 패스를 받는 선수 없이 보내면 합체기 기본값
  const man = forced(ms, { action: "pass", ultimate: true }, true);
  assert.equal(man.ev.receiverId, "h_FW1");
  // 자동: 사람 측 AI 도 같은 규칙 → 실제 수신자 = 변형 미리보기
  const auto = forced(ms, null, true);
  assert.equal(auto.ev.action, "pass");
  assert.equal(auto.ev.receiverId, v.receiverPreviewBySkill.sk_wind_thread.id);
  assert.equal(auto.ev.ultimate, "sk_wind_thread");
});

test("필살 세이브: GK 는 게이지가 차면 자동 (세이브 ×2) · 사람 측도 자동", () => {
  const save = data.skills.find((s) => s.id === "sk_boss_save").ultimate;
  const ms = mk({}, { GK: { skillIds: ["sk_boss_save"] } });
  ms.away.live.a_GK.gauge = 100;
  place(ms, { line: 3, carrier: "h_FW1" });
  assert.equal(ms.duel.effects.away.ult.type, "save");
  assert.equal(ms.away.live.a_GK.gauge, 0);
  const base = clone(ms); base.duel.effects.away.ult = null;
  near(odds(ms, "shoot", "save").def / odds(base, "shoot", "save").def, save.saveMult, "세이브 ×2");
  assert.ok(ms.events.some((e) => e.type === "cutin" && e.ultimateType === "save"));
  const v = match.getMatchView(ms, data);
  assert.equal(v.expected.defense.action, "save");
  // 사람 측 GK
  const h = mk({ GK: { skillIds: ["sk_boss_save"] } });
  h.home.live.h_GK.gauge = 100;
  place(h, { atk: "away", line: 3, carrier: "a_FW1" });
  assert.equal(h.duel.homeChoice.action, "save");
  assert.equal(h.duel.effects.home.ult.type, "save");
  // 게이지 부족이면 발동 안 함
  const n = mk({}, { GK: { skillIds: ["sk_boss_save"] } });
  place(n, { line: 3, carrier: "h_FW1" });
  assert.equal(n.duel.effects.away.ult, null);
});

/* ------------------------------------------------------------------ */
/* 12. 액티브 10종                                                        */
/* ------------------------------------------------------------------ */

test("액티브: 철의 태클 · 바위 방벽 · 라인 브레이커 · 파워 슛 · 매의 눈 · 꿰뚫어보기 · 소매치기 · 함성 · 폭발 드리블 · 스루 패스", () => {
  const S = Object.fromEntries(data.skills.map((s) => [s.id, s]));
  const useDef = (skillId, over = {}) => {
    const ms = mk({ DF1: { skillIds: [skillId] }, DF2: { stats: { defense: 100 } }, ...over });
    place(ms, { atk: "away", line: 2, carrier: "a_FW1" });
    ms.home.tension = 100;
    assert.equal(ms.duel.defenderId, "h_DF1");
    match.step(ms, data, { skillId });
    assert.equal(ms.duel.effects.home.usedSkillId, skillId);
    assert.equal(ms.home.tension, 100 - S[skillId].tension, `${skillId} 텐션`);
    return ms;
  };
  // 철의 태클: ×1.4, 빗나감 없음
  const it = useDef("sk_iron_tackle");
  near(odds(it, "pass", "tackle").def / odds(it, "pass", "tackle", { fxD: skills.emptyDuelEffects() }).def, 1.4 / M.missMult, "철의 태클");
  // 바위 방벽: ×1.4, 뚫려도 손해 없음
  const ss = useDef("sk_stone_shield");
  near(odds(ss, "dribble", "hold").def / odds(ss, "dribble", "hold", { fxD: skills.emptyDuelEffects() }).def, 1.4, "바위 방벽");
  ss.duel.awayChoice = { ...ss.duel.awayChoice, action: "dribble" };
  const ssa = forced(ss, { action: "tackle" }, true).ms;
  assert.equal(ssa.ball.pending.beaten, false);
  // 매의 눈: 짝 ×2.0
  const ee = useDef("sk_eagle_eye");
  assert.equal(odds(ee, "dribble", "tackle").pairMult, 2.0);
  assert.equal(ee.duel.gaanpaSide, "home");
  // 소매치기 (MF): line 1 태클 → 역습 +1, 텐션 +10
  const pp = mk({ FW1: { skillIds: ["sk_pickpocket"] } });
  place(pp, { atk: "away", line: 0, carrier: "a_DF1" });
  pp.home.tension = 100;
  if (pp.duel.defenderId === "h_FW1") {
    const r = skills.checkSkillUsable(pp, data, "home", "h_FW1", S.sk_pickpocket, "defense");
    assert.equal(r.reason, "포지션 조건 불충족", "소매치기는 MF 만");
  }
  const pm = mk({ MF1: { skillIds: ["sk_pickpocket"] }, MF2: { stats: { defense: 100 } } });
  place(pm, { atk: "away", line: 1, carrier: "a_MF1" });
  pm.home.tension = 50;
  pm.duel.awayChoice = { ...pm.duel.awayChoice, action: "dribble" };
  const pmv = match.getMatchView(pm, data);
  assert.ok(pmv.outcomesBySkill.sk_pickpocket.tackle.success.zone === match.zoneOf("home", 2));
  const pr = forced(pm, { action: "tackle", skillId: "sk_pickpocket" }, false).ms;
  assert.equal(pr.ball.lineIndex, 2);
  assert.equal(pr.home.tension, 50 - 25 + M.tension.steal + 10);
  // 함성: 전원 체력 +30, 제쳐짐 해제, 팀 판정 ×1.1 (이번 포제션)
  const rc = mk({ DF1: { skillIds: ["sk_rally_cry"] }, DF2: { stats: { defense: 100 } } });
  place(rc, { atk: "away", line: 2, carrier: "a_FW1", ball: { pending: { beaten: true, interceptFail: false, nextBonus: 0 } } });
  assert.equal(rc.duel.coverCount, 0);
  for (const lv of Object.values(rc.home.live)) lv.stamina = 50;
  rc.home.tension = 100;
  const before = odds(rc, "dribble", "hold");
  match.step(rc, data, { skillId: "sk_rally_cry" });
  for (const lv of Object.values(rc.home.live)) assert.equal(lv.stamina, 80);
  assert.equal(rc.ball.pending.beaten, false, "제쳐짐 해제");
  assert.equal(rc.duel.coverCount, rc.duel.baseCover, "커버 복구");
  assert.equal(rc.possessionFx.home.teamMult, 1.1);
  const after = odds(rc, "dribble", "hold");
  near(after.def / before.def, 1.1 * (1 + M.coverBonusPerExtraDefender * rc.duel.baseCover), "팀 판정 ×1.1 + 커버 복구");
  near(before.att / after.att, 1 + M.beatenBonus, "상대 제쳐짐 보너스 사라짐");
  // 다음 포제션엔 없다
  const nx = forced(rc, { action: "hold" }, false).ms;
  assert.equal(nx.possessionFx.home.teamMult, 1);
  // 라인 브레이커: line 0 드리블 성공 → line 2
  const lb = mk({ DF1: { skillIds: ["sk_line_breaker"] } });
  place(lb, { line: 0, carrier: "h_DF1" });
  lb.home.tension = 100;
  const lbr = forced(lb, { action: "dribble", skillId: "sk_line_breaker" }, true);
  assert.equal(lbr.ms.ball.lineIndex, 2);
  assert.equal(lbr.ms.home.tension, 100 - S.sk_line_breaker.tension + M.tension.duelWin);
  // 파워 슛: 중거리 계수 1.0, ×1.5, 체력 +8
  const ps = mk({ FW1: { skillIds: ["sk_power_shot"] } });
  place(ps, { line: 2, carrier: "h_FW1" });
  ps.home.tension = 100;
  const psFx = { ...skills.emptyDuelEffects() };
  skills.addSkillFx(psFx, S.sk_power_shot);
  near(odds(ps, "shoot", "hold", { fxA: psFx }).att / odds(ps, "shoot", "hold").att, (1.0 * 1.5) / M.actionCoef.midrangeShoot, "파워 슛");
  const psr = forced(ps, { action: "shoot", skillId: "sk_power_shot" }, false).ms;
  const phys = 1 - 400 / 2000;
  near(M.staminaMax - psr.home.live.h_FW1.stamina, (M.staminaCost.shoot + 8) * phys, "파워 슛 체력");
  // 꿰뚫어보기: 상대 짝 무효 (전 액션)
  const st = mk({ FW1: { skillIds: ["sk_see_through"] } });
  place(st, { line: 1, carrier: "h_FW1" });
  st.home.tension = 100;
  match.step(st, data, { skillId: "sk_see_through" });
  assert.equal(odds(st, "dribble", "tackle").pairMult, 1);
  assert.equal(odds(st, "pass", "intercept").pairMult, 1);
  assert.equal(st.duel.gaanpaSide, "home");
  // 폭발 드리블: 드리블만 ×1.5, 성공 시 체력 소모 없음
  const bd = mk({ FW1: { skillIds: ["sk_burst_dribble"] } });
  place(bd, { line: 1, carrier: "h_FW1" });
  bd.home.tension = 100;
  match.step(bd, data, { skillId: "sk_burst_dribble" });
  const none = skills.emptyDuelEffects();
  near(odds(bd, "dribble", "hold").att / odds(bd, "dribble", "hold", { fxA: none }).att, 1.5, "폭발 드리블");
  near(odds(bd, "pass", "hold").att / odds(bd, "pass", "hold", { fxA: none }).att, 1, "패스엔 무효");
  const bdr = forced(bd, { action: "dribble" }, true).ms;
  assert.equal(bdr.home.live.h_FW1.stamina, M.staminaMax, "성공 시 체력 소모 0");
  // 스루 패스: 패스 짝 무효 + 받은 선수 다음 듀얼 +25%, 드리블엔 무효
  const tp = mk({ MF1: { skillIds: ["sk_through_pass"] } });
  place(tp, { line: 1, carrier: "h_MF1" });
  tp.home.tension = 100;
  const tpFx = { ...skills.emptyDuelEffects() };
  skills.addSkillFx(tpFx, S.sk_through_pass);
  assert.equal(odds(tp, "pass", "intercept", { fxA: tpFx }).pairMult, 1);
  assert.equal(odds(tp, "dribble", "tackle", { fxA: tpFx }).pairMult, M.readBonus);
  const tpr = forced(tp, { action: "pass", skillId: "sk_through_pass", receiverId: "h_FW1" }, true).ms;
  near(tpr.ball.pending.nextBonus, 0.25, "스루 패스 다음 듀얼 +25%");
  assert.equal(skills.isGaanpaSkill(S.sk_through_pass), false);
});

test("AI 스킬 규칙: 버티기에 소매치기 금지, 간파는 레버리지에서만, 한 듀얼 팀당 액티브 1 + 필살기 1", () => {
  // 버티기 + 소매치기: 수비수가 버티기형이면 소매치기를 쓰지 않는다
  const ms = mk({}, { MF1: { skillIds: ["sk_pickpocket"], stats: { defense: 600, physical: 200, pass: 200 } }, MF2: { stats: { defense: 100 } } });
  ms.away.tension = 100;
  place(ms, { line: 1, carrier: "h_MF1" });
  assert.equal(ms.duel.defenderId, "a_MF1");
  assert.equal(ms.duel.awayChoice.action, "hold");
  assert.equal(ms.duel.awayChoice.skillId, null, "버티기에는 소매치기 금지");
  // 같은 선수가 태클형이면 쓴다
  const t = mk({}, { MF1: { skillIds: ["sk_pickpocket"], stats: { defense: 600, physical: 900, pass: 200 } }, MF2: { stats: { defense: 100 } } });
  t.away.tension = 100;
  place(t, { line: 1, carrier: "h_MF1" });
  assert.equal(t.duel.awayChoice.action, "tackle");
  assert.equal(t.duel.awayChoice.skillId, "sk_pickpocket");
  // 간파는 레버리지(line 2 또는 동점·열세 마지막 3포제션)에서만
  const g = mk({}, { MF1: { skillIds: ["sk_eagle_eye"] }, MF2: { stats: { defense: 100 } } });
  g.away.tension = 100;
  g.score = { home: 0, away: 1 }; // 상대가 앞섬 → 레버리지 아님
  place(g, { line: 1, carrier: "h_MF1" });
  assert.equal(g.duel.gaanpaSide, null);
  assert.equal(ai.isLeverage(g, "away"), false);
  g.score = { home: 1, away: 0 };
  g.possession = g.possessionsTotal;
  place(g, { line: 1, carrier: "h_MF1" });
  assert.equal(ai.isLeverage(g, "away"), true);
  assert.equal(g.duel.gaanpaSide, "away");
  // 액티브 + 필살기 동시
  const both = mk({ FW1: { skillIds: ["sk_power_shot", "sk_meteor_shot"] } });
  both.home.live.h_FW1.gauge = 100;
  both.home.tension = 100;
  place(both, { line: 2, carrier: "h_FW1" });
  match.step(both, data, { action: "shoot", skillId: "sk_power_shot", ultimate: true });
  const last = both.events.filter((e) => e.type === "skill" || e.type === "cutin").slice(-2).map((e) => e.type);
  assert.deepEqual(last, ["skill", "cutin"]);
});

test("기대 % 미리보기: 함성 = 발동 뒤 상태(팀 판정·제쳐짐 해제·커버 복구) · line 2 돌파 뒤 슈터 자기 필살 슛(게이지가 차면)", () => {
  // 1) 함성: skills[].expectedPct = 함성을 부분 커밋한 뒤의 actions[].expectedPct (제쳐짐 유무 둘 다)
  for (const beaten of [false, true]) {
    const ms = mk({ DF1: { skillIds: ["sk_rally_cry"] }, DF2: { skillIds: ["sk_rally_cry"] } });
    place(ms, { atk: "away", line: 2, carrier: "a_FW1", ball: { pending: { beaten, interceptFail: false, nextBonus: 0 } } });
    ms.home.tension = 100;
    const snap = JSON.stringify(ms);
    const v = match.getMatchView(ms, data);
    assert.equal(JSON.stringify(ms), snap, "미리보기는 상태를 바꾸지 않는다");
    const sk = v.skills.find((s) => s.skillId === "sk_rally_cry");
    const after = clone(ms);
    match.step(after, data, { skillId: "sk_rally_cry" });
    const v2 = match.getMatchView(after, data);
    for (const a of v.actions.filter((x) => x.enabled)) {
      const real = v2.actions.find((x) => x.action === a.action).expectedPct;
      assert.equal(sk.expectedPct[a.action], real, `함성 ${a.action} (beaten ${beaten})`);
      assert.ok(real > a.expectedPct, `함성은 ${a.action} 막을 확률을 올린다`);
    }
  }
  // 2) 메테오 보유 FW, 게이지 max − onDuelWin: line 2 드리블 기대 % = 돌파 × (돌파 뒤 필살 슛 골 확률)
  const U = M.ultimate;
  const ms = mk({ FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 700 } } });
  place(ms, { line: 2, carrier: "h_FW1" });
  ms.home.live.h_FW1.gauge = U.gaugeMax - U.onDuelWin;
  const v = match.getMatchView(ms, data);
  const p = odds(ms, "dribble", v.expected.defense.action).p;
  const s = forced(ms, { action: "dribble" }, true).ms;
  assert.equal(s.ball.lineIndex, 3);
  assert.equal(s.home.live.h_FW1.gauge, U.gaugeMax, "돌파로 게이지가 찬다");
  const u = match.getMatchView(s, data).ultimateOptions.find((o) => o.type === "shot");
  assert.ok(u && u.usable, "박스에서 필살 슛 가능");
  assert.equal(v.actions.find((a) => a.action === "dribble").expectedPct, Math.round(p * u.expectedPct.shoot), "드리블 기대 % 에 다음 필살 슛 포함");
  // 게이지가 모자라면 (돌파해도 안 참) 필살 없는 박스 슛 기준
  const ms2 = clone(ms);
  ms2.home.live.h_FW1.gauge = U.gaugeMax - U.onDuelWin - 1;
  const plain = forced(ms2, { action: "dribble" }, true).ms;
  const pPlain = odds(plain, "shoot", "save").p;
  assert.equal(match.getMatchView(ms2, data).actions.find((a) => a.action === "dribble").expectedPct, Math.round(p * pPlain * 100));
});

/* ------------------------------------------------------------------ */
/* 13. 데이터 무결성                                                      */
/* ------------------------------------------------------------------ */

test("데이터 무결성: traits · combos · skills(액티브 어휘·필살기) · 캐릭터/상대 특성 참조 · config.match", () => {
  const traitIds = new Set(data.traits.map((t) => t.id));
  assert.deepEqual([...traitIds].sort(), ["captain", "carrier", "crosser", "distributor", "finisher", "killpass", "runner", "targetman", "wall"]);
  for (const t of data.traits) {
    for (const k of ["id", "name", "description", "kind", "params"]) assert.ok(k in t, `${t.id}.${k}`);
    assert.ok(["bonus", "condition", "position", "mult", "team"].includes(t.kind), t.id);
    assert.equal(typeof t.amp, "boolean", `${t.id}.amp`);
  }
  // DEFAULT_TRAITS 폴백이 traits.json 과 같은 값
  for (const t of match.DEFAULT_TRAITS) {
    const d = data.traits.find((x) => x.id === t.id);
    assert.deepEqual(t.params, d.params, `${t.id} params`);
    assert.equal(t.amp, d.amp, `${t.id} amp`);
  }
  const expectTrait = { ch_elf_playmaker: "killpass", ch_wolf_winger: "crosser", ch_giant_striker: "targetman", ch_human_runner: "runner", ch_cat_trickster: "carrier", ch_dwarf_wall: "wall", ch_spirit_keeper: "distributor", ch_human_captain: "captain" };
  for (const c of data.characters) {
    assert.ok(traitIds.has(c.trait), `${c.id} trait ${c.trait}`);
    if (expectTrait[c.id]) assert.equal(c.trait, expectTrait[c.id], c.id);
  }
  for (const o of data.opponents) for (const p of o.players) if (p.trait != null) assert.ok(traitIds.has(p.trait), `${o.id} ${p.name} trait ${p.trait}`);
  // skills
  const S = new Map(data.skills.map((s) => [s.id, s]));
  for (const s of data.skills) {
    if (s.kind === "active") {
      assert.ok(s.active && skills.ACTIVE_EFFECTS.includes(s.active.effect), `${s.id} effect`);
      // GK 배급 스킬(longPassBoost — 캐논 킥)은 phase "distribution" (듀얼 밖)
      const phases = skills.isDistributionSkill(s) ? ["distribution"] : ["attack", "defense", "any"];
      assert.ok(phases.includes(s.active.phase), `${s.id} phase`);
      assert.ok(s.tension >= 25 && s.tension <= 50, `${s.id} tension ${s.tension}`);
    }
    if (s.kind === "unique") {
      assert.equal(s.tension, 0, `${s.id} tension 0`);
      assert.equal(s.active, null, `${s.id} active 없음`);
      assert.ok(s.ultimate && skills.ULTIMATE_TYPES.includes(s.ultimate.type), `${s.id} ultimate`);
    }
  }
  const table = { sk_iron_tackle: 30, sk_line_breaker: 35, sk_power_shot: 30, sk_eagle_eye: 40, sk_see_through: 40, sk_pickpocket: 25, sk_rally_cry: 35, sk_stone_shield: 35, sk_burst_dribble: 30, sk_through_pass: 25 };
  for (const [id, t] of Object.entries(table)) assert.equal(S.get(id).tension, t, `${id} 텐션`);
  assert.deepEqual({ l: S.get("sk_see_through").learnable, c: S.get("sk_see_through").cost, p: S.get("sk_see_through").positions }, { l: true, c: 140, p: ["FW", "MF"] });
  assert.equal(S.get("sk_boss_strike").ultimate.type, "shot");
  assert.equal(S.get("sk_boss_save").ultimate.type, "save");
  // combos: a = 필살 패스, b = 필살기
  for (const c of data.combos) {
    assert.equal(S.get(c.a).ultimate.type, "pass", `${c.a}`);
    assert.ok(S.get(c.b).ultimate, `${c.b}`);
    assert.ok(typeof c.name === "string" && c.name.length > 0);
  }
  // 모든 스킬 참조
  for (const c of data.characters) assert.ok(S.has(c.innateSkillId), c.innateSkillId);
  for (const o of data.opponents) for (const p of o.players) for (const id of p.skillIds || []) assert.ok(S.has(id), `${o.id} ${id}`);
  for (const sp of data.supports) for (const id of sp.hintSkillIds || []) assert.ok(S.has(id), `${sp.id} ${id}`);
  // config.match
  for (const k of ["readBonus", "missMult", "holdMult", "holdVsMidrange", "holdVsCross", "boxLink", "beatenBonus", "interceptFailBonus", "oneTouchGk", "bonusCap", "passChainBonus", "counterCap", "counterCapTension", "tendency", "ultimate", "teamworkAmp"]) {
    assert.ok(k in M, `config.match.${k}`);
  }
  for (const k of ["dribble", "pass", "cross", "shoot", "midrangeShoot", "header", "save"]) assert.ok(k in M.actionCoef, `actionCoef.${k}`);
  assert.equal(M.aiRevealForOpponent, undefined, "aiRevealForOpponent 삭제");
  assert.ok(["tackle", "balanced", "intercept", "hold"].includes(data.config.defaultTactics.defense));
  // 모든 상대 팀으로 경기 생성 가능 (특성·스킬 검증)
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "integrity" }), data);
  for (const o of data.opponents) {
    const ms = match.createMatch({ data, seed: o.id, home, away: run.buildOpponentSnapshot(o, data), possessions: 6, kind: "friendly" });
    match.simulateAuto(ms, data);
    assert.ok(ms.finished);
  }
  // 알 수 없는 특성 id 는 createMatch 에서 throw
  const bad = team("h", { MF1: { trait: "nope" } });
  assert.throws(() => match.createMatch({ data, seed: 1, home: bad, away: team("a"), possessions: 6 }), /연계 특성 id/);
});

test("상대 연계 특성은 자동(A안) 경기에서 발동한다 — 특성별 발동 > 0 (죽은 데이터 금지, GDD 9.11)", async () => {
  const { collectGoalSetups } = await import("../tools/sim.mjs");
  const setups = collectGoalSetups(data, { runs: 9, seed: "traits" });
  const fired = {}; // `${opp.id}|${name}` → 발동 수
  const wallHold = {}; // 철벽: 수비할 때 자동 선택이 버티기인가
  const key = (o, p) => `${o.id}|${p.name}`;
  const RESOLVED = ["duel", "turnover", "save", "goal"];
  for (const o of data.opponents) {
    const away = run.buildOpponentSnapshot(o, data);
    for (const su of setups[o.season]) {
      for (let seed = 1; seed <= 2; seed++) {
        const ms = match.createMatch({ data, seed: `${su.seed}-${seed}`, home: clone(su.home), away: clone(away), possessions: su.possessions, kind: "goal" });
        let guard = 0;
        while (!match.isFinished(ms) && guard++ < 5000) {
          if (ms.phase !== "decision") {
            // 빠른 배급 (2026-09-29): GK 롱패스 배급 +25% → 상대 GK 가 롱패스를 차면 발동 (성공 = distribution, 실패 = turnover)
            const n1 = ms.events.length;
            match.step(ms, data, null);
            for (const e of ms.events.slice(n1)) {
              if (!e.distribution || e.action !== "long" || e.side !== "away") continue;
              const g = ms.away.players.find((x) => x.id === e.playerId);
              if (g && g.trait === "distributor") fired[key(o, g)] = (fired[key(o, g)] || 0) + 1;
            }
            continue;
          }
          const b = ms.ball;
          const pre = { atk: ms.attackingSide, line: b.lineIndex, fresh: b.receivedFresh, carrier: b.carrierId, passer: b.lastPasserId, def: ms.duel.defenderId };
          if (pre.atk === "home" && pre.line < 3) {
            const d = ms.away.players.find((x) => x.id === pre.def);
            if (d && d.trait === "wall") wallHold[key(o, d)] = match.pickByTendency(match.tendencyValues(ms, data, "away", d.id), ["hold", "tackle", "intercept"]) === "hold";
          }
          const n0 = ms.events.length;
          match.step(ms, data, null);
          const ev = ms.events.slice(n0).find((e) => RESOLVED.includes(e.type));
          if (!ev) continue;
          const links = (ev.links || []).map((l) => l.id);
          const hit = (p) => { fired[key(o, p)] = (fired[key(o, p)] || 0) + 1; };
          if (pre.atk === "away") {
            const p = ms.away.players.find((x) => x.id === pre.carrier);
            const passer = pre.passer && ms.away.players.find((x) => x.id === pre.passer);
            if (passer && passer.trait === "killpass" && links.includes("killpass")) hit(passer);
            const t = p && p.trait;
            if (t === "runner" && links.includes("runner")) hit(p);
            if (t === "carrier" && ev.action === "dribble" && pre.line <= 1) hit(p);
            if (t === "crosser" && ev.action === "cross") hit(p);
            if (t === "targetman" && ev.header) hit(p);
            if (t === "finisher" && ev.action === "shoot" && pre.fresh && (pre.line >= 3 || ev.ultimate)) hit(p);
          } else {
            const d = ms.away.players.find((x) => x.id === pre.def);
            if (d && d.trait === "wall" && ev.defAction === "hold") hit(d);
          }
        }
      }
    }
  }
  for (const o of data.opponents) {
    for (const p of o.players) {
      if (!p.trait || p.trait === "captain") continue;
      const k = key(o, p);
      if (p.trait === "wall") {
        // 철벽은 매치업 수비수 선택(duelPicker matchup)이라 드물 수 있다 — 수비할 때 자동 선택이 버티기면 살아 있는 데이터
        assert.ok((fired[k] || 0) > 0 || wallHold[k] === true, `${o.name} ${p.name} 철벽: 발동 ${fired[k] || 0}, 버티기 선택 ${wallHold[k]}`);
      } else {
        assert.ok((fired[k] || 0) > 0, `${o.name} ${p.name} ${p.trait} 자동 발동 0회`);
      }
    }
  }
});

test("traits/combos 가 데이터 번들에 없어도 기본값으로 동작 (UI·도구 로더 호환)", () => {
  const d2 = loadData();
  delete d2.traits;
  delete d2.combos;
  const home = run.buildTeamSnapshot(run.createRun({ data: d2, seed: "fallback" }), d2);
  const away = run.buildOpponentSnapshot(d2.opponents[0], d2);
  const a = match.simulateAuto(match.createMatch({ data: d2, seed: 3, home, away, possessions: 8, kind: "goal" }), d2);
  const b = match.simulateAuto(match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" }), data);
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events), "traits.json = DEFAULT_TRAITS 이면 같은 경기");
});

test("여러 경기: 필살기·액티브·합체기·간파가 자동 경기에서 발동, 불변식 (게이지 0~100, NaN 없음)", () => {
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "many" }), data);
  for (const p of home.players) for (const k of Object.keys(p.stats)) p.stats[k] = Math.round(p.stats[k] * 1.6);
  const seen = { cutin: 0, combo: 0, skill: 0, gaanpa: 0, cross: 0, header: 0 };
  for (const o of data.opponents) {
    const away = run.buildOpponentSnapshot(o, data);
    for (let seed = 1; seed <= 25; seed++) {
      const ms = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 10, kind: "goal" }), data);
      for (const side of ["home", "away"]) {
        for (const lv of Object.values(ms[side].live)) {
          if (lv.gauge != null) assert.ok(lv.gauge >= 0 && lv.gauge <= M.ultimate.gaugeMax);
        }
      }
      assert.ok(!/NaN/.test(JSON.stringify(ms)));
      for (const e of ms.events) {
        if (e.type in seen) seen[e.type]++;
        if (e.gaanpa) seen.gaanpa++;
        if (e.action === "cross") seen.cross++;
        if (e.header) seen.header++;
        assert.ok(!/undefined|NaN/.test(e.text), e.text);
      }
    }
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `${k} 발생 ${JSON.stringify(seen)}`);
});

/* ------------------------------------------------------------------ */
/* 14. 짝 표 개편 · 박스 연결 (2026-09-29 사용자 결정)                       */
/* ------------------------------------------------------------------ */

test("짝 표 (2026-09-29): 드리블↔태클 · 패스↔인터셉트 · 크로스↔버티기(×holdVsCross) · 중거리↔버티기, 크로스엔 태클·인터셉트 빗나감, 간파도 같은 짝", () => {
  assert.deepEqual(match.COUNTER, { dribble: "tackle", pass: "intercept", cross: "hold", shoot: "hold" });
  assert.deepEqual(match.COUNTERED, { tackle: ["dribble"], intercept: ["pass"], hold: ["cross", "shoot"] });
  assert.equal(M.holdVsCross, M.readBonus, "기본값 = 짝 배율 readBonus");
  assert.deepEqual(Object.keys(M.boxLink).sort(), ["gkMult"], "autoRatio 폐지 (기대 골 규칙)");
  assert.equal(M.boxLink.gkMult, 0.6);
  // 수비수 a_DF1: 태클 (500+300)/2 = 400, 인터셉트 (500+200)/2 = 350, 버티기 500 — 각각 × 행동 계수 (태클 · 인터셉트 계수 · holdMult, L51 셋 다 0.6)
  const ms = mk({ FW1: { trait: "crosser" } }, { DF1: { stats: { defense: 500, physical: 300, pass: 200 } }, DF2: { stats: { defense: 100 } } });
  place(ms, { line: 2, carrier: "h_FW1" });
  ms.duel.defenderId = "a_DF1";
  ms.duel.coverCount = 0;
  const T = 400 * M.actionCoef.tackle;
  const I = 350 * M.actionCoef.intercept;
  const H = 500 * M.holdMult;
  const cases = [
    ["cross", "hold", H * M.holdVsCross, "read"],
    ["cross", "intercept", I * M.missMult, "miss"],
    ["cross", "tackle", T * M.missMult, "miss"],
    ["pass", "intercept", I * M.readBonus, "read"],
    ["pass", "tackle", T * M.missMult, "miss"],
    ["pass", "hold", H, "hold"],
    ["dribble", "hold", H, "hold"],
    ["dribble", "tackle", T * M.readBonus, "read"],
    ["dribble", "intercept", I * M.missMult, "miss"],
    ["shoot", "hold", H * M.holdVsMidrange, "read"],
  ];
  for (const [a, d, exp, pair] of cases) {
    const o = odds(ms, a, d);
    near(o.def, exp, `${a} vs ${d}`);
    assert.equal(o.pair, pair, `${a} vs ${d} pair`);
  }
  assert.equal(odds(ms, "cross", "hold").read, true);
  // holdVsCross 는 따로 튜닝 가능
  const d2 = clone(data);
  d2.config.match.holdVsCross = 2.5;
  near(match.computeOdds(ms, d2, { action: "cross", defAction: "hold" }).def, H * 2.5, "holdVsCross 2.5");
  near(match.computeOdds(ms, d2, { action: "pass", defAction: "intercept" }).def, I * M.readBonus, "다른 짝은 그대로");
  // 간파: readBoost → 버티기↔크로스도 ×readMult (다른 짝과 같음), 짝 무효(간파 negateRead · 필살 패스 · 스루 패스) → ×1.0
  const rb = { ...skills.emptyDuelEffects(), readMult: 2.0 };
  near(odds(ms, "cross", "hold", { fxD: rb }).def, H * Math.max(2.0, M.holdVsCross), "readBoost 버티기 vs 크로스");
  near(odds(ms, "cross", "intercept", { fxD: rb }).def, I * M.missMult, "readBoost 는 빗나감엔 무관");
  const ng = { ...skills.emptyDuelEffects(), negateRead: true };
  near(odds(ms, "cross", "hold", { fxA: ng }).def, H, "negateRead → 버티기 짝 ×1.0");
  assert.equal(odds(ms, "cross", "hold", { fxA: ng }).read, false);
  const wt = data.skills.find((s) => s.id === "sk_wind_thread").ultimate;
  near(odds(ms, "cross", "hold", { fxA: { ...skills.emptyDuelEffects(), ult: { skillId: "sk_wind_thread", ...wt } } }).def, H, "필살 패스 짝 무효");
  const tp = { ...skills.emptyDuelEffects() };
  skills.addSkillFx(tp, data.skills.find((s) => s.id === "sk_through_pass"));
  near(odds(ms, "cross", "hold", { fxA: tp }).def, H, "스루 패스(패스·크로스 짝 무효)");
  // 최선 대응 (간파한 AI · 도구): 스탯이 같으면 크로스 → 버티기, 패스 → 인터셉트, 드리블 → 태클 / 인터셉트 상대 → 크로스(빗나감 + 크로서)
  const eq = mk({ FW1: { trait: "crosser" } });
  place(eq, { line: 2, carrier: "h_FW1" });
  assert.equal(match.bestDefenseResponse(eq, data, "cross"), "hold");
  assert.equal(match.bestDefenseResponse(eq, data, "pass"), "intercept");
  assert.equal(match.bestDefenseResponse(eq, data, "dribble"), "tackle");
  assert.equal(match.bestAttackResponse(eq, data, "intercept").action, "cross");
  assert.notEqual(match.bestAttackResponse(eq, data, "hold").action, "cross");
  // 힌트: 크로스 = vs 버티기에 약함, 인터셉트 = 패스 짝만, 버티기 = 크로스 ×holdVsCross · 중거리 ×holdVsMidrange
  assert.match(match.getAttackActions(eq, "home", data).find((a) => a.action === "cross").hint, /vs 버티기에 약함/);
  const dh = Object.fromEntries(match.getDefenseActions(eq, "away", data).map((a) => [a.action, a.hint]));
  assert.ok(dh.hold.includes(`크로스 ×${M.holdVsCross}`) && dh.hold.includes(`중거리 슛 ×${M.holdVsMidrange}`), dh.hold);
  assert.ok(dh.intercept.includes("패스 짝") && !dh.intercept.includes("크로스"), dh.intercept);
  // 간파한 상대 AI(매의 눈)는 우리 크로스를 버티기로 읽는다 (짝 ×readMult)
  const rd = mk({ FW1: { trait: "crosser" } }, { DF1: { skillIds: ["sk_eagle_eye"], stats: { defense: 500 } } });
  rd.away.tension = 100;
  place(rd, { line: 2, carrier: "h_FW1" });
  assert.equal(rd.duel.defenderId, "a_DF1");
  assert.equal(rd.duel.gaanpaSide, "away");
  near(odds(rd, "cross", "hold").pairMult, 2.0, "간파 짝 ×2.0");
  const { ev } = forced(rd, { action: "cross" }, false);
  assert.deepEqual({ d: ev.defAction, r: ev.readBy, p: ev.pair }, { d: "hold", r: "away", p: "read" });
});

/** 박스 연결 테스트용 홈 편성: FW1 크로서, 컷백 후보 MF1(슈팅 최고), 센터링 후보 MF2(피지컬 최고) */
const BOX_H = {
  FW1: { trait: "crosser" },
  FW2: { stats: { shoot: 400, physical: 400 } },
  MF1: { stats: { shoot: 600, physical: 300 } },
  MF2: { stats: { shoot: 300, physical: 600 } },
};

test("박스 연결 (④): 컷백 패스·센터링(크로서만) · 후보 = FW + MF 1명(컷백 슈팅 최고 / 센터링 피지컬 최고) · 기본 = 마무리 값 최고 · receiverId · 포제션당 1회", () => {
  const ms = mk(BOX_H);
  place(ms, { line: 3, carrier: "h_FW1" });
  const acts = Object.fromEntries(match.getAttackActions(ms, "home", data).map((a) => [a.action, a]));
  assert.deepEqual(Object.fromEntries(Object.entries(acts).map(([k, a]) => [k, a.enabled])), { dribble: false, pass: true, cross: true, shoot: true });
  assert.equal(acts.pass.label, "컷백 패스");
  assert.equal(acts.cross.label, "센터링");
  assert.match(acts.pass.hint, /원터치 슛 · GK와 경합/);
  assert.match(acts.cross.hint, /헤더 · GK와 경합/);
  const v = match.getMatchView(ms, data);
  assert.equal(v.needsDecision, "attack");
  assert.deepEqual(v.receivers.pass.candidates, ["h_MF1", "h_FW2"], "FW + 슈팅 최고 MF (carrier 제외, 슬롯 순서)");
  assert.deepEqual(v.receivers.cross.candidates, ["h_MF2", "h_FW2"], "FW + 피지컬 최고 MF");
  for (const a of ["pass", "cross"]) {
    assert.equal(v.receivers[a].arrival, 3);
    assert.equal(v.receivers[a].zone, 5);
    assert.equal(v.receivers[a].boxLink, true);
  }
  assert.equal(v.receivers.pass.defaultId, "h_MF1", "원터치 슛 값 600 > 400");
  assert.equal(v.receivers.cross.defaultId, "h_MF2", "헤더 값 (300+600)/2 = 450 > 400");
  assert.deepEqual({ id: v.receiverPreview.id, step: v.receiverPreview.step }, { id: "h_MF1", step: 3 });
  assert.deepEqual(Object.keys(v.outcomes).sort(), ["cross", "pass", "shoot"]);
  assert.ok(v.outcomesByReceiver.pass.h_FW2 && v.outcomesByReceiver.cross.h_MF2);
  assert.equal(v.ballState.boxLinkUsed, false);
  assert.equal(v.boxLink.available, true);
  // 타깃맨이면 헤더 +25% → FW2 (400 × 1.25 = 500 > 450)
  const tm = mk({ ...BOX_H, FW2: { trait: "targetman", stats: { shoot: 400, physical: 400 } } });
  place(tm, { line: 3, carrier: "h_FW1" });
  assert.equal(match.defaultReceiverId(tm, data, "home", "cross"), "h_FW2");
  // 크로서가 아니면 센터링 불가 · 컷백 후보 = 다른 FW + 슈팅 최고 MF
  const nc = mk(BOX_H);
  place(nc, { line: 3, carrier: "h_FW2" });
  const nca = Object.fromEntries(match.getAttackActions(nc, "home", data).map((a) => [a.action, a]));
  assert.equal(nca.cross.enabled, false);
  assert.equal(nca.cross.hint, "크로서 특성 선수만");
  assert.deepEqual(match.getMatchView(nc, data).receivers.pass.candidates, ["h_MF1", "h_FW1"]);
  // MF carrier: 다른 MF 중 슈팅 최고 + FW 전원
  const mc = mk(BOX_H);
  place(mc, { line: 3, carrier: "h_MF1" });
  assert.deepEqual(match.getMatchView(mc, data).receivers.pass.candidates, ["h_MF2", "h_FW1", "h_FW2"]);
  // 받는 선수 직접 고르기 · 후보가 아니면 throw
  assert.equal(forced(ms, { action: "pass", receiverId: "h_FW2" }, true).ev.receiverId, "h_FW2");
  assert.equal(forced(ms, { action: "cross", receiverId: "h_FW2" }, true).ev.receiverId, "h_FW2");
  assert.throws(() => match.step(clone(ms), data, { action: "pass", receiverId: "h_DF1" }), /받을 수 없는 선수/);
  assert.throws(() => match.step(clone(ms), data, { action: "cross", receiverId: "h_MF1" }), /받을 수 없는 선수/);
  // 포제션당 1회: 연결 뒤에는 슛만
  const { ms: after } = forced(ms, { action: "pass" }, true);
  assert.equal(after.ball.boxLinkUsed, true);
  const aa = Object.fromEntries(match.getAttackActions(after, "home", data).map((a) => [a.action, a]));
  assert.deepEqual({ d: aa.dribble.enabled, p: aa.pass.enabled, c: aa.cross.enabled, s: aa.shoot.enabled }, { d: false, p: false, c: false, s: true });
  assert.equal(aa.pass.hint, "박스 연결은 포제션당 1회");
  assert.throws(() => match.step(clone(after), data, { action: "pass" }), /사용할 수 없는 액션/);
  const av = match.getMatchView(after, data);
  assert.deepEqual(Object.keys(av.outcomes), ["shoot"]);
  assert.deepEqual(av.receivers, {});
  assert.equal(av.receiverPreview, null);
  assert.equal(av.ballState.boxLinkUsed, true);
  assert.deepEqual({ used: av.boxLink.used, available: av.boxLink.available, auto: av.boxLink.auto.action }, { used: true, available: false, auto: "shoot" });
  // 다음 포제션엔 다시 (새 공)
  const next = forced(after, { action: "shoot" }, false).ms;
  assert.equal(next.attackingSide, "away");
  assert.equal(next.ball.boxLinkUsed, false);
  // 박스 밖(line 2)의 패스는 그대로 (같은 라인 FW 만, 도착 박스)
  const l2 = mk(BOX_H);
  place(l2, { line: 2, carrier: "h_FW1" });
  assert.deepEqual(match.getMatchView(l2, data).receivers.pass.candidates, ["h_FW2"]);
  assert.equal(match.getMatchView(l2, data).boxLink, null);
});

test("박스 연결 판정 = GK 와의 듀얼: 공격 = 패스(컷백) / (패스+드리블)/2 × 크로서(센터링) × 계수, 수비 = GK 세이브 값 × boxLink.gkMult (짝·원터치 배율 없음)", () => {
  const ms = mk({ FW1: { trait: "crosser", stats: { pass: 500, dribble: 300 } } }, { GK: { stats: { defense: 600 } } });
  place(ms, { line: 3, carrier: "h_FW1", ball: { oneTouch: true } });
  const c = odds(ms, "pass", "save");
  assert.equal(c.boxLink, true);
  assert.equal(c.isGK, true);
  assert.equal(c.pair, "none");
  near(c.att, 500 * M.actionCoef.pass, "컷백 = 패스 × 계수");
  near(c.def, 600 * M.actionCoef.save * M.boxLink.gkMult, "GK 세이브 값 × gkMult (원터치 ×0.85 없음)");
  near(c.p, Math.min(M.maxP, Math.max(M.minP, c.att / (c.att + c.def))), "p = att / (att + def)");
  assert.ok(!c.links.includes("oneTouch"), "연결 자체는 원터치 아님");
  const x = odds(ms, "cross", "save");
  near(x.att, 400 * M.actionCoef.cross * (1 + 0.1), "센터링 = (패스+드리블)/2 × 계수 × (1 + 크로서)");
  near(x.def, c.def, "센터링도 GK 세이브 값");
  near(odds(ms, "shoot", "save").def, 600 * M.oneTouchGk, "슛은 원터치 ×0.85 그대로");
  // gkMult 튜닝
  const d2 = clone(data);
  d2.config.match.boxLink = { ...M.boxLink, gkMult: 1.5 };
  near(match.computeOdds(ms, d2, { action: "pass", defAction: "save" }).def, 600 * 1.5, "gkMult 1.5");
  near(match.computeOdds(ms, d2, { action: "shoot", defAction: "save" }).def, 600 * M.oneTouchGk, "gkMult 는 슛에 무관");
  // 필살 세이브(GK 가 이번 듀얼에 쓴 것)는 연결에도 적용 · 연결에는 팀워크 패스 보너스
  const save = data.skills.find((s) => s.id === "sk_boss_save").ultimate;
  near(odds(ms, "pass", "save", { fxD: { ...skills.emptyDuelEffects(), ult: { skillId: "sk_boss_save", ...save } } }).def, 600 * M.boxLink.gkMult * save.saveMult, "필살 세이브 ×2");
  const tw = clone(ms);
  tw.home.teamwork = 100;
  near(odds(tw, "pass", "save").att / c.att, 1 + M.teamworkPassBonusPer100, "팀워크 패스 보너스");
  // 제쳐짐 등 다음 듀얼 보너스는 연결 판정에 붙고 소모된다
  const bt = clone(ms);
  bt.ball.pending = { beaten: true, interceptFail: false, nextBonus: 0 };
  near(odds(bt, "pass", "save").bonus.parts.beaten, M.beatenBonus, "제쳐짐 보너스");
});

test("박스 연결 성공 → 받은 선수가 carrier (line 3 그대로 · 원터치 · 컷백 = 원터치 슛, 센터링 = 헤더) · 연계 +1 · 게이지 · 체력 · 이벤트", () => {
  const ms = mk({
    FW1: { trait: "crosser" },
    FW2: { trait: "targetman", skillIds: ["sk_meteor_shot"] },
    MF1: { trait: "finisher", stats: { shoot: 600 } },
  });
  place(ms, { line: 3, carrier: "h_FW1" });
  const g0 = ms.home.live.h_FW2.gauge;
  const t0 = ms.home.tension;
  const { ms: a, ev } = forced(ms, { action: "pass", receiverId: "h_MF1" }, true);
  assert.deepEqual(
    { type: ev.type, action: ev.action, defAction: ev.defAction, boxLink: ev.boxLink, via: ev.via, receiverId: ev.receiverId, step: ev.step, toStep: ev.toStep, zone: ev.zone, toZone: ev.toZone, side: ev.toAttackingSide },
    { type: "duel", action: "pass", defAction: "save", boxLink: true, via: "pass", receiverId: "h_MF1", step: 3, toStep: 3, zone: 5, toZone: 5, side: "home" },
  );
  assert.equal(ev.oneTouch, undefined, "연결 이벤트 자체는 원터치 아님");
  assert.match(ev.text, /컷백 패스 성공/);
  assert.deepEqual(
    { line: a.ball.lineIndex, carrier: a.ball.carrierId, oneTouch: a.ball.oneTouch, via: a.ball.receivedVia, fresh: a.ball.receivedFresh, passer: a.ball.lastPasserId, chain: a.ball.chain, used: a.ball.boxLinkUsed },
    { line: 3, carrier: "h_MF1", oneTouch: true, via: "pass", fresh: true, passer: "h_FW1", chain: 1, used: true },
  );
  assert.equal(a.attackingSide, "home");
  assert.equal(a.duel.defenderId, "a_GK");
  assert.equal(a.stats.home.shots, 0, "연결은 슛이 아니다");
  assert.equal(a.stats.home.duelsWon, 1, "연결 성공 = 듀얼 승");
  assert.equal(a.home.tension, Math.min(M.tension.max, t0 + M.tension.duelWin));
  near(M.staminaMax - a.home.live.h_FW1.stamina, M.staminaCost.pass * (1 - 400 / 2000), "컷백 체력 = 패스 비용");
  // 다음 듀얼: 받은 선수의 원터치 슛 (피니셔 +15%, 연계 +10%, GK ×0.85)
  const s = odds(a, "shoot", "save");
  assert.equal(s.header, false);
  assert.ok(s.links.includes("oneTouch"));
  near(s.bonus.parts.finisher, 0.15, "피니셔");
  near(s.bonus.parts.chain, M.passChainBonus, "연계 1");
  const base = clone(a);
  base.ball.oneTouch = false;
  near(s.def / odds(base, "shoot", "save").def, M.oneTouchGk, "원터치 GK ×0.85");
  // 센터링 → 헤더 (타깃맨 +25%), 받은 선수 게이지 +onReceive
  const { ms: h, ev: hev } = forced(ms, { action: "cross", receiverId: "h_FW2" }, true);
  assert.equal(hev.via, "cross");
  assert.match(hev.text, /센터링 성공/);
  assert.equal(h.ball.receivedVia, "cross");
  assert.equal(h.home.live.h_FW2.gauge, Math.min(M.ultimate.gaugeMax, g0 + M.ultimate.onReceive));
  const hs = odds(h, "shoot", "save");
  assert.equal(hs.header, true);
  near(hs.bonus.parts.targetman, 0.25, "타깃맨");
  assert.equal(match.getMatchView(h, data).actions.find((x) => x.action === "shoot").label, "헤더");
  // 헤더 슛 이벤트
  const { ev: shot } = forced(h, { action: "shoot" }, true);
  assert.deepEqual({ t: shot.type, p: shot.playerId, h: shot.header, o: shot.oneTouch }, { t: "goal", p: "h_FW2", h: true, o: true });
});

test("박스 연결 실패 = GK 가 잡음 (세이브와 같음): 이벤트 save · 상대 GK 배급 대기(from boxLink) · 텐션 save · 슛 아님", () => {
  for (const trait of [null, "distributor"]) {
    const ms = mk({ FW1: { trait: "crosser" } }, { GK: { trait } });
    place(ms, { line: 3, carrier: "h_FW1" });
    const t0 = ms.away.tension;
    for (const action of ["pass", "cross"]) {
      const { ms: after, ev } = forced(ms, { action }, false);
      assert.deepEqual(
        { type: ev.type, action: ev.action, boxLink: ev.boxLink, counterStart: ev.counterStart, toStep: ev.toStep, toSide: ev.toAttackingSide, nd: ev.nextDistribution },
        { type: "save", action, boxLink: true, counterStart: 0, toStep: 0, toSide: "away", nd: true },
        `${action} GK ${trait}`,
      );
      assert.ok(ev.receiverId, "끊긴 연결의 받으려던 선수");
      assert.match(ev.text, /끊어냄/);
      assert.equal(after.phase, "distribution");
      assert.deepEqual({ s: after.distribution.side, g: after.distribution.gkId, f: after.distribution.from }, { s: "away", g: "a_GK", f: "boxLink" });
      assert.equal(after.attackingSide, "away");
      assert.equal(after.ball.carrierId, "a_GK");
      assert.equal(after.away.tension, Math.min(M.tension.max, t0 + M.tension.save));
      assert.equal(after.stats.home.shots, 0);
      assert.equal(after.stats.away.duelsWon, 1);
      assert.equal(after.ball.boxLinkUsed, false, "새 포제션");
    }
  }
});

test("박스 연결 + 필살 패스: ④ 에서 바람의 실 → 받은 메테오 보유자 합체기 (바람의 유성) · ×1.5 · 받은 선수 +50% · 연결 뒤엔 필살 패스 불가", () => {
  const wt = data.skills.find((s) => s.id === "sk_wind_thread").ultimate;
  const ms = mk({ MF1: { skillIds: ["sk_wind_thread"] }, FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 400 } }, FW2: { stats: { shoot: 600 } } });
  ms.home.live.h_MF1.gauge = 100;
  place(ms, { line: 3, carrier: "h_MF1" });
  const v = match.getMatchView(ms, data);
  const opt = v.ultimateOptions.find((u) => u.type === "pass");
  assert.ok(opt && opt.usable, "④ 필살 패스 사용 가능");
  assert.deepEqual(Object.keys(opt.expectedPct), ["pass"]);
  assert.equal(v.receivers.pass.defaultId, "h_FW2", "보통 = 원터치 슛 값 최고");
  assert.equal(v.receivers.pass.ultimateDefaultId, "h_FW1", "필살 패스면 합체기 가치");
  assert.equal(v.receiverPreviewBySkill.sk_wind_thread.id, "h_FW1");
  assert.equal(v.outcomesBySkill.sk_wind_thread.pass.success.receiver.id, "h_FW1");
  const fxU = { ...skills.emptyDuelEffects(), ult: { skillId: "sk_wind_thread", ...wt } };
  near(odds(ms, "pass", "save", { fxA: fxU }).att / odds(ms, "pass", "save").att, wt.attack, "연결 ×1.5");
  assert.throws(() => match.step(clone(ms), data, { action: "shoot", ultimate: true }), /패스·크로스와 함께만/);
  const { ms: a, fresh, ev } = forced(ms, { action: "pass", ultimate: true }, true);
  assert.ok(fresh.some((e) => e.type === "cutin" && e.ultimateType === "pass"));
  assert.deepEqual({ r: ev.receiverId, b: ev.boxLink, u: ev.ultimate }, { r: "h_FW1", b: true, u: "sk_wind_thread" });
  assert.equal(a.ball.comboReadyId, "h_FW1");
  near(a.ball.pending.nextBonus, wt.nextDuelBonus, "받은 선수 슛 +50%");
  assert.equal(a.home.live.h_FW1.gauge, M.ultimate.gaugeStart + wt.receiverGauge);
  // 합체기 슛 (박스 안): 바람의 유성
  const av = match.getMatchView(a, data);
  assert.equal(av.ultimateOptions[0].comboName, "바람의 유성");
  const n0 = a.events.length;
  match.step(a, data, { action: "shoot", ultimate: true });
  const evs = a.events.slice(n0);
  const combo = evs.find((e) => e.type === "combo");
  assert.ok(combo, "합체기 이벤트");
  assert.equal(combo.name, "바람의 유성");
  assert.deepEqual(combo.playerIds, ["h_MF1", "h_FW1"]);
  const shot = evs.find((e) => RESOLVE.includes(e.type));
  assert.ok(shot.links.some((l) => l.id === "combo") && shot.links.some((l) => l.id === "oneTouch"));
  assert.equal(a.stats.home.combos, 1);
  // 연결을 이미 했으면 필살 패스 불가
  const used = clone(ms);
  used.ball.boxLinkUsed = true;
  const chk = match.ultimateUsable(used, data, "home", used.home.players.find((p) => p.id === "h_MF1"), "attack", null);
  assert.deepEqual({ ok: chk.ok, reason: chk.reason }, { ok: false, reason: "박스 연결은 포제션당 1회" });
});

test("박스 연결 자동 규칙 (2026-09-29 기대 골): 연결 성공 × 받은 선수 다음 슛 골 > 지금 슛 골일 때만 연결 (동률 = 슛) · 미리보기와 같은 확률 · 사람 자동 · 상대 AI 같은 규칙", () => {
  // carrier FW1 (드리블로 도착 — 원터치 아님), 받는 후보 MF1 (컷백 기본값 = 슈팅 최고 MF), FW2 는 약하게
  const setup = (fwShoot, mfShoot, side = "home", extra = {}) => {
    const over = { FW1: { stats: { shoot: fwShoot } }, FW2: { stats: { shoot: 100 } }, MF1: { stats: { shoot: mfShoot } }, ...extra };
    const s = side === "home" ? mk(over) : mk({}, over);
    const p = side === "home" ? "h" : "a";
    place(s, { atk: side, line: 3, carrier: `${p}_FW1` });
    return s;
  };
  // 1) 확률 = 판정과 같은 함수: 슛 = 지금 골 확률, 연결 = 연결 성공 × 받은 선수 원터치 슛 골 (실제 다음 상태의 판정 확률)
  const s = setup(400, 900);
  const ev = match.boxLinkEval(s, data, "home");
  assert.equal(ev.rule, "ev");
  near(ev.shoot.exp, odds(s, "shoot", "save").p, "슛 = 지금 골 확률");
  const pLink = odds(s, "pass", "save").p;
  const { ms: after, ev: linkEv } = forced(s, { action: "pass" }, true);
  assert.equal(linkEv.receiverId, ev.pass.receiverId);
  const pNext = odds(after, "shoot", "save").p;
  near(ev.pass.linkP, pLink, "연결 성공 확률 (GK × gkMult 0.6)");
  near(ev.pass.finishP, pNext, "받은 선수 다음 슛 (원터치 ×0.85)");
  near(ev.pass.exp, pLink * pNext, "기대 골 = 연결 × 다음 슛");
  near(ev.pass.value, ev.pass.exp * 100, "성향값 = 기대 골 %");
  near(match.tendencyValues(s, data, "home").pass, ev.pass.value, "tendencyValues ④ = 기대 골 %");
  // 2) 연결이 더 크면 연결, 슛이 더 크면 슛 — 자동 · AI · 뷰 · 추천이 모두 같다
  const hi = setup(200, 900);
  const he = match.boxLinkEval(hi, data, "home");
  assert.ok(he.pass.exp > he.shoot.exp, `연결 ${he.pass.exp} > 슛 ${he.shoot.exp}`);
  assert.deepEqual(he.auto, { action: "pass", receiverId: "h_MF1", ultimate: false });
  assert.equal(match.autoAction(hi, data, "home"), "pass");
  const d = ai.decideAttack(hi, data, "home");
  assert.deepEqual({ a: d.action, r: d.receiverId, u: d.ultimate }, { a: "pass", r: "h_MF1", u: false });
  near(d.values.pass, he.pass.value, "AI 성향값 = 기대 골 %");
  const hv = match.getMatchView(hi, data);
  assert.deepEqual({ a: hv.expected.attack.action, r: hv.expected.attack.receiverId }, { a: "pass", r: "h_MF1" });
  assert.deepEqual(hv.boxLink.auto, { action: "pass", receiverId: "h_MF1", ultimate: false });
  assert.deepEqual({ rule: hv.boxLink.rule, ratio: hv.boxLink.ratio, v: hv.boxLink.pass.value, e: hv.boxLink.pass.exp }, { rule: "ev", ratio: null, v: Math.round(he.pass.value), e: Math.round(he.pass.exp * 1e6) / 1e6 });
  const rec = (v) => v.actions.find((a) => a.recommended).action;
  const argmax = (v) => v.actions.filter((a) => a.enabled).reduce((b, a) => (a.expected > b.expected + 1e-12 ? a : b)).action;
  assert.equal(rec(hv), "pass", "추천 = 자동");
  assert.equal(argmax(hv), "pass", "추천 = 기대 % 최고 (필살기 없음)");
  near(hv.actions.find((a) => a.action === "pass").expected, he.pass.exp, "카드 기대 % = 자동 규칙 기대 골");
  assert.equal(hv.actions.find((a) => a.action === "pass").autoExpectedPct, Math.round(he.pass.exp * 100));
  const lo = setup(900, 200);
  const le = match.boxLinkEval(lo, data, "home");
  assert.ok(le.pass.exp < le.shoot.exp);
  assert.equal(le.auto.action, "shoot");
  assert.equal(match.autoAction(lo, data, "home"), "shoot");
  assert.equal(ai.decideAttack(lo, data, "home").action, "shoot");
  const lv = match.getMatchView(lo, data);
  assert.equal(rec(lv), "shoot");
  assert.equal(argmax(lv), "shoot");
  // 3) 동률 = 슛 (tieAttack 이 연결을 앞에 둬도): 확률을 1 로 고정하면 연결 1 × 1 = 슛 1
  const dTie = clone(data);
  dTie.config.match.minP = 1;
  dTie.config.match.maxP = 1;
  const te = match.boxLinkEval(hi, dTie, "home");
  assert.equal(te.pass.exp, te.shoot.exp);
  assert.equal(te.auto.action, "shoot", "연결은 슛보다 커야 한다");
  // 4) 상대 선택을 읽지 않는다: GK 필살 세이브는 규칙 자동 → 커밋 전(예측) = 커밋 뒤(효과) 같은 기대 골
  const gs = mk({ GK: { skillIds: ["sk_boss_save"] } }, { FW1: { stats: { shoot: 400 } }, FW2: { stats: { shoot: 100 } }, MF1: { stats: { shoot: 700 } } });
  gs.home.live.h_GK.gauge = M.ultimate.gaugeMax;
  place(gs, { atk: "away", line: 3, carrier: "a_FW1" });
  assert.equal(gs.duel.homeChoice.ultimate, true, "사람 GK 도 세이브는 자동 — 필살 세이브 커밋");
  const post = match.boxLinkEval(gs, data, "away");
  const pre = clone(gs);
  pre.duel.homeChoice = null;
  pre.duel.effects.home = skills.emptyDuelEffects();
  pre.home.live.h_GK.gauge = M.ultimate.gaugeMax;
  const preEv = match.boxLinkEval(pre, data, "away");
  near(preEv.shoot.exp, post.shoot.exp, "슛: 커밋 전 예측 = 커밋 뒤");
  near(preEv.pass.exp, post.pass.exp, "연결: 커밋 전 예측 = 커밋 뒤 (다음 슛에는 필살 세이브 없음)");
  assert.equal(preEv.auto.action, post.auto.action);
  assert.equal(gs.duel.awayChoice.action, post.auto.action, "상대 AI 커밋 = 같은 규칙");
  // GK 스탯은 읽어도 된다 (결정적)
  const weakGk = clone(lo);
  for (const p of weakGk.away.players) p.stats.defense = 50;
  assert.equal(JSON.stringify(match.boxLinkEval(weakGk, data, "home")), JSON.stringify(match.boxLinkEval(weakGk, data, "home")), "결정적");
  // 5) 상대 AI (away 공격) · 사람 측 자동(결정 없이 step) = 같은 선택
  const aw = setup(200, 900, "away");
  assert.deepEqual({ a: aw.duel.awayChoice.action, r: aw.duel.awayChoice.receiverId }, { a: "pass", r: "a_MF1" });
  assert.equal(setup(900, 200, "away").duel.awayChoice.action, "shoot");
  const auto = forced(hi, null, true);
  assert.deepEqual({ a: auto.ev.action, b: auto.ev.boxLink, r: auto.ev.receiverId }, { a: "pass", b: true, r: "h_MF1" });
  assert.equal(forced(lo, null, true).ev.action, "shoot");
});

test("박스 연결 기대 골 규칙 + 필살기: 받은 뒤 준비되는 필살 슛 · 합체기 · 내 필살 슛이 기대 골에 들어가고 추천(= 자동)도 그 기준", () => {
  const U = M.ultimate;
  // a) 받는 선수의 필살 슛: 받으면 게이지가 가득 → 다음 슛 ×2 · GK ×0.7 → 기대 골이 오르고 연결로 뒤집힌다
  const base = { FW1: { stats: { shoot: 450 } }, FW2: { stats: { shoot: 100 } }, MF1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 300 } }, MF2: { stats: { shoot: 100 } } };
  const noG = mk(base);
  noG.home.live.h_MF1.gauge = 0;
  place(noG, { line: 3, carrier: "h_FW1" });
  const e0 = match.boxLinkEval(noG, data, "home");
  const rdy = mk(base);
  rdy.home.live.h_MF1.gauge = U.gaugeMax - U.onReceive;
  place(rdy, { line: 3, carrier: "h_FW1" });
  const e1 = match.boxLinkEval(rdy, data, "home");
  assert.equal(e1.pass.receiverUltimate, true);
  assert.ok(e1.pass.exp > e0.pass.exp * 1.1, `받은 뒤 필살 슛 ${e1.pass.exp} > ${e0.pass.exp}`);
  near(e1.pass.linkP, e0.pass.linkP, "연결 자체는 같다");
  const { ms: after } = forced(rdy, { action: "pass" }, true);
  assert.ok(match.ultimateReady(after, data, "home", "h_MF1"), "받은 뒤 필살 슛 준비");
  const meteor = data.skills.find((x) => x.id === "sk_meteor_shot");
  const fxU = { ...skills.emptyDuelEffects(), ult: { skillId: meteor.id, ...meteor.ultimate } };
  near(e1.pass.finishP, odds(after, "shoot", "save", { fxA: fxU }).p, "다음 슛 = 필살 슛 확률");
  assert.equal(e0.auto.action, "shoot");
  assert.equal(e1.auto.action, "pass", "필살 슛 준비로 연결이 기대 골 우위");
  const v1 = match.getMatchView(rdy, data);
  assert.equal(v1.actions.find((a) => a.recommended).action, "pass");
  // b) 합체기: carrier 의 필살 패스(바람의 실) → 받는 메테오 보유자 → 연결 ×1.5, 받은 선수 +50%, 합체기 슛 (×2 × 1.2)
  const cb = mk({ MF1: { skillIds: ["sk_wind_thread"], stats: { shoot: 600 } }, FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 300 } }, FW2: { stats: { shoot: 100 } } });
  cb.home.live.h_MF1.gauge = U.gaugeMax;
  cb.home.live.h_FW1.gauge = 0;
  place(cb, { line: 3, carrier: "h_MF1" });
  const ce = match.boxLinkEval(cb, data, "home");
  assert.deepEqual({ u: ce.pass.ultimate, c: ce.pass.combo, r: ce.pass.receiverId, f: ce.pass.forced }, { u: true, c: true, r: "h_FW1", f: false });
  const cv = match.getMatchView(cb, data);
  const ult = cv.ultimateOptions.find((u) => u.type === "pass");
  assert.equal(ult.expectedPct.pass, Math.round(ce.pass.exp * 100), "필살 패스 토글 기대 % = 자동 규칙 기대 골");
  assert.equal(cv.actions.find((a) => a.action === "pass").autoExpectedPct, ult.expectedPct.pass);
  const cd = ai.decideAttack(cb, data, "home");
  assert.equal(cd.action, ce.auto.action);
  if (cd.action === "pass") assert.deepEqual({ r: cd.receiverId, u: cd.ultimate }, { r: "h_FW1", u: true });
  // 추천 = 자동 = (필살기를 쓰는 액션은 필살 토글 기대 %) 최고
  const best = (v) => {
    const u = v.ultimateOptions.find((x) => x.usable);
    let b = null;
    for (const a of v.actions.filter((x) => x.enabled)) {
      const val = Math.max(a.expected, u && u.expectedPct && u.expectedPct[a.action] != null ? u.expectedPct[a.action] / 100 - 1e-9 : -1);
      if (!b || val > b.val) b = { a: a.action, val };
    }
    return b.a;
  };
  assert.equal(cv.actions.find((a) => a.recommended).action, ce.auto.action);
  assert.equal(best(cv), ce.auto.action, "추천-상당(필살 포함 기대 % 최고) = 자동");
  // c) 내 필살 슛(메테오) 준비 → 슛 기대 골에 필살 효과, 자동 = 필살 슛
  const ms3 = mk({ FW1: { skillIds: ["sk_meteor_shot"], stats: { shoot: 500 } }, FW2: { stats: { shoot: 100 } }, MF1: { stats: { shoot: 500 } } });
  ms3.home.live.h_FW1.gauge = U.gaugeMax;
  place(ms3, { line: 3, carrier: "h_FW1" });
  const e3 = match.boxLinkEval(ms3, data, "home");
  assert.equal(e3.shoot.ultimate, true);
  near(e3.shoot.exp, odds(ms3, "shoot", "save", { fxA: fxU }).p, "슛 = 필살 슛 골 확률");
  const v3 = match.getMatchView(ms3, data);
  const u3 = v3.ultimateOptions.find((u) => u.type === "shot");
  assert.equal(u3.expectedPct.shoot, Math.round(e3.shoot.exp * 100));
  assert.equal(e3.auto.action, "shoot");
  assert.deepEqual({ a: ai.decideAttack(ms3, data, "home").action, u: ai.decideAttack(ms3, data, "home").ultimate }, { a: "shoot", u: true });
  assert.equal(v3.actions.find((a) => a.recommended).action, "shoot");
  assert.equal(best(v3), "shoot");
});

test("박스 연결 뷰: 상대 AI 가 먼저 커밋한 필살 슛도 view.boxLink 에 그대로 (커밋 뒤 강제 연결로 잘못 보이지 않음) · 엔진 힌트 = GK 배급 기준", () => {
  const U = M.ultimate;
  const s = mk({}, { FW1: { skillIds: ["sk_boss_strike"], stats: { shoot: 400 } }, FW2: { skillIds: ["sk_meteor_shot"], stats: { shoot: 300 } } });
  s.away.live.a_FW1.gauge = U.gaugeMax;
  s.away.live.a_FW2.gauge = U.gaugeMax;
  place(s, { atk: "away", line: 3, carrier: "a_FW1" });
  const ch = s.duel.awayChoice;
  assert.deepEqual({ a: ch.action, u: ch.ultimate }, { a: "shoot", u: true }, "AI = 필살 슛 (받는 선수 필살기 준비여도 내 필살 슛이 있으면 강제 없음)");
  const v = match.getMatchView(s, data);
  assert.deepEqual(v.boxLink.auto, { action: "shoot", receiverId: null, ultimate: true });
  assert.equal(v.boxLink.shoot.ultimate, true, "커밋한 필살 슛 = 준비된 필살 슛");
  assert.equal(v.boxLink.shoot.value, Math.round(ch.values.shoot), "슛 값 = 커밋 때 값 (필살 포함)");
  assert.equal(v.boxLink.pass.forced, false);
  assert.equal(v.boxLink.pass.score, Math.round(ch.values.pass));
  assert.equal(match.boxLinkEval(s, data, "away").auto.action, "shoot");
  // 엔진 힌트의 "(막히면 …)" = 실패 줄과 같은 규칙: GK 가 잡으면 상대 GK 배급 (2026-09-29 — 빠른 배급 GK 도 같음)
  for (const trait of [null, "distributor"]) {
    const g = mk({ FW1: { stats: { shoot: 400 } } }, { GK: { trait } });
    place(g, { line: 3, carrier: "h_FW1" });
    const gv = match.getMatchView(g, data);
    const hp = gv.actions.find((a) => a.action === "pass");
    assert.ok(hp.hint.endsWith("(막히면 상대 GK 배급)"), hp.hint);
    assert.ok(!/골킥/.test(hp.hint), hp.hint);
    assert.equal(gv.outcomes.pass.fail.label, "GK가 끊어냄 → 상대 GK 배급");
  }
});

test("박스 연결 미리보기 = 실제: expectedPct = 연결 성공 × 받은 선수 원터치 슛·헤더 골 (득점 기대) · outcomes 구역·받는 선수 · outcomesByReceiver", () => {
  const ms = mk({ FW1: { trait: "crosser" }, FW2: { trait: "targetman" }, MF1: { trait: "finisher", stats: { shoot: 500 } } });
  place(ms, { line: 3, carrier: "h_FW1", ball: { chain: 1 } });
  const v = match.getMatchView(ms, data);
  for (const action of ["pass", "cross"]) {
    const a = v.actions.find((x) => x.action === action);
    const pLink = odds(ms, action, "save").p;
    const { ms: after, ev } = forced(ms, { action }, true);
    assert.equal(ev.receiverId, v.receivers[action].defaultId);
    assert.equal(ev.receiverId, v.outcomes[action].success.receiver.id);
    assert.equal(ev.toZone, v.outcomes[action].success.zone);
    assert.equal(ev.toAttackingSide, v.outcomes[action].success.attackingSide);
    assert.equal(v.outcomes[action].success.boxLink, true);
    const pShot = odds(after, "shoot", "save").p;
    near(a.expected, pLink * pShot, `${action} 득점 기대 = 연결 × 슛`);
    assert.equal(a.expectedPct, Math.round(pLink * pShot * 100));
    const { ev: fev } = forced(ms, { action }, false);
    assert.equal(fev.toZone, v.outcomes[action].fail.zone);
    assert.equal(fev.toAttackingSide, v.outcomes[action].fail.attackingSide);
    assert.equal(fev.toStep, v.outcomes[action].fail.step);
    for (const rid of v.receivers[action].candidates) {
      const o = v.outcomesByReceiver[action][rid];
      const { ms: ar, ev: rev } = forced(ms, { action, receiverId: rid }, true);
      assert.equal(rev.receiverId, rid);
      assert.equal(o.success.receiver.id, rid);
      assert.equal(o.expectedPct, Math.round(pLink * odds(ar, "shoot", "save").p * 100), `${action} → ${rid}`);
    }
  }
  near(v.actions.find((x) => x.action === "shoot").expected, odds(ms, "shoot", "save").p, "슛 = 지금 골 확률");
  const best = v.actions.filter((x) => x.enabled).reduce((b, x) => (x.expected > b.expected + 1e-12 ? x : b));
  assert.equal(v.actions.find((x) => x.recommended).action, best.action, "추천 = 득점 기대 최고");
  assert.equal(JSON.stringify(match.getMatchView(ms, data)), JSON.stringify(v), "뷰는 결정적");
});

test("④ 스킬: 라인 브레이커·꿰뚫어보기 = 박스에서는 효과 없음(비활성) · 스루 패스는 받은 선수 보너스만 (연결 1회) · 공격 boost(패스·크로스)는 박스 연결 판정에 붙고 AI 도 쓴다", () => {
  const ms = mk({ MF1: { skillIds: ["sk_line_breaker", "sk_through_pass", "sk_see_through", "sk_rally_cry"] } });
  place(ms, { line: 3, carrier: "h_MF1" });
  ms.home.tension = 100;
  const sk = Object.fromEntries(match.getMatchView(ms, data).skills.map((s) => [s.skillId, s]));
  assert.deepEqual({ e: sk.sk_line_breaker.enabled, r: sk.sk_line_breaker.reason }, { e: false, r: "박스에서는 효과 없음" });
  assert.deepEqual({ e: sk.sk_see_through.enabled, r: sk.sk_see_through.reason }, { e: false, r: "박스에서는 간파 불가" });
  // 스루 패스: 짝 무효는 GK 상대라 의미 없지만 받은 선수 다음 듀얼 +25% 는 원터치 슛·헤더에 붙는다 (필살 패스와 같은 규칙)
  assert.equal(sk.sk_through_pass.enabled, true, "스루 패스는 박스 연결에 쓸 수 있다");
  const { ms: tpAfter } = forced(ms, { action: "pass", skillId: "sk_through_pass" }, true);
  near(tpAfter.ball.pending.nextBonus, 0.25, "받은 선수 다음 듀얼(원터치 슛) +25%");
  const tpShot = odds(tpAfter, "shoot", "save");
  const tpNo = clone(tpAfter);
  tpNo.ball.pending.nextBonus = 0;
  assert.ok(tpShot.att > odds(tpNo, "shoot", "save").att * 1.2, "원터치 슛 공격값에 +25% (다른 가산과 합산)");
  const usedTp = clone(ms);
  usedTp.ball.boxLinkUsed = true;
  const sk2 = Object.fromEntries(match.getMatchView(usedTp, data).skills.map((s) => [s.skillId, s]));
  assert.deepEqual({ e: sk2.sk_through_pass.enabled, r: sk2.sk_through_pass.reason }, { e: false, r: "박스 연결은 포제션당 1회" });
  assert.equal(sk.sk_rally_cry.enabled, true, "함성은 박스에서도");
  assert.throws(() => match.step(clone(ms), data, { action: "pass", skillId: "sk_line_breaker" }), /박스에서는 효과 없음/);
  // 박스 밖에서는 그대로
  const l2 = mk({ MF1: { skillIds: ["sk_line_breaker"] } });
  place(l2, { line: 2, carrier: "h_MF1" });
  l2.home.tension = 100;
  assert.equal(match.getMatchView(l2, data).skills[0].enabled, true);
  // 합성 boost 스킬(패스·크로스 ×1.5)을 가진 상대 FW: ④ 에서 연결을 고르면 AI 가 함께 쓴다
  const d2 = clone(data);
  d2.skills.push({
    id: "sk_test_link_boost", name: "테스트 연결", kind: "active", learnable: false, cost: 0, tension: 30, positions: null, description: "",
    passive: null, ultimate: null,
    active: { effect: "boost", params: { attack: 1.5, actions: ["pass", "cross"] }, phase: "attack", ai: { useWhen: "attackDuel", minTension: 30 } },
  });
  const bs = match.createMatch({
    data: d2, seed: 1, possessions: 8, kind: "goal", home: team("h"),
    // 기대 골 규칙 (2026-09-29): 슈팅 약한 carrier(200) → 컷백(MF1 430)이 기대 골 우위 → 연결을 고르고 boost 를 함께 쓴다
    away: team("a", { FW1: { stats: { shoot: 200 }, skillIds: ["sk_test_link_boost"] }, FW2: { stats: { shoot: 100 } }, MF1: { stats: { shoot: 430 } } }),
  });
  bs.away.tension = 100;
  bs.attackingSide = "away";
  bs.ball = {
    carrierId: "a_FW1", lineIndex: 3, chain: 0, extraLine: false, oneTouch: false, receivedVia: null, lastPasserId: null,
    receivedFresh: false, comboReadyId: null, comboFrom: null, pending: { beaten: false, interceptFail: false, nextBonus: 0 },
  };
  bs.duel = null;
  bs.phase = "possessionEnd";
  match.step(bs, d2);
  assert.deepEqual({ a: bs.duel.awayChoice.action, s: bs.duel.awayChoice.skillId }, { a: "pass", s: "sk_test_link_boost" });
  const withB = match.computeOdds(bs, d2, { action: "pass", defAction: "save" });
  const noB = match.computeOdds(bs, d2, { action: "pass", defAction: "save", fxA: skills.emptyDuelEffects() });
  near(withB.att / noB.att, 1.5, "boost ×1.5 가 박스 연결에");
});

test("자동 경기의 박스 연결: 양 팀 발생 · 포제션당 1회 · 센터링은 크로서만 · 성공 뒤 같은 포제션 다음 판정 = 받은 선수의 원터치 슛/헤더 · 결정성", () => {
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "box" }), data);
  for (const p of home.players) for (const k of Object.keys(p.stats)) p.stats[k] = Math.round(p.stats[k] * 1.5);
  const seen = { home: 0, away: 0, cross: 0, ok: 0, fail: 0 };
  for (const o of data.opponents) {
    const away = run.buildOpponentSnapshot(o, data);
    for (let seed = 1; seed <= 5; seed++) {
      const mk2 = () => match.createMatch({ data, seed, home, away, possessions: 10, kind: "goal" });
      const ms = match.simulateAuto(mk2(), data);
      assert.equal(JSON.stringify(ms.events), JSON.stringify(match.simulateAuto(mk2(), data).events), "결정적");
      const perPoss = {};
      const evs = ms.events;
      for (let i = 0; i < evs.length; i++) {
        const e = evs[i];
        if (!e.boxLink) continue;
        seen[e.attackingSide]++;
        const key = `${e.possession}`;
        perPoss[key] = (perPoss[key] || 0) + 1;
        assert.equal(e.step, 3);
        assert.ok(e.action === "pass" || e.action === "cross");
        assert.ok(e.receiverId && e.receiverId !== e.playerId);
        const carrier = ms[e.side].players.find((p) => p.id === e.playerId);
        if (e.action === "cross") {
          seen.cross++;
          assert.equal(carrier.trait, "crosser", "센터링은 크로서만");
        }
        if (e.success) {
          seen.ok++;
          assert.equal(e.type, "duel");
          const next = evs.slice(i + 1).find((x) => RESOLVE.includes(x.type));
          assert.equal(next.possession, e.possession);
          assert.equal(next.action, "shoot");
          assert.equal(next.playerId, e.receiverId);
          assert.equal(next.oneTouch, true);
          assert.equal(!!next.header, e.action === "cross");
        } else {
          seen.fail++;
          assert.equal(e.type, "save");
        }
      }
      for (const n of Object.values(perPoss)) assert.equal(n, 1, "포제션당 1회");
    }
  }
  assert.ok(seen.home > 0 && seen.away > 0 && seen.cross > 0 && seen.ok > 0 && seen.fail > 0, JSON.stringify(seen));
});

/* ------------------------------------------------------------------ */
/* 에이스의 외침 (2026-09-29, 표시 전용 — view.aceCall)                    */
/* ------------------------------------------------------------------ */

test("에이스의 외침: 받으면 필살기 준비(게이지 ≥ gaugeMax − onReceive · aceCallGauge) · 합체기 우선 · 비트당 한 명(기본 받는 선수) · 박스 연결 · 크로스만 · 상대 · 없으면 null", () => {
  const U = M.ultimate;
  const thr = U.gaugeMax - U.onReceive;
  const pick = (c) => (c ? {
    side: c.side, playerId: c.playerId, reason: c.reason, actions: c.actions, arrival: c.arrival, boxLink: c.boxLink,
    ultimateSkillId: c.ultimateSkillId, comboName: c.comboName, threshold: c.threshold,
  } : null);
  // 1) 게이지 문턱: MF1 이 ① 에서 패스 → 도착 ② FW 후보. FW1 메테오 슛 게이지 thr − 1 이면 없음, thr 이면 외침
  const gauge = (g, d = data) => {
    const s = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
    s.home.live.h_FW1.gauge = g;
    place(s, { line: 1, carrier: "h_MF1" });
    return match.getMatchView(s, d).aceCall;
  };
  assert.equal(thr, 65, "기본 문턱 = gaugeMax − onReceive (받으면 가득)");
  assert.equal(gauge(thr - 1), null, "게이지가 모자라면 외침 없음");
  const c1 = gauge(thr);
  assert.deepEqual(pick(c1), {
    side: "home", playerId: "h_FW1", reason: "gauge", actions: ["pass"], arrival: 2, boxLink: false,
    ultimateSkillId: "sk_meteor_shot", comboName: null, threshold: thr,
  });
  assert.deepEqual({ n: c1.name, u: c1.ultimateName, t: c1.ultimateType, g: c1.gauge }, { n: "hFW1", u: "메테오 슛", t: "shot", g: thr });
  assert.ok(gauge(U.gaugeMax), "이미 준비된 선수도 외친다");
  // 문턱 설정: config.match.ultimate.aceCallGauge, 없으면 gaugeMax − onReceive 를 따라간다
  const dG = clone(data);
  dG.config.match.ultimate = { ...U, aceCallGauge: 40 };
  assert.equal(gauge(40, dG)?.threshold, 40, "aceCallGauge 40");
  assert.equal(gauge(39, dG), null);
  const dR = clone(data);
  dR.config.match.ultimate = { ...U, onReceive: 50 };
  assert.equal(gauge(U.gaugeMax - 50, dR)?.threshold, U.gaugeMax - 50, "onReceive 를 바꾸면 기본 문턱도");
  // 받은 뒤 쓸 수 있는 필살기만: ① 에서 받는 MF(도착 ①)의 필살 슛은 아직 못 쓴다, 필살 패스는 쓸 수 있다
  const early = (sid) => {
    const s = mk({ MF2: { skillIds: [sid] } });
    s.home.live.h_MF2.gauge = U.gaugeMax;
    place(s, { line: 0, carrier: "h_DF1" });
    return match.getMatchView(s, data).aceCall;
  };
  assert.equal(early("sk_meteor_shot"), null, "도착 ① 에서 필살 슛은 쓸 수 없다");
  assert.deepEqual(pick(early("sk_wind_thread")), {
    side: "home", playerId: "h_MF2", reason: "gauge", actions: ["pass"], arrival: 1, boxLink: false,
    ultimateSkillId: "sk_wind_thread", comboName: null, threshold: thr,
  });
  // 2) 합체기 > 게이지: carrier 바람의 실 준비 → FW1 메테오(게이지 30, 합체기 바람의 유성) vs FW2 업화의 일격(게이지 가득)
  const combo = (mfGauge) => {
    const s = mk({ MF1: { skillIds: ["sk_wind_thread"] }, FW1: { skillIds: ["sk_meteor_shot"] }, FW2: { skillIds: ["sk_boss_strike"], stats: { shoot: 700 } } });
    s.home.live.h_MF1.gauge = mfGauge;
    s.home.live.h_FW1.gauge = U.gaugeStart;
    s.home.live.h_FW2.gauge = U.gaugeMax;
    place(s, { line: 1, carrier: "h_MF1" });
    return s;
  };
  const cs = combo(U.gaugeMax);
  const cc = match.getMatchView(cs, data).aceCall;
  assert.deepEqual(pick(cc), {
    side: "home", playerId: "h_FW1", reason: "combo", actions: ["pass"], arrival: 2, boxLink: false,
    ultimateSkillId: "sk_meteor_shot", comboName: "바람의 유성", threshold: thr,
  });
  assert.equal(cc.passSkillId, "sk_wind_thread");
  assert.equal(pick(match.getMatchView(combo(U.gaugeMax - 1), data).aceCall).playerId, "h_FW2", "필살 패스가 준비 안 되면 게이지 외침");
  // expected = 공격 팀의 자동 결정(ai.decideAttack)이 외치는 선수에게 가는가
  const dd = ai.decideAttack(cs, data, "home");
  assert.equal(cc.expected, cc.actions.includes(dd.action) && dd.receiverId === cc.playerId);
  assert.equal(cc.expectedAction, cc.expected ? dd.action : null);
  // 3) 비트당 한 명: 둘 다 게이지 가득이면 그 액션의 기본 받는 선수 (도착 ③ 성향값 1위가 높은 FW2 — 드리블), 같으면 players 순서
  const two = mk({ FW1: { skillIds: ["sk_meteor_shot"] }, FW2: { skillIds: ["sk_meteor_shot"], stats: { dribble: 650 } } });
  two.home.live.h_FW1.gauge = U.gaugeMax;
  two.home.live.h_FW2.gauge = U.gaugeMax;
  place(two, { line: 1, carrier: "h_MF1" });
  const tv = match.getMatchView(two, data);
  assert.equal(tv.receivers.pass.defaultId, "h_FW2");
  assert.equal(tv.aceCall.playerId, "h_FW2", "기본 받는 선수가 외친다");
  const tie = mk({ FW1: { skillIds: ["sk_meteor_shot"] }, FW2: { skillIds: ["sk_meteor_shot"] } });
  tie.home.live.h_FW1.gauge = U.gaugeMax;
  tie.home.live.h_FW2.gauge = U.gaugeMax;
  place(tie, { line: 1, carrier: "h_MF1" });
  assert.equal(match.getMatchView(tie, data).aceCall.playerId, "h_FW1", "동률 = players 순서 (기본값과 같음)");
  // 4) ④ 박스 연결 후보: 크로서 FW1 → MF1(슈팅 · 피지컬 최고 MF — 컷백 · 센터링 둘 다 후보) 메테오 게이지 thr
  const box = (sid, ball = {}) => {
    const s = mk({ FW1: { trait: "crosser" }, MF1: { skillIds: [sid], stats: { shoot: 500, physical: 500 } } });
    s.home.live.h_MF1.gauge = thr;
    place(s, { line: 3, carrier: "h_FW1", ball });
    return match.getMatchView(s, data).aceCall;
  };
  assert.deepEqual(pick(box("sk_meteor_shot")), {
    side: "home", playerId: "h_MF1", reason: "gauge", actions: ["pass", "cross"], arrival: 3, boxLink: true,
    ultimateSkillId: "sk_meteor_shot", comboName: null, threshold: thr,
  });
  assert.equal(box("sk_wind_thread"), null, "박스 연결로 받으면 필살 패스는 못 쓴다 (연결은 포제션당 1회)");
  assert.equal(box("sk_meteor_shot", { boxLinkUsed: true }), null, "연결을 이미 했으면 받을 길이 없다");
  // 5) 크로스로만 닿는 선수: ③ 크로서 FW1 — 패스 후보 = FW2(도착 ④), 크로스 후보 = FW2 + 피지컬 최고 MF1
  const cr = mk({ FW1: { trait: "crosser" }, MF1: { skillIds: ["sk_meteor_shot"], stats: { physical: 600 } } });
  cr.home.live.h_MF1.gauge = thr;
  place(cr, { line: 2, carrier: "h_FW1" });
  assert.deepEqual(pick(match.getMatchView(cr, data).aceCall), {
    side: "home", playerId: "h_MF1", reason: "gauge", actions: ["cross"], arrival: 3, boxLink: false,
    ultimateSkillId: "sk_meteor_shot", comboName: null, threshold: thr,
  });
  // 6) 상대 공격: 상대 받는 선수의 외침도 사람(home) 뷰에 (수비하며 공이 갈 곳이 보인다). 상대 AI 는 사람보다 먼저 커밋하므로
  //    커밋한 액션 · 받는 선수가 조건에 맞을 때만 외친다 (expected 늘 true) — 드리블 · 다른 선수에게 보내면 null
  const opp = (aOver) => {
    const s = mk({}, { FW1: { skillIds: ["sk_boss_strike"] }, ...aOver });
    s.away.live.a_FW1.gauge = U.gaugeMax;
    return place(s, { atk: "away", line: 1, carrier: "a_MF1" });
  };
  const op = opp({ MF1: { stats: { pass: 700 } } });
  assert.deepEqual({ a: op.duel.awayChoice.action, r: op.duel.awayChoice.receiverId }, { a: "pass", r: "a_FW1" }, "상대 AI 가 FW1 에게 패스를 커밋");
  const oc = match.getMatchView(op, data).aceCall;
  assert.deepEqual({ s: oc.side, p: oc.playerId, r: oc.reason, u: oc.ultimateName, a: oc.actions, e: oc.expected, ea: oc.expectedAction },
    { s: "away", p: "a_FW1", r: "gauge", u: "업화의 일격", a: ["pass"], e: true, ea: "pass" });
  assert.deepEqual(match.getMatchView(op, data, "away").aceCall, oc, "보는 쪽과 무관");
  const opDr = opp({});
  assert.equal(opDr.duel.awayChoice.action, "dribble");
  assert.equal(match.getMatchView(opDr, data).aceCall, null, "상대가 드리블을 커밋하면 외침 없음");
  const opFw2 = opp({ MF1: { stats: { pass: 700 } }, FW2: { stats: { dribble: 650 } } });
  assert.deepEqual({ a: opFw2.duel.awayChoice.action, r: opFw2.duel.awayChoice.receiverId }, { a: "pass", r: "a_FW2" });
  assert.equal(match.getMatchView(opFw2, data).aceCall, null, "상대가 다른 선수(FW2)에게 보내면 FW1 은 외치지 않는다");
  // 같은 배치의 우리 공격(아직 결정 전): 우선순위대로 FW1 이 외치고, 자동은 FW2 로 가므로 expected = false
  const us = mk({ MF1: { stats: { pass: 700 } }, FW1: { skillIds: ["sk_meteor_shot"] }, FW2: { stats: { dribble: 650 } } });
  us.home.live.h_FW1.gauge = U.gaugeMax;
  place(us, { line: 1, carrier: "h_MF1" });
  const uc = match.getMatchView(us, data).aceCall;
  assert.deepEqual({ p: uc.playerId, e: uc.expected, ea: uc.expectedAction }, { p: "h_FW1", e: false, ea: null }, "사람 측은 결정 전이라 우선순위 그대로");
  assert.equal(ai.decideAttack(us, data, "home").receiverId, "h_FW2");
  // 7) 없으면 null: 필살기 보유자 없음 · 결정 대기가 아님 · 경기 끝
  const none = mk();
  place(none, { line: 1, carrier: "h_MF1" });
  assert.equal(match.getMatchView(none, data).aceCall, null);
  assert.equal(match.aceCallFor(none, data), null);
  const fin = clone(cs);
  fin.finished = true;
  assert.equal(match.aceCallFor(fin, data), null);
  const res = clone(cs);
  res.phase = "resolved";
  assert.equal(match.aceCallFor(res, data), null);
  assert.deepEqual(match.aceCallFor(cs, data), cc, "view.aceCall = aceCallFor");
});

test("에이스의 외침은 표시 전용: 뷰는 상태·난수를 바꾸지 않고, 매 스텝 뷰를 만들어도 자동 경기 결과가 같다 (결정성)", () => {
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "ace" }), data);
  let calls = 0;
  for (const o of data.opponents.slice(0, 3)) {
    const away = run.buildOpponentSnapshot(o, data);
    for (let seed = 1; seed <= 3; seed++) {
      const mk2 = () => match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
      const plain = match.simulateAuto(mk2(), data);
      const viewed = mk2();
      let guard = 0;
      while (!viewed.finished && guard++ < 5000) {
        const before = JSON.stringify(viewed);
        const v = match.getMatchView(viewed, data, "home");
        match.getMatchView(viewed, data, "away");
        assert.equal(JSON.stringify(viewed), before, "뷰는 상태를 바꾸지 않는다");
        if (v.aceCall) {
          calls++;
          assert.ok(["gauge", "combo"].includes(v.aceCall.reason));
          assert.equal(v.aceCall.side, v.attackingSide);
          const cand = new Set(v.aceCall.actions.flatMap((a) => v.receivers[a]?.candidates || []));
          assert.ok(cand.has(v.aceCall.playerId), "외치는 선수 = 그 액션의 받는 선수 후보");
          if (v.aceCall.side === "away") {
            const ch = viewed.duel.awayChoice;
            assert.ok(v.aceCall.expected && ch.receiverId === v.aceCall.playerId, "먼저 커밋한 상대의 외침 = 실제로 보낼 선수");
          }
        }
        match.step(viewed, data, null);
      }
      assert.equal(JSON.stringify(viewed), JSON.stringify(plain), `seed ${seed} vs ${o.id}: 결과 같음`);
    }
  }
  assert.ok(calls > 0, "자동 경기에서 외침이 나온다");
});

/* ------------------------------------------------------------------ */
/* 15. GK 배급 · 결정타 칩 · 마지막 공격 · 역방향 컷인 (2026-09-29 사용자 결정 3~7) */
/* ------------------------------------------------------------------ */

/** 상대(away) ④ 슛을 우리 GK 가 막은 직후 = 우리 GK 배급 대기 */
function saved(homeOver = {}, awayOver = {}, opts = {}) {
  const ms = mk(homeOver, awayOver, opts);
  place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
  const { ms: after, ev } = forced(ms, null, false);
  assert.equal(ev.type, "save");
  assert.equal(after.phase, "distribution");
  return after;
}

/** 배급 step 을 결과(success)가 나올 때까지 주사위를 바꿔 가며 — { ms, ev(배급 비트), fresh, rng0 } */
function forcedDist(ms, decision, success) {
  for (let s = 1; s < 800; s++) {
    const c = clone(ms);
    c.rngState = createRng(`dist${s}`).getState();
    const rng0 = c.rngState;
    const n0 = c.events.length;
    match.step(c, data, decision);
    const fresh = c.events.slice(n0);
    const ev = fresh.find((e) => e.distribution === true);
    if (ev && ev.success === success) return { ms: c, ev, fresh, rng0 };
  }
  throw new Error(`배급 결과(${success})를 찾지 못함`);
}

test("GK 배급 대기: 세이브 뒤 phase distribution · needsDecision · view.distribution 두 선택지 (짧은 패스 100% / 롱패스 확률 · 성공 중원 · 실패 상대 중원)", () => {
  const d0 = saved({ GK: { stats: { pass: 300, physical: 500 } } }, { MF1: { stats: { defense: 600, physical: 400 } } });
  assert.equal(match.humanNeedsDecision(d0, "home"), "distribution");
  assert.equal(match.humanNeedsDecision(d0, "away"), null);
  const v = match.getMatchView(d0, data);
  assert.equal(v.needsDecision, "distribution");
  assert.equal(v.phase, "distribution");
  assert.deepEqual({ a: v.actions, s: v.skills, o: v.outcomes, e: v.expected, d: v.defender, l: v.lineLabel }, { a: [], s: [], o: null, e: null, d: null, l: "우리 GK 배급" });
  assert.equal(v.carrier.id, "h_GK", "공은 GK 품");
  const D = v.distribution;
  assert.deepEqual({ side: D.side, gk: D.gkId, from: D.from, nd: D.needsDecision, order: D.order, tac: D.tactic, min: D.autoMin, z: D.gkZone },
    { side: "home", gk: "h_GK", from: "save", nd: true, order: ["short", "long"], tac: "auto", min: M.longPassAutoMin, z: 1 });
  const lp = match.longPassOdds(d0, data, "home");
  assert.deepEqual({ c: D.contest.id, p: D.options.long.p, pct: D.options.long.pct }, { c: "a_MF1", p: Math.round(lp.p * 1e6) / 1e6, pct: Math.round(lp.p * 100) });
  assert.deepEqual(
    { p: D.options.short.p, pct: D.options.short.pct, t: D.options.short.text, z: D.options.short.success.zone, st: D.options.short.success.step, who: D.options.short.success.starterId, f: D.options.short.fail },
    { p: 1, pct: 100, t: "짧은 패스 100% — 빌드업부터", z: 2, st: 0, who: "h_DF1", f: null },
  );
  assert.equal(D.options.long.text, `롱패스 ${Math.round(lp.p * 100)}% — 성공 중원부터 / 실패 상대 중원 공격`);
  assert.deepEqual({ z: D.options.long.success.zone, a: D.options.long.success.attackingSide, s: D.options.long.success.step, who: D.options.long.success.starterId },
    { z: 3, a: "home", s: 1, who: "h_MF1" });
  assert.deepEqual({ z: D.options.long.fail.zone, a: D.options.long.fail.attackingSide, s: D.options.long.fail.step, c: D.options.long.fail.contestId, sh: D.options.long.fail.short },
    { z: 3, a: "away", s: 1, c: "a_MF1", sh: "실패 상대 중원 공격" });
  assert.equal(D.recommended, lp.p >= M.longPassAutoMin ? "long" : "short");
  assert.equal(D.options[D.recommended].recommended, true);
  assert.deepEqual(D.skills, [], "캐논 킥 없음");
  // 뷰는 순수 · 결정적
  const snap = JSON.stringify(d0);
  assert.equal(JSON.stringify(match.getMatchView(d0, data)), JSON.stringify(v));
  assert.equal(JSON.stringify(d0), snap);
  // 상대 배급이면 우리 결정 없음, 문구는 우리 시점
  const ms = mk();
  place(ms, { atk: "home", line: 3, carrier: "h_FW1" });
  const { ms: ad } = forced(ms, { action: "shoot" }, false);
  assert.equal(ad.phase, "distribution");
  const av = match.getMatchView(ad, data);
  assert.equal(av.needsDecision, null);
  assert.deepEqual({ s: av.distribution.side, nd: av.distribution.needsDecision, l: av.lineLabel }, { s: "away", nd: false, l: "상대 GK 배급" });
  assert.match(av.distribution.options.long.text, /^상대 롱패스 \d+% — 성공 상대 중원부터 \/ 실패 우리 중원 공격$/);
});

test("GK 배급 짧은 패스: 항상 성공 · 주사위 없음 · 빌드업(line 0) pickStarter · 배급 비트 위치 필드 · 포제션 그대로", () => {
  const d0 = saved();
  const s = clone(d0);
  const r0 = s.rngState;
  const n0 = s.events.length;
  match.step(s, data, { action: "short" });
  assert.equal(s.rngState, r0, "짧은 패스는 주사위를 쓰지 않는다");
  const fresh = s.events.slice(n0);
  assert.deepEqual(fresh.map((e) => e.type), ["distribution"], "배급 비트 하나 (역습 이벤트 없음)");
  const ev = fresh[0];
  assert.deepEqual(
    { a: ev.action, ok: ev.success, p: ev.p, pl: ev.playerId, r: ev.receiverId, side: ev.side, d: ev.distribution, gz: ev.gkZone, from: ev.from, ai: ev.byAI },
    { a: "short", ok: true, p: 1, pl: "h_GK", r: "h_DF1", side: "home", d: true, gz: 1, from: "save", ai: false },
  );
  assert.deepEqual({ as: ev.attackingSide, st: ev.step, z: ev.zone, tas: ev.toAttackingSide, ts: ev.toStep, tz: ev.toZone }, { as: "home", st: 0, z: 2, tas: "home", ts: 0, tz: 2 });
  assert.ok(match.BEAT_TYPES.includes("distribution"));
  assert.deepEqual(match.getMatchView(s, data).lastBeat, ev, "lastBeat = 배급 비트");
  assert.deepEqual({ ph: s.phase, a: s.attackingSide, l: s.ball.lineIndex, c: s.ball.carrierId, poss: s.possession, dist: s.distribution },
    { ph: "decision", a: "home", l: 0, c: "h_DF1", poss: d0.possession, dist: null });
  assert.equal(s.home.tension, d0.home.tension, "짧은 패스는 텐션 변화 없음");
  assert.equal(s.home.live.h_GK.stamina, d0.home.live.h_GK.stamina, "체력 변화 없음");
  // 다음 비트(듀얼)의 zone = 배급 비트 toZone
  match.step(s, data, null);
  const next = s.events.find((e, i) => i > ev.seq && match.BEAT_TYPES.includes(e.type));
  assert.equal(next.zone, ev.toZone);
  // 잘못된 결정
  assert.throws(() => match.step(clone(d0), data, { action: "dribble" }), /short \| long/);
});

test("GK 롱패스 확률 = GK (패스+피지컬)/2 × longPass 계수 × (1 + 빠른 배급) × 캐논 킥 vs 상대 최고 MF (수비+피지컬)/2 · clamp", () => {
  const H = { GK: { stats: { pass: 300, physical: 500 } } };
  const A = { MF1: { stats: { defense: 600, physical: 400 } }, MF2: { stats: { defense: 400, physical: 400 } } };
  const d0 = saved(H, A);
  const lp = match.longPassOdds(d0, data, "home");
  near(lp.att, 400 * M.actionCoef.longPass, "GK (300+500)/2 × 2.2");
  near(lp.def, 500, "상대 최고 MF (600+400)/2");
  assert.equal(lp.contest.id, "a_MF1");
  near(lp.p, lp.att / (lp.att + lp.def), "p");
  assert.equal(M.actionCoef.longPass, 2.2);
  const dd = saved({ GK: { ...H.GK, trait: "distributor" } }, A);
  near(match.longPassOdds(dd, data, "home").att, 400 * M.actionCoef.longPass * 1.25, "빠른 배급 +25%");
  const ck = data.skills.find((x) => x.id === "sk_cannon_kick");
  near(match.longPassOdds(dd, data, "home", { skill: ck }).att, 400 * M.actionCoef.longPass * 1.25 * 1.5, "캐논 킥 ×1.5");
  const big = saved({ GK: { stats: { pass: 999, physical: 999 } } }, { MF1: { stats: { defense: 10, physical: 10 } }, MF2: { stats: { defense: 10, physical: 10 } } });
  assert.equal(match.longPassOdds(big, data, "home").p, M.maxP, "상한");
  // 결정타 칩 factors 곱 = 판정값
  const ex = match.longPassOdds(dd, data, "home", { skill: ck, explain: true });
  const prod = (side) => ex.factors.filter((f) => f.side === side).reduce((a, f) => a * f.mult, 1);
  near(prod("atk"), ex.att, "공격 곱");
  near(prod("def"), ex.def, "수비 곱");
  assert.deepEqual(ex.factors.map((f) => f.id), ["base", "distributor", "skill", "base"]);
  assert.equal(ex.factors.find((f) => f.id === "distributor").text, "빠른 배급 +25%");
  assert.equal(ex.factors.find((f) => f.id === "skill").text, "캐논 킥 ×1.5");
});

test("GK 롱패스 성공 · 실패: 주사위 한 번 · 성공 = 중원(line 1) MF 시작 + 텐션 · 실패 = turnover(distribution) → 상대 중원 역습 · 포제션 +1 · 체력", () => {
  const d0 = saved({ GK: { stats: { pass: 300, physical: 500 } } });
  // 성공
  const ok = forcedDist(d0, { action: "long" }, true);
  const r = createRngFromState(ok.rng0);
  r.next();
  assert.equal(ok.ms.rngState, r.getState(), "롱패스 = 주사위 한 번");
  assert.deepEqual(ok.fresh.map((e) => e.type), ["distribution"]);
  const ev = ok.ev;
  assert.deepEqual({ t: ev.type, a: ev.action, r: ev.receiverId, d: ev.defenderId, ts: ev.toStep, tz: ev.toZone, tas: ev.toAttackingSide },
    { t: "distribution", a: "long", r: "h_MF1", d: "a_MF1", ts: 1, tz: 3, tas: "home" });
  near(ev.p, match.longPassOdds(d0, data, "home").p, "이벤트 p");
  assert.ok(Array.isArray(ev.factors) && typeof ev.upset === "boolean", "결정타 칩");
  assert.deepEqual({ ph: ok.ms.phase, a: ok.ms.attackingSide, l: ok.ms.ball.lineIndex, c: ok.ms.ball.carrierId, poss: ok.ms.possession },
    { ph: "decision", a: "home", l: 1, c: "h_MF1", poss: d0.possession });
  assert.equal(ok.ms.home.tension, Math.min(M.tension.max, d0.home.tension + M.tension.duelWin), "성공 텐션 +duelWin");
  near(d0.home.live.h_GK.stamina - ok.ms.home.live.h_GK.stamina, M.staminaCost.pass * (1 - 500 / 2000), "GK 체력 −pass");
  near(d0.away.live.a_MF1.stamina - ok.ms.away.live.a_MF1.stamina, M.staminaCost.defend * (1 - 400 / 2000), "경합 MF 체력 −defend");
  // 실패
  const ng = forcedDist(d0, { action: "long" }, false);
  assert.deepEqual(ng.fresh.map((e) => e.type), ["turnover", "counter"], "turnover(롱패스 차단) → 상대 역습");
  const fe = ng.ev;
  assert.deepEqual(
    { t: fe.type, a: fe.action, da: fe.defAction, d: fe.distribution, pl: fe.playerId, df: fe.defenderId, cs: fe.counterStart, as: fe.attackingSide, st: fe.step, tas: fe.toAttackingSide, ts: fe.toStep, tz: fe.toZone },
    { t: "turnover", a: "long", da: "intercept", d: true, pl: "h_GK", df: "a_MF1", cs: 1, as: "home", st: 0, tas: "away", ts: 1, tz: 3 },
  );
  assert.match(fe.text, /롱패스 차단/);
  assert.deepEqual({ a: ng.ms.attackingSide, l: ng.ms.ball.lineIndex, poss: ng.ms.possession }, { a: "away", l: 1, poss: d0.possession + 1 });
  assert.equal(ng.ms.away.tension, Math.min(M.tension.max, d0.away.tension + M.tension.steal), "가로챈 팀 텐션 +steal");
  const counter = ng.fresh[1];
  assert.deepEqual({ s: counter.side, z: counter.zone }, { s: "away", z: fe.toZone });
});

test("캐논 킥 (GK 학습 액티브): 롱패스 ×1.5 · 성공하면 첫 듀얼 +10% · 텐션 25 · 롱패스와 함께만 · 듀얼에서는 못 씀 · 뷰 skills", () => {
  const ck = data.skills.find((x) => x.id === "sk_cannon_kick");
  assert.deepEqual({ k: ck.kind, e: ck.active.effect, ph: ck.active.phase, t: ck.tension, p: ck.positions, l: ck.learnable }, { k: "active", e: "longPassBoost", ph: "distribution", t: 25, p: ["GK"], l: true });
  assert.ok(skills.isDistributionSkill(ck));
  const d0 = saved({ GK: { skillIds: ["sk_cannon_kick"] } });
  d0.home.tension = 50;
  const v = match.getMatchView(d0, data);
  const sv = v.distribution.skills[0];
  const withSk = match.longPassOdds(d0, data, "home", { skill: ck });
  assert.deepEqual({ id: sv.skillId, en: sv.enabled, c: sv.cost, pct: sv.pct, nb: sv.nextDuelBonus }, { id: "sk_cannon_kick", en: true, c: 25, pct: Math.round(withSk.p * 100), nb: 0.1 });
  assert.throws(() => match.step(clone(d0), data, { action: "short", skillId: "sk_cannon_kick" }), /롱패스와 함께만/);
  const poor = clone(d0);
  poor.home.tension = 10;
  assert.throws(() => match.step(poor, data, { action: "long", skillId: "sk_cannon_kick" }), /텐션 부족/);
  assert.equal(match.getMatchView(poor, data).distribution.skills[0].reason, "텐션 부족");
  const ok = forcedDist(d0, { action: "long", skillId: "sk_cannon_kick" }, true);
  const skEv = ok.fresh.find((e) => e.type === "skill");
  assert.deepEqual({ id: skEv.skillId, e: skEv.effect, c: skEv.cost, pl: skEv.playerId }, { id: "sk_cannon_kick", e: "longPassBoost", c: 25, pl: "h_GK" });
  assert.deepEqual({ s: ok.ev.skillId, nb: ok.ev.nextBonus }, { s: "sk_cannon_kick", nb: 0.1 });
  near(ok.ev.p, withSk.p, "×1.5 확률");
  near(ok.ms.ball.pending.nextBonus, 0.1, "첫 듀얼 +10%");
  near(odds(ok.ms, "dribble", "hold").bonus.parts.next, 0.1, "공격 보너스에 붙는다");
  assert.equal(ok.ms.home.tension, Math.min(M.tension.max, 50 - 25 + M.tension.duelWin));
  assert.equal(ok.ms.stats.home.skillsUsed, d0.stats.home.skillsUsed + 1);
  // 듀얼(세이브)에서는 쓸 수 없다
  const ms = mk({ GK: { skillIds: ["sk_cannon_kick"] } });
  place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
  const chk = skills.checkSkillUsable(ms, data, "home", "h_GK", ck, "defense");
  assert.deepEqual(chk, { ok: false, reason: "GK 롱패스 배급에서만" });
  assert.equal(ai.chooseSkill(ms, data, "home", ms.home.players.find((p) => p.id === "h_GK"), "defense", "save"), null);
});

test("배급 전술 (A안 자동): short · long 고정, auto = 롱패스 확률 ≥ longPassAutoMin 이면 길게 · 캐논 킥은 텐션 규칙 · 사람 자동 = 상대 AI 같은 규칙 · 결정적", () => {
  const d0 = saved({ GK: { stats: { pass: 300, physical: 500 } } });
  const p = match.longPassOdds(d0, data, "home").p;
  const withMin = (min) => { const d2 = clone(data); d2.config.match.longPassAutoMin = min; return d2; };
  assert.equal(ai.decideDistribution(d0, withMin(p), "home").action, "long", "p ≥ min → 길게 (같으면 길게)");
  assert.equal(ai.decideDistribution(d0, withMin(p + 0.01), "home").action, "short", "p < min → 짧게");
  const tac = (t) => { const c = clone(d0); c.home.tactics.distribution = t; return c; };
  assert.equal(ai.decideDistribution(tac("short"), withMin(0), "home").action, "short");
  assert.equal(ai.decideDistribution(tac("long"), withMin(0.99), "home").action, "long");
  assert.equal(ai.decideDistribution(tac("nope"), withMin(0), "home").tactic, "auto");
  // 결정적 · 상태 불변
  const snap = JSON.stringify(d0);
  assert.deepEqual(ai.decideDistribution(d0, data, "home"), ai.decideDistribution(d0, data, "home"));
  assert.equal(JSON.stringify(d0), snap);
  // 사람 측 자동(결정 없이 step) = decideDistribution
  for (const min of [p, p + 0.01]) {
    const d2 = withMin(min);
    const want = ai.decideDistribution(d0, d2, "home").action;
    const c = clone(d0);
    const n0 = c.events.length;
    match.step(c, d2, null);
    const ev = c.events.slice(n0).find((e) => e.distribution);
    assert.deepEqual({ a: ev.action, ai: ev.byAI }, { a: want, ai: true });
  }
  // 캐논 킥 자동: immediate + 텐션 → 사용, clutch(동점·열세 & 남은 포제션 ≤ 3 아님) → 안 씀, 짧게면 안 씀
  const ck0 = saved({ GK: { skillIds: ["sk_cannon_kick"], stats: { pass: 300, physical: 500 } } });
  ck0.home.tension = 60;
  const im = clone(ck0);
  im.home.tactics.tension = "immediate";
  const di = ai.decideDistribution(im, withMin(0), "home");
  assert.deepEqual({ a: di.action, s: di.skillId }, { a: "long", s: "sk_cannon_kick" });
  near(di.p, di.pSkill, "p = 캐논 킥 확률");
  const cl = clone(ck0);
  cl.home.tactics.tension = "clutch";
  cl.possession = 1;
  assert.equal(ai.decideDistribution(cl, withMin(0), "home").skillId, null, "clutch: 아직 아님");
  const sh = clone(im);
  sh.home.tactics.distribution = "short";
  assert.equal(ai.decideDistribution(sh, data, "home").skillId, null);
  // auto: 캐논 킥이 있으면 그 확률로도 판단 (기본 < min ≤ 캐논)
  const pk = di.pSkill;
  const mid = (di.pLong + pk) / 2;
  assert.ok(di.pLong < mid && mid < pk);
  assert.deepEqual({ a: ai.decideDistribution(im, withMin(mid), "home").action, s: ai.decideDistribution(im, withMin(mid), "home").skillId }, { a: "long", s: "sk_cannon_kick" });
  // 상대 AI GK 도 같은 함수 (away 배급은 사람 결정 없이 step)
  const ms = mk({}, { GK: { stats: { pass: 300, physical: 500 } } });
  place(ms, { atk: "home", line: 3, carrier: "h_FW1" });
  const { ms: ad } = forced(ms, { action: "shoot" }, false);
  const want = ai.decideDistribution(ad, data, "away").action;
  const n0 = ad.events.length;
  match.step(ad, data, { action: want === "long" ? "short" : "long" }); // 사람 결정은 상대 배급에 쓰이지 않는다
  assert.equal(ad.events.slice(n0).find((e) => e.distribution).action, want);
});

test("배급 없음: 경기를 끝내는 세이브(마지막 포제션) · 승부차기 — 끝난 경기의 마지막 비트 = 세이브", () => {
  const ms = mk({}, {}, { possessions: 4, kind: "friendly" });
  ms.possession = ms.possessionsTotal;
  ms.score = { home: 1, away: 0 };
  place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
  const { ms: after, ev, fresh } = forced(ms, null, false);
  assert.equal(after.finished, true);
  assert.equal(ev.nextDistribution, undefined);
  assert.ok(!fresh.some((e) => e.distribution || e.type === "lastAttack"), "리드하는 팀 GK 의 세이브로 끝 — 배급 · 추가 포제션 없음");
  const v = match.getMatchView(after, data);
  assert.deepEqual({ lb: v.lastBeat.type, d: v.distribution }, { lb: "save", d: null });
  // 승부차기 중에는 배급이 없다
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "pen-dist" }), data);
  const away = clone(home);
  away.players.forEach((p) => { p.id = "q_" + p.id; });
  let pens = 0;
  for (let seed = 1; seed <= 150 && pens < 2; seed++) {
    const m2 = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 6, kind: "goal" }), data);
    if (!m2.penalties) continue;
    pens++;
    const i = m2.events.findIndex((e) => e.type === "penalties");
    assert.ok(!m2.events.slice(i).some((e) => e.distribution), "승부차기 뒤 배급 없음");
  }
  assert.ok(pens > 0, "승부차기 경기");
});

test("결정타 칩: factors 곱 → att/def → clamp = 이벤트 p (모든 판정 · 롱패스), decisive = 승자 쪽 최대 요인, upset = 승자 확률 < upsetP, 판정·난수 불변", () => {
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "chips" }), data);
  let n = 0;
  let upsets = 0;
  let decisive = 0;
  let statFallback = 0;
  const ids = new Set();
  for (const o of data.opponents) {
    const away = run.buildOpponentSnapshot(o, data);
    for (let seed = 1; seed <= 8; seed++) {
      const ms = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" }), data);
      for (const e of ms.events) {
        if (!Array.isArray(e.factors)) continue;
        n++;
        const prod = (side) => e.factors.filter((f) => f.side === side).reduce((a, f) => a * f.mult, 1);
        const A = prod("atk");
        const D = prod("def");
        assert.equal(e.factors.filter((f) => f.base).length, 2, "기본 공격 · 수비 각 1");
        for (const f of e.factors) if (!f.base) assert.notEqual(f.mult, 1, `${f.id} ×1 은 빠진다`);
        const p = Math.min(M.maxP, Math.max(M.minP, A / (A + D)));
        near(p, e.p, `${e.type} ${e.action}: factors → p`);
        const winnerP = e.success ? e.p : 1 - e.p;
        assert.equal(e.upset, winnerP < M.upsetP, "upset");
        if (e.upset) upsets++;
        if (e.decisive) {
          decisive++;
          ids.add(e.decisive.id);
          assert.equal(e.decisive.favours, e.success ? "atk" : "def");
          assert.ok(e.decisive.effect > 0 && typeof e.decisive.text === "string" && !/undefined|NaN/.test(e.decisive.text), e.decisive.text);
          if (e.decisive.base) statFallback++;
        }
      }
    }
  }
  assert.ok(n > 500 && upsets > 10 && decisive > n * 0.5, `판정 ${n} · 대이변 ${upsets} · 결정타 ${decisive} (${[...ids].join(",")}) · 능력치 대체 ${statFallback}`);
  // explain 은 확률을 바꾸지 않는다
  const ms = mk({ FW1: { trait: "crosser" } }, { DF1: { trait: "wall" } });
  place(ms, { line: 2, carrier: "h_FW1", ball: { pending: { beaten: true, interceptFail: false, nextBonus: 0.2 }, chain: 2 } });
  for (const [a, d] of [["dribble", "tackle"], ["pass", "intercept"], ["cross", "hold"], ["shoot", "hold"], ["dribble", "hold"]]) {
    const x = odds(ms, a, d);
    const y = odds(ms, a, d, { explain: true });
    assert.deepEqual({ att: x.att, def: x.def, p: x.p }, { att: y.att, def: y.def, p: y.p }, `${a} vs ${d}`);
    assert.equal(x.factors, null);
    const prod = (side) => y.factors.filter((f) => f.side === side).reduce((acc, f) => acc * f.mult, 1);
    near(prod("atk"), y.att, `${a} atk`);
    near(prod("def"), y.def, `${a} def`);
  }
});

test("결정타 칩 예: 짝 적중 ×1.7 (수비 승) · 제쳐짐 +25% (공격 승) · 대이변 (승자 확률 < 30%) · 필살 ×2", () => {
  // 모두 같은 스탯 · 같은 스타일: 드리블 400 × 2.2 = 880 vs 태클 400 × 태클 계수 × 1.7 × 커버 1.1 (L51 계수 0.6 → 448.8)
  const ms = mk();
  place(ms, { line: 0, carrier: "h_DF1" });
  ms.duel.awayChoice = { ...ms.duel.awayChoice, action: "tackle" };
  const { ev } = forced(ms, { action: "dribble" }, false);
  assert.deepEqual({ id: ev.decisive.id, t: ev.decisive.text, f: ev.decisive.favours, s: ev.decisive.side }, { id: "pair", t: "짝 적중 ×1.7", f: "def", s: "def" });
  assert.equal(ev.upset, false);
  // 제쳐짐 +25% 로 이긴 공격
  const b = mk();
  place(b, { line: 1, carrier: "h_MF1", ball: { pending: { beaten: true, interceptFail: false, nextBonus: 0 } } });
  b.duel.awayChoice = { ...b.duel.awayChoice, action: "hold" };
  const { ev: bev } = forced(b, { action: "dribble" }, true);
  assert.deepEqual({ id: bev.decisive.id, t: bev.decisive.text, f: bev.decisive.favours }, { id: "beaten", t: "제쳐짐 +25%", f: "atk" });
  // 대이변: 약한 드리블이 짝 맞은 태클을 뚫음 (p < upsetP). 드리블 스탯은 계수에 묶지 않고 찾는다 — 100 에서 10씩 내려
  //  처음으로 p < upsetP − 2%p 가 되는 값 (L51 태클 계수 0.6 → 60: 132 vs 448.8, p ≈ 0.23)
  let u = null;
  for (let drb = 100; drb >= 10 && !u; drb -= 10) {
    const c = mk({ DF1: { stats: { dribble: drb } } });
    place(c, { line: 0, carrier: "h_DF1" });
    c.duel.awayChoice = { ...c.duel.awayChoice, action: "tackle" };
    if (odds(c, "dribble", "tackle").p < M.upsetP - 0.02) u = c;
  }
  assert.ok(u, "대이변 시나리오 (드리블 10 ~ 100)");
  const { ev: uev } = forced(u, { action: "dribble" }, true);
  assert.ok(uev.p < M.upsetP, `p ${uev.p}`);
  assert.equal(uev.upset, true);
  assert.equal(uev.decisive, null, "승자 쪽 요인도 능력치 우위도 없다");
  // 필살 슛 ×2 (GK 상대)
  const m2 = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  m2.home.live.h_FW1.gauge = M.ultimate.gaugeMax;
  place(m2, { line: 3, carrier: "h_FW1" });
  const { ev: gev } = forced(m2, { action: "shoot", ultimate: true }, true);
  assert.deepEqual({ id: gev.decisive.id, t: gev.decisive.text }, { id: "ultimate", t: "필살 ×2" });
  assert.equal(gev.factors.find((f) => f.id === "ultShotGk").text, "필살 슛 GK ×0.7");
});

test("마지막 공격 보장: 정확히 1골 뒤진 팀이 마지막 포제션을 갖지 않았으면 +1 포제션 (단계당 1회) · 그 포제션이 끝나면 종료 · 친선 동점 = 무승부 · 목표 경기 동점 = 연장", () => {
  const lastTurnover = (score, kind = "friendly", deficitCfg = null) => {
    const d2 = deficitCfg == null ? data : (() => { const x = clone(data); x.config.match.lastAttackDeficit = deficitCfg; return x; })();
    const ms = match.createMatch({ data: d2, seed: 1, home: team("h"), away: team("a"), possessions: 4, kind });
    ms.possession = ms.possessionsTotal;
    ms.score = { ...score };
    ms.attackingSide = "away";
    ms.ball = { carrierId: "a_DF1", lineIndex: 0, chain: 0, extraLine: false, oneTouch: false, receivedVia: null, lastPasserId: null, receivedFresh: false, comboReadyId: null, comboFrom: null, pending: { beaten: false, interceptFail: false, nextBonus: 0 } };
    ms.duel = null;
    ms.phase = "possessionEnd";
    match.step(ms, d2);
    ms.duel.awayChoice = { ...ms.duel.awayChoice, action: "dribble" };
    for (let s = 1; s < 800; s++) {
      const c = clone(ms);
      c.rngState = createRng(`la${s}`).getState();
      const n0 = c.events.length;
      match.step(c, d2, { action: "tackle" });
      const fresh = c.events.slice(n0);
      if (fresh.some((e) => e.type === "turnover")) return { ms: c, fresh, d2 };
    }
    throw new Error("턴오버를 찾지 못함");
  };
  // home 0 : 1 away — away 의 마지막 포제션이 턴오버로 끝남 → home(1골 차, 마지막 포제션 없음)에게 추가
  const { ms: g, fresh } = lastTurnover({ home: 0, away: 1 });
  const la = fresh.find((e) => e.type === "lastAttack");
  assert.ok(la, "lastAttack 이벤트");
  assert.deepEqual({ s: la.side, st: la.stage, b: la.banner, d: la.deficit }, { s: "home", st: "regular", b: "추가시간 — 마지막 공격!", d: 1 });
  assert.match(la.text, /^추가시간 — 마지막 공격!/);
  assert.deepEqual({ t: g.possessionsTotal, la: g.lastAttack, f: g.finished }, { t: 5, la: { side: "home", stage: "regular", possession: 5 }, f: false });
  const counter = fresh.find((e) => e.type === "counter");
  assert.equal(counter.lastAttack, true, "추가 포제션 시작 비트에 lastAttack");
  assert.ok(fresh.indexOf(la) < fresh.indexOf(counter));
  const v = match.getMatchView(g, data);
  assert.deepEqual(v.lastAttack, { side: "home", stage: "regular", possession: 5, active: true });
  assert.equal(v.possession, 5);
  // 그 포제션이 어떻게 끝나든 종료 — 턴오버 · 세이브(배급 없음) · 골(친선 = 무승부)
  const endBy = (pred, decision = null) => {
    for (let s = 1; s < 800; s++) {
      const c = clone(g);
      c.rngState = createRng(`end${s}`).getState();
      let guard = 0;
      while (!c.finished && guard++ < 40) {
        const need = match.humanNeedsDecision(c, "home");
        match.step(c, data, need === "attack" ? decision : null);
      }
      if (c.finished && pred(c)) return c;
    }
    return null;
  };
  const endTurnover = endBy((c) => c.events.at(-2).type === "turnover" && c.events.at(-2).side === "home");
  assert.ok(endTurnover && endTurnover.score.home === 0, "턴오버로 종료");
  assert.equal(endTurnover.events.filter((e) => e.type === "lastAttack").length, 1, "단계당 1회");
  const endSave = endBy((c) => c.events.at(-2).type === "save");
  assert.ok(endSave, "세이브로 종료");
  assert.ok(!endSave.events.slice(endSave.events.findIndex((e) => e.type === "lastAttack")).some((e) => e.distribution), "마지막 공격이 세이브로 끝나면 배급 없음");
  const endGoal = endBy((c) => c.events.at(-2).type === "goal");
  assert.ok(endGoal, "골로 종료");
  assert.deepEqual({ s: endGoal.score, w: endGoal.result.winner, st: endGoal.stage, la: endGoal.result.lastAttack.side }, { s: { home: 1, away: 1 }, w: "draw", st: "regular", la: "home" });
  // 목표 경기: 마지막 공격 골로 동점 → 연장 (그 연장에서도 1회 더 가능)
  const { ms: gg } = lastTurnover({ home: 0, away: 1 }, "goal");
  let tieGoal = null;
  for (let s = 1; s < 800 && !tieGoal; s++) {
    const c = clone(gg);
    c.rngState = createRng(`eg${s}`).getState();
    let guard = 0;
    while (c.stage === "regular" && !c.finished && guard++ < 40) match.step(c, data, null);
    if (c.stage === "extraTime") tieGoal = c;
  }
  assert.ok(tieGoal, "연장 돌입");
  assert.deepEqual({ s: tieGoal.score, used: tieGoal.lastAttackUsed }, { s: { home: 1, away: 1 }, used: { regular: true, extraTime: false } });
  // 주지 않는 경우: 2골 차 · 동점 · 이긴 팀 · lastAttackDeficit 0
  assert.ok(!lastTurnover({ home: 0, away: 2 }).fresh.some((e) => e.type === "lastAttack"), "2골 차");
  assert.ok(!lastTurnover({ home: 1, away: 0 }).fresh.some((e) => e.type === "lastAttack"), "이기는 팀 공격 차례 아님");
  assert.ok(!lastTurnover({ home: 0, away: 1 }, "friendly", 0).fresh.some((e) => e.type === "lastAttack"), "설정 0 = 끔");
  // 뒤진 팀이 마지막 포제션을 가졌으면 없음: home 1골 뒤, home 공격이 턴오버로 끝남 → 다음 = away
  const own = match.createMatch({ data, seed: 2, home: team("h"), away: team("a"), possessions: 4, kind: "friendly" });
  own.possession = own.possessionsTotal;
  own.score = { home: 0, away: 1 };
  place(own, { atk: "home", line: 0, carrier: "h_DF1" });
  own.duel.awayChoice = { ...own.duel.awayChoice, action: "tackle" };
  const { ms: ownEnd } = forced(own, { action: "dribble" }, false);
  assert.equal(ownEnd.finished, true);
  assert.equal(ownEnd.lastAttack, null);
});

test("마지막 공격 + GK 배급: 1골 뒤진 팀 GK 가 마지막 포제션 슛을 막으면 추가 포제션이 배급으로 시작", () => {
  const ms = mk({}, {}, { possessions: 4, kind: "friendly" });
  ms.possession = ms.possessionsTotal;
  ms.score = { home: 0, away: 1 };
  place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
  const { ms: after, fresh } = forced(ms, null, false);
  assert.deepEqual(fresh.map((e) => e.type).filter((t) => t !== "cutin" && t !== "skill"), ["save", "lastAttack"]);
  assert.equal(after.phase, "distribution");
  assert.equal(after.lastAttack.side, "home");
  const n0 = after.events.length;
  match.step(after, data, { action: "short" });
  const dev = after.events.slice(n0).find((e) => e.distribution);
  assert.equal(dev.lastAttack, true, "배급 비트에 lastAttack");
});

test("역방향 컷인 정보: 필살 슛 GK 세이브 = 기적의 세이브! · 수비 블록 = 철벽 블록! · 필살 패스 차단 = 필살 패스 차단! (성공 · 필살기 없음이면 없음)", () => {
  const U = M.ultimate;
  // ④ 필살 슛 → GK 세이브
  const a = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  a.home.live.h_FW1.gauge = U.gaugeMax;
  place(a, { line: 3, carrier: "h_FW1" });
  const { ev: sv } = forced(a, { action: "shoot", ultimate: true }, false);
  assert.deepEqual({ t: sv.type, k: sv.reverseCutin.kind, x: sv.reverseCutin.text, p: sv.reverseCutin.playerId, s: sv.reverseCutin.side, u: sv.reverseCutin.ultimateType, id: sv.reverseCutin.skillId },
    { t: "save", k: "save", x: "기적의 세이브!", p: "a_GK", s: "away", u: "shot", id: "sk_meteor_shot" });
  assert.equal(forced(a, { action: "shoot", ultimate: true }, true).ev.reverseCutin, undefined, "성공이면 없음");
  assert.equal(forced(a, { action: "shoot" }, false).ev.reverseCutin, undefined, "필살기 없으면 없음");
  // ③ 필살 슛(박스 슛 취급) → DF 블록
  const b = mk({ FW1: { skillIds: ["sk_meteor_shot"] } });
  b.home.live.h_FW1.gauge = U.gaugeMax;
  place(b, { line: 2, carrier: "h_FW1" });
  const { ev: bl } = forced(b, { action: "shoot", ultimate: true }, false);
  assert.deepEqual({ t: bl.type, k: bl.reverseCutin.kind, x: bl.reverseCutin.text, pos: bl.reverseCutin.position, p: bl.reverseCutin.playerId },
    { t: "turnover", k: "block", x: "철벽 블록!", pos: "DF", p: bl.defenderId });
  // 필살 패스 → 인터셉트 / ④ 박스 연결을 GK 가 잡음
  const c = mk({ MF1: { skillIds: ["sk_wind_thread"] } });
  c.home.live.h_MF1.gauge = U.gaugeMax;
  place(c, { line: 1, carrier: "h_MF1" });
  const { ev: pc } = forced(c, { action: "pass", ultimate: true }, false);
  assert.deepEqual({ t: pc.type, k: pc.reverseCutin.kind, x: pc.reverseCutin.text, u: pc.reverseCutin.ultimateType }, { t: "turnover", k: "passCut", x: "필살 패스 차단!", u: "pass" });
  const d = mk({ MF1: { skillIds: ["sk_wind_thread"] } });
  d.home.live.h_MF1.gauge = U.gaugeMax;
  place(d, { line: 3, carrier: "h_MF1" });
  const { ev: bc } = forced(d, { action: "pass", ultimate: true }, false);
  assert.deepEqual({ t: bc.type, b: bc.boxLink, k: bc.reverseCutin.kind, p: bc.reverseCutin.playerId }, { t: "save", b: true, k: "passCut", p: "a_GK" });
  assert.deepEqual(match.REVERSE_CUTIN_TEXT, { save: "기적의 세이브!", block: "철벽 블록!", passCut: "필살 패스 차단!" });
});

/* ------------------------------------------------------------------ */
/* 16. 결함 수정 (2026-09-30): 마지막 포제션 문구 · 결정타 칩 보완 · 배급 추천 · 저장 복원 · 연장 마지막 공격 */
/* ------------------------------------------------------------------ */

const dataWithMin = (min) => { const d2 = clone(data); d2.config.match.longPassAutoMin = min; return d2; };

test("GK 배급 대기 저장 · 복원 (JSON 왕복): 같은 결정 → 같은 이벤트 · 난수 상태 · view · 끝까지 같은 결과", () => {
  const d0 = saved({ GK: { skillIds: ["sk_cannon_kick"] } });
  d0.home.tension = 60;
  const back = JSON.parse(JSON.stringify(d0));
  // 저장은 JSON (undefined 값 필드는 빠진다) — JSON 기준으로 같다
  assert.equal(JSON.stringify(back), JSON.stringify(d0));
  assert.equal(JSON.stringify(match.getMatchView(back, data)), JSON.stringify(match.getMatchView(d0, data)), "복원한 상태의 view 도 같다");
  for (const decision of [{ action: "short" }, { action: "long" }, { action: "long", skillId: "sk_cannon_kick" }, null]) {
    const a = clone(d0);
    const b = JSON.parse(JSON.stringify(d0));
    match.step(a, data, decision);
    match.step(b, data, decision);
    assert.equal(JSON.stringify(b.events), JSON.stringify(a.events), `배급 step ${JSON.stringify(decision)}`);
    assert.equal(b.rngState, a.rngState);
    match.simulateAuto(a, data);
    match.simulateAuto(b, data);
    assert.deepEqual(b.result, a.result, "끝까지 같은 결과");
  }
});

test("마지막 공격 보장 — 연장: 연장 마지막 포제션이 끝났을 때 1골 뒤진 팀(마지막 포제션 없음)에게 +1 (연장에서 1회) · 그 포제션이 끝나면 종료 또는 승부차기 (matchEnd)", () => {
  const ms = match.createMatch({ data, seed: 3, home: team("h"), away: team("a"), possessions: 4, kind: "goal" });
  ms.stage = "extraTime";
  ms.possessionsTotal = 4 + M.extraTimePossessions;
  ms.possession = ms.possessionsTotal;
  ms.lastAttackUsed = { regular: true, extraTime: false };
  ms.score = { home: 1, away: 2 };
  place(ms, { atk: "away", line: 0, carrier: "a_DF1" });
  ms.duel.awayChoice = { ...ms.duel.awayChoice, action: "dribble" };
  assert.equal(match.endForecast(ms, data, "home"), "lastAttack", "막으면 우리 마지막 공격");
  assert.match(match.getMatchView(ms, data).outcomes.tackle.success.label, /\(추가시간 — 우리 마지막 공격\)$/);
  const { ms: g, fresh } = forced(ms, { action: "tackle" }, false);
  const la = fresh.find((e) => e.type === "lastAttack");
  assert.ok(la, "연장 lastAttack 이벤트");
  assert.deepEqual({ s: la.side, st: la.stage, d: la.deficit }, { s: "home", st: "extraTime", d: 1 });
  assert.deepEqual({ t: g.possessionsTotal, la: g.lastAttack, used: g.lastAttackUsed, f: g.finished },
    { t: ms.possessionsTotal + 1, la: { side: "home", stage: "extraTime", possession: ms.possessionsTotal + 1 }, used: { regular: true, extraTime: true }, f: false });
  assert.equal(match.getMatchView(g, data).lastAttack.active, true);
  // 그 포제션이 끝나면: 골(동점) → 승부차기, 아니면 종료 — 마지막 비트 matchEnd, 두 번째 추가 포제션 없음
  const ends = new Set();
  for (let s = 1; s < 400 && ends.size < 2; s++) {
    const c = clone(g);
    c.rngState = createRng(`etla${s}`).getState();
    let guard = 0;
    while (!c.finished && c.stage !== "penalties" && guard++ < 60) match.step(c, data, null);
    assert.ok(c.finished || c.stage === "penalties");
    assert.equal(c.events.filter((e) => e.type === "lastAttack").length, 1, "연장에서도 1회");
    const lb = match.getMatchView(c, data).lastBeat;
    const kind = c.finished ? "end" : "penalties";
    assert.equal(lb.matchEnd, kind, `마지막 비트 ${lb.type} matchEnd`);
    if (kind === "penalties") assert.deepEqual(c.score, { home: 2, away: 2 }, "마지막 공격 골 → 동점 → 승부차기");
    ends.add(kind);
  }
  assert.deepEqual([...ends].sort(), ["end", "penalties"]);
});

test("마지막 포제션 문구: 이 포제션이 끝나면 경기가 끝나면 미리보기 · 이벤트가 역습 · GK 배급 대신 '경기 종료' (배급 롱패스 · ④ · 수비 · 골)", () => {
  // 1골 뒤진 우리(home)의 마지막 공격이 GK 배급으로 시작 (상대 마지막 포제션 슛을 우리 GK 가 막음)
  const ms = mk({}, {}, { possessions: 4, kind: "friendly" });
  ms.possession = ms.possessionsTotal;
  ms.score = { home: 0, away: 1 };
  place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
  const { ms: la } = forced(ms, null, false);
  assert.equal(la.phase, "distribution");
  assert.equal(match.endForecast(la, data, "away"), "end");
  const D = match.getMatchView(la, data).distribution;
  assert.deepEqual({ s: D.options.long.fail.short, l: D.options.long.fail.label, e: D.options.long.fail.matchEnd },
    { s: "실패 경기 종료", l: "롱패스 차단 — 경기 종료", e: "end" });
  assert.match(D.options.long.text, /— 성공 중원부터 \/ 실패 경기 종료$/);
  // 롱패스 실패 → 경기 종료 (역습 없음): 이벤트 matchEnd · 문구 · starterId 없음, receiverId = 향하던 MF
  const ng = forcedDist(la, { action: "long" }, false);
  assert.equal(ng.ms.finished, true);
  assert.deepEqual({ me: ng.ev.matchEnd, st: ng.ev.starterId, r: ng.ev.receiverId }, { me: "end", st: undefined, r: "h_MF1" });
  assert.match(ng.ev.text, /롱패스 차단! .+ — 경기 종료 \(\d+%\)$/);
  assert.ok(!ng.fresh.some((e) => e.type === "counter"), "역습 없음");
  // 평소: 실패 = 세컨드볼 역습, starterId = 역습을 시작하는 선수
  const n = forcedDist(saved(), { action: "long" }, false);
  assert.equal(n.ev.matchEnd, undefined);
  assert.deepEqual({ st: n.ev.starterId, r: n.ev.receiverId }, { st: n.ms.ball.carrierId, r: "h_MF1" });

  // 우리 마지막 공격 ④ (1골 뒤짐): 막히면 경기 종료 (GK 배급 없음), 골이면 동점 → 친선 = 경기 종료 / 목표 경기 = 연장전
  for (const kind of ["friendly", "goal"]) {
    const s = mk({}, {}, { possessions: 4, kind });
    s.possessionsTotal = 5;
    s.possession = 5;
    s.lastAttack = { side: "home", stage: "regular", possession: 5 };
    s.lastAttackUsed = { regular: true, extraTime: false };
    s.score = { home: 0, away: 1 };
    place(s, { line: 3, carrier: "h_FW1" });
    const v = match.getMatchView(s, data);
    assert.deepEqual({ l: v.outcomes.shoot.fail.label, s: v.outcomes.shoot.fail.short, e: v.outcomes.shoot.fail.matchEnd, d: v.outcomes.shoot.fail.distribution },
      { l: "세이브 → 경기 종료", s: "실패 경기 종료", e: "end", d: undefined }, kind);
    assert.equal(v.outcomes.shoot.success.label, kind === "friendly" ? "골! → 경기 종료" : "골! → 연장전");
    if (v.outcomes.pass) {
      assert.equal(v.outcomes.pass.fail.label, "GK가 끊어냄 → 경기 종료");
      assert.match(v.actions.find((a) => a.action === "pass").hint, /\(막히면 경기 종료\)$/);
    }
    const { ms: sv, ev } = forced(s, { action: "shoot" }, false);
    assert.deepEqual({ f: sv.finished, me: ev.matchEnd, nd: ev.nextDistribution }, { f: true, me: "end", nd: undefined });
  }
  // 상대 마지막 정규 포제션을 수비: 이기고 있으면 막으면 경기 종료, 실점하면 동점 → 친선 종료
  const dm = mk({}, {}, { possessions: 4, kind: "friendly" });
  dm.possession = dm.possessionsTotal;
  dm.score = { home: 1, away: 0 };
  place(dm, { atk: "away", line: 1, carrier: "a_MF1" });
  const dv = match.getMatchView(dm, data);
  assert.equal(dv.needsDecision, "defense");
  for (const d of ["tackle", "intercept", "hold"]) {
    assert.deepEqual({ l: dv.outcomes[d].success.label, s: dv.outcomes[d].success.short, e: dv.outcomes[d].success.matchEnd },
      { l: "막으면 — 경기 종료", s: "막으면 경기 종료", e: "end" });
  }
  dm.duel.awayChoice = { ...dm.duel.awayChoice, action: "dribble" };
  const { ms: dEnd, ev: dEv } = forced(dm, { action: "intercept" }, false);
  assert.deepEqual({ f: dEnd.finished, me: dEv.matchEnd }, { f: true, me: "end" });
  assert.ok(!/빠른 역습/.test(dEv.text), "끝나는 턴오버에는 역습 문구 없음");
  // 평소 포제션: 예측 없음
  assert.equal(match.endForecast(mk(), data, "away"), null);
});

test("결정타 칩 보완: 규칙 상수(박스 연결 GK ×0.6) 제외 · 능력치 우위 = 순수 능력치 비 (행동 계수 제외) · 요인과 같은 잣대로 겨룸 · 2%p 미만 요인은 칩 없음 · 크기 = 뺐을 때 승자 확률 하락폭", () => {
  // 박스 연결 성공: 연결 GK ×0.6 은 factors 에 있지만(rule) 결정타가 아니다
  const b = mk();
  place(b, { line: 3, carrier: "h_FW1" });
  const { ev: bev } = forced(b, { action: "pass" }, true);
  assert.equal(bev.boxLink, true);
  assert.ok(bev.factors.some((f) => f.id === "boxLinkGk" && f.rule === true), "규칙 상수 표시 (rule)");
  assert.ok(!bev.decisive || bev.decisive.id !== "boxLinkGk", `연결 GK 는 결정타 아님 (${bev.decisive && bev.decisive.text})`);
  // 롱패스: GK (300+500)/2 = 400 × 2.2 vs MF (600+400)/2 = 500 — 성공해도 능력치는 MF 가 높다 (계수 2.2 는 능력치가 아님)
  const d0 = saved({ GK: { stats: { pass: 300, physical: 500 } } }, { MF1: { stats: { defense: 600, physical: 400 } } });
  assert.equal(forcedDist(d0, { action: "long" }, true).ev.decisive, null, "성공: 능력치 우위 칩 없음");
  const lng = forcedDist(d0, { action: "long" }, false).ev;
  assert.deepEqual({ id: lng.decisive.id, t: lng.decisive.text, f: lng.decisive.favours }, { id: "stat", t: "능력치 우위 ×1.25", f: "def" });
  // 크기 = 능력치 차를 없앴을 때 수비 승 확률 하락폭: 880/(880+500) → 1100/(1100+500)
  near(lng.decisive.effect, (1 - 880 / 1380) - (1 - 1100 / 1600), "능력치 우위 크기");
  // 팀워크 ×1.02 (팀워크 20) 만 공격 쪽 → 2%p 미만이라 칩 없음
  const t = mk({ team: { teamwork: 20 } });
  place(t, { line: 1, carrier: "h_MF1" });
  t.duel.awayChoice = { ...t.duel.awayChoice, action: "hold" };
  const { ev: tev } = forced(t, { action: "pass" }, true);
  near(tev.factors.find((f) => f.id === "teamwork").mult, 1.02, "팀워크 ×1.02");
  assert.equal(tev.decisive, null, "2%p 미만 요인은 결정타가 아니다");
  // 짝 적중: 크기 = 짝 배율을 뺐을 때 수비 승 확률 하락폭
  const pm = mk();
  place(pm, { line: 0, carrier: "h_DF1" });
  pm.duel.awayChoice = { ...pm.duel.awayChoice, action: "tackle" };
  const { ev: pev } = forced(pm, { action: "dribble" }, false);
  const prod = (side, skip) => pev.factors.filter((f) => f.side === side && f.id !== skip).reduce((a, f) => a * f.mult, 1);
  const wOf = (A, Dd) => 1 - Math.min(M.maxP, Math.max(M.minP, A / (A + Dd)));
  assert.equal(pev.decisive.id, "pair");
  near(pev.decisive.effect, wOf(prod("atk"), prod("def")) - wOf(prod("atk"), prod("def", "pair")), "짝 크기");
  // 능력치 우위는 요인과 같은 잣대로 겨룬다 (2%p 이상 요인이 있어도 능력치 차가 더 크면 능력치 우위):
  //  GK (800+800)/2 = 800 × 2.2 × 빠른 배급 1.25 = 2200 vs MF 400 → p 0.846. 빠른 배급을 빼면 1760/2160 (3.2%p ≥ 2%p),
  //  능력치를 같게 하면 1100/1500 (11.3%p) → 결정타 = 능력치 우위 ×2 (예전: 빠른 배급 +25%)
  const big = saved({ GK: { trait: "distributor", stats: { pass: 800, physical: 800 } } });
  const bev2 = forcedDist(big, { action: "long" }, true).ev;
  const pBig = 2200 / 2600;
  near(bev2.p, pBig, "롱패스 p");
  const distEff = pBig - 1760 / 2160;
  const statEff = pBig - 1100 / 1500;
  assert.ok(distEff >= M.decisiveMinDelta && statEff > 3 * distEff, `전제: 빠른 배급 ${distEff} ≥ 2%p, 능력치 ${statEff} ≫`);
  assert.deepEqual({ id: bev2.decisive.id, t: bev2.decisive.text, f: bev2.decisive.favours }, { id: "stat", t: "능력치 우위 ×2", f: "atk" });
  near(bev2.decisive.effect, statEff, "능력치 우위 크기 (같은 잣대)");
  // 거꾸로 요인이 능력치 차보다 크면 요인 (GK 450 vs MF 400: 능력치 ≈ 2.2%p < 빠른 배급 ≈ 4.4%p)
  const small = saved({ GK: { trait: "distributor", stats: { pass: 450, physical: 450 } } });
  const sev = forcedDist(small, { action: "long" }, true).ev;
  assert.deepEqual({ id: sev.decisive.id, t: sev.decisive.text }, { id: "distributor", t: "빠른 배급 +25%" });
});

test("결정타 칩 · 버티기 (L51 표시 수정): holdMult 는 철벽처럼 계수 쪽 — 순수 능력치 = 수비 그대로 · 같은 능력치면 능력치 우위 없음 · 수비가 높으면 수비 쪽 능력치 우위 · 확률 불변", () => {
  assert.ok(M.holdMult !== 1, "전제: holdMult ≠ 1 (1 이면 이 표시 버그가 보이지 않는다)");
  const holdAt = (awayOver = {}, d = data) => {
    const ms = match.createMatch({ data: d, seed: 1, home: team("h"), away: team("a", awayOver), possessions: 8, kind: "goal" });
    place(ms, { line: 2, carrier: "h_FW1" });
    ms.duel.defenderId = "a_DF1";
    ms.duel.coverCount = 0;
    ms.duel.awayChoice = { ...ms.duel.awayChoice, action: "hold" };
    return ms;
  };
  const baseOf = (factors, side) => factors.find((f) => f.side === side && f.base);
  // 같은 스탯 400: 드리블 400 × 2.2 vs 버티기 400 × holdMult — 순수 능력치는 400 : 400
  const eq = holdAt();
  const x = odds(eq, "dribble", "hold");
  const y = odds(eq, "dribble", "hold", { explain: true });
  assert.deepEqual({ att: x.att, def: x.def, p: x.p }, { att: y.att, def: y.def, p: y.p }, "explain 은 확률 불변");
  near(y.def, 400 * M.holdMult, "버티기 = 수비 × holdMult (판정값은 그대로)");
  const bD = baseOf(y.factors, "def");
  near(bD.stat, 400, "순수 능력치 = 수비 그대로 (holdMult 를 뺀 값)");
  near(bD.coef, M.holdMult, "계수 = holdMult (태클 · 인터셉트 계수와 같은 자리)");
  near(bD.mult, bD.stat * bD.coef, "기본 배율 = 능력치 × 계수");
  assert.equal(bD.text, `버티기 ${Math.round(400 * M.holdMult)}`, "수비 기본 문구 = 판정값");
  near(baseOf(y.factors, "atk").stat, 400, "공격 순수 능력치");
  // 태클 · 인터셉트도 같은 모양: 능력치 = 스탯 평균, 계수 = 행동 계수
  for (const d of ["tackle", "intercept"]) {
    const f = baseOf(odds(eq, "dribble", d, { explain: true }).factors, "def");
    assert.deepEqual({ s: f.stat, c: f.coef }, { s: 400, c: M.actionCoef[d] }, d);
  }
  // 철벽: holdMult 와 철벽 둘 다 능력치에서 빠진다 (철벽은 따로 칩)
  const wl = holdAt({ DF1: { trait: "wall" } });
  const yw = odds(wl, "dribble", "hold", { explain: true });
  const bW = baseOf(yw.factors, "def");
  near(bW.stat, 400, "철벽 + holdMult: 순수 능력치 400");
  near(bW.coef, M.holdMult, "철벽 + holdMult: 계수");
  near(yw.factors.find((f) => f.id === "wall").mult, 1.15, "철벽 칩");
  near(yw.factors.filter((f) => f.side === "def").reduce((a, f) => a * f.mult, 1), yw.def, "곱 = 판정값");
  near(yw.def, 400 * M.holdMult * 1.15, "철벽 판정값");
  // holdMult 를 바꿔도 순수 능력치는 그대로, 계수만 따라간다 (1.0 이면 예전 표시와 같다)
  for (const hm of [1.0, 0.8]) {
    const d2 = clone(data);
    d2.config.match.holdMult = hm;
    const z = match.computeOdds(holdAt({}, d2), d2, { action: "dribble", defAction: "hold", explain: true });
    const bZ = baseOf(z.factors, "def");
    assert.deepEqual({ s: bZ.stat, c: bZ.coef }, { s: 400, c: hm }, `holdMult ${hm}`);
    near(z.def, 400 * hm, `holdMult ${hm} 판정값`);
  }
  // 실제 판정 이벤트: 같은 능력치면 어느 쪽이 이겨도 "능력치 우위" 칩이 없다 (예전: 공격 승 "능력치 우위 ×1.67")
  for (const success of [true, false]) {
    const { ev } = forced(eq, { action: "dribble" }, success);
    assert.equal(ev.defAction, "hold");
    near(ev.p, x.p, "이벤트 p = computeOdds p");
    assert.ok(!ev.decisive || ev.decisive.id !== "stat", `같은 능력치 → 능력치 우위 없음 (${ev.decisive && ev.decisive.text})`);
    assert.ok(!ev.factors.some((f) => f.base && f.side === "def" && Math.abs(f.stat - 400) > 1e-9), "이벤트 수비 기본 능력치 400");
  }
  // 수비가 높으면 (수비 600 vs 드리블 400) 수비 승의 결정타 = 수비 쪽 "능력치 우위 ×1.5"
  //  (예전: 600 × 0.6 = 360 < 400 이라 공격 쪽 능력치로 보여 칩이 없었다)
  const hi = holdAt({ DF1: { stats: { defense: 600 } } });
  const { ev: hev } = forced(hi, { action: "dribble" }, false);
  near(hev.p, odds(hi, "dribble", "hold").p, "이벤트 p = computeOdds p");
  assert.deepEqual({ id: hev.decisive.id, t: hev.decisive.text, f: hev.decisive.favours }, { id: "stat", t: "능력치 우위 ×1.5", f: "def" });
});

test("L51 경기 밸런스 1차 (2026-10-05) 데이터: 필드 수비 세 행동 같은 배율 0.6 (태클 · 인터셉트 계수 · 버티기 holdMult) · 친선전 10 포제션", () => {
  assert.equal(M.actionCoef.tackle, 0.6, "태클 계수");
  assert.equal(M.actionCoef.intercept, 0.6, "인터셉트 계수");
  assert.equal(M.holdMult, 0.6, "버티기 holdMult");
  assert.equal(data.config.friendly.possessions, 10, "친선전 포제션");
  // 셋이 같은 배율이라 같은 스탯이면 짝 없는 기본 수비값이 같다 (태클 = 인터셉트 = 버티기 = 400 × 0.6)
  const ms = mk();
  place(ms, { line: 2, carrier: "h_FW1" });
  ms.duel.coverCount = 0;
  const base = (d) => odds(ms, "dribble", d, { explain: true }).factors.find((f) => f.side === "def" && f.base).mult;
  for (const d of ["tackle", "intercept", "hold"]) near(base(d), 400 * 0.6, `${d} 기본`);
  // 레슨 런 · 기존 런 친선전은 config.friendly.possessions 를 쓴다
  const st = run.createRun({ data, seed: "l51" });
  run.makeFriendlyMatch(st, data, "friendly");
  assert.equal(st.pendingMatch.possessions, 10);
});

test("GK 배급 추천 = '상황 따라' 규칙 (확률 ≥ longPassAutoMin, 자동이 쓸 캐논 킥 포함 — 배급 전술과 무관) · 전술 auto 면 자동 선택과 같다", () => {
  const ck0 = saved({ GK: { skillIds: ["sk_cannon_kick"], stats: { pass: 300, physical: 500 } } });
  ck0.home.tension = 60;
  ck0.home.tactics.tension = "immediate";
  const dd = ai.decideDistribution(ck0, dataWithMin(0), "home");
  const mid = (dd.pLong + dd.pSkill) / 2;
  const v = match.getMatchView(ck0, dataWithMin(mid)).distribution;
  assert.deepEqual({ r: v.recommended, rs: v.recommendedSkillId, a: v.auto.action, as: v.auto.skillId },
    { r: "long", rs: "sk_cannon_kick", a: "long", as: "sk_cannon_kick" }, "기본 < min ≤ 캐논 킥 → 추천 = 자동 = 캐논 킥 롱패스");
  assert.equal(v.options.long.recommended, true);
  // 전술 short: 추천은 확률 기준(long), 자동은 전술(short)
  const sh = clone(ck0);
  sh.home.tactics.distribution = "short";
  const vs = match.getMatchView(sh, dataWithMin(0)).distribution;
  assert.deepEqual({ r: vs.recommended, a: vs.auto.action, t: vs.tactic }, { r: "long", a: "short", t: "short" });
  // 텐션 전술 clutch 로 캐논 킥을 아끼면 추천도 기본 확률 기준 (min > 기본 → 짧게)
  const cl = clone(ck0);
  cl.home.tactics.tension = "clutch";
  cl.possession = 1;
  const vc = match.getMatchView(cl, dataWithMin(mid)).distribution;
  assert.deepEqual({ r: vc.recommended, rs: vc.recommendedSkillId, a: vc.auto.action }, { r: "short", rs: null, a: "short" });
});
