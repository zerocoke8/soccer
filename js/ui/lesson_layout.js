// js/ui/lesson_layout.js — 레슨 화면(screens/lesson.js) 좌표 · 연출 계획. DOM 이 없는 순수 함수 (test/lessonLayout.test.mjs).
// LESSON_PROTO_PLAN §6.3 · §14.2 · §14.16: 경기 화면과 같은 가로 필드 — 우리 골 = 왼쪽 (x 0), 상대 골 = 오른쪽 (x 100), y 0 = 위 터치라인.
// 좌표는 모두 필드 사각형(.m-field) 안의 % (x = 가로, y = 세로). 구역 · 원 판정은 엔진(zones.js — 필드 %)이 하고, 여기는 화면 ↔ 필드 변환만.
//
//   tokenSpot(slot, slots)        선수 토큰의 편성 자리 (lineup.slotSpot, spread) — 경기장에 없는 선수(벤치 · 결장)의 기준 자리
//   tokenSpots(view)              경기장 선수 토큰 자리 = 엔진 뷰 positions (구역 대형). 벤치 · 결장은 null
//   pointerToField(cx, cy, rect)  포인터(client px) → 필드 % { x, y, inside } (rect = .m-field getBoundingClientRect — 무대 scale 포함)
//   circlePx(r, aspect, W, H)     원 반지름 r(u) → 그리기용 { rx, ry } px (화면에서 동그랗다)
//   fxPlan(lastFx)                엔진 lastFx(§14.13) → 연출 단계 (카드 · 턴 끝 기본 훈련 · 벤치 회복 · 흩어지기 · 새 손패 · 레슨 끝)
import { slotSpot } from './lineup.js';

/** 레슨 화면 필드의 기준 크기 (논리 px — css/lesson.css 의 그리드에서 나온 값, jsdom 처럼 레이아웃이 없을 때 쓴다) */
export const FIELD_PX = { w: 968, h: 392 };
/** 토큰 지름 (논리 px, css/lesson.css .lesson-screen .m-field --tok) */
export const TOKEN_PX = 40;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * 선수 토큰 평소 자리 (%). 편성 · 미팅 미니 필드와 같은 줄: GK 12.5 · DF 37.5 · MF 62.5 · FW 87.5, 같은 줄은 위아래로 벌린다.
 * @param {string} slot
 * @param {string[]} slots 포메이션 슬롯 전부
 * @returns {{ x: number, y: number }}
 */
export function tokenSpot(slot, slots) {
  const s = slotSpot(slot, slots, { spread: true });
  return { x: s.x, y: s.y };
}

/**
 * 경기장 선수 토큰 자리 (§14.16 "토큰은 v.positions 에 둔다"): 뷰 players 순서대로 { id: {x, y} | null }.
 * 경기장 선수 = 뷰 positions 에 있는 선수 (엔진 zones.zonePositions — 구역 중심 둘레 대형). 벤치 · 결장 = null (벤치 칸 · 명단에 그린다).
 * @param {{ players?: Array<{ id: string }>, positions?: Record<string, {x:number, y:number}> }} view getLessonView
 * @returns {Record<string, {x:number, y:number}|null>}
 */
export function tokenSpots(view) {
  const pos = (view && view.positions) || {};
  const ids = Array.isArray(view?.players) ? view.players.map((p) => p.id) : Object.keys(pos);
  const out = {};
  for (const id of ids) {
    const s = pos[id];
    out[id] = s && Number.isFinite(s.x) && Number.isFinite(s.y) ? { x: s.x, y: s.y } : null;
  }
  return out;
}

