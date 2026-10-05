// test/layoutJitter.test.mjs — 경기 배치 흔들림 (J1 · J2 — docs/SPRITE_25D_PLAN.md §11, 2026-10-06, 되돌릴 수 있음)
//   js/ui/layout.js computeLayout(view, { …, jitter: { seed, ref } }) · js/ui/store.js isLayoutJitter (?jitter=0 · ?jitter=1 · 2.5D 기본 켬).
//   jitter 없음 = 예전 배치 그대로 · 같은 열쇠 (seed · 포제션 · 마지막 비트 seq · 공격 팀) = 같은 배치 · 난수 없음 ·
//   J2: 도착 자리 = 맡은 구역 띠 안 무작위 자리 (세로 = 띠 어디든 · 가로 ±JITTER.ax · GK 작게) · 같은 편 · 같은 구역은 좌우 순서 · 다른 라인 앞뒤 순서 그대로 ·
//   간격 ≥ min(minD, 처음 거리) · 듀얼 둘 함께 (수비 − 공 벡터 그대로) · 공 = 공 가진 선수 · 수비 팀 · 받는 선수의 공 앞 · 뒤 · 커버 · 박스 후보의 좌우 ·
//   배급 · 승부차기 · 화살표 가림이 늘지 않는다 · 같은 비트의 화면 변형 (스킬 · 필살기 토글 · 자동/수동 — ref = 엔진 view) 은 어느 둘 사이에서도
//   규칙 자리가 같은 선수를 옮기지 않는다 (J2 회귀: 스루 패스 · 필살기 extra line — 16 · 17 · 28 · 31 · 36) · 경기 화면 (jsdom: 2.5D 켬 · 받는 선수 탭 ·
//   자동 ↔ 수동 · 스루 패스 토글 · 다시 그리기에서 그대로 · 비트 뒤 새 자리 · 평면 기본 끔 · ?jitter=1 평면 켬).
// 평면 기본 배치는 test/layout.test.mjs 가 그대로 지킨다 (고치지 않는다).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  computeLayout, resolvePreview, ZONES, X_MIN, X_MAX, JITTER, BOX_LANE, zoneAtY, tokenDistance, hash32,
} from "../js/ui/layout.js";
import * as zones from "../js/engine/zones.js";
import { loadData, clone, run, match, dataFetch } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = pathToFileURL(path.join(ROOT, "js/ui/store.js")).href;
const TOL = 1e-6;
// 경기 화면이 넘기는 간격 (screens/match.js layoutFor): 2.5D = 판 px 46 / FD 980 · FL 1244, 평면 = (토큰 44 + 4) / 528 · 528 / 1244
const GEOS = {
  d25: { aspect: 980 / 1244, tokenSize: 46 / 980 },
  flat: { aspect: 528 / 1244, tokenSize: 48 / 528 },
};
const other = (s) => (s === "home" ? "away" : "home");
const sign = (x) => (x > TOL ? 1 : x < -TOL ? -1 : 0);

