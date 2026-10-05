#!/usr/bin/env node
// tools/events_doc.mjs — 레슨 런 이벤트 데이터 (data/lesson_ev_*.json) → 검토용 한국어 문서 (LESSON_PROTO_PLAN §24.11 · §24.14)
//   node tools/events_doc.mjs [out.md]      기본 docs/LESSON_EVENTS.md (생성물 — 손으로 고치지 않는다, I1 이 마지막에 만든다)
// 데이터는 tools/lesson_sim.mjs 와 같게 읽고 (lessonEvents.validateLessonEvents 를 통과해야 쓴다), 파일 · 트리거별로
//   "#### id — 제목" · 트리거 줄 (주 범위 · 시즌 · 조건 · 가중치 · 1회/반복) · 주인공 줄 · 본문 ("> " 줄, 반말판은 괄호) ·
//   선택지 | 효과 | 결과 문구 표 · 파일 notes (이야기 줄기 · 새 설정) 를 적는다.
// 효과 칸은 엔진 미리보기 (lessonEffects.describe, E2) 를 예시 주인공 · 예시 편성으로 만든 것이다 (게임 화면과 같은 글 — 이름 ·
// 대체값은 그 예시 기준). 예시 편성 = 기본 편성 · 기본 코치 6명에 그 이벤트가 꼭 부르는 선수 · 코치를 바꿔 넣은 것.
// 자리표시 · 조사 꼴은 데이터 그대로 둔다 ({선수|이/가}) — 표 칸 안의 | 는 \| 로 적는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "./lesson_sim.mjs";
import * as LE from "../js/engine/lessonEvents.js";
import * as LF from "../js/engine/lessonEffects.js";
import * as LR from "../js/engine/lessonRun.js";
import * as cardsMod from "../js/engine/cards.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFAULT_OUT = path.join(ROOT, "docs", "LESSON_EVENTS.md");

const ZONE_LABELS = { shoot: "슈팅", dribble: "드리블", pass: "패스", defense: "수비", physical: "피지컬" };
const BUFF_LABELS = LF.BUFF_LABELS;

/** 표 칸: | → \| , 줄바꿈 → <br> */
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
const seasonsText = (s) => {
  if (!Array.isArray(s) || !s.length) return "1~3";
  const sorted = [...s].sort((a, b) => a - b);
  const run = sorted.every((x, i) => i === 0 || x === sorted[i - 1] + 1);
  return run && sorted.length > 1 ? `${sorted[0]}~${sorted[sorted.length - 1]}` : sorted.join(", ");
};

/**
 * 데이터 이름표 (캐릭터 · 코치 · 스킬 · 카드 · 루트 · 방침).
 * @param {object} data
 */
function namer(data) {
  const byId = (arr) => new Map((Array.isArray(arr) ? arr : []).filter((o) => o && o.id).map((o) => [o.id, o]));
  const chars = byId(data.characters);
  const sups = byId(data.supports);
  const skills = byId(data.skills);
  const cards = byId(data.cards && data.cards.cards);
  const routes = byId(data.routes);
  const pols = byId(data.policies && data.policies.policies);
  const nm = (m, id) => (m.get(id) ? m.get(id).name : id);
  return {
    char: (id) => nm(chars, id),
    sup: (id) => nm(sups, id),
    skill: (id) => nm(skills, id),
    card: (id) => nm(cards, id),
    route: (id) => nm(routes, id),
    policy: (id) => nm(pols, id),
  };
}

// ---------------------------------------------------------------------------
// 예시 편성 · 예시 주인공 (효과 칸 = lessonEffects.describe)
// ---------------------------------------------------------------------------

const clone = (x) => JSON.parse(JSON.stringify(x));
const APT_RANK = { S: 0, A: 1, B: 2, C: 3, D: 4 };

/** 효과 목록 + random 갈래 안 */
function flatEffects(effects) {
  const out = [];
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!e || typeof e !== "object") continue;
    out.push(e);
    if (e.type === "random") for (const side of ["then", "else"]) for (const b of Array.isArray(e[side]) ? e[side] : []) if (b) out.push(b);
  }
  return out;
}

