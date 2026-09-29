// test/layout.test.mjs — ARCHITECTURE §12.2 · §12.4 · §13.6 (js/ui/layout.js computeLayout)
// 합성 view (4 포메이션 × 공격 팀 2 × 단계 4 × 모든 carrier/defender/receiver 조합) + 실제 엔진 경기의 매 view.
// v0.3: 받는 선수 후보 전원(view.receivers 패스+크로스)이 receiver 역할로 도착 구역에 선다. resolvePreview 는 receivers·필살기 변형도 고른다.
// §13.9: 픽셀 변환 fieldToScreen/screenToField (세로·가로), 가로 필드 비율 범위의 겹침·규칙 위치.
// 경기 화면은 가로 전용 (고정 스테이지 1280×720 — 규칙 영역 1244×528, 토큰 44px): LAND_RANGE 앞 세 쌍. 세로 비율(UI_RANGE)은 computeLayout 견고성 검사로 남긴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeLayout, resolvePreview, receiverCandidates, ZONES, SHAPE, LANES, X_MIN, X_MAX, HIGHLIGHTS, RECEIVER_INSET, BOX_LANE, zoneFor, zoneAtY, tokenDistance, withJosa,
  fieldToScreen, screenToField,
} from "../js/ui/layout.js";
import { loadData, clone, run, match } from "./helpers.mjs";

const POS_BY_LINE = ["FW", "MF", "DF", "GK"];
const FORMATIONS = {
  "2-2-2": { DF: 2, MF: 2, FW: 2 },
  "3-1-2": { DF: 3, MF: 1, FW: 2 },
  "1-3-2": { DF: 1, MF: 3, FW: 2 },
  "2-3-1": { DF: 2, MF: 3, FW: 1 },
};
const FORMS = Object.keys(FORMATIONS);
const ASPECT = 0.8;
const MIN_D = 7.5; // tokenSize 0.075 × 100 (필드 폭 %)
const MIN_DY = MIN_D * ASPECT; // 세로 % 환산 = 6
const TOL = 1e-6;
const other = (s) => (s === "home" ? "away" : "home");

/* ------------------------------------------------------------------ */
/* 합성 view                                                             */
/* ------------------------------------------------------------------ */

const NAMES = {
  home: { GK: "네리아", DF1: "돌바르", DF2: "아르덴", DF3: "타린", MF1: "실루엔", MF2: "타린", MF3: "미르카", FW1: "울릭", FW2: "그룸바" },
  away: { GK: "마르텐", DF1: "오르반", DF2: "브란", DF3: "케일", MF1: "셀마", MF2: "다린", MF3: "페린", FW1: "카손", FW2: "로벨" },
};

function makeTeam(side, formation, { withPosition = true } = {}) {
  const counts = FORMATIONS[formation];
  const players = [{ slot: "GK", position: "GK" }];
  for (const pos of ["DF", "MF", "FW"]) for (let i = 1; i <= counts[pos]; i++) players.push({ slot: `${pos}${i}`, position: pos });
  return players.map((p, i) => {
    const out = {
      id: `${side === "home" ? "h" : "a"}_${p.slot}`,
      name: NAMES[side][p.slot],
      slot: p.slot,
      stamina: 100 - i * 7,
      staminaMax: 100,
      portraitColor: "#8899aa",
      isYouth: i === 2,
      isCarrier: false,
      isDefender: false,
    };
    if (withPosition) out.position = p.position;
    return out;
  });
}

const posOfSynthetic = (p) => p.position || (p.slot === "GK" ? "GK" : p.slot.slice(0, 2));

/** 엔진 규칙의 패스 수신 후보: 다음 단계 1 → MF, 2·3 → FW (carrier 제외). ④ 단계는 패스 없음 */
function syntheticReceivers(players, step, carrierId) {
  if (step >= 3) return [];
  const pos = step + 1 <= 1 ? "MF" : "FW";
  return players.filter((p) => posOfSynthetic(p) === pos && p.id !== carrierId);
}

function makeView({ homeF, awayF, atk, step, carrierId, defenderId, receiverId = null, phase = "decision", withPosition = true, extra = {} }) {
  const players = { home: makeTeam("home", homeF, { withPosition }), away: makeTeam("away", awayF, { withPosition }) };
  const def = other(atk);
  const c = players[atk].find((p) => p.id === carrierId) || null;
  const d = defenderId ? players[def].find((p) => p.id === defenderId) : null;
  if (c) c.isCarrier = true;
  if (d) d.isDefender = true;
  const r = receiverId ? players[atk].find((p) => p.id === receiverId) : null;
  return {
    attackingSide: atk,
    lineIndex: step,
    phase,
    carrier: c ? { id: c.id, name: c.name, side: atk } : null,
    defender: d ? { id: d.id, name: d.name, side: def, coverCount: 0 } : null,
    receiverPreview: r ? { id: r.id, name: r.name, side: atk } : null,
    players,
    penalties: null,
    finished: false,
    recentEvents: [],
    ...extra,
  };
}