/**
 * 포인터 → 필드 % (§14.16 카드 끌기 3번). rect = .m-field 의 getBoundingClientRect() (무대 scale 을 포함한 화면 px).
 * x · y 는 [0, 100] 으로 자르고 소수 2자리, inside = 포인터가 필드 사각형 안(경계 포함)인가 (밖에서 놓으면 취소).
 * rect 가 비었으면(폭 · 높이 0) null.
 * @param {number} clientX
 * @param {number} clientY
 * @param {{ left: number, top: number, width: number, height: number }} rect
 * @returns {{ x: number, y: number, inside: boolean } | null}
 */
export function pointerToField(clientX, clientY, rect) {
  const w = Number(rect?.width);
  const hh = Number(rect?.height);
  if (!(w > 0) || !(hh > 0) || !Number.isFinite(Number(clientX)) || !Number.isFinite(Number(clientY))) return null;
  const fx = ((Number(clientX) - Number(rect.left || 0)) / w) * 100;
  const fy = ((Number(clientY) - Number(rect.top || 0)) / hh) * 100;
  const inside = fx >= 0 && fx <= 100 && fy >= 0 && fy <= 100;
  return { x: r2(clamp(fx, 0, 100)), y: r2(clamp(fy, 0, 100)), inside };
}

/**
 * 원 반지름 r (u = 필드 폭의 1%) → 그리기용 타원 반지름 px (§14.2): rx = r·W/100, ry = (r/aspect)·H/100.
 * W · H = 측정한 필드 크기 — 1280×720 무대(aspect = H/W)에서는 rx = ry (화면에서 동그랗다), 엔진 판정(distU)과 같은 모양.
 * @param {number} r 반지름 (u)
 * @param {number} aspect 데이터 상수 (lesson.json zones.aspect)
 * @param {number} [W] 필드 폭 px (기본 FIELD_PX.w)
 * @param {number} [H] 필드 높이 px (기본 FIELD_PX.h)
 * @returns {{ rx: number, ry: number }}
 */
export function circlePx(r, aspect, W = FIELD_PX.w, H = FIELD_PX.h) {
  const rr = Math.max(0, Number(r) || 0);
  const a = Number(aspect) > 0 ? Number(aspect) : FIELD_PX.h / FIELD_PX.w;
  return { rx: r2((rr * W) / 100), ry: r2(((rr / a) * H) / 100) };
}

/**
 * 엔진 lastFx(§14.13) → 연출 단계. 엔진 순서:
 *   카드   cost → gain · fail → heal · buff · tw (카드 effects) → (퍼펙트면 end)
 *   턴 끝  base (기본 훈련) · cost(src base) → heal(src bench) → buff (분위기 감소) → turnEnd → (레슨 끝: heal · end) | (scatter → draw)
 *   벤치   bench 하나 (benchPlayer)
 *  - play.targets = 상승 · 실패가 나온 선수 (제자리에서 훈련 동작, 엔진 순서 = 대상 T 순서), play.gain[id] = { n, sub, stat, subStat }, play.fail[id] = { n, injured, stat }
 *  - play.heal = 카드 효과 회복 (선수별 합), play.buffs = 바뀐 버프 키 (마지막 값), play.tw = 팀워크 합
 *  - turn = 턴 끝이 있었으면 { base: { id: n }, baseStat: { id: stat }, baseCost: { id: n }, bench: { id: 회복 }, heal: { id: n }, buffs, turn } (없으면 null)
 *  - scatter = 새 턴 흩어지기 { id: zone } (없으면 null), draw = 새 손패 uid (없으면 null)
 *  - bench = 벤치 행동 [{ id, on }] (없으면 [])
 *  - end = 레슨 끝이면 { status, heal: { id: n } } (턴 끝 뒤 · 퍼펙트 체력 · 한나 회복, 없으면 null)
 * @param {Array<object>} fx
 */
