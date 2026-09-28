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
export const POSITION_LABELS = { GK: '골키퍼', DF: '수비', MF: '미드필더', FW: '공격' };
export const ELEMENT_LABELS = { fire: '불', water: '물', wind: '바람', earth: '땅', lightning: '번개' };
export const ELEMENT_ICONS = { fire: '🔥', water: '💧', wind: '🌪', earth: '⛰️', lightning: '⚡' };
export const STYLE_LABELS = { power: '파워', speed: '스피드', technique: '테크닉' };
export const RACE_LABELS = { human: '인간', elf: '엘프', dwarf: '드워프', beast: '수인', spirit: '정령', giant: '거인' };
export const RARITY_LABELS = { R: 'R', SR: 'SR', SSR: 'SSR' };
export const SUPPORT_TYPE_LABELS = { ...STAT_LABELS, friend: '친구' };

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
// 짝 (GDD v0.5 §9.8): 상대 공격 → 짝이 맞는 수비
export const COUNTER = { dribble: 'tackle', pass: 'intercept', cross: 'intercept', shoot: 'hold' };
export const ULT_TYPE_LABELS = { shot: '필살 슛', pass: '필살 패스', save: '필살 세이브' };

// 연계 특성 (GDD v0.5 §9.10, data/traits.json). 이름·설명은 data.traits 가 있으면 그것을 쓰고(traitInfo), 아이콘은 여기만.
export const TRAIT_LABELS = {
  killpass: { name: '킬패스', icon: '🎯', description: '이 선수의 패스·크로스를 받은 선수의 첫 듀얼 +20% (중거리 제외)' },
  finisher: { name: '피니셔', icon: '💥', description: '패스·크로스를 받은 직후의 박스 슛·헤더 +15%' },
  crosser: { name: '크로서', icon: '🌙', description: '파이널 서드에서 크로스 사용 가능, 크로스 +10%' },
  targetman: { name: '타깃맨', icon: '🗼', description: '크로스를 헤더로 마무리하면 +25%' },
  runner: { name: '침투', icon: '💨', description: '패스를 받은 직후 드리블 +15%' },
  carrier: { name: '볼 운반', icon: '🐾', description: '드리블 체력 소모 −30%, 빌드업·중원 드리블 +10%' },
  wall: { name: '철벽', icon: '🧱', description: '버티기 ×1.0 → ×1.15' },
  distributor: { name: '빠른 배급', icon: '📤', description: '이 골키퍼가 세이브하면 역습이 중원에서 시작' },
  captain: { name: '주장', icon: '©️', description: '팀워크 증폭 단계를 계산할 때 팀워크 +10' },
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

export const TACTIC_LABELS = { attack: '공격 성향', shootTiming: '슛 타이밍', defense: '수비 성향', tension: '텐션 사용', duelPicker: '듀얼 담당' };
export const TACTIC_OPTIONS = {
  attack: [['dribble', '드리블 위주'], ['balanced', '균형'], ['pass', '패스 위주']],
  shootTiming: [['breakAll', '라인 다 뚫고'], ['midrange', '기회 보이면 중거리']],
  defense: [['tackle', '태클 선호'], ['balanced', '균형'], ['intercept', '인터셉트 선호'], ['hold', '버티기 선호']],
  tension: [['save', '아끼기'], ['immediate', '즉시'], ['clutch', '결승골 상황만']],
  duelPicker: [['best', '최고 수비수'], ['matchup', '상성 유리']],
};
export const TACTIC_MAIN_KEYS = ['attack', 'shootTiming', 'defense'];

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
