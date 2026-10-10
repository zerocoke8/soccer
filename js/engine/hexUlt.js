/**
 * hexUlt.js — 육각 오토배틀 엔진의 필살기 (HEX_AUTOBATTLE_PLAN §3 · 결정 1 · 8 · 14 · 18, H3)
 *
 * hexMatch.js 가 부르는 순수 모듈. 난수 없음 · 상태는 JSON 만 · 불러오는 것: ./skills.js (ultPassActions) · ./hexGrid.js.
 * 예전 match.js 의 validateUltimates 는 부르지 않는다 (문서 §3 — 육각은 minLine 등을 자기 뜻으로 읽는다). 쓰는 키만 읽고
 * 모르는 키 · 모르는 type · 없는 스킬 id 는 건너뛴다.
 *
 * 상태 (hexMatch 가 만든다):
 *  - state.live[side][id].gauge · armed — 필살기를 가진 선수만 (킥오프로 live 를 다시 만들 때도 옮긴다).
 *    .combo { passerId, skillId, name, until } (합체기 대기) · .nextBonus { bonus, until } (다음 겨루기 공격 +) ·
 *    .sureDist (확실한 배급) — 있을 때만.
 *  - state.teamUlt[side] = { playerId, skillId, mult, until } | null (팀 필살기 — until 턴까지).
 *  - state.aiSides = AI 규칙으로 필살기를 켜는 쪽 (createMatch: 사람이 아닌 쪽, simulateAuto · ⏭ = 양쪽).
 *
 * 한 턴 (문서 §2.2-1): beginTurn = 만료 정리 → 입력 { ultimates: [{ side, playerId, op: "arm" | "disarm" }] } → AI 규칙.
 * 켠 필살기는 그 유형의 첫 상황에서 저절로 터진다 (지금 쓰기 · 예약, 결정 8). 팀 필살기는 켜는 턴에 바로.
 * 터질 때 fire → 게이지 0 (합체기면 그대로) · 컷인 이벤트 · stats.ultimatesUsed (+ combos).
 *
 * [구현 결정] (H3):
 *  - 배수는 그 겨루기의 판정 식 (hexMatch pKeep · pPass · pAerial · pShot) 안에서 곱한다 → decide() 의 기대값과 실제 굴림이 같다.
 *    겨루기 값을 먼저 구하고 (켠 상태로) 그다음 fire 한다 (fire 가 armed 를 끈다).
 *  - 필살 크로스 (뇌전 화살) 의 attack 은 공중볼 겨루기에 곱한다 (크로스는 땅 가로채기가 없어서).
 *  - 필살기를 쓴 선수는 그 겨루기에서 게이지를 얻지 않는다 — 이번 턴 게이지 전부 (턴 게이지 포함), 필살 패스면 그 패스로 얻는 것도.
 *  - 합체기 대기 중 받은 선수가 이미 켜 둔 필살기도 합체기로 터진다 (게이지 그대로 · ×comboBonus) — 크로스 도착 헤더처럼
 *    받는 턴에 바로 슛하는 경우.
 *  - 지키기 태클을 버텨도 "드리블 돌파" 와 같은 겨루기 승 (게이지 +gaugeDuelWin) 으로 센다 (duelsWon 과 같은 자리).
 *  - 게이지가 안 찬 채 켠 것 (합체기로만 켬) 은 턴 시작마다 합체기 대기가 살아 있는지 본다 — 없으면 끈다 (게이지 그대로).
 *    골 킥오프로 대기 (combo) 가 사라져도 같다 (H3 리뷰 ENG-1).
 *  - 크로스 도착 헤더는 받는 턴에 바로 판정이라 켤 턴 경계가 없다 → 합체기 대기가 생긴 받는 선수는 (사람 쪽도) 저절로 켜 합체기로
 *    쏜다 (autoComboHeader — 게이지를 쓰지 않으니 손해가 없다, H3 리뷰 ENG-2).
 *  - 역컷인에는 막힌 필살기 { skillId, ultimateType, combo } 를 싣는다 (여러 턴 나는 필살 패스도 화면이 이름을 안다 — 예전 엔진처럼).
 */

