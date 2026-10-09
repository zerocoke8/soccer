/**
 * hexGrid.js — 육각 오토배틀 보드 기하 (HEX_AUTOBATTLE_PLAN §2, H0 SPEC §2)
 *
 * 순수 함수만: import · DOM · rng · Date 없음. 상태를 갖지 않는다.
 *
 * 보드 규약:
 *  - 뾰족한 위(pointy-top) 육각형, odd-r 오프셋 (홀수 행이 반 칸 오른쪽으로 밀려 있다).
 *  - 행 길이가 번갈아 다르다: 짝수 행 15칸 (c = 0..14), 홀수 행 14칸 (c = 0..13). 홀수 행은 반 칸 밀려 있으니
 *    이렇게 해야 판이 가운데 세로줄 (x = 7·√3, 센터 칸 (7, 6) 을 지나는 선) 에 대해 정확히 좌우 대칭이다.
 *    (모든 행 15칸이면 홀수 행 오른쪽 끝이 반 칸 튀어나와 홈 공격 박스 10칸 · 원정 공격 박스 12칸처럼 한쪽이 유리해진다.)
 *    칸 수 = 7 × 15 + 6 × 14 = 189. ROWS 13 (r = 0..12, 깊이. r = 0 이 2.5D 화면의 먼 터치라인 — 엔진은 상관하지 않는다).
 *  - 칸 id = r * COLS + c (COLS = 15, 보드 안 칸만 — 홀수 행 c = 14 자리의 id 는 없다). 보드 밖 좌표는 [c, r] 로만 다룬다 (예: 가상 골 칸).
 *  - 방향 이름 고정: E, NE, NW, W, SW, SE ("N" = r − 1). neighbors 는 이 고정 순서.
 *    좌우 대칭이 필요한 곳 (엔진의 동률 깨기) 은 공격 방향 기준 순서 relDirs(dir) · neighborsRel 을 쓴다
 *    (정면 → 앞 대각 둘 → 뒤 대각 둘 → 바로 뒤, 원정은 홈 순서의 거울상).
 *  - 거리 = 큐브 거리 (axial q = c − (r − (r&1))/2, r 그대로).
 *  - 거울: mirrorCR(c, r) = [rowLen(r) − 1 − c, r] (짝수 행 14 − c · 홀수 행 13 − c). 거리 · 이웃 · 골까지 거리 · 박스를 그대로 지킨다.
 *
 * 공격 방향:
 *  - dir = +1 (홈, c = 14 쪽 오른쪽 골 공격) | −1 (원정, c = 0 쪽 왼쪽 골 공격).
 *  - 앞 3칸 = frontDirs(dir) (정면, 그다음 두 대각). 뒤 = backDir, 뒤 대각 = backDiagDirs. 태클 판정(결정 12)이 이 순서를 쓴다.
 *
 * 골:
 *  - GOAL_ROWS [5, 6, 7]. 오른쪽 골 = 그 행 마지막 칸 바로 오른쪽 (15, 6) · (14, 5) · (14, 7), 왼쪽 골 = (−1, r) — 보드 밖 가상 칸 (서로 거울상).
 *  - distToGoal = 그 골 칸들까지 최소 큐브 거리. 박스 = distToGoal ≤ BOX_DIST(2) (공격 박스 · 수비 GK 구역 모두 이것).
 *
 * 화면 좌표 (H1 이 view25 평면으로 옮긴다): 단위 육각 크기 1, centerXY(c, r) = {x: √3·(c + 0.5·(r&1)), y: 1.5·r}.
 *  보드 외곽(반 칸 포함)은 x ∈ [BOARD_X0, BOARD_X0 + BOARD_W], y ∈ [BOARD_Y0, BOARD_Y0 + BOARD_H]. 거울 축 x = MIRROR_X (= 7·√3, 외곽 가운데).
 */

/** 열 수 = 짝수 행 칸 수 (c = 0..14, 골 방향). 홀수 행은 COLS − 1 = 14칸. 칸 id 의 행 너비도 이 값. */
export const COLS = 15;
/** 행 수 (r = 0..12, 깊이). */
export const ROWS = 13;

