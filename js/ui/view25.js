// js/ui/view25.js — 2.5D 경기 화면의 원근 투영 (docs/SPRITE_25D_PLAN.md §3 · §4) — 순수 함수, DOM 없음 (test/view25.test.mjs)
//
// 판 (ground plane) 좌표 = 판 px: 판 = PL × PD, 그 안의 필드 사각형 = FL × FD, 둘레 런오프 RU (길이 방향) · RV (깊이 방향).
//   필드 % → 판: u = RU + (y / 100) · FL (y = 골 방향, 0 = home 골 = 왼쪽), v = RV + (x / 100) · FD (x 0 = 먼 터치라인 = 화면 위).
// 호모그래피 (3×3, 표준 DLT 4점 해법): 필드 사각형 네 귀퉁이 → 필드 영역 (W × H px) 의 대칭 사다리꼴
//   가까운 터치라인 (v = RV + FD) → y = H − NEAR_PAD, x = 0 … W · 먼 터치라인 (v = RV) → y = FAR_Y, x = W · FAR_INSET … W · (1 − FAR_INSET).
//   판 밖 (런오프) 도 같은 식으로 투영된다. cssMatrix3d 는 같은 행렬을 CSS matrix3d 로 — 판 div (PL × PD, transform-origin 0 0) 에 걸면
//   잔디 그림 · 구역 · 선이 project 와 정확히 같은 자리에 놓인다 (토큰 · 공 · 화살표 · 골대는 판 밖 층에서 project 로 그린다).
// 크기 배율 s = 그 깊이에서 u 방향 1 판 px 의 화면 길이 ÷ 가까운 터치라인에서의 같은 값 (먼 쪽 약 0.83 ~ 가까운 쪽 1).
// 모든 함수가 W · H 를 받는다 (스테이지 크기를 박아 두지 않는다). 같은 W · H 의 행렬은 한 번만 푼다.

/** 판 · 사다리꼴 · 세운 물체의 숫자 ([구현 결정] — §3 · §4 시작값, 시험해 보고 고칠 숫자) */
export const V25 = Object.freeze({
  FL: 1244, FD: 980, RU: 70, RV: 60,     // 필드 길이 · 깊이 · 런오프 (판 px)
  NEAR_PAD: 6, FAR_Y: 34, FAR_INSET: 0.085, // 가까운 터치라인 = H − 6, 먼 터치라인 y = 34 · 좌우 8.5% 안쪽 (위에서 30° 의 완만한 원근)
  LIFT_K: 0.92,                          // 판 위 높이 h 판 px → 화면 h · k · 0.92 (30° 에서 수직 길이가 거의 그대로)
  SPR_H: 72,                             // 스프라이트 키 (가까운 터치라인 화면 px, × s)
  STANDEE_D: 40, STANDEE_H: 58,          // 스탠디 얼굴 원 지름 · 전체 키 (몸 26 − 겹침 8 + 얼굴 40)
  GROUND_W: 38,                          // 발밑 그림자 · 역할 고리 타원 폭 (× s, 높이 = 폭 × groundAspect)
  BALL_LIFT: 90, ARC_FULL: 300,          // 크로스 · 롱패스 호 꼭대기 = 90 · s (화면 길이 300px 보다 짧으면 비례해서 낮게)
  TOK_GAP: 46,                           // 배치 간격 (판 px) — computeLayout tokenSize = 46 / FD
  GOAL_H: 96, GOAL_DEPTH: 44,            // 골대 높이 · 그물 깊이 (판 px)
  GOAL_X0: 38, GOAL_X1: 62,              // 골문 = 필드 x 38 ~ 62% (평면 .pl-goal 과 같다)
  STRIP_W: 1672, STRIP_H: 174,           // img/sprites/far_strip.webp 크기 (아래 끝 = 잔디)
  STRIP_PAD: 80, STRIP_WIDEN: 1.3, STRIP_OVERLAP: 6,
});

const { FL, FD, RU, RV } = V25;
const PL = FL + 2 * RU;
const PD = FD + 2 * RV;

/** 판 크기 (판 px) */
export function planeSize() {
  return { PL, PD };
}

/** 필드 % → 판 좌표 { u, v } */
export function fieldToPlane(x, y) {
  return { u: RU + (Number(y) / 100) * FL, v: RV + (Number(x) / 100) * FD };
}

