// js/ui/screens/challenge.js — 도전 모드 (2026-10-01, 플레이테스트용 — 밸런스 확정 아님): 완성된 팀으로 1~10단계 사다리
// 가로 스테이지(1280×720), 페이지 스크롤 없음 (팀 목록만 안쪽 스크롤):
//   위 = 머리 줄 (제목 · 안내 · [처음으로])
//   왼쪽 = 팀 선택(등록 팀 + 테스트용 샘플 팀) + 고른 팀 요약(선수 7명 · 진행 · [진행 초기화])
//   가운데 = 단계 사다리 10칸 (번호 · 상대 · 부제 · 기능 배지 · 전력 · 잠김/도전 가능/클리어 · 승수)
//   오른쪽 = 고른 단계 미리보기 (상대 포메이션 미니 필드 · 선수 7명 · 성향 · 기능) + [도전]
// 결과 모달 (store.challenge.result — app.js finishChallengeMatch 가 채운다): 승리/패배 · 점수 · 단계 · [다음 단계] [다시 도전] [도전 목록]
// 규칙 · 상대 생성 · 진행 기록은 엔진 js/engine/challenge.js (ctx.challenge). 저장(localStorage)은 app.js actions · store.js 가 한다.
import { h, gradeBadge, gradeOf, fmtDate, panel, openModal } from '../dom.js';
import { loadTeams, loadChallengeProgress } from '../store.js';
import * as L from '../labels.js';
import { slotSpot } from '../lineup.js';

// 기능 배지 색 (엔진 FEATURE_KEYS: active · gaanpa · ultShot · ultSave · cannon)
const FEATURE_CLASS = { active: 'badge-accent', gaanpa: 'badge-purple', ultShot: 'badge-gold', ultSave: 'badge-gold', cannon: 'badge-warn' };
const STATE_LABELS = { locked: '잠김', open: '도전 가능', cleared: '클리어' };
// 미리보기에 보이는 상대 전술 (성향 힌트 옆)
const PREVIEW_TACTICS = ['attack', 'defense', 'tension'];

