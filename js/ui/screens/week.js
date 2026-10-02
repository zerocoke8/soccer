// js/ui/screens/week.js — 주 선택 화면 (phase week; 이벤트 · 유물 모달의 배경으로도 쓴다 — inert)
// [U1 임시 화면] LESSON_PROTO_PLAN §6.3 의 완성 화면(레슨 카드 150×260 · 자유 주 행동 카드 · 외출 모달 · 미팅 편집기)은 U2 가 만든다.
// 지금은 상단 바 · 선수/코치 패널(hud.js) + 이번 주 행동을 기본 버튼으로 낸다 (엔진 lessonRun.applyWeekAction 을 그대로 부른다).
//   ┌ topbar (hud) ───────────────────────────────────────────────┐
//   │ 이번 주 패널: 레슨 5종목 | 자유 주 행동 3 + 휴식          │ 선수 7 · 코치 유대 (hud) │
//   │ 아래 줄: 덱 · 유물/기록 · 감독 추천                        │                          │
//   └─────────────────────────────────────────────────────────────┘
import { h, avatar, bar, openModal, closeOverlays, panel } from '../dom.js';
import * as L from '../labels.js';
import { hudTopbar, hudRoster, openRecords, stamCls } from '../hud.js';

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
  const isRec = (a) => !!rec && rec.type === a.type && (a.stat == null || rec.stat === a.stat);
  const recBadge = (a) => (isRec(a) ? h('span', { class: 'badge badge-accent' }, '추천') : null);
  const act = (action) => { if (live) actions.weekAction(action); };
  const kind = view.kind;
  const cardName = (id) => (data.cards?.cards || []).find((c) => c.id === id)?.name ?? id;

  // ---- 이번 주 ----
  let body;
  if (kind === 'lesson' || kind === 'prep') {
    body = h('div', { class: 'lesson-pick' }, (view.lessons || []).map((ls) => {
      const a = { type: 'lesson', stat: ls.stat };
      return h('button', {
        class: ['btn', 'btn-col', 'week-lesson', ls.special ? 'special' : '', isRec(a) ? 'recommended' : ''],
        disabled: !live,
        dataset: { stat: ls.stat },
        onclick: () => act(a),
      },
      h('span', { class: 'wl-ico', 'aria-hidden': 'true' }, L.STAT_ICONS[ls.stat] ?? ''),
      h('b', { class: 'wl-name' }, L.STAT_LABELS[ls.stat] ?? ls.stat),
      h('span', { class: 'wl-tags' },
        ls.special ? h('span', { class: 'badge badge-gold' }, '★ 특별') : null,
        ls.prep ? h('span', { class: 'badge badge-warn' }, '대비') : null,
        recBadge(a)),
      h('span', { class: 'tiny muted' }, `${ls.turns}턴`),
      h('span', { class: 'wl-target' }, h('b', {}, ls.target), h('span', { class: 'muted' }, ` / ${ls.cap}`)),
      h('span', { class: 'tiny muted' }, '목표 / 퍼펙트'));
    }));
  } else {
    const outingBtn = (free) => {
      const a = { type: 'outing' };
      return h('button', {
        class: ['btn', 'btn-col', 'week-act', free ? 'free-outing' : '', !free && isRec(a) ? 'recommended' : ''],
        disabled: !live,
        onclick: () => openOuting(free),
      },
      h('span', { class: 'wa-ico' }, L.FREE_ACTION_ICONS.outing),
      h('b', {}, free ? '무료 외출 (온천)' : L.FREE_ACTION_LABELS.outing),
      h('span', { class: 'wl-tags' }, !free ? recBadge(a) : h('span', { class: 'badge badge-good' }, '주를 쓰지 않음')),
      h('span', { class: 'tiny muted' }, outingText()));
    };
    body = h('div', { class: 'week-acts' }, (view.actions || []).map((x) => {
      if (x.type === 'outing') return outingBtn(false);
      const a = { type: x.type };
      return h('button', {
        class: ['btn', 'btn-col', 'week-act', isRec(a) ? 'recommended' : ''],
        disabled: !live,
        dataset: { act: x.type },
        onclick: () => {
          if (x.type === 'friendly') return confirmFriendly();
          act(a); // 상담 → 상담 화면, 미팅 → 지금 전술 · 배치 그대로 (편집기는 U2)
        },
      },
      h('span', { class: 'wa-ico' }, L.FREE_ACTION_ICONS[x.type] ?? ''),
      h('b', {}, L.FREE_ACTION_LABELS[x.type] ?? x.type),
      h('span', { class: 'wl-tags' },
        x.guaranteed ? h('span', { class: 'badge badge-purple' }, '이번 시즌 보장') : null,
        recBadge(a)),
      h('span', { class: 'tiny muted' }, freeActionText(x.type)));
    }), view.freeOuting ? outingBtn(true) : null);
  }
  const restA = { type: 'rest' };
  const restBtn = h('button', {
    class: ['btn', 'btn-col', 'week-rest', isRec(restA) ? 'recommended' : ''],
    disabled: !live,
    onclick: () => act(restA),
  },
  h('span', { class: 'wa-ico' }, L.FREE_ACTION_ICONS.rest),
  h('b', {}, '휴식'),
  recBadge(restA),
  h('span', { class: 'tiny muted' }, `전원 체력 +${view.restGain ?? 0}`));

  const head = kind === 'prep'
    ? `대비 레슨 — 경계전 상대에 맞춘 대비 카드 ${(view.prepCards || []).length}장이 이번 레슨 덱에 들어갑니다`
    : kind === 'lesson' ? '레슨 종목을 고르세요 (★ 특별 = 목표 ×1.3 · 상승 +50%)'
      : '자유 주 — 행동 하나를 고르세요';
  const main = panel(`${view.week}주차 · ${L.WEEK_KIND_LABELS[kind] ?? kind ?? ''}`, {
    cls: 'week-main',
    right: h('span', { class: 'badge badge-warn', title: '완성 화면은 다음 작업 단계(U2)에서 만듭니다' }, '임시 화면'),
  },
  h('p', { class: 'small muted' }, head),
  kind === 'prep' && (view.prepCards || []).length
    ? h('div', { class: 'row wrap prep-cards' }, view.prepCards.map((id) => h('span', { class: 'badge badge-warn' }, `대비 카드 · ${cardName(id)}`)))
    : null,
  h('div', { class: 'week-row' }, body, restBtn),
  rec ? h('p', { class: 'tiny muted week-rec' }, `감독 추천: ${recText(rec)}${rec.reason ? ` — ${rec.reason}` : ''}`) : null);

  // ---- 아래 줄 ----
  const deck = Array.isArray(view.deck) ? view.deck : [];
  const barEl = h('div', { class: 'week-bar' },
    h('button', { class: 'btn', disabled: inert, onclick: openDeck }, `덱 보기 ${deck.length}`),
    h('button', { class: 'btn btn-ghost', disabled: inert, onclick: () => openRecords(view, ctx) },
      `📜 유물 ${(view.relics || []).length} · 보정 ${(view.modifiers || []).length} · 기록`),
    h('span', { class: 'grow' }),
    h('button', {
      class: 'btn btn-primary', disabled: !live || !rec,
      title: '감독 AI(manager.recommendWeek)가 고른 행동을 그대로 합니다',
      onclick: () => { if (!rec) return; const { reason, ...a } = rec; if (a.type === 'outing' && !a.playerId) a.playerId = lowestStamina(); act(a); },
    }, '감독 추천대로'));

  screen.append(hudTopbar(view, ctx), main, hudRoster(view, ctx), barEl);

  // ---------- 도우미 ----------
  function lowestStamina() {
    const ps = [...(view.players || [])].sort((a, b) => (Number(a.stamina) || 0) - (Number(b.stamina) || 0));
    return ps[0]?.id ?? null;
  }
  function outingText() {
    const o = data.lesson?.outing || {};
    return `고른 선수 +${o.picked ?? 20} · 전원 +${o.team ?? 10} · 컨디션 +${o.condition ?? 1}`;
  }
  function freeActionText(type) {
    const fr = data.config?.friendly || {};
    if (type === 'consult') return '카드 구매 · 강화 · 삭제 (TP) · 스킬 (SP)';
    if (type === 'meeting') return `팀워크 +${data.config?.meeting?.teamwork ?? 10} · 지금 전술 그대로`;
    if (type === 'friendly') return `체력 −${fr.staminaCost ?? 30} · SP +${fr.skillPointsLoss ?? 10}~${fr.skillPointsWin ?? 20}`;
    return '';
  }
  function recText(r) {
    if (r.type === 'lesson') return `${L.STAT_LABELS[r.stat] ?? r.stat} 레슨`;
    if (r.type === 'outing') return `${r.free ? '무료 ' : ''}외출`;
    return L.FREE_ACTION_LABELS[r.type] ?? r.type;
  }
  function openOuting(free) {
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'row between' },
        h('h3', {}, `${L.FREE_ACTION_ICONS.outing} ${free ? '무료 외출' : '외출'} — 누구와 갈까요?`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'tiny muted' }, outingText(), free ? ' · 주를 쓰지 않습니다' : ''),
      h('div', { class: 'pick-grid cols-3' }, (view.players || []).map((p) => {
        const st = Number(p.stamina) || 0;
        return h('button', { class: 'char-pick', onclick: () => { closeOverlays(); act({ type: 'outing', playerId: p.id, ...(free ? { free: true } : {}) }); } },
          avatar(p.portraitColor, p.name, 'md'),
          h('span', { class: 'grow col' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot} · 체력 ${st}`),
            bar(st / 100, stamCls(st))));
      }))), { className: 'modal-lg' });
  }
  function confirmFriendly() {
    const fr = data.config?.friendly || {};
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h3', {}, `${L.FREE_ACTION_ICONS.friendly} 친선전`),
      h('p', { class: 'small muted' }, `전원 체력 −${fr.staminaCost ?? 30}. 승리 SP +${fr.skillPointsWin ?? 20} / 패배 SP +${fr.skillPointsLoss ?? 10}. 주를 씁니다.`),
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
      h('div', { class: 'deck-list' }, deck.map((c) =>
        h('span', { class: ['deck-item', `fam-${c.family}`] }, h('b', {}, `${c.name}${c.plus ? '+' : ''}`),
          h('span', { class: 'tiny muted' }, ` ${L.CARD_FAMILY_LABELS[c.family] ?? c.family ?? ''}`))))),
    { className: 'modal-lg' });
  }
}
