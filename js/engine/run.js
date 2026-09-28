/**
 * run.js — 런(육성) 상태 머신 (ARCHITECTURE §5, §6.6~6.8).
 *
 * 순수 로직: DOM/fetch/Date/Math.random 사용 금지. 데이터는 인자로 받는다.
 * 모든 공개 함수는 state 를 in-place 로 바꾸고 그 state 를 반환한다 (뷰 함수 제외).
 * 난수는 state.rngState 를 통해서만 (rng.js).
 *
 * 흐름 제어: 턴 소모 행동 뒤에 이어질 단계들을 `state.queue`(문자열 배열)에 넣고 `runQueue` 가
 * 순서대로 처리한다. 이벤트/경기/유물/루트처럼 사용자의 입력을 기다리는 phase 가 되면 멈추고,
 * resolveEvent / finishMatch / chooseRelic / chooseRoute 가 끝나면 남은 queue 를 이어 처리한다.
 *
 * queue 단계:
 *   "eventCheck"                    §6.6 1·2 (서포트 이벤트 우선, 아니면 확률 랜덤 이벤트)
 *   "preMatchCheck"                 §6.6 3 (시즌 마지막 턴, preMatch 이벤트 확정)
 *   "goalMatch"                     턴 종료 처리 후 목표 경기 pendingMatch, phase "match"
 *   "advanceTurn"                   턴 종료 처리(호출 해제) → 다음 턴 배치
 *   "beginTurn"                     placement 생성(부상자 제외) → 부상자 injuredTurns −1, phase "turn"
 *   "seasonEnd"                     시즌 1·2 → phase "route", 시즌 3 → "finished"
 *   "routeEvent:<routeId>"          route 트리거 이벤트 (있으면)
 *   "routeFriendly"                 원정 루트 강제 친선전
 *   "seasonStartEvent"              seasonStart 이벤트 (eventChancePerTurn 확률)
 *   "seasonStartEventGuaranteed"    seasonStart 이벤트 확정 (온천)
 */
import { createRng, createRngFromState } from "./rng.js";
import {
  STATS,
  POSITIONS,
  STYLES,
  ELEMENTS,
  RACES,
  RARITIES,
  APTITUDE,
  FORMATIONS,
  STAT_LABELS,
  MAX_LEARNED_SKILLS,
  clamp,
  formationSlots,
  slotPosition,
  mainStatOf,
  indexById,
  getById,
  getModifier,
  emptyPlacement,
  placeSlots,
  previewSlot,
  resolveTraining,
  resolveRest,
  resolveOuting,
  resolveMeeting,
  applyFriendlyStaminaCost,
  validateSquad,
  findFriendSupportId,
  skillDiscountedCost,
  canLearnSkill,
} from "./training.js";
import { applyEffects, pickRelicChoices, MODIFIER_KEYS, assertModifierKey } from "./effects.js";
import { computeRating } from "./rating.js";

export { STATS, POSITIONS, STYLES, ELEMENTS, RACES, RARITIES, APTITUDE, FORMATIONS, STAT_LABELS, formationSlots, slotPosition, mainStatOf, getModifier, MODIFIER_KEYS };

const RUN_VERSION = 1;
const LOG_MAX = 300;
const TEAM_NAME = "우리 클럽";
const DEFAULT_APTITUDE_MULT = { A: 1.0, B: 0.9, C: 0.75 };
const STOP_PHASES = new Set(["event", "match", "relic", "route", "finished"]);
/** 경기 스냅샷 `modifiers` 로 넘기는 키 (v0.3: intentReveal 삭제, gaanpaTicket·gaanpaCostHalf 추가) */
const SNAPSHOT_MODIFIER_KEYS = ["shootPower", "defense", "tensionGain", "staminaCost", "passAttack", "dribbleStaminaRefund", "gaanpaTicket", "gaanpaCostHalf"];

/** v0.3 전술 수비 성향 (§13.1 config.defaultTactics.defense 선택지) */
export const DEFENSE_TACTICS = ["tackle", "balanced", "intercept", "hold"];
/** 폐지된 전술 값 → 이행 값 (§13.5). readIntent(의도 따라가기)는 의도 공개 폐지로 balanced. */
const LEGACY_DEFENSE_TACTICS = { readIntent: "balanced" };
/** 폐지된 modifier 키 → 새 키 (§13.5). 옛 저장 런의 intentReveal(의도 공개 +1)은 간파 사용권 1로 바꾼다. */
const LEGACY_MODIFIER_KEYS = { intentReveal: "gaanpaTicket" };
/** 옛 저장 런에서 intentReveal 을 주던 유물 → 새 유물이 추가로 주는 modifier (rl_coach_notebook: gaanpaCostHalf) */
const LEGACY_RELIC_EXTRA = { rl_coach_notebook: { gaanpaCostHalf: 1 } };
/** getTurnView().nextMatch.styleHint 문구 (§13.5) */
const STYLE_HINT_LABELS = { dribble: "드리블 위주", pass: "패스 위주", mixed: "혼합" };

/**
 * @typedef {Object} RunPlayer
 * @property {string} id
 * @property {string} charId
 * @property {string} name
 * @property {string} slot
 * @property {string} position
 * @property {string} aptitude
 * @property {string} race
 * @property {string} element
 * @property {string} style
 * @property {string} rarity
 * @property {string} portraitColor
 * @property {Record<string, number>} stats
 * @property {Record<string, number>} growth
 * @property {number} stamina
 * @property {number} injuredTurns
 * @property {string} innateSkillId
 * @property {string[]} learnedSkillIds
 * @property {number} trainedCount
 */

/**
 * @typedef {Object} RunState
 * @property {number} version
 * @property {string|number} seed
 * @property {number} rngState
 * @property {"turn"|"event"|"match"|"relic"|"route"|"finished"} phase
 * @property {number} season
 * @property {number} turn
 * @property {number} turnIndex
 * @property {number} leagueTier
 * @property {string} formation
 * @property {object} tactics
 * @property {RunPlayer[]} players
 * @property {Array<{ id: string, bond: number, firedEventIds: string[] }>} supports
 * @property {number} condition
 * @property {number} teamwork
 * @property {number} skillPoints
 * @property {Record<string, number>} hints
 * @property {string[]} relics
 * @property {Array<{ key: string, amount: number, untilSeason: number|null, source?: string }>} modifiers
 * @property {number} summonTickets
 * @property {{ playerId: string, slot: string }|null} summon
 * @property {Record<string, { players: string[], supports: string[] }>|null} placement
 * @property {{ eventId: string, playerId: string|null, supportId: string|null }|null} currentEvent
 * @property {{ kind: "goal"|"friendly", opponentId: string, possessions: number, seed: number, reason: "goal"|"friendly"|"route" }|null} pendingMatch
 * @property {object|null} lastMatchResult
 * @property {string[]|null} pendingRelicChoices
 * @property {string[]|null} pendingRoutes
 * @property {{ goalMatches: Array<object>, friendlies: Array<object>, losses: number }} record
 * @property {string[]} usedEventIds
 * @property {Array<{ turnIndex: number, text: string }>} log
 * @property {object|null} rating
 * @property {string[]} queue  이어서 처리할 내부 단계 (문서 §5 외 추가 필드)
 */

/**
 * @typedef {Object} TeamSnapshot
 * @property {"home"|"away"} side
 * @property {string} name
 * @property {string} formation
 * @property {object} tactics
 * @property {number} teamwork
 * @property {number} conditionMult
 * @property {{ element: string, strong: boolean, bonus: Record<string, number> }|null} resonance
 * @property {Record<string, number>} modifiers
 * @property {number} gaanpaTickets    경기마다 간파 사용권 수 (modifiers.gaanpaTicket 합, §13.2-8)
 * @property {boolean} gaanpaCostHalf  간파 스킬 텐션 비용 ×0.5 (modifiers.gaanpaCostHalf ≥ 1)
 * @property {Array<{ id: string, name: string, slot: string, position: string, style: string, element: string, race: string,
 *                    stats: Record<string, number>, skillIds: string[], portraitColor: string, isYouth: boolean,
 *                    trait: string|null }>} players   trait = 연계 특성 id (traits.json), 유스·미지정은 null
 */

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

/**
 * 데이터 번들 검증
 * @param {object} data
 */
function assertData(data) {
  if (!data || typeof data !== "object") throw new Error("data 번들이 없습니다");
  if (!data.config || typeof data.config !== "object") throw new Error("data.config 가 없습니다");
  for (const key of ["characters", "supports", "events", "skills", "relics", "opponents", "routes"]) {
    if (!Array.isArray(data[key])) throw new Error(`data.${key} 배열이 없습니다`);
  }
}

