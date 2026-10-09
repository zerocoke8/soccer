// js/ui/swRegister.js — 육각 시험판 (/soccer/hex/) 에서만 서비스 워커 sw.js 를 등록한다 (app.js 부트가 부른다).
//   왜: GitHub Pages max-age=600 + 판 번호 없는 ES 모듈 → 배포 직후 새 화면 모듈과 캐시의 옛 엔진 모듈이 섞인다
//   ("HM.ultimateList is not a function", 2026-10-10). sw.js 가 스크립트 · 스타일 · JSON 을 매번 서버에 확인받게 한다 (sw.js 머리 주석).
//   - HEX_SITE 가 아니거나 navigator.serviceWorker 가 없으면 (jsdom · 시험 · 오래된 브라우저 · http 비보안 주소) 아무것도 안 한다.
//   - 기다리지 않는다 (화면은 먼저 그린다) · 실패는 console.warn 만 (토스트 없음).
import { HEX_SITE } from './store.js';

/** sw.js 주소 (index.html 기준 — /soccer/hex/sw.js, 범위 /soccer/hex/) */
export const SW_URL = './sw.js';

/**
 * 육각 시험판이면 sw.js 등록을 건다 (기다리지 않음).
 * @param {{ hexSite?: boolean, nav?: object }} [opts]  시험용 — 기본 store.HEX_SITE · globalThis.navigator
 * @returns {boolean} 등록을 시도했으면 true
 */
export function registerHexServiceWorker({ hexSite = HEX_SITE, nav = globalThis.navigator } = {}) {
  if (!hexSite) return false;
  try {
    const sw = nav && 'serviceWorker' in nav ? nav.serviceWorker : null;
    if (!sw || typeof sw.register !== 'function') return false;
    Promise.resolve(sw.register(SW_URL)).catch((e) => console.warn('서비스 워커 등록 실패', e));
    return true;
  } catch (e) {
    console.warn('서비스 워커 등록 실패', e);
    return false;
  }
}
