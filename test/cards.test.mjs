// test/cards.test.mjs — LESSON_PROTO_PLAN §14.8 · §14.9 · §14.6 (data/cards.json v2 · lesson.json · policies.json + js/engine/cards.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run } from "./helpers.mjs";
import * as cards from "../js/engine/cards.js";
import { ZONE_IDS, distU, inCircle } from "../js/engine/zones.js";

const data = loadData();
/** L52 배치 흔들림을 끈 데이터 (예전 정직한 대형 — 원 판정 약속을 정확한 좌표로 본다) */
const data0 = clone(data);
data0.lesson.zones.jitter = null;
const ALL = data.cards.cards;
const byId = (id) => ALL.find((c) => c.id === id);
const def = (id, opts) => cards.resolveCardDef(data, id, opts);

/** 고정 구역 픽스처 (2-2-2 기본 편성): 수비 p1 p2 · 피지컬 p3 · 패스 p4 p5 · 슈팅 p6 · 드리블 p7 */
const LAYOUT = { p1: "defense", p2: "defense", p3: "physical", p4: "pass", p5: "pass", p6: "shoot", p7: "dribble" };
function layoutState({ zones = LAYOUT, bench = [], out = [] } = {}) {
  const roster = run.buildRoster({ data });
  const z = { ...zones };
  for (const id of out) delete z[id];
  return { players: roster.players, supports: roster.supports, lesson: { zone: "pass", zones: z, bench: bench.slice(), out: out.slice() } };
}
const posOf = (s) => cards.fieldPositions(s, data);

test("카드 76장 · id 중복 없음 · 계열별 장수 · version 2 (§15.7: 공용 13 → 15, §19.12 고유 8 → 16)", () => {
  assert.equal(data.cards.version, 2);
  assert.equal(ALL.length, 76);
  assert.equal(new Set(ALL.map((c) => c.id)).size, 76);
  const count = {};
  for (const c of ALL) count[c.family] = (count[c.family] || 0) + 1;
  assert.deepEqual(count, { common: 15, ace: 8, team: 8, counter: 6, press: 6, poss: 6, unique: 16, coach: 8, prep: 3 });
  assert.deepEqual(ALL.filter((c) => c.start).map((c) => c.id), data.lesson.startDeck);
  assert.equal(ALL.filter((c) => c.pool).length, 12 + 8 + 8 + 6 + 6 + 6);
  for (const c of ALL) if (["unique", "coach", "prep"].includes(c.family)) assert.equal(c.pool, false, c.id);
});

test("닫힌 목록: target kind · size · onlyZones · heal.to (§14.8)", () => {
  assert.deepEqual(cards.TARGET_KINDS, ["single", "circle", "all", "owner", "none"]);
  assert.deepEqual(cards.CIRCLE_SIZES, ["small", "medium", "large"]);
  assert.deepEqual(cards.HEAL_TO, ["target", "all", "defense", "mostTired", "owner", "targets"]);
  assert.deepEqual(cards.PLUS_FIELDS, ["power", "effects", "mods"]);
  for (const c of ALL) {
    assert.ok(cards.TARGET_KINDS.includes(c.target.kind), c.id);
    if (c.target.kind === "circle") assert.ok(cards.CIRCLE_SIZES.includes(c.target.size), c.id);
    else assert.equal(c.target.size, undefined, c.id);
    if (c.target.onlyZones) assert.ok(c.target.onlyZones.every((z) => ZONE_IDS.includes(z)), c.id);
    assert.equal(c.support, undefined, `${c.id}: support 필드는 없어졌다`);
    for (const e of [...c.effects, ...((c.plus && c.plus.effects) || []), ...((c.bond80 && c.bond80.effects) || [])]) {
      if (e.type === "heal") assert.ok(cards.HEAL_TO.includes(e.to), `${c.id}: heal.to ${e.to}`);
    }
  }
  // 회복 단일 3장 (쿨다운 · 아이싱 · 숨 고르기) = single + power null + heal target
  const heals = ALL.filter((c) => cards.isHealSingle(c)).map((c) => c.id);
  assert.deepEqual(heals, ["cd_cooldown", "cd_icing", "cd_breath"]);
  assert.deepEqual(byId("cd_finisher").target, { kind: "single", onlyZones: ["shoot", "dribble", "pass"] });
});

test("validateCardsData: 실제 데이터 통과 · 목록 밖 키 거절", () => {
  assert.equal(cards.validateCardsData(data), true);
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d.cards.cards, d);
    assert.throws(() => cards.validateCardsData(d), re);
  };
  const L = (list, id) => list.find((c) => c.id === id);
  bad((list) => { L(list, "cd_fw_drill").mods.superBuff = true; }, /알 수 없는 mod 'superBuff'/);
  bad((list) => { L(list, "cd_fw_drill").effects.push({ type: "teleport" }); }, /알 수 없는 effect 'teleport'/);
  bad((list) => { list[0].plus.weird = 1; }, /plus 에 없는 필드 'weird'/);
  bad((list) => { L(list, "cd_icing").effects[0].extra = 1; }, /없는 필드 'extra'/);
  bad((list) => { L(list, "cd_set_piece").effects[0].when = "sometimes"; }, /when 'sometimes'/);
  bad((list) => { L(list, "cd_u_neria").ownerCharId = "ch_nobody"; }, /characters 에 없습니다/);
  bad((list) => { L(list, "cd_c_harr").coach.supportId = "sp_nobody"; }, /supports 에 없습니다/);
  bad((list) => { list.push(clone(list[0])); }, /id 가 겹칩니다/);
  bad((list) => { L(list, "cd_fw_drill").target.size = "huge"; }, /원 크기가 아닙니다/);
  bad((list) => { L(list, "cd_fw_drill").target = { kind: "line", line: "FW" }; }, /알 수 없는 target.kind 'line'/);
  bad((list) => { L(list, "cd_finisher").target.onlyZones = ["MF"]; }, /onlyZones 가 잘못됐습니다/);
  bad((list) => { L(list, "cd_coaching").target.size = "small"; }, /target 에 없는 필드 'size'/);
  bad((list) => { L(list, "cd_icing").effects[0].to = "tap"; }, /heal.to' 값이 잘못됐습니다|'heal\.to' 값이 잘못/);
  bad((list) => { L(list, "cd_icing").effects = [{ type: "focus", n: 1 }]; }, /heal target 효과가 있어야/);
  bad((list) => { L(list, "cd_chant").effects[1].to = "target"; }, /heal target 은 위력 없는 단일 카드만/);
  bad((list) => { L(list, "cd_u_neria").support = { effects: [] }; }, /알 수 없는 필드 'support'/);
  bad((list) => { L(list, "cd_u_neria").plus.support = { effects: [] }; }, /plus 에 없는 필드 'support'/);
  bad((list, d) => { d.lesson.startDeck.push("cd_fw_drill"); }, /시작 카드가 아닙니다/);
  bad((list, d) => { d.policies.policies.pop(); }, /policies 는/);
});

test("모든 ownerCharId · coach.supportId 가 데이터에 있고 선수 · 서포트마다 1장", () => {
  const owners = ALL.filter((c) => c.family === "unique").map((c) => c.ownerCharId).sort();
  assert.deepEqual(owners, data.characters.map((c) => c.id).sort());
  const coaches = ALL.filter((c) => c.family === "coach").map((c) => c.coach.supportId).sort();
  assert.deepEqual(coaches, data.supports.map((s) => s.id).sort());
  for (const c of ALL.filter((x) => x.family === "coach")) {
    const sp = data.supports.find((s) => s.id === c.coach.supportId);
    if (sp.type !== "friend") assert.equal(c.coach.type, sp.type, c.id);
  }
  assert.equal(byId("cd_c_lumi").coach.type, "physical");
});

