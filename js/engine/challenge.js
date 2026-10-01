/**
 * challenge.js — 도전 모드 (2026-10-01, 플레이테스트용 — 밸런스 확정 아님)
 *
 * 완성된 팀(등록 팀 · 테스트용 샘플 팀)으로 점점 강해지는 1~10단계 사다리. 데이터:
 *   data.challenge             = data/challenge.json (단계 · 스킬 단계 규칙 · 액티브 후보)
 *   data.challenge_sample_team = data/challenge_sample_team.json (tools/challenge_sim.mjs --write-sample 로 만든 고정 팀)
 *
 * 상대 = opponents.json 템플릿 복제 → 모든 스탯 × (statTarget / 템플릿 평균) (config statRound 단위 반올림, 1000 상한 없음 —
 *   엠버스론 원본도 1000 을 넘고 경기 엔진에는 상한이 없다) → skillTier 규칙으로 스킬 추가. 템플릿 고유 스킬·특성은 그대로 둔다.
 * 우리 팀 = 등록 팀 저장본(선수별 실효 스탯 · 스킬 · 특성 · 전술 · 포메이션)으로 만든 새 스냅샷 (체력 가득 · 텐션 시작값은 경기 엔진이 채운다).
 * 진행 기록 = 팀 id 별 { cleared, attempts, wins, lastResult, resets } — 이 모듈은 입력을 바꾸지 않고 새 객체를 돌려주는 헬퍼만,
 *   저장(localStorage 'soccer.challenge')은 UI 가 한다.
 *   resets = [진행 초기화] 횟수: 초기화해도 남아 경기 시드에 섞인다 → 초기화 뒤 도전 번호가 1 로 돌아가도 새 경기 (0 이면 시드는 예전 그대로).
 *   lastResult.forfeit = 경기 중 [포기] (패배로 센다 — 화면은 "기권 패").
 *
 * 순수 로직: DOM/fetch/Date/Math.random/localStorage 사용 금지. 날짜가 필요하면(lastResult.at) 호출하는 쪽이 넘긴다.
 * 런 상태(store.run)와 런 저장('soccer.run' · 'soccer.match')은 건드리지 않는다.
 */
import { hashString } from "./rng.js";
import {
  STATS,
  POSITIONS,
  formationSlots,
  slotPosition,
  mainStatOf,
  normalizeTactics,
  migrateRegisteredTeam,
  buildOpponentSnapshot,
  opponentStyleHint,
} from "./run.js";
import { getSkillMap, isGaanpaSkill, isDistributionSkill } from "./skills.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

/** 진행 기록 저장 형식 버전 ('soccer.challenge') */
export const CHALLENGE_PROGRESS_VERSION = 1;
/** 테스트용 샘플 팀의 팀 id */
export const SAMPLE_TEAM_ID = "sample";
export const SAMPLE_TEAM_NAME = "테스트용 샘플 팀";
/** 단계 기능 배지 (사다리 · 미리보기 표시 순서) */
export const FEATURE_KEYS = ["active", "gaanpa", "ultShot", "ultSave", "cannon"];
export const FEATURE_LABELS = { active: "액티브", gaanpa: "간파", ultShot: "필살 슛", ultSave: "필살 세이브", cannon: "캐논 킥" };
/** 단계 상태 */
export const STAGE_STATES = ["locked", "open", "cleared"];
/** 경기 스냅샷 modifiers 키 (run.js SNAPSHOT_MODIFIER_KEYS 와 같은 목록 — 등록 팀은 유물에서 다시 계산한다) */
const SNAPSHOT_MODIFIER_KEYS = ["shootPower", "defense", "tensionGain", "staminaCost", "passAttack", "dribbleStaminaRefund", "gaanpaTicket", "gaanpaCostHalf"];
const DEFAULT_POSSESSIONS = 8;
const DEFAULT_KIND = "goal";
const DEFAULT_STAT_ROUND = 10;
/** 상대 팀워크 기본값 (단계에 teamwork 가 없을 때, 템플릿 시즌별 — run.buildOpponentSnapshot 과 같은 값) */
const DEFAULT_TEAMWORK = [25, 50, 75];

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

