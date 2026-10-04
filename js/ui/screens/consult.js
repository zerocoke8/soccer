// js/ui/screens/consult.js — 상담 화면 (phase consult)
// LESSON_PROTO_PLAN §6.3 "상담 화면" (.consult-screen, columns 300 | 1fr | 340):
//   ┌ 🗂️ 상담 · 시즌 n · w주   TP 50 · SP 120                                              [상담 끝내기] ┐
//   │ 진열 (3)                │ 덱 (14)  miniCard 4열, 누르면 고름                │ 패시브 스킬 (SP)            │
//   │ [cardFace 0.8] 30 TP    │                                                   │ 스루패스 · 힌트 Lv2 96 SP   │
//   │        [구매]           │ 고른 카드 [cardFace] → [강화 후 cardFace]          │  [선수 select] [배우기]     │
//   │ [cardFace] 20 TP …      │ [강화 30 TP] (남은 1) [삭제 25 TP] (남은 1)        │ 힌트 대기 패시브 · 액티브 안내 │
//   └─────────────────────────┴───────────────────────────────────────────────────┴────────────────────────────┘
// 버튼 1개 = 엔진 consultAction 1번 (actions.consultAction: 저장 → 다시 그리기, 오류는 토스트). 고른 덱 카드 · 스킬 배울 선수는
// §18.5: 상담은 패시브 스킬만 판다 (엔진 뷰가 패시브만 준다). 액티브는 레슨 보상의 코치 수업 (§18.6) — 스킬 칸 아래 안내 한 줄.
// 진열할 패시브 (캐릭터 기준 / 서포트 기준) 는 기획자가 아직 정하지 않았다 — 지금은 "힌트를 받은 패시브" (§18.10 Q1).
// store.consultUi 에 두어 다시 그려도 남는다. 고유 카드 삭제는 확인 모달. 추천 = manager.recommendConsult → 그 자리에 "추천" 배지.
import { h, avatar, openModal, closeOverlays } from '../dom.js';
import * as L from '../labels.js';
import { cardFace, miniCard } from '../cards.js';
import { upgradedView, uniqueNote } from './reward.js';

const OP_LABELS = { buy: '구매', upgrade: '강화', delete: '삭제', skill: '스킬', end: '끝내기' };