/**
 * @param {RunState} state
 * @param {string} text
 */
function log(state, text) {
  state.log.push({ turnIndex: state.turnIndex, text });
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
}

/**
 * @param {RunState} state
 * @param {string} playerId
 * @returns {RunPlayer}
 */
function playerById(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new Error(`선수 '${playerId}' 을(를) 찾을 수 없습니다`);
  return p;
}

/**
 * @param {RunState} state
 * @param {string} phase
 */
function assertPhase(state, phase) {
  if (!state || typeof state !== "object") throw new Error("state 가 없습니다");
  if (state.phase !== phase) throw new Error(`phase '${phase}' 에서만 가능합니다 (현재 '${state.phase}')`);
}

/**
 * 이벤트 텍스트 치환 ({player} {support} {season})
 * @param {string} text
 * @param {{ playerName: string, supportName: string, season: number }} vars
 * @returns {string}
 */
function substitute(text, vars) {
  return String(text ?? "")
    .replace(/\{player\}/g, vars.playerName)
    .replace(/\{support\}/g, vars.supportName)
    .replace(/\{season\}/g, String(vars.season));
}

/**
 * 상대 선수단의 최다 스타일
 * @param {object} opponent
 * @returns {string|null}
 */
function dominantStyle(opponent) {
  const counts = {};
  for (const p of opponent.players || []) counts[p.style] = (counts[p.style] || 0) + 1;
  let best = null;
  let n = 0;
  for (const s of STYLES) {
    if ((counts[s] || 0) > n) {
      best = s;
      n = counts[s];
    }
  }
  return best;
}

/**
 * 상대 팀 총 스탯 (강함 비교용)
 * @param {object} opponent
 * @returns {number}
 */
function opponentStrength(opponent) {
  let total = 0;
  for (const p of opponent.players || []) for (const s of STATS) total += Number(p.stats && p.stats[s]) || 0;
  return total;
}

// ---------------------------------------------------------------------------
// v0.3 이행 (§13.5): 전술 readIntent → balanced, modifier intentReveal → gaanpaTicket
// ---------------------------------------------------------------------------

/**
 * 전술 이행: 폐지된 값을 새 값으로 바꾼 사본 (readIntent → balanced). 입력은 바꾸지 않는다.
 * @param {object|null|undefined} tactics
 * @returns {object}
 */
export function normalizeTactics(tactics) {
  const t = { ...(tactics || {}) };
  if (typeof t.defense === "string" && Object.prototype.hasOwnProperty.call(LEGACY_DEFENSE_TACTICS, t.defense)) {
    t.defense = LEGACY_DEFENSE_TACTICS[t.defense];
  }
  return t;
}

/**
 * modifier 목록 이행 (순수): 폐지된 키(intentReveal)를 새 키(gaanpaTicket)로, 옛 '감독의 수첩' 유물 항목에는
 * gaanpaCostHalf 를 더한다. 바꿀 것이 없으면 입력 배열 그대로, 있으면 새 배열.
 * @param {RunState["modifiers"]} mods
 * @returns {RunState["modifiers"]}
 */
function migrateModifierList(mods) {
  const list = Array.isArray(mods) ? mods : [];
  if (!list.some((m) => m && Object.prototype.hasOwnProperty.call(LEGACY_MODIFIER_KEYS, m.key))) return list;
  const out = [];
  for (const m of list) {
    if (!m || !Object.prototype.hasOwnProperty.call(LEGACY_MODIFIER_KEYS, m.key)) {
      out.push(m);
      continue;
    }
    out.push({ ...m, key: LEGACY_MODIFIER_KEYS[m.key] });
    const relicId = typeof m.source === "string" && m.source.startsWith("relic:") ? m.source.slice("relic:".length) : null;
    const extra = relicId ? LEGACY_RELIC_EXTRA[relicId] : null;
    if (extra) {
      for (const [key, amount] of Object.entries(extra)) {
        out.push({ key, amount, untilSeason: m.untilSeason ?? null, source: m.source });
      }
    }
  }
  return out;
}

/**
 * 옛 저장 런을 v0.3 규칙으로 이행한다 (in-place, 멱등). 상태를 반환한다.
 * - tactics.defense readIntent → balanced
 * - modifiers intentReveal → gaanpaTicket (옛 감독의 수첩이면 gaanpaCostHalf 추가)
 * UI 가 저장된 런을 불러온 직후 불러도 되고, 상태를 바꾸는 공개 API(applyAction 등)도 진입 시 부른다.
 * @param {RunState} state
 * @returns {RunState}
 */
export function migrateRun(state) {
  if (!state || typeof state !== "object") return state;
  if (state.tactics && typeof state.tactics === "object") {
    const t = normalizeTactics(state.tactics);
    if (t.defense !== state.tactics.defense) state.tactics = t;
  }
  const mods = migrateModifierList(state.modifiers);
  if (mods !== state.modifiers) state.modifiers = mods;
  return state;
}

/**
 * 등록 팀(finalizeRun().registeredTeam, localStorage 저장본) 이행: 전술 readIntent → balanced,
 * 선수에 trait 가 없으면 캐릭터 데이터(charId, 없으면 이름)에서 채운다. 새 객체를 돌려준다.
 * @param {object} team
 * @param {object} [data]
 * @returns {object}
 */
export function migrateRegisteredTeam(team, data) {
  if (!team || typeof team !== "object") return team;
  const chars = data && Array.isArray(data.characters) ? data.characters : [];
  const players = Array.isArray(team.players)
    ? team.players.map((p) => {
        if (!p || typeof p !== "object" || p.trait !== undefined) return p;
        const ch = chars.find((c) => (p.charId && c.id === p.charId) || (!p.charId && c.name === p.name));
        return { ...p, trait: (ch && ch.trait) || null };
      })
    : team.players;
  return { ...team, tactics: normalizeTactics(team.tactics), players };
}

/**
 * 스냅샷용 modifier 합: 이행된 목록 기준 (상태는 바꾸지 않는다)
 * @param {RunState} state
 * @param {string} key
 * @returns {number}
 */
function snapshotModifier(state, key) {
  return getModifier({ modifiers: migrateModifierList(state.modifiers), season: state.season }, key);
}

/**
 * 캐릭터 연계 특성 (characters.json trait). 없으면 null.
 * @param {object} data
 * @param {string} charId
 * @returns {string|null}
 */
function traitOfCharacter(data, charId) {
  const ch = data.characters.find((c) => c.id === charId);
  return ch && typeof ch.trait === "string" && ch.trait ? ch.trait : null;
}

/**
 * 상대 팀의 공격 성향 요약 (§13.5 getTurnView().nextMatch.styleHint).
 * 필드 선수(GK 제외)마다 빌드업 구역(line 0·1) 공격 1위 액션을 고른다 — 엔진 A안 성향과 같은 재료:
 * 스탯 × config.match.actionCoef × 전술 공격 성향 보정(config.match.tendency.tacticBonus, 기본 1.15).
 * 위치·체력·받은 직후처럼 비트마다 달라지는 조건부 보정은 넣지 않는다. 동률 = 드리블 (tieAttack 순서).
 * 다수결: 드리블 > 패스 → "드리블 위주", 패스 > 드리블 → "패스 위주", 같으면 "혼합".
 * @param {object} opponent  opponents.json 항목 (또는 players/tactics 를 가진 등록 팀)
 * @param {object} data
 * @returns {{ key: "dribble"|"pass"|"mixed", label: string, counts: { dribble: number, pass: number } }}
 */
export function opponentStyleHint(opponent, data) {
  const m = (data && data.config && data.config.match) || {};
  const coef = m.actionCoef || {};
  const tacticBonus = Number(m.tendency && m.tendency.tacticBonus) || 1.15;
  const tieAttack = (m.tendency && Array.isArray(m.tendency.tieAttack) && m.tendency.tieAttack) || ["dribble", "pass", "cross", "shoot"];
  const attackTactic = opponent && opponent.tactics ? opponent.tactics.attack : null;
  const counts = { dribble: 0, pass: 0 };
  for (const p of (opponent && opponent.players) || []) {
    if (!p || (p.position || slotPosition(p.slot)) === "GK") continue;
    const st = p.stats || {};
    const val = {};
    for (const a of ["dribble", "pass"]) {
      val[a] = (Number(st[a]) || 0) * (Number(coef[a]) || 1) * (attackTactic === a ? tacticBonus : 1);
    }
    let pick;
    if (val.dribble !== val.pass) pick = val.dribble > val.pass ? "dribble" : "pass";
    else pick = tieAttack.indexOf("pass") >= 0 && tieAttack.indexOf("pass") < tieAttack.indexOf("dribble") ? "pass" : "dribble";
    counts[pick] += 1;
  }
  const key = counts.dribble > counts.pass ? "dribble" : counts.pass > counts.dribble ? "pass" : "mixed";
  return { key, label: STYLE_HINT_LABELS[key], counts };
}