const clone = (x) => JSON.parse(JSON.stringify(x));
const num = (v, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

function cfgOf(data) {
  const c = data && data.challenge;
  if (!c || !Array.isArray(c.stages) || c.stages.length === 0) {
    throw new Error("challenge: data.challenge (data/challenge.json · stages) 가 필요합니다");
  }
  return c;
}

function opponentById(data, id) {
  const list = data && Array.isArray(data.opponents) ? data.opponents : [];
  const op = list.find((o) => o && o.id === id);
  if (!op) throw new Error(`challenge: 상대 템플릿 '${id}' 를 opponents.json 에서 찾을 수 없습니다`);
  return op;
}

function skillNameOf(data, id) {
  const sk = getSkillMap(data).get(id);
  return sk && sk.name ? sk.name : id;
}

function traitNameOf(data, id) {
  if (!id) return null;
  const list = data && Array.isArray(data.traits) ? data.traits : [];
  const t = list.find((x) => x && x.id === id);
  return t && t.name ? t.name : id;
}

function posOf(p) {
  return p.position && POSITIONS.includes(p.position) ? p.position : slotPosition(p.slot);
}

/** 7명 × 5스탯 평균 (팀 전력 표시 · 배율 기준) */
export function teamPower(players) {
  let s = 0;
  let n = 0;
  for (const p of players || []) {
    for (const k of STATS) {
      s += num(Number(p && p.stats && p.stats[k]), 0);
      n++;
    }
  }
  return n ? s / n : 0;
}

/** 스킬의 필살기 종류 ("shot" | "pass" | "save") 또는 null */
function ultimateType(skill) {
  return skill && skill.kind === "unique" && skill.ultimate && typeof skill.ultimate === "object" ? skill.ultimate.type || null : null;
}

function playerUltimateType(data, p) {
  const map = getSkillMap(data);
  for (const id of p.skillIds || []) {
    const t = ultimateType(map.get(id));
    if (t) return t;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 단계 데이터
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ChallengeStage
 * @property {number} stage           1부터
 * @property {string} title           단계 부제 (예: "챔피언의 왕좌")
 * @property {string} opponentTemplate opponents.json id
 * @property {string|null} suffix     이름 꼬리표 (예: "각성")
 * @property {number} statTarget      스케일 뒤 7명 × 5스탯 평균 목표
 * @property {number} skillTier       data.challenge.tiers 의 tier
 * @property {number|null} teamwork   상대 팀워크 (없으면 템플릿 시즌 기본값)
 * @property {object|null} tactics    템플릿 전술 위에 덮어쓸 값 (선택)
 * @property {number} possessions
 * @property {"goal"|"friendly"} kind
 */

/**
 * 단계 목록 (stage 오름차순, 기본값 채운 사본).
 * @param {object} data
 * @returns {ChallengeStage[]}
 */
export function getStages(data) {
  const c = cfgOf(data);
  return c.stages
    .map((s) => ({
      stage: Math.round(num(s.stage, 0)),
      title: typeof s.title === "string" ? s.title : "",
      opponentTemplate: s.opponentTemplate,
      suffix: typeof s.suffix === "string" && s.suffix ? s.suffix : null,
      statTarget: num(s.statTarget, 0),
      skillTier: Math.max(0, Math.round(num(s.skillTier, 0))),
      teamwork: typeof s.teamwork === "number" ? s.teamwork : null,
      tactics: s.tactics && typeof s.tactics === "object" ? { ...s.tactics } : null,
      possessions: Math.max(1, Math.round(num(s.possessions, num(c.possessions, DEFAULT_POSSESSIONS)))),
      kind: s.kind === "friendly" || s.kind === "goal" ? s.kind : c.kind === "friendly" ? "friendly" : DEFAULT_KIND,
    }))
    .sort((a, b) => a.stage - b.stage);
}

/** 단계 수 */
export function stageCount(data) {
  return getStages(data).length;
}

/**
 * 단계 정의 하나. 없으면 throw.
 * @param {object} data
 * @param {number} stage
 * @returns {ChallengeStage}
 */
export function getStage(data, stage) {
  const n = Number(stage);
  const s = getStages(data).find((x) => x.stage === n);
  if (!s) throw new Error(`challenge: ${stage}단계가 없습니다`);
  return s;
}

/** 스킬 단계 규칙 (없는 tier 면 그 아래 가장 가까운 tier, 그것도 없으면 빈 규칙) */
function tierOf(data, tier) {
  const list = Array.isArray(cfgOf(data).tiers) ? cfgOf(data).tiers : [];
  let best = null;
  for (const t of list) {
    if (!t || num(t.tier, -1) > tier) continue;
    if (!best || num(t.tier, -1) > num(best.tier, -1)) best = t;
  }
  return best || { tier: 0, label: "스킬 없음", actives: 0, gaanpaTickets: 0 };
}

/** 단계 이름: "7단계 · 썬더클로 (각성)" */
export function stageDisplayName(data, stage) {
  const def = typeof stage === "object" && stage ? stage : getStage(data, stage);
  return `${def.stage}단계 · ${stageTeamName(data, def)}`;
}

/** 상대 팀 이름: 템플릿 이름 + (꼬리표) — 경기 화면 HUD 의 상대 이름 */
function stageTeamName(data, def) {
  const tpl = opponentById(data, def.opponentTemplate);
  return def.suffix ? `${tpl.name} (${def.suffix})` : tpl.name;
}

// ---------------------------------------------------------------------------
// 상대 생성
// ---------------------------------------------------------------------------

/**
 * 단계 상대 생성 (opponents.json 항목 모양 + challenge 메타). 입력 데이터는 바꾸지 않는다.
 *  1) 템플릿 선수 복제, 모든 스탯 × statTarget / 템플릿 평균 → statRound 단위 반올림 (1000 상한 없음)
 *  2) 액티브: activePool 순서대로 tier.actives 개 추가. 팀이 이미 가진 스킬은 건너뛴다(개수 안 셈).
 *     받는 선수 = 포지션이 맞는 선수 중 추가 스킬이 가장 적은 → pick 스탯이 가장 높은 → 슬롯 순서.
 *  3) aceShot: 슛 필살기가 팀에 없으면 필살기 없는 FW 중 슈팅 최고에게. gkSave: 세이브 필살기가 없고 GK 에게 필살기가 없으면 GK 에게.
 *     gkDistribution: GK 에게 배급 스킬이 없으면 추가 (캐논 킥).
 *  4) 간파 사용권 tier.gaanpaTickets (스냅샷 gaanpaTickets 로 들어간다)
 * @param {number|ChallengeStage} stage
 * @param {object} data
 * @returns {object} { id, name, baseName, formation, tactics, teamwork, players[], element, race, role, season, description,
 *   challenge: { stage, tier, tierLabel, statTarget, scale, templateId, templatePower, power, gaanpaTickets, added[], features } }
 */
export function buildStageOpponent(stage, data) {
  const def = typeof stage === "object" && stage ? stage : getStage(data, stage);
  const c = cfgOf(data);
  const tpl = opponentById(data, def.opponentTemplate);
  const skills = getSkillMap(data);
  const round = Math.max(1, num(c.statRound, DEFAULT_STAT_ROUND));
  const tplPower = teamPower(tpl.players);
  if (!(tplPower > 0)) throw new Error(`challenge: 템플릿 '${tpl.id}' 의 평균 스탯이 0 입니다`);
  const scale = def.statTarget > 0 ? def.statTarget / tplPower : 1;

  const players = (tpl.players || []).map((p) => {
    const q = clone(p);
    q.position = posOf(q);
    q.stats = {};
    for (const k of STATS) q.stats[k] = Math.max(0, Math.round((num(Number(p.stats && p.stats[k]), 0) * scale) / round) * round);
    q.skillIds = Array.isArray(p.skillIds) ? p.skillIds.slice() : [];
    return q;
  });
  const order = new Map(players.map((p, i) => [p, i]));
  const addedBy = new Map(players.map((p) => [p, 0]));
  const added = [];
  const give = (p, skillId, kind) => {
    p.skillIds.push(skillId);
    addedBy.set(p, addedBy.get(p) + 1);
    added.push({ slot: p.slot, name: p.name, skillId, skillName: skillNameOf(data, skillId), kind });
  };
  const has = (id) => players.some((p) => p.skillIds.includes(id));
  const tier = tierOf(data, def.skillTier);

  // 2) 일반 액티브
  let need = Math.max(0, Math.round(num(tier.actives, 0)));
  for (const entry of Array.isArray(c.activePool) ? c.activePool : []) {
    if (need <= 0) break;
    const sk = skills.get(entry && entry.skillId);
    if (!sk) throw new Error(`challenge: activePool 스킬 '${entry && entry.skillId}' 를 찾을 수 없습니다`);
    if (has(sk.id)) continue;
    const allowed = Array.isArray(entry.positions) && entry.positions.length ? entry.positions : POSITIONS.filter((x) => x !== "GK");
    const skPos = Array.isArray(sk.positions) && sk.positions.length ? sk.positions : null;
    const pick = STATS.includes(entry.pick) ? entry.pick : null;
    const cands = players.filter((p) => allowed.includes(p.position) && (!skPos || skPos.includes(p.position)));
    if (!cands.length) continue;
    cands.sort((a, b) => {
      const d = addedBy.get(a) - addedBy.get(b);
      if (d) return d;
      const ka = pick || mainStatOf(a.position);
      const kb = pick || mainStatOf(b.position);
      const s = num(b.stats[kb], 0) - num(a.stats[ka], 0);
      return s || order.get(a) - order.get(b);
    });
    give(cands[0], sk.id, "active");
    need--;
  }

  // 3) 필살기 · 배급 스킬
  const ultIds = { aceShot: tier.aceShot, gkSave: tier.gkSave, gkDistribution: tier.gkDistribution };
  for (const [k, id] of Object.entries(ultIds)) {
    if (!id) continue;
    if (!skills.get(id)) throw new Error(`challenge: tier ${tier.tier} 의 ${k} 스킬 '${id}' 를 찾을 수 없습니다`);
  }
  if (tier.aceShot && !players.some((p) => playerUltimateType(data, p) === "shot")) {
    const fws = players.filter((p) => p.position === "FW" && !playerUltimateType(data, p));
    fws.sort((a, b) => num(b.stats.shoot, 0) - num(a.stats.shoot, 0) || order.get(a) - order.get(b));
    if (fws[0]) give(fws[0], tier.aceShot, "ultimate");
  }
  const gk = players.find((p) => p.position === "GK") || null;
  if (tier.gkSave && gk && !players.some((p) => playerUltimateType(data, p) === "save") && !playerUltimateType(data, gk)) {
    give(gk, tier.gkSave, "ultimate");
  }
  if (tier.gkDistribution && gk && !gk.skillIds.some((id) => isDistributionSkill(skills.get(id)))) {
    give(gk, tier.gkDistribution, "distribution");
  }

  const gaanpaTickets = Math.max(0, Math.round(num(tier.gaanpaTickets, 0)));
  const tactics = normalizeTactics({ ...((data.config && data.config.defaultTactics) || {}), ...(tpl.tactics || {}), ...(def.tactics || {}) });
  const teamwork = def.teamwork != null ? def.teamwork : DEFAULT_TEAMWORK[clampInt(num(tpl.season, 1) - 1, 0, 2)];
  const out = {
    id: tpl.id,
    name: stageTeamName(data, def),
    baseName: tpl.name,
    race: tpl.race,
    element: tpl.element,
    role: tpl.role,
    season: tpl.season,
    formation: tpl.formation,
    description: tpl.description || "",
    tactics,
    teamwork,
    players,
  };
  out.challenge = {
    stage: def.stage,
    tier: num(tier.tier, 0),
    tierLabel: tier.label || "",
    statTarget: def.statTarget,
    scale: Math.round(scale * 10000) / 10000,
    templateId: tpl.id,
    templatePower: Math.round(tplPower * 10) / 10,
    power: Math.round(teamPower(players)),
    gaanpaTickets,
    added,
    features: featuresOf(data, players, gaanpaTickets),
  };
  return out;
}

/**
 * 팀 기능 배지: 액티브(배급 스킬 제외) / 간파(사용권 또는 간파 스킬) / 필살 슛 / 필살 세이브 / 캐논 킥(배급 스킬)
 * @returns {{ active: boolean, gaanpa: boolean, ultShot: boolean, ultSave: boolean, cannon: boolean }}
 */
export function featuresOf(data, players, gaanpaTickets = 0) {
  const map = getSkillMap(data);
  const f = { active: false, gaanpa: gaanpaTickets > 0, ultShot: false, ultSave: false, cannon: false };
  for (const p of players || []) {
    for (const id of p.skillIds || []) {
      const sk = map.get(id);
      if (!sk) continue;
      if (sk.kind === "active" && sk.active) {
        if (isDistributionSkill(sk)) f.cannon = true;
        else f.active = true;
        if (isGaanpaSkill(sk)) f.gaanpa = true;
      }
      const t = ultimateType(sk);
      if (t === "shot") f.ultShot = true;
      if (t === "save") f.ultSave = true;
    }
  }
  return f;
}

/** 기능 → 배지 목록 [{ key, label }] (FEATURE_KEYS 순서, 켜진 것만) */
export function featureBadges(features) {
  return FEATURE_KEYS.filter((k) => features && features[k]).map((k) => ({ key: k, label: FEATURE_LABELS[k] }));
}

/**
 * 단계 상대 → 경기 스냅샷 (run.buildOpponentSnapshot + 간파 사용권). side "away".
 * @param {number|ChallengeStage} stage
 * @param {object} data
 * @returns {object} TeamSnapshot (+ id, role, season, challengeStage)
 */
export function buildStageOpponentSnapshot(stage, data) {
  const opp = buildStageOpponent(stage, data);
  const snap = buildOpponentSnapshot(opp, data);
  const t = opp.challenge.gaanpaTickets;
  snap.modifiers = { ...snap.modifiers, gaanpaTicket: t };
  snap.gaanpaTickets = t;
  snap.challengeStage = opp.challenge.stage;
  return snap;
}

// ---------------------------------------------------------------------------
// 우리 팀 (등록 팀 · 샘플 팀)
// ---------------------------------------------------------------------------

/**
 * 테스트용 샘플 팀 (data.challenge_sample_team.team — 등록 팀과 같은 모양). 없으면 null.
 * @param {object} data
 * @returns {object|null}  { ...등록 팀, name: "테스트용 샘플 팀", isSample: true, challengeId: "sample" }
 */
export function sampleTeam(data) {
  const raw = data && data.challenge_sample_team;
  if (!raw || !raw.team || !Array.isArray(raw.team.players)) return null;
  return { ...clone(raw.team), name: SAMPLE_TEAM_NAME, isSample: true, challengeId: SAMPLE_TEAM_ID };
}

/**
 * 팀 id: 샘플 팀 "sample", 등록 팀 "t_" + hash(seed | createdTurnIndex | registeredAt) (base36).
 * 같은 저장본이면 늘 같은 id (등록 시각까지 넣어 같은 시드를 두 번 등록해도 갈린다).
 * @param {object} team
 * @returns {string|null}
 */
export function teamIdOf(team) {
  if (!team || typeof team !== "object") return null;
  if (team.isSample || team.challengeId === SAMPLE_TEAM_ID) return SAMPLE_TEAM_ID;
  if (typeof team.challengeId === "string" && team.challengeId) return team.challengeId;
  const key = `${team.seed ?? ""}|${team.createdTurnIndex ?? ""}|${team.registeredAt ?? ""}`;
  return `t_${hashString(key).toString(36)}`;
}

/** 등록 팀 선수 정리 (옛 저장본 방어): 없는 스킬 id · 특성 id 는 버리고, 스탯은 정수로, position 은 슬롯에서 */
function sanitizePlayers(team, data) {
  const skills = getSkillMap(data);
  const traits = new Set((Array.isArray(data.traits) ? data.traits : []).map((t) => t && t.id));
  const slots = formationSlots(team.formation);
  const players = (team.players || []).map((p, i) => {
    if (!p || !slots.includes(p.slot)) throw new Error(`challenge: 팀 선수 슬롯이 포메이션 ${team.formation} 과 맞지 않습니다: '${p && p.slot}'`);
    const stats = {};
    for (const k of STATS) stats[k] = Math.max(0, Math.round(num(Number(p.stats && p.stats[k]), 0)));
    return {
      id: typeof p.id === "string" && p.id ? p.id : `h${i + 1}`,
      charId: p.charId || null,
      name: p.name || p.slot,
      slot: p.slot,
      position: slotPosition(p.slot),
      style: p.style || "power",
      element: p.element || null,
      race: p.race || null,
      stats,
      skillIds: (Array.isArray(p.skillIds) ? p.skillIds : []).filter((id) => skills.has(id)),
      portraitColor: p.portraitColor || "#4a7ab0",
      isYouth: false,
      aptitude: p.aptitude || null,
      rarity: p.rarity || null,
      trait: typeof p.trait === "string" && traits.has(p.trait) ? p.trait : null,
    };
  });
  if (players.length !== slots.length) throw new Error(`challenge: 팀 선수 수(${players.length})가 포메이션 ${team.formation} 슬롯 수(${slots.length})와 다릅니다`);
  if (new Set(players.map((p) => p.slot)).size !== slots.length) throw new Error("challenge: 팀 슬롯이 중복됩니다");
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error("challenge: 팀 선수 id 가 중복됩니다");
  return players;
}

/** 등록 팀 유물 → 스냅샷 modifiers 합 (+ goalMatchCondition). 런 중 이벤트·루트 modifier 는 저장본에 없어 빠진다. */
function relicModifiers(team, data) {
  const relics = Array.isArray(data.relics) ? data.relics : [];
  const mods = {};
  for (const k of SNAPSHOT_MODIFIER_KEYS) mods[k] = 0;
  let goalCond = 0;
  for (const id of Array.isArray(team.relics) ? team.relics : []) {
    const r = relics.find((x) => x && x.id === id);
    if (!r || !r.modifiers) continue;
    for (const [k, v] of Object.entries(r.modifiers)) {
      if (k in mods) mods[k] += num(Number(v), 0);
      else if (k === "goalMatchCondition") goalCond += num(Number(v), 0);
    }
  }
  for (const k of SNAPSHOT_MODIFIER_KEYS) mods[k] = Math.round(mods[k] * 10000) / 10000;
  return { mods, goalCond };
}

/**
 * 등록 팀(또는 샘플 팀) → 경기 스냅샷 (side "home"). 새 경기 기준: 컨디션 = config.condition.start (+ 목표 경기면 유물 goalMatchCondition),
 * 체력·텐션·필살 게이지는 match.createMatch 가 시작값으로 채운다. 공명은 run.buildOpponentSnapshot 과 같은 계산.
 * @param {object} team  등록 팀 저장본 (store.loadTeams() 원소) 또는 sampleTeam(data)
 * @param {object} data
 * @param {{ kind?: "goal"|"friendly" }} [opts]
 * @returns {object} TeamSnapshot
 */
export function buildChallengeTeamSnapshot(team, data, opts = {}) {
  if (!team || typeof team !== "object" || !Array.isArray(team.players)) throw new Error("challenge: 팀 정보(players)가 없습니다");
  const t = migrateRegisteredTeam(team, data);
  const players = sanitizePlayers(t, data);
  const cfg = data.config || {};
  const { mods, goalCond } = relicModifiers(t, data);
  const kind = opts.kind === "friendly" ? "friendly" : "goal";
  const mult = (cfg.condition && Array.isArray(cfg.condition.matchMult) && cfg.condition.matchMult) || [1];
  const condIdx = clampInt(num(cfg.condition && cfg.condition.start, Math.floor(mult.length / 2)) + (kind === "goal" ? goalCond : 0), 0, mult.length - 1);
  // 공명·슬롯 검증은 상대 스냅샷 빌더를 그대로 쓴다 (같은 계산)
  const probe = buildOpponentSnapshot({ id: "challenge_home", name: t.name || "우리 클럽", formation: t.formation, players, tactics: t.tactics }, data);
  return {
    side: "home",
    name: t.name || "우리 클럽",
    formation: t.formation,
    tactics: normalizeTactics(t.tactics),
    teamwork: num(t.teamwork, 0),
    conditionMult: num(mult[condIdx], 1),
    resonance: probe.resonance,
    modifiers: mods,
    gaanpaTickets: Math.max(0, Math.floor(mods.gaanpaTicket || 0)),
    gaanpaCostHalf: (mods.gaanpaCostHalf || 0) >= 1,
    players,
  };
}

/**
 * 팀 선택 목록 · 왼쪽 요약용.
 * @param {object} team
 * @param {object} data
 * @returns {{ teamId: string, isSample: boolean, name: string, grade: string, score: number|null, formation: string,
 *   registeredAt: string|null, seed: any, power: number, teamwork: number, relics: Array<{ id: string, name: string }>,
 *   tactics: object, features: object, players: Array<{ id, slot, position, name, aptitude, rarity, element, style, trait, traitName,
 *   mainStat, mainValue, stats, skillIds, skillNames, ultimate: string|null }> }}
 */
export function teamSummary(team, data) {
  const t = migrateRegisteredTeam(team, data);
  const players = sanitizePlayers(t, data);
  const skills = getSkillMap(data);
  const relics = Array.isArray(data.relics) ? data.relics : [];
  const rating = t.rating || {};
  const order = formationSlots(t.formation);
  const { mods } = relicModifiers(t, data);
  return {
    teamId: teamIdOf(team),
    isSample: !!(team.isSample || team.challengeId === SAMPLE_TEAM_ID),
    name: t.name || "우리 클럽",
    grade: t.grade ?? rating.cappedGrade ?? rating.grade ?? "-",
    score: t.score ?? rating.score ?? null,
    formation: t.formation,
    registeredAt: t.registeredAt || null,
    seed: t.seed ?? null,
    power: Math.round(teamPower(players)),
    teamwork: num(t.teamwork, 0),
    relics: (Array.isArray(t.relics) ? t.relics : []).map((id) => ({ id, name: (relics.find((r) => r && r.id === id) || {}).name || id })),
    tactics: normalizeTactics(t.tactics),
    features: featuresOf(data, players, Math.floor(mods.gaanpaTicket || 0)),
    players: players
      .slice()
      .sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot))
      .map((p) => {
        const main = mainStatOf(p.position);
        const ult = p.skillIds.map((id) => skills.get(id)).find((sk) => ultimateType(sk));
        return {
          id: p.id, slot: p.slot, position: p.position, name: p.name, aptitude: p.aptitude, rarity: p.rarity,
          element: p.element, style: p.style, trait: p.trait, traitName: traitNameOf(data, p.trait),
          mainStat: main, mainValue: p.stats[main], stats: { ...p.stats },
          skillIds: p.skillIds.slice(), skillNames: p.skillIds.map((id) => skillNameOf(data, id)),
          ultimate: ult ? ult.name : null,
        };
      }),
  };
}

/**
 * 팀 선택 목록: 샘플 팀(있으면) 먼저, 이어서 등록 팀(주어진 순서). 같은 팀 id 는 처음 것만. 고장 난 저장본은 건너뛴다.
 * @param {object[]} registeredTeams  store.loadTeams()
 * @param {object} data
 * @returns {Array<{ teamId: string, team: object, summary: ReturnType<typeof teamSummary> }>}
 */
export function listChallengeTeams(registeredTeams, data) {
  const out = [];
  const seen = new Set();
  const push = (team) => {
    if (!team) return;
    try {
      const summary = teamSummary(team, data);
      if (seen.has(summary.teamId)) return;
      seen.add(summary.teamId);
      out.push({ teamId: summary.teamId, team, summary });
    } catch (_) {
      // 고장 난 저장본(슬롯 불일치 등)은 목록에서 뺀다
    }
  };
  push(sampleTeam(data));
  for (const t of Array.isArray(registeredTeams) ? registeredTeams : []) push(t);
  return out;
}

// ---------------------------------------------------------------------------
// 단계 보기 (사다리 · 미리보기)
// ---------------------------------------------------------------------------

/**
 * 단계 미리보기 정보.
 * @param {number|ChallengeStage} stage
 * @param {object} data
 * @returns {{ stage: number, title: string, displayName: string, teamName: string, opponentId: string, opponentName: string,
 *   suffix: string|null, description: string, formation: string, power: number, statTarget: number, skillTier: number, tierLabel: string,
 *   teamwork: number, possessions: number, kind: string, tactics: object, styleHint: { key: string, label: string },
 *   features: object, badges: Array<{ key: string, label: string }>, gaanpaTickets: number,
 *   added: Array<{ slot, name, skillId, skillName, kind }>,
 *   players: Array<{ slot, position, name, style, element, trait, traitName, mainStat, mainValue, stats, skillIds, skillNames, addedSkillIds, ultimate }> }}
 */
export function stageInfo(stage, data) {
  const def = typeof stage === "object" && stage ? stage : getStage(data, stage);
  const opp = buildStageOpponent(def, data);
  const ch = opp.challenge;
  const skills = getSkillMap(data);
  return {
    stage: def.stage,
    title: def.title,
    displayName: stageDisplayName(data, def),
    teamName: opp.name,
    opponentId: opp.id,
    opponentName: opp.baseName,
    suffix: def.suffix,
    description: opp.description,
    formation: opp.formation,
    power: ch.power,
    statTarget: def.statTarget,
    skillTier: ch.tier,
    tierLabel: ch.tierLabel,
    teamwork: opp.teamwork,
    possessions: def.possessions,
    kind: def.kind,
    tactics: opp.tactics,
    styleHint: (({ key, label }) => ({ key, label }))(opponentStyleHint(opp, data)),
    features: ch.features,
    badges: featureBadges(ch.features),
    gaanpaTickets: ch.gaanpaTickets,
    added: ch.added.map((a) => ({ ...a })),
    players: opp.players.map((p) => {
      const main = mainStatOf(p.position);
      const ult = p.skillIds.map((id) => skills.get(id)).find((sk) => ultimateType(sk));
      return {
        slot: p.slot, position: p.position, name: p.name, style: p.style || "power", element: p.element || opp.element,
        trait: p.trait || null, traitName: traitNameOf(data, p.trait || null),
        mainStat: main, mainValue: p.stats[main], stats: { ...p.stats },
        skillIds: p.skillIds.slice(), skillNames: p.skillIds.map((id) => skillNameOf(data, id)),
        addedSkillIds: ch.added.filter((a) => a.slot === p.slot).map((a) => a.skillId),
        ultimate: ult ? ult.name : null,
      };
    }),
  };
}

/**
 * 사다리 전체: stageInfo + 이 팀의 진행 상태.
 * @param {object} data
 * @param {object|null} progress  'soccer.challenge' 저장값 (없으면 빈 진행)
 * @param {string|null} teamId
 * @returns {Array<ReturnType<typeof stageInfo> & { state: "locked"|"open"|"cleared", attempts: number, wins: number }>}
 */
export function ladderView(data, progress, teamId) {
  const tp = teamProgress(progress, teamId);
  return getStages(data).map((def) => ({
    ...stageInfo(def, data),
    state: stageStateOf(tp, def.stage),
    attempts: tp.attempts[def.stage] || 0,
    wins: tp.wins[def.stage] || 0,
  }));
}

// ---------------------------------------------------------------------------
// 진행 기록 ('soccer.challenge')
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} TeamProgress
 * @property {number} cleared    클리어한 가장 높은 단계 (0 = 없음). n 을 클리어하면 n+1 이 열린다
 * @property {Record<string, number>} attempts  단계 → 끝난 도전 수
 * @property {Record<string, number>} wins      단계 → 승리 수
 * @property {{ stage: number, attempt: number, win: boolean, homeGoals: number, awayGoals: number,
 *              penalties: { home: number, away: number }|null, at: string|null, forfeit: boolean }|null} lastResult
 *           forfeit = 경기 중 [포기] (win 은 늘 false, 점수는 포기한 때)
 * @property {number} resets    [진행 초기화] 횟수 — 초기화해도 남아 경기 시드에 섞인다 (challengeSeed)
 */

