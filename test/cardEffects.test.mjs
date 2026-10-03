// test/cardEffects.test.mjs — 엔진 감사 (ENGINE AUDIT): 68장 카드마다 통제된 상태에서 1장을 내고 핵심 효과를 확인한다.
// 기준: LESSON_PROTO_PLAN §14.7 · §14.9 · §14.10 (구역 방식 — 대상 · 1인 위력 · 비용 · effects · 강화판 · 코치 구역 ×1.3 · 유대 80판 · 대비 구역 ×1.5).
// 상태: 기본 편성 2-2-2 (p1 GK 네리아 · p2/p3 DF 도르비나/아델린 · p4/p5 MF 실루엔/타리아 · p6/p7 FW 울리카/그레타),
//       고정 구역 (수비 p1 p2 · 피지컬 p3 · 패스 p4 p5 · 슈팅 p6 · 드리블 p7 — 케이스마다 layout 으로 바꿀 수 있다),
//       중점 구역 = focus (기본 "shoot", 그 구역 대상은 ×1.5), 컨디션 2 (×1.0), modifier 없음, 체력 100,
//       실패 판정이 나지 않는 rng 상태 (SAFE), 손패 = [그 카드, 채움 2장], 사용 2회 (턴이 끝나지 않는다 — 기본 훈련이 섞이지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, run } from "./helpers.mjs";
import * as lesson from "../js/engine/lesson.js";
import * as cards from "../js/engine/cards.js";
import { createRngFromState } from "../js/engine/rng.js";

const data = loadData();
// 카드 1장의 효과만 본다 — 코치 지원 붙기(§15)는 끈다 (붙기는 lesson.test 가 본다, §15.13)
data.lesson.attach.enabled = false;
const R = cards.roundCost;
const GS = data.lesson.lesson.cardGainScale;
const SAFE = (() => {
  for (let s = 1; s < 100000; s++) if (createRngFromState(s).next() >= 0.96) return s;
  throw new Error("SAFE rng");
})();
const FILL = ["cd_basic", "cd_basic"];
const MIRKA_SQUAD = { ...data.config.defaultSquad.slots, MF2: "ch_cat_trickster" };
const ALL7 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
const LAYOUT = { p1: "defense", p2: "defense", p3: "physical", p4: "pass", p5: "pass", p6: "shoot", p7: "dribble" };
const C = data.lesson.zones.centers;
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** 자주 쓰는 놓을 점 */
const AT = {
  pass: C.pass, // 중간 원 → p4 p5 (작은 원도 두 사람 사이라 p4 p5)
  defense: C.defense, // → p1 p2
  defPhys: mid(C.defense, C.physical), // 큰 원 → p1 p2 p3
  passDrib: mid(C.pass, C.dribble), // 큰 원 → p4 p5 p7
};
const DEF3 = ["p1", "p2", "p3"];
const ATT3 = ["p4", "p5", "p7"];

/**
 * 카드 1장을 통제된 상태에서 낸다.
 * @returns {{ s, L, uid, before: { stats, stamina, teamwork, bonds }, pv }}
 */
function playOne(c) {
  const roster = run.buildRoster({ data, squad: c.squad });
  const raw = cards.getCard(data, c.id);
  const prep = raw.family === "prep";
  const deckIds = prep ? FILL.slice() : [c.id, ...FILL];
  const s = {
    kind: "lessonRun", version: 1, seed: "audit", rngState: 1,
    phase: "lesson", season: 1, turn: 1, turnIndex: 0, policy: c.policy || "team", formation: roster.formation,
    players: roster.players, supports: roster.supports.concat(c.addSupports || []),
    condition: 2, teamwork: 0, skillPoints: 0, trainingPoints: 0, hints: {}, relics: [], modifiers: [],
    deck: deckIds.map((cardId, i) => ({ uid: `k${i + 1}`, cardId, plus: i === 0 && !prep && !!c.plus })), nextUid: deckIds.length + 1,
    lesson: null, log: [],
  };
  for (const st of s.supports) if (c.bond !== undefined) st.bond = c.bond;
  lesson.startLesson(s, data, { zone: c.focus || "shoot", prepCards: prep ? [c.id] : [] });
  const L = s.lesson;
  L.zones = { ...LAYOUT, ...(c.layout || {}) };
  const uid = prep ? "t1" : "k1";
  const fill = ["k1", "k2", "k3"].filter((u) => u !== uid).slice(0, 2);
  for (const pile of ["drawPile", "discard", "hand"]) L[pile] = L[pile].filter((u) => u !== uid && !fill.includes(u));
  L.hand = [uid, ...fill];
  L.playsLeft = 2;
  if (c.setup) c.setup(s, L);
  s.rngState = SAFE;
  const before = {
    stats: Object.fromEntries(s.players.map((p) => [p.id, { ...p.stats }])),
    stamina: Object.fromEntries(s.players.map((p) => [p.id, p.stamina])),
    teamwork: s.teamwork,
    bonds: Object.fromEntries(s.supports.map((x) => [x.id, x.bond])),
    turn: L.turn,
    score: L.score,
  };
  const args = { uid, at: c.at, playerId: c.playerId };
  const pv = lesson.previewCard(s, data, args);
  lesson.playCard(s, data, args);
  return { s, L: s.lesson, uid, before, pv };
}

const P = (s, id) => s.players.find((p) => p.id === id);

/**
 * 표 항목 하나를 검사한다.
 *   T: 상승 대상 (슬롯 순서), per: 1인 위력 (숫자 또는 대상별 배열), mult: 모든 대상 배율, zm: { 구역: 배율 } (코치 ×1.3 · 대비 ×1.5),
 *   중점 구역 대상은 자동으로 ×1.5, 상승 = round(per × 성장률[서 있는 구역] × 배율 × 0.64)
 *   cost: 1인 비용 (숫자 또는 배열), selfHeal: { id: 카드 효과로 그 대상이 받은 회복 }
 *   extra: 그 뒤 사용 횟수 = 1 + extraPlay (기본 0) · check(r): 카드 고유 효과
 */