import { ultPassActions } from "./skills.js";
import * as G from "./hexGrid.js";

/** 컷인 · 결과 글의 유형 이름 (예전 match.ULT_TYPE_TEXT 와 같은 글) */
export const ULT_TYPE_TEXT = Object.freeze({ shot: "필살 슛", pass: "필살 패스", save: "필살 세이브", dribble: "필살 드리블", defense: "필살 수비", team: "필살 호령" });
/** 역컷인 글 (예전 match.REVERSE_CUTIN_TEXT 와 같은 글) */
export const REVERSE_CUTIN_TEXT = Object.freeze({ save: "기적의 세이브!", block: "철벽 블록!", passCut: "필살 패스 차단!" });
/** data.combos 가 없을 때 (예전 match.DEFAULT_COMBOS 와 같은 값) */
export const DEFAULT_COMBOS = Object.freeze([Object.freeze({ a: "sk_wind_thread", b: "sk_meteor_shot", name: "바람의 유성" })]);
/** 육각이 아는 필살기 유형 */
export const ULT_TYPES = Object.freeze(["shot", "pass", "save", "defense", "team", "dribble"]);

const SIDES = ["home", "away"];
/** AI 패스 필살기: 공격 진영 (자기 진영 열 ≥ 이 값) 이면 켠다 */
const ATTACK_HALF_COL = 7;

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}
function otherSide(side) {
  return side === "home" ? "away" : "home";
}
const round1 = (x) => Math.round(x * 10) / 10;

/* ------------------------------------------------------------------ */
/* 데이터                                                                */
/* ------------------------------------------------------------------ */

const SKILL_INDEX = new WeakMap();
function skillIndex(data) {
  const arr = data && Array.isArray(data.skills) ? data.skills : null;
  if (!arr) return null;
  let idx = SKILL_INDEX.get(arr);
  if (!idx) {
    idx = new Map();
    for (const sk of arr) if (sk && sk.id != null && !idx.has(sk.id)) idx.set(sk.id, sk);
    SKILL_INDEX.set(arr, idx);
  }
  return idx;
}

/**
 * 선수의 필살기 스킬 (skillIds 중 kind "unique" + ultimate 객체인 첫 스킬 — skills.getPlayerUltimate 와 같은 고르기).
 * 유스 · 없는 스킬 id 는 건너뛰고 (육각은 검사하지 않는다), 육각이 모르는 type 이면 없음.
 * @returns {object|null} 스킬 객체
 */
export function ultSkillOf(data, player) {
  if (!player || player.isYouth || !Array.isArray(player.skillIds)) return null;
  const idx = skillIndex(data);
  if (!idx) return null;
  for (const sid of player.skillIds) {
    const sk = idx.get(sid);
    if (sk && sk.kind === "unique" && sk.ultimate && typeof sk.ultimate === "object" && !Array.isArray(sk.ultimate)) {
      return ULT_TYPES.includes(sk.ultimate.type) ? sk : null;
    }
  }
  return null;
}

/** config.match.ultimate → { start, max, comboBonus } (게이지 시작 · 최대 · 합체기 배수) */
export function ultCfg(data) {
  const u = (data && data.config && data.config.match && data.config.match.ultimate) || {};
  const max = Math.max(1, num(u.gaugeMax, 100));
  return { start: Math.min(max, Math.max(0, num(u.gaugeStart, 30))), max, comboBonus: Math.max(0, num(u.comboBonus, 1.2)) };
}

/** 합체기 표 (data.combos, 없으면 DEFAULT_COMBOS) */
export function combosOf(data) {
  return data && Array.isArray(data.combos) ? data.combos : DEFAULT_COMBOS;
}
/** 패스 필살기 a → 받는 선수 필살기 b 의 합체기 이름 (방향이 있다) 또는 null */
export function comboName(data, a, b) {
  const c = combosOf(data).find((x) => x && x.a === a && x.b === b);
  return c ? c.name || "합체기" : null;
}

