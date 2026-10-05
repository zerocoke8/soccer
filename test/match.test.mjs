// test/match.test.mjs — ARCHITECTURE §7, §9 (실제 data/*.json + run.buildOpponentSnapshot)
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone, run, match } from "./helpers.mjs";
import { STATS } from "../js/engine/training.js";
import { createRng } from "../js/engine/rng.js";

const data = loadData();
const cfg = data.config;
const M = cfg.match;
/** 킥오프를 빌드업(line 0)에서 시작하는 데이터 사본 — DF carrier 에서 시작해야 하는 테스트용 (GDD #55 이전 규칙) */
const DATA_KICK0 = { ...data, config: { ...cfg, match: { ...M, kickoffLine: 0 } } };

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
  assert.equal(ms.ball.lineIndex, M.kickoffLine, "킥오프 = 중원(kickoffLine)");
  assert.equal(ms.home.players.find((p) => p.id === ms.ball.carrierId).position, "MF", "중원 킥오프는 MF 가 시작");
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
    // 포제션 시작 = 킥오프 · 역습 · GK 배급 비트 (2026-09-29: 세이브 뒤 포제션은 배급으로 시작 — 롱패스 실패는 turnover + distribution)
    const starts = ms.events.filter((e) => e.type === "kickoff" || e.type === "counter" || e.distribution === true).length;
    // 마지막 공격 보장(1골 차로 지는 팀이 마지막 포제션을 갖지 않았으면 +1)
    const total = 6 + (ms.lastAttack ? 1 : 0);
    assert.equal(starts, total, `포제션 시작 이벤트 ${total}회 (seed ${seed})`);
    assert.equal(ms.possessionsTotal, total);
    assert.equal(ms.stage, "regular");
    const r = match.getResult(ms);
    assert.equal(r.possessionsPlayed, total);
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
      // 총 포제션 = 정규 8 + 연장 extraTimePossessions + 마지막 공격 보장(단계당 최대 1, lastAttack 이벤트 수)
      const lastAttacks = ms.events.filter((e) => e.type === "lastAttack");
      assert.ok(lastAttacks.length <= 2 && new Set(lastAttacks.map((e) => e.stage)).size === lastAttacks.length, "마지막 공격은 단계당 1회");
      assert.equal(ms.possessionsTotal, 8 + M.extraTimePossessions + lastAttacks.length);
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
          assert.match(byName.pass.hint, /그레타/);
        }
        if (ms.ball.lineIndex >= 3) {
          // ④: 슛 + 박스 연결(컷백 패스 — 후보 = FW + 슈팅 최고 MF, 포제션당 1회)
          assert.equal(byName.dribble.enabled, false);
          assert.equal(byName.pass.enabled, !ms.ball.boxLinkUsed, "④ 컷백 패스 (외로운 FW 도 MF 에게)");
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

test("수비 액션 규칙 (v0.3): line 0~2 모두 태클·인터셉트·버티기, line 3 은 GK 세이브 자동", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const seenLines = new Set();
  for (let seed = 1; seed <= 40 && seenLines.size < 4; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 500) {
      if (ms.phase === "decision" && ms.attackingSide === "away") {
        const line = ms.ball.lineIndex;
        seenLines.add(line);
        const acts = Object.fromEntries(match.getDefenseActions(ms, "home").map((a) => [a.action, a.enabled]));
        assert.deepEqual(Object.keys(acts), ["tackle", "intercept", "hold"]);
        for (const k of Object.keys(acts)) assert.equal(acts[k], line < 3, `${k} line ${line}`);
        const v = match.getMatchView(ms, data);
        assert.equal(v.needsDecision, line < 3 ? "defense" : null);
        assert.equal(v.actions.length, 3);
      }
      match.step(ms, data, null);
    }
  }
  assert.deepEqual([...seenLines].sort(), [0, 1, 2, 3]);
});

test("판정 공식 (v0.3): 짝 ×readBonus · 빗나감 ×missMult · 버티기 ×1.0, 커버 보너스, minP/maxP 클램프, 스타일 상성", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 7, home, away, possessions: 8, kind: "goal" });
  // line 0: 홈 공격, 상대 FW 2명 → coverCount 1
  assert.equal(ms.duel.coverCount, 1);
  const read = match.computeOdds(ms, data, { action: "dribble", defAction: "tackle" });
  const miss = match.computeOdds(ms, data, { action: "pass", defAction: "tackle" });
  const plain = match.computeOdds(ms, data, { action: "dribble", defAction: "intercept" });
  assert.equal(read.read, true);
  assert.equal(read.pair, "read");
  assert.equal(miss.pair, "miss");
  assert.ok(Math.abs(read.def / miss.def - M.readBonus / M.missMult) < 1e-9, "같은 태클: 짝 / 빗나감 = readBonus / missMult");
  const holdD = match.computeOdds(ms, data, { action: "dribble", defAction: "hold" });
  const holdP = match.computeOdds(ms, data, { action: "pass", defAction: "hold" });
  assert.equal(holdD.pair, "hold");
  assert.ok(Math.abs(holdD.def / holdP.def - 1) < 1e-9, "버티기는 짝 없음 (공격 무관 ×1.0)");
  assert.ok(read.p < miss.p);
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
  const d4 = ms4.away.players.find((p) => p.id === ms4.duel.defenderId);
  d4.stats.defense = 0; d4.stats.pass = 0;
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
  // 팀워크 패스 보너스 (v0.1 규칙 유지: 패스 공격 × (1 + 0.1 × 팀워크/100))
  const ms6 = clone(ms); ms6.home.teamwork = 0;
  const ms7 = clone(ms); ms7.home.teamwork = 100;
  const p6 = match.computeOdds(ms6, data, { action: "pass", defAction: "tackle" });
  const p7 = match.computeOdds(ms7, data, { action: "pass", defAction: "tackle" });
  assert.ok(Math.abs(p7.att / p6.att - (1 + M.teamworkPassBonusPer100)) < 1e-9);
});