function runCase(c) {
  const r = playOne(c);
  const { s, L, before, pv } = r;
  const label = `${c.id}${c.plus ? "+" : ""}${c.bond !== undefined ? ` bond ${c.bond}` : ""} [${c.policy || "team"}]`;
  assert.equal(pv.ok, true, `${label}: preview ${pv.reason}`);
  assert.equal(L.status, "playing", label);
  assert.equal(L.turn, before.turn, `${label}: 턴이 끝나면 안 된다`);
  assert.equal(L.stats.fails, 0, label);
  const T = c.T || [];
  assert.deepEqual(pv.targets.map((t) => t.id), T, `${label}: 대상`);
  const zoneOf = (id) => ({ ...LAYOUT, ...(c.layout || {}) })[id];
  const focus = c.focus || "shoot";
  let sum = 0;
  T.forEach((id, i) => {
    const p = P(s, id);
    const z = zoneOf(id);
    const sub = data.config.training.subStatMap[z];
    const per = Array.isArray(c.per) ? c.per[i] : c.per;
    const mult = (c.mult ?? 1) * ((c.zm && c.zm[z]) || 1) * (z === focus ? 1.5 : 1);
    const g = R(per * p.growth[z] * mult * GS);
    assert.equal(p.stats[z] - before.stats[id][z], g, `${label}: ${id} 상승 (${z} · 1인 ${per} × M ${mult})`);
    assert.equal(p.stats[sub] - before.stats[id][sub], R(g * 0.36 * p.growth[sub]), `${label}: ${id} 부 스탯`);
    const cost = Array.isArray(c.cost) ? c.cost[i] : c.cost;
    const healAfter = c.selfHeal && c.selfHeal[id] ? c.selfHeal[id] : 0;
    assert.equal(before.stamina[id] - P(s, id).stamina + healAfter, cost, `${label}: ${id} 비용`);
    sum += g;
  });
  for (const p of s.players) {
    if (T.includes(p.id)) continue;
    for (const k of Object.keys(p.stats)) assert.equal(p.stats[k], before.stats[p.id][k], `${label}: 대상 밖 ${p.id}.${k} 은 오르지 않는다`);
  }
  assert.equal(L.score - before.score, sum, `${label}: 점수`);
  assert.equal(L.playsLeft, 1 + (c.extra || 0), `${label}: 남은 사용 (추가 사용 ${c.extra || 0})`);
  for (const id of T) assert.equal(L.targeted[id], 1, `${label}: targeted ${id}`);
  if (!T.length) assert.deepEqual(L.targeted, {}, `${label}: 대상 없는 카드는 대상으로 세지 않는다`);
  if (c.check) c.check(r, label);
  return r;
}

const buffIs = (expected) => ({ L }, label) => {
  for (const [k, v] of Object.entries(expected)) assert.equal(L.buffs[k], v, `${label}: buff ${k}`);
};
const twGain = (n) => ({ s, before }, label) => assert.equal(s.teamwork - before.teamwork, n, `${label}: 팀워크 +${n}`);
const both = (...fs) => (r, label) => fs.forEach((f) => f(r, label));
const healed = (ids, n) => ({ s, before }, label) => {
  for (const id of ids) assert.equal(P(s, id).stamina - before.stamina[id], n, `${label}: ${id} 체력 ${n >= 0 ? "+" : ""}${n}`);
};
const setStamina = (ids, v) => (s) => ids.forEach((id) => (P(s, id).stamina = v));
const drawNextIs = (n) => ({ L }, label) => assert.equal(L.drawNext, n, `${label}: 다음 턴 손패 +${n}`);
const coachBond = (supportId, gain) => ({ s, before }, label) =>
  assert.equal(s.supports.find((x) => x.id === supportId).bond - before.bonds[supportId], gain, `${label}: 유대 +${gain}`);

