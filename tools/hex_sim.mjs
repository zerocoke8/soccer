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
// --practice : 연습 경기 미러 (js/ui/practice.js practiceSetup — 화면과 같은 셋업: 기본 선수단 vs 그 거울, 친선). config.practice 블록
//   (시즌 3 잘 키운 팀 — stats · teamwork) 은 practice.js 가 씌운다. --set practice=null 이면 시작 스탯 그대로 (= × 1.0).
// --growth X : 런 시뮬 홈 (기본 · --mirror) 성장 배율 (기본 HOME_GROWTH 1.8).
// [경기 흐름] 표 (기획 2026-10-10 "롱패스 · 롱슛 · 크로스가 없고 골대 앞에서 허우적거린다"): 긴 패스 (노린 칸 ≥ 6칸) · 성공률 ·
//   띄운 패스 · 크로스 · 헤더 · 슛 박스 안 / 밖 · 평균 슛 거리 · 박스 밖 골 비율 · GK ↔ DF 핑퐁 (자기 1/3 안) · GK 백패스 ·
//   박스 붐빔 (공이 공격 1/3 일 때 공격받는 골 3칸 안 양 팀 인원) · 박스 안 공 가진 턴 중 슛 안 한 턴 · 박스 안 태클 · 포제션당 턴.
//   엔진 동작은 바꾸지 않는다 (이벤트 · 턴 시작 상태만 읽는다 — 주사위 · 상태를 건드리지 않음).
// 숫자는 보고만 한다 (밸런스는 나중에 한 번에 — 문서 §6.5).
import fs from "node:fs";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";
import * as U from "../js/engine/hexUlt.js";
import * as lessonRun from "../js/engine/lessonRun.js";
import { practiceSetup } from "../js/ui/practice.js";
import { loadData, applyConfigOverrides, table, isEntry } from "./sim.mjs";

const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
/** 홈 팀 성장 배율: 시작 편성 평균 능력치 합 ≈ 1190 → 시즌 2 상대 평균 ≈ 2150 (× 1.8) */
export const HOME_GROWTH = 1.8;
/** 홈 팀워크 (시즌 2 상대 기본 팀워크 50 과 같게) */
export const HOME_TEAMWORK = 50;

