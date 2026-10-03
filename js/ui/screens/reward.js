// js/ui/screens/reward.js — 레슨 결과 · 보상 모달 (phase reward, 배경 = 레슨 화면 inert)
// LESSON_PROTO_PLAN §6.3 "보상 모달" (openModal closable:false, 'modal-xl reward-modal'):
//   ┌ ➡️ 패스 중점 ★특별 레슨 · 퍼펙트!  점수 [█████████████|] 702 / 목표 495 / 퍼펙트 624      카드 12 · 벤치 1 · 실패 0 ┐
//   │ TP +20 · 힌트 스루패스 Lv2 · 팀워크 +3 (레슨 중 +5) · 유대 오르넬라 +13 …                                          │
//   │ (선수 7) 실루엔 +62 ➡️40 🦶22 / 기본 30 / 카드 32 · 부+18 …  (구역 스탯 상승 = 기본 훈련 + 분위기 + 카드)                │
//   ├ 카드 1장을 고르세요 ─ [cardFace][cardFace +][cardFace 코치] [건너뛰기 TP +10] │ 고른 카드 설명                        ┤
//   ├ 무료 강화 1장 (퍼펙트) ─ 덱 miniCard 8열 · 고른 카드 "강화 후" 한 줄                                                ┤
//   └ 고른 것 요약 ───────────────────────────────────────────────────────────────────────────── [확인] ┘
// 실패 = 결과 머리 + "보상 없음" + [계속]. [확인] · [계속] = resolveReward({ pick, upgradeUid }) 1번 (연타 방지).
// 고르기(카드 · 건너뛰기 · 무료 강화 카드)는 모달 안에서만 바뀐다 (모달 내용만 다시 그린다 — 엔진 호출 없음).
// 추천 = manager.recommendReward → 그 카드 · 건너뛰기 · 무료 강화 카드에 "추천" 배지 (미리 고르지는 않는다).
import { h, avatar, openModal, signed } from '../dom.js';
import * as L from '../labels.js';
import { cardFace, miniCard } from '../cards.js';

/** 보상 카드 / 덱 카드 뷰 → 강화판 미리보기 뷰 (lessonRun 카드 뷰 upgrade { power, desc }) */
export function upgradedView(c) {
  if (!c || !c.upgrade) return null;
  return { ...c, plus: true, power: c.upgrade.power, desc: c.upgrade.desc, canUpgrade: false, upgrade: null };
}

/** 덱 그리드 작은 카드의 둘째 줄: 고유 카드 = "○○ 고유 카드" (문구 "강화: … / 지원: …" 보다 누구 카드인지가 먼저) */
export function uniqueNote(c, players) {
  if (c?.family !== 'unique') return undefined;
  const p = (players || []).find((x) => x.charId === c.ownerCharId);
  return `${p?.name ?? '선수'} 고유 카드`;
}