test("effects · mods 키가 닫힌 목록 안에 있고 모두 실제로 쓰인다 (plus · bond80 · 코치 지원 능력 포함)", () => {
  const effs = [];
  const mods = [];
  for (const a of Object.values(data.lesson.attach.abilities)) {
    effs.push(...(a.effects || []));
    mods.push(...Object.keys(a.mods || {}));
  }
  // 고유 카드 모양 (L40 — traits.json lesson 의 mods · effects 도 카드에 합쳐진다)
  for (const t of data.traits) {
    effs.push(...((t.lesson && t.lesson.effects) || []));
    mods.push(...Object.keys((t.lesson && t.lesson.mods) || {}));
  }
  for (const c of ALL) {
    effs.push(...c.effects);
    mods.push(...Object.keys(c.mods));
    if (c.plus) {
      effs.push(...(c.plus.effects || []));
      mods.push(...Object.keys(c.plus.mods || {}));
    }
    if (c.bond80) {
      effs.push(...(c.bond80.effects || []));
      mods.push(...Object.keys(c.bond80.mods || {}));
    }
  }
  for (const e of effs) assert.ok(cards.EFFECT_TYPES[e.type], e.type);
  for (const k of mods) assert.ok(cards.MOD_KEYS[k], k);
  const used = new Set(effs.map((e) => e.type));
  // nextPairPct (다음 작은 원) 는 L40 으로 쓰는 카드가 없어졌다 — effect · 버프 · 칩은 나중 카드용으로 엔진에 남긴다 (§16.6)
  for (const t of Object.keys(cards.EFFECT_TYPES)) if (t !== "nextPairPct") assert.ok(used.has(t), `쓰이지 않는 effect ${t}`);
  assert.ok(!used.has("nextPairPct"), "nextPairPct 를 쓰는 카드가 생기면 위 예외를 지운다");
  const usedMods = new Set(mods);
  for (const k of Object.keys(cards.MOD_KEYS)) assert.ok(usedMods.has(k), `쓰이지 않는 mod ${k}`);
  const usedTo = new Set(effs.filter((e) => e.type === "heal").map((e) => e.to));
  assert.deepEqual([...usedTo].sort(), cards.HEAL_TO.slice().sort());
});

/** §14.9 변환표: [새 대상, 1인 위력, 강화판 1인 위력, 1인 비용]. 고유 카드는 §16.6 (L40 — 주 스탯 구역 ×1.5 없음, 비용 = round(1인 × 0.4)) */
const TABLE = {
  cd_basic: ["all", 6, 8, 4], cd_coaching: ["single", 35, 44, 21], cd_cooldown: ["single", null, null, 0],
  cd_fw_drill: ["circle medium", 18, 23, 11], cd_mf_drill: ["circle medium", 18, 23, 11], cd_df_drill: ["circle medium", 18, 23, 11],
  cd_gk_session: ["circle medium", 17, 21, 10], cd_attack_build: ["circle large", 15, 19, 9], cd_defense_org: ["circle large", 15, 19, 9],
  cd_one_two: ["circle small", 20, 25, 12], cd_pair_drill: ["circle small", 22, 28, 13], cd_pair_stretch: ["circle small", 14, 18, 8],
  cd_one_on_one: ["single", 48, 60, 32], cd_tactics_board: ["none", null, null, 0],
  cd_icing: ["single", null, null, 0],
  cd_hojo_up: ["none", null, null, 0], cd_focus_routine: ["none", null, null, 0], cd_ace_training: ["single", 30, 38, 18],
  cd_one_point: ["single", 25, 31, 15], cd_immerse: ["none", null, null, 0], cd_break_limit: ["single", 65, 81, 39],
  cd_routine: ["none", null, null, 0], cd_breath: ["single", null, null, 0],
  cd_high_five: ["none", null, null, 0], cd_set_piece: ["circle large", 11, 14, 7], cd_pass_move: ["circle small", 15, 19, 9],
  cd_one_team: ["all", 5, 6, 3], cd_chant: ["none", null, null, 0], cd_mood_maker: ["none", null, null, 0],
  cd_breath_together: ["none", null, null, 0], cd_link_line: ["circle large", 12, 15, 7],
  cd_line_up: ["circle large", 11, 14, 7], cd_recover: ["none", null, null, 0], cd_long_ball: ["none", null, null, 0],
  cd_counter_sprint: ["circle large", 13, 16, 8], cd_finisher: ["single", 30, 38, 18], cd_all_counter: ["all", 5, 6, 3],
  cd_front_press: ["circle large", 12, 15, 7], cd_full_press: ["none", null, null, 0], cd_six_sec: ["circle small", 17, 21, 10],
  cd_drop_line: ["none", null, null, 0], cd_all_out: ["all", 5, 6, 3], cd_gegen: ["circle large", 14, 18, 8],
  cd_triangle: ["circle small", 18, 23, 11], cd_mid_control: ["circle medium", 15, 19, 9], cd_circulate: ["none", null, null, 0],
  cd_tempo: ["none", null, null, 0], cd_dominate: ["circle large", 11, 14, 7], cd_back_build: ["circle large", 12, 15, 7],
  // L40 고유 카드: U2 보정 (§16.11 — 위력만, 강화 = round(×1.25), 비용 = roundCost(1인 × 0.4))
  cd_u_neria: ["owner", 20, 25, 8], cd_u_dorbina: ["owner", 21, 26, 8], cd_u_adeline: ["owner", 19, 24, 8],
  cd_u_silluen: ["owner", 20, 25, 8], cd_u_taria: ["owner", 33, 41, 13], cd_u_ulrika: ["owner", 28, 35, 11],
  cd_u_greta: ["owner", 20, 25, 8], cd_u_mirka: ["owner", 25, 31, 10],
  // §19.12 ⑥ 새 고유 8장 (같은 특성 카드 사본, 피니셔 30 (38) — K3 가 위력만 보정)
  cd_u_herta: ["owner", 19, 24, 8], cd_u_bronte: ["owner", 30, 38, 12], cd_u_naelis: ["owner", 20, 25, 8],
  cd_u_coni: ["owner", 33, 41, 13], cd_u_ondina: ["owner", 25, 31, 10], cd_u_risiel: ["owner", 28, 35, 11],
  cd_u_camila: ["owner", 20, 25, 8], cd_u_hildi: ["owner", 30, 38, 12],
  // 코치: 강화판 = 그 시점 위력 × 1.25 (plus 없음)
  cd_c_harr: ["circle medium", 18, 23, 11], cd_c_celia: ["circle small", 20, 25, 12], cd_c_ornella: ["circle large", 15, 19, 9],
  cd_c_barbara: ["circle large", 15, 19, 9], cd_c_hanna: ["all", 6, 8, 4], cd_c_joy: ["circle small", 24, 30, 14],
  cd_c_irene: ["single", 28, 35, 17], cd_c_lumi: ["all", 5, 6, 3],
  cd_p_tackle: ["circle large", 14, null, 8], cd_p_intercept: ["circle large", 14, null, 8], cd_p_hold: ["circle medium", 18, null, 11],
};

test("§14.9 · §15.7 변환표: 대상 · 1인 위력 · 강화판 · 1인 비용 (76장)", () => {
  assert.deepEqual(Object.keys(TABLE).sort(), ALL.map((c) => c.id).sort());
  for (const [id, [target, power, plus, cost]] of Object.entries(TABLE)) {
    const c = byId(id);
    const [kind, size] = target.split(" ");
    assert.equal(c.target.kind, kind, `${id} 대상`);
    assert.equal(c.target.size, size, `${id} 원 크기`);
    assert.equal(def(id).power, power, `${id} 위력`);
    if (cards.canUpgrade(c)) assert.equal(def(id, { plus: true }).power, plus, `${id}+ 위력`);
    else assert.equal(plus, null, `${id}: 강화할 수 없다`);
    assert.equal(cards.staminaCost(def(id)), cost, `${id} 비용`);
    // 강화판은 비용을 올리지 않는다 (D12)
    if (cards.canUpgrade(c)) assert.equal(cards.staminaCost(def(id, { plus: true })), cost, `${id}+ 비용`);
  }
  // 범위에서 바뀐 카드 · 고유 카드 (§16.6) 의 강화판 = round(1인 × 1.25)
  for (const c of ALL) {
    if (!["circle", "all", "owner"].includes(c.target.kind) || !cards.canUpgrade(c)) continue;
    assert.equal(def(c.id, { plus: true }).power, Math.round(c.power * 1.25), `${c.id}+ = round(1인 × 1.25)`);
  }
  // 코치 유대 80판 1인 위력 (강화판 = 유대 80 위력 × 1.25)
  const b80 = { cd_c_celia: [24, 30], cd_c_ornella: [18, 23], cd_c_barbara: [18, 23], cd_c_joy: [29, 36], cd_c_lumi: [6, 8], cd_c_harr: [18, 23], cd_c_hanna: [6, 8], cd_c_irene: [28, 35] };
  for (const [id, [p, pp]] of Object.entries(b80)) {
    assert.equal(def(id, { bond: 80 }).power, p, `${id} 유대80`);
    assert.equal(def(id, { bond: 80, plus: true }).power, pp, `${id} 유대80+`);
    assert.equal(cards.staminaCost(def(id, { bond: 80, plus: true })), TABLE[id][3], `${id} 유대80+ 비용 그대로`);
  }
  // perMood · perPress 는 1인 값 (라인 연동 0.9, 총공세 1.7) — 비용에 들어간다
  assert.deepEqual(byId("cd_link_line").mods, { perMood: 0.9 });
  assert.deepEqual(byId("cd_all_out").mods, { perPress: 1.7 });
  assert.equal(cards.costBase(def("cd_link_line"), { mood: 4 }), 12 + 3.6);
  assert.equal(cards.staminaCost(def("cd_link_line"), { mood: 4 }), 9); // 15.6 × 0.6 = 9.36
  assert.equal(cards.staminaCost(def("cd_all_out"), { press: 3 }), 6); // (5 + 5.1) × 0.6 = 6.06
  assert.equal(cards.staminaCost(def("cd_coaching"), { pressCostMult: 1.4 }), 29); // 35 × 0.6 × 1.4 = 29.4
  assert.equal(cards.staminaCost(def("cd_coaching"), { costZero: true }), 0);
  // 고유 카드 비용 기준 = 1인 위력 그대로 (L40 — mainMult 인자는 없어졌다, 넘겨도 무시)
  assert.equal(cards.costBase(def("cd_u_neria"), { mainMult: 1.5 }), 20);
  assert.equal(cards.staminaCost(def("cd_u_taria"), { mainMult: 1.5 }), 13); // 33 × 0.4 = 13.2
});

