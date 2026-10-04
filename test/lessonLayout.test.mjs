// test/lessonLayout.test.mjs — 레슨 화면 좌표 · 연출 계획 (js/ui/lesson_layout.js, DOM 없음) · 카드 앞면 문구 (js/ui/cards.js). LESSON_PROTO_PLAN §6.3 · §9.3 · §14.16 · §14.17
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone } from "./helpers.mjs";
import { tokenSpot, tokenSpots, pointerToField, circlePx, fxPlan, scoreAfterPlay, handStep, FIELD_PX, TOKEN_PX } from "../js/ui/lesson_layout.js";
import { slotSpot } from "../js/ui/lineup.js";
import { slotsOf, FORMATIONS, STATS } from "../js/ui/labels.js";
import * as lessonRun from "../js/engine/lessonRun.js";

const px = (s) => [(s.x / 100) * FIELD_PX.w, (s.y / 100) * FIELD_PX.h];
const dist = (a, b) => { const [ax, ay] = px(a); const [bx, by] = px(b); return Math.hypot(ax - bx, ay - by); };
const inRect = (s, z) => s.x >= z.x && s.x <= z.x + z.w && s.y >= z.y && s.y <= z.y + z.h;

test("tokenSpot: 편성 미니 필드와 같은 자리 (GK 왼쪽 → FW 오른쪽), 필드 안, 토큰끼리 겹치지 않음", () => {
  for (const f of Object.keys(FORMATIONS)) {
    const slots = slotsOf(f);
    const spots = slots.map((s) => tokenSpot(s, slots));
    slots.forEach((s, i) => {
      assert.deepEqual(spots[i], slotSpot(s, slots, { spread: true }), `${f} ${s}: lineup.slotSpot(spread)`);
      assert.ok(spots[i].x > 5 && spots[i].x < 95 && spots[i].y > 5 && spots[i].y < 95, `${f} ${s}: 필드 안`);
    });
    const gk = spots[slots.indexOf("GK")];
    assert.ok(spots.every((p) => p === gk || p.x > gk.x), `${f}: GK 가 가장 왼쪽 (우리 골)`);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      assert.ok(dist(spots[i], spots[j]) >= TOKEN_PX * 2, `${f}: ${slots[i]} · ${slots[j]} 간격 ${dist(spots[i], spots[j]).toFixed(0)}px`);
    }
  }
});

test("handStep: 다 들어가면 카드 폭 + 간격, 넘치면 겹친다 (마지막 카드 오른쪽 끝 = 폭 안)", () => {
  assert.equal(handStep(3, 600, 176, 12), 188);
  assert.equal(handStep(1, 600, 176, 12), 188);
  for (const n of [4, 5, 6, 8]) {
    const step = handStep(n, 600, 176, 12);
    assert.ok(step < 188, `${n}장: 겹침`);
    assert.ok(176 + step * (n - 1) <= 600 + 1e-9, `${n}장: 600 px 안`);
  }
  assert.equal(handStep(30, 600, 176, 12), 28, "최소 간격");
});

test("tokenSpots: 토큰 자리 = 엔진 뷰 positions (경기장 선수), 벤치 · 결장은 null", () => {
  const data = loadData();
  const cfg = data.config;
  const st = lessonRun.createRun({ data, seed: "tokspots", squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation, supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: "team" });
  lessonRun.applyWeekAction(st, data, { type: "lesson", zone: "pass" });
  const benchId = st.players[2].id;
  lessonRun.benchPlayer(st, data, { playerId: benchId, on: true });
  const v = lessonRun.getLessonView(st, data);
  const spots = tokenSpots(v);
  assert.deepEqual(Object.keys(spots), v.players.map((p) => p.id), "뷰 players 순서");
  for (const p of v.players) {
    if (p.bench || p.out) assert.equal(spots[p.id], null, `${p.id}: 벤치 · 결장 = null`);
    else assert.deepEqual(spots[p.id], v.positions[p.id], `${p.id}: = positions`);
  }
  assert.equal(spots[benchId], null, "벤치 선수");
  // 같은 구역 선수는 그 구역 중심 둘레 (대형 반지름 ≤ 6.5u)
  const Z = data.lesson.zones;
  for (const p of v.players.filter((x) => spots[x.id])) {
    const c = Z.centers[p.zone];
    const d = Math.hypot(spots[p.id].x - c.x, (spots[p.id].y - c.y) * Z.aspect);
    assert.ok(d <= 6.5 + 0.2, `${p.id}: ${p.zone} 중심에서 ${d.toFixed(2)}u`);
  }
  assert.deepEqual(tokenSpots(null), {});
});

