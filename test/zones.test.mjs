// test/zones.test.mjs — 레슨 훈련 구역 기하 (js/engine/zones.js). LESSON_PROTO_PLAN §14.2 · §14.6 · §14.14 · §14.17
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "./helpers.mjs";
import {
  ZONE_IDS, distU, clampPoint, huddleOffsets, zonePositions, inCircle, nearestWithin,
  areNeighbors, zoneWeight, candidatePoints, zoneAt,
} from "../js/engine/zones.js";

const data = loadData();
const cfg = data.lesson.zones;
const A = cfg.aspect;
const W = 968, H = 392, TOKEN_R = 20; // 레슨 경기장 픽셀 · 토큰 반지름 (§14.2)
const px = (p) => [(p.x / 100) * W, (p.y / 100) * H];
const pxDist = (a, b) => { const [ax, ay] = px(a); const [bx, by] = px(b); return Math.hypot(ax - bx, ay - by); };
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** 7명 픽스처: 주어진 {zone: n} 배치 → { lesson, players } (슬롯 순서 = 배열 순서). */
function fixture(counts, bench = []) {
  const players = [];
  const zones = {};
  let k = 0;
  for (const z of ZONE_IDS) for (let i = 0; i < (counts[z] || 0); i++) {
    const id = `p${++k}`;
    players.push({ id });
    zones[id] = z;
  }
  return { players, lesson: { zones, bench } };
}
const membersOf = (lesson, z, bench = []) => Object.keys(lesson.zones).filter((id) => lesson.zones[id] === z && !bench.includes(id));
/** 한 구역에 n명, 나머지 7−n명을 다른 구역에 차례로 나눈다. */
function spread(z, n, others = ZONE_IDS.filter((o) => o !== z)) {
  const counts = { [z]: n };
  for (let i = 0; i < 7 - n; i++) counts[others[i % others.length]] = (counts[others[i % others.length]] || 0) + 1;
  return counts;
}

test("데이터: lesson.json 구역 키 (ZE1 추가분) · 구역 5곳 = STATS 순서", () => {
  assert.deepEqual(ZONE_IDS, ["shoot", "dribble", "pass", "defense", "physical"]);
  assert.ok(Math.abs(A - H / W) < 0.001, "aspect = 392/968");
  for (const z of ZONE_IDS) assert.ok(cfg.centers[z], `${z} 중심`);
  assert.deepEqual(cfg.huddle, [0, 3.5, 4.5, 5.5, 6.5]);
  assert.deepEqual(cfg.radius, { small: 4.2, medium: 9, large: 17 });
  const L = data.lesson.lesson;
  assert.equal(L.cardGainScale, 0.64);
  assert.deepEqual(L.base, { gain: 3.2, stamina: 1 });
  assert.deepEqual(L.bench, { recover: 15, max: 2 });
  assert.deepEqual(L.focus, { mult: 1.5, specialMult: 2.0, weight: 2 });
  assert.equal(L.unique, undefined, "L40: 고유 카드 주 스탯 구역 ×1.5 (lesson.unique.mainMult) 는 지웠다");
  assert.deepEqual(cfg.ownerRadius, { small: 8, medium: 15 }, "L40 주인 둘레 원 반지름 [가정]");
  assert.equal(cfg.dropR, 12, "L40 구역 놓기 반경 [가정]");
  assert.equal(L.special.capMult, 1.2);
});

test("흩어지기 가중치: config.training.slotWeights 사본, GK 는 DF 와 같다 [가정 Q1-a] · 중점 ×2 · config 는 그대로", () => {
  const sw = data.config.training.slotWeights;
  assert.deepEqual(cfg.weights.DF, sw.DF);
  assert.deepEqual(cfg.weights.MF, sw.MF);
  assert.deepEqual(cfg.weights.FW, sw.FW);
  assert.deepEqual(cfg.weights.GK, sw.DF);
  assert.deepEqual(sw.GK, { shoot: 2, dribble: 3, pass: 15, defense: 40, physical: 40 }, "config 는 바꾸지 않는다");
  assert.equal(zoneWeight(cfg, "GK", "defense", "pass", 2), 40);
  assert.equal(zoneWeight(cfg, "MF", "pass", "pass", 2), 70);
  assert.throws(() => zoneWeight(cfg, "XX", "pass"));
});

