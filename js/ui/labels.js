// js/ui/labels.js — 열거값(ARCHITECTURE §2)과 한국어 표시 문자열

export const STATS = ['shoot', 'dribble', 'pass', 'defense', 'physical'];
export const POSITIONS = ['GK', 'DF', 'MF', 'FW'];
export const STYLES = ['power', 'speed', 'technique'];
export const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'lightning'];

export const FORMATIONS = {
  '2-2-2': { DF: 2, MF: 2, FW: 2 },
  '3-1-2': { DF: 3, MF: 1, FW: 2 },
  '1-3-2': { DF: 1, MF: 3, FW: 2 },
  '2-3-1': { DF: 2, MF: 3, FW: 1 },
};

export function slotsOf(formation) {
  const f = FORMATIONS[formation] || FORMATIONS['2-2-2'];
  const slots = ['GK'];
  for (const pos of ['DF', 'MF', 'FW']) {
    for (let i = 1; i <= (f[pos] || 0); i++) slots.push(`${pos}${i}`);
  }
  return slots;
}

export function positionOfSlot(slot) {
  return String(slot || '').replace(/\d+$/, '');
}

export const STAT_LABELS = { shoot: '슈팅', dribble: '드리블', pass: '패스', defense: '수비', physical: '피지컬' };
export const STAT_SHORT = { shoot: '슈', dribble: '드', pass: '패', defense: '수', physical: '피' };
// 훈련 칸 아이콘 (아웃게임 가로 화면) — 경기 액션 아이콘(ACTION_ICONS)과 같은 모양을 쓴다
export const STAT_ICONS = { shoot: '⚽', dribble: '🦶', pass: '➡️', defense: '🛡️', physical: '💪' };
// 시즌 사이 루트 아이콘 (data/routes.json id). 없는 id 는 ROUTE_ICON_FALLBACK
export const ROUTE_ICONS = { rt_camp: '🏕️', rt_expedition: '🚌', rt_hotspring: '♨️' };
export const ROUTE_ICON_FALLBACK = '🧭';
export const POSITION_LABELS = { GK: '골키퍼', DF: '수비', MF: '미드필더', FW: '공격' };
export const ELEMENT_LABELS = { fire: '불', water: '물', wind: '바람', earth: '땅', lightning: '번개' };
export const ELEMENT_ICONS = { fire: '🔥', water: '💧', wind: '🌪', earth: '⛰️', lightning: '⚡' };
export const STYLE_LABELS = { power: '파워', speed: '스피드', technique: '테크닉' };
export const RACE_LABELS = { human: '인간', elf: '엘프', dwarf: '드워프', beast: '수인', spirit: '정령', giant: '거인' };
export const RARITY_LABELS = { R: 'R', SR: 'SR', SSR: 'SSR' };
export const SUPPORT_TYPE_LABELS = { ...STAT_LABELS, friend: '친구' }; // friend = 옛 데이터 (레슨판 코치 타입은 5종목)

