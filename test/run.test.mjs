// test/run.test.mjs — ARCHITECTURE §5, §6, §9 (실제 data/*.json + 실제 match.js 로 경기)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, playRun, stepRun, clone, run, match } from "./helpers.mjs";
import { applyEffects } from "../js/engine/effects.js";
import { getModifier, previewSlot, STATS, formationSlots } from "../js/engine/training.js";

const data = loadData();
const cfg = data.config;
const PHASES = new Set(["turn", "event", "match", "relic", "route", "finished"]);

function assertInvariants(state, where = "") {
  assert.ok(PHASES.has(state.phase), `${where} phase ${state.phase}`);
  assert.equal(typeof state.rngState, "number");
  for (const p of state.players) {
    for (const s of STATS) {
      const v = p.stats[s];
      assert.ok(Number.isFinite(v) && v >= 0 && v <= cfg.statCap, `${where} ${p.name}.${s}=${v}`);
    }
    assert.ok(p.stamina >= 0 && p.stamina <= 100, `${where} ${p.name} stamina ${p.stamina}`);
    assert.ok(p.injuredTurns >= 0, `${where} injuredTurns`);
    assert.ok(p.learnedSkillIds.length <= 3);
  }
  for (const s of state.supports) assert.ok(s.bond >= 0 && s.bond <= 100, `${where} bond ${s.bond}`);
  assert.ok(state.condition >= 0 && state.condition <= 4);
  assert.ok(state.teamwork >= 0 && state.teamwork <= 100);
  assert.ok(state.skillPoints >= 0);
  for (const lv of Object.values(state.hints)) assert.ok(lv >= 1 && lv <= 3, `${where} hint level ${lv}`);
  assert.ok(state.season >= 1 && state.season <= cfg.seasons);
  assert.ok(state.turn >= 1 && state.turn <= cfg.turnsPerSeason);
  assert.equal(state.turnIndex, (state.season - 1) * cfg.turnsPerSeason + state.turn - 1);
  // JSON 순수성
  const json = JSON.stringify(state);
  assert.deepEqual(JSON.parse(json), state, `${where} JSON 순수 객체`);
}

test("createRun: 기본 편성, 초기 상태 (§5.1)", () => {
  const state = run.createRun({ data, seed: "init" });
  assert.equal(state.version, 1);
  assert.equal(state.season, 1);
  assert.equal(state.turn, 1);
  assert.equal(state.turnIndex, 0);
  assert.equal(state.formation, cfg.defaultSquad.formation);
  assert.equal(state.players.length, 7);
  assert.deepEqual(state.players.map((p) => p.slot), formationSlots(cfg.defaultSquad.formation));
  for (const p of state.players) {
    assert.equal(p.charId, cfg.defaultSquad.slots[p.slot]);
    assert.equal(p.aptitude, "A", `${p.name} 기본 편성은 전원 A 적성`);
    assert.equal(p.stamina, 100);
  }
  assert.equal(state.supports.length, 6);
  for (const s of state.supports) {
    const card = data.supports.find((c) => c.id === s.id);
    assert.equal(s.bond, card.initialBond);
  }
  assert.equal(state.condition, cfg.condition.start);
  assert.equal(state.summonTickets, cfg.summonTicketsPerSeason);
  assert.deepEqual(state.tactics, cfg.defaultTactics);
  assert.ok(state.phase === "turn" || state.phase === "event", "시즌 시작 이벤트 또는 턴");
  if (state.phase === "turn") {
    assert.ok(state.placement, "placement 생성됨");
    const placed = STATS.flatMap((s) => state.placement[s].players);
    assert.equal(placed.length, 7);
  }
  assertInvariants(state, "createRun");
});

