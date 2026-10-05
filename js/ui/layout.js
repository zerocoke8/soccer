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
//  - 2026-10-06 배치 흔들림 (J1 — docs/SPRITE_25D_PLAN.md §11, 되돌릴 수 있음): opts.jitter 가 있을 때만 (경기 화면은 2.5D 모드 기본 켬,
//    ?jitter=0 끔 · ?jitter=1 평면에서도 켬 — store.isLayoutJitter). 위 규칙으로 놓은 뒤 선수마다 구역 안에서 조금 비낀다 (J2 부터 jitterSolve).
//    비낌은 해시 (경기 seed · 포제션 · 마지막 비트 seq · 공격 팀 · 선수 id) 에서만 — 난수 없음, 같은 비트 안에서는 늘 같은 자리.
//    비낌 계획 (받는 선수 후보 · 흔드는 차례) 은 opts.jitter.ref (미리보기를 고르기 전의 엔진 view) 의 모든 변형 후보로 — 자동/수동 · 스킬 토글에도 그대로.
//    opts.jitter 가 없으면 (테스트 · 평면 기본) 예전과 한 자리도 다르지 않다. 승부차기는 흔들지 않는다.
//  - 2026-10-06 배치 흔들림 2 (J2 — §11): 도착 자리 = 맡은 구역 띠 안 무작위 자리 (세로는 띠 어디든, 가로 ±10 — 같은 편 · 같은 구역은 좌우 순서 그대로).
//    그 비트에 화면이 그릴 수 있는 미리보기 변형 (스킬 · 필살기 토글 · 자동/수동) 의 규칙 자리를 한꺼번에 흔든다 (jitterSolve) —
//    토글로 규칙 자리가 바뀐 선수만 옮기고, 나머지는 어느 변형에서도 같은 자리.

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
/**
 * 배치 흔들림 (J1 → J2 — SPRITE_25D_PLAN §11, [구현 결정] 시작값 — 기획자가 여기 숫자만 고치면 된다). 단위 = 필드 % (x = 골과 나란한 쪽, y = 골 방향).
 * J2 (2026-10-06 기획자 설명): 공격이 성공 · 실패하고 다음 자리로 옮길 때 도착 자리를 고정 좌표 대신 맡은 구역 안 무작위 자리로.
 *  - ay: 세로 (골 방향) 최대 비낌 — Infinity = 자기 구역 띠 어디든. 구역 = 규칙 자리의 구역 (공격 방향 기준 — 경계 위면 공격 방향 쪽 구역).
 *  - edge: 구역 띠 = 구역 경계에서 이만큼 안쪽까지 (처음부터 경계에 더 가까이 선 선수는 그 자리보다 바깥으로 가지 않는다 — 구역이 바뀌지 않는다).
 *  - ax: 가로 최대 비낌 (±). 필드 가로 X_MIN ~ X_MAX 안.
 *  - gkAx · gkAy: GK 는 작게 (가로 · 세로 ±). 듀얼 둘 (공 가진 선수 + 듀얼 수비) 은 한 비낌을 함께 (둘 중 작은 범위 — 수비가 GK 면 GK 크기).
 *  - bias: 허용 구간 안 분포 = 균등 난수 bias 개의 평균 (1 = 균등, 2 = 가운데가 잦은 삼각 분포 — 끝에 몰리지 않는다).
 *  - keepY: 공 앞 · 뒤 (수비 팀 전원 · 받는 선수 후보 ↔ 공 가진 선수), 같은 편 · 같은 구역의 다른 라인 앞 · 뒤 (DF · MF · FW · GK 깊이 순서):
 *    같은 쪽 + 간격 ≥ min(처음 간격, keepY).
 *  - keepX: 좌우 (커버 ↔ 듀얼 수비, ④ 박스 연결 후보 ↔ 공 가진 선수, 같은 편 · 같은 구역 선수끼리 — 서로 가로지르지 않는다):
 *    같은 쪽 + 간격 ≥ min(처음 간격, keepX).
 *  - tries · shrink: 겹침 (minD) · 화살표 가림 때문에 첫 무작위 자리가 안 되면 다른 무작위 자리를 tries 개까지 (같은 해시 수열의 다음 값),
 *    그래도 안 되면 첫 자리를 shrink 배씩 규칙 자리 쪽으로 당기고, 마지막은 규칙 자리 (늘 된다).
 *  받는 선수 후보 (관계 · 화살표 · 흔드는 차례) = 그 비트의 모든 미리보기 변형 후보 합집합 — 자동/수동 · 스킬 · 필살기 토글로 바뀌지 않는다.
 */