/** 판 좌표 → 필드 % { x, y } */
export function planeToField(u, v) {
  return { x: ((v - RV) / FD) * 100, y: ((u - RU) / FL) * 100 };
}

/* ------------------------------------------------------------------ */
/* 호모그래피                                                             */
/* ------------------------------------------------------------------ */

/** 4점 짝 (src[i] → dst[i]) 의 3×3 행렬 (행 우선, h33 = 1) — 8×8 가우스 소거 (부분 피벗) */
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c];
    if (!d) throw new Error('view25: 호모그래피를 풀 수 없다 (네 점이 한 줄)');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return [...b.map((v, i) => v / A[i][i]), 1];
}

/** 3×3 역행렬 (행 우선) */
function inverse3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
    C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

const cache = new Map(); // `${W}x${H}` → { m, inv, kNear }

/**
 * 필드 영역 W × H 의 행렬: m (판 → 화면), inv (화면 → 판), kNear (가까운 터치라인에서 u 1 판 px 의 화면 길이 = W / FL).
 * @returns {{ m: number[], inv: number[], kNear: number }}
 */
export function homography(W, H) {
  const key = `${W}x${H}`;
  let hm = cache.get(key);
  if (hm) return hm;
  const nearY = H - V25.NEAR_PAD;
  const farY = V25.FAR_Y;
  const fi = W * V25.FAR_INSET;
  const m = solveHomography(
    [[RU, RV], [RU + FL, RV], [RU + FL, RV + FD], [RU, RV + FD]],
    [[fi, farY], [W - fi, farY], [W, nearY], [0, nearY]]);
  hm = { m, inv: inverse3(m), kNear: 0 };
  hm.kNear = kAt(m, RU + FL / 2, RV + FD);
  if (cache.size > 16) cache.clear();
  cache.set(key, hm);
  return hm;
}

/** 판 점 (u, v) 에서 u 방향 1 판 px 의 화면 길이 (d sx / d u) */
function kAt(m, u, v) {
  const X = m[0] * u + m[1] * v + m[2];
  const w = m[6] * u + m[7] * v + m[8];
  return (m[0] - (X / w) * m[6]) / w;
}

/**
 * 판 점 → 화면 { sx, sy, s, k }: k = 그 자리에서 u 1 판 px 의 화면 길이, s = k / (가까운 터치라인의 k).
 * @param {number} u @param {number} v @param {number} W @param {number} H
 */
export function projectPlane(u, v, W, H) {
  const { m, kNear } = homography(W, H);
  const X = m[0] * u + m[1] * v + m[2];
  const Y = m[3] * u + m[4] * v + m[5];
  const w = m[6] * u + m[7] * v + m[8];
  const sx = X / w;
  const k = (m[0] - sx * m[6]) / w;
  return { sx, sy: Y / w, s: k / kNear, k };
}

/** 필드 % (x, y) → 화면 { sx, sy, s, k } (바닥 위 점 — 선수의 발 · 공의 땅 자리) */
export function project(x, y, W, H) {
  const { u, v } = fieldToPlane(x, y);
  return projectPlane(u, v, W, H);
}

/** 판 위 높이 h (판 px) 의 점 — 바닥 점에서 화면 y 를 h · k · LIFT_K 만큼 올린다 (세운 물체 · 공 높이 · 골대) */
export function project3(u, v, h, W, H) {
  const p = projectPlane(u, v, W, H);
  return { ...p, sy: p.sy - h * p.k * V25.LIFT_K };
}

/** 화면 → 판 { u, v } (바닥 위 점으로 본다) */
export function unprojectPlane(sx, sy, W, H) {
  const { inv } = homography(W, H);
  const u = inv[0] * sx + inv[1] * sy + inv[2];
  const v = inv[3] * sx + inv[4] * sy + inv[5];
  const w = inv[6] * sx + inv[7] * sy + inv[8];
  return { u: u / w, v: v / w };
}

/** 화면 → 필드 % { x, y } (평면 모드 screenToField 자리) */
export function unproject(sx, sy, W, H) {
  const { u, v } = unprojectPlane(sx, sy, W, H);
  return planeToField(u, v);
}

/** 화면 점 (바닥으로 본다) 의 크기 배율 s */
export function scaleAtScreen(sx, sy, W, H) {
  const { u, v } = unprojectPlane(sx, sy, W, H);
  return projectPlane(u, v, W, H).s;
}

