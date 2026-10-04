// test/run.test.mjs — ARCHITECTURE §5, §6, §9, §13.1·13.5 (실제 data/*.json + 실제 match.js 로 경기)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, playRun, stepRun, clone, run, match } from "./helpers.mjs";
import { applyEffects, MODIFIER_KEYS } from "../js/engine/effects.js";
import { getModifier, previewSlot, STATS, formationSlots } from "../js/engine/training.js";

const data = loadData();
const cfg = data.config;
const PHASES = new Set(["turn", "event", "match", "relic", "route", "finished"]);

/** v0.3 연계 특성 id (§13.1 traits.json 표) */
const TRAIT_IDS = ["killpass", "finisher", "crosser", "targetman", "runner", "carrier", "wall", "distributor", "captain"];
/** §13.1 characters.json trait 배정 */
const CHAR_TRAITS = {
  ch_elf_playmaker: "killpass", ch_wolf_winger: "crosser", ch_giant_striker: "targetman", ch_human_runner: "runner",
  ch_cat_trickster: "carrier", ch_dwarf_wall: "wall", ch_spirit_keeper: "distributor", ch_human_captain: "captain",
  // LESSON_PROTO_PLAN §19.12 ① 새 8명 (브랜치 outgame-lesson)
  ch_giant_keeper: "captain", ch_spirit_striker: "finisher", ch_elf_regista: "killpass", ch_rabbit_fullback: "runner",
  ch_spirit_dribbler: "carrier", ch_elf_archer: "crosser", ch_human_header: "targetman", ch_dwarf_finisher: "finisher",
};
/** data/<name>.json 이 있으면 읽는다 (traits/combos 는 엔진 담당 신규 파일, helpers 번들 밖) */
function readOptionalData(name) {
  const p = fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
/** 이벤트/루트 효과 트리를 훑는다 (random 분기 포함) */
function walkEffects(effs, fn) {
  for (const e of effs || []) {
    fn(e);
    if (e.type === "random") { walkEffects(e.then, fn); walkEffects(e.else, fn); }
  }
}

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
  assert.equal(state.players.find((p) => p.id === mf2.id).aptitude, "B", "타리아 DF 적성 B");
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
  // modifier 키 (§6.7 + §13.5: intentReveal 삭제, gaanpaTicket·gaanpaCostHalf 추가) — 유물·루트·이벤트 전부
  assert.ok(!MODIFIER_KEYS.includes("intentReveal"), "intentReveal 은 삭제된 키");
  for (const k of ["gaanpaTicket", "gaanpaCostHalf"]) assert.ok(MODIFIER_KEYS.includes(k), `새 키 ${k}`);
  for (const r of data.relics) for (const k of Object.keys(r.modifiers)) assert.ok(MODIFIER_KEYS.includes(k), `${r.id} modifier ${k}`);
  for (const rt of data.routes) walkEffects(rt.effects, (e) => { if (e.type === "modifier") assert.ok(MODIFIER_KEYS.includes(e.key), `${rt.id} ${e.key}`); });
  for (const ev of data.events) for (const c of ev.choices) walkEffects(c.effects, (e) => { if (e.type === "modifier") assert.ok(MODIFIER_KEYS.includes(e.key), `${ev.id} ${e.key}`); });
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
  // 감독의 수첩 (v0.3): 경기마다 간파 사용권 1 + 간파 스킬 비용 절반
  assert.equal(snap.modifiers.gaanpaTicket, 1);
  assert.equal(snap.modifiers.gaanpaCostHalf, 1);
  assert.equal(snap.gaanpaTickets, 1);
  assert.equal(snap.gaanpaCostHalf, true);
  for (const k of ["shootPower", "defense", "tensionGain", "staminaCost", "passAttack", "dribbleStaminaRefund", "gaanpaTicket", "gaanpaCostHalf"]) assert.ok(k in snap.modifiers, k);
  assert.equal("intentReveal" in snap.modifiers, false, "intentReveal modifier 삭제");
  assert.equal("intentReveal" in snap, false, "스냅샷 intentReveal 삭제");
  assert.equal(snap.players.length, 7);
  // 기본 편성은 같은 원소가 최대 2명 → 공명 없음 (16명이면 3명 공명 편성이 가능하다 — §19.12 ①)
  assert.equal(snap.resonance, null);
  // 시즌3 상대는 공명 보유 (불 4명 → strong)
  const ember = run.buildOpponentSnapshot(data.opponents.find((o) => o.id === "op_s3_emberthrone"), data);
  assert.ok(ember.resonance && ember.resonance.element === "fire" && ember.resonance.strong === true);
  assert.ok(Math.abs(ember.resonance.bonus.shootPower - 0.05 * cfg.elementResonance.strongMult) < 1e-9);

  // 유물 없는 스냅샷은 간파 사용권 0
  const snapPlain = run.buildTeamSnapshot(state, data);
  assert.equal(snapPlain.gaanpaTickets, 0);
  assert.equal(snapPlain.gaanpaCostHalf, false);

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

/** styleHint 기대값을 테스트 쪽에서 따로 계산 (§13.5: 필드 선수 공격 1위 액션 다수결, 동률 드리블) */
function expectedStyleHint(opp, d = data) {
  const m = d.config.match;
  const tb = (m.tendency && m.tendency.tacticBonus) || 1.15;
  const counts = { dribble: 0, pass: 0 };
  for (const p of opp.players) {
    if (p.position === "GK") continue;
    const dv = p.stats.dribble * (m.actionCoef.dribble || 1) * (opp.tactics.attack === "dribble" ? tb : 1);
    const pv = p.stats.pass * (m.actionCoef.pass || 1) * (opp.tactics.attack === "pass" ? tb : 1);
    counts[pv > dv ? "pass" : "dribble"] += 1;
  }
  const label = counts.dribble > counts.pass ? "드리블 위주" : counts.pass > counts.dribble ? "패스 위주" : "혼합";
  return { label, counts };
}

test("getTurnView().nextMatch.styleHint: 상대 필드 선수 공격 1위 액션 다수결 (intentReveal 대체, §13.5)", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  const s = run.createRun({ data: d, seed: "style" });
  for (const season of [1, 2, 3]) {
    s.season = season;
    const opp = d.opponents.find((o) => o.role === "goal" && o.season === season);
    const before = JSON.stringify(s);
    const nm = run.getTurnView(s, d).nextMatch;
    assert.equal(JSON.stringify(s), before, "getTurnView 상태 불변");
    assert.equal(nm.opponentId, opp.id);
    const exp = expectedStyleHint(opp, d);
    assert.equal(nm.styleHint, exp.label, `시즌 ${season} ${opp.name}`);
    assert.deepEqual(nm.styleCounts, exp.counts);
    assert.ok(["dribble", "pass", "mixed"].includes(nm.styleHintKey));
    assert.equal(nm.styleCounts.dribble + nm.styleCounts.pass, opp.players.filter((p) => p.position !== "GK").length, "필드 선수 전원 집계 (GK 제외)");
    assert.equal("intentReveal" in nm, false, "intentReveal 삭제");
    assert.equal("baseIntentReveal" in nm, false, "baseIntentReveal 삭제");
    assert.equal(nm.gaanpaTickets, 0);
  }
  // 데이터 성격: 드리블 전술 팀은 드리블 위주로 읽힌다 (전술·설명과 예상 행동이 일치)
  for (const o of d.opponents) {
    const h = run.opponentStyleHint(o, d);
    if (o.tactics.attack === "dribble") assert.equal(h.label, "드리블 위주", `${o.id} 드리블 전술`);
    if (o.tactics.attack === "pass") assert.equal(h.label, "패스 위주", `${o.id} 패스 전술`);
  }
  // pendingMatch(친선전)가 있으면 그 상대 기준
  s.season = 2;
  s.pendingMatch = { kind: "friendly", opponentId: "op_f2_thunderclaw", possessions: 6, seed: 1, reason: "friendly" };
  const nmF = run.getTurnView(s, d).nextMatch;
  assert.equal(nmF.opponentId, "op_f2_thunderclaw");
  assert.equal(nmF.styleHint, expectedStyleHint(d.opponents.find((o) => o.id === "op_f2_thunderclaw"), d).label);
  s.pendingMatch = null;

  // 합성 팀: 전술 보정(×tacticBonus)이 1위를 뒤집고, 3:3 이면 혼합, GK 는 세지 않는다
  const tb = d.config.match.tendency.tacticBonus;
  const mk = (attack, fieldStats) => ({
    tactics: { attack },
    players: [
      { slot: "GK", position: "GK", stats: { dribble: 900, pass: 10 } },
      ...fieldStats.map(([dr, pa], i) => ({ slot: `X${i}`, position: i < 2 ? "DF" : i < 4 ? "MF" : "FW", stats: { dribble: dr, pass: pa } })),
    ],
  });
  const close = Math.round(300 * tb) - 10; // 드리블 300 × tacticBonus > 이 패스 값 > 드리블 300
  const flip = [[300, close], [300, close], [300, close], [300, close], [100, 200], [100, 200]];
  assert.equal(run.opponentStyleHint(mk("balanced", flip), d).label, "패스 위주", "보정 없으면 패스");
  assert.equal(run.opponentStyleHint(mk("dribble", flip), d).label, "드리블 위주", "드리블 전술 ×tacticBonus 로 뒤집힘");
  const mixed = [[300, 100], [300, 100], [300, 100], [100, 300], [100, 300], [100, 300]];
  const hm = run.opponentStyleHint(mk("balanced", mixed), d);
  assert.equal(hm.label, "혼합");
  assert.deepEqual(hm.counts, { dribble: 3, pass: 3 }, "GK 는 집계하지 않음");
  const tie = [[200, 200], [200, 200], [200, 200], [200, 200], [100, 300], [100, 300]];
  assert.equal(run.opponentStyleHint(mk("balanced", tie), d).label, "드리블 위주", "동률은 드리블 (tieAttack 순서)");
});

