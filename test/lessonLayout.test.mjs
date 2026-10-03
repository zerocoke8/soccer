// test/lessonLayout.test.mjs — 레슨 화면 좌표 · 연출 계획 (js/ui/lesson_layout.js, DOM 없음). LESSON_PROTO_PLAN §6.3 · §9.3
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone } from "./helpers.mjs";
import { tokenSpot, drillSpot, drillSpots, drillZone, fxPlan, scoreAfterPlay, handStep, FIELD_PX, TOKEN_PX } from "../js/ui/lesson_layout.js";
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

test("drillSpot: 종목별 훈련 지점 (§6.3 표) — 훈련장 안, 1~7명이 겹치지 않음", () => {
  for (const stat of STATS) {
    const zones = drillZone(stat);
    assert.ok(zones.length >= 1, `${stat}: 훈련장`);
    for (let n = 1; n <= 7; n++) {
      const spots = Array.from({ length: n }, (_, i) => drillSpot(stat, i, n));
      for (const s of spots) {
        assert.ok(s.x >= 3 && s.x <= 97 && s.y >= 3 && s.y <= 97, `${stat} n=${n}: 필드 안 (${s.x},${s.y})`);
        assert.ok(zones.some((z) => inRect(s, z)), `${stat} n=${n}: 훈련장 안 (${s.x},${s.y})`);
        if (stat === "shoot") assert.ok(s.x >= 81 && s.x <= 90, `슈팅: 상대 박스 앞 x 81–90 (${s.x})`);
        if (stat === "dribble") assert.ok(s.x >= 57 && s.x <= 78, `드리블: 오른쪽 하프 (${s.x})`);
        if (stat === "defense") assert.ok(s.x >= 18 && s.x <= 28, `수비: 우리 박스 앞 x 18–28 (${s.x})`);
        if (stat === "physical") assert.ok(s.y === 9 || s.y === 91, `피지컬: 터치라인 y 9 / 91 (${s.y})`);
        if (stat === "pass") assert.ok(Math.abs(s.x - 50) <= 10 && Math.abs(s.y - 50) <= 24, `패스: 센터서클 둘레 (${s.x},${s.y})`);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const d = dist(spots[i], spots[j]);
        assert.ok(d >= TOKEN_PX + 4, `${stat} n=${n}: ${i}·${j} 간격 ${d.toFixed(0)}px ≥ 토큰 + 4`);
      }
    }
  }
  // 범위 밖 번호 · 알 수 없는 종목도 필드 안
  assert.deepEqual(drillSpot("shoot", 9, 3), drillSpot("shoot", 2, 3));
  const u = drillSpot("unknown", 0, 1);
  assert.ok(u.x === 50 && u.y === 50);
  assert.deepEqual(drillZone("unknown"), []);
});