test("액티브 effect 8종 전부 발동 경로 (수동 결정 — L54 lineBreak 포함)", () => {
  const skillsByEffect = {};
  for (const sk of data.skills) if (sk.active) skillsByEffect[sk.active.effect] = skillsByEffect[sk.active.effect] || sk;
  const effects = ["boost", "extraLine", "lineBreak", "powerShot", "readBoost", "negateRead", "steal", "rally"];
  for (const e of effects) assert.ok(skillsByEffect[e], `데이터에 effect ${e} 스킬 존재`);
  for (const sk of data.skills) if (sk.kind === "unique") assert.ok(!sk.active && sk.ultimate, `${sk.id}: 필살기는 active 없이 ultimate`);

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
      const lineOk = effect === "powerShot" ? (l) => l >= 2
        : effect === "steal" || effect === "readBoost" || effect === "negateRead" ? (l) => l <= 2
        : effect === "extraLine" ? (l) => l <= 1 : effect === "lineBreak" ? (l) => l === 2 : () => true;
      const v = reach(ms, role, sk.id, lineOk);
      if (!v) continue;
      ms.home.tension = M.tension.max;
      const view = match.getMatchView(ms, data);
      const entry = view.skills.find((s) => s.skillId === sk.id);
      assert.ok(entry, `${sk.id} 가 view.skills 에 있어야 함 (${role})`);
      if (!entry.enabled && /상대가 먼저 간파/.test(entry.reason || "")) continue;
      assert.equal(entry.enabled, true, `${sk.id} enabled: ${entry.reason}`);
      const acts = sk.active.params && sk.active.params.actions;
      const action = role === "attack"
        ? (effect === "powerShot" ? "shoot" : (view.actions.find((a) => a.enabled && a.action !== "shoot" && (!acts || acts.includes(a.action))) || {}).action)
        : view.actions.find((a) => a.enabled).action;
      if (!action) continue;
      const before = ms.events.length;
      const tension0 = ms.home.tension;
      match.step(ms, data, { action, skillId: sk.id });
      const fresh = ms.events.slice(before);
      const skEv = fresh.find((e2) => e2.skillId === sk.id);
      assert.ok(skEv, `${sk.id} 발동 이벤트`);
      assert.equal(skEv.type, "skill");
      assert.equal(skEv.effect, effect);
      assert.equal(skEv.seq, ms.events.indexOf(skEv), "skill 이벤트도 seq = 인덱스");
      if (effect === "rally") assert.match(skEv.text, /체력 \+/);
      // 텐션 차감: 판정 승리·역습 상한·소매치기로 가산이 붙을 수 있으므로 "차감 반영" 은 상한 비교로
      assert.ok(ms.home.tension <= tension0 - entry.cost + M.tension.duelWin + M.tension.goal + M.tension.steal + 20 + 1e-9, `${sk.id} 텐션 차감`);
      fired.add(effect);
      done = true;
    }
    assert.ok(done, `effect ${effect} 발동 경로를 찾지 못함`);
  }
  assert.deepEqual([...fired].sort(), effects.slice().sort());
});

test("간파 스킬(사람): skillId 만 먼저 제출 → 효과(짝 ×readMult)만 붙고 결정 대기 유지, 한 듀얼 1회", () => {
  const home = homeSnapshot(1.3);
  for (const p of home.players) if (p.position === "DF" || p.position === "MF") p.skillIds = [...p.skillIds, "sk_eagle_eye"];
  const away = oppSnapshot("op_s1_ironhoof"); // 간파 스킬 없는 상대 → 우리가 먼저 쓸 수 있다
  const eagle = data.skills.find((s) => s.id === "sk_eagle_eye");
  let checked = false;
  for (let seed = 1; seed <= 40 && !checked; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 400) {
      const v = match.getMatchView(ms, data);
      if (v.needsDecision === "defense" && v.skills.some((s) => s.skillId === "sk_eagle_eye")) {
        ms.home.tension = 100;
        const v0 = match.getMatchView(ms, data);
        assert.equal(v0.gaanpa.usable, true, v0.gaanpa.reason);
        assert.equal(v0.gaanpa.source, "skill");
        assert.equal(v0.gaanpa.skillId, "sk_eagle_eye");
        assert.equal(v0.opponentReading, false);
        const oppAction = v0.expected.attack.action;
        assert.equal(oppAction, ms.duel.awayChoice.action, "A안: 상대 예상 행동 = 커밋한 액션");
        match.step(ms, data, { skillId: "sk_eagle_eye" });
        const v1 = match.getMatchView(ms, data);
        assert.equal(v1.needsDecision, "defense", "결정 대기 유지");
        assert.equal(ms.duel.gaanpaSide, "home");
        assert.equal(ms.duel.effects.home.readMult, eagle.active.params.readMult);
        assert.equal(v1.skills.find((s) => s.skillId === "sk_eagle_eye").enabled, false, "한 듀얼 1회");
        assert.equal(v1.gaanpa.usable, false);
        assert.throws(() => match.step(clone(ms), data, { action: "tackle", skillId: "sk_eagle_eye" }), /이미/);
        // 짝을 맞히면 ×readMult (×readBonus 대신)
        const counter = match.COUNTER[oppAction];
        const odds = match.computeOdds(ms, data, { action: oppAction, defAction: counter });
        if (oppAction !== "shoot") assert.equal(odds.pairMult, eagle.active.params.readMult);
        match.step(ms, data, { action: counter });
        const last = ms.events.filter((e) => e.type === "duel" || e.type === "turnover" || e.type === "goal").at(-1);
        assert.equal(last.defAction, counter, "사람의 간파는 효과만 — 선택은 그대로");
        checked = true;
        break;
      }
      match.step(ms, data, null);
    }
  }
  assert.ok(checked, "간파 검증 상황을 찾지 못함");
});