test("pointerToField: client px → 필드 % (무대 scale 포함 rect), 밖이면 inside false · 0~100 으로 자름", () => {
  const rect = { left: 24, top: 64, width: 968, height: 392 };
  assert.deepEqual(pointerToField(24, 64, rect), { x: 0, y: 0, inside: true });
  assert.deepEqual(pointerToField(24 + 968, 64 + 392, rect), { x: 100, y: 100, inside: true });
  assert.deepEqual(pointerToField(24 + 484, 64 + 117.6, rect), { x: 50, y: 30, inside: true }, "패스 구역 중심");
  // 무대가 0.75 배로 줄어든 화면 (rect 는 화면 px) — 같은 필드 점
  const small = { left: 100, top: 50, width: 968 * 0.75, height: 392 * 0.75 };
  const p = pointerToField(100 + 0.2 * small.width, 50 + 0.72 * small.height, small);
  assert.deepEqual(p, { x: 20, y: 72, inside: true });
  const out = pointerToField(10, 600, rect);
  assert.equal(out.inside, false, "필드 밖");
  assert.ok(out.x === 0 && out.y === 100, "밖은 가장자리로 자른다");
  assert.equal(pointerToField(1, 1, { left: 0, top: 0, width: 0, height: 0 }), null, "빈 rect");
  assert.equal(pointerToField(NaN, 1, rect), null);
});

test("circlePx: 원 반지름 u → rx = r·W/100, ry = (r/aspect)·H/100 (1280×720 무대에서 동그랗다)", () => {
  const data = loadData();
  const Z = data.lesson.zones;
  for (const [size, r] of Object.entries(Z.radius)) {
    const c = circlePx(r, Z.aspect, FIELD_PX.w, FIELD_PX.h);
    assert.equal(c.rx, Math.round((r * FIELD_PX.w) / 100 * 100) / 100, `${size} rx`);
    assert.equal(c.ry, Math.round(((r / Z.aspect) * FIELD_PX.h) / 100 * 100) / 100, `${size} ry`);
    assert.ok(Math.abs(c.rx - c.ry) / c.rx < 0.01, `${size}: 화면에서 원 (${c.rx} · ${c.ry})`);
  }
  // §14.2 표: 작은 41 · 중간 87 · 큰 165 px
  assert.equal(Math.round(circlePx(Z.radius.small, Z.aspect).rx), 41);
  assert.equal(Math.round(circlePx(Z.radius.medium, Z.aspect).rx), 87);
  assert.equal(Math.round(circlePx(Z.radius.large, Z.aspect).rx), 165);
  // 측정한 W · H 가 다르면 그 크기로 (엔진 판정과 같은 모양 — 필드 % 로 되돌리면 r 과 r/aspect)
  const c2 = circlePx(9, Z.aspect, 1000, 500);
  assert.equal(c2.rx, 90);
  assert.ok(Math.abs((c2.ry / 500) * 100 - 9 / Z.aspect) < 0.01);
  assert.deepEqual(circlePx(0, Z.aspect), { rx: 0, ry: 0 });
});

