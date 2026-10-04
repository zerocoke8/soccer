// test/lineup.test.mjs — 라인업 보드 순수 도우미 (js/ui/lineup.js): 배치 규칙 · 놓기 해석 · 맞바꾸기 검사 · 포메이션 다시 앉히기 ·
// 미팅 swaps 가 엔진 resolveMeeting 에서 최종 배치를 그대로 만드는지, 편성 결과가 createRun 을 통과하는지.
// DOM 조작(드래그 · 탭)은 test/outgame.test.mjs (jsdom) 에서 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canPlay, placeReason, badText, slotOfId, resolveTarget, checkMove, applyMove, lineupIssues, reseat, meetingSwaps, slotSpot, poolOrder, RARITY_RANK,
} from "../js/ui/lineup.js";
import { slotsOf, positionOfSlot, FORMATIONS } from "../js/ui/labels.js";
import { validateSquad, resolveMeeting } from "../js/engine/training.js";
import { loadData, run, clone } from "./helpers.mjs";

const data = loadData();
const charById = new Map(data.characters.map((c) => [c.id, c]));
const aptOfChar = (cid, pos) => charById.get(cid)?.aptitude?.[pos] ?? "-";
const DEFAULT = data.config.defaultSquad; // GK 네리아 · DF1 도르비나 · DF2 아델린 · MF1 실루엔 · MF2 타리아 · FW1 울리카 · FW2 그레타 (미르카 벤치)
const ID = {
  neria: "ch_spirit_keeper", dorbina: "ch_dwarf_wall", adeline: "ch_human_captain", silu: "ch_elf_playmaker",
  taria: "ch_human_runner", ulrika: "ch_wolf_winger", greta: "ch_giant_striker", mirka: "ch_cat_trickster",
};
const setupModel = (assign, formation = "2-2-2") => ({ slots: slotsOf(formation), assign, aptOf: aptOfChar, bench: true });

// 결정적 난수 (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, r) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

test("canPlay/placeReason: 적성 '-' 불가, GK 는 A/B 만 (엔진 validateSquad 와 같은 규칙)", () => {
  for (const pos of ["GK", "DF", "MF", "FW"]) {
    assert.equal(canPlay(pos, "-"), false, `${pos} -`);
    assert.equal(placeReason(pos, "-"), "적성 없음");
    assert.equal(canPlay(pos, undefined), false, `${pos} 적성 정보 없음 = -`);
    for (const apt of ["A", "B"]) assert.equal(canPlay(pos, apt), true, `${pos} ${apt}`);
    assert.equal(canPlay(pos, "C"), pos !== "GK", `${pos} C`);
  }
  assert.equal(placeReason("GK", "C"), "GK는 A/B만");
  assert.equal(badText("GK", "-"), "GK 적성 없음");
  assert.equal(badText("GK", "C"), "GK C · GK는 A/B만");

  // 무작위 편성 400개: lineupIssues 가 비었다 ⇔ 엔진 validateSquad 가 통과
  const r = rng(7);
  const ids = data.characters.map((c) => c.id);
  let legal = 0;
  for (let n = 0; n < 400; n++) {
    const formation = Object.keys(FORMATIONS)[n % 4];
    const slots = slotsOf(formation);
    const pick = shuffle(ids, r).slice(0, slots.length);
    const assign = Object.fromEntries(slots.map((s, i) => [s, pick[i]]));
    const issues = lineupIssues({ slots, assign, aptOf: aptOfChar });
    let engineOk = true;
    try { validateSquad(data, formation, assign); } catch { engineOk = false; }
    assert.equal(issues.length === 0, engineOk, `${formation} ${JSON.stringify(assign)}: UI ${issues.map((i) => `${i.slot} ${i.reason}`).join(",")} / 엔진 ${engineOk}`);
    if (engineOk) legal++;
  }
  assert.ok(legal > 20 && legal < 380, `합법 · 불법 편성이 둘 다 나와야 의미가 있다 (합법 ${legal}/400)`);
});

