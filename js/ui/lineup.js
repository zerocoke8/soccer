// js/ui/lineup.js — 라인업 보드 (편성 화면 setup.js · 전술 미팅 training.js openMeeting 공용)
// 가로 미니 필드(우리 골 = 왼쪽, GK → DF → MF → FW 가 오른쪽으로 — 경기 화면과 같은 방향) 위 포메이션 슬롯 + (편성만) 선수 풀.
//
//  배치 규칙 = 엔진 validateSquad (js/engine/training.js): 적성 '-' 는 배치 불가, GK 는 적성 A/B 만 (canPlay).
//  놓기 규칙 = "놓은 곳의 선수와 자리를 맞바꾼다":
//   - 슬롯 → 슬롯: 맞바꾸기 (빈 슬롯이면 이동). 끈 선수가 새 자리에, 밀려난 선수가 끈 선수의 원래 자리에 설 수 있어야 가능.
//   - 풀(벤치) → 슬롯: 투입, 원래 있던 선수는 벤치로 (벤치는 늘 가능).
//   - 슬롯 → 풀 영역 빈 곳(addPoolZone — 편성은 선수 풀 패널 전체): 벤치로.  슬롯 선수 → 벤치 선수 카드: 교체 (벤치 선수가 그 자리에 설 수 있어야 가능).
//  조작:
//   - 드래그 (포인터 이벤트 — 마우스 · 터치): 선수 카드(슬롯 · 풀)를 끌어 놓는다. DRAG_PX 넘게 움직여야 드래그 → 그 전에 떼면 탭.
//     끄는 동안 모든 자리를 초록(놓을 수 있음) / 빨강(불가 + 이유)으로 칠하고, 그 자리에서의 적성("MF A")을 보여 준다.
//     빨강에 놓으면 흔들림 + 안내 토스트, 변경 없음. 보드 밖에 놓으면 취소.
//   - 탭 (포인터는 pointerup 에서, 키보드 Enter/Space 는 click 으로): 선수를 눌러 고르고 → 자리(슬롯 · 선수 · 풀)를 눌러 놓기 (같은 색 표시).
//     다시 누르거나 Esc · 바깥 = 취소. 빈 슬롯을 먼저 누르면 그 자리에 올 수 있는 선수가 초록/빨강.
//     onSlotTap 이 있으면(편성) 고른 것 없이 누른 슬롯은 그 함수로 (선수 고르기 모달).
//  스테이지 배율: 포인터 clientX/Y 는 화면 px → 고스트 위치는 toStage() 로 논리 px, 놓을 곳 찾기는 elementFromPoint(화면 px 그대로).
import { h, toast } from './dom.js';
import { positionOfSlot } from './labels.js';
import { toStage } from './stage.js';

export const DRAG_PX = 6; // 이만큼(화면 px) 움직여야 드래그 — 그 전에 놓으면 탭(클릭)
const APT_RANK = { A: 0, B: 1, C: 2 };

/* ------------------------------------------------------------------ */
/* 순수 도우미 (DOM 없음 — test/lineup.test.mjs)                          */
/* ------------------------------------------------------------------ */

// 미니 필드 위 슬롯 자리 (%): 가로 = 포지션 줄 (GK 왼쪽 → FW 오른쪽), 세로 = 같은 포지션 안에서 고르게
export const LINE_X = { GK: 12.5, DF: 37.5, MF: 62.5, FW: 87.5 };
/** spread(편성 — 큰 카드): 3명 이상 줄은 SPREAD_Y 끝까지 벌린다 (25/50/75% 면 카드 사이가 몇 px 라 위 카드의 안내 알약이 아래 카드에 가린다) */
export const SPREAD_Y = [15, 85];
export function slotSpot(slot, slots, { spread = false } = {}) {
  const pos = positionOfSlot(slot);
  const same = slots.filter((s) => positionOfSlot(s) === pos);
  const i = Math.max(0, same.indexOf(slot));
  const n = same.length;
  const y = spread && n >= 3 ? SPREAD_Y[0] + ((SPREAD_Y[1] - SPREAD_Y[0]) * i) / (n - 1) : ((i + 1) / (n + 1)) * 100;
  return { x: LINE_X[pos] ?? 50, y };
}

/** 그 포지션에 설 수 없는 이유 (없으면 null). 엔진 validateSquad 와 같은 규칙 */
export function placeReason(pos, apt) {
  const a = apt || '-';
  if (a === '-') return '적성 없음';
  if (pos === 'GK' && a !== 'A' && a !== 'B') return 'GK는 A/B만';
  return null;
}
export function canPlay(pos, apt) { return placeReason(pos, apt) == null; }
/** 빨강 자리 안내 글: "GK 적성 없음" · "GK C · GK는 A/B만" */
export function badText(pos, apt, reason = placeReason(pos, apt)) {
  return !apt || apt === '-' ? `${pos} ${reason}` : `${pos} ${apt} · ${reason}`;
}

