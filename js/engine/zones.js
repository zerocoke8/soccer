// js/engine/zones.js — 레슨 훈련 구역 기하 (LESSON_PROTO_PLAN §14.2 · §14.6 · §14.14)
// 순수 함수만: DOM · rng · Date 없음. 좌표는 레슨 필드 % (x = 우리 골 0 → 상대 골 100, y = 위 0 → 아래 100).
// 거리 단위 u = 필드 폭의 1%. 세로 % 차이는 aspect(H/W)를 곱해 u로 바꾼다.
// cfg = data.lesson.zones ({ aspect, pad, pickR, centers, huddle, radius, ownerRadius, dropR, jitter, weights }).
// L52 자연스러운 배치: cfg.jitter 가 있으면 구역 대형을 턴마다 돌리고 · 크기를 바꾸고 · 선수마다 조금 비낀다.
//   흔들림은 해시(lesson.layoutSeed · lesson.turn · 구역 · 선수 id)에서만 나온다 — Math.random · Date · rngState 를 쓰지 않는다.

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

// ---------------------------------------------------------------------------
// L52 자연스러운 배치 (LESSON_PROTO_PLAN §23) — 결정적 해시 흔들림
// ---------------------------------------------------------------------------

/** 문자열 → 32비트 정수 (FNV-1a + murmur3 마무리). 정수 연산만 — 어느 JS 엔진에서도 같다. */
export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 해시 씨앗 → [0, 1) 수열 (mulberry32). 게임 rng(state.rngState) 와 상관없다. */
function hashStream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 레슨 배치 씨앗 (lesson.layoutSeed, 레슨 시작 때 한 번): 런 seed · 주 번호(turnIndex)의 해시.
 * rngState 를 읽지도 쓰지도 않는다 — 배치를 바꿔도 카드 · 실패 · 흩어지기 rng 는 그대로다.
 */
export function layoutSeedOf(seed, turnIndex) {
  return hash32(`L52|${seed ?? ""}|${Number(turnIndex) || 0}`);
}

/** cfg.jitter (없거나 null 이면 null = 예전 정직한 대형). */
export function jitterOf(cfg) {
  const J = cfg && cfg.jitter;
  return J && typeof J === "object" ? J : null;
}

/** n명 원형 대형이 이웃 간격 gap 을 지키는 가장 작은 반지름 (u). */
function ringMin(n, gap) {
  return n >= 2 ? gap / (2 * Math.sin(Math.PI / n)) : 0;
}

/** 오프셋(u) → 필드 % (소수 1자리) */
function placeOffsets(c, offs, aspect) {
  return offs.map((o) => ({ x: r1(clamp(c.x + o.dx, 0, 100)), y: r1(clamp(c.y + o.dy / aspect, 0, 100)) }));
}

/** 놓은 자리 검사: 서로 minGap 이상 · 중심에서 maxR 이하 (반올림 뒤 실제 좌표로) */
function layoutOk(c, pts, aspect, J) {
  for (let i = 0; i < pts.length; i++) {
    if (distU(pts[i], c, aspect) > J.maxR + EPS) return false;
    for (let j = i + 1; j < pts.length; j++) if (distU(pts[i], pts[j], aspect) < J.minGap - EPS) return false;
  }
  return true;
}

/**
 * 겹침 풀기: 가까운 두 선수를 반씩 밀어내고 · 반지름 rMax 밖은 안으로 당긴다 (몇 번 되풀이, 결정적).
 * 같은 자리 두 선수는 번호로 정한 방향으로 민다.
 */
function relax(pts, gap, rMax, iters = 120) {
  for (let it = 0; it < iters; it++) {
    let clean = true;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      let dx = pts[j].dx - pts[i].dx;
      let dy = pts[j].dy - pts[i].dy;
      let d = Math.hypot(dx, dy);
      if (d >= gap) continue;
      clean = false;
      if (d < 1e-6) {
        const a = (i * 7 + j * 13) * 0.7;
        dx = Math.cos(a);
        dy = Math.sin(a);
        d = 1;
      }
      const push = (gap - Math.min(d, gap)) / 2 + 1e-4;
      const ux = dx / d, uy = dy / d;
      pts[i].dx -= ux * push; pts[i].dy -= uy * push;
      pts[j].dx += ux * push; pts[j].dy += uy * push;
    }
    for (const p of pts) {
      const r = Math.hypot(p.dx, p.dy);
      if (r > rMax) {
        clean = false;
        p.dx *= rMax / r;
        p.dy *= rMax / r;
      }
    }
    if (clean) return true;
  }
  return false;
}