test("fxPlan: 합성 lastFx — 카드 · 턴 끝(기본 훈련 · 벤치 회복) · 흩어지기 · 새 손패 · 레슨 끝 · 벤치 단계로 나눈다", () => {
  const fx = [
    { t: "cost", id: "p1", n: 8 }, { t: "cost", id: "p2", n: 8 },
    { t: "gain", id: "p1", stat: "pass", n: 30, sub: 9, subStat: "dribble" }, { t: "fail", id: "p2", stat: "physical", n: 5, injured: true },
    { t: "tw", n: 1 }, { t: "buff", key: "hojo", from: 2, to: 1 }, { t: "heal", id: "p3", n: 20 },
    { t: "base", id: "p1", stat: "pass", n: 4 }, { t: "cost", id: "p1", n: 1, src: "base" },
    { t: "base", id: "p4", stat: "defense", n: 5 }, { t: "cost", id: "p4", n: 1, src: "base" },
    { t: "heal", id: "p3", n: 15, src: "bench" }, { t: "buff", key: "mood", from: 3, to: 2 }, { t: "turnEnd", turn: 2 },
    { t: "scatter", zones: { p1: "shoot", p3: "pass", p4: "defense" } },
    { t: "draw", uids: ["k1", "k2", "k3"] },
  ];
  const p = fxPlan(fx);
  assert.deepEqual(p.play.targets, ["p1", "p2"]);
  assert.deepEqual(p.play.cost, { p1: 8, p2: 8 }, "카드 비용 (기본 훈련 체력은 턴 끝으로)");
  assert.deepEqual(p.play.gain, { p1: { n: 30, sub: 9, stat: "pass", subStat: "dribble" } });
  assert.deepEqual(p.play.fail, { p2: { n: 5, injured: true, stat: "physical" } });
  assert.deepEqual(p.play.heal, { p3: 20 });
  assert.deepEqual(p.play.buffs, { hojo: 1 });
  assert.equal(p.play.tw, 1);
  assert.deepEqual(p.turn.base, { p1: 4, p4: 5 }, "기본 훈련");
  assert.deepEqual(p.turn.baseStat, { p1: "pass", p4: "defense" });
  assert.deepEqual(p.turn.baseCost, { p1: 1, p4: 1 });
  assert.deepEqual(p.turn.bench, { p3: 15 }, "벤치 회복");
  assert.deepEqual(p.turn.heal, {});
  assert.equal(p.turn.turn, 2);
  assert.deepEqual(p.turn.buffs, { mood: 2 });
  assert.deepEqual(p.scatter, { p1: "shoot", p3: "pass", p4: "defense" }, "새 턴 흩어지기");
  assert.deepEqual(p.draw, ["k1", "k2", "k3"]);
  assert.deepEqual(p.bench, []);
  assert.equal(p.end, null);
  assert.equal(scoreAfterPlay(p, 100), 91, "턴 끝 기본 훈련 상승은 뒤에");
  // 레슨 끝 (턴 끝 퍼펙트): turnEnd 뒤 회복 = 레슨 끝 회복, 흩어지기 · 손패 없음
  const e = fxPlan([{ t: "base", id: "p1", stat: "pass", n: 6 }, { t: "turnEnd", turn: 6 }, { t: "heal", id: "p4", n: 10 }, { t: "end", status: "perfect" }]);
  assert.deepEqual(e.play.targets, []);
  assert.deepEqual(e.turn.base, { p1: 6 });
  assert.deepEqual(e.end, { status: "perfect", heal: { p4: 10 } });
  assert.equal(e.scatter, null);
  assert.equal(e.draw, null);
  // 벤치 행동 하나
  const b = fxPlan([{ t: "bench", id: "p3", on: true }]);
  assert.deepEqual(b.bench, [{ id: "p3", on: true }]);
  assert.equal(b.turn, null);
  assert.deepEqual(b.play.targets, []);
  // 첫 턴 (startLesson): 흩어지기 · 손패만
  const s0 = fxPlan([{ t: "scatter", zones: { p1: "pass" } }, { t: "draw", uids: ["k1"] }]);
  assert.equal(s0.turn, null);
  assert.deepEqual(s0.scatter, { p1: "pass" });
  assert.deepEqual(fxPlan(null).play.targets, []);
});

