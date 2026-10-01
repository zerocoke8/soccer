#!/usr/bin/env node
// tools/challenge_sim.mjs — 도전 모드 보정 (2026-10-01, 플레이테스트용)
//   node tools/challenge_sim.mjs [--runs 100] [--teams 6] [--seed 1] [--targets 340,390,...] [--json]
//   node tools/challenge_sim.mjs --write-sample [--sample-seed challenge-sample-7] [--route-start 1]
//
// 1) 팀: 테스트용 샘플 팀(data/challenge_sample_team.json) + tools/sim.mjs 와 같은 자동 육성 런(smart 정책)으로 만든 완주 팀 --teams 개.
// 2) 단계마다 팀마다 --runs 판: challenge.challengeSetup(팀, 단계, 도전 번호 1..runs) → match.createMatch → match.simulateAuto (A안 자동).
//    시드는 (팀 id, 단계, 도전 번호) 로 정해진다 — UI 의 도전 경기와 같은 시드 규칙.
// 3) 출력: 단계별 상대 전력(7명 × 5스탯 평균) · 스킬 단계 · 샘플 팀 승률 · 완주 팀 평균 승률(최저~최고) · 전체 승률 · 골 · 연장/승부차기.
//    보정 목표 (2026-10-01, B 등급 팀 기준): 1단계 ≥ 85% · 5단계 ≈ 50% · 10단계 ≤ 15%.
// --targets : 단계 statTarget 을 메모리에서 덮어쓴다 (쉼표 목록, 1단계부터). 파일은 바꾸지 않는다.
// --write-sample : 샘플 팀을 다시 만들어 data/challenge_sample_team.json 에 쓴다 (기본 편성 · 자동 선택 · 고정 시드).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";
import * as challenge from "../js/engine/challenge.js";
import { loadData as loadSimData, simulateOne, table, isEntry } from "./sim.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
/** 샘플 팀 고정 시드 (기본 편성 · smart 자동 정책 · 루트 시작 1 — 완주 B 등급, 점수가 자동 런 중앙값 근처) */
export const SAMPLE_SEED = "challenge-sample-7";
export const SAMPLE_ROUTE_START = 1;
const SAMPLE_REGISTERED_AT = "2026-10-01T00:00:00.000Z";
const SAMPLE_PATH = path.join(ROOT, "data", "challenge_sample_team.json");

export function parseArgs(argv) {
  const out = { runs: 100, teams: 6, seed: 1, targets: "", json: false, writeSample: false, sampleSeed: SAMPLE_SEED, routeStart: SAMPLE_ROUTE_START };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, parseInt(argv[++i], 10) || 100);
    else if (a === "--teams") out.teams = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--seed") out.seed = argv[++i] ?? 1;
    else if (a === "--targets") out.targets = argv[++i] || "";
    else if (a === "--json") out.json = true;
    else if (a === "--write-sample") out.writeSample = true;
    else if (a === "--sample-seed") out.sampleSeed = argv[++i] || SAMPLE_SEED;
    else if (a === "--route-start") out.routeStart = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/challenge_sim.mjs [--runs N] [--teams K] [--seed S] [--targets 340,390,...] [--json]");
      console.log("       node tools/challenge_sim.mjs --write-sample [--sample-seed S] [--route-start R]");
      process.exit(0);
    }
  }
  return out;
}

/** sim 데이터 번들 + challenge.json + challenge_sample_team.json (없으면 건너뜀) */
export function loadData(root = ROOT) {
  const data = loadSimData(root);
  data.challenge = JSON.parse(fs.readFileSync(path.join(root, "data", "challenge.json"), "utf8"));
  const sp = path.join(root, "data", "challenge_sample_team.json");
  if (fs.existsSync(sp)) data.challenge_sample_team = JSON.parse(fs.readFileSync(sp, "utf8"));
  return data;
}

/** 자동 런 1회 완주 → 등록 팀 (app.js registerTeam 과 같은 모양, 등록 시각은 인자) */
export function autoTeam(data, seed, routeStart, registeredAt) {
  const { state } = simulateOne(data, seed, routeStart, "smart");
  const { rating, registeredTeam } = run.finalizeRun(state, data);
  return { ...registeredTeam, grade: rating.cappedGrade ?? rating.grade ?? "-", score: rating.score ?? null, registeredAt };
}

/** 샘플 팀 파일 내용 */
export function buildSampleFile(data, seed = SAMPLE_SEED, routeStart = SAMPLE_ROUTE_START) {
  const team = autoTeam(data, seed, routeStart, SAMPLE_REGISTERED_AT);
  return {
    _comment: "도전 모드 테스트용 샘플 팀 (플레이테스트용). 기본 편성 · 자동 선택(tools/sim.mjs smart 정책: 추천 칸 훈련, 체력 부족 추천이면 휴식, 살 수 있는 스킬 구매, 이벤트 0번, 유물 첫 번째, 루트 순환)으로 고정 시드 런을 완주한 등록 팀 저장본. 다시 만들기: node tools/challenge_sim.mjs --write-sample",
    generator: { tool: "tools/challenge_sim.mjs --write-sample", seed, routeStart, policy: "smart" },
    team,
  };
}

