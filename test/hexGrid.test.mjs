// test/hexGrid.test.mjs — 육각 보드 기하 (js/engine/hexGrid.js). HEX_AUTOBATTLE_PLAN §2 · H0 SPEC §2
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLS, ROWS, E, NE, NW, W, SW, SE, DIRS, MIRROR_DIR, GOAL_ROWS, BOX_DIST, BOARD_W, BOARD_H, BOARD_X0, BOARD_Y0, MIRROR_X, ID_SPACE,
  ALL_CELLS, cellId, cellCR, isCell, inBoard, rowLen, step, neighbors, neighborsRel, relDirs, neighborCR, toAxial, fromAxial, distanceCR, distance,
  lineCR, line, frontDirs, backDir, backDiagDirs, frontCells, goalCellsFor, distToGoal, inBox, mirrorCR, mirrorId, centerXY,
} from "../js/engine/hexGrid.js";

const id = (c, r) => cellId(c, r);

test("칸 id ↔ [c, r] 왕복 · ALL_CELLS 189칸 (짝수 행 15 · 홀수 행 14) · 보드 경계", () => {
  assert.equal(COLS, 15);
  assert.equal(ROWS, 13);
  assert.equal(ID_SPACE, 195);
  assert.equal(ALL_CELLS.length, 7 * 15 + 6 * 14);
  assert.equal(ALL_CELLS.length, 189);
  assert.ok(Object.isFrozen(ALL_CELLS));
  for (let r = 0; r < ROWS; r++) {
    assert.equal(rowLen(r), r % 2 ? 14 : 15);
    assert.equal(ALL_CELLS.filter((i) => cellCR(i)[1] === r).length, rowLen(r));
  }
  for (const i of ALL_CELLS) {
    const [c, r] = cellCR(i);
    assert.ok(inBoard(c, r));
    assert.ok(isCell(i));
    assert.equal(cellId(c, r), i);
    assert.equal(i, r * COLS + c);
  }
  // id 오름차순 = 행 → 열
  for (let k = 1; k < ALL_CELLS.length; k++) assert.ok(ALL_CELLS[k] > ALL_CELLS[k - 1]);
  assert.equal(inBoard(-1, 0), false);
  assert.equal(inBoard(15, 6), false);
  assert.equal(inBoard(14, 6), true);
  assert.equal(inBoard(14, 1), false, "홀수 행은 c = 0..13");
  assert.equal(inBoard(13, 1), true);
  assert.equal(inBoard(0, 13), false);
  assert.equal(inBoard(0, -1), false);
  assert.throws(() => cellId(15, 0));
  assert.throws(() => cellId(14, 5));
  assert.throws(() => cellCR(195));
  assert.throws(() => cellCR(-1));
  assert.throws(() => cellCR(1 * 15 + 14), "홀수 행 c = 14 자리는 칸이 아니다");
  assert.equal(isCell(1 * 15 + 14), false);
  assert.equal(isCell(1.5), false);
  // 센터 칸 (7, 6)
  assert.deepEqual(cellCR(cellId(7, 6)), [7, 6]);
});

test("이웃 오프셋 — 짝수 행 · 홀수 행 (방향 순서 E, NE, NW, W, SW, SE)", () => {
  assert.deepEqual(DIRS, [E, NE, NW, W, SW, SE]);
  // 짝수 행 r = 6
  assert.deepEqual(neighborCR(7, 6), [[8, 6], [7, 5], [6, 5], [6, 6], [6, 7], [7, 7]]);
  // 홀수 행 r = 5
  assert.deepEqual(neighborCR(7, 5), [[8, 5], [8, 4], [7, 4], [6, 5], [7, 6], [8, 6]]);
  assert.deepEqual(step(7, 6, NE), [7, 5]);
  assert.deepEqual(step(7, 5, SE), [8, 6]);
  // 보드 밖도 계산한다
  assert.deepEqual(step(0, 0, NW), [-1, -1]);
  assert.deepEqual(step(13, 1, E), [14, 1]); // 홀수 행 c = 14 는 보드 밖
  // neighbors 는 보드 안만, 같은 순서
  assert.deepEqual(neighbors(id(7, 6)), [id(8, 6), id(7, 5), id(6, 5), id(6, 6), id(6, 7), id(7, 7)]);
  assert.deepEqual(neighbors(id(0, 0)), [id(1, 0), id(0, 1)]); // 짝수 행 모서리: E, SE 만
  assert.deepEqual(neighbors(id(13, 1)), [id(14, 0), id(13, 0), id(12, 1), id(13, 2), id(14, 2)]); // 홀수 행 오른쪽 끝: E 만 밖
  assert.deepEqual(neighbors(id(0, 1)), [id(1, 1), id(1, 0), id(0, 0), id(0, 2), id(1, 2)]); // 홀수 행 왼쪽 끝: W 만 밖 (거울상)
  assert.deepEqual(neighbors(id(14, 0)), [id(13, 0), id(13, 1)]); // 짝수 행 오른쪽 위 구석: W, SW
  assert.deepEqual(neighbors(id(14, 6)), [id(13, 5), id(13, 6), id(13, 7)]); // 짝수 행 오른쪽 끝: NW, W, SW
  assert.throws(() => step(0, 0, "N"));
});

