// test/hexMoment.test.mjs — 결정의 순간 (H3.5 — js/engine/hexMoment.js · hexMatch.js 의 choice / defend 입력 · 수비 자세 · 2골 선승).
//   HEX_AUTOBATTLE_PLAN 결정 26 · 27. 장면 판단 (종류마다 · 아닌 경우) · 스케줄러 간격 (25턴) · 우선순위 · 골 / 킥오프 / 승부차기 / 컷인 뒤 없음 ·
//   momentView 순수 (rngState · events 그대로) · choice 입력 (그 선택지 그대로 · 낡으면 무시) · ★ 카드 = 필살기 발동 · 수비 자세 3가지 ·
//   수비 자세 AI 규칙 · 2골 선승 끝 (동점 300턴은 그대로) · choose / defend 입력 재생 · 판 2 재생 기록.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData, clone } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as hex from "../js/engine/hexMatch.js";
import * as MO from "../js/engine/hexMoment.js";
import * as G from "../js/engine/hexGrid.js";
import { practiceSetup } from "../js/ui/practice.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCR = await import(pathToFileURL(path.join(ROOT, "js/ui/screens/hexMatch.js")).href);

const data = loadData();
const cfg = data.config;
const SQ = practiceSetup(LR, data, "moment-test");
const D = hex.HEX_DEFAULTS;
const MAX = cfg.match.ultimate.gaugeMax;
const id = (c, r) => G.cellId(c, r);
const evs = (ms, type) => ms.events.filter((e) => e.type === type);
/** 2골 선승을 끈 data (300턴 내내) · 수비 자세 AI 규칙을 끈 data */
const FULL = { ...data, config: { ...cfg, hexMatch: { goalsToWin: 0 } } };
const NOSTANCE = { ...data, config: { ...cfg, hexMatch: { aiStance: 0 } } };

/**
 * 장면: 판을 비우고 지정한 선수만 놓는다 (나머지 필드 선수는 먼 구석 — 홈 아래 줄 · 원정 위 줄, GK 는 자기 골 앞).
 * 연습 선수단: 홈 p1 GK (세이브) · p2 DF (수비 — 산맥 쐐기) · p3 DF (팀) · p4 MF (패스) · p5 MF (드리블) · p6 FW (패스) · p7 FW (슛 — 메테오), 원정 = m_ 같은 선수.
 * gauge = { "home:p7": 100 } · stats = { "away:m_p6": { pass: 900 } } (선수 능력치 덮어쓰기) · ai = state.aiSides (기본 아무도)
 */
function scene({ home = {}, away = {}, ball, turn = 40, kind = "friendly", moveAcc = 0, ai = [], gauge = {}, stats = {}, score = null, d = data } = {}) {
  const ms = hex.createMatch({ data: d, seed: "moment-scene", home: SQ.home, away: SQ.away, kind });
  const park = { home: [[1, 12], [2, 12], [3, 12], [4, 12], [5, 12], [6, 12]], away: [[13, 0], [12, 0], [11, 0], [10, 0], [9, 0], [8, 0]] };
  for (const side of ["home", "away"]) {
    const spec = side === "home" ? home : away;
    let k = 0;
    for (const pid of ms.order[side]) {
      let cr = spec[pid];
      if (!cr) cr = ms.roles[side][pid] === "GK" ? (side === "home" ? [0, 6] : [14, 6]) : park[side][k++];
      ms.pos[side][pid] = id(cr[0], cr[1]);
      Object.assign(ms.live[side][pid], { moveAcc, restUntil: -1 });
    }
  }
  for (const [k, v] of Object.entries(gauge)) {
    const [s, pid] = k.split(":");
    ms.live[s][pid].gauge = v;
  }
  for (const [k, v] of Object.entries(stats)) {
    const [s, pid] = k.split(":");
    Object.assign(ms[s].players.find((p) => p.id === pid).stats, v);
  }
  ms.turn = turn;
  ms.events = [];
  ms.aiSides = ai.slice();
  ms.moment = null;
  ms.momentClock = { last: null, ult: [], combo: null };
  if (score) ms.score = { ...score };
  if (ball) {
    ms.ball = { holder: { side: ball.side, id: ball.id }, cell: ms.pos[ball.side][ball.id], flight: null, loose: false, holdStreak: 0 };
    ms.possessionSide = ball.side;
  }
  return ms;
}
/** 덮어쓰기 (주사위 · 공 가진 선수의 선택 — 첫 step 만) 를 걸고 step 한 번 */
function stepWith(ms, { roll = null, decide = null, input = null, d = data } = {}) {
  hex.setHexRollForTest(roll);
  let used = false;
  hex.setHexDecisionForTest(decide ? () => (used ? undefined : ((used = true), decide)) : null);
  try {
    hex.step(ms, d, input);
  } finally {
    hex.setHexRollForTest(null);
    hex.setHexDecisionForTest(null);
  }
  return ms;
}
/** 손으로 놓은 판의 장면 판단 (step 이 턴 끝마다 부르는 스케줄러) */
const judge = (ms, turnEvents = [], d = data) => hex.scheduleMoment(ms, d, turnEvents);

/* 자주 쓰는 장면 (홈 = 사람, 오른쪽 골 공격) */
// 슈팅 찬스: 그레타 (슛 819 — 사거리 5) 가 골까지 4칸, 울리카가 비어 있는 옆 (패스 성공 높음)
const SHOT = () => scene({ home: { p7: [11, 6], p6: [10, 3] }, ball: { side: "home", id: "p7" } });
// 수비 위기: 원정 울리카 (m_p6) 가 우리 골까지 4칸 · 우리 도르비나 (p2) 가 그 정면
const DANGER = (extra = {}) => scene({ home: { p2: [2, 6], ...(extra.home || {}) }, away: { m_p6: [3, 6], m_p7: [2, 9], ...(extra.away || {}) }, ball: { side: "away", id: "m_p6" }, ...extra.opts });
// 크로스 자리: 실루엔 (p4) 이 오른쪽 측면 (열 10 · 행 1), 그레타가 박스 안
const CROSS = (opts = {}) => scene({ home: { p4: [10, 1], p7: [12, 5] }, ball: { side: "home", id: "p4" }, ...opts });

/* ------------------------------------------------------------------ */
/* 장면 판단                                                              */
/* ------------------------------------------------------------------ */

test("장면 종류 상수 · 우선순위 순서 · 판 3 상태 (rules · moment · momentClock)", () => {
  assert.deepEqual(MO.MOMENT_KINDS, ["shot", "danger", "ult", "cross", "counter"]);
  assert.equal(hex.HEX_MATCH_VERSION, 3);
  assert.deepEqual(hex.STANCES, ["press", "block", "drop"]);
  assert.equal(D.goalsToWin, 2);
  assert.equal(D.momentGap, 25);
  const ms = hex.createMatch({ data, seed: "mo-st", home: SQ.home, away: SQ.away });
  assert.equal(ms.rules, 3);
  assert.equal(ms.moment, null);
  assert.deepEqual(ms.momentClock, { last: null, ult: [], combo: null });
  assert.equal(hex.createMatch({ data, seed: "mo-st", home: SQ.home, away: SQ.away, rules: 2 }).rules, 2);
  assert.throws(() => hex.createMatch({ data, seed: "mo-st", home: SQ.home, away: SQ.away, rules: 4 }), /rules/);
});

test("슈팅 찬스: 사거리 안 · 골 확률 ≥ momentShotMinP · 다른 쓸 만한 선택지 → shot / 아닌 경우 (사거리 밖 · 다른 선택지 없음 · GK)", () => {
  const ms = SHOT();
  const co = hex.peekOptions(ms, data);
  const sh = co.opts.find((o) => o.key === "shoot");
  assert.ok(sh && sh.p >= D.momentShotMinP, `슛 골 확률 ${sh && sh.p}`);
  assert.ok(co.opts.some((o) => o.action === "pass" && o.p >= D.momentAltMinP), "다른 쓸 만한 선택지");
  const mo = judge(ms);
  assert.deepEqual(mo, { kind: "shot", side: "home", playerId: "p7", turn: ms.turn + 1, options: null });
  assert.equal(ms.moment, mo);
  assert.equal(ms.momentClock.last, ms.turn + 1, "간격 시작");
  // 사거리 밖 (골까지 9칸)
  const far = scene({ home: { p7: [6, 6], p6: [5, 3] }, ball: { side: "home", id: "p7" } });
  assert.ok(!hex.peekOptions(far, data).opts.some((o) => o.key === "shoot"));
  const fm = judge(far);
  assert.ok(!fm || fm.kind !== "shot", "사거리 밖은 슈팅 찬스 아님");
  // 다른 쓸 만한 선택지가 없음 (기준을 1 로 — 어떤 패스 · 드리블도 "쓸 만" 하지 않다) → 슛만이면 고를 거리가 없다
  const strict = { ...data, config: { ...cfg, hexMatch: { momentAltMinP: 1.01 } } };
  const am = judge(SHOT(), [], strict);
  assert.ok(!am || am.kind !== "shot");
  // 상대가 공을 가지면 슈팅 찬스 아님 (수비 쪽)
  assert.notEqual((judge(DANGER()) || {}).kind, "shot");
});

