// js/ui/hexPixi.js — 육각 경기 화면의 Pixi 층 (HEX_AUTOBATTLE_PLAN §5.1 · §5.2 · §5.4 · §6.1, H1 SPEC §4) — 얇은 그리기 층
//
// 하는 일: hexScene.frameAt 이 만든 그릴 목록 (frame) 과 카메라 { cx, cy, z } 를 받아 WebGL 캔버스에 그린다. 투영 계산은 하지 않는다
//   (자리 · 크기는 모두 frame 안 — 필드 화면 px, 예전 .m-field 좌표). 글자는 그리지 않는다 (한글이 흐려진다 — 이름 · HUD 는 HTML).
// Pixi (vendor/pixi.min.mjs, PixiJS 8.22.0 MIT) 는 createHexView 가 처음 불릴 때만 동적 import — app.js 에서 정적으로 닿지 않는다.
//   WebGLRenderingContext 가 없으면 (jsdom 등) Pixi 를 읽지도 않고 null (getContext 를 부르지 않는다 — "Not implemented" 소음 없음).
//
// 장면 (아래 → 위):
//   stage
//   ├ sky            하늘 그라데이션 (.pitch 좌표, 카메라 밖 — 이동의 V.CAM.SKY 만큼만 따라온다)
//   └ fieldRoot      필드 영역 왼쪽 위 (.hx-pitch 안 --fx, --ft) 로 옮긴 층
//     └ world        카메라: translate(tx, ty) scale(z) (V.camTranslate)
//       ├ strip      먼 배경 띠 (far_strip.webp, V.stripRect)
//       ├ runoff     바깥 잔디 PerspectiveMesh (판보다 넓게 — 잔디 바둑판 + 어두운 덮개, 반 해상도로 구움)
//       ├ field      필드 사각형 PerspectiveMesh — 잔디 + 터치라인 · 하프라인 · 센터서클 · 육각 189칸 선 · 골 박스 칸을 한 번 구운 캔버스 텍스처
//       ├ goalsBack  골대 뒤 층 (뒤 그물 · 먼 옆 · 먼 기둥 — V.goalShapes layers.back)
//       ├ shadows    공 그림자
//       └ actors     sortableChildren — 선수 (zIndex = 발 sy) · 골대 앞 층 (zIndex = frontSy) · 공 (맨 위, 골망 안이면 그림자 sy)
//
// [구현 결정] (H1):
//  - 루프는 화면 (screens/hexMatch.js) 의 requestAnimationFrame 하나 — Application 은 autoStart: false 로 만들고 draw() 가 app.render() 를 부른다
//    (Pixi ticker 와 화면 루프가 따로 돌며 한 프레임 늦게 그리는 일이 없게. 둘 다 rAF 라 배경 탭에서 함께 멈춘다).
//  - 잔디 텍스처는 판 px 의 1.5 배 (1866 × 1470) 로 굽는다 — 1.4 배 확대 · 해상도 2 에서도 육각 선이 뭉개지지 않는 선, 휴대폰 메모리 ~11 MB.
//  - 얼굴 = 색 원 (portraitColor) + 테두리 2px (홈 #4da3ff · 원정 #ff5d5d). 초상이 있으면 작은 2D 캔버스에 원으로 잘라 구운 텍스처를 얹는다
//    (마스크 14개 대신 — 그리기 비용 0). 글자 (첫 글자) 는 넣지 않는다. 초상이 없으면 (상대 — charId 없음) 색 원에 머리 · 어깨 실루엣 + 광택
//    (bakeBlankFace — 색마다 텍스처 하나): 단색 원이면 몸통과 한 덩어리로 보여 얼굴 자리로 읽히지 않는다.
//  - 넘어진 선수 = 그림 묶음을 발 기준으로 공격 반대쪽으로 82° 눕히고 조금 투명하게. 공 가진 선수 = 발밑 고리를 금색 (#ffd166) 두꺼운 고리로.
//  - 공은 필드 위에서는 늘 맨 위 (예전 .m-ball z 1500 — 서 있는 선수 뒤로 숨지 않게), 골라인 너머 (골망 안) 만 깊이 정렬 (골대 앞 그물 뒤).
//    그림자는 선수 아래 따로 한 층.
//  - 만드는 도중 (app.init 뒤) 실패하면 (2D 캔버스를 못 얻음 — iOS 캔버스 메모리 한도 등) 앱 · WebGL 문맥 · 캔버스 · 구운 텍스처를 지우고
//    null (대체 화면) — 마운트마다 문맥 · 전역 리스너 · ticker 가 새지 않게. 얼굴 텍스처만 못 구우면 색 원으로 계속 그린다.