/**
 * 원소 공명 계산 (§4.8 elementResonance). 유스는 제외하고 넘긴다.
 * @param {object} cfg
 * @param {Array<{ element: string }>} players
 * @returns {{ element: string, strong: boolean, bonus: Record<string, number>, count: number }|null}
 */
function computeResonance(cfg, players) {
  const er = cfg.elementResonance;
  if (!er) return null;
  const counts = {};
  for (const p of players) counts[p.element] = (counts[p.element] || 0) + 1;
  let best = null;
  let bestCount = 0;
  for (const el of ELEMENTS) {
    const c = counts[el] || 0;
    if (c > bestCount) {
      best = el;
      bestCount = c;
    }
  }
  if (!best || bestCount < er.minPlayers) return null;
  const strong = bestCount >= er.strongPlayers;
  const base = (er.bonus && er.bonus[best]) || {};
  const bonus = {};
  for (const [k, v] of Object.entries(base)) {
    bonus[k] = Math.round((strong ? v * er.strongMult : v) * 10000) / 10000;
  }
  return { element: best, strong, bonus, count: bestCount };
}

/**
 * 이벤트 공통 필터 (seasons / minTurnIndex / once / characterId 보유)
 * @param {RunState} state
 * @param {object} ev
 * @returns {boolean}
 */
function eventCommonOk(state, ev) {
  if (!ev || typeof ev.id !== "string") return false;
  if ((ev.weight ?? 1) <= 0) return false;
  if (Array.isArray(ev.seasons) && ev.seasons.length && !ev.seasons.includes(state.season)) return false;
  if (typeof ev.minTurnIndex === "number" && state.turnIndex < ev.minTurnIndex) return false;
  const once = ev.once !== false;
  if (once && state.usedEventIds.includes(ev.id)) return false;
  if (ev.characterId && !state.players.some((p) => p.charId === ev.characterId)) return false;
  if (!Array.isArray(ev.choices) || ev.choices.length === 0) return false;
  return true;
}

/**
 * 트리거별 발생 가능 이벤트 목록
 * @param {RunState} state
 * @param {object} data
 * @param {string} trigger  "random" | "seasonStart" | "preMatch" | "route"
 * @param {{ routeId?: string }} [opts]
 * @returns {object[]}
 */
function eligibleEvents(state, data, trigger, opts = {}) {
  return data.events.filter((ev) => {
    if (ev.trigger !== trigger) return false;
    if (trigger === "route" && ev.routeId !== opts.routeId) return false;
    return eventCommonOk(state, ev);
  });
}

/**
 * 조건을 만족한 미발생 서포트 이벤트 (bondAtLeast 낮은 것 우선, 동률은 서포트 편성 순).
 * @param {RunState} state
 * @param {object} data
 * @param {string|null} onlySupportId  특정 카드만 볼 때
 * @returns {{ event: object, supportId: string }|null}
 */
function findSupportEvent(state, data, onlySupportId = null) {
  const supportsData = indexById(data.supports, "supports");
  const candidates = [];
  for (const st of state.supports) {
    if (onlySupportId && st.id !== onlySupportId) continue;
    const card = supportsData.get(st.id);
    if (!card) continue;
    const listed = new Set(Array.isArray(card.eventIds) ? card.eventIds : []);
    for (const ev of data.events) {
      if (ev.trigger !== "support") continue;
      if (ev.supportId !== st.id && !listed.has(ev.id)) continue;
      if (st.firedEventIds.includes(ev.id)) continue;
      if (!eventCommonOk(state, ev)) continue;
      const need = Number(ev.bondAtLeast) || 0;
      if (st.bond < need) continue;
      candidates.push({ event: ev, supportId: st.id, need });
    }
  }
  candidates.sort((a, b) => a.need - b.need);
  return candidates.length ? { event: candidates[0].event, supportId: candidates[0].supportId } : null;
}

/**
 * 이벤트 발생: currentEvent 세팅, 사용 기록, phase "event". rng 소비(랜덤 {player}).
 * @param {RunState} state
 * @param {object} data
 * @param {object} event
 * @param {string|null} [supportId]
 */
function fireEvent(state, data, event, supportId = null) {
  const sid = supportId || event.supportId || null;
  let playerId = null;
  if (event.characterId) {
    const p = state.players.find((x) => x.charId === event.characterId);
    playerId = p ? p.id : null;
  }
  if (!playerId) {
    const rng = createRngFromState(state.rngState);
    const healthy = state.players.filter((p) => p.injuredTurns <= 0);
    const pick = rng.pick(healthy.length ? healthy : state.players);
    playerId = pick ? pick.id : null;
    state.rngState = rng.getState();
  }
  state.currentEvent = { eventId: event.id, playerId, supportId: sid };
  if (!state.usedEventIds.includes(event.id)) state.usedEventIds.push(event.id);
  if (sid) {
    const st = state.supports.find((s) => s.id === sid);
    if (st && !st.firedEventIds.includes(event.id)) st.firedEventIds.push(event.id);
  }
  state.phase = "event";
}

/**
 * 후보 중 weight 가중 선택 후 발생. rng 소비.
 * @param {RunState} state
 * @param {object} data
 * @param {object[]} pool
 * @returns {boolean} 발생 여부
 */
function fireWeighted(state, data, pool) {
  if (!pool.length) return false;
  const rng = createRngFromState(state.rngState);
  const ev = rng.weighted(pool, (e) => (typeof e.weight === "number" ? e.weight : 1));
  state.rngState = rng.getState();
  if (!ev) return false;
  fireEvent(state, data, ev);
  return true;
}

/**
 * 턴 종료 처리: 호출 예약 해제.
 * (부상 카운트는 여기서 줄이지 않는다 — 부상이 난 그 턴의 종료에서 −1 되면 결장 횟수가 약속보다 1 적어진다. beginTurn 참고)
 * @param {RunState} state
 */
function endTurnTick(state) {
  state.summon = null;
}

/**
 * 턴 시작: 배치 생성(부상자 제외) → 부상자 injuredTurns −1, phase "turn".
 * injuredTurns = "앞으로 결장하는 턴 시작 배치 횟수". turns:1 → 다음 배치 1회 결장, 훈련 실패(2) → 2회 결장.
 * 목표 경기 직전(preMatch) 부상은 경기에서 유스로 대체되고 다음 시즌 배치에서 소진된다 (경기는 배치가 아니므로 카운트하지 않음).
 * @param {RunState} state
 * @param {object} data
 */
function beginTurn(state, data) {
  placeSlots(state, data);
  for (const p of state.players) {
    if (p.injuredTurns > 0) p.injuredTurns -= 1;
  }
  state.phase = "turn";
}

/**
 * 턴 소모 행동 뒤의 단계 목록
 * @param {RunState} state
 * @param {object} data
 * @param {boolean} skipEventCheck
 * @returns {string[]}
 */
function postActionQueue(state, data, skipEventCheck) {
  const q = [];
  if (!skipEventCheck) q.push("eventCheck");
  if (state.turn >= data.config.turnsPerSeason) q.push("preMatchCheck", "goalMatch");
  else q.push("advanceTurn");
  return q;
}

/**
 * 목표 경기 세팅 (§6.8)
 * @param {RunState} state
 * @param {object} data
 */
function setupGoalMatch(state, data) {
  const cfg = data.config;
  endTurnTick(state);
  const opp = data.opponents.find((o) => o.role === "goal" && o.season === state.season);
  if (!opp) throw new Error(`시즌 ${state.season} 의 목표 경기 상대(role "goal")가 opponents 에 없습니다`);
  const rng = createRngFromState(state.rngState);
  const seed = rng.int(0, 2 ** 31);
  state.rngState = rng.getState();
  const poss = cfg.goalMatch.possessions;
  state.pendingMatch = {
    kind: "goal",
    opponentId: opp.id,
    possessions: poss[Math.min(state.season - 1, poss.length - 1)],
    seed,
    reason: "goal",
  };
  state.phase = "match";
  state.queue.push("seasonEnd");
  log(state, `시즌 ${state.season} 목표 경기: ${opp.name}`);
}