/** 예시 편성 바탕: 기본 편성 · 기본 코치의 새 런 (이벤트 스위치를 끈 데이터 사본 — 첫 주에서 멈춘다) */
export function exampleBase(data) {
  const lesson = clone(data.lesson);
  LE.setEventSwitches(lesson, false);
  return LR.createRun({ data: { ...data, lesson }, seed: 1 });
}

/** 그 이벤트가 꼭 부르는 선수 · 코치 (주인공 고정 · 편성 조건 · char:<id> 대상 · 코치 조건 · 코치 대상) */
function needsOf(ev) {
  const chars = new Set();
  const coaches = new Set();
  if (ev.trigger === "story" && ev.story) chars.add(ev.story.charId);
  if (ev.who && ev.who.pick === "char" && ev.who.charId) chars.add(ev.who.charId);
  if (Array.isArray(ev.chars) && ev.chars.length) {
    if (ev.charMode === "any") chars.add(ev.chars[0]);
    else for (const c of ev.chars) chars.add(c);
  }
  if (ev.cond && ev.cond.char && ev.cond.char.id) chars.add(ev.cond.char.id);
  if (typeof ev.coach === "string") coaches.add(ev.coach);
  if (ev.chain && ev.chain.supportId) coaches.add(ev.chain.supportId);
  for (const c of ev.choices || []) {
    for (const e of flatEffects(c.effects)) {
      if (typeof e.target === "string" && e.target.startsWith("char:")) chars.add(e.target.slice(5));
      if (e.type === "bond" && typeof e.target === "string" && e.target !== "all" && e.target !== "coach") coaches.add(e.target);
      if (e.type === "teach" && e.supportId) coaches.add(e.supportId);
      if (e.type === "coachHint" && typeof e.from === "string" && !["fielded", "coach"].includes(e.from)) coaches.add(e.from);
    }
  }
  return { chars: [...chars], coaches: [...coaches] };
}

/** 그 선수 자리에 다른 캐릭터를 넣는다 (스탯 = 캐릭터 기본, 덱의 고유 카드도 바꾼다) */
function swapChar(state, data, p, ch) {
  const uniq = (charId) => cardsMod.cardList(data).find((c) => c.family === "unique" && c.ownerCharId === charId) || null;
  const oldU = uniq(p.charId);
  const newU = uniq(ch.id);
  const e = oldU ? state.deck.find((x) => x.cardId === oldU.id) : null;
  if (e && newU) e.cardId = newU.id;
  else if (newU) state.deck.push({ uid: `k${state.nextUid++}`, cardId: newU.id, plus: false });
  Object.assign(p, {
    charId: ch.id, name: ch.name, portraitColor: ch.portraitColor || "#888888", race: ch.race, element: ch.element, style: ch.style, rarity: ch.rarity,
    stats: { ...ch.baseStats }, growth: { ...ch.growth }, innateSkillId: ch.innateSkillId || null, learnedSkillIds: [],
  });
}

/** 예시 상태: 바탕 사본에 꼭 부르는 선수 (적성이 가장 좋은 자리, 같으면 뒤 슬롯) · 코치 (뒤에서부터) 를 넣는다 */
function exampleState(base, data, ev) {
  const { chars, coaches } = needsOf(ev);
  const s = clone(base);
  const keep = new Set(chars);
  for (const cid of chars) {
    if (s.players.some((p) => p.charId === cid)) continue;
    const ch = data.characters.find((c) => c.id === cid);
    const free = s.players.filter((p) => !keep.has(p.charId));
    if (!ch || !free.length) continue;
    const rank = (p) => APT_RANK[(ch.aptitude || {})[p.position]] ?? 9;
    const target = free.slice().sort((a, b) => rank(a) - rank(b) || s.players.indexOf(b) - s.players.indexOf(a))[0];
    swapChar(s, data, target, ch);
  }
  for (const sid of coaches) {
    if (s.supports.some((x) => x.id === sid)) continue;
    let i = s.supports.length - 1;
    while (i >= 0 && coaches.includes(s.supports[i].id)) i -= 1;
    const sc = data.supports.find((x) => x.id === sid);
    if (i >= 0 && sc) s.supports[i] = { id: sid, bond: Number(sc.initialBond) || 0, firedEventIds: [] };
  }
  return s;
}

