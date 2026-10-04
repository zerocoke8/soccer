#!/usr/bin/env node
// tools/sim.mjs — 헤드리스 밸런스 시뮬 (ARCHITECTURE §9, v0.3 §13.7)
//   node tools/sim.mjs --runs 300 --seed 1 [--policy smart|train] [--json]
//                      [--set path=value ...] [--oppScale s1=1.0,s2=1.03,s3=1.02]
// 기본 편성·기본 전술로 자동 완주. 정책: 훈련은 추천 칸, 체력 부족 추천이면 휴식(smart), 살 수 있는 스킬은 미팅 구매(smart),
// 이벤트 0번, 유물 첫 번째, 루트 순환(런마다 시작점 회전), 경기는 match.simulateAuto (A안 자동).
// 출력: 시즌별 목표 경기 승률, 평균 최종 스탯, 등급 분포, 런당 부상·우정 훈련, 경기 지표(골, 액티브·필살기·합체기·간파 사용,
// 크로스·헤더, 수비·공격 선택 분포, 짝 비율, ④ 연결 비율·성공률, GK 배급 짧게·길게·롱패스 성공률, 마지막 공격 보장·그 골,
// 대이변 수) — 전체 경기와 시즌별 목표 경기로 나눠서. 종료 코드 0.
//
// --set      : data.config 값을 메모리에서 덮어쓴다 (예: --set match.readBonus=1.4). 파일은 바꾸지 않는다.
// --oppScale : 상대 스탯을 시즌별(s2=1.03) 또는 팀별(op_s3_emberthrone=1.05) 배율 적용 (10 단위 반올림, 메모리만).
// 수동 결정 방식 비교(기대 % 최고 / 무작위 / 짝 맞힘 / 버티기)와 스킬 끄기 변형은 tools/choice.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const GRADES = ["S", "A", "B", "C", "D", "E", "F", "G"];
const STAMINA_BUCKETS = [">=60", "40~59", "20~39", "<20"];
export const DATA_FILES = ["config", "characters", "supports", "events", "skills", "relics", "opponents", "routes", "traits", "combos"];
const OPTIONAL_FILES = new Set(["traits", "combos"]);
const ATK_ACTIONS = ["dribble", "pass", "cross", "shoot"];
const DEF_ACTIONS = ["tackle", "intercept", "hold"];
const LINK_IDS = ["killpass", "runner", "oneTouch", "header", "combo"];

export function parseArgs(argv) {
  const out = { runs: 300, seed: 1, policy: "smart", json: false, sets: [], oppScale: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, parseInt(argv[++i], 10) || 300);
    else if (a === "--seed") out.seed = argv[++i] ?? 1;
    else if (a === "--policy") out.policy = argv[++i] || "smart";
    else if (a === "--json") out.json = true;
    else if (a === "--set") out.sets.push(argv[++i] || "");
    else if (a === "--oppScale") out.oppScale = argv[++i] || "";
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/sim.mjs --runs N --seed S [--policy smart|train] [--json] [--set a.b=v ...] [--oppScale s2=1.03,op_id=1.05]");
      console.log("수동 결정 방식·스킬 끄기 비교는 node tools/choice.mjs");
      process.exit(0);
    }
  }
  return out;
}