test("수비 위기: 공 가진 상대가 우리 골 dangerDist 안 + 우리 수비가 앞쪽 3칸 → danger (막는 수비) / 멀거나 뒤에 서면 아님", () => {
  const ms = DANGER();
  assert.deepEqual(judge(ms), { kind: "danger", side: "home", playerId: "p2", turn: ms.turn + 1, options: null });
  // 멀다 (골까지 10칸)
  const far = scene({ home: { p2: [8, 6] }, away: { m_p6: [9, 6] }, ball: { side: "away", id: "m_p6" } });
  assert.equal(judge(far), null);
  // 우리 수비가 뒤 (공 가진 상대보다 상대 골 쪽) — 태클할 수 없다
  const behind = scene({ home: { p2: [4, 6] }, away: { m_p6: [3, 6] }, ball: { side: "away", id: "m_p6" } });
  assert.equal(judge(behind), null);
  // 쉬는 (넘어진) 수비는 아님
  const rest = DANGER();
  rest.live.home.p2.restUntil = rest.turn + 1;
  assert.equal(judge(rest), null);
  // GK 가 공을 가지면 아님
  const gk = scene({ home: { p2: [13, 6] }, away: {}, ball: { side: "away", id: "m_p1" } });
  assert.equal(judge(gk), null);
});

test("필살기 장면: 준비 (게이지 가득) · 안 켬 · 지금 쓸 수 있음 → ult (같은 준비에 한 번) / 덜 참 · 켬 · 세이브는 아님", () => {
  // 팀 필살기 (아델린 p3) — 지금 상황은 늘. 공은 가운데 실루엔 (슈팅 · 크로스 · 위기 없음)
  const mk = (g) => scene({ home: { p4: [5, 6] }, ball: { side: "home", id: "p4" }, gauge: g });
  const ms = mk({ "home:p3": MAX });
  assert.deepEqual(judge(ms), { kind: "ult", side: "home", playerId: "p3", turn: ms.turn + 1, options: null });
  assert.deepEqual(ms.momentClock.ult, ["p3"]);
  // 간격이 지나도 같은 준비면 다시 묻지 않는다
  ms.momentClock.last = -100;
  assert.equal(judge(ms), null);
  // 게이지를 쓰면 (준비가 풀림) 다음 준비 때 다시
  ms.live.home.p3.gauge = 10;
  judge(ms);
  assert.deepEqual(ms.momentClock.ult, []);
  assert.equal(judge(mk({ "home:p3": MAX - 1 })), null, "덜 참");
  const armed = mk({ "home:p3": MAX });
  armed.live.home.p3.armed = true;
  assert.equal(judge(armed), null, "이미 켬 (예약)");
  assert.equal(judge(mk({ "home:p1": MAX })), null, "세이브는 늘 예약이라 장면 아님");
  // 슛 필살기: 필살 슛 거리 밖이면 아님 (슛 사거리 안이어도)
  const sf = scene({ home: { p7: [9, 6] }, ball: { side: "home", id: "p7" }, gauge: { "home:p7": MAX } });
  assert.ok(!(judge(sf) && judge(sf).kind === "ult"));
});

test("크로스 · 스루 찬스: 측면 크로스 자리에서 크로스 선택지 · 수비 뒤 띄운 공 → cross / 가운데 짧은 패스뿐이면 아님", () => {
  const ms = CROSS();
  assert.ok(hex.peekOptions(ms, data).opts.some((o) => o.action === "cross"), "크로스 선택지");
  assert.equal(judge(ms).kind, "cross");
  // 스루: 가운데 미드필더 → 2칸 앞이 빈 FW (떨어질 칸 자기 진영 열 ≥ 9)
  const th = scene({ home: { p4: [5, 6], p7: [9, 6] }, ball: { side: "home", id: "p4" }, moveAcc: 1 });
  const to = hex.peekOptions(th, data).opts.find((o) => o.lofted && o.receiverId === "p7" && o.target !== th.pos.home.p7);
  assert.ok(to, "수비 뒤 띄운 공 선택지");
  assert.equal(judge(th).kind, "cross");
  // 가운데 · 짧은 패스뿐 (같은 편이 바로 옆)
  const plain = scene({ home: { p4: [4, 6], p5: [4, 5] }, ball: { side: "home", id: "p4" } });
  assert.equal(judge(plain), null);
});

test("역습: 방금 턴에 태클 · 가로채기 · 공중볼로 공을 뺏었고 앞으로 가는 띄운 공이 있으면 counter / 뺏은 게 아니면 아님", () => {
  // 원정 m_p2 가 그레타 앞 (13,6) 에 — 수비 뒤 공간 (스루) 은 막히고, 그레타 발밑으로 가는 띄운 공만 (크로스 · 스루 장면이 아니다)
  const mk = () => scene({ home: { p2: [3, 6], p7: [10, 6] }, away: { m_p2: [13, 6] }, ball: { side: "home", id: "p2" } });
  const won = [{ turn: 40, type: "tackle", side: "home", tacklerId: "p2", success: true }];
  const ms = mk();
  assert.ok(hex.peekOptions(ms, data).opts.some((o) => o.lofted && G.cellCR(o.target)[0] > 3), "앞으로 가는 띄운 공");
  assert.equal(judge(ms, won).kind, "counter");
  assert.equal(judge(mk(), [{ turn: 40, type: "intercept", side: "home", defenderId: "p2", success: true }]).kind, "counter", "가로채기");
  assert.equal(judge(mk(), [{ turn: 40, type: "aerial", side: "away", success: false }]).kind, "counter", "상대 공중볼을 이김");
  assert.equal(judge(mk()), null, "뺏은 턴이 아님");
  assert.equal(judge(mk(), [{ turn: 40, type: "tackle", side: "home", success: false }]), null, "태클 실패");
  assert.equal(judge(mk(), [{ turn: 40, type: "tackle", side: "away", success: true }]), null, "상대가 뺏음");
});

test("합체기 장면: 우리 공 가진 선수가 합체기 대기 · 안 켬 → combo (10초 간격을 쓰지 않고 · 컷인 턴 뒤에도 · 같은 대기에 한 번)", () => {
  // 그레타가 필살 슛 거리 (4칸) 안 — 합체기 (메테오 슛) 가 이 턴에 터질 수 있다
  const ms = scene({ home: { p7: [11, 6] }, ball: { side: "home", id: "p7" } });
  const T = ms.turn + 1;
  ms.live.home.p7.combo = { passerId: "p4", skillId: "sk_wind_thread", name: "바람의 유성", until: T + 2 };
  ms.momentClock.last = T - 3; // 간격 안
  const cut = [{ turn: ms.turn, type: "cutin", side: "home", playerId: "p4" }];
  assert.deepEqual(judge(ms, cut), { kind: "combo", side: "home", playerId: "p7", turn: T, options: null });
  assert.equal(ms.momentClock.last, T - 3, "간격을 쓰지 않는다");
  assert.equal(ms.momentClock.combo, `p7:${T + 2}`);
  assert.equal(judge(ms), null, "같은 대기는 한 번");
  const armed = scene({ home: { p7: [8, 6] }, ball: { side: "home", id: "p7" } });
  armed.live.home.p7.combo = { passerId: "p4", skillId: "sk_wind_thread", name: "바람의 유성", until: armed.turn + 3 };
  armed.live.home.p7.armed = true;
  assert.notEqual((judge(armed) || {}).kind, "combo", "켰으면 아님");
  // 카드: ★ 합체기 (이름 · combo) 가 있다
  const v = hex.momentView(ms, data, { kind: "combo", side: "home", playerId: "p7" });
  const star = v.cards.find((c) => c.star);
  assert.ok(star && star.ult.combo && star.label.includes("바람의 유성"), JSON.stringify(star && star.ult));
});

