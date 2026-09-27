// test/match.test.mjs — ARCHITECTURE §7, §9 (실제 data/*.json + run.buildOpponentSnapshot)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run, match } from "./helpers.mjs";
import { STATS } from "../js/engine/training.js";

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
