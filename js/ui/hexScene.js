// js/ui/hexScene.js — 육각 경기 화면의 장면 계산 (HEX_AUTOBATTLE_PLAN §5 · §6.1, H1 SPEC §3) — 순수 함수, DOM · Pixi 없음 (test/hexScene.test.mjs)
//
// 하는 일: 엔진 상태 (js/engine/hexMatch.js) → 그릴 목록 (frame). Pixi 층 (hexPixi.js) 은 frame 을 그리기만 한다 (투영 계산 없음).
// 불러오는 것: ../engine/hexGrid.js · ./view25.js 만 (hexMatch.js 의 숫자는 cfg 로 받는다).
//
// 좌표 (view25.js 머리말과 같다):
//   보드 (hexGrid centerXY, 단위 육각 크기 1) → 판 px: S = FL / BOARD_W (≈ 47.88 판 px / 육각 단위)
//     u = RU + (x − BOARD_X0) · S,   v = RV + (FD − BOARD_H · S) / 2 + (y − BOARD_Y0) · S
//   → 보드 폭 = 필드 길이 그대로 (골라인 = 필드 양 끝 = view25 골대 자리), 깊이는 가운데 맞춤 (골 행 5 ~ 7 의 가운데 행 6 = 필드 깊이 50 %).
//   판 px → 필드 화면 px (카메라 전, 예전 .m-field 좌표) = V.projectPlane. 필드 % = V.planeToField (카메라 목표 · groundAspect 용).
//
// 보간 (frameAt): prev = 이전 턴 상태 (sceneSnap 으로 떠 둔 것이면 충분) → next = 지금 상태, alpha 0 → 1.
//   선수: easeOut (처음 빠르고 끝에 느려지는 "슉슉"). 킥오프 (next 에 이번 턴 kickoff 이벤트) 이거나 한 선수가 2칸 이상 뛰면 그 자리로 바로 (snap).
//   골 턴 (이번 턴 goal + kickoff): 선수는 prev 자리 그대로 두고 공만 골망으로 — 화면이 골 연출 (배너 · 시계 멈춤) 뒤
//     frameAt(null, next, 1) 로 킥오프 자리를 그린다. 골든골 결승골 (kickoff 없음) 은 선수도 평소처럼 움직인다.
//   공: 같은 선수가 계속 가지면 그 선수 (보간된 자리) 발 앞, 아니면 prev 공 자리 → next 공 자리 (판 위 직선 — 비행 길은 육각 직선이라 같다).
//     크로스는 비행 전체 진행도 t 로 호 높이 4t(1 − t) · arcLift. 한 턴 안에 뜨고 내려앉은 크로스 (이번 턴 pass 이벤트 cross) 는 t = alpha.
//
// [구현 결정] (H1):
//  - 공 가진 선수의 공 = 발에서 공격 방향 (골 축) 으로 46 · 0.35 · s 화면 px, 깊이 쪽 (가까운 쪽) 4 · s 화면 px — 예전 ballPx 와 같은 크기를 판 px 로 바꿔 둔다.
//  - 쉬는 선수 (resting) = restUntil ≥ next.turn — 넘어진 턴 · 그다음 턴 동안 넘어진 모습.
//  - 슛 (골) 의 공은 골라인 너머 GOAL_DEPTH / 2 · 슛 칸 깊이를 골 행 5 ~ 7 안으로 자른 곳, 얕은 호 (크로스 호의 0.35).
//  - 시계는 경기 시간 (턴 × 0.4 초, 결정 16) — 재생 속도 (tick ms · 배속) 와 상관없다. 남은 초는 올림.

import * as G from '../engine/hexGrid.js';
import * as V from './view25.js';

const { FL, FD, RU, RV } = V.V25;
const { PL, PD } = V.planeSize();

/** 육각 한 단위 (centerXY 1) 의 판 px (= 육각 반지름 = 꼭짓점까지 거리) */
export const HEX_PX = FL / G.BOARD_W;
const S = HEX_PX;
const V_OFF = RV + (FD - G.BOARD_H * S) / 2;

