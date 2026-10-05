#!/usr/bin/env node
// tools/sprites.mjs — 2.5등신 스프라이트 원본 (art/sprites/base/) → 화면용 투명 WebP (img/sprites/) + 목록 data/sprites.json
// (docs/SPRITE_25D_PLAN.md §2). npm test 에는 넣지 않는다.
//
//   node tools/sprites.mjs [--only id,id] [--height 240]
//
// 1) art/sprites/base/<캐릭터 id>.png = 단색 배경 (자홍 #FF00FF 또는 초록 #00FF00 — 네 모서리 평균으로 고른다) 위의 한 방향 (오른쪽을 보는
//    거의 옆모습, 위에서 30°) 기준 그림. Codex 이미지 생성 결과 그대로 (art/sprites/README.md).
// 2) 크로마키: 배경색 계열의 정도 (초록 = g − max(r, b), 자홍 = min(r, b) − g) 로 알파 (0.12 ~ 0.42 사이 부드럽게),
//    반투명 가장자리는 어둡게 (선 그림이라 번짐이 바깥선에 묻힌다). 알파 > 0.5 인 픽셀로 잘라낸 뒤 높이 --height (기본 240 = 화면 64px 의 약 3.75배,
//    결정 확대 2.2배 · DPR 1.5 에서도 1:1 이하) 로 줄인다.
// 3) img/sprites/<id>.webp (알파, quality 0.92) · data/sprites.json = { version: 1, height, chars: { id: { w, h, footX, v } } }.
//    footX = 발 가운데 x / w (아래 6% 줄의 불투명 픽셀 x 평균) — 화면은 이 점을 선수 자리에 맞춘다. v = 출력 sha1 앞 8자 (?v= 캐시 피하기).
// Chrome 경로: CHROME_PATH → 기본 설치 경로 (tools/shot.mjs findBrowser). 결과물 (img/sprites · data/sprites.json) 을 커밋한다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { findBrowser, startServer } from "./shot.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC_DIR = path.join(ROOT, "art", "sprites", "base");
const OUT_DIR = path.join(ROOT, "img", "sprites");
const MANIFEST = path.join(ROOT, "data", "sprites.json");

function parseArgs(argv) {
  const o = { only: null, height: 240 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--only") o.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (argv[i] === "--height") o.height = Number(argv[++i]);
    else throw new Error(`모르는 인자: ${argv[i]}`);
  }
  if (!(o.height >= 32 && o.height <= 1024)) throw new Error("--height 는 32 ~ 1024");
  return o;
}

/* 페이지 쪽 (puppeteer evaluate — 바깥 변수를 쓰지 않는다) */
async function pageCut(url, height) {
  const im = new Image();
  im.src = url;
  await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, W, H), p = d.data;
  const at = (xx, yy) => { const i = (yy * W + xx) * 4; return [p[i], p[i + 1], p[i + 2]]; };
  const cs = [at(4, 4), at(W - 5, 4), at(4, H - 5), at(W - 5, H - 5)];
  const k = [0, 1, 2].map((j) => cs.reduce((s, q) => s + q[j], 0) / 4);
  const green = k[1] > k[0] && k[1] > k[2];
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    const keyness = green ? (g - Math.max(r, b)) / 255 : (Math.min(r, b) - g) / 255;
    const a = Math.max(0, Math.min(1, 1 - (keyness - 0.12) / 0.3));
    if (a < 1) { p[i] *= 0.45; p[i + 1] *= 0.45; p[i + 2] *= 0.45; }
    p[i + 3] = Math.round(a * 255);
    if (a > 0.5) { const n = i / 4, xx = n % W, yy = (n / W) | 0; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
  }
  if (x1 < 0) throw new Error("캐릭터 픽셀이 없다 (배경색만)");
  x.putImageData(d, 0, 0);
  let sx = 0, n = 0;
  const band = Math.max(4, Math.round((y1 - y0) * 0.06));
  for (let yy = y1 - band; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (p[(yy * W + xx) * 4 + 3] > 128) { sx += xx; n++; }
  const tw = x1 - x0 + 1, th = y1 - y0 + 1;
  const oh = height, ow = Math.round(tw * oh / th);
  const o = document.createElement("canvas");
  o.width = ow; o.height = oh;
  const g = o.getContext("2d");
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = "high";
  g.drawImage(c, x0, y0, tw, th, 0, 0, ow, oh);
  const blob = await new Promise((r) => o.toBlob(r, "image/webp", 0.92));
  if (!blob || blob.type !== "image/webp") throw new Error(`webp 인코딩 실패 (${blob && blob.type})`);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(s), w: ow, h: oh, footX: n ? (sx / n - x0) / tw : 0.5, key: green ? "green" : "magenta" };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const ids = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();
  const chars = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "characters.json"), "utf8"));
  const known = new Set((Array.isArray(chars) ? chars : chars.characters || []).map((c) => c.id));
  for (const id of ids) if (!known.has(id)) throw new Error(`art/sprites/base/${id}.png: data/characters.json 에 없는 캐릭터 id`);
  const todo = o.only ? ids.filter((id) => o.only.includes(id)) : ids;
  if (o.only) for (const id of o.only) if (!ids.includes(id)) throw new Error(`원본 없음: art/sprites/base/${id}.png`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { chars: {} };
  const server = await startServer(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
    const out = { version: 1, height: o.height, chars: {} };
    for (const id of ids) {
      const file = path.join(OUT_DIR, `${id}.webp`);
      if (todo.includes(id) || !old.chars[id] || old.height !== o.height) {
        const r = await page.evaluate(pageCut, `${base}/art/sprites/base/${id}.png`, o.height);
        const bytes = Buffer.from(r.b64, "base64");
        fs.writeFileSync(file, bytes);
        out.chars[id] = { w: r.w, h: r.h, footX: Math.round(r.footX * 1000) / 1000, v: crypto.createHash("sha1").update(bytes).digest("hex").slice(0, 8) };
        console.log(`${id}: ${r.w}×${r.h} footX ${out.chars[id].footX} (배경 ${r.key}) → img/sprites/${id}.webp ${(bytes.length / 1024).toFixed(0)}KB`);
      } else {
        out.chars[id] = old.chars[id];
      }
    }
    fs.writeFileSync(MANIFEST, `${JSON.stringify(out, null, 2)}\n`);
    console.log(`data/sprites.json: ${Object.keys(out.chars).length}명`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
