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

test("수비 스탯·배율: 태클 (수비+피지컬)/2 · 인터셉트 (수비+패스)/2 · 버티기 수비, 짝 ×readBonus · 빗나감 ×0.8 · 버티기 ×1.0 · 중거리 ×1.5", () => {
  const ms = mk({}, { DF1: { stats: { defense: 500, physical: 300, pass: 200 } }, DF2: { stats: { defense: 100 } } });
  place(ms, { line: 2, carrier: "h_FW1" });
  ms.duel.defenderId = "a_DF1";
  ms.duel.coverCount = 0;
  const cases = [
    ["dribble", "tackle", 400 * M.readBonus],
    ["pass", "tackle", 400 * M.missMult],
    ["pass", "intercept", 350 * M.readBonus],
    ["dribble", "intercept", 350 * M.missMult],
    ["dribble", "hold", 500 * M.holdMult],
    ["pass", "hold", 500 * M.holdMult],
    ["shoot", "hold", 500 * M.holdMult * M.holdVsMidrange],
    ["shoot", "tackle", 400 * M.missMult],
  ];
  for (const [a, d, exp] of cases) near(odds(ms, a, d).def, exp, `${a} vs ${d}`);
  // 공격력: 드리블/패스 ×2.2, 중거리 ×0.6
  near(odds(ms, "dribble", "hold").att, 400 * M.actionCoef.dribble, "드리블 공격");
  near(odds(ms, "shoot", "hold").att, 400 * M.actionCoef.midrangeShoot, "중거리 공격");
  // 철벽: 버티기 ×1.15
  ms.away.players.find((p) => p.id === "a_DF1").trait = "wall";
  near(odds(ms, "dribble", "hold").def, 500 * M.holdMult * 1.15, "철벽");
  ms.away.players.find((p) => p.id === "a_DF1").trait = null;
  // 효과: 빗나감 페널티 없음 / 간파 ×2.0 / 상대 짝 무효
  const fxD = { ...skills.emptyDuelEffects(), noMissPenalty: true };
  near(odds(ms, "pass", "tackle", { fxD }).def, 400, "noMissPenalty");
  const rb = { ...skills.emptyDuelEffects(), readMult: 2.0 };
  near(odds(ms, "dribble", "tackle", { fxD: rb }).def, 800, "readBoost 태클 짝");
  near(odds(ms, "shoot", "hold", { fxD: rb }).def, 1000, "readBoost 버티기 vs 중거리");
  near(odds(ms, "pass", "tackle", { fxD: rb }).def, 400 * M.missMult, "readBoost 는 빗나감엔 무관");
  const ng = { ...skills.emptyDuelEffects(), negateRead: true };
  near(odds(ms, "dribble", "tackle", { fxA: ng }).def, 400, "negateRead → 짝 ×1.0");
  near(odds(ms, "shoot", "hold", { fxA: ng }).def, 500, "negateRead → 중거리 버티기 ×1.0");
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

test("역습 시작 표: 기본 2/1/0 · 인터셉트 +1 · 소매치기 +1 · 상한 2 (텐션 / 첫 듀얼 +15%) · 버티기 0 · 세이브 0 · 빠른 배급 1", () => {
  const steal = { plus: 1, tension: 10, cappedNextBonus: 0.15 };
  const rows = [
    // [line, 수비, steal, 기대 시작 line, 추가 텐션, 첫 듀얼 보너스]
    [0, "tackle", false, 2, 0, 0],
    [1, "tackle", false, 1, 0, 0],
    [2, "tackle", false, 0, 0, 0],
    [0, "intercept", false, 2, M.counterCapTension, 0],
    [1, "intercept", false, 2, 0, 0],
    [2, "intercept", false, 1, 0, 0],
    [0, "hold", false, 0, 0, 0],
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
  // GK 세이브 → 0, 빠른 배급 → 1
  for (const [trait, start] of [[null, 0], ["distributor", 1]]) {
    const ms = mk({ GK: { trait } });
    place(ms, { atk: "away", line: 3, carrier: "a_FW1" });
    const { ms: after, ev } = forced(ms, null, false);
    assert.equal(ev.type, "save");
    assert.equal(after.ball.lineIndex, start, `세이브 ${trait}`);
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
  near(odds(ms, "cross", "intercept").def / odds(ms, "cross", "hold").def, M.readBonus * 400 / 400, "크로스 ↔ 인터셉트 짝");
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
  // 빌드업·중원(line ≤ buildupMaxLine = 1)까지. line 0 공 소유자는 항상 DF 라 MF 보유자(미르카·키르)는 line 1 에서 받아 발동한다
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
      assert.ok(["attack", "defense", "any"].includes(s.active.phase), `${s.id} phase`);
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
  for (const k of ["readBonus", "missMult", "holdMult", "holdVsMidrange", "beatenBonus", "interceptFailBonus", "oneTouchGk", "bonusCap", "passChainBonus", "counterCap", "counterCapTension", "tendency", "ultimate", "teamworkAmp"]) {
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
          if (ms.phase !== "decision") { match.step(ms, data, null); continue; }
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
            if (d && d.trait === "distributor" && ev.type === "save") hit(d);
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
