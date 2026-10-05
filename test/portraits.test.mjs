// test/portraits.test.mjs — LESSON_PROTO_PLAN §24.12.1 (초상화 파이프라인, A1). Node 만 쓴다 (Chrome 없음).
// 자르기 명세 art/portraits.json ↔ 목록 data/portraits.json ↔ img/portraits/*.webp ↔ 캐릭터 · 서포트 id.
// 그림을 다시 자르려면 `node tools/portraits.mjs` (Chrome 필요) — 이 테스트는 결과물이 명세 · 목록과 맞는지만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { PRESET_NAMES, cropBox, sceneBox, specErrors, buildManifest, formatManifest, portraitPath, scenePath } from "../tools/portraits.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const spec = readJson("art/portraits.json");
const manifest = readJson("data/portraits.json");
const charIds = readJson("data/characters.json").map((c) => c.id);
const supportIds = readJson("data/supports.json").map((s) => s.id);

/** 프리셋별 파일 크기 한도 (바이트) — 지금 최대: 얼굴 약 18KB · 흉상 약 36KB · 반신 약 63KB */
const SIZE_LIMIT = { face: 40 * 1024, bust: 80 * 1024, half: 120 * 1024 };
/** §24.12.1 의 프리셋 (손으로 바꾸면 화면 자리 · 컷인 크기도 같이 봐야 한다) */
const PRESETS = {
  face: { w: 1.8, h: 1.8, top: 0.85, out: [256, 256], quality: 0.85 },
  bust: { w: 3.6, h: 4.5, top: 1.3, out: [384, 480], quality: 0.82 },
  half: { w: 4.4, h: 6.6, top: 1.4, out: [512, 768], quality: 0.8 },
};

/** WebP 캔버스 크기 [폭, 높이] (VP8X · VP8 · VP8L) */
function webpSize(buf) {
  assert.equal(buf.toString("ascii", 0, 4), "RIFF");
  assert.equal(buf.toString("ascii", 8, 12), "WEBP");
  assert.equal(buf.readUInt32LE(4) + 8, buf.length, "RIFF 길이");
  const kind = buf.toString("ascii", 12, 16);
  if (kind === "VP8X") return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (kind === "VP8 ") return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === "VP8L") {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  throw new Error(`알 수 없는 WebP 청크 ${kind}`);
}

const sha8 = (files) => {
  const h = crypto.createHash("sha1");
  for (const f of files) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest("hex").slice(0, 8);
};

test("자르기 명세 art/portraits.json: §24.12.1 모양 · 프리셋 값 · 선수 16 = characters.json · 코치 8 = supports.json · 원본 파일 있음", () => {
  assert.equal(spec.version, 1);
  assert.deepEqual(spec.sourceSize, [1024, 1536]);
  assert.deepEqual(spec.presets, PRESETS);
  assert.deepEqual(Object.keys(spec).sort(), ["chars", "coaches", "presets", "scenes", "sourceSize", "version"]);
  assert.deepEqual(specErrors(spec), []);
  assert.deepEqual(Object.keys(spec.chars).sort(), charIds.slice().sort());
  assert.deepEqual(Object.keys(spec.coaches).sort(), supportIds.slice().sort());
  for (const group of ["chars", "coaches"]) {
    for (const [id, e] of Object.entries(spec[group])) {
      assert.match(e.file, group === "chars" ? /^characters\/[a-z]+\.png$/ : /^coaches\/[a-z]+\.png$/, id);
      assert.ok(fs.existsSync(path.join(ROOT, "art", e.file)), `${id}: art/${e.file}`);
    }
  }
  assert.equal(spec.chars.ch_rabbit_fullback.file, "characters/connie.png");
  assert.equal(spec.coaches.sp_coach_harr.file, "coaches/harr.png");
  assert.equal(spec.coaches.sp_wind_dancer.file, "coaches/celia.png");
  assert.equal(spec.coaches.sp_elder_sage.file, "coaches/ornella.png");
  assert.equal(spec.coaches.sp_iron_captain.file, "coaches/barbara.png");
  assert.equal(spec.coaches.sp_mountain_monk.file, "coaches/hanna.png");
  assert.equal(spec.coaches.sp_bard_lumi.file, "coaches/lumi.png");
  assert.equal(spec.coaches.sp_street_striker.file, "coaches/joy.png");
  assert.equal(spec.coaches.sp_river_scholar.file, "coaches/irene.png");
});

