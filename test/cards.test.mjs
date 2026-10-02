// test/cards.test.mjs — LESSON_PROTO_PLAN §4.3 · §4.4 · §9.3 (data/cards.json · lesson.json · policies.json + js/engine/cards.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as cards from "../js/engine/cards.js";
import { formationSlots, slotPosition, FORMATIONS } from "../js/engine/training.js";

const data = loadData();
const ALL = data.cards.cards;
const byId = (id) => ALL.find((c) => c.id === id);

/** 기본 편성(2-2-2) 런 상태 비슷한 것: players 만 있으면 된다 */
function defaultState() {
  const roster = run.buildRoster({ data });
  return { players: roster.players, supports: roster.supports, lesson: null };
}
const pid = (state, charId) => state.players.find((p) => p.charId === charId).id;

test("카드 66장 · id 중복 없음 · 계열별 장수", () => {
  assert.equal(ALL.length, 66);
  assert.equal(new Set(ALL.map((c) => c.id)).size, 66);
  const count = {};
  for (const c of ALL) count[c.family] = (count[c.family] || 0) + 1;
  assert.deepEqual(count, { common: 13, ace: 8, team: 8, counter: 6, press: 6, poss: 6, unique: 8, coach: 8, prep: 3 });
  assert.deepEqual(ALL.filter((c) => c.start).map((c) => c.id), data.lesson.startDeck);
  assert.equal(ALL.filter((c) => c.pool).length, 10 + 8 + 8 + 6 + 6 + 6);
  for (const c of ALL) if (["unique", "coach", "prep"].includes(c.family)) assert.equal(c.pool, false, c.id);
});

test("validateCardsData: 실제 데이터 통과 · 목록 밖 키 거절", () => {
  assert.equal(cards.validateCardsData(data), true);
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d.cards.cards, d);
    assert.throws(() => cards.validateCardsData(d), re);
  };
  bad((L) => { L[3].mods.superBuff = true; }, /알 수 없는 mod 'superBuff'/);
  bad((L) => { L[3].effects.push({ type: "teleport" }); }, /알 수 없는 effect 'teleport'/);
  bad((L) => { L[0].plus.weird = 1; }, /plus 에 없는 필드 'weird'/);
  bad((L) => { L.find((c) => c.id === "cd_icing").effects[0].extra = 1; }, /없는 필드 'extra'/);
  bad((L) => { L.find((c) => c.id === "cd_set_piece").effects[0].when = "sometimes"; }, /when 'sometimes'/);
  bad((L) => { L.find((c) => c.id === "cd_u_neria").ownerCharId = "ch_nobody"; }, /characters 에 없습니다/);
  bad((L) => { L.find((c) => c.id === "cd_c_harr").coach.supportId = "sp_nobody"; }, /supports 에 없습니다/);
  bad((L) => { L.push(clone(L[0])); }, /id 가 겹칩니다/);
  bad((L) => { L.find((c) => c.id === "cd_fw_drill").target.line = "ST"; }, /포지션이 아닙니다/);
  bad((L, d) => { d.lesson.startDeck.push("cd_fw_drill"); }, /시작 카드가 아닙니다/);
  bad((L, d) => { d.policies.policies.pop(); }, /policies 는/);
});

test("모든 ownerCharId · coach.supportId 가 데이터에 있고 선수 · 서포트마다 1장", () => {
  const owners = ALL.filter((c) => c.family === "unique").map((c) => c.ownerCharId).sort();
  assert.deepEqual(owners, data.characters.map((c) => c.id).sort());
  const coaches = ALL.filter((c) => c.family === "coach").map((c) => c.coach.supportId).sort();
  assert.deepEqual(coaches, data.supports.map((s) => s.id).sort());
  for (const c of ALL.filter((x) => x.family === "coach")) {
    const sp = data.supports.find((s) => s.id === c.coach.supportId);
    // 코치 타입은 카드가 기준 (루미 = physical, 옛 supports.json 은 friend)
    if (sp.type !== "friend") assert.equal(c.coach.type, sp.type, c.id);
  }
  assert.equal(byId("cd_c_lumi").coach.type, "physical");
});