function findPlayer(state, side, id) {
  const t = state[side];
  return t && Array.isArray(t.players) ? t.players.find((p) => p.id === id) || null : null;
}
function liveOf(state, side, id) {
  return (state.live && state.live[side] && state.live[side][id]) || null;
}
function isHolder(state, side, id) {
  const h = state.ball && state.ball.holder;
  return !!(h && h.side === side && h.id === id);
}
/** 자기 진영 열 (0 = 자기 골 쪽) — hexMatch ocOf 와 같은 뜻 */
function ocOf(cell, side) {
  const [c, r] = G.cellCR(cell);
  return side === "home" ? c : G.mirrorCR(c, r)[0];
}
function ballCell(state) {
  const b = state.ball;
  if (b.holder) return state.pos[b.holder.side][b.holder.id];
  return b.cell;
}

/* ------------------------------------------------------------------ */
/* 게이지                                                                 */
/* ------------------------------------------------------------------ */

/** createMatch: 필살기를 가진 선수에게 게이지 (gaugeStart) · armed false. 팀 필살기 자리 · AI 쪽도 만든다 */
export function initUltState(state, data, aiSides) {
  const uc = ultCfg(data);
  for (const s of SIDES) {
    for (const p of state[s].players) {
      const lv = liveOf(state, s, p.id);
      if (!lv || !ultSkillOf(data, p)) continue;
      lv.gauge = uc.start;
      lv.armed = false;
    }
  }
  state.teamUlt = { home: null, away: null };
  state.aiSides = aiSides.slice();
}

/** 킥오프가 state.live 를 다시 만들 때: 게이지 · 켬은 옮긴다 (합체기 대기 · 다음 겨루기 보너스 · 확실한 배급은 공이 바뀌어 끝) */
export function carryLive(prev, lv) {
  if (prev && typeof prev.gauge === "number") {
    lv.gauge = prev.gauge;
    lv.armed = !!prev.armed;
  }
}

/** 게이지 + amount (0 ~ max, 소수 1자리). 게이지가 없는 선수 · 이번 턴 필살기를 쓴 선수는 그대로 */
export function gain(K, side, id, amount) {
  if (!(amount > 0)) return;
  const lv = liveOf(K.state, side, id);
  if (!lv || typeof lv.gauge !== "number") return;
  if (K.fired && K.fired[side + ":" + id]) return;
  lv.gauge = round1(Math.min(K.uc.max, lv.gauge + amount));
}

/** 턴 게이지: 경기장에 있는 필살기 선수 모두 +gaugePerTurn (이번 턴 쓴 선수 빼고) */
export function tickGauges(K) {
  for (const s of SIDES) for (const id of K.state.order[s]) gain(K, s, id, K.cfg.gaugePerTurn);
}

/* ------------------------------------------------------------------ */
/* 켬 · 터짐                                                               */
/* ------------------------------------------------------------------ */

/** 합체기 대기가 지금 살아 있나 (until 턴까지 · 공을 갖고 있는 동안) */
export function comboReady(state, side, id, T) {
  const lv = liveOf(state, side, id);
  return !!(lv && lv.combo && lv.combo.until >= T && isHolder(state, side, id));
}

/** 팀 필살기가 T 턴에 켜져 있나 */
export function teamActive(state, side, T) {
  const t = state.teamUlt && state.teamUlt[side];
  return !!(t && t.until >= T);
}

/**
 * 켜기 검사 (순수): { ok, reason, skill, combo }. 게이지가 차 있거나 합체기 대기일 때만 · 승부차기 · 끝난 경기 · 이미 켬 ·
 * 팀 필살기 발동 중 (겹치지 않음) 이면 안 된다.
 */
export function armCheck(state, data, side, id, T) {
  const no = (reason, skill = null) => ({ ok: false, reason, skill, combo: false });
  if (!SIDES.includes(side)) return no("편이 잘못됨");
  const p = findPlayer(state, side, id);
  const skill = p ? ultSkillOf(data, p) : null;
  if (!skill) return no("필살기 없음");
  const lv = liveOf(state, side, id);
  if (!lv || typeof lv.gauge !== "number") return no("게이지 없음", skill);
  if (state.finished) return no("경기 끝", skill);
  if (state.stage === "penalties") return no("승부차기", skill);
  if (lv.armed) return no("이미 켬", skill);
  if (skill.ultimate.type === "team" && teamActive(state, side, T)) return no("팀 필살기 발동 중", skill);
  const combo = comboReady(state, side, id, T);
  if (!combo && lv.gauge < ultCfg(data).max) return no("게이지 부족", skill);
  return { ok: true, reason: "", skill, combo };
}

