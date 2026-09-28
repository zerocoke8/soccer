#!/usr/bin/env node
// tools/choice.mjs — 결정 방식·스킬 비교 (ARCHITECTURE §13.7)
//   node tools/choice.mjs [--runs 60] [--seeds 6] [--seed 1] [--json] [--set path=value ...] [--oppScale s3=1.05]
//                         [--strip home|both] [--extra expected/noUlt,...] [--combos auto/normal,auto/noUlt,...]
//   300 런 × 8 시드 ≈ 조합 11개에 70초 (기대 % 정책은 매 결정 getMatchView 를 부른다).
//
// 1) tools/sim.mjs 와 같은 자동 육성 런(smart 정책)을 --runs 번 돌려 시즌별 목표 경기 셋업(양 팀 스냅샷)을 모은다.
// 2) 셋업마다 경기 시드 --seeds 개로, 같은 셋업·시드를 결정 방식만 바꿔 다시 치른다 (우리 = home, 상대 = AI).
//    결정 방식 (우리 팀):
//      auto     : 자동 (A안 — 성향 1위, 엔진 AI 와 같음)
//      expected : 기대 % 최고 — 액션마다 함께 켤 스킬·필살기·간파(아래 규칙) 토글의 화면 기대 %까지 보고 최고를 고른다 (수동 근사)
//      rec      : 화면의 "추천" 버튼(view.actions[].recommended, 토글 없는 기대 %)만 따른다
//      random   : 켜진 액션 중 무작위 (경기 시드에서 파생한 별도 난수 — 판정 주사위와 무관)
//      pair     : 항상 짝 맞힘 — 수비는 상대 예상 행동의 짝, 공격은 상대 수비 짝을 피하는 성향 최고 액션
//      hold     : 수비는 항상 버티기, 공격은 자동
//      expD / expA : 기대 % 최고를 수비만 / 공격만 (나머지는 자동) — 수동 이득 분해용 (--combos 로 지정)
//    수동 방식도 스킬·필살기·간파 사용권·받는 선수는 AI 와 같은 규칙(ai.chooseSkill, match.aiWantsUltimate 등)으로 붙인다
//    → 액션 선택만의 차이를 잰다.
//    변형 (자동 결정, 우리 팀 스킬 제거 — --strip both 면 상대 팀도): noUlt 필살기 끔, noActive 일반 액티브 끔, noBoth 둘 다 끔.
// 3) 출력: 시즌별 승률(±표준오차), 수동 이득(expected − auto), 필살기 효과(auto − noUlt, 경기당 사용 수로 나눈 1회 효과),
//    일반 액티브 효과, 액티브·필살기 전체 효과, 경기당 필살기·액티브 사용 수, 경기당 골.
//    차이의 ±는 같은 (셋업, 시드) 짝의 승패 차이로 계산한 표준오차 (짝지은 비교).
// --combos auto/normal,auto/noUlt,... 로 치를 조합만 고를 수 있다 (없는 조합의 효과 줄은 생략).
import * as match from "../js/engine/match.js";
import * as ai from "../js/engine/ai.js";
import { createRng } from "../js/engine/rng.js";
import { getSkill, getPlayerUltimate, isGaanpaSkill, emptyDuelEffects, addSkillFx } from "../js/engine/skills.js";
import {
  loadData, applyConfigOverrides, scaleOpponents, collectGoalSetups, matchMetrics, newAcc, accAdd, accSummary, table, isEntry,
} from "./sim.mjs";

export const POLICIES = ["auto", "expected", "rec", "random", "pair", "hold", "expD", "expA"];
export const VARIANTS = ["normal", "noUlt", "noActive", "noBoth"];
const DEFAULT_COMBOS = [
  ["auto", "normal"], ["expected", "normal"], ["rec", "normal"], ["random", "normal"], ["pair", "normal"], ["hold", "normal"],
  ["auto", "noUlt"], ["auto", "noActive"], ["auto", "noBoth"],
];