test("위력 없는 카드의 강화판 · 고유 카드 effects = 예전 지원 효과 (§14.8)", () => {
  const eff = (id, plus) => def(id, { plus }).effects;
  assert.deepEqual(eff("cd_hojo_up", true), [{ type: "hojo", n: 4 }]);
  assert.deepEqual(eff("cd_tactics_board", true), [{ type: "drawNext", n: 2 }, { type: "extraPlay", n: 1 }]);
  assert.deepEqual(eff("cd_mood_maker", true), [{ type: "mood", n: 1 }, { type: "moodX2" }]);
  assert.deepEqual(eff("cd_drop_line", false), [{ type: "pressDrop", perStage: 6 }, { type: "nextNoFail" }]);
  assert.deepEqual(eff("cd_tempo", true), [{ type: "possGuard", n: 2 }, { type: "drawNext", n: 1 }]);
  assert.deepEqual(eff("cd_cooldown", false), [{ type: "heal", to: "target", n: 20 }, { type: "extraPlay", n: 1 }]);
  assert.deepEqual(eff("cd_icing", true), [{ type: "heal", to: "target", n: 40 }]);
  assert.equal(byId("cd_mood_maker").exhaust, true);
  assert.equal(ALL.filter((c) => c.exhaust).length, 1);
  // 고유 카드 (L40 · §16.6): 남긴 성격 효과 = 카드 effects, 모양 효과 (주장 팀워크 +2 · 크로스 팀워크 +1) 는 해석에서 카드 효과 앞에 합쳐진다
  const kept = {
    cd_u_neria: [[{ type: "heal", to: "owner", n: 10 }], [{ type: "heal", to: "owner", n: 15 }]],
    cd_u_dorbina: [[{ type: "heal", to: "defense", n: 10 }], [{ type: "heal", to: "defense", n: 15 }]],
    cd_u_adeline: [[{ type: "heal", to: "all", n: 3 }], [{ type: "heal", to: "all", n: 5 }]],
    cd_u_silluen: [[], []],
    cd_u_taria: [[{ type: "drawNext", n: 1 }], [{ type: "drawNext", n: 2 }]],
    cd_u_ulrika: [[], []],
    cd_u_greta: [[{ type: "nextCostZero" }], [{ type: "nextCostZero" }, { type: "heal", to: "owner", n: 10 }]],
    cd_u_mirka: [[{ type: "extraPlay", n: 1 }, { type: "heal", to: "owner", n: -5 }], [{ type: "extraPlay", n: 1 }]],
    // §19.12 ⑥ 새 8장 = 같은 특성 카드의 남긴 효과 (피니셔 2장은 효과 없음)
    cd_u_herta: [[{ type: "heal", to: "all", n: 3 }], [{ type: "heal", to: "all", n: 5 }]],
    cd_u_bronte: [[], []],
    cd_u_naelis: [[], []],
    cd_u_coni: [[{ type: "drawNext", n: 1 }], [{ type: "drawNext", n: 2 }]],
    cd_u_ondina: [[{ type: "extraPlay", n: 1 }, { type: "heal", to: "owner", n: -5 }], [{ type: "extraPlay", n: 1 }]],
    cd_u_risiel: [[], []],
    cd_u_camila: [[{ type: "nextCostZero" }], [{ type: "nextCostZero" }, { type: "heal", to: "owner", n: 10 }]],
    cd_u_hildi: [[], []],
  };
  const shapeEff = { cd_u_adeline: [{ type: "teamwork", n: 2 }], cd_u_ulrika: [{ type: "teamwork", n: 1 }], cd_u_herta: [{ type: "teamwork", n: 2 }], cd_u_risiel: [{ type: "teamwork", n: 1 }] };
  for (const [id, [base, plus]] of Object.entries(kept)) {
    assert.deepEqual(byId(id).effects, base, `${id} 원본`);
    assert.deepEqual((byId(id).plus && byId(id).plus.effects) || base, plus, `${id}+ 원본`);
    assert.deepEqual(eff(id, false), [...(shapeEff[id] || []), ...base], id);
    assert.deepEqual(eff(id, true), [...(shapeEff[id] || []), ...plus], `${id}+`);
    assert.equal(byId(id).costRate, 0.4, id);
    assert.deepEqual(byId(id).target, { kind: "owner" }, id);
    // 지운 효과 (§16.6): 네리아 다음 카드 실패 없음 · 아델린 팀워크 +3 · 실루엔 다음 카드 +% · 울리카 다음 작은 원 +%
    for (const e of [...eff(id, false), ...eff(id, true)]) assert.ok(!["nextNoFail", "nextPct", "nextPairPct"].includes(e.type), `${id}: ${e.type}`);
  }
  // 철벽: 모양 mods.noFail 이 카드 mods 에 (강화판도), 원본 · baseMods 는 그대로
  assert.deepEqual(def("cd_u_dorbina").mods, { noFail: true });
  assert.deepEqual(def("cd_u_dorbina", { plus: true }).mods, { noFail: true });
  assert.deepEqual(byId("cd_u_dorbina").mods, {});
  assert.deepEqual(def("cd_u_dorbina").baseMods, {});
  for (const id of Object.keys(kept)) if (id !== "cd_u_dorbina") assert.deepEqual(def(id).mods, {}, id);
});

test("resolveCardDef: plus · bond80 덮어쓰기 순서 · 원본 불변", () => {
  const before = JSON.stringify(data.cards);
  assert.equal(def("cd_c_celia", { bond: 79 }).power, 20);
  const c80 = def("cd_c_celia", { bond: 80 });
  assert.equal(c80.power, 24);
  assert.equal(c80.bond80, true);
  assert.equal(def("cd_c_celia", { bond: 80, plus: true }).power, 30);
  assert.equal(def("cd_c_celia", { bond: 0, plus: true }).power, 25);
  assert.deepEqual(def("cd_c_harr", { bond: 90 }).mods, { lastTurnX2: 2 });
  assert.deepEqual(def("cd_c_harr", { bond: 10 }).mods, { lastTurnX2: 1 });
  const orn = def("cd_c_ornella", { bond: 100, plus: true });
  assert.equal(orn.power, 23); // round(18 × 1.25) = 22.5 → 23
  assert.deepEqual(orn.effects, [{ type: "teamwork", n: 3 }]);
  assert.deepEqual(def("cd_c_irene", { bond: 80 }).effects, [{ type: "drawNext", n: 1 }, { type: "extraPlay", n: 1 }]);
  assert.deepEqual(def("cd_c_hanna", { bond: 80 }).effects, [{ type: "endHeal", n: 10 }]);
  assert.equal(def("cd_basic", { bond: 100 }).bond80, false);
  const fw = def("cd_fw_drill", { plus: true });
  assert.equal(fw.plus, true);
  assert.equal(fw.basePower, 18);
  assert.equal(fw.costRate, 0.6);
  assert.equal(fw.desc, byId("cd_fw_drill").descPlus);
  assert.deepEqual(fw.target, { kind: "circle", size: "medium" });
  assert.equal(def("cd_u_taria").costRate, 0.4);
  assert.equal(def("cd_one_on_one").costRate, 0.66);
  assert.equal(cards.canUpgrade(byId("cd_p_tackle")), false);
  assert.equal(cards.canUpgrade(byId("cd_c_lumi")), true);
  assert.throws(() => def("cd_p_hold", { plus: true }), /강화할 수 없습니다/);
  assert.throws(() => cards.getCard(data, "cd_nope"), /찾을 수 없습니다/);
  const r = def("cd_c_harr", { bond: 90 });
  r.mods.lastTurnX2 = 99;
  r.target.size = "large";
  assert.equal(JSON.stringify(data.cards), before);
  assert.deepEqual(JSON.parse(JSON.stringify(orn)), orn);
});