/* ------------------------------------------------------------------ */
/* 스케줄러 · 우선순위 · 막는 턴                                            */
/* ------------------------------------------------------------------ */

test("스케줄러: 간격을 쓰는 장면은 25턴 (10초) 에 한 번 — 24턴 뒤 없음 · 25턴 뒤 있음", () => {
  const a = SHOT();
  a.momentClock.last = a.turn + 1 - 24;
  assert.equal(judge(a), null);
  assert.equal(a.momentClock.last, a.turn + 1 - 24, "간격 기록 그대로");
  const b = SHOT();
  b.momentClock.last = b.turn + 1 - 25;
  assert.equal(judge(b).kind, "shot");
  // 실제 경기: 간격을 쓰는 장면 사이는 늘 25턴 이상, 장면 턴 = 다음 턴, step 하면 지운다
  let n = 0;
  for (let k = 0; k < 4; k++) {
    const ms = hex.createMatch({ data: FULL, seed: `mo-gap-${k}`, home: SQ.home, away: SQ.away });
    let last = null;
    while (!ms.finished) {
      hex.step(ms, FULL);
      if (!ms.moment) continue;
      n++;
      assert.equal(ms.moment.turn, ms.turn + 1);
      assert.equal(ms.moment.side, "home", "사람 쪽만");
      if (ms.moment.kind === "combo") continue;
      if (last != null) assert.ok(ms.moment.turn - last >= 25, `간격 ${ms.moment.turn - last}`);
      last = ms.moment.turn;
      assert.equal(ms.momentClock.last, ms.moment.turn);
    }
  }
  assert.ok(n >= 20, `장면이 나온다 (${n})`);
});

test("우선순위: shot > danger > ult > cross > counter (같은 턴에 여럿이면 앞의 것)", () => {
  // shot > ult (그레타 슛 필살기 준비 · 필살 슛 거리 4칸 안)
  const s = SHOT();
  s.live.home.p7.gauge = MAX;
  s.live.home.p3.gauge = MAX;
  assert.equal(judge(s).kind, "shot");
  // danger > ult (팀 필살기 준비)
  const d = DANGER();
  d.live.home.p3.gauge = MAX;
  assert.equal(judge(d).kind, "danger");
  // ult > cross
  const u = CROSS({ gauge: { "home:p3": MAX } });
  assert.equal(judge(u).kind, "ult");
  // cross > counter (측면에서 방금 공을 뺏음)
  const c = CROSS();
  assert.equal(judge(c, [{ turn: 40, type: "intercept", side: "home", success: true }]).kind, "cross");
});

test("막는 턴: 골 · 킥오프 · 승부차기 이벤트 뒤 · 컷인 뒤 (합체기 빼고) · 승부차기 단계 · 끝난 경기 · 규칙 판 2 에는 장면 없음", () => {
  for (const type of ["goal", "kickoff", "penalties", "cutin", "combo"]) {
    const ms = SHOT();
    assert.equal(judge(ms, [{ turn: ms.turn, type }]), null, type);
    assert.equal(ms.momentClock.last, null, `${type}: 간격도 그대로`);
  }
  const pk = SHOT();
  pk.stage = "penalties";
  assert.equal(judge(pk), null);
  const fin = SHOT();
  fin.finished = true;
  assert.equal(judge(fin), null);
  const r2 = SHOT();
  r2.rules = 2;
  assert.equal(judge(r2), null);
  assert.equal(r2.moment, null);
  // 실제 경기: 골 · 킥오프가 있던 step 뒤에는 장면이 없다
  let goals = 0;
  for (let k = 0; k < 3; k++) {
    const ms = hex.createMatch({ data: FULL, seed: `mo-goal-${k}`, home: SQ.home, away: SQ.away, kind: "goal" });
    while (!ms.finished) {
      const n = ms.events.length;
      hex.step(ms, FULL);
      const ev = ms.events.slice(n);
      if (ev.some((e) => e.type === "goal" || e.type === "kickoff" || e.type === "penalties")) {
        goals++;
        assert.equal(ms.moment, null);
      }
      if (ms.stage === "penalties") assert.equal(ms.moment, null);
      if (ev.some((e) => e.type === "cutin") && ms.moment) assert.equal(ms.moment.kind, "combo");
    }
  }
  assert.ok(goals > 0);
  // 첫 턴 (시작 킥오프 — kickoff 이벤트가 없다) 뒤에도 없다: 게이지를 채워 필살기 장면이 날 판이라도 (2026-10-10 스크린샷 — 2:00 에 장면)
  let later = 0;
  for (let k = 0; k < 6; k++) {
    const ms = hex.createMatch({ data, seed: `mo-first-${k}`, home: SQ.home, away: SQ.away, kind: "goal" });
    const fill = () => { for (const lv of Object.values(ms.live.home)) if (typeof lv.gauge === "number") lv.gauge = MAX; };
    fill();
    hex.step(ms, data);
    assert.equal(ms.turn, 1);
    assert.equal(ms.moment, null, `첫 턴 뒤 ${k}`);
    fill();
    hex.step(ms, data);
    if (ms.moment) later++;
  }
  assert.ok(later > 0, "둘째 턴부터는 장면이 난다 (같은 게이지)");
});

test("⏸ 개입 (peekMoment manual): 간격 · 거리와 상관없이 다음 우리 공 가진 선수 · 수비의 결정, 상태는 그대로", () => {
  const mid = scene({ home: { p4: [4, 6], p5: [4, 5] }, ball: { side: "home", id: "p4" } });
  mid.momentClock.last = mid.turn; // 간격 안
  const before = JSON.stringify(mid);
  const mo = hex.peekMoment(mid, data, { manual: true });
  assert.deepEqual(mo, { kind: "attack", side: "home", playerId: "p4", turn: mid.turn + 1, options: null, manual: true });
  assert.equal(JSON.stringify(mid), before, "상태 그대로");
  assert.equal(hex.peekMoment(SHOT(), data, { manual: true }).kind, "shot");
  // 멀리서 (골까지 10칸) 상대 앞에 선 수비도
  const far = scene({ home: { p2: [8, 6] }, away: { m_p6: [9, 6] }, ball: { side: "away", id: "m_p6" } });
  assert.deepEqual(hex.peekMoment(far, data, { manual: true }), { kind: "danger", side: "home", playerId: "p2", turn: far.turn + 1, options: null, manual: true });
  // 결정할 사람이 없음 (상대 공 · 앞에 우리 수비 없음)
  assert.equal(hex.peekMoment(scene({ away: { m_p6: [9, 6] }, ball: { side: "away", id: "m_p6" } }), data, { manual: true }), null);
  // manual 이 아니면 state.moment
  const s = SHOT();
  judge(s);
  assert.equal(hex.peekMoment(s, data), s.moment);
  // ⏸ 개입 장면도 momentView 로 카드
  const v = hex.momentView(mid, data, mo);
  assert.ok(v.cards.length >= 2 && v.cards.some((c) => c.auto));
});

/* ------------------------------------------------------------------ */
/* momentView (카드)                                                     */
/* ------------------------------------------------------------------ */

test("momentView 순수: rngState · events · 상태 JSON 그대로 (실제 경기의 장면마다)", () => {
  let seen = 0;
  const ms = hex.createMatch({ data: FULL, seed: "mo-pure", home: SQ.home, away: SQ.away });
  while (!ms.finished && seen < 12) {
    hex.step(ms, FULL);
    if (!ms.moment) continue;
    const before = JSON.stringify(ms);
    const rng = ms.rngState;
    const nEv = ms.events.length;
    const v = hex.momentView(ms, FULL);
    assert.equal(ms.rngState, rng);
    assert.equal(ms.events.length, nEv);
    assert.equal(JSON.stringify(ms), before, `턴 ${ms.turn} ${ms.moment.kind}`);
    assert.ok(v && v.cards.length >= 2 && v.cards.length <= 4, `카드 ${v && v.cards.length}`);
    assert.equal(v.cards.filter((c) => c.auto).length, 1, "'자동' 카드는 하나");
    assert.equal(JSON.parse(JSON.stringify(v)).cards.length, v.cards.length, "JSON 만");
    seen++;
  }
  assert.ok(seen >= 8);
  assert.equal(hex.momentView(ms, FULL, null) === null || ms.moment !== null, true);
});