test("구역 중심 거리 표 (§14.2) · 이웃", () => {
  const d = (a, b) => distU(cfg.centers[a], cfg.centers[b], A);
  assert.ok(Math.abs(d("defense", "physical") - 22.7) < 0.1);
  assert.ok(Math.abs(d("pass", "dribble") - 22.7) < 0.1);
  assert.equal(d("defense", "pass"), 30);
  assert.ok(Math.abs(d("physical", "dribble") - 30) < 1e-9);
  assert.ok(areNeighbors("pass", "physical", cfg) && areNeighbors("defense", "pass", cfg) && areNeighbors("physical", "dribble", cfg));
  assert.ok(!areNeighbors("defense", "shoot", cfg) && !areNeighbors("defense", "dribble", cfg) && !areNeighbors("shoot", "physical", cfg));
  const neigh = ZONE_IDS.filter((z) => z !== "pass" && areNeighbors("pass", z, cfg));
  assert.equal(neigh.length, 4, "패스 = 허브 (4곳과 이웃)");
});

test("대형: n = 1~7 이 모든 구역에서 필드 안 · 토큰이 겹치지 않는다", () => {
  assert.deepEqual(huddleOffsets(1, cfg), [{ dx: 0, dy: 0 }]);
  assert.deepEqual(huddleOffsets(2, cfg), [{ dx: -3.5, dy: 0 }, { dx: 3.5, dy: 0 }]);
  assert.equal(huddleOffsets(0, cfg).length, 0);
  const o3 = huddleOffsets(3, cfg);
  assert.ok(Math.abs(o3[0].dx) < 1e-9 && Math.abs(o3[0].dy + 4.5) < 1e-9, "n≥3 첫 자리 = 위");
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const { players, lesson } = fixture({ [z]: n });
    const pos = zonePositions(lesson, players, cfg);
    const pts = Object.values(pos);
    assert.equal(pts.length, n);
    for (const p of pts) {
      const [x, y] = px(p);
      assert.ok(x >= TOKEN_R && x <= W - TOKEN_R && y >= TOKEN_R && y <= H - TOKEN_R, `${z} n=${n}: 필드 안 (${x.toFixed(0)},${y.toFixed(0)})`);
      assert.equal(p.x, Math.round(p.x * 10) / 10, "소수 1자리");
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      assert.ok(pxDist(pts[i], pts[j]) >= TOKEN_R * 2, `${z} n=${n}: 간격 ${pxDist(pts[i], pts[j]).toFixed(0)}px`);
    }
  }
});

test("zonePositions: 슬롯 순서 · 벤치 · 구역 없는 선수(결장) 제외 · 남은 인원으로 대형", () => {
  const { players, lesson } = fixture({ defense: 3, pass: 2, shoot: 1, physical: 1 });
  players.push({ id: "out" }); // 결장 = zones 에 없음
  const all = zonePositions(lesson, players, cfg);
  assert.deepEqual(Object.keys(all), players.filter((p) => p.id !== "out").map((p) => p.id));
  assert.deepEqual(all, zonePositions(JSON.parse(JSON.stringify(lesson)), players, cfg), "결정적 · JSON 상태");
  const bench = ["p4"]; // 수비 3명(p4~p6) 중 1명
  const pos = zonePositions({ ...lesson, bench }, players, cfg);
  assert.ok(!("p4" in pos) && !("out" in pos));
  // 수비 2명이 남으면 좌우 대형
  assert.deepEqual(pos.p5, { x: 16.5, y: 30 });
  assert.deepEqual(pos.p6, { x: 23.5, y: 30 });
  // 1명은 중심
  assert.deepEqual(pos.p1, cfg.centers.shoot);
  assert.throws(() => zonePositions({ zones: { a: "nowhere" } }, [{ id: "a" }], cfg));
});

