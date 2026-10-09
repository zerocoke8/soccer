#!/usr/bin/env node
// tools/hex_sim.mjs — 육각 오토배틀 엔진 (js/engine/hexMatch.js) 헤드리스 경기 시뮬 (HEX_AUTOBATTLE_PLAN §6.5, H0 · H3)
//   node tools/hex_sim.mjs --matches 300 --seed 1 [--json] [--set a.b=v ...] [--old] [--mirror] [--noult] [--compare]
// 경기마다: 홈 = run.createRun({ seed: "hexsim-<seed>-<i>" }) 의 기본 편성을 "시즌 2 쯤" 으로 키운 팀
//   (능력치 × HOME_GROWTH, statCap 에서 자름, 팀워크 HOME_TEAMWORK — 시즌 2 상대의 평균 능력치 · 팀워크와 비슷하게),
//   원정 = 상대 i % 6 (run.buildOpponentSnapshot), kind = 짝수 i 골 매치 · 홀수 i 친선.
// 출력: 경기당 평균 · 비율 (골 · 슛 · 선방 · 패스 · 가로채기 · 크로스 · 헤더 · 태클 · 드리블 돌파 · 흘러나온 공 · 포제션 ·
//   지키기 비율 · 골든골 · 승부차기 · 추가시간 · 홈 승무패 · 턴 · 경기당 ms) + 규칙 위반 검사 (한 턴 1칸 · 한 칸 한 명 · 판 안 · GK 구역).
// --old : 같은 셋업을 예전 턴제 엔진 (match.js, 셋업의 포제션 수) 으로도 돌려 골 · 슛 · 겨루기를 나란히 ("전/후").
// --mirror : 같은 팀끼리 (홈 스냅샷 vs 그 복제본을 원정으로, 선수 id 앞에 "m_") — 홈 승 / 무 / 원정 승 · 팀별 골 · 슛으로
//   판 · 엔진의 좌우 치우침을 본다 (같은 팀이니 기대값은 반반, 차이는 킥오프 · 승부차기 선축 같은 정해진 규칙 몫 + 운).
// --set : data.config 값을 메모리에서 덮어쓴다 (예: --set hexMatch.tackleCoef=1.5). 파일은 바꾸지 않는다.
// 필살기 (H3): 양쪽 모두 AI 규칙으로 켠다 (hexMatch.setAutoBoth — 문서 §3 "시뮬은 AI 규칙"). 필살기 표 = 편별 · 유형별 · 필살기별
//   경기당 사용 (필살기 선수 1명당), 합체기, 역컷인. 목표: 필살기 선수마다 경기당 1 ~ 2번.
// --noult : 아무도 필살기를 켜지 않는다 (= H2 엔진과 같은 흐름). --compare : 같은 경기를 필살기 없이도 돌려 골 · 승률 전/후.
// 숫자는 보고만 한다 (밸런스는 나중에 한 번에 — 문서 §6.5).
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";
import * as U from "../js/engine/hexUlt.js";
import { loadData, applyConfigOverrides, table, isEntry } from "./sim.mjs";

const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
/** 홈 팀 성장 배율: 시작 편성 평균 능력치 합 ≈ 1190 → 시즌 2 상대 평균 ≈ 2150 (× 1.8) */
export const HOME_GROWTH = 1.8;
/** 홈 팀워크 (시즌 2 상대 기본 팀워크 50 과 같게) */
export const HOME_TEAMWORK = 50;

export function parseArgs(argv) {
  const out = { matches: 300, seed: 1, json: false, sets: [], old: false, mirror: false, noUlt: false, compare: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--matches") out.matches = Math.max(1, parseInt(argv[++i], 10) || 300);
    else if (a === "--seed") out.seed = argv[++i] ?? 1;
    else if (a === "--json") out.json = true;
    else if (a === "--set") out.sets.push(argv[++i] || "");
    else if (a === "--old") out.old = true;
    else if (a === "--mirror") out.mirror = true;
    else if (a === "--noult") out.noUlt = true;
    else if (a === "--compare") out.compare = true;
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/hex_sim.mjs --matches N --seed S [--json] [--set a.b=v ...] [--old] [--mirror] [--noult] [--compare]");
      process.exit(0);
    }
  }
  return out;
}

