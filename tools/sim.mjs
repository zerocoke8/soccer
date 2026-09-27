#!/usr/bin/env node
// tools/sim.mjs — 헤드리스 밸런스 시뮬 (ARCHITECTURE §9)
//   node tools/sim.mjs --runs 300 --seed 1 [--policy smart|train] [--json]
//                      [--manualOracle] [--set path=value ...] [--oppScale s1=1.0,s2=1.03,s3=1.02]
// 기본 편성·기본 전술로 자동 완주. 정책: 훈련은 추천 칸, 체력 부족 추천이면 휴식(smart), 이벤트 0번,
// 유물 첫 번째, 루트 순환(런마다 시작점 회전), 경기는 match.simulateAuto.
// 출력: 시즌별 목표 경기 승률, 평균 최종 스탯, 등급 분포, 런당 부상, 우정 훈련, 평균 골, 기타. 종료 코드 0.
//
// --manualOracle : 경기마다 같은 setup·seed 로 사본을 만들어 (a) 완전 오라클(상대의 커밋된 선택을 항상 알고
//                  기대값 최대 액션), (b) 화면 공개 정보만 쓰는 오라클(visible), (c) 의도 정보 없는 자동(blind) 을
//                  추가로 돌린다. 런 자체는 자동 결과로 이어가므로 육성 경로는 동일 → 결정 방식의 순수 효과만 측정.
// --set          : data.config 값을 메모리에서 덮어쓴다 (예: --set match.actionCoef.save=0.85). 파일은 바꾸지 않는다.
// --oppScale     : 상대 스탯을 시즌별로 배율 적용(10 단위 반올림, 메모리만). s2=1.03 은 시즌2 goal+friendly 전부.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";
import { computeOdds } from "../js/engine/match.js";
import { chooseSkill } from "../js/engine/ai.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const GRADES = ["S", "A", "B", "C", "D", "E", "F", "G"];
const STAMINA_BUCKETS = [">=60", "40~59", "20~39", "<20"];
const ORACLE_MODES = ["perfect", "visible", "blind"];

export function parseArgs(argv) {
  const out = { runs: 300, seed: 1, policy: "smart", json: false, manualOracle: false, sets: [], oppScale: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, parseInt(argv[++i], 10) || 300);
    else if (a === "--seed") out.seed = argv[++i] ?? 1;
    else if (a === "--policy") out.policy = argv[++i] || "smart";
    else if (a === "--json") out.json = true;
    else if (a === "--manualOracle") out.manualOracle = true;
    else if (a === "--set") out.sets.push(argv[++i] || "");
    else if (a === "--oppScale") out.oppScale = argv[++i] || "";
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/sim.mjs --runs N --seed S [--policy smart|train] [--json] [--manualOracle] [--set a.b=v ...] [--oppScale s2=1.03,s3=1.02]");
      process.exit(0);
    }
  }
  return out;
}

export function loadData() {
  const data = {};
  for (const n of ["config", "characters", "supports", "events", "skills", "relics", "opponents", "routes"]) {
    data[n] = JSON.parse(fs.readFileSync(path.join(ROOT, "data", `${n}.json`), "utf8"));
  }
  return data;
}

/** --set a.b.c=value → data.config 경로에 대입 (JSON 파싱 가능하면 파싱). */
export function applyConfigOverrides(config, sets) {
  for (const s of sets) {
    const eq = s.indexOf("=");
    if (eq < 0) throw new Error(`--set 형식은 path=value 입니다: ${s}`);
    const keys = s.slice(0, eq).split(".").filter(Boolean);
    const raw = s.slice(eq + 1);
    let val;
    try { val = JSON.parse(raw); } catch { val = raw; }
    let obj = config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null || typeof obj[keys[i]] !== "object") obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = val;
  }
  return config;
}

/**
 * 상대 스탯 배율. spec "s1=1.0,s2=1.03,s3=1.02" (시즌 전체) 또는 "op_s2_silverleaf=1.05" (특정 팀).
 * 10 단위 반올림. 파일은 건드리지 않는다.
 */
