// js/ui/screens/setup.js — 편성 화면 (런 시작 전)
import { h, avatar, openModal, closeOverlays, section, select, toast } from '../dom.js';
import {
  STATS, slotsOf, positionOfSlot, POSITION_LABELS, ELEMENT_LABELS, ELEMENT_ICONS, STYLE_LABELS,
  RACE_LABELS, SUPPORT_TYPE_LABELS, TACTIC_MAIN_KEYS, TACTIC_LABELS, TACTIC_OPTIONS,
  APTITUDE_ORDER, FORMATIONS, randomSeed, traitInfo,
} from '../labels.js';

export function initSetup(data, seedPrefill = '') {
  const cfg = data?.config || {};
  const dsq = cfg.defaultSquad || {};
  return {
    formation: dsq.formation || '2-2-2',
    squad: { ...(dsq.slots || {}) },
    supportIds: Array.isArray(cfg.defaultSupports) ? [...cfg.defaultSupports] : [],
    tactics: {
      attack: 'balanced', shootTiming: 'breakAll', defense: 'balanced', tension: 'clutch', duelPicker: 'best',
      ...(cfg.defaultTactics || {}),
    },
    seed: seedPrefill || '',
  };
}

function aptBadge(apt) {
  const a = apt || '-';
  return h('span', { class: ['badge', 'apt', a === '-' ? 'apt-none' : `apt-${a}`] }, a);
}

