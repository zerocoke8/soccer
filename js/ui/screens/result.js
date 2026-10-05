// js/ui/screens/result.js — 결과 화면 (phase "finished")
// 가로 스테이지: 왼쪽 = 런 요약(등급 · 점수 구성 · 경기 기록 · seed), 오른쪽 = 선수 성장(시작 → 끝) 표, 아래 = 버튼 한 줄
// 메모리 카드 (LESSON_PROTO_PLAN §24.9 · §24.13, U5): 버튼 줄 [팀 등록] 왼쪽에 "메모리 카드" 고르기 줄 — 후보 = lessonRun.memoryCardOptions
//   (이번 런 덱에서 고유 · 대비 · 코치 카드를 뺀 것, 같은 카드 · 같은 강화는 한 칸), 처음엔 감독 추천 (manager.recommendMemoryCard) 이 골라져 있다.
//   칩을 누르면 고르기 모달 (작은 카드 그리드 + 고른 카드 앞면). 고른 것은 store.final.memory (화면 상태), [팀 등록] 이 등록 팀 memoryCard 로 남긴다.
//   등록한 뒤에는 "남긴 메모리 카드" 로 그 카드를 보여 준다 (바꿀 수 없다).
import { h, avatar, gradeBadge, gradeOf, toast, signed, panel, openModal } from '../dom.js';
import { loadTeams } from '../store.js';
import * as L from '../labels.js';
import { portraitUrl } from '../art.js';
import { cardFace, miniCard, memoryChip } from '../cards.js';

/** 메모리 카드 키 (같은 카드 · 같은 강화 = 한 칸) */
const memKey = (mc) => (mc ? `${mc.cardId}|${mc.plus === true ? 1 : 0}` : '');