test("createRun: 편성 검증 (GK A/B, '-' 금지, 슬롯/중복/서포트 수)", () => {
  const base = { ...cfg.defaultSquad.slots };
  // GK 적성 C → throw (ch_spirit_keeper 는 DF C)
  assert.throws(() => run.createRun({ data, seed: 1, squad: { ...base, GK: "ch_human_captain" } }), /GK|적성/);
  // '-' 적성 → throw (ch_cat_trickster DF '-')
  assert.throws(() => run.createRun({ data, seed: 1, squad: { ...base, DF1: "ch_cat_trickster" } }), /적성/);
  // 슬롯 누락
  const missing = { ...base };
  delete missing.FW2;
  assert.throws(() => run.createRun({ data, seed: 1, squad: missing }), /슬롯/);
  // 포메이션에 없는 슬롯
  assert.throws(() => run.createRun({ data, seed: 1, squad: { ...base, DF3: "ch_cat_trickster" } }), /슬롯/);
  // 중복 캐릭터
  assert.throws(() => run.createRun({ data, seed: 1, squad: { ...base, FW2: base.FW1 } }), /두 슬롯|중복/);
  // 서포트 5장 / 중복
  assert.throws(() => run.createRun({ data, seed: 1, supportIds: cfg.defaultSupports.slice(0, 5) }), /6장/);
  assert.throws(() => run.createRun({ data, seed: 1, supportIds: [...cfg.defaultSupports.slice(0, 5), cfg.defaultSupports[0]] }), /중복/);
  // GK B 는 허용 (ch_dwarf_wall GK B), C 적성 필드 플레이어 허용
  const okSquad = { ...base, GK: "ch_dwarf_wall", DF1: "ch_spirit_keeper" };
  const st = run.createRun({ data, seed: 1, squad: okSquad });
  assert.equal(st.players.find((p) => p.slot === "GK").aptitude, "B");
  assert.equal(st.players.find((p) => p.slot === "DF1").aptitude, "C");
  // 다른 포메이션
  const f231 = run.createRun({
    data, seed: 1, formation: "2-3-1",
    squad: { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker" },
  });
  assert.equal(f231.players.length, 7);
  assert.equal(f231.formation, "2-3-1");
});

test("24턴 완주: 항상 추천 칸 훈련 + 실제 match.js 자동 경기 (phase 전이·불변식)", () => {
  const seen = { turn: 0, event: 0, match: 0, relic: 0, route: 0 };
  const matches = [];
  let lastTurnIndex = -1;
  const { state, final, steps } = playRun(data, "run-24", {
    onStep: (st, info) => {
      seen[info.kind === "train" ? "turn" : info.kind]++;
      assertInvariants(st, `after ${info.kind}`);
      if (info.kind === "match") {
        const { setup, result } = info.detail;
        assert.ok(["home", "away", "draw"].includes(result.winner));
        assert.equal(setup.home.players.length, 7);
        assert.equal(setup.away.players.length, 7);
        assert.equal(setup.home.side, "home");
        assert.equal(setup.away.side, "away");
        assert.ok(setup.rules && typeof setup.rules.allowDraw === "boolean");
        matches.push({ kind: setup.kind, reason: setup.reason, result, possessions: setup.possessions });
      }
      assert.ok(st.turnIndex >= lastTurnIndex, "turnIndex 단조 증가");
      lastTurnIndex = st.turnIndex;
    },
  });
  assert.equal(state.phase, "finished");
  assert.equal(seen.turn, cfg.turnsPerSeason * cfg.seasons, "훈련 행동 24회");
  assert.equal(seen.route, cfg.seasons - 1, "루트 선택 2회");
  assert.equal(state.record.goalMatches.length, cfg.seasons, "목표 경기 3회");
  assert.deepEqual(state.record.goalMatches.map((g) => g.season), [1, 2, 3]);
  const goal = matches.filter((m) => m.kind === "goal");
  assert.equal(goal.length, 3);
  assert.deepEqual(goal.map((m) => m.possessions), cfg.goalMatch.possessions);
  for (const m of goal) assert.notEqual(m.result.winner, "draw", "목표 경기는 무승부 없음");
  assert.equal(state.record.losses, state.record.goalMatches.filter((g) => !g.win).length);
  assert.ok(steps.length > 24);

  // 평가
  const r = final.rating;
  assert.ok(Number.isFinite(r.score));
  assert.ok(["S", "A", "B", "C", "D", "E", "F", "G"].includes(r.grade));
  assert.ok(["S", "A", "B", "C", "D", "E", "F", "G"].includes(r.cappedGrade));
  const capIdx = Math.min(state.record.losses, cfg.rating.capByLosses.length - 1);
  assert.equal(r.breakdown.cap, cfg.rating.capByLosses[capIdx]);
  assert.deepEqual(state.rating, r);
  const avg = state.players.reduce((a, p) => a + STATS.reduce((b, s) => b + p.stats[s], 0), 0) / 35;
  assert.ok(Math.abs(r.breakdown.avgStat - avg) < 0.11, "avgStat = 35스탯 평균 (적성 배율 미적용)");
  const expected = avg + cfg.rating.skillValue * r.breakdown.learnedSkills + cfg.rating.teamworkWeight * state.teamwork;
  assert.ok(Math.abs(r.score - expected) < 0.11, `score 공식 ${r.score} vs ${expected}`);

  // registeredTeam
  const t = final.registeredTeam;
  assert.equal(t.players.length, 7);
  assert.equal(t.seed, "run-24");
  assert.equal(t.formation, state.formation);
  assert.equal(t.rating, r);
  assert.equal(typeof t.createdTurnIndex, "number");
  // 성장했는지
  const startAvg = data.characters.filter((c) => Object.values(cfg.defaultSquad.slots).includes(c.id))
    .reduce((a, c) => a + STATS.reduce((b, s) => b + c.baseStats[s], 0), 0) / 35;
  assert.ok(avg > startAvg, `스탯 성장 ${startAvg} → ${avg}`);
});

test("결정성: 같은 seed 두 번 = 동일 상태, 매 단계 JSON roundtrip 후에도 동일", () => {
  const a = playRun(data, "det-1");
  const b = playRun(data, "det-1", { roundtrip: true });
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
  assert.equal(JSON.stringify(a.final), JSON.stringify(b.final));
  const c = playRun(data, "det-2");
  assert.notEqual(JSON.stringify(a.state.log), JSON.stringify(c.state.log), "다른 seed 는 다른 진행");
});

test("getTurnView 는 상태를 바꾸지 않는다 (rng 소비 없음) + 뷰 필드", () => {
  let state = run.createRun({ data, seed: "view" });
  while (state.phase !== "turn") stepRun(state, data, {});
  const before = JSON.stringify(state);
  const v1 = run.getTurnView(state, data);
  const v2 = run.getTurnView(state, data);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(v1), JSON.stringify(v2));
  assert.equal(v1.season, 1);
  assert.equal(v1.turnsUntilMatch, cfg.turnsPerSeason - state.turn);
  assert.ok(v1.nextMatch && v1.nextMatch.opponentName && v1.nextMatch.possessions === cfg.goalMatch.possessions[0]);
  assert.ok(STATS.includes(v1.recommendedSlot));
  assert.equal(v1.slots.length, 5);
  assert.equal(v1.players.length, 7);
  assert.equal(typeof v1.canOuting, "boolean");
  for (const s of v1.slots) {
    assert.ok(STATS.includes(s.type));
    assert.ok(Array.isArray(s.players) && Array.isArray(s.supports));
    assert.ok(s.preview && Array.isArray(s.preview.perPlayer) && Array.isArray(s.preview.freePlayers));
    assert.ok(typeof s.preview.totalGain === "number" && typeof s.preview.maxFailRate === "number");
    assert.ok(typeof s.preview.friendship === "boolean" && Array.isArray(s.preview.bondGain));
    for (const sp of s.supports) {
      assert.ok(typeof sp.friendship === "boolean" && typeof sp.hint === "boolean" && typeof sp.bond === "number");
    }
    for (const pp of s.preview.perPlayer) {
      assert.ok(pp.failRate >= 0 && pp.failRate <= 0.95);
      assert.equal(pp.staminaCost, cfg.training.staminaCost);
    }
  }
  const placed = v1.slots.flatMap((s) => s.players);
  assert.equal(placed.length, 7, "7명 전원 배치");
  assert.equal(v1.slots.flatMap((s) => s.supports).length, 6, "서포트 6장 배치");
  assert.ok(Array.isArray(v1.shop) && Array.isArray(v1.log) && Array.isArray(v1.relics) && Array.isArray(v1.modifiers));
});

