// test/ultimates.test.mjs — LESSON_PROTO_PLAN §19 (K1): 필살기 6종 · E0 공통 기반 · E1 합체기는 등록된 짝만 ·
// E2 필살 수비 · E3 팀 필살기 · E4 필살 드리블 · E5 컷인 대사 · L46 주장 1명분.
// 테스트용 필살기는 데이터 사본(data.skills · data.combos)에 넣는다 (K1). 끝의 "K2 데이터" 묶음은 실제 skills · characters · combos · supports · cards 를 본다 (§19.10 ~ §19.12).
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
  // 실제 데이터 (K2): 메테오 슛 = SSR · 대사
  const real = place(mk({ FW1: { skillIds: ["sk_meteor_shot"] } }), { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } });
  const c1 = forced(real, { action: "shoot", ultimate: true }, true).fresh.find((e) => e.type === "cutin");
  assert.deepEqual({ l: c1.line, t: c1.tier }, { l: "땅이 먼저 울릴 거야.", t: "SSR" });
  // 옛 필살기 (tier · cutinLine 없는 데이터 사본): 키 없음 · ultimateOptions tier null
  const dOld = clone(data);
  const om = dOld.skills.find((s) => s.id === "sk_meteor_shot").ultimate;
  delete om.tier;
  delete om.cutinLine;
  const old = place(mk({ FW1: { skillIds: ["sk_meteor_shot"] } }, {}, { data: dOld }), { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } }, dOld);
  const { fresh: f2 } = forced(old, { action: "shoot", ultimate: true }, true, dOld);
  const c2 = f2.find((e) => e.type === "cutin");
  assert.equal("line" in c2, false);
  assert.equal("tier" in c2, false);
  assert.deepEqual({ t: match.getMatchView(place(old, { line: 3, carrier: "h_FW1", gauges: { h_FW1: 100 } }, dOld), dOld).ultimateOptions[0].tier }, { t: null });
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

/* ------------------------------------------------------------------ */
/* K2 · 실제 데이터 (§19.10 ~ §19.12)                                     */
/* ------------------------------------------------------------------ */

