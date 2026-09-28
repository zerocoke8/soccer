// test/match.test.mjs — ARCHITECTURE §7, §9 (실제 data/*.json + run.buildOpponentSnapshot)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run, match } from "./helpers.mjs";
import { STATS } from "../js/engine/training.js";
import { createRng } from "../js/engine/rng.js";

const data = loadData();
const cfg = data.config;
const M = cfg.match;

/** 우리 기본 편성(시즌 성장 가정 배율) 스냅샷 */
function homeSnapshot(mult = 1.0, seed = "home") {
  const state = run.createRun({ data, seed });
  for (const p of state.players) for (const s of STATS) p.stats[s] = Math.min(cfg.statCap, Math.round(p.stats[s] * mult));
  state.teamwork = 40;
  return run.buildTeamSnapshot(state, data);
}
const oppSnapshot = (id) => run.buildOpponentSnapshot(data.opponents.find((o) => o.id === id), data);

function assertMatchInvariants(ms, where = "") {
  const max = M.staminaMax;
  for (const side of ["home", "away"]) {
    for (const [pid, lv] of Object.entries(ms[side].live)) {
      assert.ok(Number.isFinite(lv.stamina) && lv.stamina >= 0 && lv.stamina <= max, `${where} ${side} ${pid} stamina ${lv.stamina}`);
    }
    assert.ok(ms[side].tension >= 0 && ms[side].tension <= M.tension.max, `${where} tension ${ms[side].tension}`);
    assert.ok(Number.isFinite(ms.score[side]));
  }
  for (const e of ms.events) {
    assert.ok(typeof e.text === "string" && e.text.length > 0);
    assert.ok(!/NaN|undefined/.test(e.text), `${where} 이벤트 텍스트 NaN/undefined: ${e.text}`);
    if (e.p !== undefined) assert.ok(Number.isFinite(e.p) && e.p >= M.minP - 1e-9 && e.p <= M.maxP + 1e-9, `${where} p=${e.p}`);
  }
  assert.ok(!/NaN/.test(JSON.stringify(ms)), `${where} 상태에 NaN`);
}

test("createMatch: 검증과 초기 상태", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 1, home, away, possessions: 8, kind: "goal" });
  assert.equal(ms.kind, "goal");
  assert.equal(ms.possessionsTotal, 8);
  assert.equal(ms.possession, 1);
  assert.equal(ms.attackingSide, "home");
  assert.equal(ms.phase, "decision");
  assert.equal(ms.home.tension, M.tension.start);
  assert.equal(ms.away.tension, M.tension.start);
  assert.deepEqual(ms.score, { home: 0, away: 0 });
  assert.ok(ms.ball.carrierId && ms.duel && ms.duel.defenderId);
  assert.equal(ms.ball.lineIndex, 0);
  assert.ok(ms.duel.awayChoice && ms.duel.awayChoice.action, "AI(away)가 먼저 결정");
  assert.equal(ms.duel.homeChoice, null);
  for (const p of home.players) assert.equal(ms.home.live[p.id].stamina, M.staminaMax);
  assert.throws(() => match.createMatch({ data, seed: 1, home, away, possessions: 0 }), /possessions/);
  assert.throws(() => match.createMatch({ data, seed: 1, home, away, possessions: 6, kind: "cup" }), /kind/);
  const bad = clone(home); bad.players[0].skillIds = ["sk_nope"];
  assert.throws(() => match.createMatch({ data, seed: 1, home: bad, away, possessions: 6 }), /sk_nope/);
  const dup = clone(home); dup.players[1].id = dup.players[0].id;
  assert.throws(() => match.createMatch({ data, seed: 1, home: dup, away, possessions: 6 }), /중복/);
  // 스냅샷은 복사되어 원본 불변
  assert.equal(home.tension, undefined);
});

test("결정성: 같은 seed 2회 = 같은 결과, JSON roundtrip 후 이어서 진행해도 동일", () => {
  const home = homeSnapshot(1.15);
  const away = oppSnapshot("op_s1_ironhoof");
  const a = match.simulateAuto(match.createMatch({ data, seed: 42, home, away, possessions: 8, kind: "goal" }), data);
  const b = match.simulateAuto(match.createMatch({ data, seed: 42, home, away, possessions: 8, kind: "goal" }), data);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(match.getResult(a)), JSON.stringify(match.getResult(b)));
  // 중간 roundtrip
  let c = match.createMatch({ data, seed: 42, home, away, possessions: 8, kind: "goal" });
  let guard = 0;
  while (!match.isFinished(c)) {
    match.step(c, data, null);
    c = clone(c);
    if (++guard > 5000) throw new Error("guard");
  }
  assert.equal(JSON.stringify(match.getResult(c)), JSON.stringify(match.getResult(a)));
  const d = match.simulateAuto(match.createMatch({ data, seed: 43, home, away, possessions: 8, kind: "goal" }), data);
  assert.notEqual(JSON.stringify(d.events), JSON.stringify(a.events), "다른 seed 는 다른 진행");
});

test("친선전: 포제션 수 준수, 무승부 허용, 연장 없음", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_f1_riverside");
  let draws = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const ms = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 6, kind: "friendly" }), data);
    const starts = ms.events.filter((e) => e.type === "kickoff" || e.type === "counter").length;
    assert.equal(starts, 6, `포제션 시작 이벤트 6회 (seed ${seed})`);
    assert.equal(ms.possessionsTotal, 6);
    assert.equal(ms.stage, "regular");
    const r = match.getResult(ms);
    assert.equal(r.possessionsPlayed, 6);
    assert.equal(r.kind, "friendly");
    assert.equal(r.home, r.homeGoals);
    assert.equal(r.away, r.awayGoals);
    assert.equal(r.stats.home.goals, r.homeGoals);
    assert.equal(r.stats.away.goals, r.awayGoals);
    if (r.winner === "draw") { draws++; assert.equal(r.homeGoals, r.awayGoals); }
    assert.equal(r.penalties, undefined);
    assertMatchInvariants(ms, `friendly ${seed}`);
  }
  assert.ok(draws > 0, "30경기 중 무승부가 한 번은 나와야 함");
});

test("목표 경기: 동점이면 연장 → 승부차기 → 승자 결정, 무승부 없음", () => {
  const home = homeSnapshot(1.0);
  // 같은 팀 대 같은 팀(원정 이름만 바꿈)으로 동점 확률을 높인다
  const away = clone(home);
  away.side = "away"; away.name = "미러 클럽";
  away.players.forEach((p) => { p.id = "q_" + p.id; });
  let penalties = 0;
  let extra = 0;
  for (let seed = 1; seed <= 120 && penalties < 3; seed++) {
    const ms = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" }), data);
    const r = match.getResult(ms);
    assert.notEqual(r.winner, "draw", `goal 경기 무승부 금지 (seed ${seed})`);
    if (ms.stage !== "regular") {
      extra++;
      assert.ok(ms.events.some((e) => e.type === "extraTime"));
      assert.equal(ms.possessionsTotal, 8 + M.extraTimePossessions);
    }
    if (ms.stage === "penalties") {
      penalties++;
      assert.ok(r.penalties && typeof r.penalties.home === "number");
      assert.notEqual(r.penalties.home, r.penalties.away);
      assert.equal(r.winner, r.penalties.home > r.penalties.away ? "home" : "away");
      assert.equal(ms.score.home, ms.score.away, "승부차기 전 득점은 동점");
      const kicks = ms.events.filter((e) => e.type === "penalty");
      assert.ok(kicks.length >= 2);
      assert.equal(ms.penalties.taken.home + ms.penalties.taken.away, kicks.length);
    }
    assertMatchInvariants(ms, `goal ${seed}`);
  }
  assert.ok(extra > 0, "연장전이 발생해야 함");
  assert.ok(penalties > 0, "승부차기가 발생해야 함");
});