export function scaleOpponents(opponents, spec) {
  if (!spec) return opponents;
  const rules = spec.split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [k, v] = x.split("=");
    const f = Number(v);
    if (!k || !Number.isFinite(f)) throw new Error(`--oppScale 형식은 s2=1.03 또는 op_id=1.03 입니다: ${x}`);
    return { key: k, factor: f };
  });
  for (const op of opponents) {
    let f = 1;
    for (const r of rules) {
      if (r.key === op.id || r.key === `s${op.season}`) f *= r.factor;
    }
    if (f === 1) continue;
    for (const p of op.players) for (const k of Object.keys(p.stats)) p.stats[k] = Math.round((p.stats[k] * f) / 10) * 10;
  }
  return opponents;
}

/* ------------------------------------------------------------------ */
/* 수동 개입 오라클                                                        */
/* ------------------------------------------------------------------ */

function fwShooterAfterPass(team, carrierId) {
  const c = team.players.filter((p) => p.position === "FW" && p.id !== carrierId);
  c.sort((a, b) => (b.stats.shoot || 0) - (a.stats.shoot || 0));
  return c[0] || null;
}

/** line 2 에서 전진 후 GK 상대 슛 성공률 추정 (상태 변경 없음) */
function gkShotOdds(ms, data, action) {
  const gk = ms.away.players.find((p) => p.position === "GK");
  if (!gk) return 0.5;
  let shooterId = ms.ball.carrierId;
  if (action === "pass") {
    const r = fwShooterAfterPass(ms.home, shooterId);
    if (r) shooterId = r.id;
  }
  const pseudo = {
    ...ms,
    ball: { ...ms.ball, lineIndex: 3, carrierId: shooterId, chain: (ms.ball.chain || 0) + (action === "pass" ? 1 : 0) },
    duel: { ...ms.duel, defenderId: gk.id, coverCount: 0 },
  };
  return computeOdds(pseudo, data, { action: "shoot", defAction: null, useEffects: false }).p;
}

/** 공격 액션 a 의 기대 골 가치 (수비 선택 d 가 알려졌을 때) */
function attackValue(ms, data, a, d) {
  const p = computeOdds(ms, data, { action: a, defAction: d }).p;
  if (a === "shoot") return p; // 중거리 슛 = 즉시 골
  if (ms.ball.lineIndex < 2) return p; // 한 라인 전진
  return p * gkShotOdds(ms, data, a); // DF 라인 돌파 후 GK 슛
}

/**
 * mode "perfect": 상대의 커밋된 선택을 그대로 안다. "visible": 화면에 공개된 intent 만 쓴다.
 * 정보가 없으면 null (AI 자동 결정). 스킬은 AI 와 같은 정책(chooseSkill)으로 골라 조건을 같게 한다.
 */
export function oracleDecision(ms, data, mode) {
  if (ms.finished || ms.phase !== "decision" || !ms.duel) return null;
  const view = match.getMatchView(ms, data, "home");
  const need = view.needsDecision;
  if (!need) return null;
  const enabled = view.actions.filter((a) => a.enabled).map((a) => a.action);
  if (!enabled.length) return null;
  let known = [];
  if (mode === "perfect") {
    const opp = ms.duel.awayChoice;
    if (opp && opp.action && opp.action !== "save") known = [opp.action];
  } else if (view.intent && view.intent.candidates && view.intent.candidates.length) {
    known = view.intent.candidates.slice();
  }
  if (!known.length) return null;
  let action = null;
  let best = -Infinity;
  if (need === "defense") {
    for (const d of enabled) {
      let s = 0;
      for (const a of known) s += 1 - computeOdds(ms, data, { action: a, defAction: d }).p;
      s /= known.length;
      if (s > best) { best = s; action = d; }
    }
  } else {
    for (const a of enabled) {
      let s = 0;
      for (const d of known) s += attackValue(ms, data, a, d);
      s /= known.length;
      if (s > best) { best = s; action = a; }
    }
  }
  if (!action) return null;
  const pid = need === "attack" ? ms.ball.carrierId : ms.duel.defenderId;
  const participant = ms.home.players.find((p) => p.id === pid);
  const skillId = participant ? chooseSkill(ms, data, "home", participant, need, action) : null;
  return { action, skillId };
}