/** 합성 view 전 조합: 포메이션 쌍 × 공격 팀 × 단계 × carrier(필드 전원) × defender(듀얼 라인 전원, + 없음) × receiver(후보 전원 + 없음) */
function* allSyntheticViews() {
  for (const homeF of FORMS) {
    for (const awayF of FORMS) {
      for (const atk of ["home", "away"]) {
        for (let step = 0; step <= 3; step++) {
          const base = makeView({ homeF, awayF, atk, step, carrierId: null, defenderId: null });
          const atkPlayers = base.players[atk];
          const defPlayers = base.players[other(atk)];
          const duelPos = POS_BY_LINE[step];
          const defenders = [null, ...defPlayers.filter((p) => posOfSynthetic(p) === duelPos).map((p) => p.id)];
          for (const c of atkPlayers.filter((p) => posOfSynthetic(p) !== "GK")) {
            const receivers = [null, ...syntheticReceivers(atkPlayers, step, c.id).map((p) => p.id)];
            for (const defenderId of defenders) {
              for (const receiverId of receivers) {
                yield {
                  where: `${homeF} vs ${awayF} ${atk} ④${step + 1} c=${c.id} d=${defenderId} r=${receiverId}`,
                  view: makeView({ homeF, awayF, atk, step, carrierId: c.id, defenderId, receiverId, phase: defenderId ? "decision" : "possessionEnd" }),
                };
              }
            }
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 불변식                                                                */
/* ------------------------------------------------------------------ */

function viewPos(p) {
  if (["GK", "DF", "MF", "FW"].includes(p.position)) return p.position;
  return /^(GK|DF|MF|FW)/.exec(String(p.slot))[1];
}

function assertCommon(view, L, where) {
  const ids = [...view.players.home, ...view.players.away].map((p) => String(p.id));
  assert.equal(L.tokens.length, ids.length, `${where}: 토큰 수`);
  assert.deepEqual(L.tokens.map((t) => t.id), ids, `${where}: 토큰 순서 = home → away 선수 순서`);
  for (const t of L.tokens) {
    assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y), `${where}: ${t.id} 좌표 NaN`);
    assert.ok(t.x >= X_MIN - TOL && t.x <= X_MAX + TOL, `${where}: ${t.id} x=${t.x} 범위 [6,94]`);
    assert.ok(t.y >= 0 && t.y <= 100, `${where}: ${t.id} y=${t.y} 범위 [0,100]`);
    assert.ok(t.staminaRatio >= 0 && t.staminaRatio <= 1, `${where}: staminaRatio`);
    assert.ok(["carrier", "defender", "cover", "receiver", "broken", "support", "gk"].includes(t.role), `${where}: role ${t.role}`);
  }
  assert.ok(L.ball.x >= 0 && L.ball.x <= 100 && L.ball.y >= 0 && L.ball.y <= 100, `${where}: 공 범위`);
  // 겹침 없음 (필드 폭 기준 거리, 세로는 aspect 로 환산)
  for (let i = 0; i < L.tokens.length; i++) {
    for (let j = i + 1; j < L.tokens.length; j++) {
      const a = L.tokens[i];
      const b = L.tokens[j];
      const d = tokenDistance(a, b, ASPECT);
      assert.ok(d >= MIN_D - TOL, `${where}: ${a.id}(${a.x.toFixed(2)},${a.y}) ↔ ${b.id}(${b.x.toFixed(2)},${b.y}) 겹침 d=${d.toFixed(3)}`);
    }
  }
  // 결정성 + view 불변
  const before = JSON.stringify(view);
  assert.deepEqual(computeLayout(view), L, `${where}: 같은 view → 같은 결과`);
  assert.equal(JSON.stringify(view), before, `${where}: view 를 바꾸지 않음`);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(L))), JSON.stringify(L), `${where}: JSON 직렬화 가능`);
}

/** 인플레이 레이아웃 불변식 (§12.2 · §12.4) */
function assertPlayLayout(view, L, where) {
  assert.equal(L.mode, "play", where);
  const atk = view.attackingSide;
  const def = other(atk);
  const step = view.attackStep ?? view.lineIndex;
  const zone = zoneFor(atk, step);
  assert.equal(L.zone, zone, `${where}: zone`);
  if (view.zone !== undefined) assert.equal(view.zone, zone, `${where}: view.zone = zoneOf`);
  const Z = ZONES[zone - 1];
  assert.ok(L.ball.y >= Z.from && L.ball.y <= Z.to, `${where}: 공 y=${L.ball.y} 가 Z${zone} [${Z.from},${Z.to}] 안`);
  assert.equal(zoneAtY(L.ball.y), zone, `${where}: zoneAtY(공)`);
  assert.deepEqual(L.track, { side: atk, step, dir: atk === "home" ? "up" : "down" }, `${where}: track`);
  assertCommon(view, L, where);

  const toY = (fy) => (atk === "home" ? fy : 100 - fy);
  const byId = new Map(L.tokens.map((t) => [t.id, t]));
  const carrierId = view.carrier ? view.carrier.id : null;
  const defenderId = view.defender ? view.defender.id : null;
  const receiverId = view.receiverPreview ? view.receiverPreview.id : null;
  const behind = (y) => (atk === "home" ? y < L.ball.y : y > L.ball.y); // 공 뒤 (공격 팀 골 쪽)
  const ahead = (y) => (atk === "home" ? y > L.ball.y && y <= 100 : y < L.ball.y && y >= 0); // 공과 수비 팀 골 사이

  // carrier = 공 좌표
  if (carrierId) {
    const c = byId.get(carrierId);
    assert.equal(c.role, "carrier", `${where}: carrier role`);
    assert.equal(c.x, L.ball.x, `${where}: carrier x = 공 x`);
    assert.equal(c.y, L.ball.y, `${where}: carrier y = 공 y`);
    assert.equal(L.ball.y, toY(SHAPE.ball[step]), `${where}: 공 y = SHAPE.ball`);
  }
  assert.equal(L.tokens.filter((t) => t.role === "carrier").length, carrierId ? 1 : 0, `${where}: carrier 1명`);

  // receiver 역할 = 받는 선수 후보 전원 (§13.4 view.receivers 패스+크로스, 없으면 receiverPreview) — v0.3 §13.6
  const cands = receiverCandidates(view).filter((c) => c.id !== carrierId);
  const landingOf = new Map(cands.map((c) => [c.id, c.arrival]));
  const receivers = L.tokens.filter((t) => t.role === "receiver").map((t) => t.id);
  const expectReceiver = view.players[atk].map((p) => String(p.id)).filter((id) => landingOf.has(id));
  assert.deepEqual(receivers, expectReceiver, `${where}: receiver = 받는 선수 후보 전원`);
  assert.deepEqual(L.receiverIds, expectReceiver, `${where}: receiverIds`);
  assert.equal(L.receiverId, receiverId && landingOf.has(receiverId) ? receiverId : null, `${where}: receiverId = receiverPreview`);
  // ④ 박스 연결(컷백·센터링, 2026-09-29): 후보는 공과 같은 박스 안 (컷백은 뒤로 내준다) — 그 밖에는 공보다 앞
  for (const id of expectReceiver) {
    if (step >= 3) assert.equal(zoneAtY(byId.get(id).y), zone, `${where}: 박스 연결 후보 ${id} 는 박스 안`);
    else assert.ok(!behind(byId.get(id).y) && byId.get(id).y !== L.ball.y, `${where}: 후보 ${id} 는 공보다 앞`);
  }

  // defender: carrier 와 같은 레인, 세로 간격 ≥ 토큰 지름, 공과 자기 골 사이
  const defs = L.tokens.filter((t) => t.role === "defender").map((t) => t.id);
  assert.deepEqual(defs, defenderId ? [defenderId] : [], `${where}: defender`);
  if (defenderId) {
    const d = byId.get(defenderId);
    assert.equal(d.side, def);
    assert.ok(ahead(d.y), `${where}: 듀얼 수비수 y=${d.y} 가 공(${L.ball.y})과 자기 골 사이`);
    if (carrierId) {
      assert.equal(d.x, byId.get(carrierId).x, `${where}: 듀얼 수비수 x = carrier x`);
      assert.ok(Math.abs(d.y - L.ball.y) >= MIN_DY - TOL, `${where}: carrier–defender 세로 간격 ${Math.abs(d.y - L.ball.y)}`);
    }
  }

  // 수비 팀: 뚫린 라인은 공 뒤, 남은 라인(GK 포함)은 공과 골 사이
  for (const p of view.players[def]) {
    const t = byId.get(String(p.id));
    const pos = viewPos(p);
    const li = POS_BY_LINE.indexOf(pos);
    if (li < step) {
      assert.equal(t.role, "broken", `${where}: ${t.id} 뚫린 라인 role`);
      assert.ok(behind(t.y), `${where}: 뚫린 ${t.id} y=${t.y} 는 공(${L.ball.y}) 뒤`);
    } else {
      assert.notEqual(t.role, "broken", `${where}: ${t.id} 남은 라인이 broken`);
      assert.ok(ahead(t.y), `${where}: 남은 ${t.id} (${pos}) y=${t.y} 는 공(${L.ball.y})과 골 사이`);
      if (t.id !== defenderId) {
        if (pos === "GK") assert.equal(t.role, "gk", `${where}: 수비 GK role`);
        else if (li === step && defenderId) assert.equal(t.role, "cover", `${where}: ${t.id} cover`);
        else assert.equal(t.role, "support", `${where}: ${t.id} 대기 라인`);
      }
    }
    // 세로 좌표 = 규칙 위치 (겹침 방지는 가로로만)
    if (t.id !== defenderId) assert.equal(t.y, toY(SHAPE.def[pos][step]), `${where}: ${t.id} 세로 = SHAPE.def`);
  }
  // 공격 팀: 세로 = SHAPE.atk, GK 는 gk, 나머지 support. 패스 후보는 패스가 도착하는 구역 안 (GDD §9.3 공격 팀 2)
  for (const p of view.players[atk]) {
    const t = byId.get(String(p.id));
    const pos = viewPos(p);
    if (t.id === carrierId) continue;
    if (expectReceiver.includes(t.id)) {
      const landing = landingOf.get(t.id);
      const edgeY = toY(Math.max(SHAPE.atk[pos][step], ZONES[landing + 1].from + RECEIVER_INSET));
      // ④ 박스 연결 후보: 박스 가장자리 또는 (연결 화살표가 다른 토큰 위를 지나지 않게) 깊은 줄 BOX_LANE.deep
      if (step >= 3 && landing === 3) assert.ok(t.y === edgeY || t.y === toY(BOX_LANE.deep), `${where}: ${t.id} 박스 연결 후보 세로 ${t.y}`);
      else assert.equal(t.y, edgeY, `${where}: ${t.id} 패스 후보 세로`);
      assert.equal(zoneAtY(t.y), zoneFor(atk, landing), `${where}: 패스 후보 ${t.id} y=${t.y} 는 도착 구역 Z${zoneFor(atk, landing)} 안`);
      continue;
    }
    assert.equal(t.y, toY(SHAPE.atk[pos][step]), `${where}: ${t.id} 세로 = SHAPE.atk`);
    assert.equal(t.role, pos === "GK" ? "gk" : "support", `${where}: ${t.id} 공격 팀 role`);
  }

  // v0.1 회귀: 상대 ④ 슈팅 단계면 우리 필드 6명 전원 공 뒤(위), 우리 GK 만 공과 골 사이(아래)
  if (atk === "away" && step === 3) {
    const home = view.players.home.map((p) => ({ p, t: byId.get(String(p.id)) }));
    const field = home.filter(({ p }) => viewPos(p) !== "GK");
    assert.equal(field.length, 6, `${where}: 필드 6명`);
    for (const { t } of field) assert.ok(t.y > L.ball.y, `${where}: [회귀] 우리 ${t.name} y=${t.y} > 공 y=${L.ball.y}`);
    const gk = home.find(({ p }) => viewPos(p) === "GK").t;
    assert.ok(gk.y < L.ball.y, `${where}: [회귀] 우리 GK y=${gk.y} < 공 y=${L.ball.y}`);
  }

  // 위기·찬스 (GDD §9.5)
  const hl = HIGHLIGHTS[atk][zone];
  assert.deepEqual(L.highlight, { zone, level: view.finished ? null : hl ? hl.level : null, label: view.finished || !hl ? "" : hl.label }, `${where}: highlight`);
  assert.equal(typeof L.remainingText, "string");
  assert.match(L.remainingText, /^남은 수비: /);
  if (view.remaining && typeof view.remaining.text === "string") assert.equal(L.remainingText, view.remaining.text);
  assert.ok(L.banner === null || typeof L.banner === "string");
  assert.ok(!/undefined|null|NaN/.test(L.banner || ""), `${where}: banner "${L.banner}"`);
  if (carrierId) assert.ok(L.banner && L.banner.length > 0, `${where}: banner 있음`);
}

const BEAT_SET = new Set(["kickoff", "counter", "duel", "turnover", "save", "goal", "penalty", "distribution"]);

/**
 * GK 배급 대기 레이아웃 (2026-09-29, view.phase "distribution"): 배급 GK = 공 (자기 박스 = gkZone), 나머지 13명은 전부 GK 앞,
 * 받는 선수 후보 = 짧은 패스 · 롱패스 받는 선수 (view.distribution.options.*.success.starterId), defender = 롱패스 경합 상대 MF,
 * 뚫린 라인 없음, track = ① 전 (gk: true), 배너 = "… 배급 …". exact = 세로가 빌드업 모양 그대로인지도 (기본 비율)
 */
function assertDistributionLayout(view, L, where, { exact = true } = {}) {
  const d = view.distribution;
  const atk = d.side;
  const def = other(atk);
  const gkZone = atk === "home" ? 1 : 5;
  const toY = (fy) => (atk === "home" ? fy : 100 - fy);
  assert.equal(L.mode, "play", where);
  assertCommon(view, L, where);
  assert.equal(L.attackingSide, atk, `${where}: 배급 팀`);
  assert.equal(L.zone, gkZone, `${where}: zone = 배급 GK 의 박스`);
  if (d.gkZone != null) assert.equal(d.gkZone, gkZone, `${where}: 엔진 gkZone`);
  assert.equal(zoneAtY(L.ball.y), gkZone, `${where}: 공 y=${L.ball.y} 는 GK 박스 안`);
  assert.deepEqual(L.track, { side: atk, step: 0, dir: atk === "home" ? "up" : "down", gk: true }, `${where}: track (① 전)`);
  assert.equal(L.nextBall, null);
  assert.deepEqual(L.highlight, { zone: gkZone, level: null, label: "" }, `${where}: 강조 없음`);
  const find = (side, id) => L.tokens.find((t) => t.side === side && t.id === String(id));
  const gk = find(atk, d.gkId);
  assert.equal(L.carrierId, String(d.gkId));
  assert.ok(gk && gk.role === "carrier" && gk.position === "GK", `${where}: 배급 GK = carrier`);
  assert.deepEqual({ x: gk.x, y: gk.y }, L.ball, `${where}: 공 = GK`);
  const ahead = (y) => (atk === "home" ? y > L.ball.y : y < L.ball.y);
  for (const t of L.tokens) if (t !== gk) assert.ok(ahead(t.y), `${where}: ${t.side} ${t.id} y=${t.y} 는 GK(공 ${L.ball.y}) 앞`);
  const want = [...new Set([d.options.short.success.starterId, d.options.long.success.starterId].map(String))];
  assert.deepEqual(L.tokens.filter((t) => t.role === "receiver").map((t) => t.id).sort(), want.slice().sort(), `${where}: 받는 선수 = 짧은 패스 · 롱패스 받는 선수`);
  assert.deepEqual(L.receiverIds.slice().sort(), want.slice().sort());
  assert.deepEqual(L.dist, {
    short: String(d.options.short.success.starterId), long: String(d.options.long.success.starterId), contest: d.contest ? String(d.contest.id) : null,
  }, `${where}: dist`);
  const defs = L.tokens.filter((t) => t.role === "defender");
  if (d.contest) {
    assert.equal(defs.length, 1, `${where}: 롱패스 경합 1명`);
    assert.equal(defs[0].side, def);
    assert.equal(defs[0].id, String(d.contest.id));
    assert.equal(defs[0].position, "MF", `${where}: 경합 = 상대 MF`);
    assert.equal(L.defenderId, String(d.contest.id));
  }
  assert.equal(L.tokens.filter((t) => ["broken", "cover"].includes(t.role)).length, 0, `${where}: 뚫린 · 커버 없음`);
  if (exact) {
    for (const t of L.tokens) {
      if (t === gk) continue;
      const shape = t.side === atk ? SHAPE.atk : SHAPE.def;
      assert.equal(t.y, toY(shape[t.position][0]), `${where}: ${t.side} ${t.id} 세로 = ① 모양`);
    }
  }
  assert.ok(typeof L.banner === "string" && /배급/.test(L.banner) && !/undefined|null|NaN/.test(L.banner), `${where}: banner "${L.banner}"`);
  assert.match(L.remainingText, /^남은 수비: /);
}

/**
 * 경기 종료 레이아웃 (인플레이로 끝남): 마지막 비트가 끝난 뒤의 모습.
 * 턴오버/세이브 → 공을 얻은 선수(뺏은 수비수 · GK)가 공을 갖는다. 골 → 공은 골문 안, carrier 없음.
 */
function assertFinishedLayout(view, L, where) {
  assert.equal(L.mode, "play", where);
  assertCommon(view, L, where);
  const lb = view.lastBeat || [...(view.recentEvents || [])].reverse().find((e) => BEAT_SET.has(e.type));
  assert.ok(lb, `${where}: 마지막 비트`);
  assert.equal(L.highlight.level, null, `${where}: 종료 후 강조 없음`);
  assert.equal(L.highlight.zone, L.zone);
  assert.equal(L.banner, "경기 종료");
  assert.equal(L.remainingText, "", `${where}: 종료 후 남은 수비 문구 없음`);
  assert.equal(L.defenderId, null);
  assert.equal(L.receiverId, null);
  assert.equal(L.nextBall, null);
  assert.equal(zoneAtY(L.ball.y), L.zone, `${where}: zone = 공 구역`);
  assert.equal(L.tokens.filter((t) => ["defender", "receiver", "cover"].includes(t.role)).length, 0, `${where}: 듀얼 역할 없음`);
  const carriers = L.tokens.filter((t) => t.role === "carrier");
  const find = (side, id) => L.tokens.find((t) => t.side === side && t.id === String(id));
  if (lb.type === "goal") {
    assert.equal(carriers.length, 0, `${where}: 골 — carrier 없음`);
    const top = lb.attackingSide === "home";
    assert.ok(top ? L.ball.y >= 99 : L.ball.y <= 1, `${where}: 골 — 공 y=${L.ball.y} 는 골문 안`);
    assert.equal(L.zone, top ? 5 : 1);
    assert.equal(L.attackingSide, lb.attackingSide);
    assert.equal(find(lb.attackingSide, lb.playerId).role, "support", `${where}: 득점자는 공 없이`);
    return;
  }
  assert.ok(lb.type === "turnover" || lb.type === "save", `${where}: 마지막 비트 ${lb.type}`);
  assert.equal(carriers.length, 1, `${where}: carrier 1명`);
  const c = carriers[0];
  assert.equal(c.side, lb.toAttackingSide, `${where}: 공을 얻은 팀이 공을 가진다`);
  assert.notEqual(c.side, lb.side, `${where}: 공을 잃은 팀이 아니다`);
  assert.equal(c.id, String(lb.defenderId), `${where}: 뺏은 선수 / 세이브한 GK 가 공을 가진다`);
  assert.deepEqual({ x: c.x, y: c.y }, L.ball, `${where}: 공 = 그 선수 좌표`);
  assert.notEqual(find(lb.side, lb.playerId).role, "carrier", `${where}: 공을 잃은 선수는 carrier 아님`);
  assert.equal(L.attackingSide, lb.toAttackingSide);
  assert.deepEqual(L.track, { side: lb.toAttackingSide, step: lb.toStep, dir: lb.toAttackingSide === "home" ? "up" : "down" });
  if (lb.type === "turnover") {
    assert.equal(L.zone, lb.toZone, `${where}: 턴오버 — 역습 시작 구역`);
  } else {
    assert.equal(c.position, "GK");
    assert.equal(L.zone, lb.zone, `${where}: 세이브 — 공은 GK 품 (슛한 박스)`);
  }
}

/** 승부차기 레이아웃 불변식 */
function assertPenaltyLayout(view, L, where, { kickSide, kickerId } = {}) {
  assert.equal(L.mode, "penalties", where);
  assertCommon(view, L, where);
  const side = kickSide || (view.zone === 5 ? "home" : view.zone === 1 ? "away" : view.penalties.turn);
  const top = side === "home";
  assert.equal(L.zone, top ? 5 : 1, `${where}: 승부차기 zone`);
  if (view.zone !== undefined) assert.equal(view.zone, L.zone, `${where}: view.zone`);
  assert.deepEqual(L.ball, { x: 50, y: top ? 90 : 10 }, `${where}: 공 = 페널티 스폿`);
  assert.equal(zoneAtY(L.ball.y), L.zone);
  const carriers = L.tokens.filter((t) => t.role === "carrier");
  const defenders = L.tokens.filter((t) => t.role === "defender");
  const supports = L.tokens.filter((t) => t.role === "support");
  assert.equal(carriers.length, 1, `${where}: 키커 1명`);
  assert.equal(defenders.length, 1, `${where}: GK 1명`);
  assert.equal(supports.length, 12, `${where}: 나머지 12명`);
  const k = carriers[0];
  const g = defenders[0];
  assert.equal(k.side, side, `${where}: 키커 팀`);
  if (kickerId) assert.equal(k.id, kickerId, `${where}: 키커 id`);
  assert.ok(tokenDistance(k, L.ball, ASPECT) <= 2 * MIN_D, `${where}: 키커는 공 옆`);
  assert.ok(top ? k.y >= 84 : k.y <= 16, `${where}: 키커는 박스 안`);
  assert.equal(g.side, other(side));
  assert.equal(g.position, "GK");
  assert.ok(top ? g.y >= 96 : g.y <= 4, `${where}: GK 는 골문`);
  for (const t of supports) {
    assert.ok(top ? t.y >= 64 && t.y <= 76 : t.y >= 24 && t.y <= 36, `${where}: ${t.id} y=${t.y} 박스 밖 반원`);
  }
  assert.equal(L.track.side, side);
  assert.equal(L.track.step, 3);
  assert.equal(L.track.dir, top ? "up" : "down");
  assert.ok(typeof L.banner === "string" && !/undefined|null|NaN/.test(L.banner), `${where}: banner`);
}

/* ------------------------------------------------------------------ */
/* 합성 view 테스트                                                       */
/* ------------------------------------------------------------------ */

test("상수: ZONES·SHAPE 계약 값, SHAPE 공 좌표가 zoneFor 구역 안", () => {
  assert.deepEqual(ZONES.map((z) => [z.id, z.from, z.to]), [[1, 0, 16], [2, 16, 40], [3, 40, 60], [4, 60, 84], [5, 84, 100]]);
  assert.deepEqual(SHAPE.ball, [28, 50, 72, 90]);
  assert.deepEqual(LANES, { 1: [50], 2: [30, 70], 3: [20, 50, 80] });
  assert.deepEqual([0, 1, 2, 3].map((l) => zoneFor("home", l)), [2, 3, 4, 5]);
  assert.deepEqual([0, 1, 2, 3].map((l) => zoneFor("away", l)), [4, 3, 2, 1]);
  for (let s = 0; s < 4; s++) {
    assert.equal(zoneAtY(SHAPE.ball[s]), zoneFor("home", s));
    assert.equal(zoneAtY(100 - SHAPE.ball[s]), zoneFor("away", s));
  }
  assert.equal(withJosa("카손", "이/가"), "카손이");
  assert.equal(withJosa("네리아", "과/와"), "네리아와");
  assert.equal(withJosa("그룸바", "이/가"), "그룸바가");
  assert.equal(withJosa("실루엔", "과/와"), "실루엔과");
});

test("합성 view: 4 포메이션² × 공격 팀 2 × 단계 4 × carrier/defender/receiver 전 조합 불변식", () => {
  let n = 0;
  const seen = new Set();
  for (const { where, view } of allSyntheticViews()) {
    const L = computeLayout(view);
    assertPlayLayout(view, L, where);
    seen.add(`${view.attackingSide}${view.lineIndex}`);
    n++;
  }
  assert.equal(seen.size, 8, "공격 팀 2 × 단계 4");
  assert.ok(n > 1000, `조합 수 ${n}`);
});

test("[회귀 v0.1] 상대 ④ 슈팅: 우리 필드 6명 전원 공 뒤, 우리 GK 만 공 앞 — 4 포메이션", () => {
  for (const homeF of FORMS) {
    for (const awayF of FORMS) {
      const base = makeView({ homeF, awayF, atk: "away", step: 3, carrierId: "a_FW1", defenderId: "h_GK" });
      const L = computeLayout(base);
      const ball = L.ball;
      assert.ok(ball.y < 16, `공이 우리 박스(Z1) 안: ${ball.y}`);
      for (const t of L.tokens.filter((t) => t.side === "home")) {
        if (t.position === "GK") assert.ok(t.y < ball.y, `GK ${t.y} < 공 ${ball.y}`);
        else {
          assert.ok(t.y > ball.y, `${t.name} ${t.y} > 공 ${ball.y}`);
          assert.equal(t.role, "broken");
        }
      }
      // v0.1 처럼 상대 FW 가 하프라인 너머(y > 50)에 그려지지 않는다
      const kason = L.tokens.find((t) => t.id === "a_FW1");
      assert.ok(kason.y < 16 && kason.role === "carrier", `카손 y=${kason.y}`);
      assert.equal(L.highlight.level, "crisis");
      assert.equal(L.highlight.label, "슈팅 위기");
      assert.equal(L.banner, "⚠ 슈팅 위기 — 카손이 우리 박스 진입, 네리아와 1:1");
      assert.equal(L.remainingText, "남은 수비: GK");
    }
  }
});

test("highlight 표 (GDD §9.5) 와 track · remainingText · banner", () => {
  const cases = [
    { atk: "home", step: 0, zone: 2, level: null, label: "", remaining: "남은 수비: FW 2 + MF 2 + DF 2 + GK" },
    { atk: "home", step: 1, zone: 3, level: null, label: "", remaining: "남은 수비: MF 2 + DF 2 + GK" },
    { atk: "home", step: 2, zone: 4, level: "chance", label: "찬스", remaining: "남은 수비: DF 2 + GK" },
    { atk: "home", step: 3, zone: 5, level: "shotChance", label: "슈팅 찬스", remaining: "남은 수비: GK" },
    { atk: "away", step: 0, zone: 4, level: null, label: "", remaining: "남은 수비: FW 2 + MF 2 + DF 2 + GK" },
    { atk: "away", step: 1, zone: 3, level: null, label: "", remaining: "남은 수비: MF 2 + DF 2 + GK" },
    { atk: "away", step: 2, zone: 2, level: "danger", label: "위험 지역", remaining: "남은 수비: DF 2 + GK" },
    { atk: "away", step: 3, zone: 1, level: "crisis", label: "슈팅 위기", remaining: "남은 수비: GK" },
  ];
  for (const c of cases) {
    const carrierId = c.atk === "home" ? "h_FW2" : "a_FW1";
    const defPos = POS_BY_LINE[c.step];
    const defenderId = `${c.atk === "home" ? "a" : "h"}_${defPos === "GK" ? "GK" : defPos + "1"}`;
    const view = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: c.atk, step: c.step, carrierId, defenderId });
    const L = computeLayout(view);
    assert.deepEqual(L.highlight, { zone: c.zone, level: c.level, label: c.label }, `${c.atk} ${c.step}`);
    assert.equal(L.remainingText, c.remaining);
    assert.deepEqual(L.track, { side: c.atk, step: c.step, dir: c.atk === "home" ? "up" : "down" });
    // 배너는 선수 이름을 넣는다 (예외: GDD §9.5 예시 그대로인 "중원 돌파 — 남은 수비: …")
    if (!(c.atk === "home" && c.step === 2)) assert.ok(L.banner.includes(c.atk === "home" ? "그룸바" : "카손"), L.banner);
  }
  // 배너 예시 (GDD §9.5)
  const mid = computeLayout(makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 2, carrierId: "h_FW2", defenderId: "a_DF1" }));
  assert.equal(mid.banner, "중원 돌파 — 남은 수비: DF 2 + GK");
  const shot = computeLayout(makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 3, carrierId: "h_FW2", defenderId: "a_GK" }));
  assert.equal(shot.banner, "★ 슈팅 찬스 — 그룸바가 상대 박스 진입, 마르텐과 1:1");
  // 역습 직후 (lastBeat = 이 팀의 counter)
  const counter = computeLayout(makeView({
    homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 2, carrierId: "h_FW2", defenderId: "a_DF1",
    extra: { lastBeat: { type: "counter", side: "home", playerId: "h_FW2", seq: 9 } },
  }));
  assert.equal(counter.banner, "역습! 상대 진영에서 시작 — 그룸바");
  // lastBeat 가 없으면 recentEvents 의 마지막 비트 이벤트로 대신
  const counterAway = computeLayout(makeView({
    homeF: "2-2-2", awayF: "2-2-2", atk: "away", step: 2, carrierId: "a_FW1", defenderId: "h_DF1",
    extra: { recentEvents: [{ type: "turnover", side: "home" }, { type: "counter", side: "away", playerId: "a_FW1" }, { type: "skill", side: "home" }] },
  }));
  assert.equal(counterAway.banner, "⚠ 상대 역습! 우리 진영에서 시작 — 카손");
  // view.remaining 이 있으면 그 문구를 쓴다
  const withRemaining = computeLayout(makeView({
    homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 1, carrierId: "h_MF1", defenderId: "a_MF1",
    extra: { remaining: { lines: ["MF", "DF"], gk: true, text: "남은 수비: MF 2 + DF 2 + GK" } },
  }));
  assert.equal(withRemaining.remainingText, "남은 수비: MF 2 + DF 2 + GK");
  // 종료 후: highlight 없음, banner "경기 종료"
  const fin = computeLayout(makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "away", step: 3, carrierId: "a_FW1", defenderId: null, phase: "finished", extra: { finished: true } }));
  assert.equal(fin.highlight.level, null);
  assert.equal(fin.banner, "경기 종료");
});