test("자르는 칸: 모든 선수 · 코치 · 프리셋에서 원본 안 · out 비율 · 줄이지 않음", () => {
  for (const group of ["chars", "coaches"]) {
    for (const [id, e] of Object.entries(spec[group])) {
      for (const p of PRESET_NAMES) {
        const b = cropBox(e, p, spec.presets[p], spec.sourceSize);
        const where = `${id}.${p}`;
        assert.ok(b.sx >= 0 && b.sy >= 0 && b.sx + b.sw <= 1024 && b.sy + b.sh <= 1536, `${where} 원본 밖 ${JSON.stringify(b)}`);
        assert.equal(b.shrunk, false, `${where}: 칸이 원본보다 크다`);
        const [ow, oh] = spec.presets[p].out;
        assert.ok(Math.abs(b.sw / b.sh - ow / oh) < 0.01, `${where} 비율 ${b.sw}×${b.sh}`);
      }
    }
  }
});

test("cropBox: 가운데 x · 위 끝 y − top·head · dx/dy/scale 덮어쓰기 · 밖이면 안으로 민다 · 너무 크면 줄인다", () => {
  const pr = { w: 2, h: 2, top: 1 };
  assert.deepEqual(cropBox({ x: 500, y: 500, head: 100 }, "face", pr, [1000, 1000]), { sx: 400, sy: 400, sw: 200, sh: 200, shifted: false, shrunk: false });
  // 덮어쓰기: 칸 1.5배 · 가운데 +10 · 위 −20
  assert.deepEqual(cropBox({ x: 500, y: 500, head: 100, face: { dx: 10, dy: -20, scale: 1.5 } }, "face", pr, [1000, 1000]), { sx: 360, sy: 330, sw: 300, sh: 300, shifted: false, shrunk: false });
  // 다른 프리셋 이름의 덮어쓰기는 상관없다
  assert.equal(cropBox({ x: 500, y: 500, head: 100, bust: { dx: 99 } }, "face", pr, [1000, 1000]).sx, 400);
  // 왼쪽 위 밖 → 0 으로 민다 (빈 칸을 채우지 않는다)
  assert.deepEqual(cropBox({ x: 50, y: 30, head: 100 }, "face", pr, [1000, 1000]), { sx: 0, sy: 0, sw: 200, sh: 200, shifted: true, shrunk: false });
  // 오른쪽 아래 밖
  const br = cropBox({ x: 990, y: 990, head: 100 }, "face", pr, [1000, 1000]);
  assert.deepEqual([br.sx, br.sy, br.shifted], [800, 800, true]);
  // 원본보다 크면 비율을 지켜 줄인다
  const big = cropBox({ x: 500, y: 500, head: 800 }, "face", pr, [1000, 600]);
  assert.equal(big.shrunk, true);
  assert.deepEqual([big.sw, big.sh, big.sy], [600, 600, 0]);
  // 배경: out 비율로 가운데 cover
  assert.deepEqual(sceneBox([1280, 853], [1536, 1024]), { sx: 0, sy: 0, sw: 1536, sh: 1024, shifted: false, shrunk: false });
  assert.deepEqual(sceneBox([100, 100], [300, 200]), { sx: 50, sy: 0, sw: 200, sh: 200, shifted: false, shrunk: false });
});

test("specErrors: 잘못된 항목을 짚는다", () => {
  const bad = JSON.parse(JSON.stringify(spec));
  bad.chars.ch_spirit_keeper.head = 0;
  bad.chars.ch_dwarf_wall.x = -5;
  bad.coaches.sp_coach_harr.face = { dx: 1, zoom: 2 };
  bad.presets.bust.quality = 1.5;
  const errs = specErrors(bad);
  assert.ok(errs.some((e) => e.includes("ch_spirit_keeper.head")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("ch_dwarf_wall.x")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("sp_coach_harr.face.zoom")), errs.join("\n"));
  assert.ok(errs.some((e) => e.includes("presets.bust.quality")), errs.join("\n"));
});

