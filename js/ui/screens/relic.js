// js/ui/screens/relic.js — 유물 선택 모달 (phase "relic")
// 가로 스테이지: 유물 후보를 카드로 한 줄에 나란히 (배경은 훈련 화면, 비활성)
import { h, openModal } from '../dom.js';

export function renderRelicModal(ctx) {
  const { store, data, actions } = ctx;
  const state = store.run;
  const ids = Array.isArray(state?.pendingRelicChoices) ? state.pendingRelicChoices : [];
  const relics = Array.isArray(data.relics) ? data.relics : [];
  const byId = new Map(relics.map((r) => [r.id, r]));
  const owned = (state?.relics || []).map((id) => byId.get(id)?.name ?? id);

  // 유물 제시는 경기 승리·루트·이벤트 어디서든 올 수 있으므로 출처를 단정하는 배지는 붙이지 않는다.
  openModal(h('div', { class: 'col', style: { gap: '14px' } },
    h('div', { class: 'row between' },
      h('h2', {}, '🏺 유물 선택'),
      h('span', { class: 'badge badge-gold', title: owned.join(', ') }, `보유 ${(state?.relics || []).length}개`)),
    h('p', { class: 'muted small' }, '라커룸에 둘 유물 하나를 고르세요. 런이 끝날 때까지 유지됩니다.'),
    ids.length === 0
      ? h('p', { class: 'muted' }, '선택할 유물이 없습니다.')
      : h('div', { class: 'relic-row' }, ids.map((id) => {
        const r = byId.get(id) || { id, name: id, description: '' };
        return h('button', { class: ['btn', 'relic-card', r.rarity ? `rar-${r.rarity}` : ''], onclick: () => actions.chooseRelic(id) },
          h('div', { class: 'row between', style: { width: '100%' } },
            h('span', { class: 'name' }, r.name ?? id),
            r.rarity ? h('span', { class: ['badge', `rarity-${r.rarity}`] }, r.rarity) : null),
          h('span', { class: 'desc' }, r.description ?? ''),
          h('span', { class: 'pick tiny' }, '이 유물 고르기'),
        );
      })),
    owned.length ? h('p', { class: 'tiny muted' }, `보유 중: ${owned.join(' · ')}`) : null,
    ids.length === 0
      ? h('button', { class: 'btn btn-block', onclick: () => actions.chooseRelic(null) }, '건너뛰기')
      : null,
  ), { closable: false, className: 'modal-lg' });
}