test("v0.2 view 필드가 없어도 / 있어도 동작: position 없는 players, zone·attackStep·receiverPreview", () => {
  // position 없이 slot 만 → slot 에서 포지션 유도
  for (const atk of ["home", "away"]) {
    for (let step = 0; step <= 3; step++) {
      const carrierId = `${atk === "home" ? "h" : "a"}_${["DF1", "MF1", "FW1", "FW1"][step]}`;
      const defPos = POS_BY_LINE[step];
      const defenderId = `${atk === "home" ? "a" : "h"}_${defPos === "GK" ? "GK" : defPos + "1"}`;
      const v1 = makeView({ homeF: "1-3-2", awayF: "3-1-2", atk, step, carrierId, defenderId, withPosition: false });
      const v2 = makeView({ homeF: "1-3-2", awayF: "3-1-2", atk, step, carrierId, defenderId });
      const L1 = computeLayout(v1);
      const L2 = computeLayout(v2);
      assertPlayLayout(v1, L1, `slot-only ${atk} ${step}`);
      assert.deepEqual(L1.tokens.map((t) => [t.id, t.position, t.x, t.y, t.role]), L2.tokens.map((t) => [t.id, t.position, t.x, t.y, t.role]));
      // 엔진 v0.2 필드를 채워도 같은 결과 (zone·attackStep·attackDir 는 규칙과 일치)
      const v3 = { ...v2, zone: zoneFor(atk, step), attackStep: step, attackDir: atk === "home" ? "up" : "down" };
      const L3 = computeLayout(v3);
      assert.deepEqual(L3, L2, `v0.2 필드 ${atk} ${step}`);
      assert.equal(L3.zone, v3.zone);
    }
  }
  // lineIndex 가 없어도 attackStep 만으로
  const v = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "away", step: 3, carrierId: "a_FW1", defenderId: "h_GK" });
  delete v.lineIndex;
  v.attackStep = 3;
  assert.equal(computeLayout(v).zone, 1);
  // 빈 view 도 throw 없이
  const empty = computeLayout({});
  assert.deepEqual(empty.tokens, []);
  assert.equal(empty.zone, 2);
  assert.equal(computeLayout(null).tokens.length, 0);
});

test("opts: aspect·tokenSize 를 바꿔도 겹침 없음 (세로 좌표 유지)", () => {
  for (const [aspect, tokenSize] of [[0.75, 0.075], [0.7, 0.08], [0.9, 0.07]]) {
    for (const { where, view } of allSyntheticViews()) {
      if (!/^(2-3-1 vs 1-3-2|1-3-2 vs 2-3-1|3-1-2 vs 3-1-2)/.test(where)) continue;
      const L = computeLayout(view, { aspect, tokenSize });
      const minD = tokenSize * 100;
      for (let i = 0; i < L.tokens.length; i++) {
        for (let j = i + 1; j < L.tokens.length; j++) {
          const d = tokenDistance(L.tokens[i], L.tokens[j], aspect);
          assert.ok(d >= minD - TOL, `${where} aspect ${aspect} size ${tokenSize}: ${L.tokens[i].id}↔${L.tokens[j].id} d=${d}`);
        }
      }
      const c = L.tokens.find((t) => t.role === "carrier");
      assert.deepEqual({ x: c.x, y: c.y }, L.ball);
    }
  }
});

