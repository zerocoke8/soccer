// js/ui/screens/setup.js — 편성 화면 (런 시작 전)
// 가로 스테이지(1280×720), 페이지 스크롤 없음:
//   ┌ 머리 줄: ← 처음으로 · 편성 · 조작 안내 ················ seed · [기본 편성으로 시작] [런 시작] ┐
//   │ 포메이션 · 배치 · 전술: 가로 미니 필드(우리 골 왼쪽 — 경기 화면과 같은 방향), 슬롯 7개 │ 코치 (서포트 칩 2열, n/6)       │
//   │ 원소 공명 · 경고                                                         │  칩 = 이름 · 희귀도 · 타입 ·    │
//   │ 전술 지시 4개 한 줄 (공격 성향 · 슛 타이밍 · 수비 성향 · 배급)               │  ⚑ 파티 패시브 글 · 80: 유대 80 │
//   │                                                                          │ 훈련 방침 5개 (레슨 버프 — 경기 전술 아님) │
//   │ 선수 풀: 캐릭터 전원 카드 2줄 × 8장 (필드 선수 슬롯 순서 → 벤치 레어도 순, LESSON_PROTO_PLAN §19.14 ①)        │
//   └──────────────────────────────────────────────────────────────────────────────────────┘
// 배치는 라인업 보드(js/ui/lineup.js): 선수 카드를 끌어 슬롯에 놓기 (초록 = 가능 · 빨강 = 불가), 눌러서 고른 뒤 자리 누르기도 된다.
// L48: 코치 칩에 파티 패시브 (data.supports[].partyPassive — 글 + "80: …" 유대 80 글, 이름 · 전체 글은 title). 칩이 커져
//   전술 지시 4개는 옆 칸에서 미니 필드 아래 한 줄로 옮겼다 (옆 칸 = 코치 · 훈련 방침).
import { h, avatar, select, toast, panel, openModal, closeOverlays } from '../dom.js';
import {
  STATS, POSITIONS, slotsOf, positionOfSlot, POSITION_LABELS, ELEMENT_LABELS, ELEMENT_ICONS, STYLE_LABELS,
  RACE_LABELS, SUPPORT_TYPE_LABELS, TACTIC_SETUP_KEYS, TACTIC_LABELS, TACTIC_OPTIONS,
  APTITUDE_ORDER, FORMATIONS, randomSeed, traitInfo, POLICIES, policyInfo, ultimateInfo, captainCount, captainNote,
} from '../labels.js';
import { lineupBoard, reseat, slotSpot, slotOfId, checkMove, applyMove, badText, poolOrder, ultChip, ultMark } from '../lineup.js';
import { setupPartyLine } from '../passives.js';
import { portraitUrl } from '../art.js';

export { slotSpot }; // 예전 위치 (test/outgame.test.mjs) — 이제 js/ui/lineup.js

export function initSetup(data, seedPrefill = '') {
  const cfg = data?.config || {};
  const dsq = cfg.defaultSquad || {};
  return {
    formation: dsq.formation || '2-2-2',
    squad: { ...(dsq.slots || {}) },
    supportIds: Array.isArray(cfg.defaultSupports) ? [...cfg.defaultSupports] : [],
    tactics: {
      attack: 'balanced', shootTiming: 'breakAll', defense: 'balanced', tension: 'clutch', duelPicker: 'best', distribution: 'auto',
      ...(cfg.defaultTactics || {}),
    },
    policy: data?.lesson?.defaultPolicy || 'team', // 훈련 방침 (LESSON_PROTO_PLAN §6.3) — createRun({ policy })
    seed: seedPrefill || '',
  };
}

