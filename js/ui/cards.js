// js/ui/cards.js — 레슨 카드 그림 (LESSON_PROTO_PLAN §6.3 "카드 앞면" · §14.16). 엔진 로직은 없다 — 뷰 값만 그린다.
//
//   cardFace(view, opts) → .card-face (고정 176×204): 계열 색 띠 · 이름(+ 강화 · 유대80) · 계열 줄 · 대상 칩(원 아이콘 3단계) · 위력 줄 "1인 18" ·
//                          체력 비용 "체력 −11 /명" · 효과 문구(최대 3줄 — 대상 · 1인 위력 머리는 칩 · 위력 줄과 겹치므로 뺀다) · 추천 · 낼 수 없는 이유
//   miniCard(view, opts) → .mini-card (덱 그리드 · 대비 카드 미리보기용 작은 한 줄 카드)
//
// 고유 카드 (L40, §16.7): 대상 칩 = 주인 연계 특성의 모양 칩 ("이어 주기" · "둘레 작은 원" · …) + 모양 아이콘 .cf-ticon.s-<kind> (크로스 = s-cross),
//   위력 줄 옆 배율 칩 .cf-pmult ("받는 쪽 ×1.3" · "고른 쪽 ×1.5" · "옮긴 구역 ×1.3" · "주인 ×1.5" · "슈팅 ×2"), 비용 = 여러 명이 내는 모양 "/명".
//   문구는 모양 머리 · 배율 칩과 같은 말을 빼고, 남는 말이 없으면 쓰는 법 한 줄 ("실루엔 + 고른 1명").
// view 는 두 모양을 받는다:
//   - 레슨 손패 (lesson.getLessonView hand[]): { uid, cardId, name, family, plus, bond80, targetKind, size, radius, onlyZones, heal, playable, deadReason, power, cost, exhaust, desc, attach }
//     attach (코치 지원 §15.5 · §15.8) = { supportId, name, short, color, coachType, abilityName, abilityText, upgrade } | null —
//     붙은 카드: .attached + co-<코치 타입> (테두리 · 빛 · 띠 = 코치 타입 색), 메타 줄 맨 앞 코치 칩 (얼굴 + "하르나 지원"), 지원 강화 "+" 는 코치 색
//   - 보상 · 상담 · 덱 (lessonRun 카드 뷰): { uid, cardId, name, family, plus, bond80, targetKind, target, power, costRate, exhaust, desc, ownerCharId, coachType, … }
// opts: { data, players?, recommended?, selected?, dim?, reason?, tag?, onClick?, title?, el? ('button'|'div') }
//   data = 데이터 (cards.json 에서 원 크기 · 구역 제한 · 기본 위력 · 주인을 읽는다), players = 선수 목록 (주인 이름 · 색 — 없으면 data.characters)
// 얼굴 일러스트 (§24.12.3, data.portraits): 코치 칩 얼굴 = 코치 그림, 고유 카드 = 계열 줄 "고유 · 이름" 앞에 주인 작은 얼굴 (그림이 있을 때만 — 주인 색 테)
// 레전드 메모리 카드 (§24.9, U5): 덱 카드 뷰의 memory (엔진 src "memory") → 카드 앞면은 계열 줄에 "메모리" 띠 (.cf-mem), 작은 카드는
//   오른쪽 위 "메모리" 띠 (.mc-mem). memoryChip = 등록 팀 · 레전드 칸의 메모리 카드 한 줄 칩 ({ cardId, plus } → 계열 색 · 이름 · +).
import { h, avatar } from './dom.js';
import * as L from './labels.js';
import { portraitUrl } from './art.js';

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

/** 카드의 대상 정보 { kind, size, onlyZones, heal, shape } — 손패 뷰(size · onlyZones · heal) · 카드 뷰(target) · cards.json 원본 순서로.
 * shape = 고유 카드 모양 뷰 (엔진 cards.shapeView — 손패 · 보상 · 상담 · 덱 카드 뷰가 준다), 없으면 null */
