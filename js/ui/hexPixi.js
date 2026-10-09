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
//
// 스프라이트 (H2 — 문서 §5.2 · §5.3 · §5.4, 결정 15):
//  - data/sprites.json 의 캐릭터만: 움직이는 시트가 있으면 (art.spriteAnimUrl — 지금 실루엔 ch_elf_playmaker) AnimatedSprite,
//    정지 그림만 있으면 (art.spriteOf) Sprite, 둘 다 없으면 H1 스탠디 (몸 + 얼굴 원). 발밑 그림자 · 고리는 모두 그대로.
//  - 텍스처는 경기장에 선 캐릭터 것만, charId 마다 한 벌 (bank) — 두 팀에 같은 캐릭터가 있어도 (연습 경기 거울 팀) 같은 텍스처를 나눠 쓴다.
//    시트 (가로 띠 webp) 하나 = 소스 텍스처 하나, 칸 i = Rectangle(i · w, 0, w, h) 로 자른 텍스처 (소스를 나눠 쓴다).
//    idle 시트를 먼저, 그다음 나머지 9장을 함께 불러온다. 아직 안 온 동작은 spriteAnim.pickAct 의 대신 동작.
//    목록 · idle 시트를 못 불러오면 그 선수는 스탠디 그대로 (오류 없음 — 다른 동작 시트가 실패하면 대신 동작).
//  - 떠날 때 (destroy) 칸 텍스처 → 시트 소스 텍스처를 모두 지운다 (만드는 도중 실패 · 문맥 잃음 다시 만들기도 같은 길). 늦게 도착한 그림은 버린다.
//  - 크기: 키 = V.spriteHeight(s) (72 · s) — 시트 첫 칸 캐릭터 키 = 정지 그림 키 (240) 라 배율 k = SPR_H / 240 (예전 화면 그대로).
//    앵커 = 발 (spriteAnim.animBox 의 ax · footY), 정지 그림 = (footX, 아래 끝). 'l' 이면 x 반전.
//  - 재생 (draw 의 timing = { clock: 화면 시계 ms, speed, turnMs: 한 턴 ms (배속 반영) }): 반복 (idle · run · dribble) = 목록 fps × 배속,
//    한 번 (kick · pass · header · tackle · block) · 넘어짐 = 그 턴 길이에 맞춤 (animDuration fitMs — 4배속 0.1 초 턴은 최소 ONE_SHOT_MIN ms),
//    세리머니 = 목록 길이 / 배속 (골 장면 ~1.1 초 동안 끝 자세까지). 끝 자세 (hold) 는 마지막 칸에 머문다.
//    [구현 결정] 한 번 동작은 끝까지 보여 준다 — 다음 턴의 반복 동작 (달리기 등) 이 끊지 않고, 다른 한 번 · 끝 자세 동작만 끊는다
//    (4배속 · 패스 뒤 바로 달리기에서도 동작이 읽히게). 동작 키 (actKey) 가 바뀌면 처음부터. frame 의 actSpan 이 있으면 그 칸 구간만.
//  - 정지 그림 선수는 달리는 동안 살짝 통통 (2.5 · s px, 한 턴에 한 번), 넘어지면 스탠디처럼 눕힌다. 움직이는 시트 선수는 fall 동작 (눕히지 않음).
//  - 얼굴 방향: 반복 동작은 frame 의 facing 그대로, 한 번 · 끝 자세 동작은 시작할 때 (actKey 가 바뀐 첫 그림) 의 방향으로 그 동작 내내 고정
//    (block · 가로채기 · 세로 패스처럼 hexScene 이 공 쪽 V.facing 을 주는 동작이 턴 도중 공이 지나가며 뒤집히지 않게 — 정지 그림도 같다).
//  - view.spriteKind(charId) = 그 캐릭터를 지금 스프라이트로 그리는가 ('anim' | 'static' | null — 아직 안 왔거나 실패 = 스탠디). 화면이 이름표 높이에 쓴다.
//  - view.animating = 지난 draw 에 아직 재생 중인 스프라이트가 있었다 → 화면이 그림이 멈춰 있어도 다시 그린다.
//  - 메모리: hexPixiMemory() = 모든 view 에서 살아 있는 소스 텍스처 수 · 바이트 (w · h · 4, 종류별), view.stats() 는 그 view 것만.