/** 미러 원정: 홈 스냅샷 복제 (선수 id 앞에 "m_", 이름만 바꿈 — 능력치 · 전술 · 스타일 그대로) */
export function mirrorTeam(home) {
  const away = JSON.parse(JSON.stringify(home));
  away.name = "미러 " + (home.name || "팀");
  for (const p of away.players) p.id = "m_" + p.id;
  if (away.tactics && away.tactics.kickoffPlayerId != null) away.tactics.kickoffPlayerId = "m_" + away.tactics.kickoffPlayerId;
  return away;
}

/** i 번째 경기 셋업 (홈 · 원정 스냅샷 · kind · 시드 · 예전 엔진 포제션 수). mirror = 원정도 홈 복제 */
export function matchSetup(data, seed, i, mirror = false) {
  const cfg = data.config;
  const state = run.createRun({ data, seed: `hexsim-${seed}-${i}` });
  for (const p of state.players) for (const s of STATS) p.stats[s] = Math.min(cfg.statCap, Math.round(p.stats[s] * HOME_GROWTH));
  state.teamwork = HOME_TEAMWORK;
  const home = run.buildTeamSnapshot(state, data);
  const opp = data.opponents[i % data.opponents.length];
  const away = mirror ? mirrorTeam(home) : run.buildOpponentSnapshot(opp, data);
  const kind = i % 2 === 0 ? "goal" : "friendly";
  const possessions = kind === "goal" ? cfg.goalMatch.possessions[Math.max(0, Math.min(2, (opp.season || 1) - 1))] : cfg.friendly.possessions;
  return { home, away, kind, seed: `hexsim-${seed}-${i}`, possessions, opponentId: mirror ? "mirror" : opp.id };
}

/**
 * 규칙 위반 검사 (한 step 전후). prev = 이전 상태의 pos 사본 (null 이면 이동 검사 생략).
 * @returns {string[]} 위반 설명
 */
export function checkRules(ms, prevPos, kickoffTurn) {
  const out = [];
  const seen = new Set();
  for (const side of ["home", "away"]) {
    for (const [id, cell] of Object.entries(ms.pos[side])) {
      if (!G.isCell(cell)) out.push(`판 밖 ${side}:${id} ${cell}`);
      if (seen.has(cell)) out.push(`한 칸 두 명 ${cell}`);
      seen.add(cell);
      if (ms.roles[side][id] === "GK" && !G.inBox(cell, side === "home" ? -1 : 1)) out.push(`GK 구역 밖 ${side}:${id} ${cell}`);
      if (prevPos && !kickoffTurn && G.distance(prevPos[side][id], cell) > 1) out.push(`한 턴 2칸 이상 ${side}:${id} ${prevPos[side][id]}→${cell}`);
    }
  }
  return out;
}

function newAcc() {
  return { n: 0, sum: {}, ms: 0, maxTurnsBeforePk: 0, violations: 0, violationSamples: [], old: { n: 0, sum: {} }, base: { n: 0, sum: {} }, ult: newUltAcc() };
}
function newUltAcc() {
  return { holders: { home: 0, away: 0 }, uses: { home: 0, away: 0 }, byType: {}, bySkill: {}, combos: 0, reverse: {}, zeroHolders: 0, holderMatches: 0, hist: {} };
}
function add(o, k, v) {
  o[k] = (o[k] || 0) + v;
}