// v0.3 (GDD v0.5 §9.8): 공격 dribble|pass|cross|shoot, 수비 tackle|intercept|hold (v0.4 block → hold), GK save
export const ACTION_LABELS = {
  dribble: '드리블', pass: '패스', cross: '크로스', shoot: '슛',
  tackle: '태클', intercept: '인터셉트', hold: '버티기', save: '세이브',
  block: '버티기', // 옛 저장 이벤트 표시용
};
export const ACTION_ICONS = {
  dribble: '🦶', pass: '➡️', cross: '⤴️', shoot: '⚽',
  tackle: '🦵', intercept: '✋', hold: '🛡️', save: '🧤', block: '🛡️',
};
// 성향 = 예상 행동 (GDD v0.5 §9.9): "드리블형 — 드리블 600 > 패스 400"
export const ACTION_TYPE_LABELS = {
  dribble: '드리블형', pass: '패스형', cross: '크로스형', shoot: '슈팅형',
  tackle: '태클형', intercept: '인터셉트형', hold: '버티기형', save: '세이브',
};
// 짝 (GDD v0.5 §9.8): 상대 공격 → 짝이 맞는 수비. 2026-09-29: 크로스(공중볼) ↔ 버티기 (엔진 match.COUNTER · view.counter 와 같다 —
// 경기 화면은 view.counter 를 먼저 쓰고, 이 표는 view 에 없을 때만)
export const COUNTER = { dribble: 'tackle', pass: 'intercept', cross: 'hold', shoot: 'hold' };
// ④ 박스 연결 (2026-09-29): 슈팅 찬스(lineIndex 3)의 패스 = 컷백 (→ 받은 선수 원터치 슛), 크로스 = 센터링 (크로서만 → 헤더).
// 결정 카드 · 정보 줄 · 말풍선 · 연출 문구의 짧은 이름, 아이콘, 받은 선수의 마무리
export const BOX_LINK_LABELS = { pass: '컷백', cross: '센터링' };
export const BOX_LINK_ICONS = { pass: '↩️', cross: '⤴️' };
export const BOX_LINK_FINISH = { pass: '원터치 슛', cross: '헤더' };
// 필살기 종류 (= 엔진 match.ULT_TYPE_TEXT, §19.14 ③ — 새 종류 3개는 LESSON_PROTO_PLAN §19.5 ~ §19.7)
export const ULT_TYPE_LABELS = { shot: '필살 슛', pass: '필살 패스', save: '필살 세이브', dribble: '필살 드리블', defense: '필살 수비', team: '필살 호령' };
// GK 배급 (2026-09-29): 세이브 · 박스 연결 차단 뒤 GK 가 고른다 (엔진 view.distribution · decision { action: short|long }).
// 결정 카드 · 정보 줄 · 말풍선 · 결과 한 줄의 이름과 아이콘
export const DIST_LABELS = { short: '짧은 패스', long: '롱패스' };
export const DIST_ICONS = { short: '➡️', long: '🚀' };
// 결정타 칩 (클래시 바 1단계, 표시 전용 — 엔진 판정 이벤트 decisive.id): 색 종류.
// pair = 짝 (이긴 팀 색 — 우리 파랑 · 상대 빨강), link = 연계 특성 · 연계 (초록), ult = 필살기 · 합체기 (분홍),
// edge = 제쳐짐 · 인터셉트 뚫림 · 첫 듀얼 보너스 (주황), skill = 액티브 스킬 (보라). 나머지(능력치 · 상성 · 커버 …) = 기본(흰색)
export const DECISIVE_KINDS = {
  pair: 'pair',
  killpass: 'link', runner: 'link', carrier: 'link', crosser: 'link', finisher: 'link', targetman: 'link', chain: 'link',
  wall: 'link', distributor: 'link', oneTouch: 'link', teamwork: 'link',
  ultimate: 'ult', combo: 'ult', saveUlt: 'ult', ultShotGk: 'ult',
  beaten: 'edge', interceptFail: 'edge', next: 'edge',
  skill: 'skill', lineBreak: 'skill', // lineBreak = 라인 브레이커로 박스에 실린 슛 ×1.5 (L54 — 액티브 스킬 몫)
};

// 연계 특성 (GDD v0.5 §9.10, data/traits.json). 이름·설명은 data.traits 가 있으면 그것을 쓰고(traitInfo), 아이콘은 여기만.
export const TRAIT_LABELS = {
  killpass: { name: '킬패스', icon: '🎯', description: '이 선수의 패스·크로스를 받은 선수의 첫 듀얼 +20% (중거리 제외)' },
  finisher: { name: '피니셔', icon: '💥', description: '패스·크로스를 받은 직후의 박스 슛·헤더 +15%' },
  crosser: { name: '크로서', icon: '🌙', description: '파이널 서드에서 크로스 사용 가능, 크로스 +10%' },
  targetman: { name: '타깃맨', icon: '🗼', description: '크로스를 헤더로 마무리하면 +25%' },
  runner: { name: '침투', icon: '💨', description: '패스를 받은 직후 드리블 +15%' },
  carrier: { name: '볼 운반', icon: '🐾', description: '드리블 체력 소모 −30%, 빌드업·중원 드리블 +10%' },
  wall: { name: '철벽', icon: '🧱', description: '버티기 ×1.0 → ×1.15' },
  distributor: { name: '빠른 배급', icon: '📤', description: '이 골키퍼의 롱패스 배급 +25% (세이브 · 박스 연결 차단 뒤 GK 배급)' },
  captain: { name: '주장', icon: '©️', description: '팀워크 증폭 단계를 계산할 때 팀워크 +10 (주장이 여럿이어도 1명분)' },
};
/** 연계 특성 표시 정보 { id, name, icon, description } — data.traits(있으면) 우선. 없는 id 면 null */
export function traitInfo(id, data) {
  if (!id) return null;
  const base = TRAIT_LABELS[id] || null;
  const fromData = Array.isArray(data?.traits) ? data.traits.find((t) => t && t.id === id) : null;
  if (!base && !fromData) return { id, name: String(id), icon: '◆', description: '' };
  return {
    id,
    name: fromData?.name ?? base?.name ?? String(id),
    icon: base?.icon ?? '◆',
    description: fromData?.description ?? base?.description ?? '',
  };
}