test("slotSpot: lineup.js 로 옮겼고 setup.js 에서도 그대로 export", async () => {
  const setup = await import("../js/ui/screens/setup.js").catch(() => null);
  if (setup) assert.equal(setup.slotSpot, slotSpot);
  const slots = slotsOf("3-1-2");
  assert.deepEqual(slots.filter((s) => s.startsWith("DF")).map((s) => slotSpot(s, slots).y), [25, 50, 75]);
  // 편성(큰 카드)은 3명 줄을 벌린다 — 위 카드의 안내 알약이 아래 카드에 가리지 않게 (visual QA 2026-09-29). 2명 줄은 그대로
  assert.deepEqual(slots.filter((s) => s.startsWith("DF")).map((s) => slotSpot(s, slots, { spread: true }).y), [15, 50, 85]);
  assert.deepEqual(slots.filter((s) => s.startsWith("FW")).map((s) => Math.round(slotSpot(s, slots, { spread: true }).y)), [33, 67]);
});

test("resolveTarget: 놓은 곳 → 이동 (슬롯 · 필드 선수 카드 = 그 자리, 벤치 선수 카드 = 교체 투입, 풀 빈 곳 = 벤치)", () => {
  const m = setupModel({ ...DEFAULT.slots });
  assert.deepEqual(resolveTarget(m, ID.dorbina, { slot: "GK" }), { id: ID.dorbina, to: "GK" }, "슬롯 → 슬롯");
  assert.equal(resolveTarget(m, ID.dorbina, { slot: "DF1" }), null, "제자리");
  assert.deepEqual(resolveTarget(m, ID.dorbina, { player: ID.neria }), { id: ID.dorbina, to: "GK" }, "필드 선수 카드 = 그 선수 자리");
  assert.deepEqual(resolveTarget(m, ID.mirka, { slot: "MF2" }), { id: ID.mirka, to: "MF2" }, "벤치 → 슬롯");
  assert.deepEqual(resolveTarget(m, ID.taria, { player: ID.mirka }), { id: ID.mirka, to: "MF2" }, "필드 선수를 벤치 선수 카드에 = 벤치 선수가 내 자리로");
  assert.deepEqual(resolveTarget(m, ID.taria, { pool: true }), { id: ID.taria, to: null }, "풀 빈 곳 = 벤치로");
  assert.equal(resolveTarget(m, ID.mirka, { pool: true }), null, "벤치 선수를 풀에 = 그대로");
  assert.equal(resolveTarget(m, ID.mirka, { player: ID.mirka }), null, "자기 자신");
  const noBench = { ...m, bench: false };
  assert.equal(resolveTarget(noBench, ID.taria, { pool: true }), null, "벤치 없는 보드(미팅)");
  // 빈 슬롯
  const withEmpty = setupModel(applyMove(DEFAULT.slots, { id: ID.taria, to: null }));
  assert.equal(slotOfId(withEmpty.assign, ID.taria), null);
  assert.deepEqual(resolveTarget(withEmpty, ID.silu, { slot: "MF2" }), { id: ID.silu, to: "MF2" }, "빈 슬롯으로 이동");
});

