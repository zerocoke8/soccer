// js/ui/screens/relic.js — 유물 선택 모달 (phase "relic")
import { h, openModal } from '../dom.js';

export function renderRelicModal(ctx) {
  const { store, data, actions } = ctx;
  const state = store.run;
  const ids = Array.isArray(state?.pendingRelicChoices) ? state.pendingRelicChoices : [];
  const relics = Array.isArray(data.relics) ? data.relics : [];
  const byId = new Map(relics.map((r) => [r.id, r]));

  // 유물 제시는 경기 승리·루트·이벤트 어디서든 올 수 있으므로 출처를 단정하는 배지는 붙이지 않는다.
  openModal(h('div', { class: 'col', style: { gap: '12px' } },
    h('div', { class: 'row between' },
      h('h2', {}, '유물 선택'),
      h('span', { class: 'badge badge-gold' }, `보유 ${(state?.relics || []).length}개`)),
    h('p', { class: 'muted small' }, '라커룸에 둘 유물 하나를 고르세요. 런이 끝날 때까지 유지됩니다.'),
    ids.length === 0
      ? h('p', { class: 'muted' }, '선택할 유물이 없습니다.')
      : h('div', { class: 'btn-list' }, ids.map((id) => {
        const r = byId.get(id) || { id, name: id, description: '' };
        return h('button', { class: 'btn relic-card', onclick: () => actions.chooseRelic(id) },
          h('div', { class: 'row between', style: { width: '100%' } },
            h('span', { class: 'name' }, r.name ?? id),
            r.rarity ? h('span', { class: ['badge', `rarity-${r.rarity}`] }, r.rarity) : null),
          h('span', { class: 'desc' }, r.description ?? ''),
        );
      })),
    ids.length === 0
      ? h('button', { class: 'btn btn-block', onclick: () => actions.chooseRelic(null) }, '건너뛰기')
      : null,
  ), { closable: false });
}
