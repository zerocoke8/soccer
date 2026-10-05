// test/lessonContent.test.mjs — LESSON_PROTO_PLAN §24.3 · §24.15 (실제 레슨 이벤트 데이터 data/lesson_ev_*.json)
// E1: 검사 통과 · id 하나 · 파일 목록 4곳 = EVENT_FILES. E2: 모든 선택지가 만든 런 중간 상태 위에서 오류 없이 적용 (뷰 · 고르기 · 갈래 둘 다).
// E5: 모든 깜짝 이벤트의 모든 선택지 (random 두 갈래) 를 만든 레슨 위에서 띄워 (lesson.forceSurprise) 고른다 — 레슨 안 효과까지.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData, clone } from "./helpers.mjs";
import * as LE from "../js/engine/lessonEvents.js";
import * as LF from "../js/engine/lessonEffects.js";
import * as LR from "../js/engine/lessonRun.js";
import * as lesson from "../js/engine/lesson.js";
import { createRngFromState } from "../js/engine/rng.js";
import { exampleBase, exampleFor } from "../tools/events_doc.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const data = loadData({ events: true }); // 데이터 그대로 (검사는 스위치와 상관없다)

test("실제 데이터: 이벤트 파일 7개가 있고 { version: 1, notes, events } 모양 · validateLessonEvents 통과", () => {
  for (const f of LE.EVENT_FILES) {
    const p = path.join(ROOT, "data", `${f}.json`);
    assert.ok(fs.existsSync(p), `data/${f}.json`);
    const file = data[f];
    assert.equal(file.version, 1, f);
    assert.ok(file.notes && typeof file.notes === "object" && !Array.isArray(file.notes), `${f} notes`);
    assert.ok(Array.isArray(file.events), `${f} events`);
  }
  assert.deepEqual(LE.lessonEventErrors(data), []);
  assert.equal(LE.validateLessonEvents(data), true);
});

test("실제 데이터: id 는 파일 7개 전체에서 하나 · 트리거는 목록 안 · ev_local_kids (본보기) 가 주 끝 파일에 있다", () => {
  const seen = new Map();
  for (const f of LE.EVENT_FILES) {
    for (const ev of data[f].events) {
      assert.ok(!seen.has(ev.id), `${ev.id}: ${seen.get(ev.id)} · ${f} 에 둘 다 있다`);
      seen.set(ev.id, f);
      assert.ok(LE.TRIGGERS.includes(ev.trigger), `${ev.id} trigger`);
    }
  }
  assert.equal(seen.size, LE.allEvents(data).length);
  assert.equal(seen.get("ev_local_kids"), "lesson_ev_week");
  assert.equal(LE.eventById(data, "ev_local_kids").trigger, "week");
});

