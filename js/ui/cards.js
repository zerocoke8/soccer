// js/ui/cards.js — 레슨 카드 그림 (LESSON_PROTO_PLAN §6.3 "카드 앞면" · §14.16). 엔진 로직은 없다 — 뷰 값만 그린다.
//
//   cardFace(view, opts) → .card-face (고정 176×204): 계열 색 띠 · 이름(+ 강화 · 유대80) · 계열 줄 · 대상 칩(원 아이콘 3단계) · 위력 줄 "1인 18" ·
//                          체력 비용 "체력 −11 /명" · 효과 문구(최대 3줄 — 대상 · 1인 위력 머리는 칩 · 위력 줄과 겹치므로 뺀다) · 추천 · 낼 수 없는 이유
//   miniCard(view, opts) → .mini-card (덱 그리드 · 대비 카드 미리보기용 작은 한 줄 카드)
//
// view 는 두 모양을 받는다:
//   - 레슨 손패 (lesson.getLessonView hand[]): { uid, cardId, name, family, plus, bond80, targetKind, size, radius, onlyZones, heal, playable, deadReason, power, cost, exhaust, desc, attach }
//     attach (코치 지원 §15.5 · §15.8) = { supportId, name, short, color, coachType, abilityName, abilityText, upgrade } | null —
//     붙은 카드: .attached + co-<코치 타입> (테두리 · 빛 · 띠 = 코치 타입 색), 메타 줄 맨 앞 코치 칩 (얼굴 + "하르나 지원"), 지원 강화 "+" 는 코치 색
//   - 보상 · 상담 · 덱 (lessonRun 카드 뷰): { uid, cardId, name, family, plus, bond80, targetKind, target, power, costRate, exhaust, desc, ownerCharId, coachType, … }
// opts: { data, players?, recommended?, selected?, dim?, reason?, tag?, onClick?, title?, el? ('button'|'div') }
//   data = 데이터 (cards.json 에서 원 크기 · 구역 제한 · 기본 위력 · 주인을 읽는다), players = 선수 목록 (주인 이름 · 색 — 없으면 data.characters)
import { h, avatar } from './dom.js';
import * as L from './labels.js';

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

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** 카드의 대상 정보 { kind, size, onlyZones, heal } — 손패 뷰(size · onlyZones · heal) · 카드 뷰(target) · cards.json 원본 순서로 */
export function targetInfo(view, def) {
  const t = view.target || def?.target || {};
  const kind = view.targetKind ?? t.kind ?? def?.target?.kind ?? null;
  const size = view.size ?? t.size ?? def?.target?.size ?? null;
  const only = view.onlyZones ?? t.onlyZones ?? def?.target?.onlyZones ?? null;
  const power = view.power !== undefined ? view.power : def?.power;
  const heal = typeof view.heal === 'boolean' ? view.heal : kind === 'single' && !isNum(power);
  return { kind, size: kind === 'circle' ? size : null, onlyZones: Array.isArray(only) && only.length ? only : null, heal };
}

/**
 * 대상 칩 문구 (§14.16): "단일" · "공격 구역 단일" · "작은 원" · "중간 원" · "큰 원" · "전체" · "주인" · "선수 1명 회복" · "대상 없음"
 * @param {object} view 카드 뷰
 * @param {object|null} def cards.json 원본
 */
export function targetText(view, def) {
  const t = targetInfo(view, def);
  switch (t.kind) {
    case 'single':
      if (t.heal) return '선수 1명 회복';
      return t.onlyZones ? `${L.zonesText(t.onlyZones)} 단일` : L.CARD_TARGET_LABELS.single;
    case 'circle': return L.CIRCLE_SIZE_LABELS[t.size] ?? L.CARD_TARGET_LABELS.circle;
    case 'all':
    case 'owner':
    case 'none':
      return L.CARD_TARGET_LABELS[t.kind];
    default: return L.CARD_TARGET_LABELS[t.kind] ?? '';
  }
}

/** 고유 카드의 주 스탯 구역 배율 (lesson.json lesson.unique.mainMult). L40 으로 지워져 없으면 1 (범위 · 칩 없음 — 모양 칩은 U3) */
export function uniqueMainMult(data) {
  const m = data?.lesson?.lesson?.unique?.mainMult;
  return isNum(m) && m > 0 ? m : 1;
}

/**
 * 위력 줄: 위력 카드 "1인 18" (원 · 전체도 1인 위력 — 원 안 인원이 많을수록 합계가 커진다), 고유 "1인 35" (+ 칩 "주 스탯 구역 ×1.5"는 cardFace 가 붙인다),
 * 위력 없는 카드(회복 단일 · 대상 없음) "효과 카드"
 */