test("승부차기 레이아웃 (합성): 공 = 페널티 스폿, 키커 = 공 옆, GK = 골문, 나머지 12명 = 박스 밖 반원", () => {
  for (const turn of ["home", "away"]) {
    for (const [homeF, awayF] of [["2-2-2", "1-3-2"], ["2-3-1", "3-1-2"]]) {
      const base = makeView({ homeF, awayF, atk: "home", step: 3, carrierId: "h_FW1", defenderId: null });
      const view = {
        ...base,
        phase: "penalties",
        stage: "penalties",
        carrier: base.carrier, // 엔진 view 는 승부차기 중에도 이전 포제션의 carrier 를 남겨 둔다 — 무시해야 함
        penalties: { home: 2, away: 1, turn, taken: { home: 3, away: turn === "away" ? 3 : 2 }, suddenDeath: false },
      };
      const L = computeLayout(view);
      assertPenaltyLayout(view, L, `pen ${turn} ${homeF}/${awayF}`, { kickSide: turn });
      assert.equal(L.highlight.level, turn === "home" ? "shotChance" : "crisis");
      assert.match(L.banner, /^승부차기 — /);
      // 키커 id 를 view 가 주면 그것
      const kickerId = turn === "home" ? "h_DF1" : "a_MF1";
      const v2 = { ...view, penalties: { ...view.penalties, nextKickerId: kickerId } };
      assertPenaltyLayout(v2, computeLayout(v2), `pen ${turn} nextKickerId`, { kickSide: turn, kickerId });
      // order 를 주면 taken 번째
      const order = view.players[turn].map((p) => p.id).reverse();
      const v3 = { ...view, penalties: { ...view.penalties, order: { [turn]: order } } };
      const kicker3 = order[view.penalties.taken[turn] % order.length];
      assertPenaltyLayout(v3, computeLayout(v3), `pen ${turn} order`, { kickSide: turn, kickerId: kicker3 });
      // view.zone(엔진 v0.2)이 있으면 그 박스
      const v4 = { ...view, zone: turn === "home" ? 5 : 1 };
      assertPenaltyLayout(v4, computeLayout(v4), `pen ${turn} zone`, { kickSide: turn });
    }
  }
  // 종료 후(승부차기로 끝남): 마지막 킥 기준, highlight 없음
  const base = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 3, carrierId: "h_FW1", defenderId: null });
  const fin = {
    ...base, phase: "finished", stage: "penalties", finished: true,
    penalties: { home: 4, away: 3, turn: "home", taken: { home: 5, away: 5 }, suddenDeath: false },
    recentEvents: [{ type: "penalty", side: "away", playerId: "a_MF2", defenderId: "h_GK", success: false }, { type: "end", side: null }],
  };
  const L = computeLayout(fin);
  assertPenaltyLayout(fin, L, "pen finished", { kickSide: "away", kickerId: "a_MF2" });
  assert.equal(L.highlight.level, null);
  assert.match(L.banner, /^경기 종료/);
  // 엔진 v0.2 필드 penalties.kickerSide / kickerId / keeperId 가 있으면 그것 (turn·이벤트보다 우선)
  const eng = {
    ...base, phase: "penalties", stage: "penalties", zone: 1, recentEvents: [],
    penalties: { home: 3, away: 3, turn: "away", taken: { home: 5, away: 4 }, suddenDeath: true, kickerSide: "away", kickerId: "a_DF2", keeperId: "h_GK" },
  };
  const LE = computeLayout(eng);
  assertPenaltyLayout(eng, LE, "pen engine fields", { kickSide: "away", kickerId: "a_DF2" });
  assert.equal(LE.defenderId, "h_GK");
  assert.equal(LE.banner, "서든데스 — 상대 브란 vs 네리아 (3:3)");
});

/* ------------------------------------------------------------------ */
/* 실제 엔진 경기                                                          */
/* ------------------------------------------------------------------ */

