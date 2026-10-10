// js/ui/practice.js — 연습 경기 (시작 화면 [⚽ 연습 경기], 2026-10-09 사용자 요청): 기본 선수단 vs 기본 선수단 육각 경기 셋업.
// 런 · 도전 상태와 저장 (store.run · store.match · store.hexMatch · KEYS.*) 은 읽지도 쓰지도 않는다 — 순수 함수만.
//
// 우리 팀 = config.defaultSquad (2-2-2) 를 새 런과 똑같이 만든 런 상태 (엔진 lessonRun.createRun — 기본 편성 · 코치 · 전술 · 방침, 계정 · 레전드 없음) 에
//   config.practice ("시즌 3 잘 키운 팀", 2026-10-10 사용자 요청) 의 캐릭터별 스탯 5개 · 팀워크를 덮어쓴 뒤 lessonRun.buildTeamSnapshot
//   (컨디션 · 기질 배수 · 공명 · 코치 파티 패시브는 새 런 그대로). practice 블록이 없거나 그 캐릭터 줄이 없으면 시작 스탯 · 팀워크 그대로.
//   practice 값은 tools/lesson_sim.mjs --final-stats 로 잰 데이터 (블록의 source 줄) — 코드에 숫자를 두지 않는다.
// 상대 = 그 거울 사본: side 'away' · 이름 '연습 상대' · 선수 id 앞에 'm_' (charId 는 그대로 — 양쪽 모두 초상 · 스프라이트).
//
// [구현 결정]:
//  - practice 스탯은 런 선수의 원래 스탯 (기질 배수 전) 자리에 넣는다 — 기본 편성은 모두 기질 A (배수 1) 라 스냅샷 스탯 = 블록 값.
//    스킬 (습득 액티브 · 패시브) 은 넣지 않는다 (고유 스킬만 — 블록은 스탯 · 팀워크만).
//  - 스냅샷용 런 시드는 고정 ('practice-squad') — 시작 스탯은 시드와 상관없지만 같은 데이터면 늘 같은 선수단이 되게.
//  - 거울 사본은 선수 id 를 가리키는 전술 값 (tactics.kickoffPlayerId) 도 'm_' 를 붙인다.
//  - 경기 종류 = 'friendly' (육각 엔진 규칙 그대로 — 정규 시간이 동점이면 무승부로 끝, 골든골 · 승부차기 없음), possessions = config.friendly.possessions.
//    연습에서 골든골 · 승부차기까지 보려면 경기 종류를 바꿔야 한다 (kind 'goal' 등 — 다른 규칙도 함께 바뀌므로 기획 결정 사항).

/** 연습 경기 상대 팀 이름 */
export const PRACTICE_AWAY_NAME = '연습 상대';
/** 상대 선수 id 앞머리 */
export const PRACTICE_ID_PREFIX = 'm_';
/** 기본 선수단 스냅샷을 만들 때 쓰는 런 시드 (고정) */
export const PRACTICE_SQUAD_SEED = 'practice-squad';

/** 스탯 5개 (practice 블록 키) */
const PRACTICE_STATS = ['shoot', 'dribble', 'pass', 'defense', 'physical'];

/**
 * config.practice 를 새 런 상태에 덮어쓴다 (제자리). 블록 · 캐릭터 줄 · 값이 없으면 그 자리는 그대로.
 * @param {object} st  lessonRun.createRun 상태
 * @param {object|undefined} practice  data.config.practice
 */
export function applyPracticeStats(st, practice) {
  if (!practice || typeof practice !== 'object') return st;
  const table = practice.stats && typeof practice.stats === 'object' ? practice.stats : {};
  for (const p of st.players || []) {
    const row = table[p.charId];
    if (!row) continue;
    for (const k of PRACTICE_STATS) {
      if (typeof row[k] !== 'number' || !Number.isFinite(row[k])) continue;
      p.stats[k] = Math.round(row[k]);
    }
  }
  const tw = practice.teamwork;
  if (typeof tw === 'number' && Number.isFinite(tw)) st.teamwork = Math.max(0, Math.min(100, Math.round(tw)));
  return st;
}

/**
 * 기본 선수단 스냅샷 (새 런 + config.practice 스탯 · 팀워크 — 위 머리 주석).
 * @param {object} run  js/engine/lessonRun.js (createRun · buildTeamSnapshot)
 * @param {object} data
 * @returns {object} TeamSnapshot (side 'home')
 */
export function defaultSquadSnapshot(run, data) {
  const cfg = data?.config || {};
  const dsq = cfg.defaultSquad;
  if (!dsq?.slots) throw new Error('config.defaultSquad 가 없습니다');
  const st = run.createRun({
    data,
    seed: PRACTICE_SQUAD_SEED,
    squad: { ...dsq.slots },
    formation: dsq.formation || '2-2-2',
    supportIds: Array.isArray(cfg.defaultSupports) ? [...cfg.defaultSupports] : [],
    tactics: { ...(cfg.defaultTactics || {}) },
  });
  applyPracticeStats(st, cfg.practice);
  return run.buildTeamSnapshot(st, data);
}

/**
 * 거울 상대: 깊은 사본 · side 'away' · 이름 '연습 상대' · 선수 id (와 그 id 를 가리키는 전술 값) 앞에 'm_'.
 * @param {object} team  TeamSnapshot
 * @returns {object}
 */
export function mirrorTeam(team) {
  const t = JSON.parse(JSON.stringify(team));
  t.side = 'away';
  t.name = PRACTICE_AWAY_NAME;
  for (const p of t.players || []) p.id = `${PRACTICE_ID_PREFIX}${p.id}`;
  if (t.tactics && t.tactics.kickoffPlayerId != null) t.tactics.kickoffPlayerId = `${PRACTICE_ID_PREFIX}${t.tactics.kickoffPlayerId}`;
  return t;
}

/**
 * 연습 경기 셋업 (육각 경기 화면 matchMode.getSetup — 런 getMatchSetup 과 같은 모양의 필요한 키).
 * @param {object} run  lessonRun 엔진
 * @param {object} data
 * @param {string} seed  경기 시드 (연습마다 새로)
 * @returns {{ home: object, away: object, possessions: number, seed: string, kind: 'friendly' }}
 */
export function practiceSetup(run, data, seed) {
  const home = defaultSquadSnapshot(run, data);
  const away = mirrorTeam(home);
  const possessions = Number(data?.config?.friendly?.possessions) || 8;
  return { home, away, possessions, seed, kind: 'friendly' };
}
