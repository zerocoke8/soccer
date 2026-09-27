// js/ui/app.js — 진입점. 데이터 로드 → 화면 라우팅(render) → 엔진 호출 래퍼/저장
import { store, saveRun, loadRun, saveMatch, loadMatch, clearRunSaves, addTeam, resetMatchUi } from './store.js';
import { h, toast, closeOverlays } from './dom.js';
import { renderStart } from './screens/start.js';
import { renderSetup, initSetup } from './screens/setup.js';
import { renderTraining } from './screens/training.js';
import { renderEventModal } from './screens/event.js';
import { renderMatch } from './screens/match.js';
import { renderRelicModal } from './screens/relic.js';
import { renderRoute } from './screens/route.js';
import { renderResult } from './screens/result.js';

const DATA_FILES = ['config', 'characters', 'supports', 'skills', 'events', 'relics', 'opponents', 'routes'];

// 엔진 모듈 (계약: js/engine/run.js, js/engine/match.js). 로드 실패 시에도 화면은 뜨도록 동적 import.
let run = null;
let match = null;

function errMsg(e) {
  if (!e) return '알 수 없는 오류';
  if (typeof e === 'string') return e;
  return e.message || String(e);
}

async function loadData() {
  const entries = await Promise.all(DATA_FILES.map(async (name) => {
    const res = await fetch(`./data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`데이터 로드 실패: data/${name}.json (${res.status})`);
    try {
      return [name, await res.json()];
    } catch (e) {
      throw new Error(`data/${name}.json 파싱 실패: ${errMsg(e)}`);
    }
  }));
  return Object.fromEntries(entries);
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
  if (store.run) saveRun(store.run);
  return r;
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

// ---- 액션 ----
const actions = {
  goto(screen) { store.screen = screen; render(); },

  newRun(seedPrefill = '') {
    store.setup = initSetup(store.data, seedPrefill);
    store.screen = 'setup';
    render();
  },

  continueRun() {
    const s = loadRun();
    if (!s || !s.phase) return toast('저장된 런이 없습니다.');
    store.run = s;
    store.final = null;
    store.registered = false;
    const m = loadMatch();
    const matchOk = m && s.phase === 'match' && (s.pendingMatch?.seed == null || m.seed === s.pendingMatch.seed);
    store.match = matchOk ? m : null;
    resetMatchUi();
    store.screen = 'run';
    render();
  },

  discardSave() {
    clearRunSaves();
    store.run = null;
    store.match = null;
    store.final = null;
    store.screen = 'start';
    render();
  },

  resetToStart() { store.screen = 'start'; render(); },

  startRun({ squad, formation, supportIds, tactics, seed }) {
    if (!run) return toast('엔진 모듈(run.js)이 로드되지 않았습니다.');
    const st = safe(() => run.createRun({ data: store.data, seed, squad, formation, supportIds, tactics }));
    if (!st) return;
    store.run = st;
    store.match = null;
    store.final = null;
    store.registered = false;
    resetMatchUi();
    saveRun(st);
    saveMatch(null);
    store.screen = 'run';
    render();
  },

  doAction(action) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.applyAction(store.run, store.data, action));
    if (r !== undefined) announce(newLogLines(before));
    render();
  },

  resolveEvent(choiceIndex) {
    const before = store.run?.log?.length ?? 0;
    const r = engine(() => run.resolveEvent(store.run, store.data, choiceIndex));
    if (r !== undefined) announce(newLogLines(before));
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
    resetMatchUi();
    announce(newLogLines(before));
    render();
  },

  registerTeam() {
    const team = store.final?.registeredTeam;
    if (!team) return toast('등록할 팀 정보가 없습니다.');
    const rating = store.final.rating || store.run?.rating || team.rating || {};
    addTeam({
      ...team,
      grade: rating.cappedGrade ?? rating.grade ?? '-',
      score: rating.score ?? null,
      registeredAt: new Date().toISOString(),
    });
    store.registered = true;
    toast('팀을 등록했습니다.', 'good', 2500);
    render();
  },

  replay(seed) {
    clearRunSaves();
    store.run = null;
    store.match = null;
    store.final = null;
    store.registered = false;
    resetMatchUi();
    actions.newRun(seed || '');
  },
};

function makeCtx() {
  return {
    store,
    data: store.data,
    run,
    match,
    render,
    safe,
    engine,
    actions,
    thresholds: store.data?.config?.rating?.thresholds,
  };
}

function errorPanel(e, extra) {
  return h('div', { class: 'screen' },
    h('div', { class: 'error-panel' },
      h('b', {}, '오류'), h('div', {}, errMsg(e)),
      e?.stack ? h('pre', {}, String(e.stack).split('\n').slice(0, 6).join('\n')) : null),
    extra,
    h('div', { class: 'btn-list' },
      h('button', { class: 'btn', onclick: () => { store.screen = 'start'; render(); } }, '처음으로'),
      h('button', { class: 'btn btn-danger', onclick: () => { if (confirm('저장된 런을 삭제할까요?')) actions.discardSave(); } }, '저장 삭제')));
}

function renderBackdrop(root, ctx) {
  try {
    renderTraining(root, ctx, { inert: true });
  } catch (e) {
    console.error(e);
    root.append(h('div', { class: 'screen' }, h('p', { class: 'muted center' }, '…')));
  }
}

// ---- 라우팅 ----
export function render() {
  if (store.matchUi.timer) { clearInterval(store.matchUi.timer); store.matchUi.timer = null; }
  closeOverlays();
  const root = document.getElementById('app');
  if (!root) return;
  root.replaceChildren();
  const ctx = makeCtx();
  try {
    if (store.screen === 'setup') { renderSetup(root, ctx); return; }
    if (store.screen !== 'run' || !store.run) { renderStart(root, ctx); return; }
    if (!run || !match) { root.append(errorPanel(new Error('엔진 모듈이 로드되지 않아 런을 진행할 수 없습니다.'))); return; }
    const phase = safe(() => run.getPhase(store.run)) ?? store.run.phase;
    switch (phase) {
      case 'turn': renderTraining(root, ctx); break;
      case 'event': renderBackdrop(root, ctx); renderEventModal(ctx); break;
      case 'match': renderMatch(root, ctx); break;
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
async function boot() {
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
        h('p', { class: 'muted small' }, 'data/*.json 8개 파일이 index.html과 같은 위치의 data/ 폴더에 있어야 합니다.'))));
    }
    return;
  }

  try {
    [run, match] = await Promise.all([import('../engine/run.js'), import('../engine/match.js')]);
  } catch (e) {
    console.error(e);
    toast(`엔진 모듈 로드 실패: ${errMsg(e)}`, 'error', 8000);
  }

  // 디버깅 편의
  window.__soccer = { store, get run() { return run; }, get match() { return match; }, render, actions };

  render();
}

boot();
