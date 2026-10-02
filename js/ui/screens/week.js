// js/ui/screens/week.js — 주 선택 화면 (phase week; 이벤트 · 유물 모달의 배경으로도 쓴다 — inert)
// LESSON_PROTO_PLAN §6.3 "주 선택 화면". grid "top top" "main roster" "bar roster", columns 1fr | 350:
//   ┌ topbar (hud.js) ───────────────────────────────────────────────────────────────────────┐
//   │ 머리 줄: n주차 · 주 종류 · 안내                                │ 선수 7 (hud.roster)        │
//   │ 레슨 주 · 대비 주: 종목 카드 5장(150×260) + [휴식]               │  체력 · 스탯 · 결장         │
//   │ 자유 주: 행동 카드 3장(220×260, 보장 배지) + [휴식]              │ 코치 유대 (눈금 = 80)       │
//   │ 대비 주: 대비 카드 2장 미리보기                                  │                            │
//   │ 시즌 일정 줄 (1~5주 · 보장 행동 · ⚔ 경계전)                      │                            │
//   ├ 아래 줄: [덱 보기 N] [유물 · 보정 · 기록]   (♨️ 무료 외출 — 온천)  │                            │
//   └────────────────────────────────────────────────────────────────┴────────────────────────────┘
// 추천 = manager.recommendWeek → 그 카드 · 버튼에 .recommended + "추천" 배지 (이유는 title). 자동 진행 버튼은 없다 (§5.5).
// 자유 주 행동: 상담 → 상담 화면, 전술 미팅 → meetingEditor 모달(modal-xl), 외출 → 선수 고르기 모달(modal-md), 친선전 → 확인 모달.
// inert (이벤트 · 유물 배경): 모든 버튼 disabled + .inert.
import { h, avatar, bar, openModal, closeOverlays } from '../dom.js';
import * as L from '../labels.js';
import { hudTopbar, hudRoster, openRecords, stamCls } from '../hud.js';
import { meetingEditor } from '../meeting.js';

