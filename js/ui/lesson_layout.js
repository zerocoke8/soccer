// js/ui/lesson_layout.js — 레슨 화면(screens/lesson.js) 좌표 · 연출 계획. DOM 이 없는 순수 함수 (test/lessonLayout.test.mjs).
// LESSON_PROTO_PLAN §6.3 "레슨 화면": 경기 화면과 같은 가로 필드 — 우리 골 = 왼쪽 (x 0), 상대 골 = 오른쪽 (x 100), y 0 = 위 터치라인.
// 좌표는 모두 필드 사각형(.m-field) 안의 % (x = 가로, y = 세로).
//
//   tokenSpot(slot, slots)   선수 토큰의 평소 자리 = 편성 미니 필드와 같은 줄 (lineup.slotSpot, spread)
//   drillSpot(stat, i, n)    훈련 지점: 레슨 종목마다 대상 선수가 "우르르" 달려가는 자리 (n 명 중 i 번째)
//   drillZone(stat)          훈련장 표시 사각형 (훈련 지점을 모두 품는다)
//   fxPlan(lastFx)           엔진 lastFx(§5.3.5) → 연출 단계 (카드 · 턴 끝 · 레슨 끝)
import { slotSpot } from './lineup.js';

/** 레슨 화면 필드의 기준 크기 (논리 px — css/lesson.css 의 그리드에서 나온 값, jsdom 처럼 레이아웃이 없을 때 쓴다) */
export const FIELD_PX = { w: 968, h: 392 };
/** 토큰 지름 (논리 px, css/lesson.css .lesson-screen .m-field --tok) */
export const TOKEN_PX = 40;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const r1 = (x) => Math.round(x * 10) / 10;

/** lo..hi 를 n 명이 고르게 나눠 쓰는 i 번째 값 (1명이면 가운데) */
function spread(i, n, lo, hi) {
  if (n <= 1) return (lo + hi) / 2;
  return lo + ((hi - lo) * i) / (n - 1);
}

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

/** 종목별 훈련장 (§6.3 표) — 훈련 지점이 이 안에 놓인다 */
const ZONES = {
  shoot: [{ x: 78, y: 7, w: 16, h: 86, shape: 'rect' }],           // 상대 박스 앞
  dribble: [{ x: 54, y: 22, w: 27, h: 56, shape: 'rect' }],        // 오른쪽 하프 콘 지그재그
  pass: [{ x: 39, y: 18, w: 22, h: 64, shape: 'ellipse' }],        // 센터서클 둘레
  defense: [{ x: 14, y: 7, w: 18, h: 86, shape: 'rect' }],         // 우리 박스 앞
  physical: [{ x: 20, y: 0, w: 60, h: 19, shape: 'rect' }, { x: 20, y: 81, w: 60, h: 19, shape: 'rect' }], // 터치라인 따라
};

/**
 * 훈련장 표시 사각형 (%). 알 수 없는 종목이면 빈 배열.
 * @param {string} stat
 * @returns {Array<{ x: number, y: number, w: number, h: number, shape: 'rect'|'ellipse' }>}
 */
export function drillZone(stat) {
  return (ZONES[stat] || []).map((z) => ({ ...z }));
}

/**
 * 훈련 지점 (%): n 명 중 i 번째 (0 부터). 여러 명은 세로로 나눠 퍼진다.
 *   shoot    상대 박스 앞 x 81–90 — 4명까지 골문을 둘러싼 반원, 5명부터 엇갈린 두 줄 (x 81 · 90)
 *   dribble  오른쪽 하프 x 57–78 — 콘 사이 지그재그 (위 · 아래 번갈아)
 *   pass     센터서클 둘레 — 삼각형(3명) · 원 (위에서 시계 방향)
 *   defense  우리 박스 앞 x 18–28 — 엇갈려 (5명부터 두 줄 x 18 · 27)
 *   physical 위 · 아래 터치라인 y 9 / 91 을 따라 (번갈아)
 * @param {string} stat
 * @param {number} i
 * @param {number} n
 * @returns {{ x: number, y: number }}
 */
