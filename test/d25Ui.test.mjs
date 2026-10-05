// test/d25Ui.test.mjs — 2.5D 경기 화면 (docs/SPRITE_25D_PLAN.md §4 · §6 — D1, jsdom): 테스트용 store.setD25ForTest(true) 로 켜고
// tools/scenarios.mjs 의 장면 상태를 주입한다 (d25_2v1 — 실루엔 공 vs 아델린 · 나엘리스, d25_cross_aim — 크로스 결정).
//   판 div (.w-ground) 의 matrix3d = view25.cssMatrix3d · 카메라 층 구조 (차지 막 · 골 연출은 밖) · 스프라이트 셋 img 주소 (?v=) ·
//   나머지 스탠디 · .face-l (공 쪽을 보는 수비) · z-index = 화면 y 순 · 토큰이 필드 영역 안 · 치수 변수 = view25 크기 ·
//   패스 · 크로스 화살표 (크로스 = 위로 뜨는 곡선 + 바닥 그림자 길) · 평면 모드로 돌리면 2.5D 층이 없다.
// jsdom 이 없으면 건너뛴다. 평면 경기 화면 검사는 test/ui.smoke.test.mjs (고치지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const V = await import(pathToFileURL(path.join(ROOT, "js/ui/view25.js")).href);
const SPRITES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/sprites.json"), "utf8"));

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}
const W = 1244; // jsdom = 레이아웃 없음 → 경기 화면 기본 필드 영역 (screens/match.js)
const H = 528;
/** inline transform "translate(Xpx, Ypx)…" → [X, Y] */
const pos = (el) => {
  const m = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el?.style.transform || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
};

