// test/orient.test.mjs — 경기 화면은 가로 전용 (고정 스테이지 1280×720): 세로 경기 화면 · ⇄ 전환 · ?orient · 저장값이 돌아오지 않게.
// 가로 좌표 규칙(home 골 왼쪽 · away 골 오른쪽 · 필드 x 0 = 위)과 HUD 배치 계약(규칙 영역이 위·아래 HUD 사이)도 여기서 본다.
// DOM 이 필요한 동작(토큰 위치 · 로그 서랍 · 배속 버튼)은 test/ui.smoke.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as storeMod from "../js/ui/store.js";
import { fieldToScreen, screenToField, ZONES } from "../js/ui/layout.js";
import { STAGE_W, STAGE_H } from "../js/ui/stage.js";

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
const MATCH_JS = read("js/ui/screens/match.js");
const MATCH_CSS = read("css/match.css");

test("경기 화면에 방향 분기가 없다: 세로 좌표 · ⇄ 버튼 · 방향 저장/URL 을 쓰지 않는다", () => {
  // 방향 API 를 가져다 쓰지 않는다
  assert.doesNotMatch(MATCH_JS, /import\s*\{[^}]*\b(resolveOrient|saveOrient|landFits|loadOrient)\b[^}]*\}\s*from\s*'\.\.\/store\.js'/, "store 방향 API import 없음");
  // 좌표 변환은 가로 하나 (fieldToScreen/screenToField 'land')
  const calls = [...MATCH_JS.matchAll(/\b(fieldToScreen|screenToField)\(([^)]*)\)/g)].filter((m) => !/^\s*$/.test(m[2]));
  assert.ok(calls.length >= 2, "좌표 변환 호출");
  for (const m of calls) assert.match(m[2], /'land'\s*$/, `${m[1]}(${m[2]}) 는 'land'`);
  for (const bad of [/orient-btn/, /\bLAND\b/, /'port'/, /orientPending/, /match-land/, /\.land\b/]) assert.doesNotMatch(MATCH_JS, bad, `match.js 에 ${bad} 없음`);
});