/**
 * 친선전 세팅. reason "friendly" = 행동, "route" = 원정 루트 강제(그 시즌 friendly 중 최강).
 * @param {RunState} state
 * @param {object} data
 * @param {"friendly"|"route"} reason
 */
function setupFriendly(state, data, reason) {
  const cfg = data.config;
  const seasonPool = data.opponents.filter((o) => o.role === "friendly" && o.season === state.season);
  const anyPool = data.opponents.filter((o) => o.role === "friendly");
  const pool = seasonPool.length ? seasonPool : anyPool;
  if (!pool.length) throw new Error("친선전 상대(role \"friendly\")가 opponents 에 없습니다");
  const rng = createRngFromState(state.rngState);
  let opp;
  if (reason === "route") {
    opp = pool.reduce((best, o) => (opponentStrength(o) > opponentStrength(best) ? o : best), pool[0]);
  } else {
    opp = rng.pick(pool);
  }
  const seed = rng.int(0, 2 ** 31);
  state.rngState = rng.getState();
  state.pendingMatch = { kind: "friendly", opponentId: opp.id, possessions: cfg.friendly.possessions, seed, reason };
  state.phase = "match";
  log(state, reason === "route" ? `원정 친선전: ${opp.name}` : `친선전: ${opp.name}`);
}

/**
 * seasonStart 이벤트 체크
 * @param {RunState} state
 * @param {object} data
 * @param {boolean} guaranteed
 */
function seasonStartEventCheck(state, data, guaranteed) {
  const pool = eligibleEvents(state, data, "seasonStart");
  if (!pool.length) return;
  if (!guaranteed) {
    const rng = createRngFromState(state.rngState);
    const fire = rng.chance(data.config.eventChancePerTurn);
    state.rngState = rng.getState();
    if (!fire) return;
  }
  fireWeighted(state, data, pool);
}

/**
 * §6.6 1·2
 * @param {RunState} state
 * @param {object} data
 */
function eventCheck(state, data) {
  const sup = findSupportEvent(state, data, null);
  if (sup) {
    fireEvent(state, data, sup.event, sup.supportId);
    return;
  }
  const rng = createRngFromState(state.rngState);
  const roll = rng.chance(data.config.eventChancePerTurn);
  state.rngState = rng.getState();
  if (!roll) return;
  fireWeighted(state, data, eligibleEvents(state, data, "random"));
}

/**
 * 시즌 종료: 루트 제시 또는 런 종료
 * @param {RunState} state
 * @param {object} data
 */
function seasonEnd(state, data) {
  if (state.season < data.config.seasons) {
    if (!data.routes.length) throw new Error("routes 가 비어 있습니다");
    state.pendingRoutes = data.routes.map((r) => r.id);
    state.phase = "route";
    log(state, `시즌 ${state.season} 종료. 다음 루트를 선택하세요.`);
  } else {
    state.phase = "finished";
    log(state, "모든 시즌이 끝났습니다. 런 종료.");
  }
}

/**
 * queue 한 단계 실행
 * @param {RunState} state
 * @param {object} data
 * @param {string} step
 */
function runStep(state, data, step) {
  if (step.startsWith("routeEvent:")) {
    const routeId = step.slice("routeEvent:".length);
    fireWeighted(state, data, eligibleEvents(state, data, "route", { routeId }));
    return;
  }
  switch (step) {
    case "eventCheck":
      eventCheck(state, data);
      break;
    case "preMatchCheck":
      fireWeighted(state, data, eligibleEvents(state, data, "preMatch"));
      break;
    case "goalMatch":
      setupGoalMatch(state, data);
      break;
    case "advanceTurn":
      endTurnTick(state);
      state.turnIndex += 1;
      state.turn += 1;
      beginTurn(state, data);
      break;
    case "beginTurn":
      beginTurn(state, data);
      break;
    case "seasonEnd":
      seasonEnd(state, data);
      break;
    case "routeFriendly":
      setupFriendly(state, data, "route");
      break;
    case "seasonStartEvent":
      seasonStartEventCheck(state, data, false);
      break;
    case "seasonStartEventGuaranteed":
      seasonStartEventCheck(state, data, true);
      break;
    default:
      throw new Error(`알 수 없는 queue 단계: '${step}'`);
  }
}

/**
 * 사용자 입력이 필요한 phase 가 되거나 queue 가 비기까지 단계 처리
 * @param {RunState} state
 * @param {object} data
 * @returns {RunState}
 */
function runQueue(state, data) {
  let guard = 0;
  while (state.queue.length > 0 && !STOP_PHASES.has(state.phase)) {
    if (++guard > 64) throw new Error("run queue 가 끝나지 않습니다");
    runStep(state, data, state.queue.shift());
  }
  return state;
}

/**
 * 이벤트/유물 대기 뒤에 흐름을 이어간다.
 * @param {RunState} state
 * @param {object} data
 */
function continueFlow(state, data) {
  if (state.pendingRelicChoices && state.pendingRelicChoices.length) {
    state.phase = "relic";
    return state;
  }
  state.phase = "turn";
  runQueue(state, data);
  if (state.phase === "turn" && !state.placement) beginTurn(state, data);
  return state;
}

/**
 * 훈련 결과 로그 문장
 * @param {RunState} state
 * @param {import("./training.js").TrainingResult} r
 * @returns {string}
 */
function describeTraining(state, r) {
  const parts = [];
  for (const res of r.results) {
    const p = playerById(state, res.playerId);
    if (res.success) {
      const g = Object.entries(res.gains)
        .filter(([, v]) => v > 0)
        .map(([s, v]) => `${STAT_LABELS[s]} +${v}`)
        .join(" ");
      parts.push(`${p.name} ${g || "(상승 없음)"}`);
    } else {
      parts.push(`${p.name} 실패(${STAT_LABELS[r.slot]} −${res.loss}${res.injured ? ", 부상" : ""})`);
    }
  }
  let text = `훈련[${STAT_LABELS[r.slot]}] ${parts.join(", ") || "선수 없음"}`;
  if (r.friendship) text += " ★우정 훈련";
  if (r.hints.length) text += ` 💡힌트 ${r.hints.length}`;
  return text;
}

// ---------------------------------------------------------------------------
// §5.1 공개 API
// ---------------------------------------------------------------------------

/**
 * 새 런 생성.
 * @param {{ data: object, seed: string|number, squad?: Record<string,string>, formation?: string,
 *           supportIds?: string[], tactics?: object, leagueTier?: number }} params
 * @returns {RunState}
 */
export function createRun({ data, seed, squad, formation, supportIds, tactics, leagueTier = 1 }) {
  assertData(data);
  const cfg = data.config;
  if (seed === undefined || seed === null || seed === "") throw new Error("seed 가 필요합니다");
  const fm = formation || (cfg.defaultSquad && cfg.defaultSquad.formation) || "2-2-2";
  const sq = squad || (cfg.defaultSquad && cfg.defaultSquad.slots);
  const sup = supportIds || cfg.defaultSupports;
  if (!sq || typeof sq !== "object") throw new Error("squad 가 필요합니다");
  const slotInfo = validateSquad(data, fm, sq);

  if (!Array.isArray(sup) || sup.length !== 6) throw new Error(`서포트는 정확히 6장이어야 합니다 (받은 수: ${Array.isArray(sup) ? sup.length : 0})`);
  const supportsData = indexById(data.supports, "supports");
  const seenSup = new Set();
  for (const id of sup) {
    if (seenSup.has(id)) throw new Error(`서포트 '${id}' 가 중복 편성되었습니다`);
    seenSup.add(id);
    getById(supportsData, id, "서포트");
  }

  const chars = indexById(data.characters, "characters");
  const rng = createRng(seed);

  const players = formationSlots(fm).map((slot, i) => {
    const ch = chars.get(sq[slot]);
    const stats = {};
    const growth = {};
    for (const s of STATS) {
      stats[s] = clamp(Math.round(Number(ch.baseStats && ch.baseStats[s]) || 0), 0, cfg.statCap);
      growth[s] = Number(ch.growth && ch.growth[s]);
      if (!Number.isFinite(growth[s])) growth[s] = 1;
    }
    return {
      id: `p${i + 1}`,
      charId: ch.id,
      name: ch.name,
      slot,
      position: slotInfo[slot].position,
      aptitude: slotInfo[slot].aptitude,
      race: ch.race,
      element: ch.element,
      style: ch.style,
      rarity: ch.rarity,
      portraitColor: ch.portraitColor || "#888888",
      stats,
      growth,
      stamina: 100,
      injuredTurns: 0,
      innateSkillId: ch.innateSkillId || null,
      learnedSkillIds: [],
      trainedCount: 0,
    };
  });

  const supports = sup.map((id) => ({
    id,
    bond: clamp(Math.round(Number(supportsData.get(id).initialBond) || 0), 0, 100),
    firedEventIds: [],
  }));

  /** @type {RunState} */
  const state = {
    version: RUN_VERSION,
    seed,
    rngState: rng.getState(),
    phase: "turn",
    season: 1,
    turn: 1,
    turnIndex: 0,
    leagueTier,
    formation: fm,
    tactics: normalizeTactics({ ...(cfg.defaultTactics || {}), ...(tactics || {}) }),
    players,
    supports,
    condition: clamp(cfg.condition.start, 0, 4),
    teamwork: 0,
    skillPoints: 0,
    hints: {},
    relics: [],
    modifiers: [],
    summonTickets: cfg.summonTicketsPerSeason,
    summon: null,
    placement: null,
    currentEvent: null,
    pendingMatch: null,
    lastMatchResult: null,
    pendingRelicChoices: null,
    pendingRoutes: null,
    record: { goalMatches: [], friendlies: [], losses: 0 },
    usedEventIds: [],
    log: [],
    rating: null,
    queue: [],
  };

  log(state, `새 런 시작 (seed: ${seed}). 시즌 1.`);
  state.queue = ["seasonStartEvent", "beginTurn"];
  runQueue(state, data);
  return state;
}

