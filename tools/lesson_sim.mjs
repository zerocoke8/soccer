#!/usr/bin/env node
// tools/lesson_sim.mjs — 카드 레슨 런 헤드리스 시뮬 (LESSON_PROTO_PLAN §10.1)
//   node tools/lesson_sim.mjs --runs 200 --seed 1 [--policy all|ace|team|counter|press|poss] [--formation 2-2-2] [--no-match] [--json]
//                             [--special-rate r]
//   --special-rate r: 감독 AI 는 특별 표시 구역을 늘 고른다 (§14.14). r < 1 이면 레슨 주마다 확률 r 로만 특별을 고르고, 아니면
//                     특별 표시가 없을 때의 감독 AI 선택 (7명 합이 가장 낮은 구역) 을 쓴다 — 일반 레슨 점수를 재려는 시뮬 쪽 옵션
//                     (보정 시뮬은 0.7). 결정은 시뮬 전용 rng (seed · 주 번호) 라 같은 시드면 같은 결과.
// 진행: manager.autoStep (감독 AI) + match.simulateAuto (경기 자동). --no-match 면 경기를 돌리지 않고 홈 1:0 승으로 둔다.
// 구역 방식 지표 (§14.18): 구역 상승 = 기본 + 분위기 + 카드 / 부 스탯 · 기본 비중 · 고르게 크기 (주 스탯 상승 최저 / 최고) ·
//   벤치 · 시즌별 일반 / 특별 점수 p30 / p90 · 역습 · 점유 · 압박. 비교 기준 = tools/drafts/zone_sim.mjs (보정 시뮬).
// 결과는 보고만 한다. 수치는 바꾸지 않는다 (밸런스는 나중에).
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";
import * as match from "../js/engine/match.js";
import { formationSlots } from "../js/engine/run.js";
import { mainStatsOf } from "../js/engine/cards.js";
import { createRng } from "../js/engine/rng.js";

const DATA_FILES = ["config", "characters", "supports", "events", "skills", "relics", "opponents", "routes", "traits", "combos", "cards", "lesson", "policies"];
const POLICIES = ["ace", "team", "counter", "press", "poss"];
const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const GRADES = ["S", "A", "B", "C", "D", "E", "F", "G"];
/** 레슨 1회 시간 추정: 카드 · 벤치 · 턴 끝 행동 1번당 초 (가정) */
const SEC_PER_ACTION = 6;

export function loadData() {
  const data = {};
  for (const n of DATA_FILES) {
    const p = fileURLToPath(new URL(`../data/${n}.json`, import.meta.url));
    data[n] = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return data;
}

export function parseArgs(argv) {
  const out = { runs: 200, seed: "1", policy: "all", formation: null, match: true, json: false, specialRate: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, parseInt(argv[++i], 10) || 200);
    else if (a === "--seed") out.seed = String(argv[++i] ?? "1");
    else if (a === "--policy") out.policy = argv[++i] || "all";
    else if (a === "--formation") out.formation = argv[++i] || null;
    else if (a === "--no-match") out.match = false;
    else if (a === "--json") out.json = true;
    else if (a === "--special-rate") out.specialRate = Math.max(0, Math.min(1, Number(argv[++i])));
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/lesson_sim.mjs --runs N --seed S [--policy all|ace|team|counter|press|poss] [--formation 2-2-2] [--no-match] [--json] [--special-rate r]");
      process.exit(0);
    }
  }
  if (out.policy !== "all" && !POLICIES.includes(out.policy)) throw new Error(`알 수 없는 방침: ${out.policy}`);
  return out;
}

/** 기본 편성이 아닌 포메이션: 기본 편성의 7명을 슬롯 순서대로 새 슬롯에 놓는다 */
function squadFor(data, formation) {
  const def = data.config.defaultSquad;
  if (!formation || formation === def.formation) return undefined;
  const chars = formationSlots(def.formation).map((slot) => def.slots[slot]);
  return Object.fromEntries(formationSlots(formation).map((slot, i) => [slot, chars[i]]));
}

const NO_MATCH_RESULT = { winner: "home", homeGoals: 1, awayGoals: 0 };

/** 런 1개를 감독 AI 로 끝까지 돌리고 지표를 모은다 */
/**
 * --special-rate < 1 일 때 레슨 주 행동: 감독 AI 가 특별 구역을 고르면 확률 r 로만 그대로 두고,
 * 아니면 특별 표시가 없는 것처럼 다시 추천받은 구역을 고른다. null 이면 감독 AI 그대로.
 */