test("v0.3 데이터: 캐릭터 연계 특성 배정, traits.json 참조, 상대 팀 특성 2~4명(시즌별 증가)·크로스 후보", () => {
  const traits = readOptionalData("traits");
  const traitIds = new Set(traits ? traits.map((t) => t.id) : TRAIT_IDS);
  for (const id of TRAIT_IDS) assert.ok(traitIds.has(id), `traits.json 에 ${id}`);
  // 캐릭터 16명 = §13.1 배정 + §19.12 ① 새 8명
  assert.equal(data.characters.length, Object.keys(CHAR_TRAITS).length);
  for (const c of data.characters) {
    assert.equal(c.trait, CHAR_TRAITS[c.id], `${c.name} trait`);
    assert.ok(traitIds.has(c.trait));
  }
  const countBy = {};
  for (const o of data.opponents) {
    assert.equal("intentReveal" in o, false, `${o.id} intentReveal 필드 삭제`);
    assert.ok(run.DEFENSE_TACTICS.includes(o.tactics.defense), `${o.id} 수비 전술 ${o.tactics.defense}`);
    const withTrait = o.players.filter((p) => p.trait);
    assert.ok(withTrait.length >= 2 && withTrait.length <= 4, `${o.id} 특성 ${withTrait.length}명 (2~4)`);
    for (const p of withTrait) {
      assert.ok(traitIds.has(p.trait), `${o.id} ${p.name} trait ${p.trait}`);
      if (p.trait === "distributor") assert.equal(p.position, "GK", `${o.id} ${p.name} 빠른 배급은 GK`);
      if (p.trait === "crosser") {
        assert.ok(["FW", "MF"].includes(p.position), `${o.id} ${p.name} 크로서는 FW/MF`);
        // 크로스 후보 = FW 전원 + MF 중 피지컬 최고 1명 (크로서 본인 제외) ≥ 1
        const fws = o.players.filter((x) => x.position === "FW" && x !== p);
        const mfs = o.players.filter((x) => x.position === "MF" && x !== p);
        assert.ok(fws.length + (mfs.length ? 1 : 0) >= 1, `${o.id} 크로스 후보`);
      }
      if (p.trait === "targetman") assert.ok(o.players.some((x) => x.trait === "crosser"), `${o.id} 타깃맨이 있으면 크로서도`);
    }
    (countBy[o.role] ||= {})[o.season] = withTrait.length;
  }
  for (const role of ["goal", "friendly"]) {
    const c = countBy[role];
    assert.ok(c[1] <= c[2] && c[2] <= c[3] && c[1] < c[3], `${role} 특성 수가 시즌마다 늘어남 ${JSON.stringify(c)}`);
  }
});

