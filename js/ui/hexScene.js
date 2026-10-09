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
//     차는 턴 (H2): 이번 턴 pass · shot 이벤트의 차는 선수가 턴 시작에 공을 가졌으면 공은 alpha < release 동안 그 발 앞에 머물고
//     (스프라이트 pass · kick 의 발이 공에 닿는 칸까지 — 차기 전에 공이 먼저 떠나지 않게) 나머지 (1 − release) 동안 날아간다.
//     차는 선수가 같은 턴에 칸을 옮기면 공은 그 보간된 발 앞을 따라가다 release 순간 자리에서 떠난다 (예전 자리에 공만 남지 않게).
//     frame.release = 이번 턴에 쓴 release (차는 턴이 아니면 0) — 화면이 공 가진 선수 표시를 넘기는 때를 이만큼 미룬다.
//
// 필살기 (H3): frame.players[i].ult = 이번 턴 (next.turn) cutin 이벤트의 선수 (쓰는 턴 — Pixi 분홍 바닥 고리 · 빛),
//   .ultReady = opts.ultReady (화면이 넘기는 'side:id' 묶음 — 사람 쪽 준비 · 켬 선수, Pixi 가는 분홍 고리). 캔버스에 글자 없음.
//
// [구현 결정] (H1):
//  - 공 가진 선수의 공 = 발에서 공격 방향 (골 축) 으로 46 · 0.35 · s 화면 px, 깊이 쪽 (가까운 쪽) 4 · s 화면 px — 예전 ballPx 와 같은 크기를 판 px 로 바꿔 둔다.
//  - 쉬는 선수 (resting) = restUntil ≥ next.turn — 넘어진 턴 · 그다음 턴 동안 넘어진 모습.
//  - 슛 (골) 의 공은 골라인 너머 GOAL_DEPTH / 2 · 슛 칸 깊이를 골 행 5 ~ 7 안으로 자른 곳, 얕은 호 (크로스 호의 0.35).
//  - 시계는 경기 시간 (턴 × 0.4 초, 결정 16) — 재생 속도 (tick ms · 배속) 와 상관없다. 남은 초는 올림.
//
// 동작 (H2 — 문서 §5.3 · §7 H2, frame.players[i].act · actKey · facing — Pixi 층이 스프라이트 시트를 고른다):
//   act = spriteAnim ANIM_ACTIONS 하나. 보여 주는 턴 (next.turn) 의 이벤트와 prev → next 이동으로 정한다 (위가 먼저):
//    1) 킥오프 자리 그림 (next 에 kickoff, 골 턴 연출 아님) → 모두 idle.
//    2) 승부차기 → 마지막 킥의 키커 kick · 그 GK block, 나머지 idle.
//    3) 골 장면 (opts.goalScene) 의 득점자 → celebrate (끝 자세).
//    4) 이번 턴 이벤트: 패스한 선수 pass (크로스 · 노린 칸까지 LONG_PASS 칸 이상 = kick) · 슛 kick (헤더 = header) ·
//       태클한 선수 tackle (성공 · 실패 모두 — 실패면 다음 턴이 넘어짐) · 가로채기 성공 tackle · 공중볼 수비 block · 선방한 GK block.
//    5) 쉬는 선수 (넘어져 1턴 쉼 — resting) → fall (끝 자세). 골 턴 (골 → 킥오프) 은 엔진 킥오프가 restUntil 을 지우므로
//       지난 턴 태클에 실패한 선수를 이벤트로 찾아 fall (FALL_AFTER_SLIDE) · resting = true 로 둔다.
//    6) 칸을 옮겼다 (보간 중인 1칸) → run, 그중 턴 시작과 끝에 공을 가진 선수 → dribble. 그 밖 → idle.
//   actKey = 한 번 · 끝 자세 동작은 `${turn}:${act}` (넘어짐은 `${restUntil}:fall` — 쉬는 턴 내내 같은 키, 승부차기는 킥 번호까지),
//     반복 동작 (idle · run · dribble) 은 act 그대로 — 턴이 바뀌어도 이어 돈다. 키가 바뀌면 화면이 그 동작을 처음부터.
//   actSpan = null | [from, to] — 시트의 그 구간 (0 ~ 1, 칸 비율) 만 재생 (태클 실패 연출 — 결정 12, 문서 §2.2):
//     태클 실패 턴의 태클 = FAIL_SLIDE_SPAN (뛰어들어 미끄러진 데까지 — 일어서는 끝 칸은 빼고 누운 칸에서 멈춤),
//     그다음 쉬는 턴의 넘어짐 = FALL_AFTER_SLIDE (주저앉은 칸부터 — 미끄러져 누운 뒤 다시 서서 넘어지지 않게).
//   facing 'r' | 'l' (그림은 오른쪽이 기본): 반복 동작 = V.facing (공 가진 선수는 공격 방향, 나머지는 공 쪽).
//     한 번 동작은 동작 방향으로 고정 (턴 도중 공이 지나가도 돌아서지 않게): 패스 = 노린 칸 쪽, 슛 · 헤더 · 세리머니 = 공격 방향,
//     태클 = 뛰어든 칸 (공 가진 선수가 있던 칸) 쪽, 넘어짐 = 그 태클과 같은 쪽. 가로 차이가 2px 아래면 V.facing.

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

