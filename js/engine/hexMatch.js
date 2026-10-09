/**
 * hexMatch.js — 육각 타일 오토배틀 경기 엔진 (HEX_AUTOBATTLE_PLAN §1 · §2 · §4.2 · §6.3, H0)
 *
 * API (예전 match.js 와 같은 이름 · 같은 뜻): createMatch, step, simulateAuto, isFinished, getResult
 *  (+ HEX_DEFAULTS, 시험용 setHexRollForTest · setHexDecisionForTest)
 * 불러오는 것: ./rng.js · ./hexGrid.js 만. match.js · ai.js 는 (직접이든 간접이든) 불러오지 않는다.
 *
 * 진행 규약:
 *  - createMatch 는 홈 킥오프를 준비한 상태 (turn 0) 를 돌려준다. step 한 번 = 한 턴 (승부차기 단계에서는 한 킥).
 *  - 한 턴 순서 (문서 §2.2): (1) 입력 (H3 필살기 자리 — 지금은 받기만 하고 무시) → (2) 공 가진 선수의 선택
 *    (슛 / 패스 / 크로스 / 드리블 / 지키기, 드리블 가려는 칸, 태클 정하기 — 모두 턴 시작 칸으로) → (3) 이동 (최대 1칸)
 *    → (4) 겨루기: 태클 → 슛 → 공 비행 (한 턴 3칸, 그 턴에 지난 칸 위 · 옆 수비의 가로채기, 도착 · 크로스 공중볼 · 헤더)
 *    → 흘러나온 공 줍기 (이동 중 먼저 들어간 선수) → (5) 이벤트. 그다음 turn++ 과 단계 확인.
 *  - 판 · 방향은 hexGrid.js: 홈 dir +1 (오른쪽 골 공격), 원정 dir −1. 판은 짝수 행 15칸 · 홀수 행 14칸 (189칸) 으로 정확히 좌우 대칭.
 *    자기 진영 열 oc = 홈 c · 원정 거울 열 (mirrorCR — 짝수 행 14 − c · 홀수 행 13 − c). GK 구역 = 자기 골의 박스 (inBox(칸, −dir), 양쪽 12칸).
 *  - 좌우 대칭: 방향이 걸린 결정적 동률 깨기 (이웃 고르기 · 빗나간 패스 칸 · 튀는 칸 · 가까운 빈 칸 찾기 · GK 자리 · 직선 칸) 는 모두
 *    그 팀의 공격 방향 기준 순서 (hexGrid relDirs · neighborsRel · line(…, dir) · 자기 진영 훑기 순서) 를 쓴다.
 *    → 한 장면과 그 거울 장면 (두 팀 자리 · 공 · 먼저 움직이는 팀을 맞바꾼 것) 은 같은 주사위로 정확히 거울상으로 흘러간다 (시험으로 확인).
 *    남은 정해진 홈 몫: 경기 시작 킥오프 · 홀수 턴 홈 먼저 이동 · 승부차기 홈 선축 (아래 · 예전 규칙).
 *  - 시계: 정규 300턴. 300턴이 끝날 때 정확히 lastAttackDeficit(1)골 뒤진 팀이 공을 갖고 있으면 (가진 선수 · 그 팀 패스 비행 중)
 *    추가시간 (결정 20, 최대 25턴, 한 번만) — 그 팀이 공을 잃거나 슛이 끝나면 정규로 돌아가 다시 판정.
 *    동점이고 goal / arena 면 골든골 75턴 (킥오프 없이 그대로 이어서, 첫 골로 끝) → 그래도 같으면 승부차기 (예전 규칙 그대로).
 *    친선은 무승부로 끝날 수 있다.
 *  - 확률 식은 예전 그대로 p = clamp(공격값 / (공격값 + 수비값), minP, maxP), 겨루기마다 한 번 굴림.
 *    상성 (STYLE_BEATS) · team.conditionMult · 패스 팀워크 항 · bonusOf (공명 + 유물) 만 곱한다.
 *    짝 · 빗나감 (readBonus / missMult / holdVs*) 배수는 뺀다 (문서 §4 짝 · 빗나감). 패시브 · 액티브 · 특성 · 체력 · 텐션 · 빗장 = H4,
 *    필살기 · 게이지 · 컷인 = H3 (아래 `// H3` · `// H4` 자리).
 *  - 이동률 (문서 §2.3): rate = min(1, 0.7 + 0.3·s/1000 (+0.05 스피드)), 매 턴 moveAcc += rate, 1 이상이면 1칸 움직이고 1 을 뺀다.
 *    못 움직인 턴에는 1 에서 멈춘다. 태클 실패로 생기는 두 사람의 1칸은 moveAcc 와 상관없다.
 *  - 넘어짐: restUntil = 넘어진 턴 + 1. turn ≤ restUntil 이면 이동 · 태클 · 가로채기 · 공중볼 · +10% 돕기 어디에도 끼지 않고 칸만 차지한다.
 *  - 이벤트의 p 는 그 이벤트의 success 가 일어날 확률 (태클 = 태클 성공, 가로채기 = 가로채기 성공, 슛 = 골, 공중볼 = 공격 승).
 *
 * [구현 결정] (H0 — 문서에 옮겨 적는다):
 *  - 먼저 움직이는 팀: 홀수 턴 홈, 짝수 턴 원정. 팀 안에서는 턴 시작 때 공까지 거리 → 포메이션 칸 순서. 주사위 순서도 같다.
 *  - 포메이션 칸 순서 = GK, 그다음 DF → MF → FW, 같은 줄은 slot 숫자 → 배열 순서 (layout.js normTeam 과 같은 규칙).
 *  - 패스 정확도: 거리 ≤ 4 는 1, 그 뒤 칸마다 0.03·(1.6 − 패스/1000) 씩 깎임 (0.5 ~ 1). 빗나가면 노린 칸의 이웃 중 주사위로 한 칸.
 *  - 받는 선수는 노린 칸 (빗나가기 전) 으로 달린다. 양 팀에서 가까운 1명 (비행) · 2명 (흘러나온 공) 이 떨어질 칸으로 쫓아간다.
 *  - 슛한 선수는 그 턴에 움직이지 않는다 (공이 먼저 떠나는 패스는 패스한 선수가 바로 움직인다).
 *  - 크로스가 떨어질 칸에 같은 편이 없으면 땅볼 패스 도착과 같이 처리한다 (빈 칸 → 흘러나온 공, 상대 → 옆 빈 칸으로 튐).
 *  - 경기가 끝나도 state.stage 는 마지막으로 뛴 단계 ("regular" · "goldenGoal" · "penalties") 를 그대로 둔다 (예전 엔진처럼
 *    stage !== "regular" 로 연장 · 승부차기를 읽는 곳이 그대로 돈다). 추가시간이 끝나면 "regular" 로 돌아가고 기록은 state.addedTime.
 *  - stats 에 carrierTurns (공 가진 선수가 선택한 턴 수) 를 더 둔다 — 지키기 비율의 분모.
 *  - 킥오프 (경기 시작 · 골 뒤) 는 모두를 시작 칸으로 옮긴다 — 이 턴만 "한 턴 1칸" 검사에서 뺀다 (화면은 킥오프 연출로 잇는다).
 *  - 겨루기 계수: 태클 2.4 · GK 선방 2.8 (HEX_DEFAULTS.tackleCoef · saveCoef — config.match.actionCoef 의 0.6 · 1.0 대신).
 *    짝 배수를 빼고 겨루기가 경기당 수백 번이라 (문서 §2.2 · §4) 시뮬로 골 · 슛이 말이 되는 범위에 맞춘 값. 가로채기는 0.6 그대로.
 *  - 슛 사거리 = 2 + 슛/400 (문서 안 3 + 슛/250 은 15칸 판의 절반이라 줄였다). breakAll 의 박스 밖 슛 기준 = 골 기대 0.55.
 *  - 수비 자리: 공 → 자기 골 가운데 선 위에 줄을 세운다 (행 간격 0.6 배). DF 는 마크하지 않고 그 줄을 지키고 (zonalDF),
 *    MF · FW 가 마크 (태클 · 균형) · 패스길 (인터셉트) 을 맡는다. 수비 팀 목표 열은 자기 진영 9 까지만.
 *  - 공 가진 상대가 자기 골 앞 (자기 진영 열 < 3, GK 포함) 에서 빌드업하면 압박 · 마크하지 않는다 (pressLine · deepPressers).
 *  - 공격 팀: 상대 진영에서 바깥 MF 는 측면 (행 2 · 10), FW 는 박스 쪽으로 좁힌다. 측면 크로스 자리의 위협값은 최소 0.3.
 *  - 판: 짝수 행 15칸 · 홀수 행 14칸 (189칸, 정확히 좌우 대칭 — 양쪽 박스 12칸). 방향이 걸린 동률은 그 팀 공격 방향 기준
 *    (정면 → 앞 대각 위 · 아래 → 뒤 대각 위 · 아래 → 바로 뒤, 원정은 거울상) 으로 깬다. 패스 직선도 찬 팀 방향 기준 (line(…, dir)).
 *  - 시험용 이음매 setHexDecisionForTest (공 가진 선수의 선택만 덮어씀 — H3 필살기 "켠 행동을 그 턴에 고른다" 자리).
 *  - 압박 인원 (결정 19) 에는 이번 턴 태클하는 수비도 든다 (태클 턴이면 그만큼 덜 보낸다). 쉬는 선수는 압박 · 마크 · 쫓기에 들지 않고 제자리.
 *  - 헤더를 막는 수비는 크로스가 도착한 뒤 (이동 뒤) 칸으로 센다 — 헤더는 도착 순간 판정이고 바로 앞 공중볼도 이동 뒤 칸이라서
 *    (보통 슛만 턴 시작 칸 — 공이 이동 전에 떠난다).
 *  - 패스가 상대가 선 칸에 떨어졌는데 옆 빈 칸이 하나도 없으면 그 상대 (쉬는 선수여도) 가 공을 갖는다 — looseWon (기록도 +1).
 *  - 선수 id 는 문자열로 맞춘다 (숫자 id 도 받는다 — tactics.kickoffPlayerId 도 같이). 자리 · 기록 키가 문자열이라서.
 *
 * 순수 로직. 난수는 state.rngState 로만 (step 마다 createRngFromState → 사용 → getState 저장). 상태는 JSON 만 담는다.
 */

import { createRng, createRngFromState } from "./rng.js";
import * as G from "./hexGrid.js";

export const HEX_MATCH_VERSION = 1;
/** 정규 시간 턴 수 (2:00 = 300턴 × 0.4초, 결정 17) */
export const TURNS_REGULAR = 300;
/** 골든골 턴 수 (0:30, 결정 10) */
export const GOLDEN_TURNS = 75;
/** 추가시간 최대 턴 수 (결정 20) */
export const ADDED_MAX_TURNS = 25;

/**
 * 조정할 수 있는 숫자 전부 (data.config.hexMatch 가 있으면 그 위에 덮는다 — `--set hexMatch.x=…`).
 * 밸런스용이 아니라 경기 흐름 (골 · 슛 · 패스가 말이 되는 범위) 용. 객체 값은 한 단계 깊이까지 합친다.
 */