/** 방향 이름 — 이웃 순서와 같다. */
export const E = "E";
export const NE = "NE";
export const NW = "NW";
export const W = "W";
export const SW = "SW";
export const SE = "SE";
/** 고정 방향 순서 (E, NE, NW, W, SW, SE). */
export const DIRS = Object.freeze([E, NE, NW, W, SW, SE]);
/** 거울 방향 (좌우 뒤집기: E ↔ W, NE ↔ NW, SE ↔ SW). */
export const MIRROR_DIR = Object.freeze({ E: W, NE: NW, NW: NE, W: E, SW: SE, SE: SW });
/** 공격 방향 기준 방향 순서: 정면 → 앞 대각 (위 · 아래) → 뒤 대각 (위 · 아래) → 바로 뒤. 원정은 홈 순서의 거울상. */
const REL_DIRS_H = Object.freeze([E, NE, SE, NW, SW, W]);
const REL_DIRS_A = Object.freeze(REL_DIRS_H.map((d) => MIRROR_DIR[d]));

/** odd-r 이웃 오프셋 [dc, dr] — 짝수 행 / 홀수 행. */
const OFFSETS_EVEN = Object.freeze({ E: [1, 0], NE: [0, -1], NW: [-1, -1], W: [-1, 0], SW: [-1, 1], SE: [0, 1] });
const OFFSETS_ODD = Object.freeze({ E: [1, 0], NE: [1, -1], NW: [0, -1], W: [-1, 0], SW: [0, 1], SE: [1, 1] });

/** 골문 행 (양쪽 같다). */
export const GOAL_ROWS = Object.freeze([5, 6, 7]);
/** 박스 반경: 골 칸까지 큐브 거리 ≤ 이 값이면 박스(= GK 구역). */
export const BOX_DIST = 2;

const SQRT3 = Math.sqrt(3);
/** 보드 외곽 왼쪽 위 (반 칸 포함) — centerXY 좌표계. */
export const BOARD_X0 = -SQRT3 / 2;
export const BOARD_Y0 = -1;
/** 보드 외곽 너비 · 높이 (짝수 행 15칸 폭 = 반 칸 밀린 홀수 행 14칸 폭 · 위아래 꼭짓점 포함). */
export const BOARD_W = SQRT3 * COLS;
export const BOARD_H = 1.5 * (ROWS - 1) + 2;
/** 좌우 거울 축 x (센터 칸 (7, 6) 중심 = 외곽 가운데). */
export const MIRROR_X = (SQRT3 * (COLS - 1)) / 2;

/** 홀수 판정 (음수 행도 안전: −1 & 1 = 1). */
const isOdd = (r) => (r & 1) === 1;

/** 행 r 의 칸 수: 짝수 행 15 · 홀수 행 14. */
export function rowLen(r) {
  return isOdd(r) ? COLS - 1 : COLS;
}

/** 보드 안 칸인가. */
export function inBoard(c, r) {
  return Number.isInteger(c) && Number.isInteger(r) && r >= 0 && r < ROWS && c >= 0 && c < rowLen(r);
}

/** 칸 id 의 범위 (0 .. ID_SPACE − 1, 홀수 행 c = 14 자리는 비어 있다) — 엔진의 id 색인 배열 길이. */
export const ID_SPACE = COLS * ROWS;

/** 보드 위 칸 id 인가. */
export function isCell(id) {
  return Number.isInteger(id) && id >= 0 && id < ID_SPACE && inBoard(id % COLS, Math.floor(id / COLS));
}

/** [c, r] → 칸 id. 보드 밖이면 throw. */
export function cellId(c, r) {
  if (!inBoard(c, r)) throw new Error(`보드 밖 칸입니다: (${c}, ${r})`);
  return r * COLS + c;
}

/** 칸 id → [c, r]. 잘못된 id (홀수 행 c = 14 같은 빈 자리 포함) 면 throw. */
export function cellCR(id) {
  if (!isCell(id)) throw new Error(`잘못된 칸 id: ${id}`);
  return [id % COLS, Math.floor(id / COLS)];
}

/** 보드의 모든 칸 id (189개, id 오름차순 = 행 → 열, 얼림). */
export const ALL_CELLS = Object.freeze(Array.from({ length: ID_SPACE }, (_, i) => i).filter(isCell));

/** 방향 오프셋 [dc, dr] (행 홀짝에 따라). 모르는 방향이면 throw. */
export function dirOffset(r, dir) {
  const off = (isOdd(r) ? OFFSETS_ODD : OFFSETS_EVEN)[dir];
  if (!off) throw new Error(`모르는 방향: ${dir}`);
  return off;
}

/** (c, r) 에서 dir 로 한 칸 → [c, r] (보드 밖일 수 있다). */
export function step(c, r, dir) {
  const [dc, dr] = dirOffset(r, dir);
  return [c + dc, r + dr];
}

