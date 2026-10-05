#!/usr/bin/env node
// tools/portraits.mjs — 일러스트 원본 (art/) → 화면용 작은 WebP (img/) + 목록 data/portraits.json (LESSON_PROTO_PLAN §24.12.1). npm test 에는 넣지 않는다.
//
//   node tools/portraits.mjs [--only id,id] [--sheet sheet.png] [--sheet-only]
//
// 1) art/portraits.json (손으로 고치는 자르기 명세 — art/ 는 배포에서 빠진다) 을 읽는다.
//    선수 (chars, 키 = data/characters.json id) · 코치 (coaches, 키 = data/supports.json id) 마다 얼굴 중심 x · y 와 머리 높이 head (원본 px).
//    프리셋 (face · bust · half) 은 head 의 배수다: 자르는 칸 = w·head × h·head, 가운데 = x, 위 끝 = y − top·head.
//    항목에 프리셋 이름으로 { dx, dy, scale } 을 주면 그 프리셋만 덮어쓴다 — 가운데 x + dx, 위 끝 y + dy − top·head·scale, 칸 크기 × scale.
//    칸이 원본 밖으로 나가면 안으로 밀어 넣는다 (빈 칸을 채우지 않는다). 칸이 원본보다 크면 비율을 지킨 채 줄인다 (경고).
//    배경 (scenes, A2) 은 { file, out, quality } — 원본을 out 비율로 가운데 잘라 out 크기로 줄인다.
//    자르기 전에 명세를 검사한다 (specErrors — head 양수 · x · y 원본 안 · 덮어쓰기 키는 dx · dy · scale 만).
//    head 는 "머리 크기 눈금" 이다 (얼굴 원이 고르게 차도록 맞춘 값 — 실제 정수리 ~ 턱보다 작다). x · y = 얼굴 가운데 (두 눈 사이 조금 아래).
//    흉상은 프리셋 그대로면 허리까지 내려가므로 항목마다 "bust": { "dy": −0.12·head, "scale": 0.8 } 로 머리 ~ 가슴에 맞췄다 (코니는 귀까지 넣느라 더 위).
// 2) tools/shot.mjs 의 startServer · findBrowser + puppeteer-core 로 원본 PNG 를 같은 origin 에서 열고 canvas 로 잘라
//    toBlob('image/webp', quality) 로 img/portraits/<dataId>.<face|bust|half>.webp · img/scenes/<id>.webp 에 쓴다.
// 3) data/portraits.json = { version: 1, presets: { face: [w, h], … }, chars: { id: { v } }, coaches: { id: { v } }, scenes: { id: { v } } }.
//    v = 출력 파일 sha1 앞 8자 (선수 · 코치는 face · bust · half 세 파일을 이 순서로 이어 붙인 sha1) — 화면은 주소 뒤 ?v= 로 붙여 Pages 캐시를 피한다.
//    목록은 art/portraits.json 의 모든 항목을 디스크의 파일로 다시 만든다 (--only 로 일부만 다시 잘라도 목록은 전체).
// 4) --only a,b  = 그 항목만 다시 자른다 (data id 또는 원본 파일 이름 — 예: ch_giant_keeper · herta · sp_coach_harr · harr).
//    --sheet <png> = 검토용 한 장: 원본 위 자르는 칸 (노랑 얼굴 · 하늘 흉상 · 분홍 반신) · 얼굴 128 · 64 · 40 · 22 원형 · 흉상 · 반신.
//                    30px 이하 원은 화면처럼 그림을 1.2배 당긴다 (§24.12.3). --only 가 있으면 그 항목만.
//    --sheet-only  = 자르지 않고 디스크의 파일로 검토 한 장만 만든다 (목록도 쓰지 않는다).
// Chrome 경로: CHROME_PATH 환경변수 → 기본 설치 경로 (tools/shot.mjs findBrowser). 결과물 (img/ · data/portraits.json) 을 커밋한다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SPEC_FILE = path.join(ROOT, "art", "portraits.json");
export const MANIFEST_FILE = path.join(ROOT, "data", "portraits.json");
export const PORTRAIT_DIR = path.join(ROOT, "img", "portraits");
export const SCENE_DIR = path.join(ROOT, "img", "scenes");
/** 선수 · 코치 그림 세 가지 (목록 presets 순서 = 파일 이름 · sha1 을 이어 붙이는 순서) */
export const PRESET_NAMES = ["face", "bust", "half"];
const GROUPS = ["chars", "coaches"];