import * as V from './view25.js';
import { FIELD_RECT, quadScreen, gridCells } from './hexScene.js';
import { portraitUrl } from './art.js';

const PIXI_URL = '../../vendor/pixi.min.mjs';
const GRASS_URL = './img/sprites/grass_top.webp';
const STRIP_URL = './img/sprites/far_strip.webp';

/** 잔디 텍스처 배율 (판 px → 텍스처 px) */
const BAKE = 1.5;
/** 메쉬 격자 (원근 보간 정밀도 — SPEC §4 ≥ 24) */
const MESH_N = 24;
/** 바깥 잔디 (런오프 + 그 너머 — 확대한 카메라가 판 밖 빈 곳을 보지 않게 판보다 넓게): 판 px 사각형 · 굽는 배율 */
const APRON = Object.freeze({ u0: -900, v0: 0, u1: V.planeSize().PL + 900, v1: V.planeSize().PD + 200 });
const APRON_BAKE = 0.5;
/** 팀 색 */
const TEAM = {
  home: { ring: 0x4da3ff, body: 0x4da3ff, dark: 0x1f4f86 },
  away: { ring: 0xff5d5d, body: 0xff5d5d, dark: 0x8c2626 },
};
const GOLD = 0xffd166;

let factoryForTest = null;
let pixiForTest = null;

/**
 * 테스트 이음매: fn(host, opts) 이 view 를 돌려주게 한다 (null = 원래대로). jsdom 시험이 가짜 view 로 draw 호출을 센다.
 * @param {((host: HTMLElement, opts: object) => any) | null} fn
 */
export function setHexViewFactoryForTest(fn) {
  factoryForTest = typeof fn === 'function' ? fn : null;
}

/**
 * 테스트 이음매: vendor Pixi 대신 쓸 모듈 (null = 원래대로 동적 import). 만드는 도중 실패했을 때 정리하는지 시험한다.
 * @param {object|null} mod
 */
export function setPixiModuleForTest(mod) {
  pixiForTest = mod && typeof mod === 'object' ? mod : null;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** 렌더 해상도 = clamp(devicePixelRatio × 스테이지 배율 (--stage-scale), 1, 2) — 문서 §5.4 */
export function hexResolution() {
  let scale = 1;
  try {
    const v = parseFloat(globalThis.document?.documentElement?.style?.getPropertyValue('--stage-scale'));
    if (Number.isFinite(v) && v > 0) scale = v;
  } catch (_) { /* 스테이지 없음 */ }
  const dpr = Number(globalThis.devicePixelRatio) || 1;
  return clamp(dpr * scale, 1, 2);
}

function loadImg(url) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    } catch (_) {
      resolve(null);
    }
  });
}

/** 캔버스 2D (구울 때만 — WebGL 이 되는 브라우저에서만 불린다). 2D 문맥을 못 얻으면 (iOS 캔버스 메모리 한도 등) 분명한 오류를 던진다 */
function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const g = c.getContext('2d');
  if (!g) {
    c.width = 0; // 받은 메모리를 바로 돌려준다
    c.height = 0;
    throw new Error(`2D 캔버스를 만들 수 없습니다 (${Math.round(w)}×${Math.round(h)} — 캔버스 메모리 한도?)`);
  }
  return { c, g };
}

