// js/ui/screens/result.js — 결과 화면 (phase "finished")
import { h, avatar, gradeBadge, gradeOf, section, keyValue, toast, signed } from '../dom.js';
import { loadTeams } from '../store.js';
import * as L from '../labels.js';

const BD_LABELS = {
  avgStat: '평균 스탯', averageStat: '평균 스탯',
  skillCount: '습득 스킬 수', learnedSkills: '습득 스킬 수', learnedSkillCount: '습득 스킬 수',
  skillScore: '스킬 점수', skillValue: '스킬 점수', skillBonus: '스킬 점수',
  teamwork: '팀워크', teamworkScore: '팀워크 점수', teamworkBonus: '팀워크 점수',
  losses: '경계전 패배', wins: '경계전 승리',
  cap: '패배 상한', capGrade: '패배 상한', cappedBy: '패배 상한',
  score: '점수', grade: '등급', cappedGrade: '최종 등급',
};

export function renderResult(root, ctx) {
  const { store, data, run, engine, actions, thresholds } = ctx;
  const state = store.run;

  if (!store.final || store.final.seed !== state.seed) {
    const r = engine(() => run.finalizeRun(state, data));
    store.final = {
      rating: r?.rating ?? state.rating ?? null,
      registeredTeam: r?.registeredTeam ?? null,
      seed: state.seed,
    };
  }
  const rating = store.final.rating || state.rating || {};
  const grade = rating.cappedGrade ?? rating.grade ?? '-';
  const rawGrade = rating.grade;
  const bd = rating.breakdown || {};
  const charById = new Map((data.characters || []).map((c) => [c.id, c]));
  const skillById = new Map((data.skills || []).map((s) => [s.id, s]));
  const opponentById = new Map((data.opponents || []).map((o) => [o.id, o]));

  const alreadyRegistered = store.registered || loadTeams().some((t) => t?.seed === state.seed && t?.createdTurnIndex === store.final.registeredTeam?.createdTurnIndex);

  // ---- 등급 ----
  const hero = h('div', { class: 'result-hero' },
    h('p', { class: 'muted small' }, '런 종료 · 최종 평가'),
    gradeBadge(grade, 'big'),
    h('div', { class: 'row' },
      h('span', { class: 'small' }, '점수 ', h('b', {}, Math.round(Number(rating.score) || 0))),
      rawGrade && rawGrade !== grade ? h('span', { class: 'badge badge-warn' }, `패배 상한 적용 (원래 ${rawGrade})`) : null),
  );

  // ---- 점수 breakdown ----
  const bdPairs = Object.entries(bd)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .map(([k, v]) => [BD_LABELS[k] ?? k, typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(1)) : v]);
  const breakdownEl = section('점수 구성',
    bdPairs.length ? keyValue(bdPairs) : h('p', { class: 'muted small' }, '세부 항목 없음'),
    h('p', { class: 'tiny muted' }, `팀워크 ${state.teamwork ?? 0} · 스킬 포인트 잔여 ${state.skillPoints ?? 0} · 유물 ${(state.relics || []).length}개`));

  // ---- 경기 기록 ----
  const gm = state.record?.goalMatches || [];
  const fr = state.record?.friendlies || [];
  const recordEl = section('경기 기록',
    gm.length ? h('div', { class: 'list' }, gm.map((g) =>
      h('div', { class: 'row between small list-item' },
        h('span', {}, `시즌 ${g.season} · vs ${opponentById.get(g.opponentId)?.name ?? g.opponentId}`),
        h('span', { class: g.win ? 'good' : 'bad' }, L.scoreLabel(g)))))
      : h('p', { class: 'muted small' }, '경계전 기록 없음'),
    h('p', { class: 'tiny muted' }, `친선전 ${fr.length}회 · 경계전 패배 ${state.record?.losses ?? 0}`));

  // ---- 선수별 스탯 ----
  const playersEl = section('선수 성장 (시작 → 끝)', (state.players || []).map((p) => {
    const ch = charById.get(p.charId);
    const start = ch?.baseStats || {};
    const learned = (p.learnedSkillIds || []).map((id) => skillById.get(id)?.name ?? id);
    const innate = skillById.get(p.innateSkillId)?.name;
    return h('div', { class: 'player-result' },
      h('div', { class: 'row' },
        avatar(p.portraitColor, p.name, 'md'),
        h('div', { class: 'grow col' },
          h('div', { class: 'row' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot ?? ''} · 적성 ${p.aptitude ?? ''} · 훈련 ${p.trainedCount ?? 0}회`)),
          h('div', { class: 'tiny muted ellipsis' }, [innate ? `고유 ${innate}` : null, learned.length ? `습득 ${learned.join(', ')}` : null].filter(Boolean).join(' · ') || '스킬 없음'))),
      h('div', { class: 'stat-grid' }, L.STATS.map((st) => {
        const a = Number(start[st]) || 0;
        const b = Number(p.stats?.[st]) || 0;
        return h('div', { class: 'cell' },
          h('span', { class: 'muted' }, L.STAT_LABELS[st]),
          h('span', {}, gradeBadge(gradeOf(b, thresholds)), ' ', h('b', {}, b)),
          h('span', { class: 'delta' }, `${a} → ${signed(b - a)}`));
      })),
    );
  }));

  // ---- seed / 버튼 ----
  const seed = String(state.seed ?? '');
  const copySeed = () => {
    const done = () => toast('seed를 복사했습니다.', 'good', 2000);
    try {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(seed).then(done, () => toast('복사 실패 — 직접 선택해 복사하세요.'));
      else toast('클립보드를 사용할 수 없습니다. 직접 선택해 복사하세요.');
    } catch (_) { toast('복사 실패'); }
  };
  const seedBox = h('div', { class: 'seed-box' },
    h('span', { class: 'muted small' }, 'seed'),
    h('span', { class: 'grow ellipsis' }, seed),
    h('button', { class: 'btn btn-sm', onclick: copySeed }, '복사'));

  const buttons = h('div', { class: 'btn-list' },
    h('button', {
      class: 'btn btn-good btn-block',
      disabled: alreadyRegistered || !store.final.registeredTeam,
      onclick: () => actions.registerTeam(),
    }, alreadyRegistered ? '팀 등록 완료' : '팀 등록'),
    h('button', { class: 'btn btn-primary btn-block btn-col', onclick: () => actions.replay(seed) },
      h('span', {}, '다시 하기'), h('span', { class: 'btn-sub' }, '같은 seed로 편성부터')),
    h('button', { class: 'btn btn-block', onclick: () => actions.replay('') }, '새 런 (랜덤 seed)'),
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => actions.resetToStart() }, '처음으로'));

  root.append(h('div', { class: 'screen' }, hero, breakdownEl, recordEl, playersEl, seedBox, buttons));
}