/** 빈 진행 기록 { version, teams: {} } */
export function emptyProgress() {
  return { version: CHALLENGE_PROGRESS_VERSION, teams: {} };
}

function countMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Math.floor(Number(v));
    const s = Math.floor(Number(k));
    if (s >= 1 && n > 0) out[s] = n;
  }
  return out;
}

function normalizeTeamProgress(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const lr = r.lastResult && typeof r.lastResult === "object" ? r.lastResult : null;
  return {
    cleared: Math.max(0, Math.floor(Number(r.cleared) || 0)),
    attempts: countMap(r.attempts),
    wins: countMap(r.wins),
    lastResult: lr
      ? {
          stage: Math.floor(Number(lr.stage) || 0),
          attempt: Math.floor(Number(lr.attempt) || 0),
          win: !!lr.win,
          homeGoals: Math.floor(Number(lr.homeGoals) || 0),
          awayGoals: Math.floor(Number(lr.awayGoals) || 0),
          penalties: lr.penalties && typeof lr.penalties === "object"
            ? { home: Math.floor(Number(lr.penalties.home) || 0), away: Math.floor(Number(lr.penalties.away) || 0) }
            : null,
          at: typeof lr.at === "string" ? lr.at : null,
          forfeit: lr.forfeit === true,
        }
      : null,
    resets: Math.max(0, Math.floor(Number(r.resets) || 0)),
  };
}