/**
 * 한 구역 n명의 자리 (L52, cfg.jitter 가 있을 때). ids = 그 구역 경기장 선수 (슬롯 순서), key = "layoutSeed|turn|zone".
 *  ① 기본 대형 (huddleOffsets) 을 해시 각도만큼 돌리고 (rotate) · 반지름 × radiusScale 사이 값 (n명이 minGap 을 지킬 수 있는 반지름 ~ maxR 로 자름)
 *  ② 선수마다 nudge(u) 안에서 비낀다 (선수 id 해시 — 같은 턴 같은 구역이면 늘 같다)
 *  ③ 겹침 풀기 (minGap + 0.15 여유 · maxR − 0.08 안) → 반올림 뒤 검사. 안 되면 돌리기만 한 대형 → 그래도 안 되면 예전 대형.
 * @returns {{x:number,y:number}[]} ids 순서
 */
function jitteredZone(c, ids, cfg, J, key) {
  const n = ids.length;
  const A = cfg.aspect;
  const base = huddleOffsets(n, cfg);
  const R0 = n >= 2 ? cfg.huddle[Math.min(n, cfg.huddle.length) - 1] : 0;
  const rnd = hashStream(hash32(key));
  const theta = J.rotate ? rnd() * 2 * Math.PI : 0;
  const [s0, s1] = Array.isArray(J.radiusScale) ? J.radiusScale : [1, 1];
  const u = rnd();
  const rMin = ringMin(n, J.minGap + 0.15);
  const rMax = J.maxR - 0.08;
  let R = R0;
  if (n >= 2) {
    const lo = Math.max(R0 * s0, rMin);
    const hi = Math.min(R0 * s1, rMax);
    R = lo <= hi ? lo + u * (hi - lo) : clamp(R0, rMin, rMax);
  }
  const k = R0 > 0 ? R / R0 : 0;
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const turn = (o, f) => ({ dx: (o.dx * cos - o.dy * sin) * f, dy: (o.dx * sin + o.dy * cos) * f });
  const nudge = Math.max(0, Number(J.nudge) || 0);
  const pts = base.map((o, i) => {
    const p = turn(o, k);
    if (nudge > 0) {
      const pr = hashStream(hash32(`${key}|${ids[i]}`));
      const a = pr() * 2 * Math.PI;
      const len = nudge * Math.sqrt(pr());
      p.dx += len * Math.cos(a);
      p.dy += len * Math.sin(a);
    }
    return p;
  });
  relax(pts, J.minGap + 0.15, rMax);
  let out = placeOffsets(c, pts, A);
  if (layoutOk(c, out, A, J)) return out;
  out = placeOffsets(c, base.map((o) => turn(o, 1)), A); // 돌리기만 (간격 · 반지름은 기본 대형 그대로)
  if (layoutOk(c, out, A, J)) return out;
  return placeOffsets(c, base, A);
}

/**
 * cfg.jitter 검사 (L52, 데이터 검증 — cards.validateShapeData 가 부른다). 오류 문구 배열 (없으면 []).
 * jitter 가 없거나 null 이면 통과 (예전 대형). 키: rotate (bool) · radiusScale [lo, hi] (0 < lo ≤ hi) · nudge (≥ 0) ·
 * minGap (> 0) · maxR (> 0, maxR + minGap/2 ≤ pad — 토큰이 구역 바닥 안). 또 n = 1~7 기본 대형이 minGap · maxR 을 지키고
 * (흔들림이 막히면 돌아갈 자리), 구역 중심끼리 2·maxR + minGap 이상 떨어져 (다른 구역 토큰이 겹치지 않는다), 바닥이 필드 안이어야 한다.
 * @returns {string[]}
 */