test("무효 입력은 throw: 비활성 액션, 텐션 부족, 미보유 스킬", () => {
  const home = homeSnapshot();
  // §19.12: 라인 브레이커는 이제 코치 수업 액티브 — 울리카에게 배운 스킬로 넣는다
  home.players.find((p) => p.charId === "ch_wolf_winger").skillIds.push("sk_line_breaker");
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" });
  const v = match.getMatchView(ms, data);
  assert.equal(v.needsDecision, "attack");
  assert.throws(() => match.step(clone(ms), data, { action: "shoot" }), /사용할 수 없는 액션/);
  assert.throws(() => match.step(clone(ms), data, { action: "tackle" }), /사용할 수 없는 액션/);
  assert.throws(() => match.step(clone(ms), data, { action: "dribble", skillId: "sk_nope" }), /sk_nope/);
  // 울리카(line_breaker 35) 텐션 10 → 부족 (L54: 라인 브레이커는 ③ 에서만 — ③ 에 둔다)
  const wolf = ms.home.players.find((p) => p.skillIds.includes("sk_line_breaker"));
  const ms2 = clone(ms);
  ms2.ball.carrierId = wolf.id;
  ms2.ball.lineIndex = 2;
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
  assert.equal(v.version, 3);
  assert.equal(ms.version, 3);
  assert.equal(v.actions.length, 4);
  assert.deepEqual(v.actions.map((a) => a.action), ["dribble", "pass", "cross", "shoot"]);
  for (const a of v.actions) {
    assert.ok(typeof a.enabled === "boolean" && typeof a.label === "string" && typeof a.hint === "string");
    assert.ok(a.enabled ? Number.isInteger(a.expectedPct) && a.expectedPct >= 0 && a.expectedPct <= 100 : a.expectedPct === null);
  }
  assert.equal(v.actions.filter((a) => a.recommended).length, 1, "추천은 하나");
  assert.ok(Array.isArray(v.skills));
  for (const s of v.skills) for (const k of ["skillId", "name", "tension", "cost", "enabled", "description", "kind", "effect", "gaanpa"]) assert.ok(k in s, k);
  // v0.3: intent 삭제 → expected (A안 예상 행동)
  assert.equal(v.intent, undefined);
  assert.equal(v.revealToHome, undefined);
  assert.equal(v.expected.attack.playerId, ms.ball.carrierId);
  assert.equal(v.expected.defense.playerId, ms.duel.defenderId);
  assert.equal(v.expected.defense.action, ms.duel.awayChoice.action, "상대(AI) 예상 행동 = 커밋한 액션");
  assert.deepEqual(Object.keys(v.expected.defense.values).sort(), ["hold", "intercept", "tackle"]);
  assert.ok(["dribble", "pass"].includes(v.expected.attack.action));
  assert.ok(v.receivers.pass && v.receivers.pass.candidates.includes(v.receivers.pass.defaultId));
  assert.equal(v.receiverPreview.id, v.receivers.pass.defaultId);
  assert.ok(v.gaanpa && typeof v.gaanpa.usable === "boolean" && "source" in v.gaanpa && "tickets" in v.gaanpa);
  assert.equal(typeof v.opponentReading, "boolean");
  assert.ok(v.ultimate.home && v.ultimate.away);
  assert.ok(Array.isArray(v.ultimateOptions));
  assert.deepEqual(Object.keys(v.tension).sort(), ["away", "home"]);
  assert.equal(v.players.home.length, 7);
  assert.equal(v.players.away.length, 7);
  for (const p of v.players.home) for (const k of ["id", "name", "slot", "stamina", "staminaMax", "isCarrier", "isDefender", "trait", "gauge"]) assert.ok(k in p, k);
  assert.equal(v.players.home.filter((p) => p.isCarrier).length, 1);
  assert.equal(v.players.away.filter((p) => p.isDefender).length, 1);
  assert.ok(v.recentEvents.length <= 6);
  assert.equal(v.finished, false);
  assert.equal(v.result, null);
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

test("ai.js: 전술 ×tacticBonus 가 성향 1위를 뒤집는다 (attack dribble/pass, defense tackle/intercept/hold)", () => {
  // 공격: 드리블·패스 스탯이 같은 선수 → 동률이면 드리블(tieAttack), pass 전술이면 패스
  const home = homeSnapshot(1.2);
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" });
  const carrier = ms.home.players.find((p) => p.id === ms.ball.carrierId);
  carrier.stats.dribble = 400; carrier.stats.pass = 400; carrier.trait = null;
  const pick = (tactics) => { const s = clone(ms); Object.assign(s.home.tactics, tactics); return s; };
  assert.equal(match.autoAction(pick({ attack: "balanced" }), data, "home"), "dribble", "동률 → tieAttack 순서");
  assert.equal(match.autoAction(pick({ attack: "pass" }), data, "home"), "pass");
  const s2 = pick({ attack: "dribble" }); s2.home.players.find((p) => p.id === carrier.id).stats.pass = 440;
  assert.equal(match.autoAction(s2, data, "home"), "dribble", "패스 +10% 도 드리블 전술 ×1.15 가 뒤집는다");
  // 수비: 태클 = 인터셉트 = 버티기가 되게 → 동률 hold, 전술로 각각
  const md = clone(ms);
  md.attackingSide = "away";
  const def = md.home.players.find((p) => p.position === "FW");
  def.stats.defense = 400; def.stats.physical = 400; def.stats.pass = 400; def.trait = null;
  md.duel.defenderId = def.id;
  md.ball.carrierId = md.away.players.find((p) => p.position === "DF").id;
  const dpick = (tactics) => { const s = clone(md); Object.assign(s.home.tactics, tactics); return match.autoAction(s, data, "home"); };
  assert.equal(dpick({ defense: "balanced" }), "hold", "동률 → tieDefense 순서");
  assert.equal(dpick({ defense: "tackle" }), "tackle");
  assert.equal(dpick({ defense: "intercept" }), "intercept");
  assert.equal(dpick({ defense: "hold" }), "hold");
  // 실제 경기에서도 전술이 수비 선택 분포를 바꾼다
  const count = (tactics) => {
    const h = clone(home); Object.assign(h.tactics, tactics);
    for (const p of h.players) if (p.position !== "GK") { p.stats.physical = p.stats.defense; p.stats.pass = p.stats.defense; p.trait = null; }
    const c = {};
    for (let seed = 1; seed <= 10; seed++) {
      const m2 = match.simulateAuto(match.createMatch({ data, seed, home: h, away, possessions: 8, kind: "goal" }), data);
      for (const e of m2.events) if ((e.type === "duel" || e.type === "turnover") && e.side === "away") c[e.defAction] = (c[e.defAction] || 0) + 1;
    }
    return c;
  };
  const tk = count({ defense: "tackle" });
  const ic = count({ defense: "intercept" });
  assert.ok((tk.tackle || 0) > (ic.tackle || 0) && (ic.intercept || 0) > (tk.intercept || 0), `tackle 전술 ${JSON.stringify(tk)} vs intercept 전술 ${JSON.stringify(ic)}`);
});

test("액션 힌트 배율은 config 에서 계산된다 (중거리 슛 = midrangeShoot/shoot, 짝 = readBonus)", () => {
  const home = homeSnapshot();
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 3, home, away, possessions: 8, kind: "goal" });
  ms.ball.lineIndex = 2;
  const ratio = Math.round((M.actionCoef.midrangeShoot / M.actionCoef.shoot) * 100) / 100;
  const shoot = match.getAttackActions(ms, "home", data).find((a) => a.action === "shoot");
  assert.equal(shoot.enabled, true);
  assert.ok(shoot.hint.includes(`×${ratio}`), shoot.hint);
  assert.ok(match.getMatchView(ms, data, "home").actions.find((a) => a.action === "shoot").hint.includes(`×${ratio}`));
  for (const a of match.getDefenseActions(ms, "away", data).filter((x) => x.action !== "hold")) {
    assert.ok(a.hint.includes(`×${M.readBonus}`), a.hint);
    assert.ok(a.hint.includes(`×${M.missMult}`), a.hint);
  }
  assert.ok(match.getDefenseActions(ms, "away", data).find((x) => x.action === "hold").hint.includes(`×${M.holdVsMidrange}`));
  // 튠 값이 바뀌면 힌트도 따라간다 (리터럴 아님)
  const d2 = clone(data);
  d2.config.match.actionCoef.midrangeShoot = 0.7; d2.config.match.actionCoef.shoot = 1; d2.config.match.readBonus = 2;
  assert.ok(match.getAttackActions(ms, "home", d2).find((a) => a.action === "shoot").hint.includes("×0.7"));
  assert.ok(match.getDefenseActions(ms, "away", d2)[0].hint.includes("×2"));
  // data 없이 부르면(ai.js 경로) 숫자 없는 문구, throw 없음
  assert.equal(typeof match.getAttackActions(ms, "home").find((a) => a.action === "shoot").hint, "string");
});