test("distU · inCircle · nearestWithin: 경계 포함, 세로는 aspect 로", () => {
  assert.equal(distU({ x: 0, y: 0 }, { x: 3, y: 0 }, A), 3);
  assert.ok(Math.abs(distU({ x: 0, y: 0 }, { x: 0, y: 10 }, A) - 4.05) < 1e-9);
  const positions = { a: { x: 50, y: 50 }, b: { x: 54.2, y: 50 }, c: { x: 50, y: 50 + 4.2 / A }, d: { x: 54.3, y: 50 } };
  assert.deepEqual(inCircle(positions, { x: 50, y: 50 }, 4.2, A), ["a", "b", "c"], "경계(4.2) 포함 · 4.3 밖 · 슬롯 순서");
  assert.equal(nearestWithin(positions, { x: 51, y: 50 }, 3, A), "a");
  assert.equal(nearestWithin(positions, { x: 52.1, y: 50 }, 3, A), "a", "같은 거리 → 슬롯 순서");
  assert.equal(nearestWithin(positions, { x: 53.5, y: 50 }, 3, A), "b");
  assert.equal(nearestWithin(positions, { x: 53.5, y: 50 }, 4, A, ["a", "c"]), "a", "후보 제한");
  assert.equal(nearestWithin(positions, { x: 80, y: 80 }, 3, A), null);
  assert.deepEqual(clampPoint({ x: -5, y: 130 }), { x: 0, y: 100 });
  assert.throws(() => clampPoint({ x: "a", y: 1 }));
  assert.throws(() => clampPoint(null));
});

test("작은 원 (4.2u): 같은 구역 이웃 두 명 사이 = 2명 · 한 명 위 = 1명 · 3명 이상 대형 중심 = 0명", () => {
  const r = cfg.radius.small;
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const { players, lesson } = fixture(spread(z, n));
    const pos = zonePositions(lesson, players, cfg);
    const ids = membersOf(lesson, z);
    for (const id of Object.keys(pos)) assert.deepEqual(inCircle(pos, pos[id], r, A), [id], `${z} n=${n}: ${id} 위 = 1명`);
    if (n >= 2) for (let i = 0; i < n; i++) {
      const a = ids[i], b = ids[(i + 1) % n];
      if (n === 2 && i === 1) continue;
      const got = inCircle(pos, mid(pos[a], pos[b]), r, A);
      assert.deepEqual([...got].sort(), [a, b].sort(), `${z} n=${n}: ${a}·${b} 사이 = 2명`);
    }
    const atC = inCircle(pos, cfg.centers[z], r, A);
    if (n >= 3) assert.equal(atC.length, 0, `${z} n=${n}: 중심 = 0명`);
    else assert.equal(atC.length, n, `${z} n=${n}: 중심 = ${n}명`);
  }
});

test("중간 원 (9u): 구역 중심 → 그 구역 전원, 이웃 구역 0명", () => {
  const r = cfg.radius.medium;
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const { players, lesson } = fixture(spread(z, n));
    const pos = zonePositions(lesson, players, cfg);
    assert.deepEqual(inCircle(pos, cfg.centers[z], r, A), membersOf(lesson, z), `${z} n=${n}`);
  }
});

test("큰 원 (17u): 22.7u 이웃 두 구역 가운데 → 두 무리 전원(무리당 4명까지), 세 번째 구역 0명", () => {
  const r = cfg.radius.large;
  const pairs = [];
  for (let i = 0; i < ZONE_IDS.length; i++) for (let j = i + 1; j < ZONE_IDS.length; j++) {
    const a = ZONE_IDS[i], b = ZONE_IDS[j];
    if (Math.abs(distU(cfg.centers[a], cfg.centers[b], A) - 22.7) < 0.1) pairs.push([a, b]);
  }
  assert.equal(pairs.length, 4);
  for (const [a, b] of pairs) for (let na = 1; na <= 4; na++) for (let nb = 1; nb <= Math.min(4, 7 - na); nb++) {
    const rest = ZONE_IDS.filter((z) => z !== a && z !== b);
    for (const third of rest) {
      const counts = { [a]: na, [b]: nb, [third]: 7 - na - nb };
      const { players, lesson } = fixture(counts);
      const pos = zonePositions(lesson, players, cfg);
      const got = inCircle(pos, mid(cfg.centers[a], cfg.centers[b]), r, A);
      const want = Object.keys(pos).filter((id) => lesson.zones[id] === a || lesson.zones[id] === b);
      assert.deepEqual(got, want, `${a}(${na})–${b}(${nb}) + ${third}(${7 - na - nb})`);
    }
  }
});

