// 구역 레슨(L32~L36) 수치 점검용 간이 시뮬 — 기획 확인용, 게임 코드 아님. tools/drafts/lesson_sim.mjs 에서 갈라져 나왔다.
// 실행: node tools/drafts/zone_sim.mjs 400      (FORM=2-2-2|3-1-2|1-3-2|2-3-1, PLANS=ace,team,counter,poss,press)
// 재현 (LESSON_PROTO_PLAN §14.1 · §14.18 의 보정 결과): BASE=3.2 BC=1 GS=0.32 node tools/drafts/zone_sim.mjs 400
//   Q1 진단: + SW='{"GK":{"shoot":5,"dribble":10,"pass":20,"defense":40,"physical":25}}' (GK 가중치 = DF) · + EVENAI=k (덜 큰 선수 보너스)
//   (스크래치패드에서 쓰던 초안을 ZE5 에서 옮겼다. 데이터 경로만 이 파일 기준으로 바꿨다 — 게임 코드 · 테스트는 이 파일을 읽지 않는다.)
// 손잡이(env): BASE 기본 훈련 1인 1턴 · BC 기본 훈련 체력 · GS 카드 위력 배율 · CR 1인 비용률 · UCR 고유 비용률
//             RS/RM/RL/RA 원 크기별 1인 위력 계수(작은 원 = 짝 위력 × RS, 중간 · 큰 원 · 전체 = 예전 범위 합계 × 계수)
//             BR 벤치 회복 · BT 감독 AI 벤치 기준 체력
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("../../data/", import.meta.url));
const CH = JSON.parse(fs.readFileSync(ROOT + "characters.json", "utf8"));
const CFG = JSON.parse(fs.readFileSync(ROOT + "config.json", "utf8"));
const chars = Object.fromEntries((Array.isArray(CH) ? CH : CH.characters).map((c) => [c.id, c]));
const SLOTW = { ...CFG.training.slotWeights, ...(process.env.SW ? JSON.parse(process.env.SW) : {}) }; // 진단용: SW='{"GK":{...}}' 로 가중치 덮어쓰기