/**
 * 필살기 표시 정보 (아웃게임 칩 · title — §19.14 ① ②). 필살기가 아니거나 없는 id 면 null.
 * @returns {{ id: string, name: string, type: string, typeLabel: string, tier: string, line: string, description: string, title: string } | null}
 */
export function ultimateInfo(skillId, data) {
  if (!skillId) return null;
  const sk = Array.isArray(data?.skills) ? data.skills.find((x) => x && x.id === skillId) : null;
  const u = sk?.ultimate;
  if (!u) return null;
  const typeLabel = ULT_TYPE_LABELS[u.type] ?? '필살기';
  const tier = u.tier || '';
  const line = u.cutinLine || '';
  return {
    id: sk.id, name: sk.name, type: u.type, typeLabel, tier, line,
    description: sk.description || '',
    title: [`✨ ${sk.name} (${typeLabel}${tier ? ` · ${tier}` : ''})`, sk.description || '', line ? `“${line}”` : ''].filter(Boolean).join('\n'),
  };
}

/** 캐릭터 id 목록 중 연계 특성 '주장' 수 (L46: 2명 이상이어도 팀워크 +10 은 1명분) */
export function captainCount(charIds, data) {
  const chars = Array.isArray(data?.characters) ? data.characters : [];
  const byId = new Map(chars.map((c) => [c.id, c]));
  return (charIds || []).filter((id) => byId.get(id)?.trait === 'captain').length;
}
/** 주장 2명 이상 안내 칩 글 (없으면 null) — 편성 공명 줄 · 경기 전 준비 (§19.14 ① ②) */
export function captainNote(n, data) {
  if (!(n >= 2)) return null;
  const plus = (Array.isArray(data?.traits) ? data.traits.find((t) => t?.id === 'captain') : null)?.params?.teamworkPlus ?? 10;
  return `${TRAIT_LABELS.captain.icon} 주장 ${n}명 — 팀워크 +${plus}은 1명분`;
}

export const KIND_LABELS = { goal: '경계전', friendly: '친선전', arena: '아레나' };
export const MATCH_PHASE_LABELS = {
  decision: '듀얼', resolved: '판정', possessionEnd: '포제션 종료',
  extraTime: '연장', penalties: '승부차기', finished: '종료',
};
export const LINE_LABELS = ['FW 라인', 'MF 라인', 'DF 라인', 'GK · 슛'];
// v0.2 경기 화면 (GDD v0.4 §9.2·9.5): 공격 단계 ①~④ = lineIndex 0..3, 토큰 역할(js/ui/layout.js)
export const ATTACK_STEP_LABELS = ['빌드업', '중원', '파이널 서드', '슈팅'];
export const TOKEN_ROLE_LABELS = {
  carrier: '공 소유', defender: '듀얼 수비', cover: '커버', receiver: '받는 선수 후보',
  broken: '뚫림 (공 뒤)', support: '지원', gk: '골키퍼',
};

export const CONDITION_LABELS = ['최악', '나쁨', '보통', '좋음', '최상'];

export const TACTIC_LABELS = { attack: '공격 성향', shootTiming: '슛 타이밍', defense: '수비 성향', tension: '텐션 사용', duelPicker: '듀얼 담당', distribution: '배급' };
export const TACTIC_OPTIONS = {
  attack: [['dribble', '드리블 위주'], ['balanced', '균형'], ['pass', '패스 위주']],
  shootTiming: [['breakAll', '라인 다 뚫고'], ['midrange', '기회 보이면 중거리']],
  defense: [['tackle', '태클 선호'], ['balanced', '균형'], ['intercept', '인터셉트 선호'], ['hold', '버티기 선호']],
  tension: [['save', '아끼기'], ['immediate', '즉시'], ['clutch', '결승골 상황만']],
  duelPicker: [['best', '최고 수비수'], ['matchup', '상성 유리']],
  // GK 배급 (2026-09-29, 엔진 run.DISTRIBUTION_TACTICS): 상황 따라 = 롱패스 성공 확률이 config longPassAutoMin 이상이면 길게
  distribution: [['auto', '상황 따라'], ['short', '짧게'], ['long', '길게']],
};
export const TACTIC_MAIN_KEYS = ['attack', 'shootTiming', 'defense'];
// 편성 화면 · 전술 미팅의 전술 줄: 주요 3개 + 배급 (텐션 사용 · 듀얼 담당은 미팅에서만)
export const TACTIC_SETUP_KEYS = [...TACTIC_MAIN_KEYS, 'distribution'];

