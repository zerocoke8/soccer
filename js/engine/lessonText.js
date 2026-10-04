/**
 * lessonText.js — 레슨 런 이벤트 글: 조사 · 자리표시 · 말투 (LESSON_PROTO_PLAN §24.3.5 · §24.5.1).
 *
 * - josa(name, pair): 이름 끝 글자의 받침으로 조사를 고른다 ((code − 0xAC00) % 28).
 *   앞 꼴 = 받침 뒤 (이 · 은 · 을 · 과 · 으로 · 아 · 이랑 · 이에요), 뒤 꼴 = 받침 없음 뒤.
 *   으로/로 는 ㄹ 받침 (종성 8) 이면 "로". 끝 글자가 한글 음절이 아니면 "이(가)" 꼴로 둘 다 적는다.
 * - fillText(text, { player, coach, season }): {선수} · {선수|이/가} · {코치} · {코치|은/는} · {시즌} 을 바꾼다.
 *   모르는 자리표시 · 조사 꼴, 짝 없는 괄호, 넣을 이름이 없는 자리표시는 throw.
 * - scanText(text): 검사용 — 자리표시 목록과 꼴 오류 (lessonEvents.validateLessonEvents 가 쓴다).
 * - speechOf(data, charId) · pickText(ev, charId, data): 주인공이 감독에게 반말을 쓰는 선수면 alt.banmal 글을 고른다
 *   (lesson.json events.speech 표, 표에 없으면 존댓말).
 *
 * 순수 로직: DOM/Date/Math.random/localStorage 를 쓰지 않고, 입력을 바꾸지 않는다.
 */

/** 조사 꼴 (§24.3.5) — 데이터에는 역슬래시 없이 `{선수|이/가}` 로 쓴다 */
export const JOSA_PAIRS = Object.freeze(["이/가", "은/는", "을/를", "과/와", "으로/로", "아/야", "이랑/랑", "이에요/예요"]);

/** 자리표시 이름 → fillText 의 값 키 */
export const TOKEN_NAMES = Object.freeze({ "선수": "player", "코치": "coach", "시즌": "season" });

/** 조사를 붙일 수 있는 자리표시 ({시즌} 은 숫자라 조사를 붙이지 않는다) */
const JOSA_TOKENS = new Set(["선수", "코치"]);

const SYLLABLE_FIRST = 0xac00;
const SYLLABLE_LAST = 0xd7a3;
/** 종성 ㄹ 의 번호 ((code − 0xAC00) % 28) */
const JONG_RIEUL = 8;

/** 끝 글자의 종성 번호 (0 = 받침 없음). 끝 글자가 한글 음절이 아니면 null */
function finalJong(word) {
  const s = String(word ?? "").trimEnd();
  if (!s) return null;
  const code = s.charCodeAt(s.length - 1);
  if (code < SYLLABLE_FIRST || code > SYLLABLE_LAST) return null;
  return (code - SYLLABLE_FIRST) % 28;
}

/**
 * 끝 글자가 받침 있는 한글 음절인가.
 * @param {string} word
 * @returns {boolean}
 */
export function hasBatchim(word) {
  const j = finalJong(word);
  return j !== null && j !== 0;
}

/**
 * 이름 뒤에 붙일 조사 (이름은 붙이지 않는다 — `name + josa(name, pair)`).
 * @param {string} name
 * @param {string} pair  JOSA_PAIRS 중 하나 (예: "이/가")
 * @returns {string}  예: josa("아델린", "이/가") = "이", josa("네리아", "이/가") = "가", josa("Bob", "이/가") = "이(가)"
 */
export function josa(name, pair) {
  if (!JOSA_PAIRS.includes(pair)) throw new Error(`모르는 조사 꼴 '${pair}' — 쓸 수 있는 것: ${JOSA_PAIRS.join(" · ")}`);
  const [afterFinal, afterVowel] = pair.split("/");
  const j = finalJong(name);
  if (j === null) return `${afterFinal}(${afterVowel})`;
  if (pair === "으로/로") return j === 0 || j === JONG_RIEUL ? afterVowel : afterFinal;
  return j === 0 ? afterVowel : afterFinal;
}

/**
 * 이름 + 조사.
 * @param {string} name
 * @param {string} pair
 * @returns {string}  예: withJosa("무희 셀리아", "이/가") = "무희 셀리아가"
 */
export function withJosa(name, pair) {
  return `${name}${josa(name, pair)}`;
}

/**
 * 글 안의 자리표시를 훑는다 (바꾸지 않는다).
 * @param {string} text
 * @returns {{ tokens: Array<{ raw: string, name: string, key: string, pair: string|null, index: number }>, errors: string[] }}
 *   errors: 모르는 자리표시 · 조사 꼴 · 짝 없는 괄호 (사람이 읽는 한국어 문장)
 */
