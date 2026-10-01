// test/challenge.test.mjs — 도전 모드 엔진 (js/engine/challenge.js · data/challenge.json · data/challenge_sample_team.json, 2026-10-01)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadData, playRun, clone, match } from "./helpers.mjs";
import * as ch from "../js/engine/challenge.js";
import { getSkill, getPlayerUltimate, isDistributionSkill } from "../js/engine/skills.js";
import { POSITIONS, STATS } from "../js/engine/training.js";
import { buildSampleFile } from "../tools/challenge_sim.mjs";

function readData(name) {
  return JSON.parse(fs.readFileSync(fileURLToPath(new URL(`../data/${name}.json`, import.meta.url)), "utf8"));
}

/** 엔진 번들 + 도전 모드 파일 2개 (UI 가 data/challenge.json · data/challenge_sample_team.json 을 같은 키로 싣는다) */
function bundle() {
  const data = loadData();
  data.challenge = readData("challenge");
  data.challenge_sample_team = readData("challenge_sample_team");
  return data;
}

const data = bundle();
const stages = ch.getStages(data);

/** 자동 런 완주 → 등록 팀 저장본 (app.js registerTeam 과 같은 모양) */
function registered(seed, registeredAt = "2026-10-01T10:00:00.000Z") {
  const { final } = playRun(data, seed, { restWhenRecommended: true });
  return { ...final.registeredTeam, grade: final.rating.cappedGrade, score: final.rating.score, registeredAt };
}
const REG = registered("challenge-test-1");

test("challenge.json: 10단계, 템플릿 존재 · 연속 단계 다른 상대, 8포제션 목표 경기, statTarget 증가 · 스킬 단계 비감소", () => {
  assert.equal(stages.length, 10);
  assert.deepEqual(stages.map((s) => s.stage), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const ids = new Set(data.opponents.map((o) => o.id));
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    assert.ok(ids.has(s.opponentTemplate), `${s.stage}단계 템플릿 ${s.opponentTemplate}`);
    assert.equal(s.possessions, 8);
    assert.equal(s.kind, "goal");
    assert.ok(s.title.length > 0);
    if (i > 0) {
      assert.notEqual(s.opponentTemplate, stages[i - 1].opponentTemplate, `${s.stage}단계가 앞 단계와 같은 상대`);
      assert.ok(s.statTarget > stages[i - 1].statTarget, `${s.stage}단계 statTarget 이 줄었다`);
      assert.ok(s.skillTier >= stages[i - 1].skillTier);
    }
  }
  assert.equal(ch.stageCount(data), 10);
  assert.throws(() => ch.getStage(data, 11), /11단계/);
  assert.equal(ch.stageDisplayName(data, 7), "7단계 · 썬더클로 (각성)");
  assert.equal(ch.stageDisplayName(data, 1), "1단계 · 강변 마을 클럽");
});

test("buildStageOpponent: 전력 = statTarget(반올림 오차 안), 템플릿 고유 스킬·특성 유지, 스킬·포지션 유효, 입력 데이터 불변", () => {
  const before = clone(data.opponents);
  for (const s of stages) {
    const opp = ch.buildStageOpponent(s.stage, data);
    const tpl = data.opponents.find((o) => o.id === s.opponentTemplate);
    assert.ok(Math.abs(opp.challenge.power - s.statTarget) <= 5, `${s.stage}단계 전력 ${opp.challenge.power} vs ${s.statTarget}`);
    assert.equal(opp.formation, tpl.formation);
    assert.equal(opp.players.length, tpl.players.length);
    for (const tp of tpl.players) {
      const p = opp.players.find((x) => x.slot === tp.slot);
      for (const id of tp.skillIds || []) assert.ok(p.skillIds.includes(id), `${s.stage}단계 ${p.name} 고유 스킬 ${id} 유지`);
      assert.equal(p.trait ?? null, tp.trait ?? null);
      for (const k of STATS) assert.equal(p.stats[k] % 10, 0, "10 단위 반올림");
    }
    for (const p of opp.players) {
      assert.ok(POSITIONS.includes(p.position));
      for (const id of p.skillIds) {
        const sk = getSkill(data, id);
        if (Array.isArray(sk.positions) && sk.positions.length) assert.ok(sk.positions.includes(p.position), `${s.stage}단계 ${p.name} ${id} 포지션`);
      }
      assert.ok(p.skillIds.filter((id) => getSkill(data, id).kind === "unique").length <= 1, `${s.stage}단계 ${p.name} 필살기 1개 이하`);
    }
  }
  assert.deepEqual(data.opponents, before);
});

