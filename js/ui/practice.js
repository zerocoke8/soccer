// js/ui/practice.js — 연습 경기 (시작 화면 [⚽ 연습 경기], 2026-10-09 사용자 요청): 기본 선수단 vs 기본 선수단 육각 경기 셋업.
// 런 · 도전 상태와 저장 (store.run · store.match · store.hexMatch · KEYS.*) 은 읽지도 쓰지도 않는다 — 순수 함수만.
//
// 우리 팀 = config.defaultSquad (2-2-2) 를 새 런과 똑같이 만든 스냅샷: 엔진 lessonRun.createRun (기본 편성 · 코치 · 전술 · 방침, 계정 · 레전드 없음)
//   → lessonRun.buildTeamSnapshot (새 런이 첫 경기에 내는 스냅샷 — 시작 스탯 · 컨디션 · 팀워크 0 · 코치 파티 패시브). 스탯을 따로 만들지 않는다.
// 상대 = 그 거울 사본: side 'away' · 이름 '연습 상대' · 선수 id 앞에 'm_' (charId 는 그대로 — 양쪽 모두 초상 · 스프라이트).
//
// [구현 결정]:
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

/**
 * 기본 선수단 스냅샷 (새 런이 만드는 것과 같다 — 위 머리 주석).
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
