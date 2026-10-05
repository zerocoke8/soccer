// 스프라이트 시험판 (outgame-sprite 브랜치 → /soccer/sprite/, 2026-10-05): 레슨판 (/soccer/lesson/) 과 같은 origin 이라
// 저장 키 앞머리를 주소로 가른다 — js/ui/store.js SPRITE_SITE · STORAGE_PREFIX.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = pathToFileURL(path.join(ROOT, "js/ui/store.js")).href;

/** location.pathname 을 잠깐 바꾸고 store.js 를 새로 읽는다 (쿼리로 모듈 캐시를 피한다) */
async function storeAt(pathname, tag) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { pathname }, configurable: true, writable: true });
  try {
    return await import(`${STORE}?${tag}`);
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete globalThis.location;
  }
}

test("스프라이트 시험판: 주소가 /sprite/ 면 저장 앞머리 'soccer-sprite.' — 레슨판 키와 섞이지 않는다", async () => {
  const sp = await storeAt("/soccer/sprite/", "sprite");
  assert.equal(sp.SPRITE_SITE, true);
  assert.equal(sp.STORAGE_PREFIX, "soccer-sprite.");
  for (const [k, v] of Object.entries(sp.KEYS)) assert.equal(v, `soccer-sprite.${k}`, `KEYS.${k}`);

  const ls = await storeAt("/soccer/lesson/", "lesson");
  assert.equal(ls.SPRITE_SITE, false);
  assert.equal(ls.STORAGE_PREFIX, "soccer-lesson.");
  for (const [k, v] of Object.entries(ls.KEYS)) assert.equal(v, `soccer-lesson.${k}`, `KEYS.${k}`);
});
