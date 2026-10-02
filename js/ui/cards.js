// js/ui/cards.js — 레슨 카드 그림 (LESSON_PROTO_PLAN §6.3 "카드 앞면"). 엔진 로직은 없다 — 뷰 값만 그린다.
//
//   cardFace(view, opts) → .card-face (고정 176×204): 계열 색 띠 · 이름(+ 강화 · 유대80) · 계열/모드 줄 · 대상 칩 · 위력 줄 · 체력 비용 · 효과 문구(최대 3줄) · 추천 · 낼 수 없는 이유
//   miniCard(view, opts) → .mini-card (덱 그리드 · 대비 카드 미리보기용 작은 한 줄 카드)
//
// view 는 두 모양을 받는다:
//   - 레슨 손패 (lesson.getLessonView hand[]): { uid, cardId, name, family, plus, bond80, mode, targetKind, needTaps, playable, deadReason, power, count, cost, exhaust, desc }
//   - 보상 · 상담 · 덱 (lessonRun 카드 뷰): { uid, cardId, name, family, plus, bond80, targetKind, target, power, costRate, exhaust, desc, ownerCharId, coachType, … }
// opts: { data, players?, recommended?, selected?, dim?, reason?, tag?, onClick?, title?, el? ('button'|'div') }
//   data = 데이터 (cards.json 에서 라인 · 지명 제한 · 주인 이름을 읽는다), players = 선수 목록 (주인 이름 — 없으면 data.characters)
import { h } from './dom.js';
import * as L from './labels.js';

const POS_LIST = { attack: 'MF·FW', defense: 'GK·DF' };

function cardDefOf(data, cardId) {
  const list = (data && data.cards && data.cards.cards) || [];
  return list.find((c) => c.id === cardId) || null;
}

function ownerName(data, players, charId) {
  if (!charId) return '';
  const p = (players || []).find((x) => x.charId === charId);
  if (p?.name) return p.name;
  const c = ((data && data.characters) || []).find((x) => x.id === charId);
  return c?.name ?? '';
}

/**
 * 대상 칩 문구: "FW 라인 · 2명" · "공격진 · 4명" · "전원 · 7명" · "지명 1명" · "MF·FW 지명" · "짝 2명" · "주인 + 1명" · "1명 회복" · "대상 없음"
 * @param {object} view 카드 뷰
 * @param {object|null} def cards.json 원본 (라인 · only · partner)
 */
export function targetText(view, def) {
  const kind = view.targetKind ?? def?.target?.kind;
  const t = view.target || def?.target || {};
  const cnt = Number.isFinite(view.count) && view.count > 0 ? ` · ${view.count}명` : '';
  switch (kind) {
    case 'line': return `${t.line ?? ''} 라인${cnt}`.trim();
    case 'attack': return `공격진 ${POS_LIST.attack}${cnt}`;
    case 'defense': return `수비진 ${POS_LIST.defense}${cnt}`;
    case 'all': return `전원${cnt}`;
    case 'single': return Array.isArray(t.only) && t.only.length ? `${t.only.join('·')} 지명 1명` : '지명 1명';
    case 'pair': return '짝 2명';
    case 'owner': return t.partner ? '주인 + 1명 더' : '주인';
    case 'tap': return '1명 골라 회복';
    case 'none': return '대상 없음';
    default: return L.CARD_TARGET_LABELS[kind] ?? '';
  }
}

/** 고유 카드 문구 "강화: … / 지원: …" 에서 지금 모드 쪽만 (모드를 모르면 전체) */
export function descForMode(desc, mode) {
  const s = String(desc ?? '');
  const m = s.match(/^강화:\s*(.*?)\s*\/\s*지원:\s*(.*)$/);
  if (!m) return s;
  if (mode === 'power') return m[1];
  if (mode === 'support') return m[2];
  return s;
}

/**
 * 위력 줄: 범위 카드 "합계 43 → 1인 11" (인원을 모르면 "합계 43"), 지명 · 짝 "1인 35" · "2명 각 20", 고유 강화 "주인 53" (+ 파트너 "+ 18"),
 * 고유 지원 모드 "지원 모드", 위력 없는 카드 "효과 카드"
 */
export function powerText(view, def) {
  const kind = view.targetKind ?? def?.target?.kind;
  const p = view.power;
  if (view.mode === 'support') return '지원 모드 · 위력 없음';
  if (p == null || kind === 'none' || kind === 'tap') return '효과 카드';
  if (['all', 'line', 'attack', 'defense'].includes(kind)) {
    const n = Number(view.count);
    return n > 0 ? `합계 ${p} → 1인 ${Math.round(p / n)}` : `합계 ${p}`;
  }
  if (kind === 'pair') return `2명 각 ${p}`;
  if (kind === 'owner') {
    const partner = (view.target || def?.target || {}).partner;
    return partner ? `주인 ${p} + 1명 ${partner.power}` : `주인 ${p}`;
  }
  return `1인 ${p}`;
}

/** 비용 줄: 손패 뷰(cost 있음) "체력 −12" (범위 · 짝은 "1인당"), 그 밖(보상 · 상담 카드 뷰) = 비용 비율 "체력 −위력×0.6" */
export function costText(view) {
  const kind = view.targetKind;
  if (view.mode === 'support' || kind === 'none' || kind === 'tap') return '체력 소모 없음';
  if (Number.isFinite(view.cost)) {
    const per = ['all', 'line', 'attack', 'defense', 'pair'].includes(kind) ? ' (1인당)' : '';
    return `체력 −${view.cost}${per}`;
  }
  if (Number.isFinite(view.costRate)) return `체력 −위력×${view.costRate}`;
  return '';
}