export const HEX_DEFAULTS = Object.freeze({
  turnsRegular: TURNS_REGULAR, // 정규 시간 턴 수
  goldenTurns: GOLDEN_TURNS, // 골든골 턴 수
  addedMaxTurns: ADDED_MAX_TURNS, // 추가시간 최대 턴 수
  autoCap: 5000, // simulateAuto 안전 상한 (step 수)
  moveBase: 0.7, // 이동률 기본값 (문서 §2.3)
  moveStatScale: 0.3, // 이동률에 더하는 능력치 몫 (× s/1000)
  speedStyleBonus: 0.05, // 스타일 "speed" 이동률 보너스
  passSpeed: 3, // 공이 한 턴에 나는 칸 수
  accFreeDist: 4, // 이 거리까지 패스 정확도 1
  accDropPerCell: 0.03, // 그 뒤 칸마다 깎이는 정확도 (× (accPassRef − 패스/1000))
  accPassRef: 1.6, // 정확도 깎임의 패스 능력치 기준
  accMin: 0.5, // 패스 정확도 하한
  shotRangeBase: 2, // 슛 사거리 = 이 값 + 슛/shotRangeDiv (반올림) — 문서 안 3 + 슛/250 은 15칸 판에서 너무 멀어 줄였다
  shotRangeDiv: 400, // 슛 사거리 능력치 나눗수
  breakAllBar: 0.55, // shootTiming "breakAll" 일 때 박스 밖 슛을 고르는 최소 골 기대
  midrangeBar: 0.2, // shootTiming "midrange" 일 때 박스 밖 슛 최소 골 기대
  shotBlockerEst: 0.92, // 슛 기대값에 막는 수비 1명당 곱 (판정 식과 별개 — AI 가 꺼리는 정도)
  crossHeaderEst: 0.9, // 크로스 기대값에서 받는 선수 헤더 골 확률에 곱하는 값 (막는 수비 · 빗나감 몫)
  tackleCoef: 2.4, // 육각 태클 계수 (null = config.match.actionCoef.tackle 0.6 — 덮어쓰기에서 null 도 그대로 받는다). 문서 §4 · §2.2: 짝 배수를 빼고 겨루기가 수백 번이라 시뮬로 다시 맞춤
  interceptCoef: null, // 가로채기 계수 (null = config.match.actionCoef.intercept). 위와 같은 이유
  saveCoef: 2.8, // 육각 GK 선방 계수 (null = config.match.actionCoef.save 1.0). 박스에 닿는 횟수가 많아 시뮬로 맞춤 (대칭 판 = 홈 공격 박스 10 → 12칸이라 2 → 2.8)
  tacticBonus: 1.15, // 공격 전술 (pass · dribble) 이 그 선택 값에 곱하는 값
  threatMax: 0.42, // 위협값 최대 (박스 안) — 골까지 거리로 줄어든다
  threatDecay: 3.2, // 위협값이 박스 밖에서 e 배 줄어드는 거리 (칸)
  threatSpacePenalty: 0.1, // 받는 칸 옆 상대 1명당 위협값 깎임
  wideThreat: 0.3, // 측면 크로스 자리 (자기 진영 열 ≥ 9, 행 0 ~ 2 · 10 ~ 12) 의 최소 위협값
  turnoverMult: 1.2, // 공을 잃었을 때 손해 = 상대 위협값 × 이 값
  laneReachWeight: 0.5, // 패스 추정: 길에서 2칸 떨어진 상대 (이동 한 번이면 굴림) 를 세는 비율
  passCost: 0.012, // 패스 한 번의 고정 비용 (같은 값이면 공을 갖고 있게)
  backPassPenalty: 0.03, // GK 백패스 추가 비용
  holdPenalty: 0.03, // 지키기 연속 턴마다 깎는 값 (정체 방지)
  shiftBallK: 0.5, // 대형 열 이동 = shiftBallK·(공 열 − 7) + shiftAttack | shiftDefend
  shiftAttack: 1, // 공격 팀 대형 앞당김
  shiftDefend: -2, // 수비 팀 대형 물러남
  defendSpread: 0.6, // 수비 팀 대형 행 간격 (시작 행 간격 대비 — 공 ↔ 골 선 둘레로 좁힘)
  baseCols: { DF: 3, MF: 6, FW: 9 }, // 경기 중 줄별 기본 열 (자기 진영)
  holdCols: { DF: 2, MF: 3, FW: 4 }, // 버티기 선호 (내려서기) 열
  startCols: { DF: 2, MF: 4, FW: 6 }, // 킥오프 시작 열
  attackColMax: 13, // 공격 팀 필드 선수 목표 열 상한 (자기 진영)
  wideFromOc: 8, // 공이 이 열 (자기 진영) 이상이면 공격 MF 바깥 선수는 측면, FW 는 박스 쪽
  wideRows: [2, 10], // 측면 MF 의 행 (위 · 아래)
  fwNarrow: 0.5, // 상대 진영에서 FW 행 간격 (시작 행 간격 대비)
  defendColMin: 1, // 수비 팀 목표 열 하한 (자기 진영, 0 = 골라인)
  defendColMax: 9, // 수비 팀 목표 열 상한 (자기 진영) — 상대 골 앞까지 올라가 기다리지 않는다
  markRadius: 4, // 마크할 공격수가 자기 기본 자리에서 이 거리 안일 때만 따라간다
  pressLine: 3, // 공격 팀 자기 진영 열 이 값 미만 (자기 골 앞) 의 공격수는 마크하지 않고, 공 가진 선수 압박도 deepPressers 명까지만
  deepPressers: 0, // 그 깊은 곳 압박 인원
  zonalDF: 1, // 1 = 수비 팀 DF 는 마크하지 않고 공 ↔ 골 선 위 자기 자리를 지킨다 (마크 · 패스길은 MF · FW)
  gkFarDist: 6, // 공이 자기 골에서 이 거리보다 멀면 GK 는 골라인 (oc 0) 에 선다
  gkDepthNear: 1.6, // 공이 가까울 때 GK 가 골 중심에서 공 쪽으로 나오는 거리 (칸)
  gkDepthFar: 1, // 공이 멀 때 GK 가 나오는 거리 (칸)
  chaseLoose: 2, // 흘러나온 공을 쫓는 한 팀 인원
  chaseFlight: 1, // 날아가는 공의 떨어질 칸을 쫓는 한 팀 인원 (받는 선수 빼고)
});

const SIDES = ["home", "away"];
const KINDS = ["goal", "friendly", "arena"];
const POSITIONS = ["GK", "DF", "MF", "FW"];
const STATS = ["shoot", "dribble", "pass", "defense", "physical"];
const STYLE_BEATS = { power: "technique", technique: "speed", speed: "power" };
const LINE_RANK = { DF: 0, MF: 1, FW: 2 };

/* ------------------------------------------------------------------ */
/* 판 미리 계산 (상수 — 상태가 아니다)                                       */
/* ------------------------------------------------------------------ */