test("스킬 단계: 1~2 없음 · 3~4 액티브 · 5~6 +간파 1 · 7~8 +필살 슛 · 9 +필살 세이브 · 간파 2 · 10 +캐논 킥", () => {
  const info = Object.fromEntries(stages.map((s) => [s.stage, ch.stageInfo(s.stage, data)]));
  for (const n of [1, 2]) {
    assert.equal(info[n].added.length, 0);
    assert.equal(info[n].gaanpaTickets, 0);
    assert.deepEqual(info[n].badges, []);
  }
  for (const n of [3, 4]) {
    assert.equal(info[n].added.filter((a) => a.kind === "active").length, 2);
    assert.ok(info[n].features.active);
    assert.equal(info[n].gaanpaTickets, 0);
  }
  for (const n of [5, 6]) {
    assert.equal(info[n].gaanpaTickets, 1);
    assert.ok(info[n].features.gaanpa);
  }
  for (const n of [7, 8, 9, 10]) assert.ok(info[n].features.ultShot, `${n}단계 필살 슛`);
  for (const n of [9, 10]) {
    assert.ok(info[n].features.ultSave);
    assert.equal(info[n].gaanpaTickets, 2);
  }
  assert.ok(info[10].features.cannon);
  assert.ok(!info[9].features.cannon);
  const gk10 = info[10].players.find((p) => p.position === "GK");
  assert.ok(gk10.skillIds.includes("sk_cannon_kick"));
  assert.ok(info[10].added.filter((a) => a.kind === "active").length >= 3);
  // 엠버스론(6단계)은 템플릿 고유 필살기(업화의 일격 · 불꽃 장벽)를 그대로 가진다
  assert.ok(info[6].features.ultShot && info[6].features.ultSave);
  // 미리보기 모양
  const p = info[7];
  assert.equal(p.displayName, "7단계 · 썬더클로 (각성)");
  assert.equal(p.teamName, "썬더클로 (각성)");
  assert.equal(p.players.length, 7);
  assert.ok(["dribble", "pass", "mixed"].includes(p.styleHint.key));
  assert.equal(typeof p.players[0].mainValue, "number");
  assert.deepEqual(p.badges.map((b) => b.key), ch.FEATURE_KEYS.filter((k) => p.features[k]));
});

test("단계 상대 스냅샷: createMatch 검증 통과 · 자동 경기 완주 · 목표 경기는 무승부 없음 · 간파 사용권 반영", () => {
  for (const s of stages) {
    const away = ch.buildStageOpponentSnapshot(s.stage, data);
    assert.equal(away.side, "away");
    assert.equal(away.gaanpaTickets, ch.stageInfo(s.stage, data).gaanpaTickets);
    const setup = ch.challengeSetup(REG, s.stage, 1, data);
    const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
    assert.equal(ms.away.gaanpaTickets, away.gaanpaTickets);
    for (const p of ms.away.players) if (getPlayerUltimate(data, p)) assert.equal(typeof ms.away.live[p.id].gauge, "number");
    match.simulateAuto(ms, data);
    const r = match.getResult(ms);
    assert.ok(r.winner === "home" || r.winner === "away", `${s.stage}단계 무승부`);
  }
});

test("teamIdOf: 샘플 = 'sample', 등록 팀 = 시드·턴·등록 시각에서 고정 id (사본도 같고 등록 시각이 다르면 다르다)", () => {
  const sample = ch.sampleTeam(data);
  assert.equal(ch.teamIdOf(sample), ch.SAMPLE_TEAM_ID);
  const id = ch.teamIdOf(REG);
  assert.match(id, /^t_[0-9a-z]+$/);
  assert.equal(ch.teamIdOf(clone(REG)), id);
  assert.notEqual(ch.teamIdOf({ ...REG, registeredAt: "2026-10-02T10:00:00.000Z" }), id);
  assert.equal(ch.teamIdOf(null), null);
});

