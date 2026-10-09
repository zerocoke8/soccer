// js/ui/screens/hexMatch.js — 육각 오토배틀 경기 화면 (store.isHexMatch() 일 때 런 경기 phase match — docs/HEX_AUTOBATTLE_PLAN.md §5 · §6, H1 SPEC §5)
//   + 경기 모드 훅 ctx.matchMode (연습 경기 — app.js practiceMatchMode, H5 도전 경기도 이 자리). 없으면 런 경기 그대로.
//
// 화면 골격 (스테이지 1280×720 — .match-screen 의 --pad · --fx · --ft · --fb 를 그대로 쓴다):
//   .screen.match-screen.hex-screen[data-screen=match]
//   ├ .hx-pitch            예전 .pitch 자리 (잔디 바탕) — .hx-canvas (Pixi 캔버스) · .hx-field (필드 영역 = 예전 .m-field, HTML 이름표 층)
//   │                       · .hx-fallback (WebGL 이 없을 때 안내) · .hx-note ("다시 그리는 중…")
//   ├ .mh                  점수 머리 (예전 클래스 그대로: .mh-team.home > .nm · .mh-score · .mh-team.away > .nm · .mh-sub)
//   ├ .hx-clock            남은 경기 시간 (hexScene.clockText — 결정 16)
//   ├ .hx-ctl              [1x/2x/4x] (.speed-btn — store.matchUi.speed) · [⏭] (.skip-btn — 결과까지)
//   └ .hx-banner           골 · 골든골 · 추가시간 · 승부차기 알림
//   이름표 .hx-name (공 가진 선수 머리 위 — 매 프레임 hexScene.headPoint × 카메라) 는 .hx-field 안.
//
// 경기 모드 훅 ctx.matchMode (없으면 런 경기 — 괄호 안이 런 경기 기본값):
//   { label?: HUD 아랫줄 · 결과 제목의 경기 종류 글자 (KIND_LABELS[kind]),
//     getSetup?(): 셋업 { home, away, possessions, seed, kind } (ctx.run.getMatchSetup(store.run, data)),
//     stateKey?: 엔진 상태를 두는 store 칸 이름 ('hexMatch' — 연습 경기 'practiceMatch'),
//     save?: null 이면 저장 없음 — KEYS.hexMatch 를 읽지도 쓰지도 않는다 (그 밖 = KEYS.hexMatch 재생 기록),
//     onFinish?(result): 결과 [확인] (actions.finishMatch),
//     exits?: [{ label, title?, danger?, onClick() }] — 오른쪽 위 .m-exits 버튼들 (옛 경기 화면과 같은 클래스 — 런 경기에는 없다),
//     again?: { label, onClick() } — 결과 모달 [확인] 옆 버튼 (연습: [다시 하기]) }
//
// 경기 진행 (H1 은 입력이 없다 — 보기만):
//   - 상태: store[stateKey] (store.hexMatch — 엔진 상태, 메모리) + KEYS.hexMatch 재생 기록 { version, seed, steps, skipped? } (step 마다 저장, save: null 이면 없음).
//     같은 seed 의 store.hexMatch → 그대로, 아니면 재생 기록 → createMatch + step × steps (skipped 면 simulateAuto), 아니면 새 경기.
//   - 루프: requestAnimationFrame 하나 (setTimeout 없음 — 스크린샷 도구가 100 ms 이상 타이머를 묶고, 배경 탭은 rAF 가 멈춰 그대로 일시정지).
//     dt (프레임마다 최대 100 ms) 를 모아 한 턴 = hexTickMs() / 배속 이 차면 step. 그 사이는 hexScene.frameAt(이전, 지금, 진행도) 로 보간.
//   - 골: 공이 골망으로 → "골!" 배너 · 카메라 전체 · 시계 멈춤 ~1.6 초 / 배속 (끝 0.5 초는 킥오프 자리) → 다음 턴.
//     단계가 바뀌면 배너 (골든골 · 추가시간 · 승부차기). 승부차기는 ~0.9 초 / 배속 마다 한 킥 (머리 줄에 PK 점수).
//   - 끝: 결과 모달 (예전 showResult 와 같은 DOM) → [확인] → actions.finishMatch(result) 한 번. 실패하면 app 이 다시 그리고 이 화면이 결과를 다시 연다.
//   - ⏭: simulateAuto → 저장 { skipped: true } → 결과.
//   - 수명: 모듈 HEX_GEN · alive() = 이 화면이 마지막이고 문서 안에 있다. 죽으면 루프가 멈추고 Pixi view 를 지우고 리스너를 뗀다.
//   - WebGL 이 없으면 (jsdom · 오래된 기기) 캔버스 없이 HTML 안내 + 시계 · 점수만 돌고 경기는 그대로 끝까지 간다.
//   - WebGL 문맥을 잃으면: (저장은 step 마다 이미 했다) view 를 지우고 "다시 그리는 중…" → 잠시 뒤 다시 만든다 (엔진 상태는 그대로).
//
// [구현 결정] (H1):
//  - 시작 · 이어하기 직후 0.9 초 / 배속 동안 전체 화면 (카메라 'full') 을 보여 주고 첫 step 을 한다.
//  - 골 연출 = 공이 골망에 들어가는 한 턴 + 1.1 초 / 배속 골 장면 + 0.5 초 / 배속 킥오프 자리 (hexScene: 골 턴은 선수를 prev 자리에 둔다).
//  - 경기가 끝나면 0.8 초 / 배속 마지막 장면을 보여 주고 결과를 연다 (⏭ 은 바로).
//  - 카메라는 목표 쪽으로 지수 보간 (시간 상수 250 ms), z 차이가 0.001 아래면 목표에 붙인다.
//  - 결과 표 = 슛 · 겨루기 승 · 골 · 패스 (성공/시도) · 가로채기 · 태클 성공 · MVP (육각 엔진 stats).
//  - 그림이 멈춰 있으면 (보간 끝 · 카메라 멈춤 · 늦은 그림 없음) Pixi 를 다시 그리지 않는다 (배터리).
//  - 골 장면 뒤 킥오프 자리 그림은 골 턴에 kickoff 이벤트가 있을 때만 — 골든골 결승골은 공이 골망에 남은 채 결과로 간다.
//  - 골과 같은 턴에 단계가 바뀌면 (동점골 → 골든골 · 골 → 추가시간) "골!" 배너를 먼저, 단계 배너는 골 장면 (1.1 초 / 배속) 뒤에.
//  - 배속을 바꾸면 턴 안 흐른 시간 · 기다림 · 골 장면 · 끝 대기 · 배너 시간을 배속 비율로 늘이고 줄인다 (보간 진행도가 이어진다).
//  - WebGL 문맥을 잃으면 1 초 뒤 다시 만든다. 다시 만든 view 가 5 초 버티면 횟수를 0 으로 — 연달아 4번째 잃으면 이 경기는 대체 화면.
//  - 만드는 도중 문맥을 잃은 view (lostWhileCreating · view.isLost()) 는 받지 않고 지운 뒤 다시 만들기를 기다린다.
//  - 화면 꾸밈 클래스는 모두 hx- 앞머리 (전역 .stage · .goal 등과 겹치지 않게).
// [구현 결정] (연습 경기 — 경기 모드 훅):
//  - 저장 없는 모드 (save: null) 의 ⏭ 여부는 모듈 WeakSet 에 둔다 — 다시 그려도 결과를 바로 다시 연다 (재생 기록 skipped 대신).
//  - [다시 하기] 와 [확인] 은 합쳐 한 번만 누를 수 있다 (먼저 누른 쪽).
//  - 나가기 버튼은 옛 경기 화면과 같은 .m-exits (css/match.css) 를 그대로 쓴다.
// [구현 결정] (H2 — 스프라이트):
//  - 그릴 목록에 정지 스프라이트 크기 (art.spriteOf — 이름표 높이 = 스프라이트 키, view.spriteKind 가 그 캐릭터를 스프라이트로 그린다고 할 때만 —
//    아니면 스탠디 키) 와 골 장면 여부 (공이 골망에 닿은 뒤 · 킥오프 자리 전 —
//    득점자 세리머니) 를 넘긴다. 동작 · 얼굴 방향은 hexScene, 시트 재생은 hexPixi.
//  - 스프라이트 시계 = 이 화면의 루프 시간 (dt 합 — 배경 탭에서 멈춘다). draw 에 { clock, speed, turnMs } 를 넘긴다.
//  - view.animating 이면 보간 · 카메라가 멈춰 있어도 다시 그린다 (대기 동작이 계속 돈다).
//  - 차는 턴의 공이 발을 떠나는 진행도 = hexScene.BALL_RELEASE × max(ONE_SHOT_MIN, 턴 ms) / 턴 ms (4배속은 한 번 동작이 늘어난 만큼 늦게, 최대 0.75).
//    공 가진 선수 표시 (금색 고리 · 이름표) 를 넘기는 때도 그 뒤 비행의 CARRIER_SWITCH 로 미룬다.
//  - 디버그 HEX_DEBUG.sprites = view.playing() (스프라이트 선수의 지금 동작 · 칸 · 화면 상자 — tools/hex_shot.mjs --practice 동작 사냥).

