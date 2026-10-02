// js/ui/screens/lesson.js — 레슨 화면 (phase lesson; 레슨 결과 모달의 배경 — inert). LESSON_PROTO_PLAN §6.3 "레슨 화면".
//
//   ┌ HUD: 종목 · ★특별 │ 턴 ●●●○○○ 4/6 │ 점수 [████▌···|····] 286 / 목표 429 / 퍼펙트 676 │ 버프 칩 ───────────────┐
//   │ ┌ 경기장 (.pitch > .m-field — 경기 화면 마크업 복제, 우리 골 = 왼쪽) ─────────────┐ ┌ 이번 레슨 ───────────┐ │
//   │ │  토큰 7 (자리 = lesson_layout.tokenSpot) · 훈련장 (drillZone) · 말풍선 · +N 팝  │ │ 선수 7: 체력 · 대상 · 실패율│ │
//   │ └─────────────────────────────────────────────────────────────────────────────────┘ └ 덱 · 버림 · 팀워크 · 방침 ┘ │
//   ├ 손패 dock: [덱 n][버림 n] │ 카드 176×204 (cards.cardFace, 4장 이상이면 겹침) │ 안내 · 미리보기 노트 │ [내기][쉬기][턴 끝] ┤
//
// 조작 (§6.3 고르기 흐름): 카드를 누르면 고른다 (store.lessonUi.selectedUid) → 엔진 previewCard 로 대상 강조(.target) · 말풍선 "+N" · 노트.
//   탭이 필요한 카드는 토큰(또는 오른쪽 명단 줄)을 눌러 taps 에 쌓는다: 고를 수 있음 .pickable(초록) / 안 됨 .blocked(빨강 + 이유) / 고름 .picked.
//   다 고르면 [내기]가 켜진다. 탭이 필요 없는 카드는 카드를 한 번 더 누르거나 [내기]. Esc · 경기장 빈 곳 = 취소.
//   [쉬기] = 탭 모드 → 선수 1명을 누르면 lessonRest. [턴 끝] = endLessonTurn. 추천(manager.recommendCard)은 카드 · 버튼의 "추천" 배지뿐.
// 엔진 호출 = ctx.actions.lessonCall (호출 1번 = 저장 1번, render 없음). 화면 DOM 은 그대로 두고 부분만 고친다 (카드를 내도 화면을 다시 만들지 않는다).
// 연출 (§6.3): lastFx(lesson_layout.fxPlan) → 대상 토큰이 훈련 지점으로 우르르 (--t-move) → "+N" 팝 · 점수 막대 → 제자리 → 턴 끝 분위기 틱 · 새 손패.
//   카드 1장 ≈ 1.1초. 재생 중 busy (입력 무시). 레슨이 끝나면(phase reward) 재생 뒤 ctx.render() → 보상 모달.
//   GEN: app.render() 가 store.lessonUi.gen 을 올린다 → 옛 화면의 타이머는 alive() 검사로 스스로 멈춘다. 새로고침 뒤에는 다시 재생하지 않는다 (shownSeq).
// 개발용 ?autolesson=1: 600ms 마다 감독 추천 행동을 낸다 (스크린샷 · 시간 측정용, §5.5). inert: 루프 없이 마지막 상태만, 입력 없음.
import { h, avatar, bar, openModal, toast } from '../dom.js';
import * as L from '../labels.js';
import { ZONES } from '../layout.js';
import { cardFace, miniCard } from '../cards.js';
import { tokenSpot, drillSpots, drillZone, fxPlan, scoreAfterPlay, handStep, FIELD_PX, TOKEN_PX } from '../lesson_layout.js';
import { stamCls } from '../hud.js';

/** 연출 시간 (ms): 달려가기 · 머무르기(+N 팝) · 돌아오기 · 턴 끝 틱 · 레슨 끝 배너 · 자동 진행 간격 */
export const LESSON_T = { move: 300, hold: 520, back: 300, tick: 650, turn: 260, end: 1000, auto: 600 };
const CARD_W = 176;

function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}
function autoLessonOn() {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get('autolesson') === '1';
  } catch (_) {
    return false;
  }
}
const pctText = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
const round1 = (x) => Math.round(x * 10) / 10;
const initialOf = (name) => {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
};

