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

// H1 (docs/HEX_AUTOBATTLE_PLAN.md §6.2): 육각 경기 화면은 /hex/ 에서 기본으로 켜지고 ?hex=0 으로 끈다 — 다른 주소는 기본 끔, ?hex=1 로 켠다
test("육각 경기 화면: /hex/ 기본 켬 · ?hex=0 끔, /soccer/ 기본 끔 · ?hex=1 켬", async () => {
  assert.equal((await storeAt("/soccer/hex/", "", "hexon")).isHexMatch(), true);
  assert.equal((await storeAt("/soccer/hex/", "?hex=0", "hexoff0")).isHexMatch(), false);
  assert.equal((await storeAt("/soccer/hex/", "?hex=off", "hexoffw")).isHexMatch(), false);
  assert.equal((await storeAt("/soccer/", "", "hexmain")).isHexMatch(), false);
  assert.equal((await storeAt("/soccer/", "?hex=1", "hexmain1")).isHexMatch(), true);
  assert.equal((await storeAt("/soccer/lesson/", "?hex=true", "hexlesson1")).isHexMatch(), true);

  // 테스트 손잡이: 켜고 끄고 null 로 기본값 (주소 · 사이트) 으로 돌아간다
  const m = await storeAt("/soccer/", "", "hexfortest");
  m.setHexMatchForTest(true);
  assert.equal(m.isHexMatch(), true);
  m.setHexMatchForTest(false);
  assert.equal(m.isHexMatch(), false);
  m.setHexMatchForTest(null);
  assert.equal(m.isHexMatch(), false);
});

test("육각 경기 한 턴 길이: 기본 400ms · ?tick=300 ~ 500 만 받는다", async () => {
  assert.equal((await storeAt("/soccer/hex/", "", "tickdef")).hexTickMs(), 400);
  assert.equal((await storeAt("/soccer/hex/", "?tick=300", "tick300")).hexTickMs(), 300);
  assert.equal((await storeAt("/soccer/hex/", "?tick=500", "tick500")).hexTickMs(), 500);
  assert.equal((await storeAt("/soccer/hex/", "?tick=900", "tick900")).hexTickMs(), 400);
  assert.equal((await storeAt("/soccer/hex/", "?tick=299", "tick299")).hexTickMs(), 400);
  assert.equal((await storeAt("/soccer/hex/", "?tick=350.5", "tickfrac")).hexTickMs(), 400);
  assert.equal((await storeAt("/soccer/hex/", "?tick=abc", "tickabc")).hexTickMs(), 400);
});

test("육각 경기 저장 키: KEYS.hexMatch 도 'soccer-hex.' 앞머리 · 저장/읽기 · clearRunSaves 가 함께 지운다", async () => {
  const hx = await storeAt("/soccer/hex/", "", "hexkeys");
  assert.equal(hx.KEYS.hexMatch, "soccer-hex.hexMatch");
  assert.equal(hx.HEX_SAVE_VERSION, 3, "판 3 = H3.5 결정의 순간 입력 (choose · defend) 도 기록");
  assert.equal(hx.store.hexMatch, null);
  const ls = await storeAt("/soccer/lesson/", "", "hexkeyslesson");
  assert.equal(ls.KEYS.hexMatch, "soccer-lesson.hexMatch");

  // node 에는 localStorage 가 없을 수 있다 → 잠깐 메모리 저장소로
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const mem = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) },
    configurable: true, writable: true,
  });
  try {
    assert.equal(hx.loadHexMatch(), null);
    const save = { version: hx.HEX_SAVE_VERSION, seed: "s1", steps: 37, inputs: [[3, "home", "p7", "arm"], [9, "home", "p7", "disarm"],
      [12, "home", "p7", "choose", "loft:p6:120"], [20, "home", "p2", "defend", "block"]] };
    hx.saveHexMatch(save);
    assert.deepEqual(hx.loadHexMatch(), save);
    // 판 1 (H1 · H2 — 입력 없음) · inputs 없는 판 2 → inputs: [] · 판 1 · 2 는 rules: 2 (그때 규칙으로 되살린다 — H3.5)
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 1, seed: "s1", steps: 12, skipped: true }));
    assert.deepEqual(hx.loadHexMatch(), { version: 3, seed: "s1", steps: 12, skipped: true, inputs: [], rules: 2 }, "판 1 = 입력 없음");
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 2, seed: "s1", steps: 4 }));
    assert.deepEqual(hx.loadHexMatch(), { version: 3, seed: "s1", steps: 4, inputs: [], rules: 2 }, "inputs 없음 = 입력 없음");
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 2, seed: "s1", steps: 9, inputs: [[3, "home", "p7", "arm"]] }));
    assert.deepEqual(hx.loadHexMatch(), { version: 3, seed: "s1", steps: 9, inputs: [[3, "home", "p7", "arm"]], rules: 2 }, "판 2 필살기 입력 그대로");
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 3, seed: "s1", steps: 9, inputs: [], rules: 2 }));
    assert.deepEqual(hx.loadHexMatch(), { version: 3, seed: "s1", steps: 9, inputs: [], rules: 2 }, "판 2 에서 이어 온 판 3 기록 (rules 2) 그대로");
    for (const bad of [[[-1, "home", "p1", "arm"]], [[1.5, "home", "p1", "arm"]], [[1, "both", "p1", "arm"]], [[1, "home", "", "arm"]], [[1, "home", "p1", "fire"]], [[1, "home", "p1"]], "x",
      [[1, "home", "p1", "choose", "shoot"]]]) {
      mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 2, seed: "s1", steps: 4, inputs: bad }));
      assert.equal(hx.loadHexMatch(), null, `판 2 입력 모양이 틀리면 없음 (choose 는 판 3 만): ${JSON.stringify(bad)}`);
    }
    for (const bad of [[[1, "home", "p1", "choose"]], [[1, "home", "p1", "choose", ""]], [[1, "home", "p1", "defend", "tackle"]], [[1, "home", "p1", "arm", "x"]]]) {
      mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 3, seed: "s1", steps: 4, inputs: bad }));
      assert.equal(hx.loadHexMatch(), null, `판 3 입력 모양이 틀리면 없음: ${JSON.stringify(bad)}`);
    }
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 3, seed: "s1", steps: 4, inputs: [], rules: 7 }));
    assert.equal(hx.loadHexMatch(), null, "rules 가 틀리면 없음");
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 99, seed: "s1", steps: 3 }));
    assert.equal(hx.loadHexMatch(), null, "버전이 다르면 없음");
    mem.set(hx.KEYS.hexMatch, JSON.stringify({ version: 1, seed: "s1", steps: -1 }));
    assert.equal(hx.loadHexMatch(), null, "steps 가 틀리면 없음");
    hx.saveHexMatch(save);
    hx.saveRun({ kind: "lessonRun" });
    hx.clearRunSaves();
    assert.equal(mem.has(hx.KEYS.hexMatch), false);
    assert.equal(mem.has(hx.KEYS.run), false);
    hx.saveHexMatch(save);
    hx.saveHexMatch(null);
    assert.equal(mem.has(hx.KEYS.hexMatch), false);
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete globalThis.localStorage;
  }
});

