// test/zones.test.mjs — 레슨 훈련 구역 기하 (js/engine/zones.js). LESSON_PROTO_PLAN §14.2 · §14.6 · §14.14 · §14.17
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData } from "./helpers.mjs";
import {
  ZONE_IDS, distU, clampPoint, huddleOffsets, zonePositions, inCircle, nearestWithin,
  areNeighbors, zoneWeight, candidatePoints, zoneAt, hash32, layoutSeedOf, jitterOf, jitterErrors,
} from "../js/engine/zones.js";

const data = loadData();
/** L52: 데이터 그대로 (흔들린 대형) */
const cfgJ = data.lesson.zones;
/** 흔들림을 끈 예전 정직한 대형 (jitter null) — 대형 · 원 약속 표 (§14.2 · §16.2 ②) 를 정확한 좌표로 본다 */
const cfg = { ...cfgJ, jitter: null };
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
  assert.deepEqual(cfgJ.jitter, { rotate: true, radiusScale: [0.85, 1.25], nudge: 1.2, minGap: 4.8, maxR: 6.6 }, "L52 자연스러운 배치");
  assert.deepEqual(jitterErrors(cfgJ), []);
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

test("대형 (jitter null = 예전 대형): n = 1~7 이 모든 구역에서 필드 안 · 토큰이 겹치지 않는다", () => {
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

test("zonePositions (jitter null): 슬롯 순서 · 벤치 · 구역 없는 선수(결장) 제외 · 남은 인원으로 대형", () => {
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

test("작은 원 (4.2u, jitter null): 같은 구역 이웃 두 명 사이 = 2명 · 한 명 위 = 1명 · 3명 이상 대형 중심 = 0명", () => {
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

test("중간 원 (9u, jitter null): 구역 중심 → 그 구역 전원, 이웃 구역 0명", () => {
  const r = cfg.radius.medium;
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const { players, lesson } = fixture(spread(z, n));
    const pos = zonePositions(lesson, players, cfg);
    assert.deepEqual(inCircle(pos, cfg.centers[z], r, A), membersOf(lesson, z), `${z} n=${n}`);
  }
});

test("큰 원 (17u, jitter null): 22.7u 이웃 두 구역 가운데 → 두 무리 전원(무리당 4명까지), 세 번째 구역 0명", () => {
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

test("candidatePoints (jitter null): 원 — 대상 집합이 겹치지 않고, 점마다 대상 ≥ 1, 순서 구역 → 선수 → 가운데", () => {
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

test("candidatePoints (jitter null): 단일 · 전체/주인/없음", () => {
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

test("주인 둘레 원 약속 (§16.2 ②, jitter null): n = 1~7 대형에서 small 8u = 주인 + 바로 옆 ≤ 2명 · 다른 구역 0명, medium 15u = 주인 구역 전원", () => {
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

// ---------------------------------------------------------------------------
// L52 자연스러운 배치 (§23): zones.jitter — 해시 흔들림 · 겹침 없음 · 결정적 · null = 예전 대형
// ---------------------------------------------------------------------------

const J = cfgJ.jitter;
/** 여러 런 · 주의 배치 씨앗 */
const SEEDS = Array.from({ length: 40 }, (_, i) => layoutSeedOf(`seed-${i}`, i % 15));
const at = (lesson, turn, layoutSeed) => ({ ...lesson, turn, layoutSeed });
/** 7명을 구역에 나누는 모든 방법 (구역별 인원 [shoot, dribble, pass, defense, physical], 합 7) */
function allCounts(total = 7, k = ZONE_IDS.length) {
  if (k === 1) return [[total]];
  const out = [];
  for (let i = 0; i <= total; i++) for (const rest of allCounts(total - i, k - 1)) out.push([i, ...rest]);
  return out;
}
/** 흔들린 배치 검사: 서로 minGap 이상 (다른 구역끼리도) · 구역 중심에서 maxR 이하 (토큰이 바닥 안) · 필드 안 · 소수 1자리 */
function checkLayout(pos, lesson, label) {
  const ids = Object.keys(pos);
  for (const id of ids) {
    const p = pos[id];
    const d = distU(p, cfgJ.centers[lesson.zones[id]], A);
    assert.ok(d <= J.maxR + 1e-9, `${label}: ${id} 구역 바닥 안 (${d.toFixed(2)}u)`);
    const [x, y] = px(p);
    assert.ok(x >= TOKEN_R && x <= W - TOKEN_R && y >= TOKEN_R && y <= H - TOKEN_R, `${label}: ${id} 필드 안`);
    assert.ok(p.x === Math.round(p.x * 10) / 10 && p.y === Math.round(p.y * 10) / 10, `${label}: 소수 1자리`);
  }
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = distU(pos[ids[i]], pos[ids[j]], A);
    assert.ok(d >= J.minGap - 1e-9, `${label}: ${ids[i]}·${ids[j]} 간격 ${d.toFixed(2)}u < ${J.minGap}`);
  }
}

test("L52 데이터: jitter 블록 · 토큰 크기에서 나온 간격 (40px 얼굴 + 2px 테 = 44px = 4.55u < minGap 4.8u) · 바닥 안 (maxR + minGap/2 ≤ pad)", () => {
  assert.equal(jitterOf(cfgJ), J);
  assert.equal(jitterOf(cfg), null);
  assert.equal(jitterOf({ ...cfgJ, jitter: undefined }), null);
  const tokU = ((TOKEN_R * 2 + 4) / W) * 100; // 1280×720 무대: 필드 968px · 915×412 도 무대가 통째로 줄어 같은 u
  assert.ok(J.minGap > tokU && J.minGap > cfg.radius.small, `minGap ${J.minGap} > 토큰 ${tokU.toFixed(2)}u · 작은 원 ${cfg.radius.small}u`);
  assert.ok(J.maxR + J.minGap / 2 <= cfg.pad + 1e-9);
  assert.ok(J.maxR >= cfg.huddle.at(-1), "예전 대형이 그대로 들어간다 (돌아갈 자리)");
  assert.deepEqual(jitterErrors(cfg), [], "null = 통과");
  // 검사가 잡는 것
  const err = (j) => jitterErrors({ ...cfgJ, jitter: { ...J, ...j } }).join(" / ");
  assert.match(err({ rotate: 1 }), /rotate/);
  assert.match(err({ radiusScale: [0, 1] }), /radiusScale/);
  assert.match(err({ radiusScale: [1.3, 1.1] }), /radiusScale/);
  assert.match(err({ nudge: -1 }), /nudge/);
  assert.match(err({ minGap: 6 }), /기본 대형 n=7/);
  assert.match(err({ minGap: 1 }), /minGap 은 4.6 이상/, "토큰 크기보다 좁은 간격은 막는다 (얼굴이 겹친다)");
  assert.match(err({ maxR: 7.5 }), /pad/);
  assert.match(err({ maxR: 6 }), /기본 대형 n=5/);
  assert.match(err({ extra: 1 }), /알 수 없는 키 'extra'/);
  assert.match(jitterErrors({ ...cfgJ, jitter: [1] }).join(), /객체나 null/);
  assert.match(jitterErrors({ ...cfgJ, centers: { ...cfgJ.centers, pass: { x: 30, y: 30 } } }).join(), /'pass' · 'defense' 중심 거리/);
  assert.match(jitterErrors({ ...cfgJ, centers: { ...cfgJ.centers, shoot: { x: 95, y: 30 } } }).join(), /'shoot' 구역 바닥이 필드 밖/);
});

test("L52 흔들린 대형: n = 1~7 · 모든 구역 · 씨앗 40 × 턴 6 — 겹치지 않는다 (minGap) · 구역 바닥 안 · 필드 안", () => {
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const fx = fixture({ [z]: n });
    for (const seed of SEEDS) for (let turn = 1; turn <= 6; turn++) {
      const L = at(fx.lesson, turn, seed);
      const pos = zonePositions(L, fx.players, cfgJ);
      assert.equal(Object.keys(pos).length, n);
      checkLayout(pos, L, `${z} n=${n} seed ${seed} turn ${turn}`);
    }
  }
});

test("L52 흔들린 대형: 7명 전체 배치 (구역 나누기 330가지 × 씨앗 4 × 턴 3) — 다른 구역 토큰끼리도 겹치지 않는다 · 벤치를 빼도", () => {
  const counts = allCounts();
  assert.equal(counts.length, 330);
  for (const cs of counts) {
    const fx = fixture(Object.fromEntries(ZONE_IDS.map((z, i) => [z, cs[i]])));
    for (const seed of SEEDS.slice(0, 4)) for (let turn = 1; turn <= 3; turn++) {
      const L = at(fx.lesson, turn, seed);
      checkLayout(zonePositions(L, fx.players, cfgJ), L, `${cs.join("")} seed ${seed} turn ${turn}`);
      const Lb = { ...L, bench: ["p1", "p4"] };
      checkLayout(zonePositions(Lb, fx.players, cfgJ), Lb, `${cs.join("")} 벤치 2`);
    }
  }
});

test("L52 결정적: 같은 상태 = 같은 자리 · JSON 왕복 · Math.random · Date 를 쓰지 않는다 · 턴 · 씨앗이 바뀌면 바뀐다 · 다른 구역 사람이 움직여도 그대로", () => {
  const fx = fixture({ defense: 3, pass: 2, shoot: 1, physical: 1 });
  const L = at(fx.lesson, 3, SEEDS[5]);
  const pos = zonePositions(L, fx.players, cfgJ);
  assert.deepEqual(zonePositions(JSON.parse(JSON.stringify(L)), JSON.parse(JSON.stringify(fx.players)), cfgJ), pos, "JSON 왕복");
  const rnd = Math.random, now = Date.now;
  Math.random = () => { throw new Error("Math.random"); };
  Date.now = () => { throw new Error("Date.now"); };
  try {
    assert.deepEqual(zonePositions(L, fx.players, cfgJ), pos);
  } finally {
    Math.random = rnd;
    Date.now = now;
  }
  // 다른 턴 · 다른 씨앗 → (거의) 모두 다른 자리
  let moved = 0, total = 0, seedMoved = 0;
  for (const seed of SEEDS) for (let turn = 1; turn <= 5; turn++) {
    const a = zonePositions(at(fx.lesson, turn, seed), fx.players, cfgJ);
    const b = zonePositions(at(fx.lesson, turn + 1, seed), fx.players, cfgJ);
    const c = zonePositions(at(fx.lesson, turn, seed + 1), fx.players, cfgJ);
    for (const id of Object.keys(a)) {
      total += 1;
      if (a[id].x !== b[id].x || a[id].y !== b[id].y) moved += 1;
      if (a[id].x !== c[id].x || a[id].y !== c[id].y) seedMoved += 1;
    }
  }
  assert.ok(moved / total > 0.97, `턴이 바뀌면 자리가 바뀐다 (${moved}/${total})`);
  assert.ok(seedMoved / total > 0.97, `씨앗이 바뀌면 자리가 바뀐다 (${seedMoved}/${total})`);
  // 자리 옮기기 (L40): p7 피지컬 → 패스. 수비 · 슈팅 구역은 그대로, 두 구역은 다시 모인다 (겹침 없음)
  assert.equal(L.zones.p7, "physical");
  const moveL = { ...L, zones: { ...L.zones, p7: "pass" } };
  const after = zonePositions(moveL, fx.players, cfgJ);
  for (const id of Object.keys(pos).filter((id) => !["pass", "physical"].includes(L.zones[id]))) assert.deepEqual(after[id], pos[id], `${id} 그대로`);
  checkLayout(after, moveL, "옮긴 뒤");
  assert.deepEqual(zonePositions(JSON.parse(JSON.stringify(moveL)), fx.players, cfgJ), after, "옮긴 뒤도 결정적");
  // 씨앗이 없는 옛 저장본 (layoutSeed · turn 없음) 도 결정적
  assert.deepEqual(zonePositions(fx.lesson, fx.players, cfgJ), zonePositions({ ...fx.lesson }, fx.players, cfgJ));
  assert.equal(hash32("abc"), hash32("abc"));
  assert.notEqual(hash32("abc"), hash32("abd"));
  assert.equal(layoutSeedOf("s", 3), layoutSeedOf("s", 3));
  assert.notEqual(layoutSeedOf("s", 3), layoutSeedOf("s", 4));
});

test("L52 jitter null = 예전 대형 그대로 (huddleOffsets · 소수 1자리)", () => {
  for (const z of ZONE_IDS) for (let n = 1; n <= 7; n++) {
    const fx = fixture({ [z]: n });
    const c = cfg.centers[z];
    const offs = huddleOffsets(n, cfg);
    const want = Object.fromEntries(fx.players.map((p, i) => [p.id, { x: Math.round((c.x + offs[i].dx) * 10) / 10, y: Math.round((c.y + offs[i].dy / A) * 10) / 10 }]));
    for (const seed of [0, SEEDS[1]]) for (const turn of [1, 4]) {
      assert.deepEqual(zonePositions(at(fx.lesson, turn, seed), fx.players, cfg), want, `${z} n=${n}`);
      assert.deepEqual(zonePositions(at(fx.lesson, turn, seed), fx.players, { ...cfgJ, jitter: undefined }), want);
    }
  }
});

test("L52 흔들림이 보인다: 2명이 늘 좌우가 아니고 · 3명 이상이 늘 정원형이 아니고 · 혼자도 중심에서 조금 비낀다", () => {
  const stat = {};
  for (let n = 1; n <= 7; n++) {
    const fx = fixture({ pass: n });
    const s = (stat[n] = { tilted: 0, uneven: 0, off: 0, total: 0 });
    for (const seed of SEEDS) for (let turn = 1; turn <= 6; turn++) {
      const pts = Object.values(zonePositions(at(fx.lesson, turn, seed), fx.players, cfgJ));
      const c = cfgJ.centers.pass;
      const rs = pts.map((p) => distU(p, c, A));
      s.total += 1;
      if (n === 1 && rs[0] > 0.2) s.off += 1;
      if (n === 2 && Math.abs(pts[0].y - pts[1].y) * A > 1) s.tilted += 1;
      if (n >= 3 && Math.max(...rs) - Math.min(...rs) > 0.3) s.uneven += 1;
    }
  }
  assert.ok(stat[1].off / stat[1].total > 0.8, `혼자: 중심에서 비낌 ${stat[1].off}/${stat[1].total}`);
  assert.ok(stat[2].tilted / stat[2].total > 0.6, `2명: 기울어짐 ${stat[2].tilted}/${stat[2].total}`);
  for (let n = 3; n <= 7; n++) assert.ok(stat[n].uneven / stat[n].total > 0.8, `${n}명: 반지름이 고르지 않음 ${stat[n].uneven}/${stat[n].total}`);
});

test("L52 흔들린 대형에서도 지키는 원 약속: 작은 원 한 명 위 = 1명 · 중간 원 구역 중심 = 그 구역 전원 (이웃 0명) · 큰 원 22.7u 가운데 = 세 번째 구역 0명 · 주인 둘레 small 다른 구역 0명 · medium 주인 구역 전원", () => {
  const pairs = [];
  for (let i = 0; i < ZONE_IDS.length; i++) for (let j = i + 1; j < ZONE_IDS.length; j++) {
    const a = ZONE_IDS[i], b = ZONE_IDS[j];
    if (Math.abs(distU(cfg.centers[a], cfg.centers[b], A) - 22.7) < 0.1) pairs.push([a, b]);
  }
  assert.equal(pairs.length, 4);
  for (const cs of allCounts().filter((_, i) => i % 3 === 0)) {
    const fx = fixture(Object.fromEntries(ZONE_IDS.map((z, i) => [z, cs[i]])));
    for (const seed of SEEDS.slice(0, 3)) for (const turn of [1, 2]) {
      const L = at(fx.lesson, turn, seed);
      const pos = zonePositions(L, fx.players, cfgJ);
      const label = `${cs.join("")} seed ${seed} turn ${turn}`;
      for (const id of Object.keys(pos)) {
        assert.deepEqual(inCircle(pos, pos[id], cfg.radius.small, A), [id], `${label}: 작은 원 ${id} 위 = 1명`);
        const z = L.zones[id];
        assert.ok(inCircle(pos, pos[id], cfg.ownerRadius.small, A).every((o) => L.zones[o] === z), `${label}: 둘레 small 다른 구역 0명`);
        const med = inCircle(pos, pos[id], cfg.ownerRadius.medium, A);
        assert.ok(membersOf(L, z).every((o) => med.includes(o)), `${label}: 둘레 medium 주인 구역 전원`);
      }
      for (const z of ZONE_IDS) assert.deepEqual(inCircle(pos, cfg.centers[z], cfg.radius.medium, A), membersOf(L, z), `${label}: 중간 원 ${z} 중심`);
      for (const [a, b] of pairs) {
        const got = inCircle(pos, mid(cfg.centers[a], cfg.centers[b]), cfg.radius.large, A);
        assert.ok(got.every((id) => L.zones[id] === a || L.zones[id] === b), `${label}: 큰 원 ${a}–${b} 세 번째 구역 0명`);
      }
    }
  }
});

test("L52 candidatePoints (흔들린 대형): 대상 집합 중복 없음 · 점마다 대상 ≥ 1 · ids = 원 안 · 작은 원 2명 점이 남는다", () => {
  for (const counts of [{ defense: 3, physical: 1, pass: 2, shoot: 1 }, { pass: 4, dribble: 3 }, { shoot: 7 }]) {
    const fx = fixture(counts);
    for (const seed of SEEDS.slice(0, 6)) for (const size of ["small", "medium", "large"]) {
      const L = at(fx.lesson, 2, seed);
      const pos = zonePositions(L, fx.players, cfgJ);
      const cands = candidatePoints(pos, cfgJ, { kind: "circle", size, zoneOf: L.zones });
      const keys = cands.map((c) => c.ids.join(","));
      assert.equal(new Set(keys).size, keys.length);
      for (const c of cands) {
        assert.ok(c.ids.length >= 1);
        assert.deepEqual(c.ids, inCircle(pos, c.at, cfgJ.radius[size], A));
      }
      if (size === "small") assert.ok(cands.some((c) => c.ids.length >= 2), `${JSON.stringify(counts)} seed ${seed}: 작은 원 2명 점`);
    }
  }
});