const data = loadData();
const SQUADS = {
  "2-2-2": undefined,
  "3-1-2": { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", DF3: "ch_human_runner", MF1: "ch_elf_playmaker", FW1: "ch_wolf_winger", FW2: "ch_giant_striker" },
  "1-3-2": { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_wolf_winger", FW2: "ch_giant_striker" },
};
function homeSnap(formation) {
  const st = run.createRun({ data, seed: `jitter-${formation}`, formation, squad: SQUADS[formation] });
  st.teamwork = 40;
  return run.buildTeamSnapshot(st, data);
}

/** 실제 엔진 경기 몇 판의 매 step view (경기 seed 와 함께). 승부차기까지 가는 미러 매치 하나 포함 */
function engineViews() {
  const out = [];
  const play = (ms) => {
    for (let g = 0; g < 3000; g++) {
      out.push({ view: match.getMatchView(ms, data), seed: ms.seed, ms });
      if (match.isFinished(ms)) return;
      match.step(ms, data, null);
    }
  };
  const homes = Object.keys(SQUADS).map(homeSnap);
  for (const [i, home] of homes.entries()) {
    for (const opp of data.opponents.slice(0, 4)) {
      const away = run.buildOpponentSnapshot(opp, data);
      for (const seed of [1, 2]) play(match.createMatch({ data, seed: `j1|${i}|${opp.id}|${seed}`, home, away, possessions: 8, kind: "friendly" }));
    }
  }
  const home = homes[0];
  const mirror = clone(home);
  mirror.side = "away";
  mirror.name = "미러 클럽";
  mirror.players.forEach((p) => { p.id = `q_${p.id}`; });
  for (let seed = 1; seed <= 200; seed++) {
    if (match.simulateAuto(match.createMatch({ data, seed, home, away: mirror, possessions: 8, kind: "goal" }), data).stage !== "penalties") continue;
    play(match.createMatch({ data, seed, home, away: mirror, possessions: 8, kind: "goal" }));
    break;
  }
  return out;
}
const VIEWS = engineViews();

/** 공 가진 선수 → 받는 선수 후보 화살표 가림 벌점 (layout.js arrowBlock · boxDepths 와 같은 식) */
function segDist(p, a, b, aspect) {
  const ax = a.x, ay = a.y / aspect, dx = b.x - ax, dy = b.y / aspect - ay, px = p.x - ax, py = p.y / aspect - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}
function arrowBlock(L, geo) {
  const byKey = new Map(L.tokens.map((t) => [`${t.side}:${t.id}`, t]));
  const atk = L.attackingSide;
  const C = byKey.get(`${atk}:${L.carrierId}`);
  if (!C) return 0;
  let score = 0;
  for (const rid of L.receiverIds) {
    const R = byKey.get(`${atk}:${rid}`);
    let pen = 0;
    for (const t of L.tokens) {
      if (t === C || t === R) continue;
      if (segDist(t, C, R, geo.aspect) >= geo.tokenSize * 100 * BOX_LANE.clear) continue;
      pen += t.role === "receiver" ? 10 : t.role === "broken" ? 1 : 3;
    }
    score += pen * (rid === L.receiverId ? 2 : 1);
  }
  return score;
}

/** 공격 방향 기준 세로 (0 = 공격 팀 골) — 흔들림의 구역 띠는 이 좌표의 구역 (경계 위면 공격 방향 쪽 구역) */
const fyOf = (L, y) => (L.attackingSide === "away" ? 100 - y : y);
const zoneOf = (L, y) => ZONES[zoneAtY(fyOf(L, y)) - 1];

/** 흔든 배치 J 가 흔들기 전 배치 A 에 대해 지키는 것 (§11 — J2) */
function assertJittered(view, A, J, geo, where) {
  const minD = geo.tokenSize * 100;
  assert.equal(J.tokens.length, A.tokens.length, `${where}: 토큰 수`);
  // 역할 · 순서 · 표시 정보는 그대로 — 좌표만 다르다
  const strip = (L) => ({ ...L, ball: null, nextBall: L.nextBall ? L.nextBall.y : null, tokens: L.tokens.map((t) => ({ ...t, x: 0, y: 0 })) });
  assert.deepEqual(strip(J), strip(A), `${where}: 좌표 밖은 같다`);
  const byKeyA = new Map(A.tokens.map((t) => [`${t.side}:${t.id}`, t]));
  const byKeyJ = new Map(J.tokens.map((t) => [`${t.side}:${t.id}`, t]));
  const play = A.mode === "play";
  for (let i = 0; i < J.tokens.length; i++) {
    const a = A.tokens[i];
    const t = J.tokens[i];
    const gk = t.position === "GK";
    // 가로 최대 비낌 (GK 는 세로도 작게) · 필드 안 (가로 [6, 94] ⊂ [5, 95])
    assert.ok(Math.abs(t.x - a.x) <= (gk ? JITTER.gkAx : JITTER.ax) + TOL, `${where}: ${t.id} 가로 비낌 ${t.x - a.x}`);
    assert.ok(Math.abs(t.y - a.y) <= (gk ? JITTER.gkAy : JITTER.ay) + TOL, `${where}: ${t.id} 세로 비낌 ${t.y - a.y}`);
    assert.ok(t.x >= X_MIN - TOL && t.x <= X_MAX + TOL, `${where}: ${t.id} x=${t.x} 필드 안`);
    // 비낌은 0.1 단위 (화면 data-x · data-y 소수 1자리)
    for (const k of ["x", "y"]) {
      const q = (t[k] - a[k]) * 10;
      assert.ok(Math.abs(q - Math.round(q)) < 1e-6, `${where}: ${t.id} ${k} 비낌 0.1 단위 (${t[k] - a[k]})`);
    }
    if (play) {
      // 맡은 구역 그대로 (공격 방향 기준) · 띠 안 = 경계에서 edge 안쪽 (처음부터 더 가까웠으면 그 자리보다 바깥으로 가지 않는다)
      const z = zoneOf(A, a.y);
      assert.equal(zoneOf(A, t.y).id, z.id, `${where}: ${t.id} 구역 그대로 (y ${a.y} → ${t.y})`);
      const f = fyOf(A, t.y);
      const f0 = fyOf(A, a.y);
      assert.ok(f >= Math.min(f0, z.from + JITTER.edge) - TOL && f <= Math.max(f0, z.to - JITTER.edge) + TOL, `${where}: ${t.id} 구역 띠 안 (${f0} → ${f})`);
    }
    for (let j = i + 1; j < J.tokens.length; j++) {
      const b = A.tokens[j];
      const u = J.tokens[j];
      // 간격: 흔들기 전보다 가까워지지 않는다 (minD 아래로는)
      const need = Math.min(minD, tokenDistance(a, b, geo.aspect));
      const d = tokenDistance(t, u, geo.aspect);
      assert.ok(d >= need - TOL, `${where}: ${t.id} ↔ ${u.id} 간격 ${d.toFixed(3)} < ${need.toFixed(3)}`);
      // 같은 편 · 같은 구역: 좌우 순서 그대로 (서로 가로지르지 않는다), 다른 라인이면 앞뒤 순서도 — 간격 ≥ min(처음 간격, keep)
      if (play && t.side === u.side && zoneOf(A, a.y).id === zoneOf(A, b.y).id) {
        const order = (axis, keep, what) => {
          const d0 = b[axis] - a[axis];
          const d1 = u[axis] - t[axis];
          if (Math.abs(d0) < TOL) return;
          assert.ok(sign(d1) === sign(d0) && Math.abs(d1) >= Math.min(Math.abs(d0), keep) - TOL, `${where}: ${t.id} ↔ ${u.id} ${what} (${d0} → ${d1})`);
        };
        order("x", JITTER.keepX, "좌우 순서");
        if (t.position !== u.position) order("y", JITTER.keepY, "라인 앞뒤 순서");
      }
    }
  }
  if (A.mode !== "play") return;
  const atk = A.attackingSide;
  const def = other(atk);
  const cA = byKeyA.get(`${atk}:${A.carrierId}`);
  const cJ = byKeyJ.get(`${atk}:${J.carrierId}`);
  // 공 = 공 가진 선수 (없으면 공 그대로 — 골로 끝난 모습), nextBall 가로 = 공 가로 · 세로 = 다음 단계 그대로
  if (cJ) assert.deepEqual(J.ball, { x: cJ.x, y: cJ.y }, `${where}: 공 = 공 가진 선수`);
  else assert.deepEqual(J.ball, A.ball, `${where}: 공 가진 선수가 없으면 공 그대로`);
  if (J.nextBall) assert.deepEqual(J.nextBall, { x: J.ball.x, y: A.nextBall.y }, `${where}: nextBall`);
  assert.equal(zoneOf(A, J.ball.y).id, zoneOf(A, A.ball.y).id, `${where}: 공 구역 그대로`);
  assert.equal(zoneAtY(J.ball.y), zoneAtY(A.ball.y), `${where}: 공 구역 그대로 (화면 구역)`);
  // 듀얼 둘 (배급이면 롱패스 받는 선수 + 경합 상대) = 한 비낌: 수비 − 공 가진 선수 벡터 그대로
  const dKey = `${def}:${A.defenderId}`;
  const mateKey = A.dist ? `${atk}:${A.dist.long}` : `${atk}:${A.carrierId}`;
  const dA = byKeyA.get(dKey);
  const mA = byKeyA.get(mateKey);
  if (dA && mA) {
    const dJ = byKeyJ.get(dKey);
    const mJ = byKeyJ.get(mateKey);
    assert.ok(Math.abs((dJ.x - mJ.x) - (dA.x - mA.x)) < TOL && Math.abs((dJ.y - mJ.y) - (dA.y - mA.y)) < TOL, `${where}: 듀얼 둘 함께 (벡터 그대로)`);
  }
  if (A.dist) {
    // 배급: GK (공) 는 자기 박스 안, 나머지 13명은 GK 앞
    const gkZone = atk === "home" ? 1 : 5;
    assert.equal(zoneAtY(J.ball.y), gkZone, `${where}: 배급 GK 는 자기 박스`);
    for (const t of J.tokens) if (t !== cJ) assert.ok(atk === "home" ? t.y > J.ball.y : t.y < J.ball.y, `${where}: ${t.id} 는 배급 GK 앞`);
  } else if (cA) {
    // 수비 팀 전원 (듀얼 수비 제외) · 받는 선수 후보: 공 앞 · 뒤 그대로, 간격 ≥ min(처음 간격, keepY)
    const keepSide = (t, ref0, ref1, axis, keep, what) => {
      const d0 = byKeyA.get(`${t.side}:${t.id}`)[axis] - ref0[axis];
      const d1 = t[axis] - ref1[axis];
      if (Math.abs(d0) < TOL) return;
      assert.equal(sign(d1), sign(d0), `${where}: ${t.id} ${what} 같은 쪽 (${d0} → ${d1})`);
      assert.ok(Math.abs(d1) >= Math.min(Math.abs(d0), keep) - TOL, `${where}: ${t.id} ${what} 간격 ${d1}`);
    };
    for (const t of J.tokens) {
      if (t.side === def && t.id !== A.defenderId) keepSide(t, cA, cJ, "y", JITTER.keepY, "공 앞 · 뒤");
      if (t.side === atk && t.role === "receiver") {
        keepSide(t, cA, cJ, "y", JITTER.keepY, "받는 선수 공 앞 · 뒤");
        if (A.attackStep >= 3) keepSide(t, cA, cJ, "x", JITTER.keepX, "박스 후보 좌우");
      }
      if (t.role === "cover" && dA) keepSide(t, dA, byKeyJ.get(dKey), "x", JITTER.keepX, "커버 좌우");
    }
    // 화살표 가림이 흔들기 전보다 늘지 않는다
    if (A.receiverIds.length) assert.ok(arrowBlock(J, geo) <= arrowBlock(A, geo), `${where}: 화살표 가림 ${arrowBlock(A, geo)} → ${arrowBlock(J, geo)}`);
  }
}

const opt = (geo, seed) => ({ ...geo, jitter: { seed } });

/* ------------------------------------------------------------------ */

test("J1 · J2 jitter 없음 = 예전 배치 그대로 · 같은 열쇠 = 같은 배치 (다시 계산 · JSON 왕복 · 결정 필드) · 난수 없음 · view 를 바꾸지 않음", () => {
  const realRandom = Math.random;
  Math.random = () => { throw new Error("Math.random 을 쓰면 안 된다"); };
  try {
    let n = 0;
    for (const { view, seed } of VIEWS.filter((_, i) => i % 3 === 0)) {
      for (const [g, geo] of Object.entries(GEOS)) {
        const where = `${g} ${seed} seq ${view.lastBeat?.seq}`;
        const A = computeLayout(view, geo);
        for (const off of [null, false, undefined, 0]) assert.deepEqual(computeLayout(view, { ...geo, jitter: off }), A, `${where}: jitter ${off} = 예전`);
        const before = JSON.stringify(view);
        const J = computeLayout(view, opt(geo, seed));
        assert.equal(JSON.stringify(view), before, `${where}: view 그대로`);
        assert.deepEqual(computeLayout(view, opt(geo, seed)), J, `${where}: 같은 view 다시 계산`);
        assert.deepEqual(computeLayout(clone(view), opt(geo, seed)), J, `${where}: JSON 왕복 (이어하기)`);
        // 같은 비트 안에서 바뀌는 결정 필드 (간파 · 예상 · 스킬 · 외침 · 결정 대기) 는 자리에 영향이 없다
        const tweaked = { ...view, needsDecision: !view.needsDecision, outcomes: null, skills: [], aceCall: null, expected: null, gaanpa: null, tension: { home: 0, away: 99 } };
        assert.deepEqual(computeLayout(tweaked, opt(geo, seed)), J, `${where}: 결정 필드는 열쇠가 아니다`);
        assert.equal(JSON.stringify(JSON.parse(JSON.stringify(J))), JSON.stringify(J), `${where}: JSON 직렬화`);
        if (J.mode === "penalties") assert.deepEqual(J, A, `${where}: 승부차기는 흔들지 않는다`);
        n++;
      }
    }
    assert.ok(n > 200, `검사한 배치 ${n}`);
  } finally {
    Math.random = realRandom;
  }
  // 해시 = zones.hash32 와 같은 식 (사본)
  for (const s of ["", "J1|1|3|17|home", "레슨|x", "a".repeat(80)]) assert.equal(hash32(s), zones.hash32(s), `hash32("${s.slice(0, 20)}")`);
});

test("J2 비트마다 다른 자리 = 맡은 구역 띠 안 무작위: 띠 · 필드 안 · 가로 ±ax · GK 작게 · 좌우 · 라인 순서 · 간격 ≥ min(minD, 처음 거리) · 듀얼 둘 함께 · 공 = 공 가진 선수 · 공 앞뒤 · 좌우 · 배급 · 가림 (실제 엔진, 2.5D · 평면 간격)", () => {
  const seen = new Set();
  let moved = 0;
  let total = 0;
  let tokMoved = 0;
  let tokTotal = 0;
  // J2 넓이: 골 방향은 구역 띠 어디든 (J1 ±3.5 보다 멀리), 가로는 ±ax (J1 ±5 보다 멀리) — GK 빼고
  let field = 0;
  let farY = 0;
  let farX = 0;
  let maxY = 0;
  const thirds = [0, 0, 0]; // 띠 안 자리 (공격 방향 기준 뒤 · 가운데 · 앞 셋째) — 띠 전체를 쓴다
  for (const { view, seed } of VIEWS) {
    for (const [g, geo] of Object.entries(GEOS)) {
      const A = computeLayout(view, geo);
      const J = computeLayout(view, opt(geo, seed));
      const where = `${g} ${seed} #${view.lastBeat?.seq} ${view.phase} ${view.attackingSide} L${view.lineIndex}`;
      assertJittered(view, A, J, geo, where);
      if (A.mode !== "play") continue;
      seen.add(A.dist ? "dist" : view.finished ? `fin-${view.lastBeat?.type}` : `${A.attackingSide}${A.attackStep}`);
      total++;
      const n = J.tokens.filter((t, i) => Math.hypot(t.x - A.tokens[i].x, t.y - A.tokens[i].y) > 0.3).length;
      tokMoved += n;
      tokTotal += J.tokens.length;
      if (n >= J.tokens.length / 2) moved++;
      J.tokens.forEach((t, i) => {
        if (t.position === "GK") return;
        const a = A.tokens[i];
        field++;
        if (Math.abs(t.y - a.y) > 3.5 + TOL) farY++;
        if (Math.abs(t.x - a.x) > 5 + TOL) farX++;
        maxY = Math.max(maxY, Math.abs(t.y - a.y));
        const z = zoneOf(A, a.y);
        const q = (fyOf(A, t.y) - (z.from + JITTER.edge)) / (z.to - z.from - 2 * JITTER.edge);
        thirds[Math.max(0, Math.min(2, Math.floor(q * 3)))]++;
      });
    }
  }
  for (const k of ["home0", "home1", "home2", "home3", "away0", "away1", "away2", "away3", "dist", "fin-goal"]) assert.ok(seen.has(k), `상황 ${k} (${[...seen].join(",")})`);
  // 흔들림이 보인다: 거의 모든 배치에서 절반 이상의 선수가 0.3 넘게 비낀다
  assert.ok(moved / total > 0.9, `절반 이상 비낀 배치 ${moved}/${total}`);
  assert.ok(tokMoved / tokTotal > 0.85, `비낀 선수 ${tokMoved}/${tokTotal}`);
  // J1 범위 (세로 ±3.5 · 가로 ±5) 밖으로 간 선수가 흔하다 · 띠 뒤 · 가운데 · 앞 셋째를 모두 쓴다
  assert.ok(farY / field > 0.25 && maxY > 12, `세로 3.5 넘게 ${farY}/${field} · 최대 ${maxY}`);
  assert.ok(farX / field > 0.1, `가로 5 넘게 ${farX}/${field}`);
  for (const [i, c] of thirds.entries()) assert.ok(c / field > 0.12, `띠 ${i + 1}번째 셋째 ${c}/${field} (${thirds})`);
});

/** 경기 화면이 넘기는 흔들림 옵션 (screens/match.js layoutFor): ref = 미리보기를 고르기 전의 엔진 view */
const optRef = (geo, seed, ref) => ({ ...geo, jitter: { seed, ref } });
const xy = (L) => L.tokens.map((t) => [t.x, t.y]);
const sameXY = (a, b) => JSON.stringify(xy(a)) === JSON.stringify(xy(b));
/**
 * 같은 비트 안에서 화면이 그릴 수 있는 미리보기 변형 전부 (screens/match.js shownView = resolvePreview): 결정 중 스킬 토글 · 필살기 토글 ·
 * 스킬 + 필살기 · 자동 진행 (deciding false — 확정할 수 없는 후보 숨김). 기준 view 와 같은 것은 뺀다
 */
function screenVariants(view) {
  const keys = new Set([...Object.keys(view.receiverPreviewBySkill || {}), ...Object.keys(view.outcomesBySkill || {}), ...Object.keys(view.receiversBySkill || {})]);
  for (const s of view.skills || []) if (s && s.skillId) keys.add(s.skillId);
  const out = [["auto", resolvePreview(view, { deciding: false })], ["ultimate", resolvePreview(view, { ultimate: true, deciding: true })]];
  for (const skillId of keys) {
    out.push([`skill ${skillId}`, resolvePreview(view, { skillId, deciding: true })]);
    out.push([`skill ${skillId} + ultimate`, resolvePreview(view, { skillId, ultimate: true, deciding: true })]);
  }
  return out.filter(([, sv]) => sv !== view);
}
/** 만든 변형 (화면은 그리지 않는다): 기본 받는 선수만 다른 후보로 바꾼 것 · 없앤 것 (J1 — 역할만 바뀌는 경우) */
function madeVariants(view) {
  const out = [];
  const ids = new Set();
  for (const a of ["pass", "cross"]) for (const id of view.receivers?.[a]?.candidates || []) ids.add(String(id));
  for (const id of ids) if (id !== String(view.receiverPreview?.id)) out.push([`rp ${id}`, { ...view, receiverPreview: { ...(view.receiverPreview || {}), id } }]);
  if (view.receiverPreview) out.push(["rp null", { ...view, receiverPreview: null }]);
  return out;
}
/**
 * 같은 비트의 변형들 (list = [{ what, A: 흔들기 전, J: 흔든 배치 }]): 어느 둘 사이에서도 규칙 자리가 같은 선수는 흔든 자리도 같다 (J2 — 토글은 규칙 자리가
 * 바뀐 선수만 옮긴다). → { pairs, ruleChanged: 규칙 자리가 바뀐 쌍, kept: 그 쌍들에서 그대로 선 선수 수, whats: 규칙 자리가 바뀐 변형 이름 }
 */
function assertStable(list, where) {
  const out = { pairs: 0, ruleChanged: 0, kept: 0, whats: new Set() };
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      out.pairs++;
      let changed = 0;
      let kept = 0;
      a.A.tokens.forEach((t, k) => {
        const u = b.A.tokens[k];
        assert.equal(`${u.side}:${u.id}`, `${t.side}:${t.id}`, `${where}: 같은 순서`);
        if (t.x !== u.x || t.y !== u.y) {
          changed++;
          return;
        }
        kept++;
        const p = a.J.tokens[k];
        const q = b.J.tokens[k];
        assert.ok(p.x === q.x && p.y === q.y, `${where} ${a.what} ↔ ${b.what}: ${t.side}:${t.id} 규칙 자리 그대로인데 흔든 자리가 바뀜 (${p.x},${p.y} → ${q.x},${q.y})`);
      });
      if (changed) {
        out.ruleChanged++;
        out.kept += kept;
        out.whats.add(a.what);
        out.whats.add(b.what);
      }
    }
  }
  return out;
}

