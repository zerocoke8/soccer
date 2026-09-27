// js/ui/screens/match.js — 경기 화면 (phase "match")
import { h, avatar, openModal, closeOverlays, bar, banner } from '../dom.js';
import { saveMatch } from '../store.js';
import * as L from '../labels.js';

const SPEED_MS = { 1: 1000, 2: 500, 4: 250 };
const LINE_POS = ['FW', 'MF', 'DF', 'GK'];

export function renderMatch(root, ctx) {
  const { store, data, run, match, safe, actions } = ctx;
  const ui = store.matchUi;
  const state = store.run;
  const cfg = data.config || {};

  if (!store.match) {
    const setup = safe(() => run.getMatchSetup(state, data));
    if (!setup) { root.append(errorScreen('경기 정보를 불러올 수 없습니다.', ctx)); return; }
    const ms = safe(() => match.createMatch({
      data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
    }));
    if (!ms) { root.append(errorScreen('경기를 생성할 수 없습니다.', ctx)); return; }
    store.match = ms;
    saveMatch(ms);
    ui.intervene = false;
    ui.selectedSkillId = null;
    ui.resultShown = false;
  }

  const screen = h('div', { class: 'screen match-screen' });
  root.append(screen);

  const isFinished = () => safe(() => match.isFinished(store.match)) === true;
  const getView = () => safe(() => match.getMatchView(store.match, data, 'home'));
  const paused = (view) => !!(view?.needsDecision && (!ui.auto || ui.intervene));

  function stopLoop() {
    if (ui.timer) { clearInterval(ui.timer); ui.timer = null; }
  }
  function startLoop() {
    stopLoop();
    ui.timer = setInterval(tick, SPEED_MS[ui.speed] || 1000);
  }

  function tick() {
    const ms = store.match;
    if (!ms) return stopLoop();
    if (isFinished()) { stopLoop(); draw(); showResult(); return; }
    const view = getView();
    if (!view) { stopLoop(); return; }
    if (paused(view)) return; // 사람이 선택할 차례
    doStep(null);
  }

  function doStep(decision) {
    const ms = store.match;
    const before = Array.isArray(ms.events) ? ms.events.length : 0;
    const r = safe(() => match.step(ms, data, decision));
    if (r === undefined) { stopLoop(); draw(); return; }
    saveMatch(ms);
    const fresh = Array.isArray(ms.events) ? ms.events.slice(before) : [];
    const cut = fresh.find((e) => e?.type === 'cutin');
    if (cut) banner(cut.text || '필살기 발동!', 1000);
    ui.selectedSkillId = null;
    draw();
    if (isFinished()) { stopLoop(); showResult(); }
  }

  function decide(action) {
    const view = getView();
    if (!view?.needsDecision) return;
    const decision = { action };
    if (ui.selectedSkillId) decision.skillId = ui.selectedSkillId;
    ui.intervene = false;
    doStep(decision);
  }

  function skip() {
    const ms = store.match;
    stopLoop();
    const r = safe(() => match.simulateAuto(ms, data));
    if (r === undefined) { draw(); return; }
    saveMatch(ms);
    draw();
    showResult();
  }

  function showResult() {
    if (ui.resultShown) return;
    const ms = store.match;
    const result = safe(() => match.getResult(ms));
    if (!result) return;
    ui.resultShown = true;
    const home = ms.home || {};
    const away = ms.away || {};
    const score = ms.score || {};
    const winner = result.winner;
    const verdict = winner === 'home' ? '승리!' : winner === 'away' ? '패배…' : '무승부';
    const nameOf = (side, id) => (side === 'home' ? home : away)?.players?.find?.((p) => p.id === id)?.name ?? '-';
    const st = result.stats || ms.stats || {};
    const hg = result.homeGoals ?? score.home ?? 0;
    const ag = result.awayGoals ?? score.away ?? 0;
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h2', { class: 'center' }, `${L.KIND_LABELS[result.kind ?? ms.kind] ?? ''} 결과`),
      h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, home.name ?? '우리 클럽'), h('span', { class: 'ellipsis' }, away.name ?? '상대')),
      h('div', { class: 'score-big' }, `${hg} : ${ag}`),
      h('div', { class: ['result-verdict', winner === 'home' ? 'good' : winner === 'away' ? 'bad' : 'muted'] }, verdict),
      result.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${result.penalties.home ?? 0} : ${result.penalties.away ?? 0}`) : null,
      h('table', { class: 'stats-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '우리'), h('th', {}, '상대'))),
        h('tbody', {},
          [['슛', 'shots'], ['듀얼 승', 'duelsWon'], ['골', 'goals']].map(([lbl, k]) =>
            h('tr', {}, h('td', {}, lbl), h('td', {}, st.home?.[k] ?? 0), h('td', {}, st.away?.[k] ?? 0))),
          h('tr', {}, h('td', {}, 'MVP'), h('td', {}, nameOf('home', st.home?.mvpId)), h('td', {}, nameOf('away', st.away?.mvpId))))),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => { closeOverlays(); ui.resultShown = false; actions.finishMatch(result); } }, '확인'),
    ), { closable: false });
  }

  // ---------- 그리기 ----------
  function draw() {
    const view = getView();
    screen.replaceChildren(...build(view));
  }

  function build(view) {
    const ms = store.match || {};
    const home = ms.home || {};
    const away = ms.away || {};
    const finished = isFinished();
    const kind = view?.kind ?? ms.kind;
    const score = view?.score || ms.score || { home: 0, away: 0 };
    const snapOf = (side, id) => (side === 'home' ? home : away)?.players?.find?.((p) => p.id === id);
    const isPaused = paused(view);
    const canDecide = !!view?.needsDecision && isPaused && !finished;
    const tensionMax = view?.tensionMax ?? cfg.match?.tension?.max ?? 100;
    const stage = view?.stage ?? ms.stage;
    const pen = view?.penalties ?? null;
    const attackingSide = view?.attackingSide ?? ms.attackingSide;
    const defendingSide = attackingSide === 'home' ? 'away' : 'home';
    const lineIndex = view?.lineIndex ?? ms.ball?.lineIndex;
    const duelActive = !!(view?.carrier?.id);

    const header = h('div', { class: 'card scoreboard' },
      h('span', { class: 'team home ellipsis' }, home.name ?? '우리 클럽'),
      h('span', { class: 'score' }, `${score.home ?? 0} : ${score.away ?? 0}`),
      h('span', { class: 'team away ellipsis' }, away.name ?? '상대'));
    const sub = h('div', { class: 'match-sub' },
      h('span', {}, `${L.KIND_LABELS[kind] ?? kind ?? ''} · 포제션 ${view?.possession ?? ms.possession ?? '-'} / ${view?.possessionsTotal ?? ms.possessionsTotal ?? '-'}`),
      h('span', {}, [
        L.MATCH_PHASE_LABELS[view?.phase ?? ms.phase] ?? '',
        stage === 'extraTime' ? '연장' : null,
        pen ? `PK ${pen.home ?? 0}:${pen.away ?? 0}${pen.suddenDeath ? ' 서든데스' : ''}` : null,
        attackingSide && !pen ? (attackingSide === 'home' ? '우리 공격' : '상대 공격') : null,
      ].filter(Boolean).join(' · ')));

    const chip = (side, p) => {
      const involved = p.isCarrier || p.isDefender;
      const st = Number(p.stamina) || 0;
      const mx = Number(p.staminaMax) || cfg.match?.staminaMax || 100;
      const ratio = mx ? st / mx : 0;
      const snap = snapOf(side, p.id);
      return h('div', { class: ['chip', p.isCarrier ? 'carrier' : '', p.isDefender ? 'defender' : '', duelActive && !involved ? 'dim' : ''] },
        avatar(p.portraitColor ?? snap?.portraitColor, p.name, 'sm'),
        p.isCarrier ? h('span', { class: 'ball' }, '⚽') : null,
        (p.isYouth ?? snap?.isYouth) ? h('span', { class: 'youth' }, '유스') : null,
        h('span', { class: 'chip-name' }, p.name ?? ''),
        bar(ratio, ratio <= 0.2 ? 'bad' : ratio <= 0.5 ? 'warn' : 'good'));
    };
    const lineEl = (side, pos) => {
      const list = (view?.players?.[side] || (side === 'home' ? home : away).players || [])
        .filter((p) => L.positionOfSlot(p.slot) === pos);
      const active = side === defendingSide && LINE_POS[lineIndex] === pos;
      return h('div', { class: ['field-line', active ? 'active-line' : ''] },
        h('span', { class: 'line-tag' }, `${side === 'home' ? '우리' : '상대'} ${pos}`),
        list.length ? list.map((p) => chip(side, p)) : h('span', { class: 'tiny muted' }, '—'));
    };
    const field = h('div', { class: 'field' },
      ...['GK', 'DF', 'MF', 'FW'].map((pos) => lineEl('away', pos)),
      h('div', { class: 'field-mid' }),
      ...['FW', 'MF', 'DF', 'GK'].map((pos) => lineEl('home', pos)));

    const sideLabel = (side) => (side === 'home' ? '우리' : '상대');
    const duel = h('div', { class: 'card card-sm duel-panel' },
      h('span', { class: 'who' }, view?.carrier
        ? [avatar(view.carrier.portraitColor ?? snapOf(view.carrier.side, view.carrier.id)?.portraitColor, view.carrier.name, 'xs'),
          h('span', { class: 'ellipsis' }, `${view.carrier.name ?? ''} (${sideLabel(view.carrier.side)})`)]
        : h('span', { class: 'muted' }, '—')),
      h('span', { class: 'vs' }, view?.lineLabel ?? (lineIndex != null ? L.LINE_LABELS[lineIndex] : 'VS') ?? 'VS'),
      h('span', { class: 'who right' }, view?.defender
        ? [h('span', { class: 'ellipsis' }, `${view.defender.name ?? ''}${view.defender.coverCount ? ` +${view.defender.coverCount}` : ''}`),
          avatar(view.defender.portraitColor ?? snapOf(view.defender.side, view.defender.id)?.portraitColor, view.defender.name, 'xs')]
        : h('span', { class: 'muted' }, lineIndex === 3 ? 'GK' : '—')));

    const intent = view?.intent;
    let intentIco = '⏳';
    let intentText = '진행 중';
    if (intent?.countered) {
      // 상대 AI 가 reveal 스킬을 썼다: 우리 선택을 읽고 카운터한다 (엔진 intent.countered)
      intentIco = '👁';
      intentText = '상대가 우리 의도를 읽고 있음 — 카운터 주의';
    } else if (intent && intent.level !== 'none' && Array.isArray(intent.candidates) && intent.candidates.length) {
      if (intent.level === 'full') {
        intentIco = L.ACTION_ICONS[intent.candidates[0]] ?? '🎯';
        intentText = `상대 의도: ${L.ACTION_LABELS[intent.candidates[0]] ?? intent.candidates[0]}`;
      } else {
        intentIco = '❔';
        intentText = `상대 의도: ${intent.candidates.map((a) => L.ACTION_LABELS[a] ?? a).join(' 또는 ')}`;
      }
    } else if (intent && intent.level === 'none') {
      intentIco = '🙈';
      intentText = '상대 의도 비공개';
    } else if (view?.needsDecision) {
      intentIco = '🙈';
      intentText = '상대 의도 정보 없음';
    }
    const intentBox = h('div', { class: 'card card-sm intent-box' },
      h('span', { class: 'ico' }, intentIco),
      h('span', { class: 'grow' }, intentText),
      canDecide ? h('span', { class: 'badge badge-gold' }, view.needsDecision === 'attack' ? '공격 선택!' : '수비 선택!')
        : (view?.needsDecision && ui.auto && !ui.intervene ? h('span', { class: 'badge' }, '자동 결정') : null));

    const tensionRow = (lbl, val, cls) => h('div', { class: 'tension-row' },
      h('span', { class: 'lbl' }, lbl),
      bar((Number(val) || 0) / (tensionMax || 100), `tension thick ${cls}`),
      h('span', { class: 'num' }, Math.round(Number(val) || 0)));
    const tension = h('div', { class: 'card card-sm col' },
      tensionRow('우리', view?.tension?.home ?? home.tension ?? 0, ''),
      tensionRow('상대', view?.tension?.away ?? away.tension ?? 0, 'away'));

    const controls = h('div', { class: 'match-controls' },
      h('button', { class: ['btn', ui.auto ? 'active' : ''], disabled: finished, onclick: () => { ui.auto = !ui.auto; if (ui.auto) ui.intervene = false; draw(); } },
        ui.auto ? '자동 ON' : '자동 OFF'),
      h('span', { class: 'speed' }, [1, 2, 4].map((sp) =>
        h('button', { class: ['btn', ui.speed === sp ? 'active' : ''], onclick: () => { ui.speed = sp; if (ui.timer) startLoop(); draw(); } }, `${sp}x`))),
      h('button', { class: ['btn', 'grow', ui.intervene ? 'active' : ''], disabled: !ui.auto || finished, onclick: () => { ui.intervene = !ui.intervene; draw(); } },
        ui.intervene ? '개입 대기…' : '개입'),
      h('button', { class: 'btn', disabled: finished, title: '결과까지 스킵', onclick: skip }, '⏭'));

    const defaultActs = (view?.needsDecision === 'defense' ? L.ACTIONS_DEFENSE_FALLBACK : L.ACTIONS_ATTACK_FALLBACK)
      .map((a) => ({ action: a, enabled: false, label: L.ACTION_LABELS[a] }));
    const acts = Array.isArray(view?.actions) && view.actions.length ? view.actions : defaultActs;
    const actionGrid = h('div', { class: 'action-grid' }, acts.slice(0, 3).map((a) =>
      h('button', { class: 'btn btn-col', disabled: !canDecide || a.enabled === false, onclick: () => decide(a.action) },
        h('span', {}, `${L.ACTION_ICONS[a.action] ?? ''} ${a.label ?? L.ACTION_LABELS[a.action] ?? a.action}`),
        a.hint ? h('span', { class: 'btn-sub' }, a.hint) : null)));

    const skills = Array.isArray(view?.skills) ? view.skills : [];
    const skillRow = skills.length ? h('div', { class: 'skill-row' }, skills.map((s) =>
      h('button', {
        class: ['btn', 'btn-sm', 'btn-col', ui.selectedSkillId === s.skillId ? 'active' : ''],
        disabled: !canDecide || s.enabled === false,
        title: s.description ?? '',
        onclick: () => {
          // reveal 계열은 { skillId } 단독 결정으로 즉시 발동(계약 §11.1): 엔진이 결정 대기를 유지하고 view.intent 가 full 로 갱신되어
          // 의도를 본 뒤 액션을 고를 수 있다. 다른 액티브는 토글 후 액션과 함께 제출.
          if (s.effect === 'reveal') { doStep({ skillId: s.skillId }); return; }
          ui.selectedSkillId = ui.selectedSkillId === s.skillId ? null : s.skillId; draw();
        },
      },
      h('span', {}, `${s.kind === 'unique' ? '✨' : '⚡'} ${s.name ?? s.skillId}`),
      h('span', { class: 'btn-sub' }, `텐션 ${s.tension ?? 0}${s.description ? ` · ${s.description}` : ''}`))))
      : h('p', { class: 'tiny muted center' }, '사용 가능한 액티브 스킬 없음');

    const events = Array.isArray(view?.recentEvents) ? view.recentEvents : (ms.events || []).slice(-6);
    const log = h('div', { class: 'card card-sm match-log' }, events.length
      ? events.slice(-6).map((e) => h('div', { class: ['log-line', e.side ?? '', e.success ? 'success' : '', e.type ?? ''] },
        `${e.possession != null ? `[${e.possession}] ` : ''}${e.text ?? ''}`))
      : h('div', { class: 'log-line' }, '킥오프 대기'));

    return [header, sub, field, duel, intentBox, tension, controls, actionGrid, skillRow, log];
  }

  draw();
  if (isFinished()) showResult();
  else startLoop();
}

function errorScreen(msg, ctx) {
  return h('div', { class: 'screen' },
    h('div', { class: 'error-panel' }, msg),
    h('button', { class: 'btn', onclick: () => ctx.actions.resetToStart() }, '처음으로'));
}