test("목록 data/portraits.json: 모양 · 프리셋 크기 · 선수 = characters.json · 코치 = supports.json", () => {
  assert.deepEqual(Object.keys(manifest), ["version", "presets", "chars", "coaches", "scenes"]);
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.presets, { face: [256, 256], bust: [384, 480], half: [512, 768] });
  for (const p of PRESET_NAMES) assert.deepEqual(manifest.presets[p], spec.presets[p].out, p);
  assert.deepEqual(Object.keys(manifest.chars).sort(), charIds.slice().sort());
  assert.deepEqual(Object.keys(manifest.coaches).sort(), supportIds.slice().sort());
  assert.deepEqual(Object.keys(manifest.scenes).sort(), Object.keys(spec.scenes).sort());
  for (const group of ["chars", "coaches", "scenes"]) {
    for (const [id, e] of Object.entries(manifest[group])) {
      assert.deepEqual(Object.keys(e), ["v"], `${group}.${id}`);
      assert.match(e.v, /^[0-9a-f]{8}$/, `${group}.${id}.v`);
    }
  }
});

test("그림 파일: 선수 · 코치마다 얼굴 · 흉상 · 반신 WebP · 크기 = 프리셋 out · 파일 크기 한도 · v = sha1 앞 8자", () => {
  let count = 0;
  for (const group of ["chars", "coaches"]) {
    for (const [id, e] of Object.entries(manifest[group])) {
      const files = PRESET_NAMES.map((p) => portraitPath(id, p));
      PRESET_NAMES.forEach((p, i) => {
        const f = path.join(ROOT, files[i]);
        assert.ok(fs.existsSync(f), files[i]);
        const buf = fs.readFileSync(f);
        assert.deepEqual(webpSize(buf), manifest.presets[p], `${files[i]} 크기`);
        assert.ok(buf.length <= SIZE_LIMIT[p], `${files[i]} ${buf.length}B > ${SIZE_LIMIT[p]}B`);
        count++;
      });
      assert.equal(e.v, sha8(files), `${group}.${id}.v ≠ sha1(face + bust + half)`);
    }
  }
  assert.equal(count, (charIds.length + supportIds.length) * 3);
  for (const [id, e] of Object.entries(manifest.scenes)) {
    const f = scenePath(id);
    assert.ok(fs.existsSync(path.join(ROOT, f)), f);
    assert.deepEqual(webpSize(fs.readFileSync(path.join(ROOT, f))), spec.scenes[id].out, `${f} 크기`);
    assert.equal(e.v, sha8([f]), `scenes.${id}.v`);
  }
});

test("img/portraits/ 에는 목록의 파일만 있다 · 목록은 디스크에서 다시 만든 것과 글자까지 같다", () => {
  const expected = new Set();
  for (const group of ["chars", "coaches"]) for (const id of Object.keys(manifest[group])) for (const p of PRESET_NAMES) expected.add(path.basename(portraitPath(id, p)));
  assert.deepEqual(fs.readdirSync(path.join(ROOT, "img", "portraits")).sort(), [...expected].sort());
  assert.equal(fs.readFileSync(path.join(ROOT, "data", "portraits.json"), "utf8"), formatManifest(buildManifest(spec, ROOT)));
});

test("배포 코드 (js/ · css/ · index.html) 는 art/ 를 가리키지 않는다 (art/ 는 배포에서 빠진다 — img/ 만 쓴다)", () => {
  const files = ["index.html"];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${ent.name}`;
      if (ent.isDirectory()) walk(rel);
      else if (/\.(m?js|css|html)$/.test(ent.name)) files.push(rel);
    }
  };
  walk("js");
  walk("css");
  const hits = files.filter((f) => /(^|[^A-Za-z0-9_-])art\//.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(hits, []);
});
