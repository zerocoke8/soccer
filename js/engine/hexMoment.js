/**
 * hexMoment.js — 결정의 순간 (H3.5, HEX_AUTOBATTLE_PLAN 결정 26 — 장면 판단 · 스케줄러 · 카드 미리보기)
 *
 * 순수 모듈. 난수 없음 · 상태는 JSON 만 · 불러오는 것: ./hexUlt.js 만. 엔진 안쪽 함수 (carrierOptions · dangerOf · 확률 식 …) 는
 * hexMatch.js 가 E (ENGINE 객체) 로 넘긴다 — hexMatch 를 불러오지 않아 모듈 고리가 없다. 화면 · 도구는 hexMatch 의 감싼 함수
 * (momentView · peekMoment · peekOptions) 를 쓴다.
 *
 * 장면 (사람 쪽만, 턴 경계마다 — 다음 턴 시작 칸으로, 주사위 없음):
 *  - shot   슈팅 찬스 · GK 와 1:1: 우리 공 가진 선수 (GK 아님) 가 슛 사거리 안 (AI 가 안 쏘는 중거리도) · 지금 슛 골 확률 ≥ momentShotMinP ·
 *           슛 말고 바로 성공할 확률 ≥ momentAltMinP 인 패스 · 드리블이 있다 (고를 거리가 있다)
 *  - danger 수비 위기 (결정 26 ④ "상대가 우리 골 앞에 올 때마다"): 공 가진 상대가 우리 골 dangerDist 칸 안 + 우리 수비가 그 앞쪽 3칸 (hexMatch dangerOf)
 *  - ult    우리 필살기를 지금 쓸 수 있다 (준비 · 안 켬 · 지금 상황 canNow — 결정 26 ⑤, 세이브는 늘 예약이라 빼고).
 *           같은 준비 (게이지가 찬 채) 에 한 번만 (momentClock.ult)
 *  - cross  크로스 · 스루 찬스: 크로스 선택지가 있거나, 받는 선수가 뛰어 들어갈 띄운 공 (노린 칸 ≠ 받는 선수 칸 · 떨어질 칸 자기 진영 열 ≥ 9)
 *  - counter 역습: 방금 턴에 우리가 태클 · 가로채기 · 공중볼로 공을 뺏었고, 앞으로 가는 띄운 공 (성공 추정 ≥ momentAltMinP) 이 있다
 *  - combo  합체기 대기 (H3 의 합체기 멈춤을 합침): 우리 공 가진 선수가 합체기 대기 · 안 켬 — 같은 대기에 한 번, 10초 간격을 쓰지 않는다
 * 우선순위 (같은 턴에 여럿): combo (따로) → shot > danger > ult > cross > counter.
 * 스케줄러: 간격을 쓰는 장면은 momentGap (25턴 = 10초) 에 최대 한 번 (마지막 장면 턴 momentClock.last 부터). 첫 턴 (시작 킥오프) · 골 · 킥오프 · 컷인 · 승부차기가 있던 턴
 * 뒤에는 장면이 없다 (합체기만 컷인 턴 뒤에도 — 필살 패스를 받은 바로 다음 턴이 합체기 기회라서). 끝난 경기 · 승부차기 단계도 없다.
 * 장면은 state.moment = { kind, side, playerId, turn, options: null } (카드는 momentView 가 만든다 — 상태에 두지 않는다) ·
 * state.momentClock = { last, ult, combo } 에 둔다 → ⏭ · 시뮬 · 재생이 같은 장면을 본다. 장면은 경기를 바꾸지 않는다 (입력만 바꾼다).
 *
 * [구현 결정] (H3.5):
 *  - 간격 = 최소 간격 (마지막 장면 턴 + 25 부터) — 고정 창 (0 ~ 24 · 25 ~ 49 …) 이 아니다. 합체기 · ⏸ 개입 (peekMoment manual) 은 간격을 쓰지 않고 바꾸지도 않는다.
 *  - 장면 판단은 AI 켜기 전 (hexUlt.beginTurn 전) 판으로 한다 (상태를 바꾸지 않으려고). 카드 숫자 (momentView) 는 복제본에서 beginTurn 을 돌린 뒤 —
 *    상대 AI 가 이 턴 켤 필살 수비 등이 숫자에 든다.
 *  - 컷인이 있던 턴 뒤에는 (합체기 말고) 장면을 쉬어 간다 — 멈춤이 겹치지 않게.
 *  - 카드 = 선택지 갈래 (슛 · 드리블 · 크로스 · 패스 · 띄운 공 · 지키기) 마다 하나, 패스 갈래는 받는 선수 상위 3명 (▾) — 갈래 순서는 장면마다
 *    (슈팅: 슛 → 다가가기 / 크로스: 크로스 → 띄운 공 → 패스 / 역습: 띄운 공 → 패스 → 드리블), 나머지는 기대값 순. 일반 카드 최대 4장 (★ 이 있으면 3장),
 *    '자동' (AI 가 고를 수) 갈래는 늘 든다. 지키기는 자동이거나 다른 것이 없을 때만.
 */

