// js/ui/hud.js — 레슨 런 공용 HUD (LESSON_PROTO_PLAN §3.1 · §6.3): 상단 바 · 선수 · 코치 패널 · 유물/기록 모달
// 옛 훈련 화면(screens/training.js — U2 에서 지움)의 상단 바 · 명단 패널을 떼어 내 레슨 런 뷰(lessonRun.getWeekView 모양)에 맞췄다.
// 주 선택 · 경기 전 준비 · 상담 화면이 같이 쓴다. 엔진 로직은 없다 — 뷰 값만 그린다.
//
//   hudTopbar(view, ctx)  → <header class="topbar">  시즌 · 주 점(●●○○⚔) · 주 종류 │ 다음 경계전 상대 │ 컨디션 · 팀워크 · SP · TP · seed
//   hudRoster(view, ctx)  → <aside class="og-panel roster">  선수 7 (체력 · 스탯, 주 스탯 쌍 강조, 결장) + 코치 유대 (눈금 = 강화 유대) · 파티 패시브 (L48)
//   openRecords(view, ctx) → 유물 · 보정 · 최근 기록 모달
import { h, avatar, bar, signed, gradeBadge, gradeOf, openModal, closeOverlays } from './dom.js';
import * as L from './labels.js';
import { playerArt, portraitUrl } from './art.js';

export const stamCls = (st) => (st >= 60 ? 'good' : st >= 40 ? 'warn' : 'bad');

export function condDots(cond) {
  const c = Math.max(0, Math.min(4, Number(cond) || 0));
  return h('span', { class: 'cond-dots' }, [0, 1, 2, 3, 4].map((i) => h('i', { class: i <= c ? 'on' : '' })));
}

/** 다음 경계전까지 문구: 이번 시즌 경계전을 이미 치름 = "경계전 종료", 경기 전 준비 = "경기 전 준비", 그 밖 = "N주 후 경계전" / "이번 주 뒤 경계전" */
export function matchWhenText(view, state) {
  const season = view.season ?? state?.season;
  const goals = view.record?.goalMatches ?? state?.record?.goalMatches ?? [];
  if (goals.some((g) => g?.season === season)) return '경계전 종료';
  const phase = view.phase ?? state?.phase;
  if (phase === 'prep') return '경기 전 준비';
  const n = Number(view.weeksToMatch);
  if (!Number.isFinite(n)) return '경계전';
  return n > 0 ? `${n}주 후 경계전` : '이번 주 뒤 경계전';
}

/**
 * 상단 바. view = lessonRun.getWeekView 모양 { season, week, seasons, weeksPerSeason, weekKinds, kind, nextMatch, weeksToMatch, status, phase, record }
 * @param {object} view
 * @param {{ store: object }} ctx
 */
export function hudTopbar(view, ctx) {
  const state = ctx?.store?.run || {};
  const wps = Number(view.weeksPerSeason) || 5;
  const seasons = Number(view.seasons) || 3;
  const week = Number(view.week ?? state.turn) || 0;
  const kinds = Array.isArray(view.weekKinds) ? view.weekKinds : [];
  const kind = view.kind ?? kinds[week - 1];
  const st = view.status || {};
  const cond = Number(st.condition ?? state.condition ?? 2);
  const nm = view.nextMatch || {};
  const pips = h('span', { class: 'turn-pips', 'aria-hidden': 'true' },
    Array.from({ length: wps }, (_, i) => h('i', {
      class: [i + 1 < week ? 'done' : i + 1 === week ? 'cur' : '', kinds[i] ? `wk-${kinds[i]}` : ''],
      title: `${i + 1}주 · ${L.WEEK_KIND_LABELS[kinds[i]] ?? ''}`,
    })),
    h('b', { class: 'pip-match', title: '경계전' }, '⚔'));
  return h('header', { class: 'topbar' },
    h('div', { class: 'tb-turn' },
      h('div', { class: 'title-row' },
        h('h2', {}, `시즌 ${view.season ?? state.season ?? '?'}`,
          h('span', { class: 'muted tb-of' }, `/${seasons}`),
          h('span', { class: 'muted tb-turn-n' }, ` · ${week || '?'}/${wps}주`)),
        kind ? h('span', { class: ['badge', 'tb-kind', `wk-${kind}`] }, L.WEEK_KIND_LABELS[kind] ?? kind) : null),
      pips),
    h('div', { class: 'card card-sm next-match' },
      h('span', { class: 'vs' }, '⚔'),
      h('span', { class: 'grow col' },
        h('span', { class: 'nm-line' }, h('b', {}, nm.opponentName ?? '?'),
          h('span', { class: 'muted' }, ` · ${matchWhenText(view, state)}`)),
        h('span', { class: 'small muted nm-sub' },
          `${L.ELEMENT_ICONS[nm.element] ?? ''} ${L.label(L.ELEMENT_LABELS, nm.element, '?')} · ${L.label(L.STYLE_LABELS, nm.style, '?')}` +
          ` · ${nm.possessions ?? '?'}포제션` +
          ` · 상대 ${nm.styleHint ?? '성향 ?'}${Number(nm.gaanpaTickets) > 0 ? ` · 간파 사용권 ${nm.gaanpaTickets}` : ''}`))),
    h('div', { class: 'tb-status' },
      h('div', { class: 'status-row' },
        h('span', { class: 'status-chip', title: `컨디션 ${L.CONDITION_LABELS[cond] ?? cond}` },
          '컨디션 ', condDots(cond), h('span', { class: 'muted' }, L.CONDITION_LABELS[cond] ?? '')),
        h('span', { class: 'status-chip', title: '팀워크 (0~100)' }, '팀워크 ', h('b', {}, st.teamwork ?? state.teamwork ?? 0)),
        h('span', { class: 'status-chip', title: '스킬 포인트 — 상담에서 스킬을 배운다' }, 'SP ', h('b', {}, st.sp ?? state.skillPoints ?? 0)),
        h('span', { class: 'status-chip', title: '훈련 포인트 — 상담에서 카드를 사고 · 강화하고 · 지운다' }, 'TP ', h('b', {}, st.tp ?? state.trainingPoints ?? 0))),
      h('span', { class: 'muted tiny tb-seed' },
        `${L.policyInfo(view.policy ?? state.policy, ctx?.data).name} · seed ${state.seed ?? ''}`)),
  );
}