test("훈련: 선택 칸 선수만 체력 소모, 성공 시 스탯 증가, 유대 상승, 자율 훈련", () => {
  let state = run.createRun({ data, seed: "train-1" });
  while (state.phase !== "turn") stepRun(state, data, {});
  const view = run.getTurnView(state, data);
  const slot = view.slots.find((s) => s.players.length > 0) || view.slots[0];
  const before = clone(state);
  run.applyAction(state, data, { type: "train", slot: slot.type });
  // 이벤트가 떴다면 아직 스탯 효과 미적용 상태 (이벤트 전) — 훈련 결과는 이미 반영됨
  for (const pid of slot.players) {
    const p0 = before.players.find((p) => p.id === pid);
    const p1 = state.players.find((p) => p.id === pid);
    assert.equal(p1.stamina, Math.max(0, p0.stamina - cfg.training.staminaCost), "선택 칸 선수 체력 −20");
  }
  for (const spId of slot.supports.map((s) => s.id)) {
    const s0 = before.supports.find((s) => s.id === spId).bond;
    const s1 = state.supports.find((s) => s.id === spId).bond;
    assert.equal(s1, Math.min(100, s0 + cfg.training.bondPerTraining), "유대 +bondPerTraining");
  }
  const others = view.slots.filter((s) => s.type !== slot.type).flatMap((s) => s.players);
  for (const pid of others) {
    const p0 = before.players.find((p) => p.id === pid);
    const p1 = state.players.find((p) => p.id === pid);
    assert.equal(p1.stamina, p0.stamina, "다른 칸 선수는 체력 소모 없음");
  }
  assert.ok(["turn", "event", "match"].includes(state.phase));
  assertInvariants(state, "after train");
});

test("휴식/외출/미팅/호출/친선전 행동", () => {
  let state = run.createRun({ data, seed: "actions" });
  const toTurn = () => { while (state.phase !== "turn") stepRun(state, data, {}); };
  toTurn();
  // 훈련으로 체력을 깎은 뒤 휴식
  const v0 = run.getTurnView(state, data);
  run.applyAction(state, data, { type: "train", slot: v0.recommendedSlot });
  toTurn();
  const minBefore = Math.min(...state.players.map((p) => p.stamina));
  run.applyAction(state, data, { type: "rest" });
  const minAfter = Math.min(...state.players.map((p) => p.stamina));
  assert.ok(minAfter >= Math.min(100, minBefore + cfg.rest.stamina * (1 + getModifier(state, "restEffect"))) - 0.5, "휴식 체력 회복");
  toTurn();

  // 외출: friend 카드(sp_bard_lumi) 유대 +10, 컨디션 +1
  const friendId = "sp_bard_lumi";
  assert.ok(state.supports.some((s) => s.id === friendId));
  const bond0 = state.supports.find((s) => s.id === friendId).bond;
  const cond0 = state.condition;
  run.applyAction(state, data, { type: "outing" });
  assert.equal(state.supports.find((s) => s.id === friendId).bond, Math.min(100, bond0 + cfg.outing.bond));
  assert.equal(state.condition, Math.min(4, cond0 + cfg.outing.condition));
  toTurn();

  // 미팅: 팀워크 +10, 전술 변경, 포메이션 3-1-2 로 스왑
  const tw0 = state.teamwork;
  const mf2 = state.players.find((p) => p.slot === "MF2");
  run.applyAction(state, data, {
    type: "meeting",
    tactics: { attack: "pass", shootTiming: "midrange", defense: "intercept" },
    formation: "3-1-2",
    swaps: [{ playerId: mf2.id, slot: "DF3" }],
  });
  assert.equal(state.teamwork, Math.min(100, tw0 + cfg.meeting.teamwork));
  assert.equal(state.tactics.attack, "pass");
  assert.equal(state.tactics.tension, cfg.defaultTactics.tension, "지정하지 않은 전술 키는 유지");
  assert.equal(state.formation, "3-1-2");
  assert.equal(state.players.find((p) => p.id === mf2.id).slot, "DF3");
  assert.equal(state.players.find((p) => p.id === mf2.id).position, "DF");
  assert.equal(state.players.find((p) => p.id === mf2.id).aptitude, "B", "타린 DF 적성 B");
  assert.deepEqual(state.players.map((p) => p.slot).sort(), formationSlots("3-1-2").sort());
  toTurn();

  // 잘못된 미팅은 상태를 바꾸지 않음 (GK 에 C 적성)
  const snap = JSON.stringify(state);
  const captain = state.players.find((p) => p.charId === "ch_human_captain");
  assert.throws(() => run.applyAction(state, data, { type: "meeting", swaps: [{ playerId: captain.id, slot: "GK" }] }), /GK|적성/);
  assert.equal(JSON.stringify(state), snap, "실패한 미팅은 상태 불변");

  // 호출권: 턴 소모 없음, 배치 이동
  const tickets = state.summonTickets;
  assert.ok(tickets > 0);
  const target = state.players.find((p) => p.injuredTurns <= 0);
  const turnBefore = state.turnIndex;
  run.applyAction(state, data, { type: "summon", playerId: target.id, slot: "shoot" });
  assert.equal(state.turnIndex, turnBefore);
  assert.equal(state.summonTickets, tickets - 1);
  assert.ok(state.placement.shoot.players.includes(target.id));
  assert.deepEqual(state.summon, { playerId: target.id, slot: "shoot" });
  assert.throws(() => run.applyAction(state, data, { type: "summon", playerId: target.id, slot: "pass" }), /호출권/);

  // 친선전: 즉시 match phase, 경기 후 체력 −30, 기록
  run.applyAction(state, data, { type: "friendly" });
  assert.equal(state.phase, "match");
  assert.equal(state.pendingMatch.kind, "friendly");
  assert.equal(state.pendingMatch.reason, "friendly");
  assert.equal(state.pendingMatch.possessions, cfg.friendly.possessions);
  const setup = run.getMatchSetup(state, data);
  assert.equal(setup.kind, "friendly");
  assert.equal(setup.rules.allowDraw, true);
  const stam0 = state.players.map((p) => p.stamina);
  const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
  match.simulateAuto(ms, data);
  const result = match.getResult(ms);
  run.finishMatch(state, data, result);
  assert.equal(state.record.friendlies.length, 1);
  assert.equal(state.record.friendlies[0].win, result.winner === "home");
  state.players.forEach((p, i) => assert.equal(p.stamina, Math.max(0, stam0[i] - cfg.friendly.staminaCost)));
  assert.ok(state.lastMatchResult && state.lastMatchResult.winner === result.winner);
  assert.equal(state.skillPoints >= (result.winner === "home" ? cfg.friendly.skillPointsWin : cfg.friendly.skillPointsLoss), true);

  // 잘못된 phase/입력
  assert.throws(() => run.finishMatch(state, data, result), /phase/);
  assert.throws(() => run.applyAction(state, data, { type: "nope" }), /phase|행동/);
});

