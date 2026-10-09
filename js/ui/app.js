// js/ui/app.js — 진입점. 고정 스테이지(1280×720) → 데이터 로드 → 화면 라우팅(render) → 엔진 호출 래퍼/저장
// 카드 레슨 시험판 (LESSON_PROTO_PLAN §6.1): 런 엔진 = js/engine/lessonRun.js (ctx.run), 감독 AI = js/engine/manager.js (ctx.manager).
//   phase: week(주 선택) · lesson(레슨) · reward(레슨 결과 모달) · consult(상담) · prep(경기 전 준비) · event · cardOffer(보상 카드 3택1) · match · relic · route · finished.
//   저장 키는 store.js KEYS ('soccer-lesson.' 앞머리 — 본편 저장과 따로). 레슨 화면은 lessonCall 로 엔진을 직접 부르고 저장만 한다 (render 없음).
// 2026-10-01 도전 모드: 화면 'challenge'(목록 · js/ui/screens/challenge.js) · 'challengeMatch'(경기 — 경기 화면에 경기 모드 훅 ctx.matchMode).
//   진행 기록 = KEYS.challenge, 진행 중인 경기 = KEYS.challengeMatch (store.js). 런 상태 · 런 저장(KEYS.run · KEYS.match)은 건드리지 않는다.
//   새로고침(부트)은 런과 같이 늘 시작 화면 — 진행 중인 도전 경기가 저장돼 있으면 시작 화면 [도전 모드] 가 "이어하기" 로 바뀌고 누르면 그 경기로.
//   경기 중 나가기 = [나가기] (경기는 저장한 채 시작 화면, 기록 없음) · [포기] (기권 패로 기록).
// 2차 (LESSON_PROTO_PLAN §24.13, U3): phase 'cardOffer' (이벤트 "보상 카드 3택1" — 배경 = 주 화면 inert + 3택1 모달), 화면 'recollection' (시작 화면 [회상]).
//   이벤트를 고르면 결과 카드 (store.eventUi.resultSeq — 화면 전용) 를 다음 phase 화면보다 먼저 그린다.
//   계정 저장 (KEYS.account — 본 이야기 · 만난 코치): startRun 이 createRun 에 스냅샷을 넘기고, engine() 이 런을 저장한 뒤 이번 런 진행을 합친다.
//   개발 · 스크린샷용 ?events=on: 불러온 data/lesson.json 의 이벤트 기능 스위치를 모두 켠다 (tools/lesson_scenarios.mjs og_event_* — I1 전에는 데이터가 꺼져 있다).
// 레전드 · 메모리 카드 (§24.9, U5): startRun 이 편성 화면의 레전드 사본을 createRun({ legends }) 에 넘기고,
//   registerTeam({ memory }) 이 결과 화면에서 고른 메모리 카드를 등록 팀 memoryCard 로 남긴다 (이번 런 후보 memoryCardOptions 안에서만).
// 육각 오토배틀 (docs/HEX_AUTOBATTLE_PLAN.md §6.2 — H1): store.isHexMatch() 이면 런 경기 (phase match) 를 육각 경기 화면 (screens/hexMatch.js,
//   엔진 js/engine/hexMatch.js = ctx.hexMatch) 으로 그린다. 육각 상태 = store.hexMatch (메모리) + KEYS.hexMatch (재생 기록) — 런 경기를 비우는 곳마다 함께 비운다.
//   Pixi 는 그 화면이 캔버스를 만들 때만 동적 import — 여기서 닿지 않는다. 도전 경기는 H5 까지 옛 엔진 그대로.
// 연습 경기 (2026-10-09 사용자 요청): 화면 'practice' (시작 화면 [⚽ 연습 경기]) = 기본 선수단 vs 그 거울 사본 (js/ui/practice.js) 을 늘 육각 경기 화면으로
//   (경기 모드 훅 practiceMatchMode — 상태 store.practiceMatch, 저장 없음). 런 · 도전 상태와 저장 (store.run · store.match · store.hexMatch · KEYS.*) 은 건드리지 않는다.
//   [나가기] · 결과 [확인] = 시작 화면, [다시 하기] = 새 시드로 새 경기. 새로고침하면 시작 화면 (기록 없음).
import { mountStage } from './stage.js';
import {
  store, saveRun, loadRun, saveMatch, loadMatch, clearRunSaves, addTeam, resetMatchUi, resetLessonUi, loadTeams, TEAMS_CAP,
  loadChallengeProgress, saveChallengeProgress, loadChallengeMatch, saveChallengeMatch, CHALLENGE_MATCH_VERSION,
  loadAccount, saveAccount, SPRITE_SITE, HEX_SITE, isHexMatch, saveHexMatch,
} from './store.js';
import { h, toast, closeOverlays } from './dom.js';
import { renderStart } from './screens/start.js';
import { renderSetup, initSetup } from './screens/setup.js';
import { renderWeek } from './screens/week.js';
import { renderLesson } from './screens/lesson.js';
import { renderRewardModal } from './screens/reward.js';
import { renderConsult } from './screens/consult.js';
import { renderPrep } from './screens/prep.js';
import { renderEventModal, renderEventResult } from './screens/event.js';
import { renderCardOfferModal } from './screens/cardOffer.js';
import { renderRecollection } from './screens/recollection.js';
import { renderMatch } from './screens/match.js';
import { renderHexMatch, hexViewDebug } from './screens/hexMatch.js';
import { renderRelicModal } from './screens/relic.js';
import { renderRoute } from './screens/route.js';
import { renderResult } from './screens/result.js';
import { renderChallenge } from './screens/challenge.js';
import { practiceSetup } from './practice.js';
import { registerHexServiceWorker } from './swRegister.js';

// 2차 (LESSON_PROTO_PLAN §24.3.1 · §24.12): 레슨 런 이벤트 7개 (= lessonEvents.EVENT_FILES — test/lessonContent 가 같은 목록인지 본다) · 그림 목록
// 스프라이트 목록 (sprites — docs/SPRITE_25D_PLAN.md §2): 2.5D 경기 화면의 선 그림 { version, height, chars: { id: { w, h, footX, v } } }
const EVENT_FILES = ['lesson_ev_surprise', 'lesson_ev_week', 'lesson_ev_story', 'lesson_ev_fixed', 'lesson_ev_new_a', 'lesson_ev_new_b', 'lesson_ev_coach'];
const DATA_FILES = ['config', 'characters', 'supports', 'skills', 'events', 'relics', 'opponents', 'routes', 'traits', 'combos',
  'challenge', 'challenge_sample_team', 'cards', 'lesson', 'policies', 'sprites', ...EVENT_FILES, 'portraits'];
