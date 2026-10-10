// test/hexSprite.test.mjs — 육각 경기 화면 H2 스프라이트 (docs/HEX_AUTOBATTLE_PLAN.md §5.2 · §5.3 · §5.4 · §7 H2, 결정 12 · 15).
//   hexScene 공 (차는 턴 release — 발이 닿을 때까지 발 앞) · 동작 고르기 (순수): 킥오프 = idle · 달리기 / 드리블 / 대기 · 패스 (짧은 = pass, 크로스 · 먼 = kick) · 슛 kick · 헤더 header ·
//   태클 (성공 · 실패 — 실패는 미끄러짐 구간 + 다음 턴 넘어짐 구간) · 가로채기 tackle · 공중볼 수비 block · 선방 GK block · 골 장면 세리머니 ·
//   승부차기 (마지막 킥) · 쉬는 선수 fall · actKey (반복 = 그대로 이어서, 한 번 동작 = 턴마다 새 키) · 얼굴 방향 (반복 = V.facing,
//   한 번 동작 = 동작 방향 고정 — 턴 도중 뒤집히지 않음) · 스프라이트 키 (figure 72 · s) · 한 경기 내내 ANIM_ACTIONS 안.
//   hexPixi 스프라이트 길 (가짜 Pixi — setPixiModuleForTest + setHexImageLoaderForTest): 경기장 캐릭터만 · 두 팀 같은 캐릭터 = 같은 텍스처 ·
//   움직이는 캐릭터 셋 (실루엔 시트 10 · 아델린 · 네리아 시트 9 — dribble 없음 → run 으로 대신) + 정지 그림 나엘리스 (시험용으로 p2 자리에) ·
//   시트 칸 자르기 · 동작 바꾸기 · 반복 / 한 번 / 끝 자세 · 한 번 동작은 끝까지 · 반전 · 떠나면 모두 지움 (hexPixiMemory 0) ·
//   idle 시트 · 목록 실패 = 스탠디 그대로 (오류 없음) · 다른 시트 실패 = 대신 동작.
// jsdom 이 없으면 hexPixi 부분만 건너뛴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadData, clone, dataFetch } from "./helpers.mjs";
import * as lessonRun from "../js/engine/lessonRun.js";
import * as hex from "../js/engine/hexMatch.js";
import * as G from "../js/engine/hexGrid.js";
import * as V from "../js/ui/view25.js";
import * as HS from "../js/ui/hexScene.js";
import { ANIM_ACTIONS } from "../js/ui/spriteAnim.js";
import { practiceSetup } from "../js/ui/practice.js";
import { spriteOf } from "../js/ui/art.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const data = loadData();
// 스프라이트 목록 (helpers.loadData 는 화면 전용 파일을 읽지 않는다 — app.js 처럼 data.sprites 로)
data.sprites = JSON.parse(fs.readFileSync(path.join(ROOT, "data/sprites.json"), "utf8"));
const W = 1244;
const H = 528;
const SETUP = practiceSetup(lessonRun, data, "hex-sprite");
const SIL = "ch_elf_playmaker";
const ADE = "ch_human_captain";
const NER = "ch_spirit_keeper";
const NAE = "ch_elf_regista"; // 정지 그림 (동작 목록 없음)
const create = (seed = SETUP.seed, kind = "friendly") => hex.createMatch({ data, seed, home: SETUP.home, away: SETUP.away, kind });

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

/** 킥오프 상태를 바탕으로 만든 장면: prev = sceneSnap(킥오프), next = 그 복사 (turn 10 · 이벤트 없음) */
function scene() {
  const first = create();
  const prev = HS.sceneSnap(first);
  prev.turn = 9;
  const next = clone(first);
  next.turn = 10;
  next.events = [];
  return { first, prev, next };
}
const ev = (next, e) => next.events.push({ turn: next.turn, ...e });
const pl = (f, key) => f.players.find((p) => p.key === key);
const free = (st, from, k = 1) => {
  const occ = new Set([...Object.values(st.pos.home), ...Object.values(st.pos.away)]);
  return G.ALL_CELLS.find((c) => !occ.has(c) && G.distance(c, from) === k);
};
const frame = (prev, next, a = 0.5, o = {}) => HS.frameAt(prev, next, a, { W, H, ...o });

/* ------------------------------------------------------------------ */
/* hexScene 동작 고르기 (순수)                                             */
/* ------------------------------------------------------------------ */

test("동작: 킥오프 자리 그림은 모두 idle (경기 시작 · 골 뒤 킥오프 자리)", () => {
  const first = create();
  for (const f of [frame(null, first, 1), frame(HS.sceneSnap(first), first, 0.5)]) {
    assert.equal(f.kickoff, true);
    for (const p of f.players) {
      assert.equal(p.act, "idle", p.key);
      assert.equal(p.actKey, "idle");
      assert.ok(p.facing === "r" || p.facing === "l");
      assert.equal(p.actSpan, null);
    }
  }
});

test("동작: 1칸 옮김 = run, 공을 가진 채 옮김 = dribble, 그대로 = idle (반복 동작 actKey = act)", () => {
  const { prev, next } = scene();
  const car = next.ball.holder;
  assert.equal(car.side, "home");
  const cTo = free(next, next.pos.home[car.id]);
  next.pos.home[car.id] = cTo;
  next.ball.cell = cTo;
  const mover = "m_p4";
  next.pos.away[mover] = free(next, next.pos.away[mover]);
  const f = frame(prev, next);
  assert.equal(pl(f, `home:${car.id}`).act, "dribble");
  assert.equal(pl(f, `away:${mover}`).act, "run");
  assert.equal(pl(f, "home:p2").act, "idle");
  for (const p of f.players) assert.equal(p.actKey, p.act, "반복 동작 키 = 동작 이름 (턴이 바뀌어도 이어 돈다)");
  // 다음 턴에도 같은 키 (처음부터 다시 돌지 않는다)
  const next2 = clone(next);
  next2.turn = 11;
  next2.pos.away[mover] = free(next2, next2.pos.away[mover]);
  assert.equal(pl(frame(HS.sceneSnap(next), next2), `away:${mover}`).actKey, "run");
  // 공을 받은 선수 (턴 시작엔 없었다) 가 옮기면 run · 2칸 이상 (바로 자리) 은 idle
  const { prev: p3, next: n3 } = scene();
  n3.ball.holder = { side: "home", id: "p5" };
  n3.pos.home.p5 = free(n3, n3.pos.home.p5);
  n3.pos.home.p7 = free(n3, n3.pos.home.p7, 2);
  const f3 = frame(p3, n3);
  assert.equal(pl(f3, "home:p5").act, "run", "턴 시작에 공이 없었다");
  assert.equal(pl(f3, "home:p7").act, "idle", "2칸 이상 = 바로 그 자리 (달리지 않음)");
});