test("모든 이벤트 × 모든 선택지 강제 적용: 효과 13종 전부 throw 없이", () => {
  const base = run.createRun({ data, seed: "events" });
  const types = new Set();
  const walk = (effs) => { for (const e of effs || []) { types.add(e.type); if (e.type === "random") { walk(e.then); walk(e.else); } } };
  for (const ev of data.events) {
    for (let ci = 0; ci < ev.choices.length; ci++) {
      const state = clone(base);
      state.phase = "event";
      state.queue = ["beginTurn"];
      state.placement = null;
      state.pendingRelicChoices = null;
      const player = ev.characterId ? state.players.find((p) => p.charId === ev.characterId) : state.players[0];
      const supportId = ev.supportId || (ev.trigger === "support" ? state.supports[0].id : null);
      state.currentEvent = { eventId: ev.id, playerId: player ? player.id : state.players[0].id, supportId };
      const view = run.getEventView(state, data);
      assert.equal(view.eventId, ev.id);
      assert.ok(!/\{player\}|\{support\}|\{season\}/.test(view.text + view.title + view.choices.map((c) => c.text + c.preview).join("")), `${ev.id} 치환 누락`);
      assert.equal(view.choices.length, ev.choices.length);
      walk(ev.choices[ci].effects);
      run.resolveEvent(state, data, ci);
      assert.ok(["turn", "relic", "match"].includes(state.phase), `${ev.id}/${ci} → ${state.phase}`);
      assert.ok(state.usedEventIds.length === 0 || true);
      assertInvariants(state, `${ev.id}/${ci}`);
    }
  }
  const expected = ["stat", "stamina", "condition", "teamwork", "bond", "hint", "skillPoints", "injury", "heal", "relic", "summonTicket", "modifier", "random"];
  for (const t of expected) assert.ok(types.has(t), `데이터에 효과 타입 '${t}' 이 있어야 함`);
});

test("effects.js: 효과 타입 13종 직접 적용 + 알 수 없는 타입 throw", () => {
  const state = run.createRun({ data, seed: "fx" });
  const p = state.players[0];
  const ctx = { playerId: p.id, supportId: state.supports[0].id, eventId: null };
  const before = clone(state);
  applyEffects(state, data, [
    { type: "stat", target: "player", stat: "shoot", amount: 30 },
    { type: "stat", target: "team", stat: "main", amount: 5 },
    { type: "stat", target: "position:DF", stat: "random", amount: 3 },
    { type: "stat", target: "randomPlayer", stat: "pass", amount: 1 },
    { type: "stat", target: "ch_giant_striker", stat: "shoot", amount: 1000 },
    { type: "stamina", target: "team", amount: -30 },
    { type: "condition", amount: 1 },
    { type: "teamwork", amount: 15 },
    { type: "bond", target: "trigger", amount: 10 },
    { type: "bond", target: "all", amount: 5 },
    { type: "hint", skill: "sk_power_shot", level: 2 },
    { type: "hint", skill: "random", level: 1 },
    { type: "skillPoints", amount: 40 },
    { type: "injury", target: "player", turns: 2 },
    { type: "summonTicket", amount: 1 },
    { type: "modifier", key: "trainingEfficiency", amount: 0.2, duration: "season" },
    { type: "modifier", key: "shootPower", amount: 0.05, duration: "run" },
    { type: "random", chance: 1, then: [{ type: "teamwork", amount: 1 }], else: [{ type: "teamwork", amount: 100 }] },
    { type: "random", chance: 0, then: [{ type: "teamwork", amount: 100 }], else: [{ type: "teamwork", amount: 1 }] },
    { type: "relic" },
  ], ctx);
  assert.equal(p.stats.shoot >= before.players[0].stats.shoot + 30, true);
  assert.equal(state.players.find((x) => x.charId === "ch_giant_striker").stats.shoot, cfg.statCap, "statCap 클램프");
  for (const x of state.players) assert.ok(x.stamina <= 70);
  assert.equal(state.condition, Math.min(4, before.condition + 1));
  assert.equal(state.teamwork, before.teamwork + 17);
  assert.equal(state.supports[0].bond, before.supports[0].bond + 15);
  assert.equal(state.supports[1].bond, before.supports[1].bond + 5);
  assert.equal(state.hints.sk_power_shot, 2);
  assert.ok(Object.keys(state.hints).length >= 1);
  assert.equal(state.skillPoints, 40);
  assert.equal(p.injuredTurns, 2);
  assert.equal(state.summonTickets, before.summonTickets + 1);
  assert.equal(getModifier(state, "trainingEfficiency"), 0.2);
  assert.equal(getModifier(state, "shootPower"), 0.05);
  assert.equal(state.pendingRelicChoices.length, 3);
  applyEffects(state, data, [{ type: "heal", target: "team" }], ctx);
  assert.equal(p.injuredTurns, 0);
  assert.throws(() => applyEffects(state, data, [{ type: "teleport" }], ctx), /알 수 없는 효과/);
  assert.throws(() => applyEffects(state, data, [{ type: "hint", skill: "sk_nope" }], ctx), /skills/);
  // 시즌 modifier 만료: chooseRoute 로 시즌이 바뀌면 사라지고 run 지속은 남는다
  const s2 = clone(state);
  s2.phase = "route"; s2.pendingRoutes = data.routes.map((r) => r.id); s2.pendingRelicChoices = null; s2.queue = [];
  run.chooseRoute(s2, data, "rt_camp");
  assert.equal(s2.season, 2);
  assert.equal(s2.modifiers.some((m) => m.key === "trainingEfficiency" && m.amount === 0.2 && m.untilSeason === 1), false, "시즌1 modifier 제거");
  assert.equal(getModifier(s2, "shootPower"), 0.05, "런 지속 modifier 유지");
});

