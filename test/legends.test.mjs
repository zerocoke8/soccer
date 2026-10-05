// test/legends.test.mjs — LESSON_PROTO_PLAN §24.9 (레전드 · 메모리 카드, 엔진 E6 · L26 · L27)
//   memoryCardOptions (고유 · 대비 · 코치 빼기 · 한 칸) · manager.recommendMemoryCard (값 · 강화판 · 덱 순서) · validateLegends (2명까지 · 캐릭터 ·
//   카드) · createRun({ legends }) (팀마다 메모리 카드 1장 · 고유 카드 뒤 · src memory · state.legends 사본) · 같은 캐릭터 · JSON 왕복 ·
//   저장 이행 · 평가 · 경기에 영향 없음 · tools/lesson_sim.mjs --legends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadData, clone } from "./helpers.mjs";
import * as LR from "../js/engine/lessonRun.js";
import * as M from "../js/engine/manager.js";
import * as cards from "../js/engine/cards.js";
import { cardPrice } from "../js/engine/lessonCommon.js";
import { teamIdOf } from "../js/engine/challenge.js";
import { legendsFrom, parseArgs, summarize } from "../tools/lesson_sim.mjs";

const data = loadData();
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const WIN = { winner: "home", homeGoals: 2, awayGoals: 0 };
const fam = (id) => cards.getCard(data, id).family;
const EXCLUDED = ["unique", "prep", "coach"];

/** 레전드 1명 (기본 = 알파 클럽의 네리아 — 기본 편성 GK 와 같은 캐릭터, 메모리 카드 하이파이브+) */
const legend = (over = {}) => ({
  teamId: "t_alpha",
  teamName: "알파 클럽",
  charId: "ch_spirit_keeper",
  name: "네리아",
  memoryCard: { cardId: "cd_high_five", plus: true },
  ...over,
});
/** 베타 클럽의 도르비나 (메모리 카드 기초 훈련) */
const beta = (over = {}) => legend({ teamId: "t_beta", teamName: "베타 클럽", charId: "ch_dwarf_wall", name: "도르비나", memoryCard: { cardId: "cd_basic", plus: false }, ...over });

/** 2차 런 필드 (§24.10) — 지금 저장본을 옛 v4 모양으로 만들 때 지운다 */
const V5_KEYS = ["storySeen", "storyEps", "outingSeen", "coachTargets", "coachSeen", "coachSteps", "lastCoachTurnIndex", "lastWeekEventId",
  "usedEventSeasons", "account", "legends", "pendingCardOffer", "lastEvent", "eventSeq"];
function asV4(state) {
  const o = clone(state);
  o.version = 4;
  for (const k of V5_KEYS) delete o[k];
  return o;
}

/** 덱을 통째로 바꾼 런 (후보 · 추천 시험용) */
function withDeck(seed, ids) {
  const s = LR.createRun({ data, seed });
  s.deck = ids.map(([cardId, plus, src], i) => ({ uid: `k${i + 1}`, cardId, plus: !!plus, ...(src ? { src } : {}) }));
  s.nextUid = s.deck.length + 1;
  return s;
}

test("데이터 전제: 시험에 쓰는 카드 family · 값 (방침 > 공용)", () => {
  assert.deepEqual(["cd_basic", "cd_coaching", "cd_cooldown", "cd_high_five", "cd_one_team", "cd_hojo_up", "cd_u_neria", "cd_c_harr", "cd_p_tackle"].map(fam),
    ["common", "common", "common", "team", "team", "ace", "unique", "coach", "prep"]);
  assert.ok(cardPrice(data, "cd_high_five") > cardPrice(data, "cd_basic"), "방침 카드 값이 공용보다 높다");
  assert.equal(cardPrice(data, "cd_high_five"), cardPrice(data, "cd_hojo_up"));
  assert.ok(data.characters.some((c) => c.id === "ch_spirit_keeper") && data.config.defaultSquad.slots.GK === "ch_spirit_keeper");
});

