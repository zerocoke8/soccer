// js/ui/screens/lesson.js — 레슨 화면 (phase lesson; reward 모달의 배경 — inert)
// [U1 임시 화면] LESSON_PROTO_PLAN §6.3 의 완성 화면(경기장 · 토큰 · 손패 dock · 탭 · 연출 루프 · ?autolesson=1)은 U3 가 만든다.
// 지금은 점수 · 버프 칩 · 선수 체력 · 손패를 글로 보여 주고, 기본 버튼으로 진행한다:
//   카드 버튼 = 그 카드 내기 (대상이 필요하면 엔진 미리보기의 첫 후보를 자동으로), [추천 행동] = 감독 AI, [쉬기] = 체력이 가장 낮은 선수, [턴 끝].
// 엔진 호출은 ctx.actions.lessonCall (호출 1번 = 저장 1번, render 없음) → 이 임시 화면은 호출 뒤 ctx.render() 로 다시 그린다.
import { h, bar, panel, toast } from '../dom.js';
import * as L from '../labels.js';
import { stamCls } from '../hud.js';

export function renderLesson(root, ctx, { inert = false } = {}) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'lesson-screen', 'lesson-temp', inert ? 'inert' : ''] });
  root.append(screen);

  let v = null;
  try { v = run.getLessonView(state, data); } catch (e) { if (!inert) { console.error(e); toast(e?.message || String(e), 'error'); } }
  if (!v) {
    if (inert) return; // 보상 모달 배경: 레슨 상태가 없으면 빈 배경
    screen.append(h('div', { class: 'error-panel' }, '레슨 화면 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'));
    return;
  }
  const live = !inert && state.phase === 'lesson' && v.status === 'playing';
  const rec = live && manager ? safe(() => manager.recommendCard(state, data)) : null;

  /** 엔진 1번 → (임시 화면) 다시 그리기. 레슨이 끝나면 phase reward → 보상 모달 */
  const call = (fn, args) => {
    if (!live) return;
    actions.lessonCall(fn, args);
    ctx.render();
  };
  /** 대상이 필요한 카드: 엔진 미리보기(previewCard)의 tapCandidates 첫 후보를 차례로 (임시 — U3 는 토큰을 탭해 고른다) */
  const autoTaps = (uid, need) => {
    const taps = [];
    for (let i = 0; i < need; i++) {
      let pv = null;
      try { pv = run.previewCard(state, data, { uid, taps }); } catch (_) { break; }
      const next = (pv?.tapCandidates || []).find((id) => !taps.includes(id));
      if (!next) break;
      taps.push(next);
    }
    return taps;
  };
  const lowest = () => [...(v.players || [])].sort((a, b) => (Number(a.stamina) || 0) - (Number(b.stamina) || 0))[0]?.id;

  // ---- 머리 줄 ----
  const statName = L.STAT_LABELS[v.stat] ?? v.stat;
  const capR = Math.max(1, Number(v.cap) || 1);
  const head = h('header', { class: 'lt-head' },
    h('div', { class: 'lt-title' },
      h('h2', {}, `${L.STAT_ICONS[v.stat] ?? ''} ${statName} ${v.prep ? '대비 ' : ''}레슨`, v.special ? h('span', { class: 'gold' }, ' ★특별') : null),
      h('span', { class: 'muted small' }, `시즌 ${v.season} · ${v.week}주 · 턴 ${v.turn}/${v.turns} · ${L.LESSON_STATUS_LABELS[v.status] ?? v.status}`)),
    h('div', { class: 'lt-score', title: `점수 ${v.score} · 목표 ${v.target} · 퍼펙트 ${v.cap}` },
      h('span', { class: 'lt-bar' }, bar(v.score / capR, v.score >= v.target ? 'good' : ''), h('i', { class: 'lt-target', style: { left: `${Math.min(100, (v.target / capR) * 100)}%` } })),
      h('span', {}, h('b', {}, v.score), h('span', { class: 'muted' }, ` / 목표 ${v.target} / 퍼펙트 ${v.cap}`))),
    h('div', { class: 'lt-chips' }, (v.chips || []).map((c) => h('span', { class: ['badge', c.policy ? 'badge-accent' : ''] }, `${c.label} ${c.value}`))),
    h('span', { class: 'badge badge-warn', title: '완성 화면은 다음 작업 단계(U3)에서 만듭니다' }, '임시 화면'));

  // ---- 선수 ----
  const players = panel('선수', { cls: 'lt-players' }, h('div', { class: 'lt-pl-grid' }, (v.players || []).map((p) => {
    const st = Number(p.stamina) || 0;
    return h('div', { class: ['lt-pl', p.out ? 'out' : ''], title: `${p.name} · ${p.slot} · 체력 ${st}${p.out ? ' · 결장' : ''}` },
      h('span', { class: 'lt-pl-nm' }, h('b', { class: 'ellipsis' }, p.name), h('span', { class: 'tiny muted' }, ` ${p.slot}`)),
      h('span', { class: 'ro-stam' }, bar(st / 100, stamCls(st)), h('b', { class: stamCls(st) }, st)),
      h('span', { class: 'tiny muted' }, p.out ? '결장' : `대상 ${p.targeted ?? 0}회 · 실패 ${Math.round((Number(p.failRate) || 0) * 100)}%`));
  })));

  // ---- 손패 ----
  const hand = h('div', { class: 'lt-hand' }, (v.hand || []).map((c) => {
    const isRec = rec?.kind === 'play' && rec.uid === c.uid;
    return h('button', {
      class: ['btn', 'btn-col', 'lt-card', `fam-${c.family}`, isRec ? 'recommended' : ''],
      disabled: !live || !c.playable,
      title: c.desc || '',
      dataset: { uid: c.uid },
      onclick: () => call('playCard', { uid: c.uid, taps: c.needTaps ? autoTaps(c.uid, c.needTaps) : [] }),
    },
    h('span', { class: 'lt-card-top' },
      h('b', { class: 'ellipsis' }, `${c.name}${c.plus ? '+' : ''}`),
      isRec ? h('span', { class: 'badge badge-accent' }, '추천') : null),
    h('span', { class: 'tiny muted' }, `${L.CARD_FAMILY_LABELS[c.family] ?? c.family} · ${L.CARD_TARGET_LABELS[c.targetKind] ?? c.targetKind ?? ''}${c.mode === 'support' ? ' · 지원 모드' : ''}`),
    h('span', { class: 'small' }, c.power != null ? `위력 ${c.power}` : '위력 없음', c.cost ? ` · 체력 −${c.cost}` : ''),
    h('span', { class: 'tiny muted lt-desc' }, c.playable ? (c.desc || '') : (c.deadReason || '낼 수 없음')));
  }));

  const recText = !rec ? '' : rec.kind === 'play' ? `${(v.hand || []).find((c) => c.uid === rec.uid)?.name ?? rec.uid}` : rec.kind === 'rest' ? '쉬기' : '턴 끝';
  const dock = h('div', { class: 'lt-dock' },
    h('div', { class: 'lt-piles tiny muted' }, `덱 ${v.piles?.draw ?? 0} · 버림 ${v.piles?.discard ?? 0} · 제외 ${(v.piles?.exhausted ?? 0) + (v.piles?.removed ?? 0)}`,
      h('br'), `남은 사용 ${v.playsLeft ?? 0}`),
    hand,
    h('div', { class: 'lt-btns' },
      h('button', {
        class: 'btn btn-primary', disabled: !live || !rec,
        onclick: () => {
          if (!rec) return;
          if (rec.kind === 'play') call('playCard', { uid: rec.uid, taps: rec.taps || [] });
          else if (rec.kind === 'rest') call('lessonRest', { playerId: rec.playerId });
          else call('endLessonTurn');
        },
      }, `추천 행동${recText ? ` (${recText})` : ''}`),
      h('button', { class: 'btn', disabled: !live || !v.canRest, title: '체력이 가장 낮은 선수 +20, 나머지 +5', onclick: () => call('lessonRest', { playerId: lowest() }) }, '쉬기'),
      h('button', { class: 'btn', disabled: !live || !v.canEndTurn, onclick: () => call('endLessonTurn') }, '턴 끝')));

  screen.append(head, players, dock);
}