/** data/*.json 번들. traits·combos 는 없으면 건너뛴다(엔진 기본값). */
export function loadData(root = ROOT) {
  const data = {};
  for (const n of DATA_FILES) {
    const p = path.join(root, "data", `${n}.json`);
    if (OPTIONAL_FILES.has(n) && !fs.existsSync(p)) continue;
    data[n] = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return data;
}

/** --set a.b.c=value → data.config 경로에 대입 (JSON 파싱 가능하면 파싱). */
export function applyConfigOverrides(config, sets) {
  for (const s of sets) {
    if (!s) continue;
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
 * "cap=1000" 을 넣으면 배율 적용한 스탯을 그 값으로 자른다 (배율이 1 이 아닌 팀만). 10 단위 반올림. 파일은 건드리지 않는다.
 */
export function scaleOpponents(opponents, spec) {
  if (!spec) return opponents;
  let cap = Infinity;
  const rules = [];
  for (const x of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [k, v] = x.split("=");
    const f = Number(v);
    if (!k || !Number.isFinite(f)) throw new Error(`--oppScale 형식은 s2=1.03 또는 op_id=1.03 (cap=1000) 입니다: ${x}`);
    if (k === "cap") cap = f;
    else rules.push({ key: k, factor: f });
  }
  for (const op of opponents) {
    let f = 1;
    for (const r of rules) {
      if (r.key === op.id || r.key === `s${op.season}`) f *= r.factor;
    }
    if (f === 1) continue;
    for (const p of op.players) {
      for (const k of Object.keys(p.stats)) p.stats[k] = Math.min(cap, Math.round((p.stats[k] * f) / 10) * 10);
    }
  }
  return opponents;
}

/* ------------------------------------------------------------------ */
/* 경기 지표 (v0.3)                                                       */
/* ------------------------------------------------------------------ */

const FIELD_BEATS = new Set(["duel", "turnover", "goal", "save"]);
/** 필살기 종류 · 등급 (LESSON_PROTO_PLAN §19.16 지표 — K1). 등급이 없는 옛 데이터 컷인은 "-" */
export const ULT_TYPES = ["shot", "pass", "save", "defense", "team", "dribble"];
export const ULT_TIERS = ["R", "SR", "SSR", "-"];
/**
 * 컷인 연출 시간 (1x 기준 초, §19.8 길이표 = 차지 + 컷인): 경기 첫 필살기 / 그 뒤. 등급 없음 = SSR. 합체기 = 두 컷인 1.0초씩 + 이름 1.1초
 */
export const CUTIN_SECONDS = { SSR: [1.4, 1.2], SR: [1.1, 0.95], R: [0.8, 0.65] };
export const COMBO_SECONDS = 3.1;

/** 필살기 보유자 수 (게이지가 있는 선수) */
function holderCount(team) {
  return Object.values(team.live || {}).filter((l) => l && l.gauge != null).length;
}

/**
 * 끝난 경기 한 판의 지표. side 별 숫자는 { home, away } 가 아니라 평평한 키(…H / …A)로 둬서 합산이 쉽다.
 * - active: 일반 액티브 발동(stats.skillsUsed, 간파 스킬 포함·사용권 제외), ult: 필살기 컷인(합체기 포함), combo: 합체기
 * - gaanpa: 간파(스킬 + 사용권), holders: 필살기 보유자 수
 * - cross / crossOk: 크로스 시도·성공, header / headerGoal: 헤더 슛·골, links.*: 연계 문구 발생
 * - atk.* / def.*: 필드 듀얼(line 0~2)의 공격·수비 선택 (판정에 쓰인 액션 — 간파 교체 후)
 * - pairRead / pairMiss / pairHold: 필드 듀얼에서 수비가 짝을 맞힘 / 빗나감 / 버티기
 * - midH / midA / midGoal*: 파이널 서드 중거리 슛(필살 슛 제외 — 전술 슛 타이밍 효과 확인용)
 * - boxPass / boxCross (…H / …A): ④ 박스 연결(컷백 패스 · 센터링) 시도, boxLinkOk: 연결 성공,
 *   boxShot / boxShotGoal: 연결 성공 뒤 받은 선수의 슛(원터치·헤더)과 골, boxCombo: 그 슛이 합체기 (2026-09-29)
 * - boxChance (…H / …A): ④ 슈팅 찬스에서의 첫 판정 수 (슛 또는 연결 — 연결 비율의 분모)
 * - GK 배급 (2026-09-29): distShort / distLong (…H / …A), distLongOk (…H / …A) 롱패스 성공, cannon 캐논 킥 사용
 * - 마지막 공격 보장: lastAttack (…H / …A) 받은 수, lastAttackGoal (…H / …A) 그 포제션의 골
 * - upsets: 대이변 (승자 확률 < upsetP) 판정 수, chipDecisive: 결정타 칩이 있는 판정 수, judged: 칩이 붙은 판정 수
 */
export function matchMetrics(ms) {
  const r = match.getResult(ms);
  const st = ms.stats;
  const o = {
    goalsH: r.homeGoals, goalsA: r.awayGoals,
    activeH: st.home.skillsUsed || 0, activeA: st.away.skillsUsed || 0,
    ultH: st.home.ultimatesUsed || 0, ultA: st.away.ultimatesUsed || 0,
    comboH: st.home.combos || 0, comboA: st.away.combos || 0,
    gaanpaH: st.home.gaanpaUsed || 0, gaanpaA: st.away.gaanpaUsed || 0,
    holdersH: holderCount(ms.home), holdersA: holderCount(ms.away),
    ultShot: 0, ultPass: 0, ultSave: 0, ultShotGoal: 0,
    cross: 0, crossOk: 0, header: 0, headerGoal: 0,
    midH: 0, midA: 0, midGoalH: 0, midGoalA: 0,
    fieldDuels: 0, pairRead: 0, pairMiss: 0, pairHold: 0,
    boxPassH: 0, boxPassA: 0, boxCrossH: 0, boxCrossA: 0, boxLinkOk: 0, boxShot: 0, boxShotGoal: 0, boxCombo: 0,
    boxChanceH: 0, boxChanceA: 0,
    distShortH: 0, distShortA: 0, distLongH: 0, distLongA: 0, distLongOkH: 0, distLongOkA: 0, cannon: 0,
    lastAttackH: 0, lastAttackA: 0, lastAttackGoalH: 0, lastAttackGoalA: 0,
    upsets: 0, chipDecisive: 0, judged: 0,
    extraTime: ms.stage !== "regular" ? 1 : 0, penalties: r.penalties ? 1 : 0,
  };
  for (const a of ATK_ACTIONS) o[`atk_${a}`] = 0;
  for (const d of DEF_ACTIONS) o[`def_${d}`] = 0;
  for (const l of LINK_IDS) o[`link_${l}`] = 0;
  // §19.16 필살기 지표 (K1): 종류 · 등급별 (…H / …A), 쓴 듀얼 수 · 이긴 수, 합체기 이름별, 컷인 연출 초, 팀 필살기 배율 듀얼, 확정 배급
  for (const t of ULT_TYPES) { o[`ultType_${t}H`] = 0; o[`ultType_${t}A`] = 0; }
  for (const t of ULT_TIERS) { o[`ultTier_${t}H`] = 0; o[`ultTier_${t}A`] = 0; }
  Object.assign(o, { ultDuels: 0, ultDuelWins: 0, cutinSeconds: 0, teamUltDuels: 0, sureDist: 0 });
  let cutins = 0;
  let teamCutPending = false; // 팀 필살기 컷인 → 다음 판정(그 듀얼)
  let afterLink = null; // 박스 연결 성공 → 같은 포제션의 다음 판정 = 받은 선수의 슛
  let lastBoxPoss = null; // ④ 슈팅 찬스 첫 판정 (포제션당 1회)
  for (const e of ms.events) {
    const sfx = e.side === "home" ? "H" : "A";
    if (e.type === "cutin") {
      if (e.ultimateType === "shot") o.ultShot++;
      else if (e.ultimateType === "pass") o.ultPass++;
      else if (e.ultimateType === "save") o.ultSave++;
      if (`ultType_${e.ultimateType}${sfx}` in o) o[`ultType_${e.ultimateType}${sfx}`]++;
      const tier = ULT_TIERS.includes(e.tier) ? e.tier : "-";
      o[`ultTier_${tier}${sfx}`]++;
      const len = CUTIN_SECONDS[tier === "-" ? "SSR" : tier];
      o.cutinSeconds += e.combo ? COMBO_SECONDS : len[cutins === 0 ? 0 : 1];
      cutins++;
      if (e.ultimateType === "team") teamCutPending = true;
      continue;
    }
    if (e.type === "combo" && e.name) {
      const k = `comboName:${e.name}`;
      o[k] = (o[k] || 0) + 1;
    }
    if (Array.isArray(e.factors)) {
      // 필살기를 쓴 판정 (공격 ultimate · 수비 defUltimate) 과 그 쪽이 이겼는가
      if (e.ultimate) { o.ultDuels++; if (e.success) o.ultDuelWins++; }
      if (e.defUltimate) { o.ultDuels++; if (!e.success) o.ultDuelWins++; }
      if (teamCutPending || e.factors.some((f) => f.id === "teamUlt")) o.teamUltDuels++;
      teamCutPending = false;
    }
    if (e.distribution && e.sure) o.sureDist++;
    if (e.type === "skill" && e.effect === "longPassBoost") o.cannon++;
    if (e.type === "lastAttack") o[`lastAttack${sfx}`]++;
    if (Array.isArray(e.factors)) {
      o.judged++;
      if (e.upset) o.upsets++;
      if (e.decisive) o.chipDecisive++;
    }
    if (e.distribution) {
      // GK 배급 (짧은 패스 · 롱패스 성공 = distribution, 롱패스 실패 = turnover) — 필드 듀얼 지표에서 뺀다
      if (e.action === "short") o[`distShort${sfx}`]++;
      else {
        o[`distLong${sfx}`]++;
        if (e.success) o[`distLongOk${sfx}`]++;
      }
      continue;
    }
    if (e.type === "goal" && e.lastAttack) o[`lastAttackGoal${sfx}`]++;
    if (FIELD_BEATS.has(e.type) && e.step === 3 && e.defAction === "save" && lastBoxPoss !== e.possession) {
      lastBoxPoss = e.possession;
      o[`boxChance${e.attackingSide === "home" ? "H" : "A"}`]++;
    }
    if (!FIELD_BEATS.has(e.type) || !e.action) continue;
    if (e.boxLink) {
      const h = e.attackingSide === "home";
      o[(e.action === "cross" ? "boxCross" : "boxPass") + (h ? "H" : "A")]++;
      if (e.success) {
        o.boxLinkOk++;
        afterLink = e.possession;
      }
    } else if (afterLink != null) {
      if (e.possession === afterLink && e.action === "shoot") {
        o.boxShot++;
        if (e.type === "goal") o.boxShotGoal++;
        if ((e.links || []).some((l) => l.id === "combo")) o.boxCombo++;
      }
      afterLink = null;
    }
    if (e.type === "goal" && e.ultimate && e.action === "shoot") o.ultShotGoal++;
    for (const l of e.links || []) if (`link_${l.id}` in o) o[`link_${l.id}`]++;
    if (e.header) {
      o.header++;
      if (e.type === "goal") o.headerGoal++;
    }
    if (e.defAction === "save") continue;
    if (e.action === "shoot" && e.step === 2 && !e.ultimate) {
      const h = e.attackingSide === "home";
      o[h ? "midH" : "midA"]++;
      if (e.type === "goal") o[h ? "midGoalH" : "midGoalA"]++;
    }
    o.fieldDuels++;
    if (`atk_${e.action}` in o) o[`atk_${e.action}`]++;
    if (`def_${e.defAction}` in o) o[`def_${e.defAction}`]++;
    if (e.action === "cross") {
      o.cross++;
      if (e.success) o.crossOk++;
    }
    if (e.defAction === "hold" && e.pair !== "read") o.pairHold++;
    else if (e.pair === "read") o.pairRead++;
    else if (e.pair === "miss") o.pairMiss++;
  }
  return o;
}

/** 지표 누적기: add(metrics) 로 더하고 n 으로 나눠 평균 */
export function newAcc() {
  return { n: 0, wins: 0, sum: {} };
}

export function accAdd(acc, mm, win = false) {
  acc.n++;
  if (win) acc.wins++;
  for (const [k, v] of Object.entries(mm)) acc.sum[k] = (acc.sum[k] || 0) + v;
}

/** 누적기 → 경기당 평균 + 파생 지표 */
export function accSummary(acc) {
  const n = acc.n || 0;
  const s = acc.sum;
  const avg = (k) => (n ? (s[k] || 0) / n : 0);
  const ratio = (a, b) => ((s[b] || 0) ? (s[a] || 0) / s[b] : 0);
  const field = s.fieldDuels || 0;
  return {
    matches: n,
    winRate: n ? acc.wins / n : 0,
    goalsPerMatch: avg("goalsH") + avg("goalsA"),
    homeGoals: avg("goalsH"), awayGoals: avg("goalsA"),
    activeHome: avg("activeH"), activeAway: avg("activeA"),
    ultHome: avg("ultH"), ultAway: avg("ultA"),
    ultPerHolderHome: ratio("ultH", "holdersH"), ultPerHolderAway: ratio("ultA", "holdersA"),
    holdersHome: avg("holdersH"), holdersAway: avg("holdersA"),
    combos: avg("comboH") + avg("comboA"), combosHome: avg("comboH"),
    // §19.16 (K1): 필살기 종류 · 등급별 경기당 (우리 / 상대), 성공률, 합체기 이름별, 컷인 연출 초, 팀 필살기 배율 듀얼, 확정 배급
    ultTypeHome: Object.fromEntries(ULT_TYPES.map((t) => [t, avg(`ultType_${t}H`)])),
    ultTypeAway: Object.fromEntries(ULT_TYPES.map((t) => [t, avg(`ultType_${t}A`)])),
    ultTierHome: Object.fromEntries(ULT_TIERS.map((t) => [t, avg(`ultTier_${t}H`)])),
    ultTierAway: Object.fromEntries(ULT_TIERS.map((t) => [t, avg(`ultTier_${t}A`)])),
    ultDuelWinRate: ratio("ultDuelWins", "ultDuels"),
    comboByName: Object.fromEntries(Object.keys(s).filter((k) => k.startsWith("comboName:")).map((k) => [k.slice(10), avg(k)])),
    cutinSeconds: avg("cutinSeconds"), teamUltDuels: avg("teamUltDuels"), sureDist: avg("sureDist"),
    gaanpaHome: avg("gaanpaH"), gaanpaAway: avg("gaanpaA"),
    ultShot: avg("ultShot"), ultPass: avg("ultPass"), ultSave: avg("ultSave"),
    ultShotGoalRate: ratio("ultShotGoal", "ultShot"),
    cross: avg("cross"), crossSuccess: ratio("crossOk", "cross"),
    header: avg("header"), headerGoalRate: ratio("headerGoal", "header"),
    midrangeHome: avg("midH"), midrangeAway: avg("midA"),
    midrangeGoalRateHome: ratio("midGoalH", "midH"), midrangeGoalRateAway: ratio("midGoalA", "midA"),
    links: Object.fromEntries(LINK_IDS.map((l) => [l, avg(`link_${l}`)])),
    attackMix: Object.fromEntries(ATK_ACTIONS.map((a) => [a, field ? (s[`atk_${a}`] || 0) / field : 0])),
    defenseMix: Object.fromEntries(DEF_ACTIONS.map((d) => [d, field ? (s[`def_${d}`] || 0) / field : 0])),
    pairRead: field ? (s.pairRead || 0) / field : 0,
    pairMiss: field ? (s.pairMiss || 0) / field : 0,
    pairHold: field ? (s.pairHold || 0) / field : 0,
    fieldDuelsPerMatch: avg("fieldDuels"),
    boxPassHome: avg("boxPassH"), boxPassAway: avg("boxPassA"), boxCrossHome: avg("boxCrossH"), boxCrossAway: avg("boxCrossA"),
    boxLinks: avg("boxPassH") + avg("boxPassA") + avg("boxCrossH") + avg("boxCrossA"),
    boxLinkSuccess: n && (avg("boxPassH") + avg("boxPassA") + avg("boxCrossH") + avg("boxCrossA"))
      ? avg("boxLinkOk") / (avg("boxPassH") + avg("boxPassA") + avg("boxCrossH") + avg("boxCrossA")) : 0,
    boxShotGoalRate: ratio("boxShotGoal", "boxShot"), boxCombos: avg("boxCombo"),
    // ④ 연결 비율 = 연결 시도 / ④ 슈팅 찬스 (포제션당 첫 판정)
    boxLinkRateHome: ratio2(s, ["boxPassH", "boxCrossH"], "boxChanceH"), boxLinkRateAway: ratio2(s, ["boxPassA", "boxCrossA"], "boxChanceA"),
    // GK 배급 (2026-09-29)
    distShortHome: avg("distShortH"), distShortAway: avg("distShortA"), distLongHome: avg("distLongH"), distLongAway: avg("distLongA"),
    longPassSuccessHome: ratio("distLongOkH", "distLongH"), longPassSuccessAway: ratio("distLongOkA", "distLongA"),
    cannon: avg("cannon"),
    // 마지막 공격 보장
    lastAttackHome: avg("lastAttackH"), lastAttackAway: avg("lastAttackA"),
    lastAttackGoalRate: ratio2(s, ["lastAttackGoalH", "lastAttackGoalA"], null, ["lastAttackH", "lastAttackA"]),
    // 결정타 칩
    upsetsPerMatch: avg("upsets"), upsetRate: ratio("upsets", "judged"), decisiveRate: ratio("chipDecisive", "judged"),
    extraTimeRate: avg("extraTime"), penaltyRate: avg("penalties"),
  };
}

/** (Σ keys) / (s[den] 또는 Σ dens) — 0 이면 0 */
function ratio2(s, keys, den, dens = null) {
  const top = keys.reduce((a, k) => a + (s[k] || 0), 0);
  const bot = dens ? dens.reduce((a, k) => a + (s[k] || 0), 0) : s[den] || 0;
  return bot ? top / bot : 0;
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
    goalsHome: 0, goalsAway: 0, matches: 0, friendlies: 0, penalties: 0, extraTime: 0,
    injuredMatchSlots: 0, hints: 0, learned: 0,
    trainedPlayers: 0, trainFails: 0, expectedFails: 0, staminaBuckets: [0, 0, 0, 0], trainInjuries: 0, eventInjuries: 0,
    spEarned: 0,
  };
}

/**
 * 런 1회 자동 완주.
 * @param {{ onMatch?: (info: { setup, season, kind, ms, result, state }) => void }} [hooks]
 *   onMatch 는 경기 직후(finishMatch 전) 호출된다. setup 은 run.getMatchSetup 반환값(사본 아님 — 필요하면 복사).
 */
export function simulateOne(data, seed, routeStart, policy, hooks = {}) {
  const state = run.createRun({ data, seed });
  const m = newMetrics();
  const matchAcc = { all: newAcc(), goal: [newAcc(), newAcc(), newAcc()] };
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
      const season = state.season;
      m.injuredMatchSlots += setup.home.players.filter((p) => p.isYouth).length;
      const ms = match.createMatch({ data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
      match.simulateAuto(ms, data);
      const r = match.getResult(ms);
      m.matches++;
      if (setup.kind !== "goal") m.friendlies++;
      m.goalsHome += r.homeGoals;
      m.goalsAway += r.awayGoals;
      if (r.penalties) m.penalties++;
      if (ms.stage !== "regular") m.extraTime++;
      const mm = matchMetrics(ms);
      const win = r.winner === "home";
      accAdd(matchAcc.all, mm, win);
      if (setup.kind === "goal" && season >= 1 && season <= 3) accAdd(matchAcc.goal[season - 1], mm, win);
      if (hooks.onMatch) hooks.onMatch({ setup, season, kind: setup.kind, ms, result: r, state });
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
  return { state, rating, m, matchAcc };
}

/**
 * 자동 런 N회에서 목표 경기 셋업을 시즌별로 모은다 (tools/choice.mjs 용). 런 진행은 runSim 과 같은 정책·시드 규칙.
 * @returns {{ 1: object[], 2: object[], 3: object[] }} 각 원소 = { home, away, possessions, kind, seed, opponentId, runSeed }
 */
export function collectGoalSetups(data, { runs = 60, seed = 1, policy = "smart" } = {}) {
  const out = { 1: [], 2: [], 3: [] };
  for (let i = 0; i < runs; i++) {
    const runSeed = `${seed}-${i}`;
    simulateOne(data, runSeed, i % 3, policy, {
      onMatch: ({ setup, season, kind }) => {
        if (kind !== "goal" || !out[season]) return;
        out[season].push(JSON.parse(JSON.stringify({
          home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind, seed: setup.seed,
          opponentId: setup.opponentId, runSeed,
        })));
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 집계                                                                  */
/* ------------------------------------------------------------------ */

function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function fmt(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : "-"; }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }
function rpad(s, n) { s = String(s); return s.length >= n ? s : " ".repeat(n - s.length) + s; }
function strWidth(s) {
  // 한글 등 전각 문자는 폭 2
  let w = 0;
  for (const ch of String(s)) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯]/.test(ch) ? 2 : 1;
  return w;
}
export function table(rows) {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => strWidth(r[i]))));
  const padW = (s, n, right) => {
    const d = n - strWidth(s);
    return d <= 0 ? String(s) : right ? " ".repeat(d) + s : s + " ".repeat(d);
  };
  return rows.map((r) => r.map((c, i) => padW(String(c), w[i], i !== 0)).join("  ")).join("\n");
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
  const allAcc = newAcc();
  const goalAcc = [newAcc(), newAcc(), newAcc()];
  const mergeAcc = (a, b) => {
    a.n += b.n;
    a.wins += b.wins;
    for (const [k, v] of Object.entries(b.sum)) a.sum[k] = (a.sum[k] || 0) + v;
  };

  for (let i = 0; i < N; i++) {
    const seed = `${args.seed}-${i}`;
    const { state, rating, m, matchAcc } = simulateOne(data, seed, i % 3, args.policy);
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
    mergeAcc(allAcc, matchAcc.all);
    for (let s = 0; s < 3; s++) mergeAcc(goalAcc[s], matchAcc.goal[s]);
  }
  const nPlayers = 7 * N;
  const avgStats = Object.fromEntries(STATS.map((s) => [s, statSum[s] / nPlayers]));
  const avgAll = STATS.reduce((a, s) => a + avgStats[s], 0) / STATS.length;
  scores.sort((a, b) => a - b);
  const median = scores[Math.floor(scores.length / 2)];
  const ms = Date.now() - t0;

  return {
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
    relicsPerRun: tot.relics / N,
    hintsPerRun: tot.hints / N, learnedPerRun: tot.learned / N, youthSlotsPerRun: tot.injuredMatchSlots / N,
    spEarnedPerRun: tot.spEarned / N,
    training: {
      trainedPlayersPerRun: tot.trainedPlayers / N,
      failsPerRun: tot.trainFails / N,
      observedFailRate: tot.trainedPlayers ? tot.trainFails / tot.trainedPlayers : 0,
      expectedFailRate: tot.trainedPlayers ? tot.expectedFails / tot.trainedPlayers : 0,
      staminaBuckets: Object.fromEntries(STAMINA_BUCKETS.map((b, i) => [b, tot.trainedPlayers ? buckets[i] / tot.trainedPlayers : 0])),
    },
    // v0.3 경기 지표: 전체 경기(친선 포함) + 시즌별 목표 경기
    matchStats: { all: accSummary(allAcc), goal: goalAcc.map(accSummary) },
  };
}

/** 경기 지표 표 (전체 / S1~S3 목표 경기). cols = [[제목, accSummary]] */
export function matchStatsTable(cols) {
  const row = (label, f, target = "") => [label, ...cols.map(([, s]) => (s && s.matches ? f(s) : "-")), target];
  const mix = (o, keys, short) => keys.map((k) => `${short[k]}${Math.round(o[k] * 100)}`).join("/");
  const A = { dribble: "드", pass: "패", cross: "크", shoot: "슛" };
  const D = { tackle: "태", intercept: "인", hold: "버" };
  return table([
    ["지표", ...cols.map(([t]) => t), "목표"],
    row("경기 수", (s) => s.matches),
    row("우리 승률", (s) => pct(s.winRate), "70~80/50~60/35~45"),
    row("골/경기 (우리/상대)", (s) => `${fmt(s.goalsPerMatch)} (${fmt(s.homeGoals)}/${fmt(s.awayGoals)})`, "1.5~3.5"),
    row("일반 액티브/경기 우리/상대", (s) => `${fmt(s.activeHome)} / ${fmt(s.activeAway)}`, "팀당 3~4"),
    row("필살기/보유자·경기 우리/상대", (s) => `${fmt(s.ultPerHolderHome)} / ${s.holdersAway ? fmt(s.ultPerHolderAway) : "-"}`, "1~2"),
    row("필살기/경기 우리 (보유자 수)", (s) => `${fmt(s.ultHome)} (${fmt(s.holdersHome, 1)})`),
    row("필살 슛/패스/세이브 (경기당)", (s) => `${fmt(s.ultShot)}/${fmt(s.ultPass)}/${fmt(s.ultSave)}`),
    row("필살 슛 골 확률", (s) => (s.ultShot ? pct(s.ultShotGoalRate) : "-"), "80%대"),
    row("합체기/경기", (s) => fmt(s.combos, 3)),
    row("간파/경기 우리/상대", (s) => `${fmt(s.gaanpaHome)} / ${fmt(s.gaanpaAway)}`),
    row("크로스/경기 (성공률)", (s) => `${fmt(s.cross)} (${s.cross ? pct(s.crossSuccess) : "-"})`),
    row("헤더 슛/경기 (골 확률)", (s) => `${fmt(s.header)} (${s.header ? pct(s.headerGoalRate) : "-"})`),
    row("중거리 슛/경기 우리/상대 (골%)", (s) => `${fmt(s.midrangeHome)}/${fmt(s.midrangeAway)} (${s.midrangeHome ? Math.round(s.midrangeGoalRateHome * 100) : "-"}/${s.midrangeAway ? Math.round(s.midrangeGoalRateAway * 100) : "-"})`),
    row("연계 킬패스/침투/원터치", (s) => `${fmt(s.links.killpass)}/${fmt(s.links.runner)}/${fmt(s.links.oneTouch)}`),
    row("필드 듀얼/경기", (s) => fmt(s.fieldDuelsPerMatch, 1)),
    row("공격 선택 % 드/패/크/슛", (s) => mix(s.attackMix, ATK_ACTIONS, A)),
    row("수비 선택 % 태/인/버", (s) => mix(s.defenseMix, DEF_ACTIONS, D)),
    row("수비 짝/빗나감/버티기 %", (s) => `${Math.round(s.pairRead * 100)}/${Math.round(s.pairMiss * 100)}/${Math.round(s.pairHold * 100)}`),
    row("박스 연결/경기 컷백/센터링 우리 · 상대", (s) => `${fmt(s.boxPassHome)}/${fmt(s.boxCrossHome)} · ${fmt(s.boxPassAway)}/${fmt(s.boxCrossAway)}`),
    row("박스 연결 성공률 · 다음 슛 골%", (s) => (s.boxLinks ? `${pct(s.boxLinkSuccess)} · ${s.boxShotGoalRate ? pct(s.boxShotGoalRate) : "-"}` : "-")),
    row("박스 합체기/경기", (s) => fmt(s.boxCombos, 3)),
    row("④ 연결 비율 우리/상대", (s) => `${pct(s.boxLinkRateHome)} / ${pct(s.boxLinkRateAway)}`),
    row("GK 배급/경기 짧게·길게 우리 · 상대", (s) => `${fmt(s.distShortHome)}·${fmt(s.distLongHome)} · ${fmt(s.distShortAway)}·${fmt(s.distLongAway)}`),
    row("롱패스 성공률 우리/상대 (캐논 킥/경기)", (s) => `${s.distLongHome ? pct(s.longPassSuccessHome) : "-"} / ${s.distLongAway ? pct(s.longPassSuccessAway) : "-"} (${fmt(s.cannon, 3)})`),
    row("마지막 공격/경기 우리/상대 (골%)", (s) => `${fmt(s.lastAttackHome, 3)}/${fmt(s.lastAttackAway, 3)} (${s.lastAttackHome + s.lastAttackAway ? pct(s.lastAttackGoalRate) : "-"})`),
    row("대이변/경기 (판정 중 %) · 결정타 칩 %", (s) => `${fmt(s.upsetsPerMatch)} (${pct(s.upsetRate)}) · ${pct(s.decisiveRate)}`),
    row("연장 / 승부차기", (s) => `${pct(s.extraTimeRate)} / ${pct(s.penaltyRate)}`),
    // §19.16 필살기 지표 (K1 — 표 끝에 더해 기존 줄은 그대로)
    row("필살기 종류/경기 우리 슛·패·세·수·호·드", (s) => ULT_TYPES.map((t) => fmt(s.ultTypeHome[t])).join("·")),
    row("필살기 종류/경기 상대 슛·패·세·수·호·드", (s) => ULT_TYPES.map((t) => fmt(s.ultTypeAway[t])).join("·")),
    row("필살기 등급/경기 우리 R·SR·SSR·없음", (s) => ULT_TIERS.map((t) => fmt(s.ultTierHome[t])).join("·")),
    row("필살기 등급/경기 상대 R·SR·SSR·없음", (s) => ULT_TIERS.map((t) => fmt(s.ultTierAway[t])).join("·")),
    row("필살기 쓴 듀얼 승률", (s) => (s.ultDuelWinRate ? pct(s.ultDuelWinRate) : "-")),
    row("합체기 이름별/경기", (s) => Object.entries(s.comboByName).map(([k, v]) => `${k} ${fmt(v, 3)}`).join(" · ") || "-"),
    row("컷인 연출 초/경기 (1x)", (s) => fmt(s.cutinSeconds, 1)),
    row("팀 필살기 배율 듀얼/경기 · 확정 배급/경기", (s) => `${fmt(s.teamUltDuels)} · ${fmt(s.sureDist, 3)}`),
  ]);
}

export function printSummary(summary) {
  const s = summary;
  console.log(`sim: ${s.runs} runs, seed ${s.seed}, policy ${s.policy}, ${s.ms} ms`);
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
  console.log("\n[경기]  (자동 A안 · 전체 = 친선 포함 모든 경기, S1~S3 = 시즌별 목표 경기)");
  const ms = s.matchStats;
  console.log(matchStatsTable([["전체", ms.all], ["S1 목표", ms.goal[0]], ["S2 목표", ms.goal[1]], ["S3 목표", ms.goal[2]]]));
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

export function isEntry(metaUrl) {
  try {
    return path.resolve(process.argv[1] || "").toLowerCase() === fileURLToPath(metaUrl).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntry(import.meta.url)) {
  main();
  process.exitCode = 0;
}
