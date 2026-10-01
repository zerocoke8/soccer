// js/ui/store.js — 전역 UI 상태 + localStorage 저장/복구 (모든 접근 try/catch)

export const KEYS = {
  run: 'soccer.run',
  match: 'soccer.match',
  teams: 'soccer.teams',
  // 도전 모드 (2026-10-01): 런 저장(run · match)과 따로 둔다 — 도전 경기는 런 저장을 건드리지 않는다
  challenge: 'soccer.challenge',           // 진행 기록 { version, teams: { [팀 id]: { cleared, attempts, wins, lastResult, resets } } } (엔진 challenge.normalizeProgress)
  challengeMatch: 'soccer.challengeMatch', // 진행 중인 도전 경기 { version, teamId, stage, attempt, resets, seed, team, match } — 시작 화면 [도전 모드] 가 이어서 한다
};
/** 'soccer.challengeMatch' 저장 형식 버전 */
export const CHALLENGE_MATCH_VERSION = 1;
/** 등록 팀 저장 개수 상한 (addTeam — 넘친 오래된 팀은 지운다) */
export const TEAMS_CAP = 50;

// 경기 화면 URL 파라미터 (테스트·스크린샷용): ?auto=0 → 자동 꺼진 채 시작, ?speed=1|2|4 → 배속. 모듈 로드 시 한 번 읽는다.
function urlMatchPrefs() {
  try {
    const search = globalThis.location && typeof globalThis.location.search === 'string' ? globalThis.location.search : '';
    const q = new URLSearchParams(search);
    const out = {};
    const a = q.get('auto');
    if (a === '0' || a === 'false' || a === 'off') out.auto = false;
    else if (a === '1' || a === 'true' || a === 'on') out.auto = true;
    const sp = Number(q.get('speed'));
    if (sp === 1 || sp === 2 || sp === 4) out.speed = sp;
    return out;
  } catch (_) {
    return {};
  }
}
const URL_PREFS = urlMatchPrefs();

export const store = {
  data: null,          // { config, characters, supports, events, skills, relics, opponents, routes, …, challenge, challenge_sample_team }
  screen: 'start',     // 'start' | 'setup' | 'run' | 'challenge'(도전 목록) | 'challengeMatch'(도전 경기)
  run: null,           // RunState (엔진 소유)
  match: null,         // MatchState (엔진 소유), 경기 중에만 — 도전 경기 중에는 도전 경기 상태 (런 경기는 'soccer.match' 에 그대로 있고 이어하기가 다시 읽는다)
                       //   도전 경기를 떠나면(결과 기록 · 포기 · [나가기] · 처음으로) 늘 null 로 비운다
  // 도전 모드 화면 상태 (메모리만 — 진행 기록 · 진행 중인 경기는 위 KEYS.challenge · KEYS.challengeMatch)
  challenge: {
    teamId: null,      // 고른 팀 (엔진 challenge.teamIdOf)
    stage: null,       // 고른 단계 (미리보기)
    active: null,      // 진행 중인 도전 경기 { teamId, stage, attempt, resets, seed, team, displayName }
    result: null,      // 방금 끝난 도전 결과 (결과 모달) — 닫으면 null
  },
  setup: null,         // 편성 화면 임시 상태
  final: null,         // finalizeRun 결과 { rating, registeredTeam, seed }
  registered: false,   // 이번 런의 팀 등록 여부
  matchUi: {
    auto: URL_PREFS.auto ?? true,
    speed: URL_PREFS.speed ?? 1,
    intervene: false,
    selectedSkillId: null, // 결정과 함께 쓸 일반 액티브 (토글)
    ultimate: false,       // 결정과 함께 쓸 필살기 (토글, §13.2-12)
    receiverPick: {},      // 받는 선수 직접 선택 { pass?: { id, arrival }, cross?: … } — 결정마다 초기화
    pickKey: null,         // 위 토글들이 속한 결정(듀얼) 식별자
    gaanpaUsedKey: null,   // 이번 결정에서 간파를 이미 썼음 (버튼 표시용)
    lastDecision: null,    // 사람이 마지막으로 보낸 결정 { action, receiverId?, skillId?, ultimate? } (읽기 전용: 테스트·도구용)
    timer: null,        // 다음 step 예약 (setTimeout id; app.js render() 가 clearInterval 로 지운다 — 같은 id 풀)
    busy: false,        // 비트 연출 중 (읽기 전용 표시: 테스트·도구용)
    resultShown: false,
    logOpen: false,     // 로그 서랍 열림 — 한 경기 안에서는 경기 화면을 다시 그려도 유지, 새 경기(resetMatchUi)는 닫힌 채 시작
  },
};
// 화면은 인게임·아웃게임 모두 가로 전용 (고정 스테이지 1280×720, js/ui/stage.js) — 방향 상태 · ?orient · 저장값(soccer.orient)은 없다.

export function lsGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('localStorage 읽기 실패', key, e);
    return null;
  }
}

export function lsSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage 쓰기 실패', key, e);
    return false;
  }
}

export function saveRun(state) { return lsSet(KEYS.run, state ?? null); }
export function loadRun() { return lsGet(KEYS.run); }
export function saveMatch(state) { return lsSet(KEYS.match, state ?? null); }
export function loadMatch() { return lsGet(KEYS.match); }
export function clearRunSaves() { lsSet(KEYS.run, null); lsSet(KEYS.match, null); }

export function loadTeams() {
  const t = lsGet(KEYS.teams);
  return Array.isArray(t) ? t : [];
}
export function saveTeams(teams) { return lsSet(KEYS.teams, Array.isArray(teams) ? teams : []); }
/** 등록 팀 맨 앞에 추가 (TEAMS_CAP 개까지 저장). 반환 = 자르기 전 목록 — slice(TEAMS_CAP) 가 밀려난 팀 */
export function addTeam(team) {
  const teams = loadTeams();
  teams.unshift(team);
  saveTeams(teams.slice(0, TEAMS_CAP));
  return teams;
}

// ---- 도전 모드 (런 저장과 따로) ----
/** 진행 기록 원본 (없으면 null) — 화면은 엔진 challenge.normalizeProgress 로 정리해서 쓴다 */
export function loadChallengeProgress() { return lsGet(KEYS.challenge); }
export function saveChallengeProgress(progress) { return lsSet(KEYS.challenge, progress ?? null); }
/** 진행 중인 도전 경기 저장본 (없거나 모양이 틀리면 null) */
export function loadChallengeMatch() {
  const s = lsGet(KEYS.challengeMatch);
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}
export function saveChallengeMatch(save) { return lsSet(KEYS.challengeMatch, save ?? null); }

export function hasSavedRun() {
  const s = loadRun();
  return !!(s && typeof s === 'object' && s.phase);
}

export function resetMatchUi() {
  const ui = store.matchUi;
  if (ui.timer) { try { clearInterval(ui.timer); } catch (_) { /* ignore */ } }
  ui.timer = null;
  ui.busy = false;
  ui.intervene = false;
  ui.selectedSkillId = null;
  ui.ultimate = false;
  ui.receiverPick = {};
  ui.pickKey = null;
  ui.gaanpaUsedKey = null;
  ui.lastDecision = null;
  ui.resultShown = false;
  ui.logOpen = false;
}