export function renderWeek(root, ctx, { inert = false } = {}) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const screen = h('div', { class: ['screen', 'og', 'week-screen', inert ? 'inert' : ''] });
  root.append(screen);

  // 배경(inert)으로 그릴 때는 오류 토스트를 띄우지 않는다 (모달이 주인공) — 뷰가 없으면 빈 배경
  let view = null;
  if (inert) { try { view = run.getWeekView(state, data); } catch (_) { view = null; } } else view = safe(() => run.getWeekView(state, data));
  if (!view) {
    if (inert) { screen.classList.add('week-blank'); return; }
    screen.classList.add('og-error');
    screen.append(
      h('div', { class: 'error-panel' }, '주 선택 화면 정보를 불러올 수 없습니다.'),
      h('p', { class: 'muted small' }, `phase: ${state?.phase ?? '?'} · 시즌 ${state?.season ?? '?'} · ${state?.turn ?? '?'}주`),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'),
    );
    return;
  }

  const live = !inert && state.phase === 'week';
  const rec = live && manager ? safe(() => manager.recommendWeek(state, data)) : null;
  const isRec = (a) => !!rec && rec.type === a.type && (a.stat == null || rec.stat === a.stat) && !!rec.free === !!a.free;
  const recBadge = (a) => (isRec(a) ? h('span', { class: 'badge badge-accent rec-badge', title: rec.reason ? `감독 추천 — ${rec.reason}` : '감독 추천' }, '추천') : null);
  const act = (action) => { if (live) actions.weekAction(action); };
  const kind = view.kind;
  const players = Array.isArray(view.players) ? view.players : [];
  const cardDefs = new Map(((data.cards && data.cards.cards) || []).map((c) => [c.id, c]));
  const fr = data.config?.friendly || {};
  const outingCfg = data.lesson?.outing || {};
  const outingText = `고른 선수 +${outingCfg.picked ?? 20} · 전원 +${outingCfg.team ?? 10} · 컨디션 +${outingCfg.condition ?? 1}`;
  // 덱에 고유 카드가 있는 선수 (레슨 종목이 주 스탯 쌍이면 강화 모드)
  const deckOwners = new Set((view.deck || []).map((d) => cardDefs.get(d.cardId)).filter((c) => c && c.family === 'unique').map((c) => c.ownerCharId));

  // ---------- 이번 주 ----------
  let cardsRow;
  if (kind === 'lesson' || kind === 'prep') {
    cardsRow = (view.lessons || []).map((ls) => {
      const a = { type: 'lesson', stat: ls.stat };
      const owners = players.filter((p) => deckOwners.has(p.charId) && Array.isArray(p.mainStats) && p.mainStats.includes(ls.stat));
      return h('button', {
        class: ['btn', 'week-card', 'week-lesson', ls.special ? 'special' : '', ls.prep ? 'prep' : '', isRec(a) ? 'recommended' : ''],
        disabled: !live,
        dataset: { stat: ls.stat },
        title: `${L.STAT_LABELS[ls.stat]} ${ls.prep ? '대비 ' : ls.special ? '특별 ' : ''}레슨 · ${ls.turns}턴 · 목표 ${ls.target} · 퍼펙트 ${ls.cap}`,
        onclick: () => act(a),
      },
      h('span', { class: 'wl-tags' },
        ls.special ? h('span', { class: 'badge badge-gold' }, '★ 특별') : null,
        ls.prep ? h('span', { class: 'badge badge-warn' }, '대비 레슨') : null,
        recBadge(a)),
      h('span', { class: 'wl-ico', 'aria-hidden': 'true' }, L.STAT_ICONS[ls.stat] ?? ''),
      h('b', { class: 'wl-name' }, L.STAT_LABELS[ls.stat] ?? ls.stat),
      h('span', { class: 'wl-sub tiny' }, ls.special ? h('span', { class: 'gold' }, '목표 ×1.3 · 상승 +50%')
        : ls.prep ? (prepBoost(ls.stat) ? h('span', { class: 'warn' }, `대비 카드 ${prepBoost(ls.stat)}장 ×1.5`) : h('span', { class: 'muted' }, '대비 카드 배율 없음'))
          : h('span', { class: 'muted' }, '기본 레슨')),
      h('span', { class: 'wl-target' },
        h('span', { class: 'wl-k tiny muted' }, '목표'), h('b', {}, ls.target)),
      h('span', { class: 'wl-cap' },
        h('span', { class: 'wl-k tiny muted' }, '퍼펙트'), h('span', {}, ls.cap)),
      h('span', { class: 'wl-owners', title: owners.length ? `이 종목에서 고유 카드가 강화 모드인 선수 (주 스탯 쌍): ${owners.map((p) => p.name).join(' · ')}` : '이 종목에서 강화 모드인 고유 카드 없음' },
        h('span', { class: 'wl-owners-k tiny muted' }, '고유 카드 강화'),
        h('span', { class: 'wl-owners-av' }, owners.length ? owners.map((p) => avatar(p.portraitColor, p.name, 'xs')) : h('span', { class: 'tiny muted' }, '없음'))));
    });
  } else {
    cardsRow = (view.actions || []).map((x) => {
      const a = { type: x.type };
      return h('button', {
        class: ['btn', 'week-card', 'week-act', isRec(a) ? 'recommended' : ''],
        disabled: !live,
        dataset: { act: x.type },
        onclick: () => onFreeAction(x.type),
      },
      h('span', { class: 'wl-tags' },
        x.guaranteed ? h('span', { class: 'badge badge-purple' }, '이번 시즌 보장') : null,
        recBadge(a)),
      h('span', { class: 'wa-ico', 'aria-hidden': 'true' }, L.FREE_ACTION_ICONS[x.type] ?? ''),
      h('b', { class: 'wa-name' }, L.FREE_ACTION_LABELS[x.type] ?? x.type),
      h('span', { class: 'wa-desc small' }, freeActionText(x.type).map((line) => h('span', {}, line))),
      h('span', { class: 'wa-go tiny' }, freeActionGo(x.type)));
    });
  }
  const restA = { type: 'rest' };
  const restBtn = h('button', {
    class: ['btn', 'week-card', 'week-rest', isRec(restA) ? 'recommended' : ''],
    disabled: !live,
    title: `전원 체력 +${view.restGain ?? 0}, 확률로 컨디션 +1. 주를 씁니다.`,
    onclick: () => act(restA),
  },
  h('span', { class: 'wl-tags' }, recBadge(restA)),
  h('span', { class: 'wa-ico', 'aria-hidden': 'true' }, L.FREE_ACTION_ICONS.rest),
  h('b', { class: 'wa-name' }, '휴식'),
  h('span', { class: 'wr-gain' }, `+${view.restGain ?? 0}`),
  h('span', { class: 'tiny muted' }, '전원 체력'));

  const prepHint = view.nextMatch?.styleHint ? `상대 ${view.nextMatch.styleHint}` : '경계전 상대';
  const headText = kind === 'prep'
    ? `대비 레슨 — ${prepHint}에 맞춘 대비 카드가 레슨 덱에 들어갑니다. 클리어하면 경계전 컨디션 +1`
    : kind === 'lesson' ? `레슨 종목을 고르세요 (${view.lessons?.[0]?.turns ?? '?'}턴). ★ 특별 레슨은 목표가 높은 대신 상승 +50%`
      : '행동 하나를 고르세요. 휴식은 늘 열려 있습니다.';
  const main = h('section', { class: ['og-panel', 'week-main', `wk-${kind}`] },
    h('div', { class: 'og-panel-head week-head' },
      h('h3', { class: 'week-title' }, `${view.week}주차 · `, h('span', { class: `wk-name wk-${kind}` }, L.WEEK_KIND_LABELS[kind] ?? kind ?? '')),
      h('span', { class: 'small muted week-hint ellipsis' }, headText)),
    kind === 'prep' ? prepPreview() : null,
    h('div', { class: 'week-row' }, cardsRow, h('span', { class: 'week-sep', 'aria-hidden': 'true' }), restBtn),
    seasonPlan());

  // ---------- 아래 줄 ----------
  const deck = Array.isArray(view.deck) ? view.deck : [];
  const freeA = { type: 'outing', free: true };
  const barEl = h('div', { class: 'week-bar' },
    h('button', { class: 'btn', disabled: inert, onclick: openDeck }, `덱 보기 ${deck.length}`),
    h('button', { class: 'btn btn-ghost', disabled: inert, onclick: () => openRecords(view, ctx) },
      `📜 유물 ${(view.relics || []).length} · 보정 ${(view.modifiers || []).length} · 기록`),
    h('span', { class: 'grow' }),
    view.freeOuting
      ? h('button', {
        class: ['btn', 'free-outing', isRec(freeA) ? 'recommended' : ''],
        disabled: !live,
        title: `온천 루트 효과 — 이번 주를 쓰지 않는 외출 1번 (${outingText}). 1주차가 끝나면 사라집니다.`,
        onclick: () => openOuting(true),
      }, '♨️ 무료 외출 1 — 온천', recBadge(freeA))
      : null);

  screen.append(hudTopbar(view, ctx), main, hudRoster(view, ctx), barEl);

  // ---------- 도우미 ----------
  function freeActionText(type) {
    const v = data.config?.meeting?.teamwork ?? 10;
    if (type === 'consult') return ['카드 구매 · 강화 · 삭제 (TP)', '스킬 배우기 (SP)', `지금 TP ${view.status?.tp ?? 0} · SP ${view.status?.sp ?? 0}`];
    if (type === 'meeting') return [`팀워크 +${v}`, '전술 · 포메이션 · 배치 변경', `지금 팀워크 ${view.status?.teamwork ?? 0}`];
    if (type === 'friendly') return [`전원 체력 −${fr.staminaCost ?? 30}`, `승리 SP +${fr.skillPointsWin ?? 20} · 패배 SP +${fr.skillPointsLoss ?? 10}`, '승리하면 유물 기회'];
    if (type === 'outing') return [`고른 선수 체력 +${outingCfg.picked ?? 20}`, `전원 체력 +${outingCfg.team ?? 10}`, `컨디션 +${outingCfg.condition ?? 1}`];
    return [];
  }
  function freeActionGo(type) {
    return { consult: '상담 화면으로 →', meeting: '미팅 열기 →', friendly: '확인 후 경기 →', outing: '선수 고르기 →' }[type] ?? '';
  }
  function onFreeAction(type) {
    if (!live) return;
    if (type === 'outing') return openOuting(false);
    if (type === 'meeting') return openMeeting();
    if (type === 'friendly') return confirmFriendly();
    return act({ type });
  }

  /** 대비 주: 그 종목 레슨에서 ×1.5 가 붙는 대비 카드 수 (cards.json mods.lessonMult) */
  function prepBoost(stat) {
    return (view.prepCards || []).filter((id) => (cardDefs.get(id)?.mods?.lessonMult?.stats || []).includes(stat)).length;
  }

  /** 대비 주: 이번 레슨 덱에 들어갈 대비 카드 미리보기 (작은 카드) */
  function prepPreview() {
    const ids = Array.isArray(view.prepCards) ? view.prepCards : [];
    if (!ids.length) return null;
    return h('div', { class: 'prep-minis' },
      h('span', { class: 'tiny muted pm-label' }, `대비 카드 ${ids.length}장`),
      ids.map((id) => {
        const c = cardDefs.get(id);
        return h('div', { class: ['prep-mini', 'fam-prep'], title: c?.desc ?? '' },
          h('b', { class: 'ellipsis' }, c?.name ?? id),
          h('span', { class: 'tiny muted pm-desc' }, c?.desc ?? ''));
      }));
  }

  /** 시즌 일정 줄: 1~5주 종류 · 자유 주 보장 행동 · 경계전 */
  function seasonPlan() {
    const kinds = Array.isArray(view.weekKinds) ? view.weekKinds : [];
    const guaranteed = state?.seasonPlan?.guaranteed || {};
    const week = Number(view.week) || 0;
    const nm = view.nextMatch || {};
    return h('div', { class: 'week-plan', 'aria-label': '이번 시즌 일정' },
      kinds.map((k, i) => {
        const n = i + 1;
        const g = guaranteed[String(n)];
        return h('div', { class: ['wp-item', `wk-${k}`, n < week ? 'done' : n === week ? 'cur' : ''] },
          h('b', {}, `${n}주`),
          h('span', { class: 'tiny' }, L.WEEK_KIND_LABELS[k] ?? k),
          g ? h('span', { class: 'tiny muted' }, `${L.FREE_ACTION_LABELS[g] ?? g} 보장`) : h('span', { class: 'tiny muted' }, k === 'prep' ? '대비 카드' : k === 'lesson' ? '★ 특별 있음' : ''));
      }),
      h('div', { class: 'wp-item wp-match' },
        h('b', {}, '⚔ 경계전'),
        h('span', { class: 'tiny ellipsis' }, nm.opponentName ?? '?'),
        h('span', { class: 'tiny muted' }, '경기 전 준비 후')));
  }

  function openOuting(free) {
    const recPid = rec && rec.type === 'outing' && !!rec.free === !!free ? rec.playerId : null;
    const picked = Number(outingCfg.picked ?? 20);
    const team = Number(outingCfg.team ?? 10);
    openModal(h('div', { class: 'col outing-modal' },
      h('div', { class: 'row between' },
        h('h3', {}, `${L.FREE_ACTION_ICONS.outing} ${free ? '무료 외출 (온천)' : '외출'} — 누구와 갈까요?`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'small muted' }, `그 선수 +${picked} / 전원 +${team} / 컨디션 +${outingCfg.condition ?? 1}`, free ? ' · 주를 쓰지 않습니다' : ' · 주를 씁니다'),
      h('div', { class: 'pick-grid outing-grid' }, players.map((p) => {
        const st = Math.round(Number(p.stamina) || 0);
        const after = Math.min(100, st + picked + team);
        const out = Number(p.injuredTurns) > 0;
        return h('button', {
          class: ['char-pick', 'outing-pick', p.id === recPid ? 'recommended' : ''],
          dataset: { pid: p.id },
          onclick: () => { closeOverlays(); act({ type: 'outing', playerId: p.id, ...(free ? { free: true } : {}) }); },
        },
        avatar(p.portraitColor, p.name, 'md', out ? 'dim' : ''),
        h('span', { class: 'grow col op-who' },
          h('span', { class: 'row op-name' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, p.slot ?? ''),
            out ? h('span', { class: 'badge badge-bad' }, `결장 ${p.injuredTurns}`) : null,
            p.id === recPid ? h('span', { class: 'badge badge-accent', title: rec.reason ?? '' }, '추천') : null),
          h('span', { class: 'op-stam' }, bar(st / 100, stamCls(st)))),
        h('span', { class: 'op-gain' }, h('span', { class: stamCls(st) }, st), h('span', { class: 'muted' }, ' → '), h('b', { class: stamCls(after) }, after)));
      }))), { className: 'modal-md' });
  }

  function openMeeting() {
    const ed = meetingEditor(ctx, {
      state,
      players,
      head: [
        h('h3', {}, `${L.FREE_ACTION_ICONS.meeting} 전술 미팅`),
        h('span', { class: 'row' },
          h('span', { class: 'badge badge-accent' }, `팀워크 +${data.config?.meeting?.teamwork ?? 10}`),
          h('span', { class: 'tiny muted' }, '주를 씁니다')),
      ],
      footNote: '스킬은 상담에서 SP로 배웁니다.',
      submitLabel: '미팅 진행',
      onCancel: closeOverlays,
      onSubmit: (a) => { closeOverlays(); act({ type: 'meeting', ...a }); },
    });
    openModal(ed.el, { className: 'modal-xl meeting-modal', onClose: ed.cancel });
  }

  function confirmFriendly() {
    const nm = view.nextMatch || {};
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h3', {}, `${L.FREE_ACTION_ICONS.friendly} 친선전`),
      h('p', { class: 'small' }, `전원 체력 −${fr.staminaCost ?? 30}. 승리 SP +${fr.skillPointsWin ?? 20} / 패배 SP +${fr.skillPointsLoss ?? 10}. 주를 씁니다.`),
      h('p', { class: 'tiny muted' }, `상대는 경기 시작 때 정해집니다 (경계전 상대 ${nm.opponentName ?? '?'}와 다릅니다).`),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn', onclick: closeOverlays }, '취소'),
        h('button', { class: 'btn btn-primary', onclick: () => { closeOverlays(); act({ type: 'friendly' }); } }, '경기 시작'))),
    { className: 'modal-md' });
  }

  function openDeck() {
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'row between' },
        h('h3', {}, `덱 ${deck.length}장`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('div', { class: 'deck-list' }, deck.map((c) => {
        const def = cardDefs.get(c.cardId);
        return h('span', { class: ['deck-item', `fam-${c.family}`], title: (c.plus ? def?.descPlus : def?.desc) ?? '' },
          h('b', { class: 'ellipsis' }, `${c.name}${c.plus ? '+' : ''}`),
          h('span', { class: 'tiny muted' }, L.CARD_FAMILY_LABELS[c.family] ?? c.family ?? ''));
      }))),
    { className: 'modal-lg' });
  }
}