export function targetInfo(view, def) {
  const t = view.target || def?.target || {};
  const kind = view.targetKind ?? t.kind ?? def?.target?.kind ?? null;
  const size = view.size ?? t.size ?? def?.target?.size ?? null;
  const only = view.onlyZones ?? t.onlyZones ?? def?.target?.onlyZones ?? null;
  const power = view.power !== undefined ? view.power : def?.power;
  const heal = typeof view.heal === 'boolean' ? view.heal : kind === 'single' && !isNum(power);
  const shape = view.shape && typeof view.shape === 'object' && view.shape.kind ? view.shape : null;
  return { kind, size: kind === 'circle' ? size : null, onlyZones: Array.isArray(only) && only.length ? only : null, heal, shape };
}

/** 모양 배율 문구 "×1.3" · "×2" (엔진 미리보기 노트와 같은 짧은 꼴 — 특별 레슨 "×2.0" 과 다르다) */
export const multShort = (x) => `×${Math.round((Number(x) || 0) * 100) / 100}`;

/** 모양 아이콘 클래스 키 (크로스 = 슈팅 구역 받는 선수 pick 은 따로 그린다) */
export function shapeIconKey(shape) {
  if (!shape) return null;
  if (shape.kind === 'pick' && Array.isArray(shape.onlyZones) && shape.onlyZones.length) return 'cross';
  return shape.kind;
}

/** 여러 명이 비용을 내는 모양인가 (이어 주기 · 연결 · 크로스 · 둘레 원 · 구역 전원 — 비용 "/명") */
export function shapeMulti(shape) {
  return !!shape && ['link', 'pick', 'ownerCircle', 'ownerZone'].includes(shape.kind);
}

/**
 * 모양 배율 칩 문구 (§16.7): 이어 주기 "받는 쪽 ×1.3" · 연결 "고른 쪽 ×1.5" · 자리 옮기기 "옮긴 구역 ×1.3" · 둘레 원 · 구역 "주인 ×1.5" ·
 * 마무리 "슈팅 ×2" (zoneMult). 배율이 없으면 null.
 * @returns {{ text: string, mult: number } | null}
 */
export function shapeMultChip(shape) {
  if (!shape) return null;
  const m = (x) => (isNum(x) && x > 1 ? x : null);
  switch (shape.kind) {
    case 'link': return m(shape.recvMult) ? { text: `받는 쪽 ${multShort(shape.recvMult)}`, mult: shape.recvMult } : null;
    case 'pick': return m(shape.recvMult) ? { text: `고른 쪽 ${multShort(shape.recvMult)}`, mult: shape.recvMult } : null;
    case 'move': return m(shape.ownerMult) ? { text: `옮긴 구역 ${multShort(shape.ownerMult)}`, mult: shape.ownerMult } : null;
    case 'ownerCircle':
    case 'ownerZone': return m(shape.ownerMult) ? { text: `주인 ${multShort(shape.ownerMult)}`, mult: shape.ownerMult } : null;
    case 'owner': {
      const zm = shape.zoneMult;
      if (zm && m(zm.mult)) return { text: `${(zm.zones || []).map((z) => L.STAT_LABELS[z] ?? z).join('·')} ${multShort(zm.mult)}`, mult: zm.mult };
      return m(shape.ownerMult) ? { text: `주인 ${multShort(shape.ownerMult)}`, mult: shape.ownerMult } : null;
    }
    default: return null;
  }
}

/**
 * 모양 쓰는 법 한 줄 (카드 문구가 비면 · title · dock 안내): "네리아 → 받는 1명" · "실루엔 + 고른 1명" · "울리카 + 슈팅 구역 1명" ·
 * "도르비나 둘레 전원" · "아델린 구역 전원" · "타리아 → 다른 구역" · "지금 구역 + 놓은 구역" · "주인 1명"
 */
export function shapeHow(shape, owner = '') {
  if (!shape) return '';
  const o = owner || '주인';
  switch (shape.kind) {
    case 'link': return `${o} → 받는 1명`;
    case 'pick':
      if (!shape.onlyZones?.length) return `${o} + 고른 1명`;
      return shape.fallbackZones?.length
        ? `${o} + ${L.zonesText(shape.onlyZones)} 1명 (없으면 ${L.zonesText(shape.fallbackZones)})`
        : `${o} + ${L.zonesText(shape.onlyZones)} 1명`;
    case 'ownerCircle': return `${o} 둘레 전원`;
    case 'ownerZone': return `${o} 구역 전원`;
    case 'move': return `${o} → 다른 구역`;
    case 'carry': return '지금 구역 + 놓은 구역';
    case 'owner': return `${o} 1명`;
    default: return '';
  }
}

