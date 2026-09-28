// js/ui/store.js — 전역 UI 상태 + localStorage 저장/복구 (모든 접근 try/catch)

export const KEYS = {
  run: 'soccer.run',
  match: 'soccer.match',
  teams: 'soccer.teams',
};

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
  data: null,          // { config, characters, supports, events, skills, relics, opponents, routes }
  screen: 'start',     // 'start' | 'setup' | 'run'
  run: null,           // RunState (엔진 소유)
  match: null,         // MatchState (엔진 소유), 경기 중에만
  setup: null,         // 편성 화면 임시 상태
  final: null,         // finalizeRun 결과 { rating, registeredTeam, seed }
  registered: false,   // 이번 런의 팀 등록 여부
  matchUi: {
    auto: URL_PREFS.auto ?? true,
    speed: URL_PREFS.speed ?? 1,
    intervene: false,
    selectedSkillId: null,
    timer: null,        // 다음 step 예약 (setTimeout id; app.js render() 가 clearInterval 로 지운다 — 같은 id 풀)
    busy: false,        // 비트 연출 중 (읽기 전용 표시: 테스트·도구용)
    resultShown: false,
  },
};

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
export function addTeam(team) {
  const teams = loadTeams();
  teams.unshift(team);
  saveTeams(teams.slice(0, 50));
  return teams;
}

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
  ui.resultShown = false;
}