/** 육각 경기 한 판 → 지표 */
export function hexMatchMetrics(ms) {
  const r = hex.getResult(ms);
  const st = r.stats;
  const both = (k) => st.home[k] + st.away[k];
  const ev = ms.events;
  const count = (t) => ev.filter((e) => e.type === t).length;
  return {
    goals: r.homeGoals + r.awayGoals,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    shots: both("shots") - (ms.penalties ? ms.penalties.kicks.length : 0),
    homeShots: st.home.shots - (ms.penalties ? ms.penalties.kicks.filter((k) => k.side === "home").length : 0),
    awayShots: st.away.shots - (ms.penalties ? ms.penalties.kicks.filter((k) => k.side === "away").length : 0),
    homeRecv: ev.filter((e) => e.type === "receive" && e.side === "home").length,
    awayRecv: ev.filter((e) => e.type === "receive" && e.side === "away").length,
    regHomeWin: r.homeGoals > r.awayGoals ? 1 : 0,
    regAwayWin: r.awayGoals > r.homeGoals ? 1 : 0,
    saves: both("saves"),
    passes: both("passes"),
    passesCompleted: both("passesCompleted"),
    interceptions: both("interceptions"),
    interceptRolls: count("intercept"),
    crosses: both("crosses"),
    headers: both("headers"),
    tackles: both("tackles"),
    tacklesWon: both("tacklesWon"),
    dribblesPast: both("dribblesPast"),
    loose: count("loose"),
    looseWon: both("looseWon"),
    possessions: r.possessionsPlayed,
    holdTurns: both("holdTurns"),
    carrierTurns: both("carrierTurns"),
    duels: count("tackle") + count("intercept") + count("aerial") + count("shot"),
    duelsWon: both("duelsWon"),
    golden: ev.some((e) => e.type === "goldenGoal") ? 1 : 0,
    penalties: r.penalties ? 1 : 0,
    addedTime: ms.addedTime ? 1 : 0,
    homeWin: r.winner === "home" ? 1 : 0,
    draw: r.winner === "draw" ? 1 : 0,
    awayWin: r.winner === "away" ? 1 : 0,
    turns: r.turnsPlayed,
  };
}

/**
 * 필살기 집계 (한 판): 필살기 선수 수 · 쓴 수 (편별 · 유형별 · 필살기별) · 합체기 · 역컷인 종류.
 * hist = 필살기 선수 한 명이 그 경기에 쓴 횟수 분포.
 */
export function addUltMetrics(ua, ms, data) {
  const cut = ms.events.filter((e) => e.type === "cutin");
  for (const side of ["home", "away"]) {
    for (const p of ms[side].players) {
      const sk = U.ultSkillOf(data, p);
      if (!sk) continue;
      ua.holders[side] += 1;
      const n = cut.filter((e) => e.side === side && e.playerId === p.id).length;
      const b = ua.bySkill[sk.id] || (ua.bySkill[sk.id] = { name: sk.name, type: sk.ultimate.type, holders: 0, uses: 0 });
      b.holders += 1;
      b.uses += n;
      ua.holderMatches += 1;
      if (n === 0) ua.zeroHolders += 1;
      const k = Math.min(n, 4);
      ua.hist[k] = (ua.hist[k] || 0) + 1;
    }
  }
  for (const e of cut) {
    ua.uses[e.side] += 1;
    ua.byType[e.ultimateType] = (ua.byType[e.ultimateType] || 0) + 1;
  }
  ua.combos += ms.events.filter((e) => e.type === "combo").length;
  for (const e of ms.events) if (e.reverseCutin) ua.reverse[e.reverseCutin.kind] = (ua.reverse[e.reverseCutin.kind] || 0) + 1;
}

/** 육각 한 판을 끝까지 (acc 가 있으면 규칙 검사). noUlt = 아무도 필살기를 켜지 않음, 아니면 양쪽 AI */
function playHex(data, su, noUlt, acc, i) {
  const ms = hex.createMatch({ data, seed: su.seed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind });
  if (noUlt) ms.aiSides = [];
  else hex.setAutoBoth(ms);
  let guard = 0;
  while (!ms.finished) {
    if (++guard > 5000) throw new Error(`hex_sim: 경기 ${i} 가 끝나지 않습니다`);
    const prev = { home: { ...ms.pos.home }, away: { ...ms.pos.away } };
    const evN = ms.events.length;
    const stage = ms.stage;
    hex.step(ms, data);
    if (stage === "penalties" || !acc) continue;
    const kick = ms.events.slice(evN).some((e) => e.type === "kickoff");
    const v = checkRules(ms, prev, kick);
    if (v.length) {
      acc.violations += v.length;
      if (acc.violationSamples.length < 5) acc.violationSamples.push(`경기 ${i} 턴 ${ms.turn}: ${v[0]}`);
    }
    acc.maxTurnsBeforePk = Math.max(acc.maxTurnsBeforePk, ms.turn); // 승부차기로 넘어가는 턴도 센다 (그 턴은 실제로 뛴 턴)
  }
  return ms;
}

