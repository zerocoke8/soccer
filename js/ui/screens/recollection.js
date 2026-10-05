// js/ui/screens/recollection.js — 회상 화면 (store.screen 'recollection', 시작 화면 [📖 회상]) — LESSON_PROTO_PLAN §24.7 · §24.13 (U3)
// 본 외출 이야기를 다시 읽는다. 엔진 상태와 상관없다 — 데이터 (lessonEvents.storyList · eventById) + 계정 저장 (store.loadAccount) 만 읽는다.
//   ┌ 📖 회상 — 외출 이야기   본 이야기 n/48                                                       [처음으로] ┐
//   │ 선수 16 (4 × 4 얼굴 칸 — 이름 · ●●○ n/3)        │ (흉상) 이름 · n/3화                                       │
//   │                                               │  1화 「제목」              [읽기]   ← 본 화                │
//   │                                               │  2화 ???   외출하면 볼 수 있다      ← 다음 화              │
//   │                                               │  3화 ???   (실루엣)                ← 잠김                 │
//   └───────────────────────────────────────────────┴─────────────────────────────────────────────────────────┘
// 읽기 모달 = 이벤트 모달과 같은 틀 (배경 띠 · 흉상 · 본문) + 두 선택지와 그 결과 문구 (확률 갈래는 둘 다). 효과는 없다 (읽기만).
// 칸 순서 = data/characters.json 순서 (storyList). 데이터에 이야기가 없는 캐릭터는 칸을 흐리게 ("이야기 준비 중").
import { h, avatar, openModal, closeOverlays } from '../dom.js';
import { portraitUrl } from '../art.js';
import { eventBust, eventBand } from './event.js';

const STORY_EPS = 3;

/**
 * 회상 목록 → 캐릭터 16칸 { charId, name, color, eps: [{ ep, id, title, state: 'seen'|'next'|'locked'|'missing' }], seen }.
 * 상태: 본 화 (계정 stories[charId] 이하) = seen, 바로 다음 화 = next, 그 뒤 = locked, 데이터에 없는 화 = missing.
 * @param {object} data
 * @param {Array<{ charId, name, ep, id, title }>} list  lessonEvents.storyList(data)
 * @param {{ stories?: Record<string, number> }} account
 */
export function recollectionCells(data, list, account) {
  const stories = (account && account.stories) || {};
  const chars = Array.isArray(data?.characters) ? data.characters : [];
  const byChar = new Map();
  for (const s of list || []) {
    if (!byChar.has(s.charId)) byChar.set(s.charId, []);
    byChar.get(s.charId).push(s);
  }
  const ids = [...chars.map((c) => c.id), ...[...byChar.keys()].filter((id) => !chars.some((c) => c.id === id))];
  return ids.map((charId) => {
    const ch = chars.find((c) => c.id === charId) || {};
    const own = byChar.get(charId) || [];
    const n = Math.max(0, Math.min(STORY_EPS, Number(stories[charId]) || 0));
    const eps = [];
    for (let ep = 1; ep <= STORY_EPS; ep++) {
      const s = own.find((x) => x.ep === ep);
      const state = !s ? 'missing' : ep <= n ? 'seen' : ep === n + 1 ? 'next' : 'locked';
      eps.push({ ep, id: s?.id ?? null, title: s?.title ?? '', state });
    }
    return {
      charId, name: ch.name ?? own[0]?.name ?? charId, color: ch.portraitColor, rarity: ch.rarity ?? '',
      eps, seen: eps.filter((e) => e.state === 'seen').length, total: own.length,
    };
  });
}