/** assign({ 슬롯: id })에서 그 선수의 슬롯 (벤치면 null) */
export function slotOfId(assign, id) {
  for (const [s, v] of Object.entries(assign || {})) if (v === id) return s;
  return null;
}

/**
 * 놓을 곳(또는 탭한 곳) → 이동 { id, to } (to = 슬롯 | null = 벤치). 할 일이 없으면 null.
 * @param {{ slots: string[], assign: object, bench?: boolean }} model
 * @param {string} id 끈(고른) 선수
 * @param {{ slot?: string, player?: string, pool?: boolean }} target
 */
export function resolveTarget(model, id, target) {
  const from = slotOfId(model.assign, id);
  if (!target) return null;
  if (target.pool) return from && model.bench ? { id, to: null } : null;
  if (target.slot) return target.slot === from ? null : { id, to: target.slot };
  if (target.player) {
    const other = target.player;
    if (other === id) return null;
    const otherSlot = slotOfId(model.assign, other);
    if (otherSlot) return { id, to: otherSlot }; // 필드 선수 카드 = 그 선수 자리
    if (from) return { id: other, to: from }; // 벤치 선수 카드 = 교체 투입 (벤치 선수가 내 자리로, 나는 벤치로)
    return null; // 벤치 ↔ 벤치
  }
  return null;
}

/**
 * 이동이 규칙에 맞는지.
 * @returns {{ ok: boolean, reason: string|null, pos?: string, apt?: string, from: string|null, occupant: string|null,
 *            occPos?: string, occApt?: string, occReason?: string|null }}
 *   reason = 옮기는 선수가 새 자리에 못 서는 이유, occReason = 밀려난 선수가 옮기는 선수의 원래 자리에 못 서는 이유
 */
export function checkMove(model, move) {
  const { id, to } = move;
  const from = slotOfId(model.assign, id);
  if (to == null) {
    const ok = !!model.bench && !!from;
    return { ok, reason: ok ? null : '벤치 없음', from, occupant: null };
  }
  if (!model.slots.includes(to)) return { ok: false, reason: '없는 자리', from, occupant: null };
  const pos = positionOfSlot(to);
  const apt = model.aptOf(id, pos) || '-';
  const reason = placeReason(pos, apt);
  const occ = model.assign[to];
  const occupant = occ && occ !== id ? occ : null;
  const out = { ok: !reason, reason, pos, apt, from, occupant };
  if (occupant && from) {
    out.occPos = positionOfSlot(from);
    out.occApt = model.aptOf(occupant, out.occPos) || '-';
    out.occReason = placeReason(out.occPos, out.occApt);
    if (out.occReason) out.ok = false;
  }
  return out;
}

/** 이동 적용 → 새 assign (원본은 그대로). 빈 슬롯은 키가 없다 */
export function applyMove(assign, move) {
  const next = { ...assign };
  const from = slotOfId(assign, move.id);
  if (move.to == null) {
    if (from) delete next[from];
    return next;
  }
  if (from === move.to) return next;
  const occupant = assign[move.to];
  next[move.to] = move.id;
  if (from) {
    if (occupant && occupant !== move.id) next[from] = occupant;
    else delete next[from];
  }
  // from 이 없으면(벤치에서 투입) 원래 있던 선수는 벤치로 = assign 에서 빠진다
  return next;
}

/** 규칙에 어긋난 배치 · 빈 슬롯 목록 [{ slot, id, reason }] (id = null 이면 빈 슬롯) */
export function lineupIssues(model) {
  const out = [];
  for (const slot of model.slots) {
    const id = model.assign[slot];
    if (!id) { out.push({ slot, id: null, reason: '비어 있음' }); continue; }
    const pos = positionOfSlot(slot);
    const reason = placeReason(pos, model.aptOf(id, pos));
    if (reason) out.push({ slot, id, reason });
  }
  return out;
}

/**
 * 포메이션이 바뀔 때 배치 다시 앉히기: 새 포메이션에도 있는 슬롯은 그대로, 없어진 슬롯의 선수(+ extraIds)는
 * 빈 슬롯으로 — 설 수 있는 (슬롯, 선수) 쌍을 적성 좋은 순으로. 남은 선수는 벤치 (편성).
 * fillAll (미팅 — 벤치 없음): 그래도 남은 선수는 남은 빈 슬롯에 순서대로 (설 수 없으면 보드에 빨강 · 진행 시 막힘).
 */