/**
 * 선수 7 + 코치 유대 패널. view.players = lessonRun playerView (stamina · injuredTurns · stats · mainStats …),
 * view.coaches = [{ id, name, type, bond, cardId, upgraded, portraitColor }],
 * view.partyPassives = [{ coachId, name, text, text80, upgraded }] (L48 — 코치 칸 아래 줄 "⚑ 이름 글", 유대 80 이면 금색 ★)
 */
export function hudRoster(view, ctx) {
  const data = ctx?.data || {};
  const thresholds = data.config?.rating?.thresholds;
  const upgradeAt = Number(data.lesson?.bond?.upgradeAt) || 80;
  const players = Array.isArray(view.players) ? view.players : [];
  const coaches = Array.isArray(view.coaches) ? view.coaches : [];
  const party = new Map((Array.isArray(view.partyPassives) ? view.partyPassives : []).map((pp) => [pp.coachId, pp]));
  const cardName = (id) => (Array.isArray(data.cards?.cards) ? data.cards.cards.find((c) => c.id === id)?.name : null) ?? id ?? '';
  return h('aside', { class: 'og-panel roster' },
    h('div', { class: 'og-panel-head' },
      h('h3', { class: 'og-panel-title' }, `선수 ${players.length}`),
      h('span', { class: 'badge' }, view.formation ?? ctx?.store?.run?.formation ?? '')),
    h('div', { class: 'ro-list' }, players.map((p) => {
      const st = Number(p.stamina) || 0;
      const out = Number(p.injuredTurns) > 0;
      const mains = Array.isArray(p.mainStats) ? p.mainStats : [];
      return h('div', {
        class: ['ro-row', out ? 'injured' : ''],
        title: `${p.name} · ${p.slot} · 체력 ${st}${mains.length ? ` · 주 스탯 ${mains.map((k) => L.STAT_LABELS[k] ?? k).join('·')}` : ''}${out ? ` · 레슨 결장 ${p.injuredTurns}회 · 경기는 출전` : ''}`,
      },
      avatar(p.portraitColor, p.name, 'xs', out || st < 40 ? 'dim' : '', { art: playerArt(ctx, p) }),
      h('span', { class: 'ro-name' }, h('b', { class: 'ellipsis' }, p.name), h('span', { class: 'ro-slot' }, p.slot ?? ''),
        out ? h('span', { class: 'badge badge-bad', title: `레슨 결장 ${p.injuredTurns}회 · 경기는 출전` }, `결장 ${p.injuredTurns}`) : null),
      h('span', { class: 'ro-stam' }, bar(st / 100, stamCls(st)), h('b', { class: stamCls(st) }, st)),
      h('span', { class: 'ro-stats' }, L.STATS.map((k) => {
        const v = Math.round(Number(p.stats?.[k]) || 0);
        return h('span', { class: ['ro-st', mains.includes(k) ? 'main' : ''], title: `${L.STAT_LABELS[k]} ${v}` },
          h('span', { class: 'ro-k' }, L.STAT_SHORT[k]), gradeBadge(gradeOf(v, thresholds), 'xs'), h('span', { class: 'ro-v' }, v));
      })));
    })),
    h('div', { class: 'og-panel-head bond-head' },
      h('h3', { class: 'og-panel-title' }, '코치 유대 · 파티 패시브'),
      h('span', { class: 'tiny muted' }, `유대 ${upgradeAt}+ = 카드 · 패시브 강화`)),
    h('div', { class: 'bond-grid' }, coaches.map((c) => {
      const b = Number(c.bond) || 0;
      const cname = c.cardId ? cardName(c.cardId) : '';
      const pp = party.get(c.id) || null;
      return h('div', {
        class: ['bond-row', c.upgraded ? 'max' : ''],
        dataset: { coach: c.id },
        title: `${c.name} · ${L.SUPPORT_TYPE_LABELS[c.type] ?? c.type ?? ''} · 유대 ${b}${cname ? ` · 코치 카드 「${cname}」${c.upgraded ? ' (유대 강화)' : ''}` : ''}`
          + (pp ? `\n파티 패시브 '${pp.name}' — ${pp.text}${pp.upgraded ? ' (유대 80)' : pp.text80 ? ` · 유대 ${upgradeAt}: ${pp.text80}` : ''}` : ''),
      },
      avatar(c.portraitColor, c.name, 'xs', '', { art: portraitUrl(data, c.id) }),
      h('span', { class: 'bond-nm ellipsis' }, c.name, h('span', { class: 'tiny muted' }, ` ${L.STAT_SHORT[c.type] ?? ''}`)),
      h('span', { class: 'bond-bar' }, bar(b / 100, c.upgraded ? 'good' : ''), h('i', { class: 'bond-th', style: { left: `${upgradeAt}%` } })),
      h('b', { class: 'bond-n' }, b),
      pp ? h('span', { class: ['bond-pp', pp.upgraded ? 'up' : ''] },
        h('b', { class: 'bond-pp-nm' }, pp.upgraded ? '★ ' : '⚑ ', pp.name), ' ', pp.text) : null);
    })),
  );
}