/** 예시 주인공: 고정이면 그 선수, 아니면 후보 (pos 로 좁힌 선수) 중 이벤트 id 로 정한 한 명 (같은 데이터 = 같은 문서) */
function exampleProtagonist(s, ev) {
  if (ev.trigger === "story" && ev.story) return s.players.find((p) => p.charId === ev.story.charId) || null;
  const who = ev.who || {};
  const pick = who.pick || (ev.trigger === "outing" ? "partner" : ev.trigger === "coach" ? "coachTarget" : "none");
  if (pick === "none") return null;
  if (pick === "char") return s.players.find((p) => p.charId === who.charId) || null;
  if (ev.trigger === "surprise" && ev.cond && ev.cond.char && ev.cond.char.id) {
    const p = s.players.find((x) => x.charId === ev.cond.char.id);
    if (p) return p;
  }
  const narrowed = Array.isArray(who.pos) ? s.players.filter((p) => who.pos.includes(p.position)) : [];
  const pool = narrowed.length ? narrowed : s.players;
  let h = 0;
  for (const ch of String(ev.id)) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return pool[h % pool.length] || null;
}

/** 이벤트 하나의 예시 (상태 · 주인공 · 효과 ctx) */
export function exampleFor(base, data, ev) {
  const state = exampleState(base, data, ev);
  const player = exampleProtagonist(state, ev);
  const charIds = ev.trigger === "story" && ev.story ? [ev.story.charId] : Array.isArray(ev.chars) ? ev.chars.slice() : [];
  const ctx = {
    eventId: ev.id,
    trigger: ev.trigger,
    playerId: player ? player.id : null,
    supportId: (ev.chain && ev.chain.supportId) || (typeof ev.coach === "string" ? ev.coach : null),
    charIds,
    policy: typeof ev.policy === "string" ? ev.policy : undefined,
  };
  return { state, player, ctx };
}

function weekCondText(cond) {
  const out = [];
  for (const [k, v] of Object.entries(cond || {})) {
    if (k === "anyStaminaBelow") out.push(`체력 ${v} 미만 선수가 있다`);
    else if (k === "avgStaminaBelow") out.push(`7명 평균 체력 ${v} 미만`);
    else if (k === "anyInjured") out.push("결장 중인 선수가 있다");
    else if (k === "teamworkBelow") out.push(`팀워크 ${v} 미만`);
    else if (k === "conditionBelow") out.push(`컨디션 ${v} 미만`);
    else if (k === "conditionAtLeast") out.push(`컨디션 ${v} 이상`);
    else out.push(`${k} ${JSON.stringify(v)}`);
  }
  return out.join(" · ");
}