/** §19.10 필살기 표 — id → [주인 charId | null(상대), 이름, ultimate] */
const ULT_TABLE = {
  sk_high_tide: ["ch_spirit_keeper", "만조의 장벽", { type: "save", saveMult: 1.6, tier: "SR", cutinLine: "파도야, 골문을 지켜 줘." }],
  sk_mountain_wedge: ["ch_dwarf_wall", "산맥 쐐기", { type: "defense", defense: 1.6, noMissPenalty: true, tier: "SR", cutinLine: "여기서부터는 산이다." }],
  sk_flame_command: ["ch_human_captain", "불꽃 호령", { type: "team", teamMult: 1.08, teamStamina: 15, tier: "R", cutinLine: "다들, 아직 안 끝났어!" }],
  sk_wind_thread: ["ch_elf_playmaker", "바람의 실", { type: "pass", attack: 1.5, negateRead: true, nextDuelBonus: 0.5, receiverGauge: 50, tier: "SSR", cutinLine: "바람이 길을 알려 줄 거야." }],
  sk_lightning_dash: ["ch_human_runner", "번개 질주", { type: "dribble", attack: 1.3, noStamina: true, tier: "R", cutinLine: "아직 한참 더 뛸 수 있어!" }],
  sk_prairie_gale: ["ch_wolf_winger", "초원의 질풍", { type: "pass", attack: 1.5, negateRead: true, tier: "SR", cutinLine: "따라올 수 있으면 와 봐!" }],
  sk_meteor_shot: ["ch_giant_striker", "메테오 슛", { type: "shot", shoot: 2, gkMult: 0.7, boxShot: true, stamina: 10, tier: "SSR", cutinLine: "땅이 먼저 울릴 거야." }],
  sk_alley_cat_step: ["ch_cat_trickster", "골목 고양이 스텝", { type: "dribble", attack: 1.25, negateRead: true, tier: "R", cutinLine: "힘으로는 못 잡아, 냐." }],
  sk_earth_palm: ["ch_giant_keeper", "대지의 손바닥", { type: "save", saveMult: 2, sureDistribution: true, tier: "SSR", cutinLine: "전원 앞으로! 공은 내가 보낸다." }],
  sk_thunderbolt: ["ch_spirit_striker", "낙뢰", { type: "shot", shoot: 1.8, gkMult: 0.6, minLine: 3, stamina: 10, tier: "SSR", cutinLine: "번쩍— 이미 들어갔어." }],
  sk_deep_current: ["ch_elf_regista", "심해 물길", { type: "pass", attack: 1.5, actions: ["pass"], extraLine: true, tier: "SR", cutinLine: "거리, 계산 끝났어요." }],
  sk_moon_hop: ["ch_rabbit_fullback", "달토끼 도약", { type: "dribble", attack: 1.2, extraLine: true, tier: "R", cutinLine: "무, 무서워도 뛴다!" }],
  sk_rapids: ["ch_spirit_dribbler", "급류", { type: "dribble", attack: 1.6, negateRead: true, tier: "SR", cutinLine: "흐르는 물은 못 막아." }],
  sk_lightning_arrow: ["ch_elf_archer", "뇌전 화살", { type: "pass", attack: 1.5, actions: ["cross"], nextDuelBonus: 0.3, tier: "SR", cutinLine: "과녁은 저 머리 위." }],
  sk_sky_header: ["ch_human_header", "하늘 가르기", { type: "shot", shoot: 1.3, minLine: 3, headerMult: 1.1, tier: "R", cutinLine: "공중볼은 전부 내 거야!" }],
  sk_forge_finish: ["ch_dwarf_finisher", "담금질 일격", { type: "shot", shoot: 1.3, gkMult: 0.9, minLine: 3, tier: "R", cutinLine: "이건 내 최고 작품이야." }],
  sk_boss_strike: [null, "업화의 일격", { type: "shot", shoot: 2, gkMult: 0.7, boxShot: true, stamina: 10, tier: "SSR", cutinLine: "다 태워 버려!" }],
  sk_boss_save: [null, "불꽃 장벽", { type: "save", saveMult: 2, tier: "SSR", cutinLine: "불꽃이 골문을 막는다." }],
};

/** §19.2 주 배율 · 추가 개수 (shot 의 gkMult 는 주 배율, 제한 · 비용 minLine · actions · stamina 는 추가가 아니다) */
function ultPower(u, onReceive) {
  const main = u.type === "shot" ? (u.shoot ?? 1) / (u.gkMult ?? 1)
    : u.type === "pass" || u.type === "dribble" ? (u.attack ?? 1)
      : u.type === "save" ? (u.saveMult ?? 1)
        : u.type === "defense" ? (u.defense ?? 1)
          : (u.teamMult ?? 1);
  const extras = [
    u.negateRead === true, (u.nextDuelBonus ?? 0) > 0, u.extraLine === true, u.noStamina === true, u.noMissPenalty === true,
    u.sureDistribution === true, (u.teamStamina ?? 0) > 0, u.headerMult != null && u.headerMult !== 1, u.boxShot === true,
    u.receiverGauge != null && u.receiverGauge > onReceive,
  ].filter(Boolean).length;
  return { main, extras };
}

const TYPE_HEAD = { shot: "필살 슛", pass: "필살 패스", save: "필살 세이브", defense: "필살 수비", team: "팀 필살기", dribble: "필살 드리블" };