test("동작: 패스 = pass (노린 칸 쪽을 본다), 크로스 · LONG_PASS 칸 이상 = kick, 한 번 동작 키 = 턴:동작", () => {
  for (const [dist, cross, want] of [[2, false, "pass"], [HS.LONG_PASS - 1, false, "pass"], [HS.LONG_PASS, false, "kick"], [3, true, "kick"]]) {
    const { prev, next } = scene();
    const from = next.pos.away.m_p4;
    // 노린 칸: 화면 왼쪽 (원정 공격 방향과 같음) 이 아니라 오른쪽으로 — 얼굴 방향이 노린 칸을 따르는지
    const to = G.ALL_CELLS.find((c) => G.distance(from, c) === dist && HS.cellPlane(c).u > HS.cellPlane(from).u + 40);
    ev(next, { type: "pass", side: "away", from: "m_p4", to: "m_p6", fromCell: from, target: to, intended: to, cross, accurate: true });
    const f = frame(prev, next);
    const p = pl(f, "away:m_p4");
    assert.equal(p.act, want, `거리 ${dist} 크로스 ${cross}`);
    assert.equal(p.actKey, `10:${want}`);
    assert.equal(p.facing, "r", "노린 칸 (오른쪽) 쪽");
  }
});

test("동작: 슛 = kick · 헤더 = header (공격 방향), 선방한 GK · 공중볼 수비 = block, 가로채기 성공 = tackle (실패는 아님)", () => {
  const { prev, next } = scene();
  ev(next, { type: "shot", side: "away", playerId: "m_p6", cell: next.pos.away.m_p6, header: false, success: false });
  ev(next, { type: "save", side: "home", gkId: "p1" });
  ev(next, { type: "aerial", side: "away", attackerId: "m_p7", defenderId: "p2", success: true });
  ev(next, { type: "shot", side: "away", playerId: "m_p7", cell: next.pos.away.m_p7, header: true, success: false });
  ev(next, { type: "intercept", side: "home", defenderId: "p5", cell: 100, success: true });
  ev(next, { type: "intercept", side: "home", defenderId: "p6", cell: 101, success: false });
  const f = frame(prev, next);
  assert.equal(pl(f, "away:m_p6").act, "kick");
  assert.equal(pl(f, "away:m_p6").facing, "l", "원정 = 왼쪽 골 공격");
  assert.equal(pl(f, "away:m_p7").act, "header");
  assert.equal(pl(f, "home:p1").act, "block");
  assert.equal(pl(f, "home:p2").act, "block");
  assert.equal(pl(f, "home:p5").act, "tackle");
  assert.notEqual(pl(f, "home:p6").act, "tackle");
});

test("동작: 태클 성공 = tackle (구간 없음), 실패 = 미끄러짐 구간 → 다음 (쉬는) 턴 넘어짐 구간 · 같은 방향 → 그다음 턴 일어남 (결정 12)", () => {
  // 성공
  {
    const { prev, next } = scene();
    ev(next, { type: "tackle", side: "away", tacklerId: "m_p5", carrierId: "p6", success: true, carrierFrom: 97, carrierTo: 97, tacklerFrom: 98, tacklerTo: 98 });
    const p = pl(frame(prev, next), "away:m_p5");
    assert.equal(p.act, "tackle");
    assert.equal(p.actSpan, null);
    assert.equal(p.actKey, "10:tackle");
  }
  // 실패: 원정 실루엔 (m_p4) 이 공 가진 선수 칸 (왼쪽) 으로 뛰어든다
  const { prev, next } = scene();
  const car = next.ball.holder.id;
  const cFrom = next.pos.home[car];
  const tFrom = G.neighbors(cFrom).find((c) => HS.cellPlane(c).u > HS.cellPlane(cFrom).u + 10 && !Object.values(next.pos.away).includes(c) && !Object.values(next.pos.home).includes(c));
  const cTo = G.neighbors(cFrom).find((c) => c !== tFrom && HS.cellPlane(c).u > HS.cellPlane(cFrom).u + 10);
  prev.pos.away.m_p4 = tFrom;
  next.pos.away.m_p4 = cFrom;
  next.pos.home[car] = cTo;
  next.ball.cell = cTo;
  next.live.away.m_p4.restUntil = 11;
  ev(next, { type: "tackle", side: "away", tacklerId: "m_p4", carrierId: car, success: false, carrierFrom: cFrom, carrierTo: cTo, tacklerFrom: tFrom, tacklerTo: cFrom });
  const facings = new Set();
  for (const a of [0, 0.3, 0.6, 1]) {
    const f = frame(prev, next, a);
    const t = pl(f, "away:m_p4");
    assert.equal(t.act, "tackle", "쉬는 중이어도 태클 턴은 태클");
    assert.deepEqual(t.actSpan, HS.FAIL_SLIDE_SPAN, "미끄러져 누운 데까지");
    assert.equal(t.actKey, "10:tackle");
    facings.add(t.facing);
    assert.equal(pl(f, `home:${car}`).act, "dribble", "공 가진 선수는 드리블로 지나간다");
  }
  assert.deepEqual([...facings], ["l"], "뛰어든 칸 (왼쪽) 쪽 — 턴 도중 뒤집히지 않음");
  // 쉬는 턴
  const n2 = clone(next);
  n2.turn = 11;
  const f2 = frame(HS.sceneSnap(next), n2);
  const r = pl(f2, "away:m_p4");
  assert.equal(r.resting, true);
  assert.equal(r.act, "fall");
  assert.equal(r.actKey, "11:fall");
  assert.deepEqual(r.actSpan, HS.FALL_AFTER_SLIDE);
  assert.equal(r.facing, "l", "넘어짐 = 그 태클 방향");
  // 그다음 턴: 일어난다
  const n3 = clone(n2);
  n3.turn = 12;
  const r3 = pl(frame(HS.sceneSnap(n2), n3), "away:m_p4");
  assert.equal(r3.resting, false);
  assert.equal(r3.act, "idle");
});