test("effects · mods 키가 닫힌 목록 안에 있다 (plus · bond80 · support 포함)", () => {
  const effs = [];
  const mods = [];
  for (const c of ALL) {
    effs.push(...c.effects);
    mods.push(...Object.keys(c.mods));
    if (c.plus) {
      effs.push(...(c.plus.effects || []), ...((c.plus.support && c.plus.support.effects) || []));
      mods.push(...Object.keys(c.plus.mods || {}));
    }
    if (c.bond80) {
      effs.push(...(c.bond80.effects || []));
      mods.push(...Object.keys(c.bond80.mods || {}));
    }
    if (c.support) effs.push(...c.support.effects);
  }
  for (const e of effs) assert.ok(cards.EFFECT_TYPES[e.type], e.type);
  for (const k of mods) assert.ok(cards.MOD_KEYS[k], k);
  // 계획 §4.3 의 effects 목록이 모두 실제로 쓰인다
  const used = new Set(effs.map((e) => e.type));
  for (const t of Object.keys(cards.EFFECT_TYPES)) assert.ok(used.has(t), `쓰이지 않는 effect ${t}`);
  const usedMods = new Set(mods);
  for (const k of Object.keys(cards.MOD_KEYS)) assert.ok(usedMods.has(k), `쓰이지 않는 mod ${k}`);
});

test("§4.4 표의 위력 · 강화판 위력", () => {
  const table = {
    cd_basic: [35, 44], cd_coaching: [35, 44], cd_fw_drill: [40, 50], cd_mf_drill: [40, 50], cd_df_drill: [40, 50],
    cd_gk_session: [38, 48], cd_attack_build: [43, 54], cd_defense_org: [43, 54], cd_one_two: [20, 25], cd_one_on_one: [48, 60],
    cd_ace_training: [30, 38], cd_one_point: [25, 31], cd_break_limit: [65, 81],
    cd_set_piece: [30, 38], cd_pass_move: [15, 19], cd_one_team: [28, 35], cd_link_line: [35, 44],
    cd_line_up: [32, 40], cd_counter_sprint: [36, 45], cd_finisher: [30, 38], cd_all_counter: [30, 38],
    cd_front_press: [34, 43], cd_six_sec: [28, 35], cd_all_out: [30, 38], cd_gegen: [40, 50],
    cd_triangle: [18, 23], cd_mid_control: [34, 43], cd_dominate: [32, 40], cd_back_build: [34, 43],
    cd_u_neria: [53, 66], cd_u_ulrika: [53, 66], cd_u_mirka: [53, 66],
    cd_c_harr: [40, 50], cd_c_celia: [20, 25], cd_c_ornella: [43, 54], cd_c_barbara: [43, 54], cd_c_hanna: [35, 44],
    cd_c_joy: [40, 50], cd_c_irene: [28, 35], cd_c_lumi: [30, 38],
  };
  for (const [id, [base, plus]] of Object.entries(table)) {
    assert.equal(cards.resolveCardDef(data, id).power, base, id);
    assert.equal(cards.resolveCardDef(data, id, { plus: true }).power, plus, `${id}+`);
  }
  // 위력 없는 카드의 강화판 (D13)
  const eff = (id, plus) => cards.resolveCardDef(data, id, { plus }).effects;
  assert.deepEqual(eff("cd_hojo_up", true), [{ type: "hojo", n: 4 }]);
  assert.deepEqual(eff("cd_tactics_board", true), [{ type: "drawNext", n: 2 }, { type: "extraPlay", n: 1 }]);
  assert.deepEqual(eff("cd_mood_maker", true), [{ type: "mood", n: 1 }, { type: "moodX2" }]);
  assert.deepEqual(eff("cd_drop_line", false), [{ type: "pressDrop", perStage: 6 }, { type: "nextNoFail" }]);
  assert.deepEqual(eff("cd_tempo", true), [{ type: "possGuard", n: 2 }, { type: "drawNext", n: 1 }]);
  assert.equal(byId("cd_mood_maker").exhaust, true);
  assert.equal(ALL.filter((c) => c.exhaust).length, 1);
  // 고유 지원 모드 강화판
  const sup = (id, plus) => cards.resolveCardDef(data, id, { plus }).support.effects;
  assert.deepEqual(sup("cd_u_silluen", true), [{ type: "nextPct", pct: 0.55 }]);
  assert.deepEqual(sup("cd_u_ulrika", true), [{ type: "nextPairPct", pct: 0.75 }, { type: "teamwork", n: 1 }]);
  assert.deepEqual(sup("cd_u_greta", true), [{ type: "nextCostZero" }, { type: "heal", to: "owner", n: 10 }]);
  assert.deepEqual(sup("cd_u_mirka", false), [{ type: "extraPlay", n: 1 }, { type: "heal", to: "owner", n: -5 }]);
  assert.deepEqual(sup("cd_u_mirka", true), [{ type: "extraPlay", n: 1 }]);
});