/**
 * @param {RunState} state
 * @returns {string}
 */
export function getPhase(state) {
  return state.phase;
}

/**
 * 스탯 × 적성 배율 (경기용). data 가 없으면 기본 배율 {A:1, B:0.9, C:0.75}.
 * @param {RunState} state
 * @param {string} playerId
 * @param {object} [data]
 * @returns {Record<string, number>}
 */
export function getEffectiveStats(state, playerId, data) {
  const p = playerById(state, playerId);
  const table = (data && data.config && data.config.aptitudeMult) || DEFAULT_APTITUDE_MULT;
  const mult = table[p.aptitude] ?? 1;
  const out = {};
  for (const s of STATS) out[s] = Math.round((Number(p.stats[s]) || 0) * mult);
  return out;
}

/**
 * 우리 선수 → 스냅샷 선수
 * @param {RunState} state
 * @param {object} data
 * @param {RunPlayer} p
 */
function playerSnapshot(state, data, p) {
  return {
    id: p.id,
    charId: p.charId,
    name: p.name,
    slot: p.slot,
    position: p.position,
    style: p.style,
    element: p.element,
    race: p.race,
    stats: getEffectiveStats(state, p.id, data),
    skillIds: [p.innateSkillId, ...p.learnedSkillIds].filter(Boolean),
    portraitColor: p.portraitColor,
    isYouth: false,
    aptitude: p.aptitude,
    rarity: p.rarity,
    trait: traitOfCharacter(data, p.charId),
  };
}

/**
 * 부상 선수 자리를 채우는 유스 선수 스냅샷
 * @param {object} cfg
 * @param {RunPlayer} p
 */
function youthSnapshot(cfg, p) {
  const stats = {};
  for (const s of STATS) stats[s] = cfg.youthSubstitute.stats;
  return {
    id: `youth_${p.slot}`,
    name: `유스 ${p.slot}`,
    slot: p.slot,
    position: p.position,
    style: cfg.youthSubstitute.style,
    element: p.element,
    race: p.race,
    stats,
    skillIds: [],
    portraitColor: "#8a8a8a",
    isYouth: true,
    replacesPlayerId: p.id,
    trait: null,
  };
}

/**
 * 간파 사용권 (§13.2-8): 경기마다 modifiers.gaanpaTicket 합만큼 (정수, 0 이상). 비용 절반은 gaanpaCostHalf ≥ 1.
 * @param {Record<string, number>} modifiers  스냅샷 modifiers
 * @returns {{ gaanpaTickets: number, gaanpaCostHalf: boolean }}
 */
function gaanpaFields(modifiers) {
  return {
    gaanpaTickets: Math.max(0, Math.floor(Number(modifiers.gaanpaTicket) || 0)),
    gaanpaCostHalf: (Number(modifiers.gaanpaCostHalf) || 0) >= 1,
  };
}

/**
 * 우리 팀 → TeamSnapshot (부상 선수는 유스로 교체, 목표 경기면 goalMatchCondition 가산)
 * v0.3: 선수 trait, 팀 gaanpaTickets·gaanpaCostHalf. intentReveal 삭제. 옛 저장 런의 값은 이행해서 읽는다(상태 불변).
 * @param {RunState} state
 * @param {object} data
 * @returns {TeamSnapshot}
 */
export function buildTeamSnapshot(state, data) {
  assertData(data);
  const cfg = data.config;
  const isGoal = !!(state.pendingMatch && state.pendingMatch.kind === "goal");
  const condIdx = clamp(Math.round(state.condition + (isGoal ? getModifier(state, "goalMatchCondition") : 0)), 0, 4);
  const players = state.players.map((p) => (p.injuredTurns > 0 ? youthSnapshot(cfg, p) : playerSnapshot(state, data, p)));
  const modifiers = {};
  for (const k of SNAPSHOT_MODIFIER_KEYS) modifiers[k] = Math.round(snapshotModifier(state, k) * 10000) / 10000;
  return {
    side: "home",
    name: TEAM_NAME,
    formation: state.formation,
    tactics: normalizeTactics(state.tactics),
    teamwork: state.teamwork,
    conditionMult: cfg.condition.matchMult[condIdx],
    resonance: computeResonance(cfg, players.filter((p) => !p.isYouth)),
    modifiers,
    ...gaanpaFields(modifiers),
    players,
  };
}

/**
 * opponents.json 항목 → TeamSnapshot
 * v0.3: 선수 trait·skillIds(보스 필살기 포함), 전술 readIntent → balanced, 간파 사용권 0. intentReveal 삭제.
 * @param {object} opponent
 * @param {object} data
 * @returns {TeamSnapshot}
 */
export function buildOpponentSnapshot(opponent, data) {
  assertData(data);
  if (!opponent || typeof opponent !== "object") throw new Error("opponent 가 없습니다");
  const cfg = data.config;
  const formation = opponent.formation;
  const slots = formationSlots(formation);
  const players = (opponent.players || []).map((pl, i) => {
    if (!pl || !slots.includes(pl.slot)) throw new Error(`상대 '${opponent.id}' 의 선수 슬롯이 포메이션 ${formation} 과 맞지 않습니다: '${pl && pl.slot}'`);
    const stats = {};
    for (const s of STATS) stats[s] = Math.round(Number(pl.stats && pl.stats[s]) || 0);
    return {
      id: pl.id || `q${i + 1}`,
      name: pl.name || `${opponent.name} ${pl.slot}`,
      slot: pl.slot,
      position: pl.position || slotPosition(pl.slot),
      style: pl.style || "power",
      element: pl.element || opponent.element,
      race: pl.race || opponent.race,
      stats,
      skillIds: Array.isArray(pl.skillIds) ? pl.skillIds.slice() : [],
      portraitColor: pl.portraitColor || opponent.portraitColor || "#b04a4a",
      isYouth: false,
      trait: typeof pl.trait === "string" && pl.trait ? pl.trait : null,
    };
  });
  if (players.length !== slots.length) throw new Error(`상대 '${opponent.id}' 의 선수 수(${players.length})가 포메이션 ${formation} 슬롯 수(${slots.length})와 다릅니다`);
  const seen = new Set(players.map((p) => p.slot));
  if (seen.size !== slots.length) throw new Error(`상대 '${opponent.id}' 의 슬롯이 중복됩니다`);
  const modifiers = {};
  for (const k of SNAPSHOT_MODIFIER_KEYS) modifiers[k] = 0;
  const defaultTeamwork = [25, 50, 75];
  const teamwork = typeof opponent.teamwork === "number" ? opponent.teamwork : defaultTeamwork[clamp((opponent.season || 1) - 1, 0, 2)];
  return {
    side: "away",
    name: opponent.name,
    formation,
    tactics: normalizeTactics({ ...(cfg.defaultTactics || {}), ...(opponent.tactics || {}) }),
    teamwork,
    conditionMult: 1.0,
    resonance: computeResonance(cfg, players),
    modifiers,
    ...gaanpaFields(modifiers),
    players,
    id: opponent.id,
    role: opponent.role,
    season: opponent.season,
  };
}