export function renderChallenge(root, ctx) {
  const { store, data, actions } = ctx;
  const ch = ctx.challenge;
  if (!ch || !data?.challenge) {
    root.append(h('div', { class: 'screen og challenge-screen ch-missing' },
      h('div', { class: 'error-panel' }, h('b', {}, '도전 모드를 열 수 없습니다'),
        h('div', {}, !ch ? '엔진 모듈(js/engine/challenge.js)을 불러오지 못했습니다.' : '데이터 파일 data/challenge.json 이 없습니다.')),
      h('div', { class: 'btn-list' }, h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'))));
    return;
  }
  const cs = store.challenge;
  const progress = ch.normalizeProgress(loadChallengeProgress());
  const teams = ch.listChallengeTeams(loadTeams(), data);
  // 팀 고르기: 고른 팀이 목록에 없으면 가장 최근 등록 팀, 등록 팀이 없으면 샘플 팀
  if (!teams.some((t) => t.teamId === cs.teamId)) {
    cs.teamId = (teams.find((t) => !t.summary.isSample) || teams[0] || {}).teamId ?? null;
    cs.stage = null;
  }
  const entry = teams.find((t) => t.teamId === cs.teamId) || null;
  const total = ch.stageCount(data);
  const ladder = ch.ladderView(data, progress, cs.teamId);
  const tp = ch.teamProgress(progress, cs.teamId);
  // 단계 고르기: 없으면 열린 가장 높은 단계 (잠긴 단계도 미리보기로는 고를 수 있다)
  if (!ladder.some((s) => s.stage === cs.stage)) {
    const open = ladder.filter((s) => s.state !== 'locked');
    cs.stage = (open.find((s) => s.state === 'open') || open[open.length - 1] || ladder[0])?.stage ?? 1;
  }
  const sel = ladder.find((s) => s.stage === cs.stage) || ladder[0];

  const head = h('header', { class: 'og-head ch-head' },
    h('h2', {}, '도전 모드'),
    h('span', { class: 'badge badge-warn' }, '플레이테스트'),
    h('span', { class: 'muted small ellipsis' }, `완성된 팀으로 1~${total}단계 — 이기면 다음 단계가 열립니다. 단계마다 상대 스탯 · 스킬이 늘어납니다.`),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn btn-ghost', onclick: () => actions.resetToStart() }, '처음으로'));

  const left = h('div', { class: 'ch-left' },
    teamListPanel(teams, cs.teamId, progress, ch, total, actions),
    entry ? teamPanel(entry.summary, tp, ch, total, ctx) : panel('선택한 팀', { cls: 'ch-team-sum grow-panel' },
      h('p', { class: 'muted small' }, '도전할 팀이 없습니다. 런을 완주하고 결과 화면에서 [팀 등록]을 누르세요.')));

  root.append(h('div', { class: 'screen og challenge-screen' },
    head,
    left,
    ladderPanel(ladder, sel, tp, total, actions),
    previewPanel(sel, entry, ctx)));

  if (cs.result) openResultModal(cs.result, ctx, total);
}

/* ------------------------------------------------------------------ */
/* 왼쪽: 팀 선택 · 고른 팀 요약                                           */
/* ------------------------------------------------------------------ */
function teamListPanel(teams, selId, progress, ch, total, actions) {
  return panel(`팀 선택 (${teams.length})`, { cls: 'ch-teams', scroll: true },
    teams.length === 0
      ? h('p', { class: 'muted small' }, '고를 수 있는 팀이 없습니다.')
      : h('div', { class: 'ch-team-list', role: 'listbox', 'aria-label': '도전할 팀' }, teams.map(({ teamId, summary: s }) => {
        const cleared = ch.teamProgress(progress, teamId).cleared;
        return h('button', {
          class: ['btn', 'ch-team', teamId === selId ? 'sel' : '', s.isSample ? 'sample' : ''],
          type: 'button',
          role: 'option',
          'aria-selected': teamId === selId ? 'true' : 'false',
          dataset: { team: teamId },
          onclick: () => actions.selectChallengeTeam(teamId),
        },
        gradeBadge(s.grade ?? '-', 'mid'),
        h('span', { class: 'ch-team-txt' },
          h('span', { class: 'row ch-team-name' },
            h('b', { class: 'ellipsis' }, s.name),
            s.isSample ? h('span', { class: 'badge badge-warn' }, '테스트용') : null),
          h('span', { class: 'tiny muted ellipsis' },
            [s.formation, `전력 ${s.power}`, s.score != null ? `점수 ${Math.round(Number(s.score) || 0)}` : null,
              s.isSample ? '고정 팀' : fmtDate(s.registeredAt)].filter(Boolean).join(' · '))),
        h('span', { class: ['ch-team-prog', cleared >= total ? 'all' : ''], title: `클리어 ${cleared}/${total}단계` },
          h('b', {}, cleared), `/${total}`));
      })));
}

function teamPanel(s, tp, ch, total, ctx) {
  const { actions, thresholds } = ctx;
  const played = Object.values(tp.attempts).reduce((a, b) => a + b, 0);
  const won = Object.values(tp.wins).reduce((a, b) => a + b, 0);
  const badges = ch.featureBadges(s.features);
  return panel('선택한 팀', {
    cls: 'ch-team-sum grow-panel',
    right: h('button', {
      class: 'btn btn-sm btn-ghost ch-reset',
      type: 'button',
      disabled: played === 0 && tp.cleared === 0,
      title: '이 팀의 도전 진행 기록(클리어 · 도전 · 승리)을 지웁니다',
      onclick: () => actions.resetChallenge(s.teamId),
    }, '진행 초기화'),
  },
  h('div', { class: 'row ch-sum-head' },
    gradeBadge(s.grade ?? '-', 'mid'),
    h('div', { class: 'col grow' },
      h('b', { class: 'ellipsis' }, s.name),
      h('span', { class: 'tiny muted ellipsis' },
        [s.formation, `팀워크 ${s.teamwork}`, s.score != null ? `점수 ${Math.round(Number(s.score) || 0)}` : null,
          s.isSample ? '고정 팀' : fmtDate(s.registeredAt)].filter(Boolean).join(' · '))),
    h('span', { class: 'ch-power', title: '선수 7명 × 5스탯 평균' }, h('span', { class: 'tiny muted' }, '전력'), h('b', {}, s.power))),
  h('div', { class: 'ch-pl-list' }, s.players.map((p) => playerRow(p, thresholds))),
  h('dl', { class: 'ch-sum-more tiny' },
    h('dt', {}, '유물'),
    h('dd', { class: 'ellipsis', title: s.relics.map((r) => r.name).join(', ') }, s.relics.length ? s.relics.map((r) => r.name).join(' · ') : '없음'),
    h('dt', {}, '전술'),
    h('dd', { class: 'ch-clamp' }, L.TACTIC_SETUP_KEYS.concat('tension').map((k) => `${L.TACTIC_LABELS[k]} ${L.tacticLabel(k, s.tactics?.[k])}`).join(' · ')),
    h('dt', {}, '최근'),
    h('dd', { class: 'ellipsis' }, tp.lastResult ? lastResultText(tp.lastResult) : '아직 도전 기록이 없습니다')),
  h('div', { class: 'row ch-sum-foot' },
    badges.length ? h('span', { class: 'row ch-badges' }, badges.map((b) => featureBadge(b))) : h('span', { class: 'tiny muted' }, '스킬 기능 없음'),
    h('span', { class: 'grow' }),
    h('span', { class: 'small' }, '클리어 ', h('b', {}, `${tp.cleared}/${total}`), h('span', { class: 'muted' }, ` · ${played}전 ${won}승`))));
}

/** 진행 기록 lastResult 한 줄: "4단계 2회차 · 1:2 패" (승부차기면 괄호) · 경기 중 [포기] = "4단계 2회차 · 기권 패 (0:0)" */
function lastResultText(r) {
  const when = r.at ? ` · ${fmtDate(r.at)}` : '';
  if (r.forfeit) return `${r.stage}단계 ${r.attempt}회차 · 기권 패 (${r.homeGoals}:${r.awayGoals})${when}`;
  const pen = r.penalties ? ` (승부차기 ${r.penalties.home}:${r.penalties.away})` : '';
  return `${r.stage}단계 ${r.attempt}회차 · ${r.homeGoals}:${r.awayGoals}${pen} ${r.win ? '승' : '패'}${when}`;
}

function playerRow(p, thresholds) {
  const skills = (p.skillNames || []).filter((n) => n !== p.ultimate);
  return h('div', { class: 'ch-pl', title: `${p.name} · ${L.STATS.map((k) => `${L.STAT_LABELS[k]} ${p.stats?.[k] ?? 0}`).join(' · ')}` },
    posChip(p.position, p.slot),
    h('span', { class: 'ch-pl-name ellipsis' }, p.name),
    mainStat(p, thresholds),
    h('span', { class: 'ch-pl-sk tiny ellipsis' },
      p.ultimate ? h('span', { class: 'gold' }, `★${p.ultimate}`) : null,
      p.ultimate && skills.length ? ' ' : null,
      skills.length ? h('span', { class: 'muted' }, skills.join(' · ')) : null));
}

/* ------------------------------------------------------------------ */
/* 가운데: 단계 사다리                                                   */
/* ------------------------------------------------------------------ */
function ladderPanel(ladder, sel, tp, total, actions) {
  return panel('단계', {
    cls: 'ch-ladder-panel',
    right: h('span', { class: 'small muted' }, '클리어 ', h('b', { class: 'good' }, `${tp.cleared}`), ` / ${total}`),
  },
  h('div', { class: 'ch-ladder', role: 'listbox', 'aria-label': '도전 단계' }, ladder.map((s) => {
    const stateTxt = s.state === 'cleared'
      ? `✓ ${s.wins}승${s.attempts > s.wins ? ` ${s.attempts - s.wins}패` : ''}`
      : s.state === 'open'
        ? (s.attempts ? `${s.attempts}패` : '도전 가능')
        : '🔒';
    return h('button', {
      class: ['btn', 'ch-stage', `st-${s.state}`, s.stage === sel?.stage ? 'sel' : ''],
      type: 'button',
      role: 'option',
      'aria-selected': s.stage === sel?.stage ? 'true' : 'false',
      dataset: { stage: String(s.stage), state: s.state },
      title: `${s.displayName} — ${s.title} · ${STATE_LABELS[s.state]}`,
      onclick: () => actions.selectChallengeStage(s.stage),
    },
    h('span', { class: 'ch-num' }, s.stage),
    h('span', { class: 'ch-stage-main' },
      h('span', { class: 'ch-stage-name ellipsis' }, s.teamName, h('span', { class: 'ch-stage-title' }, s.title)),
      h('span', { class: 'row ch-badges' },
        s.badges.length ? s.badges.map((b) => featureBadge(b)) : h('span', { class: 'tiny muted' }, '스킬 없음'))),
    h('span', { class: 'ch-stage-side' },
      h('span', { class: 'ch-stage-pow' }, h('span', { class: 'tiny muted' }, '전력 '), h('b', {}, s.power)),
      h('span', { class: ['ch-state', `st-${s.state}`] }, stateTxt)));
  })));
}

/* ------------------------------------------------------------------ */
/* 오른쪽: 단계 미리보기 + [도전]                                          */
/* ------------------------------------------------------------------ */
function previewPanel(s, entry, ctx) {
  const { actions, thresholds } = ctx;
  if (!s) return panel('미리보기', { cls: 'ch-preview' }, h('p', { class: 'muted small' }, '단계 정보가 없습니다.'));
  const ours = entry?.summary?.power ?? null;
  const diff = ours != null ? s.power - ours : null;
  const added = new Set((s.added || []).map((a) => `${a.slot}|${a.skillId}`));
  const tactics = PREVIEW_TACTICS.map((k) => `${L.TACTIC_LABELS[k]} ${L.tacticLabel(k, s.tactics?.[k])}`).join(' · ');

  const go = s.state === 'locked'
    ? h('button', { class: 'btn btn-lg ch-go', type: 'button', disabled: true }, `🔒 ${s.stage - 1}단계를 클리어하면 열립니다`)
    : h('button', {
      class: 'btn btn-primary btn-lg btn-col ch-go',
      type: 'button',
      disabled: !entry,
      onclick: () => actions.startChallenge(entry.teamId, s.stage),
    },
    h('span', {}, s.state === 'cleared' ? '다시 도전' : '도전'),
    h('span', { class: 'btn-sub' }, `${s.attempts + 1}번째 도전 · ${L.KIND_LABELS[s.kind] ?? s.kind} 규칙`));

  return panel(null, { cls: 'ch-preview' },
    h('div', { class: 'row ch-pv-head' },
      h('span', { class: ['ch-num', 'big', `st-${s.state}`] }, s.stage),
      h('div', { class: 'col grow' },
        h('h3', { class: 'ellipsis' }, s.displayName),
        h('span', { class: 'small muted ellipsis' }, `${s.title} · ${s.tierLabel}`)),
      h('span', { class: ['badge', s.state === 'cleared' ? 'badge-good' : s.state === 'open' ? 'badge-accent' : ''] },
        s.state === 'cleared' ? `클리어 · ${s.wins}승 / ${s.attempts}전` : s.state === 'open' ? (s.attempts ? `도전 가능 · ${s.attempts}패` : '도전 가능') : '🔒 잠김')),
    h('p', { class: 'ch-pv-desc small muted' }, s.description || ''),
    h('div', { class: 'ch-facts' },
      fact('상대 전력', s.power, diff != null ? h('span', { class: ['tiny', diff > 0 ? 'bad' : 'good'] }, `우리 ${ours} (${diff > 0 ? '+' : ''}${diff})`) : null),
      fact('팀워크', s.teamwork, null),
      fact('경기', `${s.possessions} 포제션`, h('span', { class: 'tiny muted' }, s.kind === 'goal' ? '연장 · 승부차기' : '무승부 있음')),
      fact('간파 사용권', s.gaanpaTickets, null)),
    h('div', { class: 'row ch-pv-style' },
      h('span', { class: 'badge' }, s.styleHint?.label ?? '-'),
      h('span', { class: 'tiny muted ellipsis' }, tactics)),
    h('div', { class: 'row ch-badges ch-pv-feat' },
      s.badges.length ? s.badges.map((b) => featureBadge(b)) : h('span', { class: 'tiny muted' }, '스킬 기능 없음 (스탯만)'),
      s.added?.length ? h('span', { class: 'tiny muted ellipsis' }, `추가 스킬 ${s.added.length}개`) : null),
    miniPitch(s),
    h('div', { class: 'ch-pv-players' }, s.players.map((p) => {
      const names = p.skillIds.map((id, i) => ({ id, name: p.skillNames[i], add: added.has(`${p.slot}|${id}`) }));
      return h('div', { class: 'ch-pl' },
        posChip(p.position, p.slot),
        h('span', { class: 'ch-pl-name ellipsis' }, p.name),
        mainStat(p, thresholds),
        h('span', { class: 'ch-pl-sk tiny ellipsis' },
          names.length
            ? names.map((n, i) => [i ? ' · ' : null, h('span', { class: n.name === p.ultimate ? 'gold' : n.add ? 'ch-added' : 'muted' },
              `${n.name === p.ultimate ? '★' : ''}${n.add ? '+' : ''}${n.name}`)])
            : h('span', { class: 'muted' }, '-')));
    })),
    h('div', { class: 'row ch-pv-foot' },
      h('span', { class: 'tiny muted ch-legend' }, h('span', { class: 'ch-added' }, '+추가 스킬'), ' · ', h('span', { class: 'gold' }, '★필살기')),
      h('span', { class: 'grow' }),
      go));
}

function fact(label, value, extra) {
  return h('div', { class: 'ch-fact' }, h('span', { class: 'tiny muted' }, label), h('b', {}, value), extra);
}

/** 상대 포메이션 미니 필드: 상대는 경기 화면처럼 오른쪽 골 (GK 오른쪽 → FW 왼쪽) */
function miniPitch(s) {
  const slots = s.players.map((p) => p.slot);
  return h('div', { class: 'mini-pitch ch-pitch', 'aria-label': `상대 포메이션 ${s.formation}` },
    h('div', { class: 'mp-lines', 'aria-hidden': 'true' }, h('i', { class: 'mp-half' }), h('i', { class: 'mp-circle' }),
      h('i', { class: 'mp-box l' }), h('i', { class: 'mp-box r' })),
    h('span', { class: 'mp-label l' }, s.formation),
    s.players.map((p) => {
      const at = slotSpot(p.slot, slots, { spread: true }); // 3명 줄은 15~85% 로 벌린다 (이름표가 겹치지 않게)
      return h('div', {
        class: ['ch-tok', `pos-${p.position}`, p.ultimate ? 'ult' : '', p.addedSkillIds?.length ? 'boost' : ''],
        style: { left: `${100 - at.x}%`, top: `${at.y}%` },
        title: `${p.slot} ${p.name} · ${L.STAT_LABELS[p.mainStat]} ${p.mainValue}${p.skillNames.length ? ` · ${p.skillNames.join(', ')}` : ''}`,
      },
      h('span', { class: 'ch-tok-face' }, initial(p.name)),
      h('span', { class: 'ch-tok-tag' }, h('b', {}, p.name), ` ${p.mainValue}`));
    }));
}

/* ------------------------------------------------------------------ */
/* 결과 모달                                                             */
/* ------------------------------------------------------------------ */
function openResultModal(r, ctx, total) {
  const { actions } = ctx;
  const hasNext = r.stage < total;
  const title = r.win ? (r.firstClear ? `${r.stage}단계 클리어!` : `${r.stage}단계 승리`) : `${r.stage}단계 패배`;
  const notes = [
    r.win && r.firstClear && hasNext ? h('span', { class: 'badge badge-good' }, `${r.stage + 1}단계가 열렸습니다`) : null,
    r.win && r.firstClear && !hasNext ? h('span', { class: 'badge badge-gold' }, `${total}단계 전부 클리어!`) : null,
    h('span', { class: 'badge' }, `${r.attempt}회차 도전`),
    h('span', { class: 'badge' }, `이 단계 ${r.wins}승 / ${r.attempts}전`),
    r.mvp ? h('span', { class: 'badge badge-accent' }, `MVP ${r.mvp}`) : null,
  ];
  const close = () => actions.closeChallengeResult();
  const btns = [
    h('button', { class: 'btn', type: 'button', onclick: close }, '도전 목록'),
    h('button', { class: ['btn', r.win && hasNext ? '' : 'btn-primary'], type: 'button', onclick: () => actions.startChallenge(r.teamId, r.stage) }, '다시 도전'),
    r.win && hasNext
      ? h('button', { class: 'btn btn-primary btn-col ch-next', type: 'button', onclick: () => actions.startChallenge(r.teamId, r.stage + 1) },
        h('span', {}, '다음 단계 ▶'), h('span', { class: 'btn-sub' }, r.nextName || `${r.stage + 1}단계`))
      : null,
  ];
  openModal(h('div', { class: ['col', 'ch-result', r.win ? 'win' : 'loss'] },
    h('p', { class: 'center small muted' }, '도전 모드 결과'),
    h('h2', { class: ['center', 'ch-res-title', r.win ? (r.firstClear ? 'gold' : 'good') : 'bad'] }, title),
    h('p', { class: 'center small' }, r.displayName, r.title ? h('span', { class: 'muted' }, ` — ${r.title}`) : null),
    h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, r.homeName || '우리 팀'), h('span', { class: 'ellipsis' }, r.awayName || '상대')),
    h('div', { class: 'score-big' }, `${r.homeGoals} : ${r.awayGoals}`),
    r.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${r.penalties.home ?? 0} : ${r.penalties.away ?? 0}`) : null,
    h('div', { class: 'row wrap ch-res-notes' }, notes),
    h('div', { class: 'row ch-res-btns' }, btns)),
  { className: 'modal-md', onClose: () => { if (ctx.store.challenge.result === r) actions.closeChallengeResult(); } });
}

/* ------------------------------------------------------------------ */
/* 조각                                                                 */
/* ------------------------------------------------------------------ */
function featureBadge(b) {
  return h('span', { class: ['badge', 'ch-feat', FEATURE_CLASS[b.key] || ''], dataset: { feature: b.key } }, b.label);
}

function posChip(pos, slot) {
  return h('span', { class: ['ch-pos', `pos-${pos}`], title: slot }, pos);
}

function mainStat(p, thresholds) {
  const v = Number(p.mainValue) || 0;
  return h('span', { class: 'ch-main', title: L.STAT_LABELS[p.mainStat] ?? p.mainStat },
    h('span', { class: 'tiny muted' }, L.STAT_SHORT[p.mainStat] ?? ''), gradeBadge(gradeOf(v, thresholds), 'xs'), h('b', {}, v));
}

function initial(name) {
  const t = String(name ?? '').trim();
  return t ? Array.from(t)[0] : '?';
}