/** 켬 (받아들였으면 true). 팀 필살기는 그 자리에서 터진다 */
export function arm(K, side, id) {
  const chk = armCheck(K.state, K.data, side, id, K.T);
  if (!chk.ok) return false;
  liveOf(K.state, side, id).armed = true;
  if (chk.skill.ultimate.type === "team") fireTeam(K, side, id);
  return true;
}

/** 끔 (게이지 그대로) */
export function disarm(K, side, id) {
  const lv = liveOf(K.state, side, id);
  if (!lv || !lv.armed) return false;
  lv.armed = false;
  return true;
}

/**
 * 켠 필살기 정보 — 그 유형일 때만: { skill, u, combo }. combo = 지금 합체기 대기 (×comboBonus, 게이지 그대로).
 */
export function armedOf(K, side, id, type) {
  const lv = liveOf(K.state, side, id);
  if (!lv || !lv.armed) return null;
  const skill = ultSkillOf(K.data, findPlayer(K.state, side, id));
  if (!skill || skill.ultimate.type !== type) return null;
  return { skill, u: skill.ultimate, combo: comboReady(K.state, side, id, K.T) };
}

/** 필살기 위력 배수 (키 값 × 합체기 배수) */
function powerOf(K, info, key) {
  return num(info.u[key], 1) * (info.combo ? K.uc.comboBonus : 1);
}

function pushEvent(state, turn, ev) {
  state.events.push(Object.assign({ turn }, ev));
}

/**
 * 터짐: 게이지 0 (합체기면 그대로) · armed 끔 · 컷인 (+ 합체기) 이벤트 · 기록. 이번 턴 게이지를 막는다.
 * @returns {{ skillId: string, type: string, combo: boolean }}
 */
export function fire(K, side, id) {
  const st = K.state;
  const lv = liveOf(st, side, id);
  const skill = ultSkillOf(K.data, findPlayer(st, side, id));
  const u = skill.ultimate;
  const combo = comboReady(st, side, id, K.T) ? lv.combo : null;
  if (!combo) lv.gauge = 0;
  lv.armed = false;
  if (lv.combo) lv.combo = null;
  K.fired[side + ":" + id] = true;
  st.stats[side].ultimatesUsed += 1;
  pushEvent(st, K.T, {
    type: "cutin", side, playerId: id, skillId: skill.id, ultimateType: u.type,
    tier: u.tier || null, line: u.cutinLine || null, combo: !!combo,
  });
  if (combo) {
    st.stats[side].combos += 1;
    pushEvent(st, K.T, { type: "combo", side, name: combo.name, skillIds: [combo.skillId, skill.id], playerIds: [combo.passerId, id] });
  }
  return { skillId: skill.id, type: u.type, combo: !!combo };
}

/** 팀 필살기: 켜는 턴에 바로 — teamUltTurns 턴 동안 팀 공격 · 수비 값 × teamMult (겹치지 않음). teamStamina = H4 */
function fireTeam(K, side, id) {
  const skill = ultSkillOf(K.data, findPlayer(K.state, side, id));
  const mult = Math.max(0, num(skill.ultimate.teamMult, 1));
  fire(K, side, id);
  // H4: teamStamina (팀 전원 체력 +)
  K.state.teamUlt[side] = { playerId: id, skillId: skill.id, mult, until: K.T + Math.max(1, Math.round(K.cfg.teamUltTurns)) - 1 };
}

/**
 * 역컷인 (실패한 겨루기 이벤트에 붙인다): kind = save | block | passCut, side · playerId = 막은 쪽 · 선수.
 * used = 막힌 필살기 { skillId, ultimateType, combo } (화면 카드의 "… 차단 · 봉쇄" 이름 — 없으면 화면이 같은 턴 cutin 으로 찾는다).
 */
