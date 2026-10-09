// js/ui/screens/start.js — 시작 화면: 새 런 / 이어하기 / 도전 모드 / 회상 / 등록 팀 목록
// 가로 스테이지(1280×720): 왼쪽 = 타이틀 (키 아트), 오른쪽 = 메뉴 패널 + 등록 팀 패널(목록만 안쪽 스크롤)
// 카드 레슨 시험판 (LESSON_PROTO_PLAN §6.3): 흐름 = 시즌 × 주 (data/lesson.json), "본편과 저장이 따로입니다" 배지 (저장 키 앞머리 store.js)
// 키 아트 (§24.13 U3): .hero 792×688 = 배경 'title' (노을 경기장, img/scenes) + 선수 반신 5명을 비스듬한 칸으로 겹친다 (CSS — 그림은 뒤집지 않는다).
//   그림 목록 (data/portraits.json) 이 없으면 지금처럼 CSS 경기장 + ⚽. 글 (제목 · 배지 · 흐름 3단계) 은 그림 위 어두운 그라데이션 위에.
// [📖 회상] (§24.7): 본 외출 이야기 n/48 → 회상 화면 (actions.openRecollection). 이야기 데이터가 없으면 숨긴다.
// [⚽ 연습 경기] (2026-10-09): 회상 바로 아래 (회상이 없으면 도전 모드 뒤 같은 자리) — 기본 선수단끼리 육각 경기 (actions.openPractice, 기록 없음). 늘 보인다.
import { h, gradeBadge, fmtDate, panel } from '../dom.js';
import { loadRun, loadTeams, loadAccount } from '../store.js';
import { PHASE_LABELS } from '../labels.js';
import { portraitUrl, sceneUrl } from '../art.js';

/** 키 아트 반신 5명 (왼쪽 → 오른쪽: 네리아 · 울리카 · 실루엔 · 그레타 · 헤르타 — 가운데 실루엔이 가장 크다) [구현 결정] */
export const KEY_ART_CAST = ['ch_spirit_keeper', 'ch_wolf_winger', 'ch_elf_playmaker', 'ch_giant_striker', 'ch_giant_keeper'];

/** 그림 <img> (불러오지 못하면 지운다 — 배경 그라데이션 · 색 칸이 대신한다) */
function artImgEl(url, cls) {
  const img = h('img', { class: cls, src: url, alt: '', draggable: 'false', decoding: 'async' });
  img.addEventListener('error', () => img.remove());
  return img;
}

/**
 * 회상 진행: 본 화 수 / 데이터의 이야기 화 수 (계정 저장 stories[charId] = 본 가장 큰 화 — 그 캐릭터 화 중 그 이하인 것).
 * @returns {{ seen: number, total: number }}
 */
export function recollectionProgress(ctx, account = loadAccount()) {
  let list = [];
  try { list = ctx.lessonEvents && typeof ctx.lessonEvents.storyList === 'function' ? ctx.lessonEvents.storyList(ctx.data) : []; } catch (_) { list = []; }
  const stories = account?.stories || {};
  const seen = list.filter((s) => (Number(stories[s.charId]) || 0) >= s.ep).length;
  return { seen, total: list.length };
}

