// js/ui/meeting.js — 전술 · 포메이션 · 배치 편집기 (LESSON_PROTO_PLAN §6.3 "전술 미팅 모달 / 경기 전 준비 화면")
// 자유 주 [전술 미팅] 모달(screens/week.js)과 경기 전 준비 화면(screens/prep.js)이 같이 쓴다. 엔진 로직은 없다 —
// 제출하면 { tactics, formation?, swaps? } 를 onSubmit 에 넘기고, 부르는 쪽이 lessonRun.applyWeekAction(meeting) · confirmPrep 을 부른다.
//
//   ┌ .meeting-cols (2단: 260 | 1fr) ───────────────────────────────────────────────┐
//   │ 전술 지시 (select 6)   │ 포메이션 select  ·  라인업 보드 (끌어서 맞바꾸기, lineup.js)     │
//   │                        │ 고유 카드 모드가 바뀌는 선수 = 슬롯 카드 아래 "고유 카드 모드 변경" │
//   └────────────────────────┴───────────────────────────────────────────────────────────┘
//   [취소] [submitLabel]
// 스킬 상점은 없다 (스킬은 상담에서 SP 로 산다).
import { h, avatar, select, toast } from './dom.js';
import * as L from './labels.js';
import { lineupBoard, reseat, lineupIssues, meetingSwaps } from './lineup.js';

/**
 * @param {object} ctx 화면 ctx (store · data · run)
 * @param {object} o
 * @param {object} o.state 런 상태 (formation · tactics · players · deck 을 읽기만 한다)
 * @param {Array<object>} [o.players] 선수 뷰 (lessonRun playerView — 체력 · 결장 · 주 스탯 쌍). 없으면 state.players
 * @param {any} [o.head] 머리 줄 (제목 · 배지). 없으면 머리 줄 없음
 * @param {string} o.submitLabel 제출 버튼 글
 * @param {string} [o.submitClass] 제출 버튼에 더할 클래스
 * @param {(action: { tactics: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }> }) => void} o.onSubmit
 * @param {() => void} [o.onCancel] 있으면 [취소] 버튼
 * @param {any} [o.footNote] 버튼 줄 왼쪽 안내
 * @returns {{ el: HTMLElement, cancel: () => void }}
 */
