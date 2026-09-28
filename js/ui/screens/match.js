// js/ui/screens/match.js — 경기 화면 (phase "match")
//
// v0.2 (ARCHITECTURE §12.3 · GDD v0.4 §9.3~9.7, 9.13): 화면 위치 = 규칙 위치.
//  - 공·14명의 좌표, 역할, 구역 강조, 배너, 남은 수비는 전부 js/ui/layout.js computeLayout(view) 에서 온다.
//    결과 미리보기(outcomes)·패스 수신자(receiverPreview)는 엔진 getMatchView 값 그대로. 이 파일은 규칙을 다시 계산하지 않는다.
//  - 비트 루프 (setInterval 없음): step() → 새 비트 이벤트가 있으면 ① 액션 연출(공 이동) → ② 전원 재배치 → ③ 결과 한 줄
//    → 다음 step 예약. 연출 중에는 step 을 부르지 않는다. 결정 대기(수동·개입)면 재배치까지 보여준 뒤 멈춘다.
//  - 토큰 DOM 은 경기 화면이 살아 있는 동안 유지하고 transform 만 바꾼다 (CSS transition 으로 달려가는 연출).
import { h, avatar, openModal, closeOverlays, bar, banner, statBadge } from '../dom.js';
import { saveMatch } from '../store.js';
import { computeLayout, resolvePreview, ZONES } from '../layout.js';
import * as L from '../labels.js';

const BEAT_FALLBACK = ['kickoff', 'counter', 'duel', 'turnover', 'save', 'goal', 'penalty'];
const ACTION_BEATS = new Set(['duel', 'turnover', 'save', 'goal', 'penalty']);
// 1x 기준 ms. GDD §9.4 (v0.4 구현 조정): 액션 0.8 + 재배치 0.65 + 결과(읽는 시간) 0.95 ≈ 비트당 2.4초
// → 자동 1x 친선 약 35초 · 목표 경기 약 50초 (GDD §9.12 "자동 1x 40~60초"). 2x·4x 는 1/speed 로 비례 단축 (2x ≈ 비트당 1.2초).
const T = { act: 800, move: 650, result: 950, hold: 250, goal: 900, cutin: 900, start: 700, idle: 300 };
const TOKEN_RATIO = 0.075; // 토큰 지름 = 필드 폭 × 7.5% (§12.3)
const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_MARKS = ['①', '②', '③', '④'];
const NAMED_ROLES = new Set(['carrier', 'defender', 'receiver']);

let GEN = 0; // renderMatch 호출마다 증가 → 이전 경기 화면이 예약한 콜백을 무효화