// H1 SPEC §0 · §2: Pixi 는 vendor/pixi.min.mjs (PixiJS 8.22.0 MIT) 를 hexPixi.js 가 동적 import 로만 읽는다 — app.js 의 정적 import 그래프에 vendor/ 가 없어야 하고
// (jsdom 시험이 app.js 를 읽는다), import(PIXI_URL) 이 가리키는 파일이 있어야 한다 (없으면 /hex/ 가 조용히 대체 화면만 보인다).
test("Pixi 경로: hexPixi.js 의 PIXI_URL = vendor/pixi.min.mjs (sha256 · 라이선스), app.js 정적 import 그래프에 vendor/ 없음", async () => {
  const fs = await import("node:fs");
  const crypto = await import("node:crypto");
  const pixiSrc = fs.readFileSync(path.join(ROOT, "js/ui/hexPixi.js"), "utf8");
  const m = /const PIXI_URL = '([^']+)';/.exec(pixiSrc);
  assert.ok(m, "hexPixi.js 에 PIXI_URL 상수");
  assert.match(pixiSrc, /await import\(PIXI_URL\)/, "동적 import(PIXI_URL)");
  const target = path.resolve(ROOT, "js/ui", m[1]);
  assert.equal(target, path.join(ROOT, "vendor", "pixi.min.mjs"), "PIXI_URL → vendor/pixi.min.mjs");
  assert.ok(fs.existsSync(target), "vendor/pixi.min.mjs 가 있다");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
  assert.equal(sha, "66257bc46776898bf8c54daaed402ed8f9ac109379c47b2dfa8aa048544d2953", "PixiJS 8.22.0 원본 그대로");
  assert.match(fs.readFileSync(path.join(ROOT, "vendor", "PIXI_LICENSE"), "utf8"), /MIT License/, "vendor/PIXI_LICENSE");

  // app.js 에서 정적 import (import … from · export … from · import '…') 로 닿는 파일 전부
  const vendorDir = path.join(ROOT, "vendor") + path.sep;
  const seen = new Set();
  const stack = [path.join(ROOT, "js/ui/app.js")];
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(!file.startsWith(vendorDir), `app.js 에서 정적으로 닿는 vendor 파일: ${path.relative(ROOT, file)}`);
    const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const specs = [
      ...[...src.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm)].map((x) => x[1]),
      ...[...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((x) => x[1]),
    ];
    for (const s of specs) {
      if (!s.startsWith(".")) continue;
      stack.push(path.resolve(path.dirname(file), s));
    }
  }
  for (const want of ["js/ui/screens/hexMatch.js", "js/ui/hexPixi.js", "js/ui/hexScene.js"]) {
    assert.ok(seen.has(path.join(ROOT, want)), `그래프 걷기 확인: ${want} 에 닿는다`);
  }
  assert.ok(!seen.has(target), "Pixi 는 정적 그래프 밖");
});