export function fxPlan(fx) {
  const play = { targets: [], cost: {}, gain: {}, fail: {}, heal: {}, buffs: {}, tw: 0 };
  let turn = null;
  let end = null;
  let draw = null;
  let scatter = null;
  const bench = [];
  let seg = 'play'; // play → turn (기본 훈련부터) → post (turnEnd 뒤: 레슨 끝 회복 · 흩어지기 · 손패)
  const add = (o, id, n) => { o[id] = (o[id] || 0) + n; };
  const num = (x) => Number(x) || 0;
  const turnSeg = () => {
    if (!turn) turn = { base: {}, baseStat: {}, baseCost: {}, bench: {}, heal: {}, buffs: {}, turn: null };
    return turn;
  };
  const endSeg = () => {
    if (!end) end = { status: null, heal: {} };
    return end;
  };
  for (const e of Array.isArray(fx) ? fx : []) {
    if (!e || typeof e !== 'object') continue;
    if (seg === 'play' && (e.t === 'base' || (e.t === 'cost' && e.src === 'base') || (e.t === 'heal' && e.src === 'bench'))) seg = 'turn';
    switch (e.t) {
      case 'cost':
        if (e.src === 'base') add(turnSeg().baseCost, e.id, num(e.n));
        else add(play.cost, e.id, num(e.n));
        break;
      case 'gain': {
        if (!play.targets.includes(e.id)) play.targets.push(e.id);
        const g = play.gain[e.id];
        play.gain[e.id] = { n: (g?.n || 0) + num(e.n), sub: (g?.sub || 0) + num(e.sub), stat: e.stat ?? g?.stat ?? null, subStat: e.subStat ?? g?.subStat ?? null };
        break;
      }
      case 'fail':
        if (!play.targets.includes(e.id)) play.targets.push(e.id);
        play.fail[e.id] = { n: num(e.n), injured: !!e.injured, stat: e.stat ?? null };
        break;
      case 'base':
        add(turnSeg().base, e.id, num(e.n));
        turnSeg().baseStat[e.id] = e.stat ?? null;
        break;
      case 'heal':
        if (e.src === 'bench') add(turnSeg().bench, e.id, num(e.n));
        else if (seg === 'post') add(endSeg().heal, e.id, num(e.n));
        else if (seg === 'play') add(play.heal, e.id, num(e.n));
        else add(turnSeg().heal, e.id, num(e.n));
        break;
      case 'buff':
        if (seg === 'play') play.buffs[e.key] = e.to;
        else turnSeg().buffs[e.key] = e.to;
        break;
      case 'tw':
        play.tw += num(e.n);
        break;
      case 'turnEnd':
        turnSeg().turn = e.turn;
        seg = 'post';
        break;
      case 'bench':
        bench.push({ id: e.id, on: !!e.on });
        break;
      case 'scatter':
        scatter = e.zones && typeof e.zones === 'object' ? { ...e.zones } : {};
        break;
      case 'draw':
        draw = Array.isArray(e.uids) ? e.uids.slice() : [];
        break;
      case 'end':
        endSeg().status = e.status;
        break;
      default:
        break;
    }
  }
  return { play, turn, scatter, draw, bench, end };
}

/** 점수 연출: fxPlan 의 카드 단계만 반영한 점수 (턴 끝 기본 훈련 상승은 뒤에 더한다) */
export function scoreAfterPlay(plan, finalScore) {
  const base = plan?.turn?.base ? Object.values(plan.turn.base).reduce((a, b) => a + b, 0) : 0;
  return (Number(finalScore) || 0) - base;
}

/**
 * 손패 겹치기: n 장을 폭 avail 안에 놓을 때 카드 사이 간격 (px). 다 들어가면 gap, 아니면 겹친다 (음수 margin 이 될 수 있다).
 * @returns {number} 카드 왼쪽 끝 사이 거리 (step) — 카드 폭 cardW 보다 작으면 겹친다
 */
export function handStep(n, avail, cardW, gap = 12) {
  if (n <= 1) return cardW + gap;
  const full = cardW + gap;
  if (n * cardW + (n - 1) * gap <= avail) return full;
  return Math.max(28, (avail - cardW) / (n - 1));
}
