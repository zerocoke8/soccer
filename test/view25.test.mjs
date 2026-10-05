// test/view25.test.mjs — 2.5D 경기 화면 투영 (docs/SPRITE_25D_PLAN.md §3 · §6 — js/ui/view25.js, 순수 함수) + 모드 스위치 (js/ui/store.js isD25)
//   호모그래피 네 귀퉁이 · project ↔ unproject 왕복 · cssMatrix3d 를 파싱해 project 와 같은 점 · 먼 쪽 s < 가까운 쪽 · project3 높이 ·
//   세운 그림 크기 · 방향 · 호 높이 · 배경 띠 · 골대 · 주소로 켜고 끄기 (?d25=1 · ?flat=1 · /sprite/). 카메라 (cameraTarget) 는 D2.
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