test("§24.9 memoryCardOptions: 고유 · 대비 · 코치 카드를 빼고 같은 카드 · 같은 강화는 한 칸 (덱 순서) · 순수", () => {
  const s = withDeck("leg-opt", [
    ["cd_basic"], ["cd_u_neria"], ["cd_c_harr"], ["cd_p_tackle"], ["cd_basic"], ["cd_basic", true], ["cd_high_five"],
    ["cd_u_neria", true], ["cd_c_harr", true], ["cd_high_five", false, "memory"], ["cd_basic", true],
  ]);
  const before = JSON.stringify(s);
  const opts = LR.memoryCardOptions(s, data);
  assert.deepEqual(opts.map((o) => [o.cardId, o.plus]), [["cd_basic", false], ["cd_basic", true], ["cd_high_five", false]]);
  for (const o of opts) {
    assert.ok(!EXCLUDED.includes(o.family), o.cardId);
    assert.equal(o.family, fam(o.cardId));
    assert.equal(o.name, cards.getCard(data, o.cardId).name);
    assert.equal(o.card.cardId, o.cardId, "카드 뷰");
    assert.equal(o.card.plus, o.plus);
  }
  assert.equal(JSON.stringify(s), before, "상태를 바꾸지 않는다");
  same(LR.memoryCardOptions(s, data), opts);
  // 남길 카드가 없으면 빈 목록 · 추천 null
  const none = withDeck("leg-opt", [["cd_u_neria"], ["cd_c_harr", true], ["cd_p_tackle"]]);
  assert.deepEqual(LR.memoryCardOptions(none, data), []);
  assert.equal(M.recommendMemoryCard(none, data), null);
});

test("§24.9 manager.recommendMemoryCard: 값이 높은 카드 → 강화판 → 덱 순서 · 순수 · 늘 같은 답", () => {
  const cases = [
    // 방침 카드 (값 30) 중 강화판이 먼저 — 덱 순서상 앞의 강화 안 된 방침 카드보다
    [[["cd_basic", true], ["cd_high_five"], ["cd_hojo_up", true], ["cd_high_five", true]], { cardId: "cd_hojo_up", plus: true }],
    // 같은 값 · 강화 없음 → 덱 순서 (공용 강화판보다 방침 카드)
    [[["cd_basic", true], ["cd_one_team"], ["cd_high_five"]], { cardId: "cd_one_team", plus: false }],
    // 공용만 → 강화판 먼저, 같으면 덱 순서
    [[["cd_basic"], ["cd_coaching", true], ["cd_cooldown", true]], { cardId: "cd_coaching", plus: true }],
    // 고유 · 코치 카드는 값이 높아도 후보가 아니다
    [[["cd_c_harr", true], ["cd_u_neria", true], ["cd_cooldown"]], { cardId: "cd_cooldown", plus: false }],
  ];
  for (const [ids, want] of cases) {
    const s = withDeck("leg-rec", ids);
    const before = JSON.stringify(s);
    const rec = M.recommendMemoryCard(s, data);
    assert.deepEqual(rec, want, JSON.stringify(ids));
    assert.equal(JSON.stringify(s), before, "순수");
    assert.deepEqual(M.recommendMemoryCard(clone(s), data), rec, "JSON 사본에서도 같다");
    assert.ok(LR.memoryCardOptions(s, data).some((o) => o.cardId === rec.cardId && o.plus === rec.plus), "후보 중 하나");
  }
});

test("§24.9 validateLegends: 없음 · 빈 배열 · 1 ~ 2명 통과, 3명 · 모르는 카드 · 고유 · 코치 · 대비 카드 · 모르는 캐릭터 · teamId 없음 · 같은 선수 두 번은 한국어 오류", () => {
  for (const ok of [undefined, null, [], [legend()], [legend(), beta()], [legend({ memoryCard: null })], [legend({ memoryCard: undefined, teamName: undefined, name: undefined })]]) {
    assert.equal(LR.validateLegends(data, ok), true, JSON.stringify(ok));
    assert.deepEqual(LR.legendErrors(data, ok), []);
  }
  const bad = [
    [[legend(), beta(), legend({ teamId: "t_gamma" })], /레전드는 2명까지입니다 \(3명\)/],
    [[legend({ memoryCard: { cardId: "cd_nope", plus: false } })], /레전드 1: 메모리 카드 'cd_nope' 을\(를\) 찾을 수 없습니다/],
    [[legend(), beta({ memoryCard: { cardId: "cd_u_neria", plus: false } })], /레전드 2: '.+' 은\(는\) 고유 카드라 메모리 카드로 쓸 수 없습니다/],
    [[legend({ memoryCard: { cardId: "cd_c_harr", plus: true } })], /레전드 1: '.+' 은\(는\) 코치 카드라 메모리 카드로 쓸 수 없습니다/],
    [[legend({ memoryCard: { cardId: "cd_p_tackle" } })], /대비 카드라 메모리 카드로 쓸 수 없습니다/],
    [[legend({ charId: "ch_nobody" })], /레전드 1: 알 수 없는 캐릭터 'ch_nobody'/],
    [[legend({ teamId: "" })], /레전드 1: 등록 팀 id \(teamId\) 가 없습니다/],
    [[legend(), legend({ name: "또 네리아" })], /레전드 2: 레전드 1 과\(와\) 같은 팀의 같은 선수입니다/],
    [[legend({ memoryCard: { cardId: "cd_basic", plus: "yes" } })], /메모리 카드 강화 \(plus\) 가 참 \/ 거짓이 아닙니다/],
    [[legend({ memoryCard: "cd_basic" })], /메모리 카드가 객체가 아닙니다/],
    [[legend({ teamName: 3 })], /팀 이름 \(teamName\) 이 문자열이 아닙니다/],
    [[null], /레전드 1: 레전드가 객체가 아닙니다/],
    [legend(), /레전드 목록이 배열이 아닙니다/],
  ];
  for (const [legends, re] of bad) {
    assert.throws(() => LR.validateLegends(data, legends), (e) => e.message.startsWith("레전드: 오류 ") && re.test(e.message), String(re));
    assert.throws(() => LR.createRun({ data, seed: "leg-bad", legends }), re, "createRun 도 같은 검사로 막는다");
  }
  // 오류는 모두 모아 한 번에 (줄마다 하나)
  const many = [legend(), beta({ charId: "ch_nobody", memoryCard: { cardId: "cd_c_harr" } }), legend({ teamId: "t_c", memoryCard: { cardId: "cd_u_neria" } })];
  const errs = LR.legendErrors(data, many);
  assert.equal(errs.length, 4, errs.join("\n"));
  assert.throws(() => LR.validateLegends(data, many), (e) => e.message.split("\n").length === 5 && e.message.startsWith("레전드: 오류 4개\n- "));
});

