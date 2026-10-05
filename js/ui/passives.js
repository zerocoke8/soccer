// js/ui/passives.js — 패시브 (L48): SP 패시브 상점 · 코치 파티 패시브 조각
// 선수 패시브 = 캐릭터마다 3개 (고유 1 + 공용 2), SP 로 산다 — 주 선택 · 상담 · 경기 전 준비 (lessonRun.getPassiveShopView · buyPassive).
// 패시브는 스킬 슬롯(액티브 3칸)을 쓰지 않는다. 코치 파티 패시브 = 편성 코치마다 1개, 런 내내 경기 전체에 (사지 않는다, 유대 80 = 한 단계 위).
// 엔진 로직은 없다 — 뷰 값만 그리고, 사기는 부르는 쪽이 준 onBuy 1번 (actions.buyPassive — 저장 · 오류 토스트).
//
//   openPassiveShop(ctx, { onBuy, onClose })  → 모달 'modal-xl passive-shop' (주 · 상담 · 경기 전 준비 공용, 추천 = manager.recommendPassive)
//     ┌ ✦ 패시브 (SP)   선수마다 3개 — 고유 1 + 공용 2 · 힌트 Lv 마다 10% 할인 · 스킬 슬롯을 쓰지 않는다      SP 140  [닫기] ┐
//     │ (얼굴) 네리아 GK │ [고유] 밀물의 벽 힌트 Lv1  ~~140~~ 126 SP │ 침착한 수문장        ✓ 보유 │ 큰 경기 체질      110 SP │
//     │ 보유 1/3 · 살 수 있음 1 │ 골문 앞에 물의 벽을 세워 세이브 판정 +15% │ 세이브 판정 +8%        │ 경계전에서 공격·수비 … │
//     │ … 7명 (칩: 보유 = ✓ 초록 · 살 수 없음 = 이유 · SP 부족 = 흐리게, 누르면 바로 산다)                                   │
//     └──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
//     사면 모달 내용만 다시 그린다 (모달은 열린 채) — 닫을 때 onClose({ bought }) 로 부르는 쪽이 배경을 고친다.
//   passiveShopGrid(ctx, view, { compact, onBuy, rec }) → 선수 7줄 × 칩 3 (모달 본문 · 상담 오른쪽 칸 compact — 설명은 title)
//   passiveShopButton(view, { onClick, disabled }) → [✦ 패시브 · SP 140 ③] (③ = 지금 SP 로 살 수 있는 수)
//   partyPassiveRows(list, data) → 코치 파티 패시브 줄 (코치 얼굴 · 이름 · 글 · 유대 80 표시) — 경기 전 준비
//   setupPartyLine(support) → 편성 화면 코치 칩 한 줄 (data.supports[].partyPassive 글 · "80: …" · title)
import { h, avatar, openModal } from './dom.js';
import { playerArt, portraitUrl } from './art.js';

/**
 * 유대 80 글을 짧게: 앞쪽이 같으면 다른 데부터 (띄어쓰기 단위) — "팀 슛 위력 +7%" · "팀 슛 위력 +10%" → "+10%".
 * 같거나 없으면 '', 앞쪽이 다르면 유대 80 글 전체.
 */
export function bond80Short(text, text80) {
  const a = String(text ?? '');
  const b = String(text80 ?? '');
  if (!b || a === b) return '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const cut = b.lastIndexOf(' ', i);
  return cut > 0 ? b.slice(cut + 1) : b;
}

/** 코치 얼굴 글자: "코치 하르나" → "하르나" (보상 모달 shortOf 와 같다) */
const shortName = (name) => String(name || '').trim().split(/\s+/).pop();

function supportsOf(data) {
  return Array.isArray(data?.supports) ? data.supports : (data?.supports?.supports || []);
}

/** 상점 칩 한 개의 상태 문구 (보유 · 살 수 없음 이유 · SP 부족) — title · 테스트용 */
export function chipState(row, sp) {
  if (row.owned) return { key: 'owned', text: '보유' };
  if (!row.ok) return { key: 'locked', text: row.reason || '살 수 없음' };
  if (!row.affordable) return { key: 'poor', text: `SP 부족 (${sp}/${row.cost})` };
  return { key: 'buy', text: `${row.cost} SP` };
}

/** 값: 힌트가 있으면 원가 취소선 + 할인 값 */
function costEl(row, compact) {
  const discounted = row.level > 0 && row.baseCost !== row.cost;
  return h('span', { class: ['ps-cost', row.affordable || row.owned || !row.ok ? '' : 'bad'] },
    discounted ? h('s', { class: 'ps-base' }, row.baseCost) : null,
    h('b', {}, row.cost), compact ? null : ' SP');
}

/**
 * 선수 7줄 × 패시브 칩 3 (고유 먼저). compact = 상담 오른쪽 칸 (칩 = 이름 · 값 두 줄, 설명은 title).
 * @param {object} ctx 화면 ctx (data)
 * @param {object} view lessonRun.getPassiveShopView
 * @param {{ compact?: boolean, onBuy: (args: { skillId: string, playerId: string }) => void, rec?: { skillId, playerId }|null, just?: string|null }} o
 */