// v0.3: 없어도 엔진(DEFAULT_TRAITS/DEFAULT_COMBOS)·화면(TRAIT_LABELS)이 같은 기본값으로 동작 → 404 면 건너뛴다
// 도전 모드: challenge 가 없으면 도전 모드만 못 연다, 샘플 팀이 없으면 팀 목록에서 빠진다
// 이벤트 파일 · 그림 목록 (portraits): 없으면 이벤트 없음 · 글자 얼굴로 동작한다
// 스프라이트 목록 (sprites): 없으면 2.5D 경기 화면의 선수가 모두 얼굴 원 스탠디 (평면 경기 화면은 쓰지 않는다)
const OPTIONAL_FILES = new Set(['traits', 'combos', 'challenge', 'challenge_sample_team', 'sprites', ...EVENT_FILES, 'portraits']);

const REQUIRED_FILE_COUNT = DATA_FILES.filter((n) => !OPTIONAL_FILES.has(n)).length;

// 엔진 모듈 (계약: js/engine/lessonRun.js = ctx.run, js/engine/match.js). 로드 실패 시에도 화면은 뜨도록 동적 import.
let run = null;
let match = null;
let manager = null; // js/engine/manager.js (감독 AI — 추천 배지 · 자리표시 화면의 [추천대로])
let challenge = null; // js/engine/challenge.js (도전 모드 — 없으면 도전 모드만 못 연다)
let lessonEvents = null; // js/engine/lessonEvents.js (회상 — storyList · eventById, §24.7)
let lessonText = null; // js/engine/lessonText.js (회상 본문 — fillText · pickText)
let hexMatch = null; // js/engine/hexMatch.js (육각 오토배틀 경기 엔진 — 없으면 런 경기도 옛 화면)