test("승부차기 직접 검증: 강제 진입 후 step 한 번 = 한 킥", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 5, home, away, possessions: 8, kind: "goal" });
  // 정규·연장 종료 직전 상태로 만들어 checkEnd 를 유도: 마지막 포제션에서 동점 유지
  ms.stage = "extraTime";
  ms.possession = ms.possessionsTotal;
  let guard = 0;
  while (ms.phase !== "penalties" && !ms.finished && guard++ < 50) {
    // 골이 나면 동점을 복원해 승부차기로 밀어 넣는다
    match.step(ms, data, null);
    if (!ms.finished && ms.phase !== "penalties") ms.score = { home: 0, away: 0 };
  }
  if (ms.finished) {
    // 마지막 듀얼이 골로 끝나 승부차기에 못 갔으면 다른 seed 에서 이미 검증됨 — 여기서는 승부차기 도달 케이스만 확인
    return;
  }
  assert.equal(ms.phase, "penalties");
  const v = match.getMatchView(ms, data);
  assert.equal(v.needsDecision, null);
  assert.equal(v.lineLabel, "승부차기");
  assert.ok(v.penalties && v.penalties.turn === "home");
  const kicksBefore = ms.events.filter((e) => e.type === "penalty").length;
  match.step(ms, data, null);
  assert.equal(ms.events.filter((e) => e.type === "penalty").length, kicksBefore + 1, "step 1회 = 킥 1회");
  match.simulateAuto(ms, data);
  assert.ok(ms.finished);
  const r = match.getResult(ms);
  assert.ok(r.penalties);
  assert.notEqual(r.winner, "draw");
  // 키커 순서: 비GK 슛 내림차순 → GK
  const order = ms.penalties.order.home;
  const players = ms.home.players;
  const nonGk = order.slice(0, -1).map((id) => players.find((p) => p.id === id));
  for (let i = 1; i < nonGk.length; i++) assert.ok(nonGk[i - 1].stats.shoot >= nonGk[i].stats.shoot);
  assert.equal(players.find((p) => p.id === order[order.length - 1]).position, "GK");
});

test("1-FW 포메이션(2-3-1): line 2 에서 FW 캐리어의 패스 비활성, MF 캐리어는 FW 에게 패스 가능", () => {
  const state = run.createRun({
    data, seed: "f231", formation: "2-3-1",
    squad: { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker" },
  });
  const home = run.buildTeamSnapshot(state, data);
  const away = oppSnapshot("op_s1_ironhoof");
  let sawFwLine2 = false;
  let sawMfLine1Pass = false;
  let sawShootBeforeLine2 = false;
  for (let seed = 1; seed <= 60 && !(sawFwLine2 && sawMfLine1Pass); seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 500) {
      if (ms.phase === "decision" && ms.attackingSide === "home") {
        const carrier = ms.home.players.find((p) => p.id === ms.ball.carrierId);
        const acts = match.getAttackActions(ms, "home");
        const byName = Object.fromEntries(acts.map((a) => [a.action, a]));
        if (ms.ball.lineIndex < 2) {
          assert.equal(byName.shoot.enabled, false, "DF 라인 전에는 슛 불가");
          if (byName.shoot.enabled) sawShootBeforeLine2 = true;
        }
        if (ms.ball.lineIndex === 2 && carrier.position === "FW") {
          sawFwLine2 = true;
          assert.equal(byName.pass.enabled, false, "외로운 FW 는 line 2 패스 불가");
          assert.equal(byName.dribble.enabled, true);
          assert.equal(byName.shoot.enabled, true);
          assert.throws(() => match.step(clone(ms), data, { action: "pass" }), /사용할 수 없는 액션/);
        }
        if (ms.ball.lineIndex === 1 && carrier.position === "MF") {
          sawMfLine1Pass = true;
          assert.equal(byName.pass.enabled, true, "MF 는 FW 에게 패스 가능");
          assert.match(byName.pass.hint, /그룸바/);
        }
        if (ms.ball.lineIndex >= 3) {
          assert.equal(byName.dribble.enabled, false);
          assert.equal(byName.pass.enabled, false);
          assert.equal(byName.shoot.enabled, true);
        }
      }
      if (ms.phase === "decision" && ms.attackingSide === "away" && ms.ball.lineIndex >= 3) {
        assert.equal(match.getMatchView(ms, data).needsDecision, null, "GK 듀얼은 수비 결정 없음");
      }
      match.step(ms, data, null);
    }
    assertMatchInvariants(ms, `231 ${seed}`);
  }
  assert.ok(sawFwLine2, "FW 캐리어가 line 2 에 도달한 경기가 있어야 함");
  assert.ok(sawMfLine1Pass, "MF 캐리어 line 1 패스 상황이 있어야 함");
  assert.equal(sawShootBeforeLine2, false);
});

test("수비 액션 규칙: line 0·1 은 block 비활성, line 2 는 셋 다", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const seenLines = new Set();
  for (let seed = 1; seed <= 40 && seenLines.size < 3; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 500) {
      if (ms.phase === "decision" && ms.attackingSide === "away" && ms.ball.lineIndex < 3) {
        const line = ms.ball.lineIndex;
        seenLines.add(line);
        const acts = Object.fromEntries(match.getDefenseActions(ms, "home").map((a) => [a.action, a.enabled]));
        assert.equal(acts.tackle, true);
        assert.equal(acts.intercept, true);
        assert.equal(acts.block, line === 2);
        const v = match.getMatchView(ms, data);
        assert.equal(v.needsDecision, "defense");
        assert.equal(v.actions.length, 3);
      }
      match.step(ms, data, null);
    }
  }
  assert.deepEqual([...seenLines].sort(), [0, 1, 2]);
});

test("판정 공식: 수읽기 ×1.5, 커버 보너스, minP/maxP 클램프, 스타일 상성", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 7, home, away, possessions: 8, kind: "goal" });
  // line 0: 홈 공격, 상대 FW 2명 → coverCount 1
  assert.equal(ms.duel.coverCount, 1);
  const plain = match.computeOdds(ms, data, { action: "dribble", defAction: "intercept" });
  const read = match.computeOdds(ms, data, { action: "dribble", defAction: "tackle" });
  assert.equal(read.read, true);
  assert.equal(plain.read, false);
  assert.ok(Math.abs(read.def / plain.def - M.readBonus) < 1e-9, "수읽기 성공 시 수비 ×readBonus");
  assert.ok(read.p < plain.p);
  assert.ok(plain.p >= M.minP && plain.p <= M.maxP);
  // 커버: coverCount 를 0 으로 바꾸면 수비력이 (1+0.1×1) 배 만큼 낮아진다
  const ms2 = clone(ms); ms2.duel.coverCount = 0;
  const noCover = match.computeOdds(ms2, data, { action: "dribble", defAction: "intercept" });
  assert.ok(Math.abs(plain.def / noCover.def - (1 + M.coverBonusPerExtraDefender)) < 1e-9);
  // 클램프: 공격 스탯 0 → minP, 수비 스탯 0 → maxP
  const ms3 = clone(ms);
  ms3.home.players.find((p) => p.id === ms3.ball.carrierId).stats.dribble = 0;
  assert.equal(match.computeOdds(ms3, data, { action: "dribble", defAction: "tackle" }).p, M.minP);
  const ms4 = clone(ms);
  ms4.away.players.find((p) => p.id === ms4.duel.defenderId).stats.defense = 0;
  assert.equal(match.computeOdds(ms4, data, { action: "dribble", defAction: "intercept" }).p, M.maxP);
  // 스타일: 캐리어 speed vs 수비 power → 유리
  const ms5 = clone(ms);
  const carrier = ms5.home.players.find((p) => p.id === ms5.ball.carrierId);
  const defender = ms5.away.players.find((p) => p.id === ms5.duel.defenderId);
  carrier.style = "speed"; defender.style = "power";
  const adv = match.computeOdds(ms5, data, { action: "dribble", defAction: "intercept" });
  carrier.style = "power"; defender.style = "speed";
  const dis = match.computeOdds(ms5, data, { action: "dribble", defAction: "intercept" });
  assert.ok(adv.p > dis.p, "스타일 유리 > 불리");
  // 팀워크 패스 보너스
  const ms6 = clone(ms); ms6.home.teamwork = 0;
  const ms7 = clone(ms); ms7.home.teamwork = 100;
  const p6 = match.computeOdds(ms6, data, { action: "pass", defAction: "tackle" });
  const p7 = match.computeOdds(ms7, data, { action: "pass", defAction: "tackle" });
  assert.ok(Math.abs(p7.att / p6.att - (1 + M.teamworkPassBonusPer100)) < 1e-9);
});