/** 예전 엔진 한 판 → 골 · 슛 · 겨루기 */
function oldMatchMetrics(ms) {
  const r = match.getResult(ms);
  const judged = ms.events.filter((e) => ["duel", "goal", "turnover", "save"].includes(e.type) && typeof e.p === "number" && !e.distribution).length;
  return {
    goals: r.homeGoals + r.awayGoals,
    shots: r.stats.home.shots + r.stats.away.shots - (ms.penalties ? ms.penalties.kicks.length : 0),
    duels: judged,
    duelsWon: r.stats.home.duelsWon + r.stats.away.duelsWon,
    homeWin: r.winner === "home" ? 1 : 0,
    draw: r.winner === "draw" ? 1 : 0,
    penalties: r.penalties ? 1 : 0,
  };
}

/** 시뮬 본체 (data 는 override 가 적용된 번들) */
export function runHexSim(data, args) {
  const acc = newAcc();
  const t0 = Date.now();
  for (let i = 0; i < args.matches; i++) {
    const su = matchSetup(data, args.seed, i, args.mirror);
    const m0 = Date.now();
    const ms = playHex(data, su, args.noUlt, acc, i);
    acc.ms += Date.now() - m0;
    acc.n += 1;
    for (const [k, v] of Object.entries(hexMatchMetrics(ms))) add(acc.sum, k, v);
    addUltMetrics(acc.ult, ms, data);
    if (args.compare && !args.noUlt) {
      const bm = playHex(data, su, true, null, i);
      acc.base.n += 1;
      for (const [k, v] of Object.entries(hexMatchMetrics(bm))) add(acc.base.sum, k, v);
    }
    if (args.old && !args.mirror) {
      const om = match.createMatch({ data, seed: su.seed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind });
      match.simulateAuto(om, data);
      acc.old.n += 1;
      for (const [k, v] of Object.entries(oldMatchMetrics(om))) add(acc.old.sum, k, v);
    }
  }
  return summarize(acc, args, Date.now() - t0);
}