/** 유물 · 보정 · 최근 기록 (가로 모달 2열) */
export function openRecords(view, ctx) {
  const data = ctx?.data || {};
  const relicById = new Map((data.relics || []).map((r) => [r.id, r]));
  const relics = Array.isArray(view.relics) ? view.relics : [];
  const mods = Array.isArray(view.modifiers) ? view.modifiers : [];
  const log = Array.isArray(view.log) ? view.log : [];
  const modText = (m) => `${m.key} ${signed((Number(m.amount) || 0) * (Math.abs(m.amount) < 1 ? 100 : 1))}${Math.abs(m.amount) < 1 ? '%' : ''}${m.untilSeason != null ? ` (시즌 ${m.untilSeason}까지)` : ''}`;
  openModal(h('div', { class: 'col', style: { gap: '12px' } },
    h('div', { class: 'row between' },
      h('h3', {}, '📜 유물 · 보정 · 기록'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
    h('div', { class: 'extras-cols' },
      h('section', { class: 'col extras-col' },
        h('h4', { class: 'og-panel-title' }, `유물 ${relics.length}`),
        relics.length ? h('div', { class: 'list og-scroll' }, relics.map((id) => {
          const r = relicById.get(id);
          return h('div', { class: 'list-item col', style: { alignItems: 'flex-start', gap: '2px' } },
            h('span', { class: 'row' }, h('b', { class: 'gold' }, r?.name ?? id), r?.rarity ? h('span', { class: ['tiny', `rarity-${r.rarity}`] }, r.rarity) : null),
            r?.description ? h('span', { class: 'tiny muted' }, r.description) : null);
        })) : h('p', { class: 'tiny muted' }, '보유한 유물이 없습니다.'),
        h('h4', { class: 'og-panel-title', style: { marginTop: '6px' } }, `보정 ${mods.length}`),
        mods.length ? h('div', { class: 'row wrap' }, mods.map((m) => h('span', { class: 'badge' }, modText(m))))
          : h('p', { class: 'tiny muted' }, '적용 중인 보정이 없습니다.')),
      h('section', { class: 'col extras-col' },
        h('h4', { class: 'og-panel-title' }, '최근 기록'),
        log.length ? h('ul', { class: 'log-list og-scroll' }, [...log].reverse().map((l) =>
          h('li', {}, `${l.turnIndex != null ? `${l.turnIndex + 1}주 · ` : ''}${l.text ?? ''}`)))
          : h('p', { class: 'tiny muted' }, '기록이 없습니다.'))),
  ), { className: 'modal-lg' });
}