test("액티브 effect 8종 전부 발동 경로 (수동 결정) + unique 는 cutin", () => {
  const skillsByEffect = {};
  for (const sk of data.skills) if (sk.active) skillsByEffect[sk.active.effect] = skillsByEffect[sk.active.effect] || sk;
  const effects = ["boost", "extraLine", "reveal", "steal", "recover", "chainBoost", "shield", "powerShot"];
  for (const e of effects) assert.ok(skillsByEffect[e], `데이터에 effect ${e} 스킬 존재`);

  const baseHome = homeSnapshot(1.3);
  const away = oppSnapshot("op_s1_ironhoof");

  /** 홈 전원이 모든 액티브 스킬을 가진 스냅샷 (포지션 제한은 위치 맞는 선수에게) */
  function loaded() {
    const home = clone(baseHome);
    for (const p of home.players) {
      p.skillIds = data.skills
        .filter((sk) => sk.active && (!sk.positions || sk.positions.includes(p.position)))
        .map((sk) => sk.id);
    }
    return home;
  }

  /** needsDecision 이 role 이고, 우리 듀얼 당사자가 skillId 를 보유한 첫 상태로 진행 (line 조건 옵션) */
  function reach(ms, role, skillId, lineOk = () => true) {
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 400) {
      const v = match.getMatchView(ms, data);
      if (v.needsDecision === role && lineOk(ms.ball.lineIndex)) {
        const pid = role === "attack" ? ms.ball.carrierId : ms.duel.defenderId;
        const participant = ms.home.players.find((p) => p.id === pid);
        if (participant && participant.skillIds.includes(skillId)) return v;
      }
      match.step(ms, data, null);
    }
    return null;
  }

  const fired = new Set();
  for (const effect of effects) {
    const sk = skillsByEffect[effect];
    const role = sk.active.phase === "defense" ? "defense" : "attack";
    let done = false;
    for (let seed = 1; seed <= 40 && !done; seed++) {
      const ms = match.createMatch({ data, seed, home: loaded(), away, possessions: 8, kind: "goal" });
      ms.home.tension = M.tension.max;
      const lineOk = effect === "powerShot" ? (l) => l >= 2 : effect === "steal" ? (l) => l >= 1 && l <= 2 : effect === "extraLine" ? (l) => l <= 1 : () => true;
      const v = reach(ms, role, sk.id, lineOk);
      if (!v) continue;
      ms.home.tension = M.tension.max;
      const view = match.getMatchView(ms, data);
      const entry = view.skills.find((s) => s.skillId === sk.id);
      assert.ok(entry, `${sk.id} 가 view.skills 에 있어야 함 (${role})`);
      assert.equal(entry.enabled, true, `${sk.id} enabled: ${entry.reason}`);
      const action = role === "attack"
        ? (effect === "powerShot" ? "shoot" : view.actions.find((a) => a.enabled && a.action !== "shoot").action)
        : view.actions.find((a) => a.enabled).action;
      const before = ms.events.length;
      const tension0 = ms.home.tension;
      const chain0 = ms.ball.chain;
      const stamina0 = Object.fromEntries(Object.entries(ms.home.live).map(([k, v2]) => [k, v2.stamina]));
      match.step(ms, data, { action, skillId: sk.id });
      const fresh = ms.events.slice(before);
      const skEv = fresh.find((e2) => e2.skillId === sk.id);
      assert.ok(skEv, `${sk.id} 발동 이벤트`);
      assert.equal(skEv.type, sk.kind === "unique" ? "cutin" : "skill");
      assert.equal(skEv.effect, effect);
      if (effect === "chainBoost") {
        // 판정 전에 즉시 적용 → 성공(패스)이면 +amount+1, 실패면 판정 전 chain 은 사라졌으므로 이벤트로만 확인
        assert.match(skEv.text, /연계 스택/);
      }
      if (effect === "recover") {
        assert.match(skEv.text, /체력 \+/);
      }
      // 텐션 차감: 판정 승리로 +10 이 붙을 수 있으므로 "차감 반영" 은 상한 비교로
      assert.ok(ms.home.tension <= tension0 - sk.tension + M.tension.duelWin + M.tension.goal + 1e-9, `${sk.id} 텐션 차감`);
      void chain0; void stamina0;
      fired.add(effect);
      done = true;
    }
    assert.ok(done, `effect ${effect} 발동 경로를 찾지 못함`);
  }
  assert.deepEqual([...fired].sort(), effects.slice().sort());
});

test("reveal 스킬: skillId 만 먼저 제출 → 의도 full 공개, 결정 대기 유지", () => {
  const home = homeSnapshot(1.3);
  for (const p of home.players) if (p.position === "DF" || p.position === "MF") p.skillIds = [...p.skillIds, "sk_eagle_eye"];
  const away = oppSnapshot("op_s3_emberthrone"); // intentReveal none
  let checked = false;
  for (let seed = 1; seed <= 40 && !checked; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 400) {
      const v = match.getMatchView(ms, data);
      if (v.needsDecision === "defense" && v.skills.some((s) => s.skillId === "sk_eagle_eye")) {
        ms.home.tension = 100;
        const v0 = match.getMatchView(ms, data);
        assert.equal(v0.intent.level, "none", "시즌3 상대 의도 비공개");
        assert.deepEqual(v0.intent.candidates, []);
        match.step(ms, data, { skillId: "sk_eagle_eye" });
        const v1 = match.getMatchView(ms, data);
        assert.equal(v1.needsDecision, "defense", "결정 대기 유지");
        assert.equal(v1.intent.level, "full");
        assert.equal(v1.intent.candidates.length, 1);
        assert.equal(v1.intent.candidates[0], ms.duel.awayChoice.action);
        assert.equal(v1.skills.find((s) => s.skillId === "sk_eagle_eye").enabled, false, "한 듀얼 1회");
        assert.throws(() => match.step(clone(ms), data, { action: "tackle", skillId: "sk_eagle_eye" }), /이미 사용/);
        // 읽은 대로 카운터
        const counter = { dribble: "tackle", pass: "intercept", shoot: "block" }[v1.intent.candidates[0]];
        match.step(ms, data, { action: counter });
        const last = ms.events.filter((e) => e.type === "duel" || e.type === "turnover").at(-1);
        assert.ok(last);
        checked = true;
        break;
      }
      match.step(ms, data, null);
    }
  }
  assert.ok(checked, "reveal 검증 상황을 찾지 못함");
});

test("무효 입력은 throw: 비활성 액션, 텐션 부족, 미보유 스킬", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" });
  const v = match.getMatchView(ms, data);
  assert.equal(v.needsDecision, "attack");
  assert.throws(() => match.step(clone(ms), data, { action: "shoot" }), /사용할 수 없는 액션/);
  assert.throws(() => match.step(clone(ms), data, { action: "tackle" }), /사용할 수 없는 액션/);
  assert.throws(() => match.step(clone(ms), data, { action: "dribble", skillId: "sk_nope" }), /sk_nope/);
  // 울릭(line_breaker 40) 텐션 20 → 부족
  const wolf = ms.home.players.find((p) => p.skillIds.includes("sk_line_breaker"));
  const ms2 = clone(ms);
  ms2.ball.carrierId = wolf.id;
  ms2.ball.lineIndex = 0;
  ms2.home.tension = 10;
  assert.throws(() => match.step(clone(ms2), data, { action: "dribble", skillId: "sk_line_breaker" }), /텐션 부족/);
  const other = ms.home.players.find((p) => !p.skillIds.includes("sk_line_breaker") && p.position === "FW");
  const ms3 = clone(ms);
  ms3.ball.carrierId = other.id;
  ms3.home.tension = 100;
  assert.throws(() => match.step(clone(ms3), data, { action: "dribble", skillId: "sk_line_breaker" }), /보유하지 않은/);
});

