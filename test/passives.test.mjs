// test/passives.test.mjs — L48: 선수 패시브 목록 · SP 상점 · 선수 힌트 · 코치 파티 패시브 (LESSON_PROTO_PLAN §20)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, match } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as PS from "../js/engine/passives.js";
import { collectMods, collectModSources } from "../js/engine/skills.js";
import { MAX_HINT_LEVEL } from "../js/engine/training.js";

const data = loadData();
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const P = (state, id) => state.players.find((p) => p.id === id);
const listOf = (state, id) => data.characters.find((c) => c.id === P(state, id).charId).passiveIds;
const newRun = (opts = {}) => LR.createRun({ data, seed: opts.seed ?? 11, policy: opts.policy, squad: opts.squad });
/** 실패하면 상태를 바꾸지 않고 throw */
function rejects(state, fn, re) {
  const before = JSON.stringify(state);
  assert.throws(fn, re);
  assert.equal(JSON.stringify(state), before, "실패한 호출이 상태를 바꿨습니다");
}

test("L48 데이터: 16명 모두 패시브 3개 (고유 = 첫째 · 그 캐릭터만) · 고유 16개 · 코치 8명 파티 패시브 · 수업 목록 = 액티브 · validatePassiveData", () => {
  assert.equal(PS.validatePassiveData(data), true);
  assert.equal(data.characters.length, 16);
  const uniques = data.characters.map((c) => c.passiveIds[0]);
  assert.equal(new Set(uniques).size, 16);
  for (const c of data.characters) {
    const [u, ...rest] = c.passiveIds.map((id) => data.skills.find((k) => k.id === id));
    assert.equal(u.ownerCharId, c.id, c.name);
    assert.ok(rest.every((k) => !k.ownerCharId && k.kind === "passive"), c.name);
  }
  // 값: 공용 80 ~ 110, 고유 120 ~ 150 (L48 — SP 수입 약 3배와 함께)
  for (const k of data.skills.filter((x) => x.kind === "passive" && x.learnable)) {
    if (k.ownerCharId) assert.ok(k.cost >= 120 && k.cost <= 150, `${k.name} ${k.cost}`);
    else assert.ok(k.cost >= 80 && k.cost <= 110, `${k.name} ${k.cost}`);
  }
  for (const sc of data.supports) {
    assert.ok(sc.partyPassive && sc.partyPassive.name && sc.partyPassive.text && sc.partyPassive.bond80, sc.name);
    assert.ok(sc.teachSkillIds.length >= 2, `${sc.name} 수업 액티브 2개 이상`);
  }
  // 잘못된 데이터
  const bad = (mutate, re) => {
    const d = clone(data);
    mutate(d);
    assert.throws(() => PS.validatePassiveData(d), re);
  };
  bad((d) => { d.characters[0].passiveIds = ["sk_tide_wall", "sk_calm_keeper"]; }, /서로 다른 패시브 3개/);
  bad((d) => { d.characters[0].passiveIds = ["sk_calm_keeper", "sk_tide_wall", "sk_big_game"]; }, /고유 패시브여야/);
  bad((d) => { d.characters[1].passiveIds[0] = "sk_tide_wall"; }, /고유 패시브여야|도 씁니다/);
  bad((d) => { d.characters[0].passiveIds[1] = "sk_power_shot"; }, /배울 수 있는 패시브가 아닙니다/);
  bad((d) => { d.supports[0].teachSkillIds = ["sk_focus_finish"]; }, /배울 수 있는 액티브가 아닙니다/);
  bad((d) => { d.supports[0].partyPassive.mods = { luck: 1.1 }; }, /모르는 키 'luck'/);
  bad((d) => { d.supports[0].partyPassive.bond80 = { attack: 1.1 }; }, /같은 키/);
  bad((d) => { d.skills.find((k) => k.id === "sk_tempered").ownerCharId = "ch_nobody"; }, /모르는 ownerCharId/);
});