test("파일 목록 4곳 (js/ui/app.js · test/helpers.mjs · tools/lesson_sim.mjs · tools/scenarios.mjs) = lessonEvents.EVENT_FILES", () => {
  for (const rel of ["js/ui/app.js", "test/helpers.mjs", "tools/lesson_sim.mjs", "tools/scenarios.mjs"]) {
    const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const names = [];
    for (const m of text.matchAll(/["'](lesson_ev_[a-z0-9_]+)["']/g)) if (!names.includes(m[1])) names.push(m[1]);
    assert.deepEqual(names, [...LE.EVENT_FILES], rel);
  }
  // 앱은 7개 + 그림 목록 (portraits) 을 읽고, 모두 없어도 된다 (OPTIONAL_FILES)
  const app = fs.readFileSync(path.join(ROOT, "js/ui/app.js"), "utf8");
  assert.match(app, /const DATA_FILES = \[[^\]]*\.\.\.EVENT_FILES, 'portraits'\]/);
  assert.match(app, /const OPTIONAL_FILES = new Set\(\[[^\]]*\.\.\.EVENT_FILES, 'portraits'\]\)/);
});

test("data/lesson.json events: §24.3.6 의 키 (기능 스위치 · 코치 · 깜짝 · 말투 표 · 대체값)", () => {
  const ev = data.lesson.events;
  for (const k of ["week", "seasonStart", "preMatch", "route", "outing"]) assert.equal(typeof ev[k], "boolean", k);
  assert.equal(typeof ev.coach.enabled, "boolean");
  assert.ok(["account", "run"].includes(ev.coach.firstMeet));
  assert.ok(Number.isInteger(ev.coach.gapWeeks) && ev.coach.gapWeeks >= 0);
  assert.equal(typeof ev.surprise.enabled, "boolean");
  assert.ok(ev.surprise.chance > 0 && ev.surprise.chance <= 1);
  assert.ok(Number.isInteger(ev.surprise.fromTurn) && ev.surprise.fromTurn >= 1);
  // 말투 표: 반말 6명 (§24.3.5) — 나머지는 존댓말
  assert.deepEqual(Object.keys(ev.speech).sort(), ["ch_dwarf_finisher", "ch_dwarf_wall", "ch_giant_keeper", "ch_human_header", "ch_spirit_dribbler", "ch_spirit_striker"]);
  for (const v of Object.values(ev.speech)) assert.equal(v, "banmal");
  for (const k of ["injuredStamina", "uniquePlusTp", "cardPickTp", "offerSkipTp", "noHintSp"]) assert.ok(Number.isFinite(ev.fallback[k]), `fallback.${k}`);
});

// ---------------------------------------------------------------------------
// E2 — 모든 실제 이벤트의 모든 선택지 적용 (§24.15)
// ---------------------------------------------------------------------------

/**
 * 런 중간처럼 만든 바탕 (시즌 2 · 2주 자유 주): 체력 제각각 · 결장 1명 · 유대 · 힌트 · TP · SP · 강화판 카드 · 덱에 공용 카드 하나 더.
 * 이벤트마다 tools/events_doc.mjs 의 예시 편성 (그 이벤트가 부르는 선수 · 코치를 넣은 것) 을 이 바탕 위에 만든다.
 */
function midRunBase(d) {
  const s = exampleBase(d);
  Object.assign(s, { season: 2, turn: 2, turnIndex: 6, trainingPoints: 40, skillPoints: 30, condition: 2, teamwork: 30 });
  s.weekOffer = { kind: "free", actions: ["meeting", "consult", "outing"], guaranteed: "meeting" };
  s.players.forEach((p, i) => (p.stamina = 35 + i * 9));
  s.players[4].injuredTurns = 1;
  s.supports.forEach((st, i) => (st.bond = 20 + i * 12));
  s.hints = { sk_big_game: 1 };
  s.deck[1].plus = true;
  s.deck.push({ uid: `k${s.nextUid++}`, cardId: "cd_one_two", plus: false });
  return s;
}

/** 효과를 바로 적용 (고르는 카드는 첫 후보) */
function applyDirect(state, effects, ctx) {
  const needs = LF.effectNeeds(state, data, effects);
  const uid = needs && needs.candidates.length ? needs.candidates[0].uid : undefined;
  const rng = createRngFromState(state.rngState);
  const out = LF.applyEffects(state, data, effects, { ...ctx, uid }, rng);
  state.rngState = rng.getState();
  return out;
}

test("실제 데이터: 모든 이벤트의 모든 선택지가 런 중간 상태 위에서 오류 없이 뜨고 · 보이고 · 적용된다 (고르는 카드 uid · random 두 갈래 · 3택1 · 유물, 깜짝은 미리보기만 — 적용은 아래 E5 테스트)", () => {
  const events = LE.allEvents(data);
  assert.ok(events.length >= 1);
  const base = midRunBase(data);
  let applied = 0;
  for (const ev of events) {
    const ex = exampleFor(base, data, ev);
    // 미리보기 · 기대값 (깜짝 포함, 레슨 안 효과도 글은 만든다)
    for (const c of ev.choices) {
      const d = LF.describe(ex.state, data, c.effects, ex.ctx);
      assert.ok(d.text && !/undefined|\?$/.test(d.text), `${ev.id}: 미리보기 ${d.text}`);
      assert.ok(Number.isFinite(LF.scoreEffects(ex.state, data, c.effects, ex.ctx)), `${ev.id}: 기대값`);
    }
    if (ev.trigger === "surprise") {
      applied += ev.choices.length; // 깜짝은 레슨 위에서 띄워 고른다 (아래 E5 테스트)
      continue;
    }
    ev.choices.forEach((c, i) => {
      const s = clone(ex.state);
      const ctx = ex.player ? { playerId: ex.player.id, partnerId: ex.player.id } : {};
      LE.fireEvent(s, data, ev, ctx);
      s.queue = ["advanceWeek"];
      const v = LR.getEventView(s, data);
      for (const t of [v.title, v.text, ...v.choices.map((x) => x.text)]) assert.ok(t && !/[{}]/.test(t), `${ev.id}: 자리표시가 남았다 — ${t}`);
      const needs = v.choices[i].needs;
      const uid = needs && needs.candidates.length ? needs.candidates[needs.candidates.length - 1].uid : undefined;
      LR.resolveEvent(s, data, i, { uid });
      assert.ok(s.lastEvent.result && !/[{}]/.test(s.lastEvent.result), `${ev.id}[${i}]: 결과 문구`);
      if (s.phase === "relic") LR.chooseRelic(s, data, s.pendingRelicChoices[0]);
      if (s.phase === "cardOffer") LR.resolveCardOffer(s, data, { pick: 0 });
      assert.equal(s.phase, "week", `${ev.id}[${i}]: 흐름이 다음 주로`);
      assert.ok(LR.isLessonRun(s));
      assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
      applied += 1;
      // random 이 있으면 두 갈래를 각각 바로 적용해 본다
      const rnd = c.effects.find((e) => e.type === "random");
      if (rnd) {
        for (const side of ["then", "else"]) {
          const t = clone(ex.state);
          applyDirect(t, [...c.effects.filter((e) => e.type !== "random"), ...rnd[side]], { ...ex.ctx, playerId: ex.player ? ex.player.id : null });
          applied += 1;
        }
      }
    });
  }
  assert.ok(applied >= events.length * 2);
});

// ---------------------------------------------------------------------------
// E5 — 모든 실제 깜짝 이벤트를 레슨 위에서 띄워 고른다 (§24.15)
// ---------------------------------------------------------------------------

/** 그 이벤트의 선택지 i 를 random 의 한 갈래로 고정한 데이터 사본 (얕은 사본 — 그 이벤트가 든 파일만 바꾼다) */
function branchData(d, ev, i, side) {
  const file = LE.EVENT_FILES.find((f) => d[f] && Array.isArray(d[f].events) && d[f].events.some((e) => e.id === ev.id));
  const c = ev.choices[i];
  const rnd = c.effects.find((e) => e.type === "random");
  const choice = { ...c, effects: [...c.effects.filter((e) => e.type !== "random"), ...rnd[side]], result: c.result[side] };
  const ev2 = { ...ev, choices: ev.choices.map((x, k) => (k === i ? choice : x)) };
  if (ev.alt && ev.alt.banmal) {
    const r = ev.alt.banmal.results[i];
    ev2.alt = { banmal: { ...ev.alt.banmal, results: ev.alt.banmal.results.map((x, k) => (k === i && r && typeof r === "object" ? r[side] : x)) } };
  }
  return { ...d, [file]: { ...d[file], events: d[file].events.map((e) => (e.id === ev.id ? ev2 : e)) } };
}

/** 예시 편성 위에서 레슨을 연다 (결장 없음 · 그 이벤트의 방침 · 중점 구역 · 특별) — 1턴 */
function lessonFor(state, d, ev) {
  const s = clone(state);
  for (const p of s.players) p.injuredTurns = 0;
  if (typeof ev.policy === "string") s.policy = ev.policy;
  const cond = ev.cond || {};
  const zone = Array.isArray(cond.zoneIn) ? cond.zoneIn[0] : "pass";
  s.phase = "week";
  s.queue = [];
  s.weekOffer = { kind: "lesson", specials: cond.special ? [zone] : [] };
  LR.applyWeekAction(s, d, { type: "lesson", zone });
  assert.equal(s.phase, "lesson", `${ev.id}: 레슨`);
  return s;
}

test("실제 데이터 (E5): 모든 깜짝 이벤트의 모든 선택지 (random 두 갈래) 가 만든 레슨 위에서 뜨고 · 말풍선이 보이고 · 고르면 효과 (레슨 안 효과 포함) 뒤 레슨이 이어진다", () => {
  const events = LE.allEvents(data).filter((ev) => ev.trigger === "surprise");
  const base = midRunBase(data);
  let applied = 0;
  for (const ev of events) {
    const ex = exampleFor(base, data, ev);
    const supportId = ev.cond && ev.cond.coachCardOkThisTurn ? ex.state.supports[0].id : undefined;
    ev.choices.forEach((c, i) => {
      const rnd = c.effects.find((e) => e.type === "random");
      for (const side of rnd ? ["then", "else"] : [null]) {
        const d = side ? branchData(data, ev, i, side) : data;
        const s = lessonFor(ex.state, d, ev);
        lesson.forceSurprise(s, d, { eventId: ev.id, supportId });
        assert.ok(s.lesson.surprise.pending, `${ev.id}: 떴다`);
        const v = LR.getLessonView(s, d).surprise;
        for (const t of [v.title, v.text, ...v.choices.map((x) => x.label), ...v.choices.map((x) => x.preview)]) {
          assert.ok(t && !/[{}]|undefined/.test(t), `${ev.id}: 말풍선 글 — ${t}`);
        }
        assert.equal(v.choices.filter((x) => x.recommended).length, 1, `${ev.id}: 추천 하나`);
        const turn = s.lesson.turn;
        LR.resolveSurprise(s, d, { choice: i });
        const f = s.lesson.surprise.fired;
        assert.ok(f && f.eventId === ev.id && f.choice === i, `${ev.id}[${i}]`);
        assert.ok(f.result && !/[{}]/.test(f.result), `${ev.id}[${i}]: 결과 문구 ${f.result}`);
        if (side) assert.equal(f.branch, null, "갈래를 고정한 사본에는 random 이 없다");
        assert.ok(s.lesson.status !== "playing" ? s.phase === "reward" : s.lesson.turn === turn + 1, `${ev.id}[${i}]: 다음 턴 또는 보상`);
        assert.ok(LR.isLessonRun(s));
        assert.equal(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
        applied += 1;
      }
    });
  }
  assert.ok(applied >= events.length * 2);
});