export function reverseCutin(kind, side, playerId, used = null) {
  const rc = { kind, side, playerId, text: REVERSE_CUTIN_TEXT[kind] };
  if (used && used.skillId) Object.assign(rc, { skillId: used.skillId, ultimateType: used.ultimateType || null, combo: !!used.combo });
  return rc;
}
/** armedOf 정보 → 역컷인의 막힌 필살기 */
export function usedOf(info) {
  return info ? { skillId: info.skill.id, ultimateType: info.u.type, combo: !!info.combo } : null;
}

/* ------------------------------------------------------------------ */
/* 겨루기 배수 (hexMatch 의 판정 식이 부른다 — 켠 상태 기준, 터지기 전)          */
/* ------------------------------------------------------------------ */

/** 팀 필살기 배수 (공격 · 수비 값 모두) */
export function teamMult(K, side) {
  return teamActive(K.state, side, K.T) ? num(K.state.teamUlt[side].mult, 1) : 1;
}

/** 다음 겨루기 보너스 (받은 필살 패스의 nextDuelBonus) 배수 */
export function nextBonusMult(K, side, id) {
  const lv = liveOf(K.state, side, id);
  return lv && lv.nextBonus && lv.nextBonus.until >= K.T ? 1 + num(lv.nextBonus.bonus, 0) : 1;
}

/** 다음 겨루기 보너스를 쓴다 (그 겨루기의 배수를 돌려주고 지운다) */
export function takeNextBonus(K, side, id) {
  const m = nextBonusMult(K, side, id);
  const lv = liveOf(K.state, side, id);
  if (lv && lv.nextBonus) lv.nextBonus = null;
  return m;
}

/** 수비 값 배수: 켠 필살 수비 (defense) × 팀 필살기 */
export function defMult(K, side, id) {
  const d = armedOf(K, side, id, "defense");
  return (d ? Math.max(0, num(d.u.defense, 1)) : 1) * teamMult(K, side);
}

/**
 * 슛에 터질 필살 슛 (켠 상태 + minLine 3 이면 박스 슛만) 또는 null.
 * minLine 은 육각에서 "박스 안 (골까지 거리 ≤ BOX_DIST)" 만 뜻한다 (2 = 제한 없음).
 * far = 필살 슛 거리 (hexMatch ultShotRange — 예전 슛 사거리) 밖 → 터지지 않고 켠 채로 (보통 슛 사거리가 늘어도 필살 슛은 예전 거리에서).
 */
export function shotUltOf(K, side, id, box, far = false) {
  const a = armedOf(K, side, id, "shot");
  if (!a) return null;
  if (num(a.u.minLine, 2) >= 3 && !box) return null;
  if (far) return null;
  return a;
}

/**
 * 슛 · 헤더 겨루기 배수: { att, def, boxShot, shot, save } — shot/save = 터질 필살기 정보 (없으면 null).
 * att = shoot (× headerMult 헤더) × 합체기 × 다음 겨루기 × 팀, def = gkMult × saveMult × 팀,
 * boxShot = 박스 밖에서도 박스 계수 (문서 §10 "파이널 서드에서도 박스 슛 취급") — 먼 슛 깎임 (longShotDecay) 도 없다.
 * far = shotUltOf 와 같다 (필살 슛 거리 밖이면 필살 슛 없음).
 */
export function shotMods(K, side, shooterId, gkSide, gkId, box, header, far = false) {
  const shot = shotUltOf(K, side, shooterId, box, far);
  const save = armedOf(K, gkSide, gkId, "save");
  let att = teamMult(K, side) * nextBonusMult(K, side, shooterId);
  let def = teamMult(K, gkSide);
  if (shot) {
    att *= Math.max(0, powerOf(K, shot, "shoot")) * (header ? Math.max(0, num(shot.u.headerMult, 1)) : 1);
    def *= Math.min(1, Math.max(0, num(shot.u.gkMult, 1)));
    // H4: stamina (필살 슛 체력 소모)
  }
  if (save) def *= Math.max(0, num(save.u.saveMult, 1));
  return { att, def, boxShot: !!(shot && shot.u.boxShot), shot, save };
}