export function reseat(assign, slots, aptOf, { fillAll = false, extraIds = [] } = {}) {
  const next = {};
  const displaced = [];
  for (const [sl, id] of Object.entries(assign || {})) {
    if (!id) continue;
    if (slots.includes(sl) && !next[sl]) next[sl] = id;
    else displaced.push(id);
  }
  for (const id of extraIds) if (!displaced.includes(id) && !Object.values(next).includes(id)) displaced.push(id);
  const empty = slots.filter((sl) => !next[sl]);
  const pairs = [];
  for (const sl of empty) {
    const pos = positionOfSlot(sl);
    for (const id of displaced) {
      const apt = aptOf(id, pos) || '-';
      if (canPlay(pos, apt)) pairs.push({ sl, id, rank: APT_RANK[apt] ?? 3 });
    }
  }
  pairs.sort((a, b) => a.rank - b.rank || slots.indexOf(a.sl) - slots.indexOf(b.sl) || displaced.indexOf(a.id) - displaced.indexOf(b.id));
  const used = new Set();
  for (const p of pairs) {
    if (next[p.sl] || used.has(p.id)) continue;
    next[p.sl] = p.id;
    used.add(p.id);
  }
  if (fillAll) {
    const rest = displaced.filter((id) => !used.has(id));
    for (const sl of slots) if (!next[sl] && rest.length) next[sl] = rest.shift();
  }
  return next;
}

/** 레어도 순위 (선수 풀 벤치 정렬 — SSR → SR → R → 그 밖) */
export const RARITY_RANK = { SSR: 0, SR: 1, R: 2 };

/**
 * 선수 풀 순서 (§19.14 ①, 편성 16명 = 2줄 × 8장): 필드 선수(슬롯 순서) → 벤치(레어도 SSR → SR → R, 같으면 ids 순서).
 * @param {string[]} ids 전원 (데이터 순서)
 * @param {string[]} slots 포메이션 슬롯
 * @param {Record<string,string>} assign 슬롯 → 선수 id
 * @param {(id: string) => string|undefined} rarityOf
 */
export function poolOrder(ids, slots, assign, rarityOf = () => undefined) {
  const list = Array.isArray(ids) ? ids : [];
  const field = (slots || []).map((sl) => assign?.[sl]).filter((id) => id && list.includes(id));
  const seen = new Set(field);
  const rank = (id) => RARITY_RANK[rarityOf(id)] ?? 3;
  const bench = list.filter((id) => !seen.has(id))
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((x) => x.id);
  return [...new Set(field), ...bench];
}

/**
 * 미팅 액션 swaps: 슬롯 순서대로 "그 선수를 그 슬롯으로" (지금 자리 그대로인 선수는 뺀다).
 * 엔진 resolveMeeting 은 swaps 를 순서대로 적용하고, 슬롯에 다른 선수가 있으면 자리를 맞바꾼다 →
 * 앞에서 채운 슬롯은 뒤 swap 이 건드리지 않으므로 최종 배치 = assign (test/lineup.test.mjs 가 엔진으로 확인).
 * @param {string[]} slots 새 포메이션 슬롯
 * @param {Record<string,string>} assign 슬롯 → 선수 id
 * @param {(id: string) => string|null|undefined} currentSlotOf 런 상태의 지금 슬롯
 */
export function meetingSwaps(slots, assign, currentSlotOf) {
  return slots
    .filter((sl) => assign[sl])
    .map((sl) => ({ playerId: assign[sl], slot: sl }))
    .filter((sw) => currentSlotOf(sw.playerId) !== sw.slot);
}

/* ------------------------------------------------------------------ */
/* 보드 (DOM)                                                            */
/* ------------------------------------------------------------------ */

/** 필살기 칩 "✨ 낙뢰" (등급 색 바탕, title = 종류 · 설명 · 대사) — 편성 선수 풀 카드 · 고르기 모달 (§19.14 ①). info = labels.ultimateInfo */
export function ultChip(info, cls = '') {
  if (!info) return null;
  return h('span', { class: ['lu-ult', info.tier ? `tier-${info.tier}` : '', cls], title: info.title, dataset: { ult: info.id } },
    h('i', { 'aria-hidden': 'true' }, '✨'), h('span', { class: 'lu-ult-nm' }, info.name));
}
/** 작은 필살기 표시 "✨" (등급 색 바탕, title = 이름 · 종류 · 설명) — 편성 · 미팅 · 경기 전 준비 슬롯 카드 이름 옆 (§19.14 ②) */
export function ultMark(info) {
  if (!info) return null;
  return h('span', { class: ['ult-mark', info.tier ? `tier-${info.tier}` : ''], title: info.title, 'aria-label': `필살기 ${info.name}`, dataset: { ult: info.id } }, '✨');
}

