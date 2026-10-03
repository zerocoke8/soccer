// js/engine/zones.js — 레슨 훈련 구역 기하 (LESSON_PROTO_PLAN §14.2 · §14.6 · §14.14)
// 순수 함수만: DOM · rng · Date 없음. 좌표는 레슨 필드 % (x = 우리 골 0 → 상대 골 100, y = 위 0 → 아래 100).
// 거리 단위 u = 필드 폭의 1%. 세로 % 차이는 aspect(H/W)를 곱해 u로 바꾼다.
// cfg = data.lesson.zones ({ aspect, pad, pickR, centers, huddle, radius, weights }).

/** 구역 id — STATS 순서 (training.js 와 같다). */
export const ZONE_IDS = ["shoot", "dribble", "pass", "defense", "physical"];

/** 이웃 구역 판정: 구역 중심 거리가 이 값(u) 이하 (22.7 · 30 쌍). 48u 이상은 이웃이 아니다. */
export const NEIGHBOR_MAX_U = 30.5;

const EPS = 1e-9;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 두 점 거리 (u). */
export function distU(a, b, aspect) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * aspect);
}

/** 놓은 점을 필드 안 [0,100]² 로 자른다. 숫자가 아니면 throw. */
export function clampPoint(at) {
  if (!at || !Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.y))) throw new Error("놓은 점(at)이 잘못됐습니다");
  return { x: clamp(Number(at.x), 0, 100), y: clamp(Number(at.y), 0, 100) };
}

/**
 * 한 구역에 n명이 설 때 중심 기준 오프셋 (u). n = 1 → 중심, n = 2 → 좌우, n ≥ 3 → 위에서 시계 방향 원형.
 * @returns {{dx:number, dy:number}[]}
 */
export function huddleOffsets(n, cfg) {
  if (!(n >= 1)) return [];
  const R = cfg.huddle[Math.min(n, cfg.huddle.length) - 1];
  if (n === 1) return [{ dx: 0, dy: 0 }];
  if (n === 2) return [{ dx: -R, dy: 0 }, { dx: R, dy: 0 }];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((-90 + (360 * i) / n) * Math.PI) / 180;
    out.push({ dx: R * Math.cos(a), dy: R * Math.sin(a) });
  }
  return out;
}

/**
 * 경기장 선수 위치. lesson.zones 에 있고 벤치가 아닌 선수만, players(슬롯 순서) 순서로.
 * @param {{zones?:Object<string,string>, bench?:string[]}} lesson
 * @param {{id:string}[]} players
 * @returns {Object<string,{x:number,y:number}>}
 */
export function zonePositions(lesson, players, cfg) {
  const zones = (lesson && lesson.zones) || {};
  const bench = new Set((lesson && lesson.bench) || []);
  const onField = players.filter((p) => zones[p.id] && !bench.has(p.id));
  const byZone = {};
  for (const p of onField) (byZone[zones[p.id]] ||= []).push(p.id);
  const slot = {};
  for (const z of Object.keys(byZone)) {
    const c = cfg.centers[z];
    if (!c) throw new Error(`알 수 없는 구역: '${z}'`);
    const offs = huddleOffsets(byZone[z].length, cfg);
    byZone[z].forEach((id, i) => {
      slot[id] = { x: r1(c.x + offs[i].dx), y: r1(c.y + offs[i].dy / cfg.aspect) };
    });
  }
  const out = {};
  for (const p of onField) out[p.id] = slot[p.id];
  return out;
}

/** 원 안 (경계 포함) 선수 id — positions 순서(슬롯 순서). */
export function inCircle(positions, at, r, aspect) {
  const ids = [];
  for (const [id, p] of Object.entries(positions)) if (distU(p, at, aspect) <= r + EPS) ids.push(id);
  return ids;
}

/** r 안에서 가장 가까운 선수 id (ids 로 후보 제한, 같으면 슬롯 순서). 없으면 null. */
export function nearestWithin(positions, at, r, aspect, ids) {
  const allow = ids ? new Set(ids) : null;
  let best = null;
  let bestD = Infinity;
  for (const [id, p] of Object.entries(positions)) {
    if (allow && !allow.has(id)) continue;
    const d = distU(p, at, aspect);
    if (d <= r + EPS && d < bestD - EPS) { best = id; bestD = d; }
  }
  return best;
}