export function powerText(view, def) {
  const t = targetInfo(view, def);
  const p = view.power;
  if (!isNum(p) || t.kind === 'none' || t.heal) return '효과 카드';
  return `1인 ${p}`;
}

/**
 * 손패 밖(보상 · 상담 · 덱) 카드의 1인 체력 비용 = round(강화 전 기본 1인 위력 × 비용률) — 엔진 cards.staminaCost(분위기 · 압박 0, 주 스탯 배율 1) 와 같은 식.
 * 원 · 전체도 1인당이라 인원 계산이 없다 (§14.8). 강화판 · 유대 80 증가분은 비용을 올리지 않는다 (D12).
 * 고유 카드는 주인이 주 스탯 구역에 서 있지 않을 때 값 (서 있으면 opts.mainMult 를 곱한다 — 35 × 1.5 × 0.4 = 21).
 * 위력 없는 카드 · 정의를 모르면 null.
 * @param {object} view 카드 뷰 (targetKind · target · costRate)
 * @param {object|null} def cards.json 원본 (기본 power)
 * @param {{ mainMult?: number }} [opts]
 * @returns {number|null}
 */
export function estimateCost(view, def, opts = {}) {
  const t = targetInfo(view, def);
  const base = def?.power;
  const rate = isNum(view.costRate) ? view.costRate : def?.costRate;
  if (!isNum(base) || !isNum(rate) || !['single', 'circle', 'all', 'owner'].includes(t.kind)) return null;
  const mult = t.kind === 'owner' && isNum(opts?.mainMult) ? opts.mainMult : 1;
  return Math.round(Number((base * mult * rate).toFixed(9)));
}

/**
 * 비용 줄 (§14.16): 원 · 전체 "체력 −11 /명", 단일 · 주인 "체력 −21". 손패 뷰는 엔진 cost(지금 1인 비용), 그 밖은 estimateCost
 * (고유 카드는 "체력 −14~21" — 주인이 주 스탯 구역에 서 있으면 큰 값). 위력 없는 카드 "체력 소모 없음".
 */
export function costText(view, def = null, data = null) {
  const t = targetInfo(view, def);
  if (t.kind === 'none' || t.heal || !t.kind) return '체력 소모 없음';
  const per = t.kind === 'circle' || t.kind === 'all' ? ' /명' : '';
  if (isNum(view.cost)) return `체력 −${view.cost}${per}`;
  const est = estimateCost(view, def);
  if (est == null) return isNum(view.costRate) ? `체력 −위력×${view.costRate}` : '';
  if (t.kind === 'owner') {
    const hi = estimateCost(view, def, { mainMult: uniqueMainMult(data) });
    if (hi != null && hi !== est) return `체력 −${est}~${hi}`;
  }
  return `체력 −${est}${per}`;
}

/**
 * 효과 문구에서 대상 · 1인 위력 머리("중간 원 · 1인 18, …" · "주인 · 1인 35 (주 스탯 구역 ×1.5), …")를 뺀 나머지.
 * 대상 칩 · 위력 줄과 같은 말을 두 번 쓰지 않는다. 머리가 없는 문구(효과 카드)는 그대로.
 */
export function effectDesc(desc) {
  const s = String(desc ?? '').trim();
  const m = s.match(/^[^·,()]*·\s*1인\s*\d+(?:\s*\(주 스탯 구역 ×[\d.]+\))?\s*(.*)$/);
  if (!m) return s;
  return m[1].replace(/^,\s*/, '').trim();
}