test("checkMove: 끈 선수 적성 + 밀려난 선수가 원래 자리에 설 수 있는지 (벤치는 늘 가능)", () => {
  const m = setupModel({ ...DEFAULT.slots });
  // 도르비나(DF1: GK B) → GK, 네리아(GK A · DF C) → DF1: 둘 다 가능
  let c = checkMove(m, { id: ID.dorbina, to: "GK" });
  assert.equal(c.ok, true);
  assert.equal(c.apt, "B");
  assert.equal(c.occupant, ID.neria);
  assert.equal(c.occPos, "DF");
  assert.equal(c.occApt, "C");
  // 아델린(GK -) → GK: 끈 선수가 못 선다
  c = checkMove(m, { id: ID.adeline, to: "GK" });
  assert.equal(c.ok, false);
  assert.equal(c.reason, "적성 없음");
  // 네리아(DF C) → DF2: 네리아는 되지만 아델린(GK -)이 GK 로 못 간다
  c = checkMove(m, { id: ID.neria, to: "DF2" });
  assert.equal(c.ok, false);
  assert.equal(c.reason, null);
  assert.equal(c.occupant, ID.adeline);
  assert.equal(c.occReason, "적성 없음");
  // 네리아 → DF1: 도르비나(GK B)는 GK 로 갈 수 있다
  assert.equal(checkMove(m, { id: ID.neria, to: "DF1" }).ok, true);
  // 벤치 미르카(MF A · DF - · GK -): MF2 투입 가능(타리아는 벤치로), DF · GK 불가
  assert.equal(checkMove(m, { id: ID.mirka, to: "MF2" }).ok, true);
  assert.equal(checkMove(m, { id: ID.mirka, to: "DF1" }).ok, false);
  assert.equal(checkMove(m, { id: ID.mirka, to: "GK" }).reason, "적성 없음");
  // 벤치로 = 늘 가능 (편성), 벤치 없는 보드는 불가
  assert.equal(checkMove(m, { id: ID.neria, to: null }).ok, true);
  assert.equal(checkMove({ ...m, bench: false }, { id: ID.neria, to: null }).ok, false);
  // GK 적성 C (가상 데이터): GK는 A/B만
  const fake = { slots: slotsOf("2-2-2"), assign: { GK: "a", DF1: "b" }, bench: true, aptOf: (id, pos) => ({ a: { GK: "A", DF: "B" }, b: { GK: "C", DF: "A" } })[id][pos] };
  c = checkMove(fake, { id: "b", to: "GK" });
  assert.equal(c.ok, false);
  assert.equal(c.reason, "GK는 A/B만");
  c = checkMove(fake, { id: "a", to: "DF1" });
  assert.equal(c.ok, false, "a 는 DF 가능하지만 b(GK C)가 GK 로 못 간다");
  assert.equal(c.occReason, "GK는 A/B만");
});

test("applyMove: 맞바꾸기 · 빈 슬롯 이동 · 벤치 투입(있던 선수 벤치로) · 벤치로, 원본 불변", () => {
  const base = { ...DEFAULT.slots };
  const frozen = JSON.stringify(base);
  let a = applyMove(base, { id: ID.dorbina, to: "GK" });
  assert.equal(a.GK, ID.dorbina);
  assert.equal(a.DF1, ID.neria);
  assert.equal(JSON.stringify(base), frozen, "원본 그대로");
  a = applyMove(base, { id: ID.mirka, to: "MF2" });
  assert.equal(a.MF2, ID.mirka);
  assert.equal(slotOfId(a, ID.taria), null, "타리아 벤치로");
  assert.equal(Object.keys(a).length, 7);
  a = applyMove(base, { id: ID.taria, to: null });
  assert.equal(a.MF2, undefined);
  assert.equal(Object.keys(a).length, 6);
  a = applyMove(a, { id: ID.silu, to: "MF2" });
  assert.equal(a.MF2, ID.silu);
  assert.equal(a.MF1, undefined, "빈 슬롯으로 옮기면 원래 자리는 빈다");
});

test("무작위 드래그 1500번: 가능(초록)한 이동만 적용하면 편성은 늘 규칙에 맞고, 빈 곳이 없으면 createRun 을 통과한다", () => {
  const r = rng(11);
  const ids = data.characters.map((c) => c.id);
  let assign = { ...DEFAULT.slots };
  let formation = DEFAULT.formation;
  let applied = 0;
  let rejected = 0;
  let runs = 0;
  for (let n = 0; n < 1500; n++) {
    if (n % 150 === 149) { // 가끔 포메이션 바꾸기 (편성 화면처럼: 남는 선수는 벤치)
      formation = Object.keys(FORMATIONS)[Math.floor(r() * 4)];
      assign = reseat(assign, slotsOf(formation), aptOfChar);
    }
    const m = setupModel(assign, formation);
    const id = ids[Math.floor(r() * ids.length)];
    const k = r();
    const target = k < 0.6 ? { slot: m.slots[Math.floor(r() * m.slots.length)] } : k < 0.9 ? { player: ids[Math.floor(r() * ids.length)] } : { pool: true };
    const move = resolveTarget(m, id, target);
    if (!move) continue;
    const chk = checkMove(m, move);
    if (!chk.ok) { rejected++; continue; }
    assign = applyMove(assign, move);
    applied++;
    const issues = lineupIssues(setupModel(assign, formation)).filter((i) => i.id);
    assert.deepEqual(issues, [], `이동 ${JSON.stringify(move)} 뒤 규칙 위반`);
    const placed = Object.values(assign);
    assert.equal(new Set(placed).size, placed.length, "한 선수가 두 자리에");
    if (placed.length === m.slots.length && runs < 80) {
      const st = run.createRun({ data, seed: `lu-${n}`, squad: assign, formation });
      for (const p of st.players) assert.equal(assign[p.slot], p.charId, `createRun ${p.slot}`);
      runs++;
    }
  }
  assert.ok(applied > 300 && rejected > 100 && runs > 5, `적용 ${applied} · 거절 ${rejected} · createRun ${runs}`);
});