/** 필드 사각형 · 판 전체 (판 px) */
export const FIELD_RECT = Object.freeze({ u0: RU, v0: RV, u1: RU + FL, v1: RV + FD });
export const PLANE_RECT = Object.freeze({ u0: 0, v0: 0, u1: PL, v1: PD });

/** 경기 시간 기본값 (결정 16 · 17 — 엔진 HEX_DEFAULTS 와 같은 값; 화면은 cfg 로 엔진 값을 넘긴다) */
const CLOCK_DEFAULTS = Object.freeze({ turnsRegular: 300, goldenTurns: 75, turnSec: 0.4 });

/** 발 앞 공 (예전 ballPx: 골 축 46 · 0.35 · s, 깊이 4 · s — 화면 px, 가까운 터치라인 기준) */
const BALL_AHEAD = 46 * 0.35;
const BALL_DOWN = 4;
/** 공 지름 (화면 px × s) · 그림자 */
const BALL_D = 14;
const SHADOW_W = 18;
const SHADOW_H = 7;
/** 슛 호 높이 = 크로스 호의 이 비율 */
const SHOT_ARC = 0.35;

const clamp01 = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* 보드 → 판                                                              */
/* ------------------------------------------------------------------ */

/** 보드 좌표 (c, r) (보드 밖 가상 칸도 된다 — 골 칸) → 판 { u, v } */
export function crPlane(c, r) {
  const { x, y } = G.centerXY(c, r);
  return { u: RU + (x - G.BOARD_X0) * S, v: V_OFF + (y - G.BOARD_Y0) * S };
}

/** 칸 id → 칸 중심 판 { u, v } */
export function cellPlane(id) {
  const [c, r] = G.cellCR(id);
  return crPlane(c, r);
}

/** 칸 id → 뾰족한 위 육각형 꼭짓점 6개 (판 px, 반지름 HEX_PX) — 오른쪽 위 (−30°) 부터 시계 방향 (화면 y 아래) */
export function hexCornersPlane(id) {
  const { u, v } = cellPlane(id);
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i - 30) * Math.PI) / 180;
    out.push({ u: u + S * Math.cos(a), v: v + S * Math.sin(a) });
  }
  return out;
}

/** 보드 외곽 (반 칸 · 위아래 꼭짓점 포함) 의 판 사각형 { u0, v0, u1, v1, w, h } */
export function boardPlaneRect() {
  const u0 = RU;
  const v0 = V_OFF;
  const w = G.BOARD_W * S;
  const h = G.BOARD_H * S;
  return { u0, v0, u1: u0 + w, v1: v0 + h, w, h };
}

let GRID = null;
/**
 * 잔디 텍스처에 구울 칸 목록 (189칸, id 순, 얼림): { id, c, r, u, v, corners: [{u, v}×6], box: −1 | 0 | 1 }
 * box −1 = 왼쪽 골 (홈 골) 박스, +1 = 오른쪽 골 (원정 골) 박스, 0 = 박스 밖. 판 px (텍스처는 −RU, −RV 만큼 옮겨 쓴다).
 */
export function gridCells() {
  if (GRID) return GRID;
  GRID = Object.freeze(G.ALL_CELLS.map((id) => {
    const [c, r] = G.cellCR(id);
    const { u, v } = crPlane(c, r);
    const box = G.inBox(id, -1) ? -1 : G.inBox(id, 1) ? 1 : 0;
    return Object.freeze({ id, c, r, u, v, corners: Object.freeze(hexCornersPlane(id)), box });
  }));
  return GRID;
}

/**
 * 판 사각형 { u0, v0, u1, v1 } 의 네 귀퉁이 → 필드 화면 px [{x, y}×4] (왼쪽 위 · 오른쪽 위 · 오른쪽 아래 · 왼쪽 아래 — PerspectiveMesh setCorners 순서)
 */
export function quadScreen(rect, W, H) {
  const { u0, v0, u1, v1 } = rect;
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => {
    const p = V.projectPlane(u, v, W, H);
    return { x: p.sx, y: p.sy };
  });
}