test("동작: 태클 실패 다음 턴이 골 (골 → 킥오프 — 엔진이 restUntil 을 지운다) 이어도 골 장면 내내 넘어져 있다 (결정 12) · 킥오프 자리 = idle", () => {
  const { prev, next } = scene();
  const car = next.ball.holder.id;
  const cFrom = next.pos.home[car];
  const tFrom = G.neighbors(cFrom).find((c) => HS.cellPlane(c).u > HS.cellPlane(cFrom).u + 10 && !Object.values(next.pos.away).includes(c) && !Object.values(next.pos.home).includes(c));
  const cTo = G.neighbors(cFrom).find((c) => c !== tFrom && HS.cellPlane(c).u > HS.cellPlane(cFrom).u + 10);
  prev.pos.away.m_p4 = tFrom;
  next.pos.away.m_p4 = cFrom;
  next.pos.home[car] = cTo;
  next.ball.cell = cTo;
  next.live.away.m_p4.restUntil = 11;
  ev(next, { type: "tackle", side: "away", tacklerId: "m_p4", carrierId: car, success: false, carrierFrom: cFrom, carrierTo: cTo, tacklerFrom: tFrom, tacklerTo: cFrom });
  // 턴 11: 슛 · 골 · 킥오프 — 킥오프가 모두의 restUntil 을 −1 로
  const n2 = clone(next);
  n2.turn = 11;
  for (const s of ["home", "away"]) for (const id of Object.keys(n2.live[s])) n2.live[s][id].restUntil = -1;
  ev(n2, { type: "shot", side: "home", playerId: car, cell: cTo, success: true });
  ev(n2, { type: "goal", side: "home", playerId: car, score: { home: 1, away: 0 } });
  ev(n2, { type: "kickoff", side: "away" });
  const p0 = HS.sceneSnap(next);
  for (const [a, o] of [[0, {}], [0.5, {}], [1, {}], [1, { goalScene: true }]]) {
    const r = pl(frame(p0, n2, a, o), "away:m_p4");
    assert.equal(r.act, "fall", `골 턴 alpha ${a}${o.goalScene ? " 골 장면" : ""}: 넘어짐`);
    assert.equal(r.actKey, "11:fall", "쉬는 턴 키 그대로 (restUntil 이 남았을 때와 같다)");
    assert.deepEqual(r.actSpan, HS.FALL_AFTER_SLIDE, "주저앉은 칸부터");
    assert.equal(r.facing, "l", "그 태클 방향");
    assert.equal(r.resting, true, "스탠디 · 정지 그림도 눕힌다");
  }
  assert.equal(pl(frame(p0, n2, 1, { goalScene: true }), `home:${car}`).act, "celebrate", "득점자는 세리머니");
  // 성공한 태클이면 넘어지지 않는다
  {
    const n3 = clone(n2);
    n3.events.find((e) => e.type === "tackle").success = true;
    assert.notEqual(pl(frame(p0, n3, 0.5), "away:m_p4").act, "fall");
  }
  // 킥오프 자리 그림 = 모두 idle (일어선다)
  const k = pl(frame(null, n2, 1, { goalScene: true }), "away:m_p4");
  assert.equal(k.act, "idle");
  assert.equal(k.resting, false);
});

test("동작: 실제 경기 — 태클에 실패한 선수는 다음 턴 (골 턴 포함) 늘 fall", () => {
  let fails = 0;
  let goalTurns = 0;
  // 표본 8판 — 태클 실패 다음 턴이 골인 경우가 없으면 (엔진 조정으로 흐름이 바뀌면) 찾을 때까지 판을 더 (최대 40)
  for (let k = 0; k < 40 && (k < 8 || goalTurns < 1); k++) {
    const ms = create(`hex-sprite-fall-${k}`);
    let pending = []; // 지난 턴 실패한 태클러 key
    while (!ms.finished) {
      const prev = HS.sceneSnap(ms);
      hex.step(ms, data);
      const evs = HS.eventsOfTurn(ms);
      const kickoff = evs.some((e) => e.type === "kickoff");
      const goal = evs.some((e) => e.type === "goal");
      if (!(kickoff && !goal) && pending.length) {
        for (const a of [0.3, 1]) {
          const f = frame(prev, ms, a, { goalScene: goal && a === 1 });
          for (const key of pending) {
            assert.equal(pl(f, key).act, "fall", `${ms.seed} 턴 ${ms.turn} ${key}${goal ? " (골 턴)" : ""}`);
            fails += 1;
          }
        }
        if (goal) goalTurns += 1;
      }
      pending = evs.filter((e) => e.type === "tackle" && !e.success).map((e) => `${e.side}:${e.tacklerId}`);
    }
  }
  assert.ok(fails > 20, `태클 실패 표본 ${fails}`);
  assert.ok(goalTurns >= 1, `태클 실패 다음 턴이 골인 경우 ${goalTurns}`);
});

test("동작: 태클 없이 쉬는 선수 (이어하기 등) = fall (구간 없음 · 쉬는 동안 같은 키)", () => {
  const { prev, next } = scene();
  next.live.home.p2.restUntil = 11;
  const p = pl(frame(prev, next), "home:p2");
  assert.equal(p.act, "fall");
  assert.equal(p.actKey, "11:fall");
  assert.equal(p.actSpan, null);
  const n2 = clone(next);
  n2.turn = 11;
  assert.equal(pl(frame(HS.sceneSnap(next), n2), "home:p2").actKey, "11:fall", "쉬는 턴 내내 같은 키 (다시 넘어지지 않는다)");
});

test("동작: 골 장면 (goalScene) 의 득점자 = celebrate (공격 방향), 아니면 kick · 골 뒤 킥오프 자리 = idle", () => {
  // 실제 경기에서 골 턴 찾기
  let found = null;
  for (let k = 0; k < 12 && !found; k++) {
    const ms = create(`hex-sprite-goal-${k}`);
    while (!ms.finished && !found) {
      const prev = HS.sceneSnap(ms);
      hex.step(ms, data);
      const g = HS.eventsOfTurn(ms).find((e) => e.type === "goal");
      if (g && HS.eventsOfTurn(ms).some((e) => e.type === "kickoff")) found = { prev, next: clone(ms), g };
    }
  }
  assert.ok(found, "골 턴");
  const { prev, next, g } = found;
  const key = `${g.side}:${g.playerId}`;
  const shot = pl(frame(prev, next, 0.5), key);
  assert.ok(shot.act === "kick" || shot.act === "header", `슛 턴 = ${shot.act}`);
  const cel = pl(frame(prev, next, 1, { goalScene: true }), key);
  assert.equal(cel.act, "celebrate");
  assert.equal(cel.actKey, `${next.turn}:celebrate`);
  assert.equal(cel.facing, g.side === "home" ? "r" : "l");
  for (const p of frame(null, next, 1, { goalScene: true }).players) assert.equal(p.act, "idle", "킥오프 자리 그림");
});

