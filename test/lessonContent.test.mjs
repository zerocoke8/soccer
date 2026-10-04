// test/lessonContent.test.mjs — LESSON_PROTO_PLAN §24.3 · §24.15 (실제 레슨 이벤트 데이터 data/lesson_ev_*.json)
// E1: 검사 통과 · id 하나 · 파일 목록 4곳 = EVENT_FILES. E2 가 "모든 선택지가 만든 상태 위에서 오류 없이 적용", E5 가 깜짝 효과를 더한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadData } from "./helpers.mjs";
import * as LE from "../js/engine/lessonEvents.js";

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