export function renderRecollection(root, ctx) {
  const { store, data, actions } = ctx;
  const LE = ctx.lessonEvents;
  const screen = h('div', { class: ['screen', 'og', 'recollection-screen'] });
  root.append(screen);
  let list = [];
  try { list = LE && typeof LE.storyList === 'function' ? LE.storyList(data) : []; } catch (e) { console.error(e); list = []; }
  const account = typeof ctx.loadAccount === 'function' ? ctx.loadAccount() : { stories: {} };
  const cells = recollectionCells(data, list, account);
  const seenAll = cells.reduce((a, c) => a + c.seen, 0);
  const totalAll = list.length;
  const ui = store.recollectionUi;
  if (!ui.charId || !cells.some((c) => c.charId === ui.charId)) ui.charId = (cells.find((c) => c.seen > 0) || cells[0])?.charId ?? null;
  const cur = cells.find((c) => c.charId === ui.charId) || null;

  const head = h('header', { class: 'og-head rc-head' },
    h('h2', {}, '📖 회상 — 외출 이야기'),
    h('span', { class: 'status-chip rc-total', title: '본 외출 이야기 (계정 — 런을 지워도 남는다)' }, '본 이야기 ', h('b', {}, `${seenAll}/${totalAll}`)),
    h('span', { class: 'small muted' }, '외출에서 본 이야기를 다시 읽습니다. 선택지 결과는 모두 보이고, 효과는 없습니다.'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => actions.goto('start') }, '처음으로'));

  // ---- 왼쪽: 선수 4 × 4 ----
  const grid = h('div', { class: 'rc-grid' }, cells.map((c) => h('button', {
    type: 'button',
    class: ['rc-cell', c.charId === ui.charId ? 'selected' : '', c.seen ? '' : 'unseen', c.total ? '' : 'empty'],
    dataset: { char: c.charId, seen: String(c.seen) },
    'aria-pressed': c.charId === ui.charId ? 'true' : 'false',
    title: c.total ? `${c.name} — 이야기 ${c.seen}/${STORY_EPS}화` : `${c.name} — 이야기 준비 중`,
    onclick: () => { ui.charId = c.charId; ctx.render(); },
  },
  avatar(c.color, c.name, 'lg', ['rc-face', c.seen ? '' : 'dim'], { art: portraitUrl(data, c.charId, 'face') }),
  h('b', { class: 'rc-name' }, c.name),
  h('span', { class: 'rc-prog' },
    h('span', { class: 'rc-pips', 'aria-hidden': 'true' }, c.eps.map((e) => h('i', { class: e.state }))),
    h('span', { class: 'tiny' }, c.total ? `${c.seen}/${STORY_EPS}` : '준비 중')))));
  const left = h('section', { class: 'og-panel rc-left' },
    h('div', { class: 'og-panel-head' }, h('h3', { class: 'og-panel-title' }, `선수 ${cells.length}`), h('span', { class: 'tiny muted' }, '얼굴을 눌러 이야기 목록')),
    grid);

  // ---- 오른쪽: 고른 선수의 3화 ----
  let right;
  if (!cur) {
    right = h('section', { class: 'og-panel rc-right' }, h('p', { class: 'muted' }, '이야기 데이터가 없습니다.'));
  } else {
    const bust = portraitUrl(data, cur.charId, 'bust');
    const epRows = cur.eps.map((e) => {
      const seen = e.state === 'seen';
      const kids = [
        h('span', { class: 'rc-ep-no' }, `${e.ep}화`),
        h('span', { class: 'rc-ep-sil', 'aria-hidden': 'true' }, seen ? '📖' : '?'),
        h('span', { class: 'col rc-ep-txt' },
          h('b', { class: 'rc-ep-title' }, seen ? `「${e.title}」` : '???'),
          h('span', { class: 'tiny muted' }, seen ? '본 이야기 — 눌러서 다시 읽기' : e.state === 'next' ? '외출하면 볼 수 있다' : e.state === 'missing' ? '이야기 준비 중' : '앞 이야기를 보면 열린다')),
        seen ? h('span', { class: 'btn btn-sm btn-primary rc-read' }, '읽기') : null,
      ];
      return seen
        ? h('button', { type: 'button', class: ['rc-ep', 'seen'], dataset: { ep: String(e.ep), state: e.state, id: e.id }, onclick: () => openRead(ctx, cur, e) }, kids)
        : h('div', { class: ['rc-ep', e.state], dataset: { ep: String(e.ep), state: e.state } }, kids);
    });
    right = h('section', { class: 'og-panel rc-right' },
      h('div', { class: 'rc-who' },
        avatar(cur.color, cur.name, 'lg', ['rc-bust', bust ? 'bust' : ''], { art: bust }),
        h('div', { class: 'col rc-who-txt' },
          h('h3', {}, cur.name),
          h('span', { class: 'small muted' }, cur.total ? `이야기 ${cur.seen}/${STORY_EPS}화 봄` : '이야기 준비 중'),
          h('span', { class: 'rc-pips big', 'aria-hidden': 'true' }, cur.eps.map((e) => h('i', { class: e.state }))))),
      h('div', { class: 'rc-eps' }, epRows),
      h('p', { class: 'small muted rc-note' }, '이야기는 외출에서 봅니다 — 외출한 선수의 다음 화가 꼭 뜹니다. 본 화는 이 브라우저에 남습니다 (런 저장을 지워도).'));
  }

  screen.append(head, h('div', { class: 'rc-cols' }, left, right));
}