// ---------------------------------------------------------------------------
// 68장 표 (기본판 · 강화판). 비용은 강화 전 기본 카드 기준 1인당 (D12 · §14.7 4번).
// ---------------------------------------------------------------------------
const CASES = [
  // ── 공용 15 ──
  { id: "cd_basic", T: ALL7, per: 6, cost: 4, check: twGain(6) },
  { id: "cd_basic", plus: true, T: ALL7, per: 8, cost: 4 },
  { id: "cd_coaching", playerId: "p4", T: ["p4"], per: 35, cost: 21 },
  { id: "cd_coaching", plus: true, playerId: "p4", T: ["p4"], per: 44, cost: 21 },
  { id: "cd_cooldown", playerId: "p4", setup: setStamina(["p4"], 50), extra: 1, check: healed(["p4"], 20) },
  { id: "cd_cooldown", plus: true, playerId: "p4", setup: setStamina(["p4"], 50), extra: 1, check: healed(["p4"], 30) },
  { id: "cd_fw_drill", at: AT.pass, T: ["p4", "p5"], per: 18, cost: 11, check: twGain(1) },
  { id: "cd_fw_drill", plus: true, at: AT.pass, T: ["p4", "p5"], per: 23, cost: 11 },
  { id: "cd_mf_drill", at: AT.defense, T: ["p1", "p2"], per: 18, cost: 11 },
  { id: "cd_mf_drill", plus: true, at: AT.defense, T: ["p1", "p2"], per: 23, cost: 11 },
  { id: "cd_df_drill", at: AT.defense, T: ["p1", "p2"], per: 18, cost: 11 },
  { id: "cd_df_drill", plus: true, at: AT.defense, T: ["p1", "p2"], per: 23, cost: 11 },
  { id: "cd_gk_session", at: AT.defense, T: ["p1", "p2"], per: 17, cost: 10 },
  { id: "cd_gk_session", plus: true, at: AT.defense, T: ["p1", "p2"], per: 21, cost: 10 },
  { id: "cd_attack_build", at: AT.passDrib, T: ATT3, per: 15, cost: 9, check: twGain(2) },
  { id: "cd_attack_build", plus: true, at: AT.passDrib, T: ATT3, per: 19, cost: 9 },
  { id: "cd_defense_org", at: AT.defPhys, T: DEF3, per: 15, cost: 9, check: twGain(2) },
  { id: "cd_defense_org", plus: true, at: AT.defPhys, T: DEF3, per: 19, cost: 9 },
  { id: "cd_one_two", at: AT.pass, T: ["p4", "p5"], per: 20, cost: 12, check: twGain(1 + 2) },
  { id: "cd_one_two", plus: true, at: AT.pass, T: ["p4", "p5"], per: 25, cost: 12, check: twGain(3) },
  // 2인 1조 드릴 (§15.7): 작은 원 2명 → 팀워크 L10 +1, 1명만 잡히면 합계 위력 · 비용 모두 1명 몫
  { id: "cd_pair_drill", at: AT.pass, T: ["p4", "p5"], per: 22, cost: 13, check: twGain(1) },
  { id: "cd_pair_drill", plus: true, at: AT.pass, T: ["p4", "p5"], per: 28, cost: 13 },
  { id: "cd_pair_drill", at: C.shoot, T: ["p6"], per: 22, cost: 13, check: twGain(0) },
  // 짝 스트레칭: 비용 8 · 대상 체력 +10 (강화 +12) → 대상 1인 순 +2 (+4), 대상 밖은 회복 없음 (heal to targets)
  { id: "cd_pair_stretch", at: AT.pass, T: ["p4", "p5"], per: 14, cost: 8, setup: setStamina(ALL7, 50), selfHeal: { p4: 10, p5: 10 },
    check: both(healed(["p4", "p5"], 2), healed(["p1", "p2", "p3", "p6", "p7"], 0), twGain(1)) },
  { id: "cd_pair_stretch", plus: true, at: AT.pass, T: ["p4", "p5"], per: 18, cost: 8, setup: setStamina(ALL7, 50), selfHeal: { p4: 12, p5: 12 },
    check: healed(["p4", "p5"], 4) },
  { id: "cd_pair_stretch", at: C.shoot, T: ["p6"], per: 14, cost: 8, setup: setStamina(ALL7, 50), selfHeal: { p6: 10 }, check: healed(["p6"], 2) },
  // 체력 100 에서 멈춘다
  { id: "cd_pair_stretch", at: AT.pass, T: ["p4", "p5"], per: 14, cost: 8, selfHeal: { p4: 8, p5: 8 },
    check: ({ s }, label) => assert.equal(P(s, "p4").stamina, 100, `${label}: 100 − 8 + 10 → 100`) },
  { id: "cd_one_on_one", playerId: "p7", T: ["p7"], per: 48, cost: 32 },
  { id: "cd_one_on_one", plus: true, playerId: "p7", T: ["p7"], per: 60, cost: 32 },
  { id: "cd_tactics_board", extra: 1, check: drawNextIs(1) },
  { id: "cd_tactics_board", plus: true, extra: 1, check: drawNextIs(2) },
  { id: "cd_icing", playerId: "p3", setup: setStamina(["p3"], 50), check: healed(["p3"], 30) },
  { id: "cd_icing", plus: true, playerId: "p3", setup: setStamina(["p3"], 50), check: healed(["p3"], 40) },

  // ── 에이스형 8 ──
  { id: "cd_hojo_up", policy: "ace", check: buffIs({ hojo: 3 }) },
  { id: "cd_hojo_up", plus: true, policy: "ace", check: buffIs({ hojo: 4 }) },
  { id: "cd_focus_routine", policy: "ace", check: buffIs({ focus: 2 }) },
  { id: "cd_focus_routine", plus: true, policy: "ace", check: buffIs({ focus: 3 }) },
  // 에이스 특훈: 집중 2 × 6 × 2 / 1명 = +24, 호조 1 → ×1.5 (소비)
  { id: "cd_ace_training", policy: "ace", playerId: "p4", T: ["p4"], per: 30 + 24, mult: 1.5, cost: 18,
    setup: (s, L) => Object.assign(L.buffs, { focus: 2, hojo: 1 }), check: buffIs({ focus: 2, hojo: 0 }) },
  { id: "cd_ace_training", plus: true, policy: "ace", playerId: "p4", T: ["p4"], per: 38 + 24, cost: 18,
    setup: (s, L) => Object.assign(L.buffs, { focus: 2 }) },
  { id: "cd_one_point", policy: "ace", playerId: "p4", T: ["p4"], per: 25, cost: 15, check: buffIs({ focus: 1 }) },
  { id: "cd_one_point", plus: true, policy: "ace", playerId: "p4", T: ["p4"], per: 31, cost: 15, check: buffIs({ focus: 1 }) },
  { id: "cd_immerse", policy: "ace", check: buffIs({ hojo: 2, focus: 1 }) },
  { id: "cd_immerse", plus: true, policy: "ace", check: buffIs({ hojo: 3, focus: 1 }) },
  { id: "cd_break_limit", policy: "ace", playerId: "p7", T: ["p7"], per: 65, cost: 39,
    check: ({ pv }, label) => assert.equal(R(pv.failRate * 100), 12, `${label}: 실패율 2% + 10%p`) },
  { id: "cd_break_limit", plus: true, policy: "ace", playerId: "p7", T: ["p7"], per: 81, cost: 39 },
  { id: "cd_routine", policy: "ace", check: buffIs({ routine: 8 }) },
  { id: "cd_routine", plus: true, policy: "ace", check: buffIs({ routine: 10 }) },
  // 루틴은 단일 · 주인 카드에만 +n (원에는 없음)
  { id: "cd_coaching", policy: "ace", playerId: "p4", T: ["p4"], per: 35 + 8, cost: 21, setup: (s, L) => (L.buffs.routine = 8) },
  { id: "cd_u_silluen", policy: "ace", T: ["p4"], per: 52.5 + 8, cost: 21, setup: (s, L) => (L.buffs.routine = 8) },
  { id: "cd_one_two", policy: "ace", at: AT.pass, T: ["p4", "p5"], per: 20, cost: 12, setup: (s, L) => (L.buffs.routine = 8) },
  { id: "cd_breath", policy: "ace", playerId: "p5", setup: setStamina(["p5"], 50), check: both(healed(["p5"], 25), buffIs({ focus: 1 })) },
  { id: "cd_breath", plus: true, policy: "ace", playerId: "p5", setup: setStamina(["p5"], 50), check: both(healed(["p5"], 35), buffIs({ focus: 1 })) },

  // ── 팀형 8 ──
  { id: "cd_high_five", check: buffIs({ mood: 3 }) },
  { id: "cd_high_five", plus: true, check: buffIs({ mood: 4 }) },
  { id: "cd_set_piece", at: AT.passDrib, T: ATT3, per: 11, cost: 7, check: buffIs({ mood: 2 }) },
  { id: "cd_set_piece", plus: true, at: AT.passDrib, T: ATT3, per: 14, cost: 7, check: buffIs({ mood: 2 }) },
  { id: "cd_pass_move", at: AT.pass, T: ["p4", "p5"], per: 15, cost: 9, check: both(buffIs({ mood: 1 }), twGain(1 + 2)) },
  { id: "cd_pass_move", plus: true, at: AT.pass, T: ["p4", "p5"], per: 19, cost: 9, check: buffIs({ mood: 1 }) },
  { id: "cd_one_team", T: ALL7, per: 5, cost: 3, check: buffIs({ mood: 2 }) },
  { id: "cd_one_team", plus: true, T: ALL7, per: 6, cost: 3, check: buffIs({ mood: 2 }) },
  { id: "cd_chant", setup: setStamina(ALL7, 50), check: both(buffIs({ mood: 2 }), healed(ALL7, 5)) },
  { id: "cd_chant", plus: true, setup: setStamina(ALL7, 50), check: both(buffIs({ mood: 3 }), healed(ALL7, 5)) },
  { id: "cd_mood_maker", setup: (s, L) => (L.buffs.mood = 3),
    check: both(buffIs({ mood: 6 }), ({ L, uid }, label) => assert.ok(L.exhausted.includes(uid) && !L.discard.includes(uid), `${label}: exhaust`)) },
  { id: "cd_mood_maker", plus: true, setup: (s, L) => (L.buffs.mood = 3), check: buffIs({ mood: 8 }) },
  { id: "cd_breath_together", check: buffIs({ noDecay: 3 }) },
  { id: "cd_breath_together", plus: true, check: buffIs({ noDecay: 4 }) },
  // 라인 연동: 1인 12 + 0.9 × 분위기 4 = 15.6 → 비용 round(15.6 × 0.6) = 9 (분위기 몫은 비용에 들어간다), 강화판 18.6 → 비용 그대로 9
  { id: "cd_link_line", at: AT.defPhys, T: DEF3, per: 15.6, cost: 9, setup: (s, L) => (L.buffs.mood = 4) },
  { id: "cd_link_line", plus: true, at: AT.defPhys, T: DEF3, per: 18.6, cost: 9, setup: (s, L) => (L.buffs.mood = 4) },

  // ── 역습형 6 (공격 구역 = 슈팅 · 드리블 · 패스, 수비 구역 = 수비 · 피지컬) ──
  { id: "cd_line_up", policy: "counter", at: AT.defPhys, T: DEF3, per: 11, cost: 7, check: buffIs({ steal: 2 }) },
  { id: "cd_line_up", plus: true, policy: "counter", at: AT.defPhys, T: DEF3, per: 14, cost: 7, check: buffIs({ steal: 2 }) },
  { id: "cd_recover", policy: "counter", setup: setStamina(ALL7, 50),
    check: both(buffIs({ steal: 1 }), healed(DEF3, 12), healed(["p4", "p5", "p6", "p7"], 0)) },
  { id: "cd_recover", plus: true, policy: "counter", setup: setStamina(ALL7, 50), check: both(buffIs({ steal: 1 }), healed(DEF3, 22)) },
  { id: "cd_long_ball", policy: "counter", extra: 1, check: buffIs({ steal: 1 }) },
  { id: "cd_long_ball", plus: true, policy: "counter", extra: 1, check: buffIs({ steal: 2 }) },
  // 카운터 스프린트: 공격 구역 대상 → 탈취 3 × 0.4 → ×2.2, 다 쓴다
  { id: "cd_counter_sprint", policy: "counter", at: AT.passDrib, T: ATT3, per: 13, mult: 2.2, cost: 8, setup: (s, L) => (L.buffs.steal = 3), check: buffIs({ steal: 0 }) },
  { id: "cd_counter_sprint", plus: true, policy: "counter", at: AT.passDrib, T: ATT3, per: 16, mult: 1.4, cost: 8, setup: (s, L) => (L.buffs.steal = 1) },
  // 마무리 일격: 공격 구역에 선 선수만, 탈취 4 × 0.45 → ×2.8
  { id: "cd_finisher", policy: "counter", playerId: "p6", T: ["p6"], per: 30, mult: 2.8, cost: 18, setup: (s, L) => (L.buffs.steal = 4),
    check: ({ s }, label) => assert.deepEqual(cards.singleCandidates(s, cards.getCard(data, "cd_finisher")), ["p4", "p5", "p6", "p7"], `${label}: 공격 구역만`) },
  { id: "cd_finisher", plus: true, policy: "counter", playerId: "p4", T: ["p4"], per: 38, cost: 18 },
  // 수비 구역에 선 GK 도 공격 구역으로 옮기면 고를 수 있다
  { id: "cd_finisher", policy: "counter", layout: { p1: "pass" }, playerId: "p1", T: ["p1"], per: 30, cost: 18 },
  // 전원 역습: 탈취 2 × 0.3 → ×1.6, 탈취를 쓰면 팀워크 +2 (L10 6 은 따로)
  { id: "cd_all_counter", policy: "counter", T: ALL7, per: 5, mult: 1.6, cost: 3, setup: (s, L) => (L.buffs.steal = 2),
    check: both(buffIs({ steal: 0 }), twGain(6 + 2)) },
  { id: "cd_all_counter", plus: true, policy: "counter", T: ALL7, per: 6, cost: 3, check: twGain(6) },

  // ── 압박형 6 ──
  { id: "cd_front_press", policy: "press", at: AT.passDrib, T: ATT3, per: 12, cost: 7, check: buffIs({ press: 1 }) },
  // 압박 1: 위력 ×1.2, 비용 ×1.2 (round(12 × 0.6 × 1.2) = 9)
  { id: "cd_front_press", plus: true, policy: "press", at: AT.passDrib, T: ATT3, per: 15, mult: 1.2, cost: 9, setup: (s, L) => (L.buffs.press = 1), check: buffIs({ press: 2 }) },
  { id: "cd_full_press", policy: "press", extra: 1, check: buffIs({ press: 2 }) },
  { id: "cd_full_press", plus: true, policy: "press", extra: 1, check: buffIs({ press: 3 }) },
  // 되찾기 6초 (§15.7 작은 원): 압박 2 이상이면 비용 증가 없음 (10), 위력 ×1.4
  { id: "cd_six_sec", policy: "press", at: AT.pass, T: ["p4", "p5"], per: 17, mult: 1.4, cost: 10, setup: (s, L) => (L.buffs.press = 2), check: both(buffIs({ press: 3 }), twGain(1)) },
  { id: "cd_six_sec", plus: true, policy: "press", at: AT.pass, T: ["p4", "p5"], per: 21, mult: 1.2, cost: R(17 * 0.6 * 1.2), setup: (s, L) => (L.buffs.press = 1) },
  { id: "cd_six_sec", policy: "press", at: C.shoot, T: ["p6"], per: 17, cost: 10, check: buffIs({ press: 1 }) },
  { id: "cd_drop_line", policy: "press", setup: (s, L) => { L.buffs.press = 3; setStamina(ALL7, 50)(s); },
    check: both(buffIs({ press: 0, nextNoFail: true }), healed(ALL7, 18)) },
  { id: "cd_drop_line", plus: true, policy: "press", setup: (s, L) => { L.buffs.press = 3; setStamina(ALL7, 50)(s); }, check: healed(ALL7, 24) },
  // 총공세: 1인 5 + 1.7 × 압박 2 = 8.4, 비용 = round(8.4 × 0.6 × 1.4) = 7
  { id: "cd_all_out", policy: "press", T: ALL7, per: 8.4, mult: 1.4, cost: 7, setup: (s, L) => (L.buffs.press = 2) },
  { id: "cd_all_out", plus: true, policy: "press", T: ALL7, per: 9.4, mult: 1.4, cost: 7, setup: (s, L) => (L.buffs.press = 2) },
  // 게겐프레싱: 압박 3 이어도 비용 그대로 8, 위력 ×1.6
  { id: "cd_gegen", policy: "press", at: AT.passDrib, T: ATT3, per: 14, mult: 1.6, cost: 8, setup: (s, L) => (L.buffs.press = 3) },
  { id: "cd_gegen", plus: true, policy: "press", at: AT.passDrib, T: ATT3, per: 18, cost: 8 },

  // ── 점유형 6 (패스 구역 대상) ──
  // 삼각형 패스: 패스 구역 작은 원 성공 → 점유 +2 + 기본 +1 = +3, 팀워크 L10 +1 + 카드 +2
  { id: "cd_triangle", policy: "poss", at: AT.pass, T: ["p4", "p5"], per: 18, cost: 11, check: both(buffIs({ poss: 3 }), twGain(3)) },
  { id: "cd_triangle", plus: true, policy: "poss", at: AT.pass, T: ["p4", "p5"], per: 23, cost: 11, check: buffIs({ poss: 3 }) },
  { id: "cd_mid_control", policy: "poss", at: AT.pass, T: ["p4", "p5"], per: 15, cost: 9, check: buffIs({ poss: 3 }) },
  { id: "cd_mid_control", plus: true, policy: "poss", at: AT.pass, T: ["p4", "p5"], per: 19, mult: 1.1, cost: 9, setup: (s, L) => (L.buffs.poss = 2), check: buffIs({ poss: 5 }) },
  { id: "cd_circulate", policy: "poss", setup: setStamina(["p3"], 30), check: both(buffIs({ poss: 3 }), healed(["p3"], 15)) },
  { id: "cd_circulate", plus: true, policy: "poss", setup: setStamina(["p3"], 30), check: both(buffIs({ poss: 4 }), healed(["p3"], 15)) },
  { id: "cd_tempo", policy: "poss", check: both(buffIs({ possGuard: 1 }), drawNextIs(1)) },
  { id: "cd_tempo", plus: true, policy: "poss", check: both(buffIs({ possGuard: 2 }), drawNextIs(1)) },
  // 지배하는 중원: 점유 4 → ×(1 + 0.05 × 4 × 2) = 1.4, 패스 구역이 끼어 +1
  { id: "cd_dominate", policy: "poss", at: AT.passDrib, T: ATT3, per: 11, mult: 1.4, cost: 7, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 5 }) },
  { id: "cd_dominate", plus: true, policy: "poss", at: AT.passDrib, T: ATT3, per: 14, cost: 7 },
  // 후방 빌드업: 패스 구역 대상이 없어도 점유 유지 (×1.2)
  { id: "cd_back_build", policy: "poss", at: AT.defPhys, T: DEF3, per: 12, mult: 1.2, cost: 7, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 4 }) },
  { id: "cd_back_build", plus: true, policy: "poss", at: AT.defPhys, T: DEF3, per: 15, mult: 1.2, cost: 7, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 4 }) },
  // 비교: 같은 자리라도 possKeep 이 없으면 −2
  { id: "cd_defense_org", policy: "poss", at: AT.defPhys, T: DEF3, per: 15, mult: 1.2, cost: 9, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 2 }) },

  // ── 고유 8 (주인 1명. 주인이 배치 포지션의 주 스탯 구역에 서 있으면 ×1.5 — 비용 21, 아니면 35 · 비용 14. 캐릭터 효과는 늘) ──
  { id: "cd_u_neria", T: ["p1"], per: 52.5, cost: 21, setup: setStamina(["p1"], 50), selfHeal: { p1: 15 }, check: buffIs({ nextNoFail: true }) },
  { id: "cd_u_neria", plus: true, layout: { p1: "physical" }, T: ["p1"], per: 66, cost: 21, setup: setStamina(["p1"], 50), selfHeal: { p1: 25 } },
  { id: "cd_u_neria", layout: { p1: "pass" }, T: ["p1"], per: 35, cost: 14, setup: setStamina(["p1"], 50), selfHeal: { p1: 15 }, check: buffIs({ nextNoFail: true }) },
  { id: "cd_u_dorbina", T: ["p2"], per: 52.5, cost: 21, setup: setStamina(ALL7, 50), selfHeal: { p2: 10 },
    check: both(healed(["p1", "p3"], 10), healed(["p4", "p5", "p6", "p7"], 0)) },
  { id: "cd_u_dorbina", plus: true, layout: { p2: "shoot" }, T: ["p2"], per: 44, cost: 14, setup: setStamina(ALL7, 50), selfHeal: { p2: 15 }, check: healed(["p1", "p3"], 15) },
  { id: "cd_u_adeline", T: ["p3"], per: 52.5, cost: 21, setup: setStamina(ALL7, 50), selfHeal: { p3: 3 }, check: both(twGain(3), healed(["p1", "p7"], 3)) },
  { id: "cd_u_adeline", plus: true, layout: { p3: "dribble" }, T: ["p3"], per: 44, cost: 14, setup: setStamina(ALL7, 50), selfHeal: { p3: 5 }, check: both(twGain(4), healed(["p1"], 5)) },
  { id: "cd_u_silluen", T: ["p4"], per: 52.5, cost: 21, check: buffIs({ nextPct: 0.4 }) },
  { id: "cd_u_silluen", plus: true, layout: { p4: "dribble" }, T: ["p4"], per: 66, cost: 21, check: buffIs({ nextPct: 0.55 }) },
  { id: "cd_u_silluen", layout: { p4: "physical" }, T: ["p4"], per: 35, cost: 14, check: buffIs({ nextPct: 0.4 }) },
  { id: "cd_u_taria", T: ["p5"], per: 52.5, cost: 21, check: drawNextIs(1) },
  { id: "cd_u_taria", plus: true, layout: { p5: "defense" }, T: ["p5"], per: 44, cost: 14, check: drawNextIs(2) },
  { id: "cd_u_ulrika", T: ["p6"], per: 52.5, cost: 21, check: both(buffIs({ nextPairPct: 0.5 }), twGain(1)) },
  { id: "cd_u_ulrika", plus: true, layout: { p6: "pass" }, T: ["p6"], per: 44, cost: 14, check: both(buffIs({ nextPairPct: 0.75 }), twGain(1)) },
  { id: "cd_u_greta", T: ["p7"], per: 52.5, cost: 21, setup: setStamina(["p7"], 50), check: buffIs({ nextCostZero: true }) },
  { id: "cd_u_greta", plus: true, layout: { p7: "physical" }, T: ["p7"], per: 44, cost: 14, setup: setStamina(["p7"], 50), selfHeal: { p7: 10 }, check: buffIs({ nextCostZero: true }) },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, T: ["p5"], per: 52.5, cost: 21, extra: 1, setup: setStamina(["p5"], 50), selfHeal: { p5: -5 } },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, plus: true, layout: { p5: "shoot" }, T: ["p5"], per: 44, cost: 14, extra: 1, setup: setStamina(["p5"], 50) },

  // ── 코치 8 (대상이 코치 타입 구역에 서 있을 때만 ×1.3, 유대 80 이상이면 bond80, 강화판 = 그 시점 위력 × 1.25, 비용은 기본 위력 기준, 낼 때 유대 +8) ──
  { id: "cd_c_harr", layout: { p7: "shoot" }, at: C.shoot, T: ["p6", "p7"], per: 18, zm: { shoot: 1.3 }, cost: 11, check: coachBond("sp_coach_harr", 8) },
  { id: "cd_c_harr", at: AT.pass, T: ["p4", "p5"], per: 18, cost: 11 },
  { id: "cd_c_harr", at: AT.pass, T: ["p4", "p5"], per: 18, mult: 2, cost: 11, setup: (s, L) => (L.turn = L.turns) },
  { id: "cd_c_harr", at: AT.pass, T: ["p4", "p5"], per: 18, cost: 11, setup: (s, L) => (L.turn = L.turns - 1) },
  { id: "cd_c_harr", bond: 80, at: AT.pass, T: ["p4", "p5"], per: 18, mult: 2, cost: 11, setup: (s, L) => (L.turn = L.turns - 1) },
  { id: "cd_c_harr", plus: true, layout: { p7: "shoot" }, at: C.shoot, T: ["p6", "p7"], per: 23, zm: { shoot: 1.3 }, cost: 11 },
  { id: "cd_c_celia", layout: { p6: "dribble" }, at: C.dribble, T: ["p6", "p7"], per: 20, zm: { dribble: 1.3 }, cost: 12,
    check: both(drawNextIs(1), coachBond("sp_wind_dancer", 8)) },
  { id: "cd_c_celia", bond: 80, at: AT.pass, T: ["p4", "p5"], per: 24, cost: 12, check: drawNextIs(1) },
  { id: "cd_c_celia", bond: 80, plus: true, at: AT.pass, T: ["p4", "p5"], per: 30, cost: 12 },
  { id: "cd_c_ornella", at: AT.passDrib, T: ATT3, per: 15, zm: { pass: 1.3 }, cost: 9, check: twGain(2 + 2) },
  { id: "cd_c_ornella", bond: 80, at: AT.passDrib, T: ATT3, per: 18, zm: { pass: 1.3 }, cost: 9, check: twGain(2 + 3) },
  { id: "cd_c_ornella", plus: true, at: AT.defPhys, T: DEF3, per: 19, cost: 9 },
  { id: "cd_c_barbara", at: AT.defPhys, T: DEF3, per: 15, zm: { defense: 1.3 }, cost: 9, setup: setStamina(DEF3, 15),
    check: ({ pv }, label) => assert.equal(pv.failRate, 0, `${label}: 실패 판정 없음`) },
  { id: "cd_c_barbara", bond: 80, at: AT.passDrib, T: ATT3, per: 18, cost: 9 },
  { id: "cd_c_barbara", plus: true, at: AT.passDrib, T: ATT3, per: 19, cost: 9 },
  { id: "cd_c_barbara", bond: 80, plus: true, at: AT.defPhys, T: DEF3, per: R(18 * 1.25), zm: { defense: 1.3 }, cost: 9 },
  { id: "cd_c_hanna", T: ALL7, per: 6, zm: { physical: 1.3 }, cost: 4,
    check: ({ L, pv }, label) => { assert.equal(L.endHeal, 5, label); assert.equal(R(pv.failRate * 100), 0, `${label}: 2% − 5%p`); } },
  { id: "cd_c_hanna", T: ALL7, per: 6, zm: { physical: 1.3 }, cost: 4, setup: setStamina(ALL7, 50),
    check: ({ pv }, label) => assert.equal(R(pv.failRate * 100), 5, `${label}: 실패율 10% − 5%p`) },
  { id: "cd_c_hanna", bond: 80, T: ALL7, per: 6, zm: { physical: 1.3 }, cost: 4, check: ({ L }, label) => assert.equal(L.endHeal, 10, label) },
  { id: "cd_c_hanna", plus: true, T: ALL7, per: 8, zm: { physical: 1.3 }, cost: 4 },
  // 골목 슈팅 (§15.7 작은 원): 1인 24, 목표 미만 ×1.5
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], at: C.shoot, T: ["p6"], per: 24, mult: 1.5, zm: { shoot: 1.3 }, cost: 14,
    check: coachBond("sp_street_striker", 8) },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], at: AT.pass, T: ["p4", "p5"], per: 24, mult: 1.5, cost: 14, check: twGain(1) },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], at: AT.pass, T: ["p4", "p5"], per: 24, cost: 14,
    setup: (s, L) => (L.score = L.target) },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 80, firedEventIds: [] }], at: AT.pass, T: ["p4", "p5"], per: 29, mult: 1.5, cost: 14 },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], plus: true, at: AT.pass, T: ["p4", "p5"], per: 30, mult: 1.5, cost: 14 },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 10, firedEventIds: [] }], playerId: "p4", T: ["p4"], per: 28, zm: { pass: 1.3 }, cost: 17,
    check: drawNextIs(1) },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 80, firedEventIds: [] }], playerId: "p7", T: ["p7"], per: 28, cost: 17, extra: 1,
    check: drawNextIs(1) },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 10, firedEventIds: [] }], plus: true, playerId: "p7", T: ["p7"], per: 35, cost: 17 },
  { id: "cd_c_lumi", T: ALL7, per: 5, zm: { physical: 1.3 }, cost: 3, check: ({ L }, label) => assert.equal(L.lumiFlag, true, label) },
  { id: "cd_c_lumi", bond: 80, T: ALL7, per: 6, zm: { physical: 1.3 }, cost: 3 },
  { id: "cd_c_lumi", plus: true, T: ALL7, per: 6, zm: { physical: 1.3 }, cost: 3 },

  // ── 대비 3 (이번 레슨만 t* uid, 대상의 구역이 lessonMult 구역이면 ×1.5) ──
  { id: "cd_p_tackle", at: AT.defPhys, T: DEF3, per: 14, zm: { defense: 1.5, physical: 1.5 }, cost: 8 },
  { id: "cd_p_tackle", at: AT.passDrib, T: ATT3, per: 14, cost: 8 },
  { id: "cd_p_intercept", at: AT.defPhys, T: DEF3, per: 14, zm: { defense: 1.5 }, cost: 8 },
  { id: "cd_p_intercept", at: AT.passDrib, T: ATT3, per: 14, zm: { pass: 1.5 }, cost: 8 },
  { id: "cd_p_hold", at: AT.defense, T: ["p1", "p2"], per: 18, zm: { defense: 1.5 }, cost: 11 },
  { id: "cd_p_hold", at: AT.pass, T: ["p4", "p5"], per: 18, cost: 11 },
];

