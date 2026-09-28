// js/ui/store.js — 전역 UI 상태 + localStorage 저장/복구 (모든 접근 try/catch)

export const KEYS = {
  run: 'soccer.run',
  match: 'soccer.match',
  teams: 'soccer.teams',
  orient: 'soccer.orient', // 경기 화면 방향 'land' | 'port' (JSON 이 아닌 글자 그대로)
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
    selectedSkillId: null, // 결정과 함께 쓸 일반 액티브 (토글)
    ultimate: false,       // 결정과 함께 쓸 필살기 (토글, §13.2-12)
    receiverPick: {},      // 받는 선수 직접 선택 { pass?: { id, arrival }, cross?: … } — 결정마다 초기화
    pickKey: null,         // 위 토글들이 속한 결정(듀얼) 식별자
    gaanpaUsedKey: null,   // 이번 결정에서 간파를 이미 썼음 (버튼 표시용)
    lastDecision: null,    // 사람이 마지막으로 보낸 결정 { action, receiverId?, skillId?, ultimate? } (읽기 전용: 테스트·도구용)
    timer: null,        // 다음 step 예약 (setTimeout id; app.js render() 가 clearInterval 로 지운다 — 같은 id 풀)
    busy: false,        // 비트 연출 중 (읽기 전용 표시: 테스트·도구용)
    resultShown: false,
    orient: null,       // 이번 세션에서 토글로 고른 경기 화면 방향 'land' | 'port' (resetMatchUi 가 지우지 않는다 — §13.9)
  },
};

/* ------------------------------------------------------------------ */
/* 경기 화면 방향 (가로 'land' / 세로 'port' — ARCHITECTURE §13.9)          */
/* ------------------------------------------------------------------ */
const ORIENT_ALIASES = { land: 'land', landscape: 'land', port: 'port', portrait: 'port' };
export const normOrient = (v) => ORIENT_ALIASES[String(v ?? '').trim().replace(/^"|"$/g, '').toLowerCase()] ?? null;

/** URL ?orient=land|port (landscape|portrait 도 받는다). 부를 때마다 읽는다 (jsdom 테스트는 window.location) */
function urlOrient() {
  try {
    const loc = globalThis.location ?? globalThis.window?.location;
    return normOrient(new URLSearchParams(typeof loc?.search === 'string' ? loc.search : '').get('orient'));
  } catch (_) {
    return null;
  }
}
export function loadOrient() {
  try {
    return normOrient(localStorage.getItem(KEYS.orient));
  } catch (_) {
    return null;
  }
}
export function saveOrient(orient) {
  const o = normOrient(orient);
  try {
    if (o) localStorage.setItem(KEYS.orient, o);
    return !!o;
  } catch (e) {
    console.warn('localStorage 쓰기 실패', KEYS.orient, e);
    return false;
  }
}
/**
 * 가로 경기 화면이 들어가는 창 크기: 폭 ≥ 900 (오른쪽 패널 404px + 필드 칸 ≈ 430px), 높이 ≥ 500 (가로로 든 폰 ≈ 390~430 은 제외).
 * 이보다 작으면 토글·저장값이 'land' 여도 세로 — 좁은 창에서 가로로 바꾸면 필드 칸이 0 이 되고 "⇄ 세로" 버튼이 화면 밖으로 나간다.
 */
export const LAND_MIN = { w: 900, h: 500 };
function winSize() {
  try {
    return { w: Number(globalThis.window?.innerWidth) || 0, h: Number(globalThis.window?.innerHeight) || 0 };
  } catch (_) {
    return { w: 0, h: 0 };
  }
}
/** 창(w×h, 생략하면 지금 창)이 가로 경기 화면을 담을 수 있나 */
export function landFits(w = winSize().w, h = winSize().h) {
  return w >= LAND_MIN.w && h >= LAND_MIN.h;
}
/** 기본 규칙: 가로 화면이 들어가고(landFits) 가로가 더 길면 가로, 아니면 세로 */
export function autoOrient(w = winSize().w, h = winSize().h) {
  return landFits(w, h) && w > h ? 'land' : 'port';
}
/**
 * 경기 화면 방향 → { orient, source }. 우선순위: 이번 세션 토글(matchUi.orient) > URL ?orient > 저장값(soccer.orient) > 기본 규칙.
 * 토글은 저장도 하므로 새로 열면 저장값이 쓰인다. 토글을 URL 보다 앞에 두는 것은 ?orient 로 연 화면에서도 토글이 먹게 하려는 것.
 * 토글·저장값의 'land' 는 창이 담을 수 있을 때만(landFits) — 아니면 세로. URL 은 도구·확인용 강제라 창 크기와 무관하게 따른다.
 */
export function resolveOrient() {
  const fit = (o) => (o === 'land' && !landFits() ? 'port' : o);
  const pick = normOrient(store.matchUi.orient);
  if (pick) return { orient: fit(pick), source: 'toggle' };
  const u = urlOrient();
  if (u) return { orient: u, source: 'url' };
  const s = loadOrient();
  if (s) return { orient: fit(s), source: 'saved' };
  return { orient: autoOrient(), source: 'auto' };
}

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
  ui.ultimate = false;
  ui.receiverPick = {};
  ui.pickKey = null;
  ui.gaanpaUsedKey = null;
  ui.lastDecision = null;
  ui.resultShown = false;
}
