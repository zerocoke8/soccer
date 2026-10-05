// js/ui/screens/prep.js — 경기 전 준비 화면 (phase prep → [경기 시작] → 경계전)
// LESSON_PROTO_PLAN §6.3 "경기 전 준비" (.prep-screen, columns 340 | 1fr):
//   ┌ topbar (hud.js) ─────────────────────────────────────────────────────────────┐
//   │ 다음 상대 (이름 · 원소 · 스타일 · 주 성향 · 포메이션 · 포제션) │ meetingEditor (전술 6 · 포메이션 · 배치) │
//   │ 대비 레슨 클리어: 경계전 컨디션 +1 / 보너스 없음               │                                         │
//   │ 부상 선수 → "레슨만 쉬고 경기는 그대로 출전" (§18.1 — 유스 없음) │                                         │
//   │ 코치 파티 패시브 (이번 경기 내내 — L48)                        │ [✦ 패시브 · SP ③] [경기 시작] = confirmPrep │
//   └──────────────────────────────────────────────────────────────┴─────────────────────────────────────────┘
// 경기 전 준비는 주와 팀워크를 쓰지 않는다 (팀워크 +10 표시 없음). [경기 시작] = lessonRun.confirmPrep({ tactics, formation?, swaps? }) 1번.
// [✦ 패시브] = SP 패시브 상점 모달 (js/ui/passives.js). 사도 화면을 다시 그리지 않는다 — 편집 중인 전술 · 배치를 지키고 상단 바 · 버튼만 고친다.
import { h, avatar, panel } from '../dom.js';
import * as L from '../labels.js';
import { hudTopbar } from '../hud.js';
import { meetingEditor } from '../meeting.js';
import { passiveShopButton, openPassiveShop, partyPassiveRows } from '../passives.js';
import { playerArt } from '../art.js';