function aptBadge(apt) {
  const a = apt || '-';
  return h('span', { class: ['badge', 'apt', a === '-' ? 'apt-none' : `apt-${a}`] }, a);
}

/** 스테이지(#stage) 배율 · 위치 — 고스트는 스테이지 안에 논리 px 로 놓는다 */
function stageFit(doc) {
  const st = doc.getElementById('stage');
  if (!st) return { host: doc.body, fit: { scale: 1, x: 0, y: 0 } };
  const r = st.getBoundingClientRect();
  const scale = st.offsetWidth > 0 && r.width > 0 ? r.width / st.offsetWidth : 1;
  return { host: st, fit: { scale, x: r.left, y: r.top } };
}

/**
 * 라인업 보드.
 * @param {object} o
 * @param {string[]} o.slots 포메이션 슬롯 (slotsOf)
 * @param {Record<string,string>} o.assign 슬롯 → 선수 id (보드는 바꾸지 않는다 — 바뀌면 onChange(next, move))
 * @param {(id: string, pos: string) => string} o.aptOf 적성 'A'|'B'|'C'|'-'
 * @param {(id: string) => string} o.nameOf
 * @param {(id: string) => string} [o.colorOf] 고스트 아바타 색
 * @param {(id: string, slot: string) => any} o.slotBody 슬롯 카드 내용 (선수 있을 때)
 * @param {(next: object, move: object) => void} o.onChange
 * @param {boolean} [o.bench] 선수 풀(벤치) 사용 — 편성 화면
 * @param {string[]} [o.ids] 풀에 보일 선수 (bench 일 때)
 * @param {(id: string, slot: string|null) => any} [o.poolBody] 풀 카드 내용
 * @param {boolean} [o.compact] 작은 슬롯 카드 (미팅)
 * @param {(id: string) => string} [o.titleOf] 슬롯 카드 title 에 덧붙일 줄 (편성 · 미팅: 필살기)
 * @param {(slot: string) => void} [o.onSlotTap] 아무것도 고르지 않은 채 슬롯을 누르면 (편성: 선수 고르기 모달). 없으면 슬롯 선수를 고른다
 * @returns {{ pitch: HTMLElement, pool: HTMLElement|null, addPoolZone: (el: HTMLElement) => void, cancel: () => void }}
 */
