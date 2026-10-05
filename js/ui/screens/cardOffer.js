// js/ui/screens/cardOffer.js — 이벤트 "보상 카드 3택1" 모달 (phase cardOffer, 배경 = 주 화면 inert) — LESSON_PROTO_PLAN §24.5.3 · §24.13 (U3)
// 보상 모달 (screens/reward.js) 의 카드 칸을 빌려 쓴다 (같은 클래스 · 같은 모양 — css/lesson.css .rw-offer · .rw-skip · .rw-explain · .rw-foot):
//   ┌ 🎁 보상 카드 3택1 · 「지방 조약 리그 개막」 ────────────────────────────────────────────┐
//   │ [cardFace][cardFace][cardFace] [⏭ 건너뛰기 TP +10]  │ 고른 카드 설명 (덱 n → n+1장 · 코치 카드 유대)  │
//   └ 고른 것 요약 ─────────────────────────────────────────────────────────────── [확인] ┘
// 카드 · 건너뛰기를 눌러 고른 뒤 [확인] = actions.resolveCardOffer({ pick }) 1번 (pick = 0 ~ 2, null = 건너뛰기). 연타 방지.
// 추천 = manager.recommendCardOffer (보상 추천과 같은 규칙) → 그 카드 · 건너뛰기에 "추천" (미리 고르지는 않는다).
import { h, openModal } from '../dom.js';
import { cardFace } from '../cards.js';

export function renderCardOfferModal(ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const v = safe(() => run.getCardOfferView(state, data));
  if (!v) {
    openModal(h('div', { class: 'col' },
      h('p', { class: 'bad' }, '보상 카드 정보를 불러올 수 없습니다.'),
      h('div', { class: 'row end modal-foot' }, h('button', { class: 'btn btn-primary', onclick: () => actions.resolveCardOffer({ pick: null }) }, '건너뛰기'))),
    { closable: false, className: 'modal-md' });
    return;
  }
  const cards = Array.isArray(v.cards) ? v.cards : [];
  const players = state.players || [];
  const rec = manager ? safe(() => manager.recommendCardOffer(state, data)) : null;
  const deckN = Number(v.deckSize ?? state.deck?.length ?? 0);
  // 출처 이벤트 제목: 방금 고른 이벤트 (state.lastEvent — 자리표시를 채운 제목) 가 그 이벤트면 그것, 아니면 자리표시가 없는 원래 제목
  const srcTitle = state.lastEvent && state.lastEvent.eventId === v.src ? state.lastEvent.title : (v.title && !/[{}]/.test(v.title) ? v.title : null);
  const skipTp = Number(v.skipTp) || 0;

  const sel = { pick: undefined }; // undefined = 아직, null = 건너뛰기, 번호
  let done = false;
  const body = h('div', { class: 'col cof-body' });
  const submit = () => {
    if (done || sel.pick === undefined) return;
    done = true;
    actions.resolveCardOffer({ pick: sel.pick });
  };

  const draw = () => {
    const slots = cards.map((c, i) => h('div', { class: 'rw-offer-slot' },
      cardFace(c, {
        data, players,
        selected: sel.pick === i,
        recommended: rec?.pick === i,
        tag: c.kind === 'upgrade' ? '덱 카드 강화' : c.plus ? '강화판!' : '새 카드',
        onClick: () => { sel.pick = sel.pick === i ? undefined : i; draw(); },
      })));
    const skipRec = !!rec && rec.pick === null;
    const skip = h('button', {
      type: 'button',
      class: ['rw-skip', 'cof-skip', sel.pick === null ? 'selected' : '', skipRec ? 'recommended' : ''],
      'aria-pressed': sel.pick === null ? 'true' : 'false',
      onclick: () => { sel.pick = sel.pick === null ? undefined : null; draw(); },
    },
    h('span', { class: 'rw-skip-ico', 'aria-hidden': 'true' }, '⏭'),
    h('b', {}, '건너뛰기'),
    h('span', { class: 'rw-skip-tp' }, `TP +${skipTp}`),
    h('span', { class: 'tiny muted' }, '덱을 늘리지 않는다'),
    skipRec ? h('span', { class: 'cf-rec' }, '추천') : null);

    let explain;
    if (sel.pick === undefined) {
      explain = [h('b', {}, '카드 1장을 고르거나 건너뛰세요'),
        h('span', { class: 'small muted' }, `덱 ${deckN}장. 고른 카드는 덱에 들어가 다음 레슨부터 손패에 나옵니다.`),
        cards.some((c) => c.family === 'coach') ? h('span', { class: 'small muted' }, `코치 카드를 얻으면 그 코치 유대 +${data.lesson?.bond?.acquire ?? 15}.`) : null];
    } else if (sel.pick === null) {
      explain = [h('b', {}, '건너뛰기'), h('span', { class: 'small' }, `카드 대신 TP +${skipTp} (상담에서 카드 구매 · 강화 · 삭제에 쓴다)`)];
    } else {
      const c = cards[sel.pick];
      explain = c.kind === 'upgrade'
        ? [h('b', {}, `덱의 「${c.name}」 → ${c.name}+`), h('span', { class: 'small' }, '덱 장수는 그대로, 이 카드가 강화판이 된다.')]
        : [h('b', {}, `「${c.name}${c.plus ? '+' : ''}」 덱에 추가`),
          h('span', { class: 'small' }, `덱 ${deckN} → ${deckN + 1}장`),
          c.family === 'coach' ? h('span', { class: 'small good' }, `코치 카드 — 유대 +${data.lesson?.bond?.acquire ?? 15}`) : null,
          c.plus ? h('span', { class: 'small gold' }, '처음부터 강화판') : null];
    }

    let summary;
    if (sel.pick === undefined) summary = h('span', { class: 'muted' }, '아직 고르지 않았습니다');
    else if (sel.pick === null) summary = h('span', {}, `건너뛰기 — TP +${skipTp}`);
    else summary = h('span', {}, `${cards[sel.pick].kind === 'upgrade' ? '강화' : '획득'}: `, h('b', {}, `${cards[sel.pick].name}${cards[sel.pick].plus ? '+' : ''}`));

    body.replaceChildren(
      h('div', { class: 'cof-head' },
        h('h3', {}, '🎁 보상 카드 3택1'),
        srcTitle ? h('span', { class: 'badge cof-src' }, `「${srcTitle}」`) : null,
        h('span', { class: 'tiny muted' }, '카드를 눌러 고른 뒤 [확인]')),
      h('div', { class: 'rw-offer cof-offer' }, slots, skip, h('div', { class: 'rw-explain' }, explain)),
      h('div', { class: 'row modal-foot rw-foot' },
        h('span', { class: 'small grow rw-summary' }, summary),
        h('button', {
          type: 'button',
          class: 'btn btn-primary btn-lg rw-ok cof-ok',
          disabled: sel.pick === undefined,
          title: sel.pick === undefined ? '카드 1장을 고르거나 [건너뛰기]를 고르세요' : '',
          onclick: submit,
        }, '확인')));
  };
  draw();
  openModal(body, { closable: false, className: 'modal-lg card-offer-modal' });
}
