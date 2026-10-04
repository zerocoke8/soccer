// js/ui/lesson_layout.js — 레슨 화면(screens/lesson.js) 좌표 · 연출 계획. DOM 이 없는 순수 함수 (test/lessonLayout.test.mjs).
// LESSON_PROTO_PLAN §6.3 · §14.2 · §14.16: 경기 화면과 같은 가로 필드 — 우리 골 = 왼쪽 (x 0), 상대 골 = 오른쪽 (x 100), y 0 = 위 터치라인.
// 좌표는 모두 필드 사각형(.m-field) 안의 % (x = 가로, y = 세로). 구역 · 원 판정은 엔진(zones.js — 필드 %)이 하고, 여기는 화면 ↔ 필드 변환만.
//
//   tokenSpot(slot, slots)        선수 토큰의 편성 자리 (lineup.slotSpot, spread) — 경기장에 없는 선수(벤치 · 결장)의 기준 자리
//   tokenSpots(view)              경기장 선수 토큰 자리 = 엔진 뷰 positions (구역 대형). 벤치 · 결장은 null
//   pointerToField(cx, cy, rect)  포인터(client px) → 필드 % { x, y, inside } (rect = .m-field getBoundingClientRect — 무대 scale 포함)
//   circlePx(r, aspect, W, H)     원 반지름 r(u) → 그리기용 { rx, ry } px (화면에서 동그랗다)
//   labelPlan(toks, opts)         L52: 토큰 이름표 · 실패율 표 자리 (겹치지 않는 쪽 — 흔들린 대형) · labelWidth(name, stam) 이름표 폭 추정
//   fxPlan(lastFx)                엔진 lastFx(§14.13 · §15.4) → 연출 단계 (코치 컷인 · 카드 · 턴 끝 기본 훈련 · 벤치 회복 · 흩어지기 · 새 손패 · 코치 붙기 · 레슨 끝)
//   playerStatInfo(state, id, view, thresholds)  레슨 중 선수 1명의 스탯 5개 (현재 값 · 등급 · 이번 레슨 상승 · 성장률) — 명단 줄 · 선수 정보 팝오버 (§17)
import { slotSpot } from './lineup.js';
import { gradeOf } from './dom.js';
import { STATS } from './labels.js';

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
 * 이름표 폭 추정 (논리 px, css/lesson.css .tok-name: 글자 12px 굵게 · 좌우 여백 6px · 체력 숫자 앞 4px).
 * 한글 12.5px · 그 밖 7.5px — 실제보다 조금 넓게 잡는다 (겹침 판정이 안전한 쪽).
 * @param {string} name 이름표 글자 (이름 또는 앞 2글자)
 * @param {string} [stam] 체력 숫자 (없으면 '')
 */
export function labelWidth(name, stam = '') {
  const w = (s) => Array.from(String(s ?? '')).reduce((a, ch) => a + (/[ᄀ-ᇿ㄰-㆏가-힯]/.test(ch) ? 12.5 : 7.5), 0);
  return Math.ceil(12 + w(name) + (stam ? 4 + w(stam) : 0));
}

/** 실패율 표 (⚠25%) 폭 추정 (논리 px — 글자 10px 굵게 · 여백 3px) */
export const WARN_PX = 40;

/**
 * 토큰 이름표 · 실패율 표 자리 고르기 (L52 — 흔들린 대형 §23). 다른 토큰 얼굴(테 · 체력 막대 포함) · 앞서 놓은 이름표 · 실패율 표 ·
 * 구역 라벨(obstacles) · 필드 밖과 겹치는 넓이가 가장 작은 쪽, 같으면 바깥쪽을 먼저 고른다.
 *   이름표: 'below' (얼굴 아래, 기본) · 'right' (lp-r) · 'left' (lp-l) · 'above' (lp-u, 마지막) — 옆으로 벌어진 선수는 옆(바깥), 나머지는 아래가 먼저.
 *   실패율 표: 얼굴 바깥쪽 위 모서리 (구역 중심보다 왼쪽이면 왼쪽 = wl) → 반대쪽 위 → 아래 모서리 (wd). 자기 이름표와도 겹치지 않게.
 * 자리가 적은(얼굴에 막힌 쪽이 많은) 토큰부터 놓는다. DOM 이 없는 순수 함수 — 같은 입력이면 같은 결과.
 * @param {Array<{ id: string, x: number, y: number, cx: number, cy: number, w: number, warn?: boolean }>} toks
 *   x · y = 토큰 중심 px, cx · cy = 그 구역 중심 px (바깥쪽 판정 — 혼자면 토큰과 같아도 된다), w = 이름표 폭 px, warn = 실패율 표가 켜졌나
 * @param {{ W?: number, H?: number, tok?: number, obstacles?: Array<{ left: number, top: number, right: number, bottom: number }>, margin?: number }} [opts]
 * @returns {Record<string, { side: 'below'|'right'|'left'|'above', warnLeft: boolean, warnDown: boolean, overlap: number }>} overlap = 남은 겹침 넓이 (여유 포함, 0 이면 깨끗)
 */
