// js/ui/screens/event.js — 이벤트 모달 (phase "event") · 이벤트 결과 카드 (화면 전용) — LESSON_PROTO_PLAN §24.13 (U3)
// 가로 스테이지 (modal 'modal-xl event-modal', 폭 1000):
//   ┌ 배경 띠 184px (img/scenes/<scene>.webp — 없으면 장면별 CSS 그라데이션) ─────────────────────────────────┐
//   │ ┌흉상┐   [종류 배지: 주 끝 · 시즌 시작 · 경계전 전야 · 루트 · 외출 · 이야기 2/3화 · 코치 · 첫 만남 / 유대 40 / 유대 80]  │
//   │ │    │   제목                                                                                         │
//   ├ │    │ ─ 본문 (장면 2 ~ 4줄) ──────────────────────────────────────────────────────────────────────────┤
//   │ └────┘   감독의 결정                                                                                    │
//   │ 이름 · 역할  [선택지 0: 감독의 말 · 미리보기 줄 · 추천]  [선택지 1: …]                                         │
//   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
//   흉상 = 주인공 (선수) · 코치 (서포트) · 짝 이벤트면 두 선수 (주인공이 없다 — 뷰 art.charIds 에서), 둘까지. 그림이 없으면 색 칸 + 첫 글자.
//   흉상은 띠 위로 솟는다 (배경 그림 위에 선 사람 — 사람은 확정 일러스트를 잘라 겹친다, §24.12.5).
// 고르는 선택지 (needs — 카드 1장 강화 · 삭제): 누르면 같은 모달 안에서 덱 고르기 (상담 덱 칸과 같은 작은 카드 miniCard) → [확정] =
//   actions.resolveEvent(i, { uid }). 후보가 없으면 (엔진이 TP 로 바꾼다) 바로 고른다.
// 결과 카드 (renderEventResult): 고른 뒤 같은 자리에 결과 문구 + 받은 효과 줄 + [계속] (state.lastEvent — app.js store.eventUi.resultSeq,
//   엔진 단계가 아니다 — 새로 고침하면 보이지 않는다). [계속] = 다음 phase 화면 (다음 이벤트 · 3택1 · 유물 · 주 …).
// 추천 배지 = 뷰의 choices[].recommended (감독 AI 기대값 — manager.recommendEventChoice 와 같다), 고르는 선택지의 추천 카드는 recommendEventChoice.uid.
import { h, avatar, openModal } from '../dom.js';
import { miniCard } from '../cards.js';
import { portraitUrl, sceneUrl } from '../art.js';

/** 종류 배지 — 결과 카드는 뷰가 없어 엔진 lessonEvents.KIND_BADGES (ctx.lessonEvents) 로 만든다. 엔진 모듈이 없을 때의 사본 */
const KIND_BADGES = { week: '주 끝', seasonStart: '시즌 시작', preMatch: '경계전 전야', route: '루트', outing: '외출', story: '이야기', coach: '코치', surprise: '레슨 깜짝' };

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

/**
 * 미리보기 · 효과 줄 → 화면 줄. 확률 갈래 한 줄 ("70%: … / 30%: …") 은 갈래마다 한 줄로 나눈다 (엔진 describe 의 글은 그대로).
 * @param {string[]|undefined} lines
 * @param {string} [fallback]
 * @returns {string[]}
 */
export function previewLines(lines, fallback = '') {
  const src = Array.isArray(lines) && lines.length ? lines : fallback ? [fallback] : [];
  const out = [];
  for (const line of src) {
    const s = String(line ?? '').trim();
    if (!s) continue;
    if (/^\d+%: /.test(s) && / \/ \d+%: /.test(s)) out.push(...s.split(/ \/ (?=\d+%: )/));
    else out.push(s);
  }
  return out;
}

/**
 * 흉상 목록 (둘까지): 주인공 (선수) → 코치 → 이벤트의 다른 등장 선수 (짝 이벤트는 주인공이 없다 — charIds 두 명).
 * @param {object} ctx
 * @param {{ playerId?: string|null, supportId?: string|null, charIds?: string[] }} who
 * @returns {Array<{ kind: 'player'|'coach', id: string, name: string, sub: string, color: string, art: string|null, injured?: boolean }>}
 */
