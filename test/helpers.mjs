// test/helpers.mjs — 테스트 공용: data/*.json 로드, 자동 완주 드라이버
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as run from "../js/engine/run.js";
import * as match from "../js/engine/match.js";
import { setEventSwitches } from "../js/engine/lessonEvents.js";

/** 레슨 런 이벤트 7개 (LESSON_PROTO_PLAN §24.3.1 — lessonEvents.EVENT_FILES 와 같은 목록, test/lessonContent 가 비교). 없으면 건너뛴다 */
const EVENT_FILES = ["lesson_ev_surprise", "lesson_ev_week", "lesson_ev_story", "lesson_ev_fixed", "lesson_ev_new_a", "lesson_ev_new_b", "lesson_ev_coach"];
const DATA_FILES = ["config", "characters", "supports", "events", "skills", "relics", "opponents", "routes", "traits", "combos", "cards", "lesson", "policies", ...EVENT_FILES];
const OPTIONAL_FILES = new Set(EVENT_FILES);

/**
 * data/*.json (v0.3: traits·combos, v0.6-lesson: cards·lesson·policies, 2차: 레슨 런 이벤트 7개) 를 읽어 엔진 데이터 번들을 만든다 (매 호출마다 새 객체).
 * 기존 테스트는 이벤트를 끈 데이터가 기본이다 (§24.15): lesson.events 의 기능 스위치 (week · seasonStart · preMatch · route · outing ·
 * coach.enabled · surprise.enabled) 를 모두 끈 사본. `loadData({ events: true })` = 데이터 그대로.
 * @param {{ events?: boolean }} [opts]
 */
export function loadData({ events = false } = {}) {
  const data = {};
  for (const name of DATA_FILES) {
    const p = fileURLToPath(new URL(`../data/${name}.json`, import.meta.url));
    if (OPTIONAL_FILES.has(name) && !fs.existsSync(p)) continue;
    data[name] = JSON.parse(fs.readFileSync(p, "utf8"));
  }
  if (!events) setEventSwitches(data.lesson, false);
  return data;
}

/**
 * jsdom 앱 테스트의 fetch 대역: ROOT 아래 파일을 읽어 준다 (없으면 404). data/lesson.json 은 loadData 와 같게
 * 이벤트 기능 스위치를 끈 사본으로 준다 — `{ events: true }` 면 그대로.
 * @param {string} root  저장소 루트 (파일 경로)
 * @param {{ events?: boolean }} [opts]
 */
export function dataFetch(root, { events = false } = {}) {
  return async (url) => {
    const rel = String(url).replace(/^\.\//, "");
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    const text = fs.readFileSync(p, "utf8");
    const off = !events && rel.replace(/[?#].*$/, "") === "data/lesson.json";
    return { ok: true, status: 200, json: async () => (off ? setEventSwitches(JSON.parse(text), false) : JSON.parse(text)) };
  };
}

export const clone = (x) => JSON.parse(JSON.stringify(x));

/**
 * 런 한 단계를 정책대로 진행한다 (이벤트 0번, 유물 첫 번째, 루트 순환, 훈련 추천 칸, 경기 자동).
 * @returns {{ kind: string, detail?: object }} 무엇을 했는지
 */
export function stepRun(state, data, ctx) {
  const phase = run.getPhase(state);
  switch (phase) {
    case "turn": {
      const view = run.getTurnView(state, data);
      if (ctx.restWhenRecommended && view.recommendedAction === "rest") {
        run.applyAction(state, data, { type: "rest" });
        return { kind: "rest" };
      }
      const slot = view.recommendedSlot;
      const friendship = !!view.slots.find((s) => s.type === slot)?.preview.friendship;
      run.applyAction(state, data, { type: "train", slot });
      return { kind: "train", detail: { slot, friendship } };
    }
    case "event": {
      const ev = run.getEventView(state, data);
      run.resolveEvent(state, data, 0);
      return { kind: "event", detail: { eventId: ev.eventId } };
    }
    case "match": {
      const setup = run.getMatchSetup(state, data);
      const ms = match.createMatch({
        data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
      });
      match.simulateAuto(ms, data);
      const result = match.getResult(ms);
      run.finishMatch(state, data, result);
      return { kind: "match", detail: { setup, result, matchState: ms } };
    }
    case "relic":
      run.chooseRelic(state, data, state.pendingRelicChoices[0]);
      return { kind: "relic" };
    case "route": {
      const idx = (ctx.routeIndex = (ctx.routeIndex ?? 0));
      const routeId = state.pendingRoutes[idx % state.pendingRoutes.length];
      ctx.routeIndex = idx + 1;
      run.chooseRoute(state, data, routeId);
      return { kind: "route", detail: { routeId } };
    }
    default:
      throw new Error(`알 수 없는 phase: ${phase}`);
  }
}

/**
 * 기본 편성으로 런을 끝까지 자동 진행한다.
 * @param {object} data
 * @param {string|number} seed
 * @param {{ roundtrip?: boolean, restWhenRecommended?: boolean, onStep?: (state, info) => void, maxSteps?: number }} [opts]
 */
export function playRun(data, seed, opts = {}) {
  let state = run.createRun({ data, seed });
  const ctx = { routeIndex: 0, restWhenRecommended: !!opts.restWhenRecommended };
  const steps = [];
  let guard = 0;
  while (run.getPhase(state) !== "finished") {
    if (++guard > (opts.maxSteps ?? 1000)) throw new Error(`런이 끝나지 않습니다 (phase ${state.phase})`);
    const info = stepRun(state, data, ctx);
    steps.push(info.kind);
    if (opts.onStep) opts.onStep(state, info);
    if (opts.roundtrip) state = clone(state);
  }
  const final = run.finalizeRun(state, data);
  return { state, final, steps };
}

export { run, match };