/**
 * 저장값 정리 (localStorage 에서 읽은 값 — 없거나 고장 나면 빈 진행). 새 객체.
 * @param {any} raw
 * @returns {{ version: number, teams: Record<string, TeamProgress> }}
 */
export function normalizeProgress(raw) {
  const out = emptyProgress();
  const teams = raw && typeof raw === "object" && raw.teams && typeof raw.teams === "object" ? raw.teams : {};
  for (const [id, tp] of Object.entries(teams)) {
    if (!id) continue;
    out.teams[id] = normalizeTeamProgress(tp);
  }
  return out;
}

/**
 * 팀 하나의 진행 (없으면 빈 진행). 새 객체.
 * @returns {TeamProgress}
 */
export function teamProgress(progress, teamId) {
  const teams = progress && typeof progress === "object" && progress.teams && typeof progress.teams === "object" ? progress.teams : {};
  return normalizeTeamProgress(teamId != null ? teams[teamId] : null);
}

function stageStateOf(tp, stage) {
  if (stage <= tp.cleared) return "cleared";
  if (stage === 1 || stage <= tp.cleared + 1) return "open";
  return "locked";
}

/** n 단계가 열렸는가 (1단계는 늘, n 은 n−1 을 클리어하면) */
export function isUnlocked(progress, teamId, stage) {
  return stageStateOf(teamProgress(progress, teamId), Math.floor(Number(stage))) !== "locked";
}