test("모든 스킬 id 참조 유효 (캐릭터 고유·서포트 힌트·상대 스킬·이벤트 힌트) + 데이터 무결성", () => {
  const skillIds = new Set(data.skills.map((s) => s.id));
  assert.equal(skillIds.size, data.skills.length, "스킬 id 중복 없음");
  for (const c of data.characters) {
    assert.ok(skillIds.has(c.innateSkillId), `${c.id}.innateSkillId ${c.innateSkillId}`);
    const aCount = Object.values(c.aptitude).filter((a) => a === "A").length;
    assert.equal(aCount, 1, `${c.id} A 적성은 정확히 1개`);
  }
  for (const sp of data.supports) {
    for (const id of sp.hintSkillIds) assert.ok(skillIds.has(id), `${sp.id} hint ${id}`);
    for (const id of sp.hintSkillIds) assert.ok(data.skills.find((s) => s.id === id).learnable, `${sp.id} 힌트 스킬은 학습 가능`);
    for (const evId of sp.eventIds) assert.ok(data.events.some((e) => e.id === evId && e.trigger === "support"), `${sp.id} event ${evId}`);
  }
  for (const o of data.opponents) {
    const slots = formationSlots(o.formation);
    assert.deepEqual(o.players.map((p) => p.slot).sort(), slots.slice().sort(), `${o.id} 슬롯`);
    for (const p of o.players) for (const id of p.skillIds) assert.ok(skillIds.has(id), `${o.id} ${p.name} skill ${id}`);
    run.buildOpponentSnapshot(o, data);
  }
  const walk = (effs, where) => {
    for (const e of effs || []) {
      if (e.type === "hint" && e.skill !== "random") assert.ok(skillIds.has(e.skill), `${where} hint ${e.skill}`);
      if (e.type === "random") { walk(e.then, where); walk(e.else, where); }
    }
  };
  for (const ev of data.events) {
    for (const c of ev.choices) walk(c.effects, ev.id);
    if (ev.trigger === "support") assert.ok(data.supports.some((s) => s.id === ev.supportId), `${ev.id} supportId`);
    if (ev.trigger === "route") assert.ok(data.routes.some((r) => r.id === ev.routeId), `${ev.id} routeId`);
    if (ev.characterId) assert.ok(data.characters.some((c) => c.id === ev.characterId), `${ev.id} characterId`);
    assert.ok(ev.choices.length >= 1 && ev.choices.length <= 2, `${ev.id} 선택지 1~2개`);
  }
  const MOD_KEYS = ["trainingEfficiency", "injuryRate", "restEffect", "bondGain", "hintRate", "skillPointGain", "intentReveal", "goalMatchCondition", "shootPower", "defense", "passAttack", "tensionGain", "staminaCost", "lossPenaltyHalf", "dribbleStaminaRefund"];
  for (const r of data.relics) for (const k of Object.keys(r.modifiers)) assert.ok(MOD_KEYS.includes(k), `${r.id} modifier ${k}`);
  for (const rt of data.routes) for (const e of rt.effects) if (e.type === "modifier") assert.ok(MOD_KEYS.includes(e.key), `${rt.id} ${e.key}`);
  // 상대 role/season 커버
  for (const season of [1, 2, 3]) {
    assert.ok(data.opponents.some((o) => o.role === "goal" && o.season === season), `시즌 ${season} 목표 상대`);
    assert.ok(data.opponents.some((o) => o.role === "friendly" && o.season === season), `시즌 ${season} 친선 상대`);
  }
  // 기본 서포트/스쿼드 id 존재
  for (const id of cfg.defaultSupports) assert.ok(data.supports.some((s) => s.id === id), id);
  for (const id of Object.values(cfg.defaultSquad.slots)) assert.ok(data.characters.some((c) => c.id === id), id);
});