function specialRateAction(state, data, seed, rate) {
  if (!(rate < 1) || state.phase !== "week" || !state.weekOffer || state.weekOffer.kind !== "lesson") return null;
  const rec = M.recommendWeek(state, data);
  if (rec.type !== "lesson" || !(state.weekOffer.specials || []).includes(rec.zone)) return null;
  if (createRng(`${seed}-special-${state.turnIndex}`).next() < rate) return null;
  const plain = JSON.parse(JSON.stringify(state));
  plain.weekOffer.specials = [];
  const alt = M.recommendWeek(plain, data);
  return alt.type === "lesson" ? { type: "lesson", zone: alt.zone } : null;
}

export function simulateOne(data, { seed, policy, formation, playMatches, specialRate = 1 }) {
  const playMatch = playMatches
    ? (setup) => {
        const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
        match.simulateAuto(ms, data);
        return match.getResult(ms);
      }
    : () => ({ ...NO_MATCH_RESULT });
  const state = LR.createRun({ data, seed, policy, ...(formation ? { formation, squad: squadFor(data, formation) } : {}) });
  const startStats = Object.fromEntries(state.players.map((p) => [p.id, { ...p.stats }]));
  const m = {
    weekRests: 0, benches: 0, benchTurns: 0, lessonTurns: 0, hints: 0,
    base: 0, mood: 0, card: 0, sub: 0,
    stealUses: 0, stealUsed: 0, possBreaks: 0, possLost: 0, pressSum: 0, pressN: 0, tpGain: 0, tpSpent: 0, spGain: 0, spSpent: 0,
    coachAcquired: 0, targeted: Object.fromEntries(state.players.map((p) => [p.id, 0])),
    actionsPerLesson: [], steps: 0, consultBuys: 0, consultUpgrades: 0, consultDeletes: 0, skillsBought: 0, rewardSkips: 0,
  };
  const benchTurnKeys = new Set();
  let guard = 0;
  while (state.phase !== "finished") {
    if (++guard > 2000) throw new Error(`런이 끝나지 않습니다 (seed ${seed}, phase ${state.phase})`);
    const tp0 = state.trainingPoints;
    const sp0 = state.skillPoints;
    const coach0 = state.deck.filter((e) => e.cardId.startsWith("cd_c_")).length;
    const wasLesson = state.phase === "lesson";
    const pressBefore = wasLesson ? Number(state.lesson.buffs.press) || 0 : 0;
    const forced = specialRateAction(state, data, seed, specialRate);
    let r;
    if (forced) {
      LR.applyWeekAction(state, data, forced);
      r = { phase: "week", action: forced };
    } else r = M.autoStep(state, data, { playMatch });
    m.steps += 1;
    const dtp = state.trainingPoints - tp0;
    const dsp = state.skillPoints - sp0;
    if (dtp > 0) m.tpGain += dtp; else m.tpSpent -= dtp;
    if (dsp > 0) m.spGain += dsp; else m.spSpent -= dsp;
    m.coachAcquired += Math.max(0, state.deck.filter((e) => e.cardId.startsWith("cd_c_")).length - coach0);
    if (r.phase === "week" && r.action.type === "rest") m.weekRests += 1;
    if (r.phase === "lesson" && r.action.kind === "bench") {
      m.benches += 1;
      benchTurnKeys.add(`${state.record.lessons.length}-${state.lesson.turn}`);
    }
    if (r.phase === "lesson" && r.action.kind === "play") {
      if (policy === "press") {
        m.pressSum += pressBefore;
        m.pressN += 1;
      }
      for (const fx of state.lesson ? state.lesson.lastFx : []) {
        if (fx.t !== "buff") continue;
        if (fx.key === "steal" && policy === "counter" && fx.from > 0 && fx.to < fx.from) {
          m.stealUses += 1;
          m.stealUsed += fx.from;
        }
        if (fx.key === "poss" && policy === "poss" && fx.to < fx.from) {
          m.possBreaks += 1;
          m.possLost += fx.from - fx.to;
        }
      }
    }
    if (r.phase === "reward" && r.action.pick === null && state.record.lessons.at(-1).result !== "fail") m.rewardSkips += 1;
    if (r.phase === "consult") {
      if (r.action.op === "buy") m.consultBuys += 1;
      if (r.action.op === "upgrade") m.consultUpgrades += 1;
      if (r.action.op === "delete") m.consultDeletes += 1;
      if (r.action.op === "skill") m.skillsBought += 1;
    }
    if (wasLesson && state.phase === "reward") {
      const res = state.pendingReward.result;
      m.hints += res.hints.length;
      for (const pp of res.perPlayer) {
        m.targeted[pp.id] += pp.targeted;
        m.base += pp.base;
        m.mood += pp.mood;
        m.card += pp.card;
        m.sub += pp.sub;
      }
      m.lessonTurns += res.turnReached;
      m.actionsPerLesson.push({ plays: res.plays, actions: state.lesson.seq });
    }
  }
  m.benchTurns = benchTurnKeys.size;
  const fin = LR.finalizeRun(state, data);
  // 고르게 크기: 선수별 런 동안 주 스탯 (포지션 주 스탯 2개) 상승 · 5스탯 상승
  const mainGrowth = {};
  const totalGrowth = {};
  for (const p of state.players) {
    mainGrowth[p.id] = mainStatsOf(p.position).reduce((a, s) => a + p.stats[s] - startStats[p.id][s], 0);
    totalGrowth[p.id] = STATS.reduce((a, s) => a + p.stats[s] - startStats[p.id][s], 0);
  }
  const upgradeAt = data.lesson.bond.upgradeAt;
  const eventAt = data.lesson.bond.eventAt;
  return {
    state,
    rating: fin.rating,
    avgStat: state.players.reduce((a, p) => a + STATS.reduce((b, s) => b + p.stats[s], 0), 0) / (state.players.length * STATS.length),
    teamwork: state.teamwork,
    learned: state.players.reduce((a, p) => a + p.learnedSkillIds.length, 0),
    goal: state.record.goalMatches.map((g) => !!g.win),
    friendlies: state.record.friendlies.length,
    losses: state.record.losses,
    lessons: state.record.lessons,
    deck: state.deck.length,
    coachInDeck: state.deck.filter((e) => e.cardId.startsWith("cd_c_")).length,
    bond60: state.supports.filter((s) => s.bond >= eventAt).length,
    bond80: state.supports.filter((s) => s.bond >= upgradeAt).length,
    tpEnd: state.trainingPoints,
    mainGrowth, totalGrowth,
    players: state.players.map((p) => ({ id: p.id, name: p.name, position: p.position })),
    spEnd: state.skillPoints,
    ...m,
  };
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** 분위수 (정렬 뒤 floor(q × (n − 1)) 번째 — zone_sim 과 같다) */
const pctl = (a, q) => {
  if (!a.length) return NaN;
  const b = a.slice().sort((x, y) => x - y);
  return b[Math.floor(q * (b.length - 1))];
};

/** 방침 1개 × N 런 → 요약 */
export function summarize(data, args, policy) {
  const t0 = performance.now();
  const rs = [];
  for (let i = 0; i < args.runs; i++) {
    rs.push(simulateOne(data, { seed: `${args.seed}-${i}`, policy, formation: args.formation, playMatches: args.match, specialRate: args.specialRate ?? 1 }));
  }
  const N = rs.length;
  const lessons = rs.flatMap((r) => r.lessons);
  const bySeason = [1, 2, 3].map((s) => lessons.filter((l) => Math.floor(l.turnIndex / data.lesson.weeksPerSeason) + 1 === s));
  const normal = (arr) => arr.filter((l) => !l.prep);
  const rate = (arr, res) => (arr.length ? arr.filter((l) => l.result === res).length / arr.length : 0);
  const grades = Object.fromEntries(GRADES.map((g) => [g, 0]));
  for (const r of rs) grades[r.rating.cappedGrade] = (grades[r.rating.cappedGrade] || 0) + 1;
  const goalWin = [0, 1, 2].map((i) => mean(rs.map((r) => (r.goal[i] ? 1 : 0))));
  const tgt = Object.keys(rs[0].targeted).map((id) => ({ id, n: mean(rs.map((r) => r.targeted[id])) }));
  const apl = rs.flatMap((r) => r.actionsPerLesson);
  const ids = rs[0].players.map((p) => p.id);
  const mains = ids.map((id) => mean(rs.map((r) => r.mainGrowth[id])));
  const tots = ids.map((id) => mean(rs.map((r) => r.totalGrowth[id])));
  const zoneGain = mean(rs.map((r) => r.base + r.mood + r.card));
  const plain = (a) => a.filter((l) => !l.prep && !l.special).map((l) => l.score);
  const spec = (a) => a.filter((l) => l.special).map((l) => l.score);
  return {
    policy, runs: N, ms: Math.round(performance.now() - t0),
    avgStat: mean(rs.map((r) => r.avgStat)),
    teamwork: mean(rs.map((r) => r.teamwork)),
    learned: mean(rs.map((r) => r.learned)),
    ratingScore: mean(rs.map((r) => r.rating.score)),
    grades,
    goalWin, goalWinAll: mean(goalWin),
    lossesPerRun: mean(rs.map((r) => r.losses)),
    friendlies: mean(rs.map((r) => r.friendlies)),
    lessonsPerRun: lessons.length / N,
    clearRate: rate(lessons, "clear") + rate(lessons, "perfect"),
    perfectRate: rate(lessons, "perfect"),
    failRate: rate(lessons, "fail"),
    seasonScore: bySeason.map((a) => mean(normal(a).map((l) => l.score))),
    seasonTarget: bySeason.map((a) => mean(normal(a).map((l) => l.target))),
    seasonPrepScore: bySeason.map((a) => mean(a.filter((l) => l.prep).map((l) => l.score))),
    seasonClear: bySeason.map((a) => (a.length ? a.filter((l) => l.result !== "fail").length / a.length : 0)),
    failsPerRun: mean(rs.map((r) => r.lessons.reduce((x, l) => x + l.fails, 0))),
    injuriesPerRun: mean(rs.map((r) => r.lessons.reduce((x, l) => x + l.injuries, 0))),
    growth: mean(rs.map((r) => r.base + r.mood + r.card + r.sub)),
    zoneGain,
    base: mean(rs.map((r) => r.base)),
    mood: mean(rs.map((r) => r.mood)),
    card: mean(rs.map((r) => r.card)),
    sub: mean(rs.map((r) => r.sub)),
    baseShare: zoneGain ? mean(rs.map((r) => r.base)) / zoneGain : NaN,
    even: Math.min(...mains) / Math.max(...mains),
    evenTot: Math.min(...tots) / Math.max(...tots),
    mains: ids.map((id, i) => ({ id, name: rs[0].players[i].name, position: rs[0].players[i].position, main: mains[i] })),
    benches: mean(rs.map((r) => r.benches)),
    benchTurnPct: rs.reduce((a, r) => a + r.benchTurns, 0) / Math.max(1, rs.reduce((a, r) => a + r.lessonTurns, 0)),
    benchRuns2: mean(rs.map((r) => (r.benches >= 2 ? 1 : 0))),
    seasonPlain: bySeason.map((a) => ({ p30: pctl(plain(a), 0.3), p90: pctl(plain(a), 0.9), mean: plain(a).length ? mean(plain(a)) : NaN })),
    seasonSpecial: bySeason.map((a) => ({ p30: pctl(spec(a), 0.3), p90: pctl(spec(a), 0.9), mean: spec(a).length ? mean(spec(a)) : NaN })),
    stealUses: mean(rs.map((r) => r.stealUses)),
    stealStack: rs.reduce((a, r) => a + r.stealUsed, 0) / Math.max(1, rs.reduce((a, r) => a + r.stealUses, 0)),
    possBreaks: mean(rs.map((r) => r.possBreaks)),
    possLost: rs.reduce((a, r) => a + r.possLost, 0) / Math.max(1, rs.reduce((a, r) => a + r.possBreaks, 0)),
    pressAvg: rs.reduce((a, r) => a + r.pressSum, 0) / Math.max(1, rs.reduce((a, r) => a + r.pressN, 0)),
    weekRests: mean(rs.map((r) => r.weekRests)),
    targetedMin: Math.min(...tgt.map((t) => t.n)),
    targetedMax: Math.max(...tgt.map((t) => t.n)),
    targeted: tgt,
    coachAcquired: mean(rs.map((r) => r.coachAcquired)),
    coachInDeck: mean(rs.map((r) => r.coachInDeck)),
    bond60: mean(rs.map((r) => r.bond60)),
    bond80: mean(rs.map((r) => r.bond80)),
    hints: mean(rs.map((r) => r.hints)),
    deck: mean(rs.map((r) => r.deck)),
    tpGain: mean(rs.map((r) => r.tpGain)),
    tpSpent: mean(rs.map((r) => r.tpSpent)),
    tpEnd: mean(rs.map((r) => r.tpEnd)),
    spGain: mean(rs.map((r) => r.spGain)),
    spSpent: mean(rs.map((r) => r.spSpent)),
    spEnd: mean(rs.map((r) => r.spEnd)),
    rewardSkips: mean(rs.map((r) => r.rewardSkips)),
    consultBuys: mean(rs.map((r) => r.consultBuys)),
    consultUpgrades: mean(rs.map((r) => r.consultUpgrades)),
    consultDeletes: mean(rs.map((r) => r.consultDeletes)),
    skillsBought: mean(rs.map((r) => r.skillsBought)),
    playsPerLesson: mean(apl.map((x) => x.plays)),
    actionsPerLesson: mean(apl.map((x) => x.actions)),
    minutesPerLesson: (mean(apl.map((x) => x.actions)) * SEC_PER_ACTION) / 60,
    stepsPerRun: mean(rs.map((r) => r.steps)),
  };
}

const f0 = (x) => (Number.isFinite(x) ? x.toFixed(0) : "-");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "-");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "-");
const pc = (x) => (Number.isFinite(x) ? `${(x * 100).toFixed(0)}%` : "-");

