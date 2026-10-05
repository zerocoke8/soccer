// test/view25.test.mjs — 2.5D 경기 화면 투영 (docs/SPRITE_25D_PLAN.md §3 · §6 — js/ui/view25.js, 순수 함수) + 모드 스위치 (js/ui/store.js isD25)
//   호모그래피 네 귀퉁이 · project ↔ unproject 왕복 · cssMatrix3d 를 파싱해 project 와 같은 점 · 먼 쪽 s < 가까운 쪽 · project3 높이 ·
//   세운 그림 크기 · 방향 · 호 높이 · 배경 띠 · 골대 · 주소로 켜고 끄기 (?d25=1 · ?flat=1 · /sprite/).
//   D2 카메라 (§5 표): cameraPhase (상황 → 줄) · cameraTarget 줄마다 (풀코트 · 따라가기 · 4배속 · 결정 틀 · 틀 낮추기 · 커버 · 액션) · clampCamera · camWindow.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as V from "../js/ui/view25.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = pathToFileURL(path.join(ROOT, "js/ui/store.js")).href;
const { V25 } = V;
const SIZES = [[1244, 528], [915, 388], [1600, 680]]; // 스테이지 필드 영역 + 다른 크기 (W · H 를 박아 두지 않는다)
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b} (±${eps})`);

/** "matrix3d(a, b, …)" → 16 숫자 (열 우선) */
function parseMatrix3d(str) {
  const m = /^matrix3d\(([^)]*)\)$/.exec(str);
  assert.ok(m, `matrix3d 문자열: ${str}`);
  const n = m[1].split(",").map((x) => Number(x.trim()));
  assert.equal(n.length, 16);
  assert.ok(n.every(Number.isFinite), "모든 성분이 숫자");
  return n;
}
/** CSS 3D 변환 (열 우선 16) 을 점 (x, y, 0, 1) 에 걸고 원근 나누기 */
function applyCss(n, x, y) {
  const X = n[0] * x + n[4] * y + n[12];
  const Y = n[1] * x + n[5] * y + n[13];
  const w = n[3] * x + n[7] * y + n[15];
  return [X / w, Y / w];
}

test("호모그래피: 필드 네 귀퉁이 → 대칭 사다리꼴 (가까운 터치라인 = H − 6 · 폭 전체, 먼 터치라인 = 34 · 좌우 8.5% 안쪽)", () => {
  for (const [W, H] of SIZES) {
    const fi = W * V25.FAR_INSET;
    const cases = [
      [0, 0, fi, V25.FAR_Y], [0, 100, W - fi, V25.FAR_Y], // 먼 터치라인 (필드 x 0 = 위): home 골 쪽 · away 골 쪽
      [100, 0, 0, H - V25.NEAR_PAD], [100, 100, W, H - V25.NEAR_PAD], // 가까운 터치라인
    ];
    for (const [x, y, sx, sy] of cases) {
      const p = V.project(x, y, W, H);
      near(p.sx, sx, 1e-6, `${W}×${H} (${x}, ${y}) sx`);
      near(p.sy, sy, 1e-6, `${W}×${H} (${x}, ${y}) sy`);
    }
    // 가운데 세로줄 (필드 y 50) 은 화면 가운데, 좌우 대칭
    for (const x of [0, 30, 70, 100]) near(V.project(x, 50, W, H).sx, W / 2, 1e-6, `y 50 → 가운데 (x ${x})`);
    for (const [x, y] of [[20, 10], [65, 33], [90, 2]]) {
      const a = V.project(x, y, W, H);
      const b = V.project(x, 100 - y, W, H);
      near(a.sx + b.sx, W, 1e-6, `좌우 대칭 (${x}, ${y})`);
      near(a.sy, b.sy, 1e-6, `같은 깊이 = 같은 화면 y (${x}, ${y})`);
    }
  }
});

test("판 좌표: 필드 % ↔ 판 (u = RU + y·FL, v = RV + x·FD) · 판 크기 = 필드 + 런오프", () => {
  assert.deepEqual(V.planeSize(), { PL: V25.FL + 2 * V25.RU, PD: V25.FD + 2 * V25.RV });
  assert.deepEqual(V.fieldToPlane(0, 0), { u: V25.RU, v: V25.RV });
  assert.deepEqual(V.fieldToPlane(100, 100), { u: V25.RU + V25.FL, v: V25.RV + V25.FD });
  for (const [x, y] of [[0, 0], [37.5, 12.25], [100, 100], [-5, 104]]) {
    const { u, v } = V.fieldToPlane(x, y);
    const back = V.planeToField(u, v);
    near(back.x, x, 1e-9, "x 왕복");
    near(back.y, y, 1e-9, "y 왕복");
  }
});

test("project ↔ unproject 왕복 (필드 안 · 런오프), projectPlane = project", () => {
  for (const [W, H] of SIZES) {
    for (const [x, y] of [[0, 0], [100, 100], [50, 50], [8, 4], [92, 96], [33.3, 71.1], [-5, -4], [105, 104]]) {
      const p = V.project(x, y, W, H);
      const back = V.unproject(p.sx, p.sy, W, H);
      near(back.x, x, 1e-6, `${W}×${H} x 왕복 (${x}, ${y})`);
      near(back.y, y, 1e-6, `${W}×${H} y 왕복 (${x}, ${y})`);
      const { u, v } = V.fieldToPlane(x, y);
      const q = V.projectPlane(u, v, W, H);
      near(q.sx, p.sx, 1e-9, "projectPlane sx");
      near(q.sy, p.sy, 1e-9, "projectPlane sy");
      near(V.scaleAtScreen(p.sx, p.sy, W, H), p.s, 1e-6, "화면 점의 배율 = 그 자리 s");
    }
  }
});

test("cssMatrix3d: 판 div (transform-origin 0 0) 의 점이 화면에서 project 와 같은 자리 (판 네 귀퉁이 · 필드 · 런오프)", () => {
  for (const [W, H] of SIZES) {
    const n = parseMatrix3d(V.cssMatrix3d(W, H));
    assert.equal(n[10], 1, "Z 는 그대로 (m33 = 1)");
    const { PL, PD } = V.planeSize();
    const pts = [[0, 0], [PL, 0], [PL, PD], [0, PD], [PL / 2, PD / 2], [V25.RU, V25.RV], [V25.RU + V25.FL, V25.RV + V25.FD], [123, 456], [1300, 77]];
    for (const [u, v] of pts) {
      const [sx, sy] = applyCss(n, u, v);
      const p = V.projectPlane(u, v, W, H);
      near(sx, p.sx, 1e-6, `${W}×${H} 판 (${u}, ${v}) sx`);
      near(sy, p.sy, 1e-6, `${W}×${H} 판 (${u}, ${v}) sy`);
    }
    // 같은 크기는 같은 문자열 (캐시)
    assert.equal(V.cssMatrix3d(W, H), V.cssMatrix3d(W, H));
  }
});

test("깊이 배율 s: 가까운 터치라인 1 · 먼 쪽 약 0.83 (< 가까운 쪽), 깊이 따라 늘고 같은 깊이면 같다 · 바닥 납작 비율", () => {
  const [W, H] = SIZES[0];
  near(V.project(100, 50, W, H).s, 1, 1e-9, "가까운 터치라인 s = 1");
  near(V.project(100, 50, W, H).k, W / V25.FL, 1e-9, "가까운 터치라인 k = W / FL");
  const far = V.project(0, 50, W, H).s;
  near(far, 1 - 2 * V25.FAR_INSET, 1e-9, "먼 터치라인 s = 사다리꼴 윗변 / 아랫변");
  assert.ok(far < 1);
  let prev = 0;
  for (let x = 0; x <= 100; x += 10) {
    const s = V.project(x, 30, W, H).s;
    assert.ok(s > prev, `x ${x}: s ${s} > ${prev} (가까울수록 크다)`);
    prev = s;
    near(V.project(x, 80, W, H).s, s, 1e-9, "같은 깊이 = 같은 s");
    const ga = V.groundAspect(x, 30, W, H);
    assert.ok(ga > 0.4 && ga < 0.7, `바닥 납작 비율 ${ga} (위에서 약 30°)`);
  }
  assert.ok(V.groundAspect(100, 30, W, H) > V.groundAspect(0, 30, W, H), "가까울수록 덜 납작");
  // 투영한 방향: 필드 y + = 화면 오른쪽, 필드 x + = 화면 아래
  const r = V.dirAt(0, 1, 50, 30, W, H);
  const d = V.dirAt(1, 0, 50, 30, W, H);
  assert.ok(r[0] > 0.99 && Math.abs(r[1]) < 1e-6, `오른쪽 ${r}`);
  assert.ok(d[1] > 0.9, `아래 ${d}`);
  near(Math.hypot(...d), 1, 1e-9, "단위 벡터");
});

test("project3: 판 위 높이 h → 바닥 점에서 화면 y 를 h · k · liftK 만큼 위로 (화면 x 그대로)", () => {
  const [W, H] = SIZES[0];
  for (const [x, y] of [[10, 20], [90, 70], [50, 50]]) {
    const { u, v } = V.fieldToPlane(x, y);
    const g = V.projectPlane(u, v, W, H);
    for (const h of [0, 40, V25.GOAL_H]) {
      const p = V.project3(u, v, h, W, H);
      near(p.sx, g.sx, 1e-9, "sx 그대로");
      near(g.sy - p.sy, h * g.k * V25.LIFT_K, 1e-9, `높이 ${h}`);
      near(p.s, g.s, 1e-9, "배율 그대로");
    }
  }
});

test("세운 그림 크기 · 방향 · 호 높이", () => {
  // 스프라이트 = 72 · s, 폭 = 그림 비율, 반폭 = 발 기준 먼 쪽; 스탠디 = 58 · s, 얼굴 40 · s
  const spr = { w: 141, h: 240, footX: 0.461 };
  const a = V.figureSize(1, spr);
  near(a.fh, V25.SPR_H, 1e-9, "스프라이트 키");
  near(a.fw, 72 * (141 / 240), 1e-9, "스프라이트 폭");
  near(a.hw, (1 - 0.461) * a.fw, 1e-9, "반폭 = 발에서 먼 쪽");
  const b = V.figureSize(0.83, null);
  near(b.fh, V25.STANDEE_H * 0.83, 1e-9, "스탠디 키");
  near(b.hw, (V25.STANDEE_D / 2) * 0.83, 1e-9, "스탠디 반폭");
  near(V.spriteHeight(0.9), 64.8, 1e-9, "spriteHeight");
  near(V.standeeHeight(1), 58, 1e-9, "standeeHeight");
  // 방향: 공 가진 선수 = 공격 방향, 나머지 = 공 쪽, 공과 같은 x 면 팀 공격 방향
  assert.equal(V.facing({ carrier: true, attackRight: true, sx: 500, ballSx: 100 }), "r");
  assert.equal(V.facing({ carrier: true, attackRight: false, sx: 100, ballSx: 500 }), "l");
  assert.equal(V.facing({ sx: 600, ballSx: 500, side: "away" }), "l", "공 왼쪽");
  assert.equal(V.facing({ sx: 400, ballSx: 500, side: "away" }), "r", "공 오른쪽");
  assert.equal(V.facing({ sx: 500, ballSx: 501, side: "away" }), "l", "거의 같은 x = 팀 방향 (away 왼쪽)");
  assert.equal(V.facing({ sx: 500, ballSx: null, side: "home" }), "r");
  // 호: 꼭대기 = 90 · s, 300px 보다 짧으면 비례해서 낮게
  near(V.arcLift(600, 1), V25.BALL_LIFT, 1e-9, "긴 호");
  near(V.arcLift(150, 0.9), V25.BALL_LIFT * 0.9 * 0.5, 1e-9, "짧은 호");
  assert.equal(V.arcLift(0, 1), 0);
});

test("배경 띠 · 월드 사각형 · 서 있는 골대", () => {
  for (const [W, H] of SIZES) {
    const far = V.projectPlane(0, 0, W, H);
    const st = V.stripRect(W, H);
    near(st.y + st.h, far.sy + V25.STRIP_OVERLAP, 1e-9, "띠 아래 끝 = 판 먼 끝 + 겹침");
    near(st.h / st.w, V25.STRIP_H / V25.STRIP_W, 1e-9, "그림 비율");
    near(st.x + st.w / 2, W / 2, 1e-9, "가운데");
    assert.ok(st.x <= -V25.STRIP_PAD + 1e-9 && st.x + st.w >= W + V25.STRIP_PAD - 1e-9, "필드 영역보다 넓다");
    const wr = V.worldRect(W, H);
    assert.ok(wr.x0 <= st.x && wr.y0 <= st.y && wr.x1 >= st.x + st.w, "띠를 품는다");
    near(wr.y1, V.projectPlane(0, V.planeSize().PD, W, H).sy, 1e-9, "아래 끝 = 판 가까운 끝");
    for (const end of ["home", "away"]) {
      const g = V.goalShapes(end, W, H);
      assert.equal(g.frame.length, 4);
      assert.equal(g.nets.length, 4);
      assert.ok(g.grid.length > 10);
      // 기둥 아래 = 골라인 위 골문 양 끝 (필드 x 62 · 38), 기둥 위 = 그 위 GOAL_H
      const gy = end === "home" ? 0 : 100;
      const bottomNear = V.unproject(g.frame[0][0], g.frame[0][1], W, H);
      const bottomFar = V.unproject(g.frame[3][0], g.frame[3][1], W, H);
      near(bottomNear.x, V25.GOAL_X1, 1e-6, `${end} 가까운 기둥 x`);
      near(bottomFar.x, V25.GOAL_X0, 1e-6, `${end} 먼 기둥 x`);
      near(bottomNear.y, gy, 1e-6, `${end} 골라인`);
      const k = V.project(V25.GOAL_X1, gy, W, H).k;
      near(g.frame[0][1] - g.frame[1][1], V25.GOAL_H * k * V25.LIFT_K, 1e-6, "기둥 높이");
      // 그물은 골라인 바깥 (home = 왼쪽, away = 오른쪽)
      const back = V.unproject(g.nets[0][0][0], g.nets[0][0][1], W, H);
      assert.ok(end === "home" ? back.y < 0 : back.y > 100, `${end} 그물 바깥 (${back.y})`);
    }
  }
});

/** location 을 잠깐 바꾸고 store.js 를 새로 읽는다 (쿼리로 모듈 캐시를 피한다 — test/spriteSite 와 같은 방법) */
async function storeAt(pathname, search, tag) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { pathname, search }, configurable: true, writable: true });
  try {
    return await import(`${STORE}?d25-${tag}`);
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete globalThis.location;
  }
}

test("2.5D 모드 스위치 (store.isD25): ?d25=1 켬 · ?flat=1 · ?d25=0 끔 · /sprite/ 사이트 기본 켬 · 그 밖 (로컬 · 테스트) 기본 평면 · 테스트용 바꾸기", async () => {
  const plain = await import(STORE); // 테스트는 location 없이 읽는다 → 평면
  assert.equal(plain.isD25(), false, "테스트 · 로컬 기본 = 평면");
  plain.setD25ForTest(true);
  assert.equal(plain.isD25(), true, "테스트용 켜기");
  plain.setD25ForTest(null);
  assert.equal(plain.isD25(), false, "null = 기본값으로");
  const cases = [
    ["/soccer/", "?d25=1", true, "on"],
    ["/soccer/lesson/", "?auto=0&d25=1", true, "on2"],
    ["/soccer/", "?d25=1&flat=1", false, "flatwins"],
    ["/soccer/", "", false, "local"],
    ["/index.html", "?speed=2", false, "local2"],
    ["/soccer/sprite/", "", true, "sprite"],
    ["/soccer/sprite/", "?flat=1", false, "spriteflat"],
    ["/soccer/sprite/", "?d25=0", false, "sprite0"],
  ];
  for (const [p, q, want, tag] of cases) {
    const st = await storeAt(p, q, tag);
    assert.equal(st.isD25(), want, `${p}${q}`);
    st.setD25ForTest(!want);
    assert.equal(st.isD25(), !want, "바꾸기");
    st.setD25ForTest(null);
    assert.equal(st.isD25(), want, "기본값으로");
  }
});

/* ------------------------------------------------------------------ */
/* D2 카메라 (§5)                                                         */
/* ------------------------------------------------------------------ */
const { CAM } = V;
const [CW, CH] = SIZES[0];
/** 창 (월드 사각형) 이 상자를 여백 (화면 px ÷ z) 과 함께 품는가 */
const holds = (win, b, z, eps = 1e-6) => win.l <= b.l - CAM.PAD_X / z + eps && win.r >= b.r + CAM.PAD_X / z - eps &&
  win.t <= b.t - CAM.PAD_T / z + eps && win.b >= b.b + CAM.PAD_B / z - eps;
const insideWorld = (win, wr, eps = 1e-6) => win.l >= wr.x0 - eps && win.r <= wr.x1 + eps && win.t >= wr.y0 - eps && win.b <= wr.y1 + eps;

test("카메라 상황 → §5 표의 줄 (cameraPhase): ⏭ · 경기 끝 · 골 = 전체, 액션 = 지금 z, 사람이 고르는 중 = 결정 (화면을 연 킥오프는 잠깐 미룸), 킥오프 · 시작 = 전체, 그 밖 = 따라가기", () => {
  assert.equal(V.cameraPhase({}), "follow", "평소");
  for (const k of ["skip", "finished", "goal"]) {
    assert.equal(V.cameraPhase({ [k]: true }), "full", k);
    assert.equal(V.cameraPhase({ [k]: true, deciding: true, action: true }), "full", `${k} 가 먼저`);
  }
  assert.equal(V.cameraPhase({ action: true }), "action");
  assert.equal(V.cameraPhase({ action: true, deciding: true, kickoff: true }), "action", "액션 중에는 지금 z");
  assert.equal(V.cameraPhase({ deciding: true }), "decide");
  assert.equal(V.cameraPhase({ deciding: true, kickoff: true }), "decide", "킥오프 배치라도 사람이 고르는 중이면 결정 확대");
  assert.equal(V.cameraPhase({ deciding: true, startHold: true }), "full", "화면을 연 킥오프: 잠깐 풀코트");
  assert.equal(V.cameraPhase({ kickoff: true }), "full", "킥오프 배치");
  assert.equal(V.cameraPhase({ start: true }), "full", "경기 시작 첫 비트");
});

test("카메라 '전체' (경기 시작 · 골 · 킥오프 · 끝 · ⏭): z 1 · 필드 영역 가운데 — 창 = 필드 영역 그대로, clampCamera 도 z ≤ 1 이면 전체", () => {
  for (const [W, H] of SIZES) {
    assert.deepEqual(V.cameraTarget({ phase: "full", W, H }), { cx: W / 2, cy: H / 2, z: 1 });
    assert.deepEqual(V.clampCamera({ cx: 10, cy: -500, z: 1 }, W, H), { cx: W / 2, cy: H / 2, z: 1 }, "z 1 = 언제나 전체");
    assert.deepEqual(V.clampCamera({ cx: 10, cy: 10, z: 0.5 }, W, H), { cx: W / 2, cy: H / 2, z: 1 }, "z < 1 → 1");
    assert.deepEqual(V.camWindow({ cx: W / 2, cy: H / 2, z: 1 }, W, H), { l: 0, r: W, t: 0, b: H });
    assert.deepEqual(V.camTranslate({ cx: W / 2, cy: H / 2, z: 1 }, W, H), { tx: 0, ty: 0 });
    // 필요한 값이 없으면 전체
    assert.deepEqual(V.cameraTarget({ phase: "follow", W, H, ball: null }), { cx: W / 2, cy: H / 2, z: 1 });
    assert.deepEqual(V.cameraTarget({ phase: "decide", W, H, boxes: [] }), { cx: W / 2, cy: H / 2, z: 1 });
    assert.deepEqual(V.cameraTarget({ phase: "action", W, H, to: null, current: { z: 2 } }), { cx: W / 2, cy: H / 2, z: 1 });
  }
});

test("카메라 '공 따라가기': z 1.4 (4배속 1.2), 가운데 = 공 + 공격 방향 앞쪽 8% (필드 길이), 땅 점보다 LIFT · s 위", () => {
  const ball = { x: 50, y: 45 };
  for (const [speed, z] of [[1, CAM.Z_FOLLOW], [2, CAM.Z_FOLLOW], [4, CAM.Z_FOLLOW_FAST]]) {
    assert.equal(V.followZoom(speed), z, `배속 ${speed}`);
    for (const attackRight of [true, false]) {
      const c = V.cameraTarget({ phase: "follow", W: CW, H: CH, speed, ball, attackRight });
      const p = V.project(ball.x, ball.y + (attackRight ? 8 : -8), CW, CH);
      assert.equal(c.z, z);
      near(c.cx, p.sx, 1e-9, "가운데 x = 앞쪽 8% 의 투영");
      near(c.cy, p.sy - CAM.LIFT * p.s, 1e-9, "가운데 y = 땅 점 − LIFT · s");
      const b = V.project(ball.x, ball.y, CW, CH);
      assert.ok(attackRight ? c.cx > b.sx : c.cx < b.sx, "공격 방향 앞쪽을 미리 본다");
      // 공 (발) 은 창 안
      const win = V.camWindow(c, CW, CH);
      assert.ok(b.sx > win.l && b.sx < win.r && b.sy > win.t && b.sy < win.b, "공이 창 안");
    }
  }
  assert.equal(V.cameraTarget({ phase: "follow", W: CW, H: CH, speed: 4, ball }).z, 1.2, "4배속 = 1.2");
});

test("카메라 '결정 틀': 가까운 듀얼 + 받는 선수 = 2배 · 상자 (+여백) 가 창 안, 먼 받는 선수 = 들어가는 z 로 낮춤 (1.4 까지), 그래도 안 들어가면 듀얼 둘 (core) 은 창 안, 커버 = 보이면", () => {
  const W = CW;
  const H = CH;
  const fb = (x, y, extra = {}) => ({ ...V.figureBox(x, y, W, H), ...extra });
  // 가까이 (2배)
  const near3 = [fb(40, 46, { core: true }), fb(40, 50, { core: true }), fb(35, 60)];
  const a = V.cameraTarget({ phase: "decide", W, H, boxes: near3 });
  assert.equal(a.z, CAM.Z_DECIDE, "2배");
  const wa = V.camWindow(a, W, H);
  for (const b of near3) assert.ok(holds(wa, b, a.z), "상자 + 여백이 창 안");
  near(a.cx, (Math.min(...near3.map((b) => b.l)) + Math.max(...near3.map((b) => b.r))) / 2, 1e-6, "가운데 = 틀 가운데");
  // 4배속이어도 결정 확대는 2배 (배속과 무관)
  assert.equal(V.cameraTarget({ phase: "decide", W, H, speed: 4, boxes: near3 }).z, CAM.Z_DECIDE);
  // 먼 받는 선수: 2배 창에 안 들어가면 들어가는 z 로 (1.4 ~ 2)
  const mid = [fb(40, 40, { core: true }), fb(40, 44, { core: true }), fb(85, 62)];
  const b = V.cameraTarget({ phase: "decide", W, H, boxes: mid });
  assert.ok(b.z > CAM.Z_FOLLOW && b.z < CAM.Z_DECIDE, `낮춘 z ${b.z}`);
  const wb = V.camWindow(b, W, H);
  for (const x of mid) assert.ok(holds(wb, x, b.z, 1e-3), "낮춘 z 에서 틀 전체가 창 안");
  // 아주 먼 받는 선수 (1.4 에서도 안 들어감): z = 1.4, 듀얼 둘은 창 안 (여백 포함)
  const far = [fb(10, 20, { core: true }), fb(10, 24, { core: true }), fb(95, 85)];
  const c = V.cameraTarget({ phase: "decide", W, H, boxes: far });
  assert.equal(c.z, CAM.Z_FOLLOW, "1.4 까지만 낮춘다");
  const wc = V.camWindow(c, W, H);
  for (const x of far.filter((q) => q.core)) assert.ok(holds(wc, x, c.z, 1e-3), "듀얼 둘 (core) 은 창 안");
  assert.ok(!holds(wc, far[2], c.z), "먼 받는 선수는 창 밖일 수 있다");
  // 커버 (opt): 2배 창 밖이면 틀을 넓히지 않는다, 창에 걸리면 넣는다
  const outCover = V.cameraTarget({ phase: "decide", W, H, boxes: [...near3, fb(95, 95, { opt: true })] });
  assert.deepEqual(outCover, a, "보이지 않는 커버는 무시");
  const nearCover = [...near3, fb(42, 38, { opt: true })];
  const d = V.cameraTarget({ phase: "decide", W, H, boxes: nearCover });
  assert.ok(holds(V.camWindow(d, W, H), nearCover[3], d.z, 1e-3), "보이는 커버는 틀 안");
});

test("카메라 '액션 중': 지금 z 그대로 공이 갈 곳 (땅 점 − LIFT · s) 으로, z 1 이면 전체", () => {
  const to = { x: 55, y: 62 };
  const p = V.project(to.x, to.y, CW, CH);
  for (const z of [1.4, 2, 1.2]) {
    const c = V.cameraTarget({ phase: "action", W: CW, H: CH, to, current: { cx: 100, cy: 100, z } });
    assert.equal(c.z, z, "지금 z");
    near(c.cx, p.sx, 1e-9, "공이 갈 곳 x");
    near(c.cy, p.sy - CAM.LIFT * p.s, 1e-9, "공이 갈 곳 y (몸 쪽으로 위)");
  }
  assert.deepEqual(V.cameraTarget({ phase: "action", W: CW, H: CH, to, current: { z: 1 } }), { cx: CW / 2, cy: CH / 2, z: 1 }, "z 1 = 전체");
});

test("범위 자르기 (clampCamera): 보이는 창이 월드 사각형 (투영된 판 + 배경 띠) 밖으로 나가지 않는다 · z 1 ~ 2 · 창 = 필드 영역으로 그대로 옮긴 것", () => {
  for (const [W, H] of SIZES) {
    const wr = V.worldRect(W, H);
    for (const z of [1.05, 1.2, 1.4, 1.7, 2, 3]) {
      for (const [cx, cy] of [[-500, -500], [W * 2, H * 2], [W / 2, -1000], [0, H], [W / 3, H / 3]]) {
        const c = V.clampCamera({ cx, cy, z }, W, H);
        assert.equal(c.z, Math.min(2, z), "z ≤ 2");
        const win = V.camWindow(c, W, H);
        assert.ok(insideWorld(win, wr), `${W}×${H} z ${z} (${cx}, ${cy}) 창 ${JSON.stringify(win)} ⊂ 월드`);
        // 화면 = (월드 − (cx, cy)) · z + (W/2, H/2): 창의 네 귀퉁이 → 필드 영역 네 귀퉁이
        const { tx, ty } = V.camTranslate(c, W, H);
        near(win.l * c.z + tx, 0, 1e-6, "창 왼쪽 → 0");
        near(win.r * c.z + tx, W, 1e-6, "창 오른쪽 → W");
        near(win.t * c.z + ty, 0, 1e-6, "창 위 → 0");
        near(win.b * c.z + ty, H, 1e-6, "창 아래 → H");
      }
      // 월드 안쪽 목표는 그대로
      const keep = V.clampCamera({ cx: W / 2, cy: H / 2, z }, W, H);
      near(keep.cx, W / 2, 1e-9, "안쪽 x 그대로");
      near(keep.cy, H / 2, 1e-9, "안쪽 y 그대로");
    }
    // 먼 쪽 모서리 공 (따라가기) 도 창 = 월드 안, 위쪽 띠까지 보인다
    const top = V.cameraTarget({ phase: "follow", W, H, ball: { x: 2, y: 99 } });
    const wt = V.camWindow(top, W, H);
    assert.ok(insideWorld(wt, wr), "모서리 따라가기도 월드 안");
    near(wt.r, wr.x1, 1e-6, "오른쪽 끝에 붙는다");
  }
});