test("카드 효과 표: 68장 모두 표에 있고 기본판 · 강화판(대비 제외)을 낸다 · 고유는 주 스탯 구역 안팎 · 코치는 유대 80 · 타입 구역 ×1.3", () => {
  const all = cards.cardList(data);
  assert.equal(all.length, 68);
  for (const c of all) {
    assert.ok(CASES.some((x) => x.id === c.id && !x.plus), `${c.id} 기본판이 표에 없다`);
    if (cards.canUpgrade(c)) assert.ok(CASES.some((x) => x.id === c.id && x.plus), `${c.id} 강화판이 표에 없다`);
  }
  for (const c of all.filter((x) => x.family === "unique")) {
    const per = new Set(CASES.filter((x) => x.id === c.id).map((x) => x.cost));
    assert.deepEqual([...per].sort(), [14, 21], `${c.id}: 주 스탯 구역 안 · 밖`);
  }
  for (const c of all.filter((x) => x.family === "coach")) {
    assert.ok(CASES.some((x) => x.id === c.id && (x.bond === 80 || (x.addSupports || []).some((a) => a.bond >= 80))), `${c.id}: 유대 80판`);
    assert.ok(CASES.some((x) => x.id === c.id && x.zm && x.zm[c.coach.type] === 1.3), `${c.id}: 코치 타입 구역 ×1.3`);
  }
});