const data = loadData();
const SQUADS = {
  "2-2-2": undefined, // 기본 편성
  "2-3-1": { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker" },
  "3-1-2": { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", DF3: "ch_human_runner", MF1: "ch_elf_playmaker", FW1: "ch_wolf_winger", FW2: "ch_giant_striker" },
  "1-3-2": { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_wolf_winger", FW2: "ch_giant_striker" },
};

function homeSnap(formation) {
  const st = run.createRun({ data, seed: `layout-${formation}`, formation, squad: SQUADS[formation] });
  st.teamwork = 40;
  return run.buildTeamSnapshot(st, data);
}
function asAway(snap, name) {
  const a = clone(snap);
  a.side = "away";
  a.name = name;
  a.players.forEach((p) => { p.id = "q_" + p.id; });
  return a;
}

/** 엔진 v0.2·v0.3 이 getMatchView 에 추가한 필드를 뺀 사본 (v0.1 view 모양) */
function stripV02(view) {
  const v = clone(view);
  for (const k of ["zone", "attackStep", "attackDir", "remaining", "receiverPreview", "outcomes", "lastBeat", "receivers", "receiversBySkill"]) delete v[k];
  if (v.penalties) for (const k of ["kickerSide", "kickerId", "keeperId"]) delete v.penalties[k];
  return v;
}

/** 경기 한 판을 step 반복하며 매 view 를 검사 (seen 에 본 상황을 기록) */
function playAndCheck(ms, label, seen) {
  let guard = 0;
  for (;;) {
    const view = match.getMatchView(ms, data);
    const before = JSON.stringify(ms);
    const L = computeLayout(view);
    const where = `${label} #${guard} ${view.phase} ${view.attackingSide} L${view.lineIndex}`;
    if (L.mode === "penalties") {
      const opts = {};
      if (view.phase === "penalties") {
        const pen = ms.penalties;
        opts.kickSide = pen.turn;
        const pv = view.penalties || {};
        if (pv.nextKickerId || pv.kickerId) opts.kickerId = pen.order[pen.turn][pen.taken[pen.turn] % pen.order[pen.turn].length];
        seen.add("penalties");
      } else {
        const last = [...ms.events].reverse().find((e) => e.type === "penalty");
        opts.kickSide = last.side;
        opts.kickerId = last.playerId;
        seen.add("penalties-finished");
      }
      assertPenaltyLayout(view, L, where, opts);
    } else if (view.finished) {
      assertFinishedLayout(view, L, where);
      seen.add(`finished-${view.lastBeat.type}`);
    } else if (view.phase === "distribution") {
      assertDistributionLayout(view, L, where);
      seen.add(`dist-${view.distribution.side}`);
    } else {
      assertPlayLayout(view, L, where);
      seen.add(`${view.attackingSide}${view.attackStep ?? view.lineIndex}`);
      if (view.attackingSide === "away" && (view.attackStep ?? view.lineIndex) === 3) seen.add("regression");
    }
    // v0.2 필드를 뺀 view (엔진 v0.1 모양)로도 같은 불변식 — layout 의 자체 계산 경로
    const old = stripV02(view);
    const LO = computeLayout(old);
    if (LO.mode === "penalties") {
      assert.equal(L.mode, "penalties");
      assertPenaltyLayout(old, LO, `${where} (v0.1 view)`, {
        kickSide: view.phase === "penalties" ? ms.penalties.turn : [...ms.events].reverse().find((e) => e.type === "penalty").side,
      });
    } else {
      if (old.finished) assertFinishedLayout(old, LO, `${where} (v0.1 view)`);
      else if (old.phase === "distribution") assertDistributionLayout(old, LO, `${where} (v0.1 view)`);
      else assertPlayLayout(old, LO, `${where} (v0.1 view)`);
      // receiver 역할만 빼면 위치·역할이 같다 (receiver 는 receivers/receiverPreview 가 있어야 표시되고, 도착 구역에 선다)
      const strip = (T) => T.tokens.map((t) => [t.id, L.receiverIds.includes(t.id) ? null : t.y, t.role === "receiver" ? "support" : t.role]);
      assert.deepEqual(strip(LO), strip(L), `${where}: v0.1/v0.2 view 세로·역할 동일`);
      assert.deepEqual(LO.ball, L.ball);
      assert.equal(LO.zone, L.zone);
      assert.equal(LO.remainingText, L.remainingText, `${where}: remainingText 자체 계산 = 엔진 remaining.text`);
    }
    assert.equal(JSON.stringify(ms), before, `${where}: getMatchView/computeLayout 가 상태를 바꾸지 않음`);
    if (match.isFinished(ms)) return;
    match.step(ms, data, null);
    if (++guard > 3000) throw new Error(`${label}: 경기가 끝나지 않음`);
  }
}

test("실제 엔진 경기: 4×4 포메이션 · 여러 seed · 매 step view 에서 같은 불변식", () => {
  const homes = Object.fromEntries(FORMS.map((f) => [f, homeSnap(f)]));
  const aways = Object.fromEntries(FORMS.map((f) => [f, asAway(homes[f], `원정 ${f}`)]));
  const seen = new Set();
  let matches = 0;
  for (const hf of FORMS) {
    for (const af of FORMS) {
      for (const seed of [1, 2, 3]) {
        const ms = match.createMatch({ data, seed: `lay|${hf}|${af}|${seed}`, home: homes[hf], away: aways[af], possessions: 8, kind: "goal" });
        playAndCheck(ms, `${hf} vs ${af} seed ${seed}`, seen);
        matches++;
      }
    }
  }
  // 실제 상대 팀 (opponents.json) 도
  for (const opp of data.opponents) {
    const away = run.buildOpponentSnapshot(opp, data);
    for (const seed of [11, 12]) {
      const ms = match.createMatch({ data, seed, home: homes["2-2-2"], away, possessions: 8, kind: "friendly" });
      playAndCheck(ms, `vs ${opp.id} seed ${seed}`, seen);
      matches++;
    }
  }
  for (const k of ["home0", "home1", "home2", "home3", "away0", "away1", "away2", "away3", "regression", "finished-turnover", "finished-goal", "dist-home", "dist-away"]) {
    assert.ok(seen.has(k), `실제 경기에서 ${k} 상황이 나와야 함 (${[...seen].join(",")})`);
  }
  assert.equal(matches, 16 * 3 + data.opponents.length * 2);
});

test("실제 엔진 경기: 승부차기까지 가는 경기의 매 view (미러 매치)", () => {
  const home = homeSnap("2-2-2");
  const away = asAway(home, "미러 클럽");
  const seen = new Set();
  let found = 0;
  for (let seed = 1; seed <= 200 && found < 2; seed++) {
    const probe = match.simulateAuto(match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" }), data);
    if (probe.stage !== "penalties") continue;
    found++;
    const ms = match.createMatch({ data, seed, home, away, possessions: 8, kind: "goal" });
    playAndCheck(ms, `mirror seed ${seed}`, seen);
  }
  assert.ok(found > 0, "승부차기 경기가 있어야 함");
  assert.ok(seen.has("penalties"), "승부차기 진행 중 view 검사");
  assert.ok(seen.has("penalties-finished"), "승부차기 종료 view 검사");
});

/* ------------------------------------------------------------------ */
/* 수정 라운드 회귀 (검수 발견 1·4·9·10·11)                                  */
/* ------------------------------------------------------------------ */

test("경기 종료 모습 (합성): 턴오버·세이브 → 공을 얻은 선수가 공, 골 → 공은 골문 안 · carrier 없음", () => {
  // 마지막 비트 뒤 엔진 view: attackingSide / carrier 는 판정 전(공을 잃은 쪽) 값 그대로다
  const base = (atk, step, carrierId) => makeView({ homeF: "2-2-2", awayF: "3-1-2", atk, step, carrierId, defenderId: null, phase: "finished", extra: { finished: true } });
  // 상대 DF 오르반이 우리 ③ 공격(Z4)에서 인터셉트 → 상대 역습 line 0 (Z4)
  const t1 = { ...base("home", 2, "h_FW1"), lastBeat: { type: "turnover", side: "home", playerId: "h_FW1", defenderId: "a_DF1", attackingSide: "home", step: 2, zone: 4, toAttackingSide: "away", toStep: 0, toZone: 4 } };
  const L1 = computeLayout(t1);
  assertFinishedLayout(t1, L1, "turnover");
  assert.equal(L1.carrierId, "a_DF1");
  assert.equal(L1.tokens.find((t) => t.id === "h_FW1").role, "support", "공을 잃은 우리 FW 는 공 없음");
  // 우리 GK 네리아가 상대 ④ 슛을 세이브 → 네리아가 공을 품에 (우리 박스)
  const t2 = { ...base("away", 3, "a_FW1"), lastBeat: { type: "save", side: "away", playerId: "a_FW1", defenderId: "h_GK", attackingSide: "away", step: 3, zone: 1, toAttackingSide: "home", toStep: 0, toZone: 2 } };
  const L2 = computeLayout(t2);
  assertFinishedLayout(t2, L2, "save");
  assert.ok(L2.ball.y < 16, `세이브: 공 y=${L2.ball.y} 는 우리 박스`);
  assert.notEqual(L2.tokens.find((t) => t.id === "a_FW1").role, "carrier");
  // 우리 골 (중거리 ③) → 공은 상대 골문 안
  const t3 = { ...base("home", 2, "h_FW2"), lastBeat: { type: "goal", side: "home", playerId: "h_FW2", defenderId: "a_DF1", attackingSide: "home", step: 2, zone: 4, toAttackingSide: "away", toStep: 0, toZone: 4 } };
  const L3 = computeLayout(t3);
  assertFinishedLayout(t3, L3, "goal");
  assert.equal(L3.carrierId, null);
  const gk = L3.tokens.find((t) => t.id === "a_GK");
  assert.ok(tokenDistance(gk, L3.ball, ASPECT) > 5, "GK 는 공 반대편으로 다이브 (공이 GK 를 가리지 않게)");
  // 엔진 이벤트 위치 필드가 없는 옛 저장 상태: toAttackingSide/toStep 을 규칙(§7.5)으로 대신
  const t4 = { ...base("home", 0, "h_DF1"), recentEvents: [{ type: "turnover", side: "home", playerId: "h_DF1", defenderId: "a_FW1", step: 0 }, { type: "end", side: null }] };
  const L4 = computeLayout(t4);
  assert.equal(L4.carrierId, "a_FW1");
  assert.equal(L4.attackingSide, "away");
  assert.equal(L4.zone, 2, "line 0 에서 뺏기면 상대는 line 2 (우리 진영) 에서");
  // GK 롱패스 차단으로 끝남 (2026-09-30): 끊은 상대 MF 는 롱패스 받을 선수(receiverId)의 레인 — 낙하 지점에서 공을 든 모습
  const lb5 = { type: "turnover", side: "home", playerId: "h_GK", defenderId: "a_MF1", receiverId: "h_MF2", action: "long", attackingSide: "home", step: 0, zone: 2, toAttackingSide: "away", toStep: 1, toZone: 3 };
  const L5 = computeLayout({ ...base("home", 0, "h_GK"), lastBeat: { ...lb5, distribution: true } });
  const L5o = computeLayout({ ...base("home", 0, "h_GK"), lastBeat: lb5 });
  assert.equal(L5.carrierId, "a_MF1");
  const c5 = L5.tokens.find((t) => t.id === "a_MF1");
  const r5 = L5.tokens.find((t) => t.id === "h_MF2");
  const c5o = L5o.tokens.find((t) => t.id === "a_MF1");
  const r5o = L5o.tokens.find((t) => t.id === "h_MF2");
  // 받을 선수의 레인 = 평소 모습에서 그 선수의 가로 자리 (끊은 선수가 그 레인에 서면 받을 선수가 옆으로 비킨다)
  assert.ok(Math.abs(c5.x - r5o.x) < 1e-6 && Math.abs(c5o.x - r5o.x) > 1 && Math.abs(r5.x - c5.x) > 1, `끊은 선수 x ${c5.x} = 받을 선수 레인 ${r5o.x} (평소 ${c5o.x}, 받을 선수 ${r5.x})`);
});

test("실제 엔진: 종료 view 300경기 — 마지막 모습의 공은 항상 공을 얻은 쪽 (턴오버·세이브) 또는 골문 안 (골)", () => {
  const home = homeSnap("2-2-2");
  const opps = data.opponents.map((o) => run.buildOpponentSnapshot(o, data));
  const kinds = {};
  for (let seed = 1; seed <= 300; seed++) {
    const ms = match.simulateAuto(match.createMatch({ data, seed, home, away: opps[seed % opps.length], possessions: 6, kind: "friendly" }), data);
    const view = match.getMatchView(ms, data);
    assertFinishedLayout(view, computeLayout(view), `seed ${seed}`);
    const L = computeLayout(view, { aspect: 0.74, tokenSize: 0.0866 });
    const c = L.tokens.find((t) => t.role === "carrier");
    if (view.lastBeat.type === "goal") assert.equal(c, undefined);
    else assert.equal(c.side, view.lastBeat.toAttackingSide, `seed ${seed} @0.74`);
    kinds[view.lastBeat.type] = (kinds[view.lastBeat.type] || 0) + 1;
  }
  for (const k of ["turnover", "save", "goal"]) assert.ok(kinds[k] > 5, `${k} ${JSON.stringify(kinds)}`);
});

test("패스 후보 = 패스 도착 구역 안: ① → 중원, ② → 상대 진영, ③ → 상대 박스 (양 팀), extraLine 이면 두 구역 앞", () => {
  for (const atk of ["home", "away"]) {
    for (let step = 0; step <= 2; step++) {
      const carrierId = `${atk === "home" ? "h" : "a"}_${["DF1", "MF1", "FW1"][step]}`;
      const receiverId = `${atk === "home" ? "h" : "a"}_${step === 0 ? "MF2" : "FW2"}`;
      const defenderId = `${atk === "home" ? "a" : "h"}_${POS_BY_LINE[step]}1`;
      const view = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk, step, carrierId, defenderId, receiverId });
      for (const [aspect, tokenSize] of [[0.8, 0.075], [0.74, 0.0866], [1.15, 0.0875]]) {
        const L = computeLayout(view, { aspect, tokenSize });
        const r = L.tokens.find((t) => t.id === receiverId);
        const d = L.tokens.find((t) => t.id === defenderId);
        assert.equal(r.role, "receiver");
        assert.equal(zoneAtY(r.y), zoneFor(atk, step + 1), `${atk} ${step} @${aspect}: 후보 y=${r.y} 가 Z${zoneFor(atk, step + 1)}`);
        // 막는 수비수(공과 후보 사이) → 후보는 수비수보다 골 쪽
        assert.ok(atk === "home" ? r.y > d.y : r.y < d.y, `${atk} ${step}: 후보(${r.y})가 듀얼 수비수(${d.y}) 너머`);
      }
    }
  }
  // 커밋된(또는 토글한) extraLine: line 0 에서 FW 가 받는다 → 상대 진영 (엔진 receiverPreview.step = 2)
  const v = makeView({ homeF: "1-3-2", awayF: "2-2-2", atk: "home", step: 0, carrierId: "h_DF1", defenderId: "a_FW1", receiverId: "h_FW1" });
  v.receiverPreview = { ...v.receiverPreview, step: 2, zone: 4 };
  const L = computeLayout(v);
  const r = L.tokens.find((t) => t.id === "h_FW1");
  assert.equal(r.role, "receiver");
  assert.equal(zoneAtY(r.y), 4);
});

/**
 * ④ 박스 연결 합성 view (2026-09-29): 엔진 규칙의 후보 — 컷백 = FW 전원 + MF 1명(첫 MF), 센터링 = FW 전원 + MF 1명(마지막 MF), carrier 제외,
 * arrival 3 (= 지금 단계, 공은 박스 그대로), 듀얼 상대 = GK. 크로스는 carrier 가 크로서일 때만이라 withCross 로 켠다.
 */
function boxLinkView({ homeF, awayF, atk, carrierId, withCross = true }) {
  const base = makeView({ homeF, awayF, atk, step: 3, carrierId, defenderId: null });
  const A = base.players[atk];
  const fws = A.filter((p) => posOfSynthetic(p) === "FW" && p.id !== carrierId);
  const mfs = A.filter((p) => posOfSynthetic(p) === "MF" && p.id !== carrierId);
  const plan = (mf) => {
    const cands = A.filter((p) => fws.includes(p) || p === mf).map((p) => p.id);
    return cands.length ? { candidates: cands, defaultId: cands[0], arrival: 3, zone: zoneFor(atk, 3), boxLink: true } : null;
  };
  const receivers = {};
  const pass = plan(mfs[0]);
  if (pass) receivers.pass = pass;
  const cross = withCross ? plan(mfs[mfs.length - 1]) : null;
  if (cross) receivers.cross = cross;
  const gk = base.players[other(atk)].find((p) => posOfSynthetic(p) === "GK");
  return makeView({
    homeF, awayF, atk, step: 3, carrierId, defenderId: gk.id, receiverId: pass ? pass.defaultId : null,
    extra: { receivers, receiverPreview: pass ? { id: pass.defaultId, name: "", side: atk, step: 3, zone: zoneFor(atk, 3) } : null },
  });
}

test("④ 박스 연결 후보 (컷백 · 센터링, arrival 3): 전원 박스 안 · 공 가진 선수 레인에서 비켜 선다 · 겹침 없음 (합성 4 포메이션² × 양 팀 × carrier 전원, 스테이지 비율 포함)", () => {
  assert.deepEqual(receiverCandidates({ lineIndex: 3, receivers: { pass: { candidates: ["x"], arrival: 3 } } }), [{ id: "x", actions: ["pass"], arrival: 3 }], "④: arrival 3 = 박스 그대로");
  let n = 0;
  let shifted = 0;
  let minGap = Infinity;
  let arrowMin = Infinity;
  for (const homeF of FORMS) {
    for (const awayF of FORMS) {
      for (const atk of ["home", "away"]) {
        const field = makeView({ homeF, awayF, atk, step: 3, carrierId: null, defenderId: null }).players[atk].filter((p) => posOfSynthetic(p) !== "GK");
        for (const c of field) {
          for (const withCross of [true, false]) {
            const view = boxLinkView({ homeF, awayF, atk, carrierId: c.id, withCross });
            const where = `${homeF} vs ${awayF} ${atk} ④ box c=${c.id}${withCross ? " +센터링" : ""}`;
            const L = computeLayout(view);
            assertPlayLayout(view, L, where); // 후보 전원 receiver · 박스 안 · 세로 = 박스 시작 + INSET · 규칙 위치 · 겹침 없음
            const ids = [...new Set([...(view.receivers.pass?.candidates || []), ...(view.receivers.cross?.candidates || [])])];
            const C = L.tokens.find((t) => t.id === c.id);
            for (const id of ids) {
              const t = L.tokens.find((x) => x.id === id);
              const lane = t.x; // 합성 레인 (LANES) 과 비교
              const natural = normLane(view, atk, id);
              if (Math.abs(natural - C.x) < BOX_LANE.gap) shifted++;
              minGap = Math.min(minGap, Math.abs(lane - C.x));
              assert.ok(Math.abs(lane - C.x) >= 7.5 - TOL, `${where}: 후보 ${id} x=${lane.toFixed(1)} 가 공 가진 선수(x=${C.x}) 바로 옆`);
            }
            for (const [aspect, tokenSize] of [[0.4244, 0.0909], [0.8, 0.083], [1.15, 0.0875]]) {
              const LA = computeLayout(view, { aspect, tokenSize });
              assertRangeInvariants(view, LA, aspect, tokenSize, `${where} @${aspect}`);
              // 연결 화살표(공 가진 선수 → 후보)는 다른 후보 위를 지나지 않는다: 선분과 다른 후보 중심 거리 ≥ 토큰 반지름.
              // 같은 쪽 후보가 3명 이상(3-MF 포메이션의 MF carrier + 크로서 — 후보 4명)이면 깊이 두 줄로는 다 못 비키므로 기본 받는 선수만
              const CA = LA.tokens.find((t) => t.id === c.id);
              const sideOf = (t) => Math.sign(t.x - CA.x);
              for (const id of ids) {
                const R = LA.tokens.find((t) => t.id === id);
                const sameSide = ids.filter((x) => sideOf(LA.tokens.find((t) => t.id === x)) === sideOf(R)).length;
                if (sameSide > 2 && id !== view.receiverPreview?.id) continue;
                for (const id2 of ids) {
                  if (id2 === id) continue;
                  const U = LA.tokens.find((t) => t.id === id2);
                  const d = segDistTest(U, CA, R, aspect);
                  arrowMin = Math.min(arrowMin, d / (tokenSize * 100));
                  assert.ok(d >= (tokenSize * 100) / 2 - TOL, `${where} @${aspect}: 화살표 ${c.id} → ${id} 가 후보 ${id2} 위를 지남 (d=${d.toFixed(2)})`);
                }
              }
            }
            n++;
          }
        }
      }
    }
  }
  assert.ok(n > 300 && shifted > 50, `박스 view ${n}, 비켜 선 후보 ${shifted}`);
  assert.ok(minGap >= 7.5, `공 가진 선수와 후보의 가로 간격 최소 ${minGap}`);
  assert.ok(arrowMin >= 0.5, `화살표–다른 후보 최소 거리 ${arrowMin} × 지름`);
  // 같은 레인 후보 둘(2-2-2 FW2 carrier → FW1 · MF1 둘 다 레인 30): 한 명은 가장자리, 한 명은 깊은 줄 —
  // 컷백 화살표 그룸바 → 실루엔이 울릭 위를 지나지 않는다 (visual QA 2026-09-29, 화살표 거리는 위 루프가 확인)
  const v19 = boxLinkView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", carrierId: "h_FW2", withCross: false });
  const L19 = computeLayout(v19, { aspect: 0.4244, tokenSize: 0.0909 });
  const at19 = (id) => L19.tokens.find((t) => t.id === id);
  assert.deepEqual([at19("h_FW1").x, at19("h_MF1").x], [30, 30], "제 레인 그대로");
  assert.deepEqual([at19("h_FW1").y, at19("h_MF1").y].sort(), [86, BOX_LANE.deep], "한 명은 가장자리, 한 명은 깊은 줄");
  // 레인이 겹치면 비켜 선다 — 다른 후보가 없는 쪽으로: 2-2-2 FW1(레인 30) carrier → MF1(레인 30) 후보는 레인 14 (FW2 쪽이 아니라 반대쪽),
  // FW2(레인 70)는 제 레인 → 컷백 화살표 울릭 → 그룸바가 실루엔 위를 지나지 않는다
  const v = boxLinkView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", carrierId: "h_FW1", withCross: false });
  const L = computeLayout(v, { aspect: 0.4244, tokenSize: 0.0909 });
  const at = (id) => L.tokens.find((t) => t.id === id);
  assert.equal(at("h_FW1").x, 30);
  assert.equal(at("h_MF1").x, 30 - BOX_LANE.shift, "carrier 레인의 후보 → 다른 후보가 없는 쪽으로");
  assert.equal(at("h_FW2").x, 70, "다른 레인 후보는 제 레인");
  assert.ok(at("h_MF1").y === 86 && at("h_FW2").y === 86 && at("h_FW1").y === 90, "세로: 후보 = 박스 시작 + 2, 공 = 90");
  // 터치라인 쪽이 min 에 막혀도 반대쪽에 다른 후보(MF2 50 · FW2 70)가 있으면 그 길 위에 서지 않는다: 1-3-2 MF1(레인 20) carrier → FW1(30)은 레인 10
  const v2 = boxLinkView({ homeF: "1-3-2", awayF: "2-2-2", atk: "home", carrierId: "h_MF1", withCross: false });
  const L2 = computeLayout(v2, { aspect: 0.4244, tokenSize: 0.0909 });
  assert.equal(L2.tokens.find((t) => t.id === "h_FW1").x, BOX_LANE.min, "min 까지만, 다른 후보 쪽으로 넘어가지 않음");
});

/** 점 p 와 선분 a–b 의 거리 (필드 폭 % 단위, 세로는 aspect 로 환산) */
function segDistTest(p, a, b, aspect) {
  const dx = b.x - a.x;
  const dy = (b.y - a.y) / aspect;
  const px = p.x - a.x;
  const py = (p.y - a.y) / aspect;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
  return Math.hypot(px - t * dx, py - t * dy);
}

/** 합성 view 선수의 기본 레인 (LANES, 같은 포지션 slot 순) */
function normLane(view, side, id) {
  const pos = posOfSynthetic(view.players[side].find((p) => p.id === id));
  const same = view.players[side].filter((p) => posOfSynthetic(p) === pos);
  return LANES[same.length][same.findIndex((p) => p.id === id)];
}

test("④ 박스 연결 성공 직후 배너: 받은 선수의 원터치 슛 · 헤더 찬스 (양 팀)", () => {
  for (const atk of ["home", "away"]) {
    const v = boxLinkView({ homeF: "2-2-2", awayF: "2-2-2", atk, carrierId: `${atk === "home" ? "h" : "a"}_FW2` });
    const lb = (action) => ({ type: "duel", side: atk, attackingSide: atk, success: true, boxLink: true, action, via: action, playerId: `${atk === "home" ? "h" : "a"}_FW1`, receiverId: v.carrier.id, step: 3, toStep: 3 });
    const gk = atk === "home" ? "마르텐" : "네리아";
    const b1 = computeLayout({ ...v, lastBeat: lb("pass") }).banner;
    const b2 = computeLayout({ ...v, lastBeat: lb("cross") }).banner;
    const nm = v.carrier.name;
    if (atk === "home") {
      assert.equal(b1, `★ 컷백! ${nm} 원터치 슛 찬스, ${withJosa(gk, "과/와")} 1:1`);
      assert.equal(b2, `★ 센터링! ${nm} 헤더 찬스, ${withJosa(gk, "과/와")} 1:1`);
    } else {
      assert.equal(b1, `⚠ 상대 컷백! ${nm} 원터치 슛 위기, ${withJosa(gk, "과/와")} 1:1`);
      assert.equal(b2, `⚠ 상대 센터링! ${nm} 헤더 위기, ${withJosa(gk, "과/와")} 1:1`);
    }
    // 연결 전(또는 다른 비트 뒤)은 원래 슈팅 찬스 · 위기 배너
    assert.match(computeLayout(v).banner, atk === "home" ? /^★ 슈팅 찬스/ : /^⚠ 슈팅 위기/);
  }
});

test("resolvePreview: 토글한 스킬의 변형으로 바꾸고, 자동 진행 중 확정할 수 없는 패스 후보는 지운다", () => {
  const v = makeView({ homeF: "1-3-2", awayF: "2-2-2", atk: "home", step: 0, carrierId: "h_DF1", defenderId: "a_FW1", receiverId: "h_MF1" });
  v.humanSide = "home";
  v.receiverPreview = { ...v.receiverPreview, step: 1, zone: 3 };
  v.outcomes = { pass: { success: { zone: 3, label: "실루엔에게 연결 — 중원 진입" }, fail: { zone: 2, label: "x" } } };
  const fw = v.players.home.find((p) => p.id === "h_FW1");
  v.receiverPreviewBySkill = { sk_line_breaker: { id: fw.id, name: fw.name, side: "home", step: 2, zone: 4 } };
  v.outcomesBySkill = { sk_line_breaker: { pass: { success: { zone: 4, label: `${fw.name}에게 연결 — 상대 진영 진입` }, fail: { zone: 2, label: "x" } } } };
  const before = JSON.stringify(v);
  // 결정 대기 + 스킬 없음 → 그대로
  assert.equal(resolvePreview(v, { deciding: true }), v);
  // 결정 대기 + 라인 브레이커 토글 → 변형
  const t = resolvePreview(v, { skillId: "sk_line_breaker", deciding: true });
  assert.equal(t.receiverPreview.id, "h_FW1");
  assert.equal(t.outcomes.pass.success.zone, 4);
  const Lt = computeLayout(t);
  assert.equal(Lt.receiverId, "h_FW1");
  assert.equal(zoneAtY(Lt.tokens.find((x) => x.id === "h_FW1").y), 4, "토글하면 패스 후보가 변형 수신자 · 도착 구역으로");
  // 다른(위치 무관) 스킬 토글 → 그대로
  assert.equal(resolvePreview(v, { skillId: "sk_power_shot", deciding: true }), v);
  // 자동 진행 + 우리 공격 + 변형 수신자가 다름 → 후보 표시 안 함
  const a = resolvePreview(v, { deciding: false });
  assert.equal(a.receiverPreview, null);
  assert.equal(computeLayout(a).receiverId, null);
  // 변형 수신자가 같으면(line 1 이상) 그대로
  const same = { ...v, receiverPreviewBySkill: { sk_line_breaker: { ...v.receiverPreview } } };
  assert.equal(resolvePreview(same, { deciding: false }), same);
  // 상대 공격(AI 가 이미 커밋)은 그대로
  const away = { ...v, attackingSide: "away" };
  assert.equal(resolvePreview(away, { deciding: false }), away);
  assert.equal(JSON.stringify(v), before, "view 불변");

  // v0.3: receivers(후보 전원) 변형 · 필살기 토글(ultimate → ultimateOptions 의 skillId 키) · 자동 진행 중 후보 숨김
  const mf = v.players.home.filter((p) => p.id.startsWith("h_MF")).map((p) => p.id);
  const fws = v.players.home.filter((p) => p.id.startsWith("h_FW")).map((p) => p.id);
  const w = {
    ...v,
    receivers: { pass: { candidates: mf, defaultId: "h_MF1", arrival: 1, zone: 3 } },
    receiversBySkill: {
      sk_line_breaker: { pass: { candidates: fws, defaultId: "h_FW1", arrival: 2, zone: 4 } },
      sk_wind_thread: { pass: { candidates: mf, defaultId: "h_MF2", arrival: 1, zone: 3 } },
    },
    receiverPreviewBySkill: { ...v.receiverPreviewBySkill, sk_wind_thread: { id: "h_MF2", name: "타린", side: "home", step: 1, zone: 3 } },
    ultimateOptions: [{ playerId: "h_DF1", skillId: "sk_wind_thread", type: "pass", usable: true }],
  };
  const wBefore = JSON.stringify(w);
  const Lw = computeLayout(w);
  assert.deepEqual(Lw.receiverIds, mf, "후보 전원 receiver");
  for (const id of mf) assert.equal(zoneAtY(Lw.tokens.find((t) => t.id === id).y), 3);
  const sk = resolvePreview(w, { skillId: "sk_line_breaker", deciding: true });
  assert.deepEqual(sk.receivers, w.receiversBySkill.sk_line_breaker, "스킬 토글 → 변형 후보");
  const Ls = computeLayout(sk);
  assert.deepEqual(Ls.receiverIds, fws);
  for (const id of fws) assert.equal(zoneAtY(Ls.tokens.find((t) => t.id === id).y), 4, "extraLine 후보 = 상대 진영");
  const ul = resolvePreview(w, { ultimate: true, deciding: true });
  assert.equal(ul.receiverPreview.id, "h_MF2", "필살기 토글 → 필살기 변형 (합체기 기본값)");
  assert.equal(ul.receivers.pass.defaultId, "h_MF2");
  assert.equal(resolvePreview(w, { ultimate: false, deciding: true }), w, "토글 없음 → 그대로");
  const wx = { ...w, ultimateOptions: [{ ...w.ultimateOptions[0], usable: false }] };
  assert.equal(resolvePreview(wx, { ultimate: true, deciding: true }), wx, "쓸 수 없는 필살기 토글은 무시");
  // 자동 진행: 도착 단계가 다른 변형(라인 브레이커)이 있으면 후보 전체를 숨긴다
  const au = resolvePreview(w, { deciding: false });
  assert.deepEqual(au.receivers, {});
  assert.equal(au.receiverPreview, null);
  assert.deepEqual(computeLayout(au).receiverIds, []);
  // 후보·도착이 같고 기본값만 다르면(필살 패스) 후보는 그리고 기본 받는 선수만 숨긴다
  const w2 = { ...w, receiversBySkill: { sk_wind_thread: w.receiversBySkill.sk_wind_thread } };
  const au2 = resolvePreview(w2, { deciding: false });
  assert.deepEqual(au2.receivers, w2.receivers);
  assert.equal(au2.receiverPreview, null);
  assert.equal(JSON.stringify(w), wBefore, "view 불변 (v0.3)");
});

test("자동 진행: 화면에 그린 패스 후보 = 실제 수신자 (사람 측 AI 가 라인 브레이커·필살 패스를 쓰는 1-3-2, 6팀 × 20 seed)", () => {
  // A안: 자동은 성향 1위 액션 → 패스형 DF(아르덴: 패스 200 > 드리블 150)에게 라인 브레이커를 쥐여 줘야 DF 의 패스에 extraLine 변형이 생긴다.
  // (울릭 DF 는 드리블형이라 패스를 하지 않는다.) 실루엔(MF, 바람의 실)은 필살 패스 변형(합체기 기본값)을 만든다.
  const squad = { GK: "ch_spirit_keeper", DF1: "ch_human_captain", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", MF3: "ch_cat_trickster", FW1: "ch_giant_striker", FW2: "ch_wolf_winger" };
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "lb", formation: "1-3-2", squad }), data);
  const df = home.players.find((p) => p.slot === "DF1");
  df.skillIds = [...(df.skillIds || []), "sk_line_breaker"];
  home.tension = 60;
  let passes = 0;
  let hidden = 0;
  let hiddenCands = 0;
  let candChecked = 0;
  for (const opp of data.opponents) {
    for (let s = 1; s <= 20; s++) {
      const ms = match.createMatch({ data, seed: `auto-lb${opp.id}${s}`, home, away: run.buildOpponentSnapshot(opp, data), possessions: 8, kind: "goal" });
      while (!match.isFinished(ms)) {
        const view = match.getMatchView(ms, data);
        const shown = resolvePreview(view, { deciding: false });
        const L = computeLayout(shown);
        const n0 = ms.events.length;
        match.step(ms, data, null);
        for (const e of ms.events.slice(n0)) {
          if (e.type !== "duel" || !e.success || (e.action !== "pass" && e.action !== "cross")) continue;
          // 그린 후보(있으면)는 실제 받는 선수를 포함하고, 그 후보는 실제 도착 구역에 서 있다
          if (L.receiverIds.length) {
            candChecked++;
            assert.ok(L.receiverIds.includes(String(e.receiverId)), `${opp.id} ${s}: 그린 후보 ${L.receiverIds} 에 실제 받는 선수 ${e.receiverId} (${e.side} ${e.action})`);
            const t = L.tokens.find((x) => x.side === e.side && x.id === String(e.receiverId));
            assert.equal(zoneAtY(t.y), e.toZone, `${opp.id} ${s}: 후보 ${e.receiverId} 가 실제 도착 구역 Z${e.toZone} 에`);
          } else if (e.side === "home") hiddenCands++;
          if (e.action !== "pass") continue;
          passes++;
          if (L.receiverId === null) { hidden++; continue; }
          assert.equal(L.receiverId, e.receiverId, `${opp.id} ${s}: 그린 후보 = 실제 수신자 (${e.side})`);
        }
      }
    }
  }
  assert.ok(passes > 300, `패스 성공 ${passes}`);
  assert.ok(hidden > 0 && hidden < passes / 3, `불확실해서 숨긴 경우 ${hidden}/${passes}`);
  assert.ok(hiddenCands > 0, `도착 구역이 바뀔 수 있어 후보 전체를 숨긴 경우 ${hiddenCands}`);
  assert.ok(candChecked > 300, `후보 검사 ${candChecked}`);
});