export function castOf(ctx, { playerId = null, supportId = null, charIds = [] } = {}) {
  const { data, store } = ctx;
  const state = store.run || {};
  const players = Array.isArray(state.players) ? state.players : [];
  const out = [];
  const pushPlayer = (p) => {
    if (!p || out.some((x) => x.kind === 'player' && x.id === p.id)) return;
    const injured = (Number(p.injuredTurns) || 0) > 0;
    out.push({
      kind: 'player', id: p.id, charId: p.charId, name: p.name ?? '', sub: `선수 · ${p.slot ?? ''}${injured ? ' · 결장' : ''}`,
      color: p.portraitColor, art: portraitUrl(data, p.charId, 'bust'), injured,
    });
  };
  pushPlayer(players.find((p) => p.id === playerId));
  if (supportId) {
    const sc = (data.supports || []).find((s) => s.id === supportId);
    const st = (state.supports || []).find((s) => s.id === supportId);
    if (sc) out.push({ kind: 'coach', id: sc.id, name: sc.name ?? '', sub: `코치${st ? ` · 유대 ${Math.round(Number(st.bond) || 0)}` : ''}`, color: sc.portraitColor, art: portraitUrl(data, sc.id, 'bust') });
  }
  for (const cid of Array.isArray(charIds) ? charIds : []) pushPlayer(players.find((p) => p.charId === cid));
  return out.slice(0, 2);
}

/** 흉상 칸 (그림이 없으면 색 칸 + 첫 글자 — avatar 를 키운 것, 글자는 DOM 에 남는다) */
function bustEl(c) {
  return h('figure', { class: ['ev-who', 'evm-bust', `k-${c.kind}`, c.injured ? 'injured' : ''], dataset: { kind: c.kind, id: c.id } },
    avatar(c.color, c.name, 'lg', ['evm-bust-face', c.art ? 'bust' : ''], { art: c.art }),
    h('figcaption', { class: 'evm-cap' }, h('b', {}, c.name), h('span', {}, c.sub)));
}

/** 배경 띠 (scene 그림 — <img> 라야 스크린샷 도구가 그림을 기다린다. 없거나 실패하면 장면 그라데이션) */
function bandEl(ctx, { scene, badge, kind, title, extra = null }) {
  const url = sceneUrl(ctx.data, scene);
  const img = url ? h('img', { class: 'evm-scene', src: url, alt: '', draggable: 'false', decoding: 'async' }) : null;
  if (img) img.addEventListener('error', () => img.remove());
  return h('div', { class: ['evm-band', `sc-${scene || 'ground'}`] },
    img,
    h('div', { class: 'evm-head' },
      h('span', { class: ['badge', 'evm-kind', `k-${kind || 'week'}`] }, badge || '이벤트'),
      extra,
      h('h2', { class: 'evm-title' }, title || '이벤트')));
}

/** 모달 뼈대: 띠 + (흉상 · 오른쪽 내용) */
function frame(cast, band, right, { pick = false } = {}) {
  const n = pick ? 0 : cast.length;
  return h('div', { class: ['evm', `cast-${n}`, pick ? 'picking' : ''] },
    band,
    h('div', { class: 'ev-body evm-body' },
      n ? h('div', { class: 'ev-cast evm-cast' }, cast.map(bustEl)) : null,
      h('div', { class: 'evm-main' }, right)));
}