test("resolveCardDef: plus · bond80 덮어쓰기 순서 · 원본 불변", () => {
  const before = JSON.stringify(data.cards);
  // 유대 80 문턱
  assert.equal(cards.resolveCardDef(data, "cd_c_celia", { bond: 79 }).power, 20);
  const c80 = cards.resolveCardDef(data, "cd_c_celia", { bond: 80 });
  assert.equal(c80.power, 24);
  assert.equal(c80.bond80, true);
  // 코치 강화판 = bond80 뒤 power × 1.25
  assert.equal(cards.resolveCardDef(data, "cd_c_celia", { bond: 80, plus: true }).power, 30);
  assert.equal(cards.resolveCardDef(data, "cd_c_celia", { bond: 0, plus: true }).power, 25);
  // mods · effects 덮어쓰기
  assert.deepEqual(cards.resolveCardDef(data, "cd_c_harr", { bond: 90 }).mods, { lastTurnX2: 2 });
  assert.deepEqual(cards.resolveCardDef(data, "cd_c_harr", { bond: 10 }).mods, { lastTurnX2: 1 });
  const orn = cards.resolveCardDef(data, "cd_c_ornella", { bond: 100, plus: true });
  assert.equal(orn.power, 63); // round(50 × 1.25) = 62.5 → 63
  assert.deepEqual(orn.effects, [{ type: "teamwork", n: 3 }]);
  assert.deepEqual(cards.resolveCardDef(data, "cd_c_irene", { bond: 80 }).effects, [{ type: "drawNext", n: 1 }, { type: "extraPlay", n: 1 }]);
  assert.deepEqual(cards.resolveCardDef(data, "cd_c_hanna", { bond: 80 }).effects, [{ type: "endHeal", n: 10 }]);
  // 코치가 아니면 bond 를 무시
  assert.equal(cards.resolveCardDef(data, "cd_basic", { bond: 100 }).bond80, false);
  // 해석 결과 필드
  const fw = cards.resolveCardDef(data, "cd_fw_drill", { plus: true });
  assert.equal(fw.plus, true);
  assert.equal(fw.basePower, 40);
  assert.equal(fw.costRate, 0.6);
  assert.equal(fw.desc, byId("cd_fw_drill").descPlus);
  assert.equal(cards.resolveCardDef(data, "cd_u_taria").costRate, 0.4);
  assert.equal(cards.resolveCardDef(data, "cd_one_on_one").costRate, 0.66);
  // 대비 카드는 강화할 수 없다
  assert.equal(cards.canUpgrade(byId("cd_p_tackle")), false);
  assert.equal(cards.canUpgrade(byId("cd_c_lumi")), true);
  assert.throws(() => cards.resolveCardDef(data, "cd_p_hold", { plus: true }), /강화할 수 없습니다/);
  assert.throws(() => cards.getCard(data, "cd_nope"), /찾을 수 없습니다/);
  // 해석 결과를 바꿔도 원본은 그대로
  const r = cards.resolveCardDef(data, "cd_c_harr", { bond: 90 });
  r.mods.lastTurnX2 = 99;
  r.target.line = "GK";
  assert.equal(JSON.stringify(data.cards), before);
  // JSON 순수 객체
  assert.deepEqual(JSON.parse(JSON.stringify(orn)), orn);
});

test("mainStatsOf", () => {
  assert.deepEqual(cards.mainStatsOf("GK"), ["defense", "physical"]);
  assert.deepEqual(cards.mainStatsOf("DF"), ["defense", "physical"]);
  assert.deepEqual(cards.mainStatsOf("MF"), ["dribble", "pass"]);
  assert.deepEqual(cards.mainStatsOf("FW"), ["shoot", "dribble"]);
  assert.throws(() => cards.mainStatsOf("ST"), /알 수 없는 포지션/);
});