// ---- 카드 레슨 (LESSON_PROTO_PLAN §6, data/policies.json · cards.json · lesson.json) ----
// 훈련 방침 (경기 전술과 다르다 — 레슨에서 붙는 버프만 바뀐다). 이름 · 설명은 data.policies 가 있으면 그것을 쓴다 (policyInfo)
export const POLICIES = ['ace', 'team', 'counter', 'press', 'poss'];
export const POLICY_LABELS = { ace: '에이스형', team: '팀형', counter: '역습형', press: '압박형', poss: '점유형' };
export const POLICY_DESC = {
  ace: '한두 명을 확 키운다 — 호조 · 집중',
  team: '7명을 고르게 — 분위기',
  counter: '수비 구역에서 쌓고 공격 구역에서 터뜨린다 — 탈취',
  press: '몰아치고 내려서 정비 — 압박 단계',
  poss: '패스 구역을 거쳐 끊기지 않게 — 점유',
};
/** 방침 표시 정보 { id, name, desc, buffs } — data.policies(있으면) 우선 */
export function policyInfo(id, data) {
  const fromData = Array.isArray(data?.policies?.policies) ? data.policies.policies.find((p) => p && p.id === id) : null;
  return {
    id,
    name: fromData?.name ?? POLICY_LABELS[id] ?? String(id ?? ''),
    desc: fromData?.desc ?? POLICY_DESC[id] ?? '',
    buffs: Array.isArray(fromData?.buffs) ? fromData.buffs : [],
  };
}
// 레슨 버프 칩 이름 (엔진 lesson.BUFF_CHIP_LABELS 와 같은 키 · 같은 이름 — 뷰 chips[].label 이 기본, 이 표는 뷰 밖에서 쓸 때)
export const BUFF_LABELS = {
  hojo: '호조', focus: '집중', routine: '루틴', mood: '분위기', noDecay: '분위기 유지',
  steal: '탈취', press: '압박', poss: '점유', possGuard: '점유 가드',
  nextPct: '다음 카드', nextPairPct: '다음 작은 원', nextNoFail: '실패 없음', nextCostZero: '비용 0',
};
// 주 종류 (lesson.json weekKinds)
export const WEEK_KIND_LABELS = { lesson: '레슨 주', free: '자유 주', prep: '대비 주' };
// 카드 대상 종류 (cards.json target.kind, LESSON_PROTO_PLAN §14.6 · §14.16)
export const CARD_TARGET_LABELS = { single: '단일', circle: '원', all: '전체', owner: '주인', none: '대상 없음' };
// 원 크기 (cards.json target.size) — 작은 ≈ 2명 · 중간 ≈ 한 구역 · 큰 ≈ 이웃 두 구역
export const CIRCLE_SIZES = ['small', 'medium', 'large'];
export const CIRCLE_SIZE_LABELS = { small: '작은 원', medium: '중간 원', large: '큰 원' };
// 훈련 구역 5곳 (data/lesson.json zones, 엔진 zones.ZONE_IDS = STATS 순서). 구역 = 그 스탯이 오르는 자리
export const ZONE_IDS = STATS;
export const ZONE_LABELS = { shoot: '슈팅 구역', dribble: '드리블 구역', pass: '패스 구역', defense: '수비 구역', physical: '피지컬 구역' };
export const ZONE_ICONS = STAT_ICONS;
// 공격 구역 · 수비 구역 (방침 판정, 엔진 lesson.ATTACK_ZONES · DEFENSE_ZONES)
export const ATTACK_ZONES = ['shoot', 'dribble', 'pass'];
export const DEFENSE_ZONES = ['defense', 'physical'];
/** 레슨 주에 고르는 구역의 이름 (에이스형 버프 "집중" 과 헷갈리지 않게) */
export const FOCUS_LABEL = '중점 구역';
/** 구역 이름 "패스 구역" (모르는 id 는 그대로) */
export function zoneLabel(zone) {
  return ZONE_LABELS[zone] ?? (zone == null ? '' : String(zone));
}
/** 구역 목록 짧은 이름 "슈팅·드리블·패스" — 공격 구역 3곳이면 "공격 구역" */
export function zonesText(list) {
  const zs = Array.isArray(list) ? list : [];
  if (zs.length === ATTACK_ZONES.length && ATTACK_ZONES.every((z) => zs.includes(z))) return '공격 구역';
  if (zs.length === DEFENSE_ZONES.length && DEFENSE_ZONES.every((z) => zs.includes(z))) return '수비 구역';
  return zs.map((z) => STAT_LABELS[z] ?? z).join('·');
}
/** 배율 표기 "×1.5" · "×2.0" (소수 1자리) */
export function multText(x) {
  const n = Number(x);
  return Number.isFinite(n) ? `×${n.toFixed(1)}` : '';
}
// 카드 계열 (cards.json family)
export const CARD_FAMILY_LABELS = {
  common: '공용', ace: '에이스형', team: '팀형', counter: '역습형', press: '압박형', poss: '점유형',
  unique: '고유', coach: '코치', prep: '대비',
};
// 자유 주 행동 (lesson.json freeWeek) + 늘 열린 휴식
export const FREE_ACTION_LABELS = { consult: '상담', meeting: '전술 미팅', outing: '외출', friendly: '친선전', rest: '휴식' };
export const FREE_ACTION_ICONS = { consult: '🗂️', meeting: '📋', outing: '🚶', friendly: '🤝', rest: '🛌' };
// 레슨 결과 (LessonState.status)
export const LESSON_STATUS_LABELS = { playing: '진행 중', perfect: '퍼펙트!', clear: '클리어', fail: '실패' };
// 런 phase (시작 화면 이어하기 줄)
export const PHASE_LABELS = {
  week: '주 선택', lesson: '레슨', reward: '레슨 결과', consult: '상담', prep: '경기 전 준비',
  event: '이벤트', match: '경기', relic: '유물 선택', route: '루트 선택', finished: '완료',
};

