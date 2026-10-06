#!/usr/bin/env node
// tools/video2sprite.mjs — 동작 영상 (시댄스 · 단색 배경) → 스프라이트 시트 (가로 띠 WebP) + 정보 JSON + 검토 그림 (docs/SPRITE_25D_PLAN.md 동작 단계).
// npm test 에는 넣지 않는다.
//
//   node tools/video2sprite.mjs <in.mp4> <outBase> [--fps 12] [--height 240] [--loop] [--trim loop|once|hold] [--from 0] [--to 영상끝]
//
// 1) ffmpeg 로 --fps 간격 PNG 프레임을 뽑는다 (헤드리스 크롬의 <video> seek 는 첫 프레임만 돌려줘서 쓰지 않는다).
//    ffmpeg 경로: 환경변수 FFMPEG_PATH → PATH 의 ffmpeg. 프레임은 크롬 캔버스로 읽는다.
// 2) 크로마키: 네 모서리 평균으로 배경색 (초록 / 자홍) 을 정하고 tools/sprites.mjs 와 같은 식 (배경색 계열 정도 → 알파, 반투명 가장자리 어둡게).
// 3) 크기 고정: 첫 프레임의 캐릭터 키 (불투명 상자 높이) → 높이 --height 가 되게 하는 배율을 모든 프레임에 같이 쓴다 (자세가 바뀌어도 크기가 흔들리지 않게).
// 4) 제자리 맞춤: 프레임마다 몸통 가운데 x (불투명 상자 위 20 ~ 60% 줄의 불투명 픽셀 x 평균) 를 첫 프레임 값에 맞춰 옮긴다 (영상이 옆으로 흘러도 제자리).
//    세로는 옮기지 않는다 (카메라 고정 가정 — 땅 = 첫 프레임 발 끝).
// 5) --loop: 끝 프레임이 첫 프레임과 거의 같으면 (첫 = 끝 프레임 지정 영상) 마지막 한 장을 뺀다 (이어 붙일 때 같은 그림이 두 번 나오지 않게).
// 6) 출력: <outBase>.webp (프레임 가로 띠), <outBase>.json { fps, count, w, h, footX, footY, scale, src }, <outBase>_sheet.png (검토용 — 원본 크기 띠 + 잔디 위 64px · 128px)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { findBrowser, startServer } from "./shot.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function parseArgs(argv) {
  const o = { fps: 12, height: 240, loop: false, from: 0, to: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--fps") o.fps = Number(argv[++i]);
    else if (a === "--height") o.height = Number(argv[++i]);
    else if (a === "--loop") o.loop = true;
    else if (a === "--trim") o.trim = argv[++i];
    else if (a === "--max") o.max = Number(argv[++i]);
    else if (a === "--from") o.from = Number(argv[++i]);
    else if (a === "--to") o.to = Number(argv[++i]);
    else pos.push(a);
  }
  [o.input, o.outBase] = pos;
  if (!o.input || !o.outBase) throw new Error("usage: video2sprite.mjs <in.mp4> <outBase> [--fps 12] [--height 240] [--loop]");
  return o;
}