function errMsg(e) {
  if (!e) return '알 수 없는 오류';
  if (typeof e === 'string') return e;
  return e.message || String(e);
}

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (name) => {
    const res = await fetch(`./data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) {
      if (OPTIONAL_FILES.has(name) && res.status === 404) return null;
      throw new Error(`데이터 로드 실패: data/${name}.json (${res.status})`);
    }
    try {
      return [name, await res.json()];
    } catch (e) {
      throw new Error(`data/${name}.json 파싱 실패: ${errMsg(e)}`);
    }
  }));
  return Object.fromEntries(entries.filter(Boolean));
}

// ---- 엔진 호출 래퍼 ----
function safe(fn) {
  try {
    return fn();
  } catch (e) {
    console.error(e);
    toast(errMsg(e), 'error');
    return undefined;
  }
}
function engine(fn) {
  const r = safe(fn);
  if (store.run) {
    saveRun(store.run);
    syncAccount();
  }
  return r;
}

/**
 * 계정 저장에 이번 런 진행 (본 이야기 화 · 코치 첫 만남) 을 합친다 (§24.7 — lessonEvents.accountMerge, 멱등). 바뀐 것이 있을 때만 쓴다.
 * 이야기는 고른 순간 (resolveEvent) 에 본 것으로 세므로 엔진 호출마다 부른다. 엔진이 없거나 실패해도 런은 그대로 진행한다.
 */
function syncAccount() {
  if (!run || typeof run.accountMerge !== 'function' || !store.run) return;
  try {
    const before = loadAccount();
    const after = run.accountMerge(before, store.run);
    if (JSON.stringify(after) !== JSON.stringify(before)) saveAccount(after);
  } catch (e) {
    console.warn('계정 저장을 합치지 못했습니다', e);
  }
}

/** 개발 · 스크린샷용 ?events=on (또는 1): 이벤트 기능 스위치를 모두 켠다 */
function eventsParam() {
  try {
    const v = new URLSearchParams(globalThis.location?.search || '').get('events');
    return v === 'on' || v === '1';
  } catch (_) {
    return false;
  }
}

function newLogLines(before) {
  const log = Array.isArray(store.run?.log) ? store.run.log : [];
  return log.slice(before).map((l) => l?.text).filter(Boolean);
}
function announce(lines) {
  if (!lines.length) return;
  const text = lines.join(' / ');
  toast(text.length > 160 ? `${text.slice(0, 160)}…` : text, 'info', 3500);
}

// ---- 도전 모드 도우미 (규칙 · 진행 계산은 엔진 challenge.js, 여기는 저장 · 화면 전환만) ----
/** 진행 기록 (localStorage → 엔진 정리본). 매번 새로 읽는다 */
function challengeProgress() {
  return challenge.normalizeProgress(loadChallengeProgress());
}

/** 진행 중인 도전 경기 저장 (경기 화면 훅 save). null = 지움 */
function persistChallengeMatch(ms) {
  const a = store.challenge.active;
  if (!a || !ms) return saveChallengeMatch(null);
  return saveChallengeMatch({
    version: CHALLENGE_MATCH_VERSION, teamId: a.teamId, stage: a.stage, attempt: a.attempt, resets: a.resets, seed: a.seed, team: a.team, match: ms,
  });
}

/**
 * 저장된 도전 경기(KEYS.challengeMatch) 살펴보기 — 저장은 바꾸지 않는다.
 * @returns {{ status: 'none' } | { status: 'unknown' } | { status: 'invalid' } | { status: 'ok', active: object, match: object|null }}
 *   none = 저장 없음, unknown = 엔진 · 도전 데이터가 없어 판단할 수 없음 (저장본은 그대로 둔다),
 *   invalid = 쓸 수 없는 저장본 (형식 · 단계 · 시드가 안 맞음, 이미 기록된 도전 번호), ok = 이어서 할 수 있음
 */
function peekChallengeMatch() {
  const s = loadChallengeMatch();
  if (!s) return { status: 'none' };
  if (!challenge || !match || !store.data?.challenge) return { status: 'unknown' };
  try {
    if (Number(s.version) !== CHALLENGE_MATCH_VERSION || !Array.isArray(s.team?.players)) return { status: 'invalid' };
    const def = challenge.getStage(store.data, s.stage);
    const attempt = Math.floor(Number(s.attempt));
    const teamId = challenge.teamIdOf(s.team);
    const progress = challengeProgress();
    const resets = challenge.teamProgress(progress, teamId).resets; // 진행 초기화 횟수 = 시드 일부 (초기화 전 경기 저장본은 시드가 달라 버린다)
    const seed = challenge.challengeSeed(teamId, def.stage, attempt, resets);
    const counted = challenge.nextAttempt(progress, teamId, def.stage) > attempt; // 이미 센 도전 = 다시 세지 않는다
    const matchOk = s.match == null || (typeof s.match === 'object' && s.match.seed === seed);
    if (!(attempt >= 1) || (s.teamId && s.teamId !== teamId) || counted || !matchOk) return { status: 'invalid' };
    return {
      status: 'ok',
      active: { teamId, stage: def.stage, attempt, resets, seed, team: s.team, displayName: challenge.stageDisplayName(store.data, def.stage) },
      match: s.match || null,
    };
  } catch (e) {
    console.warn('도전 경기 저장본을 읽지 못했습니다', e);
    return { status: 'invalid' };
  }
}

/** 시작 화면 [도전 모드] 버튼용: 이어서 할 도전 경기 { displayName, stage, attempt, finished } 또는 null */
function pendingChallenge() {
  const p = peekChallengeMatch();
  if (p.status !== 'ok') return null;
  const { displayName, stage, attempt } = p.active;
  return { displayName, stage, attempt, finished: !!p.match?.finished };
}

/**
 * 저장된 도전 경기 → store 로 복원하고 화면을 'challengeMatch' 로. 없거나 쓸 수 없으면 false — 쓸 수 없는 저장본(invalid)만 지운다
 * (엔진 · data/challenge.json 이 없어 판단할 수 없을 때는 그대로 둔다). 런 상태(store.run)는 그대로 둔다.
 */
function restoreChallengeMatch() {
  const p = peekChallengeMatch();
  if (p.status === 'invalid') saveChallengeMatch(null);
  if (p.status !== 'ok') return false;
  const active = p.active;
  store.challenge.active = active;
  store.challenge.teamId = active.teamId;
  store.challenge.stage = active.stage;
  store.challenge.result = null;
  store.match = p.match; // 없으면 경기 화면이 셋업으로 같은 시드의 경기를 만든다
  resetMatchUi();
  store.screen = 'challengeMatch';
  return true;
}

/** 도전 경기 화면의 경기 모드 훅 (js/ui/screens/match.js renderMatch 머리 주석) */
function challengeMatchMode() {
  const a = store.challenge.active;
  return {
    label: `도전 ${a.stage}단계`,
    getSetup: () => challenge.challengeSetup(a.team, a.stage, a.attempt, store.data, { resets: a.resets }),
    save: persistChallengeMatch,
    onFinish: (result) => actions.finishChallengeMatch(result),
    exits: [
      { label: '나가기', title: '경기를 저장한 채 시작 화면으로 — [도전 모드]를 누르면 이어서 합니다 (기록 없음)', onClick: () => actions.suspendChallenge() },
      { label: '포기', title: '도전 포기 — 이번 도전은 기권 패로 기록됩니다', danger: true, onClick: () => actions.forfeitChallenge() },
    ],
    discard: { label: '도전 경기 버리기', title: '고장 난 도전 경기 저장본을 기록 없이 지웁니다', onClick: () => actions.discardChallengeMatch() },
  };
}

/** 연습 경기 시드 (연습마다 새로 — 재현할 일이 없는 화면 전용 시드) */
function newPracticeSeed() {
  return `practice-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** 연습 경기를 비우고 시작 화면으로 ([나가기] · 결과 [확인] · 처음으로) */
function leavePractice() {
  store.practiceMatch = null;
  store.practiceSeed = null;
  store.matchUi.resultShown = false;
  store.screen = 'start';
}

/** 연습 경기 화면의 경기 모드 훅 (js/ui/screens/hexMatch.js 머리 주석) — 저장 없음, 상태 = store.practiceMatch */
function practiceMatchMode() {
  if (!store.practiceSeed) store.practiceSeed = newPracticeSeed();
  const seed = store.practiceSeed;
  return {
    label: '연습 경기',
    getSetup: () => practiceSetup(run, store.data, seed),
    stateKey: 'practiceMatch',
    save: null,
    onFinish: () => actions.leavePractice(),
    exits: [{ label: '나가기', title: '연습 경기를 끝내고 시작 화면으로 (기록 없음)', onClick: () => actions.leavePractice() }],
    again: { label: '다시 하기', onClick: () => actions.againPractice() },
  };
}

/**
 * 도전 경기를 정리하고 화면 전환 (store.match 는 도전 경기였다 — 런 경기는 KEYS.match 에 그대로, 이어하기가 다시 읽는다).
 * keepSave = true 면 KEYS.challengeMatch 를 남긴다 ([나가기] · 처음으로 — [도전 모드] 가 이어서 한다).
 */
function leaveChallengeMatch(screen = 'challenge', keepSave = false) {
  if (!keepSave) saveChallengeMatch(null);
  store.challenge.active = null;
  store.match = null;
  resetMatchUi();
  store.screen = screen;
}

/**
 * 진행 기록 한 판 (엔진 recordResult — 같은 도전 번호는 한 번만 센다). 엔진 오류면 undefined.
 * saved = false: localStorage 쓰기 실패 → 기록되지 않았다. 부르는 쪽은 경기 화면 · 저장본을 그대로 두어 다시 시도하게 한다.
 */
function recordChallenge(a, result) {
  const before = challengeProgress();
  const prev = challenge.teamProgress(before, a.teamId);
  const next = safe(() => challenge.recordResult(before, a.teamId, a.stage, { ...result, attempt: a.attempt, at: new Date().toISOString() }));
  if (next === undefined) return undefined;
  const counted = next !== before;
  const saved = !counted || saveChallengeProgress(next);
  if (!saved) toast('도전 기록을 저장하지 못했습니다 (localStorage) — 경기는 그대로 두었습니다. 다시 시도하세요.', 'error', 5000);
  return { prev, tp: challenge.teamProgress(next, a.teamId), counted, saved };
}

/** 등록 팀 상한(TEAMS_CAP)에 밀려난 팀의 도전 진행 기록 지우기 (남은 팀과 id 가 같으면 둔다). 도전 모듈이 없으면 건너뛴다 */
function forgetDroppedTeams(dropped, kept) {
  if (!challenge || !dropped.length) return;
  const idOf = (t) => { try { return challenge.teamIdOf(t); } catch (_) { return null; } };
  try {
    const keep = new Set(kept.map(idOf));
    const ids = dropped.map(idOf).filter((id) => id && !keep.has(id));
    const before = challengeProgress();
    if (!ids.some((id) => before.teams[id])) return;
    saveChallengeProgress(challenge.forgetTeams(before, ids));
  } catch (e) {
    console.warn('밀려난 팀의 도전 진행 기록을 정리하지 못했습니다', e);
  }
}

// ---- 액션 ----
const actions = {
  goto(screen) { store.screen = screen; render(); },

  newRun(seedPrefill = '') {
    store.setup = initSetup(store.data, seedPrefill);
    store.screen = 'setup';
    render();
  },

  continueRun() {
    const s = loadRun(); // 레슨 런 저장본만 (store.isLessonRunSave — version 1 ~ 5)
    if (!s) return toast('저장된 런이 없습니다.');
    if (run) {
      safe(() => run.migrateLessonRun(s, store.data)); // version 1 → 2 → 3 → 4 → 5 (1 은 레슨 · 보상 중이면 그대로, §14.15 · §18.7 · §19.13 · §24.10)
      if (!run.isLessonRun(s)) {
        const oldLesson = s.version === 1;
        clearRunSaves(); // "저장 없음"
        store.hexMatch = null;
        render();
        return oldLesson ? toast('구역 방식으로 바뀌어 진행 중인 레슨은 이어 할 수 없습니다', 'info', 5000) : toast('저장된 런이 없습니다.');
      }
    }
    store.run = s;
    store.final = null;
    store.registered = false;
    store.eventUi.resultSeq = null; // 결과 카드는 화면 전용 — 이어하기에는 없다
    const m = loadMatch();
    const matchOk = m && s.phase === 'match' && (s.pendingMatch?.seed == null || m.seed === s.pendingMatch.seed);
    store.match = matchOk ? m : null;
    store.hexMatch = null; // 육각 경기는 화면이 자기 재생 기록 (KEYS.hexMatch) 으로 되살린다
    resetMatchUi();
    resetLessonUi();
    store.screen = 'run';
    render();
  },

  discardSave() {
    clearRunSaves(); // 런 · 경기 저장만 (계정 저장 KEYS.account 는 남는다 — §24.7)
    store.run = null;
    store.match = null;
    store.hexMatch = null;
    store.final = null;
    store.screen = 'start';
    render();
  },

  resetToStart() {
    // 도전 경기 화면(오류 화면 [처음으로])에서: 도전 경기 메모리만 비우고 저장본은 남긴다 ([도전 모드] 가 이어서 한다)
    if (store.screen === 'challengeMatch') leaveChallengeMatch('start', true);
    if (store.screen === 'practice') leavePractice();
    store.screen = 'start';
    render();
  },

  /**
   * 새 런 (lessonRun.createRun). legends = 편성 화면이 고른 레전드 사본 [{ teamId, teamName, charId, name, memoryCard }] (§24.9 — 2명까지,
   * 엔진이 검사하고 팀마다 메모리 카드 1장을 시작 덱에 넣는다). 없거나 빈 배열이면 레전드 없는 런.
   */
  startRun({ squad, formation, supportIds, tactics, policy, seed, legends }) {
    if (!run) return toast('엔진 모듈(lessonRun.js)이 로드되지 않았습니다.');
    // 계정 스냅샷 (§24.7 — 본 이야기 · 만난 코치): 런 안의 이야기 다음 화 · 코치 첫 만남 건너뛰기에 쓴다
    const account = loadAccount();
    const legendList = Array.isArray(legends) ? legends.map((l) => ({
      teamId: l?.teamId, teamName: l?.teamName, charId: l?.charId, name: l?.name,
      memoryCard: l?.memoryCard ? { cardId: l.memoryCard.cardId, plus: l.memoryCard.plus === true } : null,
    })) : [];
    const st = safe(() => run.createRun({ data: store.data, seed, squad, formation, supportIds, tactics, policy, account, legends: legendList }));
    if (!st) return;
    store.run = st;
    store.match = null;
    store.hexMatch = null;
    store.final = null;
    store.registered = false;
    store.eventUi.resultSeq = null;
    resetMatchUi();
    resetLessonUi();
    saveRun(st);
    saveMatch(null);
    saveHexMatch(null);
    store.screen = 'run';
    render();
  },

  /** 주 행동 (lessonRun.applyWeekAction): lesson · rest · outing · meeting · consult · friendly */
  weekAction(action) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.applyWeekAction(store.run, store.data, action));
    if (r !== undefined) {
      if (store.run?.phase === 'lesson') resetLessonUi(); // 새 레슨 = 선택 · 연출 표시 초기화
      if (store.run?.phase === 'consult') { store.consultUi.selectedUid = null; store.consultUi.skillPick = {}; } // 새 상담 = 선택 없음
      announce(newLogLines(before));
    }
    render();
  },

  /**
   * 레슨 화면 전용: 엔진 호출 1번(playCard · benchPlayer · endLessonTurn) + 저장만 한다 (render 없음 — 레슨 화면이 연출을 이어 그린다).
   * @param {'playCard'|'benchPlayer'|'endLessonTurn'} fnName
   * @returns {object|undefined} 엔진 반환값 (오류면 undefined + 토스트)
   */
  lessonCall(fnName, args) {
    if (!run || typeof run[fnName] !== 'function') { toast(`레슨 엔진 함수가 없습니다: ${fnName}`); return undefined; }
    return engine(() => run[fnName](store.run, store.data, args));
  },

  /**
   * 레슨 깜짝 이벤트 선택지 (lessonRun.resolveSurprise { choice } — §24.8, U4). 레슨 화면 말풍선이 부른다.
   * lessonCall 과 같다: 엔진 호출 1번 + 저장 (오류면 토스트 · undefined), render 없음 — 레슨 화면이 결과 줄 · 다음 턴 연출을 이어 그리고,
   * 점수가 퍼펙트에 닿아 레슨이 끝났으면 연출 뒤 ctx.render() 로 보상 모달.
   * @param {number} choice  선택지 번호 (0 · 1)
   * @returns {object|undefined} 엔진 반환값 (오류면 undefined)
   */
  resolveSurprise(choice) {
    if (!run || typeof run.resolveSurprise !== 'function') { toast('레슨 엔진 함수가 없습니다: resolveSurprise'); return undefined; }
    return engine(() => run.resolveSurprise(store.run, store.data, { choice }));
  },

  /** 레슨 결과 모달 [확인] (lessonRun.resolveReward { pick, upgradeUid }) */
  resolveReward(args) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.resolveReward(store.run, store.data, args || {}));
    if (r !== undefined) { resetLessonUi(); announce(newLogLines(before)); }
    render();
  },

  /** 보상 모달 코치 수업 1개 (lessonRun.resolveTeach { playerId, replaceSkillId } — §18.6). phase 는 reward 그대로 → 모달을 다시 그린다 */
  resolveTeach(args) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.resolveTeach(store.run, store.data, args || {}));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  /** 상담 행동 1개 (buy · upgrade · delete · skill) — 행동마다 저장 */
  consultAction(op) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.consultAction(store.run, store.data, op));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  /**
   * 패시브 사기 (L48 — lessonRun.buyPassive { skillId, playerId }, phase 주 · 상담 · 경기 전 준비). 저장 · 오류 토스트는 engine().
   * render: false = 다시 그리지 않는다 (패시브 상점 모달이 자기 내용만 다시 그린다 — 경기 전 준비의 편집 중 배치를 지키려고).
   * @returns {boolean} 샀으면 true
   */
  buyPassive(args, { render: rerender = true } = {}) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.buyPassive(store.run, store.data, args || {}));
    if (r !== undefined) announce(newLogLines(before));
    if (rerender) render();
    return r !== undefined;
  },

  endConsult() {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.endConsult(store.run, store.data));
    if (r !== undefined) { store.consultUi.selectedUid = null; store.consultUi.skillPick = {}; announce(newLogLines(before)); }
    render();
  },

  /** 경기 전 준비 [경기 시작] (lessonRun.confirmPrep { tactics, formation, swaps }) */
  confirmPrep(args) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.confirmPrep(store.run, store.data, args || {}));
    if (r !== undefined) { resetMatchUi(); announce(newLogLines(before)); }
    render();
  },

  /**
   * 이벤트 선택지 (lessonRun.resolveEvent — 고르는 선택지면 { uid } = 고른 덱 카드, §24.5.3).
   * 고르면 결과 카드 (state.lastEvent) 를 다음 phase 화면보다 먼저 보여 준다 (store.eventUi.resultSeq — 화면 전용).
   * 결과는 결과 카드가 보여 주므로 토스트를 띄우지 않는다.
   */
  resolveEvent(choiceIndex, opts = {}) {
    const uid = opts && opts.uid != null ? opts.uid : undefined;
    const r = engine(() => run.resolveEvent(store.run, store.data, choiceIndex, uid === undefined ? {} : { uid }));
    if (r !== undefined) {
      const seq = store.run?.lastEvent?.seq;
      store.eventUi.resultSeq = seq == null ? null : seq;
    }
    render();
  },

  /** 이벤트 결과 카드 [계속] → 지금 phase 의 화면 (다음 이벤트 · 3택1 · 유물 · 주 …) */
  closeEventResult() {
    store.eventUi.resultSeq = null;
    render();
  },

  /** 보상 카드 3택1 (phase cardOffer — lessonRun.resolveCardOffer { pick }: 0 ~ 2, null = 건너뛰기) */
  resolveCardOffer(args) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.resolveCardOffer(store.run, store.data, args || {}));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  /** 시작 화면 [회상] → 회상 화면 (외출 이야기 다시 읽기, §24.7) */
  openRecollection() {
    store.screen = 'recollection';
    render();
  },

  // ---- 연습 경기 (런 · 도전 상태와 저장은 건드리지 않는다) ----
  /** 시작 화면 [⚽ 연습 경기] → 새 시드로 기본 선수단 vs 거울 사본 육각 경기 */
  openPractice() {
    store.practiceSeed = newPracticeSeed();
    store.practiceMatch = null;
    store.matchUi.resultShown = false;
    store.screen = 'practice';
    render();
  },

  /** 연습 경기 결과 [다시 하기]: 새 시드 · 새 경기 */
  againPractice() {
    actions.openPractice();
  },

  /** 연습 경기 [나가기] · 결과 [확인]: 상태를 비우고 시작 화면 */
  leavePractice() {
    leavePractice();
    render();
  },

  chooseRelic(relicId) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.chooseRelic(store.run, store.data, relicId));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  chooseRoute(routeId) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.chooseRoute(store.run, store.data, routeId));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  finishMatch(result) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.finishMatch(store.run, store.data, result));
    if (r === undefined) { render(); return; } // 실패 시 경기 상태 유지 → 다시 시도 가능
    store.match = null;
    saveMatch(null);
    store.hexMatch = null;
    saveHexMatch(null);
    resetMatchUi();
    announce(newLogLines(before));
    render();
  },

  /**
   * 결과 화면 [팀 등록]. memory = 남길 메모리 카드 { cardId, plus } (§24.9 — 결과 화면 고르기 줄, 처음엔 감독 추천) · null = 남기지 않음.
   * 주지 않으면 결과 화면이 고른 store.final.memory. 이번 런 후보 (lessonRun.memoryCardOptions) 에 없는 카드는 남기지 않는다 (안내 토스트).
   * 등록 팀에 memoryCard { cardId, plus } | null 로 남는다 — 다음 런 편성에서 이 팀 선수를 레전드로 데려가면 시작 덱에 들어간다.
   */
  registerTeam({ memory } = {}) {
    const team = store.final?.registeredTeam;
    if (!team) return toast('등록할 팀 정보가 없습니다.');
    const rating = store.final.rating || store.run?.rating || team.rating || {};
    const want = memory !== undefined ? memory : store.final.memory;
    let memoryCard = null;
    if (want && typeof want === 'object' && typeof run?.memoryCardOptions === 'function') {
      const opts = safe(() => run.memoryCardOptions(store.run, store.data)) || [];
      const hit = opts.find((o) => o.cardId === want.cardId && o.plus === (want.plus === true));
      if (hit) memoryCard = { cardId: hit.cardId, plus: hit.plus };
      else toast('메모리 카드를 이번 런 덱에서 찾지 못해 카드 없이 등록합니다.', 'info', 3500);
    }
    const all = addTeam({
      ...team,
      memoryCard, // 레전드 메모리 카드 (§24.9 — 옛 등록 팀에는 없다)
      grade: rating.cappedGrade ?? rating.grade ?? '-',
      score: rating.score ?? null,
      registeredAt: new Date().toISOString(),
    });
    forgetDroppedTeams(all.slice(TEAMS_CAP), all.slice(0, TEAMS_CAP)); // 도전 모드: 상한에 밀려난 팀의 진행 기록 정리
    store.registered = true;
    toast('팀을 등록했습니다.', 'good', 2500);
    render();
  },

  replay(seed) {
    clearRunSaves(); // 계정 저장은 남는다 (§24.7)
    store.eventUi.resultSeq = null;
    store.run = null;
    store.match = null;
    store.hexMatch = null;
    store.final = null;
    store.registered = false;
    resetMatchUi();
    resetLessonUi();
    actions.newRun(seed || '');
  },

  // ---- 도전 모드 ----
  /** 시작 화면 [도전 모드]: 진행 중인 도전 경기가 있으면 그 경기로, 아니면 도전 목록 */
  openChallenge() {
    if (!challenge || !match) return toast('도전 모드 엔진 모듈(challenge.js)을 불러오지 못했습니다.');
    if (!store.data?.challenge) return toast('도전 모드 데이터(data/challenge.json)가 없습니다.');
    if (restoreChallengeMatch()) { render(); return; }
    store.challenge.result = null;
    store.screen = 'challenge';
    render();
  },

  selectChallengeTeam(teamId) {
    if (store.challenge.teamId !== teamId) store.challenge.stage = null; // 새 팀 = 그 팀의 열린 가장 높은 단계부터
    store.challenge.teamId = teamId;
    render();
  },

  selectChallengeStage(stage) {
    store.challenge.stage = Number(stage);
    render();
  },

  /** n 단계 도전 시작: 다음 도전 번호 → 셋업 확인 → 경기 화면 (경기는 경기 화면이 셋업으로 만들고 KEYS.challengeMatch 에 저장) */
  startChallenge(teamId, stage) {
    if (!challenge || !match) return toast('도전 모드 엔진 모듈을 불러오지 못했습니다.');
    const entry = safe(() => challenge.listChallengeTeams(loadTeams(), store.data))?.find((t) => t.teamId === teamId);
    if (!entry) return toast('팀을 찾을 수 없습니다.');
    const progress = challengeProgress();
    if (!challenge.isUnlocked(progress, teamId, stage)) return toast(`${stage}단계는 아직 잠겨 있습니다.`);
    const attempt = challenge.nextAttempt(progress, teamId, stage);
    const resets = challenge.teamProgress(progress, teamId).resets; // 진행 초기화 횟수 → 시드 (초기화 뒤 1회차는 새 경기)
    const setup = safe(() => challenge.challengeSetup(entry.team, stage, attempt, store.data, { resets })); // 고장 난 팀이면 화면을 바꾸지 않는다
    if (!setup) return;
    store.challenge.active = {
      teamId, stage: setup.stage, attempt, resets: setup.resets, seed: setup.seed, team: entry.team, displayName: setup.displayName,
    };
    store.challenge.teamId = teamId;
    store.challenge.stage = setup.stage;
    store.challenge.result = null;
    store.match = null;
    resetMatchUi();
    store.screen = 'challengeMatch';
    render();
  },

  /** 경기 결과 [확인] (경기 화면 훅 onFinish): 진행 기록 1회 → 저장 경기 지움 → 도전 목록 + 결과 모달 */
  finishChallengeMatch(result) {
    const a = store.challenge.active;
    if (!a || !challenge) { leaveChallengeMatch(); render(); return; }
    const rec = recordChallenge(a, result || {});
    // 엔진 오류 · 기록 저장 실패: 경기 상태 · KEYS.challengeMatch 를 그대로 두고 경기 화면을 다시 그린다 → 결과 모달 [확인] 으로 다시 시도
    if (rec === undefined || !rec.saved) { render(); return; }
    const ms = store.match || {};
    const win = result?.winner === 'home';
    const total = challenge.stageCount(store.data);
    const mvpId = result?.stats?.home?.mvpId ?? ms.stats?.home?.mvpId;
    const info = safe(() => challenge.getStage(store.data, a.stage));
    store.challenge.result = {
      teamId: a.teamId,
      stage: a.stage,
      attempt: a.attempt,
      displayName: a.displayName,
      title: info?.title ?? '',
      win,
      homeGoals: result?.homeGoals ?? ms.score?.home ?? 0,
      awayGoals: result?.awayGoals ?? ms.score?.away ?? 0,
      penalties: result?.penalties ?? null,
      homeName: ms.home?.name ?? null,
      awayName: ms.away?.name ?? null,
      mvp: ms.home?.players?.find?.((p) => p.id === mvpId)?.name ?? null,
      firstClear: win && rec.prev.cleared < a.stage,
      counted: rec.counted,
      wins: rec.tp.wins[a.stage] || 0,
      attempts: rec.tp.attempts[a.stage] || 0,
      nextName: a.stage < total ? safe(() => challenge.stageDisplayName(store.data, a.stage + 1)) : null,
    };
    store.challenge.stage = win && a.stage < total ? a.stage + 1 : a.stage; // 결과를 닫으면 사다리는 다음에 할 단계
    leaveChallengeMatch();
    render();
  },

  /** 경기 중 [포기]: 기권 패로 기록 (지금 점수 · forfeit) → 도전 목록. 이미 끝난 경기면 결과 [확인] 과 같다 */
  forfeitChallenge() {
    const a = store.challenge.active;
    if (!a || !challenge) { leaveChallengeMatch(); render(); return; }
    const ms = store.match;
    if (ms && safe(() => match.isFinished(ms)) === true) {
      const r = safe(() => match.getResult(ms));
      if (r) { actions.finishChallengeMatch(r); return; }
    }
    if (!confirm(`${a.displayName} 도전을 포기할까요?\n이번 도전(${a.attempt}회차)은 기권 패로 기록됩니다.`)) return;
    const rec = recordChallenge(a, { forfeit: true, win: false, homeGoals: ms?.score?.home ?? 0, awayGoals: ms?.score?.away ?? 0 });
    if (rec === undefined || !rec.saved) return; // 기록 못 함 → 경기 그대로 (토스트 표시됨)
    store.challenge.result = null;
    leaveChallengeMatch();
    toast(`${a.stage}단계 도전을 포기했습니다 — 기권 패로 기록`, 'info', 3000);
    render();
  },

  /** 경기 중 [나가기]: 기록 없이 시작 화면으로. 경기는 KEYS.challengeMatch 에 남는다 (매 비트 저장) → [도전 모드] 가 이어서 한다 */
  suspendChallenge() {
    if (!store.challenge.active) { leaveChallengeMatch(); render(); return; }
    leaveChallengeMatch('start', true);
    toast('도전 경기를 저장했습니다 — [도전 모드]를 누르면 이어서 합니다.', 'info', 3000);
    render();
  },

  /** 오류 화면 [도전 경기 버리기]: 고장 난 도전 경기 저장본을 기록 없이 지우고 도전 목록으로 (다시 도전하면 같은 회차를 처음부터) */
  discardChallengeMatch() {
    if (!confirm('진행 중인 도전 경기를 버릴까요?\n기록은 남지 않고, 다시 도전하면 같은 회차를 처음부터 시작합니다.')) return;
    leaveChallengeMatch('challenge');
    render();
  },

  /** 고른 팀의 진행 기록 지우기 (확인 후). 초기화 횟수는 남아 시드에 섞인다 → 다시 도전하면 초기화 전과 다른 새 경기 */
  resetChallenge(teamId) {
    if (!challenge || !teamId) return;
    if (!confirm('이 팀의 도전 진행 기록(클리어 · 도전 · 승리)을 모두 지울까요?\n1단계부터 다시 시작하며, 경기는 초기화 전과 다른 새 경기로 치릅니다.')) return;
    saveChallengeProgress(challenge.resetProgress(challengeProgress(), teamId));
    store.challenge.stage = null;
    store.challenge.result = null;
    toast('도전 진행 기록을 초기화했습니다.', 'info', 2500);
    render();
  },

  closeChallengeResult() {
    store.challenge.result = null;
    render();
  },
};

