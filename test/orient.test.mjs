// test/orient.test.mjs — ARCHITECTURE §13.9 경기 화면 방향 고르기 (js/ui/store.js)
// 우선순위: 이번 세션 토글 > URL ?orient > 저장값 > 기본 규칙. 토글·저장값의 'land' 는 창이 담을 수 있을 때만 (landFits).
// 창 크기 · URL · localStorage 는 전역 스텁으로 흉내 낸다 (DOM 불필요).
import { test } from "node:test";
import assert from "node:assert/strict";
import { store, KEYS, LAND_MIN, normOrient, landFits, autoOrient, resolveOrient } from "../js/ui/store.js";

/** 창 w×h, URL 쿼리, 저장값, 토글을 세운 채 fn 실행 → 전역·store 원래대로 */
function withEnv({ w = 1280, h = 720, search = "", saved = null, toggle = null } = {}, fn) {
  const g = globalThis;
  const keep = { window: Object.getOwnPropertyDescriptor(g, "window"), localStorage: Object.getOwnPropertyDescriptor(g, "localStorage") };
  const mem = new Map(saved ? [[KEYS.orient, saved]] : []);
  Object.defineProperty(g, "window", { value: { innerWidth: w, innerHeight: h, location: { search } }, configurable: true, writable: true });
  Object.defineProperty(g, "localStorage", {
    value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
    configurable: true,
    writable: true,
  });
  store.matchUi.orient = toggle;
  try {
    return fn(mem);
  } finally {
    store.matchUi.orient = null;
    for (const [n, d] of Object.entries(keep)) {
      if (d) Object.defineProperty(g, n, d);
      else delete g[n];
    }
  }
}

test("normOrient: land/port 와 landscape/portrait 별칭, 따옴표·대소문자, 모르는 값 → null", () => {
  assert.equal(normOrient("land"), "land");
  assert.equal(normOrient("Landscape"), "land");
  assert.equal(normOrient(' "port" '), "port");
  assert.equal(normOrient("PORTRAIT"), "port");
  for (const v of [null, undefined, "", "sideways", 1]) assert.equal(normOrient(v), null, String(v));
});

test("landFits · autoOrient: 폭 ≥ 900 · 높이 ≥ 500 이면 가로가 들어가고, 기본 규칙은 거기에 가로가 더 길 때만 가로", () => {
  assert.deepEqual(LAND_MIN, { w: 900, h: 500 });
  const cases = [
    // [w, h, landFits, autoOrient]
    [1920, 1080, true, "land"],
    [1280, 720, true, "land"],
    [1024, 768, true, "land"],
    [900, 500, true, "land"],
    [899, 600, false, "port"], // 좁은 창
    [900, 499, false, "port"], // 낮은 창
    [932, 430, false, "port"], // 가로로 든 큰 폰 (iPhone Pro Max)
    [915, 412, false, "port"], // 가로로 든 Galaxy Ultra
    [844, 390, false, "port"],
    [390, 844, false, "port"], // 세로 폰
    [1000, 1200, true, "port"], // 세로로 긴 데스크톱 창: 들어가지만 기본은 세로 (토글로 가로 가능)
    [1000, 1000, true, "port"], // 정사각형은 세로
  ];
  for (const [w, h, fits, auto] of cases) {
    assert.equal(landFits(w, h), fits, `landFits ${w}×${h}`);
    assert.equal(autoOrient(w, h), auto, `autoOrient ${w}×${h}`);
  }
  // 인자를 안 주면 지금 창 (window.innerWidth/innerHeight)
  withEnv({ w: 1366, h: 768 }, () => { assert.equal(landFits(), true); assert.equal(autoOrient(), "land"); });
  withEnv({ w: 932, h: 430 }, () => { assert.equal(landFits(), false); assert.equal(autoOrient(), "port"); });
});

test("resolveOrient: 토글 > URL > 저장값 > 기본 규칙, 토글·저장값의 가로는 창이 담을 때만 (URL 은 강제)", () => {
  const R = (env) => withEnv(env, () => resolveOrient());
  // 기본 규칙
  assert.deepEqual(R({ w: 1280, h: 720 }), { orient: "land", source: "auto" });
  assert.deepEqual(R({ w: 390, h: 844 }), { orient: "port", source: "auto" });
  // 저장값 > 기본 규칙 (저장값은 글자 그대로, 따옴표가 붙어 있어도)
  assert.deepEqual(R({ w: 1280, h: 720, saved: "port" }), { orient: "port", source: "saved" });
  assert.deepEqual(R({ w: 1000, h: 1200, saved: '"land"' }), { orient: "land", source: "saved" });
  assert.deepEqual(R({ w: 1280, h: 720, saved: "garbage" }), { orient: "land", source: "auto" }, "모르는 저장값은 무시");
  // URL > 저장값 (landscape/portrait 별칭)
  assert.deepEqual(R({ w: 1280, h: 720, saved: "land", search: "?orient=portrait" }), { orient: "port", source: "url" });
  assert.deepEqual(R({ w: 1280, h: 720, saved: "port", search: "?auto=0&orient=land" }), { orient: "land", source: "url" });
  // 토글 > URL (?orient 로 연 화면에서도 버튼이 먹는다)
  assert.deepEqual(R({ w: 1280, h: 720, search: "?orient=land", toggle: "port" }), { orient: "port", source: "toggle" });
  assert.deepEqual(R({ w: 1280, h: 720, search: "?orient=port", saved: "port", toggle: "land" }), { orient: "land", source: "toggle" });
  // 창이 가로를 못 담으면 토글·저장값의 가로는 세로로 (폰에서 ⇄ 로 가로를 저장해도 빠져나올 수 없는 화면이 되지 않는다)
  assert.deepEqual(R({ w: 390, h: 844, saved: "land" }), { orient: "port", source: "saved" });
  assert.deepEqual(R({ w: 932, h: 430, toggle: "land" }), { orient: "port", source: "toggle" });
  assert.deepEqual(R({ w: 899, h: 700, saved: "land" }), { orient: "port", source: "saved" });
  // …창이 다시 커지면 저장값대로 가로
  assert.deepEqual(R({ w: 1280, h: 720, saved: "land" }), { orient: "land", source: "saved" });
  // URL 은 도구·확인용 강제: 창 크기와 무관
  assert.deepEqual(R({ w: 390, h: 844, search: "?orient=land" }), { orient: "land", source: "url" });
  // 스텁이 원래대로 돌아왔다
  assert.equal(store.matchUi.orient, null);
});