import { h, openModal, closeOverlays } from '../dom.js';
import { saveHexMatch, loadHexMatch, HEX_SAVE_VERSION, hexTickMs } from '../store.js';
import * as L from '../labels.js';
import * as V from '../view25.js';
import * as S from '../hexScene.js';
import { createHexView, hexResolution, ONE_SHOT_MIN } from '../hexPixi.js';
import { spriteOf } from '../art.js';

const SPEEDS = [1, 2, 4];
/** 시간 (ms, 1배속 — 배속으로 나눈다) */
const T = Object.freeze({
  start: 900, // 시작 · 이어하기 전체 화면
  goalScene: 1100, // 공이 골망에 들어간 뒤 골 장면
  goalKickoff: 500, // 그 뒤 킥오프 자리
  penalty: 900, // 승부차기 한 킥
  stageBanner: 1400, // 단계 배너
  goalBanner: 1600, // 골 배너
  end: 800, // 끝난 뒤 결과까지
  camTau: 250, // 카메라 시간 상수 (배속과 상관없음)
  retry: 1000, // WebGL 다시 만들기 (배속과 상관없음)
  stable: 5000, // 다시 만든 view 가 이만큼 살아 있으면 문맥 잃음 횟수를 0 으로 (배속과 상관없음)
});
/** 연달아 (stable 안에) 문맥을 이만큼 넘게 잃으면 이 경기 동안은 대체 화면 */
const MAX_RETRIES = 3;
const DT_CAP = 100;
/** 공 가진 선수가 바뀐 턴: 공 보간이 이만큼 (0 ~ 1) 오면 새 선수에게 금색 고리 · 이름표 */
const CARRIER_SWITCH = 0.7;
const FALLBACK_MSG = '이 기기에서는 경기장을 그릴 수 없어요 — 결과는 그대로 진행돼요';