/**
 * 태클 겨루기 배수 (공 지키기): { att, def, negate, auto, drib, defUlt }.
 * 필살 드리블 (드리블일 때만): attack × 합체기, negateRead = 옆 수비 +10% 없음, extraLine = 태클이 저절로 실패 (굴림 없음, [가정]).
 */
export function keepMods(K, side, carrierId, defSide, tacklerId, action) {
  const drib = action === "dribble" ? armedOf(K, side, carrierId, "dribble") : null;
  const defUlt = armedOf(K, defSide, tacklerId, "defense");
  let att = teamMult(K, side) * nextBonusMult(K, side, carrierId);
  if (drib) att *= Math.max(0, powerOf(K, drib, "attack"));
  // H4: noStamina (필살 드리블 체력 0)
  return { att, def: defMult(K, defSide, tacklerId), negate: !!(drib && drib.u.negateRead), auto: !!(drib && drib.u.extraLine), drib, defUlt };
}

/** 이 행동 (pass · cross) 에 터질 필살 패스 정보 또는 null */
export function passUltOf(K, side, id, action) {
  const a = armedOf(K, side, id, "pass");
  return a && ultPassActions(a.u).includes(action) ? a : null;
}

/** 패스 기대값용 배수 (decide): { att, negate } — 켠 필살 패스 · 다음 겨루기 · 팀 */
export function passMods(K, side, id, action) {
  const a = passUltOf(K, side, id, action);
  return {
    att: teamMult(K, side) * nextBonusMult(K, side, id) * (a ? Math.max(0, powerOf(K, a, "attack")) : 1),
    negate: !!(a && a.u.negateRead),
  };
}

/** 날아가는 패스의 배수 (가로채기 · 공중볼): 쏠 때 정한 필살 패스 · 다음 겨루기 + 지금 팀 필살기 */
export function flightMods(K, f) {
  return {
    att: teamMult(K, f.side) * num(f.bonus, 1) * (f.ult ? num(f.ult.attack, 1) : 1),
    negate: !!(f.ult && f.ult.negate),
  };
}

/** 패스가 떠날 때: 필살 패스면 터뜨리고 비행에 실을 정보 (없으면 null) */
export function launchUlt(K, side, id, action) {
  const a = passUltOf(K, side, id, action);
  if (!a) return null;
  const attack = Math.max(0, powerOf(K, a, "attack"));
  const fired = fire(K, side, id);
  return {
    playerId: id,
    skillId: a.skill.id,
    combo: fired.combo,
    attack,
    negate: !!a.u.negateRead,
    extraLeft: a.u.extraLine ? 1 : 0,
    nextDuelBonus: Math.max(0, num(a.u.nextDuelBonus, 0)),
    receiverGauge: a.u.receiverGauge == null ? null : Math.max(0, num(a.u.receiverGauge, 0)),
  };
}

/**
 * 패스를 받았을 때 (receive): 게이지 (+gaugeReceive, 필살 패스면 receiverGauge) · 다음 겨루기 보너스 · 합체기 대기.
 * f = 도착한 비행 (receive 가 지우기 전).
 */
export function onReceive(K, side, id, f) {
  const fu = f && f.side === side ? f.ult : null;
  gain(K, side, id, fu && fu.receiverGauge != null ? fu.receiverGauge : K.cfg.gaugeReceive);
  if (!fu) return;
  const lv = liveOf(K.state, side, id);
  if (fu.nextDuelBonus > 0) lv.nextBonus = { bonus: fu.nextDuelBonus, until: K.T + Math.max(1, Math.round(K.cfg.nextBonusTurns)) };
  const rs = ultSkillOf(K.data, findPlayer(K.state, side, id));
  const name = rs ? comboName(K.data, fu.skillId, rs.id) : null;
  if (name && typeof lv.gauge === "number") {
    lv.combo = { passerId: fu.playerId, skillId: fu.skillId, name, until: K.T + Math.max(1, Math.round(K.cfg.comboReadyTurns)) };
  }
}

