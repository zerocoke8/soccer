// js/ui/screens/event.js — 이벤트 모달 (phase "event")
// 가로 스테이지: 넓은 모달 — 위 = 제목 · 등장 인물, 왼쪽 = 이야기, 오른쪽 = 선택지(효과 미리보기) 세로로. 배경은 훈련 화면(비활성).
import { h, avatar, openModal } from '../dom.js';

export function renderEventModal(ctx) {
  const { store, data, run, safe, actions } = ctx;
  const state = store.run;
  const ev = safe(() => run.getEventView(state, data));

  if (!ev) {
    openModal(h('div', { class: 'col' },
      h('h2', {}, '이벤트'),
      h('p', { class: 'muted' }, '이벤트 내용을 불러올 수 없습니다. 첫 선택지로 진행합니다.'),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => actions.resolveEvent(0) }, '진행'),
    ), { closable: false, className: 'modal-md' });
    return;
  }

  const who = [];
  if (ev.player) {
    who.push(h('div', { class: 'ev-who' },
      avatar(ev.player.portraitColor, ev.player.name, 'md'),
      h('span', { class: 'col' },
        h('b', {}, ev.player.name ?? ''),
        ev.player.slot ? h('span', { class: 'tiny muted' }, `선수 · ${ev.player.slot}`) : h('span', { class: 'tiny muted' }, '선수'))));
  }
  if (ev.support) {
    const sp = ev.support;
    const color = sp.portraitColor ?? data.supports?.find?.((s) => s.id === (sp.id ?? sp))?.portraitColor;
    who.push(h('div', { class: 'ev-who' },
      avatar(color, sp.name ?? '', 'md'),
      h('span', { class: 'col' },
        h('b', {}, sp.name ?? ''),
        h('span', { class: 'row' }, h('span', { class: 'tiny muted' }, '서포트'),
          sp.bond != null ? h('span', { class: 'badge badge-accent' }, `유대 ${sp.bond}`) : null))));
  }

  const choices = Array.isArray(ev.choices) && ev.choices.length ? ev.choices : [{ text: '확인', preview: '' }];

  openModal(h('div', { class: 'col event-modal', style: { gap: '14px' } },
    h('div', { class: 'row between ev-head' },
      h('h2', {}, ev.title ?? '이벤트'),
      h('span', { class: 'badge' }, '이벤트')),
    h('div', { class: 'ev-body' },
      h('div', { class: 'ev-story' },
        who.length ? h('div', { class: 'row wrap ev-cast' }, who) : null,
        h('p', { class: 'event-text' }, ev.text ?? '')),
      h('div', { class: 'ev-choices' },
        h('span', { class: 'tiny muted' }, '감독의 결정'),
        h('div', { class: 'btn-list' }, choices.map((c, i) =>
          h('button', { class: ['btn', 'choice-btn', i === 0 ? 'btn-primary' : ''], onclick: () => actions.resolveEvent(i) },
            h('span', {}, c?.text ?? `선택 ${i + 1}`),
            c?.preview ? h('span', { class: 'preview' }, c.preview) : null,
          ))))),
  ), { closable: false, className: 'modal-lg' });
}
