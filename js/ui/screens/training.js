// js/ui/screens/training.js — 훈련 화면 (phase "turn"; event/relic 모달의 배경으로도 사용)
// 가로 스테이지(1280×720), 페이지 스크롤 없음:
//   ┌ 상단 바: 시즌·턴(턴 점) │ 다음 경계전 상대 │ 컨디션·팀워크·SP·호출권 · seed ───────────┐
//   │ 훈련 칸 5개 = 세로 카드 5열 (선수별 상승치·실패율 · 서포트 · 합계)  │ 선수 패널 (체력·스탯) │
//   │ 행동 바: 기록 · 휴식 · 외출 · 미팅 · 친선전 · 호출권                │ 서포트 유대          │
//   └──────────────────────────────────────────────────────────────┘
// 칸 탭 → 훈련 상세 시트(.sheet) → [훈련하기]. 미팅 · 호출권 · 기록은 가로 모달.
import { h, avatar, openModal, closeOverlays, select, bar, pct, signed, toast, gradeBadge, gradeOf } from '../dom.js';
import * as L from '../labels.js';
import { lineupBoard, reseat, lineupIssues, meetingSwaps } from '../lineup.js';

export function renderTraining(root, ctx, { inert = false } = {}) {
  const { store, data, run, safe, actions } = ctx;
  const state = store.run;
  const cfg = data.config || {};
  const screen = h('div', { class: ['screen', 'og', 'training-screen', inert ? 'inert' : ''] });
  root.append(screen);

  const view = safe(() => run.getTurnView(state, data));
  if (!view) {
    screen.classList.add('og-error');
    screen.append(
      h('div', { class: 'error-panel' }, '훈련 화면 정보를 불러올 수 없습니다.'),
      h('p', { class: 'muted small' }, `phase: ${state?.phase ?? '?'} · 시즌 ${state?.season ?? '?'} · 턴 ${state?.turn ?? '?'}`),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'),
    );
    return;
  }

  const players = Array.isArray(view.players) ? view.players : [];
  const playerById = new Map(players.map((p) => [p.id, p]));
  const supportById = new Map((data.supports || []).map((s) => [s.id, s]));
  const charById = new Map((data.characters || []).map((c) => [c.id, c]));
  const skillById = new Map((data.skills || []).map((s) => [s.id, s]));
  const relicById = new Map((data.relics || []).map((r) => [r.id, r]));
  const turnsPerSeason = view.turnsPerSeason ?? cfg.turnsPerSeason ?? 8;
  const seasons = Number(cfg.seasons) || 3;
  const thresholds = cfg.rating?.thresholds;
  const failCls = (fr) => (fr >= 0.25 ? 'bad' : fr >= 0.1 ? 'warn' : '');
  const stamCls = (st) => (st >= 60 ? 'good' : st >= 40 ? 'warn' : 'bad');

  // ---------- 상단 바 ----------
  const nm = view.nextMatch || {};
  // 경계전까지: 이번 시즌 경계전을 이미 치름(경계전 직후 유물 선택 — 이 화면이 모달 배경) = "경계전 종료",
  // 시즌 마지막 턴(0) = "이번 턴 뒤 경계전"(턴) · "곧 경계전"(행동 뒤 이벤트), 그 밖 = "N턴 후 경계전"
  const season = view.season ?? state.season;
  const goalDone = (state.record?.goalMatches || []).some((g) => g?.season === season);
  const untilMatch = Number(view.turnsUntilMatch);
  const matchWhen = goalDone ? '경계전 종료'
    : view.turnsUntilMatch == null || !Number.isFinite(untilMatch) ? '경계전'
      : untilMatch > 0 ? `${untilMatch}턴 후 경계전`
        : state.phase === 'event' ? '곧 경계전' : '이번 턴 뒤 경계전';
  const cond = Number(view.condition ?? state.condition ?? 2);
  const turn = Number(view.turn ?? state.turn) || 0;
  const turnPips = h('span', { class: 'turn-pips', 'aria-hidden': 'true' },
    Array.from({ length: turnsPerSeason }, (_, i) =>
      h('i', { class: i + 1 < turn ? 'done' : i + 1 === turn ? 'cur' : '' })),
    h('b', { class: 'pip-match', title: '경계전' }, '⚔'));
  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'tb-turn' },
      h('div', { class: 'title-row' },
        h('h2', {}, `시즌 ${view.season ?? state.season ?? '?'}`,
          h('span', { class: 'muted tb-of' }, `/${seasons}`),
          h('span', { class: 'muted tb-turn-n' }, ` · ${view.turn ?? state.turn ?? '?'}/${turnsPerSeason}턴`))),
      turnPips),
    h('div', { class: 'card card-sm next-match' },
      h('span', { class: 'vs' }, '⚔'),
      h('span', { class: 'grow col' },
        h('span', { class: 'nm-line' }, h('b', {}, nm.opponentName ?? '?'),
          h('span', { class: 'muted' }, ` · ${matchWhen}`)),
        h('span', { class: 'small muted nm-sub' },
          `${L.ELEMENT_ICONS[nm.element] ?? ''} ${L.label(L.ELEMENT_LABELS, nm.element, '?')} · ${L.label(L.STYLE_LABELS, nm.style, '?')}` +
          ` · ${nm.possessions ?? '?'}포제션` +
          // v0.3 (§13.5): 의도 공개 → 상대 성향 요약(styleHint), 간파 사용권
          ` · 상대 ${nm.styleHint ?? '성향 ?'}${Number(nm.gaanpaTickets) > 0 ? ` · 간파 사용권 ${nm.gaanpaTickets}` : ''}`))),
    h('div', { class: 'tb-status' },
      h('div', { class: 'status-row' },
        h('span', { class: 'status-chip', title: `컨디션 ${L.CONDITION_LABELS[cond] ?? cond}` },
          '컨디션 ', condDots(cond), h('span', { class: 'muted' }, L.CONDITION_LABELS[cond] ?? '')),
        h('span', { class: 'status-chip' }, '팀워크 ', h('b', {}, view.teamwork ?? 0)),
        h('span', { class: 'status-chip' }, 'SP ', h('b', {}, view.skillPoints ?? 0)),
        h('span', { class: 'status-chip' }, '호출권 ', h('b', {}, view.summonTickets ?? 0))),
      h('span', { class: 'muted tiny tb-seed' }, `seed ${state.seed ?? ''}`)),
  );

  // ---------- 훈련 칸 (세로 카드 5열) ----------
  const maxTotal = Math.max(1, ...(view.slots || []).map((sl) => Number(sl.preview?.totalGain) || 0));
  const slotRows = h('div', { class: 'slot-rows' }, (view.slots || []).map((slot) => {
    const type = slot.type;
    const recommended = view.recommendedSlot === type;
    const pl = (slot.players || []).map((id) => playerById.get(id)).filter(Boolean);
    const sps = Array.isArray(slot.supports) ? slot.supports : [];
    const pv = slot.preview || {};
    const empty = pl.length === 0;
    const fail = Number(pv.maxFailRate) || 0;
    const ppById = new Map((pv.perPlayer || []).map((pp) => [pp.playerId, pp]));
    // 칸 선수들의 스탯별 상승 합 (주 스탯 → 부 스탯 순)
    const statSum = {};
    for (const pp of pv.perPlayer || []) for (const [st, v] of Object.entries(pp.gains || {})) statSum[st] = (statSum[st] || 0) + (Number(v) || 0);
    const sums = Object.entries(statSum).filter(([, v]) => v).sort((a, b) => b[1] - a[1]);
    return h('button', {
      // dense: 선수 + 서포트가 많으면(드묾) 서포트를 얼굴만 한 줄로 — 칸 높이 안에 들어가게
      class: ['slot-row', recommended ? 'recommended' : '', empty ? 'empty' : '', pl.length + sps.length > 8 ? 'dense' : ''],
      disabled: inert,
      dataset: { ico: L.STAT_ICONS[type] ?? '' },
      onclick: () => openTrainSheet(slot),
    },
    h('span', { class: 'slot-head' },
      h('span', { class: 'slot-ico', 'aria-hidden': 'true' }, L.STAT_ICONS[type] ?? '•'),
      h('span', { class: 'slot-name' }, L.STAT_LABELS[type] ?? type),
      h('span', { class: 'tiny muted slot-count' }, `${pl.length}명`)),
    h('span', { class: 'slot-badges' },
      recommended ? h('span', { class: 'badge badge-gold' }, '추천') : null,
      pv.friendship ? h('span', { class: 'badge badge-purple' }, '★ 우정') : null),
    // 선수 = 두 줄: 이름 · 슬롯 · 상승 합 / 스탯별 상승 · 실패율 (상세 시트의 요약 — 칸만 보고 고를 수 있게)
    h('span', { class: 'slot-players' },
      empty ? h('span', { class: 'tiny muted slot-none' }, '선수 없음')
        : pl.map((p) => {
          const pp = ppById.get(p.id);
          const gain = pp ? Object.values(pp.gains || {}).reduce((a, v) => a + (Number(v) || 0), 0) : null;
          const fr = Number(pp?.failRate) || 0;
          const parts = pp ? Object.entries(pp.gains || {}).filter(([, v]) => v) : [];
          const detail = parts.map(([st, v]) => `${L.STAT_LABELS[st] ?? st} ${signed(v)}`).join(' · ');
          return h('span', { class: 'sl-pl', title: `${p.name} · ${p.slot} · 체력 ${p.stamina}${detail ? ` · ${detail}` : ''} · 실패 ${pct(fr)}` },
            avatar(p.portraitColor, p.name, 'xs', (Number(p.stamina) || 0) < 40 ? 'dim' : ''),
            h('span', { class: 'sl-l1' },
              h('b', { class: 'sl-nm ellipsis' }, p.name),
              h('span', { class: 'sl-slot' }, p.slot ?? ''),
              gain != null ? h('span', { class: 'sl-gain' }, signed(gain)) : null),
            h('span', { class: 'sl-l2' },
              h('span', { class: 'ellipsis' }, parts.map(([st, v]) => `${L.STAT_SHORT[st] ?? st}${signed(v)}`).join(' ') || '상승 없음'),
              h('span', { class: ['sl-fail', failCls(fr)] }, pct(fr))));
        })),
    // 서포트 = 한 줄씩: 얼굴 · 이름 · ★ 우정 / 💡 힌트 · 유대
    h('span', { class: 'slot-supports' }, sps.map((sp) =>
      h('span', { class: ['sl-sp', sp.friendship ? 'friend' : ''], title: `${sp.name ?? sp.id} · 유대 ${sp.bond ?? '?'}${sp.friendship ? ' · 우정 훈련' : ''}${sp.hint ? ' · 힌트 가능' : ''}` },
        h('span', { class: 'sp-icon' },
          avatar(supportById.get(sp.id)?.portraitColor, sp.name ?? sp.id, 'xs'),
          sp.friendship ? h('span', { class: 'mark' }, '★') : null,
          sp.hint ? h('span', { class: 'mark hint' }, '💡') : null),
        h('span', { class: 'sl-spn ellipsis' }, sp.name ?? sp.id),
        h('span', { class: 'sl-bond' }, sp.bond ?? '?')))),
    h('span', { class: 'slot-foot' },
      sums.length ? h('span', { class: 'slot-sums' }, sums.slice(0, 2).map(([st, v]) =>
        h('span', {}, `${L.STAT_LABELS[st] ?? st} `, h('b', { class: 'good' }, signed(v))))) : null,
      // 합계 막대: 다섯 칸 중 가장 큰 합계 대비
      h('span', { class: 'slot-gauge', title: `합계 ${signed(pv.totalGain ?? 0)} (최대 칸 ${signed(maxTotal)})` },
        bar((Number(pv.totalGain) || 0) / maxTotal, recommended ? 'gold' : '')),
      h('span', { class: 'slot-meta' },
        h('span', {}, '합계 ', h('b', {}, signed(pv.totalGain ?? 0))),
        h('span', { class: failCls(fail) }, '실패 최대 ', h('b', {}, pct(fail))))),
    );
  }));

  // ---------- 하단 시트: 훈련 상세 ----------
  function openTrainSheet(slot) {
    const type = slot.type;
    const pv = slot.preview || {};
    const rows = (pv.perPlayer || []).map((pp) => {
      const p = playerById.get(pp.playerId);
      if (!p) return null;
      const gains = Object.entries(pp.gains || {}).filter(([, v]) => v)
        .map(([st, v]) => `${L.STAT_LABELS[st] ?? st} ${signed(v)}`).join(' · ');
      const fr = Number(pp.failRate) || 0;
      return h('div', { class: 'list-item' },
        avatar(p.portraitColor, p.name, 'md'),
        h('div', { class: 'grow col' },
          h('div', { class: 'row' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot} · 체력 ${p.stamina}`)),
          h('div', { class: 'small good' }, gains || '상승 없음'),
          h('div', { class: 'tiny muted' }, `체력 −${pp.staminaCost ?? 0} · 실패 `,
            h('span', { class: failCls(fr) }, pct(fr)))));
    }).filter(Boolean);
    const bonds = (pv.bondGain || []).map((b) => {
      const sp = supportById.get(b.supportId);
      const spv = (slot.supports || []).find((x) => x.id === b.supportId);
      return h('span', { class: 'badge' }, avatar(sp?.portraitColor, sp?.name ?? b.supportId, 'xs'),
        ` ${sp?.name ?? b.supportId} 유대 ${signed(b.amount)}${spv?.friendship ? ' ★' : ''}`);
    });
    const free = (pv.freePlayers || []).map((fp) => {
      const p = playerById.get(fp.playerId);
      const g = Object.entries(fp.gains || {}).filter(([, v]) => v)
        .map(([st, v]) => `${L.STAT_LABELS[st] ?? st} ${signed(v)}`).join(', ');
      return p ? `${p.name} ${g}` : null;
    }).filter(Boolean);

    openModal(h('div', { class: 'col', style: { gap: '10px' } },
      h('div', { class: 'sheet-handle' }),
      h('div', { class: 'row between' },
        h('h3', {}, `${L.STAT_ICONS[type] ?? ''} ${L.STAT_LABELS[type] ?? type} 훈련`),
        h('span', { class: 'row' },
          view.recommendedSlot === type ? h('span', { class: 'badge badge-gold' }, '추천') : null,
          h('span', { class: 'badge' }, `합계 ${signed(pv.totalGain ?? 0)}`),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기'))),
      rows.length ? h('div', { class: 'train-grid' }, rows)
        : h('p', { class: 'muted small' }, '이 칸에는 선수가 없습니다. 서포트 유대만 오릅니다.'),
      bonds.length ? h('div', { class: 'row wrap' }, bonds) : null,
      h('div', { class: 'sheet-foot' },
        free.length ? h('div', { class: 'tiny muted grow' }, `자율 훈련(${pct(cfg.training?.freeTrainRatio ?? 0.2)}): ${free.join(' · ')}`) : h('span', { class: 'grow' }),
        h('button', { class: 'btn btn-primary btn-lg train-go', onclick: () => { closeOverlays(); actions.doAction({ type: 'train', slot: type }); } }, '훈련하기')),
    ), { kind: 'sheet', className: 'sheet-wide' });
  }

  // ---------- 행동 확인 ----------
  function confirmAction(title, desc, action) {
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h3', {}, title),
      h('p', { class: 'small muted' }, desc),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn', onclick: closeOverlays }, '취소'),
        h('button', { class: 'btn btn-primary', onclick: () => { closeOverlays(); actions.doAction(action); } }, '실행')),
    ), { className: 'modal-md' });
  }

  // ---------- 전술 미팅 (가로 모달 3열: 전술 · 포메이션 + 라인업 보드(끌어서 자리 맞바꾸기, js/ui/lineup.js) · 스킬 상점) ----------
  function openMeeting() {
    const tactics = { ...(state.tactics || {}) };
    let formation = state.formation || '2-2-2';
    const buy = { skillId: null, playerId: null };
    const runPlayers = Array.isArray(state.players) ? state.players : [];
    const runById = new Map(runPlayers.map((p) => [p.id, p]));
    const allIds = runPlayers.map((p) => p.id);
    const currentSlotOf = (pid) => runById.get(pid)?.slot;
    // 적성: 캐릭터 데이터 기준. 배치 규칙은 엔진 validateSquad 와 같다 (lineup.js canPlay) — 모달을 닫기 전에 검사해 편집 내용이 사라지지 않게 한다.
    const aptOf = (pid, pos) => charById.get(runById.get(pid)?.charId)?.aptitude?.[pos] ?? '-';
    const nameOf = (pid) => runById.get(pid)?.name ?? pid;
    // 슬롯 → 선수 id. 처음 = 런의 지금 배치. 포메이션을 바꾸면 남는 슬롯은 그대로, 없어진 슬롯의 선수는 설 수 있는 빈 슬롯으로 (reseat)
    const seat = (from) => reseat(from, L.slotsOf(formation), aptOf, { fillAll: true, extraIds: allIds });
    let assign = seat(Object.fromEntries(runPlayers.filter((p) => p.slot).map((p) => [p.slot, p.id])));

    const body = h('div', { class: 'col meeting', style: { gap: '12px' } });
    let board = null;
    let shopScroll = 0; // 다시 그릴 때 스킬 상점 스크롤 위치 유지
    const draw = () => {
      if (board) board.cancel();
      shopScroll = body.querySelector('.shop-list')?.scrollTop ?? shopScroll;
      body.replaceChildren(...build());
      const list = body.querySelector('.shop-list');
      if (list) list.scrollTop = shopScroll;
    };

    function build() {
      const slots = L.slotsOf(formation);
      const shop = Array.isArray(view.shop) ? view.shop : [];
      const sp = Number(view.skillPoints) || 0;
      const fieldSel = (key) => h('div', { class: 'field' }, h('label', {}, L.TACTIC_LABELS[key]),
        select(L.TACTIC_OPTIONS[key], tactics[key], (v) => { tactics[key] = v; }));
      // 라인업 보드: 슬롯 카드를 끌어 다른 슬롯에 놓으면 맞바꾸기 (초록 가능 · 빨강 불가), 눌러서 고른 뒤 다른 선수를 눌러도 된다
      board = lineupBoard({
        slots,
        assign,
        compact: true,
        aptOf,
        nameOf,
        colorOf: (pid) => runById.get(pid)?.portraitColor,
        slotBody: (pid, sl) => {
          const p = playerById.get(pid) ?? runById.get(pid);
          const was = currentSlotOf(pid);
          const main = p?.mainStat;
          const injured = Number(p?.injuredTurns) > 0;
          return [
            avatar(p?.portraitColor, p?.name, 'sm', injured ? 'dim' : ''),
            h('span', { class: 'grow col' },
              h('span', { class: 'ellipsis slot-nm' }, p?.name ?? pid),
              was !== sl
                ? h('span', { class: 'tiny warn ellipsis' }, `← 원래 ${was ?? '-'}`)
                : h('span', { class: 'tiny muted ellipsis' }, injured ? `부상 ${p.injuredTurns}턴`
                  : main ? `${L.STAT_LABELS[main] ?? main} ${Math.round(Number(p.stats?.[main]) || 0)}` : '')),
          ];
        },
        onChange: (next) => { assign = next; draw(); },
      });
      const moved = slots.filter((sl) => assign[sl] && currentSlotOf(assign[sl]) !== sl).length;
      return [
        h('div', { class: 'row between' },
          h('h3', {}, '📋 전술 미팅'),
          h('span', { class: 'row' },
            h('span', { class: 'badge badge-accent' }, `팀워크 +${cfg.meeting?.teamwork ?? 10}`),
            h('span', { class: 'tiny muted' }, '턴을 소모합니다'))),
        h('div', { class: 'meeting-cols' },
          h('section', { class: 'meeting-col' },
            h('h4', { class: 'og-panel-title' }, '전술 지시'),
            L.TACTIC_MAIN_KEYS.map(fieldSel),
            h('div', { class: 'divider' }),
            ['tension', 'duelPicker'].map(fieldSel)),
          h('section', { class: 'meeting-col meeting-board' },
            h('div', { class: 'row between' },
              h('h4', { class: 'og-panel-title' }, '포메이션 · 포지션'),
              h('div', { class: 'field meeting-formation' }, h('label', {}, '포메이션'),
                select(Object.keys(L.FORMATIONS).map((f) => [f, `${f} (DF ${L.FORMATIONS[f].DF} · MF ${L.FORMATIONS[f].MF} · FW ${L.FORMATIONS[f].FW})`]), formation, (v) => {
                  formation = v;
                  assign = seat(assign);
                  draw();
                }, { 'aria-label': '포메이션' }))),
            board.pitch,
            h('p', { class: 'tiny muted' },
              '선수를 끌어 다른 자리에 놓으면 자리를 맞바꿉니다 — ', h('b', { class: 'good' }, '초록'), ' 가능 · ', h('b', { class: 'bad' }, '빨강'), ' 불가. 선수를 누른 뒤 다른 선수를 눌러도 됩니다.',
              moved ? h('span', { class: 'warn' }, ` · 자리 변경 ${moved}명`) : null)),
          h('section', { class: 'meeting-col shop-col' },
            h('div', { class: 'row between' }, h('h4', { class: 'og-panel-title' }, '스킬 상점'), h('span', { class: 'badge' }, `SP ${sp}`)),
            shop.length === 0
              ? h('p', { class: 'tiny muted' }, '힌트를 보유한 스킬이 없습니다. 서포트와 훈련하거나 이벤트로 힌트를 얻으세요.')
              : h('div', { class: 'list shop-list og-scroll' }, shop.map((item) => {
                const price = Number(item.discountedCost ?? item.cost) || 0;
                const eligible = Array.isArray(item.eligiblePlayerIds) ? item.eligiblePlayerIds : [];
                const chosen = buy.skillId === item.skillId;
                const affordable = price <= sp;
                const desc = skillById.get(item.skillId)?.description ?? '';
                return h('div', { class: ['list-item', 'col', !affordable || !eligible.length ? 'disabled' : '', chosen ? 'chosen' : ''], style: { alignItems: 'stretch' } },
                  h('div', { class: 'row between' },
                    h('span', { class: 'col' },
                      h('b', {}, item.name ?? item.skillId),
                      desc ? h('span', { class: 'tiny muted' }, desc) : null,
                      h('span', { class: 'tiny muted' }, `힌트 Lv${item.hintLevel ?? 0} · ${item.cost != null && item.cost !== price ? `${item.cost} → ` : ''}${price} SP`)),
                    h('button', {
                      class: ['btn', 'btn-sm', chosen ? 'active' : ''],
                      disabled: !affordable || !eligible.length,
                      onclick: () => {
                        if (chosen) { buy.skillId = null; buy.playerId = null; } else { buy.skillId = item.skillId; buy.playerId = eligible[0] ?? null; }
                        draw();
                      },
                    }, chosen ? '선택됨' : '구매')),
                  chosen ? h('div', { class: 'field' }, h('label', {}, '배울 선수'),
                    select(eligible.map((pid) => [pid, `${playerById.get(pid)?.name ?? pid} (${currentSlotOf(pid) ?? ''})`]), buy.playerId, (v) => { buy.playerId = v; })) : null,
                );
              })))),
        h('div', { class: 'row end modal-foot' },
          h('button', { class: 'btn', onclick: closeOverlays }, '취소'),
          h('button', { class: 'btn btn-primary', onclick: submit }, '미팅 진행')),
      ];
    }

    function submit() {
      const slots = L.slotsOf(formation);
      const ids = slots.map((sl) => assign[sl]).filter(Boolean);
      if (ids.length !== slots.length || new Set(ids).size !== ids.length) return toast('포지션 배치에 빠진 선수나 중복이 있습니다.');
      for (const is of lineupIssues({ slots, assign, aptOf })) {
        const pos = L.positionOfSlot(is.slot);
        if (pos === 'GK' && aptOf(is.id, pos) !== '-') return toast(`GK는 적성 A/B만 배치할 수 있습니다 (${nameOf(is.id)}: ${aptOf(is.id, pos)}).`);
        return toast(`${nameOf(is.id)}은(는) ${pos} 적성이 없어 ${is.slot}에 배치할 수 없습니다.`);
      }
      if (buy.skillId && buy.playerId) {
        // 엔진(canLearnSkill positionOverride)과 같이 새 포지션 기준으로 스킬 포지션 조건을 확인
        const sk = skillById.get(buy.skillId);
        const newSlot = slots.find((sl) => assign[sl] === buy.playerId);
        const newPos = newSlot ? L.positionOfSlot(newSlot) : null;
        if (newPos && Array.isArray(sk?.positions) && sk.positions.length && !sk.positions.includes(newPos)) {
          return toast(`${sk.name ?? buy.skillId}은(는) ${sk.positions.join('/')} 선수만 배울 수 있습니다 (${nameOf(buy.playerId)} → ${newPos}).`);
        }
      }
      const action = { type: 'meeting', tactics };
      if (formation !== state.formation) action.formation = formation;
      // 엔진은 swaps 를 순서대로 적용(자리 맞바꾸기) → 최종 배치 = assign (lineup.js meetingSwaps, test/lineup.test.mjs)
      const swaps = meetingSwaps(slots, assign, currentSlotOf);
      if (swaps.length) action.swaps = swaps;
      if (buy.skillId && buy.playerId) action.buy = { skillId: buy.skillId, playerId: buy.playerId };
      if (board) board.cancel();
      closeOverlays();
      actions.doAction(action);
    }

    draw();
    openModal(body, { className: 'modal-xl', onClose: () => { if (board) board.cancel(); } });
  }

  // ---------- 호출권 ----------
  function openSummon() {
    const eligible = players.filter((p) => !(Number(p.injuredTurns) > 0));
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'row between' }, h('h3', {}, '📣 호출권 — 선수 선택'), h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('p', { class: 'tiny muted' }, '선택한 선수를 원하는 훈련 칸으로 부릅니다. 턴을 소모하지 않습니다.'),
      h('div', { class: 'pick-grid cols-3' }, eligible.map((p) => {
        const st = Number(p.stamina) || 0;
        return h('button', { class: 'char-pick', onclick: () => pickSlot(p) },
          avatar(p.portraitColor, p.name, 'md'),
          h('span', { class: 'grow col' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot} · 체력 ${p.stamina}`),
            bar(st / 100, stamCls(st))));
      })),
    ), { className: 'modal-lg' });
    function pickSlot(p) {
      closeOverlays();
      openModal(h('div', { class: 'col', style: { gap: '12px' } },
        h('h3', {}, `${p.name} → 어느 칸으로?`),
        h('div', { class: 'summon-slots' }, L.STATS.map((st) => h('button', {
          class: ['btn', 'btn-col', view.recommendedSlot === st ? 'active' : ''],
          onclick: () => { closeOverlays(); actions.doAction({ type: 'summon', playerId: p.id, slot: st }); },
        }, h('span', { class: 'ico' }, L.STAT_ICONS[st] ?? ''), h('span', {}, `${L.STAT_LABELS[st]}${view.recommendedSlot === st ? ' (추천)' : ''}`)))),
        h('div', { class: 'row end' }, h('button', { class: 'btn btn-ghost', onclick: closeOverlays }, '취소')),
      ), { className: 'modal-lg' });
    }
  }

  // ---------- 유물 · 보정 · 기록 (모달) ----------
  const relics = Array.isArray(view.relics) ? view.relics : (state.relics || []);
  const mods = Array.isArray(view.modifiers) ? view.modifiers : (state.modifiers || []);
  const log = Array.isArray(view.log) ? view.log : (state.log || []).slice(-20);
  const modText = (m) => `${m.key} ${signed((Number(m.amount) || 0) * (Math.abs(m.amount) < 1 ? 100 : 1))}${Math.abs(m.amount) < 1 ? '%' : ''}${m.untilSeason != null ? ` (시즌 ${m.untilSeason}까지)` : ''}`;
  function openExtras() {
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('div', { class: 'row between' },
        h('h3', {}, '📜 유물 · 보정 · 기록'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: closeOverlays }, '닫기')),
      h('div', { class: 'extras-cols' },
        h('section', { class: 'col extras-col' },
          h('h4', { class: 'og-panel-title' }, `유물 ${relics.length}`),
          relics.length ? h('div', { class: 'list og-scroll' }, relics.map((id) => {
            const r = relicById.get(id);
            return h('div', { class: 'list-item col', style: { alignItems: 'flex-start', gap: '2px' } },
              h('span', { class: 'row' }, h('b', { class: 'gold' }, r?.name ?? id), r?.rarity ? h('span', { class: ['tiny', `rarity-${r.rarity}`] }, r.rarity) : null),
              r?.description ? h('span', { class: 'tiny muted' }, r.description) : null);
          })) : h('p', { class: 'tiny muted' }, '보유한 유물이 없습니다.'),
          h('h4', { class: 'og-panel-title', style: { marginTop: '6px' } }, `보정 ${mods.length}`),
          mods.length ? h('div', { class: 'row wrap' }, mods.map((m) => h('span', { class: 'badge' }, modText(m))))
            : h('p', { class: 'tiny muted' }, '적용 중인 보정이 없습니다.')),
        h('section', { class: 'col extras-col' },
          h('h4', { class: 'og-panel-title' }, '최근 기록'),
          log.length ? h('ul', { class: 'log-list og-scroll' }, [...log].reverse().map((l) =>
            h('li', {}, `${l.turnIndex != null ? `T${l.turnIndex + 1} · ` : ''}${l.text ?? ''}`)))
            : h('p', { class: 'tiny muted' }, '기록이 없습니다.'))),
    ), { className: 'modal-lg' });
  }

  // ---------- 행동 바 ----------
  const friendName = view.friendSupportId ? (supportById.get(view.friendSupportId)?.name ?? '친구') : null;
  const fr = cfg.friendly || {};
  const abtn = (ico, text, onclick, disabled = false) =>
    h('button', { class: 'btn', disabled: inert || disabled, onclick }, h('span', { class: 'ico' }, ico), h('span', {}, text));
  const actionbar = h('div', { class: 'actionbar' },
    h('button', { class: 'btn btn-ghost extras-btn', disabled: inert, onclick: openExtras, title: '유물 · 보정 · 기록 보기' },
      h('span', { class: 'ico' }, '📜'),
      h('span', { class: 'col' }, h('span', {}, '기록'), h('span', { class: 'tiny muted' }, `유물 ${relics.length} · 보정 ${mods.length}`))),
    abtn('🛌', '휴식', () => confirmAction('휴식', `전원 체력 +${cfg.rest?.stamina ?? 40}, ${pct(cfg.rest?.conditionUpChance ?? 0.3)} 확률로 컨디션 +1. 턴을 소모합니다.`, { type: 'rest' })),
    abtn('🚶', '외출', () => confirmAction('외출', friendName
      ? `${friendName}와 외출: 유대 +${cfg.outing?.bond ?? 10}, 컨디션 +1, 조건을 채운 서포트 이벤트가 바로 발생합니다. 턴을 소모합니다.`
      : `컨디션 +1, 전원 체력 +${cfg.outing?.teamStamina ?? 10}. 턴을 소모합니다.`, { type: 'outing' })),
    abtn('📋', '미팅', openMeeting),
    abtn('🤝', '친선전', () => confirmAction('친선전', `전원 체력 −${fr.staminaCost ?? 30}. 승리 SP +${fr.skillPointsWin ?? 20} / 패배 SP +${fr.skillPointsLoss ?? 10}, 승리 시 ${pct(fr.relicChanceOnWin ?? 0.3)} 확률로 유물 선택. 턴을 소모합니다.`, { type: 'friendly' })),
    abtn('📣', `호출권 ${view.summonTickets ?? 0}`, openSummon, !(Number(view.summonTickets) > 0)),
  );

  // ---------- 선수 패널 (체력 · 스탯) + 서포트 유대 ----------
  const frTh = Number(cfg.training?.friendshipThreshold) || 80;
  const roster = h('aside', { class: 'og-panel roster' },
    h('div', { class: 'og-panel-head' },
      h('h3', { class: 'og-panel-title' }, `선수 ${players.length}`),
      h('span', { class: 'badge' }, view.formation ?? state.formation ?? '')),
    h('div', { class: 'ro-list' }, players.map((p) => {
      const st = Number(p.stamina) || 0;
      const injured = Number(p.injuredTurns) > 0;
      return h('div', { class: ['ro-row', injured ? 'injured' : ''], title: `${p.name} · ${p.slot} · 체력 ${st}${injured ? ` · 부상 ${p.injuredTurns}턴` : ''}` },
        avatar(p.portraitColor, p.name, 'xs', injured || st < 40 ? 'dim' : ''),
        h('span', { class: 'ro-name' }, h('b', { class: 'ellipsis' }, p.name), h('span', { class: 'ro-slot' }, p.slot ?? ''),
          injured ? h('span', { class: 'badge badge-bad' }, `부상 ${p.injuredTurns}턴`) : null),
        h('span', { class: 'ro-stam' }, bar(st / 100, stamCls(st)), h('b', { class: stamCls(st) }, st)),
        h('span', { class: 'ro-stats' }, L.STATS.map((k) => {
          const v = Math.round(Number(p.stats?.[k]) || 0);
          return h('span', { class: ['ro-st', k === p.mainStat ? 'main' : ''], title: `${L.STAT_LABELS[k]} ${v}` },
            h('span', { class: 'ro-k' }, L.STAT_SHORT[k]), gradeBadge(gradeOf(v, thresholds), 'xs'), h('span', { class: 'ro-v' }, v));
        })));
    })),
    h('div', { class: 'og-panel-head bond-head' },
      h('h3', { class: 'og-panel-title' }, '서포트 유대'),
      h('span', { class: 'tiny muted' }, `★ 우정 훈련 = 유대 ${frTh}+ · 같은 타입 칸`)),
    h('div', { class: 'bond-grid' }, (view.supports || []).map((sp) => {
      const b = Number(sp.bond) || 0;
      return h('div', { class: ['bond-row', b >= frTh ? 'max' : ''], title: `${sp.name} · ${L.SUPPORT_TYPE_LABELS[sp.type] ?? sp.type ?? ''} · 유대 ${b}` },
        avatar(sp.portraitColor, sp.name, 'xs'),
        h('span', { class: 'bond-nm ellipsis' }, sp.name),
        h('span', { class: 'bond-bar' }, bar(b / 100, b >= frTh ? 'good' : ''), h('i', { class: 'bond-th', style: { left: `${frTh}%` } })),
        h('b', { class: 'bond-n' }, b));
    })),
  );

  screen.append(topbar, slotRows, roster, actionbar);
}

function condDots(cond) {
  const c = Math.max(0, Math.min(4, Number(cond) || 0));
  return h('span', { class: 'cond-dots' }, [0, 1, 2, 3, 4].map((i) => h('i', { class: i <= c ? 'on' : '' })));
}