export function parseArgs(argv) {
  const out = { matches: 300, seed: 1, json: false, sets: [], old: false, mirror: false, noUlt: false, compare: false, practice: false, growth: HOME_GROWTH };
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
    else if (a === "--practice") out.practice = true;
    else if (a === "--growth") {
      const g = Number(argv[++i]);
      out.growth = Number.isFinite(g) && g > 0 ? g : HOME_GROWTH;
    }
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/hex_sim.mjs --matches N --seed S [--json] [--set a.b=v ...] [--old] [--mirror] [--practice] [--growth X] [--noult] [--compare]");
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
export function matchSetup(data, seed, i, mirror = false, growth = HOME_GROWTH) {
  const cfg = data.config;
  const state = run.createRun({ data, seed: `hexsim-${seed}-${i}` });
  for (const p of state.players) for (const s of STATS) p.stats[s] = Math.min(cfg.statCap, Math.round(p.stats[s] * growth));
  state.teamwork = HOME_TEAMWORK;
  const home = run.buildTeamSnapshot(state, data);
  const opp = data.opponents[i % data.opponents.length];
  const away = mirror ? mirrorTeam(home) : run.buildOpponentSnapshot(opp, data);
  const kind = i % 2 === 0 ? "goal" : "friendly";
  const possessions = kind === "goal" ? cfg.goalMatch.possessions[Math.max(0, Math.min(2, (opp.season || 1) - 1))] : cfg.friendly.possessions;
  return { home, away, kind, seed: `hexsim-${seed}-${i}`, possessions, opponentId: mirror ? "mirror" : opp.id };
}

/** 연습 미러에 필요한 레슨 데이터 (lessonRun.createRun — cards · lesson · policies, 레슨 이벤트 파일은 있으면) 를 번들에 더한다 */
const PRACTICE_FILES = ["cards", "lesson", "policies", "lesson_ev_surprise", "lesson_ev_week", "lesson_ev_story", "lesson_ev_fixed", "lesson_ev_new_a", "lesson_ev_new_b", "lesson_ev_coach"];
export function addPracticeData(data) {
  for (const n of PRACTICE_FILES) {
    if (data[n]) continue;
    const u = new URL(`../data/${n}.json`, import.meta.url);
    if (fs.existsSync(u)) data[n] = JSON.parse(fs.readFileSync(u, "utf8"));
  }
  return data;
}

/**
 * i 번째 연습 미러 셋업 = 화면과 같은 js/ui/practice.js practiceSetup (친선). config.practice 블록 (시즌 3 잘 키운 팀) 은 practice.js 가
 * 씌운다 — 시뮬은 따로 씌우지 않는다 (같은 길 하나). 블록 없이 보려면 --set practice=null (시작 스탯 = × 1.0).
 */
export function practiceMatchSetup(data, seed, i) {
  const su = practiceSetup(lessonRun, data, `hexsim-${seed}-${i}`);
  return { home: su.home, away: su.away, kind: su.kind, seed: su.seed, possessions: su.possessions, opponentId: "practice" };
}

/* ------------------------------------------------------------------ */
/* [경기 흐름] 지표 (스펙 B.1) — 이벤트 · 턴 시작 상태만 읽는다              */
/* ------------------------------------------------------------------ */

/** 긴 패스 = 노린 칸까지 이 거리 이상 */
export const LONG_PASS_MIN = 6;
/** 자기 1/3 = 자기 진영 열 0 ~ 이 값 (15칸 판의 0 ~ 4) */
export const OWN_THIRD_MAX = 4;
/** 공격 1/3 = 자기 진영 열 이 값 이상 (10 ~ 14) */
export const FINAL_THIRD_MIN = 10;
/** 박스 붐빔 = 공격받는 골까지 거리 이 값 이하 칸의 선수 수 */
export const CROWD_RADIUS = 3;

const sideDir = (side) => (side === "home" ? 1 : -1);
const otherOf = (side) => (side === "home" ? "away" : "home");
/** 자기 진영 열 (엔진 ocOf 와 같은 식 — 홈 c, 원정 거울 열) */
function ocOfCell(cell, side) {
  const [c, r] = G.cellCR(cell);
  return side === "home" ? c : G.mirrorCR(c, r)[0];
}

export function newFlowAcc() {
  return {
    passes: 0, passDist: 0, passHist: { "1-3": 0, "4-5": 0, "6-8": 0, "9+": 0 }, passDone: 0,
    longPasses: 0, longDone: 0, lofted: 0, loftedDone: 0, crosses: 0, crossDone: 0, headers: 0, headerGoals: 0,
    shots: 0, shotsBox: 0, shotsOut: 0, shotDist: 0, goals: 0, goalsOut: 0, outShotP: 0,
    gkPasses: 0, gkPassDist: 0, gkToDF: 0, gkLong: 0, backToGk: 0, pingPong: 0, pingPongSeq: 0, pingPongSeqLen: 0,
    crowdSamples: 0, crowdAll: 0, crowdAtk: 0, crowdDef: 0, nearOpp: 0, ownThirdTurns: 0,
    boxTurns: 0, boxShot: 0, boxPass: 0, boxLost: 0, boxOther: 0,
    tackles: 0, tacklesBox: 0, tacklesFinal: 0, turns: 0, possessions: 0, ftTurns: 0,
  };
}

/** 턴 시작 (step 전) 상태에서 보는 것: 박스 붐빔 · 박스 안 공 가진 선수 */
export function flowPre(ms) {
  const b = ms.ball;
  const atk = b.holder ? b.holder.side : b.flight ? b.flight.side : null;
  const out = { atk, crowd: null, boxCarrier: null, ownThird: false };
  if (!atk) return out;
  const bc = b.holder ? ms.pos[b.holder.side][b.holder.id] : b.cell;
  out.ownThird = ocOfCell(bc, atk) <= OWN_THIRD_MAX;
  if (ocOfCell(bc, atk) >= FINAL_THIRD_MIN) {
    const dir = sideDir(atk);
    const c = { all: 0, atk: 0, def: 0, nearOpp: 0 };
    for (const cell of Object.values(ms.pos[otherOf(atk)])) if (G.distance(cell, bc) <= 2) c.nearOpp += 1; // 공 2칸 안 상대
    for (const s of ["home", "away"]) {
      for (const cell of Object.values(ms.pos[s])) {
        if (G.distToGoal(cell, dir) > CROWD_RADIUS) continue;
        c.all += 1;
        c[s === atk ? "atk" : "def"] += 1;
      }
    }
    out.crowd = c;
  }
  if (b.holder) {
    const { side, id } = b.holder;
    const cell = ms.pos[side][id];
    if (ms.roles[side][id] !== "GK" && G.distToGoal(cell, sideDir(side)) <= G.BOX_DIST) out.boxCarrier = { side, id };
  }
  return out;
}

/** 턴 끝 (step 뒤): 그 턴 새 이벤트로 박스 안 공 가진 선수가 무엇을 했나 */
export function flowPost(fa, pre, newEvents) {
  fa.ftTurns += 1;
  if (pre.crowd) {
    fa.crowdSamples += 1;
    fa.crowdAll += pre.crowd.all;
    fa.crowdAtk += pre.crowd.atk;
    fa.crowdDef += pre.crowd.def;
    fa.nearOpp += pre.crowd.nearOpp;
  }
  if (pre.ownThird) fa.ownThirdTurns += 1;
  const bc = pre.boxCarrier;
  if (!bc) return;
  fa.boxTurns += 1;
  if (newEvents.some((e) => e.type === "shot" && !e.header && e.side === bc.side && e.playerId === bc.id)) fa.boxShot += 1;
  else if (newEvents.some((e) => e.type === "pass" && e.side === bc.side && e.from === bc.id)) fa.boxPass += 1;
  else if (newEvents.some((e) => e.type === "tackle" && e.carrierId === bc.id && e.success)) fa.boxLost += 1;
  else fa.boxOther += 1;
}

/** 한 판 이벤트 → 패스 · 슛 · GK · 태클 흐름 (승부차기 킥은 shot 이 아니라 penalty 이벤트라 빠진다) */
export function addFlowEvents(fa, ms) {
  const ev = ms.events;
  const r = hex.getResult(ms);
  fa.turns += r.turnsPlayed;
  fa.possessions += r.possessionsPlayed;
  let chain = 0; // 이어진 GK ↔ DF 핑퐁 패스 수 (같은 팀 · 사이에 다른 패스 없음)
  let chainSide = null;
  const closeChain = () => {
    if (chain >= 2) {
      fa.pingPongSeq += 1;
      fa.pingPongSeqLen += chain;
    }
    chain = 0;
    chainSide = null;
  };
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (e.type === "pass") {
      const d = G.distance(e.fromCell, e.intended);
      // 성공 = 이 패스의 비행이 같은 편 받기 (receive) 로 끝남 — 가로채기 · 공중볼 짐 · 흘러나온 공 · 다음 패스 · 킥오프 전에
      let done = false;
      for (let j = i + 1; j < ev.length; j++) {
        const x = ev[j];
        if (x.type === "receive") {
          done = x.side === e.side;
          break;
        }
        if (x.type === "pass" || x.type === "loose" || x.type === "looseWon" || x.type === "kickoff" || x.type === "end"
          || (x.type === "intercept" && x.success) || (x.type === "aerial" && !x.success)) break;
      }
      const fromRole = ms.roles[e.side][e.from];
      const toRole = ms.roles[e.side][e.to];
      fa.passes += 1;
      fa.passDist += d;
      fa.passHist[d <= 3 ? "1-3" : d <= 5 ? "4-5" : d <= 8 ? "6-8" : "9+"] += 1;
      if (done) fa.passDone += 1;
      if (d >= LONG_PASS_MIN) {
        fa.longPasses += 1;
        if (done) fa.longDone += 1;
      }
      if (e.lofted) {
        fa.lofted += 1;
        if (done) fa.loftedDone += 1;
      }
      if (e.cross) {
        fa.crosses += 1;
        if (done) fa.crossDone += 1;
      }
      if (fromRole === "GK") {
        fa.gkPasses += 1;
        fa.gkPassDist += d;
        if (toRole === "DF") fa.gkToDF += 1;
        if (d >= LONG_PASS_MIN) fa.gkLong += 1;
      }
      if (toRole === "GK" && fromRole !== "GK") fa.backToGk += 1;
      const own = ocOfCell(e.fromCell, e.side) <= OWN_THIRD_MAX && ocOfCell(e.intended, e.side) <= OWN_THIRD_MAX;
      const pp = own && ((fromRole === "GK" && toRole === "DF") || (fromRole === "DF" && toRole === "GK"));
      if (pp) {
        fa.pingPong += 1;
        if (chainSide !== e.side) closeChain();
        chain += 1;
        chainSide = e.side;
      } else closeChain();
    } else if (e.type === "shot") {
      fa.shots += 1;
      fa.shotDist += e.dist;
      if (e.box) fa.shotsBox += 1;
      else {
        fa.shotsOut += 1;
        fa.outShotP += e.p;
      }
      if (e.header) fa.headers += 1;
      if (e.success) {
        fa.goals += 1;
        if (!e.box) fa.goalsOut += 1;
        if (e.header) fa.headerGoals += 1;
      }
    } else if (e.type === "tackle") {
      fa.tackles += 1;
      const cs = otherOf(e.side);
      if (G.distToGoal(e.carrierFrom, sideDir(cs)) <= G.BOX_DIST) fa.tacklesBox += 1;
      if (ocOfCell(e.carrierFrom, cs) >= FINAL_THIRD_MIN) fa.tacklesFinal += 1;
    } else if (e.type === "kickoff" || e.type === "end") closeChain();
  }
  closeChain();
}