/** 칸 id 색인 배열 길이 (홀수 행 c = 14 자리는 빈 칸 — 판 밖) */
const NC = G.ID_SPACE;
/** 칸 id → 값 배열 (판 밖 자리는 null) */
function byCell(fn) {
  const out = new Array(NC).fill(null);
  for (const id of G.ALL_CELLS) out[id] = fn(id);
  return out;
}
const CR = byCell((id) => G.cellCR(id));
/** 이웃 (고정 순서 — 세기 · 모으기처럼 순서가 상관없는 곳만) */
const NEI = byCell((id) => G.neighbors(id));
/** 이웃 (공격 방향 기준 순서 — 동률을 첫 칸이 이기는 곳은 반드시 이것: 홈 · 원정이 서로 거울상) */
const NEI_H = byCell((id) => G.neighborsRel(id, 1));
const NEI_A = byCell((id) => G.neighborsRel(id, -1));
const neiRel = (cell, dir) => (dir > 0 ? NEI_H[cell] : NEI_A[cell]);
/** 판 훑기 순서 (자기 진영 기준 행 → 열: 홈 = id 순서, 원정 = 그 거울) — 동률이면 먼저 나온 칸 */
const SCAN = { home: G.ALL_CELLS.slice(), away: G.ALL_CELLS.map((id) => G.mirrorId(id)) };
const XY = byCell((id) => G.centerXY(CR[id][0], CR[id][1]));
const DIST = new Int16Array(NC * NC);
for (const a of G.ALL_CELLS) for (const b of G.ALL_CELLS) DIST[a * NC + b] = G.distanceCR(CR[a][0], CR[a][1], CR[b][0], CR[b][1]);
const dist = (a, b) => DIST[a * NC + b];
const FRONT_H = byCell((id) => G.frontCells(id, 1));
const FRONT_A = byCell((id) => G.frontCells(id, -1));
const front = (cell, dir) => (dir > 0 ? FRONT_H[cell] : FRONT_A[cell]);
/** 정면 칸 (보드 밖이면 −1) */
const STRAIGHT_H = byCell((id) => straightOf(id, 1));
const STRAIGHT_A = byCell((id) => straightOf(id, -1));
const straight = (cell, dir) => (dir > 0 ? STRAIGHT_H[cell] : STRAIGHT_A[cell]);
function straightOf(id, dir) {
  const [c, r] = CR[id];
  const [nc, nr] = G.step(c, r, G.frontDirs(dir)[0]);
  return G.inBoard(nc, nr) ? G.cellId(nc, nr) : -1;
}
const DTG_H = byCell((id) => G.distToGoal(id, 1));
const DTG_A = byCell((id) => G.distToGoal(id, -1));
/** 칸에서 dir 쪽 골까지 거리 */
const dtg = (cell, dir) => (dir > 0 ? DTG_H[cell] : DTG_A[cell]);
/** GK 구역: 홈 GK = 왼쪽 골 박스, 원정 GK = 오른쪽 골 박스 */
const ZONE = {
  home: byCell((id) => G.inBox(id, -1)),
  away: byCell((id) => G.inBox(id, 1)),
};
const CENTER = G.cellId(7, 6);
const LINE_CACHE = new Map();
/** 두 칸 사이 직선 칸 id (시작 · 끝 포함, 보드 안) — dir = 동률 깨기 기준 공격 방향 (공을 찬 팀). 결정적 캐시 */
function lineIds(a, b, dir) {
  const key = (a * NC + b) * 2 + (dir > 0 ? 0 : 1);
  let v = LINE_CACHE.get(key);
  if (!v) {
    v = G.line(a, b, dir > 0 ? 1 : -1);
    LINE_CACHE.set(key, v);
  }
  return v;
}
function euclid(a, b) {
  const dx = XY[a].x - XY[b].x;
  const dy = XY[a].y - XY[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}

/* ------------------------------------------------------------------ */
/* 작은 도우미                                                             */
/* ------------------------------------------------------------------ */

function otherSide(side) {
  return side === "home" ? "away" : "home";
}
function dirOf(side) {
  return side === "home" ? 1 : -1;
}
/** 자기 진영 열 (0 = 자기 골 쪽). 원정은 거울 열 (짝수 행 14 − c · 홀수 행 13 − c) */
function ocOf(cell, side) {
  const [c, r] = CR[cell];
  return side === "home" ? c : G.mirrorCR(c, r)[0];
}
/** 자기 진영 (oc, r) → 칸 id (판 안으로 자른다 — 홀수 행은 0 ~ 13). 원정은 거울 칸 */
function ownCell(oc, r, side) {
  const rr = clamp(Math.round(r), 0, G.ROWS - 1);
  const o = clamp(Math.round(oc), 0, G.rowLen(rr) - 1);
  return side === "home" ? G.cellId(o, rr) : G.cellId(...G.mirrorCR(o, rr));
}
function matchCfg(data) {
  const m = data && data.config && data.config.match;
  if (!m) throw new Error("hexMatch: data.config.match 가 필요합니다");
  return m;
}
/** 덮어쓰기에서 null 을 "config.match.actionCoef 값을 쓴다" 로 그대로 받는 키 */
const NULL_MEANS_CONFIG = ["tackleCoef", "interceptCoef", "saveCoef"];
/** HEX_DEFAULTS + data.config.hexMatch (객체 값은 한 단계 합침) */
function hexCfg(data) {
  const over = data && data.config && data.config.hexMatch;
  if (!over || typeof over !== "object") return HEX_DEFAULTS;
  const out = {};
  for (const k of Object.keys(HEX_DEFAULTS)) {
    const d = HEX_DEFAULTS[k];
    const o = over[k];
    if (o === null && NULL_MEANS_CONFIG.includes(k)) out[k] = null;
    else if (o == null) out[k] = d;
    else if (d && typeof d === "object") out[k] = Object.assign({}, d, o);
    else out[k] = num(o, d);
  }
  return out;
}
function num(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}
function clamp(x, lo, hi) {
  return Math.min(hi, Math.max(lo, x));
}
function stat(player, key) {
  return num(player && player.stats && player.stats[key], 0);
}
/** 내 스타일이 상대 스타일에 유리하면 styleAdv, 불리하면 styleDis, 아니면 1 */
function styleMult(mine, theirs, m) {
  if (mine && theirs && STYLE_BEATS[mine] === theirs) return num(m.styleAdv, 1.25);
  if (mine && theirs && STYLE_BEATS[theirs] === mine) return num(m.styleDis, 0.8);
  return 1;
}
/** 공명 보너스 + 유물 modifiers 합 (가산치) */
function bonusOf(team, key) {
  const res = team.resonance && team.resonance.bonus ? num(team.resonance.bonus[key]) : 0;
  const mod = team.modifiers ? num(team.modifiers[key]) : 0;
  return res + mod;
}
function condOf(team) {
  return num(team.conditionMult, 1) || 1;
}
function coef(m, key, d) {
  return num(m.actionCoef && m.actionCoef[key], d);
}
/** 결정적 최대값: 동률이면 cands 순서의 첫 항목 */
function bestOf(cands, scoreFn) {
  if (!cands || !cands.length) return null;
  let best = null;
  let bs = -Infinity;
  for (const c of cands) {
    const s = scoreFn(c);
    if (s > bs) {
      bs = s;
      best = c;
    }
  }
  return best || cands[0];
}
function prob(m, att, def) {
  const raw = att + def > 0 ? att / (att + def) : 0.5;
  return clamp(Number.isFinite(raw) ? raw : 0.5, num(m.minP, 0.1), num(m.maxP, 0.9));
}
function findPlayer(team, id) {
  if (!team || !Array.isArray(team.players) || id == null) return null;
  return team.players.find((p) => p.id === id) || null;
}
function incr(obj, key) {
  obj[key] = (obj[key] || 0) + 1;
}

/** 시험용 주사위 덮어쓰기: fn(kind, p, ctx) → true | false | undefined (undefined = 원래 rng) */
let rollOverride = null;
/**
 * 테스트 전용: 판정 주사위를 덮어쓴다. kind ∈ tackle(공 지킴) · intercept(패스 살아남음) · accuracy(정확) · shot · header(골)
 * · aerial(공격 승) · penalty(골). null 이면 원래대로 (결정성 유지).
 * @param {((kind: string, p: number, ctx: object) => boolean|undefined)|null} fn
 */
export function setHexRollForTest(fn) {
  rollOverride = typeof fn === "function" ? fn : null;
}
/** 시험용 선택 덮어쓰기: fn({ state, side, id, cell, turn }) → { action, target?, receiverId? } | undefined */
let decisionOverride = null;
/**
 * 테스트 전용: 공 가진 선수의 선택 (shoot · pass · cross · dribble · hold) 을 덮어쓴다. 규칙 (태클 정하기 · 비행 · 판정) 은 그대로.
 * H3 필살기의 "켠 행동을 그 턴에 고른다" 자리와 같은 이음매. null 이면 원래대로.
 * @param {((view: object) => ({action: string, target?: number, receiverId?: string}|undefined))|null} fn
 */
export function setHexDecisionForTest(fn) {
  decisionOverride = typeof fn === "function" ? fn : null;
}
function roll(rng, kind, p, info) {
  if (rollOverride) {
    const r = rollOverride(kind, p, info || {});
    if (r === true || r === false) return r;
  }
  return rng.chance(p);
}

/* ------------------------------------------------------------------ */
/* 겨루기 값 (예전 computeOdds 에서 짝 · 패시브 · 필살기를 뺀 것)               */
/* ------------------------------------------------------------------ */

function bonusD(team) {
  return Math.max(0, 1 + bonusOf(team, "defense"));
}
function twTerm(team, m) {
  return 1 + num(m.teamworkPassBonusPer100, 0.1) * num(team.teamwork, 0) / 100;
}
function coverTerm(m, helpers) {
  return 1 + num(m.coverBonusPerExtraDefender, 0.1) * helpers;
}
/** 드리블 · 지키기 vs 태클: 공을 지킬 확률 */
function pKeep(K, atkTeam, carrier, defTeam, tackler, helpers) {
  const { m, cfg } = K;
  const att = stat(carrier, "dribble") * coef(m, "dribble", 2.2) * styleMult(carrier.style, tackler.style, m) * condOf(atkTeam);
  const def = ((stat(tackler, "defense") + stat(tackler, "physical")) / 2) * (cfg.tackleCoef ?? coef(m, "tackle", 0.6)) * coverTerm(m, helpers)
    * styleMult(tackler.style, carrier.style, m) * condOf(defTeam) * bonusD(defTeam);
  // H4: 패시브 · 액티브 (철의 태클 · 바위 방벽) · 특성 · 체력 배수
  return prob(m, att, def);
}
/** 패스 vs 가로채기: 패스가 살아남을 확률 */
function pPass(K, atkTeam, passer, defTeam, defender, helpers) {
  const { m, cfg } = K;
  const att = stat(passer, "pass") * coef(m, "pass", 2.2) * twTerm(atkTeam, m) * Math.max(0, 1 + bonusOf(atkTeam, "passAttack"))
    * styleMult(passer.style, defender.style, m) * condOf(atkTeam);
  const def = ((stat(defender, "defense") + stat(defender, "pass")) / 2) * (cfg.interceptCoef ?? coef(m, "intercept", 0.6)) * coverTerm(m, helpers)
    * styleMult(defender.style, passer.style, m) * condOf(defTeam) * bonusD(defTeam);
  return prob(m, att, def);
}
/** 크로스 공중볼: 공격이 이길 확률 */
function pAerial(K, atkTeam, crosser, defTeam, defender) {
  const { m } = K;
  const att = ((stat(crosser, "pass") + stat(crosser, "dribble")) / 2) * coef(m, "cross", coef(m, "pass", 2.2)) * twTerm(atkTeam, m)
    * Math.max(0, 1 + bonusOf(atkTeam, "passAttack")) * styleMult(crosser.style, defender.style, m) * condOf(atkTeam);
  return prob(m, att, aerialDef(K, defTeam, defender, crosser));
}
function aerialDef(K, defTeam, defender, crosser) {
  const { m } = K;
  // H4: 특성 철벽 holdMult
  return stat(defender, "defense") * num(m.holdMult, 0.6) * styleMult(defender.style, crosser.style, m) * condOf(defTeam) * bonusD(defTeam);
}
/** 슛 · 헤더 vs GK: 골 확률. blockers = 슛한 선수 앞쪽 3칸의 쉬지 않는 필드 수비 수 */
function pShot(K, atkTeam, shooter, defTeam, gk, box, header, blockers) {
  const { m, cfg } = K;
  const base = header ? (stat(shooter, "shoot") + stat(shooter, "physical")) / 2 : stat(shooter, "shoot");
  const c = header ? coef(m, "header", 1.5) : box ? coef(m, "shoot", 1.5) : coef(m, "midrangeShoot", 0.6);
  const att = base * c * Math.max(0, 1 + bonusOf(atkTeam, "shootPower")) * styleMult(shooter.style, gk.style, m) * condOf(atkTeam);
  const def = stat(gk, "defense") * (cfg.saveCoef ?? coef(m, "save", 1)) * coverTerm(m, blockers) * (header ? num(m.oneTouchGk, 0.85) : 1)
    * styleMult(gk.style, shooter.style, m) * condOf(defTeam) * bonusD(defTeam);
  // H3: 필살 슛 · 필살 세이브 배수
  return prob(m, att, def);
}
/** 패스 정확도 (결정 4: 거리 제한 없음, 멀수록 · 패스가 낮을수록 떨어진다) */
function passAccuracy(cfg, passer, d) {
  if (d <= cfg.accFreeDist) return 1;
  return clamp(1 - (d - cfg.accFreeDist) * cfg.accDropPerCell * (cfg.accPassRef - stat(passer, "pass") / 1000), cfg.accMin, 1);
}
function shotRange(cfg, p) {
  return Math.round(cfg.shotRangeBase + stat(p, "shoot") / cfg.shotRangeDiv);
}
function moveRate(cfg, p, hasBall) {
  const s = hasBall ? stat(p, "dribble") : (stat(p, "dribble") + stat(p, "physical")) / 2;
  return Math.min(1, cfg.moveBase + cfg.moveStatScale * s / 1000 + (p.style === "speed" ? cfg.speedStyleBonus : 0));
}

/* ------------------------------------------------------------------ */
/* 생성                                                                  */
/* ------------------------------------------------------------------ */

function emptyStats() {
  return {
    shots: 0, duelsWon: 0, goals: 0, mvpId: null, playerDuelWins: {}, playerGoals: {},
    skillsUsed: 0, ultimatesUsed: 0, combos: 0, gaanpaUsed: 0,
    // 육각 지표
    passes: 0, passesCompleted: 0, crosses: 0, interceptions: 0, tackles: 0, tacklesWon: 0,
    dribblesPast: 0, saves: 0, headers: 0, looseWon: 0, holdTurns: 0, carrierTurns: 0,
  };
}

function initTeam(snapshot, side) {
  if (!snapshot || !Array.isArray(snapshot.players) || snapshot.players.length === 0) {
    throw new Error(`hexMatch: ${side} 팀 스냅샷에 players 가 필요합니다`);
  }
  const team = JSON.parse(JSON.stringify(snapshot));
  team.side = side;
  team.name = team.name || (side === "home" ? "홈 팀" : "원정 팀");
  team.formation = team.formation || "2-2-2";
  team.tactics = team.tactics || {};
  if (team.tactics.defense === "readIntent") team.tactics.defense = "balanced";
  team.teamwork = num(team.teamwork, 0);
  team.conditionMult = num(team.conditionMult, 1) || 1;
  team.resonance = team.resonance || null;
  team.modifiers = Object.assign({ shootPower: 0, defense: 0, tensionGain: 0, staminaCost: 0, passAttack: 0 }, team.modifiers || {});
  if (team.partyPassives != null && !Array.isArray(team.partyPassives)) throw new Error(`hexMatch: ${side} 팀 partyPassives 는 배열이어야 합니다`); // H4
  if (team.tactics.kickoffPlayerId != null) team.tactics.kickoffPlayerId = String(team.tactics.kickoffPlayerId);
  const seen = new Set();
  for (const p of team.players) {
    if (!p || p.id == null || p.id === "") throw new Error(`hexMatch: ${side} 팀 선수에 id 가 없습니다`);
    p.id = String(p.id); // 자리 (state.pos) · 기록 키가 문자열이라 숫자 id 도 문자열로 맞춘다
    if (seen.has(p.id)) throw new Error(`hexMatch: ${side} 팀 선수 id 중복: ${p.id}`);
    seen.add(p.id);
    if (!POSITIONS.includes(p.position)) throw new Error(`hexMatch: ${side} 팀 선수 ${p.id} 의 position 이 잘못됨: ${p.position}`);
    p.name = p.name || p.id;
    p.stats = p.stats || {};
    for (const k of STATS) p.stats[k] = num(p.stats[k], 0);
    p.style = p.style || "power";
  }
  return team;
}

/** 역할 (GK 1명 — 없으면 수비 최고가 GK, GK 가 여럿이면 첫 GK 만 GK 이고 나머지는 DF 로 뛴다) */
function teamRoles(team) {
  const gk = team.players.find((p) => p.position === "GK") || bestOf(team.players, (p) => stat(p, "defense"));
  const roles = {};
  for (const p of team.players) roles[p.id] = p.id === gk.id ? "GK" : p.position === "GK" ? "DF" : p.position;
  return roles;
}

/** 포메이션 칸 순서: GK, 그다음 DF → MF → FW, 같은 줄은 slot 숫자 → 배열 순서 */
function slotOrder(team, roles) {
  const slotNum = (p) => {
    const mm = String(p.slot || "").match(/(\d+)/);
    return mm ? Number(mm[1]) : Infinity;
  };
  const gk = team.players.find((p) => roles[p.id] === "GK");
  const rest = team.players.map((p, i) => ({ p, i })).filter((x) => x.p !== gk);
  rest.sort((a, b) => LINE_RANK[roles[a.p.id]] - LINE_RANK[roles[b.p.id]] || slotNum(a.p) - slotNum(b.p) || a.i - b.i);
  return [gk.id, ...rest.map((x) => x.p.id)];
}

/**
 * @param {{ data: object, seed: string|number, home: object, away: object, possessions?: number,
 *           kind?: "goal"|"friendly"|"arena", humanSide?: "home"|"away" }} args  possessions 는 받기만 하고 무시 (결정 17)
 * @returns {object} 홈 킥오프가 준비된 경기 상태 (turn 0)
 */
export function createMatch({ data, seed, home, away, possessions, kind = "friendly", humanSide = "home" }) { // eslint-disable-line no-unused-vars
  matchCfg(data);
  const cfg = hexCfg(data);
  if (seed === undefined || seed === null) throw new Error("hexMatch: seed 가 필요합니다");
  if (!KINDS.includes(kind)) throw new Error(`hexMatch: kind 가 잘못됨: ${kind}`);
  if (humanSide !== "home" && humanSide !== "away") throw new Error(`hexMatch: humanSide 가 잘못됨: ${humanSide}`);
  const teams = { home: initTeam(home, "home"), away: initTeam(away, "away") };
  const roles = { home: teamRoles(teams.home), away: teamRoles(teams.away) };
  const state = {
    version: HEX_MATCH_VERSION,
    engine: "hex",
    seed,
    rngState: createRng(seed).getState(),
    kind,
    humanSide,
    turn: 0,
    stage: "regular",
    stageEndTurn: Math.max(1, Math.round(cfg.turnsRegular)),
    home: teams.home,
    away: teams.away,
    roles,
    order: { home: slotOrder(teams.home, roles.home), away: slotOrder(teams.away, roles.away) },
    pos: { home: {}, away: {} },
    live: { home: {}, away: {} },
    ball: { holder: null, cell: CENTER, flight: null, loose: false, holdStreak: 0 },
    possessionSide: null,
    possessions: 0,
    score: { home: 0, away: 0 },
    stats: { home: emptyStats(), away: emptyStats() },
    events: [],
    penalties: null,
    lastAttack: null,
    addedTime: null,
    finished: false,
    result: null,
  };
  kickoff(state, "home", 0, cfg);
  return state;
}

/** 줄 인원별 시작 행 (1 → [6], 2 → [4, 8], 3 → [3, 6, 9], 그 이상은 1 ~ 11 에 고르게) */
function rowsFor(n) {
  if (n === 1) return [6];
  if (n === 2) return [4, 8];
  if (n === 3) return [3, 6, 9];
  return Array.from({ length: n }, (_, i) => Math.round(1 + ((i + 0.5) * 10) / n));
}

/** 줄 안에서 몇 번째 · 몇 명 */
function lineSlots(state, side) {
  const roles = state.roles[side];
  const out = {};
  const count = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const id of state.order[side]) {
    const r = roles[id];
    out[id] = { role: r, idx: count[r]++ };
  }
  for (const id of state.order[side]) out[id].n = count[out[id].role];
  return out;
}