/* ------------------------------------------------------------------ */
/* 순수 함수 (테스트가 쓴다)                                               */
/* ------------------------------------------------------------------ */

/**
 * 자르는 칸 (원본 px, 정수). 원본 밖이면 안으로 민다 · 원본보다 크면 비율을 지켜 줄인다.
 * @param {{ x: number, y: number, head: number, [preset: string]: any }} entry art/portraits.json 의 선수 · 코치 항목
 * @param {string} presetName face | bust | half
 * @param {{ w: number, h: number, top: number }} preset
 * @param {[number, number]} src 원본 크기 [폭, 높이]
 * @returns {{ sx: number, sy: number, sw: number, sh: number, shifted: boolean, shrunk: boolean }}
 */
export function cropBox(entry, presetName, preset, src) {
  const o = (entry && entry[presetName]) || {};
  const scale = o.scale ?? 1;
  const head = entry.head * scale;
  let w = preset.w * head;
  let h = preset.h * head;
  const cx = entry.x + (o.dx || 0);
  let top = entry.y + (o.dy || 0) - preset.top * head;
  let shrunk = false;
  const k = Math.min(1, src[0] / w, src[1] / h);
  if (k < 1) {
    // 칸이 원본보다 크다 → 가운데 · 위 끝 비율을 지킨 채 줄인다
    top += (h - h * k) * (preset.top / preset.h);
    w *= k;
    h *= k;
    shrunk = true;
  }
  const sw = Math.min(src[0], Math.round(w));
  const sh = Math.min(src[1], Math.round(h));
  const want = [Math.round(cx - w / 2), Math.round(top)];
  const sx = Math.max(0, Math.min(src[0] - sw, want[0]));
  const sy = Math.max(0, Math.min(src[1] - sh, want[1]));
  return { sx, sy, sw, sh, shifted: sx !== want[0] || sy !== want[1], shrunk };
}

/**
 * art/portraits.json 검사 → 오류 문장 목록 (빈 배열 = 통과). 도구가 자르기 전에, 테스트가 명세에 쓴다.
 * @param {object} spec
 * @returns {string[]}
 */
export function specErrors(spec) {
  const errs = [];
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  const src = spec && spec.sourceSize;
  if (!Array.isArray(src) || src.length !== 2 || !src.every((v) => num(v) && v > 0)) errs.push("sourceSize = [폭, 높이] 가 아니다");
  for (const p of PRESET_NAMES) {
    const pr = spec && spec.presets && spec.presets[p];
    if (!pr) { errs.push(`presets.${p} 가 없다`); continue; }
    for (const k of ["w", "h", "top"]) if (!num(pr[k]) || pr[k] <= 0) errs.push(`presets.${p}.${k} 는 양수여야 한다`);
    if (!Array.isArray(pr.out) || pr.out.length !== 2 || !pr.out.every((v) => Number.isInteger(v) && v > 0)) errs.push(`presets.${p}.out = [폭, 높이] (정수)`);
    if (!num(pr.quality) || pr.quality <= 0 || pr.quality > 1) errs.push(`presets.${p}.quality 는 0 ~ 1`);
  }
  for (const group of GROUPS) {
    for (const [id, e] of Object.entries((spec && spec[group]) || {})) {
      const where = `${group}.${id}`;
      if (!e || typeof e.file !== "string" || !/\.png$/i.test(e.file)) errs.push(`${where}.file 은 art/ 아래 .png 경로여야 한다`);
      if (!e || !num(e.head) || e.head <= 0) errs.push(`${where}.head 는 양수여야 한다`);
      if (!e || !num(e.x) || !num(e.y) || (src && (e.x < 0 || e.y < 0 || e.x > src[0] || e.y > src[1]))) errs.push(`${where}.x · y 는 원본 안의 수여야 한다`);
      for (const p of PRESET_NAMES) {
        const o = e && e[p];
        if (o === undefined) continue;
        if (!o || typeof o !== "object") { errs.push(`${where}.${p} 는 { dx, dy, scale } 이어야 한다`); continue; }
        for (const k of Object.keys(o)) if (!["dx", "dy", "scale"].includes(k)) errs.push(`${where}.${p}.${k} — dx · dy · scale 만 쓸 수 있다`);
        if (o.dx !== undefined && !num(o.dx)) errs.push(`${where}.${p}.dx 는 수`);
        if (o.dy !== undefined && !num(o.dy)) errs.push(`${where}.${p}.dy 는 수`);
        if (o.scale !== undefined && (!num(o.scale) || o.scale <= 0)) errs.push(`${where}.${p}.scale 은 양수`);
      }
    }
  }
  for (const [id, e] of Object.entries((spec && spec.scenes) || {})) {
    if (!e || typeof e.file !== "string") errs.push(`scenes.${id}.file 이 없다`);
    if (!e || !Array.isArray(e.out) || e.out.length !== 2 || !e.out.every((v) => Number.isInteger(v) && v > 0)) errs.push(`scenes.${id}.out = [폭, 높이] (정수)`);
    if (e && e.quality !== undefined && (!num(e.quality) || e.quality <= 0 || e.quality > 1)) errs.push(`scenes.${id}.quality 는 0 ~ 1`);
  }
  return errs;
}