import * as U from "./hexUlt.js";

/** 간격을 쓰는 장면 종류 — 우선순위 순서 (같은 턴에 여럿이면 앞의 것) */
export const MOMENT_KINDS = Object.freeze(["shot", "danger", "ult", "cross", "counter"]);
/** 간격을 쓰지 않는 장면 (합체기) · ⏸ 개입의 일반 공격 장면 */
export const FREE_KINDS = Object.freeze(["combo", "attack"]);
/** 이 이벤트가 있던 턴 뒤에는 장면이 없다 (골 장면 · 킥오프 · 승부차기 — 컷인은 합체기만 넘어간다) */
const BLOCK_EVENTS = new Set(["goal", "kickoff", "penalties"]);
const CUT_EVENTS = new Set(["cutin", "combo"]);
const TENDENCY_LABEL = { shoot: "슈터", dribble: "드리블형", pass: "패스형" };
const STANCE_LABEL = { press: "압박", block: "패스길 막기", drop: "물러서기" };

const pct = (p) => `${Math.round(p * 100)}%`;
function nameOf(st, side, id) {
  const p = st[side] && st[side].players ? st[side].players.find((x) => x.id === id) : null;
  return p ? p.name || p.id : String(id);
}
function emptyClock() {
  return { last: null, ult: [], combo: null };
}

/** events 를 뺀 JSON 복제 (엿보기 — 진짜 상태 · rngState 는 그대로) */
export function cloneState(state) {
  const cl = JSON.parse(JSON.stringify(state, (k, v) => (k === "events" ? undefined : v)));
  cl.events = [];
  return cl;
}

/* ------------------------------------------------------------------ */
/* 장면 판단 (순수 — K = hexMatch peekCtx, 다음 턴 시작 칸)                  */
/* ------------------------------------------------------------------ */

/** 우리 공 가진 선수 (GK 아님) 의 선택지 (한 번만 계산) */
function holderOptions(E, K, side, cache) {
  if (cache.co !== undefined) return cache.co;
  const h = K.state.ball.holder;
  cache.co = h && h.side === side && K.state.roles[side][h.id] !== "GK" ? E.carrierOptions(K, side, h.id) : null;
  if (cache.co && cache.co.locked) cache.co = null;
  return cache.co;
}

function detectShot(E, K, side, cache) {
  const co = holderOptions(E, K, side, cache);
  if (!co) return null;
  const sh = co.opts.find((o) => o.key === "shoot");
  if (!sh || !(sh.p >= K.cfg.momentShotMinP)) return null;
  if (!co.opts.some((o) => o.action !== "shoot" && o.action !== "hold" && o.p >= K.cfg.momentAltMinP)) return null;
  return { kind: "shot", playerId: co.id };
}

function detectDanger(E, K, side) {
  const dg = E.dangerOf(K, side);
  if (!dg) return null;
  // 장면은 골 앞 (momentDangerDist) 만 — 하프라인 근처 (dangerDist 7) 는 AI 자세 규칙만 (2026-10-10 리뷰: 센터서클에서 "수비 위기")
  const md = Number(K.cfg.momentDangerDist);
  if (Number.isFinite(md) && dg.d > md) return null;
  // 공 가진 상대가 이 턴 어차피 슛 (AI 선택) 이면 자세가 결과를 바꾸지 않는다 (슛 막는 수비는 턴 시작 칸) — 멈추지 않는다
  const co = E.carrierOptions(K, dg.atk, dg.carrierId);
  if (co && co.best && co.best.action === "shoot") return null;
  return { kind: "danger", playerId: dg.defId };
}

/** 지금 쓸 수 있는 우리 필살기 (공 가진 선수 먼저 → 포메이션 칸 순서). skip = 이미 물어본 선수 */
function ultCandidate(E, K, side, skip) {
  const st = K.state;
  const h = st.ball.holder;
  const ids = st.order[side].slice();
  if (h && h.side === side) ids.sort((a, b) => (a === h.id ? -1 : b === h.id ? 1 : 0));
  for (const id of ids) {
    if (skip && skip.includes(id)) continue;
    const p = st[side].players.find((x) => x.id === id);
    const sk = U.ultSkillOf(K.data, p);
    if (!sk || sk.ultimate.type === "save") continue;
    const chk = U.armCheck(st, K.data, side, id, K.T);
    if (!chk.ok || chk.combo) continue;
    if (!E.ultSituation(st, K.data, side, id, sk.ultimate).ok) continue;
    return id;
  }
  return null;
}