test("getMatchView: 상태 불변, 난수 미소비, 필드 형태", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s2_silverleaf");
  const ms = match.createMatch({ data, seed: 11, home, away, possessions: 10, kind: "goal" });
  const before = JSON.stringify(ms);
  const v = match.getMatchView(ms, data);
  match.getMatchView(ms, data);
  assert.equal(JSON.stringify(ms), before);
  assert.deepEqual(Object.keys(v.score).sort(), ["away", "home"]);
  assert.equal(v.possession, 1);
  assert.equal(v.possessionsTotal, 10);
  assert.equal(v.attackingSide, "home");
  assert.equal(typeof v.lineLabel, "string");
  assert.ok(v.carrier && v.carrier.id && v.carrier.side === "home" && typeof v.carrier.stamina === "number");
  assert.ok(v.defender && v.defender.side === "away" && typeof v.defender.coverCount === "number");
  assert.equal(v.needsDecision, "attack");
  assert.equal(v.actions.length, 3);
  for (const a of v.actions) assert.ok(["dribble", "pass", "shoot"].includes(a.action) && typeof a.enabled === "boolean" && typeof a.label === "string" && typeof a.hint === "string");
  assert.ok(Array.isArray(v.skills));
  for (const s of v.skills) for (const k of ["skillId", "name", "tension", "enabled", "description", "kind"]) assert.ok(k in s, k);
  assert.ok(v.intent && ["full", "partial", "none"].includes(v.intent.level));
  assert.equal(v.intent.level, "partial", "시즌2 상대 partial");
  assert.equal(v.intent.candidates.length, 2);
  assert.ok(v.intent.candidates.includes(ms.duel.awayChoice.action), "partial 후보에 실제 선택 포함");
  assert.deepEqual(Object.keys(v.tension).sort(), ["away", "home"]);
  assert.equal(v.players.home.length, 7);
  assert.equal(v.players.away.length, 7);
  for (const p of v.players.home) for (const k of ["id", "name", "slot", "stamina", "staminaMax", "isCarrier", "isDefender"]) assert.ok(k in p, k);
  assert.equal(v.players.home.filter((p) => p.isCarrier).length, 1);
  assert.equal(v.players.away.filter((p) => p.isDefender).length, 1);
  assert.ok(v.recentEvents.length <= 6);
  assert.equal(v.finished, false);
  assert.equal(v.result, null);
  // 시즌1 상대: full
  const ms1 = match.createMatch({ data, seed: 11, home, away: oppSnapshot("op_s1_ironhoof"), possessions: 8, kind: "goal" });
  const v1 = match.getMatchView(ms1, data);
  assert.equal(v1.intent.level, "full");
  assert.deepEqual(v1.intent.candidates, [ms1.duel.awayChoice.action]);
});

test("여러 경기 불변식: 체력 0~max, 텐션 0~max, p 클램프, NaN 없음, stats.goals == score (3난이도 × 30)", () => {
  const pairs = [
    [homeSnapshot(1.15), "op_s1_ironhoof", 8],
    [homeSnapshot(1.5), "op_s2_silverleaf", 10],
    [homeSnapshot(1.9), "op_s3_emberthrone", 12],
    [homeSnapshot(1.9), "op_f3_frostveil", 6],
  ];
  const seen = { cutin: 0, skill: 0, goal: 0 };
  for (const [home, oppId, poss] of pairs) {
    const away = oppSnapshot(oppId);
    for (let seed = 1; seed <= 30; seed++) {
      const ms = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: poss, kind: poss === 6 ? "friendly" : "goal" }), data);
      assertMatchInvariants(ms, `${oppId} ${seed}`);
      const r = match.getResult(ms);
      assert.equal(r.stats.home.goals, ms.score.home);
      assert.equal(r.stats.away.goals, ms.score.away);
      assert.equal(r.events.length, ms.events.length);
      assert.ok(r.stats.home.shots >= r.stats.home.goals);
      assert.equal(ms.events.at(-1).type, "end");
      for (const e of ms.events) if (e.type in seen) seen[e.type]++;
    }
  }
  assert.ok(seen.goal > 0, "골이 한 번은 나야 함");
  assert.ok(seen.skill + seen.cutin > 0, "자동 경기에서 액티브 스킬이 발동해야 함");
});

test("ai.js: 전술이 선택에 반영된다 (attack dribble/pass, defense tackle/intercept)", () => {
  const home = homeSnapshot(1.2);
  // 의도 비공개 상대(시즌3)여야 전술 편향이 보인다 — 의도가 완전 공개되면 읽은 대로 카운터하는 것이 맞다
  const away = oppSnapshot("op_s3_emberthrone");
  const count = (tactics, side, pick) => {
    const h = clone(home); Object.assign(h.tactics, tactics);
    const c = {};
    for (let seed = 1; seed <= 25; seed++) {
      const ms = match.simulateAuto(match.createMatch({ data, seed, home: h, away, possessions: 8, kind: "goal" }), data);
      for (const e of ms.events) {
        if ((e.type === "duel" || e.type === "turnover") && e.side === side) {
          const a = pick(e);
          if (a) c[a] = (c[a] || 0) + 1;
        }
      }
    }
    return c;
  };
  const drib = count({ attack: "dribble" }, "home", (e) => e.action);
  const pass = count({ attack: "pass" }, "home", (e) => e.action);
  assert.ok((drib.dribble || 0) / ((drib.dribble || 0) + (drib.pass || 0)) > (pass.dribble || 0) / ((pass.dribble || 0) + (pass.pass || 0)), `dribble 전술 ${JSON.stringify(drib)} vs pass 전술 ${JSON.stringify(pass)}`);
  const tackle = count({ defense: "tackle" }, "away", (e) => e.defAction);
  const inter = count({ defense: "intercept" }, "away", (e) => e.defAction);
  assert.ok((tackle.tackle || 0) > (inter.tackle || 0), `tackle 전술 ${JSON.stringify(tackle)} vs intercept 전술 ${JSON.stringify(inter)}`);
});

test("액션 힌트 배율은 config 에서 계산된다 (중거리 슛 = midrangeShoot/shoot, 수읽기 = readBonus)", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" });
  ms.ball.lineIndex = 2;
  const ratio = Math.round((M.actionCoef.midrangeShoot / M.actionCoef.shoot) * 100) / 100;
  const shoot = match.getAttackActions(ms, "home", data).find((a) => a.action === "shoot");
  assert.equal(shoot.enabled, true);
  assert.ok(shoot.hint.includes(`×${ratio}`), shoot.hint);
  assert.ok(match.getMatchView(ms, data, "home").actions.find((a) => a.action === "shoot").hint.includes(`×${ratio}`));
  for (const a of match.getDefenseActions(ms, "away", data).filter((x) => x.action !== "block")) assert.ok(a.hint.includes(`×${M.readBonus}`), a.hint);
  // 튠 값이 바뀌면 힌트도 따라간다 (리터럴 아님)
  const d2 = clone(data);
  d2.config.match.actionCoef.midrangeShoot = 0.7; d2.config.match.actionCoef.shoot = 1; d2.config.match.readBonus = 2;
  assert.ok(match.getAttackActions(ms, "home", d2).find((a) => a.action === "shoot").hint.includes("×0.7"));
  assert.ok(match.getDefenseActions(ms, "away", d2)[0].hint.includes("×2"));
  // data 없이 부르면(ai.js 경로) 숫자 없는 문구, throw 없음
  assert.equal(typeof match.getAttackActions(ms, "home").find((a) => a.action === "shoot").hint, "string");
});

