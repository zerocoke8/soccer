// test/spriteAnim.test.mjs — 움직이는 스프라이트 (docs/SPRITE_25D_PLAN.md §13 — A1): js/ui/spriteAnim.js (동작 목록 읽기 · 대신 동작 · 길이 · 칸 상자 ·
// 이벤트 → 동작 · 불러오기 캐시), js/ui/art.js spriteAnimUrl, 그리고 jsdom 2.5D 경기 화면 (실루엔 — d25_2v1):
//   정지 스프라이트 → idle 시트를 받으면 요소 하나 (.spr-anim) · 배경 = 시트 ?v= · --spr-n (steps) · --spr-dur (fps × 배속) · 발 앵커 · 반전 기준,
//   패스 · 드리블 액션 · 수비 (시험용으로 아델린에게도 같은 목록) · 재배치 달리기 → 대기, ⏭ = 대기, 줄인 움직임 = 대기 · idle 시트만,
//   목록이 없거나 못 받으면 정지 스프라이트 그대로 (콘솔 오류 없음), 경기에 없는 캐릭터 · 평면 모드는 불러오지 않는다.
// jsdom 이 없으면 jsdom 부분만 건너뛴다. 기존 2.5D 화면 검사는 test/d25Ui.test.mjs · d25Cam.test.mjs (고치지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const A = await import(pathToFileURL(path.join(ROOT, "js/ui/spriteAnim.js")).href);
const ART = await import(pathToFileURL(path.join(ROOT, "js/ui/art.js")).href);
const ST = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);
const V = await import(pathToFileURL(path.join(ROOT, "js/ui/view25.js")).href);
const SPRITES = JSON.parse(fs.readFileSync(path.join(ROOT, "data/sprites.json"), "utf8"));
const MAN_URL = "./img/sprites/anim/ch_elf_playmaker.json";
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, "img/sprites/anim/ch_elf_playmaker.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
const r2 = (x) => Math.round(x * 100) / 100;

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

test("동작 목록 읽기 (parseAnimManifest): 실루엔 10 동작 · 시트 주소 ?v= · 앵커 (대기 · 한 번 · 끝 자세 = 첫 칸 발, 달리기 · 드리블 = 몸통) · 이상한 항목은 빼고 idle 이 없으면 null", () => {
  const m = A.parseAnimManifest(MAN, MAN_URL);
  assert.ok(m, "실루엔 목록");
  assert.equal(m.id, "ch_elf_playmaker");
  assert.deepEqual(Object.keys(m.anims), A.ANIM_ACTIONS, "동작 10개 (idle · run · dribble · kick · pass · header · tackle · block · fall · celebrate)");
  for (const act of A.ANIM_ACTIONS) {
    const a = m.anims[act];
    const src = MAN.anims[act];
    assert.equal(a.url, `./img/sprites/anim/ch_elf_playmaker.${act}.webp?v=${src.v}`, `${act} 시트 주소`);
    assert.ok(fs.existsSync(path.join(ROOT, `img/sprites/anim/ch_elf_playmaker.${act}.webp`)), `${act} 시트 파일`);
    for (const k of ["mode", "fps", "count", "w", "h", "footX", "footY", "v"]) assert.equal(a[k], src[k], `${act}.${k}`);
    assert.ok(typeof src.foot0X === "number" && src.foot0X >= 0 && src.foot0X <= src.w, `${act} foot0X (tools/sprite_anim.mjs)`);
    assert.equal(a.ax, act === "run" || act === "dribble" ? src.footX : src.foot0X, `${act} 앵커 x`);
  }
  assert.deepEqual(A.ANIM_ACTIONS.map((a) => m.anims[a].mode),
    ["loop", "loop", "loop", "once", "once", "once", "once", "once", "hold", "hold"], "반복 · 한 번 · 끝 자세");

  // 이상한 항목 → 그 동작만 뺀다
  const bad = clone(MAN);
  bad.anims.kick.mode = "bounce";
  bad.anims.pass.count = 0;
  bad.anims.header.footX = bad.anims.header.w + 1;
  bad.anims.tackle.v = "";
  bad.anims.block.fps = -1;
  delete bad.anims.fall.foot0X;
  bad.anims.celebrate.foot0X = -5;
  const mb = A.parseAnimManifest(bad, MAN_URL);
  assert.deepEqual(Object.keys(mb.anims), ["idle", "run", "dribble", "fall", "celebrate"]);
  assert.equal(mb.anims.fall.ax, MAN.anims.fall.footX, "foot0X 가 없으면 footX");
  assert.equal(mb.anims.celebrate.ax, MAN.anims.celebrate.footX, "foot0X 가 칸 밖이면 footX");
  // idle 이 없으면 null (그 선수는 정지 스프라이트)
  const noIdle = clone(MAN);
  delete noIdle.anims.idle;
  assert.equal(A.parseAnimManifest(noIdle, MAN_URL), null);
  for (const g of [null, 1, "x", {}, { anims: null }, { anims: [] }]) assert.equal(A.parseAnimManifest(g, MAN_URL), null, JSON.stringify(g));
  assert.equal(A.parseAnimManifest(MAN, null), null, "주소 없음");
  // id 가 없으면 파일 이름, 이상하면 null
  const noId = clone(MAN);
  delete noId.id;
  assert.equal(A.parseAnimManifest(noId, "./img/sprites/anim/ch_x.json?v=1").anims.idle.url, `./img/sprites/anim/ch_x.idle.webp?v=${MAN.anims.idle.v}`);
  assert.equal(A.parseAnimManifest({ ...noId, id: "../evil" }, "./a b/c d.json"), null);
});