/** 배경: 원본을 out 비율로 가운데 잘라 낸 칸 (cover). */
export function sceneBox(out, src) {
  const ar = out[0] / out[1];
  let sw = src[0];
  let sh = Math.round(sw / ar);
  if (sh > src[1]) {
    sh = src[1];
    sw = Math.round(sh * ar);
  }
  return { sx: Math.floor((src[0] - sw) / 2), sy: Math.floor((src[1] - sh) / 2), sw, sh, shifted: false, shrunk: false };
}

/** img/ 기준 출력 경로 (ROOT 상대, 슬래시) */
export function portraitPath(id, preset) {
  return `img/portraits/${id}.${preset}.webp`;
}
export function scenePath(id) {
  return `img/scenes/${id}.webp`;
}

/** v = 버퍼들을 이어 붙인 sha1 의 앞 8자 */
export function versionOf(buffers) {
  const h = crypto.createHash("sha1");
  for (const b of buffers) h.update(b);
  return h.digest("hex").slice(0, 8);
}

/** 그룹 → 항목 id → 출력 파일 (ROOT 상대) 목록 */
export function outputsOf(group, id) {
  return group === "scenes" ? [scenePath(id)] : PRESET_NAMES.map((p) => portraitPath(id, p));
}

/**
 * 디스크의 출력 파일로 목록 (data/portraits.json 내용) 을 만든다. 파일이 하나라도 없으면 throw.
 * @param {object} spec art/portraits.json
 * @param {string} [root]
 */
export function buildManifest(spec, root = ROOT) {
  const presets = {};
  for (const p of PRESET_NAMES) presets[p] = spec.presets[p].out.slice();
  const out = { version: 1, presets, chars: {}, coaches: {}, scenes: {} };
  const missing = [];
  for (const group of [...GROUPS, "scenes"]) {
    for (const id of Object.keys(spec[group] || {})) {
      const files = outputsOf(group, id).map((f) => path.join(root, f));
      const lost = files.filter((f) => !fs.existsSync(f));
      if (lost.length) {
        missing.push(...lost.map((f) => path.relative(root, f).replace(/\\/g, "/")));
        continue;
      }
      out[group][id] = { v: versionOf(files.map((f) => fs.readFileSync(f))) };
    }
  }
  if (missing.length) throw new Error(`출력 파일이 없습니다 (먼저 --only 없이 한 번 돌리세요): ${missing.join(", ")}`);
  return out;
}