test("fxPlan: 실제 엔진 lastFx — 전체 카드(경기장 전원) → 턴 끝 기본 훈련 · 벤치 회복 → 흩어지기 → 새 손패", () => {
  const data = loadData();
  const cfg = data.config;
  // 기초 훈련(전체)이 1턴 손패에 오는 레슨을 찾는다 (시드 · 구역 순서대로 — 결정적)
  let st = null;
  let uid = null;
  for (let k = 0; k < 40 && !uid; k++) {
    const base = lessonRun.createRun({
      data, seed: `layout-fx-${k}`, squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation,
      supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: "team",
    });
    for (const zone of STATS) {
      const s = clone(base);
      lessonRun.applyWeekAction(s, data, { type: "lesson", zone });
      const c = lessonRun.getLessonView(s, data).hand.find((x) => x.cardId === "cd_basic" && x.playable);
      if (c) { st = s; uid = c.uid; break; }
    }
  }
  assert.ok(uid, "기초 훈련이 손패에 있는 레슨");
  // 첫 턴 lastFx (startLesson) = 흩어지기 + 손패
  const v0 = lessonRun.getLessonView(st, data);
  const p0 = fxPlan(v0.lastFx);
  assert.deepEqual(p0.scatter, v0.zones, "첫 턴 흩어지기 = 뷰 zones");
  assert.deepEqual(p0.draw, v0.hand.map((c) => c.uid));
  // 벤치 1명 (체력을 낮춰 회복이 보이게) → bench 단계
  const benchP = v0.players.find((p) => !p.out && p.zone);
  st.players.find((p) => p.id === benchP.id).stamina = 50;
  lessonRun.benchPlayer(st, data, { playerId: benchP.id, on: true });
  assert.deepEqual(fxPlan(lessonRun.getLessonView(st, data).lastFx).bench, [{ id: benchP.id, on: true }]);
  const before = lessonRun.getLessonView(st, data);
  const field = before.players.filter((x) => !x.out && !x.bench).map((x) => x.id);
  lessonRun.playCard(st, data, { uid });
  const v = lessonRun.getLessonView(st, data);
  const p = fxPlan(v.lastFx);
  assert.deepEqual([...p.play.targets].sort(), [...field].sort(), "전체 = 경기장 선수 (벤치 제외)");
  assert.ok(!p.play.targets.includes(benchP.id), "벤치 선수는 대상 아님");
  for (const id of Object.keys(p.play.gain)) assert.equal(p.play.gain[id].stat, before.zones[id], `${id}: 서 있던 구역 스탯`);
  const gained = Object.values(p.play.gain).reduce((a, g) => a + g.n, 0) - Object.values(p.play.fail).reduce((a, f) => a + f.n, 0);
  assert.equal(scoreAfterPlay(p, v.score), before.score + gained, "카드 단계 점수 = 이전 + 상승 − 실패");
  assert.ok(p.turn && p.turn.turn === 1, "1장 = 사용 1 → 턴 끝");
  const injured = new Set(Object.keys(p.play.fail).filter((id) => p.play.fail[id].injured));
  for (const id of field) {
    if (injured.has(id) || !p.turn.base[id]) continue;
    assert.equal(p.turn.baseStat[id], before.zones[id], `${id}: 기본 훈련은 서 있던 구역`);
  }
  assert.ok(Object.keys(p.turn.base).length > 0, "기본 훈련 있음");
  assert.ok(!(benchP.id in p.turn.base), "벤치 선수는 기본 훈련 없음");
  assert.equal(p.turn.bench[benchP.id], data.lesson.lesson.bench.recover, "벤치 회복 +15");
  assert.equal(v.score - scoreAfterPlay(p, v.score), Object.values(p.turn.base).reduce((a, n) => a + n, 0));
  if (v.status === "playing") {
    assert.deepEqual(p.scatter, v.zones, "새 턴 흩어지기 = 뷰 zones");
    assert.deepEqual(p.draw, v.hand.map((c) => c.uid), "새 손패");
    assert.deepEqual(v.bench, [], "새 턴: 벤치 비움");
    // 카드 없이 [턴 끝]: 기본 훈련만
    const b2 = lessonRun.getLessonView(st, data);
    lessonRun.endLessonTurn(st, data);
    const v2 = lessonRun.getLessonView(st, data);
    const q = fxPlan(v2.lastFx);
    assert.deepEqual(q.play.targets, []);
    const baseSum = Object.values(q.turn.base).reduce((a, n) => a + n, 0);
    assert.equal(v2.score, b2.score + baseSum, "0장 턴 끝 점수 = 기본 훈련 합");
    assert.equal(scoreAfterPlay(q, v2.score), b2.score);
  }
});