test("상대 AI 의 간파: opponentReading 표시, 우리 간파 비활성, 판정 때 우리 실제 선택에 대한 최선 수비로 교체 (난수 추가 없음)", () => {
  const home = homeSnapshot(1.3);
  const away = oppSnapshot("op_s1_ironhoof");
  for (const p of away.players) if (p.position === "DF" || p.position === "MF") p.skillIds = [...p.skillIds, "sk_eagle_eye"];
  for (const p of home.players) if (p.position === "FW" || p.position === "MF") p.skillIds = [...p.skillIds, "sk_see_through"];
  let checked = 0;
  for (let seed = 1; seed <= 300 && checked < 3; seed++) {
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(ms) && guard++ < 400) {
      ms.away.tension = 100;
      if (ms.phase === "decision" && ms.duel && ms.attackingSide === "home" && ms.ball.lineIndex < 3 && ms.duel.gaanpaSide === "away") {
        ms.home.tension = 100;
        const v = match.getMatchView(ms, data);
        assert.equal(v.needsDecision, "attack");
        assert.equal(v.opponentReading, true);
        assert.equal(v.gaanpa.usable, false);
        assert.equal(v.gaanpa.reason, "상대가 먼저 간파");
        for (const s of v.skills.filter((x) => x.gaanpa)) assert.equal(s.enabled, false, "상대가 먼저 쓴 듀얼: 우리 간파 스킬 비활성");
        const pick = v.actions.filter((a) => a.enabled).at(-1).action;
        const expectDef = match.bestDefenseResponse(ms, data, pick);
        // 기대 % 는 상대의 대응 기준
        const odds = match.computeOdds(ms, data, { action: pick, defAction: expectDef });
        const a = v.actions.find((x) => x.action === pick);
        if (!(ms.ball.lineIndex === 2 && pick !== "shoot")) assert.equal(a.expectedPct, Math.round(odds.p * 100));
        const rng0 = ms.rngState;
        const probe = clone(ms);
        match.step(ms, data, { action: pick });
        const last = ms.events.filter((e) => ["duel", "turnover", "goal"].includes(e.type)).at(-1);
        assert.equal(last.defAction, expectDef, "간파한 AI 는 우리 실제 선택에 대한 최선 수비");
        assert.equal(last.readBy, "away");
        // 결정성: 같은 상태 + 같은 결정 → 같은 결과
        match.step(probe, data, { action: pick });
        assert.equal(JSON.stringify(probe.events.at(-1)), JSON.stringify(ms.events.at(-1)));
        void rng0;
        checked++;
        break;
      }
      match.step(ms, data, null);
    }
  }
  assert.ok(checked >= 1, "상대 간파 듀얼을 찾지 못함");
});