function makeCtx() {
  return {
    store,
    data: store.data,
    run,
    match,
    hexMatch, // 육각 오토배틀 경기 엔진 (H1 — 없으면 null)
    manager,
    challenge,
    lessonEvents, // 회상 (storyList · eventById) — 없으면 null
    lessonText, // 회상 본문 (fillText · pickText) — 없으면 null
    loadAccount, // 계정 저장 (회상 · 시작 화면)
    pendingChallenge, // 시작 화면 [도전 모드]: 이어서 할 도전 경기 (없으면 null)
    render,
    safe,
    engine,
    actions,
    thresholds: store.data?.config?.rating?.thresholds,
  };
}

function errorPanel(e, extra) {
  // 도전 경기 화면에서 난 오류: 런 [저장 삭제] 대신 도전 경기 저장본을 버리는 버튼 ([처음으로] 는 저장본을 남긴다 — resetToStart)
  const inChallenge = store.screen === 'challengeMatch' && !!store.challenge.active;
  return h('div', { class: 'screen' },
    h('div', { class: 'error-panel' },
      h('b', {}, '오류'), h('div', {}, errMsg(e)),
      e?.stack ? h('pre', {}, String(e.stack).split('\n').slice(0, 6).join('\n')) : null),
    extra,
    h('div', { class: 'btn-list' },
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'),
      inChallenge
        ? h('button', { class: 'btn btn-danger', onclick: () => actions.discardChallengeMatch() }, '도전 경기 버리기')
        : h('button', { class: 'btn btn-danger', onclick: () => { if (confirm('저장된 런을 삭제할까요?')) actions.discardSave(); } }, '저장 삭제')));
}

