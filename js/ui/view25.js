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
// 카메라 (D2 — §5, 파일 끝): 상태 { cx, cy, z } = 필드 영역 가운데에 올 월드 점 (투영 뒤 px) · 배율. cameraPhase (상황 → 표의 줄) ·
//   cameraTarget (줄 → 목표, 범위 자르기까지) · clampCamera (보이는 창이 월드 사각형 = 투영된 판 + 배경 띠 밖으로 나가지 않게) · camTranslate ·
//   camWindow (보이는 창의 월드 사각형 — 글자 자리 고르기의 화면 밖 판정) · figureBox (결정 틀의 선수 상자).

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

/** 월드 사각형 (투영된 판 + 위쪽 배경 띠) { x0, y0, x1, y1 } — 카메라 범위 (D2 clampCamera) */
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
 * layers (K1 — §12) = 같은 도형을 두 층으로: back { nets, grid, frame = 먼 기둥 } · front { nets, grid, frame = 가까운 기둥 + 크로스바 } ·
 * frontSy = 가까운 기둥 아래의 화면 y (앞 층의 화면 y 순 겹침 깊이).
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
  // K1 앞 · 뒤 층 (그물 줄): 뒤 그물 · 먼 옆 = 뒤, 지붕 · 가까운 옆 = 앞
  const gridBack = [];
  const gridFront = [];
  for (let i = 1; i < 8; i++) {
    const v = v1 + ((v2 - v1) * i) / 8;
    const back = [P(ub, v, 0), P(ub, v, BH)];
    const roof = [P(u0, v, GH), P(ub, v, BH)];
    grid.push(back, roof);
    gridBack.push(back);
    gridFront.push(roof);
  }
  for (let j = 1; j < 4; j++) {
    const hh = (BH * j) / 4;
    const back = [P(ub, v1, hh), P(ub, v2, hh)];
    grid.push(back);
    gridBack.push(back);
    const f = j / 4;
    for (const v of [v1, v2]) {
      const side = [P(u0 + (ub - u0) * f, v, 0), P(u0 + (ub - u0) * f, v, GH + (BH - GH) * f)];
      grid.push(side);
      (v === v1 ? gridBack : gridFront).push(side);
    }
  }
  // K1 (§12): 골대를 GK · 공 앞뒤로 나눈 두 층 — 뒤 (back: 뒤 그물 · 먼 옆 · 먼 기둥 — 선수 아래) · 앞 (front: 지붕 · 가까운 옆 그물 ·
  // 가까운 기둥 + 크로스바 — 가까운 기둥 깊이 frontSy 로 선수와 화면 y 순 겹침: 골문 안 GK · 그물 안 공은 그 뒤, 가까운 기둥보다 가까운 선수는 앞)
  const layers = {
    back: { nets: [nets[0], nets[1]], grid: gridBack, frame: [frame[2], frame[3]] },
    front: { nets: [nets[2], nets[3]], grid: gridFront, frame: [frame[0], frame[1], frame[2]] },
    frontSy: projectPlane(u0, v2, W, H).sy,
  };
  return { frame, nets, grid, layers };
}

/* ------------------------------------------------------------------ */
/* 카메라 (D2 — §5)                                                       */
/* ------------------------------------------------------------------ */

/**
 * 카메라 숫자 ([구현 결정] — §5 시작값, 시험해 보고 고칠 숫자). 여백 · 위로 올림은 화면 px (확대해도 글자 크기는 그대로라 ÷ z 로 쓴다).
 */
export const CAM = Object.freeze({
  Z_FOLLOW: 1.4, Z_FOLLOW_FAST: 1.2,     // 평소 공 따라가기 (4배속 1.2)
  Z_DECIDE: 2.0,                         // 직접 결정할 때 (틀이 창에 안 들어가면 Z_FOLLOW 까지 낮춘다) = 가장 큰 배율
  LEAD: 8,                               // 공 따라가기: 공격 방향 앞쪽 미리 보기 (필드 길이 %)
  LIFT: 24,                              // 따라가기 · 액션: 가운데 = 공의 땅 점보다 위 (선수 몸 쪽 — 화면 px × 그 자리 s)
  PAD_X: 44, PAD_T: 34, PAD_B: 30,       // 결정 틀 여백 (화면 px — 위 = 머리 위 말풍선, 아래 = 발밑 이름표, 옆 = 이름표 · 말풍선 폭)
  DECIDE_MS: 350,                        // 결정 확대 들어가기 · 토글로 틀이 바뀔 때 (ms, 배속과 무관 — 멈춰 있는 동안)
  SKY: 0.3,                              // 하늘 (.w-sky) = 카메라 이동의 30% (시차)
});