test("J1 · J2 열쇠: 마지막 비트 seq · 포제션 · 공격 팀 · 경기 seed 가 바뀌면 새 자리, 같은 비트 안의 변형 (스킬 · 필살기 토글 · 자동/수동 · 기본 받는 선수) 은 규칙 자리가 같은 선수를 옮기지 않는다", () => {
  const plays = VIEWS.filter(({ view }) => !view.finished && view.phase === "decision" && view.lastBeat);
  assert.ok(plays.length > 50);
  let diffSeq = 0;
  let diffSeed = 0;
  let checked = 0;
  let roleChanged = 0;
  let screenPairs = 0;
  for (const { view, seed } of plays) {
    for (const [g, geo] of Object.entries(GEOS)) {
      const J = computeLayout(view, opt(geo, seed));
      assert.deepEqual(computeLayout(view, optRef(geo, seed, view)), J, "ref = 그 view 면 ref 없음과 같다");
      if (g === "d25") {
        const bumped = { ...view, lastBeat: { ...view.lastBeat, seq: view.lastBeat.seq + 1 } };
        if (!sameXY(computeLayout(bumped, opt(geo, seed)), J)) diffSeq++;
        if (!sameXY(computeLayout(view, opt(geo, `${seed}x`)), J)) diffSeed++;
        // 다른 비트의 ref 는 쓰지 않는다 (그 view 를 기준으로)
        assert.deepEqual(computeLayout(bumped, optRef(geo, seed, view)), computeLayout(bumped, opt(geo, seed)), "다른 비트의 ref 는 무시");
      }
      // 화면 변형 (shownView, ref = 엔진 view): 규칙 자리가 바뀌는 변형도 빼지 않고 — 어느 둘 사이에서도 규칙 자리가 같은 선수는 흔든 자리도 같다.
      // 흔든 변형도 §11 을 지킨다 (그 변형의 받는 선수 · 화살표 기준)
      const A0 = computeLayout(view, geo);
      const where = `${g} ${seed} #${view.lastBeat.seq}`;
      const list = [{ what: "base", A: A0, J }];
      for (const [what, sv] of screenVariants(view)) {
        const A1 = computeLayout(sv, geo);
        const J1 = computeLayout(sv, optRef(geo, seed, view));
        assertJittered(sv, A1, J1, geo, `${where} ${what}`);
        list.push({ what, A: A1, J: J1 });
        if (sameXY(A1, A0)) {
          checked++;
          if (JSON.stringify([A1.receiverIds, A1.receiverId]) !== JSON.stringify([A0.receiverIds, A0.receiverId])) roleChanged++;
        }
      }
      screenPairs += assertStable(list, where).pairs;
      // 만든 변형 (기본 받는 선수만 바뀐 것 — 화면은 그리지 않는다): 흔들기 전 자리가 기본과 같으면 흔든 자리도 같다 (J1)
      for (const [what, sv] of madeVariants(view)) {
        const A1 = computeLayout(sv, geo);
        const J1 = computeLayout(sv, optRef(geo, seed, view));
        assertJittered(sv, A1, J1, geo, `${where} ${what}`);
        if (!sameXY(A1, A0)) continue;
        checked++;
        if (JSON.stringify([A1.receiverIds, A1.receiverId]) !== JSON.stringify([A0.receiverIds, A0.receiverId])) roleChanged++;
        assert.deepEqual(xy(J1), xy(J), `${where} ${what}: 변형을 그려도 그대로`);
      }
    }
  }
  assert.ok(diffSeq / plays.length > 0.95, `seq 가 바뀌면 새 자리 ${diffSeq}/${plays.length}`);
  assert.ok(diffSeed / plays.length > 0.95, `seed 가 바뀌면 새 자리 ${diffSeed}/${plays.length}`);
  // 역할이 바뀌는 변형 (자동 진행 후보 숨김 · 기본 받는 선수) 을 실제로 많이 거쳤다
  assert.ok(checked > 300 && roleChanged > 100 && screenPairs > 300, `규칙 자리가 같은 변형 ${checked} · 그중 받는 선수 표시가 바뀐 것 ${roleChanged} · 화면 변형 쌍 ${screenPairs}`);
  // 같은 비트의 연속 view (결정 대기 → 간파 등, seq 같음) 는 흔들기 전 자리가 같으면 흔든 자리도 같다 — 포제션 · 공격 팀도 열쇠
  const base = plays[0];
  const A = computeLayout(base.view, opt(GEOS.d25, base.seed));
  const pos2 = { ...base.view, possession: (base.view.possession ?? 0) + 1 };
  assert.notDeepEqual(computeLayout(pos2, opt(GEOS.d25, base.seed)).tokens, A.tokens, "포제션이 바뀌면 새 자리");
});