/**
 * 바닥 원이 화면에서 납작해지는 비율: 그 자리에서 v 1 판 px 의 화면 세로 길이 ÷ u 1 판 px 의 화면 가로 길이.
 * 발밑 그림자 · 역할 고리 타원의 높이 = 폭 × 이 값.
 */
export function groundAspect(x, y, W, H) {
  const { u, v } = fieldToPlane(x, y);
  const a = projectPlane(u, v - 0.5, W, H);
  const b = projectPlane(u, v + 0.5, W, H);
  const p = projectPlane(u, v, W, H);
  return Math.abs(b.sy - a.sy) / p.k;
}

/**
 * 필드 방향 (fx: x 증가, fy: y 증가 = away 골 쪽) 의 화면 단위 방향 [dx, dy] — 자리 (x, y) 에서 (원근이라 자리마다 조금 다르다)
 */
export function dirAt(fx, fy, x, y, W, H) {
  const a = project(x, y, W, H);
  const b = project(x + fx * 0.5, y + fy * 0.5, W, H);
  const dx = b.sx - a.sx;
  const dy = b.sy - a.sy;
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

// 행렬 성분 → CSS 숫자 (12자리, 1e-12 보다 작은 값 = 0 — 대칭 사다리꼴의 0 자리에 남는 계산 찌꺼기)
const num = (x) => (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(12)));

/**
 * 판 div 의 CSS transform: matrix3d(...) — transform-origin 0 0 · 필드 영역 왼쪽 위에 놓인 PL × PD 판 div 의 점 (u, v, 0, 1) 이
 * (X, Y, Z, w) 로 가고 화면 = (X / w, Y / w) = projectPlane(u, v) (Z 는 그대로 — 판 안 그림이 잘리지 않게).
 */
export function cssMatrix3d(W, H) {
  const [a, b, c, d, e, f, g, h, i] = homography(W, H).m;
  return `matrix3d(${[a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].map(num).join(', ')})`;
}

/* ------------------------------------------------------------------ */
/* 세운 물체 · 방향 · 호                                                    */
/* ------------------------------------------------------------------ */

/** 스프라이트 키 (화면 px) — 깊이 배율 s */
export const spriteHeight = (s) => V25.SPR_H * s;
/** 스탠디 (얼굴 원을 땅 위에 세운 것) 키 (화면 px) */
export const standeeHeight = (s) => V25.STANDEE_H * s;

/**
 * 서 있는 그림의 화면 크기: fh = 키, hw = 발 기준 좌우로 더 먼 쪽 폭 (좌우 반전해도 같은 상자), fw = 그림 폭.
 * @param {number} s 깊이 배율
 * @param {{ w: number, h: number, footX: number }|null} sprite data/sprites.json 항목 (없으면 스탠디)
 */
export function figureSize(s, sprite = null) {
  if (sprite && sprite.w > 0 && sprite.h > 0) {
    const fh = spriteHeight(s);
    const fw = fh * (sprite.w / sprite.h);
    const fx = Math.min(1, Math.max(0, Number(sprite.footX) || 0.5));
    return { fh, fw, hw: Math.max(fx, 1 - fx) * fw };
  }
  return { fh: standeeHeight(s), fw: V25.STANDEE_D * s, hw: (V25.STANDEE_D / 2) * s };
}

/**
 * 그림이 보는 쪽 'r' | 'l': 공 가진 선수 = 공격 방향, 나머지 = 공 쪽 (공과 화면 x 가 거의 같으면 자기 팀 공격 방향 — home 오른쪽).
 * @param {{ carrier?: boolean, attackRight?: boolean, sx: number, ballSx?: number|null, side?: 'home'|'away' }} o
 */
export function facing({ carrier = false, attackRight = true, sx = 0, ballSx = null, side = 'home' } = {}) {
  if (carrier) return attackRight ? 'r' : 'l';
  if (Number.isFinite(ballSx) && Math.abs(ballSx - sx) >= 2) return ballSx > sx ? 'r' : 'l';
  return side === 'away' ? 'l' : 'r';
}

/** 높이 있는 이동 (크로스 · 롱패스) 의 꼭대기 높이 (화면 px): 90 · s, 화면 길이가 ARC_FULL 보다 짧으면 비례해서 낮게 */
export function arcLift(len, s) {
  return V25.BALL_LIFT * s * Math.min(1, Math.max(0, len) / V25.ARC_FULL);
}

