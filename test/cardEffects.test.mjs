// test/cardEffects.test.mjs — 엔진 감사 (ENGINE AUDIT): 66장 카드마다 통제된 상태에서 1장을 내고 핵심 효과를 확인한다.
// 기준: OUTGAME_CARDS_draft.md · LESSON_PROTO_PLAN §4.4 (대상 · 위력 · 비용 · effects · 강화판 · 코치 같은 타입 ×1.3 · 유대 80판 · 고유 두 모드).
// 상태: 기본 편성 2-2-2 (p1 GK 네리아 · p2/p3 DF 도르비나/아델린 · p4/p5 MF 실루엔/타리아 · p6/p7 FW 울리카/그레타),
//       컨디션 2 (×1.0), modifier 없음, 체력 100, 실패 판정이 나지 않는 rng 상태 (SAFE), 손패 = [그 카드, 채움 2장], 사용 2회.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, run } from "./helpers.mjs";
import * as lesson from "../js/engine/lesson.js";
import * as cards from "../js/engine/cards.js";
import { createRngFromState } from "../js/engine/rng.js";

const data = loadData();
const R = cards.roundCost;
const SAFE = (() => {
  for (let s = 1; s < 100000; s++) if (createRngFromState(s).next() >= 0.96) return s;
  throw new Error("SAFE rng");
})();
const FILL = ["cd_basic", "cd_basic"];
const MIRKA_SQUAD = { ...data.config.defaultSquad.slots, MF2: "ch_cat_trickster" };
const ALL7 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
const ATTACK = ["p4", "p5", "p6", "p7"];
const DEFENSE = ["p1", "p2", "p3"];

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
  lesson.startLesson(s, data, { stat: c.stat, prepCards: prep ? [c.id] : [] });
  const L = s.lesson;
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
  const pv = lesson.previewCard(s, data, { uid, taps: c.taps || [] });
  lesson.playCard(s, data, { uid, taps: c.taps || [] });
  return { s, L: s.lesson, uid, before, pv };
}

const P = (s, id) => s.players.find((p) => p.id === id);

/**
 * 표 항목 하나를 검사한다.
 *   T: 상승 대상 (순서 무관), per: 1인 위력 (숫자 또는 대상별 배열), mult: 배율 M, cost: 1인 비용 (숫자 또는 배열)
 *   extra: 그 뒤 사용 횟수 = 1 + extraPlay (기본 0) · check(r): 카드 고유 효과
 */