test("L48 SP 상점: 선수마다 자기 목록 3개 · 힌트 할인 · 주 · 상담 · 경기 전 준비에서만 · 검증 (목록 밖 · 보유 · 포지션 · SP) · 슬롯을 쓰지 않는다", () => {
  const s = newRun();
  assert.equal(s.phase, "week");
  const v = LR.getPassiveShopView(s, data);
  assert.equal(v.players.length, 7);
  assert.equal(v.open, true);
  for (const p of v.players) {
    same(p.rows.map((r) => r.skillId), listOf(s, p.id));
    assert.equal(p.rows[0].unique, true);
    assert.ok(p.rows.slice(1).every((r) => !r.unique));
  }
  assert.ok(v.players.every((p) => p.rows.every((r) => r.ok && !r.affordable && !r.owned)), "SP 0");
  // 힌트 할인: 레벨당 10%
  const u6 = listOf(s, "p6")[0];
  s.hints[u6] = 2;
  const base = data.skills.find((k) => k.id === u6).cost;
  const row = LR.getPassiveShopView(s, data).players.find((p) => p.id === "p6").rows[0];
  assert.deepEqual([row.baseCost, row.cost, row.level], [base, Math.round(base * 0.8), 2]);
  // 사기
  s.skillPoints = 1000;
  rejects(s, () => LR.buyPassive(s, data, { skillId: listOf(s, "p5")[0], playerId: "p6" }), /그 선수의 패시브가 아닙니다/);
  rejects(s, () => LR.buyPassive(s, data, { skillId: "sk_power_shot", playerId: "p6" }), /살 수 있는 패시브가 아닙니다/);
  rejects(s, () => LR.buyPassive(s, data, { skillId: u6, playerId: "p99" }), /없음/);
  LR.buyPassive(s, data, { skillId: u6, playerId: "p6" });
  assert.equal(s.skillPoints, 1000 - Math.round(base * 0.8));
  assert.ok(P(s, "p6").learnedSkillIds.includes(u6));
  assert.match(s.log.at(-1).text, /^패시브: 울리카 — '측면 질주' 습득 \(SP −\d+\)$/);
  rejects(s, () => LR.buyPassive(s, data, { skillId: u6, playerId: "p6" }), /이미 보유/);
  // 포지션: 잠금 수비(DF만) 는 DF 가 아니면 못 산다
  P(s, "p2").position = "MF";
  rejects(s, () => LR.buyPassive(s, data, { skillId: "sk_lockdown", playerId: "p2" }), /DF만/);
  P(s, "p2").position = "DF";
  // SP 부족
  s.skillPoints = 10;
  rejects(s, () => LR.buyPassive(s, data, { skillId: listOf(s, "p7")[0], playerId: "p7" }), /SP 가 부족/);
  // 세 개 모두 사도 액티브 슬롯은 그대로 (L48)
  s.skillPoints = 1000;
  for (const id of listOf(s, "p7")) LR.buyPassive(s, data, { skillId: id, playerId: "p7" });
  assert.equal(P(s, "p7").learnedSkillIds.length, 3);
  assert.equal(LR.canTeachSkill(s, data, "sk_power_shot", "p7").full, false, "패시브 3개 + 빈 액티브 슬롯 3");
  assert.equal(LR.getPassiveShopView(s, data).players.find((p) => p.id === "p7").owned, 3);
  // phase: 레슨 중에는 못 산다
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  assert.equal(LR.getPassiveShopView(s, data).open, false);
  rejects(s, () => LR.buyPassive(s, data, { skillId: listOf(s, "p1")[0], playerId: "p1" }), /살 수 없습니다/);
});

test("L48 선수 힌트: 많이 큰 순서 (같으면 명단) · 후보 = 목록 중 미보유 · 레벨 3 미만 · 포지션 · rng 한 번", () => {
  const per = [
    { id: "p1", byStat: { shoot: 1, dribble: 0, pass: 0, defense: 5, physical: 0 } },
    { id: "p2", byStat: { shoot: 0, dribble: 0, pass: 0, defense: 9, physical: 0 } },
    { id: "p3", byStat: { shoot: 0, dribble: 3, pass: 3, defense: 0, physical: 0 } },
  ];
  same(PS.topGrowers(per), ["p2", "p1", "p3"]);
  const s = newRun();
  const l1 = listOf(s, "p1");
  same(PS.playerHintCands(s, data, "p1"), l1);
  s.hints[l1[0]] = MAX_HINT_LEVEL;
  P(s, "p1").learnedSkillIds.push(l1[1]);
  same(PS.playerHintCands(s, data, "p1"), [l1[2]]);
  const rng = { pick: () => assert.fail("후보 1개면 rng 를 쓰지 않는다") };
  same(PS.drawPlayerHint(s, data, rng, "p1"), { skillId: l1[2], level: 1, playerId: "p1" });
  s.hints[l1[2]] = MAX_HINT_LEVEL;
  assert.equal(PS.drawPlayerHint(s, data, rng, "p1"), null);
  // 포지션이 안 맞는 패시브 (침착한 수문장 GK) 는 후보가 아니다
  P(s, "p1").position = "DF";
  s.hints = {};
  P(s, "p1").learnedSkillIds = [];
  assert.ok(!PS.playerHintCands(s, data, "p1").some((id) => (data.skills.find((k) => k.id === id).positions || []).includes("GK")));
});