test("fxPlan: 코치 지원 합성 lastFx — 컷인(맨 앞) · 컷인 유대 · 힌트 · 컨디션 · 새 턴 붙기 (§15.4 · §15.8)", () => {
  const fx = [
    { t: "cutin", supportId: "sp_elder_sage", uid: "k3", cardId: "cd_one_two", coach: "현자 오르넬라", name: "빈 공간의 지혜", text: "팀워크 +3 · 50%로 힌트", repeat: 1 },
    { t: "cost", id: "p1", n: 8 }, { t: "gain", id: "p1", stat: "pass", n: 20, sub: 6, subStat: "dribble" },
    { t: "tw", n: 3 }, { t: "hint", supportId: "sp_elder_sage", src: "cutin" }, { t: "condition", n: 1, src: "cutin" },
    { t: "bond", supportId: "sp_elder_sage", n: 5 },
    { t: "base", id: "p1", stat: "pass", n: 4 }, { t: "turnEnd", turn: 2 }, { t: "scatter", zones: { p1: "pass" } }, { t: "draw", uids: ["k5", "k6", "k7"] },
    { t: "attach", uid: "k6", supportId: "sp_coach_harr", upgrade: "plus" },
  ];
  const p = fxPlan(fx);
  assert.deepEqual(p.cutin, { supportId: "sp_elder_sage", uid: "k3", cardId: "cd_one_two", coach: "현자 오르넬라", name: "빈 공간의 지혜", text: "팀워크 +3 · 50%로 힌트", repeat: 1 });
  assert.deepEqual(p.play.targets, ["p1"], "컷인 뒤 카드 단계 그대로");
  assert.deepEqual(p.play.bond, [{ supportId: "sp_elder_sage", n: 5 }]);
  assert.deepEqual(p.play.hints, ["sp_elder_sage"]);
  assert.equal(p.play.condition, 1);
  assert.equal(p.play.tw, 3);
  assert.deepEqual(p.turn.base, { p1: 4 });
  assert.deepEqual(p.draw, ["k5", "k6", "k7"]);
  assert.deepEqual(p.attach, { uid: "k6", supportId: "sp_coach_harr", upgrade: "plus" }, "새 턴 붙기 = 새 손패 뒤");
  const none = fxPlan([{ t: "cost", id: "p1", n: 3 }, { t: "condition", n: 1 }]);
  assert.equal(none.cutin, null);
  assert.equal(none.attach, null);
  assert.deepEqual(none.play.bond, []);
  assert.deepEqual(none.play.hints, []);
  assert.equal(none.play.condition, 1, "카드 effects 의 컨디션도 카드 단계");
});