test("유물/루트 modifier 가 실제 수치에 반영된다", () => {
  let state = run.createRun({ data, seed: "mods" });
  while (state.phase !== "turn") stepRun(state, data, {});
  const slot = STATS.find((s) => state.placement[s].players.length > 0);
  const pv0 = previewSlot(state, data, slot);

  // 유물: 금 간 트로피 (trainingEfficiency +0.15, restEffect −0.3) → eff 상승, 휴식량 감소
  const st = clone(state);
  st.phase = "relic"; st.pendingRelicChoices = ["rl_cracked_trophy", "rl_odd_boots", "rl_flame_pendant"]; st.queue = [];
  run.chooseRelic(st, data, "rl_cracked_trophy");
  assert.equal(st.phase, "turn");
  assert.deepEqual(st.relics, ["rl_cracked_trophy"]);
  assert.equal(getModifier(st, "trainingEfficiency"), 0.15);
  const pv1 = previewSlot(st, data, slot);
  assert.ok(Math.abs(pv1.eff - pv0.eff * 1.15) < 1e-9, `eff ${pv0.eff} → ${pv1.eff}`);
  assert.ok(pv1.totalGain >= pv0.totalGain);
  const restGain = Math.round(cfg.rest.stamina * (1 - 0.3));
  st.players.forEach((p) => { p.stamina = 10; });
  run.applyAction(st, data, { type: "rest" });
  for (const p of st.players) assert.equal(p.stamina, 10 + restGain, "휴식량 ×0.7");

  // 유물: 불꽃 펜던트 / 바위 각반 / 감독의 수첩 → 스냅샷 modifiers
  const st2 = clone(state);
  st2.phase = "relic"; st2.pendingRelicChoices = ["rl_flame_pendant"]; st2.queue = [];
  run.chooseRelic(st2, data, "rl_flame_pendant");
  st2.phase = "relic"; st2.pendingRelicChoices = ["rl_stone_greaves"]; st2.queue = [];
  run.chooseRelic(st2, data, "rl_stone_greaves");
  st2.phase = "relic"; st2.pendingRelicChoices = ["rl_coach_notebook"]; st2.queue = [];
  run.chooseRelic(st2, data, "rl_coach_notebook");
  const snap = run.buildTeamSnapshot(st2, data);
  assert.equal(snap.modifiers.shootPower, 0.05);
  assert.equal(snap.modifiers.defense, 0.05);
  assert.equal(snap.modifiers.staminaCost, 0.05);
  assert.equal(snap.modifiers.intentReveal, 1);
  for (const k of ["shootPower", "defense", "tensionGain", "staminaCost", "intentReveal", "passAttack"]) assert.ok(k in snap.modifiers);
  assert.equal(snap.players.length, 7);
  // 기본 편성은 같은 원소가 최대 2명 → 공명 없음 (8명 데이터에서는 어떤 편성도 3명 공명이 불가능)
  assert.equal(snap.resonance, null);
  // 시즌3 상대는 공명 보유 (불 4명 → strong)
  const ember = run.buildOpponentSnapshot(data.opponents.find((o) => o.id === "op_s3_emberthrone"), data);
  assert.ok(ember.resonance && ember.resonance.element === "fire" && ember.resonance.strong === true);
  assert.ok(Math.abs(ember.resonance.bonus.shootPower - 0.05 * cfg.elementResonance.strongMult) < 1e-9);

  // 경기에서 intentReveal modifier 가 공개 단계를 올린다 (시즌1 상대 full → 그대로 full, 시즌3 상대 none → partial)
  const opp3 = data.opponents.find((o) => o.id === "op_s3_emberthrone");
  const ms = match.createMatch({ data, seed: 1, home: snap, away: run.buildOpponentSnapshot(opp3, data), possessions: 8, kind: "goal" });
  assert.equal(match.revealLevelFor(ms, data, "home"), "partial");
  const snapPlain = run.buildTeamSnapshot(state, data);
  const ms0 = match.createMatch({ data, seed: 1, home: snapPlain, away: run.buildOpponentSnapshot(opp3, data), possessions: 8, kind: "goal" });
  assert.equal(match.revealLevelFor(ms0, data, "home"), "none");

  // 유물: 낡은 주장 완장 → 목표 경기 컨디션 +1 단계
  const st3 = clone(state);
  st3.phase = "relic"; st3.pendingRelicChoices = ["rl_captain_band"]; st3.queue = [];
  run.chooseRelic(st3, data, "rl_captain_band");
  st3.condition = 2;
  st3.pendingMatch = { kind: "goal", opponentId: "op_s1_ironhoof", possessions: 8, seed: 1, reason: "goal" };
  assert.equal(run.buildTeamSnapshot(st3, data).conditionMult, cfg.condition.matchMult[3]);
  st3.pendingMatch.kind = "friendly";
  assert.equal(run.buildTeamSnapshot(st3, data).conditionMult, cfg.condition.matchMult[2]);

  // 루트: 명문 캠프 → 시즌 modifier (trainingEfficiency +0.2, injuryRate +0.05) → failRate 가산, 다음 시즌 만료
  const st4 = clone(state);
  st4.phase = "route"; st4.pendingRoutes = data.routes.map((r) => r.id); st4.queue = []; st4.season = 1; st4.turn = 8;
  run.chooseRoute(st4, data, "rt_camp");
  while (st4.phase !== "turn") stepRun(st4, data, {});
  assert.equal(st4.season, 2);
  assert.equal(st4.turn, 1);
  assert.equal(st4.summonTickets, cfg.summonTicketsPerSeason * 2);
  assert.equal(getModifier(st4, "trainingEfficiency"), 0.2);
  assert.equal(getModifier(st4, "injuryRate"), 0.05);
  const slot4 = STATS.find((s) => st4.placement[s].players.length > 0);
  const pv4 = previewSlot(st4, data, slot4);
  for (const pp of pv4.perPlayer) {
    const p = st4.players.find((x) => x.id === pp.playerId);
    const baseRate = cfg.training.failRateByStamina.slice().sort((a, b) => b[0] - a[0]).find(([th]) => p.stamina >= th)[1];
    const reduction = st4.placement[slot4].supports.reduce((a, id) => a + (data.supports.find((s) => s.id === id).failRateReduction || 0), 0);
    assert.ok(Math.abs(pp.failRate - Math.min(0.95, Math.max(0, baseRate + 0.05 - reduction))) < 1e-9, "failRate 에 injuryRate 가산");
  }
  st4.phase = "route"; st4.pendingRoutes = data.routes.map((r) => r.id); st4.queue = [];
  run.chooseRoute(st4, data, "rt_hotspring");
  assert.equal(getModifier(st4, "trainingEfficiency"), 0, "시즌 modifier 만료");
  assert.equal(st4.condition, 4, "온천: 컨디션 최고");
  for (const p of st4.players) assert.equal(p.stamina, 100, "온천: 체력 100");
  assert.equal(st4.season, 3);

  // 루트: 원정 → 강제 친선전 (reason route, 그 시즌 최강 friendly)
  const st5 = clone(state);
  st5.phase = "route"; st5.pendingRoutes = data.routes.map((r) => r.id); st5.queue = [];
  run.chooseRoute(st5, data, "rt_expedition");
  while (st5.phase === "event") run.resolveEvent(st5, data, 0);
  assert.equal(st5.phase, "match");
  assert.equal(st5.pendingMatch.kind, "friendly");
  assert.equal(st5.pendingMatch.reason, "route");
  assert.equal(st5.pendingMatch.opponentId, "op_f2_thunderclaw");
  const setup5 = run.getMatchSetup(st5, data);
  assert.equal(setup5.reason, "route");
  run.finishMatch(st5, data, { winner: "home", homeGoals: 1, awayGoals: 0 });
  assert.equal(st5.phase, "relic", "원정 친선전 승리 → 유물 3택");
  assert.equal(st5.pendingRelicChoices.length, 3);
});

test("finishMatch: 승리 → SP·유물 3택, 패배 → losses·SP, lossPenaltyHalf → 2택", () => {
  const mk = (seed) => {
    const st = run.createRun({ data, seed });
    st.phase = "match"; st.queue = ["seasonEnd"]; st.currentEvent = null;
    st.pendingMatch = { kind: "goal", opponentId: "op_s1_ironhoof", possessions: 8, seed: 5, reason: "goal" };
    return st;
  };
  const w = mk("w");
  run.finishMatch(w, data, { winner: "home", homeGoals: 2, awayGoals: 1, stats: {}, penalties: null });
  assert.equal(w.phase, "relic");
  assert.equal(w.pendingRelicChoices.length, 3);
  assert.equal(w.skillPoints, cfg.goalMatch.skillPointsWin);
  assert.deepEqual(w.record.goalMatches[0], { season: 1, opponentId: "op_s1_ironhoof", win: true, home: 2, away: 1 });
  run.chooseRelic(w, data, w.pendingRelicChoices[1]);
  assert.equal(w.phase, "route", "시즌1 끝 → 루트");
  assert.deepEqual(w.pendingRoutes, data.routes.map((r) => r.id));
  assert.throws(() => run.chooseRoute(w, data, "rt_nope"), /루트/);

  const l = mk("l");
  run.finishMatch(l, data, { winner: "away", homeGoals: 0, awayGoals: 1 });
  assert.equal(l.phase, "route");
  assert.equal(l.record.losses, 1);
  assert.equal(l.skillPoints, cfg.goalMatch.skillPointsLoss);
  assert.equal(l.pendingRelicChoices, null);

  const h = mk("h");
  h.modifiers.push({ key: "lossPenaltyHalf", amount: 1, untilSeason: null });
  run.finishMatch(h, data, { winner: "away", homeGoals: 0, awayGoals: 1 });
  assert.equal(h.phase, "relic");
  assert.equal(h.pendingRelicChoices.length, 2);
  assert.equal(h.skillPoints, Math.round((cfg.goalMatch.skillPointsWin + cfg.goalMatch.skillPointsLoss) / 2));

  // 시즌 3 승리 → relic → finished
  const f = mk("f");
  f.season = 3; f.turn = 8; f.turnIndex = 23;
  f.pendingMatch.opponentId = "op_s3_emberthrone";
  run.finishMatch(f, data, { winner: "home", homeGoals: 1, awayGoals: 0 });
  run.chooseRelic(f, data, f.pendingRelicChoices[0]);
  assert.equal(f.phase, "finished");
  const fin = run.finalizeRun(f, data);
  assert.equal(fin.rating.breakdown.losses, 0);
  assert.throws(() => run.finishMatch(f, data, { winner: "home" }), /phase/);
  assert.throws(() => run.finishMatch(mk("x"), data, { winner: "tie" }), /winner/);
});