export function jitterErrors(cfg, maxN = 7) {
  const errors = [];
  if (!cfg || cfg.jitter === undefined || cfg.jitter === null) return errors;
  const J = cfg.jitter;
  const pre = "lesson.zones.jitter";
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (typeof J !== "object" || Array.isArray(J)) return [`${pre} 는 객체나 null 이어야 합니다`];
  for (const k of Object.keys(J)) if (!["rotate", "radiusScale", "nudge", "minGap", "maxR"].includes(k)) errors.push(`${pre}: 알 수 없는 키 '${k}'`);
  if (typeof J.rotate !== "boolean") errors.push(`${pre}.rotate 는 true / false 여야 합니다`);
  const rs = J.radiusScale;
  if (!Array.isArray(rs) || rs.length !== 2 || !rs.every(num) || !(rs[0] > 0) || !(rs[0] <= rs[1])) errors.push(`${pre}.radiusScale 은 [lo, hi] (0 < lo ≤ hi) 여야 합니다`);
  if (!(num(J.nudge) && J.nudge >= 0)) errors.push(`${pre}.nudge 는 0 이상이어야 합니다`);
  if (!(num(J.minGap) && J.minGap > 0)) errors.push(`${pre}.minGap 은 0 보다 커야 합니다`);
  if (!(num(J.maxR) && J.maxR > 0)) errors.push(`${pre}.maxR 은 0 보다 커야 합니다`);
  if (errors.length) return errors;
  if (num(cfg.pad) && J.maxR + J.minGap / 2 > cfg.pad + EPS) errors.push(`${pre}: maxR + minGap/2 (${J.maxR + J.minGap / 2}) 가 구역 바닥 pad (${cfg.pad}) 보다 큽니다`);
  const A = cfg.aspect;
  for (let n = 2; n <= maxN; n++) {
    const offs = huddleOffsets(n, cfg);
    let gap = Infinity, far = 0;
    for (let i = 0; i < n; i++) {
      far = Math.max(far, Math.hypot(offs[i].dx, offs[i].dy));
      for (let j = i + 1; j < n; j++) gap = Math.min(gap, Math.hypot(offs[i].dx - offs[j].dx, offs[i].dy - offs[j].dy));
    }
    if (gap < J.minGap + 0.15 || far > J.maxR - 0.08) errors.push(`${pre}: 기본 대형 n=${n} (간격 ${r2(gap)} · 반지름 ${r2(far)}) 이 minGap · maxR 을 지키지 못합니다`);
  }
  const zs = ZONE_IDS.filter((z) => cfg.centers && cfg.centers[z]);
  for (let i = 0; i < zs.length; i++) {
    const c = cfg.centers[zs[i]];
    const padR = num(cfg.pad) ? cfg.pad : J.maxR;
    if (c.x - padR < 0 || c.x + padR > 100 || c.y - padR / A < 0 || c.y + padR / A > 100) errors.push(`${pre}: '${zs[i]}' 구역 바닥이 필드 밖으로 나갑니다`);
    for (let j = i + 1; j < zs.length; j++) {
      const d = distU(c, cfg.centers[zs[j]], A);
      if (d < 2 * J.maxR + J.minGap) errors.push(`${pre}: '${zs[i]}' · '${zs[j]}' 중심 거리 ${r2(d)} < 2·maxR + minGap`);
    }
  }
  return errors;
}

/**
 * 경기장 선수 위치. lesson.zones 에 있고 벤치가 아닌 선수만, players(슬롯 순서) 순서로.
 * cfg.jitter 가 있으면 (L52) 구역 · 턴마다 다른 자연스러운 대형 — lesson.layoutSeed · lesson.turn · 구역 · 선수 id 의 해시라
 * 같은 상태면 늘 같은 자리다 (같은 턴 안에서는 카드를 내도 그대로, 턴이 바뀌면 바뀐다). jitter 가 null 이면 예전 대형 그대로.
 * @param {{zones?:Object<string,string>, bench?:string[], turn?:number, layoutSeed?:number}} lesson
 * @param {{id:string}[]} players
 * @returns {Object<string,{x:number,y:number}>}
 */
export function zonePositions(lesson, players, cfg) {
  const zones = (lesson && lesson.zones) || {};
  const bench = new Set((lesson && lesson.bench) || []);
  const onField = players.filter((p) => zones[p.id] && !bench.has(p.id));
  const byZone = {};
  for (const p of onField) (byZone[zones[p.id]] ||= []).push(p.id);
  const J = jitterOf(cfg);
  const seedKey = `${Number(lesson && lesson.layoutSeed) || 0}|${Number(lesson && lesson.turn) || 0}`;
  const slot = {};
  for (const z of Object.keys(byZone)) {
    const c = cfg.centers[z];
    if (!c) throw new Error(`알 수 없는 구역: '${z}'`);
    const ids = byZone[z];
    const pts = J ? jitteredZone(c, ids, cfg, J, `${seedKey}|${z}`) : placeOffsets(c, huddleOffsets(ids.length, cfg), cfg.aspect);
    ids.forEach((id, i) => { slot[id] = pts[i]; });
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

/**
 * 놓은 점 → 구역 (L40 자리 옮기기 · 가로지르기, §16.3 ②). clampPoint 뒤 중심이 가장 가까운 구역,
 * 그 거리가 cfg.dropR(u) 보다 멀면 null. 같은 거리면 ZONE_IDS 순서.
 * @returns {string|null}
 */
export function zoneAt(at, cfg) {
  const p = clampPoint(at);
  const R = Number(cfg.dropR);
  if (!(R > 0)) throw new Error("구역 놓기 반경(dropR)이 없습니다");
  let best = null;
  let bestD = Infinity;
  for (const z of ZONE_IDS) {
    const c = cfg.centers[z];
    if (!c) continue;
    const d = distU(p, c, cfg.aspect);
    if (d < bestD - EPS) { best = z; bestD = d; }
  }
  return best && bestD <= R + EPS ? best : null;
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