for (const family of ["common", "ace", "team", "counter", "press", "poss", "unique", "coach", "prep"]) {
  test(`카드 효과 표 — ${family}`, () => {
    const list = CASES.filter((c) => cards.getCard(data, c.id).family === family);
    assert.ok(list.length > 0);
    for (const c of list) runCase(c);
  });
}

test("카드 효과 표: 방침 게이트 (D38) — 다른 방침에서는 패시브 · 방침 배율이 없고 카드에 적힌 버프만 쌓인다", () => {
  // 역습형 카드를 팀형 런에서: 탈취를 쓰지 않고 (배율 없음), 수비 구역 성공에 쌓지 않는다 (카드의 steal 효과는 쌓인다)
  runCase({ id: "cd_counter_sprint", policy: "team", at: AT.passDrib, T: ATT3, per: 13, cost: 8, setup: (s, L) => (L.buffs.steal = 3), check: buffIs({ steal: 3 }) });
  runCase({ id: "cd_line_up", policy: "team", at: AT.defPhys, T: DEF3, per: 11, cost: 7, check: buffIs({ steal: 0 }) });
  runCase({ id: "cd_recover", policy: "ace", check: buffIs({ steal: 1 }) });
  // 점유형 카드를 에이스형 런에서: 점유 배율 · +1 패시브 없음, 카드의 +2 는 쌓인다
  runCase({ id: "cd_mid_control", policy: "ace", at: AT.pass, T: ["p4", "p5"], per: 15, cost: 9, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 6 }) });
  // 압박 비용 배율은 방침 게이트가 없다, 방침 배율은 압박형만
  runCase({ id: "cd_front_press", policy: "team", at: AT.passDrib, T: ATT3, per: 12, cost: 9, setup: (s, L) => (L.buffs.press = 1), check: buffIs({ press: 2 }) });
});