/** (c, r) 의 이웃 6칸 [c, r] — 보드 밖 포함, 순서 E, NE, NW, W, SW, SE. */
export function neighborCR(c, r) {
  return DIRS.map((d) => step(c, r, d));
}

/** 칸 id 의 보드 안 이웃 id (순서 E, NE, NW, W, SW, SE 중 보드 안인 것만). */
export function neighbors(id) {
  const [c, r] = cellCR(id);
  const out = [];
  for (const [nc, nr] of neighborCR(c, r)) if (inBoard(nc, nr)) out.push(nc + nr * COLS);
  return out;
}

/** 공격 방향 기준 방향 순서: 홈(+1) [E, NE, SE, NW, SW, W] · 원정(−1) [W, NW, SW, NE, SE, E] (서로 거울상). */
export function relDirs(dir) {
  return dir > 0 ? REL_DIRS_H : REL_DIRS_A;
}

/** 칸 id 의 보드 안 이웃 id — 공격 방향 기준 순서 (relDirs). 거울 칸에서 반대 방향으로 부르면 정확히 거울상 순서. */
export function neighborsRel(id, dir) {
  const [c, r] = cellCR(id);
  const out = [];
  for (const d of relDirs(dir)) {
    const [nc, nr] = step(c, r, d);
    if (inBoard(nc, nr)) out.push(nc + nr * COLS);
  }
  return out;
}

/** 두 칸이 이웃인가 (id). */
export function areAdjacent(idA, idB) {
  return distance(idA, idB) === 1;
}

/** odd-r 오프셋 → axial {q, r}. */
export function toAxial(c, r) {
  return { q: c - (r - (r & 1)) / 2, r };
}

/** axial (q, r) → odd-r 오프셋 [c, r]. */
export function fromAxial(q, r) {
  return [q + (r - (r & 1)) / 2, r];
}

/** 두 좌표 (보드 밖 가능) 사이 큐브 거리. */
export function distanceCR(c1, r1, c2, r2) {
  const a = toAxial(c1, r1);
  const b = toAxial(c2, r2);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 두 칸 id 사이 큐브 거리. */
export function distance(idA, idB) {
  const [c1, r1] = cellCR(idA);
  const [c2, r2] = cellCR(idB);
  return distanceCR(c1, r1, c2, r2);
}

/** 큐브 실수 좌표 반올림 (가장 많이 어긋난 축을 나머지 둘로 맞춘다). → axial {q, r} */
function cubeRound(x, y, z) {
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx + 0, r: rz + 0 }; // + 0: −0 을 0 으로
}

/** 선 보간 칸 고르기의 경계 흔들기 (표준 아주 작은 값, 고정 → 결정적). */
const NUDGE = [1e-6, 2e-6, -3e-6];

/**
 * 두 좌표 사이 직선 칸들 [c, r][] — 시작 · 끝 포함, 길이 = 거리 + 1, 이웃끼리 연속.
 * 큐브 선형 보간 + 고정 흔들기 (같은 입력 → 같은 칸들). nudgeSign = +1 (기본) | −1 (흔들기 반대).
 * 보드 밖 좌표도 받으며, 보드 안 두 칸 사이라도 보드 밖 칸을 지날 수 있다 (가장자리 동률) — 보드 안만 원하면 line() 을 쓴다.
 */
export function lineCR(c1, r1, c2, r2, nudgeSign = 1) {
  const n = distanceCR(c1, r1, c2, r2);
  const a = toAxial(c1, r1);
  const b = toAxial(c2, r2);
  const [nx, ny, nz] = NUDGE.map((v) => v * nudgeSign);
  // 큐브 (x = q, z = r, y = −x−z) + 흔들기
  const ax = a.q + nx, az = a.r + nz, ay = -a.q - a.r + ny;
  const bx = b.q + nx, bz = b.r + nz, by = -b.q - b.r + ny;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const h = cubeRound(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t);
    out.push(fromAxial(h.q, h.r));
  }
  return out;
}