function surpriseCondText(cond, N) {
  const z = (id) => ZONE_LABELS[id] || id;
  const buff = (v) => `${BUFF_LABELS[v && v.key] || (v && v.key)}`;
  const out = [];
  for (const [k, v] of Object.entries(cond || {})) {
    switch (k) {
      case "randomTurn": out.push("정해 둔 무작위 턴"); break;
      case "turnMin": out.push(`${v}턴 끝부터`); break;
      case "turnsLeftMax": out.push(`남은 턴 ${v} 이하`); break;
      case "halfway": out.push("절반이 지난 턴"); break;
      case "special": out.push("특별 레슨"); break;
      case "zoneIn": out.push(`중점 구역 ${(v || []).map(z).join(" · ")}`); break;
      case "buffAtLeast": out.push(`${buff(v)} ${v.n} 이상`); break;
      case "buffEquals": out.push(`${buff(v)} ${v.n}`); break;
      case "scoreToTargetMax": out.push(`목표치까지 ${v} 이하`); break;
      case "scoreBelowTargetFrac": out.push(`점수가 목표치의 ${Math.round(v * 100)}% 미만`); break;
      case "capLeftMax": out.push(`상한까지 ${v} 이하`); break;
      case "notCleared": out.push("아직 클리어 전"); break;
      case "notPerfect": out.push("아직 퍼펙트 전"); break;
      case "anyStaminaBelow": out.push(`체력 ${v} 미만 선수가 있다`); break;
      case "failedThisTurn": out.push("이번 턴 카드 실패"); break;
      case "coachCardOkThisTurn": out.push("이번 턴 코치 카드 성공"); break;
      case "multiOkThisTurn": out.push(`원 카드 ${v}명 이상 모두 성공`); break;
      case "reshuffledThisTurn": out.push("이번 턴 버린 더미를 다시 섞음"); break;
      case "benchedThisTurn": out.push("이번 턴 벤치를 씀"); break;
      case "targetStreak": out.push(`같은 선수가 ${v}턴 연속 대상 (단일 · 주인 카드)`); break;
      case "zoneEmptyAtTurnStart": out.push(`턴 시작 때 ${z(v)} 구역이 비었다`); break;
      case "char": {
        const c = v || {};
        const sub = [];
        if (c.staminaMin !== undefined) sub.push(`체력 ${c.staminaMin} 이상`);
        if (c.staminaMax !== undefined) sub.push(`체력 ${c.staminaMax} 이하`);
        if (c.targetedMin !== undefined) sub.push(`대상 ${c.targetedMin}번 이상`);
        if (c.targetedMax !== undefined) sub.push(`대상 ${c.targetedMax}번 이하`);
        if (c.untargetedTurnsMin !== undefined) sub.push(`${c.untargetedTurnsMin}턴째 대상이 안 됨`);
        if (c.zone !== undefined) sub.push(`${z(c.zone)} 구역에 있다`);
        if (c.zoneCountMin !== undefined) sub.push(`같은 구역 ${c.zoneCountMin}명 이상`);
        if (c.aloneInZone) sub.push("혼자 한 구역에 있다");
        if (c.movedThisTurn) sub.push("이번 턴 구역을 옮겼다");
        if (c.targetedThisTurn) sub.push("이번 턴 대상");
        if (c.ownCardThisTurn) sub.push("이번 턴 자기 고유 카드 성공");
        out.push(`${N.char(c.id)}${sub.length ? ` (${sub.join(" · ")})` : ""}`);
        break;
      }
      default: out.push(`${k} ${JSON.stringify(v)}`);
    }
  }
  return out.join(" · ");
}

function charsText(ev, N) {
  if (!Array.isArray(ev.chars) || !ev.chars.length) return null;
  const names = ev.chars.map((c) => N.char(c));
  return ev.charMode === "any" ? `${names.join(" 또는 ")} 편성` : names.length > 1 ? `${names.join(" · ")} 모두 편성` : `${names[0]} 편성`;
}

/** 트리거 줄 (주 범위 · 시즌 · 조건 · 가중치 · 1회/반복) */
export function triggerLine(ev, N) {
  const parts = [];
  const weightText = () => {
    const w = ev.weight === undefined ? "가중치 1 (기본)" : `가중치 ${ev.weight}`;
    return ev.weightIf ? `${w} (${weekCondText(ev.weightIf.cond)} → ${ev.weightIf.weight})` : w;
  };
  switch (ev.trigger) {
    case "week": {
      parts.push("주 끝");
      parts.push(ev.weekList ? `주 ${ev.weekList.join(", ")}` : ev.weeks ? `주 ${ev.weeks[0]}~${ev.weeks[1]}` : "주 0~14");
      parts.push(`시즌 ${seasonsText(ev.seasons)}`);
      const conds = [];
      if (ev.cond) conds.push(weekCondText(ev.cond));
      const ct = charsText(ev, N);
      if (ct) conds.push(ct);
      if (ev.coach) conds.push(`${N.sup(ev.coach)} 편성`);
      parts.push(conds.length ? `조건: ${conds.join(" · ")}` : "조건 없음");
      parts.push(weightText());
      parts.push(ev.once === false ? "반복 (바로 다음 주에는 다시 안 뜬다)" : ev.once === "season" ? "시즌마다 1회" : "1회용");
      break;
    }
    case "seasonStart":
      parts.push("시즌 시작", `시즌 ${seasonsText(ev.seasons)}`);
      break;
    case "preMatch":
      parts.push("경계전 전야 (5주 슬롯 뒤)", `시즌 ${seasonsText(ev.seasons)}`);
      break;
    case "route":
      parts.push("루트를 고른 뒤", `${N.route(ev.routeId)} (${ev.routeId})`, "반복");
      break;
    case "outing":
      parts.push("일반 외출", weightText(), "런 안에서 겹치지 않게 (6종을 다 보면 처음부터)");
      break;
    case "story":
      parts.push("외출 이야기", `${N.char(ev.story && ev.story.charId)} ${ev.story && ev.story.ep}화`, "계정 1회");
      break;
    case "coach":
      parts.push("코치 연속", `${N.sup(ev.chain && ev.chain.supportId)} ${ev.chain && ev.chain.step}단계`, `유대 ${ev.bondAtLeast} 이상`);
      break;
    case "surprise": {
      parts.push("레슨 깜짝", `조건: ${surpriseCondText(ev.cond, N) || "없음"}`);
      if (ev.policy) parts.push(`방침: ${N.policy(ev.policy)}`);
      const ct = charsText(ev, N);
      if (ct) parts.push(ct);
      if (ev.seasons) parts.push(`시즌 ${seasonsText(ev.seasons)}`);
      parts.push(weightText(), "런 1회");
      break;
    }
    default:
      parts.push(String(ev.trigger));
  }
  return parts.join(" · ");
}