/* ------------------------------------------------------------------ */
/* 작은 도우미                                                             */
/* ------------------------------------------------------------------ */

/** 처음 빠르고 끝에 느려지는 보간 (1 − (1 − t)³), t 는 0 ~ 1 로 자른다 */
export function easeOut(t) {
  const k = 1 - clamp01(Number(t) || 0);
  return 1 - k * k * k;
}

/** 그 팀의 공격 방향이 화면 오른쪽인가 (홈 = 오른쪽 골 공격) */
export const attackRightOf = (side) => side !== 'away';

/** 지금 공을 가진 쪽 (가진 선수 → 비행 중 찬 팀 → 마지막 포제션) | null */
export function possessionOf(state) {
  const b = state?.ball;
  if (b?.holder) return b.holder.side;
  if (b?.flight) return b.flight.side;
  return state?.possessionSide ?? null;
}

/**
 * 그 턴 (기본 = state.turn) 의 이벤트들 (뒤에서부터 찾고 원래 순서로 돌려준다). 배너 · 골 연출 판단용.
 * @returns {object[]}
 */
export function eventsOfTurn(state, turn = state?.turn) {
  const ev = state?.events;
  if (!Array.isArray(ev)) return [];
  const out = [];
  for (let i = ev.length - 1; i >= 0; i--) {
    const e = ev[i];
    if (e.turn === turn) out.push(e);
    else if (e.turn < turn) break;
  }
  return out.reverse();
}

/**
 * 보간에 필요한 만큼만 뜬 상태 (step 이 상태를 제자리에서 바꾸므로 step 전에 떠 둔다 — 이벤트 목록은 뜨지 않는다):
 * { turn, stage, pos, ball, possessionSide } (JSON 복사).
 */
export function sceneSnap(state) {
  return JSON.parse(JSON.stringify({
    turn: state.turn, stage: state.stage, pos: state.pos, ball: state.ball, possessionSide: state.possessionSide ?? null,
  }));
}

/**
 * 머리 위 점 (HTML 이름표 자리 — 필드 화면 px, 카메라 전): frame.players 항목 → { sx, sy }
 * @param {{ sx: number, sy: number, s: number, figure: { fh: number } }} p
 */
export function headPoint(p, gap = 6) {
  return { sx: p.sx, sy: p.sy - p.figure.fh - gap * p.s };
}

/** 필드 화면 px 점 → 카메라를 건 화면 px (.hx-pitch 안 필드 영역 기준): tx + z · sx, ty + z · sy */
export function camPoint(pt, cam, W, H) {
  const { tx, ty } = V.camTranslate(cam, W, H);
  return { x: tx + cam.z * pt.sx, y: ty + cam.z * pt.sy };
}

/* ------------------------------------------------------------------ */
/* HUD 글자                                                               */
/* ------------------------------------------------------------------ */

