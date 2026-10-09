// 육각 오토배틀 시험판 (ingame-hex 브랜치 → /soccer/hex/, 2026-10-09 — docs/HEX_AUTOBATTLE_PLAN.md): 레슨판 · 스프라이트판과 같은 origin 이라
// 저장 키 앞머리를 주소로 가른다 — js/ui/store.js HEX_SITE · STORAGE_PREFIX. 2.5D 경기 화면이 기본으로 켜진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = pathToFileURL(path.join(ROOT, "js/ui/store.js")).href;

/** location 을 잠깐 바꾸고 store.js 를 새로 읽는다 (쿼리로 모듈 캐시를 피한다) */
async function storeAt(pathname, search, tag) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { pathname, search }, configurable: true, writable: true });
  try {
    return await import(`${STORE}?${tag}`);
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete globalThis.location;
  }
}

test("육각 시험판: 주소가 /hex/ 면 저장 앞머리 'soccer-hex.' — 레슨판 · 스프라이트판 키와 섞이지 않는다", async () => {
  const hx = await storeAt("/soccer/hex/", "", "hex");
  assert.equal(hx.HEX_SITE, true);
  assert.equal(hx.SPRITE_SITE, false);
  assert.equal(hx.STORAGE_PREFIX, "soccer-hex.");
  for (const [k, v] of Object.entries(hx.KEYS)) assert.equal(v, `soccer-hex.${k}`, `KEYS.${k}`);

  const sp = await storeAt("/soccer/sprite/", "", "hexsprite");
  assert.equal(sp.HEX_SITE, false);
  assert.equal(sp.STORAGE_PREFIX, "soccer-sprite.");

  const ls = await storeAt("/soccer/lesson/", "", "hexlesson");
  assert.equal(ls.HEX_SITE, false);
  assert.equal(ls.STORAGE_PREFIX, "soccer-lesson.");
});

test("육각 시험판: 2.5D 경기 화면이 기본으로 켜지고 ?flat=1 로 끈다", async () => {
  const on = await storeAt("/soccer/hex/", "", "hexd25");
  assert.equal(on.isD25(), true);
  const off = await storeAt("/soccer/hex/", "?flat=1", "hexflat");
  assert.equal(off.isD25(), false);
});