/**
 * 추천 칸 휴리스틱 (기대값): 성공 확률 × 상승치 − 실패 확률 × (스탯 손실 + 부상으로 잃는 훈련 기회)
 * + 자율 훈련 + 우정 훈련 보너스 + 서포트 유대 기대치 + 소외된 선수 가중.
 * @param {object} cfg
 * @param {RunState} state
 * @param {Array<{ type: string, preview: import("./training.js").SlotPreview }>} slots
 * @returns {{ slot: string, maxFailRate: number }}
 */
function recommendSlot(cfg, state, slots) {
  const tr = cfg.training;
  const counts = state.players.map((p) => p.trainedCount || 0);
  const mean = counts.length ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
  // 부상 1회 = injuryTurns 턴 동안 훈련(주+부 스탯) 기회 상실 (자율 훈련분 포함해 ×1.5)
  const injuryCost = (tr.injuryChanceOnFail || 0) * (tr.injuryTurns || 0) * (tr.mainGain + tr.subGain) * 1.5;
  let best = STATS[0];
  let bestScore = -Infinity;
  let bestFail = 0;
  for (const s of slots) {
    const pv = s.preview;
    let score = 0;
    let slotGain = 0;
    for (const pp of pv.perPlayer) {
      const gain = Object.values(pp.gains).reduce((a, b) => a + b, 0);
      slotGain += gain;
      score += (1 - pp.failRate) * gain - pp.failRate * (tr.failStatLoss + injuryCost);
      const p = state.players.find((x) => x.id === pp.playerId);
      if (p) score += Math.max(0, mean - (p.trainedCount || 0)) * 6;
    }
    score += pv.totalGain - slotGain; // 자율 훈련분
    if (pv.friendship) score += 20;
    // 서포트가 있는 칸은 유대(→ 우정 훈련)·힌트 기대치가 있으므로 가중
    score += (pv.bondGain ? pv.bondGain.length : 0) * 6;
    if (score > bestScore) {
      bestScore = score;
      best = s.type;
      bestFail = pv.maxFailRate;
    }
  }
  return { slot: best, maxFailRate: bestFail };
}

/**
 * 다음 경기 정보 (pendingMatch 우선, 아니면 이번 시즌 목표 경기)
 * v0.3 (§13.5): 의도 공개(intentReveal/baseIntentReveal) 삭제 → styleHint (상대 필드 선수 공격 1위 액션 다수결,
 * "드리블 위주" | "패스 위주" | "혼합"). 추가: styleHintKey, styleCounts, gaanpaTickets(이 경기에 들고 갈 간파 사용권 —
 * 실제 스냅샷과 같은 계산).
 * @param {RunState} state
 * @param {object} data
 */
function nextMatchView(state, data) {
  const cfg = data.config;
  let opp = null;
  let kind = "goal";
  let possessions = null;
  if (state.pendingMatch) {
    opp = data.opponents.find((o) => o.id === state.pendingMatch.opponentId) || null;
    kind = state.pendingMatch.kind;
    possessions = state.pendingMatch.possessions;
  } else {
    opp = data.opponents.find((o) => o.role === "goal" && o.season === state.season) || null;
    const poss = cfg.goalMatch.possessions;
    possessions = poss[Math.min(state.season - 1, poss.length - 1)];
  }
  if (!opp) return null;
  const hint = opponentStyleHint(opp, data);
  return {
    opponentId: opp.id,
    opponentName: opp.name,
    element: opp.element,
    race: opp.race,
    style: dominantStyle(opp),
    styleHint: hint.label,
    styleHintKey: hint.key,
    styleCounts: hint.counts,
    gaanpaTickets: gaanpaFields({ gaanpaTicket: Math.round(snapshotModifier(state, "gaanpaTicket") * 10000) / 10000 }).gaanpaTickets,
    possessions,
    kind,
    formation: opp.formation,
  };
}

/**
 * 훈련 화면 뷰. 상태를 바꾸지 않는다 (rng 소비 없음).
 * @param {RunState} state
 * @param {object} data
 * @returns {object}
 */
export function getTurnView(state, data) {
  assertData(data);
  const cfg = data.config;
  const tr = cfg.training;
  const supportsData = indexById(data.supports, "supports");
  const skillsData = indexById(data.skills, "skills");
  const hintMod = getModifier(state, "hintRate");
  const placement = state.placement || emptyPlacement();

  const players = state.players.map((p) => ({
    id: p.id,
    charId: p.charId,
    name: p.name,
    slot: p.slot,
    position: p.position,
    aptitude: p.aptitude,
    stamina: p.stamina,
    injuredTurns: p.injuredTurns,
    stats: { ...p.stats },
    growth: { ...p.growth },
    portraitColor: p.portraitColor,
    mainStat: mainStatOf(p.position),
    mainStatValue: p.stats[mainStatOf(p.position)],
    element: p.element,
    style: p.style,
    race: p.race,
    rarity: p.rarity,
    innateSkillId: p.innateSkillId,
    learnedSkillIds: p.learnedSkillIds.slice(),
    trainedCount: p.trainedCount,
    trait: traitOfCharacter(data, p.charId),
  }));

  const slots = STATS.map((type) => {
    const pl = placement[type] || { players: [], supports: [] };
    const preview = previewSlot(state, data, type);
    const supports = pl.supports.map((id) => {
      const card = getById(supportsData, id, "서포트");
      const st = state.supports.find((s) => s.id === id);
      const bond = st ? st.bond : 0;
      return {
        id,
        name: card.name,
        type: card.type,
        rarity: card.rarity,
        portraitColor: card.portraitColor || "#888888",
        bond,
        friendship: bond >= tr.friendshipThreshold && card.type === type,
        hint: Array.isArray(card.hintSkillIds) && card.hintSkillIds.length > 0 && (Number(card.hintRate) || 0) + hintMod > 0,
      };
    });
    return {
      type,
      label: STAT_LABELS[type],
      players: pl.players.slice(),
      supports,
      preview: {
        perPlayer: preview.perPlayer,
        freePlayers: preview.freePlayers,
        totalGain: preview.totalGain,
        maxFailRate: preview.maxFailRate,
        friendship: preview.friendship,
        bondGain: preview.bondGain,
        teamworkGain: preview.teamworkGain,
        eff: Math.round(preview.eff * 1000) / 1000,
      },
    };
  });

  const shop = Object.entries(state.hints)
    .filter(([, lv]) => lv > 0)
    .map(([skillId, hintLevel]) => {
      const skill = skillsData.get(skillId);
      if (!skill || !skill.learnable) return null;
      const cost = Number(skill.cost) || 0;
      const discountedCost = skillDiscountedCost(cost, hintLevel);
      const eligiblePlayerIds = state.players.filter((p) => canLearnSkill(state, data, skillId, p.id).ok).map((p) => p.id);
      return {
        skillId,
        name: skill.name,
        kind: skill.kind,
        description: skill.description || "",
        positions: skill.positions || null,
        cost,
        discountedCost,
        hintLevel,
        eligiblePlayerIds,
        canAfford: state.skillPoints >= discountedCost,
      };
    })
    .filter(Boolean);

  const healthy = state.players.filter((p) => p.injuredTurns <= 0);
  const avgStamina = healthy.length ? healthy.reduce((a, p) => a + p.stamina, 0) / healthy.length : 0;
  const friendSupportId = findFriendSupportId(state, data);
  const rec = recommendSlot(cfg, state, slots);
  // 휴식 추천: 팀 평균 체력이 낮거나, 추천 칸에 실패율 25% 이상(체력 40 미만) 선수가 있을 때
  const recommendedAction = avgStamina < 40 || rec.maxFailRate >= 0.25 ? "rest" : "train";

  return {
    phase: state.phase,
    season: state.season,
    turn: state.turn,
    turnIndex: state.turnIndex,
    turnsPerSeason: cfg.turnsPerSeason,
    turnsUntilMatch: Math.max(0, cfg.turnsPerSeason - state.turn),
    nextMatch: nextMatchView(state, data),
    condition: state.condition,
    teamwork: state.teamwork,
    skillPoints: state.skillPoints,
    summonTickets: state.summonTickets,
    summon: state.summon ? { ...state.summon } : null,
    formation: state.formation,
    tactics: { ...state.tactics },
    players,
    supports: state.supports.map((s) => {
      const card = supportsData.get(s.id);
      return { id: s.id, name: card ? card.name : s.id, type: card ? card.type : null, rarity: card ? card.rarity : null, bond: s.bond, portraitColor: card ? card.portraitColor : "#888888" };
    }),
    slots,
    recommendedSlot: rec.slot,
    recommendedAction,
    canOuting: true,
    friendSupportId,
    shop,
    hints: { ...state.hints },
    relics: state.relics.slice(),
    modifiers: migrateModifierList(state.modifiers).map((m) => ({ ...m })),
    record: { goalMatches: state.record.goalMatches.slice(), friendlies: state.record.friendlies.slice(), losses: state.record.losses },
    lastMatchResult: state.lastMatchResult,
    log: state.log.slice(-20),
  };
}