export function renderLesson(root, ctx, { inert = false } = {}) {
  const { store, data, run, manager, safe, actions } = ctx;
  const ui = store.lessonUi;
  const gen = ui.gen;
  const st = () => store.run;
  const reduced = prefersReducedMotion();
  const autoMode = !inert && autoLessonOn();

  const screen = h('div', { class: ['screen', 'og', 'lesson-screen', inert ? 'inert' : '', reduced ? 'no-anim' : ''], dataset: { screen: 'lesson' } });
  root.append(screen);

  const getView = (quiet = inert) => {
    if (quiet) { try { return run.getLessonView(st(), data); } catch (_) { return null; } }
    return safe(() => run.getLessonView(st(), data));
  };
  let v = getView();
  if (!v) {
    if (inert) { screen.classList.add('lesson-blank'); return; } // 보상 모달 배경: 레슨 상태가 없으면 빈 배경
    screen.classList.add('og-error');
    screen.append(h('div', { class: 'error-panel' }, '레슨 화면 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'));
    return;
  }
  const isLive = () => !inert && st()?.phase === 'lesson' && st()?.lesson?.status === 'playing';
  const alive = () => gen === ui.gen && screen.isConnected;
  ui.shownSeq = v.seq; // 새로고침 · 다시 그리기 뒤에는 지난 연출을 다시 재생하지 않는다
  ui.busy = false;
  // 고른 카드가 손패에 없으면(다른 상태) 선택을 푼다 — 다시 그려도 선택은 남는다 (§9.3 lessonUi)
  if (ui.selectedUid && !v.hand.some((c) => c.uid === ui.selectedUid)) { ui.selectedUid = null; ui.taps = []; }
  if (!Array.isArray(ui.taps)) ui.taps = [];
  if (!isLive()) { ui.selectedUid = null; ui.taps = []; ui.restPick = false; }

  const slots = L.slotsOf(st().formation);
  const statName = L.STAT_LABELS[v.stat] ?? v.stat;
  const subStat = data.config?.training?.subStatMap?.[v.stat];
  const restCfg = data.lesson?.lesson?.rest || { picked: 20, others: 5 };
  const policy = L.policyInfo(st().policy, data);

  /* ------------------------------------------------------------------ */
  /* DOM 골격 (한 번 만들고 부분 갱신)                                        */
  /* ------------------------------------------------------------------ */
  // ---- HUD ----
  const hudTitle = h('div', { class: 'lh-title' },
    h('h2', {}, h('span', { class: 'lh-ico' }, L.STAT_ICONS[v.stat] ?? ''), `${statName} ${v.prep ? '대비 ' : ''}레슨`,
      v.special ? h('span', { class: 'badge badge-gold lh-special', title: `특별 레슨 — 상승 +${Math.round((data.lesson?.lesson?.special?.gainBonus ?? 0.5) * 100)}%, 목표 ×${data.lesson?.lesson?.special?.targetMult ?? 1.3}` }, '★특별') : null),
    h('span', { class: 'muted small' }, `시즌 ${v.season} · ${v.week}주 · ${policy.name}`));
  const turnPips = h('span', { class: 'lh-pips' });
  const turnNum = h('b', { class: 'lh-turn-n' });
  const hudTurn = h('div', { class: 'lh-turn' }, h('span', { class: 'tiny muted' }, '턴'), turnPips, turnNum);
  const scoreNum = h('b', { class: 'lh-score-n' });
  const scoreFill = h('i', { class: 'lh-fill' });
  const scoreGhost = h('i', { class: 'lh-ghost' });
  const targetMark = h('i', { class: 'lh-target-mk' });
  const scoreText = h('span', { class: 'lh-score-t' });
  const scoreDelta = h('span', { class: 'lh-delta' });
  const hudScore = h('div', { class: 'lh-score' },
    h('div', { class: 'lh-score-top' }, h('span', { class: 'tiny muted' }, '점수'), scoreNum, scoreDelta, scoreText),
    h('div', { class: 'lh-bar', 'aria-hidden': 'true' }, scoreFill, scoreGhost, targetMark));
  const chipsEl = h('div', { class: 'lh-chips' });
  const hud = h('header', { class: 'lh' }, hudTitle, hudTurn, hudScore, chipsEl);

  // ---- 경기장 (match.js L176-219 와 같은 클래스) ----
  const bg = h('div', { class: 'pitch-bg' },
    ZONES.map((z) => h('div', { class: ['zone', `z${z.id}`], dataset: { zone: String(z.id) }, style: { left: `${z.from}%`, width: `${z.to - z.from}%` } })),
    h('div', { class: 'pl-half' }), h('div', { class: 'pl-circle' }),
    h('div', { class: 'pl-box top' }), h('div', { class: 'pl-box bottom' }),
    h('div', { class: 'pl-goal top' }), h('div', { class: 'pl-goal bottom' }),
    h('div', { class: 'pl-spot top' }), h('div', { class: 'pl-spot bottom' }));
  const zoneEls = drillZone(v.stat).map((z) => h('div', {
    class: ['drill-zone', z.shape],
    style: { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` },
  }));
  const z0 = drillZone(v.stat)[0];
  const drillLabel = z0 ? h('span', { class: 'drill-label', style: { left: `${z0.x + z0.w / 2}%`, top: `${z0.y + (z0.y < 50 && z0.h < 30 ? z0.h + 1 : 1)}%` } },
    `${L.STAT_ICONS[v.stat] ?? ''} ${statName} 훈련장`) : null;
  const drillLayer = h('div', { class: 'drill-layer', 'aria-hidden': 'true' }, zoneEls, drillLabel);
  const tokLayer = h('div', { class: 'tok-layer' });
  const popLayer = h('div', { class: 'pop-layer', 'aria-hidden': 'true' });
  const field = h('div', { class: 'm-field', onclick: (e) => { if (e.target === field || e.target.closest?.('.pitch-bg, .drill-layer')) cancelSelect(); } },
    bg, drillLayer, tokLayer, popLayer);
  const grass = h('div', { class: 'pitch' }, field);
  const pitchWrap = h('div', { class: 'ls-pitch' }, grass);

  // ---- 오른쪽: 이번 레슨 ----
  const sideRows = h('div', { class: 'ls-rows' });
  const sideFoot = h('div', { class: 'ls-foot' });
  const side = h('aside', { class: ['og-panel', 'ls-side'] },
    h('div', { class: 'og-panel-head' }, h('h3', { class: 'og-panel-title' }, '이번 레슨'), h('span', { class: 'tiny muted' }, '체력 · 대상 · 실패율')),
    sideRows, sideFoot);

  // ---- 손패 dock ----
  const drawBtn = h('button', { class: 'btn btn-sm ls-pile', type: 'button', onclick: () => openPile('draw') });
  const discBtn = h('button', { class: 'btn btn-sm ls-pile', type: 'button', onclick: () => openPile('discard') });
  const pileNote = h('span', { class: 'tiny muted ls-pile-note' });
  const playsEl = h('span', { class: 'ls-plays' });
  const piles = h('div', { class: 'ls-piles' }, playsEl, drawBtn, discBtn, pileNote);
  const handEl = h('div', { class: 'ls-hand' });
  const infoEl = h('div', { class: 'ls-info', role: 'status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'btn btn-primary ls-play', type: 'button', onclick: () => playSelected() }, '내기');
  const restBtn = h('button', { class: 'btn ls-rest', type: 'button', onclick: () => toggleRest() }, '쉬기');
  const endBtn = h('button', { class: 'btn ls-end', type: 'button', onclick: () => endTurn() }, '턴 끝');
  const btns = h('div', { class: 'ls-btns' }, playBtn, restBtn, endBtn);
  const dock = h('div', { class: 'ls-dock' }, piles, handEl, infoEl, btns);

  screen.append(hud, pitchWrap, side, dock);

  /* ------------------------------------------------------------------ */
  /* 상태 · 좌표                                                           */
  /* ------------------------------------------------------------------ */
  let W = FIELD_PX.w;
  let H = FIELD_PX.h;
  const tokEls = new Map();
  const rowEls = new Map();
  const timers = new Set();
  let pv = null;          // 지금 고른 카드의 previewCard
  let rec = null;         // manager.recommendCard
  let shown = { score: v.score, stamina: {} }; // 연출 중 보여 주는 값 (점수 · 체력)

  function measure() {
    const w = field.clientWidth;
    const hh = field.clientHeight;
    if (w > 40 && hh > 40) { W = w; H = hh; }
  }
  const toPx = (s) => [(s.x / 100) * W, (s.y / 100) * H];
  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive()) fn(); }, Math.max(0, reduced ? 0 : ms));
    timers.add(id);
    ui.timer = id;
    return id;
  }
  const setBusy = (b) => { ui.busy = b; screen.classList.toggle('busy', b); };
  const homeSpot = (p) => tokenSpot(p.slot, slots);
  const playerOf = (id) => (v.players || []).find((p) => p.id === id);
  const runPlayer = (id) => (st().players || []).find((p) => p.id === id);

  /* ------------------------------------------------------------------ */
  /* 토큰                                                                  */
  /* ------------------------------------------------------------------ */
  function tokenEl(p) {
    let el = tokEls.get(p.id);
    if (el) return el;
    const face = h('span', { class: 'tok-face', style: { background: p.portraitColor || '#4b5563' } }, initialOf(p.name));
    const barI = h('i');
    const nm = h('span', { class: 'tok-nm' }, p.name);
    const stN = h('b', { class: 'tok-stn' });
    const nameEl = h('span', { class: 'tok-name' }, nm, stN);
    const bubble = h('span', { class: 'tok-bubble' });
    const warn = h('span', { class: 'tok-warn' });
    const outTag = h('span', { class: 'tok-out' });
    el = h('div', {
      class: ['tok', 'home', 'named'],
      role: 'button',
      tabindex: '0',
      dataset: { side: 'home', id: p.id },
      onclick: (e) => { e.stopPropagation(); onToken(p.id); },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToken(p.id); } },
    }, h('span', { class: 'tok-ring', 'aria-hidden': 'true' }), face, h('span', { class: 'tok-bar' }, barI), nameEl, warn, outTag, bubble);
    el._bar = barI;
    el._stn = stN;
    el._bubble = bubble;
    el._warn = warn;
    el._out = outTag;
    tokLayer.append(el);
    tokEls.set(p.id, el);
    return el;
  }
  function placeTok(el, spot) {
    const [x, y] = toPx(spot);
    el.style.transform = `translate(${round1(x)}px, ${round1(y)}px)`;
    el.dataset.x = String(round1(spot.x));
    el.dataset.y = String(round1(spot.y));
  }
  function staminaOf(p) {
    return shown.stamina[p.id] ?? Number(p.stamina) ?? 0;
  }

  /** 고르기 상태 → 토큰 · 명단 줄 표시 (pickable 초록 · blocked 빨강 · picked · target 말풍선) */
  function pickInfo() {
    const out = { mode: null, pickable: new Set(), blocked: new Map(), picked: new Set(ui.taps || []), target: new Map(), failer: null, recTaps: new Set() };
    if (!isLive() || ui.busy) return out;
    if (ui.restPick) {
      out.mode = 'rest';
      for (const p of v.players) out.pickable.add(p.id);
      if (rec?.kind === 'rest' && rec.playerId) out.recTaps.add(rec.playerId);
      return out;
    }
    const sel = selectedCard();
    if (!sel) return out;
    out.mode = 'card';
    if (pv) {
      if (sel.needTaps > 0) {
        for (const id of pv.tapCandidates || []) out.pickable.add(id);
        for (const id of out.picked) out.pickable.add(id);
        for (const b of pv.blocked || []) out.blocked.set(b.id, b.reason);
      }
      if (pv.ok) {
        for (const t of pv.targets || []) out.target.set(t.id, t);
        out.failer = pv.failRate > 0 ? pv.failerId : null;
      }
    }
    if (rec?.kind === 'play' && rec.uid === sel.uid) for (const id of rec.taps || []) out.recTaps.add(id);
    return out;
  }

  function renderTokens() {
    const info = pickInfo();
    const seen = new Set();
    for (const p of v.players) {
      seen.add(p.id);
      const el = tokenEl(p);
      const stam = staminaOf(p);
      const t = info.target.get(p.id);
      const blockedReason = info.blocked.get(p.id);
      const cls = ['tok', 'home', 'named', `st-${stamCls(stam)}`];
      if (p.out) cls.push('out');
      if (p.injured) cls.push('injured');
      if (info.pickable.has(p.id) && !info.picked.has(p.id)) cls.push('pickable');
      if (info.picked.has(p.id)) cls.push('picked');
      if (blockedReason && !info.pickable.has(p.id)) cls.push('blocked');
      if (t) cls.push('target');
      if (info.recTaps.has(p.id) && !info.picked.has(p.id)) cls.push('rec');
      if (el.classList.contains('drilling')) cls.push('drilling');
      el.className = cls.join(' ');
      if (!el.classList.contains('drilling')) placeTok(el, homeSpot(p));
      el._bar.style.width = `${Math.max(0, Math.min(100, stam))}%`;
      el._stn.textContent = String(stam);
      // 실패 위험 (체력 60 미만 = 실패율 10% 이상): 토큰 왼쪽 위 경고
      const fr = Number(p.failRate) || 0;
      const warnOn = !p.out && fr >= 0.1;
      el._warn.textContent = warnOn ? `⚠${pctText(fr)}` : '';
      el._warn.classList.toggle('on', warnOn);
      el._out.textContent = p.injured ? '부상' : p.out ? '결장' : '';
      el._out.classList.toggle('on', !!p.out);
      // 말풍선: 대상 = 예상 상승 (+ 실패 위험), 빨강 = 고를 수 없는 이유
      let bub = '';
      let tone = '';
      if (t) {
        bub = `+${t.gain}`;
        if (info.failer === p.id) { bub += ` · 실패 ${pctText(pv.failRate)}`; tone = 'risk'; }
      } else if (blockedReason && !info.pickable.has(p.id)) {
        bub = blockedReason;
        tone = 'no';
      } else if (info.mode === 'rest') {
        bub = `+${restCfg.picked}`;
        tone = 'rest';
      }
      el._bubble.textContent = bub;
      el._bubble.className = ['tok-bubble', tone].filter(Boolean).join(' ');
      el.classList.toggle('has-bubble', !!bub);
      el.setAttribute('aria-label', `${p.slot} ${p.name} — 체력 ${stam}${p.out ? ' · 결장' : ''}${t ? ` · 예상 +${t.gain}` : ''}${info.pickable.has(p.id) ? ' · 눌러서 고르기' : ''}${blockedReason ? ` · ${blockedReason}` : ''}`);
    }
    for (const [id, el] of tokEls) if (!seen.has(id)) el.classList.add('gone');
  }

  /* ------------------------------------------------------------------ */
  /* HUD · 명단 · 손패 · 안내                                                */
  /* ------------------------------------------------------------------ */
  function renderHud(scoreShown = shown.score) {
    const turn = shown.turn ?? v.turn; // 연출 중에는 턴 끝 단계까지 이전 턴
    turnPips.replaceChildren(...Array.from({ length: v.turns }, (_, i) => h('i', { class: i + 1 < turn ? 'done' : i + 1 === turn ? 'cur' : '' })));
    turnNum.textContent = `${turn}/${v.turns}`;
    const cap = Math.max(1, Number(v.cap) || 1);
    const sc = Math.max(0, Number(scoreShown) || 0);
    scoreNum.textContent = String(scoreShown);
    scoreText.textContent = ` / 목표 ${v.target} · 퍼펙트 ${v.cap}`;
    scoreFill.style.width = `${Math.min(100, (sc / cap) * 100)}%`;
    hudScore.classList.toggle('clear', sc >= v.target);
    hudScore.classList.toggle('perfect', sc >= v.cap);
    targetMark.style.left = `${Math.min(100, (v.target / cap) * 100)}%`;
    targetMark.title = `목표 ${v.target}`;
    // 미리보기: 성공하면 오를 점수 (고른 카드의 대상 상승 합)
    const gain = pv?.ok ? (pv.targets || []).reduce((a, t) => a + (Number(t.gain) || 0), 0) : 0;
    scoreGhost.style.left = `${Math.min(100, (sc / cap) * 100)}%`;
    scoreGhost.style.width = `${Math.max(0, Math.min(100 - (sc / cap) * 100, (gain / cap) * 100))}%`;
    scoreDelta.textContent = gain > 0 ? `+${gain}` : '';
    hud.title = `점수 ${v.score} · 목표 ${v.target} (클리어) · 퍼펙트 ${v.cap} (즉시 끝 + 남은 턴당 전원 체력 +${data.lesson?.lesson?.perfectStaminaPerTurn ?? 5})`;
    renderChips();
  }
  function renderChips(flash = []) {
    const chips = v.chips || [];
    chipsEl.replaceChildren(...(chips.length ? chips.map((c) => h('span', {
      class: ['badge', 'lh-chip', c.policy ? 'pol' : '', flash.includes(c.key) ? 'flash' : ''],
      dataset: { key: c.key },
      title: c.policy ? `${policy.name} 방침 버프` : '카드 효과',
    }, h('span', { class: 'lh-chip-k' }, c.label), h('b', {}, c.value))) : [h('span', { class: 'tiny muted' }, '버프 없음')]));
  }

  function renderSide() {
    const info = pickInfo();
    for (const p of v.players) {
      let row = rowEls.get(p.id);
      if (!row) {
        row = h('button', { class: 'ls-row', type: 'button', dataset: { pid: p.id }, onclick: () => onToken(p.id) });
        rowEls.set(p.id, row);
        sideRows.append(row);
      }
      const stam = staminaOf(p);
      const fr = Number(p.failRate) || 0;
      row.className = ['ls-row', p.out ? 'out' : '', info.pickable.has(p.id) && !info.picked.has(p.id) ? 'pickable' : '', info.picked.has(p.id) ? 'picked' : '',
        info.blocked.has(p.id) && !info.pickable.has(p.id) ? 'blocked' : '', info.target.has(p.id) ? 'target' : ''].filter(Boolean).join(' ');
      row.disabled = !(info.pickable.has(p.id) || info.picked.has(p.id));
      row.title = `${p.name} (${p.slot}) — 체력 ${stam} · 이번 레슨 대상 ${p.targeted}회 · 실패율 ${pctText(fr)}${p.out ? ' · 결장' : ''}`;
      row.replaceChildren(
        avatar(p.portraitColor, p.name, 'xs', p.out ? 'dim' : ''),
        h('span', { class: 'ls-nm' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, ` ${p.slot}`)),
        h('span', { class: 'ls-st' }, bar(stam / 100, stamCls(stam)), h('b', { class: stamCls(stam) }, stam)),
        h('span', { class: ['ls-tg', p.targeted ? '' : 'muted'] }, p.targeted ? `${p.targeted}회` : '–'),
        p.out ? h('span', { class: 'badge badge-bad ls-outb' }, p.injured ? '부상' : '결장')
          : h('span', { class: ['ls-fr', fr >= 0.25 ? 'bad' : fr >= 0.1 ? 'warn' : 'muted'] }, pctText(fr)));
    }
    const lsn = st().lesson || {};
    const twCap = data.lesson?.teamwork?.lessonCap ?? 8;
    sideFoot.replaceChildren(
      h('div', { class: 'ls-foot-row' }, h('span', { class: 'muted' }, '팀워크'), h('b', {}, st().teamwork ?? 0),
        h('span', { class: 'tiny muted' }, `레슨 중 +${lsn.twAccrued ?? 0}/${twCap}`)),
      h('div', { class: 'ls-foot-row' }, h('span', { class: 'muted' }, '방침'), h('b', {}, policy.name),
        h('span', { class: 'tiny muted ellipsis', title: policy.desc }, (policy.buffs || []).map((b) => L.BUFF_LABELS[b] ?? b).join(' · '))),
      h('div', { class: 'ls-foot-row tiny muted' }, `컨디션 ${L.CONDITION_LABELS[st().condition] ?? st().condition} · ${subStat ? `부 스탯 ${L.STAT_LABELS[subStat] ?? subStat}` : ''}`));
  }

  function selectedCard() {
    return ui.selectedUid ? (v.hand || []).find((c) => c.uid === ui.selectedUid) || null : null;
  }

  function renderHand(deal = false) {
    const hand = v.hand || [];
    const avail = handEl.clientWidth > 100 ? handEl.clientWidth : 600;
    const step = handStep(hand.length, avail, CARD_W, 12);
    const recUid = rec?.kind === 'play' ? rec.uid : null;
    const els = hand.map((c, i) => {
      const el = cardFace(c, {
        data,
        players: st().players,
        recommended: c.uid === recUid,
        selected: c.uid === ui.selectedUid,
        onClick: (e) => { e?.stopPropagation?.(); onCard(c.uid); },
      });
      el.disabled = inert || !isLive();
      if (i > 0) el.style.marginLeft = `${round1(step - CARD_W)}px`;
      el.style.zIndex = String(c.uid === ui.selectedUid ? 20 : i + 1);
      if (deal) { el.classList.add('deal'); el.style.animationDelay = `${i * 70}ms`; }
      return el;
    });
    handEl.replaceChildren(...els);
    handEl.classList.toggle('overlap', step < CARD_W + 12);
    if (!hand.length) handEl.append(h('p', { class: 'muted small ls-empty' }, '손패 없음'));
  }

  function renderPiles() {
    const p = v.piles || {};
    drawBtn.textContent = `덱 ${p.draw ?? 0}`;
    discBtn.textContent = `버림 ${p.discard ?? 0}`;
    drawBtn.title = '뽑을 더미 — 순서는 보이지 않습니다';
    discBtn.title = '버린 더미 — 뽑을 더미가 비면 섞어서 다시 씁니다';
    const gone = (p.exhausted ?? 0) + (p.removed ?? 0);
    pileNote.textContent = gone ? `제외 ${gone}` : '';
    pileNote.title = gone ? `1회 카드 ${p.exhausted ?? 0}장 · 결장 선수의 고유 카드 ${p.removed ?? 0}장` : '';
    playsEl.replaceChildren(h('span', { class: 'tiny muted' }, '이번 턴'), h('b', {}, `${Math.max(0, v.playsLeft ?? 0)}장`), h('span', { class: 'tiny muted' }, '더 낼 수 있음'));
  }

  function renderInfo() {
    const sel = selectedCard();
    const lines = [];
    if (ui.busy && !inert) {
      lines.push(h('b', { class: 'ls-guide' }, '훈련 중…'));
    } else if (inert || !isLive()) {
      lines.push(h('b', { class: 'ls-guide' }, `레슨 ${L.LESSON_STATUS_LABELS[v.status] ?? v.status}`));
    } else if (ui.restPick) {
      lines.push(h('b', { class: 'ls-guide' }, '쉬기 — 체력을 회복할 선수를 누르세요'));
      lines.push(h('span', { class: 'small' }, `고른 선수 체력 +${restCfg.picked}, 나머지 출전 선수 +${restCfg.others}. 이번 턴은 여기서 끝납니다.`));
      if ((v.buffs?.press || 0) > 0) lines.push(h('span', { class: 'small warn' }, `압박 ${v.buffs.press} → 0 · 출전 선수 체력 +${(data.lesson?.buffs?.pressRestHeal ?? 4) * v.buffs.press}`));
      lines.push(h('span', { class: 'tiny muted' }, '다시 [쉬기] · Esc = 취소'));
    } else if (!sel) {
      lines.push(h('b', { class: 'ls-guide' }, '카드를 고르세요'));
      lines.push(h('span', { class: 'small muted' }, '고르면 대상 선수와 예상 상승이 경기장에 보입니다.'));
      if (rec) {
        const t = rec.kind === 'play' ? (v.hand.find((c) => c.uid === rec.uid)?.name ?? '') : rec.kind === 'rest' ? '쉬기' : '턴 끝';
        lines.push(h('span', { class: 'small' }, h('span', { class: 'badge badge-accent' }, '추천'), ` ${t}`));
      }
      if (v.canEndTurn) lines.push(h('span', { class: 'tiny muted' }, '더 낼 카드가 없으면 [턴 끝]'));
    } else if (!sel.playable) {
      lines.push(h('b', { class: 'ls-guide bad' }, `${sel.name} — 낼 수 없음`));
      lines.push(h('span', { class: 'small' }, sel.deadReason || pv?.reason || ''));
    } else if (pv && !pv.ok && sel.needTaps > (ui.taps || []).length) {
      lines.push(h('b', { class: 'ls-guide' }, `대상 선수를 누르세요 (${(ui.taps || []).length}/${sel.needTaps})`));
      lines.push(h('span', { class: 'small' }, h('span', { class: 'lg-ok' }, '초록'), ' = 고를 수 있음 · ', h('span', { class: 'lg-no' }, '빨강'), ' = 안 됨'));
      lines.push(h('span', { class: 'tiny muted' }, `${sel.name} · Esc = 취소`));
    } else if (pv && pv.ok) {
      const gain = (pv.targets || []).reduce((a, t) => a + (Number(t.gain) || 0), 0);
      const sub = (pv.targets || []).reduce((a, t) => a + (Number(t.sub) || 0), 0);
      const costs = (pv.targets || []).map((t) => Number(t.cost) || 0);
      const head = h('b', { class: 'ls-guide' }, sel.name, sel.plus ? '+' : '');
      lines.push(head);
      if ((pv.targets || []).length) {
        lines.push(h('span', { class: 'ls-pv' },
          h('span', { class: 'good' }, `${statName} +${gain}`),
          sub ? h('span', { class: 'muted' }, ` · ${L.STAT_LABELS[subStat] ?? '부'} +${sub}`) : null,
          costs.some((c) => c > 0) ? h('span', { class: 'warn' }, ` · 체력 −${Math.max(...costs)}`) : null,
          pv.failRate > 0 ? h('span', { class: pv.failRate >= 0.25 ? 'bad' : 'warn' }, ` · 실패 ${pctText(pv.failRate)}`) : h('span', { class: 'muted' }, ' · 실패 없음')));
        if (pv.failRate > 0 && pv.failerId) {
          lines.push(h('span', { class: 'tiny muted' }, `실패하면 ${playerOf(pv.failerId)?.name ?? ''} ${statName} −${data.lesson?.lesson?.failStatLoss ?? 5} (부상 ${pctText(data.lesson?.lesson?.injuryChanceOnFail ?? 0.5)})`));
        }
      } else {
        lines.push(h('span', { class: 'small' }, (cardDescFor(sel) || '').slice(0, 60)));
      }
      if (pv.notes?.length) lines.push(h('ul', { class: 'cf-notes' }, pv.notes.slice(0, 3).map((n) => h('li', {}, n))));
      lines.push(h('span', { class: 'tiny muted' }, '카드를 한 번 더 누르거나 [내기] · Esc = 취소'));
    } else {
      lines.push(h('b', { class: 'ls-guide' }, sel.name));
      if (pv?.reason) lines.push(h('span', { class: 'small' }, pv.reason));
    }
    infoEl.replaceChildren(...lines);
  }
  function cardDescFor(c) {
    const d = c.desc || '';
    const m = d.match(/^강화:\s*(.*?)\s*\/\s*지원:\s*(.*)$/);
    return m ? (c.mode === 'support' ? m[2] : m[1]) : d;
  }

  function renderButtons() {
    const live = isLive() && !ui.busy;
    const sel = selectedCard();
    playBtn.disabled = !(live && sel && sel.playable && pv?.ok);
    restBtn.disabled = !(live && v.canRest);
    endBtn.disabled = !(live && v.canEndTurn);
    restBtn.classList.toggle('active', !!ui.restPick);
    restBtn.title = v.canRest ? `이번 턴 카드 대신 쉬기: 고른 선수 체력 +${restCfg.picked}, 나머지 +${restCfg.others} (턴 끝)` : '쉬기는 그 턴의 첫 행동일 때만';
    endBtn.title = v.canEndTurn ? '남은 추가 사용을 버리고 턴을 끝냅니다' : '카드를 1장 이상 낸 뒤에 턴을 끝낼 수 있습니다 (아니면 쉬기)';
    for (const [b, k] of [[restBtn, 'rest'], [endBtn, 'endTurn']]) {
      const on = live && rec?.kind === k;
      b.classList.toggle('recommended', on);
      const old = b.querySelector('.rec-badge');
      if (on && !old) b.append(h('span', { class: 'badge badge-accent rec-badge' }, '추천'));
      if (!on && old) old.remove();
    }
  }

  /** 전체 갱신 (엔진 뷰 다시 읽기) — 연출이 끝난 뒤 · 고르기가 바뀔 때 */
  function refresh({ deal = false, flash = [] } = {}) {
    if (!alive()) return;
    v = getView(true) || v;
    shown = { score: v.score, stamina: {} };
    rec = isLive() && manager ? safe(() => manager.recommendCard(st(), data)) : null;
    const sel = selectedCard();
    if (ui.selectedUid && !sel) { ui.selectedUid = null; ui.taps = []; }
    pv = sel && isLive() ? (() => { try { return run.previewCard(st(), data, { uid: sel.uid, taps: ui.taps || [] }); } catch (_) { return null; } })() : null;
    screen.classList.toggle('picking', !!(sel && sel.needTaps > (ui.taps || []).length) || !!ui.restPick);
    renderHud();
    if (flash.length) renderChips(flash);
    renderTokens();
    renderSide();
    renderHand(deal);
    renderPiles();
    renderInfo();
    renderButtons();
    scheduleAuto();
  }

  /* ------------------------------------------------------------------ */
  /* 조작                                                                 */
  /* ------------------------------------------------------------------ */
  function onCard(uid) {
    if (!isLive() || ui.busy) return;
    ui.restPick = false;
    const c = (v.hand || []).find((x) => x.uid === uid);
    if (!c) return;
    if (!c.playable) { toast(`${c.name}: ${c.deadReason || '지금은 낼 수 없습니다'}`, 'info', 2200); return; }
    if (ui.selectedUid === uid) {
      if (pv?.ok) playSelected();
      return;
    }
    ui.selectedUid = uid;
    ui.taps = [];
    refresh();
  }
  function onToken(id) {
    if (!isLive() || ui.busy) return;
    if (ui.restPick) { doRest(id); return; }
    const sel = selectedCard();
    if (!sel || !(sel.needTaps > 0)) return;
    const taps = (ui.taps || []).slice();
    const at = taps.indexOf(id);
    if (at >= 0) {
      taps.splice(at, 1);
    } else {
      const cands = new Set([...(pv?.tapCandidates || []), ...taps]);
      if (!cands.has(id)) {
        const why = (pv?.blocked || []).find((b) => b.id === id)?.reason || '고를 수 없음';
        toast(`${playerOf(id)?.name ?? ''}: ${why}`, 'info', 1800);
        return;
      }
      if (taps.length >= sel.needTaps) taps.pop(); // 다 고른 뒤 다른 선수 = 마지막 선택을 바꾼다
      taps.push(id);
    }
    ui.taps = taps;
    refresh();
  }
  function cancelSelect() {
    if (ui.busy || (!ui.selectedUid && !ui.restPick)) return;
    ui.selectedUid = null;
    ui.taps = [];
    ui.restPick = false;
    refresh();
  }
  function toggleRest() {
    if (!isLive() || ui.busy || !v.canRest) return;
    ui.restPick = !ui.restPick;
    ui.selectedUid = null;
    ui.taps = [];
    refresh();
  }
  function playSelected() {
    const sel = selectedCard();
    if (!isLive() || ui.busy || !sel || !pv?.ok) return;
    const vPrev = v;
    const r = actions.lessonCall('playCard', { uid: sel.uid, taps: (ui.taps || []).slice() });
    ui.selectedUid = null;
    ui.taps = [];
    if (r === undefined) { refresh(); return; }
    animate(vPrev, { kind: 'play', uid: sel.uid });
  }
  function doRest(id) {
    if (!isLive() || ui.busy || !v.canRest) return;
    const vPrev = v;
    ui.restPick = false;
    const r = actions.lessonCall('lessonRest', { playerId: id });
    if (r === undefined) { refresh(); return; }
    animate(vPrev, { kind: 'rest', playerId: id });
  }
  function endTurn() {
    if (!isLive() || ui.busy || !v.canEndTurn) return;
    const vPrev = v;
    ui.selectedUid = null;
    ui.taps = [];
    ui.restPick = false;
    const r = actions.lessonCall('endLessonTurn');
    if (r === undefined) { refresh(); return; }
    animate(vPrev, { kind: 'end' });
  }

  /** 덱 · 버림 더미 보기 (뽑을 더미는 이름순 — 순서는 보이지 않는다) */
  function openPile(which) {
    const L0 = st().lesson;
    if (!L0) return;
    const uids = which === 'draw' ? L0.drawPile : L0.discard;
    const defs = new Map(((data.cards && data.cards.cards) || []).map((c) => [c.id, c]));
    const entryOf = (uid) => (st().deck || []).find((d) => d.uid === uid) || (L0.temp || []).find((d) => d.uid === uid) || null;
    const items = (uids || []).map((uid) => {
      const e = entryOf(uid);
      const d = e ? defs.get(e.cardId) : null;
      return d ? { uid, cardId: d.id, name: d.name, family: d.family, plus: !!e.plus, desc: e.plus && d.descPlus ? d.descPlus : d.desc } : null;
    }).filter(Boolean);
    if (which === 'draw') items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const title = which === 'draw' ? `뽑을 더미 ${items.length}장 (순서는 비밀)` : `버린 더미 ${items.length}장`;
    const m = openModal(h('div', { class: 'col pile-modal' },
      h('h3', {}, title),
      items.length ? h('div', { class: 'pile-grid' }, items.map((it) => miniCard(it, { data }))) : h('p', { class: 'muted' }, '비어 있음'),
      h('div', { class: 'row end modal-foot' }, h('button', { class: 'btn', onclick: () => m.close() }, '닫기'))), { className: 'modal-lg' });
  }

  /* ------------------------------------------------------------------ */
  /* 연출 (§6.3): 우르르 → +N → 복귀 → 턴 끝 틱 · 새 손패 → (레슨 끝) 보상            */
  /* ------------------------------------------------------------------ */
  function pop(spot, text, tone = 'good', extra = '') {
    const [x, y] = toPx(spot);
    const dy = TOKEN_PX * 0.95;
    // 위 터치라인에 붙은 자리(피지컬 훈련 y 9)는 토큰 아래에 — 잔디 밖으로 잘리지 않게
    const py = spot.y < 12 ? y + dy : Math.max(12, y - dy);
    const el = h('div', { class: ['m-pop', 'c', 'ls-pop', tone, extra], style: { transform: `translate(${round1(x)}px, ${round1(py)}px)` } },
      h('span', {}, text));
    el.style.setProperty('--t-pop', `${reduced ? 900 : 1300}ms`);
    popLayer.append(el);
    later(() => el.remove(), 1400);
    return el;
  }
  const centerPop = (text, tone = 'good', extra = 'big') => pop({ x: 50, y: 50 }, text, tone, extra);
  function spotOfTok(id) {
    const el = tokEls.get(id);
    const p = playerOf(id);
    if (el && el.dataset.x) return { x: Number(el.dataset.x), y: Number(el.dataset.y) };
    return p ? homeSpot(p) : { x: 50, y: 50 };
  }

  function animate(vPrev, act) {
    setBusy(true);
    pv = null; // 고른 카드 미리보기(점수 막대 줄무늬 · 말풍선)는 지운다
    const L1 = st().lesson;
    const plan = fxPlan(L1?.lastFx || []);
    ui.shownSeq = L1?.seq ?? ui.shownSeq;
    const vNew = getView(true) || v;
    const ended = st().phase !== 'lesson' || vNew.status !== 'playing';
    // 보여 주는 값: 처음에는 이전 점수 · 체력, 단계마다 바꾼다
    v = vPrev;
    shown = { score: vPrev.score, stamina: {}, turn: vPrev.turn };
    for (const p of vPrev.players) shown.stamina[p.id] = Math.max(0, (Number(p.stamina) || 0) - (plan.play.cost[p.id] || 0));
    // 낸 카드는 손패에서 빠진다 (날아가기)
    if (act.kind === 'play') {
      const el = handEl.querySelector(`.card-face[data-uid="${act.uid}"]`);
      if (el) el.classList.add('played');
    }
    renderInfo();
    renderButtons();
    renderTokens();
    renderSide();
    const targets = plan.play.targets;
    const spots = drillSpots(v.stat, targets);
    const stepA = () => {
      if (targets.length) {
        drillLayer.classList.add('active');
        screen.classList.add('drilling-on'); // 훈련하지 않는 선수는 옅게 (훈련장 자리와 겹쳐도 대상이 보이게)
        for (const id of targets) {
          const el = tokEls.get(id);
          if (!el) continue;
          el.classList.add('drilling');
          placeTok(el, spots[id]);
        }
      }
      // 쉬기 · 회복 카드 (대상 없음): 회복 팝은 바로
      if (!targets.length) stepB();
      else later(stepB, LESSON_T.move);
    };
    const stepB = () => {
      v = vNew;
      shown.score = scoreAfterPlay(plan, vNew.score);
      for (const p of vNew.players) shown.stamina[p.id] = Number(p.stamina) || 0;
      for (const id of targets) {
        const g = plan.play.gain[id];
        const f = plan.play.fail[id];
        const sp = spots[id] || spotOfTok(id);
        if (f) pop(sp, f.injured ? `부상! −${f.n}` : `실패 −${f.n}`, 'bad'); // 실패 팝은 위 층 (css .ls-pop.bad)
        // 대상이 많으면 주 스탯만 (부 스탯은 오른쪽 명단 · 결과 화면에서)
        else if (g) pop(sp, g.sub && targets.length <= 2 ? `+${g.n}  (${L.STAT_SHORT[subStat] ?? '부'}+${g.sub})` : `+${g.n}`, 'good');
      }
      for (const [id, n] of Object.entries(plan.play.heal)) {
        if (!n) continue;
        const rest = act.kind === 'rest' && act.playerId === id;
        pop(spotOfTok(id), `${rest ? '💤 ' : ''}체력 ${n > 0 ? '+' : ''}${n}`, n > 0 ? 'heal' : 'bad', 'small');
      }
      if (plan.play.tw) pop({ x: 50, y: v.stat === 'physical' ? 50 : v.stat === 'pass' ? 92 : 8 }, `팀워크 +${plan.play.tw}`, 'good', 'small tw');
      renderHud(shown.score);
      const flash = Object.keys(plan.play.buffs);
      if (flash.length) renderChips(flash);
      renderTokens();
      renderSide();
      later(stepC, targets.length ? LESSON_T.hold : 380);
    };
    const stepC = () => {
      drillLayer.classList.remove('active');
      screen.classList.remove('drilling-on');
      for (const id of targets) {
        const el = tokEls.get(id);
        const p = playerOf(id);
        if (!el || !p) continue;
        el.classList.remove('drilling');
        placeTok(el, homeSpot(p));
      }
      later(stepD, targets.length ? LESSON_T.back : 0);
    };
    const stepD = () => {
      if (plan.turn && plan.turn.turn != null) {
        const ticks = Object.entries(plan.turn.ticks || {}).filter(([, n]) => n > 0);
        for (const [id, n] of ticks) pop(spotOfTok(id), `+${n}`, 'mood', 'small');
        for (const [id, n] of Object.entries(plan.turn.heal || {})) if (n) pop(spotOfTok(id), `체력 +${n}`, 'heal', 'small');
        shown.score = vNew.score;
        shown.turn = vNew.turn;
        renderHud(shown.score);
        const flash = Object.keys(plan.turn.buffs || {});
        if (flash.length) renderChips(flash);
        if (!ended) centerPop(ticks.length ? `턴 ${vNew.turn} — 분위기 +${ticks.reduce((a, [, n]) => a + n, 0)}` : `턴 ${vNew.turn}`, 'turn', 'mid');
        later(stepE, ticks.length ? LESSON_T.tick : LESSON_T.turn);
      } else {
        stepE();
      }
    };
    const stepE = () => {
      if (ended) {
        const status = plan.end?.status || vNew.status;
        for (const [id, n] of Object.entries(plan.end?.auto || {})) if (n) pop(spotOfTok(id), `자율 +${n}`, 'auto', 'small');
        shown.score = vNew.score;
        renderHud(shown.score);
        centerPop(L.LESSON_STATUS_LABELS[status] ?? status, status === 'fail' ? 'bad' : status === 'perfect' ? 'gold' : 'good', 'big');
        infoEl.replaceChildren(h('b', { class: 'ls-guide' }, `레슨 ${L.LESSON_STATUS_LABELS[status] ?? status}`), h('span', { class: 'small muted' }, '결과를 정리하는 중…'));
        later(() => { setBusy(false); ctx.render(); }, LESSON_T.end);
        return;
      }
      setBusy(false);
      refresh({ deal: !!plan.draw });
    };
    stepA();
  }

  /* ------------------------------------------------------------------ */
  /* ?autolesson=1 — 감독 추천 행동을 600ms 마다 (개발 · 스크린샷용)              */
  /* ------------------------------------------------------------------ */
  let autoTimer = null;
  function scheduleAuto() {
    if (!autoMode || !isLive() || ui.busy || autoTimer) return;
    autoTimer = later(() => {
      autoTimer = null;
      if (!isLive() || ui.busy) return;
      const r = manager ? safe(() => manager.recommendCard(st(), data)) : null;
      if (!r) return;
      if (r.kind === 'play') {
        ui.selectedUid = r.uid;
        ui.taps = (r.taps || []).slice();
        refresh();
        later(() => { if (selectedCard()?.uid === r.uid) playSelected(); }, 250);
      } else if (r.kind === 'rest') {
        ui.restPick = false;
        doRest(r.playerId);
      } else {
        endTurn();
      }
    }, LESSON_T.auto);
  }

  // Esc = 취소 (화면이 사라지면 스스로 떼어 낸다)
  const onKey = (e) => {
    if (!alive()) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') cancelSelect();
  };
  if (!inert) document.addEventListener('keydown', onKey);

  // 첫 그리기: 레이아웃이 잡힌 뒤 좌표를 잰다 (토큰은 처음 자리에 트랜지션 없이)
  measure();
  screen.classList.add('no-anim');
  refresh();
  void screen.offsetWidth;
  if (!reduced) screen.classList.remove('no-anim');
  // 스테이지 배율 · 폰트 로드로 필드 크기가 바뀌면 다시 놓는다 (jsdom 은 0 → 기본값 그대로)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (!alive()) return;
      const w0 = W;
      const h0 = H;
      measure();
      if (w0 !== W || h0 !== H) { screen.classList.add('no-anim'); renderTokens(); renderHand(); void screen.offsetWidth; if (!reduced) screen.classList.remove('no-anim'); }
    });
  }
}