function pushEvent(state, turn, ev) {
  const e = Object.assign({ turn }, ev);
  state.events.push(e);
  return e;
}

function gainPossession(state, side) {
  if (state.possessionSide !== side) {
    state.possessionSide = side;
    state.possessions += 1;
  }
}

/** 킥오프: 전원 시작 칸, 킥오프 선수는 가운데 (7, 6) 에서 공을 갖는다 */
function kickoff(state, side, turn, cfg) {
  for (const s of SIDES) {
    const slots = lineSlots(state, s);
    state.pos[s] = {};
    state.live[s] = {};
    for (const id of state.order[s]) {
      const { role, idx, n } = slots[id];
      const cell = role === "GK" ? ownCell(0, 6, s) : ownCell(cfg.startCols[role], rowsFor(n)[idx], s);
      state.pos[s][id] = cell;
      state.live[s][id] = { moveAcc: 0, restUntil: -1 };
    }
  }
  const team = state[side];
  const roles = state.roles[side];
  const want = team.tactics && team.tactics.kickoffPlayerId;
  let kicker = want != null && roles[want] && roles[want] !== "GK" ? want : null;
  if (!kicker) kicker = state.order[side].find((id) => roles[id] === "FW") || state.order[side].find((id) => roles[id] === "MF") || state.order[side][1] || state.order[side][0];
  state.pos[side][kicker] = CENTER;
  state.ball = { holder: { side, id: kicker }, cell: CENTER, flight: null, loose: false, holdStreak: 0 };
  gainPossession(state, side);
  pushEvent(state, turn, { type: "kickoff", side, playerId: kicker });
}

/* ------------------------------------------------------------------ */
/* 한 턴                                                                 */
/* ------------------------------------------------------------------ */

/** 공이 있는 칸 (가진 선수 칸 · 비행 중 지금 칸 · 흘러나온 칸) */
function ballCell(state) {
  const b = state.ball;
  if (b.holder) return state.pos[b.holder.side][b.holder.id];
  return b.cell;
}

function isResting(state, side, id, T) {
  return state.live[side][id].restUntil >= T;
}

/** 칸 → {side, id} 점유 지도 (pos 기준) */
function occupancy(pos) {
  const occ = new Array(NC).fill(null);
  for (const s of SIDES) for (const id of Object.keys(pos[s])) occ[pos[s][id]] = { side: s, id };
  return occ;
}

/** 이동 순서: 홀수 턴 홈 먼저 · 짝수 턴 원정 먼저, 팀 안은 공까지 거리 → 포메이션 칸 순서 */
function movementOrder(state, T) {
  const first = T % 2 === 1 ? "home" : "away";
  const bc = ballCell(state);
  const out = [];
  for (const s of [first, otherSide(first)]) {
    const ids = state.order[s].map((id, i) => ({ id, i, d: dist(state.pos[s][id], bc) }));
    ids.sort((a, b) => a.d - b.d || a.i - b.i);
    for (const x of ids) out.push({ side: s, id: x.id });
  }
  return out;
}

/**
 * 한 턴 진행. input 은 H3 필살기 입력 자리 ({ ultimates: [...] }) — 지금은 받기만 하고 쓰지 않는다.
 * 승부차기 단계에서는 한 번에 한 킥.
 * @returns {object} state (제자리 변경)
 */
export function step(state, data, input = null) { // eslint-disable-line no-unused-vars
  if (!state || state.finished) return state;
  const m = matchCfg(data);
  const cfg = hexCfg(data);
  if (state.stage === "penalties") {
    penaltyKick(state, m);
    return state;
  }
  const T = state.turn + 1;
  const rng = createRngFromState(state.rngState);
  const ctx = {
    state, m, cfg, rng, T,
    start: { home: Object.assign({}, state.pos.home), away: Object.assign({}, state.pos.away) },
    order: movementOrder(state, T),
    goal: null,
    shotBy: null,
  };
  ctx.occStart = occupancy(ctx.start);
  ctx.orderIdx = {};
  ctx.order.forEach((o, i) => { ctx.orderIdx[o.side + ":" + o.id] = i; });
  // (1) 입력 — H3 필살기 (지금 쉬는 자리)
  // (2) 공 가진 선수의 선택
  const plan = decide(ctx);
  // (3) 이동
  moveAll(ctx, plan);
  // (4) 겨루기
  if (plan.tackle) resolveTackle(ctx, plan);
  else if (plan.action === "shoot") resolveShot(ctx, plan.side, plan.id, false);
  if (!ctx.goal && state.ball.flight) advanceFlight(ctx);
  state.rngState = rng.getState();
  state.turn = T;
  afterTurn(ctx);
  return state;
}

/* ------------------------------------------------------------------ */
/* (2) 공 가진 선수의 선택 (결정적 기대값 — 주사위 없음, 패스 정확도만 굴림)      */
/* ------------------------------------------------------------------ */

function threat(cfg, cell, dir) {
  const d = dtg(cell, dir);
  return d <= G.BOX_DIST ? cfg.threatMax : cfg.threatMax * Math.exp(-(d - G.BOX_DIST) / cfg.threatDecay);
}

/** 쉬지 않는 상대 수 (칸 옆 6칸, 턴 시작 칸) */
function adjOpp(ctx, cell, oppSide) {
  let n = 0;
  for (const nb of NEI[cell]) {
    const o = ctx.occStart[nb];
    if (o && o.side === oppSide && !isResting(ctx.state, o.side, o.id, ctx.T)) n++;
  }
  return n;
}

/** 드리블 가려는 칸 (문서 §2.2-2): 앞쪽 3칸 중 빈 칸 (골에 가까운 칸) → 쉬지 않는 상대가 선 칸 → 없음 */
function dribbleTarget(ctx, side, cell) {
  const dir = dirOf(side);
  const fr = front(cell, dir);
  let best = -1;
  for (const c of fr) {
    if (ctx.occStart[c]) continue;
    if (best < 0 || dtg(c, dir) < dtg(best, dir)) best = c;
  }
  if (best >= 0) return best;
  for (const c of fr) {
    const o = ctx.occStart[c];
    if (o && o.side !== side && !isResting(ctx.state, o.side, o.id, ctx.T)) return c;
  }
  return -1;
}

/**
 * 태클 정하기 (결정 12, 턴 시작 칸): 공 가진 선수 앞쪽 3칸의 쉬지 않는 상대 1명.
 * 순서: 가려는 칸의 수비 → 정면 칸 수비 → 이동 순서. GK 는 미끄러질 칸 (공 가진 선수 칸) 이 자기 구역일 때만 (지키기는 늘).
 * 돕는 수 = 공 가진 선수 이웃 6칸의 다른 쉬지 않는 상대.
 */