/** 주인공 줄 */
export function whoLine(ev, N) {
  if (ev.trigger === "story") return `${N.char(ev.story && ev.story.charId)} (이야기 주인공)`;
  if (ev.trigger === "coach") return "이번 런에 그 코치 카드의 대상이 가장 많이 된 선수 (coachTarget)";
  if (ev.trigger === "outing") return "외출 상대";
  const w = ev.who;
  if (!w || w.pick === "none") return "없음";
  const pool = w.pos ? `${w.pos.join(" · ")} 중 ` : w.zone ? `${ZONE_LABELS[w.zone] || w.zone} 구역에 선 선수 중 ` : "";
  switch (w.pick) {
    case "random": return `${pool || "7명 중 "}무작위 (결장 제외)`;
    case "char": return N.char(w.charId);
    case "lowestStamina": return `${pool}체력이 가장 낮은 선수 (결장 제외)`;
    case "highestStamina": return `${pool}체력이 가장 높은 선수 (결장 제외)`;
    case "partner": return "외출 상대";
    case "coachTarget": return "이번 런에 그 코치 카드의 대상이 가장 많이 된 선수";
    case "turnFailer": return "이번 턴 실패한 선수";
    case "streaker": return "연속 대상 선수";
    case "coachCardTarget": return "이번 턴 코치 카드 대상 중 무작위";
    case "multiTarget": return "3명 이상 원 카드 대상 중 무작위";
    case "mostTargeted": return "이번 레슨 대상 최다";
    default: return String(w.pick);
  }
}

function resultText(r, ev, ci) {
  if (r && typeof r === "object") {
    const rnd = (ev.choices[ci].effects || []).find((e) => e && e.type === "random");
    const p = rnd ? Math.round(rnd.chance * 100) : null;
    return p === null ? `${r.then} / ${r.else}` : `${p}%: ${r.then} / ${100 - p}%: ${r.else}`;
  }
  return String(r ?? "");
}

/** 한 이벤트 → Markdown 줄 (효과 칸 = 엔진 미리보기, 예시 편성 · 예시 주인공) */
function eventBlock(ev, N, data, base) {
  const ex = exampleFor(base, data, ev);
  const L = [];
  L.push(`#### ${ev.id} — ${ev.title}`);
  L.push(`- 트리거: ${triggerLine(ev, N)}`);
  const fixed = ev.trigger === "story" || (ev.who && ev.who.pick === "char");
  L.push(`- 주인공: ${whoLine(ev, N)}${ex.player && !fixed ? ` (예시: ${ex.player.name})` : ""}`);
  if (ev.trigger !== "surprise") L.push(`- 배경: ${LE.sceneOf(ev)}${ev.scene ? "" : " (기본)"}`);
  for (const line of String(ev.text || "").split("\n")) L.push(`> ${line}`);
  const alt = ev.alt && ev.alt.banmal;
  if (alt && typeof alt.text === "string") {
    const base = String(ev.text || "").split("\n");
    const lines = alt.text.split("\n");
    const diff = lines.length === base.length ? lines.filter((l, i) => l !== base[i]) : lines;
    L.push(`> (반말판: ${diff.length ? diff.join(" / ") : "본문 같음"})`);
  }
  L.push("");
  L.push("| 선택지 | 효과 | 결과 문구 |");
  L.push("|---|---|---|");
  (ev.choices || []).forEach((c, ci) => {
    let res = resultText(c.result, ev, ci);
    if (alt && Array.isArray(alt.results) && alt.results[ci] !== undefined) {
      const b = resultText(alt.results[ci], ev, ci);
      if (b !== res) res += ` (반말판: ${b})`;
    }
    L.push(`| ${cell(c.label)} | ${cell(LF.describe(ex.state, data, c.effects, ex.ctx).text)} | ${cell(res)} |`);
  });
  L.push("");
  return L;
}