test("challengeSetup: run.getMatchSetup 모양 · 시드는 (팀, 단계, 도전 번호)로 결정 · 등록 팀 불변 · 우리 스탯 = 저장본", () => {
  const before = clone(REG);
  const a = ch.challengeSetup(REG, 3, 1, data);
  const b = ch.challengeSetup(clone(REG), 3, 1, data);
  assert.equal(a.seed, b.seed);
  assert.notEqual(ch.challengeSetup(REG, 3, 2, data).seed, a.seed);
  assert.notEqual(ch.challengeSetup(REG, 4, 1, data).seed, a.seed);
  assert.ok(Number.isInteger(a.seed) && a.seed >= 0 && a.seed < 2 ** 32);
  assert.equal(a.kind, "goal");
  assert.equal(a.possessions, 8);
  assert.equal(a.reason, "challenge");
  assert.deepEqual(a.rules, { allowDraw: false, extraTime: true, penalties: true, isGoalMatch: true, possessions: 8 });
  assert.equal(a.stage, 3);
  assert.equal(a.attempt, 1);
  assert.equal(a.teamId, ch.teamIdOf(REG));
  assert.equal(a.displayName, "3단계 · 썬더클로");
  assert.equal(a.opponentName, "썬더클로");
  assert.equal(a.home.side, "home");
  assert.equal(a.home.formation, REG.formation);
  for (const p of REG.players) {
    const q = a.home.players.find((x) => x.id === p.id);
    assert.deepEqual(q.stats, p.stats);
    assert.deepEqual(q.skillIds, p.skillIds);
    assert.equal(q.trait, p.trait);
  }
  assert.deepEqual(REG, before);
  // 같은 시드면 같은 경기
  const run1 = match.createMatch({ data, seed: a.seed, home: a.home, away: a.away, possessions: a.possessions, kind: a.kind });
  const run2 = match.createMatch({ data, seed: b.seed, home: b.home, away: b.away, possessions: b.possessions, kind: b.kind });
  match.simulateAuto(run1, data);
  match.simulateAuto(run2, data);
  assert.deepEqual([match.getResult(run1).homeGoals, match.getResult(run1).awayGoals], [match.getResult(run2).homeGoals, match.getResult(run2).awayGoals]);
});

test("우리 팀 스냅샷: 유물 modifier (간파 사용권 · 목표 경기 컨디션) 를 저장본 유물에서 다시 계산", () => {
  const cfg = data.config;
  const plain = ch.buildChallengeTeamSnapshot({ ...REG, relics: [] }, data);
  assert.equal(plain.gaanpaTickets, 0);
  assert.equal(plain.gaanpaCostHalf, false);
  assert.equal(plain.conditionMult, cfg.condition.matchMult[cfg.condition.start]);
  const t = ch.buildChallengeTeamSnapshot({ ...REG, relics: ["rl_coach_notebook", "rl_captain_band", "rl_flame_pendant"] }, data);
  assert.equal(t.gaanpaTickets, 1);
  assert.equal(t.gaanpaCostHalf, true);
  assert.equal(t.modifiers.shootPower, 0.05);
  assert.equal(t.conditionMult, cfg.condition.matchMult[cfg.condition.start + 1]);
  const f = ch.buildChallengeTeamSnapshot({ ...REG, relics: ["rl_captain_band"] }, data, { kind: "friendly" });
  assert.equal(f.conditionMult, cfg.condition.matchMult[cfg.condition.start]);
});

test("옛 등록 팀 방어: trait 없음(캐릭터에서 채움) · 없는 스킬 id 는 버림 · 고장 난 저장본은 목록에서 빠진다", () => {
  const old = clone(REG);
  for (const p of old.players) delete p.trait;
  old.players[0].skillIds = [...old.players[0].skillIds, "sk_removed_skill"];
  old.tactics = { ...old.tactics, defense: "readIntent" };
  delete old.tactics.distribution;
  const setup = ch.challengeSetup(old, 1, 1, data);
  assert.ok(!setup.home.players[0].skillIds.includes("sk_removed_skill"));
  assert.equal(setup.home.tactics.defense, "balanced");
  assert.equal(setup.home.tactics.distribution, "auto");
  assert.ok(setup.home.players.some((p) => p.trait));
  const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
  match.simulateAuto(ms, data);
  const broken = { ...clone(REG), formation: "3-1-2" }; // 슬롯이 포메이션과 다르다
  const list = ch.listChallengeTeams([REG, clone(REG), broken, null], data);
  assert.deepEqual(list.map((x) => x.teamId), [ch.SAMPLE_TEAM_ID, ch.teamIdOf(REG)]);
});

test("샘플 팀: 파일 모양 · B 등급 완주 팀 · 요약 · 생성은 결정적", () => {
  const raw = data.challenge_sample_team;
  assert.ok(raw.generator && raw.generator.seed);
  const s = ch.sampleTeam(data);
  assert.equal(s.name, ch.SAMPLE_TEAM_NAME);
  assert.equal(s.isSample, true);
  assert.equal(s.players.length, 7);
  const sum = ch.teamSummary(s, data);
  assert.equal(sum.teamId, "sample");
  assert.equal(sum.isSample, true);
  assert.equal(sum.grade, "B");
  assert.equal(sum.players.length, 7);
  assert.equal(sum.players[0].slot, "GK");
  assert.ok(sum.power > 300);
  for (const p of sum.players) assert.equal(p.mainValue, p.stats[p.mainStat]);
  assert.equal(ch.sampleTeam({ ...data, challenge_sample_team: null }), null);
  // 같은 시드로 다시 만들면 같은 팀 (런 엔진이 바뀌면 파일은 --write-sample 로 다시 만든다)
  const g1 = buildSampleFile(data, raw.generator.seed, raw.generator.routeStart);
  const g2 = buildSampleFile(data, raw.generator.seed, raw.generator.routeStart);
  assert.deepEqual(g1, g2);
  assert.ok(ch.listChallengeTeams([], data)[0].summary.isSample);
});