function detectUlt(E, K, side, clock) {
  const id = ultCandidate(E, K, side, clock.ult);
  return id ? { kind: "ult", playerId: id } : null;
}

function isThrough(E, K, side, o) {
  return !!(o.lofted && o.target !== K.start[side][o.receiverId] && E.ocOf(o.target, side) >= 9);
}

function detectCross(E, K, side, cache) {
  const co = holderOptions(E, K, side, cache);
  if (!co) return null;
  if (co.opts.some((o) => o.action === "cross" || isThrough(E, K, side, o))) return { kind: "cross", playerId: co.id };
  return null;
}

/** 방금 턴에 side 가 공을 뺏었나 (태클 · 가로채기 · 공중볼) */
function wonBall(turnEvents, side) {
  return turnEvents.some((e) => (e.type === "tackle" && e.success && e.side === side) || (e.type === "intercept" && e.success && e.side === side)
    || (e.type === "aerial" && !e.success && e.side !== side));
}

function detectCounter(E, K, side, cache, turnEvents) {
  if (!wonBall(turnEvents, side)) return null;
  const co = holderOptions(E, K, side, cache);
  if (!co) return null;
  const oc = E.ocOf(co.cell, side);
  if (co.opts.some((o) => o.lofted && E.ocOf(o.target, side) > oc && o.p >= K.cfg.momentAltMinP)) return { kind: "counter", playerId: co.id };
  return null;
}

/** 합체기 대기 (우리 공 가진 선수 · 안 켬) → { kind: "combo", playerId, key } */
function detectCombo(K, side) {
  const st = K.state;
  const h = st.ball.holder;
  if (!h || h.side !== side || !U.comboReady(st, side, h.id, K.T)) return null;
  const lv = st.live[side][h.id];
  if (!lv || lv.armed) return null;
  return { kind: "combo", playerId: h.id, key: `${h.id}:${lv.combo.until}` };
}

/**
 * 턴 끝 스케줄러 (hexMatch.step 이 부른다 — 규칙 판 3): state.moment · state.momentClock 을 정한다. turnEvents = 방금 턴의 이벤트.
 * @returns {object|null} state.moment
 */
export function scheduleMoment(E, state, data, turnEvents = []) {
  state.moment = null;
  if (!state.momentClock) state.momentClock = emptyClock();
  const clock = state.momentClock;
  if (state.finished || state.stage === "penalties") return null;
  const side = state.humanSide === "away" ? "away" : "home";
  const K = E.peekCtx(state, data);
  const uc = U.ultCfg(data);
  // 게이지를 쓴 (준비가 풀린) 필살기는 다음 준비 때 다시 물어본다
  if (clock.ult.length) clock.ult = clock.ult.filter((id) => {
    const lv = state.live[side][id];
    return !!(lv && typeof lv.gauge === "number" && lv.gauge >= uc.max);
  });
  // 첫 턴 (시작 킥오프 — kickoff 이벤트가 없다) 도 골 · 킥오프 턴처럼 쉰다 (2026-10-10 스크린샷: 2:00 에 장면)
  if (state.turn <= 1 || turnEvents.some((e) => BLOCK_EVENTS.has(e.type))) return null;
  const set = (c) => {
    state.moment = { kind: c.kind, side, playerId: c.playerId, turn: K.T, options: null };
    return state.moment;
  };
  const combo = detectCombo(K, side);
  if (combo && clock.combo !== combo.key) {
    clock.combo = combo.key;
    return set(combo);
  }
  if (turnEvents.some((e) => CUT_EVENTS.has(e.type))) return null;
  const gap = Math.max(1, Math.round(Number(K.cfg.momentGap) || 25));
  if (clock.last != null && K.T - clock.last < gap) return null;
  const cache = {};
  for (const kind of MOMENT_KINDS) {
    let c = null;
    if (kind === "shot") c = detectShot(E, K, side, cache);
    else if (kind === "danger") c = detectDanger(E, K, side);
    else if (kind === "ult") c = detectUlt(E, K, side, clock);
    else if (kind === "cross") c = detectCross(E, K, side, cache);
    else if (kind === "counter") c = detectCounter(E, K, side, cache, turnEvents);
    if (!c) continue;
    clock.last = K.T;
    if (kind === "ult") clock.ult.push(c.playerId);
    return set(c);
  }
  return null;
}