function tackleSetup(ctx, side, cell, action, target) {
  const st = ctx.state;
  const opp = otherSide(side);
  const dir = dirOf(side);
  const cands = [];
  for (const c of front(cell, dir)) {
    const o = ctx.occStart[c];
    if (!o || o.side !== opp || isResting(st, opp, o.id, ctx.T)) continue;
    if (st.roles[opp][o.id] === "GK" && action !== "hold" && !ZONE[opp][cell]) continue;
    cands.push({ id: o.id, cell: c });
  }
  if (!cands.length) return null;
  const sc = straight(cell, dir);
  const rank = (x) => (action === "dribble" && x.cell === target ? 0 : x.cell === sc ? 1 : 2);
  cands.sort((a, b) => rank(a) - rank(b) || ctx.orderIdx[opp + ":" + a.id] - ctx.orderIdx[opp + ":" + b.id]);
  const t = cands[0];
  let helpers = 0;
  for (const nb of NEI[cell]) {
    const o = ctx.occStart[nb];
    if (o && o.side === opp && o.id !== t.id && !isResting(st, opp, o.id, ctx.T)) helpers++;
  }
  // H4: 철의 태클 · 산맥 쐐기 — 패스 · 슛 턴에도 공이 떠나기 전에 태클 (여기서 action 을 보고 연다)
  return { side: opp, id: t.id, cell: t.cell, helpers };
}

/** 패스 성공 추정: 정확도 × Π(가로채기 굴림을 살아남을 확률) — 지금 칸 기준 */
function passEstimate(ctx, side, passer, cell, target) {
  const st = ctx.state;
  const opp = otherSide(side);
  const path = lineIds(cell, target, dirOf(side));
  // 상대마다 길까지 가장 가까운 거리: 1 이하 = 지금 굴릴 수 있음, 2 = 이동 한 번이면 닿음 (laneReachWeight 만큼 센다)
  const ints = [];
  for (const id of st.order[opp]) {
    if (isResting(st, opp, id, ctx.T)) continue;
    const oc = ctx.start[opp][id];
    let dmin = 99;
    for (let i = 1; i < path.length && dmin > 0; i++) dmin = Math.min(dmin, dist(oc, path[i]));
    if (dmin <= 2) ints.push({ id, w: dmin <= 1 ? 1 : ctx.cfg.laneReachWeight });
  }
  let P = passAccuracy(ctx.cfg, passer, dist(cell, target));
  const helpers = Math.max(0, Math.min(2, ints.length - 1)); // 돕는 수비 추정 (그 턴에 지난 칸만 세므로 2 까지만)
  for (const x of ints) P *= 1 - x.w * (1 - pPass(ctx, st[side], passer, st[opp], findPlayer(st[opp], x.id), helpers));
  return P;
}

function isWide(cell, side) {
  const r = CR[cell][1];
  return (r <= 2 || r >= 10) && ocOf(cell, side) >= 9;
}

function decide(ctx) {
  const st = ctx.state;
  const b = st.ball;
  if (!b.holder) return { action: null };
  const { m, cfg } = ctx;
  const side = b.holder.side;
  const id = b.holder.id;
  const opp = otherSide(side);
  const dir = dirOf(side);
  const team = st[side];
  const oppTeam = st[opp];
  const carrier = findPlayer(team, id);
  const cell = st.pos[side][id];
  const isGK = st.roles[side][id] === "GK";
  const tactics = team.tactics || {};
  const gkOpp = findPlayer(oppTeam, st.order[opp][0]);
  const cost = threat(cfg, cell, -dir) * cfg.turnoverMult;
  // 측면 크로스 자리 (isWide) 는 골에서 멀어도 wideThreat 만큼은 위협으로 본다 — 크로스가 나오게
  const threatAt = (c) => Math.max(threat(cfg, c, dir), isWide(c, side) ? cfg.wideThreat : 0) * Math.max(0, 1 - cfg.threatSpacePenalty * adjOpp(ctx, c, opp));
  const tmult = (v, on) => (on ? (v > 0 ? v * cfg.tacticBonus : v / cfg.tacticBonus) : v);
  st.stats[side].carrierTurns += 1;

  let best = null;
  const offer = (opt) => {
    if (!best || opt.value > best.value) best = opt;
  };

  // 슛
  const d = dtg(cell, dir);
  if (!isGK && d <= shotRange(cfg, carrier)) {
    const box = d <= G.BOX_DIST;
    const blockers = shotBlockers(ctx, side, cell, ctx.occStart);
    const p = pShot(ctx, team, carrier, oppTeam, gkOpp, box, false, blockers);
    const est = p * Math.pow(cfg.shotBlockerEst, blockers);
    const bar = box ? 0 : tactics.shootTiming === "midrange" ? cfg.midrangeBar : cfg.breakAllBar;
    if (est >= bar) offer({ action: "shoot", value: est });
  }

  // 패스 · 크로스
  const pressed = adjOpp(ctx, cell, opp) > 0;
  const wide = isWide(cell, side);
  for (const tid of st.order[side]) {
    if (tid === id) continue;
    const tRole = st.roles[side][tid];
    if (tRole === "GK" && (!pressed || isGK)) continue;
    if (isResting(st, side, tid, ctx.T)) continue;
    const tm = findPlayer(team, tid);
    const tc = st.pos[side][tid];
    const targets = [tc];
    const lead = straight(tc, dir);
    if (lead >= 0 && !ctx.occStart[lead] && tRole !== "GK") targets.push(lead);
    for (const tgt of targets) {
      const cross = wide && tRole !== "GK" && dtg(tgt, dir) <= G.BOX_DIST;
      let value;
      if (cross) {
        const acc = passAccuracy(cfg, carrier, dist(cell, tgt));
        const def = bestAerialDefender(ctx, tgt, opp, carrier, ctx.occStart);
        const pa = def ? pAerial(ctx, team, carrier, oppTeam, findPlayer(oppTeam, def)) : 1;
        const hp = dtg(tgt, dir) <= shotRange(cfg, tm) ? pShot(ctx, team, tm, oppTeam, gkOpp, true, true, 0) : 0;
        const P = acc * pa;
        value = P * Math.max(threatAt(tgt), hp * cfg.crossHeaderEst) - (1 - P) * cost - cfg.passCost;
      } else {
        const P = passEstimate(ctx, side, carrier, cell, tgt);
        value = P * threatAt(tgt) - (1 - P) * cost - cfg.passCost - (tRole === "GK" ? cfg.backPassPenalty : 0);
      }
      offer({ action: cross ? "cross" : "pass", value: tmult(value, tactics.attack === "pass"), receiverId: tid, target: tgt });
    }
  }

  if (!isGK) {
    // 드리블
    const dt = dribbleTarget(ctx, side, cell);
    if (dt >= 0) {
      const tk = tackleSetup(ctx, side, cell, "dribble", dt);
      const P = tk ? pKeep(ctx, team, carrier, oppTeam, findPlayer(oppTeam, tk.id), tk.helpers) : 1;
      const value = P * threatAt(dt) - (1 - P) * cost;
      offer({ action: "dribble", value: tmult(value, tactics.attack === "dribble"), target: dt, tackle: tk });
    }
    // 지키기
    const tk = tackleSetup(ctx, side, cell, "hold", -1);
    const P = tk ? pKeep(ctx, team, carrier, oppTeam, findPlayer(oppTeam, tk.id), tk.helpers) : 1;
    offer({ action: "hold", value: P * threatAt(cell) - (1 - P) * cost - cfg.holdPenalty * b.holdStreak, tackle: tk });
  }
  if (!best) best = { action: "hold", value: 0, tackle: null }; // GK 가 줄 곳이 없을 때 (모두 쉬는 중)
  if (decisionOverride) {
    const f = decisionOverride({ state: st, side, id, cell, turn: ctx.T });
    if (f && f.action) best = forcedOption(ctx, f, side, cell);
  }

  const plan = { side, id, action: best.action, target: best.target ?? -1, tackle: best.tackle || null, receiverId: best.receiverId };
  b.holdStreak = plan.action === "hold" ? b.holdStreak + 1 : 0;
  if (plan.action === "hold") st.stats[side].holdTurns += 1;
  if (plan.action === "pass" || plan.action === "cross") launchPass(ctx, side, id, best.receiverId, best.target, plan.action === "cross");
  return plan;
}

/** 시험용으로 정한 선택을 규칙대로 채운다 (가려는 칸 · 태클 정하기) */
function forcedOption(ctx, f, side, cell) {
  const st = ctx.state;
  if (f.action === "pass" || f.action === "cross") {
    const target = f.target ?? st.pos[side][f.receiverId];
    return { action: f.action, receiverId: f.receiverId, target };
  }
  if (f.action === "dribble") {
    const target = f.target ?? dribbleTarget(ctx, side, cell);
    if (target < 0) return { action: "hold", tackle: tackleSetup(ctx, side, cell, "hold", -1) };
    return { action: "dribble", target, tackle: tackleSetup(ctx, side, cell, "dribble", target) };
  }
  if (f.action === "hold") return { action: "hold", tackle: tackleSetup(ctx, side, cell, "hold", -1) };
  return { action: "shoot" };
}

/** 슛을 막는 수비 수: 슛한 선수 앞쪽 3칸의 쉬지 않는 필드 수비 (GK 빼고) */
function shotBlockers(ctx, side, cell, occ) {
  const opp = otherSide(side);
  let n = 0;
  for (const c of front(cell, dirOf(side))) {
    const o = occ[c];
    if (o && o.side === opp && ctx.state.roles[opp][o.id] !== "GK" && !isResting(ctx.state, opp, o.id, ctx.T)) n++;
  }
  return n;
}

/** 공중볼 수비: 떨어질 칸 위 · 옆의 쉬지 않는 상대 중 버티기 값 최고 (동률 = 이동 순서) */
function bestAerialDefender(ctx, cell, opp, crosser, occ) {
  const st = ctx.state;
  const cands = [];
  for (const c of [cell, ...NEI[cell]]) {
    const o = occ[c];
    if (o && o.side === opp && !isResting(st, opp, o.id, ctx.T)) cands.push(o.id);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => ctx.orderIdx[opp + ":" + a] - ctx.orderIdx[opp + ":" + b]);
  return bestOf(cands, (pid) => aerialDef(ctx, st[opp], findPlayer(st[opp], pid), crosser));
}

/** 패스 · 크로스 출발: 정확도 굴림 (거리 > accFreeDist 일 때만) → 빗나가면 노린 칸 이웃 중 하나 */
function launchPass(ctx, side, id, receiverId, intended, cross) {
  const st = ctx.state;
  const cell = st.pos[side][id];
  const passer = findPlayer(st[side], id);
  const d = dist(cell, intended);
  const acc = passAccuracy(ctx.cfg, passer, d);
  let accurate = true;
  if (acc < 1) accurate = roll(ctx.rng, "accuracy", acc, { side, passerId: id, receiverId, target: intended });
  let target = intended;
  if (!accurate) {
    const nb = neiRel(intended, dirOf(side)).filter((c) => c !== cell); // 공격 방향 기준 순서 (좌우 대칭)
    target = nb[ctx.rng.int(0, nb.length - 1)];
  }
  const path = lineIds(cell, target, dirOf(side)).slice(1);
  st.ball.holder = null;
  st.ball.loose = false;
  st.ball.cell = cell;
  st.ball.flight = { side, passerId: id, receiverId, cross, path, at: 0, target, intendedTarget: intended, rolled: [] };
  st.stats[side].passes += 1;
  if (cross) st.stats[side].crosses += 1;
  pushEvent(st, ctx.T, { type: "pass", side, from: id, to: receiverId, fromCell: cell, target, intended, cross, accurate });
}