test("공격 카드: 갈래마다 하나 (슛 · 다가가기 · 패스 …) · 큰 % = 선택지 p · 패스 갈래는 받는 선수 상위 3 (▾) · '자동' = AI 선택 · 입력 = choice", () => {
  const ms = SHOT();
  judge(ms);
  const co = hex.peekOptions(ms, data);
  const v = hex.momentView(ms, data);
  assert.equal(v.kind, "shot");
  assert.equal(v.playerId, "p7");
  assert.equal(v.name, "그레타");
  assert.equal(v.autoKey, co.best.key);
  assert.equal(v.cards[0].kind, "shoot", "슈팅 장면 = 슛 먼저");
  const shoot = v.cards[0];
  assert.equal(shoot.p, co.opts.find((o) => o.key === "shoot").p, "큰 % = 엔진 슛 골 확률 그대로");
  assert.equal(shoot.pLabel, "골");
  assert.equal(shoot.estimate, false);
  assert.deepEqual(shoot.input, { choice: { side: "home", playerId: "p7", key: "shoot" } });
  const kinds = v.cards.map((c) => c.kind);
  assert.equal(new Set(kinds).size, kinds.length, "갈래마다 하나");
  for (const c of v.cards) {
    assert.ok(co.opts.some((o) => o.key === c.key), `카드 key 는 선택지: ${c.key}`);
    assert.ok(typeof c.label === "string" && c.label && typeof c.after === "string");
    if (c.receivers) {
      assert.ok(c.receivers.length >= 1 && c.receivers.length <= 3);
      assert.equal(new Set(c.receivers.map((r) => r.receiverId)).size, c.receivers.length, "받는 선수 겹치지 않음");
      assert.equal(c.receivers[0].key, c.key);
      assert.equal(c.estimate, true, "패스 갈래 = 추정");
      for (const r of c.receivers) assert.deepEqual(r.input, { choice: { side: "home", playerId: "p7", key: r.key } });
    }
  }
  assert.ok(v.cards.some((c) => c.auto && (c.key === co.best.key || (c.receivers || []).some((r) => r.key === co.best.key))));
  // 크로스 카드: "성공하면 헤더 골 n%"
  const cr = CROSS();
  judge(cr);
  const cv = hex.momentView(cr, data);
  const cross = cv.cards.find((c) => c.kind === "cross");
  assert.ok(cross && /헤더 골 \d+%/.test(cross.after), cross && cross.after);
  assert.equal(cv.cards[0].kind, "cross", "크로스 장면 = 크로스 먼저");
});

test("수비 카드: 압박 · 패스길 막기 · 물러서기 + 성향 칩, '자동' = AI 수비 자세 규칙 (입력 없음 — 입력 없이 step 하면 그 자세)", () => {
  const ms = DANGER();
  judge(ms);
  const v = hex.momentView(ms, data);
  assert.deepEqual(v.cards.map((c) => c.key), ["press", "block", "drop"]);
  assert.equal(v.carrier.id, "m_p6");
  assert.equal(v.tendency.type, "dribble", "울리카 = 드리블 700 > 패스 369");
  assert.equal(v.tendency.label, "드리블형");
  for (const c of v.cards) assert.deepEqual(c.input, c.auto ? null : { defend: { side: "home", playerId: "p2", mode: c.key } }, c.key);
  assert.equal(v.cards.filter((c) => c.auto).length, 1);
  // % 이름은 짧게 (폰 글자 — 조건은 둘째 줄)
  assert.ok(v.cards[0].p > 0 && v.cards[0].p < 1 && v.cards[0].pLabel === "뺏기" && v.cards[0].after.startsWith("드리블하면"));
  assert.ok(v.cards[1].pLabel === "가로채기" && v.cards[1].estimate && v.cards[1].after.includes("패스길"));
  assert.equal(v.cards[1].receiverSide, "away", "패스길 막기의 받는 선수 = 상대");
  assert.ok(v.cards[2].pLabel === "슛 실점" && v.cards[2].after.includes("골 앞"));
  const auto = v.cards.find((c) => c.auto);
  hex.step(ms, data);
  const st = evs(ms, "stance")[0];
  assert.deepEqual([st.side, st.playerId, st.mode, st.by], ["home", "p2", auto.key, "ai"], "안 누르면 '자동' 자세 그대로");
});

/* ------------------------------------------------------------------ */
/* choice 입력                                                           */
/* ------------------------------------------------------------------ */

test("choice 입력: 고른 선택지 그대로 (받는 선수 · 노린 칸) · choice 이벤트 · 한 턴만 · 낡으면 (다른 선수 · 없는 key · 공이 바뀜) 무시", () => {
  const base = SHOT();
  const co = hex.peekOptions(base, data);
  const pick = co.opts.find((o) => o.action === "pass" && o.key !== co.best.key);
  assert.ok(pick, "AI 가 안 고를 패스");
  const a = clone(base);
  stepWith(a, { roll: () => true, input: { choice: { side: "home", playerId: "p7", key: pick.key } } });
  const pe = evs(a, "pass")[0];
  assert.ok(pe, "패스가 나갔다");
  assert.equal(pe.to, pick.receiverId);
  assert.equal(pe.intended, pick.target);
  assert.deepEqual(evs(a, "choice").map((e) => [e.side, e.playerId, e.key, e.auto]), [["home", "p7", pick.key, false]]);
  // 낡은 입력은 입력 없음과 같은 경기
  const none = stepWith(clone(base), { roll: () => true });
  for (const choice of [{ side: "home", playerId: "p6", key: pick.key }, { side: "home", playerId: "p7", key: "pass:p6:999" }, { side: "away", playerId: "p7", key: "shoot" }, { side: "home", playerId: "p7" }]) {
    const b = stepWith(clone(base), { roll: () => true, input: { choice } });
    assert.equal(JSON.stringify(b), JSON.stringify(none), `무시: ${JSON.stringify(choice)}`);
  }
  // 상대 공일 때의 choice 도 무시
  const d = DANGER();
  const dn = stepWith(clone(d), { roll: () => true });
  assert.equal(JSON.stringify(stepWith(clone(d), { roll: () => true, input: { choice: { side: "home", playerId: "p2", key: "hold" } } })), JSON.stringify(dn));
  // '자동' 카드를 골라도 같은 경기 (choice 이벤트만 더)
  const auto = stepWith(clone(base), { roll: () => true, input: { choice: { side: "home", playerId: "p7", key: co.best.key } } });
  assert.deepEqual(evs(auto, "choice").map((e) => e.auto), [true]);
  const strip = (s) => JSON.stringify({ ...s, events: s.events.filter((e) => e.type !== "choice") });
  assert.equal(strip(auto), strip(none));
});

test("중거리 슛 (결정 26): AI 기준 밖이어도 사거리 안이면 'shoot' 선택지 (ai: false) — 고르면 슛, 안 고르면 AI 는 안 쏜다", () => {
  let found = null;
  for (const c of [9, 10, 11]) {
    for (const r of [5, 6, 7]) {
      const ms = scene({ home: { p6: [c, r], p4: [c - 2, r - 3] }, ball: { side: "home", id: "p6" } });
      const sh = hex.peekOptions(ms, data).opts.find((o) => o.key === "shoot");
      if (sh && sh.ai === false) found = found || ms;
    }
  }
  assert.ok(found, "AI 기준 밖 중거리 슛 자리");
  const co = hex.peekOptions(found, data);
  assert.notEqual(co.best.action, "shoot");
  const a = stepWith(clone(found), { input: { choice: { side: "home", playerId: "p6", key: "shoot" } } });
  assert.equal(evs(a, "shot").length, 1, "고르면 슛");
  assert.equal(evs(a, "shot")[0].playerId, "p6");
  const b = stepWith(clone(found), {});
  assert.equal(evs(b, "shot").length, 0, "자동은 안 쏜다");
  const v = hex.momentView(found, data, { kind: "shot", side: "home", playerId: "p6" });
  const card = v.cards.find((c) => c.key === "shoot");
  assert.ok(card && !card.auto && card.after.includes("자동이면 안 쏘는"), card && card.after);
});