/** 흐름 집계 → 경기당 · 비율 */
export function summarizeFlow(fa, n) {
  const per = (k) => fa[k] / (n || 1);
  const rt = (a, b) => (b ? a / b : 0);
  return {
    passes: per("passes"),
    meanPassDist: rt(fa.passDist, fa.passes),
    passCompletion: rt(fa.passDone, fa.passes),
    passHist: Object.fromEntries(Object.entries(fa.passHist).map(([k, v]) => [k, rt(v, fa.passes)])),
    longPasses: per("longPasses"),
    longCompletion: rt(fa.longDone, fa.longPasses),
    lofted: per("lofted"),
    loftedCompletion: rt(fa.loftedDone, fa.lofted),
    crosses: per("crosses"),
    crossCompletion: rt(fa.crossDone, fa.crosses),
    headers: per("headers"),
    headerGoals: per("headerGoals"),
    shots: per("shots"),
    shotsBox: per("shotsBox"),
    shotsOut: per("shotsOut"),
    outShotShare: rt(fa.shotsOut, fa.shots),
    meanShotDist: rt(fa.shotDist, fa.shots),
    outShotMeanP: rt(fa.outShotP, fa.shotsOut),
    goals: per("goals"),
    goalsOut: per("goalsOut"),
    outGoalShare: rt(fa.goalsOut, fa.goals),
    gkPasses: per("gkPasses"),
    gkMeanPassDist: rt(fa.gkPassDist, fa.gkPasses),
    gkToDFShare: rt(fa.gkToDF, fa.gkPasses),
    gkLong: per("gkLong"),
    backToGk: per("backToGk"),
    pingPong: per("pingPong"),
    pingPongSeq: per("pingPongSeq"),
    pingPongSeqMeanLen: rt(fa.pingPongSeqLen, fa.pingPongSeq),
    finalThirdTurnShare: rt(fa.crowdSamples, fa.ftTurns),
    boxCrowd: rt(fa.crowdAll, fa.crowdSamples),
    boxCrowdAtk: rt(fa.crowdAtk, fa.crowdSamples),
    boxCrowdDef: rt(fa.crowdDef, fa.crowdSamples),
    nearBallOpp: rt(fa.nearOpp, fa.crowdSamples),
    ownThirdTurnShare: rt(fa.ownThirdTurns, fa.ftTurns),
    boxCarrierTurns: per("boxTurns"),
    boxNoShotTurns: (fa.boxTurns - fa.boxShot) / (n || 1),
    boxShotShare: rt(fa.boxShot, fa.boxTurns),
    boxPass: per("boxPass"),
    boxLost: per("boxLost"),
    boxOther: per("boxOther"),
    tackles: per("tackles"),
    tacklesBox: per("tacklesBox"),
    tacklesFinal: per("tacklesFinal"),
    turnsPerPossession: rt(fa.turns, fa.possessions),
  };
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
  return { n: 0, sum: {}, ms: 0, maxTurnsBeforePk: 0, violations: 0, violationSamples: [], old: { n: 0, sum: {} }, base: { n: 0, sum: {} }, ult: newUltAcc(), flow: newFlowAcc() };
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
    const pre = acc && stage !== "penalties" ? flowPre(ms) : null; // 흐름 지표: 턴 시작 상태 (읽기만)
    hex.step(ms, data);
    if (stage === "penalties" || !acc) continue;
    flowPost(acc.flow, pre, ms.events.slice(evN));
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
  if (args.practice) {
    addPracticeData(data);
    args.practiceBlock = data.config.practice && typeof data.config.practice === "object" ? data.config.practice : null;
  }
  const acc = newAcc();
  const t0 = Date.now();
  for (let i = 0; i < args.matches; i++) {
    const su = args.practice ? practiceMatchSetup(data, args.seed, i) : matchSetup(data, args.seed, i, args.mirror, args.growth ?? HOME_GROWTH);
    const m0 = Date.now();
    const ms = playHex(data, su, args.noUlt, acc, i);
    acc.ms += Date.now() - m0;
    acc.n += 1;
    for (const [k, v] of Object.entries(hexMatchMetrics(ms))) add(acc.sum, k, v);
    addUltMetrics(acc.ult, ms, data);
    addFlowEvents(acc.flow, ms);
    if (args.compare && !args.noUlt) {
      const bm = playHex(data, su, true, null, i);
      acc.base.n += 1;
      for (const [k, v] of Object.entries(hexMatchMetrics(bm))) add(acc.base.sum, k, v);
    }
    if (args.old && !args.mirror && !args.practice) {
      const om = match.createMatch({ data, seed: su.seed, home: su.home, away: su.away, possessions: su.possessions, kind: su.kind });
      match.simulateAuto(om, data);
      acc.old.n += 1;
      for (const [k, v] of Object.entries(oldMatchMetrics(om))) add(acc.old.sum, k, v);
    }
  }
  return summarize(acc, args, Date.now() - t0);
}

