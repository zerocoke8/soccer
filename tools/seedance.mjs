#!/usr/bin/env node
// tools/seedance.mjs — BytePlus ModelArk 시댄스 (Dreamina Seedance) 이미지 → 영상 (docs/SPRITE_25D_PLAN.md — 동작 영상 단계). npm test 에는 넣지 않는다.
//
//   node tools/seedance.mjs --first <png> [--last <png>] --prompt <txt 파일 또는 문장> --out <mp4>
//                           [--model dreamina-seedance-2-5-260628] [--resolution 480p] [--ratio 16:9 (첫 프레임이 없을 때만)] [--duration 4] [--seed N] [--dry]
//
// - API 키: 환경변수 SEEDANCE_KEY 또는 파일 %USERPROFILE%\.seedance_key\key.txt (또는 %USERPROFILE%\.seedance_key 파일). 화면 · 로그 · 파일에 키를 쓰지 않는다.
// - 흐름: POST {BASE}/contents/generations/tasks (content = 글 + first_frame · last_frame 이미지 data URL) → 10초마다 GET tasks/{id}
//   → succeeded 면 content.video_url 을 받아 --out 에 저장, 같은 이름 .json 에 요청 값 · 작업 id · 상태 · usage 를 남긴다.
// - 소리 끔 (generate_audio false), 워터마크 끔. 첫 = 끝 프레임이면 반복 동작 (대기 · 제자리 달리기) 에 쓴다.
// - --dry = 요청 본문 (이미지 줄임) 만 보여 주고 보내지 않는다 (돈이 들지 않는다).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.SEEDANCE_BASE || "https://ark.ap-southeast.bytepluses.com/api/v3";

function parseArgs(argv) {
  const o = { model: "dreamina-seedance-2-5-260628", resolution: "480p", ratio: null, duration: 4, seed: null, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => argv[++i];
    if (a === "--first") o.first = v();
    else if (a === "--last") o.last = v();
    else if (a === "--prompt") o.prompt = v();
    else if (a === "--out") o.out = v();
    else if (a === "--model") o.model = v();
    else if (a === "--resolution") o.resolution = v();
    else if (a === "--ratio") o.ratio = v();
    else if (a === "--duration") o.duration = Number(v());
    else if (a === "--seed") o.seed = Number(v());
    else if (a === "--dry") o.dry = true;
    else if (a === "--task") o.task = v();
    else throw new Error(`모르는 인자: ${a}`);
  }
  if (o.task && o.out) return o; // 이미 보낸 작업을 이어서 기다려 받기 (--task <id> --out <mp4>)
  if (!o.first || !o.prompt || !o.out) throw new Error("--first · --prompt · --out 이 필요하다");
  return o;
}

function readKey() {
  if (process.env.SEEDANCE_KEY) return process.env.SEEDANCE_KEY.trim();
  const home = os.homedir();
  for (const p of [path.join(home, ".seedance_key", "key.txt"), path.join(home, ".seedance_key")]) {
    try {
      if (fs.statSync(p).isFile()) {
        const k = fs.readFileSync(p, "utf8").replace(/\s+/g, "");
        if (k) return k;
      }
    } catch { /* 없음 */ }
  }
  throw new Error("API 키가 없다 (SEEDANCE_KEY 또는 ~/.seedance_key/key.txt)");
}

const dataUrl = (p) => `data:image/${path.extname(p).slice(1).toLowerCase() === "jpg" ? "jpeg" : path.extname(p).slice(1).toLowerCase()};base64,${fs.readFileSync(p).toString("base64")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(key, method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 글 */ }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(json && json.error && `${json.error.code} — ${json.error.message}`) || text.slice(0, 300)}`);
  return json;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.task) return waitAndSave(readKey(), o.task, o.out, { resumed: true }, Date.now());
  const prompt = fs.existsSync(o.prompt) ? fs.readFileSync(o.prompt, "utf8").trim() : o.prompt;
  const content = [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl(o.first) }, role: "first_frame" }];
  if (o.last) content.push({ type: "image_url", image_url: { url: dataUrl(o.last) }, role: "last_frame" });
  // 첫 프레임 (· 끝 프레임) 생성은 화면 비율이 첫 그림을 따른다 — ratio 를 보내면 400 (InvalidParameter.TaskTypeConstraint)
  const body = { model: o.model, content, resolution: o.resolution, duration: o.duration, watermark: false, generate_audio: false };
  if (o.ratio) body.ratio = o.ratio;
  if (Number.isFinite(o.seed)) body.seed = o.seed;
  const shown = JSON.parse(JSON.stringify(body));
  for (const c of shown.content) if (c.image_url) c.image_url.url = `${c.image_url.url.slice(0, 40)}… (${c.image_url.url.length}자)`;
  if (o.dry) { console.log(JSON.stringify(shown, null, 2)); return; }
  const key = readKey();
  const t0 = Date.now();
  const created = await call(key, "POST", `${BASE}/contents/generations/tasks`, body);
  const id = created.id;
  console.log(`작업 ${id} 보냄 (${o.model} · ${o.resolution}${o.ratio ? ` · ${o.ratio}` : ''} · ${o.duration}s)`);
  return waitAndSave(key, id, o.out, shown, t0);
}

/** 작업 id 를 10초마다 확인 → succeeded 면 영상 · .json 저장 (--task 로 이어 받기에도 쓴다) */
async function waitAndSave(key, id, out, shown, t0) {
  let task = null;
  for (;;) {
    task = await call(key, "GET", `${BASE}/contents/generations/tasks/${id}`);
    const s = task.status;
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s · ${s}`);
    if (s === "succeeded" || s === "failed" || s === "cancelled" || s === "expired") break;
    if (Date.now() - t0 > 20 * 60 * 1000) throw new Error("20분 넘게 끝나지 않음");
    await sleep(10000);
  }
  const meta = { request: shown, id, status: task.status, usage: task.usage || null, seed: task.seed ?? null, error: task.error || null, seconds: Math.round((Date.now() - t0) / 1000) };
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out.replace(/\.mp4$/i, "") + ".json", `${JSON.stringify(meta, null, 2)}
`);
  if (task.status !== "succeeded") throw new Error(`작업 실패: ${task.status} ${JSON.stringify(task.error || {})}`);
  const url = task.content && task.content.video_url;
  if (!url) throw new Error("video_url 없음");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`영상 받기 실패 HTTP ${res.status}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  console.log(`저장: ${out} (usage ${JSON.stringify(meta.usage)})`);
}

main().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(1); });