test("상대 AI 의 reveal 스킬: 의도는 countered(level none) 로 표시되고, 커밋된 액션은 우리 선택의 카운터로 바뀐다", () => {
  const COUNTER = { dribble: "tackle", pass: "intercept", shoot: "block" };
  const home = homeSnapshot(1.3);
  const away = oppSnapshot("op_s1_ironhoof"); // intentReveal full → 평소엔 상대 선택이 그대로 보인다
  for (const p of away.players) if (p.position !== "GK") p.skillIds = [...p.skillIds, "sk_eagle_eye"];
  let checked = 0;
  for (let seed = 1; seed <= 300 && checked < 3; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 400) {
      ms.away.tension = 100;
      if (ms.phase === "decision" && ms.duel && ms.attackingSide === "home" && ms.ball.lineIndex < 3 && ms.duel.effects.away.reveal) {
        const v = match.getMatchView(ms, data);
        assert.equal(v.needsDecision, "attack");
        assert.equal(v.intent.level, "none");
        assert.deepEqual(v.intent.candidates, []);
        assert.equal(v.intent.countered, true);
        assert.equal(ms.duel.revealToHome.countered, true);
        const committed = ms.duel.awayChoice.action;
        const pick = (v.actions.find((a) => a.enabled && COUNTER[a.action] !== committed) || v.actions.find((a) => a.enabled)).action;
        match.step(ms, data, { action: pick });
        const last = ms.events.filter((e) => e.type === "duel" || e.type === "turnover").at(-1);
        assert.equal(last.defAction, COUNTER[pick], "reveal AI 는 실제 선택에 맞춰 카운터");
        checked++;
        break;
      }
      match.step(ms, data, null);
    }
  }
  assert.ok(checked >= 1, "상대 reveal 듀얼을 찾지 못함");
});

/* ------------------------------------------------------------------ */
/* v0.2 — 경기 화면 위치 표현 (ARCHITECTURE §12.1, §12.4)                */
/* ------------------------------------------------------------------ */

const BEAT_TYPES = ["kickoff", "counter", "duel", "turnover", "save", "goal", "penalty"];
const RESOLVE_TYPES = ["duel", "turnover", "save", "goal"];
const OPP_POOL = ["op_s1_ironhoof", "op_s2_silverleaf", "op_s3_emberthrone", "op_f1_riverside", "op_f2_thunderclaw", "op_f3_frostveil"];

/** 미러 팀 (동점 → 연장 → 승부차기 경로를 자주 만든다) */
function mirrorOf(home) {
  const away = clone(home);
  away.side = "away"; away.name = "미러 클럽";
  away.players.forEach((p) => { p.id = "q_" + p.id; });
  return away;
}

/**
 * 사람 측(home) 결정을 스킬 없이 무작위로 넣으며 한 경기를 끝까지 진행한다 (away = AI, 스킬 자유).
 * hooks.before(ms, view) — step 전, hooks.after({ before, decision, fresh, after, ms }) — step 후.
 */
function playManual(ms, pickRng, hooks = {}) {
  let guard = 0;
  while (!match.isFinished(ms)) {
    if (++guard > 3000) throw new Error("playManual guard");
    const before = match.getMatchView(ms, data);
    if (hooks.before) hooks.before(ms, before);
    let decision = null;
    if (before.needsDecision) {
      const en = before.actions.filter((a) => a.enabled);
      decision = { action: pickRng.pick(en).action };
    }
    const n0 = ms.events.length;
    match.step(ms, data, decision);
    const after = match.getMatchView(ms, data);
    if (hooks.after) hooks.after({ before, decision, fresh: ms.events.slice(n0), after, ms });
  }
  return ms;
}

test("v0.2 zoneOf: home = lineIndex+2, away = 4−lineIndex, ZONE_NAMES, 역습 = 뺏은 그 구역", () => {
  const table = { home: [2, 3, 4, 5], away: [4, 3, 2, 1] };
  for (const side of ["home", "away"]) for (let l = 0; l < 4; l++) assert.equal(match.zoneOf(side, l), table[side][l], `${side} ${l}`);
  assert.deepEqual(match.ZONE_NAMES, { 1: "우리 박스", 2: "우리 진영", 3: "중원", 4: "상대 진영", 5: "상대 박스" });
  assert.throws(() => match.zoneOf("north", 0), /attackingSide/);
  // §7.5 표를 구역으로 쓰면: 턴오버가 난 구역 = 역습 시작 구역 (line 0→2, 1→1, 2→0)
  for (const [lost, start] of [[0, 2], [1, 1], [2, 0]]) {
    assert.equal(match.zoneOf("home", lost), match.zoneOf("away", start));
    assert.equal(match.zoneOf("away", lost), match.zoneOf("home", start));
  }
});

test("v0.2 receiverPreview: pass 가능할 때만 존재, 패스 성공 시 실제 수신자 = 직전 view.receiverPreview (양 팀, 220 seed)", () => {
  const homes = [homeSnapshot(1.0), homeSnapshot(1.4), homeSnapshot(1.9)];
  const checked = { home: 0, away: 0 };
  let nullChecked = 0;
  for (let seed = 1; seed <= 220; seed++) {
    const home = homes[seed % homes.length];
    const away = oppSnapshot(OPP_POOL[seed % OPP_POOL.length]);
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    playManual(ms, createRng("recv" + seed), {
      before(state, v) {
        if (state.phase !== "decision") {
          assert.equal(v.receiverPreview, null, "승부차기/종료 중 receiverPreview 없음");
          return;
        }
        const passOn = state.ball.lineIndex < 3 && match.getAttackActions(state, state.attackingSide).find((a) => a.action === "pass").enabled;
        assert.equal(!!v.receiverPreview, passOn, `receiverPreview 존재 = pass 가능 (line ${state.ball.lineIndex})`);
        if (!passOn) nullChecked++;
        if (v.receiverPreview) {
          assert.equal(v.receiverPreview.side, state.attackingSide);
          assert.notEqual(v.receiverPreview.id, state.ball.carrierId);
          assert.ok(state[state.attackingSide].players.some((p) => p.id === v.receiverPreview.id));
        }
      },
      after({ before, fresh }) {
        for (const e of fresh) {
          if (e.type === "duel" && e.action === "pass" && e.success) {
            assert.ok(before.receiverPreview, "패스 성공인데 직전 미리보기가 없음");
            assert.equal(e.receiverId, before.receiverPreview.id, `seed ${seed}: 실제 수신자 = 미리보기`);
            checked[e.side]++;
          }
        }
      },
    });
  }
  assert.ok(checked.home > 100 && checked.away > 100, `검증한 패스 성공 수 ${JSON.stringify(checked)}`);
  assert.ok(nullChecked > 0);
});

test("v0.2 pickReceiver 결정적: 동률이면 team.players 순서의 첫 선수 (미리보기 = 실제)", () => {
  const home = homeSnapshot(1.2);
  const mfs = home.players.filter((p) => p.position === "MF");
  assert.ok(mfs.length >= 2);
  for (const p of mfs) { p.stats.dribble = 300; p.stats.pass = 300; }
  const away = oppSnapshot("op_s1_ironhoof");
  let passed = 0;
  for (let seed = 1; seed <= 80 && passed < 3; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    const v = match.getMatchView(ms, data);
    assert.equal(ms.ball.lineIndex, 0);
    assert.equal(v.receiverPreview.id, mfs[0].id, "동률 MF → 슬롯 순서 첫 선수");
    assert.ok(v.outcomes.pass.success.label.includes(mfs[0].name));
    assert.equal(v.outcomes.pass.success.receiver.id, mfs[0].id);
    const n0 = ms.events.length;
    match.step(ms, data, { action: "pass" });
    const ev = ms.events.slice(n0).find((e) => RESOLVE_TYPES.includes(e.type));
    if (ev.success) {
      assert.equal(ev.receiverId, mfs[0].id);
      passed++;
    }
  }
  assert.ok(passed > 0, "패스 성공 케이스를 찾지 못함");
});