test("★ 카드: 준비된 필살기를 고르면 켜고 이 턴에 터진다 (슛 · 필살 수비) — 입력 = ultimates arm + choice / defend", () => {
  const ms = SHOT();
  ms.live.home.p7.gauge = MAX;
  judge(ms);
  const v = hex.momentView(ms, data);
  const star = v.cards.find((c) => c.star);
  assert.ok(star, "★ 카드");
  assert.equal(star.ult.type, "shot");
  assert.equal(star.label, "★ 메테오 슛");
  assert.deepEqual(star.input.ultimates, [{ side: "home", playerId: "p7", op: "arm" }]);
  assert.equal(star.input.choice.key, "shoot");
  assert.ok(star.p > v.cards.find((c) => c.key === "shoot").p, "★ 슛 골 확률이 더 높다");
  assert.ok(v.cards.length <= 4);
  stepWith(ms, { roll: () => false, input: star.input });
  assert.deepEqual(evs(ms, "cutin").map((e) => [e.side, e.playerId, e.ultimateType]), [["home", "p7", "shot"]]);
  assert.equal(evs(ms, "shot")[0].playerId, "p7");
  // 필살 수비 (도르비나 산맥 쐐기) — 수비 위기에서 ★ = 켜고 압박
  const d = DANGER();
  d.live.home.p2.gauge = MAX;
  judge(d);
  const dv = hex.momentView(d, data);
  const ds = dv.cards.find((c) => c.star);
  assert.ok(ds && ds.ult.type === "defense");
  assert.deepEqual(ds.input, { ultimates: [{ side: "home", playerId: "p2", op: "arm" }], defend: { side: "home", playerId: "p2", mode: "press" } });
  stepWith(d, { roll: () => true, decide: { action: "dribble" }, input: ds.input });
  assert.equal(evs(d, "cutin")[0].playerId, "p2", "필살 수비 발동");
  assert.equal(evs(d, "tackle")[0].tacklerId, "p2");
  // 팀 필살기 장면: ★ 발동 · 아끼기 (자동, 입력 없음)
  const t = scene({ home: { p4: [5, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p3": MAX } });
  judge(t);
  const tv = hex.momentView(t, data);
  assert.deepEqual(tv.cards.map((c) => [c.key, c.star, c.auto]), [["ult:p3", true, false], ["auto", false, true]]);
  assert.equal(tv.cards[1].input, null);
  hex.step(t, data, tv.cards[0].input);
  assert.equal(evs(t, "cutin")[0].ultimateType, "team");
});

/* ------------------------------------------------------------------ */
/* 수비 자세                                                              */
/* ------------------------------------------------------------------ */

test("defend 입력: press = 그 수비가 태클 · block = 태클 없이 가장 위험한 패스길로 · drop = 태클 없이 골 쪽으로 한 칸 · 잘못된 입력은 AI 규칙", () => {
  const dribble = { action: "dribble", target: id(2, 6) };
  const mk = () => DANGER({ opts: { moveAcc: 1 } });
  const press = stepWith(mk(), { roll: () => true, decide: dribble, input: { defend: { side: "home", playerId: "p2", mode: "press" } } });
  assert.equal(evs(press, "tackle")[0].tacklerId, "p2");
  assert.deepEqual(evs(press, "stance").map((e) => [e.playerId, e.mode, e.by]), [["p2", "press", "input"]]);
  // block: 태클 없음 · 공 가진 선수 → 가장 위험한 받는 선수 (m_p7 — 골에 가장 가까운) 직선 쪽으로
  const b0 = mk();
  const lane = G.line(b0.pos.away.m_p6, b0.pos.away.m_p7, -1).slice(1, -1);
  const block = stepWith(b0, { roll: () => true, decide: dribble, input: { defend: { side: "home", playerId: "p2", mode: "block" } } });
  assert.ok(!evs(block, "tackle").some((e) => e.tacklerId === "p2"), "태클 없음");
  assert.ok(lane.some((c) => G.distance(c, block.pos.home.p2) <= G.distance(c, id(2, 6))), "패스길 쪽으로");
  assert.equal(block.live.home.p2.restUntil, -1, "넘어지지 않는다");
  // drop: 태클 없음 · 우리 골까지 한 칸 줄어든다
  const dr0 = mk();
  const before = G.distToGoal(dr0.pos.home.p2, -1);
  const drop = stepWith(dr0, { roll: () => true, decide: dribble, input: { defend: { side: "home", playerId: "p2", mode: "drop" } } });
  assert.ok(!evs(drop, "tackle").some((e) => e.tacklerId === "p2"));
  assert.equal(G.distToGoal(drop.pos.home.p2, -1), before - 1, "골 쪽으로 한 칸");
  assert.equal(drop.live.home.p2.restUntil, -1);
  // 잘못된 입력 (공격 쪽 · 없는 자세 · 없는 선수 · 넘어진 선수) → AI 규칙
  for (const defend of [{ side: "away", playerId: "m_p6", mode: "drop" }, { side: "home", playerId: "p2", mode: "tackle" }, { side: "home", playerId: "zz", mode: "drop" }]) {
    const m = stepWith(mk(), { roll: () => true, decide: dribble, input: { defend } });
    assert.equal(evs(m, "stance")[0].by, "ai", JSON.stringify(defend));
  }
  // 위기가 아니어도 (⏸ 개입) 입력은 받는다 — 멀리서 상대 앞 수비
  const far = scene({ home: { p2: [8, 6] }, away: { m_p6: [9, 6] }, ball: { side: "away", id: "m_p6" } });
  stepWith(far, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "drop" } } });
  assert.deepEqual(evs(far, "stance").map((e) => [e.mode, e.by]), [["drop", "input"]]);
  assert.equal(evs(far, "tackle").length, 0);
});

test("수비 자세 AI 규칙 (양 팀): 패스형 → 막기 · 마지막 수비 → 물러서기 · 드리블형인데 질 것 같으면 물러서기 · 그 밖 압박 · 필살 수비 켬 → 압박 · aiStance 0 → 압박", () => {
  const stanceOf = (ms, d = data) => {
    stepWith(ms, { roll: () => true, decide: { action: "hold" }, d });
    const e = evs(ms, "stance");
    return e.length ? e[0].mode : null;
  };
  const cover = { p3: [1, 5] }; // 막는 수비 뒤 (골 쪽) 동료
  // 패스형 (패스 900 > 드리블 300)
  assert.equal(stanceOf(DANGER({ home: cover, opts: { stats: { "away:m_p6": { pass: 900, dribble: 300, shoot: 200 } } } })), "block");
  // 마지막 수비 (뒤에 동료 없음) · 드리블형
  assert.equal(stanceOf(DANGER({ opts: { stats: { "away:m_p6": { pass: 300, dribble: 600, shoot: 200 } } } })), "drop");
  // 동료가 있고 드리블형 · 공 지킬 확률 낮음 (드리블 400 vs 도르비나 수비 890) → 압박
  assert.equal(stanceOf(DANGER({ home: cover, opts: { stats: { "away:m_p6": { pass: 300, dribble: 400, shoot: 200 } } } })), "press");
  // 동료가 있어도 드리블형 · 공 지킬 확률 ≥ stanceKeepP (드리블 1000 vs 약한 수비) → 물러서기
  assert.equal(stanceOf(DANGER({ home: cover, opts: { stats: { "away:m_p6": { pass: 300, dribble: 1000, shoot: 200 }, "home:p2": { defense: 150, physical: 150 } } } })), "drop");
  // 슈터 (사거리 안 · 슛 ≥ 드리블 · 패스) · 동료 있음 → 압박
  assert.equal(stanceOf(DANGER({ home: cover, opts: { stats: { "away:m_p6": { pass: 300, dribble: 400, shoot: 900 } } } })), "press");
  // 필살 수비를 켠 수비는 늘 압박 (마지막 수비여도)
  const armed = DANGER({ opts: { stats: { "away:m_p6": { pass: 300, dribble: 600, shoot: 200 } }, gauge: { "home:p2": MAX } } });
  armed.live.home.p2.armed = true;
  assert.equal(stanceOf(armed), "press");
  // aiStance 0 → 압박 (H3 그대로)
  assert.equal(stanceOf(DANGER({ opts: { d: NOSTANCE, stats: { "away:m_p6": { pass: 900, dribble: 300, shoot: 200 } } } }), NOSTANCE), "press");
  // 원정 (AI 쪽) 도 같은 규칙: 우리 패스형 공격수가 상대 골 앞 → 원정 수비 막기
  const away = scene({ home: { p4: [11, 6], p7: [12, 9] }, away: { m_p2: [12, 6], m_p3: [13, 5] }, ball: { side: "home", id: "p4" } });
  stepWith(away, { roll: () => true, decide: { action: "hold" } });
  assert.deepEqual(evs(away, "stance").map((e) => [e.side, e.playerId, e.mode, e.by]), [["away", "m_p2", "block", "ai"]]);
  // 위기가 아니면 자세 없음
  const calm = scene({ home: { p2: [8, 6] }, away: { m_p6: [9, 6] }, ball: { side: "away", id: "m_p6" } });
  assert.equal(stanceOf(calm), null);
});

test("수비 자세는 공 가진 쪽이 모르고 고른다: 같은 판에서 자세 입력이 달라도 공 가진 선수의 선택 (선택지 · AI 선택) 은 같다", () => {
  // 패스형 상대 + 골 앞 동료 (AI 는 패스) · 드리블형 상대 + 동료 멀리 (AI 는 드리블 · 지키기) 두 판 — 자세 3가지 모두 같은 행동 (패스면 같은 받는 선수 · 칸)
  const wanted = new Set();
  for (const [stats, m7] of [[{ pass: 900, dribble: 200, shoot: 200 }, [2, 9]], [{ pass: 200, dribble: 900, shoot: 200 }, [9, 0]]]) {
    const mk = () => DANGER({ away: { m_p7: m7 }, opts: { stats: { "away:m_p6": stats } } });
    const best = hex.peekOptions(mk(), data).best;
    wanted.add(best.action);
    for (const mode of hex.STANCES) {
      const ms = mk();
      const n = ms.events.length;
      stepWith(ms, { roll: () => true, input: { defend: { side: "home", playerId: "p2", mode } } });
      const ev = ms.events.slice(n);
      const pass = ev.find((e) => e.type === "pass");
      if (best.action === "pass" || best.action === "cross") {
        assert.ok(pass && pass.to === best.receiverId && pass.intended === best.target, `${mode}: AI 패스 그대로`);
      } else {
        assert.ok(!pass && !ev.some((e) => e.type === "shot"), `${mode}: ${best.action} 그대로 (패스 · 슛 없음)`);
        if (best.action === "dribble" && mode === "press") assert.equal(ev.find((e) => e.type === "tackle").tacklerId, "p2");
      }
    }
  }
  assert.ok(wanted.has("pass") && wanted.size === 2, [...wanted].join(","));
});

/* ------------------------------------------------------------------ */
/* 2골 선승 (결정 27)                                                     */
/* ------------------------------------------------------------------ */

test("2골 선승: 2골째 골 장면 뒤 킥오프 없이 바로 끝 (end reason goals) · 결과 모양 그대로 · goalsToWin 0 · 규칙 판 2 면 계속", () => {
  const mk = (d = data, rules = 3) => {
    const ms = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, score: { home: 1, away: 0 }, d });
    ms.rules = rules;
    return ms;
  };
  const ms = stepWith(mk(), { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(ms.finished, true);
  assert.deepEqual(ms.score, { home: 2, away: 0 });
  const end = evs(ms, "end")[0];
  assert.deepEqual([end.winner, end.reason, end.turn], ["home", "goals", 41]);
  assert.equal(evs(ms, "kickoff").length, 0, "킥오프 없음");
  const r = hex.getResult(ms);
  assert.equal(r.winner, "home");
  assert.equal(r.turnsPlayed, 41);
  assert.equal(r.stage, "regular");
  assert.equal(ms.moment, null);
  // 원정이 2골째
  const aw = scene({ away: { m_p7: [2, 6] }, ball: { side: "away", id: "m_p7" }, score: { home: 1, away: 1 } });
  stepWith(aw, { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(aw.finished, true);
  assert.equal(hex.getResult(aw).winner, "away");
  // 1골째는 킥오프
  const one = stepWith(scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" } }), { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(one.finished, false);
  assert.equal(evs(one, "kickoff").length, 1);
  // goalsToWin 0 · 규칙 판 2 → 2골째에도 킥오프 (300턴까지)
  for (const [d, rules] of [[FULL, 3], [data, 2]]) {
    const m = stepWith(mk(d, rules), { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" }, d });
    assert.equal(m.finished, false, `rules ${rules}`);
    assert.equal(evs(m, "kickoff").length, 1);
  }
});

test("2골 선승 · 추가시간 / 골든골: 추가시간에 앞선 팀 2골째 → 끝 (addedTime.reason goal) · 골든골은 첫 골 · 300턴 동점은 그대로 (골 매치 골든골 · 친선 무승부)", () => {
  const add = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, score: { home: 1, away: 0 }, turn: 305, kind: "goal" });
  add.stage = "addedTime";
  add.stageEndTurn = 325;
  add.addedTime = { side: "away", startTurn: 300, endTurn: null, reason: null };
  stepWith(add, { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(add.finished, true);
  assert.deepEqual([add.stage, add.addedTime.reason, add.addedTime.endTurn], ["regular", "goal", 306]);
  assert.equal(evs(add, "end")[0].reason, "goals");
  const gg = scene({ home: { p7: [12, 6] }, ball: { side: "home", id: "p7" }, score: { home: 1, away: 1 }, turn: 320, kind: "goal" });
  gg.stage = "goldenGoal";
  gg.stageEndTurn = 375;
  stepWith(gg, { roll: (k) => (k === "shot" ? true : undefined), decide: { action: "shoot" } });
  assert.equal(gg.finished, true);
  assert.equal(gg.stage, "goldenGoal");
  assert.equal(evs(gg, "end")[0].reason, undefined, "골든골 결승골은 원래 규칙");
  // 300턴 동점: 골 매치 → 골든골, 친선 → 무승부
  for (const [kind, want] of [["goal", "goldenGoal"], ["friendly", "end"]]) {
    const t = scene({ home: { p4: [5, 6] }, ball: { side: "home", id: "p4" }, score: { home: 1, away: 1 }, turn: 299, kind });
    stepWith(t, { decide: { action: "hold" } });
    assert.ok(evs(t, want).length === 1, `${kind} → ${want}`);
    if (kind === "friendly") assert.equal(hex.getResult(t).winner, "draw");
    else assert.equal(t.finished, false);
  }
});

/* ------------------------------------------------------------------ */
/* 재생 · 판 2                                                            */
/* ------------------------------------------------------------------ */

/** 결정 ON 플레이어 흉내: 장면마다 '자동' 이 아닌 카드 (있으면 첫째 — ★ 포함) 를 고르고, 입력 기록 [i, side, playerId, op, payload?] 을 남긴다 */
function playChoosing(seed, d = data) {
  const ms = hex.createMatch({ data: d, seed, home: SQ.home, away: SQ.away, kind: "goal" });
  const log = [];
  let i = 0;
  while (!ms.finished) {
    let input = null;
    if (ms.moment) {
      const v = hex.momentView(ms, d);
      const c = v.cards.find((x) => !x.auto && x.input) || v.cards.find((x) => x.input);
      if (c) {
        input = c.input;
        for (const u of input.ultimates || []) log.push([i, u.side, u.playerId, u.op]);
        if (input.choice) log.push([i, input.choice.side, input.choice.playerId, "choose", input.choice.key]);
        if (input.defend) log.push([i, input.defend.side, input.defend.playerId, "defend", input.defend.mode]);
      }
    }
    hex.step(ms, d, input);
    i++;
  }
  return { ms, log, steps: i };
}

test("재생: choose · defend (+ arm) 입력 기록을 같은 step 에 다시 넣으면 (hexReplay) 같은 경기 · 중간 저장 뒤 이어도 같다 · 입력이 경기를 바꾼다", () => {
  const a = playChoosing("mo-replay", FULL);
  const ops = new Set(a.log.map((x) => x[3]));
  assert.ok(ops.has("choose") && ops.has("defend"), `입력 종류 ${[...ops]}`);
  assert.ok(evs(a.ms, "choice").length > 0 && evs(a.ms, "stance").some((e) => e.by === "input"));
  const fresh = () => hex.createMatch({ data: FULL, seed: "mo-replay", home: SQ.home, away: SQ.away, kind: "goal" });
  const r = SCR.hexReplay(hex, fresh(), FULL, { steps: a.steps, inputs: a.log });
  assert.equal(JSON.stringify(r), JSON.stringify(a.ms), "재생 기록 → 같은 끝 상태");
  // 중간까지 → JSON 으로 저장 → 남은 입력으로 이어서
  const half = Math.floor(a.steps / 2);
  const mid = JSON.parse(JSON.stringify(SCR.hexReplay(hex, fresh(), FULL, { steps: half, inputs: a.log })));
  for (let i = half; i < a.steps && !mid.finished; i++) hex.step(mid, FULL, SCR.hexStepInput(a.log.filter((x) => x[0] === i)));
  assert.equal(JSON.stringify(mid), JSON.stringify(a.ms));
  // 입력 없이 = 다른 경기
  const none = SCR.hexReplay(hex, fresh(), FULL, { steps: a.steps, inputs: [] });
  assert.notEqual(JSON.stringify(none.events), JSON.stringify(a.ms.events));
  // hexStepInput: 한 step 의 줄들 → step 입력
  assert.deepEqual(SCR.hexStepInput([[3, "home", "p7", "arm"], [3, "home", "p7", "choose", "shoot"], [3, "home", "p2", "defend", "drop"]]),
    { ultimates: [{ side: "home", playerId: "p7", op: "arm" }], choice: { side: "home", playerId: "p7", key: "shoot" }, defend: { side: "home", playerId: "p2", mode: "drop" } });
  assert.equal(SCR.hexStepInput([]), null);
  assert.equal(SCR.hexStepInput(undefined), null);
});

test("판 2 재생 기록 (H3 — 시드 + arm/disarm): createMatch rules 2 로 되살리면 그때 규칙 그대로 (2골 선승 · 수비 자세 · 장면 없음) 같은 경기", () => {
  const ms = hex.createMatch({ data, seed: "mo-v2", home: SQ.home, away: SQ.away, kind: "goal", rules: 2 });
  const log = [];
  let i = 0;
  while (!ms.finished) {
    const ups = [];
    for (const u of hex.ultimateList(ms, data, "home")) if (u.has && !u.armed && u.ready && ms.stage !== "penalties") ups.push({ side: "home", playerId: u.playerId, op: "arm" });
    for (const u of ups) log.push([i, u.side, u.playerId, u.op]);
    hex.step(ms, data, ups.length ? { ultimates: ups } : null);
    assert.equal(ms.moment, null, "장면 없음");
    i++;
  }
  assert.ok(ms.turn >= 300, "2골 선승 없이 300턴");
  assert.equal(evs(ms, "stance").length, 0, "수비 자세 없음");
  assert.ok(ms.stats.home.ultimatesUsed > 0);
  const v2 = { version: 2, seed: "mo-v2", steps: i, inputs: log };
  const back = SCR.hexReplay(hex, hex.createMatch({ data, seed: "mo-v2", home: SQ.home, away: SQ.away, kind: "goal", rules: 2 }), data, v2);
  assert.equal(JSON.stringify(back), JSON.stringify(ms));
  // 지금 규칙 (3) 으로 되살리면 다른 경기 — 그래서 store.loadHexMatch 가 판 1 · 2 에 rules: 2 를 붙인다
  const now = SCR.hexReplay(hex, hex.createMatch({ data, seed: "mo-v2", home: SQ.home, away: SQ.away, kind: "goal" }), data, v2);
  assert.notEqual(JSON.stringify(now.events), JSON.stringify(ms.events));
});

test("결정성: 같은 시드 = 같은 경기 (장면 · 수비 자세 포함) · simulateAuto 는 사람 쪽도 AI (입력 없음 — 자세 이벤트는 모두 ai)", () => {
  const a = hex.simulateAuto(hex.createMatch({ data, seed: "mo-det", home: SQ.home, away: SQ.away, kind: "goal" }), data);
  const b = hex.simulateAuto(hex.createMatch({ data, seed: "mo-det", home: SQ.home, away: SQ.away, kind: "goal" }), data);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(evs(a, "stance").length > 0 && evs(a, "stance").every((e) => e.by === "ai"));
  assert.equal(evs(a, "choice").length, 0);
});

/* ------------------------------------------------------------------ */
/* H3.5 리뷰 고침 (2026-10-10)                                             */
/* ------------------------------------------------------------------ */

test("패스길 막기 · 물러서기 자리는 공 가진 상대가 그 턴 패스해도 (공이 떠나도) 그 자리로 — 압박과 다른 칸 · 그 길의 가로채기 굴림", () => {
  // 울리카 (m_p6) → 마리엘라 (m_p7) 패스 길 옆으로 도르비나가 한 칸 — 압박이면 마크 자리
  const mk = () => scene({ home: { p2: [2, 5] }, away: { m_p6: [4, 6], m_p7: [1, 10] }, ball: { side: "away", id: "m_p6" }, moveAcc: 1 });
  const pass = { action: "pass", receiverId: "m_p7" };
  const run = (mode) => stepWith(mk(), { roll: () => false, decide: pass, input: { defend: { side: "home", playerId: "p2", mode } } });
  const press = run("press");
  const block = run("block");
  const m0 = mk();
  const lane = G.line(m0.pos.away.m_p6, m0.pos.away.m_p7, -1).slice(1, -1);
  assert.ok(evs(block, "pass").length === 1 && evs(press, "pass").length === 1, "둘 다 패스");
  assert.deepEqual(evs(block, "stance").map((e) => [e.playerId, e.mode, e.by]), [["p2", "block", "input"]]);
  assert.notEqual(block.pos.home.p2, press.pos.home.p2, "패스 턴에도 압박과 다른 칸 (예전: 늘 같았다)");
  const near = (cell) => Math.min(...lane.map((c) => G.distance(c, cell)));
  assert.ok(near(block.pos.home.p2) <= 1 && near(block.pos.home.p2) < near(press.pos.home.p2), "패스길 위 · 옆으로");
  assert.ok(evs(block, "intercept").some((e) => e.defenderId === "p2"), "그 길에서 가로채기 굴림");
  assert.ok(!evs(press, "intercept").some((e) => e.defenderId === "p2"));
  // 물러서기: 패스 턴에도 골 쪽으로 한 칸
  const drop = run("drop");
  assert.equal(G.distToGoal(drop.pos.home.p2, -1), G.distToGoal(m0.pos.home.p2, -1) - 1, "골 쪽으로 한 칸");
});

test("고른 자세는 그 상대 공격 동안 이어진다 (stanceHoldTurns — stance by hold) · 공이 넘어오면 · 시간이 다 되면 끝 · AI 규칙 자세는 그 턴만", () => {
  const D0 = hex.HEX_DEFAULTS.stanceHoldTurns;
  assert.ok(D0 > 1);
  const ms = DANGER({ opts: { moveAcc: 1 } });
  stepWith(ms, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "drop" } } });
  assert.deepEqual(ms.stanceHold, { side: "home", id: "p2", mode: "drop", until: ms.turn + D0 - 1 });
  // 다음 턴: 입력 없이도 같은 자세 (by hold)
  const e0 = ms.events.length;
  stepWith(ms, { roll: () => true, decide: { action: "hold" } });
  assert.deepEqual(ms.events.slice(e0).filter((e) => e.type === "stance").map((e) => [e.playerId, e.mode, e.by]), [["p2", "drop", "hold"]]);
  assert.ok(!ms.events.slice(e0).some((e) => e.type === "tackle" && e.tacklerId === "p2"), "이어진 물러서기 = 태클 없음");
  // 끝까지 이어지면 끝
  const t = DANGER({ opts: { moveAcc: 1 } });
  stepWith(t, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "block" } } });
  for (let i = 1; i < D0 && t.stanceHold; i++) stepWith(t, { roll: () => true, decide: { action: "hold" } });
  assert.equal(t.stanceHold, null, "stanceHoldTurns 턴 뒤 끝");
  // 공이 넘어오면 끝
  const w = DANGER({ opts: { moveAcc: 1 } });
  stepWith(w, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "block" } } });
  assert.ok(w.stanceHold);
  w.ball = { holder: { side: "home", id: "p2" }, cell: w.pos.home.p2, flight: null, loose: false, holdStreak: 0 };
  stepWith(w, { roll: () => true, decide: { action: "hold" } });
  assert.equal(w.stanceHold, null, "막던 팀이 공을 가졌다");
  // AI 규칙 자세 (입력 없음) 는 이어지지 않는다 · 규칙 판 2 는 자세가 없다
  const a = DANGER({ opts: { moveAcc: 1 } });
  stepWith(a, { roll: () => true, decide: { action: "hold" } });
  assert.equal(evs(a, "stance")[0].by, "ai");
  assert.equal(a.stanceHold, null);
  const r2 = DANGER({ opts: { moveAcc: 1 } });
  r2.rules = 2;
  stepWith(r2, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "drop" } } });
  assert.equal(evs(r2, "stance").length, 0);
  assert.equal(r2.stanceHold, null);
  // stanceHoldTurns 1 = 그 턴만
  const one = { ...data, config: { ...cfg, hexMatch: { stanceHoldTurns: 1 } } };
  const o = DANGER({ opts: { moveAcc: 1, d: one } });
  stepWith(o, { roll: () => true, decide: { action: "hold" }, input: { defend: { side: "home", playerId: "p2", mode: "drop" } }, d: one });
  assert.equal(o.stanceHold, null);
});