/**
 * 다음 step 전 장면 (순수). opts.manual (⏸ 개입 — 결정 26 "다음 장면에서 한 번 멈춤", 간격 · 횟수 없음): 상황과 상관없이 우리 공 가진 선수의
 * 선택 (shot · cross · combo · attack) 또는 우리 수비가 공 가진 상대 앞쪽 3칸에 섰을 때 (거리 상관없이 danger) — 상태에 남기지 않는다
 * (화면이 momentView(state, data, 이 장면) 으로 카드를 받는다). manual 이 아니면 state.moment.
 * @returns {{ kind, side, playerId, turn, options: null, manual?: true } | null}
 */
export function peekMoment(E, state, data, opts = {}) {
  if (!state || state.finished || state.stage === "penalties") return null;
  if (!opts.manual) return state.moment || null;
  const side = state.humanSide === "away" ? "away" : "home";
  const K = E.peekCtx(state, data);
  const mk = (kind, playerId) => ({ kind, side, playerId, turn: K.T, options: null, manual: true });
  const combo = detectCombo(K, side);
  if (combo) return mk("combo", combo.playerId);
  const cache = {};
  const co = holderOptions(E, K, side, cache);
  if (co) {
    if (co.opts.some((o) => o.key === "shoot")) return mk("shot", co.id);
    if (detectCross(E, K, side, cache)) return mk("cross", co.id);
    return mk("attack", co.id);
  }
  // 규칙 판 2 (판 1 · 2 재생 기록에서 이어 온 경기) 는 수비 자세가 없다 — 수비 장면 없음 (choice 는 받는다)
  if (!(Number(state.rules) >= 3)) return null;
  const far = Object.assign({}, K, { cfg: Object.assign({}, K.cfg, { dangerDist: 999 }) });
  const dg = E.dangerOf(far, side);
  return dg ? mk("danger", dg.defId) : null;
}

/**
 * 이 턴 공 가진 선수의 선택지 (순수 — 복제본에서 hexUlt.beginTurn (input 의 필살기 켜기 + AI 켜기) 뒤 carrierOptions). 시험 · 도구용.
 * @returns {{ side, id, cell, opts, best, locked } | null}
 */
export function peekOptions(E, state, data, input = null) {
  if (!state || state.finished || state.stage === "penalties" || !state.ball.holder) return null;
  const cl = cloneState(state);
  const K = E.peekCtx(cl, data);
  U.beginTurn(K, input);
  return E.carrierOptions(K, cl.ball.holder.side, cl.ball.holder.id);
}

/* ------------------------------------------------------------------ */
/* 카드 (momentView)                                                     */
/* ------------------------------------------------------------------ */

/** 선택지 → 갈래 (카드 하나) 이름 */
function familyOf(o) {
  if (o.action === "shoot") return "shoot";
  if (o.action === "cross") return "cross";
  if (o.action === "pass") return o.lofted ? "loft" : "pass";
  return o.action; // dribble · hold
}

/** "성공하면 …" 글 · 그 % (공격 카드) */
function afterOf(E, K, side, id, o, kind) {
  const st = K.state;
  const BOX = E.BOX_DIST;
  const dir = E.dirOf(side);
  if (o.action === "shoot") {
    const cell = st.pos[side][id];
    const d = E.dtg(cell, dir);
    if (o.ai === false) return { after: `중거리 ${d}칸 — 자동이면 안 쏘는 거리`, afterP: null };
    if (d <= BOX && E.crowdBetween(K, side, cell) === 0 && E.shotBlockers(K, side, cell, K.occStart) === 0) return { after: "GK 와 1:1", afterP: null };
    const bl = E.shotBlockers(K, side, cell, K.occStart);
    return { after: d <= BOX ? (bl ? `막는 수비 ${bl}명` : "박스 안 슛") : `중거리 ${d}칸${bl ? ` · 막는 수비 ${bl}명` : ""}`, afterP: null };
  }
  if (o.action === "cross") return { after: o.hp > 0 ? `성공하면 헤더 골 ${pct(o.hp)}` : "성공하면 박스 안에서 받음", afterP: o.hp > 0 ? o.hp : null };
  if (o.action === "pass") {
    const sp = E.shotChanceAt(K, side, o.receiverId, o.target);
    if (sp != null) return { after: `성공하면 슛 ${pct(sp)}`, afterP: sp };
    if (E.dtg(o.target, dir) <= BOX) return { after: "성공하면 박스 진입", afterP: null };
    if (o.lofted && isThrough(E, K, side, o)) return { after: "성공하면 수비 뒤 공간", afterP: null };
    if (o.lofted && Math.abs(E.CR[o.target][1] - E.CR[st.pos[side][id]][1]) >= K.cfg.switchRows) return { after: "성공하면 반대쪽 전환", afterP: null };
    if (E.ocOf(o.target, side) >= 10) return { after: "성공하면 공격 1/3", afterP: null };
    // 띄운 공 (롱볼) 은 "짧게" 가 아니다 — 앞으로 간 만큼 (2026-10-10 스크린샷: 역습 롱볼 카드에 "짧게 이어 가기")
    const gain = E.dtg(st.pos[side][id], dir) - E.dtg(o.target, dir);
    if (o.lofted && gain >= 2) return { after: `성공하면 ${gain}칸 전진`, afterP: null };
    return { after: kind === "counter" && !o.lofted ? "짧게 이어 가기" : "공 돌리기", afterP: null };
  }
  if (o.action === "dribble") {
    const sp = E.shotChanceAt(K, side, id, o.target);
    if (sp != null) return { after: `성공하면 슛 ${pct(sp)}`, afterP: sp };
    if (E.dtg(o.target, dir) <= BOX) return { after: "성공하면 박스 진입", afterP: null };
    return { after: "성공하면 한 칸 전진", afterP: null };
  }
  return { after: "공 지키기", afterP: null };
}