test("v0.2 outcomes: 판정 후 공 구역·공격 팀 = 직전 view.outcomes[선택].success/fail (사람 결정, 스킬 미사용, 150 seed)", () => {
  const homes = [homeSnapshot(1.0), homeSnapshot(1.4), homeSnapshot(1.9)];
  const counts = { attack: { success: 0, fail: 0 }, defense: { success: 0, fail: 0 } };
  const seenActions = new Set();
  let viewChecked = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const home = homes[seed % homes.length];
    const away = oppSnapshot(OPP_POOL[seed % OPP_POOL.length]);
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    playManual(ms, createRng("out" + seed), {
      after({ before, decision, fresh, after }) {
        if (!before.needsDecision) {
          assert.equal(before.outcomes, null, "결정 대기가 아니면 outcomes null");
          return;
        }
        const role = before.needsDecision;
        const enabled = before.actions.filter((a) => a.enabled).map((a) => a.action).sort();
        assert.deepEqual(Object.keys(before.outcomes).sort(), enabled, "outcomes 키 = 선택 가능한 액션");
        for (const [a, o] of Object.entries(before.outcomes)) {
          for (const k of ["success", "fail"]) {
            const x = o[k];
            assert.ok(Number.isInteger(x.zone) && x.zone >= 1 && x.zone <= 5, `${a}.${k}.zone ${x.zone}`);
            assert.ok(x.attackingSide === "home" || x.attackingSide === "away");
            assert.ok(Number.isInteger(x.step) && x.step >= 0 && x.step <= 3);
            assert.equal(match.zoneOf(x.attackingSide, x.step), x.zone);
            assert.ok(typeof x.label === "string" && x.label.length > 0 && !/undefined|NaN|null/.test(x.label), x.label);
          }
          if (role === "attack" && a === "pass") {
            assert.ok(o.success.label.includes(before.receiverPreview.name), "패스 성공 label 에 수신자 이름");
            assert.equal(o.success.receiver.id, before.receiverPreview.id);
          }
          if (role === "defense") {
            assert.match(o.success.label, /^막으면/);
            assert.match(o.fail.label, /^뚫리면/);
          }
        }
        const ev = fresh.find((e) => RESOLVE_TYPES.includes(e.type));
        assert.ok(ev, "판정 이벤트");
        assert.equal(ev.zone, before.zone, "판정 이벤트 zone = 직전 view.zone");
        assert.equal(ev.step, before.attackStep);
        const humanWon = role === "attack" ? ev.success : !ev.success;
        const o = before.outcomes[decision.action];
        const exp = o[humanWon ? "success" : "fail"];
        if (role === "defense" && ev.action === "shoot") {
          assert.ok(o.fail.goalRisk || o.fail.goal, "상대 슛이 가능했으면 fail label 에 실점 위험 표시");
          if (ev.success && !exp.goal) return; // 돌파 기준 미리보기 — 예고된 위험(중거리 슛 실점)은 비교 제외
        }
        assert.equal(ev.toZone, exp.zone, `seed ${seed} ${role} ${decision.action} ${humanWon ? "success" : "fail"}: 이벤트 toZone`);
        assert.equal(ev.toAttackingSide, exp.attackingSide);
        assert.equal(ev.toStep, exp.step);
        if (exp.goal) assert.equal(ev.type, "goal");
        if (!after.finished && after.phase === "decision") {
          assert.equal(after.zone, exp.zone, `seed ${seed}: 판정 후 view.zone = outcomes.zone`);
          assert.equal(after.attackingSide, exp.attackingSide);
          assert.equal(after.attackStep, exp.step);
          viewChecked++;
        }
        counts[role][humanWon ? "success" : "fail"]++;
        seenActions.add(decision.action);
      },
    });
  }
  for (const r of ["attack", "defense"]) for (const k of ["success", "fail"]) assert.ok(counts[r][k] > 50, `${r}.${k} ${counts[r][k]}`);
  for (const a of ["dribble", "pass", "shoot", "tackle", "intercept", "block"]) assert.ok(seenActions.has(a), `액션 ${a} 검증됨`);
  assert.ok(viewChecked > 500, `view 비교 ${viewChecked}`);
});

test("v0.2 outcomes 문구: 공격 역습 구역·세이브·골, 수비 막으면/뚫리면·중거리 실점 위험", () => {
  const home = homeSnapshot(1.2);
  const away = oppSnapshot("op_s3_emberthrone"); // 의도 비공개 → line 2 수비에서 슛 가능성 남음
  const ms = match.createMatch({ data, seed: 9, home, away, possessions: 8, kind: "goal" });
  ms.duel.effects.away = { ...ms.duel.effects.away, steal: false };
  // 공격 line 0: 드리블 성공 = 중원(Z3), 실패 = 상대 역습 우리 진영(Z2)부터
  const v0 = match.getMatchView(ms, data);
  assert.equal(v0.outcomes.dribble.success.zone, 3);
  assert.equal(v0.outcomes.dribble.success.label, "중원 진입");
  assert.equal(v0.outcomes.dribble.fail.zone, 2);
  assert.equal(v0.outcomes.dribble.fail.attackingSide, "away");
  assert.equal(v0.outcomes.dribble.fail.label, "상대 역습 — 우리 진영부터");
  // 공격 line 1: 성공 = 상대 진영(Z4), 실패 = 상대 역습 중원(Z3)부터
  const s1 = clone(ms); s1.ball.lineIndex = 1;
  const v1 = match.getMatchView(s1, data);
  assert.equal(v1.outcomes.dribble.success.label, "상대 진영 진입 — 중거리 슛 가능");
  assert.equal(v1.outcomes.dribble.fail.label, "상대 역습 — 중원부터");
  // 공격 line 2: 성공 = 상대 박스(Z5), 실패 = 상대 빌드업(Z4), 중거리 슛 성공 = 골 → 상대 킥오프(Z4)
  const s2 = clone(ms); s2.ball.lineIndex = 2;
  const v2 = match.getMatchView(s2, data);
  assert.equal(v2.outcomes.dribble.success.zone, 5);
  assert.equal(v2.outcomes.dribble.success.label, "상대 박스 진입 — 슈팅 찬스");
  assert.equal(v2.outcomes.dribble.fail.label, "공 뺏김 — 상대 빌드업부터");
  assert.deepEqual(
    { zone: v2.outcomes.shoot.success.zone, goal: v2.outcomes.shoot.success.goal, side: v2.outcomes.shoot.success.attackingSide },
    { zone: 4, goal: true, side: "away" },
  );
  assert.equal(v2.outcomes.shoot.success.label, "골! → 상대 킥오프");
  assert.equal(v2.outcomes.shoot.fail.label, "막히면 → 상대 빌드업부터");
  // line 3: 슛만, 실패 = 세이브 → 상대 골킥
  const s3g = clone(ms); s3g.ball.lineIndex = 3;
  const v3 = match.getMatchView(s3g, data);
  assert.deepEqual(Object.keys(v3.outcomes), ["shoot"]);
  assert.equal(v3.outcomes.shoot.fail.label, "세이브 → 상대 골킥");
  assert.equal(v3.outcomes.shoot.fail.zone, 4);
  // 상대 steal 스킬이 이미 커밋돼 있으면 역습이 한 구역 더 깊다 (판정에 그대로 적용되는 공개 정보)
  const s4 = clone(ms); s4.ball.lineIndex = 1; s4.duel.effects.away.steal = true;
  const v4 = match.getMatchView(s4, data);
  assert.equal(v4.outcomes.dribble.fail.zone, 2, "line 1 + steal → 상대 line 2 = 우리 진영");
  assert.equal(v4.outcomes.dribble.fail.label, "상대 역습 — 우리 진영부터");
  // 수비: 상대 공격 상태를 찾아 line 별 문구 확인
  const seen = new Set();
  for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
    const m2 = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(m2) && guard++ < 400) {
      const v = match.getMatchView(m2, data);
      if (v.needsDecision === "defense" && !m2.duel.effects.away.extraLine) {
        const L = m2.ball.lineIndex;
        seen.add(L);
        const o = v.outcomes.tackle;
        const expStart = L === 0 ? 2 : L === 1 ? 1 : 0;
        assert.equal(o.success.zone, match.zoneOf("home", expStart));
        assert.equal(o.success.attackingSide, "home");
        assert.equal(o.fail.zone, match.zoneOf("away", L + 1));
        assert.equal(o.fail.attackingSide, "away");
        if (L === 0) {
          assert.equal(o.success.label, "막으면 — 우리 역습, 상대 진영부터");
          assert.equal(o.fail.label, "뚫리면 — 상대 중원 진입");
        }
        if (L === 1) {
          assert.equal(o.success.label, "막으면 — 우리 역습, 중원부터");
          assert.equal(o.fail.label, "뚫리면 — 우리 진영 위험, 중거리 슛 가능");
        }
        if (L === 2) {
          assert.equal(o.success.label, "막으면 — 우리 공격, 빌드업부터");
          assert.equal(o.fail.zone, 1);
          assert.equal(o.fail.label, "뚫리면 — 우리 박스 슈팅 위기 · 중거리 슛이면 실점");
          assert.equal(o.fail.goalRisk, true);
          assert.ok(v.outcomes.block, "line 2 에서는 block 도 선택 가능");
        } else {
          assert.equal(o.fail.goalRisk, undefined);
          assert.equal(v.outcomes.block, undefined, "line 0·1 block 비활성 → outcomes 없음");
        }
      }
      match.step(m2, data, null);
    }
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  // 의도가 full 로 "shoot" 확정이면 fail = 실점, full 로 슛이 아님이 확정이면 실점 위험 문구 없음
  let line2 = null;
  for (let seed = 1; seed <= 60 && !line2; seed++) {
    const m3 = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(m3) && guard++ < 400) {
      if (match.getMatchView(m3, data).needsDecision === "defense" && m3.ball.lineIndex === 2 && !m3.duel.effects.away.reveal) { line2 = m3; break; }
      match.step(m3, data, null);
    }
  }
  assert.ok(line2, "line 2 수비 상황을 찾지 못함");
  const shot = clone(line2);
  shot.duel.awayChoice.action = "shoot";
  shot.duel.revealToHome = { level: "full", candidates: ["shoot"] };
  const vs = match.getMatchView(shot, data);
  assert.deepEqual(vs.intent.candidates, ["shoot"]);
  assert.equal(vs.outcomes.tackle.fail.goal, true);
  assert.equal(vs.outcomes.tackle.fail.zone, match.zoneOf("home", 0));
  assert.equal(vs.outcomes.tackle.fail.attackingSide, "home");
  assert.equal(vs.outcomes.tackle.fail.label, "뚫리면 — 실점 → 우리 킥오프");
  const drib = clone(line2);
  drib.duel.awayChoice.action = "dribble";
  drib.duel.revealToHome = { level: "partial", candidates: ["pass", "dribble"] };
  const vd = match.getMatchView(drib, data);
  assert.equal(vd.outcomes.tackle.fail.label, "뚫리면 — 우리 박스 슈팅 위기", "공개 후보에 슛이 없으면 실점 위험 문구 없음");
  assert.equal(vd.outcomes.tackle.fail.goalRisk, undefined);
});