export function renderStart(root, ctx) {
  const { actions } = ctx;
  const saved = loadRun();
  const teams = loadTeams();
  const cfg = ctx.data?.config || {};
  const seasons = Number(cfg.seasons) || 3;
  const ld = ctx.data?.lesson || {};
  const weekKinds = Array.isArray(ld.weekKinds) && ld.weekKinds.length ? ld.weekKinds : ['lesson', 'free', 'lesson', 'free', 'prep'];
  const wps = Number(ld.weeksPerSeason) || weekKinds.length;
  const weeks = seasons * wps;
  const maxLessons = seasons * weekKinds.filter((k) => k === 'lesson' || k === 'prep').length; // 레슨 주 + 대비 주
  const supportCount = Array.isArray(cfg.defaultSupports) && cfg.defaultSupports.length ? cfg.defaultSupports.length : 6;
  const squadSize = Object.keys(cfg.defaultSquad?.slots || {}).length || 7; // 포메이션 슬롯 수 (GK 1 + 필드 6)
  const flowText = `${seasons}시즌 · ${weeks}주 · 레슨 최대 ${maxLessons}회 · 경계전 ${seasons}회`;

  // ---- 타이틀 (왼쪽): 런 흐름 3단계는 config 값으로 ----
  const flow = h('ol', { class: 'hero-flow' },
    h('li', {}, h('b', {}, '편성'), h('span', {}, `선수 ${squadSize}명 · 코치 ${supportCount}명 · 방침`)),
    h('li', {}, h('b', {}, `육성 ${weeks}주`), h('span', {}, `시즌 ${seasons} × ${wps}주 · 레슨 최대 ${maxLessons}회`)),
    h('li', {}, h('b', {}, `경계전 ${seasons}회`), h('span', {}, '시즌 마지막 주 뒤')));
  const titleBlock = [
    h('h1', {}, '경계전 클럽'),
    h('p', { class: 'hero-sub' }, '로그라이크 육성 축구 · 웹 프로토타입'),
    h('p', { class: 'hero-badge' }, h('b', {}, '카드 레슨 시험판'), h('span', {}, ' — 본편과 저장이 따로입니다')),
  ];
  const bgUrl = sceneUrl(ctx.data, 'title');
  const castArt = KEY_ART_CAST.map((id) => ({ id, url: portraitUrl(ctx.data, id, 'half') })).filter((x) => x.url);
  const hero = bgUrl
    ? h('div', { class: 'hero has-art' },
      artImgEl(bgUrl, 'hero-bg'),
      h('div', { class: ['hero-cast', `n-${castArt.length}`], 'aria-hidden': 'true' },
        castArt.map((x, i) => h('span', { class: ['hc', `hc-${i + 1}`], dataset: { char: x.id } }, artImgEl(x.url, 'hc-img')))),
      h('div', { class: 'hero-shade', 'aria-hidden': 'true' }),
      h('div', { class: 'hero-body' },
        h('div', { class: 'hero-title' }, ...titleBlock),
        flow))
    : h('div', { class: 'hero' },
      h('div', { class: 'hero-pitch', 'aria-hidden': 'true' },
        h('i', { class: 'hp-half' }), h('i', { class: 'hp-circle' }), h('i', { class: 'hp-box l' }), h('i', { class: 'hp-box r' })),
      h('div', { class: 'hero-body' },
        h('div', { class: 'logo' }, '⚽'),
        ...titleBlock,
        flow));

  const savedInfo = saved
    ? `시즌 ${saved.season ?? '?'} · ${saved.turn ?? '?'}/${wps}주 · ${phaseLabel(saved.phase)} · seed ${saved.seed ?? ''}`
    : null;
  // 도전 모드 (2026-10-01, 플레이테스트용): 등록 팀 · 테스트용 샘플 팀으로 1~N단계. 데이터가 없으면 버튼을 숨긴다.
  // 진행 중인 도전 경기가 저장돼 있으면 (경기 중 [나가기] · 새로고침) 버튼이 "이어하기" 로 — 누르면 그 경기로 (app.js openChallenge)
  const chStages = Array.isArray(ctx.data?.challenge?.stages) ? ctx.data.challenge.stages.length : 0;
  const chSample = !!ctx.data?.challenge_sample_team?.team;
  const chPending = chStages && typeof ctx.pendingChallenge === 'function' ? ctx.pendingChallenge() : null;
  const chSub = chPending
    ? `진행 중: ${chPending.displayName} · ${chPending.attempt}회차${chPending.finished ? ' (결과 확인 전)' : ''}`
    : `완성된 팀으로 1~${chStages}단계 · 등록 팀 ${teams.length}${chSample ? ' + 샘플 팀' : ''}`;
  // 회상 (§24.7): 이야기 데이터가 있을 때만
  const rp = recollectionProgress(ctx);

  // ---- 메뉴 (오른쪽 위) ----
  const buttons = h('div', { class: 'btn-list start-menu' },
    h('button', { class: 'btn btn-primary btn-block btn-col btn-lg', onclick: () => actions.newRun() },
      h('span', {}, '새 런 시작'),
      h('span', { class: 'btn-sub' }, flowText)),
    savedInfo
      ? h('button', { class: 'btn btn-block btn-col btn-lg', onclick: () => actions.continueRun() },
        h('span', {}, '이어하기'),
        h('span', { class: 'btn-sub' }, savedInfo))
      : null,
    savedInfo
      ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
        if (confirm('저장된 런을 삭제할까요?')) actions.discardSave();
      } }, '저장 삭제')
      : null,
    chStages
      ? h('button', { class: ['btn', 'btn-block', 'btn-col', 'btn-lg', 'challenge-btn', chPending ? 'resume' : ''], onclick: () => actions.openChallenge() },
        h('span', {}, chPending ? '🏆 도전 모드 — 이어하기' : '🏆 도전 모드'),
        h('span', { class: 'btn-sub' }, chSub))
      : null,
    rp.total
      ? h('button', { class: 'btn btn-block btn-col recollection-btn', onclick: () => actions.openRecollection() },
        h('span', {}, '📖 회상'),
        h('span', { class: 'btn-sub' }, `본 외출 이야기 ${rp.seen}/${rp.total}화 다시 읽기`))
      : null,
    h('button', { class: 'btn btn-block btn-col practice-btn', onclick: () => actions.openPractice() },
      h('span', {}, '⚽ 연습 경기'),
      h('span', { class: 'btn-sub' }, '기본 선수단끼리 바로 경기 · 기록 안 남음')),
  );

  // ---- 등록 팀 (오른쪽 아래, 목록만 스크롤) ----
  const teamList = panel(`등록 팀 (${teams.length})`, { cls: 'start-teams grow-panel', scroll: true },
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

  root.append(h('div', { class: 'screen og start-screen' },
    hero,
    h('div', { class: 'start-side' },
      panel('메뉴', {}, buttons),
      teamList,
      h('p', { class: 'muted tiny center' }, '저장은 이 브라우저의 localStorage에만 남습니다 (본편과 따로).')),
  ));
}

function phaseLabel(phase) {
  return PHASE_LABELS[phase] ?? phase;
}