test("L48 코치 파티 패시브: 편성 코치마다 · 유대 80이면 bond80 · 경기 스냅샷 partyPassives (레슨판만) · 팀 전원 듀얼 · when · actions · 출처 이름", () => {
  const s = newRun();
  const pp = LR.getPartyPassives(s, data);
  assert.equal(pp.length, s.supports.length);
  const harr = pp.find((x) => x.coachId === "sp_coach_harr");
  same([harr.name, harr.when, harr.mods, harr.actions, harr.upgraded, harr.text], ["골문 사냥", "always", { shootPower: 1.07 }, ["shoot"], false, "팀 슛 위력 +7%"]);
  s.supports.find((x) => x.id === "sp_coach_harr").bond = 80;
  const up = LR.getPartyPassives(s, data).find((x) => x.coachId === "sp_coach_harr");
  same([up.mods, up.upgraded, up.text], [{ shootPower: 1.1 }, true, "팀 슛 위력 +10%"]);
  // 스냅샷 (레슨판 감싼 함수만 — 옛 런 run.buildTeamSnapshot 은 그대로)
  const snap = LR.buildTeamSnapshot(s, data);
  assert.equal(snap.partyPassives.length, s.supports.length);
  assert.equal(JSON.stringify(snap.partyPassives), JSON.stringify(LR.getPartyPassives(s, data)));
  // collectMods: 팀 전원 (주인 선수 없음) · actions · when
  const team = { players: snap.players.map((p) => ({ ...p, skillIds: [] })), partyPassives: snap.partyPassives, live: {} };
  const ctx = (o) => ({ data, staminaMax: 100, scoreDiff: 0, chain: 0, possessionsLeft: 9, ...o });
  const gk = team.players.find((p) => p.position === "GK").id;
  const fw = team.players.find((p) => p.position === "FW").id;
  assert.equal(collectMods(team, fw, ctx({ action: "shoot" })).shootPower, 1.1, "하르나 (유대 80) — 슛");
  assert.equal(collectMods(team, gk, ctx({ action: "shoot" })).shootPower, 1.1, "주인 선수가 없어도 팀 전원");
  assert.equal(collectMods(team, fw, ctx({ action: "dribble" })).shootPower, 1, "actions 밖");
  // 바르바라 (지고 있을 때 수비 · 세이브) — 편성에 있으면
  if (s.supports.some((x) => x.id === "sp_iron_captain")) {
    assert.equal(collectMods(team, gk, ctx({ scoreDiff: -1 })).save, 1.08);
    assert.equal(collectMods(team, gk, ctx({ scoreDiff: 0 })).save, 1);
  }
  const src = collectModSources(team, fw, ctx({ action: "shoot" }));
  assert.ok(src.some((x) => x.name === "골문 사냥" && x.ownerId === "sp_coach_harr"));
  // 파티 패시브가 없는 팀 (상대 · 옛 런) 은 예전과 같다
  same(collectMods({ players: team.players, live: {} }, fw, ctx({ action: "shoot" })), collectMods({ players: team.players, live: {}, partyPassives: [] }, fw, ctx({ action: "shoot" })));
  // 경기 세팅 home 에도 실린다 (경계전 준비 → 경기)
  const w = clone(s);
  w.phase = "prep";
  w.pendingMatch = null;
  LR.confirmPrep(w, data, {});
  const setup = LR.getMatchSetup(w, data);
  assert.equal(setup.home.partyPassives.length, s.supports.length);
  assert.equal(setup.away.partyPassives, undefined);
  const ms = match.createMatch({ data, seed: 3, home: setup.home, away: setup.away, possessions: 4, kind: "goal" });
  match.simulateAuto(ms, data);
  assert.ok(["home", "away", "draw"].includes(match.getResult(ms).winner));
  assert.throws(() => match.createMatch({ data, seed: 3, home: { ...setup.home, partyPassives: {} }, away: setup.away, possessions: 4 }), /partyPassives 는 배열/);
});

test("L48 레슨 SP: 클리어 +20 · 퍼펙트 +35 (결과 sp · spLesson) · 실패 0 · 주 · 준비 뷰 shopBuyable", () => {
  const s = newRun();
  s.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
  s.lesson.turn = s.lesson.turns;
  s.lesson.score = s.lesson.target;
  LR.endLessonTurn(s, data);
  const r = s.pendingReward.result;
  assert.equal(r.status, "clear");
  assert.equal(r.spLesson, 20);
  assert.ok(r.sp >= 20);
  assert.equal(s.skillPoints, r.sp);
  const f = newRun();
  f.weekOffer = { kind: "lesson", specials: [] };
  LR.applyWeekAction(f, data, { type: "lesson", zone: "pass" });
  while (f.phase === "lesson") LR.endLessonTurn(f, data);
  assert.equal(f.pendingReward.result.status, "fail");
  assert.equal(f.pendingReward.result.spLesson, 0);
  // 주 뷰: 파티 패시브 · 살 수 있는 수
  const w = newRun();
  const wv = LR.getWeekView(w, data);
  assert.equal(wv.partyPassives.length, w.supports.length);
  assert.equal(wv.shopBuyable, 0);
  w.skillPoints = 85;
  assert.equal(LR.getWeekView(w, data).shopBuyable, LR.getPassiveShopView(w, data).players.reduce((n, p) => n + p.rows.filter((x) => x.cost <= 85 && x.ok).length, 0));
  assert.ok(LR.getWeekView(w, data).shopBuyable > 0, "마지막 힘 80");
});
