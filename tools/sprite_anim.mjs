#!/usr/bin/env node
// tools/sprite_anim.mjs — 움직이는 스프라이트 동작 목록 img/sprites/anim/<id>.json 을 만들거나 고친다 (docs/SPRITE_25D_PLAN.md §13 — A1).
// npm test 에는 넣지 않는다.
//
//   node tools/sprite_anim.mjs <캐릭터 id> [--from <video2sprite 출력 폴더>] [--map pass=pass2,header=header2] [--source "설명"]
//
// --from: 폴더의 <파일>.webp · <파일>.json (tools/video2sprite.mjs 결과, 파일 = 동작 이름 또는 --map 의 이름) 을 img/sprites/anim/<id>.<동작>.webp 로
//   복사하고 목록 항목을 만든다: mode = JSON trim.mode (loop · once · hold — --trim 없이 만든 것은 loop), fps · count · w · h · footX · footY 그대로.
//   폴더에 없는 동작은 지금 목록 항목을 그대로 둔다.
// 늘 (--from 없이도): 목록의 동작마다 시트를 확인하고 (그림 크기 = count × w by h, 아니면 오류), v = 시트 sha1 앞 8자 (?v=),
//   foot0X = 첫 칸의 발 가운데 (아래 6% 줄의 불투명 픽셀 x 평균 — tools/sprites.mjs footX 와 같은 규칙. 화면은 이 점 (foot0X, footY) 을 선수 자리에
//   맞춘다 — 정지 스프라이트 ↔ 동작 첫 칸 (준비 자세) 이 옆으로 튀지 않게. 달리는 반복 run · dribble 은 footX = video2sprite 가 프레임을 맞춘
//   몸통 가운데 — js/ui/spriteAnim.js) 를 다시 적고,
//   data/sprites.json chars[id].anim = 'img/sprites/anim/<id>.json' 을 단다 (그 캐릭터의 정지 스프라이트 항목이 있어야 한다 — tools/sprites.mjs 먼저).
// Chrome 경로: CHROME_PATH → 기본 설치 경로 (tools/shot.mjs findBrowser). 결과물 (img/sprites/anim · data/sprites.json) 을 커밋한다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { findBrowser, startServer } from "./shot.mjs";
import { ANIM_ACTIONS } from "../js/ui/spriteAnim.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = path.join(ROOT, "img", "sprites", "anim");
const SPRITES = path.join(ROOT, "data", "sprites.json");
const MODES = new Set(["loop", "once", "hold"]);