export function labelPlan(toks, { W = FIELD_PX.w, H = FIELD_PX.h, tok = TOKEN_PX, obstacles = [], margin = 3 } = {}) {
  const list = Array.isArray(toks) ? toks.filter((t) => t && Number.isFinite(t.x) && Number.isFinite(t.y)) : [];
  const r = tok / 2;
  const rect = (l, t, rr, b) => ({ left: l, top: t, right: rr, bottom: b });
  const cut =(a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const grow = (o, m) => rect(o.left - m, o.top - m, o.right + m, o.bottom + m);
  const outside = (o) => {
    const area = (o.right - o.left) * (o.bottom - o.top);
    return area - cut(o, rect(0, 0, W, H));
  };
  // 얼굴 (2px 테) + 체력 막대 (얼굴 아래 3 ~ 7px)
  const body = (t) => rect(t.x - r - 2, t.y - r - 2, t.x + r + 2, t.y + r + 7);
  const labelRect = (t, side) => {
    if (side === 'right') return rect(t.x + r + 4, t.y - 8, t.x + r + 4 + t.w, t.y + 8);
    if (side === 'left') return rect(t.x - r - 4 - t.w, t.y - 8, t.x - r - 4, t.y + 8);
    if (side === 'above') return rect(t.x - t.w / 2, t.y - r - 23, t.x + t.w / 2, t.y - r - 7);
    return rect(t.x - t.w / 2, t.y + r + 7, t.x + t.w / 2, t.y + r + 23);
  };
  // 실패율 표 (css: 위 = top −0.66·tok, 옆 0.3·tok / 아래 wd = top 0.33·tok, 옆 0.42·tok)
  const warnRect = (t, left, down) => {
    const top = down ? t.y + tok * 0.33 : t.y - tok * 0.66;
    const off = down ? tok * 0.42 : tok * 0.3;
    return left ? rect(t.x - off - WARN_PX, top, t.x - off, top + 13) : rect(t.x + off, top, t.x + off + WARN_PX, top + 13);
  };
  const prefs = (t) => {
    const dx = t.x - t.cx;
    const dy = t.y - t.cy;
    const out = dx >= 0 ? 'right' : 'left';
    const inn = out === 'right' ? 'left' : 'right';
    if (Math.abs(dx) > 0.5 && Math.abs(dx) > Math.abs(dy) * 1.2) return [out, 'below', inn, 'above'];
    return ['below', out, inn, 'above'];
  };
  const faces = list.map((t) => ({ id: t.id, r: grow(body(t), margin) }));
  const fixed = (obstacles || []).map((o) => grow(o, margin));
  const placed = []; // { id, r }
  const score = (t, box) => {
    let s = outside(box) * 2;
    for (const f of faces) if (f.id !== t.id) s += cut(box, f.r);
    for (const o of fixed) s += cut(box, o);
    for (const p of placed) s += cut(box, grow(p.r, margin)); // 자기 실패율 표도 (이름표와 겹치지 않게)
    return s;
  };
  // 자리가 적은 토큰부터 (얼굴 · 구역 라벨만 보고 깨끗한 이름표 쪽 수 — 같으면 입력 순서)
  const freeCount = (t) => ['below', 'right', 'left', 'above'].filter((side) => {
    const b = labelRect(t, side);
    return outside(b) === 0 && faces.every((f) => f.id === t.id || cut(b, f.r) === 0) && fixed.every((o) => cut(b, o) === 0);
  }).length;
  const order = list.map((t, i) => ({ t, i, free: freeCount(t) })).sort((a, b) => a.free - b.free || a.i - b.i);
  const plan = {};
  // ① 실패율 표 (얼굴에 붙은 작은 표 — 이름표보다 먼저 자리를 잡는다)
  for (const { t } of order) {
    if (!t.warn) continue;
    const outLeft = t.x - t.cx < -0.5;
    const cands = [[outLeft, false], [!outLeft, false], [outLeft, true], [!outLeft, true]]
      .map(([left, down], k) => ({ left, down, k, s: score(t, warnRect(t, left, down)) }));
    cands.sort((a, b) => a.s - b.s || a.k - b.k);
    plan[t.id] = { side: 'below', warnLeft: cands[0].left, warnDown: cands[0].down, overlap: 0 };
    placed.push({ id: t.id, r: warnRect(t, cands[0].left, cands[0].down) });
  }
  // ② 이름표
  for (const { t } of order) {
    const cands = prefs(t).map((side, k) => ({ side, k, s: score(t, labelRect(t, side)) }));
    cands.sort((a, b) => a.s - b.s || a.k - b.k);
    const best = cands[0];
    plan[t.id] = { side: best.side, warnLeft: plan[t.id]?.warnLeft ?? (t.x - t.cx < -0.5), warnDown: !!plan[t.id]?.warnDown, overlap: r2(best.s) };
    placed.push({ id: t.id, r: labelRect(t, best.side) });
  }
  return plan;
}

/**
 * 엔진 lastFx(§14.13) → 연출 단계. 엔진 순서:
 *   카드   cost → gain · fail → heal · buff · tw (카드 effects) → (퍼펙트면 end)
 *   턴 끝  base (기본 훈련) · cost(src base) → heal(src bench) → buff (분위기 감소) → turnEnd → (레슨 끝: heal · end) | (scatter → draw)
 *   벤치   bench 하나 (benchPlayer)
 *  - play.targets = 상승 · 실패가 나온 선수 (제자리에서 훈련 동작, 엔진 순서 = 대상 T 순서), play.gain[id] = { n, sub, stat, subStat }, play.fail[id] = { n, injured, stat }
 *    gain[id].rows = 행마다 [{ n, sub, stat, subStat }] (고유 가로지르기 = 같은 선수 두 행 — 두 스탯, §16.3)
 *  - play.heal = 카드 효과 회복 (선수별 합), play.buffs = 바뀐 버프 키 (마지막 값), play.tw = 팀워크 합
 *  - play.move = 고유 자리 옮기기 · 가로지르기 [{ id, from, to }] (엔진이 비용 앞에 둔다 — 토큰이 먼저 뛰어간다), 없으면 []
 *  - play.pass = 고유 이어 주기 · 연결 · 크로스 [{ from, to }] (비용 뒤 · 상승 앞 — 공이 주인 → 받는 선수), 없으면 []
 *  - turn = 턴 끝이 있었으면 { base: { id: n }, baseStat: { id: stat }, baseCost: { id: n }, bench: { id: 회복 }, heal: { id: n }, buffs, turn } (없으면 null)
 *  - scatter = 새 턴 흩어지기 { id: zone } (없으면 null), draw = 새 손패 uid (없으면 null)
 *  - bench = 벤치 행동 [{ id, on }] (없으면 [])
 *  - end = 레슨 끝이면 { status, heal: { id: n } } (턴 끝 뒤 · 퍼펙트 체력 · 한나 회복, 없으면 null)
 *  코치 지원 (§15.4 · §15.8):
 *  - cutin = 붙은 카드를 냈으면 { supportId, uid, cardId, coach, name, text, repeat } (엔진이 lastFx 맨 앞에 둔다 — 카드 연출보다 먼저), 없으면 null
 *  - play.bond = [{ supportId, n }] (컷인 유대), play.hints = [supportId] (컷인 힌트 성공), play.condition = 카드 단계 컨디션 변화 합
 *  - attach = 새 턴 시작에 붙은 지원 { uid, supportId, upgrade } (새 손패 뒤), 없으면 null
 * @param {Array<object>} fx
 */
export function fxPlan(fx) {
  const play = { targets: [], cost: {}, gain: {}, fail: {}, heal: {}, buffs: {}, tw: 0, bond: [], hints: [], condition: 0, move: [], pass: [] };
  let cutin = null;
  let attach = null;
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
        const row = { n: num(e.n), sub: num(e.sub), stat: e.stat ?? null, subStat: e.subStat ?? null };
        play.gain[e.id] = {
          n: (g?.n || 0) + row.n, sub: (g?.sub || 0) + row.sub, stat: e.stat ?? g?.stat ?? null, subStat: e.subStat ?? g?.subStat ?? null,
          rows: [...(g?.rows || []), row],
        };
        break;
      }
      case 'move':
        if (seg === 'play') play.move.push({ id: e.id ?? null, from: e.from ?? null, to: e.to ?? null });
        break;
      case 'pass':
        if (seg === 'play') play.pass.push({ from: e.from ?? null, to: e.to ?? null });
        break;
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
      case 'cutin':
        if (!cutin) {
          cutin = { supportId: e.supportId ?? null, uid: e.uid ?? null, cardId: e.cardId ?? null, coach: e.coach ?? null, name: e.name ?? '', text: e.text ?? '', repeat: num(e.repeat) };
        }
        break;
      case 'attach':
        attach = { uid: e.uid ?? null, supportId: e.supportId ?? null, upgrade: e.upgrade ?? null };
        break;
      case 'bond':
        if (seg === 'play') play.bond.push({ supportId: e.supportId ?? null, n: num(e.n) });
        break;
      case 'hint':
        if (seg === 'play') play.hints.push(e.supportId ?? null);
        break;
      case 'condition':
        if (seg === 'play') play.condition += num(e.n);
        break;
      default:
        break;
    }
  }
  return { play, turn, scatter, draw, bench, end, cutin, attach };
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

