// sw.js — 육각 시험판 (/soccer/hex/) 서비스 워커: 스크립트 · 스타일 · JSON 을 매번 서버에 확인받게 한다 (판이 섞이지 않게).
//
// 왜 (2026-10-10 기획자 폰): GitHub Pages 는 모든 파일을 `cache-control: max-age=600` 으로 주고, 이 사이트는 빌드 없는 ES 모듈이라
//   모듈 주소에 판 번호가 없다 (index.html → ./js/ui/app.js → 정적 import, 엔진은 app.js 부트의 import('../engine/hexMatch.js')).
//   그래서 배포 직후 10분 동안은 브라우저가 어떤 파일은 새것 · 어떤 파일은 캐시의 옛것을 섞어 쓸 수 있다 —
//   새 js/ui/screens/hexMatch.js (H3) + 캐시의 옛 js/engine/hexMatch.js (H2) → "HM.ultimateList is not a function", 필살기가 안 됨.
//
// 하는 일: 이 범위 (등록한 주소의 폴더 = /soccer/hex/) 안 · 같은 origin · GET · 페이지 이동이 아닌 요청 중
//   스크립트 · 스타일 · JSON (request.destination 'script' | 'style' | 'json', 또는 경로가 .js · .mjs · .css · .json 으로 끝남) 만
//   fetch(request, { cache: 'no-cache' }) 로 다시 받는다 — 브라우저 HTTP 캐시는 그대로 쓰되 매번 서버에 확인 (ETag → 304, 몸통 없음 · 싸다).
//   실패하면 (오프라인 등) 평소처럼 fetch(request). 그 밖 (페이지 이동 · 그림 · 스프라이트 시트 · 다른 origin · POST) 은 손대지 않는다.
//   Cache Storage 는 쓰지 않는다 (오프라인 모드 없음) — 이 파일이 망가져도 사이트는 평소 그대로 받아 온다.
//
// 등록: js/ui/swRegister.js (app.js 부트 — store.HEX_SITE 이고 navigator.serviceWorker 가 있을 때만). 메인 · 레슨 · 스프라이트판은 등록하지 않는다.
// 끄기 (kill switch): 이 파일을 아래 두 줄만 남긴 sw.js 로 바꿔 배포하면, 다음 방문 때 브라우저가 새 sw.js 를 받아 스스로 등록을 지운다.
//   self.addEventListener('install', () => self.skipWaiting());
//   self.addEventListener('activate', () => { self.registration.unregister(); });
//   (그리고 swRegister.js 호출을 빼면 다시 등록되지 않는다.) sw.js 자체는 브라우저가 HTTP 캐시를 건너뛰고 확인하므로 끄기도 바로 닿는다.

const EXT = /\.(?:m?js|css|json)$/i;
const DEST = new Set(['script', 'style', 'json']);

/** 다시 확인받을 요청인가 (같은 origin · 이 범위 · GET · 페이지 이동 아님 · 스크립트 / 스타일 / JSON) */
function revalidates(request, scope) {
  if (!request || request.method !== 'GET' || request.mode === 'navigate') return false;
  let url;
  let base;
  try {
    url = new URL(request.url);
    base = new URL(scope);
  } catch (_) {
    return false;
  }
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return false;
  return DEST.has(request.destination) || EXT.test(url.pathname);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!revalidates(request, self.registration.scope)) return; // 손대지 않음 — 브라우저가 평소대로
  event.respondWith(fetch(request, { cache: 'no-cache' }).catch(() => fetch(request)));
});