export function renderEventModal(ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const ev = safe(() => run.getEventView(state, data));

  if (!ev) {
    openModal(h('div', { class: 'col' },
      h('h2', {}, '이벤트'),
      h('p', { class: 'muted' }, '이벤트 내용을 불러올 수 없습니다. 첫 선택지로 진행합니다.'),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => actions.resolveEvent(0) }, '진행'),
    ), { closable: false, className: 'modal-md' });
    return;
  }

  const art = isObj(ev.art) ? ev.art : {};
  const cast = castOf(ctx, { playerId: ev.player?.id ?? null, supportId: ev.support?.id ?? art.supportId ?? null, charIds: art.charIds || [] });
  const band = bandEl(ctx, { scene: ev.scene, badge: ev.badge, kind: ev.kind, title: ev.title });
  const choices = Array.isArray(ev.choices) && ev.choices.length ? ev.choices : [{ text: '확인', preview: '', lines: [] }];
  const box = h('div', { class: 'evm-root' });
  let done = false; // 연타 방지 (resolveEvent 1번)
  const resolve = (i, uid) => {
    if (done) return;
    done = true;
    actions.resolveEvent(i, uid == null ? {} : { uid });
  };

  const drawChoices = () => {
    const btns = choices.map((c, i) => {
      const lines = previewLines(c?.lines, c?.preview);
      const pick = !!(c?.needs && Array.isArray(c.needs.candidates) && c.needs.candidates.length);
      return h('button', {
        type: 'button',
        class: ['btn', 'choice-btn', c?.recommended ? 'recommended' : '', pick ? 'needs-pick' : ''],
        dataset: { choice: String(i) },
        title: c?.recommended ? '감독 추천 — 기대값이 큰 쪽' : '',
        onclick: () => (pick ? drawPick(i) : resolve(i)),
      },
      h('span', { class: 'cb-label' }, c?.text ?? `선택 ${i + 1}`),
      lines.length ? h('span', { class: 'preview' }, lines.map((t) => h('span', { class: 'pv-line' }, t))) : null,
      pick ? h('span', { class: 'cb-pick' }, c.needs.op === 'delete' ? '삭제할 카드 고르기 →' : '강화할 카드 고르기 →') : null,
      c?.recommended ? h('span', { class: 'badge badge-accent cb-rec' }, '추천') : null);
    });
    box.replaceChildren(frame(cast, band, [
      h('div', { class: 'ev-story' }, h('p', { class: 'event-text' }, ev.text ?? '')),
      h('div', { class: 'ev-choices' },
        h('span', { class: 'tiny muted evm-decide' }, '감독의 결정'),
        h('div', { class: ['evm-choice-row', btns.length > 2 ? 'many' : ''] }, btns)),
    ]));
  };

  // ---- 덱 고르기 (cardPick — §24.5.3): 상담 덱 칸과 같은 작은 카드. 후보만 누를 수 있다 ----
  const drawPick = (i) => {
    const c = choices[i];
    const needs = c.needs;
    const op = needs.op === 'delete' ? 'delete' : 'upgrade';
    const cands = new Map(needs.candidates.map((x) => [x.uid, x]));
    const rec = manager ? safe(() => manager.recommendEventChoice(state, data)) : null;
    const recUid = rec && rec.choice === i ? rec.uid ?? null : null;
    const cardDefs = new Map(((data.cards && data.cards.cards) || []).map((d) => [d.id, d]));
    const deck = (Array.isArray(state.deck) ? state.deck : []).map((e) => {
      const def = cardDefs.get(e.cardId) || {};
      return { uid: e.uid, cardId: e.cardId, name: def.name ?? e.cardId, family: def.family, plus: !!e.plus, desc: e.plus ? def.descPlus ?? def.desc : def.desc, memory: e.src === 'memory' };
    });
    let sel = recUid && cands.has(recUid) ? recUid : null;
    const draw = () => {
      const picked = sel ? deck.find((d) => d.uid === sel) : null;
      const def = picked ? cardDefs.get(picked.cardId) : null;
      const opWord = op === 'delete' ? '삭제' : '강화';
      const grid = h('div', { class: ['rw-deck', 'evm-deck', deck.length > 16 ? 'dense' : ''] }, deck.map((d) => {
        const ok = cands.has(d.uid);
        const el = miniCard(d, {
          data,
          selected: sel === d.uid,
          disabled: !ok,
          note: ok ? undefined : op === 'upgrade' ? (d.plus ? '이미 강화됨' : '강화 없음') : '삭제 불가',
          onClick: () => { if (!ok) return; sel = sel === d.uid ? null : d.uid; draw(); },
        });
        if (recUid === d.uid) { el.classList.add('recommended'); el.append(h('span', { class: 'mc-rec' }, '추천')); }
        return el;
      }));
      let detail;
      if (!picked) detail = h('span', { class: 'muted' }, `${opWord}할 카드를 고르세요 (후보 ${cands.size}장)`);
      else if (op === 'upgrade') detail = h('span', {}, h('b', {}, `「${picked.name}」 → ${picked.name}+`), def?.descPlus ? ` · 강화 후: ${def.descPlus}` : '');
      else {
        detail = h('span', {}, h('b', {}, `「${picked.name}${picked.plus ? '+' : ''}」 삭제`), ` · 덱 ${deck.length} → ${deck.length - 1}장`,
          picked.family === 'unique' ? h('span', { class: 'warn' }, ' · 고유 카드 — 이 런에서 되찾을 수 없습니다') : null);
      }
      box.replaceChildren(frame(cast, band, [
        h('div', { class: 'evm-pick-head' },
          h('h3', {}, `덱의 카드 1장 ${opWord}`),
          h('span', { class: 'small muted ellipsis' }, `감독의 결정: ${c.text ?? ''}`)),
        grid,
        h('div', { class: 'row evm-pick-foot' },
          h('button', { type: 'button', class: 'btn evm-back', onclick: () => drawChoices() }, '← 다른 선택지'),
          h('span', { class: 'small grow evm-pick-detail' }, detail),
          h('button', {
            type: 'button',
            class: 'btn btn-primary btn-lg evm-pick-ok',
            disabled: !picked,
            title: picked ? '' : `${opWord}할 카드를 고르세요`,
            onclick: () => { if (picked) resolve(i, picked.uid); },
          }, `${opWord} 확정`)),
      ], { pick: true }));
    };
    draw();
  };

  drawChoices();
  openModal(box, { closable: false, className: 'modal-xl event-modal' });
}

