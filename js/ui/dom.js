// js/ui/dom.js — DOM 생성/오버레이/토스트 헬퍼 (엔진 로직 없음)

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'disabled' || k === 'checked' || k === 'selected' || k === 'hidden' || k === 'open') el[k] = !!v;
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.append(c);
    else el.append(document.createTextNode(String(c)));
  }
}

export function initialOf(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
}

/**
 * 얼굴 원: 색 원 + 첫 글자. opts.art (그림 주소 — js/ui/art.js portraitUrl) 가 있으면 그 위에 <img class="pt"> 를 얹는다 (LESSON_PROTO_PLAN §24.12.2).
 * 글자는 늘 남는다 — 그림이 늦거나 실패해도 보이고, textContent 를 읽는 테스트도 그대로다. 30px 이하 원은 그림을 조금 당긴다 (base.css).
 * @param {string} color
 * @param {string} name
 * @param {'xs'|'sm'|'md'|'lg'} [size]
 * @param {string|string[]} [extra] 더할 클래스
 * @param {{ art?: string|null }} [opts]
 */
export function avatar(color, name, size = 'md', extra = '', opts = null) {
  const art = opts && typeof opts.art === 'string' && opts.art ? opts.art : null;
  const el = h('span', {
    class: ['avatar', `avatar-${size}`, ...(Array.isArray(extra) ? extra : [extra]), art ? 'has-art' : ''],
    style: { background: color || '#4b5563' },
    title: name || '',
    'aria-label': name || '',
  }, initialOf(name));
  if (art) el.append(artImg(art));
  return el;
}

/**
 * 얼굴 그림 <img class="pt"> — 부모(원 · 토큰 얼굴)를 덮는다 (절대 위치 · object-fit cover · border-radius inherit, base.css .pt).
 * 끌기를 가로채지 않는다 (pointer-events none · draggable false). 불러오지 못하면 지운다 → 부모의 글자가 보인다.
 * 부모는 위치 지정 요소여야 한다 (.avatar.has-art · .tok-face 등).
 * @param {string} url
 * @param {string} [cls]
 */
export function artImg(url, cls = '') {
  const img = h('img', { class: ['pt', cls], src: url, alt: '', draggable: 'false', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
}

/**
 * 글자 얼굴 칸 (토큰 · 벤치 · 유령 · 알약처럼 avatar 가 아닌 span)에 그림을 얹는다 / 바꾼다 / 뗀다. 글자(첫 텍스트)는 그대로 둔다.
 * @param {HTMLElement} el
 * @param {string|null} url
 * @returns {HTMLElement} el
 */
export function setFaceArt(el, url) {
  if (!el) return el;
  const old = [...el.children].find((c) => c.tagName === 'IMG' && c.classList.contains('pt')) || null;
  if (!url) {
    if (old) old.remove();
    el.classList.remove('has-art');
    return el;
  }
  el.classList.add('has-art');
  if (old && old.getAttribute('src') === url) return el;
  if (old) old.remove();
  el.append(artImg(url));
  return el;
}

// ---- 등급 ----
export const DEFAULT_THRESHOLDS = { S: 700, A: 600, B: 500, C: 400, D: 300, E: 200, F: 100, G: 0 };

export function gradeOf(value, thresholds) {
  const th = thresholds && typeof thresholds === 'object' ? thresholds : DEFAULT_THRESHOLDS;
  const v = Number(value) || 0;
  const list = Object.entries(th).sort((a, b) => b[1] - a[1]);
  for (const [g, t] of list) if (v >= t) return g;
  return list.length ? list[list.length - 1][0] : 'G';
}

export function gradeBadge(grade, size = '') {
  const g = grade || '-';
  return h('b', { class: ['grade', `grade-${g}`, size] }, g);
}

export function statBadge(value, thresholds) {
  const g = gradeOf(value, thresholds);
  return h('span', { class: 'stat' }, gradeBadge(g), h('span', { class: 'stat-num' }, Math.round(Number(value) || 0)));
}

export function pct(x, digits = 0) {
  const n = Number(x);
  if (!Number.isFinite(n)) return '-';
  return `${(n * 100).toFixed(digits)}%`;
}

export function signed(n) {
  const v = Math.round(Number(n) || 0);
  return v >= 0 ? `+${v}` : `${v}`;
}

export function fmtDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' });
  } catch (_) { return ''; }
}