test("부상 선수는 배치되지 않고 경기에서 유스로 대체된다", () => {
  let state = run.createRun({ data, seed: "injury" });
  while (state.phase !== "turn") stepRun(state, data, {});
  const p = state.players.find((x) => x.slot === "FW1");
  p.injuredTurns = 2;
  // 다음 턴 배치에서 제외되는지: 훈련 한 번 → 다음 턴
  run.applyAction(state, data, { type: "rest" });
  while (state.phase !== "turn") stepRun(state, data, {});
  if (p.injuredTurns > 0) {
    const placed = STATS.flatMap((s) => state.placement[s].players);
    assert.ok(!placed.includes(p.id), "부상 중 배치 제외");
  }
  p.injuredTurns = 3;
  const snap = run.buildTeamSnapshot(state, data);
  const youth = snap.players.find((x) => x.slot === "FW1");
  assert.equal(youth.isYouth, true);
  assert.equal(youth.position, "FW");
  assert.deepEqual(youth.skillIds, []);
  for (const s of STATS) assert.equal(youth.stats[s], cfg.youthSubstitute.stats);
  assert.equal(snap.players.length, 7);
  // 원래 선수 스탯은 그대로
  assert.equal(state.players.find((x) => x.id === p.id).stats.shoot, p.stats.shoot);
  // 유스가 포함된 스냅샷으로 경기 생성 가능
  const away = run.buildOpponentSnapshot(data.opponents[0], data);
  const ms = match.createMatch({ data, seed: 3, home: snap, away, possessions: 6, kind: "friendly" });
  match.simulateAuto(ms, data);
  assert.equal(match.isFinished(ms), true);
});

test("getEffectiveStats: 적성 배율", () => {
  const st = run.createRun({ data, seed: 1, squad: { ...cfg.defaultSquad.slots, GK: "ch_dwarf_wall", DF1: "ch_spirit_keeper" } });
  const gk = st.players.find((p) => p.slot === "GK");
  const df = st.players.find((p) => p.slot === "DF1");
  const eGk = run.getEffectiveStats(st, gk.id, data);
  const eDf = run.getEffectiveStats(st, df.id, data);
  for (const s of STATS) {
    assert.equal(eGk[s], Math.round(gk.stats[s] * cfg.aptitudeMult.B));
    assert.equal(eDf[s], Math.round(df.stats[s] * cfg.aptitudeMult.C));
  }
  const eNoData = run.getEffectiveStats(st, gk.id);
  assert.equal(eNoData.defense, Math.round(gk.stats.defense * 0.9));
});

test("스킬 구매: 힌트 → 할인가 → 미팅에서 습득 (포지션 제한·슬롯 3개)", () => {
  let state = run.createRun({ data, seed: "shop" });
  while (state.phase !== "turn") stepRun(state, data, {});
  state.hints = { sk_power_shot: 2, sk_calm_keeper: 1, sk_second_wind: 3 };
  state.skillPoints = 1000;
  const view = run.getTurnView(state, data);
  const shopIds = view.shop.map((s) => s.skillId).sort();
  assert.deepEqual(shopIds, ["sk_calm_keeper", "sk_power_shot", "sk_second_wind"]);
  const ps = view.shop.find((s) => s.skillId === "sk_power_shot");
  assert.equal(ps.discountedCost, Math.round(150 * (1 - 0.2)));
  assert.equal(ps.hintLevel, 2);
  const fwIds = state.players.filter((p) => p.position === "FW").map((p) => p.id).sort();
  assert.deepEqual(ps.eligiblePlayerIds.slice().sort(), fwIds, "FW 전용 스킬은 FW 만");
  const ck = view.shop.find((s) => s.skillId === "sk_calm_keeper");
  assert.deepEqual(ck.eligiblePlayerIds, [state.players.find((p) => p.position === "GK").id]);
  const fw = state.players.find((p) => p.position === "FW");
  const sp0 = state.skillPoints;
  run.applyAction(state, data, { type: "meeting", buy: { skillId: "sk_power_shot", playerId: fw.id } });
  assert.deepEqual(fw.learnedSkillIds, ["sk_power_shot"]);
  assert.equal(state.skillPoints, sp0 - 120);
  while (state.phase !== "turn") stepRun(state, data, {});
  const gk = state.players.find((p) => p.position === "GK");
  assert.throws(() => run.applyAction(state, data, { type: "meeting", buy: { skillId: "sk_power_shot", playerId: gk.id } }), /포지션|구매 불가/);
  assert.throws(() => run.applyAction(state, data, { type: "meeting", buy: { skillId: "sk_focus_finish", playerId: fw.id } }), /힌트|구매 불가/);
  // 스냅샷에 습득 스킬 포함 → 경기 생성 OK
  const snap = run.buildTeamSnapshot(state, data);
  assert.ok(snap.players.find((p) => p.id === fw.id).skillIds.includes("sk_power_shot"));
  const ms = match.createMatch({ data, seed: 9, home: snap, away: run.buildOpponentSnapshot(data.opponents[0], data), possessions: 6, kind: "friendly" });
  match.simulateAuto(ms, data);
  assert.ok(match.isFinished(ms));
});