/** 패스 → kick 으로 보는 거리 (칸, 노린 칸까지 — 이보다 짧으면 pass) */
export const LONG_PASS = 5;
/** 태클 실패 턴의 태클 구간 · 그다음 쉬는 턴의 넘어짐 구간 (시트 칸 비율 — 실루엔 시트: 태클 12칸 중 0 ~ 8 이 뛰어들어 미끄러짐, 넘어짐 8 ~ 11 이 주저앉음) */
export const FAIL_SLIDE_SPAN = Object.freeze([0, 0.75]);
export const FALL_AFTER_SLIDE = Object.freeze([0.67, 1]);
/** 반복 동작 (actKey = act — 턴이 바뀌어도 이어 돈다) */
export const LOOP_ACTS = Object.freeze(['idle', 'run', 'dribble']);
/** 차는 턴에 공이 발을 떠나는 진행도 (0 ~ 1 — 실루엔 pass 시트 발이 공에 닿는 칸 5/12 · kick 4/12 사이). 화면이 배속 따라 늘인다 (frameAt opts.release) */
export const BALL_RELEASE = 0.38;

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

/** 발 (u, v) → 공격 방향 (dirX 가 있으면 그쪽 — −1 ~ 1) 으로 발 앞 공 자리 (판 px) — 화면 px 크기를 가까운 터치라인 배율 (W / FL) 로 나눠 판 px 로 */
function aheadOf(p, side, W, dirX = null) {
  const kNear = W / FL;
  const dir = Number.isFinite(dirX) ? dirX : attackRightOf(side) ? 1 : -1;
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
 * @param {{ W: number, H: number, sprite?: (charId: string) => ({ w: number, h: number, footX: number }|null), goalScene?: boolean, release?: number }} size
 *   필드 영역 크기 + sprite (그 캐릭터의 정지 스프라이트 크기 — art.spriteOf, 있으면 figure 가 스프라이트 키 72 · s) · goalScene (골 장면 — 득점자 celebrate)
 *   · release (차는 턴에 공이 발을 떠나는 진행도, 기본 BALL_RELEASE — 머리 주석 "공")
 *   · ultReady (H3 — 필살기 준비 고리를 그릴 선수 key 'side:id' 묶음 · 화면이 사람 쪽만 넘긴다). p.ult = 이번 턴 (next.turn) cutin 이벤트의 선수
 *     (필살기를 쓴 턴 — 분홍 바닥 고리 · 빛)
 * @returns {{
 *   turn: number, alpha: number, kickoff: boolean, goal: null|{ side: string, playerId: string },
 *   players: Array<{ key: string, side: 'home'|'away', id: string, name: string, role: string, u: number, v: number,
 *     sx: number, sy: number, s: number, ga: number, figure: { fh: number, hw: number }, ground: { w: number, h: number },
 *     color: string, charId: string|null, carrier: boolean, resting: boolean, z: number, ult: boolean, ultReady: boolean,
 *     act: string, actKey: string, facing: 'r'|'l', actSpan: null|number[] }>,
 *   ball: { u: number, v: number, sx: number, sy: number, s: number, d: number, lift: number,
 *     shadow: { sx: number, sy: number, w: number, h: number } },
 *   focus: { x: number, y: number }, attackRight: boolean, carrierKey: string|null, release: number
 * }}
 */
export function frameAt(prev, next, alpha, { W, H, sprite = null, goalScene = false, release = BALL_RELEASE, ultReady = null }) {
  const a = clamp01(Number(alpha) || 0);
  const e = easeOut(a);
  const evs = eventsOfTurn(next);
  // 이번 턴에 필살기를 쓴 선수 (cutin 이벤트 — H3)
  const ultKeys = new Set(evs.filter((x) => x.type === 'cutin').map((x) => `${x.side}:${x.playerId}`));
  const readyHas = (k) => !!(ultReady && typeof ultReady.has === 'function' && ultReady.has(k));
  const kickoff = evs.some((x) => x.type === 'kickoff');
  const goalEv = evs.find((x) => x.type === 'goal') || null;
  const goalReset = !!(prev && goalEv && kickoff); // 골 → 킥오프: 선수는 prev 자리 그대로, 공만 골망으로
  const base = prev && !(kickoff && !goalReset) ? prev : null; // null = 바로 next 자리
  const holder = next.ball?.holder || null;

  // 선수 판 자리 (ee = 보간 진행도 easeOut(alpha) — 차는 턴의 공이 떠나는 순간 자리도 같은 식으로)
  const uvAt = (side, id, ee) => {
    const nc = next.pos[side]?.[id];
    if (!G.isCell(nc)) return null;
    const pc = base?.pos?.[side]?.[id];
    const np = cellPlane(nc);
    if (pc == null || !G.isCell(pc)) return np;
    const pp = cellPlane(pc);
    if (goalReset) return pp;
    if (G.distance(pc, nc) >= 2) return np;
    return { u: lerp(pp.u, np.u, ee), v: lerp(pp.v, np.v, ee) };
  };
  const uv = { home: {}, away: {} };
  for (const side of ['home', 'away']) {
    for (const id of Object.keys(next.pos[side])) uv[side][id] = uvAt(side, id, e) || cellPlane(next.pos[side][id]);
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
      const spr = typeof sprite === 'function' && pl.charId ? sprite(pl.charId) : null;
      const fig = V.figureSize(pr.s, spr || undefined);
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
        ult: ultKeys.has(`${side}:${id}`),
        ultReady: readyHas(`${side}:${id}`),
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
  // 차는 턴: 턴 시작에 공을 가진 선수가 이번 턴 패스 · 슛 → 공은 release 까지 발 앞, 그 뒤 날아간다 (ta = 비행 진행도)
  const kh = (goalEv && prev ? prev.ball?.holder : pb?.holder) || null;
  const kicks = !!(kh && base !== null && evs.some((x) => (x.type === 'pass' && x.side === kh.side && String(x.from) === String(kh.id))
    || (x.type === 'shot' && x.side === kh.side && String(x.playerId) === String(kh.id))));
  const rel = kicks ? Math.min(0.9, Math.max(0, Number(release) || 0)) : 0;
  const ta = rel > 0 ? clamp01((a - rel) / (1 - rel)) : a;
  // 차는 선수가 이번 턴에 칸도 옮기면 (패스하고 비키기) 공은 그 선수의 보간된 발 앞에 머물다 떠나는 순간 자리에서 날아간다
  // 공은 발 앞 (공격 방향) 에서 차는 쪽 발 앞으로 굴려 놓고 떠난다 (뒤로 주는 패스가 등 뒤에서 출발하지 않게)
  const kp = rel > 0 ? uvAt(kh.side, String(kh.id), easeOut(rel)) : null;
  let kickFrom = null;
  let kickHold = null;
  if (kp) {
    const atkDir = attackRightOf(kh.side) ? 1 : -1;
    const kt = goalEv && prev ? goalMouth(goalEv.side, evs) : ballPlane(next, nextUV, W);
    const kickDir = Math.abs(kt.u - kp.u) < 1 ? atkDir : Math.sign(kt.u - kp.u);
    kickFrom = aheadOf(kp, kh.side, W, kickDir);
    if (a < rel) kickHold = aheadOf(uv[kh.side][String(kh.id)] || kp, kh.side, W, lerp(atkDir, kickDir, easeOut(a / rel)));
  }
  let gp; // 공 땅 자리 (판 px)
  let lift = 0;
  if (goalEv && prev) {
    // 골: prev 공 자리 → 골망 (골라인 너머 GOAL_DEPTH / 2, 슛 칸 깊이를 골 행 안으로)
    const from = kickFrom || ballPlane(prev, prevUVOf(prev), W);
    const to = goalMouth(goalEv.side, evs);
    gp = kickHold || { u: lerp(from.u, to.u, ta), v: lerp(from.v, to.v, ta) };
    lift = arcAt(from, to, ta, W, H) * SHOT_ARC;
  } else if (!base) {
    gp = ballPlane(next, nowUV, W);
  } else if (holder && pb?.holder && pb.holder.side === holder.side && pb.holder.id === holder.id) {
    gp = ballPlane(next, nowUV, W); // 같은 선수가 계속 — 보간된 발 앞
  } else {
    const from = kickFrom || ballPlane(pb ? base : next, prevUV, W);
    const to = ballPlane(next, nextUV, W);
    gp = kickHold || { u: lerp(from.u, to.u, ta), v: lerp(from.v, to.v, ta) };
    const cf = nf?.cross ? nf : pf?.cross ? pf : null; // 이번 턴 날고 있는 (또는 막 끝난) 크로스
    if (cf) {
      const n = cf.path.length || 1;
      const p0 = sameFlight(pf, cf) ? pf.at / n : 0;
      const p1 = nf && cf === nf ? nf.at / n : 1;
      const t = lerp(p0, p1, ta);
      const start = cellPlane(flightFrom(cf, next.events));
      const end = cellPlane(cf.target);
      lift = 4 * t * (1 - t) * peakLift(start, end, W, H);
    } else {
      // 이번 턴에 떠서 이번 턴에 내려앉은 짧은 크로스 (prev · next 둘 다 비행 없음): 비행 전체 = 이번 턴 → t = alpha
      const ce = evs.find((x) => x.type === 'pass' && x.cross && G.isCell(x.fromCell) && G.isCell(x.target));
      if (ce) lift = 4 * ta * (1 - ta) * peakLift(cellPlane(ce.fromCell), cellPlane(ce.target), W, H);
    }
  }
  const g = V.projectPlane(gp.u, gp.v, W, H);
  const ball = {
    u: gp.u, v: gp.v, sx: g.sx, sy: g.sy - lift, s: g.s, d: BALL_D * g.s, lift,
    shadow: { sx: g.sx, sy: g.sy, w: SHADOW_W * g.s * (1 - 0.3 * Math.min(1, lift / (V.V25.BALL_LIFT * g.s || 1))), h: SHADOW_H * g.s },
  };

  assignActs(players, { base, next, evs, kickoff, goalReset, goalEv, goalScene, holder, ballSx: ball.sx, W, H });

  const side = possessionOf(next);
  return {
    turn: next.turn, alpha: a, kickoff, goal: goalEv ? { side: goalEv.side, playerId: goalEv.playerId } : null,
    players, ball,
    focus: V.planeToField(gp.u, gp.v), attackRight: attackRightOf(side || 'home'),
    carrierKey: holder ? `${holder.side}:${holder.id}` : null,
    release: rel,
  };
}

/* ------------------------------------------------------------------ */
/* 동작 (H2)                                                              */
/* ------------------------------------------------------------------ */

const otherSide = (side) => (side === 'home' ? 'away' : 'home');

/** 칸 a → 칸 b 의 화면 가로 방향 'r' | 'l' (차이가 2px 아래거나 칸이 아니면 null) */
function cellFacing(a, b, W, H) {
  if (!G.isCell(a) || !G.isCell(b)) return null;
  const pa = cellPlane(a);
  const pb = cellPlane(b);
  const dx = V.projectPlane(pb.u, pb.v, W, H).sx - V.projectPlane(pa.u, pa.v, W, H).sx;
  return Math.abs(dx) < 2 ? null : dx > 0 ? 'r' : 'l';
}

/**
 * 이번 턴 이벤트 → 선수 key → { act, key?, face?: 'attack' | [칸, 칸] } (한 번 동작 — 머리 주석 4).
 * 같은 선수가 여러 이벤트에 나오면 뒤 이벤트 (예: 공중볼을 이긴 뒤 헤더 슛).
 */
function eventActs(evs) {
  const out = new Map();
  const set = (side, id, act, face = null) => { if (side && id != null) out.set(`${side}:${id}`, { act, face }); };
  for (const e of evs) {
    switch (e.type) {
      case 'pass': {
        const to = G.isCell(e.intended) ? e.intended : e.target;
        const far = !!e.cross || (G.isCell(e.fromCell) && G.isCell(to) && G.distance(e.fromCell, to) >= LONG_PASS);
        set(e.side, e.from, far ? 'kick' : 'pass', [e.fromCell, to]);
        break;
      }
      case 'shot': set(e.side, e.playerId, e.header ? 'header' : 'kick', 'attack'); break;
      case 'tackle': {
        set(e.side, e.tacklerId, 'tackle', [e.tacklerFrom, e.carrierFrom]);
        if (!e.success) out.get(`${e.side}:${e.tacklerId}`).span = FAIL_SLIDE_SPAN;
        break;
      }
      case 'intercept': if (e.success) set(e.side, e.defenderId, 'tackle'); break;
      case 'aerial': set(otherSide(e.side), e.defenderId, 'block'); break;
      case 'save': set(e.side, e.gkId, 'block'); break;
      default: break;
    }
  }
  return out;
}

/** frame.players 에 act · actKey · facing 을 붙인다 (머리 주석 "동작") */
function assignActs(players, { base, next, evs, kickoff, goalReset, goalEv, goalScene, holder, ballSx, W, H }) {
  const turn = next.turn;
  const snap = kickoff && !goalReset; // 킥오프 자리 그림
  const pens = next.stage === 'penalties' ? evs.filter((e) => e.type === 'penalty') : [];
  const pk = pens.length ? pens[pens.length - 1] : null;
  const pkN = next.penalties?.kicks?.length ?? pens.length;
  const once = snap || pk ? new Map() : eventActs(evs);
  const ph = base?.ball?.holder || null;
  const held = (p) => !!(ph && ph.side === p.side && String(ph.id) === p.id);
  const holds = (p) => !!(holder && holder.side === p.side && String(holder.id) === p.id);
  for (const p of players) {
    const atk = attackRightOf(p.side) ? 'r' : 'l';
    const loopFacing = () => V.facing({ carrier: holds(p), attackRight: attackRightOf(p.side), sx: p.sx, ballSx, side: p.side });
    const faceOf = (face) => (face === 'attack' ? atk : Array.isArray(face) ? cellFacing(face[0], face[1], W, H) : null) || loopFacing();
    let act = 'idle';
    let key = null;
    let face = null;
    let span = null;
    let failTk = null;
    const restUntil = next.live?.[p.side]?.[p.id]?.restUntil;
    const ev = once.get(p.key);
    if (snap) {
      act = 'idle';
    } else if (pk) {
      if (pk.side === p.side && String(pk.playerId) === p.id) { act = 'kick'; key = `${turn}:pk${pkN}:kick`; face = 'attack'; }
      else if (pk.side !== p.side && String(pk.defenderId) === p.id) { act = 'block'; key = `${turn}:pk${pkN}:block`; }
    } else if (goalScene && goalEv && goalEv.side === p.side && String(goalEv.playerId) === p.id) {
      act = 'celebrate';
      face = 'attack';
    } else if (ev) {
      act = ev.act;
      face = ev.face;
      span = ev.span || null;
    } else if (p.resting) {
      act = 'fall';
      key = `${restUntil}:fall`;
      // 넘어진 쪽 = 그 태클의 방향 (태클 턴 = restUntil − 1)
      const tk = eventsOfTurn(next, restUntil - 1).find((e) => e.type === 'tackle' && e.side === p.side && String(e.tacklerId) === p.id);
      face = tk ? [tk.tacklerFrom, tk.carrierFrom] : null;
      if (tk && !tk.success) span = FALL_AFTER_SLIDE;
    } else if (goalReset && (failTk = failedTackleBefore(next, p))) {
      // 골 턴 (골 → 킥오프): 엔진 킥오프가 restUntil 을 모두 지워 resting 이 꺼지지만, 지난 턴 태클에 실패한 선수는 (그 자리 그대로)
      // 골 장면 동안 넘어져 있다 — 결정 12 연출이 "제치고 골" 장면에서 끊기지 않게. 스탠디 · 정지 그림도 눕힌다 (resting).
      act = 'fall';
      key = `${turn}:fall`;
      face = [failTk.tacklerFrom, failTk.carrierFrom];
      span = FALL_AFTER_SLIDE;
      p.resting = true;
    } else if (base && !goalReset) {
      const pc = base.pos?.[p.side]?.[p.id];
      const nc = next.pos?.[p.side]?.[p.id];
      if (G.isCell(pc) && G.isCell(nc) && pc !== nc && G.distance(pc, nc) === 1) act = held(p) && holds(p) ? 'dribble' : 'run';
    }
    p.act = act;
    p.actKey = key || (LOOP_ACTS.includes(act) ? act : `${turn}:${act}`);
    p.facing = face ? faceOf(face) : loopFacing();
    p.actSpan = span;
  }
}

/** 지난 턴 (next.turn − 1) 에 그 선수가 실패한 태클 이벤트 | null (골 턴의 넘어짐 — assignActs) */
function failedTackleBefore(next, p) {
  return eventsOfTurn(next, next.turn - 1).find((e) => e.type === 'tackle' && !e.success && e.side === p.side && String(e.tacklerId) === p.id) || null;
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