/* 페이지 쪽 (바깥 변수 없음) */
async function pageRun(srcs, opt) {
  const first = new Image(); first.src = srcs[0]; await first.decode();
  const W = first.naturalWidth, H = first.naturalHeight, dur = srcs.length / opt.fps;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  const frames = [];
  let key = null, green = false;
  for (let fi = 0; fi < srcs.length; fi++) {
    const t = +(fi / opt.fps).toFixed(4);
    const im = new Image(); im.src = srcs[fi]; await im.decode();
    x.clearRect(0, 0, W, H);
    x.drawImage(im, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H), p = d.data;
    if (!key) {
      const at = (xx, yy) => { const i = (yy * W + xx) * 4; return [p[i], p[i + 1], p[i + 2]]; };
      const cs = [at(4, 4), at(W - 5, 4), at(4, H - 5), at(W - 5, H - 5)];
      key = [0, 1, 2].map((j) => cs.reduce((s, q) => s + q[j], 0) / 4);
      green = key[1] > key[0] && key[1] > key[2];
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      const keyness = green ? (g - Math.max(r, b)) / 255 : (Math.min(r, b) - g) / 255;
      const a = Math.max(0, Math.min(1, 1 - (keyness - 0.12) / 0.3));
      if (a < 1) { p[i] *= 0.45; p[i + 1] *= 0.45; p[i + 2] *= 0.45; }
      p[i + 3] = Math.round(a * 255);
      if (a > 0.5) { const n = i / 4, xx = n % W, yy = (n / W) | 0; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    }
    if (x1 < 0) { frames.push(null); continue; }
    // 몸통 가운데 x: 상자 위 20 ~ 60% 줄
    let sx = 0, n = 0;
    const ya = Math.round(y0 + (y1 - y0) * 0.2), yb = Math.round(y0 + (y1 - y0) * 0.6);
    for (let yy = ya; yy <= yb; yy++) for (let xx = x0; xx <= x1; xx++) if (p[(yy * W + xx) * 4 + 3] > 128) { sx += xx; n++; }
    const fc = document.createElement("canvas"); fc.width = W; fc.height = H;
    fc.getContext("2d").putImageData(d, 0, 0);
    frames.push({ t, canvas: fc, box: [x0, y0, x1, y1], cx: n ? sx / n : (x0 + x1) / 2 });
  }
  const good = frames.filter(Boolean);
  if (!good.length) throw new Error("캐릭터가 보이는 프레임이 없다");
  const f0 = good[0];
  const scale = opt.height / (f0.box[3] - f0.box[1] + 1);
  const ground = f0.box[3];
  for (const f of good) f.dx = f0.cx - f.cx;
  // --trim: 작은 그림 (몸통 맞춤 · 어두운 바탕 48²) 끼리의 차이로 쓸 구간만 남긴다
  //   loop = 첫 프레임과 가장 닮은 뒤 프레임 p (6 ~ 36) 까지 한 바퀴 [0, p)
  //   once = 첫 프레임 (기본 자세) 과 다른 프레임만 (앞뒤 2장 여유) — 한 번 하고 돌아오는 동작
  //   hold = 움직이기 시작한 곳부터, 마지막으로 움직인 곳 (+2) 까지 — 끝 자세가 다른 동작 (넘어짐 · 세리머니)
  const thumb = (f) => {
    const c2 = document.createElement("canvas"); c2.width = 48; c2.height = 48;
    const q = c2.getContext("2d"); q.fillStyle = "#000"; q.fillRect(0, 0, 48, 48);
    q.drawImage(f.canvas, f.dx * 48 / W, 0, 48, 48);
    return q.getImageData(0, 0, 48, 48).data;
  };
  const dif = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (48 * 48 * 3 * 255); };
  let trimInfo = null;
  if (opt.trim && good.length > 6) {
    const th = good.map(thumb);
    const n = good.length;
    if (opt.trim === "loop") {
      // 처음 (서 있는 자세에서 출발) 은 빼고 가운데 쯤 m 부터: 세 장씩 비교해 가장 닮은 주기 p (6 ~ 24) — [m, m + p) 한 바퀴
      const m = Math.floor(n / 3);
      let best = -1, bd = Infinity;
      for (let q = 6; q <= Math.min(24, n - m - 3); q++) {
        let d = 0; for (let k = 0; k < 3; k++) d += dif(th[m + k], th[m + k + q]);
        d /= 3;
        if (d < bd - 1e-4) { bd = d; best = q; }
      }
      if (best < 0) best = Math.min(12, n - m);
      good.splice(m + best); good.splice(0, m);
      trimInfo = { mode: "loop", from: m, period: best, diff: +bd.toFixed(4) };
    } else {
      const act = th.map((t) => dif(th[0], t));
      const mx = Math.max(...act);
      const thr = Math.max(0.02, mx * 0.4);
      let a0 = act.findIndex((v) => v > thr);
      if (a0 < 0) a0 = 0;
      let a1 = n - 1;
      if (opt.trim === "once") { for (let i = n - 1; i >= 0; i--) if (act[i] > thr) { a1 = i; break; } }
      else { // hold: 마지막으로 움직인 프레임 (앞 프레임과 차이)
        const step = th.map((t, i) => (i ? dif(th[i - 1], t) : 0));
        const sm = Math.max(...step) * 0.15;
        for (let i = n - 1; i > a0; i--) if (step[i] > sm) { a1 = i; break; }
      }
      const st = Math.max(0, a0 - 2), en = Math.min(n - 1, a1 + 2);
      good.splice(en + 1); good.splice(0, st);
      trimInfo = { mode: opt.trim, from: st, to: en, thr: +thr.toFixed(4) };
    }
  }
  // --max N: 남긴 프레임을 고르게 N 장까지 솎는다 (한 번 하는 동작을 경기 액션 길이 ~0.8초에 맞추기 — 첫 · 끝 장은 남긴다)
  if (opt.max && good.length > opt.max) {
    const n = good.length, keep = [];
    for (let i = 0; i < opt.max; i++) keep.push(good[Math.round(i * (n - 1) / (opt.max - 1))]);
    good.splice(0, n, ...keep);
    if (trimInfo) trimInfo.thinned = `${n}→${opt.max}`;
  }
  // 프레임마다 x 이동 (몸통 가운데를 첫 프레임에 맞춤) 뒤 전체 상자 (남긴 프레임만)
  let ux0 = 1e9, uy0 = 1e9, ux1 = -1e9, uy1 = -1e9;
  for (const f of good) {
    ux0 = Math.min(ux0, f.box[0] + f.dx); ux1 = Math.max(ux1, f.box[2] + f.dx);
    uy0 = Math.min(uy0, f.box[1]); uy1 = Math.max(uy1, f.box[3]);
  }
  uy1 = Math.max(uy1, ground);
  const pad = 2;
  const fw = Math.ceil((ux1 - ux0 + 1) * scale) + pad * 2, fh = Math.ceil((uy1 - uy0 + 1) * scale) + pad * 2;
  let list = good;
  let loopDiff = null;
  if (opt.loop && !opt.trim && good.length > 3) {
    // 끝 프레임 ~ 첫 프레임 차이 (작은 그림으로) — 거의 같으면 끝 한 장을 뺀다
    const small = (f) => { const s = document.createElement("canvas"); s.width = 48; s.height = 48; s.getContext("2d").drawImage(f.canvas, 0, 0, W, H, 0, 0, 48, 48); return s.getContext("2d").getImageData(0, 0, 48, 48).data; };
    const a = small(good[0]), b = small(good[good.length - 1]);
    let diff = 0; for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    loopDiff = diff / (48 * 48 * 3 * 255);
    if (loopDiff < 0.04) list = good.slice(0, -1);
  }
  const sheet = document.createElement("canvas"); sheet.width = fw * list.length; sheet.height = fh;
  const g = sheet.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  list.forEach((f, i) => {
    g.drawImage(f.canvas, 0, 0, W, H, i * fw + pad + (f.dx - ux0) * scale, pad - uy0 * scale, W * scale, H * scale);
  });
  const blob = await new Promise((r) => sheet.toBlob(r, "image/webp", 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  // 검토 그림: 위 = 시트 (최대 폭 1600 으로 줄임), 아래 = 잔디 위 프레임들 64px · 128px
  const rv = document.createElement("canvas");
  const rowH = 150, thumbs = Math.min(list.length, 24);
  const sw = Math.min(1600, sheet.width), sh = Math.round(sheet.height * sw / sheet.width);
  rv.width = Math.max(sw, thumbs * 70 + 20); rv.height = sh + rowH * 2 + 20;
  const r = rv.getContext("2d");
  r.fillStyle = "#1d1d22"; r.fillRect(0, 0, rv.width, rv.height);
  r.drawImage(sheet, 0, 0, sw, sh);
  for (const [row, hh] of [[0, 64], [1, 128]]) {
    const y = sh + 10 + row * rowH;
    r.fillStyle = "#235f36"; r.fillRect(0, y, rv.width, rowH - 6);
    const k = hh / (fh - pad * 2);
    for (let i = 0; i < thumbs; i++) {
      const xx = 10 + i * (row ? 130 : 66);
      if (xx + fw * k > rv.width) break;
      r.drawImage(sheet, i * fw, 0, fw, fh, xx, y + rowH - 12 - fh * k, fw * k, fh * k);
    }
  }
  const rb = await new Promise((rr) => rv.toBlob(rr, "image/png"));
  const rbuf = new Uint8Array(await rb.arrayBuffer());
  let rs = ""; for (let i = 0; i < rbuf.length; i += 0x8000) rs += String.fromCharCode.apply(null, rbuf.subarray(i, i + 0x8000));
  return {
    webp: btoa(s), review: btoa(rs),
    info: { fps: opt.fps, count: list.length, trim: trimInfo, w: fw, h: fh, footX: +((f0.cx - ux0) * scale + pad).toFixed(1), footY: +((ground - uy0) * scale + pad).toFixed(1), scale: +scale.toFixed(4), video: { w: W, h: H, duration: +dur.toFixed(3) }, loopDiff: loopDiff == null ? null : +loopDiff.toFixed(4), key: green ? "green" : "magenta" },
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const abs = path.resolve(o.input);
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  // ffmpeg 로 프레임 뽑기 (임시 폴더 — 끝나면 지운다)
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v2s-"));
  const ss = o.from ? ["-ss", String(o.from)] : [];
  const tt = o.to != null ? ["-to", String(o.to)] : [];
  const r = spawnSync(ffmpeg, ["-v", "error", ...ss, ...tt, "-i", abs, "-vf", `fps=${o.fps}`, path.join(tmp, "f%04d.png")], { encoding: "utf8" });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg 실패 (${ffmpeg}): ${(r.error && r.error.message) || r.stderr}`);
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
  if (!files.length) throw new Error("뽑힌 프레임이 없다");
  const srcs = files.map((f) => `data:image/png;base64,${fs.readFileSync(path.join(tmp, f)).toString("base64")}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const server = await startServer(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  const require = createRequire(path.join(ROOT, "package.json"));
  const puppeteer = (await import(pathToFileURL(require.resolve("puppeteer-core")).href)).default;
  const browser = await puppeteer.launch({ executablePath: findBrowser().path, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/index.html`, { waitUntil: "domcontentloaded" });
    const res = await page.evaluate(pageRun, srcs, { fps: o.fps, height: o.height, loop: o.loop, trim: o.trim || null, max: o.max || 0 });
    fs.mkdirSync(path.dirname(path.resolve(o.outBase)), { recursive: true });
    fs.writeFileSync(`${o.outBase}.webp`, Buffer.from(res.webp, "base64"));
    fs.writeFileSync(`${o.outBase}_sheet.png`, Buffer.from(res.review, "base64"));
    fs.writeFileSync(`${o.outBase}.json`, `${JSON.stringify({ ...res.info, src: rel }, null, 2)}\n`);
    console.log(`${o.outBase}: ${res.info.count}프레임 ${res.info.w}×${res.info.h} (fps ${o.fps}, 영상 ${res.info.video.w}×${res.info.video.h} ${res.info.video.duration}s, 배경 ${res.info.key}${res.info.loopDiff != null ? `, 끝↔처음 차이 ${res.info.loopDiff}` : ""})`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