/** 두 구역이 이웃인가 (중심 거리 ≤ NEIGHBOR_MAX_U). 같은 구역도 참. */
export function areNeighbors(a, b, cfg) {
  if (a === b) return true;
  return distU(cfg.centers[a], cfg.centers[b], cfg.aspect) <= NEIGHBOR_MAX_U;
}

/**
 * 흩어지기 가중치 (§14.3) — cfg.weights[pos][zone] × (중점 구역이면 focusWeight).
 * cfg.weights 는 config.training.slotWeights 사본이고 GK 는 DF 와 같다 (§14.21 [가정] Q1-a).
 */
export function zoneWeight(cfg, pos, zone, focusZone, focusWeight = 1) {
  const w = cfg.weights && cfg.weights[pos];
  if (!w) throw new Error(`알 수 없는 포지션: '${pos}'`);
  return (w[zone] || 0) * (zone === focusZone ? focusWeight : 1);
}

/**
 * 감독 AI · 키보드 조작용 후보 놓을 점 (§14.14). 대상 집합이 같은 점은 앞의 것 하나만 남긴다.
 * @param {Object<string,{x,y}>} positions 경기장 선수 위치 (zonePositions)
 * @param {object} cfg data.lesson.zones
 * @param {{kind:"circle"|"single"|"all"|"owner"|"none", r?:number, size?:string,
 *          zoneOf?:Object<string,string>, ids?:string[]}} opts
 *   - circle: r(또는 size) 필수, zoneOf = lesson.zones (구역 중심 · 이웃 판정용)
 *   - single: ids 가 있으면 그 선수만 (onlyZones 거른 후보)
 * @returns {{at:{x,y}, ids:string[], kind:"zone"|"player"|"between"|"field",
 *            zone?:string, zones?:string[], playerId?:string, players?:string[]}[]}
 *   ids = 그 점에 놓았을 때의 대상 (circle: 원 안, single: 그 선수, 그 밖: 경기장 전원)
 */
export function candidatePoints(positions, cfg, opts = {}) {
  const kind = opts.kind;
  const field = Object.keys(positions);
  if (kind === "single") {
    const allow = opts.ids ? new Set(opts.ids) : null;
    return field.filter((id) => !allow || allow.has(id))
      .map((id) => ({ at: { ...positions[id] }, ids: [id], kind: "player", playerId: id }));
  }
  if (kind !== "circle") {
    return [{ at: { x: 50, y: 50 }, ids: field, kind: "field" }];
  }
  const r = opts.r != null ? opts.r : cfg.radius[opts.size];
  if (!(r > 0)) throw new Error("원 반지름이 없습니다");
  const zoneOf = opts.zoneOf || {};
  const A = cfg.aspect;
  const raw = [];
  const occupied = ZONE_IDS.filter((z) => field.some((id) => zoneOf[id] === z));
  // ① 사람이 있는 구역 중심
  for (const z of occupied) raw.push({ at: { ...cfg.centers[z] }, kind: "zone", zone: z });
  // ② 선수 위치
  for (const id of field) raw.push({ at: { ...positions[id] }, kind: "player", playerId: id, zone: zoneOf[id] });
  // ③ 사람이 있는 두 구역 중심의 가운데 (거리 ≤ 2r)
  for (let i = 0; i < occupied.length; i++) for (let j = i + 1; j < occupied.length; j++) {
    const a = cfg.centers[occupied[i]], b = cfg.centers[occupied[j]];
    if (distU(a, b, A) <= 2 * r + EPS) raw.push({ at: { x: r2((a.x + b.x) / 2), y: r2((a.y + b.y) / 2) }, kind: "between", zones: [occupied[i], occupied[j]] });
  }
  // ④ 같은 구역 · 이웃 구역 두 선수의 가운데 (거리 ≤ 2r)
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    const pa = field[i], pb = field[j];
    const za = zoneOf[pa], zb = zoneOf[pb];
    if (za && zb && !areNeighbors(za, zb, cfg)) continue;
    const a = positions[pa], b = positions[pb];
    if (distU(a, b, A) > 2 * r + EPS) continue;
    raw.push({ at: { x: r2((a.x + b.x) / 2), y: r2((a.y + b.y) / 2) }, kind: "between", players: [pa, pb], zones: [za, zb] });
  }
  const seen = new Set();
  const out = [];
  for (const c of raw) {
    const ids = inCircle(positions, c.at, r, A);
    if (!ids.length) continue;
    const key = ids.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...c, ids });
  }
  return out;
}