function runCase(c) {
  const r = playOne(c);
  const { s, L, before, pv } = r;
  const label = `${c.id}${c.plus ? "+" : ""}${c.bond !== undefined ? ` bond ${c.bond}` : ""} [${c.stat}]`;
  assert.equal(pv.ok, true, `${label}: preview ${pv.reason}`);
  assert.equal(L.status, "playing", label);
  assert.equal(L.turn, before.turn, `${label}: 턴이 끝나면 안 된다`);
  assert.equal(L.stats.fails, 0, label);
  const T = c.T || [];
  assert.deepEqual(pv.targets.map((t) => t.id).sort(), T.slice().sort(), `${label}: 대상`);
  const sub = data.config.training.subStatMap[c.stat];
  let sum = 0;
  T.forEach((id, i) => {
    const p = P(s, id);
    const per = Array.isArray(c.per) ? c.per[i] : c.per;
    const mult = c.mult ?? 1;
    const g = R(per * p.growth[c.stat] * mult);
    assert.equal(p.stats[c.stat] - before.stats[id][c.stat], g, `${label}: ${id} 상승 (1인 ${per} × M ${mult})`);
    assert.equal(p.stats[sub] - before.stats[id][sub], R(g * 0.36 * p.growth[sub]), `${label}: ${id} 부 스탯`);
    const cost = Array.isArray(c.cost) ? c.cost[i] : c.cost;
    const healAfter = c.selfHeal && c.selfHeal[id] ? c.selfHeal[id] : 0;
    assert.equal(before.stamina[id] - P(s, id).stamina + healAfter, cost, `${label}: ${id} 비용`);
    sum += g;
  });
  for (const p of s.players) {
    if (!T.includes(p.id)) assert.equal(p.stats[c.stat], before.stats[p.id][c.stat], `${label}: 대상 밖 ${p.id} 은 오르지 않는다`);
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
// 66장 표 (기본판 · 강화판). 비용은 강화 전 기본 카드 기준 (D12).
// ---------------------------------------------------------------------------
const CASES = [
  // ── 공용 13 ──
  { id: "cd_basic", stat: "pass", T: ALL7, per: 35 / 7, cost: 3, check: twGain(6) },
  { id: "cd_basic", plus: true, stat: "pass", T: ALL7, per: 44 / 7, cost: 3 },
  { id: "cd_coaching", stat: "pass", taps: ["p4"], T: ["p4"], per: 35, cost: 21 },
  { id: "cd_coaching", plus: true, stat: "pass", taps: ["p4"], T: ["p4"], per: 44, cost: 21 },
  { id: "cd_cooldown", stat: "pass", taps: ["p4"], setup: setStamina(["p4"], 50), extra: 1, check: healed(["p4"], 20) },
  { id: "cd_cooldown", plus: true, stat: "pass", taps: ["p4"], setup: setStamina(["p4"], 50), extra: 1, check: healed(["p4"], 30) },
  { id: "cd_fw_drill", stat: "shoot", T: ["p6", "p7"], per: 20, cost: 12 },
  { id: "cd_fw_drill", plus: true, stat: "shoot", T: ["p6", "p7"], per: 25, cost: 12 },
  { id: "cd_mf_drill", stat: "pass", T: ["p4", "p5"], per: 20, cost: 12 },
  { id: "cd_mf_drill", plus: true, stat: "pass", T: ["p4", "p5"], per: 25, cost: 12 },
  { id: "cd_df_drill", stat: "defense", T: ["p2", "p3"], per: 20, cost: 12 },
  { id: "cd_df_drill", plus: true, stat: "defense", T: ["p2", "p3"], per: 25, cost: 12 },
  { id: "cd_gk_session", stat: "defense", T: ["p1"], per: 38, cost: 23 },
  { id: "cd_gk_session", plus: true, stat: "defense", T: ["p1"], per: 48, cost: 23 },
  { id: "cd_attack_build", stat: "dribble", T: ATTACK, per: 43 / 4, cost: 6, check: twGain(3) },
  { id: "cd_attack_build", plus: true, stat: "dribble", T: ATTACK, per: 54 / 4, cost: 6 },
  { id: "cd_defense_org", stat: "defense", T: DEFENSE, per: 43 / 3, cost: 9, check: twGain(2) },
  { id: "cd_defense_org", plus: true, stat: "defense", T: DEFENSE, per: 54 / 3, cost: 9 },
  { id: "cd_one_two", stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 20, cost: 12, check: twGain(2 + 2) },
  { id: "cd_one_two", plus: true, stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 25, cost: 12, check: twGain(4) },
  { id: "cd_one_on_one", stat: "shoot", taps: ["p7"], T: ["p7"], per: 48, cost: 32 },
  { id: "cd_one_on_one", plus: true, stat: "shoot", taps: ["p7"], T: ["p7"], per: 60, cost: 32 },
  { id: "cd_tactics_board", stat: "pass", extra: 1, check: drawNextIs(1) },
  { id: "cd_tactics_board", plus: true, stat: "pass", extra: 1, check: drawNextIs(2) },
  { id: "cd_icing", stat: "pass", taps: ["p3"], setup: setStamina(["p3"], 50), check: healed(["p3"], 30) },
  { id: "cd_icing", plus: true, stat: "pass", taps: ["p3"], setup: setStamina(["p3"], 50), check: healed(["p3"], 40) },

  // ── 에이스형 8 ──
  { id: "cd_hojo_up", policy: "ace", stat: "pass", check: buffIs({ hojo: 3 }) },
  { id: "cd_hojo_up", plus: true, policy: "ace", stat: "pass", check: buffIs({ hojo: 4 }) },
  { id: "cd_focus_routine", policy: "ace", stat: "pass", check: buffIs({ focus: 2 }) },
  { id: "cd_focus_routine", plus: true, policy: "ace", stat: "pass", check: buffIs({ focus: 3 }) },
  // 에이스 특훈: 집중 2 × 6 × 2 / 1명 = +24, 호조 1 → ×1.5 (소비)
  { id: "cd_ace_training", policy: "ace", stat: "pass", taps: ["p4"], T: ["p4"], per: 30 + 24, mult: 1.5, cost: 18,
    setup: (s, L) => Object.assign(L.buffs, { focus: 2, hojo: 1 }), check: buffIs({ focus: 2, hojo: 0 }) },
  { id: "cd_ace_training", plus: true, policy: "ace", stat: "pass", taps: ["p4"], T: ["p4"], per: 38 + 24, cost: 18,
    setup: (s, L) => Object.assign(L.buffs, { focus: 2 }) },
  { id: "cd_one_point", policy: "ace", stat: "pass", taps: ["p4"], T: ["p4"], per: 25, cost: 15, check: buffIs({ focus: 1 }) },
  { id: "cd_one_point", plus: true, policy: "ace", stat: "pass", taps: ["p4"], T: ["p4"], per: 31, cost: 15, check: buffIs({ focus: 1 }) },
  { id: "cd_immerse", policy: "ace", stat: "pass", check: buffIs({ hojo: 2, focus: 1 }) },
  { id: "cd_immerse", plus: true, policy: "ace", stat: "pass", check: buffIs({ hojo: 3, focus: 1 }) },
  { id: "cd_break_limit", policy: "ace", stat: "shoot", taps: ["p7"], T: ["p7"], per: 65, cost: 39,
    check: ({ pv }, label) => assert.equal(R(pv.failRate * 100), 12, `${label}: 실패율 2% + 10%p`) },
  { id: "cd_break_limit", plus: true, policy: "ace", stat: "shoot", taps: ["p7"], T: ["p7"], per: 81, cost: 39 },
  { id: "cd_routine", policy: "ace", stat: "pass", check: buffIs({ routine: 8 }) },
  { id: "cd_routine", plus: true, policy: "ace", stat: "pass", check: buffIs({ routine: 10 }) },
  // 루틴은 지명 카드에만 +n (짝 · 범위에는 없음)
  { id: "cd_coaching", policy: "ace", stat: "pass", taps: ["p4"], T: ["p4"], per: 35 + 8, cost: 21, setup: (s, L) => (L.buffs.routine = 8) },
  { id: "cd_one_two", policy: "ace", stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 20, cost: 12, setup: (s, L) => (L.buffs.routine = 8) },
  { id: "cd_breath", policy: "ace", stat: "pass", taps: ["p5"], setup: setStamina(["p5"], 50), check: both(healed(["p5"], 25), buffIs({ focus: 1 })) },
  { id: "cd_breath", plus: true, policy: "ace", stat: "pass", taps: ["p5"], setup: setStamina(["p5"], 50), check: both(healed(["p5"], 35), buffIs({ focus: 1 })) },

  // ── 팀형 8 ──
  { id: "cd_high_five", stat: "pass", check: buffIs({ mood: 3 }) },
  { id: "cd_high_five", plus: true, stat: "pass", check: buffIs({ mood: 4 }) },
  { id: "cd_set_piece", stat: "dribble", T: ATTACK, per: 30 / 4, cost: 5, check: buffIs({ mood: 2 }) },
  { id: "cd_set_piece", plus: true, stat: "dribble", T: ATTACK, per: 38 / 4, cost: 5, check: buffIs({ mood: 2 }) },
  { id: "cd_pass_move", stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 15, cost: 9, check: both(buffIs({ mood: 1 }), twGain(2 + 2)) },
  { id: "cd_pass_move", plus: true, stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 19, cost: 9, check: buffIs({ mood: 1 }) },
  { id: "cd_one_team", stat: "physical", T: ALL7, per: 4, cost: 2, check: buffIs({ mood: 2 }) },
  { id: "cd_one_team", plus: true, stat: "physical", T: ALL7, per: 5, cost: 2, check: buffIs({ mood: 2 }) },
  { id: "cd_chant", stat: "pass", setup: setStamina(ALL7, 50), check: both(buffIs({ mood: 2 }), healed(ALL7, 5)) },
  { id: "cd_chant", plus: true, stat: "pass", setup: setStamina(ALL7, 50), check: both(buffIs({ mood: 3 }), healed(ALL7, 5)) },
  { id: "cd_mood_maker", stat: "pass", setup: (s, L) => (L.buffs.mood = 3),
    check: both(buffIs({ mood: 6 }), ({ L, uid }, label) => assert.ok(L.exhausted.includes(uid) && !L.discard.includes(uid), `${label}: exhaust`)) },
  { id: "cd_mood_maker", plus: true, stat: "pass", setup: (s, L) => (L.buffs.mood = 3), check: buffIs({ mood: 8 }) },
  { id: "cd_breath_together", stat: "pass", check: buffIs({ noDecay: 3 }) },
  { id: "cd_breath_together", plus: true, stat: "pass", check: buffIs({ noDecay: 4 }) },
  // 라인 연동: (35 + 2.5 × 분위기 4) / 3 = 15 → 비용 9 (분위기 몫은 비용에 들어간다), 강화판 (44 + 10) / 3 = 18 → 비용 그대로 9
  { id: "cd_link_line", stat: "defense", T: DEFENSE, per: 15, cost: 9, setup: (s, L) => (L.buffs.mood = 4) },
  { id: "cd_link_line", plus: true, stat: "defense", T: DEFENSE, per: 18, cost: 9, setup: (s, L) => (L.buffs.mood = 4) },

  // ── 역습형 6 ──
  { id: "cd_line_up", policy: "counter", stat: "defense", T: DEFENSE, per: 32 / 3, cost: 6, check: buffIs({ steal: 2 }) },
  { id: "cd_line_up", plus: true, policy: "counter", stat: "defense", T: DEFENSE, per: 40 / 3, cost: 6, check: buffIs({ steal: 2 }) },
  { id: "cd_recover", policy: "counter", stat: "pass", setup: setStamina(ALL7, 50),
    check: both(buffIs({ steal: 1 }), healed(DEFENSE, 12), healed(ATTACK, 0)) },
  { id: "cd_recover", plus: true, policy: "counter", stat: "pass", setup: setStamina(ALL7, 50), check: both(buffIs({ steal: 1 }), healed(DEFENSE, 22)) },
  { id: "cd_long_ball", policy: "counter", stat: "pass", extra: 1, check: buffIs({ steal: 1 }) },
  { id: "cd_long_ball", plus: true, policy: "counter", stat: "pass", extra: 1, check: buffIs({ steal: 2 }) },
  // 카운터 스프린트: 탈취 3 × 0.4 → ×2.2, 다 쓴다
  { id: "cd_counter_sprint", policy: "counter", stat: "shoot", T: ATTACK, per: 9, mult: 2.2, cost: 5, setup: (s, L) => (L.buffs.steal = 3), check: buffIs({ steal: 0 }) },
  { id: "cd_counter_sprint", plus: true, policy: "counter", stat: "shoot", T: ATTACK, per: 45 / 4, mult: 1.4, cost: 5, setup: (s, L) => (L.buffs.steal = 1) },
  // 마무리 일격: MF · FW 만, 탈취 4 × 0.45 → ×2.8
  { id: "cd_finisher", policy: "counter", stat: "shoot", taps: ["p6"], T: ["p6"], per: 30, mult: 2.8, cost: 18, setup: (s, L) => (L.buffs.steal = 4),
    check: ({ s, uid }, label) => {
      assert.deepEqual(cards.tapCandidates(s, lesson.lessonCardDef(s, data, uid)).candidates, ATTACK, `${label}: MF · FW 만 고를 수 있다`);
    } },
  { id: "cd_finisher", plus: true, policy: "counter", stat: "shoot", taps: ["p4"], T: ["p4"], per: 38, cost: 18 },
  // 전원 역습: 탈취 2 × 0.3 → ×1.6, 탈취를 쓰면 팀워크 +2 (L10 6 은 따로)
  { id: "cd_all_counter", policy: "counter", stat: "physical", T: ALL7, per: 30 / 7, mult: 1.6, cost: 3, setup: (s, L) => (L.buffs.steal = 2),
    check: both(buffIs({ steal: 0 }), twGain(6 + 2)) },
  { id: "cd_all_counter", plus: true, policy: "counter", stat: "physical", T: ALL7, per: 38 / 7, cost: 3, check: twGain(6) },

  // ── 압박형 6 ──
  { id: "cd_front_press", policy: "press", stat: "shoot", T: ATTACK, per: 34 / 4, cost: 5, check: buffIs({ press: 1 }) },
  // 압박 1: 위력 ×1.2, 비용 ×1.2 (round(8.5 × 0.6 × 1.2) = 6)
  { id: "cd_front_press", plus: true, policy: "press", stat: "shoot", T: ATTACK, per: 43 / 4, mult: 1.2, cost: 6, setup: (s, L) => (L.buffs.press = 1), check: buffIs({ press: 2 }) },
  { id: "cd_full_press", policy: "press", stat: "pass", extra: 1, check: buffIs({ press: 2 }) },
  { id: "cd_full_press", plus: true, policy: "press", stat: "pass", extra: 1, check: buffIs({ press: 3 }) },
  // 되찾기 6초: 압박 2 이상이면 비용 증가 없음 (17), 위력 ×1.4
  { id: "cd_six_sec", policy: "press", stat: "pass", taps: ["p4"], T: ["p4"], per: 28, mult: 1.4, cost: 17, setup: (s, L) => (L.buffs.press = 2), check: buffIs({ press: 3 }) },
  { id: "cd_six_sec", plus: true, policy: "press", stat: "pass", taps: ["p4"], T: ["p4"], per: 35, mult: 1.2, cost: R(28 * 0.6 * 1.2), setup: (s, L) => (L.buffs.press = 1) },
  { id: "cd_drop_line", policy: "press", stat: "pass", setup: (s, L) => { L.buffs.press = 3; setStamina(ALL7, 50)(s); },
    check: both(buffIs({ press: 0, nextNoFail: true }), healed(ALL7, 18)) },
  { id: "cd_drop_line", plus: true, policy: "press", stat: "pass", setup: (s, L) => { L.buffs.press = 3; setStamina(ALL7, 50)(s); }, check: healed(ALL7, 24) },
  // 총공세: (30 + 10 × 압박 2) / 7, 비용 = round(50/7 × 0.6 × 1.4) = 6
  { id: "cd_all_out", policy: "press", stat: "physical", T: ALL7, per: 50 / 7, mult: 1.4, cost: 6, setup: (s, L) => (L.buffs.press = 2) },
  { id: "cd_all_out", plus: true, policy: "press", stat: "physical", T: ALL7, per: 58 / 7, mult: 1.4, cost: 6, setup: (s, L) => (L.buffs.press = 2) },
  // 게겐프레싱: 압박 3 이어도 비용 그대로 6, 위력 ×1.6
  { id: "cd_gegen", policy: "press", stat: "shoot", T: ATTACK, per: 10, mult: 1.6, cost: 6, setup: (s, L) => (L.buffs.press = 3) },
  { id: "cd_gegen", plus: true, policy: "press", stat: "shoot", T: ATTACK, per: 12.5, cost: 6 },

  // ── 점유형 6 ──
  // 삼각형 패스: MF 짝 성공 → 점유 +2 + 기본 +1 = +3, 팀워크 짝 +2 + 카드 +2
  { id: "cd_triangle", policy: "poss", stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 18, cost: 11, check: both(buffIs({ poss: 3 }), twGain(4)) },
  { id: "cd_triangle", plus: true, policy: "poss", stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 23, cost: 11, check: buffIs({ poss: 3 }) },
  { id: "cd_mid_control", policy: "poss", stat: "pass", T: ["p4", "p5"], per: 17, cost: 10, check: buffIs({ poss: 3 }) },
  { id: "cd_mid_control", plus: true, policy: "poss", stat: "pass", T: ["p4", "p5"], per: 21.5, mult: 1.1, cost: 10, setup: (s, L) => (L.buffs.poss = 2), check: buffIs({ poss: 5 }) },
  { id: "cd_circulate", policy: "poss", stat: "pass", setup: setStamina(["p3"], 30), check: both(buffIs({ poss: 3 }), healed(["p3"], 15)) },
  { id: "cd_circulate", plus: true, policy: "poss", stat: "pass", setup: setStamina(["p3"], 30), check: both(buffIs({ poss: 4 }), healed(["p3"], 15)) },
  { id: "cd_tempo", policy: "poss", stat: "pass", check: both(buffIs({ possGuard: 1 }), drawNextIs(1)) },
  { id: "cd_tempo", plus: true, policy: "poss", stat: "pass", check: both(buffIs({ possGuard: 2 }), drawNextIs(1)) },
  // 지배하는 중원: 점유 4 → ×(1 + 0.05 × 4 × 2) = 1.4, MF 가 끼어 +1
  { id: "cd_dominate", policy: "poss", stat: "dribble", T: ATTACK, per: 8, mult: 1.4, cost: 5, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 5 }) },
  { id: "cd_dominate", plus: true, policy: "poss", stat: "dribble", T: ATTACK, per: 10, cost: 5 },
  // 후방 빌드업: MF 없어도 점유 유지 (×1.2)
  { id: "cd_back_build", policy: "poss", stat: "defense", T: DEFENSE, per: 34 / 3, mult: 1.2, cost: 7, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 4 }) },
  { id: "cd_back_build", plus: true, policy: "poss", stat: "defense", T: DEFENSE, per: 43 / 3, mult: 1.2, cost: 7, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 4 }) },
  // 비교: 같은 수비진 카드라도 possKeep 이 없으면 −2
  { id: "cd_defense_org", policy: "poss", stat: "defense", T: DEFENSE, per: 43 / 3, mult: 1.2, cost: 9, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 2 }) },

  // ── 고유 8 (강화 모드 = 배치 포지션의 주 스탯 레슨, 53 · 비용 21 / 강화판 66 · 비용 21) ──
  { id: "cd_u_neria", stat: "defense", T: ["p1"], per: 53, cost: 21 },
  { id: "cd_u_neria", plus: true, stat: "physical", T: ["p1"], per: 66, cost: 21 },
  { id: "cd_u_neria", stat: "shoot", setup: setStamina(["p1"], 50), check: both(healed(["p1"], 15), buffIs({ nextNoFail: true })) },
  { id: "cd_u_neria", plus: true, stat: "shoot", setup: setStamina(["p1"], 50), check: both(healed(["p1"], 25), buffIs({ nextNoFail: true })) },
  { id: "cd_u_dorbina", stat: "defense", T: ["p2"], per: 53, cost: 21 },
  { id: "cd_u_dorbina", plus: true, stat: "defense", T: ["p2"], per: 66, cost: 21 },
  { id: "cd_u_dorbina", stat: "pass", setup: setStamina(ALL7, 50), check: both(healed(DEFENSE, 10), healed(ATTACK, 0)) },
  { id: "cd_u_dorbina", plus: true, stat: "pass", setup: setStamina(ALL7, 50), check: healed(DEFENSE, 15) },
  { id: "cd_u_adeline", stat: "physical", T: ["p3"], per: 53, cost: 21, check: twGain(2) },
  { id: "cd_u_adeline", plus: true, stat: "physical", T: ["p3"], per: 66, cost: 21, check: twGain(2) },
  { id: "cd_u_adeline", stat: "shoot", setup: setStamina(ALL7, 50), check: both(twGain(3), healed(ALL7, 3)) },
  { id: "cd_u_adeline", plus: true, stat: "shoot", setup: setStamina(ALL7, 50), check: both(twGain(4), healed(ALL7, 5)) },
  { id: "cd_u_silluen", stat: "pass", T: ["p4"], per: 53, cost: 21, check: buffIs({ nextPct: 0.2 }) },
  { id: "cd_u_silluen", plus: true, stat: "dribble", T: ["p4"], per: 66, cost: 21, check: buffIs({ nextPct: 0.2 }) },
  { id: "cd_u_silluen", stat: "shoot", check: buffIs({ nextPct: 0.4 }) },
  { id: "cd_u_silluen", plus: true, stat: "shoot", check: buffIs({ nextPct: 0.55 }) },
  { id: "cd_u_taria", stat: "pass", T: ["p5"], per: 53, cost: 21 },
  { id: "cd_u_taria", plus: true, stat: "pass", T: ["p5"], per: 66, cost: 21 },
  { id: "cd_u_taria", stat: "defense", check: drawNextIs(1) },
  { id: "cd_u_taria", plus: true, stat: "defense", check: drawNextIs(2) },
  // 울리카 강화 모드: 주인 53 · 비용 21 + 파트너 18 · 비용 7, 짝 팀워크 +2 + 카드 +1
  { id: "cd_u_ulrika", stat: "shoot", taps: ["p7"], T: ["p6", "p7"], per: [53, 18], cost: [21, 7], check: twGain(3) },
  { id: "cd_u_ulrika", plus: true, stat: "dribble", taps: ["p4"], T: ["p6", "p4"], per: [66, 18], cost: [21, 7], check: twGain(3) },
  { id: "cd_u_ulrika", stat: "defense", check: both(buffIs({ nextPairPct: 0.5 }), twGain(1)) },
  { id: "cd_u_ulrika", plus: true, stat: "defense", check: both(buffIs({ nextPairPct: 0.75 }), twGain(1)) },
  { id: "cd_u_greta", stat: "shoot", T: ["p7"], per: 53, cost: 21 },
  { id: "cd_u_greta", plus: true, stat: "shoot", T: ["p7"], per: 66, cost: 21 },
  { id: "cd_u_greta", stat: "pass", setup: setStamina(["p7"], 50), check: both(buffIs({ nextCostZero: true }), healed(["p7"], 0)) },
  { id: "cd_u_greta", plus: true, stat: "pass", setup: setStamina(["p7"], 50), check: both(buffIs({ nextCostZero: true }), healed(["p7"], 10)) },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, stat: "dribble", T: ["p5"], per: 53, cost: 21 },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, plus: true, stat: "pass", T: ["p5"], per: 66, cost: 21 },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, stat: "shoot", extra: 1, setup: setStamina(["p5"], 50), check: healed(["p5"], -5) },
  { id: "cd_u_mirka", squad: MIRKA_SQUAD, plus: true, stat: "shoot", extra: 1, setup: setStamina(["p5"], 50), check: healed(["p5"], 0) },

  // ── 코치 8 (같은 타입 종목 ×1.3, 유대 80 이상이면 bond80, 강화판 = 그 시점 power × 1.25, 비용은 기본 위력 기준, 낼 때 유대 +8) ──
  { id: "cd_c_harr", stat: "shoot", T: ["p6", "p7"], per: 20, mult: 1.3, cost: 12, check: coachBond("sp_coach_harr", 8) },
  { id: "cd_c_harr", stat: "pass", T: ["p6", "p7"], per: 20, cost: 12 },
  { id: "cd_c_harr", stat: "pass", T: ["p6", "p7"], per: 20, mult: 2, cost: 12, setup: (s, L) => (L.turn = L.turns) },
  { id: "cd_c_harr", stat: "pass", T: ["p6", "p7"], per: 20, cost: 12, setup: (s, L) => (L.turn = L.turns - 1) },
  { id: "cd_c_harr", bond: 80, stat: "pass", T: ["p6", "p7"], per: 20, mult: 2, cost: 12, setup: (s, L) => (L.turn = L.turns - 1) },
  { id: "cd_c_harr", plus: true, stat: "shoot", T: ["p6", "p7"], per: 25, mult: 1.3, cost: 12 },
  { id: "cd_c_celia", stat: "dribble", taps: ["p6", "p7"], T: ["p6", "p7"], per: 20, mult: 1.3, cost: 12, check: both(drawNextIs(1), coachBond("sp_wind_dancer", 8)) },
  { id: "cd_c_celia", bond: 80, stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 24, cost: 12, check: drawNextIs(1) },
  { id: "cd_c_celia", bond: 80, plus: true, stat: "pass", taps: ["p4", "p5"], T: ["p4", "p5"], per: 30, cost: 12 },
  { id: "cd_c_ornella", stat: "pass", T: ATTACK, per: 43 / 4, mult: 1.3, cost: 6, check: twGain(3 + 2) },
  { id: "cd_c_ornella", bond: 80, stat: "shoot", T: ATTACK, per: 50 / 4, cost: 6, check: twGain(3 + 3) },
  { id: "cd_c_ornella", plus: true, stat: "shoot", T: ATTACK, per: 54 / 4, cost: 6 },
  { id: "cd_c_barbara", stat: "defense", T: DEFENSE, per: 43 / 3, mult: 1.3, cost: 9, setup: setStamina(DEFENSE, 15),
    check: ({ pv }, label) => assert.equal(pv.failRate, 0, `${label}: 실패 판정 없음`) },
  { id: "cd_c_barbara", bond: 80, stat: "physical", T: DEFENSE, per: 50 / 3, cost: 9 },
  { id: "cd_c_barbara", plus: true, stat: "pass", T: DEFENSE, per: 54 / 3, cost: 9 },
  { id: "cd_c_barbara", bond: 80, plus: true, stat: "pass", T: DEFENSE, per: R(50 * 1.25) / 3, cost: 9 },
  { id: "cd_c_hanna", stat: "physical", T: ALL7, per: 5, mult: 1.3, cost: 3,
    check: ({ L, pv }, label) => { assert.equal(L.endHeal, 5, label); assert.equal(R(pv.failRate * 100), 0, `${label}: 2% − 5%p`); } },
  { id: "cd_c_hanna", stat: "pass", T: ALL7, per: 5, cost: 3, setup: setStamina(ALL7, 50),
    check: ({ pv }, label) => assert.equal(R(pv.failRate * 100), 5, `${label}: 실패율 10% − 5%p`) },
  { id: "cd_c_hanna", bond: 80, stat: "pass", T: ALL7, per: 5, cost: 3, check: ({ L }, label) => assert.equal(L.endHeal, 10, label) },
  { id: "cd_c_hanna", plus: true, stat: "pass", T: ALL7, per: 44 / 7, cost: 3 },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], stat: "shoot", taps: ["p7"], T: ["p7"], per: 40, mult: 1.3 * 1.5, cost: 24,
    check: coachBond("sp_street_striker", 8) },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], stat: "pass", taps: ["p4"], T: ["p4"], per: 40, cost: 24,
    setup: (s, L) => (L.score = L.target) },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 80, firedEventIds: [] }], stat: "pass", taps: ["p4"], T: ["p4"], per: 48, mult: 1.5, cost: 24 },
  { id: "cd_c_joy", addSupports: [{ id: "sp_street_striker", bond: 10, firedEventIds: [] }], plus: true, stat: "pass", taps: ["p4"], T: ["p4"], per: 50, mult: 1.5, cost: 24 },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 10, firedEventIds: [] }], stat: "pass", taps: ["p4"], T: ["p4"], per: 28, mult: 1.3, cost: 17,
    check: drawNextIs(1) },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 80, firedEventIds: [] }], stat: "shoot", taps: ["p7"], T: ["p7"], per: 28, cost: 17, extra: 1,
    check: drawNextIs(1) },
  { id: "cd_c_irene", addSupports: [{ id: "sp_river_scholar", bond: 10, firedEventIds: [] }], plus: true, stat: "shoot", taps: ["p7"], T: ["p7"], per: 35, cost: 17 },
  { id: "cd_c_lumi", stat: "physical", T: ALL7, per: 30 / 7, mult: 1.3, cost: 3, check: ({ L }, label) => assert.equal(L.lumiFlag, true, label) },
  { id: "cd_c_lumi", bond: 80, stat: "pass", T: ALL7, per: 36 / 7, cost: 3 },
  { id: "cd_c_lumi", plus: true, stat: "pass", T: ALL7, per: 38 / 7, cost: 3 },

  // ── 대비 3 (이번 레슨만 t* uid, 종목이 맞으면 ×1.5) ──
  { id: "cd_p_tackle", stat: "defense", T: DEFENSE, per: 40 / 3, mult: 1.5, cost: 8 },
  { id: "cd_p_tackle", stat: "physical", T: DEFENSE, per: 40 / 3, mult: 1.5, cost: 8 },
  { id: "cd_p_tackle", stat: "pass", T: DEFENSE, per: 40 / 3, cost: 8 },
  { id: "cd_p_intercept", stat: "defense", T: DEFENSE, per: 40 / 3, mult: 1.5, cost: 8 },
  { id: "cd_p_intercept", stat: "pass", T: DEFENSE, per: 40 / 3, mult: 1.5, cost: 8 },
  { id: "cd_p_intercept", stat: "physical", T: DEFENSE, per: 40 / 3, cost: 8 },
  { id: "cd_p_hold", stat: "defense", T: ["p2", "p3"], per: 20, mult: 1.5, cost: 12 },
  { id: "cd_p_hold", stat: "physical", T: ["p2", "p3"], per: 20, cost: 12 },
];