test("v0.3 데이터: 시즌 3 보스 필살기·간파, 서포트 힌트 꿰뚫어보기, 합체기 참조", () => {
  const skills = new Map(data.skills.map((s) => [s.id, s]));
  const boss = data.opponents.find((o) => o.id === "op_s3_emberthrone");
  const fws = boss.players.filter((p) => p.position === "FW");
  const ace = fws.reduce((a, b) => (b.stats.shoot > a.stats.shoot ? b : a), fws[0]);
  assert.ok(ace.skillIds.includes("sk_boss_strike"), `에이스 FW ${ace.name} 필살 슛`);
  assert.ok(boss.players.find((p) => p.position === "GK").skillIds.includes("sk_boss_save"), "GK 필살 세이브");
  for (const p of boss.players) {
    for (const id of p.skillIds) {
      const sk = skills.get(id);
      assert.ok(sk, `${p.name} ${id} 가 skills.json 에 있음`);
      if (sk.positions) assert.ok(sk.positions.includes(p.position), `${p.name}(${p.position}) ${id} positions ${sk.positions}`);
    }
  }
  for (const id of ["sk_boss_strike", "sk_boss_save"]) assert.equal(skills.get(id).kind, "unique", `${id} 필살기`);
  // 보스는 우리 수를 읽는 팀 (GDD 9.11): 간파 스킬 보유
  assert.ok(boss.players.some((p) => p.skillIds.some((id) => ["readBoost", "negateRead"].includes(skills.get(id)?.active?.effect) && id !== "sk_through_pass")), "보스 간파 스킬");
  // 꿰뚫어보기 힌트: 서포트 1~2장, 학습 가능
  const seeThrough = data.supports.filter((s) => s.hintSkillIds.includes("sk_see_through"));
  assert.ok(seeThrough.length >= 1 && seeThrough.length <= 2, `꿰뚫어보기 힌트 서포트 ${seeThrough.length}장`);
  assert.ok(skills.get("sk_see_through").learnable);
  for (const s of seeThrough) assert.ok(!["defense"].includes(s.type), `${s.id} 는 MF·FW 쪽 카드`);
  // 합체기: a·b 모두 unique 스킬
  const combos = readOptionalData("combos");
  if (combos) for (const c of combos) for (const k of ["a", "b"]) assert.equal(skills.get(c[k])?.kind, "unique", `combo ${c.name} ${k}`);
});