test("진행 기록: 1단계만 열림 → 패배는 도전 수만 · 승리하면 클리어·다음 단계 열림 · 같은 도전 번호는 한 번만 · 초기화 · 입력 불변", () => {
  const id = ch.teamIdOf(REG);
  let p = ch.emptyProgress();
  assert.deepEqual(p, { version: ch.CHALLENGE_PROGRESS_VERSION, teams: {} });
  assert.ok(ch.isUnlocked(p, id, 1));
  assert.ok(!ch.isUnlocked(p, id, 2));
  assert.equal(ch.stageState(p, id, 1), "open");
  assert.equal(ch.nextAttempt(p, id, 1), 1);

  const p0 = p;
  const snap0 = clone(p0);
  p = ch.recordResult(p, id, 1, { attempt: 1, winner: "away", homeGoals: 0, awayGoals: 1, at: "2026-10-01T10:00:00.000Z" });
  assert.notEqual(p, p0);
  assert.deepEqual(p0, snap0);
  let tp = ch.teamProgress(p, id);
  assert.equal(tp.cleared, 0);
  assert.equal(tp.attempts[1], 1);
  assert.equal(tp.wins[1] || 0, 0);
  assert.deepEqual(tp.lastResult, { stage: 1, attempt: 1, win: false, homeGoals: 0, awayGoals: 1, penalties: null, at: "2026-10-01T10:00:00.000Z", forfeit: false });
  assert.ok(!ch.isUnlocked(p, id, 2));
  assert.equal(ch.nextAttempt(p, id, 1), 2);

  const dup = ch.recordResult(p, id, 1, { attempt: 1, winner: "home", homeGoals: 3, awayGoals: 0 });
  assert.equal(dup, p, "이미 센 도전 번호는 그대로");

  p = ch.recordResult(p, id, 1, { attempt: 2, winner: "home", homeGoals: 1, awayGoals: 1, penalties: { home: 4, away: 3 } });
  tp = ch.teamProgress(p, id);
  assert.equal(tp.cleared, 1);
  assert.equal(tp.attempts[1], 2);
  assert.equal(tp.wins[1], 1);
  assert.deepEqual(tp.lastResult.penalties, { home: 4, away: 3 });
  assert.equal(ch.stageState(p, id, 1), "cleared");
  assert.equal(ch.stageState(p, id, 2), "open");
  assert.equal(ch.stageState(p, id, 3), "locked");
  // 클리어한 단계 다시 도전 (패배해도 클리어 유지)
  p = ch.recordResult(p, id, 1, { attempt: 3, win: false, homeGoals: 0, awayGoals: 2 });
  assert.equal(ch.teamProgress(p, id).cleared, 1);
  assert.equal(ch.teamProgress(p, id).attempts[1], 3);
  // 다른 팀은 따로
  assert.equal(ch.teamProgress(p, "sample").cleared, 0);
  p = ch.recordResult(p, "sample", 1, { attempt: 1, winner: "home", homeGoals: 2, awayGoals: 0 });
  // 저장 왕복 (JSON) 후에도 같다
  const back = ch.normalizeProgress(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(back, p);
  // 사다리 보기
  const lad = ch.ladderView(data, p, id);
  assert.equal(lad.length, 10);
  assert.deepEqual(lad.slice(0, 3).map((x) => x.state), ["cleared", "open", "locked"]);
  assert.equal(lad[0].attempts, 3);
  assert.equal(lad[0].wins, 1);
  // 초기화: 이 팀만
  const r = ch.resetProgress(p, id);
  assert.equal(ch.teamProgress(r, id).cleared, 0);
  assert.equal(ch.teamProgress(r, "sample").cleared, 1);
  assert.equal(ch.teamProgress(p, id).cleared, 1, "입력 불변");
  // 고장 난 저장값
  assert.deepEqual(ch.normalizeProgress(null), ch.emptyProgress());
  assert.deepEqual(ch.normalizeProgress({ teams: { x: { cleared: "2", attempts: { 1: "3", bad: 2 }, wins: [] } } }).teams.x,
    { cleared: 2, attempts: { 1: 3 }, wins: {}, lastResult: null, resets: 0 });
  assert.throws(() => ch.recordResult(p, id, 0, { winner: "home" }), /단계/);
});

test("기권 · 진행 초기화 시드 · 밀려난 팀 정리: 포기 = forfeit 패 · 초기화 뒤 1회차는 새 시드 (초기화 전 0 회는 예전 시드 그대로) · forgetTeams", () => {
  const id = ch.teamIdOf(REG);
  // [포기]: 패배로 세고 lastResult.forfeit (이긴 결과를 넘겨도 기권이면 패) — JSON 왕복 뒤에도 남는다
  let p = ch.recordResult(ch.emptyProgress(), id, 1, { attempt: 1, forfeit: true, winner: "home", homeGoals: 2, awayGoals: 0, at: "2026-10-01T10:00:00.000Z" });
  let tp = ch.teamProgress(p, id);
  assert.deepEqual([tp.attempts[1], tp.wins[1] ?? 0, tp.cleared], [1, 0, 0]);
  assert.deepEqual(tp.lastResult, { stage: 1, attempt: 1, win: false, homeGoals: 2, awayGoals: 0, penalties: null, at: "2026-10-01T10:00:00.000Z", forfeit: true });
  assert.equal(ch.normalizeProgress(JSON.parse(JSON.stringify(p))).teams[id].lastResult.forfeit, true);
  assert.equal(ch.normalizeProgress({ teams: { x: { lastResult: { stage: 1, forfeit: "yes" } } } }).teams.x.lastResult.forfeit, false, "true 만 기권");

  // 시드: resets 0 = 예전 키 그대로 (저장된 경기 · 도구 시드 호환), 초기화할 때마다 달라진다
  assert.equal(ch.challengeSeed(id, 1, 1), ch.challengeSeed(id, 1, 1, 0));
  assert.equal(ch.challengeSetup(REG, 1, 1, data).seed, ch.challengeSeed(id, 1, 1));
  assert.equal(ch.challengeSetup(REG, 1, 1, data).resets, 0);
  p = ch.recordResult(p, id, 1, { attempt: 2, winner: "home", homeGoals: 1, awayGoals: 0 });
  const before = clone(p);
  const r1 = ch.resetProgress(p, id);
  assert.deepEqual(p, before, "입력 불변");
  tp = ch.teamProgress(r1, id);
  assert.deepEqual([tp.cleared, tp.attempts, tp.wins, tp.lastResult, tp.resets], [0, {}, {}, null, 1], "초기화: 기록은 지우고 초기화 횟수만 남는다");
  assert.equal(ch.nextAttempt(r1, id, 1), 1, "도전 번호는 1 부터");
  assert.ok(!ch.isUnlocked(r1, id, 2));
  const s1 = ch.challengeSetup(REG, 1, 1, data, { resets: tp.resets });
  assert.equal(s1.resets, 1);
  assert.equal(s1.seed, ch.challengeSeed(id, 1, 1, 1));
  assert.notEqual(s1.seed, ch.challengeSeed(id, 1, 1), "초기화 뒤 1회차 ≠ 초기화 전 1회차");
  const r2 = ch.resetProgress(ch.recordResult(r1, id, 1, { attempt: 1, winner: "away" }), id);
  assert.equal(ch.teamProgress(r2, id).resets, 2);
  assert.notEqual(ch.challengeSeed(id, 1, 1, 2), s1.seed, "다시 초기화하면 또 새 시드");
  assert.equal(ch.teamProgress(ch.normalizeProgress(JSON.parse(JSON.stringify(r2))), id).resets, 2, "초기화 횟수는 저장 왕복 뒤에도 남는다");
  // 기록이 생겨도 resets 는 그대로
  assert.equal(ch.teamProgress(ch.recordResult(r2, id, 1, { attempt: 1, winner: "home" }), id).resets, 2);

  // forgetTeams: 등록 팀 상한에 밀려난 팀은 초기화 횟수까지 통째로 지운다 (샘플 팀은 지우지 않는다)
  let q = ch.recordResult(r2, "sample", 1, { attempt: 1, winner: "home" });
  q = ch.recordResult(q, "t_other", 1, { attempt: 1, winner: "away" });
  const f = ch.forgetTeams(q, [id, "sample", "t_missing"]);
  assert.deepEqual(Object.keys(f.teams).sort(), ["sample", "t_other"]);
  assert.ok(q.teams[id], "입력 불변");
  assert.deepEqual(ch.forgetTeams(q, null), ch.normalizeProgress(q));
});
