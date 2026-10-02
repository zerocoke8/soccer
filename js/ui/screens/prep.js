// js/ui/screens/prep.js — 경기 전 준비 화면 (phase prep → [경기 시작] → 경계전)
// [U1 임시 화면] LESSON_PROTO_PLAN §6.3 의 완성 화면(왼쪽 상대 패널 + 오른쪽 meetingEditor 로 전술 · 포메이션 · 배치 편집)은 U2 가 만든다.
// 지금은 상대 정보 · 결장 경고 · 지금 전술을 보여 주고 [경기 시작] = confirmPrep({}) (전술 · 배치 그대로).
import { h, panel } from '../dom.js';
import * as L from '../labels.js';
import { hudTopbar } from '../hud.js';

export function renderPrep(root, ctx) {
  const { store, data, run, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'prep-screen'] });
  root.append(screen);
  const v = safe(() => run.getPrepView(state, data));
  if (!v) {
    screen.append(h('div', { class: 'error-panel' }, '경기 전 준비 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'));
    return;
  }
  const wv = safe(() => run.getWeekView(state, data)); // 상단 바 (주 뷰는 phase 를 검사하지 않는다)
  const nm = v.nextMatch || {};
  const out = (v.players || []).filter((p) => (v.injuredOut || []).includes(p.id));
  let started = false;

  const opp = panel('다음 상대', { cls: 'prep-opp' },
    h('h3', {}, `⚔ ${nm.opponentName ?? '?'}`),
    h('p', { class: 'small' }, `${L.ELEMENT_ICONS[nm.element] ?? ''} ${L.label(L.ELEMENT_LABELS, nm.element, '?')} · ${L.label(L.STYLE_LABELS, nm.style, '?')} · ${nm.possessions ?? '?'}포제션`),
    h('p', { class: 'small muted' }, `상대 ${nm.styleHint ?? '성향 ?'}`),
    v.prepBonus ? h('p', { class: 'small good' }, '대비 레슨 클리어: 경계전 컨디션 +1') : h('p', { class: 'small muted' }, '대비 레슨 보너스 없음'),
    out.length ? h('p', { class: 'small bad' }, `결장 → 유스 출전: ${out.map((p) => p.name).join(', ')}`) : null);
  const tac = panel(`전술 · 포메이션 ${v.formation}`, {
    cls: 'prep-edit',
    right: h('span', { class: 'badge badge-warn', title: '편집은 다음 작업 단계(U2)에서 만듭니다' }, '임시 화면'),
  },
  h('div', { class: 'tac-rows' }, Object.keys(L.TACTIC_LABELS).map((k) =>
    h('div', { class: 'tac-row' }, h('span', { class: 'tiny muted' }, L.TACTIC_LABELS[k]), h('span', { class: 'small' }, L.tacticLabel(k, v.tactics?.[k]))))),
  h('p', { class: 'tiny muted' }, '지금 전술 · 배치 그대로 경기에 나갑니다 (주 · 팀워크를 쓰지 않습니다).'),
  h('div', { class: 'row end' },
    h('button', {
      class: 'btn btn-primary btn-lg prep-go',
      onclick: () => { if (started) return; started = true; actions.confirmPrep({}); },
    }, '경기 시작')));
  screen.append(wv ? hudTopbar(wv, ctx) : h('span'), opp, tac);
}
