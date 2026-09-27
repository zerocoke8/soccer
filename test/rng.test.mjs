// test/rng.test.mjs — ARCHITECTURE §3, §9
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng, createRngFromState, hashString, seedToState } from "../js/engine/rng.js";

test("같은 seed → 같은 시퀀스 (문자열/숫자 seed)", () => {
  for (const seed of ["abc", "한글 seed", 12345, 0]) {
    const a = createRng(seed);
    const b = createRng(seed);
    const sa = Array.from({ length: 50 }, () => a.next());
    const sb = Array.from({ length: 50 }, () => b.next());
    assert.deepEqual(sa, sb, `seed ${seed}`);
  }
});

test("다른 seed → 다른 시퀀스", () => {
  const a = createRng("seed-1");
  const b = createRng("seed-2");
  const sa = Array.from({ length: 10 }, () => a.next());
  const sb = Array.from({ length: 10 }, () => b.next());
  assert.notDeepEqual(sa, sb);
});

test("getState / createRngFromState 복원", () => {
  const rng = createRng("restore");
  for (let i = 0; i < 17; i++) rng.next();
  const saved = rng.getState();
  assert.equal(typeof saved, "number");
  assert.ok(Number.isInteger(saved) && saved >= 0 && saved < 2 ** 32, "uint32 상태");
  const restored = createRngFromState(saved);
  const expected = Array.from({ length: 30 }, () => rng.next());
  const actual = Array.from({ length: 30 }, () => restored.next());
  assert.deepEqual(actual, expected);
  assert.equal(restored.getState(), rng.getState());
});

test("next() 는 [0,1) 범위", () => {
  const rng = createRng(7);
  for (let i = 0; i < 10000; i++) {
    const x = rng.next();
    assert.ok(x >= 0 && x < 1, `범위 밖: ${x}`);
  }
});

test("int(min,max) 양끝 포함, 전 구간 등장", () => {
  const rng = createRng("int");
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(3, 7);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 7, `범위 밖: ${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7]);
  // 뒤집힌 인자도 허용
  const v = rng.int(9, 2);
  assert.ok(v >= 2 && v <= 9);
});

test("chance(p) 경계 및 빈도", () => {
  const rng = createRng("chance");
  assert.equal(rng.chance(0), false);
  assert.equal(rng.chance(1), true);
  assert.equal(rng.chance(-1), false);
  assert.equal(rng.chance(2), true);
  let hits = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) if (rng.chance(0.3)) hits++;
  const rate = hits / N;
  assert.ok(Math.abs(rate - 0.3) < 0.02, `chance(0.3) 빈도 ${rate}`);
});

test("pick / weighted / shuffle", () => {
  const rng = createRng("pick");
  assert.equal(rng.pick([]), undefined);
  assert.equal(rng.pick([42]), 42);
  const arr = ["a", "b", "c", "d"];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(rng.pick(arr)));

  // weighted: 가중 0 은 절대 나오지 않음, 가중 큰 것이 더 자주
  const items = [{ id: "zero", w: 0 }, { id: "small", w: 1 }, { id: "big", w: 9 }];
  const counts = { zero: 0, small: 0, big: 0 };
  for (let i = 0; i < 5000; i++) counts[rng.weighted(items, (it) => it.w).id]++;
  assert.equal(counts.zero, 0);
  assert.ok(counts.big > counts.small * 5, `가중 반영 ${JSON.stringify(counts)}`);
  assert.equal(rng.weighted([], () => 1), undefined);

  // shuffle: 새 배열, 같은 원소 집합, 원본 불변
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = src.slice();
  const out = rng.shuffle(src);
  assert.notEqual(out, src);
  assert.deepEqual(src, copy);
  assert.deepEqual(out.slice().sort((a, b) => a - b), copy);
});

test("hashString / seedToState 결정성", () => {
  assert.equal(hashString("hello"), hashString("hello"));
  assert.notEqual(hashString("hello"), hashString("hellp"));
  assert.equal(seedToState("x"), seedToState("x"));
  assert.equal(seedToState(77), 77);
  assert.equal(seedToState(-1), 0xffffffff);
  assert.throws(() => seedToState({}), /seed/);
  assert.throws(() => createRngFromState("nope"), /상태/);
});