function driveMatch(ms, data, mode) {
  let guard = 0;
  while (!ms.finished) {
    const d = mode === "perfect" || mode === "visible" ? oracleDecision(ms, data, mode) : null;
    match.step(ms, data, d);
    if (++guard > 20000) throw new Error("sim: 경기가 끝나지 않습니다");
  }
  return match.getResult(ms);
}

/* ------------------------------------------------------------------ */
/* 런 1회                                                                */
/* ------------------------------------------------------------------ */

function staminaBucket(st) {
  return st >= 60 ? 0 : st >= 40 ? 1 : st >= 20 ? 2 : 3;
}

function newMetrics() {
  return {
    injuries: 0, friendship: 0, trains: 0, rests: 0, meetings: 0, events: 0, relics: 0,
    goalsHome: 0, goalsAway: 0, matches: 0, friendlies: 0, penalties: 0, extraTime: 0, skillUses: 0,
    injuredMatchSlots: 0, hints: 0, learned: 0,
    trainedPlayers: 0, trainFails: 0, expectedFails: 0, staminaBuckets: [0, 0, 0, 0], trainInjuries: 0, eventInjuries: 0,
    spEarned: 0,
  };
}

function emptyOracleRec() {
  return { wins: [0, 0, 0], goalsHome: 0, goalsAway: 0, matches: 0, penalties: 0 };
}

