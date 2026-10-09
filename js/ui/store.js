// js/ui/store.js — 전역 UI 상태 + localStorage 저장/복구 (모든 접근 try/catch)
// 카드 레슨 시험판 (LESSON_PROTO_PLAN §2.2): 본편(/soccer/)과 같은 origin 을 쓰므로 키 앞머리를 'soccer-lesson.' 으로 나눈다.
// 본편 키('soccer.' 로 시작)는 읽지도 옮기지도 않는다 — 레슨판의 등록 팀 · 도전 기록은 처음에 비어 있다.

// 스프라이트 시험판 (outgame-sprite 브랜치 → /soccer/sprite/, 2026-10-05): 레슨판 (/soccer/lesson/) 과 같은 origin 이라 주소로 앞머리를 가른다
// ('soccer-sprite.') — 두 시험판의 저장이 섞이지 않는다. 주소가 /sprite/ 가 아니면 (레슨판 · 로컬 · 테스트) 지금 그대로 'soccer-lesson.'.
export const SPRITE_SITE = typeof location !== 'undefined' && /\/sprite\//.test(String((location && location.pathname) || ''));
// 육각 오토배틀 시험판 (ingame-hex 브랜치 → /soccer/hex/, 2026-10-09 — docs/HEX_AUTOBATTLE_PLAN.md): 같은 origin 이라 앞머리 'soccer-hex.' 로 가른다
export const HEX_SITE = typeof location !== 'undefined' && /\/hex\//.test(String((location && location.pathname) || ''));
export const STORAGE_PREFIX = HEX_SITE ? 'soccer-hex.' : SPRITE_SITE ? 'soccer-sprite.' : 'soccer-lesson.'; // 'soccer.'로 시작하면 안 된다 (본편 키와 섞이지 않게)
export const KEYS = {
  run: `${STORAGE_PREFIX}run`,
  match: `${STORAGE_PREFIX}match`,
  teams: `${STORAGE_PREFIX}teams`,
  // 도전 모드 (2026-10-01): 런 저장(run · match)과 따로 둔다 — 도전 경기는 런 저장을 건드리지 않는다
  challenge: `${STORAGE_PREFIX}challenge`,           // 진행 기록 { version, teams: { [팀 id]: { cleared, attempts, wins, lastResult, resets } } } (엔진 challenge.normalizeProgress)
  challengeMatch: `${STORAGE_PREFIX}challengeMatch`, // 진행 중인 도전 경기 { version, teamId, stage, attempt, resets, seed, team, match } — 시작 화면 [도전 모드] 가 이어서 한다
  // 계정 저장 (LESSON_PROTO_PLAN §24.7 — 런 밖): 본 외출 이야기 · 만난 코치 { version: 1, stories: { [charId]: 1 ~ 3 }, coachMet: { [supportId]: true } }.
  // 런 저장 삭제 · 다시 하기 · clearRunSaves 는 이 키를 지우지 않는다. 엔진 호출마다 app.js engine() 이 런 진행을 합친다 (lessonEvents.accountMerge).
  account: `${STORAGE_PREFIX}account`,
  // 육각 오토배틀 경기 (H1 · H3 — docs/HEX_AUTOBATTLE_PLAN.md §6.4): 런 경기의 육각 엔진 재생 기록 { version: HEX_SAVE_VERSION, seed, steps, inputs, skipped? }.
  //   상태 전체가 아니라 시드 + step 횟수 + 필살기 입력 기록만 남긴다 (같은 셋업으로 다시 돌리며 입력을 그 step 에 넣으면 그대로 되살아난다). clearRunSaves 가 함께 지운다
  hexMatch: `${STORAGE_PREFIX}hexMatch`,
};
/** KEYS.account 저장 형식 버전 */
export const ACCOUNT_VERSION = 1;
/**
 * 레슨 런 저장본인가 — 엔진 lessonRun.isLessonRunSave 와 같은 검사 (kind "lessonRun" · version 1 ~ 5 · phase 문자열).
 * version 1 ~ 4 는 continueRun 이 엔진 migrateLessonRun 으로 5 로 올린다 (1 은 레슨 · 보상 중이면 못 올린다, §14.15 · §18.7 · §19.13 · §24.10).
 * store 는 엔진을 정적으로 불러오지 않으므로(엔진 로드가 실패해도 시작 화면은 뜬다) 여기 사본을 두고, test/outgame.test.mjs 가 엔진과 같은지 확인한다.
 */