export const SKILL_KIND_LABELS = { passive: '패시브', active: '액티브', unique: '필살기' };

export const APTITUDE_ORDER = { A: 0, B: 1, C: 2, '-': 3 };

export function label(map, key, fallback) {
  if (key == null) return fallback ?? '';
  return map[key] ?? fallback ?? String(key);
}

export function tacticLabel(key, value) {
  const opts = TACTIC_OPTIONS[key] || [];
  const found = opts.find(([v]) => v === value);
  return found ? found[1] : String(value ?? '-');
}

export function randomSeed() {
  // UI 전용: Math.random 허용 (엔진은 rng.js만 사용)
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
}

// 경기 화면에서 view.actions가 비어 있을 때 표시할 자리표시자 (ARCHITECTURE §2 ACTIONS_*)
export const ACTIONS_ATTACK_FALLBACK = ['dribble', 'pass', 'cross', 'shoot'];
export const ACTIONS_DEFENSE_FALLBACK = ['tackle', 'intercept', 'hold'];

// 경기 기록 스코어 표기. 목표 경기는 무승부가 없으므로 동점 스코어 = 승부차기 판정:
// record.penalties 가 있으면 "PK h:a", 없으면 "(승부차기)" 를 붙여 "1 : 1 패" 같은 오해를 막는다.
export function scoreLabel(g) {
  const home = Number(g?.home) || 0;
  const away = Number(g?.away) || 0;
  const verdict = g?.draw ? '무' : g?.win ? '승' : '패';
  const pk = g?.penalties
    ? ` (PK ${g.penalties.home ?? 0}:${g.penalties.away ?? 0})`
    : (!g?.draw && home === away ? ' (승부차기)' : '');
  return `${home} : ${away}${pk} ${verdict}`;
}

/**
 * 목적격 조사 "을/를" (§18.6 코치 수업 문구): 마지막 글자가 한글이면 받침 있으면 "을", 없으면 "를", 한글이 아니면 "을(를)".
 * 예: objParticle("파워 슛") → "을", objParticle("스루 패스") → "를", objParticle("함성") → "을"
 */
export function objParticle(word) {
  const ch = Array.from(String(word ?? '').trim()).pop();
  const c = ch ? ch.charCodeAt(0) - 0xac00 : -1;
  if (c < 0 || c > 11171) return '을(를)';
  return c % 28 !== 0 ? '을' : '를';
}