/** 코치 지원 문구 (카드 title · 칩 title): "코치 하르나 지원 — 이번 턴만 강화 · 내면: 슈팅 구역 대상 +50%" */
export function attachTitle(att, data) {
  if (!att) return '';
  const pct = Math.round((Number(data?.lesson?.attach?.overPct) || 0.2) * 100);
  const up = att.upgrade === 'plus' ? '이번 턴만 강화' : att.upgrade === 'pct' ? `이번 턴만 위력 +${pct}%` : '이번 턴';
  return `${att.name} 지원 — ${up} · 내면: ${att.abilityText ?? ''}`;
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
  const ownerCharId = view.ownerCharId ?? def?.ownerCharId;
  const famLabel = family === 'unique'
    ? `고유 · ${ownerName(data, players, ownerCharId) || '선수'}`
    : family === 'coach'
      ? `코치${view.coachType || def?.coach?.type ? ` · ${L.STAT_LABELS[view.coachType ?? def?.coach?.type] ?? ''}` : ''}`
      : L.CARD_FAMILY_LABELS[family] ?? family;
  const t = targetInfo(view, def);
  const powerLine = powerText(view, def);
  const hasPower = powerLine !== '효과 카드';
  const fullDesc = view.desc ?? def?.desc ?? '';
  const desc = effectDesc(fullDesc);
  const uniqueColor = family === 'unique' ? (players || []).find((p) => p.charId === ownerCharId)?.portraitColor : null;
  const tagName = opts.el ?? (onClick ? 'button' : 'div');
  const att = view.attach || null;
  const attPct = Math.round((Number(data?.lesson?.attach?.overPct) || 0.2) * 100);
  const attrs = {
    class: ['card-face', `fam-${family}`, view.plus ? 'plus' : '', view.bond80 ? 'bond80' : '', dim ? 'dim' : '', selected ? 'selected' : '',
      recommended ? 'recommended' : '', t.kind ? `tk-${t.kind}` : '', att ? 'attached' : '', att?.coachType ? `co-${att.coachType}` : ''],
    dataset: { uid: view.uid ?? '', card: view.cardId ?? '', coach: att?.supportId ?? '' },
    title: title ?? [att ? attachTitle(att, data) : '', `${view.name}${view.plus ? '+' : ''}`, fullDesc, reason ? `낼 수 없음: ${reason}` : ''].filter(Boolean).join('\n'),
  };
  if (tagName === 'button') {
    attrs.type = 'button';
    attrs.onclick = onClick;
    attrs['aria-pressed'] = selected ? 'true' : 'false';
  }
  const cost = costText(view, def, data);
  const ticon = t.kind && t.kind !== 'none' ? h('i', { class: ['cf-ticon', t.heal ? 'heal' : t.kind, t.size ? `sz-${t.size}` : ''], 'aria-hidden': 'true' }) : null;
  const el = h(tagName, attrs,
    h('span', { class: 'cf-band', 'aria-hidden': 'true' }),
    h('span', { class: 'cf-name' }, view.name ?? view.cardId, view.plus ? h('b', { class: ['cf-plus', att?.upgrade === 'plus' ? 'att' : ''] }, '+') : null),
    h('span', { class: 'cf-meta' },
      att ? h('span', { class: 'cf-coach', title: attachTitle(att, data) }, avatar(att.color, att.short || att.name, 'xs', 'cf-coach-face'), h('b', {}, `${att.short} 지원`)) : null,
      h('span', { class: 'cf-fam' }, famLabel),
      view.bond80 ? h('span', { class: 'cf-bond' }, '유대80') : null,
      view.exhaust ? h('span', { class: 'cf-ex', title: '낸 뒤 이번 레슨에서 빠진다' }, '1회') : null),
    h('span', { class: ['cf-target', t.kind ? `tk-${t.kind}` : ''] }, ticon, targetText(view, def)),
    h('span', { class: ['cf-power', hasPower ? '' : 'muted'] }, powerLine,
      hasPower && att?.upgrade === 'pct' ? h('span', { class: 'cf-pmult att', title: '코치 지원 — 이미 강화된 카드라 이번 턴 위력 +' + attPct + '%' }, `지원 +${attPct}%`) : null,
      hasPower && t.kind === 'owner' && att?.upgrade !== 'pct' && uniqueMainMult(data) > 1 ? h('span', { class: 'cf-pmult', title: '주인이 자기 포지션 주 스탯 구역에 서 있으면' }, `주 스탯 구역 ${L.multText(uniqueMainMult(data))}`) : null),
    cost ? h('span', { class: ['cf-cost', /소모 없음/.test(cost) ? 'none' : ''] }, cost) : null,
    h('span', { class: 'cf-desc' }, desc),
    recommended ? h('span', { class: 'cf-rec' }, '추천') : null,
    tag ? h('span', { class: 'cf-tag' }, tag) : null,
    reason ? h('span', { class: 'cf-reason' }, reason) : null);
  if (uniqueColor) el.style.setProperty('--fam', uniqueColor); // 고유 카드 띠 = 주인 초상 색
  if (att?.color) el.style.setProperty('--coach-face', att.color);
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
    // 긴 이름 (+ 포함 9자 이상 — "물결 세이브 루틴+")은 글자를 조금 줄여 8열 그리드에서도 다 보이게 한다
    h('span', { class: ['mc-name', String(view.name ?? view.cardId ?? '').length + (view.plus ? 1 : 0) >= 9 ? 'long' : ''] }, view.name ?? view.cardId, view.plus ? h('b', { class: 'cf-plus' }, '+') : null),
    h('span', { class: 'mc-desc' }, note ?? desc));
}