// ---- 16명 (LESSON_PROTO_PLAN §19.14 ①, K3): 선수 풀 2줄 순서 · 새 편성 A/B 를 보드 이동만으로 ----
const NEW = {
  herta: "ch_giant_keeper", bronte: "ch_spirit_striker", naelis: "ch_elf_regista", coni: "ch_rabbit_fullback",
  ondina: "ch_spirit_dribbler", risiel: "ch_elf_archer", camila: "ch_human_header", hildi: "ch_dwarf_finisher",
};
const SQUAD_A = { GK: NEW.herta, DF1: NEW.naelis, DF2: NEW.coni, MF1: NEW.ondina, MF2: NEW.risiel, FW1: NEW.bronte, FW2: NEW.camila };
const rarityOf = (cid) => charById.get(cid)?.rarity;

test("poolOrder: 필드 선수(슬롯 순서) → 벤치 레어도 SSR → SR → R (같으면 데이터 순서), 16명 전원 한 번씩", () => {
  assert.equal(data.characters.length, 16, "이 브랜치 = 16명");
  const ids = data.characters.map((c) => c.id);
  const slots = slotsOf(DEFAULT.formation);
  const order = poolOrder(ids, slots, DEFAULT.slots, rarityOf);
  assert.equal(order.length, ids.length);
  assert.deepEqual([...order].sort(), [...ids].sort(), "전원 한 번씩");
  assert.deepEqual(order.slice(0, 7), slots.map((sl) => DEFAULT.slots[sl]), "앞 7장 = 슬롯 순서");
  const bench = order.slice(7);
  const ranks = bench.map((id) => RARITY_RANK[rarityOf(id)]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), "벤치 = 레어도 순");
  for (let i = 1; i < bench.length; i++) {
    if (ranks[i] === ranks[i - 1]) assert.ok(ids.indexOf(bench[i - 1]) < ids.indexOf(bench[i]), "같은 레어도 = 데이터 순서");
  }
  // 기본 편성의 벤치 9명: SSR 헤르타 · 브론테 → SR 나엘리스 · 온디나 · 리시엘 → R 미르카 · 코니 · 카밀라 · 힐디
  assert.deepEqual(bench, [NEW.herta, NEW.bronte, NEW.naelis, NEW.ondina, NEW.risiel, ID.mirka, NEW.coni, NEW.camila, NEW.hildi]);
  // 빈 슬롯 · 모르는 id · 같은 선수 두 자리(있을 수 없지만)도 안전
  const partial = { ...DEFAULT.slots };
  delete partial.MF2;
  const o2 = poolOrder(ids, slots, { ...partial, FW2: "nobody" }, rarityOf);
  assert.equal(o2.length, ids.length);
  assert.deepEqual(o2.slice(0, 5), ["GK", "DF1", "DF2", "MF1", "FW1"].map((sl) => partial[sl]));
  assert.equal(o2[5], ID.greta, "빠진 SSR 그레타 = 벤치 맨 앞");
  assert.ok(o2.indexOf(ID.taria) > o2.indexOf(NEW.risiel), "빠진 R 타리아 = SR 뒤");
  assert.deepEqual(poolOrder(ids, slots, { GK: ID.neria, DF1: ID.neria }, rarityOf).filter((id) => id === ID.neria), [ID.neria]);
  assert.deepEqual(poolOrder(null, slots, {}), []);
});

