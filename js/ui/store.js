// js/ui/store.js — 전역 UI 상태 + localStorage 저장/복구 (모든 접근 try/catch)

export const KEYS = {
  run: 'soccer.run',
  match: 'soccer.match',
  teams: 'soccer.teams',
};

export const store = {
  data: null,          // { config, characters, supports, events, skills, relics, opponents, routes }
  screen: 'start',     // 'start' | 'setup' | 'run'
  run: null,           // RunState (엔진 소유)
  match: null,         // MatchState (엔진 소유), 경기 중에만
  setup: null,         // 편성 화면 임시 상태
  final: null,         // finalizeRun 결과 { rating, registeredTeam, seed }
  registered: false,   // 이번 런의 팀 등록 여부
  matchUi: {
    auto: true,
    speed: 1,
    intervene: false,
    selectedSkillId: null,
    timer: null,
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
  ui.intervene = false;
  ui.selectedSkillId = null;
  ui.resultShown = false;
}