test("받는 선수 후보 전원 = 도착 구역 (실제 엔진 view): 크로스 후보 MF 도 박스, 결정 중 스킬·필살기 변형도 같은 규칙", () => {
  const squad = { GK: "ch_spirit_keeper", DF1: "ch_dwarf_wall", DF2: "ch_human_captain", MF1: "ch_elf_playmaker", MF2: "ch_human_runner", FW1: "ch_wolf_winger", FW2: "ch_giant_striker" };
  const home = run.buildTeamSnapshot(run.createRun({ data, seed: "cands", formation: "2-2-2", squad }), data);
  home.tension = 80;
  const seen = { cross: 0, multi: 0, variant: 0, ult: 0 };
  for (const opp of data.opponents) {
    for (let s = 1; s <= 12; s++) {
      const ms = match.createMatch({ data, seed: `cands${opp.id}${s}`, home, away: run.buildOpponentSnapshot(opp, data), possessions: 8, kind: "goal" });
      let g = 0;
      while (!match.isFinished(ms) && g++ < 400) {
        const view = match.getMatchView(ms, data);
        const variants = [{ v: view, tag: "base" }];
        if (view.needsDecision) {
          for (const k of Object.keys(view.receiversBySkill || {})) {
            const isUlt = (view.ultimateOptions || []).some((u) => u.skillId === k);
            const v2 = isUlt ? resolvePreview(view, { ultimate: true }) : resolvePreview(view, { skillId: k });
            variants.push({ v: v2, tag: k });
            if (isUlt) seen.ult++; else seen.variant++;
            assert.deepEqual(v2.receivers, view.receiversBySkill[k], `변형 ${k}: receivers = receiversBySkill`);
          }
        }
        for (const { v, tag } of variants) {
          if (v.phase !== "decision" || v.finished) continue;
          const L = computeLayout(v, { aspect: 0.74, tokenSize: 0.0866 });
          const atk = v.attackingSide;
          for (const a of ["pass", "cross"]) {
            const r = v.receivers && v.receivers[a];
            if (!r) continue;
            if (a === "cross") seen.cross++;
            if (r.candidates.length > 1) seen.multi++;
            for (const id of r.candidates) {
              const t = L.tokens.find((x) => x.side === atk && x.id === id);
              assert.equal(t.role, "receiver", `${tag} ${a} 후보 ${id} 역할`);
              assert.equal(zoneAtY(t.y), zoneFor(atk, r.arrival), `${tag} ${a} 후보 ${id} y=${t.y} 는 도착 구역 Z${zoneFor(atk, r.arrival)}`);
            }
          }
        }
        match.step(ms, data, null);
      }
    }
  }
  assert.ok(seen.cross > 20 && seen.multi > 20, JSON.stringify(seen));
  assert.ok(seen.variant > 5 && seen.ult > 5, `스킬·필살기 변형 ${JSON.stringify(seen)}`);
});