export function renderConsult(root, ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'consult-screen'] });
  root.append(screen);
  const v = safe(() => run.getConsultView(state, data));
  if (!v) {
    screen.classList.add('og-error');
    screen.append(h('div', { class: 'error-panel' }, '상담 화면 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.endConsult() }, '상담 끝내기'));
    return;
  }
  const ui = store.consultUi;
  if (!ui.skillPick || typeof ui.skillPick !== 'object') ui.skillPick = {};
  const rec = manager ? safe(() => manager.recommendConsult(state, data)) : null;
  const recBadge = (cls = '') => h('span', { class: ['badge', 'badge-accent', 'cs-rec', cls], title: '감독 추천' }, '추천');
  const players = Array.isArray(v.players) ? v.players : [];
  const playerOf = (pid) => players.find((p) => p.id === pid);
  if (ui.selectedUid && !v.deck.some((c) => c.uid === ui.selectedUid)) ui.selectedUid = null; // 지운 카드
  const sel = ui.selectedUid ? v.deck.find((c) => c.uid === ui.selectedUid) : null;
  const P = v.prices || {};

  // ---------- 진열 ----------
  const stock = h('section', { class: 'og-panel cs-stock' },
    h('div', { class: 'og-panel-head' }, h('h3', { class: 'og-panel-title' }, `진열 ${v.stock.length}장`), h('span', { class: 'tiny muted' }, '1장씩 1번')),
    h('div', { class: 'cs-stock-list' }, v.stock.map((s, i) => {
      const c = s.card;
      const isRec = rec?.op === 'buy' && rec.index === i;
      const why = s.bought ? '구매함' : !s.affordable ? `TP 부족 (${v.tp}/${s.price})` : '';
      return h('div', { class: ['cs-item', s.bought ? 'bought' : '', isRec ? 'recommended' : ''], dataset: { index: String(i) } },
        h('div', { class: 'cs-face' }, cardFace(c, { data, players, el: 'div' })),
        h('div', { class: 'cs-buy' },
          h('span', { class: 'tiny muted' }, `${L.CARD_FAMILY_LABELS[c.family] ?? c.family}${c.family === 'coach' ? ' 카드' : ''}`),
          h('b', { class: ['cs-price', s.affordable || s.bought ? '' : 'bad'] }, `${s.price} TP`),
          c.family === 'coach' ? h('span', { class: 'tiny good' }, `유대 +${data.lesson?.bond?.acquire ?? 15}`) : null,
          isRec ? recBadge() : null,
          h('button', {
            class: ['btn', 'btn-sm', 'cs-buy-btn', s.bought ? '' : 'btn-primary'],
            disabled: s.bought || !s.affordable,
            title: why,
            onclick: () => actions.consultAction({ op: 'buy', index: i }),
          }, s.bought ? '구매함' : '구매'),
          why && !s.bought ? h('span', { class: 'tiny bad' }, 'TP 부족') : null));
    })));

  // ---------- 덱 ----------
  const deckRec = (uid) => (rec && (rec.op === 'upgrade' || rec.op === 'delete') && rec.uid === uid ? rec.op : null);
  const grid = h('div', { class: ['cs-deck-grid', v.deck.length > 24 ? 'dense' : ''] }, v.deck.map((c) => {
    const el = miniCard(c, {
      data,
      note: uniqueNote(c, players),
      selected: ui.selectedUid === c.uid,
      onClick: () => { ui.selectedUid = ui.selectedUid === c.uid ? null : c.uid; ctx.render(); },
    });
    const r = deckRec(c.uid);
    if (r) { el.classList.add('recommended'); el.append(h('span', { class: 'mc-rec' }, `추천 ${OP_LABELS[r]}`)); }
    return el;
  }));
  let detail;
  if (!sel) {
    detail = h('div', { class: 'cs-detail empty' },
      h('span', { class: 'cs-detail-ico', 'aria-hidden': 'true' }, '🃏'),
      h('b', {}, '덱에서 카드를 고르세요'),
      h('span', { class: 'small muted' }, `고른 카드를 강화(${P.upgrade} TP) 하거나 지울(${P.delete} TP) 수 있습니다. 강화 · 삭제는 상담 1번에 1번씩.`));
  } else {
    const up = upgradedView(sel);
    const upWhy = !sel.canUpgrade ? (sel.plus ? '이미 강화된 카드' : '강화할 수 없는 카드')
      : !(v.upgradesLeft > 0) ? '이번 상담의 강화를 이미 썼습니다'
        : v.tp < P.upgrade ? `TP 부족 (${v.tp}/${P.upgrade})` : '';
    const delWhy = !(v.deletesLeft > 0) ? '이번 상담의 삭제를 이미 썼습니다'
      : v.deck.length - 1 < v.minDeck ? `덱은 ${v.minDeck}장 아래로 줄일 수 없습니다`
        : v.tp < P.delete ? `TP 부족 (${v.tp}/${P.delete})` : '';
    const doDelete = () => {
      if (sel.family !== 'unique') { actions.consultAction({ op: 'delete', uid: sel.uid }); return; }
      const owner = players.find((p) => p.charId === sel.ownerCharId);
      openModal(h('div', { class: 'col cs-confirm' },
        h('h3', {}, '고유 카드를 지울까요?'),
        h('p', { class: 'small' }, owner ? avatar(owner.portraitColor, owner.name, 'xs') : null, ` 「${sel.name}${sel.plus ? '+' : ''}」 — ${owner?.name ?? '선수'}의 고유 카드`),
        h('p', { class: 'small muted' }, '지우면 이 런에서 되찾을 수 없습니다. 이 선수가 레슨에서 고유 카드(연계 특성 모양 · 캐릭터 효과)를 쓰지 못합니다.'),
        h('div', { class: 'row end modal-foot' },
          h('button', { class: 'btn', onclick: () => closeOverlays() }, '취소'),
          h('button', { class: 'btn btn-danger cs-confirm-del', onclick: () => actions.consultAction({ op: 'delete', uid: sel.uid }) }, `삭제 ${P.delete} TP`))),
      { className: 'modal-md' });
    };
    const r = deckRec(sel.uid);
    detail = h('div', { class: 'cs-detail' },
      cardFace(sel, { data, players, el: 'div' }),
      h('span', { class: 'cs-arrow', 'aria-hidden': 'true' }, '→'),
      up ? cardFace(up, { data, players, el: 'div', tag: '강화 후' })
        : h('div', { class: 'cs-noup' }, h('b', {}, sel.plus ? '이미 강화됨' : '강화 없음'), h('span', { class: 'tiny muted' }, sel.plus ? '강화판은 한 번만' : '이 카드는 강화판이 없습니다')),
      h('div', { class: 'cs-ops' },
        h('button', {
          class: ['btn', 'btn-col', 'cs-upgrade', r === 'upgrade' ? 'recommended' : ''],
          disabled: !!upWhy, title: upWhy,
          onclick: () => actions.consultAction({ op: 'upgrade', uid: sel.uid }),
        }, h('b', {}, `강화 ${P.upgrade} TP`), h('span', { class: 'btn-sub' }, upWhy || `남은 ${v.upgradesLeft}번`)),
        h('button', {
          class: ['btn', 'btn-col', 'btn-danger', 'cs-delete', r === 'delete' ? 'recommended' : ''],
          disabled: !!delWhy, title: delWhy,
          onclick: doDelete,
        }, h('b', {}, `삭제 ${P.delete} TP`), h('span', { class: 'btn-sub' }, delWhy || `남은 ${v.deletesLeft}번${sel.family === 'unique' ? ' · 고유 카드' : ''}`)),
        h('button', { class: 'btn btn-sm cs-unsel', onclick: () => { ui.selectedUid = null; ctx.render(); } }, '선택 해제')));
  }
  const deck = h('section', { class: 'og-panel cs-deck' },
    h('div', { class: 'og-panel-head' },
      h('h3', { class: 'og-panel-title' }, `덱 ${v.deck.length}장`),
      h('span', { class: 'tiny muted cs-deck-rule' },
        `강화 ${P.upgrade} TP · 남은 `, h('b', { class: v.upgradesLeft > 0 ? 'good' : 'muted' }, v.upgradesLeft),
        `  |  삭제 ${P.delete} TP · 남은 `, h('b', { class: v.deletesLeft > 0 ? 'good' : 'muted' }, v.deletesLeft),
        `  |  최소 ${v.minDeck}장`)),
    grid, h('div', { class: 'divider' }), detail);

  // ---------- 스킬 ----------
  const hinted = new Set(v.skills.map((s) => s.skillId));
  const skillDefs = Array.isArray(data.skills) ? data.skills : (data.skills?.skills || []);
  const supportDefs = Array.isArray(data.supports) ? data.supports : (data.supports?.supports || []);
  const waiting = [];
  for (const st of state.supports || []) {
    const sd = supportDefs.find((x) => x.id === st.id);
    for (const id of sd?.hintSkillIds || []) {
      if (hinted.has(id) || waiting.some((w) => w.id === id)) continue;
      const sk = skillDefs.find((x) => x.id === id);
      if (sk && sk.learnable !== false && sk.kind === 'passive') waiting.push({ id, name: sk.name, coach: sd.name });
    }
  }
  const compact = v.skills.length > 5;
  const skillRows = v.skills.map((sk) => {
    const elig = sk.eligiblePlayers || [];
    const isRec = rec?.op === 'skill' && rec.skillId === sk.skillId;
    let pid = ui.skillPick[sk.skillId];
    if (!elig.includes(pid)) pid = isRec && elig.includes(rec.playerId) ? rec.playerId : elig[0] ?? null;
    ui.skillPick[sk.skillId] = pid;
    const why = !elig.length ? '배울 수 있는 선수 없음' : !sk.affordable ? `SP 부족 (${v.sp}/${sk.cost})` : '';
    return h('div', { class: ['cs-skill', why ? 'disabled' : '', isRec ? 'recommended' : ''], dataset: { skill: sk.skillId } },
      h('div', { class: 'cs-sk-top' },
        h('b', { class: 'cs-sk-name ellipsis', title: sk.description || sk.name }, sk.name),
        h('span', { class: 'badge badge-purple cs-sk-lv' }, `힌트 Lv${sk.level}`),
        h('span', { class: 'tiny muted cs-sk-kind' }, L.SKILL_KIND_LABELS[sk.kind] ?? ''),
        isRec ? recBadge() : null,
        h('span', { class: 'grow' }),
        h('b', { class: ['cs-sk-cost', sk.affordable ? '' : 'bad'], title: sk.baseCost !== sk.cost ? `원가 ${sk.baseCost} SP − 힌트 할인` : '' }, `${sk.cost} SP`)),
      compact ? null : h('span', { class: 'tiny muted cs-sk-desc', title: sk.description || '' }, sk.description || ''),
      h('div', { class: 'cs-sk-buy' },
        elig.length
          ? h('select', {
            class: 'select cs-sk-player', 'aria-label': `${sk.name} 배울 선수`,
            onchange: (e) => { ui.skillPick[sk.skillId] = e.target.value; },
          }, elig.map((id) => {
            const p = playerOf(id);
            return h('option', { value: id, selected: id === pid }, `${p?.name ?? id} (${p?.slot ?? ''})`);
          }))
          : h('span', { class: 'tiny muted grow' }, '배울 수 있는 선수 없음'),
        h('button', {
          class: ['btn', 'btn-sm', 'cs-learn', why ? '' : 'btn-primary'],
          disabled: !!why, title: why,
          onclick: () => actions.consultAction({ op: 'skill', skillId: sk.skillId, playerId: ui.skillPick[sk.skillId] }),
        }, '배우기')));
  });
  const skills = h('section', { class: 'og-panel cs-skills' },
    h('div', { class: 'og-panel-head' }, h('h3', { class: 'og-panel-title' }, '패시브 스킬 (SP)'), h('span', { class: 'status-chip' }, 'SP ', h('b', {}, v.sp))),
    skillRows.length
      ? h('div', { class: ['cs-skill-list', compact ? 'compact' : '', v.skills.length > 8 ? 'tight' : ''] }, skillRows)
      : h('p', { class: 'small muted cs-sk-none' }, '힌트를 얻은 패시브 스킬이 없습니다. 레슨을 클리어하면 편성 코치의 힌트를 얻습니다.'),
    waiting.length
      ? h('div', { class: 'cs-wait' },
        h('span', { class: 'tiny muted' }, `힌트 대기 ${waiting.length}개 — 레슨 클리어로 힌트를 얻으면 배울 수 있다`),
        v.skills.length <= 4
          ? h('div', { class: 'cs-wait-chips' }, waiting.slice(0, 12).map((w) => h('span', { class: 'cs-wait-chip', title: `${w.coach} 힌트` }, w.name)))
          : null)
      : null,
    h('p', { class: 'tiny cs-active-note' }, '액티브 스킬은 레슨 보상에서 코치가 가르쳐 줍니다.'));

  // ---------- 머리 줄 ----------
  const endRec = rec?.op === 'end';
  screen.append(
    h('header', { class: 'og-head cs-head' },
      h('h2', {}, '🗂️ 상담'),
      h('span', { class: 'muted small' }, `시즌 ${state.season ?? '?'} · ${state.turn ?? '?'}주 자유 주 — 카드 구매 · 강화 · 삭제 = TP, 패시브 스킬 = SP`),
      h('span', { class: 'grow' }),
      h('span', { class: 'status-chip cs-tp', title: '훈련 포인트' }, 'TP ', h('b', {}, v.tp)),
      h('span', { class: 'status-chip cs-sp', title: '스킬 포인트' }, 'SP ', h('b', {}, v.sp)),
      h('button', {
        class: ['btn', 'btn-primary', 'cs-end', endRec ? 'recommended' : ''],
        title: endRec ? '감독 추천 — 더 할 것이 없습니다' : '',
        onclick: () => actions.endConsult(),
      }, '상담 끝내기', endRec ? h('span', { class: 'cs-end-rec' }, '추천') : null)),
    h('div', { class: 'consult-cols' }, stock, deck, skills));
}
