// js/ui/layout.js — 경기 화면 좌표 계산 (ARCHITECTURE §12.2 · GDD v0.4 §9.3·9.5)
//
// 원칙: 화면 위치 = 규칙 위치. 공 구역과 14명 전원의 세로 좌표는 SHAPE 표(규칙 단계)에서 나오고,
// 겹침 방지는 가로로만 민다 (예외: 듀얼 수비수는 공 가진 선수와 세로 간격을 확보하되 여전히 공과 자기 골 사이).
//
// 순수 함수 모듈: DOM · window · 난수 없음. Node 에서 그대로 import 해 테스트한다 (test/layout.test.mjs).
// 좌표는 % 단위. x: 0 = 왼쪽 … 100 = 오른쪽, y: 0 = home 골(화면 아래) … 100 = away 골(화면 위).
// (가로 화면은 이 필드 좌표를 그대로 두고 픽셀 변환만 90° 돌린다 — fieldToScreen, §13.9)
//
// 엔진 v0.2 필드(zone / attackStep / attackDir / remaining / receiverPreview / lastBeat)가 없어도 동작한다.
// 있으면 view 값을 쓰고, 없으면 attackingSide + lineIndex(+ players, recentEvents)로 직접 계산한다.
//
// 보강 규칙 (ARCHITECTURE §12.2 · §13.6):
//  - 받는 선수 후보(receiver)는 패스·크로스가 도착하는 구역 안에 선다: fy = max(SHAPE.atk, 도착 구역 시작 + 2) → ③ 단계 FW 후보 = 86 (상대 박스).
//    v0.3: view.receivers(패스·크로스 후보 전원)를 모두 receiver 로 그린다 (결정 중 탭해서 고른다). 크로스 후보 MF 도 박스에.
//    2026-09-29 ④ 박스 연결(컷백·센터링, arrival = 3 = 지금 단계): 후보는 공과 같은 박스 안 (박스 시작 + INSET),
//    공 가진 선수와 레인이 가까우면 다른 후보가 적은 쪽으로 비켜 선다 (BOX_LANE — 연결 화살표가 보이고, 다른 후보에게 가는 길을 막지 않게).
//    연결 성공 직후 배너 = "★ 컷백! ○○ 원터치 슛 찬스".
//  - 경기 종료 view: 마지막 비트가 끝난 뒤의 모습 — 턴오버/세이브면 공을 얻은 선수(수비수·GK)가 공을 갖고,
//    골이면 공은 골문 안, carrier 없음 (finalFrame).
//  - 좁고 높은 필드(aspect ≥ 1.1)에서 ④ 단계 GK 가 세로 간격을 못 얻으면 공을 자기 골 쪽으로 당긴다 (구역 · 뚫린 라인 앞 유지).
//  - 가로로 놓을 자리가 없으면 규칙 방향(공과 멀어지는 쪽)으로만 세로를 조금 민다. 승부차기 반원이 모자라면 두 줄 지그재그.
//  - 2026-09-29 GK 배급 대기 (view.phase "distribution" — distributionLayout): 공 = 배급 GK (자기 박스 안 DISTRIBUTION.gkFy),
//    배급 팀은 빌드업(①) 모양, 상대는 ① 수비 모양. 받는 선수 후보 = 짧은 패스 DF · 롱패스 MF (엔진 view.distribution.options 의
//    starterId, 제자리), 롱패스를 다투는 상대 MF(contest) = defender 역할 (롱패스 받는 선수와 같은 레인 — 낙하 지점 경합).
//    zone = GK 박스 (gkZone), track.gk = true (아직 ① 전). 배급 비트 뒤 배너 = "롱패스 성공! 중원에서 시작" · 롱패스 실패 뒤 "세컨드볼!".

export const ZONES = [
  { id: 1, from: 0, to: 16, name: "우리 박스" },
  { id: 2, from: 16, to: 40, name: "우리 진영" },
  { id: 3, from: 40, to: 60, name: "중원" },
  { id: 4, from: 60, to: 84, name: "상대 진영" },
  { id: 5, from: 84, to: 100, name: "상대 박스" },
];

/** 공격 방향 기준 세로 % (0 = 공격 팀 골, 100 = 상대 골) — GDD v0.4 §9.3 표. 인덱스 = 단계(0..3) */
export const SHAPE = {
  ball: [28, 50, 72, 90],
  atk: { GK: [4, 6, 8, 10], DF: [26, 34, 44, 50], MF: [46, 52, 62, 70], FW: [60, 68, 78, 86] },
  def: { FW: [32, 42, 58, 68], MF: [52, 54, 64, 78], DF: [70, 72, 76, 86], GK: [96, 96, 96, 97] },
};

/** 라인 인원수별 가로 % (slot 순서) */
export const LANES = { 1: [50], 2: [30, 70], 3: [20, 50, 80] };
export const X_MIN = 6;
export const X_MAX = 94;

/** 위기·찬스 구역 표시 (home 시점 고정, GDD §9.5): HIGHLIGHTS[공격 팀][구역] */
export const HIGHLIGHTS = {
  home: { 4: { level: "chance", label: "찬스" }, 5: { level: "shotChance", label: "슈팅 찬스" } },
  away: { 2: { level: "danger", label: "위험 지역" }, 1: { level: "crisis", label: "슈팅 위기" } },
};

/** 승부차기 배치 (공격 방향 기준 세로 %: 페널티 스폿, 골문, 박스 밖 반원 중심 ±폭) */
const PENALTY = { spot: 90, goal: 97, arcBase: 70, arcHalf: 6, arcSpan: 42, kickerBack: 2 };

/** 패스 후보: 도착 구역 시작에서 이만큼 안쪽 (공격 방향 기준 %) */
export const RECEIVER_INSET = 2;
/**
 * ④ 박스 연결(컷백·센터링) 후보의 가로 자리: 공 가진 선수와 레인이 gap 안으로 가까우면 shift 만큼 비켜 선다 — 다른 후보가 적은 쪽으로
 * (다른 후보에게 가는 연결 길 위에 서지 않게), 같으면 필드 가운데 쪽. 비킨 자리는 [min, max] 안 (구역 이름 · 터치라인에서 떨어진다).
 * 세로는 박스 시작 + INSET (공 가진 선수 바로 뒤라 같은 레인이면 연결 화살표가 보이지 않는다). 다만 공 가진 선수 → 후보 화살표가
 * 다른 후보(또는 다른 선수) 위를 지나면 그 후보는 박스 안쪽 깊은 줄 deep (공 90 과 GK 97 사이 — 먼 쪽 포스트로 뛰어드는 자리)에 선다
 * (boxDepths: 후보 ≤ 3 명의 가장자리/깊은 줄 조합 중 화살표가 가장 덜 가려지는 것). clear = 화살표와 다른 토큰 중심의 최소 거리 (토큰 지름 배).
 */