/** n 단계를 클리어했는가 */
export function isCleared(progress, teamId, stage) {
  return stageStateOf(teamProgress(progress, teamId), Math.floor(Number(stage))) === "cleared";
}

/** "locked" | "open" | "cleared" */
export function stageState(progress, teamId, stage) {
  return stageStateOf(teamProgress(progress, teamId), Math.floor(Number(stage)));
}

/** 다음 도전 번호 (= 끝난 도전 수 + 1) — 경기 시드에 쓴다 */
export function nextAttempt(progress, teamId, stage) {
  return (teamProgress(progress, teamId).attempts[Math.floor(Number(stage))] || 0) + 1;
}

/**
 * 끝난 도전 한 판 기록 → 새 진행 객체 (입력 불변).
 * 한 번만 세기: result.attempt 가 이미 센 번호(≤ attempts[stage])면 입력을 그대로 돌려준다 (=== 로 확인 가능).
 * attempt 를 안 주면 다음 번호로 센다 (중복 방지 없음).
 * @param {object|null} progress
 * @param {string} teamId
 * @param {number} stage
 * @param {{ attempt?: number, winner?: "home"|"away"|"draw", win?: boolean, homeGoals?: number, awayGoals?: number,
 *           penalties?: { home: number, away: number }|null, at?: string, forfeit?: boolean }} result
 *   match.getResult() 에 attempt·at 을 더한 값이면 된다. forfeit: true = 경기 중 [포기] (늘 패배, 점수는 포기한 때)
 * @returns {{ version: number, teams: Record<string, TeamProgress> }}
 */