/* ------------------------------------------------------------------ */
/* (3) 자리 잡기 · 이동                                                    */
/* ------------------------------------------------------------------ */

/** cell 에서 가까운 순 (BFS, 이웃 순서 = dir 팀의 공격 방향 기준) 으로 ok(c) 인 첫 칸 */
function nearestOk(cell, ok, dir) {
  if (ok(cell)) return cell;
  const seen = new Uint8Array(NC);
  seen[cell] = 1;
  let frontier = [cell];
  while (frontier.length) {
    const next = [];
    for (const c of frontier) {
      for (const nb of neiRel(c, dir)) {
        if (seen[nb]) continue;
        seen[nb] = 1;
        if (ok(nb)) return nb;
        next.push(nb);
      }
    }
    frontier = next;
  }
  return cell;
}

/** GK 목표: 자기 구역 안에서 공 → 자기 골 가운데 선 위, 공이 멀면 골라인 */
function gkTarget(ctx, side, bc) {
  const { cfg } = ctx;
  const dir = dirOf(side);
  const gx = side === "home" ? -1 : G.rowLen(6); // 자기 골 가운데 칸 (보드 밖 가상 칸, 서로 거울상)
  const g = G.centerXY(gx, 6);
  const bxy = XY[bc];
  const far = dtg(bc, -dir) > cfg.gkFarDist;
  const len = Math.hypot(bxy.x - g.x, bxy.y - g.y) || 1;
  const depth = (far ? cfg.gkDepthFar : cfg.gkDepthNear) * Math.sqrt(3);
  const px = g.x + ((bxy.x - g.x) / len) * depth;
  const py = g.y + ((bxy.y - g.y) / len) * depth;
  let best = -1;
  let bs = Infinity;
  for (const c of SCAN[side]) {
    if (!ZONE[side][c]) continue;
    if (far && ocOf(c, side) > 0) continue;
    const s = Math.hypot(XY[c].x - px, XY[c].y - py);
    if (s < bs - 1e-9) {
      bs = s;
      best = c;
    }
  }
  return best;
}

/**
 * 모든 선수의 이번 턴 목표 칸 (턴 시작 칸 기준, 결정적). 문서 §2.2-3 · 결정 19 (수비 성향 = 자리 잡기).
 * fixed: 태클 당사자 · 공 가진 선수 · 받는 선수 · 공 쫓기 · GK → 수비 압박 → 마크 / 패스길 / 내려서기 → 대형 기본 자리.
 */
function computeTargets(ctx, plan) {
  const st = ctx.state;
  const { cfg } = ctx;
  const b = st.ball;
  const pos = st.pos;
  const bc = ballCell(st);
  const atk = b.holder ? b.holder.side : b.flight ? b.flight.side : st.possessionSide || "home";
  const targets = { home: {}, away: {} };
  const claimed = { home: new Set(), away: new Set() };
  const blocked = new Set();
  if (b.holder) blocked.add(pos[b.holder.side][b.holder.id]);
  if (plan.action === "dribble" && plan.target >= 0) blocked.add(plan.target);
  const set = (s, id, cell, isGK) => {
    const ok = (c) => !claimed[s].has(c) && !blocked.has(c) && (!isGK || ZONE[s][c]);
    const t = ok(cell) ? cell : nearestOk(cell, ok, dirOf(s));
    targets[s][id] = t;
    claimed[s].add(t);
  };
  const fix = (s, id, cell) => {
    targets[s][id] = cell;
    claimed[s].add(cell);
  };

  // 공 가진 선수 · 태클 당사자
  if (b.holder) {
    const hs = b.holder.side;
    const hid = b.holder.id;
    fix(hs, hid, plan.action === "dribble" && plan.target >= 0 ? plan.target : pos[hs][hid]);
  }
  if (plan.tackle) fix(plan.tackle.side, plan.tackle.id, pos[plan.tackle.side][plan.tackle.id]);
  // 쉬는 선수 (넘어짐): 칸만 차지 — 자기 칸이 목표 (압박 · 마크 · 쫓기 자리를 차지하지 않는다, 문서 §2.2-3)
  for (const s of SIDES) {
    for (const id of st.order[s]) if (targets[s][id] === undefined && isResting(st, s, id, ctx.T)) fix(s, id, pos[s][id]);
  }
  // 받는 선수 (노린 칸) · 공 쫓기
  const landing = b.flight ? b.flight.target : b.loose ? b.cell : -1;
  if (b.flight) {
    const f = b.flight;
    const rc = f.intendedTarget;
    if (pos[f.side][f.receiverId] != null && targets[f.side][f.receiverId] === undefined) {
      if (st.roles[f.side][f.receiverId] === "GK" && !ZONE[f.side][rc]) set(f.side, f.receiverId, pos[f.side][f.receiverId], true);
      else fix(f.side, f.receiverId, rc);
    }
  }
  if (landing >= 0) {
    const n = b.flight ? cfg.chaseFlight : cfg.chaseLoose;
    for (const s of SIDES) {
      const cands = st.order[s]
        .map((id, i) => ({ id, i, d: dist(pos[s][id], landing) }))
        .filter((x) => targets[s][x.id] === undefined && (st.roles[s][x.id] !== "GK" || ZONE[s][landing]) && !isResting(st, s, x.id, ctx.T));
      cands.sort((a, c) => a.d - c.d || a.i - c.i);
      for (const x of cands.slice(0, n)) {
        if (claimed[s].has(landing)) set(s, x.id, landing, st.roles[s][x.id] === "GK");
        else fix(s, x.id, landing);
      }
    }
  }
  // GK
  for (const s of SIDES) {
    const gk = st.order[s][0];
    if (targets[s][gk] === undefined) set(s, gk, gkTarget(ctx, s, bc), true);
  }

  const def = otherSide(atk);
  const defTactic = (st[def].tactics && st[def].tactics.defense) || "balanced";
  const slotsA = lineSlots(st, atk);
  const slotsD = lineSlots(st, def);
  const anchor = (s, id, slots, attacking) => {
    const { role, idx, n } = slots[id];
    const ballOc = ocOf(bc, s);
    const ballR = CR[bc][1];
    const row0 = rowsFor(n)[idx];
    if (attacking) {
      const shift = cfg.shiftBallK * (ballOc - 7) + cfg.shiftAttack;
      let row = row0;
      // 상대 진영 (공 열 ≥ wideFromOc): 바깥 MF 는 측면 (크로스 자리) 으로 벌리고, FW 는 박스 쪽으로 좁힌다
      if (ballOc >= cfg.wideFromOc && role === "MF" && n >= 2 && row0 !== 6) row = row0 < 6 ? cfg.wideRows[0] : cfg.wideRows[1];
      if (ballOc >= cfg.wideFromOc && role === "FW") row = 6 + (row0 - 6) * cfg.fwNarrow;
      return ownCell(clamp(cfg.baseCols[role] + shift, 1, cfg.attackColMax), row, s);
    }
    // 수비: 공 → 자기 골 가운데 (oc −1, 행 6) 선 위에 줄을 세우고, 대형 행 간격은 defendSpread 만큼 좁힌다
    const col = defTactic === "hold" ? cfg.holdCols[role] : clamp(cfg.baseCols[role] + cfg.shiftBallK * (ballOc - 7) + cfg.shiftDefend, cfg.defendColMin, cfg.defendColMax);
    const lane = ballOc > col ? 6 + ((ballR - 6) * (col + 1)) / (ballOc + 1) : ballR;
    return ownCell(col, lane + (row0 - 6) * cfg.defendSpread, s);
  };

  // 수비 팀: 압박 (공 가진 선수가 있을 때)
  const carrierCell = b.holder ? pos[b.holder.side][b.holder.id] : -1;
  const atkDir = dirOf(atk);
  if (b.holder) {
    let nPress = defTactic === "tackle" ? 2 : 1;
    if (defTactic === "balanced" && ocOf(carrierCell, atk) >= 10) nPress = 2;
    if (ocOf(carrierCell, atk) < cfg.pressLine) nPress = Math.min(nPress, cfg.deepPressers); // 상대 골 앞 빌드업은 덜 압박
    if (plan.tackle && plan.tackle.side === def) nPress = Math.max(0, nPress - 1); // 이번 턴 태클하는 수비도 압박 인원 (결정 19)
    const cands = st.order[def]
      .map((id, i) => ({ id, i, d: dist(pos[def][id], carrierCell) }))
      .filter((x) => targets[def][x.id] === undefined && st.roles[def][x.id] !== "GK" && !isResting(st, def, x.id, ctx.T));
    cands.sort((a, c) => a.d - c.d || a.i - c.i);
    const fr = front(carrierCell, atkDir);
    const sc = straight(carrierCell, atkDir);
    for (const x of cands.slice(0, nPress)) {
      const pc = pos[def][x.id];
      if (fr.includes(pc) && !claimed[def].has(pc)) {
        fix(def, x.id, pc); // 이미 앞쪽 3칸 — 그 자리에서 태클을 노린다
        continue;
      }
      // 바로 뒤에 붙은 수비는 정면 칸으로 가는 길이 공 가진 선수에게 막힌다 → 대각으로 돌아 들어간다
      const behind = dist(pc, carrierCell) === 1 && !fr.includes(pc);
      let bestC = -1;
      let bs = Infinity;
      for (const c of fr) {
        if (claimed[def].has(c)) continue;
        const o = ctx.occStart[c];
        if (o && o.side !== def) continue; // 상대 (공격 팀) 가 선 칸은 못 간다
        let s = dist(pc, c) + (c === sc ? 0 : 0.5);
        if (behind && dist(pc, c) === 2 && c === sc) s += 2;
        if (s < bs) {
          bs = s;
          bestC = c;
        }
      }
      if (bestC >= 0) fix(def, x.id, bestC);
      else set(def, x.id, carrierCell, false);
    }
  }
  // 수비 팀: 마크 · 패스길 · 내려서기
  const attackers = st.order[atk].filter((id) => st.roles[atk][id] !== "GK" && !(b.holder && b.holder.id === id && b.holder.side === atk));
  const marked = new Set();
  for (const id of st.order[def]) {
    if (targets[def][id] !== undefined) continue;
    const anc = anchor(def, id, slotsD, false);
    if (defTactic === "hold" || (cfg.zonalDF && slotsD[id].role === "DF")) {
      set(def, id, anc, false);
      continue;
    }
    const pc = pos[def][id];
    let mk = null;
    let md = Infinity;
    for (const aid of attackers) {
      if (marked.has(aid)) continue;
      const ac = pos[atk][aid];
      if (dist(anc, ac) > cfg.markRadius || ocOf(ac, atk) < cfg.pressLine) continue;
      const dd = dist(pc, ac);
      if (dd < md) {
        md = dd;
        mk = aid;
      }
    }
    if (!mk) {
      set(def, id, anc, false);
      continue;
    }
    marked.add(mk);
    const ac = pos[atk][mk];
    let t = straight(ac, atkDir);
    if (defTactic === "intercept" && carrierCell >= 0) {
      const ln = lineIds(carrierCell, ac, atkDir);
      if (ln.length >= 3) t = ln[ln.length - 2];
    }
    if (t < 0) t = ac;
    set(def, id, t, false);
  }
  // 공격 팀: 대형 기본 자리 (+ 옆에 상대가 붙어 있으면 한 칸 빈 곳으로)
  const defOcc = new Uint8Array(NC);
  for (const id of st.order[def]) defOcc[pos[def][id]] = 1;
  const pressure = (c) => {
    let n = 0;
    for (const nb of NEI[c]) n += defOcc[nb];
    return n + defOcc[c] * 2;
  };
  for (const id of st.order[atk]) {
    if (targets[atk][id] !== undefined) continue;
    let anc = anchor(atk, id, slotsA, true);
    if (pressure(anc) > 0) {
      let bestC = anc;
      let bp = pressure(anc);
      for (const nb of neiRel(anc, atkDir)) {
        const p = pressure(nb);
        if (p < bp) {
          bp = p;
          bestC = nb;
        }
      }
      anc = bestC;
    }
    set(atk, id, anc, false);
  }
  return targets;
}

