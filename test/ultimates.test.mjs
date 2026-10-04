// test/ultimates.test.mjs — LESSON_PROTO_PLAN §19 (K1): 필살기 6종 · E0 공통 기반 · E1 합체기는 등록된 짝만 ·
// E2 필살 수비 · E3 팀 필살기 · E4 필살 드리블 · E5 컷인 대사 · L46 주장 1명분.
// 테스트용 필살기는 데이터 사본(data.skills · data.combos)에 넣는다 — K1 에서는 skills.json 이 아직 그대로다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, clone, match } from "./helpers.mjs";
import * as ai from "../js/engine/ai.js";
import * as skills from "../js/engine/skills.js";
import { createRng } from "../js/engine/rng.js";

const readJson = (n) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../data/${n}.json`, import.meta.url)), "utf8"));

/* ------------------------------------------------------------------ */
/* 데이터 사본 + 테스트 필살기                                             */
/* ------------------------------------------------------------------ */

const ULTS = {
  t_def: { type: "defense", defense: 1.6, noMissPenalty: true, tier: "SR", cutinLine: "여기서부터는 산이다." },
  t_team: { type: "team", teamMult: 1.08, teamStamina: 15, tier: "R", cutinLine: "다들, 아직 안 끝났어!" },
  t_drib: { type: "dribble", attack: 1.3, noStamina: true, tier: "R", cutinLine: "아직 한참 더 뛸 수 있어!" },
  t_drib_x: { type: "dribble", attack: 1.2, extraLine: true, tier: "R", cutinLine: "무, 무서워도 뛴다!" },
  t_drib_n: { type: "dribble", attack: 1.25, negateRead: true, tier: "R", cutinLine: "힘으로는 못 잡아, 냐." },
  t_pass_plain: { type: "pass", attack: 1.5, negateRead: true, tier: "SR", cutinLine: "따라올 수 있으면 와 봐!" },
  t_pass_x: { type: "pass", attack: 1.5, actions: ["pass"], extraLine: true, tier: "SR", cutinLine: "거리, 계산 끝났어요." },
  t_pass_c: { type: "pass", attack: 1.5, actions: ["cross"], nextDuelBonus: 0.3, tier: "SR", cutinLine: "과녁은 저 머리 위." },
  t_shot_box: { type: "shot", shoot: 1.8, gkMult: 0.6, minLine: 3, stamina: 10, tier: "SSR", cutinLine: "번쩍— 이미 들어갔어." },
  t_shot_head: { type: "shot", shoot: 1.3, minLine: 3, headerMult: 1.1, tier: "R", cutinLine: "공중볼은 전부 내 거야!" },
  t_save_sure: { type: "save", saveMult: 2, sureDistribution: true, tier: "SSR", cutinLine: "전원 앞으로! 공은 내가 보낸다." },
};

function ultSkill(id, ultimate) {
  return {
    id, name: `테스트 ${id}`, kind: "unique", learnable: false, cost: 0, tension: 0, positions: null,
    description: `테스트 필살기 ${id}`, passive: null, active: null, ultimate,
  };
}

const base = loadData();
base.traits = readJson("traits");
base.combos = readJson("combos");
/** 등록된 짝: t_pass_x → t_shot_box "뇌우", t_pass_plain → t_drib "물살 연계" */
const data = clone(base);
data.skills.push(...Object.entries(ULTS).map(([id, u]) => ultSkill(id, u)));
data.combos = base.combos.concat([
  { a: "t_pass_x", b: "t_shot_box", name: "뇌우" },
  { a: "t_pass_plain", b: "t_drib", name: "물살 연계" },
]);
/** 같은 스킬, 합체기는 원래 목록만 (등록되지 않은 짝 비교용) */
const dataNo = Object.assign({}, data, { combos: base.combos.slice() });
const M = data.config.match;
const UC = M.ultimate;

const FORM = [["GK", "GK"], ["DF1", "DF"], ["DF2", "DF"], ["MF1", "MF"], ["MF2", "MF"], ["FW1", "FW"], ["FW2", "FW"]];
const BASE = { shoot: 400, dribble: 400, pass: 400, defense: 400, physical: 400 };

/** over: { [slot]: { stats?, trait?, skillIds?, style? }, team: { …팀 필드 } } */
function team(prefix, over = {}) {
  return {
    name: prefix === "h" ? "홈" : "원정",
    formation: "2-2-2",
    tactics: { attack: "balanced", shootTiming: "breakAll", defense: "balanced", tension: "immediate", duelPicker: "best" },
    teamwork: 0, conditionMult: 1, resonance: null, modifiers: {},
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
    data: opts.data || data, seed: opts.seed ?? 1, home: team("h", homeOver), away: team("a", awayOver),
    possessions: opts.possessions ?? 8, kind: opts.kind ?? "goal",
  });
}

/** 공을 원하는 자리에 놓고 듀얼을 다시 준비한다 (AI 커밋 포함). gauges: { pid: 값 } 은 준비 전에 넣는다 */
function place(ms, { atk = "home", line = 0, carrier, ball = {}, gauges = {} }, d = data) {
  for (const [pid, g] of Object.entries(gauges)) {
    const side = pid.startsWith("h_") ? "home" : "away";
    ms[side].live[pid].gauge = g;
  }
  ms.attackingSide = atk;
  ms.ball = {
    carrierId: carrier, lineIndex: line, chain: 0, extraLine: false, oneTouch: false, receivedVia: null, lastPasserId: null,
    receivedFresh: false, comboReadyId: null, comboFrom: null, pending: { beaten: false, interceptFail: false, nextBonus: 0 }, ...ball,
  };
  ms.duel = null;
  ms.phase = "possessionEnd";
  match.step(ms, d);
  assert.equal(ms.phase, "decision");
  return ms;
}

const RESOLVE = ["duel", "turnover", "save", "goal"];

/** decision 으로 한 번 진행하되 판정 결과(공격 성공 여부)를 강제 — rngState 를 바꿔 가며 찾는다 */
function forced(ms, decision, success, d = data) {
  for (let s = 1; s < 800; s++) {
    const c = clone(ms);
    c.rngState = createRng(`force${s}`).getState();
    const n0 = c.events.length;
    match.step(c, d, decision);
    const ev = c.events.slice(n0).find((e) => RESOLVE.includes(e.type));
    if (ev && ev.success === success) return { ms: c, ev, fresh: c.events.slice(n0) };
  }
  throw new Error(`강제 결과(${success})를 찾지 못함`);
}

const P = (ms, side, id) => ms[side].players.find((p) => p.id === id);
const fxWith = (id) => Object.assign(skills.emptyDuelEffects(), { ult: Object.assign({ skillId: id }, ULTS[id]) });
const factor = (ev, side, id) => (ev.factors || []).find((f) => f.side === side && f.id === id) || null;
const pct = (p) => Math.round(p * 100);

/* ------------------------------------------------------------------ */
/* E0 · 데이터 스키마 · 공통 기반                                         */
/* ------------------------------------------------------------------ */

test("E0 ultimateErrors: 종류별 허용 키 · 모르는 키 · 배율 < 1 · gkMult · minLine · actions · tier · cutinLine 길이 · 필살기 아님 = []", () => {
  const e = (u) => skills.ultimateErrors({ id: "x", ultimate: u });
  assert.deepEqual(skills.ULTIMATE_TYPES, ["shot", "pass", "save", "defense", "team", "dribble"]);
  for (const [id, u] of Object.entries(ULTS)) assert.deepEqual(e(u), [], id);
  assert.deepEqual(skills.ultimateErrors({ id: "p", ultimate: null }), []);
  assert.deepEqual(e({ type: "beam" }), ["필살기 x: 알 수 없는 종류 beam"]);
  assert.deepEqual(e({ type: "save", saveMult: 2, shoot: 2 }), ["필살기 x: save에 쓸 수 없는 키 shoot"]);
  assert.deepEqual(e({ type: "defense", defense: 1.6, extraLine: true }), ["필살기 x: defense에 쓸 수 없는 키 extraLine"]);
  assert.ok(e({ type: "dribble", attack: 0.9 })[0].includes("attack 는 1 이상"));
  assert.ok(e({ type: "team", teamMult: 0.5 })[0].includes("teamMult"));
  assert.ok(e({ type: "shot", shoot: 2, gkMult: 1.2 })[0].includes("gkMult"));
  assert.ok(e({ type: "shot", shoot: 2, gkMult: 0 })[0].includes("gkMult"));
  assert.ok(e({ type: "shot", shoot: 2, minLine: 1 })[0].includes("minLine"));
  assert.ok(e({ type: "pass", attack: 1.5, actions: [] })[0].includes("actions"));
  assert.ok(e({ type: "pass", attack: 1.5, actions: ["dribble"] })[0].includes("actions"));
  assert.ok(e({ type: "pass", attack: 1.5, receiverGauge: -1 })[0].includes("receiverGauge"));
  assert.ok(e({ type: "team", teamMult: 1.08, teamStamina: -5 })[0].includes("teamStamina"));
  assert.ok(e({ type: "pass", attack: 1.5, tier: "UR" })[0].includes("tier"));
  assert.ok(e({ type: "pass", attack: 1.5, cutinLine: "" })[0].includes("cutinLine"));
  assert.ok(e({ type: "pass", attack: 1.5, cutinLine: "가".repeat(25) })[0].includes("cutinLine"));
  assert.deepEqual(e({ type: "pass", attack: 1.5, cutinLine: "가".repeat(24) }), []);
  // 지금 데이터의 필살기 4개는 그대로 통과 (tier · cutinLine 은 K2 가 넣는다 — 없어도 된다)
  for (const sk of base.skills) assert.deepEqual(skills.ultimateErrors(sk), [], sk.id);
});

test("E0 createMatch 가 잘못된 필살기 데이터를 막는다 (validateUltimates — 모아서 throw)", () => {
  const bad = clone(data);
  bad.skills.push(ultSkill("t_bad", { type: "defense", defense: 0.5, shoot: 2 }));
  assert.throws(() => mk({}, {}, { data: bad }), /필살기 데이터 오류[\s\S]*t_bad: defense에 쓸 수 없는 키 shoot[\s\S]*defense 는 1 이상/);
  assert.doesNotThrow(() => mk());
});

test("E0 minLine 3 슛: line 2 사유 '박스 슛에서만' · line 3 가능 / minLine 없는 슛은 지금 문구", () => {
  const ms = place(mk({ FW1: { skillIds: ["t_shot_box"] } }), { line: 2, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  const r2 = match.ultimateUsable(ms, data, "home", P(ms, "home", "h_FW1"), "attack", "shoot");
  assert.deepEqual({ ok: r2.ok, reason: r2.reason }, { ok: false, reason: "박스 슛에서만" });
  place(ms, { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  assert.equal(match.ultimateUsable(ms, data, "home", P(ms, "home", "h_FW1"), "attack", "shoot").ok, true);
  const ms2 = place(mk({ FW1: { skillIds: ["sk_meteor_shot"] } }), { line: 1, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  assert.equal(match.ultimateUsable(ms2, data, "home", P(ms2, "home", "h_FW1"), "attack", "shoot").reason, "파이널 서드·박스 슛에서만");
});

test("E0 headerMult 는 헤더에만 (크로스로 받은 박스 슛) — 원터치 슛은 shoot 배율만", () => {
  const ms = place(mk({ FW1: { skillIds: ["t_shot_head"] } }), { line: 3, carrier: "h_FW1" });
  const fx = fxWith("t_shot_head");
  const plain = match.computeOdds(ms, data, { action: "shoot", defAction: "save", fxA: fx, explain: true });
  assert.equal(factor(plain, "atk", "ultimate").mult, 1.3);
  place(ms, { line: 3, carrier: "h_FW1", ball: { receivedVia: "cross" } });
  const head = match.computeOdds(ms, data, { action: "shoot", defAction: "save", fxA: fx, explain: true });
  assert.equal(head.header, true);
  assert.ok(Math.abs(factor(head, "atk", "ultimate").mult - 1.43) < 1e-9);
});

test("E0 pass actions: 크로스 전용 필살 패스는 패스에 쓸 수 없다 (사유 '크로스와 함께만') · 패스 전용은 크로스에", () => {
  const ms = place(mk({ MF1: { skillIds: ["t_pass_c"], trait: "crosser" } }), { line: 2, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  const mf = P(ms, "home", "h_MF1");
  assert.equal(match.ultimateUsable(ms, data, "home", mf, "attack", "pass").reason, "크로스와 함께만");
  assert.equal(match.ultimateUsable(ms, data, "home", mf, "attack", "cross").ok, true);
  // line 1 은 크로스가 없다 → 액션 없이도 쓸 수 없다 (버튼이 켜지지 않게)
  place(ms, { line: 1, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  assert.equal(match.ultimateUsable(ms, data, "home", mf, "attack", null).reason, "크로스와 함께만");
  const ms2 = place(mk({ DF1: { skillIds: ["t_pass_x"] } }), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  assert.equal(match.ultimateUsable(ms2, data, "home", P(ms2, "home", "h_DF1"), "attack", "cross").reason, "패스와 함께만");
});

test("E0 pass extraLine: 한 구역 더 도착 (line 0 → 2) · outcomesBySkill[필살기] = 실제 · receiverGauge 기본 = onReceive", () => {
  const ms = place(mk({ DF1: { skillIds: ["t_pass_x"] }, FW1: { skillIds: ["t_team"] } }), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const v = match.getMatchView(ms, data);
  const prev = v.outcomesBySkill && v.outcomesBySkill.t_pass_x;
  assert.ok(prev, "필살 패스 변형 미리보기");
  assert.equal(prev.pass.success.step, 2);
  assert.equal(v.outcomes.pass.success.step, 1, "필살기 없이 = 한 구역");
  const rid = prev.pass.success.receiver.id;
  const { ms: c, ev } = forced(ms, { action: "pass", ultimate: true }, true);
  assert.equal(c.ball.lineIndex, 2);
  assert.equal(ev.receiverId, rid);
  assert.ok(ev.text.includes("한 구역 추가 전진"));
  // 받은 선수(FW1 · 팀 필살기 보유)는 등록 안 된 짝 → 게이지 +onReceive (옛 기본 onUltPassReceive 50 이 아니다)
  assert.equal(rid, "h_FW1");
  assert.equal(c.home.live.h_FW1.gauge, UC.gaugeStart + UC.onReceive);
  assert.equal(c.ball.comboReadyId, null, "t_pass_x → t_team 은 등록 안 된 짝");
});

test("E0 sureDistribution: 필살 세이브로 막으면 배급 롱패스 p = 1 · 판정 앞뒤 rngState 같음 · 그다음 배급은 보통", () => {
  const ms = mk({ GK: { skillIds: ["t_save_sure"], stats: { defense: 300 } } });
  place(ms, { atk: "away", line: 3, carrier: "a_FW1", gauges: { h_GK: 100 } });
  assert.equal(ms.duel.effects.home.ult && ms.duel.effects.home.ult.skillId, "t_save_sure", "AI GK 는 동점이면 필살 세이브");
  const { ms: d0, ev } = forced(ms, null, false);
  assert.equal(ev.type, "save");
  assert.equal(d0.phase, "distribution");
  assert.deepEqual(d0.distribution.sure, { skillId: "t_save_sure" });
  const D = match.getMatchView(d0, data).distribution;
  assert.deepEqual({ p: D.options.long.p, pct: D.options.long.pct, sure: D.options.long.sure, fail: D.options.long.fail, rec: D.recommended },
    { p: 1, pct: 100, sure: true, fail: null, rec: "long" });
  assert.ok(D.options.long.text.includes("확정"));
  assert.equal(match.longPassOdds(d0, data, "home").p, 1);
  const rng0 = d0.rngState;
  const n0 = d0.events.length;
  match.step(d0, data, { action: "long" });
  const dist = d0.events.slice(n0).find((e) => e.distribution);
  assert.deepEqual({ t: dist.type, s: dist.success, sure: dist.sure, p: dist.p }, { t: "distribution", s: true, sure: true, p: 1 });
  assert.equal(d0.rngState, rng0, "확정 롱패스는 주사위를 굴리지 않는다");
  assert.equal(d0.distribution, null);
  // 다음 세이브 (게이지 0 — 필살 세이브 없음) → 보통 배급
  place(d0, { atk: "away", line: 3, carrier: "a_FW1" });
  const { ms: d1 } = forced(d0, null, false);
  assert.equal(d1.distribution.sure, undefined);
  assert.ok(match.longPassOdds(d1, data, "home").p < 1);
});

/* ------------------------------------------------------------------ */
/* E1 · 합체기는 등록된 짝만                                               */
/* ------------------------------------------------------------------ */

test("E1 등록 안 된 짝: comboReadyId null · 게이지 +receiverGauge(기본 onReceive) · 차지 않았으면 다음 듀얼 필살기 불가 · 차면 보통 사용", () => {
  const ms = place(mk({ DF1: { skillIds: ["t_pass_plain"] }, MF1: { skillIds: ["t_team"] }, MF2: { skillIds: ["t_team"] } }),
    { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const { ms: c } = forced(ms, { action: "pass", receiverId: "h_MF1", ultimate: true }, true);
  assert.equal(c.ball.carrierId, "h_MF1");
  assert.equal(c.ball.comboReadyId, null);
  assert.equal(c.ball.comboFrom, null);
  assert.equal(c.home.live.h_MF1.gauge, UC.gaugeStart + UC.onReceive);
  const r = match.ultimateUsable(c, data, "home", P(c, "home", "h_MF1"), "attack", null);
  assert.deepEqual({ ok: r.ok, reason: r.reason, combo: r.combo }, { ok: false, reason: "게이지 부족", combo: false });
  // 게이지가 가득이면 자기 필살기를 보통처럼 (합체기 아님)
  const ms2 = place(mk({ DF1: { skillIds: ["t_pass_plain"] }, MF1: { skillIds: ["t_team"] } }),
    { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100, h_MF1: 80 } });
  const { ms: c2 } = forced(ms2, { action: "pass", receiverId: "h_MF1", ultimate: true }, true);
  assert.equal(c2.home.live.h_MF1.gauge, 100);
  const r2 = match.ultimateUsable(c2, data, "home", P(c2, "home", "h_MF1"), "attack", "dribble");
  assert.deepEqual({ ok: r2.ok, combo: r2.combo }, { ok: true, combo: false });
});

test("E1 등록된 짝: 합체기 대기 → 이름 · ×comboBonus · 받은 선수 게이지 소모 없음 (지금 합체기 그대로)", () => {
  const ms = place(mk({ DF1: { skillIds: ["t_pass_plain"] }, MF1: { skillIds: ["t_drib"] } }),
    { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const { ms: c } = forced(ms, { action: "pass", receiverId: "h_MF1", ultimate: true }, true);
  assert.equal(c.ball.comboReadyId, "h_MF1");
  assert.deepEqual(c.ball.comboFrom, { playerId: "h_DF1", skillId: "t_pass_plain" });
  const g = c.home.live.h_MF1.gauge;
  assert.ok(g < 100);
  assert.equal(match.ultimateUsable(c, data, "home", P(c, "home", "h_MF1"), "attack", "dribble").combo, true);
  const { ms: c2, ev, fresh } = forced(c, { action: "dribble", ultimate: true }, true);
  const combo = fresh.find((e) => e.type === "combo");
  assert.equal(combo.name, "물살 연계");
  assert.equal(fresh.find((e) => e.type === "cutin").combo, true);
  assert.equal(factor(ev, "atk", "combo").mult, UC.comboBonus);
  assert.equal(factor(ev, "atk", "ultimate").mult, 1.3);
  assert.ok(ev.links.some((l) => l.id === "combo"));
  assert.equal(c2.home.live.h_MF1.gauge, g, "합체기는 받은 선수 게이지를 쓰지 않는다 (필살기를 쓴 듀얼이라 얻지도 않는다)");
});

test("E1 AI 필살 패스: 등록 안 된 보유자에게 line 0 → 1 은 안 씀 · 등록 짝이면 씀 · 박스로 가면 씀 · 한 구역 더 가는 패스면 씀", () => {
  const ms = place(mk({}, { DF1: { skillIds: ["t_pass_plain"] }, MF1: { skillIds: ["t_drib"] }, MF2: { skillIds: ["t_team"] } }),
    { atk: "away", line: 0, carrier: "a_DF1" });
  ms.away.live.a_DF1.gauge = 100;
  const df = P(ms, "away", "a_DF1");
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "pass", "a_MF2"), false, "등록 안 된 짝");
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "pass", "a_MF1"), true, "등록된 짝");
  assert.equal(match.aiWantsUltimate(ms, dataNo, "away", df, "attack", "pass", "a_MF1"), false, "짝 목록에서 빼면 안 씀");
  const ms2 = place(mk({}, { MF1: { skillIds: ["t_pass_plain"] } }), { atk: "away", line: 2, carrier: "a_MF1" });
  ms2.away.live.a_MF1.gauge = 100;
  assert.equal(match.aiWantsUltimate(ms2, data, "away", P(ms2, "away", "a_MF1"), "attack", "pass"), true, "박스 도착");
  const ms3 = place(mk({}, { DF1: { skillIds: ["t_pass_x"] } }), { atk: "away", line: 0, carrier: "a_DF1" });
  ms3.away.live.a_DF1.gauge = 100;
  assert.equal(match.aiWantsUltimate(ms3, data, "away", P(ms3, "away", "a_DF1"), "attack", "pass"), true, "한 구역 더 (0 → 2)");
  const d = ai.decideAttack(ms3, data, "away");
  assert.deepEqual({ a: d.action, u: d.ultimate }, { a: "pass", u: true });
});

test("E1 받는 선수 가치: 등록 안 된 짝에는 합체기 가치를 주지 않는다 (defaultFromPlan · receiverValue)", () => {
  const over = { DF1: { skillIds: ["t_pass_plain"] }, MF1: { stats: { pass: 430, dribble: 430 } }, MF2: { skillIds: ["t_drib"] } };
  const ms = place(mk(over), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const fx = fxWith("t_pass_plain");
  assert.equal(match.defaultReceiverId(ms, data, "home", "pass", fx), "h_MF2", "등록된 짝 → 합체기 가치 (드리블 ×1.3 × 1.2)");
  assert.equal(match.defaultReceiverId(ms, dataNo, "home", "pass", fx), "h_MF1", "등록 안 된 짝 → 스탯대로");
  assert.equal(match.defaultReceiverId(ms, data, "home", "pass"), "h_MF1", "필살 패스가 아니면 그대로");
});

test("E1 박스 연결 · 외침: 등록된 짝만 합체기 (boxLinkEval combo · aceCall combo)", () => {
  const ms = place(mk({ MF1: { skillIds: ["t_pass_x"] }, FW1: { skillIds: ["t_shot_box"] } }),
    { line: 1, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  const call = match.aceCallFor(ms, data);
  assert.ok(call, "등록된 짝 (뇌우)");
  assert.deepEqual({ r: call.reason, p: call.playerId, n: call.comboName }, { r: "combo", p: "h_FW1", n: "뇌우" });
  assert.equal(match.aceCallFor(ms, dataNo), null, "등록 안 된 짝 · 게이지 30 → 외침 없음");
  // ④ 박스 연결: 컷백 필살 패스 → 받은 FW1 합체기 여부
  const box = place(mk({ MF1: { skillIds: ["t_pass_x"] }, FW1: { skillIds: ["t_shot_box"] } }),
    { line: 3, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  const evReg = match.boxLinkEval(box, data, "home");
  const evNo = match.boxLinkEval(box, dataNo, "home");
  assert.deepEqual({ u: evReg.pass.ultimate, r: evReg.pass.receiverId, c: evReg.pass.combo, ru: evReg.pass.receiverUltimate }, { u: true, r: "h_FW1", c: true, ru: true });
  assert.equal(evNo.pass.combo, false);
  assert.ok(evReg.pass.exp > evNo.pass.exp, "합체기 가치는 등록된 짝에만");
  // 게이지 외침은 shot · pass 필살기만 — 드리블 필살기는 게이지가 높아도 외치지 않는다
  const g = place(mk({ MF1: { skillIds: ["t_drib"] }, MF2: { skillIds: ["t_drib"] } }), { line: 0, carrier: "h_DF1", gauges: { h_MF1: 90, h_MF2: 90 } });
  assert.equal(match.aceCallFor(g, data), null);
  const g2 = place(mk({ MF1: { skillIds: ["t_pass_plain"] }, MF2: { skillIds: ["t_pass_plain"] } }), { line: 0, carrier: "h_DF1", gauges: { h_MF1: 90, h_MF2: 90 } });
  assert.equal(match.aceCallFor(g2, data).reason, "gauge");
});

/* ------------------------------------------------------------------ */
/* E2 · 필살 수비                                                         */
/* ------------------------------------------------------------------ */

/** 상대(away) 공격 line 1 — AI 공격수는 패스를 고른다(패스 스탯 높음). 우리 수비수 = MF1 (수비 최고) */
function defenseScene(skillId = "t_def") {
  return place(mk(
    { MF1: { skillIds: [skillId], stats: { defense: 500 } }, MF2: { stats: { defense: 300 } } },
    { MF1: { stats: { pass: 600, dribble: 300 } } },
  ), { atk: "away", line: 1, carrier: "a_MF1", gauges: { h_MF1: 100 } });
}

test("E2 필살 수비: 수비 ×defense 칩 · noMissPenalty(빗나감 ×1.0) · 미리보기 % = 실제 · 게이지 0 · cutin defense (대사 · 등급)", () => {
  const ms = defenseScene();
  assert.equal(ms.duel.defenderId, "h_MF1");
  assert.equal(ms.duel.awayChoice.action, "pass");
  const v = match.getMatchView(ms, data);
  const uo = v.ultimateOptions.find((u) => u.skillId === "t_def");
  assert.deepEqual({ u: uo.usable, t: uo.type, tier: uo.tier, line: uo.cutinLine }, { u: true, t: "defense", tier: "SR", line: ULTS.t_def.cutinLine });
  assert.deepEqual(Object.keys(uo.expectedPct).sort(), ["hold", "intercept", "tackle"]);
  const base0 = match.computeOdds(ms, data, { action: "pass", defAction: "tackle" });
  assert.equal(base0.pairMult, M.missMult, "필살기 없이 태클 vs 패스 = 빗나감");
  const { ms: c, ev, fresh } = forced(ms, { action: "tackle", ultimate: true }, false);
  assert.equal(pct(1 - ev.p), uo.expectedPct.tackle, "미리보기 = 실제");
  assert.equal(ev.pair, "miss");
  assert.equal(factor(ev, "def", "pair"), null, "빗나감 ×1.0 — 칩 없음");
  assert.equal(factor(ev, "def", "ultimate").mult, 1.6);
  assert.equal(ev.defUltimate, "t_def");
  assert.ok(ev.p < base0.p);
  const cut = fresh.find((e) => e.type === "cutin");
  assert.deepEqual({ t: cut.ultimateType, line: cut.line, tier: cut.tier, side: cut.side }, { t: "defense", line: ULTS.t_def.cutinLine, tier: "SR", side: "home" });
  assert.ok(cut.text.includes("필살 수비"));
  assert.equal(c.home.live.h_MF1.gauge, 0, "막아도 필살기를 쓴 듀얼은 게이지를 얻지 않는다");
});

test("E2 사유: 공격 역할 · GK 세이브(line 3)에서는 '필드 수비에서만' / AI: line 2 수비에서 씀 · line 0 · 1 은 남은 > 2 면 안 씀", () => {
  const ms = place(mk({ MF1: { skillIds: ["t_def"] } }), { line: 1, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  assert.equal(match.ultimateUsable(ms, data, "home", P(ms, "home", "h_MF1"), "attack", null).reason, "필드 수비에서만");
  const gk = place(mk({ GK: { skillIds: ["t_def"] } }), { atk: "away", line: 3, carrier: "a_FW1", gauges: { h_GK: 100 } });
  assert.equal(match.ultimateUsable(gk, data, "home", P(gk, "home", "h_GK"), "defense", "save").reason, "필드 수비에서만");
  // AI 수비 (away)
  const l2 = place(mk({}, { DF1: { skillIds: ["t_def"] }, DF2: { skillIds: ["t_def"] } }), { line: 2, carrier: "h_FW1" });
  const d2 = P(l2, "away", l2.duel.defenderId);
  l2.away.live[d2.id].gauge = 100;
  assert.equal(match.aiWantsUltimate(l2, data, "away", d2, "defense", "tackle"), true);
  assert.equal(ai.decideDefense(l2, data, "away").ultimate, true);
  const l1 = place(mk({}, { MF1: { skillIds: ["t_def"] }, MF2: { skillIds: ["t_def"] } }), { line: 1, carrier: "h_MF1" });
  const d1 = P(l1, "away", l1.duel.defenderId);
  l1.away.live[d1.id].gauge = 100;
  assert.equal(match.ultimateUsable(l1, data, "away", d1, "defense", "tackle").ok, true);
  assert.equal(match.aiWantsUltimate(l1, data, "away", d1, "defense", "tackle"), false, "line 1 은 게이지를 아낀다");
  l1.possession = l1.possessionsTotal - 1; // 남은 2
  assert.equal(match.aiWantsUltimate(l1, data, "away", d1, "defense", "tackle"), true, "마지막 2포제션");
});

/* ------------------------------------------------------------------ */
/* E3 · 팀 필살기                                                         */
/* ------------------------------------------------------------------ */

test("E3 팀 필살기 (공격): 이번 듀얼 ×teamMult (미리보기 = 실제, 한 번만) → 판정 뒤 possessionFx · 다음 듀얼에 붙음 · 체력 +teamStamina 는 판정 뒤", () => {
  const ms = place(mk({ MF1: { skillIds: ["t_team"] } }), { line: 1, carrier: "h_MF1", gauges: { h_MF1: 100 } });
  ms.home.live.h_MF1.stamina = 15; // 체력 20% 이하 → 판정 배율 0.8 (판정 뒤 +15 가 이번 듀얼에 섞이면 안 된다)
  ms.home.live.h_FW1.stamina = 50;
  ms.home.live.h_GK.stamina = 95;
  const v = match.getMatchView(ms, data);
  const uo = v.ultimateOptions.find((u) => u.skillId === "t_team");
  assert.equal(uo.usable, true);
  assert.deepEqual(Object.keys(uo.expectedPct).sort(), Object.keys(v.actions.filter((a) => a.enabled).reduce((o, a) => ((o[a.action] = 1), o), {})).sort(), "호환 = 전부");
  const { ms: c, ev, fresh } = forced(ms, { action: "dribble", ultimate: true }, true);
  assert.equal(pct(ev.p), uo.expectedPct.dribble, "미리보기 = 실제");
  assert.equal(factor(ev, "atk", "ultimate").mult, 1.08);
  assert.equal(factor(ev, "atk", "teamUlt"), null, "이번 듀얼은 fx 로만 — 두 번 곱하지 않는다");
  assert.equal(factor(ev, "atk", "stamina").mult, M.lowStaminaMult, "판정 때 체력 = 판정 전 체력");
  const info = fresh.find((e) => e.type === "teamUlt");
  assert.ok(info && fresh.indexOf(info) > fresh.indexOf(ev), "판정 이벤트 뒤 정보 이벤트");
  assert.ok(info.text.includes("팀 판정 ×1.08") && info.text.includes("체력 +15"));
  assert.deepEqual({ m: c.possessionFx.home.ultMult, id: c.possessionFx.home.teamUlt }, { m: 1.08, id: "t_team" });
  assert.equal(c.home.live.h_FW1.stamina, 65);
  assert.equal(c.home.live.h_GK.stamina, M.staminaMax, "상한");
  // 같은 포제션 다음 듀얼 (line 2): 팀 판정 ×1.08 이 붙는다
  assert.equal(c.attackingSide, "home");
  const o2 = match.computeOdds(c, data, { action: "dribble", defAction: "tackle", explain: true });
  assert.equal(factor(o2, "atk", "teamUlt").mult, 1.08);
  // 포제션당 1번
  c.home.live[c.ball.carrierId].gauge = 100;
  c.home.live.h_MF1.gauge = 100;
  assert.equal(match.ultimateUsable(c, data, "home", P(c, "home", "h_MF1"), "attack", null).reason, "이번 포제션에 이미 사용");
  // 포제션이 끝나면 1
  const { ms: c3 } = forced(c, { action: "dribble" }, false);
  assert.equal(c3.possessionFx.home.ultMult, undefined);
  assert.equal(c3.possessionFx.home.teamUlt, undefined);
});

test("E3 팀 필살기 (수비): 이번 듀얼 수비 ×teamMult · 뚫리면 상대 공격 포제션 동안 우리 수비에 붙음", () => {
  const ms = defenseScene("t_team");
  const v = match.getMatchView(ms, data);
  const uo = v.ultimateOptions.find((u) => u.skillId === "t_team");
  assert.equal(uo.usable, true);
  const { ms: c, ev } = forced(ms, { action: "intercept", ultimate: true }, true);
  assert.equal(pct(1 - ev.p), uo.expectedPct.intercept);
  assert.equal(factor(ev, "def", "ultimate").mult, 1.08);
  assert.equal(c.attackingSide, "away");
  assert.equal(c.possessionFx.home.ultMult, 1.08);
  const o2 = match.computeOdds(c, data, { action: "dribble", defAction: "hold", explain: true });
  assert.equal(factor(o2, "def", "teamUlt").mult, 1.08);
});

test("E3 AI: 지고 있을 때만 (동점 · 앞섬이면 남은 > 2 에서 안 씀) · 마지막 2포제션은 씀", () => {
  const ms = place(mk({}, { DF1: { skillIds: ["t_team"] } }), { atk: "away", line: 0, carrier: "a_DF1" });
  ms.away.live.a_DF1.gauge = 100;
  const df = P(ms, "away", "a_DF1");
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "dribble"), false, "동점");
  ms.score.away = 1;
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "pass"), false, "앞섬");
  ms.score = { home: 1, away: 0 };
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "dribble"), true, "지고 있음");
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "pass"), true);
  const d = ai.decideAttack(ms, data, "away");
  assert.equal(d.ultimate, true, "패스 · 드리블 어느 쪽이든 그 듀얼에 쓴다");
  ms.score = { home: 0, away: 0 };
  ms.possession = ms.possessionsTotal - 1;
  assert.equal(match.aiWantsUltimate(ms, data, "away", df, "attack", "dribble"), true, "마지막 2포제션");
});

/* ------------------------------------------------------------------ */
/* E4 · 필살 드리블                                                       */
/* ------------------------------------------------------------------ */

test("E4 필살 드리블 extraLine: line 0 → 2 (미리보기 = 실제) · line 2 → 박스 + 원터치 + 추가 전진 슛 +20%", () => {
  const ms = place(mk({ DF1: { skillIds: ["t_drib_x"] } }), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const v = match.getMatchView(ms, data);
  const uo = v.ultimateOptions.find((u) => u.skillId === "t_drib_x");
  assert.equal(uo.usable, true);
  assert.deepEqual(Object.keys(uo.expectedPct), ["dribble"], "호환 = 드리블");
  assert.equal(v.outcomesBySkill.t_drib_x.dribble.success.step, 2, "두 구역 미리보기");
  assert.equal(v.outcomes.dribble.success.step, 1);
  const { ms: c, ev } = forced(ms, { action: "dribble", ultimate: true }, true);
  assert.equal(pct(ev.p), uo.expectedPct.dribble);
  assert.equal(factor(ev, "atk", "ultimate").mult, 1.2);
  assert.equal(c.ball.lineIndex, 2);
  const ms2 = place(mk({ FW1: { skillIds: ["t_drib_x"] } }), { line: 2, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  const { ms: c2 } = forced(ms2, { action: "dribble", ultimate: true }, true);
  assert.deepEqual({ l: c2.ball.lineIndex, ot: c2.ball.oneTouch, x: c2.ball.extraLine }, { l: 3, ot: true, x: true });
  const o = match.computeOdds(c2, data, { action: "shoot", defAction: "save", explain: true });
  assert.equal(factor(o, "atk", "extraLine").mult, 1.2);
});

test("E4 필살 드리블: negateRead (드리블에만) · noStamina (성공만) · 막히면 역방향 컷인 '철벽 블록!' · 사유", () => {
  const ms = place(mk({ DF1: { skillIds: ["t_drib_n"] } }), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const plainT = match.computeOdds(ms, data, { action: "dribble", defAction: "tackle" });
  const ultT = match.computeOdds(ms, data, { action: "dribble", defAction: "tackle", fxA: fxWith("t_drib_n") });
  assert.equal(plainT.pairMult, M.readBonus);
  assert.deepEqual({ n: ultT.negate, m: ultT.pairMult }, { n: true, m: 1 });
  assert.equal(match.computeOdds(ms, data, { action: "pass", defAction: "intercept", fxA: fxWith("t_drib_n") }).negate, false, "패스에는 없음");
  // noStamina
  const s = place(mk({ DF1: { skillIds: ["t_drib"] } }), { line: 0, carrier: "h_DF1", gauges: { h_DF1: 100 } });
  const st0 = s.home.live.h_DF1.stamina;
  const { ms: ok } = forced(s, { action: "dribble", ultimate: true }, true);
  assert.equal(ok.home.live.h_DF1.stamina, st0, "성공 = 드리블 체력 0");
  const { ms: bad, ev } = forced(s, { action: "dribble", ultimate: true }, false);
  assert.ok(bad.home.live.h_DF1.stamina < st0, "실패 = 보통 소모");
  assert.deepEqual({ k: ev.reverseCutin.kind, x: ev.reverseCutin.text, u: ev.reverseCutin.ultimateType }, { k: "block", x: "철벽 블록!", u: "dribble" });
  // 사유
  const df = P(s, "home", "h_DF1");
  assert.equal(match.ultimateUsable(s, data, "home", df, "attack", "pass").reason, "드리블과 함께만");
  const box = place(mk({ FW1: { skillIds: ["t_drib"] } }), { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  assert.equal(match.ultimateUsable(box, data, "home", P(box, "home", "h_FW1"), "attack", null).reason, "박스에서는 드리블 없음");
});

test("E4 A안 성향: 필살 배율이 드리블 성향에 들어가 드리블이 1위가 되고 AI 가 그 듀얼에 필살 드리블을 쓴다", () => {
  const ms = place(mk({}, { MF1: { skillIds: ["t_drib"], stats: { pass: 420, dribble: 400 } } }), { atk: "away", line: 1, carrier: "a_MF1" });
  const t0 = match.tendencyValues(ms, data, "away");
  assert.ok(t0.pass > t0.dribble, "게이지 30 — 패스 1위");
  ms.away.live.a_MF1.gauge = 100;
  ms.duel.effects.away = skills.emptyDuelEffects();
  const t1 = match.tendencyValues(ms, data, "away");
  assert.ok(Math.abs(t1.dribble - t0.dribble * 1.3) < 1e-6);
  assert.ok(t1.dribble > t1.pass);
  const d = ai.decideAttack(ms, data, "away");
  assert.deepEqual({ a: d.action, u: d.ultimate }, { a: "dribble", u: true });
});

/* ------------------------------------------------------------------ */
/* E5 · 컷인 대사 · 등급                                                  */
/* ------------------------------------------------------------------ */

test("E5 cutin 이벤트에 line · tier, ultimateOptions 에 tier · cutinLine — 데이터에 없으면 키 없음 (옛 필살기)", () => {
  const ms = place(mk({ FW1: { skillIds: ["t_shot_box"] } }), { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  const uo = match.getMatchView(ms, data).ultimateOptions[0];
  assert.deepEqual({ t: uo.tier, l: uo.cutinLine }, { t: "SSR", l: ULTS.t_shot_box.cutinLine });
  const { fresh } = forced(ms, { action: "shoot", ultimate: true }, true);
  const cut = fresh.find((e) => e.type === "cutin");
  assert.deepEqual({ l: cut.line, t: cut.tier, u: cut.ultimateType }, { l: ULTS.t_shot_box.cutinLine, t: "SSR", u: "shot" });
  const old = place(mk({ FW1: { skillIds: ["sk_meteor_shot"] } }), { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  const { fresh: f2 } = forced(old, { action: "shoot", ultimate: true }, true);
  const c2 = f2.find((e) => e.type === "cutin");
  assert.equal("line" in c2, false);
  assert.equal("tier" in c2, false);
  assert.deepEqual({ t: match.getMatchView(place(old, { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } }), data).ultimateOptions[0].tier }, { t: null });
});

/* ------------------------------------------------------------------ */
/* L46 · 주장 1명분                                                       */
/* ------------------------------------------------------------------ */

test("L46 주장 2명 팀의 teamworkAmp = 주장 1명 팀 (teamworkPlus 최대 1명분) · 주장 0명은 그대로", () => {
  const t = (tw, caps) => {
    const tm = team("h", Object.fromEntries(caps.map((s) => [s, { trait: "captain" }])));
    tm.teamwork = tw;
    return tm;
  };
  const amp = (tw, caps) => match.teamworkAmp(t(tw, caps), data);
  assert.equal(amp(80, []), 1.2);
  assert.equal(amp(80, ["DF1"]), 1.2, "80 + 10 = 90");
  assert.equal(amp(80, ["DF1", "GK"]), amp(80, ["DF1"]), "주장 2명 = 1명 (합하면 100 → 1.3)");
  assert.equal(amp(90, ["DF1", "GK", "MF1"]), 1.3, "90 + 10 = 100");
  assert.equal(amp(50, []), 1);
  assert.equal(amp(50, ["DF1", "MF1"]), 1.1);
});

/* ------------------------------------------------------------------ */
/* 공통 · 결정성 · 불변식                                                  */
/* ------------------------------------------------------------------ */

const ALL7 = {
  GK: { skillIds: ["t_save_sure"] }, DF1: { skillIds: ["t_def"] }, DF2: { skillIds: ["t_drib_x"] },
  MF1: { skillIds: ["t_pass_plain"], trait: "crosser" }, MF2: { skillIds: ["t_team"] },
  FW1: { skillIds: ["t_shot_box"] }, FW2: { skillIds: ["t_drib"] },
};
const ALL7B = {
  GK: { skillIds: ["sk_boss_save"] }, DF1: { skillIds: ["t_team"] }, DF2: { skillIds: ["t_def"] },
  MF1: { skillIds: ["t_pass_x"] }, MF2: { skillIds: ["t_pass_c"], trait: "crosser" },
  FW1: { skillIds: ["t_shot_head"] }, FW2: { skillIds: ["t_drib_n"] },
};

test("공통: 결정성 (같은 seed → 같은 이벤트 · rngState) · JSON 왕복 · 뷰 · AI · 미리보기가 rngState 를 바꾸지 않음", () => {
  const a = mk(ALL7, ALL7B, { seed: "ult-det", possessions: 12 });
  const b = mk(ALL7, ALL7B, { seed: "ult-det", possessions: 12 });
  match.simulateAuto(a, data);
  match.simulateAuto(b, data);
  assert.deepEqual(a.events, b.events);
  assert.equal(a.rngState, b.rngState);
  // 중간 JSON 왕복
  const c = mk(ALL7, ALL7B, { seed: "ult-det", possessions: 12 });
  for (let i = 0; i < 15 && !c.finished; i++) {
    const r0 = c.rngState;
    const snap = JSON.stringify(c);
    match.getMatchView(c, data);
    if (c.phase === "decision" && c.duel) {
      ai.decideAttack(c, data, c.attackingSide);
      if (c.ball.lineIndex < 3) ai.decideDefense(c, data, c.attackingSide === "home" ? "away" : "home");
      match.aceCallFor(c, data);
    }
    assert.equal(c.rngState, r0);
    assert.equal(JSON.stringify(c), snap, "뷰 · AI · 미리보기는 상태를 바꾸지 않는다");
    match.step(c, data, null);
  }
  const d = JSON.parse(JSON.stringify(c));
  match.simulateAuto(c, data);
  match.simulateAuto(d, data);
  const js = (x) => JSON.stringify(x.events);
  assert.equal(js(c), js(d), "JSON 왕복 뒤 같은 진행");
  assert.equal(js(c), js(a), "뷰 · AI 를 불러도 같은 진행");
  assert.equal(c.rngState, a.rngState);
});

test("공통: 7명 모두 필살기(6종 섞음) 팀 500판 simulateAuto 불변식 (게이지 0~100 · 체력 · 텐션 · p 범위 · NaN 없음) · 새 종류가 실제로 쓰인다", () => {
  const seen = new Set();
  let teamUlt = 0;
  let sure = 0;
  for (let i = 0; i < 500; i++) {
    const ms = mk(i % 2 ? ALL7 : ALL7B, i % 2 ? ALL7B : ALL7, { seed: `ult-inv-${i}`, possessions: 8 });
    match.simulateAuto(ms, data);
    assert.equal(ms.finished, true);
    for (const side of ["home", "away"]) {
      for (const [pid, lv] of Object.entries(ms[side].live)) {
        assert.ok(Number.isFinite(lv.stamina) && lv.stamina >= 0 && lv.stamina <= M.staminaMax, `${pid} 체력 ${lv.stamina}`);
        if (lv.gauge != null) assert.ok(Number.isFinite(lv.gauge) && lv.gauge >= 0 && lv.gauge <= UC.gaugeMax, `${pid} 게이지 ${lv.gauge}`);
      }
      const tn = ms[side].tension;
      assert.ok(Number.isFinite(tn) && tn >= 0 && tn <= M.tension.max);
    }
    for (const e of ms.events) {
      if (e.p != null) assert.ok(Number.isFinite(e.p) && e.p >= M.minP - 1e-9 && e.p <= (e.sure ? 1 : M.maxP) + 1e-9, `p ${e.p}`);
      if (e.type === "cutin") seen.add(e.ultimateType);
      if (e.type === "teamUlt") teamUlt++;
      if (e.sure) sure++;
      if (e.type === "combo") assert.ok(["뇌우", "물살 연계", "바람의 유성"].includes(e.name), `등록된 합체기만: ${e.name}`);
    }
  }
  for (const t of skills.ULTIMATE_TYPES) assert.ok(seen.has(t), `필살기 종류 ${t} 가 쓰였다`);
  assert.ok(teamUlt > 0 && sure > 0);
});