/** 목록을 짧은 줄로 쓴다 (항목 하나 = 한 줄) */
export function formatManifest(m) {
  const inline = (v) =>
    Array.isArray(v) ? `[${v.map(inline).join(", ")}]`
      : v && typeof v === "object" ? (Object.keys(v).length ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}")
        : JSON.stringify(v);
  const block = (obj) => {
    const keys = Object.keys(obj);
    if (!keys.length) return "{}";
    return `{\n${keys.map((k) => `    ${JSON.stringify(k)}: ${inline(obj[k])}`).join(",\n")}\n  }`;
  };
  return [
    "{",
    `  "version": ${m.version},`,
    `  "presets": ${inline(m.presets)},`,
    `  "chars": ${block(m.chars)},`,
    `  "coaches": ${block(m.coaches)},`,
    `  "scenes": ${block(m.scenes)}`,
    "}",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* 인자                                                                  */
/* ------------------------------------------------------------------ */

export function parseArgs(argv) {
  const out = { only: null, sheet: null, sheetOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") out.only = String(argv[++i] || "").split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--sheet") out.sheet = argv[++i] || null;
    else if (a === "--sheet-only") out.sheetOnly = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  if (out.sheetOnly && !out.sheet) throw new Error("--sheet-only 에는 --sheet <png> 가 필요합니다");
  return out;
}

function usage() {
  return [
    "usage: node tools/portraits.mjs [--only id,id] [--sheet sheet.png] [--sheet-only]",
    "  --only a,b      그 항목만 다시 자른다 (data id 또는 원본 파일 이름: ch_giant_keeper · herta · sp_coach_harr · harr · ground)",
    "  --sheet <png>   검토용 한 장 (원본 위 칸 · 얼굴 128/64/40/22 원 · 흉상 · 반신)",
    "  --sheet-only    자르지 않고 디스크 파일로 검토 한 장만",
    "  환경변수 CHROME_PATH 로 브라우저 실행 파일 지정",
  ].join("\n");
}

/** art/portraits.json → 작업 목록 [{ group, id, file, slug, entry }] (--only 로 거른다) */
export function jobsOf(spec, only = null) {
  const all = [];
  for (const group of [...GROUPS, "scenes"]) {
    for (const [id, entry] of Object.entries(spec[group] || {})) {
      all.push({ group, id, file: entry.file, slug: path.basename(entry.file, path.extname(entry.file)), entry });
    }
  }
  if (!only || !only.length) return all;
  const unknown = only.filter((o) => !all.some((j) => j.id === o || j.slug === o));
  if (unknown.length) throw new Error(`art/portraits.json 에 없는 항목: ${unknown.join(", ")}`);
  return all.filter((j) => only.includes(j.id) || only.includes(j.slug));
}

/* ------------------------------------------------------------------ */
/* 페이지 쪽 코드 (puppeteer evaluate — 바깥 변수를 쓰지 않는다)            */
/* ------------------------------------------------------------------ */

async function pageLoadSource(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  window.__src = img;
  return [img.naturalWidth, img.naturalHeight];
}

async function pageEncode(outs) {
  const img = window.__src;
  const res = [];
  for (const o of outs) {
    const c = document.createElement("canvas");
    c.width = o.out[0];
    c.height = o.out[1];
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, o.sx, o.sy, o.sw, o.sh, 0, 0, o.out[0], o.out[1]);
    const blob = await new Promise((r) => c.toBlob(r, "image/webp", o.quality));
    if (!blob || blob.type !== "image/webp") throw new Error(`webp 인코딩 실패 (${blob && blob.type})`);
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    res.push(btoa(s));
  }
  return res;
}

/* ------------------------------------------------------------------ */
/* 검토 한 장                                                            */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function sheetHtml(base, spec, jobs, info) {
  const T = 160 / spec.sourceSize[0]; // 원본 썸네일 배율 (폭 160)
  const color = { face: "#ffd400", bust: "#38e1ff", half: "#ff4fd8" };
  const cells = jobs.map((j) => {
    const meta = info.get(j.id) || {};
    const ver = `?v=${Date.now()}`;
    const head = `<div class="hd"><b>${esc(meta.name || j.id)}</b> <code>${esc(j.id)}</code> <small>${esc(j.file)}${j.group === "scenes" ? "" : ` · x ${j.entry.x} y ${j.entry.y} head ${j.entry.head}`}</small></div>`;
    if (j.group === "scenes") {
      return `<div class="cell">${head}<div class="row"><img class="scene" src="${base}/${scenePath(j.id)}${ver}"></div></div>`;
    }
    const src = spec.sourceSize;
    const boxes = PRESET_NAMES.map((p) => {
      const b = cropBox(j.entry, p, spec.presets[p], src);
      return `<i style="left:${b.sx * T}px;top:${b.sy * T}px;width:${b.sw * T}px;height:${b.sh * T}px;border-color:${color[p]}"></i>`;
    }).join("");
    const face = `${base}/${portraitPath(j.id, "face")}${ver}`;
    const av = (s) => `<span class="av" style="width:${s}px;height:${s}px;background:${esc(meta.color || "#666")}"><img src="${face}" style="${s <= 30 ? "transform:scale(1.2)" : ""}"></span>`;
    return `<div class="cell">${head}<div class="row">
      <div class="src"><img src="${base}/art/${encodeURI(j.file)}">${boxes}</div>
      <div class="faces">${av(128)}<div class="small">${av(64)}${av(40)}${av(22)}</div></div>
      <img class="bust" src="${base}/${portraitPath(j.id, "bust")}${ver}">
      <img class="half" src="${base}/${portraitPath(j.id, "half")}${ver}">
    </div></div>`;
  });
  const n = jobs.length;
  const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  return `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 8px; background: #1b1b20; color: #eee; font: 13px/1.3 system-ui, "Malgun Gothic", sans-serif; }
    .grid { display: grid; grid-template-columns: repeat(${cols}, max-content); gap: 8px; }
    .cell { background: #2a2a31; padding: 6px 8px 8px; border-radius: 6px; }
    .hd { margin-bottom: 4px; white-space: nowrap; } .hd code { color: #9cf; } .hd small { color: #aaa; }
    .row { display: flex; gap: 8px; align-items: flex-start; }
    .src { position: relative; width: 160px; height: 240px; overflow: hidden; }
    .src img { width: 160px; height: 240px; display: block; }
    .src i { position: absolute; border: 2px solid; box-sizing: border-box; }
    .faces { display: flex; flex-direction: column; gap: 8px; align-items: center; width: 132px; }
    .small { display: flex; gap: 8px; align-items: center; }
    .av { display: inline-block; position: relative; border-radius: 50%; overflow: hidden; flex: none; }
    .av img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }
    .bust { width: 192px; height: 240px; } .half { width: 160px; height: 240px; } .scene { width: 480px; height: 320px; }
  </style><div class="grid">${cells.join("")}</div>`;
}

async function writeSheet(browser, base, spec, jobs, info, outFile) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 400, deviceScaleFactor: 1 });
    await page.goto(`${base}/art/portraits.json`);
    await page.setContent(sheetHtml(base, spec, jobs, info), { waitUntil: "load" });
    const failed = await page.evaluate(async () => {
      const imgs = [...document.images];
      await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
      return imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute("src"));
    });
    if (failed.length) throw new Error(`검토 한 장: 그림을 못 불렀다 ${failed.join(", ")}`);
    const size = await page.evaluate(() => {
      const g = document.querySelector(".grid");
      return [Math.ceil(g.scrollWidth + 16), Math.ceil(document.documentElement.scrollHeight)];
    });
    await page.setViewport({ width: size[0], height: size[1], deviceScaleFactor: 1 });
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    await page.screenshot({ path: path.resolve(outFile), fullPage: true });
    console.log(`· 검토 한 장 ${path.resolve(outFile)} (${size[0]}×${size[1]})`);
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* 실행                                                                  */
/* ------------------------------------------------------------------ */

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

