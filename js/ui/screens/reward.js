// js/ui/screens/reward.js — 레슨 결과 · 보상 모달 (phase reward, 배경 = 레슨 화면 inert)
// [U1 임시 화면] LESSON_PROTO_PLAN §6.3 의 완성 모달(cardFace 3장 · 무료 강화 덱 그리드 · 강화 후 미리보기)은 U4 가 만든다.
// 지금은 결과 요약 + 보상 카드 버튼(고르면 바로 resolveReward 1번) · [건너뛰기] / 실패면 [계속].
// 무료 강화(퍼펙트)는 감독 AI(manager.recommendReward)가 고른 카드에 자동으로 쓴다.
import { h, openModal, signed } from '../dom.js';
import * as L from '../labels.js';

export function renderRewardModal(ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const v = safe(() => run.getRewardView(state, data));
  if (!v) return;
  const r = v.result || {};
  const rec = manager ? safe(() => manager.recommendReward(state, data)) : null;
  // 무료 강화: 고른 보상이 같은 카드를 강화하면 그 카드는 피한다 (엔진이 거절)
  const freeUid = (pick) => {
    if (!(v.freeUpgrades > 0)) return null;
    const avoid = pick != null && v.offer[pick]?.kind === 'upgrade' ? v.offer[pick].uid : null;
    if (rec?.upgradeUid && rec.upgradeUid !== avoid) return rec.upgradeUid;
    return (v.upgradable || []).find((u) => u !== avoid) ?? null;
  };
  const deckName = (uid) => {
    const e = (state.deck || []).find((d) => d.uid === uid);
    return e ? ((data.cards?.cards || []).find((c) => c.id === e.cardId)?.name ?? e.cardId) : uid;
  };
  let done = false;
  const submit = (pick) => {
    if (done) return; // 연타 방지 (resolveReward 1번)
    done = true;
    actions.resolveReward({ pick, upgradeUid: freeUid(pick) });
  };

  const statName = L.STAT_LABELS[r.stat] ?? r.stat;
  const failed = r.status === 'fail';
  const hints = (r.hints || []).map((x) => `${x.name ?? x.skillId} Lv${x.level}`).join(', ');
  const bonds = (r.bond || []).filter((b) => b.gain).map((b) => `${b.name} ${signed(b.gain)}`).join(' · ');
  const gains = (r.perPlayer || []).filter((p) => p.gain || p.auto).map((p) => {
    const nm = state.players.find((x) => x.id === p.id)?.name ?? p.id;
    return `${nm} ${signed((p.gain || 0) + (p.auto || 0))}`;
  }).join(' · ');

  const body = h('div', { class: 'col reward-temp', style: { gap: '12px' } },
    h('div', { class: 'row between' },
      h('h3', {}, `${L.STAT_ICONS[r.stat] ?? ''} ${statName} ${r.prep ? '대비 ' : r.special ? '★특별 ' : ''}레슨 — `,
        h('span', { class: failed ? 'bad' : r.status === 'perfect' ? 'gold' : 'good' }, L.LESSON_STATUS_LABELS[r.status] ?? r.status)),
      h('span', { class: 'badge badge-warn', title: '완성 화면은 다음 작업 단계(U4)에서 만듭니다' }, '임시 화면')),
    h('p', { class: 'small' }, `점수 ${r.score} / 목표 ${r.target} / 퍼펙트 ${r.cap}`,
      failed ? '' : ` · TP +${r.tp ?? 0}${hints ? ` · 힌트 ${hints}` : ''}${r.sp ? ` · SP +${r.sp}` : ''} · 팀워크 +${r.teamwork ?? 0}`),
    bonds ? h('p', { class: 'tiny muted' }, `유대: ${bonds}`) : null,
    gains ? h('p', { class: 'tiny muted reward-gains' }, `${statName} 상승: ${gains}`) : null,
    failed || !v.offer.length
      ? h('p', { class: 'muted' }, '보상 없음')
      : h('div', { class: 'reward-offer' }, v.offer.map((c, i) => h('button', {
        class: ['btn', 'btn-col', 'reward-pick', `fam-${c.family}`, rec?.pick === i ? 'recommended' : ''],
        dataset: { pick: String(i) },
        onclick: () => submit(i),
      },
      h('b', {}, `${c.kind === 'upgrade' ? '강화: ' : ''}${c.name}${c.plus || c.kind === 'upgrade' ? '+' : ''}`),
      h('span', { class: 'tiny muted' }, `${L.CARD_FAMILY_LABELS[c.family] ?? c.family} · ${L.CARD_TARGET_LABELS[c.targetKind] ?? c.targetKind ?? ''}${c.power != null ? ` · 위력 ${c.power}` : ''}`),
      h('span', { class: 'tiny' }, c.desc || ''),
      rec?.pick === i ? h('span', { class: 'badge badge-accent' }, '추천') : null))),
    v.freeUpgrades > 0 && freeUid(null)
      ? h('p', { class: 'small gold' }, `무료 강화 ${v.freeUpgrades}장 (퍼펙트): 「${deckName(freeUid(null))}」에 자동으로 씁니다`)
      : null,
    h('div', { class: 'row end modal-foot' },
      failed || !v.offer.length
        ? h('button', { class: 'btn btn-primary', onclick: () => submit(null) }, '계속')
        : h('button', { class: 'btn', onclick: () => submit(null) }, `건너뛰기 — TP +${v.skipTp ?? 0}`)));
  openModal(body, { closable: false, className: 'modal-xl reward-modal' });
}