/** 공격 카드 이름 */
function labelOf(E, K, side, id, o, kind) {
  const st = K.state;
  if (o.action === "shoot") return E.dtg(st.pos[side][id], E.dirOf(side)) <= E.BOX_DIST ? "슛" : "중거리 슛";
  if (o.action === "cross") return "크로스";
  if (o.action === "pass" && o.lofted) {
    if (isThrough(E, K, side, o)) return "스루";
    if (Math.abs(E.CR[o.target][1] - E.CR[st.pos[side][id]][1]) >= K.cfg.switchRows) return "전환";
    return "롱볼";
  }
  if (o.action === "pass") {
    if (kind === "cross" && E.dtg(o.target, E.dirOf(side)) <= E.BOX_DIST + 2) return "컷백";
    return st.roles[side][o.receiverId] === "GK" ? "백패스" : "패스";
  }
  if (o.action === "dribble") return kind === "shot" ? "다가가기" : "드리블";
  return "지키기";
}

/** 선택지 하나 → 카드 (받는 선수 갈래는 receivers 에 상위 3) */
function optCard(E, K, side, id, o, kind) {
  const st = K.state;
  const fam = familyOf(o);
  const a = afterOf(E, K, side, id, o, kind);
  const card = {
    key: o.key,
    kind: fam,
    label: labelOf(E, K, side, id, o, kind),
    playerId: id,
    p: o.p,
    pLabel: o.action === "shoot" ? "골" : o.action === "dribble" || o.action === "hold" ? (o.tackle ? "지킴" : "태클 없음") : "성공",
    estimate: o.action === "pass" || o.action === "cross",
    after: a.after,
    afterP: a.afterP,
    auto: false,
    star: false,
    input: { choice: { side, playerId: id, key: o.key } },
  };
  if (o.receiverId != null) {
    card.receiverId = o.receiverId;
    card.receiverName = nameOf(st, side, o.receiverId);
    card.target = o.target;
  } else if (o.target != null && o.target >= 0) card.target = o.target;
  return card;
}

/**
 * 갈래별 선택지 (기대값 순, 받는 선수마다 최고 하나) — AI 기준 밖 슛 (ai: false) 도 든다.
 * 패스 · 띄운 공에 같은 받는 선수가 둘 다 있으면 기대값이 큰 쪽만 ('자동' 선택지는 늘 남는다 — 2026-10-10 리뷰 "롱볼 → 타리아 · 패스 → 타리아").
 * fwd (슈팅 · 크로스 장면) = 앞으로 가는 패스 (노린 칸이 공 가진 선수보다 골에 가까움) 를 갈래 안에서 먼저 (공 돌리기는 뒤로).
 */
function families(co, autoKey = null, fwd = null) {
  const by = new Map();
  for (const o of co.opts) {
    const f = familyOf(o);
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(o);
  }
  const top = new Map(); // 받는 선수 → 패스 · 띄운 공 중 남길 하나 ('자동' 이면 그것, 아니면 기대값 최고)
  for (const f of ["pass", "loft"]) {
    for (const o of by.get(f) || []) {
      const t = top.get(o.receiverId);
      if (!t || (t.key !== autoKey && (o.key === autoKey || o.value > t.value))) top.set(o.receiverId, o);
    }
  }
  for (const [f, list] of [...by]) {
    list.sort((a, b) => (fwd ? (fwd(b) ? 1 : 0) - (fwd(a) ? 1 : 0) : 0) || b.value - a.value);
    if (f === "pass" || f === "loft" || f === "cross") {
      const seen = new Set();
      const kept = list.filter((o) => {
        if (seen.has(o.receiverId)) return false;
        if (f !== "cross" && top.get(o.receiverId) !== o) return false;
        seen.add(o.receiverId);
        return true;
      });
      if (kept.length) by.set(f, kept);
      else by.delete(f);
    }
  }
  return by;
}

