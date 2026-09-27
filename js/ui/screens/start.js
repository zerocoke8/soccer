// js/ui/screens/start.js — 시작 화면: 새 런 / 이어하기 / 등록 팀 목록
import { h, gradeBadge, fmtDate, section } from '../dom.js';
import { loadRun, loadTeams } from '../store.js';

export function renderStart(root, ctx) {
  const { actions } = ctx;
  const saved = loadRun();
  const teams = loadTeams();

  const hero = h('div', { class: 'hero' },
    h('div', { class: 'logo' }, '⚽'),
    h('h1', {}, '경계전 클럽'),
    h('p', { class: 'muted small' }, '로그라이크 육성 축구 · 웹 프로토타입'),
  );

  const savedInfo = saved && saved.phase
    ? `시즌 ${saved.season ?? '?'} · ${saved.turn ?? '?'}턴 · ${phaseLabel(saved.phase)} · seed ${saved.seed ?? ''}`
    : null;

  const buttons = h('div', { class: 'btn-list' },
    h('button', { class: 'btn btn-primary btn-block btn-col', onclick: () => actions.newRun() },
      h('span', {}, '새 런 시작'),
      h('span', { class: 'btn-sub' }, '편성 → 24턴 육성 → 경계전 3회')),
    savedInfo
      ? h('button', { class: 'btn btn-block btn-col', onclick: () => actions.continueRun() },
        h('span', {}, '이어하기'),
        h('span', { class: 'btn-sub' }, savedInfo))
      : null,
    savedInfo
      ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
        if (confirm('저장된 런을 삭제할까요?')) actions.discardSave();
      } }, '저장 삭제')
      : null,
  );

  const teamList = section(`등록 팀 (${teams.length})`,
    teams.length === 0
      ? h('p', { class: 'muted small' }, '아직 등록한 팀이 없습니다. 런을 완주하고 결과 화면에서 [팀 등록]을 누르세요.')
      : h('ul', { class: 'list' }, teams.slice(0, 20).map((t) =>
        h('li', { class: 'team-row' },
          gradeBadge(t?.grade ?? t?.rating?.cappedGrade ?? t?.rating?.grade ?? '-', 'mid'),
          h('div', { class: 'grow col' },
            h('div', { class: 'ellipsis' }, t?.name ?? '이름 없는 팀'),
            h('div', { class: 'muted tiny' },
              `${t?.formation ?? ''} · 점수 ${Math.round(Number(t?.score ?? t?.rating?.score) || 0)} · seed ${t?.seed ?? ''}`)),
          h('span', { class: 'muted tiny' }, fmtDate(t?.registeredAt)),
        ))),
  );

  root.append(h('div', { class: 'screen' }, hero, buttons, teamList,
    h('p', { class: 'muted tiny center' }, '저장은 이 브라우저의 localStorage에만 남습니다.')));
}

function phaseLabel(phase) {
  return ({ turn: '훈련', event: '이벤트', match: '경기', relic: '유물 선택', route: '루트 선택', finished: '완료' })[phase] ?? phase;
}