function summarize(acc, args, ms) {
  const n = acc.n || 1;
  const s = acc.sum;
  const per = (k) => (s[k] || 0) / n;
  const ratio = (a, b) => ((s[b] || 0) ? (s[a] || 0) / s[b] : 0);
  const out = {
    matches: acc.n,
    seed: args.seed,
    sets: args.sets,
    mirror: !!args.mirror,
    noUlt: !!args.noUlt,
    ms,
    msPerMatch: acc.ms / n,
    goals: per("goals"),
    homeGoals: per("homeGoals"),
    awayGoals: per("awayGoals"),
    shots: per("shots"),
    homeShots: per("homeShots"),
    awayShots: per("awayShots"),
    homeReceives: per("homeRecv"),
    awayReceives: per("awayRecv"),
    regHomeWin: per("regHomeWin"),
    regAwayWin: per("regAwayWin"),
    saves: per("saves"),
    goalPerShot: ratio("goals", "shots"),
    passes: per("passes"),
    completion: ratio("passesCompleted", "passes"),
    interceptions: per("interceptions"),
    interceptRolls: per("interceptRolls"),
    crosses: per("crosses"),
    headers: per("headers"),
    tackles: per("tackles"),
    tackleWin: ratio("tacklesWon", "tackles"),
    dribblesPast: per("dribblesPast"),
    loose: per("loose"),
    looseWon: per("looseWon"),
    possessions: per("possessions"),
    holdPct: ratio("holdTurns", "carrierTurns"),
    duels: per("duels"),
    duelsWon: per("duelsWon"),
    goldenRate: per("golden"),
    penaltyRate: per("penalties"),
    addedTimeRate: per("addedTime"),
    homeWin: per("homeWin"),
    draw: per("draw"),
    awayWin: per("awayWin"),
    turns: per("turns"),
    maxTurnsBeforePk: acc.maxTurnsBeforePk,
    violations: acc.violations,
    violationSamples: acc.violationSamples,
    ult: summarizeUlt(acc.ult, n),
  };
  if (acc.base.n) {
    const b = acc.base.sum;
    const bn = acc.base.n;
    const bper = (k) => (b[k] || 0) / bn;
    out.base = {
      matches: bn,
      goals: bper("goals"), homeGoals: bper("homeGoals"), awayGoals: bper("awayGoals"),
      shots: bper("shots"), goalPerShot: b.shots ? b.goals / b.shots : 0,
      homeWin: bper("homeWin"), draw: bper("draw"), awayWin: bper("awayWin"),
      goldenRate: bper("golden"), penaltyRate: bper("penalties"), duels: bper("duels"),
    };
  }
  if (acc.old.n) {
    const o = acc.old.sum;
    const on = acc.old.n;
    out.old = {
      matches: on,
      goals: (o.goals || 0) / on,
      shots: (o.shots || 0) / on,
      goalPerShot: o.shots ? o.goals / o.shots : 0,
      duels: (o.duels || 0) / on,
      duelsWon: (o.duelsWon || 0) / on,
      homeWin: (o.homeWin || 0) / on,
      draw: (o.draw || 0) / on,
      penaltyRate: (o.penalties || 0) / on,
    };
  }
  return out;
}

