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

export const ACTION_LABELS = {
  dribble: '드리블', pass: '패스', shoot: '슛',
  tackle: '태클', intercept: '인터셉트', block: '블록', save: '세이브',
};
export const ACTION_ICONS = {
  dribble: '🏃', pass: '➡️', shoot: '⚽',
  tackle: '🦵', intercept: '✋', block: '🛡️', save: '🧤',
};

export const INTENT_LABELS = { full: '완전 공개', partial: '부분 공개', none: '비공개' };
export const KIND_LABELS = { goal: '경계전', friendly: '친선전', arena: '아레나' };
export const MATCH_PHASE_LABELS = {
  decision: '듀얼', resolved: '판정', possessionEnd: '포제션 종료',
  extraTime: '연장', penalties: '승부차기', finished: '종료',
};
export const LINE_LABELS = ['FW 라인', 'MF 라인', 'DF 라인', 'GK · 슛'];
// v0.2 경기 화면 (GDD v0.4 §9.2·9.5): 공격 단계 ①~④ = lineIndex 0..3, 토큰 역할(js/ui/layout.js)
export const ATTACK_STEP_LABELS = ['빌드업', '중원', '파이널 서드', '슈팅'];
export const TOKEN_ROLE_LABELS = {
  carrier: '공 소유', defender: '듀얼 수비', cover: '커버', receiver: '패스 후보',
  broken: '뚫림 (공 뒤)', support: '지원', gk: '골키퍼',
};

export const CONDITION_LABELS = ['최악', '나쁨', '보통', '좋음', '최상'];

export const TACTIC_LABELS = { attack: '공격 성향', shootTiming: '슛 타이밍', defense: '수비 성향', tension: '텐션 사용', duelPicker: '듀얼 담당' };
export const TACTIC_OPTIONS = {
  attack: [['dribble', '드리블 위주'], ['balanced', '균형'], ['pass', '패스 위주']],
  shootTiming: [['breakAll', '라인 다 뚫고'], ['midrange', '기회 보이면 중거리']],
  defense: [['tackle', '태클 선호'], ['balanced', '균형'], ['intercept', '인터셉트 선호'], ['readIntent', '의도 따라가기']],
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
export const ACTIONS_ATTACK_FALLBACK = ['dribble', 'pass', 'shoot'];
export const ACTIONS_DEFENSE_FALLBACK = ['tackle', 'intercept', 'block'];

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