let HEX_GEN = 0;
// 화면 디버그 (window.__soccer.hexView — app.js): { renderer: 'webgl'|'fallback'|'pending', fps, turn, steps, … }. 화면을 연 적이 없으면 null
let HEX_DEBUG = null;
// 엔진 상태 → 지금까지 step 횟수 (store.hexMatch 를 그대로 이어받을 때)
const STEPS = new WeakMap();
// ⏭ 한 엔진 상태 (저장 없는 모드 — 재생 기록 skipped 대신. 다시 그려도 카메라가 ⏭ 장면 그대로)
const SKIPPED = new WeakSet();

/** 육각 경기 화면 디버그 값 (app.js window.__soccer.hexView 가 읽는다) — 화면을 연 적이 없으면 null */
export function hexViewDebug() {
  return HEX_DEBUG;
}

const isHexState = (s, HM) => !!(s && typeof s === 'object' && s.engine === 'hex' && s.version === HM.HEX_MATCH_VERSION);

/**
 * 육각 경기 화면을 root 에 그린다 (런 경기 — app.js render 의 phase match · 연습 경기 — screen 'practice').
 * @param {HTMLElement} root  #app
 * @param {object} ctx  app.js makeCtx() — ctx.hexMatch = 육각 경기 엔진 (js/engine/hexMatch.js), ctx.matchMode = 경기 모드 훅 (머리 주석, 없으면 런 경기)
 */