export const BOX_LANE = { gap: 16, shift: 16, min: 10, max: 90, deep: 93.5, clear: 0.6 };
/** 듀얼 수비수를 세로로 밀 때 먼저 지키는 상한(GK 골문 97) · 절대 상한 */
const DEF_SOFT_MAX = 97;
const DEF_HARD_MAX = 99.5;
/** 골로 끝난 경기의 마지막 모습: 공 = 골문 안(오른쪽), 상대 GK = 반대로 다이브 (공격 방향 기준 %) */
const GOAL_FRAME = { ballX: 58, ballFy: 99.5, gkX: 38 };
/** 가로 자리가 없을 때 세로로 미는 단위·최대 횟수 */
const NUDGE = { step: 1.5, max: 8 };
/** GK 배급 대기: 배급 GK(공)의 세로 % (공격 방향 기준 — 자기 박스 0~16 안, 골문 앞 SHAPE.atk.GK[0] 보다 조금 앞) */
export const DISTRIBUTION = { gkFy: 9 };

// 엔진(match.js)과 같은 값의 사본 — layout 은 엔진 없이도 import 된다
const POSITIONS = ["GK", "DF", "MF", "FW"];
const POS_BY_LINE = ["FW", "MF", "DF", "GK"];
const BEAT_TYPES = new Set(["kickoff", "counter", "duel", "turnover", "save", "goal", "penalty", "distribution"]);
const EPS = 1e-9;

/* ------------------------------------------------------------------ */
/* 공개 헬퍼                                                              */
/* ------------------------------------------------------------------ */

/** 공 구역 (home 시점 고정): home 공격 lineIndex + 2 (0→2 … 3→5), away 공격 4 − lineIndex (0→4 … 3→1) */
export function zoneFor(attackingSide, lineIndex) {
  const step = clampInt(lineIndex, 0, 3);
  return attackingSide === "away" ? 4 - step : step + 2;
}

/** 세로 좌표 y 가 속한 구역 id (경계값은 위 구역) */
export function zoneAtY(y) {
  for (const z of ZONES) if (y < z.to) return z.id;
  return 5;
}

/**
 * 필드 좌표(%) → 필드 요소 안 픽셀 [sx, sy] (ARCHITECTURE §14.3). W·H = 필드 요소의 픽셀 폭·높이.
 * - orient "land"(가로, 기본 — 화면은 가로 전용): 세로 그림을 시계 방향으로 90° 돌린 것 (거울상 아님) — home 골 왼쪽 · away 골 오른쪽,
 *   세로 화면의 왼쪽(x = 0)이 가로 화면의 위. sx = y/100·W, sy = x/100·H
 * - orient "port"(옛 세로 경기 화면, 명시할 때만): home 골 아래 · away 골 위. sx = x/100·W, sy = (100 − y)/100·H
 */
export function fieldToScreen(x, y, W, H, orient = "land") {
  if (orient === "land") return [(y / 100) * W, (x / 100) * H];
  return [(x / 100) * W, ((100 - y) / 100) * H];
}

/** fieldToScreen 의 역변환: 픽셀 [sx, sy] → 필드 좌표 { x, y } (%) */
export function screenToField(sx, sy, W, H, orient = "land") {
  if (orient === "land") return { x: (sy / H) * 100, y: (sx / W) * 100 };
  return { x: (sx / W) * 100, y: 100 - (sy / H) * 100 };
}