/** 포지션 → 주 스탯 쌍 (엔진 cards.mainStatsOf 와 같다 — test/lessonLayout.test 가 맞춰 본다. UI 는 엔진을 직접 부르지 않는다) */
export const MAIN_STATS = Object.freeze({ GK: ['defense', 'physical'], DF: ['defense', 'physical'], MF: ['dribble', 'pass'], FW: ['shoot', 'dribble'] });

/**
 * 레슨 중 선수 1명의 스탯 정보 (§17 — 명단 줄 "🛡️ 수비 552 +18" · 선수 정보 팝오버). 순수 — 상태 · 뷰를 바꾸지 않는다.
 *  - value = 지금 스탯 (state.players[].stats), gain = 이번 레슨 상승 = value − 레슨 시작 값 (lesson.before — 기본 훈련 · 카드 · 부 스탯 · 실패 −5 모두)
 *  - zone = 이번 턴 서 있는 구역 (뷰 players[].zone — 벤치 선수는 돌아갈 구역, 결장은 null), here = 그 구역의 스탯 줄
 *  - cur = 명단 줄에 쓰는 구역 스탯 줄 (결장이면 null), total = 5개 상승 합,
 *    split = 기본(기본 훈련 + 분위기 몫) · 카드(실패 −5 포함) · 부 스탯 — 보상 모달 선수 칩과 같은 나눔 (lesson.baseGains · moodGains · cardGains · subGains)
 * @param {object} state 레슨 런 상태 (players[].stats · growth · position · slot, lesson)
 * @param {string} id 선수 id
 * @param {object} [view] getLessonView — players[] 의 zone · bench · out · injured · stamina · failRate · baseNext · targeted (없으면 상태에서)
 * @param {object} [thresholds] 등급 기준 (data.config.rating.thresholds — 없으면 dom.DEFAULT_THRESHOLDS)
 * @returns {null | { id, name, slot, position, portraitColor, zone, bench, out, injured, stamina, failRate, baseNext, targeted, benched, mainStats: string[],
 *   stats: Array<{ stat, value, before, gain, grade, growth, main, here }>, cur: object|null, total: number, split: { base, card, sub } }}
 */