export function recordResult(progress, teamId, stage, result) {
  if (!teamId) throw new Error("challenge: teamId 가 필요합니다");
  const s = Math.floor(Number(stage));
  if (!(s >= 1)) throw new Error(`challenge: 단계가 잘못됨: ${stage}`);
  if (!result || typeof result !== "object") throw new Error("challenge: result 가 필요합니다");
  const tp0 = teamProgress(progress, teamId);
  const done = tp0.attempts[s] || 0;
  const att = Math.floor(Number(result.attempt));
  if (att >= 1 && att <= done) return progress; // 이미 센 도전
  const forfeit = result.forfeit === true;
  const win = !forfeit && (result.win === true || result.winner === "home");
  const out = normalizeProgress(progress);
  const tp = out.teams[teamId] || normalizeTeamProgress(null);
  const attempt = att >= 1 ? att : done + 1;
  tp.attempts[s] = Math.max(done + 1, attempt);
  if (win) {
    tp.wins[s] = (tp.wins[s] || 0) + 1;
    tp.cleared = Math.max(tp.cleared, s);
  }
  tp.lastResult = {
    stage: s,
    attempt,
    win,
    homeGoals: Math.floor(Number(result.homeGoals ?? result.home) || 0),
    awayGoals: Math.floor(Number(result.awayGoals ?? result.away) || 0),
    penalties: result.penalties && typeof result.penalties === "object"
      ? { home: Math.floor(Number(result.penalties.home) || 0), away: Math.floor(Number(result.penalties.away) || 0) }
      : null,
    at: typeof result.at === "string" ? result.at : null,
    forfeit,
  };
  out.teams[teamId] = tp;
  return out;
}