test("2-2-2 기본 편성의 1인 비용 = CARDS 초안 표", () => {
  const state = defaultState();
  const tapsFor = (def) => {
    const { need, candidates } = cards.tapCandidates(state, def, { mode: "power" });
    return candidates.slice(0, need);
  };
  /** 각 대상의 비용 (모두 같아야 한다) */
  const cost = (id, extra = {}) => {
    const def = cards.resolveCardDef(data, id);
    const T = cards.targetsFor(state, def, tapsFor(def), { mode: "power" });
    const costs = T.map((_, i) => cards.staminaCost(def, { count: T.length, partner: !!def.target.partner && i === 1, ...extra }));
    return def.target.partner ? costs : [...new Set(costs)].length === 1 ? costs[0] : costs;
  };
  // OUTGAME_CARDS_draft.md 1~3장 표의 "비용 (2-2-2)" 칸
  const draft = {
    cd_basic: 3, cd_coaching: 21, cd_fw_drill: 12, cd_mf_drill: 12, cd_df_drill: 12, cd_gk_session: 23,
    cd_attack_build: 6, cd_defense_org: 9, cd_one_two: 12, cd_one_on_one: 32,
    cd_ace_training: 18, cd_one_point: 15, cd_break_limit: 39,
    cd_set_piece: 5, cd_pass_move: 9, cd_one_team: 2, cd_link_line: 7,
    cd_line_up: 6, cd_counter_sprint: 5, cd_finisher: 18, cd_all_counter: 3,
    cd_front_press: 5, cd_six_sec: 17, cd_all_out: 3, cd_gegen: 6,
    cd_triangle: 11, cd_mid_control: 10, cd_dominate: 5, cd_back_build: 7,
    cd_u_neria: 21, cd_u_dorbina: 21, cd_u_adeline: 21, cd_u_silluen: 21, cd_u_taria: 21, cd_u_greta: 21,
    // 이 계획이 정한 것 (코치 · 대비 카드는 초안 표에 비용 칸이 없다 — 같은 식)
    cd_c_harr: 12, cd_c_celia: 12, cd_c_ornella: 6, cd_c_barbara: 9, cd_c_hanna: 3, cd_c_joy: 24, cd_c_irene: 17, cd_c_lumi: 3,
    cd_p_tackle: 8, cd_p_intercept: 8, cd_p_hold: 12,
  };
  for (const [id, want] of Object.entries(draft)) assert.equal(cost(id), want, id);
  // 울리카 강화 모드: 주인 21 + 파트너 round(18 × 0.4) = 7 (D25)
  assert.deepEqual(cost("cd_u_ulrika"), [21, 7]);
  // 위력 없는 카드는 비용 0
  for (const id of ["cd_cooldown", "cd_icing", "cd_tactics_board", "cd_hojo_up", "cd_breath"]) {
    assert.equal(cards.staminaCost(cards.resolveCardDef(data, id), { count: 1 }), 0, id);
  }
  // 강화판 · 유대 80 은 비용을 올리지 않는다 (D12)
  const plusDef = cards.resolveCardDef(data, "cd_fw_drill", { plus: true });
  assert.equal(cards.staminaCost(plusDef, { count: 2 }), 12);
  assert.equal(cards.staminaCost(cards.resolveCardDef(data, "cd_c_joy", { bond: 100, plus: true }), { count: 1 }), 24);
  // perMood · perPress 몫은 올린다, 압박 배율 · 비용 0
  assert.equal(cost("cd_link_line", { mood: 2 }), 8); // (35 + 5) / 3 × 0.6 = 8
  assert.equal(cost("cd_all_out", { press: 3 }), 5); // (30 + 30) / 7 × 0.6 = 5.14
  assert.equal(cost("cd_coaching", { pressCostMult: 1.4 }), 29); // 35 × 0.6 × 1.4 = 29.4
  assert.equal(cost("cd_coaching", { costZero: true }), 0);
});