export function renderHexMatch(root, ctx) {
  const { store, data, actions } = ctx;
  const HM = ctx.hexMatch;
  const safe = typeof ctx.safe === 'function' ? ctx.safe : (fn) => { try { return fn(); } catch (e) { console.error(e); return undefined; } };
  const ui = store.matchUi;
  // 경기 모드 훅 (머리 주석) — 없으면 런 경기: getMatchSetup · store.hexMatch · KEYS.hexMatch · actions.finishMatch · KIND_LABELS
  const mode = ctx.matchMode && typeof ctx.matchMode === 'object' ? ctx.matchMode : null;
  const stateKey = typeof mode?.stateKey === 'string' && mode.stateKey ? mode.stateKey : 'hexMatch';
  const saveOn = !(mode && mode.save === null);
  const loadSave = () => (saveOn ? loadHexMatch() : null);
  const writeSave = (sv) => { if (saveOn) saveHexMatch(sv); };
  const onFinish = typeof mode?.onFinish === 'function' ? mode.onFinish : (r) => actions.finishMatch(r);
  const exits = (Array.isArray(mode?.exits) ? mode.exits : []).filter((x) => x && typeof x.onClick === 'function');
  const again = mode?.again && typeof mode.again.onClick === 'function' ? mode.again : null;

  /* ---- 경기 상태 (만들기 · 이어받기 · 되살리기) ---- */
  const setup = safe(() => (typeof mode?.getSetup === 'function' ? mode.getSetup() : ctx.run.getMatchSetup(store.run, data)));
  if (!setup || !HM) { root.append(errorScreen('경기 정보를 불러올 수 없습니다.', ctx)); return; }
  const create = () => HM.createMatch({
    data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
  });
  let state = null;
  let steps = 0;
  let skipped = false;
  const live = store[stateKey];
  if (isHexState(live, HM) && live.seed === setup.seed) {
    state = live;
    const sv = loadSave();
    steps = STEPS.get(live) ?? (sv && sv.seed === setup.seed ? sv.steps : 0);
    skipped = saveOn ? !!(sv && sv.seed === setup.seed && sv.skipped) : SKIPPED.has(live);
  } else {
    const sv = loadSave();
    if (sv && sv.seed === setup.seed) {
      state = safe(() => {
        const st = create();
        if (sv.skipped) HM.simulateAuto(st, data);
        else for (let i = 0; i < sv.steps && !st.finished; i++) HM.step(st, data);
        return st;
      }) || null;
      if (state) { steps = sv.steps; skipped = !!sv.skipped; }
    }
    if (!state) {
      state = safe(create) || null;
      if (!state) { root.append(errorScreen('경기를 생성할 수 없습니다.', ctx)); return; }
      steps = 0;
      skipped = false;
      writeSave({ version: HEX_SAVE_VERSION, seed: setup.seed, steps: 0 });
    }
  }
  store[stateKey] = state;
  STEPS.set(state, steps);
  const persist = () => {
    STEPS.set(state, steps);
    if (skipped) SKIPPED.add(state);
    writeSave(skipped
      ? { version: HEX_SAVE_VERSION, seed: state.seed, steps, skipped: true }
      : { version: HEX_SAVE_VERSION, seed: state.seed, steps });
  };

  const gen = ++HEX_GEN;
  const speedOf = () => (SPEEDS.includes(Number(ui.speed)) ? Number(ui.speed) : 1);
  const clockCfg = { turnsRegular: Number(HM.TURNS_REGULAR) || 300, goldenTurns: Number(HM.GOLDEN_TURNS) || 75 };
  const kindLabel = mode?.label ?? L.KIND_LABELS[state.kind] ?? state.kind ?? '';
  const nameOf = (side, id) => state[side]?.players?.find((p) => String(p.id) === String(id))?.name ?? '';

  /* ---- DOM ---- */
  const screen = h('div', { class: ['screen', 'match-screen', 'hex-screen'], dataset: { screen: 'match' } });
  const canvasHost = h('div', { class: 'hx-canvas', 'aria-hidden': 'true' });
  const nameEl = h('div', { class: 'hx-name', hidden: true });
  const field = h('div', { class: 'hx-field' }, nameEl);
  const fallbackEl = h('div', { class: 'hx-fallback', hidden: true }, FALLBACK_MSG);
  const noteEl = h('div', { class: 'hx-note', hidden: true }, '다시 그리는 중…');
  const pitch = h('div', { class: 'hx-pitch' }, canvasHost, field, fallbackEl, noteEl);
  const homeNm = h('span', { class: 'nm ellipsis' }, state.home?.name ?? '우리 클럽');
  const awayNm = h('span', { class: 'nm ellipsis' }, state.away?.name ?? '상대');
  const scoreEl = h('div', { class: 'mh-score' }, S.scoreText(state));
  const subEl = h('div', { class: 'mh-sub' }, '');
  const hud = h('div', { class: 'mh' }, h('div', { class: ['mh-team', 'home'] }, homeNm), scoreEl, h('div', { class: ['mh-team', 'away'] }, awayNm), subEl);
  const clockEl = h('div', { class: 'hx-clock', 'aria-live': 'off' }, S.clockText(state, clockCfg));
  const speedBtn = h('button', { class: 'btn speed-btn', type: 'button', onclick: () => cycleSpeed() });
  const skipBtn = h('button', { class: 'btn skip-btn', type: 'button', title: '결과까지 스킵', 'aria-label': '결과까지 스킵', onclick: () => skip() }, '⏭');
  const ctl = h('div', { class: 'hx-ctl' }, speedBtn, skipBtn);
  const bannerEl = h('div', { class: 'hx-banner', 'aria-live': 'polite' }, h('b', { class: 'hx-banner-txt' }), h('span', { class: 'hx-banner-sub' }));
  screen.append(pitch, hud, clockEl, ctl, bannerEl);
  // 경기 모드 나가기 버튼들 (연습: [나가기]) — 옛 경기 화면과 같은 .m-exits (오른쪽 위). 런 경기에는 없다
  if (exits.length) {
    screen.append(h('div', { class: 'm-exits' }, exits.map((x) => h('button', {
      class: ['btn', 'btn-sm', 'm-exit', x.danger ? 'danger' : ''], type: 'button', title: x.title || '', onclick: () => x.onClick(),
    }, x.label || '나가기'))));
  }
  root.appendChild(screen);
  const alive = () => gen === HEX_GEN && screen.isConnected;

  // 필드 영역 크기 (논리 px — 스테이지 배율 전 값, 경기 중 그대로). 레이아웃이 없으면 (jsdom) 1280×720 스테이지 기본값
  const W = field.clientWidth > 40 ? field.clientWidth : 1244;
  const H = field.clientHeight > 40 ? field.clientHeight : 528;
  const PW = pitch.clientWidth > 40 ? pitch.clientWidth : 1268;
  const PH = pitch.clientHeight > 40 ? pitch.clientHeight : 708;
  const origin = { x: field.offsetLeft || (pitch.clientWidth > 40 ? 0 : 12), y: field.offsetTop || (pitch.clientHeight > 40 ? 0 : 78) };
  const world = V.worldRect(W, H);
  // 정지 스프라이트 크기 (charId 마다 한 번 — hexScene figure 키 · 이름표 높이). view 가 그 캐릭터를 지금 스프라이트로 그릴 때만
  // (그림이 아직 안 왔거나 실패해 스탠디로 그리는 동안은 null — 이름표가 스탠디 머리 위에 붙게)
  const sprCache = new Map();
  const spriteSize = (charId) => {
    if (!view || typeof view.spriteKind !== 'function' || !view.spriteKind(charId)) return null;
    if (!sprCache.has(charId)) sprCache.set(charId, spriteOf(data, charId));
    return sprCache.get(charId);
  };

  /* ---- HUD ---- */
  let hudKey = '';
  function drawHud() {
    const clock = S.clockText(state, clockCfg);
    const score = S.scoreText(state);
    const sub = [kindLabel, S.stageLabel(state)].filter(Boolean).join(' · ');
    const key = `${clock}|${score}|${sub}|${state.finished}`;
    if (key === hudKey) return;
    hudKey = key;
    clockEl.textContent = clock;
    clockEl.classList.toggle('hx-golden', state.stage === 'goldenGoal' && !state.finished);
    clockEl.classList.toggle('hx-low', state.stage === 'regular' && !state.finished && clockCfg.turnsRegular - state.turn <= 25);
    scoreEl.textContent = score;
    subEl.textContent = sub;
    hud.classList.toggle('last-attack', state.stage === 'addedTime' && !state.finished);
    skipBtn.disabled = !!state.finished;
  }
  function drawSpeed() {
    const sp = speedOf();
    const next = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length];
    speedBtn.textContent = `${sp}x`;
    speedBtn.dataset.speed = String(sp);
    speedBtn.classList.toggle('active', sp > 1);
    speedBtn.title = `배속 ${sp}x — 누르면 ${next}x`;
    speedBtn.setAttribute('aria-label', `배속 ${sp}x, 누르면 ${next}x`);
  }
  function cycleSpeed() {
    const sp = speedOf();
    const ns = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length];
    ui.speed = ns;
    // 턴 안에서 흐른 시간 · 남은 기다림을 새 배속에 맞춰 늘이고 줄인다 — 보간 진행도 (acc / 한 턴) 가 그대로 이어지게 (뒤로 튀거나 건너뛰지 않게)
    const k = sp / ns;
    acc *= k;
    wait *= k;
    if (goal) { goal.scene *= k; goal.until *= k; }
    if (endLeft > 0) endLeft *= k;
    if (bannerLeft > 0) bannerLeft *= k;
    if (pendingBanner) pendingBanner.ms *= k;
    drawSpeed();
  }

  /* ---- 배너 ---- */
  // 꾸밈 클래스는 모두 hx- 앞머리 (.stage · .goal 같은 전역 클래스와 겹치면 전역 규칙이 배너를 덮는다 — base.css .stage = 1280×720 상자)
  let bannerLeft = 0;
  let pendingBanner = null; // 골과 같은 턴에 단계가 바뀌면 (동점골 → 골든골 등) 골 장면 뒤로 미룬 단계 배너 { text, sub, cls, ms }
  function banner(text, sub, cls, ms) {
    bannerEl.className = ['hx-banner', 'hx-show', cls].filter(Boolean).join(' ');
    bannerEl.querySelector('.hx-banner-txt').textContent = text;
    bannerEl.querySelector('.hx-banner-sub').textContent = sub || '';
    bannerLeft = ms;
  }
  function flushBanner() {
    const b = pendingBanner;
    pendingBanner = null;
    if (b) banner(b.text, b.sub, b.cls, b.ms);
  }
  function tickBanner(dt) {
    if (bannerLeft <= 0) return;
    bannerLeft -= dt;
    if (bannerLeft <= 0) bannerEl.classList.remove('hx-show');
  }

  /* ---- Pixi view ---- */
  let view = null;
  let viewState = 'pending'; // 'pending' | 'webgl' | 'fallback' | 'lost'
  let retryLeft = 0;
  let retries = 0; // 연달아 잃은 횟수 (다시 만든 view 가 T.stable 동안 살아 있으면 0)
  let viewAge = 0; // 지금 view 가 살아 있은 시간 (ms, 루프 dt)
  let creating = false;
  let lostWhileCreating = false; // 만드는 도중 (app.init 뒤 그림 읽는 중) 문맥을 잃었다 → 다 만든 view 를 받지 않는다
  function makeView() {
    if (creating) return;
    creating = true;
    lostWhileCreating = false;
    viewState = view ? viewState : 'pending';
    let p;
    try {
      p = Promise.resolve(createHexView(canvasHost, {
        W, H, width: PW, height: PH, origin, data, resolution: hexResolution(),
        onContextLost: () => contextLost(),
      }));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then((v) => {
      creating = false;
      if (!alive()) { try { v?.destroy?.(); } catch (_) { /* 이미 */ } return; }
      if (!v) {
        viewState = 'fallback';
        fallbackEl.hidden = false;
        noteEl.hidden = true;
        return;
      }
      let lost = lostWhileCreating;
      try { lost = lost || !!v.isLost?.(); } catch (_) { /* 모름 = 살아 있다 */ }
      lostWhileCreating = false;
      if (lost) {
        // 죽은 문맥으로 다 만든 view: 받지 않고 지운다 (contextLost 가 이미 다시 만들기를 걸어 두었다 — 아니면 지금 건다)
        try { v.destroy?.(); } catch (_) { /* 이미 */ }
        if (viewState !== 'fallback' && viewState !== 'lost') contextLost();
        return;
      }
      view = v;
      viewAge = 0;
      viewState = v.renderer || 'webgl';
      fallbackEl.hidden = true;
      noteEl.hidden = true;
      drawSig = '';
    }, (e) => {
      creating = false;
      console.warn('육각 경기장 view 를 만들지 못했습니다', e);
      if (!alive()) return;
      viewState = 'fallback';
      fallbackEl.hidden = false;
    });
  }
  function dropView() {
    const v = view;
    view = null;
    if (v) { try { v.destroy(); } catch (e) { console.warn('view 정리 실패', e); } }
  }
  function contextLost() {
    if (!alive()) return;
    if (creating) lostWhileCreating = true;
    persist();
    dropView();
    viewState = 'lost';
    noteEl.hidden = false;
    retries += 1;
    retryLeft = retries <= MAX_RETRIES ? T.retry : 0;
    if (retries > MAX_RETRIES) { viewState = 'fallback'; noteEl.hidden = true; fallbackEl.hidden = false; }
  }

  /* ---- 진행 ---- */
  let prevSnap = null; // 지난 step 전 상태 (sceneSnap)
  let acc = 0; // 이번 턴 안에서 흐른 시간 (ms)
  let wait = 0; // 이번 턴 다음 step 까지 더 기다릴 시간 (골 · 시작)
  let goal = null; // { scene: 골 장면 끝 (acc ms), until: 킥오프 자리 끝, kickoff: 이 턴에 킥오프로 돌아갔나 } — 골 턴만
  let startHold = !state.finished;
  wait = startHold ? T.start / speedOf() : 0;
  acc = 0;
  let endLeft = state.finished ? 0 : -1; // 끝난 뒤 결과까지 남은 시간 (−1 = 아직 안 끝남)
  let resultShown = false;
  let finishing = false;
  let broken = false;

  function turnMs() {
    return (state.stage === 'penalties' ? T.penalty : hexTickMs()) / speedOf();
  }

  function doStep() {
    prevSnap = S.sceneSnap(state);
    const n0 = state.events.length;
    const r = safe(() => HM.step(state, data));
    if (r === undefined) { prevSnap = null; broken = true; return false; } // 엔진 오류: 더 돌리지 않는다 (⏭ · 처음으로는 그대로)
    steps += 1;
    persist();
    onEvents(state.events.slice(n0));
    return true;
  }

  function onEvents(evs) {
    const sp = speedOf();
    flushBanner(); // 지난 골 장면 뒤로 미룬 단계 배너가 아직 남았으면 지금
    goal = null;
    const hasGoal = evs.some((e) => e.type === 'goal');
    // 단계 배너: 같은 턴에 골이 있으면 "골!" 을 덮지 않게 골 장면 뒤로 미룬다 (동점골 → 골든골 · 골 → 추가시간)
    const stageBanner = (text, sub) => {
      const b = { text, sub, cls: 'hx-stage', ms: T.stageBanner / sp };
      if (hasGoal) pendingBanner = b;
      else banner(b.text, b.sub, b.cls, b.ms);
    };
    for (const e of evs) {
      if (e.type === 'goal') {
        const tm = turnMs();
        goal = {
          scene: tm + T.goalScene / sp, until: tm + (T.goalScene + T.goalKickoff) / sp,
          kickoff: evs.some((x) => x.type === 'kickoff'), // 골든골 결승골은 킥오프 없이 끝난다 → 공은 골망에 그대로
        };
        wait = goal.until - tm;
        banner('골!', `${nameOf(e.side, e.playerId)} · ${e.score ? `${e.score.home} : ${e.score.away}` : S.scoreText(state)}`, `hx-goal hx-${e.side}`, T.goalBanner / sp + tm);
      } else if (e.type === 'goldenGoal') {
        stageBanner('골든골', '먼저 넣는 쪽이 이긴다');
      } else if (e.type === 'addedTime') {
        stageBanner('추가시간', e.side === 'home' ? '우리 마지막 공격' : '상대 마지막 공격');
      } else if (e.type === 'penalties') {
        stageBanner('승부차기', '');
      } else if (e.type === 'penalty' && !goal) {
        const pen = state.penalties;
        banner(e.success ? '성공' : '실패', `${nameOf(e.side, e.playerId)} · 승부차기 ${pen?.home ?? 0} : ${pen?.away ?? 0}`, `hx-pk hx-${e.side} ${e.success ? 'hx-ok' : 'hx-miss'}`, (T.penalty * 0.9) / sp);
      }
    }
    if (state.finished && endLeft < 0) endLeft = T.end / sp + (goal ? goal.until : turnMs());
  }

  function skip() {
    if (!alive()) return;
    if (state.finished) { showResult(); return; }
    const r = safe(() => HM.simulateAuto(state, data));
    skipped = true;
    persist();
    prevSnap = null;
    goal = null;
    pendingBanner = null;
    wait = 0;
    acc = 0;
    startHold = false;
    endLeft = 0;
    drawHud();
    if (r !== undefined) showResult();
  }

  /* ---- 결과 ---- */
  function showResult() {
    if (resultShown || !alive() || !state.finished) return;
    const result = safe(() => HM.getResult(state));
    if (!result) return;
    resultShown = true;
    ui.resultShown = true;
    const home = state.home || {};
    const away = state.away || {};
    const winner = result.winner;
    const verdict = winner === 'home' ? '승리!' : winner === 'away' ? '패배…' : '무승부';
    const st = result.stats || state.stats || {};
    const hg = result.homeGoals ?? state.score?.home ?? 0;
    const ag = result.awayGoals ?? state.score?.away ?? 0;
    const num = (side, k) => Number(st[side]?.[k]) || 0;
    const rows = [
      ['슛', (s) => num(s, 'shots')],
      ['겨루기 승', (s) => num(s, 'duelsWon')],
      ['골', (s) => num(s, 'goals')],
      ['패스 (성공/시도)', (s) => `${num(s, 'passesCompleted')}/${num(s, 'passes')}`],
      ['가로채기', (s) => num(s, 'interceptions')],
      ['태클 성공', (s) => num(s, 'tacklesWon')],
    ];
    const mvp = (side) => nameOf(side, st[side]?.mvpId) || '-';
    // [확인] · [다시 하기] 는 합쳐 정확히 1회 (런: run.finishMatch 가 실패하면 app.js 가 render() — 이 화면이 다시 그려지며 결과를 다시 연다)
    const once = (fn) => (e) => {
      if (finishing) return;
      finishing = true;
      if (e?.currentTarget) e.currentTarget.disabled = true;
      closeOverlays();
      ui.resultShown = false;
      fn();
    };
    const okBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: once(() => onFinish(result)) }, '확인');
    // 경기 모드 [다시 하기] (연습): [확인] 옆
    const againBtn = again ? h('button', { class: 'btn btn-block again-btn', type: 'button', onclick: once(() => again.onClick()) }, again.label || '다시 하기') : null;
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h2', { class: 'center' }, `${mode?.label ?? L.KIND_LABELS[result.kind ?? state.kind] ?? ''} 결과`),
      h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, home.name ?? '우리 클럽'), h('span', { class: 'ellipsis' }, away.name ?? '상대')),
      h('div', { class: 'score-big' }, `${hg} : ${ag}`),
      h('div', { class: ['result-verdict', winner === 'home' ? 'good' : winner === 'away' ? 'bad' : 'muted'] }, verdict),
      result.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${result.penalties.home ?? 0} : ${result.penalties.away ?? 0}`) : null,
      h('table', { class: 'stats-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '우리'), h('th', {}, '상대'))),
        h('tbody', {},
          rows.map(([lbl, f]) => h('tr', {}, h('td', {}, lbl), h('td', {}, f('home')), h('td', {}, f('away')))),
          h('tr', {}, h('td', {}, 'MVP'), h('td', {}, mvp('home')), h('td', {}, mvp('away'))))),
      againBtn ? h('div', { class: 'row hx-result-btns', style: { gap: '8px' } }, againBtn, okBtn) : okBtn,
    ), { closable: false });
  }

  /* ---- 카메라 ---- */
  let cam = { cx: W / 2, cy: H / 2, z: 1 };
  function camStep(frame, dt) {
    const sp = speedOf();
    const inGoal = !!(goal && acc < goal.until);
    const phase = V.cameraPhase({
      skip: skipped, finished: state.finished, goal: inGoal,
      kickoff: !!frame.kickoff || state.stage === 'penalties', start: startHold,
    });
    const target = V.cameraTarget({ phase, W, H, speed: sp, ball: frame.focus, attackRight: frame.attackRight, world });
    const k = 1 - Math.exp(-dt / T.camTau);
    const z = Math.abs(target.z - cam.z) < 0.001 ? target.z : cam.z + (target.z - cam.z) * k;
    const next = { cx: cam.cx + (target.cx - cam.cx) * k, cy: cam.cy + (target.cy - cam.cy) * k, z };
    // z = 1 이면 clampCamera 가 가운데로 바로 붙이므로 그대로 둔다 (가운데로 함께 수렴 중)
    cam = z <= 1 + 1e-9 ? { cx: next.cx, cy: next.cy, z: 1 } : V.clampCamera(next, W, H, world);
  }

  /* ---- 이름표 (공 가진 선수) ---- */
  let nameKey = null;
  function drawName(frame) {
    const p = frame.carrierKey ? frame.players.find((x) => x.key === frame.carrierKey) : null;
    if (!p || state.finished || !view) { // 캔버스가 없으면 (대체 화면 · 다시 그리는 중) 이름표도 숨긴다
      if (!nameEl.hidden) nameEl.hidden = true;
      return;
    }
    if (nameKey !== p.key) {
      nameKey = p.key;
      nameEl.textContent = p.name;
      nameEl.className = `hx-name hx-${p.side}`;
    }
    const pt = S.camPoint(S.headPoint(p), cam, W, H);
    nameEl.style.transform = `translate(${Math.round(pt.x * 10) / 10}px, ${Math.round(pt.y * 10) / 10}px) translate(-50%, -100%)`;
    if (nameEl.hidden) nameEl.hidden = false;
  }

  /* ---- 한 프레임 ---- */
  let lastT = null;
  let fps = 0;
  let frames = 0;
  let drawSig = '';
  let animClock = 0; // 스프라이트 시계 (ms — 루프 dt 합, 배경 탭에서 멈춘다)
  let texStats = null; // view.stats() (30 프레임마다 — 디버그 · 메모리 재기)
  let rafId = null;
  const raf = (fn) => {
    const w = globalThis.window;
    if (w && typeof w.requestAnimationFrame === 'function') return w.requestAnimationFrame(fn);
    if (typeof globalThis.requestAnimationFrame === 'function') return globalThis.requestAnimationFrame(fn);
    return setTimeout(() => fn(Date.now()), 16);
  };
  const caf = (id) => {
    const w = globalThis.window;
    if (w && typeof w.cancelAnimationFrame === 'function') w.cancelAnimationFrame(id);
    else if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(id);
    else clearTimeout(id);
  };
  const onVisibility = () => {
    if (!alive()) { stop(); return; }
    lastT = null; // 돌아오면 dt 를 새로 잰다 (밀린 시간을 한꺼번에 돌리지 않는다)
  };
  globalThis.document?.addEventListener?.('visibilitychange', onVisibility);

  function stop() {
    if (rafId != null) caf(rafId);
    rafId = null;
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
    dropView();
  }

  function advance(dt) {
    if (broken) return;
    if (state.finished) {
      if (endLeft >= 0 && !resultShown) {
        acc += dt;
        endLeft -= dt;
        if (endLeft <= 0) showResult();
      }
      return;
    }
    acc += dt;
    if (pendingBanner && (!goal || acc >= goal.scene)) flushBanner(); // 골 장면이 끝나면 미룬 단계 배너
    if (startHold) {
      if (acc >= wait) { startHold = false; acc = 0; wait = 0; doStep(); }
      return;
    }
    const tm = turnMs();
    if (acc >= tm + wait) {
      acc = Math.min(acc - tm - wait, tm); // 밀린 시간은 한 턴까지만
      wait = 0;
      doStep();
    }
  }

  function currentFrame() {
    const tm = turnMs();
    if (goal && goal.kickoff && acc >= goal.scene) return S.frameAt(null, state, 1, { W, H, sprite: spriteSize }); // 골 뒤 킥오프 자리 (골든골 결승골은 없음 — 공은 골망에)
    const alpha = startHold || !prevSnap ? 1 : Math.min(1, acc / tm);
    // 골 장면 = 공이 골망에 닿은 뒤 (득점자 세리머니 — 골든골 결승골은 끝까지).
    // 공이 발을 떠나는 진행도: 한 번 동작은 최소 ONE_SHOT_MIN ms 로 늘어나므로 (4배속) 발이 닿는 때도 그만큼 늦다
    const release = Math.min(0.75, S.BALL_RELEASE * Math.max(ONE_SHOT_MIN, tm) / tm);
    const f = S.frameAt(prevSnap, state, alpha, { W, H, sprite: spriteSize, goalScene: !!(goal && acc >= tm), release });
    // 공 가진 선수가 이번 턴에 바뀌었으면 (패스 받기 · 가로채기 · 태클) 공이 거의 도착할 때까지 새 선수 표시 (금색 고리 · 이름표) 를 미룬다
    // — 공이 아직 앞 선수 발밑에 있는데 고리 · 이름표만 먼저 건너가 보이지 않게.
    const ph = prevSnap?.ball?.holder || null;
    const nh = state.ball?.holder || null;
    const handover = !!(prevSnap && nh && !f.kickoff && (!ph || ph.side !== nh.side || ph.id !== nh.id) && alpha < f.release + CARRIER_SWITCH * (1 - f.release));
    if (goal || state.stage === 'penalties' || state.finished || handover) {
      // 골 장면 (공은 골망 안 — 다음 킥오프 선수 표시는 킥오프 자리에서만) · 승부차기 · 끝 · 공이 건너가는 중: 공 가진 선수 표시 없음
      f.carrierKey = null;
      for (const p of f.players) p.carrier = false;
    }
    return f;
  }

  function loop(now) {
    rafId = null;
    if (!alive()) { stop(); return; }
    const hidden = !!globalThis.document?.hidden;
    const dt = lastT == null || hidden ? 0 : Math.min(DT_CAP, Math.max(0, now - lastT));
    lastT = hidden ? null : now;
    if (dt > 0) {
      animClock += dt;
      fps = fps ? fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
      advance(dt);
      tickBanner(dt);
    }
    if (!alive()) { stop(); return; }
    if (viewState === 'lost' && retryLeft > 0) {
      retryLeft -= dt;
      if (retryLeft <= 0) makeView();
    }
    if (view && retries > 0) {
      viewAge += dt;
      if (viewAge >= T.stable) retries = 0; // 다시 만든 view 가 버텼다 → 다음 잃음은 처음부터 센다
    }
    const frame = currentFrame();
    camStep(frame, dt || 16);
    drawHud();
    drawName(frame);
    if (view) {
      const sig = `${frame.turn}|${frame.alpha.toFixed(3)}|${goal && goal.kickoff && acc >= goal.scene ? 'k' : ''}|${cam.cx.toFixed(1)}|${cam.cy.toFixed(1)}|${cam.z.toFixed(3)}`;
      if (sig !== drawSig || view.dirty || view.animating) {
        drawSig = sig;
        try {
          view.draw(frame, cam, { clock: animClock, speed: speedOf(), turnMs: turnMs() });
          frames += 1;
          if (frames % 30 === 1 && typeof view.stats === 'function') texStats = view.stats();
        } catch (e) {
          console.warn('육각 경기장 그리기 실패', e);
        }
      }
    }
    HEX_DEBUG = {
      renderer: viewState, fps: Math.round(fps), turn: state.turn, steps, stage: state.stage, finished: !!state.finished,
      frames, speed: speedOf(), cam: { ...cam }, score: { ...state.score }, resultShown, tex: texStats,
      sprites: view && typeof view.playing === 'function' ? view.playing() : null,
    };
    rafId = raf(loop);
  }

  /* ---- 시작 ---- */
  drawSpeed();
  drawHud();
  HEX_DEBUG = { renderer: 'pending', fps: 0, turn: state.turn, steps, stage: state.stage, finished: !!state.finished, frames: 0, speed: speedOf(), cam: { ...cam }, score: { ...state.score }, resultShown };
  makeView();
  rafId = raf(loop);
  if (state.finished) showResult();
}

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                  */
/* ------------------------------------------------------------------ */
function errorScreen(msg, ctx) {
  return h('div', { class: ['screen', 'match-screen', 'hex-screen'], dataset: { screen: 'match' } },
    h('div', { class: 'error-panel' }, msg),
    h('button', { class: 'btn', onclick: () => ctx.actions.resetToStart() }, '처음으로'));
}