const KIND_ORDER = { shot: ["shoot", "dribble"], cross: ["cross", "loft", "pass"], counter: ["loft", "pass", "dribble"] };

/** 공격 카드들 (+ ★) */
function attackCards(E, K, state, data, view, mo) {
  const side = mo.side;
  const id = mo.playerId;
  const co = E.carrierOptions(K, side, id);
  const auto = co.best;
  const dir = E.dirOf(side);
  const d0 = E.dtg(K.state.pos[side][id], dir);
  const fwd = mo.kind === "shot" || mo.kind === "cross" ? (o) => o.target != null && o.target >= 0 && E.dtg(o.target, dir) < d0 : null;
  const fams = families(co, auto.key, fwd);
  // ★ 필살기 카드 (준비 · 안 켬 · 지금 상황 — 고르면 켜고 이 턴에 터진다)
  const star = starAttackCard(E, state, data, side, id, mo);
  const cap = star ? 3 : 4;
  const autoFam = familyOf(auto);
  const pref = KIND_ORDER[mo.kind] || [];
  const order = [];
  for (const f of pref) if (fams.has(f) && !order.includes(f)) order.push(f);
  const rest = [...fams.keys()].filter((f) => !order.includes(f) && f !== "hold");
  rest.sort((a, b) => (fwd ? (fwd(fams.get(b)[0]) ? 1 : 0) - (fwd(fams.get(a)[0]) ? 1 : 0) : 0) || fams.get(b)[0].value - fams.get(a)[0].value);
  order.push(...rest);
  let pick = order.slice(0, cap);
  if (fams.has(autoFam) && !pick.includes(autoFam)) {
    if (pick.length >= cap) pick[pick.length - 1] = autoFam;
    else pick.push(autoFam);
  }
  if (pick.length < 2 && fams.has("hold") && !pick.includes("hold")) pick.push("hold");
  for (const f of pick) {
    let list = fams.get(f).slice(0, 3);
    const ai = list.findIndex((o) => o.key === auto.key);
    if (ai < 0 && familyOf(auto) === f) list = [auto, ...list].slice(0, 3);
    else if (ai > 0) list = [list[ai], ...list.filter((_, i) => i !== ai)];
    const cards = list.map((o) => optCard(E, K, side, id, o, mo.kind));
    const card = cards[0];
    if (f === "pass" || f === "loft" || f === "cross") {
      card.receivers = cards.map((c) => ({ receiverId: c.receiverId, receiverName: c.receiverName, key: c.key, target: c.target, label: c.label,
        p: c.p, after: c.after, afterP: c.afterP, auto: c.key === auto.key, input: c.input }));
    }
    card.auto = cards.some((c) => c.key === auto.key);
    view.cards.push(card);
  }
  if (star) view.cards.push(star);
  view.autoKey = auto.key;
  view.carrier = { side, id, name: nameOf(K.state, side, id), cell: K.state.pos[side][id] };
}

/** ★ 공격 카드: 그 선수 필살기를 켠 복제본의 AI 선택 (켠 필살기 행동) */
function starAttackCard(E, state, data, side, id, mo) {
  const p = state[side].players.find((x) => x.id === id);
  const sk = U.ultSkillOf(data, p);
  if (!sk || !["shot", "pass", "dribble"].includes(sk.ultimate.type)) return null;
  const T = state.turn + 1;
  const chk = U.armCheck(state, data, side, id, T);
  if (!chk.ok) return null;
  if (!chk.combo && !E.ultSituation(state, data, side, id, sk.ultimate).ok) return null;
  // 지금 상황 (슛 = 필살 슛 거리 ultShotRange · minLine 3 은 박스 — decide 가 켠 슛을 고르는 규칙 shotUltOf 와 같다)
  const sit = E.ultSituation(state, data, side, id, sk.ultimate);
  if (!chk.combo && !sit.ok) return null;
  const cl = cloneState(state);
  const K2 = E.peekCtx(cl, data);
  const arm = { side, playerId: id, op: "arm" };
  U.beginTurn(K2, { ultimates: [arm] });
  if (!cl.live[side][id].armed) return null;
  const co2 = E.carrierOptions(K2, side, id);
  const o = co2.best;
  // 필살기가 이 선택에서 터지나 (슛 = 지금 상황 + 슛, 패스 = 허용된 행동, 드리블 = 태클이 올 때)
  const t = sk.ultimate.type;
  const fires = sit.ok && (t === "shot" ? o.action === "shoot" : t === "pass" ? !!U.passUltOf(K2, side, id, o.action) : o.action === "dribble" && !!o.tackle);
  const comboName = chk.combo ? cl.live[side][id].combo.name : null;
  const ult = { skillId: sk.id, name: sk.name || sk.id, type: t, tier: sk.ultimate.tier || null, combo: !!chk.combo, comboName };
  if (!fires) {
    // 합체기 대기인데 이 턴에는 안 터진다 (필살 슛 거리 밖 · 박스 밖) → 예약만 하는 ★ (H3 의 "합체기!" 알림 — 누르면 예약, 그 거리에서 발동)
    if (!chk.combo) return null;
    return {
      key: "ult:" + id, kind: "ult", label: `★ ${comboName || sk.name || sk.id}`, playerId: id, p: null, pLabel: "", estimate: false,
      after: `예약 — ${sit.reason || "기회가 오면"} 발동`, afterP: null, auto: false, star: true, reserve: true, ult,
      input: { ultimates: [arm] },
    };
  }
  const card = optCard(E, K2, side, id, o, mo.kind);
  card.key = "ult:" + id;
  card.star = true;
  card.label = `★ ${comboName || sk.name || sk.id}`;
  card.ult = ult;
  card.input = { ultimates: [arm], choice: { side, playerId: id, key: o.key } };
  card.choiceKey = o.key;
  return card;
}