test("합체기 ★: 이 턴에 안 터지면 (필살 슛 거리 밖 · 낙뢰는 박스 밖) 예약만 하는 ★ (켜기만 — 이 턴 컷인 없음, 켠 채로) · 거리 안이면 바로 발동", () => {
  const combo = (ms, name = "바람의 유성", skillId = "sk_wind_thread") => {
    ms.live.home.p7.combo = { passerId: "p4", skillId, name, until: ms.turn + 3 };
    return judge(ms);
  };
  // 필살 슛 거리 (그레타 4칸) 밖 — 5칸 (보통 슛 사거리 안) · 6칸
  for (const col of [9, 8]) {
    const ms = scene({ home: { p7: [col, 6], p6: [col - 1, 3] }, ball: { side: "home", id: "p7" } });
    assert.equal(combo(ms).kind, "combo");
    const v = hex.momentView(ms, data);
    const star = v.cards.find((c) => c.star);
    assert.ok(star, `열 ${col}: ★ (예약)`);
    assert.equal(star.reserve, true);
    assert.ok(star.ult.combo && star.label.includes("바람의 유성"));
    assert.deepEqual(star.input, { ultimates: [{ side: "home", playerId: "p7", op: "arm" }] }, "choice 없음 — 이 턴은 AI 그대로");
    assert.equal(star.after, "예약 — 슛 거리에서 발동");
    assert.equal(star.p, null);
    stepWith(ms, { roll: () => false, input: star.input });
    assert.equal(evs(ms, "cutin").length, 0, "이 턴에는 터지지 않는다");
    if (ms.ball.holder && ms.ball.holder.id === "p7") assert.equal(ms.live.home.p7.armed, true, "켠 채로");
  }
  // 낙뢰 (minLine 3 — 박스 슛만): 필살 슛 거리 안이어도 박스 밖이면 예약
  const tb = scene({ home: { p7: [11, 6], p6: [10, 3] }, ball: { side: "home", id: "p7" } });
  tb.home.players.find((p) => p.id === "p7").skillIds = ["sk_thunderbolt"];
  assert.equal(combo(tb, "풍뢰일섬").kind, "combo");
  const sv = hex.momentView(tb, data).cards.find((c) => c.star);
  assert.ok(sv && sv.reserve && sv.after === "예약 — 박스 안에서 발동", JSON.stringify(sv));
  // 박스 안이면 바로 발동 (choice = 슛)
  const tin = scene({ home: { p7: [13, 6], p6: [10, 3] }, ball: { side: "home", id: "p7" } });
  tin.home.players.find((p) => p.id === "p7").skillIds = ["sk_thunderbolt"];
  combo(tin, "풍뢰일섬");
  const si = hex.momentView(tin, data).cards.find((c) => c.star);
  assert.ok(si && !si.reserve && si.input.choice.key === "shoot", JSON.stringify(si && si.input));
  stepWith(tin, { roll: () => false, input: si.input });
  assert.ok(evs(tin, "cutin").length + evs(tin, "combo").length > 0, "그 턴에 터진다");
});