export const LESSON_RUN_KIND = 'lessonRun';
export const LESSON_RUN_VERSION = 5;
export const LESSON_RUN_SAVE_VERSIONS = [1, 2, 3, 4, 5];
export function isLessonRunSave(s) {
  return !!s && typeof s === 'object' && s.kind === LESSON_RUN_KIND && LESSON_RUN_SAVE_VERSIONS.includes(s.version) && typeof s.phase === 'string';
}
/** KEYS.hexMatch 저장 형식 버전 (육각 경기 재생 기록 — saveHexMatch · loadHexMatch). 2 = H3 필살기 입력 기록 inputs (1 은 inputs: [] 로 읽는다) */
export const HEX_SAVE_VERSION = 2;
/** 육각 재생 기록의 필살기 입력 op */
const HEX_INPUT_OPS = ['arm', 'disarm'];
/** KEYS.challengeMatch 저장 형식 버전 */
export const CHALLENGE_MATCH_VERSION = 1;
/** 등록 팀 저장 개수 상한 (addTeam — 넘친 오래된 팀은 지운다) */
export const TEAMS_CAP = 50;

// 경기 화면 URL 파라미터 (테스트·스크린샷용): ?auto=0 → 자동 꺼진 채 시작, ?speed=1|2|4 → 배속. 모듈 로드 시 한 번 읽는다.
// 2.5D 경기 화면 (docs/SPRITE_25D_PLAN.md §4): ?d25=1 → 켬, ?flat=1 (또는 ?d25=0) → 끔 (?flat 이 이긴다). 없으면 스프라이트 · 육각 시험판 (/sprite/ · /hex/) 만 켬.
// 배치 흔들림 (§11 — J1): ?jitter=0 → 끔, ?jitter=1 → 켬 (평면에서도). 없으면 2.5D 모드를 따른다 (isLayoutJitter).
// 육각 경기 화면 (docs/HEX_AUTOBATTLE_PLAN.md §6.2 — H1): ?hex=0 → 끔 (옛 턴제 화면), ?hex=1 → 켬. 없으면 육각 시험판 (/hex/) 만 켬.
//   ?tick=300 ~ 500 (정수, ms) → 육각 경기 한 턴 길이 (1배속 기준). 범위 밖이면 무시 (기본 400 — hexTickMs).
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
    const flat = q.get('flat');
    const d = q.get('d25');
    if (flat === '1' || flat === 'true' || flat === 'on' || d === '0' || d === 'false' || d === 'off') out.d25 = false;
    else if (d === '1' || d === 'true' || d === 'on') out.d25 = true;
    const j = q.get('jitter');
    if (j === '0' || j === 'false' || j === 'off') out.jitter = false;
    else if (j === '1' || j === 'true' || j === 'on') out.jitter = true;
    const hx = q.get('hex');
    if (hx === '0' || hx === 'false' || hx === 'off') out.hex = false;
    else if (hx === '1' || hx === 'true' || hx === 'on') out.hex = true;
    const tk = q.get('tick');
    const tickMs = tk != null && /^\d+$/.test(tk) ? Number(tk) : NaN;
    if (Number.isInteger(tickMs) && tickMs >= 300 && tickMs <= 500) out.tick = tickMs;
    return out;
  } catch (_) {
    return {};
  }
}
const URL_PREFS = urlMatchPrefs();

// 2.5D 경기 화면 모드 (한 곳에서 판단): 주소 → 스프라이트 · 육각 시험판. 테스트 · 로컬 (주소 없음 · /soccer/ · /lesson/) 기본 = 평면.
// jsdom 테스트는 store.js 를 location 이 없을 때 읽으므로 늘 평면 — 2.5D 를 볼 때만 setD25ForTest(true).
const D25_DEFAULT = URL_PREFS.d25 ?? (SPRITE_SITE || HEX_SITE);
let d25On = D25_DEFAULT;
/** 2.5D 경기 화면인가 (screens/match.js 가 화면을 만들 때 한 번 읽는다 — 경기 중에는 바뀌지 않는다) */
export function isD25() {
  return d25On;
}
/** 테스트 전용: 2.5D 모드를 켜고 끈다 (null = 주소 · 사이트로 정한 기본값으로). 다음 경기 화면부터 */
export function setD25ForTest(on) {
  d25On = on == null ? D25_DEFAULT : !!on;
}

