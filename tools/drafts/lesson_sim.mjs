// 카드 레슨 개편안(docs/OUTGAME_LESSON_draft.md · OUTGAME_CARDS_draft.md) 수치 점검용 간이 시뮬 — 기획 확인용, 게임 코드 아님
// 실행: GS=0.5 CR=0.3 UCR=0.2 CTW=3 SK=0.3 PK=0.05 PRK=0.2 PRC=0.2 node tools/drafts/lesson_sim.mjs 400   (카드 목록 초안 7장의 조건)
//   FORM=2-2-2|3-1-2|1-3-2|2-3-1 로 포메이션, PLANS=ace,team,counter,poss,press 로 방침을 고른다.
// 카드 위력은 처음 생각한 값(문서 위력 × 2)으로 적혀 있고 GS=0.5 가 절반으로 줄인다.
import fs from "node:fs";
const ROOT = "C:/Users/민철/Desktop/soccer/data/";
const CH = JSON.parse(fs.readFileSync(ROOT + "characters.json", "utf8"));
const chars = Object.fromEntries((Array.isArray(CH) ? CH : CH.characters).map((c) => [c.id, c]));

const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const SUB = { shoot: "dribble", dribble: "pass", pass: "shoot", defense: "physical", physical: "defense" };
const MAINS = { GK: ["defense", "physical"], DF: ["defense", "physical"], MF: ["dribble", "pass"], FW: ["shoot", "dribble"] };
const FORMS = {
  "2-2-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "3-1-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["DF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "1-3-2": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["MF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["FW", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
  "2-3-1": [["GK", "ch_spirit_keeper"], ["DF", "ch_dwarf_wall"], ["DF", "ch_human_captain"], ["MF", "ch_elf_playmaker"], ["MF", "ch_human_runner"], ["MF", "ch_wolf_winger"], ["FW", "ch_giant_striker"]],
};
const SQUAD = FORMS[process.env.FORM || "2-2-2"];
const ATTL = ["MF", "FW"];
const COACHES = ["harna", "selia", "ornella", "barbara", "hanna"]; // 기본 서포트 6장 중 친구 타입(루미) 제외
const COACH_TYPE = { harna: "shoot", selia: "dribble", ornella: "pass", barbara: "defense", hanna: "physical", joy: "shoot", irene: "pass" };

const P = {
  focusK: 12, moodK: 3, hojoMult: 1.5, subRatio: 20 / 56, autoRatio: 0.35, costRate: Number(process.env.CR || 0.3), uniqueCostRate: Number(process.env.UCR || 0.2), gainScale: Number(process.env.GS || 1), clearTw: Number(process.env.CTW || 0),
  turns: [6, 7, 8], hand: 3, failLoss: 5, injuryChance: 0.5, coachTypeMult: 1.3, special: 0.5, uniqueMult: 1.5,
  stealK: Number(process.env.SK || 0.25), stealCap: 4,
  possK: Number(process.env.PK || 0.05), possCap: 8, possFailHalf: process.env.PHALF === "1", possNoMF: Number(process.env.PNOMF ?? 2),
  pressK: Number(process.env.PRK || 0.2), pressCostK: Number(process.env.PRC || 0.3), pressCap: 3, pressHeal: 4,
};
const failRate = (st) => (st >= 60 ? 0.02 : st >= 40 ? 0.1 : st >= 20 ? 0.25 : 0.45);

// ── 카드 목록 초안 ── t: 대상 (single 지명 / pair 짝 / line 범위 / owner 고유 / none)
// power: single·pair·owner = 1인, line = 합계. lines: 범위 대상 포지션
const CARDS = {
  // 공용 시작
  basic: { fam: "common", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 70 },
  coaching: { fam: "common", t: "single", power: 70 },
  cooldown: { fam: "common", t: "none", heal1: 20, extra: 1 },
  // 공용 보상
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
  // 에이스형
  hojoUp: { fam: "ace", t: "none", hojo: 3 },
  focusRoutine: { fam: "ace", t: "none", focus: 2 },
  aceTraining: { fam: "ace", t: "single", power: 60, focusX2: true },
  onePoint: { fam: "ace", t: "single", power: 50, focus: 1 },
  immerse: { fam: "ace", t: "none", hojo: 2, focus: 1 },
  breakLimit: { fam: "ace", t: "single", power: 130, failPlus: 0.1 },
  routine: { fam: "ace", t: "none", singleBonus: 15 },
  breath: { fam: "ace", t: "none", heal1: 25, focus: 1 },
  // 팀형
  highFive: { fam: "team", t: "none", mood: 3 },
  setPiece: { fam: "team", t: "line", lines: ["MF", "FW"], power: 60, mood: 2 },
  passMove: { fam: "team", t: "pair", power: 30, mood: 1, tw: 2 },
  oneTeam: { fam: "team", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 56, mood: 2 },
  chant: { fam: "team", t: "none", mood: 2, healAll: 5 },
  moodMaker: { fam: "team", t: "none", moodX2: true, exhaust: true },
  breathTogether: { fam: "team", t: "none", noDecay: 3 },
  linkLine: { fam: "team", t: "line", lines: ["GK", "DF"], power: 70, perMood: 5 },
  // 역습형 (탈취) — 시뮬 단위 = 문서 위력 × 2
  lineUp: { fam: "counter", t: "line", lines: ["GK", "DF"], power: 64, stealSet: 2 },
  longBall: { fam: "counter", t: "none", steal: 1, extra: 1 },
  counterSprint: { fam: "counter", t: "line", lines: ["MF", "FW"], power: 72, stealPer: 0.4 },
  finisher: { fam: "counter", t: "single", attackOnly: true, power: 60, stealPer: 0.45 },
  recover: { fam: "counter", t: "none", healLines: ["GK", "DF"], heal: 12, steal: 1 },
  allCounter: { fam: "counter", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 60, twOnSteal: 2 },
  // 점유형 (점유) — MF 없는 대상 카드는 점유 −2 (possKeep 카드 제외)
  triangle: { fam: "poss", t: "pair", power: 36, tw: 2, poss: 2 },
  circulate: { fam: "poss", t: "none", poss: 3, heal1: 15 },
  tempo: { fam: "poss", t: "none", possGuard: 1, draw: 1 },
  midControl: { fam: "poss", t: "line", lines: ["MF"], power: 68, poss: 2 },
  dominate: { fam: "poss", t: "line", lines: ["MF", "FW"], power: 64, possX2: true },
  backBuild: { fam: "poss", t: "line", lines: ["GK", "DF"], power: 68, possKeep: true },
  // 압박형 (압박 단계)
  frontPress: { fam: "press", t: "line", lines: ["MF", "FW"], power: 68, press: 1 },
  fullPress: { fam: "press", t: "none", press: 2, extra: 1 },
  sixSec: { fam: "press", t: "single", power: 56, press: 1, noPressCost: true },
  dropLine: { fam: "press", t: "none", dropLine: true, nextNoFail: true },
  allOut: { fam: "press", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 60, perPress: 20 },
  gegen: { fam: "press", t: "line", lines: ["MF", "FW"], power: 80, noPressCostAlways: true },
  // 코치 (유대 80 강화판은 생략)
  harna: { fam: "coach", coach: "harna", t: "line", lines: ["FW"], power: 80, lastTurnX2: true },
  selia: { fam: "coach", coach: "selia", t: "pair", power: 40, draw: 1 },
  ornella: { fam: "coach", coach: "ornella", t: "line", lines: ["MF", "FW"], power: 85, tw: 2 },
  barbara: { fam: "coach", coach: "barbara", t: "line", lines: ["GK", "DF"], power: 85, noFail: true },
  hanna: { fam: "coach", coach: "hanna", t: "line", lines: ["GK", "DF", "MF", "FW"], power: 70, endHealAll: 5 },
};
// 고유 카드 (편성 7명) — 강화 모드: 자신 70×1.5 / 지원 모드: 캐릭터별 효과
const UNIQUE = {
  ch_spirit_keeper: { support: { nextNoFail: true, healOwner: 15 } },
  ch_dwarf_wall: { support: { healLines: ["GK", "DF"], heal: 10 } },
  ch_human_captain: { power: { tw: 2 }, support: { tw: 3, healAll: 3 } },
  ch_elf_playmaker: { power: { nextPct: 0.2 }, support: { nextPct: 0.4 } },
  ch_human_runner: { support: { draw: 1 } },
  ch_wolf_winger: { power: { pairWith: true }, support: { tw: 1, nextPairPct: 0.5 } },
  ch_giant_striker: { support: { nextCostZero: true } },
  ch_cat_trickster: { support: { extra: 1, ownerCost: 5 } },
};
const REWARD_POOL = {
  common: ["fwDrill", "mfDrill", "dfDrill", "gkSession", "attack", "defense", "oneTwo", "oneOnOne", "board", "icing"],
  ace: ["hojoUp", "focusRoutine", "aceTraining", "onePoint", "immerse", "breakLimit", "routine", "breath"],
  team: ["highFive", "setPiece", "passMove", "oneTeam", "chant", "moodMaker", "breathTogether", "linkLine"],
  counter: ["lineUp", "longBall", "counterSprint", "finisher", "recover", "allCounter"],
  poss: ["triangle", "circulate", "tempo", "midControl", "dominate", "backBuild"],
  press: ["frontPress", "fullPress", "sixSec", "dropLine", "allOut", "gegen"],
};

// ── 난수 ──
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function makeTeam() {
  return SQUAD.map(([pos, id], i) => ({ i, pos, id, growth: chars[id].growth, stamina: 100, injuredLessons: 0, stats: Object.fromEntries(STATS.map((s) => [s, 0])) }));
}

function cardDef(c) { return c.unique ? { fam: "unique", t: "owner", power: 70, ...c } : { ...CARDS[c.id], id: c.id, plus: c.plus }; }

function runLesson(team, deckIds, stat, turns, special, r, plan, track) {
  const L = { score: 0, sub: 0, tw: 0, fails: 0, injuries: 0, plays: 0, rests: 0, targeted: new Set(), targetCount: Array(7).fill(0) };
  const avail = (p) => p.injuredLessons === 0;
  let deck = shuffle(deckIds.filter((c) => !(c.unique && !avail(team[c.owner]))).slice(), r);
  let discard = [];
  const exhausted = new Set();
  const B = { hojo: 0, focus: 0, mood: 0, noDecay: 0, nextPct: 0, nextPairPct: 0, nextNoFail: false, nextCostZero: false, singleBonus: 0, extraDraw: 0, steal: 0, poss: 0, possGuard: 0, press: 0 };
  const draw = (n) => { const h = []; for (let k = 0; k < n; k++) { if (!deck.length) { deck = shuffle(discard, r); discard = []; } if (!deck.length) break; h.push(deck.pop()); } return h; };
  const special1 = 1 + (special ? P.special : 0);
  const gainFor = (p, perPower, mult) => Math.round(perPower * p.growth[stat] * mult * special1 * P.gainScale);

  function targetsOf(def, c) {
    const live = team.filter(avail);
    if (def.t === "line") return live.filter((p) => def.lines.includes(p.pos));
    if (def.t === "owner") { const o = team[c.owner]; if (!avail(o)) return []; if (def.pairWith) { const mate = pickBest(live.filter((p) => p !== o), 1); return [o, ...mate]; } return [o]; }
    if (def.t === "single") return pickBest(def.attackOnly ? live.filter((p) => ATTL.includes(p.pos)) : live, 1);
    if (def.t === "pair") return pickBest(live, 2);
    return [];
  }
  function pickBest(list, n) {
    return list.slice().sort((a, b) => score(b) - score(a)).slice(0, n);
    function score(p) { return p.growth[stat] * (MAINS[p.pos].includes(stat) ? 1.3 : 1) - (p.stamina < 40 ? 1 : 0) - (p.stamina < 20 ? 2 : 0); }
  }
  // 카드 한 장 해석 → { targets, per[], cost, effects }
  function resolve(c, turnIdx) {
    const base = cardDef(c);
    let def = { ...base };
    if (c.unique) {
      const u = UNIQUE[c.id];
      const owner = team[c.owner];
      const powerMode = MAINS[owner.pos].includes(stat);
      if (powerMode) def = { ...def, power: 70 * P.uniqueMult, ...(u.power || {}) };
      else def = { fam: "unique", t: "none", ...(u.support || {}), ownerIdx: c.owner };
      def.costRate = P.uniqueCostRate;
    }
    if (c.plus) def.power = def.power ? Math.round(def.power * 1.25) : def.power;
    const tg = def.t === "none" ? [] : targetsOf(def, c);
    let per = [];
    if (tg.length) {
      let pp = def.t === "line" ? def.power / tg.length : def.power;
      if (def.t === "owner" && def.pairWith) per = [def.power, 35];
      else per = tg.map(() => pp);
      // 집중 몫
      const fs = B.focus * P.focusK * (def.focusX2 ? 2 : 1);
      per = per.map((v) => v + fs / tg.length);
      if (def.t === "single") per = per.map((v) => v + B.singleBonus);
      if (def.perMood) per = per.map((v) => v + (def.perMood * B.mood) / tg.length);
    }
    let mult = 1 + B.nextPct + (def.t === "pair" ? B.nextPairPct : 0);
    if (B.hojo > 0 && tg.length) mult *= P.hojoMult;
    if (def.coach && COACH_TYPE[def.coach] === stat) mult *= P.coachTypeMult;
    if (def.lastTurnX2 && turnIdx === turns - 1) mult *= 2;
    const hasAtt = tg.some((p) => ATTL.includes(p.pos));
    const isDefOnly = tg.length > 0 && !hasAtt;
    const side = tg.length ? (hasAtt ? "att" : "def") : null;
    const consumes = process.env.CV === "2" ? side && B.steal > 0 && side !== B.stealSide : hasAtt;
    if (plan === "counter" && consumes && B.steal > 0) mult *= 1 + (def.stealPer || P.stealK) * B.steal;
    if (plan === "poss" && tg.length && B.poss > 0) mult *= 1 + P.possK * B.poss * (def.possX2 ? 2 : 1);
    let costMult = 1;
    if (plan === "press" && tg.length && B.press > 0) { mult *= 1 + P.pressK * B.press; if (!(def.noPressCost && B.press >= 2) && !def.noPressCostAlways) costMult = 1 + P.pressCostK * B.press; }
    if (def.perPress && tg.length) per = per.map((v) => v + (def.perPress * B.press) / tg.length);
    const rate = (def.costRate || P.costRate) * costMult;
    const costs = per.map((v) => (B.nextCostZero ? 0 : Math.round(v * rate)));
    const fp = tg.length && !def.noFail && !B.nextNoFail ? Math.min(0.95, Math.max(...tg.map((p) => failRate(p.stamina))) + (def.failPlus || 0)) : 0;
    const gains = tg.map((p, k) => gainFor(p, per[k], mult));
    return { def, tg, per, gains, costs, fp, hasAtt, isDefOnly, side, consumes };
  }
  function value(res, remaining) {
    const { def, tg, gains, fp } = res;
    let v = gains.reduce((a, b) => a + b, 0) * (1 - fp) - fp * (P.failLoss + 40);
    const avg = 75;
    if (def.hojo) v += 0.5 * avg * Math.min(def.hojo, remaining);
    if (def.focus) v += def.focus * P.focusK * remaining * 0.9;
    if (def.mood) { const m = def.mood, n = Math.min(remaining + 1, B.mood + m); v += m * P.moodK * 7 * 1.0 * n * 0.8; }
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
      const sg = process.env.CV === "2" ? (res.side ? def.stealSet || 1 : def.steal || 0) * (res.side && res.side !== B.stealSide ? 1 : 1) : res.isDefOnly ? def.stealSet || 1 : def.t === "none" ? def.steal || 0 : 0;
      if (sg) v += Math.min(P.stealCap - B.steal, sg) * P.stealK * 40 * (remaining > 0 ? 0.8 : 0);
    }
    if (plan === "poss") {
      const g = (tg.length && tg.some((p) => p.pos === "MF") ? 1 : 0) + (def.poss || 0);
      v += Math.min(P.possCap - B.poss, g) * P.possK * 40 * remaining * 0.7;
      if (tg.length && !B.possGuard) v -= fp * B.poss * P.possK * 40 * remaining;
      if (tg.length && !tg.some((p) => p.pos === "MF") && !def.possKeep) v -= Math.min(P.possNoMF, B.poss) * P.possK * 40 * remaining * 0.7;
      if (def.possGuard) v += B.poss * P.possK * 40 * remaining * 0.1 + 5;
    }
    if (plan === "press") {
      if (def.press) v += Math.min(P.pressCap - B.press, def.press) * (P.pressK * 40 * remaining * 0.6 - 4);
      const lowSt2 = team.filter((p) => avail(p) && p.stamina < 50).length;
      if (def.dropLine) v += B.press * 7 * 6 * 0.3 + lowSt2 * 3 - (remaining > 1 ? B.press * P.pressK * 40 * 0.8 : 0);
    }
    // 체력 부담
    v -= res.costs.reduce((a, b) => a + b, 0) * 0.15;
    return v;
  }
  function apply(res, c) {
    const { def, tg, gains, costs, fp } = res;
    L.plays++;
    if (tg.length) {
      let failer = null;
      if (fp > 0 && r() < fp) { failer = tg.reduce((a, b) => (failRate(b.stamina) > failRate(a.stamina) ? b : a)); }
      tg.forEach((p, k) => {
        p.stamina = Math.max(0, p.stamina - costs[k]);
        L.targeted.add(p.i); L.targetCount[p.i]++;
        if (p === failer) { p.stats[stat] -= P.failLoss; L.score -= P.failLoss; L.fails++; if (r() < P.injuryChance) { p.injuredLessons = 2; L.injuries++; } return; }
        p.stats[stat] += gains[k]; L.score += gains[k];
        const sg = Math.round(gains[k] * P.subRatio * p.growth[SUB[stat]]); p.stats[SUB[stat]] += sg; L.sub += sg;
      });
      const ok = tg.length - (failer ? 1 : 0);
      if (tg.length >= 2) L.tw += Math.max(0, ok - 1);
      if (B.hojo > 0) B.hojo--;
      B.nextPct = 0; B.nextNoFail = false; B.nextCostZero = false;
      if (def.t === "pair") B.nextPairPct = 0;
      if (plan === "counter") {
        if (process.env.CV === "2") {
          if (res.consumes) { L.stealUsed = (L.stealUsed || 0) + B.steal; L.stealPays = (L.stealPays || 0) + 1; B.steal = 0; }
          if (!failer) { B.steal = Math.min(P.stealCap, B.steal + (def.stealSet || 1)); B.stealSide = res.side; }
        } else {
        if (res.hasAtt) { if (B.steal > 0) { L.stealUsed = (L.stealUsed || 0) + B.steal; L.stealPays = (L.stealPays || 0) + 1; if (def.twOnSteal) L.tw += def.twOnSteal; } B.steal = 0; }
        else if (!failer) B.steal = Math.min(P.stealCap, B.steal + (def.stealSet || 1));
        }
      }
      if (plan === "poss") {
        if (failer) { if (B.possGuard > 0) B.possGuard--; else { L.possLost = (L.possLost || 0) + B.poss; L.possBreaks = (L.possBreaks || 0) + 1; B.poss = P.possFailHalf ? Math.floor(B.poss / 2) : 0; } }
        else if (tg.some((p) => p.pos === "MF")) B.poss = Math.min(P.possCap, B.poss + 1);
        else if (!def.possKeep) B.poss = Math.max(0, B.poss - P.possNoMF);
      }
    }
    if (plan === "counter" && def.steal) B.steal = Math.min(P.stealCap, B.steal + def.steal);
    if (plan === "poss" && def.poss) B.poss = Math.min(P.possCap, B.poss + def.poss);
    if (plan === "poss" && def.possGuard) B.possGuard += def.possGuard;
    if (plan === "press" && def.press) B.press = Math.min(P.pressCap, B.press + def.press);
    if (plan === "press" && def.dropLine) { team.filter(avail).forEach((p) => (p.stamina = Math.min(100, p.stamina + 6 * B.press))); B.press = 0; }
    if (plan === "press" && res.tg.length) { L.pressSum = (L.pressSum || 0) + B.press; L.pressN = (L.pressN || 0) + 1; }
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
    const hand = draw(P.hand + B.extraDraw); B.extraDraw = 0;
    let plays = 1;
    const remaining = turns - t - 1;
    while (plays > 0 && hand.length) {
      let best = null, bestV = -Infinity;
      for (const c of hand) { const res = resolve(c, t); if (res.def.t !== "none" && !res.tg.length) continue; const v = value(res, remaining); if (v > bestV) { bestV = v; best = { c, res }; } }
      // 쉬기: 가장 지친 선수 +20, 나머지 +5
      const live = team.filter(avail);
      const restV = live.filter((p) => p.stamina < 40).length * 18 + (live.some((p) => p.stamina < 20) ? 30 : 0);
      if (!best || restV > bestV) {
        if (plays === 1 && t >= 0) { const p = live.sort((a, b) => a.stamina - b.stamina)[0]; if (p) p.stamina = Math.min(100, p.stamina + 20); live.forEach((q) => q !== p && (q.stamina = Math.min(100, q.stamina + 5))); L.rests++;
          if (plan === "press" && B.press > 0) { live.forEach((q) => (q.stamina = Math.min(100, q.stamina + P.pressHeal * B.press))); B.press = 0; } }
        break;
      }
      hand.splice(hand.indexOf(best.c), 1);
      plays--;
      plays += apply(best.res, best.c);
      if (!best.res.def.exhaust) discard.push(best.c);
    }
    discard.push(...hand);
    // 턴 끝: 분위기 틱
    if (B.mood > 0) {
      team.filter(avail).forEach((p) => { const g = Math.round(B.mood * P.moodK * p.growth[stat] * special1 * P.gainScale); p.stats[stat] += g; L.score += g; });
      if (B.noDecay > 0) B.noDecay--; else B.mood = Math.max(0, B.mood - 1);
    }
  }
  // 레슨 끝: 자율 훈련 · 코치 회복
  const tgtGains = L.score > 0 && L.targeted.size ? L.score / L.targeted.size : 0;
  let auto = 0;
  team.forEach((p) => { if (avail(p) && !L.targeted.has(p.i)) { const g = Math.round(tgtGains * P.autoRatio); p.stats[stat] += g; auto += g; p.stamina = Math.min(100, p.stamina + 10); } });
  if (L.endHeal) team.forEach((p) => (p.stamina = Math.min(100, p.stamina + L.endHeal)));
  L.auto = auto;
  return L;
}

function runOnce(seed, plan) {
  const r = rng(seed);
  const team = makeTeam();
  let deck = [
    ...SQUAD.map(([, id], i) => ({ id, unique: true, owner: i })),
    { id: "basic" }, { id: "coaching" }, { id: "cooldown" },
  ];
  const out = { lessons: [], tw: 0, injuries: 0, fails: 0, rests: 0, weekRests: 0, targetCount: Array(7).fill(0), deckSize: 0, coachPicks: 0 };
  for (let season = 0; season < 3; season++) {
    const turns = P.turns[season];
    for (const wk of ["L", "F", "L", "F", "P"]) {
      const avgSt = team.reduce((a, p) => a + p.stamina, 0) / 7;
      if (wk === "F") { if (avgSt < 65) { team.forEach((p) => (p.stamina = Math.min(100, p.stamina + 40))); out.weekRests++; } else out.tw += 3; continue; }
      if (avgSt < 40) { team.forEach((p) => (p.stamina = Math.min(100, p.stamina + 40))); out.weekRests++; continue; }
      const specials = wk === "L" ? shuffle(STATS.slice(), r).slice(0, 1 + (r() < 0.5 ? 1 : 0)) : [];
      // 종목: 특별 레슨 우선, 아니면 가장 약하게 큰 주 스탯
      const totals = Object.fromEntries(STATS.map((s) => [s, team.reduce((a, p) => a + p.stats[s], 0)]));
      const stat = specials.length && r() < 0.7 ? specials[0] : STATS.slice().sort((a, b) => totals[a] - totals[b])[0];
      const special = specials.includes(stat);
      const L = runLesson(team, deck, stat, turns, special, r, plan);
      team.forEach((p) => p.injuredLessons > 0 && p.injuredLessons--);
      out.lessons.push({ season, stat, special, score: L.score, sub: L.sub, auto: L.auto, plays: L.plays });
      out.tw += L.tw + P.clearTw; out.injuries += L.injuries; out.fails += L.fails; out.rests += L.rests;
      L.targetCount.forEach((n, i) => (out.targetCount[i] += n));
      out.stealUsed = (out.stealUsed || 0) + (L.stealUsed || 0); out.stealPays = (out.stealPays || 0) + (L.stealPays || 0);
      out.possLost = (out.possLost || 0) + (L.possLost || 0); out.possBreaks = (out.possBreaks || 0) + (L.possBreaks || 0);
      out.pressSum = (out.pressSum || 0) + (L.pressSum || 0); out.pressN = (out.pressN || 0) + (L.pressN || 0);
      // 보상 3택1 (클리어 판정은 나중에 목표치로 — 여기선 항상 보상)
      const pool = [...REWARD_POOL.common, ...REWARD_POOL[plan], ...COACHES.flatMap((c) => [c, c])];
      const offer = shuffle(pool.slice(), r).slice(0, 3);
      const pri = (id) => (CARDS[id].fam === plan ? 3 : CARDS[id].fam === "coach" ? 2 : 1);
      const pick = offer.sort((a, b) => pri(b) - pri(a))[0];
      if (deck.length < 20) { deck.push({ id: pick }); if (CARDS[pick].fam === "coach") out.coachPicks++; }
      // 퍼펙트 대용: 시즌마다 1장 강화
      if (wk === "P") { const up = deck.find((c) => !c.plus && !c.unique && CARDS[c.id].power); if (up) up.plus = true; }
    }
  }
  out.deckSize = deck.length;
  out.stats = team.map((p) => p.stats);
  return out;
}

const N = Number(process.argv[2] || 400);
for (const plan of (process.env.PLANS || "ace,team,counter,poss,press").split(",")) {
  const agg = { bySeason: [[], [], []], total: 0, sub: 0, auto: 0, tw: 0, inj: 0, fails: 0, rests: 0, weekRests: 0, lessons: 0, tc: Array(7).fill(0), coachPicks: 0 };
  for (let s = 1; s <= N; s++) {
    const o = runOnce(s * 7919, plan);
    o.lessons.forEach((l) => { agg.bySeason[l.season].push(l.score); agg.total += l.score; agg.sub += l.sub; agg.auto += l.auto; agg.lessons++; });
    agg.tw += o.tw; agg.inj += o.injuries; agg.fails += o.fails; agg.rests += o.rests; agg.weekRests += o.weekRests; agg.coachPicks += o.coachPicks;
    o.targetCount.forEach((n, i) => (agg.tc[i] += n));
    agg.ex = agg.ex || { su: 0, sp: 0, pl: 0, pb: 0, ps: 0, pn: 0 };
    agg.ex.su += o.stealUsed || 0; agg.ex.sp += o.stealPays || 0; agg.ex.pl += o.possLost || 0; agg.ex.pb += o.possBreaks || 0; agg.ex.ps += o.pressSum || 0; agg.ex.pn += o.pressN || 0;
    agg.pstats = agg.pstats || SQUAD.map(() => Object.fromEntries(STATS.map((s) => [s, 0])));
    o.stats.forEach((st, i) => STATS.forEach((s) => (agg.pstats[i][s] += st[s])));
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const pct = (a, q) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(q * (b.length - 1))]; };
  console.log(`\n== ${plan} (${N} runs) ==`);
  agg.bySeason.forEach((a, i) => console.log(`시즌${i + 1} 레슨 점수: 평균 ${mean(a).toFixed(0)}  p30 ${pct(a, 0.3)}  p70 ${pct(a, 0.7)}  p90 ${pct(a, 0.9)}  (레슨 ${a.length / N}회/런)`));
  console.log(`런당: 레슨 수 ${(agg.lessons / N).toFixed(1)}  주 스탯 ${(agg.total / N).toFixed(0)}  부 스탯 ${(agg.sub / N).toFixed(0)}  자율 ${(agg.auto / N).toFixed(0)}  합 ${((agg.total + agg.sub + agg.auto) / N).toFixed(0)}`);
  console.log(`런당: 팀워크(레슨+자유주) ${(agg.tw / N).toFixed(0)}  실패 ${(agg.fails / N).toFixed(2)}  부상 ${(agg.inj / N).toFixed(2)}  레슨 중 쉬기 ${(agg.rests / N).toFixed(1)}  주 휴식 ${(agg.weekRests / N).toFixed(1)}  코치 카드 ${(agg.coachPicks / N).toFixed(1)}장`);
  const mainOf = (i) => { const [pos] = SQUAD[i]; const m = MAINS[pos]; return (agg.pstats[i][m[0]] + agg.pstats[i][m[1]]) / N; };
  const totOf = (i) => STATS.reduce((a, s) => a + agg.pstats[i][s], 0) / N;
  const lineAvg = (ls, f) => { const idx = SQUAD.map((x, i) => [x[0], i]).filter(([p]) => ls.includes(p)).map(([, i]) => i); return idx.reduce((a, i) => a + f(i), 0) / idx.length; };
  console.log(`라인별 1인 성장(주스탯2개 합 / 5스탯 합): 수비진 ${lineAvg(["GK","DF"], mainOf).toFixed(0)} / ${lineAvg(["GK","DF"], totOf).toFixed(0)}  MF ${lineAvg(["MF"], mainOf).toFixed(0)} / ${lineAvg(["MF"], totOf).toFixed(0)}  FW ${lineAvg(["FW"], mainOf).toFixed(0)} / ${lineAvg(["FW"], totOf).toFixed(0)}  최저 선수 주스탯 ${Math.min(...SQUAD.map((_, i) => mainOf(i))).toFixed(0)}`);
  if (plan === "counter") console.log(`탈취: 런당 사용 ${(agg.ex.sp / N).toFixed(1)}회, 회당 평균 ${(agg.ex.su / Math.max(1, agg.ex.sp)).toFixed(2)}스택`);
  if (plan === "poss") console.log(`점유: 런당 깨짐 ${(agg.ex.pb / N).toFixed(2)}회, 깨질 때 평균 ${(agg.ex.pl / Math.max(1, agg.ex.pb)).toFixed(1)}스택`);
  if (plan === "press") console.log(`압박: 대상 카드 낼 때 평균 단계 ${(agg.ex.ps / Math.max(1, agg.ex.pn)).toFixed(2)}`);
  console.log(`선수별 대상 횟수/런: ${SQUAD.map(([pos, id], i) => `${chars[id].name}(${pos}) ${(agg.tc[i] / N).toFixed(1)}`).join(" · ")}`);
}