test("§24.9 createRun 레전드 없음 (생략 · null · []) = 레전드 전과 같은 런 (덱 · rng · 로그 · state.legends [])", () => {
  const base = LR.createRun({ data, seed: "leg-none" });
  for (const legends of [undefined, null, []]) same(LR.createRun({ data, seed: "leg-none", legends }), base);
  assert.deepEqual(base.legends, []);
  assert.ok(base.deck.every((e) => !("src" in e)));
  assert.ok(!base.log.some((x) => x.text.startsWith("레전드")));
});

test("§24.9 시작 덱: 메모리 카드는 고유 카드 뒤에 { uid, cardId, plus, src: 'memory' } · 레전드 순서 · nextUid · 뷰의 memory 띠 · 로그", () => {
  const base = LR.createRun({ data, seed: "leg-deck" });
  const n = base.deck.length;
  assert.equal(fam(base.deck[n - 1].cardId), "unique", "기본 덱 끝 = 고유 카드");
  const s = LR.createRun({ data, seed: "leg-deck", legends: [legend(), beta()] });
  same(s.deck.slice(0, n), base.deck);
  assert.deepEqual(s.deck.slice(n), [
    { uid: `k${n + 1}`, cardId: "cd_high_five", plus: true, src: "memory" },
    { uid: `k${n + 2}`, cardId: "cd_basic", plus: false, src: "memory" },
  ]);
  assert.equal(s.nextUid, n + 3);
  assert.equal(new Set(s.deck.map((e) => e.uid)).size, s.deck.length, "uid 겹침 없음");
  // 주 화면 덱 · 상담 덱 뷰의 memory (U5 "메모리" 띠)
  const wv = LR.getWeekView(s, data);
  assert.deepEqual(wv.deck.map((c) => c.memory), s.deck.map((e) => e.src === "memory"));
  assert.deepEqual(wv.legends.map((l) => l.charId), ["ch_spirit_keeper", "ch_dwarf_wall"]);
  assert.ok(s.log.some((x) => x.text === "레전드 합류: 네리아 (알파 클럽) · 도르비나 (베타 클럽) — 메모리 카드 하이파이브+ · 기초 훈련"), JSON.stringify(s.log));
  // 메모리 카드는 다음 런의 후보이기도 하다 (보통 카드)
  assert.ok(LR.memoryCardOptions(s, data).some((o) => o.cardId === "cd_high_five" && o.plus && o.card.memory === false));
});