/**
 * 카드 앞면 (고정 176×204 — css/lesson.css .card-face). 낼 수 없으면 .dim + 이유 띠.
 * @param {object} view 카드 뷰
 * @param {object} [opts]
 */
export function cardFace(view, opts = {}) {
  const { data, players, recommended = false, selected = false, onClick, title, tag } = opts;
  const def = cardDefOf(data, view.cardId);
  const family = view.family ?? def?.family ?? 'common';
  const dim = opts.dim ?? (view.playable === false);
  const reason = opts.reason ?? (view.playable === false ? (view.deadReason || '낼 수 없음') : null);
  const famLabel = family === 'unique'
    ? `고유 · ${ownerName(data, players, view.ownerCharId ?? def?.ownerCharId) || '선수'}`
    : family === 'coach'
      ? `코치${view.coachType || def?.coach?.type ? ` · ${L.STAT_LABELS[view.coachType ?? def?.coach?.type] ?? ''}` : ''}`
      : L.CARD_FAMILY_LABELS[family] ?? family;
  const desc = descForMode(view.desc ?? def?.desc ?? '', view.mode);
  const fullDesc = view.desc ?? def?.desc ?? '';
  const uniqueColor = family === 'unique' ? (players || []).find((p) => p.charId === (view.ownerCharId ?? def?.ownerCharId))?.portraitColor : null;
  const tagName = opts.el ?? (onClick ? 'button' : 'div');
  const attrs = {
    class: ['card-face', `fam-${family}`, view.plus ? 'plus' : '', view.bond80 ? 'bond80' : '', dim ? 'dim' : '', selected ? 'selected' : '',
      recommended ? 'recommended' : '', view.mode ? `mode-${view.mode}` : ''],
    dataset: { uid: view.uid ?? '', card: view.cardId ?? '' },
    title: title ?? [`${view.name}${view.plus ? '+' : ''}`, fullDesc, reason ? `낼 수 없음: ${reason}` : ''].filter(Boolean).join('\n'),
  };
  if (tagName === 'button') {
    attrs.type = 'button';
    attrs.onclick = onClick;
    attrs['aria-pressed'] = selected ? 'true' : 'false';
  }
  const cost = costText(view);
  const el = h(tagName, attrs,
    h('span', { class: 'cf-band', 'aria-hidden': 'true' }),
    h('span', { class: 'cf-name' }, view.name ?? view.cardId, view.plus ? h('b', { class: 'cf-plus' }, '+') : null),
    h('span', { class: 'cf-meta' },
      h('span', { class: 'cf-fam' }, famLabel),
      view.mode === 'power' ? h('span', { class: 'cf-mode power' }, '강화 모드') : view.mode === 'support' ? h('span', { class: 'cf-mode support' }, '지원 모드') : null,
      view.bond80 ? h('span', { class: 'cf-bond' }, '유대80') : null,
      view.exhaust ? h('span', { class: 'cf-ex', title: '낸 뒤 이번 레슨에서 빠진다' }, '1회') : null),
    h('span', { class: 'cf-target' }, targetText(view, def)),
    h('span', { class: ['cf-power', view.mode === 'support' || view.power == null ? 'muted' : ''] }, powerText(view, def)),
    cost ? h('span', { class: ['cf-cost', /소모 없음/.test(cost) ? 'none' : ''] }, cost) : null,
    h('span', { class: 'cf-desc' }, desc),
    recommended ? h('span', { class: 'cf-rec' }, '추천') : null,
    tag ? h('span', { class: 'cf-tag' }, tag) : null,
    reason ? h('span', { class: 'cf-reason' }, reason) : null);
  if (uniqueColor) el.style.setProperty('--fam', uniqueColor); // 고유 카드 띠 = 주인 초상 색
  return el;
}

/**
 * 작은 카드 (덱 그리드 · 대비 카드 미리보기): 계열 색 왼쪽 띠 · 이름(+) · 한 줄 문구 (전문은 title).
 * @param {object} view 카드 뷰 (cardId · name · family · plus · desc)
 * @param {{ data?, onClick?, selected?, disabled?, note? }} [opts]
 */
export function miniCard(view, opts = {}) {
  const { data, onClick, selected = false, disabled = false, note } = opts;
  const def = cardDefOf(data, view.cardId);
  const family = view.family ?? def?.family ?? 'common';
  const desc = view.desc ?? def?.desc ?? '';
  const attrs = {
    class: ['mini-card', `fam-${family}`, view.plus ? 'plus' : '', selected ? 'selected' : '', disabled ? 'disabled' : ''],
    dataset: { uid: view.uid ?? '', card: view.cardId ?? '' },
    title: `${view.name ?? view.cardId}${view.plus ? '+' : ''} — ${L.CARD_FAMILY_LABELS[family] ?? family}\n${desc}`,
  };
  const tagName = onClick ? 'button' : 'div';
  if (onClick) { attrs.type = 'button'; attrs.onclick = onClick; attrs.disabled = disabled; }
  return h(tagName, attrs,
    h('span', { class: 'mc-name' }, view.name ?? view.cardId, view.plus ? h('b', { class: 'cf-plus' }, '+') : null),
    h('span', { class: 'mc-desc' }, note ?? desc));
}