test("K2 데이터: 필살기 18개 = §19.10 표 (이름 · 종류 · 인자 · 등급 · 대사) · 모두 tier · cutinLine · validateUltimates 통과 · 공통 필드", () => {
  const real = loadData();
  const ults = real.skills.filter((s) => s.ultimate);
  assert.deepEqual(ults.map((s) => s.id).sort(), Object.keys(ULT_TABLE).sort());
  assert.doesNotThrow(() => skills.validateUltimates(real));
  for (const s of ults) {
    const [, name, u] = ULT_TABLE[s.id];
    assert.equal(s.name, name, s.id);
    assert.deepEqual(s.ultimate, u, `${s.id} 인자`);
    assert.deepEqual(skills.ultimateErrors(s), [], s.id);
    assert.ok(skills.ULTIMATE_TIERS.includes(s.ultimate.tier), `${s.id} tier`);
    assert.ok(typeof s.ultimate.cutinLine === "string" && s.ultimate.cutinLine.length >= 1 && s.ultimate.cutinLine.length <= skills.CUTIN_LINE_MAX, `${s.id} cutinLine`);
    assert.deepEqual([s.kind, s.learnable, s.cost, s.tension, s.passive, s.active], ["unique", false, 0, 0, null, null], `${s.id} 공통 필드`);
    if (s.ultimate.type === "save") assert.deepEqual(s.positions, ["GK"], `${s.id} GK 필살기`);
    assert.ok(s.description.startsWith(`${TYPE_HEAD[s.ultimate.type]}: `), `${s.id} 설명 머리 '${s.description}'`);
  }
});

test("K2 데이터: 16명 모두 innateSkillId = 자기 필살기 (서로 다름) · tier = 캐릭터 rarity · 등급 상한 (§19.2) · SSR 필드 선수는 합체기에", () => {
  const real = loadData();
  const onReceive = real.config.match.ultimate.onReceive;
  assert.equal(real.characters.length, 16);
  const S = Object.fromEntries(real.skills.map((s) => [s.id, s]));
  assert.equal(new Set(real.characters.map((c) => c.innateSkillId)).size, 16, "필살기는 서로 다르다");
  const combos = readJson("combos");
  for (const c of real.characters) {
    const s = S[c.innateSkillId];
    assert.ok(s && s.kind === "unique" && s.ultimate, `${c.name}: 고유 = 필살기`);
    assert.equal(ULT_TABLE[s.id][0], c.id, `${c.name}: §19.10 주인`);
    assert.equal(s.ultimate.tier, c.rarity, `${c.name}: tier = rarity`);
    const { main, extras } = ultPower(s.ultimate, onReceive);
    const tag = `${c.name} ${s.name} (주 ×${main.toFixed(3)} · 추가 ${extras})`;
    if (c.rarity === "R") {
      if (s.ultimate.type === "team") assert.ok(main >= 1.05 && main <= 1.1 + 1e-9, tag);
      else assert.ok(main >= 1.15 - 1e-9 && main <= 1.45 + 1e-9, tag);
      assert.ok(extras <= 1, tag);
    } else if (c.rarity === "SR") {
      assert.ok(main >= 1.45 - 1e-9 && main <= 1.7 + 1e-9, tag);
      assert.ok(extras <= 1, tag);
    } else {
      assert.ok(main >= 1.9 - 1e-9 || (s.ultimate.type === "pass" && extras >= 2), tag);
      if (c.aptitude.GK !== "A") assert.ok(combos.some((x) => x.a === s.id || x.b === s.id), `${tag}: SSR 필드 선수는 합체기에 (§19.18 Q1 — GK 제외)`);
    }
  }
  // 상대 보스 필살기도 SSR 범위
  for (const id of ["sk_boss_strike", "sk_boss_save"]) assert.ok(ultPower(S[id].ultimate, onReceive).main >= 1.9, id);
});