test("수비 위기 장면은 골 앞 (momentDangerDist) 만 · 공 가진 상대가 어차피 슛하면 멈추지 않는다 — AI 자세 규칙은 dangerDist 그대로", () => {
  assert.ok(D.momentDangerDist < D.dangerDist);
  // 골까지 6칸 (dangerDist 7 안 · momentDangerDist 5 밖): 장면 없음, AI 자세는 있다
  const mkFar = () => scene({ home: { p2: [5, 6] }, away: { m_p6: [6, 6] }, ball: { side: "away", id: "m_p6" } });
  const far = mkFar();
  assert.equal(judge(far), null);
  const wide = { ...data, config: { ...cfg, hexMatch: { momentDangerDist: 7 } } };
  assert.equal((judge(mkFar(), [], wide) || {}).kind, "danger", "거리만 넓히면 장면");
  stepWith(far, { roll: () => true, decide: { action: "hold" } });
  assert.equal(evs(far, "stance").length, 1, "AI 자세 규칙은 그대로");
  // 골 앞에서 상대가 이 턴 쏠 판 (AI 선택 = 슛): 자세가 결과를 바꾸지 않는다 → 장면 없음 (⏸ 개입은 연다)
  const sh = scene({ home: { p2: [1, 6] }, away: { m_p7: [2, 6] }, ball: { side: "away", id: "m_p7" } });
  assert.equal(hex.peekOptions(sh, data).best.action, "shoot");
  assert.equal(judge(sh), null);
  assert.equal(hex.peekMoment(sh, data, { manual: true }).kind, "danger");
});