export function parseArgs(argv) {
  const out = { runs: 60, seeds: 6, seed: 1, json: false, sets: [], oppScale: "", strip: "home", extra: [], combos: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") out.runs = Math.max(1, parseInt(argv[++i], 10) || 60);
    else if (a === "--seeds") out.seeds = Math.max(1, parseInt(argv[++i], 10) || 6);
    else if (a === "--seed") out.seed = argv[++i] ?? 1;
    else if (a === "--json") out.json = true;
    else if (a === "--set") out.sets.push(argv[++i] || "");
    else if (a === "--oppScale") out.oppScale = argv[++i] || "";
    else if (a === "--strip") out.strip = argv[++i] === "both" ? "both" : "home";
    else if (a === "--extra") out.extra.push(...String(argv[++i] || "").split(",").filter(Boolean));
    else if (a === "--combos") out.combos = String(argv[++i] || "").split(",").filter(Boolean);
    else if (a === "--help" || a === "-h") {
      console.log("usage: node tools/choice.mjs [--runs N] [--seeds K] [--seed S] [--json] [--set a.b=v ...] [--oppScale s3=1.05] [--strip home|both] [--extra policy/variant,...] [--combos policy/variant,...]");
      console.log(`  policy: ${POLICIES.join(" | ")}   variant: ${VARIANTS.join(" | ")}`);
      process.exit(0);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 스킬 제거 변형                                                          */
/* ------------------------------------------------------------------ */

/** 팀 스냅샷 사본에서 variant 에 해당하는 스킬을 뺀다 (패시브는 유지) */
export function stripTeam(team, data, variant) {
  const t = JSON.parse(JSON.stringify(team));
  if (variant === "normal") return t;
  const kindOf = (id) => {
    const sk = (data.skills || []).find((s) => s.id === id);
    if (!sk) return "passive";
    if (sk.kind === "unique" && sk.ultimate) return "ult";
    if (sk.kind === "active" && sk.active) return "active";
    return "passive";
  };
  for (const p of t.players || []) {
    p.skillIds = (p.skillIds || []).filter((id) => {
      const k = kindOf(id);
      if (k === "ult") return variant !== "noUlt" && variant !== "noBoth";
      if (k === "active") return variant !== "noActive" && variant !== "noBoth";
      return true;
    });
  }
  return t;
}

/* ------------------------------------------------------------------ */
/* 결정 방식                                                              */
/* ------------------------------------------------------------------ */

function participantOf(ms, side, role) {
  const team = ms[side];
  const id = role === "attack" ? ms.ball.carrierId : ms.duel.defenderId;
  return match.findPlayer(team, id);
}

function enabledActions(ms, data, side, role) {
  const list = role === "attack" ? match.getAttackActions(ms, side, data) : match.getDefenseActions(ms, side, data);
  return list.filter((a) => a.enabled).map((a) => a.action);
}

/**
 * 고른 action 에 AI 와 같은 규칙으로 스킬·필살기·간파 사용권·받는 선수를 붙여 결정 객체를 만든다 (상태 불변).
 */
export function decorate(ms, data, side, role, action) {
  const player = participantOf(ms, side, role);
  const d = { action };
  if (!player) return d;
  const skillId = ai.chooseSkill(ms, data, side, player, role, action);
  if (skillId) d.skillId = skillId;
  const fx = Object.assign(emptyDuelEffects(), match.fxOf(ms, side));
  if (skillId) addSkillFx(fx, getSkill(data, skillId));
  if (role === "attack") {
    if (action === "pass" || action === "cross") {
      const ult = getPlayerUltimate(data, player);
      if (ult && ult.ultimate.type === "pass") {
        const fxU = Object.assign({}, fx, { ult: Object.assign({ skillId: ult.id }, ult.ultimate) });
        const rU = match.defaultReceiverId(ms, data, side, action, fxU);
        if (match.aiWantsUltimate(ms, data, side, player, "attack", action, rU, skillId ? fx : null)) {
          d.ultimate = true;
          if (rU) d.receiverId = rU;
        }
      }
    } else if (match.aiWantsUltimate(ms, data, side, player, "attack", action, null, skillId ? fx : null)) {
      d.ultimate = true;
    }
  } else if (match.aiWantsUltimate(ms, data, side, player, "defense", action)) {
    d.ultimate = true;
  }
  // 간파 사용권: AI 와 같은 규칙 (레버리지 비트, 간파 스킬을 쓰지 않을 때)
  const skillIsGaanpa = !!(skillId && isGaanpaSkill(getSkill(data, skillId)));
  if (!skillIsGaanpa && (ms[side].gaanpaTickets || 0) > 0 && ai.isLeverage(ms, side) && match.gaanpaStatus(ms, data, side, "ticket").usable) {
    d.gaanpa = "ticket";
  }
  return d;
}

/** 상대(AI)가 이번 듀얼에 커밋한 액션 (A안: 화면의 예상 행동과 같다) */
function opponentCommitted(ms, side) {
  const opp = match.otherSide(side);
  const c = ms.duel && ms.duel[opp + "Choice"];
  return c && c.action ? c.committedAction || c.action : null;
}

/**
 * expected 정책의 액션별 점수: 그 액션과 함께 붙을 스킬·필살기·간파 사용권(decorate — AI 와 같은 규칙)을 켰을 때
 * 화면에 보이는 기대 % (skills[].expectedPct / ultimateOptions[].expectedPct / gaanpa.expectedPct) 중 최고, 없으면 버튼 기대값.
 * @returns {{ action: string, decision: object }|null}
 */
function bestByExpected(view, ms, data, side, role) {
  let best = null;
  let bv = -Infinity;
  for (const a of view.actions) {
    if (!a.enabled) continue;
    const d = decorate(ms, data, side, role, a.action);
    let v = Number.isFinite(a.expected) ? a.expected : num(a.expectedPct) / 100;
    const toggled = (pctMap) => {
      const p = pctMap && pctMap[a.action];
      if (p != null && Number.isFinite(p)) v = Math.max(v, p / 100);
    };
    if (d.skillId) toggled((view.skills.find((s) => s.skillId === d.skillId) || {}).expectedPct);
    if (d.ultimate) toggled((view.ultimateOptions.find((u) => u.usable) || {}).expectedPct);
    if (d.gaanpa && view.gaanpa && view.gaanpa.usable) toggled(view.gaanpa.expectedPct);
    if (v > bv + 1e-9) {
      bv = v;
      best = { action: a.action, decision: d };
    }
  }
  return best;
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

/**
 * 정책별 결정 (사람 = side 가 결정할 차례일 때만 호출). null 이면 엔진 자동(A안)과 같다.
 * @param {{ rng?: object }} ctx random 정책용 난수
 */
export function policyDecision(policy, ms, data, side, need, ctx = {}) {
  if (policy === "auto" || !need) return null;
  const role = need;
  if (policy === "expD" || policy === "expA") {
    if ((policy === "expD") !== (role === "defense")) return null;
    policy = "expected";
  }
  const enabled = enabledActions(ms, data, side, role);
  if (!enabled.length) return null;
  let action = null;
  if (policy === "expected") {
    const best = bestByExpected(match.getMatchView(ms, data, side), ms, data, side, role);
    return best ? best.decision : null;
  } else if (policy === "rec") {
    const view = match.getMatchView(ms, data, side);
    const rec = view.actions.find((a) => a.enabled && a.recommended);
    action = rec ? rec.action : null;
  } else if (policy === "random") {
    action = enabled[Math.floor(ctx.rng.next() * enabled.length) % enabled.length];
  } else if (policy === "pair") {
    const opp = opponentCommitted(ms, side);
    if (role === "defense") {
      const want = opp ? match.COUNTER[opp] : null;
      action = want && enabled.includes(want) ? want : null;
    } else {
      // 상대 수비의 짝을 피하는 액션 중 성향값 최고 (동률 tieAttack 순서)
      const vals = match.tendencyValues(ms, data, side);
      const allowed = {};
      for (const a of enabled) if (!(opp && match.COUNTER[a] === opp) && Number.isFinite(vals[a])) allowed[a] = vals[a];
      const order = (data.config.match.tendency && data.config.match.tendency.tieAttack) || ["dribble", "pass", "cross", "shoot"];
      action = Object.keys(allowed).length ? match.pickByTendency(allowed, order) : null;
    }
  } else if (policy === "hold") {
    if (role !== "defense") return null;
    action = enabled.includes("hold") ? "hold" : null;
  } else {
    throw new Error(`choice: 알 수 없는 정책 ${policy}`);
  }
  if (!action) return null;
  return decorate(ms, data, side, role, action);
}

/** 셋업 한 판을 policy/variant 로 치른다 → 끝난 MatchState */
export function playSetup(data, setup, matchSeed, policy, variant, strip = "home") {
  const home = stripTeam(setup.home, data, variant);
  const away = strip === "both" ? stripTeam(setup.away, data, variant) : JSON.parse(JSON.stringify(setup.away));
  const ms = match.createMatch({ data, seed: matchSeed, home, away, possessions: setup.possessions, kind: setup.kind });
  const ctx = { rng: createRng(`${matchSeed}|policy-${policy}`) };
  let guard = 0;
  while (!ms.finished) {
    if (++guard > 5000) throw new Error("choice: 경기가 끝나지 않습니다");
    const need = match.humanNeedsDecision(ms, "home");
    const d = need ? policyDecision(policy, ms, data, "home", need, ctx) : null;
    match.step(ms, data, d);
  }
  return ms;
}

/* ------------------------------------------------------------------ */
/* 본체                                                                  */
/* ------------------------------------------------------------------ */

const comboKey = (p, v) => `${p}/${v}`;

function parseCombo(e) {
  const [p, v] = e.split("/");
  const variant = v || "normal";
  if (!POLICIES.includes(p) || !VARIANTS.includes(variant)) throw new Error(`조합 형식은 policy/variant 입니다: ${e}`);
  return [p, variant];
}

export function runChoice(data, args) {
  const t0 = Date.now();
  const setups = collectGoalSetups(data, { runs: args.runs, seed: args.seed });
  const combos = args.combos && args.combos.length ? args.combos.map(parseCombo) : DEFAULT_COMBOS.slice();
  for (const e of args.extra || []) {
    const c = parseCombo(e);
    if (!combos.some(([x, y]) => x === c[0] && y === c[1])) combos.push(c);
  }
  const res = {};
  const winVec = {}; // key → [season] → 0/1 배열 (같은 (셋업, 시드) 순서)
  for (const [p, v] of combos) {
    const key = comboKey(p, v);
    res[key] = { policy: p, variant: v, seasons: [] };
    winVec[key] = [];
    for (const season of [1, 2, 3]) {
      const acc = newAcc();
      const vec = [];
      setups[season].forEach((setup) => {
        for (let k = 0; k < args.seeds; k++) {
          const ms = playSetup(data, setup, `${setup.seed}#c${k}`, p, v, args.strip);
          const win = match.getResult(ms).winner === "home";
          accAdd(acc, matchMetrics(ms), win);
          vec.push(win ? 1 : 0);
        }
      });
      res[key].seasons.push(accSummary(acc));
      winVec[key].push(vec);
    }
  }
  const has = (p, v) => !!res[comboKey(p, v)];
  const get = (p, v) => res[comboKey(p, v)];
  /** 짝지은 차이: 평균 = 승률 차, se = 짝별 차이의 표준편차 / √n */
  const diff = (x0, y0) => [0, 1, 2].map((s) => {
    const x = winVec[comboKey(...x0)][s];
    const y = winVec[comboKey(...y0)][s];
    const n = Math.min(x.length, y.length);
    if (!n) return { d: 0, se: 0 };
    let sum = 0;
    for (let i = 0; i < n; i++) sum += x[i] - y[i];
    const mean = sum / n;
    let ss = 0;
    for (let i = 0; i < n; i++) ss += (x[i] - y[i] - mean) ** 2;
    return { d: mean, se: n > 1 ? Math.sqrt(ss / (n - 1) / n) : 0 };
  });
  const perUse = (eff, uses) => eff.map((x, s) => ({ d: uses[s] ? x.d / uses[s] : 0, se: uses[s] ? x.se / uses[s] : 0 }));
  const effects = {};
  const A = ["auto", "normal"];
  if (has(...A)) {
    const auto = get(...A);
    if (has("expected", "normal")) effects.manualGain = diff(["expected", "normal"], A);
    if (has("rec", "normal")) effects.recVsAuto = diff(["rec", "normal"], A);
    if (has("expD", "normal")) effects.manualDefense = diff(["expD", "normal"], A);
    if (has("expA", "normal")) effects.manualAttack = diff(["expA", "normal"], A);
    if (has("random", "normal")) effects.randomVsAuto = diff(["random", "normal"], A);
    if (has("pair", "normal")) effects.pairVsAuto = diff(["pair", "normal"], A);
    if (has("hold", "normal")) effects.holdVsAuto = diff(["hold", "normal"], A);
    if (has("auto", "noUlt")) {
      effects.ult = diff(A, ["auto", "noUlt"]);
      effects.ultPerUse = perUse(effects.ult, auto.seasons.map((s) => s.ultHome));
    }
    if (has("auto", "noActive")) {
      effects.active = diff(A, ["auto", "noActive"]);
      effects.activePerUse = perUse(effects.active, auto.seasons.map((s) => s.activeHome));
    }
    if (has("auto", "noBoth")) effects.all = diff(A, ["auto", "noBoth"]);
  }
  if (has("expected", "normal") && has("expected", "noUlt")) {
    effects.ultManual = diff(["expected", "normal"], ["expected", "noUlt"]);
    effects.ultManualPerUse = perUse(effects.ultManual, get("expected", "normal").seasons.map((s) => s.ultHome));
  }
  return {
    runs: args.runs, seeds: args.seeds, seed: args.seed, strip: args.strip, ms: Date.now() - t0,
    overrides: { sets: args.sets, oppScale: args.oppScale },
    setups: { 1: setups[1].length, 2: setups[2].length, 3: setups[3].length },
    results: res,
    effects,
  };
}

function pct(x) { return `${(x * 100).toFixed(1)}%`; }
function pp(x) { return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}`; }
function fmt(x, d = 2) { return Number.isFinite(x) ? x.toFixed(d) : "-"; }
const avg3 = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

const POLICY_LABEL = {
  auto: "자동 (A안)", expected: "기대 % 최고 (수동 근사)", rec: "추천 버튼만 따름", random: "무작위", pair: "항상 짝 맞힘", hold: "항상 버티기",
  expD: "기대 % 최고 — 수비만", expA: "기대 % 최고 — 공격만",
};
const VARIANT_LABEL = { normal: "", noUlt: " · 필살기 끔", noActive: " · 액티브 끔", noBoth: " · 액티브·필살기 끔" };

export function printChoice(r) {
  console.log(`choice: runs ${r.runs} × seeds ${r.seeds} (seed ${r.seed}), 목표 경기 셋업 S1 ${r.setups[1]} / S2 ${r.setups[2]} / S3 ${r.setups[3]}, 스킬 제거 ${r.strip === "both" ? "양 팀" : "우리 팀만"}, ${r.ms} ms`);
  if (r.overrides.sets.length || r.overrides.oppScale) {
    console.log(`overrides: ${r.overrides.sets.join(" ")}${r.overrides.oppScale ? ` oppScale ${r.overrides.oppScale}` : ""}`);
  }
  const rows = [["결정 방식 / 변형", "S1 승률", "S2 승률", "S3 승률", "골/경기", "우리 액티브/경기", "우리 필살기/경기", "합체기", "간파"]];
  for (const x of Object.values(r.results)) {
    const s = x.seasons;
    rows.push([
      POLICY_LABEL[x.policy] + VARIANT_LABEL[x.variant],
      ...s.map((y) => pct(y.winRate)),
      fmt(avg3(s.map((y) => y.goalsPerMatch))),
      s.map((y) => fmt(y.activeHome, 1)).join("/"),
      s.map((y) => fmt(y.ultHome, 2)).join("/"),
      fmt(avg3(s.map((y) => y.combosHome)), 2),
      fmt(avg3(s.map((y) => y.gaanpaHome)), 2),
    ]);
  }
  console.log("\n[승률 — 같은 셋업·경기 시드]  (사용 수는 S1/S2/S3, 골·합체기·간파는 세 시즌 평균)");
  console.log(table(rows));
  const e = r.effects;
  const line = (label, arr, target) => [label, ...arr.map((x) => `${pp(x.d)} ±${(x.se * 100).toFixed(1)}`), pp(avg3(arr.map((x) => x.d))), target];
  const erows = [["효과 (%p, ±짝지은 표준오차)", "S1", "S2", "S3", "평균", "목표"]];
  const add = (key, label, target = "") => { if (e[key]) erows.push(line(label, e[key], target)); };
  add("manualGain", "수동 이득 (기대 % − 자동)", "+5~10");
  add("manualDefense", "  수비만 기대 % − 자동");
  add("manualAttack", "  공격만 기대 % − 자동");
  add("recVsAuto", "추천 버튼만 따름 − 자동");
  add("ult", "필살기 효과 (자동 − 필살기 끔)");
  add("ultPerUse", "필살기 1회 효과 (÷ 경기당 사용)", "+5~8");
  add("ultManual", "필살기 효과 (수동 근사)");
  add("ultManualPerUse", "필살기 1회 효과 (수동 근사)");
  add("active", "일반 액티브 효과 (자동 − 액티브 끔)");
  add("activePerUse", "일반 액티브 1회 효과");
  add("all", "액티브·필살기 전체 (자동 − 둘 다 끔)", "+6~10");
  add("randomVsAuto", "무작위 − 자동", "< 0");
  add("pairVsAuto", "항상 짝 맞힘 − 자동");
  add("holdVsAuto", "항상 버티기 − 자동");
  if (erows.length > 1) {
    console.log("\n[효과]");
    console.log(table(erows));
  }
  if (!r.results["auto/normal"]) return;
  const auto = r.results["auto/normal"].seasons;
  console.log("\n[자동 경기 사용 수]  (S1 / S2 / S3)");
  console.log(table([
    ["지표", "S1", "S2", "S3", "목표"],
    ["우리 일반 액티브/경기", ...auto.map((s) => fmt(s.activeHome)), "3~4"],
    ["상대 일반 액티브/경기", ...auto.map((s) => fmt(s.activeAway)), "3~4"],
    ["우리 필살기/보유자·경기", ...auto.map((s) => fmt(s.ultPerHolderHome)), "1~2"],
    ["우리 필살기/경기 (보유자 수)", ...auto.map((s) => `${fmt(s.ultHome)} (${fmt(s.holdersHome, 1)})`), ""],
    ["필살 슛 골 확률", ...auto.map((s) => (s.ultShot ? pct(s.ultShotGoalRate) : "-")), "80%대"],
    ["합체기/경기 (우리)", ...auto.map((s) => fmt(s.combosHome, 3)), ""],
    ["골/경기", ...auto.map((s) => fmt(s.goalsPerMatch)), "1.5~3.5"],
  ]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const data = loadData();
  applyConfigOverrides(data.config, args.sets);
  scaleOpponents(data.opponents, args.oppScale);
  const r = runChoice(data, args);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else printChoice(r);
}

if (isEntry(import.meta.url)) {
  main();
  process.exitCode = 0;
}