test("candidatePoints: 원 — 대상 집합이 겹치지 않고, 점마다 대상 ≥ 1, 순서 구역 → 선수 → 가운데", () => {
  for (const size of ["small", "medium", "large"]) {
    const counts = { defense: 3, physical: 1, pass: 2, shoot: 1 };
    const { players, lesson } = fixture(counts);
    const pos = zonePositions(lesson, players, cfg);
    const cands = candidatePoints(pos, cfg, { kind: "circle", size, zoneOf: lesson.zones });
    assert.ok(cands.length >= 1);
    const keys = cands.map((c) => c.ids.join(","));
    assert.equal(new Set(keys).size, keys.length, `${size}: 중복 제거`);
    const order = { zone: 0, player: 1, between: 2 };
    for (let i = 1; i < cands.length; i++) assert.ok(order[cands[i - 1].kind] <= order[cands[i].kind], `${size}: 순서`);
    for (const c of cands) {
      assert.ok(c.ids.length >= 1);
      assert.deepEqual(c.ids, inCircle(pos, c.at, cfg.radius[size], A), `${size}: ids = 원 안`);
      assert.ok(c.at.x >= 0 && c.at.x <= 100 && c.at.y >= 0 && c.at.y <= 100);
    }
    assert.deepEqual(cands, candidatePoints(pos, cfg, { kind: "circle", r: cfg.radius[size], zoneOf: lesson.zones }), "size = r");
  }
  // 혼자 선 구역: 구역 중심과 선수 위치가 같은 대상 → 구역 중심 하나만
  const { players, lesson } = fixture({ shoot: 1, defense: 2 });
  const pos = zonePositions(lesson, players, cfg);
  const small = candidatePoints(pos, cfg, { kind: "circle", size: "small", zoneOf: lesson.zones });
  assert.deepEqual(small.map((c) => [c.kind, c.ids.join(",")]), [
    ["zone", "p1"], ["zone", "p2,p3"], ["player", "p2"], ["player", "p3"],
  ]);
  // 중간 원: 수비 2명은 어디에 놓아도 함께 잡힌다 · 슈팅 1명 (구역 사이 60u 라 가운데 점 없음)
  const med = candidatePoints(pos, cfg, { kind: "circle", size: "medium", zoneOf: lesson.zones });
  assert.deepEqual(med.map((c) => c.ids.join(",")), ["p1", "p2,p3"]);
  // 큰 원: 수비–피지컬 가운데 (22.7u) 같은 이웃 쌍 가운데 점이 나온다
  const f2 = fixture({ defense: 2, physical: 2 });
  const pos2 = zonePositions(f2.lesson, f2.players, cfg);
  const large = candidatePoints(pos2, cfg, { kind: "circle", size: "large", zoneOf: f2.lesson.zones });
  assert.ok(large.some((c) => c.kind === "between" && c.zones && c.ids.length === 4), "두 무리 전원 점");
  assert.throws(() => candidatePoints(pos2, cfg, { kind: "circle" }));
});

test("candidatePoints: 단일 · 전체/주인/없음", () => {
  const { players, lesson } = fixture({ shoot: 1, pass: 2, defense: 2 });
  const pos = zonePositions(lesson, players, cfg);
  const single = candidatePoints(pos, cfg, { kind: "single" });
  assert.deepEqual(single.map((c) => c.playerId), ["p1", "p2", "p3", "p4", "p5"]);
  for (const c of single) assert.deepEqual(c.at, pos[c.playerId]);
  const only = candidatePoints(pos, cfg, { kind: "single", ids: ["p1", "p3"] });
  assert.deepEqual(only.map((c) => c.ids[0]), ["p1", "p3"]);
  for (const kind of ["all", "owner", "none"]) {
    assert.deepEqual(candidatePoints(pos, cfg, { kind }), [{ at: { x: 50, y: 50 }, ids: ["p1", "p2", "p3", "p4", "p5"], kind: "field" }]);
  }
});

// ---------------------------------------------------------------------------
// L40 고유 카드 모양 (§16.2 ② · §16.3 ②): 구역 놓기 · 주인 둘레 원
// ---------------------------------------------------------------------------

