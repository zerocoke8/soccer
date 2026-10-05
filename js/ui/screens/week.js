// js/ui/screens/week.js — 주 선택 화면 (phase week; 이벤트 · 유물 모달의 배경으로도 쓴다 — inert)
// LESSON_PROTO_PLAN §6.3 "주 선택 화면". grid "top top" "main roster" "bar roster", columns 1fr | 350:
//   ┌ topbar (hud.js) ───────────────────────────────────────────────────────────────────────┐
//   │ 머리 줄: n주차 · 주 종류 · 안내                                │ 선수 7 (hud.roster)        │
//   │ 레슨 주 · 대비 주: 중점 구역 카드 5장(150×260) + [휴식]          │  체력 · 스탯 · 결장         │
//   │ 자유 주: 행동 카드 3장(220×260, 보장 배지) + [휴식]              │ 코치 유대 (눈금 = 80)       │
//   │ 대비 주: 대비 카드 2장 미리보기                                  │                            │
//   │ 시즌 일정 줄 (1~5주 · 보장 행동 · ⚔ 경계전)                      │                            │
//   ├ 아래 줄: [덱 보기 N] [유물 · 보정 · 기록] [✦ 패시브 · SP ③]  (♨️ 무료 외출 — 온천)  │ 코치 파티 패시브 (코치마다) │
//   └────────────────────────────────────────────────────────────────┴────────────────────────────┘
// [✦ 패시브] = SP 패시브 상점 모달 (js/ui/passives.js, L48 — ③ = 지금 SP 로 살 수 있는 수 view.shopBuyable). 사고 닫으면 다시 그린다.
// 추천 = manager.recommendWeek → 그 카드 · 버튼에 .recommended + "추천" 배지 (이유는 title). 자동 진행 버튼은 없다 (§5.5).
// 자유 주 행동: 상담 → 상담 화면, 전술 미팅 → meetingEditor 모달(modal-xl), 외출 → 선수 고르기 모달(modal-md), 친선전 → 확인 모달.
// inert (이벤트 · 유물 배경): 모든 버튼 disabled + .inert.
import { h, avatar, bar, openModal, closeOverlays } from '../dom.js';
import * as L from '../labels.js';
import { hudTopbar, hudRoster, openRecords, stamCls } from '../hud.js';
import { meetingEditor } from '../meeting.js';
import { targetText } from '../cards.js';
import { passiveShopButton, openPassiveShop } from '../passives.js';
import { playerArt } from '../art.js';

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
  const isRec = (a) => !!rec && rec.type === a.type && (a.zone == null || rec.zone === a.zone) && !!rec.free === !!a.free;
  const recBadge = (a) => (isRec(a) ? h('span', { class: 'badge badge-accent rec-badge', title: rec.reason ? `감독 추천 — ${rec.reason}` : '감독 추천' }, '추천') : null);
  const act = (action) => { if (live) actions.weekAction(action); };
  const kind = view.kind;
  const players = Array.isArray(view.players) ? view.players : [];
  const cardDefs = new Map(((data.cards && data.cards.cards) || []).map((c) => [c.id, c]));
  const fr = data.config?.friendly || {};
  const focusCfg = data.lesson?.lesson?.focus || {};
  const specialCfg = data.lesson?.lesson?.special || {};
  const outingCfg = data.lesson?.outing || {};
  const outingText = `고른 선수 +${outingCfg.picked ?? 20} · 전원 +${outingCfg.team ?? 10} · 컨디션 +${outingCfg.condition ?? 1}`;

  // ---------- 이번 주 ----------
  let cardsRow;
  if (kind === 'lesson' || kind === 'prep') {
    // 중점 구역 카드 (§14.10 · §14.16): 아이콘 · 구역 이름 · "서 있을 확률 ×2 · 상승 ×1.5" · 예상 인원(expected) · ★특별(×2.0, 목표).
    // 턴 수 · 일반 목표는 머리 줄에 한 번.
    const weight = focusCfg.weight ?? 2;
    cardsRow = (view.lessons || []).map((ls) => {
      const a = { type: 'lesson', zone: ls.zone };
      const mult = ls.special ? (focusCfg.specialMult ?? 2) : (focusCfg.mult ?? 1.5);
      const exp = Number(ls.expected);
      const expText = Number.isFinite(exp) ? exp.toFixed(1) : '?';
      return h('button', {
        class: ['btn', 'week-card', 'week-lesson', ls.special ? 'special' : '', ls.prep ? 'prep' : '', isRec(a) ? 'recommended' : ''],
        disabled: !live,
        dataset: { zone: ls.zone },
        title: `${L.zoneLabel(ls.zone)} 중점 ${ls.prep ? '대비 ' : ls.special ? '특별 ' : ''}레슨 · ${ls.turns}턴 · 목표 ${ls.target} · 퍼펙트 ${ls.cap}\n`
          + `선수가 이 구역에 서 있을 확률 ×${weight} · 이 구역 스탯 상승 ${L.multText(mult)} · 예상 ${expText}명`,
        onclick: () => act(a),
      },
      h('span', { class: 'wl-tags' },
        ls.special ? h('span', { class: 'badge badge-gold' }, '★ 특별') : null,
        ls.prep ? h('span', { class: 'badge badge-warn' }, '대비 레슨') : null,
        recBadge(a)),
      h('span', { class: 'wl-ico', 'aria-hidden': 'true' }, L.ZONE_ICONS[ls.zone] ?? ''),
      h('b', { class: 'wl-name' }, L.zoneLabel(ls.zone)),
      h('span', { class: 'wl-focus tiny' },
        h('span', { class: 'muted' }, `서 있을 확률 ×${weight}`),
        h('span', { class: ls.special ? 'gold' : 'good' }, `상승 ${L.multText(mult)}`)),
      h('span', { class: 'wl-exp' },
        h('span', { class: 'wl-k tiny muted' }, '예상 인원'), h('b', {}, expText), h('span', { class: 'small muted' }, '명')),
      ls.special
        ? h('span', { class: 'wl-target gold tiny' }, '목표 ', h('b', {}, ls.target), ` · 퍼펙트 ${ls.cap}`)
        : ls.prep ? h('span', { class: 'wl-sub tiny' }, prepBoost(ls.zone) ? h('span', { class: 'warn' }, `대비 카드 ${prepBoost(ls.zone)}장 ×1.5`) : h('span', { class: 'muted' }, '대비 카드 배율 없음'))
          : h('span', { class: 'wl-sub tiny muted' }, '기본 레슨'));
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
  // 머리 줄: 턴 수 · 일반 목표 · 퍼펙트 한 번 (특별 구역 카드는 자기 목표를 따로 보여 준다)
  const plainLesson = (view.lessons || []).find((l) => !l.special) || view.lessons?.[0] || null;
  const lessonHead = plainLesson
    ? h('span', { class: 'week-lhead' },
      h('span', {}, `${plainLesson.turns}턴`),
      h('span', {}, '목표 ', h('b', { class: 'wlh-target' }, plainLesson.target)),
      h('span', { class: 'muted' }, `퍼펙트 ${plainLesson.cap}`))
    : null;
  const headText = kind === 'prep'
    ? `대비 레슨 — ${prepHint}에 맞춘 대비 카드가 레슨 덱에 들어갑니다. 클리어하면 경계전 컨디션 +1`
    : kind === 'lesson' ? `${L.FOCUS_LABEL}을 고르세요`
      : '행동 하나를 고르세요. 휴식은 늘 열려 있습니다.';
  const focusNote = kind === 'lesson' || kind === 'prep'
    ? h('p', { class: 'week-focus-note tiny muted' },
      `${L.FOCUS_LABEL}: 매 턴 선수가 그 구역에 서 있을 확률 ×${focusCfg.weight ?? 2} · 그 구역 스탯 상승 ${L.multText(focusCfg.mult ?? 1.5)} (기본 훈련 · 카드 모두).`,
      kind === 'lesson' ? h('span', { class: 'gold' }, ` ★ 특별 구역을 고르면 상승 ${L.multText(focusCfg.specialMult ?? 2)} · 목표 ×${specialCfg.targetMult ?? 1.15}`) : null)
    : null;
  const main = h('section', { class: ['og-panel', 'week-main', `wk-${kind}`] },
    h('div', { class: 'og-panel-head week-head' },
      h('h3', { class: 'week-title' }, `${view.week}주차 · `, h('span', { class: `wk-name wk-${kind}` }, L.WEEK_KIND_LABELS[kind] ?? kind ?? '')),
      h('span', { class: 'small muted week-hint ellipsis' }, headText),
      kind === 'lesson' || kind === 'prep' ? lessonHead : null),
    kind === 'prep' ? prepPreview() : null,
    h('div', { class: 'week-mid' },
      h('div', { class: 'week-row' }, cardsRow, h('span', { class: 'week-sep', 'aria-hidden': 'true' }), restBtn),
      focusNote),
    seasonPlan());

  // ---------- 아래 줄 ----------
  const deck = Array.isArray(view.deck) ? view.deck : [];
  const freeA = { type: 'outing', free: true };
  const barEl = h('div', { class: 'week-bar' },
    h('button', { class: 'btn', disabled: inert, onclick: openDeck }, `덱 보기 ${deck.length}`),
    h('button', { class: 'btn btn-ghost', disabled: inert, onclick: () => openRecords(view, ctx) },
      `📜 유물 ${(view.relics || []).length} · 보정 ${(view.modifiers || []).length} · 기록`),
    passiveShopButton(view, { disabled: !live, onClick: openShop }),
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
  /** SP 패시브 상점 (L48): 사면 모달 안만 다시 그리고, 닫을 때 산 게 있으면 주 화면을 다시 그린다 (SP · 배지) */
  function openShop() {
    if (!live) return;
    openPassiveShop(ctx, {
      onBuy: (args) => actions.buyPassive(args, { render: false }),
      onClose: ({ bought }) => { if (bought) ctx.render(); },
    });
  }

  function freeActionText(type) {
    const v = data.config?.meeting?.teamwork ?? 10;
    if (type === 'consult') return ['카드 구매 · 강화 · 삭제 (TP)', '패시브 사기 (SP)', `지금 TP ${view.status?.tp ?? 0} · SP ${view.status?.sp ?? 0}`];
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

  /** 대비 주: 그 구역에 선 대상에게 ×1.5 가 붙는 대비 카드 수 (cards.json mods.lessonMult) */
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

  // 외출 모달 (§24.7 · §24.13 U3): 선수 줄 = 흉상 + 이름 + 체력 + "이야기 n/3화" (안 본 다음 화 — view.players[].story.next) 또는 "일반 외출".
  // 배지는 외출 이벤트 스위치 (lesson.json events.outing) 가 켜져 있을 때만 — 꺼져 있으면 외출 이벤트가 없다.
  function openOuting(free) {
    const recPid = rec && rec.type === 'outing' && !!rec.free === !!free ? rec.playerId : null;
    const picked = Number(outingCfg.picked ?? 20);
    const team = Number(outingCfg.team ?? 10);
    const outingEvents = data.lesson?.events?.outing === true;
    const storyBadge = (p) => {
      if (!outingEvents) return null;
      const s = p.story || {};
      return s.next
        ? h('span', { class: 'badge badge-purple op-story', title: `외출하면 ${p.name} 이야기 ${s.next}화를 봅니다` }, `이야기 ${s.next}/${s.total ?? 3}화`)
        : h('span', { class: 'badge op-story op-plain', title: '이야기를 다 봤습니다 — 일반 외출 이벤트' }, '일반 외출');
    };
    openModal(h('div', { class: 'col outing-modal' },
      h('div', { class: 'row between' },
        h('h3', {}, `${L.FREE_ACTION_ICONS.outing} ${free ? '무료 외출 (온천)' : '외출'} — 누구와 갈까요?`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'small muted' }, `그 선수 +${picked} / 전원 +${team} / 컨디션 +${outingCfg.condition ?? 1}`, free ? ' · 주를 쓰지 않습니다' : ' · 주를 씁니다'),
      // 온천 직후처럼 전원 체력 100 · 컨디션 최고면 외출은 아무것도 바꾸지 않는다 → 미리 알려 준다
      players.every((p) => (Number(p.stamina) || 0) >= 100) && Number(state?.condition) >= (L.CONDITION_LABELS.length - 1)
        ? h('p', { class: 'small warn outing-nogain' }, '지금은 전원 체력 100 · 컨디션 최고라 외출 효과가 없습니다.')
        : null,
      h('div', { class: 'pick-grid outing-grid' }, players.map((p) => {
        const st = Math.round(Number(p.stamina) || 0);
        const after = Math.min(100, st + picked + team);
        const out = Number(p.injuredTurns) > 0;
        const bust = playerArt(ctx, p, 'bust');
        return h('button', {
          class: ['char-pick', 'outing-pick', p.id === recPid ? 'recommended' : ''],
          dataset: { pid: p.id, story: p.story?.next ? String(p.story.next) : '' },
          onclick: () => { closeOverlays(); act({ type: 'outing', playerId: p.id, ...(free ? { free: true } : {}) }); },
        },
        avatar(p.portraitColor, p.name, 'md', ['op-bust', bust ? 'bust' : '', out ? 'dim' : ''], { art: bust || playerArt(ctx, p) }),
        h('span', { class: 'grow col op-who' },
          h('span', { class: 'row op-name' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, p.slot ?? ''),
            out ? h('span', { class: 'badge badge-bad' }, `결장 ${p.injuredTurns}`) : null,
            p.id === recPid ? h('span', { class: 'badge badge-accent', title: rec.reason ?? '' }, '추천') : null),
          h('span', { class: 'row op-sub' }, h('span', { class: 'op-stam' }, bar(st / 100, stamCls(st))), storyBadge(p))),
        h('span', { class: 'op-gain' }, h('span', { class: 'tiny muted op-gain-k' }, '체력 '), h('span', { class: stamCls(st) }, st), h('span', { class: 'muted' }, ' → '), h('b', { class: stamCls(after) }, after)));
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
      footNote: '패시브는 [✦ 패시브]에서 SP로, 액티브는 코치 수업으로 배웁니다.',
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
          h('span', { class: 'tiny muted ellipsis' }, [L.CARD_FAMILY_LABELS[c.family] ?? c.family ?? '', def ? targetText({}, def) : ''].filter(Boolean).join(' · ')));
      }))),
    { className: 'modal-lg' });
  }
}