function simulateOne(data, seed, routeStart, policy, oracle) {
  const state = run.createRun({ data, seed });
  const m = newMetrics();
  const oracleRec = oracle ? Object.fromEntries(ORACLE_MODES.map((k) => [k, emptyOracleRec()])) : null;
  let routeIdx = routeStart;
  let guard = 0;
  const injuredBefore = () => new Set(state.players.filter((p) => p.injuredTurns > 0).map((p) => p.id));
  while (state.phase !== "finished") {
    if (++guard > 1000) throw new Error(`런이 끝나지 않습니다 (seed ${seed}, phase ${state.phase})`);
    const phase = state.phase;
    if (phase === "turn") {
      const view = run.getTurnView(state, data);
      const inj0 = injuredBefore();
      const buy = policy === "smart" ? view.shop.find((s) => s.canAfford && s.eligiblePlayerIds.length) : null;
      if (buy) {
        // 살 수 있는 스킬이 있으면 전술 미팅에서 구매 (턴 소모)
        run.applyAction(state, data, { type: "meeting", buy: { skillId: buy.skillId, playerId: buy.eligiblePlayerIds[0] } });
        m.meetings++;
      } else if (policy === "smart" && view.recommendedAction === "rest") {
        run.applyAction(state, data, { type: "rest" });
        m.rests++;
      } else {
        const slot = view.recommendedSlot;
        const sv = view.slots.find((s) => s.type === slot);
        const before = {};
        if (sv) {
          if (sv.preview.friendship) m.friendship++;
          for (const pp of sv.preview.perPlayer) {
            const pl = view.players.find((p) => p.id === pp.playerId);
            if (!pl) continue;
            m.trainedPlayers++;
            m.expectedFails += pp.failRate;
            m.staminaBuckets[staminaBucket(pl.stamina)]++;
            before[pp.playerId] = pl.stats[slot];
          }
        }
        run.applyAction(state, data, { type: "train", slot });
        m.trains++;
        for (const p of state.players) if (before[p.id] != null && p.stats[slot] < before[p.id]) m.trainFails++;
      }
      for (const p of state.players) if (p.injuredTurns > 0 && !inj0.has(p.id)) { m.injuries++; m.trainInjuries++; }
    } else if (phase === "event") {
      const inj0 = injuredBefore();
      run.resolveEvent(state, data, 0);
      m.events++;
      for (const p of state.players) if (p.injuredTurns > 0 && !inj0.has(p.id)) { m.injuries++; m.eventInjuries++; }
    } else if (phase === "match") {
      const setup = run.getMatchSetup(state, data);
      m.injuredMatchSlots += setup.home.players.filter((p) => p.isYouth).length;
      const mk = (home, away) => match.createMatch({ data, seed: setup.seed, home, away, possessions: setup.possessions, kind: setup.kind });
      const ms = mk(setup.home, setup.away);
      match.simulateAuto(ms, data);
      const r = match.getResult(ms);
      m.matches++;
      if (setup.kind !== "goal") m.friendlies++;
      m.goalsHome += r.homeGoals;
      m.goalsAway += r.awayGoals;
      if (r.penalties) m.penalties++;
      if (ms.stage !== "regular") m.extraTime++;
      m.skillUses += ms.events.filter((e) => e.type === "skill" || e.type === "cutin").length;
      if (oracleRec) {
        for (const mode of ORACLE_MODES) {
          let home = setup.home;
          let away = setup.away;
          if (mode === "blind") {
            away = { ...setup.away, intentReveal: "none" };
            home = { ...setup.home, modifiers: { ...(setup.home.modifiers || {}), intentReveal: 0 } };
          }
          const mo = mk(home, away);
          const ro = driveMatch(mo, data, mode);
          const rec = oracleRec[mode];
          rec.matches++;
          rec.goalsHome += ro.homeGoals;
          rec.goalsAway += ro.awayGoals;
          if (ro.penalties) rec.penalties++;
          if (setup.kind === "goal" && ro.winner === "home") rec.wins[state.season - 1]++;
        }
      }
      const sp0 = state.skillPoints;
      run.finishMatch(state, data, r);
      m.spEarned += state.skillPoints - sp0;
    } else if (phase === "relic") {
      run.chooseRelic(state, data, state.pendingRelicChoices[0]);
      m.relics++;
    } else if (phase === "route") {
      run.chooseRoute(state, data, state.pendingRoutes[routeIdx % state.pendingRoutes.length]);
      routeIdx++;
    } else {
      throw new Error(`알 수 없는 phase ${phase}`);
    }
  }
  const { rating } = run.finalizeRun(state, data);
  m.hints = Object.values(state.hints).reduce((a, b) => a + b, 0);
  m.learned = state.players.reduce((a, p) => a + p.learnedSkillIds.length, 0);
  return { state, rating, m, oracleRec };
}

/* ------------------------------------------------------------------ */
/* 집계                                                                  */
/* ------------------------------------------------------------------ */