/** UI 가 실제로 넘기는 범위의 불변식 (세로 좌표는 규칙 방향으로만 조정될 수 있다) */
function assertRangeInvariants(view, L, aspect, tokenSize, where) {
  const minD = tokenSize * 100;
  const T = L.tokens;
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      const d = tokenDistance(T[i], T[j], aspect);
      assert.ok(d >= minD - TOL, `${where}: ${T[i].id}(${T[i].x.toFixed(1)},${T[i].y.toFixed(1)}) ↔ ${T[j].id}(${T[j].x.toFixed(1)},${T[j].y.toFixed(1)}) 겹침 d=${d.toFixed(2)} < ${minD}`);
    }
  }
  for (const t of T) assert.ok(t.x >= X_MIN - TOL && t.x <= X_MAX + TOL && t.y >= 0 && t.y <= 100, `${where}: ${t.id} 범위`);
  if (L.mode !== "play" || view.finished) return;
  if (view.phase === "distribution" && view.distribution) {
    // GK 배급 대기: 공 = 배급 GK (자기 박스), 나머지는 전부 GK 앞 (세로는 규칙 방향으로만 밀릴 수 있다)
    const side = view.distribution.side;
    assert.equal(zoneAtY(L.ball.y), side === "home" ? 1 : 5, `${where}: 배급 공 구역`);
    const g = T.find((t) => t.side === side && t.id === String(view.distribution.gkId));
    assert.deepEqual({ x: g.x, y: g.y }, L.ball, `${where}: 배급 GK = 공`);
    for (const t of T) if (t !== g) assert.ok(side === "home" ? t.y > L.ball.y : t.y < L.ball.y, `${where}: ${t.id} 는 GK 앞`);
    return;
  }
  const atk = view.attackingSide;
  const step = view.attackStep ?? view.lineIndex;
  assert.equal(zoneAtY(L.ball.y), zoneFor(atk, step), `${where}: 공 구역`);
  const behind = (y) => (atk === "home" ? y < L.ball.y : y > L.ball.y);
  const ahead = (y) => (atk === "home" ? y > L.ball.y : y < L.ball.y);
  const c = view.carrier ? T.find((t) => t.side === atk && t.id === view.carrier.id) : null;
  if (c) assert.deepEqual({ x: c.x, y: c.y }, L.ball, `${where}: carrier = 공`);
  const def = other(atk);
  for (const t of T.filter((x) => x.side === def)) {
    const li = POS_BY_LINE.indexOf(t.position);
    if (li < step) assert.ok(t.role === "broken" && behind(t.y), `${where}: 뚫린 ${t.id} y=${t.y} 공(${L.ball.y}) 뒤`);
    else assert.ok(ahead(t.y), `${where}: 남은 ${t.id} y=${t.y} 공(${L.ball.y}) 앞`);
  }
  if (view.defender && c) {
    const d = T.find((t) => t.side === def && t.id === view.defender.id);
    assert.equal(d.x, c.x, `${where}: 듀얼 수비수 x = carrier x`);
    assert.ok(Math.abs(d.y - L.ball.y) >= minD * aspect - TOL, `${where}: carrier–defender 세로 간격 ${Math.abs(d.y - L.ball.y).toFixed(2)}`);
  }
  if (L.receiverId) {
    const r = T.find((t) => t.side === atk && t.id === L.receiverId);
    // ④ 박스 연결: 받는 선수는 박스 안 (공 앞이 아닐 수 있다)
    if (step >= 3) assert.equal(zoneAtY(r.y), zoneFor(atk, step), `${where}: 박스 연결 후보는 박스 안`);
    else assert.ok(ahead(r.y), `${where}: 패스 후보는 공 앞`);
  }
}

// 옛 세로 화면 비율 (390×844 ≈ 0.74, 360×640 ≈ 1.15, 320×568 ≈ 1.27): 지금 UI 는 가로 전용이지만 computeLayout 은 필드 좌표(비율 무관)라 견고성 검사로 남긴다.
// tokenSize = (토큰 px + 4) / 필드 폭
const UI_RANGE = [[0.74, 0.0866], [0.8, 0.086], [1.0, 0.0875], [1.15, 0.0875], [1.27, 0.089], [1.3, 0.09]];

test("세로 비율 범위 (aspect 0.74–1.3, tokenSize 0.085–0.09): 합성 view · 실제 경기 · 승부차기 — 겹침 없음, 규칙 위치 불변식", () => {
  for (const [aspect, tokenSize] of UI_RANGE) {
    for (const { where, view } of allSyntheticViews()) {
      if (!/^(2-3-1 vs 1-3-2|1-3-2 vs 2-3-1|3-1-2 vs 3-1-2|2-2-2 vs 2-2-2)/.test(where)) continue;
      assertRangeInvariants(view, computeLayout(view, { aspect, tokenSize }), aspect, tokenSize, `${where} @${aspect}/${tokenSize}`);
    }
  }
  // 실제 경기 (승부차기까지 가는 미러 매치 포함)
  const homes = ["2-2-2", "3-1-2", "1-3-2"].map((f) => homeSnap(f));
  let pens = 0;
  let views = 0;
  for (const [i, home] of homes.entries()) {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const away = seed % 2 ? asAway(home, "미러") : run.buildOpponentSnapshot(data.opponents[(seed + i) % data.opponents.length], data);
      const ms = match.createMatch({ data, seed: `range${i}|${seed}`, home, away, possessions: 8, kind: "goal" });
      for (let g = 0; ; g++) {
        const view = match.getMatchView(ms, data);
        views++;
        if (view.phase === "penalties") pens++;
        for (const [aspect, tokenSize] of UI_RANGE) {
          const L = computeLayout(view, { aspect, tokenSize });
          assertRangeInvariants(view, L, aspect, tokenSize, `range ${i}/${seed} #${g} ${view.phase} @${aspect}`);
          if (L.mode === "penalties") {
            for (const t of L.tokens.filter((x) => x.role === "support")) {
              assert.ok(L.zone === 5 ? t.y >= 64 && t.y <= 76 : t.y >= 24 && t.y <= 36, `승부차기 대기 ${t.id} y=${t.y} 박스 밖 띠`);
            }
          }
        }
        if (match.isFinished(ms)) break;
        match.step(ms, data, null);
        if (g > 3000) throw new Error("guard");
      }
    }
  }
  assert.ok(views > 300 && pens > 0, `views ${views}, 승부차기 ${pens}`);
  // 승부차기 합성 (좁고 높은 필드): 12명이 두 줄 지그재그로도 겹치지 않는다
  const base = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 3, carrierId: "h_FW1", defenderId: null });
  for (const turn of ["home", "away"]) {
    const pv = { ...base, phase: "penalties", stage: "penalties", penalties: { home: 1, away: 1, turn, taken: { home: 2, away: 2 }, suddenDeath: false } };
    for (const [aspect, tokenSize] of UI_RANGE) assertRangeInvariants(pv, computeLayout(pv, { aspect, tokenSize }), aspect, tokenSize, `pen ${turn} @${aspect}`);
  }
});

/* ------------------------------------------------------------------ */
/* §13.9 가로 경기 화면: 픽셀 변환 · 가로 필드 비율                         */
/* ------------------------------------------------------------------ */