export function passiveShopGrid(ctx, view, o) {
  const sp = Number(view?.sp) || 0;
  const open = view?.open !== false;
  const compact = !!o.compact;
  const players = Array.isArray(view?.players) ? view.players : [];
  return h('div', { class: ['ps-grid', compact ? 'compact' : ''] }, players.map((p) => {
    const rows = (Array.isArray(p.rows) ? p.rows : []).slice().sort((a, b) => Number(!!b.unique) - Number(!!a.unique));
    const buyable = rows.filter((r) => r.affordable).length;
    const who = h('div', { class: 'ps-who', title: `${p.name} · ${p.slot ?? ''} — 패시브 보유 ${p.owned ?? 0}/${rows.length}` },
      avatar(p.portraitColor, p.name, compact ? 'xs' : 'sm', '', { art: playerArt(ctx, p) }),
      h('span', { class: 'ps-who-txt' },
        h('span', { class: 'ps-who-nm' }, h('b', {}, p.name), h('span', { class: 'ps-slot' }, p.slot ?? '')),
        h('span', { class: 'ps-who-sub' }, `보유 ${p.owned ?? 0}/${rows.length}`,
          buyable && open ? h('span', { class: 'ps-can' }, ` · 살 수 있음 ${buyable}`) : null)));
    const chips = rows.map((r) => {
      const stt = chipState(r, sp);
      const isRec = !!o.rec && o.rec.skillId === r.skillId && o.rec.playerId === p.id;
      const can = open && stt.key === 'buy';
      const lv = r.level > 0 ? h('span', { class: 'badge badge-purple ps-lv', title: `힌트 Lv${r.level} — ${r.level * 10}% 할인` }, compact ? `Lv${r.level}` : `힌트 Lv${r.level}`) : null;
      const right = stt.key === 'owned' ? h('span', { class: 'ps-own' }, '✓ 보유')
        : stt.key === 'locked' ? h('span', { class: 'ps-why' }, stt.text)
          : costEl(r, compact);
      const title = [
        `${p.name} — ${r.unique ? '고유 ' : ''}패시브 '${r.name}'`,
        r.description,
        stt.key === 'owned' ? '보유' : stt.key === 'locked' ? `살 수 없음: ${stt.text}`
          : `${r.level > 0 ? `원가 ${r.baseCost} SP − 힌트 Lv${r.level} 할인 = ` : ''}${r.cost} SP${stt.key === 'poor' ? ` · ${stt.text}` : ''}`,
        !open && stt.key !== 'owned' ? '지금은 살 수 없습니다 (주 선택 · 상담 · 경기 전 준비에서)' : '',
        isRec && can ? '감독 추천' : '',
      ].filter(Boolean).join('\n');
      return h('button', {
        type: 'button',
        class: ['ps-chip', `st-${stt.key}`, r.unique ? 'unique' : '', isRec && can ? 'recommended' : '', o.just === `${p.id}|${r.skillId}` ? 'just' : ''],
        dataset: { skill: r.skillId, pid: p.id, state: stt.key },
        disabled: !can,
        title,
        onclick: () => { if (can) o.onBuy({ skillId: r.skillId, playerId: p.id }); },
      },
      compact
        ? [
          h('span', { class: 'ps-name' }, r.name),
          h('span', { class: 'ps-line' }, right, lv),
        ]
        : [
          h('span', { class: 'ps-top' },
            r.unique ? h('span', { class: 'badge badge-gold ps-uq' }, '고유') : null,
            h('b', { class: 'ps-name' }, r.name),
            lv,
            h('span', { class: 'grow' }),
            right),
          h('span', { class: 'ps-desc' }, r.description || ''),
        ],
      isRec && can ? h('span', { class: 'ps-rec' }, '추천') : null);
    });
    return h('div', { class: ['ps-row', p.owned >= rows.length && rows.length ? 'full' : ''], dataset: { pid: p.id } }, who, chips);
  }));
}

/**
 * [✦ 패시브 · SP 140 ③] — ③ = view.shopBuyable (지금 SP 로 살 수 있는 선수 · 패시브 쌍, 0 이면 없음)
 * @param {{ status?: { sp }, shopBuyable?: number }} view 주 · 경기 전 준비 뷰
 */
export function passiveShopButton(view, { onClick, disabled = false, cls = '' } = {}) {
  const sp = Number(view?.status?.sp) || 0;
  const n = Number(view?.shopBuyable) || 0;
  return h('button', {
    type: 'button',
    class: ['btn', 'ps-open', n > 0 && !disabled ? 'has-buy' : '', cls],
    disabled,
    title: n > 0 ? `패시브 상점 — 지금 SP 로 살 수 있는 패시브 ${n}개` : '패시브 상점 — 선수마다 3개 (고유 1 + 공용 2), SP 로 산다',
    onclick: () => { if (!disabled && onClick) onClick(); },
  },
  h('span', { class: 'ps-open-ico', 'aria-hidden': 'true' }, '✦'), '패시브 · SP ', h('b', {}, sp),
  n > 0 && !disabled ? h('span', { class: 'ps-badge', 'aria-label': `살 수 있음 ${n}` }, n) : null);
}