function parseArgs(argv) {
  const o = { id: null, from: null, map: {}, source: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") o.from = argv[++i];
    else if (a === "--map") {
      for (const kv of String(argv[++i] || "").split(",").filter(Boolean)) {
        const [k, v] = kv.split("=").map((s) => s.trim());
        if (!ANIM_ACTIONS.includes(k) || !v) throw new Error(`--map 은 동작=파일 (동작: ${ANIM_ACTIONS.join(", ")})`);
        o.map[k] = v;
      }
    } else if (a === "--source") o.source = argv[++i];
    else if (!a.startsWith("--") && !o.id) o.id = a;
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (!o.id || !/^[A-Za-z0-9_-]+$/.test(o.id)) throw new Error("usage: sprite_anim.mjs <캐릭터 id> [--from <폴더>] [--map 동작=파일,…] [--source 설명]");
  return o;
}

/* 페이지 쪽 (puppeteer evaluate — 바깥 변수를 쓰지 않는다): 시트 크기 · 첫 칸의 발 가운데 */
async function pageFoot(url, w, h) {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(im, 0, 0, w, h, 0, 0, w, h);
  const p = g.getImageData(0, 0, w, h).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p[(y * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { nw: im.naturalWidth, nh: im.naturalHeight, foot0X: null };
  const band = Math.max(4, Math.round((y1 - y0) * 0.06));
  let s = 0, n = 0;
  for (let y = y1 - band; y <= y1; y++) for (let x = x0; x <= x1; x++) if (p[(y * w + x) * 4 + 3] > 128) { s += x; n++; }
  // 칸 안 좌표 (왼쪽 끝 0) — tools/sprites.mjs footX 와 같은 셈 (픽셀 번호의 평균)
  return { nw: im.naturalWidth, nh: im.naturalHeight, foot0X: n ? s / n : null };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const file = path.join(OUT_DIR, `${o.id}.json`);
  const sprites = JSON.parse(fs.readFileSync(SPRITES, "utf8"));
  if (!sprites.chars || !sprites.chars[o.id]) throw new Error(`data/sprites.json 에 ${o.id} 정지 스프라이트가 없다 — tools/sprites.mjs 먼저`);
  const man = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { version: 1, id: o.id, anims: {} };
  man.anims = man.anims && typeof man.anims === "object" ? man.anims : {};
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (o.from) {
    for (const act of ANIM_ACTIONS) {
      const name = o.map[act] || act;
      const src = path.join(o.from, `${name}.webp`);
      const info = path.join(o.from, `${name}.json`);
      if (!fs.existsSync(src) || !fs.existsSync(info)) continue;
      const j = JSON.parse(fs.readFileSync(info, "utf8"));
      const mode = j.trim && MODES.has(j.trim.mode) ? j.trim.mode : "loop";
      fs.copyFileSync(src, path.join(OUT_DIR, `${o.id}.${act}.webp`));
      man.anims[act] = { mode, fps: j.fps, count: j.count, w: j.w, h: j.h, footX: j.footX, footY: j.footY };
      console.log(`${act}: ${path.relative(ROOT, src)} → img/sprites/anim/${o.id}.${act}.webp (${mode} · ${j.count}칸 · ${j.fps}fps)`);
    }
  }
  if (o.source) man.source = o.source;
  const acts = ANIM_ACTIONS.filter((a) => man.anims[a]);
  if (!acts.includes("idle")) throw new Error("idle 동작이 없다 (화면은 idle 이 없는 목록을 쓰지 않는다)");
  const server = await startServer(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const require = createRequire(path.join(ROOT, "package.json"));
  const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;
  const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true });
  const anims = {};
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
    for (const act of acts) {
      const a = man.anims[act];
      const sheet = path.join(OUT_DIR, `${o.id}.${act}.webp`);
      if (!fs.existsSync(sheet)) throw new Error(`시트 없음: img/sprites/anim/${o.id}.${act}.webp`);
      if (!MODES.has(a.mode) || !(a.fps > 0) || !Number.isInteger(a.count) || !(a.w > 0) || !(a.h > 0)) throw new Error(`${act}: mode · fps · count · w · h 가 이상하다`);
      const v = crypto.createHash("sha1").update(fs.readFileSync(sheet)).digest("hex").slice(0, 8);
      const r = await page.evaluate(pageFoot, `${base}/img/sprites/anim/${o.id}.${act}.webp?v=${v}`, a.w, a.h);
      if (r.nw !== a.count * a.w || r.nh !== a.h) throw new Error(`${act}: 시트 ${r.nw}×${r.nh} ≠ ${a.count} × ${a.w} by ${a.h}`);
      const foot0X = r.foot0X == null ? a.footX : Math.round(r.foot0X * 10) / 10;
      anims[act] = { mode: a.mode, fps: a.fps, count: a.count, w: a.w, h: a.h, footX: a.footX, footY: a.footY, foot0X, v };
      console.log(`${act}: ${a.mode} ${a.count}칸 ${a.w}×${a.h} footX ${a.footX} → foot0X ${foot0X} (${(foot0X - a.footX >= 0 ? "+" : "")}${Math.round((foot0X - a.footX) * 10) / 10}) v ${v}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  const out = { version: man.version || 1, id: o.id, ...(man.source ? { source: man.source } : {}), anims };
  fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
  sprites.chars[o.id] = { ...sprites.chars[o.id], anim: `img/sprites/anim/${o.id}.json` };
  fs.writeFileSync(SPRITES, `${JSON.stringify(sprites, null, 2)}\n`);
  console.log(`img/sprites/anim/${o.id}.json: 동작 ${acts.length}개 · data/sprites.json chars.${o.id}.anim`);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