test("이웃 대칭 · 이웃 거리 = 1 · 모든 칸 이웃 6 이하", () => {
  for (const a of ALL_CELLS) {
    const nb = neighbors(a);
    assert.ok(nb.length >= 2 && nb.length <= 6);
    assert.equal(new Set(nb).size, nb.length);
    for (const b of nb) {
      assert.ok(neighbors(b).includes(a), `${a} ↔ ${b}`);
      assert.equal(distance(a, b), 1);
    }
    // 내부 칸은 이웃 6
    const [c, r] = cellCR(a);
    if (c > 0 && c < rowLen(r) - 1 && r > 0 && r < ROWS - 1) assert.equal(nb.length, 6);
  }
});

test("거리 — axial 변환 · 대칭 · 삼각 부등식 · 거리 1 ⇔ 이웃", () => {
  assert.deepEqual(toAxial(7, 6), { q: 4, r: 6 });
  assert.deepEqual(toAxial(7, 5), { q: 5, r: 5 });
  assert.deepEqual(fromAxial(4, 6), [7, 6]);
  assert.deepEqual(toAxial(-1, -1), { q: 0, r: -1 }); // 음수 홀수 행
  assert.deepEqual(fromAxial(0, -1), [-1, -1]);
  assert.equal(distance(id(0, 0), id(0, 0)), 0);
  assert.equal(distance(id(0, 6), id(14, 6)), 14);
  assert.equal(distance(id(0, 0), id(0, 12)), 12);
  assert.equal(distance(id(0, 0), id(14, 12)), 20); // q 0 → 8, r 0 → 12
  // 시드 없는 고정 표본으로 삼각 부등식 · 대칭
  const sample = ALL_CELLS.filter((i) => i % 7 === 0);
  for (const a of sample) for (const b of sample) {
    assert.equal(distance(a, b), distance(b, a));
    for (const c of sample) assert.ok(distance(a, c) <= distance(a, b) + distance(b, c));
  }
  for (const a of sample) for (const b of ALL_CELLS) {
    assert.equal(distance(a, b) === 1, neighbors(a).includes(b));
  }
});

test("직선 — 모든 칸 쌍: 끝점 · 연속 · 길이 = 거리 + 1 · 보드 안 · 결정적", () => {
  for (const a of ALL_CELLS) for (const b of ALL_CELLS) {
    const ln = line(a, b);
    assert.equal(ln.length, distance(a, b) + 1);
    assert.equal(ln[0], a);
    assert.equal(ln[ln.length - 1], b);
    for (let i = 1; i < ln.length; i++) assert.equal(distance(ln[i - 1], ln[i]), 1);
    for (const x of ln) assert.ok(isCell(x), `${a} → ${b} 직선 칸 ${x} 이 보드 밖`);
  }
  const ln = line(id(1, 3), id(12, 9));
  assert.deepEqual(line(id(1, 3), id(12, 9)), ln);
  // 왼쪽 가장자리 (0,0) → (0,2): 기본 흔들기는 보드 밖 (−1,1) 을 지나므로 line 은 반대 흔들기로 (0,1) 을 지난다
  assert.deepEqual(lineCR(0, 0, 0, 2), [[0, 0], [-1, 1], [0, 2]]);
  assert.deepEqual(line(id(0, 0), id(0, 2)), [id(0, 0), id(0, 1), id(0, 2)]);
  // 오른쪽 가장자리도 같다 (홀수 행 c = 14 는 밖 → (13, 1) 로)
  assert.deepEqual(line(id(14, 0), id(14, 2)), [id(14, 0), id(13, 1), id(14, 2)]);
  assert.deepEqual(line(id(3, 6), id(3, 6)), [id(3, 6)]);
  assert.deepEqual(line(id(2, 6), id(6, 6)), [id(2, 6), id(3, 6), id(4, 6), id(5, 6), id(6, 6)]);
  // 보드 밖 좌표도 lineCR 로는 된다 (가상 골 칸)
  const lc = lineCR(12, 6, 15, 6);
  assert.deepEqual(lc, [[12, 6], [13, 6], [14, 6], [15, 6]]);
});