import * as V from './view25.js';
import { FIELD_RECT, quadScreen, gridCells, LOOP_ACTS } from './hexScene.js';
import { portraitUrl, spriteOf, spriteAnimUrl } from './art.js';
import { loadAnimManifest, pickAct, sheetUrls, animDuration, animBox } from './spriteAnim.js';

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
/** 한 번 동작의 가장 짧은 길이 (ms — 4배속 0.1 초 턴에서도 읽히게, 문서 §5.3) */
export const ONE_SHOT_MIN = 150;
/** 정지 그림 선수가 달릴 때 통통 높이 (화면 px × s) */
const BOB_PX = 2.5;

let factoryForTest = null;
let pixiForTest = null;
let imageLoaderForTest = null;

/** 살아 있는 소스 텍스처 (모든 view) → { bytes, kind: 'scene' | 'face' | 'sprite' } — hexPixiMemory */
const LIVE = new Map();
let liveViews = 0;

/**
 * 지금 살아 있는 텍스처 (모든 육각 view 합계 — 화면을 떠나면 0 이어야 한다): { views, textures, bytes, byKind: { kind: { textures, bytes } } }.
 * bytes = 소스 w · h · 4 (GPU 에 올린 크기 — 브라우저가 디코드한 그림 사본은 따로).
 */
export function hexPixiMemory() {
  const byKind = {};
  let bytes = 0;
  for (const { bytes: b, kind } of LIVE.values()) {
    bytes += b;
    const k = (byKind[kind] ||= { textures: 0, bytes: 0 });
    k.textures += 1;
    k.bytes += b;
  }
  return { views: liveViews, textures: LIVE.size, bytes, byKind };
}

/**
 * 테스트 이음매: 그림 불러오기 fn(url) → Promise<Image | {width, height} | null> (null = 원래대로 new Image). jsdom 은 그림을 불러오지 않는다.
 * @param {((url: string) => Promise<any>) | null} fn
 */
