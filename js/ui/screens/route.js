// js/ui/screens/route.js — 시즌 사이 루트 선택 (phase "route")
import { h, section } from '../dom.js';
import * as L from '../labels.js';

export function renderRoute(root, ctx) {
  const { store, data, actions } = ctx;
  const state = store.run;
  const routes = Array.isArray(data.routes) ? data.routes : [];
  const byId = new Map(routes.map((r) => [r.id, r]));
  const ids = Array.isArray(state?.pendingRoutes) && state.pendingRoutes.length
    ? state.pendingRoutes
    : routes.map((r) => r.id);

  const opponents = new Map((data.opponents || []).map((o) => [o.id, o]));
  const goalMatches = state?.record?.goalMatches || [];
  const thisSeason = goalMatches.filter((g) => g.season === state?.season);

  root.append(h('div', { class: 'screen' },
    h('div', { class: 'screen-title' },
      h('h2', {}, `시즌 ${state?.season ?? '?'} 종료`),
      h('span', { class: 'badge' }, `패배 ${state?.record?.losses ?? 0}`)),
    thisSeason.length
      ? section('이번 시즌 경계전', thisSeason.map((g) =>
        h('div', { class: 'row between small' },
          h('span', {}, `vs ${opponents.get(g.opponentId)?.name ?? g.opponentId}`),
          h('span', { class: g.win ? 'good' : 'bad' }, L.scoreLabel(g)))))
      : null,
    section('다음 시즌 루트 선택',
      h('p', { class: 'muted small' }, '세 갈래 중 하나를 고르세요. 효과는 다음 시즌에 적용됩니다.'),
      h('div', { class: 'btn-list' }, ids.map((id) => {
        const r = byId.get(id) || { id, name: id, description: '' };
        return h('button', { class: 'btn relic-card route-card', onclick: () => actions.chooseRoute(id) },
          h('div', { class: 'row between', style: { width: '100%' } },
            h('span', { class: 'name' }, r.name ?? id),
            r.forcedFriendly ? h('span', { class: 'badge badge-warn' }, '친선전 강제') : null),
          h('span', { class: 'desc' }, r.description ?? ''),
        );
      }))),
    h('p', { class: 'muted tiny center' }, `seed ${state?.seed ?? ''}`),
  ));
}