/** 필드 텍스처 굽기: 잔디 + 분필 선 + 육각 189칸 (판 px × BAKE) */
function bakeField(grassImg) {
  const { FL, FD, RU, RV } = V.V25;
  const { c, g } = canvas2d(FL * BAKE, FD * BAKE);
  g.scale(BAKE, BAKE);
  if (grassImg) g.drawImage(grassImg, 0, 0, FL, FD);
  else { g.fillStyle = '#5ba24a'; g.fillRect(0, 0, FL, FD); }
  // 골 박스 칸 (살짝 밝게) · 육각 선
  const cells = gridCells();
  const path = (cell) => {
    g.beginPath();
    cell.corners.forEach((p, i) => (i ? g.lineTo(p.u - RU, p.v - RV) : g.moveTo(p.u - RU, p.v - RV)));
    g.closePath();
  };
  g.fillStyle = 'rgba(255, 255, 255, .07)';
  for (const cell of cells) if (cell.box) { path(cell); g.fill(); }
  g.strokeStyle = 'rgba(255, 255, 255, .22)';
  g.lineWidth = 2;
  g.lineJoin = 'round';
  for (const cell of cells) { path(cell); g.stroke(); }
  // 박스 바깥 테두리 (박스 칸 중 박스 밖 칸과 닿은 변) 는 생략 — 칸 색으로 충분
  // 하프라인 · 센터서클 · 센터 점 · 터치라인
  g.strokeStyle = 'rgba(255, 255, 255, .8)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(FL / 2, 0);
  g.lineTo(FL / 2, FD);
  g.stroke();
  g.beginPath();
  g.arc(FL / 2, FD / 2, (0.26 * FD) / 2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255, 255, 255, .9)';
  g.beginPath();
  g.arc(FL / 2, FD / 2, 5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255, 255, 255, .85)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, FL - 4, FD - 4);
  return c;
}

/** 바깥 잔디 텍스처: 잔디 그림을 필드와 같은 판 px 크기로 바둑판 (필드 자리에 맞춰) + 예전 런오프 덮개 rgba(16, 48, 22, .24) */
function bakeApron(grassImg) {
  const { FL, FD, RU, RV } = V.V25;
  const w = APRON.u1 - APRON.u0;
  const hh = APRON.v1 - APRON.v0;
  const { c, g } = canvas2d(w * APRON_BAKE, hh * APRON_BAKE);
  g.scale(APRON_BAKE, APRON_BAKE);
  g.fillStyle = '#5ba24a';
  g.fillRect(0, 0, w, hh);
  if (grassImg) {
    const x0 = RU - APRON.u0;
    const y0 = RV - APRON.v0;
    for (let i = Math.floor(-x0 / FL); x0 + i * FL < w; i++) {
      for (let j = Math.floor(-y0 / FD); y0 + j * FD < hh; j++) g.drawImage(grassImg, x0 + i * FL, y0 + j * FD, FL, FD);
    }
  }
  g.fillStyle = 'rgba(16, 48, 22, .24)';
  g.fillRect(0, 0, w, hh);
  return c;
}

