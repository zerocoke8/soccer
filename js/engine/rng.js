/**
 * rng.js — 결정적 난수 (mulberry32, 단일 uint32 상태).
 * 엔진의 모든 난수는 이 모듈을 통해서만 만든다. 상태는 숫자(uint32)로 직렬화한다.
 *
 * @typedef {Object} Rng
 * @property {() => number} next               float [0,1)
 * @property {(min: number, max: number) => number} int   정수, 양끝 포함
 * @property {(p: number) => boolean} chance
 * @property {<T>(arr: T[]) => (T|undefined)} pick
 * @property {<T>(items: T[], weightFn: (item: T) => number) => (T|undefined)} weighted
 * @property {<T>(arr: T[]) => T[]} shuffle    새 배열 반환
 * @property {() => number} getState           uint32
 */

/**
 * cyrb53 문자열 해시 → 53비트 정수.
 * @param {string} str
 * @param {number} [seed=0]
 * @returns {number}
 */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * seed(string | number) → uint32 초기 상태.
 * @param {string|number} seed
 * @returns {number}
 */
export function seedToState(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    if (Number.isInteger(seed)) return seed >>> 0;
    return (hashString(String(seed)) % 4294967296) >>> 0;
  }
  if (typeof seed === "string") {
    return (hashString(seed) % 4294967296) >>> 0;
  }
  throw new Error(`rng: seed는 문자열 또는 숫자여야 합니다 (받은 값: ${typeof seed})`);
}

/**
 * @param {string|number} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  return createRngFromState(seedToState(seed));
}

/**
 * @param {number} state uint32
 * @returns {Rng}
 */
export function createRngFromState(state) {
  if (typeof state !== "number" || !Number.isFinite(state)) {
    throw new Error(`rng: 상태는 숫자여야 합니다 (받은 값: ${state})`);
  }
  let s = state >>> 0;

  /** @returns {number} float [0,1) */
  function next() {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  function int(min, max) {
    const lo = Math.ceil(Math.min(min, max));
    const hi = Math.floor(Math.max(min, max));
    return lo + Math.floor(next() * (hi - lo + 1));
  }

  /**
   * @param {number} p
   * @returns {boolean}
   */
  function chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return next() < p;
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T|undefined}
   */
  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(next() * arr.length)];
  }

  /**
   * @template T
   * @param {T[]} items
   * @param {(item: T) => number} weightFn
   * @returns {T|undefined}
   */
  function weighted(items, weightFn) {
    if (!items || items.length === 0) return undefined;
    const weights = items.map((it) => {
      const w = Number(weightFn(it));
      return Number.isFinite(w) && w > 0 ? w : 0;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return items[0];
    let r = next() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r < 0) return items[i];
    }
    return items[items.length - 1];
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T[]}
   */
  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** @returns {number} */
  function getState() {
    return s >>> 0;
  }

  return { next, int, chance, pick, weighted, shuffle, getState };
}