/**
 * 검토 문서 전체 (Markdown, LF). 날짜 같은 바뀌는 값은 넣지 않는다 (같은 데이터 = 같은 문서).
 * @param {object} data
 * @returns {string}
 */
export function buildEventsDoc(data) {
  const N = namer(data);
  const base = exampleBase(data);
  const L = [];
  const files = LE.EVENT_FILES.filter((f) => data[f] && Array.isArray(data[f].events));
  const total = files.reduce((s, f) => s + data[f].events.length, 0);
  L.push("# 레슨 런 이벤트 — 검토용 (생성물)");
  L.push("");
  L.push("> `node tools/events_doc.mjs` 가 `data/lesson_ev_*.json` 에서 만든다. **손으로 고치지 않는다** — 데이터를 고치고 다시 만든다 (LESSON_PROTO_PLAN §24.11).");
  L.push("> 효과 칸은 게임 화면과 같은 엔진 미리보기 (`lessonEffects.describe`) 다 — 예시 편성 (기본 편성 · 기본 코치에 그 이벤트가 부르는 선수 · 코치를 넣은 첫 주 상태) 과 예시 주인공 기준이라, 실제 런에서는 이름 · 대체값 (이미 결장 → 체력, 이미 강화판 → TP, 남은 레슨 없음 → SP …) 이 그때 상태로 바뀐다. 자리표시 · 조사 꼴은 데이터 그대로 둔다 (`{선수|이/가}`).");
  L.push(`> 검사 (\`validateLessonEvents\`) 통과 · 이벤트 ${total}개.`);
  L.push("");
  L.push("| 파일 | 트리거 | 개수 |");
  L.push("|---|---|---|");
  for (const f of files) {
    const by = {};
    for (const ev of data[f].events) by[ev.trigger] = (by[ev.trigger] || 0) + 1;
    const trig = LE.TRIGGERS.filter((t) => by[t]).map((t) => `${LE.TRIGGER_LABELS[t]} ${by[t]}`).join(" · ") || "—";
    L.push(`| \`${f}.json\` | ${trig} | ${data[f].events.length} |`);
  }
  L.push("");
  for (const f of files) {
    const file = data[f];
    L.push(`## ${f}.json (${file.events.length}개)`);
    L.push("");
    if (!file.events.length) {
      L.push("(아직 이벤트가 없다)");
      L.push("");
    }
    for (const t of LE.TRIGGERS) {
      const evs = file.events.filter((ev) => ev.trigger === t);
      if (!evs.length) continue;
      L.push(`### ${LE.TRIGGER_LABELS[t]} (${t}) — ${evs.length}개`);
      L.push("");
      for (const ev of evs) L.push(...eventBlock(ev, N, data, base));
    }
    const notes = file.notes && typeof file.notes === "object" ? Object.entries(file.notes) : [];
    if (notes.length) {
      L.push("### 메모 (notes — 이야기 줄기 · 새 설정)");
      L.push("");
      for (const [id, n] of notes) {
        const name = id.startsWith("sp_") ? N.sup(id) : N.char(id);
        L.push(`- **${name}** (\`${id}\`) — ${n.arc}`);
        for (const s of Array.isArray(n.setting) ? n.setting : []) L.push(`  - ${s}`);
      }
      L.push("");
    }
  }
  return `${L.join("\n").replace(/\n+$/, "")}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const out = argv[0] ? path.resolve(argv[0]) : DEFAULT_OUT;
  const data = loadData();
  try {
    LE.validateLessonEvents(data);
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
    return null;
  }
  const doc = buildEventsDoc(data);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, doc, "utf8");
  const n = LE.allEvents(data).length;
  console.log(`이벤트 ${n}개 → ${path.relative(process.cwd(), out) || out}`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) main();