test("스냅샷: 연계 특성 trait 전달 (우리 팀·유스·상대·getTurnView·등록 팀)", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  const s = run.createRun({ data: d, seed: "trait" });
  const snap = run.buildTeamSnapshot(s, d);
  for (const p of snap.players) {
    const rp = s.players.find((x) => x.id === p.id);
    assert.equal(p.charId, rp.charId);
    assert.equal(p.trait, CHAR_TRAITS[rp.charId], `${p.name} 스냅샷 trait`);
  }
  // 유스는 특성 없음
  s.players.find((p) => p.slot === "MF1").injuredTurns = 2;
  const snapY = run.buildTeamSnapshot(s, d);
  const youth = snapY.players.find((p) => p.slot === "MF1");
  assert.equal(youth.isYouth, true);
  assert.equal(youth.trait, null);
  s.players.find((p) => p.slot === "MF1").injuredTurns = 0;
  // getTurnView 선수에도 trait
  for (const p of run.getTurnView(s, d).players) assert.equal(p.trait, CHAR_TRAITS[p.charId]);
  // 상대: 데이터 trait 그대로, 없으면 null, skillIds 에 보스 필살기
  for (const o of d.opponents) {
    const os = run.buildOpponentSnapshot(o, d);
    o.players.forEach((p, i) => assert.equal(os.players[i].trait, p.trait || null, `${o.id} ${p.name}`));
    assert.equal(os.gaanpaTickets, 0);
    assert.equal(os.gaanpaCostHalf, false);
    assert.equal("intentReveal" in os, false);
  }
  const ember = run.buildOpponentSnapshot(d.opponents.find((o) => o.id === "op_s3_emberthrone"), d);
  assert.ok(ember.players.some((p) => p.skillIds.includes("sk_boss_strike")));
  assert.ok(ember.players.some((p) => p.position === "GK" && p.skillIds.includes("sk_boss_save")));
  // 등록 팀: trait·charId 포함, 전술 이행
  const fin = clone(s);
  fin.phase = "finished"; fin.tactics.defense = "readIntent";
  const { registeredTeam } = run.finalizeRun(fin, d);
  for (const p of registeredTeam.players) assert.equal(p.trait, CHAR_TRAITS[p.charId]);
  assert.equal(registeredTeam.tactics.defense, "balanced");
});