test("mainStatsOf", () => {
  assert.deepEqual(cards.mainStatsOf("GK"), ["defense", "physical"]);
  assert.deepEqual(cards.mainStatsOf("DF"), ["defense", "physical"]);
  assert.deepEqual(cards.mainStatsOf("MF"), ["dribble", "pass"]);
  assert.deepEqual(cards.mainStatsOf("FW"), ["shoot", "dribble"]);
  assert.throws(() => cards.mainStatsOf("ST"), /알 수 없는 포지션/);
});

test("지운 export: 탭 · 모드 · 범위 ÷ 인원 (§14.6 · §14.8)", () => {
  for (const k of ["tapCandidates", "validateTaps", "isPairCard", "cardMode", "effectiveKind", "RANGE_KINDS", "PER_PLAYER_KINDS"]) {
    assert.equal(cards[k], undefined, k);
  }
});

test("targetsFor: 원 = 원 안의 경기장 선수 (경계 포함) · 0명이면 throw · 벤치 · 결장 제외 (jitter null = 예전 대형)", () => {
  const data = data0;
  const posOf = (s) => cards.fieldPositions(s, data0);
  const s = layoutState();
  const pos = posOf(s);
  assert.deepEqual(pos.p1, { x: 16.5, y: 30 });
  assert.deepEqual(pos.p2, { x: 23.5, y: 30 });
  const medium = def("cd_fw_drill");
  const small = def("cd_one_two");
  const large = def("cd_defense_org");
  // 중간 원: 구역 중심 → 그 구역 전원, 이웃 구역은 0명
  assert.deepEqual(cards.targetsFor(s, medium, { at: data.lesson.zones.centers.defense }, data), ["p1", "p2"]);
  assert.deepEqual(cards.targetsFor(s, medium, { at: data.lesson.zones.centers.pass }, data), ["p4", "p5"]);
  // 작은 원: 두 명 사이 → 2명, 한 명 위 → 1명
  assert.deepEqual(cards.targetsFor(s, small, { at: { x: 20, y: 30 } }, data), ["p1", "p2"]);
  assert.deepEqual(cards.targetsFor(s, small, { at: pos.p1 }, data), ["p1"]);
  // 큰 원: 수비–피지컬 가운데 → 두 무리 전원, 패스 구역은 들어오지 않는다
  assert.deepEqual(cards.targetsFor(s, large, { at: { x: 27.5, y: 51 } }, data), ["p1", "p2", "p3"]);
  // 경계 포함: 놓은 점에서 정확히 r 떨어진 선수
  const r = data.lesson.zones.radius.small;
  assert.deepEqual(cards.targetsFor(s, small, { at: { x: pos.p6.x - r, y: pos.p6.y } }, data), ["p6"]);
  assert.throws(() => cards.targetsFor(s, small, { at: { x: pos.p6.x - r - 0.01, y: pos.p6.y } }, data), /원 안에 선수가 없습니다/);
  assert.throws(() => cards.targetsFor(s, medium, {}, data), /at/);
  // 놓은 점은 필드 안으로 자른다
  assert.deepEqual(cards.targetsFor(s, large, { at: { x: 90, y: -50 } }, data), ["p6"]); // (90, 0) 으로 잘린다
  // 벤치 · 결장은 대상이 아니고, 남은 선수의 대형이 다시 계산된다
  const b = layoutState({ bench: ["p2"] });
  assert.deepEqual(posOf(b).p1, { x: 20, y: 30 });
  assert.deepEqual(cards.targetsFor(b, medium, { at: data.lesson.zones.centers.defense }, data), ["p1"]);
  const o = layoutState({ out: ["p1"] });
  assert.deepEqual(cards.targetsFor(o, medium, { at: data.lesson.zones.centers.defense }, data), ["p2"]);
  // 전체 = 경기장 선수 전원
  assert.deepEqual(cards.targetsFor(layoutState({ bench: ["p3"], out: ["p7"] }), def("cd_basic"), {}, data), ["p1", "p2", "p4", "p5", "p6"]);
  assert.deepEqual(cards.targetsFor(s, def("cd_hojo_up"), {}, data), []);
});

test("L52 targetsFor: 흔들린 대형에서도 원 판정 = 엔진 위치 (원 안 전원) · 중간 원 구역 중심 = 그 구역 전원 · 작은 원 한 명 위 = 1명", () => {
  const Z = data.lesson.zones;
  const medium = def("cd_fw_drill");
  const small = def("cd_one_two");
  const large = def("cd_defense_org");
  for (let turn = 1; turn <= 12; turn++) {
    const s = layoutState();
    s.lesson.turn = turn;
    s.lesson.layoutSeed = 1000 + turn * 7;
    const pos = posOf(s);
    assert.ok(distU(pos.p1, Z.centers.defense, Z.aspect) <= Z.jitter.maxR + 1e-9, "구역 바닥 안");
    assert.deepEqual(cards.targetsFor(s, medium, { at: Z.centers.defense }, data), ["p1", "p2"]);
    assert.deepEqual(cards.targetsFor(s, medium, { at: Z.centers.pass }, data), ["p4", "p5"]);
    for (const id of Object.keys(pos)) assert.deepEqual(cards.targetsFor(s, small, { at: pos[id] }, data), [id], `turn ${turn} ${id}`);
    const at = { x: 27.5, y: 51 };
    const got = cards.targetsFor(s, large, { at }, data);
    assert.deepEqual(got, inCircle(pos, at, Z.radius.large, Z.aspect));
    assert.ok(!got.includes("p4") && !got.includes("p5"), "큰 원 수비–피지컬 가운데: 패스 구역은 들어오지 않는다");
  }
});