/* ------------------------------------------------------------------ */
/* 배경 띠 · 골대 · 월드 사각형                                              */
/* ------------------------------------------------------------------ */

/**
 * 먼 쪽 배경 띠 (far_strip — 아래 끝 = 잔디) 의 자리 { x, y, w, h } (필드 영역 px): 아래 끝 = 판 먼 끝 (v = 0) 의 화면 y + 겹침,
 * 폭 = max(W + 양옆 STRIP_PAD, 판 먼 끝 폭 × STRIP_WIDEN), 가운데 맞춤, 높이 = 그림 비율. 판이 띠 위에 그려져 겹친 아래 끝을 덮는다.
 */
export function stripRect(W, H) {
  const a = projectPlane(0, 0, W, H);
  const b = projectPlane(PL, 0, W, H);
  const w = Math.max(W + 2 * V25.STRIP_PAD, (b.sx - a.sx) * V25.STRIP_WIDEN);
  const h = w * (V25.STRIP_H / V25.STRIP_W);
  const bottom = Math.min(a.sy, b.sy) + V25.STRIP_OVERLAP;
  return { x: W / 2 - w / 2, y: bottom - h, w, h };
}

/** 월드 사각형 (투영된 판 + 위쪽 배경 띠) { x0, y0, x1, y1 } — 카메라 범위 (D2) */
export function worldRect(W, H) {
  const pts = [[0, 0], [PL, 0], [PL, PD], [0, PD]].map(([u, v]) => projectPlane(u, v, W, H));
  const st = stripRect(W, H);
  return {
    x0: Math.min(st.x, ...pts.map((p) => p.sx)),
    y0: Math.min(st.y, ...pts.map((p) => p.sy)),
    x1: Math.max(st.x + st.w, ...pts.map((p) => p.sx)),
    y1: Math.max(...pts.map((p) => p.sy)),
  };
}

/**
 * 서 있는 골대 하나의 화면 도형 (필드 영역 px): end 'home' = 왼쪽 골 (u = RU, 그물은 −u), 'away' = 오른쪽 (u = RU + FL, 그물은 +u).
 * frame = 가까운 기둥 아래 → 위 → 크로스바 → 먼 기둥 위 → 아래, nets = 그물 면 (뒤 · 먼 옆 · 지붕 · 가까운 옆 — 그리는 순서),
 * grid = 그물 줄 [[x1, y1], [x2, y2]]. 그물 뒤 높이 = 골대 높이 × 0.7.
 */
export function goalShapes(end, W, H) {
  const right = end === 'away';
  const u0 = right ? RU + FL : RU;
  const ub = u0 + (right ? 1 : -1) * V25.GOAL_DEPTH;
  const v1 = RV + (V25.GOAL_X0 / 100) * FD; // 먼 기둥
  const v2 = RV + (V25.GOAL_X1 / 100) * FD; // 가까운 기둥
  const GH = V25.GOAL_H;
  const BH = GH * 0.7;
  const P = (u, v, h) => {
    const p = project3(u, v, h, W, H);
    return [p.sx, p.sy];
  };
  const frame = [P(u0, v2, 0), P(u0, v2, GH), P(u0, v1, GH), P(u0, v1, 0)];
  const nets = [
    [P(ub, v1, 0), P(ub, v1, BH), P(ub, v2, BH), P(ub, v2, 0)],   // 뒤
    [P(u0, v1, 0), P(u0, v1, GH), P(ub, v1, BH), P(ub, v1, 0)],   // 먼 옆
    [P(u0, v1, GH), P(u0, v2, GH), P(ub, v2, BH), P(ub, v1, BH)], // 지붕
    [P(u0, v2, 0), P(u0, v2, GH), P(ub, v2, BH), P(ub, v2, 0)],   // 가까운 옆
  ];
  const grid = [];
  for (let i = 1; i < 8; i++) {
    const v = v1 + ((v2 - v1) * i) / 8;
    grid.push([P(ub, v, 0), P(ub, v, BH)], [P(u0, v, GH), P(ub, v, BH)]);
  }
  for (let j = 1; j < 4; j++) {
    const hh = (BH * j) / 4;
    grid.push([P(ub, v1, hh), P(ub, v2, hh)]);
    const f = j / 4;
    for (const v of [v1, v2]) grid.push([P(u0 + (ub - u0) * f, v, 0), P(u0 + (ub - u0) * f, v, GH + (BH - GH) * f)]);
  }
  return { frame, nets, grid };
}