test("targetsFor: 범위 위력 ÷ 인원 (포메이션 4종) · 결장 제외", () => {
  for (const fm of Object.keys(FORMATIONS)) {
    const players = formationSlots(fm).map((slot, i) => ({ id: `p${i + 1}`, charId: `ch_${i}`, slot, position: slotPosition(slot), injuredTurns: 0 }));
    const state = { players, lesson: null };
    const n = (id) => cards.targetsFor(state, cards.resolveCardDef(data, id)).length;
    const f = FORMATIONS[fm];
    assert.equal(n("cd_basic"), 7, fm);
    assert.equal(n("cd_fw_drill"), f.FW, fm);
    assert.equal(n("cd_mf_drill"), f.MF, fm);
    assert.equal(n("cd_df_drill"), f.DF, fm);
    assert.equal(n("cd_gk_session"), 1, fm);
    assert.equal(n("cd_attack_build"), f.MF + f.FW, fm);
    assert.equal(n("cd_defense_org"), 1 + f.DF, fm);
    // 1인 비용 = 합계 ÷ 인원
    const def = cards.resolveCardDef(data, "cd_df_drill");
    assert.equal(cards.costBase(def, { count: f.DF }), 40 / f.DF, fm);
  }
  // 레슨 중이면 lesson.out, 아니면 injuredTurns 로 결장을 본다
  const state = defaultState();
  const fws = state.players.filter((p) => p.position === "FW").map((p) => p.id);
  const fwDrill = cards.resolveCardDef(data, "cd_fw_drill");
  state.players.find((p) => p.id === fws[0]).injuredTurns = 1;
  assert.deepEqual(cards.targetsFor(state, fwDrill), [fws[1]]);
  state.lesson = { stat: "shoot", out: [...fws] };
  assert.deepEqual(cards.targetsFor(state, fwDrill), []);
  assert.equal(cards.deadReason(state, fwDrill), "대상 선수가 없습니다");
  assert.equal(cards.deadReason(state, cards.resolveCardDef(data, "cd_mf_drill")), null);
});

test("tapCandidates · targetsFor: 지명 · 짝 · tap · 탭 검증", () => {
  const state = defaultState();
  const [gk, df1, , mf1, , fw1] = state.players.map((p) => p.id);
  const coaching = cards.resolveCardDef(data, "cd_coaching");
  assert.deepEqual(cards.tapCandidates(state, coaching), { need: 1, candidates: state.players.map((p) => p.id) });
  assert.deepEqual(cards.targetsFor(state, coaching, [df1]), [df1]);
  assert.throws(() => cards.targetsFor(state, coaching, []), /1명을 골라야/);
  assert.throws(() => cards.targetsFor(state, coaching, [df1, mf1]), /1명을 골라야/);
  // 마무리 일격: MF · FW 만
  const fin = cards.resolveCardDef(data, "cd_finisher");
  assert.deepEqual(cards.tapCandidates(state, fin).candidates, state.players.filter((p) => ["MF", "FW"].includes(p.position)).map((p) => p.id));
  assert.throws(() => cards.targetsFor(state, fin, [gk]), /고를 수 없습니다/);
  // 짝: 서로 다른 2명
  const pair = cards.resolveCardDef(data, "cd_one_two");
  assert.ok(cards.isPairCard(pair));
  assert.deepEqual(cards.targetsFor(state, pair, [fw1, mf1]), [fw1, mf1]);
  assert.throws(() => cards.targetsFor(state, pair, [fw1, fw1]), /두 번/);
  // 결장 선수: 지명 · 짝 불가, tap(회복)은 가능 — 상승 대상은 없다
  state.lesson = { stat: "pass", out: [gk] };
  assert.throws(() => cards.targetsFor(state, coaching, [gk]), /고를 수 없습니다/);
  const icing = cards.resolveCardDef(data, "cd_icing");
  assert.deepEqual(cards.tapCandidates(state, icing).need, 1);
  assert.ok(cards.tapCandidates(state, icing).candidates.includes(gk));
  assert.deepEqual(cards.targetsFor(state, icing, [gk]), []);
  // 대상 없는 카드
  const hojo = cards.resolveCardDef(data, "cd_hojo_up");
  assert.deepEqual(cards.targetsFor(state, hojo, []), []);
  assert.throws(() => cards.targetsFor(state, hojo, [mf1]), /0명을 골라야/);
  assert.equal(cards.deadReason(state, hojo), null);
  // 출전 1명뿐이면 짝 카드는 죽은 카드
  state.lesson.out = state.players.slice(1).map((p) => p.id);
  assert.equal(cards.deadReason(state, pair), "고를 수 있는 선수가 없습니다");
});