function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function pp(x) { return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`; }
function fmt(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : "-"; }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }
function rpad(s, n) { s = String(s); return s.length >= n ? s : " ".repeat(n - s.length) + s; }
function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((c, i) => (i === 0 ? pad(c, w[i]) : rpad(c, w[i]))).join("  ")).join("\n");
}
function medianGradeOf(list) {
  const idx = list.map((g) => GRADES.indexOf(g)).sort((a, b) => a - b);
  return idx.length ? GRADES[idx[Math.floor(idx.length / 2)]] : "-";
}

/**
 * 시뮬 본체. data 는 이미 override 가 적용된 번들.
 * @returns {object} summary (JSON 직렬화 가능)
 */
export function runSim(data, args) {
  const t0 = Date.now();
  const N = args.runs;

  const wins = [0, 0, 0];
  const played = [0, 0, 0];
  const gradeCount = Object.fromEntries(GRADES.map((g) => [g, 0]));
  const rawGradeCount = Object.fromEntries(GRADES.map((g) => [g, 0]));
  const statSum = Object.fromEntries(STATS.map((s) => [s, 0]));
  let scoreSum = 0;
  const scores = [];
  const cappedGrades = [];
  const rawGrades = [];
  const tot = {};
  const buckets = [0, 0, 0, 0];
  let lossesTotal = 0;
  const lossDist = [0, 0, 0, 0];
  const oracleTot = args.manualOracle ? Object.fromEntries(ORACLE_MODES.map((k) => [k, emptyOracleRec()])) : null;

  for (let i = 0; i < N; i++) {
    const seed = `${args.seed}-${i}`;
    const { state, rating, m, oracleRec } = simulateOne(data, seed, i % 3, args.policy, args.manualOracle);
    for (const g of state.record.goalMatches) {
      played[g.season - 1]++;
      if (g.win) wins[g.season - 1]++;
    }
    gradeCount[rating.cappedGrade]++;
    rawGradeCount[rating.grade]++;
    cappedGrades.push(rating.cappedGrade);
    rawGrades.push(rating.grade);
    scoreSum += rating.score;
    scores.push(rating.score);
    lossesTotal += state.record.losses;
    lossDist[Math.min(3, state.record.losses)]++;
    for (const p of state.players) for (const s of STATS) statSum[s] += p.stats[s];
    for (const [k, v] of Object.entries(m)) {
      if (Array.isArray(v)) { v.forEach((x, j) => { buckets[j] += x; }); continue; }
      tot[k] = (tot[k] || 0) + v;
    }
    if (oracleRec) {
      for (const mode of ORACLE_MODES) {
        const a = oracleTot[mode];
        const b = oracleRec[mode];
        for (let s = 0; s < 3; s++) a.wins[s] += b.wins[s];
        a.goalsHome += b.goalsHome; a.goalsAway += b.goalsAway; a.matches += b.matches; a.penalties += b.penalties;
      }
    }
  }
  const nPlayers = 7 * N;
  const avgStats = Object.fromEntries(STATS.map((s) => [s, statSum[s] / nPlayers]));
  const avgAll = STATS.reduce((a, s) => a + avgStats[s], 0) / STATS.length;
  scores.sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const ms = Date.now() - t0;

  const summary = {
    runs: N, seed: args.seed, policy: args.policy, ms,
    overrides: { sets: args.sets, oppScale: args.oppScale },
    winRate: played.map((p, i) => (p ? wins[i] / p : 0)),
    avgStats, avgAll, scoreMean: scoreSum / N, scoreMedian: median,
    medianGradeRaw: medianGradeOf(rawGrades), medianGradeCapped: medianGradeOf(cappedGrades),
    gradeDist: gradeCount, rawGradeDist: rawGradeCount, lossDist, lossesPerRun: lossesTotal / N,
    injuriesPerRun: tot.injuries / N, trainInjuriesPerRun: tot.trainInjuries / N, eventInjuriesPerRun: tot.eventInjuries / N,
    friendshipPerRun: tot.friendship / N,
    goalsPerMatch: (tot.goalsHome + tot.goalsAway) / tot.matches,
    homeGoalsPerMatch: tot.goalsHome / tot.matches, awayGoalsPerMatch: tot.goalsAway / tot.matches,
    matchesPerRun: tot.matches / N, friendliesPerRun: tot.friendlies / N,
    penaltyRate: tot.penalties / tot.matches, extraTimeRate: tot.extraTime / tot.matches,
    eventsPerRun: tot.events / N, restsPerRun: tot.rests / N, trainsPerRun: tot.trains / N, meetingsPerRun: tot.meetings / N,
    relicsPerRun: tot.relics / N, skillUsesPerMatch: tot.skillUses / tot.matches,
    hintsPerRun: tot.hints / N, learnedPerRun: tot.learned / N, youthSlotsPerRun: tot.injuredMatchSlots / N,
    spEarnedPerRun: tot.spEarned / N,
    training: {
      trainedPlayersPerRun: tot.trainedPlayers / N,
      failsPerRun: tot.trainFails / N,
      observedFailRate: tot.trainedPlayers ? tot.trainFails / tot.trainedPlayers : 0,
      expectedFailRate: tot.trainedPlayers ? tot.expectedFails / tot.trainedPlayers : 0,
      staminaBuckets: Object.fromEntries(STAMINA_BUCKETS.map((b, i) => [b, tot.trainedPlayers ? buckets[i] / tot.trainedPlayers : 0])),
    },
    oracle: null,
  };
  if (oracleTot) {
    summary.oracle = {};
    for (const mode of ORACLE_MODES) {
      const o = oracleTot[mode];
      summary.oracle[mode] = {
        winRate: played.map((p, i) => (p ? o.wins[i] / p : 0)),
        goalsPerMatch: o.matches ? (o.goalsHome + o.goalsAway) / o.matches : 0,
        homeGoalsPerMatch: o.matches ? o.goalsHome / o.matches : 0,
        awayGoalsPerMatch: o.matches ? o.goalsAway / o.matches : 0,
        penaltyRate: o.matches ? o.penalties / o.matches : 0,
      };
    }
  }
  return summary;
}

export function printSummary(summary) {
  const s = summary;
  const N = s.runs;
  console.log(`sim: ${N} runs, seed ${s.seed}, policy ${s.policy}, ${s.ms} ms`);
  if (s.overrides.sets.length || s.overrides.oppScale) {
    console.log(`overrides: ${s.overrides.sets.join(" ")}${s.overrides.oppScale ? ` oppScale ${s.overrides.oppScale}` : ""}`);
  }
  console.log();
  console.log("[시즌별 목표 경기 승률]  목표: S1 70~80% / S2 50~60% / S3 35~45%");
  console.log(table([
    ["시즌", "승률"],
    ...[0, 1, 2].map((i) => [`시즌 ${i + 1}`, pct(s.winRate[i])]),
  ]));
  console.log("\n[평균 최종 스탯]  (7명 평균, 적성 배율 미적용)");
  console.log(table([
    ["스탯", ...STATS, "전체"],
    ["평균", ...STATS.map((k) => fmt(s.avgStats[k], 0)), fmt(s.avgAll, 0)],
  ]));
  console.log(`\n[평가]  점수 평균 ${fmt(s.scoreMean, 1)} · 중앙값 ${fmt(s.scoreMedian, 1)} · 등급 중앙값 원 ${s.medianGradeRaw} / 상한 적용 ${s.medianGradeCapped}  목표: 중앙값 B`);
  console.log(table([
    ["등급", ...GRADES],
    ["최종(상한 적용)", ...GRADES.map((g) => s.gradeDist[g])],
    ["원 등급", ...GRADES.map((g) => s.rawGradeDist[g])],
  ]));
  console.log(`패배 수 분포 (0/1/2/3패): ${s.lossDist.join(" / ")}  · 런당 평균 패배 ${fmt(s.lossesPerRun)}`);
  console.log("\n[런당 지표]");
  console.log(table([
    ["지표", "값", "목표"],
    ["부상 수 (훈련 / 이벤트)", `${fmt(s.injuriesPerRun)} (${fmt(s.trainInjuriesPerRun)} / ${fmt(s.eventInjuriesPerRun)})`, "0.5~1.5"],
    ["우정 훈련 수", fmt(s.friendshipPerRun), ">= 3"],
    ["훈련 / 휴식 / 미팅 턴", `${fmt(s.trainsPerRun, 1)} / ${fmt(s.restsPerRun, 1)} / ${fmt(s.meetingsPerRun, 1)}`, "휴식 3~4"],
    ["이벤트 수", fmt(s.eventsPerRun, 1), ""],
    ["유물 수", fmt(s.relicsPerRun), ""],
    ["힌트 누적 / 습득 스킬", `${fmt(s.hintsPerRun, 1)} / ${fmt(s.learnedPerRun)}`, ""],
    ["스킬 포인트 획득", fmt(s.spEarnedPerRun, 1), ""],
    ["경기 수 (친선 포함)", `${fmt(s.matchesPerRun, 1)} (${fmt(s.friendliesPerRun, 1)})`, ""],
    ["유스 대체 슬롯 수", fmt(s.youthSlotsPerRun), ""],
  ]));
  const tr = s.training;
  console.log("\n[훈련 체력 구조]  (훈련 칸 선수 기준)");
  console.log(table([
    ["지표", "값"],
    ["훈련 인원 / 런", fmt(tr.trainedPlayersPerRun, 1)],
    ["실패 / 런 (관측 실패율 / 기대 실패율)", `${fmt(tr.failsPerRun)} (${pct(tr.observedFailRate)} / ${pct(tr.expectedFailRate)})`],
    ["훈련 시 체력 분포 " + STAMINA_BUCKETS.join(" / "), STAMINA_BUCKETS.map((b) => pct(tr.staminaBuckets[b])).join(" / ")],
  ]));
  console.log("\n[경기]");
  console.log(table([
    ["지표", "값", "목표"],
    ["평균 골 / 경기 (합)", fmt(s.goalsPerMatch), "1.5~3.5"],
    ["우리 골 / 상대 골", `${fmt(s.homeGoalsPerMatch)} / ${fmt(s.awayGoalsPerMatch)}`, ""],
    ["연장 비율 / 승부차기 비율", `${pct(s.extraTimeRate)} / ${pct(s.penaltyRate)}`, ""],
    ["액티브 스킬 발동 / 경기", fmt(s.skillUsesPerMatch), ""],
  ]));
  if (s.oracle) {
    console.log("\n[수동 개입 이득]  같은 경기(setup·seed 동일)를 결정 방식만 바꿔 재생. 기준: 시즌1 오라클 - 자동 = 5~15pp");
    const rows = [["결정 방식", "S1 승률", "S2 승률", "S3 승률", "골/경기(우리/상대)", "승부차기"]];
    rows.push(["자동(AI)", ...s.winRate.map(pct), `${fmt(s.goalsPerMatch)} (${fmt(s.homeGoalsPerMatch)}/${fmt(s.awayGoalsPerMatch)})`, pct(s.penaltyRate)]);
    const label = { perfect: "완전 오라클(항상 안다)", visible: "화면 공개 정보만", blind: "자동(의도 정보 없음)" };
    for (const mode of ORACLE_MODES) {
      const o = s.oracle[mode];
      rows.push([label[mode], ...o.winRate.map(pct), `${fmt(o.goalsPerMatch)} (${fmt(o.homeGoalsPerMatch)}/${fmt(o.awayGoalsPerMatch)})`, pct(o.penaltyRate)]);
    }
    console.log(table(rows));
    const d = s.oracle.perfect.winRate.map((w, i) => w - s.winRate[i]);
    const dv = s.oracle.visible.winRate.map((w, i) => w - s.winRate[i]);
    const db = s.winRate.map((w, i) => w - s.oracle.blind.winRate[i]);
    console.log(`완전 오라클 - 자동: S1 ${pp(d[0])} / S2 ${pp(d[1])} / S3 ${pp(d[2])}`);
    console.log(`화면 정보 오라클 - 자동: S1 ${pp(dv[0])} / S2 ${pp(dv[1])} / S3 ${pp(dv[2])}`);
    console.log(`자동 - 의도 정보 없는 자동 (공개 정보 자체의 가치): S1 ${pp(db[0])} / S2 ${pp(db[1])} / S3 ${pp(db[2])}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadData();
  applyConfigOverrides(data.config, args.sets);
  scaleOpponents(data.opponents, args.oppScale);
  const summary = runSim(data, args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
}

function isEntry() {
  try {
    return path.resolve(process.argv[1] || "").toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntry()) {
  main();
  process.exitCode = 0;
}