test("fieldToScreen / screenToField: 세로 = 기존 식, 가로 = 세로 그림을 시계 방향 90° (home 골 왼쪽), 왕복 = 원래 좌표", () => {
  const W = 340;
  const H = 470;
  const pts = [[0, 0], [100, 100], [50, 50], [6, 96], [94, 4], [37.3, 72.8], [12.5, 0.5]];
  // 세로(명시할 때만): 이전 match.js 의 PX = x/100·W, PY = (100 − y)/100·H 와 비트 단위로 같다. 기본값은 가로 (화면은 가로 전용)
  for (const [x, y] of pts) {
    assert.deepEqual(fieldToScreen(x, y, W, H, "port"), [(x / 100) * W, ((100 - y) / 100) * H]);
    assert.deepEqual(fieldToScreen(x, y, W, H), fieldToScreen(x, y, W, H, "land"), "기본 = 가로");
    assert.deepEqual(screenToField(x, y, W, H), screenToField(x, y, W, H, "land"), "역변환 기본 = 가로");
  }
  // 가로 (W = 필드 요소 폭 = 골↔골 방향): home 골(y 0) → 왼쪽 끝, away 골(y 100) → 오른쪽 끝, x 0 → 위
  const LW = 840;
  const LH = 560;
  assert.equal(fieldToScreen(50, 0, LW, LH, "land")[0], 0, "home 골 = 왼쪽");
  assert.equal(fieldToScreen(50, 100, LW, LH, "land")[0], LW, "away 골 = 오른쪽");
  assert.equal(fieldToScreen(0, 50, LW, LH, "land")[1], 0, "x 0 = 위 (세로 화면의 왼쪽)");
  assert.equal(fieldToScreen(100, 50, LW, LH, "land")[1], LH, "x 100 = 아래");
  assert.deepEqual(fieldToScreen(25, 75, LW, LH, "land"), [0.75 * LW, 0.25 * LH]);
  // 회전이지 거울상이 아니다: 세로 화면에서 위(away 골) → 가로 화면 오른쪽, 세로 화면 오른쪽(x 100) → 가로 화면 아래
  const [px, py] = fieldToScreen(80, 90, 100, 100, "port");
  const [lx, ly] = fieldToScreen(80, 90, 100, 100, "land");
  assert.deepEqual([lx, ly].map((v) => Math.round(v * 1e9) / 1e9), [100 - py, px].map((v) => Math.round(v * 1e9) / 1e9), "시계 방향 90°: (sx, sy) → (H − sy, sx)");
  for (const orient of ["port", "land"]) {
    const [w, hh] = orient === "land" ? [LW, LH] : [W, H];
    for (const [x, y] of pts) {
      const [sx, sy] = fieldToScreen(x, y, w, hh, orient);
      const back = screenToField(sx, sy, w, hh, orient);
      assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9, `${orient} 왕복 (${x}, ${y}) → ${JSON.stringify(back)}`);
    }
  }
});

// 가로 화면: aspect = 필드 폭/길이 = 규칙 영역 높이/폭, tokenSize = (토큰 px + 4) / 규칙 영역 높이.
// 지금 UI = 고정 스테이지 규칙 영역 1244×528 · 토큰 44px → 0.4244 / 0.0909 (앞뒤로 0.40/0.095 · 0.45/0.088 여유).
// 나머지는 옛 가로 화면(필드 칸 1.4~1.75 → 0.571~0.8) 비율 — computeLayout 견고성 검사로 남긴다
// (1280×720 ≈ 0.714/0.077, 1366×768 ≈ 0.70/0.075, 1920×1080 ≈ 0.667/0.055, 3440×1440 ≈ 0.59/0.04, 낮고 넓은 창 0.571/0.084, 작은 창 1000×700 ≈ 0.714/0.086, 900×500 ≈ 0.8/0.082)
const LAND_RANGE = [[0.4, 0.095], [0.4244, 0.0909], [0.45, 0.088], [0.571, 0.084], [0.59, 0.04], [0.62, 0.08], [0.667, 0.055], [0.7, 0.075], [0.714, 0.077], [0.714, 0.086], [0.75, 0.08], [0.8, 0.083]];

test("가로 화면 범위 (aspect 0.40–0.8, tokenSize 0.04–0.095 — 스테이지 규칙 영역 0.424/0.091 포함): 합성 view · 실제 경기 · 승부차기 — 겹침 없음, 규칙 위치 불변식", () => {
  for (const [aspect, tokenSize] of LAND_RANGE) {
    for (const { where, view } of allSyntheticViews()) {
      if (!/^(2-3-1 vs 1-3-2|1-3-2 vs 2-3-1|3-1-2 vs 3-1-2|2-2-2 vs 2-2-2)/.test(where)) continue;
      assertRangeInvariants(view, computeLayout(view, { aspect, tokenSize }), aspect, tokenSize, `${where} @${aspect}/${tokenSize}`);
    }
  }
  const homes = ["2-2-2", "3-1-2", "1-3-2"].map((f) => homeSnap(f));
  let views = 0;
  for (const [i, home] of homes.entries()) {
    for (const seed of [1, 2, 3, 4]) {
      const away = seed % 2 ? asAway(home, "미러") : run.buildOpponentSnapshot(data.opponents[(seed + i) % data.opponents.length], data);
      const ms = match.createMatch({ data, seed: `land${i}|${seed}`, home, away, possessions: 8, kind: "goal" });
      for (let g = 0; ; g++) {
        const view = match.getMatchView(ms, data);
        views++;
        for (const [aspect, tokenSize] of LAND_RANGE) {
          assertRangeInvariants(view, computeLayout(view, { aspect, tokenSize }), aspect, tokenSize, `land ${i}/${seed} #${g} ${view.phase} @${aspect}`);
        }
        if (match.isFinished(ms)) break;
        match.step(ms, data, null);
        if (g > 3000) throw new Error("guard");
      }
    }
  }
  assert.ok(views > 200, `views ${views}`);
  const base = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk: "home", step: 3, carrierId: "h_FW1", defenderId: null });
  for (const turn of ["home", "away"]) {
    const pv = { ...base, phase: "penalties", stage: "penalties", penalties: { home: 1, away: 1, turn, taken: { home: 2, away: 2 }, suddenDeath: false } };
    for (const [aspect, tokenSize] of LAND_RANGE) assertRangeInvariants(pv, computeLayout(pv, { aspect, tokenSize }), aspect, tokenSize, `land pen ${turn} @${aspect}`);
  }
});

/* ------------------------------------------------------------------ */
/* 2026-09-29 GK 배급 대기 (view.phase "distribution")                   */
/* ------------------------------------------------------------------ */

/** 합성 배급 대기 view: side 의 GK 가 공, 짧은 패스 = 첫 DF, 롱패스 = 마지막 MF, 경합 = 상대 마지막 MF */
function makeDistView(homeF, awayF, side, autoAction = "long") {
  const base = makeView({ homeF, awayF, atk: side, step: 0, carrierId: null, defenderId: null, phase: "distribution" });
  const A = base.players[side];
  const Dp = base.players[other(side)];
  const gk = A.find((p) => posOfSynthetic(p) === "GK");
  const df = A.find((p) => posOfSynthetic(p) === "DF");
  const mf = A.filter((p) => posOfSynthetic(p) === "MF").slice(-1)[0];
  const cmf = Dp.filter((p) => posOfSynthetic(p) === "MF").slice(-1)[0];
  gk.isCarrier = true;
  return {
    ...base,
    carrier: { id: gk.id, name: gk.name, side },
    distribution: {
      side, gkId: gk.id, gkName: gk.name, gkZone: side === "home" ? 1 : 5, needsDecision: side === "home",
      contest: { id: cmf.id, name: cmf.name, side: other(side) },
      order: ["short", "long"], recommended: "long", auto: { action: autoAction, p: autoAction === "long" ? 0.7 : 1 },
      options: {
        short: { action: "short", p: 1, pct: 100, success: { starterId: df.id, starterName: df.name } },
        long: { action: "long", p: 0.7, pct: 70, success: { starterId: mf.id, starterName: mf.name } },
      },
      skills: [],
    },
  };
}

test("GK 배급 대기 (합성): GK 가 자기 박스에서 공 · 팀은 빌드업 모양 · 받는 선수 = 짧은 패스 DF · 롱패스 MF · 경합 상대 MF (4 포메이션² × 양 팀, 가로 · 세로 비율 범위)", () => {
  for (const homeF of FORMS) {
    for (const awayF of FORMS) {
      for (const side of ["home", "away"]) {
        for (const autoAction of ["short", "long"]) {
          const view = makeDistView(homeF, awayF, side, autoAction);
          const where = `${homeF} vs ${awayF} ${side} 배급(${autoAction})`;
          const L = computeLayout(view);
          assertDistributionLayout(view, L, where);
          // 자동 배급의 받는 선수 = receiverId (자동 진행 중 이름표)
          assert.equal(L.receiverId, String(view.distribution.options[autoAction].success.starterId), `${where}: receiverId = 자동 배급의 받는 선수`);
          // 경합 상대 MF = 롱패스 받는 선수와 같은 레인 (낙하 지점에서 마주 본다), 받는 선수보다 앞
          const R = L.tokens.find((t) => t.side === side && t.id === L.dist.long);
          const Dc = L.tokens.find((t) => t.id === L.dist.contest);
          assert.equal(Dc.x, R.x, `${where}: 경합 상대 = 롱패스 받는 선수 레인`);
          assert.ok(side === "home" ? Dc.y > R.y : Dc.y < R.y, `${where}: 경합 상대는 받는 선수 앞 (자기 골 쪽)`);
          assert.match(L.banner, side === "home" ? /^🧤 .+ 배급 — 짧게 빌드업 · 길게 중원$/ : /^상대 GK .+ 배급 — 롱패스면 중원 경합$/, where);
          for (const [aspect, tokenSize] of [...LAND_RANGE, ...UI_RANGE]) {
            const LR = computeLayout(view, { aspect, tokenSize });
            assertRangeInvariants(view, LR, aspect, tokenSize, `${where} @${aspect}/${tokenSize}`);
            assert.equal(LR.zone, side === "home" ? 1 : 5);
          }
        }
      }
    }
  }
  // 종료된 view 는 배급 대기 모양이 아니다 (마지막 비트 모습)
  const fin = { ...makeDistView("2-2-2", "2-2-2", "home"), finished: true };
  assert.equal(computeLayout(fin).dist, undefined, "종료 view = 배급 레이아웃 아님");
});

test("GK 배급 뒤 배너 (합성): 롱패스 성공 → '롱패스 성공! 중원에서 시작', 짧은 패스 → 'GK 짧은 패스 — ○○이 빌드업 시작', 롱패스 차단 뒤 역습 → '세컨드볼!'", () => {
  for (const atk of ["home", "away"]) {
    const home = atk === "home";
    const pre = home ? "h" : "a";
    const opp = home ? "a" : "h";
    const gkId = `${pre}_GK`;
    // 롱패스 성공 → 중원(②) MF 가 공
    const long = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk, step: 1, carrierId: `${pre}_MF1`, defenderId: `${opp}_MF1`, extra: {
      lastBeat: { type: "distribution", side: atk, action: "long", success: true, playerId: gkId, receiverId: `${pre}_MF1`, attackingSide: atk, step: 0, toAttackingSide: atk, toStep: 1 },
    } });
    const bl = computeLayout(long).banner;
    assert.ok(bl.includes("롱패스 성공! 중원에서 시작") && bl.includes(NAMES[atk].MF1) && (home ? !bl.startsWith("⚠") : bl.startsWith("⚠ 상대")), `롱패스 배너 ${bl}`);
    // 짧은 패스 → 빌드업(①) DF 가 공
    const short = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk, step: 0, carrierId: `${pre}_DF1`, defenderId: `${opp}_FW1`, extra: {
      lastBeat: { type: "distribution", side: atk, action: "short", success: true, playerId: gkId, receiverId: `${pre}_DF1`, attackingSide: atk, step: 0, toAttackingSide: atk, toStep: 0 },
    } });
    const bs = computeLayout(short).banner;
    assert.equal(bs, `${home ? "" : "상대 "}GK 짧은 패스 — ${withJosa(NAMES[atk].DF1, "이/가")} 빌드업 시작`);
    // 상대 GK 롱패스를 끊은 역습 (바로 앞 비트 = turnover distribution: true) → 세컨드볼
    const lost = { type: "turnover", side: other(atk), distribution: true, action: "long", success: false, playerId: `${opp}_GK`, defenderId: `${pre}_MF1`, seq: 7, attackingSide: other(atk), step: 0, toAttackingSide: atk, toStep: 1 };
    const counter = { type: "counter", side: atk, playerId: `${pre}_MF1`, seq: 8, attackingSide: atk, step: 1, toAttackingSide: atk, toStep: 1 };
    const sb = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk, step: 1, carrierId: `${pre}_MF1`, defenderId: `${opp}_MF1`, extra: { lastBeat: counter, recentEvents: [lost, counter] } });
    const bsb = computeLayout(sb).banner;
    assert.ok(bsb.includes("세컨드볼! 중원에서 공격") && (home ? bsb.startsWith("세컨드볼") : bsb.startsWith("⚠ 상대 세컨드볼")), `세컨드볼 배너 ${bsb}`);
    // 평범한 역습(앞 비트가 배급 아님)은 그대로 "역습!"
    const plain = makeView({ homeF: "2-2-2", awayF: "2-2-2", atk, step: 1, carrierId: `${pre}_MF1`, defenderId: `${opp}_MF1`, extra: { lastBeat: counter, recentEvents: [{ ...lost, distribution: undefined }, counter] } });
    assert.match(computeLayout(plain).banner, /역습! 중원에서 시작/);
  }
});