test("16명: 기본 편성에서 보드 이동(벤치 카드 → 슬롯)만으로 새 편성 A · B 를 만들면 규칙에 맞고 createRun 을 통과한다", () => {
  const formation = "2-2-2";
  for (const [name, target] of [["A", SQUAD_A], ["B", { ...SQUAD_A, FW2: NEW.hildi }]]) {
    let assign = { ...DEFAULT.slots };
    for (const sl of slotsOf(formation)) {
      const m = setupModel(assign, formation);
      const move = resolveTarget(m, target[sl], { slot: sl });
      assert.ok(move, `${name} ${sl}`);
      const chk = checkMove(m, move);
      assert.ok(chk.ok, `${name} ${sl}: ${chk.reason}`);
      assert.equal(chk.apt, "A", `${name} ${sl}: 새 편성은 모두 적성 A`);
      assign = applyMove(assign, move);
    }
    assert.deepEqual(assign, target, `${name}: 보드 결과 = 목표`);
    assert.deepEqual(lineupIssues(setupModel(assign, formation)), []);
    validateSquad(data, formation, assign);
    const st = run.createRun({ data, seed: `lu16-${name}`, squad: assign, formation });
    for (const p of st.players) assert.equal(assign[p.slot], p.charId);
    // 벤치 9 = 옛 8명 + 남은 새 R 1명 (레어도 순: 실루엔 · 그레타 → 네리아 · 도르비나 · 울리카 → 아델린 · 타리아 · 미르카 · 힐디/카밀라)
    const order = poolOrder(data.characters.map((c) => c.id), slotsOf(formation), assign, rarityOf);
    assert.deepEqual(order.slice(7), [ID.silu, ID.greta, ID.neria, ID.dorbina, ID.ulrika, ID.adeline, ID.taria, ID.mirka, name === "A" ? NEW.hildi : NEW.camila]);
  }
});

test("reseat: 포메이션이 바뀌면 남는 슬롯 그대로, 없어진 슬롯 선수는 설 수 있는 빈 슬롯으로 (적성 좋은 순)", () => {
  // 2-2-2 → 3-1-2: MF2 타리아(DF B) → DF3
  let a = reseat({ ...DEFAULT.slots }, slotsOf("3-1-2"), aptOfChar);
  assert.equal(a.DF3, ID.taria);
  assert.equal(a.MF1, ID.silu);
  assert.deepEqual(lineupIssues({ slots: slotsOf("3-1-2"), assign: a, aptOf: aptOfChar }), []);
  // 2-2-2 → 2-3-1: FW2 그레타(MF C) → MF3
  a = reseat({ ...DEFAULT.slots }, slotsOf("2-3-1"), aptOfChar);
  assert.equal(a.MF3, ID.greta);
  assert.equal(a.FW1, ID.ulrika);
  // 설 수 있는 자리가 없으면 편성은 벤치로, 미팅(fillAll)은 그래도 앉히고 lineupIssues 로 드러낸다
  const mirkaAt = { ...DEFAULT.slots, MF2: ID.mirka }; // 미르카 MF2 (타리아 벤치)
  a = reseat(mirkaAt, slotsOf("3-1-2"), aptOfChar); // MF2 없어짐 → DF3 (미르카 DF -)
  assert.equal(a.DF3, undefined, "편성: 미르카는 벤치, DF3 빈 슬롯");
  assert.equal(slotOfId(a, ID.mirka), null);
  a = reseat(mirkaAt, slotsOf("3-1-2"), aptOfChar, { fillAll: true });
  assert.equal(a.DF3, ID.mirka, "미팅: 남은 자리에 앉힌다");
  assert.deepEqual(lineupIssues({ slots: slotsOf("3-1-2"), assign: a, aptOf: aptOfChar }).map((i) => [i.slot, i.reason]), [["DF3", "적성 없음"]]);
  // extraIds: assign 에 없던 선수도 채운다 (미팅 — 모든 선수가 자리를 가져야 한다)
  const partial = { ...DEFAULT.slots };
  delete partial.FW2;
  a = reseat(partial, slotsOf("2-2-2"), aptOfChar, { fillAll: true, extraIds: [ID.greta] });
  assert.equal(a.FW2, ID.greta);
});