test("match.css: 세로 경기 화면 규칙 · ⇄ 버튼 · 창 크기 media query · vw/vh 가 없다", () => {
  const css = MATCH_CSS.replace(/\/\*[\s\S]*?\*\//g, ""); // 주석 제외
  for (const bad of [/\.match-screen\.land\b/, /\.orient-btn/, /\.pitch-row/, /--screen-h/, /\d(vw|vh|dvh)\b/, /@media\s*\((min|max)-(width|height)/]) {
    assert.doesNotMatch(css, bad, `match.css 에 ${bad} 없음`);
  }
});

test("store.js: 방향 저장 · URL · 창 크기 판정 · 방향 스위치 API 없음, 로그 서랍은 새 경기마다 닫힘", () => {
  for (const name of ["normOrient", "loadOrient", "saveOrient", "landFits", "autoOrient", "LAND_MIN", "resolveOrient"]) {
    assert.equal(name in storeMod, false, `store.${name} 없음`);
  }
  assert.equal("orient" in storeMod.KEYS, false, "soccer.orient 저장 키 없음");
  assert.equal("orient" in storeMod.store.matchUi, false, "matchUi.orient 없음");
  assert.equal("landOnly" in storeMod.store, false, "store.landOnly 없음");
  // 픽셀 변환 기본값 = 가로 ('port' 는 명시할 때만)
  assert.deepEqual(fieldToScreen(20, 70, 1244, 528), fieldToScreen(20, 70, 1244, 528, "land"));
  // logOpen: matchUi 에 선언, resetMatchUi(새 경기 · 이어하기 · 경기 끝) 가 닫는다
  const { store, resetMatchUi } = storeMod;
  assert.equal(store.matchUi.logOpen, false, "matchUi.logOpen 기본 닫힘");
  store.matchUi.logOpen = true;
  resetMatchUi();
  assert.equal(store.matchUi.logOpen, false, "resetMatchUi → 로그 서랍 닫힘");
});

test("가로 좌표: home 골 왼쪽 · away 골 오른쪽 · 필드 x 0 = 위, 구역은 왼쪽부터 우리 박스 → 상대 박스", () => {
  const W = 1244;
  const H = 528;
  assert.deepEqual(fieldToScreen(50, 0, W, H, "land"), [0, H / 2], "home 골 = 왼쪽 끝 가운데");
  assert.deepEqual(fieldToScreen(50, 100, W, H, "land"), [W, H / 2], "away 골 = 오른쪽 끝 가운데");
  assert.equal(fieldToScreen(0, 30, W, H, "land")[1], 0, "필드 x 0 = 위");
  assert.equal(fieldToScreen(100, 30, W, H, "land")[1], H, "필드 x 100 = 아래");
  // 구역 경계(필드 y %) = 화면 x 의 같은 % (구역 줄 · 트랙 칸 · 토큰이 같은 사각형)
  for (const z of ZONES) {
    assert.equal(fieldToScreen(50, z.from, W, H, "land")[0], (z.from / 100) * W, `${z.name} 시작`);
    assert.equal(fieldToScreen(50, z.to, W, H, "land")[0], (z.to / 100) * W, `${z.name} 끝`);
  }
  assert.equal(ZONES[0].name, "우리 박스");
  assert.equal(ZONES[ZONES.length - 1].name, "상대 박스");
  for (const [x, y] of [[0, 0], [100, 100], [20, 84], [73.5, 12.25]]) {
    const [sx, sy] = fieldToScreen(x, y, W, H, "land");
    const back = screenToField(sx, sy, W, H, "land");
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `왕복 (${x}, ${y})`);
  }
});

test("HUD 배치 계약 (css/match.css): 규칙 영역 = 잔디 안, 위 HUD(헤더 + 트랙) 아래 · 아래 HUD(정보 줄 + 카드 줄) 위", () => {
  const px = (name) => {
    const m = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(MATCH_CSS);
    assert.ok(m, `${name} 변수`);
    return Number(m[1]);
  };
  const pad = px("--pad");
  const fx = px("--fx");
  const ft = px("--ft");
  const fb = px("--fb");
  const dockW = px("--dock-w");
  const sideW = px("--side-w");
  const mhW = px("--mh-w");
  const rule = (sel) => {
    const m = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(MATCH_CSS);
    assert.ok(m, `규칙 ${sel}`);
    return m[1];
  };
  // 규칙 영역 (스테이지 좌표)
  const field = { l: pad + fx, r: STAGE_W - pad - fx, t: pad + ft, b: STAGE_H - pad - fb };
  assert.deepEqual([field.r - field.l, field.b - field.t], [1244, 528], "규칙 영역 1244×528 (screens/match.js 기본값 W·H 와 같다)");
  assert.match(MATCH_JS, /let W = 1244;/);
  assert.match(MATCH_JS, /let H = 528;/);
  // 토큰 지름 = 필드 폭(높이) × 8.3% → 44px (40~44px 권장)
  const tok = Math.round(Math.min(48, Math.max(30, 528 * 0.083)));
  assert.equal(tok, 44);
  // 아래 HUD: 정보 줄 22 + 간격 4 + 카드 70, 스테이지 아래에서 10px → 규칙 영역 아래 끝보다 아래
  const dockTop = STAGE_H - 10 - (22 + 4 + 70);
  assert.ok(dockTop >= field.b, `아래 HUD 위 끝 ${dockTop} ≥ 규칙 영역 아래 끝 ${field.b}`);
  // 트랙(규칙 영역 위 21px, 높이 17)은 규칙 영역 위, 헤더(위 4px, 높이 ≈ 55)는 트랙 위
  const trackTop = pad + ft - 21;
  assert.ok(trackTop + 17 <= field.t, "트랙은 규칙 영역 위");
  assert.ok(4 + 56 <= trackTop, "헤더는 트랙 위");
  // 좌우 묶음 · 가운데 줄이 겹치지 않는다
  const dockL = (STAGE_W - dockW) / 2;
  assert.ok(pad + 8 + sideW <= dockL, "왼쪽 아래 묶음 | 가운데");
  assert.ok(STAGE_W - pad - 8 - sideW >= dockL + dockW, "가운데 | 오른쪽 아래 묶음");
  // 스킬 묶음은 상자(아래 띠) 안: 위 끝이 규칙 영역 아래 끝보다 아래. 2열 3줄이 상자에 딱 맞고, 그보다 많으면(.over) 상자 안 스크롤
  const sk = rule(".match-screen .skill-row ");
  const skMax = Number(/max-height:\s*(\d+)px/.exec(sk)[1]);
  assert.ok(STAGE_H - 10 - skMax >= field.b, `스킬 묶음 위 끝 ${STAGE_H - 10 - skMax} ≥ 규칙 영역 아래 끝 ${field.b}`);
  const many = rule(".match-screen .skill-row.many ");
  const rowH = Number(/grid-auto-rows:\s*(\d+)px/.exec(many)[1]);
  const rowGap = Number(/gap:\s*(\d+)px/.exec(many)[1]);
  assert.ok(3 * rowH + 2 * rowGap <= skMax, `2열 3줄 ${3 * rowH + 2 * rowGap} ≤ 상자 ${skMax}`);
  assert.match(rule(".match-screen .skill-row.over "), /overflow-y:\s*auto/, "7개 이상은 상자 안 스크롤");
  assert.match(MATCH_JS, /classList\.toggle\('over', items\.length > 6\)/, "2열 × 3줄(6개) 초과 = .over");
  // 로그 서랍은 공 반대쪽 절반: 기본 오른쪽, .side-l 이면 왼쪽 (폭 ≤ 규칙 영역의 1/3)
  assert.match(rule(".m-logbox.side-l"), /right:\s*auto;\s*left:/, "로그 서랍 왼쪽 자리");
  assert.ok(Number(/width:\s*(\d+)px/.exec(rule(".m-logbox "))[1]) <= (field.r - field.l) / 3, "로그 서랍 폭 ≤ 규칙 영역 1/3");
  // 배너 글자 칸(헤더 왼쪽)은 헤더와 겹치지 않는다
  assert.ok(mhW < STAGE_W / 2, "헤더 폭");
  assert.match(MATCH_CSS, /\.m-banner-txt\s*\{[^}]*right:\s*calc\(50% \+ var\(--mh-w\) \/ 2 \+ \d+px\)/, "배너 글자 오른쪽 끝 = 헤더 왼쪽 끝 − 여백");
});
