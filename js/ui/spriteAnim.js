// js/ui/spriteAnim.js — 2.5D 경기 화면의 움직이는 스프라이트 (docs/SPRITE_25D_PLAN.md §13 — A1). DOM 없음 (불러오기만 fetch) — test/spriteAnim.test.mjs
//
// 동작 목록 (data/sprites.json chars[id].anim = 'img/sprites/anim/<id>.json' — art.spriteAnimUrl):
//   { version, id, anims: { <동작>: { mode: 'loop'|'once'|'hold', fps, count, w, h, footX, footY, v, foot0X? } } }
//   시트 = 같은 폴더의 <id>.<동작>.webp — 가로 띠 (칸 count 개, 칸 w × h), 칸 안의 발 = (footX, footY) (footX = 몸통 가운데 — 프레임끼리 맞춘 줄),
//   foot0X = 첫 칸의 발 가운데 (아래 6% 줄 — data/sprites.json footX 와 같은 규칙, tools/sprite_anim.mjs 가 잰다 · 없으면 footX).
//   첫 칸 캐릭터 키 = 정지 스프라이트 키 (240) — 같은 배율 (72 / 240), 오른쪽을 본다. v = 시트 sha1 앞 8자 (?v=).
//   mode: loop = 반복 (한 바퀴), once = 한 번 (준비 자세에서 시작해 준비 자세 쯤으로 끝난다), hold = 끝 자세가 다르다 (마지막 칸에 머문다).
//
// 화면 (screens/match.js): 선수마다 요소 하나 (.spr-anim) 의 배경 = 지금 동작의 시트, CSS steps(count) 애니메이션 (background-position 0% → 100%).
//   앵커 (= 토큰 발 자리) = 칸 안 (foot0X, footY) — 정지 스프라이트 (발 가운데 · 아래 끝) 와 같은 점이라 정지 ↔ 동작 첫 칸이 튀지 않는다.
//   단, 달리는 반복 (run · dribble — 첫 칸이 보폭 한가운데) 의 앵커 x = footX (몸통 가운데 — 한 바퀴 동안 두 발이 그 둘레를 오간다 = 발밑 타원 가운데).
//   좌우 반전 = 그 점 기준 scaleX(-1). 길이: 반복 = count / fps × 배속 계수 (1 / speed), 한 번 · 끝 자세 = 그 동작을 보여 주는 단계 길이 (fitMs).
// 메모리: 시트는 내려받기만 (fetch — HTTP 캐시) 미리 해 두고, 디코드는 브라우저가 요소에 그릴 때 (선수마다 지금 시트 한 장). 캔버스 · Image 사본 없음.

/** 동작 이름 (시트 파일 <id>.<동작>.webp) */
export const ANIM_ACTIONS = Object.freeze(['idle', 'run', 'dribble', 'kick', 'pass', 'header', 'tackle', 'block', 'fall', 'celebrate']);
const MODES = new Set(['loop', 'once', 'hold']);
/** 없는 동작 · 아직 내려받지 못한 시트의 대신 (차례로 — 끝은 늘 idle) */
export const ANIM_FALLBACK = Object.freeze({
  idle: [], run: ['idle'], dribble: ['run', 'idle'], kick: ['pass', 'idle'], pass: ['kick', 'idle'], header: ['kick', 'pass', 'idle'],
  tackle: ['block', 'idle'], block: ['tackle', 'idle'], fall: ['idle'], celebrate: ['idle'],
});
/** 달리는 반복 동작: 앵커 x = 몸통 가운데 (footX). 그 밖 (대기 · 한 번 · 끝 자세 — 준비 자세에서 시작) = 첫 칸의 발 가운데 (foot0X) */
const STRIDE_ACTS = new Set(['run', 'dribble']);
const ID_RE = /^[A-Za-z0-9_-]+$/;
const MAX_FRAMES = 256;

const num = (x) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN);
const r2 = (x) => Math.round(x * 100) / 100;