export function renderPrep(root, ctx) {
  const { store, data, run, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'prep-screen'] });
  root.append(screen);
  const v = safe(() => run.getPrepView(state, data));
  if (!v) {
    screen.classList.add('og-error');
    screen.append(h('div', { class: 'error-panel' }, '경기 전 준비 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'));
    return;
  }
  const wv = safe(() => run.getWeekView(state, data)); // 상단 바 (주 뷰는 phase 를 검사하지 않는다)
  const nm = v.nextMatch || {};
  const players = Array.isArray(v.players) ? v.players : [];
  const out = players.filter((p) => (v.injuredOut || []).includes(p.id));
  const counts = nm.styleCounts || {};
  // L46: 주장 2명 이상이면 팀워크 +10 은 1명분 (§19.14 ②) — 런 선수 charId → 캐릭터 특성
  const captainTxt = L.captainNote(L.captainCount((state?.players || []).map((p) => p.charId), data), data);
  let started = false;

  const fact = (k, val) => h('div', { class: 'po-fact' }, h('span', { class: 'tiny muted' }, k), h('b', {}, val));
  const opp = panel('다음 상대 — 경계전', { cls: 'prep-opp' },
    h('div', { class: 'po-name' },
      h('span', { class: 'po-vs', 'aria-hidden': 'true' }, '⚔'),
      h('span', { class: 'col' },
        h('b', { class: 'po-title ellipsis' }, nm.opponentName ?? '?'),
        h('span', { class: 'small muted' }, `시즌 ${state?.season ?? '?'} 경계전`))),
    h('div', { class: 'po-facts' },
      fact('원소', `${L.ELEMENT_ICONS[nm.element] ?? ''} ${L.label(L.ELEMENT_LABELS, nm.element, '?')}`),
      fact('스타일', L.label(L.STYLE_LABELS, nm.style, '?')),
      fact('포메이션', nm.formation ?? '?'),
      fact('포제션', `${nm.possessions ?? '?'}`)),
    h('div', { class: 'po-hint' },
      h('span', { class: 'tiny muted' }, '주 성향'),
      h('b', {}, nm.styleHint ?? '?'),
      Object.keys(counts).length
        ? h('span', { class: 'tiny muted' }, `필드 선수 ${Object.entries(counts).filter(([, n]) => n > 0).map(([k, n]) => `${L.ACTION_LABELS[k] ?? k} ${n}명`).join(' · ')}`)
        : null,
      L.COUNTER[nm.styleHintKey]
        ? h('span', { class: 'tiny' }, '맞는 수비: ', h('b', { class: 'accent-2' }, L.ACTION_LABELS[L.COUNTER[nm.styleHintKey]]))
        : null),
    h('div', { class: 'divider' }),
    v.prepBonus
      ? h('p', { class: 'small good po-bonus' }, '✔ 대비 레슨 클리어: 경계전 컨디션 +1')
      : h('p', { class: 'small muted po-bonus' }, '대비 레슨 보너스 없음 (대비 레슨을 클리어하지 못했습니다)'),
    out.length
      ? h('div', { class: 'po-out' },
        h('p', { class: 'small' }, `🚑 부상 ${out.length}명 — 레슨만 쉬고 경기는 그대로 출전`),
        h('div', { class: 'row wrap' }, out.map((p) => h('span', { class: 'badge po-out-p', title: `${p.name} — 레슨 결장 ${p.injuredTurns ?? ''}회 · 경기는 출전` }, avatar(p.portraitColor, p.name, 'xs', '', { art: playerArt(ctx, p) }), ` ${p.name} · ${p.slot ?? ''}`))))
      : h('p', { class: 'small muted' }, '부상 선수 없음 — 7명 모두 출전'),
    captainTxt ? h('p', { class: 'po-cap' }, h('span', { class: 'badge cap-note', title: L.traitInfo('captain', data)?.description ?? '' }, captainTxt)) : null,
    // 코치 파티 패시브 (L48): 편성 코치마다 1개 — 이번 경기 내내 (조건이 맞을 때)
    Array.isArray(v.partyPassives) && v.partyPassives.length
      ? h('div', { class: 'po-party' },
        h('span', { class: 'tiny muted po-party-head' }, `코치 파티 패시브 ${v.partyPassives.length} — 이번 경기 내내`),
        partyPassiveRows(v.partyPassives, data, { cls: 'po-pp' }))
      : null,
    h('p', { class: 'tiny muted po-note' }, '경기 전 준비는 주와 팀워크를 쓰지 않습니다. 전술 · 포메이션 · 배치를 바꾼 뒤 경기를 시작하세요.'));

  // [✦ 패시브]: 사면 모달 안만 다시 그린다. 닫을 때 상단 바(SP) · 버튼(배지)만 새 뷰로 바꾼다 (편집기는 그대로)
  let topEl = wv ? hudTopbar(wv, ctx) : h('span');
  let shopBtn = null;
  const makeShopBtn = (view) => passiveShopButton(view, { cls: 'prep-shop', onClick: openShop });
  function openShop() {
    if (started) return;
    openPassiveShop(ctx, {
      onBuy: (args) => actions.buyPassive(args, { render: false }),
      onClose: ({ bought }) => {
        if (!bought) return;
        const nv = safe(() => run.getPrepView(store.run, data));
        const nw = safe(() => run.getWeekView(store.run, data));
        if (nw) { const t = hudTopbar(nw, ctx); topEl.replaceWith(t); topEl = t; }
        if (nv) { const b = makeShopBtn(nv); shopBtn.replaceWith(b); shopBtn = b; }
      },
    });
  }
  shopBtn = makeShopBtn(v);

  const ed = meetingEditor(ctx, {
    state,
    players,
    footNote: `컨디션 ${L.CONDITION_LABELS[v.status?.condition] ?? v.status?.condition ?? '?'} · 팀워크 ${v.status?.teamwork ?? 0}`,
    footExtra: () => shopBtn, // 편집기가 다시 그려도 지금 버튼 (배지를 고치면 바뀐다)
    submitLabel: '경기 시작',
    submitClass: 'btn-lg prep-go',
    onSubmit: (a) => { if (started) return; started = true; actions.confirmPrep(a); },
  });
  const edit = panel('전술 · 포메이션 · 배치', { cls: 'prep-edit' }, ed.el);
  screen.append(topEl, opp, edit);
}