// 경기 배치 흔들림 (docs/SPRITE_25D_PLAN.md §11 — J1, 2026-10-06, 되돌릴 수 있음): 선수가 구역 안에서 비트마다 조금 다른 자리에 선다 (layout.js opts.jitter).
// 기본 = 2.5D 모드일 때만 켬 (평면 · 테스트 기본 = 끔 — 예전 자리 그대로). 주소 ?jitter=0 끔 · ?jitter=1 평면에서도 켬 (비교용).
let jitterForTest = null;
/** 경기 배치 흔들림을 켜는가 (screens/match.js 가 화면을 만들 때 한 번 읽는다) */
export function isLayoutJitter() {
  if (jitterForTest != null) return jitterForTest;
  return URL_PREFS.jitter ?? d25On;
}
/** 테스트 전용: 배치 흔들림을 켜고 끈다 (null = 주소 · 2.5D 모드로 정한 기본값으로). 다음 경기 화면부터 */
export function setLayoutJitterForTest(on) {
  jitterForTest = on == null ? null : !!on;
}

// 육각 오토배틀 경기 화면 (docs/HEX_AUTOBATTLE_PLAN.md §6.2 — H1): 런 경기 (phase match) 를 육각 엔진 (js/engine/hexMatch.js) + Pixi 화면으로.
// 기본 = 육각 시험판 (/hex/) 만 켬 — 테스트 · 로컬 (주소 없음 · /soccer/) 은 옛 턴제 화면. 도전 경기는 H5 까지 늘 옛 엔진.
const HEX_MATCH_DEFAULT = URL_PREFS.hex ?? HEX_SITE;
let hexMatchOn = HEX_MATCH_DEFAULT;
/** 런 경기를 육각 경기 화면으로 그리는가 (app.js render 가 phase match 마다 읽는다) */
export function isHexMatch() {
  return hexMatchOn;
}
/** 테스트 전용: 육각 경기 화면을 켜고 끈다 (null = 주소 · 사이트로 정한 기본값으로). 다음 경기 화면부터 */
export function setHexMatchForTest(on) {
  hexMatchOn = on == null ? HEX_MATCH_DEFAULT : !!on;
}
/** 육각 경기 한 턴 길이 (ms, 1배속 기준) — 주소 ?tick=300 ~ 500, 없으면 400 (경기 시계: 300 턴 = 2:00 → 턴당 0.4 초) */
export function hexTickMs() {
  return URL_PREFS.tick ?? 400;
}