test("K2 데이터: 새 8명 = 초안 그대로 (§19.12 ① 이름 · 레어도 · 원소 · 스타일 · 특성 · 스탯 합 · A 적성 1개) · 기존 6명 필살기 교체 · 주장 1명분", () => {
  const real = loadData();
  const C = Object.fromEntries(real.characters.map((c) => [c.id, c]));
  const NEW8 = {
    ch_giant_keeper: ["헤르타", "SSR", "earth", "power", "captain", 1420, "GK"],
    ch_spirit_striker: ["브론테", "SSR", "lightning", "speed", "finisher", 1380, "FW"],
    ch_elf_regista: ["나엘리스", "SR", "water", "technique", "killpass", 1210, "DF"],
    ch_rabbit_fullback: ["코니", "R", "earth", "speed", "runner", 960, "DF"],
    ch_spirit_dribbler: ["온디나", "SR", "water", "speed", "carrier", 1190, "MF"],
    ch_elf_archer: ["리시엘", "SR", "lightning", "technique", "crosser", 1160, "MF"],
    ch_human_header: ["카밀라", "R", "wind", "power", "targetman", 990, "FW"],
    ch_dwarf_finisher: ["힐디", "R", "fire", "technique", "finisher", 970, "FW"],
  };
  assert.deepEqual(real.characters.slice(8).map((c) => c.id), Object.keys(NEW8), "초안 순서로 뒤에 붙인다");
  for (const [id, [name, rarity, element, style, trait, sum, aPos]] of Object.entries(NEW8)) {
    const c = C[id];
    assert.deepEqual([c.name, c.rarity, c.element, c.style, c.trait], [name, rarity, element, style, trait], id);
    assert.equal(Object.values(c.baseStats).reduce((a, b) => a + b, 0), sum, `${name} 스탯 합`);
    assert.deepEqual(Object.entries(c.aptitude).filter(([, v]) => v === "A").map(([k]) => k), [aPos], `${name} A 적성`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(c.portraitColor) && c.bio.length > 10, `${name} 색 · 소개`);
  }
  const SWAP = { ch_spirit_keeper: "sk_high_tide", ch_dwarf_wall: "sk_mountain_wedge", ch_human_captain: "sk_flame_command", ch_human_runner: "sk_lightning_dash", ch_wolf_winger: "sk_prairie_gale", ch_cat_trickster: "sk_alley_cat_step" };
  for (const [id, sk] of Object.entries(SWAP)) assert.equal(C[id].innateSkillId, sk, C[id].name);
  assert.equal(C.ch_elf_playmaker.innateSkillId, "sk_wind_thread");
  assert.equal(C.ch_giant_striker.innateSkillId, "sk_meteor_shot");
  // 주장 설명 = 1명분 (L46), params 그대로 — 헤르타 + 아델린 편성의 경기 팀워크 증폭 = 주장 1명
  const cap = readJson("traits").find((t) => t.id === "captain");
  assert.ok(cap.description.includes("1명분"));
  assert.deepEqual(cap.params, { teamworkPlus: 10 });
  assert.deepEqual(real.characters.filter((c) => c.trait === "captain").map((c) => c.name), ["아델린", "헤르타"]);
});

test("K2 데이터: 합체기 5개 (§19.11) — a = 필살 패스, b = 받은 뒤 공격 종류, 짝 중복 없음, 이름 1~8자, 바람의 유성이 맨 앞", () => {
  const real = loadData();
  const S = Object.fromEntries(real.skills.map((s) => [s.id, s]));
  const combos = readJson("combos");
  assert.deepEqual(combos.map((c) => [c.a, c.b, c.name]), [
    ["sk_wind_thread", "sk_meteor_shot", "바람의 유성"],
    ["sk_wind_thread", "sk_thunderbolt", "풍뢰일섬"],
    ["sk_deep_current", "sk_thunderbolt", "뇌우"],
    ["sk_lightning_arrow", "sk_sky_header", "하늘 과녁"],
    ["sk_lightning_arrow", "sk_meteor_shot", "뇌명 유성"],
  ]);
  assert.equal(new Set(combos.map((c) => `${c.a}>${c.b}`)).size, combos.length);
  for (const c of combos) {
    assert.equal(S[c.a].ultimate.type, "pass", `${c.name} a`);
    assert.ok(["shot", "pass", "dribble", "team"].includes(S[c.b].ultimate.type), `${c.name} b`);
    assert.ok(c.name.length >= 1 && c.name.length <= 8, c.name);
    assert.equal(match.comboName(real, c.a, c.b), c.name);
  }
  // 등록되지 않은 짝 (울리카 초원의 질풍 → 그레타) = 합체기 없음
  assert.equal(match.comboName(real, "sk_prairie_gale", "sk_meteor_shot") ?? null, null);
});

