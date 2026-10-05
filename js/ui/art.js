// js/ui/art.js — 일러스트 주소 도우미 (LESSON_PROTO_PLAN §24.12.2). 엔진 로직 없음.
// 그림 목록 = data/portraits.json (app.js 가 선택 파일로 읽어 data.portraits — 없으면 모든 얼굴이 글자 원).
//   { version, presets: { face, bust, half }, chars: { charId: { v } }, coaches: { supportId: { v } }, scenes: { id: { v } } }
// 파일 = img/portraits/<id>.<face|bust|half>.webp · img/scenes/<id>.webp (tools/portraits.mjs 가 만든다), 주소 뒤 ?v=<sha1 앞 8자> (Pages 캐시).
// 목록에 없는 id (상대 팀 · 유스 · 그림 없는 것) 는 null — 파일 이름을 짐작해 불러 보지 않는다 (tools/shot.mjs 는 404 를 오류로 센다).
//
//   portraitUrl(data, id, preset)  → './img/portraits/<id>.<preset>.webp?v=…' | null   (id = 캐릭터 id 또는 서포트(코치) id)
//   sceneUrl(data, id)             → './img/scenes/<id>.webp?v=…' | null
//   charIdOf(ctx, playerId)        → 런 선수 id → 캐릭터 id (charId 가 없는 뷰 — 레슨 · 이벤트 · 미팅 · 보상)
//   playerArt(ctx, p, preset)      → 선수 뷰 p (charId 가 있으면 그것, 없으면 p.id 로 charIdOf) 의 그림 주소 | null
//   preloadArt(urls)               → 그림을 미리 불러 decode (그리기를 기다리지 않는다 — jsdom 은 그림을 불러오지 않는다)

/** 초상 프리셋 (data/portraits.json presets 가 없을 때) */
export const PORTRAIT_PRESETS = ['face', 'bust', 'half'];

const has = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

function manifestOf(data) {
  const m = data && data.portraits;
  return m && typeof m === 'object' ? m : null;
}

/** 목록 항목의 판 (v) — 없거나 이상하면 null */
function versionOf(entry) {
  const v = entry && typeof entry === 'object' ? entry.v : null;
  return typeof v === 'string' && v ? v : null;
}

/**
 * 선수 (캐릭터 id) · 코치 (서포트 id) 초상 주소. 목록 · id · 프리셋이 없으면 null.
 * @param {object} data 게임 데이터 (data.portraits)
 * @param {string} id charId 또는 supportId
 * @param {'face'|'bust'|'half'} [preset]
 * @returns {string|null}
 */
export function portraitUrl(data, id, preset = 'face') {
  const m = manifestOf(data);
  if (!m || typeof id !== 'string' || !id) return null;
  const presetOk = m.presets && typeof m.presets === 'object' ? has(m.presets, preset) : PORTRAIT_PRESETS.includes(preset);
  if (!presetOk) return null;
  const entry = has(m.chars, id) ? m.chars[id] : has(m.coaches, id) ? m.coaches[id] : null;
  const v = versionOf(entry);
  return v ? `./img/portraits/${encodeURIComponent(id)}.${preset}.webp?v=${encodeURIComponent(v)}` : null;
}

/**
 * 배경 그림 주소 (scenes). 목록에 없으면 null — 부르는 쪽이 CSS 그라데이션을 쓴다.
 * @param {object} data
 * @param {string} id
 * @returns {string|null}
 */
export function sceneUrl(data, id) {
  const m = manifestOf(data);
  if (!m || typeof id !== 'string' || !id) return null;
  const v = versionOf(has(m.scenes, id) ? m.scenes[id] : null);
  return v ? `./img/scenes/${encodeURIComponent(id)}.webp?v=${encodeURIComponent(v)}` : null;
}

/**
 * 런 선수 id → 캐릭터 id (store.run.players). 엔진 뷰를 고치지 않고 charId 가 없는 뷰에서 얼굴을 찾는다.
 * @param {object} ctx 화면 ctx (store)
 * @param {string} playerId
 * @returns {string|null}
 */
export function charIdOf(ctx, playerId) {
  if (playerId == null) return null;
  const players = ctx?.store?.run?.players;
  if (!Array.isArray(players)) return null;
  const p = players.find((x) => x && x.id === playerId);
  return p && typeof p.charId === 'string' ? p.charId : null;
}

/**
 * 선수 뷰의 그림 주소: p.charId (편성 · 주 · HUD 뷰) → 없으면 p.id 로 런 선수에서 찾는다 (레슨 · 이벤트 뷰). 유스 · 상대 = null.
 * @param {object} ctx 화면 ctx (data · store)
 * @param {{ id?: string, charId?: string }|null} p
 * @param {'face'|'bust'|'half'} [preset]
 * @returns {string|null}
 */
export function playerArt(ctx, p, preset = 'face') {
  if (!p) return null;
  const cid = typeof p.charId === 'string' && p.charId ? p.charId : charIdOf(ctx, p.id);
  return portraitUrl(ctx?.data, cid, preset);
}

// 미리 불러 둔 그림 (주소 → Image). 참조를 들고 있어야 브라우저가 디코드한 그림을 버리지 않는다.
const preloaded = new Map();
const PRELOAD_CAP = 120;

/**
 * 그림을 미리 불러 decode 한다 (컷인처럼 짧게 뜨는 그림 — §24.12.4). 기다리지 않는다: 바로 돌아온다.
 * decode 가 없으면 (jsdom) 건너뛴다. 실패는 조용히 무시한다 (그 자리는 글자 원이 대신한다).
 * @param {Iterable<string|null|undefined>} urls
 * @returns {number} 새로 불러오기 시작한 수
 */
export function preloadArt(urls) {
  let n = 0;
  if (typeof Image !== 'function' || !urls) return n;
  for (const url of urls) {
    if (typeof url !== 'string' || !url || preloaded.has(url)) continue;
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      if (preloaded.size >= PRELOAD_CAP) preloaded.delete(preloaded.keys().next().value);
      preloaded.set(url, img);
      n += 1;
      if (typeof img.decode === 'function') img.decode().catch(() => {});
    } catch (_) { /* 그림 없이도 화면은 그려진다 */ }
  }
  return n;
}