export const JITTER = Object.freeze({
  ax: 10, ay: Infinity, gkAx: 3, gkAy: 1.5, edge: 1.5, bias: 2, keepY: 2, keepX: 1.5,
  tries: 6,
  shrink: Object.freeze([0.5, 0.25]),
});

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
 *   (스루 패스 같은 extraLine 은 수신 후보·도착 구역이, 필살 패스는 기본 받는 선수(합체기)가, 소매치기는 역습 구역이,
 *   라인 브레이커는 결과 문구 · 득점 기대만 바뀐다 — L54).
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
 * @param {{ aspect?: number, tokenSize?: number, jitter?: { seed?: string|number, ref?: object }|true|null }} [opts] aspect = 필드 폭/높이 (기본 0.8),
 *   tokenSize = 필드 폭 대비 토큰 지름 (기본 0.075).
 *   폭 = x 방향(골과 나란한 쪽) 픽셀, 높이 = y 방향(골↔골) 픽셀 — 가로 화면이면 폭 = 요소 높이, 높이 = 요소 폭 (§13.9)
 *   jitter (J1 · J2 — 배치 흔들림): 있으면 선수마다 맡은 구역 안 무작위 자리 (seed = 경기 seed, 비트마다 다른 자리 — jitterSolve). 없으면 예전 그대로.
 *   jitter.ref = resolvePreview 전의 엔진 view (같은 비트일 때만 쓴다, 없으면 view) — 그 비트의 미리보기 변형 전부를 여기서 만든다 (jitterOpt · previewViews)
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
  if (isPenaltyView(v)) return penaltyLayout(v, teams, geo, lastBeat); // 승부차기는 흔들지 않는다 (키커 · GK · 반원 모양 그대로)
  const jit = jitterOpt(o.jitter, v, lastBeat);
  const dist = distributionOf(v);
  return dist ? distributionLayout(v, teams, geo, lastBeat, dist, jit) : playLayout(v, teams, geo, lastBeat, jit);
}

/**
 * opts.jitter → 흔들림 설정 (없거나 false · null 이면 null = 흔들지 않음). 해시 열쇠 = 경기 seed · 포제션 · 마지막 비트 seq · 공격 팀 —
 * 한 비트 안의 모든 다시 그리기 (결정 토글 · 받는 선수 탭 · 스킬 토글 · 자동/수동 전환 · 화면 다시 열기 · 이어하기) 에서 같고 비트마다 바뀐다.
 * ref = 기준 view (opts.jitter.ref = resolvePreview 전의 엔진 view — 같은 비트일 때만: 포제션 · 공격 팀 · phase · seq 가 같을 때, 아니면 그리는 view).
 * 흔들림은 ref 의 미리보기 변형 전부 (previewViews) 를 한꺼번에 계산한다 — 화면이 그리는 변형 (자동 진행 중 후보 숨김 · 스킬 · 필살기 변형) 과 상관없이 같은 답.
 */