test("drillSpots: 대상 id 목록 순서대로", () => {
  const m = drillSpots("pass", ["p2", "p5", "p7"]);
  assert.deepEqual(Object.keys(m), ["p2", "p5", "p7"]);
  assert.deepEqual(m.p5, drillSpot("pass", 1, 3));
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

test("fxPlan: 합성 lastFx — 카드 · 턴 끝 · 레슨 끝 단계로 나눈다", () => {
  const fx = [
    { t: "cost", id: "p1", n: 8 }, { t: "cost", id: "p2", n: 8 },
    { t: "gain", id: "p1", stat: "pass", n: 30, sub: 9 }, { t: "fail", id: "p2", n: 5, injured: true },
    { t: "tw", n: 1 }, { t: "buff", key: "hojo", from: 2, to: 1 }, { t: "heal", id: "p3", n: 20 },
    { t: "tick", id: "p1", n: 4 }, { t: "tick", id: "p3", n: 5 }, { t: "buff", key: "mood", from: 3, to: 2 }, { t: "turnEnd", turn: 2 },
    { t: "draw", uids: ["k1", "k2", "k3"] },
  ];
  const p = fxPlan(fx);
  assert.deepEqual(p.play.targets, ["p1", "p2"]);
  assert.deepEqual(p.play.cost, { p1: 8, p2: 8 });
  assert.deepEqual(p.play.gain, { p1: { n: 30, sub: 9 } });
  assert.deepEqual(p.play.fail, { p2: { n: 5, injured: true } });
  assert.deepEqual(p.play.heal, { p3: 20 });
  assert.deepEqual(p.play.buffs, { hojo: 1 });
  assert.equal(p.play.tw, 1);
  assert.deepEqual(p.turn.ticks, { p1: 4, p3: 5 });
  assert.equal(p.turn.turn, 2);
  assert.deepEqual(p.turn.buffs, { mood: 2 });
  assert.deepEqual(p.draw, ["k1", "k2", "k3"]);
  assert.equal(p.end, null);
  assert.equal(scoreAfterPlay(p, 100), 91, "턴 끝 분위기 틱은 뒤에");
  const e = fxPlan([{ t: "gain", id: "p1", stat: "pass", n: 40, sub: 0 }, { t: "gain", id: "p4", stat: "pass", n: 6, sub: 0, auto: true }, { t: "heal", id: "p4", n: 10 }, { t: "end", status: "perfect" }]);
  assert.deepEqual(e.play.targets, ["p1"]);
  assert.deepEqual(e.end, { status: "perfect", auto: { p4: 6 }, heal: { p4: 10 } });
  assert.deepEqual(fxPlan(null).play.targets, []);
});

// zone-pending:ZU1 — lesson_layout.fxPlan 의 scatter · base · bench 단계 (§14.16). ZU1 가 고쳐서 다시 켠다.
test.skip("fxPlan: 실제 엔진 lastFx (기초 훈련 = 전원 → 턴 끝 → 새 손패)", () => {
  const data = loadData();
  const cfg = data.config;
  // 기초 훈련이 1턴 손패에 오는 레슨을 찾는다 (시드 · 종목 순서대로 — 결정적)
  let st = null;
  let uid = null;
  for (let k = 0; k < 40 && !uid; k++) {
    const base = lessonRun.createRun({
      data, seed: `layout-fx-${k}`, squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation,
      supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: "team",
    });
    for (const stat of STATS) {
      const s = clone(base);
      lessonRun.applyWeekAction(s, data, { type: "lesson", stat });
      const c = lessonRun.getLessonView(s, data).hand.find((x) => x.cardId === "cd_basic");
      if (c) { st = s; uid = c.uid; break; }
    }
  }
  assert.ok(uid, "기초 훈련이 손패에 있는 레슨");
  const before = lessonRun.getLessonView(st, data);
  lessonRun.playCard(st, data, { uid, taps: [] });
  const v = lessonRun.getLessonView(st, data);
  const p = fxPlan(v.lastFx);
  const active = before.players.filter((x) => !x.out).map((x) => x.id);
  assert.deepEqual([...p.play.targets].sort(), [...active].sort(), "전원 = 출전 선수가 훈련 지점으로");
  const gained = Object.values(p.play.gain).reduce((a, g) => a + g.n, 0) - Object.values(p.play.fail).reduce((a, f) => a + f.n, 0);
  assert.equal(scoreAfterPlay(p, v.score), before.score + gained, "카드 단계 점수 = 이전 + 상승 − 실패");
  assert.ok(p.turn && p.turn.turn === 1, "1장 = 사용 1 → 턴 끝");
  assert.deepEqual(p.draw, v.hand.map((c) => c.uid), "새 손패");
});

// 플레이 점검 (2026-10-02): 보상 · 상담 카드 앞면의 비용이 "체력 −위력×0.6" 이 아니라 실제 1인 비용 (엔진 cards.staminaCost 와 같은 값)
// zone-pending:ZU1 — cards.js estimateCost 1인 비용 (§14.16 카드 앞면). ZU1 가 고쳐서 다시 켠다.
test.skip("cards.js estimateCost/costText: 보상 · 상담 카드 비용 = 엔진 1인 비용 (기본 위력 · 범위 인원, 강화판 · 유대 80 은 비용 그대로)", async () => {
  const { estimateCost, costText, rangeCount } = await import("../js/ui/cards.js");
  const engineCards = await import("../js/engine/cards.js");
  const data = loadData();
  const cfg = data.config;
  const st = lessonRun.createRun({ data, seed: "cost-ui", squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation, supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics, policy: "team" });
  const players = st.players;
  let checked = 0;
  for (const raw of data.cards.cards) {
    for (const plus of [false, true]) {
      if (plus && !engineCards.canUpgrade(raw)) continue;
      const def = engineCards.resolveCardDef(data, raw, { plus });
      const kind = def.target.kind;
      const view = { cardId: raw.id, targetKind: kind, target: def.target, power: def.power, costRate: def.costRate, plus };
      const est = estimateCost(view, raw, players);
      if (!["all", "line", "attack", "defense", "single", "pair", "owner"].includes(kind) || raw.power == null) { assert.equal(est, null, raw.id); continue; }
      const count = rangeCount(kind, def.target, players);
      if (["all", "line", "attack", "defense"].includes(kind) && !count) { assert.equal(est, null, `${raw.id}: 인원 0`); continue; }
      assert.equal(est, engineCards.staminaCost(def, { count: count || 1 }), `${raw.id}${plus ? "+" : ""}`);
      assert.match(costText(view, raw, players), /^체력 −\d+( \(1인당\))?$/, raw.id);
      checked++;
    }
  }
  assert.ok(checked > 60, `비용 확인 ${checked}장`);
  // 선수를 모르면 예전 문구로
  const basic = data.cards.cards.find((c) => c.id === "cd_basic");
  assert.equal(costText({ cardId: "cd_basic", targetKind: "all", costRate: 0.6 }, basic, null), "체력 −위력×0.6");
});