/** 하늘 그라데이션 (예전 .w-sky: #4f8fc6 0% → #5d9dd0 62% → #7ab3d3 100%) */
function bakeSky() {
  const { c, g } = canvas2d(4, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#4f8fc6');
  gr.addColorStop(0.62, '#5d9dd0');
  gr.addColorStop(1, '#7ab3d3');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  return c;
}

/** 초상 → 원으로 자른 얼굴 (object-fit cover · object-position 50% 40% — base.css .pt 와 같게) */
function bakeFace(img, color) {
  const N = 128;
  const { c, g } = canvas2d(N, N);
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
  g.closePath();
  g.clip();
  g.fillStyle = color || '#4b5563';
  g.fillRect(0, 0, N, N);
  const k = Math.max(N / img.width, N / img.height);
  const w = img.width * k;
  const h = img.height * k;
  g.drawImage(img, (N - w) * 0.5, (N - h) * 0.4, w, h);
  return c;
}

/**
 * 초상이 없는 얼굴 (상대 선수 등 — charId 없음): portraitColor 원 + 어두운 머리 · 어깨 실루엣 + 위쪽 광택.
 * 글자 없이도 "사람 얼굴 자리" 로 읽히게 (단색 원만 있으면 몸통과 한 덩어리 막대 사탕처럼 보인다).
 */
function bakeBlankFace(color) {
  const N = 96;
  const { c, g } = canvas2d(N, N);
  g.beginPath();
  g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
  g.closePath();
  g.clip();
  g.fillStyle = color || '#4b5563';
  g.fillRect(0, 0, N, N);
  g.fillStyle = 'rgba(0, 0, 0, .3)';
  g.beginPath();
  g.arc(N / 2, N * 0.43, N * 0.19, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(N / 2, N * 1.04, N * 0.36, N * 0.34, 0, 0, Math.PI * 2);
  g.fill();
  const gl = g.createRadialGradient(N * 0.36, N * 0.26, 0, N * 0.36, N * 0.26, N * 0.55);
  gl.addColorStop(0, 'rgba(255, 255, 255, .32)');
  gl.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = gl;
  g.fillRect(0, 0, N, N);
  return c;
}

const hexColor = (css, fallback = 0x4b5563) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(css || '').trim());
  if (m) return parseInt(m[1], 16);
  const s = /^#?([0-9a-f]{3})$/i.exec(String(css || '').trim());
  if (s) return parseInt(s[1].split('').map((ch) => ch + ch).join(''), 16);
  return fallback;
};

/**
 * 육각 경기장 view 를 만든다 (WebGL 이 안 되면 null — 화면은 HTML 대체 화면으로 경기를 그대로 진행한다).
 * @param {HTMLElement} host 캔버스를 붙일 요소 (.hx-pitch 안 .hx-canvas — 캔버스 크기 = width × height)
 * @param {{ W: number, H: number, width: number, height: number, origin: { x: number, y: number }, data: object,
 *   resolution?: number, onContextLost?: () => void }} opts
 *   W × H = 필드 영역 (frame 좌표), width × height = 캔버스 (= .hx-pitch), origin = 캔버스 안 필드 영역 왼쪽 위
 * @returns {Promise<null | { renderer: 'webgl', canvas: HTMLCanvasElement, draw: (frame: object, cam: {cx: number, cy: number, z: number}) => void, destroy: () => void }>}
 */
export async function createHexView(host, opts = {}) {
  if (factoryForTest) return factoryForTest(host, opts);
  if (!globalThis.WebGLRenderingContext) return null;
  let PIXI = pixiForTest;
  try {
    if (!PIXI) PIXI = await import(PIXI_URL);
  } catch (e) {
    console.warn('Pixi 를 불러오지 못했습니다', e);
    return null;
  }
  try {
    if (typeof PIXI.isWebGLSupported === 'function' && !PIXI.isWebGLSupported()) return null;
  } catch (_) {
    return null;
  }
  const W = Number(opts.W) || 1244;
  const H = Number(opts.H) || 528;
  const width = Number(opts.width) || W;
  const height = Number(opts.height) || H;
  const origin = opts.origin || { x: 0, y: 0 };
  const resolution = clamp(Number(opts.resolution) || hexResolution(), 1, 2);
  const app = new PIXI.Application();
  try {
    await app.init({
      preference: 'webgl', backgroundAlpha: 0, antialias: true, resolution, autoDensity: true, width, height,
      autoStart: false, sharedTicker: false,
    });
  } catch (e) {
    console.warn('Pixi 초기화 실패', e);
    try { app.destroy(true); } catch (_) { /* 반쯤 만든 앱 */ }
    return null;
  }
  try {
    // buildView 는 실패하면 스스로 정리하고 (앱 · WebGL 문맥 · 캔버스 · 텍스처) 오류를 다시 던진다 → 여기서는 대체 화면 (null)
    return await buildView(PIXI, app, host, { W, H, width, height, origin, data: opts.data, onContextLost: opts.onContextLost, resolution });
  } catch (e) {
    console.warn('육각 경기장 view 를 만들지 못했습니다 (정리함)', e);
    return null;
  }
}