test("목록 주소 (art.spriteAnimUrl): data/sprites.json chars[id].anim — 실루엔만, 정지 스프라이트가 없거나 이상한 경로 = null", () => {
  const data = { sprites: clone(SPRITES) };
  assert.equal(SPRITES.chars.ch_elf_playmaker.anim, "img/sprites/anim/ch_elf_playmaker.json", "data/sprites.json 의 anim 필드");
  assert.equal(ART.spriteAnimUrl(data, "ch_elf_playmaker"), MAN_URL);
  assert.equal(ART.spriteAnimUrl(data, "ch_elf_regista"), null, "목록이 없는 캐릭터");
  assert.equal(ART.spriteAnimUrl(data, "ch_nobody"), null);
  assert.equal(ART.spriteAnimUrl({}, "ch_elf_playmaker"), null, "sprites.json 없음");
  for (const [bad, why] of [["../x.json", ".."], ["/img/x.json", "절대"], ["http://e.com/x.json", "다른 곳"], ["img/x.webp", ".json 아님"], ["img//x.json", "빈 칸"], ["", "빈 값"], [3, "문자 아님"]]) {
    const d = { sprites: clone(SPRITES) };
    d.sprites.chars.ch_elf_playmaker.anim = bad;
    assert.equal(ART.spriteAnimUrl(d, "ch_elf_playmaker"), null, why);
  }
  const d2 = { sprites: clone(SPRITES) };
  d2.sprites.chars.ch_elf_playmaker.anim = "./img/sprites/anim/ch_elf_playmaker.json";
  assert.equal(ART.spriteAnimUrl(d2, "ch_elf_playmaker"), MAN_URL, "./ 로 시작해도 같다");
  // 정지 스프라이트 항목이 없으면 (anim 만 있어도) null
  const d3 = { sprites: { chars: { ch_q: { anim: "img/sprites/anim/ch_q.json" } } } };
  assert.equal(ART.spriteAnimUrl(d3, "ch_q"), null);
  // spriteOf 는 그대로 (anim 필드를 더해도 정지 스프라이트 주소 · 크기 같다)
  const s = ART.spriteOf(data, "ch_elf_playmaker");
  assert.deepEqual(s, { url: `./img/sprites/ch_elf_playmaker.webp?v=${SPRITES.chars.ch_elf_playmaker.v}`, w: 141, h: 240, footX: 0.461 });
});