test("meetingSwaps: 엔진 resolveMeeting 이 순서대로 적용하면 최종 배치 = 보드 배치 (포메이션 4개 × 무작위 배치)", () => {
  const base = run.createRun({ data, seed: "lineup-meeting" });
  const pids = base.players.map((p) => p.id);
  const charOf = new Map(base.players.map((p) => [p.id, p.charId]));
  const aptOf = (pid, pos) => aptOfChar(charOf.get(pid), pos);
  const r = rng(3);
  let checked = 0;
  for (let n = 0; n < 600; n++) {
    const state = clone(base);
    // 시작 배치도 섞는다 (이미 한 번 바꾼 런): 합법적인 배치를 하나 골라 적용
    if (n % 3 === 1) {
      const slots0 = slotsOf(state.formation);
      const perm = shuffle(pids, r);
      const a0 = Object.fromEntries(slots0.map((s, i) => [s, perm[i]]));
      if (lineupIssues({ slots: slots0, assign: a0, aptOf }).length) continue;
      resolveMeeting(state, data, { swaps: meetingSwaps(slots0, a0, (pid) => state.players.find((p) => p.id === pid).slot) });
    }
    const formation = Object.keys(FORMATIONS)[n % 4];
    const slots = slotsOf(formation);
    const perm = shuffle(pids, r);
    const assign = Object.fromEntries(slots.map((s, i) => [s, perm[i]]));
    if (lineupIssues({ slots, assign, aptOf }).length) continue;
    const currentSlotOf = (pid) => state.players.find((p) => p.id === pid).slot;
    const swaps = meetingSwaps(slots, assign, currentSlotOf);
    for (const sw of swaps) assert.notEqual(currentSlotOf(sw.playerId), sw.slot, "제자리 swap 은 뺀다");
    const action = { swaps };
    if (formation !== state.formation) action.formation = formation;
    resolveMeeting(state, data, action);
    assert.equal(state.formation, formation);
    for (const p of state.players) {
      assert.equal(assign[p.slot], p.id, `#${n} ${formation}: ${p.name} 는 ${p.slot} 가 아니라 ${slotOfId(assign, p.id)} 여야 한다`);
      assert.equal(p.position, positionOfSlot(p.slot));
    }
    checked++;
  }
  assert.ok(checked > 40, `확인한 배치 ${checked}`);
});

test("meetingSwaps + run.applyAction(meeting): 보드에서 맞바꾼 두 선수가 런에 그대로 (턴 소모 · 로그)", () => {
  const state = run.createRun({ data, seed: "lineup-apply" });
  while (run.getPhase(state) === "event") run.resolveEvent(state, data, 0);
  assert.equal(run.getPhase(state), "turn");
  const slots = slotsOf(state.formation);
  const aptOf = (pid, pos) => aptOfChar(state.players.find((p) => p.id === pid).charId, pos);
  let assign = Object.fromEntries(state.players.map((p) => [p.slot, p.id]));
  const model = { slots, assign, aptOf, bench: false };
  const dorbina = state.players.find((p) => p.charId === ID.dorbina).id;
  const move = resolveTarget(model, dorbina, { slot: "GK" });
  assert.equal(checkMove(model, move).ok, true);
  assign = applyMove(assign, move);
  const turn = state.turnIndex;
  const currentSlotOf = (pid) => state.players.find((p) => p.id === pid).slot;
  run.applyAction(state, data, { type: "meeting", tactics: { ...state.tactics }, swaps: meetingSwaps(slots, assign, currentSlotOf) });
  const bySlot = Object.fromEntries(state.players.map((p) => [p.slot, p.charId]));
  assert.equal(bySlot.GK, ID.dorbina);
  assert.equal(bySlot.DF1, ID.neria);
  assert.ok(state.turnIndex > turn || run.getPhase(state) !== "turn", "미팅은 턴을 소모한다");
});