export function renderSetup(root, ctx) {
  const { store, data, actions } = ctx;
  if (!store.setup) store.setup = initSetup(data);
  const s = store.setup;
  const cfg = data.config || {};
  const chars = Array.isArray(data.characters) ? data.characters : [];
  const charById = new Map(chars.map((c) => [c.id, c]));
  const supports = Array.isArray(data.supports) ? data.supports : [];
  const supportCount = Array.isArray(cfg.defaultSupports) && cfg.defaultSupports.length ? cfg.defaultSupports.length : 6;
  const slots = slotsOf(s.formation);
  for (const k of Object.keys(s.squad)) if (!slots.includes(k)) delete s.squad[k];

  const rerender = () => ctx.render();

  // 연계 특성 (GDD v0.5 §9.10): 카드엔 이름, 목록엔 이름 + 효과
  function traitTag(id) {
    const t = traitInfo(id, data);
    return t ? h('span', { class: 'trait-tag tiny', title: t.description }, `${t.icon} ${t.name}`) : null;
  }
  function traitLine(id) {
    const t = traitInfo(id, data);
    return t ? h('span', { class: 'tiny' }, h('span', { class: 'trait-tag' }, `${t.icon} ${t.name}`), h('span', { class: 'muted' }, ` ${t.description}`)) : null;
  }

  // ---- 슬롯 카드 ----
  function slotCard(slot) {
    const pos = positionOfSlot(slot);
    const cid = s.squad[slot];
    const c = cid ? charById.get(cid) : null;
    const apt = c ? (c.aptitude?.[pos] ?? '-') : null;
    return h('button', { class: ['slot-card', pos === 'GK' ? 'gk' : '', c ? '' : 'empty'], onclick: () => openSlotPicker(slot) },
      h('span', { class: 'slot-tag' }, slot),
      c ? avatar(c.portraitColor, c.name, 'sm')
        : h('span', { class: 'avatar avatar-sm', style: { background: 'transparent', borderStyle: 'dashed' } }, '+'),
      h('span', { class: 'grow col' },
        h('span', { class: 'ellipsis' }, c ? c.name : '비어 있음 — 탭하여 선택'),
        c ? h('span', { class: 'tiny muted ellipsis' },
          `${ELEMENT_ICONS[c.element] ?? ''} ${ELEMENT_LABELS[c.element] ?? c.element ?? ''} · ${STYLE_LABELS[c.style] ?? c.style ?? ''}`) : null,
        c && c.trait ? traitTag(c.trait) : null),
      c ? aptBadge(apt) : null,
    );
  }

  function openSlotPicker(slot) {
    const pos = positionOfSlot(slot);
    const assignedSlotOf = (cid) => Object.entries(s.squad).find(([, v]) => v === cid)?.[0];
    const sorted = [...chars].sort((a, b) =>
      (APTITUDE_ORDER[a.aptitude?.[pos] ?? '-'] ?? 3) - (APTITUDE_ORDER[b.aptitude?.[pos] ?? '-'] ?? 3));
    const list = sorted.map((c) => {
      const apt = c.aptitude?.[pos] ?? '-';
      const disabled = apt === '-' || (pos === 'GK' && apt === 'C');
      const where = assignedSlotOf(c.id);
      const total = STATS.reduce((sum, st) => sum + (Number(c.baseStats?.[st]) || 0), 0);
      const aptLine = ['GK', 'DF', 'MF', 'FW'].map((p) => `${p} ${c.aptitude?.[p] ?? '-'}`).join(' · ');
      return h('button', {
        class: ['char-pick', where === slot ? 'current' : ''],
        disabled,
        onclick: () => {
          if (where) delete s.squad[where];
          s.squad[slot] = c.id;
          closeOverlays();
          rerender();
        },
      },
      avatar(c.portraitColor, c.name, 'md'),
      h('span', { class: 'grow col' },
        h('span', { class: 'row wrap' },
          h('b', {}, c.name),
          h('span', { class: ['tiny', `rarity-${c.rarity}`] }, c.rarity ?? ''),
          where && where !== slot ? h('span', { class: 'badge' }, `${where} 배치 중`) : null,
          where === slot ? h('span', { class: 'badge badge-good' }, '현재') : null),
        h('span', { class: 'tiny muted' },
          `${RACE_LABELS[c.race] ?? c.race ?? ''} · ${ELEMENT_LABELS[c.element] ?? ''} · ${STYLE_LABELS[c.style] ?? ''} · 스탯 합 ${total}`),
        h('span', { class: 'tiny muted' }, aptLine),
        c.trait ? traitLine(c.trait) : null),
      aptBadge(apt),
      );
    });
    openModal(h('div', { class: 'col', style: { gap: '10px' } },
      h('div', { class: 'row between' },
        h('h3', {}, `${slot} 슬롯 — ${POSITION_LABELS[pos] ?? pos} 적성`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      pos === 'GK'
        ? h('p', { class: 'tiny warn' }, 'GK는 적성 A/B 선수만 배치할 수 있습니다.')
        : h('p', { class: 'tiny muted' }, '적성 C도 배치할 수 있지만 경기 스탯에 페널티가 붙습니다. "-"는 배치 불가.'),
      h('div', { class: 'list' }, list),
      s.squad[slot]
        ? h('button', { class: 'btn btn-block btn-ghost', onclick: () => { delete s.squad[slot]; closeOverlays(); rerender(); } }, '슬롯 비우기')
        : null,
    ));
  }

  // ---- 공명 / 경고 ----
  const assigned = slots.map((sl) => charById.get(s.squad[sl])).filter(Boolean);
  const elemCounts = {};
  for (const c of assigned) elemCounts[c.element] = (elemCounts[c.element] || 0) + 1;
  const res = cfg.elementResonance || {};
  const minP = res.minPlayers ?? 3;
  const strongP = res.strongPlayers ?? 4;
  const resonant = Object.entries(elemCounts).filter(([, n]) => n >= minP).sort((a, b) => b[1] - a[1]);
  const warnings = [];
  for (const sl of slots) {
    const c = charById.get(s.squad[sl]);
    if (!c) continue;
    const apt = c.aptitude?.[positionOfSlot(sl)] ?? '-';
    if (apt === 'C') warnings.push(`${c.name} ${positionOfSlot(sl)} 적성 C (스탯 ×${cfg.aptitudeMult?.C ?? 0.75})`);
    if (apt === '-') warnings.push(`${c.name} ${positionOfSlot(sl)} 배치 불가`);
    if (positionOfSlot(sl) === 'GK' && apt === 'C') warnings.push('GK는 적성 A/B만 허용');
  }
  const missing = slots.filter((sl) => !s.squad[sl]);

  const resonanceEl = h('div', { class: 'col' },
    h('div', { class: 'row wrap' },
      resonant.length
        ? resonant.map(([el, n]) => h('span', { class: ['badge', n >= strongP ? 'badge-gold' : 'badge-good'] },
          `${ELEMENT_ICONS[el] ?? ''} ${ELEMENT_LABELS[el] ?? el} 공명 ${n}명${n >= strongP ? ' (강)' : ''} ✔`))
        : h('span', { class: 'badge' }, `원소 공명 없음 (같은 원소 ${minP}명 이상)`),
      Object.entries(elemCounts).filter(([, n]) => n < minP).map(([el, n]) =>
        h('span', { class: 'tiny muted' }, `${ELEMENT_ICONS[el] ?? ''}${n}`))),
    warnings.length ? h('div', { class: 'col' }, warnings.map((w) => h('span', { class: 'tiny warn' }, `⚠ ${w}`))) : null,
    missing.length ? h('span', { class: 'tiny muted' }, `비어 있는 슬롯: ${missing.join(', ')}`) : null,
  );

  // ---- 서포트 ----
  const supportGrid = h('div', { class: 'support-grid' }, supports.map((sp) => {
    const selected = s.supportIds.includes(sp.id);
    const full = s.supportIds.length >= supportCount;
    return h('button', {
      class: ['support-card', selected ? 'selected' : ''],
      disabled: !selected && full,
      onclick: () => {
        if (selected) s.supportIds = s.supportIds.filter((id) => id !== sp.id);
        else if (!full) s.supportIds = [...s.supportIds, sp.id];
        rerender();
      },
    },
    avatar(sp.portraitColor, sp.name, 'sm'),
    // 이름은 이름 줄 전체 폭을 쓰고 단어 단위로만 줄바꿈. 희귀도는 보조 줄 맨 앞, 보조 줄은 항목(" · ") 단위로만 줄바꿈
    h('span', { class: 'grow col' },
      h('span', { class: 'sp-name', title: `${sp.name}${sp.rarity ? ` (${sp.rarity})` : ''}` }, sp.name),
      h('span', { class: 'tiny muted sp-sub' }, ...[
        sp.rarity ? h('span', { class: ['nw', `rarity-${sp.rarity}`] }, sp.rarity) : null,
        h('span', { class: 'nw' }, SUPPORT_TYPE_LABELS[sp.type] ?? sp.type),
        sp.trainingBonus ? h('span', { class: 'nw' }, `효율 +${Math.round(sp.trainingBonus * 100)}%`) : null,
        sp.initialBond != null ? h('span', { class: 'nw' }, `유대 ${sp.initialBond}`) : null,
      ].filter(Boolean).flatMap((el, i) => (i ? [' · ', el] : [el])))),
    selected ? h('span', { class: 'badge badge-accent' }, '✔') : null,
    );
  }));

  // ---- 전술 ----
  const tacticsEl = h('div', { class: 'grid-3' }, TACTIC_MAIN_KEYS.map((key) =>
    h('div', { class: 'field' },
      h('label', {}, TACTIC_LABELS[key]),
      select(TACTIC_OPTIONS[key], s.tactics[key], (v) => { s.tactics[key] = v; }))));

  // ---- 시작 ----
  function startCustom() {
    if (missing.length) return toast(`비어 있는 슬롯이 있습니다: ${missing.join(', ')}`);
    if (s.supportIds.length !== supportCount) return toast(`서포트 카드를 ${supportCount}장 선택하세요 (현재 ${s.supportIds.length}장)`);
    const gk = charById.get(s.squad.GK);
    if (gk && !['A', 'B'].includes(gk.aptitude?.GK)) return toast('GK는 적성 A/B 선수만 가능합니다.');
    actions.startRun({
      squad: { ...s.squad },
      formation: s.formation,
      supportIds: [...s.supportIds],
      tactics: { ...s.tactics },
      seed: (s.seed || '').trim() || randomSeed(),
    });
  }
  function startDefault() {
    const dsq = cfg.defaultSquad;
    if (!dsq?.slots) return toast('config.defaultSquad가 없습니다.');
    actions.startRun({
      squad: { ...dsq.slots },
      formation: dsq.formation || '2-2-2',
      supportIds: [...(cfg.defaultSupports || [])],
      tactics: { ...(cfg.defaultTactics || {}) },
      seed: (s.seed || '').trim() || randomSeed(),
    });
  }

  root.append(h('div', { class: 'screen' },
    h('div', { class: 'screen-title' },
      h('h2', {}, '편성'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => actions.goto('start') }, '← 처음으로')),

    section('포메이션',
      select(Object.keys(FORMATIONS).map((f) => [f, `${f} (DF ${FORMATIONS[f].DF} · MF ${FORMATIONS[f].MF} · FW ${FORMATIONS[f].FW})`]),
        s.formation, (v) => { s.formation = v; rerender(); }),
      h('div', { class: 'slot-cards' }, slots.map(slotCard)),
      resonanceEl),

    section(`서포트 카드 (${s.supportIds.length}/${supportCount})`, supportGrid),

    section('전술 지시', tacticsEl,
      h('p', { class: 'tiny muted' }, '텐션 사용·듀얼 담당은 기본값을 따르며 런 중 전술 미팅에서 바꿀 수 있습니다.')),

    section('seed',
      h('input', {
        class: 'input', type: 'text', placeholder: '비우면 랜덤 seed', value: s.seed ?? '',
        autocomplete: 'off', spellcheck: 'false',
        oninput: (e) => { s.seed = e.target.value; },
      }),
      h('p', { class: 'tiny muted' }, '같은 seed + 같은 선택 = 같은 결과.')),

    h('div', { class: 'btn-list' },
      h('button', { class: 'btn btn-primary btn-block', onclick: startCustom }, '런 시작'),
      h('button', { class: 'btn btn-block', onclick: startDefault }, '기본 편성으로 시작')),
  ));
}