test("zoneAt: 중심이 가장 가까운 구역 · dropR 경계 포함 · 가운데 점은 가까운 쪽 (같으면 ZONE_IDS 순) · 밖이면 null · 필드 밖은 자른다", () => {
  const C = cfg.centers;
  for (const z of ZONE_IDS) assert.equal(zoneAt(C[z], cfg), z, `${z} 중심`);
  // 경계: 중심에서 정확히 dropR (가로) 는 그 구역, 조금 넘으면 null (이웃 중심과 멀다)
  const R = cfg.dropR;
  assert.equal(zoneAt({ x: C.defense.x - R, y: C.defense.y }, cfg), "defense");
  assert.equal(zoneAt({ x: C.defense.x - R - 0.01, y: C.defense.y }, cfg), null);
  // 세로는 aspect 로 u 를 잰다: 12u = 12 / 0.405 ≈ 29.6%
  assert.equal(zoneAt({ x: C.shoot.x, y: C.shoot.y - R / A + 0.01 }, cfg), "shoot");
  // 수비 (20, 30) · 패스 (50, 30) 가운데 (35, 30) 은 둘 다 15u > dropR → null, 한쪽으로 조금 가면 그쪽
  assert.equal(zoneAt({ x: 35, y: 30 }, cfg), null);
  assert.equal(zoneAt({ x: 33, y: 30 }, cfg), null);
  assert.equal(zoneAt({ x: 31, y: 30 }, cfg), "defense");
  // 22.7u 이웃 쌍 (패스 (50, 30) · 피지컬 (35, 72)) 의 가운데 (11.35u) 는 어느 한쪽으로 잡힌다 — 같은 거리면 ZONE_IDS 순서 (pass < physical)
  const m = mid(C.pass, C.physical);
  assert.ok(Math.abs(distU(m, C.pass, A) - distU(m, C.physical, A)) < 1e-9);
  assert.equal(zoneAt(m, cfg), "pass");
  const m2 = mid(C.dribble, C.shoot); // (72.5, 51): dribble < shoot? ZONE_IDS 순서 shoot 먼저
  assert.equal(zoneAt(m2, cfg), "shoot");
  // 필드 밖 점은 [0, 100] 으로 자른 뒤 판정, 숫자가 아니면 throw
  assert.equal(zoneAt({ x: 80, y: -10 }, cfg), distU({ x: 80, y: 0 }, C.shoot, A) <= R ? "shoot" : null);
  assert.equal(zoneAt({ x: 0, y: 100 }, cfg), null);
  assert.throws(() => zoneAt({ x: "a", y: 1 }, cfg), /놓은 점/);
  assert.throws(() => zoneAt(C.pass, { ...cfg, dropR: 0 }), /dropR/);
});

test("주인 둘레 원 약속 (§16.2 ②): n = 1~7 대형에서 small 8u = 주인 + 바로 옆 ≤ 2명 · 다른 구역 0명, medium 15u = 주인 구역 전원", () => {
  const rs = cfg.ownerRadius.small;
  const rm = cfg.ownerRadius.medium;
  for (const z of ZONE_IDS) {
    for (let n = 1; n <= 7; n++) {
      // 모든 "나머지 배치" 를 두루: 나머지를 이웃 · 먼 구역 각각에 몰아 본다
      for (const other of ZONE_IDS.filter((o) => o !== z)) {
        const counts = { [z]: n };
        if (n < 7) counts[other] = 7 - n;
        const fx = fixture(counts);
        const pos = zonePositions(fx.lesson, fx.players, cfg);
        const members = membersOf(fx.lesson, z);
        for (const owner of members) {
          const small = inCircle(pos, pos[owner], rs, A);
          assert.ok(small.includes(owner));
          assert.ok(small.every((id) => fx.lesson.zones[id] === z), `${z} n=${n} small: 다른 구역 0명`);
          assert.ok(small.length - 1 <= 2, `${z} n=${n} small: 바로 옆 ≤ 2명 (${small.length - 1})`);
          if (n >= 2) assert.ok(small.length >= 2, `${z} n=${n} small: 바로 옆 1명 이상`);
          const medium = inCircle(pos, pos[owner], rm, A);
          for (const id of members) assert.ok(medium.includes(id), `${z} n=${n} medium: 주인 구역 전원`);
        }
      }
    }
  }
});