/**
 * 호출권: 턴 소모 없음. 선수를 그 칸으로 옮긴다.
 * @param {RunState} state
 * @param {object} data
 * @param {{ playerId: string, slot: string }} action
 */
function doSummon(state, data, action) {
  if (state.summonTickets <= 0) throw new Error("호출권이 없습니다");
  const p = playerById(state, action.playerId);
  if (p.injuredTurns > 0) throw new Error(`${p.name} 은(는) 부상 중이라 호출할 수 없습니다`);
  if (!STATS.includes(action.slot)) throw new Error(`알 수 없는 훈련 칸: '${action.slot}'`);
  if (!state.placement) placeSlots(state, data);
  for (const s of STATS) state.placement[s].players = state.placement[s].players.filter((id) => id !== p.id);
  state.placement[action.slot].players.push(p.id);
  state.summonTickets -= 1;
  state.summon = { playerId: p.id, slot: action.slot };
  log(state, `호출권 사용: ${p.name} → ${STAT_LABELS[action.slot]} 칸`);
}

/**
 * 턴 행동.
 * @param {RunState} state
 * @param {object} data
 * @param {{ type: "train", slot: string } | { type: "rest" } | { type: "outing" } |
 *         { type: "meeting", tactics?: object, formation?: string, swaps?: Array<{ playerId: string, slot: string }>, buy?: { skillId: string, playerId: string } } |
 *         { type: "friendly" } | { type: "summon", playerId: string, slot: string }} action
 * @returns {RunState}
 */
export function applyAction(state, data, action) {
  assertData(data);
  if (!action || typeof action.type !== "string") throw new Error("action.type 이 필요합니다");
  assertPhase(state, "turn");
  migrateRun(state);
  const cfg = data.config;

  switch (action.type) {
    case "summon":
      doSummon(state, data, action);
      return state;

    case "train": {
      if (!STATS.includes(action.slot)) throw new Error(`알 수 없는 훈련 칸: '${action.slot}'`);
      const r = resolveTraining(state, data, action.slot);
      log(state, describeTraining(state, r));
      state.queue = postActionQueue(state, data, false);
      break;
    }

    case "rest": {
      const r = resolveRest(state, data);
      log(state, `휴식: 전원 체력 +${r.staminaGain}${r.conditionUp ? ", 컨디션 상승" : ""}`);
      state.queue = postActionQueue(state, data, false);
      break;
    }

    case "outing": {
      const r = resolveOuting(state, data);
      if (r.friendSupportId) {
        const card = getById(data.supports, r.friendSupportId, "서포트");
        log(state, `외출: ${card.name} 와 외출 (유대 +${r.bondGain}, 컨디션 +${cfg.outing.condition})`);
        const found = findSupportEvent(state, data, r.friendSupportId);
        if (found) {
          fireEvent(state, data, found.event, found.supportId);
          state.queue = postActionQueue(state, data, true);
          return state;
        }
      } else {
        log(state, `외출: 팀 나들이 (컨디션 +${cfg.outing.condition}, 전원 체력 +${r.staminaGain})`);
      }
      state.queue = postActionQueue(state, data, false);
      break;
    }

    case "meeting": {
      const r = resolveMeeting(state, data, action);
      state.tactics = normalizeTactics(state.tactics); // 폐지된 전술 값(readIntent) 이행
      let text = `전술 미팅: 팀워크 +${r.teamworkGain}`;
      if (r.formationChanged) text += `, 포메이션 ${state.formation}`;
      if (r.swapped) text += `, 포지션 변경 ${r.swapped}`;
      if (r.bought) {
        const skill = getById(data.skills, r.bought.skillId, "스킬");
        text += `, ${playerById(state, r.bought.playerId).name} 이(가) '${skill.name}' 습득 (SP −${r.bought.cost})`;
      }
      log(state, text);
      state.queue = postActionQueue(state, data, false);
      break;
    }

    case "friendly": {
      state.queue = postActionQueue(state, data, false);
      setupFriendly(state, data, "friendly");
      return state;
    }

    default:
      throw new Error(`알 수 없는 행동: '${action.type}'`);
  }

  runQueue(state, data);
  return state;
}

/**
 * 이벤트 뷰 (치환 완료)
 * @param {RunState} state
 * @param {object} data
 * @returns {{ eventId: string, title: string, text: string, choices: Array<{ text: string, preview: string }>, player: object|null, support: object|null, trigger: string }}
 */
export function getEventView(state, data) {
  assertData(data);
  assertPhase(state, "event");
  if (!state.currentEvent) throw new Error("currentEvent 가 없습니다");
  const ev = getById(data.events, state.currentEvent.eventId, "이벤트");
  const player = state.currentEvent.playerId ? state.players.find((p) => p.id === state.currentEvent.playerId) || null : null;
  const card = state.currentEvent.supportId ? data.supports.find((s) => s.id === state.currentEvent.supportId) || null : null;
  const supState = card ? state.supports.find((s) => s.id === card.id) || null : null;
  const vars = { playerName: player ? player.name : "선수", supportName: card ? card.name : "서포트", season: state.season };
  return {
    eventId: ev.id,
    trigger: ev.trigger,
    title: substitute(ev.title, vars),
    text: substitute(ev.text, vars),
    choices: ev.choices.map((c) => ({ text: substitute(c.text, vars), preview: substitute(c.preview || "", vars) })),
    player: player ? { id: player.id, name: player.name, portraitColor: player.portraitColor, slot: player.slot, position: player.position } : null,
    support: card ? { id: card.id, name: card.name, portraitColor: card.portraitColor || "#888888", type: card.type, bond: supState ? supState.bond : null } : null,
  };
}

/**
 * 이벤트 선택 → 효과 적용 → 다음 phase
 * @param {RunState} state
 * @param {object} data
 * @param {number} choiceIndex
 * @returns {RunState}
 */
export function resolveEvent(state, data, choiceIndex) {
  assertData(data);
  assertPhase(state, "event");
  if (!state.currentEvent) throw new Error("currentEvent 가 없습니다");
  migrateRun(state);
  const ev = getById(data.events, state.currentEvent.eventId, "이벤트");
  const idx = Number(choiceIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= ev.choices.length) {
    throw new Error(`선택지 번호가 잘못되었습니다: ${choiceIndex} (0~${ev.choices.length - 1})`);
  }
  const choice = ev.choices[idx];
  const { playerId, supportId } = state.currentEvent;
  applyEffects(state, data, choice.effects || [], { playerId, supportId, eventId: ev.id });

  const player = playerId ? state.players.find((p) => p.id === playerId) : null;
  const card = supportId ? data.supports.find((s) => s.id === supportId) : null;
  const vars = { playerName: player ? player.name : "선수", supportName: card ? card.name : "서포트", season: state.season };
  const result = substitute(choice.resultText || choice.text || "", vars);
  log(state, `[${substitute(ev.title, vars)}] ${result}`);

  state.currentEvent = null;
  return continueFlow(state, data);
}

/**
 * 경기 세팅 (phase "match")
 * @param {RunState} state
 * @param {object} data
 * @returns {{ home: TeamSnapshot, away: TeamSnapshot, possessions: number, seed: number, rules: object, kind: string, reason: string, opponentName: string, opponentId: string }}
 */
export function getMatchSetup(state, data) {
  assertData(data);
  assertPhase(state, "match");
  if (!state.pendingMatch) throw new Error("pendingMatch 가 없습니다");
  const pm = state.pendingMatch;
  const opp = getById(data.opponents, pm.opponentId, "상대 팀");
  return {
    home: buildTeamSnapshot(state, data),
    away: buildOpponentSnapshot(opp, data),
    possessions: pm.possessions,
    seed: pm.seed,
    kind: pm.kind,
    reason: pm.reason,
    opponentName: opp.name,
    opponentId: opp.id,
    rules: {
      allowDraw: pm.kind === "friendly",
      extraTime: pm.kind !== "friendly",
      penalties: pm.kind !== "friendly",
      isGoalMatch: pm.kind === "goal",
      possessions: pm.possessions,
    },
  };
}