test("앞 3칸 · 뒤 · 뒤 대각 — 홈 / 원정, 가장자리", () => {
  assert.deepEqual(frontDirs(1), [E, NE, SE]);
  assert.deepEqual(frontDirs(-1), [W, NW, SW]);
  assert.equal(backDir(1), W);
  assert.equal(backDir(-1), E);
  assert.deepEqual(backDiagDirs(1), [NW, SW]);
  assert.deepEqual(backDiagDirs(-1), [NE, SE]);
  // 앞 3 + 뒤 + 뒤 대각 2 = 6방향 전부, 겹치지 않음
  for (const d of [1, -1]) assert.deepEqual(new Set([...frontDirs(d), backDir(d), ...backDiagDirs(d)]), new Set(DIRS));
  // 짝수 행 홈
  assert.deepEqual(frontCells(id(7, 6), 1), [id(8, 6), id(7, 5), id(7, 7)]);
  // 홀수 행 홈
  assert.deepEqual(frontCells(id(7, 5), 1), [id(8, 5), id(8, 4), id(8, 6)]);
  // 짝수 행 원정
  assert.deepEqual(frontCells(id(7, 6), -1), [id(6, 6), id(6, 5), id(6, 7)]);
  // 홀수 행 원정
  assert.deepEqual(frontCells(id(7, 5), -1), [id(6, 5), id(7, 4), id(7, 6)]);
  // 가장자리: 오른쪽 끝 홈 → 짝수 행 (14, r) 은 앞이 전부 밖, 홀수 행 (13, r) 은 대각 2칸이 안
  assert.deepEqual(frontCells(id(14, 6), 1), []);
  assert.deepEqual(frontCells(id(13, 5), 1), [id(14, 4), id(14, 6)]);
  // 위 터치라인 r = 0 홈: NE 밖
  assert.deepEqual(frontCells(id(3, 0), 1), [id(4, 0), id(3, 1)]);
  // 왼쪽 끝 원정: 짝수 행은 전부 밖, 홀수 행은 대각 2칸
  assert.deepEqual(frontCells(id(0, 6), -1), []);
  assert.deepEqual(frontCells(id(0, 5), -1), [id(0, 4), id(0, 6)]);
  // 아래 터치라인 r = 12 원정: SW 밖
  assert.deepEqual(frontCells(id(5, 12), -1), [id(4, 12), id(4, 11)]);
  // 앞 3칸은 모두 거리 1, 그리고 거울 칸의 반대 방향 앞 3칸 = 거울상 (같은 순서)
  for (const a of ALL_CELLS) for (const d of [1, -1]) {
    for (const f of frontCells(a, d)) assert.equal(distance(a, f), 1);
    assert.deepEqual(frontCells(mirrorId(a), -d), frontCells(a, d).map(mirrorId));
  }
});

test("공격 방향 기준 이웃 순서 relDirs · neighborsRel — 정면 → 앞 대각 → 뒤 대각 → 뒤, 원정은 홈의 거울상", () => {
  assert.deepEqual(relDirs(1), [E, NE, SE, NW, SW, W]);
  assert.deepEqual(relDirs(-1), [W, NW, SW, NE, SE, E]);
  assert.deepEqual(relDirs(-1), relDirs(1).map((d) => MIRROR_DIR[d]));
  assert.deepEqual(relDirs(1).slice(0, 3), frontDirs(1));
  assert.deepEqual(relDirs(-1).slice(0, 3), frontDirs(-1));
  assert.deepEqual(neighborsRel(id(7, 6), 1), [id(8, 6), id(7, 5), id(7, 7), id(6, 5), id(6, 7), id(6, 6)]);
  for (const a of ALL_CELLS) {
    assert.deepEqual(new Set(neighborsRel(a, 1)), new Set(neighbors(a)));
    assert.deepEqual(new Set(neighborsRel(a, -1)), new Set(neighbors(a)));
    // 거울 칸에서 반대 방향 순서 = 거울상 (동률 깨기가 좌우 대칭)
    assert.deepEqual(neighborsRel(mirrorId(a), -1), neighborsRel(a, 1).map(mirrorId));
  }
});