test("targetsFor: 단일 = pickR 안 가장 가까운 후보 · onlyZones · 회복 단일은 7명 (결장 · 벤치 포함) · 주인", () => {
  const s = layoutState();
  const pos = posOf(s);
  const coaching = def("cd_coaching");
  assert.deepEqual(cards.targetsFor(s, coaching, { at: pos.p6 }, data), ["p6"]);
  assert.deepEqual(cards.targetsFor(s, coaching, { at: { x: pos.p6.x + 2.9, y: pos.p6.y } }, data), ["p6"]);
  assert.throws(() => cards.targetsFor(s, coaching, { at: { x: pos.p6.x + 3.2, y: pos.p6.y } }, data), /고를 수 있는 선수가 없습니다/);
  // 두 선수 사이: 가까운 쪽 (같으면 슬롯 순서)
  assert.deepEqual(cards.targetsFor(s, coaching, { at: { x: 22, y: 30 } }, data), ["p2"]);
  assert.deepEqual(cards.targetsFor(s, coaching, { playerId: "p4" }, data), ["p4"]);
  assert.throws(() => cards.targetsFor(s, coaching, {}, data), /선수 위에/);
  assert.throws(() => cards.targetsFor(layoutState({ bench: ["p4"] }), coaching, { playerId: "p4" }, data), /고를 수 없습니다/);
  // 마무리 일격: 슈팅 · 드리블 · 패스 구역에 선 선수만
  const fin = def("cd_finisher");
  assert.deepEqual(cards.singleCandidates(s, fin), ["p4", "p5", "p6", "p7"]);
  assert.throws(() => cards.targetsFor(s, fin, { at: pos.p1 }, data), /고를 수 있는 선수가 없습니다/);
  assert.throws(() => cards.targetsFor(s, fin, { playerId: "p1" }, data), /고를 수 없습니다/);
  // GK 가 슈팅 구역에 서 있으면 고를 수 있다 (구역 기준)
  const swapped = layoutState({ zones: { ...LAYOUT, p1: "shoot" } });
  assert.ok(cards.singleCandidates(swapped, fin).includes("p1"));
  // 회복 단일: 결장 · 벤치 선수도 playerId 로
  const icing = def("cd_icing");
  const ob = layoutState({ bench: ["p2"], out: ["p1"] });
  assert.deepEqual(cards.singleCandidates(ob, icing), ["p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(cards.targetsFor(ob, icing, { playerId: "p1" }, data), ["p1"]);
  assert.deepEqual(cards.targetsFor(ob, icing, { playerId: "p2" }, data), ["p2"]);
  assert.deepEqual(cards.targetsFor(ob, icing, { at: posOf(ob).p7 }, data), ["p7"]);
  // 주인 (L40): 주인 특성의 모양 대상 (shapePlan(...).T), 주인이 경기장에 있을 때만
  const neria = def("cd_u_neria");
  assert.deepEqual(cards.targetsFor(s, neria, { playerId: "p4" }, data), ["p1", "p4"]);
  assert.throws(() => cards.targetsFor(s, neria, {}, data), /받을 선수 위에 놓으세요/);
  assert.deepEqual(cards.targetsFor(s, def("cd_u_adeline"), {}, data), ["p3"]);
  assert.deepEqual(cards.targetsFor(s, def("cd_u_dorbina"), {}, data), ["p2", "p1"]);
  assert.throws(() => cards.targetsFor(layoutState({ bench: ["p1"] }), neria, { playerId: "p4" }, data), /벤치/);
  assert.throws(() => cards.targetsFor(layoutState({ out: ["p1"] }), neria, { playerId: "p4" }, data), /결장/);
  assert.throws(() => cards.targetsFor(s, def("cd_u_mirka"), { zone: "pass" }, data), /명단에 없습니다/);
});

test("deadReason: 대상 후보 0명이면 낼 수 없다 (원은 1명이라도 있으면 된다) · 고유 카드 모양 (L40)", () => {
  const s = layoutState();
  for (const id of ["cd_fw_drill", "cd_basic", "cd_coaching", "cd_finisher", "cd_u_neria", "cd_icing", "cd_hojo_up"]) assert.equal(cards.deadReason(s, def(id)), null, id);
  // 공격 구역에 아무도 없으면 마무리 일격은 죽은 카드, 원 카드는 산다
  const defOnly = layoutState({ zones: { p1: "defense", p2: "defense", p3: "physical", p4: "physical", p5: "defense", p6: "physical", p7: "defense" } });
  assert.equal(cards.deadReason(defOnly, def("cd_finisher")), "그 구역에 선수가 없습니다");
  assert.equal(cards.deadReason(defOnly, def("cd_fw_drill")), null);
  // 모두 결장 · 벤치면 위력 카드는 죽고, 회복 단일 · 대상 없는 카드는 산다
  const empty = layoutState({ bench: ["p1", "p2"], out: ["p3", "p4", "p5", "p6", "p7"] });
  for (const id of ["cd_fw_drill", "cd_basic", "cd_coaching"]) assert.equal(cards.deadReason(empty, def(id)), "경기장에 선수가 없습니다", id);
  assert.equal(cards.deadReason(empty, def("cd_icing")), null);
  assert.equal(cards.deadReason(empty, def("cd_tactics_board")), null);
  assert.equal(cards.deadReason(layoutState({ bench: ["p1"] }), def("cd_u_neria")), "주인이 벤치에 있습니다");
  assert.equal(cards.deadReason(layoutState({ out: ["p1"] }), def("cd_u_neria")), "주인이 결장 중입니다");
  // 고유 ×1.5 (주 스탯 구역) 는 L40 으로 없어졌다
  assert.equal(cards.ownerOnMainZone, undefined);
  // 크로스 (L47): 슈팅 구역에 울리카 말고 아무도 없으면 드리블 구역 선수에게 · 둘 다 비면 낼 수 없다
  assert.equal(cards.deadReason(s, def("cd_u_ulrika")), null, "슈팅 구역이 비어도 드리블 구역 p7 이 받는다");
  assert.deepEqual(cards.receiverZones(s, def("cd_u_ulrika")), ["dribble"]);
  assert.deepEqual(cards.shapeReceivers(s, def("cd_u_ulrika")), ["p7"]);
  assert.deepEqual(rowsOf(cards.shapePlan(s, def("cd_u_ulrika"), { playerId: "p7" }, data)), [["p6", "shoot", "owner", 1], ["p7", "dribble", "recv", 1]]);
  assert.equal(cards.deadReason(layoutState({ zones: { ...LAYOUT, p7: "shoot" } }), def("cd_u_ulrika")), null);
  assert.deepEqual(cards.receiverZones(layoutState({ zones: { ...LAYOUT, p7: "shoot" } }), def("cd_u_ulrika")), ["shoot"]);
  assert.equal(cards.deadReason(layoutState({ bench: ["p7"] }), def("cd_u_ulrika")), "슈팅·드리블 구역에 받을 선수가 없습니다");
  assert.equal(cards.deadReason(layoutState({ zones: { ...LAYOUT, p7: "shoot" }, bench: ["p7"] }), def("cd_u_ulrika")), "슈팅·드리블 구역에 받을 선수가 없습니다");
  assert.equal(cards.receiverZones(s, def("cd_u_neria")), null, "구역 제한 없는 모양은 null");
  // 이어 주기 · 연결: 주인 말고 경기장 선수가 0명이면 낼 수 없다 (벤치 · 결장은 받을 수 없다)
  const alone = layoutState({ bench: ["p2", "p3"], out: ["p4", "p5", "p6", "p7"] });
  assert.equal(cards.deadReason(alone, def("cd_u_neria")), "받을 선수가 없습니다");
  assert.equal(cards.deadReason(layoutState({ bench: ["p1", "p2"], out: ["p3", "p5", "p6", "p7"] }), def("cd_u_silluen")), "받을 선수가 없습니다");
  // 주인 둘레 원 · 구역 · 옮기기 · 가로지르기 · 마무리는 주인만 있으면 낼 수 있다
  assert.equal(cards.deadReason(layoutState({ bench: ["p1", "p3"], out: ["p4", "p5", "p6", "p7"] }), def("cd_u_dorbina")), null);
  assert.equal(cards.deadReason(layoutState({ bench: ["p1", "p2"], out: ["p4", "p5", "p6", "p7"] }), def("cd_u_adeline")), null);
  assert.equal(cards.deadReason(layoutState({ bench: ["p1", "p2"], out: ["p3", "p4", "p6", "p7"] }), def("cd_u_taria")), null);
  assert.equal(cards.deadReason(layoutState({ bench: ["p5"] }), def("cd_u_taria")), "주인이 벤치에 있습니다");
});

test("lesson.json v2 기본 모양 (§14.13)", () => {
  const L = data.lesson;
  assert.equal(L.version, 2);
  assert.equal(L.weeksPerSeason * data.config.seasons, 15);
  assert.deepEqual(L.weekKinds, ["lesson", "free", "lesson", "free", "prep"]);
  assert.deepEqual(L.lesson.turns, [6, 7, 8]);
  assert.deepEqual(L.lesson.targets, [[344, 416], [408, 496], [480, 584]]);
  assert.deepEqual(L.lesson.special, { targetMult: 1.15, capMult: 1.2, secondChance: 0 });
  for (const k of ["autoTrainRatio", "autoTrainStamina", "rest"]) assert.equal(L.lesson[k], undefined, k);
  assert.equal(L.teamwork.pair, undefined);
  assert.equal(L.buffs.pressRestHeal, undefined);
  assert.equal(L.buffs.possNoMF, undefined);
  assert.equal(L.buffs.possNoPass, 2);
  assert.equal(L.events.support, false);
  assert.equal(L.routeOverrides.rt_hotspring.freeOuting, 1);
  assert.ok(data.routes.some((r) => r.id === "rt_hotspring"));
  assert.deepEqual(data.policies.policies.map((p) => p.id), cards.POLICY_FAMILIES);
  assert.equal(L.defaultPolicy, "team");
});

// ---------------------------------------------------------------------------
// §15 코치 지원 데이터 · 작은 원 카드 (L37 · L38)
// ---------------------------------------------------------------------------

test("§15.7 작은 원 카드 8장 · 새 공용 2장 · 단일 → 작은 원 변환 2장 (문구 · 효과 · 유대 80)", () => {
  const small = ALL.filter((c) => cards.isSmallCircle(c)).map((c) => c.id);
  assert.deepEqual(small.sort(), ["cd_c_celia", "cd_c_joy", "cd_one_two", "cd_pair_drill", "cd_pair_stretch", "cd_pass_move", "cd_six_sec", "cd_triangle"]);
  // 새 공용 2장: 보상 · 상담 후보 (pool), 원투 패스 바로 뒤
  const ids = ALL.map((c) => c.id);
  assert.deepEqual(ids.slice(ids.indexOf("cd_one_two"), ids.indexOf("cd_one_two") + 3), ["cd_one_two", "cd_pair_drill", "cd_pair_stretch"]);
  for (const id of ["cd_pair_drill", "cd_pair_stretch"]) {
    const c = byId(id);
    assert.deepEqual([c.family, c.start, c.pool], ["common", false, true], id);
  }
  assert.deepEqual(byId("cd_pair_drill").effects, []);
  assert.deepEqual([byId("cd_pair_drill").desc, byId("cd_pair_drill").descPlus], ["작은 원 · 1인 22", "작은 원 · 1인 28"]);
  assert.deepEqual(def("cd_pair_stretch").effects, [{ type: "heal", to: "targets", n: 10 }]);
  assert.deepEqual(def("cd_pair_stretch", { plus: true }).effects, [{ type: "heal", to: "targets", n: 12 }]);
  assert.equal(def("cd_pair_stretch", { plus: true }).desc, "작은 원 · 1인 18, 대상 체력 +12");
  // 변환: 효과 · mods 는 그대로
  assert.deepEqual(byId("cd_six_sec").mods, { noPressCost: "atLeast2" });
  assert.deepEqual(byId("cd_six_sec").effects, [{ type: "press", n: 1 }]);
  assert.equal(byId("cd_six_sec").desc, "작은 원 · 1인 17, 압박 +1, 압박 2 이상이면 비용 증가 없음");
  assert.deepEqual(byId("cd_c_joy").mods, { underdog: 0.5 });
  assert.equal(def("cd_c_joy", { bond: 80, plus: true }).desc, "작은 원 · 1인 36, 점수가 목표 미만이면 +50%");
  // 바꾸지 않는 단일 카드 (§15.7)
  for (const id of ["cd_coaching", "cd_one_on_one", "cd_ace_training", "cd_one_point", "cd_break_limit", "cd_finisher", "cd_c_irene", "cd_cooldown", "cd_icing", "cd_breath"]) {
    assert.equal(byId(id).target.kind, "single", id);
  }
});

test("§15.3 새 effect 말: heal targets (위력 있는 카드만) · hint (능력 전용) · condition (chance 생략 가능)", () => {
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d.cards.cards, d);
    assert.throws(() => cards.validateCardsData(d), re);
  };
  const L = (list, id) => list.find((c) => c.id === id);
  bad((list) => { L(list, "cd_fw_drill").effects.push({ type: "hint", chance: 0.5 }); }, /'hint' 는 코치 지원 능력에만/);
  bad((list) => { L(list, "cd_chant").effects.push({ type: "heal", to: "targets", n: 5 }); }, /heal targets 는 위력 있는 카드만/);
  bad((list) => { L(list, "cd_fw_drill").effects.push({ type: "condition", n: 1, chance: 2 }); }, /'condition\.chance' 값이 잘못/);
  // condition 은 chance 없이도 된다 (카드에 써도 된다)
  const ok = clone(data);
  L(ok.cards.cards, "cd_fw_drill").effects.push({ type: "condition", n: 1 });
  assert.equal(cards.validateCardsData(ok), true);
});