test("고유 카드 두 모드 · 울리카 파트너 · 명단 밖 주인", () => {
  const state = defaultState();
  const ulrika = pid(state, "ch_wolf_winger");
  const neria = pid(state, "ch_spirit_keeper");
  const u = cards.resolveCardDef(data, "cd_u_ulrika");
  const n = cards.resolveCardDef(data, "cd_u_neria");
  // FW 울리카: 슈팅 · 드리블 = 강화 모드, 패스 = 지원 모드
  assert.equal(cards.cardMode(state, u, "shoot"), "power");
  assert.equal(cards.cardMode(state, u, "dribble"), "power");
  assert.equal(cards.cardMode(state, u, "pass"), "support");
  // GK 네리아: 수비 · 피지컬
  assert.equal(cards.cardMode(state, n, "physical"), "power");
  assert.equal(cards.cardMode(state, n, "shoot"), "support");
  assert.equal(cards.cardMode(state, cards.resolveCardDef(data, "cd_basic"), "shoot"), null);
  // 배치를 바꾸면 모드가 바뀐다 (배치 포지션 기준)
  const moved = clone(state);
  moved.players.find((p) => p.id === ulrika).position = "MF";
  assert.equal(cards.cardMode(moved, u, "shoot"), "support");
  assert.equal(cards.cardMode(moved, u, "pass"), "power");
  // 강화 모드: 주인 + 파트너 1명 (주인은 고를 수 없다)
  state.lesson = { stat: "shoot", out: [] };
  const tc = cards.tapCandidates(state, u);
  assert.equal(tc.need, 1);
  assert.ok(!tc.candidates.includes(ulrika));
  assert.deepEqual(cards.targetsFor(state, u, [neria]), [ulrika, neria]);
  assert.ok(cards.isPairCard(u));
  assert.throws(() => cards.targetsFor(state, u, [ulrika]), /고를 수 없습니다/);
  assert.equal(cards.costBase(u, { partner: true }), 18);
  // 지원 모드: 대상 없음 · 탭 없음
  state.lesson.stat = "pass";
  assert.deepEqual(cards.tapCandidates(state, u), { need: 0, candidates: [] });
  assert.deepEqual(cards.targetsFor(state, u, []), []);
  assert.equal(cards.effectiveKind(u, "support"), "none");
  // 강화 모드인데 파트너 후보가 없으면 지원 모드 (§5.3.2)
  state.lesson = { stat: "shoot", out: state.players.filter((p) => p.id !== ulrika).map((p) => p.id) };
  assert.equal(cards.cardMode(state, u, "shoot"), "support");
  // 주인이 결장이면 강화 모드 카드는 죽은 카드
  state.lesson = { stat: "defense", out: [neria] };
  assert.equal(cards.deadReason(state, n, { mode: "power" }), "주인이 결장 중입니다");
  // 명단에 없는 주인(미르카, 기본 편성 밖)은 지원 모드
  assert.equal(cards.cardMode(state, cards.resolveCardDef(data, "cd_u_mirka"), "pass"), "support");
});

test("lesson.json · policies.json 기본 모양", () => {
  const L = data.lesson;
  assert.equal(L.weeksPerSeason * data.config.seasons, 15);
  assert.deepEqual(L.weekKinds, ["lesson", "free", "lesson", "free", "prep"]);
  assert.deepEqual(L.lesson.turns, [6, 7, 8]);
  assert.deepEqual(L.lesson.targets, [[330, 520], [380, 610], [450, 720]]);
  assert.equal(L.events.support, false);
  assert.equal(L.routeOverrides.rt_hotspring.freeOuting, 1);
  assert.ok(data.routes.some((r) => r.id === "rt_hotspring"));
  assert.deepEqual(data.policies.policies.map((p) => p.id), cards.POLICY_FAMILIES);
  assert.equal(L.defaultPolicy, "team");
});