/**
 * 팀 하나의 진행 초기화 → 새 진행 객체 (입력 불변). 클리어 · 도전 · 승리 · 최근 결과를 지우고 resets 만 +1 로 남긴다
 * (도전 번호가 1 로 돌아가도 시드가 달라져 초기화 전 경기를 똑같이 다시 하지 않는다 — challengeSeed).
 */
export function resetProgress(progress, teamId) {
  const out = normalizeProgress(progress);
  if (!teamId) return out;
  const before = teamProgress(out, teamId);
  out.teams[teamId] = { ...normalizeTeamProgress(null), resets: before.resets + 1 };
  return out;
}

/**
 * 팀들의 진행 기록을 통째로 지우기 (resets 도) → 새 진행 객체 (입력 불변). 등록 팀 목록에서 밀려나 다시 고를 수 없는 팀 정리용.
 * @param {object|null} progress
 * @param {string[]} teamIds
 */
export function forgetTeams(progress, teamIds) {
  const out = normalizeProgress(progress);
  for (const id of Array.isArray(teamIds) ? teamIds : []) {
    if (id && id !== SAMPLE_TEAM_ID) delete out.teams[id];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 경기 준비
// ---------------------------------------------------------------------------

/**
 * 도전 경기 시드: (팀 id, 단계, 도전 번호, 진행 초기화 횟수) → uint32 (같은 입력이면 늘 같은 경기).
 * resets 0(초기화한 적 없음)은 예전 키 그대로 — 초기화 뒤에는 "|r<횟수>" 를 붙여 초기화 전 경기와 다른 시드.
 * @param {string} teamId
 * @param {number} stage
 * @param {number} attempt
 * @param {number} [resets=0]  teamProgress(progress, teamId).resets
 * @returns {number}
 */
export function challengeSeed(teamId, stage, attempt, resets = 0) {
  const r = Math.max(0, Math.floor(Number(resets) || 0));
  return hashString(`challenge|${teamId}|${Math.floor(Number(stage))}|${Math.floor(Number(attempt))}${r ? `|r${r}` : ""}`) % 4294967296;
}

/**
 * 도전 경기 셋업 — run.getMatchSetup 과 같은 모양 (+ 도전 정보). match.createMatch({ data, seed, home, away, possessions, kind }) 에 바로 넘긴다.
 * @param {object} team     등록 팀 저장본 또는 sampleTeam(data)
 * @param {number} stage
 * @param {number} attempt  nextAttempt(progress, teamId, stage)
 * @param {object} data
 * @param {{ resets?: number }} [opts]  resets = teamProgress(progress, teamId).resets (시드에 섞는다, 없으면 0)
 * @returns {{ home: object, away: object, seed: number, possessions: number, kind: "goal"|"friendly", reason: "challenge",
 *   rules: { allowDraw: boolean, extraTime: boolean, penalties: boolean, isGoalMatch: boolean, possessions: number },
 *   opponentName: string, opponentId: string, stage: number, attempt: number, resets: number, teamId: string, displayName: string }}
 */
export function challengeSetup(team, stage, attempt, data, opts = {}) {
  const def = getStage(data, stage);
  const teamId = teamIdOf(team);
  if (!teamId) throw new Error("challenge: 팀 정보가 없습니다");
  const att = Math.max(1, Math.floor(Number(attempt) || 1));
  const resets = Math.max(0, Math.floor(Number(opts?.resets) || 0));
  const home = buildChallengeTeamSnapshot(team, data, { kind: def.kind });
  const away = buildStageOpponentSnapshot(def, data);
  const kind = def.kind;
  return {
    home,
    away,
    seed: challengeSeed(teamId, def.stage, att, resets),
    possessions: def.possessions,
    kind,
    reason: "challenge",
    rules: {
      allowDraw: kind === "friendly",
      extraTime: kind !== "friendly",
      penalties: kind !== "friendly",
      isGoalMatch: kind === "goal",
      possessions: def.possessions,
    },
    opponentName: away.name,
    opponentId: away.id,
    stage: def.stage,
    attempt: att,
    resets,
    teamId,
    displayName: stageDisplayName(data, def),
  };
}