// ---- 오버레이 (모달 / 하단 시트) ----
// 루트(#modal-root · #toast-root · #banner-root)는 index.html 의 고정 스테이지(#stage) 안에 있다 → 모달·토스트·컷인은 스테이지를 덮고 함께 커진다 (base.css).
// 크기: 기본 .modal = 400px (경기 결과 · 미니 카드). 아웃게임 가로 모달은 className 으로 'modal-md'(480) · 'modal-lg'(880) · 'modal-xl'(1120),
// 넓은 하단 시트는 kind: 'sheet' + className 'sheet-wide'(860) — base.css.
function overlayRoot() { return document.getElementById('modal-root'); }

export function openModal(content, { kind = 'modal', closable = true, onClose, className = '' } = {}) {
  const root = overlayRoot();
  if (!root) return { close() {}, el: null };
  const box = h('div', { class: [kind === 'sheet' ? 'sheet' : 'modal', className], role: 'dialog', 'aria-modal': 'true' }, content);
  const backdrop = h('div', { class: ['overlay', `overlay-${kind}`] }, box);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    if (typeof onClose === 'function') onClose();
  };
  if (closable) {
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  }
  root.append(backdrop);
  return { close, el: backdrop, box };
}

export function closeOverlays() {
  const root = overlayRoot();
  if (root) root.replaceChildren();
}

// ---- 토스트 ----
// 루트에는 4개까지 두고, 화면에는 최근 2개만 보인다 (base.css). 경기 화면은 오른쪽 위 좁은 칸 (match.css)
export function toast(message, kind = 'error', ms = 4000) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', { class: ['toast', `toast-${kind}`], role: 'status' }, String(message ?? ''));
  root.append(el);
  while (root.children.length > 4) root.firstChild.remove();
  setTimeout(() => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---- 컷인 배너 ----
export function banner(text, ms = 1000) {
  const root = document.getElementById('banner-root');
  if (!root) return;
  root.replaceChildren();
  const el = h('div', { class: 'cutin' }, h('div', { class: 'cutin-inner' }, String(text ?? '')));
  root.append(el);
  setTimeout(() => { el.classList.add('cutin-out'); setTimeout(() => el.remove(), 250); }, ms);
}

// ---- 공용 UI 조각 ----
// 가로 아웃게임 패널 (outgame.css .og-panel): 제목 줄(제목 + 오른쪽 부가 요소) + 내용.
// opts: { right, cls, bodyCls, scroll } — scroll 이면 내용 칸만 안쪽 스크롤 (.og-scroll)
export function panel(title, opts, ...children) {
  const { right = null, cls = '', bodyCls = '', scroll = false } = opts || {};
  const head = title || right
    ? h('div', { class: 'og-panel-head' },
      title ? h('h3', { class: 'og-panel-title' }, title) : h('span'),
      right)
    : null;
  return h('section', { class: ['og-panel', cls] }, head,
    h('div', { class: ['og-panel-body', scroll ? 'og-scroll' : '', bodyCls] }, ...children));
}

export function bar(ratio, className = '') {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  return h('span', { class: ['bar', className] }, h('i', { style: { width: `${Math.round(r * 100)}%` } }));
}

// options: [value, label, disabled?][]  — disabled 인 option 은 목록에 보이되 선택할 수 없다
export function select(options, value, onChange, attrs = {}) {
  const sel = h('select', { class: 'select', onchange: (e) => onChange(e.target.value), ...attrs },
    options.map(([v, label, disabled]) => h('option', { value: v, selected: String(v) === String(value), disabled: !!disabled }, label)));
  return sel;
}