export function lineupBoard(o) {
  const { slots, assign, aptOf, nameOf = (id) => String(id), colorOf = () => '#4b5563', slotBody, poolBody, onChange } = o;
  const bench = !!o.bench;
  const model = { slots, assign, aptOf, bench };
  const targets = new Map(); // 요소 → { slot } | { player } | { pool: true }
  const sources = new Map(); // 끌 수 있는 요소 → 선수 id
  let sel = null; // 탭 선택: { id } | { slot }
  let drag = null; // 드래그 중: { id, el, ghost, host, fit, hover }
  let pending = null; // 누른 뒤 아직 드래그 전 (포인터 리스너 정리용)

  // ---- 표시 (색 · 적성 안내) ----
  function hintOf(move, chk, srcId) {
    if (move.to == null) return '벤치로';
    const base = `${chk.pos} ${chk.apt}`;
    if (!chk.ok) {
      if (chk.reason) return badText(chk.pos, chk.apt, chk.reason);
      return `${nameOf(chk.occupant)} → ${badText(chk.occPos, chk.occApt, chk.occReason)}`;
    }
    if (move.id !== srcId) return `${base} · 교체 투입`;
    if (chk.occupant && chk.from) return `${base} ⇄ ${nameOf(chk.occupant)}`;
    if (chk.occupant) return `${base} · ${nameOf(chk.occupant)} 벤치로`;
    return base;
  }
  function reasonOf(move, chk) {
    // "미르카: GK 적성 없음" (자리는 이유 글에 포지션으로 들어 있다 — "→ GK: GK …" 처럼 겹치지 않게)
    if (chk.reason) return `${nameOf(move.id)}: ${chk.pos ? badText(chk.pos, chk.apt, chk.reason) : chk.reason}`;
    return `자리를 바꾸면 ${nameOf(chk.occupant)} 이(가) ${chk.from} 로 가야 하는데 ${badText(chk.occPos, chk.occApt, chk.occReason)}`;
  }

  /** src({ id } | { slot })에서 target 으로 → { cls, hint, move, chk } | null(해당 없음) */
  function statusFor(src, target) {
    if (src.id) {
      const move = resolveTarget(model, src.id, target);
      if (!move) {
        const self = target.player === src.id || (target.slot && assign[target.slot] === src.id);
        return self ? { cls: 'origin', hint: '지금 자리' } : null;
      }
      const chk = checkMove(model, move);
      return { cls: chk.ok ? 'ok' : 'bad', hint: hintOf(move, chk, src.id), move, chk };
    }
    // 빈 슬롯을 고른 상태: 그 자리로 올 선수
    if (target.slot === src.slot) return { cls: 'origin', hint: '여기로' };
    if (target.pool) return null;
    const id = target.player ?? (target.slot ? assign[target.slot] : null);
    if (!id) return null;
    const move = { id, to: src.slot };
    const chk = checkMove(model, move);
    return { cls: chk.ok ? 'ok' : 'bad', hint: hintOf(move, chk, id), move, chk };
  }

  function paint(src) {
    for (const [el, t] of targets) {
      const st = src ? statusFor(src, t) : null;
      el.classList.toggle('drop-ok', st?.cls === 'ok');
      el.classList.toggle('drop-bad', st?.cls === 'bad');
      el.classList.toggle('drop-origin', st?.cls === 'origin');
      const hint = el.querySelector(':scope > .lu-hint');
      const text = st ? st.hint : (el.dataset.baseHint || '');
      if (hint) hint.textContent = text;
      // 화면 읽기: 알약(aria-hidden)과 같은 글을 자리의 설명으로 — 초록/빨강을 색 없이도 알 수 있게
      const desc = st && st.cls !== 'origin' ? `${st.cls === 'ok' ? '놓을 수 있음' : '놓을 수 없음'}: ${st.hint}` : text;
      if (desc) el.setAttribute('aria-description', desc);
      else el.removeAttribute('aria-description');
    }
    for (const el of [pitch, pool]) if (el) el.classList.toggle('lu-active', !!src);
    for (const [el, id] of sources) {
      const on = !!(sel && sel.id === id);
      el.classList.toggle('lu-selected', on);
      if (on) el.setAttribute('aria-pressed', 'true');
      else el.removeAttribute('aria-pressed');
    }
    for (const [el, t] of targets) {
      if (!t.slot) continue;
      const on = !!(sel && (sel.slot === t.slot || (sel.id && assign[t.slot] === sel.id)));
      el.classList.toggle('lu-selected', on);
      if (on) el.setAttribute('aria-pressed', 'true');
      else if (!sources.has(el)) el.removeAttribute('aria-pressed');
    }
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove('lu-shake');
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add('lu-shake');
    setTimeout(() => el.classList.remove('lu-shake'), 450);
  }
  function reject(el, move, chk) {
    shake(el);
    toast(`놓을 수 없음 — ${reasonOf(move, chk)}`, 'info', 2600);
  }
  function commit(move) {
    setSel(null);
    onChange(applyMove(assign, move), move);
  }

  // ---- 탭 (클릭 · 키보드) ----
  const doc = () => pitch.ownerDocument;
  function onDocDown(e) {
    if (!pitch.isConnected) { setSel(null); return; }
    for (const el of targets.keys()) if (el.contains(e.target)) return;
    setSel(null);
  }
  function onKey(e) {
    if (e.key === 'Escape') setSel(null);
  }
  function setSel(next) {
    const had = !!sel;
    sel = next;
    const d = doc();
    if (sel && !had) {
      d.addEventListener('pointerdown', onDocDown, true);
      d.addEventListener('keydown', onKey);
    } else if (!sel && had) {
      d.removeEventListener('pointerdown', onDocDown, true);
      d.removeEventListener('keydown', onKey);
    }
    paint(sel);
    live.textContent = !sel ? ''
      : sel.id ? `${nameOf(sel.id)} 선택 — 놓을 자리를 고르세요 (Esc 취소)`
        : `${sel.slot} 선택 — 올 선수를 고르세요 (Esc 취소)`;
  }
  function tap(target, el) {
    if (!sel) {
      if (target.slot && typeof o.onSlotTap === 'function') { o.onSlotTap(target.slot); return; } // 편성: 슬롯 탭 = 선수 고르기 모달
      if (target.slot) { const id = assign[target.slot]; setSel(id ? { id } : { slot: target.slot }); } else if (target.player) setSel({ id: target.player });
      return;
    }
    let move;
    if (sel.id) {
      if (target.player === sel.id || (target.slot && assign[target.slot] === sel.id)) { setSel(null); return; }
      move = resolveTarget(model, sel.id, target);
      if (!move) { // 벤치 ↔ 벤치 · 풀 빈 곳 → 고른 것 바꾸기 / 취소
        if (target.pool) setSel(null);
        else if (target.player) setSel({ id: target.player });
        else setSel(assign[target.slot] ? { id: assign[target.slot] } : { slot: target.slot });
        return;
      }
    } else {
      if (target.slot === sel.slot || target.pool) { setSel(null); return; }
      const id = target.player ?? assign[target.slot];
      if (!id) { setSel({ slot: target.slot }); return; }
      move = { id, to: sel.slot };
    }
    const chk = checkMove(model, move);
    if (!chk.ok) { reject(el, move, chk); return; }
    commit(move);
  }

  // ---- 드래그 (포인터 이벤트) ----
  function hitTest(x, y) {
    const d = doc();
    let el = typeof d.elementFromPoint === 'function' ? d.elementFromPoint(x, y) : null;
    if (el) {
      while (el && !targets.has(el)) el = el.parentElement;
      return el || null;
    }
    // elementFromPoint 가 없는 환경: 화면 사각형으로 (가장 작은 것 = 안쪽 카드 우선)
    let best = null;
    let bestArea = Infinity;
    for (const t of targets.keys()) {
      const r = t.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width * r.height < bestArea) { best = t; bestArea = r.width * r.height; }
    }
    return best;
  }
  function placeGhost(x, y) {
    const p = toStage(x, y, drag.fit);
    const g = drag.ghost;
    g.style.left = `${p.x}px`;
    g.style.top = `${p.y}px`;
    // 마우스: 스테이지 오른쪽 끝에 닿으면 포인터 왼쪽으로
    if (!drag.touch && drag.hostW) g.classList.toggle('flip', p.x + 24 + (g.offsetWidth || 0) > drag.hostW);
  }
  function beginDrag(id, el, e) {
    if (sel) setSel(null);
    const d = doc();
    const { host, fit } = stageFit(d);
    const ghost = h('div', { class: 'lu-ghost', 'aria-hidden': 'true' },
      h('span', { class: 'avatar avatar-sm', style: { background: colorOf(id) } }, Array.from(String(nameOf(id)))[0] ?? '?'),
      h('span', { class: 'lu-ghost-nm' }, nameOf(id)),
      h('span', { class: 'lu-ghost-st' }));
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (touch) ghost.classList.add('touch');
    host.append(ghost);
    drag = { id, el, ghost, fit, hover: null, touch, hostW: host.offsetWidth || 0 };
    d.addEventListener('keydown', onDragKey);
    el.classList.add('lu-dragging');
    d.documentElement.classList.add('lu-grabbing');
    paint({ id });
    placeGhost(e.clientX, e.clientY);
  }
  function dragMove(e) {
    const hit = hitTest(e.clientX, e.clientY);
    if (hit !== drag.hover) {
      if (drag.hover) drag.hover.classList.remove('drop-hover');
      drag.hover = hit;
      const st = hit ? statusFor({ id: drag.id }, targets.get(hit)) : null;
      if (hit) hit.classList.add('drop-hover');
      drag.ghost.classList.toggle('ok', st?.cls === 'ok');
      drag.ghost.classList.toggle('bad', st?.cls === 'bad');
      // 마우스는 포인터 밑 자리의 알약이 보이므로 ✔/✖ 만 (고스트가 옆 카드를 덜 가린다). 터치(손가락이 가림) · 알약 없는 곳(풀 영역)은 글까지
      const pill = hit && hit.querySelector(':scope > .lu-hint');
      const mark = st && st.cls !== 'origin' ? (st.cls === 'ok' ? '✔' : '✖') : '';
      drag.ghost.querySelector('.lu-ghost-st').textContent = mark ? (drag.touch || !pill ? `${mark} ${st.hint}` : mark) : '';
    }
    placeGhost(e.clientX, e.clientY); // 글자가 바뀐 뒤의 폭으로 오른쪽 끝 판단
  }
  function onDragKey(e) {
    if (e.key === 'Escape' && drag) endDrag(true); // 끄는 중 Esc = 취소 (손을 떼면 아무것도 하지 않는다)
  }
  function endDrag(cancelled, at = null) {
    const { id, el, ghost, hover } = drag;
    drag = null;
    doc().removeEventListener('keydown', onDragKey);
    ghost.remove();
    el.classList.remove('lu-dragging');
    if (hover) hover.classList.remove('drop-hover');
    doc().documentElement.classList.remove('lu-grabbing');
    paint(null);
    swallowNextClick(doc(), 0, at);
    if (cancelled || !hover) return;
    const move = resolveTarget(model, id, targets.get(hover));
    if (!move) return;
    const chk = checkMove(model, move);
    if (!chk.ok) { reject(hover, move, chk); return; }
    commit(move);
  }
  // 누름 → (문턱 넘게 움직이면) 드래그 / (그대로 떼면) 탭. 탭은 click 을 기다리지 않고 pointerup 에서 처리한다:
  // Chrome 터치에서 보드 드래그 직후 첫 탭은 click 이 만들어지지 않는다 (puppeteer 터치로 확인). 뒤따르는 click 은 삼키고,
  // 키보드(Enter/Space)의 click(detail 0)은 각 요소의 onclick 이 그대로 처리한다.
  function onPointerDown(e, el) {
    if ((e.button != null && e.button !== 0) || drag || pending || !targets.has(el)) return; // 풀 영역에 넘긴 풀 = 바깥 영역이 처리
    const id = sources.get(el) || null; // 끌 수 있는 요소면 선수 id (빈 슬롯 · 풀 영역은 탭만)
    const win = el.ownerDocument.defaultView || globalThis;
    const start = { x: e.clientX, y: e.clientY, pid: e.pointerId };
    let moved = false;
    const same = (ev) => ev.pointerId === start.pid;
    const move = (ev) => {
      if (!same(ev)) return;
      if (!drag) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_PX) return;
        moved = true;
        if (!id) return;
        beginDrag(id, el, ev);
      }
      dragMove(ev);
    };
    const up = (ev) => {
      if (!same(ev)) return;
      cleanup();
      const at = { x: ev.clientX, y: ev.clientY };
      if (drag) { endDrag(ev.type === 'pointercancel', at); return; }
      if (ev.type !== 'pointerup' || moved || !targets.has(el)) return;
      swallowNextClick(doc(), e.pointerType === 'mouse' ? 0 : 600, at);
      tap(targets.get(el), el);
    };
    const cleanup = () => {
      pending = null;
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      win.removeEventListener('pointercancel', up);
    };
    pending = { cleanup };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    win.addEventListener('pointercancel', up);
  }
  /** 놓을 곳(target)으로 등록 + 누르기 처리. id 가 있으면 끌 수도 있다 */
  function wire(el, target, id = null) {
    targets.set(el, target);
    if (id) sources.set(el, id);
    el.addEventListener('pointerdown', (e) => onPointerDown(e, el));
    el.addEventListener('dragstart', (e) => e.preventDefault()); // 브라우저 기본 드래그(글자 · 이미지) 끄기
  }

  // ---- 슬롯 카드 ----
  const extraTitle = (id) => { const t = typeof o.titleOf === 'function' ? o.titleOf(id) : ''; return t ? `\n${t}` : ''; };
  const slotCard = (slot) => {
    const pos = positionOfSlot(slot);
    const id = assign[slot] || null;
    const spot = slotSpot(slot, slots, { spread: !o.compact });
    const apt = id ? (aptOf(id, pos) || '-') : null;
    const bad = id ? placeReason(pos, apt) : null;
    const el = h('button', {
      type: 'button',
      class: ['slot-card', 'lu-slot', pos === 'GK' ? 'gk' : '', `pos-${pos}`, id ? '' : 'empty', bad ? 'illegal' : ''],
      style: { left: `${spot.x}%`, top: `${spot.y}%` },
      dataset: { slot, pid: id || '', baseHint: bad ? `배치 불가 · ${bad}` : '' },
      'aria-label': id ? `${slot} ${nameOf(id)} (${pos} ${apt})` : `${slot} 비어 있음`,
      title: id ? `${nameOf(id)} — ${pos} 적성 ${apt}${bad ? ` (배치 불가: ${bad})` : ''} · 끌어서 옮기기${extraTitle(id)}` : `${slot} — 선수를 끌어 놓거나, 눌러서 고른 뒤 선수를 누르세요`,
      onclick: () => tap({ slot }, el),
    },
    h('span', { class: 'slot-tag' }, slot),
    id ? slotBody(id, slot)
      : [h('span', { class: 'avatar avatar-sm lu-empty-av' }, '+'),
        h('span', { class: 'grow col' }, h('span', { class: 'slot-nm' }, '비어 있음'), h('span', { class: 'tiny muted lu-empty-tip' }, '선수를 끌어 놓기'))],
    id ? aptBadge(apt) : null,
    h('span', { class: 'lu-hint', 'aria-hidden': 'true' }, bad ? `배치 불가 · ${bad}` : ''));
    wire(el, { slot }, id);
    return el;
  };

  // 화면 읽기 알림: 탭으로 고른 것 (고른 선수 · 빈 자리)
  const live = h('span', { class: 'lu-sr', role: 'status', 'aria-live': 'polite' });
  const pitch = h('div', { class: ['mini-pitch', 'slot-cards', 'lu-pitch', o.compact ? 'compact' : ''] },
    h('div', { class: 'mp-lines', 'aria-hidden': 'true' },
      h('i', { class: 'mp-half' }), h('i', { class: 'mp-circle' }),
      h('i', { class: 'mp-box l' }), h('i', { class: 'mp-box r' }),
      h('i', { class: 'mp-goal l' }), h('i', { class: 'mp-goal r' }),
      h('span', { class: 'mp-label l' }, '우리 골'), h('span', { class: 'mp-label r' }, '공격 방향 →')),
    slots.map(slotCard), live);

  // ---- 선수 풀 (편성: 전원, 배치된 선수는 슬롯 표시 · 나머지 = 벤치) ----
  let pool = null;
  if (bench) {
    pool = h('div', {
      class: 'lu-pool',
      onclick: (e) => { if (targets.has(pool) && !e.target.closest('.lu-card')) tap({ pool: true }, pool); },
    }, (o.ids || []).map((id) => {
      const slot = slotOfId(assign, id);
      const el = h('button', {
        type: 'button',
        class: ['lu-card', slot ? 'placed' : 'bench'],
        dataset: { pid: id, slot: slot || '' },
        'aria-label': `${nameOf(id)} — ${slot ? `${slot} 배치` : '벤치'}`,
        onclick: () => tap({ player: id }, el),
      },
      poolBody ? poolBody(id, slot) : h('b', {}, nameOf(id)),
      h('span', { class: ['lu-where', slot ? 'on' : ''] }, slot || '벤치'),
      h('span', { class: 'lu-hint', 'aria-hidden': 'true' }));
      wire(el, { player: id }, id);
      return el;
    }));
    wire(pool, { pool: true });
  }

  return {
    pitch,
    pool,
    /** 풀을 감싼 패널 등 더 넓은 곳도 "벤치로" 놓는 곳으로 (카드 사이 빈틈만으로는 놓기 어렵다) */
    addPoolZone(el) {
      if (!bench || !el) return;
      targets.delete(pool); // 풀은 이제 이 영역의 일부 (빈틈에 놓아도 이 영역이 놓을 곳)
      wire(el, { pool: true });
      el.addEventListener('click', (e) => { if (!e.target.closest('.lu-card, button, select, input')) tap({ pool: true }, el); });
    },
    /** 탭 선택 · 드래그 취소 (다시 그리기 전에) */
    cancel() {
      if (pending) pending.cleanup();
      if (drag) endDrag(true);
      setSel(null);
    },
  };
}