export function renderMatch(root, ctx) {
  const { store, data, match, safe, actions } = ctx;
  const ui = store.matchUi;
  const cfg = data.config || {};
  const BEATS = new Set(Array.isArray(match.BEAT_TYPES) && match.BEAT_TYPES.length ? match.BEAT_TYPES : BEAT_FALLBACK);

  if (!store.match) {
    const setup = safe(() => ctx.run.getMatchSetup(store.run, data));
    if (!setup) { root.append(errorScreen('경기 정보를 불러올 수 없습니다.', ctx)); return; }
    const ms = safe(() => match.createMatch({
      data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
    }));
    if (!ms) { root.append(errorScreen('경기를 생성할 수 없습니다.', ctx)); return; }
    store.match = ms;
    saveMatch(ms);
    ui.intervene = false;
    ui.selectedSkillId = null;
    ui.resultShown = false;
  }
  ui.busy = false;

  const gen = ++GEN;

  /* ------------------------------------------------------------------ */
  /* DOM 골격 (한 번 만들고 부분 갱신)                                        */
  /* ------------------------------------------------------------------ */
  const screen = h('div', { class: 'screen match-screen', dataset: { screen: 'match' } });
  const hud = h('div', { class: 'mh' });
  const bannerEl = h('div', { class: 'm-banner', role: 'status', 'aria-live': 'polite' });
  const trackCells = STEP_MARKS.map((mk, i) => h('span', { class: 'trk', dataset: { step: String(i) }, title: `${mk} ${L.ATTACK_STEP_LABELS[i]}` }, mk));
  const track = h('div', { class: 'm-track', role: 'img' }, trackCells);
  const zoneEls = new Map();
  const bg = h('div', { class: 'pitch-bg' },
    ZONES.map((z) => {
      const el = h('div', {
        class: ['zone', `z${z.id}`],
        dataset: { zone: String(z.id) },
        style: { top: `${100 - z.to}%`, height: `${z.to - z.from}%` },
      }, h('span', { class: 'zone-name' }, z.name), h('span', { class: 'zone-hl' }));
      zoneEls.set(z.id, el);
      return el;
    }),
    h('div', { class: 'pl-half' }), h('div', { class: 'pl-circle' }),
    h('div', { class: 'pl-box top' }), h('div', { class: 'pl-box bottom' }),
    h('div', { class: 'pl-goal top' }), h('div', { class: 'pl-goal bottom' }),
    h('div', { class: 'pl-spot top' }), h('div', { class: 'pl-spot bottom' }));
  const trailG = svgEl('g', { class: 'g-trail' });
  const arrowG = svgEl('g', { class: 'g-arrow' });
  const svg = svgEl('svg', { class: 'pitch-svg', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('defs', {}, arrowMarker('mah-gold', '#ffd166'), arrowMarker('mah-white', '#ffffff')),
    trailG, arrowG);
  // 미리보기 글자(도착 구역 · 차단 액션 이름)는 토큰 위 층에 — 토큰이 없는 쪽을 골라 놓는다 (tipSpot)
  const tipG = svgEl('g', { class: 'g-tip' });
  const svgTop = svgEl('svg', { class: 'pitch-svg top', 'aria-hidden': 'true', focusable: 'false' }, tipG);
  const tokLayer = h('div', { class: 'tok-layer' });
  const ballEl = h('div', { class: 'm-ball', 'aria-hidden': 'true' }, h('span', {}, '⚽'));
  const popLayer = h('div', { class: 'pop-layer', 'aria-hidden': 'true' });
  const goalFx = h('div', { class: 'goal-fx', 'aria-hidden': 'true' });
  const pitch = h('div', { class: 'pitch' }, bg, tokLayer, ballEl, svg, svgTop, popLayer, goalFx);
  const pitchRow = h('div', { class: 'pitch-row' }, track, pitch);
  const info = h('div', { class: 'm-info' });
  const actGrid = h('div', { class: 'action-grid' });
  const skillRow = h('div', { class: 'skill-row' });
  const controls = h('div', { class: 'match-controls' });
  const log = h('div', { class: 'match-log', role: 'log', 'aria-label': '경기 로그' });
  screen.append(hud, bannerEl, pitchRow, info, actGrid, skillRow, controls, log);
  root.append(screen);

  /* ------------------------------------------------------------------ */
  /* 상태                                                                 */
  /* ------------------------------------------------------------------ */
  let W = 340;
  let H = 470;
  let tokPx = 26;
  let curL = null;      // 지금 화면에 그려진 레이아웃
  let curView = null;   // curL 을 만든 view
  let busy = false;     // 비트 연출 중
  let bannerKey = null;
  let arrowFor = null;
  let finishing = false;
  let resizePending = false; // 연출 중 resize → 비트가 끝나면 다시 잰다
  const tokEls = new Map();
  const timers = new Set();
  const reduced = prefersReducedMotion();

  const alive = () => gen === GEN && screen.isConnected;
  const fx = () => 1 / (Number(ui.speed) || 1);
  const isFinished = () => safe(() => match.isFinished(store.match)) === true;
  const getView = () => safe(() => match.getMatchView(store.match, data, 'home'));
  const paused = (view) => !!(view?.needsDecision && (!ui.auto || ui.intervene));
  const canDecideNow = (view) => !busy && !isFinished() && paused(view);

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive()) fn(); }, Math.max(0, ms));
    timers.add(id);
    return id;
  }
  function cancelTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
  }
  function setBusy(v) { busy = v; ui.busy = v; }

  /* ------------------------------------------------------------------ */
  /* 좌표                                                                 */
  /* ------------------------------------------------------------------ */
  function measure() {
    const w = pitch.clientWidth;
    const hh = pitch.clientHeight;
    if (w > 40 && hh > 40) { W = w; H = hh; } // jsdom 등 레이아웃이 없으면 기본값
    tokPx = Math.round(Math.min(34, Math.max(20, W * TOKEN_RATIO)));
    pitch.style.setProperty('--tok', `${tokPx}px`);
    svg.setAttribute('viewBox', `0 0 ${round1(W)} ${round1(H)}`);
    svgTop.setAttribute('viewBox', `0 0 ${round1(W)} ${round1(H)}`);
  }
  /** 화면에 그릴 미리보기: 사람이 고르는 중이면 토글한 스킬의 변형, 자동 진행 중이면 확정할 수 없는 패스 후보를 뺀다 */
  function shownView(view) {
    if (!view) return view;
    const deciding = paused(view);
    return resolvePreview(view, { skillId: deciding ? ui.selectedSkillId : null, deciding });
  }
  function layoutFor(view) {
    if (!view) return null;
    measure();
    // 겹침 방지 간격 = 토큰 지름 + 팀 링(2px×2) → 링끼리도 닿지 않게
    return safe(() => computeLayout(shownView(view), { aspect: W / H, tokenSize: (tokPx + 4) / W })) || null;
  }
  /** 지금 view 로 다시 배치 (스킬 토글 · 자동/개입 전환 · resize). 보던 미리보기 화살표도 새 좌표로 */
  function relayout({ anim = !reduced } = {}) {
    if (!curView) return;
    const Lay = layoutFor(curView);
    if (!Lay) return;
    applyLayout(Lay, curView, { anim });
    const keep = arrowFor;
    hideArrow();
    if (keep) showArrow(keep);
  }
  const PX = (x) => (x / 100) * W;
  const PY = (y) => ((100 - y) / 100) * H; // y: 0 = home 골(아래) … 100 = away 골(위)
  const tokOf = (Lay, id, side) => (Lay && id != null ? Lay.tokens.find((t) => t.id === id && (!side || t.side === side)) : null) || null;

  /* ------------------------------------------------------------------ */
  /* 토큰 / 공 / 구역 / 트랙                                                 */
  /* ------------------------------------------------------------------ */
  function tokenEl(t) {
    const key = `${t.side}:${t.id}`;
    let el = tokEls.get(key);
    if (el) return el;
    const face = h('span', { class: 'tok-face', style: { background: t.portraitColor || '#4b5563' } }, initialOf(t.name));
    const barI = h('i');
    const nameEl = h('span', { class: 'tok-name' }, t.name);
    const bubble = h('span', { class: 'tok-bubble' });
    const open = () => openCard(t.side, t.id);
    el = h('div', {
      class: ['tok', t.side],
      role: 'button',
      tabindex: '0',
      dataset: { side: t.side, id: t.id },
      onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
    }, face, h('span', { class: 'tok-bar' }, barI), nameEl, t.isYouth ? h('span', { class: 'tok-yu' }, '유') : null, bubble);
    el._bar = barI;
    el._bubble = bubble;
    tokLayer.append(el);
    tokEls.set(key, el);
    return el;
  }

  /* 라벨 · 말풍선 · 결과 한 줄 · 미리보기 글자의 자리 고르기 (픽셀 박스 {l,r,t,b}).
     토큰끼리는 layout.js 가 겹치지 않게 놓지만, 그 위에 붙는 글자는 이웃 토큰을 가릴 수 있다 → 후보 자리 중
     다른 토큰 · 공 · 이미 놓인 글자와 겹치지 않는 첫 자리 (없으면 가장 덜 겹치는 자리). */
  // 가리면 안 되는 정도(w): 듀얼 당사자·패스 후보 2, 보통 1, 뚫린(반투명) 선수 0.35
  const TAG_WEIGHT = { carrier: 2, defender: 2, receiver: 2, broken: 0.35 };
  function tokenRect(t) {
    const cx = PX(t.x);
    const cy = PY(t.y);
    const r = tokPx / 2 + 2; // 팀 링 포함
    return { l: cx - r, r: cx + r, t: cy - r, b: cy + r + 5, w: TAG_WEIGHT[t.role] ?? 1 }; // + 체력 바
  }
  function ballRect(Lay) {
    const [bx, by] = ballPx(Lay.ball.x, Lay.ball.y, Lay.mode === 'play' && Lay.carrierId ? Lay.attackingSide : null);
    return { l: bx - 7, r: bx + 7, t: by - 8, b: by + 8, w: 1.5 };
  }
  function spotScore(box, obstacles) {
    let s = 0;
    for (const o of obstacles) s += rectOverlap(box, o) * (o.w ?? 1);
    const inside = rectOverlap(box, { l: 0, r: W, t: 0, b: H });
    const area = (box.r - box.l) * (box.b - box.t);
    return s + (area - inside) * 2; // 필드 밖으로 나가는 부분은 두 배로 싫다
  }
  function pickSpot(cands, obstacles) {
    let best = null;
    let bestScore = Infinity;
    for (const c of cands) {
      const sc = spotScore(c.box, obstacles);
      if (sc <= 1) return c;
      if (sc < bestScore - 0.5) { best = c; bestScore = sc; }
    }
    return best;
  }

  /** 이름 라벨 후보 (선호 순): 듀얼 상대(와 패스 길) 반대편 = 공격 방향 기준 바깥쪽 → 좌우로 비낀 자리 → 반대편 → 옆 */
  function labelCands(t, Lay) {
    const home = Lay.attackingSide === 'home';
    const pref = t.role === 'carrier' ? (home ? 'down' : 'up') : home ? 'up' : 'down';
    const other = pref === 'up' ? 'down' : 'up';
    const cx = PX(t.x);
    const cy = PY(t.y);
    const r = tokPx / 2;
    const w = textWidth(t.name, 10) + 8;
    const vBox = (v) => (v === 'up' ? { t: cy - r - 17, b: cy - r - 3 } : { t: cy + r + 7, b: cy + r + 21 });
    const hBox = (hz) => (hz === 'c' ? { l: cx - w / 2, r: cx + w / 2 } : hz === 'l' ? { l: cx - w + 4, r: cx + 4 } : { l: cx - 4, r: cx - 4 + w });
    const out = [];
    for (const v of [pref, other]) for (const hz of ['c', 'l', 'r']) out.push({ v, hz, box: { ...vBox(v), ...hBox(hz) } });
    out.push({ v: 'side', hz: 'c', box: { l: cx + r + 5, r: cx + r + 5 + w, t: cy - 7, b: cy + 7 } });
    out.push({ v: 'side-l', hz: 'c', box: { l: cx - r - 5 - w, r: cx - r - 5, t: cy - 7, b: cy + 7 } });
    return out;
  }
  /** 의도 말풍선 후보: 토큰 위 오른쪽(기본) → 위 왼쪽 → 옆 오른쪽 → 옆 왼쪽 → 아래 오른쪽 → 아래 왼쪽 */
  function bubbleCands(t, text) {
    const cx = PX(t.x);
    const cy = PY(t.y);
    const r = tokPx / 2;
    const bw = textWidth(text, 13) + 12;
    const up = { t: cy - r - 19, b: cy - r - 3 };
    const mid = { t: cy - 8, b: cy + 8 };
    const dn = { t: cy + r + 8, b: cy + r + 24 };
    return [
      { cls: '', box: { l: cx + 5, r: cx + 5 + bw, ...up } },
      { cls: 'bub-l', box: { l: cx - 5 - bw, r: cx - 5, ...up } },
      { cls: 'bub-s', box: { l: cx + r + 4, r: cx + r + 4 + bw, ...mid } },
      { cls: 'bub-s bub-l', box: { l: cx - r - 4 - bw, r: cx - r - 4, ...mid } },
      { cls: 'bub-d', box: { l: cx + 5, r: cx + 5 + bw, ...dn } },
      { cls: 'bub-d bub-l', box: { l: cx - 5 - bw, r: cx - 5, ...dn } },
    ];
  }

  /** 이름 라벨(carrier · defender · receiver)과 의도 말풍선의 자리: key → { label: 'lbl-…' 클래스, bubble: 'bub-…' 클래스 } */
  function placeTags(Lay, bubbleKey, bubbleText) {
    const rects = new Map(Lay.tokens.map((t) => [`${t.side}:${t.id}`, tokenRect(t)]));
    const ball = ballRect(Lay);
    const taken = []; // 이미 놓인 글자
    const obstaclesFor = (key) => [...[...rects].filter(([k]) => k !== key).map(([, r]) => r), ball, ...taken];
    const out = new Map();
    const bubTok = bubbleKey ? Lay.tokens.find((t) => `${t.side}:${t.id}` === bubbleKey) : null;
    if (bubTok && bubbleText) {
      const pick = pickSpot(bubbleCands(bubTok, bubbleText), obstaclesFor(bubbleKey));
      out.set(bubbleKey, { label: '', bubble: pick.cls });
      taken.push({ ...pick.box, w: 1.5 });
    }
    const order = ['carrier', 'defender', 'receiver'];
    const named = Lay.tokens.filter((t) => NAMED_ROLES.has(t.role)).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    for (const t of named) {
      const key = `${t.side}:${t.id}`;
      const pick = pickSpot(labelCands(t, Lay), obstaclesFor(key));
      const cls = [pick.v !== 'down' ? `lbl-${pick.v}` : '', pick.hz === 'l' ? 'lbl-sl' : pick.hz === 'r' ? 'lbl-sr' : ''].filter(Boolean).join(' ');
      out.set(key, { label: cls, bubble: out.get(key)?.bubble ?? '' });
      taken.push({ ...pick.box, w: 1.5 });
    }
    return out;
  }

  function tokenClass(t, tag) {
    const named = NAMED_ROLES.has(t.role);
    return [
      'tok', t.side, `role-${t.role}`,
      named ? 'named' : '',
      named && tag?.label ? tag.label : '',
      tag?.bubble || '',
      t.staminaRatio <= 0.2 ? 'low' : '',
      t.isYouth ? 'youth' : '',
      t.role === 'broken' ? (t.side === 'home' ? 'chase-down' : 'chase-up') : '',
    ].filter(Boolean).join(' ');
  }

  function place(el, x, y) {
    el.style.transform = `translate(${round1(PX(x))}px, ${round1(PY(y))}px)`;
  }

  function applyLayout(Lay, view, { anim = true } = {}) {
    if (!Lay) return;
    curL = Lay;
    curView = view;
    if (!anim) pitch.classList.add('no-anim');
    const seen = new Set();
    const ii = intentInfo(view);
    const oppKey = oppDuelKey(view);
    const tags = placeTags(Lay, ii.bubble ? oppKey : null, ii.bubble);
    for (const t of Lay.tokens) {
      const key = `${t.side}:${t.id}`;
      seen.add(key);
      const el = tokenEl(t);
      el.className = tokenClass(t, tags.get(key));
      el.dataset.role = t.role;
      el.dataset.x = String(round1(t.x));
      el.dataset.y = String(round1(t.y));
      el.setAttribute('aria-label', `${t.side === 'home' ? '우리' : '상대'} ${t.slot ?? t.position} ${t.name} — ${L.TOKEN_ROLE_LABELS[t.role] ?? t.role}`);
      place(el, t.x, t.y);
      el._bar.style.width = `${Math.round(clamp01(t.staminaRatio) * 100)}%`;
      const bub = key === oppKey && ii.bubble ? ii.bubble : '';
      el._bubble.textContent = bub;
      el._bubble.title = bub ? ii.text : '';
      el.classList.toggle('has-bubble', !!bub);
    }
    for (const [key, el] of tokEls) if (!seen.has(key)) el.classList.add('gone');
    placeBall(Lay);
    updateZones(Lay);
    updateTrack(Lay);
    if (!anim) {
      void pitch.offsetWidth; // 트랜지션 없이 즉시 반영
      pitch.classList.remove('no-anim');
    }
  }

  /** 공: play 모드에서 공 가진 선수가 있으면 발 앞(공격 방향)으로 살짝 — 얼굴을 가리지 않게. 승부차기·골문 안은 그대로 */
  function placeBall(Lay) {
    ballEl.dataset.x = String(round1(Lay.ball.x));
    ballEl.dataset.y = String(round1(Lay.ball.y));
    placeBallAt(Lay.ball.x, Lay.ball.y, Lay.mode === 'play' && Lay.carrierId ? Lay.attackingSide : null);
  }
  function ballPx(x, y, frontOf = null) {
    let dx = 0;
    let dy = 0;
    if (frontOf) {
      dx = tokPx * 0.42;
      dy = (frontOf === 'home' ? -1 : 1) * tokPx * 0.42;
    }
    return [PX(x) + dx, PY(y) + dy];
  }
  function placeBallAt(x, y, frontOf = null) {
    const [bx, by] = ballPx(x, y, frontOf);
    ballEl.style.transform = `translate(${round1(bx)}px, ${round1(by)}px)`;
  }

  function updateZones(Lay) {
    const hl = Lay.highlight || {};
    for (const [id, el] of zoneEls) {
      el.classList.remove('hl-danger', 'hl-crisis', 'hl-chance', 'hl-shotChance', 'ball-zone');
      const lbl = el.querySelector('.zone-hl');
      if (lbl) lbl.textContent = '';
      if (id === Lay.zone) el.classList.add('ball-zone');
      if (hl.level && id === hl.zone) {
        el.classList.add(`hl-${hl.level}`);
        if (lbl) lbl.textContent = hl.label || '';
      }
    }
    pitch.dataset.zone = String(Lay.zone);
  }

  /** 공격 진행 트랙: 단계 i 칸을 그 단계의 구역 높이에 맞춰 세운다 (home: Z2→Z5 위로, away: Z4→Z1 아래로) */
  function updateTrack(Lay) {
    const tr = Lay.track || { side: 'home', step: 0, dir: 'up' };
    trackCells.forEach((cell, i) => {
      const zone = tr.side === 'away' ? 4 - i : i + 2;
      const z = ZONES[zone - 1];
      cell.style.top = `${100 - z.to}%`;
      cell.style.height = `${z.to - z.from}%`;
      const on = Lay.mode === 'penalties' ? i === tr.step : i <= tr.step; // 승부차기: ④ 만
      cell.className = ['trk', tr.side, on ? 'on' : '', i === tr.step ? 'cur' : ''].filter(Boolean).join(' ');
    });
    track.className = ['m-track', tr.side, tr.dir].join(' ');
    track.setAttribute('aria-label', `공격 진행 ${tr.side === 'home' ? '우리' : '상대'} ${STEP_MARKS[tr.step] ?? ''} ${L.ATTACK_STEP_LABELS[tr.step] ?? ''}`);
  }

  /** 상황 배너: 구역(또는 공격 팀·포제션)이 바뀔 때만 갱신 (GDD §9.5-3) */
  function updateBanner(Lay, view, force = false) {
    if (!Lay) return;
    const text = Lay.banner || view?.lineLabel || '';
    const key = Lay.mode === 'penalties' || view?.finished
      ? `${Lay.mode}|${view?.finished ? 'end' : ''}|${text}`
      : `${Lay.attackingSide}|${Lay.zone}|${view?.possession ?? ''}`;
    if (!force && key === bannerKey) return;
    bannerKey = key;
    const lv = Lay.highlight?.level;
    bannerEl.className = ['m-banner', lv ? `lv-${lv}` : '', `side-${Lay.attackingSide}`].filter(Boolean).join(' ');
    bannerEl.textContent = text;
    bannerEl.title = text;
    void bannerEl.offsetWidth;
    bannerEl.classList.add('fresh');
  }

  /* ------------------------------------------------------------------ */
  /* 의도 표시                                                             */
  /* ------------------------------------------------------------------ */
  function intentInfo(view) {
    if (!view) return { ico: '⏳', text: '', bubble: null };
    if (view.finished) return { ico: '🏁', text: '경기 종료', bubble: null };
    if (view.phase === 'penalties') return { ico: '🥅', text: '승부차기 — 키커 vs GK (자동)', bubble: null };
    const intent = view.intent;
    const cands = Array.isArray(intent?.candidates) ? intent.candidates : [];
    if (intent?.countered) {
      // 상대 AI 가 reveal 스킬을 썼다: 우리 선택을 읽고 카운터한다 (엔진 intent.countered)
      return { ico: '👁', text: '상대가 우리 의도를 읽고 있음 — 카운터 주의', bubble: '👁' };
    }
    if (intent && intent.level !== 'none' && cands.length) {
      if (intent.level === 'full') {
        return { ico: L.ACTION_ICONS[cands[0]] ?? '🎯', text: `상대 의도: ${L.ACTION_LABELS[cands[0]] ?? cands[0]}`, bubble: L.ACTION_ICONS[cands[0]] ?? '!' };
      }
      return {
        ico: '❔',
        text: `상대 의도: ${cands.map((a) => L.ACTION_LABELS[a] ?? a).join(' 또는 ')}`,
        bubble: cands.map((a) => L.ACTION_ICONS[a] ?? '?').join('/'),
      };
    }
    if (intent && intent.level === 'none') return { ico: '🙈', text: '상대 의도 비공개', bubble: '?' };
    if (view.needsDecision) return { ico: '🙈', text: '상대 의도 정보 없음', bubble: null };
    return { ico: '⏳', text: view.lineLabel ?? '진행 중', bubble: null };
  }

  /** 의도 말풍선을 달 상대 듀얼 토큰: 우리 공격이면 상대 수비수, 우리 수비면 상대 carrier */
  function oppDuelKey(view) {
    if (!view || view.finished || view.phase !== 'decision') return null;
    const human = view.humanSide || 'home';
    const opp = human === 'home' ? 'away' : 'home';
    const id = view.attackingSide === human ? view.defender?.id : view.carrier?.id;
    return id ? `${opp}:${id}` : null;
  }

  /* ------------------------------------------------------------------ */
  /* 패널 (스코어 · 정보 · 액션 · 스킬 · 컨트롤 · 로그)                          */
  /* ------------------------------------------------------------------ */
  function drawPanels(view) {
    const finished = isFinished();
    const canDecide = !busy && !finished && paused(view);
    drawHud(view, finished);
    drawInfo(view, canDecide);
    drawActions(view, canDecide, finished);
    drawSkills(view, canDecide);
    drawControls(finished, canDecide);
    drawLog();
  }

  function drawHud(view, finished) {
    const ms = store.match || {};
    const score = view?.score || ms.score || { home: 0, away: 0 };
    const kind = view?.kind ?? ms.kind;
    const stage = view?.stage ?? ms.stage;
    const pen = view?.penalties ?? null;
    const atk = view?.attackingSide ?? ms.attackingSide;
    const tMax = view?.tensionMax ?? cfg.match?.tension?.max ?? 100;
    const penMode = curL?.mode === 'penalties';
    const sub = [
      L.KIND_LABELS[kind] ?? kind ?? '',
      `포제션 ${view?.possession ?? ms.possession ?? '-'}/${view?.possessionsTotal ?? ms.possessionsTotal ?? '-'}`,
      stage === 'extraTime' ? '연장' : null,
      pen ? `승부차기 ${pen.home ?? 0}:${pen.away ?? 0}${pen.suddenDeath ? ' 서든데스' : ''}` : null,
      finished ? '경기 종료' : penMode ? null : atk === 'home' ? '우리 공격' : '상대 공격',
    ].filter(Boolean).join(' · ');
    const team = (side, name, tension) => {
      const val = Math.round(Number(tension) || 0);
      const b = bar((Number(tension) || 0) / (tMax || 100), `tension ${side}`);
      return h('div', { class: ['mh-team', side] },
        h('span', { class: 'nm ellipsis' }, name),
        h('span', { class: 'mh-ten', title: `텐션 ${val}/${tMax}` },
          side === 'home' ? [h('span', {}, '텐션'), b, h('b', {}, val)] : [h('b', {}, val), b, h('span', {}, '텐션')]));
    };
    hud.replaceChildren(
      team('home', ms.home?.name ?? view?.names?.home ?? '우리 클럽', view?.tension?.home ?? ms.home?.tension),
      h('div', { class: 'mh-score' }, `${score.home ?? 0} : ${score.away ?? 0}`),
      team('away', ms.away?.name ?? view?.names?.away ?? '상대', view?.tension?.away ?? ms.away?.tension),
      h('div', { class: 'mh-sub' }, sub));
  }

  function drawInfo(view, canDecide) {
    const ii = intentInfo(view);
    // 결정 차례는 액션 버튼 테두리(금색)로 알린다. 배지는 개입 대기일 때만 (정보 줄 폭을 의도·남은 수비에 쓴다)
    const badge = !canDecide && ui.auto && ui.intervene && !isFinished() ? h('span', { class: 'badge badge-accent' }, '개입 대기') : null;
    info.classList.toggle('deciding', canDecide);
    info.replaceChildren(
      h('span', { class: 'intent', title: ii.text }, badge, h('span', { class: 'ico' }, ii.ico), h('span', { class: 'ellipsis' }, ii.text)),
      h('span', { class: 'remain' }, curL?.remainingText ?? view?.remaining?.text ?? ''));
  }

  function drawActions(view, canDecide, finished) {
    const penMode = curL?.mode === 'penalties';
    const role = view?.needsDecision ?? (view?.attackingSide === (view?.humanSide || 'home') ? 'attack' : 'defense');
    actGrid.classList.toggle('deciding', canDecide);
    if (finished || penMode) {
      // 고를 액션이 없는 구간: 한 칸짜리 상태 표시
      const pen = view?.penalties;
      actGrid.replaceChildren(h('button', { class: 'btn act-btn act-wide', type: 'button', disabled: true },
        h('span', { class: 'act-title' }, finished ? '🏁 경기 종료' : '🥅 승부차기 — 자동 진행'),
        h('span', { class: 'btn-sub' }, finished
          ? '결과를 확인하세요'
          : `키커 vs GK · ${pen ? `${pen.home ?? 0} : ${pen.away ?? 0}${pen.suddenDeath ? ' · 서든데스' : ''}` : ''}`)));
      return;
    }
    const fallback = (role === 'defense' ? L.ACTIONS_DEFENSE_FALLBACK : L.ACTIONS_ATTACK_FALLBACK)
      .map((a) => ({ action: a, enabled: false, label: L.ACTION_LABELS[a], hint: '' }));
    const acts = Array.isArray(view?.actions) && view.actions.length ? view.actions.slice(0, 3) : fallback;
    actGrid.replaceChildren(...acts.map((a) => actionButton(a, role, canDecide, view)));
  }

  function actionButton(a, role, canDecide, view) {
    const enabled = canDecide && a.enabled !== false;
    const label = a.label ?? L.ACTION_LABELS[a.action] ?? a.action;
    // 결과 미리보기는 결정 대기(수동)에서만 (§12.3). 공격 label 은 접두어가 없고, 수비 label 은 "막으면 —/뚫리면 —" 로 시작한다.
    // 위치를 바꾸는 스킬(라인 브레이커 · 소매치기)을 토글했으면 그 스킬을 함께 쓴 결과 (엔진 outcomesBySkill)
    const out = enabled ? shownView(view)?.outcomes?.[a.action] ?? null : null;
    const lines = [];
    if (out) {
      const [ps, pf] = role === 'attack' ? ['성공: ', '실패: '] : ['', ''];
      lines.push(h('span', { class: ['act-out', 'ok', out.success?.goal ? 'goal' : ''] }, `${ps}${out.success?.label ?? ''}`));
      lines.push(h('span', { class: ['act-out', 'ng', out.fail?.conceded || out.fail?.goalRisk ? 'risk' : ''] }, `${pf}${out.fail?.label ?? ''}`));
    } else if (a.hint) {
      lines.push(h('span', { class: 'btn-sub' }, a.hint));
    }
    const title = [
      label, a.hint,
      out ? `${role === 'attack' ? '성공: ' : ''}${out.success?.label ?? ''}` : null,
      out ? `${role === 'attack' ? '실패: ' : ''}${out.fail?.label ?? ''}` : null,
    ].filter(Boolean).join('\n');
    return h('button', {
      class: ['btn', 'act-btn', enabled ? 'decide' : ''],
      type: 'button',
      disabled: !enabled,
      dataset: { action: a.action },
      title,
      onclick: () => decide(a.action),
      onpointerenter: (e) => { if (!e.pointerType || e.pointerType === 'mouse') showArrow(a.action); },
      onpointerdown: () => showArrow(a.action),
      onpointerleave: () => hideArrow(a.action),
      onpointercancel: () => hideArrow(a.action),
      onfocus: () => showArrow(a.action),
      onblur: () => hideArrow(a.action),
    }, h('span', { class: 'act-title' }, `${L.ACTION_ICONS[a.action] ?? ''} ${label}`), ...lines);
  }

  function drawSkills(view, canDecide) {
    const skills = Array.isArray(view?.skills) ? view.skills : [];
    if (!skills.length) {
      skillRow.replaceChildren(h('span', { class: 'tiny muted' }, curL?.mode === 'penalties' ? '승부차기 중에는 스킬을 쓸 수 없음' : '사용 가능한 액티브 스킬 없음'));
      return;
    }
    skillRow.replaceChildren(...skills.map((s) => h('button', {
      class: ['btn', 'btn-sm', 'sk-btn', ui.selectedSkillId === s.skillId ? 'active' : ''],
      type: 'button',
      disabled: !canDecide || s.enabled === false,
      dataset: { skill: s.skillId },
      'aria-pressed': ui.selectedSkillId === s.skillId ? 'true' : 'false',
      title: [s.description, s.enabled === false && s.reason ? `(${s.reason})` : null].filter(Boolean).join(' '),
      onclick: () => {
        if (busy || !canDecideNow(getView())) return;
        // reveal 계열은 { skillId } 단독 결정으로 즉시 발동(계약 §11.1): 엔진이 결정 대기를 유지하고 view.intent 가 full 로 갱신되어
        // 의도를 본 뒤 액션을 고를 수 있다. 다른 액티브는 토글 후 액션과 함께 제출.
        if (s.effect === 'reveal') { doStep({ skillId: s.skillId }); return; }
        ui.selectedSkillId = ui.selectedSkillId === s.skillId ? null : s.skillId;
        // 라인 브레이커 등: 패스 후보·도착 구역이 바뀌므로 필드도 다시 그린다 (미리보기 = 실제)
        relayout();
        drawPanels(curView);
      },
    },
    h('span', { class: 'sk-nm ellipsis' }, `${s.kind === 'unique' ? '✨' : '⚡'} ${s.name ?? s.skillId}`),
    h('span', { class: 'sk-cost' }, `텐션 ${s.tension ?? 0}`))));
  }

  /**
   * 컨트롤(자동 · 배속 · 개입) 변경 후 다시 그리기. 비트 연출 중에는 컨트롤과 정보 줄만 — 스코어·로그·필드는 연출 단계가
   * 갱신한다 (연출 중 curView 는 아직 판정 전 view 라 스코어가 되돌아가거나 결과가 연출보다 먼저 보이면 안 된다).
   */
  function refreshControls() {
    if (busy) {
      drawControls(isFinished(), false);
      drawInfo(curView, false);
      return;
    }
    relayout(); // 자동 ↔ 수동 전환: 패스 후보 표시(확정/불확실)가 바뀔 수 있다
    drawPanels(curView);
  }

  function drawControls(finished, canDecide = false) {
    const intervening = ui.auto && ui.intervene; // 개입은 자동 진행 중에만 의미가 있다
    controls.replaceChildren(
      h('button', {
        class: ['btn', 'auto-btn', ui.auto ? 'active' : ''],
        type: 'button',
        'aria-pressed': ui.auto ? 'true' : 'false',
        disabled: finished,
        onclick: () => {
          ui.auto = !ui.auto;
          ui.intervene = false; // 켜든 끄든 개입 대기는 해제 (자동 OFF 면 매 결정이 이미 수동)
          hideArrow();
          refreshControls();
          schedule(T.idle * fx());
        },
      }, ui.auto ? '자동 ON' : '자동 OFF'),
      h('span', { class: 'speed', role: 'group', 'aria-label': '배속' }, [1, 2, 4].map((sp) =>
        h('button', {
          class: ['btn', ui.speed === sp ? 'active' : ''],
          type: 'button',
          'aria-pressed': ui.speed === sp ? 'true' : 'false',
          onclick: () => { ui.speed = sp; refreshControls(); },
        }, `${sp}x`))),
      h('button', {
        class: ['btn', 'grow', intervening ? 'active' : ''],
        type: 'button',
        disabled: !ui.auto || finished,
        title: '다음 결정 차례에서 멈추고 직접 고른다',
        onclick: () => { ui.intervene = !ui.intervene; refreshControls(); schedule(T.idle * fx()); },
      }, intervening ? (canDecide ? '직접 선택 중' : '개입 대기…') : '개입'),
      h('button', { class: 'btn', type: 'button', disabled: finished, title: '결과까지 스킵', 'aria-label': '결과까지 스킵', onclick: skip }, '⏭'));
  }

  function drawLog() {
    const evs = (Array.isArray(store.match?.events) ? store.match.events : []).slice(-30);
    log.replaceChildren(...(evs.length
      ? evs.map((e) => h('div', { class: ['log-line', e.side ?? '', e.success ? 'success' : '', e.type ?? ''], title: e.text ?? '' },
        `${e.possession != null ? `[${e.possession}] ` : ''}${e.text ?? ''}`))
      : [h('div', { class: 'log-line' }, '킥오프 대기')]));
    log.scrollTop = log.scrollHeight;
  }

  /* ------------------------------------------------------------------ */
  /* 결과 미리보기 화살표 (결정 대기 · 수동에서만)                               */
  /* ------------------------------------------------------------------ */
  function showArrow(action) {
    const view = curView;
    if (!curL || !view || !canDecideNow(view)) return;
    const a = (view.actions || []).find((x) => x.action === action);
    if (!a || a.enabled === false) return;
    arrowFor = action;
    drawArrow(action, shownView(view)?.outcomes?.[action] ?? null, view.needsDecision);
  }
  function hideArrow(action) {
    if (action && arrowFor !== action) return;
    arrowFor = null;
    arrowG.replaceChildren();
    tipG.replaceChildren();
    pitch.classList.remove('previewing', 'previewing-def');
  }

  function drawArrow(action, out, role) {
    arrowG.replaceChildren();
    tipG.replaceChildren();
    const Lay = curL;
    const atk = Lay.attackingSide;
    const def = atk === 'home' ? 'away' : 'home';
    const C = tokOf(Lay, Lay.carrierId, atk) || Lay.ball;
    const c = [PX(C.x), PY(C.y)];
    const rTok = tokPx / 2 + 3;
    const zoneName = (z) => ZONES[(z ?? 0) - 1]?.name ?? '';
    pitch.classList.add('previewing');

    if (role === 'attack') {
      let to = null;
      let dashed = false;
      let endGap = 0;
      let tip = '';
      if (action === 'dribble' && Lay.nextBall) {
        to = Lay.nextBall;
        tip = zoneName(out?.success?.zone);
      } else if (action === 'pass') {
        to = tokOf(Lay, Lay.receiverId, atk);
        dashed = true;
        endGap = rTok;
        // 받는 선수 이름은 토큰 라벨에 이미 있으므로, 궤적 가운데에 도착 구역만
        if (to) {
          const t2 = [PX(to.x), PY(to.y)];
          arrowLine(c, t2, { startGap: rTok, endGap, dashed, color: '#ffd166', marker: 'mah-gold', cls: 'ar-pass' });
          const z = zoneName(out?.success?.zone);
          if (z) arrowTip(lerp2(c, t2, 0.5), `→ ${z}`, c);
        }
        return;
      } else if (action === 'shoot') {
        to = { x: Lay.goal.x, y: Lay.goal.y >= 50 ? 99 : 1 };
        tip = '골문';
      }
      if (!to) return;
      const t = [PX(to.x), PY(to.y)];
      arrowLine(c, t, { startGap: rTok, endGap, dashed, color: '#ffd166', marker: 'mah-gold', cls: `ar-${action}` });
      if (tip) arrowTip(t, tip, c);
      return;
    }

    // 수비: 상대 carrier 앞 차단 표시 — 막으려는 길(드리블 길 / 패스 길 / 슛 길)을 흰 점선으로, 우리 수비가 끊는 지점에 빨간 ✕
    pitch.classList.add('previewing-def'); // 미리보기 동안 우리 수비수 이름표를 접어 ✕ 자리를 비운다
    const D = tokOf(Lay, Lay.defenderId, def);
    const d = D ? [PX(D.x), PY(D.y)] : null;
    const goal = [PX(Lay.goal.x), PY(Lay.goal.y >= 50 ? 99 : 1)];
    const R = action === 'intercept' ? tokOf(Lay, Lay.receiverId, atk) : null;
    let pathTo;
    let endGap = 0;
    let cut;
    if (R) {
      pathTo = [PX(R.x), PY(R.y)];
      endGap = rTok;
      cut = lerp2(c, pathTo, 0.5);
    } else {
      pathTo = action === 'block' || !Lay.nextBall ? goal : [PX(Lay.nextBall.x), PY(Lay.nextBall.y)];
      const v = sub2(pathTo, c);
      const len = Math.hypot(v[0], v[1]) || 1;
      // 수비수 바로 뒤(골 쪽) — 수비수 얼굴을 가리지 않게 토큰 1.6개만큼
      const base = d ? projectOn(c, pathTo, d) : lerp2(c, pathTo, 0.3);
      const along = Math.min(0.85, (Math.hypot(base[0] - c[0], base[1] - c[1]) + tokPx * 1.6) / len);
      cut = lerp2(c, pathTo, along);
    }
    arrowLine(c, pathTo, { startGap: rTok, endGap, dashed: true, color: '#ffffff', marker: 'mah-white', cls: 'ar-lane', opacity: 0.75 });
    crossMark(cut, tokPx * 0.4);
    sideLabel(cut, L.ACTION_LABELS[action] ?? action, tokPx * 0.7);
  }

  /** 미리보기 글자 한 줄을 토큰 위 층에: 후보 자리 중 토큰이 없는 첫 자리 (없으면 가장 덜 가리는 자리) */
  function tipText(cands, text, cls) {
    const w = textWidth(text, 11) + 4;
    const boxOf = (c) => {
      const l = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
      return { l, r: l + w, t: c.y - 11, b: c.y + 3 };
    };
    const obstacles = (curL?.tokens || []).map(tokenRect);
    const pick = pickSpot(cands.map((c) => ({ ...c, box: boxOf(c) })), obstacles) || { ...cands[0] };
    const el = svgEl('text', { x: round1(pick.x), y: round1(pick.y), class: cls, 'text-anchor': pick.anchor });
    el.textContent = text;
    tipG.append(el);
  }

  function sideLabel(p, text, off) {
    // ✕ 옆 차단 액션 이름: 오른쪽 → 왼쪽 → 위 → 아래 중 토큰이 없는 쪽
    const rightFirst = p[0] < W * 0.62;
    const R = { x: p[0] + off, y: p[1] + 4, anchor: 'start' };
    const Lf = { x: p[0] - off, y: p[1] + 4, anchor: 'end' };
    tipText([rightFirst ? R : Lf, rightFirst ? Lf : R,
      { x: p[0], y: p[1] - off - 2, anchor: 'middle' }, { x: p[0], y: p[1] + off + 12, anchor: 'middle' }], text, 'ar-tip def');
  }

  function arrowLine(a, b, { startGap = 0, endGap = 0, dashed = false, color, marker, cls = '', opacity = 1 }) {
    const v = sub2(b, a);
    const len = Math.hypot(v[0], v[1]);
    if (len < 1) return;
    const u = [v[0] / len, v[1] / len];
    const s = [a[0] + u[0] * startGap, a[1] + u[1] * startGap];
    const e = [b[0] - u[0] * endGap, b[1] - u[1] * endGap];
    const common = { x1: round1(s[0]), y1: round1(s[1]), x2: round1(e[0]), y2: round1(e[1]) };
    arrowG.append(
      svgEl('line', { ...common, class: 'ar-halo', 'stroke-dasharray': dashed ? '7 5' : null }),
      svgEl('line', { ...common, class: `ar ${cls}`, stroke: color, opacity, 'stroke-dasharray': dashed ? '7 5' : null, 'marker-end': `url(#${marker})` }));
  }
  function crossMark(p, r) {
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      const common = { x1: round1(p[0] - dx * r), y1: round1(p[1] - dy * r), x2: round1(p[0] + dx * r), y2: round1(p[1] + dy * r) };
      arrowG.append(svgEl('line', { ...common, class: 'ar-halo bar' }), svgEl('line', { ...common, class: 'ar-block' }));
    }
  }
  function arrowTip(p, text, from) {
    // 화살표 끝(또는 궤적 가운데) 옆에 짧은 라벨: 진행 방향 앞 → 뒤 → 좌우 중 토큰이 없는 자리. 필드 밖으로 나가지 않게 clamp
    const side = p[0] >= from[0] ? 1 : -1;
    const x = clamp(p[0] + side * (tokPx * 0.2), 34, W - 34);
    const ahead = p[1] < from[1] ? -tokPx * 0.75 : tokPx * 0.95;
    const behind = p[1] < from[1] ? tokPx * 0.95 : -tokPx * 0.75;
    const cy = (dy) => clamp(p[1] + dy, 12, H - 6);
    const off = tokPx * 0.8;
    tipText([
      { x, y: cy(ahead), anchor: 'middle' },
      { x, y: cy(behind), anchor: 'middle' },
      { x: clamp(p[0] + off, 0, W - 40), y: cy(4), anchor: 'start' },
      { x: clamp(p[0] - off, 40, W), y: cy(4), anchor: 'end' },
    ], text, 'ar-tip');
  }

  /* ------------------------------------------------------------------ */
  /* 비트 연출                                                             */
  /* ------------------------------------------------------------------ */
  function setDurations(k) {
    const act = reduced ? 0 : Math.round(T.act * k);
    const move = reduced ? 0 : Math.round(T.move * k);
    pitch.style.setProperty('--t-act', `${act}ms`);
    pitch.style.setProperty('--t-move', `${move}ms`);
  }

  function animateBeat(fresh, prevL, nextL, nextView) {
    setBusy(true);
    hideArrow();
    clearPops(); // 이전 비트의 결과 한 줄은 새 비트가 시작되면 걷는다 (필드·로그와 어긋나지 않게)
    lockButtons();
    const k = fx();
    setDurations(k);
    const beats = fresh.filter((e) => e && BEATS.has(e.type));
    const main = beats.find((e) => ACTION_BEATS.has(e.type)) || null;
    let t = fresh.some((e) => e && e.type === 'cutin') ? T.cutin * k : 0; // 필살기: 컷인 배너 → 액션 연출
    if (main) {
      later(() => actionPhase(main, prevL), t);
      t += T.act * k;
      if (main.type === 'turnover' || main.type === 'save' || (main.type === 'penalty' && !main.success)) t += T.hold * k;
      if (main.type === 'goal') {
        later(() => goalFlash(main, nextView), t);
        t += T.goal * k;
      }
    }
    later(() => movePhase(nextL, nextView), t);
    t += T.move * k;
    later(() => resultPhase(main || beats[beats.length - 1], prevL, nextL, nextView), t);
    t += T.result * k;
    later(() => finishBeat(), t);
  }

  /** 연출 시작: 결정 UI 를 즉시 잠근다 (미리보기 줄·결정 표시 제거). 스코어·로그는 재배치 때 갱신 */
  function lockButtons() {
    drawInfo(curView, false);
    drawActions(curView, false, false);
    drawSkills(curView, false);
  }

  /** ① 액션 연출: 드리블 = carrier 와 함께, 패스 = receiver 로, 슛 = 골문으로, 실패 = defender 로 (§12.3) */
  function actionPhase(ev, prevL) {
    pitch.classList.remove('phase-move');
    pitch.classList.add('phase-act');
    const atk = ev.side === 'away' ? 'away' : 'home';
    const def = atk === 'home' ? 'away' : 'home';
    const C = tokOf(prevL, ev.playerId, atk) || tokOf(prevL, prevL.carrierId, atk) || prevL.ball;
    const D = tokOf(prevL, ev.defenderId, def) || tokOf(prevL, prevL.defenderId, def);
    const goalPt = { x: prevL.goal.x, y: prevL.goal.y >= 50 ? 99.5 : 0.5 };
    const tokEl2 = (side, id) => tokEls.get(`${side}:${id}`);
    const moveTok = (side, id, p) => { const el = tokEl2(side, id); if (el && p) place(el, p.x, p.y); };
    const addCls = (side, id, c) => { const el = tokEl2(side, id); if (el) el.classList.add(c); };

    if (ev.type === 'duel' && ev.action === 'pass') {
      const R = tokOf(prevL, ev.receiverId, atk) || prevL.ball;
      trail(C, R, atk);
      placeBallAt(R.x, R.y);
      addCls(atk, ev.receiverId, 'catching');
    } else if (ev.type === 'duel') {
      const to = prevL.nextBall || C;
      moveTok(atk, ev.playerId, to);
      placeBallAt(to.x, to.y, atk);
      if (D) addCls(def, D.id, 'beaten');
    } else if (ev.type === 'turnover') {
      let P = D ? lerp(D, C, 0.55) : C;
      if (ev.action === 'pass') {
        const R = tokOf(prevL, prevL.receiverId, atk);
        if (R) { P = lerp(C, R, 0.5); trail(C, P, atk); }
      }
      if (D) { moveTok(def, D.id, P); addCls(def, D.id, 'steal'); }
      placeBallAt(P.x, P.y);
    } else if (ev.type === 'save' || (ev.type === 'penalty' && !ev.success)) {
      const G = D || goalPt;
      placeBallAt(lerp(C, G, 0.92).x, lerp(C, G, 0.92).y);
      if (D) addCls(def, D.id, 'dive');
    } else if (ev.type === 'goal' || ev.type === 'penalty') {
      trail(C, goalPt, atk);
      placeBallAt(goalPt.x + (ev.type === 'penalty' ? 6 : 0), goalPt.y);
      if (D) addCls(def, D.id, 'dive');
    }
  }

  function goalFlash(ev, view) {
    const us = ev.side === 'home';
    drawHud(view, isFinished());
    goalFx.textContent = us ? 'GOAL!' : '실점';
    goalFx.className = `goal-fx show ${us ? 'home' : 'away'}`;
    pitch.classList.add(us ? 'flash-good' : 'flash-bad');
    later(() => {
      goalFx.className = 'goal-fx';
      pitch.classList.remove('flash-good', 'flash-bad');
    }, Math.max(350, (T.goal + T.move * 0.5) * fx()));
  }

  /** ② 재배치: computeLayout 새 좌표로 전원 이동 + 패널·배너 갱신 */
  function movePhase(nextL, view) {
    pitch.classList.remove('phase-act');
    pitch.classList.add('phase-move');
    trailG.replaceChildren();
    applyLayout(nextL, view, { anim: !reduced });
    drawPanels(view);
    updateBanner(nextL, view);
  }

  /** ③ 결과 한 줄: 공 근처에 짧게 띄운다 (로그에는 전체 문장). 토큰을 덜 가리는 쪽(좌/우 · 위/아래)을 고른다 */
  function resultPhase(ev, prevL, nextL, view) {
    const r = ev ? beatResult(ev, view) : null;
    if (!r) return;
    let at = nextL?.ball || { x: 50, y: 50 };
    if (ev.type === 'penalty') at = prevL?.ball || at;
    let side;
    let x;
    let y;
    if (ev.type === 'goal') {
      side = 'c'; x = W / 2; y = H * 0.62;
    } else {
      const w = textWidth(r.text, 12) + 20;
      const ax = PX(at.x);
      const ay = PY(at.y);
      const firstR = at.x <= 50;
      const cands = [];
      for (const dy of [0, -tokPx * 1.1, tokPx * 1.1]) {
        for (const s of firstR ? ['r', 'l'] : ['l', 'r']) {
          const px = ax + (s === 'r' ? 1 : -1) * tokPx;
          const py = clamp(ay + dy, 14, H - 14);
          cands.push({ side: s, x: px, y: py, box: { l: s === 'r' ? px : px - w, r: s === 'r' ? px + w : px, t: py - 11, b: py + 11 } });
        }
      }
      // 공 근처가 다 막혔으면 필드 가운데 줄 중 빈 띠로 (공과 가까운 띠부터)
      const bands = [0.1, 0.28, 0.5, 0.72, 0.9].map((f) => H * f).sort((a, b) => Math.abs(a - ay) - Math.abs(b - ay));
      for (const by of bands) cands.push({ side: 'c', x: W / 2, y: by, box: { l: W / 2 - w / 2, r: W / 2 + w / 2, t: by - 11, b: by + 11 } });
      const obstacles = (nextL?.tokens || []).map(tokenRect);
      if (nextL?.ball) obstacles.push(ballRect(nextL));
      const pick = pickSpot(cands, obstacles) || cands[0];
      ({ side, x, y } = pick);
    }
    // 수명: 다음 비트가 시작되면 걷히고(clearPops), 멈춰 있으면(결정 대기) 결과 + 액션 시간만큼 보인 뒤 사라진다
    const life = Math.max(900, (T.result + T.act) * fx());
    const el = h('div', {
      class: ['m-pop', side, r.tone, ev.type === 'goal' ? 'big' : ''],
      style: { transform: `translate(${round1(x)}px, ${round1(y)}px)` },
    }, h('span', {}, r.text));
    el.style.setProperty('--t-pop', `${Math.round(life)}ms`); // CSS 페이드 길이 = 배속 반영 수명
    popLayer.replaceChildren(el);
    later(() => el.remove(), life);
  }

  function clearPops() {
    for (const el of [...popLayer.children]) {
      if (el.classList.contains('out')) continue;
      el.classList.add('out');
      later(() => el.remove(), 160);
    }
  }

  function finishBeat() {
    pitch.classList.remove('phase-act', 'phase-move');
    setBusy(false);
    // 연출 중 바뀐 것 반영: 창 크기(resize 는 연출 중 미뤘다), 자동/개입 전환(패스 후보 확정 여부), 토글 스킬
    const w = pitch.clientWidth;
    const hh = pitch.clientHeight;
    const resized = resizePending || (w > 40 && hh > 40 && (w !== W || hh !== H));
    resizePending = false;
    relayout({ anim: !resized && !reduced });
    drawPanels(curView);
    schedule(0);
  }

  function trail(a, b, side) {
    trailG.replaceChildren();
    const common = { x1: round1(PX(a.x)), y1: round1(PY(a.y)), x2: round1(PX(b.x)), y2: round1(PY(b.y)) };
    trailG.append(svgEl('line', { ...common, class: `trail ${side}` }));
  }

  function beatResult(ev, view) {
    const nm = (side, id) => (view?.players?.[side] || []).find((p) => p.id === id)?.name ?? '';
    const atk = ev.side === 'away' ? 'away' : 'home';
    const def = atk === 'home' ? 'away' : 'home';
    const us = atk === 'home';
    const good = us ? 'good' : 'bad';
    const bad = us ? 'bad' : 'good';
    switch (ev.type) {
      case 'duel':
        return ev.action === 'pass'
          ? { text: `${nm(atk, ev.playerId)} → ${nm(atk, ev.receiverId)} 패스 성공`, tone: good }
          : { text: `${nm(atk, ev.playerId)} 드리블 돌파`, tone: good };
      case 'turnover':
        return { text: `${nm(def, ev.defenderId)} ${L.ACTION_LABELS[ev.defAction] ?? '수비'}! ${us ? '공 뺏김' : '공 탈취'}`, tone: bad };
      case 'save':
        return { text: `${nm(def, ev.defenderId)} 세이브!`, tone: bad };
      case 'goal':
        return { text: us ? `골!! ${nm(atk, ev.playerId)}` : `실점 — ${nm(atk, ev.playerId)}`, tone: good };
      case 'penalty':
        return ev.success
          ? { text: `${nm(atk, ev.playerId)} 성공`, tone: good }
          : { text: `${nm(def, ev.defenderId)} 선방`, tone: bad };
      case 'counter':
        return { text: us ? '역습!' : '상대 역습!', tone: good };
      case 'kickoff':
        return { text: us ? '우리 킥오프' : '상대 킥오프', tone: 'neutral' };
      default:
        return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 진행 루프                                                             */
  /* ------------------------------------------------------------------ */
  /** 다음 step 예약. 연출 중·결정 대기(수동)·종료면 예약하지 않는다. */
  function schedule(delay = 0) {
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
    if (!alive() || busy) return;
    if (isFinished()) { showResult(); return; }
    if (paused(getView())) return; // 사람이 선택할 차례
    ui.timer = setTimeout(() => {
      ui.timer = null;
      if (alive() && !busy) doStep(null);
    }, Math.max(0, delay));
  }

  function doStep(decision) {
    if (busy || !alive()) return false;
    const ms = store.match;
    if (!ms || isFinished()) { schedule(); return false; }
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
    const before = Array.isArray(ms.events) ? ms.events.length : 0;
    const prevL = curL;
    const r = safe(() => match.step(ms, data, decision));
    if (r === undefined) { refresh(); return false; } // 엔진 오류: 루프를 멈춘다 (토스트 표시됨)
    saveMatch(ms);
    ui.selectedSkillId = null;
    const fresh = Array.isArray(ms.events) ? ms.events.slice(before) : [];
    const cut = fresh.find((e) => e && e.type === 'cutin');
    if (cut) banner(cut.text || '필살기 발동!', 1000);
    const view = getView();
    const nextL = layoutFor(view);
    const hasBeat = fresh.some((e) => e && BEATS.has(e.type));
    if (!hasBeat || !prevL || !nextL) {
      // 스킬 단독 사용(reveal) 등: 연출 없이 바로 갱신
      applyLayout(nextL, view);
      drawPanels(view);
      updateBanner(nextL, view);
      schedule(T.idle * fx());
      return true;
    }
    animateBeat(fresh, prevL, nextL, view);
    return true;
  }

  function decide(action) {
    const view = getView();
    if (!canDecideNow(view) || !view.needsDecision) return;
    const decision = { action };
    if (ui.selectedSkillId) decision.skillId = ui.selectedSkillId;
    ui.intervene = false;
    doStep(decision);
  }

  function refresh() {
    const view = getView();
    const Lay = layoutFor(view);
    applyLayout(Lay, view, { anim: false });
    drawPanels(view);
    updateBanner(Lay, view, true);
  }

  function skip() {
    if (isFinished()) { showResult(); return; }
    cancelTimers();
    setBusy(false);
    hideArrow();
    trailG.replaceChildren();
    popLayer.replaceChildren();
    pitch.classList.remove('phase-act', 'phase-move');
    const ms = store.match;
    const r = safe(() => match.simulateAuto(ms, data));
    saveMatch(ms);
    refresh();
    if (r !== undefined) showResult();
  }

  function showResult() {
    if (ui.resultShown || !alive()) return;
    const ms = store.match;
    const result = safe(() => match.getResult(ms));
    if (!result) return;
    ui.resultShown = true;
    const home = ms.home || {};
    const away = ms.away || {};
    const score = ms.score || {};
    const winner = result.winner;
    const verdict = winner === 'home' ? '승리!' : winner === 'away' ? '패배…' : '무승부';
    const nameOf = (side, id) => (side === 'home' ? home : away)?.players?.find?.((p) => p.id === id)?.name ?? '-';
    const st = result.stats || ms.stats || {};
    const hg = result.homeGoals ?? score.home ?? 0;
    const ag = result.awayGoals ?? score.away ?? 0;
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h2', { class: 'center' }, `${L.KIND_LABELS[result.kind ?? ms.kind] ?? ''} 결과`),
      h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, home.name ?? '우리 클럽'), h('span', { class: 'ellipsis' }, away.name ?? '상대')),
      h('div', { class: 'score-big' }, `${hg} : ${ag}`),
      h('div', { class: ['result-verdict', winner === 'home' ? 'good' : winner === 'away' ? 'bad' : 'muted'] }, verdict),
      result.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${result.penalties.home ?? 0} : ${result.penalties.away ?? 0}`) : null,
      h('table', { class: 'stats-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '우리'), h('th', {}, '상대'))),
        h('tbody', {},
          [['슛', 'shots'], ['듀얼 승', 'duelsWon'], ['골', 'goals']].map(([lbl, k]) =>
            h('tr', {}, h('td', {}, lbl), h('td', {}, st.home?.[k] ?? 0), h('td', {}, st.away?.[k] ?? 0))),
          h('tr', {}, h('td', {}, 'MVP'), h('td', {}, nameOf('home', st.home?.mvpId)), h('td', {}, nameOf('away', st.away?.mvpId))))),
      h('button', {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: (e) => {
          // run.finishMatch 는 정확히 1회: 연타 방지 (실패하면 app.js 가 render() 로 경기 화면을 다시 그려 재시도 가능)
          if (finishing) return;
          finishing = true;
          if (e?.currentTarget) e.currentTarget.disabled = true;
          closeOverlays();
          ui.resultShown = false;
          actions.finishMatch(result);
        },
      }, '확인'),
    ), { closable: false });
  }

  /* ------------------------------------------------------------------ */
  /* 토큰 탭 → 미니 카드                                                     */
  /* ------------------------------------------------------------------ */
  function openCard(side, id) {
    const snap = store.match?.[side]?.players?.find?.((p) => p.id === id) || null;
    const pv = (curView?.players?.[side] || []).find((p) => p.id === id) || null;
    if (!snap && !pv) return;
    const p = { ...(pv || {}), ...(snap || {}) };
    const mx = Number(pv?.staminaMax) || cfg.match?.staminaMax || 100;
    const st = Number(pv?.stamina ?? mx);
    const ratio = mx ? st / mx : 0;
    const skillDefs = (Array.isArray(snap?.skillIds) ? snap.skillIds : [])
      .map((sid) => (Array.isArray(data.skills) ? data.skills.find((s) => s.id === sid) : null) || { id: sid, name: sid, kind: '' });
    const tok = tokOf(curL, id, side);
    const meta = [
      side === 'home' ? '우리' : '상대',
      p.slot ?? p.position,
      L.STYLE_LABELS[p.style] ?? p.style,
      p.element ? `${L.ELEMENT_ICONS[p.element] ?? ''}${L.ELEMENT_LABELS[p.element] ?? p.element}` : null,
      p.race ? L.RACE_LABELS[p.race] ?? p.race : null,
      p.aptitude ? `적성 ${p.aptitude}` : null,
    ].filter(Boolean).join(' · ');
    let modal = null;
    const content = h('div', { class: 'mini-card' },
      h('div', { class: 'row' },
        avatar(p.portraitColor, p.name, 'md', side === 'home' ? 'ring-home' : 'ring-away'),
        h('div', { class: 'col grow' },
          h('b', {}, p.name ?? ''),
          h('span', { class: 'small muted' }, meta)),
        p.isYouth ? h('span', { class: 'badge badge-warn' }, '유스') : null,
        tok ? h('span', { class: 'badge' }, L.TOKEN_ROLE_LABELS[tok.role] ?? tok.role) : null),
      p.stats ? h('div', { class: 'mc-stats' }, L.STATS.map((k) =>
        h('div', { class: 'cell' }, h('span', { class: 'tiny muted' }, L.STAT_LABELS[k]), statBadge(p.stats[k], ctx.thresholds)))) : null,
      h('div', { class: 'row small' }, h('span', { class: 'muted' }, '체력'),
        bar(ratio, ratio <= 0.2 ? 'bad' : ratio <= 0.5 ? 'warn' : 'good'), h('span', {}, `${Math.round(st)}/${mx}`)),
      skillDefs.length
        ? h('div', { class: 'col small' }, skillDefs.map((sk) => h('div', { class: 'mc-skill' },
          sk.kind ? h('span', { class: 'badge' }, L.SKILL_KIND_LABELS[sk.kind] ?? sk.kind) : null, ' ',
          h('b', {}, sk.name ?? sk.id), sk.description ? h('span', { class: 'tiny muted' }, ` ${sk.description}`) : null)))
        : h('p', { class: 'tiny muted' }, '스킬 없음'),
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => modal?.close() }, '닫기'));
    modal = openModal(content, { className: 'mini-card-modal' });
  }

  /* ------------------------------------------------------------------ */
  /* 시작                                                                 */
  /* ------------------------------------------------------------------ */
  const onResize = () => {
    if (!alive()) { window.removeEventListener('resize', onResize); return; }
    if (!curView) return;
    // 연출 중에는 진행 중인 좌표를 건드리지 않고, 비트가 끝날 때(finishBeat) 새 크기로 다시 배치한다
    if (busy) { resizePending = true; return; }
    // 보던 미리보기 화살표는 새 좌표로 다시 그린다 (모바일 주소창 접힘 등으로도 resize 가 온다)
    relayout({ anim: false });
  };
  try { window.addEventListener('resize', onResize); } catch (_) { /* ignore */ }

  setDurations(fx());
  const v0 = getView();
  const L0 = layoutFor(v0);
  applyLayout(L0, v0, { anim: false });
  drawPanels(v0);
  updateBanner(L0, v0, true);
  if (isFinished()) showResult();
  else schedule(T.start * fx());
}

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                  */
/* ------------------------------------------------------------------ */
function errorScreen(msg, ctx) {
  return h('div', { class: 'screen' },
    h('div', { class: 'error-panel' }, msg),
    h('button', { class: 'btn', onclick: () => ctx.actions.resetToStart() }, '처음으로'));
}

function svgEl(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

function arrowMarker(id, color) {
  return svgEl('marker', { id, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto-start-reverse' },
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

function initialOf(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const clamp01 = (x) => clamp(Number(x) || 0, 0, 1);
/** 두 픽셀 박스 {l,r,t,b} 가 겹치는 넓이 */
const rectOverlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/** 굵은 글자 한 줄의 대략 폭 (px): 한글·기호·이모지는 글자 크기만큼, 영숫자·공백은 0.6배 */
function textWidth(text, size) {
  let w = 0;
  for (const ch of Array.from(String(text ?? ''))) w += ch.codePointAt(0) >= 0x2000 ? size * 1.05 : size * 0.62;
  return w;
}
const round1 = (x) => Math.round(x * 10) / 10;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
function projectOn(a, b, p) {
  // p 를 선분 a→b 위로 투영 (0.2~0.85 구간으로 제한)
  const v = sub2(b, a);
  const len2 = v[0] * v[0] + v[1] * v[1] || 1;
  const t = clamp(((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len2, 0.2, 0.85);
  return lerp2(a, b, t);
}