// 점수 구성 2열: 한 줄 = 관련 항목 한 쌍 (왼쪽 = 원래 값, 오른쪽 = 점수 · 결과). 칸마다 키 후보 (엔진 rating.breakdown 이름이 달라도)
const BD_ROWS = [
  [['avgStat', 'averageStat']],
  [['learnedSkills', 'skillCount', 'learnedSkillCount'], ['skillScore', 'skillValue', 'skillBonus']],
  [['teamwork'], ['teamworkScore', 'teamworkBonus']],
  [['losses'], ['cap', 'capGrade', 'cappedBy']],
];
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
  const { store, data, run, engine, actions, thresholds, manager, safe } = ctx;
  const state = store.run;
  const guard = typeof safe === 'function' ? safe : (fn) => { try { return fn(); } catch (_) { return undefined; } };

  if (!store.final || store.final.seed !== state.seed) {
    const r = engine(() => run.finalizeRun(state, data));
    store.final = {
      rating: r?.rating ?? state.rating ?? null,
      registeredTeam: r?.registeredTeam ?? null,
      seed: state.seed,
    };
  }
  // 메모리 카드 후보 · 감독 추천 (§24.9 — 순수, rng 없음). 처음 그릴 때 추천을 골라 둔다
  const memOptions = typeof run?.memoryCardOptions === 'function' ? guard(() => run.memoryCardOptions(state, data)) || [] : [];
  const memRec = manager && typeof manager.recommendMemoryCard === 'function' ? guard(() => manager.recommendMemoryCard(state, data)) ?? null : null;
  if (store.final.memory === undefined || (store.final.memory && !memOptions.some((o) => memKey(o) === memKey(store.final.memory)))) {
    const first = memRec ?? memOptions[0] ?? null;
    store.final.memory = first ? { cardId: first.cardId, plus: first.plus === true } : null;
  }
  const rating = store.final.rating || state.rating || {};
  const grade = rating.cappedGrade ?? rating.grade ?? '-';
  const rawGrade = rating.grade;
  const bd = rating.breakdown || {};
  const charById = new Map((data.characters || []).map((c) => [c.id, c]));
  const skillById = new Map((data.skills || []).map((s) => [s.id, s]));
  const opponentById = new Map((data.opponents || []).map((o) => [o.id, o]));

  const storedTeam = loadTeams().find((t) => t?.seed === state.seed && t?.createdTurnIndex === store.final.registeredTeam?.createdTurnIndex) || null;
  const alreadyRegistered = store.registered || !!storedTeam;

  // ---- 등급 (가로: 등급 배지 왼쪽, 점수 · 상한 오른쪽) ----
  const hero = h('div', { class: 'result-hero' },
    gradeBadge(grade, 'big'),
    h('div', { class: 'col' },
      h('p', { class: 'muted small' }, '런 종료 · 최종 평가'),
      h('span', { class: 'result-score' }, '점수 ', h('b', {}, Math.round(Number(rating.score) || 0))),
      rawGrade && rawGrade !== grade ? h('span', { class: 'badge badge-warn' }, `패배 상한 적용 (원래 ${rawGrade})`) : null),
  );

  // ---- 점수 breakdown (2열 — 한 줄에 관련 항목 한 쌍: 평균 스탯 / 습득 스킬 수 · 스킬 점수 / 팀워크 · 팀워크 점수 / 경계전 패배 · 패배 상한) ----
  const shown = (k) => typeof bd[k] === 'number' || typeof bd[k] === 'string';
  const used = new Set();
  const pick = (alts) => {
    const k = alts.find((a) => shown(a) && !used.has(a));
    if (k) used.add(k);
    return k ?? null;
  };
  const bdRows = BD_ROWS.map((row) => row.map(pick)).filter((row) => row.some(Boolean));
  const rest = Object.keys(bd).filter((k) => shown(k) && !used.has(k)); // 모르는 항목은 뒤에 두 개씩
  for (let i = 0; i < rest.length; i += 2) bdRows.push([rest[i], rest[i + 1] ?? null]);
  const bdCell = (k) => (k
    ? h('div', { class: 'bd-cell' }, h('dt', {}, BD_LABELS[k] ?? k),
      h('dd', {}, typeof bd[k] === 'number' ? (Number.isInteger(bd[k]) ? bd[k] : bd[k].toFixed(1)) : bd[k]))
    : h('div', { class: 'bd-cell empty' }));
  const breakdownEl = panel('점수 구성', { cls: 'res-breakdown' },
    bdRows.length ? h('dl', { class: 'kv bd-grid' }, bdRows.flatMap(([a, b]) => [bdCell(a), bdCell(b)]))
      : h('p', { class: 'muted small' }, '세부 항목 없음'),
    h('p', { class: 'tiny muted' }, `팀워크 ${state.teamwork ?? 0} · 스킬 포인트 잔여 ${state.skillPoints ?? 0} · 유물 ${(state.relics || []).length}개`));

  // ---- 경기 기록 ----
  const gm = state.record?.goalMatches || [];
  const fr = state.record?.friendlies || [];
  const recordEl = panel('경기 기록', { cls: 'res-record' },
    gm.length ? h('div', { class: 'list' }, gm.map((g) =>
      h('div', { class: 'row between small list-item' },
        h('span', {}, `시즌 ${g.season} · vs ${opponentById.get(g.opponentId)?.name ?? g.opponentId}`),
        h('span', { class: g.win ? 'good' : 'bad' }, L.scoreLabel(g)))))
      : h('p', { class: 'muted small' }, '경계전 기록 없음'),
    h('p', { class: 'tiny muted' }, `친선전 ${fr.length}회 · 경계전 패배 ${state.record?.losses ?? 0}`));

  // ---- 선수별 스탯 (한 선수 = 한 줄: 이름 · 스킬 | 스탯 5칸) ----
  const playersEl = panel('선수 성장 (시작 → 끝)', {
    cls: 'res-players grow-panel',
    scroll: true,
    right: h('span', { class: 'tiny muted' }, '등급 · 최종값 · 시작값 → 상승'),
  }, (state.players || []).map((p) => {
    const ch = charById.get(p.charId);
    const start = ch?.baseStats || {};
    const learned = (p.learnedSkillIds || []).map((id) => skillById.get(id)?.name ?? id);
    const innateSk = skillById.get(p.innateSkillId);
    // L45: 고유 스킬 = 필살기 → "필살기 X" (필살기가 아닌 옛 고유만 "고유 X", §19.14 ④)
    const innate = innateSk ? `${innateSk.ultimate ? '필살기' : '고유'} ${innateSk.name}` : null;
    const bust = portraitUrl(data, p.charId, 'bust'); // 흉상 56×70 (§24.12.3 — 그림이 없으면 40 원 글자)
    return h('div', { class: ['player-result', bust ? 'has-bust' : ''] },
      h('div', { class: 'row pr-who' },
        avatar(p.portraitColor, p.name, 'md', bust ? 'pr-bust' : '', { art: bust }),
        h('div', { class: 'grow col' },
          h('div', { class: 'row' }, h('b', {}, p.name), h('span', { class: 'tiny muted' }, `${p.slot ?? ''} · 적성 ${p.aptitude ?? ''}${state.kind === 'lessonRun' ? '' : ` · 훈련 ${p.trainedCount ?? 0}회`}`)),
          h('div', { class: 'tiny muted ellipsis', title: [innate, learned.length ? `습득 ${learned.join(', ')}` : null].filter(Boolean).join(' · ') },
            [innate, learned.length ? `습득 ${learned.join(', ')}` : null].filter(Boolean).join(' · ') || '스킬 없음'))),
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

  // ---- 메모리 카드 줄 (§24.9): [팀 등록] 왼쪽. 등록 전 = 고른 카드 칩 (누르면 고르기 모달) · 등록 뒤 = 남긴 카드 ----
  const isRec = (mc) => !!mc && !!memRec && memKey(mc) === memKey(memRec);
  const shownMem = alreadyRegistered ? (storedTeam ? storedTeam.memoryCard ?? null : store.final.memory) : store.final.memory;
  const memTip = '등록 팀에 이번 런 덱의 카드 1장을 남깁니다. 다음 런 편성에서 이 팀 선수를 레전드로 데려가면 시작 덱에 들어갑니다 (고유 · 대비 · 코치 카드는 남길 수 없음).';
  let memBody;
  if (alreadyRegistered) {
    memBody = memoryChip(data, shownMem, { cls: 'rm-chip', empty: '남긴 카드 없음' });
  } else if (!memOptions.length) {
    memBody = h('span', { class: 'small muted rm-none' }, '남길 수 있는 카드 없음');
  } else {
    memBody = h('button', {
      type: 'button',
      class: ['btn', 'btn-sm', 'rm-pick', isRec(shownMem) ? 'recommended' : ''],
      title: `메모리 카드 바꾸기 (후보 ${memOptions.length}장)`,
      onclick: () => openMemoryPicker(),
    },
    memoryChip(data, shownMem, { cls: 'rm-chip', empty: '남기지 않음' }),
    isRec(shownMem) ? h('span', { class: 'rm-rec' }, '추천') : null,
    h('span', { class: 'rm-change', 'aria-hidden': 'true' }, '바꾸기 ▾'));
  }
  const memRow = h('div', { class: ['res-memory', alreadyRegistered ? 'done' : ''], title: memTip },
    h('span', { class: 'col rm-txt' },
      h('b', { class: 'rm-title' }, alreadyRegistered ? '남긴 메모리 카드' : '메모리 카드'),
      h('span', { class: 'tiny muted rm-sub' }, alreadyRegistered ? '다음 런 레전드가 가져온다' : `${memOptions.length}장 중 1장 · 팀 등록 때 남긴다`)),
    memBody);

  /** 메모리 카드 고르기 모달: 작은 카드 그리드 (추천 배지) + 고른 카드 앞면 → [이 카드로] */
  function openMemoryPicker() {
    let sel = store.final.memory ? { ...store.final.memory } : null;
    const box = h('div', { class: 'col rm-modal-body' });
    const m = openModal(box, { className: 'modal-lg memory-modal' });
    const draw = () => {
      const picked = memOptions.find((o) => memKey(o) === memKey(sel)) || null;
      const grid = h('div', { class: ['rm-grid', memOptions.length > 16 ? 'dense' : ''] }, memOptions.map((o) => {
        const el = miniCard({ ...o.card, cardId: o.cardId, name: o.name, family: o.family, plus: o.plus }, {
          data,
          selected: memKey(o) === memKey(sel),
          onClick: () => { sel = { cardId: o.cardId, plus: o.plus }; draw(); },
        });
        el.dataset.mem = memKey(o);
        if (isRec(o)) { el.classList.add('recommended'); el.append(h('span', { class: 'mc-rec' }, '추천')); }
        return el;
      }));
      box.replaceChildren(
        h('div', { class: 'row between rm-head' },
          h('div', { class: 'col' },
            h('h3', {}, '메모리 카드 고르기'),
            h('span', { class: 'tiny muted' }, memTip)),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => m.close() }, '닫기')),
        h('div', { class: 'rm-cols' },
          grid,
          h('div', { class: 'col rm-detail' },
            picked ? cardFace({ ...picked.card, cardId: picked.cardId, plus: picked.plus }, { data, el: 'div', recommended: isRec(picked) }) : h('div', { class: 'rm-detail-empty small muted' }, '카드를 고르세요'),
            h('button', {
              type: 'button', class: 'btn btn-primary rm-ok', disabled: !picked,
              onclick: () => { store.final.memory = picked ? { cardId: picked.cardId, plus: picked.plus } : null; m.close(); ctx.render(); },
            }, '이 카드로'))));
    };
    draw();
  }

  const buttons = h('div', { class: 'result-actions' },
    h('button', { class: 'btn btn-ghost', onclick: () => actions.resetToStart() }, '처음으로'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn', onclick: () => actions.replay('') }, '새 런 (랜덤 seed)'),
    h('button', { class: 'btn btn-primary btn-col', onclick: () => actions.replay(seed) },
      h('span', {}, '다시 하기'), h('span', { class: 'btn-sub' }, '같은 seed로 편성부터')),
    memRow,
    h('button', {
      class: 'btn btn-good btn-lg',
      disabled: alreadyRegistered || !store.final.registeredTeam,
      onclick: () => actions.registerTeam({ memory: store.final.memory }),
    }, alreadyRegistered ? '팀 등록 완료' : '팀 등록'));

  root.append(h('div', { class: 'screen og result-screen' },
    h('div', { class: 'result-main' },
      h('div', { class: 'result-left' }, h('div', { class: 'og-panel result-hero-panel' }, hero), breakdownEl, recordEl, seedBox),
      playersEl),
    buttons));
}