/** 한 칸 고르기: 목표까지 거리가 줄어드는 빈 이웃 (같으면 더 곧은 칸 → 그 팀 공격 방향 기준 순서). 없으면 -1 */
function chooseStep(cur, tgt, occ, reserved, isCarrier, gkZone, dir) {
  const d0 = dist(cur, tgt);
  let best = -1;
  let bd = d0;
  let be = Infinity;
  for (const nb of neiRel(cur, dir)) {
    if (occ[nb]) continue;
    if (nb === reserved && !isCarrier) continue;
    if (gkZone && !gkZone[nb]) continue;
    const d = dist(nb, tgt);
    if (d >= d0) continue;
    const e = euclid(nb, tgt);
    if (d < bd || (d === bd && e < be - 1e-9)) {
      bd = d;
      be = e;
      best = nb;
    }
  }
  return best;
}

function moveAll(ctx, plan) {
  const st = ctx.state;
  const { cfg, T } = ctx;
  const targets = computeTargets(ctx, plan);
  const occ = occupancy(st.pos);
  const reserved = plan.action === "dribble" ? plan.target : -1;
  const b = st.ball;
  for (const { side, id } of ctx.order) {
    const lv = st.live[side][id];
    const p = findPlayer(st[side], id);
    const isCarrier = !!(b.holder && b.holder.side === side && b.holder.id === id);
    lv.moveAcc += moveRate(cfg, p, isCarrier);
    const inTackle = plan.tackle && ((plan.tackle.side === side && plan.tackle.id === id) || (plan.side === side && plan.id === id));
    const shooter = plan.action === "shoot" && plan.side === side && plan.id === id;
    let moved = false;
    const cur = st.pos[side][id];
    const tgt = targets[side][id];
    if (!inTackle && !shooter && !isResting(st, side, id, T) && tgt != null && tgt !== cur && lv.moveAcc >= 1) {
      const gkZone = st.roles[side][id] === "GK" ? ZONE[side] : null;
      const nb = chooseStep(cur, tgt, occ, reserved, isCarrier, gkZone, dirOf(side));
      if (nb >= 0) {
        occ[cur] = null;
        occ[nb] = { side, id };
        st.pos[side][id] = nb;
        lv.moveAcc -= 1;
        moved = true;
        if (isCarrier) b.cell = nb;
        else if (b.loose && nb === b.cell) pickLoose(ctx, side, id, nb);
      }
    }
    if (!moved) lv.moveAcc = Math.min(lv.moveAcc, 1);
  }
}

function pickLoose(ctx, side, id, cell) {
  const st = ctx.state;
  st.ball.loose = false;
  st.ball.holder = { side, id };
  st.ball.cell = cell;
  st.ball.holdStreak = 0;
  st.stats[side].looseWon += 1;
  gainPossession(st, side);
  pushEvent(st, ctx.T, { type: "looseWon", side, playerId: id, cell });
}

/* ------------------------------------------------------------------ */
/* (4) 겨루기                                                              */
/* ------------------------------------------------------------------ */

function addDuelWin(st, side, id) {
  st.stats[side].duelsWon += 1;
  incr(st.stats[side].playerDuelWins, id);
}

/** 태클 (결정 12). 실패: 드리블이고 가려는 칸이 비었거나 태클한 수비 칸이면 둘이 엇갈려 1칸씩, 아니면 수비만 제자리에서 넘어짐 */
function resolveTackle(ctx, plan) {
  const st = ctx.state;
  const { m, T } = ctx;
  const aSide = plan.side;
  const dSide = plan.tackle.side;
  const carrier = findPlayer(st[aSide], plan.id);
  const tackler = findPlayer(st[dSide], plan.tackle.id);
  const cFrom = st.pos[aSide][plan.id];
  const tFrom = st.pos[dSide][plan.tackle.id];
  const pk = pKeep(ctx, st[aSide], carrier, st[dSide], tackler, plan.tackle.helpers);
  const keep = roll(ctx.rng, "tackle", pk, { carrierId: plan.id, tacklerId: tackler.id, action: plan.action, helpers: plan.tackle.helpers });
  st.stats[dSide].tackles += 1;
  let cTo = cFrom;
  let tTo = tFrom;
  if (keep) {
    addDuelWin(st, aSide, plan.id);
    if (plan.action === "dribble") {
      const occ = occupancy(st.pos);
      const o = plan.target >= 0 ? occ[plan.target] : null;
      const free = plan.target >= 0 && (!o || (o.side === dSide && o.id === tackler.id));
      if (free) {
        cTo = plan.target;
        tTo = cFrom;
        st.pos[aSide][plan.id] = cTo;
        st.pos[dSide][tackler.id] = tTo;
        st.ball.cell = cTo;
        st.stats[aSide].dribblesPast += 1;
      }
    }
    st.live[dSide][tackler.id].restUntil = T + 1;
    // H4: 바위 방벽 (noFailPenalty) — 넘어지지 않음
  } else {
    st.stats[dSide].tacklesWon += 1;
    addDuelWin(st, dSide, tackler.id);
    st.ball.holder = { side: dSide, id: tackler.id };
    st.ball.cell = tFrom;
    st.ball.holdStreak = 0;
    gainPossession(st, dSide);
  }
  pushEvent(st, T, {
    type: "tackle", side: dSide, tacklerId: tackler.id, carrierId: plan.id, success: !keep, p: 1 - pk,
    carrierFrom: cFrom, carrierTo: cTo, tacklerFrom: tFrom, tacklerTo: tTo,
  });
}

/** 슛 · 헤더 판정. 막히면 GK 가 잡는다 */
function resolveShot(ctx, side, id, header) {
  const st = ctx.state;
  const { m, T } = ctx;
  const opp = otherSide(side);
  const shooter = findPlayer(st[side], id);
  const gk = findPlayer(st[opp], st.order[opp][0]);
  const cell = st.pos[side][id];
  const d = dtg(cell, dirOf(side));
  const box = d <= G.BOX_DIST;
  // 막는 수비: 슛은 턴 시작 칸 (공이 이동 전에 떠난다), 헤더는 지금 칸 (크로스가 이동 뒤에 도착 — [구현 결정])
  const blockers = shotBlockers(ctx, side, cell, header ? occupancy(st.pos) : ctx.occStart);
  const p = pShot(ctx, st[side], shooter, st[opp], gk, box, header, blockers);
  const goal = roll(ctx.rng, header ? "header" : "shot", p, { side, playerId: id, box, blockers });
  st.stats[side].shots += 1;
  if (header) st.stats[side].headers += 1;
  ctx.shotBy = side;
  st.ball.holder = null;
  st.ball.flight = null;
  st.ball.loose = false;
  pushEvent(st, T, { type: "shot", side, playerId: id, cell, dist: d, box, header, blockers, p, success: goal });
  if (goal) {
    st.score[side] += 1;
    st.stats[side].goals += 1;
    incr(st.stats[side].playerGoals, id);
    addDuelWin(st, side, id);
    ctx.goal = { side, playerId: id };
    pushEvent(st, T, { type: "goal", side, playerId: id, score: { home: st.score.home, away: st.score.away } });
  } else {
    st.stats[opp].saves += 1;
    addDuelWin(st, opp, gk.id);
    st.ball.holder = { side: opp, id: gk.id };
    st.ball.cell = st.pos[opp][gk.id];
    st.ball.holdStreak = 0;
    gainPossession(st, opp);
    pushEvent(st, T, { type: "save", side: opp, gkId: gk.id });
  }
}

/**
 * 공 비행 (결정 9 · 문서 §2.2-4): 이번 턴에 최대 passSpeed 칸. 그 칸들 위 · 옆의 쉬지 않는 상대가 (한 패스에 한 번씩)
 * 먼저 닿는 칸 → 칸 위 먼저 → 이동 순서로 굴린다. 크로스는 땅 가로채기 없음.
 */
function advanceFlight(ctx) {
  const st = ctx.state;
  const { m, T, cfg } = ctx;
  const f = st.ball.flight;
  const seg = f.path.slice(f.at, f.at + Math.max(1, Math.round(cfg.passSpeed)));
  const opp = otherSide(f.side);
  const passer = findPlayer(st[f.side], f.passerId);
  if (!f.cross) {
    const touch = (c) => {
      for (let i = 0; i < seg.length; i++) {
        if (seg[i] === c) return i * 2;
        if (dist(seg[i], c) === 1) return i * 2 + 1;
      }
      return -1;
    };
    const cands = [];
    let touching = 0;
    for (const { side, id } of ctx.order) {
      if (side !== opp || isResting(st, opp, id, T)) continue;
      const rk = touch(st.pos[opp][id]);
      if (rk < 0) continue;
      touching++;
      if (!f.rolled.includes(id)) cands.push({ id, rk, oi: ctx.orderIdx[opp + ":" + id] });
    }
    cands.sort((a, b) => a.rk - b.rk || a.oi - b.oi);
    for (const c of cands) {
      const helpers = touching - 1; // 이번 턴 지난 칸 위 · 옆의 다른 쉬지 않는 상대 (이미 굴린 수비 포함)
      const defender = findPlayer(st[opp], c.id);
      const ps = pPass(ctx, st[f.side], passer, st[opp], defender, helpers);
      const survived = roll(ctx.rng, "intercept", ps, { passerId: f.passerId, defenderId: c.id, helpers });
      f.rolled.push(c.id);
      const dc = st.pos[opp][c.id];
      pushEvent(st, T, { type: "intercept", side: opp, defenderId: c.id, cell: dc, success: !survived, p: 1 - ps });
      if (!survived) {
        st.stats[opp].interceptions += 1;
        addDuelWin(st, opp, c.id);
        st.ball.flight = null;
        st.ball.holder = { side: opp, id: c.id };
        st.ball.cell = dc;
        st.ball.holdStreak = 0;
        gainPossession(st, opp);
        return;
      }
    }
  }
  f.at += seg.length;
  st.ball.cell = seg[seg.length - 1];
  if (f.at >= f.path.length) arrive(ctx);
}

function receive(ctx, side, id) {
  const st = ctx.state;
  st.ball.flight = null;
  st.ball.loose = false;
  st.ball.holder = { side, id };
  st.ball.cell = st.pos[side][id];
  st.ball.holdStreak = 0;
  st.stats[side].passesCompleted += 1;
  gainPossession(st, side);
  pushEvent(st, ctx.T, { type: "receive", side, playerId: id, cell: st.ball.cell });
}

function looseAt(ctx, cell) {
  const st = ctx.state;
  st.ball.flight = null;
  st.ball.holder = null;
  st.ball.loose = true;
  st.ball.cell = cell;
  pushEvent(st, ctx.T, { type: "loose", cell });
}