function mmss(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 시계 글자 (결정 16): 정규 = 남은 (turnsRegular − turn) 턴 × 0.4 초 "m:ss" (0 → "2:00", 150 → "1:00", 300 → "0:00"),
 * 골든골 = "골든골 m:ss" (시작부터 goldenTurns 턴 카운트다운 — state.stageEndTurn 기준), 추가시간 = "추가시간", 승부차기 = "승부차기",
 * 끝 = "경기 종료".
 * @param {object} state 엔진 상태
 * @param {{ turnsRegular?: number, goldenTurns?: number, turnSec?: number }} [cfg] 엔진 숫자 (hexMatch TURNS_REGULAR · GOLDEN_TURNS)
 */
export function clockText(state, cfg = {}) {
  const c = { ...CLOCK_DEFAULTS, ...cfg };
  if (!state) return '';
  if (state.finished) return '경기 종료';
  const turn = Number(state.turn) || 0;
  switch (state.stage) {
    case 'addedTime': return '추가시간';
    case 'penalties': return '승부차기';
    case 'goldenGoal': {
      const end = Number.isFinite(state.stageEndTurn) ? state.stageEndTurn : turn + c.goldenTurns;
      const left = Math.min(c.goldenTurns, Math.max(0, end - turn));
      return `골든골 ${mmss(left * c.turnSec)}`;
    }
    default: return mmss(Math.max(0, c.turnsRegular - turn) * c.turnSec);
  }
}

/** 단계 이름 (HUD 보조 줄): 정규 시간 · 추가시간 · 골든골 · 승부차기 h : a · 경기 종료 */
export function stageLabel(state) {
  if (!state) return '';
  if (state.finished) return '경기 종료';
  switch (state.stage) {
    case 'addedTime': return '추가시간';
    case 'goldenGoal': return '골든골';
    case 'penalties': {
      const p = state.penalties;
      return p ? `승부차기 ${p.home} : ${p.away}` : '승부차기';
    }
    default: return '정규 시간';
  }
}

/** 점수 글자 "h : a" (예전 .mh-score 와 같은 모양) */
export function scoreText(state) {
  const s = state?.score || { home: 0, away: 0 };
  return `${s.home} : ${s.away}`;
}

/* ------------------------------------------------------------------ */
/* 그릴 목록                                                              */
/* ------------------------------------------------------------------ */

/** 공의 판 자리 (가진 선수 발 앞은 playerUV 로 — 보간된 자리를 넘길 수 있게) */
function ballPlane(state, playerUV, W) {
  const b = state.ball || {};
  if (b.holder) {
    const p = playerUV(b.holder.side, b.holder.id);
    if (p) return aheadOf(p, b.holder.side, W);
  }
  const cell = G.isCell(b.cell) ? b.cell : null;
  return cell == null ? { u: RU + FL / 2, v: RV + FD / 2 } : cellPlane(cell);
}

/** 발 (u, v) → 공격 방향으로 발 앞 공 자리 (판 px) — 화면 px 크기를 가까운 터치라인 배율 (W / FL) 로 나눠 판 px 로 */
function aheadOf(p, side, W) {
  const kNear = W / FL;
  const dir = attackRightOf(side) ? 1 : -1;
  return { u: p.u + (dir * BALL_AHEAD) / kNear, v: p.v + BALL_DOWN / (kNear * 0.55) };
}

/** 비행 중인 공의 출발 칸 (이번 비행의 pass 이벤트 fromCell, 없으면 path[0]) */
function flightFrom(f, events) {
  if (Array.isArray(events)) {
    for (let i = events.length - 1, n = 0; i >= 0 && n < 400; i--, n++) {
      const e = events[i];
      if (e.type === 'pass' && e.side === f.side && e.from === f.passerId && e.target === f.target) return e.fromCell;
    }
  }
  return f.path[0];
}

function sameFlight(a, b) {
  return !!(a && b && a.side === b.side && a.passerId === b.passerId && a.target === b.target
    && a.path.length === b.path.length && a.path.every((c, i) => c === b.path[i]) && b.at >= a.at);
}

/**
 * 한 화면의 그릴 목록 (필드 화면 px = 예전 .m-field 좌표, 카메라 전).
 * @param {object|null} prev 이전 턴 상태 또는 sceneSnap(이전 상태) — null 이면 next 그대로
 * @param {object} next 지금 엔진 상태 (이벤트 목록 포함)
 * @param {number} alpha 0 (prev) → 1 (next)
 * @param {{ W: number, H: number }} size 필드 영역 크기
 * @returns {{
 *   turn: number, alpha: number, kickoff: boolean, goal: null|{ side: string, playerId: string },
 *   players: Array<{ key: string, side: 'home'|'away', id: string, name: string, role: string, u: number, v: number,
 *     sx: number, sy: number, s: number, ga: number, figure: { fh: number, hw: number }, ground: { w: number, h: number },
 *     color: string, charId: string|null, carrier: boolean, resting: boolean, z: number }>,
 *   ball: { u: number, v: number, sx: number, sy: number, s: number, d: number, lift: number,
 *     shadow: { sx: number, sy: number, w: number, h: number } },
 *   focus: { x: number, y: number }, attackRight: boolean, carrierKey: string|null
 * }}
 */
export function frameAt(prev, next, alpha, { W, H }) {
  const a = clamp01(Number(alpha) || 0);
  const e = easeOut(a);
  const evs = eventsOfTurn(next);
  const kickoff = evs.some((x) => x.type === 'kickoff');
  const goalEv = evs.find((x) => x.type === 'goal') || null;
  const goalReset = !!(prev && goalEv && kickoff); // 골 → 킥오프: 선수는 prev 자리 그대로, 공만 골망으로
  const base = prev && !(kickoff && !goalReset) ? prev : null; // null = 바로 next 자리
  const holder = next.ball?.holder || null;

  // 선수 판 자리
  const uv = { home: {}, away: {} };
  for (const side of ['home', 'away']) {
    for (const id of Object.keys(next.pos[side])) {
      const nc = next.pos[side][id];
      const pc = base?.pos?.[side]?.[id];
      const np = cellPlane(nc);
      if (pc == null || !G.isCell(pc)) { uv[side][id] = np; continue; }
      const pp = cellPlane(pc);
      if (goalReset) { uv[side][id] = pp; continue; }
      if (G.distance(pc, nc) >= 2) { uv[side][id] = np; continue; }
      uv[side][id] = { u: lerp(pp.u, np.u, e), v: lerp(pp.v, np.v, e) };
    }
  }

  const players = [];
  for (const side of ['home', 'away']) {
    const team = next[side] || {};
    const list = Array.isArray(team.players) ? team.players : Object.keys(next.pos[side]).map((id) => ({ id }));
    for (const pl of list) {
      const id = String(pl.id);
      const p = uv[side][id];
      if (!p) continue;
      const pr = V.projectPlane(p.u, p.v, W, H);
      const f = V.planeToField(p.u, p.v);
      const ga = V.groundAspect(f.x, f.y, W, H);
      const fig = V.figureSize(pr.s);
      const gw = V.V25.GROUND_W * pr.s;
      const restUntil = next.live?.[side]?.[id]?.restUntil;
      players.push({
        key: `${side}:${id}`, side, id, name: pl.name || id, role: next.roles?.[side]?.[id] || pl.position || '',
        u: p.u, v: p.v, sx: pr.sx, sy: pr.sy, s: pr.s, ga,
        figure: { fh: fig.fh, hw: fig.hw }, ground: { w: gw, h: gw * ga },
        color: pl.portraitColor || '#4b5563', charId: pl.charId || null,
        carrier: !!(holder && holder.side === side && holder.id === id),
        resting: Number.isFinite(restUntil) && restUntil >= next.turn,
        z: pr.sy,
      });
    }
  }

  // 공
  const nowUV = (side, id) => uv[side]?.[id] || null;
  const nextUV = (side, id) => (G.isCell(next.pos[side]?.[id]) ? cellPlane(next.pos[side][id]) : null);
  const prevUV = (side, id) => (G.isCell(base?.pos?.[side]?.[id]) ? cellPlane(base.pos[side][id]) : null);
  const pb = base?.ball || null;
  const nf = next.ball?.flight || null;
  const pf = pb?.flight || null;
  let gp; // 공 땅 자리 (판 px)
  let lift = 0;
  if (goalEv && prev) {
    // 골: prev 공 자리 → 골망 (골라인 너머 GOAL_DEPTH / 2, 슛 칸 깊이를 골 행 안으로)
    const from = ballPlane(prev, prevUVOf(prev), W);
    const to = goalMouth(goalEv.side, evs);
    gp = { u: lerp(from.u, to.u, a), v: lerp(from.v, to.v, a) };
    lift = arcAt(from, to, a, W, H) * SHOT_ARC;
  } else if (!base) {
    gp = ballPlane(next, nowUV, W);
  } else if (holder && pb?.holder && pb.holder.side === holder.side && pb.holder.id === holder.id) {
    gp = ballPlane(next, nowUV, W); // 같은 선수가 계속 — 보간된 발 앞
  } else {
    const from = ballPlane(pb ? base : next, prevUV, W);
    const to = ballPlane(next, nextUV, W);
    gp = { u: lerp(from.u, to.u, a), v: lerp(from.v, to.v, a) };
    const cf = nf?.cross ? nf : pf?.cross ? pf : null; // 이번 턴 날고 있는 (또는 막 끝난) 크로스
    if (cf) {
      const n = cf.path.length || 1;
      const p0 = sameFlight(pf, cf) ? pf.at / n : 0;
      const p1 = nf && cf === nf ? nf.at / n : 1;
      const t = lerp(p0, p1, a);
      const start = cellPlane(flightFrom(cf, next.events));
      const end = cellPlane(cf.target);
      lift = 4 * t * (1 - t) * peakLift(start, end, W, H);
    } else {
      // 이번 턴에 떠서 이번 턴에 내려앉은 짧은 크로스 (prev · next 둘 다 비행 없음): 비행 전체 = 이번 턴 → t = alpha
      const ce = evs.find((x) => x.type === 'pass' && x.cross && G.isCell(x.fromCell) && G.isCell(x.target));
      if (ce) lift = 4 * a * (1 - a) * peakLift(cellPlane(ce.fromCell), cellPlane(ce.target), W, H);
    }
  }
  const g = V.projectPlane(gp.u, gp.v, W, H);
  const ball = {
    u: gp.u, v: gp.v, sx: g.sx, sy: g.sy - lift, s: g.s, d: BALL_D * g.s, lift,
    shadow: { sx: g.sx, sy: g.sy, w: SHADOW_W * g.s * (1 - 0.3 * Math.min(1, lift / (V.V25.BALL_LIFT * g.s || 1))), h: SHADOW_H * g.s },
  };

  const side = possessionOf(next);
  return {
    turn: next.turn, alpha: a, kickoff, goal: goalEv ? { side: goalEv.side, playerId: goalEv.playerId } : null,
    players, ball,
    focus: V.planeToField(gp.u, gp.v), attackRight: attackRightOf(side || 'home'),
    carrierKey: holder ? `${holder.side}:${holder.id}` : null,
  };
}

function prevUVOf(state) {
  return (side, id) => (G.isCell(state.pos?.[side]?.[id]) ? cellPlane(state.pos[side][id]) : null);
}

/** 골망 자리 (판 px): 득점 팀이 공격한 골 — 골라인 너머 GOAL_DEPTH / 2, 깊이는 슛 칸을 골 행 5 ~ 7 안으로 자른 값 */
function goalMouth(side, evs) {
  const right = attackRightOf(side);
  const shot = evs.find((x) => x.type === 'shot' && x.side === side && x.success);
  const lo = crPlane(0, G.GOAL_ROWS[0]).v;
  const hi = crPlane(0, G.GOAL_ROWS[G.GOAL_ROWS.length - 1]).v;
  const v0 = shot && G.isCell(shot.cell) ? cellPlane(shot.cell).v : (lo + hi) / 2;
  const u = right ? RU + FL + V.V25.GOAL_DEPTH / 2 : RU - V.V25.GOAL_DEPTH / 2;
  return { u, v: Math.min(hi, Math.max(lo, v0)) };
}

/** 두 판 점 사이 호 꼭대기 (화면 px) — 화면 길이 · 가운데 배율로 V.arcLift */
function peakLift(a, b, W, H) {
  const pa = V.projectPlane(a.u, a.v, W, H);
  const pb = V.projectPlane(b.u, b.v, W, H);
  const pm = V.projectPlane((a.u + b.u) / 2, (a.v + b.v) / 2, W, H);
  return V.arcLift(Math.hypot(pb.sx - pa.sx, pb.sy - pa.sy), pm.s);
}

function arcAt(a, b, t, W, H) {
  return 4 * t * (1 - t) * peakLift(a, b, W, H);
}