test("카드 효과 표: 66장 모두 표에 있고 기본판 · 강화판(대비 제외)을 낸다", () => {
  const all = cards.cardList(data);
  assert.equal(all.length, 66);
  for (const c of all) {
    assert.ok(CASES.some((x) => x.id === c.id && !x.plus), `${c.id} 기본판이 표에 없다`);
    if (cards.canUpgrade(c)) assert.ok(CASES.some((x) => x.id === c.id && x.plus), `${c.id} 강화판이 표에 없다`);
  }
  for (const c of all.filter((x) => x.family === "unique")) {
    for (const plus of [false, true]) {
      const modes = new Set(CASES.filter((x) => x.id === c.id && !!x.plus === plus).map((x) => (x.T && x.T.length ? "power" : "support")));
      assert.deepEqual([...modes].sort(), ["power", "support"], `${c.id}${plus ? "+" : ""}: 두 모드`);
    }
  }
  for (const c of all.filter((x) => x.family === "coach")) {
    assert.ok(CASES.some((x) => x.id === c.id && (x.bond === 80 || (x.addSupports || []).some((a) => a.bond >= 80))), `${c.id}: 유대 80판`);
    assert.ok(CASES.some((x) => x.id === c.id && (x.mult ?? 1) >= 1.3 && x.stat === c.coach.type), `${c.id}: 같은 타입 ×1.3`);
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
  // 역습형 카드를 팀형 런에서: 탈취를 쓰지 않고 (배율 없음), 수비진 성공에 쌓지 않는다 (카드의 steal 효과는 쌓인다)
  runCase({ id: "cd_counter_sprint", policy: "team", stat: "shoot", T: ATTACK, per: 9, cost: 5, setup: (s, L) => (L.buffs.steal = 3), check: buffIs({ steal: 3 }) });
  runCase({ id: "cd_line_up", policy: "team", stat: "defense", T: DEFENSE, per: 32 / 3, cost: 6, check: buffIs({ steal: 0 }) });
  runCase({ id: "cd_recover", policy: "ace", stat: "pass", check: buffIs({ steal: 1 }) });
  // 점유형 카드를 에이스형 런에서: 점유 배율 · +1 패시브 없음, 카드의 +2 는 쌓인다
  runCase({ id: "cd_mid_control", policy: "ace", stat: "pass", T: ["p4", "p5"], per: 17, cost: 10, setup: (s, L) => (L.buffs.poss = 4), check: buffIs({ poss: 6 }) });
  // 압박 비용 배율은 방침 게이트가 없다 (§5.3.1 5번), 방침 배율은 압박형만
  runCase({ id: "cd_front_press", policy: "team", stat: "shoot", T: ATTACK, per: 8.5, cost: 6, setup: (s, L) => (L.buffs.press = 1), check: buffIs({ press: 2 }) });
});

test("카드 효과 표: 고유 카드 지원 모드는 비용 · 상승 · 대상 횟수 · 일회성 버프 소비가 없다", () => {
  const r = runCase({ id: "cd_u_greta", policy: "ace", stat: "pass", setup: (s, L) => Object.assign(L.buffs, { hojo: 2, nextPct: 0.4, nextNoFail: true }),
    check: buffIs({ hojo: 2, nextPct: 0.4, nextNoFail: true, nextCostZero: true }) });
  assert.deepEqual(r.L.targeted, {});
});

test("카드 문구: 위력 있는 카드는 해석된 위력 숫자를 문구에 담는다 (기본 · 강화판 · 코치 유대 80판 · 유대 80 + 강화판)", () => {
  for (const c of cards.cardList(data)) {
    const variants = [{ plus: false, bond: 0 }];
    if (cards.canUpgrade(c)) variants.push({ plus: true, bond: 0 });
    if (c.family === "coach") variants.push({ plus: false, bond: 80 }, { plus: true, bond: 80 });
    for (const v of variants) {
      const d = cards.resolveCardDef(data, c.id, v);
      const tag = `${c.id}${v.plus ? "+" : ""}${v.bond ? " 유대80" : ""}`;
      assert.equal(typeof d.desc, "string", tag);
      if (typeof d.power === "number") assert.ok(new RegExp(`(^|\\D)${d.power}(\\D|$)`).test(d.desc), `${tag}: '${d.desc}' 에 위력 ${d.power} 가 없다`);
    }
    if (c.family === "coach") {
      const base = cards.resolveCardDef(data, c.id, { bond: 0 });
      const b80 = cards.resolveCardDef(data, c.id, { bond: 80 });
      assert.notEqual(b80.desc, base.desc, `${c.id}: 유대 80판 문구가 기본과 같다`);
      assert.notEqual(cards.resolveCardDef(data, c.id, { bond: 80, plus: true }).desc, cards.resolveCardDef(data, c.id, { plus: true }).desc, `${c.id}+: 유대 80판 문구`);
    }
  }
  // 효과가 바뀌는 유대 80판 (위력이 그대로인 하르나 · 한나 · 이레네) 은 바뀐 효과를 적는다
  assert.match(cards.resolveCardDef(data, "cd_c_harr", { bond: 80 }).desc, /2턴/);
  assert.match(cards.resolveCardDef(data, "cd_c_hanna", { bond: 80 }).desc, /\+10/);
  assert.match(cards.resolveCardDef(data, "cd_c_irene", { bond: 80 }).desc, /추가 사용 \+1/);
});