test("K2 데이터: 옛 고유 6개 = 배울 수 있는 스킬 (id · 효과 그대로) · 코치 힌트 목록 맨 뒤 (§19.12 ②③) · 액티브 2개는 코치 수업", () => {
  const real = loadData();
  const S = Object.fromEntries(real.skills.map((s) => [s.id, s]));
  const OLD = {
    sk_tide_wall: ["passive", 180, ["GK"], "sp_river_scholar"],
    sk_captain_call: ["passive", 140, null, "sp_bard_lumi"],
    sk_tireless: ["passive", 120, null, "sp_mountain_monk"],
    sk_feint: ["passive", 100, ["FW", "MF"], "sp_street_striker"],
    sk_iron_tackle: ["active", 130, null, "sp_iron_captain"],
    sk_line_breaker: ["active", 140, null, "sp_wind_dancer"],
  };
  for (const [id, [kind, cost, positions, coach]] of Object.entries(OLD)) {
    const s = S[id];
    assert.deepEqual([s.kind, s.learnable, s.cost, s.positions, s.ultimate], [kind, true, cost, positions, null], id);
    const sp = real.supports.find((x) => x.id === coach);
    assert.equal(sp.hintSkillIds.at(-1), id, `${id} → ${sp.name} 힌트 목록 맨 뒤`);
    assert.equal(real.supports.filter((x) => x.hintSkillIds.includes(id)).length, 1, `${id} 코치 1명`);
    assert.ok(!real.characters.some((c) => c.innateSkillId === id), `${id} 는 더 이상 고유가 아니다`);
  }
  assert.deepEqual(S.sk_iron_tackle.active.params, { defense: 1.4, noMissPenalty: true });
  assert.equal(S.sk_line_breaker.active.effect, "extraLine");
  // 코치 힌트 목록의 스킬은 모두 배울 수 있다
  for (const sp of real.supports) for (const id of sp.hintSkillIds) assert.equal(S[id].learnable, true, `${sp.name} ${id}`);
});

test("K2 데이터: 고유 카드 16장 = 캐릭터마다 1장 (§19.12 ⑥) · 새 8장 이름 · 공통 필드 · validateCardsData", async () => {
  const cardsEng = await import("../js/engine/cards.js");
  const real = loadData();
  assert.equal(cardsEng.validateCardsData(real), true);
  const uniq = real.cards.cards.filter((c) => c.family === "unique");
  assert.equal(uniq.length, 16);
  assert.deepEqual(real.characters.map((c) => uniq.filter((u) => u.ownerCharId === c.id).length), Array(16).fill(1), "캐릭터마다 고유 1장");
  const NAMES = { cd_u_herta: "골문 앞 허들", cd_u_bronte: "번개 원터치", cd_u_naelis: "물길 롱패스", cd_u_ondina: "물살 타기", cd_u_risiel: "과녁 크로스", cd_u_coni: "토끼굴 오버래핑", cd_u_camila: "공중볼 경합", cd_u_hildi: "담금질 슈팅" };
  for (const [id, name] of Object.entries(NAMES)) {
    const c = uniq.find((u) => u.id === id);
    assert.equal(c.name, name, id);
    assert.deepEqual([c.start, c.pool, c.target, c.costRate, c.exhaust], [false, false, { kind: "owner" }, 0.4, false], id);
    assert.equal(c.plus.power, Math.round(c.power * 1.25), `${id}+ = round(×1.25)`);
  }
});
