// test/stage.test.mjs — 고정 스테이지 (js/ui/stage.js): 논리 1280×720 을 창에 한 배율로 맞추기, 가로 전용 경기 화면
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { STAGE_W, STAGE_H, fitStage, toStage } from "../js/ui/stage.js";
import * as storeMod from "../js/ui/store.js";

test("fitStage: 한 배율(폭·높이 중 작은 쪽)로 맞추고 가운데 — 남는 곳은 레터박스", () => {
  assert.deepEqual([STAGE_W, STAGE_H], [1280, 720]);
  const cases = [
    // [창 w, h, scale, x, y, portrait]
    [1280, 720, 1, 0, 0, false],
    [1920, 1080, 1.5, 0, 0, false],
    [1600, 900, 1.25, 0, 0, false],
    [1024, 576, 0.8, 0, 0, false],
    [2560, 1440, 2, 0, 0, false],
    [1280, 900, 1, 0, 90, false],        // 위아래 레터박스
    [1600, 1000, 1.25, 0, 50, false],
    [1920, 720, 1, 320, 0, false],       // 좌우 레터박스 (울트라와이드)
    [1366, 768, 768 / 720, 0, 0, false], // 폭 1365.33 → x = floor(0.33) = 0
    [900, 1200, 900 / 1280, 0, 346, true],   // 세로 창: 폭에 맞춤, 위아래 346px (floor((1200 − 506.25) / 2))
    [390, 844, 390 / 1280, 0, 312, true], // 세로 폰
  ];
  for (const [w, h, scale, x, y, portrait] of cases) {
    const f = fitStage(w, h);
    assert.ok(Math.abs(f.scale - scale) < 1e-12, `${w}×${h} scale ${f.scale} ≠ ${scale}`);
    assert.equal(f.x, x, `${w}×${h} x`);
    assert.equal(f.y, y, `${w}×${h} y`);
    assert.equal(f.portrait, portrait, `${w}×${h} portrait`);
    // 보이는 크기는 창 안에 들어가고, 한 방향은 창에 딱 맞는다
    assert.ok(f.width <= w + 1e-9 && f.height <= h + 1e-9, `${w}×${h} 창 안`);
    assert.ok(Math.abs(f.width - w) < 1e-9 || Math.abs(f.height - h) < 1e-9, `${w}×${h} 한 변은 꽉 참`);
    assert.ok(Math.abs(f.width / f.height - 16 / 9) < 1e-9, "16:9 유지");
  }
  // 정사각형은 세로 아님 (폭 < 높이일 때만 안내)
  assert.equal(fitStage(1000, 1000).portrait, false);
  assert.equal(fitStage(999, 1000).portrait, true);
});

test("fitStage: 창 크기를 모르면(0 · NaN · 음수) 1배 · 왼쪽 위", () => {
  for (const [w, h] of [[0, 0], [NaN, 720], [1280, -1], [undefined, undefined]]) {
    assert.deepEqual(fitStage(w, h), { scale: 1, x: 0, y: 0, width: 1280, height: 720, portrait: false }, `${w}×${h}`);
  }
});

test("toStage: 창 좌표 → 스테이지 논리 좌표 (fitStage 의 역)", () => {
  const f = fitStage(1600, 1000); // 1.25배, y 50
  assert.deepEqual(toStage(0, 50, f), { x: 0, y: 0 });
  assert.deepEqual(toStage(1600, 950, f), { x: 1280, y: 720 });
  assert.deepEqual(toStage(800, 500, f), { x: 640, y: 360 });
});

test("base.css 의 --stage-w / --stage-h 는 stage.js 와 같다", () => {
  const css = fs.readFileSync(fileURLToPath(new URL("../css/base.css", import.meta.url)), "utf8");
  assert.match(css, new RegExp(`--stage-w:\\s*${STAGE_W}px`));
  assert.match(css, new RegExp(`--stage-h:\\s*${STAGE_H}px`));
});

test("tools/shot.mjs --only: 정확히 같은 이름이면 그것만, 아니면 접두어", async () => {
  const { selectScenarios } = await import("../tools/shot.mjs");
  const list = ["02_home", "og_training", "og_training_mid", "og_setup"].map((name) => ({ name }));
  const names = (only) => selectScenarios(only, list).map((s) => s.name);
  assert.deepEqual(names(["og_training"]), ["og_training"], "정확히 같은 이름 → 그 하나 (og_training_mid 빼고)");
  assert.deepEqual(names(["og"]), ["og_training", "og_training_mid", "og_setup"], "접두어 → 전부");
  assert.deepEqual(names(["02", "og_setup"]), ["02_home", "og_setup"]);
  assert.deepEqual(names(null).length, 4);
  assert.throws(() => selectScenarios(["zz"], list), /알 수 없는 시나리오/);
});

test("가로 전용: 방향 스위치(store.landOnly · resolveOrient)가 없다, 토스트는 한 번에 2개 · 경기 화면은 오른쪽 위", () => {
  assert.equal("resolveOrient" in storeMod, false, "store.resolveOrient 없음");
  assert.equal("landOnly" in storeMod.store, false, "store.landOnly 없음");
  const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
  const app = read("js/ui/app.js");
  assert.doesNotMatch(app, /landOnly|resolveOrient/, "app.js 부트에 방향 스위치 없음");
  assert.match(app, /case 'match': setStageMode\('match'\)/, "경기 화면이면 #stage[data-mode=match]");
  // 스테이지 안 여백에 창 px(env safe-area)를 섞지 않는다 (배율이 곱해진다)
  const base = read("css/base.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(base, /env\(safe-area/, "base.css 에 env(safe-area-*) 없음");
  assert.match(base, /#toast-root > \.toast:nth-last-child\(n\+3\)\s*\{\s*display:\s*none/, "토스트는 최근 2개만");
  // 경기 화면 토스트: 스코어 헤더(가운데 --mh-w) 오른쪽 끝보다 오른쪽, 배너 띠(스테이지 끝 − 18px) 안
  const mcss = read("css/match.css");
  const m = /\.stage\[data-mode="match"\] #toast-root\s*\{[^}]*right:\s*(\d+)px[^}]*width:\s*(\d+)px/.exec(mcss);
  assert.ok(m, "경기 화면 토스트 자리");
  const mhW = Number(/--mh-w:\s*(\d+)px/.exec(mcss)[1]);
  const [right, width] = [Number(m[1]), Number(m[2])];
  assert.ok(STAGE_W - right - width >= STAGE_W / 2 + mhW / 2 + 8, "토스트 왼쪽 끝 > 스코어 헤더 오른쪽 끝");
  assert.ok(right >= 18, "배너 띠 안");
});