/* ------------------------------------------------------------------ */
/* 턴 시작: 만료 → 입력 → AI                                                */
/* ------------------------------------------------------------------ */

/**
 * 턴 시작 (문서 §2.2-1). input = { ultimates: [{ side, playerId, op: "arm" | "disarm" }] } — 순서대로, 안 되는 것은 조용히 무시.
 * 그다음 state.aiSides 의 AI 규칙.
 */
export function beginTurn(K, input) {
  const st = K.state;
  for (const s of SIDES) {
    if (st.teamUlt[s] && st.teamUlt[s].until < K.T) st.teamUlt[s] = null;
    for (const id of st.order[s]) {
      const lv = st.live[s][id];
      if (lv.combo && (lv.combo.until < K.T || !isHolder(st, s, id))) lv.combo = null;
      // 합체기로만 켰던 것 (게이지가 안 참) 은 대기가 끝나면 꺼진다 (게이지 그대로). 골 킥오프로 대기가 사라진 경우도 (carryLive 는 combo 를 옮기지 않는다)
      if (lv.armed && typeof lv.gauge === "number" && lv.gauge < K.uc.max && !comboReady(st, s, id, K.T)) lv.armed = false;
      if (lv.nextBonus && lv.nextBonus.until < K.T) lv.nextBonus = null;
      if (lv.sureDist && !isHolder(st, s, id)) lv.sureDist = false;
    }
  }
  const list = input && Array.isArray(input.ultimates) ? input.ultimates : [];
  for (const x of list) {
    if (!x || !SIDES.includes(x.side) || x.playerId == null) continue;
    const pid = String(x.playerId);
    if (x.op === "arm") arm(K, x.side, pid);
    else if (x.op === "disarm") disarm(K, x.side, pid);
  }
  for (const s of SIDES) if (st.aiSides.includes(s)) aiArm(K, s);
}

/** 정규 마지막 aiUltLastTurns 턴 · 골든골 · 추가시간 */
function lateGame(K) {
  const st = K.state;
  if (st.stage === "goldenGoal" || st.stage === "addedTime") return true;
  return st.stage === "regular" && K.T > st.stageEndTurn - Math.max(0, Math.round(K.cfg.aiUltLastTurns));
}

/** 같은 편에 이 패스 필살기의 합체기 짝 (b) 이 있나 */
function partnerOnPitch(K, side, id, skillId) {
  for (const pid of K.state.order[side]) {
    if (pid === id) continue;
    const sk = ultSkillOf(K.data, findPlayer(K.state, side, pid));
    if (sk && comboName(K.data, skillId, sk.id)) return true;
  }
  return false;
}

/**
 * AI 규칙 (문서 §3 — 남은 턴 · 골까지 거리로 다시 쓴 aiWantsUltimate). 켜기는 공짜, 터지는 것은 상황이 와야.
 * 합체기 대기 → 켬 / 마지막 50턴 · 골든골 · 추가시간 → 준비된 것 모두 / shot · dribble · save → 준비되면 /
 * pass → 준비 + (우리 공이 공격 진영 (자기 진영 열 ≥ 7) 이거나 합체기 짝이 경기장에 있음) /
 * defense → 준비 + 공 가진 상대가 우리 진영 (열 < 7) / team → 준비 + 지고 있음.
 */
export function aiWants(K, side, id) {
  const st = K.state;
  const chk = armCheck(st, K.data, side, id, K.T);
  if (!chk.ok) return false;
  if (chk.combo) return true;
  if (lateGame(K)) return true;
  const t = chk.skill.ultimate.type;
  if (t === "shot" || t === "dribble" || t === "save") return true;
  const b = st.ball;
  if (t === "pass") {
    const ours = !!((b.holder && b.holder.side === side) || (b.flight && b.flight.side === side));
    return (ours && ocOf(ballCell(st), side) >= ATTACK_HALF_COL) || partnerOnPitch(K, side, id, chk.skill.id);
  }
  if (t === "defense") return !!(b.holder && b.holder.side !== side && ocOf(ballCell(st), side) < ATTACK_HALF_COL);
  if (t === "team") return st.score[side] < st.score[otherSide(side)];
  return false;
}