test("카드 효과 표: 고유 카드는 대상 카드라 일회성 버프를 쓴다 (호조 −1 · nextPct · nextNoFail), 효과의 nextCostZero 는 그 뒤에 켜진다", () => {
  const r = runCase({ id: "cd_u_greta", policy: "ace", T: ["p7"], per: 52.5, mult: 1.5 * 1.4, cost: 21,
    setup: (s, L) => Object.assign(L.buffs, { hojo: 2, nextPct: 0.4, nextNoFail: true }),
    check: buffIs({ hojo: 1, nextPct: 0, nextNoFail: false, nextCostZero: true }) });
  assert.deepEqual(r.L.targeted, { p7: 1 });
});

test("카드 문구: 위력 있는 카드는 해석된 1인 위력 숫자를 문구에 담는다 (기본 · 강화판 · 코치 유대 80판 · 유대 80 + 강화판) · 대상 이름", () => {
  const word = { single: /단일|1명/, circle: /원/, all: /전체/, owner: /주인/ };
  for (const c of cards.cardList(data)) {
    const variants = [{ plus: false, bond: 0 }];
    if (cards.canUpgrade(c)) variants.push({ plus: true, bond: 0 });
    if (c.family === "coach") variants.push({ plus: false, bond: 80 }, { plus: true, bond: 80 });
    for (const v of variants) {
      const d = cards.resolveCardDef(data, c.id, v);
      const tag = `${c.id}${v.plus ? "+" : ""}${v.bond ? " 유대80" : ""}`;
      assert.equal(typeof d.desc, "string", tag);
      if (typeof d.power === "number") {
        assert.ok(new RegExp(`(^|\\D)${d.power}(\\D|$)`).test(d.desc), `${tag}: '${d.desc}' 에 위력 ${d.power} 가 없다`);
        assert.ok(word[c.target.kind].test(d.desc), `${tag}: '${d.desc}' 에 대상 이름`);
      }
      if (c.target.kind === "circle") {
        const size = { small: "작은 원", medium: "중간 원", large: "큰 원" }[c.target.size];
        assert.ok(d.desc.includes(size), `${tag}: '${d.desc}' 에 '${size}'`);
      }
      assert.ok(!/합계|라인 합계|공격진|수비진|지명|짝/.test(d.desc), `${tag}: 옛 대상 문구 '${d.desc}'`);
    }
    if (c.family === "coach") {
      const base = cards.resolveCardDef(data, c.id, { bond: 0 });
      const b80 = cards.resolveCardDef(data, c.id, { bond: 80 });
      assert.notEqual(b80.desc, base.desc, `${c.id}: 유대 80판 문구가 기본과 같다`);
      assert.notEqual(cards.resolveCardDef(data, c.id, { bond: 80, plus: true }).desc, cards.resolveCardDef(data, c.id, { plus: true }).desc, `${c.id}+: 유대 80판 문구`);
    }
  }
  assert.match(cards.resolveCardDef(data, "cd_c_harr", { bond: 80 }).desc, /2턴/);
  assert.match(cards.resolveCardDef(data, "cd_c_hanna", { bond: 80 }).desc, /\+10/);
  assert.match(cards.resolveCardDef(data, "cd_c_irene", { bond: 80 }).desc, /추가 사용 \+1/);
});