/** 평소 따라가기 배율 (배속 4 = 1.2, 그 밖 1.4) */
export const followZoom = (speed) => (Number(speed) >= 4 ? CAM.Z_FOLLOW_FAST : CAM.Z_FOLLOW);

/**
 * 카메라 상황 → §5 표의 줄 ('full' | 'action' | 'decide' | 'follow'). 위가 먼저:
 *   ⏭ · 경기 끝 · 골 연출 → 'full' / 액션 중 → 'action' (지금 z, 공이 갈 곳) / 사람이 고르는 중 → 'decide'
 *   (경기 화면을 연 킥오프 배치면 startHold 동안 미룬다 — 잠깐 풀코트) / 킥오프 배치 · 경기 시작 → 'full' / 그 밖 → 'follow'.
 * @param {{ skip?, finished?, goal?, action?, deciding?, startHold?, kickoff?, start? }} s 참 · 거짓 값들
 */
export function cameraPhase({ skip = false, finished = false, goal = false, action = false, deciding = false, startHold = false, kickoff = false, start = false } = {}) {
  if (skip || finished || goal) return 'full';
  if (action) return 'action';
  if (deciding && !startHold) return 'decide';
  if (kickoff || start || startHold) return 'full';
  return 'follow';
}

const within = (c, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, c)));
const unionBox = (list) => list.reduce((u, b) => ({ l: Math.min(u.l, b.l), r: Math.max(u.r, b.r), t: Math.min(u.t, b.t), b: Math.max(u.b, b.b) }),
  { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity });

/**
 * 범위 자르기: z 를 1 ~ Z_DECIDE 로, 보이는 창 (W / z × H / z) 이 월드 사각형 (worldRect) 밖으로 나가지 않게 cx · cy 를 자른다.
 * z = 1 이면 언제나 전체 (cx · cy = 필드 영역 가운데).
 * @returns {{ cx: number, cy: number, z: number }}
 */
export function clampCamera({ cx, cy, z }, W, H, world = null) {
  const zz = Math.min(CAM.Z_DECIDE, Math.max(1, Number(z) || 1));
  if (zz <= 1 + 1e-9) return { cx: W / 2, cy: H / 2, z: 1 };
  const wr = world || worldRect(W, H);
  const hw = W / (2 * zz);
  const hh = H / (2 * zz);
  return { cx: within(Number(cx), wr.x0 + hw, wr.x1 - hw), cy: within(Number(cy), wr.y0 + hh, wr.y1 - hh), z: zz };
}

/** 카메라 → .w-cam 의 translate (transform-origin 0 0 · scale(z)): 화면 = (월드 − (cx, cy)) · z + (W / 2, H / 2) */
export function camTranslate({ cx, cy, z }, W, H) {
  return { tx: W / 2 - z * cx, ty: H / 2 - z * cy };
}

/** 카메라가 보여 주는 창 (필드 영역 W × H) 의 월드 사각형 { l, r, t, b } */
export function camWindow({ cx, cy, z }, W, H) {
  const hw = W / (2 * z);
  const hh = H / (2 * z);
  return { l: cx - hw, r: cx + hw, t: cy - hh, b: cy + hh };
}

/**
 * 서 있는 선수 한 명의 월드 상자 { l, r, t, b } (z = 1 화면 px): 발 (x, y) 에서 위로 키, 좌우 반폭, 아래로 발밑 타원 · 체력 바 · 이름표 위 끝
 * (screens/match.js tokGeo 의 --ny 와 같은 식). 결정 틀 (cameraTarget 'decide') 에 쓴다.
 * @param {{ w: number, h: number, footX: number }|null} sprite data/sprites.json 항목 (없으면 스탠디)
 */
export function figureBox(x, y, W, H, sprite = null) {
  const p = project(x, y, W, H);
  const f = figureSize(p.s, sprite);
  const gh = V25.GROUND_W * p.s * groundAspect(x, y, W, H);
  return { l: p.sx - f.hw, r: p.sx + f.hw, t: p.sy - f.fh, b: p.sy + gh / 2 + 9 };
}