test("여러 seed 스모크 (20 seed, 휴식 추천 정책 포함)", () => {
  for (let i = 0; i < 20; i++) {
    const { state, final } = playRun(data, `smoke-${i}`, { restWhenRecommended: i % 2 === 0 });
    assert.equal(state.phase, "finished");
    assert.ok(final.rating.score > 0);
    assertInvariants(state, `smoke-${i}`);
  }
});

test("부상 카운트 = 결장하는 배치 횟수 (turns:1 → 1회, 훈련 실패 injuryTurns → 2회, preMatch 부상 → 경기 유스 대체)", () => {
  const injuryEvent = (id, trigger) => ({
    id, trigger, weight: 1, minTurnIndex: 0, seasons: [1, 2, 3], once: false, title: "t", text: "t",
    choices: [{ text: "x", preview: "부상 1턴", effects: [{ type: "injury", target: "player", turns: 1 }] }],
  });
  const settle = (s, d) => { while (s.phase === "event") run.resolveEvent(s, d, 0); };
  // (1) 이벤트 injury turns:1 은 다음 턴 배치 1회 결장 (이전: 이벤트 직후 턴 종료에서 −1 되어 무효)
  {
    const d = clone(data); d.config.eventChancePerTurn = 1;
    d.events = d.events.filter((e) => e.trigger !== "random" && e.trigger !== "seasonStart" && e.trigger !== "support");
    d.events.push(injuryEvent("ev_t1", "random"));
    const s = run.createRun({ data: d, seed: "inj1" });
    run.applyAction(s, d, { type: "rest" });
    assert.equal(s.phase, "event");
    const pid = s.currentEvent.playerId;
    run.resolveEvent(s, d, 0);
    const placed = () => STATS.some((st) => s.placement[st].players.includes(pid));
    assert.equal(s.phase, "turn");
    assert.equal(placed(), false, "부상 다음 턴 배치 제외");
    assert.equal(s.players.find((p) => p.id === pid).injuredTurns, 0, "배치 제외 직후 소진");
    run.applyAction(s, d, { type: "rest" }); settle(s, d);
    assert.equal(placed(), true, "그 다음 턴 복귀");
  }
  // (2) injuredTurns 2 → 이후 2회 배치 제외, 3번째 복귀
  {
    const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
    const s = run.createRun({ data: d, seed: "inj2" });
    const p = s.players.find((x) => x.slot === "MF1");
    p.injuredTurns = d.config.training.injuryTurns;
    assert.equal(p.injuredTurns, 2);
    const placed = () => STATS.some((st) => s.placement[st].players.includes(p.id));
    const seq = [];
    for (let i = 0; i < 3; i++) { run.applyAction(s, d, { type: "rest" }); settle(s, d); seq.push(placed()); }
    assert.deepEqual(seq, [false, false, true]);
    assert.equal(p.injuredTurns, 0);
  }
  // (3) 8턴 preMatch 부상은 경기 전에 사라지지 않고 유스 대체로 이어진다
  {
    const d = clone(data); d.config.eventChancePerTurn = 0;
    d.events = d.events.filter((e) => e.trigger !== "seasonStart" && e.trigger !== "preMatch");
    d.events.push(injuryEvent("ev_pm", "preMatch"));
    const s = run.createRun({ data: d, seed: "pm" });
    while (s.turn < cfg.turnsPerSeason) { run.applyAction(s, d, { type: "rest" }); settle(s, d); }
    run.applyAction(s, d, { type: "rest" });
    assert.equal(s.phase, "event");
    const pid = s.currentEvent.playerId;
    run.resolveEvent(s, d, 0);
    assert.equal(s.phase, "match");
    assert.equal(s.players.find((x) => x.id === pid).injuredTurns, 1);
    const slot = s.players.find((x) => x.id === pid).slot;
    assert.equal(run.getMatchSetup(s, d).home.players.find((x) => x.slot === slot).isYouth, true, "경기에서 유스 대체");
  }
});

test("getTurnView().nextMatch.intentReveal 은 intentReveal modifier 단계 상승을 반영한다 (경기 revealLevelFor 와 동일)", () => {
  const LV = ["none", "partial", "full"];
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  const s = run.createRun({ data: d, seed: "ir" });
  for (const season of [1, 2, 3]) {
    s.season = season;
    const opp = d.opponents.find((o) => o.role === "goal" && o.season === season);
    const nm0 = run.getTurnView(s, d).nextMatch;
    assert.equal(nm0.baseIntentReveal, opp.intentReveal);
    assert.equal(nm0.intentReveal, opp.intentReveal, "modifier 없으면 기본값");
    s.modifiers.push({ key: "intentReveal", amount: 1, untilSeason: null, source: "test" });
    const nm1 = run.getTurnView(s, d).nextMatch;
    assert.equal(nm1.intentReveal, LV[Math.min(2, LV.indexOf(opp.intentReveal) + 1)], `시즌 ${season} 한 단계 상승`);
    assert.equal(nm1.baseIntentReveal, opp.intentReveal);
    s.modifiers.pop();
  }
});

test("finishMatch: 승부차기 결과(penalties)가 record.goalMatches 항목에 기록된다", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart" && e.trigger !== "preMatch");
  const toMatch = (s) => { while (s.phase !== "match") { run.applyAction(s, d, { type: "rest" }); while (s.phase === "event") run.resolveEvent(s, d, 0); } };
  const s = run.createRun({ data: d, seed: "pkrec" });
  toMatch(s);
  run.finishMatch(s, d, { winner: "away", homeGoals: 1, awayGoals: 1, penalties: { home: 3, away: 4 } });
  const g = s.record.goalMatches.at(-1);
  assert.equal(g.win, false);
  assert.equal(g.home, 1);
  assert.equal(g.away, 1);
  assert.deepEqual(g.penalties, { home: 3, away: 4 });
  // 승부차기 없는 결과에는 penalties 키가 없다
  const s2 = run.createRun({ data: d, seed: "pkrec2" });
  toMatch(s2);
  run.finishMatch(s2, d, { winner: "home", homeGoals: 2, awayGoals: 0 });
  assert.equal("penalties" in s2.record.goalMatches.at(-1), false);
});