test("동작: 승부차기 = 마지막 킥의 키커 kick · 그 GK block, 킥마다 새 키", () => {
  let st = null;
  for (let k = 0; k < 60 && !st; k++) {
    const ms = create(`hex-sprite-pk-${k}`, "goal");
    while (!ms.finished && ms.stage !== "penalties") hex.step(ms, data);
    if (ms.stage === "penalties" && !ms.finished) st = ms;
  }
  assert.ok(st, "승부차기까지 간 골 매치");
  const keys = new Set();
  for (let i = 0; i < 3 && !st.finished; i++) {
    const prev = HS.sceneSnap(st);
    hex.step(st, data);
    const pk = HS.eventsOfTurn(st).filter((e) => e.type === "penalty").at(-1);
    const f = frame(prev, st, 0.5);
    const kk = pl(f, `${pk.side}:${pk.playerId}`);
    assert.equal(kk.act, "kick");
    const gk = pl(f, `${pk.side === "home" ? "away" : "home"}:${pk.defenderId}`);
    assert.equal(gk.act, "block");
    assert.equal(f.players.filter((p) => p.act !== "idle").length, 2, "나머지는 idle");
    keys.add(kk.actKey);
  }
  assert.equal(keys.size, 3, "킥마다 새 키 (같은 턴 번호여도)");
});

test("동작: 같은 한 번 동작이 연달아도 턴마다 새 키 · 반복 동작 얼굴 = V.facing (공 가진 선수 = 공격 방향, 나머지 = 공 쪽)", () => {
  const { prev, next } = scene();
  ev(next, { type: "pass", side: "home", from: "p4", to: "p5", fromCell: next.pos.home.p4, target: next.pos.home.p5, intended: next.pos.home.p5, cross: false, accurate: true });
  const a = pl(frame(prev, next), "home:p4");
  const n2 = clone(next);
  n2.turn = 11;
  n2.events = [{ ...next.events[0], turn: 11 }];
  const b = pl(frame(HS.sceneSnap(next), n2), "home:p4");
  assert.equal(a.act, b.act);
  assert.notEqual(a.actKey, b.actKey, "같은 동작도 턴이 바뀌면 처음부터");
  const f = frame(prev, next, 0.5);
  for (const p of f.players) {
    if (p.act !== "idle") continue;
    const want = V.facing({ carrier: f.carrierKey === p.key, attackRight: p.side === "home", sx: p.sx, ballSx: f.ball.sx, side: p.side });
    assert.equal(p.facing, want, p.key);
  }
  const car = pl(f, f.carrierKey);
  assert.equal(car.facing, "r", "홈 공 가진 선수 = 오른쪽");
});

test("동작: 한 경기 내내 act ∈ ANIM_ACTIONS · actKey 문자열 · facing r/l, 스프라이트 키 (figure 72 · s) 는 sprite 옵션일 때만", () => {
  const ms = create("hex-sprite-full", "goal");
  const seen = new Set();
  while (!ms.finished) {
    const prev = HS.sceneSnap(ms);
    hex.step(ms, data);
    for (const a of [0.2, 1]) {
      for (const p of frame(prev, ms, a).players) {
        assert.ok(ANIM_ACTIONS.includes(p.act), p.act);
        assert.equal(typeof p.actKey, "string");
        assert.ok(p.facing === "r" || p.facing === "l");
        seen.add(p.act);
      }
    }
  }
  for (const a of ["idle", "run", "dribble", "pass", "kick", "tackle", "fall"]) assert.ok(seen.has(a), `경기 중 ${a} 이 나온다 (${[...seen]})`);
  const first = create();
  const sprite = (id) => spriteOf(data, id);
  const f = frame(null, first, 1, { sprite });
  const sil = f.players.find((p) => p.charId === SIL);
  near(sil.figure.fh, V.spriteHeight(sil.s), "실루엔 = 스프라이트 키");
  const plain = f.players.find((p) => !sprite(p.charId));
  near(plain.figure.fh, V.standeeHeight(plain.s), "스프라이트 없는 선수 = 스탠디 키");
  near(frame(null, first, 1).players.find((p) => p.charId === SIL).figure.fh, V.standeeHeight(sil.s), "옵션 없으면 스탠디 (H1 그대로)");
});