test("fxPlan: 실제 엔진 — 새 턴 붙기 attach = 뷰 attach, 붙은 카드를 내면 cutin 이 lastFx 맨 앞 · 유대 +5 (첫 컷인 repeat 0)", () => {
  const data = loadData();
  const cfg = data.config;
  let st = null;
  let v = null;
  for (let k = 0; k < 30 && !st; k++) {
    const base = lessonRun.createRun({
      data, seed: `layout-att-${k}`, squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation,
      supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: "team",
    });
    const s = clone(base);
    lessonRun.applyWeekAction(s, data, { type: "lesson", zone: "pass" });
    for (let t = 0; t < 6 && s.phase === "lesson" && s.lesson.status === "playing"; t++) {
      const vv = lessonRun.getLessonView(s, data);
      const c = vv.attach && vv.hand.find((x) => x.uid === vv.attach.uid);
      if (c && c.playable && (vv.cutins || 0) === 0 && fxPlan(vv.lastFx).attach) { st = s; v = vv; break; }
      lessonRun.endLessonTurn(s, data);
    }
  }
  assert.ok(st, "붙은 카드가 있는 새 턴");
  const p0 = fxPlan(v.lastFx);
  assert.deepEqual(p0.attach, { uid: v.attach.uid, supportId: v.attach.supportId, upgrade: v.attach.upgrade }, "fxPlan.attach = 뷰 attach");
  assert.deepEqual(p0.draw, v.hand.map((c) => c.uid), "붙기는 새 손패 뒤");
  const card = v.hand.find((c) => c.uid === v.attach.uid);
  assert.ok(card.attach && card.attach.supportId === v.attach.supportId, "손패 카드 뷰에도 attach");
  const args = { uid: card.uid };
  if (card.targetKind === "circle" || card.targetKind === "single") {
    const cd = lessonRun.dropCandidates(st, data, { uid: card.uid })[0];
    if (card.heal) args.playerId = cd.playerId;
    else args.at = cd.at;
  }
  const bondBefore = st.supports.find((x) => x.id === v.attach.supportId).bond;
  lessonRun.playCard(st, data, args);
  const lf = lessonRun.getLessonView(st, data).lastFx;
  assert.equal(lf[0].t, "cutin", "cutin = lastFx 맨 앞");
  const p = fxPlan(lf);
  assert.equal(p.cutin.supportId, v.attach.supportId);
  assert.equal(p.cutin.uid, card.uid);
  assert.equal(p.cutin.repeat, 0, "이번 레슨 첫 컷인");
  assert.equal(p.cutin.name, data.lesson.attach.abilities[v.attach.supportId].name, "능력 이름");
  const bondAfter = st.supports.find((x) => x.id === v.attach.supportId).bond;
  const b = p.play.bond.find((x) => x.supportId === v.attach.supportId);
  if (bondAfter !== bondBefore) assert.ok(b && b.n > 0, "유대 fx");
});