/** 구역별 상승 { stat: n } → 많이 오른 순 n 곳 [[stat, n]] (0 이하는 뺀다, 같으면 STATS 순서) */
export function topStats(byStat, n = 2) {
  return L.STATS.map((k) => [k, Number(byStat?.[k]) || 0]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
}

/** "강화 후" 한 줄: 1인 35 → 44 · 문구 */
export function upgradeLine(c) {
  const up = c?.upgrade;
  if (!up) return '';
  const pw = c.power != null && up.power != null && up.power !== c.power ? `1인 ${c.power} → ${up.power}` : '';
  const desc = up.desc && up.desc !== c.desc ? up.desc : '';
  return [pw, desc].filter(Boolean).join(' · ') || '강화판';
}

export function renderRewardModal(ctx) {
  const { store, data, run, manager, safe, actions } = ctx;
  const state = store.run;
  const v = safe(() => run.getRewardView(state, data));
  if (!v) {
    // 뷰가 없으면 (저장본 손상) 그래도 넘어갈 수 있게 [계속]
    openModal(h('div', { class: 'col reward-body' },
      h('p', { class: 'bad' }, '레슨 결과를 불러올 수 없습니다.'),
      h('div', { class: 'row end modal-foot' }, h('button', { class: 'btn btn-primary', onclick: () => actions.resolveReward({ pick: null }) }, '계속'))),
    { closable: false, className: 'modal-xl reward-modal' });
    return;
  }
  const r = v.result || {};
  const offer = Array.isArray(v.offer) ? v.offer : [];
  const failed = r.status === 'fail';
  const hasOffer = offer.length > 0;
  const rec = manager && (hasOffer || v.freeUpgrades > 0) ? safe(() => manager.recommendReward(state, data)) : null;
  const players = state.players || [];
  // 덱 카드 뷰 (lessonRun getRewardView.deck — 강화 후 미리보기 upgrade { power, desc })
  const deck = Array.isArray(v.deck) ? v.deck : [];
  const upgradable = new Set(v.upgradable || []);
  const freeOn = v.freeUpgrades > 0 && upgradable.size > 0;
  const deckUpgradeLine = (uid) => upgradeLine(deck.find((d) => d.uid === uid));

  // 모달 안 선택 (엔진 호출 전): pick = undefined(아직) | null(건너뛰기) | 번호, upgradeUid = 무료 강화 카드
  const sel = { pick: undefined, upgradeUid: null };
  let done = false;
  const submit = () => {
    if (done) return; // 연타 방지 (resolveReward 1번)
    if (hasOffer && sel.pick === undefined) return;
    done = true;
    actions.resolveReward({ pick: sel.pick ?? null, upgradeUid: freeOn ? sel.upgradeUid : null });
  };
  const offerUid = (i) => (i != null && offer[i]?.kind === 'upgrade' ? offer[i].uid : null);

  // ---------- 결과 머리 ----------
  const statName = `${L.STAT_LABELS[r.zone] ?? r.zone ?? '?'} 중점`;
  const kindText = r.prep ? '대비 레슨' : r.special ? '★특별 레슨' : '레슨';
  const statusCls = failed ? 'bad' : r.status === 'perfect' ? 'gold' : 'good';
  const cap = Math.max(1, Number(r.cap) || 1);
  const pct = (x) => `${Math.max(0, Math.min(100, ((Number(x) || 0) / cap) * 100)).toFixed(1)}%`;
  const head = h('div', { class: 'rw-head' },
    h('div', { class: 'rw-title' },
      h('span', { class: 'rw-ico', 'aria-hidden': 'true' }, L.STAT_ICONS[r.zone] ?? '📋'),
      h('span', { class: 'col' },
        h('span', { class: 'small muted' }, `${statName} ${kindText} · 시즌 ${state.season ?? '?'} ${state.turn ?? '?'}주`),
        h('b', { class: ['rw-status', statusCls] }, L.LESSON_STATUS_LABELS[r.status] ?? r.status))),
    h('div', { class: ['rw-score', r.status] },
      h('div', { class: 'rw-score-top' },
        h('span', { class: 'tiny muted' }, '점수'), h('b', { class: 'rw-score-n' }, r.score ?? 0),
        h('span', { class: 'rw-score-t' }, `/ 목표 ${r.target ?? '?'} / 퍼펙트 ${r.cap ?? '?'}`)),
      h('div', { class: 'rw-bar', 'aria-hidden': 'true' },
        h('i', { class: 'rw-fill', style: { width: pct(r.score) } }),
        h('span', { class: 'rw-mark', style: { left: pct(r.target) }, title: `목표 ${r.target}` }))),
    h('div', { class: 'rw-stats tiny muted' },
      h('span', {}, `턴 ${r.turnReached ?? '?'}/${r.turns ?? '?'}`),
      h('span', {}, `카드 ${r.plays ?? 0}장 · 벤치 ${r.benches ?? 0}`),
      h('span', { class: r.fails ? 'warn' : '' }, `실패 ${r.fails ?? 0}${r.injuries ? ` · 부상 ${r.injuries}` : ''}`)));

  // ---------- 보상 칩 ----------
  const chip = (cls, ...kids) => h('span', { class: ['rw-chip', cls] }, ...kids);
  const hintText = (r.hints || []).map((x) => `${x.name ?? x.skillId} Lv${x.level}`).join(' · ');
  const chips = failed
    ? [chip('bad', '실패 — TP · 힌트 · 보상 카드 없음')]
    : [
      chip('tp', 'TP ', h('b', {}, signed(r.tp ?? 0))),
      hintText ? chip('hint', '힌트 ', h('b', {}, hintText)) : null,
      r.sp ? chip('sp', 'SP ', h('b', {}, signed(r.sp)), h('span', { class: 'muted' }, ' (힌트 없음)')) : null,
      chip('tw', '팀워크 ', h('b', {}, signed(r.teamwork ?? 0)), r.twAccrued ? h('span', { class: 'muted' }, ` (레슨 중 +${r.twAccrued})`) : null),
      r.condition ? chip('cond', '컨디션 ', h('b', {}, signed(r.condition))) : null,
      r.prepBonus ? chip('prep', '경계전 컨디션 +1 (대비)') : null,
    ];
  if (failed && r.twAccrued) chips.push(chip('tw', '팀워크 ', h('b', {}, `+${r.twAccrued}`), h('span', { class: 'muted' }, ' (레슨 중)')));
  for (const b of r.bond || []) if (b.gain) chips.push(chip('bond', `유대 ${b.name} `, h('b', {}, signed(b.gain)), h('span', { class: 'muted' }, ` → ${b.bond}`)));
  const chipRow = h('div', { class: 'rw-chips' }, chips);

  // ---------- 선수 7 ----------
  // 선수 칩 (§14.16 · perPlayer = { byStat, base, mood, card, sub, targeted, benched }): 구역 스탯 상승 합 · 많이 오른 구역 2곳(아이콘) ·
  // 기본(기본 훈련 + 분위기 몫) / 카드 · 부 스탯. 자세한 값은 title.
  const playerRow = h('div', { class: 'rw-players' }, (r.perPlayer || []).map((pp) => {
    const p = players.find((x) => x.id === pp.id) || {};
    const base = (pp.base || 0) + (pp.mood || 0);
    const card = pp.card || 0;
    const total = base + card;
    const top = topStats(pp.byStat, 2);
    const by = Object.entries(pp.byStat || {}).filter(([, n]) => n).map(([k, n]) => `${L.STAT_LABELS[k] ?? k} ${signed(n)}`).join(' · ');
    return h('div', {
      class: ['rw-pl', total > 0 ? '' : total < 0 ? 'neg' : 'zero'],
      dataset: { pid: pp.id },
      title: `${p.name ?? pp.id}: 구역 스탯 ${signed(total)} = 기본 훈련 ${signed(pp.base || 0)}${pp.mood ? ` · 분위기 ${signed(pp.mood)}` : ''} · 카드 ${signed(card)}`
        + `${pp.sub ? ` · 부 스탯 +${pp.sub}` : ''}${by ? `\n${by}` : ''}\n대상 ${pp.targeted ?? 0}회${pp.benched ? ` · 벤치 ${pp.benched}턴` : ''}`,
    },
    avatar(p.portraitColor, p.name, 'sm'),
    h('span', { class: 'rw-pl-nm' }, p.name ?? pp.id, h('span', { class: 'rw-pl-slot' }, p.slot ?? '')),
    h('span', { class: 'rw-pl-gain' },
      h('b', { class: total > 0 ? 'good' : total < 0 ? 'bad' : 'muted' }, signed(total)),
      h('span', { class: 'rw-pl-by' }, top.map(([k, n]) => h('span', { class: 'rw-by', dataset: { stat: k }, title: `${L.zoneLabel(k)} ${signed(n)}` }, L.ZONE_ICONS[k] ?? L.STAT_SHORT[k] ?? k, h('i', {}, n))))),
    h('span', { class: 'rw-pl-split' },
      h('span', { title: '기본 훈련 (분위기 몫 포함)' }, `기본 ${base}`), ' / ', h('span', { title: '카드 상승 (실패 −5 포함)' }, `카드 ${card}`),
      pp.sub ? h('span', { class: 'rw-pl-sub', title: '부 스탯 상승 (점수 밖)' }, ` · 부+${pp.sub}`) : null));
  }));

  const body = h('div', { class: 'reward-body' });
  const draw = () => {
    const parts = [head, chipRow, playerRow];
    if (!hasOffer) {
      parts.push(h('div', { class: 'rw-none' },
        h('b', {}, failed ? '보상 없음' : '보상 카드 없음'),
        h('span', { class: 'small muted' }, failed ? `목표 ${r.target} 점에 못 미쳤습니다. 체력은 그대로 다음 주로 이어집니다.` : '고를 카드가 없습니다.')));
    } else {
      // ---- 카드 1장 고르기 ----
      const takenFree = sel.upgradeUid;
      const cardsEl = offer.map((c, i) => {
        const blocked = c.kind === 'upgrade' && takenFree === c.uid;
        return h('div', { class: 'rw-offer-slot' },
          cardFace(c, {
            data, players,
            selected: sel.pick === i,
            recommended: rec?.pick === i,
            tag: c.kind === 'upgrade' ? '덱 카드 강화' : c.plus ? '강화판!' : '새 카드',
            onClick: () => {
              sel.pick = sel.pick === i ? undefined : i;
              if (sel.pick === i && blocked) sel.upgradeUid = null; // 같은 카드를 두 번 강화할 수 없다
              draw();
            },
          }));
      });
      const skip = h('button', {
        type: 'button',
        class: ['rw-skip', sel.pick === null ? 'selected' : '', rec && rec.pick === null ? 'recommended' : ''],
        'aria-pressed': sel.pick === null ? 'true' : 'false',
        onclick: () => { sel.pick = sel.pick === null ? undefined : null; draw(); },
      },
      h('span', { class: 'rw-skip-ico', 'aria-hidden': 'true' }, '⏭'),
      h('b', {}, '건너뛰기'),
      h('span', { class: 'rw-skip-tp' }, `TP +${v.skipTp ?? 0}`),
      h('span', { class: 'tiny muted' }, '덱을 늘리지 않는다'),
      rec && rec.pick === null ? h('span', { class: 'cf-rec' }, '추천') : null);
      let explain;
      if (sel.pick === undefined) {
        explain = [h('b', {}, '카드 1장을 고르거나 건너뛰세요'),
          h('span', { class: 'small muted' }, `덱 ${state.deck?.length ?? 0}장. 고른 카드는 덱에 들어가 다음 레슨부터 손패에 나옵니다.`),
          offer.some((c) => c.family === 'coach') ? h('span', { class: 'small muted' }, `코치 카드를 얻으면 그 코치 유대 +${data.lesson?.bond?.acquire ?? 15}.`) : null];
      } else if (sel.pick === null) {
        explain = [h('b', {}, '건너뛰기'), h('span', { class: 'small' }, `카드 대신 TP +${v.skipTp ?? 0} (상담에서 카드 구매 · 강화 · 삭제에 쓴다)`)];
      } else {
        const c = offer[sel.pick];
        explain = c.kind === 'upgrade'
          ? [h('b', {}, `덱의 「${c.name}」 → ${c.name}+`), h('span', { class: 'small' }, '덱 장수는 그대로, 이 카드가 강화판이 된다.')]
          : [h('b', {}, `「${c.name}${c.plus ? '+' : ''}」 덱에 추가`),
            h('span', { class: 'small' }, `덱 ${state.deck?.length ?? 0} → ${(state.deck?.length ?? 0) + 1}장`),
            c.family === 'coach' ? h('span', { class: 'small good' }, `코치 카드 — 유대 +${data.lesson?.bond?.acquire ?? 15}`) : null,
            c.plus ? h('span', { class: 'small gold' }, '처음부터 강화판') : null];
      }
      parts.push(h('div', { class: 'rw-sec' },
        h('div', { class: 'rw-sec-head' }, h('h4', {}, '카드 1장을 고르세요'), h('span', { class: 'tiny muted' }, '카드를 눌러 고른 뒤 [확인]')),
        h('div', { class: 'rw-offer' }, cardsEl, skip, h('div', { class: 'rw-explain' }, explain))));
    }
    // ---- 무료 강화 (퍼펙트) ----
    if (freeOn) {
      const taken = offerUid(sel.pick);
      const selName = sel.upgradeUid ? deck.find((d) => d.uid === sel.upgradeUid)?.name : null;
      parts.push(h('div', { class: 'rw-sec rw-free' },
        h('div', { class: 'rw-sec-head' },
          h('h4', { class: 'gold' }, `무료 강화 ${v.freeUpgrades}장 (퍼펙트)`),
          sel.upgradeUid
            ? h('span', { class: 'rw-up-line', title: deckUpgradeLine(sel.upgradeUid) }, h('b', {}, `${selName}+`), ` — 강화 후: ${deckUpgradeLine(sel.upgradeUid)}`)
            : h('span', { class: 'tiny warn' }, '고르지 않으면 이 기회는 사라집니다')),
        h('div', { class: ['rw-deck', deck.length > 16 ? 'dense' : ''] }, deck.map((d) => {
          const can = upgradable.has(d.uid) && d.uid !== taken;
          const el = miniCard(d, {
            data,
            selected: sel.upgradeUid === d.uid,
            disabled: !can,
            note: d.plus ? '이미 강화됨' : d.uid === taken ? '보상으로 강화' : uniqueNote(d, players),
            onClick: () => { if (!can) return; sel.upgradeUid = sel.upgradeUid === d.uid ? null : d.uid; draw(); },
          });
          if (rec?.upgradeUid === d.uid) { el.classList.add('recommended'); el.append(h('span', { class: 'mc-rec' }, '추천')); }
          return el;
        }))));
    }
    // ---- 아래 줄 ----
    const summary = [];
    if (hasOffer) {
      if (sel.pick === undefined) summary.push(h('span', { class: 'muted' }, '아직 고르지 않았습니다'));
      else if (sel.pick === null) summary.push(h('span', {}, `건너뛰기 — TP +${v.skipTp ?? 0}`));
      else summary.push(h('span', {}, `${offer[sel.pick].kind === 'upgrade' ? '강화' : '획득'}: `, h('b', {}, `${offer[sel.pick].name}${offer[sel.pick].plus ? '+' : ''}`)));
    }
    if (freeOn) summary.push(h('span', { class: sel.upgradeUid ? '' : 'muted' }, ` · 무료 강화: ${sel.upgradeUid ? `${deck.find((d) => d.uid === sel.upgradeUid)?.name}+` : '안 함'}`));
    parts.push(h('div', { class: 'row modal-foot rw-foot' },
      h('span', { class: 'small grow rw-summary' }, summary),
      h('button', {
        class: 'btn btn-primary btn-lg rw-ok',
        disabled: hasOffer && sel.pick === undefined,
        title: hasOffer && sel.pick === undefined ? '카드 1장을 고르거나 [건너뛰기]를 고르세요' : '',
        onclick: submit,
      }, hasOffer ? '확인' : '계속')));
    body.replaceChildren(...parts);
  };
  draw();
  openModal(body, { closable: false, className: 'modal-xl reward-modal' });
}