/** 필살기 집계 → 경기당 · 선수당 숫자 */
function summarizeUlt(ua, n) {
  const holders = ua.holders.home + ua.holders.away;
  const uses = ua.uses.home + ua.uses.away;
  const bySkill = Object.entries(ua.bySkill)
    .map(([id, b]) => ({ id, name: b.name, type: b.type, holderMatches: b.holders, perHolder: b.holders ? b.uses / b.holders : 0 }))
    .sort((a, b) => U.ULT_TYPES.indexOf(a.type) - U.ULT_TYPES.indexOf(b.type) || a.id.localeCompare(b.id));
  const byType = {};
  for (const t of U.ULT_TYPES) {
    const hm = bySkill.filter((x) => x.type === t).reduce((a, x) => a + x.holderMatches, 0);
    byType[t] = { perMatch: (ua.byType[t] || 0) / n, perHolder: hm ? (ua.byType[t] || 0) / hm : 0 };
  }
  const hist = {};
  for (const [k, v] of Object.entries(ua.hist)) hist[k] = ua.holderMatches ? v / ua.holderMatches : 0;
  return {
    usesPerMatch: uses / n,
    homeUses: ua.uses.home / n,
    awayUses: ua.uses.away / n,
    homeHolders: ua.holders.home / n,
    awayHolders: ua.holders.away / n,
    perHolder: holders ? uses / holders : 0,
    homePerHolder: ua.holders.home ? ua.uses.home / ua.holders.home : 0,
    awayPerHolder: ua.holders.away ? ua.uses.away / ua.holders.away : 0,
    zeroRate: ua.holderMatches ? ua.zeroHolders / ua.holderMatches : 0,
    hist,
    byType,
    bySkill,
    combos: ua.combos / n,
    reverse: Object.fromEntries(Object.entries(ua.reverse).map(([k, v]) => [k, v / n])),
  };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-");

export function printHexSummary(s) {
  console.log(`hex_sim: ${s.matches} matches, seed ${s.seed}, ${s.ms} ms (${fmt(s.msPerMatch, 1)} ms/경기)`);
  if (s.sets.length) console.log(`overrides: ${s.sets.join(" ")}`);
  console.log(s.mirror
    ? "\n[육각 경기 · 미러]  (홈 = 시즌 2 쯤으로 키운 기본 편성, 원정 = 그 복제본, 짝수 판 골 매치 · 홀수 판 친선)"
    : "\n[육각 경기]  (홈 = 시즌 2 쯤으로 키운 기본 편성, 원정 = 상대 6팀 순환, 짝수 판 골 매치 · 홀수 판 친선)");
  const o = s.old;
  const rows = [
    ["지표", "육각", "확인 범위"],
    ["골/경기 (홈/원정)", `${fmt(s.goals)} (${fmt(s.homeGoals)}/${fmt(s.awayGoals)})`, "2~7"],
    ["슛/경기 (선방)", `${fmt(s.shots)} (${fmt(s.saves)})`, "8~35"],
    ["슛당 골", pct(s.goalPerShot), ""],
    ["패스/경기 (성공률)", `${fmt(s.passes)} (${pct(s.completion)})`, "55~90%"],
    ["가로채기/경기 (굴림)", `${fmt(s.interceptions)} (${fmt(s.interceptRolls)})`, ""],
    ["크로스 / 헤더 /경기", `${fmt(s.crosses)} / ${fmt(s.headers)}`, ""],
    ["태클/경기 (수비 성공률)", `${fmt(s.tackles)} (${pct(s.tackleWin)})`, ""],
    ["드리블 돌파/경기", fmt(s.dribblesPast), ""],
    ["흘러나온 공/경기 (주운 수)", `${fmt(s.loose)} (${fmt(s.looseWon)})`, ""],
    ["포제션/경기", fmt(s.possessions, 1), ">= 20"],
    ["지키기 / 공 가진 턴", pct(s.holdPct), "< 30%"],
    ["겨루기/경기 (승)", `${fmt(s.duels, 1)} (${fmt(s.duelsWon, 1)})`, ""],
    ["골든골 / 승부차기 / 추가시간", `${pct(s.goldenRate)} / ${pct(s.penaltyRate)} / ${pct(s.addedTimeRate)}`, ""],
    ["홈 승 / 무 / 패", `${pct(s.homeWin)} / ${pct(s.draw)} / ${pct(s.awayWin)}`, ""],
    ["턴/경기 (승부차기 전 최대)", `${fmt(s.turns, 1)} (${s.maxTurnsBeforePk})`, "<= 400"],
    ["규칙 위반 (1칸 · 한 칸 한 명 · GK 구역)", String(s.violations), "0"],
  ];
  console.log(table(rows));
  if (s.violationSamples.length) console.log("위반 예: " + s.violationSamples.join(" / "));
  if (s.mirror) {
    console.log("\n[좌우 치우침]  (같은 팀끼리 — 홈 = 오른쪽 골 공격 · 원정 = 왼쪽 골 공격. 홈 킥오프 · 승부차기 홈 선축은 정해진 규칙)");
    console.log(table([
      ["지표", "홈", "원정"],
      ["승 (최종, 승부차기 포함)", pct(s.homeWin), pct(s.awayWin)],
      ["무 (친선)", pct(s.draw), ""],
      ["정규 + 연장 스코어 승", pct(s.regHomeWin), pct(s.regAwayWin)],
      ["골/경기", fmt(s.homeGoals), fmt(s.awayGoals)],
      ["슛/경기", fmt(s.homeShots), fmt(s.awayShots)],
      ["패스 받음/경기", fmt(s.homeReceives, 1), fmt(s.awayReceives, 1)],
    ]));
  }
  const u = s.ult;
  if (u) {
    const who = s.mirror ? "양 팀 = 기본 편성 7명" : "홈 = 기본 편성 7명, 원정 = 상대 (보스만 필살기)";
    console.log(`\n[필살기]  (${who} — AI 규칙 양쪽${s.noUlt ? ", --noult: 아무도 켜지 않음" : ""})`);
    const histTxt = [0, 1, 2, 3, 4].map((k) => `${k === 4 ? "4+" : k}번 ${pct(u.hist[k] || 0)}`).join(" · ");
    console.log(table([
      ["지표", "값", "목표"],
      ["필살기/경기 (홈/원정)", `${fmt(u.usesPerMatch)} (${fmt(u.homeUses)}/${fmt(u.awayUses)})`, ""],
      ["필살기 선수/경기 (홈/원정)", `${fmt(u.homeHolders, 1)} / ${fmt(u.awayHolders, 1)}`, ""],
      ["선수 1명당/경기 (홈/원정)", `${fmt(u.perHolder)} (${fmt(u.homePerHolder)}/${fmt(u.awayPerHolder)})`, "1~2"],
      ["선수 1명이 쓴 횟수 분포", histTxt, ""],
      ["합체기/경기", fmt(u.combos), ""],
      ["역컷인/경기 (세이브 · 블록 · 패스 차단)", `${fmt(u.reverse.save || 0)} · ${fmt(u.reverse.block || 0)} · ${fmt(u.reverse.passCut || 0)}`, ""],
    ]));
    console.log(table([
      ["유형", "경기당", "선수 1명당"],
      ...U.ULT_TYPES.map((t) => [U.ULT_TYPE_TEXT[t], fmt(u.byType[t].perMatch), fmt(u.byType[t].perHolder)]),
    ]));
    console.log(table([
      ["필살기", "유형", "선수-경기", "선수 1명당/경기"],
      ...u.bySkill.map((x) => [x.name, U.ULT_TYPE_TEXT[x.type], String(x.holderMatches), fmt(x.perHolder)]),
    ]));
  }
  const bs = s.base;
  if (bs) {
    console.log("\n[필살기 전/후]  (같은 경기 — 전 = 아무도 필살기를 켜지 않음 (H2 흐름), 후 = AI 양쪽 필살기)");
    console.log(table([
      ["지표", "전 (필살기 없음)", "후 (필살기)"],
      ["골/경기 (홈/원정)", `${fmt(bs.goals)} (${fmt(bs.homeGoals)}/${fmt(bs.awayGoals)})`, `${fmt(s.goals)} (${fmt(s.homeGoals)}/${fmt(s.awayGoals)})`],
      ["슛/경기", fmt(bs.shots), fmt(s.shots)],
      ["슛당 골", pct(bs.goalPerShot), pct(s.goalPerShot)],
      ["겨루기/경기", fmt(bs.duels, 1), fmt(s.duels, 1)],
      ["홈 승 / 무 / 패", `${pct(bs.homeWin)} / ${pct(bs.draw)} / ${pct(bs.awayWin)}`, `${pct(s.homeWin)} / ${pct(s.draw)} / ${pct(s.awayWin)}`],
      ["골든골 / 승부차기", `${pct(bs.goldenRate)} / ${pct(bs.penaltyRate)}`, `${pct(s.goldenRate)} / ${pct(s.penaltyRate)}`],
    ]));
  }
  if (o) {
    console.log("\n[전/후]  (같은 셋업 — 전 = 예전 턴제 match.js · 셋업의 포제션 수, 후 = 육각)");
    console.log(table([
      ["지표", "전 (턴제)", "후 (육각)"],
      ["골/경기", fmt(o.goals), fmt(s.goals)],
      ["슛/경기", fmt(o.shots), fmt(s.shots)],
      ["슛당 골", pct(o.goalPerShot), pct(s.goalPerShot)],
      ["겨루기/경기", fmt(o.duels, 1), fmt(s.duels, 1)],
      ["겨루기 승/경기 (duelsWon)", fmt(o.duelsWon, 1), fmt(s.duelsWon, 1)],
      ["홈 승 / 무", `${pct(o.homeWin)} / ${pct(o.draw)}`, `${pct(s.homeWin)} / ${pct(s.draw)}`],
      ["승부차기", pct(o.penaltyRate), pct(s.penaltyRate)],
    ]));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadData();
  applyConfigOverrides(data.config, args.sets);
  const summary = runHexSim(data, args);
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else printHexSummary(summary);
}

if (isEntry(import.meta.url)) {
  main();
  process.exitCode = 0;
}