test("대신 동작 (pickAct) · 길이 (animDuration — 반복 = count / fps × 배속, 한 번 · 끝 자세 = 단계 길이) · 칸 상자 (animBox — 72 / 240 배율, 앵커 = 발)", () => {
  const m = A.parseAnimManifest(MAN, MAN_URL);
  for (const act of A.ANIM_ACTIONS) assert.equal(A.pickAct(m, act), act, `${act} 그대로`);
  // 시트를 아직 받지 못했으면 대신 동작 (끝 = idle), idle 도 아니면 null
  const only = (...acts) => (url) => acts.some((a) => url === m.anims[a].url);
  assert.equal(A.pickAct(m, "dribble", only("idle", "run")), "run");
  assert.equal(A.pickAct(m, "dribble", only("idle")), "idle");
  assert.equal(A.pickAct(m, "header", only("idle", "pass")), "pass");
  assert.equal(A.pickAct(m, "tackle", only("idle", "block")), "block");
  assert.equal(A.pickAct(m, "celebrate", only("idle")), "idle");
  assert.equal(A.pickAct(m, "kick", only()), null);
  assert.equal(A.pickAct(m, "moonwalk"), "idle", "모르는 동작 = idle");
  const part = clone(MAN);
  for (const a of ["kick", "pass"]) delete part.anims[a];
  assert.equal(A.pickAct(A.parseAnimManifest(part, MAN_URL), "header"), "header");
  delete part.anims.header;
  assert.equal(A.pickAct(A.parseAnimManifest(part, MAN_URL), "header"), "idle", "목록에 없는 동작 → 차례로 → idle");

  // 길이: 반복 = count / fps × 1000 × 배속 계수 (1 / speed)
  for (const speed of [1, 2, 4]) {
    const k = 1 / speed;
    assert.equal(A.animDuration(m.anims.idle, { speedK: k }), Math.round((6 / 8) * 1000 * k), `idle ${speed}x`);
    assert.equal(A.animDuration(m.anims.run, { speedK: k }), Math.round((7 / 12) * 1000 * k), `run ${speed}x`);
    assert.equal(A.animDuration(m.anims.dribble, { speedK: k, fitMs: 800 * k }), Math.round((13 / 12) * 1000 * k), "반복은 단계 길이를 쓰지 않는다");
    // 한 번 · 끝 자세 = 그 단계 길이 (액션 800 × k · 골 900 × k), 없으면 count / fps
    assert.equal(A.animDuration(m.anims.kick, { speedK: k, fitMs: 800 * k }), Math.round(800 * k), `kick ${speed}x = --t-act`);
    assert.equal(A.animDuration(m.anims.celebrate, { speedK: k, fitMs: 900 * k }), Math.round(900 * k), "celebrate = 골 연출");
    assert.equal(A.animDuration(m.anims.pass, { speedK: k }), Math.round(1000 * k), "단계 길이가 없으면 12 / 12fps");
  }
  assert.equal(A.animDuration(m.anims.kick, { fitMs: 0.2 }), 1, "1ms 아래로는 줄이지 않는다");

  // 칸 상자: k = 72 / 240 (정지 스프라이트와 같은 배율) — 칸 w × h × k, 앵커 (ax, footY) = 토큰 원점, 배경 = count 칸
  const k = V.V25.SPR_H / SPRITES.chars.ch_elf_playmaker.h;
  assert.equal(k, 0.3);
  for (const act of A.ANIM_ACTIONS) {
    const a = m.anims[act];
    const b = A.animBox(a, { k });
    assert.deepEqual(b, {
      width: r2(a.w * k), height: r2(a.h * k), left: r2(-a.ax * k), top: r2(-a.footY * k),
      bgW: r2(a.w * k * a.count), bgH: r2(a.h * k), originX: r2(a.ax * k), originY: r2(a.footY * k),
      n: a.count, iter: a.mode === "loop" ? "infinite" : "1",
    }, act);
    assert.equal(b.left + b.originX, 0, "반전 기준 = 앵커 (발)");
  }
  const idle = A.animBox(m.anims.idle, { k });
  assert.deepEqual([idle.width, idle.height, idle.left, idle.top, idle.bgW], [44.4, 75, -20.82, -74.1, 266.4], "실루엔 대기 칸 (s = 1)");
  // 첫 칸 키 = 240 → 72 (정지 스프라이트 키) — 앵커 위로 footY · k ≈ 72 ~ 82 (칸 위 여백 · 뛰어오름 포함)
  for (const act of A.ANIM_ACTIONS) assert.ok(m.anims[act].footY * k >= 70 && m.anims[act].footY * k <= 84, `${act} 칸 높이`);
});