/**
 * 패시브 상점 모달 (주 · 상담 · 경기 전 준비). 칩을 누르면 onBuy → 성공하면 모달 내용만 다시 그린다.
 * @param {object} ctx 화면 ctx (store · data · run · manager · safe)
 * @param {{ onBuy: (args) => boolean, onClose?: (r: { bought: number }) => void }} o
 */
export function openPassiveShop(ctx, o) {
  const { store, data, run, manager, safe } = ctx;
  const body = h('div', { class: 'col ps-modal' });
  let bought = 0;
  let just = null;
  const draw = () => {
    const state = store.run;
    const view = safe(() => run.getPassiveShopView(state, data));
    if (!view) { body.replaceChildren(h('p', { class: 'bad' }, '패시브 정보를 불러올 수 없습니다.'), closeBtn()); return; }
    const rec = manager && typeof manager.recommendPassive === 'function' && view.open ? safe(() => manager.recommendPassive(state, data)) : null;
    body.replaceChildren(
      h('div', { class: 'ps-head' },
        h('h3', {}, h('span', { class: 'ps-open-ico', 'aria-hidden': 'true' }, '✦'), ' 패시브 (SP)'),
        h('span', { class: 'tiny muted ps-rule' },
          '선수마다 3개 — 고유 1 + 공용 2 · 힌트 Lv 마다 10% 할인 · 스킬 슬롯(액티브 3칸)을 쓰지 않습니다',
          view.open ? '' : ' · 지금은 살 수 없습니다'),
        h('span', { class: 'grow' }),
        h('span', { class: 'status-chip ps-sp', title: '스킬 포인트' }, 'SP ', h('b', {}, view.sp)),
        closeBtn()),
      passiveShopGrid(ctx, view, {
        rec,
        just,
        onBuy: (args) => {
          if (o.onBuy(args)) { bought += 1; just = `${args.playerId}|${args.skillId}`; draw(); }
        },
      }),
      h('p', { class: 'tiny muted ps-foot' },
        '칩을 누르면 바로 삽니다. SP 는 레슨 클리어 · 퍼펙트 · 친선전 · 수업 거절로 얻고, 힌트는 레슨에서 많이 큰 선수에게 나옵니다.'));
  };
  const closeBtn = () => h('button', { class: 'btn btn-sm btn-ghost ps-close', onclick: () => handle.close() }, '닫기');
  draw();
  const handle = openModal(body, { className: 'modal-xl passive-shop', onClose: () => { if (o.onClose) o.onClose({ bought }); } });
  return handle;
}

/**
 * 코치 파티 패시브 줄 (주 · 경기 전 준비): 코치 얼굴 · 이름 · 글, 유대 80 이면 금색 "유대 80" (아니면 title 에 유대 80 글).
 * @param {Array<{ id, coachId, coachName, name, text, text80, upgraded }>} list lessonRun.getPartyPassives 모양
 */
export function partyPassiveRows(list, data, { cls = '' } = {}) {
  const sups = supportsOf(data);
  return h('div', { class: ['pp-list', cls] }, (Array.isArray(list) ? list : []).map((pp) => {
    const sc = sups.find((x) => x.id === pp.coachId) || {};
    const more = pp.upgraded ? '' : bond80Short(pp.text, pp.text80);
    return h('div', {
      class: ['pp-item', pp.upgraded ? 'up' : ''],
      dataset: { coach: pp.coachId },
      title: `${pp.coachName} 파티 패시브 '${pp.name}' — ${pp.text}${pp.upgraded ? ' (유대 80)' : pp.text80 ? `\n유대 80: ${pp.text80}` : ''}\n편성하면 런 내내 우리 팀 경기 전체에`,
    },
    avatar(sc.portraitColor, shortName(pp.coachName), 'xs', '', { art: portraitUrl(data, pp.coachId) }),
    h('span', { class: 'pp-txt' },
      h('b', { class: 'pp-name' }, pp.name),
      pp.upgraded ? h('span', { class: 'badge badge-gold pp-up' }, '유대 80') : null,
      ' ', h('span', { class: 'pp-text' }, pp.text),
      more ? h('span', { class: 'pp-80' }, ` · 80: ${more}`) : null));
  }));
}

/** 편성 화면 코치 칩용: data.supports[].partyPassive → 한 줄 글 (글 · 유대 80 짧게) 과 title */
export function setupPartyLine(sp) {
  const pp = sp?.partyPassive;
  if (!pp) return null;
  const more = bond80Short(pp.text, pp.text80);
  return {
    name: pp.name,
    text: pp.text || '',
    more,
    title: `파티 패시브 '${pp.name}' — ${pp.text}${pp.text80 ? `\n유대 80: ${pp.text80}` : ''}`,
  };
}