function jitterOpt(j, v, lastBeat) {
  if (!j) return null;
  const seed = typeof j === "object" && j.seed != null ? String(j.seed) : "";
  const seq = lastBeat && lastBeat.seq != null ? lastBeat.seq : -1;
  const ref = typeof j === "object" && j.ref && typeof j.ref === "object" ? j.ref : null;
  const sameBeat = ref && ref.possession === v.possession && ref.attackingSide === v.attackingSide && ref.phase === v.phase
    && (findLastBeat(ref)?.seq ?? -1) === seq;
  return {
    ...JITTER,
    key: `J1|${seed}|${v.possession ?? ""}|${seq}|${v.attackingSide ?? ""}`,
    ref: sameBeat ? ref : v,
  };
}

/**
 * 기준 view 로 화면이 이 비트에 그릴 수 있는 미리보기 변형 전부 (screens/match.js shownView = resolvePreview — 순서 고정):
 * 그대로 (결정 중 · 토글 없음) · 자동 진행 (deciding false — 확정할 수 없는 후보 숨김) · 스킬 · 필살기 변형 (receiverPreviewBySkill ·
 * receiversBySkill · outcomesBySkill 의 열쇠마다 — 필살기 토글도 그 skillId 열쇠, 스킬 + 필살기도 둘 중 하나의 열쇠). 받는 선수 탭은 view 를 바꾸지 않는다.
 */