test("골 칸 · 골까지 거리 · 박스", () => {
  assert.deepEqual(GOAL_ROWS, [5, 6, 7]);
  assert.equal(BOX_DIST, 2);
  assert.deepEqual(goalCellsFor(1), [[14, 5], [15, 6], [14, 7]]);
  assert.deepEqual(goalCellsFor(-1), [[-1, 5], [-1, 6], [-1, 7]]);
  for (const [c, r] of [...goalCellsFor(1), ...goalCellsFor(-1)]) assert.equal(inBoard(c, r), false);
  // 골 칸은 서로 거울상 · 각 골 칸은 그 행 끝 칸 바로 옆
  assert.deepEqual(goalCellsFor(1).map(([c, r]) => mirrorCR(c, r)), goalCellsFor(-1));
  for (const [c, r] of goalCellsFor(1)) assert.ok(inBoard(c - 1, r));
  assert.equal(distToGoal(id(14, 6), 1), 1);
  assert.equal(distToGoal(id(13, 5), 1), 1);
  assert.equal(distToGoal(id(13, 6), 1), 2);
  assert.equal(distToGoal(id(0, 6), -1), 1);
  assert.equal(distToGoal(id(1, 6), -1), 2);
  assert.equal(distToGoal(id(7, 6), 1), 8);
  assert.equal(distToGoal(id(0, 6), 1), 15);
  assert.ok(inBox(id(13, 6), 1));
  assert.ok(!inBox(id(12, 6), 1));
  assert.ok(inBox(id(1, 6), -1));
  assert.ok(!inBox(id(2, 6), -1));
  assert.ok(!inBox(id(14, 0), 1)); // 구석은 박스 밖
  // 박스 크기: 양쪽 같은 12칸 (거울상), 반대편 박스와 겹치지 않는다
  const right = ALL_CELLS.filter((i) => inBox(i, 1));
  const left = ALL_CELLS.filter((i) => inBox(i, -1));
  assert.equal(right.length, 12);
  assert.equal(left.length, 12);
  assert.deepEqual(new Set(right.map(mirrorId)), new Set(left));
  // 골까지 거리별 칸 수도 양쪽 같다
  for (let d = 1; d <= 16; d++) {
    assert.equal(ALL_CELLS.filter((i) => distToGoal(i, 1) === d).length, ALL_CELLS.filter((i) => distToGoal(i, -1) === d).length, `거리 ${d}`);
  }
  for (const i of right) assert.ok(!left.includes(i));
  for (const i of right) assert.ok(cellCR(i)[0] >= 12);
  for (const i of left) assert.ok(cellCR(i)[0] <= 2);
  // 박스 안 칸은 거리 1~2
  for (const i of right) assert.ok(distToGoal(i, 1) >= 1 && distToGoal(i, 1) <= BOX_DIST);
});

