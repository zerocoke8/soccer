// js/ui/stage.js — 고정 스테이지: 모든 화면을 논리 1280×720 (16:9) 판 위에 그린다.
//
//  - index.html: #stage 안에 #app 과 오버레이 루트(#modal-root · #banner-root · #toast-root)가 있다 → 모달·토스트·컷인도 스테이지와 함께 커지고 작아진다.
//  - 창에 맞춰 한 배율(scale)로 키우거나 줄여 가운데에 둔다. 남는 곳 = 레터박스 (body 배경).
//    CSS 변수 (html 요소): --stage-scale, --stage-x, --stage-y → base.css .stage 의 transform: translate(x, y) scale(s), 원점 왼쪽 위.
//  - 레이아웃은 논리 px 로 잰다: 변환된 요소의 clientWidth/clientHeight 는 배율 전 값 (경기 화면 measure() 가 그대로 쓴다).
//    getBoundingClientRect · 포인터 clientX/Y 는 화면(배율 후) 값이라 섞어 쓰지 않는다 — 필요하면 toStage() 로 바꾼다.
//  - 창이 세로(폭 < 높이)면 html.stage-portrait → 레터박스 위에 "화면을 가로로 돌려 주세요" (스테이지는 그대로 쓸 수 있다).
//  - 화면 크기 media query (min-width 등)는 실제 창 기준이라 스테이지 안 레이아웃에 쓰지 않는다.

export const STAGE_W = 1280;
export const STAGE_H = 720;

/**
 * 창 winW×winH 에 스테이지(stageW×stageH)를 한 배율로 맞춘다 (순수 함수).
 * @returns {{ scale: number, x: number, y: number, width: number, height: number, portrait: boolean }}
 *   x, y = 스테이지 왼쪽 위 (창 px, 정수로 내림 — 가장자리 번짐 방지), width/height = 화면에 보이는 크기
 */
export function fitStage(winW, winH, stageW = STAGE_W, stageH = STAGE_H) {
  const w = Number(winW);
  const h = Number(winH);
  if (!(w > 0) || !(h > 0)) return { scale: 1, x: 0, y: 0, width: stageW, height: stageH, portrait: false }; // 크기를 모르면(레이아웃 없는 환경) 1배
  const scale = Math.min(w / stageW, h / stageH);
  const width = stageW * scale;
  const height = stageH * scale;
  return {
    scale,
    x: Math.max(0, Math.floor((w - width) / 2)),
    y: Math.max(0, Math.floor((h - height) / 2)),
    width,
    height,
    portrait: w < h,
  };
}

/** 창 좌표(clientX/Y) → 스테이지 논리 좌표 */
export function toStage(clientX, clientY, fit) {
  const f = fit || { scale: 1, x: 0, y: 0 };
  return { x: (clientX - f.x) / f.scale, y: (clientY - f.y) / f.scale };
}

/**
 * #stage 를 창에 맞추고 창 크기가 바뀔 때마다 다시 맞춘다. #stage 가 없으면 null.
 * @returns {{ el: HTMLElement, apply: () => object, readonly fit: object } | null}
 */
export function mountStage({ win = globalThis.window, doc = globalThis.document } = {}) {
  const el = doc?.getElementById?.('stage');
  if (!el || !win) return null;
  const rootEl = doc.documentElement;
  let fit = fitStage(0, 0);
  const apply = () => {
    fit = fitStage(win.innerWidth, win.innerHeight);
    const st = rootEl.style;
    st.setProperty('--stage-scale', String(fit.scale));
    st.setProperty('--stage-x', `${fit.x}px`);
    st.setProperty('--stage-y', `${fit.y}px`);
    rootEl.classList.toggle('stage-portrait', fit.portrait);
    return fit;
  };
  apply();
  try {
    win.addEventListener('resize', apply);
    win.addEventListener('orientationchange', apply);
  } catch (_) { /* ignore */ }
  return { el, apply, get fit() { return fit; } };
}