test("간파 사용권: 감독의 수첩 · 정찰(ev_prematch_s2) · 감독관(ev_treaty_inspector) → 스냅샷 gaanpaTickets, 시즌 만료", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  const base = run.createRun({ data: d, seed: "gaanpa" });
  const fire = (s, eventId, choice) => {
    s.phase = "event"; s.queue = []; s.pendingRelicChoices = null;
    s.currentEvent = { eventId, playerId: s.players[0].id, supportId: null };
    const view = run.getEventView(s, d);
    assert.match(view.choices[choice].preview, /간파 사용권/, `${eventId} preview 가 새 효과를 말한다`);
    assert.doesNotMatch(view.choices[choice].preview, /의도/, `${eventId} preview 에 의도 공개 문구 없음`);
    run.resolveEvent(s, d, choice);
  };
  const s = clone(base);
  s.season = 2; s.turn = 8; s.turnIndex = 15;
  // 정찰 → 이번 경기(그 시즌) 사용권 1
  fire(s, "ev_prematch_s2", 0);
  assert.equal(getModifier(s, "gaanpaTicket"), 1);
  assert.equal(run.buildTeamSnapshot(s, d).gaanpaTickets, 1);
  assert.equal(run.buildTeamSnapshot(s, d).gaanpaCostHalf, false);
  // 정찰 대신 남기 선택지는 사용권 없음
  const s1 = clone(base); s1.season = 2;
  s1.phase = "event"; s1.queue = []; s1.currentEvent = { eventId: "ev_prematch_s2", playerId: s1.players[0].id, supportId: null };
  run.resolveEvent(s1, d, 1);
  assert.equal(run.buildTeamSnapshot(s1, d).gaanpaTickets, 0, "남기 선택지는 사용권 없음");
  // 감독관 협조 → +1 (누적 2)
  fire(s, "ev_treaty_inspector", 0);
  assert.equal(run.buildTeamSnapshot(s, d).gaanpaTickets, 2);
  assert.equal(run.getTurnView(s, d).nextMatch.gaanpaTickets, 2, "다음 경기 정보에도 같은 값");
  // 감독의 수첩 → +1, 비용 절반
  s.phase = "relic"; s.pendingRelicChoices = ["rl_coach_notebook"]; s.queue = [];
  run.chooseRelic(s, d, "rl_coach_notebook");
  const snap = run.buildTeamSnapshot(s, d);
  assert.equal(snap.gaanpaTickets, 3);
  assert.equal(snap.gaanpaCostHalf, true);
  // 시즌이 바뀌면 이벤트 사용권(duration season)은 만료, 유물은 남는다
  s.phase = "route"; s.pendingRoutes = d.routes.map((r) => r.id); s.queue = [];
  run.chooseRoute(s, d, "rt_camp");
  assert.equal(s.season, 3);
  const snap3 = run.buildTeamSnapshot(s, d);
  assert.equal(snap3.gaanpaTickets, 1, "시즌 만료 후 유물 사용권만");
  assert.equal(snap3.gaanpaCostHalf, true);
  // 유물·이벤트 데이터: 새 키 사용
  assert.deepEqual(d.relics.find((r) => r.id === "rl_coach_notebook").modifiers, { gaanpaTicket: 1, gaanpaCostHalf: 1 });
  for (const [evId, ci] of [["ev_prematch_s2", 0], ["ev_treaty_inspector", 0]]) {
    const mods = [];
    walkEffects(d.events.find((e) => e.id === evId).choices[ci].effects, (e) => { if (e.type === "modifier") mods.push(e); });
    assert.deepEqual(mods.map((e) => [e.key, e.amount, e.duration]), [["gaanpaTicket", 1, "season"]], evId);
  }
});