export const store = {
  data: null,          // { config, characters, supports, events, skills, relics, opponents, routes, …, challenge, challenge_sample_team }
  screen: 'start',     // 'start' | 'setup' | 'run' | 'challenge'(도전 목록) | 'challengeMatch'(도전 경기) | 'recollection'(회상 — 시작 화면 [회상])
                       //   | 'practice'(연습 경기 — 시작 화면 [⚽ 연습 경기], 늘 육각 경기 화면)
  run: null,           // RunState (엔진 lessonRun.js 소유, kind "lessonRun")
  match: null,         // MatchState (엔진 소유), 경기 중에만 — 도전 경기 중에는 도전 경기 상태 (런 경기는 KEYS.match 에 그대로 있고 이어하기가 다시 읽는다)
                       //   도전 경기를 떠나면(결과 기록 · 포기 · [나가기] · 처음으로) 늘 null 로 비운다
  hexMatch: null,      // 육각 경기 상태 (엔진 hexMatch.js 소유, engine "hex") — 런 경기 중에만, 메모리만 (저장은 KEYS.hexMatch 재생 기록 — 화면이 되살린다)
  practiceMatch: null, // 연습 경기 육각 상태 (화면 'practice' 에서만, 메모리만 — 저장 없음. 런 경기 store.hexMatch 와 따로)
  practiceSeed: null,  // 연습 경기 시드 (시작 · [다시 하기] 마다 새로 — 같은 연습 안에서 다시 그려도 같은 경기)
  // 도전 모드 화면 상태 (메모리만 — 진행 기록 · 진행 중인 경기는 위 KEYS.challenge · KEYS.challengeMatch)
  challenge: {
    teamId: null,      // 고른 팀 (엔진 challenge.teamIdOf)
    stage: null,       // 고른 단계 (미리보기)
    active: null,      // 진행 중인 도전 경기 { teamId, stage, attempt, resets, seed, team, displayName }
    result: null,      // 방금 끝난 도전 결과 (결과 모달) — 닫으면 null
  },
  setup: null,         // 편성 화면 임시 상태 (screens/setup.js initSetup — formation · squad · supportIds · tactics · policy · seed · legends)
                       //   legends = 고른 레전드 (§24.9 — 등록 팀 선수 사본, 2명까지). 편성과 함께 메모리에 남고 [런 시작] 이 createRun 에 넘긴다
  final: null,         // finalizeRun 결과 { rating, registeredTeam, seed, memory } — memory = 결과 화면에서 고른 메모리 카드 { cardId, plus } | null
                       //   (처음엔 감독 추천 manager.recommendMemoryCard, [팀 등록] 이 등록 팀 memoryCard 로 남긴다 — §24.9)
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
  // 레슨 화면 (phase lesson · reward 배경, LESSON_PROTO_PLAN §6.2). 메모리만 — 레슨 상태 자체는 store.run.lesson (호출마다 저장)
  lessonUi: {
    aim: null,          // 조준 모드 (카드 클릭 · Enter — §14.16 대체 조작) { uid, idx: 키보드 후보 번호(-1 = 없음), at: 확정 점 {x,y} | null, playerId | null }. 다시 그려도 남는다
    drag: null,         // 끄는 중 (메모리만) { kind: 'card', uid, at, playerId, over } | { kind: 'tok', id, from: 'field'|'bench', over }
    shownSeq: 0,        // 연출을 마지막으로 보여 준 lesson.seq (새로고침 뒤에는 다시 재생하지 않는다)
    busy: false,        // 연출 재생 중 (입력 무시)
    timer: null,        // 연출 타이머 (setTimeout id; app.js render() 가 지운다)
    gen: 0,             // render() 마다 +1 — 옛 화면의 연출 루프가 스스로 멈춘다
  },
  // 상담 화면: 고른 덱 카드 · 스킬마다 고른 배울 선수 { [skillId]: playerId } (render 뒤에도 남는다, 상담을 끝내면 비운다)
  consultUi: { selectedUid: null, skillPick: {} },
  // 이벤트 결과 카드 (LESSON_PROTO_PLAN §24.13 — 화면 전용, 엔진 단계가 아니다): 방금 고른 이벤트의 state.lastEvent.seq.
  // 값이 있고 store.run.lastEvent.seq 와 같으면 다음 phase 화면 대신 결과 카드를 먼저 그린다 ([계속] = null). 메모리만 — 새로 고침하면 보이지 않는다
  eventUi: { resultSeq: null },
  // 회상 화면 (§24.7): 고른 캐릭터 (메모리만 — 다시 그려도 남는다)
  recollectionUi: { charId: null },
};
// 화면은 인게임·아웃게임 모두 가로 전용 (고정 스테이지 1280×720, js/ui/stage.js) — 방향 상태 · ?orient · 방향 저장값은 없다.

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
/** 저장된 레슨 런 (isLessonRunSave 가 참인 것만 — 그 밖의 저장본은 "저장 없음") */
export function loadRun() {
  const s = lsGet(KEYS.run);
  return isLessonRunSave(s) ? s : null;
}
export function saveMatch(state) { return lsSet(KEYS.match, state ?? null); }
export function loadMatch() { return lsGet(KEYS.match); }
export function clearRunSaves() { lsSet(KEYS.run, null); lsSet(KEYS.match, null); lsSet(KEYS.hexMatch, null); }
/**
 * 육각 경기 재생 기록 쓰기 (KEYS.hexMatch). null = 지운다. 모양 = { version: HEX_SAVE_VERSION, seed, steps, inputs, skipped? } (화면이 만든다)
 *   inputs = [[stepIndex, side, playerId, op], …] — stepIndex 번째 (0 부터) step 에 넣은 필살기 입력 (op 'arm' | 'disarm', 넣은 순서대로)
 * @param {{ version: number, seed: string|number, steps: number, inputs?: Array<[number, string, string, string]>, skipped?: boolean } | null} save
 */