export function drillSpot(stat, i, n) {
  const cnt = Math.max(1, Math.floor(Number(n) || 1));
  const k = clamp(Math.floor(Number(i) || 0), 0, cnt - 1);
  switch (stat) {
    case 'shoot':
    case 'defense': {
      // 4명까지 = 한 줄 (슈팅은 골문을 둘러싼 반원), 5명부터 = 엇갈린 두 줄 (토큰 · 이름표 · +N 팝이 겹치지 않게)
      const near = stat === 'shoot' ? 90 : 18; // 골에 가까운 줄
      const far = stat === 'shoot' ? 81 : 27;
      if (cnt <= 4) {
        const half = Math.min(24, 9 * (cnt - 1)); // 2명 41/59 · 3명 32/50/68 · 4명 26–74
        const y = spread(k, cnt, 50 - half, 50 + half);
        const x = stat === 'shoot'
          ? (cnt === 1 ? 86 : 82 + 8 * (Math.abs(y - 50) / 24))
          : (cnt === 1 ? 23 : k % 2 === 0 ? 20 : 26);
        return { x: r1(clamp(x, stat === 'shoot' ? 82 : 18, stat === 'shoot' ? 90 : 28)), y: r1(y) };
      }
      const a = Math.ceil(cnt / 2);
      const b = cnt - a;
      const inA = k % 2 === 0;
      const j = Math.floor(k / 2);
      const stepA = (84 - 16) / (a - 1);
      const y = inA ? spread(j, a, 16, 84) : spread(j, b, 16 + stepA / 2, 84 - stepA / 2);
      return { x: inA ? far : near, y: r1(y) };
    }
    case 'dribble': {
      const x = spread(k, cnt, 57, 78);
      const y = cnt === 1 ? 50 : k % 2 === 0 ? 33 : 67;
      return { x: r1(x), y };
    }
    case 'pass': {
      const a = -Math.PI / 2 + (2 * Math.PI * k) / cnt; // 위에서 시작, 시계 방향
      return { x: r1(50 + 8 * Math.cos(a)), y: r1(50 + 22 * Math.sin(a)) };
    }
    case 'physical': {
      const top = Math.ceil(cnt / 2);
      const bottom = cnt - top;
      const onTop = k % 2 === 0;
      const j = Math.floor(k / 2);
      const m = onTop ? top : bottom;
      return { x: r1(spread(j, m, 26, 74)), y: onTop ? 9 : 91 };
    }
    default:
      return { x: 50, y: r1(spread(k, cnt, 20, 80)) };
  }
}

/**
 * 대상 선수 id 목록 → { id: 훈련 지점 } (목록 순서대로 i 번째)
 * @param {string} stat
 * @param {string[]} ids
 */
export function drillSpots(stat, ids) {
  const out = {};
  ids.forEach((id, i) => { out[id] = drillSpot(stat, i, ids.length); });
  return out;
}

/**
 * 엔진 lastFx(§5.3.5) → 연출 단계. 순서: 카드(비용 → 상승 · 실패 → 회복 · 버프 · 팀워크) → 턴 끝(분위기 틱 · turnEnd · 새 손패) → 레슨 끝(자율 훈련 · 회복 · end).
 *  - play.targets = 상승 · 실패가 나온 선수 (훈련 지점으로 달려가는 선수, 엔진 순서 = 대상 T 순서)
 *  - play.heal = 카드 효과 · 쉬기 회복 (선수별 합), play.buffs = 바뀐 버프 키 (마지막 값), play.tw = 팀워크 합
 *  - turn = 턴 끝이 있었으면 { ticks: { id: n }, turn, buffs } (없으면 null), draw = 새 손패 uid (없으면 null)
 *  - end = 레슨 끝이면 { status, auto: { id: n }, heal: { id: n } } (없으면 null)
 * @param {Array<object>} fx
 */
export function fxPlan(fx) {
  const play = { targets: [], cost: {}, gain: {}, fail: {}, heal: {}, buffs: {}, tw: 0 };
  let turn = null;
  let end = null;
  let draw = null;
  let seg = 'play';
  const add = (o, id, n) => { o[id] = (o[id] || 0) + n; };
  const turnSeg = () => {
    if (!turn) turn = { ticks: {}, turn: null, buffs: {}, heal: {} };
    return turn;
  };
  const endSeg = () => {
    if (!end) end = { status: null, auto: {}, heal: {} };
    return end;
  };
  for (const e of Array.isArray(fx) ? fx : []) {
    if (!e || typeof e !== 'object') continue;
    if (e.t === 'gain' && e.auto) seg = 'end';
    else if (e.t === 'tick' && seg === 'play') seg = 'turn';
    switch (e.t) {
      case 'cost':
        add(play.cost, e.id, Number(e.n) || 0);
        break;
      case 'gain':
        if (e.auto) { add(endSeg().auto, e.id, Number(e.n) || 0); break; }
        if (!play.targets.includes(e.id)) play.targets.push(e.id);
        play.gain[e.id] = { n: (play.gain[e.id]?.n || 0) + (Number(e.n) || 0), sub: (play.gain[e.id]?.sub || 0) + (Number(e.sub) || 0) };
        break;
      case 'fail':
        if (!play.targets.includes(e.id)) play.targets.push(e.id);
        play.fail[e.id] = { n: Number(e.n) || 0, injured: !!e.injured };
        break;
      case 'heal':
        if (seg === 'end') add(endSeg().heal, e.id, Number(e.n) || 0);
        else if (seg === 'play') add(play.heal, e.id, Number(e.n) || 0);
        else add(turnSeg().heal, e.id, Number(e.n) || 0);
        break;
      case 'buff':
        if (seg === 'play') play.buffs[e.key] = e.to;
        else turnSeg().buffs[e.key] = e.to;
        break;
      case 'tw':
        play.tw += Number(e.n) || 0;
        break;
      case 'tick':
        add(turnSeg().ticks, e.id, Number(e.n) || 0);
        break;
      case 'turnEnd':
        turnSeg().turn = e.turn;
        seg = 'turn';
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
  return { play, turn, draw, end };
}

/** 점수 연출: fxPlan 의 카드 단계만 반영한 점수 (턴 끝 분위기 틱은 뒤에 더한다) */
export function scoreAfterPlay(plan, finalScore) {
  const ticks = plan?.turn?.ticks ? Object.values(plan.turn.ticks).reduce((a, b) => a + b, 0) : 0;
  return (Number(finalScore) || 0) - ticks;
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