/**
 * 이벤트 · 유물 · 카드 3택1 · 이벤트 결과 카드의 배경 = 주 선택 화면 (조작 불가).
 * 시즌 시작 이벤트 때는 weekOffer 가 아직 없다 — getWeekView 가 그 주 종류 (weekKinds) 로 그린다 (§24.13). 뷰가 없으면 빈 배경.
 */
function renderBackdrop(root, ctx) {
  try {
    renderWeek(root, ctx, { inert: true });
  } catch (e) {
    console.error(e);
    root.append(h('div', { class: 'screen' }, h('p', { class: 'muted center' }, '…')));
  }
}

/**
 * 스테이지 화면 종류 표시 (#stage[data-mode]): 'match' = 경기 화면 → 토스트를 오른쪽 위 좁은 칸으로 (css/match.css),
 * 'lesson' = 레슨 화면 · 레슨 결과 → 토스트를 손패 위로 (css/lesson.css), 그 밖 = 'og'
 */
function setStageMode(mode) {
  const el = document.getElementById('stage');
  if (el) el.dataset.mode = mode;
}

// ---- 라우팅 ----
export function render() {
  if (store.matchUi.timer) { clearInterval(store.matchUi.timer); store.matchUi.timer = null; }
  // 레슨 화면 연출: 옛 화면의 타이머를 지우고 세대를 올린다 → 옛 루프는 gen 검사(alive)로 스스로 멈춘다
  const lui = store.lessonUi;
  if (lui.timer) { clearTimeout(lui.timer); lui.timer = null; }
  lui.busy = false;
  lui.gen += 1;
  closeOverlays();
  const root = document.getElementById('app');
  if (!root) return;
  root.replaceChildren();
  setStageMode('og');
  const ctx = makeCtx();
  try {
    if (store.screen === 'setup') { renderSetup(root, ctx); return; }
    // 도전 모드: 목록 · 경기 (런 상태와 무관 — store.run 이 있어도 건드리지 않는다)
    if (store.screen === 'challengeMatch') {
      if (challenge && match && store.challenge.active) {
        setStageMode('match');
        renderMatch(root, { ...ctx, matchMode: challengeMatchMode() });
        return;
      }
      store.screen = 'challenge';
    }
    if (store.screen === 'challenge') { renderChallenge(root, ctx); return; }
    // 연습 경기: 늘 육각 경기 화면 (이 시험판은 육각을 보려고 있다 — WebGL 이 없으면 화면의 HTML 대체). 엔진이 없으면 시작 화면
    if (store.screen === 'practice') {
      if (hexMatch && run) {
        setStageMode('match');
        renderHexMatch(root, { ...ctx, matchMode: practiceMatchMode() });
        return;
      }
      toast('연습 경기 엔진 모듈을 불러오지 못했습니다.');
      leavePractice();
    }
    if (store.screen === 'recollection') { renderRecollection(root, ctx); return; }
    if (store.screen !== 'run' || !store.run) { renderStart(root, ctx); return; }
    if (!run || !match) { root.append(errorPanel(new Error('엔진 모듈이 로드되지 않아 런을 진행할 수 없습니다.'))); return; }
    // 이벤트 결과 카드 (§24.13 — 화면 전용): 방금 고른 이벤트 (state.lastEvent) 를 다음 phase 화면보다 먼저. [계속] = closeEventResult
    const rs = store.eventUi.resultSeq;
    if (rs != null && store.run.lastEvent && store.run.lastEvent.seq === rs) {
      renderBackdrop(root, ctx);
      renderEventResult(ctx);
      return;
    }
    store.eventUi.resultSeq = null;
    const phase = safe(() => run.getPhase(store.run)) ?? store.run.phase;
    switch (phase) {
      case 'week': renderWeek(root, ctx); break;
      case 'lesson': setStageMode('lesson'); renderLesson(root, ctx); break;
      case 'reward': setStageMode('lesson'); renderLesson(root, ctx, { inert: true }); renderRewardModal(ctx); break;
      case 'consult': renderConsult(root, ctx); break;
      case 'prep': renderPrep(root, ctx); break;
      case 'event': renderBackdrop(root, ctx); renderEventModal(ctx); break;
      case 'cardOffer': renderBackdrop(root, ctx); renderCardOfferModal(ctx); break;
      case 'match': setStageMode('match');
        if (isHexMatch() && hexMatch) renderHexMatch(root, ctx); // 육각 경기 화면 (H1) — 엔진이 없으면 옛 화면
        else renderMatch(root, ctx);
        break;
      case 'relic': renderBackdrop(root, ctx); renderRelicModal(ctx); break;
      case 'route': renderRoute(root, ctx); break;
      case 'finished': renderResult(root, ctx); break;
      default:
        root.append(errorPanel(new Error(`알 수 없는 phase: ${String(phase)}`)));
    }
  } catch (e) {
    console.error(e);
    toast(errMsg(e), 'error');
    root.replaceChildren(errorPanel(e));
  }
}