/* ------------------------------------------------------------------ */
/* v0.2 — 경기 화면 위치 표현 (ARCHITECTURE §12.1, §12.4)                */
/* ------------------------------------------------------------------ */

const BEAT_TYPES = ["kickoff", "counter", "duel", "turnover", "save", "goal", "penalty", "distribution"];
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
    if (before.needsDecision === "distribution") {
      decision = { action: pickRng.pick(before.distribution.order) }; // GK 배급: 짧게 / 길게
    } else if (before.needsDecision) {
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
        // ④ 에서도 박스 연결(컷백 패스)이 가능하면 받는 선수 미리보기가 있다 (도착 step 3)
        const passOn = match.getAttackActions(state, state.attackingSide).find((a) => a.action === "pass").enabled;
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
  const data = DATA_KICK0; // DF 빌드업에서 MF 에게 패스
  const home = homeSnapshot(1.2);
  const mfs = home.players.filter((p) => p.position === "MF");
  assert.ok(mfs.length >= 2);
  // 받는 선수 기본값 = 도착 구역 주 액션 판정값 최고 (특성 보정 포함) → 스탯·특성을 같게 해서 동률을 만든다
  for (const p of mfs) { p.stats.dribble = 300; p.stats.pass = 300; p.trait = null; }
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
  let boxChecked = 0;
  const distChecked = { short: 0, long: 0 };
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
        if (role === "distribution") {
          // GK 배급 미리보기 = 실제: 성공 · 실패 구역 · 공격 팀 · 단계
          assert.equal(before.outcomes, null);
          const o = before.distribution.options[decision.action];
          const dev = fresh.find((e) => e.distribution === true);
          assert.ok(dev, "배급 비트");
          assert.equal(dev.action, decision.action);
          const exp = dev.success ? o.success : o.fail;
          assert.ok(exp, `${decision.action} ${dev.success}`);
          assert.equal(dev.toZone, exp.zone, `seed ${seed} 배급 ${decision.action}: toZone`);
          assert.equal(dev.toAttackingSide, exp.attackingSide);
          assert.equal(dev.toStep, exp.step);
          if (dev.success) assert.equal(dev.receiverId, exp.starterId, "배급 받는 선수 = 미리보기");
          if (!after.finished && after.phase === "decision") {
            assert.equal(after.zone, exp.zone);
            assert.equal(after.attackingSide, exp.attackingSide);
            assert.equal(after.attackStep, exp.step);
          }
          distChecked[decision.action]++;
          return;
        }
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
          // A안: 상대 예상 행동(커밋)이 정확하므로 중거리 슛이면 fail = 실점으로 미리보기
          assert.equal(o.fail.goal, true, "상대 중거리 슛 → fail = 실점");
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
        // ④ 박스 연결(컷백·센터링)도 같은 미리보기 = 실제 검사를 거친다
        if (role === "attack" && before.lineIndex === 3 && decision.action !== "shoot") {
          boxChecked++;
          assert.equal(ev.boxLink, true);
          if (humanWon) assert.equal(ev.receiverId, o.success.receiver.id, "박스 연결 받는 선수 = 미리보기");
        }
      },
    });
  }
  for (const r of ["attack", "defense"]) for (const k of ["success", "fail"]) assert.ok(counts[r][k] > 50, `${r}.${k} ${counts[r][k]}`);
  for (const a of ["dribble", "pass", "shoot", "tackle", "intercept", "hold"]) assert.ok(seenActions.has(a), `액션 ${a} 검증됨`);
  assert.ok(viewChecked > 500, `view 비교 ${viewChecked}`);
  assert.ok(boxChecked > 20, `박스 연결 결정 검증 ${boxChecked}`);
  assert.ok(distChecked.short > 10 && distChecked.long > 10, `GK 배급 결정 검증 ${JSON.stringify(distChecked)}`);
});