test("v0.2 이벤트 위치 필드: seq = 배열 인덱스(단조 증가), 비트 이벤트 zone/toZone/step/toStep/attackingSide, 연속성, lastBeat", () => {
  const base = homeSnapshot(1.0);
  let penaltyBeats = 0;
  let beats = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const mirror = seed % 2 === 0;
    const away = mirror ? mirrorOf(base) : oppSnapshot(OPP_POOL[seed % OPP_POOL.length]);
    const ms = match.createMatch({ data, seed, home: base, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 3000) {
      match.step(ms, data, null);
      const v = match.getMatchView(ms, data);
      const last = [...ms.events].reverse().find((e) => BEAT_TYPES.includes(e.type));
      assert.deepEqual(v.lastBeat, last, "lastBeat = 마지막 비트 이벤트 사본");
      assert.notEqual(v.lastBeat, last, "사본 (참조 아님)");
    }
    let prevSeq = -1;
    ms.events.forEach((e, i) => {
      if (e.type === "skill" || e.type === "cutin") return; // skills.js 가 직접 넣는 이벤트
      assert.equal(e.seq, i, `seq = 인덱스 (${e.type})`);
      assert.ok(e.seq > prevSeq);
      prevSeq = e.seq;
    });
    const beatsOf = ms.events.filter((e) => BEAT_TYPES.includes(e.type));
    for (const e of beatsOf) {
      beats++;
      for (const k of ["zone", "toZone"]) assert.ok(Number.isInteger(e[k]) && e[k] >= 1 && e[k] <= 5, `${e.type}.${k}=${e[k]}`);
      for (const k of ["step", "toStep"]) assert.ok(Number.isInteger(e[k]) && e[k] >= 0 && e[k] <= 3, `${e.type}.${k}=${e[k]}`);
      assert.ok(e.attackingSide === "home" || e.attackingSide === "away");
      assert.ok(e.toAttackingSide === "home" || e.toAttackingSide === "away");
      assert.equal(e.zone, match.zoneOf(e.attackingSide, e.step));
      assert.equal(e.toZone, match.zoneOf(e.toAttackingSide, e.toStep));
      assert.ok(e.playerId, `${e.type}.playerId`);
      if (e.type === "kickoff" || e.type === "counter") {
        assert.equal(e.zone, e.toZone);
        assert.equal(e.attackingSide, e.side);
        if (e.type === "kickoff") assert.equal(e.step, 0);
      }
      if (RESOLVE_TYPES.includes(e.type)) {
        assert.equal(e.attackingSide, e.side);
        assert.ok(e.defenderId, `${e.type}.defenderId`);
        if (e.type === "duel") { assert.equal(e.toAttackingSide, e.attackingSide); assert.ok(e.toStep > e.step); }
        else assert.notEqual(e.toAttackingSide, e.attackingSide, "턴오버/세이브/골 → 공격 팀 교대");
      }
      if (e.type === "penalty") {
        penaltyBeats++;
        assert.equal(e.zone, e.side === "home" ? 5 : 1);
        assert.equal(e.step, 3);
      }
    }
    // 연속성: 판정 비트의 toZone = 다음 비트(듀얼/킥오프/역습)의 zone
    for (let i = 0; i + 1 < beatsOf.length; i++) {
      const a = beatsOf[i];
      const b = beatsOf[i + 1];
      if (!RESOLVE_TYPES.includes(a.type) || b.type === "penalty") continue;
      assert.equal(b.zone, a.toZone, `seed ${seed}: ${a.type}.toZone → ${b.type}.zone`);
      assert.equal(b.attackingSide, a.toAttackingSide);
    }
  }
  assert.ok(beats > 1000);
  assert.ok(penaltyBeats > 0, "승부차기 비트가 한 번은 있어야 함");
});