/** 수비 카드 (압박 · 패스길 막기 · 물러서기 + ★ 필살 수비) */
function defenceCards(E, K, state, data, view, mo) {
  const st = K.state;
  const side = mo.side;
  const did = mo.playerId;
  const h = st.ball.holder;
  const atk = h.side;
  const atkTeam = st[atk];
  const defTeam = st[side];
  const carrier = atkTeam.players.find((x) => x.id === h.id);
  const decider = defTeam.players.find((x) => x.id === did);
  const cell = st.pos[atk][h.id];
  const d = E.dtg(cell, E.dirOf(atk));
  const helpers = E.tackleHelpers(K, side, cell, did);
  const canTackle = E.tacklers(K, atk, cell, "hold").some((x) => x.id === did);
  const dgAI = E.dangerOf(K, side);
  const autoMode = dgAI && dgAI.defId === did ? E.aiStance(K, dgAI) : "press";
  const t = E.tendencyOf(K.cfg, atkTeam, carrier, d);
  view.carrier = { side: atk, id: h.id, name: carrier.name || carrier.id, cell };
  view.tendency = { type: t, label: TENDENCY_LABEL[t], shoot: carrier.stats.shoot, dribble: carrier.stats.dribble, pass: carrier.stats.pass };
  // '자동' 카드 = 입력 없음 (AI 자세 규칙 그대로 — 고른 자세처럼 이어지지 않는다 · ⏭ · 시뮬과 같은 경기). 다른 자세 = defend 입력 (stanceHoldTurns 동안 이어짐)
  // % 이름은 짧게 한 줄 (폰 9 CSS px 이상 — 2026-10-10 리뷰), 조건 (드리블이면 · 슛이면) 은 둘째 줄에
  const mk = (mode, p, pLabel, after, extra = {}) => Object.assign({
    key: mode, kind: mode, label: STANCE_LABEL[mode], playerId: did, p, pLabel, estimate: false, after, afterP: null,
    auto: mode === autoMode, star: false, input: mode === autoMode ? null : { defend: { side, playerId: did, mode } },
  }, extra);
  const pPress = canTackle ? 1 - E.pKeep(K, atkTeam, carrier, defTeam, decider, helpers, "dribble") : null;
  view.cards.push(mk("press", pPress, canTackle ? "뺏기" : "", canTackle ? "드리블하면 태클 · 실패하면 1턴 쉼" : "다가가 압박"));
  const rid = E.laneReceiver(K, atk, h.id);
  const pBlock = 1 - E.pPass(K, atkTeam, carrier, defTeam, decider, 0, U.passMods(K, atk, h.id, "pass"));
  view.cards.push(mk("block", pBlock, "가로채기", rid ? `${nameOf(st, atk, rid)} 패스길에 섬` : "패스길에 섬", { estimate: true, receiverId: rid || null, receiverSide: atk }));
  const ps = E.shotChanceAt(K, atk, h.id, cell);
  view.cards.push(mk("drop", ps, ps != null ? "슛 실점" : "", "태클 안 함 · 골 앞을 지킴"));
  // ★ 필살 수비: 준비 · 안 켬 · 지금 상황 (공 가진 상대 앞쪽 3칸) — 고르면 켜고 압박 (이 턴 태클에서 터진다)
  const sk = U.ultSkillOf(data, decider);
  if (sk && sk.ultimate.type === "defense") {
    const chk = U.armCheck(state, data, side, did, K.T);
    if (chk.ok && E.ultSituation(state, data, side, did, sk.ultimate).ok) {
      const cl = cloneState(state);
      const K2 = E.peekCtx(cl, data);
      const arm = { side, playerId: did, op: "arm" };
      U.beginTurn(K2, { ultimates: [arm] });
      const c2 = cl[atk].players.find((x) => x.id === h.id);
      const d2 = cl[side].players.find((x) => x.id === did);
      const p2 = 1 - E.pKeep(K2, cl[atk], c2, cl[side], d2, helpers, "dribble");
      view.cards.push(mk("press", p2, "드리블이면 뺏기", `${STANCE_LABEL.press} + 필살 수비`, {
        key: "ult:" + did, star: true, auto: false, label: `★ ${sk.name || sk.id}`,
        ult: { skillId: sk.id, name: sk.name || sk.id, type: "defense", tier: sk.ultimate.tier || null, combo: false, comboName: null },
        input: { ultimates: [arm], defend: { side, playerId: did, mode: "press" } },
      }));
    }
  }
  view.autoKey = autoMode;
}