/** 도착 (문서 §2.2 패스): 같은 편 → 받음 (크로스는 공중볼 → 헤더), 상대 → 옆 빈 칸으로 튐, 빈 칸 → 흘러나온 공 */
function arrive(ctx) {
  const st = ctx.state;
  const { m, T, cfg } = ctx;
  const f = st.ball.flight;
  const occ = occupancy(st.pos);
  const o = occ[f.target];
  if (f.rolled.length) addDuelWin(st, f.side, f.passerId); // 가로채기 굴림을 1번 이상 살아남은 패스
  if (o && o.side === f.side) {
    if (f.cross) {
      const opp = otherSide(f.side);
      const crosser = findPlayer(st[f.side], f.passerId);
      const defId = bestAerialDefender(ctx, f.target, opp, crosser, occ);
      if (defId) {
        const defender = findPlayer(st[opp], defId);
        const pa = pAerial(ctx, st[f.side], crosser, st[opp], defender);
        const win = roll(ctx.rng, "aerial", pa, { crosserId: f.passerId, receiverId: o.id, defenderId: defId });
        pushEvent(st, T, { type: "aerial", side: f.side, attackerId: o.id, defenderId: defId, success: win, p: pa });
        if (!win) {
          addDuelWin(st, opp, defId);
          st.ball.flight = null;
          st.ball.holder = { side: opp, id: defId };
          st.ball.cell = st.pos[opp][defId];
          st.ball.holdStreak = 0;
          gainPossession(st, opp);
          return;
        }
        addDuelWin(st, f.side, f.passerId);
      }
      receive(ctx, o.side, o.id);
      const rp = findPlayer(st[o.side], o.id);
      if (st.roles[o.side][o.id] !== "GK" && dtg(f.target, dirOf(o.side)) <= shotRange(cfg, rp)) resolveShot(ctx, o.side, o.id, true);
      return;
    }
    receive(ctx, o.side, o.id);
    return;
  }
  if (o) {
    // 상대 (가로채기에 진 수비 · 넘어진 수비) 가 선 칸 → 받는 선수에게 가장 가까운 옆 빈 칸으로 튄다
    const rc = st.pos[f.side][f.receiverId];
    let best = -1;
    for (const nb of neiRel(f.target, dirOf(f.side))) {
      if (occ[nb]) continue;
      if (best < 0 || dist(nb, rc) < dist(best, rc)) best = nb;
    }
    if (best >= 0) looseAt(ctx, best);
    else {
      // 옆 빈 칸이 없으면 그 상대 (쉬는 선수여도 발밑에 멈춘 공) 가 갖는다 — [구현 결정]
      st.ball.flight = null;
      st.ball.holder = { side: o.side, id: o.id };
      st.ball.cell = f.target;
      st.ball.holdStreak = 0;
      st.stats[o.side].looseWon += 1;
      gainPossession(st, o.side);
      pushEvent(st, T, { type: "looseWon", side: o.side, playerId: o.id, cell: f.target });
    }
    return;
  }
  looseAt(ctx, f.target);
}

/* ------------------------------------------------------------------ */
/* 턴 끝 · 단계                                                            */
/* ------------------------------------------------------------------ */

function hasBall(state, side) {
  const b = state.ball;
  return !!((b.holder && b.holder.side === side) || (b.flight && b.flight.side === side));
}

function afterTurn(ctx) {
  const st = ctx.state;
  const m = ctx.m;
  const cfg = ctx.cfg;
  const T = ctx.T;
  if (ctx.goal) {
    if (st.stage === "goldenGoal") {
      finishMatch(st, T);
      return;
    }
    kickoff(st, otherSide(ctx.goal.side), T, cfg);
  }
  if (st.stage === "addedTime") {
    const t = st.addedTime.side;
    const lost = (st.ball.holder && st.ball.holder.side !== t) || (st.ball.flight && st.ball.flight.side !== t);
    const reason = ctx.shotBy === t ? "shot" : lost ? "lost" : st.turn >= st.stageEndTurn ? "time" : null;
    if (reason) {
      st.addedTime.endTurn = st.turn;
      st.addedTime.reason = reason;
      st.stage = "regular";
      afterRegulation(st, m, cfg, T);
    }
    return;
  }
  if (st.stage === "regular" && st.turn >= st.stageEndTurn) {
    const deficit = Math.round(num(m.lastAttackDeficit, 1));
    const diff = st.score.home - st.score.away;
    if (!st.addedTime && deficit >= 1 && Math.abs(diff) === deficit) {
      const t = diff < 0 ? "home" : "away";
      if (hasBall(st, t)) {
        st.stage = "addedTime";
        st.stageEndTurn = st.turn + Math.max(1, Math.round(cfg.addedMaxTurns));
        st.addedTime = { side: t, startTurn: st.turn, endTurn: null, reason: null };
        st.lastAttack = { side: t, stage: "regular", turn: st.turn };
        pushEvent(st, T, { type: "addedTime", side: t });
        return;
      }
    }
    afterRegulation(st, m, cfg, T);
    return;
  }
  if (st.stage === "goldenGoal" && st.turn >= st.stageEndTurn) {
    st.stage = "penalties";
    initPenalties(st);
    pushEvent(st, T, { type: "penalties" });
  }
}

/** 정규 (+ 추가시간) 끝: 동점 · goal / arena → 골든골, 아니면 종료 */
function afterRegulation(st, m, cfg, T) {
  if (st.score.home === st.score.away && st.kind !== "friendly") {
    st.stage = "goldenGoal";
    st.stageEndTurn = st.turn + Math.max(1, Math.round(cfg.goldenTurns));
    pushEvent(st, T, { type: "goldenGoal" });
    return;
  }
  finishMatch(st, T);
}

/* ------------------------------------------------------------------ */
/* 승부차기 (예전 initPenalties / penaltyKick 그대로 — 패시브 · 체력 없음 = H4)  */
/* ------------------------------------------------------------------ */

function initPenalties(state) {
  const order = (side) => {
    const t = state[side];
    const non = t.players.filter((p) => p.position !== "GK").sort((a, b) => stat(b, "shoot") - stat(a, "shoot"));
    const gks = t.players.filter((p) => p.position === "GK");
    return non.concat(gks).map((p) => p.id);
  };
  state.penalties = {
    home: 0,
    away: 0,
    taken: { home: 0, away: 0 },
    order: { home: order("home"), away: order("away") },
    turn: "home",
    suddenDeath: false,
    kicks: [],
  };
}

function penaltyKick(state, m) {
  if (!state.penalties) initPenalties(state);
  const pen = state.penalties;
  const side = pen.turn;
  const opp = otherSide(side);
  const team = state[side];
  const oppTeam = state[opp];
  const order = pen.order[side];
  const shooter = findPlayer(team, order[pen.taken[side] % order.length]);
  const gk = oppTeam.players.find((p) => p.position === "GK") || bestOf(oppTeam.players, (p) => stat(p, "defense"));
  if (!shooter || !gk) throw new Error("hexMatch.penaltyKick: 키커 또는 골키퍼가 없습니다");
  // H4: collectMods (패시브 · 코치 패시브)
  const att = stat(shooter, "shoot") * coef(m, "shoot", 1) * styleMult(shooter.style, gk.style, m)
    * condOf(team) * Math.max(0, 1 + bonusOf(team, "shootPower"));
  const def = stat(gk, "defense") * coef(m, "save", 1) * styleMult(gk.style, shooter.style, m)
    * condOf(oppTeam) * Math.max(0, 1 + bonusOf(oppTeam, "defense"));
  const p = prob(m, att, def);
  const rng = createRngFromState(state.rngState);
  const success = roll(rng, "penalty", p, { side, playerId: shooter.id, gkId: gk.id });
  state.rngState = rng.getState();

  pen.taken[side] += 1;
  if (success) pen[side] += 1;
  pen.kicks.push({ side, playerId: shooter.id, success, p });
  state.stats[side].shots += 1;
  pushEvent(state, state.turn, { type: "penalty", side, playerId: shooter.id, defenderId: gk.id, success, p });
  pen.turn = opp;

  const N = Math.max(1, Math.round(num(m.penaltyShots, 5)));
  const th = pen.taken.home;
  const ta = pen.taken.away;
  let over = false;
  if (th <= N && ta <= N) {
    const remH = N - th;
    const remA = N - ta;
    if (pen.home + remH < pen.away || pen.away + remA < pen.home) over = true;
    else if (th === N && ta === N && pen.home !== pen.away) over = true;
    if (th === N && ta === N && pen.home === pen.away) pen.suddenDeath = true;
  } else if (th === ta && pen.home !== pen.away) {
    over = true;
  }
  if (over) finishMatch(state, state.turn);
}

/* ------------------------------------------------------------------ */
/* 종료 · 결과                                                             */
/* ------------------------------------------------------------------ */

function computeMvp(st) {
  let best = null;
  let bs = -Infinity;
  const ids = new Set([...Object.keys(st.playerDuelWins || {}), ...Object.keys(st.playerGoals || {})]);
  for (const id of ids) {
    const s = num(st.playerGoals && st.playerGoals[id]) * 3 + num(st.playerDuelWins && st.playerDuelWins[id]);
    if (s > bs) {
      bs = s;
      best = id;
    }
  }
  return best;
}

function winnerOf(state) {
  const s = state.score;
  let winner = s.home > s.away ? "home" : s.away > s.home ? "away" : "draw";
  if (state.penalties && state.penalties.home !== state.penalties.away) winner = state.penalties.home > state.penalties.away ? "home" : "away";
  return winner;
}

function buildResult(state, provisional) {
  const s = state.score;
  const stats = JSON.parse(JSON.stringify(state.stats));
  for (const side of SIDES) stats[side].mvpId = computeMvp(stats[side]);
  const result = {
    kind: state.kind,
    home: s.home,
    away: s.away,
    homeGoals: s.home,
    awayGoals: s.away,
    homeName: state.home.name,
    awayName: state.away.name,
    winner: winnerOf(state),
    stats,
    events: state.events.slice(),
    possessionsPlayed: state.possessions,
    turnsPlayed: state.turn,
    stage: state.stage,
    seed: state.seed,
    lastAttack: state.lastAttack ? Object.assign({}, state.lastAttack) : null,
  };
  if (state.penalties) result.penalties = { home: state.penalties.home, away: state.penalties.away };
  if (provisional) result.provisional = true;
  return result;
}

function finishMatch(state, turn) {
  state.finished = true;
  pushEvent(state, turn, { type: "end", winner: winnerOf(state) });
  state.result = buildResult(state, false);
  for (const side of SIDES) state.stats[side].mvpId = state.result.stats[side].mvpId;
}

/**
 * 끝날 때까지 step (안전 상한 HEX_DEFAULTS.autoCap — 넘으면 throw).
 * @returns {object} state
 */
export function simulateAuto(state, data) {
  if (!state) return state; // 예전 엔진처럼 null 은 그대로
  const cap = Math.max(1, Math.round(hexCfg(data).autoCap));
  let n = 0;
  while (!state.finished) {
    if (++n > cap) throw new Error(`hexMatch.simulateAuto: ${cap} step 안에 끝나지 않습니다 (turn ${state.turn}, stage ${state.stage})`);
    step(state, data, null);
  }
  return state;
}

/** @returns {boolean} */
export function isFinished(state) {
  return !!(state && state.finished);
}

/**
 * 결과 (예전 buildResult 와 같은 모양 + turnsPlayed). 끝났으면 저장된 state.result, 아니면 provisional.
 * @returns {object|null}
 */
export function getResult(state) {
  if (!state) return null; // 예전 엔진처럼
  if (state.finished && state.result) return state.result;
  return buildResult(state, true);
}