test("§24.9 같은 팀에서 둘을 데려가면 메모리 카드는 1장 (그 팀의 처음 있는 카드) · 메모리 카드 없는 레전드", () => {
  const n = LR.createRun({ data, seed: "leg-team" }).deck.length;
  const mem = (s) => s.deck.filter((e) => e.src === "memory").map((e) => [e.cardId, e.plus]);
  const twice = LR.createRun({ data, seed: "leg-team", legends: [legend(), legend({ charId: "ch_dwarf_wall", name: "도르비나" })] });
  assert.deepEqual(mem(twice), [["cd_high_five", true]]);
  assert.equal(twice.deck.length, n + 1);
  assert.equal(twice.legends.length, 2, "레전드는 둘 다 남는다");
  // 같은 팀: 첫 레전드에 카드가 없으면 그 팀의 다음 레전드 카드
  const late = LR.createRun({ data, seed: "leg-team", legends: [legend({ memoryCard: null }), legend({ charId: "ch_dwarf_wall", memoryCard: { cardId: "cd_cooldown", plus: true } })] });
  assert.deepEqual(mem(late), [["cd_cooldown", true]]);
  // 다른 팀이면 팀마다 1장
  assert.deepEqual(mem(LR.createRun({ data, seed: "leg-team", legends: [beta(), legend()] })), [["cd_basic", false], ["cd_high_five", true]]);
  // 옛 등록 팀 (메모리 카드 없음) 의 레전드 → 카드 없음, 덱은 레전드 전과 같다
  const old = LR.createRun({ data, seed: "leg-team", legends: [legend({ memoryCard: null })] });
  assert.deepEqual(mem(old), []);
  same(old.deck, LR.createRun({ data, seed: "leg-team" }).deck);
});

test("§24.9 이번 런 선수와 같은 캐릭터도 레전드가 된다 · 선수 · 코치는 그대로 · state.legends 는 아는 키만 담은 사본", () => {
  const base = LR.createRun({ data, seed: "leg-same" });
  assert.ok(base.players.some((p) => p.charId === "ch_spirit_keeper"));
  const input = [legend({ extra: "무시", teamName: undefined, name: undefined })];
  const s = LR.createRun({ data, seed: "leg-same", legends: input });
  same(s.players, base.players);
  same(s.supports, base.supports);
  assert.deepEqual(s.legends, [{
    teamId: "t_alpha", teamName: "", charId: "ch_spirit_keeper", name: data.characters.find((c) => c.id === "ch_spirit_keeper").name,
    memoryCard: { cardId: "cd_high_five", plus: true },
  }]);
  input[0].memoryCard.cardId = "cd_basic"; // 넘긴 목록을 나중에 바꿔도 런은 그대로
  assert.equal(s.legends[0].memoryCard.cardId, "cd_high_five");
  assert.equal(s.deck.at(-1).cardId, "cd_high_five");
  // plus 를 빼면 강화 안 됨
  const plain = LR.createRun({ data, seed: "leg-same", legends: [legend({ memoryCard: { cardId: "cd_one_team" } })] });
  assert.deepEqual(plain.deck.at(-1), { uid: plain.deck.at(-1).uid, cardId: "cd_one_team", plus: false, src: "memory" });
  assert.deepEqual(plain.legends[0].memoryCard, { cardId: "cd_one_team", plus: false });
});

test("§24.9 JSON 왕복 · 완주: 매 단계 JSON 사본으로 이어도 같은 런 · 경기 준비 · 평가 · 등록 팀에 레전드가 없다 · 런 끝 메모리 카드 추천", () => {
  const legends = [legend(), beta()];
  const a = LR.createRun({ data, seed: "leg-rt", policy: "ace", legends });
  let b = clone(a);
  let guard = 0;
  let matches = 0;
  while (a.phase !== "finished") {
    assert.ok(++guard < 2000, "끝나지 않는다");
    if (a.phase === "match") {
      // 경기 준비는 레전드와 상관없다 (state.legends 를 비워도 같다)
      same(LR.getMatchSetup(a, data), LR.getMatchSetup({ ...clone(a), legends: [] }, data));
      matches += 1;
    }
    M.autoStep(a, data, { playMatch: () => ({ ...WIN }) });
    b = clone(b);
    LR.migrateLessonRun(b, data);
    M.autoStep(b, data, { playMatch: () => ({ ...WIN }) });
    same(b, a);
  }
  assert.ok(matches >= 3, "경계전 3번");
  same(a.legends, LR.createRun({ data, seed: "leg-rt", policy: "ace", legends }).legends);
  // 평가 · 등록 팀: state.legends 가 있든 없든 같다 (레전드 인자 없음)
  const fa = LR.finalizeRun(clone(a), data);
  const fb = LR.finalizeRun({ ...clone(a), legends: [] }, data);
  same(fa, fb);
  assert.ok(!("legends" in fa.registeredTeam) && !("memoryCard" in fa.registeredTeam), "메모리 카드는 화면이 붙인다");
  // 런 끝: 후보 · 추천 (덱에 남은 메모리 카드도 보통 카드처럼 후보)
  const opts = LR.memoryCardOptions(a, data);
  assert.ok(opts.length > 0);
  for (const o of opts) assert.ok(!EXCLUDED.includes(o.family));
  assert.equal(new Set(opts.map((o) => `${o.cardId}|${o.plus}`)).size, opts.length);
  const rec = M.recommendMemoryCard(a, data);
  assert.ok(opts.some((o) => o.cardId === rec.cardId && o.plus === rec.plus));
  assert.equal(LR.validateLegends(data, [{ teamId: teamIdOf(fa.registeredTeam), teamName: fa.registeredTeam.name, charId: a.players[0].charId, name: a.players[0].name, memoryCard: rec }]), true,
    "추천 카드는 다음 런의 메모리 카드로 통과한다");
});

