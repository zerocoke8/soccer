// js/ui/screens/route.js — 시즌 사이 루트 선택 (phase "route")
// 가로 스테이지: 위 = 시즌 진행 길(시즌마다 경계전 결과), 아래 = 루트 카드 3장이 갈림길처럼 한 줄로
import { h, panel } from '../dom.js';
import * as L from '../labels.js';

export function renderRoute(root, ctx) {
  const { store, data, actions } = ctx;
  const state = store.run;
  const cfg = data.config || {};
  const routes = Array.isArray(data.routes) ? data.routes : [];
  const byId = new Map(routes.map((r) => [r.id, r]));
  // 카드 레슨 시험판: 루트 설명 덮어쓰기 (data/lesson.json routeOverrides — 온천 = 다음 시즌 1주차 무료 외출, LESSON_PROTO_PLAN D4)
  const overrides = data.lesson?.routeOverrides || {};
  const ids = Array.isArray(state?.pendingRoutes) && state.pendingRoutes.length
    ? state.pendingRoutes
    : routes.map((r) => r.id);

  const opponents = new Map((data.opponents || []).map((o) => [o.id, o]));
  const goalMatches = state?.record?.goalMatches || [];
  const season = Number(state?.season) || 0;
  const seasons = Math.max(Number(cfg.seasons) || 3, season + 1);

  // ---- 시즌 진행 길: 지난 시즌 = 경계전 결과, 이번 시즌 = 방금 끝남(강조), 다음 시즌 = 루트 효과가 적용될 곳 ----
  const nodes = Array.from({ length: seasons }, (_, i) => {
    const sn = i + 1;
    const games = goalMatches.filter((g) => g.season === sn);
    const cls = sn < season ? 'past' : sn === season ? 'now' : sn === season + 1 ? 'next' : 'later';
    return h('div', { class: ['sp-node', cls] },
      h('span', { class: 'sp-dot' }, sn <= season ? (games.some((g) => g.win) ? '✔' : games.length ? '✖' : '•') : sn),
      h('span', { class: 'sp-label' },
        h('b', {}, `시즌 ${sn}`),
        sn === season ? h('span', { class: 'badge badge-accent' }, '이번 시즌 경계전') : null,
        sn === season + 1 ? h('span', { class: 'badge badge-warn' }, '다음 시즌') : null),
      games.length
        ? games.map((g) => h('span', { class: 'small row sp-game' },
          h('span', { class: 'ellipsis' }, `vs ${opponents.get(g.opponentId)?.name ?? g.opponentId}`),
          h('b', { class: g.win ? 'good' : 'bad' }, L.scoreLabel(g))))
        : h('span', { class: 'tiny muted' }, sn === season + 1 ? '루트 선택 후 시작' : sn > season ? '예정' : '경계전 기록 없음'));
  });

  root.append(h('div', { class: 'screen og route-screen' },
    h('header', { class: 'og-head' },
      h('h2', {}, `시즌 ${state?.season ?? '?'} 종료`),
      h('span', { class: 'badge' }, `패배 ${state?.record?.losses ?? 0}`),
      h('span', { class: 'grow' }),
      h('span', { class: 'muted tiny' }, `seed ${state?.seed ?? ''}`)),

    panel('시즌 진행', { cls: 'season-path' }, h('div', { class: 'sp-track' }, nodes)),

    panel('다음 시즌 루트 선택', {
      cls: 'route-pick grow-panel',
      right: h('span', { class: 'muted small' }, '세 갈래 중 하나를 고르세요. 효과는 다음 시즌에 적용됩니다.'),
    },
    ids.length === 3 ? h('div', { class: 'route-fork', 'aria-hidden': 'true' }, h('i')) : null,
    h('div', { class: 'route-row' }, ids.map((id) => {
      const r = byId.get(id) || { id, name: id, description: '' };
      return h('button', { class: 'btn relic-card route-card', onclick: () => actions.chooseRoute(id) },
        h('span', { class: 'route-ico', 'aria-hidden': 'true' }, L.ROUTE_ICONS[id] ?? L.ROUTE_ICON_FALLBACK),
        h('div', { class: 'row between', style: { width: '100%' } },
          h('span', { class: 'name' }, r.name ?? id),
          r.forcedFriendly ? h('span', { class: 'badge badge-warn' }, '친선전 강제') : null),
        h('span', { class: 'desc' }, overrides[id]?.description ?? r.description ?? ''),
        h('span', { class: 'pick tiny' }, '이 길로 간다 →'),
      );
    }))),
  ));
}