test("v0.3 outcomes 문구: 공격 = 상대 수비 예상 행동에 따른 역습 구역·세이브·골, 수비 = 손익(빠른 역습·빌드업·제쳐짐·+10%)·실점", () => {
  const home = homeSnapshot(1.2);
  const away = oppSnapshot("op_s1_ironhoof");
  const ms = match.createMatch({ data, seed: 9, home, away, possessions: 8, kind: "goal" });
  ms.duel.effects.away = { ...ms.duel.effects.away, steal: null };
  const withDef = (s, line, defAction) => { const c = clone(s); c.ball.lineIndex = line; c.duel.awayChoice = { ...c.duel.awayChoice, action: defAction }; return match.getMatchView(c, data); };
  // 공격 line 0: 드리블 성공 = 중원(Z3), 실패 = 상대 역습 우리 진영(Z2)부터 (기본 2 = 상한 → 인터셉트도 같음)
  for (const d of ["tackle", "intercept"]) {
    const v0 = withDef(ms, 0, d);
    assert.equal(v0.outcomes.dribble.success.zone, 3);
    assert.equal(v0.outcomes.dribble.success.label, "중원 진입");
    assert.equal(v0.outcomes.dribble.success.short, "성공 중원");
    assert.equal(v0.outcomes.dribble.fail.zone, 2);
    assert.equal(v0.outcomes.dribble.fail.attackingSide, "away");
    assert.equal(v0.outcomes.dribble.fail.label, "상대 역습 — 우리 진영부터");
    assert.equal(v0.outcomes.dribble.fail.short, "실패 상대 역습(우리 진영)");
  }
  // 버티기로 뺏기면 역습 이점 없이 뺏긴 자리에서 한 구역 물러남: line 0(기본 2) → 상대 line 1 = 중원 (GDD #54)
  assert.equal(withDef(ms, 0, "hold").outcomes.dribble.fail.label, "공 뺏김 — 상대 중원부터 (버티기)");
  assert.equal(withDef(ms, 0, "hold").outcomes.dribble.fail.short, "실패 상대 중원부터");
  assert.equal(withDef(ms, 0, "hold").outcomes.dribble.fail.zone, 3);
  // 공격 line 1: 성공 = 상대 진영(Z4). 실패 = 태클 → 중원(Z3), 인터셉트 → 빠른 역습 우리 진영(Z2), 버티기 → 빌드업(Z4)
  assert.equal(withDef(ms, 1, "tackle").outcomes.dribble.success.label, "상대 진영 진입 — 중거리 슛 가능");
  assert.equal(withDef(ms, 1, "tackle").outcomes.dribble.fail.label, "상대 역습 — 중원부터");
  assert.equal(withDef(ms, 1, "intercept").outcomes.dribble.fail.label, "상대 역습 — 우리 진영부터");
  assert.equal(withDef(ms, 1, "hold").outcomes.dribble.fail.zone, 4);
  // 공격 line 2: 성공 = 상대 박스(Z5), 태클에 뺏기면 상대 빌드업(Z4), 인터셉트면 중원(Z3). 중거리 슛 성공 = 골 → 상대 킥오프
  const v2 = withDef(ms, 2, "tackle");
  assert.equal(v2.outcomes.dribble.success.zone, 5);
  assert.equal(v2.outcomes.dribble.success.label, "상대 박스 진입 — 슈팅 찬스");
  assert.equal(v2.outcomes.dribble.success.short, "성공 박스 진입");
  assert.equal(v2.outcomes.dribble.fail.label, "공 뺏김 — 상대 빌드업부터");
  assert.equal(withDef(ms, 2, "intercept").outcomes.dribble.fail.label, "상대 역습 — 중원부터");
  assert.deepEqual(
    { zone: v2.outcomes.shoot.success.zone, goal: v2.outcomes.shoot.success.goal, side: v2.outcomes.shoot.success.attackingSide },
    { zone: match.zoneOf("away", M.kickoffLine), goal: true, side: "away" }, // 실점 → 상대 킥오프 = 중원
  );
  assert.equal(v2.outcomes.shoot.success.label, "골! → 상대 킥오프");
  assert.equal(v2.outcomes.shoot.fail.label, "막히면 → 상대 빌드업부터");
  // line 3: 슛 + 박스 연결(컷백 패스). 실패 = 세이브 / GK 가 끊어냄 → 상대 GK 배급 (2026-09-29 — 빠른 배급 GK 도 같음, 롱패스 +25%)
  const s3g = clone(ms); s3g.ball.lineIndex = 3;
  const gk = s3g.away.players.find((p) => p.position === "GK");
  s3g.duel.defenderId = gk.id; s3g.duel.awayChoice = { action: "save", byAI: true };
  gk.trait = null;
  const v3 = match.getMatchView(s3g, data);
  assert.deepEqual(Object.keys(v3.outcomes), ["pass", "shoot"], "MF carrier: 컷백 가능 (크로서 아님 → 센터링 없음)");
  assert.equal(v3.outcomes.shoot.fail.label, "세이브 → 상대 GK 배급");
  assert.equal(v3.outcomes.shoot.fail.short, "실패 상대 GK 배급");
  assert.equal(v3.outcomes.shoot.fail.zone, 4, "상대 빌드업 구역 (공은 GK 품 — gkZone)");
  assert.deepEqual({ d: v3.outcomes.shoot.fail.distribution, z: v3.outcomes.shoot.fail.gkZone }, { d: true, z: 5 });
  assert.equal(v3.outcomes.pass.fail.label, "GK가 끊어냄 → 상대 GK 배급");
  assert.equal(v3.outcomes.pass.fail.short, "실패 상대 GK 배급");
  assert.equal(v3.outcomes.pass.fail.zone, 4);
  assert.equal(v3.outcomes.pass.success.zone, 5, "성공 = 박스 그대로");
  assert.equal(v3.outcomes.pass.success.label, `${v3.receiverPreview.name} 원터치 슛 찬스`);
  gk.trait = "distributor";
  const v3d = match.getMatchView(s3g, data);
  assert.equal(v3d.outcomes.shoot.fail.label, "세이브 → 상대 GK 배급", "빠른 배급도 세이브 뒤 배급 (롱패스 보너스)");
  assert.equal(v3d.outcomes.shoot.fail.zone, 4);
  assert.equal(v3d.outcomes.pass.fail.label, "GK가 끊어냄 → 상대 GK 배급");
  // 박스 연결을 이미 했으면 슛만
  s3g.ball.boxLinkUsed = true;
  assert.deepEqual(Object.keys(match.getMatchView(s3g, data).outcomes), ["shoot"]);
  // 상대 steal 스킬이 이미 커밋돼 있으면 역습이 한 구역 더 깊다 (판정에 그대로 적용되는 공개 정보)
  const s4 = clone(ms); s4.ball.lineIndex = 1; s4.duel.awayChoice = { ...s4.duel.awayChoice, action: "tackle" };
  s4.duel.effects.away.steal = { plus: 1, tension: 10, cappedNextBonus: 0.15 };
  const v4 = match.getMatchView(s4, data);
  assert.equal(v4.outcomes.dribble.fail.zone, 2, "line 1 + steal → 상대 line 2 = 우리 진영");
  assert.equal(v4.outcomes.dribble.fail.label, "상대 역습 — 우리 진영부터");
  // 수비: 상대 공격 상태를 찾아 line 별 손익 문구 확인
  const seen = new Set();
  let lastSeen = 0;
  const bb = Math.round(M.beatenBonus * 100);
  const ib = Math.round(M.interceptFailBonus * 100);
  for (let seed = 1; seed <= 60 && seen.size < 3; seed++) {
    const m2 = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    let guard = 0;
    while (!match.isFinished(m2) && guard++ < 400) {
      const v = match.getMatchView(m2, data);
      if (v.needsDecision === "defense" && !m2.duel.effects.away.extraLine && !v.opponentReading) {
        const L = m2.ball.lineIndex;
        seen.add(L);
        const oppAct = m2.duel.awayChoice.action;
        assert.equal(v.expected.attack.action, oppAct);
        const base = L === 0 ? 2 : L === 1 ? 1 : 0;
        const o = v.outcomes;
        // 마지막 포제션 (2026-09-30): 막으면 경기가 끝나면 역습 문구 대신 "막으면 — 경기 종료" · "승부차기" (endForecast)
        const stopFc = match.endForecast(m2, data, "home");
        const last = m2.possession === m2.possessionsTotal;
        assert.equal(stopFc == null, !last, "마지막 포제션에서만 예측이 있다");
        if (stopFc === "end" || stopFc === "penalties") {
          const endText = stopFc === "end" ? "경기 종료" : "승부차기";
          for (const d of ["tackle", "intercept", "hold"]) {
            assert.deepEqual({ l: o[d].success.label, s: o[d].success.short, e: o[d].success.matchEnd }, { l: `막으면 — ${endText}`, s: `막으면 ${endText}`, e: stopFc });
            if (oppAct === "shoot") assert.match(o[d].fail.label, /^뚫리면 — 실점 → (경기 종료|연장전|승부차기|우리 마지막 공격)$/);
          }
          lastSeen++;
          match.step(m2, data, null);
          continue;
        }
        assert.equal(o.tackle.success.zone, match.zoneOf("home", base));
        const holdStart = Math.max(0, base - M.holdStartBack);
        assert.equal(o.hold.success.zone, match.zoneOf("home", holdStart), "버티기 → 뺏은 자리에서 한 구역 물러남");
        assert.equal(o.hold.success.label, holdStart === 0 ? "막으면 — 우리 공격, 빌드업부터 (역습 이점 없음)" : "막으면 — 우리 공격, 중원부터 (역습 이점 없음, 한 구역 물러남)");
        assert.equal(o.intercept.success.zone, match.zoneOf("home", Math.min(2, base + 1)));
        if (L === 0) {
          assert.equal(o.tackle.success.label, "막으면 — 우리 역습, 상대 진영부터");
          assert.equal(o.intercept.success.label, `막으면 — 우리 역습, 상대 진영부터 · 텐션 +${M.counterCapTension}`, "인터셉트 +1 이 상한에 걸리면 텐션");
        }
        if (L === 1) {
          assert.equal(o.tackle.success.label, "막으면 — 우리 역습, 중원부터");
          assert.equal(o.intercept.success.label, "막으면 — 빠른 역습, 상대 진영부터");
          assert.equal(o.intercept.success.short, "막으면 빠른역습(상대 진영)");
        }
        if (L === 2) {
          assert.equal(o.tackle.success.label, "막으면 — 우리 공격, 빌드업부터");
          assert.equal(o.intercept.success.label, "막으면 — 빠른 역습, 중원부터");
        }
        for (const d of ["tackle", "intercept", "hold"]) assert.match(o[d].success.label, /^막으면/);
        if (oppAct === "shoot") {
          for (const d of ["tackle", "intercept", "hold"]) {
            assert.equal(o[d].fail.goal, true);
            assert.equal(o[d].fail.label, last ? o[d].fail.label : "뚫리면 — 실점 → 우리 킥오프");
            assert.match(o[d].fail.label, /^뚫리면 — 실점 → /);
          }
        } else {
          const breach = L === 2 ? "뚫리면 — 우리 박스 슈팅 위기" : L === 1 ? "뚫리면 — 우리 진영 위험, 중거리 슛 가능" : "뚫리면 — 상대 중원 진입";
          assert.equal(o.tackle.fail.label, `${breach} · 제쳐짐 +${bb}%`);
          assert.equal(o.tackle.fail.short, `뚫리면 제쳐짐 +${bb}%`);
          assert.equal(o.intercept.fail.label, `${breach} · 상대 +${ib}%`);
          assert.equal(o.hold.fail.label, breach, "버티기는 뚫려도 추가 손해 없음");
          assert.equal(o.hold.fail.short, "뚫리면 손해 없음");
          for (const d of ["tackle", "intercept", "hold"]) assert.equal(o[d].fail.zone, match.zoneOf("away", L + 1));
        }
      }
      match.step(m2, data, null);
    }
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  assert.ok(lastSeen > 0, "마지막 포제션 수비 결정 (경기 종료 문구)");
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
        if (e.type === "kickoff") assert.equal(e.step, M.kickoffLine, "킥오프 = 중원 (GDD #55)");
      }
      if (RESOLVE_TYPES.includes(e.type)) {
        assert.equal(e.attackingSide, e.side);
        assert.ok(e.defenderId, `${e.type}.defenderId`);
        if (e.type === "duel") {
          assert.equal(e.toAttackingSide, e.attackingSide);
          // ④ 박스 연결 성공은 공이 박스 그대로 (step 3 → 3)
          if (e.boxLink) assert.ok(e.step === 3 && e.toStep === 3, "박스 연결 = 박스 그대로");
          else assert.ok(e.toStep > e.step);
        }
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
          // 상대의 박스 연결(컷백) 받는 선수 미리보기는 있을 수 있다 (step 3)
          assert.equal(!!v.receiverPreview, !!(v.receivers && v.receivers.pass));
          if (v.receiverPreview) assert.equal(v.receiverPreview.step, 3);
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

test("v0.2 스킬 변형 미리보기: 스루 패스(extraLine)·라인 브레이커(lineBreak)·소매치기(steal)를 액션과 함께 쓰면 실제 결과 = outcomesBySkill / receiverPreviewBySkill (1-3-2, 울리카 DF1 · L54)", () => {
  const data = DATA_KICK0; // 울리카(DF)가 킥오프 carrier 가 되도록 빌드업 킥오프
  // 회귀: 울리카(스루 패스 — L54 부터 DF 도 배운다)가 유일한 DF → line 0 carrier. 스루 패스 + 패스면 공은 MF 가 아니라 FW(line 2)에게 간다.
  // MF 전원 = 스루 패스(② → ④ 박스 원터치) + 소매치기(수비 성공 시 역습 시작 구역이 한 칸 깊어진다), FW 전원 = 라인 브레이커(③ 돌파 → 박스 슛 ×1.5).
  const squad = { GK: "ch_spirit_keeper", DF1: "ch_wolf_winger", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker", FW2: "ch_human_captain" };
  const st = run.createRun({ data, seed: "lb", formation: "1-3-2", squad });
  st.players.find((p) => p.charId === "ch_wolf_winger").learnedSkillIds.push("sk_through_pass"); // §19.12: 배운 스킬로 넣는다
  const home = run.buildTeamSnapshot(st, data);
  const ulrika = home.players.find((p) => p.slot === "DF1");
  assert.ok(ulrika.skillIds.includes("sk_through_pass"), "울리카 = 스루 패스 보유");
  for (const p of home.players) {
    if (p.position === "MF") p.skillIds = [...new Set([...p.skillIds, "sk_pickpocket", "sk_through_pass"])];
    if (p.position === "FW") p.skillIds = [...new Set([...p.skillIds, "sk_line_breaker"])];
  }
  const lbMult = data.skills.find((s) => s.id === "sk_line_breaker").active.params.shootMult;
  const seen = { tpPass: 0, tpPassOk: 0, tpBox: 0, tpOther: 0, lb: 0, lbOk: 0, lbShoot: 0, steal: 0, stealWon: 0 };
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
      let effect = null;
      if (v.needsDecision && v.needsDecision !== "distribution") { // GK 배급은 자동 (전술)
        const en = v.actions.filter((a) => a.enabled);
        const sk = v.skills.find((s) => s.enabled && ["extraLine", "lineBreak", "steal"].includes(s.effect));
        decision = { action: pick.pick(en).action };
        if (v.needsDecision === "attack" && sk && sk.effect === "extraLine" && en.some((a) => a.action === "pass") && pick.next() < 0.7) {
          // 스루 패스는 패스 전용 — 다른 액션과 함께면 보통 한 구역 (스킬만 쓰인다)
          decision = { action: pick.next() < 0.75 ? "pass" : en.find((a) => a.action !== "pass").action, skillId: sk.skillId };
        } else if (v.needsDecision === "attack" && sk && sk.effect === "lineBreak" && pick.next() < 0.7) {
          decision = { action: decision.action, skillId: sk.skillId };
        } else if (v.needsDecision === "defense" && sk && sk.effect === "steal") {
          decision = { action: decision.action, skillId: sk.skillId };
        }
        if (decision.skillId) {
          effect = sk.effect;
          // 변형을 만드는 사람 측 스킬마다 변형이 있다 (기본 outcomes 와 같은 키)
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
            if (effect === "lineBreak") {
              // 라인 브레이커: 받는 선수 · 도착은 그대로, 중거리 슛 결과도 그대로, 돌파 성공 짧은 줄 끝에 "×1.5"
              assert.deepEqual(v.receiversBySkill[decision.skillId], v.receivers, "라인 브레이커는 받는 선수 후보를 바꾸지 않는다");
              if (variant.shoot) assert.deepEqual(variant.shoot, v.outcomes.shoot, "중거리 슛 결과 그대로");
              for (const a of ["dribble", "pass", "cross"]) if (variant[a]) assert.ok(variant[a].success.short.endsWith(`×${lbMult}`), `${a} 짧은 줄: ${variant[a].success.short}`);
            } else if (variant.dribble) {
              assert.deepEqual(variant.dribble, v.outcomes.dribble, "스루 패스 + 드리블 = 보통 한 구역 (미리보기 그대로)");
            }
          }
        } else {
          assert.ok(!v.outcomesBySkill || Object.keys(v.outcomesBySkill).every((id) => v.skills.some((s) => s.skillId === id && s.enabled) || v.ultimateOptions.some((u) => u.skillId === id && u.usable)));
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
      if (effect === "extraLine" && decision.action === "pass") {
        seen.tpPass++;
        if (ev.success) {
          assert.equal(ev.receiverId, v.receiverPreviewBySkill[decision.skillId].id, `seed ${seed}: 실제 수신자 = 변형 미리보기`);
          assert.equal(ev.toStep, ev.step + 2, "스루 패스 = 두 구역 앞 (① → ③ · ② → ④)");
          if (ev.step === 0) assert.notEqual(ev.receiverId, v.receiverPreview.id, "line 0 스루 패스: 기본 미리보기(MF)와 다른 선수(FW)");
          if (ev.toStep === 3) {
            seen.tpBox++;
            assert.equal(ms.ball.oneTouch, true, "② → ④ = 박스 원터치");
          }
          seen.tpPassOk++;
        }
      } else if (effect === "extraLine") {
        seen.tpOther++;
        if (ev.success && ev.type === "duel") assert.equal(ev.toStep, ev.step + 1, "스루 패스 + 다른 액션 = 보통 한 구역");
      } else if (effect === "lineBreak") {
        seen.lb++;
        if (decision.action === "shoot") seen.lbShoot++;
        else if (ev.success) {
          seen.lbOk++;
          assert.equal(ev.toStep, 3, "라인 브레이커 ③ 돌파 = 박스");
          assert.deepEqual({ ot: ms.ball.oneTouch, m: ms.ball.lineBreakMult }, { ot: true, m: lbMult }, `seed ${seed}: 박스 원터치 + 슛 ×${lbMult}`);
          assert.ok(ev.text.includes(`라인 브레이커 — 박스 슛 ×${lbMult}!`), ev.text);
        }
      } else {
        seen.steal++;
        if (humanWon) seen.stealWon++;
      }
    }
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 5, `${k} ${n} (${JSON.stringify(seen)})`);
});