test("§15.3 validateAttachData: 실제 데이터 통과 · 8명 능력 · 모르는 코치 · needs · mods · effect 말 · lb 거절", () => {
  assert.equal(cards.validateAttachData(data), true);
  const A = data.lesson.attach;
  assert.deepEqual(Object.keys(A.abilities).sort(), ["sp_bard_lumi", "sp_coach_harr", "sp_elder_sage", "sp_iron_captain", "sp_mountain_monk", "sp_river_scholar", "sp_street_striker", "sp_wind_dancer"]);
  assert.deepEqual([A.enabled, A.count, A.rarityWeight, A.repeatWeight, A.ownCardWeight, A.overPct, A.bond], [true, { min: 4, max: 5 }, { SSR: 3, SR: 2, R: 1 }, 0.5, 3, 0.2, 5]);
  assert.deepEqual(A.cutinMs, { first: 900, repeat: 600 });
  for (const [id, a] of Object.entries(A.abilities)) assert.ok(a.name && a.text, id);
  for (const [id, a] of Object.entries(A.abilities)) assert.ok(typeof a.line === "string" && a.line.length > 0 && Array.from(a.line).length <= 22, `${id}: 컷인 대사 (UI 전용, 22자 이하)`);
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d.lesson.attach, d);
    assert.throws(() => cards.validateAttachData(d), re);
    assert.throws(() => cards.validateCardsData(d), re); // 카드 데이터 검사도 attach 를 본다
  };
  bad((a) => { a.abilities.sp_nobody = { name: "x", text: "x", effects: [{ type: "drawNext", n: 1 }] }; }, /'sp_nobody' 이\(가\) supports 에 없습니다/);
  bad((a) => { a.abilities.sp_coach_harr.needs = "zone"; }, /needs 'zone'/);
  bad((a) => { a.abilities.sp_coach_harr.mods = { focusX2: true }; }, /능력에 쓸 수 없는 mod 'focusX2'/);
  bad((a) => { a.abilities.sp_coach_harr.mods = { warp: 1 }; }, /알 수 없는 mod 'warp'/);
  bad((a) => { a.abilities.sp_wind_dancer.effects = [{ type: "teleport" }]; }, /알 수 없는 effect 'teleport'/);
  bad((a) => { a.abilities.sp_wind_dancer.effects[0].when = "success"; }, /when/);
  bad((a) => { a.abilities.sp_wind_dancer.lb = [{}]; }, /lb/);
  bad((a) => { a.abilities.sp_wind_dancer.extra = 1; }, /알 수 없는 필드 'extra'/);
  bad((a) => { delete a.abilities.sp_wind_dancer.name; }, /name 가 없습니다/);
  bad((a) => { a.abilities.sp_wind_dancer.line = ""; }, /line \(컷인 대사\)/);
  bad((a) => { a.count = { min: 4, max: 2 }; }, /count 가 잘못/);
  bad((a) => { a.rarityWeight.SSR = -1; }, /rarityWeight/);
  bad((a) => { a.enabled = "yes"; }, /enabled/);
  bad((a) => { a.weird = 1; }, /알 수 없는 필드 'weird'/);
  // attach 가 없으면 통과 (예전 데이터)
  const d = clone(data);
  delete d.lesson.attach;
  assert.equal(cards.validateAttachData(d), true);
  assert.equal(cards.validateCardsData(d), true);
});

// ---------------------------------------------------------------------------
// L40 고유 카드 모양 (§16.1 · §16.2 · §16.3 ②)
// ---------------------------------------------------------------------------

/** 특성 → 모양 표 (§16.1) */
const SHAPE_TABLE = {
  distributor: { shape: "link", recvMult: 1.3 },
  wall: { shape: "ownerCircle", size: "small", mods: { noFail: true } },
  captain: { shape: "ownerZone", effects: [{ type: "teamwork", n: 2 }] },
  killpass: { shape: "pick", recvMult: 1.5 },
  runner: { shape: "move", ownerMult: 1.3 },
  crosser: { shape: "pick", onlyZones: ["shoot"], fallbackZones: ["dribble"], effects: [{ type: "teamwork", n: 1 }] },
  targetman: { shape: "ownerCircle", size: "medium", ownerMult: 1.5 },
  carrier: { shape: "carry" },
  finisher: { shape: "owner", zoneMult: { zones: ["shoot"], mult: 2 } },
};
const CARD_SHAPE = {
  cd_u_neria: "link", cd_u_dorbina: "ownerCircle", cd_u_adeline: "ownerZone", cd_u_silluen: "pick",
  cd_u_taria: "move", cd_u_ulrika: "pick", cd_u_greta: "ownerCircle", cd_u_mirka: "carry",
};
const MIRKA_SQUAD = () => ({ ...data.config.defaultSquad.slots, FW2: "ch_cat_trickster" });
function squadState(squad, { zones: zs = LAYOUT, bench = [], out = [] } = {}) {
  const roster = run.buildRoster({ data, squad });
  const z = { ...zs };
  for (const id of out) delete z[id];
  return { players: roster.players, supports: roster.supports, lesson: { zone: "pass", zones: z, bench: bench.slice(), out: out.slice() } };
}
const rowsOf = (p) => p.rows.map((r) => [r.id, r.zone, r.role, r.shapeMult]);