/**
 * 이벤트 결과 카드 (§24.13 — 화면 전용): state.lastEvent { title, kind, label, result, lines, playerId, supportId, eventId } 를
 * 이벤트 모달과 같은 자리 · 모양으로. [계속] = actions.closeEventResult (다음 phase 화면).
 */
export function renderEventResult(ctx) {
  const { store, data, actions } = ctx;
  const state = store.run;
  const last = state && state.lastEvent;
  if (!last) { actions.closeEventResult(); return; }
  const LE = ctx.lessonEvents;
  let ev = null;
  try { ev = LE && typeof LE.eventById === 'function' ? LE.eventById(data, last.eventId) : null; } catch (_) { ev = null; }
  const kind = last.kind || ev?.trigger || 'week';
  let scene = null;
  try { scene = ev && LE && typeof LE.sceneOf === 'function' ? LE.sceneOf(ev) : null; } catch (_) { scene = null; }
  if (!scene) scene = ev?.scene || 'ground';
  let badge = (LE && LE.KIND_BADGES ? LE.KIND_BADGES[kind] : null) || KIND_BADGES[kind] || '이벤트';
  if (ev?.trigger === 'story' && isObj(ev.story)) badge = `이야기 ${ev.story.ep}/3화`;
  else if (ev?.trigger === 'coach' && isObj(ev.chain)) badge = ev.chain.step === 1 ? '코치 · 첫 만남' : `코치 · 유대 ${ev.bondAtLeast}`;
  const charIds = ev?.trigger === 'story' && isObj(ev.story) ? [ev.story.charId] : Array.isArray(ev?.chars) ? ev.chars : [];
  const cast = castOf(ctx, { playerId: last.playerId, supportId: last.supportId, charIds });
  const lines = previewLines(last.lines);
  const band = bandEl(ctx, { scene, badge, kind, title: last.title, extra: h('span', { class: 'badge evm-res-badge' }, '결과') });
  let done = false;
  const box = frame(cast, band, [
    h('div', { class: 'evm-res' },
      h('p', { class: 'evm-res-choice small' }, h('span', { class: 'muted' }, '감독의 결정 '), h('b', {}, last.label ?? '')),
      h('p', { class: 'event-text evm-res-text' }, last.result ?? ''),
      h('div', { class: 'evm-res-lines' },
        h('span', { class: 'tiny muted' }, '받은 효과'),
        lines.length
          ? h('ul', { class: 'evm-fx' }, lines.map((t) => h('li', {}, t)))
          : h('span', { class: 'small muted' }, '효과 없음'))),
    h('div', { class: 'row end evm-res-foot' },
      h('button', {
        type: 'button',
        class: 'btn btn-primary btn-lg evm-continue',
        onclick: () => { if (done) return; done = true; actions.closeEventResult(); },
      }, '계속')),
  ]);
  box.classList.add('evm-result');
  openModal(box, { closable: false, className: 'modal-xl event-modal' });
}

/** 회상 · 결과 카드가 쓰는 흉상 칸 (recollection.js) */
export { bustEl as eventBust, bandEl as eventBand };
