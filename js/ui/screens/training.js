// js/ui/screens/training.js — 훈련 화면 (phase "turn"; event/relic 모달의 배경으로도 사용)
import { h, avatar, openModal, closeOverlays, select, bar, pct, signed, toast } from '../dom.js';
import * as L from '../labels.js';

export function renderTraining(root, ctx, { inert = false } = {}) {
  const { store, data, run, safe, actions } = ctx;
  const state = store.run;
  const cfg = data.config || {};
  const screen = h('div', { class: 'screen' });
  root.append(screen);

  const view = safe(() => run.getTurnView(state, data));
  if (!view) {
    screen.append(
      h('div', { class: 'error-panel' }, '훈련 화면 정보를 불러올 수 없습니다.'),
      h('p', { class: 'muted small' }, `phase: ${state?.phase ?? '?'} · 시즌 ${state?.season ?? '?'} · 턴 ${state?.turn ?? '?'}`),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'),
    );
    return;
  }

  const players = Array.isArray(view.players) ? view.players : [];
  const playerById = new Map(players.map((p) => [p.id, p]));
  const supportById = new Map((data.supports || []).map((s) => [s.id, s]));
  const charById = new Map((data.characters || []).map((c) => [c.id, c]));
  const skillById = new Map((data.skills || []).map((s) => [s.id, s]));
  const relicById = new Map((data.relics || []).map((r) => [r.id, r]));
  const turnsPerSeason = view.turnsPerSeason ?? cfg.turnsPerSeason ?? 8;

  // ---------- 상단 바 ----------
  const nm = view.nextMatch || {};
  const cond = Number(view.condition ?? state.condition ?? 2);
  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'title-row' },
      h('h2', {}, `시즌 ${view.season ?? state.season ?? '?'}`,
        h('span', { class: 'muted', style: { fontSize: '14px', fontWeight: '400' } }, ` · ${view.turn ?? state.turn ?? '?'}/${turnsPerSeason}턴`)),
      h('span', { class: 'muted tiny' }, `seed ${state.seed ?? ''}`)),
    h('div', { class: 'card card-sm next-match' },
      h('span', { class: 'vs' }, '⚔'),
      h('span', { class: 'grow col' },
        h('span', {}, h('b', {}, nm.opponentName ?? '?'),
          h('span', { class: 'muted' }, ` · ${view.turnsUntilMatch != null ? `${view.turnsUntilMatch}턴 후` : ''} 경계전`)),
        h('span', { class: 'tiny muted' },
          `${L.ELEMENT_ICONS[nm.element] ?? ''} ${L.label(L.ELEMENT_LABELS, nm.element, '?')} · ${L.label(L.STYLE_LABELS, nm.style, '?')}` +
          ` · ${nm.possessions ?? '?'}포제션 · 의도 ${L.label(L.INTENT_LABELS, nm.intentReveal, '?')}`))),
    h('div', { class: 'status-row' },
      h('span', { class: 'status-chip', title: `컨디션 ${L.CONDITION_LABELS[cond] ?? cond}` },
        '컨디션 ', condDots(cond), h('span', { class: 'muted' }, L.CONDITION_LABELS[cond] ?? '')),
      h('span', { class: 'status-chip' }, '팀워크 ', h('b', {}, view.teamwork ?? 0)),
      h('span', { class: 'status-chip' }, 'SP ', h('b', {}, view.skillPoints ?? 0)),
      h('span', { class: 'status-chip' }, '호출권 ', h('b', {}, view.summonTickets ?? 0))),
  );

  // ---------- 체력 스트립 ----------
  const strip = h('div', { class: 'stamina-strip' }, players.map((p) => {
    const st = Number(p.stamina) || 0;
    const cls = st >= 60 ? 'good' : st >= 40 ? 'warn' : 'bad';
    const injured = Number(p.injuredTurns) > 0;
    return h('div', { class: 'stam', title: `${p.name} · ${p.slot} · 체력 ${st}${injured ? ` · 부상 ${p.injuredTurns}턴` : ''}` },
      avatar(p.portraitColor, p.name, 'sm', injured ? 'dim' : ''),
      injured ? h('span', { class: 'injured' }, `부상${p.injuredTurns}`) : null,
      bar(st / 100, cls),
      h('span', { class: 'stam-name' }, `${p.slot ?? ''} ${st}`));
  }));

  // ---------- 훈련 칸 ----------
  const slotRows = h('div', { class: 'slot-rows' }, (view.slots || []).map((slot) => {
    const type = slot.type;
    const recommended = view.recommendedSlot === type;
    const pl = (slot.players || []).map((id) => playerById.get(id)).filter(Boolean);
    const sps = Array.isArray(slot.supports) ? slot.supports : [];
    const pv = slot.preview || {};
    const empty = pl.length === 0;
    const fail = Number(pv.maxFailRate) || 0;
    const failCls = fail >= 0.25 ? 'bad' : fail >= 0.1 ? 'warn' : '';
    return h('button', {
      class: ['slot-row', recommended ? 'recommended' : '', empty ? 'empty' : ''],
      disabled: inert,
      onclick: () => openTrainSheet(slot),
    },
    h('span', { class: 'slot-head' },
      h('span', { class: 'row' },
        h('span', { class: 'slot-name' }, L.STAT_LABELS[type] ?? type),
        recommended ? h('span', { class: 'badge badge-gold' }, '추천') : null,
        pv.friendship ? h('span', { class: 'badge badge-purple' }, '★ 우정') : null),
      h('span', { class: 'tiny muted' }, `${pl.length}명`)),
    h('span', { class: 'slot-body' },
      h('span', { class: 'slot-players' },
        empty ? h('span', { class: 'tiny muted' }, '선수 없음')
          : pl.map((p) => avatar(p.portraitColor, p.name, 'sm', (Number(p.stamina) || 0) < 40 ? 'dim' : ''))),
      h('span', { class: 'slot-supports' }, sps.map((sp) =>
        h('span', { class: 'sp-icon', title: `${sp.name ?? sp.id} · 유대 ${sp.bond ?? '?'}${sp.friendship ? ' · 우정 훈련' : ''}${sp.hint ? ' · 힌트 가능' : ''}` },
          avatar(supportById.get(sp.id)?.portraitColor, sp.name ?? sp.id, 'xs'),
          sp.friendship ? h('span', { class: 'mark' }, '★') : null,
          sp.hint ? h('span', { class: 'mark hint' }, '💡') : null)))),
    h('span', { class: 'slot-meta' },
      h('span', {}, '합계 ', h('b', {}, signed(pv.totalGain ?? 0))),
      h('span', { class: failCls }, '실패 최대 ', h('b', {}, pct(fail)))),
    );
  }));

  // ---------- 하단 시트: 훈련 상세 ----------
  function openTrainSheet(slot) {
    const type = slot.type;
    const pv = slot.preview || {};
    const rows = (pv.perPlayer || []).map((pp) => {
      const p = playerById.get(pp.playerId);
      if (!p) return null;
      const gains = Object.entries(pp.gains || {}).filter(([, v]) => v)
        .map(([st, v]) => `${L.STAT_LABELS[st] ?? st} ${signed(v)}`).join(' · ');
      const fr = Number(pp.failRate) || 0;
      return h('div', { class: 'list-item' },
        avatar(p.portraitColor, p.name, 'md'),
        h('div', { class: 'grow col' },
          h('div', { class: 'row' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot} · 체력 ${p.stamina}`)),
          h('div', { class: 'small good' }, gains || '상승 없음'),
          h('div', { class: 'tiny muted' }, `체력 −${pp.staminaCost ?? 0} · 실패 `,
            h('span', { class: fr >= 0.25 ? 'bad' : fr >= 0.1 ? 'warn' : '' }, pct(fr)))));
    }).filter(Boolean);
    const bonds = (pv.bondGain || []).map((b) => {
      const sp = supportById.get(b.supportId);
      const spv = (slot.supports || []).find((x) => x.id === b.supportId);
      return h('span', { class: 'badge' }, avatar(sp?.portraitColor, sp?.name ?? b.supportId, 'xs'),
        ` ${sp?.name ?? b.supportId} 유대 ${signed(b.amount)}${spv?.friendship ? ' ★' : ''}`);
    });
    const free = (pv.freePlayers || []).map((fp) => {
      const p = playerById.get(fp.playerId);
      const g = Object.entries(fp.gains || {}).filter(([, v]) => v)
        .map(([st, v]) => `${L.STAT_LABELS[st] ?? st} ${signed(v)}`).join(', ');
      return p ? `${p.name} ${g}` : null;
    }).filter(Boolean);

    openModal(h('div', { class: 'col', style: { gap: '10px' } },
      h('div', { class: 'sheet-handle' }),
      h('div', { class: 'row between' },
        h('h3', {}, `${L.STAT_LABELS[type] ?? type} 훈련`),
        h('span', { class: 'row' },
          view.recommendedSlot === type ? h('span', { class: 'badge badge-gold' }, '추천') : null,
          h('span', { class: 'badge' }, `합계 ${signed(pv.totalGain ?? 0)}`))),
      rows.length ? h('div', { class: 'list' }, rows)
        : h('p', { class: 'muted small' }, '이 칸에는 선수가 없습니다. 서포트 유대만 오릅니다.'),
      bonds.length ? h('div', { class: 'row wrap' }, bonds) : null,
      free.length ? h('div', { class: 'tiny muted' }, `자율 훈련(${pct(cfg.training?.freeTrainRatio ?? 0.2)}): ${free.join(' · ')}`) : null,
      h('button', { class: 'btn btn-primary btn-block', onclick: () => { closeOverlays(); actions.doAction({ type: 'train', slot: type }); } }, '훈련하기'),
    ), { kind: 'sheet' });
  }

  // ---------- 행동 확인 ----------
  function confirmAction(title, desc, action) {
    openModal(h('div', { class: 'col', style: { gap: '10px' } },
      h('h3', {}, title),
      h('p', { class: 'small muted' }, desc),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn', onclick: closeOverlays }, '취소'),
        h('button', { class: 'btn btn-primary', onclick: () => { closeOverlays(); actions.doAction(action); } }, '실행')),
    ));
  }

  // ---------- 전술 미팅 ----------
  function openMeeting() {
    const tactics = { ...(state.tactics || {}) };
    let formation = state.formation || '2-2-2';
    const buy = { skillId: null, playerId: null };
    const runPlayers = Array.isArray(state.players) ? state.players : [];
    const currentSlotOf = (pid) => runPlayers.find((p) => p.id === pid)?.slot;
    const aptOf = (pid, pos) => charById.get(runPlayers.find((p) => p.id === pid)?.charId)?.aptitude?.[pos] ?? '?';
    // 엔진 validateSquad 와 같은 규칙: 적성 '-' 배치 금지, GK 는 A/B 만. 모달을 닫기 전에 검사해 편집 내용이 사라지지 않게 한다.
    const canPlay = (pos, apt) => apt !== '-' && (pos !== 'GK' || apt === 'A' || apt === 'B');
    const nameOf = (pid) => runPlayers.find((p) => p.id === pid)?.name ?? pid;
    const assign = {};
    const initAssign = () => {
      const slots = L.slotsOf(formation);
      const used = new Set();
      for (const sl of slots) {
        const p = runPlayers.find((x) => x.slot === sl && !used.has(x.id));
        if (p) { assign[sl] = p.id; used.add(p.id); }
      }
      for (const sl of slots) {
        if (assign[sl]) continue;
        const p = runPlayers.find((x) => !used.has(x.id));
        if (p) { assign[sl] = p.id; used.add(p.id); }
      }
      for (const k of Object.keys(assign)) if (!slots.includes(k)) delete assign[k];
    };
    initAssign();

    const body = h('div', { class: 'col', style: { gap: '10px' } });
    const draw = () => body.replaceChildren(...build());

    function build() {
      const slots = L.slotsOf(formation);
      const shop = Array.isArray(view.shop) ? view.shop : [];
      const sp = Number(view.skillPoints) || 0;
      return [
        h('div', { class: 'row between' },
          h('h3', {}, '전술 미팅'),
          h('span', { class: 'badge badge-accent' }, `팀워크 +${cfg.meeting?.teamwork ?? 10}`)),
        h('div', { class: 'grid-3' }, L.TACTIC_MAIN_KEYS.map((key) =>
          h('div', { class: 'field' }, h('label', {}, L.TACTIC_LABELS[key]),
            select(L.TACTIC_OPTIONS[key], tactics[key], (v) => { tactics[key] = v; })))),
        h('div', { class: 'grid-2' }, ['tension', 'duelPicker'].map((key) =>
          h('div', { class: 'field' }, h('label', {}, L.TACTIC_LABELS[key]),
            select(L.TACTIC_OPTIONS[key], tactics[key], (v) => { tactics[key] = v; })))),
        h('div', { class: 'divider' }),
        h('div', { class: 'field' }, h('label', {}, '포메이션'),
          select(Object.keys(L.FORMATIONS).map((f) => [f, f]), formation, (v) => { formation = v; initAssign(); draw(); })),
        h('details', { class: 'log', open: formation !== state.formation },
          h('summary', {}, '포지션 배치 변경'),
          h('div', { class: 'col', style: { marginTop: '6px' } }, slots.map((sl) => {
            const pos = L.positionOfSlot(sl);
            return h('div', { class: 'row' },
              h('span', { class: 'slot-tag muted tiny', style: { minWidth: '34px', fontWeight: '700' } }, sl),
              select(runPlayers.map((p) => {
                const apt = aptOf(p.id, pos);
                const blocked = !canPlay(pos, apt);
                return [p.id, `${p.name} (${pos} ${apt}${blocked ? ' · 배치 불가' : ''})${p.slot ? ` · 현재 ${p.slot}` : ''}`, blocked];
              }), assign[sl] ?? '', (v) => { assign[sl] = v; }));
          }))),
        h('div', { class: 'divider' }),
        h('div', { class: 'row between' }, h('h3', {}, '스킬 상점'), h('span', { class: 'badge' }, `SP ${sp}`)),
        shop.length === 0
          ? h('p', { class: 'tiny muted' }, '힌트를 보유한 스킬이 없습니다. 서포트와 훈련하거나 이벤트로 힌트를 얻으세요.')
          : h('div', { class: 'list' }, shop.map((item) => {
            const price = Number(item.discountedCost ?? item.cost) || 0;
            const eligible = Array.isArray(item.eligiblePlayerIds) ? item.eligiblePlayerIds : [];
            const chosen = buy.skillId === item.skillId;
            const affordable = price <= sp;
            const desc = skillById.get(item.skillId)?.description ?? '';
            return h('div', { class: ['list-item', 'col', !affordable || !eligible.length ? 'disabled' : ''], style: { alignItems: 'stretch' } },
              h('div', { class: 'row between' },
                h('span', { class: 'col' },
                  h('b', {}, item.name ?? item.skillId),
                  desc ? h('span', { class: 'tiny muted' }, desc) : null,
                  h('span', { class: 'tiny muted' }, `힌트 Lv${item.hintLevel ?? 0} · ${item.cost != null && item.cost !== price ? `${item.cost} → ` : ''}${price} SP`)),
                h('button', {
                  class: ['btn', 'btn-sm', chosen ? 'active' : ''],
                  disabled: !affordable || !eligible.length,
                  onclick: () => {
                    if (chosen) { buy.skillId = null; buy.playerId = null; } else { buy.skillId = item.skillId; buy.playerId = eligible[0] ?? null; }
                    draw();
                  },
                }, chosen ? '선택됨' : '구매')),
              chosen ? h('div', { class: 'field' }, h('label', {}, '배울 선수'),
                select(eligible.map((pid) => [pid, `${playerById.get(pid)?.name ?? pid} (${currentSlotOf(pid) ?? ''})`]), buy.playerId, (v) => { buy.playerId = v; })) : null,
            );
          })),
        h('div', { class: 'grid-2' },
          h('button', { class: 'btn', onclick: closeOverlays }, '취소'),
          h('button', { class: 'btn btn-primary', onclick: submit }, '미팅 진행')),
      ];
    }

    function submit() {
      const slots = L.slotsOf(formation);
      const ids = slots.map((sl) => assign[sl]).filter(Boolean);
      if (ids.length !== slots.length || new Set(ids).size !== ids.length) return toast('포지션 배치에 빠진 선수나 중복이 있습니다.');
      for (const sl of slots) {
        const pos = L.positionOfSlot(sl);
        const apt = aptOf(assign[sl], pos);
        if (apt === '-') return toast(`${nameOf(assign[sl])}은(는) ${pos} 적성이 없어 ${sl}에 배치할 수 없습니다.`);
        if (pos === 'GK' && apt !== 'A' && apt !== 'B') return toast(`GK는 적성 A/B만 배치할 수 있습니다 (${nameOf(assign[sl])}: ${apt}).`);
      }
      if (buy.skillId && buy.playerId) {
        // 엔진(canLearnSkill positionOverride)과 같이 새 포지션 기준으로 스킬 포지션 조건을 확인
        const sk = skillById.get(buy.skillId);
        const newSlot = slots.find((sl) => assign[sl] === buy.playerId);
        const newPos = newSlot ? L.positionOfSlot(newSlot) : null;
        if (newPos && Array.isArray(sk?.positions) && sk.positions.length && !sk.positions.includes(newPos)) {
          return toast(`${sk.name ?? buy.skillId}은(는) ${sk.positions.join('/')} 선수만 배울 수 있습니다 (${nameOf(buy.playerId)} → ${newPos}).`);
        }
      }
      const action = { type: 'meeting', tactics };
      if (formation !== state.formation) action.formation = formation;
      const swaps = slots.map((sl) => ({ playerId: assign[sl], slot: sl })).filter((sw) => currentSlotOf(sw.playerId) !== sw.slot);
      if (swaps.length) action.swaps = swaps;
      if (buy.skillId && buy.playerId) action.buy = { skillId: buy.skillId, playerId: buy.playerId };
      closeOverlays();
      actions.doAction(action);
    }

    draw();
    openModal(body);
  }

  // ---------- 호출권 ----------
  function openSummon() {
    const eligible = players.filter((p) => !(Number(p.injuredTurns) > 0));
    openModal(h('div', { class: 'col', style: { gap: '10px' } },
      h('div', { class: 'row between' }, h('h3', {}, '호출권 — 선수 선택'), h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'tiny muted' }, '선택한 선수를 원하는 훈련 칸으로 부릅니다. 턴을 소모하지 않습니다.'),
      h('div', { class: 'list' }, eligible.map((p) => h('button', { class: 'char-pick', onclick: () => pickSlot(p) },
        avatar(p.portraitColor, p.name, 'md'),
        h('span', { class: 'grow col' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot} · 체력 ${p.stamina}`))))),
    ));
    function pickSlot(p) {
      closeOverlays();
      openModal(h('div', { class: 'col', style: { gap: '10px' } },
        h('h3', {}, `${p.name} → 어느 칸으로?`),
        h('div', { class: 'btn-list' }, L.STATS.map((st) => h('button', {
          class: ['btn', view.recommendedSlot === st ? 'active' : ''],
          onclick: () => { closeOverlays(); actions.doAction({ type: 'summon', playerId: p.id, slot: st }); },
        }, `${L.STAT_LABELS[st]}${view.recommendedSlot === st ? ' (추천)' : ''}`))),
        h('button', { class: 'btn btn-ghost btn-block', onclick: closeOverlays }, '취소'),
      ));
    }
  }

  // ---------- 행동 바 ----------
  const friendName = view.friendSupportId ? (supportById.get(view.friendSupportId)?.name ?? '친구') : null;
  const fr = cfg.friendly || {};
  const abtn = (ico, text, onclick, disabled = false) =>
    h('button', { class: 'btn', disabled: inert || disabled, onclick }, h('span', { class: 'ico' }, ico), h('span', {}, text));
  const actionbar = h('div', { class: 'actionbar' },
    abtn('🛌', '휴식', () => confirmAction('휴식', `전원 체력 +${cfg.rest?.stamina ?? 40}, ${pct(cfg.rest?.conditionUpChance ?? 0.3)} 확률로 컨디션 +1. 턴을 소모합니다.`, { type: 'rest' })),
    abtn('🚶', '외출', () => confirmAction('외출', friendName
      ? `${friendName}와 외출: 유대 +${cfg.outing?.bond ?? 10}, 컨디션 +1, 조건을 채운 서포트 이벤트가 바로 발생합니다. 턴을 소모합니다.`
      : `컨디션 +1, 전원 체력 +${cfg.outing?.teamStamina ?? 10}. 턴을 소모합니다.`, { type: 'outing' })),
    abtn('📋', '미팅', openMeeting),
    abtn('🤝', '친선전', () => confirmAction('친선전', `전원 체력 −${fr.staminaCost ?? 30}. 승리 SP +${fr.skillPointsWin ?? 20} / 패배 SP +${fr.skillPointsLoss ?? 10}, 승리 시 ${pct(fr.relicChanceOnWin ?? 0.3)} 확률로 유물 선택. 턴을 소모합니다.`, { type: 'friendly' })),
    abtn('📣', `호출권 ${view.summonTickets ?? 0}`, openSummon, !(Number(view.summonTickets) > 0)),
  );

  // ---------- 유물/보정/기록 ----------
  const relics = Array.isArray(view.relics) ? view.relics : (state.relics || []);
  const mods = Array.isArray(view.modifiers) ? view.modifiers : (state.modifiers || []);
  const log = Array.isArray(view.log) ? view.log : (state.log || []).slice(-20);
  const extras = h('details', { class: 'log' },
    h('summary', {}, `유물 ${relics.length} · 보정 ${mods.length} · 기록 보기`),
    relics.length ? h('div', { class: 'row wrap', style: { marginTop: '6px' } }, relics.map((id) =>
      h('span', { class: 'badge badge-gold', title: relicById.get(id)?.description ?? '' }, relicById.get(id)?.name ?? id))) : null,
    mods.length ? h('div', { class: 'row wrap', style: { marginTop: '6px' } }, mods.map((m) =>
      h('span', { class: 'badge' }, `${m.key} ${signed((Number(m.amount) || 0) * (Math.abs(m.amount) < 1 ? 100 : 1))}${Math.abs(m.amount) < 1 ? '%' : ''}${m.untilSeason != null ? ` (시즌 ${m.untilSeason}까지)` : ''}`))) : null,
    h('ul', {}, [...log].slice(-8).reverse().map((l) => h('li', {}, `${l.turnIndex != null ? `T${l.turnIndex + 1} · ` : ''}${l.text ?? ''}`))),
  );

  screen.append(topbar, strip, slotRows, extras, actionbar);
}

function condDots(cond) {
  const c = Math.max(0, Math.min(4, Number(cond) || 0));
  return h('span', { class: 'cond-dots' }, [0, 1, 2, 3, 4].map((i) => h('i', { class: i <= c ? 'on' : '' })));
}