/**
 * 결정 틀 (§5 '직접 결정할 때'): 상자들 (월드 px) 을 여백 (화면 px ÷ z) 과 함께 창에 넣는 가장 큰 z (Z_FOLLOW ~ Z_DECIDE) 와 가운데.
 * 상자 표시: core = 꼭 보여야 하는 듀얼 둘 (틀이 Z_FOLLOW 에서도 안 들어가면 가운데를 core 쪽으로 당긴다), opt = 보이면 넣는 것
 * (커버 수비 · 다른 받는 선수 후보 — 나머지로 정한 창에 걸리면 틀에 더한다), 그 밖 = 넣어야 하는 것 (고른 받는 선수 · 외치는 선수).
 */
function decideFrame(boxes, W, H) {
  const { PAD_X: mx, PAD_T: mt, PAD_B: mb } = CAM;
  const zFor = (u) => Math.min(CAM.Z_DECIDE, Math.max(CAM.Z_FOLLOW,
    Math.min((W - 2 * mx) / Math.max(1, u.r - u.l), (H - mt - mb) / Math.max(1, u.b - u.t))));
  const centre = (u, z) => ({ cx: (u.l + u.r) / 2, cy: (u.t - mt / z + u.b + mb / z) / 2 });
  const need = boxes.filter((b) => !b.opt);
  let u = unionBox(need.length ? need : boxes);
  let z = zFor(u);
  const c0 = centre(u, z);
  const win = camWindow({ ...c0, z }, W, H);
  const seen = boxes.filter((b) => b.opt && b.r > win.l && b.l < win.r && b.b > win.t && b.t < win.b);
  if (seen.length) {
    u = unionBox([...need, ...seen]);
    z = zFor(u);
  }
  let { cx, cy } = centre(u, z);
  const core = boxes.filter((b) => b.core);
  if (core.length) {
    const k = unionBox(core);
    const hw = W / (2 * z);
    const hh = H / (2 * z);
    cx = within(cx, k.r + mx / z - hw, k.l - mx / z + hw);
    cy = within(cy, k.b + mb / z - hh, k.t - mt / z + hh);
  }
  return { cx, cy, z };
}

/**
 * 카메라 목표 (§5 표) → { cx, cy, z } (clampCamera 까지 한 값).
 *   'full'   : z 1 · 전체
 *   'follow' : z = followZoom(speed) (1.4 · 4배속 1.2), 가운데 = 공 (필드 %) + 공격 방향 앞쪽 LEAD (필드 길이 %), 땅 점보다 LIFT · s 위
 *   'decide' : boxes (figureBox · core · opt) 를 여백과 함께 넣는 z (Z_FOLLOW ~ Z_DECIDE) · 가운데 (decideFrame)
 *   'action' : z = current.z (지금), 가운데 = 공이 갈 곳 to (필드 %) 의 땅 점보다 LIFT · s 위
 * 필요한 값이 없으면 (공 · 상자 · 갈 곳) 전체.
 * @param {{ phase?: string, W: number, H: number, speed?: number, ball?: {x,y}|null, attackRight?: boolean,
 *   boxes?: Array<{l,r,t,b,core?,opt?}>, to?: {x,y}|null, current?: {cx,cy,z}|null, world?: object|null }} o
 */
export function cameraTarget({ phase = 'full', W, H, speed = 1, ball = null, attackRight = true, boxes = [], to = null, current = null, world = null } = {}) {
  const wr = world || worldRect(W, H);
  if (phase === 'follow' && ball && Number.isFinite(Number(ball.x)) && Number.isFinite(Number(ball.y))) {
    const p = project(Number(ball.x), Number(ball.y) + (attackRight ? 1 : -1) * CAM.LEAD, W, H);
    return clampCamera({ cx: p.sx, cy: p.sy - CAM.LIFT * p.s, z: followZoom(speed) }, W, H, wr);
  }
  if (phase === 'action' && to && Number.isFinite(Number(to.x)) && Number.isFinite(Number(to.y))) {
    const p = project(Number(to.x), Number(to.y), W, H);
    return clampCamera({ cx: p.sx, cy: p.sy - CAM.LIFT * p.s, z: Number(current?.z) || 1 }, W, H, wr);
  }
  if (phase === 'decide' && Array.isArray(boxes) && boxes.length) return clampCamera(decideFrame(boxes, W, H), W, H, wr);
  return clampCamera({ cx: W / 2, cy: H / 2, z: 1 }, W, H, wr);
}