export function setHexImageLoaderForTest(fn) {
  imageLoaderForTest = typeof fn === 'function' ? fn : null;
}

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
  if (imageLoaderForTest) return Promise.resolve().then(() => imageLoaderForTest(url)).catch(() => null);
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
 * @returns {Promise<null | { renderer: 'webgl', canvas: HTMLCanvasElement,
 *   draw: (frame: object, cam: {cx: number, cy: number, z: number}, timing?: { clock: number, speed: number, turnMs: number }) => void,
 *   destroy: () => void, stats: () => object, dirty: boolean, animating: boolean }>}
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
  const { Container, Sprite, Graphics, Texture, PerspectiveMesh, CanvasSource, ImageSource, AnimatedSprite, Rectangle } = PIXI;
  const owned = []; // 내가 만든 텍스처 (destroy 때 소스까지 지운다 — Pixi 전역 캐시를 거치지 않게 소스를 직접 만든다)
  const cuts = []; // 시트에서 잘라낸 칸 텍스처 (소스는 owned 의 시트 — destroy 때 칸 먼저, 소스는 owned 로)
  const own = (resource, kind = 'scene') => {
    const source = resource instanceof HTMLCanvasElement ? new CanvasSource({ resource }) : new ImageSource({ resource });
    const t = new Texture({ source });
    owned.push(t);
    const w = Number(resource?.naturalWidth || resource?.width) || 0;
    const hh = Number(resource?.naturalHeight || resource?.height) || 0;
    LIVE.set(t, { bytes: w * hh * 4, kind });
    return t;
  };
  let dead = false;
  let dirty = true; // 그림이 늦게 도착 (얼굴 · 스프라이트) → 화면이 다음 프레임에 다시 그린다
  let animating = false; // 지난 draw 에 재생 중인 스프라이트가 있었다
  const nodes = new Map(); // 선수 key → 노드
  const blankFaces = new Map(); // portraitColor → 초상 없는 얼굴 텍스처 (같은 색끼리 나눠 쓴다)
  const bank = new Map(); // charId → 스프라이트 묶음 (두 팀이 나눠 쓴다)
  liveViews += 1;

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
    for (const t of cuts) {
      try { t.destroy(false); } catch (_) { /* 이미 지움 */ }
    }
    cuts.length = 0;
    for (const t of owned) {
      try { t.destroy(true); } catch (_) { /* 이미 지움 */ }
      LIVE.delete(t);
    }
    owned.length = 0;
    liveViews = Math.max(0, liveViews - 1);
    nodes.clear();
    blankFaces.clear();
    bank.clear();
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
      if (!blankFaces.has(k)) blankFaces.set(k, own(bakeBlankFace(color), 'face'));
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
      const sprBox = new Container(); // 스프라이트 (있으면 figure 대신 — 발 = 원점, 배율 s)
      sprBox.visible = false;
      node.addChild(ground, figure, sprBox);
      actors.addChild(node);
      const n = {
        node, ground, figure, faceRing, gold, ring, sprBox, side: p.side, resting: null, carrier: null,
        spr: null, sprKind: null, cur: null, // 스프라이트 · 종류 ('anim' | 'static') · 지금 동작 { act, key, start, mode, dur, count }
      };
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
          const tex = own(bakeFace(img, p.color), 'face');
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

    /* ---- 스프라이트 (H2) ---- */
    /** charId → 묶음 { kind: null | 'anim' | 'static', m, acts: { 동작: 칸 텍스처[] }, ready: Set<시트 주소>, stat, k, st } — 처음 볼 때 불러오기 시작 */
    function bankOf(charId) {
      if (!charId) return null;
      let b = bank.get(charId);
      if (b) return b;
      const st = spriteOf(data, charId);
      b = { kind: null, m: null, acts: {}, ready: new Set(), stat: null, k: st ? V.V25.SPR_H / st.h : 0, st };
      bank.set(charId, b);
      if (!st) return b;
      const animUrl = spriteAnimUrl(data, charId);
      if (animUrl) {
        loadAnimManifest(animUrl).then((m) => {
          if (dead || !m) return; // 목록 실패 → 스탠디 그대로
          b.m = m;
          const urls = sheetUrls(m);
          const actOf = (url) => Object.keys(m.anims).find((a) => m.anims[a].url === url);
          // idle 먼저 (못 오면 동작으로 바꾸지 않는다), 그다음 나머지를 함께
          return loadSheet(b, actOf(urls[0])).then((ok) => {
            if (!ok || dead) return;
            for (const url of urls.slice(1)) loadSheet(b, actOf(url));
          });
        }).catch((e) => console.warn('스프라이트 목록을 불러오지 못했습니다', e));
      } else {
        loadImg(st.url).then((img) => {
          if (dead || !img) return;
          try {
            b.stat = own(img, 'sprite');
            b.kind = 'static';
            dirty = true;
          } catch (e) {
            console.warn('정지 스프라이트를 올리지 못했습니다', e);
          }
        });
      }
      return b;
    }
    /** 시트 하나 → 소스 텍스처 + 칸 텍스처 count 개. 실패 · 크기가 모자라면 false (그 동작은 대신 동작) */
    async function loadSheet(b, act) {
      const a = act && b.m?.anims?.[act];
      if (!a) return false;
      const img = await loadImg(a.url);
      if (dead || !img) return false;
      const iw = Number(img.naturalWidth || img.width) || 0;
      const ih = Number(img.naturalHeight || img.height) || 0;
      if (iw + 1 < a.w * a.count || ih + 1 < a.h) return false;
      try {
        const sheet = own(img, 'sprite');
        const frames = [];
        for (let i = 0; i < a.count; i++) {
          const t = new Texture({ source: sheet.source, frame: new Rectangle(i * a.w, 0, a.w, a.h) });
          cuts.push(t);
          frames.push(t);
        }
        b.acts[act] = frames;
        b.ready.add(a.url);
        if (act === 'idle') b.kind = 'anim';
        dirty = true;
        return true;
      } catch (e) {
        console.warn('스프라이트 시트를 올리지 못했습니다', act, e);
        return false;
      }
    }
    /** 한 선수의 스프라이트를 frame 동작에 맞춘다. 스프라이트가 (아직) 없으면 false (스탠디) */
    function drawSprite(n, p, tm) {
      const b = bankOf(p.charId);
      if (!b || !b.kind) return false;
      const flip = p.facing === 'l' ? -1 : 1;
      n.charId = p.charId;
      n.want = p.act;
      if (b.kind === 'static') {
        n.cur = null;
        if (n.sprKind !== 'static') {
          n.sprBox.removeChildren();
          n.spr = new Sprite(b.stat);
          n.spr.anchor.set(b.st.footX, 1);
          n.sprBox.addChild(n.spr);
          n.sprKind = 'static';
        }
        // 한 번 · 끝 자세 동작은 시작할 때 방향으로 고정 (머리 주석 "얼굴 방향")
        if (LOOP_ACTS.includes(p.act)) n.statLock = null;
        else if (!n.statLock || n.statLock.key !== p.actKey) n.statLock = { key: p.actKey, flip };
        n.spr.scale.set((n.statLock ? n.statLock.flip : flip) * b.k, b.k);
        const runs = (p.act === 'run' || p.act === 'dribble') && !p.resting;
        n.sprBox.y = runs ? -Math.abs(Math.sin((tm.clock / Math.max(1, tm.turnMs)) * Math.PI)) * BOB_PX * p.s : 0;
        if (runs) animating = true;
        n.sprBox.rotation = p.resting ? (p.side === 'away' ? 1 : -1) * 1.43 : 0;
        n.sprBox.alpha = p.resting ? 0.85 : 1;
        return true;
      }
      if (n.sprKind !== 'anim') {
        n.sprBox.removeChildren();
        n.spr = new AnimatedSprite({ textures: b.acts.idle, autoUpdate: false });
        n.sprBox.addChild(n.spr);
        n.sprKind = 'anim';
        n.cur = null;
      }
      const want = pickAct(b.m, p.act, (url) => b.ready.has(url)) || 'idle';
      const a = b.m.anims[want];
      const cur = n.cur;
      const curDone = !cur || cur.mode === 'loop' || tm.clock - cur.start >= cur.dur;
      let change;
      if (!cur) change = true;
      else if (want === cur.act) change = a.mode !== 'loop' && p.actKey !== cur.key; // 같은 반복 = 이어서, 같은 한 번 동작은 키가 바뀔 때만 처음부터
      else change = !(a.mode === 'loop' && !curDone); // 한 번 동작은 끝까지 (반복 동작이 끊지 않는다)
      if (change) {
        const box = animBox(a, { k: 1 });
        n.spr.textures = b.acts[want];
        n.spr.anchor.set(-box.left / box.width, -box.top / box.height);
        // 구간 (actSpan — 태클 실패 연출): 칸 first ~ last 만 (원하는 동작 그대로일 때만 — 대신 동작이면 전체)
        const sp = want === p.act && Array.isArray(p.actSpan) ? p.actSpan : null;
        const first = sp ? Math.min(a.count - 1, Math.max(0, Math.floor(sp[0] * a.count))) : 0;
        const last = sp ? Math.min(a.count - 1, Math.max(first, Math.ceil(sp[1] * a.count) - 1)) : a.count - 1;
        n.cur = {
          act: want, key: p.actKey, start: tm.clock, mode: a.mode, count: last - first + 1, first, flip,
          // 한 번 · 넘어짐 = 시작한 턴 길이에 맞춤 (최소 ONE_SHOT_MIN). 반복 · 세리머니는 아래에서 배속으로 매번
          dur: animDuration(a, { fitMs: Math.max(ONE_SHOT_MIN, tm.turnMs) }),
        };
      }
      const c = n.cur; // 지금 재생 중인 동작 (한 번 동작을 끝까지 보여 주는 중이면 want 와 다르다)
      if (c.mode === 'loop' || c.act === 'celebrate') c.dur = animDuration(b.m.anims[c.act], { speedK: 1 / tm.speed });
      const t = Math.max(0, tm.clock - c.start);
      const i = c.first + (c.mode === 'loop' ? Math.floor((t / c.dur) * c.count) % c.count : Math.min(c.count - 1, Math.floor((t / c.dur) * c.count)));
      if (n.spr.currentFrame !== i) n.spr.gotoAndStop(i);
      c.t = t;
      if (c.mode === 'loop' || t < c.dur) animating = true;
      // 한 번 · 끝 자세 동작은 시작할 때 방향 그대로 (끝까지 보여 주는 중이든 frame 동작 그대로든) — 동작 도중 뒤집히지 않게.
      // 반복 동작만 frame 방향을 따른다
      n.spr.scale.set((c.mode === 'loop' ? flip : c.flip) * b.k, b.k);
      n.sprBox.y = 0;
      n.sprBox.rotation = 0;
      n.sprBox.alpha = 1;
      return true;
    }

    function draw(frame, cam, timing) {
      if (dead || !frame) return;
      dirty = false;
      animating = false;
      const tm = {
        clock: Number.isFinite(timing?.clock) ? timing.clock : (globalThis.performance?.now?.() ?? Date.now()),
        speed: Number(timing?.speed) > 0 ? Number(timing.speed) : 1,
        turnMs: Number(timing?.turnMs) > 0 ? Number(timing.turnMs) : 400,
      };
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
        n.sprBox.scale.set(p.s);
        let sprite = false;
        try { sprite = drawSprite(n, p, tm); } catch (e) { console.warn('스프라이트 그리기 실패', e); }
        n.figure.visible = !sprite;
        n.sprBox.visible = sprite;
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
      /** 그 캐릭터를 지금 스프라이트로 그리는가: 'anim' | 'static' | null (스프라이트 없음 · 아직 안 옴 · 실패 = 스탠디) */
      spriteKind(charId) {
        return (charId && bank.get(charId)?.kind) || null;
      },
      /** 지난 draw 에 아직 재생 중인 스프라이트가 있었다 (그림이 멈춰 있어도 다시 그려야 한다) */
      get animating() { return animating && !dead; },
      get destroyed() { return dead; },
      /** 지금 스프라이트로 그린 선수 (디버그 · 스크린샷 도구 hex_shot --practice): [{ key, charId, kind, act (재생 중), want (frame 동작), frame, t (ms), dur, flip }] */
      playing() {
        const out = [];
        for (const [key, n] of nodes) {
          if (!n.node.visible || !n.sprBox.visible || !n.sprKind) continue;
          const c = n.cur;
          out.push({
            key, charId: n.charId, kind: n.sprKind, act: c ? c.act : n.want, want: n.want,
            frame: n.spr?.currentFrame ?? 0, t: c ? Math.round(c.t || 0) : 0, dur: c ? Math.round(c.dur) : 0,
            flip: (n.spr?.scale?.x ?? 1) < 0 ? 'l' : 'r',
            box: (() => { // 화면 (캔버스 CSS px) 위 스프라이트 상자
              try {
                const r = n.spr.getBounds();
                return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
              } catch (_) { return null; }
            })(),
          });
        }
        return out;
      },
      /** 이 view 의 텍스처: 소스 수 · 바이트 (w · h · 4) · 종류별 · 칸 텍스처 수 · 캐릭터별 스프라이트 (종류 · 올린 동작) */
      stats() {
        const byKind = {};
        let bytes = 0;
        for (const t of owned) {
          const e = LIVE.get(t);
          if (!e) continue;
          bytes += e.bytes;
          const k = (byKind[e.kind] ||= { textures: 0, bytes: 0 });
          k.textures += 1;
          k.bytes += e.bytes;
        }
        const chars = {};
        for (const [id, b] of bank) chars[id] = { kind: b.kind, acts: Object.keys(b.acts) };
        return { textures: owned.length, bytes, byKind, cuts: cuts.length, chars };
      },
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