const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const SUB = { shoot: "dribble", dribble: "pass", pass: "shoot", defense: "physical", physical: "defense" };
const MAINS = { GK: ["defense", "physical"], DF: ["defense", "physical"], MF: ["dribble", "pass"], FW: ["shoot", "dribble"] };
const ATT_Z = ["shoot", "dribble", "pass"]; // 역습: 공격 구역
const DEF_Z = ["defense", "physical"];
// 경기장 배치: 위 [수비][패스][슈팅] / 아래 [피지컬][드리블] — 큰 원 = 이웃한 두 구역
const ADJ = [["defense", "physical"], ["defense", "pass"], ["pass", "shoot"], ["pass", "dribble"], ["shoot", "dribble"], ["physical", "dribble"]];
const FORMS = {
  "2-2-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "3-1-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["DF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "1-3-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["MF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "2-3-1": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["MF", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
};
const SQUAD = FORMS[process.env.FORM || "2-2-2"];
const COACHES = ["harna", "selia", "ornella", "barbara", "hanna"];
const COACH_TYPE = { harna: "shoot", selia: "dribble", ornella: "pass", barbara: "defense", hanna: "physical", joy: "shoot", irene: "pass" };
const E = (k, d) => Number(process.env[k] ?? d);

const P = {
  // ── 손잡이 ──
  base: E("BASE", 4), baseCost: E("BC", 2), gainScale: E("GS", 0.5), costRate: E("CR", 0.3), uniqueCostRate: E("UCR", 0.2),
  rS: E("RS", 1.0), rM: E("RM", 0.45), rL: E("RL", 0.35), rA: E("RA", 0.17), benchRec: E("BR", 15), benchAt: E("BT", 25),
  // ── 고정 ──
  focusZoneMult: 1.5, specialFocusMult: 2.0, focusWeight: 2,
  focusK: 12, moodK: 3, hojoMult: 1.5, subRatio: 20 / 56, clearTw: E("CTW", 3),
  turns: [6, 7, 8], hand: 3, failLoss: 5, injuryChance: 0.5, coachTypeMult: 1.3, uniquePower: 70, uniqueMult: 1.5,
  stealK: E("SK", 0.3), stealCap: 4,
  possK: E("PK", 0.05), possCap: 8, possNoPass: E("PNOMF", 2),
  pressK: E("PRK", 0.2), pressCostK: E("PRC", 0.2), pressCap: 3,
};
const failRate = (st) => (st >= 60 ? 0.02 : st >= 40 ? 0.1 : st >= 20 ? 0.25 : 0.45);

// 카드 목록 (lesson_sim 그대로) — 대상 변환: line 4라인 → all, 2라인 → large, 1라인 → medium, pair → small
const CARDS = {
  basic: { fam: "common", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 70 },
  coaching: { fam: "common", t: "single", power: 70 },
  cooldown: { fam: "common", t: "none", heal1: 20, extra: 1 },
  fwDrill: { fam: "common", t: "line", lines: ["FW"], power: 80 },
  mfDrill: { fam: "common", t: "line", lines: ["MF"], power: 80 },
  dfDrill: { fam: "common", t: "line", lines: ["DF"], power: 80 },
  gkSession: { fam: "common", t: "line", lines: ["GK"], power: 75 },
  attack: { fam: "common", t: "line", lines: ["MF", "FW"], power: 85 },
  defense: { fam: "common", t: "line", lines: ["GK", "DF"], power: 85 },
  oneTwo: { fam: "common", t: "pair", power: 40, tw: 2 },
  oneOnOne: { fam: "common", t: "single", power: 95, costRate: 0.33 },
  board: { fam: "common", t: "none", draw: 1, extra: 1 },
  icing: { fam: "common", t: "none", heal1: 30 },
  hojoUp: { fam: "ace", t: "none", hojo: 3 },
  focusRoutine: { fam: "ace", t: "none", focus: 2 },
  aceTraining: { fam: "ace", t: "single", power: 60, focusX2: true },
  onePoint: { fam: "ace", t: "single", power: 50, focus: 1 },
  immerse: { fam: "ace", t: "none", hojo: 2, focus: 1 },
  breakLimit: { fam: "ace", t: "single", power: 130, failPlus: 0.1 },
  routine: { fam: "ace", t: "none", singleBonus: 15 },
  breath: { fam: "ace", t: "none", heal1: 25, focus: 1 },
  highFive: { fam: "team", t: "none", mood: 3 },
  setPiece: { fam: "team", t: "line", lines: ["MF", "FW"], power: 60, mood: 2 },
  passMove: { fam: "team", t: "pair", power: 30, mood: 1, tw: 2 },
  oneTeam: { fam: "team", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 56, mood: 2 },
  chant: { fam: "team", t: "none", mood: 2, healAll: 5 },
  moodMaker: { fam: "team", t: "none", moodX2: true, exhaust: true },
  breathTogether: { fam: "team", t: "none", noDecay: 3 },
  linkLine: { fam: "team", t: "line", lines: ["GK", "DF"], power: 70, perMood: 5 },
  lineUp: { fam: "counter", t: "line", lines: ["GK", "DF"], power: 64, stealSet: 2 },
  longBall: { fam: "counter", t: "none", steal: 1, extra: 1 },
  counterSprint: { fam: "counter", t: "line", lines: ["MF", "FW"], power: 72, stealPer: 0.4 },
  finisher: { fam: "counter", t: "single", attackOnly: true, power: 60, stealPer: 0.45 },
  recover: { fam: "counter", t: "none", healLines: ["GK", "DF"], heal: 12, steal: 1 },
  allCounter: { fam: "counter", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 60, twOnSteal: 2 },
  triangle: { fam: "poss", t: "pair", power: 36, tw: 2, poss: 2 },
  circulate: { fam: "poss", t: "none", poss: 3, heal1: 15 },
  tempo: { fam: "poss", t: "none", possGuard: 1, draw: 1 },
  midControl: { fam: "poss", t: "line", lines: ["MF"], power: 68, poss: 2 },
  dominate: { fam: "poss", t: "line", lines: ["MF", "FW"], power: 64, possX2: true },
  backBuild: { fam: "poss", t: "line", lines: ["GK", "DF"], power: 68, possKeep: true },
  frontPress: { fam: "press", t: "line", lines: ["MF", "FW"], power: 68, press: 1 },
  fullPress: { fam: "press", t: "none", press: 2, extra: 1 },
  sixSec: { fam: "press", t: "single", power: 56, press: 1, noPressCost: true },
  dropLine: { fam: "press", t: "none", dropLine: true, nextNoFail: true },
  allOut: { fam: "press", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 60, perPress: 20 },
  gegen: { fam: "press", t: "line", lines: ["MF", "FW"], power: 80, noPressCostAlways: true },
  harna: { fam: "coach", coach: "harna", t: "line", lines: ["FW"], power: 80, lastTurnX2: true },
  selia: { fam: "coach", coach: "selia", t: "pair", power: 40, draw: 1 },
  ornella: { fam: "coach", coach: "ornella", t: "line", lines: ["MF", "FW"], power: 85, tw: 2 },
  barbara: { fam: "coach", coach: "barbara", t: "line", lines: ["GK", "DF"], power: 85, noFail: true },
  hanna: { fam: "coach", coach: "hanna", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 70, endHealAll: 5 },
};
// 고유 카드: 주인만 대상(단일). 주인이 자기 포지션 주 스탯 구역에 서 있으면 위력 ×1.5. 캐릭터 효과(예전 지원 모드)는 항상.
const UNIQUE = {
  ch_spirit_keeper: { nextNoFail: true, healOwner: 15 },
  ch_dwarf_wall: { healLines: ["GK", "DF"], heal: 10 },
  ch_human_captain: { tw: 3, healAll: 3 },
  ch_elf_playmaker: { nextPct: 0.4 },
  ch_human_runner: { draw: 1 },
  ch_wolf_winger: { tw: 1, nextPairPct: 0.5 },
  ch_giant_striker: { nextCostZero: true },
  ch_cat_trickster: { extra: 1, ownerCost: 5 },
};
const REWARD_POOL = {
  common: ["fwDrill", "mfDrill", "dfDrill", "gkSession", "attack", "defense", "oneTwo", "oneOnOne", "board", "icing"],
  ace: ["hojoUp", "focusRoutine", "aceTraining", "onePoint", "immerse", "breakLimit", "routine", "breath"],
  team: ["highFive", "setPiece", "passMove", "oneTeam", "chant", "moodMaker", "breathTogether", "linkLine"],
  counter: ["lineUp", "longBall", "counterSprint", "finisher", "recover", "allCounter"],
  poss: ["triangle", "circulate", "tempo", "midControl", "dominate", "backBuild"],
  press: ["frontPress", "fullPress", "sixSec", "dropLine", "allOut", "gegen"],
};
const areaOf = (d) => (d.t === "pair" ? "small" : d.t === "line" ? (d.lines.length >= 4 ? "all" : d.lines.length === 2 ? "large" : "medium") : d.t);
// 1인 위력: single · owner = 위력, small = 짝 위력 × RS, medium/large/all = 예전 합계 × 계수
const perPersonPower = (area, power) => area === "small" ? power * P.rS : area === "medium" ? power * P.rM : area === "large" ? power * P.rL : area === "all" ? power * P.rA : power;

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function makeTeam() {
  return SQUAD.map(([pos, id], i) => ({ i, pos, id, growth: chars[id].growth, stamina: 100, injuredLessons: 0, zone: null, bench: false, stats: Object.fromEntries(STATS.map((s) => [s, 0])) }));
}

function runLesson(team, deckIds, focus, special, turns, r, plan, acc) {
  const L = { score: 0, base: 0, card: 0, sub: 0, tw: 0, fails: 0, injuries: 0, plays: 0, benches: 0, benchTurns: 0, turnsN: 0 };
  const avail = (p) => p.injuredLessons === 0;
  const onField = (p) => avail(p) && !p.bench;
  let deck = shuffle(deckIds.filter((c) => !(c.unique && !avail(team[c.owner]))).slice(), r);
  let discard = [];
  const exhausted = new Set();
  const B = { hojo: 0, focus: 0, mood: 0, noDecay: 0, nextPct: 0, nextPairPct: 0, nextNoFail: false, nextCostZero: false, singleBonus: 0, extraDraw: 0, steal: 0, poss: 0, possGuard: 0, press: 0 };
  const draw = (n) => { const h = []; for (let k = 0; k < n; k++) { if (!deck.length) { deck = shuffle(discard, r); discard = []; } if (!deck.length) break; h.push(deck.pop()); } return h; };
  const zoneMult = (z) => (z === focus ? (special ? P.specialFocusMult : P.focusZoneMult) : 1);
  const pref = (p) => (MAINS[p.pos].includes(p.zone) ? 1.2 : 0.8); // 감독 AI: 주 스탯 구역 선호
  // 진단용 EVENAI=k: 감독 AI가 덜 큰 선수를 (팀 평균 주 스탯 / 그 선수 주 스탯)^k 만큼 더 쳐준다 (기본 0 = 끔)
  const EVK = E("EVENAI", 0);
  const mainSum = (p) => MAINS[p.pos].reduce((a, k) => a + p.stats[k], 0);
  const evenW = (p) => { if (!EVK) return 1; const avg = team.reduce((a, q) => a + mainSum(q), 0) / 7; return Math.pow((avg + 50) / (mainSum(p) + 50), EVK); };
  const pscore = (p) => evenW(p) * p.growth[p.zone] * zoneMult(p.zone) * pref(p) - (p.stamina < 40 ? 0.4 : 0) - (p.stamina < 20 ? 0.8 : 0);

  function scatter() {
    team.forEach((p) => {
      p.bench = false;
      if (!avail(p)) { p.zone = null; return; }
      const w = STATS.map((s) => SLOTW[p.pos][s] * (s === focus ? P.focusWeight : 1));
      let x = r() * w.reduce((a, b) => a + b, 0), k = 0;
      while (x >= w[k]) { x -= w[k]; k++; }
      p.zone = STATS[k];
    });
  }
  // 대상 후보: 원은 구역 무리 단위로 근사
  function candidates(def, c) {
    const live = team.filter(onField);
    const area = def.area;
    if (area === "owner") { const o = team[c.owner]; return onField(o) ? [[o]] : []; }
    if (area === "single") return (def.attackOnly ? live.filter((p) => ATT_Z.includes(p.zone)) : live).map((p) => [p]);
    if (area === "all") return live.length ? [live] : [];
    const byZone = Object.fromEntries(STATS.map((z) => [z, live.filter((p) => p.zone === z)]));
    if (area === "small") return STATS.filter((z) => byZone[z].length).map((z) => byZone[z].slice().sort((a, b) => pscore(b) - pscore(a)).slice(0, 2));
    if (area === "medium") return STATS.filter((z) => byZone[z].length).map((z) => byZone[z]);
    if (area === "large") return ADJ.map(([a, b]) => [...byZone[a], ...byZone[b]]).filter((g) => g.length);
    return [];
  }
  function cardDef(c) {
    if (c.unique) {
      const o = team[c.owner];
      const main = MAINS[o.pos].includes(o.zone);
      return { fam: "unique", t: "owner", area: "owner", power: P.uniquePower * (main ? P.uniqueMult : 1), costRate: P.uniqueCostRate, ...UNIQUE[c.id], ownerIdx: c.owner };
    }
    const d = { ...CARDS[c.id], id: c.id };
    if (c.plus && d.power) d.power = Math.round(d.power * 1.25);
    d.area = areaOf(d);
    return d;
  }
  function resolve(def, tg, turnIdx) {
    let per = [];
    if (tg.length) {
      let pw = def.power;
      if (def.perMood) pw += def.perMood * B.mood;
      if (def.perPress) pw += def.perPress * B.press;
      per = tg.map(() => perPersonPower(def.area, pw));
      const fsh = B.focus * P.focusK * (def.focusX2 ? 2 : 1);
      per = per.map((v) => v + fsh / tg.length);
      if (def.area === "single" || def.area === "owner") per = per.map((v) => v + B.singleBonus);
    }
    let mult = 1 + B.nextPct + (def.area === "small" ? B.nextPairPct : 0);
    if (B.hojo > 0 && tg.length) mult *= P.hojoMult;
    if (def.lastTurnX2 && turnIdx === turns - 1) mult *= 2;
    const hasAtt = tg.some((p) => ATT_Z.includes(p.zone));
    const isDefOnly = tg.length > 0 && !hasAtt;
    const hasPass = tg.some((p) => p.zone === "pass");
    if (plan === "counter" && hasAtt && B.steal > 0) mult *= 1 + (def.stealPer || P.stealK) * B.steal;
    if (plan === "poss" && tg.length && B.poss > 0) mult *= 1 + P.possK * B.poss * (def.possX2 ? 2 : 1);
    let costMult = 1;
    if (plan === "press" && tg.length && B.press > 0) { mult *= 1 + P.pressK * B.press; if (!(def.noPressCost && B.press >= 2) && !def.noPressCostAlways) costMult = 1 + P.pressCostK * B.press; }
    const rate = (def.costRate || P.costRate) * costMult;
    const costs = per.map((v) => (B.nextCostZero ? 0 : Math.round(v * rate)));
    const fp = tg.length && !def.noFail && !B.nextNoFail ? Math.min(0.95, Math.max(...tg.map((p) => failRate(p.stamina))) + (def.failPlus || 0)) : 0;
    const gains = tg.map((p, k) => Math.round(per[k] * p.growth[p.zone] * mult * zoneMult(p.zone) * P.gainScale * (def.coach && COACH_TYPE[def.coach] === p.zone ? P.coachTypeMult : 1)));
    return { def, tg, per, gains, costs, fp, hasAtt, isDefOnly, hasPass };
  }
  function value(res, remaining) {
    const { def, tg, gains, fp } = res;
    let v = gains.reduce((a, g, k) => a + g * pref(tg[k]) * evenW(tg[k]), 0) * (1 - fp) - fp * (P.failLoss + 40);
    const avg = 75;
    if (def.hojo) v += 0.5 * avg * Math.min(def.hojo, remaining);
    if (def.focus) v += def.focus * P.focusK * remaining * 0.9;
    if (def.mood) { const m = def.mood, n = Math.min(remaining + 1, B.mood + m); v += m * P.moodK * 7 * n * 0.8; }
    if (def.moodX2) v += B.mood * P.moodK * 7 * Math.min(remaining + 1, B.mood) * 0.8;
    if (def.noDecay) v += B.mood * P.moodK * 7 * Math.min(def.noDecay, remaining) * 0.6;
    if (def.extra) v += avg * 0.8;
    if (def.draw) v += avg * 0.25 * def.draw;
    if (def.nextPct) v += avg * def.nextPct;
    if (def.nextPairPct) v += 20;
    if (def.nextNoFail || def.nextCostZero) v += 15;
    if (def.singleBonus) v += def.singleBonus * remaining * 0.7;
    const lowSt = team.filter((p) => avail(p) && p.stamina < 50).length;
    if (def.heal1) v += Math.min(def.heal1, 40) * 0.6 + lowSt * 4;
    if (def.healAll) v += def.healAll * 7 * 0.3 + lowSt * 2;
    if (def.healOwner || def.heal) v += 8 + lowSt * 2;
    if (def.tw) v += def.tw * 2;
    if (plan === "counter") {
      const sg = res.isDefOnly ? def.stealSet || 1 : def.area === "none" ? def.steal || 0 : 0;
      if (sg) v += Math.min(P.stealCap - B.steal, sg) * P.stealK * 40 * (remaining > 0 ? 0.8 : 0);
    }
    if (plan === "poss") {
      const g = (tg.length && res.hasPass ? 1 : 0) + (def.poss || 0);
      v += Math.min(P.possCap - B.poss, g) * P.possK * 40 * remaining * 0.7;
      if (tg.length && !B.possGuard) v -= fp * B.poss * P.possK * 40 * remaining;
      if (tg.length && !res.hasPass && !def.possKeep) v -= Math.min(P.possNoPass, B.poss) * P.possK * 40 * remaining * 0.7;
      if (def.possGuard) v += B.poss * P.possK * 40 * remaining * 0.1 + 5;
    }
    if (plan === "press") {
      if (def.press) v += Math.min(P.pressCap - B.press, def.press) * (P.pressK * 40 * remaining * 0.6 - 4);
      if (def.dropLine) v += B.press * 7 * 6 * 0.3 + lowSt * 3 - (remaining > 1 ? B.press * P.pressK * 40 * 0.8 : 0);
    }
    v -= res.costs.reduce((a, b) => a + b, 0) * 0.15;
    return v;
  }
  function apply(res, c) {
    const { def, tg, gains, costs, fp } = res;
    L.plays++;
    if (tg.length) {
      let failer = null;
      if (fp > 0 && r() < fp) failer = tg.reduce((a, b) => (failRate(b.stamina) > failRate(a.stamina) ? b : a));
      tg.forEach((p, k) => {
        p.stamina = Math.max(0, p.stamina - costs[k]);
        acc.targetCount[p.i]++;
        if (p === failer) { p.stats[p.zone] -= P.failLoss; L.score -= P.failLoss; L.card -= P.failLoss; L.fails++; if (r() < P.injuryChance) { p.injuredLessons = 2; L.injuries++; } return; }
        p.stats[p.zone] += gains[k]; L.score += gains[k]; L.card += gains[k];
        const sg = Math.round(gains[k] * P.subRatio * p.growth[SUB[p.zone]]); p.stats[SUB[p.zone]] += sg; L.sub += sg;
      });
      const ok = tg.length - (failer ? 1 : 0);
      if (tg.length >= 2) L.tw += Math.max(0, ok - 1);
      if (B.hojo > 0) B.hojo--;
      B.nextPct = 0; B.nextNoFail = false; B.nextCostZero = false;
      if (def.area === "small") B.nextPairPct = 0;
      if (plan === "counter") {
        if (res.hasAtt) { if (B.steal > 0) { acc.stealUsed += B.steal; acc.stealPays++; if (def.twOnSteal) L.tw += def.twOnSteal; } B.steal = 0; }
        else if (!failer) B.steal = Math.min(P.stealCap, B.steal + (def.stealSet || 1));
      }
      if (plan === "poss") {
        if (failer) { if (B.possGuard > 0) B.possGuard--; else { acc.possLost += B.poss; acc.possBreaks++; B.poss = 0; } }
        else if (res.hasPass) B.poss = Math.min(P.possCap, B.poss + 1);
        else if (!def.possKeep) B.poss = Math.max(0, B.poss - P.possNoPass);
      }
      if (plan === "press") { acc.pressSum += B.press; acc.pressN++; }
    }
    if (plan === "counter" && def.steal) B.steal = Math.min(P.stealCap, B.steal + def.steal);
    if (plan === "poss" && def.poss) B.poss = Math.min(P.possCap, B.poss + def.poss);
    if (plan === "poss" && def.possGuard) B.possGuard += def.possGuard;
    if (plan === "press" && def.press) B.press = Math.min(P.pressCap, B.press + def.press);
    if (plan === "press" && def.dropLine) { team.filter(avail).forEach((p) => (p.stamina = Math.min(100, p.stamina + 6 * B.press))); B.press = 0; }
    if (def.tw) L.tw += def.tw;
    if (def.hojo) B.hojo += def.hojo;
    if (def.focus) B.focus += def.focus;
    if (def.mood) B.mood += def.mood;
    if (def.moodX2) B.mood *= 2;
    if (def.noDecay) B.noDecay = Math.max(B.noDecay, def.noDecay);
    if (def.nextPct) B.nextPct += def.nextPct;
    if (def.nextPairPct) B.nextPairPct += def.nextPairPct;
    if (def.nextNoFail) B.nextNoFail = true;
    if (def.nextCostZero) B.nextCostZero = true;
    if (def.singleBonus) B.singleBonus = Math.max(B.singleBonus, def.singleBonus);
    if (def.draw) B.extraDraw += def.draw;
    if (def.heal1) { const p = team.filter(avail).sort((a, b) => a.stamina - b.stamina)[0]; if (p) p.stamina = Math.min(100, p.stamina + def.heal1); }
    if (def.healAll) team.forEach((p) => (p.stamina = Math.min(100, p.stamina + def.healAll)));
    if (def.healOwner) { const p = team[def.ownerIdx]; p.stamina = Math.min(100, p.stamina + def.healOwner); }
    if (def.healLines) team.filter((p) => def.healLines.includes(p.pos)).forEach((p) => (p.stamina = Math.min(100, p.stamina + def.heal)));
    if (def.ownerCost) { const p = team[def.ownerIdx]; p.stamina = Math.max(0, p.stamina - def.ownerCost); }
    if (def.exhaust) exhausted.add(c);
    if (def.endHealAll) L.endHeal = (L.endHeal || 0) + def.endHealAll;
    return def.extra || 0;
  }

  for (let t = 0; t < turns; t++) {
    scatter();
    // 벤치: 기준 아래로 지친 선수를 끌어낸다 (한 턴 최대 2명)
    const tired = team.filter((p) => avail(p) && p.stamina < P.benchAt).sort((a, b) => a.stamina - b.stamina).slice(0, 2);
    tired.forEach((p) => { p.bench = true; L.benches++; });
    if (tired.length) L.benchTurns++;
    L.turnsN++;
    const hand = draw(P.hand + B.extraDraw); B.extraDraw = 0;
    let plays = 1;
    const remaining = turns - t - 1;
    while (plays > 0 && hand.length) {
      let best = null, bestV = -Infinity;
      for (const c of hand) {
        const def = cardDef(c);
        const opts = def.area === "none" ? [[]] : candidates(def, c);
        for (const tg of opts) { const res = resolve(def, tg, t); const v = value(res, remaining); if (v > bestV) { bestV = v; best = { c, res }; } }
      }
      if (!best || bestV <= 0) break; // 턴 끝
      hand.splice(hand.indexOf(best.c), 1);
      plays--;
      plays += apply(best.res, best.c);
      if (!best.res.def.exhaust) discard.push(best.c);
    }
    discard.push(...hand);
    // 턴 끝: 기본 훈련(분위기 스택마다 +moodK×GS) · 벤치 회복
    const baseUnit = P.base + B.mood * P.moodK * P.gainScale;
    team.forEach((p) => {
      if (!avail(p)) return;
      if (p.bench) { p.stamina = Math.min(100, p.stamina + P.benchRec); return; }
      const g = Math.round(baseUnit * p.growth[p.zone] * zoneMult(p.zone));
      const gm = B.mood > 0 ? Math.round(g * (baseUnit - P.base) / baseUnit) : 0; // 분위기 몫은 카드 쪽으로 센다
      p.stats[p.zone] += g; L.score += g; L.base += g - gm; L.card += gm; acc.moodPart += gm;
      p.stamina = Math.max(0, p.stamina - P.baseCost);
    });
    if (B.mood > 0) { if (B.noDecay > 0) B.noDecay--; else B.mood = Math.max(0, B.mood - 1); }
  }
  team.forEach((p) => (p.bench = false));
  if (L.endHeal) team.forEach((p) => (p.stamina = Math.min(100, p.stamina + L.endHeal)));
  return L;
}

function runOnce(seed, plan) {
  const r = rng(seed);
  const team = makeTeam();
  let deck = [...SQUAD.map(([, id], i) => ({ id, unique: true, owner: i })), { id: "basic" }, { id: "coaching" }, { id: "cooldown" }];
  const out = { lessons: [], tw: 0, injuries: 0, fails: 0, benches: 0, benchTurns: 0, turnsN: 0, weekRests: 0, coachPicks: 0, base: 0, card: 0, sub: 0, targetCount: Array(7).fill(0), stealUsed: 0, stealPays: 0, possLost: 0, possBreaks: 0, pressSum: 0, pressN: 0, moodPart: 0 };
  for (let season = 0; season < 3; season++) {
    const turns = P.turns[season];
    for (const wk of ["L", "F", "L", "F", "P"]) {
      const avgSt = team.reduce((a, p) => a + p.stamina, 0) / 7;
      if (wk === "F") { if (avgSt < 65) { team.forEach((p) => (p.stamina = Math.min(100, p.stamina + 40))); out.weekRests++; } else out.tw += 3; continue; }
      if (avgSt < 40) { team.forEach((p) => (p.stamina = Math.min(100, p.stamina + 40))); out.weekRests++; continue; }
      const specials = wk === "L" ? shuffle(STATS.slice(), r).slice(0, 1) : [];
      // 집중 구역: 특별 표시 우선(70%), 아니면 팀 합계가 가장 낮은 스탯
      const totals = Object.fromEntries(STATS.map((s) => [s, team.reduce((a, p) => a + p.stats[s], 0)]));
      const focus = specials.length && r() < 0.7 ? specials[0] : STATS.slice().sort((a, b) => totals[a] - totals[b])[0];
      const special = specials.includes(focus);
      const L = runLesson(team, deck, focus, special, turns, r, plan, out);
      team.forEach((p) => p.injuredLessons > 0 && p.injuredLessons--);
      out.lessons.push({ season, special, score: L.score });
      out.tw += L.tw + P.clearTw; out.injuries += L.injuries; out.fails += L.fails; out.benches += L.benches; out.benchTurns += L.benchTurns; out.turnsN += L.turnsN;
      out.base += L.base; out.card += L.card; out.sub += L.sub;
      const pool = [...REWARD_POOL.common, ...REWARD_POOL[plan], ...COACHES.flatMap((c) => [c, c])];
      const offer = shuffle(pool.slice(), r).slice(0, 3);
      const pri = (id) => (CARDS[id].fam === plan ? 3 : CARDS[id].fam === "coach" ? 2 : 1);
      const pick = offer.sort((a, b) => pri(b) - pri(a))[0];
      if (deck.length < 20) { deck.push({ id: pick }); if (CARDS[pick].fam === "coach") out.coachPicks++; }
      if (wk === "P") { const up = deck.find((c) => !c.unique && !c.plus && CARDS[c.id].power); if (up) up.plus = true; }
    }
  }
  out.stats = team.map((p) => p.stats);
  return out;
}

const N = Number(process.argv[2] || 400);
const JSON_OUT = process.env.JSON === "1";
const rows = [];
for (const plan of (process.env.PLANS || "ace,team,counter,poss,press").split(",")) {
  const A = { bySeason: [[], [], []], bySeasonN: [[], [], []], bySeasonS: [[], [], []], base: 0, card: 0, sub: 0, tw: 0, inj: 0, fails: 0, benches: 0, benchTurns: 0, turnsN: 0, weekRests: 0, coachPicks: 0, tc: Array(7).fill(0), su: 0, sp: 0, pl: 0, pb: 0, ps: 0, pn: 0, mood: 0, benchRuns2: 0 };
  A.pstats = SQUAD.map(() => Object.fromEntries(STATS.map((s) => [s, 0])));
  for (let s = 1; s <= N; s++) {
    const o = runOnce(s * 7919, plan);
    o.lessons.forEach((l) => { A.bySeason[l.season].push(l.score); (l.special ? A.bySeasonS : A.bySeasonN)[l.season].push(l.score); });
    A.base += o.base; A.card += o.card; A.sub += o.sub; A.tw += o.tw; A.inj += o.injuries; A.fails += o.fails; A.benches += o.benches; A.benchTurns += o.benchTurns; A.turnsN += o.turnsN; A.weekRests += o.weekRests; A.coachPicks += o.coachPicks;
    A.su += o.stealUsed; A.sp += o.stealPays; A.pl += o.possLost; A.pb += o.possBreaks; A.ps += o.pressSum; A.pn += o.pressN; A.mood += o.moodPart;
    if (o.benches >= 2) A.benchRuns2++;
    o.targetCount.forEach((n, i) => (A.tc[i] += n));
    o.stats.forEach((st, i) => STATS.forEach((k) => (A.pstats[i][k] += st[k])));
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const pct = (a, q) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(q * (b.length - 1))]; };
  const mainOf = (i) => { const m = MAINS[SQUAD[i][0]]; return (A.pstats[i][m[0]] + A.pstats[i][m[1]]) / N; };
  const totOf = (i) => STATS.reduce((a, k) => a + A.pstats[i][k], 0) / N;
  const ms = SQUAD.map((_, i) => mainOf(i)), ts = SQUAD.map((_, i) => totOf(i));
  const zoneGain = (A.base + A.card) / N;
  const row = {
    plan, growth: Math.round((A.base + A.card + A.sub) / N), zone: Math.round(zoneGain), base: Math.round(A.base / N), card: Math.round(A.card / N), sub: Math.round(A.sub / N),
    baseShare: +(A.base / N / zoneGain).toFixed(3), even: +(Math.min(...ms) / Math.max(...ms)).toFixed(2), evenTot: +(Math.min(...ts) / Math.max(...ts)).toFixed(2), mains: ms.map((x) => Math.round(x)),
    inj: +(A.inj / N).toFixed(2), fails: +(A.fails / N).toFixed(2), bench: +(A.benches / N).toFixed(1), benchTurnPct: +(100 * A.benchTurns / A.turnsN).toFixed(1), benchRuns2: +(100 * A.benchRuns2 / N).toFixed(0),
    weekRests: +(A.weekRests / N).toFixed(1), lessons: +(A.bySeason.flat().length / N).toFixed(2), tw: Math.round(A.tw / N), coach: +(A.coachPicks / N).toFixed(1), moodPart: Math.round(A.mood / N),
    seasons: A.bySeason.map((a, i) => ({ mean: Math.round(mean(a)), p30: pct(a, 0.3), p70: pct(a, 0.7), p90: pct(a, 0.9), nP30: pct(A.bySeasonN[i], 0.3), nP90: pct(A.bySeasonN[i], 0.9), sP30: pct(A.bySeasonS[i], 0.3), sP90: pct(A.bySeasonS[i], 0.9), sMean: Math.round(mean(A.bySeasonS[i])), nMean: Math.round(mean(A.bySeasonN[i])) })),
    tc: A.tc.map((n) => +(n / N).toFixed(1)),
    steal: plan === "counter" ? `${(A.sp / N).toFixed(1)}회 · ${(A.su / Math.max(1, A.sp)).toFixed(2)}스택` : "",
    poss: plan === "poss" ? `깨짐 ${(A.pb / N).toFixed(2)}회 · ${(A.pl / Math.max(1, A.pb)).toFixed(1)}스택` : "",
    press: plan === "press" ? `평균 단계 ${(A.ps / Math.max(1, A.pn)).toFixed(2)}` : "",
  };
  rows.push(row);
  if (!JSON_OUT) {
    console.log(`\n== ${plan} (${N} runs, ${process.env.FORM || "2-2-2"}) ==`);
    console.log(`성장/런 ${row.growth} (구역 ${row.zone} = 기본 ${row.base} + 카드 ${row.card}, 부 ${row.sub})  기본 비중 ${(row.baseShare * 100).toFixed(1)}%  분위기 몫 ${row.moodPart}`);
    console.log(`고르게: 주스탯 최저/최고 ${row.even} [${row.mains.join(",")}]  5스탯 합 최저/최고 ${row.evenTot}`);
    console.log(`실패 ${row.fails}  부상 ${row.inj}  벤치 ${row.bench}회/런 (벤치 있는 턴 ${row.benchTurnPct}%, 2회 이상 런 ${row.benchRuns2}%)  주 휴식 ${row.weekRests}  레슨 ${row.lessons}회  팀워크 ${row.tw}  코치 ${row.coach}장`);
    row.seasons.forEach((s, i) => console.log(`시즌${i + 1} 점수: 평균 ${s.mean} p30 ${s.p30} p70 ${s.p70} p90 ${s.p90} | 일반 평균 ${s.nMean} p30 ${s.nP30} p90 ${s.nP90} | 특별 평균 ${s.sMean} p30 ${s.sP30} p90 ${s.sP90}`));
    console.log(`대상 횟수/런: ${SQUAD.map(([pos, id], i) => `${chars[id].name}(${pos}) ${row.tc[i]}`).join(" · ")}  ${row.steal}${row.poss}${row.press}`);
  }
}
if (JSON_OUT) console.log(JSON.stringify({ P, form: process.env.FORM || "2-2-2", rows }));