test("jsdom: 2.5D 경기 화면 — 판 · 카메라 층 · 세운 선수 (스프라이트 셋 + 스탠디) · 방향 · y 순 겹침 · 위로 뜨는 크로스", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, "navigator", { value: window.navigator, configurable: true, writable: true }); } catch { /* node 21+ 읽기 전용이면 무시 */ }
  g.confirm = () => true;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const realFetch = g.fetch;
  g.fetch = dataFetch(ROOT);
  t.after(() => {
    ST.setD25ForTest(null);
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  assert.equal(ST.isD25(), false, "테스트 기본 = 평면 (location 없이 읽은 store)");
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  const S = window.__soccer;
  assert.ok(S && S.store.data, "데이터 로드됨");
  assert.deepEqual(S.store.data.sprites, SPRITES, "스프라이트 목록 (선택 파일 data/sprites.json)");
  const ui = S.store.matchUi;

  const { loadData, buildScenarioState, SCENARIOS } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = loadData();
  const inject = (name) => {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    ui.auto = false;
    ui.speed = 4;
    ui.intervene = false;
    S.store.run = prep.runState;
    S.store.match = prep.matchState;
    S.store.screen = "run";
    S.render();
    return { scr: doc.querySelector(".match-screen"), view: S.match.getMatchView(S.store.match, S.store.data, "home") };
  };

  ST.setD25ForTest(true);
  // ---- 실루엔 공 vs 아델린 (듀얼 수비) · 나엘리스 (커버) — 스프라이트 셋이 한 장면에 ----
  {
    const { scr, view } = inject("d25_2v1");
    assert.ok(scr && scr.classList.contains("d25"), ".match-screen.d25");
    // 골격: 하늘은 잔디 맨 뒤, .pitch > .m-field 그대로, 카메라 층 안에 띠 · 판 · 골대 · 토큰 · 공 · 화살표 · 글자 층, 차지 막 · 골 연출은 밖
    const pitch = scr.querySelector(":scope > .pitch");
    assert.deepEqual([...pitch.children].map((el) => el.className), ["w-sky", "m-field"]);
    const field = pitch.querySelector(":scope > .m-field");
    assert.deepEqual([...field.children].map((el) => el.classList[0]), ["charge-veil", "w-cam", "goal-fx"]);
    const cam = field.querySelector(":scope > .w-cam");
    assert.deepEqual([...cam.children].map((el) => el.getAttribute("class")),
      ["w-strip", "w-ground", "w-goals", "tok-layer", "m-ball", "pitch-svg", "pitch-svg top", "pop-layer"]);
    assert.equal(cam.style.transform, "translate(0px, 0px) scale(1)", "D1: 카메라 없이 전체 (z = 1)");
    // 판 div: matrix3d = view25.cssMatrix3d, 크기 = 판, 잔디 그림, 안에 필드 사각형 (.pitch-bg — 구역 · 선 % 그대로)
    const ground = cam.querySelector(":scope > .w-ground");
    assert.match(ground.style.transform, /^matrix3d\(/, "판 div = matrix3d");
    assert.equal(ground.style.transform, V.cssMatrix3d(W, H));
    const { PL, PD } = V.planeSize();
    assert.deepEqual([ground.style.width, ground.style.height], [`${PL}px`, `${PD}px`]);
    assert.match(ground.style.backgroundImage, /img\/sprites\/grass_top\.webp/);
    const bg = ground.querySelector(":scope > .pitch-bg");
    assert.deepEqual([bg.style.left, bg.style.top, bg.style.width, bg.style.height], [`${V.V25.RU}px`, `${V.V25.RV}px`, `${V.V25.FL}px`, `${V.V25.FD}px`]);
    assert.equal(bg.querySelectorAll(".zone").length, 5, "구역 5 (판 안)");
    assert.equal(bg.querySelector(".zone.z5").style.width, "16%", "구역 % 그대로");
    assert.match(cam.querySelector(".w-strip").style.backgroundImage, /img\/sprites\/far_strip\.webp/);
    assert.equal(cam.querySelectorAll(".w-goals .goal").length, 2, "서 있는 골대 둘");
    assert.equal(cam.querySelectorAll(".w-goals .goal polyline.frame").length, 2);

    // 스프라이트 셋 (data/sprites.json) = img (주소 ?v=), 나머지 = 얼굴 원 스탠디
    const toks = [...scr.querySelectorAll(".tok:not(.gone)")];
    assert.equal(toks.length, 14);
    const charOf = (el) => S.store.match[el.dataset.side].players.find((p) => p.id === el.dataset.id)?.charId;
    const sprited = toks.filter((el) => SPRITES.chars[charOf(el)]);
    assert.deepEqual(sprited.map(charOf).sort(), ["ch_elf_playmaker", "ch_elf_regista", "ch_human_captain"], "스프라이트 셋");
    for (const el of sprited) {
      const id = charOf(el);
      const img = el.querySelector(".tok-figure.spr > img.spr-img");
      assert.ok(img, `${id} 스프라이트 img`);
      assert.equal(img.getAttribute("src"), `./img/sprites/${id}.webp?v=${SPRITES.chars[id].v}`);
      assert.equal(img.getAttribute("draggable"), "false");
      assert.equal(el.querySelector(".tok-face"), null, "스프라이트 선수는 얼굴 원 없음");
      const e = SPRITES.chars[id];
      const fw = Math.round(72 * (e.w / e.h) * 10) / 10;
      assert.equal(img.style.height, "72px", "s = 1 키 72 (크기는 .tok-figure scale)");
      assert.equal(img.style.left, `${Math.round(-e.footX * fw * 10) / 10}px`, "발 가운데 = 앵커 (footX)");
    }
    for (const el of toks.filter((x) => !sprited.includes(x))) {
      assert.ok(el.querySelector(".tok-figure.standee > .tok-face"), `스탠디 ${el.dataset.side}:${el.dataset.id}`);
      assert.equal(el.querySelector(".spr-img"), null);
    }
    for (const el of toks) assert.ok(el.querySelector(":scope > .tok-ground"), "발밑 타원");

    // 방향: 공 가진 실루엔 = 공격 방향 (오른쪽), 듀얼 수비 아델린 = 공 쪽 (왼쪽 — .face-l)
    const silluen = scr.querySelector(`.tok[data-side="home"][data-id="${view.carrier.id}"]`);
    const adeline = scr.querySelector(`.tok[data-side="away"][data-id="${view.defender.id}"]`);
    assert.equal(charOf(silluen), "ch_elf_playmaker");
    assert.equal(charOf(adeline), "ch_human_captain");
    assert.equal(silluen.dataset.role, "carrier");
    assert.ok(!silluen.classList.contains("face-l"), "공 가진 선수 = 공격 방향 (오른쪽)");
    assert.ok(pos(adeline)[0] > pos(silluen)[0], "수비는 공 오른쪽");
    assert.ok(adeline.classList.contains("face-l"), "수비 = 공 쪽 (왼쪽)");
    const ballX = pos(scr.querySelector(".m-ball"))[0];
    for (const el of toks) {
      if (el === silluen) continue;
      const [x] = pos(el);
      if (Math.abs(x - ballX) > 4) assert.equal(el.classList.contains("face-l"), ballX < x, `${el.dataset.id} 공 쪽을 본다`);
    }

    // 자리: 발 = 투영 (필드 영역 안), 겹침 = 화면 y 순 (z-index 100 + sy), 치수 변수 = view25 크기
    const rows = toks.map((el) => ({ el, p: pos(el), z: Number(el.style.zIndex) }));
    for (const r of rows) {
      const want = V.project(Number(r.el.dataset.x), Number(r.el.dataset.y), W, H);
      assert.ok(Math.abs(r.p[0] - want.sx) <= 0.06 && Math.abs(r.p[1] - want.sy) <= 0.06, `발 = 투영 ${r.p} ≈ ${want.sx},${want.sy}`);
      assert.ok(r.p[0] >= 0 && r.p[0] <= W && r.p[1] >= 0 && r.p[1] <= H, `필드 영역 안 ${r.p}`);
      assert.equal(r.z, 100 + Math.round(r.p[1]), "z-index = 100 + 화면 y");
      const s = Number(r.el.style.getPropertyValue("--ts"));
      assert.ok(Math.abs(s - want.s) < 0.001, `--ts ${s} = s ${want.s}`);
      const f = V.figureSize(s, SPRITES.chars[charOf(r.el)] || null);
      assert.equal(r.el.style.getPropertyValue("--fh"), `${Math.round(f.fh * 10) / 10}px`, "--fh = 키");
      assert.equal(r.el.style.getPropertyValue("--fhw"), `${Math.round(f.hw * 10) / 10}px`, "--fhw = 반폭");
      for (const k of ["--ga", "--by", "--ny"]) assert.ok(r.el.style.getPropertyValue(k), k);
    }
    const byY = [...rows].sort((a, b) => a.p[1] - b.p[1]);
    for (let i = 1; i < byY.length; i++) assert.ok(byY[i].z >= byY[i - 1].z, "아래 (가까운) 선수가 앞");
    assert.ok(byY.at(-1).z > byY[0].z);
    // 공: 땅 점 + 깊이 배율 (scale), 실루엔 발 앞 (오른쪽)
    const ball = scr.querySelector(".m-ball");
    assert.match(ball.style.transform, /scale\([\d.]+\)/, "공 크기 = 깊이 배율");
    assert.ok(ball.querySelector(":scope > .b-shadow"), "공 그림자");
    assert.ok(pos(ball)[0] > pos(silluen)[0], "공은 공격 방향 (오른쪽) 발 앞");
    // 이름표: 듀얼 둘은 이름 (자리 클래스는 평면과 같은 lbl-* / 없음)
    assert.ok(silluen.classList.contains("named") && adeline.classList.contains("named"));
    // 패스 미리보기 = 바닥 위 점선 (패스 받는 선수까지)
    const pb = scr.querySelector('button[data-action="pass"]');
    assert.ok(pb && !pb.disabled, "패스 카드");
    pb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(scr.querySelector(".g-arrow line.ar-pass"), "패스 화살표");
    pb.dispatchEvent(new window.Event("pointerleave"));
    assert.equal(scr.querySelectorAll(".g-arrow > *").length, 0, "떼면 지운다");
    S.actions.resetToStart();
  }

  // ---- 크로스 결정 (08 과 같은 장면): 크로스 화살표 = 위로 뜨는 곡선 + 바닥 그림자 길 ----
  {
    const { scr } = inject("d25_cross_aim");
    assert.ok(scr.classList.contains("d25"));
    const cb = scr.querySelector('button[data-action="cross"]');
    cb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    const path0 = scr.querySelector(".g-arrow path.ar-cross");
    assert.ok(path0, "크로스 = 곡선 화살표");
    const m = /^M([-\d.]+),([-\d.]+) Q([-\d.]+),([-\d.]+) ([-\d.]+),([-\d.]+)$/.exec(path0.getAttribute("d"));
    assert.ok(m, `곡선 경로 ${path0.getAttribute("d")}`);
    const [x0, y0, cx, cy, x1, y1] = m.slice(1).map(Number);
    assert.ok(cy < Math.min(y0, y1) - 20, `제어점이 위로 (y ${cy} < ${Math.min(y0, y1)})`);
    assert.ok(cx > Math.min(x0, x1) && cx < Math.max(x0, x1), "제어점 x = 양 끝 사이 (옆으로 휘지 않는다)");
    const gl = scr.querySelector(".g-arrow line.ar-ground");
    assert.ok(gl, "바닥 그림자 길");
    cb.dispatchEvent(new window.Event("pointerleave"));
    S.actions.resetToStart();
  }

  // ---- 평면 모드로 돌리면 2.5D 층이 없다 (같은 장면) ----
  ST.setD25ForTest(false);
  {
    const { scr } = inject("d25_2v1");
    assert.ok(!scr.classList.contains("d25"));
    assert.equal(scr.querySelector(".w-cam, .w-ground, .w-sky, .tok-figure, .tok-ground, .b-shadow"), null, "평면: 2.5D 요소 없음");
    assert.deepEqual([...scr.querySelector(".m-field").children].map((el) => el.classList[0]),
      ["pitch-bg", "charge-veil", "tok-layer", "m-ball", "pitch-svg", "pitch-svg", "pop-layer", "goal-fx"], "평면 골격 그대로");
    for (const el of scr.querySelectorAll(".tok")) assert.equal(el.style.zIndex, "", "평면: z-index 는 역할 순 (CSS)");
    S.actions.resetToStart();
  }
});