// ---- 부트 ----
let stage = null; // mountStage() 결과 (index.html 에 #stage 가 없으면 null)

async function boot() {
  // 스프라이트 시험판 (/soccer/sprite/ — store.SPRITE_SITE) · 육각 시험판 (/soccer/hex/ — store.HEX_SITE): 탭 제목으로 레슨판과 구분한다
  if (HEX_SITE) document.title = '경계전 클럽 — 육각 오토배틀 시험판';
  else if (SPRITE_SITE) document.title = '경계전 클럽 — 스프라이트 시험판';
  // 육각 시험판만: 서비스 워커 sw.js (스크립트 · 스타일 · JSON 을 매번 서버에 확인 — 배포 직후 새 · 옛 모듈이 섞이지 않게, 2026-10-10).
  // 기다리지 않는다 · 실패는 console.warn 만 · navigator.serviceWorker 가 없으면 (jsdom · 시험) 아무것도 안 한다 (js/ui/swRegister.js)
  registerHexServiceWorker();
  // 고정 스테이지: 데이터를 기다리기 전에 창에 맞춘다 (로딩 화면부터 스테이지 안). 화면은 인게임·아웃게임 모두 가로 전용
  stage = mountStage();
  const root = document.getElementById('app');
  window.addEventListener('error', (ev) => toast(`오류: ${errMsg(ev.error || ev.message)}`, 'error'));
  window.addEventListener('unhandledrejection', (ev) => toast(`오류: ${errMsg(ev.reason)}`, 'error'));

  try {
    store.data = await loadData();
  } catch (e) {
    console.error(e);
    toast(errMsg(e), 'error', 8000);
    if (root) {
      root.replaceChildren(h('div', { class: 'screen' }, h('div', { class: 'error-panel' }, h('b', {}, '데이터 로드 실패'), h('div', {}, errMsg(e)),
        h('p', { class: 'muted small' }, `data/*.json 필수 파일 ${REQUIRED_FILE_COUNT}개가 index.html과 같은 위치의 data/ 폴더에 있어야 합니다.`))));
    }
    return;
  }

  try {
    [run, match, manager, lessonEvents, lessonText] = await Promise.all([import('../engine/lessonRun.js'), import('../engine/match.js'), import('../engine/manager.js'),
      import('../engine/lessonEvents.js'), import('../engine/lessonText.js')]);
  } catch (e) {
    console.error(e);
    toast(`엔진 모듈 로드 실패: ${errMsg(e)}`, 'error', 8000);
  }
  // 개발 · 스크린샷용 ?events=on: 이벤트 기능 스위치를 모두 켠 데이터로 (§24.3.6 — I1 전에는 data/lesson.json 이 꺼 둔다)
  if (eventsParam() && lessonEvents && store.data?.lesson) lessonEvents.setEventSwitches(store.data.lesson, true);
  // 도전 모드 엔진은 따로: 실패해도 런은 그대로 할 수 있다
  try {
    challenge = await import('../engine/challenge.js');
  } catch (e) {
    console.warn('도전 모드 모듈 로드 실패', e);
    challenge = null;
  }
  // 육각 경기 엔진도 따로 (H1): 실패하면 런 경기는 옛 화면으로
  try {
    hexMatch = await import('../engine/hexMatch.js');
  } catch (e) {
    console.warn('육각 경기 모듈 로드 실패', e);
    hexMatch = null;
  }

  // 디버깅 편의
  window.__soccer = {
    store, get run() { return run; }, get match() { return match; }, get manager() { return manager; }, get challenge() { return challenge; },
    get lessonEvents() { return lessonEvents; }, get stage() { return stage?.fit ?? null; }, render, actions,
    // 육각 경기 (H1): 엔진 모듈 · 화면이 내놓는 디버그 { renderer: 'webgl'|'fallback', fps, turn, steps } (육각 경기 화면을 연 적이 없으면 null)
    get hexMatch() { return hexMatch; }, get hexView() { return hexViewDebug(); },
  };

  // 부트는 늘 시작 화면 (런 [이어하기] 와 같다). 진행 중인 도전 경기는 시작 화면 [도전 모드] 가 "이어하기" 로 보여 주고 누르면 복원한다
  render();
}

boot();