/**
 * 경기 종료 처리 (§6.8). matchResult = match.getResult() 반환값.
 * @param {RunState} state
 * @param {object} data
 * @param {{ winner: "home"|"away"|"draw", homeGoals: number, awayGoals: number, penalties?: object, stats?: object }} matchResult
 * @returns {RunState}
 */
export function finishMatch(state, data, matchResult) {
  assertData(data);
  assertPhase(state, "match");
  if (!state.pendingMatch) throw new Error("pendingMatch 가 없습니다");
  if (!matchResult || typeof matchResult !== "object") throw new Error("matchResult 가 필요합니다");
  migrateRun(state);
  const cfg = data.config;
  const pm = state.pendingMatch;
  const opp = getById(data.opponents, pm.opponentId, "상대 팀");
  const winner = matchResult.winner;
  if (winner !== "home" && winner !== "away" && winner !== "draw") throw new Error(`matchResult.winner 가 잘못되었습니다: '${winner}'`);
  const win = winner === "home";
  const draw = winner === "draw";
  const homeGoals = Math.max(0, Math.round(Number(matchResult.homeGoals) || 0));
  const awayGoals = Math.max(0, Math.round(Number(matchResult.awayGoals) || 0));
  const spMult = 1 + getModifier(state, "skillPointGain");

  let sp = 0;
  let relicCount = 0;
  let relicGuaranteed = false;
  let relicChance = 0;

  if (pm.kind === "goal") {
    const rec = { season: state.season, opponentId: opp.id, win, home: homeGoals, away: awayGoals };
    if (matchResult.penalties && typeof matchResult.penalties === "object") {
      // 승부차기 판정 (목표 경기는 무승부 없음) — UI 가 동점 스코어에 PK 결과를 붙여 보여 준다
      rec.penalties = {
        home: Math.max(0, Math.round(Number(matchResult.penalties.home) || 0)),
        away: Math.max(0, Math.round(Number(matchResult.penalties.away) || 0)),
      };
    }
    state.record.goalMatches.push(rec);
    if (win) {
      sp = cfg.goalMatch.skillPointsWin;
      relicCount = 3;
      relicGuaranteed = true;
    } else {
      state.record.losses += 1;
      const half = getModifier(state, "lossPenaltyHalf") >= 1;
      sp = half ? Math.round((cfg.goalMatch.skillPointsWin + cfg.goalMatch.skillPointsLoss) / 2) : cfg.goalMatch.skillPointsLoss;
      if (half) {
        relicCount = 2;
        relicGuaranteed = true;
      }
    }
  } else {
    state.record.friendlies.push({ season: state.season, opponentId: opp.id, win, draw, home: homeGoals, away: awayGoals, reason: pm.reason });
    sp = win ? cfg.friendly.skillPointsWin : cfg.friendly.skillPointsLoss;
    applyFriendlyStaminaCost(state, data);
    if (win) {
      relicCount = 3;
      if (pm.reason === "route") relicGuaranteed = true;
      else relicChance = cfg.friendly.relicChanceOnWin;
    }
  }

  const spGain = Math.max(0, Math.round(sp * spMult));
  state.skillPoints += spGain;

  const rng = createRngFromState(state.rngState);
  let choices = [];
  if (relicCount > 0 && (relicGuaranteed || rng.chance(relicChance))) {
    choices = pickRelicChoices(state, data, rng, relicCount);
  }
  state.rngState = rng.getState();

  state.lastMatchResult = {
    season: state.season,
    kind: pm.kind,
    reason: pm.reason,
    opponentId: opp.id,
    opponentName: opp.name,
    winner,
    win,
    draw,
    homeGoals,
    awayGoals,
    penalties: matchResult.penalties ?? null,
    stats: matchResult.stats ?? null,
    skillPointsGained: spGain,
    relicOffered: choices.length > 0,
  };
  const label = pm.kind === "goal" ? "목표 경기" : pm.reason === "route" ? "원정 친선전" : "친선전";
  const outcome = win ? "승리" : draw ? "무승부" : "패배";
  log(state, `${label} vs ${opp.name} ${homeGoals}:${awayGoals} ${outcome} (SP +${spGain})`);

  state.pendingMatch = null;
  if (choices.length) {
    state.pendingRelicChoices = choices;
    state.phase = "relic";
    return state;
  }
  return continueFlow(state, data);
}

/**
 * 유물 선택 (phase "relic"). 유물의 modifiers 는 state.modifiers 에 런 지속(untilSeason null)으로 추가한다.
 * @param {RunState} state
 * @param {object} data
 * @param {string} relicId
 * @returns {RunState}
 */
export function chooseRelic(state, data, relicId) {
  assertData(data);
  assertPhase(state, "relic");
  migrateRun(state);
  if ((relicId === null || relicId === undefined) && !(Array.isArray(state.pendingRelicChoices) && state.pendingRelicChoices.length)) {
    // 선택지가 비어 있는 relic phase (방어적): 건너뛰고 흐름을 이어간다
    state.pendingRelicChoices = null;
    return continueFlow(state, data);
  }
  if (!Array.isArray(state.pendingRelicChoices) || !state.pendingRelicChoices.includes(relicId)) {
    throw new Error(`유물 '${relicId}' 은(는) 선택지에 없습니다`);
  }
  const relic = getById(data.relics, relicId, "유물");
  for (const key of Object.keys(relic.modifiers || {})) assertModifierKey(key, `유물 ${relicId}`);
  state.relics.push(relicId);
  for (const [key, amount] of Object.entries(relic.modifiers || {})) {
    state.modifiers.push({ key, amount: Number(amount) || 0, untilSeason: null, source: `relic:${relicId}` });
  }
  state.pendingRelicChoices = null;
  log(state, `유물 획득: ${relic.name}`);
  return continueFlow(state, data);
}

/**
 * 루트 선택 (phase "route") → 다음 시즌 시작.
 * 순서: 시즌 +1 → 호출권 +1 → 만료 modifier 제거 → 루트 효과 → route 이벤트 → (원정) 강제 친선전 → seasonStart 이벤트 → 턴 1 배치
 * @param {RunState} state
 * @param {object} data
 * @param {string} routeId
 * @returns {RunState}
 */
export function chooseRoute(state, data, routeId) {
  assertData(data);
  assertPhase(state, "route");
  migrateRun(state);
  if (!Array.isArray(state.pendingRoutes) || !state.pendingRoutes.includes(routeId)) {
    throw new Error(`루트 '${routeId}' 은(는) 선택지에 없습니다`);
  }
  const cfg = data.config;
  const route = getById(data.routes, routeId, "루트");
  state.pendingRoutes = null;

  state.season += 1;
  state.turn = 1;
  state.turnIndex = (state.season - 1) * cfg.turnsPerSeason;
  state.summonTickets += cfg.summonTicketsPerSeason;
  state.modifiers = state.modifiers.filter((m) => m.untilSeason === null || m.untilSeason === undefined || m.untilSeason >= state.season);
  state.summon = null;
  state.placement = null;

  log(state, `루트 선택: ${route.name}. 시즌 ${state.season} 시작.`);
  applyEffects(state, data, route.effects || [], { playerId: null, supportId: null, eventId: null });

  state.queue = [`routeEvent:${route.id}`];
  if (route.forcedFriendly) state.queue.push("routeFriendly");
  state.queue.push(route.guaranteedSeasonStartEvent ? "seasonStartEventGuaranteed" : "seasonStartEvent");
  state.queue.push("beginTurn");
  return continueFlow(state, data);
}

/**
 * 런 종료 평가 (phase "finished")
 * @param {RunState} state
 * @param {object} data
 * @returns {{ rating: import("./rating.js").Rating, registeredTeam: object }}
 */
export function finalizeRun(state, data) {
  assertData(data);
  assertPhase(state, "finished");
  const rating = computeRating(state, data);
  state.rating = rating;
  const registeredTeam = {
    name: TEAM_NAME,
    seed: state.seed,
    formation: state.formation,
    tactics: normalizeTactics(state.tactics),
    players: state.players.map((p) => playerSnapshot(state, data, p)),
    teamwork: state.teamwork,
    rating,
    createdTurnIndex: state.turnIndex,
    leagueTier: state.leagueTier,
    relics: state.relics.slice(),
    record: { goalMatches: state.record.goalMatches.slice(), friendlies: state.record.friendlies.slice(), losses: state.record.losses },
  };
  return { rating, registeredTeam };
}

export { MAX_LEARNED_SKILLS };