export function saveHexMatch(save) { return lsSet(KEYS.hexMatch, save ?? null); }
/** 재생 기록 입력 한 줄이 맞는 모양인가 ([0 이상 정수, 'home'|'away', 선수 id, 'arm'|'disarm']) */
function isHexInput(x) {
  return Array.isArray(x) && x.length === 4 && Number.isInteger(x[0]) && x[0] >= 0 && (x[1] === 'home' || x[1] === 'away')
    && (typeof x[2] === 'string' || typeof x[2] === 'number') && String(x[2]) !== '' && HEX_INPUT_OPS.includes(x[3]);
}
/**
 * 육각 경기 재생 기록 (없거나 모양 · 버전이 틀리면 null — seed 확인은 화면이 셋업과 맞춰 본다).
 * 판 1 (H1 · H2 — 입력 없음) · inputs 가 없는 판 2 는 inputs: [] 로 읽어 판 2 모양으로 돌려준다.
 * 입력 한 줄이라도 모양이 틀리면 null (다른 경기가 되살아나지 않게).
 * @returns {{ version: number, seed: string|number, steps: number, inputs: Array<[number, string, string, string]>, skipped?: boolean } | null}
 */
export function loadHexMatch() {
  const s = lsGet(KEYS.hexMatch);
  if (!s || typeof s !== 'object' || Array.isArray(s) || (s.version !== HEX_SAVE_VERSION && s.version !== 1)) return null;
  if (!Number.isInteger(s.steps) || s.steps < 0 || s.seed == null) return null;
  if (s.version === 1 || s.inputs === undefined) return { ...s, version: HEX_SAVE_VERSION, inputs: [] };
  if (!Array.isArray(s.inputs) || !s.inputs.every(isHexInput)) return null;
  return s;
}

/**
 * 등록 팀 (최신이 앞 — addTeam). 팀 = lessonRun.finalizeRun().registeredTeam + grade · score · registeredAt
 * + memoryCard { cardId, plus } | null (§24.9 레전드 메모리 카드 — 옛 팀에는 없다 = 메모리 카드 없음).
 */
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
  return !!loadRun();
}

// ---- 계정 저장 (런 밖, §24.7) ----
const isPlainObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
/** 빈 계정 저장 */
export function emptyAccount() { return { version: ACCOUNT_VERSION, stories: {}, coachMet: {} }; }
/**
 * 계정 저장 (KEYS.account) — 읽기에 실패하거나 모양이 틀리면 빈 값 (version 1 · stories · coachMet 객체).
 * 칸 하나가 틀리면 그 칸만 버린다 (이야기 = 1 ~ 3 정수, 코치 = true). 엔진 normalizeAccount 와 같은 범위 (store 는 엔진을 정적으로 불러오지 않는다).
 * @returns {{ version: 1, stories: Record<string, number>, coachMet: Record<string, true> }}
 */
export function loadAccount() {
  const a = lsGet(KEYS.account);
  const out = emptyAccount();
  if (!isPlainObj(a) || (a.version !== undefined && a.version !== ACCOUNT_VERSION)) return out;
  if (isPlainObj(a.stories)) {
    for (const [id, ep] of Object.entries(a.stories)) if (id && Number.isInteger(ep) && ep >= 1) out.stories[id] = Math.min(3, ep);
  }
  if (isPlainObj(a.coachMet)) {
    for (const [id, v] of Object.entries(a.coachMet)) if (id && v === true) out.coachMet[id] = true;
  }
  return out;
}
/** 계정 저장 쓰기 (모양을 loadAccount 와 같게 맞춘다). 실패하면 false */
export function saveAccount(account) {
  const a = isPlainObj(account) ? account : {};
  return lsSet(KEYS.account, {
    version: ACCOUNT_VERSION,
    stories: isPlainObj(a.stories) ? { ...a.stories } : {},
    coachMet: isPlainObj(a.coachMet) ? { ...a.coachMet } : {},
  });
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

/** 레슨 화면 상태 초기화 (새 레슨 · 레슨 밖으로 나갈 때). gen 은 올려서 옛 연출 루프를 멈춘다 */
export function resetLessonUi() {
  const ui = store.lessonUi;
  if (ui.timer) { try { clearTimeout(ui.timer); } catch (_) { /* ignore */ } }
  ui.timer = null;
  ui.busy = false;
  ui.aim = null;
  ui.drag = null;
  ui.shownSeq = 0;
  ui.gen += 1;
}
