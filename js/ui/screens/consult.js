// js/ui/screens/consult.js — 상담 화면 (phase consult)
// [U1 임시 화면] LESSON_PROTO_PLAN §6.3 의 완성 화면(cardFace 진열 · miniCard 덱 그리드 · 강화 후 미리보기 · 고유 카드 삭제 확인)은 U4 가 만든다.
// 지금은 3단(진열 · 덱 · 스킬)을 글 버튼으로 — 버튼 1개 = 엔진 consultAction 1번(저장) → 다시 그리기. 오류는 토스트.
import { h, panel } from '../dom.js';
import * as L from '../labels.js';

export function renderConsult(root, ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'consult-screen'] });
  root.append(screen);
  const v = safe(() => run.getConsultView(state, data));
  if (!v) {
    screen.append(h('div', { class: 'error-panel' }, '상담 화면 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.endConsult() }, '상담 끝내기'));
    return;
  }
  const rec = manager ? safe(() => manager.recommendConsult(state, data)) : null;
  const nameOf = (pid) => (v.players || []).find((p) => p.id === pid)?.name ?? pid;
  const sel = store.consultUi.selectedUid;

  const stock = panel(`진열 ${v.stock.length}`, { cls: 'cs-stock' }, v.stock.map((s, i) =>
    h('div', { class: ['cs-item', s.bought ? 'bought' : ''] },
      h('span', { class: 'col grow' },
        h('b', {}, s.card.name),
        h('span', { class: 'tiny muted' }, `${L.CARD_FAMILY_LABELS[s.card.family] ?? s.card.family} · ${s.card.desc || ''}`)),
      h('button', {
        class: 'btn btn-sm', disabled: s.bought || !s.affordable,
        onclick: () => actions.consultAction({ op: 'buy', index: i }),
      }, s.bought ? '구매함' : `${s.price} TP`))));

  const deck = panel(`덱 ${v.deck.length}`, {
    cls: 'cs-deck',
    right: h('span', { class: 'tiny muted' }, `강화 ${v.prices.upgrade} TP (남은 ${v.upgradesLeft}) · 삭제 ${v.prices.delete} TP (남은 ${v.deletesLeft}) · 최소 ${v.minDeck}장`),
  }, h('div', { class: 'cs-deck-grid' }, v.deck.map((c) => h('button', {
    class: ['btn', 'btn-sm', 'cs-card', `fam-${c.family}`, sel === c.uid ? 'active' : ''],
    title: c.desc || '',
    onclick: () => { store.consultUi.selectedUid = sel === c.uid ? null : c.uid; ctx.render(); },
  }, `${c.name}${c.plus ? '+' : ''}`))),
  sel ? h('div', { class: 'row cs-ops' },
    h('span', { class: 'small grow' }, (v.deck.find((c) => c.uid === sel) || {}).desc || ''),
    h('button', {
      class: 'btn btn-sm', disabled: !(v.upgradesLeft > 0) || v.tp < v.prices.upgrade || !(v.deck.find((c) => c.uid === sel) || {}).canUpgrade,
      onclick: () => actions.consultAction({ op: 'upgrade', uid: sel }),
    }, `강화 ${v.prices.upgrade} TP`),
    h('button', {
      class: 'btn btn-sm btn-danger', disabled: !(v.deletesLeft > 0) || v.tp < v.prices.delete || v.deck.length <= v.minDeck,
      onclick: () => {
        const c = v.deck.find((x) => x.uid === sel);
        if (c?.family === 'unique' && !confirm(`고유 카드 「${c.name}」를 지울까요?`)) return;
        store.consultUi.selectedUid = null;
        actions.consultAction({ op: 'delete', uid: sel });
      },
    }, `삭제 ${v.prices.delete} TP`)) : h('p', { class: 'tiny muted' }, '카드를 누르면 강화 · 삭제할 수 있습니다.'));

  const skills = panel('스킬 (SP)', { cls: 'cs-skills' }, v.skills.length
    ? v.skills.map((sk) => h('div', { class: ['cs-item', sk.affordable && sk.eligiblePlayers.length ? '' : 'disabled'] },
      h('span', { class: 'col grow' },
        h('b', {}, `${sk.name} Lv${sk.level}`),
        h('span', { class: 'tiny muted' }, `${sk.cost} SP · ${sk.eligiblePlayers.length ? `${nameOf(sk.eligiblePlayers[0])}에게` : '배울 선수 없음'}`)),
      h('button', {
        class: 'btn btn-sm', disabled: !sk.affordable || !sk.eligiblePlayers.length,
        onclick: () => actions.consultAction({ op: 'skill', skillId: sk.skillId, playerId: sk.eligiblePlayers[0] }),
      }, '배우기')))
    : h('p', { class: 'tiny muted' }, '힌트를 얻은 스킬이 없습니다. 레슨을 클리어하면 코치 힌트를 얻습니다.'));

  const recText = !rec ? '' : rec.op === 'end' ? '끝내기' : ({ buy: '구매', upgrade: '강화', delete: '삭제', skill: '스킬' })[rec.op] ?? rec.op;
  screen.append(
    h('header', { class: 'og-head' },
      h('h2', {}, '🗂️ 상담'),
      h('span', { class: 'status-chip' }, 'TP ', h('b', {}, v.tp)),
      h('span', { class: 'status-chip' }, 'SP ', h('b', {}, v.sp)),
      h('span', { class: 'badge badge-warn', title: '완성 화면은 다음 작업 단계(U4)에서 만듭니다' }, '임시 화면'),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'btn', disabled: !rec,
        onclick: () => { if (!rec) return; if (rec.op === 'end') actions.endConsult(); else actions.consultAction(rec); },
      }, `감독 추천 (${recText})`),
      h('button', { class: 'btn btn-primary', onclick: () => actions.endConsult() }, '상담 끝내기')),
    h('div', { class: 'consult-cols' }, stock, deck, skills));
}