async function buildView(PIXI, app, host, { W, H, width, origin, data, onContextLost, resolution }) {
  const { Container, Sprite, Graphics, Texture, PerspectiveMesh, CanvasSource, ImageSource } = PIXI;
  const owned = []; // 내가 만든 텍스처 (destroy 때 소스까지 지운다 — Pixi 전역 캐시를 거치지 않게 소스를 직접 만든다)
  const own = (resource) => {
    const source = resource instanceof HTMLCanvasElement ? new CanvasSource({ resource }) : new ImageSource({ resource });
    const t = new Texture({ source });
    owned.push(t);
    return t;
  };
  let dead = false;
  let dirty = true; // 그림이 늦게 도착 (얼굴) → 화면이 다음 프레임에 다시 그린다
  const nodes = new Map(); // 선수 key → 노드
  const blankFaces = new Map(); // portraitColor → 초상 없는 얼굴 텍스처 (같은 색끼리 나눠 쓴다)

  const canvas = app.canvas;
  const onLost = (e) => {
    e.preventDefault();
    if (!dead && typeof onContextLost === 'function') onContextLost();
  };

  /** 정리 (여러 번 불러도 한 번): 리스너 · 앱 (WebGL 문맥 · Pixi 이벤트 리스너 · ticker) · 내가 만든 텍스처 · 캔버스. 만드는 도중 실패해도 같은 길 */
  function destroy() {
    if (dead) return;
    dead = true;
    try { canvas.removeEventListener('webglcontextlost', onLost); } catch (_) { /* 이미 떨어짐 */ }
    try { app.destroy(true, { children: true, texture: false }); } catch (e) { console.warn('Pixi 정리 실패', e); }
    for (const t of owned) {
      try { t.destroy(true); } catch (_) { /* 이미 지움 */ }
    }
    owned.length = 0;
    nodes.clear();
    blankFaces.clear();
    try { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } catch (_) { /* 없음 */ }
  }

  try {
    canvas.classList.add('hx-gl');
    canvas.addEventListener('webglcontextlost', onLost);
    host.appendChild(canvas);

    const [grassImg, stripImg] = await Promise.all([loadImg(GRASS_URL), loadImg(STRIP_URL)]);

    // 하늘 (.pitch 좌표: 위로 넉넉히 — 예전 top −180, 높이 --ft + 180, 좌우는 시차만큼 더)
    const sky = new Sprite(own(bakeSky()));
    const skyTop = -180;
    const skyBox = { x: -240, y: skyTop, w: width + 480, h: origin.y - skyTop };
    sky.x = skyBox.x;
    sky.y = skyBox.y;
    sky.width = skyBox.w;
    sky.height = skyBox.h;
    const skyLayer = new Container();
    skyLayer.addChild(sky);
    app.stage.addChild(skyLayer);

    const fieldRoot = new Container();
    fieldRoot.position.set(origin.x, origin.y);
    app.stage.addChild(fieldRoot);
    const world = new Container();
    fieldRoot.addChild(world);

    // 먼 배경 띠
    if (stripImg) {
      const st = V.stripRect(W, H);
      const strip = new Sprite(own(stripImg));
      strip.position.set(st.x, st.y);
      strip.width = st.w;
      strip.height = st.h;
      world.addChild(strip);
    }

    // 런오프 (판 전체) · 필드
    const quadOpts = (rect) => {
      const q = quadScreen(rect, W, H);
      return { x0: q[0].x, y0: q[0].y, x1: q[1].x, y1: q[1].y, x2: q[2].x, y2: q[2].y, x3: q[3].x, y3: q[3].y };
    };
    const runoff = new PerspectiveMesh({ texture: own(bakeApron(grassImg)), verticesX: MESH_N, verticesY: MESH_N, ...quadOpts(APRON) });
    world.addChild(runoff);
    const fieldTex = own(bakeField(grassImg));
    const field = new PerspectiveMesh({ texture: fieldTex, verticesX: MESH_N, verticesY: MESH_N, ...quadOpts(FIELD_RECT) });
    world.addChild(field);

    // 골대
    const goalsBack = new Graphics();
    world.addChild(goalsBack);
    const shadows = new Container();
    world.addChild(shadows);
    const actors = new Container();
    actors.sortableChildren = true;
    world.addChild(actors);
    const drawGoalLayer = (g, part) => {
      for (const poly of part.nets) g.poly(poly.flat(), true).fill({ color: 0xffffff, alpha: 0.13 }).stroke({ width: 1, color: 0xffffff, alpha: 0.55 });
      for (const [a, b] of part.grid) g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
      if (part.grid.length) g.stroke({ width: 0.8, color: 0xffffff, alpha: 0.32 });
      g.poly(part.frame.flat(), false).stroke({ width: 6.5, color: 0x000000, alpha: 0.35, join: 'round', cap: 'round' });
      g.poly(part.frame.flat(), false).stroke({ width: 4, color: 0xffffff, alpha: 1, join: 'round', cap: 'round' });
    };
    for (const end of ['home', 'away']) {
      const gs = V.goalShapes(end, W, H);
      drawGoalLayer(goalsBack, gs.layers.back);
      const front = new Graphics();
      drawGoalLayer(front, gs.layers.front);
      front.zIndex = gs.layers.frontSy;
      actors.addChild(front);
    }

    // 공 (그림자 = shadows 층, 공 = actors 층)
    const ballShadow = new Graphics().ellipse(0, 0, 9, 3.5).fill({ color: 0x000000, alpha: 0.6 });
    shadows.addChild(ballShadow);
    const ball = new Graphics()
      .circle(0, 0, 7).fill({ color: 0xffffff }).stroke({ width: 1, color: 0x1b1f27, alpha: 0.75 })
      .circle(0, 0, 2.3).fill({ color: 0x1b1f27 })
      .circle(-4.3, -3.2, 1.6).fill({ color: 0x1b1f27 })
      .circle(4.4, -2.6, 1.6).fill({ color: 0x1b1f27 })
      .circle(-1.2, 5, 1.6).fill({ color: 0x1b1f27 });
    actors.addChild(ball);

    // 선수 (key → 노드, 처음 나올 때 만든다)
    const faceLoads = new Set();
    const blankFace = (color) => {
      const k = String(color || '');
      if (!blankFaces.has(k)) blankFaces.set(k, own(bakeBlankFace(color)));
      return blankFaces.get(k);
    };
    function makePlayer(p) {
      const team = TEAM[p.side] || TEAM.home;
      const node = new Container();
      const ground = new Container();
      const shade = new Graphics()
        .circle(0, 0, 19).fill({ color: 0x000000, alpha: 0.16 })
        .circle(0, 0, 14).fill({ color: 0x000000, alpha: 0.16 })
        .circle(0, 0, 9).fill({ color: 0x000000, alpha: 0.16 });
      const ring = new Graphics().circle(0, 0, 18).stroke({ width: 2, color: team.ring, alpha: 0.9 });
      const gold = new Graphics().circle(0, 0, 19).stroke({ width: 3.5, color: GOLD, alpha: 1 });
      gold.visible = false;
      ground.addChild(shade, ring, gold);
      const figure = new Container();
      const body = new Graphics()
        .roundRect(-14, -26, 28, 26, 8).fill({ color: team.body })
        .roundRect(-14, -13, 28, 13, 6).fill({ color: team.dark, alpha: 0.85 })
        .roundRect(-14, -26, 28, 26, 8).stroke({ width: 1, color: 0x000000, alpha: 0.35 });
      const faceBack = new Graphics()
        .circle(0, -36, 21).fill({ color: 0x000000, alpha: 0.28 })
        .circle(0, -38, 20).fill({ color: hexColor(p.color) });
      const faceRing = new Graphics().circle(0, -38, 20).stroke({ width: 2, color: team.ring, alpha: 1 });
      figure.addChild(body, faceBack);
      let blankTex = null;
      try { blankTex = blankFace(p.color); } catch (e) { console.warn('얼굴 텍스처를 굽지 못했습니다', e); } // 메모리 부족: 색 원만
      if (blankTex) {
        const blank = new Sprite(blankTex);
        blank.position.set(-20, -58);
        blank.width = 40;
        blank.height = 40;
        figure.addChild(blank);
      }
      figure.addChild(faceRing);
      node.addChild(ground, figure);
      actors.addChild(node);
      const n = { node, ground, figure, faceRing, gold, ring, side: p.side, resting: null, carrier: null };
      nodes.set(p.key, n);
      loadFace(n, p);
      return n;
    }
    function loadFace(n, p) {
      const url = p.charId ? portraitUrl(data, p.charId, 'face') : null;
      if (!url || faceLoads.has(p.key)) return;
      faceLoads.add(p.key);
      loadImg(url).then((img) => {
        if (dead || !img) return;
        try {
          const tex = own(bakeFace(img, p.color));
          const face = new Sprite(tex);
          face.position.set(-20, -58);
          face.width = 40;
          face.height = 40;
          n.figure.addChildAt(face, n.figure.getChildIndex(n.faceRing));
          dirty = true;
        } catch (e) {
          console.warn('초상 얼굴을 굽지 못했습니다', e); // 메모리 부족: 초상 없는 얼굴 그대로
        }
      });
    }

    function draw(frame, cam) {
      if (dead || !frame) return;
      dirty = false;
      const c = cam || { cx: W / 2, cy: H / 2, z: 1 };
      const { tx, ty } = V.camTranslate(c, W, H);
      world.position.set(tx, ty);
      world.scale.set(c.z);
      skyLayer.position.set(tx * V.CAM.SKY, ty * V.CAM.SKY);
      const seen = new Set();
      for (const p of frame.players) {
        const n = nodes.get(p.key) || makePlayer(p);
        seen.add(p.key);
        n.node.visible = true;
        n.node.position.set(p.sx, p.sy);
        n.node.zIndex = p.z;
        n.ground.scale.set(p.s, p.s * p.ga);
        n.figure.scale.set(p.s);
        if (n.carrier !== p.carrier) {
          n.carrier = p.carrier;
          n.gold.visible = !!p.carrier;
          n.ring.visible = !p.carrier;
        }
        if (n.resting !== p.resting) {
          n.resting = p.resting;
          // 넘어짐: 발 기준으로 공격 반대쪽으로 눕힌다 (홈은 왼쪽, 원정은 오른쪽)
          n.figure.rotation = p.resting ? (p.side === 'away' ? 1 : -1) * 1.43 : 0;
          n.figure.alpha = p.resting ? 0.85 : 1;
        }
      }
      for (const [key, n] of nodes) if (!seen.has(key)) n.node.visible = false;
      const b = frame.ball;
      if (b) {
        ballShadow.position.set(b.shadow.sx, b.shadow.sy);
        ballShadow.scale.set(b.shadow.w / 18, b.shadow.h / 7);
        ball.position.set(b.sx, b.sy - b.d / 2);
        ball.scale.set(b.d / 14);
        // 골라인 너머 (골망 안) 만 깊이 정렬 — 골대 앞 그물 뒤로. 필드 위에서는 늘 맨 위 (서 있는 선수 뒤로 숨지 않게)
        const inGoal = Number.isFinite(b.u) && (b.u < V.V25.RU || b.u > V.V25.RU + V.V25.FL);
        ball.zIndex = inGoal ? b.shadow.sy + 0.5 : 1e6;
      }
      app.render();
    }

    return {
      renderer: 'webgl', canvas, resolution, draw, destroy,
      /** 늦게 온 그림 (얼굴) 때문에 다시 그려야 하는가 */
      get dirty() { return dirty; },
      get destroyed() { return dead; },
      /** WebGL 문맥을 이미 잃었는가 (만드는 도중 잃은 view 를 화면이 받지 않게) */
      isLost() {
        try { return !!app.renderer?.gl?.isContextLost?.(); } catch (_) { return false; }
      },
    };
  } catch (e) {
    destroy(); // 반쯤 만든 앱 · 붙인 캔버스 · 구운 텍스처를 남기지 않는다 (WebGL 문맥 · 전역 리스너 · ticker 새는 것 방지)
    throw e;
  }
}