test("비트 이벤트 → 동작 (attackerAct · defenderAct): 드리블 · 패스 · 컷백 · 크로스 · 센터링 · 슛 · 헤더 · 승부차기 · 배급 / 태클 · 인터셉트 · 버티기 · 제쳐짐 · 슛 막기", () => {
  const atk = [
    [{ type: "duel", action: "dribble", success: true }, "dribble"],
    [{ type: "duel", action: "pass", success: true }, "pass"],
    [{ type: "duel", action: "pass", success: true, boxLink: true }, "pass"], // ④ 컷백
    [{ type: "duel", action: "cross", success: true }, "kick"],
    [{ type: "duel", action: "cross", success: true, boxLink: true }, "kick"], // ④ 센터링
    [{ type: "turnover", action: "dribble" }, "dribble"],
    [{ type: "turnover", action: "pass" }, "pass"],
    [{ type: "turnover", action: "cross" }, "kick"],
    [{ type: "turnover", action: "shoot" }, "kick"], // 필드 수비의 블록
    [{ type: "save", action: "pass", boxLink: true }, "pass"], // ④ 컷백 실패 (GK 가 잡음)
    [{ type: "save", action: "cross", boxLink: true }, "kick"],
    [{ type: "save", action: "shoot" }, "kick"],
    [{ type: "save", action: "shoot", header: true }, "header"],
    [{ type: "goal", action: "shoot" }, "kick"],
    [{ type: "goal", action: "shoot", header: true }, "header"],
    [{ type: "goal" }, "kick"],
    [{ type: "penalty", success: true }, "kick"],
    [{ type: "penalty", success: false }, "kick"],
    [{ type: "distribution", action: "short", success: true }, "pass"], // GK 짧은 배급
    [{ type: "distribution", action: "long", success: true }, "kick"],
    [{ type: "turnover", action: "long", distribution: true }, "kick"],
    [{ type: "kickoff" }, null],
    [{ type: "counter" }, null],
    [null, null],
  ];
  for (const [ev, want] of atk) assert.equal(A.attackerAct(ev), want, `공격 ${JSON.stringify(ev)}`);
  const def = [
    [{ type: "duel", action: "dribble", defAction: "tackle", success: true }, "fall"], // 태클이 빗나가 제쳐짐 (.fallen)
    [{ type: "duel", action: "dribble", defAction: "intercept", success: true }, "fall"], // 제쳐짐 (.beaten)
    [{ type: "duel", action: "dribble", defAction: "hold", success: true }, "fall"],
    [{ type: "duel", action: "pass", defAction: "tackle", success: true }, "fall"], // 태클 실패 누운 모습 (.fallen)
    [{ type: "duel", action: "pass", defAction: "intercept", success: true }, "tackle"], // 끊으러 몸을 던졌지만 빗나감
    [{ type: "duel", action: "cross", defAction: "hold", success: true }, "block"],
    [{ type: "turnover", action: "dribble", defAction: "tackle" }, "tackle"],
    [{ type: "turnover", action: "pass", defAction: "intercept" }, "tackle"], // [구현 결정] 인터셉트 = 태클 (몸을 던져 끊는다)
    [{ type: "turnover", action: "cross", defAction: "hold" }, "block"],
    [{ type: "turnover", action: "shoot", defAction: "hold" }, "block"],
    [{ type: "turnover", action: "long", distribution: true, defAction: "intercept" }, "tackle"], // 롱패스 낙하 지점 끊기
    [{ type: "turnover", action: "pass" }, "tackle"],
    [{ type: "goal", action: "shoot", defAction: "tackle" }, "block"], // ③ 중거리 슛을 막으려던 필드 수비
    [{ type: "save", action: "shoot", defAction: "hold" }, "block"],
    [{ type: "distribution", action: "long", success: true }, null],
    [{ type: "kickoff" }, null],
  ];
  for (const [ev, want] of def) assert.equal(A.defenderAct(ev), want, `수비 ${JSON.stringify(ev)}`);
  // GK (세이브 · 다이브 · 박스 연결 · 승부차기) 는 K1 연출 그대로 — 동작 없음
  for (const ev of [{ type: "save", action: "shoot" }, { type: "goal" }, { type: "penalty" }, { type: "duel", action: "pass", defAction: "save", boxLink: true }]) {
    assert.equal(A.defenderAct(ev, { keeper: true }), null, `GK ${JSON.stringify(ev)}`);
  }
});