/** --targets "340,390,..." → stages[i].statTarget 덮어쓰기 (메모리) */
export function applyTargets(data, spec) {
  if (!spec) return;
  const vals = spec.split(",").map((s) => Number(s.trim()));
  const stages = data.challenge.stages.slice().sort((a, b) => a.stage - b.stage);
  vals.forEach((v, i) => {
    if (!Number.isFinite(v) || !stages[i]) throw new Error(`--targets 형식: 쉼표로 나눈 숫자 (1단계부터): ${spec}`);
    stages[i].statTarget = v;
  });
}

/** 보정 본체 */
export function runChallengeSim(data, args) {
  const t0 = Date.now();
  const teams = [];
  const sample = challenge.sampleTeam(data);
  if (sample) teams.push({ label: "샘플", team: sample });
  for (let i = 0; i < args.teams; i++) {
    teams.push({ label: `완주${i + 1}`, team: autoTeam(data, `challenge-cal-${args.seed}-${i}`, i % 3, `cal-${args.seed}-${i}`) });
  }
  const teamInfo = teams.map(({ label, team }) => {
    const s = challenge.teamSummary(team, data);
    return { label, teamId: s.teamId, grade: s.grade, score: s.score == null ? null : Math.round(s.score), power: s.power, teamwork: s.teamwork, formation: s.formation };
  });
  const stages = challenge.getStages(data);
  const rows = [];
  for (const def of stages) {
    const info = challenge.stageInfo(def, data);
    const per = [];
    let goalsH = 0;
    let goalsA = 0;
    let et = 0;
    let pk = 0;
    let n = 0;
    for (const { team } of teams) {
      let w = 0;
      for (let a = 1; a <= args.runs; a++) {
        const setup = challenge.challengeSetup(team, def.stage, a, data);
        const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
        match.simulateAuto(ms, data);
        const r = match.getResult(ms);
        if (r.winner === "home") w++;
        goalsH += r.homeGoals;
        goalsA += r.awayGoals;
        if (ms.stage !== "regular") et++;
        if (r.penalties) pk++;
        n++;
      }
      per.push(w / args.runs);
    }
    const sampleRate = sample ? per[0] : null;
    const simRates = sample ? per.slice(1) : per;
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    rows.push({
      stage: def.stage,
      name: info.displayName,
      statTarget: def.statTarget,
      power: info.power,
      tier: info.skillTier,
      badges: info.badges.map((b) => b.label),
      sample: sampleRate,
      simMean: mean(simRates),
      simMin: simRates.length ? Math.min(...simRates) : null,
      simMax: simRates.length ? Math.max(...simRates) : null,
      all: mean(per),
      perTeam: per,
      goalsHome: n ? goalsH / n : 0,
      goalsAway: n ? goalsA / n : 0,
      extraTime: n ? et / n : 0,
      penalties: n ? pk / n : 0,
    });
  }
  return { runs: args.runs, teams: teamInfo, stages: rows, ms: Date.now() - t0 };
}

function pct(x) {
  return x == null ? "-" : `${(x * 100).toFixed(0)}%`;
}

export function printSummary(s) {
  console.log(`challenge sim: 팀 ${s.teams.length}개 × 단계당 ${s.runs}판, ${s.ms} ms`);
  console.log("\n[팀]");
  console.log(table([
    ["팀", "등급", "점수", "전력", "팀워크", "포메이션"],
    ...s.teams.map((t) => [t.label, t.grade, t.score ?? "-", t.power, t.teamwork, t.formation]),
  ]));
  console.log("\n[단계별 승률]  목표 (B 등급 팀): 1단계 ≥ 85% · 5단계 ≈ 50% · 10단계 ≤ 15%");
  console.log(table([
    ["단계", "상대", "statTarget", "전력", "스킬 단계", "샘플", "완주 평균 (최저~최고)", "전체", "골 우리/상대", "연장/PK"],
    ...s.stages.map((r) => [
      r.stage, r.name, r.statTarget, r.power, `${r.tier} ${r.badges.join("·") || "-"}`,
      pct(r.sample), `${pct(r.simMean)} (${pct(r.simMin)}~${pct(r.simMax)})`, pct(r.all),
      `${r.goalsHome.toFixed(2)}/${r.goalsAway.toFixed(2)}`, `${pct(r.extraTime)}/${pct(r.penalties)}`,
    ]),
  ]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadData();
  if (args.writeSample) {
    const file = buildSampleFile(data, args.sampleSeed, args.routeStart);
    fs.writeFileSync(SAMPLE_PATH, JSON.stringify(file, null, 2) + "\n", "utf8");
    const s = challenge.teamSummary(challenge.sampleTeam({ ...data, challenge_sample_team: file }), data);
    console.log(`샘플 팀 저장: ${path.relative(ROOT, SAMPLE_PATH)} — 시드 ${args.sampleSeed} (루트 시작 ${args.routeStart}) · 등급 ${s.grade} · 점수 ${Math.round(s.score)} · 전력 ${s.power} · ${s.formation}`);
    return;
  }
  applyTargets(data, args.targets);
  const summary = runChallengeSim(data, args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
}

if (isEntry(import.meta.url)) {
  main();
  process.exitCode = 0;
}
