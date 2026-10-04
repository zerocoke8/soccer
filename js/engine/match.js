/**
 * match.js — 경기 시뮬레이션 (ARCHITECTURE.md §7, §12, v0.3 §13)
 *
 * API: createMatch, getMatchView, step, simulateAuto, isFinished, getResult (+ 판정·성향 헬퍼 export)
 *
 * 진행 규약:
 *  - createMatch 는 첫 킥오프와 첫 듀얼을 준비해 phase "decision" 상태로 반환한다.
 *  - step 한 번 = 듀얼 한 판정 (또는 승부차기 한 킥). 판정 후 다음 듀얼(필요하면 다음 포제션)을
 *    바로 준비하므로, step 직후 상태는 항상 "decision"(결정 대기) / "penalties" / "finished" 중 하나.
 *  - AI 측(= humanSide 의 반대편)은 듀얼 준비 시 먼저 선택을 커밋한다 (텐션·게이지 즉시 소모).
 *    인간 측의 결정 필요 여부는 getMatchView().needsDecision 으로 확인.
 *  - decision = { action, receiverId?, skillId?, ultimate?, gaanpa? }. action 없이 skillId / gaanpa 만 주면
 *    그것만 먼저 발동하고 결정 대기를 유지한다.
 *
 * v0.3 (§13.2):
 *  - A안 자동 선택: 선수는 자기 성향값(tendencyValues) 1위 액션을 고른다 (결정적, 상대를 읽지 않음). 난수는 판정 주사위만.
 *  - 액션: 공격 dribble | pass | cross | shoot, 수비 tackle | intercept | hold, GK save. 의도 공개 단계 폐지.
 *  - 수비 3종 스탯·배율(짝 ×readBonus / 빗나감 ×missMult / hold, 중거리엔 ×holdVsMidrange), 뚫림 결과(제쳐짐 등),
 *    역습 시작 표(intercept·steal +1, 상한 counterCap, hold 한 구역 물러남; GK 가 잡으면 GK 배급). 킥오프는 kickoffLine(중원).
 *  - 연계 특성(traits.json, 팀워크 증폭), 원터치·헤더, 받는 선수 직접 고르기(decision.receiverId).
 *  - 간파(readBoost / negateRead, 사용권), 필살기(개인 게이지, shot/pass/save, 합체기), 일반 액티브 새 어휘(skills.js).
 *
 * 2026-09-29 (사용자 결정):
 *  - 짝 표: 드리블 ↔ 태클, 패스(땅볼) ↔ 인터셉트, 크로스(공중볼) ↔ 버티기(×holdVsCross), 중거리 슛 ↔ 버티기(×holdVsMidrange).
 *    태클·인터셉트는 크로스에 빗나감(×missMult). 간파(readBoost / negateRead)는 버티기 ↔ 크로스도 다른 짝과 똑같이 다룬다.
 *  - 박스 연결 (④ 슈팅 찬스, lineIndex 3): 슛 외에 컷백 패스(action "pass" → 받은 선수 원터치 슛)와
 *    센터링(action "cross", 크로서만 → 받은 선수 헤더). 연결 자체가 GK 와의 듀얼(GK 세이브 값 × boxLink.gkMult, 짝 없음).
 *    성공 → 공은 line 3 그대로, 받은 선수가 carrier (원터치 · receivedVia · 연계 +1 · 게이지 onReceive).
 *    실패 → GK 가 잡음 = 세이브와 같음 (이벤트 "save" → 그 GK 의 배급, 아래 결정 3).
 *    포제션당 1회 (ball.boxLinkUsed). 자동(A안 예외)은 boxLinkEval 규칙 — 기대 골 비교 (아래 결정 4, 옛 autoRatio 규칙 폐지).
 *  - 에이스의 외침 (view.aceCall, aceCallFor): 받으면 필살기가 준비되는(게이지 ≥ aceCallGauge) · 합체기가 되는 받는 선수 한 명.
 *    이미 커밋한 공격(상대 AI)은 커밋한 받는 선수일 때만. 표시 전용 — 판정 · 자동 선택 · 난수를 바꾸지 않는다.
 *
 * 2026-09-29 (사용자 결정 3~7):
 *  - GK 배급 (phase "distribution"): GK 가 인플레이에서 공을 잡으면(④ 세이브 · 박스 연결 차단) 상대 골킥 대신 그 GK 가 배급한다.
 *    세이브 step 은 판정만 하고 phase "distribution" 으로 멈춘다 → 다음 step 이 배급 (한 step = 주사위 최대 한 번 유지).
 *    짧은 패스 = 항상 성공, 빌드업(line 0)부터. 롱패스 = 주사위 한 번 (GK (패스+피지컬)/2 × actionCoef.longPass × (1 + 빠른 배급)
 *    × 캐논 킥 vs 상대 최고 MF (수비+피지컬)/2, 짝·선택 없음) → 성공 = 중원(line 1)부터, 실패 = 상대가 중원(line 1)에서 공격
 *    (이벤트 "turnover" + distribution: true — 공을 뺏긴 것이라 턴오버와 같은 흐름, 포제션 +1).
 *    사람 측 배급 = needsDecision "distribution", decision { action: "short"|"long", skillId? }. 결정 없이 step = 전술
 *    tactics.distribution (short | long | auto: 롱패스 확률 ≥ longPassAutoMin 이면 길게) — ai.decideDistribution (결정적).
 *    경기를 끝내는 세이브(마지막 포제션)와 승부차기에는 배급이 없다.
 *  - 박스 연결: 연결 판정의 GK 배율 boxLink.gkMult 0.6. 자동은 기대 골 비교 (boxLinkEval — 연결 성공 × 받은 선수 다음 슛 골 >
 *    지금 슛 골일 때만 연결, 쓰일 필살기 포함, 미리보기와 같은 확률 함수). autoRatio 폐지. ④ 추천 = 자동 선택.
 *  - 결정타 칩 (클래시 바 1단계, 표시 전용): 판정 이벤트마다 factors(computeOdds 가 실제로 곱한 배율) · decisive(승자 쪽으로
 *    가장 크게 기운 요인) · upset(승자 확률 < upsetP). 확률 · 난수 소비 불변.
 *  - 마지막 공격 보장: 정규(·연장) 포제션이 끝났을 때 정확히 lastAttackDeficit(1)골 뒤진 팀이 마지막 포제션을 갖지 않았으면
 *    포제션 1개 추가 (단계당 1회, 이벤트 "lastAttack"). 그 포제션이 끝나면 (어떤 이유든) 종료 판정.
 *  - 역방향 컷인 (표시 전용): 필살기가 막히면 판정 이벤트에 reverseCutin { kind: save | block | passCut, … }.
 *
 * 2026-09-30 (결함 수정, 판정 · 난수 불변):
 *  - 마지막 포제션 문구: endForecast (checkEnd 와 같은 규칙의 순수 예측)로 "이 포제션이 끝나면 경기 종료"를 안다 →
 *    미리보기(공격 · 수비 결과, ④ 힌트, 배급 롱패스 실패)가 역습 · GK 배급 대신 "경기 종료" · "승부차기" · "연장전" · "마지막 공격",
 *    경기를 끝낸 비트에 matchEnd "end" | "penalties". 롱패스 실패 이벤트에 receiverId(향하던 MF) · starterId(세컨드볼 역습 시작).
 *  - 결정타 칩: 규칙 상수(박스 연결 GK ×0.6)는 후보에서 빼고, "능력치 우위" = 순수 능력치 비로 다른 요인과 겨룬다
 *    (같은 잣대 · 같은 순위 — 요인이 2%p 미만일 때만의 대체가 아니다). 크기 = 그 요인을 뺐을 때 승자 확률이 떨어지는 폭
 *    (보너스 항목은 더하기 기준, clamp 포함), 가장 큰 크기가 decisiveMinDelta(2%p) 미만이면 칩 없음.
 *  - 배급 추천 = "상황 따라" 규칙 (자동이 쓸 캐논 킥 포함, 전술과 무관).
 *
 * 순수 로직. 난수는 state.rngState 로만 (함수 단위로 createRngFromState → getState 저장).
 */

import { createRng, createRngFromState } from "./rng.js";
import { decideAttack, decideDefense, decideDistribution } from "./ai.js";
import {
  collectMods,
  collectModSources,
  applyActive,
  addSkillFx,
  getSkill,
  getPlayerActiveSkills,
  getPlayerUltimate,
  checkSkillUsable,
  checkDistributionSkill,
  isDistributionSkill,
  emptyDuelEffects,
  isGaanpaSkill,
  skillCost,
  validateUltimates,
  ultMatchesAction,
  ultPassActions,
} from "./skills.js";

/* ------------------------------------------------------------------ */
/* 상수                                                                  */
/* ------------------------------------------------------------------ */

export const MATCH_VERSION = 3;
export const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
export const POSITIONS = ["GK", "DF", "MF", "FW"];
/** lineIndex → 그 라인을 지키는 수비 팀 포지션 */
export const POS_BY_LINE = ["FW", "MF", "DF", "GK"];
/** 공격 시작 lineIndex → 시작 선수 포지션 (§7.5) */
export const START_POS_BY_LINE = ["DF", "MF", "FW"];
export const LINE_LABELS = ["FW 라인", "MF 라인", "DF 라인", "골키퍼"];
export const ACTIONS_ATTACK = ["dribble", "pass", "cross", "shoot"];
export const ACTIONS_DEFENSE = ["tackle", "intercept", "hold"];
/**
 * 짝: 공격 → 그것을 읽는 수비 (§13.2-1). 크로스(공중볼)는 몸으로 버티는 수비에 약하다 (2026-09-29).
 * shoot ↔ hold 는 파이널 서드 중거리 슛만 (박스 슛은 GK 와 1:1 — 짝 없음).
 */
export const COUNTER = { dribble: "tackle", pass: "intercept", cross: "hold", shoot: "hold" };
/** 수비 → 그것이 읽는 공격들 */
export const COUNTERED = { tackle: ["dribble"], intercept: ["pass"], hold: ["cross", "shoot"] };
export const ACTION_LABEL = {
  dribble: "드리블", pass: "패스", cross: "크로스", shoot: "슛", header: "헤더",
  tackle: "태클", intercept: "인터셉트", hold: "버티기", save: "세이브",
};
const DEFAULT_TIE_ATTACK = ["dribble", "pass", "cross", "shoot"];
const DEFAULT_TIE_DEFENSE = ["hold", "tackle", "intercept"];
const STYLE_BEATS = { power: "technique", technique: "speed", speed: "power" };
const MAX_AUTO_STEPS = 20000;

/**
 * 경기장 5구역 (ARCHITECTURE §12.1, GDD v0.4 §9.2). 항상 home 시점 고정: Z1 = home 골 앞, Z5 = away 골 앞.
 */
export const ZONE_NAMES = { 1: "우리 박스", 2: "우리 진영", 3: "중원", 4: "상대 진영", 5: "상대 박스" };
/**
 * 위치 필드(seq, zone, toZone, step, toStep, attackingSide, toAttackingSide)를 가진 "비트" 이벤트 타입.
 * distribution (2026-09-29) = GK 배급으로 공을 지킨 비트 (짧은 패스 · 롱패스 성공). 롱패스 실패는 "turnover" (distribution: true).
 */
export const BEAT_TYPES = ["kickoff", "counter", "duel", "turnover", "save", "goal", "penalty", "distribution"];
/** GK 배급 선택지 (decision.action · tactics.distribution 의 short / long) */
export const DISTRIBUTION_ACTIONS = ["short", "long"];
/** 필살기 종류 → 이벤트 문구 (§19.3-9) */
export const ULT_TYPE_TEXT = {
  shot: "필살 슛", pass: "필살 패스", save: "필살 세이브", dribble: "필살 드리블", defense: "필살 수비", team: "필살 호령",
};
/** 역방향 컷인 문구 (필살기가 막혔을 때 — 표시 전용) */
export const REVERSE_CUTIN_TEXT = { save: "기적의 세이브!", block: "철벽 블록!", passCut: "필살 패스 차단!" };
/** 포제션이 끝나면 경기가 끝나는 경우의 문구 (endForecast "end" · "penalties" — 미리보기 · 이벤트 공용, 2026-09-30) */
const END_TEXT = { end: "경기 종료", penalties: "승부차기" };
/** 공 위치(도착 구역 · 역습 시작 구역)를 바꾸는 액티브 스킬 effect — 역할별. getMatchView.outcomesBySkill 대상 */
const POSITION_EFFECT = { attack: "extraLine", defense: "steal" };

/** traits.json 이 데이터 번들에 없을 때 쓰는 기본값 (data/traits.json 과 같은 내용) */
export const DEFAULT_TRAITS = [
  { id: "killpass", name: "킬패스", kind: "bonus", amp: true, params: { nextDuelBonus: 0.2 } },
  { id: "finisher", name: "피니셔", kind: "bonus", amp: true, params: { receivedShotBonus: 0.15 } },
  { id: "crosser", name: "크로서", kind: "condition", amp: false, params: { canCross: true, crossBonus: 0.1 } },
  { id: "targetman", name: "타깃맨", kind: "bonus", amp: true, params: { headerBonus: 0.25 } },
  { id: "runner", name: "침투", kind: "bonus", amp: true, params: { receivedDribbleBonus: 0.15 } },
  { id: "carrier", name: "볼 운반", kind: "bonus", amp: true, params: { dribbleStaminaMult: 0.7, buildupDribbleBonus: 0.1, buildupMaxLine: 1 } },
  { id: "wall", name: "철벽", kind: "mult", amp: false, params: { holdMult: 1.15 } },
  { id: "distributor", name: "빠른 배급", kind: "position", amp: false, params: { longPassBonus: 0.25 } },
  { id: "captain", name: "주장", kind: "team", amp: false, params: { teamworkPlus: 10 } },
];
/** combos.json 이 없을 때의 기본값 */
export const DEFAULT_COMBOS = [{ a: "sk_wind_thread", b: "sk_meteor_shot", name: "바람의 유성" }];

/** 연계 문구 (이벤트 links[].label) */
const LINK_LABELS = { killpass: "킬패스!", oneTouch: "원터치!", header: "헤더!", runner: "침투!", combo: "합체기!" };

/**
 * 공격 팀과 lineIndex(= 공격 단계 0..3) → 공 구역 1..5.
 * home: lineIndex + 2 (0→Z2 … 3→Z5), away: 4 − lineIndex (0→Z4 … 3→Z1).
 */
export function zoneOf(attackingSide, lineIndex) {
  const line = clamp(Math.round(num(lineIndex, 0)), 0, 3);
  if (attackingSide === "home") return line + 2;
  if (attackingSide === "away") return 4 - line;
  throw new Error(`match.zoneOf: attackingSide 잘못됨: ${attackingSide}`);
}

/** 돌파(드리블/패스 성공) 후 lineIndex. extraLine 이면 DF 라인 전까지 한 라인 더 (최대 3) */
function advanceLine(line, extraLine) {
  let n = line + 1;
  if (extraLine && n < 3) n += 1;
  return Math.min(3, n);
}

/** 비트 이벤트 위치 필드. step/toStep 은 각각 그 시점 공격 팀(attackingSide / toAttackingSide) 기준 lineIndex */
function beatPos(atkSide, step, toSide, toStep) {
  return {
    attackingSide: atkSide,
    step,
    zone: zoneOf(atkSide, step),
    toAttackingSide: toSide,
    toStep,
    toZone: zoneOf(toSide, toStep),
  };
}

/* ------------------------------------------------------------------ */
/* 공용 헬퍼 (ai.js 도 사용)                                              */
/* ------------------------------------------------------------------ */

export function otherSide(side) {
  return side === "home" ? "away" : "home";
}

export function findPlayer(team, id) {
  if (!team || !Array.isArray(team.players) || id == null) return null;
  return team.players.find((p) => p.id === id) || null;
}

/** 현재 포제션을 포함한 남은 포제션 수 */
export function possessionsLeft(state) {
  return Math.max(0, (state.possessionsTotal || 0) - (state.possession || 0) + 1);
}

export function scoreDiffFor(state, side) {
  const s = state.score || {};
  return num(s[side]) - num(s[otherSide(side)]);
}

/** 텐션 정책의 "슛일 때": 공격이면 슛 액션, 수비면 DF 라인 이후 */
export function isShotContext(role, action, lineIndex) {
  return role === "attack" ? action === "shoot" : lineIndex >= 2;
}