test("J2 회귀 (검증 차단 버그): 스루 패스 · 필살기 (extra line) 토글은 규칙 자리가 바뀐 받는 선수만 옮긴다 — 16 · 17 · 28 · 31 · 36 시나리오를 여러 비트 진행 (2.5D · 평면)", async () => {
  const SC = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = SC.loadData();
  const total = { pairs: 0, ruleChanged: 0, kept: 0, whats: new Set() };
  const bySeq = new Map(); // 16_skill_row_4 비트 seq → view (검증에서 찾은 #12 · #24 · #35)
  for (const name of ["16_skill_row_4", "17_skill_row_many", "28_injured_plays", "31_ult_dribble_extra", "36_through_pass"]) {
    const prep = SC.buildScenarioState(sdata, SC.SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    const ms = prep.matchState;
    for (let g = 0; g < 60; g++) {
      const view = SC.match.getMatchView(ms, sdata, "home");
      if (name === "16_skill_row_4" && !bySeq.has(view.lastBeat?.seq)) bySeq.set(view.lastBeat?.seq, { view, seed: ms.seed });
      for (const [gn, geo] of Object.entries(GEOS)) {
        const where = `${name} ${gn} #${view.lastBeat?.seq}`;
        const list = [["base", view], ...screenVariants(view)].map(([what, sv]) => {
          const A = computeLayout(sv, geo);
          const J = computeLayout(sv, optRef(geo, ms.seed, view));
          assertJittered(sv, A, J, geo, `${where} ${what}`);
          return { what, A, J };
        });
        const r = assertStable(list, where);
        total.pairs += r.pairs;
        total.ruleChanged += r.ruleChanged;
        total.kept += r.kept;
        for (const w of r.whats) total.whats.add(w.replace(/ \+ ultimate$/, ""));
      }
      if (SC.match.isFinished(ms)) break;
      SC.match.step(ms, sdata, null);
    }
  }
  // 규칙 자리가 바뀌는 토글을 실제로 거쳤다: 스루 패스 · 필살기 — 그 쌍들에서 규칙 자리가 같은 선수 (공 가진 선수 · 듀얼 수비 · 커버 …) 는 모두 그대로
  assert.ok(total.ruleChanged >= 40 && total.kept > 400, `규칙 자리가 바뀐 변형 쌍 ${total.ruleChanged} · 그대로 선 선수 ${total.kept}`);
  for (const w of ["skill sk_through_pass", "ultimate"]) assert.ok(total.whats.has(w), `${w} (${[...total.whats].join(", ")})`);
  // 검증에서 찾은 장면 (16_skill_row_4 #12 · #24 · #35, 2.5D): 스루 패스를 켜면 옮기는 선수 = 규칙 자리가 바뀐 받는 선수 (p6 · p7) 뿐 — 공 · 듀얼 · 커버 그대로
  for (const seq of [12, 24, 35]) {
    const at = bySeq.get(seq);
    assert.ok(at, `16_skill_row_4 #${seq} (${[...bySeq.keys()].join(",")})`);
    const { view, seed } = at;
    const sv = resolvePreview(view, { skillId: "sk_through_pass", deciding: true });
    assert.notEqual(sv, view, `#${seq}: 스루 패스 변형이 있다`);
    const key = (t) => `${t.side}:${t.id}`;
    const diff = (P, Q) => P.tokens.filter((t, i) => t.x !== Q.tokens[i].x || t.y !== Q.tokens[i].y).map(key);
    const ruleMoved = diff(computeLayout(view, GEOS.d25), computeLayout(sv, GEOS.d25));
    const J0 = computeLayout(view, optRef(GEOS.d25, seed, view));
    const J1 = computeLayout(sv, optRef(GEOS.d25, seed, view));
    const moved = diff(J0, J1);
    assert.deepEqual(ruleMoved, ["home:p6", "home:p7"], `#${seq}: 규칙 자리가 바뀐 선수`);
    assert.ok(moved.length > 0 && moved.every((k) => ruleMoved.includes(k)), `#${seq}: 옮긴 선수 ${moved} ⊆ ${ruleMoved}`);
    assert.deepEqual(J1.ball, J0.ball, `#${seq}: 공 그대로`);
  }
});

test("J1 회귀 (16_skill_row_4 · 17_skill_row_many): 자동 ↔ 수동 (deciding false ↔ true) 로 받는 선수 후보가 숨겨져도 흔든 자리는 그대로", async () => {
  const SC = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = SC.loadData();
  for (const name of ["16_skill_row_4", "17_skill_row_many"]) {
    const prep = SC.buildScenarioState(sdata, SC.SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    const ms = prep.matchState;
    const view = SC.match.getMatchView(ms, sdata, "home");
    assert.ok(view.needsDecision && view.attackingSide === "home", `${name}: 사람 공격 결정 대기`);
    const manual = resolvePreview(view, { deciding: true });
    const auto = resolvePreview(view, { deciding: false });
    for (const [g, geo] of Object.entries(GEOS)) {
      const where = `${name} ${g} #${view.lastBeat?.seq}`;
      const Am = computeLayout(manual, geo);
      const Aa = computeLayout(auto, geo);
      // 이 장면: 자동이면 후보를 숨겨 (불확실한 스킬 변형) 역할이 receiver → support 로 바뀌지만 규칙 자리는 같다
      assert.ok(Am.receiverIds.length > 0 && Aa.receiverIds.length === 0, `${where}: 자동이면 후보 숨김 (${Am.receiverIds} → ${Aa.receiverIds})`);
      assert.ok(sameXY(Am, Aa), `${where}: 규칙 자리는 같다`);
      const Jm = computeLayout(manual, optRef(geo, ms.seed, view));
      const Ja = computeLayout(auto, optRef(geo, ms.seed, view));
      assert.ok(!sameXY(Jm, Am), `${where}: 흔들렸다`);
      assert.deepEqual(xy(Ja), xy(Jm), `${where}: 자동 ↔ 수동 전환에 아무도 움직이지 않는다`);
      assertJittered(manual, Am, Jm, geo, `${where} 수동`);
      assertJittered(auto, Aa, Ja, geo, `${where} 자동`);
      // 필살기 · 스킬 토글도 (규칙 자리가 같으면) 그대로
      for (const [what, sv] of [...screenVariants(view), ...madeVariants(view)]) {
        const A1 = computeLayout(sv, geo);
        if (sameXY(A1, Am)) assert.deepEqual(xy(computeLayout(sv, optRef(geo, ms.seed, view))), xy(Jm), `${where} ${what}: 그대로`);
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* 스위치 (store.isLayoutJitter)                                         */
/* ------------------------------------------------------------------ */

async function storeAt(pathname, search, tag) {
  const had = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { value: { pathname, search }, configurable: true, writable: true });
  try {
    return await import(`${STORE}?jitter-${tag}`);
  } finally {
    if (had) Object.defineProperty(globalThis, "location", had);
    else delete globalThis.location;
  }
}

test("J1 스위치 (store.isLayoutJitter): 2.5D 모드 기본 켬 · 평면 기본 끔 · ?jitter=0 끔 · ?jitter=1 평면에서도 켬 · 테스트용 바꾸기", async () => {
  const plain = await import(STORE);
  assert.equal(plain.isLayoutJitter(), false, "테스트 · 로컬 기본 = 평면 = 끔");
  plain.setD25ForTest(true);
  assert.equal(plain.isLayoutJitter(), true, "2.5D 모드를 따른다");
  plain.setLayoutJitterForTest(false);
  assert.equal(plain.isLayoutJitter(), false, "테스트용 끄기");
  plain.setD25ForTest(null);
  plain.setLayoutJitterForTest(true);
  assert.equal(plain.isLayoutJitter(), true, "테스트용 켜기 (평면)");
  plain.setLayoutJitterForTest(null);
  assert.equal(plain.isLayoutJitter(), false, "null = 기본값으로");
  const cases = [
    ["/soccer/", "", false, "local"],
    ["/soccer/", "?d25=1", true, "d25"],
    ["/soccer/", "?d25=1&jitter=0", false, "d25off"],
    ["/soccer/", "?jitter=1", true, "flaton"],
    ["/soccer/", "?jitter=on&auto=0", true, "flaton2"],
    ["/soccer/sprite/", "", true, "sprite"],
    ["/soccer/sprite/", "?jitter=0", false, "sprite0"],
    ["/soccer/sprite/", "?jitter=off", false, "spriteoff"],
    ["/soccer/sprite/", "?flat=1", false, "spriteflat"],
    ["/soccer/sprite/", "?flat=1&jitter=1", true, "spriteflat1"],
  ];
  for (const [p, q, want, tag] of cases) {
    const st = await storeAt(p, q, tag);
    assert.equal(st.isLayoutJitter(), want, `${p}${q}`);
    st.setLayoutJitterForTest(!want);
    assert.equal(st.isLayoutJitter(), !want, `${p}${q} 바꾸기`);
    st.setLayoutJitterForTest(null);
    assert.equal(st.isLayoutJitter(), want, `${p}${q} 기본값으로`);
  }
});

/* ------------------------------------------------------------------ */
/* 경기 화면 (jsdom)                                                      */
/* ------------------------------------------------------------------ */

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}

test("jsdom: 경기 화면 — 2.5D 는 흔든 자리 (받는 선수 탭 · 자동 ↔ 수동 · 다시 그리기에서 그대로, 스루 패스 토글은 규칙 자리가 바뀐 선수만, 비트 뒤 새 자리), 평면 기본 = 예전 자리, ?jitter 스위치", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const ST = await import(STORE);
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
  g.fetch = dataFetch(ROOT);
  t.after(() => {
    ST.setD25ForTest(null);
    ST.setLayoutJitterForTest(null);
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
  const ui = S.store.matchUi;
  const { loadData: sLoad, buildScenarioState, SCENARIOS } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = sLoad();
  const inject = (name) => {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    ui.auto = false;
    ui.speed = 4;
    ui.intervene = false;
    S.store.run = prep.runState;
    S.store.match = prep.matchState;
    S.store.screen = "run";
    S.render();
    return doc.querySelector(".match-screen");
  };
  const viewNow = () => S.match.getMatchView(S.store.match, S.store.data, "home");
  /** 화면 토큰 data-x · data-y (소수 1자리) */
  const shown = (scr) => Object.fromEntries([...scr.querySelectorAll(".tok:not(.gone)")].map((el) => [`${el.dataset.side}:${el.dataset.id}`, [Number(el.dataset.x), Number(el.dataset.y)]]));
  const r1 = (x) => Math.round(x * 10) / 10;
  const expect = (L) => Object.fromEntries(L.tokens.map((t) => [`${t.side}:${t.id}`, [r1(t.x), r1(t.y)]]));
  const transforms = (scr) => [...scr.querySelectorAll(".tok:not(.gone)")].map((el) => el.style.transform).join("|");

  // ---- 2.5D (기본 켬): 화면 자리 = 흔든 배치, 흔들기 전과 다르다 ----
  ST.setD25ForTest(true);
  {
    const scr = inject("d25_2v1");
    assert.ok(scr.classList.contains("d25"));
    await until(() => scr.querySelector(".tok.pickable"), 3000);
    const v = viewNow();
    const seed = S.store.match.seed;
    const J = computeLayout(v, opt(GEOS.d25, seed));
    const A = computeLayout(v, GEOS.d25);
    assert.deepEqual(shown(scr), expect(J), "2.5D 화면 자리 = 흔든 배치");
    assert.notDeepEqual(expect(J), expect(A), "흔들기 전 자리와 다르다");
    const ballXY = [Number(scr.querySelector(".m-ball").dataset.x), Number(scr.querySelector(".m-ball").dataset.y)];
    assert.deepEqual(ballXY, [r1(J.ball.x), r1(J.ball.y)], "공 = 흔든 공 가진 선수 자리");
    // 받는 선수 탭 (다시 배치) · 화면 다시 그리기 (이어하기와 같은 경로) 에서 아무도 움직이지 않는다
    const tf0 = transforms(scr);
    const pick = scr.querySelector(".tok.pickable:not(.picked)") || scr.querySelector(".tok.pickable");
    pick.click();
    assert.deepEqual(shown(scr), expect(J), "받는 선수 탭 뒤 그대로");
    assert.equal(transforms(scr), tf0, "토큰 transform 그대로");
    S.render();
    const scr2 = doc.querySelector(".match-screen");
    await until(() => scr2.querySelector(".tok.pickable"), 3000);
    assert.deepEqual(shown(scr2), expect(J), "다시 그려도 같은 자리");
    // 비트 하나 (드리블) 뒤: 새 view 의 흔든 배치
    const before = shown(scr2);
    scr2.querySelector('button[data-action="dribble"]').click();
    await until(() => ui.busy, 2000);
    await until(() => !ui.busy, 6000);
    const v2 = viewNow();
    assert.notEqual(v2.lastBeat?.seq, v.lastBeat?.seq, "새 비트");
    assert.deepEqual(shown(scr2), expect(computeLayout(v2, opt(GEOS.d25, seed))), "비트 뒤 = 새 view 의 흔든 배치");
    assert.notDeepEqual(shown(scr2), before, "비트 뒤 새 자리");
    S.actions.resetToStart();
  }
  // ---- 2.5D 자동 ↔ 수동 전환 (refreshControls → relayout): 받는 선수 후보가 숨겨져도 아무도 움직이지 않는다 (16_skill_row_4) ----
  {
    const scr = inject("16_skill_row_4");
    await until(() => scr.querySelector(".tok.pickable"), 3000);
    const v = viewNow();
    const seed = S.store.match.seed;
    const J = computeLayout(v, opt(GEOS.d25, seed));
    assert.deepEqual(shown(scr), expect(J), "수동 = 흔든 배치");
    const tf0 = transforms(scr);
    const pickable0 = scr.querySelectorAll(".tok.pickable").length;
    scr.querySelector(".auto-btn").click(); // 자동 ON (같은 비트 — 다음 비트는 타이머 뒤)
    assert.equal(ui.auto, true);
    assert.ok(scr.querySelectorAll(".tok.pickable").length < pickable0, "자동이면 후보 표시가 바뀐다");
    assert.deepEqual(shown(scr), expect(J), "자동으로 바꿔도 그대로");
    assert.equal(transforms(scr), tf0, "토큰 transform 그대로");
    scr.querySelector(".auto-btn").click(); // 자동 OFF (타이머 취소 — 다시 결정 대기)
    assert.equal(ui.auto, false);
    assert.equal(viewNow().lastBeat?.seq, v.lastBeat?.seq, "같은 비트");
    assert.deepEqual(shown(scr), expect(J), "수동으로 돌아와도 그대로");
    // J2: 스루 패스 토글 — 규칙 자리가 바뀐 받는 선수 (도착 구역 +1) 만 옮기고 공 · 듀얼 둘 · 커버 · 나머지는 그대로, 끄면 제자리
    const btn = scr.querySelector('.sk-btn[data-skill="sk_through_pass"]');
    assert.ok(btn && !btn.disabled, "스루 패스 버튼");
    const sv = resolvePreview(v, { skillId: "sk_through_pass", deciding: true });
    const A0 = expect(computeLayout(v, GEOS.d25));
    const A1 = expect(computeLayout(sv, GEOS.d25));
    const ruleMoved = Object.keys(A0).filter((k) => String(A0[k]) !== String(A1[k]));
    const before = shown(scr);
    btn.click();
    assert.equal(ui.selectedSkillId, "sk_through_pass");
    const after = shown(scr);
    assert.deepEqual(after, expect(computeLayout(sv, { ...GEOS.d25, jitter: { seed, ref: v } })), "스루 패스 = 그 변형의 흔든 배치");
    const moved = Object.keys(before).filter((k) => String(before[k]) !== String(after[k]));
    assert.ok(ruleMoved.length > 0 && moved.length > 0, `옮긴 선수 ${moved} · 규칙 자리가 바뀐 선수 ${ruleMoved}`);
    assert.ok(moved.every((k) => ruleMoved.includes(k)), `스루 패스로 옮긴 선수 ${moved} ⊆ 규칙 자리가 바뀐 선수 ${ruleMoved}`);
    scr.querySelector('.sk-btn[data-skill="sk_through_pass"]').click(); // 끄기
    assert.equal(ui.selectedSkillId, null);
    assert.deepEqual(shown(scr), before, "스루 패스를 끄면 제자리");
    S.actions.resetToStart();
  }
  // ---- 2.5D + ?jitter=0 (테스트용 끄기): 예전 자리 ----
  ST.setLayoutJitterForTest(false);
  {
    const scr = inject("d25_2v1");
    assert.deepEqual(shown(scr), expect(computeLayout(viewNow(), GEOS.d25)), "흔들림 끔 = 예전 2.5D 자리");
    S.actions.resetToStart();
  }
  // ---- 평면 기본 = 끔 (예전 자리), ?jitter=1 (테스트용 켜기) = 평면 간격으로 흔든 자리 ----
  ST.setD25ForTest(false);
  ST.setLayoutJitterForTest(null);
  {
    const scr = inject("d25_2v1");
    assert.ok(!scr.classList.contains("d25"));
    assert.deepEqual(shown(scr), expect(computeLayout(viewNow(), GEOS.flat)), "평면 기본 = 예전 자리");
    S.actions.resetToStart();
  }
  ST.setLayoutJitterForTest(true);
  {
    const scr = inject("d25_2v1");
    const v = viewNow();
    const J = computeLayout(v, opt(GEOS.flat, S.store.match.seed));
    assert.deepEqual(shown(scr), expect(J), "평면 + ?jitter=1 = 흔든 자리");
    assert.notDeepEqual(expect(J), expect(computeLayout(v, GEOS.flat)));
    S.actions.resetToStart();
  }
});