test("v0.2 getMatchView: 매 상태에서 상태 불변(JSON 동일, 난수 미소비) + zone/attackStep/attackDir/remaining 일관, 회귀: 상대 슈팅 단계 = 우리 박스", () => {
  const base = homeSnapshot(1.0);
  let sawAwayShot = 0;
  let sawPen = 0;
  let sawFinished = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const away = seed % 3 === 0 ? mirrorOf(base) : oppSnapshot(OPP_POOL[seed % OPP_POOL.length]);
    const ms = match.createMatch({ data, seed, home: base, away, possessions: 8, kind: "goal" });
    const check = () => {
      const before = JSON.stringify(ms);
      const v = match.getMatchView(ms, data);
      match.getMatchView(ms, data, "home");
      assert.equal(JSON.stringify(ms), before, "getMatchView 는 상태를 바꾸지 않는다");
      assert.ok(v.zone >= 1 && v.zone <= 5);
      assert.ok(v.attackDir === "up" || v.attackDir === "down");
      assert.ok(typeof v.remaining.text === "string" && v.remaining.text.startsWith("남은 수비: "));
      assert.equal(v.remaining.gk, true);
      assert.ok(v.remaining.text.endsWith("GK"));
      if (ms.phase === "decision") {
        const L = ms.ball.lineIndex;
        assert.equal(v.zone, match.zoneOf(ms.attackingSide, L));
        assert.equal(v.attackStep, L);
        assert.equal(v.attackDir, ms.attackingSide === "home" ? "up" : "down");
        const defTeam = ms[ms.attackingSide === "home" ? "away" : "home"];
        const expLines = match.POS_BY_LINE.slice(L).filter((p) => p !== "GK" && defTeam.players.some((x) => x.position === p));
        assert.deepEqual(v.remaining.lines, expLines);
        for (const p of expLines) assert.equal(v.remaining.counts[p], defTeam.players.filter((x) => x.position === p).length);
        if (ms.attackingSide === "away" && L === 3) {
          // v0.1 버그 회귀: 상대가 우리 박스에서 슛 직전 → 공은 Z1(우리 박스), 남은 수비는 우리 GK 하나
          sawAwayShot++;
          assert.equal(v.zone, 1);
          assert.equal(v.attackDir, "down");
          assert.deepEqual(v.remaining.lines, []);
          assert.equal(v.remaining.text, "남은 수비: GK");
          assert.equal(v.receiverPreview, null);
          assert.equal(v.needsDecision, null);
          assert.equal(v.outcomes, null);
        }
      } else if (ms.phase === "penalties") {
        sawPen++;
        assert.equal(v.zone, ms.penalties.turn === "home" ? 5 : 1);
        assert.equal(v.attackStep, 3);
        assert.equal(v.penalties.kickerSide, ms.penalties.turn);
        assert.ok(ms[ms.penalties.turn].players.some((p) => p.id === v.penalties.kickerId));
        const gk = ms[ms.penalties.turn === "home" ? "away" : "home"].players.find((p) => p.position === "GK");
        assert.equal(v.penalties.keeperId, gk.id);
        assert.equal(v.remaining.text, "남은 수비: GK");
      }
      if (ms.finished) {
        sawFinished++;
        assert.equal(v.zone, v.lastBeat.zone, "종료 후 마지막 비트 구역 유지");
      }
    };
    check();
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 3000) {
      match.step(ms, data, null);
      check();
    }
  }
  assert.ok(sawAwayShot > 0, "상대 슈팅 단계 상태를 한 번은 검사해야 함");
  assert.ok(sawPen > 0, "승부차기 상태를 한 번은 검사해야 함");
  assert.equal(sawFinished, 30);
});

test("v0.2 스킬 변형 미리보기: 라인 브레이커(extraLine)·소매치기(steal)를 액션과 함께 쓰면 실제 결과 = outcomesBySkill / receiverPreviewBySkill (1-3-2, 울릭 DF1)", () => {
  // 회귀: 울릭(sk_line_breaker)이 유일한 DF → line 0 carrier. 라인 브레이커 + 패스면 공은 MF 가 아니라 FW(line 2)에게 간다.
  // 소매치기는 MF 전원에게 붙여 수비 성공 시 역습 시작 구역이 한 칸 깊어지는 경로를 검증한다.
  const squad = { GK: "ch_spirit_keeper", DF1: "ch_wolf_winger", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker", FW2: "ch_human_captain" };
  const st = run.createRun({ data, seed: "lb", formation: "1-3-2", squad });
  const home = run.buildTeamSnapshot(st, data);
  const ulrik = home.players.find((p) => p.slot === "DF1");
  assert.ok(ulrik.skillIds.includes("sk_line_breaker"), "울릭 = 라인 브레이커 보유");
  for (const p of home.players) if (p.position === "MF" && !p.skillIds.includes("sk_pickpocket")) p.skillIds.push("sk_pickpocket");
  const seen = { lbPass: 0, lbPassOk: 0, lbDribble: 0, steal: 0, stealWon: 0 };
  for (let seed = 1; seed <= 90; seed++) {
    const away = oppSnapshot(OPP_POOL[seed % OPP_POOL.length]);
    const ms = match.createMatch({ data, seed: `var${seed}`, home, away, possessions: 8, kind: "goal" });
    const pick = createRng("var" + seed);
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 3000) {
      if (ms.phase === "decision") ms.home.tension = M.tension.max; // 스킬을 자주 쓰게
      const v = match.getMatchView(ms, data);
      let decision = null;
      let variant = null;
      if (v.needsDecision) {
        const en = v.actions.filter((a) => a.enabled);
        const sk = v.skills.find((s) => s.enabled && (s.effect === "extraLine" || s.effect === "steal"));
        decision = { action: pick.pick(en).action };
        if (v.needsDecision === "attack" && sk && sk.effect === "extraLine" && en.some((a) => a.action === "pass") && pick.next() < 0.7) {
          decision = { action: pick.next() < 0.75 ? "pass" : en.find((a) => a.action !== "pass").action, skillId: sk.skillId };
        } else if (v.needsDecision === "defense" && sk && sk.effect === "steal") {
          decision = { action: decision.action, skillId: sk.skillId };
        }
        if (decision.skillId) {
          // 위치를 바꾸는 사람 측 스킬마다 변형이 있다 (기본 outcomes 와 같은 키)
          assert.ok(v.outcomesBySkill && v.outcomesBySkill[decision.skillId], `${decision.skillId} outcomesBySkill`);
          variant = v.outcomesBySkill[decision.skillId];
          assert.deepEqual(Object.keys(variant).sort(), Object.keys(v.outcomes).sort());
          if (v.needsDecision === "attack") {
            assert.ok(Object.prototype.hasOwnProperty.call(v.receiverPreviewBySkill, decision.skillId));
            const rp = v.receiverPreviewBySkill[decision.skillId];
            if (variant.pass) {
              assert.equal(rp.id, variant.pass.success.receiver.id, "변형 수신자 = 변형 outcomes 수신자");
              assert.equal(rp.zone, variant.pass.success.zone);
              assert.ok(variant.pass.success.label.includes(rp.name));
            }
          }
        } else {
          assert.ok(!v.outcomesBySkill || Object.keys(v.outcomesBySkill).every((id) => v.skills.some((s) => s.skillId === id && s.enabled)));
        }
      } else {
        assert.equal(v.outcomesBySkill, null, "결정 대기가 아니면 변형 없음");
        assert.equal(v.receiverPreviewBySkill, null);
      }
      const n0 = ms.events.length;
      match.step(ms, data, decision);
      if (!variant) continue;
      const fresh = ms.events.slice(n0);
      assert.ok(fresh.some((e) => e.skillId === decision.skillId), "스킬 발동");
      const ev = fresh.find((e) => RESOLVE_TYPES.includes(e.type));
      const role = v.needsDecision;
      const humanWon = role === "attack" ? ev.success : !ev.success;
      const o = variant[decision.action];
      if (role === "defense" && ev.action === "shoot" && ev.success && !o.fail.goal) continue; // 돌파 기준 미리보기 (예고된 중거리 실점 위험)
      const exp = o[humanWon ? "success" : "fail"];
      assert.equal(ev.toZone, exp.zone, `seed ${seed} ${role} ${decision.action}+${decision.skillId} ${humanWon ? "성공" : "실패"}: 판정 후 구역 = 변형 미리보기`);
      assert.equal(ev.toAttackingSide, exp.attackingSide);
      assert.equal(ev.toStep, exp.step);
      if (role === "attack" && decision.action === "pass") {
        seen.lbPass++;
        if (ev.success) {
          assert.equal(ev.receiverId, v.receiverPreviewBySkill[decision.skillId].id, `seed ${seed}: 실제 수신자 = 변형 미리보기`);
          if (ev.step === 0) assert.notEqual(ev.receiverId, v.receiverPreview.id, "line 0 라인 브레이커: 기본 미리보기(MF)와 다른 선수(FW)");
          seen.lbPassOk++;
        }
      } else if (role === "attack") seen.lbDribble++;
      else { seen.steal++; if (humanWon) seen.stealWon++; }
    }
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 5, `${k} ${n} (${JSON.stringify(seen)})`);
});