/** 두 토큰 중심 거리 (필드 폭 % 단위; 세로는 aspect = 폭/높이 로 환산) */
export function tokenDistance(a, b, aspect = 0.8) {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

/**
 * 한국어 조사: pair 는 "받침 있을 때/없을 때" 순서 — "이/가", "과/와", "을/를", "은/는".
 * 예: withJosa("아델린", "이/가") → "아델린이", withJosa("네리아", "과/와") → "네리아와"
 */
export function withJosa(word, pair) {
  const w = String(word ?? "");
  const [withB, withoutB] = String(pair).split("/");
  return w + (hasBatchim(w) ? withB : withoutB);
}

/**
 * 화면에 그릴 미리보기(receiverPreview · receivers · outcomes)를 고른 view 사본 (GDD §9.6: 미리보기 = 실제). view 는 바꾸지 않는다.
 * - deciding = true (사람이 고르는 중): 토글한 스킬(skillId) 또는 필살기(ultimate = true → 사람 측 ultimateOptions 의 필살기 skillId)가
 *   엔진 view.receiverPreviewBySkill / receiversBySkill / outcomesBySkill 에 있으면 그 변형
 *   (라인 브레이커 같은 extraLine 은 수신 후보·도착 구역이, 필살 패스는 기본 받는 선수(합체기)가, 소매치기는 역습 구역이 바뀐다).
 *   둘 다 변형이 있으면 스킬 쪽 (엔진은 한 변형씩만 준다).
 * - deciding = false (자동 진행 중): 사람 측 AI 가 step() 안에서 스킬·필살기를 고르므로, 변형 중 기본 받는 선수가 다른 것이 있으면
 *   receiverPreview 를, 수신 후보·도착 단계가 다른 것이 있으면 receivers 까지 지운다 — 확정할 수 없는 후보는 그리지 않는다.
 *   상대 측 공격은 AI 가 먼저 커밋해 이미 정확하다.
 * 바꿀 것이 없으면 view 그대로 반환.
 */
export function resolvePreview(view, { skillId = null, ultimate = false, deciding = true } = {}) {
  if (!view || typeof view !== "object") return view;
  const obj = (x) => (x && typeof x === "object" ? x : null);
  const rpBy = obj(view.receiverPreviewBySkill);
  const outBy = obj(view.outcomesBySkill);
  const rcvBy = obj(view.receiversBySkill);
  const has = (m, k) => !!m && k != null && Object.prototype.hasOwnProperty.call(m, k);
  if (deciding) {
    const ultKey = ultimate ? ultimateSkillKey(view) : null;
    const key = [skillId, ultKey].find((k) => has(rpBy, k) || has(outBy, k) || has(rcvBy, k));
    if (key == null) return view;
    let out = { ...view };
    if (has(rpBy, key)) out.receiverPreview = rpBy[key];
    if (has(rcvBy, key) && rcvBy[key]) out.receivers = rcvBy[key];
    if (outBy && outBy[key]) out.outcomes = outBy[key];
    return out;
  }
  const human = view.humanSide === "away" ? "away" : "home";
  if (view.attackingSide !== human) return view;
  let out = view;
  const rp = view.receiverPreview;
  if (rp && rpBy) {
    const uncertain = Object.values(rpBy).some((r) => (r && r.id != null ? String(r.id) : null) !== String(rp.id));
    if (uncertain) out = { ...out, receiverPreview: null };
  }
  const base = obj(view.receivers);
  if (base && rcvBy && Object.keys(base).length) {
    const sig = (rs) => ["pass", "cross"].map((a) => {
      const r = rs && rs[a];
      return r ? `${a}:${r.arrival}:${(Array.isArray(r.candidates) ? r.candidates : []).join(",")}` : `${a}:-`;
    }).join("|");
    const b = sig(base);
    if (Object.values(rcvBy).some((r) => sig(r) !== b)) out = { ...out, receivers: {}, receiverPreview: null };
  }
  return out;
}

/** 사람 측 결정의 필살기 skillId (ultimateOptions 중 쓸 수 있는 것). 없으면 null */
function ultimateSkillKey(view) {
  const opts = Array.isArray(view.ultimateOptions) ? view.ultimateOptions : [];
  const u = opts.find((o) => o && o.usable) || null;
  return u ? u.skillId : null;
}

/**
 * view 의 패스·크로스 받는 선수 후보 (§13.4 receivers) → [{ id, actions: ["pass"|"cross"], arrival }] (선수 순서 무관, 중복 합침).
 * receivers 가 없으면 receiverPreview 한 명 (v0.2 view 호환).
 */
export function receiverCandidates(view) {
  const v = view && typeof view === "object" ? view : {};
  const out = new Map();
  const r = v.receivers && typeof v.receivers === "object" ? v.receivers : null;
  const step = clampInt(v.attackStep ?? v.lineIndex, 0, 3);
  // 도착 단계: 지금보다 앞 (최대 ③→④). ④ 박스 연결(컷백·센터링)은 도착 = ④ 그대로 (공은 박스에 남는다)
  const validArrival = (a) => Number.isInteger(a) && a <= 3 && (a > step || (step >= 3 && a === 3));
  if (r) {
    for (const a of ["pass", "cross"]) {
      const x = r[a];
      if (!x || !Array.isArray(x.candidates)) continue;
      const arrival = validArrival(x.arrival) ? x.arrival : Math.min(3, step + 1);
      for (const id of x.candidates) {
        if (id == null) continue;
        const k = String(id);
        const cur = out.get(k);
        if (cur) {
          cur.actions.push(a);
          cur.arrival = Math.min(cur.arrival, arrival);
        } else out.set(k, { id: k, actions: [a], arrival });
      }
    }
  }
  const rp = v.receiverPreview;
  if (rp && rp.id != null && !out.has(String(rp.id))) {
    const arrival = validArrival(rp.step) ? rp.step : Math.min(3, step + 1);
    out.set(String(rp.id), { id: String(rp.id), actions: ["pass"], arrival });
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ */
/* computeLayout                                                        */
/* ------------------------------------------------------------------ */

/**
 * @param {object} view match.getMatchView(...) 반환값
 * @param {{ aspect?: number, tokenSize?: number }} [opts] aspect = 필드 폭/높이 (기본 0.8), tokenSize = 필드 폭 대비 토큰 지름 (기본 0.075).
 *   폭 = x 방향(골과 나란한 쪽) 픽셀, 높이 = y 방향(골↔골) 픽셀 — 가로 화면이면 폭 = 요소 높이, 높이 = 요소 폭 (§13.9)
 * @returns {{
 *   mode: "play"|"penalties",
 *   ball: {x:number,y:number},
 *   tokens: Array<{side,id,name,slot,position,x,y,role,staminaRatio,portraitColor,isYouth,trait}>,
 *   zone: number,
 *   highlight: { zone:number, level: "danger"|"crisis"|"chance"|"shotChance"|null, label: string },
 *   track: { side: "home"|"away", step: number, dir: "up"|"down" },
 *   remainingText: string,
 *   banner: string|null,
 *   attackingSide: "home"|"away", attackStep: number,
 *   carrierId: string|null, defenderId: string|null,
 *   receiverId: string|null,   // 기본 패스 받는 선수 (view.receiverPreview) — 후보 중 하나
 *   receiverIds: string[],     // 받는 선수 후보 전원 (view.receivers 패스+크로스, 공격 팀 선수 순서) — 모두 role "receiver", 도착 구역
 *   nextBall: {x,y}|null,   // 드리블 성공 시 공 좌표 (다음 단계). ④ 단계·승부차기면 null
 *   goal: {x,y},            // 공격 팀이 노리는 골문 좌표
 * }}
 */
export function computeLayout(view, opts = {}) {
  const v = view && typeof view === "object" ? view : {};
  const o = opts && typeof opts === "object" ? opts : {};
  const aspect = positive(o.aspect, 0.8);
  const tokenSize = positive(o.tokenSize, 0.075);
  const geo = { aspect, minD: tokenSize * 100, minDy: tokenSize * 100 * aspect };
  const teams = { home: normTeam(v, "home"), away: normTeam(v, "away") };
  const lastBeat = findLastBeat(v);
  if (isPenaltyView(v)) return penaltyLayout(v, teams, geo, lastBeat);
  const dist = distributionOf(v);
  return dist ? distributionLayout(v, teams, geo, lastBeat, dist) : playLayout(v, teams, geo, lastBeat);
}

/** GK 배급 대기 view 의 distribution (엔진 view.distribution — phase "distribution", 종료 전). 아니면 null */
function distributionOf(v) {
  if (v.finished || v.phase !== "distribution") return null;
  const d = v.distribution;
  return d && typeof d === "object" && isSide(d.side) ? d : null;
}

/* ------------------------------------------------------------------ */
/* 인플레이                                                              */
/* ------------------------------------------------------------------ */

// 배치 우선순위 (먼저 놓인 토큰은 뒤에 놓이는 토큰에게 밀리지 않는다)
const PRIO = { carrier: 0, defender: 1, receiver: 2, gk: 3, cover: 4, support: 5, broken: 6 };

function playLayout(v, teams, geo, lastBeat) {
  // 경기 종료: 마지막 비트가 끝난 뒤의 모습 (공을 얻은 팀 기준). 정보가 없으면 null → 마지막 상태 그대로
  const fin = v.finished ? finalFrame(lastBeat) : null;
  const atk = fin ? fin.atk : v.attackingSide === "away" ? "away" : "home";
  const def = otherSide(atk);
  const step = fin ? fin.step : clampInt(v.attackStep ?? v.lineIndex, 0, 3);
  const toY = (fy) => (atk === "home" ? fy : 100 - fy);
  const A = teams[atk];
  const D = teams[def];

  let carrier;
  let defender;
  let receiver = null;
  // 받는 선수 후보 전원 (§13.4 receivers: 패스 + 크로스) → 도착 단계. 후보는 모두 도착 구역에 선다 (GDD v0.5 §9.6 · 9.8)
  const landingOf = new Map();
  if (fin) {
    carrier = findEntry(A, fin.holderId);
    defender = null;
  } else {
    carrier = findEntry(A, v.carrier && v.carrier.id) || A.list.find((e) => e.p.isCarrier) || null;
    defender = findEntry(D, v.defender && v.defender.id) || D.list.find((e) => e.p.isDefender) || null;
    // 도착 단계: 엔진 receivers[a].arrival · receiverPreview.step (커밋된 extraLine · 스킬 변형 포함) → 없으면 다음 단계
    const probe = { ...v, attackStep: step, lineIndex: step };
    for (const c of receiverCandidates(probe)) {
      const e = findEntry(A, c.id);
      if (e && e !== carrier) landingOf.set(e, c.arrival);
    }
    const rp = v.receiverPreview;
    receiver = rp && rp.id != null ? findEntry(A, rp.id) : null;
    if (receiver === carrier || !landingOf.has(receiver)) receiver = null;
  }

  const duelPos = POS_BY_LINE[step];
  // 공 세로: 세이브로 끝났으면 GK 품(자기 골문 앞), 그 밖에는 단계 좌표
  const holdAtGoal = !!(fin && fin.kind === "save" && carrier && carrier.position === "GK");
  let ballFy = holdAtGoal ? SHAPE.atk.GK[step] : SHAPE.ball[step];

  // 듀얼 수비수: 공 가진 선수와 마주보도록 세로 간격 확보 (자기 골 쪽으로 — 여전히 공과 골 사이).
  // 필드가 좁고 높아 골문(97)을 넘게 되면 먼저 공을 자기 골 쪽으로 당긴다 (같은 구역 · 뚫린 라인보다 앞 유지)
  let defFy = defender ? SHAPE.def[duelPos][step] : null;
  if (defender && carrier) {
    const base = defFy;
    defFy = Math.max(base, ballFy + geo.minDy);
    if (defFy > DEF_SOFT_MAX) {
      ballFy = Math.max(ballFloor(step), Math.min(ballFy, DEF_SOFT_MAX - geo.minDy));
      defFy = Math.min(DEF_HARD_MAX, Math.max(base, ballFy + geo.minDy));
    }
  }
  const carrierX = carrier ? carrier.laneX : 50;
  // ④ 박스 연결: 공 가진 선수 레인에서 떨어진(비키지 않는) 후보들의 레인 — 비키는 후보가 그 반대쪽으로 (boxLaneX)
  const boxOthers = step >= 3 && carrier
    ? [...landingOf.keys()].map((e) => e.laneX).filter((x) => Math.abs(x - carrier.laneX) >= BOX_LANE.gap)
    : [];

  const specs = [];
  for (const e of A.list) {
    let role;
    let fy;
    let prio;
    let fx = e.laneX;
    let nudge = -1; // 가로 자리가 없으면 자기 골 쪽(공 뒤)으로
    if (e === carrier) {
      role = "carrier";
      fy = ballFy;
      // 롱패스를 끊고 끝난 경기: 끊은 선수 = 롱패스 받을 선수의 레인 (finalFrame.laneId)
      const lane = fin && fin.laneId != null ? findEntry(D, fin.laneId) : null;
      if (lane) fx = lane.laneX;
    } else if (landingOf.has(e)) {
      role = "receiver";
      // 받는 선수 후보: 패스·크로스가 도착하는 구역 안 (GDD §9.3 공격 팀 2 — 공보다 한 구역 앞).
      // ④ 박스 연결은 도착 = 공과 같은 박스 (박스 시작 + INSET — 컷백은 뒤로 내준다), 공 가진 선수 레인에서 비켜 선다
      const landing = landingOf.get(e);
      fy = Math.max(SHAPE.atk[e.position][step], ZONES[Math.min(5, landing + 2) - 1].from + RECEIVER_INSET);
      nudge = 1;
      if (step >= 3 && carrier) fx = boxLaneX(e.laneX, carrier.laneX, boxOthers);
    } else if (e.position === "GK") {
      role = "gk";
      fy = SHAPE.atk.GK[step];
      nudge = 1;
    } else {
      role = "support";
      fy = SHAPE.atk[e.position][step];
      // 골로 끝난 경기: 득점자는 슛한 자리에 (carrier 역할 없이)
      if (fin && fin.kind === "goal" && fin.shooterId != null && e.id === String(fin.shooterId)) {
        fy = SHAPE.ball[step];
        prio = PRIO.carrier;
      }
    }
    specs.push({ e, role, fx, fy, prio, nudge, sideOrder: 0 });
  }
  for (const e of D.list) {
    const li = POS_BY_LINE.indexOf(e.position);
    let role;
    let fy;
    let fx = e.laneX;
    let nudge = 1; // 남은 수비: 자기 골 쪽(공과 멀어지는 쪽)으로
    if (e === defender) {
      role = "defender";
      fy = defFy;
      if (carrier) fx = carrierX;
    } else if (e.position === "GK") {
      role = "gk";
      fy = SHAPE.def.GK[step];
      if (fin && fin.kind === "goal") fx = GOAL_FRAME.gkX; // 골: 반대쪽으로 다이브
    } else if (li < step) {
      role = "broken";
      fy = SHAPE.def[e.position][step];
      nudge = -1; // 뚫린 라인: 더 뒤로
    } else {
      role = li === step && defender ? "cover" : "support";
      fy = SHAPE.def[e.position][step];
    }
    specs.push({ e, role, fx, fy, nudge, sideOrder: 1 });
  }

  let pos = placeAll(specs, toY, geo);
  // ④ 박스 연결: 후보의 깊이(박스 가장자리 / 안쪽 깊은 줄)를 연결 화살표가 다른 토큰 위를 지나지 않게 고른다
  if (step >= 3 && carrier && !fin) {
    const recv = specs.filter((s) => s.role === "receiver");
    if (recv.length) pos = boxDepths(specs, recv, carrier, receiver, toY, geo);
  }

  const cPos = carrier ? pos.get(carrier) : null;
  let ball;
  if (cPos) ball = { x: cPos.x, y: cPos.y };
  else if (fin && fin.kind === "goal") ball = { x: GOAL_FRAME.ballX, y: toY(GOAL_FRAME.ballFy) };
  else ball = { x: 50, y: toY(ballFy) };
  const zone = fin ? zoneAtY(ball.y) : validZone(v.zone) ?? zoneFor(atk, step);
  const tokens = buildTokens(teams, pos);
  const finished = !!v.finished;
  // 종료 후에는 "남은 수비"가 의미 없다 (정보 줄은 '경기 종료')
  const remainingText = finished
    ? ""
    : v.remaining && typeof v.remaining.text === "string" ? v.remaining.text : remainingFromTeam(D, step);

  const gkEntry = defender && defender.position === "GK" ? defender : D.byPos.GK[0] || defender;
  const banner = playBanner({
    atk, step, zone, finished, lastBeat, prevBeat: findPrevBeat(v, lastBeat), remainingText,
    carrierName: carrier ? carrier.name : null,
    defenderName: defender ? defender.name : null,
    gkName: gkEntry ? gkEntry.name : null,
  });

  return {
    mode: "play",
    ball,
    tokens,
    zone,
    highlight: highlightFor(atk, zone, finished),
    track: { side: atk, step, dir: fin ? (atk === "home" ? "up" : "down") : attackDir(v, atk) },
    remainingText,
    banner,
    attackingSide: atk,
    attackStep: step,
    carrierId: carrier ? carrier.id : null,
    defenderId: defender ? defender.id : null,
    receiverId: receiver ? receiver.id : null,
    receiverIds: A.list.filter((e) => landingOf.has(e)).map((e) => e.id),
    nextBall: step < 3 && !fin ? { x: ball.x, y: toY(SHAPE.ball[step + 1]) } : null,
    goal: { x: 50, y: atk === "home" ? 100 : 0 },
  };
}

/* ------------------------------------------------------------------ */
/* GK 배급 대기 (2026-09-29)                                              */
/* ------------------------------------------------------------------ */

/**
 * GK 배급 대기 (view.phase "distribution"): 세이브 · 박스 연결 차단 뒤 GK 가 자기 박스에서 공을 들고 배급을 고른다.
 *  - 공 = 배급 GK (carrier, 세로 DISTRIBUTION.gkFy — 자기 박스 안). 배급 팀의 나머지는 빌드업(①) 모양 SHAPE.atk[pos][0].
 *  - 받는 선수 후보(receiver) = 짧은 패스 받는 선수(options.short.success.starterId — DF) · 롱패스 받는 선수(options.long … — MF), 제자리.
 *  - 상대 = ① 수비 모양 SHAPE.def[pos][0] (FW 가 전방 압박). 롱패스를 다투는 상대 MF(contest) = defender 역할,
 *    롱패스 받는 선수와 같은 레인 (낙하 지점 경합 — 화면에서 둘이 마주 본다). 뚫린 라인 없음.
 *  - zone = 배급 GK 의 박스 (gkZone — home 1 · away 5), track = { side, step: 0, dir, gk: true } (아직 ① 전), nextBall 없음.
 *  - receiverId = 자동 배급(auto.action)의 받는 선수, dist = { short, long, contest } (받는 선수 · 경합 선수 id — 화면 미리보기용).
 */
function distributionLayout(v, teams, geo, lastBeat, dist) {
  const atk = dist.side;
  const def = otherSide(atk);
  const toY = (fy) => (atk === "home" ? fy : 100 - fy);
  const A = teams[atk];
  const D = teams[def];
  const opts = dist.options && typeof dist.options === "object" ? dist.options : {};
  const starter = (a) => (opts[a] && opts[a].success ? opts[a].success.starterId : null);
  const carrier = findEntry(A, dist.gkId) || findEntry(A, v.carrier && v.carrier.id) || A.byPos.GK[0] || null;
  const shortE = findEntry(A, starter("short"));
  const longE = findEntry(A, starter("long"));
  const contest = findEntry(D, dist.contest && dist.contest.id);
  const recv = new Set([shortE, longE].filter((e) => e && e !== carrier));

  const specs = [];
  for (const e of A.list) {
    if (e === carrier) specs.push({ e, role: "carrier", fx: e.laneX, fy: DISTRIBUTION.gkFy, nudge: 1, sideOrder: 0 });
    else if (recv.has(e)) specs.push({ e, role: "receiver", fx: e.laneX, fy: SHAPE.atk[e.position][0], nudge: 1, sideOrder: 0 });
    else specs.push({ e, role: e.position === "GK" ? "gk" : "support", fx: e.laneX, fy: SHAPE.atk[e.position][0], nudge: e.position === "GK" ? 1 : -1, sideOrder: 0 });
  }
  for (const e of D.list) {
    if (e === contest) specs.push({ e, role: "defender", fx: longE ? longE.laneX : e.laneX, fy: SHAPE.def[e.position][0], nudge: 1, sideOrder: 1 });
    else specs.push({ e, role: e.position === "GK" ? "gk" : "support", fx: e.laneX, fy: SHAPE.def[e.position][0], nudge: 1, sideOrder: 1 });
  }
  const pos = placeAll(specs, toY, geo);
  const cPos = carrier ? pos.get(carrier) : null;
  const ball = cPos ? { x: cPos.x, y: cPos.y } : { x: 50, y: toY(DISTRIBUTION.gkFy) };
  const zone = validZone(dist.gkZone) ?? zoneAtY(ball.y);
  const remainingText = v.remaining && typeof v.remaining.text === "string" ? v.remaining.text : remainingFromTeam(D, 0);
  const autoId = dist.auto && dist.auto.action === "long" ? longE : dist.auto && dist.auto.action === "short" ? shortE : null;
  const gkName = carrier ? carrier.name : "GK";
  const banner = atk === "home"
    ? `🧤 ${withJosa(gkName, "이/가")} 배급 — 짧게 빌드업 · 길게 중원`
    : `상대 GK ${gkName} 배급 — 롱패스면 중원 경합`;
  return {
    mode: "play",
    ball,
    tokens: buildTokens(teams, pos),
    zone,
    highlight: highlightFor(atk, zone, false),
    track: { side: atk, step: 0, dir: attackDir(v, atk), gk: true },
    remainingText,
    banner,
    attackingSide: atk,
    attackStep: 0,
    carrierId: carrier ? carrier.id : null,
    defenderId: contest ? contest.id : null,
    receiverId: autoId && recv.has(autoId) ? autoId.id : null,
    receiverIds: A.list.filter((e) => recv.has(e)).map((e) => e.id),
    nextBall: null,
    goal: { x: 50, y: atk === "home" ? 100 : 0 },
    dist: { short: shortE ? shortE.id : null, long: longE ? longE.id : null, contest: contest ? contest.id : null },
  };
}

/**
 * 경기 종료 view 의 마지막 모습 (마지막 비트가 끝난 뒤). 엔진은 종료 시 다음 포제션을 시작하지 않으므로
 * view.carrier / attackingSide 는 판정 전(공을 잃은 쪽) 값이다 → lastBeat 로 판정 후 모습을 만든다.
 *  - turnover: 공을 뺏은 수비수가 carrier, 공을 얻은 팀(toAttackingSide)의 toStep 모양 (= 정상 진행의 역습 모양).
 *    GK 롱패스 차단(distribution: true)이면 끊은 선수는 롱패스 받을 선수(receiverId)의 레인 (laneId)
 *  - save:     GK 가 공을 품에 (자기 골문 앞), GK 팀의 toStep 모양
 *  - goal:     공은 골문 안, carrier 없음, 득점 팀의 슛 단계 모양 (득점자는 슛한 자리)
 * @returns {null | { kind, atk, step, holderId, shooterId?, laneId? }}
 */
function finalFrame(lb) {
  if (!lb || typeof lb !== "object") return null;
  const beatAtk = isSide(lb.attackingSide) ? lb.attackingSide : isSide(lb.side) ? lb.side : null;
  if (!beatAtk) return null;
  const fromStep = clampInt(lb.step ?? (lb.type === "turnover" ? 0 : 3), 0, 3);
  if (lb.type === "goal") {
    return { kind: "goal", atk: beatAtk, step: fromStep, holderId: null, shooterId: lb.playerId ?? null };
  }
  if (lb.type === "turnover" || lb.type === "save") {
    const toSide = isSide(lb.toAttackingSide) ? lb.toAttackingSide : otherSide(beatAtk);
    let toStep;
    if (lb.toStep != null && Number.isFinite(Number(lb.toStep))) toStep = clampInt(lb.toStep, 0, 3);
    else toStep = lb.type === "save" ? 0 : [2, 1, 0, 0][fromStep]; // §7.5 역습 시작 (스킬 없음)
    // GK 롱패스 차단으로 끝남 (distribution: true): 끊은 선수는 롱패스가 향하던 선수(receiverId)의 레인 — 낙하 지점에 그대로 (2026-09-30)
    const laneId = lb.type === "turnover" && lb.distribution && lb.receiverId != null ? String(lb.receiverId) : null;
    return { kind: lb.type, atk: toSide, step: toStep, holderId: lb.defenderId ?? null, laneId };
  }
  return null;
}

/**
 * ④ 박스 연결 후보의 원하는 가로 %: 공 가진 선수 레인(cx)에서 BOX_LANE.gap 안이면 shift 만큼 비킨다.
 * 방향 = 다른 후보(others: 비키지 않는 후보들의 레인)가 적은 쪽, 같으면 필드 가운데 쪽.
 * 그쪽이 [min, max] 에 막혀 덜 비켜져도 반대쪽에 다른 후보가 있으면 그대로 (다른 후보에게 가는 길 위에 서지 않는 게 먼저), 없으면 반대쪽
 */
function boxLaneX(laneX, cx, others) {
  if (Math.abs(laneX - cx) >= BOX_LANE.gap) return laneX;
  const plus = others.filter((x) => x > cx).length;
  const minus = others.filter((x) => x < cx).length;
  const dir = plus !== minus ? (plus < minus ? 1 : -1) : cx <= 50 ? 1 : -1;
  const at = (d) => clamp(cx + d * BOX_LANE.shift, BOX_LANE.min, BOX_LANE.max);
  const x = at(dir);
  if (Math.abs(x - cx) >= BOX_LANE.gap - EPS) return x;
  return (dir > 0 ? minus : plus) > 0 ? x : at(-dir);
}

/**
 * ④ 박스 연결 후보의 깊이: 후보마다 박스 가장자리(spec 의 fy) 또는 깊은 줄(BOX_LANE.deep) — 모든 조합(후보 ≤ 3 → ≤ 8)을 놓아 보고
 * 벌점이 가장 적은 배치를 고른다 (동점이면 앞 조합 = 깊은 줄이 적은 쪽). 결정적.
 * 벌점: 공 가진 선수 → 후보 선분이 다른 토큰 중심에서 BOX_LANE.clear × 지름 안을 지나면 — 다른 후보 10, 그 밖 3, 뚫린(반투명) 선수 1.
 * 기본 받는 선수(receiver)의 화살표는 ×2 (먼저 보이는 화살표). 깊은 줄 후보 1명당 1 (가장자리가 기본).
 * 고른 깊이를 specs 에 남기고 그 배치(pos)를 돌려준다.
 */
function boxDepths(specs, recv, carrier, receiver, toY, geo) {
  const edge = recv.map((s) => s.fy);
  const apply = (mask) => recv.forEach((s, i) => { s.fy = mask & (1 << i) ? BOX_LANE.deep : edge[i]; });
  let best = null;
  for (let mask = 0; mask < 1 << recv.length; mask++) {
    apply(mask);
    const pos = placeAll(specs, toY, geo);
    const C = pos.get(carrier);
    let score = 0;
    recv.forEach((s, i) => {
      if (mask & (1 << i)) score += 1;
      const R = pos.get(s.e);
      let pen = 0;
      for (const [e, p] of pos) {
        if (e === carrier || e === s.e) continue;
        if (segDist(p, C, R, geo.aspect) >= geo.minD * BOX_LANE.clear) continue;
        pen += p.role === "receiver" ? 10 : p.role === "broken" ? 1 : 3;
      }
      score += pen * (s.e === receiver ? 2 : 1);
    });
    if (!best || score < best.score) best = { score, mask, pos };
  }
  apply(best.mask);
  return best.pos;
}

/** 점 p 와 선분 a–b 의 거리 (필드 폭 % 단위, 세로는 aspect 로 환산 — tokenDistance 와 같은 척도) */
function segDist(p, a, b, aspect) {
  const ax = a.x;
  const ay = a.y / aspect;
  const dx = b.x - ax;
  const dy = b.y / aspect - ay;
  const px = p.x - ax;
  const py = p.y / aspect - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > EPS ? clamp((px * dx + py * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}

/** 공을 자기 골 쪽으로 당길 때의 하한 (공격 방향 기준): 공 구역 시작, 뚫린 수비 라인보다 앞 */
function ballFloor(step) {
  let f = ZONES[Math.min(5, step + 2) - 1].from;
  for (let li = 0; li < step; li++) f = Math.max(f, SHAPE.def[POS_BY_LINE[li]][step]);
  return f + 0.5;
}

/* ------------------------------------------------------------------ */
/* 승부차기                                                              */
/* ------------------------------------------------------------------ */

function isPenaltyView(v) {
  if (v.phase === "penalties") return true;
  return !!(v.finished && v.stage === "penalties" && v.penalties);
}

function penaltyLayout(v, teams, geo, lastBeat) {
  const pen = v.penalties && typeof v.penalties === "object" ? v.penalties : {};
  const lastPen = lastBeat && lastBeat.type === "penalty" ? lastBeat : null;
  const finished = !!v.finished;

  // 차는 팀: 엔진 penalties.kickerSide → 종료 후면 마지막 킥 → view.zone(5 = home 키커, 1 = away 키커) → 다음 차례(turn)
  let kickSide;
  const vz = validZone(v.zone);
  if (pen.kickerSide === "home" || pen.kickerSide === "away") kickSide = pen.kickerSide;
  else if (finished && lastPen && (lastPen.side === "home" || lastPen.side === "away")) kickSide = lastPen.side;
  else if (vz === 5 || vz === 1) kickSide = vz === 5 ? "home" : "away";
  else kickSide = pen.turn === "away" ? "away" : "home";
  const gkSide = otherSide(kickSide);
  const zone = kickSide === "home" ? 5 : 1;
  const toY = (fy) => (kickSide === "home" ? fy : 100 - fy);

  const K = teams[kickSide];
  const G = teams[gkSide];
  const kicker = pickKicker(pen, K, kickSide, finished ? lastPen : null);
  const gk =
    findEntry(G, pen.keeperId) ||
    G.byPos.GK[0] ||
    (lastPen && lastPen.side === kickSide ? findEntry(G, lastPen.defenderId) : null) ||
    G.list[0] ||
    null;

  const pos = new Map();
  const placed = [];
  const put = (e, x, y) => {
    pos.set(e, { x, y, role: e === kicker ? "carrier" : e === gk ? "defender" : "support" });
    placed.push({ x, y });
  };
  if (gk) put(gk, 50, toY(PENALTY.goal));
  if (kicker) put(kicker, clampX(50 - (geo.minD + 1)), toY(PENALTY.spot - PENALTY.kickerBack));
  const rest = [...teams.home.list, ...teams.away.list].filter((e) => e !== kicker && e !== gk);
  const n = rest.length;
  const tOf = (i) => (n > 1 ? -1 + (2 * i) / (n - 1) : 0);
  // 박스 밖 반원: 가운데가 골에서 가장 멀고(arcBase − half) 양 끝이 골 쪽(arcBase + half).
  // 좁고 높은 필드(토큰이 상대적으로 큼)에서 반원에 자리가 모자라면 같은 띠(arcBase ± half) 안 두 줄 지그재그.
  const arcFy = (i) => PENALTY.arcBase - PENALTY.arcHalf + 2 * PENALTY.arcHalf * tOf(i) * tOf(i);
  const zigFy = (i) => (i % 2 === 0 ? PENALTY.arcBase + PENALTY.arcHalf : PENALTY.arcBase - PENALTY.arcHalf);
  const tryRow = (fyOf) => {
    const tmp = placed.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      const y = toY(fyOf(i));
      const x = findFreeX(50 + PENALTY.arcSpan * tOf(i), y, rest[i].side, tmp, geo);
      if (x === null) return null;
      out.push({ x, y });
      tmp.push({ x, y });
    }
    return out;
  };
  const spots = tryRow(arcFy) || tryRow(zigFy)
    || rest.map((e, i) => ({ x: clampX(50 + PENALTY.arcSpan * tOf(i)), y: toY(zigFy(i)) })); // 최후: 겹침 허용
  rest.forEach((e, i) => put(e, spots[i].x, spots[i].y));

  const tokens = buildTokens(teams, pos);
  const remainingText =
    v.remaining && typeof v.remaining.text === "string" ? v.remaining.text : "남은 수비: GK";

  let banner;
  const score = Number.isFinite(pen.home) && Number.isFinite(pen.away) ? ` (${pen.home}:${pen.away})` : "";
  if (finished) {
    banner = `경기 종료 — 승부차기${score}`;
  } else {
    const kName = kicker ? kicker.name : "키커";
    const gName = gk ? gk.name : "GK";
    banner = `${pen.suddenDeath ? "서든데스" : "승부차기"} — ${kickSide === "home" ? "" : "상대 "}${kName} vs ${gName}${score}`;
  }

  return {
    mode: "penalties",
    ball: { x: 50, y: toY(PENALTY.spot) },
    tokens,
    zone,
    highlight: highlightFor(kickSide, zone, finished),
    track: { side: kickSide, step: 3, dir: kickSide === "home" ? "up" : "down" },
    remainingText,
    banner,
    attackingSide: kickSide,
    attackStep: 3,
    carrierId: kicker ? kicker.id : null,
    defenderId: gk ? gk.id : null,
    receiverId: null,
    receiverIds: [],
    nextBall: null,
    goal: { x: 50, y: kickSide === "home" ? 100 : 0 },
  };
}

/**
 * 키커: view.penalties.kickerId (엔진 v0.2 — 다음 키커, 종료 후엔 마지막 키커) / nextKickerId → (종료 후) 마지막 킥 이벤트 →
 * view.penalties.order[side] → 근사: FW·MF·DF(slot 순) 다음 GK 순서에서 taken 번째
 * (엔진 순서는 슛 스탯 내림차순이라 kickerId 없는 view 만으로는 정확히 알 수 없다).
 */
function pickKicker(pen, K, side, lastPen) {
  for (const id of [pen.kickerId, pen.nextKickerId]) {
    const e = findEntry(K, id);
    if (e) return e;
  }
  if (lastPen && lastPen.side === side) {
    const e = findEntry(K, lastPen.playerId);
    if (e) return e;
  }
  const taken = Math.max(0, Math.floor(num(pen.taken && pen.taken[side], 0)));
  const order = pen.order && Array.isArray(pen.order[side]) ? pen.order[side] : null;
  if (order && order.length) {
    const e = findEntry(K, order[taken % order.length]);
    if (e) return e;
  }
  const list = [...K.byPos.FW, ...K.byPos.MF, ...K.byPos.DF, ...K.byPos.GK];
  return list.length ? list[taken % list.length] : null;
}

/* ------------------------------------------------------------------ */
/* 겹침 방지 (가로로만)                                                    */
/* ------------------------------------------------------------------ */

function placeAll(specs, toY, geo) {
  const prioOf = (s) => (s.prio ?? PRIO[s.role]);
  const sorted = specs.slice().sort(
    (a, b) => prioOf(a) - prioOf(b) || a.sideOrder - b.sideOrder || a.e.index - b.e.index,
  );
  const pos = new Map();
  const placed = [];
  for (const s of sorted) {
    let y = toY(s.fy);
    let x;
    if (s.role === "carrier") {
      x = clampX(s.fx);
    } else {
      x = findFreeX(s.fx, y, s.e.side, placed, geo);
      // 가로에 자리가 없으면 규칙 방향(nudge: +1 = 공격 방향, −1 = 반대)으로만 세로를 조금 민다
      // → 뚫린 라인은 더 뒤로, 남은 수비는 자기 골 쪽으로: 공 앞/뒤 관계는 그대로
      for (let k = 1; x === null && k <= NUDGE.max; k++) {
        const fy = s.fy + (s.nudge || -1) * NUDGE.step * k;
        if (fy < 1 || fy > DEF_HARD_MAX) break;
        const x2 = findFreeX(s.fx, toY(fy), s.e.side, placed, geo);
        if (x2 !== null) {
          x = x2;
          y = toY(fy);
        }
      }
      if (x === null) x = clampX(s.fx); // 최후: 겹침 허용 (극단적인 aspect·tokenSize)
    }
    pos.set(s.e, { x, y, role: s.role });
    placed.push({ x, y });
  }
  return pos;
}

/**
 * 이미 놓인 토큰들과 겹치지 않는, want 에 가장 가까운 x (세로 y 는 고정). 그런 x 가 없으면 null.
 * 금지 구간은 열린 구간 (x_j − req, x_j + req) 이므로 가장 가까운 허용점은 want 자신, 구간 끝점, X_MIN/X_MAX 중 하나다.
 */
function findFreeX(want, y, side, placed, geo) {
  const target = clampX(want);
  const conf = [];
  for (const o of placed) {
    const dyW = (y - o.y) / geo.aspect;
    if (Math.abs(dyW) >= geo.minD - EPS) continue;
    conf.push({ x: o.x, req: Math.sqrt(geo.minD * geo.minD - dyW * dyW) });
  }
  const ok = (x) => conf.every((c) => Math.abs(x - c.x) >= c.req - EPS);
  if (ok(target)) return target;
  const cands = [X_MIN, X_MAX];
  for (const c of conf) cands.push(clampX(c.x - c.req), clampX(c.x + c.req));
  let best = null;
  for (const x of cands) {
    if (!ok(x)) continue;
    if (best === null || prefer(x, best, target, side)) best = x;
  }
  return best;
}

/** a 가 b 보다 나은가: want 에 가까운 쪽 → 필드 중앙에 가까운 쪽 → home 은 왼쪽, away 는 오른쪽 */
function prefer(a, b, want, side) {
  const da = Math.abs(a - want);
  const db = Math.abs(b - want);
  if (Math.abs(da - db) > EPS) return da < db;
  const ca = Math.abs(a - 50);
  const cb = Math.abs(b - 50);
  if (Math.abs(ca - cb) > EPS) return ca < cb;
  return side === "home" ? a < b : a > b;
}

/* ------------------------------------------------------------------ */
/* 표시 문구                                                              */
/* ------------------------------------------------------------------ */

function highlightFor(atk, zone, finished) {
  const h = !finished && HIGHLIGHTS[atk] ? HIGHLIGHTS[atk][zone] : null;
  return { zone, level: h ? h.level : null, label: h ? h.label : "" };
}

function remainingFromTeam(D, step) {
  const parts = [];
  for (const pos of POS_BY_LINE.slice(step)) {
    const n = D.byPos[pos].length;
    if (!n) continue;
    parts.push(pos === "GK" ? "GK" : `${pos} ${n}`);
  }
  return `남은 수비: ${parts.length ? parts.join(" + ") : "없음"}`;
}

/** 현재 상태의 상황 배너 한 줄 (언제 띄울지는 UI 가 정한다: 구역이 바뀌는 비트) */
function playBanner({ atk, step, zone, finished, lastBeat, prevBeat, remainingText, carrierName, defenderName, gkName }) {
  if (finished) return "경기 종료";
  if (!carrierName) return null;
  const home = atk === "home";
  const C = carrierName;
  const zoneName = (ZONES[zone - 1] || ZONES[2]).name;

  // GK 배급 직후 (2026-09-29, 마지막 비트 = 이 팀의 배급): 짧은 패스 → 빌드업, 롱패스 성공 → 중원
  if (lastBeat && lastBeat.side === atk && lastBeat.type === "distribution") {
    if (lastBeat.action === "long") return home ? `롱패스 성공! ${zoneName}에서 시작 — ${C}` : `⚠ 상대 롱패스 성공! ${zoneName}에서 시작 — ${C}`;
    return home ? `GK 짧은 패스 — ${withJosa(C, "이/가")} 빌드업 시작` : `상대 GK 짧은 패스 — ${withJosa(C, "이/가")} 빌드업 시작`;
  }
  // 포제션 시작 직후 (마지막 비트가 이 팀의 킥오프/역습)
  if (lastBeat && lastBeat.side === atk && (lastBeat.type === "counter" || lastBeat.type === "kickoff")) {
    if (lastBeat.type === "counter") {
      // 상대 GK 롱패스를 끊은 역습 (바로 앞 비트 = 롱패스 실패 turnover, distribution: true) = 세컨드볼
      if (prevBeat && prevBeat.type === "turnover" && prevBeat.distribution && prevBeat.side !== atk) {
        return home ? `세컨드볼! ${zoneName}에서 공격 — ${C}` : `⚠ 상대 세컨드볼! ${zoneName}에서 공격 — ${C}`;
      }
      return home ? `역습! ${zoneName}에서 시작 — ${C}` : `⚠ 상대 역습! ${zoneName}에서 시작 — ${C}`;
    }
    // 킥오프는 중원(센터서클)에서 시작 (GDD #55). 설정으로 빌드업(line 0)이면 예전 문구
    const where = step === 0 ? "빌드업 시작" : `${zoneName}에서 시작`;
    return home ? `킥오프 — ${withJosa(C, "이/가")} ${where}` : `상대 킥오프 — ${withJosa(C, "이/가")} ${where}`;
  }

  const vs = defenderName ? ` vs ${defenderName}` : "";
  const duel = defenderName ? `${withJosa(C, "이/가")} ${withJosa(defenderName, "과/와")} 대결` : `${C} 전진`;
  const oneOnOne = gkName ? `, ${withJosa(gkName, "과/와")} 1:1` : "";

  // ④ 박스 연결 직후 (마지막 비트 = 이 팀의 컷백·센터링 성공, 2026-09-29): 받은 선수(지금 carrier)의 원터치 슛 · 헤더 찬스
  if (step === 3 && lastBeat && lastBeat.type === "duel" && lastBeat.success && lastBeat.boxLink && lastBeat.side === atk) {
    const how = lastBeat.action === "cross" ? "센터링" : "컷백";
    const fin = lastBeat.action === "cross" ? "헤더" : "원터치 슛";
    return home ? `★ ${how}! ${C} ${fin} 찬스${oneOnOne}` : `⚠ 상대 ${how}! ${C} ${fin} 위기${oneOnOne}`;
  }
  if (home) {
    if (step === 0) return `우리 빌드업 — ${C}${vs}`;
    if (step === 1) return `중원 싸움 — ${duel}`;
    if (step === 2) return `중원 돌파 — ${remainingText}`;
    return `★ 슈팅 찬스 — ${withJosa(C, "이/가")} 상대 박스 진입${oneOnOne}`;
  }
  if (step === 0) return `상대 빌드업 — ${C}${vs}`;
  if (step === 1) return `상대 중원 진입 — ${duel}`;
  if (step === 2) return `⚠ 위험 지역 — ${withJosa(C, "이/가")} 우리 진영 진입`;
  return `⚠ 슈팅 위기 — ${withJosa(C, "이/가")} 우리 박스 진입${oneOnOne}`;
}

/* ------------------------------------------------------------------ */
/* view 정규화                                                            */
/* ------------------------------------------------------------------ */

function normTeam(v, side) {
  const raw = v.players && Array.isArray(v.players[side]) ? v.players[side] : [];
  const list = raw
    .filter((p) => p && p.id != null)
    .map((p, index) => ({
      p,
      side,
      index,
      id: String(p.id),
      name: String(p.name ?? ""),
      position: positionOf(p),
      slotNo: slotNumber(p.slot),
      laneX: 50,
    }));
  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  for (const e of list) byPos[e.position].push(e);
  for (const pos of POSITIONS) {
    const g = byPos[pos];
    g.sort((a, b) => a.slotNo - b.slotNo || a.index - b.index);
    const lanes = lanesFor(g.length);
    g.forEach((e, i) => { e.laneX = lanes[i]; });
  }
  return { side, list, byPos };
}

function buildTokens(teams, pos) {
  const out = [];
  for (const side of ["home", "away"]) {
    for (const e of teams[side].list) {
      const at = pos.get(e);
      if (!at) continue;
      const p = e.p;
      const max = positive(p.staminaMax, 100);
      out.push({
        side,
        id: e.id,
        name: e.name,
        slot: p.slot ?? null,
        position: e.position,
        x: at.x,
        y: at.y,
        role: at.role,
        staminaRatio: clamp(num(p.stamina, max) / max, 0, 1),
        portraitColor: p.portraitColor ?? null,
        isYouth: !!p.isYouth,
        trait: p.trait ?? null,
      });
    }
  }
  return out;
}

function findLastBeat(v) {
  if (v.lastBeat && typeof v.lastBeat === "object") return v.lastBeat;
  const evs = Array.isArray(v.recentEvents) ? v.recentEvents : [];
  for (let i = evs.length - 1; i >= 0; i--) {
    if (evs[i] && BEAT_TYPES.has(evs[i].type)) return evs[i];
  }
  return null;
}

/** 마지막 비트 바로 앞의 비트 (view.recentEvents 안에서, seq 로 찾는다). 없으면 null */
function findPrevBeat(v, lastBeat) {
  const evs = Array.isArray(v.recentEvents) ? v.recentEvents : [];
  if (!lastBeat) return null;
  let i = evs.findIndex((e) => e && (e === lastBeat || (lastBeat.seq != null && e.seq === lastBeat.seq)));
  if (i < 0) return null;
  for (i -= 1; i >= 0; i--) if (evs[i] && BEAT_TYPES.has(evs[i].type)) return evs[i];
  return null;
}

function attackDir(v, atk) {
  return v.attackDir === "up" || v.attackDir === "down" ? v.attackDir : atk === "home" ? "up" : "down";
}

function positionOf(p) {
  if (POSITIONS.includes(p.position)) return p.position;
  const m = /^(GK|DF|MF|FW)/.exec(String(p.slot || ""));
  return m ? m[1] : "MF";
}

function slotNumber(slot) {
  const m = /(\d+)\s*$/.exec(String(slot || ""));
  return m ? Number(m[1]) : 0;
}

function lanesFor(n) {
  if (LANES[n]) return LANES[n];
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => 12 + (76 * i) / (n - 1));
}

function findEntry(team, id) {
  if (id === undefined || id === null) return null;
  const s = String(id);
  return team.list.find((e) => e.id === s) || null;
}

function hasBatchim(word) {
  const s = String(word || "").trim();
  if (!s) return false;
  const ch = s[s.length - 1];
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (c >= 48 && c <= 57) return "013678".includes(ch); // 영·일·삼·육·칠·팔
  return false;
}

function validZone(z) {
  return Number.isInteger(z) && z >= 1 && z <= 5 ? z : null;
}

function otherSide(side) {
  return side === "home" ? "away" : "home";
}

function isSide(x) {
  return x === "home" || x === "away";
}

function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function positive(x, d) {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : d;
}

function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}

function clampInt(x, lo, hi) {
  return clamp(Math.round(num(x, lo)), lo, hi);
}

function clampX(x) {
  return clamp(x, X_MIN, X_MAX);
}