export function playerStatInfo(state, id, view = null, thresholds = undefined) {
  const p = (state?.players || []).find((x) => x.id === id);
  if (!p) return null;
  const L = state.lesson || null;
  const vp = (view?.players || []).find((x) => x.id === id) || null;
  const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const out = vp ? !!vp.out : !!(L && (L.out || []).includes(id));
  const bench = vp ? !!vp.bench : !!(L && (L.bench || []).includes(id));
  const zone = out ? null : (vp ? vp.zone : L?.zones?.[id]) || null;
  const mainStats = (MAIN_STATS[p.position] || []).slice();
  const before = (L && L.before && L.before[id]) || p.stats || {};
  const stats = STATS.map((stat) => {
    const value = Math.round(num(p.stats?.[stat]));
    const b = Math.round(num(before[stat] ?? value));
    const g = Number(p.growth?.[stat]);
    return {
      stat, value, before: b, gain: value - b, grade: gradeOf(value, thresholds),
      growth: Number.isFinite(g) ? g : 1, main: mainStats.includes(stat), here: !!zone && stat === zone,
    };
  });
  const at = (k) => num(L?.[k]?.[id]);
  return {
    id, name: p.name, slot: p.slot, position: p.position, portraitColor: p.portraitColor,
    zone, bench, out, injured: vp ? !!vp.injured : out && !(L?.outAtStart || []).includes(id),
    stamina: num(vp ? vp.stamina : p.stamina), failRate: num(vp?.failRate), baseNext: num(vp?.baseNext),
    targeted: vp ? num(vp.targeted) : at('targeted'), benched: at('benchTurns'),
    mainStats, stats,
    cur: stats.find((s) => s.here) || null,
    total: stats.reduce((a, s) => a + s.gain, 0),
    split: { base: at('baseGains') + at('moodGains'), card: at('cardGains'), sub: at('subGains') },
  };
}