test("§24.9 · §24.10 저장 이행: v4 → v5 는 legends [] · 레전드가 있는 v5 저장본은 그대로 (멱등)", () => {
  const plain = LR.createRun({ data, seed: "leg-mig" });
  const v4 = asV4(plain);
  assert.ok(!("legends" in v4));
  LR.migrateLessonRun(v4, data);
  assert.equal(v4.version, 5);
  assert.deepEqual(v4.legends, []);
  same(LR.migrateLessonRun(clone(v4), data), v4);
  // 레전드가 있는 v5 저장본: legends · 메모리 카드 src 가 그대로
  const s = LR.createRun({ data, seed: "leg-mig", legends: [legend(), beta()] });
  const saved = clone(s);
  assert.ok(LR.isLessonRun(saved));
  LR.migrateLessonRun(saved, data);
  same(saved, s);
  same(LR.migrateLessonRun(clone(saved), data), s);
  // legends 키가 빠진 v5 저장본 (방어): 빈 값으로 채운다
  const noKey = clone(s);
  delete noKey.legends;
  LR.migrateLessonRun(noKey, data);
  assert.deepEqual(noKey.legends, []);
  assert.equal(noKey.deck.filter((e) => e.src === "memory").length, 2, "덱은 그대로");
});

test("tools/lesson_sim.mjs --legends: 인자 (0 ~ 2) · legendsFrom (등록 팀 → 레전드) · 두 번째 런부터 메모리 카드 1장", () => {
  assert.equal(parseArgs([]).legends, 0);
  assert.equal(parseArgs(["--legends", "2"]).legends, 2);
  assert.throws(() => parseArgs(["--legends", "3"]), /--legends 는 0 ~ 2/);
  assert.throws(() => parseArgs(["--legends", "x"]), /--legends 는 0 ~ 2/);
  // legendsFrom: 등록 스탯 합이 큰 순, 같으면 팀 순서 · teamIdOf · 메모리 카드 사본
  const team = {
    name: "우리 클럽", seed: "z", createdTurnIndex: 15,
    players: [
      { charId: "ch_spirit_keeper", name: "네리아", stats: { shoot: 1, dribble: 1, pass: 1, defense: 1, physical: 1 } },
      { charId: "ch_dwarf_wall", name: "도르비나", stats: { shoot: 9, dribble: 1, pass: 1, defense: 1, physical: 1 } },
      { charId: "ch_human_captain", name: "아델린", stats: { shoot: 1, dribble: 1, pass: 1, defense: 1, physical: 1 } },
    ],
  };
  const mc = { cardId: "cd_basic", plus: true };
  const ls = legendsFrom(team, mc, 2);
  assert.deepEqual(ls.map((l) => l.charId), ["ch_dwarf_wall", "ch_spirit_keeper"]);
  for (const l of ls) {
    assert.equal(l.teamId, teamIdOf(team));
    assert.equal(l.teamName, "우리 클럽");
    assert.deepEqual(l.memoryCard, mc);
    assert.notEqual(l.memoryCard, mc, "사본");
  }
  assert.equal(LR.validateLegends(data, ls), true);
  assert.deepEqual(legendsFrom(team, mc, 0), []);
  // 시뮬 2런 (경기 없음): 첫 런은 레전드 없음, 두 번째 런은 앞 런 등록 팀의 레전드 2명 · 메모리 카드 1장
  const args = parseArgs(["--runs", "2", "--seed", "leg", "--no-match", "--legends", "2"]);
  const sum = summarize(data, args, "team");
  assert.equal(sum.runs, 2);
  assert.equal(sum.legendRuns, 1);
  assert.equal(sum.legendMemory, 1);
  assert.ok(Number.isFinite(sum.legendMemoryPlays) && sum.legendMemoryPlays >= 0);
  // --legends 0 이면 레전드 런이 없다
  assert.equal(summarize(data, parseArgs(["--runs", "1", "--seed", "leg", "--no-match"]), "team").legendRuns, 0);
});