test("L40 모양 데이터: 9특성 모두 lesson · 닫힌 목록 7종 · 모양별 허용 키 · 배율 ≥ 1 · chip ≤ 6자 · 8장 = 주인 특성 모양 · 문구 머리 = label", () => {
  assert.deepEqual(cards.SHAPE_KINDS, ["link", "pick", "ownerCircle", "ownerZone", "move", "carry", "owner"]);
  assert.deepEqual(Object.keys(cards.SHAPE_KEYS).sort(), cards.SHAPE_KINDS.slice().sort());
  assert.deepEqual(data.traits.map((t) => t.id).sort(), Object.keys(SHAPE_TABLE).sort());
  for (const t of data.traits) {
    const s = t.lesson;
    assert.ok(s, `${t.id}.lesson`);
    const { label, chip, ...rest } = s;
    assert.deepEqual(rest, SHAPE_TABLE[t.id], `${t.id} 모양`);
    for (const k of Object.keys(s)) assert.ok(cards.SHAPE_KEYS[s.shape].includes(k), `${t.id}: ${k}`);
    assert.ok(label && chip && chip.replace(/\s/g, "").length <= 6, `${t.id} label · chip`);
    for (const k of ["recvMult", "ownerMult"]) if (k in s) assert.ok(s[k] >= 1, `${t.id}.${k}`);
  }
  // 같은 특성 = 같은 모양: 카드는 모양 키를 갖지 않고 주인 캐릭터의 trait 을 따라간다
  for (const [id, kind] of Object.entries(CARD_SHAPE)) {
    const raw = byId(id);
    assert.equal(raw.shape, undefined, id);
    const ch = data.characters.find((c) => c.id === raw.ownerCharId);
    const sh = cards.shapeOf(data, id);
    assert.equal(sh.kind, kind, id);
    assert.equal(sh.trait, ch.trait, id);
    assert.deepEqual(def(id).shape, sh, `${id} resolveCardDef.shape`);
    assert.deepEqual(def(id, { plus: true }).shape, sh, `${id}+ 모양 인자는 강화되지 않는다`);
    assert.ok(raw.desc.startsWith(`${sh.label} · 1인 ${raw.power}`), `${id} desc 머리 = label`);
    assert.ok(raw.descPlus.startsWith(`${sh.label} · 1인 ${raw.plus.power}`), `${id} descPlus 머리 = label`);
  }
  assert.equal(cards.shapeOf(data, "cd_coaching"), null, "고유 카드가 아니면 null");
  assert.equal(def("cd_coaching").shape, undefined);
  // 뷰 모양 (needs · r)
  assert.deepEqual(cards.shapeView(def("cd_u_greta"), data), {
    kind: "ownerCircle", trait: "targetman", label: "주인 둘레 중간 원", chip: "둘레 중간 원", size: "medium", r: 15,
    recvMult: 1, ownerMult: 1.5, onlyZones: null, fallbackZones: null, zoneMult: null, noFail: false, needs: null,
  });
  assert.deepEqual(["cd_u_neria", "cd_u_ulrika", "cd_u_taria", "cd_u_mirka", "cd_u_adeline"].map((id) => cards.shapeView(def(id), data).needs), ["player", "player", "zone", "zone", null]);
  assert.equal(cards.shapeView(def("cd_u_dorbina"), data).noFail, true);
  assert.equal(cards.shapeView(def("cd_basic"), data), null);
  assert.equal(cards.validateShapeData(data), true);
});

test("L40 모양 검증: 모르는 shape · 남는 키 · 배율 · size · onlyZones · mods · effects · chip · zoneMult · ownerRadius · dropR · 특성 lesson 없음 · traits 없음", () => {
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d, (id) => d.traits.find((t) => t.id === id));
    assert.throws(() => cards.validateShapeData(d), re);
    assert.throws(() => cards.validateCardsData(d), re); // 카드 데이터 검사도 모양을 본다
  };
  bad((d, T) => { T("wall").lesson.shape = "blob"; }, /특성 'wall'.lesson: 알 수 없는 모양 'blob'/);
  bad((d, T) => { T("distributor").lesson.size = "small"; }, /'link' 모양에 없는 키 'size'/);
  bad((d, T) => { T("carrier").lesson.ownerMult = 1.2; }, /'carry' 모양에 없는 키 'ownerMult'/);
  bad((d, T) => { T("killpass").lesson.recvMult = 0.9; }, /recvMult 는 1 이상/);
  bad((d, T) => { T("wall").lesson.size = "huge"; }, /size 'huge'/);
  bad((d, T) => { delete T("targetman").lesson.size; }, /size 'undefined'/);
  bad((d, T) => { T("crosser").lesson.onlyZones = ["MF"]; }, /onlyZones 가 잘못됐습니다/);
  bad((d, T) => { T("crosser").lesson.fallbackZones = ["MF"]; }, /fallbackZones 가 잘못됐습니다/);
  bad((d, T) => { T("crosser").lesson.fallbackZones = ["shoot"]; }, /fallbackZones 가 onlyZones 와 겹칩니다/);
  bad((d, T) => { T("killpass").lesson.fallbackZones = ["dribble"]; }, /fallbackZones 는 onlyZones 와 함께만/);
  bad((d, T) => { T("wall").lesson.mods = { failPlus: 0.1 }; }, /모양에 쓸 수 없는 mod 'failPlus'/);
  bad((d, T) => { T("captain").lesson.effects = [{ type: "teamwork", n: 2, when: "consume" }]; }, /when: consume/);
  bad((d, T) => { T("captain").lesson.effects = [{ type: "hint", chance: 0.5 }]; }, /코치 지원 능력에만/);
  bad((d, T) => { T("runner").lesson.chip = "아주 아주 긴 이름표"; }, /6자 이하/);
  bad((d, T) => { T("runner").lesson.label = ""; }, /label 가 없습니다/);
  bad((d, T) => { T("finisher").lesson.zoneMult = { zones: ["shoot"], mult: 0.5 }; }, /zoneMult 가 잘못됐습니다/);
  bad((d) => { delete d.lesson.zones.ownerRadius; }, /ownerRadius/);
  bad((d) => { d.lesson.zones.dropR = 0; }, /dropR/);
  // L52 배치 흔들림 (zones.jitter — null 이면 통과)
  bad((d) => { d.lesson.zones.jitter.minGap = 0; }, /레슨 배치 \(zones\.jitter\): lesson.zones.jitter.minGap/);
  bad((d) => { d.lesson.zones.jitter.radiusScale = [1.2, 0.9]; }, /레슨 배치 \(zones\.jitter\): lesson.zones.jitter.radiusScale/);
  bad((d) => { d.lesson.zones.jitter.maxR = 8; }, /레슨 배치 \(zones\.jitter\): .*pad/);
  bad((d) => { d.lesson.zones.jitter.wobble = 1; }, /레슨 배치 \(zones\.jitter\): .*알 수 없는 키 'wobble'/);
  {
    const d = clone(data);
    d.lesson.zones.jitter = null;
    assert.equal(cards.validateShapeData(d), true, "jitter null = 예전 대형 (통과)");
  }
  bad((d, T) => { delete T("finisher").lesson; }, /특성 'finisher'.lesson: 레슨 모양이 없습니다/); // 주인 없는 특성도
  bad((d, T) => { delete T("captain").lesson; }, /카드 'cd_u_adeline': 주인 특성 'captain' 에 레슨 모양/);
  bad((d) => { d.characters.find((c) => c.id === "ch_human_captain").trait = "nope"; }, /특성 'nope' 이\(가\) traits 에 없습니다/);
  bad((d) => { delete d.traits; }, /고유 카드 모양: data.traits 가 없습니다/);
  // traits 가 없으면 고유 카드 해석도 throw (분명한 문구)
  const d = clone(data);
  delete d.traits;
  assert.throws(() => cards.resolveCardDef(d, "cd_u_neria"), /data.traits 가 없습니다/);
  assert.equal(cards.resolveCardDef(d, "cd_coaching").power, 35, "고유 카드가 아니면 traits 없이도 된다");
});