/** 고유 카드 문구에서 배율 칩과 같은 말 ("받는 선수 ×1.3" · "옮긴 구역에서 ×1.3" · "주인 ×1.5" 마디)을 뺀다 */
export function shapeDesc(desc, shape) {
  const chip = shapeMultChip(shape);
  if (!chip) return desc;
  const mt = multShort(chip.mult);
  return String(desc ?? '').split(/,\s*/).filter((seg) => !seg.trim().endsWith(mt)).join(', ');
}

/**
 * 대상 칩 문구 (§14.16): "단일" · "공격 구역 단일" · "작은 원" · "중간 원" · "큰 원" · "전체" · "주인" · "선수 1명 회복" · "대상 없음"
 * @param {object} view 카드 뷰
 * @param {object|null} def cards.json 원본
 */
export function targetText(view, def) {
  const t = targetInfo(view, def);
  if (t.shape) return t.shape.chip || t.shape.label || L.CARD_TARGET_LABELS.owner;
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

/**
 * 위력 줄: 위력 카드 "1인 18" (원 · 전체도 1인 위력 — 원 안 인원이 많을수록 합계가 커진다), 고유 "1인 20" (+ 모양 배율 칩은 cardFace 가 붙인다),
 * 위력 없는 카드(회복 단일 · 대상 없음) "효과 카드"
 */
export function powerText(view, def) {
  const t = targetInfo(view, def);
  const p = view.power;
  if (!isNum(p) || t.kind === 'none' || t.heal) return '효과 카드';
  return `1인 ${p}`;
}

/**
 * 손패 밖(보상 · 상담 · 덱) 카드의 1인 체력 비용 = round(강화 전 기본 1인 위력 × 비용률) — 엔진 cards.staminaCost(분위기 · 압박 0) 와 같은 식.
 * 원 · 전체도 1인당이라 인원 계산이 없다 (§14.8). 강화판 · 유대 80 증가분은 비용을 올리지 않는다 (D12).
 * 고유 카드도 1인 위력 그대로 (L40 — 주 스탯 구역 배율 없음, 모양 배율은 비용에 곱하지 않는다).
 * 위력 없는 카드 · 정의를 모르면 null.
 * @param {object} view 카드 뷰 (targetKind · target · costRate)
 * @param {object|null} def cards.json 원본 (기본 power)
 * @returns {number|null}
 */
export function estimateCost(view, def) {
  const t = targetInfo(view, def);
  const base = def?.power;
  const rate = isNum(view.costRate) ? view.costRate : def?.costRate;
  if (!isNum(base) || !isNum(rate) || !['single', 'circle', 'all', 'owner'].includes(t.kind)) return null;
  return Math.round(Number((base * rate).toFixed(9)));
}

/**
 * 비용 줄 (§14.16 · §16.7): 원 · 전체 · 여러 명이 내는 고유 모양(이어 주기 · 연결 · 크로스 · 둘레 원 · 구역 전원) "체력 −8 /명",
 * 단일 · 한 명 모양(자리 옮기기 · 가로지르기 · 마무리) "체력 −13". 손패 뷰는 엔진 cost(지금 1인 비용), 그 밖은 estimateCost.
 * 위력 없는 카드 "체력 소모 없음".
 */
export function costText(view, def = null) {
  const t = targetInfo(view, def);
  if (t.kind === 'none' || t.heal || !t.kind) return '체력 소모 없음';
  const per = t.kind === 'circle' || t.kind === 'all' || shapeMulti(t.shape) ? ' /명' : '';
  if (isNum(view.cost)) return `체력 −${view.cost}${per}`;
  const est = estimateCost(view, def);
  if (est == null) return isNum(view.costRate) ? `체력 −위력×${view.costRate}` : '';
  return `체력 −${est}${per}`;
}

/**
 * 효과 문구에서 대상 · 1인 위력 머리("중간 원 · 1인 18, …" · 고유 모양 머리 "이어 주기 · 1인 20, …")를 뺀 나머지.
 * 대상 칩 · 위력 줄과 같은 말을 두 번 쓰지 않는다. 머리가 없는 문구(효과 카드)는 그대로.
 */
export function effectDesc(desc) {
  const s = String(desc ?? '').trim();
  const m = s.match(/^[^·,()]*·\s*1인\s*\d+\s*(.*)$/);
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
  const owner = family === 'unique' ? ownerName(data, players, ownerCharId) : '';
  const famLabel = family === 'unique'
    ? `고유 · ${owner || '선수'}`
    : family === 'coach'
      ? `코치${view.coachType || def?.coach?.type ? ` · ${L.STAT_LABELS[view.coachType ?? def?.coach?.type] ?? ''}` : ''}`
      : L.CARD_FAMILY_LABELS[family] ?? family;
  const powerLine = powerText(view, def);
  const hasPower = powerLine !== '효과 카드';
  const fullDesc = view.desc ?? def?.desc ?? '';
  const t = targetInfo(view, def);
  const how = t.shape ? shapeHow(t.shape, owner) : '';
  const desc = t.shape ? (shapeDesc(effectDesc(fullDesc), t.shape) || how) : effectDesc(fullDesc);
  const uniqueColor = family === 'unique' ? (players || []).find((p) => p.charId === ownerCharId)?.portraitColor : null;
  const ownerArt = family === 'unique' ? portraitUrl(data, ownerCharId, 'face') : null;
  const tagName = opts.el ?? (onClick ? 'button' : 'div');
  const att = view.attach || null;
  const attPct = Math.round((Number(data?.lesson?.attach?.overPct) || 0.2) * 100);
  const memory = isMemory(view);
  const attrs = {
    class: ['card-face', `fam-${family}`, view.plus ? 'plus' : '', view.bond80 ? 'bond80' : '', dim ? 'dim' : '', selected ? 'selected' : '',
      recommended ? 'recommended' : '', t.kind ? `tk-${t.kind}` : '', t.shape ? `sh-${shapeIconKey(t.shape)}` : '', att ? 'attached' : '', att?.coachType ? `co-${att.coachType}` : '',
      memory ? 'memory' : ''],
    dataset: { uid: view.uid ?? '', card: view.cardId ?? '', coach: att?.supportId ?? '' },
    title: title ?? [att ? attachTitle(att, data) : '', `${view.name}${view.plus ? '+' : ''}`, memory ? MEMORY_TITLE : '', how ? `${t.shape.label}: ${how}` : '', fullDesc, reason ? `낼 수 없음: ${reason}` : ''].filter(Boolean).join('\n'),
  };
  if (tagName === 'button') {
    attrs.type = 'button';
    attrs.onclick = onClick;
    attrs['aria-pressed'] = selected ? 'true' : 'false';
  }
  const cost = costText(view, def);
  const ticon = t.shape
    ? h('i', { class: ['cf-ticon', `s-${shapeIconKey(t.shape)}`, t.shape.size ? `sz-${t.shape.size}` : ''], 'aria-hidden': 'true' })
    : t.kind && t.kind !== 'none' ? h('i', { class: ['cf-ticon', t.heal ? 'heal' : t.kind, t.size ? `sz-${t.size}` : ''], 'aria-hidden': 'true' }) : null;
  const smult = shapeMultChip(t.shape);
  const el = h(tagName, attrs,
    h('span', { class: 'cf-band', 'aria-hidden': 'true' }),
    h('span', { class: 'cf-name' }, view.name ?? view.cardId, view.plus ? h('b', { class: ['cf-plus', att?.upgrade === 'plus' ? 'att' : ''] }, '+') : null),
    h('span', { class: 'cf-meta' },
      att ? h('span', { class: 'cf-coach', title: attachTitle(att, data) }, avatar(att.color, att.short || att.name, 'xs', 'cf-coach-face', { art: portraitUrl(data, att.supportId, 'face') }), h('b', {}, `${att.short} 지원`)) : null,
      h('span', { class: 'cf-fam' }, ownerArt ? avatar(uniqueColor || ((data && data.characters) || []).find((x) => x.id === ownerCharId)?.portraitColor, owner, 'xs', 'cf-owner', { art: ownerArt }) : null, famLabel),
      memory ? h('span', { class: 'cf-mem', title: MEMORY_TITLE }, '메모리') : null,
      view.bond80 ? h('span', { class: 'cf-bond' }, '유대80') : null,
      view.exhaust ? h('span', { class: 'cf-ex', title: '낸 뒤 이번 레슨에서 빠진다' }, '1회') : null),
    h('span', { class: ['cf-target', t.kind ? `tk-${t.kind}` : '', t.shape ? 'shape' : ''] }, ticon, targetText(view, def)),
    h('span', { class: ['cf-power', hasPower ? '' : 'muted'] }, powerLine,
      hasPower && att?.upgrade === 'pct' ? h('span', { class: 'cf-pmult att', title: '코치 지원 — 이미 강화된 카드라 이번 턴 위력 +' + attPct + '%' }, `지원 +${attPct}%`) : null,
      hasPower && smult && att?.upgrade !== 'pct' ? h('span', { class: 'cf-pmult shape' }, smult.text) : null),
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
  const memory = isMemory(view);
  const attrs = {
    class: ['mini-card', `fam-${family}`, view.plus ? 'plus' : '', selected ? 'selected' : '', disabled ? 'disabled' : '', memory ? 'memory' : ''],
    dataset: { uid: view.uid ?? '', card: view.cardId ?? '' },
    title: `${view.name ?? view.cardId}${view.plus ? '+' : ''} — ${L.CARD_FAMILY_LABELS[family] ?? family}${memory ? ` · ${MEMORY_TITLE}` : ''}\n${desc}`,
  };
  const tagName = onClick ? 'button' : 'div';
  if (onClick) { attrs.type = 'button'; attrs.onclick = onClick; attrs.disabled = disabled; }
  return h(tagName, attrs,
    // 긴 이름 (+ 포함 9자 이상 — "물결 세이브 루틴+")은 글자를 조금 줄여 8열 그리드에서도 다 보이게 한다
    h('span', { class: ['mc-name', String(view.name ?? view.cardId ?? '').length + (view.plus ? 1 : 0) >= 9 ? 'long' : ''] }, view.name ?? view.cardId, view.plus ? h('b', { class: 'cf-plus' }, '+') : null),
    h('span', { class: 'mc-desc' }, note ?? desc),
    memory ? h('span', { class: 'mc-mem', 'aria-label': MEMORY_TITLE }, '메모리') : null);
}

/** 레전드 메모리 카드 띠의 설명 (카드 title · 칩 title) */
export const MEMORY_TITLE = '레전드 메모리 카드 — 등록 팀이 남긴 카드';

/** 덱 카드 뷰가 레전드 메모리 카드인가 (엔진 카드 뷰 memory · 덱 항목 src "memory") */
export function isMemory(view) {
  return !!view && (view.memory === true || view.src === 'memory');
}

/**
 * 메모리 카드 한 줄 칩 (등록 팀 목록 · 레전드 칸 · 결과 화면): 계열 색 점 · 이름 (+ 강화). mc 가 없으면 "메모리 카드 없음".
 * 데이터에 없는 카드는 id 를 그대로 쓴다 (엔진 검사가 걸러 낸다 — 화면은 막지 않는다).
 * @param {object} data
 * @param {{ cardId: string, plus?: boolean } | null} mc
 * @param {{ cls?: string|string[], title?: string, empty?: string }} [opts]
 */
export function memoryChip(data, mc, opts = {}) {
  const cls = Array.isArray(opts.cls) ? opts.cls : [opts.cls || ''];
  if (!mc || !mc.cardId) return h('span', { class: ['mem-chip', 'none', ...cls] }, opts.empty ?? '메모리 카드 없음');
  const def = cardDefOf(data, mc.cardId);
  const family = def?.family ?? 'common';
  const name = `${def?.name ?? mc.cardId}${mc.plus ? '+' : ''}`;
  const famLabel = L.CARD_FAMILY_LABELS[family] ?? family;
  return h('span', {
    class: ['mem-chip', `fam-${family}`, mc.plus ? 'plus' : '', ...cls],
    dataset: { card: mc.cardId, plus: mc.plus ? '1' : '0' },
    title: opts.title ?? `메모리 카드 「${name}」 — ${famLabel}${def ? `\n${mc.plus ? def.descPlus ?? def.desc : def.desc}` : ''}`,
  }, h('i', { class: 'mem-dot', 'aria-hidden': 'true' }), h('span', { class: 'mem-nm' }, name));
}