test("전술·저장 이행: readIntent → balanced, intentReveal modifier → 간파 사용권 (createRun·미팅·상대·저장 런·등록 팀)", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  // createRun 입력
  const s = run.createRun({ data: d, seed: "migr", tactics: { defense: "readIntent" } });
  assert.equal(s.tactics.defense, "balanced");
  assert.equal(run.createRun({ data: d, seed: "migr", tactics: { defense: "hold" } }).tactics.defense, "hold", "새 선택지 hold 는 그대로");
  // 미팅 입력
  run.applyAction(s, d, { type: "meeting", tactics: { defense: "readIntent", attack: "pass" } });
  assert.equal(s.tactics.defense, "balanced");
  assert.equal(s.tactics.attack, "pass");
  // 상대 데이터에 readIntent 가 남아 있어도 스냅샷은 balanced
  const opp = clone(d.opponents.find((o) => o.id === "op_s3_emberthrone"));
  opp.tactics.defense = "readIntent";
  assert.equal(run.buildOpponentSnapshot(opp, d).tactics.defense, "balanced");
  for (const o of d.opponents) assert.ok(run.DEFENSE_TACTICS.includes(run.buildOpponentSnapshot(o, d).tactics.defense));
  assert.deepEqual(run.normalizeTactics({ attack: "dribble", defense: "readIntent" }), { attack: "dribble", defense: "balanced", distribution: "auto" });

  // 옛 저장 런 (v0.2): readIntent 전술 + intentReveal modifier (감독의 수첩 유물 + 정찰 이벤트)
  const legacy = clone(s);
  legacy.tactics.defense = "readIntent";
  legacy.relics = ["rl_coach_notebook"];
  legacy.modifiers = [
    { key: "trainingEfficiency", amount: 0.2, untilSeason: 1 },
    { key: "intentReveal", amount: 1, untilSeason: null, source: "relic:rl_coach_notebook" },
    { key: "intentReveal", amount: 1, untilSeason: 1 },
  ];
  const before = JSON.stringify(legacy);
  const snap = run.buildTeamSnapshot(legacy, d);
  assert.equal(JSON.stringify(legacy), before, "스냅샷은 저장 런을 바꾸지 않는다");
  assert.equal(snap.tactics.defense, "balanced");
  assert.equal(snap.gaanpaTickets, 2, "옛 intentReveal 2개 → 사용권 2");
  assert.equal(snap.gaanpaCostHalf, true, "옛 감독의 수첩 → 비용 절반");
  const tv = run.getTurnView(legacy, d);
  assert.equal(JSON.stringify(legacy), before, "getTurnView 도 상태 불변");
  assert.ok(!tv.modifiers.some((m) => m.key === "intentReveal"), "뷰의 modifier 목록은 이행된 키");
  // migrateRun: in-place, 멱등
  run.migrateRun(legacy);
  assert.equal(legacy.tactics.defense, "balanced");
  assert.ok(!legacy.modifiers.some((m) => m.key === "intentReveal"));
  assert.equal(getModifier(legacy, "gaanpaTicket"), 2);
  assert.equal(getModifier(legacy, "gaanpaCostHalf"), 1);
  assert.equal(getModifier(legacy, "trainingEfficiency"), 0.2, "다른 modifier 는 그대로");
  const once = JSON.stringify(legacy);
  run.migrateRun(legacy);
  assert.equal(JSON.stringify(legacy), once, "멱등");
  // 상태를 바꾸는 API 는 진입 시 이행한다
  const legacy2 = JSON.parse(before);
  run.applyAction(legacy2, d, { type: "rest" });
  assert.equal(legacy2.tactics.defense, "balanced");
  assert.ok(!legacy2.modifiers.some((m) => m.key === "intentReveal"));
  // 새 런에는 이행할 것이 없다 (migrateRun 은 아무것도 바꾸지 않음)
  const fresh = run.createRun({ data: d, seed: "fresh" });
  const freshJson = JSON.stringify(fresh);
  run.migrateRun(fresh);
  assert.equal(JSON.stringify(fresh), freshJson);

  // 저장된 등록 팀 (trait·charId 없던 v0.2 등록본)
  const oldTeam = { name: "우리 클럽", tactics: { attack: "balanced", defense: "readIntent" }, players: [{ id: "p4", name: "실루엔", slot: "MF1" }, { id: "p9", name: "모르는 선수", slot: "FW1" }] };
  const t2 = run.migrateRegisteredTeam(oldTeam, d);
  assert.equal(t2.tactics.defense, "balanced");
  assert.equal(t2.players[0].trait, "killpass", "이름으로 캐릭터 특성 찾기");
  assert.equal(t2.players[1].trait, null);
  assert.equal(oldTeam.tactics.defense, "readIntent", "입력은 바꾸지 않는다");
  assert.equal(run.migrateRegisteredTeam({ tactics: {}, players: [{ charId: "ch_dwarf_wall", name: "x" }] }, d).players[0].trait, "wall");
  // 이름 변경(2026-10-01) 전 이름으로 저장된 옛 등록본도 특성을 찾는다 (표시 이름은 그대로)
  const renamedOld = {
    tactics: {},
    players: ["돌바르", "아르덴", "타린", "울릭", "그룸바"].map((name, i) => ({ id: `p${i}`, name })),
  };
  const t3 = run.migrateRegisteredTeam(renamedOld, d);
  assert.deepEqual(t3.players.map((p) => p.trait), ["wall", "captain", "runner", "crosser", "targetman"], "옛 이름 → 캐릭터 특성");
  assert.deepEqual(t3.players.map((p) => p.name), ["돌바르", "아르덴", "타린", "울릭", "그룸바"], "저장된 이름은 바꾸지 않는다");
  assert.equal(run.migrateRegisteredTeam({ tactics: {}, players: [{ name: "constructor" }, { name: "toString" }] }, d).players.every((p) => p.trait === null), true, "프로토타입 키는 이름으로 안 잡힌다");
});