// 포인터로 처리한 드래그 · 탭 뒤에 따라오는 click 한 번은 삼킨다: 놓은 곳이 모달 배경이면 모달이 닫히고, 끈 카드면 탭이 한 번 더 되고,
// 탭으로 연 모달(편성 선수 고르기) 위 버튼이 눌리므로. 마우스 click 은 pointerup 과 같은 입력 처리 안에서 바로 오고(ms 0 = 다음 틱에 뗀다),
// 터치 click 은 조금 뒤에 온다(탭: 600ms 안의 첫 click). 오지 않으면 시간이 지나 저절로 뗀다. 포인터가 만든 click(detail ≥ 1)만 삼킨다.
// at(뗀 자리, 화면 px)이 있으면 그 근처(SWALLOW_PX)의 click 만 삼킨다 — 딴 곳의 click 은 진짜 입력이다 (따라오는 click 이 오지 않은 것 → 그만).
// 새 누름(pointerdown)이 오면 그만 — 터치에서 click 이 만들어지지 않았을 때 곧바로 누른 모달 버튼 등을 삼키지 않는다.
const SWALLOW_PX = 24;
function swallowNextClick(doc, ms, at = null) {
  const win = doc.defaultView || globalThis;
  let timer = null;
  const off = () => {
    win.removeEventListener('click', stop, true);
    win.removeEventListener('pointerdown', off, true);
    clearTimeout(timer);
  };
  const stop = (e) => {
    if (!e.detail) return; // 키보드(Enter/Space) · 스크립트 click(detail 0)은 그대로 둔다
    const far = !!at && (e.clientX || e.clientY) && Math.hypot(e.clientX - at.x, e.clientY - at.y) > SWALLOW_PX;
    off();
    if (far) return;
    e.stopPropagation();
    e.preventDefault();
  };
  win.addEventListener('click', stop, true);
  win.addEventListener('pointerdown', off, true);
  timer = setTimeout(off, ms);
}