test("카드 글: 팀 필살기 = 경기 시계 초 · % ('10초 동안 팀 +8%') · 같은 받는 선수는 패스 · 띄운 공 중 한 장", () => {
  const t = scene({ home: { p4: [5, 6] }, ball: { side: "home", id: "p4" }, gauge: { "home:p3": MAX } });
  judge(t);
  const tv = hex.momentView(t, data);
  const p3 = t.home.players.find((p) => p.id === "p3");
  const mult = data.skills.find((s) => p3.skillIds.includes(s.id) && s.ultimate).ultimate.teamMult;
  assert.equal(tv.cards[0].after, `${Math.round(D.teamUltTurns * 0.4)}초 동안 팀 +${Math.round((mult - 1) * 100)}%`);
  // 실제 경기의 공격 장면: 같은 받는 선수가 패스 · 띄운 공 두 카드에 함께 나오지 않는다 ('자동' 빼고)
  let n = 0;
  for (let k = 0; k < 12; k++) {
    const ms = hex.createMatch({ data, seed: `mo-dedupe-${k}`, home: SQ.home, away: SQ.away, kind: "friendly" });
    while (!ms.finished) {
      if (ms.moment) {
        const v = hex.momentView(ms, data);
        const rows = (f) => v.cards.filter((c) => c.kind === f && !c.star).flatMap((c) => (c.receivers ? c.receivers : [c]));
        const loft = rows("loft").map((r) => r.receiverId);
        for (const r of rows("pass")) {
          if (!loft.includes(r.receiverId)) continue;
          const all = [...rows("pass"), ...rows("loft")].filter((x) => x.receiverId === r.receiverId);
          assert.ok(all.some((x) => x.auto), `${ms.seed} T${ms.turn}: ${r.receiverId} 가 패스 · 띄운 공 둘 다`);
        }
        n++;
      }
      hex.step(ms, data);
    }
  }
  assert.ok(n > 20, `장면 ${n}`);
});

test("규칙 판 2 (판 1 · 2 재생 기록): ⏸ 개입은 수비 장면을 열지 않는다 (defend 입력을 받지 않는다) · momentView 수비 카드 없음 · 공격 장면은 연다", () => {
  const d = DANGER();
  d.rules = 2;
  assert.equal(hex.peekMoment(d, data, { manual: true }), null);
  assert.equal(hex.momentView(d, data, { kind: "danger", side: "home", playerId: "p2" }), null);
  const s = SHOT();
  s.rules = 2;
  const mo = hex.peekMoment(s, data, { manual: true });
  assert.equal(mo.kind, "shot");
  assert.ok(hex.momentView(s, data, mo).cards.length >= 2);
});

test("판 2 재생 기록 고정값 (17e6fc1 H3 엔진이 만든 경기 — test/fixtures/hexRules2_17e6fc1.json): createMatch rules 2 + hexReplay 가 같은 끝 (점수 · 턴 · 이벤트 · 자리 · 기록 해시)", async () => {
  const { createHash } = await import("node:crypto");
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/hexRules2_17e6fc1.json"), "utf8"));
  const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);
  assert.ok(fx.cases.length >= 4);
  for (const c of fx.cases) {
    const sq = practiceSetup(LR, data, c.setupSeed);
    const ms = SCR.hexReplay(hex, hex.createMatch({ data, seed: c.seed, home: sq.home, away: sq.away, kind: c.kind, rules: 2 }), data, { version: 2, steps: c.steps, inputs: c.inputs });
    const got = { turn: ms.turn, stage: ms.stage, score: ms.score, penalties: ms.penalties, winner: ms.result && ms.result.winner, events: ms.events.length,
      eventsHash: sha(ms.events), posHash: sha(ms.pos), statsHash: sha(ms.stats), ultimatesUsed: ms.stats.home.ultimatesUsed };
    assert.deepEqual(got, c.expect, c.seed);
  }
});