test("불러오기 캐시: 목록 · 시트는 주소마다 한 번, 404 · 오류 = null / false (던지지 않는다), 시트는 내려받기만 (본문을 끝까지 읽는다) · 차례 = idle 먼저", async () => {
  A.resetAnimCacheForTest();
  const calls = [];
  const fake = async (url, opts) => {
    calls.push([url, opts?.cache ?? null]);
    if (url.includes("boom")) throw new Error("network");
    if (url.includes("missing")) return { ok: false, status: 404 };
    if (url.endsWith(".json")) return { ok: true, status: 200, json: async () => clone(MAN) };
    let read = false;
    const res = { ok: true, status: 200, arrayBuffer: async () => { read = true; return new ArrayBuffer(4); } };
    res.wasRead = () => read;
    calls.at(-1).push(res);
    return res;
  };
  const m = await A.loadAnimManifest(MAN_URL, fake);
  assert.ok(m && m.anims.idle);
  assert.equal(await A.loadAnimManifest(MAN_URL, fake), m, "캐시 (같은 결과)");
  assert.equal(calls.filter((c) => c[0] === MAN_URL).length, 1, "목록은 한 번");
  assert.equal(calls[0][1], "no-cache", "목록은 늘 다시 확인 (작다 · 시트 판이 들어 있다)");
  assert.equal(await A.loadAnimManifest("./img/sprites/anim/missing.json", fake), null, "404 = null");
  assert.equal(await A.loadAnimManifest("./img/sprites/anim/boom.json", fake), null, "오류 = null");
  assert.equal(await A.loadAnimManifest(null, fake), null);

  const urls = A.sheetUrls(m);
  assert.equal(urls[0], m.anims.idle.url, "idle 먼저");
  assert.equal(urls.length, 10);
  assert.deepEqual(A.sheetUrls(m, { onlyIdle: true }), [m.anims.idle.url], "줄인 움직임 = idle 만");
  assert.equal(A.sheetReady(urls[0]), false);
  assert.equal(await A.preloadSheet(urls[0], fake), true);
  assert.equal(A.sheetReady(urls[0]), true, "받은 시트");
  const sheetCall = calls.find((c) => c[0] === urls[0]);
  assert.ok(sheetCall[2].wasRead(), "본문을 끝까지 읽는다 (HTTP 캐시에 남게 — 디코드는 하지 않는다)");
  assert.equal(await A.preloadSheet(urls[0], fake), true);
  assert.equal(calls.filter((c) => c[0] === urls[0]).length, 1, "시트도 한 번");
  assert.equal(await A.preloadSheet("./img/sprites/anim/missing.idle.webp", fake), false);
  assert.equal(A.sheetReady("./img/sprites/anim/missing.idle.webp"), false);
  assert.equal(await A.preloadSheet("./img/sprites/anim/boom.webp", fake), false);
  // fetch 가 없으면 (아주 옛 브라우저) null / false
  A.resetAnimCacheForTest();
  const saved = globalThis.fetch;
  try {
    globalThis.fetch = undefined;
    assert.equal(await A.loadAnimManifest(MAN_URL), null);
    assert.equal(await A.preloadSheet(urls[0]), false);
  } finally {
    globalThis.fetch = saved;
    A.resetAnimCacheForTest();
  }
  // CSS: 시트 애니메이션 = 요소 하나의 background-position steps, 반전 · 줄인 움직임 · 자세 겹치지 않기
  const css = fs.readFileSync(path.join(ROOT, "css/match.css"), "utf8");
  assert.match(css, /\.match-screen\.d25 \.tok-figure > \.spr-anim \{[^}]*animation: var\(--spr-name, spr-play-a\) var\(--spr-dur, 1000ms\) steps\(var\(--spr-n, 2\), jump-none\) 0s var\(--spr-iter, infinite\) normal both;/);
  assert.match(css, /@keyframes spr-play-a \{ from \{ background-position: 0% 0; \} to \{ background-position: 100% 0; \} \}/);
  assert.match(css, /@keyframes spr-play-b \{ from \{ background-position: 0% 0; \} to \{ background-position: 100% 0; \} \}/);
  assert.match(css, /\.match-screen\.d25 \.tok\.face-l \.tok-figure > \.spr-anim \{ transform: scaleX\(-1\); \}/, "발 기준 좌우 반전");
  assert.match(css, /\.tok\.fallen \.tok-figure\[data-act="fall"\][^{]*\{ rotate: none; \}/, "넘어짐 그림에는 90° 눕기를 겹치지 않는다");
  assert.match(css, /\.tok\.header \.tok-figure\.anim \{ translate: none; scale: none; \}/, "움직이는 스프라이트에는 헤더 뛰어오름을 겹치지 않는다 (세리머니까지 .header 가 남는다)");
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\/\*[^*]*\*\/\s*\.match-screen\.d25 \.tok-figure > \.spr-anim \{ animation: none !important; background-position: 0 0 !important;/, "줄인 움직임 = 첫 칸");
});

test("jsdom: 2.5D 실루엔 — idle 시트를 받으면 움직이는 요소 (배경 시트 ?v= · steps · 배속 길이 · 발 앵커) · 패스 / 드리블 / 수비 동작 · 재배치 달리기 → 대기 · ⏭ · 줄인 움직임 · 목록 없음 = 정지 그대로 · 경기에 없는 캐릭터 · 평면은 불러오지 않는다", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, ms = 4000, step = 10) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = fn();
      if (v) return v;
      await wait(step);
    }
    return fn();
  }
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  const saved = {};
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, "navigator", { value: window.navigator, configurable: true, writable: true }); } catch { /* node 21+ 읽기 전용이면 무시 */ }
  g.confirm = () => true;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const realFetch = g.fetch;
  const base = dataFetch(ROOT);
  const calls = [];
  // helpers.dataFetch 는 주소의 ?v= 를 파일 이름으로 읽는다 → 시트 (…webp?v=…) 는 떼고 읽는다 (다른 jsdom 테스트에서는 시트가 404 — 정지 스프라이트 그대로)
  g.fetch = async (url, opts) => { calls.push(String(url)); return base(String(url).replace(/\?.*$/, ""), opts); };
  const errors = [];
  const realError = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(" ")); };
  t.after(() => {
    console.error = realError;
    ST.setD25ForTest(null);
    A.resetAnimCacheForTest();
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;
  await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  const S = window.__soccer;
  assert.ok(S && S.store.data, "데이터 로드됨");
  assert.equal(S.store.data.sprites.chars.ch_elf_playmaker.anim, "img/sprites/anim/ch_elf_playmaker.json");
  assert.equal(calls.filter((u) => u.includes("img/sprites/anim/")).length, 0, "시작 화면에서는 동작 목록 · 시트를 부르지 않는다");
  const ui = S.store.matchUi;
  const { loadData, buildScenarioState, SCENARIOS } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = loadData();
  const SPR0 = clone(S.store.data.sprites);
  const inject = (name, { speed = 4, auto = false } = {}) => {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    ui.auto = auto;
    ui.speed = speed;
    ui.intervene = false;
    S.store.run = prep.runState;
    S.store.match = prep.matchState;
    S.store.screen = "run";
    S.render();
    return doc.querySelector(".match-screen");
  };
  const charOf = (el) => S.store.match[el.dataset.side].players.find((p) => p.id === el.dataset.id)?.charId;
  const tokOfChar = (scr, cid) => [...scr.querySelectorAll(".tok")].find((el) => charOf(el) === cid);
  const animUrls = () => calls.filter((u) => u.includes("img/sprites/anim/"));
  const m = A.parseAnimManifest(MAN, MAN_URL);
  const K = V.V25.SPR_H / 240;
  /** 요소 (.spr-anim) 가 동작 act 의 시트 · 칸 상자 · 길이를 보여 주는가 */
  const checkAct = (el, act, durMs, why) => {
    const sp = el.querySelector(":scope > .tok-figure.spr.anim > .spr-anim");
    assert.ok(sp, `${why}: 움직이는 요소`);
    const a = m.anims[act];
    const b = A.animBox(a, { k: K });
    assert.equal(sp.dataset.act, act, `${why}: 동작`);
    assert.equal(el.querySelector(".tok-figure").dataset.act, act, `${why}: 그림 data-act`);
    assert.equal(sp.style.backgroundImage, `url("${a.url}")`, `${why}: 배경 = 시트 ?v=`);
    assert.equal(sp.style.backgroundSize, `${b.bgW}px ${b.bgH}px`);
    assert.deepEqual([sp.style.width, sp.style.height, sp.style.left, sp.style.top], [`${b.width}px`, `${b.height}px`, `${b.left}px`, `${b.top}px`], `${why}: 칸 · 발 앵커`);
    assert.equal(sp.style.transformOrigin, `${b.originX}px ${b.originY}px`, `${why}: 반전 기준 = 발`);
    assert.equal(sp.style.getPropertyValue("--spr-n"), String(a.count), `${why}: steps`);
    assert.equal(sp.style.getPropertyValue("--spr-iter"), a.mode === "loop" ? "infinite" : "1");
    assert.match(sp.style.getPropertyValue("--spr-name"), /^spr-play-[ab]$/);
    if (durMs != null) assert.equal(sp.style.getPropertyValue("--spr-dur"), `${durMs}ms`, `${why}: 길이`);
    return sp;
  };
  const actOf = (el) => el?.querySelector(":scope > .tok-figure > .spr-anim")?.dataset.act ?? null;
  const mainEvent = (before) => S.store.match.events.slice(before).find((e) => ["duel", "turnover", "save", "goal", "penalty", "distribution"].includes(e.type));

  ST.setD25ForTest(true);
  // ---- 실루엔 공 (d25_2v1): 정지 스프라이트 → idle 시트를 받으면 움직이는 요소 ----
  {
    const scr = inject("d25_2v1");
    const sil = tokOfChar(scr, "ch_elf_playmaker");
    assert.ok(sil, "실루엔 토큰");
    assert.ok(sil.querySelector(".tok-figure.spr > img.spr-img"), "처음 (목록을 받기 전) = 정지 스프라이트");
    const sp = await until(() => sil.querySelector(".tok-figure.spr.anim > .spr-anim"));
    assert.ok(sp, "idle 시트를 받으면 움직이는 요소");
    assert.equal(sil.querySelector(".spr-img"), null, "정지 img 는 뗀다 (사본 없음)");
    assert.equal(sil.querySelectorAll(".tok-figure > *").length, 1, "그림 요소 하나");
    checkAct(sil, "idle", Math.round((6 / 8) * 1000 / 4), "대기 (4배속)");
    // 불러온 것: 실루엔 목록 하나 + 그 시트 10장 (idle 먼저) — 경기에 나온 다른 캐릭터 (아델린 · 나엘리스 — 목록 없음) 는 부르지 않는다
    await until(() => A.sheetUrls(m).every((u) => A.sheetReady(u)), 3000);
    assert.deepEqual(animUrls().filter((u) => u.endsWith(".json")), [MAN_URL], "목록 = 실루엔 하나");
    assert.deepEqual(animUrls().filter((u) => !u.endsWith(".json")), A.sheetUrls(m), "시트 = 실루엔 10장 (?v=) · idle 먼저");
    // 다른 스프라이트 선수 (아델린 · 나엘리스) 는 정지 img 그대로, 스탠디 그대로
    for (const cid of ["ch_human_captain", "ch_elf_regista"]) {
      const el = tokOfChar(scr, cid);
      assert.ok(el.querySelector(".tok-figure.spr > img.spr-img") && !el.querySelector(".spr-anim"), `${cid} 정지 스프라이트 그대로`);
    }
    for (const el of scr.querySelectorAll(".tok")) if (!SPR0.chars[charOf(el)]) assert.ok(el.querySelector(".tok-figure.standee") && !el.querySelector(".spr-anim"));
    // 이름표 · 말풍선 자리 상자 (--fh · --fhw) = 정지 스프라이트 치수 그대로
    const s = Number(sil.style.getPropertyValue("--ts"));
    const f = V.figureSize(s, SPR0.chars.ch_elf_playmaker);
    assert.equal(sil.style.getPropertyValue("--fh"), `${Math.round(f.fh * 10) / 10}px`);
    assert.equal(sil.style.getPropertyValue("--fhw"), `${Math.round(f.hw * 10) / 10}px`);
    // 공 가진 실루엔 = 공격 방향 (오른쪽) — 반전 없음. 반전은 CSS (.face-l) 가 발 기준 (transform-origin = 앵커)
    assert.ok(!sil.classList.contains("face-l"));

    // 패스 결정 → 액션 = 패스 (한 번 — --t-act 200ms, 성공 · 실패 상관없이 시도한 동작) → 재배치 = 달리기 · 드리블 → 대기
    const before = S.store.match.events.length;
    const pb = scr.querySelector('button[data-action="pass"]');
    assert.ok(pb && !pb.disabled, "패스 카드");
    pb.click();
    await until(() => scr.querySelector(".m-field").classList.contains("phase-act"), 3000);
    const ev = mainEvent(before);
    assert.ok(ev, "판정 비트");
    assert.equal(A.attackerAct(ev), "pass");
    checkAct(sil, "pass", 200, "패스 액션 (--t-act 4배속)");
    const mv = await until(() => (scr.querySelector(".m-field").classList.contains("phase-move") ? actOf(sil) : null), 3000);
    assert.ok(["run", "dribble", "idle"].includes(mv), `재배치 동작 ${mv}`);
    t.diagnostic(`패스 비트: ${ev.type} ${ev.success ?? ""} → 액션 pass · 재배치 ${mv}`);
    if (mv !== "idle") checkAct(sil, mv, A.animDuration(m.anims[mv], { speedK: 0.25 }), "재배치 달리기 (count / fps × 배속)");
    await until(() => !ui.busy, 4000);
    await wait(20);
    assert.equal(actOf(sil), "idle", "비트가 끝나면 대기");
    S.actions.resetToStart();
  }

  // ---- 수비 동작: 시험용으로 아델린 (듀얼 수비) 에게도 실루엔 목록 → 드리블 결정 → 실루엔 드리블 · 아델린 = 넘어짐 (제쳐짐) 또는 수비 동작 (뺏음) ----
  {
    S.store.data.sprites.chars.ch_human_captain.anim = "img/sprites/anim/ch_elf_playmaker.json";
    try {
      const scr = inject("d25_2v1");
      const sil = tokOfChar(scr, "ch_elf_playmaker");
      const ade = tokOfChar(scr, "ch_human_captain");
      await until(() => sil.querySelector(".spr-anim") && ade.querySelector(".spr-anim"));
      assert.equal(actOf(ade), "idle", "아델린 (시험용 목록) 도 움직이는 요소");
      assert.equal(ade.querySelector(".tok-figure").dataset.act, "idle");
      assert.equal(animUrls().filter((u) => u.endsWith(".json")).length, 1, "같은 목록은 한 번 (모듈 캐시)");
      const before = S.store.match.events.length;
      scr.querySelector('button[data-action="dribble"]').click();
      await until(() => scr.querySelector(".m-field").classList.contains("phase-act"), 3000);
      const ev = mainEvent(before);
      assert.equal(actOf(sil), "dribble", "공 가진 실루엔 = 드리블 (성공 · 실패 상관없이)");
      checkAct(sil, "dribble", A.animDuration(m.anims.dribble, { speedK: 0.25 }), "드리블 (반복 = 13 / 12fps × 배속)");
      const want = A.defenderAct(ev);
      assert.ok(want, `수비 동작 (${ev.type} ${ev.defAction})`);
      t.diagnostic(`드리블 비트: ${ev.type} ${ev.success ?? ""} 수비 ${ev.defAction} → 아델린 ${want}`);
      assert.equal(actOf(ade), want, `아델린 = ${want} (${ev.type} · ${ev.defAction})`);
      if (want === "fall") {
        checkAct(ade, "fall", 200, "넘어짐 (끝 자세 — 다음 재배치까지)");
        assert.ok(ade.classList.contains("fallen") || ade.classList.contains("beaten"), ".fallen / .beaten 그대로");
      } else checkAct(ade, want, 200, "수비 동작 (한 번)");
      await until(() => scr.querySelector(".m-field").classList.contains("phase-move"), 3000);
      await until(() => !ui.busy, 4000);
      await wait(20);
      assert.equal(actOf(ade), "idle", "재배치 · 비트 끝 = 대기 (넘어짐 끝)");
      assert.equal(actOf(sil), "idle");
      // ⏭ = 순간 배치 → 대기, 예약된 동작 바꾸기는 무효
      scr.querySelector(".skip-btn").click();
      assert.equal(actOf(sil), "idle", "⏭ = 대기");
      assert.ok(doc.querySelector("#modal-root .score-big"), "결과 모달");
      S.actions.resetToStart();
    } finally {
      S.store.data.sprites = clone(SPR0);
    }
  }

  // ---- 줄인 움직임: 대기 첫 칸 그대로 (액션에도 동작을 바꾸지 않는다) · idle 시트만 내려받는다 ----
  {
    A.resetAnimCacheForTest();
    calls.length = 0;
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: /reduce/.test(q), media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    try {
      const scr = inject("d25_2v1");
      const sil = tokOfChar(scr, "ch_elf_playmaker");
      await until(() => sil.querySelector(".spr-anim"));
      assert.equal(actOf(sil), "idle");
      await wait(50);
      assert.deepEqual(animUrls(), [MAN_URL, m.anims.idle.url], "줄인 움직임 = 목록 + idle 시트만");
      scr.querySelector('button[data-action="pass"]').click();
      await until(() => scr.querySelector(".m-field").classList.contains("phase-act"), 3000);
      assert.equal(actOf(sil), "idle", "액션 중에도 대기 (첫 칸 — CSS 가 애니메이션을 끈다)");
      await until(() => !ui.busy, 4000);
      assert.equal(actOf(sil), "idle");
    } finally {
      window.matchMedia = mm;
      S.actions.resetToStart();
    }
  }

  // ---- 목록이 없거나 (404) 고장 = 정지 스프라이트 그대로 · 콘솔 오류 없음 / 경기에 없는 캐릭터의 목록은 부르지 않는다 ----
  {
    A.resetAnimCacheForTest();
    calls.length = 0;
    S.store.data.sprites.chars.ch_elf_playmaker.anim = "img/sprites/anim/ch_missing.json";
    S.store.data.sprites.chars.ch_absent = { w: 100, h: 240, footX: 0.5, v: "00000000", anim: "img/sprites/anim/ch_absent.json" };
    try {
      const scr = inject("d25_2v1");
      const sil = tokOfChar(scr, "ch_elf_playmaker");
      await until(() => animUrls().length >= 1);
      await wait(80);
      assert.deepEqual(animUrls(), ["./img/sprites/anim/ch_missing.json"], "경기에 나온 캐릭터 목록만 (ch_absent 는 부르지 않는다)");
      assert.ok(sil.querySelector(".tok-figure.spr > img.spr-img") && !sil.querySelector(".spr-anim"), "목록이 없으면 정지 스프라이트 그대로");
      scr.querySelector('button[data-action="pass"]').click();
      await until(() => !ui.busy && scr.querySelector(".m-field:not(.phase-act):not(.phase-move)"), 4000);
      assert.ok(sil.querySelector("img.spr-img"), "비트 뒤에도 정지 스프라이트");
      S.actions.resetToStart();
      // 목록 필드가 없으면 부르지도 않는다
      A.resetAnimCacheForTest();
      calls.length = 0;
      delete S.store.data.sprites.chars.ch_elf_playmaker.anim;
      const scr2 = inject("d25_2v1");
      await wait(80);
      assert.equal(animUrls().length, 0, "anim 필드 없음 = 부르지 않는다");
      assert.ok(tokOfChar(scr2, "ch_elf_playmaker").querySelector("img.spr-img"));
      S.actions.resetToStart();
    } finally {
      S.store.data.sprites = clone(SPR0);
    }
    assert.deepEqual(errors, [], "콘솔 오류 없음");
  }

  // ---- 평면 모드: 불러오지 않는다 · 움직이는 요소 없음 ----
  ST.setD25ForTest(false);
  {
    A.resetAnimCacheForTest();
    calls.length = 0;
    const scr = inject("d25_2v1");
    await wait(80);
    assert.equal(animUrls().length, 0, "평면 = 동작 목록 · 시트를 부르지 않는다");
    assert.equal(scr.querySelector(".spr-anim, .tok-figure"), null);
    S.actions.resetToStart();
  }
  assert.deepEqual(errors, [], "콘솔 오류 없음");
});