export function meetingEditor(ctx, o) {
  const data = ctx?.data || {};
  const runMod = ctx?.run || null;
  const state = o.state || {};
  const runPlayers = Array.isArray(state.players) ? state.players : [];
  const viewById = new Map((Array.isArray(o.players) ? o.players : runPlayers).map((p) => [p.id, p]));
  const runById = new Map(runPlayers.map((p) => [p.id, p]));
  const charById = new Map((data.characters || []).map((c) => [c.id, c]));
  const cardById = new Map(((data.cards && data.cards.cards) || []).map((c) => [c.id, c]));
  const allIds = runPlayers.map((p) => p.id);
  const tactics = { ...(state.tactics || {}) };
  let formation = state.formation || '2-2-2';
  const currentSlotOf = (pid) => runById.get(pid)?.slot;
  // 적성: 런 선수의 aptitude (없으면 캐릭터 데이터). 배치 규칙 = 엔진 validateSquad (lineup.js canPlay)
  const aptOf = (pid, pos) => runById.get(pid)?.aptitude?.[pos] ?? charById.get(runById.get(pid)?.charId)?.aptitude?.[pos] ?? '-';
  const nameOf = (pid) => runById.get(pid)?.name ?? pid;
  // 고유 카드: 덱에 주인 카드가 있는 선수만. 강화 모드 종목 = 주 스탯 쌍(cards.mainStatsOf) — 자리를 옮겨 쌍이 바뀌면 표시
  const deckOwners = new Set((Array.isArray(state.deck) ? state.deck : []).map((e) => cardById.get(e.cardId)).filter((c) => c && c.family === 'unique').map((c) => c.ownerCharId));
  const mainsOf = (pos) => {
    try { return typeof runMod?.mainStatsOf === 'function' && pos ? runMod.mainStatsOf(pos) : null; } catch (_) { return null; }
  };
  const statText = (arr) => (arr || []).map((k) => L.STAT_LABELS[k] ?? k).join('·');
  function modeChange(pid, slot) {
    const p = runById.get(pid);
    if (!p || !deckOwners.has(p.charId)) return null;
    const before = mainsOf(p.position ?? (p.slot ? L.positionOfSlot(p.slot) : null));
    const after = mainsOf(L.positionOfSlot(slot));
    if (!before || !after || before.join() === after.join()) return null;
    return `고유 카드 강화 모드 종목: ${statText(before)} → ${statText(after)}`;
  }

  const seat = (from) => reseat(from, L.slotsOf(formation), aptOf, { fillAll: true, extraIds: allIds });
  let assign = seat(Object.fromEntries(runPlayers.filter((p) => p.slot).map((p) => [p.slot, p.id])));

  const el = h('div', { class: 'col meeting' });
  let board = null;
  const draw = () => {
    if (board) board.cancel();
    el.replaceChildren(...build().filter(Boolean));
  };

  function build() {
    const slots = L.slotsOf(formation);
    const fieldSel = (key) => h('div', { class: 'field' }, h('label', {}, L.TACTIC_LABELS[key]),
      select(L.TACTIC_OPTIONS[key], tactics[key], (v) => { tactics[key] = v; }, { 'aria-label': L.TACTIC_LABELS[key], dataset: { tactic: key } }));
    board = lineupBoard({
      slots,
      assign,
      compact: true,
      aptOf,
      nameOf,
      colorOf: (pid) => runById.get(pid)?.portraitColor,
      slotBody: (pid, sl) => {
        const p = viewById.get(pid) ?? runById.get(pid);
        const was = currentSlotOf(pid);
        const injured = Number(p?.injuredTurns) > 0;
        const mains = Array.isArray(p?.mainStats) ? p.mainStats : [];
        const chg = modeChange(pid, sl);
        return [
          avatar(p?.portraitColor, p?.name, 'sm', injured ? 'dim' : ''),
          h('span', { class: 'grow col' },
            h('span', { class: 'ellipsis slot-nm' }, p?.name ?? pid),
            was !== sl
              ? h('span', { class: 'tiny warn ellipsis' }, `← 원래 ${was ?? '-'}`)
              : h('span', { class: ['tiny', 'ellipsis', injured ? 'bad' : 'muted'] }, injured ? `결장 · 레슨 ${p.injuredTurns}`
                : `체력 ${Math.round(Number(p?.stamina) || 0)}${mains.length ? ` · ${mains.map((k) => L.STAT_SHORT[k] ?? k).join('')}` : ''}`)),
          chg ? h('span', { class: 'mode-chg', title: chg }, '고유 카드 모드 변경') : null,
        ];
      },
      onChange: (next) => { assign = next; draw(); },
    });
    const moved = slots.filter((sl) => assign[sl] && currentSlotOf(assign[sl]) !== sl).length;
    return [
      o.head ? h('div', { class: 'row between meeting-head' }, o.head) : null,
      h('div', { class: 'meeting-cols' },
        h('section', { class: 'meeting-col meeting-tactics' },
          h('h4', { class: 'og-panel-title' }, '전술 지시'),
          L.TACTIC_MAIN_KEYS.map(fieldSel),
          h('div', { class: 'divider' }),
          ['tension', 'duelPicker', 'distribution'].map(fieldSel)),
        h('section', { class: 'meeting-col meeting-board' },
          h('div', { class: 'row between' },
            h('h4', { class: 'og-panel-title' }, '포메이션 · 포지션'),
            h('div', { class: 'field meeting-formation' }, h('label', {}, '포메이션'),
              select(Object.keys(L.FORMATIONS).map((f) => [f, `${f} (DF ${L.FORMATIONS[f].DF} · MF ${L.FORMATIONS[f].MF} · FW ${L.FORMATIONS[f].FW})`]), formation, (v) => {
                formation = v;
                assign = seat(assign);
                draw();
              }, { 'aria-label': '포메이션' }))),
          board.pitch,
          h('p', { class: 'tiny muted meeting-tip' },
            '선수를 끌어 다른 자리에 놓으면 맞바꿉니다 — ', h('b', { class: 'good' }, '초록'), ' 가능 · ', h('b', { class: 'bad' }, '빨강'), ' 불가. 누른 뒤 다른 선수를 눌러도 됩니다.',
            moved ? h('span', { class: 'warn' }, ` · 자리 변경 ${moved}명`) : null))),
      h('div', { class: 'row modal-foot meeting-foot' },
        o.footNote ? h('span', { class: 'tiny muted grow' }, o.footNote) : h('span', { class: 'grow' }),
        o.onCancel ? h('button', { class: 'btn', onclick: () => { cancel(); o.onCancel(); } }, '취소') : null,
        h('button', { class: ['btn', 'btn-primary', 'meeting-submit', o.submitClass || ''], onclick: submit }, o.submitLabel || '확인')),
    ];
  }

  function submit() {
    const slots = L.slotsOf(formation);
    const ids = slots.map((sl) => assign[sl]).filter(Boolean);
    if (ids.length !== slots.length || new Set(ids).size !== ids.length) return toast('포지션 배치에 빠진 선수나 중복이 있습니다.');
    for (const is of lineupIssues({ slots, assign, aptOf })) {
      const pos = L.positionOfSlot(is.slot);
      if (pos === 'GK' && aptOf(is.id, pos) !== '-') return toast(`GK는 적성 A/B만 배치할 수 있습니다 (${nameOf(is.id)}: ${aptOf(is.id, pos)}).`);
      return toast(`${nameOf(is.id)}은(는) ${pos} 적성이 없어 ${is.slot}에 배치할 수 없습니다.`);
    }
    const action = { tactics: { ...tactics } };
    if (formation !== state.formation) action.formation = formation;
    // 엔진은 swaps 를 순서대로 적용(자리 맞바꾸기) → 최종 배치 = assign (lineup.js meetingSwaps, test/lineup.test.mjs)
    const swaps = meetingSwaps(slots, assign, currentSlotOf);
    if (swaps.length) action.swaps = swaps;
    cancel();
    o.onSubmit(action);
    return undefined;
  }

  function cancel() { if (board) board.cancel(); }

  draw();
  return { el, cancel };
}