function near(a, b, msg, eps = 1e-9) {
  assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} ≈ ${b}`);
}

/* ------------------------------------------------------------------ */
/* hexPixi 스프라이트 길 (가짜 Pixi)                                         */
/* ------------------------------------------------------------------ */

/** 가짜 Pixi 모듈 + 기록 */
function fakePixi(doc) {
  const log = { textures: [], destroyed: new Map(), anims: [], sprites: [], appDestroyed: 0, renders: 0 };
  class Point {
    constructor() { this.x = 0; this.y = 0; }
    set(x, y = x) { this.x = x; this.y = y; }
  }
  class Container {
    constructor() {
      this.children = []; this.position = new Point(); this.scale = new Point(); this.scale.set(1); this.visible = true;
      this.alpha = 1; this.rotation = 0; this.zIndex = 0; this.parent = null;
    }
    get x() { return this.position.x; }
    set x(v) { this.position.x = v; }
    get y() { return this.position.y; }
    set y(v) { this.position.y = v; }
    addChild(...c) { for (const k of c) { k.parent = this; this.children.push(k); } return c[0]; }
    addChildAt(c, i) { c.parent = this; this.children.splice(i, 0, c); return c; }
    getChildIndex(c) { return this.children.indexOf(c); }
    removeChildren() { const r = this.children; this.children = []; return r; }
  }
  class Graphics extends Container {}
  for (const k of ["circle", "fill", "stroke", "roundRect", "ellipse", "poly", "moveTo", "lineTo", "rect"]) Graphics.prototype[k] = function () { return this; };
  class Sprite extends Container {
    constructor(tex) { super(); this.texture = tex; this.anchor = new Point(); log.sprites.push(this); }
  }
  class AnimatedSprite extends Sprite {
    constructor(o) { super(o.textures[0]); this._t = o.textures; this.currentFrame = 0; log.anims.push(this); }
    get textures() { return this._t; }
    set textures(v) { this._t = v; this.currentFrame = 0; this.texture = v[0]; }
    gotoAndStop(i) { if (i < 0 || i >= this._t.length) throw new Error(`frame ${i}`); this.currentFrame = i; this.texture = this._t[i]; }
  }
  class Src { constructor(o) { this.resource = o.resource; } }
  class Texture {
    constructor(o) { this.source = o.source; this.frame = o.frame || null; log.textures.push(this); }
    destroy(src) { log.destroyed.set(this, (log.destroyed.get(this) || 0) + 1); this.destroyedSource = !!src; }
  }
  class Rectangle { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
  class Application {
    async init() { this.canvas = doc.createElement("canvas"); this.stage = new Container(); this.renderer = { gl: { isContextLost: () => false } }; }
    render() { log.renders++; }
    destroy() { log.appDestroyed++; }
  }
  const mod = {
    Application, Container, Sprite, AnimatedSprite, Graphics, Texture, Rectangle, CanvasSource: Src, ImageSource: Src,
    PerspectiveMesh: Container, isWebGLSupported: () => true,
  };
  return { mod, log };
}

test("hexPixi 스프라이트: 두 팀 실루엔 · 아델린 · 네리아가 시트를 나눠 쓴다 · 칸 자르기 · 동작 · 반전 · 한 번 동작은 끝까지 · 떠나면 모두 지움 · 실패는 스탠디", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const g = globalThis;
  const names = ["window", "document", "HTMLCanvasElement", "HTMLElement", "fetch", "WebGLRenderingContext"];
  const saved = {};
  for (const n of names) saved[n] = Object.prototype.hasOwnProperty.call(g, n) ? g[n] : undefined;
  g.window = window;
  g.document = window.document;
  g.HTMLCanvasElement = window.HTMLCanvasElement;
  g.HTMLElement = window.HTMLElement;
  g.WebGLRenderingContext = function WebGLRenderingContext() {};
  const realFetch = dataFetch(ROOT);
  let failManifest = false;
  g.fetch = (url, o) => (failManifest && /anim\/.*\.json/.test(url) ? Promise.resolve({ ok: false, status: 404 }) : realFetch(url, o));
  const g2d = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (k === "createLinearGradient" || k === "createRadialGradient") ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  const proto = window.HTMLCanvasElement.prototype;
  const realGet = proto.getContext;
  proto.getContext = function (type) { return type === "2d" ? g2d : null; };
  const PX = await import(pathToFileURL(path.join(ROOT, "js/ui/hexPixi.js")).href);
  const SA = await import(pathToFileURL(path.join(ROOT, "js/ui/spriteAnim.js")).href);
  const MANS = Object.fromEntries([SIL, ADE, NER].map((id) => [id, JSON.parse(fs.readFileSync(path.join(ROOT, `img/sprites/anim/${id}.json`), "utf8"))]));
  const manifest = MANS[SIL];
  const ANIMATED = Object.keys(MANS);
  assert.ok(ANIMATED.every((id) => data.sprites.chars[id]?.anim === `img/sprites/anim/${id}.json`), "실루엔 · 아델린 · 네리아 = 움직이는 스프라이트");
  assert.ok(data.sprites.chars[NAE] && !data.sprites.chars[NAE].anim, "나엘리스 = 정지 그림");
  const sheetsOf = (id) => Object.values(MANS[id].anims);
  const allSheets = ANIMATED.flatMap(sheetsOf);
  // 그림: 시트는 w · count × h, 정지 그림은 sprites.json 크기, 나머지 (잔디 · 초상) 는 아무 크기. url 을 달아 둔다 (어느 캐릭터 · 동작인지)
  const failUrls = new Set();
  const imgLoads = [];
  PX.setHexImageLoaderForTest(async (url) => {
    imgLoads.push(url);
    if ([...failUrls].some((f) => url.includes(f))) return null;
    const m = /anim\/(ch_\w+)\.(\w+)\.webp/.exec(url);
    if (m) { const a = MANS[m[1]].anims[m[2]]; return { url, width: a.w * a.count, height: a.h, naturalWidth: a.w * a.count, naturalHeight: a.h }; }
    const s = /sprites\/(ch_\w+)\.webp/.exec(url);
    if (s) { const e = data.sprites.chars[s[1]]; return { url, width: e.w, height: e.h, naturalWidth: e.w, naturalHeight: e.h }; }
    return { url, width: 64, height: 64, naturalWidth: 64, naturalHeight: 64 };
  });
  const warns = [];
  const errs = [];
  const realWarn = console.warn;
  const realErr = console.error;
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  console.error = (...a) => errs.push(a.map(String).join(" "));
  t.after(() => {
    console.warn = realWarn;
    console.error = realErr;
    proto.getContext = realGet;
    PX.setPixiModuleForTest(null);
    PX.setHexImageLoaderForTest(null);
    SA.resetAnimCacheForTest();
    for (const n of names) { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; }
    window.close();
  });
  const settle = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0)); };

  // 기본 선수단 거울 경기 + 정지 그림 길을 보려고 양쪽 p2 (드워프 — 스프라이트 없음) 자리에 나엘리스
  const MIX = clone(SETUP);
  for (const team of [MIX.home, MIX.away]) team.players.find((p) => /p2$/.test(p.id)).charId = NAE;
  const ms = hex.createMatch({ data, seed: SETUP.seed, home: MIX.home, away: MIX.away, kind: "friendly" });
  const sprite = (id) => spriteOf(data, id);
  const urlOf = (spr) => spr?.texture?.source?.resource?.url || "";
  const animsOf = (log, id) => log.anims.filter((a) => urlOf(a).includes(`anim/${id}.`));
  const baseFrame = () => HS.frameAt(null, ms, 1, { W, H, sprite });
  const mk = async () => {
    const fk = fakePixi(window.document);
    PX.setPixiModuleForTest(fk.mod);
    const host = window.document.createElement("div");
    window.document.body.append(host);
    const v = await PX.createHexView(host, { W, H, width: 1268, height: 708, origin: { x: 12, y: 78 }, data, resolution: 1 });
    assert.ok(v, `가짜 Pixi 로 view (${warns.join(" | ")})`);
    return { v, log: fk.log, host };
  };
  const tm = (clock, speed = 1) => ({ clock, speed, turnMs: 400 / speed });

  // ---- 1) 정상: 두 팀 실루엔 (p4 · m_p4) · 아델린 (p3 · m_p3) · 네리아 (p1 · m_p1) = 시트, 나엘리스 (p2 · m_p2 — 시험용) = 정지 그림 ----
  SA.resetAnimCacheForTest();
  {
    const { v, log, host } = await mk();
    v.draw(baseFrame(), null, tm(0));
    await settle();
    const st = v.stats();
    for (const id of ANIMATED) {
      assert.equal(st.chars[id].kind, "anim", `${id} = 움직이는 시트`);
      assert.deepEqual([...st.chars[id].acts].sort(), Object.keys(MANS[id].anims).sort(), `${id} 시트 = 목록의 동작 전부`);
      assert.equal(v.spriteKind(id), "anim", `spriteKind ${id}: 움직이는 시트`);
    }
    assert.deepEqual([...st.chars[SIL].acts].sort(), [...ANIM_ACTIONS].sort(), "실루엔 시트 10장");
    for (const id of [ADE, NER]) {
      assert.deepEqual([...st.chars[id].acts].sort(), ANIM_ACTIONS.filter((a) => a !== "dribble").sort(), `${id} 시트 9장 (dribble 없음 → run 으로 대신)`);
    }
    assert.equal(st.chars[NAE].kind, "static", "나엘리스 = 정지 그림");
    assert.equal(st.chars.ch_dwarf_wall, undefined, "자리를 내준 캐릭터는 경기장에 없다");
    assert.equal(st.chars.ch_human_runner.kind, null, "스프라이트 없는 캐릭터 = 스탠디");
    assert.equal(v.spriteKind(NAE), "static", "spriteKind: 정지 그림");
    assert.equal(v.spriteKind("ch_human_runner"), null, "spriteKind: 스탠디");
    assert.equal(v.spriteKind(null), null);
    assert.equal(st.byKind.sprite.textures, allSheets.length + 1, `시트 ${allSheets.length} (10 + 9 + 9) + 나엘리스 1 — 두 팀이 나눠 쓴다 (두 배 아님)`);
    const sheetBytes = allSheets.reduce((s, a) => s + a.w * a.count * a.h * 4, 0);
    const nae = data.sprites.chars[NAE];
    assert.equal(st.byKind.sprite.bytes, sheetBytes + nae.w * nae.h * 4, "바이트 = w · h · 4 합");
    assert.equal(st.cuts, allSheets.reduce((s, a) => s + a.count, 0), "칸 텍스처 = 칸 수 합 (캐릭터마다 한 벌)");
    assert.equal(imgLoads.filter((u) => u.includes("anim/")).length, allSheets.length, "시트는 한 번씩만 불러온다");
    assert.equal(imgLoads.filter((u) => u.includes(".dribble.")).length, 1, "드리블 시트는 실루엔 것만");
    const onPitch = new Set(baseFrame().players.map((p) => p.charId).filter(Boolean));
    for (const u of imgLoads.filter((x) => /sprites\/(anim\/)?ch_/.test(x))) {
      assert.ok(onPitch.has(/(ch_[a-z_]+?)(\.[a-z]+)?\.webp/.exec(u)[1]), `경기장에 선 캐릭터 것만 불러온다 (${u})`);
    }
    assert.ok(imgLoads.every((u) => !/sprites\/ch_(elf_playmaker|human_captain|spirit_keeper)\.webp/.test(u)), "움직이는 캐릭터는 정지 그림을 부르지 않는다");

    v.draw(baseFrame(), null, tm(16));
    assert.equal(log.anims.length, 6, "셋 × 두 팀 = AnimatedSprite 여섯");
    for (const id of ANIMATED) {
      const [x1, x2] = animsOf(log, id);
      assert.ok(x1 && x2 && x1 !== x2, `${id} 둘`);
      assert.equal(x1.textures, x2.textures, `${id}: 두 팀이 같은 칸 텍스처 배열`);
      const idl = MANS[id].anims.idle;
      assert.equal(x1.textures.length, idl.count, `${id}: idle`);
      near(x1.anchor.x, idl.foot0X / idl.w, `${id}: 앵커 x = 발 (idle 은 foot0X)`, 1e-6);
      near(Math.abs(x1.scale.y), V.V25.SPR_H / data.sprites.chars[id].h, `${id}: 배율 = 72 / 정지 그림 h`);
    }
    const [a1, a2] = animsOf(log, SIL);
    assert.equal(a1.textures, a2.textures, "같은 칸 텍스처 배열 (같은 시트)");
    const idle = manifest.anims.idle;
    const fr = a1.textures[3].frame;
    assert.deepEqual([fr.x, fr.y, fr.width, fr.height], [3 * idle.w, 0, idle.w, idle.h], "칸 i = (i · w, 0, w, h)");
    assert.equal(a1.textures[0].source, a1.textures[5].source, "칸은 시트 소스를 나눠 쓴다");
    near(a1.anchor.x, idle.foot0X / idle.w, "앵커 x = 발 (idle 은 foot0X)", 1e-6);
    near(a1.anchor.y, idle.footY / idle.h, "앵커 y = footY", 1e-6);
    assert.equal(a1.parent.visible, true, "스프라이트 보임");
    near(Math.abs(a1.scale.y), V.V25.SPR_H / data.sprites.chars[SIL].h, "배율 = 72 / 240");
    const statics = log.sprites.filter((s) => !log.anims.includes(s) && urlOf(s).includes(`sprites/${NAE}.webp`));
    assert.equal(statics.length, 2, "나엘리스 정지 그림 둘");
    assert.equal(statics[0].texture, statics[1].texture, "정지 그림도 한 텍스처");
    near(statics[0].anchor.x, nae.footX, "정지 그림 앵커 = footX");
    assert.equal(statics[0].anchor.y, 1);

    // 동작 바꾸기 · 반전 · 한 번 동작은 끝까지 · 반복 동작 칸 진행
    const withAct = (key, act, actKey, facing = "r", span = null) => {
      const f = baseFrame();
      const p = f.players.find((x) => x.key === key);
      Object.assign(p, { act, actKey, facing, actSpan: span });
      return f;
    };
    const home = a1; // 홈 실루엔 (홈 선수부터 그린다)
    v.draw(withAct("home:p4", "run", "run"), null, tm(100));
    assert.equal(home.textures.length, manifest.anims.run.count, "run 시트");
    v.draw(withAct("home:p4", "run", "run"), null, tm(100 + 1000 / 12 * 2 + 1));
    assert.equal(home.currentFrame, 2, "반복: 12 fps 로 칸 진행");
    v.draw(withAct("home:p4", "run", "run", "r"), null, tm(100 + 1000 / 12 * 9 + 1));
    assert.equal(home.currentFrame, 9 % manifest.anims.run.count, "반복은 돌아간다");
    v.draw(withAct("home:p4", "kick", "20:kick", "l"), null, tm(2000));
    assert.equal(home.textures.length, manifest.anims.kick.count, "kick 시트로");
    assert.ok(home.scale.x < 0, "'l' = x 반전");
    assert.equal(v.animating, true);
    v.draw(withAct("home:p4", "run", "run"), null, tm(2200)); // 한 번 동작 (400 ms) 이 아직 → 달리기가 끊지 않는다
    assert.equal(home.textures.length, manifest.anims.kick.count, "한 번 동작은 끝까지 (반복 동작이 끊지 않는다)");
    assert.ok(home.scale.x < 0, "끝까지 보여 주는 한 번 동작은 시작할 때 방향 그대로 (frame 은 'r')");
    assert.equal(home.currentFrame, Math.floor((200 / 400) * 12), "턴 길이에 맞춰 칸 진행");
    v.draw(withAct("home:p4", "run", "run"), null, tm(2450));
    assert.equal(home.textures.length, manifest.anims.run.count, "끝나면 달리기");
    assert.ok(home.scale.x > 0, "달리기는 frame 방향");
    // 4배속: 한 번 동작 최소 ONE_SHOT_MIN
    v.draw(withAct("home:p4", "pass", "30:pass"), null, tm(3000, 4));
    v.draw(withAct("home:p4", "run", "run"), null, tm(3000 + 120, 4));
    assert.equal(home.textures.length, manifest.anims.pass.count, `4배속 0.1 초 턴에도 패스가 ${PX.ONE_SHOT_MIN} ms 는 보인다`);
    v.draw(withAct("home:p4", "run", "run"), null, tm(3000 + PX.ONE_SHOT_MIN + 1, 4));
    assert.equal(home.textures.length, manifest.anims.run.count);
    // 태클 실패 구간 → 넘어짐 구간 (끝 자세에 머문다) — 다른 한 번 동작 · 끝 자세는 바로 끊는다
    v.draw(withAct("home:p4", "tackle", "40:tackle", "r", HS.FAIL_SLIDE_SPAN), null, tm(4000));
    assert.equal(home.textures.length, manifest.anims.tackle.count);
    v.draw(withAct("home:p4", "tackle", "40:tackle", "r", HS.FAIL_SLIDE_SPAN), null, tm(4399));
    assert.equal(home.currentFrame, 8, "미끄러져 누운 칸 (8) 까지만 — 일어서는 칸 없음");
    v.draw(withAct("home:p4", "fall", "41:fall", "r", HS.FALL_AFTER_SLIDE), null, tm(4400));
    assert.equal(home.textures.length, manifest.anims.fall.count);
    assert.equal(home.currentFrame, 8, "넘어짐은 주저앉은 칸부터");
    v.draw(withAct("home:p4", "fall", "41:fall", "r", HS.FALL_AFTER_SLIDE), null, tm(9000));
    assert.equal(home.currentFrame, 11, "끝 자세 = 마지막 칸에 머문다");
    // 같은 반복 동작 · 같은 키의 한 번 동작은 다시 시작하지 않는다
    v.draw(withAct("home:p4", "celebrate", "50:celebrate"), null, tm(10000));
    v.draw(withAct("home:p4", "celebrate", "50:celebrate"), null, tm(10000 + 5000));
    assert.equal(home.currentFrame, 11, "세리머니 끝 자세");
    v.draw(withAct("home:p4", "idle", "idle"), null, tm(20000));
    assert.equal(home.textures.length, manifest.anims.idle.count);
    // 얼굴 방향 고정: 한 번 · 끝 자세 동작은 시작할 때 방향으로 그 동작 내내 (공이 지나가며 frame facing 이 바뀌어도), 새 키면 새 방향
    v.draw(withAct("home:p4", "block", "60:block", "l"), null, tm(21000));
    assert.equal(home.textures.length, manifest.anims.block.count);
    assert.ok(home.scale.x < 0, "block 시작 = 'l'");
    v.draw(withAct("home:p4", "block", "60:block", "r"), null, tm(21150));
    assert.ok(home.scale.x < 0, "같은 block 도중 frame 이 'r' 이어도 'l' 그대로");
    v.draw(withAct("home:p4", "pass", "61:pass", "r"), null, tm(21400));
    assert.ok(home.scale.x > 0, "새 한 번 동작 = 새 방향");
    v.draw(withAct("home:p4", "pass", "61:pass", "l"), null, tm(21500));
    assert.ok(home.scale.x > 0, "세로 패스 (공 쪽 방향이 바뀜) 도 뒤집히지 않는다");
    v.draw(withAct("home:p4", "run", "run", "l"), null, tm(22000));
    assert.ok(home.scale.x < 0, "반복 동작은 frame 방향");
    v.draw(withAct("home:p4", "run", "run", "r"), null, tm(22050));
    assert.ok(home.scale.x > 0, "반복 동작은 frame 방향 (매 그림)");
    // 아델린 · 네리아: 드리블 시트가 없다 → run 시트 (ANIM_FALLBACK), 그 밖 동작은 자기 시트
    for (const [key, id] of [["home:p3", ADE], ["home:p1", NER]]) {
      const x = animsOf(log, id)[0];
      v.draw(withAct(key, "dribble", "dribble"), null, tm(22100));
      assert.equal(x.textures.length, MANS[id].anims.run.count, `${id}: dribble → run 시트`);
      assert.ok(urlOf(x).includes(`anim/${id}.run.webp`), `${id}: run 시트 텍스처`);
      v.draw(withAct(key, "tackle", "65:tackle"), null, tm(22200));
      assert.ok(urlOf(x).includes(`anim/${id}.tackle.webp`), `${id}: 자기 tackle 시트`);
    }
    // 정지 그림 (나엘리스 둘) 도 같다
    const both = (act, actKey, facing) => {
      const f = baseFrame();
      for (const k of ["home:p2", "away:m_p2"]) Object.assign(f.players.find((x) => x.key === k), { act, actKey, facing, actSpan: null });
      return f;
    };
    v.draw(both("tackle", "70:tackle", "l"), null, tm(23000));
    assert.ok(statics.every((x) => x.scale.x < 0), "정지 그림 tackle 시작 = 'l'");
    v.draw(both("tackle", "70:tackle", "r"), null, tm(23100));
    assert.ok(statics.every((x) => x.scale.x < 0), "정지 그림도 같은 동작 도중 뒤집히지 않는다");
    v.draw(both("run", "run", "r"), null, tm(23500));
    assert.ok(statics.every((x) => x.scale.x > 0), "정지 그림 반복 동작 = frame 방향");

    // 떠나기: 모든 텍스처 (칸 · 시트 · 정지 그림 · 잔디 · 얼굴) 를 지운다
    const mem = PX.hexPixiMemory();
    assert.equal(mem.views, 1);
    assert.equal(mem.byKind.sprite.textures, allSheets.length + 1);
    v.destroy();
    for (const tex of log.textures) assert.equal(log.destroyed.get(tex), 1, "텍스처마다 정확히 한 번");
    const cutsDestroyed = log.textures.filter((x) => x.frame);
    assert.ok(cutsDestroyed.length === st.cuts && cutsDestroyed.every((x) => x.destroyedSource === false), "칸 텍스처는 소스를 남기고 (시트가 지운다)");
    assert.deepEqual(PX.hexPixiMemory(), { views: 0, textures: 0, bytes: 0, byKind: {} }, "살아 있는 텍스처 0");
    v.draw(baseFrame(), null, tm(30000)); // 지운 뒤 그리기 = 무시
    host.remove();
  }

  // ---- 2) 늦게 도착: 떠난 뒤 온 시트는 올리지 않는다 ----
  SA.resetAnimCacheForTest();
  {
    const { v } = await mk();
    v.draw(baseFrame(), null, tm(0));
    v.destroy();
    await settle();
    assert.deepEqual(PX.hexPixiMemory(), { views: 0, textures: 0, bytes: 0, byKind: {} }, "떠난 뒤 도착한 그림은 버린다");
  }

  // ---- 3) idle 시트 실패 → 실루엔은 스탠디 그대로 (실루엔 다른 시트도 안 부른다 — 다른 캐릭터는 그대로), kick 시트 실패 → pass 로 대신 ----
  SA.resetAnimCacheForTest();
  failUrls.add("ch_elf_playmaker.idle.webp");
  imgLoads.length = 0;
  {
    const { v, log } = await mk();
    v.draw(baseFrame(), null, tm(0));
    await settle();
    v.draw(baseFrame(), null, tm(16));
    assert.equal(v.stats().chars[SIL].kind, null);
    assert.equal(v.spriteKind(SIL), null, "spriteKind: 실패 = 스탠디 (화면 이름표는 스탠디 키)");
    assert.equal(animsOf(log, SIL).length, 0, "실루엔 AnimatedSprite 없음 — 스탠디");
    assert.equal(log.anims.length, 4, "아델린 · 네리아는 그대로 움직인다 (둘 × 두 팀)");
    assert.equal(v.stats().chars[ADE].kind, "anim");
    assert.equal(imgLoads.filter((u) => u.includes(`anim/${SIL}.`)).length, 1, "idle 이 안 오면 실루엔 다른 시트는 부르지 않는다");
    v.destroy();
  }
  failUrls.clear();
  failUrls.add("ch_elf_playmaker.kick.webp");
  SA.resetAnimCacheForTest();
  {
    const { v, log } = await mk();
    v.draw(baseFrame(), null, tm(0));
    await settle();
    assert.ok(!v.stats().chars[SIL].acts.includes("kick"));
    const f = baseFrame();
    Object.assign(f.players.find((x) => x.key === "home:p4"), { act: "kick", actKey: "9:kick" });
    v.draw(f, null, tm(100));
    const homeSil = animsOf(log, SIL)[0];
    assert.equal(homeSil.textures.length, manifest.anims.pass.count, "kick 대신 pass (ANIM_FALLBACK)");
    assert.ok(urlOf(homeSil).includes(`anim/${SIL}.pass.webp`));
    v.destroy();
  }
  failUrls.clear();
  // ---- 4) 목록 실패 (404) → 스탠디 ----
  SA.resetAnimCacheForTest();
  failManifest = true;
  {
    const { v, log } = await mk();
    v.draw(baseFrame(), null, tm(0));
    await settle();
    v.draw(baseFrame(), null, tm(16));
    assert.equal(log.anims.length, 0, "목록이 없으면 셋 다 스탠디");
    for (const id of ANIMATED) assert.equal(v.stats().chars[id].kind, null);
    assert.equal(v.stats().chars[NAE].kind, "static", "정지 그림 선수는 그대로");
    v.destroy();
  }
  failManifest = false;
  assert.deepEqual(PX.hexPixiMemory(), { views: 0, textures: 0, bytes: 0, byKind: {} });
  assert.deepEqual(errs, [], "console.error 없음");
  assert.deepEqual(warns.filter((w) => /스프라이트/.test(w)), [], "스프라이트 경고 없음 (실패는 조용히 스탠디 · 대신 동작)");
});

test("공: 차는 턴 (턴 시작에 공을 가진 선수의 패스 · 슛) 은 release 까지 차는 선수 발 앞 (보간된 자리 · 차는 쪽으로 굴림) · 그 뒤 날아간다 · 그 밖 턴은 그대로", () => {
  const ms = create("hex-sprite-release", "goal");
  let kicks = 0;
  let back = 0;
  let plain = 0;
  const r = HS.BALL_RELEASE;
  const dist = (b, q) => Math.hypot(b.sx - q.sx, b.sy - q.sy);
  while (!ms.finished && (kicks < 12 || back < 1 || plain < 12)) {
    const prev = HS.sceneSnap(ms);
    hex.step(ms, data);
    const evs = HS.eventsOfTurn(ms);
    const ph = prev.ball?.holder;
    const snap = evs.some((e) => e.type === "kickoff") && !evs.some((e) => e.type === "goal");
    const kick = !!ph && !snap && evs.some((e) => (e.type === "pass" && e.side === ph.side && String(e.from) === String(ph.id))
      || (e.type === "shot" && e.side === ph.side && String(e.playerId) === String(ph.id)));
    const f0 = frame(prev, ms, 0);
    if (!kick) {
      assert.equal(f0.release, 0, `턴 ${ms.turn}: 차지 않는 턴 release 0`);
      for (const a of [0.2, 0.5, 0.8]) assert.deepEqual(frame(prev, ms, a).ball, frame(prev, ms, a, { release: 0 }).ball, `턴 ${ms.turn}: 차지 않는 턴은 H1 공 그대로`);
      plain += 1;
      continue;
    }
    assert.equal(f0.release, r, `턴 ${ms.turn}: 차는 턴 release`);
    const key = `${ph.side}:${ph.id}`;
    const end = frame(prev, ms, 1).ball;
    assert.deepEqual(end, frame(prev, ms, 1, { release: 0 }).ball, `턴 ${ms.turn}: 끝 자리는 같다`);
    for (const a of [0, r * 0.5, r]) {
      const f = frame(prev, ms, a);
      const k = pl(f, key);
      assert.ok(dist(f.ball, k) <= 24 * k.s + 1, `턴 ${ms.turn} α ${a}: 공이 차는 선수 발 앞 (${dist(f.ball, k).toFixed(1)})`);
    }
    const fr = frame(prev, ms, r);
    const kr = pl(fr, key);
    const toward = end.sx - kr.sx;
    if (Math.abs(toward) > 30) {
      assert.equal(Math.sign(fr.ball.sx - kr.sx), Math.sign(toward), `턴 ${ms.turn}: 떠나는 순간 공은 차는 쪽 발 앞`);
      // 턴 시작 공 (공격 방향 발 앞) 과 반대쪽으로 차는 턴 = 뒤로 주는 패스 — 공을 차는 쪽으로 굴려 놓았다
      if (Math.sign(toward) !== Math.sign(f0.ball.sx - pl(f0, key).sx)) back += 1;
    }
    const mid = frame(prev, ms, r + (1 - r) * 0.5).ball;
    assert.ok(dist(mid, end) < dist(fr.ball, end) + 1e-6, `턴 ${ms.turn}: release 뒤 끝 쪽으로 간다`);
    kicks += 1;
  }
  assert.ok(kicks >= 12 && plain >= 12 && back >= 1, `차는 턴 ${kicks} · 뒤로 주는 패스 ${back} · 그 밖 ${plain}`);
});