function printTable(sums, args) {
  const rows = [
    ["런 끝 평균 스탯 (참고 ~477)", (s) => f0(s.avgStat)],
    ["팀워크 (참고 90~94)", (s) => f0(s.teamwork)],
    ["습득 스킬 (참고 ~0.9)", (s) => f1(s.learned)],
    ["평가 점수", (s) => f0(s.ratingScore)],
    ["등급 S/A/B/C/D/E/F/G", (s) => GRADES.map((g) => s.grades[g] || 0).join("/")],
    ["경계전 승률 (전체)", (s) => (args.match ? pc(s.goalWinAll) : "-")],
    ["경계전 승률 s1/s2/s3", (s) => (args.match ? s.goalWin.map(pc).join("/") : "-")],
    ["런당 패배", (s) => (args.match ? f2(s.lossesPerRun) : "-")],
    ["런당 친선전", (s) => f1(s.friendlies)],
    ["런당 레슨 수", (s) => f1(s.lessonsPerRun)],
    ["클리어율 (퍼펙트 포함)", (s) => pc(s.clearRate)],
    ["퍼펙트율", (s) => pc(s.perfectRate)],
    ["실패율", (s) => pc(s.failRate)],
    ["런당 성장 (띠 5,900~7,300)", (s) => f0(s.growth)],
    ["구역 상승 = 기본 + 분위기 + 카드 / 부", (s) => `${f0(s.zoneGain)}=${f0(s.base)}+${f0(s.mood)}+${f0(s.card)} / ${f0(s.sub)}`],
    ["기본 비중 (띠 30~40%)", (s) => `${(s.baseShare * 100).toFixed(1)}%`],
    ["고르게: 주 스탯 상승 최저/최고 (기준 0.60)", (s) => f2(s.even)],
    ["고르게: 5스탯 상승 최저/최고", (s) => f2(s.evenTot)],
    ["선수별 주 스탯 상승", (s) => s.mains.map((x) => f0(x.main)).join(",")],
    ["레슨 점수 s1/s2/s3 (초안 395/460/545)", (s) => s.seasonScore.map(f0).join("/")],
    ["일반 점수 평균 s1 (띠 400~520)/s2/s3", (s) => s.seasonPlain.map((x) => f0(x.mean)).join("/")],
    ["특별 점수 평균 s1/s2/s3", (s) => s.seasonSpecial.map((x) => f0(x.mean)).join("/")],
    ["일반 점수 p30 s1/s2/s3", (s) => s.seasonPlain.map((x) => f0(x.p30)).join("/")],
    ["일반 점수 p90 s1/s2/s3", (s) => s.seasonPlain.map((x) => f0(x.p90)).join("/")],
    ["특별 점수 p30 s1/s2/s3", (s) => s.seasonSpecial.map((x) => f0(x.p30)).join("/")],
    ["특별 점수 p90 s1/s2/s3", (s) => s.seasonSpecial.map((x) => f0(x.p90)).join("/")],
    ["레슨 목표 평균 s1/s2/s3", (s) => s.seasonTarget.map(f0).join("/")],
    ["대비 레슨 점수 s1/s2/s3", (s) => s.seasonPrepScore.map(f0).join("/")],
    ["클리어율 s1/s2/s3", (s) => s.seasonClear.map(pc).join("/")],
    ["런당 실패 판정 (목표 0.5~1.5)", (s) => f2(s.failsPerRun)],
    ["런당 부상 (띠 0.9~1.7)", (s) => f2(s.injuriesPerRun)],
    ["역습: 탈취 사용 회/런 · 평균 스택", (s) => (s.policy === "counter" ? `${f1(s.stealUses)} · ${f2(s.stealStack)}` : "-")],
    ["점유: 깨짐 회/런 · 잃은 스택", (s) => (s.policy === "poss" ? `${f1(s.possBreaks)} · ${f1(s.possLost)}` : "-")],
    ["압박: 카드 낼 때 평균 단계", (s) => (s.policy === "press" ? f2(s.pressAvg) : "-")],
    ["런당 벤치 (띠 2~10) · 벤치 있는 턴 · 2회 이상 런", (s) => `${f1(s.benches)} · ${pc(s.benchTurnPct)} · ${pc(s.benchRuns2)}`],
    ["런당 주 휴식", (s) => f1(s.weekRests)],
    ["선수별 대상 횟수 최소~최대", (s) => `${f1(s.targetedMin)}~${f1(s.targetedMax)}`],
    ["코치 카드 획득 / 런 끝 덱 안", (s) => `${f1(s.coachAcquired)} / ${f1(s.coachInDeck)}`],
    ["유대 60 / 80 도달 코치 수", (s) => `${f1(s.bond60)} / ${f1(s.bond80)}`],
    ["힌트 수", (s) => f1(s.hints)],
    ["스킬 구매 (상담)", (s) => f1(s.skillsBought)],
    ["런 끝 덱 크기", (s) => f1(s.deck)],
    ["TP 얻음 / 씀 / 남음", (s) => `${f0(s.tpGain)}/${f0(s.tpSpent)}/${f0(s.tpEnd)}`],
    ["SP 얻음 / 씀 / 남음", (s) => `${f0(s.spGain)}/${f0(s.spSpent)}/${f0(s.spEnd)}`],
    ["보상 건너뛰기 · 상담 구매/강화/삭제", (s) => `${f1(s.rewardSkips)} · ${f1(s.consultBuys)}/${f1(s.consultUpgrades)}/${f1(s.consultDeletes)}`],
    ["레슨 1회 카드 수 / 행동 수", (s) => `${f1(s.playsPerLesson)} / ${f1(s.actionsPerLesson)}`],
    [`레슨 1회 시간 추정 (행동당 ${SEC_PER_ACTION}초)`, (s) => `${f1(s.minutesPerLesson)}분`],
    ["런당 단계 수 · 시간(ms)", (s) => `${f0(s.stepsPerRun)} · ${s.ms}`],
  ];
  const head = ["지표", ...sums.map((s) => s.policy)];
  const table = [head, ...rows.map(([label, fn]) => [label, ...sums.map(fn)])];
  const width = (str) => [...String(str)].reduce((a, ch) => a + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 2 : 1), 0);
  const cols = head.map((_, c) => Math.max(...table.map((r) => width(r[c]))));
  const pad = (str, w, right) => {
    const sp = " ".repeat(Math.max(0, w - width(str)));
    return right ? sp + str : str + sp;
  };
  console.log(`lesson_sim: ${args.runs} runs/방침, seed ${args.seed}, formation ${args.formation || "기본"}, 경기 ${args.match ? "match.simulateAuto" : "없음 (1:0 승)"}, 특별 선택 ${args.specialRate < 1 ? `${args.specialRate} (시뮬 옵션)` : "감독 AI (늘)"}`);
  for (const r of table) console.log(r.map((x, c) => pad(String(x), cols[c], c > 0)).join("  "));
  const names = sums[0].mains.map((x) => `${x.name}(${x.position})`).join(", ");
  console.log(`\n선수별 주 스탯 상승 순서: ${names}`);
  console.log("구역 방식 (§14). 보정 시뮬 tools/drafts/zone_sim.mjs 와 다른 점: 감독 AI 가 실제 후보 점(dropCandidates)으로 원을 놓는다 · 레슨 실패 · 상담 · 경기가 있다.");
  console.log("고르게 크기 = 런 동안 포지션 주 스탯 2개 상승의 선수별 평균 → 최저 / 최고. 수치는 조정하지 않았다 (보고만).");
  if (!(args.specialRate < 1)) console.log("일반 레슨 점수: 감독 AI 는 레슨 주마다 특별 구역을 고르므로 비어 있다 → --special-rate 0.7 로 잰다 (보정 시뮬과 같은 비율).");
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const data = loadData();
  const policies = args.policy === "all" ? POLICIES : [args.policy];
  const sums = policies.map((p) => summarize(data, args, p));
  if (args.json) console.log(JSON.stringify({ args, results: sums }, null, 2));
  else printTable(sums, args);
  return sums;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