/**
 * 동작 목록 JSON → { id, url, anims: { 동작: { mode, fps, count, w, h, footX, footY, foot0X, ax, v, url } } } | null (ax = 앵커 x — 칸 안 px).
 * 이상한 동작은 뺀다 (mode · fps > 0 · count 1 ~ 256 정수 · w · h > 0 · 발이 칸 안 · v). idle 이 없으면 null (그 선수는 정지 스프라이트).
 * 시트 주소 = 목록 주소의 폴더 + <id>.<동작>.webp?v=<v>.
 * @param {object} json
 * @param {string} url 목록 주소 (예 './img/sprites/anim/ch_elf_playmaker.json')
 */
export function parseAnimManifest(json, url) {
  if (!json || typeof json !== 'object' || !json.anims || typeof json.anims !== 'object' || typeof url !== 'string') return null;
  const file = url.replace(/[?#].*$/, '');
  const slash = file.lastIndexOf('/');
  const dir = slash >= 0 ? file.slice(0, slash + 1) : './';
  const id = typeof json.id === 'string' && ID_RE.test(json.id) ? json.id : file.slice(slash + 1).replace(/\.json$/, '');
  if (!ID_RE.test(id)) return null;
  const anims = {};
  for (const act of ANIM_ACTIONS) {
    const a = Object.prototype.hasOwnProperty.call(json.anims, act) ? json.anims[act] : null;
    if (!a || typeof a !== 'object') continue;
    const fps = num(a.fps);
    const count = num(a.count);
    const w = num(a.w);
    const h = num(a.h);
    const footX = num(a.footX);
    const footY = num(a.footY);
    const f0 = num(a.foot0X);
    const v = typeof a.v === 'string' && a.v ? a.v : null;
    if (!MODES.has(a.mode) || !(fps > 0) || !Number.isInteger(count) || count < 1 || count > MAX_FRAMES) continue;
    if (!(w > 0) || !(h > 0) || !(footX >= 0 && footX <= w) || !(footY >= 0 && footY <= h) || !v) continue;
    const foot0X = f0 >= 0 && f0 <= w ? f0 : footX;
    anims[act] = {
      mode: a.mode, fps, count, w, h, footX, footY, foot0X, ax: STRIDE_ACTS.has(act) ? footX : foot0X, v,
      url: `${dir}${encodeURIComponent(id)}.${act}.webp?v=${encodeURIComponent(v)}`,
    };
  }
  if (!anims.idle) return null;
  return { id, url, anims };
}

/**
 * 보여 줄 동작: want 가 있고 시트가 준비됐으면 그것, 아니면 ANIM_FALLBACK 차례 (끝 = idle — 준비된 시트만 쓴다, idle 도 아니면 null).
 * @param {{ anims: object }} m parseAnimManifest 결과
 * @param {string} want
 * @param {(url: string) => boolean} [ready] 시트를 다 내려받았는가 (기본 = 늘 예)
 */
export function pickAct(m, want, ready = () => true) {
  if (!m || !m.anims) return null;
  const ok = (act) => !!m.anims[act] && ready(m.anims[act].url);
  for (const act of [want, ...(ANIM_FALLBACK[want] || ['idle'])]) if (ok(act)) return act;
  return ok('idle') ? 'idle' : null;
}

/**
 * 동작 길이 (ms): 반복 = count / fps × speedK (배속 계수 — screens/match.js fx() = 1 / speed), 한 번 · 끝 자세 = fitMs (그 동작을 보여 주는
 * 단계 길이 — 배속이 이미 들어 있다) · 없으면 반복과 같은 식. 1 ms 아래로는 줄이지 않는다.
 * @param {{ mode: string, fps: number, count: number }} a
 * @param {{ speedK?: number, fitMs?: number }} [o]
 */
export function animDuration(a, { speedK = 1, fitMs = 0 } = {}) {
  const k = Number(speedK) > 0 ? Number(speedK) : 1;
  const native = (a.count / a.fps) * 1000 * k;
  const ms = a.mode !== 'loop' && Number(fitMs) > 0 ? Number(fitMs) : native;
  return Math.max(1, Math.round(ms));
}

/**
 * 요소 (.spr-anim) 의 치수 (s = 1 월드 px — 크기는 .tok-figure 의 scale(--ts)): 칸 = w × h × k (k = 정지 스프라이트 배율 72 / 240),
 * 앵커 (0, 0) = 칸 안 (ax, footY) → left = −ax · k, top = −footY · k. 배경 크기 = count 칸 × 칸, 반전 기준 = 앵커 (칸 안 좌표).
 * n = steps 수 (= count), iter = 반복 (loop = infinite, 그 밖 = 1 — fill both 로 마지막 칸에 머문다).
 * @param {object} a parseAnimManifest 의 동작 하나
 * @param {{ k: number }} o
 */
export function animBox(a, { k }) {
  const fw = a.w * k;
  const fh = a.h * k;
  const ax = a.ax ?? a.foot0X ?? a.footX;
  return {
    width: r2(fw), height: r2(fh), left: r2(-ax * k), top: r2(-a.footY * k),
    bgW: r2(fw * a.count), bgH: r2(fh), originX: r2(ax * k), originY: r2(a.footY * k),
    n: a.count, iter: a.mode === 'loop' ? 'infinite' : '1',
  };
}

/* ------------------------------------------------------------------ */
/* 비트 이벤트 → 동작 (screens/match.js actionPhase 가 쓴다 — 순수)          */
/* ------------------------------------------------------------------ */

/** 공격 액션 → 동작 (드리블 = 드리블, 패스 · 짧은 배급 = 패스, 크로스 · 센터링 · 슛 · 롱 배급 = 킥) */
const ATK_ACT = { dribble: 'dribble', pass: 'pass', short: 'pass', cross: 'kick', shoot: 'kick', long: 'kick' };
/** 수비 액션 → 동작 (태클 · 인터셉트 = 태클 (몸을 던져 끊는다), 버티기 = 버티기) */
const DEF_ACT = { tackle: 'tackle', intercept: 'tackle', hold: 'block' };

/**
 * 공을 가진 선수 (이벤트 playerId — 배급이면 GK) 의 액션 연출 동작: 헤더 슛 = header, 승부차기 = kick, 그 밖은 액션 (ATK_ACT).
 * 성공 · 실패 (turnover · save) 와 상관없이 시도한 동작. 모르는 이벤트면 null (그대로 둔다).
 * @param {{ type: string, action?: string, header?: boolean }} ev
 */
export function attackerAct(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (ev.header && (ev.type === 'goal' || ev.type === 'save')) return 'header';
  if (ev.type === 'penalty') return 'kick';
  if (!['duel', 'turnover', 'save', 'goal', 'distribution'].includes(ev.type)) return null;
  return ATK_ACT[ev.action] || (ev.type === 'goal' || ev.type === 'save' ? 'kick' : null);
}

/**
 * 듀얼 수비 (이벤트 defenderId — 필드 선수. GK 의 세이브 · 다이브는 K1 연출이 맡는다 → keeper 면 null) 의 액션 연출 동작:
 *   제쳐짐 (드리블 성공) · 태클 실패 (패스 · 크로스 성공 — 누운 모습 .fallen) = fall (끝 자세 — 다음 재배치까지),
 *   패스 · 크로스 성공의 그 밖 수비 · 공 뺏기 (turnover) = 수비 액션 (DEF_ACT — GK 배급 롱패스 경합 끊기 = 인터셉트),
 *   슛 (골 · 세이브 · 승부차기 — ③ 중거리 슛을 막으려던 필드 수비) = block.
 * @param {{ type: string, action?: string, defAction?: string, success?: boolean }} ev
 * @param {{ keeper?: boolean }} [o]
 */
export function defenderAct(ev, { keeper = false } = {}) {
  if (!ev || typeof ev !== 'object' || keeper) return null;
  switch (ev.type) {
    case 'duel':
      if (ev.action === 'dribble' || ev.defAction === 'tackle') return 'fall';
      return DEF_ACT[ev.defAction] || null;
    case 'turnover':
      return DEF_ACT[ev.defAction] || 'tackle';
    case 'goal':
    case 'save':
    case 'penalty':
      return 'block';
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* 불러오기 (모듈 캐시 — 경기 화면을 다시 열어도 한 번)                          */
/* ------------------------------------------------------------------ */

const manifests = new Map(); // 목록 주소 → Promise<parsed | null>
const sheetLoads = new Map(); // 시트 주소 → Promise<boolean>
const sheetsReady = new Set(); // 다 내려받은 시트 주소

const fetchOf = (f) => (typeof f === 'function' ? f : typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

/**
 * 동작 목록을 불러 parseAnimManifest (주소마다 한 번 — 결과 Promise 를 캐시). 없거나 (404) 이상하면 null — 던지지 않는다 (콘솔 오류 없음).
 * 목록은 작고 시트 판 (v) 이 들어 있으므로 늘 다시 확인한다 (cache: 'no-cache' — 배포 직후 옛 목록 + 새 시트가 섞이지 않게).
 * @param {string} url
 * @param {Function} [fetchFn] 기본 globalThis.fetch
 * @returns {Promise<object|null>}
 */
export function loadAnimManifest(url, fetchFn) {
  if (typeof url !== 'string' || !url) return Promise.resolve(null);
  if (manifests.has(url)) return manifests.get(url);
  const f = fetchOf(fetchFn);
  const p = (async () => {
    if (!f) return null;
    try {
      const res = await f(url, { cache: 'no-cache' });
      if (!res || !res.ok) return null;
      return parseAnimManifest(await res.json(), url);
    } catch (_) {
      return null;
    }
  })();
  manifests.set(url, p);
  return p;
}

/**
 * 시트 하나를 내려받기만 한다 (HTTP 캐시에 넣기 — 디코드 · 캔버스 · Image 사본 없음). 본문은 끝까지 읽고 버린다 (다 받아야 캐시에 남는다).
 * 주소마다 한 번. 끝나면 sheetReady(url) = true. 실패는 false (그 동작은 대신 동작 — pickAct).
 * @param {string} url
 * @param {Function} [fetchFn]
 * @returns {Promise<boolean>}
 */
export function preloadSheet(url, fetchFn) {
  if (typeof url !== 'string' || !url) return Promise.resolve(false);
  if (sheetLoads.has(url)) return sheetLoads.get(url);
  const f = fetchOf(fetchFn);
  const p = (async () => {
    if (!f) return false;
    try {
      const res = await f(url);
      if (!res || !res.ok) return false;
      if (typeof res.arrayBuffer === 'function') await res.arrayBuffer();
      sheetsReady.add(url);
      return true;
    } catch (_) {
      return false;
    }
  })();
  sheetLoads.set(url, p);
  return p;
}

/** 시트를 다 내려받았는가 */
export const sheetReady = (url) => sheetsReady.has(url);

/**
 * 미리 내려받을 시트 차례: idle 먼저 (없으면 동작으로 바꾸지 않는다), 다음 자주 쓰는 순 (달리기 · 드리블 · 패스 · 킥 …).
 * onlyIdle (줄인 움직임 — 늘 idle 첫 칸) 이면 idle 하나.
 * @param {{ anims: object }} m
 * @param {{ onlyIdle?: boolean }} [o]
 * @returns {string[]}
 */
export function sheetUrls(m, { onlyIdle = false } = {}) {
  if (!m || !m.anims || !m.anims.idle) return [];
  const order = onlyIdle ? ['idle'] : ['idle', 'run', 'dribble', 'pass', 'kick', 'tackle', 'block', 'fall', 'header', 'celebrate'];
  return order.filter((a) => m.anims[a]).map((a) => m.anims[a].url);
}

/** 테스트용: 모듈 캐시를 비운다 */
export function resetAnimCacheForTest() {
  manifests.clear();
  sheetLoads.clear();
  sheetsReady.clear();
}