/**
 * 두 칸 id 사이 직선 칸 id 들 (시작 · 끝 포함, 모두 보드 안).
 * odd-r 보드는 가장자리가 지그재그라, 선이 가장자리를 따라 정확히 경계 위를 지나면 기본 흔들기가 보드 밖 칸을 고를 수 있다.
 * 그때는 반대 흔들기로 다시 그린다 (경계 동률이 반대쪽으로 풀린다). 그래도 밖이면 앞뒤 칸의 공통 이웃 중 보드 안 칸으로 고친다.
 * dir: 동률 깨기 기준 방향. +1 (기본) = 위 그대로, −1 = 거울 칸들 사이 +1 직선의 거울상
 *  → line(mirror a, mirror b, −dir) = mirror(line(a, b, dir)). 엔진은 공을 찬 팀의 공격 방향을 넘긴다 (좌우 치우침 없음).
 */
export function line(idA, idB, dir = 1) {
  if (dir < 0) return line(mirrorId(idA), mirrorId(idB), 1).map(mirrorId);
  const [c1, r1] = cellCR(idA);
  const [c2, r2] = cellCR(idB);
  let path = lineCR(c1, r1, c2, r2, 1);
  if (path.some(([c, r]) => !inBoard(c, r))) path = lineCR(c1, r1, c2, r2, -1);
  for (let i = 1; i < path.length - 1; i++) {
    const [c, r] = path[i];
    if (inBoard(c, r)) continue;
    const [pc, pr] = path[i - 1];
    const [qc, qr] = path[i + 1];
    const fix = neighborCR(pc, pr).find(([nc, nr]) => inBoard(nc, nr) && distanceCR(nc, nr, qc, qr) === 1);
    if (!fix) throw new Error(`직선을 보드 안으로 고칠 수 없습니다: ${idA} → ${idB}`);
    path[i] = fix;
  }
  return path.map(([c, r]) => cellId(c, r));
}

/** 공격 방향의 앞 3방향: 홈(+1) [E, NE, SE] · 원정(−1) [W, NW, SW] (정면, 그다음 두 대각). */
export function frontDirs(dir) {
  return dir > 0 ? [E, NE, SE] : [W, NW, SW];
}

/** 공격 방향의 바로 뒤 방향: 홈 W · 원정 E. */
export function backDir(dir) {
  return dir > 0 ? W : E;
}

/** 공격 방향의 뒤 대각 2방향: 홈 [NW, SW] · 원정 [NE, SE]. */
export function backDiagDirs(dir) {
  return dir > 0 ? [NW, SW] : [NE, SE];
}

/** 칸 id 의 앞 3칸 중 보드 안인 것 (frontDirs 순서). */
export function frontCells(id, dir) {
  const [c, r] = cellCR(id);
  const out = [];
  for (const d of frontDirs(dir)) {
    const [nc, nr] = step(c, r, d);
    if (inBoard(nc, nr)) out.push(cellId(nc, nr));
  }
  return out;
}

/**
 * 공격 방향 attackDir 쪽 골 칸들 [c, r][] (보드 밖 가상 칸, r ∈ GOAL_ROWS):
 * +1 → 그 행 마지막 칸 바로 오른쪽 (15, 6) · (14, 5) · (14, 7) · −1 → (−1, r). 서로 정확히 거울상.
 */
export function goalCellsFor(attackDir) {
  return GOAL_ROWS.map((r) => [attackDir > 0 ? rowLen(r) : -1, r]);
}

/** 칸 id 에서 attackDir 쪽 골까지 최소 큐브 거리. */
export function distToGoal(id, attackDir) {
  const [c, r] = cellCR(id);
  let best = Infinity;
  for (const [gc, gr] of goalCellsFor(attackDir)) best = Math.min(best, distanceCR(c, r, gc, gr));
  return best;
}

/** goalDir 쪽 골의 박스(= 그 골을 지키는 GK 구역) 안인가: distToGoal ≤ BOX_DIST. */
export function inBox(id, goalDir) {
  return distToGoal(id, goalDir) <= BOX_DIST;
}

/** 좌우 뒤집기 (거울 축 x = MIRROR_X): [rowLen(r) − 1 − c, r] — 짝수 행 14 − c · 홀수 행 13 − c. 보드 밖 좌표도 받는다 (골 칸 ↔ 골 칸). */
export function mirrorCR(c, r) {
  return [rowLen(r) - 1 - c, r];
}

/** 칸 id 의 거울 칸 id. */
export function mirrorId(id) {
  const [c, r] = cellCR(id);
  return rowLen(r) - 1 - c + r * COLS;
}

/** 칸 중심 평면 좌표 (단위 육각 크기 1). */
export function centerXY(c, r) {
  return { x: SQRT3 * (c + 0.5 * (r & 1)), y: 1.5 * r };
}
