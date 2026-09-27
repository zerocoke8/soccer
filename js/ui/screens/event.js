// js/ui/screens/event.js — 이벤트 모달 (phase "event")
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
    ), { closable: false });
    return;
  }

  const who = [];
  if (ev.player) {
    who.push(h('div', { class: 'row' },
      avatar(ev.player.portraitColor, ev.player.name, 'sm'),
      h('span', { class: 'small' }, ev.player.name ?? '')));
  }
  if (ev.support) {
    const sp = ev.support;
    const color = sp.portraitColor ?? data.supports?.find?.((s) => s.id === (sp.id ?? sp))?.portraitColor;
    who.push(h('div', { class: 'row' },
      avatar(color, sp.name ?? '', 'sm'),
      h('span', { class: 'small' }, sp.name ?? ''),
      sp.bond != null ? h('span', { class: 'badge badge-accent' }, `유대 ${sp.bond}`) : null));
  }

  const choices = Array.isArray(ev.choices) && ev.choices.length ? ev.choices : [{ text: '확인', preview: '' }];

  openModal(h('div', { class: 'col', style: { gap: '12px' } },
    h('div', { class: 'row between' },
      h('h2', {}, ev.title ?? '이벤트'),
      h('span', { class: 'badge' }, '이벤트')),
    who.length ? h('div', { class: 'row wrap' }, who) : null,
    h('p', { class: 'event-text' }, ev.text ?? ''),
    h('div', { class: 'btn-list' }, choices.map((c, i) =>
      h('button', { class: ['btn', 'choice-btn', i === 0 ? 'btn-primary' : ''], onclick: () => actions.resolveEvent(i) },
        h('span', {}, c?.text ?? `선택 ${i + 1}`),
        c?.preview ? h('span', { class: 'preview' }, c.preview) : null,
      ))),
  ), { closable: false });
}