test("좌우 거울 mirrorCR · mirrorId — 판 전체가 정확히 대칭 (거리 · 이웃 · 직선 · 골까지 거리 · 박스)", () => {
  assert.deepEqual(mirrorCR(0, 6), [14, 6]);
  assert.deepEqual(mirrorCR(2, 4), [12, 4]);
  assert.deepEqual(mirrorCR(0, 5), [13, 5]); // 홀수 행은 13 − c
  assert.deepEqual(mirrorCR(6, 5), [7, 5]);
  assert.deepEqual(mirrorCR(7, 6), [7, 6]); // 센터 칸은 그대로
  assert.deepEqual(mirrorCR(15, 6), [-1, 6]); // 보드 밖 골 칸끼리
  assert.deepEqual(mirrorCR(14, 5), [-1, 5]);
  // 거울 짝: 짝수 행 가운데 칸만 제자리, 홀수 행은 제자리 칸 없음
  assert.deepEqual(ALL_CELLS.filter((i) => mirrorId(i) === i).map(cellCR), Array.from({ length: 7 }, (_, k) => [7, 2 * k]));
  // 보드 밖 좌표: inBoard(거울) = inBoard
  for (let r = -2; r <= ROWS + 1; r++) for (let c = -3; c <= COLS + 2; c++) {
    const [mc, mr] = mirrorCR(c, r);
    assert.equal(inBoard(mc, mr), inBoard(c, r), `(${c}, ${r})`);
    assert.deepEqual(mirrorCR(mc, mr), [c, r]);
  }
  for (const i of ALL_CELLS) {
    const m = mirrorId(i);
    assert.ok(isCell(m));
    assert.equal(mirrorId(m), i, "거울은 자기 역");
    assert.deepEqual(cellCR(m), mirrorCR(...cellCR(i)));
    // 골까지 거리 · 박스 (공격 방향을 뒤집어)
    assert.equal(distToGoal(i, 1), distToGoal(m, -1));
    assert.equal(distToGoal(i, -1), distToGoal(m, 1));
    assert.equal(inBox(i, 1), inBox(m, -1));
    // 이웃의 거울 = 거울의 이웃
    assert.deepEqual(new Set(neighbors(i).map(mirrorId)), new Set(neighbors(m)));
  }
  // 모든 칸 쌍: 거리 보존, 직선 길이 같음, 반대 방향 직선 = 거울상
  for (const a of ALL_CELLS) for (const b of ALL_CELLS) {
    const ma = mirrorId(a);
    const mb = mirrorId(b);
    assert.equal(distance(ma, mb), distance(a, b));
    const ln = line(a, b);
    assert.equal(line(ma, mb).length, ln.length);
    assert.deepEqual(line(ma, mb, -1), ln.map(mirrorId));
  }
});

test("평면 좌표 centerXY · 보드 외곽", () => {
  assert.deepEqual(centerXY(0, 0), { x: 0, y: 0 });
  assert.equal(centerXY(1, 0).x, Math.sqrt(3));
  assert.equal(centerXY(0, 1).x, Math.sqrt(3) / 2);
  assert.equal(centerXY(0, 2).y, 3);
  assert.ok(Math.abs(BOARD_W - Math.sqrt(3) * 15) < 1e-12);
  assert.equal(BOARD_H, 20);
  // 거울 축 = 센터 칸 x = 외곽 가운데, 모든 칸 x 가 그 축에 대해 거울상
  assert.ok(Math.abs(MIRROR_X - 7 * Math.sqrt(3)) < 1e-12);
  assert.equal(centerXY(7, 6).x, 7 * Math.sqrt(3));
  assert.ok(Math.abs(BOARD_X0 + BOARD_W / 2 - MIRROR_X) < 1e-12);
  for (const i of ALL_CELLS) {
    const p = centerXY(...cellCR(i));
    const q = centerXY(...cellCR(mirrorId(i)));
    assert.ok(Math.abs(p.x + q.x - 2 * MIRROR_X) < 1e-9);
    assert.equal(p.y, q.y);
  }
  // 왼쪽 · 오른쪽 끝 칸이 외곽에 딱 닿는다 (짝수 행 c = 0 · 14, 홀수 행 c = 0 · 13 의 바깥 변)
  assert.ok(Math.abs(centerXY(0, 0).x - Math.sqrt(3) / 2 - BOARD_X0) < 1e-12);
  assert.ok(Math.abs(centerXY(14, 0).x + Math.sqrt(3) / 2 - (BOARD_X0 + BOARD_W)) < 1e-9);
  assert.ok(Math.abs(centerXY(13, 1).x + Math.sqrt(3) / 2 - (BOARD_X0 + BOARD_W - Math.sqrt(3) / 2)) < 1e-9);
  // 모든 칸 중심이 외곽 안 (반 칸 여유)
  for (const i of ALL_CELLS) {
    const [c, r] = cellCR(i);
    const { x, y } = centerXY(c, r);
    assert.ok(x - Math.sqrt(3) / 2 >= BOARD_X0 - 1e-9 && x + Math.sqrt(3) / 2 <= BOARD_X0 + BOARD_W + 1e-9);
    assert.ok(y - 1 >= BOARD_Y0 - 1e-9 && y + 1 <= BOARD_Y0 + BOARD_H + 1e-9);
  }
  // 이웃 중심 사이 거리 = √3 (단위 육각)
  for (const a of [id(7, 6), id(7, 5)]) for (const b of neighbors(a)) {
    const p = centerXY(...cellCR(a));
    const q = centerXY(...cellCR(b));
    assert.ok(Math.abs(Math.hypot(p.x - q.x, p.y - q.y) - Math.sqrt(3)) < 1e-9);
  }
});