export function scanText(text) {
  const s = String(text ?? "");
  const tokens = [];
  const errors = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("{", i);
    const close = s.indexOf("}", i);
    if (close !== -1 && (open === -1 || close < open)) {
      errors.push(`짝 없는 '}' (${close + 1}번째 글자)`);
      i = close + 1;
      continue;
    }
    if (open === -1) break;
    const end = s.indexOf("}", open + 1);
    const nextOpen = s.indexOf("{", open + 1);
    if (end === -1 || (nextOpen !== -1 && nextOpen < end)) {
      errors.push(`짝 없는 '{' (${open + 1}번째 글자)`);
      i = open + 1;
      continue;
    }
    const raw = s.slice(open, end + 1);
    const inner = s.slice(open + 1, end);
    const bar = inner.indexOf("|");
    const name = bar === -1 ? inner : inner.slice(0, bar);
    const pair = bar === -1 ? null : inner.slice(bar + 1);
    if (!Object.prototype.hasOwnProperty.call(TOKEN_NAMES, name)) {
      const hint = /^(player|support|coach|선수\\|코치\\)$/.test(name)
        ? (name.endsWith("\\") ? " — 역슬래시 없이 {선수|이/가} 꼴로" : " — 옛 표기. {선수} · {코치} 를 쓴다")
        : "";
      errors.push(`모르는 자리표시 '${raw}'${hint} (쓸 수 있는 것: {선수} · {코치} · {시즌}, 조사는 {선수|이/가} 꼴)`);
    } else if (pair !== null && !JOSA_TOKENS.has(name)) {
      errors.push(`'${raw}': {${name}} 에는 조사를 붙이지 않는다`);
    } else if (pair !== null && !JOSA_PAIRS.includes(pair)) {
      errors.push(`'${raw}': 모르는 조사 꼴 '${pair}' (쓸 수 있는 것: ${JOSA_PAIRS.join(" · ")})`);
    } else {
      tokens.push({ raw, name, key: TOKEN_NAMES[name], pair, index: open });
    }
    i = end + 1;
  }
  return { tokens, errors };
}

/** 조사 꼴 없이 자리표시 바로 뒤에 붙인 조사 (예: "{선수}가 ") — 이름에 따라 틀린다 */
const BARE_JOSA_RE = /\{(선수|코치)\}(이에요|예요|이랑|으로|이|가|은|는|을|를|과|와|로|랑|아|야)(?![가-힣])/g;

/**
 * 자리표시 바로 뒤에 손으로 붙인 조사를 찾는다 (검사용).
 * @param {string} text
 * @returns {string[]}  사람이 읽는 오류 문장
 */
export function bareJosaErrors(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(BARE_JOSA_RE)) {
    const pair = JOSA_PAIRS.find((p) => p.split("/").includes(m[2]));
    out.push(`'${m[0]}' — 조사는 이름에 따라 바뀐다. {${m[1]}|${pair}} 꼴로 쓴다`);
  }
  return out;
}

function nameOf(v) {
  if (v && typeof v === "object") return v.name;
  return v;
}

/**
 * 자리표시를 바꾼다.
 * @param {string} text
 * @param {{ player?: string|{name:string}, coach?: string|{name:string}, season?: number|string }} [vars]
 *   player = 주인공 이름 · coach = 코치 이름 (칭호까지, 예: "무희 셀리아") · season = 시즌 번호
 * @returns {string}
 */
export function fillText(text, vars = {}) {
  const s = String(text ?? "");
  const { tokens, errors } = scanText(s);
  if (errors.length) throw new Error(`fillText: ${errors.join(" / ")}`);
  if (!tokens.length) return s;
  let out = "";
  let at = 0;
  for (const t of tokens) {
    const v = nameOf(vars ? vars[t.key] : undefined);
    if (v === undefined || v === null || v === "") throw new Error(`fillText: '${t.raw}' 에 넣을 값이 없습니다 (${t.key})`);
    const value = String(v);
    out += s.slice(at, t.index) + value + (t.pair ? josa(value, t.pair) : "");
    at = t.index + t.raw.length;
  }
  return out + s.slice(at);
}

/**
 * 그 캐릭터가 감독에게 쓰는 말투.
 * @param {object} data
 * @param {string} charId
 * @returns {"banmal"|"polite"}  lesson.json events.speech 표에 없으면 "polite"
 */
export function speechOf(data, charId) {
  const sp = data && data.lesson && data.lesson.events && data.lesson.events.speech;
  return sp && typeof sp === "object" && sp[charId] === "banmal" ? "banmal" : "polite";
}

/**
 * 이벤트의 본문 · 결과 문구 (자리표시는 그대로 — fillText 는 부르는 쪽이).
 * 주인공이 반말을 쓰는 선수이고 이벤트에 alt.banmal 이 있으면 반말판을 쓴다 (없는 칸은 기본 글).
 * @param {object} ev  레슨 이벤트
 * @param {string|null} charId  주인공 캐릭터 id (없으면 기본 글)
 * @param {object} data
 * @returns {{ text: string, results: Array<string|{then:string,else:string}> }}  results[i] = 선택지 i 의 result
 */
export function pickText(ev, charId, data) {
  const choices = Array.isArray(ev && ev.choices) ? ev.choices : [];
  const base = { text: ev ? ev.text : "", results: choices.map((c) => (c ? c.result : undefined)) };
  const alt = ev && ev.alt && ev.alt.banmal;
  if (!alt || !charId || speechOf(data, charId) !== "banmal") return base;
  const altResults = Array.isArray(alt.results) ? alt.results : [];
  return {
    text: typeof alt.text === "string" && alt.text ? alt.text : base.text,
    results: base.results.map((r, i) => (altResults[i] !== undefined && altResults[i] !== null ? altResults[i] : r)),
  };
}