/**
 * 크로스 도착 헤더 직전 (hexMatch arrive): 받는 선수가 방금 합체기 대기가 됐고 아직 안 켰으면 켠다 — 양쪽 모두 ([구현 결정] 맨 위).
 * 받는 턴에 바로 헤더를 판정해 켤 턴 경계가 없기 때문 (합체기는 게이지를 쓰지 않는다). @returns {boolean} 켰나
 */
export function autoComboHeader(K, side, id) {
  const lv = liveOf(K.state, side, id);
  if (!lv || lv.armed || !comboReady(K.state, side, id, K.T)) return false;
  return arm(K, side, id);
}

/** 한 팀의 AI 켜기 (포메이션 칸 순서) */
export function aiArm(K, side) {
  for (const id of K.state.order[side]) if (aiWants(K, side, id)) arm(K, side, id);
}

/* ------------------------------------------------------------------ */
/* 화면용 상태 (순수)                                                       */
/* ------------------------------------------------------------------ */

/**
 * 버튼 하나의 상태. situation(state, data, side, id, u) → { ok, reason } 는 "지금 쓰기" 상황 (hexMatch 가 판 기하로 넘긴다 —
 * 화면은 hexMatch.ultimateStatus 를 쓴다). 없으면 canNow false.
 * @returns {{ has, skillId, name, type, tier, line, description, gauge, max, ready, armed, comboReady, comboName, canNow, reason }}
 */
export function ultimateStatus(state, data, side, playerId, situation = null) {
  const uc = ultCfg(data);
  const id = playerId == null ? null : String(playerId);
  const p = state && SIDES.includes(side) ? findPlayer(state, side, id) : null;
  const skill = p ? ultSkillOf(data, p) : null;
  if (!skill) {
    return { has: false, skillId: null, name: null, type: null, tier: null, line: null, description: null, gauge: null, max: uc.max,
      ready: false, armed: false, comboReady: false, comboName: null, canNow: false, reason: "필살기 없음" };
  }
  const u = skill.ultimate;
  const T = state.turn + 1;
  const lv = liveOf(state, side, id);
  const gauge = lv && typeof lv.gauge === "number" ? lv.gauge : null;
  const ready = gauge != null && gauge >= uc.max;
  const armed = !!(lv && lv.armed);
  const combo = comboReady(state, side, id, T);
  const sit = situation ? situation(state, data, side, id, u) : { ok: false, reason: "" };
  const playing = !state.finished && state.stage !== "penalties" && gauge != null;
  const teamOn = u.type === "team" && teamActive(state, side, T);
  const canNow = playing && !teamOn && !!sit.ok;
  let reason;
  if (gauge == null) reason = "게이지 없음";
  else if (state.finished) reason = "경기 끝";
  else if (state.stage === "penalties") reason = "승부차기";
  else if (teamOn) reason = "팀 필살기 발동 중";
  else if (armed) reason = canNow ? "이번 턴에 발동" : `예약 — ${sit.reason || "다음 기회에 발동"}`;
  else if (!ready && !combo) reason = `충전 ${Math.floor((gauge / uc.max) * 100)}%`;
  else reason = canNow ? "지금 쓰기" : `누르면 예약 — ${sit.reason || "다음 기회에 발동"}`;
  return {
    has: true,
    skillId: skill.id,
    name: skill.name || skill.id,
    type: u.type,
    tier: u.tier || null,
    line: u.cutinLine || null,
    description: skill.description || "",
    gauge,
    max: uc.max,
    ready,
    armed,
    comboReady: combo,
    comboName: combo ? lv.combo.name : null,
    canNow,
    reason,
  };
}

/** 한 팀의 버튼 목록 (포메이션 칸 순서, 필살기가 없는 선수도 { has: false } 로) — 각 항목에 playerId */
export function ultimateList(state, data, side, situation = null) {
  if (!state || !state.order || !state.order[side]) return [];
  return state.order[side].map((id) => Object.assign({ playerId: id }, ultimateStatus(state, data, side, id, situation)));
}