/** 선택지 맨 위 random 의 확률 (결과 갈래 표시 — "70%" / "30%"), 없으면 null */
function chanceOf(choice) {
  const top = Array.isArray(choice?.effects) ? choice.effects[0] : null;
  return top && top.type === 'random' ? Number(top.chance) : null;
}

/** 읽기 모달: 배경 띠 + 흉상 + 본문 + 두 선택지 · 결과 문구 (갈래는 둘 다) — 효과 없음 */
function openRead(ctx, cell, epInfo) {
  const { data } = ctx;
  const LE = ctx.lessonEvents;
  const LT = ctx.lessonText;
  let ev = null;
  try { ev = LE && typeof LE.eventById === 'function' ? LE.eventById(data, epInfo.id) : null; } catch (_) { ev = null; }
  if (!ev) return;
  const vars = { player: cell.name, season: '?' };
  const fill = (s) => {
    try { return LT && typeof LT.fillText === 'function' ? LT.fillText(s, vars) : String(s ?? ''); } catch (_) { return String(s ?? '').replace(/\{[^}]*\}/g, cell.name); }
  };
  const texts = LT && typeof LT.pickText === 'function'
    ? LT.pickText(ev, cell.charId, data)
    : { text: ev.text, results: ev.choices.map((c) => c.result) };
  let scene = 'nature';
  try { scene = LE.sceneOf(ev) || 'nature'; } catch (_) { scene = ev.scene || 'nature'; }
  const cast = [{ kind: 'player', id: cell.charId, name: cell.name, sub: `이야기 ${epInfo.ep}/${STORY_EPS}화`, color: cell.color, art: portraitUrl(data, cell.charId, 'bust') }];
  const choiceEls = ev.choices.map((c, i) => {
    const r = texts.results[i];
    const p = chanceOf(c);
    const branches = r && typeof r === 'object'
      ? [[p != null ? `${Math.round(p * 100)}%` : '잘 풀리면', r.then], [p != null ? `${100 - Math.round(p * 100)}%` : '어긋나면', r.else]]
      : [[null, r]];
    return h('div', { class: 'rc-choice', dataset: { choice: String(i) } },
      h('b', { class: 'rc-choice-label' }, fill(c.label)),
      branches.map(([tag, text]) => h('p', { class: 'rc-choice-res' }, tag ? h('span', { class: 'badge rc-branch' }, tag) : null, fill(text))));
  });
  const band = eventBand(ctx, { scene, badge: `이야기 ${epInfo.ep}/${STORY_EPS}화`, kind: 'story', title: fill(ev.title) });
  const box = h('div', { class: ['evm', 'cast-1', 'evm-read'] },
    band,
    h('div', { class: 'ev-body evm-body' },
      h('div', { class: 'ev-cast evm-cast' }, cast.map(eventBust)),
      h('div', { class: 'evm-main' },
        h('p', { class: 'event-text' }, fill(texts.text)),
        h('div', { class: 'rc-choices' }, choiceEls),
        h('div', { class: 'row end evm-res-foot' },
          h('span', { class: 'tiny muted grow' }, '회상 — 효과 없이 읽기만 합니다'),
          h('button', { type: 'button', class: 'btn btn-primary rc-close', onclick: () => closeOverlays() }, '닫기')))));
  openModal(box, { className: 'modal-xl event-modal rc-read-modal' });
}