function readJson(f) {
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

/** 이름 · 색 (검토 한 장 · 경고용) */
function entityInfo() {
  const info = new Map();
  const chars = readJson(path.join(ROOT, "data", "characters.json"));
  const sups = readJson(path.join(ROOT, "data", "supports.json"));
  for (const c of chars) info.set(c.id, { name: c.name, color: c.portraitColor, group: "chars" });
  for (const s of sups) info.set(s.id, { name: s.name, color: s.portraitColor, group: "coaches" });
  return info;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error(usage());
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    console.log(usage());
    return;
  }
  const spec = readJson(SPEC_FILE);
  const bad = specErrors(spec);
  if (bad.length) {
    console.error(`art/portraits.json 오류:\n  ${bad.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  const info = entityInfo();
  for (const [id, meta] of info) {
    if (!spec[meta.group] || !spec[meta.group][id]) console.warn(`경고: ${id} (${meta.name}) 가 art/portraits.json ${meta.group} 에 없다`);
  }
  let jobs;
  try {
    jobs = jobsOf(spec, args.only);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return;
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e) {
    console.log("puppeteer-core 를 불러올 수 없습니다 — 프로젝트 루트에서 `npm i` 후 다시 실행하세요.");
    process.exitCode = 1;
    return;
  }
  const { startServer, findBrowser } = await import("./shot.mjs");
  const browserInfo = findBrowser();
  if (!browserInfo) {
    console.log("Chrome/Edge 실행 파일을 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.");
    process.exitCode = 1;
    return;
  }

  const server = await startServer(ROOT);
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: browserInfo.path,
      headless: true,
      args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions"],
    });
    if (!args.sheetOnly) {
      const page = await browser.newPage();
      await page.goto(`${base}/art/portraits.json`); // 같은 origin (canvas 가 더럽혀지지 않게)
      fs.mkdirSync(PORTRAIT_DIR, { recursive: true });
      const totals = { chars: 0, coaches: 0, scenes: 0 };
      for (const j of jobs) {
        const src = await page.evaluate(pageLoadSource, `${base}/art/${encodeURI(j.file)}`);
        if (j.group !== "scenes" && (src[0] !== spec.sourceSize[0] || src[1] !== spec.sourceSize[1])) {
          console.warn(`경고: ${j.file} 크기 ${src.join("×")} ≠ sourceSize ${spec.sourceSize.join("×")} — 실제 크기로 자른다`);
        }
        const outs = j.group === "scenes"
          ? [{ name: null, ...sceneBox(j.entry.out, src), out: j.entry.out, quality: j.entry.quality ?? 0.8, path: scenePath(j.id) }]
          : PRESET_NAMES.map((p) => ({ name: p, ...cropBox(j.entry, p, spec.presets[p], src), out: spec.presets[p].out, quality: spec.presets[p].quality, path: portraitPath(j.id, p) }));
        const b64 = await page.evaluate(pageEncode, outs.map(({ sx, sy, sw, sh, out, quality }) => ({ sx, sy, sw, sh, out, quality })));
        const parts = [];
        let sum = 0;
        outs.forEach((o, i) => {
          const buf = Buffer.from(b64[i], "base64");
          const file = path.join(ROOT, o.path);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, buf);
          sum += buf.length;
          const note = o.shrunk ? " (칸 줄임)" : o.shifted ? " (안으로 밈)" : "";
          parts.push(`${o.name || "scene"} ${kb(buf.length)}${note}`);
        });
        totals[j.group] += sum;
        console.log(`  ${j.id.padEnd(20)} ${parts.join(" · ")}  = ${kb(sum)}`);
      }
      await page.close();
      const manifest = buildManifest(spec);
      fs.writeFileSync(MANIFEST_FILE, formatManifest(manifest));
      console.log(`· 이번에 자른 크기: 선수 ${kb(totals.chars)} · 코치 ${kb(totals.coaches)} · 배경 ${kb(totals.scenes)}`);
      // 디스크 전체 (목록의 모든 파일)
      const disk = { chars: 0, coaches: 0, scenes: 0 };
      for (const group of [...GROUPS, "scenes"]) {
        for (const id of Object.keys(manifest[group])) for (const f of outputsOf(group, id)) disk[group] += fs.statSync(path.join(ROOT, f)).size;
      }
      const all = disk.chars + disk.coaches + disk.scenes;
      console.log(`· 전체 (img/): 선수 ${Object.keys(manifest.chars).length}명 ${kb(disk.chars)} · 코치 ${Object.keys(manifest.coaches).length}명 ${kb(disk.coaches)} · 배경 ${Object.keys(manifest.scenes).length}장 ${kb(disk.scenes)} = ${(all / 1024 / 1024).toFixed(2)}MB`);
      console.log(`· 목록 ${path.relative(ROOT, MANIFEST_FILE).replace(/\\/g, "/")}`);
    }
    if (args.sheet) await writeSheet(browser, base, spec, jobs, info, args.sheet);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
  }
}

function isEntry() {
  try {
    return path.resolve(process.argv[1] || "").toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
  } catch {
    return false;
  }
}

if (isEntry()) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exitCode = 1;
  });
}