/** 고를 수 있는 훈련 방침 id (data.policies 순서, 없으면 labels.POLICIES) */
function policyIds(data) {
  const list = Array.isArray(data?.policies?.policies) ? data.policies.policies.map((p) => p?.id).filter(Boolean) : [];
  return list.length ? list : POLICIES;
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
  for (const k of Object.keys(s.squad)) if (!slots.includes(k) || !charById.has(s.squad[k])) delete s.squad[k];

  // 다시 그리기 전에 보드의 탭 선택 · 드래그를 걷는다 (문서에 건 Esc · 바깥 누름 리스너가 옛 보드에 남지 않게 — 키보드로 서포트 칩을 눌러도)
  const rerender = () => { board.cancel(); ctx.render(); };
  const aptOf = (cid, pos) => charById.get(cid)?.aptitude?.[pos] ?? '-';

  // 연계 특성 (GDD v0.5 §9.10): 카드엔 이름, 설명은 title
  function traitTag(id) {
    const t = traitInfo(id, data);
    return t ? h('span', { class: 'trait-tag tiny', title: t.description }, `${t.icon} ${t.name}`) : null;
  }
  const elemLine = (c) => `${ELEMENT_ICONS[c.element] ?? ''} ${ELEMENT_LABELS[c.element] ?? c.element ?? ''} · ${STYLE_LABELS[c.style] ?? c.style ?? ''}`;
  const ultOf = (c) => ultimateInfo(c?.innateSkillId, data);
  // 얼굴 일러스트 (§24.12.3): 캐릭터 id · 서포트 id → data/portraits.json 그림 (없으면 글자 원)
  const faceOf = (id) => portraitUrl(data, id, 'face');

  // ---- 라인업 보드: 미니 필드 슬롯 + 선수 풀 ----
  const board = lineupBoard({
    slots,
    assign: s.squad,
    bench: true,
    // 2줄 × 8장: 필드 선수(슬롯 순서) → 벤치(레어도 SSR → SR → R, 같으면 데이터 순서)
    ids: poolOrder(chars.map((c) => c.id), slots, s.squad, (cid) => charById.get(cid)?.rarity),
    aptOf,
    nameOf: (cid) => charById.get(cid)?.name ?? cid,
    colorOf: (cid) => charById.get(cid)?.portraitColor,
    faceOf,
    titleOf: (cid) => ultOf(charById.get(cid))?.title ?? '',
    slotBody: (cid) => {
      const c = charById.get(cid);
      const u = ultOf(c);
      return [
        avatar(c.portraitColor, c.name, 'md', 'slot-face', { art: faceOf(c.id) }), // 필드 칸 얼굴 44px (§24.12.3 — 30 → 44)
        h('span', { class: 'grow col' },
          h('span', { class: 'slot-nm-row' }, h('span', { class: 'ellipsis slot-nm' }, c.name), ultMark(u)),
          h('span', { class: 'tiny muted ellipsis' }, elemLine(c)),
          c.trait ? traitTag(c.trait) : null),
      ];
    },
    poolBody: (cid) => {
      const c = charById.get(cid);
      const total = STATS.reduce((sum, st) => sum + (Number(c.baseStats?.[st]) || 0), 0);
      const t = traitInfo(c.trait, data);
      const u = ultOf(c);
      return [
        h('span', { class: 'lu-card-who', title: `${c.name} · ${RACE_LABELS[c.race] ?? c.race ?? ''} · 스탯 합 ${total}${t ? `\n${t.icon} ${t.name}: ${t.description}` : ''}` },
          avatar(c.portraitColor, c.name, 'xs', '', { art: faceOf(c.id) }),
          h('b', { class: 'lu-card-nm ellipsis' }, c.name)),
        h('span', { class: 'tiny muted ellipsis' }, h('span', { class: `rarity-${c.rarity}` }, c.rarity ?? ''), ` · ${elemLine(c)}`),
        // 특성 + 필살기 한 줄: 특성은 아이콘만 (이름 · 설명은 title), 필살기 칩은 이름까지
        h('span', { class: 'lu-chips' },
          t ? h('span', { class: 'trait-tag tiny lu-trait', title: `${t.icon} ${t.name}: ${t.description}`, 'aria-label': t.name }, t.icon) : null,
          u ? ultChip(u) : (t ? null : h('span', { class: 'tiny muted' }, '특성 없음'))),
        h('span', { class: 'lu-apts' }, POSITIONS.map((p) => h('span', { class: 'lu-apt' }, h('i', {}, p), aptBadge(c.aptitude?.[p])))),
      ];
    },
    onChange: (next) => { s.squad = next; rerender(); },
    onSlotTap: (slot) => openSlotPicker(slot),
  });

  // ---- 슬롯 탭 → 선수 고르기 모달 (드래그 대신 쓰는 탭 · 키보드 경로). 보드와 같은 규칙 · 같은 색 ----
  // 필드 선수를 고르면 자리를 맞바꾸고(그 선수가 원래 자리에 설 수 있어야), 벤치 선수를 고르면 투입 (있던 선수는 벤치로).
  function openSlotPicker(slot) {
    const pos = positionOfSlot(slot);
    const model = { slots, assign: s.squad, aptOf, bench: true };
    const nameOf = (cid) => charById.get(cid)?.name ?? cid;
    const sorted = [...chars].sort((a, b) =>
      (APTITUDE_ORDER[aptOf(a.id, pos)] ?? 3) - (APTITUDE_ORDER[aptOf(b.id, pos)] ?? 3));
    const list = sorted.map((c) => {
      const apt = aptOf(c.id, pos);
      const where = slotOfId(s.squad, c.id);
      const current = where === slot;
      const move = { id: c.id, to: slot };
      const chk = current ? { ok: true } : checkMove(model, move);
      const why = chk.ok ? null : (chk.reason ? badText(pos, apt, chk.reason) : `${nameOf(chk.occupant)} → ${badText(chk.occPos, chk.occApt, chk.occReason)}`);
      const total = STATS.reduce((sum, st) => sum + (Number(c.baseStats?.[st]) || 0), 0);
      const aptLine = POSITIONS.map((p) => `${p} ${c.aptitude?.[p] ?? '-'}`).join(' · ');
      const t = traitInfo(c.trait, data);
      const u = ultOf(c);
      // 4열 압축판 (§19.14 ①): 이름 · 레어도 · 배지 / 종족 · 원소 · 스타일 · 스탯 합 / 적성 4 / 특성 · ✨필살기 — 긴 글은 title
      return h('button', {
        type: 'button',
        class: ['char-pick', 'compact', current ? 'current' : '', chk.ok ? 'pick-ok' : 'pick-bad'],
        disabled: !chk.ok,
        dataset: { pid: c.id },
        title: [why ? `놓을 수 없음 — ${why}` : '', t ? `${t.icon} ${t.name}: ${t.description}` : '', u ? u.title : ''].filter(Boolean).join('\n'),
        onclick: () => {
          closeOverlays();
          if (!current) s.squad = applyMove(s.squad, move);
          rerender();
        },
      },
      avatar(c.portraitColor, c.name, 'sm', '', { art: faceOf(c.id) }),
      h('span', { class: 'grow col cp-txt' },
        h('span', { class: 'cp-l1' },
          h('b', { class: 'cp-nm' }, c.name),
          h('span', { class: ['tiny', `rarity-${c.rarity}`] }, c.rarity ?? ''),
          why ? h('span', { class: 'badge badge-bad cp-badge ellipsis' }, `✖ ${why}`)
            : current ? h('span', { class: 'badge badge-good cp-badge' }, '현재')
              : where ? h('span', { class: 'badge cp-badge' }, `⇄ ${where}`) : h('span', { class: 'badge cp-badge' }, '벤치')),
        h('span', { class: 'tiny muted ellipsis' },
          `${RACE_LABELS[c.race] ?? c.race ?? ''} · ${ELEMENT_ICONS[c.element] ?? ''}${ELEMENT_LABELS[c.element] ?? ''} · ${STYLE_LABELS[c.style] ?? ''} · 합 ${total}`),
        h('span', { class: 'tiny muted ellipsis' }, aptLine),
        h('span', { class: 'cp-l4' },
          t ? h('span', { class: 'trait-tag tiny' }, `${t.icon} ${t.name}`) : null,
          u ? ultChip(u) : null)),
      aptBadge(apt),
      );
    });
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'row between' },
        h('h3', {}, `${slot} 슬롯 — ${POSITION_LABELS[pos] ?? pos} 적성`),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'tiny muted' },
        pos === 'GK' ? 'GK는 적성 A/B 선수만 배치할 수 있습니다. ' : '적성 C도 배치할 수 있지만 경기 스탯에 페널티가 붙습니다. "-"는 배치 불가. ',
        '필드 선수를 고르면 자리를 맞바꿉니다. 필드에서 카드를 끌어 옮길 수도 있습니다.'),
      h('div', { class: 'pick-grid cols-4' }, list),
      s.squad[slot]
        ? h('div', { class: 'row end' },
          h('button', { class: 'btn btn-ghost', onclick: () => { delete s.squad[slot]; closeOverlays(); rerender(); } }, '슬롯 비우기 (벤치로)'))
        : null,
    ), { className: 'modal-xl setup-pick' });
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
    const apt = aptOf(c.id, positionOfSlot(sl));
    if (apt === 'C') warnings.push(`${c.name} ${positionOfSlot(sl)} 적성 C (스탯 ×${cfg.aptitudeMult?.C ?? 0.75})`);
    if (apt === '-') warnings.push(`${c.name} ${positionOfSlot(sl)} 배치 불가`);
    if (positionOfSlot(sl) === 'GK' && apt === 'C') warnings.push('GK는 적성 A/B만 허용');
  }
  const missing = slots.filter((sl) => !s.squad[sl]);
  const captainTxt = captainNote(captainCount(assigned.map((c) => c.id), data), data); // L46: 주장 2명이면 1명분 안내
  const benchCount = chars.length - assigned.length;

  // 필드 아래 줄: 공명 배지 · 원소별 인원 · 경고 · 빈 슬롯
  const resonanceEl = h('div', { class: 'resonance' },
    h('div', { class: 'row wrap' },
      resonant.length
        ? resonant.map(([el, n]) => h('span', { class: ['badge', n >= strongP ? 'badge-gold' : 'badge-good'] },
          `${ELEMENT_ICONS[el] ?? ''} ${ELEMENT_LABELS[el] ?? el} 공명 ${n}명${n >= strongP ? ' (강)' : ''} ✔`))
        : h('span', { class: 'badge' }, `원소 공명 없음 (같은 원소 ${minP}명 이상)`),
      Object.entries(elemCounts).filter(([, n]) => n < minP).map(([el, n]) =>
        h('span', { class: 'tiny muted' }, `${ELEMENT_ICONS[el] ?? ''}${n}`)),
      captainTxt ? h('span', { class: 'badge cap-note', title: traitInfo('captain', data)?.description ?? '' }, captainTxt) : null,
      missing.length ? h('span', { class: 'tiny warn' }, `비어 있는 슬롯: ${missing.join(', ')}`) : null),
    warnings.length ? h('div', { class: 'row wrap' }, warnings.map((w) => h('span', { class: 'tiny warn' }, `⚠ ${w}`))) : null,
  );

  // 포메이션: 바뀌면 남는 슬롯은 그대로, 없어진 슬롯의 선수는 설 수 있는 빈 슬롯으로 (lineup.js reseat), 못 앉으면 벤치
  const formationSel = select(Object.keys(FORMATIONS).map((f) => [f, `${f} (DF ${FORMATIONS[f].DF} · MF ${FORMATIONS[f].MF} · FW ${FORMATIONS[f].FW})`]),
    s.formation, (v) => {
      board.cancel();
      s.squad = reseat(s.squad, slotsOf(v), aptOf);
      s.formation = v;
      rerender();
    }, { 'aria-label': '포메이션' });

  // ---- 서포트: 작은 칩 (아바타 · 이름 · 희귀도 · 타입), 누르면 선택/해제. 자세한 값은 title ----
  const full = s.supportIds.length >= supportCount;
  const supportGrid = h('div', { class: 'sp-chips' }, supports.map((sp) => {
    const selected = s.supportIds.includes(sp.id);
    const type = SUPPORT_TYPE_LABELS[sp.type] ?? sp.type ?? '';
    const pp = setupPartyLine(sp); // 파티 패시브 (L48): 편성하면 런 내내 경기 전체에, 유대 80 = 한 단계 위
    const detail = [
      `${sp.name}${sp.rarity ? ` (${sp.rarity})` : ''}`,
      `타입 ${type}`,
      sp.trainingBonus ? `훈련 효율 +${Math.round(sp.trainingBonus * 100)}%` : null,
      sp.initialBond != null ? `초기 유대 ${sp.initialBond}` : null,
      sp.description || null,
    ].filter(Boolean).join(' · ') + (pp ? `\n${pp.title}` : '');
    return h('button', {
      type: 'button',
      class: ['sp-chip', 'support-card', selected ? 'selected' : ''], // support-card = 예전 이름 (test/ui.smoke.test.mjs 가 찾는다), 모양은 .sp-chip
      disabled: !selected && full,
      title: detail,
      'aria-pressed': selected ? 'true' : 'false',
      onclick: () => {
        if (selected) s.supportIds = s.supportIds.filter((id) => id !== sp.id);
        else if (!full) s.supportIds = [...s.supportIds, sp.id];
        rerender();
      },
    },
    avatar(sp.portraitColor, sp.name, 'xs', '', { art: faceOf(sp.id) }),
    h('span', { class: 'col sp-chip-txt' },
      h('span', { class: 'sp-chip-nm ellipsis' }, sp.name),
      h('span', { class: 'tiny muted ellipsis' },
        sp.rarity ? h('span', { class: `rarity-${sp.rarity}` }, sp.rarity) : null, ` ${type}`,
        sp.trainingBonus ? ` +${Math.round(sp.trainingBonus * 100)}%` : '')),
    pp ? h('span', { class: 'sp-chip-pp', 'aria-label': `파티 패시브 ${pp.name}: ${pp.text}` },
      h('span', { class: 'sp-pp-ico', 'aria-hidden': 'true' }, '⚑'), pp.text,
      pp.more ? h('span', { class: 'sp-pp-80' }, ` · 80: ${pp.more}`) : null) : null,
    selected ? h('span', { class: 'sp-check', 'aria-hidden': 'true' }, '✔') : null,
    );
  }));

  // ---- 전술 (미니 필드 아래 한 줄 = 라벨 + 선택 4칸): 공격 성향 · 슛 타이밍 · 수비 성향 · 배급 (GK 배급 2026-09-29) ----
  const tacticsEl = h('div', { class: 'tac-rows' }, TACTIC_SETUP_KEYS.map((key) =>
    h('label', { class: 'tac-row' },
      h('span', { class: 'tiny muted' }, TACTIC_LABELS[key]),
      select(TACTIC_OPTIONS[key], s.tactics[key], (v) => { s.tactics[key] = v; }, { 'aria-label': TACTIC_LABELS[key] }))));

  // ---- 훈련 방침 (버튼 5개 — 전술 select 와 섞이지 않게 <select> 를 쓰지 않는다) ----
  const pids = policyIds(data);
  if (!pids.includes(s.policy)) s.policy = pids.includes(data?.lesson?.defaultPolicy) ? data.lesson.defaultPolicy : pids[0];
  const curPolicy = policyInfo(s.policy, data);
  // 고른 방침 설명 = 패널 머리 오른쪽 한 줄 ("경기 전술 아님" 은 title)
  const policyDesc = h('span', { class: 'tiny muted policy-desc', title: `${curPolicy.name} — ${curPolicy.desc}\n레슨에서 붙는 버프가 바뀝니다 (경기 전술 아님).` }, curPolicy.desc);
  const policyEl = h('div', { class: 'policy-pick' },
    h('div', { class: 'policy-row', role: 'radiogroup', 'aria-label': '훈련 방침' }, pids.map((id) => {
      const info = policyInfo(id, data);
      const on = id === s.policy;
      return h('button', {
        type: 'button',
        class: ['btn', 'btn-sm', 'policy-btn', on ? 'active' : ''],
        role: 'radio',
        'aria-checked': on ? 'true' : 'false',
        dataset: { policy: id },
        title: `${info.name} — ${info.desc}`,
        onclick: () => { if (!on) { s.policy = id; rerender(); } },
      }, info.name);
    })));

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
      policy: s.policy,
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
      policy: s.policy, // 기본 편성이어도 고른 방침은 쓴다
      seed: (s.seed || '').trim() || randomSeed(),
    });
  }

  const seedField = h('label', { class: 'seed-field', title: '같은 seed + 같은 선택 = 같은 결과. 비우면 랜덤 seed' },
    h('span', { class: 'tiny muted' }, 'seed'),
    h('input', {
      class: 'input', type: 'text', placeholder: '비우면 랜덤', value: s.seed ?? '',
      autocomplete: 'off', spellcheck: 'false', 'aria-label': 'seed',
      oninput: (e) => { s.seed = e.target.value; },
    }));

  // 선수 풀 패널 전체 = "벤치로" 놓는 곳 (카드 위는 그 선수와 맞바꾸기 · 교체)
  const poolPanel = panel(`선수 ${chars.length}명 — 필드 ${assigned.length}/${slots.length} · 벤치 ${benchCount}`, {
    cls: 'setup-pool',
    right: h('span', { class: 'tiny muted lu-pool-tip' }, '필드 선수를 이 칸에 끌어 놓으면 벤치 · 벤치 선수 카드 위에 놓으면 교체'),
  }, board.pool);
  board.addPoolZone(poolPanel);

  root.append(h('div', { class: 'screen og setup-screen' },
    h('header', { class: 'og-head' },
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => actions.goto('start') }, '← 처음으로'),
      h('h2', {}, '편성'),
      h('span', { class: 'muted small grow setup-tip' },
        '선수 카드를 끌어 필드 자리에 놓으세요 — ', h('b', { class: 'good' }, '초록'), ' 가능 · ', h('b', { class: 'bad' }, '빨강'), ' 불가. 슬롯을 누르면 목록에서 고를 수도 있습니다.'),
      h('div', { class: 'setup-start' },
        seedField,
        h('button', { class: 'btn', onclick: startDefault }, '기본 편성으로 시작'),
        h('button', { class: 'btn btn-primary', onclick: startCustom }, '런 시작'))),

    h('div', { class: 'setup-main' },
      panel('포메이션 · 배치 · 전술', { cls: 'setup-pitch', right: h('div', { class: 'formation-sel' }, formationSel) },
        board.pitch, resonanceEl,
        // 전술 지시 4개 (L48 — 코치 칩이 파티 패시브로 커져 옆 칸에서 옮겼다): 라벨 + 선택 한 줄
        h('div', { class: 'setup-tactics' },
          h('span', { class: 'tiny muted setup-tac-head', title: '텐션 사용·듀얼 담당은 기본값을 따르며 런 중 전술 미팅에서 바꿀 수 있습니다.' }, '전술 지시'),
          tacticsEl)),

      h('div', { class: 'setup-side' },
        // 서포트 칩은 데이터 개수만큼 늘어난다 → 이 패널만 남는 높이를 쓰고 안쪽 스크롤 (훈련 방침 패널은 늘 보인다 — outgame.css)
        panel(`코치 ${s.supportIds.length}/${supportCount}`, {
          cls: ['grow-panel', 'setup-supports', s.supportIds.length === supportCount ? 'done' : ''].filter(Boolean).join(' '),
          scroll: true,
          right: h('span', { class: 'tiny muted' }, `${supports.length}명 중 ${supportCount}명 · ⚑ = 파티 패시브`),
        }, supportGrid),
        // 훈련 방침 (레슨 버프 — 경기 전술 아님): 머리 = 고른 방침 설명, 버튼 5
        panel('훈련 방침', { cls: 'setup-policy', right: policyDesc }, policyEl)),

      poolPanel,
    ),
  ));
}