test("L40 shapePlan: 이어 주기 · 연결 = 주인 + 받는 선수 (playerId · at pickR, 주인 · 벤치 · 결장 거절) · 크로스 = 슈팅 구역만", () => {
  const s = layoutState();
  const pos = posOf(s);
  const before = JSON.stringify(s);
  // 이어 주기 (네리아 p1): 받는 선수 ×1.3, 경기장 어디든
  const link = cards.shapePlan(s, def("cd_u_neria"), { playerId: "p6" }, data);
  assert.deepEqual(rowsOf(link), [["p1", "defense", "owner", 1], ["p6", "shoot", "recv", 1.3]]);
  assert.deepEqual([link.kind, link.ownerId, link.receiverId, link.T, link.circle, link.zone, link.move], ["link", "p1", "p6", ["p1", "p6"], null, null, null]);
  assert.equal(cards.shapePlan(s, def("cd_u_neria"), { at: { x: pos.p4.x + 2.9, y: pos.p4.y } }, data).receiverId, "p4");
  assert.equal(cards.shapePlan(s, def("cd_u_neria"), { at: pos.p2 }, data).receiverId, "p2", "같은 구역 동료도 받는다");
  assert.throws(() => cards.shapePlan(s, def("cd_u_neria"), { at: pos.p1 }, data), /받을 선수 위에 놓으세요/); // 주인 위
  assert.throws(() => cards.shapePlan(s, def("cd_u_neria"), { at: { x: 50, y: 95 } }, data), /받을 선수 위에 놓으세요/);
  assert.throws(() => cards.shapePlan(s, def("cd_u_neria"), {}, data), /받을 선수 위에 놓으세요/);
  assert.throws(() => cards.shapePlan(s, def("cd_u_neria"), { playerId: "p1" }, data), /그 선수는 받을 수 없습니다/);
  assert.throws(() => cards.shapePlan(layoutState({ bench: ["p4"] }), def("cd_u_neria"), { playerId: "p4" }, data), /받을 수 없습니다/);
  assert.throws(() => cards.shapePlan(layoutState({ out: ["p4"] }), def("cd_u_neria"), { playerId: "p4" }, data), /받을 수 없습니다/);
  assert.deepEqual(cards.shapeReceivers(layoutState({ bench: ["p4"], out: ["p7"] }), def("cd_u_neria")), ["p2", "p3", "p5", "p6"]);
  // playerId 가 at 보다 먼저
  assert.equal(cards.shapePlan(s, def("cd_u_neria"), { playerId: "p3", at: pos.p6 }, data).receiverId, "p3");
  // 연결 (실루엔 p4): 고른 선수 ×1.5
  assert.deepEqual(rowsOf(cards.shapePlan(s, def("cd_u_silluen"), { playerId: "p3" }, data)), [["p4", "pass", "owner", 1], ["p3", "physical", "recv", 1.5]]);
  // 크로스 (울리카 p6): 슈팅 구역에 선 선수만, 배율 없음
  const sh = layoutState({ zones: { ...LAYOUT, p7: "shoot", p1: "shoot" } });
  assert.deepEqual(cards.shapeReceivers(sh, def("cd_u_ulrika")), ["p1", "p7"]);
  assert.deepEqual(rowsOf(cards.shapePlan(sh, def("cd_u_ulrika"), { playerId: "p7" }, data)), [["p6", "shoot", "owner", 1], ["p7", "shoot", "recv", 1]]);
  assert.throws(() => cards.shapePlan(sh, def("cd_u_ulrika"), { playerId: "p4" }, data), /그 선수는 받을 수 없습니다/);
  assert.throws(() => cards.shapePlan(sh, def("cd_u_ulrika"), { at: posOf(sh).p4 }, data), /슈팅 구역 선수 위에 놓으세요/);
  // 슈팅 구역에 누가 있으면 드리블 구역 선수는 받지 못한다 (대체는 비었을 때만)
  const sh2 = layoutState({ zones: { ...LAYOUT, p1: "shoot", p5: "dribble" } });
  assert.deepEqual(cards.shapeReceivers(sh2, def("cd_u_ulrika")), ["p1"]);
  assert.throws(() => cards.shapePlan(sh2, def("cd_u_ulrika"), { playerId: "p7" }, data), /그 선수는 받을 수 없습니다/);
  assert.throws(() => cards.shapePlan(s, def("cd_u_ulrika"), { at: posOf(s).p4 }, data), /드리블 구역 선수 위에 놓으세요/);
  assert.equal(JSON.stringify(s), before, "순수");
});

test("L40 shapePlan: 주인 둘레 원 (작은 8u · 중간 15u, 주인 중심 · at 무시) · 주인 구역 전원 · 행 순서 = 주인 → 슬롯", () => {
  const s = layoutState();
  // 철벽 (도르비나 p2 수비): 작은 원 = 주인 + 바로 옆 p1 (다른 구역 0)
  const wall = cards.shapePlan(s, def("cd_u_dorbina"), { at: { x: 90, y: 90 } }, data);
  assert.deepEqual(rowsOf(wall), [["p2", "defense", "owner", 1], ["p1", "defense", "member", 1]]);
  assert.deepEqual(wall.circle, { ...posOf(s).p2, r: 8 });
  // 수비 4명 대형: 작은 원은 바로 옆 2명까지, 중간 원은 구역 전원
  const four = layoutState({ zones: { ...LAYOUT, p3: "defense", p4: "defense" } });
  const w4 = cards.shapePlan(four, def("cd_u_dorbina"), {}, data);
  assert.equal(w4.rows[0].id, "p2");
  assert.ok(w4.T.length >= 2 && w4.T.length <= 3, `작은 원 ${w4.T}`);
  assert.ok(w4.rows.every((r) => r.zone === "defense"));
  // 타깃맨 (그레타 p7 드리블): 중간 원, 주인 ×1.5 — 드리블에 p5 · p6 이 오면 그 무리 전원
  assert.deepEqual(rowsOf(cards.shapePlan(s, def("cd_u_greta"), {}, data)), [["p7", "dribble", "owner", 1.5]]);
  const drib = layoutState({ zones: { ...LAYOUT, p5: "dribble", p6: "dribble" } });
  assert.deepEqual(rowsOf(cards.shapePlan(drib, def("cd_u_greta"), {}, data)), [["p7", "dribble", "owner", 1.5], ["p5", "dribble", "member", 1], ["p6", "dribble", "member", 1]]);
  // 주장 (아델린 p3 피지컬): 주인 구역 전원, 벤치 · 결장 제외
  const cap = layoutState({ zones: { ...LAYOUT, p1: "physical", p7: "physical" }, bench: ["p7"] });
  const z = cards.shapePlan(cap, def("cd_u_adeline"), {}, data);
  assert.deepEqual(rowsOf(z), [["p3", "physical", "owner", 1], ["p1", "physical", "member", 1]]);
  assert.equal(z.zone, "physical");
});

test("L40 shapePlan: 자리 옮기기 (zone · at → zoneAt, 지금 구역이면 옮기지 않음) · 가로지르기 (두 행 · 같은 구역 거절) · 마무리 (슈팅 ×2)", () => {
  const s = layoutState();
  const C = data.lesson.zones.centers;
  const before = JSON.stringify(s);
  // 침투 (타리아 p5 패스)
  const mv = cards.shapePlan(s, def("cd_u_taria"), { zone: "shoot" }, data);
  assert.deepEqual(rowsOf(mv), [["p5", "shoot", "owner", 1.3]]);
  assert.deepEqual([mv.zone, mv.move, mv.T], ["shoot", { id: "p5", from: "pass", to: "shoot" }, ["p5"]]);
  assert.deepEqual(cards.shapePlan(s, def("cd_u_taria"), { at: C.defense }, data).move, { id: "p5", from: "pass", to: "defense" });
  const stay = cards.shapePlan(s, def("cd_u_taria"), { zone: "pass" }, data);
  assert.deepEqual([rowsOf(stay), stay.move, stay.zone], [[["p5", "pass", "owner", 1.3]], null, "pass"]);
  assert.equal(cards.shapePlan(s, def("cd_u_taria"), { zone: "physical", at: C.shoot }, data).zone, "physical", "zone 이 at 보다 먼저");
  assert.throws(() => cards.shapePlan(s, def("cd_u_taria"), { at: { x: 5, y: 95 } }, data), /구역 위에 놓으세요/);
  assert.throws(() => cards.shapePlan(s, def("cd_u_taria"), { zone: "MF" }, data), /구역 위에 놓으세요/);
  assert.throws(() => cards.shapePlan(s, def("cd_u_taria"), {}, data), /구역 위에 놓으세요/);
  assert.equal(JSON.stringify(s), before, "순수 — 옮기기는 plan.move 로만 알린다");
  // 볼 운반 (미르카 = FW2 자리 p7, 드리블)
  const m = squadState(MIRKA_SQUAD());
  assert.equal(m.players.find((p) => p.id === "p7").charId, "ch_cat_trickster");
  const cr = cards.shapePlan(m, def("cd_u_mirka"), { zone: "pass" }, data);
  assert.deepEqual(rowsOf(cr), [["p7", "dribble", "owner", 1], ["p7", "pass", "owner", 1]]);
  assert.deepEqual([cr.T, cr.move, cr.zone], [["p7"], { id: "p7", from: "dribble", to: "pass" }, "pass"]);
  assert.throws(() => cards.shapePlan(m, def("cd_u_mirka"), { zone: "dribble" }, data), /다른 구역에 놓으세요/);
  assert.throws(() => cards.shapePlan(m, def("cd_u_mirka"), { at: C.dribble }, data), /다른 구역에 놓으세요/);
  // 피니셔 (주인 없는 특성 — 데이터 사본에서 그레타를 피니셔로): 슈팅 구역이면 ×2, 아니면 ×1
  const d = clone(data);
  d.characters.find((c) => c.id === "ch_giant_striker").trait = "finisher";
  const fin = cards.resolveCardDef(d, "cd_u_greta");
  assert.equal(fin.shape.kind, "owner");
  assert.deepEqual(rowsOf(cards.shapePlan(s, fin, {}, d)), [["p7", "dribble", "owner", 1]]);
  assert.deepEqual(rowsOf(cards.shapePlan(layoutState({ zones: { ...LAYOUT, p7: "shoot" } }), fin, {}, d)), [["p7", "shoot", "owner", 2]]);
  assert.equal(cards.validateShapeData(d), true);
});