/** 팀 필살기 카드 둘째 줄 — 경기 시계 초 · % ("10초 동안 팀 +8%", 1턴 = 0.4초) */
function teamAfter(K, sk) {
  const sec = Math.round(Number(K.cfg.teamUltTurns) * 0.4);
  const pc = Math.round((Number(sk.ultimate.teamMult || 1) - 1) * 100);
  return `${sec}초 동안 팀 ${pc >= 0 ? "+" : ""}${pc}%`;
}

/** 팀 필살기 장면 카드 (★ 발동 · 아끼기) */
function teamCards(E, K, state, data, view, mo) {
  const side = mo.side;
  const id = mo.playerId;
  const p = state[side].players.find((x) => x.id === id);
  const sk = U.ultSkillOf(data, p);
  if (!sk) return;
  const arm = { side, playerId: id, op: "arm" };
  view.cards.push({
    key: "ult:" + id, kind: "ult", label: `★ ${sk.name || sk.id}`, playerId: id, p: null, pLabel: "", estimate: false,
    after: teamAfter(K, sk), afterP: null, auto: false, star: true,
    ult: { skillId: sk.id, name: sk.name || sk.id, type: sk.ultimate.type, tier: sk.ultimate.tier || null, combo: false, comboName: null },
    input: { ultimates: [arm] },
  });
  view.cards.push({ key: "auto", kind: "wait", label: "아끼기", playerId: id, p: null, pLabel: "", estimate: false, after: "다음 기회에", afterP: null,
    auto: true, star: false, input: null });
  view.autoKey = "auto";
}

/**
 * 장면의 카드 (순수 미리보기 — events 를 뺀 JSON 복제본에서 hexUlt.beginTurn (AI 켜기) 뒤 계산, 진짜 상태 · rngState 는 그대로).
 * moment 를 주지 않으면 state.moment (⏸ 개입은 peekMoment(…, { manual: true }) 의 장면을 넘긴다).
 * @returns {{ kind, side, playerId, name, turn, cards: object[], autoKey: string|null, carrier: object|null, tendency?: object } | null}
 *  카드 = { key, kind, label, playerId, p, pLabel, estimate, after, afterP, auto, star, input, receiverId?, receiverName?, target?,
 *           receivers? (▾ 상위 3: { receiverId, receiverName, key, target, label, p, after, afterP, auto, input }), ult? }.
 *  input = 고르면 step 에 그대로 넘길 입력 ({ choice } · { defend } · { ultimates, choice | defend } · null = 아무것도 안 넣음).
 */
export function momentView(E, state, data, moment = null) {
  const mo = moment || (state && state.moment);
  if (!mo || !state || state.finished || state.stage === "penalties") return null;
  const cl = cloneState(state);
  const K = E.peekCtx(cl, data);
  U.beginTurn(K, null); // 상대 AI 가 이 턴 켤 필살기 (복제본에만)
  const h = cl.ball.holder;
  const view = { kind: mo.kind, side: mo.side, playerId: mo.playerId, name: nameOf(cl, mo.side, mo.playerId), turn: K.T, cards: [], autoKey: null, carrier: null };
  const sk = U.ultSkillOf(data, cl[mo.side].players.find((x) => x.id === mo.playerId));
  if (mo.kind === "ult" && sk && sk.ultimate.type === "team") teamCards(E, K, state, data, view, mo);
  else if (h && h.side === mo.side && h.id === mo.playerId) attackCards(E, K, state, data, view, mo);
  else if (h && h.side !== mo.side && cl.pos[mo.side][mo.playerId] != null) {
    if (!(Number(state.rules) >= 3)) return null; // 규칙 판 2: 수비 자세 입력을 받지 않는다
    defenceCards(E, K, state, data, view, mo);
  }
  else teamCards(E, K, state, data, view, mo);
  return view;
}