function practiceInfo(args) {
  const pr = args.practiceBlock;
  return pr ? { applied: true, label: pr.label || "", teamwork: pr.teamwork ?? null, source: pr.source || "" } : { applied: false, label: "시작 스탯 (× 1.0, config.practice 없음)" };
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
    mirror: !!(args.mirror || args.practice),
    practice: args.practice ? practiceInfo(args) : null,
    growth: args.practice ? null : args.growth ?? HOME_GROWTH,
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
    flow: summarizeFlow(acc.flow, n),
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

/** [경기 흐름] 표 (스펙 B.1 — 목표는 연습 미러 기준) */
export function printFlow(f) {
  if (!f) return;
  console.log(`\n[경기 흐름]  (긴 패스 = 노린 칸 ≥ ${LONG_PASS_MIN}칸 · 자기 1/3 = 자기 진영 열 ≤ ${OWN_THIRD_MAX} · 공격 1/3 = 열 ≥ ${FINAL_THIRD_MIN} · 붐빔 = 공격받는 골 ${CROWD_RADIUS}칸 안 양 팀 (GK 포함))`);
  const h = f.passHist;
  console.log(table([
    ["지표", "값", "목표 (연습 미러)"],
    ["패스/경기 (평균 거리 · 성공률)", `${fmt(f.passes, 1)} (${fmt(f.meanPassDist)}칸 · ${pct(f.passCompletion)})`, ""],
    ["패스 거리 1~3 / 4~5 / 6~8 / 9+", `${pct(h["1-3"])} / ${pct(h["4-5"])} / ${pct(h["6-8"])} / ${pct(h["9+"])}`, ""],
    ["긴 패스/경기 (성공률)", `${fmt(f.longPasses)} (${pct(f.longCompletion)})`, ">= 6 (>= 50%)"],
    ["띄운 패스/경기 (성공률)", `${fmt(f.lofted)} (${pct(f.loftedCompletion)})`, ""],
    ["크로스/경기 (받음) · 헤더 (골)", `${fmt(f.crosses)} (${pct(f.crossCompletion)}) · ${fmt(f.headers)} (${fmt(f.headerGoals)})`, ">= 4"],
    ["슛/경기 박스 안 / 밖 (밖 비율)", `${fmt(f.shotsBox)} / ${fmt(f.shotsOut)} (${pct(f.outShotShare)})`, "밖 >= 30%"],
    ["평균 슛 거리 · 박스 밖 슛 평균 골 확률", `${fmt(f.meanShotDist)}칸 · ${pct(f.outShotMeanP)}`, ""],
    ["박스 밖 골/경기 (골 중 비율)", `${fmt(f.goalsOut)} (${pct(f.outGoalShare)})`, ">= 15%"],
    ["GK 패스/경기 (평균 거리 · DF 에게 · 긴)", `${fmt(f.gkPasses)} (${fmt(f.gkMeanPassDist)}칸 · ${pct(f.gkToDFShare)} · ${fmt(f.gkLong)})`, ""],
    ["GK 백패스/경기", fmt(f.backToGk), "<= 2"],
    ["GK ↔ DF 핑퐁 패스/경기 · 2번 이상 이어진 묶음 (평균 길이)", `${fmt(f.pingPong)} · ${fmt(f.pingPongSeq)} (${fmt(f.pingPongSeqMeanLen, 1)})`, "묶음 <= 0.3"],
    ["공격 1/3 턴 비율 · 박스 붐빔 (공격 / 수비)", `${pct(f.finalThirdTurnShare)} · ${fmt(f.boxCrowd)} (${fmt(f.boxCrowdAtk)} / ${fmt(f.boxCrowdDef)})`, "기준보다 낮게"],
    ["공격 1/3 에서 공 2칸 안 상대 · 공이 자기 1/3 인 턴 비율", `${fmt(f.nearBallOpp)} · ${pct(f.ownThirdTurnShare)}`, ""],
    ["박스 안 공 가진 턴/경기 · 슛 안 한 턴", `${fmt(f.boxCarrierTurns)} · ${fmt(f.boxNoShotTurns)} (슛 ${pct(f.boxShotShare)})`, ""],
    ["  └ 슛 안 한 턴: 패스 / 태클 뺏김 / 드리블 · 지키기", `${fmt(f.boxPass)} / ${fmt(f.boxLost)} / ${fmt(f.boxOther)}`, ""],
    ["태클/경기 (박스 안 · 공격 1/3)", `${fmt(f.tackles)} (${fmt(f.tacklesBox)} · ${fmt(f.tacklesFinal)})`, ""],
    ["포제션당 턴", fmt(f.turnsPerPossession), ""],
  ]));
}

export function printHexSummary(s) {
  console.log(`hex_sim: ${s.matches} matches, seed ${s.seed}, ${s.ms} ms (${fmt(s.msPerMatch, 1)} ms/경기)`);
  if (s.sets.length) console.log(`overrides: ${s.sets.join(" ")}`);
  const g = `× ${s.growth ?? HOME_GROWTH}`;
  console.log(s.practice
    ? `\n[육각 경기 · 연습 미러]  (양 팀 = 연습 경기 기본 선수단 — ${s.practice.applied ? `config.practice "${s.practice.label}" (팀워크 ${s.practice.teamwork})` : s.practice.label}, 모두 친선)`
    : s.mirror
      ? `\n[육각 경기 · 미러]  (홈 = 기본 편성 능력치 ${g} (1.8 = 시즌 2 쯤), 원정 = 그 복제본, 짝수 판 골 매치 · 홀수 판 친선)`
      : `\n[육각 경기]  (홈 = 기본 편성 능력치 ${g} (1.8 = 시즌 2 쯤), 원정 = 상대 6팀 순환, 짝수 판 골 매치 · 홀수 판 친선)`);
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
  printFlow(s.flow);
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