function previewViews(ref) {
  const out = [ref, resolvePreview(ref, { deciding: false })];
  const keys = new Set();
  for (const m of [ref.receiverPreviewBySkill, ref.receiversBySkill, ref.outcomesBySkill]) {
    if (m && typeof m === "object") for (const k of Object.keys(m)) keys.add(k);
  }
  for (const k of keys) out.push(resolvePreview(ref, { skillId: k, deciding: true }));
  return out;
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

function playLayout(v, teams, geo, lastBeat, jit = null) {
  const R = playRule(v, teams, geo, lastBeat);
  const { fin, atk, step, toY, A, D, carrier, defender, receiver, landingOf, ballFy } = R;
  // J1 · J2 배치 흔들림: 듀얼 둘은 함께, 수비 팀 · 받는 선수는 공 앞 · 뒤 그대로, 커버는 듀얼 수비의 같은 옆, ④ 박스 후보는 공 가진 선수의 같은 옆,
  // 같은 편 · 같은 구역은 좌우 · 라인 앞뒤 순서 그대로. 공 · nextBall · 화살표는 아래에서 흔든 자리로 계산된다 (공 = 공 가진 선수).
  const pos = jit ? playJitter(R, v, geo, jit) : R.pos;

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

/**
 * 인플레이 규칙 자리 (흔들기 전): 역할 · 세로 SHAPE · 받는 선수 도착 구역 · 가로 겹침 방지 (placeAll) · ④ 박스 깊이 (boxDepths).
 * 흔들림 (playJitter) 이 같은 비트의 미리보기 변형마다 다시 부른다 — view 만의 함수 (난수 없음).
 */
function playRule(v, teams, geo, lastBeat) {
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
  return { fin, atk, def, step, toY, A, D, carrier, defender, receiver, landingOf, ballFy, specs, pos };
}

/**
 * J2 인플레이 흔들림 (§11): 그 비트에 화면이 그릴 수 있는 미리보기 변형 전부 (기준 view jit.ref 의 previewViews) 의 규칙 자리를 한꺼번에 흔든다.
 * 변형마다 규칙 자리가 다른 선수 (스루 패스 · 필살기로 도착 구역이 바뀐 받는 선수 후보, 그 후보에게 밀려 규칙 자리가 바뀐 선수) 는 자리마다 따로,
 * 나머지는 한 번만 흔든다 (jitterSolve) — 그래서 토글로 옮기는 것은 규칙 자리가 바뀐 선수뿐이고, 결과는 그 비트의 고정된 것 (규칙 자리들 · 열쇠) 만의 함수.
 * 비낌 계획: 받는 선수 후보 = 모든 변형 후보 합집합 (흔드는 차례 = placeAll 우선순위, 후보는 늘 receiver), 관계 (공 앞뒤 · 좌우), 화살표 = 공 가진 선수 → 후보 전원.
 * 그리는 view 의 규칙 자리가 어느 변형과도 다르면 (만든 view — 화면은 그러지 않는다) 그 view 를 변형으로 더해 푼다.
 */
function playJitter(R, v, geo, jit) {
  const keyOf = (e) => `${e.side}:${e.id}`;
  const ruleMap = (r) => new Map([...r.pos].map(([e, p]) => [keyOf(e), { x: p.x, y: p.y }]));
  const sig = (m) => JSON.stringify([...m.keys()].sort().map((k) => [k, m.get(k).x, m.get(k).y]));
  const players = (r) => [...r.pos.keys()].map(keyOf).sort().join("|");
  // 같은 비트의 변형만 (같은 공격 팀 · 단계 · 공 가진 선수 · 듀얼 수비 · 선수들 — 미리보기는 이것들을 바꾸지 않는다)
  const same = (r) => r.atk === R.atk && r.step === R.step && (r.carrier && r.carrier.id) === (R.carrier && R.carrier.id)
    && (r.defender && r.defender.id) === (R.defender && R.defender.id) && players(r) === players(R);
  // 변형의 규칙 자리 (같은 자리 모음은 하나로, 차례 = previewViews 차례). 끝난 경기는 미리보기가 없다 → 이 view 하나
  const rules = [];
  if (!R.fin) {
    for (const vv of previewViews(jit.ref)) {
      const r = vv === v ? R : playRule(vv, { home: normTeam(vv, "home"), away: normTeam(vv, "away") }, geo, findLastBeat(vv));
      if (same(r)) rules.push(r);
    }
  }
  const variants = [];
  const sigs = [];
  for (const r of rules) {
    const m = ruleMap(r);
    const s = sig(m);
    if (sigs.includes(s)) continue;
    sigs.push(s);
    variants.push(m);
  }
  // 그리는 view 가 어느 변형과도 다르면 (만든 view) 그 view 를 변형으로 더한다
  const shownSig = sig(ruleMap(R));
  if (!sigs.includes(shownSig)) {
    sigs.push(shownSig);
    variants.push(ruleMap(R));
  }
  // 받는 선수 후보 = 모든 변형 (+ 그리는 view) 의 후보 합집합 — 공 가진 선수 제외
  const recvIds = new Set();
  for (const r of [...rules, R]) for (const e of r.landingOf.keys()) recvIds.add(e.id);
  const planRecv = new Set(R.A.list.filter((e) => e !== R.carrier && recvIds.has(e.id)));
  const ck = R.carrier ? keyOf(R.carrier) : null;
  const dk = R.defender ? keyOf(R.defender) : null;
  const rel = [];
  if (ck) {
    for (const e of R.D.list) if (e !== R.defender) rel.push([keyOf(e), ck, "y"]);
    for (const e of planRecv) {
      rel.push([keyOf(e), ck, "y"]);
      if (R.step >= 3) rel.push([keyOf(e), ck, "x"]);
    }
  }
  if (dk) for (const s of R.specs) if (s.role === "cover") rel.push([keyOf(s.e), dk, "x"]);
  // 흔드는 차례 = placeAll 우선순위 (계획 역할 — 후보는 늘 receiver) → 편 → 선수 순서
  const prioOf = (s) => s.prio ?? PRIO[planRecv.has(s.e) ? "receiver" : s.role];
  const order = R.specs.slice().sort((a, b) => prioOf(a) - prioOf(b) || a.sideOrder - b.sideOrder || a.e.index - b.e.index).map((s) => keyOf(s.e));
  const out = jitterSolve(jit, geo, {
    variants,
    shown: sigs.indexOf(shownSig),
    info: new Map([...R.pos.keys()].map((e) => [keyOf(e), e])),
    toFy: R.toY,
    pair: [ck, dk].filter((k) => k != null),
    rel,
    order,
    recv: ck ? [...planRecv].map(keyOf) : [],
    carrier: ck,
  });
  return new Map([...R.pos].map(([e, p]) => {
    const q = out.get(keyOf(e));
    return [e, { x: q.x, y: q.y, role: p.role }];
  }));
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
function distributionLayout(v, teams, geo, lastBeat, dist, jit = null) {
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
  let pos = placeAll(specs, toY, geo);
  // J1 · J2 배치 흔들림: 배급 GK 는 자기 박스 안에서 조금 (GK 크기), 롱패스 받는 선수 + 경합 상대 MF 는 함께 (같은 레인 · 마주 봄 그대로),
  // 나머지는 맡은 구역 안 무작위 자리 (같은 편 · 같은 구역 순서 그대로). 역할 · 받는 선수 후보는 엔진 distribution (배급 선택지) 에서만 온다 —
  // 미리보기 변형이 자리를 바꾸지 않으므로 이 배치 하나를 placeAll 차례 그대로 흔든다
  if (jit) {
    const keyOf = (e) => `${e.side}:${e.id}`;
    const out = jitterSolve(jit, geo, {
      variants: [new Map([...pos].map(([e, p]) => [keyOf(e), { x: p.x, y: p.y }]))],
      shown: 0,
      info: new Map([...pos.keys()].map((e) => [keyOf(e), e])),
      toFy: toY,
      pair: contest && longE && longE !== carrier ? [keyOf(contest), keyOf(longE)] : [],
      rel: [],
      order: [...pos.keys()].map(keyOf),
      recv: carrier ? [...recv].map(keyOf) : [],
      carrier: carrier ? keyOf(carrier) : null,
    });
    pos = new Map([...pos].map(([e, p]) => {
      const q = out.get(keyOf(e));
      return [e, { x: q.x, y: q.y, role: p.role }];
    }));
  }
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
/* 배치 흔들림 (J1 · J2 — SPRITE_25D_PLAN §11, 2026-10-06, 되돌릴 수 있음)     */
/* ------------------------------------------------------------------ */

/**
 * 규칙 자리를 맡은 구역 안 무작위 자리로 흔든다 (J2). 난수 없음 — 선수마다 hash(J.key | side:id) 수열 (듀얼 둘은 hash(J.key | pair:…) 하나).
 * P.variants = 그 비트에 화면이 그릴 수 있는 변형들의 규칙 자리 (Map key → {x, y}), P.shown = 지금 그리는 변형 → 그 변형의 Map key → {x, y}.
 *  단위 = (선수, 규칙 자리): 변형마다 규칙 자리가 같은 선수는 단위 하나 → 어느 변형을 그려도 같은 자리. 변형마다 자리가 다른 선수 (토글로 도착 구역이
 *  바뀐 받는 선수 후보) 는 자리마다 단위 하나 — 그 자리로 돌아오면 같은 답. 겹침 · 관계 · 화살표는 한 변형에 함께 나오는 단위끼리만 본다.
 *  ① P.pair (듀얼 둘 · 배급 경합 둘) 먼저 — 한 비낌을 함께 (범위 = 둘의 범위 교집합, 다른 선수가 규칙 자리여도 관계가 지켜지게 자른다).
 *  ② 나머지는 P.order 차례 (placeAll 우선순위 — 그 비트 안에서 고정), 한 선수의 단위들은 변형 차례로.
 *     범위 = 맡은 구역 띠 (규칙 자리의 구역 — 공격 방향 기준, 경계에서 edge 안쪽, 세로 ±ay) × 가로 ±ax ∩ X_MIN ~ X_MAX (GK 는 gkAx · gkAy) ∩ 관계
 *     (상대가 이미 흔들렸으면 흔든 자리, 아니면 규칙 자리와 같은 쪽 · 간격 ≥ min(처음 간격, keep)). 범위는 늘 0 (규칙 자리) 을 품는다.
 *     관계 = P.rel (공 앞뒤 · 커버 · 박스 후보) + 같은 편 · 같은 구역 선수끼리 (가로 순서 — 서로 가로지르지 않는다, 다른 라인이면 앞뒤 순서도).
 *  ③ 자리 = 범위 안 해시 무작위 (균등 J.bias 개의 평균). 겹침 (이미 흔든 선수 · 아직 안 흔든 선수의 규칙 자리와 거리 ≥ min(minD, 처음 거리)) 이나
 *     화살표 가림 (공 가진 선수 → 후보 전원, 변형마다 — 흔들기 전에 가리지 않던 선수가 새로 가림) 에 걸리면 다음 무작위 자리 (J.tries 개),
 *     그래도 안 되면 첫 자리를 J.shrink 배로, 마지막은 규칙 자리 — 늘 된다 (먼저 흔든 선수가 이 선수의 규칙 자리를 피했고, 관계 · 화살표도 그렇게 골랐다).
 *     그래서 흔들기 전보다 가까워지는 두 선수 (minD 아래로) · 새로 가린 화살표 · 뒤바뀐 앞뒤 · 좌우가 없다.
 * 결과는 P (그 비트의 규칙 자리들 · 계획) 와 J.key 만의 함수 — 어느 변형을 그리는지 (P.shown) 는 답을 고르기만 한다.
 * @param {{ variants: Array<Map<string,{x:number,y:number}>>, shown: number, info: Map<string,{side:string,position:string}>,
 *   toFy: (y:number)=>number, pair: string[], rel: Array<[string, string, "x"|"y"]>, order: string[], recv: string[], carrier: string|null }} P
 */
function jitterSolve(J, geo, P) {
  // 단위 (선수, 규칙 자리) · 변형마다 key → 단위
  const units = [];
  const byKey = new Map();
  const unitOf = P.variants.map((m, vi) => {
    const out = new Map();
    for (const [k, p] of m) {
      let list = byKey.get(k);
      if (!list) byKey.set(k, (list = []));
      let u = list.find((w) => w.x === p.x && w.y === p.y);
      if (!u) {
        const e = P.info.get(k) || {};
        u = { k, x: p.x, y: p.y, side: e.side, position: e.position, vs: new Set(), nb: [], gap: new Map(), rel: [] };
        list.push(u);
        units.push(u);
      }
      u.vs.add(vi);
      out.set(k, u);
    }
    return out;
  });
  const co = (a, b) => a.k !== b.k && [...a.vs].some((vi) => b.vs.has(vi));
  // 맡은 구역 띠: 공격 방향 fy 의 구역 (경계 위면 공격 방향 쪽 — home · away 가 같다. toFy 는 제 역함수) → 기본 범위 (규칙 자리 0 을 품는다)
  for (const u of units) {
    const z = ZONES[zoneAtY(P.toFy(u.y)) - 1];
    const a = P.toFy(z.from + J.edge);
    const b = P.toFy(z.to - J.edge);
    const gk = u.position === "GK";
    const ax = gk ? J.gkAx : J.ax;
    const ay = gk ? J.gkAy : J.ay;
    u.zone = z.id;
    u.base = {
      xLo: Math.max(-ax, Math.min(u.x, X_MIN) - u.x), xHi: Math.min(ax, Math.max(u.x, X_MAX) - u.x),
      yLo: Math.max(-ay, Math.min(a, b, u.y) - u.y), yHi: Math.min(ay, Math.max(a, b, u.y) - u.y),
    };
  }
  // 이웃 (한 변형에 함께 나오는 다른 선수의 단위) · 겹침 간격 · 관계 (처음과 같은 쪽 s · 간격 ≥ g)
  const keep = { x: J.keepX, y: J.keepY };
  const relAxes = new Map(); // "a|b" → Set(axis)
  for (const [a, b, axis] of P.rel) {
    for (const kk of [`${a}|${b}`, `${b}|${a}`]) {
      if (!relAxes.has(kk)) relAxes.set(kk, new Set());
      relAxes.get(kk).add(axis);
    }
  }
  for (const u of units) {
    for (const w of units) {
      if (!co(u, w)) continue;
      u.nb.push(w);
      u.gap.set(w, Math.min(geo.minD, tokenDistance(u, w, geo.aspect)) - EPS);
      const axes = new Set(relAxes.get(`${u.k}|${w.k}`) || []);
      // 같은 편 · 같은 구역: 좌우 순서 그대로 (서로 가로지르지 않는다), 다른 라인 (DF · MF · FW · GK) 이면 앞뒤 순서도
      if (u.side === w.side && u.zone === w.zone) {
        axes.add("x");
        if (u.position !== w.position) axes.add("y");
      }
      for (const axis of axes) {
        const d0 = w[axis] - u[axis];
        if (Math.abs(d0) > EPS) u.rel.push({ w, axis, s: Math.sign(d0), g: Math.min(Math.abs(d0), keep[axis]) });
      }
    }
  }
  // 화살표: 변형마다 공 가진 선수 → 후보 전원. base = 흔들기 전 (그 변형의 규칙 자리) 에 가리던 선수 — boxDepths 와 같은 판정
  const clear = geo.minD * BOX_LANE.clear;
  const arrows = [];
  if (P.carrier != null) {
    unitOf.forEach((m, vi) => {
      const c = m.get(P.carrier);
      if (!c) return;
      const present = [...m.values()];
      for (const rk of P.recv) {
        const r = m.get(rk);
        if (!r || r === c) continue;
        const base = new Set(present.filter((w) => w !== c && w !== r && segDist(w, c, r, geo.aspect) < clear).map((w) => w.k));
        arrows.push({ vi, c, r, base, present });
      }
    });
  }

  const cur = new Map(units.map((u) => [u, { x: u.x, y: u.y }])); // 흔든 자리 (아직이면 규칙 자리)
  // 범위 = 기본 범위 ∩ 관계 (상대의 지금 자리 기준 — skip = 함께 움직이는 선수는 빼고)
  const range = (u, skip) => {
    const rg = { ...u.base };
    for (const r of u.rel) {
      if (skip && skip.has(r.w.k)) continue;
      const lim = cur.get(r.w)[r.axis] - u[r.axis]; // 이 비낌이면 상대와 같은 줄
      if (r.s > 0) {
        const H = r.axis === "x" ? "xHi" : "yHi";
        rg[H] = Math.min(rg[H], lim - r.g);
      } else {
        const L = r.axis === "x" ? "xLo" : "yLo";
        rg[L] = Math.max(rg[L], lim + r.g);
      }
    }
    return rg;
  };
  // 움직이는 단위들 M ([단위, 자리]) 이 겹침 · 화살표를 지키는가 (나머지는 지금 자리)
  const ok = (M) => {
    const mv = new Map(M);
    const at = (w) => mv.get(w) || cur.get(w);
    for (const [u, p] of M) {
      for (const w of u.nb) {
        if (mv.has(w)) continue; // 함께 움직이는 둘 — 간격 그대로
        if (tokenDistance(p, cur.get(w), geo.aspect) < u.gap.get(w)) return false;
      }
    }
    for (const a of arrows) {
      const ends = mv.has(a.c) || mv.has(a.r);
      const check = ends ? a.present : M.map(([u]) => u).filter((u) => u.vs.has(a.vi));
      if (!check.length) continue;
      const C = at(a.c);
      const R = at(a.r);
      for (const w of check) {
        if (w === a.c || w === a.r || a.base.has(w.k)) continue;
        if (segDist(at(w), C, R, geo.aspect) < clear) return false;
      }
    }
    return true;
  };
  // 비낌은 0.1 단위 (화면 data-x · data-y 가 소수 1자리 — 규칙 자리가 0.1 단위면 흔든 자리도 그대로 적힌다), 범위 안으로 자른다
  const snap = (d, lo, hi) => {
    if (!(lo <= hi)) return 0;
    let q = Math.round(d * 10) / 10;
    if (q > hi + EPS) q = Math.floor(hi * 10 + EPS) / 10;
    if (q < lo - EPS) q = Math.ceil(lo * 10 - EPS) / 10;
    return q >= lo - EPS && q <= hi + EPS ? q : 0;
  };
  // 무작위 자리 후보: 해시 수열 → 범위 안 (균등 bias 개 평균) J.tries 개 → 첫 자리 × J.shrink → 규칙 자리
  const bias = Math.max(1, Math.round(J.bias) || 1);
  const fracs = (tag) => {
    const r = hashStream(hash32(`${J.key}|${tag}`));
    const f = () => {
      let s = 0;
      for (let i = 0; i < bias; i++) s += r();
      return s / bias;
    };
    return Array.from({ length: Math.max(1, J.tries) }, () => ({ fx: f(), fy: f() }));
  };
  const cands = (fr, rg) => {
    const t = fr.map(({ fx, fy }) => ({ dx: rg.xLo + fx * (rg.xHi - rg.xLo), dy: rg.yLo + fy * (rg.yHi - rg.yLo) }));
    const all = [...t, ...(J.shrink || []).map((s) => ({ dx: t[0].dx * s, dy: t[0].dy * s })), { dx: 0, dy: 0 }];
    return all.map((d) => ({ dx: snap(d.dx, rg.xLo, rg.xHi), dy: snap(d.dy, rg.yLo, rg.yHi) }));
  };

  // ① 듀얼 둘: 한 비낌
  const pairSet = new Set(P.pair.filter((k) => byKey.has(k)));
  const pairUnits = units.filter((u) => pairSet.has(u.k));
  if (pairUnits.length) {
    const rg = { xLo: -Infinity, xHi: Infinity, yLo: -Infinity, yHi: Infinity };
    for (const u of pairUnits) {
      const r = range(u, pairSet);
      rg.xLo = Math.max(rg.xLo, r.xLo);
      rg.xHi = Math.min(rg.xHi, r.xHi);
      rg.yLo = Math.max(rg.yLo, r.yLo);
      rg.yHi = Math.min(rg.yHi, r.yHi);
    }
    for (const d of cands(fracs(`pair:${[...pairSet].join("+")}`), rg)) {
      const M = pairUnits.map((u) => [u, { x: u.x + d.dx, y: u.y + d.dy }]);
      if (!ok(M)) continue;
      for (const [u, p] of M) cur.set(u, p);
      break;
    }
  }
  // ② 나머지: 흔드는 차례 (빠진 선수는 뒤에 — 늘 전원)
  const order = P.order.filter((k) => byKey.has(k));
  for (const k of byKey.keys()) if (!order.includes(k)) order.push(k);
  for (const k of order) {
    if (pairSet.has(k)) continue;
    const fr = fracs(k);
    for (const u of byKey.get(k)) {
      for (const d of cands(fr, range(u))) {
        const p = { x: u.x + d.dx, y: u.y + d.dy };
        if (!ok([[u, p]])) continue;
        cur.set(u, p);
        break;
      }
    }
  }
  const out = new Map();
  for (const [k, u] of unitOf[P.shown] || unitOf[0]) out.set(k, cur.get(u));
  return out;
}

/** 문자열 → 32비트 정수 (FNV-1a + murmur3 마무리) — js/engine/zones.js hash32 와 같은 식 (사본: layout 은 엔진 없이 import 된다) */
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

/** 해시 씨앗 → [0, 1) 수열 (mulberry32 — zones.js 와 같은 식). 경기 rng 와 상관없다 */
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