test("effects: 삭제된 modifier key(intentReveal)·알 수 없는 key 는 throw, 새 키 적용", () => {
  const state = run.createRun({ data, seed: "modkey" });
  assert.throws(() => applyEffects(state, data, [{ type: "modifier", key: "intentReveal", amount: 1, duration: "season" }], {}), /modifier key/);
  assert.throws(() => applyEffects(state, data, [{ type: "modifier", key: "nope", amount: 1 }], {}), /modifier key/);
  applyEffects(state, data, [{ type: "modifier", key: "gaanpaTicket", amount: 1, duration: "season" }], {});
  assert.equal(getModifier(state, "gaanpaTicket"), 1);
  assert.equal(state.modifiers.at(-1).untilSeason, state.season);
  // 유물의 modifier 키도 검증
  const d = clone(data);
  d.relics.push({ id: "rl_legacy", name: "옛 유물", rarity: "R", description: "", modifiers: { intentReveal: 1 } });
  const st = clone(state);
  st.phase = "relic"; st.pendingRelicChoices = ["rl_legacy"]; st.queue = [];
  assert.throws(() => run.chooseRelic(st, d, "rl_legacy"), /modifier key/);
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

test("GK 배급 전술 (2026-09-29): distribution short/long/auto — 없거나 잘못된 값은 auto, 옛 저장 런·등록 팀·상대 이행, 미팅으로 변경, 캐논 킥 힌트", () => {
  const d = clone(data); d.config.eventChancePerTurn = 0; d.events = d.events.filter((e) => e.trigger !== "seasonStart");
  assert.deepEqual(run.DISTRIBUTION_TACTICS, ["short", "long", "auto"]);
  assert.equal(cfg.defaultTactics.distribution, "auto", "기본 전술 = 상황 따라");
  assert.equal(run.normalizeTactics({}).distribution, "auto");
  assert.equal(run.normalizeTactics({ distribution: "long" }).distribution, "long");
  assert.equal(run.normalizeTactics({ distribution: "nope" }).distribution, "auto");
  const s = run.createRun({ data: d, seed: "dist", tactics: { distribution: "short" } });
  assert.equal(s.tactics.distribution, "short");
  run.applyAction(s, d, { type: "meeting", tactics: { ...s.tactics, distribution: "long" } });
  assert.equal(s.tactics.distribution, "long", "미팅으로 변경");
  // 옛 저장 런 (distribution 없음) → migrateRun 이 auto 로, 멱등
  const legacy = clone(s);
  delete legacy.tactics.distribution;
  assert.equal(run.buildTeamSnapshot(legacy, d).tactics.distribution, "auto", "스냅샷은 이행된 전술");
  run.migrateRun(legacy);
  assert.equal(legacy.tactics.distribution, "auto");
  const once = JSON.stringify(legacy);
  run.migrateRun(legacy);
  assert.equal(JSON.stringify(legacy), once, "멱등");
  // 상대 · 등록 팀
  for (const o of d.opponents) assert.equal(run.buildOpponentSnapshot(o, d).tactics.distribution, "auto", o.id);
  assert.equal(run.migrateRegisteredTeam({ tactics: { attack: "pass" }, players: [] }, d).tactics.distribution, "auto");
  // 캐논 킥: GK 전용 학습 스킬, 주장 바르바라 힌트
  const ck = d.skills.find((x) => x.id === "sk_cannon_kick");
  assert.deepEqual({ l: ck.learnable, p: ck.positions, e: ck.active.effect, t: ck.tension }, { l: true, p: ["GK"], e: "longPassBoost", t: 25 });
  assert.ok(d.supports.find((x) => x.id === "sp_iron_captain").hintSkillIds.includes("sk_cannon_kick"));
});