// 플레이 점검 (2026-10-02) · §14.16: 보상 · 상담 카드 앞면의 비용 = 엔진 1인 비용 (cards.staminaCost — 원 · 전체도 1인당, 인원 계산 없음)
test("cards.js estimateCost/costText: 보상 · 상담 카드 비용 = 엔진 1인 비용 (기본 위력, 강화판 · 유대 80 은 비용 그대로, 고유 = 1인 비용 — L40)", async () => {
  const { estimateCost, costText, targetText, powerText, effectDesc } = await import("../js/ui/cards.js");
  const engineCards = await import("../js/engine/cards.js");
  const data = loadData();
  // L40: lesson.unique.mainMult 를 지웠다 → 고유 카드 비용은 1인 비용 하나 (범위 없음). 모양별 문구 ("체력 −8 /명") 는 U3
  assert.equal(data.lesson.lesson.unique, undefined);
  const { uniqueMainMult } = await import("../js/ui/cards.js");
  assert.equal(uniqueMainMult(data), 1);
  let checked = 0;
  for (const raw of data.cards.cards) {
    for (const [plus, bond] of [[false, 0], [true, 0], [false, 100], [true, 100]]) {
      if (plus && !engineCards.canUpgrade(raw)) continue;
      const def = engineCards.resolveCardDef(data, raw, { plus, bond });
      const kind = def.target.kind;
      const view = { cardId: raw.id, targetKind: kind, target: def.target, power: def.power ?? null, costRate: def.costRate, plus };
      const est = estimateCost(view, raw);
      const tag = `${raw.id}${plus ? "+" : ""}${bond ? " 유대80" : ""}`;
      if (kind === "none" || raw.power == null) {
        assert.equal(est, null, tag);
        assert.equal(costText(view, raw, data), "체력 소모 없음", tag);
        assert.equal(powerText(view, raw), "효과 카드", tag);
        continue;
      }
      assert.equal(est, engineCards.staminaCost(def, {}), `${tag}: = 엔진 staminaCost`);
      assert.equal(powerText(view, raw), `1인 ${def.power}`, `${tag}: 위력 줄`);
      const txt = costText(view, raw, data);
      if (kind === "owner") {
        assert.equal(txt, `체력 −${est}`, `${tag}: 고유 = 1인 비용 하나 (L40)`);
      } else if (kind === "circle" || kind === "all") {
        assert.equal(txt, `체력 −${est} /명`, `${tag}: 원 · 전체 = 1인당`);
      } else {
        assert.equal(txt, `체력 −${est}`, tag);
      }
      checked++;
    }
  }
  assert.ok(checked > 100, `비용 확인 ${checked}장`);
  // 손패 뷰는 엔진 cost 를 그대로 (원 · 전체 "/명")
  assert.equal(costText({ cardId: "cd_fw_drill", targetKind: "circle", size: "medium", power: 18, cost: 13 }, null), "체력 −13 /명");
  assert.equal(costText({ cardId: "cd_u_neria", targetKind: "owner", power: 35, cost: 21 }, null), "체력 −21");
  // 대상 칩
  const raw = (id) => data.cards.cards.find((c) => c.id === id);
  assert.equal(targetText({}, raw("cd_one_two")), "작은 원");
  assert.equal(targetText({}, raw("cd_fw_drill")), "중간 원");
  assert.equal(targetText({}, raw("cd_attack_build")), "큰 원");
  assert.equal(targetText({}, raw("cd_basic")), "전체");
  assert.equal(targetText({}, raw("cd_coaching")), "단일");
  assert.equal(targetText({}, raw("cd_finisher")), "공격 구역 단일");
  assert.equal(targetText({}, raw("cd_icing")), "선수 1명 회복");
  assert.equal(targetText({}, raw("cd_u_neria")), "주인");
  assert.equal(targetText({}, raw("cd_hojo_up")), "대상 없음");
  // 손패 뷰 모양 (size · heal)
  assert.equal(targetText({ targetKind: "circle", size: "large", power: 15 }, null), "큰 원");
  assert.equal(targetText({ targetKind: "single", heal: true, power: null }, null), "선수 1명 회복");
  // 효과 문구: 대상 · 1인 위력 머리는 칩 · 위력 줄과 겹치므로 뺀다
  assert.equal(effectDesc("중간 원 · 1인 18, 마지막 턴에 ×2"), "마지막 턴에 ×2");
  assert.equal(effectDesc("큰 원 · 1인 15"), "");
  assert.equal(effectDesc("주인 · 1인 35 (주 스탯 구역 ×1.5), 다음 카드 +40%"), "다음 카드 +40%");
  assert.equal(effectDesc("큰 원 · 1인 12 + 분위기 1당 0.9"), "+ 분위기 1당 0.9");
  assert.equal(effectDesc("공격 구역 단일 · 1인 30, 탈취 스택당 +45%"), "탈취 스택당 +45%");
  assert.equal(effectDesc("분위기 +3"), "분위기 +3", "효과 카드는 그대로");
});