function matchCfg(data) {
  const m = data && data.config && data.config.match;
  if (!m) throw new Error("match: data.config.match 가 필요합니다");
  return m;
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function round6(x) {
  return Math.round(x * 1e6) / 1e6;
}

function pct(p) {
  return Math.round(p * 100);
}

function stat(player, key) {
  return num(player && player.stats && player.stats[key], 0);
}

/** 내 스타일이 상대 스타일에 유리하면 styleAdv, 불리하면 styleDis, 아니면 1 */
function styleMult(mine, theirs, m) {
  if (mine && theirs && STYLE_BEATS[mine] === theirs) return num(m.styleAdv, 1.25);
  if (mine && theirs && STYLE_BEATS[theirs] === mine) return num(m.styleDis, 0.8);
  return 1;
}

/** 공명 보너스 + 유물 modifiers 합 (가산치) */
function bonusOf(team, key) {
  const res = team.resonance && team.resonance.bonus ? num(team.resonance.bonus[key]) : 0;
  const mod = team.modifiers ? num(team.modifiers[key]) : 0;
  return res + mod;
}

function liveStamina(team, pid) {
  const lv = team && team.live && team.live[pid];
  return lv ? num(lv.stamina, 0) : 0;
}

function staminaMultFor(m, stamina) {
  const max = num(m.staminaMax, 100);
  return stamina <= max * num(m.lowStaminaThreshold, 0.2) ? num(m.lowStaminaMult, 0.8) : 1;
}

function isLowStamina(m, team, pid) {
  const lv = team && team.live && team.live[pid];
  if (!lv) return false;
  return num(lv.stamina, 0) <= num(m.staminaMax, 100) * num(m.lowStaminaThreshold, 0.2);
}

/** 결정적 최대값: 동률이면 cands 순서(= 슬롯 순서)의 첫 항목 (§13.2-9) */
function bestOf(cands, scoreFn) {
  if (!cands || !cands.length) return null;
  let best = null;
  let bs = -Infinity;
  for (const c of cands) {
    const s = scoreFn(c);
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best || cands[0];
}

/** 이벤트 추가. seq = 이벤트 배열 인덱스 (단조 증가) */
function pushEvent(state, ev) {
  const e = Object.assign({ possession: state.possession, seq: state.events.length }, ev);
  state.events.push(e);
  return e;
}

function incr(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

function emptyStats() {
  return {
    shots: 0, duelsWon: 0, goals: 0, mvpId: null, playerDuelWins: {}, playerGoals: {},
    skillsUsed: 0, ultimatesUsed: 0, combos: 0, gaanpaUsed: 0,
  };
}

function emptyPending() {
  return { beaten: false, interceptFail: false, nextBonus: 0 };
}

function tendCfg(m) {
  const t = m.tendency || {};
  return {
    tb: num(t.tacticBonus, 1.15),
    // "기회 보이면 중거리" 전술의 중거리 성향 배율. 중거리 계수(0.6)가 드리블·패스(2.2)보다 훨씬 낮아 ×tacticBonus 로는 1위를 뒤집지 못해
    // 따로 둔다 (GDD 9.9 "1위를 뒤집을 수 있다", 없으면 tacticBonus)
    mid: num(t.midrangeTactic, num(t.tacticBonus, 1.15)),
    lowD: num(t.lowStaminaDribble, 0.7),
    lowP: num(t.lowStaminaPass, 1.2),
    tieA: Array.isArray(t.tieAttack) && t.tieAttack.length ? t.tieAttack : DEFAULT_TIE_ATTACK,
    tieD: Array.isArray(t.tieDefense) && t.tieDefense.length ? t.tieDefense : DEFAULT_TIE_DEFENSE,
  };
}

function ultCfg(m) {
  const u = m.ultimate || {};
  const max = num(u.gaugeMax, 100);
  const onReceive = num(u.onReceive, 15);
  return {
    start: num(u.gaugeStart, 30), max, onDuelWin: num(u.onDuelWin, 20), onReceive,
    onGoal: num(u.onGoal, 30), onUltPassReceive: num(u.onUltPassReceive, 50), comboBonus: num(u.comboBonus, 1.2),
    // 에이스의 외침 (표시 전용): 받으면 필살기가 준비되는 게이지 문턱. 없으면 gaugeMax − onReceive (받으면 가득)
    aceCall: num(u.aceCallGauge, max - onReceive),
  };
}

/**
 * 필살 패스를 받은 선수의 게이지 증가 (§19.2): ultimate.receiverGauge, 없으면 onReceive (보통 수신과 같다 — 바람의 실은 50을 직접 적는다).
 * K1 이전 기본값 onUltPassReceive 는 더 읽지 않는다 (§19.19).
 */
function receiverGaugeOf(ult, uc) {
  return num(ult && ult.receiverGauge, uc.onReceive);
}

/**
 * 박스 연결 설정 (config.match.boxLink): gkMult = 연결 듀얼의 GK 수비 배율 (2026-09-29: 0.6).
 * autoRatio(옛 자동 연결 기준 배율)는 폐지 — 자동은 기대 골 비교 (boxLinkEval). config 에 남아 있어도 읽지 않는다.
 */
function boxLinkCfg(m) {
  const b = m.boxLink || {};
  return { gkMult: num(b.gkMult, 1) };
}

/** ④(line 3)에서의 패스·크로스 = 박스 연결 */
function isBoxLinkAction(action, line) {
  return line >= 3 && (action === "pass" || action === "cross");
}

/**
 * ④ 박스 연결이 막혔을 때(GK 가 잡음 = 세이브) 한 줄 — attackOutcome 실패 줄과 같은 규칙: 잡은 GK 가 배급한다 (2026-09-29).
 * 마지막 포제션이라 막히면 경기가 끝나면 "막히면 경기 종료" (승부차기면 "막히면 승부차기") — endForecast (2026-09-30)
 */
function boxLinkFailHint(state, data, side) {
  const fc = state && data ? endForecast(state, data, otherSide(side)) : null;
  if (fc === "end" || fc === "penalties") return `막히면 ${END_TEXT[fc]}`;
  return "막히면 상대 GK 배급";
}

/** side 팀 GK 가 서는 박스 구역 (home → Z1, away → Z5) — 배급 비트의 출발 구역 */
export function gkZoneOf(side) {
  return zoneOf(otherSide(side), 3);
}

/* ------------------------------------------------------------------ */
/* 연계 특성 · 합체기                                                     */
/* ------------------------------------------------------------------ */

const traitCache = new WeakMap();

function traitMap(data) {
  const arr = data && Array.isArray(data.traits) ? data.traits : DEFAULT_TRAITS;
  let map = traitCache.get(arr);
  if (!map) {
    map = new Map();
    for (const t of arr) if (t && t.id) map.set(t.id, t);
    traitCache.set(arr, map);
  }
  return map;
}

/** 선수의 연계 특성 정의 (없으면 null). 유스는 특성 없음 */
export function getTrait(data, player) {
  if (!player || player.isYouth || !player.trait) return null;
  return traitMap(data).get(player.trait) || null;
}

function traitParam(data, player, key) {
  const t = getTrait(data, player);
  return t && t.params ? num(t.params[key], 0) : 0;
}

/** 연계 특성 id → 이름 (칩 문구용, 없으면 id) */
function traitName(data, id) {
  const t = traitMap(data).get(id);
  return t && t.name ? t.name : id;
}

/** 스킬 id → 이름 (칩 문구용, 없으면 fallback) */
function skillName(data, id, fallback = "스킬") {
  if (!id || !data || !Array.isArray(data.skills)) return fallback;
  const sk = data.skills.find((s) => s && s.id === id);
  return sk && sk.name ? sk.name : fallback;
}

/**
 * 팀워크 증폭 배율 (§13.1 teamworkAmp). 주장 특성은 증폭 단계 계산용 팀워크를 더한다 —
 * L46 (§19.9): 주장이 여럿이어도 1명분 (경기장 선수 중 가장 큰 teamworkPlus 하나만).
 */
export function teamworkAmp(team, data) {
  const cfg = matchCfg(data).teamworkAmp || {};
  let tw = num(team && team.teamwork, 0);
  let plus = 0;
  for (const p of (team && team.players) || []) plus = Math.max(plus, traitParam(data, p, "teamworkPlus"));
  tw += plus;
  const th = Array.isArray(cfg.thresholds) ? cfg.thresholds : [];
  const mu = Array.isArray(cfg.mult) ? cfg.mult : [];
  let mult = 1;
  for (let i = 0; i < th.length; i++) if (tw >= num(th[i], Infinity)) mult = num(mu[i], mult);
  return mult;
}

/** 특성 가산치 × (증폭 대상이면 증폭 배율) */
function ampOf(trait, amp) {
  return trait && trait.amp ? amp : 1;
}

/** combos.json 에서 (필살 패스 a → 받은 선수 필살기 b) 합체기 이름 */
export function comboName(data, a, b) {
  const list = data && Array.isArray(data.combos) ? data.combos : DEFAULT_COMBOS;
  const c = list.find((x) => x && x.a === a && x.b === b);
  return c ? c.name : null;
}

/**
 * E1 (§19.4): 필살 패스 passSkillId 를 받은 선수의 필살기가 combos.json 에 (a, b)로 등록된 짝이면 그 필살기(b), 아니면 null.
 * 등록되지 않은 짝은 합체기가 아니다 — 받은 선수는 보통 필살 패스 수신(게이지 · 다음 듀얼 보너스)만 받는다.
 */
export function comboSkillFor(data, passSkillId, receiver) {
  if (!passSkillId || !receiver) return null;
  const b = getPlayerUltimate(data, receiver);
  return b && comboName(data, passSkillId, b.id) ? b : null;
}

/* ------------------------------------------------------------------ */
/* 생성                                                                  */
/* ------------------------------------------------------------------ */

function initTeam(snapshot, side, m, data) {
  if (!snapshot || !Array.isArray(snapshot.players) || snapshot.players.length === 0) {
    throw new Error(`match: ${side} 팀 스냅샷에 players 가 필요합니다`);
  }
  const team = JSON.parse(JSON.stringify(snapshot));
  team.side = side;
  team.name = team.name || (side === "home" ? "홈 팀" : "원정 팀");
  team.formation = team.formation || "2-2-2";
  team.tactics = team.tactics || {};
  if (team.tactics.defense === "readIntent") team.tactics.defense = "balanced"; // v0.4 전술 이행
  team.teamwork = num(team.teamwork, 0);
  team.conditionMult = num(team.conditionMult, 1) || 1;
  team.resonance = team.resonance || null;
  team.modifiers = Object.assign(
    { shootPower: 0, defense: 0, tensionGain: 0, staminaCost: 0, passAttack: 0 },
    team.modifiers || {}
  );
  delete team.intentReveal;
  const tickets = snapshot.gaanpaTickets != null ? snapshot.gaanpaTickets : team.modifiers.gaanpaTicket;
  team.gaanpaTickets = Math.max(0, Math.round(num(tickets, 0)));
  const half = snapshot.gaanpaCostHalf != null ? snapshot.gaanpaCostHalf : team.modifiers.gaanpaCostHalf;
  team.gaanpaCostHalf = half === true || num(half, 0) > 0;
  if (team.partyPassives != null && !Array.isArray(team.partyPassives)) throw new Error(`match: ${side} 팀 partyPassives 는 배열이어야 합니다`); // 코치 파티 패시브 (레슨판 L48)
  team.tension = num(m.tension && m.tension.start, 20);
  team.live = {};
  const uc = ultCfg(m);
  const traits = traitMap(data);
  const seen = new Set();
  for (const p of team.players) {
    if (!p || !p.id) throw new Error(`match: ${side} 팀 선수에 id 가 없습니다`);
    if (seen.has(p.id)) throw new Error(`match: ${side} 팀 선수 id 중복: ${p.id}`);
    seen.add(p.id);
    if (!POSITIONS.includes(p.position)) {
      throw new Error(`match: ${side} 팀 선수 ${p.id} 의 position 이 잘못됨: ${p.position}`);
    }
    p.name = p.name || p.id;
    p.stats = p.stats || {};
    for (const k of STATS) p.stats[k] = num(p.stats[k], 0);
    p.style = p.style || "power";
    p.skillIds = p.isYouth ? [] : Array.isArray(p.skillIds) ? p.skillIds.slice() : [];
    for (const sid of p.skillIds) getSkill(data, sid); // 참조 검증
    if (p.isYouth || !p.trait) p.trait = null;
    else if (!traits.has(p.trait)) throw new Error(`match: ${side} 팀 선수 ${p.id} 의 연계 특성 id 를 찾을 수 없습니다: ${p.trait}`);
    team.live[p.id] = { stamina: num(m.staminaMax, 100) };
    if (getPlayerUltimate(data, p)) team.live[p.id].gauge = clamp(uc.start, 0, uc.max);
  }
  return team;
}

/**
 * @param {{ data: object, seed: string|number, home: object, away: object, possessions: number,
 *           kind?: "goal"|"friendly"|"arena", humanSide?: "home"|"away" }} args
 */
export function createMatch({ data, seed, home, away, possessions, kind = "friendly", humanSide = "home" }) {
  const m = matchCfg(data);
  if (seed === undefined || seed === null) throw new Error("match.createMatch: seed 가 필요합니다");
  const total = Number(possessions);
  if (!Number.isInteger(total) || total < 1) {
    throw new Error(`match.createMatch: possessions 는 1 이상의 정수여야 합니다 (받은 값: ${possessions})`);
  }
  if (!["goal", "friendly", "arena"].includes(kind)) {
    throw new Error(`match.createMatch: kind 가 잘못됨: ${kind}`);
  }
  if (humanSide !== "home" && humanSide !== "away") throw new Error(`match.createMatch: humanSide 잘못됨: ${humanSide}`);
  const rng = createRng(seed);
  const state = {
    version: MATCH_VERSION,
    seed,
    rngState: rng.getState(),
    kind,
    possessionsTotal: total,
    possession: 1,
    attackingSide: "home",
    phase: "possessionEnd",
    stage: "regular", // "regular" | "extraTime" | "penalties"
    humanSide,
    home: initTeam(home, "home", m, data),
    away: initTeam(away, "away", m, data),
    ball: newBall(null, 0, 0),
    possessionFx: { home: { teamMult: 1 }, away: { teamMult: 1 } },
    duel: null,
    score: { home: 0, away: 0 },
    events: [],
    stats: { home: emptyStats(), away: emptyStats() },
    penalties: null,
    // GK 배급 대기 (phase "distribution"): { side, gkId, from: "save"|"boxLink", possession } — 2026-09-29
    distribution: null,
    // 마지막 공격 보장: 준 포제션 { side, stage, possession } 과 단계별 사용 여부 (단계당 1회)
    lastAttack: null,
    lastAttackUsed: { regular: false, extraTime: false },
    finished: false,
    result: null,
  };
  validateUltimates(data); // §19.2 — 팀 선수 스킬 참조 검증(initTeam) 바로 뒤, 잘못된 필살기 데이터면 throw
  pushEvent(state, {
    type: "info",
    side: null,
    text: `경기 시작 — ${state.home.name} vs ${state.away.name} (${total}포제션)`,
  });
  startPossession(state, data, "home", kickoffLine(data), "kickoff");
  return state;
}

/** 킥오프 시작 line (경기 시작·실점 후 공통, GDD #55): 기본 1 = 중원(센터서클)에서 MF 가 시작 */
function kickoffLine(data) {
  return clamp(Math.round(num(matchCfg(data).kickoffLine, 1)), 0, 2);
}

/**
 * 공 상태.
 *  chain: 패스·크로스 연계 스택, extraLine: DF 라인 뒤 추가 전진(슛 +20%), oneTouch: 패스·크로스(또는 라인 브레이커)로 박스 도착,
 *  receivedVia: "pass"|"cross"|null (받은 방법), lastPasserId: 킬패스·필살 패스 판정, receivedFresh: 받은 뒤 첫 듀얼 전,
 *  comboReadyId / comboFrom: 필살 패스를 받아 다음 듀얼에서 합체기를 쓸 수 있는 선수,
 *  pending: 다음 듀얼 한 번만 쓰는 공격 보너스 { beaten, interceptFail, nextBonus },
 *  boxLinkUsed: 이번 포제션에 박스 연결(④ 컷백·센터링)을 이미 했다 (포제션당 1회)
 */
function newBall(carrierId, lineIndex, nextBonus) {
  const pending = emptyPending();
  pending.nextBonus = num(nextBonus, 0);
  return {
    carrierId, lineIndex, chain: 0, extraLine: false, oneTouch: false, receivedVia: null, lastPasserId: null,
    receivedFresh: false, comboReadyId: null, comboFrom: null, pending, boxLinkUsed: false,
  };
}

/* ------------------------------------------------------------------ */
/* 포제션 시작 / 듀얼 준비                                                 */
/* ------------------------------------------------------------------ */

function pickStarter(team, lineIndex) {
  const pos = START_POS_BY_LINE[lineIndex] || "FW";
  const t = team.tactics || {};
  if (t.kickoffPlayerId) {
    const k = findPlayer(team, t.kickoffPlayerId);
    if (k && k.position === pos) return k;
  }
  const scoreFn =
    lineIndex === 0
      ? (p) => stat(p, "pass")
      : lineIndex === 1
        ? (p) => stat(p, "dribble") + stat(p, "pass")
        : (p) => stat(p, "shoot");
  let cands = team.players.filter((p) => p.position === pos);
  if (!cands.length) cands = team.players.filter((p) => p.position !== "GK");
  if (!cands.length) cands = team.players.slice();
  return bestOf(cands, scoreFn);
}

function pickDefender(linePlayers, carrier, tactics) {
  const picker = tactics && tactics.duelPicker;
  if (picker === "matchup" && carrier) {
    const adv = linePlayers.filter((p) => STYLE_BEATS[p.style] === carrier.style);
    if (adv.length) return bestOf(adv, (p) => stat(p, "defense"));
    const neutral = linePlayers.filter((p) => STYLE_BEATS[carrier.style] !== p.style);
    if (neutral.length) return bestOf(neutral, (p) => stat(p, "defense"));
  }
  return bestOf(linePlayers, (p) => stat(p, "defense"));
}

/**
 * 포제션 시작. reason "kickoff" | "counter" → 시작 비트 이벤트, "distribution" → 이벤트 없음 (GK 배급 비트가 시작 비트).
 * 마지막 공격 보장으로 준 포제션이면 시작 이벤트에 lastAttack: true.
 */
function startPossession(state, data, side, lineIndex, reason, carry = {}) {
  const team = state[side];
  const carrier = pickStarter(team, lineIndex);
  if (!carrier) throw new Error(`match: ${side} 팀에 공격을 시작할 선수가 없습니다`);
  state.attackingSide = side;
  state.ball = newBall(carrier.id, clamp(num(lineIndex, 0), 0, 2), carry.nextBonus);
  state.possessionFx = { home: { teamMult: 1 }, away: { teamMult: 1 } };
  state.distribution = null;
  if (reason !== "distribution") {
    const text =
      reason === "kickoff"
        ? `${team.name} 킥오프 — ${carrier.name} 시작`
        : `${team.name} 역습! ${carrier.name}, 상대 ${LINE_LABELS[state.ball.lineIndex]}부터 공격${carry.nextBonus ? ` (첫 듀얼 +${pct(carry.nextBonus)}%)` : ""}`;
    const line = state.ball.lineIndex;
    pushEvent(state, {
      type: reason === "kickoff" ? "kickoff" : "counter", side, playerId: carrier.id, text,
      ...(isLastAttackPossession(state) ? { lastAttack: true } : {}),
      ...beatPos(side, line, side, line),
    });
  }
  setupDuel(state, data);
}

/** 지금 포제션이 마지막 공격 보장으로 준 포제션인가 */
function isLastAttackPossession(state) {
  return !!(state.lastAttack && state.lastAttack.possession === state.possession);
}

function setupDuel(state, data) {
  const atk = state.attackingSide;
  const def = otherSide(atk);
  const line = state.ball.lineIndex;
  const defTeam = state[def];
  const carrier = findPlayer(state[atk], state.ball.carrierId);
  let defender;
  let cover = 0;
  if (line >= 3) {
    defender = defTeam.players.find((p) => p.position === "GK") || bestOf(defTeam.players, (p) => stat(p, "defense"));
  } else {
    let linePlayers = defTeam.players.filter((p) => p.position === POS_BY_LINE[line]);
    if (!linePlayers.length) linePlayers = defTeam.players.filter((p) => p.position !== "GK");
    if (!linePlayers.length) linePlayers = defTeam.players.slice();
    defender = pickDefender(linePlayers, carrier, defTeam.tactics);
    cover = Math.max(0, linePlayers.length - 1);
  }
  const pend = state.ball.pending || emptyPending();
  state.duel = {
    defenderId: defender.id,
    baseCover: cover,
    // 제쳐짐: 그 듀얼 커버 보너스 0 (§13.2-6)
    coverCount: pend.beaten && line < 3 ? 0 : cover,
    homeChoice: null,
    awayChoice: null,
    gaanpaSide: null,
    effects: { home: emptyDuelEffects(), away: emptyDuelEffects() },
  };
  state.phase = "decision";

  const human = state.humanSide || "home";
  const ai = otherSide(human);
  commitAI(state, data, ai); // AI가 먼저 결정
  if (!humanNeedsDecision(state, human)) commitAI(state, data, human); // 결정 없는 경우(GK 세이브) 자동
}

/**
 * humanSide 가 이번 듀얼에서 결정해야 하면 "attack"|"defense", GK 배급 차례면 "distribution" (2026-09-29), 아니면 null
 */
export function humanNeedsDecision(state, side) {
  if (!state || state.finished) return null;
  if (state.phase === "distribution") return state.distribution && state.distribution.side === side ? "distribution" : null;
  if (state.phase !== "decision" || !state.duel) return null;
  const choice = state.duel[side + "Choice"];
  if (choice && choice.action) return null;
  if (state.attackingSide === side) return "attack";
  if (state.ball.lineIndex < 3) return "defense";
  return null;
}

function commitAI(state, data, side) {
  const role = state.attackingSide === side ? "attack" : "defense";
  const choice = role === "attack" ? decideAttack(state, data, side) : decideDefense(state, data, side);
  commitChoice(state, data, side, choice, true);
}

/* ------------------------------------------------------------------ */
/* 효과 객체 헬퍼                                                         */
/* ------------------------------------------------------------------ */

/** 이번 듀얼 side 의 효과 (없으면 빈 효과 — 새 객체) */
export function fxOf(state, side) {
  const fx = state && state.duel && state.duel.effects && state.duel.effects[side];
  return fx || emptyDuelEffects();
}

function cloneFx(fx) {
  const f = Object.assign(emptyDuelEffects(), fx || {});
  if (f.attackActions) f.attackActions = f.attackActions.slice();
  if (f.negateActions) f.negateActions = f.negateActions.slice();
  if (f.steal) f.steal = Object.assign({}, f.steal);
  if (f.ult) f.ult = Object.assign({}, f.ult);
  if (f.combo) f.combo = Object.assign({}, f.combo);
  return f;
}

/** fx + 스킬 효과 (미리보기용 사본) */
function fxPlusSkill(fx, skill) {
  const f = cloneFx(fx);
  addSkillFx(f, skill);
  f.usedSkillId = skill.id;
  if (isGaanpaSkill(skill)) f.gaanpa = "skill";
  return f;
}

/**
 * E0 (§19.3-2): 필살기 효과를 효과 객체 fx 에 적는다 — 미리보기(fxPlusUlt)와 실제 발동(commitUltimate)이 같은 함수.
 * fx.ult = { skillId, ...ultimate }, fx.combo. 위치를 바꾸는 인자는 fx 플래그로 접는다: pass · dribble 의 extraLine → fx.extraLine
 * (라인 브레이커와 같은 길 — passPlan · successTransition · outcomesBySkill). 판정 배율은 computeOdds 가 fx.ult 에서 읽는다.
 */
function applyUlt(fx, ultSkill, combo) {
  fx.ult = Object.assign({ skillId: ultSkill.id }, ultSkill.ultimate);
  fx.combo = combo || null;
  const u = ultSkill.ultimate || {};
  if ((u.type === "pass" || u.type === "dribble") && u.extraLine) fx.extraLine = true;
  return fx;
}

/** fx + 필살기 효과 (미리보기용 사본) */
function fxPlusUlt(fx, ultSkill, combo) {
  return applyUlt(cloneFx(fx), ultSkill, combo);
}

/**
 * 일반 액티브를 쓴 뒤의 가상 상태 (미리보기용 사본 — 원본·이벤트 불변). 실제 발동과 같은 applyActive 를 사본에 적용한다.
 * 함성(rally)처럼 효과 객체가 아니라 상태(체력·제쳐짐 해제·커버 복구·이번 포제션 팀 판정)를 바꾸는 스킬의 기대 % 에 쓴다.
 */
function stateAfterActive(state, data, side, playerId, skill) {
  const team = state[side];
  const live = {};
  for (const [pid, lv] of Object.entries(team.live || {})) live[pid] = Object.assign({}, lv);
  const pfx = state.possessionFx || {};
  const s2 = Object.assign({}, state, {
    [side]: Object.assign({}, team, { live }),
    ball: Object.assign({}, state.ball, { pending: Object.assign(emptyPending(), (state.ball && state.ball.pending) || {}) }),
    duel: Object.assign({}, state.duel, { effects: { home: cloneFx(fxOf(state, "home")), away: cloneFx(fxOf(state, "away")) } }),
    possessionFx: { home: Object.assign({ teamMult: 1 }, pfx.home), away: Object.assign({ teamMult: 1 }, pfx.away) },
    events: null,
  });
  applyActive(s2, side, playerId, skill, { staminaMax: num(matchCfg(data).staminaMax, 100) });
  return s2;
}

/** 이 스킬은 효과 객체만으로 미리보기가 안 되고 상태 사본(stateAfterActive)이 필요한가 */
function needsStatePreview(skill) {
  return !!(skill && skill.active && skill.active.effect === "rally");
}

/** fx + 간파 사용권 효과 (미리보기용 사본) */
function fxPlusTicket(fx, role, data) {
  const f = cloneFx(fx);
  applyTicketFx(f, role, data);
  return f;
}

function ticketReadMult(data) {
  const sk = data && Array.isArray(data.skills)
    ? data.skills.find((s) => s && s.active && s.active.effect === "readBoost")
    : null;
  return num(sk && sk.active.params && sk.active.params.readMult, 2.0);
}

function applyTicketFx(fx, role, data) {
  if (role === "defense") fx.readMult = Math.max(num(fx.readMult, 0), ticketReadMult(data));
  else {
    fx.negateRead = true;
    fx.negateActions = null;
  }
  fx.gaanpa = "ticket";
}

/** boost 공격 배율이 이 액션에 붙는가 */
function boostApplies(fx, action) {
  return !fx.attackActions || fx.attackActions.includes(action);
}

/** 공격 측 "상대 짝 맞힘 무효"가 이 액션에 붙는가 (간파·스루 패스·필살 패스) */
function negateApplies(fx, action) {
  if (fx.negateRead && (!fx.negateActions || fx.negateActions.includes(action))) return true;
  // 필살 패스(actions 안) · 필살 드리블(E4, 드리블)의 짝 무효
  return !!(fx.ult && (fx.ult.type === "pass" || fx.ult.type === "dribble") && fx.ult.negateRead && ultMatchesAction(fx.ult, action));
}

/* ------------------------------------------------------------------ */
/* 공격 가능 액션 · 받는 선수 (§13.2-2, 13.2-10)                           */
/* ------------------------------------------------------------------ */

/** 도착 line 의 패스 후보: line ≤ 1 → MF, 그 이상 → FW. carrier 제외. team.players 순서 */
function passCands(team, carrier, arrival) {
  const pos = arrival <= 1 ? "MF" : "FW";
  return team.players.filter((p) => p.position === pos && p.id !== carrier.id);
}

/** 패스 계획 { arrival, candidates }. extraLine 도착 라인에 후보가 없으면 기본 도착으로 */
function passPlan(team, carrier, line, extraLine) {
  let arrival = advanceLine(line, !!extraLine);
  let candidates = passCands(team, carrier, arrival);
  const base = Math.min(3, line + 1);
  if (!candidates.length && arrival !== base) {
    arrival = base;
    candidates = passCands(team, carrier, arrival);
  }
  return { arrival, candidates };
}

/** 크로스 후보: FW 전원 + MF 중 피지컬 최고 1명 (carrier 제외, 동률 슬롯 순서). team.players 순서 */
function crossCands(team, carrier) {
  const mfs = team.players.filter((p) => p.position === "MF" && p.id !== carrier.id);
  const bestMf = bestOf(mfs, (p) => stat(p, "physical"));
  return team.players.filter((p) => p.id !== carrier.id && (p.position === "FW" || (bestMf && p.id === bestMf.id)));
}

function crossPlan(team, carrier) {
  return { arrival: 3, candidates: crossCands(team, carrier) };
}

/**
 * 박스 연결(④) 후보: FW 전원 + MF 1명 (carrier 제외, team.players 순서).
 * 컷백(pass) = 슈팅 최고 MF, 센터링(cross) = 피지컬 최고 MF (크로스 후보와 같은 규칙). 동률은 슬롯 순서.
 */
function boxLinkCands(team, carrier, action) {
  if (action === "cross") return crossCands(team, carrier);
  const mfs = team.players.filter((p) => p.position === "MF" && p.id !== carrier.id);
  const bestMf = bestOf(mfs, (p) => stat(p, "shoot"));
  return team.players.filter((p) => p.id !== carrier.id && (p.position === "FW" || (bestMf && p.id === bestMf.id)));
}

/** 받는 선수 계획 { arrival, candidates, box? }. line 3 = 박스 연결 (도착 line 3, box: true) */
function planFor(team, carrier, action, line, fx) {
  if (line >= 3) return { arrival: 3, candidates: boxLinkCands(team, carrier, action), box: true };
  if (action === "cross") return crossPlan(team, carrier);
  return passPlan(team, carrier, line, fx && fx.extraLine);
}

function canCross(data, player) {
  const t = getTrait(data, player);
  return !!(t && t.params && t.params.canCross);
}

/** player 가 line 에서 carrier 일 때 가능한 공격 액션 (enabled 여부) */
function attackOptionsFor(state, data, side, player, line, fx) {
  const team = state[side];
  const out = { dribble: false, pass: false, cross: false, shoot: false };
  if (!player) return out;
  if (line >= 3) {
    // ④ 슈팅 찬스: 슛 + 박스 연결(컷백 패스 · 센터링 = 크로서만), 연결은 포제션당 1회
    out.shoot = true;
    if (!(state.ball && state.ball.boxLinkUsed)) {
      out.pass = boxLinkCands(team, player, "pass").length > 0;
      out.cross = canCross(data, player) && boxLinkCands(team, player, "cross").length > 0;
    }
    return out;
  }
  out.dribble = true;
  out.pass = passPlan(team, player, line, fx && fx.extraLine).candidates.length > 0;
  out.cross = line === 2 && canCross(data, player) && crossCands(team, player).length > 0;
  out.shoot = line === 2;
  return out;
}

/**
 * 받는 선수 기본값 판정값 (§13.2-10): 도착 line < 3 → 그 선수의 성향 1위 값(받은 직후), 도착 line 3 → pass: 슈팅 × shoot 계수
 * × (1 + 피니셔), cross: 헤더 값 × (1 + 타깃맨·피니셔). 상대 정보 미사용.
 * passSkillId = 이번 패스가 필살 패스면 그 스킬 id → 받은 선수의 필살기가 그 필살 패스와 combos.json 에 등록된 짝(E1, comboSkillFor)이면
 * 다음 듀얼에 합체기를 쓸 수 있으므로 그 필살 효과(×comboBonus 포함)를 판정값에 반영한다 (§13.2-9 "필살기 준비·사용 조건 충족 시
 * 필살 효과"의 받는 선수판). 등록되지 않은 짝이면 합체기 가치 없음.
 */
function receiverValue(state, data, side, player, action, arrival, passSkillId = null) {
  const m = matchCfg(data);
  const team = state[side];
  const ult = passSkillId ? comboSkillFor(data, passSkillId, player) : null;
  const ultP = ult && ultTypeUsableAt(ult.ultimate, arrival) ? Object.assign({}, ult.ultimate, { combo: true }) : null;
  if (arrival >= 3) {
    const amp = teamworkAmp(team, data);
    const t = getTrait(data, player);
    const k = ampOf(t, amp);
    const hdr = action === "cross" ? num(ultP && ultP.headerMult, 1) : 1;
    const ultMult = ultP && ultP.type === "shot" ? num(ultP.shoot, 1) * hdr * ultCfg(m).comboBonus : 1;
    if (action === "cross") {
      const add = (traitParam(data, player, "headerBonus") + traitParam(data, player, "receivedShotBonus")) * k;
      return round6(headerStat(player) * num(m.actionCoef.header, num(m.actionCoef.shoot, 1.5)) * (1 + add) * ultMult);
    }
    return round6(stat(player, "shoot") * num(m.actionCoef.shoot, 1.5) * (1 + traitParam(data, player, "receivedShotBonus") * k) * ultMult);
  }
  const ultFor = ultP ? (a) => (ultMatchesAction(ultP, a) ? ultP : null) : null;
  const vals = attackTendencyAt(state, data, side, player, arrival, { fresh: true, ultFor });
  let best = 0;
  for (const v of Object.values(vals)) if (v > best) best = v;
  return best;
}

/**
 * 박스 연결(④)로 받은 선수의 마무리 값 (원터치 슛 / 헤더 공격 값, GK 배율 제외 — 비교는 boxLinkEval 이 GK 기준을 맞춘다).
 * receiverValue(도착 line 3 — 피니셔·타깃맨, 필살 패스면 합체기) + 받는 선수 자기 필살 슛: 받은 뒤 게이지
 * (onReceive / 필살 패스면 receiverGauge)가 가득이면 AI 규칙(shot = 준비되면 사용)대로 ×shoot.
 * @returns {{ value: number, ultReady: boolean, combo: boolean }} ultReady = 다음 슛에 필살 슛(합체기 포함)을 쓸 수 있다
 */
function boxReceiverValue(state, data, side, player, action, fx = null) {
  const uc = ultCfg(matchCfg(data));
  const passUlt = !!(fx && fx.ult && fx.ult.type === "pass");
  const passSkillId = passUlt ? fx.ult.skillId : null;
  const own = getPlayerUltimate(data, player);
  const shotUlt = !!(own && own.ultimate.type === "shot" && ultTypeUsableAt(own.ultimate, 3));
  // E1: 등록된 합체기 짝일 때만 합체기
  const combo = passUlt && shotUlt && !!comboSkillFor(data, passSkillId, player);
  let value = receiverValue(state, data, side, player, action, 3, passSkillId);
  let ultReady = combo;
  if (!combo && shotUlt) {
    const g = gaugeOf(state, side, player.id);
    const gain = passUlt ? receiverGaugeOf(fx.ult, uc) : uc.onReceive;
    if (g != null && g + gain >= uc.max) {
      ultReady = true;
      value *= num(own.ultimate.shoot, 1) * (action === "cross" ? num(own.ultimate.headerMult, 1) : 1);
    }
  }
  return { value: round6(value), ultReady, combo };
}

/**
 * 후보 중 기본 받는 선수 (동률 → players 순서). fx 에 필살 패스가 있으면 합체기 가치를 반영.
 * 박스 연결(plan.box)은 받는 선수 자기 필살 슛 준비까지 반영한 마무리 값 (boxReceiverValue).
 */
function defaultFromPlan(state, data, side, action, plan, fx = null) {
  if (plan.box) return bestOf(plan.candidates, (p) => boxReceiverValue(state, data, side, p, action, fx).value);
  const passSkillId = fx && fx.ult && fx.ult.type === "pass" ? fx.ult.skillId : null;
  return bestOf(plan.candidates, (p) => receiverValue(state, data, side, p, action, plan.arrival, passSkillId));
}

/**
 * side(공격) 의 현재 carrier 가 action(pass|cross) 을 할 때의 받는 선수 후보와 기본값.
 * fx 를 주면 그 효과(extraLine 등) 기준, 아니면 이번 듀얼 커밋 효과.
 * @returns {{ arrival: number, candidates: object[], defaultPlayer: object|null }}
 */
export function receiverPlan(state, data, side, action, fx = null) {
  const team = state[side];
  const carrier = findPlayer(team, state.ball && state.ball.carrierId);
  if (!carrier || (action !== "pass" && action !== "cross")) return { arrival: 0, candidates: [], defaultPlayer: null };
  const line = num(state.ball.lineIndex, 0);
  const fxA = fx || fxOf(state, side);
  const plan = planFor(team, carrier, action, line, fxA);
  return { arrival: plan.arrival, candidates: plan.candidates, defaultPlayer: defaultFromPlan(state, data, side, action, plan, fxA) };
}

/** 기본 받는 선수 id (없으면 null) */
export function defaultReceiverId(state, data, side, action, fx = null) {
  const r = receiverPlan(state, data, side, action, fx);
  return r.defaultPlayer ? r.defaultPlayer.id : null;
}

/* ------------------------------------------------------------------ */
/* 성향 (A안 자동 선택, §13.2-9)                                           */
/* ------------------------------------------------------------------ */

function headerStat(player) {
  return (stat(player, "shoot") + stat(player, "physical")) / 2;
}

function attackStatBase(player, action, header) {
  if (action === "cross") return (stat(player, "pass") + stat(player, "dribble")) / 2;
  if (action === "shoot" && header) return headerStat(player);
  return stat(player, action);
}

/** 공격 액션 계수. midrange = 파이널 서드 슛(필살 박스 슛 아님), midrangeCoef = 파워 슛 덮어쓰기 */
function attackCoef(m, action, { midrange = false, header = false, midrangeCoef = null } = {}) {
  const c = m.actionCoef || {};
  if (action === "shoot") {
    if (header) return num(c.header, num(c.shoot, 1.5));
    if (midrange) return midrangeCoef != null ? num(midrangeCoef, 0.6) : num(c.midrangeShoot, 0.6);
    return num(c.shoot, 1.5);
  }
  if (action === "cross") return num(c.cross, num(c.pass, 2.2));
  return num(c[action], 1);
}

function defenseStat(data, m, player, dAction) {
  const d = stat(player, "defense");
  if (dAction === "tackle") return (d + stat(player, "physical")) / 2;
  if (dAction === "intercept") return (d + stat(player, "pass")) / 2;
  if (dAction === "hold") {
    const wall = traitParam(data, player, "holdMult");
    return d * num(m.holdMult, 1) * (wall > 0 ? wall : 1);
  }
  return d;
}

function defenseCoef(m, dAction) {
  const c = m.actionCoef || {};
  if (dAction === "tackle" || dAction === "intercept") return num(c[dAction], 1);
  return 1;
}

/**
 * player 가 line 에서 carrier 일 때 공격 성향값 { action: value } (가능한 액션만).
 * 스탯 × 계수 × 특성 자기 보너스 × 전술 × 체력 20% 이하 규칙 × (o.ultFor(action) 이 주는 필살 효과).
 * o: { fresh, viaCross, fx, ultFor }
 */
function attackTendencyAt(state, data, side, player, line, o = {}) {
  const m = matchCfg(data);
  const tc = tendCfg(m);
  const uc = ultCfg(m);
  const team = state[side];
  const opts = attackOptionsFor(state, data, side, player, line, o.fx || null);
  const amp = teamworkAmp(team, data);
  const trait = getTrait(data, player);
  const tpar = (trait && trait.params) || {};
  const k = ampOf(trait, amp);
  const tactics = team.tactics || {};
  const low = isLowStamina(m, team, player.id);
  const vals = {};
  for (const a of ACTIONS_ATTACK) {
    if (!opts[a]) continue;
    // ④ 박스 연결은 성향값이 아니라 boxLinkEval 점수 (tendencyValues 가 carrier 에게만 더한다)
    if (line >= 3 && a !== "shoot") continue;
    const ult = o.ultFor ? o.ultFor(a) : null;
    const header = a === "shoot" && line >= 3 && !!o.viaCross;
    const boxShot = !!(ult && ult.type === "shot" && ult.boxShot);
    const midrange = a === "shoot" && line === 2 && !boxShot;
    let v = attackStatBase(player, a, header) * attackCoef(m, a, { midrange, header });
    let add = 0;
    if (a === "dribble" && o.fresh) add += num(tpar.receivedDribbleBonus) * k;
    if (a === "dribble" && line <= num(tpar.buildupMaxLine, 1)) add += num(tpar.buildupDribbleBonus) * k;
    if (a === "cross") add += num(tpar.crossBonus);
    if (a === "shoot" && o.fresh && (line >= 3 || boxShot)) add += num(tpar.receivedShotBonus) * k;
    if (header) add += num(tpar.headerBonus) * k;
    v *= 1 + add;
    if (a === "dribble" && tactics.attack === "dribble") v *= tc.tb;
    if ((a === "pass" || a === "cross") && tactics.attack === "pass") v *= tc.tb;
    if (midrange) {
      if (tactics.shootTiming === "midrange") v *= tc.mid;
      else if (tactics.shootTiming === "breakAll") v = 0;
    }
    if (low) {
      if (a === "dribble") v *= tc.lowD;
      if (a === "pass" || a === "cross") v *= tc.lowP;
    }
    if (ult) {
      // A안 성향 (§19.3-4): 필살 슛 ×shoot (헤더면 ×headerMult 더), 필살 패스 · 필살 드리블 ×attack. 팀 필살기는 모든 액션에 같은
      // 배율이라 성향을 바꾸지 않는다 (합체기 ×comboBonus 는 그대로).
      if (ult.type === "shot" && a === "shoot") v *= num(ult.shoot, 1) * (header ? num(ult.headerMult, 1) : 1);
      if (ult.type === "pass" && ultMatchesAction(ult, a)) v *= num(ult.attack, 1);
      if (ult.type === "dribble" && a === "dribble") v *= num(ult.attack, 1);
      if (ult.combo) v *= uc.comboBonus;
    }
    vals[a] = round6(v);
  }
  return vals;
}

/** 수비 성향값 { tackle, intercept, hold } — 스탯 × 계수 × 전술 */
function defenseTendency(state, data, side, player) {
  const m = matchCfg(data);
  const tc = tendCfg(m);
  const tactics = state[side].tactics || {};
  const vals = {};
  for (const d of ACTIONS_DEFENSE) {
    let v = defenseStat(data, m, player, d) * defenseCoef(m, d);
    if (tactics.defense === d) v *= tc.tb;
    vals[d] = round6(v);
  }
  return vals;
}

/**
 * 성향값 (§13.2-9). side 가 공격 중이면 carrier(또는 playerId)의 공격 성향, 수비 중이면 듀얼 수비수의 수비 성향.
 * carrier 의 성향에는 받은 직후 특성과 AI 규칙상 쓸 필살기 효과가 들어간다. GK 듀얼(line 3) 수비는 {}.
 * ④(line 3) carrier (2026-09-29 기대 골 규칙): { shoot, pass?, cross? } = boxLinkEval 의 기대 골 × 100 (%, 반올림 전)
 *  → 자동 선택은 boxLinkEval.auto (연결이 슛보다 "커야" 연결 — 동률은 슛. autoAction · ai.decideAttack 이 그것을 쓴다).
 * 상태를 바꾸지 않고 난수를 쓰지 않는다.
 */
export function tendencyValues(state, data, side, playerId = null) {
  if (!state || !state.ball || !state[side]) return {};
  const team = state[side];
  const line = num(state.ball.lineIndex, 0);
  if (state.attackingSide === side) {
    const pid = playerId || state.ball.carrierId;
    const p = findPlayer(team, pid);
    if (!p) return {};
    const isCarrier = pid === state.ball.carrierId;
    if (isCarrier && line >= 3 && state.duel) {
      const box = boxTendency(boxLinkEval(state, data, side));
      if (box) return box;
    }
    return attackTendencyAt(state, data, side, p, line, {
      fresh: isCarrier && !!state.ball.receivedFresh,
      viaCross: isCarrier && state.ball.receivedVia === "cross",
      fx: isCarrier ? fxOf(state, side) : null,
      ultFor: isCarrier ? carrierUltFor(state, data, side, p) : null,
    });
  }
  if (line >= 3) return {};
  const pid = playerId || (state.duel && state.duel.defenderId);
  const p = findPlayer(team, pid);
  return p ? defenseTendency(state, data, side, p) : {};
}

/** 성향값 1위 액션. 동률이면 order 순서 (§13.2-9) */
export function pickByTendency(values, order) {
  let best = null;
  let bv = -Infinity;
  const keys = order.filter((a) => a in values).concat(Object.keys(values).filter((a) => !order.includes(a)));
  for (const a of keys) {
    const v = values[a];
    if (Number.isFinite(v) && v > bv) {
      bv = v;
      best = a;
    }
  }
  return best;
}

/** 자동(A안) 액션: side 의 현재 역할에서 성향 1위. ④ 공격은 기대 골 규칙 (boxLinkEval.auto) */
export function autoAction(state, data, side) {
  const m = matchCfg(data);
  const tc = tendCfg(m);
  if (state.attackingSide === side) {
    if (num(state.ball.lineIndex, 0) >= 3) {
      const ev = state.duel ? boxLinkEval(state, data, side) : null;
      return ev && ev.auto ? ev.auto.action : "shoot";
    }
    return pickByTendency(tendencyValues(state, data, side), tc.tieA) || "dribble";
  }
  if (num(state.ball.lineIndex, 0) >= 3) return "save";
  return pickByTendency(tendencyValues(state, data, side), tc.tieD) || "hold";
}

/* ------------------------------------------------------------------ */
/* 필살기 (§13.2-12)                                                      */
/* ------------------------------------------------------------------ */

export function gaugeOf(state, side, pid) {
  const lv = state[side] && state[side].live && state[side].live[pid];
  return lv && lv.gauge != null ? num(lv.gauge, 0) : null;
}

/** 준비 = 게이지 가득 또는 합체기 대기 */
export function ultimateReady(state, data, side, pid) {
  const g = gaugeOf(state, side, pid);
  if (g == null) return false;
  const uc = ultCfg(matchCfg(data));
  return g >= uc.max || (state.attackingSide === side && state.ball && state.ball.comboReadyId === pid);
}

function isComboReady(state, side, pid) {
  return state.attackingSide === side && !!state.ball && state.ball.comboReadyId === pid;
}

/**
 * 필살기(ultimate 객체)를 공격하는 쪽이 line 에서 쓸 수 있는가 (합체기 · 받는 선수 가치 · 외침 · 다음 슛 판단용 — §19.3-1).
 * shot: line ≥ minLine(기본 2), pass: line ≤ 3 (④ 박스 연결 포함 — 받아서 ④ 에 도착한 선수는 이번 포제션 박스 연결을 아직 안 했다),
 * dribble: line ≤ 2, team: 늘, save · defense: 거짓 (받는 선수 = 공격 쪽). 박스 연결로 받은 선수의 값은 boxReceiverValue(마무리 값)라
 * 여기의 pass 결과를 쓰지 않는다.
 */
function ultTypeUsableAt(ult, line) {
  const t = ult && ult.type;
  if (t === "shot") return line >= num(ult.minLine, 2);
  if (t === "pass") return line <= 3;
  if (t === "dribble") return line <= 2;
  if (t === "team") return true;
  return false;
}

/** 패스 필살기 actions 사유 문구 */
function passActionsReason(ult) {
  const acts = ultPassActions(ult);
  if (acts.length === 1) return acts[0] === "cross" ? "크로스와 함께만" : "패스와 함께만";
  return "패스·크로스와 함께만";
}

/**
 * 이번 듀얼에서 player 가 필살기를 쓸 수 있는가 (준비·종류·위치·액션). action null 이면 액션 무관 조건만.
 * 종류별 (§19.3-3, §19.5 ~ §19.7): shot = 공격 · line ≥ minLine · 슛 / pass = 공격 · actions 안 / save = GK 세이브 /
 * defense = 필드 수비(line ≤ 2) · 수비 3종 / team = 듀얼 참가자 · 팀당 포제션 1번 / dribble = 공격 · line ≤ 2 · 드리블.
 * @returns {{ ok: boolean, reason: string|null, skill: object|null, combo: boolean }}
 */
export function ultimateUsable(state, data, side, player, role, action = null) {
  const skill = player ? getPlayerUltimate(data, player) : null;
  if (!skill) return { ok: false, reason: "필살기 없음", skill: null, combo: false };
  const line = num(state.ball && state.ball.lineIndex, 0);
  const fx = fxOf(state, side);
  const combo = role === "attack" && isComboReady(state, side, player.id);
  const u = skill.ultimate;
  const t = u.type;
  const no = (reason) => ({ ok: false, reason, skill, combo });
  if (fx.ult) return no("이번 듀얼에 이미 사용");
  if (!ultimateReady(state, data, side, player.id)) return no("게이지 부족");
  if (t === "shot") {
    const minLine = num(u.minLine, 2);
    if (role !== "attack" || line < minLine) return no(minLine >= 3 ? "박스 슛에서만" : "파이널 서드·박스 슛에서만");
    if (action && action !== "shoot") return no("슛과 함께만");
  } else if (t === "pass") {
    if (role !== "attack") return no("패스·크로스에서만");
    const acts = ultPassActions(u);
    if (line >= 3) {
      // ④ 박스 연결(컷백·센터링)에서도 쓸 수 있다 — 연결이 가능할 때만 (포제션당 1회)
      const opts = attackOptionsFor(state, data, side, player, line, fx);
      if (!acts.some((a) => opts[a])) {
        if (state.ball && state.ball.boxLinkUsed) return no("박스 연결은 포제션당 1회");
        return no(opts.pass || opts.cross ? passActionsReason(u) : "연결할 동료 없음");
      }
    } else if (!action && Array.isArray(u.actions)) {
      // actions 를 적은 필살 패스: 지금 그 액션을 할 수 있어야 (예: 크로스 전용은 파이널 서드 크로서만)
      const opts = attackOptionsFor(state, data, side, player, line, fxPlusUlt(fx, skill, null));
      if (!acts.some((a) => opts[a])) return no(passActionsReason(u));
    }
    if (action && !acts.includes(action)) return no(passActionsReason(u));
  } else if (t === "save") {
    if (role !== "defense" || line < 3) return no("GK 세이브에서만");
  } else if (t === "defense") {
    // E2: 필드 수비 듀얼(line ≤ 2)에서 수비 3종 어느 것과도 — line 3 은 GK 세이브
    if (role !== "defense" || line >= 3) return no("필드 수비에서만");
    if (action && !ultMatchesAction(u, action)) return no("필드 수비에서만");
  } else if (t === "team") {
    // E3: 듀얼 참가자(공 가진 선수 · 막는 선수 · GK)면 역할 · line 상관없이, 팀당 포제션마다 1번
    const pfx = state.possessionFx && state.possessionFx[side];
    if (pfx && pfx.teamUlt) return no("이번 포제션에 이미 사용");
  } else if (t === "dribble") {
    // E4: 공격 드리블 (line ≤ 2)
    if (role !== "attack") return no("드리블과 함께만");
    if (line >= 3) return no("박스에서는 드리블 없음");
    if (action && action !== "dribble") return no("드리블과 함께만");
  } else {
    return no(`알 수 없는 필살기 종류: ${t}`);
  }
  return { ok: true, reason: null, skill, combo };
}

/**
 * AI 필살기 사용 규칙 (§13.3 + §19.4 ~ §19.7): 합체기 = 가능하면 항상, 마지막 2포제션 = 준비되면 즉시,
 * shot · dribble = 그 액션을 고르면 준비됐을 때, pass = 도착이 박스이거나 (E1) 받는 선수가 등록된 합체기 짝이고 도착 line 에서
 * 그 필살기를 쓸 수 있거나, extraLine 필살 패스가 실제로 한 구역을 건너뛸 때 (§19.4 [구현 결정]),
 * save = line 3 에서 동점·열세 또는 남은 포제션 ≤ 3 이거나 게이지 가득, defense = line 2 수비 (E2), team = 지고 있을 때 (E3).
 */
export function aiWantsUltimate(state, data, side, player, role, action, receiverId = null, fx = null) {
  const chk = ultimateUsable(state, data, side, player, role, action);
  if (!chk.ok) return false;
  if (chk.combo) return true;
  const left = possessionsLeft(state);
  if (left <= 2) return true;
  const u = chk.skill.ultimate;
  const t = u.type;
  const line = num(state.ball.lineIndex, 0);
  if (t === "shot" || t === "dribble") return true;
  if (t === "pass") {
    const team = state[side];
    const fxU = fxPlusUlt(fx || fxOf(state, side), chk.skill, null);
    const plan = planFor(team, player, action, line, fxU);
    if (plan.arrival >= 3) return true;
    if (u.extraLine && plan.arrival > Math.min(3, line + 1)) return true;
    const rid = receiverId || (defaultFromPlan(state, data, side, action, plan, fxU) || {}).id;
    const r = findPlayer(team, rid);
    const b = r ? comboSkillFor(data, chk.skill.id, r) : null;
    return !!(b && ultTypeUsableAt(b.ultimate, plan.arrival));
  }
  if (t === "save") {
    const g = gaugeOf(state, side, player.id);
    return scoreDiffFor(state, side) <= 0 || left <= 3 || g >= ultCfg(matchCfg(data)).max;
  }
  if (t === "defense") return line === 2;
  if (t === "team") return scoreDiffFor(state, side) < 0;
  return false;
}

/** 성향 반영용: AI 가 이 액션과 함께 필살기를 쓸 거라면 { ...ultimate, combo } */
function aiUltFor(state, data, side, player, role, action) {
  if (!aiWantsUltimate(state, data, side, player, role, action)) return null;
  const skill = getPlayerUltimate(data, player);
  return Object.assign({}, skill.ultimate, { combo: isComboReady(state, side, player.id) });
}

/**
 * carrier 성향값에 넣을 필살기 (action → ultimate|null). 이번 듀얼에 이미 커밋했으면 그 필살기(합체기 포함 — 게이지는 이미 0 이라
 * aiUltFor 로는 다시 안 잡힌다), 아니면 AI 규칙상 쓸 필살기. AI 공격수가 먼저 커밋한 뒤의 뷰(view.boxLink)도 커밋 전과 같은 값을 낸다.
 */
function carrierUltFor(state, data, side, player) {
  const fx = fxOf(state, side);
  if (!fx.ult) return (a) => aiUltFor(state, data, side, player, "attack", a);
  const u = fx.ult;
  return (a) => (ultMatchesAction(u, a) ? Object.assign({}, u, { combo: !!fx.combo }) : null);
}

/* ------------------------------------------------------------------ */
/* 박스 연결 자동 규칙 (④, 2026-09-29)                                     */
/* ------------------------------------------------------------------ */

/**
 * ④(line 3) 박스 연결 자동 규칙 — 기대 골 비교 (2026-09-29 사용자 결정). 결정적, 상대의 선택을 읽지 않는다, 난수 없음.
 * 사람 측 자동 · 상대 AI 공통. 미리보기(evaluateHuman)와 같은 확률 함수(boxExpect)로 계산한다:
 *  shoot.exp = 지금 슛의 골 확률 (carrier 가 쓸 필살 슛 포함 — 이미 커밋했으면 그것, 아니면 AI 규칙 aiWantsUltimate · 합체기).
 *  [pass|cross].exp = 연결 성공 × 받은 선수의 다음 슛 골 확률 (nextShotP: 원터치 · 헤더 · 킬패스 · 받은 뒤 준비되는 필살 슛 · 합체기).
 *    받는 선수 = 기본 받는 선수 (defaultFromPlan — 필살 패스를 쓰면 합체기 가치 반영), carrier 의 필살 패스는 AI 규칙대로 (박스 도착 = 사용).
 *  GK = 중립 (자세 선택 없음). GK 의 세이브(스킬 · 필살 세이브)는 양 팀 모두 규칙 자동이라 커밋했으면 그 효과, 아직이면 같은 규칙의
 *    예측(ai.decideDefense)을 쓴다 (gkFxFor) — 커밋 전후 같은 값.
 *  auto = 연결 기대 골 > 슛 골 확률일 때만 연결 (동률 = 슛), 연결 둘 중에는 기대 골 최고 (동률 tieAttack 순서).
 *  value / score = exp × 100 (성향값 척도 — %). forced 는 폐지 (항상 false, 옛 뷰 호환).
 * @returns {{ rule: "ev", gkMult: number, shoot: object|null, pass: object|null, cross: object|null, auto: object|null }}
 */
export function boxLinkEval(state, data, side) {
  const m = matchCfg(data);
  const bc = boxLinkCfg(m);
  const out = { rule: "ev", gkMult: bc.gkMult, shoot: null, pass: null, cross: null, auto: null };
  if (!state || !state.ball || !state.duel || state.attackingSide !== side || num(state.ball.lineIndex, 0) < 3 || !state[side]) return out;
  const team = state[side];
  const carrier = findPlayer(team, state.ball.carrierId);
  if (!carrier || !findPlayer(state[otherSide(side)], state.duel.defenderId)) return out;
  const fx = fxOf(state, side);
  const fxG = gkFxFor(state, data, side);
  const own = getPlayerUltimate(data, carrier);
  // 슛: 이미 커밋한 필살 슛(AI 는 판정 전에 먼저 커밋 — 게이지 0), 아니면 AI 규칙상 쓸 필살 슛 (합체기 포함)
  let fxS = fx;
  let shotUlt = !!(fx.ult && ultMatchesAction(fx.ult, "shoot"));
  // 슛과 함께 쓰는 자기 필살기: 필살 슛, 또는 팀 필살기 (E3 — AI 규칙상 쓸 때)
  if (!fx.ult && own && ultMatchesAction(own.ultimate, "shoot") && aiWantsUltimate(state, data, side, carrier, "attack", "shoot")) {
    fxS = fxPlusUlt(fx, own, comboFor(state, data, side, carrier, own));
    shotUlt = true;
  }
  const shot = boxExpect(state, data, side, carrier, "shoot", fxS, fxG);
  out.shoot = { action: "shoot", exp: shot.exp, p: shot.p, value: round6(shot.exp * 100), ultimate: shotUlt, combo: !!fxS.combo };
  const opts = attackOptionsFor(state, data, side, carrier, 3, fx);
  for (const a of ["pass", "cross"]) {
    if (!opts[a]) continue;
    const plan = planFor(team, carrier, a, 3, fx);
    let fxA = fx;
    let ultimate = !!(fx.ult && ultMatchesAction(fx.ult, a)); // 이미 커밋한 필살 패스 (또는 팀 필살기)
    if (own && ultMatchesAction(own.ultimate, a) && !fx.ult) {
      const fxU = fxPlusUlt(fx, own, null);
      const rU = defaultFromPlan(state, data, side, a, plan, fxU);
      if (aiWantsUltimate(state, data, side, carrier, "attack", a, rU ? rU.id : null)) {
        fxA = fxU;
        ultimate = true;
      }
    }
    const r = defaultFromPlan(state, data, side, a, plan, fxA);
    if (!r) continue;
    const ex = boxExpect(state, data, side, carrier, a, fxA, fxG, r.id);
    const fin = boxReceiverValue(state, data, side, r, a, fxA);
    const value = round6(ex.exp * 100);
    out[a] = {
      action: a, receiverId: r.id, exp: ex.exp, linkP: ex.p, finishP: ex.finishP, value, score: value, forced: false,
      ultimate, receiverUltimate: fin.ultReady, combo: fin.combo,
    };
  }
  // 연결 둘 중 기대 골 최고 (동률 tieAttack 순서) → 슛보다 커야 연결
  let link = null;
  for (const a of tendCfg(m).tieA.filter((x) => x === "pass" || x === "cross").concat(["pass", "cross"])) {
    const o = out[a];
    if (o && (!link || o.exp > link.exp + 1e-12)) link = o;
  }
  out.auto = link && link.exp > shot.exp + 1e-12
    ? { action: link.action, receiverId: link.receiverId, ultimate: link.ultimate }
    : { action: "shoot", receiverId: null, ultimate: shotUlt };
  return out;
}

/** boxLinkEval → ④ carrier 성향값 { shoot, pass?, cross? } (기대 골 %). 평가가 없으면 null */
export function boxTendency(ev) {
  if (!ev || !ev.shoot) return null;
  const vals = { shoot: ev.shoot.value };
  for (const a of ["pass", "cross"]) if (ev[a]) vals[a] = ev[a].value;
  return vals;
}

/** carrier 가 합체기 대기(필살 패스를 받음)면 그 합체기 { name, passerId, passerSkillId }, 아니면 null */
function comboFor(state, data, side, player, skill) {
  if (!isComboReady(state, side, player.id) || !state.ball.comboFrom) return null;
  // 이름 폴백 "합체기" 는 옛 진행 중 경기 저장본의 comboReadyId 용 (E1 이후 새 경기에서는 등록된 짝만 생긴다)
  const from = state.ball.comboFrom;
  return { name: comboName(data, from.skillId, skill.id) || "합체기", passerId: from.playerId, passerSkillId: from.skillId };
}

/**
 * ④ 에서 side(공격)가 상대할 GK 효과: GK 측이 이미 커밋했으면 그 효과 (세이브는 양 팀 모두 규칙 자동), 아니면 같은 규칙
 * (ai.decideDefense — 스킬 · 필살 세이브)의 예측. 커밋 전후 같은 값이라 사람 측 자동 · 상대 AI 가 같은 기대 골을 본다.
 */
function gkFxFor(state, data, side) {
  const opp = otherSide(side);
  const choice = state.duel && state.duel[opp + "Choice"];
  const fx = fxOf(state, opp);
  if (choice && choice.action) return fx;
  const gk = findPlayer(state[opp], state.duel && state.duel.defenderId);
  if (!gk) return fx;
  const d = decideDefense(state, data, opp);
  let f = fx;
  if (d.skillId) f = fxPlusSkill(f, getSkill(data, d.skillId));
  if (d.ultimate) {
    const u = getPlayerUltimate(data, gk);
    if (u) f = fxPlusUlt(f, u, null);
  }
  return f;
}

/**
 * ④ 한 액션의 기대 골 (미리보기 · 자동 규칙 공용). shoot = 골 확률, pass/cross = 연결 성공 × 받은 선수 다음 슛 골 확률.
 * @returns {{ p: number, exp: number, finishP: number|null, receiverId: string|null }}
 */
function boxExpect(state, data, side, carrier, action, fxA, fxG, receiverId = null) {
  const odds = computeOdds(state, data, { action, defAction: "save", fxA, fxD: fxG });
  if (action === "shoot") return { p: odds.p, exp: odds.p, finishP: null, receiverId: null };
  const tr = successTransition(state, data, side, carrier, action, fxA, receiverId);
  const fin = nextShotP(state, data, side, carrier, tr, action, "save", fxA, fxG);
  return { p: odds.p, exp: odds.p * fin, finishP: fin, receiverId: tr.receiver.id };
}

function addGauge(state, data, side, pid, amount) {
  const lv = state[side] && state[side].live && state[side].live[pid];
  if (!lv || lv.gauge == null || !amount) return;
  const uc = ultCfg(matchCfg(data));
  lv.gauge = round1(clamp(num(lv.gauge, 0) + num(amount, 0), 0, uc.max));
}

function commitUltimate(state, data, side, player, role, action) {
  const chk = ultimateUsable(state, data, side, player, role, action);
  if (!chk.ok) throw new Error(`match: 필살기 사용 불가 — ${chk.reason}`);
  const skill = chk.skill;
  const fx = state.duel.effects[side];
  let combo = null;
  if (chk.combo && state.ball.comboFrom) {
    const from = state.ball.comboFrom;
    combo = { name: comboName(data, from.skillId, skill.id) || "합체기", passerId: from.playerId, passerSkillId: from.skillId };
  } else {
    state[side].live[player.id].gauge = 0;
  }
  applyUlt(fx, skill, combo); // 미리보기(fxPlusUlt)와 같은 함수 (§19.3-2)
  const st = state.stats[side];
  st.ultimatesUsed += 1;
  const u = skill.ultimate;
  pushEvent(state, {
    type: "cutin", side, playerId: player.id, skillId: skill.id, ultimateType: u.type, combo: !!combo,
    // E5: 컷인 대사 · 등급 (데이터에 있을 때만 — 없으면 화면이 대사 없이 SSR 길이로 그린다)
    ...(u.cutinLine ? { line: u.cutinLine } : {}),
    ...(u.tier ? { tier: u.tier } : {}),
    text: `★ ${player.name}, ${ULT_TYPE_TEXT[u.type] || "필살기"} [${skill.name}] 발동!${combo ? " (합체기)" : ""}`,
  });
  if (combo) {
    st.combos += 1;
    const passer = findPlayer(state[side], combo.passerId);
    pushEvent(state, {
      type: "combo", side, name: combo.name, skillIds: [combo.passerSkillId, skill.id], playerIds: [combo.passerId, player.id],
      text: `★★ 합체기 [${combo.name}]! ${passer ? passer.name : "?"} → ${player.name}`,
    });
  }
}

/* ------------------------------------------------------------------ */
/* 간파 (§13.2-8)                                                         */
/* ------------------------------------------------------------------ */

/** 이 선수(역할)의 간파 스킬 (보유 · 역할 맞음) */
function gaanpaSkillOf(data, player, role) {
  if (!player) return null;
  return getPlayerActiveSkills(data, player).find((sk) => {
    if (!isGaanpaSkill(sk)) return false;
    const ph = sk.active.phase || "any";
    return ph === "any" || ph === role;
  }) || null;
}

/**
 * 간파 가능 여부와 쓸 수단. pref: true(사용권 우선) | "ticket" | "skill"
 * @returns {{ usable, reason, source: "skill"|"ticket"|null, skillId, cost, tickets }}
 */
export function gaanpaStatus(state, data, side, pref = true) {
  const team = state[side];
  const tickets = num(team && team.gaanpaTickets, 0);
  const out = { usable: false, reason: null, source: null, skillId: null, cost: 0, tickets };
  if (!state.duel || state.finished || state.phase !== "decision") return Object.assign(out, { reason: "듀얼 중이 아님" });
  const role = state.attackingSide === side ? "attack" : "defense";
  const pid = role === "attack" ? state.ball.carrierId : state.duel.defenderId;
  const player = findPlayer(team, pid);
  const skill = gaanpaSkillOf(data, player, role);
  const skillOk = skill ? checkSkillUsable(state, data, side, player.id, skill, role) : { ok: false, reason: "간파 스킬 없음" };
  if (pref !== "skill" && tickets > 0) {
    out.source = "ticket";
  } else if (pref !== "ticket" && skill) {
    out.source = "skill";
    out.skillId = skill.id;
    out.cost = skillCost(team, skill);
  }
  const line = num(state.ball.lineIndex, 0);
  const fx = fxOf(state, side);
  const opp = otherSide(side);
  if (line >= 3) return Object.assign(out, { reason: "박스에서는 간파 불가" });
  if (state.duel.gaanpaSide === opp) return Object.assign(out, { reason: "상대가 먼저 간파" });
  if (fx.gaanpa) return Object.assign(out, { reason: "이번 듀얼에 이미 간파" });
  if (!out.source) return Object.assign(out, { reason: "간파 스킬·사용권 없음" });
  if (out.source === "skill" && !skillOk.ok) return Object.assign(out, { reason: skillOk.reason });
  out.usable = true;
  return out;
}

function commitGaanpaTicket(state, data, side, player, role) {
  const team = state[side];
  if (num(team.gaanpaTickets, 0) <= 0) throw new Error("match: 간파 사용권이 없습니다");
  team.gaanpaTickets = num(team.gaanpaTickets, 0) - 1;
  const fx = state.duel.effects[side];
  applyTicketFx(fx, role, data);
  if (!state.duel.gaanpaSide) state.duel.gaanpaSide = side;
  state.stats[side].gaanpaUsed += 1;
  pushEvent(state, {
    type: "skill", side, playerId: player.id, skillId: null, effect: role === "defense" ? "readBoost" : "negateRead",
    gaanpa: true, ticket: true, cost: 0,
    text: `${player.name}, 간파 사용권! ${role === "defense" ? `짝을 맞히면 ×${fmtMult(ticketReadMult(data))}` : "상대 짝 맞힘 무효"}`,
  });
}

/* ------------------------------------------------------------------ */
/* 선택 커밋                                                              */
/* ------------------------------------------------------------------ */

/**
 * 선택 커밋. 액션·받는 선수 검증 + 일반 액티브(applyActive) + 간파 사용권 + 필살기.
 * choice.action 이 null 이면 스킬·간파만 사용하고 결정은 유지.
 * 검증은 상태를 바꾸기 전에 모두 끝낸다 (무효 입력이면 throw, 상태 불변).
 */
function commitChoice(state, data, side, choice, byAI) {
  if (!state.duel) throw new Error("match: 진행 중인 듀얼이 없습니다");
  const c = choice || {};
  const role = state.attackingSide === side ? "attack" : "defense";
  const line = state.ball.lineIndex;
  const participantId = role === "attack" ? state.ball.carrierId : state.duel.defenderId;
  const participant = findPlayer(state[side], participantId);
  if (!participant) throw new Error(`match: ${side} 팀 듀얼 당사자를 찾을 수 없습니다`);

  let action = c.action ? c.action : null;
  if (role === "defense" && line >= 3) {
    action = "save";
  } else if (action) {
    const list = role === "attack" ? getAttackActions(state, side, data) : getDefenseActions(state, side, data);
    const ok = list.find((a) => a.action === action && a.enabled);
    if (!ok) throw new Error(`match: 지금 사용할 수 없는 액션입니다: ${action} (${role}, line ${line})`);
  }

  // 일반 액티브
  let skill = c.skillId ? getSkill(data, c.skillId) : null;
  // 간파 수단
  let gaanpa = null;
  if (c.gaanpa) {
    const pref = c.gaanpa === "skill" || c.gaanpa === "ticket" ? c.gaanpa : (skill ? "ticket" : true);
    const g = gaanpaStatus(state, data, side, pref);
    if (!g.usable) throw new Error(`match: 간파 사용 불가 — ${g.reason}`);
    if (g.source === "skill") {
      if (skill && skill.id !== g.skillId) throw new Error("match: 간파 스킬과 다른 액티브는 한 듀얼에 함께 쓸 수 없습니다");
      skill = getSkill(data, g.skillId);
    } else {
      gaanpa = "ticket";
    }
  }
  if (skill) {
    const chk = checkSkillUsable(state, data, side, participant.id, skill, role);
    if (!chk.ok) throw new Error(`match: 스킬 ${skill.id} 사용 불가 — ${chk.reason}`);
  }

  // 필살기
  const wantUlt = !!c.ultimate;
  let ultChk = null;
  if (wantUlt) {
    if (!action) throw new Error("match: 필살기는 액션과 함께 선택해야 합니다");
    ultChk = ultimateUsable(state, data, side, participant, role, action);
    if (!ultChk.ok) throw new Error(`match: 필살기 사용 불가 — ${ultChk.reason}`);
  }

  // 받는 선수 (스킬·필살기 효과를 반영한 도착 라인·기본값 기준)
  let receiverId = null;
  if (action === "pass" || action === "cross") {
    let fxH = skill ? fxPlusSkill(fxOf(state, side), skill) : fxOf(state, side);
    if (wantUlt) fxH = fxPlusUlt(fxH, ultChk.skill, null);
    const r = receiverPlan(state, data, side, action, fxH);
    if (c.receiverId != null) {
      if (!r.candidates.some((p) => p.id === c.receiverId)) {
        throw new Error(`match: 받을 수 없는 선수입니다: ${c.receiverId} (${action})`);
      }
      receiverId = c.receiverId;
    } else {
      receiverId = r.defaultPlayer ? r.defaultPlayer.id : null;
    }
  }

  // --- 적용 ---
  if (skill) {
    applyActive(state, side, participant.id, skill, { staminaMax: num(matchCfg(data).staminaMax, 100) });
    state.stats[side].skillsUsed += 1;
    if (isGaanpaSkill(skill)) state.stats[side].gaanpaUsed += 1;
  }
  if (gaanpa === "ticket") commitGaanpaTicket(state, data, side, participant, role);
  if (wantUlt) commitUltimate(state, data, side, participant, role, action);

  const prev = state.duel[side + "Choice"] || {};
  state.duel[side + "Choice"] = {
    action,
    skillId: skill ? skill.id : prev.skillId || null,
    receiverId,
    ultimate: wantUlt || !!prev.ultimate,
    gaanpa: gaanpa || (skill && isGaanpaSkill(skill) ? "skill" : prev.gaanpa || null),
    byAI: !!byAI,
    values: c.values || prev.values || null,
  };
  return state.duel[side + "Choice"];
}

/* ------------------------------------------------------------------ */
/* 액션 목록                                                             */
/* ------------------------------------------------------------------ */

function fmtMult(x) {
  return String(Math.round(num(x, 1) * 100) / 100);
}

/** 파이널 서드 중거리 슛 힌트. "위력" = actionCoef.midrangeShoot / actionCoef.shoot (박스 슛 대비) — config 에서 계산 */
function midrangeHint(data, fx = null, weakText = "vs 버티기에 약함") {
  const m = data && data.config && data.config.match;
  if (!m || !m.actionCoef) return `위력 감소 · ${weakText}`;
  // 파워 슛: 중거리 계수 덮어쓰기(midrangeCoef) × 슛 배율(shootMult)
  const coef = fx && fx.midrangeCoef != null ? num(fx.midrangeCoef, 0.6) : num(m.actionCoef.midrangeShoot, 0.6);
  const ratio = (coef * (fx ? num(fx.shootMult, 1) : 1)) / (num(m.actionCoef.shoot, 1) || 1);
  return `위력 ×${fmtMult(ratio)} · ${weakText}`;
}

/** 짝·빗나감 배율 힌트 — config.match.readBonus / missMult. fx(수비 측 효과)의 간파 배율(readMult)·빗나감 무시(noMissPenalty) 반영 */
function pairHint(data, fx = null) {
  const m = data && data.config && data.config.match;
  if (!m) return "짝 보너스";
  const read = fx && num(fx.readMult, 0) > 0 ? num(fx.readMult) : num(m.readBonus, 1.5);
  const miss = fx && fx.noMissPenalty ? "빗나감 없음" : `빗나감 ×${fmtMult(num(m.missMult, 0.8))}`;
  return `짝 ×${fmtMult(read)} · ${miss}`;
}

/** "짝 무효"를 준 효과의 이름 (필살 패스 > 스킬 > 간파 사용권) — 힌트용 */
function negateSourceName(data, fx, action) {
  const skName = (id) => {
    if (!id || !data || !Array.isArray(data.skills)) return null;
    const sk = data.skills.find((x) => x && x.id === id);
    return sk ? sk.name : null;
  };
  if (fx.ult && (fx.ult.type === "pass" || fx.ult.type === "dribble") && fx.ult.negateRead && ultMatchesAction(fx.ult, action)) {
    return skName(fx.ult.skillId) || ULT_TYPE_TEXT[fx.ult.type];
  }
  if (fx.gaanpa === "ticket") return "간파";
  return skName(fx.usedSkillId) || "간파";
}

function receiverNameFor(state, data, side, action) {
  if (!data) {
    const team = state[side];
    const carrier = findPlayer(team, state.ball.carrierId);
    const plan = planFor(team, carrier, action, num(state.ball.lineIndex, 0), fxOf(state, side));
    return plan.candidates[0] ? plan.candidates[0].name : "?";
  }
  const choice = state.duel && state.duel[side + "Choice"];
  if (choice && choice.action === action && choice.receiverId) {
    const p = findPlayer(state[side], choice.receiverId);
    if (p) return p.name;
  }
  const r = receiverPlan(state, data, side, action);
  return r.defaultPlayer ? r.defaultPlayer.name : "?";
}

/**
 * side(공격 팀)의 현재 라인에서 가능한 공격 액션 (dribble, pass, cross, shoot). data 를 주면 힌트 배율을 config 에서 계산.
 * fx = 가정한 공격 측 효과(미리보기 — 스킬·필살기·간파 토글). 없으면 이번 듀얼에 커밋된 효과. 약점 문구가 효과를 따른다:
 * 짝 무효(간파·스루 패스·필살 패스) → "짝 무효 (이름)", 필살 슛(boxShot) → 제목 "필살 슛" · "박스 슛 취급 · GK ×gkMult",
 * 파워 슛(중거리 계수 덮어쓰기) → 중거리 위력 배율.
 */
export function getAttackActions(state, side, data = null, fx = null) {
  const line = state.ball ? state.ball.lineIndex : 0;
  const team = state[side];
  const carrier = findPlayer(team, state.ball && state.ball.carrierId);
  const isAtk = state.attackingSide === side && !!carrier && !state.finished;
  const fxA = fx || fxOf(state, side);
  const opts = isAtk ? attackOptionsFor(state, data, side, carrier, line, fxA) : { dribble: false, pass: false, cross: false, shoot: false };
  const oneTouch = !!(state.ball && state.ball.oneTouch);
  const header = !!(state.ball && state.ball.receivedVia === "cross");
  const crosserOk = isAtk && canCross(data, carrier);
  const weak = (action, text) => (negateApplies(fxA, action) ? `짝 무효 (${negateSourceName(data, fxA, action)})` : text);
  const ultShot = !!(fxA.ult && fxA.ult.type === "shot");
  const gk = ultShot && num(fxA.ult.gkMult, 1) !== 1 ? ` · GK ×${fmtMult(num(fxA.ult.gkMult, 1))}` : "";
  let shootLabel = line === 2 ? "중거리 슛" : header && line >= 3 ? "헤더" : "슛";
  let shootHint;
  if (line === 2 && ultShot && fxA.ult.boxShot) {
    shootLabel = "필살 슛";
    shootHint = `박스 슛 취급${gk}`;
  } else if (line === 2) {
    shootHint = midrangeHint(data, fxA, weak("shoot", "vs 버티기에 약함"));
  } else {
    shootHint = `GK와 1:1${header ? " · 헤더" : ""}${oneTouch ? " · 원터치" : ""}${ultShot ? ` · 필살${gk}` : ""}`;
  }
  // ④ 박스 연결: 컷백 패스(→ 원터치 슛) · 센터링(크로서만 → 헤더), GK 와 경합, 포제션당 1회
  const box = line >= 3;
  const linkUsed = box && !!(state.ball && state.ball.boxLinkUsed);
  const boxOff = linkUsed ? "박스 연결은 포제션당 1회" : "받을 동료 없음";
  const boxFail = box && (opts.pass || opts.cross) ? boxLinkFailHint(state, data, side) : "";
  return [
    {
      action: "dribble", enabled: opts.dribble, label: "드리블",
      hint: opts.dribble ? weak("dribble", "vs 태클에 약함") : box ? (opts.pass || opts.cross ? "박스 안 — 슛·연결만" : "슛만 가능") : "불가",
    },
    {
      action: "pass", enabled: opts.pass, label: box ? "컷백 패스" : "패스",
      hint: opts.pass
        ? box
          ? `→ ${receiverNameFor(state, data, side, "pass")} 원터치 슛 · GK와 경합 (${boxFail})`
          : `→ ${receiverNameFor(state, data, side, "pass")} · ${weak("pass", "vs 인터셉트에 약함")}`
        : box ? boxOff : line === 2 ? "같은 라인 FW 동료 없음" : "패스 상대 없음",
    },
    {
      action: "cross", enabled: opts.cross, label: box ? "센터링" : "크로스",
      hint: opts.cross
        ? box
          ? `→ ${receiverNameFor(state, data, side, "cross")} 헤더 · GK와 경합 (${boxFail})`
          : `→ ${receiverNameFor(state, data, side, "cross")} 헤더 · ${weak("cross", "vs 버티기에 약함")}`
        : box ? (crosserOk ? boxOff : "크로서 특성 선수만") : line < 2 ? "파이널 서드에서만" : crosserOk ? "받을 동료 없음" : "크로서 특성 선수만",
    },
    {
      action: "shoot", enabled: opts.shoot, label: shootLabel,
      hint: opts.shoot ? shootHint : "상대 진영까지 전진 필요",
    },
  ];
}

/** side(수비 팀)의 현재 라인에서 가능한 수비 액션. line 3(GK)은 전부 비활성(세이브 자동). data 를 주면 힌트 배율을 config 에서 계산 */
export function getDefenseActions(state, side, data = null, fx = null) {
  const line = state.ball ? state.ball.lineIndex : 0;
  const isDef = state.attackingSide !== side && !!state.duel && !state.finished;
  const base = isDef && line < 3;
  const fxD = fx || fxOf(state, side);
  const pair = pairHint(data, fxD);
  const m = data && data.config && data.config.match;
  // 버티기 짝: 크로스 ×holdVsCross · 중거리 슛 ×holdVsMidrange (간파 readMult 면 그 이상)
  const rm = num(fxD.readMult, 0);
  const holdPair = (base) => fmtMult(rm > 0 ? Math.max(rm, base) : base);
  const hvc = m ? holdPair(num(m.holdVsCross, num(m.readBonus, 1.5))) : "1.7";
  const hvm = m ? holdPair(num(m.holdVsMidrange, 1.5)) : "1.5";
  const off = line >= 3 ? "GK 세이브 자동" : "불가";
  return [
    { action: "tackle", enabled: base, label: "태클", hint: base ? `(수비+피지컬)/2 · 드리블 ${pair}` : off },
    { action: "intercept", enabled: base, label: "인터셉트", hint: base ? `(수비+패스)/2 · 패스 ${pair} · 빠른 역습` : off },
    { action: "hold", enabled: base, label: "버티기", hint: base ? `수비 · 크로스 ×${hvc} · 중거리 슛 ×${hvm} · 역습 이점 없음(한 구역 물러나 시작)` : off },
  ];
}

/* ------------------------------------------------------------------ */
/* 판정 공식 (§13.2-3~5)                                                  */
/* ------------------------------------------------------------------ */

/**
 * 공격 보너스 합 Σ (§13.2-5): 연계 특성(증폭) + 연계 스택(슛) + 제쳐짐 + 인터셉트 뚫림 + 스킬 nextDuelBonus(+소매치기 상한 보너스).
 * @returns {{ total: number, capped: number, parts: Object<string, number>, links: string[] }}
 */
function attackBonus(state, data, side, carrier, action, { midrange, header, boxShoot }) {
  const m = matchCfg(data);
  const team = state[side];
  const ball = state.ball || {};
  const pend = ball.pending || emptyPending();
  const amp = teamworkAmp(team, data);
  const parts = {};
  const links = [];
  const add = (k, v) => {
    if (v) parts[k] = round6((parts[k] || 0) + v);
  };
  if (ball.receivedFresh && ball.lastPasserId && !midrange) {
    const passer = findPlayer(team, ball.lastPasserId);
    const t = getTrait(data, passer);
    const v = t && t.params ? num(t.params.nextDuelBonus, 0) : 0;
    if (v) {
      add("killpass", v * ampOf(t, amp));
      links.push("killpass");
    }
  }
  const t = getTrait(data, carrier);
  const tpar = (t && t.params) || {};
  const k = ampOf(t, amp);
  if (action === "dribble" && ball.receivedFresh && tpar.receivedDribbleBonus) {
    add("runner", num(tpar.receivedDribbleBonus) * k);
    links.push("runner");
  }
  // 볼 운반: 빌드업·중원(line ≤ buildupMaxLine) 드리블. line 0 공 소유자는 규칙상 항상 DF 라 MF 보유자(미르카·키라)는 line 1 에서 받는다
  if (action === "dribble" && num(ball.lineIndex, 0) <= num(tpar.buildupMaxLine, 1) && tpar.buildupDribbleBonus) add("carrier", num(tpar.buildupDribbleBonus) * k);
  if (action === "cross" && tpar.crossBonus) add("crosser", num(tpar.crossBonus));
  if (action === "shoot" && ball.receivedFresh && boxShoot && tpar.receivedShotBonus) add("finisher", num(tpar.receivedShotBonus) * k);
  if (header && tpar.headerBonus) add("targetman", num(tpar.headerBonus) * k);
  if (action === "shoot") add("chain", num(m.passChainBonus, 0.1) * num(ball.chain, 0));
  if (pend.beaten) add("beaten", num(m.beatenBonus, 0.25));
  if (pend.interceptFail) add("interceptFail", num(m.interceptFailBonus, 0.1));
  if (pend.nextBonus) add("next", num(pend.nextBonus, 0));
  let total = 0;
  for (const v of Object.values(parts)) total += v;
  total = round6(total);
  const capped = Math.min(total, num(m.bonusCap, 0.6));
  return { total, capped, parts, links };
}

/**
 * 현재 듀얼의 공격력/수비력/성공률 (§13.2-3~5).
 * @param {{ action: string, defAction?: string|null, useEffects?: boolean, fxA?: object, fxD?: object, explain?: boolean }} opts
 *   defAction null = 수비 선택 미지(짝·빗나감 없음, 계수 1). fxA/fxD = 효과 객체를 통째로 대신 쓴다(미리보기).
 *   explain = 결정타 칩용 factors (실제로 곱한 배율 목록 — Π(atk) = att, Π(def) = def) 를 함께 돌려준다. 확률은 같다.
 */
export function computeOdds(state, data, { action, defAction = null, useEffects = true, fxA: fxAOpt = null, fxD: fxDOpt = null, explain = false } = {}) {
  const m = matchCfg(data);
  const uc = ultCfg(m);
  const atkSide = state.attackingSide;
  const defSide = otherSide(atkSide);
  const atkTeam = state[atkSide];
  const defTeam = state[defSide];
  const duel = state.duel || {};
  const ball = state.ball || {};
  const carrier = findPlayer(atkTeam, ball.carrierId);
  const defender = findPlayer(defTeam, duel.defenderId);
  if (!carrier || !defender) throw new Error("match.computeOdds: 듀얼 당사자가 없습니다");
  if (!ACTIONS_ATTACK.includes(action)) throw new Error(`match.computeOdds: 공격 액션 잘못됨: ${action}`);
  const line = num(ball.lineIndex, 0);
  const isGK = line >= 3;
  const dAction = isGK ? "save" : defAction;
  // ④ 박스 연결(컷백·센터링): GK 가 튀어나와 끊는 듀얼 — GK 세이브 값 × boxLink.gkMult, 짝 없음, 원터치 배율 없음
  const boxLink = isBoxLinkAction(action, line);
  const fxA = fxAOpt || (useEffects ? fxOf(state, atkSide) : emptyDuelEffects());
  const fxD = fxDOpt || (useEffects ? fxOf(state, defSide) : emptyDuelEffects());
  const staminaMax = num(m.staminaMax, 100);
  const base = {
    data,
    lineIndex: line,
    chain: num(ball.chain),
    possessionsLeft: possessionsLeft(state),
    isGoalMatch: state.kind === "goal",
    staminaMax,
  };
  const stA = liveStamina(atkTeam, carrier.id);
  const stD = liveStamina(defTeam, defender.id);
  const ctxA = { ...base, action, phase: "attack", scoreDiff: scoreDiffFor(state, atkSide), opponentStyle: defender.style, stamina: stA };
  const ctxD = { ...base, action: dAction || "defense", phase: "defense", scoreDiff: scoreDiffFor(state, defSide), opponentStyle: carrier.style, stamina: stD };
  const modsA = collectMods(atkTeam, carrier.id, ctxA);
  const modsD = collectMods(defTeam, defender.id, ctxD);
  const pfx = state.possessionFx || {};

  // --- 공격력 ---
  const ultA = fxA.ult || null;
  const ultShot = !!(ultA && ultA.type === "shot" && action === "shoot");
  const ultPass = !!(ultA && ultA.type === "pass" && ultMatchesAction(ultA, action));
  const ultDribble = !!(ultA && ultA.type === "dribble" && action === "dribble");
  const ultTeamA = !!(ultA && ultA.type === "team");
  const header = action === "shoot" && isGK && ball.receivedVia === "cross";
  const boxShotUlt = ultShot && !!ultA.boxShot;
  const midrange = action === "shoot" && line === 2 && !boxShotUlt;
  const statA = attackStatBase(carrier, action, header);
  const coefA = attackCoef(m, action, { midrange, header, midrangeCoef: action === "shoot" ? fxA.midrangeCoef : null });
  const styleA = styleMult(carrier.style, defender.style, m);
  const condA = num(atkTeam.conditionMult, 1) || 1;
  const stamA = staminaMultFor(m, stA);
  let skillA = modsA.attack * (boostApplies(fxA, action) ? num(fxA.attackMult, 1) : 1);
  if (action === "shoot") skillA *= modsA.shootPower * num(fxA.shootMult, 1) * (ball.extraLine ? 1.2 : 1);
  // 필살 배율 (§19.3-5): 슛 ×shoot (헤더면 ×headerMult 더) · 패스 ×attack (actions 안) · 드리블 ×attack (E4) · 팀 ×teamMult (E3, 이번 듀얼)
  const ultMultA = ultShot
    ? num(ultA.shoot, 1) * (header ? num(ultA.headerMult, 1) : 1)
    : ultPass || ultDribble ? num(ultA.attack, 1) : ultTeamA ? num(ultA.teamMult, 1) : 1;
  const ultOnA = ultShot || ultPass || ultDribble || ultTeamA;
  const comboA = fxA.combo && ultOnA ? uc.comboBonus : 1;
  const bonus = attackBonus(state, data, atkSide, carrier, action, { midrange, header, boxShoot: isGK || boxShotUlt });
  const twTerm = action === "pass" || action === "cross" ? 1 + num(m.teamworkPassBonusPer100, 0.1) * num(atkTeam.teamwork) / 100 : 1;
  const modBonusA = 1 + (action === "shoot" ? bonusOf(atkTeam, "shootPower") : action === "pass" || action === "cross" ? bonusOf(atkTeam, "passAttack") : 0);
  const teamA = num(pfx[atkSide] && pfx[atkSide].teamMult, 1) || 1;
  // E3: 이번 포제션 팀 필살기 배율 (판정 뒤 possessionFx[side].ultMult — 함성 teamMult 와 곱으로 쌓인다)
  const teamUltA = num(pfx[atkSide] && pfx[atkSide].ultMult, 1) || 1;
  const att = statA * coefA * styleA * condA * stamA * skillA * (1 + bonus.capped) * ultMultA * comboA * twTerm * teamA * teamUltA * Math.max(0, modBonusA);

  // --- 수비력 ---
  const styleD = styleMult(defender.style, carrier.style, m);
  const condD = num(defTeam.conditionMult, 1) || 1;
  const stamD = staminaMultFor(m, stD);
  const skillD = modsD.defense * num(fxD.defenseMult, 1);
  const teamD = num(pfx[defSide] && pfx[defSide].teamMult, 1) || 1;
  const teamUltD = num(pfx[defSide] && pfx[defSide].ultMult, 1) || 1;
  // 수비 필살 배율: 필살 수비 ×defense (E2, 필드 수비) · 팀 필살기 ×teamMult (E3, 이번 듀얼). 필살 세이브는 gkTerm
  const ultD = fxD.ult || null;
  const ultMultD = ultD && ultD.type === "defense" && !isGK ? num(ultD.defense, 1) : ultD && ultD.type === "team" ? num(ultD.teamMult, 1) : 1;
  const negate = negateApplies(fxA, action);
  let statD;
  let coefD;
  let pairMult = 1;
  let pair = "none"; // "read" | "miss" | "hold" | "none"
  let coverTerm = 1;
  let gkTerm = 1;
  if (isGK) {
    statD = stat(defender, "defense");
    coefD = num(m.actionCoef.save, 1) * modsD.save;
    if (boxLink) gkTerm *= boxLinkCfg(m).gkMult;
    else if (ball.oneTouch) gkTerm *= num(m.oneTouchGk, 0.85);
    if (fxD.ult && fxD.ult.type === "save") gkTerm *= num(fxD.ult.saveMult, 1);
  } else {
    statD = defenseStat(data, m, defender, dAction);
    coefD = dAction ? defenseCoef(m, dAction) : 1;
    coverTerm = 1 + num(m.coverBonusPerExtraDefender, 0.1) * num(duel.coverCount) * modsD.coverBonus;
    const readMult = num(fxD.readMult, 0);
    if (dAction === "hold") {
      // 버티기: 드리블·패스엔 짝 없음(×1.0). 크로스(공중볼) 상대면 ×holdVsCross, 중거리 슛 상대면 ×holdVsMidrange
      // (= 짝: 간파 ×readMult · 상대 negateRead 면 ×1.0)
      if (action === "shoot" && midrange) {
        pair = "read";
        const base = num(m.holdVsMidrange, 1.5);
        pairMult = negate ? 1 : readMult > 0 ? Math.max(readMult, base) : base;
      } else if (action === "cross") {
        pair = "read";
        const base = num(m.holdVsCross, num(m.readBonus, 1.5));
        pairMult = negate ? 1 : readMult > 0 ? Math.max(readMult, base) : base;
      } else {
        pair = "hold";
        pairMult = 1;
      }
    } else if (dAction && COUNTER[action] === dAction) {
      pair = "read";
      pairMult = negate ? 1 : readMult > 0 ? readMult : num(m.readBonus, 1.5);
    } else if (dAction === "tackle" || dAction === "intercept") {
      pair = "miss";
      pairMult = fxD.noMissPenalty || (ultD && ultD.type === "defense" && ultD.noMissPenalty) ? 1 : num(m.missMult, 0.8);
    }
  }
  if (ultShot) gkTerm *= num(ultA.gkMult, 1); // 필살 슛: 막는 쪽(GK·파이널 서드 수비) ×gkMult
  const bonusD = Math.max(0, 1 + bonusOf(defTeam, "defense"));
  const def = statD * coefD * styleD * condD * stamD * skillD * coverTerm * pairMult * gkTerm * teamD * teamUltD * ultMultD * bonusD;

  const raw = att + def > 0 ? att / (att + def) : 0.5;
  const p = clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
  const links = bonus.links.slice();
  if (isGK && ball.oneTouch && !boxLink) links.push("oneTouch");
  if (header) links.push("header");
  if (fxA.combo && ultOnA) links.push("combo");

  // --- 결정타 칩 (표시 전용): 위 att / def 의 곱셈 항을 그대로 쪼갠 목록 ---
  let factors = null;
  if (explain) {
    factors = [];
    const F = (side, id, mult, label, text, extra) => pushFactor(factors, side, id, mult, label, text, extra);
    const boostA = boostApplies(fxA, action) ? num(fxA.attackMult, 1) : 1;
    const isShoot = action === "shoot";
    // 파워 슛의 중거리 계수 덮어쓰기는 스킬 몫으로 (기본 = 설정 계수)
    const coefBaseA = isShoot && midrange && fxA.midrangeCoef != null ? attackCoef(m, action, { midrange, header }) : coefA;
    const coefSkillA = coefBaseA ? coefA / coefBaseA : 1;
    F("atk", "base", statA * coefBaseA, "공격 기본", `${ACTION_LABEL[action] || action} ${Math.round(statA * coefBaseA)}`, { base: true, stat: statA, coef: coefBaseA });
    F("atk", "style", styleA, styleA > 1 ? "상성 우위" : "상성 불리", null, { group: "style" });
    F("atk", "condition", condA, "컨디션", null, { group: "condition" });
    F("atk", "stamina", stamA, "체력 저하", null, { group: "stamina" });
    const srcA = collectModSources(atkTeam, carrier.id, ctxA).filter((s) => "attack" in s.mods || (isShoot && "shootPower" in s.mods));
    F("atk", "passive", modsA.attack * (isShoot ? modsA.shootPower : 1), srcA.map((s) => s.name).join("·") || "패시브");
    F("atk", "skill", boostA * (isShoot ? num(fxA.shootMult, 1) : 1) * coefSkillA, skillName(data, fxA.usedSkillId));
    F("atk", "extraLine", isShoot && ball.extraLine ? 1.2 : 1, "추가 전진 슛");
    if (bonus.capped) {
      const scale = bonus.total > 0 && bonus.capped < bonus.total ? bonus.capped / bonus.total : 1;
      const parts = Object.entries(bonus.parts).map(([id, add]) => ({ id, label: bonusLabel(data, state, id), add, eff: add * scale }));
      F("atk", "bonus", 1 + bonus.capped, "보너스", `보너스 +${pct(bonus.capped)}%`, { parts, capped: bonus.capped < bonus.total });
    }
    F("atk", "ultimate", ultMultA, skillName(data, ultA && ultA.skillId, "필살기"), `필살 ×${fmtMult(ultMultA)}`);
    F("atk", "combo", comboA, (fxA.combo && fxA.combo.name) || "합체기", `합체기 ×${fmtMult(comboA)}`);
    F("atk", "teamwork", twTerm, "팀워크");
    F("atk", "team", teamA, rallyName(data), null, { group: "team" });
    F("atk", "teamUlt", teamUltA, skillName(data, pfx[atkSide] && pfx[atkSide].teamUlt, "팀 필살기"), null, { group: "team" });
    F("atk", "resonance", Math.max(0, modBonusA), "공명·유물", null, { group: "resonance" });
    // 수비: 기본 (버티기 = 수비 × holdMult, 철벽은 따로 · GK = 수비 × save 계수, 패시브 save 는 따로)
    const wall = !isGK && dAction === "hold" ? traitParam(data, defender, "holdMult") : 0;
    const wallMult = wall > 0 ? wall : 1;
    const baseD = isGK ? statD * num(m.actionCoef.save, 1) : (statD / wallMult) * coefD;
    F("def", "base", baseD, "수비 기본", `${ACTION_LABEL[dAction] || "수비"} ${Math.round(baseD)}`, { base: true, stat: isGK ? statD : statD / wallMult, coef: isGK ? num(m.actionCoef.save, 1) : coefD });
    F("def", "wall", wallMult, traitName(data, "wall"));
    F("def", "style", styleD, styleD > 1 ? "상성 우위" : "상성 불리", null, { group: "style" });
    F("def", "condition", condD, "컨디션", null, { group: "condition" });
    F("def", "stamina", stamD, "체력 저하", null, { group: "stamina" });
    const srcD = collectModSources(defTeam, defender.id, ctxD).filter((s) => "defense" in s.mods || (isGK && "save" in s.mods));
    F("def", "passive", modsD.defense * (isGK ? modsD.save : 1), srcD.map((s) => s.name).join("·") || "패시브");
    F("def", "skill", num(fxD.defenseMult, 1), skillName(data, fxD.usedSkillId));
    F("def", "cover", coverTerm, "커버 수비", `커버 +${pct(coverTerm - 1)}%`);
    if (pair === "read") F("def", "pair", pairMult, num(fxD.readMult, 0) > 0 ? "간파 짝 적중" : "짝 적중");
    else if (pair === "miss") F("def", "pair", pairMult, "짝 빗나감");
    if (isGK) {
      // 박스 연결 GK 배율 = 규칙 상수 (모든 연결에 같다 — 결정타 후보가 아니다, rule: true)
      if (boxLink) F("def", "boxLinkGk", boxLinkCfg(m).gkMult, "연결 경합", `연결 GK ×${fmtMult(boxLinkCfg(m).gkMult)}`, { rule: true });
      else if (ball.oneTouch) F("def", "oneTouch", num(m.oneTouchGk, 0.85), "원터치", `원터치 GK ×${fmtMult(num(m.oneTouchGk, 0.85))}`);
      if (fxD.ult && fxD.ult.type === "save") F("def", "saveUlt", num(fxD.ult.saveMult, 1), skillName(data, fxD.ult.skillId, "필살 세이브"), `필살 세이브 ×${fmtMult(num(fxD.ult.saveMult, 1))}`);
    }
    if (ultShot) F("def", "ultShotGk", num(ultA.gkMult, 1), skillName(data, ultA.skillId, "필살 슛"), `필살 슛 ${isGK ? "GK" : "수비"} ×${fmtMult(num(ultA.gkMult, 1))}`);
    F("def", "ultimate", ultMultD, skillName(data, ultD && ultD.skillId, "필살기"), `필살 ×${fmtMult(ultMultD)}`);
    F("def", "team", teamD, rallyName(data), null, { group: "team" });
    F("def", "teamUlt", teamUltD, skillName(data, pfx[defSide] && pfx[defSide].teamUlt, "팀 필살기"), null, { group: "team" });
    F("def", "resonance", bonusD, "공명·유물", null, { group: "resonance" });
  }
  return {
    att, def, p, read: pair === "read" && pairMult > 1, pair, pairMult, negate, bonus, links, header, midrange,
    modsA, modsD, carrier, defender, atkSide, defSide, action, defAction: dAction, isGK, line, boxLink, factors,
  };
}

/* ------------------------------------------------------------------ */
/* 결정타 칩 (클래시 바 1단계, 2026-09-29) — 표시 전용                      */
/* ------------------------------------------------------------------ */

/**
 * 판정 배율 한 항목. base 가 아니면 ×1 은 뺀다. text 가 없으면 "라벨 ×배율".
 * factor = { id, side: "atk"|"def", mult, label, text, base?, group?, parts?, … } — Π(side 의 mult) = 그쪽 판정값
 */
function pushFactor(list, side, id, mult, label, text = null, extra = null) {
  if (!Number.isFinite(mult)) return;
  const isBase = !!(extra && extra.base);
  if (!isBase && Math.abs(mult - 1) < 1e-12) return;
  list.push(Object.assign({ id, side, mult, label, text: text || `${label} ×${fmtMult(mult)}` }, extra || {}));
}

/** 보너스 합(attackBonus parts) 항목 이름 — 연계 특성은 데이터 이름 */
function bonusLabel(data, state, id) {
  if (id === "chain") return `연계 ${num(state.ball && state.ball.chain, 0)}`;
  if (id === "beaten") return "제쳐짐";
  if (id === "interceptFail") return "인터셉트 뚫림";
  if (id === "next") return "첫 듀얼 보너스";
  return traitName(data, id);
}

/** 함성(rally) 스킬 이름 — 이번 포제션 팀 판정 배율의 출처 */
function rallyName(data) {
  const sk = data && Array.isArray(data.skills) ? data.skills.find((s) => s && s.active && s.active.effect === "rally") : null;
  return sk ? sk.name : "팀 판정";
}

const FACTOR_GROUP_TEXT = { style: "상성 우위", condition: "컨디션 우위", stamina: "체력 저하", team: "팀 판정", resonance: "공명·유물" };

/**
 * 판정 한 번의 결정타 칩 (표시 전용 — 확률 · 난수 불변). winner = 성공이면 공격("atk"), 아니면 수비("def").
 *  후보 (2026-09-30 보완) = base(기본 공격 · 수비)와 rule(규칙 상수 — 박스 연결 GK ×0.6)을 뺀 배율. 보너스 합은 항목별
 *   (그 항목을 빼면 보너스 = 1 + min(합 − 항목, 상한) — 더하기라 항목끼리 곱하지 않는다),
 *   상성 · 컨디션 · 체력 · 팀 판정 · 공명은 양쪽을 합쳐 한 요인.
 *  크기(effect) = 그 요인을 뺐을 때 승자 확률이 떨어지는 폭 (clamp 포함 — 상한 · 하한에 막혀 영향이 없던 요인은 0).
 *  "능력치 우위"도 후보 하나 = 두 기본 항의 순수 능력치 비 (f.stat — 행동 계수 2.2 / 1.0 은 빼고). 크기 = 두 능력치를 같게 했을 때
 *   승자 확률 하락폭 — 다른 요인과 같은 잣대로 겨룬다 (2026-09-30 재수정: 예전엔 모든 요인이 2%p 미만일 때만 후보였다).
 *  decisive = 크기가 가장 큰 후보 (동률은 목록 앞 — 능력치 우위는 맨 끝이라 동률이면 요인). 가장 큰 크기도
 *   config.match.decisiveMinDelta (0.02 = 2%p) 미만이면 null (팀워크 ×1.02 같은 작은 요인은 칩이 아니다).
 *  upset = 승자의 확률 < config.match.upsetP (0.25, 2026-10-01 사용자 결정).
 * @returns {{ factors: object[], decisive: object|null, upset: boolean, winnerP: number }}
 */
function chipOf(factors, p, success, m) {
  const winner = success ? "atk" : "def";
  const winnerP = success ? p : 1 - p;
  const list = factors || [];
  const lo = num(m.minP, 0.1);
  const hi = num(m.maxP, 0.9);
  const winAt = (a, d) => {
    const raw = a + d > 0 ? a / (a + d) : 0.5;
    const q = clamp(Number.isFinite(raw) ? raw : 0.5, lo, hi);
    return success ? q : 1 - q;
  };
  let A = 1;
  let D = 1;
  let statA = 0;
  let statD = 0;
  for (const f of list) {
    if (f.side === "atk") A *= f.mult;
    else D *= f.mult;
    if (f.base) {
      if (f.side === "atk") statA = num(f.stat, 0);
      else statD = num(f.stat, 0);
    }
  }
  // 후보: 빼면 공격 A / divA, 수비 D / divD
  const cands = [];
  const groups = new Map();
  for (const f of list) {
    if (f.base || f.rule || !(f.mult > 0)) continue;
    if (f.id === "bonus" && Array.isArray(f.parts)) {
      const total = f.parts.reduce((s, x) => s + num(x.add, 0), 0);
      for (const part of f.parts) {
        if (!(num(part.add, 0) > 0)) continue;
        const without = 1 + Math.min(Math.max(0, total - part.add), f.mult - 1);
        cands.push({ id: part.id, side: "atk", label: part.label, text: `${part.label} +${pct(part.eff)}%`, mult: 1 + part.eff, divA: f.mult / without, divD: 1 });
      }
      continue;
    }
    if (f.group) {
      let g = groups.get(f.group);
      if (!g) {
        g = { id: f.group, side: null, group: true, divA: 1, divD: 1 };
        groups.set(f.group, g);
        cands.push(g);
      }
      if (f.side === "atk") g.divA *= f.mult;
      else g.divD *= f.mult;
      continue;
    }
    cands.push({ id: f.id, side: f.side, label: f.label, text: f.text, mult: f.mult, divA: f.side === "atk" ? f.mult : 1, divD: f.side === "atk" ? 1 : f.mult });
  }
  // 능력치 우위 = 순수 능력치 비를 없앴을 때 (두 기본 항의 능력치를 같게) — 다른 요인과 같은 잣대로 겨룬다 (2026-09-30 재수정:
  //  예전엔 모든 요인이 2%p 미만일 때만 후보라 "철벽 ×1.15"(3.5%p)가 2.2배 능력치 차(19%p)를 제치고 칩이 됐다).
  //  목록 맨 끝 → 동률이면 요인 쪽이 이긴다.
  if (statA > 0 && statD > 0 && Math.abs(statA - statD) > 1e-9) cands.push({ id: "stat", stat: true, divA: statA / statD, divD: 1 });
  const w0 = winAt(A, D);
  const minDelta = num(m.decisiveMinDelta, 0.02) - 1e-12;
  const deltaOf = (c) => w0 - winAt(A / c.divA, D / c.divD);
  let best = null;
  let bd = 0;
  for (const c of cands) {
    const delta = deltaOf(c);
    if (delta > bd + 1e-12) {
      bd = delta;
      best = c;
    }
  }
  let decisive = null;
  if (best && bd >= minDelta) {
    const effect = round6(bd);
    if (best.stat) {
      const r = success ? statA / statD : statD / statA;
      decisive = { id: "stat", side: winner, favours: winner, label: "능력치 우위", text: `능력치 우위 ×${fmtMult(r)}`, mult: round6(r), effect, base: true };
    } else if (best.group) {
      // 양쪽 합산 요인 (상성 · 컨디션 · 체력 저하 · 팀 판정 · 공명): 승자 쪽으로 기운 배율. 체력 저하는 진 쪽 배율 (< 1)
      const label = FACTOR_GROUP_TEXT[best.id] || best.id;
      const tilt = success ? best.divA / best.divD : best.divD / best.divA;
      const shown = best.id === "stamina" ? 1 / tilt : tilt;
      decisive = { id: best.id, side: null, favours: winner, label, text: `${label} ×${fmtMult(shown)}`, mult: round6(shown), effect };
    } else {
      decisive = { id: best.id, side: best.side, favours: winner, label: best.label, text: best.text, mult: round6(best.mult), effect };
    }
  }
  return { factors: list, decisive, upset: winnerP < num(m.upsetP, 0.25), winnerP };
}

/* ------------------------------------------------------------------ */
/* 결과 규칙 (순수 함수 — 판정과 미리보기가 공유)                          */
/* ------------------------------------------------------------------ */

/**
 * 역습 시작 (§13.2-7): 기본(line 0 → 2, 1 → 1, 2 → 0, GK 세이브 → 0) + intercept +1 + steal +plus, 상한 counterCap.
 * intercept 의 +1 이 상한에 걸리면 capTension, steal 이 상한에 걸리면 cappedNextBonus.
 * hold → 공을 뺏은 자리에서 holdStartBack(기본 1) 구역 물러나 시작 (line 0 → 1, 1 → 0, 2 → 0), 빠른 역습 아님, steal 무시 (GDD #54).
 * GK 가 잡으면(세이브 · 박스 연결 차단) start 0 + distribution: 곧바로 역습하지 않고 GK 배급 (2026-09-29 — 옛 saveCounterLine 폐지).
 */
function counterPlan(data, line, defAction, fxD, defender, isGK) {
  const m = matchCfg(data);
  const cap = Math.round(num(m.counterCap, 2));
  const out = { start: 0, capTension: 0, stealTension: 0, cappedNextBonus: 0, fast: false, distribution: false };
  if (isGK) {
    out.distribution = true;
    return out;
  }
  let s = Math.min(cap, line === 0 ? 2 : line === 1 ? 1 : 0);
  if (defAction === "hold") {
    out.start = clamp(s - Math.max(0, Math.round(num(m.holdStartBack, 1))), 0, cap);
    return out;
  }
  if (defAction === "intercept") {
    if (s + 1 > cap) out.capTension = num(m.counterCapTension, 10);
    else {
      s += 1;
      out.fast = true;
    }
  }
  if (fxD && fxD.steal) {
    out.stealTension = num(fxD.steal.tension, 0);
    const plus = Math.max(1, Math.round(num(fxD.steal.plus, 1)));
    if (s + plus > cap) {
      out.cappedNextBonus = num(fxD.steal.cappedNextBonus, 0);
      s = cap;
    } else {
      s += plus;
    }
  }
  out.start = s;
  return out;
}

/**
 * 공격 성공 뒤 공 (§13.2-10·11): 새 line, 받는 선수(receiverId 없으면 기본), 원터치, extraLine 슛 보너스.
 * @returns {{ newLine, receiver, oneTouch, extraLineShot, via }}
 */
function successTransition(state, data, side, carrier, action, fx, receiverId = null) {
  const team = state[side];
  const line = num(state.ball.lineIndex, 0);
  const extra = !!(fx && fx.extraLine) && line < 3; // 박스 연결(④)에는 추가 전진 없음
  let newLine;
  let receiver = carrier;
  if (action === "dribble") {
    newLine = advanceLine(line, extra);
  } else {
    const plan = planFor(team, carrier, action, line, fx);
    newLine = plan.arrival;
    receiver = (receiverId && plan.candidates.find((p) => p.id === receiverId)) || defaultFromPlan(state, data, side, action, plan, fx) || carrier;
  }
  return {
    newLine,
    receiver,
    oneTouch: newLine >= 3 && (action !== "dribble" || extra),
    extraLineShot: extra && line + 1 >= 3,
    via: action === "pass" || action === "cross" ? action : null,
  };
}

/** 공격 성공 뒤 다음 듀얼에 붙는 보너스 (§13.2-6) */
function pendingAfterSuccess(action, defAction, fxA, fxD) {
  const pend = emptyPending();
  if (!fxD.noFailPenalty) {
    if (defAction === "tackle") pend.beaten = true;
    else if (defAction === "intercept") pend.interceptFail = true;
  }
  if (action === "pass" || action === "cross") {
    if (num(fxA.nextDuelBonus, 0) > 0 && (!fxA.negateActions || fxA.negateActions.includes(action))) pend.nextBonus += num(fxA.nextDuelBonus, 0);
    if (fxA.ult && fxA.ult.type === "pass" && ultMatchesAction(fxA.ult, action)) pend.nextBonus += num(fxA.ult.nextDuelBonus, 0);
  }
  pend.nextBonus = round6(pend.nextBonus);
  return pend;
}

/* ------------------------------------------------------------------ */
/* 간파한 AI 의 대응 (§13.2-8)                                             */
/* ------------------------------------------------------------------ */

/** 공격 action 에 대해 막을 확률이 가장 높은 수비 (hold 포함). 동률은 tieDefense 순서 */
export function bestDefenseResponse(state, data, action, { fxA = null, fxD = null } = {}) {
  const m = matchCfg(data);
  const tc = tendCfg(m);
  const defSide = otherSide(state.attackingSide);
  const enabled = getDefenseActions(state, defSide).filter((a) => a.enabled).map((a) => a.action);
  let best = null;
  let bp = Infinity;
  for (const d of tc.tieD.filter((x) => enabled.includes(x)).concat(enabled.filter((x) => !tc.tieD.includes(x)))) {
    const p = computeOdds(state, data, { action, defAction: d, fxA, fxD }).p;
    if (p < bp - 1e-12) {
      bp = p;
      best = d;
    }
  }
  return best;
}

/** 수비 defAction 에 대해 성공 확률이 가장 높은 공격 (필살기를 커밋했으면 그 종류와 맞는 액션만). 동률은 tieAttack 순서 */
export function bestAttackResponse(state, data, defAction, { fxA = null, fxD = null } = {}) {
  const m = matchCfg(data);
  const tc = tendCfg(m);
  const atkSide = state.attackingSide;
  const fx = fxA || fxOf(state, atkSide);
  let enabled = getAttackActions(state, atkSide, data).filter((a) => a.enabled).map((a) => a.action);
  if (fx.ult) {
    // 필살기와 맞는 액션만 (슛 · 패스 actions · 드리블, 팀 필살기 = 전부)
    const ok = enabled.filter((a) => ultMatchesAction(fx.ult, a));
    if (ok.length) enabled = ok;
  }
  let best = null;
  let bp = -Infinity;
  for (const a of tc.tieA.filter((x) => enabled.includes(x)).concat(enabled.filter((x) => !tc.tieA.includes(x)))) {
    const p = computeOdds(state, data, { action: a, defAction, fxA: fx, fxD }).p;
    if (p > bp + 1e-12) {
      bp = p;
      best = a;
    }
  }
  const receiverId = best === "pass" || best === "cross" ? defaultReceiverId(state, data, atkSide, best, fx) : null;
  return { action: best, receiverId };
}

/* ------------------------------------------------------------------ */
/* 체력 / 텐션                                                            */
/* ------------------------------------------------------------------ */

function spendStamina(state, m, side, player, base, mods) {
  const team = state[side];
  const lv = team.live && team.live[player.id];
  if (!lv) return 0;
  const physFactor = clamp(1 - stat(player, "physical") / 2000, 0.25, 1);
  const bonus = Math.max(0, 1 + bonusOf(team, "staminaCost"));
  const cost = Math.max(0, num(base) * physFactor * bonus * (mods ? num(mods.staminaCost, 1) : 1));
  lv.stamina = round1(clamp(lv.stamina - cost, 0, num(m.staminaMax, 100)));
  return cost;
}

function addTension(state, m, side, base, mods) {
  const team = state[side];
  const mult = Math.max(0, 1 + bonusOf(team, "tensionGain")) * (mods ? num(mods.tensionGain, 1) : 1);
  team.tension = round1(clamp(num(team.tension) + num(base) * mult, 0, num(m.tension && m.tension.max, 100)));
}

/* ------------------------------------------------------------------ */
/* 판정 진행                                                             */
/* ------------------------------------------------------------------ */

function linkText(links) {
  return links.length ? " " + links.map((l) => LINK_LABELS[l] || l).join(" ") : "";
}

/**
 * E3 (§19.6): 판정 뒤 팀 필살기 효과 — 쓴 팀(side, fx.ult.type "team")마다 possessionFx[side].ultMult ×= teamMult (남은 포제션 동안
 * 그 팀의 모든 판정 — 이번 듀얼은 커밋한 fx 로 이미 곱했다), teamUlt = skillId (포제션당 1번), 팀 전원 체력 +teamStamina (상한 staminaMax).
 * 상태만 바꾸고 정보 이벤트(type "teamUlt")는 돌려준다 — 판정 이벤트 뒤에 넣는다. 난수 없음.
 */
function applyTeamUltAfter(state, data, pairs) {
  const out = [];
  const max = num(matchCfg(data).staminaMax, 100);
  for (const [side, fx] of pairs) {
    const u = fx && fx.ult;
    if (!u || u.type !== "team") continue;
    if (!state.possessionFx) state.possessionFx = { home: { teamMult: 1 }, away: { teamMult: 1 } };
    const pfx = state.possessionFx[side] || (state.possessionFx[side] = { teamMult: 1 });
    const mult = num(u.teamMult, 1);
    pfx.ultMult = round6(num(pfx.ultMult, 1) * mult);
    pfx.teamUlt = u.skillId;
    const amount = num(u.teamStamina, 0);
    const team = state[side];
    if (amount > 0 && team && team.live) {
      for (const lv of Object.values(team.live)) lv.stamina = round1(clamp(num(lv.stamina, 0) + amount, 0, max));
    }
    out.push({
      type: "teamUlt", side, skillId: u.skillId, teamMult: mult, teamStamina: amount,
      text: `${state[side].name} 팀 판정 ×${fmtMult(mult)} (이번 포제션)${amount > 0 ? ` · 체력 +${fmtMult(amount)}` : ""}`,
    });
  }
  return out;
}

function resolveDuel(state, data) {
  const m = matchCfg(data);
  const uc = ultCfg(m);
  const atkSide = state.attackingSide;
  const defSide = otherSide(atkSide);
  const atkTeam = state[atkSide];
  const duel = state.duel;
  const ball = state.ball;
  const line = ball.lineIndex;
  const isGK = line >= 3;
  const atkChoice = duel[atkSide + "Choice"] || {};
  const defChoice = duel[defSide + "Choice"] || {};
  let action = atkChoice.action;
  let defAction = isGK ? "save" : defChoice.action;
  if (!action) throw new Error("match.resolveDuel: 공격 액션이 결정되지 않았습니다");
  if (!isGK && !defAction) throw new Error("match.resolveDuel: 수비 액션이 결정되지 않았습니다");
  let receiverId = atkChoice.receiverId || null;
  const fxA = fxOf(state, atkSide);
  const fxD = fxOf(state, defSide);

  // 간파한 AI(먼저 커밋한 쪽)는 판정 때 상대의 실제 선택을 보고 교체한다 (난수 없음)
  let readBy = null;
  if (!isGK && duel.gaanpaSide === defSide && defChoice.byAI) {
    const best = bestDefenseResponse(state, data, action);
    if (best) defAction = best;
    readBy = defSide;
  } else if (!isGK && duel.gaanpaSide === atkSide && atkChoice.byAI) {
    const best = bestAttackResponse(state, data, defAction);
    if (best.action) {
      if (best.action !== action) receiverId = best.receiverId;
      action = best.action;
    }
    readBy = atkSide;
  }
  if ((action === "pass" || action === "cross") && !receiverId) receiverId = defaultReceiverId(state, data, atkSide, action, fxA);
  duel[atkSide + "Choice"] = Object.assign({}, atkChoice, { action, receiverId, committedAction: atkChoice.action });
  duel[defSide + "Choice"] = Object.assign({}, defChoice, { action: defAction, committedAction: defChoice.action || defAction });

  const odds = computeOdds(state, data, { action, defAction, explain: true });
  const { carrier, defender, p } = odds;
  const rng = createRngFromState(state.rngState);
  const success = rng.chance(p);
  // 결정타 칩 (표시 전용 — 확률 · 난수 불변)
  const chip = chipOf(odds.factors, p, success, m);

  // 체력 소모
  let baseA = num(m.staminaCost && (m.staminaCost[action] != null ? m.staminaCost[action] : m.staminaCost.pass));
  if (action === "shoot") baseA += num(fxA.extraStamina) + (fxA.ult && fxA.ult.type === "shot" ? num(fxA.ult.stamina) : 0);
  if (action === "dribble") {
    const mult = traitParam(data, carrier, "dribbleStaminaMult");
    if (mult > 0) baseA *= mult;
    if (success && fxA.noStamina && boostApplies(fxA, action)) baseA = 0;
    // E4: 필살 드리블 noStamina — 성공했을 때 드리블 체력 소모 0 (폭발 드리블과 같은 규칙)
    if (success && fxA.ult && fxA.ult.type === "dribble" && fxA.ult.noStamina) baseA = 0;
  }
  spendStamina(state, m, atkSide, carrier, baseA, odds.modsA);
  spendStamina(state, m, defSide, defender, num(m.staminaCost && m.staminaCost.defend), odds.modsD);
  // E3: 팀 필살기 — 판정 뒤에 이번 포제션 배율 · 체력 (이번 듀얼은 커밋한 fx 로 이미 곱했다 — 두 번 곱하지 않는다)
  const teamUltEvents = applyTeamUltAfter(state, data, [[atkSide, fxA], [defSide, fxD]]);
  if (action === "shoot") state.stats[atkSide].shots += 1;

  // 한 번 쓰는 상태 소모 (§13.2-6·11·12)
  ball.pending = emptyPending();
  ball.receivedFresh = false;
  ball.comboReadyId = null;
  ball.comboFrom = null;
  const boxLink = !!odds.boxLink;
  if (boxLink) ball.boxLinkUsed = true; // 박스 연결은 포제션당 1회

  // 필살기를 쓴 선수는 이 듀얼에서 게이지를 얻지 않는다 (쓰면 0)
  const ultUser = { [atkSide]: fxA.ult ? carrier.id : null, [defSide]: fxD.ult ? defender.id : null };
  const gain = (side, pid, amount) => {
    if (ultUser[side] !== pid) addGauge(state, data, side, pid, amount);
  };

  const pc = pct(p);
  const tag = odds.pair === "read" && odds.pairMult > 1 ? " [짝]" : odds.pair === "miss" && odds.pairMult < 1 ? " [빗나감]" : "";
  const readTag = readBy ? " [간파]" : "";
  const aLabel = boxLink
    ? (action === "cross" ? "센터링" : "컷백 패스")
    : action === "shoot" ? (line === 2 && odds.midrange ? "중거리 슛" : odds.header ? "헤더" : "슛") : ACTION_LABEL[action];
  const dLabel = ACTION_LABEL[defAction] || defAction;
  const links = odds.links.map((id) => ({ id, label: LINK_LABELS[id] || id }));
  const common = {
    playerId: carrier.id, defenderId: defender.id, action, defAction, p, pair: odds.pair,
    header: odds.header || undefined, oneTouch: isGK && ball.oneTouch && !boxLink ? true : undefined, links,
    readBy: readBy || undefined, ultimate: fxA.ult ? fxA.ult.skillId : undefined, defUltimate: fxD.ult ? fxD.ult.skillId : undefined,
    // 패스·크로스는 판정 전에 정한 받는 선수 (실패한 턴오버 이벤트에도 — 화면이 끊긴 패스 방향을 그린다)
    receiverId: (action === "pass" || action === "cross") && receiverId ? receiverId : undefined,
    // ④ 박스 연결 (컷백 패스 · 센터링) — 성공 = duel, 실패 = save
    boxLink: boxLink || undefined,
    // 결정타 칩 (2026-09-29): 실제로 곱한 배율 · 승자 쪽 결정 요인 · 대이변 (승자 확률 < upsetP)
    factors: chip.factors, decisive: chip.decisive, upset: chip.upset,
  };
  if (isLastAttackPossession(state)) common.lastAttack = true; // 마지막 공격 보장 포제션의 판정
  state.phase = "resolved";

  if (success) {
    state.stats[atkSide].duelsWon += 1;
    incr(state.stats[atkSide].playerDuelWins, carrier.id);
    addTension(state, m, atkSide, num(m.tension && m.tension.duelWin, 10), odds.modsA);
    gain(atkSide, carrier.id, uc.onDuelWin);

    if (action === "shoot") {
      state.score[atkSide] += 1;
      state.stats[atkSide].goals += 1;
      incr(state.stats[atkSide].playerGoals, carrier.id);
      addTension(state, m, atkSide, num(m.tension && m.tension.goal, 20), odds.modsA);
      gain(atkSide, carrier.id, uc.onGoal);
      pushEvent(state, {
        type: "goal", side: atkSide, success: true, ...common,
        text: `${carrier.name}, ${aLabel}… 골!!! (${pc}%)${readTag}${linkText(odds.links)}  [${state.home.name} ${state.score.home} : ${state.score.away} ${state.away.name}]`,
        ...beatPos(atkSide, line, defSide, kickoffLine(data)),
      });
      for (const e of teamUltEvents) pushEvent(state, e);
      state.rngState = rng.getState();
      endPossession(state, data, defSide, kickoffLine(data), "kickoff");
      return;
    }

    const tr = successTransition(state, data, atkSide, carrier, action, fxA, receiverId);
    const pend = pendingAfterSuccess(action, defAction, fxA, fxD);
    const failTag = pend.beaten ? ` — ${defender.name} 제쳐짐 (다음 듀얼 +${pct(num(m.beatenBonus, 0.25))}%)` : "";
    if (action === "dribble") {
      state.ball.lineIndex = tr.newLine;
      if (tr.extraLineShot) state.ball.extraLine = true;
      state.ball.oneTouch = tr.oneTouch;
      state.ball.receivedVia = null;
      state.ball.lastPasserId = null;
      state.ball.pending = pend;
      if (atkTeam.modifiers && num(atkTeam.modifiers.dribbleStaminaRefund) > 0 && rng.chance(num(atkTeam.modifiers.dribbleStaminaRefund))) {
        const lv = atkTeam.live[carrier.id];
        if (lv) lv.stamina = round1(clamp(lv.stamina + 5, 0, num(m.staminaMax, 100)));
      }
      const extra = fxA.extraLine ? (tr.extraLineShot ? " 슛 위력 +20%!" : " 한 구역 추가 전진!") : "";
      pushEvent(state, {
        type: "duel", side: atkSide, success: true, ...common,
        text: `${carrier.name}, 드리블 돌파 성공! ${defender.name}의 ${dLabel} 제침 (${pc}%)${tag}${readTag}${linkText(odds.links)}${extra}${failTag}`,
        ...beatPos(atkSide, line, atkSide, tr.newLine),
      });
    } else {
      const receiver = tr.receiver;
      state.ball.lineIndex = tr.newLine;
      state.ball.carrierId = receiver.id;
      state.ball.chain = num(state.ball.chain) + 1;
      if (tr.extraLineShot) state.ball.extraLine = true;
      state.ball.oneTouch = tr.oneTouch;
      state.ball.receivedVia = action;
      state.ball.lastPasserId = carrier.id;
      state.ball.receivedFresh = true;
      state.ball.pending = pend;
      const ultPass = !!(fxA.ult && fxA.ult.type === "pass");
      gain(atkSide, receiver.id, ultPass ? receiverGaugeOf(fxA.ult, uc) : uc.onReceive);
      // E1 (§19.4): 받은 선수의 필살기가 combos.json 에 등록된 짝일 때만 합체기 대기
      if (ultPass && comboSkillFor(data, fxA.ult.skillId, receiver)) {
        state.ball.comboReadyId = receiver.id;
        state.ball.comboFrom = { playerId: carrier.id, skillId: fxA.ult.skillId };
      }
      const extra = fxA.extraLine && !boxLink ? (tr.extraLineShot ? " 슛 위력 +20%!" : " 한 구역 추가 전진!") : "";
      const verb = action === "cross" ? "크로스" : "패스";
      pushEvent(state, {
        type: "duel", side: atkSide, success: true, ...common, receiverId: receiver.id, via: action,
        text: boxLink
          ? `${carrier.name} → ${receiver.name}, ${aLabel} 성공! ${defender.name}(GK)를 넘김 (${pc}%)${linkText(odds.links)} 연계 ${state.ball.chain} — ${receiver.name} ${action === "cross" ? "헤더" : "원터치 슛"} 찬스`
          : `${carrier.name} → ${receiver.name}, ${verb} 성공! ${defender.name}의 ${dLabel} 통과 (${pc}%)${tag}${readTag}${linkText(odds.links)} 연계 ${state.ball.chain}${extra}${failTag}`,
        ...beatPos(atkSide, line, atkSide, tr.newLine),
      });
    }
    for (const e of teamUltEvents) pushEvent(state, e);
    state.rngState = rng.getState();
    setupDuel(state, data);
    return;
  }

  // 실패 → 턴오버 (GK 가 잡으면 세이브 → GK 배급)
  state.stats[defSide].duelsWon += 1;
  incr(state.stats[defSide].playerDuelWins, defender.id);
  addTension(state, m, defSide, isGK ? num(m.tension && m.tension.save, 15) : num(m.tension && m.tension.steal, 15), odds.modsD);
  gain(defSide, defender.id, uc.onDuelWin);
  const cp = counterPlan(data, line, defAction, fxD, defender, isGK);
  if (cp.capTension || cp.stealTension) addTension(state, m, defSide, cp.capTension + cp.stealTension, odds.modsD);
  // 마지막 포제션이라 이 턴오버 · 세이브로 경기가 끝나면 역습 문구 없음 (2026-09-30)
  const counterTag = cp.fast && !endsMatch(endForecast(state, data, defSide)) ? " 빠른 역습!" : "";
  // 역방향 컷인 (표시 전용): 필살기가 막혔다 — GK 세이브 · 수비 블록 · 필살 패스 차단
  const rc = fxA.ult ? reverseCutinOf(fxA, action, isGK, defSide, defender) : null;
  const ev = pushEvent(state, {
    type: isGK ? "save" : "turnover", side: atkSide, success: false, ...common,
    counterStart: cp.start,
    ...(rc ? { reverseCutin: rc } : {}),
    text: boxLink
      ? `${defender.name}(GK), ${carrier.name}의 ${action === "cross" ? "센터링을" : "컷백 패스를"} 끊어냄! (${pc}%)${linkText(odds.links)}${counterTag}`
      : isGK
        ? `${defender.name}, 세이브! ${carrier.name}의 ${aLabel} 막아냄 (${pc}%)${linkText(odds.links)}${counterTag}`
        : `${defender.name}, ${dLabel}!${tag}${readTag} ${carrier.name}의 ${aLabel} 차단 (${pc}%)${counterTag}`,
    ...beatPos(atkSide, line, defSide, cp.start),
  });
  for (const e of teamUltEvents) pushEvent(state, e);
  state.rngState = rng.getState();
  if (cp.distribution) {
    // 필살 세이브 sureDistribution (§19.3-10): 막은 GK 의 이번 배급 롱패스는 판정 없이 성공
    const sure = fxD.ult && fxD.ult.type === "save" && fxD.ult.sureDistribution ? { skillId: fxD.ult.skillId } : null;
    endPossession(state, data, defSide, 0, "distribution", { gkId: defender.id, from: boxLink ? "boxLink" : "save", saveEvent: ev, sure });
    return;
  }
  endPossession(state, data, defSide, cp.start, "counter", { nextBonus: cp.cappedNextBonus });
}

/**
 * 역방향 컷인 정보 (필살기가 막혔을 때, 표시 전용): 필살 슛 → GK 세이브 "기적의 세이브!" / 필드 수비 블록 "철벽 블록!",
 * 필살 패스(합체기 준비 패스 포함) → 끊김 "필살 패스 차단!" (④ 박스 연결을 GK 가 잡은 것도).
 */
function reverseCutinOf(fxA, action, isGK, defSide, defender) {
  const u = fxA.ult;
  let kind = null;
  if (u.type === "shot" && action === "shoot") kind = isGK ? "save" : "block";
  else if (u.type === "pass" && ultMatchesAction(u, action)) kind = "passCut";
  else if (u.type === "dribble" && action === "dribble") kind = "block"; // E4: 필살 드리블이 필드 수비에 막힘 (팀 · 수비 · 세이브는 없음)
  if (!kind) return null;
  return {
    kind, side: defSide, playerId: defender.id, position: defender.position, text: REVERSE_CUTIN_TEXT[kind],
    skillId: u.skillId, ultimateType: u.type, combo: !!fxA.combo,
  };
}

/**
 * 포제션 종료 → 다음 포제션. 포제션이 다 됐으면 종료 판정 (마지막 공격 보장 포함, checkEnd).
 * reason "distribution" = GK 가 잡은 공 → 배급 대기 (phase "distribution"). 경기가 끝나면 배급 없음.
 */
function endPossession(state, data, nextSide, startLine, reason, carry = {}) {
  state.duel = null;
  state.phase = "possessionEnd";
  state.possession += 1;
  if (state.possession > state.possessionsTotal) {
    if (checkEnd(state, data, nextSide)) {
      // 이 포제션을 끝낸 비트 = 경기의 마지막 비트: matchEnd "end" | "penalties" (화면 결과 한 줄 — 역습 · 배급 문구 대신, 2026-09-30)
      const lb = lastBeatEvent(state);
      if (lb) lb.matchEnd = state.finished ? "end" : "penalties";
      return;
    }
  }
  if (reason === "distribution") {
    startDistribution(state, data, nextSide, carry);
    return;
  }
  startPossession(state, data, nextSide, startLine, reason, carry);
}

/**
 * 마지막 공격 보장 (2026-09-29): 이번 단계(정규 · 연장)의 포제션이 다 됐을 때 다음 포제션 팀(= 방금 끝난 포제션을 갖지 않은 팀)이
 * 정확히 lastAttackDeficit(1)골 뒤지면 포제션 1개를 더 준다 (단계당 1회). 그 포제션은 평소처럼 시작한다 (킥오프 · 역습 · GK 배급).
 * @returns {boolean} 줬으면 true
 */
function grantLastAttack(state, data, nextSide) {
  if (!lastAttackDue(state, data, nextSide)) return false;
  const deficit = Math.round(num(matchCfg(data).lastAttackDeficit, 1));
  if (!state.lastAttackUsed) state.lastAttackUsed = { regular: false, extraTime: false };
  state.lastAttackUsed[state.stage] = true;
  state.possessionsTotal += 1;
  state.lastAttack = { side: nextSide, stage: state.stage, possession: state.possession };
  pushEvent(state, {
    type: "lastAttack", side: nextSide, stage: state.stage, deficit, banner: "추가시간 — 마지막 공격!",
    text: `추가시간 — 마지막 공격! ${state[nextSide].name} (${deficit}골 차)`,
  });
  return true;
}

/**
 * 마지막 공격 보장 조건 (grantLastAttack · endForecast 공용, 순수): 이번 단계(정규 · 연장)에서 아직 주지 않았고
 * nextSide 가 score 기준 정확히 lastAttackDeficit(1)골 뒤지면 true.
 */
function lastAttackDue(state, data, nextSide, score = state.score) {
  const deficit = Math.round(num(matchCfg(data).lastAttackDeficit, 1));
  if (deficit <= 0 || (nextSide !== "home" && nextSide !== "away")) return false;
  if (state.stage !== "regular" && state.stage !== "extraTime") return false;
  if (state.lastAttackUsed && state.lastAttackUsed[state.stage]) return false;
  const s = score || {};
  return num(s[nextSide]) - num(s[otherSide(nextSide)]) === -deficit;
}

/**
 * 지금 포제션이 끝나면 무슨 일이 일어나는가 (순수 — checkEnd 와 같은 규칙, 2026-09-30). nextSide = 이어질 포제션의 팀,
 * score = 그때 점수 (골이면 골 뒤 점수).
 *  null = 남은 포제션이 있어 그대로 이어진다, "extraTime" = 동점 → 연장 돌입 (다음 포제션은 평소처럼),
 *  "lastAttack" = 마지막 공격 보장으로 nextSide 에게 한 포제션 더, "end" = 경기 종료, "penalties" = 승부차기.
 *  "end" · "penalties" 면 역습 · GK 배급 · 킥오프가 없다 → 미리보기 · 이벤트 문구가 "경기 종료" · "승부차기" 를 쓴다.
 */
export function endForecast(state, data, nextSide, score = state.score) {
  if (!state || state.finished) return "end";
  if (state.stage === "penalties") return "penalties";
  if (possessionsLeft(state) > 1) return null;
  const s = score || {};
  const tied = num(s.home) === num(s.away);
  if (!tied && lastAttackDue(state, data, nextSide, s)) return "lastAttack";
  if (state.stage === "regular") return state.kind === "friendly" || !tied ? "end" : "extraTime";
  if (state.stage === "extraTime") return tied ? "penalties" : "end";
  return "end";
}

/** endForecast 결과가 "이 포제션으로 경기가 끝남"(종료 · 승부차기)인가 */
function endsMatch(fc) {
  return fc === "end" || fc === "penalties";
}

/** 종료/연장/승부차기 전이. true = 더 진행할 포제션 없음(종료 또는 승부차기). nextSide = 이어질 포제션의 팀 (마지막 공격 판정) */
function checkEnd(state, data, nextSide = null) {
  const m = matchCfg(data);
  const tied = state.score.home === state.score.away;
  if (!tied && grantLastAttack(state, data, nextSide)) return false;
  if (state.stage === "regular") {
    if (state.kind === "friendly" || !tied) {
      finishMatch(state, data);
      return true;
    }
    const extra = Math.max(1, Math.round(num(m.extraTimePossessions, 2)));
    state.stage = "extraTime";
    state.possessionsTotal += extra;
    pushEvent(state, { type: "extraTime", side: null, text: `동점! 연장전 ${extra}포제션 돌입` });
    return false;
  }
  if (state.stage === "extraTime") {
    if (!tied) {
      finishMatch(state, data);
      return true;
    }
    state.stage = "penalties";
    state.phase = "penalties";
    initPenalties(state);
    pushEvent(state, { type: "penalties", side: null, text: `연장에도 동점! 승부차기 (각 ${Math.max(1, num(m.penaltyShots, 5))}회)` });
    return true;
  }
  finishMatch(state, data);
  return true;
}

/* ------------------------------------------------------------------ */
/* GK 배급 (2026-09-29 사용자 결정 3)                                      */
/* ------------------------------------------------------------------ */

/**
 * GK 가 인플레이에서 공을 잡은 뒤 배급 대기 (phase "distribution"). 공은 GK 가 들고 있다 (carrier = GK, lineIndex 0 —
 * 뷰의 공격 팀 · 단계 기준, GK 는 자기 박스 gkZoneOf(side)). 듀얼 없음. 다음 step 이 배급을 판정한다.
 * carry = { gkId, from: "save"|"boxLink", saveEvent } — saveEvent 에 nextDistribution: true 를 단다.
 */
function startDistribution(state, data, side, carry = {}) {
  const team = state[side];
  const gk = findPlayer(team, carry.gkId) || team.players.find((p) => p.position === "GK") || bestOf(team.players, (p) => stat(p, "defense"));
  state.attackingSide = side;
  state.ball = newBall(gk.id, 0, 0);
  state.possessionFx = { home: { teamMult: 1 }, away: { teamMult: 1 } };
  state.duel = null;
  state.distribution = { side, gkId: gk.id, from: carry.from || "save", possession: state.possession };
  if (carry.sure) state.distribution.sure = Object.assign({}, carry.sure); // 확정 롱패스 (§19.3-10 — 이 배급 한 번만)
  state.phase = "distribution";
  if (carry.saveEvent) carry.saveEvent.nextDistribution = true;
}

/** 롱패스를 다투는 상대 선수: 상대 최고 MF ((수비+피지컬)/2, 동률 슬롯 순서). MF 가 없으면 GK 아닌 선수 → 전원 */
function longPassContest(team) {
  const score = (p) => (stat(p, "defense") + stat(p, "physical")) / 2;
  let cands = team.players.filter((p) => p.position === "MF");
  if (!cands.length) cands = team.players.filter((p) => p.position !== "GK");
  if (!cands.length) cands = team.players.slice();
  return bestOf(cands, score);
}

/**
 * GK 롱패스 성공 확률 (배급 판정 · 미리보기 · 자동 공용, 순수). 짝 · 선택 없는 자동 경합:
 *  공격 = GK (패스+피지컬)/2 × actionCoef.longPass × (1 + 빠른 배급 longPassBonus) × 캐논 킥 longPass 배율
 *  수비 = 상대 최고 MF (수비+피지컬)/2 × 1.0. p = clamp(공격 / (공격 + 수비), minP, maxP).
 * @param {{ skill?: object|null, gkId?: string|null, explain?: boolean }} opts skill = 함께 쓸 배급 스킬 (캐논 킥)
 * @returns {{ p, att, def, gk, contest, bonus, skillMult, factors }}
 */
export function longPassOdds(state, data, side, { skill = null, gkId = null, explain = false, dist: distOpt = undefined } = {}) {
  const m = matchCfg(data);
  const team = state[side];
  const oppTeam = state[otherSide(side)];
  const gid = gkId || (state.distribution && state.distribution.side === side ? state.distribution.gkId : null);
  const gk = findPlayer(team, gid) || team.players.find((p) => p.position === "GK") || bestOf(team.players, (p) => stat(p, "defense"));
  const contest = longPassContest(oppTeam);
  const c = m.actionCoef || {};
  const coef = num(c.longPass, num(c.pass, 2.2));
  const baseA = ((stat(gk, "pass") + stat(gk, "physical")) / 2) * coef;
  const bonus = traitParam(data, gk, "longPassBonus");
  const skillMult = skill && skill.active ? num(skill.active.params && skill.active.params.longPass, 1.5) : 1;
  const att = baseA * (1 + bonus) * skillMult;
  const def = contest ? (stat(contest, "defense") + stat(contest, "physical")) / 2 : 0;
  const raw = att + def > 0 ? att / (att + def) : 0.5;
  // 확정 롱패스 (§19.3-10): 필살 세이브 sureDistribution 으로 막은 GK 의 이번 배급 — 판정 없이 성공 (p = 1)
  // dist = 배급 대기 상태 (기본 state.distribution — resolveDistribution 은 지우기 전 사본을 넘긴다)
  const dist = distOpt === undefined ? state.distribution : distOpt;
  const sure = !!(dist && dist.sure && dist.side === side && dist.gkId === gk.id);
  const p = sure ? 1 : clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
  let factors = null;
  if (explain && sure) {
    factors = [];
  } else if (explain) {
    factors = [];
    pushFactor(factors, "atk", "base", baseA, "롱패스 기본", `롱패스 ${Math.round(baseA)}`, { base: true, stat: baseA / coef, coef });
    pushFactor(factors, "atk", "distributor", 1 + bonus, traitName(data, "distributor"), `${traitName(data, "distributor")} +${pct(bonus)}%`);
    pushFactor(factors, "atk", "skill", skillMult, skill ? skill.name : "스킬");
    pushFactor(factors, "def", "base", def, "경합 기본", `경합 ${Math.round(def)}`, { base: true, stat: def, coef: 1 });
  }
  const out = { p, att, def, gk, contest, bonus, skillMult, coef, factors };
  if (sure) Object.assign(out, { sure: true, sureSkillId: dist.sure.skillId || null });
  return out;
}

/** 배급 스킬 사용 가능 여부 + 효과 (배급 GK 가 가진 longPassBoost 스킬마다) — 미리보기 · 판정 공용 */
export function distributionSkills(state, data, side) {
  const d = state && state.distribution;
  if (!d || d.side !== side) return [];
  const gk = findPlayer(state[side], d.gkId);
  if (!gk) return [];
  return getPlayerActiveSkills(data, gk).filter(isDistributionSkill).map((sk) => ({
    skill: sk, check: checkDistributionSkill(state, data, side, gk.id, sk), cost: skillCost(state[side], sk),
  }));
}

/**
 * 배급 판정 (phase "distribution" 의 step). decision = 사람 결정 { action: "short"|"long", skillId? } 또는 null (자동: ai.decideDistribution).
 *  짧은 패스: 항상 성공 → 빌드업(line 0) 시작, pickStarter(0). 난수 없음, 체력 · 텐션 변화 없음.
 *  롱패스: 주사위 한 번 (longPassOdds). 체력: GK −staminaCost.pass, 경합 MF −staminaCost.defend (피지컬 경감 — 듀얼과 같은 공식).
 *   성공 → 텐션 +duelWin (GK 팀), 중원(line 1) 시작 pickStarter(1), 캐논 킥이면 첫 듀얼 +nextDuelBonus. 이벤트 "distribution".
 *   실패 → 텐션 +steal (상대 — 가로챈 것과 같음), 이벤트 "turnover" (distribution: true, defAction "intercept"),
 *   포제션 종료 → 상대가 중원(line 1)부터 공격 (역습 이벤트). 게이지 · 듀얼 승 통계는 바꾸지 않는다.
 *  캐논 킥: 텐션 소모 + skill 이벤트 (effect "longPassBoost"), stats.skillsUsed +1.
 */
function resolveDistribution(state, data, decision = null) {
  const m = matchCfg(data);
  const d = state.distribution;
  if (!d) throw new Error("match: 배급할 GK 가 없습니다");
  const side = d.side;
  const opp = otherSide(side);
  const team = state[side];
  const gk = findPlayer(team, d.gkId);
  if (!gk) throw new Error("match: 배급 GK 를 찾을 수 없습니다");
  let choice;
  if (decision) {
    const action = decision.action;
    if (!DISTRIBUTION_ACTIONS.includes(action)) throw new Error(`match: 배급은 short | long 입니다 (받은 값: ${action})`);
    let skillId = null;
    if (decision.skillId) {
      const sk = getSkill(data, decision.skillId);
      if (action !== "long") throw new Error(`match: ${sk.name}은(는) 롱패스와 함께만 쓸 수 있습니다`);
      const chk = checkDistributionSkill(state, data, side, gk.id, sk);
      if (!chk.ok) throw new Error(`match: 스킬 ${sk.id} 사용 불가 — ${chk.reason}`);
      skillId = sk.id;
    }
    choice = { action, skillId, byAI: false };
  } else {
    const c = decideDistribution(state, data, side);
    choice = { action: c.action === "long" ? "long" : "short", skillId: c.action === "long" ? c.skillId || null : null, byAI: true };
  }

  const skill = choice.skillId ? getSkill(data, choice.skillId) : null;
  if (skill) {
    const cost = skillCost(team, skill);
    team.tension = round1(num(team.tension) - cost);
    state.stats[side].skillsUsed += 1;
    const detail = addSkillFx({}, skill);
    pushEvent(state, {
      type: "skill", side, playerId: gk.id, skillId: skill.id, effect: skill.active.effect, gaanpa: false, cost,
      text: `${gk.name}, [${skill.name}] 발동! ${detail}`,
    });
  }
  const la = isLastAttackPossession(state) ? { lastAttack: true } : {};
  const common = { playerId: gk.id, gkZone: gkZoneOf(side), from: d.from, distribution: true, byAI: choice.byAI, ...la };
  state.distribution = null;

  if (choice.action === "short") {
    const starter = pickStarter(team, 0);
    pushEvent(state, {
      type: "distribution", side, action: "short", success: true, p: 1, receiverId: starter.id, ...common,
      text: `${gk.name}, 짧은 패스 → ${starter.name} (빌드업부터)`,
      ...beatPos(side, 0, side, 0),
    });
    startPossession(state, data, side, 0, "distribution");
    return;
  }

  const lp = longPassOdds(state, data, side, { skill, gkId: gk.id, explain: true, dist: d });
  let success = true;
  if (!lp.sure) {
    // 확정 롱패스(sureDistribution)는 주사위를 굴리지 않는다 — 이 경로에서만 rng 호출이 하나 줄어든다 (§19.3-12)
    const rng = createRngFromState(state.rngState);
    success = rng.chance(lp.p);
    state.rngState = rng.getState();
  }
  const chip = lp.sure ? { factors: [], decisive: null, upset: false } : chipOf(lp.factors, lp.p, success, m);
  spendStamina(state, m, side, gk, num(m.staminaCost && m.staminaCost.pass), null);
  if (lp.contest) spendStamina(state, m, opp, lp.contest, num(m.staminaCost && m.staminaCost.defend), null);
  const pc = pct(lp.p);
  const longCommon = {
    ...common, action: "long", p: lp.p, defenderId: lp.contest ? lp.contest.id : null, skillId: skill ? skill.id : undefined,
    factors: chip.factors, decisive: chip.decisive, upset: chip.upset,
    ...(lp.sure ? { sure: true, sureSkillId: lp.sureSkillId } : {}),
  };
  if (success) {
    addTension(state, m, side, num(m.tension && m.tension.duelWin, 10), null);
    const starter = pickStarter(team, 1);
    const nextBonus = skill ? num(skill.active.params && skill.active.params.nextDuelBonus, 0) : 0;
    pushEvent(state, {
      type: "distribution", side, success: true, receiverId: starter.id, nextBonus: nextBonus || undefined, ...longCommon,
      text: `${gk.name}, 롱패스! 중원의 ${starter.name}에게 연결 (${lp.sure ? `확정 — ${skillName(data, lp.sureSkillId, "필살 세이브")}` : `${pc}%`})${skill ? ` [${skill.name}]` : ""}${nextBonus ? ` 첫 듀얼 +${pct(nextBonus)}%` : ""}`,
      ...beatPos(side, 0, side, 1),
    });
    startPossession(state, data, side, 1, "distribution", { nextBonus });
    return;
  }
  addTension(state, m, opp, num(m.tension && m.tension.steal, 15), null);
  const contestName = lp.contest ? lp.contest.name : "상대";
  // receiverId = 롱패스가 향하던 우리 MF (화면이 끊긴 롱패스 방향을 그린다), starterId = 세컨드볼을 잡고 역습을 시작할 상대 선수
  // (pickStarter(1) — 끊은 선수와 다를 수 있다). 마지막 포제션이라 경기가 끝나면 starterId 없음 · 문구 "경기 종료" (2026-09-30)
  const fc = endForecast(state, data, opp);
  const intended = pickStarter(team, 1);
  const oppStarter = endsMatch(fc) ? null : pickStarter(state[opp], 1);
  const next = endsMatch(fc)
    ? END_TEXT[fc]
    : `세컨드볼${oppStarter && lp.contest && oppStarter.id !== lp.contest.id ? ` → ${oppStarter.name}` : ""}, ${state[opp].name} 중원부터 공격`;
  pushEvent(state, {
    type: "turnover", side, success: false, defAction: "intercept", counterStart: 1, ...longCommon,
    receiverId: intended ? intended.id : undefined, starterId: oppStarter ? oppStarter.id : undefined,
    text: `${contestName}, 롱패스 차단! ${gk.name}의 롱패스 — ${next} (${pc}%)`,
    ...beatPos(side, 0, opp, 1),
  });
  endPossession(state, data, opp, 1, "counter");
}

/* ------------------------------------------------------------------ */
/* 승부차기                                                              */
/* ------------------------------------------------------------------ */

function initPenalties(state) {
  const order = (side) => {
    const t = state[side];
    const non = t.players.filter((p) => p.position !== "GK").sort((a, b) => stat(b, "shoot") - stat(a, "shoot"));
    const gks = t.players.filter((p) => p.position === "GK");
    return non.concat(gks).map((p) => p.id);
  };
  state.penalties = {
    home: 0,
    away: 0,
    taken: { home: 0, away: 0 },
    order: { home: order("home"), away: order("away") },
    turn: "home",
    suddenDeath: false,
    kicks: [],
  };
}

function penaltyKick(state, data) {
  const m = matchCfg(data);
  const pen = state.penalties;
  if (!pen) {
    initPenalties(state);
    return penaltyKick(state, data);
  }
  const side = pen.turn;
  const opp = otherSide(side);
  const team = state[side];
  const oppTeam = state[opp];
  const order = pen.order[side];
  const shooter = findPlayer(team, order[pen.taken[side] % order.length]);
  const gk = oppTeam.players.find((p) => p.position === "GK") || bestOf(oppTeam.players, (p) => stat(p, "defense"));
  if (!shooter || !gk) throw new Error("match.penaltyKick: 키커 또는 골키퍼가 없습니다");
  const staminaMax = num(m.staminaMax, 100);
  const base = { data, lineIndex: 3, chain: 0, possessionsLeft: 0, isGoalMatch: state.kind === "goal", staminaMax };
  const modsA = collectMods(team, shooter.id, {
    ...base, action: "shoot", phase: "attack", scoreDiff: pen[side] - pen[opp], opponentStyle: gk.style, stamina: liveStamina(team, shooter.id),
  });
  const modsD = collectMods(oppTeam, gk.id, {
    ...base, action: "save", phase: "defense", scoreDiff: pen[opp] - pen[side], opponentStyle: shooter.style, stamina: liveStamina(oppTeam, gk.id),
  });
  const att = stat(shooter, "shoot") * num(m.actionCoef.shoot, 1) * styleMult(shooter.style, gk.style, m)
    * (num(team.conditionMult, 1) || 1) * modsA.attack * modsA.shootPower * Math.max(0, 1 + bonusOf(team, "shootPower"));
  const def = stat(gk, "defense") * num(m.actionCoef.save, 1) * styleMult(gk.style, shooter.style, m)
    * (num(oppTeam.conditionMult, 1) || 1) * modsD.defense * modsD.save * Math.max(0, 1 + bonusOf(oppTeam, "defense"));
  const raw = att + def > 0 ? att / (att + def) : 0.5;
  const p = clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
  const rng = createRngFromState(state.rngState);
  const success = rng.chance(p);
  state.rngState = rng.getState();

  pen.taken[side] += 1;
  if (success) pen[side] += 1;
  pen.kicks.push({ side, playerId: shooter.id, success, p });
  state.stats[side].shots += 1;
  // 위치: 키커가 노리는 박스 (home → Z5, away → Z1). toZone = 다음 키커의 박스 (종료되면 아래에서 그대로 둔다)
  const kickEv = pushEvent(state, {
    type: "penalty", side, success, playerId: shooter.id, defenderId: gk.id, p,
    text: `승부차기 ${pen.taken[side]}번 ${shooter.name}: ${success ? "골!" : `${gk.name} 세이브!`} (${pct(p)}%) [${pen.home}-${pen.away}]`,
    ...beatPos(side, 3, opp, 3),
  });
  pen.turn = opp;

  const N = Math.max(1, Math.round(num(m.penaltyShots, 5)));
  const th = pen.taken.home;
  const ta = pen.taken.away;
  let over = false;
  if (th <= N && ta <= N) {
    const remH = N - th;
    const remA = N - ta;
    if (pen.home + remH < pen.away || pen.away + remA < pen.home) over = true;
    else if (th === N && ta === N && pen.home !== pen.away) over = true;
    if (th === N && ta === N && pen.home === pen.away) pen.suddenDeath = true;
  } else if (th === ta && pen.home !== pen.away) {
    over = true;
  }
  if (over) {
    Object.assign(kickEv, { toAttackingSide: side, toStep: 3, toZone: kickEv.zone });
    finishMatch(state, data);
  }
}

/* ------------------------------------------------------------------ */
/* 종료                                                                  */
/* ------------------------------------------------------------------ */

function computeMvp(st) {
  let best = null;
  let bs = -Infinity;
  const ids = new Set([...Object.keys(st.playerDuelWins || {}), ...Object.keys(st.playerGoals || {})]);
  for (const id of ids) {
    const s = num(st.playerGoals && st.playerGoals[id]) * 3 + num(st.playerDuelWins && st.playerDuelWins[id]);
    if (s > bs) { bs = s; best = id; }
  }
  return best;
}

function buildResult(state, provisional) {
  const s = state.score;
  let winner = s.home > s.away ? "home" : s.away > s.home ? "away" : "draw";
  let penalties;
  if (state.penalties) {
    penalties = { home: state.penalties.home, away: state.penalties.away };
    if (penalties.home !== penalties.away) winner = penalties.home > penalties.away ? "home" : "away";
  }
  const stats = JSON.parse(JSON.stringify(state.stats));
  for (const side of ["home", "away"]) stats[side].mvpId = computeMvp(stats[side]);
  const result = {
    kind: state.kind,
    home: s.home,
    away: s.away,
    homeGoals: s.home,
    awayGoals: s.away,
    homeName: state.home.name,
    awayName: state.away.name,
    winner,
    stats,
    events: state.events.slice(),
    possessionsPlayed: Math.min(state.possession - 1, state.possessionsTotal),
    stage: state.stage,
    seed: state.seed,
    // 마지막 공격 보장으로 준 포제션 (없으면 null) — 2026-09-29
    lastAttack: state.lastAttack ? Object.assign({}, state.lastAttack) : null,
  };
  if (penalties) result.penalties = penalties;
  if (provisional) result.provisional = true;
  return result;
}

function finishMatch(state, data) {
  state.finished = true;
  state.phase = "finished";
  state.duel = null;
  const s = state.score;
  let winnerText = s.home > s.away ? `${state.home.name} 승리` : s.away > s.home ? `${state.away.name} 승리` : "무승부";
  let penText = "";
  if (state.penalties) {
    const pen = state.penalties;
    penText = ` (승부차기 ${pen.home}-${pen.away})`;
    if (pen.home !== pen.away) winnerText = pen.home > pen.away ? `${state.home.name} 승리` : `${state.away.name} 승리`;
  }
  pushEvent(state, {
    type: "end", side: null,
    text: `경기 종료 — ${state.home.name} ${s.home} : ${s.away} ${state.away.name}${penText} · ${winnerText}`,
  });
  state.result = buildResult(state, false);
  for (const side of ["home", "away"]) state.stats[side].mvpId = state.result.stats[side].mvpId;
}

/* ------------------------------------------------------------------ */
/* 공개 API                                                              */
/* ------------------------------------------------------------------ */

/**
 * 한 듀얼(또는 승부차기 한 킥) 진행.
 * @param {object} state
 * @param {object} data
 * @param {{ action?: string, receiverId?: string, skillId?: string, ultimate?: boolean, gaanpa?: boolean|"ticket"|"skill" }|null} decision
 *   humanSide 가 needsDecision 상태일 때만 사용. action 없이 skillId / gaanpa 만 주면 그것만 발동하고 결정 대기 유지.
 * @param {"home"|"away"} [humanSide] 기본 state.humanSide ("home")
 * @returns {object} state
 */
export function step(state, data, decision = null, humanSide = undefined) {
  if (!state || state.finished) return state;
  matchCfg(data);
  const human = humanSide || state.humanSide || "home";
  state.humanSide = human;

  if (state.phase === "penalties") {
    penaltyKick(state, data);
    return state;
  }
  if (state.phase === "distribution" && state.distribution) {
    // GK 배급: 사람 측이면 decision { action: "short"|"long", skillId? } (없으면 전술 자동), 상대면 자동
    const needD = humanNeedsDecision(state, human);
    resolveDistribution(state, data, needD && decision && (decision.action || decision.skillId) ? decision : null);
    return state;
  }
  if (state.phase !== "decision" || !state.duel) {
    // 외부에서 만든/possessionEnd 상태: 듀얼을 준비하고 반환 (UI가 결정 기회를 가짐)
    if (!state.ball || !state.ball.carrierId) {
      startPossession(state, data, state.attackingSide || "home", num(state.ball && state.ball.lineIndex, 0), "kickoff");
    } else {
      setupDuel(state, data);
    }
    return state;
  }

  const need = humanNeedsDecision(state, human);
  if (need && decision && decision.ultimate && !decision.action) throw new Error("match: 필살기는 액션과 함께 선택해야 합니다");
  if (need) {
    if (decision && (decision.action || decision.skillId || decision.gaanpa)) {
      if (!decision.action) {
        // 스킬·간파만 먼저 사용 → 결정 대기 유지
        commitChoice(state, data, human, { action: null, skillId: decision.skillId || null, gaanpa: decision.gaanpa || null }, false);
        return state;
      }
      commitChoice(state, data, human, decision, false);
    } else {
      commitAI(state, data, human);
    }
  }
  const ai = otherSide(human);
  const aiChoice = state.duel[ai + "Choice"];
  if (!(aiChoice && aiChoice.action)) commitAI(state, data, ai);
  const hChoice = state.duel[human + "Choice"];
  if (!(hChoice && hChoice.action)) commitAI(state, data, human);

  resolveDuel(state, data);
  return state;
}

export function simulateAuto(state, data) {
  let guard = 0;
  while (state && !state.finished) {
    step(state, data, null);
    if (++guard > MAX_AUTO_STEPS) throw new Error("match.simulateAuto: 진행이 끝나지 않습니다 (무한 루프 방지)");
  }
  return state;
}

export function isFinished(state) {
  return !!(state && state.finished);
}

/**
 * 결과. 종료 전이면 현재 스코어 기준의 임시 결과(provisional: true).
 * home/away 는 득점 수(run.record 와 동일 의미), homeGoals/awayGoals 동일 값, homeName/awayName 팀 이름.
 */
export function getResult(state) {
  if (!state) return null;
  if (state.finished && state.result) return state.result;
  return buildResult(state, true);
}

/* ------------------------------------------------------------------ */
/* 뷰 (ARCHITECTURE §12.1, §13.4) — 전부 읽기 전용, 난수 없음              */
/* ------------------------------------------------------------------ */

function playersView(team, state, side, m, data) {
  const carrierId = state.attackingSide === side && state.ball ? state.ball.carrierId : null;
  const defenderId = state.attackingSide !== side && state.duel ? state.duel.defenderId : null;
  return team.players.map((p) => {
    const ult = getPlayerUltimate(data, p);
    return {
      id: p.id,
      name: p.name,
      slot: p.slot,
      position: p.position,
      style: p.style,
      element: p.element,
      portraitColor: p.portraitColor,
      isYouth: !!p.isYouth,
      trait: p.trait || null,
      stamina: liveStamina(team, p.id),
      staminaMax: num(m.staminaMax, 100),
      gauge: gaugeOf(state, side, p.id),
      ultimateSkillId: ult ? ult.id : null,
      isCarrier: p.id === carrierId,
      isDefender: p.id === defenderId,
    };
  });
}

function lastBeatEvent(state) {
  const evs = state.events || [];
  for (let i = evs.length - 1; i >= 0; i--) if (BEAT_TYPES.includes(evs[i].type)) return evs[i];
  return null;
}

/** 구역 이름을 viewer 시점으로 (ZONE_NAMES 는 home 시점). */
function zoneNameFor(zone, viewer) {
  return ZONE_NAMES[viewer === "away" ? 6 - zone : zone];
}

/**
 * 공(posSide 가 공격, 단계 step)과 목표 골 사이에 남은(뚫리지 않은) 수비. POS_BY_LINE.slice(step) 기준.
 * @returns {{ lines: string[], gk: boolean, counts: Object<string, number>, text: string }}
 */
function remainingDefense(state, posSide, step) {
  const defTeam = state[otherSide(posSide)];
  const players = (defTeam && defTeam.players) || [];
  const lines = [];
  const counts = {};
  for (const pos of POS_BY_LINE.slice(clamp(step, 0, 3))) {
    if (pos === "GK") continue;
    const n = players.filter((p) => p.position === pos).length;
    if (n > 0) {
      lines.push(pos);
      counts[pos] = n;
    }
  }
  const gk = players.some((p) => p.position === "GK");
  const parts = lines.map((pos) => `${pos} ${counts[pos]}`);
  if (gk) parts.push("GK");
  return { lines, gk, counts, text: `남은 수비: ${parts.length ? parts.join(" + ") : "없음"}` };
}

/** 우리(viewer) 공격이 step 단계에 들어설 때의 한 줄: { place, tail } */
function advanceText(step) {
  if (step >= 3) return { place: "상대 박스 진입", tail: "슈팅 찬스" };
  if (step === 2) return { place: "상대 진영 진입", tail: "중거리 슛 가능" };
  return { place: "중원 진입", tail: null };
}

/** 상대 역습(시작 단계 start, 구역 zone) 한 줄 — viewer 시점 */
function oppCounterText(start, zone, viewer, hold = false) {
  if (start === 0) return "공 뺏김 — 상대 빌드업부터";
  // 버티기로 뺏긴 공은 역습이 아니다: 뺏긴 자리에서 한 구역 물러나 시작 (GDD #54)
  return hold ? `공 뺏김 — 상대 ${zoneNameFor(zone, viewer)}부터 (버티기)` : `상대 역습 — ${zoneNameFor(zone, viewer)}부터`;
}

function bonusPctText(x) {
  return `+${Math.round(num(x, 0) * 100)}%`;
}

/**
 * 사람(human) 측 이번 결정의 기대값 (§13.4 expectedPct). fx = 사람 측 효과(미리보기 변형), receiverId = 받는 선수.
 *  공격: 돌파 확률 — line 2 의 드리블·패스·크로스는 "이번 공격 득점 기대" (돌파 × 박스 슛), 슛은 골 확률.
 *  수비: 막을 확률 (상대 예상 행동 기준, 상대가 간파했으면 우리 선택에 대한 상대의 최선 대응 기준).
 * @returns {{ p: number, exp: number, response: string|null, receiverId: string|null }}
 */
function evaluateHuman(state, data, human, action, { fx = null, receiverId = null } = {}) {
  const role = state.attackingSide === human ? "attack" : "defense";
  const line = num(state.ball.lineIndex, 0);
  const opp = otherSide(human);
  const fxH = fx || fxOf(state, human);
  const fxO = fxOf(state, opp);
  const duel = state.duel;
  const oppChoice = (duel && duel[opp + "Choice"]) || {};
  const reading = !!(duel && duel.gaanpaSide === opp && oppChoice.byAI && line < 3);
  if (role === "attack") {
    if (line >= 3) {
      // ④ = 자동 규칙(boxLinkEval)과 같은 함수 · 같은 GK 효과 (커밋한 세이브 — AI GK 는 사람보다 먼저 커밋한다 — 아니면 같은 규칙의 예측)
      const carrier = findPlayer(state[human], state.ball.carrierId);
      const r = boxExpect(state, data, human, carrier, action, fxH, gkFxFor(state, data, human), receiverId);
      return { p: r.p, exp: r.exp, response: "save", receiverId: r.receiverId };
    }
    let defAction;
    if (reading) defAction = bestDefenseResponse(state, data, action, { fxA: fxH, fxD: fxO });
    else defAction = oppChoice.action || autoAction(state, data, opp);
    const odds = computeOdds(state, data, { action, defAction, fxA: fxH, fxD: fxO });
    let exp = odds.p;
    let rid = receiverId;
    // line 2 돌파·연결, ④ 박스 연결 = 득점 기대 (성공 × 받은/돌파한 선수의 박스 슛·원터치·헤더 골 확률)
    if (line >= 2 && action !== "shoot") {
      const carrier = findPlayer(state[human], state.ball.carrierId);
      const tr = successTransition(state, data, human, carrier, action, fxH, receiverId);
      rid = tr.via ? tr.receiver.id : null;
      exp = odds.p * nextShotP(state, data, human, carrier, tr, action, defAction, fxH, fxO);
    }
    return { p: odds.p, exp, response: defAction, receiverId: rid };
  }
  let atkAction = oppChoice.action || autoAction(state, data, opp);
  if (reading) atkAction = bestAttackResponse(state, data, action, { fxA: fxO, fxD: fxH }).action || atkAction;
  const odds = computeOdds(state, data, { action: atkAction, defAction: action, fxA: fxO, fxD: fxH });
  return { p: 1 - odds.p, exp: 1 - odds.p, response: atkAction, receiverId: null };
}

/** line 2 에서 돌파한 뒤(또는 ④ 박스 연결 뒤) 박스 슛(vs GK) 골 확률 — 판정과 같은 규칙의 가상 상태로 계산 */
function nextShotP(state, data, side, carrier, tr, action, defAction, fxA, fxD) {
  const opp = otherSide(side);
  const gk = state[opp].players.find((p) => p.position === "GK") || bestOf(state[opp].players, (p) => stat(p, "defense"));
  const receiver = tr.receiver;
  const ultPass = !!(fxA.ult && fxA.ult.type === "pass");
  // E1: 등록된 합체기 짝일 때만 받은 선수가 합체기 대기
  const recvUlt = ultPass && tr.via ? comboSkillFor(data, fxA.ult.skillId, receiver) : null;
  const ball2 = Object.assign({}, state.ball, {
    carrierId: receiver.id,
    lineIndex: tr.newLine,
    chain: num(state.ball.chain) + (tr.via ? 1 : 0),
    extraLine: !!state.ball.extraLine || tr.extraLineShot,
    oneTouch: tr.oneTouch,
    receivedVia: tr.via,
    lastPasserId: tr.via ? carrier.id : null,
    receivedFresh: !!tr.via,
    comboReadyId: recvUlt ? receiver.id : null,
    comboFrom: recvUlt ? { playerId: carrier.id, skillId: fxA.ult.skillId } : null,
    pending: pendingAfterSuccess(action, defAction, fxA, fxD),
    boxLinkUsed: !!state.ball.boxLinkUsed || isBoxLinkAction(action, num(state.ball.lineIndex, 0)),
  });
  // E3: 이번 듀얼에 쓰는 팀 필살기는 판정 뒤 그 포제션의 다음 판정(= 이 박스 슛)에도 붙는다
  let possessionFx = state.possessionFx;
  const teamFx = [[side, fxA], [opp, fxD]].filter(([, f]) => f && f.ult && f.ult.type === "team");
  if (teamFx.length) {
    const pf = state.possessionFx || {};
    possessionFx = { home: Object.assign({ teamMult: 1 }, pf.home), away: Object.assign({ teamMult: 1 }, pf.away) };
    for (const [sd, f] of teamFx) {
      possessionFx[sd].ultMult = round6(num(possessionFx[sd].ultMult, 1) * num(f.ult.teamMult, 1));
      possessionFx[sd].teamUlt = f.ult.skillId;
    }
  }
  const pseudo = Object.assign({}, state, {
    ball: ball2,
    attackingSide: side,
    possessionFx,
    duel: { defenderId: gk.id, coverCount: 0, baseCover: 0, gaanpaSide: null, effects: { home: emptyDuelEffects(), away: emptyDuelEffects() } },
  });
  let fxS = emptyDuelEffects();
  if (recvUlt && recvUlt.ultimate.type === "shot") {
    fxS = fxPlusUlt(fxS, recvUlt, { name: comboName(data, fxA.ult.skillId, recvUlt.id) || "합체기", passerId: carrier.id, passerSkillId: fxA.ult.skillId });
  } else {
    // 슈터 자기 필살 슛: 판정 뒤 게이지(드리블 = 듀얼 승 +onDuelWin, 패스·크로스 = 수신 +onReceive / 필살 패스 receiverGauge)가
    // 가득이면 박스 슛에서 쓸 수 있다 (AI 규칙: shot 은 준비되면 항상 사용). 이번 듀얼에 필살기를 쓴 선수는 게이지 0.
    const own = getPlayerUltimate(data, receiver);
    const g0 = gaugeOf(state, side, receiver.id);
    if (own && own.ultimate.type === "shot" && g0 != null) {
      const uc = ultCfg(matchCfg(data));
      const usedNow = !!fxA.ult && receiver.id === carrier.id;
      const gain = tr.via ? (ultPass ? receiverGaugeOf(fxA.ult, uc) : uc.onReceive) : uc.onDuelWin;
      const g1 = usedNow ? 0 : Math.min(uc.max, g0 + gain);
      if (g1 >= uc.max) fxS = fxPlusUlt(fxS, own, null);
    }
  }
  let fxG = emptyDuelEffects();
  const gkUlt = getPlayerUltimate(data, gk);
  // ④ 박스 연결에 GK 가 필살 세이브를 쓰면 (커밋했거나 규칙상 쓸 예정 — fxD) 게이지 0 → 다음 슛에는 없다 (커밋 전후 같은 값)
  const gkUsedNow = num(state.ball.lineIndex, 0) >= 3 && !!(fxD && fxD.ult && fxD.ult.type === "save");
  if (!gkUsedNow && gkUlt && gkUlt.ultimate.type === "save" && aiWantsUltimate(pseudo, data, opp, gk, "defense", "save")) fxG = fxPlusUlt(fxG, gkUlt, null);
  return computeOdds(pseudo, data, { action: "shoot", defAction: "save", fxA: fxS, fxD: fxG }).p;
}

/** 공격 결과 미리보기 한 액션 { success, fail } (§12.1 Outcome + short) */
function attackOutcome(state, data, human, action, { fx = null, receiverId = null } = {}) {
  const opp = otherSide(human);
  const line = num(state.ball.lineIndex, 0);
  const fxH = fx || fxOf(state, human);
  const fxO = fxOf(state, opp);
  const team = state[human];
  const carrier = findPlayer(team, state.ball.carrierId);
  const defender = findPlayer(state[opp], state.duel.defenderId);
  const ev = evaluateHuman(state, data, human, action, { fx: fxH, receiverId });
  const cp = counterPlan(data, line, ev.response, fxO, defender, line >= 3);
  const oppZone = zoneOf(opp, cp.start);
  const zn = zoneNameFor(oppZone, human);
  const lost = { zone: oppZone, attackingSide: opp, step: cp.start, label: oppCounterText(cp.start, oppZone, human, ev.response === "hold"), short: cp.start === 0 ? "실패 상대 빌드업" : ev.response === "hold" ? `실패 상대 ${zn}부터` : `실패 상대 역습(${zn})` };
  // GK 가 잡으면 (④ 세이브 · 박스 연결 차단) 상대 GK 배급 (2026-09-29) — 구역 = 상대 빌드업 구역, gkZone = GK 가 선 박스
  const gkCatch = { distribution: true, gkZone: gkZoneOf(opp) };
  // 마지막 포제션 (2026-09-30): 막히면 경기가 끝나면(종료 · 승부차기) 역습 · GK 배급 대신 "경기 종료" — endForecast (checkEnd 와 같은 규칙)
  const failFc = endForecast(state, data, opp);
  const failEnd = endsMatch(failFc) ? { matchEnd: failFc, short: `실패 ${END_TEXT[failFc]}` } : null;
  const endLost = (head) => Object.assign({}, lost, failEnd, { label: `${head} → ${END_TEXT[failFc]}` });
  if (action === "shoot") {
    const goal = goalOutcome(state, data, human);
    if (line >= 3) {
      return {
        success: goal,
        fail: failEnd ? endLost("세이브") : Object.assign({}, lost, gkCatch, { label: "세이브 → 상대 GK 배급", short: "실패 상대 GK 배급" }),
      };
    }
    const failLabel = cp.start === 0 ? "막히면 → 상대 빌드업부터" : `막히면 → 상대 역습, ${zn}부터`;
    return {
      success: goal,
      fail: failEnd ? endLost("막히면") : Object.assign({}, lost, { label: failLabel, short: lost.short }),
    };
  }
  const tr = successTransition(state, data, human, carrier, action, fxH, receiverId);
  if (isBoxLinkAction(action, line)) {
    // ④ 박스 연결: 성공 = 박스 그대로 받은 선수 원터치 슛·헤더 찬스, 실패 = GK 가 잡음 (세이브와 같음)
    const r = tr.receiver;
    const finish = action === "cross" ? "헤더" : "원터치 슛";
    return {
      success: {
        zone: zoneOf(human, tr.newLine), attackingSide: human, step: tr.newLine,
        label: `${r.name} ${finish} 찬스`, short: `성공 ${r.name} ${action === "cross" ? "헤더" : "원터치"}`,
        receiver: { id: r.id, name: r.name, side: human }, oneTouch: true, boxLink: true,
      },
      fail: failEnd
        ? Object.assign(endLost("GK가 끊어냄"), { boxLink: true })
        : Object.assign({}, lost, gkCatch, {
          label: "GK가 끊어냄 → 상대 GK 배급",
          short: "실패 상대 GK 배급",
          boxLink: true,
        }),
    };
  }
  const adv = advanceText(tr.newLine);
  const success = { zone: zoneOf(human, tr.newLine), attackingSide: human, step: tr.newLine, label: "", short: "" };
  if (action === "pass" || action === "cross") {
    const r = tr.receiver;
    success.receiver = { id: r.id, name: r.name, side: human };
    if (action === "cross") {
      success.label = `${r.name} 헤더 찬스 — ${adv.place}${tr.oneTouch ? " (원터치)" : ""}`;
      success.short = `성공 ${r.name} 헤더`;
    } else {
      success.label = `${r.name}에게 연결 — ${adv.place}${adv.tail ? ", " + adv.tail : ""}${tr.oneTouch ? " (원터치)" : ""}`;
      success.short = tr.newLine >= 3 ? `성공 ${r.name} 원터치` : `성공 ${r.name}에게`;
    }
  } else {
    success.label = adv.tail ? `${adv.place} — ${adv.tail}` : adv.place;
    success.short = tr.newLine >= 3 ? "성공 박스 진입" : tr.newLine === 2 ? "성공 상대 진영" : "성공 중원";
  }
  if (tr.oneTouch) success.oneTouch = true;
  return { success, fail: failEnd ? endLost("뺏기면") : lost };
}

/**
 * 골 결과 한 줄 (공격 결과 미리보기의 성공 · 수비 결과 미리보기의 뚫림 공용): scorer 가 넣은 뒤의 점수로 endForecast —
 * 평소 "골! → 상대 킥오프" / "실점 → 우리 킥오프", 마지막 포제션이면 "→ 경기 종료" · "→ 연장전" · "→ 승부차기" ·
 * "→ 상대/우리 마지막 공격" (2026-09-30). viewer = 문구 시점.
 */
function goalOutcome(state, data, scorer, viewer = scorer) {
  const conceder = otherSide(scorer);
  const s2 = Object.assign({}, state.score, { [scorer]: num(state.score && state.score[scorer]) + 1 });
  const fc = endForecast(state, data, conceder, s2);
  const kickoff = conceder === viewer ? "우리 킥오프" : "상대 킥오프";
  const lastAtk = conceder === viewer ? "우리 마지막 공격" : "상대 마지막 공격";
  const next = endsMatch(fc) ? END_TEXT[fc] : fc === "extraTime" ? "연장전" : fc === "lastAttack" ? lastAtk : kickoff;
  const out = { zone: zoneOf(conceder, kickoffLine(data)), attackingSide: conceder, step: kickoffLine(data), goal: true };
  if (endsMatch(fc)) out.matchEnd = fc;
  if (scorer === viewer) return Object.assign(out, { label: `골! → ${next}`, short: "성공 골!" });
  return Object.assign(out, { conceded: true, label: `뚫리면 — 실점 → ${next}`, short: "뚫리면 실점" });
}

/** 수비 결과 미리보기 한 액션 { success(막음), fail(뚫림) } — 손익 라벨 (§13.4) */
function defenseOutcome(state, data, human, dAction, { fx = null } = {}) {
  const m = matchCfg(data);
  const opp = otherSide(human);
  const line = num(state.ball.lineIndex, 0);
  const fxH = fx || fxOf(state, human);
  const fxO = fxOf(state, opp);
  const defender = findPlayer(state[human], state.duel.defenderId);
  const ev = evaluateHuman(state, data, human, dAction, { fx: fxH });
  const cp = counterPlan(data, line, dAction, fxH, defender, false);
  const ourZone = zoneOf(human, cp.start);
  const zn = zoneNameFor(ourZone, human);
  let stopLabel;
  let stopShort;
  if (cp.start === 0) {
    stopLabel = dAction === "hold" ? "막으면 — 우리 공격, 빌드업부터 (역습 이점 없음)" : "막으면 — 우리 공격, 빌드업부터";
    stopShort = "막으면 빌드업";
  } else if (dAction === "hold") {
    // 버티기: 역습 이점 없이 뺏은 자리에서 한 구역 물러나 시작 (GDD #54)
    stopLabel = `막으면 — 우리 공격, ${zn}부터 (역습 이점 없음, 한 구역 물러남)`;
    stopShort = `막으면 ${zn}부터`;
  } else if (cp.fast) {
    stopLabel = `막으면 — 빠른 역습, ${zn}부터`;
    stopShort = `막으면 빠른역습(${zn})`;
  } else {
    stopLabel = `막으면 — 우리 역습, ${zn}부터`;
    stopShort = `막으면 역습(${zn})`;
  }
  if (cp.capTension) stopLabel += ` · 텐션 +${cp.capTension}`;
  if (cp.stealTension) stopLabel += ` · 텐션 +${cp.stealTension}`;
  if (cp.cappedNextBonus) stopLabel += ` · 역습 첫 듀얼 ${bonusPctText(cp.cappedNextBonus)}`;
  // 마지막 포제션 (2026-09-30): 막으면 경기가 끝나면 "막으면 — 경기 종료", 우리가 마지막 공격을 받으면 그 표시
  const stopFc = endForecast(state, data, human);
  if (endsMatch(stopFc)) {
    stopLabel = `막으면 — ${END_TEXT[stopFc]}`;
    stopShort = `막으면 ${END_TEXT[stopFc]}`;
  } else if (stopFc === "lastAttack") {
    stopLabel += " (추가시간 — 우리 마지막 공격)";
  }
  const success = { zone: ourZone, attackingSide: human, step: cp.start, label: stopLabel, short: stopShort };
  if (endsMatch(stopFc)) success.matchEnd = stopFc;

  let fail;
  if (ev.response === "shoot") {
    fail = goalOutcome(state, data, opp, human);
  } else {
    const oppNext = advanceLine(line, !!fxO.extraLine);
    const breach = oppNext >= 3
      ? "뚫리면 — 우리 박스 슈팅 위기"
      : oppNext === 2 ? "뚫리면 — 우리 진영 위험, 중거리 슛 가능" : "뚫리면 — 상대 중원 진입";
    let pen = "";
    let short = "뚫리면 손해 없음";
    if (!fxH.noFailPenalty && dAction === "tackle") {
      pen = ` · 제쳐짐 ${bonusPctText(m.beatenBonus)}`;
      short = `뚫리면 제쳐짐 ${bonusPctText(m.beatenBonus)}`;
    } else if (!fxH.noFailPenalty && dAction === "intercept") {
      pen = ` · 상대 ${bonusPctText(m.interceptFailBonus)}`;
      short = `뚫리면 상대 ${bonusPctText(m.interceptFailBonus)}`;
    }
    fail = { zone: zoneOf(opp, oppNext), attackingSide: opp, step: oppNext, label: breach + pen, short };
  }
  return { success, fail };
}

/**
 * 결정 대기 중인 사람 측 액션별 결과 미리보기 (§12.1-2, §13.4).
 * zone = 그 비트 직후 공 구역. 판정과 같은 순수 규칙(successTransition / counterPlan / 간파 대응)을 쓴다.
 * A안: 상대의 예상 행동(커밋)을 알기 때문에 상대 수비의 역습 위치·상대 공격의 슛 여부가 정확하다.
 * extraFx = 이번 결정과 함께 쓸 스킬을 가정한 사람 측 효과 (outcomesBySkill).
 */
function buildOutcomes(state, data, human, role, actions, extraFx = null) {
  const enabled = actions.filter((a) => a.enabled);
  if (!enabled.length) return null;
  const out = {};
  for (const a of enabled) {
    out[a.action] = role === "attack"
      ? attackOutcome(state, data, human, a.action, { fx: extraFx })
      : defenseOutcome(state, data, human, a.action, { fx: extraFx });
  }
  return out;
}

/** passReceiver 결과 → view 용 { id, name, side, step, zone } (step/zone = 패스가 도착하는 단계·구역) */
function receiverView(player, line, side) {
  if (!player) return null;
  return { id: player.id, name: player.name, side, step: line, zone: zoneOf(side, line) };
}

/**
 * 지금 공격 팀의 패스 받는 선수 미리보기 (§12.1 receiverPreview). pass 가 불가능하면 null.
 * 공격 팀이 이미 pass 를 커밋했으면 커밋한 받는 선수. fx = 가정한 공격 효과(스킬 변형).
 */
function passPreview(state, data, fx = null) {
  if (!state || state.finished || state.phase === "penalties" || !state.ball || !state.duel) return null;
  const atk = state.attackingSide;
  const team = state[atk];
  const line = num(state.ball.lineIndex, 0);
  if (!team) return null;
  const carrier = findPlayer(team, state.ball.carrierId);
  if (!carrier) return null;
  const fxA = fx || fxOf(state, atk);
  // ④ 에서는 박스 연결(컷백) 받는 선수 — 도착 step 3 (공은 박스 그대로)
  if (!attackOptionsFor(state, data, atk, carrier, line, fxA).pass) return null;
  const plan = planFor(team, carrier, "pass", line, fxA);
  const choice = state.duel[atk + "Choice"];
  let player = null;
  if (!fx && choice && choice.action === "pass" && choice.receiverId) player = plan.candidates.find((p) => p.id === choice.receiverId) || null;
  if (!player) player = defaultFromPlan(state, data, atk, "pass", plan, fxA);
  return receiverView(player, plan.arrival, atk);
}

/** 공격 팀 receivers { pass?: { candidates, defaultId, arrival }, cross?: … } */
function receiversView(state, data, fx = null) {
  if (!state.duel || state.finished) return {};
  const atk = state.attackingSide;
  const team = state[atk];
  const carrier = findPlayer(team, state.ball.carrierId);
  const line = num(state.ball.lineIndex, 0);
  if (!carrier) return {};
  const fxA = fx || fxOf(state, atk);
  // ④ 박스 연결도 같은 모양 (arrival 3 = 지금 step, boxLink: true)
  const opts = attackOptionsFor(state, data, atk, carrier, line, fxA);
  const choice = state.duel[atk + "Choice"];
  const out = {};
  for (const a of ["pass", "cross"]) {
    if (!opts[a]) continue;
    const plan = planFor(team, carrier, a, line, fxA);
    let def = defaultFromPlan(state, data, atk, a, plan, fxA);
    if (!fx && choice && choice.action === a && choice.receiverId && plan.candidates.some((p) => p.id === choice.receiverId)) {
      def = plan.candidates.find((p) => p.id === choice.receiverId);
    }
    out[a] = { candidates: plan.candidates.map((p) => p.id), defaultId: def ? def.id : null, arrival: plan.arrival, zone: zoneOf(atk, plan.arrival) };
    if (plan.box) out[a].boxLink = true;
    // 필살 패스를 함께 쓸 때의 기본 받는 선수 (합체기 가치 반영) — 필살 패스를 쓸 수 있을 때만
    const u = getPlayerUltimate(data, carrier);
    if (!fx && u && u.ultimate.type === "pass" && ultimateUsable(state, data, atk, carrier, "attack", a).ok) {
      const ud = defaultFromPlan(state, data, atk, a, plan, fxPlusUlt(fxA, u, null));
      out[a].ultimateDefaultId = ud ? ud.id : null;
    }
  }
  return out;
}

/** 예상 행동 (§13.4 expected): 커밋한 AI 는 커밋 액션(판정 때 간파 교체 전), 아니면 지금 성향 1위 */
function expectedFor(state, data, side, role) {
  const duel = state.duel;
  const pid = role === "attack" ? state.ball.carrierId : duel.defenderId;
  const line = num(state.ball.lineIndex, 0);
  if (role === "defense" && line >= 3) return { playerId: pid, action: "save", values: {} };
  const choice = duel[side + "Choice"];
  const committed = choice && choice.action ? (choice.committedAction || choice.action) : null;
  const tc = tendCfg(matchCfg(data));
  // ④ 공격: 기대 골 규칙 (boxLinkEval — 값 = 기대 골 %, 자동 = 연결이 슛보다 클 때만)
  const box = role === "attack" && line >= 3 && !committed ? boxLinkEval(state, data, side) : null;
  const values = (choice && choice.values) || (box && boxTendency(box)) || tendencyValues(state, data, side, pid);
  const action = committed || (box && box.auto ? box.auto.action : null)
    || (role === "attack" ? pickByTendency(values, tc.tieA) || (line >= 3 ? "shoot" : "dribble") : pickByTendency(values, tc.tieD));
  const rounded = {};
  for (const [k, v] of Object.entries(values)) rounded[k] = Math.round(v);
  const out = { playerId: pid, action, values: rounded };
  // 패스·크로스면 받는 선수 (커밋했으면 커밋한 선수, ④ 자동이면 boxLinkEval 의 받는 선수)
  if (role === "attack" && (action === "pass" || action === "cross")) {
    let rid = committed && choice.receiverId ? choice.receiverId : null;
    if (!rid && line >= 3) {
      const ev = box || boxLinkEval(state, data, side);
      rid = ev[action] ? ev[action].receiverId : null;
    }
    out.receiverId = rid;
  }
  return out;
}

/**
 * view.boxLink: ④ 공격 팀 carrier 의 박스 연결 상황과 자동 규칙 — line 3 결정 대기 중만, 아니면 null.
 * 2026-09-29 기대 골 규칙: value = 기대 골 % (정수), exp = 기대 골 (0~1), 연결은 linkP(연결 성공) × finishP(받은 선수 다음 슛 골).
 * score = value (옛 이름 호환), forced 항상 false, ratio null (autoRatio 폐지).
 */
function boxLinkView(state, data) {
  const ball = state.ball || {};
  if (!state.duel || state.finished || state.phase !== "decision" || num(ball.lineIndex, 0) < 3) return null;
  const side = state.attackingSide;
  const ev = boxLinkEval(state, data, side);
  if (!ev.shoot) return null;
  const choice = state.duel[side + "Choice"];
  const opt = (o) => (o
    ? {
      receiverId: o.receiverId, value: Math.round(o.value), score: Math.round(o.score), exp: round6(o.exp),
      linkP: round6(o.linkP), finishP: round6(o.finishP), forced: false,
      ultimate: o.ultimate, receiverUltimate: o.receiverUltimate, combo: o.combo,
    }
    : null);
  return {
    side,
    used: !!ball.boxLinkUsed,
    available: !!(ev.pass || ev.cross),
    rule: "ev",
    ratio: null,
    gkMult: ev.gkMult,
    shoot: { value: Math.round(ev.shoot.value), exp: round6(ev.shoot.exp), ultimate: ev.shoot.ultimate, combo: ev.shoot.combo },
    pass: opt(ev.pass),
    cross: opt(ev.cross),
    evAuto: Object.assign({}, ev.auto),
    // 이미 커밋한 측(AI 는 판정 전에 먼저 커밋)은 커밋한 선택이 곧 자동 선택이다
    auto: choice && choice.action
      ? { action: choice.committedAction || choice.action, receiverId: choice.receiverId || null, ultimate: !!choice.ultimate }
      : Object.assign({}, ev.auto),
  };
}

/* ------------------------------------------------------------------ */
/* 에이스의 외침 (2026-09-29, 표시 전용 — 판정·AI·난수 불변)               */
/* ------------------------------------------------------------------ */

/**
 * view.aceCall: 지금 공격 팀 carrier 의 받는 선수 후보(패스 · 크로스, ④ 박스 연결 포함) 중 "공을 달라"고 외치는 선수 한 명.
 *  - reason "combo": carrier 의 필살 패스가 준비(또는 이번 듀얼에 커밋)됐고, 받는 선수의 필살기가 combos.json 에서 그 필살 패스와 합체기.
 *  - reason "gauge": 받는 선수의 필살 게이지 ≥ aceCallGauge (config.match.ultimate.aceCallGauge, 없으면 gaugeMax − onReceive
 *    = 받으면 가득) — 받은 뒤 필살기가 준비된다.
 *  두 경우 모두 받는 선수의 필살기가 받은 뒤 쓸 수 있는 종류여야 한다 (shot = line ≥ 2, pass = line ≤ 3 — ultTypeUsableAt,
 *  단 ④ 박스 연결로 받으면 연결을 이미 썼으므로 필살 패스는 제외).
 *  한 듀얼(비트)에 한 명: combo > gauge, 같으면 그 액션의 기본 받는 선수(combo 는 필살 패스를 쓴다고 본 기본값) → players 순서.
 *  공격 팀이 이미 커밋했으면(상대 AI 는 사람보다 먼저 커밋) 커밋한 액션 · 받는 선수만 후보 — 그 선수가 조건에 맞을 때만 외침,
 *  드리블 · 슛을 커밋했거나 다른 선수에게 보내면 null (상대 외침 = 실제로 공이 갈 곳, expected 는 늘 true).
 *  actions = 그 선수에게 닿는 액션(같은 이유) — ["pass"] · ["cross"] · ["pass", "cross"] (커밋한 측은 커밋한 액션 하나).
 *  expected = 공격 팀의 예상 공격(커밋한 선택, 없으면 자동 결정 ai.decideAttack)이 이 선수에게 가는가 — 정보 줄 "자동: ○○에게 연결 예정".
 *  결정적, 상대 선택을 보지 않는다(expected 는 공격 팀 자기 선택), 난수·상태 변경 없음.
 * @returns {null | { side, playerId, name, reason: "gauge"|"combo", actions: string[], arrival: number, boxLink: boolean,
 *   ultimateSkillId, ultimateName, ultimateType, comboName: string|null, passSkillId: string|null, gauge: number|null, threshold: number,
 *   expected: boolean, expectedAction: string|null }}
 */
export function aceCallFor(state, data) {
  if (!state || state.finished || state.phase !== "decision" || !state.duel || !state.ball) return null;
  const side = state.attackingSide;
  const team = state[side];
  const carrier = team ? findPlayer(team, state.ball.carrierId) : null;
  if (!carrier) return null;
  const uc = ultCfg(matchCfg(data));
  const line = num(state.ball.lineIndex, 0);
  const fx = fxOf(state, side);
  const opts = attackOptionsFor(state, data, side, carrier, line, fx);
  // carrier 의 필살 패스: 이번 듀얼에 커밋했으면 그것(AI 는 판정 전에 먼저 커밋 — 게이지 0), 아니면 지금 쓸 수 있는 필살 패스
  const own = getPlayerUltimate(data, carrier);
  const passSkillId = fx.ult
    ? (fx.ult.type === "pass" ? fx.ult.skillId : null)
    : (own && own.ultimate.type === "pass" ? own.id : null);
  const found = [];
  for (const a of ["pass", "cross"]) {
    if (!opts[a]) continue;
    const plan = planFor(team, carrier, a, line, fx);
    const passReady = !!passSkillId && (fx.ult ? true : ultimateUsable(state, data, side, carrier, "attack", a).ok);
    const fxU = passReady && !fx.ult ? fxPlusUlt(fx, own, null) : fx;
    // 합체기 외침은 필살 패스를 쓴 계획 (한 구역 더 가는 필살 패스면 도착이 다르다 — §19.3-2), 게이지 외침은 보통 계획
    const planU = fxU === fx ? plan : planFor(team, carrier, a, line, fxU);
    if (!plan.candidates.length && !planU.candidates.length) continue;
    const defIds = {
      combo: passReady ? (defaultFromPlan(state, data, side, a, planU, fxU) || {}).id : null,
      gauge: (defaultFromPlan(state, data, side, a, plan, fx) || {}).id,
    };
    // 받은 뒤 쓸 수 있는 필살기만: 도착 line 에서 쓸 수 있는 종류, 박스 연결로 받으면 연결을 이미 써서 필살 패스는 못 쓴다 (슛만)
    const usableAfter = (u, pl) => !!u && ultTypeUsableAt(u.ultimate, pl.arrival) && !(pl.box && u.ultimate.type === "pass");
    const comboIds = new Set();
    const push = (p, reason, u, cName, pl) => found.push({
      p, a, reason, u, cName, plan: pl,
      rank: [reason === "combo" ? 0 : 1, defIds[reason] === p.id ? 0 : 1, team.players.indexOf(p)],
    });
    if (passReady) {
      for (const p of planU.candidates) {
        const u = getPlayerUltimate(data, p);
        const cName = usableAfter(u, planU) ? comboName(data, passSkillId, u.id) : null;
        if (!cName) continue;
        comboIds.add(p.id);
        push(p, "combo", u, cName, planU);
      }
    }
    for (const p of plan.candidates) {
      if (comboIds.has(p.id)) continue;
      const u = getPlayerUltimate(data, p);
      if (!usableAfter(u, plan)) continue;
      // 게이지 외침(①)은 shot · pass 필살기만 (§19.3-11 — 새 종류는 외치지 않는다), 합체기 외침(②)은 등록된 짝만 (comboName)
      const gaugeType = u.ultimate.type === "shot" || u.ultimate.type === "pass";
      const g = gaugeOf(state, side, p.id);
      if (gaugeType && g != null && g >= uc.aceCall) push(p, "gauge", u, null, plan);
    }
  }
  if (!found.length) return null;
  // 예상 공격: 커밋한 측은 커밋한 선택, 아니면 자동 결정 (사람 측 자동 · 상대 AI 와 같은 ai.decideAttack — 순수, 난수 없음)
  const choice = state.duel[side + "Choice"];
  const committed = !!(choice && choice.action);
  // 커밋한 AI 가 간파 중이면 판정 때 우리 수비를 보고 액션을 바꾼다(bestAttackResponse) → "공이 갈 곳"을 확정할 수 없어 외치지 않는다
  if (committed && choice.byAI && state.duel.gaanpaSide === side) return null;
  const exp = committed
    ? { action: choice.committedAction || choice.action, receiverId: choice.receiverId || null }
    : (() => { const d = decideAttack(state, data, side); return { action: d.action, receiverId: d.receiverId || null }; })();
  // 이미 커밋한 측(상대 AI — 사람이 고르기 전에 먼저 커밋)은 실제로 보낼 선수만 외친다: 커밋한 액션(패스 · 크로스)의 받는 선수가
  // 조건에 맞을 때만, 드리블 · 슛을 커밋했거나 다른 선수에게 보내면 외침 없음 (수비하는 사람에게 "공이 갈 곳"이 틀리지 않게)
  const pool = committed ? found.filter((f) => f.a === exp.action && f.p.id === exp.receiverId) : found;
  if (!pool.length) return null;
  const cmp = (x, y) => x.rank[0] - y.rank[0] || x.rank[1] - y.rank[1] || x.rank[2] - y.rank[2];
  const best = pool.slice().sort(cmp)[0];
  const actions = pool.filter((f) => f.p === best.p && f.reason === best.reason).map((f) => f.a);
  const expected = actions.includes(exp.action) && exp.receiverId === best.p.id;
  return {
    side,
    playerId: best.p.id,
    name: best.p.name,
    reason: best.reason,
    actions,
    arrival: best.plan.arrival,
    boxLink: !!best.plan.box,
    ultimateSkillId: best.u.id,
    ultimateName: best.u.name,
    ultimateType: best.u.ultimate.type,
    comboName: best.cName || null,
    passSkillId: best.reason === "combo" ? passSkillId : null,
    gauge: gaugeOf(state, side, best.p.id),
    threshold: uc.aceCall,
    expected,
    expectedAction: expected ? exp.action : null,
  };
}

/* ------------------------------------------------------------------ */
/* GK 배급 뷰 (2026-09-29)                                                */
/* ------------------------------------------------------------------ */

/**
 * view.distribution: GK 배급 대기(phase "distribution") 중일 때 두 선택지의 확률 · 결과 미리보기, 아니면 null. 순수, 난수 없음.
 * 문구는 viewer(human) 시점 — 우리 배급이면 "상대 중원 공격", 상대 배급이면 "우리 중원 공격".
 * 마지막 포제션이라 롱패스가 막히면 경기가 끝나면 실패 문구 = "경기 종료" (fail.matchEnd — endForecast, 2026-09-30).
 * recommended = "상황 따라" 규칙(확률 ≥ longPassAutoMin, 자동이 쓸 캐논 킥 포함 — recommendedSkillId)의 선택 (배급 전술과 무관,
 *  전술이 auto 면 auto.action 과 같다). auto = 배급 전술을 따른 자동 선택.
 * @returns {null | { side, gkId, gkName, from, needsDecision, tactic, autoMin, order: ["short","long"],
 *   options: { short: Option, long: Option }, recommended, recommendedSkillId, auto: { action, skillId, p }, contest: { id, name, side },
 *   skills: Array<{ skillId, name, description, effect, tension, cost, enabled, reason, p, pct, nextDuelBonus }> }}
 *   Option = { action, label, p, pct, text, recommended, success: { zone, attackingSide, step, starterId, starterName, label, short },
 *              fail: null | { zone, attackingSide, step, contestId, label, short, matchEnd? } }
 */
function distributionView(state, data, human) {
  const d = state.distribution;
  if (!d || state.phase !== "distribution" || state.finished) return null;
  const m = matchCfg(data);
  const side = d.side;
  const opp = otherSide(side);
  const us = side === human;
  const team = state[side];
  const gk = findPlayer(team, d.gkId);
  if (!gk) return null;
  const lp = longPassOdds(state, data, side, { gkId: gk.id });
  const min = num(m.longPassAutoMin, 0.55);
  const auto = decideDistribution(state, data, side);
  // 추천 = "상황 따라" 규칙 (확률 기준 — 자동이 쓸 캐논 킥 포함, 배급 전술과 무관 · 2026-09-30). 전술이 auto 면 자동 선택과 같다
  const byRule = decideDistribution(state, data, side, { tactic: "auto" });
  const rec = byRule.action === "long" ? "long" : "short";
  const sStart = pickStarter(team, 0);
  const lStart = pickStarter(team, 1);
  const lpPct = pct(lp.p);
  const who = us ? "" : "상대 ";
  // 롱패스가 막히면: 평소 상대 중원 공격 (세컨드볼) — 마지막 포제션이라 경기가 끝나면 "경기 종료" · "승부차기",
  // 상대가 마지막 공격을 받으면 그 표시 (endForecast, 2026-09-30)
  const failFc = endForecast(state, data, opp);
  const failWho = us ? "상대" : "우리";
  const failShort = endsMatch(failFc) ? `실패 ${END_TEXT[failFc]}` : `실패 ${failWho} 중원 공격`;
  const failLabel = endsMatch(failFc)
    ? `롱패스 차단 — ${END_TEXT[failFc]}`
    : `세컨드볼 — ${failWho} 중원 공격${failFc === "lastAttack" ? ` (추가시간 — ${failWho} 마지막 공격)` : ""}`;
  const sureName = lp.sure ? skillName(data, lp.sureSkillId, "필살 세이브") : null;
  const options = {
    short: {
      action: "short", label: "짧은 패스", p: 1, pct: 100, recommended: rec === "short",
      text: us ? "짧은 패스 100% — 빌드업부터" : "상대 짧은 패스 — 상대 빌드업부터",
      success: {
        zone: zoneOf(side, 0), attackingSide: side, step: 0, starterId: sStart.id, starterName: sStart.name,
        label: `${who}빌드업부터 — ${sStart.name} 시작`, short: us ? "빌드업부터" : "상대 빌드업부터",
      },
      fail: null,
    },
    long: {
      action: "long", label: "롱패스", p: round6(lp.p), pct: lpPct, recommended: rec === "long",
      text: lp.sure
        ? (us ? `롱패스 확정 (${sureName}) — 중원부터` : `상대 롱패스 확정 (${sureName}) — 상대 중원부터`)
        : us ? `롱패스 ${lpPct}% — 성공 중원부터 / ${failShort}` : `상대 롱패스 ${lpPct}% — 성공 상대 중원부터 / ${failShort}`,
      bonus: lp.bonus || 0,
      ...(lp.sure ? { sure: true, sureSkillId: lp.sureSkillId, sureName } : {}),
      success: {
        zone: zoneOf(side, 1), attackingSide: side, step: 1, starterId: lStart.id, starterName: lStart.name,
        label: `${who}중원부터 — ${lStart.name} 시작`, short: us ? "성공 중원부터" : "성공 상대 중원부터",
      },
      fail: lp.sure ? null : Object.assign({
        zone: zoneOf(opp, 1), attackingSide: opp, step: 1, contestId: lp.contest ? lp.contest.id : null,
        label: failLabel, short: failShort,
      }, endsMatch(failFc) ? { matchEnd: failFc } : {}),
    },
  };
  const skills = distributionSkills(state, data, side).map(({ skill, check, cost }) => {
    const ps = longPassOdds(state, data, side, { skill, gkId: gk.id }).p;
    return {
      skillId: skill.id, name: skill.name, description: skill.description || "", effect: skill.active.effect,
      tension: num(skill.tension), cost, enabled: us && check.ok, reason: us ? check.reason : "결정 차례가 아님",
      p: round6(ps), pct: pct(ps), nextDuelBonus: num(skill.active.params && skill.active.params.nextDuelBonus, 0),
    };
  });
  return {
    side, gkId: gk.id, gkName: gk.name, from: d.from, needsDecision: us,
    tactic: (team.tactics && team.tactics.distribution) || "auto", autoMin: min,
    contest: lp.contest ? { id: lp.contest.id, name: lp.contest.name, side: opp } : null,
    order: ["short", "long"], options, recommended: rec, recommendedSkillId: rec === "long" ? byRule.skillId || null : null,
    auto: { action: auto.action, skillId: auto.skillId || null, p: round6(auto.p) },
    gkZone: gkZoneOf(side),
    skills,
    ...(lp.sure ? { sure: { skillId: lp.sureSkillId, name: sureName } } : {}),
  };
}

/**
 * UI용 뷰 (상태 변경 없음, 난수 소비 없음).
 * v0.2 필드 (§12.1): zone, attackStep, attackDir, remaining, receiverPreview, outcomes, outcomesBySkill, receiverPreviewBySkill, lastBeat.
 * v0.3 필드 (§13.4): version, expected, actions[].expectedPct/recommended, receivers, outcomesByReceiver, receiversBySkill,
 *  ultimate, ultimateOptions, gaanpa, opponentReading, ballState. 삭제: intent, revealToHome.
 * 2026-09-29 박스 연결: ④(lineIndex 3) actions 의 pass(label "컷백 패스") / cross(label "센터링") 가 켜질 수 있다
 *  (receivers / receiverPreview / outcomes / outcomesByReceiver / ultimateOptions(필살 패스) 도 ④ 에서 채워짐, arrival 3),
 *  expectedPct = 득점 기대 (연결 성공 × 받은 선수 원터치 슛·헤더 골). ballState.boxLinkUsed, boxLink(boxLinkView), expected.attack.receiverId.
 * 2026-09-29 에이스의 외침: aceCall (aceCallFor — 표시 전용, 판정·AI·난수에 영향 없음).
 * 2026-09-29 (사용자 결정 3~7): distribution (GK 배급 대기 — needsDecision "distribution"), lastAttack (마지막 공격 보장),
 *  ④ actions[].autoExpectedPct · 추천 = 자동(기대 골 규칙), boxLink.rule "ev" (value = 기대 골 %, exp · linkP · finishP).
 *  배급 대기 중에는 phase "distribution", duel 없음, carrier = 배급 GK (lineIndex 0), actions · skills 는 비고 lineLabel "우리/상대 GK 배급".
 */
export function getMatchView(state, data, humanSide = undefined) {
  const m = matchCfg(data);
  const human = humanSide || state.humanSide || "home";
  const opp = otherSide(human);
  const atk = state.attackingSide;
  const def = otherSide(atk);
  const atkTeam = state[atk];
  const defTeam = state[def];
  const ball = state.ball || {};
  const duel = state.duel;
  const line = num(ball.lineIndex, 0);
  const carrier = ball.carrierId ? findPlayer(atkTeam, ball.carrierId) : null;
  const defender = duel ? findPlayer(defTeam, duel.defenderId) : null;
  const need = humanNeedsDecision(state, human);
  const role = atk === human ? "attack" : "defense";
  const active = !state.finished && state.phase === "decision" && !!duel;
  const staminaMax = num(m.staminaMax, 100);
  const participant = active ? (role === "attack" ? carrier : defender) : null;
  const fxH = active ? fxOf(state, human) : emptyDuelEffects();
  const oppChoice = duel ? duel[opp + "Choice"] : null;
  const opponentReading = !!(active && line < 3 && duel.gaanpaSide === opp && oppChoice && oppChoice.byAI);

  // --- 액션 + 기대 % ---
  let actions = [];
  if (active) {
    actions = (role === "attack" ? getAttackActions(state, human, data) : getDefenseActions(state, human, data))
      .map((a) => Object.assign({}, a, { enabled: a.enabled && !!need, expectedPct: null, recommended: false }));
  }
  const expectedMap = (fx, list = actions) => {
    const out = {};
    for (const a of list) if (a.enabled) out[a.action] = pct(evaluateHuman(state, data, human, a.action, { fx }).exp);
    return out;
  };
  // 토글(스킬·필살기·간파)을 켰을 때의 액션 제목·약점 문구 { [action]: { label, hint } } — 버튼이 켠 효과와 반대로 말하지 않게
  const hintMap = (fx) => {
    const list = role === "attack" ? getAttackActions(state, human, data, fx) : getDefenseActions(state, human, data, fx);
    const out = {};
    for (const a of list) if (a.enabled) out[a.action] = { label: a.label, hint: a.hint };
    return out;
  };
  // 함성(rally) 등 상태를 바꾸는 액티브: 발동 뒤 가상 상태에서 평가 (체력 +, 제쳐짐 해제·커버 복구, 팀 판정 ×teamMult — 다음 슛까지).
  // 받는 선수는 실제 결정(commitChoice)처럼 발동 전 상태의 기본값.
  const expectedMapAfterActive = (sk) => {
    const s2 = stateAfterActive(state, data, human, participant.id, sk);
    const fxPre = fxPlusSkill(fxH, sk);
    const out = {};
    for (const a of actions) {
      if (!a.enabled) continue;
      let rid = null;
      if (role === "attack" && (a.action === "pass" || a.action === "cross")) {
        const r = receiverPlan(state, data, human, a.action, fxPre);
        rid = r.defaultPlayer ? r.defaultPlayer.id : null;
      }
      out[a.action] = pct(evaluateHuman(s2, data, human, a.action, { receiverId: rid }).exp);
    }
    return out;
  };
  if (need && active) {
    let best = null;
    let bv = -1;
    for (const a of actions) {
      if (!a.enabled) continue;
      const r = evaluateHuman(state, data, human, a.action, { fx: fxH });
      a.expectedPct = pct(r.exp);
      a.expected = round6(r.exp);
      if (r.exp > bv + 1e-12) {
        bv = r.exp;
        best = a;
      }
    }
    // ④ 공격 (2026-09-29): 추천 = 자동 선택 (기대 골 규칙 boxLinkEval — 자동이 쓸 필살기 포함).
    // autoExpectedPct = 자동 규칙이 본 기대 골 % (필살기를 쓸 수 없으면 expectedPct 와 같다)
    if (role === "attack" && line >= 3) {
      const ev = boxLinkEval(state, data, human);
      if (ev.auto) {
        for (const a of actions) if (a.enabled && ev[a.action]) a.autoExpectedPct = pct(ev[a.action].exp);
        const pick = actions.find((a) => a.enabled && a.action === ev.auto.action);
        if (pick) best = pick;
      }
    }
    if (best) best.recommended = true;
  }

  // --- 일반 액티브 ---
  let skills = [];
  if (active && participant) {
    skills = getPlayerActiveSkills(data, participant).map((sk) => {
      const chk = checkSkillUsable(state, data, human, participant.id, sk, role);
      const enabled = !!need && chk.ok;
      return {
        skillId: sk.id,
        name: sk.name,
        tension: num(sk.tension),
        cost: skillCost(state[human], sk),
        enabled,
        reason: need ? chk.reason : "결정 차례가 아님",
        description: sk.description || "",
        kind: sk.kind,
        effect: sk.active.effect,
        gaanpa: isGaanpaSkill(sk),
        expectedPct: enabled ? (needsStatePreview(sk) ? expectedMapAfterActive(sk) : expectedMap(fxPlusSkill(fxH, sk))) : null,
        actions: enabled ? hintMap(fxPlusSkill(fxH, sk)) : null,
      };
    });
  }

  // --- 필살기 ---
  const ultimate = { home: {}, away: {} };
  for (const side of ["home", "away"]) {
    for (const p of state[side].players) {
      const g = gaugeOf(state, side, p.id);
      if (g == null) continue;
      ultimate[side][p.id] = { gauge: g, ready: ultimateReady(state, data, side, p.id), combo: isComboReady(state, side, p.id) };
    }
  }
  const ultimateOptions = [];
  if (active && need && participant) {
    const us = getPlayerUltimate(data, participant);
    if (us) {
      const chk = ultimateUsable(state, data, human, participant, role, null);
      const t = us.ultimate.type;
      const usable = chk.ok && t !== "save";
      const cName = chk.combo && ball.comboFrom ? comboName(data, ball.comboFrom.skillId, us.id) || "합체기" : null;
      const combo = chk.combo && ball.comboFrom ? { name: cName, passerId: ball.comboFrom.playerId, passerSkillId: ball.comboFrom.skillId } : null;
      // 호환 액션: 슛 · 패스 actions · 드리블 · 수비 3종 · 팀 = 전부 (ultMatchesAction)
      const compatible = actions.filter((a) => a.enabled && ultMatchesAction(us.ultimate, a.action));
      ultimateOptions.push({
        playerId: participant.id, skillId: us.id, name: us.name, type: t, usable,
        // E5: 등급 · 컷인 대사 (버튼 title — 데이터에 있을 때)
        tier: us.ultimate.tier || null, cutinLine: us.ultimate.cutinLine || null,
        reason: usable ? null : t === "save" ? "GK 세이브에서 자동 발동" : chk.reason,
        comboName: cName || undefined,
        gauge: gaugeOf(state, human, participant.id),
        description: us.description || "",
        expectedPct: usable ? expectedMap(fxPlusUlt(fxH, us, combo), compatible) : null,
        actions: usable ? hintMap(fxPlusUlt(fxH, us, combo)) : null,
      });
    }
  }

  // --- 간파 ---
  let gaanpa = null;
  if (active) {
    const g = gaanpaStatus(state, data, human, true);
    gaanpa = Object.assign({}, g);
    if (!need) Object.assign(gaanpa, { usable: false, reason: g.usable ? "결정 차례가 아님" : g.reason });
    gaanpa.expectedPct = null;
    gaanpa.actions = null;
    if (gaanpa.usable) {
      const fxG = g.source === "skill" ? fxPlusSkill(fxH, getSkill(data, g.skillId)) : fxPlusTicket(fxH, role, data);
      gaanpa.expectedPct = expectedMap(fxG);
      gaanpa.actions = hintMap(fxG);
    }
  }

  let lineLabel;
  if (state.phase === "penalties") lineLabel = "승부차기";
  else if (state.phase === "distribution" && state.distribution) lineLabel = `${state.distribution.side === human ? "우리" : "상대"} GK 배급`;
  else if (line >= 3) lineLabel = role === "attack" ? "슛 vs 상대 GK" : "상대 슛 vs 우리 GK";
  else lineLabel = `${role === "attack" ? "상대" : "우리"} ${LINE_LABELS[line]} ${role === "attack" ? "돌파" : "수비"}`;

  const pen = state.penalties;

  // --- 위치 표현 (§12.1) ---
  const beat = lastBeatEvent(state);
  let posSide = atk;
  let attackStep = clamp(line, 0, 3);
  let kicker = null;
  if (pen && (state.phase === "penalties" || (state.finished && state.stage === "penalties"))) {
    // 승부차기: 다음 키커(종료 후엔 마지막 키커)가 노리는 박스
    const last = pen.kicks && pen.kicks.length ? pen.kicks[pen.kicks.length - 1] : null;
    const kSide = state.finished && last ? last.side : pen.turn;
    const order = (pen.order && pen.order[kSide]) || [];
    const kId = state.finished && last ? last.playerId : order.length ? order[pen.taken[kSide] % order.length] : null;
    const gkP = state[otherSide(kSide)].players.find((p) => p.position === "GK");
    kicker = { side: kSide, kickerId: kId, keeperId: gkP ? gkP.id : null };
    posSide = kSide;
    attackStep = 3;
  } else if (state.finished && beat && (beat.attackingSide === "home" || beat.attackingSide === "away")) {
    // 경기 종료 후: 마지막 비트가 일어난 위치 유지
    posSide = beat.attackingSide;
    attackStep = clamp(num(beat.step, attackStep), 0, 3);
  }
  const zone = zoneOf(posSide, attackStep);
  const receiverPreview = active ? passPreview(state, data) : null;
  const receivers = active ? receiversView(state, data) : {};
  const outcomes = need && duel ? buildOutcomes(state, data, human, role, actions) : null;

  // 받는 선수별 결과 (사람 공격 결정 중)
  let outcomesByReceiver = null;
  if (outcomes && role === "attack") {
    for (const a of ["pass", "cross"]) {
      if (!outcomes[a] || !receivers[a]) continue;
      if (!outcomesByReceiver) outcomesByReceiver = {};
      outcomesByReceiver[a] = {};
      for (const rid of receivers[a].candidates) {
        const o = attackOutcome(state, data, human, a, { receiverId: rid });
        o.expectedPct = pct(evaluateHuman(state, data, human, a, { receiverId: rid }).exp);
        outcomesByReceiver[a][rid] = o;
      }
    }
  }

  // 위치를 바꾸는 스킬(공격 extraLine / 수비 steal)을 이번 결정과 함께 쓸 때의 미리보기 (§12.1-2 보강).
  // 필살 패스도 받는 선수 기본값을 바꿀 수 있어(합체기 가치) 같은 맵에 필살기 skillId 로 넣는다 — 자동 진행 중 layout.resolvePreview 가
  // 수신자를 확정할 수 없음을 알 수 있게.
  let outcomesBySkill = null;
  let receiverPreviewBySkill = null;
  let receiversBySkill = null;
  if (outcomes) {
    const variants = [];
    for (const s of skills) {
      if (!s.enabled || s.effect !== POSITION_EFFECT[role]) continue;
      variants.push([s.skillId, fxPlusSkill(fxH, getSkill(data, s.skillId))]);
    }
    for (const u of ultimateOptions) {
      // 필살 패스(받는 선수 기본값 · 한 구역 더) · 필살 드리블(E4 — 한 구역 더 도착 구역)
      if (u.usable && (u.type === "pass" || u.type === "dribble")) variants.push([u.skillId, fxPlusUlt(fxH, getSkill(data, u.skillId), null)]);
    }
    for (const [id, fxS] of variants) {
      if (!outcomesBySkill) outcomesBySkill = {};
      outcomesBySkill[id] = buildOutcomes(state, data, human, role, actions, fxS);
      if (role === "attack") {
        if (!receiverPreviewBySkill) receiverPreviewBySkill = {};
        receiverPreviewBySkill[id] = passPreview(state, data, fxS);
        if (!receiversBySkill) receiversBySkill = {};
        receiversBySkill[id] = receiversView(state, data, fxS);
      }
    }
  }

  const expected = active
    ? { attack: expectedFor(state, data, atk, "attack"), defense: expectedFor(state, data, def, "defense") }
    : null;

  const personView = (p, side, team, extra) => (p
    ? Object.assign({
      id: p.id, name: p.name, side, stamina: liveStamina(team, p.id), staminaMax, position: p.position, slot: p.slot, style: p.style,
      portraitColor: p.portraitColor, trait: p.trait || null, gauge: gaugeOf(state, side, p.id),
    }, extra)
    : null);

  return {
    version: MATCH_VERSION,
    zone,
    attackStep,
    attackDir: posSide === "home" ? "up" : "down",
    remaining: remainingDefense(state, posSide, attackStep),
    receiverPreview,
    outcomes,
    outcomesBySkill,
    receiverPreviewBySkill,
    receiversBySkill,
    lastBeat: beat ? Object.assign({}, beat) : null,
    score: { home: state.score.home, away: state.score.away },
    possession: Math.min(state.possession, state.possessionsTotal),
    possessionsTotal: state.possessionsTotal,
    attackingSide: atk,
    humanSide: human,
    lineIndex: line,
    lineLabel,
    chain: num(ball.chain),
    extraLine: !!ball.extraLine,
    ballState: {
      oneTouch: !!ball.oneTouch, receivedVia: ball.receivedVia || null, receivedFresh: !!ball.receivedFresh,
      comboReadyId: ball.comboReadyId || null, pending: Object.assign(emptyPending(), ball.pending || {}),
      boxLinkUsed: !!ball.boxLinkUsed,
    },
    boxLink: active ? boxLinkView(state, data) : null,
    // 에이스의 외침 (표시 전용): 받으면 필살기 준비 · 합체기가 되는 받는 선수 한 명 (양 팀 공격 모두) — aceCallFor
    aceCall: active ? aceCallFor(state, data) : null,
    // GK 배급 대기 (phase "distribution", 2026-09-29) — distributionView
    distribution: distributionView(state, data, human),
    // 마지막 공격 보장 (2026-09-29): 준 포제션 { side, stage, possession, active } (active = 지금 그 포제션 진행 중)
    lastAttack: state.lastAttack
      ? Object.assign({}, state.lastAttack, { active: !state.finished && state.possession === state.lastAttack.possession })
      : null,
    stage: state.stage,
    kind: state.kind,
    names: { home: state.home.name, away: state.away.name },
    carrier: personView(carrier, atk, atkTeam, {}),
    defender: personView(defender, def, defTeam, defender ? { coverCount: num(duel.coverCount) } : {}),
    needsDecision: need,
    actions,
    // 짝 표 (공격 → 그것을 읽는 수비). UI 의 "짝" 칩은 이 값을 쓴다 (2026-09-29: 크로스 ↔ 버티기)
    counter: Object.assign({}, COUNTER),
    skills,
    expected,
    receivers,
    outcomesByReceiver,
    ultimate,
    ultimateOptions,
    gaanpa,
    opponentReading,
    tension: { home: state.home.tension, away: state.away.tension },
    tensionMax: num(m.tension && m.tension.max, 100),
    gaanpaTickets: { home: num(state.home.gaanpaTickets, 0), away: num(state.away.gaanpaTickets, 0) },
    players: { home: playersView(state.home, state, "home", m, data), away: playersView(state.away, state, "away", m, data) },
    recentEvents: state.events.slice(-6),
    phase: state.phase,
    finished: !!state.finished,
    result: state.result,
    penalties: pen
      ? {
        home: pen.home, away: pen.away, turn: pen.turn, taken: { home: pen.taken.home, away: pen.taken.away }, suddenDeath: pen.suddenDeath,
        // v0.2 추가: 레이아웃용 — 다음 키커(종료 후엔 마지막 키커)와 그 상대 GK
        kickerSide: kicker ? kicker.side : pen.turn,
        kickerId: kicker ? kicker.kickerId : null,
        keeperId: kicker ? kicker.keeperId : null,
      }
      : null,
  };
}
