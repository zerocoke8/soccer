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

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function initialOf(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
}

export function avatar(color, name, size = 'md', extra = '') {
  return h('span', {
    class: ['avatar', `avatar-${size}`, extra],
    style: { background: color || '#4b5563' },
    title: name || '',
    'aria-label': name || '',
  }, initialOf(name));
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
export function section(title, ...children) {
  return h('section', { class: 'card' }, title ? h('h3', { class: 'card-title' }, title) : null, ...children);
}

export function keyValue(pairs) {
  return h('dl', { class: 'kv' }, pairs.map(([k, v]) => frag(h('dt', {}, k), h('dd', {}, v))));
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
