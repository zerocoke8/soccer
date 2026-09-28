// test/ui.smoke.test.mjs — index.html 을 jsdom 으로 올리고 js/ui/app.js 가 start → setup → run 화면을 그리는지 확인
// jsdom 이 없으면(devDependency 미설치) 건너뛴다. fetch 는 fs 읽기로 폴리필한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

let JSDOM = null;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  JSDOM = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000, step = 20) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(step);
  }
  return fn();
}

test("index.html 이 참조하는 경로가 존재하고 전부 상대 경로다", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  assert.ok(refs.length >= 2);
  for (const ref of refs) {
    assert.ok(!ref.startsWith("/"), `절대 경로 금지: ${ref}`);
    assert.ok(fs.existsSync(path.join(ROOT, ref)), `참조 파일 없음: ${ref}`);
  }
  // app.js 의 fetch / import 도 상대 경로
  const app = fs.readFileSync(path.join(ROOT, "js/ui/app.js"), "utf8");
  for (const m of app.matchAll(/fetch\(\s*[`'"]([^`'"$]+)/g)) assert.ok(m[1].startsWith("./"), `fetch 상대 경로: ${m[1]}`);
  for (const m of app.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) assert.ok(m[1].startsWith("../") || m[1].startsWith("./"), `import 상대 경로: ${m[1]}`);
  // 모든 UI 모듈의 정적 import 가 존재하는 파일을 가리킴
  const uiFiles = fs.readdirSync(path.join(ROOT, "js/ui")).filter((f) => f.endsWith(".js")).map((f) => `js/ui/${f}`)
    .concat(fs.readdirSync(path.join(ROOT, "js/ui/screens")).map((f) => `js/ui/screens/${f}`));
  for (const f of uiFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(path.join(ROOT, f)), m[1]);
      assert.ok(fs.existsSync(target), `${f} → ${m[1]} 없음`);
    }
  }
});

test("jsdom: app.js 부트 → start 화면 → 편성 → 기본 편성으로 런 시작", { skip: !JSDOM && "jsdom 미설치" }, async (t) => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/soccer/", pretendToBeVisual: true });
  const { window } = dom;
  const errors = [];
  window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));

  // 전역 폴리필 (dom.js/app.js 가 쓰는 것만)
  const g = globalThis;
  const saved = {};
  const names = ["window", "document", "Node", "HTMLElement", "Element", "localStorage", "navigator", "confirm", "CustomEvent", "Event", "getComputedStyle"];
  for (const n of names) saved[n] = g[n];
  g.window = window;
  g.document = window.document;
  g.Node = window.Node;
  g.HTMLElement = window.HTMLElement;
  g.Element = window.Element;
  g.localStorage = window.localStorage;
  try { Object.defineProperty(g, "navigator", { value: window.navigator, configurable: true, writable: true }); } catch { /* node 21+ 읽기 전용이면 무시 */ }
  g.confirm = () => true;
  g.CustomEvent = window.CustomEvent;
  g.Event = window.Event;
  g.getComputedStyle = window.getComputedStyle.bind(window);
  const realFetch = g.fetch;
  g.fetch = async (url) => {
    const rel = String(url).replace(/^\.\//, "");
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => { throw new Error("404"); } };
    const text = fs.readFileSync(p, "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  t.after(() => {
    for (const n of names) {
      try { if (saved[n] === undefined) delete g[n]; else g[n] = saved[n]; } catch { /* ignore */ }
    }
    g.fetch = realFetch;
    const timer = window.__soccer?.store?.matchUi?.timer;
    if (timer) clearInterval(timer);
    // 경기 화면의 비트 루프는 화면이 문서에서 빠지면 스스로 멈춘다
    try { window.document.getElementById("app")?.replaceChildren(); } catch { /* ignore */ }
    window.close();
  });

  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;

  // start 화면
  const startBtn = await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  assert.ok(startBtn, "start 화면의 [새 런 시작] 버튼");
  assert.ok(doc.querySelector("#app h1")?.textContent.length > 0, "타이틀");
  assert.ok(window.__soccer && window.__soccer.store.data, "데이터 로드됨");
  assert.ok(window.__soccer.run && window.__soccer.match, "엔진 모듈 로드됨");
  assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, "에러 토스트 없음");

  // setup 화면
  startBtn.click();
  await until(() => window.__soccer.store.screen === "setup");
  const slotCards = doc.querySelectorAll(".slot-card");
  assert.equal(slotCards.length, 7, "2-2-2 슬롯 카드 7개");
  assert.equal(doc.querySelectorAll(".support-card.selected").length, 6, "기본 서포트 6장 선택됨");
  // v0.3: 캐릭터 카드에 연계 특성 이름, 전술 수비 성향에 "버티기 선호" · "의도 따라가기" 없음
  assert.equal(doc.querySelectorAll(".slot-card .trait-tag").length, 7, "슬롯 카드마다 연계 특성");
  assert.ok([...doc.querySelectorAll(".slot-card .trait-tag")].some((el) => el.textContent.includes("킬패스")), "실루엔 = 킬패스");
  const defOpts = [...doc.querySelectorAll("select option")].map((o) => [o.value, o.textContent]);
  assert.ok(defOpts.some(([v, t]) => v === "hold" && t === "버티기 선호"), "수비 성향 버티기 선호");
  assert.ok(!defOpts.some(([v, t]) => v === "readIntent" || t.includes("의도")), "의도 따라가기 제거");
  const seedInput = doc.querySelector("input.input");
  assert.ok(seedInput);
  seedInput.value = "ui-smoke";
  seedInput.dispatchEvent(new window.Event("input", { bubbles: true }));
  // 슬롯 탭 → 캐릭터 목록 모달 (적성 배지)
  slotCards[0].click();
  const picks = doc.querySelectorAll("#modal-root .char-pick");
  assert.equal(picks.length, window.__soccer.store.data.characters.length, "캐릭터 목록");
  assert.equal(doc.querySelectorAll("#modal-root .char-pick .trait-tag").length, picks.length, "목록에도 연계 특성");
  assert.ok([...picks].some((b) => b.disabled), "GK 슬롯에서 적성 -/C 는 비활성");
  const closeBtn = [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "닫기");
  closeBtn.click();
  assert.equal(doc.querySelectorAll("#modal-root .modal").length, 0);

  // 기본 편성으로 시작
  const defaultBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("기본 편성으로 시작"));
  defaultBtn.click();
  await until(() => window.__soccer.store.screen === "run" && window.__soccer.store.run);
  const run = window.__soccer.store.run;
  assert.equal(run.seed, "ui-smoke");
  assert.ok(["turn", "event"].includes(run.phase));
  assert.ok(doc.querySelector(".topbar"), "훈련 화면 상단 바");
  const nmView = window.__soccer.run.getTurnView(window.__soccer.store.run, window.__soccer.store.data).nextMatch;
  assert.ok(nmView.styleHint && doc.querySelector(".next-match").textContent.includes(nmView.styleHint), "다음 경기 정보에 상대 성향(styleHint)");
  assert.ok(!doc.querySelector(".next-match").textContent.includes("의도"), "의도 공개 표시 제거");
  assert.equal(doc.querySelectorAll(".slot-row").length, 5, "훈련 칸 5개");
  if (run.phase === "event") {
    assert.ok(doc.querySelector("#modal-root .choice-btn"), "이벤트 모달");
    doc.querySelector("#modal-root .choice-btn").click();
    await until(() => window.__soccer.store.run.phase !== "event");
  }
  assert.equal(window.__soccer.store.run.phase, "turn");
  // 저장 확인
  const savedRun = JSON.parse(window.localStorage.getItem("soccer.run"));
  assert.equal(savedRun.seed, "ui-smoke");

  // 훈련 한 번: 추천 칸 시트 → [훈련하기]
  const view = window.__soccer.run.getTurnView(window.__soccer.store.run, window.__soccer.store.data);
  const rows = [...doc.querySelectorAll(".slot-row")];
  const recRow = rows.find((r) => r.classList.contains("recommended"));
  assert.ok(recRow, "추천 칸 표시");
  recRow.click();
  const trainBtn = await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "훈련하기"));
  assert.ok(trainBtn);
  const turnBefore = window.__soccer.store.run.turnIndex;
  trainBtn.click();
  await until(() => window.__soccer.store.run.turnIndex !== turnBefore || window.__soccer.store.run.phase !== "turn");
  const after = window.__soccer.store.run;
  assert.ok(after.turnIndex === turnBefore + 1 || after.phase === "event", "턴 진행 또는 이벤트");
  assert.ok(after.log.some((l) => l.text.startsWith("훈련[")), "훈련 로그");
  void view;

  // ---- 경기 화면 (§12.3 + v0.3 §13.6): 친선전 한 판 — 수동 결정(받는 선수 선택) → 연출 → 스킵 → 결과 → finishMatch 1회 ----
  const S = window.__soccer;
  const ui = S.store.matchUi;
  ui.auto = false;
  ui.speed = 4;
  let finishCalls = 0;
  const origFinish = S.actions.finishMatch;
  S.actions.finishMatch = (r) => { finishCalls++; return origFinish(r); };
  for (let i = 0; i < 5 && S.store.run.phase === "event"; i++) {
    doc.querySelector("#modal-root .choice-btn").click();
    await until(() => S.store.run.phase !== "event");
  }
  assert.equal(S.store.run.phase, "turn");
  S.actions.doAction({ type: "friendly" });
  for (let i = 0; i < 5 && S.store.run.phase === "event"; i++) {
    doc.querySelector("#modal-root .choice-btn").click();
    await until(() => S.store.run.phase !== "event");
  }
  const scr = await until(() => S.store.run.phase === "match" && doc.querySelector(".match-screen"));
  assert.ok(scr, "경기 화면");
  assert.equal(S.store.match.version, 3, "경기 상태 v3");
  assert.equal(scr.querySelectorAll(".tok").length, 14, "토큰 14개");
  assert.equal(scr.querySelectorAll(".pitch .zone").length, 5, "5구역 밴드");
  assert.equal(scr.querySelectorAll(".m-track .trk").length, 4, "공격 진행 트랙 4칸");
  const mv = S.match.getMatchView(S.store.match, S.store.data, "home");
  assert.equal(mv.needsDecision, "attack", "킥오프 첫 듀얼은 우리 공격 결정");
  const carrierTok = scr.querySelector(`.tok[data-side="home"][data-id="${mv.carrier.id}"]`);
  assert.equal(carrierTok?.dataset.role, "carrier");
  const ballEl = scr.querySelector(".m-ball");
  assert.deepEqual([ballEl.dataset.x, ballEl.dataset.y], [carrierTok.dataset.x, carrierTok.dataset.y], "공 = 공 가진 선수 좌표");
  // 받는 선수 후보 전원이 receiver (도착 구역) — §13.6
  for (const a of ["pass", "cross"]) {
    for (const id of mv.receivers?.[a]?.candidates || []) {
      assert.equal(scr.querySelector(`.tok[data-side="home"][data-id="${id}"]`)?.dataset.role, "receiver", `${a} 후보 ${id} = receiver`);
    }
  }
  // 예상 행동: 상대 듀얼 선수 머리 위 말풍선 + 정보 줄 근거 · 우리 예상 행동
  const oppExp = mv.expected.defense;
  const oppTok = scr.querySelector(`.tok[data-side="away"][data-id="${oppExp.playerId}"]`);
  assert.ok(oppTok.classList.contains("has-bubble"), "상대 듀얼 선수 말풍선");
  assert.ok(oppTok.querySelector(".tok-bubble").textContent.includes(S.store.data && ({ tackle: "태클", intercept: "인터셉트", hold: "버티기" })[oppExp.action]), "말풍선 = 상대 예상 행동");
  assert.match(scr.querySelector(".m-info .expect").textContent, /형 · .+ \d+ > .+ \d+/, "근거: 성향값 1·2위");
  assert.match(scr.querySelector(".m-info .mine").textContent, /^우리: /, "우리 선수 예상 행동");
  // 결정 대기(수동): 공격 버튼 = 켜진 액션만 2열, 제목 "액션 N%", 성공/실패 한 줄씩 (엔진 Outcome.short), 추천 1개
  const enabledActs = [...scr.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
  assert.equal(enabledActs.length, mv.actions.filter((a) => a.enabled).length, "켜진 액션만 버튼");
  assert.ok(enabledActs.length >= 2, "고를 수 있는 액션");
  assert.ok(scr.querySelector(".action-grid").classList.contains("cols-2"), "공격 = 2열");
  for (const b of enabledActs) {
    const a = mv.actions.find((x) => x.action === b.dataset.action);
    const out = b.dataset.receiver && mv.outcomesByReceiver?.[a.action]?.[b.dataset.receiver] || mv.outcomes[a.action];
    assert.equal(b.querySelectorAll(".act-out").length, 2, `${a.action} 성공·실패 두 줄`);
    assert.ok(b.textContent.includes(out.success.short) && b.textContent.includes(out.fail.short), `${a.action} 짧은 결과 문구`);
    assert.equal(b.querySelector(".act-pct").textContent, `${a.expectedPct}%`, `${a.action} 기대 %`);
    assert.equal(!!b.querySelector(".chip-rec"), !!a.recommended, `${a.action} 추천 표시`);
  }
  assert.equal(scr.querySelectorAll(".chip-rec").length, 1, "추천은 한 버튼");
  // 누르고 있기 → 필드 화살표, 떼면 사라짐
  const actBtn = enabledActs.find((b) => b.dataset.action === "pass") || enabledActs[0];
  actBtn.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
  assert.ok(scr.querySelectorAll(".g-arrow line, .g-arrow path").length > 0, "미리보기 화살표");
  actBtn.dispatchEvent(new window.Event("pointerleave"));
  assert.equal(scr.querySelectorAll(".g-arrow line, .g-arrow path").length, 0, "화살표 해제");
  // 받는 선수 직접 고르기: 기본이 아닌 후보 토큰 탭 → 버튼 제목·% 갱신 → 결정 { action, receiverId } (GDD v0.5 §9.6)
  let picked = null;
  const passCands = mv.receivers?.pass?.candidates || [];
  assert.ok(passCands.length > 1, "기본 편성 킥오프: 패스 후보 MF 2명");
  if (passCands.length > 1) {
    picked = passCands.find((id) => id !== mv.receivers.pass.defaultId);
    const evBeforeTap = S.store.match.events.length;
    scr.querySelector(`.tok[data-side="home"][data-id="${picked}"]`).click();
    assert.equal(S.store.match.events.length, evBeforeTap, "탭은 경기를 진행하지 않음");
    assert.equal(doc.querySelectorAll("#modal-root .mini-card").length, 0, "후보 탭 = 선택 (미니 카드 아님)");
    const pb = scr.querySelector('button[data-action="pass"]');
    assert.equal(pb.dataset.receiver, picked, "탭한 후보가 패스 받는 선수");
    const pickedName = mv.players.home.find((p) => p.id === picked).name;
    assert.ok(pb.querySelector(".act-rname").textContent === pickedName, "버튼 제목 → 받는 선수");
    assert.equal(pb.querySelector(".act-pct").textContent, `${mv.outcomesByReceiver.pass[picked].expectedPct}%`, "받는 선수별 기대 %");
    assert.ok(scr.querySelector(`.tok[data-side="home"][data-id="${picked}"]`).classList.contains("picked"), "고른 후보 토큰 표시");
    // 후보가 아닌 토큰 탭 = 미니 카드 (연계 특성 표시)
    scr.querySelector(`.tok[data-side="away"][data-id="${oppExp.playerId}"]`).click();
    assert.equal(doc.querySelectorAll("#modal-root .mini-card").length, 1, "미니 카드");
    [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "닫기").click();
    const ownTrait = mv.players.home.find((p) => p.id === picked).trait;
    scr.querySelector(`.tok[data-side="home"][data-id="${picked}"]`).dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const card = doc.querySelector("#modal-root .mini-card");
    assert.ok(card, "후보도 길게 누르기(우클릭) = 미니 카드");
    if (ownTrait) assert.ok(card.querySelector(".mc-trait"), "미니 카드에 연계 특성");
    [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "닫기").click();
  }
  // 클릭 → 즉시 step, 연출 중에는 중복 step 없음
  const n0 = S.store.match.events.length;
  const clickBtn = picked ? scr.querySelector('button[data-action="pass"]') : actBtn;
  clickBtn.click();
  const n1 = S.store.match.events.length;
  assert.ok(n1 > n0, "클릭 즉시 판정");
  if (picked) {
    assert.equal(ui.lastDecision.action, "pass");
    assert.equal(ui.lastDecision.receiverId, picked, "결정에 고른 받는 선수");
    const ev = S.store.match.events.slice(n0).find((e) => e.type === "duel" || e.type === "turnover");
    if (ev.type === "duel") assert.equal(ev.receiverId, picked, "실제 받는 선수 = 고른 선수");
  }
  assert.equal(ui.busy, true, "비트 연출 중");
  clickBtn.click();
  assert.equal(S.store.match.events.length, n1, "연출 중 중복 step 금지");
  // 연출 중 배속 버튼: 스코어·로그는 연출 단계가 갱신한다 (판정 전 view 로 되돌리거나 결과를 먼저 보여주지 않음)
  const logBefore = scr.querySelector(".match-log").textContent;
  const scoreBefore = scr.querySelector(".mh-score").textContent;
  [...scr.querySelectorAll(".match-controls .speed button")].find((b) => b.textContent === "4x").click();
  assert.equal(ui.busy, true);
  assert.equal(scr.querySelector(".match-log").textContent, logBefore, "연출 중 컨트롤 클릭: 로그 그대로");
  assert.equal(scr.querySelector(".mh-score").textContent, scoreBefore, "연출 중 컨트롤 클릭: 스코어 그대로");
  assert.ok(await until(() => !ui.busy, 5000), "연출 끝");
  // 자동 켜고 개입 → 자동 끄기: 개입 대기도 해제 (끈 뒤 '직접 선택 중'/'개입 대기…' 로 남지 않음)
  const ctlBtn = (re) => [...scr.querySelectorAll(".match-controls button")].find((b) => re.test(b.textContent));
  ctlBtn(/^자동 OFF$/).click();
  ctlBtn(/^개입$/).click();
  assert.equal(ui.intervene, true, "개입 켜짐");
  ctlBtn(/^자동 ON$/).click();
  assert.equal(ui.auto, false);
  assert.equal(ui.intervene, false, "자동 OFF → 개입 해제");
  const iv = ctlBtn(/개입/);
  assert.equal(iv.textContent, "개입");
  assert.ok(iv.disabled && !iv.classList.contains("active"), "개입 버튼: 비활성 · 강조 없음");
  await until(() => !ui.busy, 5000);
  // 결과 스킵 → 결과 모달 → 확인 연타에도 finishMatch 1회
  [...scr.querySelectorAll("button")].find((b) => b.textContent === "⏭").click();
  const okBtn = await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인"));
  assert.ok(okBtn, "결과 모달");
  assert.ok(S.match.isFinished(S.store.match), "경기 종료");
  assert.ok(!scr.querySelector(".m-cutin.show"), "스킵하면 컷인 없음");
  // 종료 후 마지막 모습: 턴오버·세이브면 공을 얻은 팀 선수가 공, 골이면 carrier 없음 (공을 잃은 선수에게 되돌아가지 않음)
  const lastBeat = S.match.getMatchView(S.store.match, S.store.data, "home").lastBeat;
  const carrierEls = [...scr.querySelectorAll('.tok[data-role="carrier"]')];
  if (lastBeat.type === "goal") assert.equal(carrierEls.length, 0, "골로 끝남: carrier 없음");
  else if (lastBeat.type === "turnover" || lastBeat.type === "save") {
    assert.equal(carrierEls.length, 1);
    assert.equal(carrierEls[0].dataset.side, lastBeat.toAttackingSide, "공을 얻은 팀이 공을 가짐");
    assert.equal(carrierEls[0].dataset.id, lastBeat.defenderId, "뺏은 선수 / 세이브한 GK");
  }
  okBtn.click();
  okBtn.click();
  assert.equal(finishCalls, 1, "finishMatch 정확히 1회");
  assert.notEqual(S.store.run.phase, "match", "경기 후 다음 단계");
  assert.equal(S.store.match, null);
  S.actions.finishMatch = origFinish;

  // ---- 시나리오 주입 (tools/scenarios.mjs — shot.mjs 와 같은 상태) ----
  const { loadData, buildScenarioState, SCENARIOS } = await import(pathToFileURL(path.join(ROOT, "tools/scenarios.mjs")).href);
  const sdata = loadData();
  const inject = (name, { auto = false } = {}) => {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === name), { runSeed: 1 });
    ui.auto = auto;
    ui.speed = 4;
    ui.intervene = false;
    S.store.run = prep.runState;
    S.store.match = prep.matchState;
    S.store.screen = "run";
    S.render();
    return { prep, scr: doc.querySelector(".match-screen"), view: S.match.getMatchView(S.store.match, S.store.data, "home") };
  };

  // [회귀 v0.1] 상대 ④ 슈팅: DOM 에서도 우리 필드 6명 전원이 공 뒤(화면 위), 우리 GK 만 공 아래
  {
    const { scr: scr2 } = inject("03_away_shot", { auto: true });
    assert.ok(scr2, "경기 화면 (주입 상태)");
    const pyOf = (el) => Number(/translate\(\s*[-\d.]+px,\s*([-\d.]+)px\)/.exec(el.style.transform)?.[1]);
    const awayCarrier = scr2.querySelector('.tok[data-side="away"][data-role="carrier"]');
    assert.ok(awayCarrier, "상대 carrier");
    const ballY = Number(scr2.querySelector(".m-ball").dataset.y);
    assert.ok(ballY < 16, `공이 우리 박스(Z1) 안: y ${ballY}`);
    const homeToks = [...scr2.querySelectorAll('.tok[data-side="home"]')];
    const field = homeToks.filter((el) => el.dataset.role !== "gk" && el.dataset.role !== "defender");
    const keeper = homeToks.find((el) => el.dataset.role === "defender");
    assert.equal(field.length, 6, "우리 필드 6명");
    for (const el of field) {
      assert.equal(el.dataset.role, "broken", "뚫린 라인");
      assert.ok(Number(el.dataset.y) > ballY, "공 뒤 (y 큼)");
      assert.ok(pyOf(el) < pyOf(awayCarrier), "화면에서도 공보다 위");
    }
    assert.ok(keeper && Number(keeper.dataset.y) < ballY && pyOf(keeper) > pyOf(awayCarrier), "우리 GK 만 공 아래 (골문 앞)");
    assert.ok(scr2.querySelector(".zone.z1.hl-crisis"), "우리 박스 빨강(슈팅 위기)");
    assert.match(scr2.querySelector(".m-banner").textContent, /슈팅 위기/);
    assert.equal(scr2.querySelectorAll(".m-track .trk.on.away").length, 4, "트랙: 상대 ④ 까지");
    assert.match(scr2.querySelector(".m-remain").title, /남은 수비: GK/);
    assert.equal(scr2.querySelector(".m-remain").textContent, "남은 수비: GK");
    S.actions.resetToStart();
  }

  // 08 크로스: 울릭(크로서) ③ — 공격 4버튼 2×2, 크로스 후보(FW + 피지컬 최고 MF) 전원 박스, 크로스 화살표 = 포물선
  {
    const { scr: s8, view: v8 } = inject("08_cross_decision");
    const btns = [...s8.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
    assert.deepEqual(btns.map((b) => b.dataset.action).sort(), v8.actions.filter((a) => a.enabled).map((a) => a.action).sort());
    assert.ok(btns.some((b) => b.dataset.action === "cross"), "크로스 버튼");
    assert.ok(s8.querySelector(".action-grid").classList.contains("rows-2"), "2×2");
    const cb = s8.querySelector('button[data-action="cross"]');
    assert.equal(cb.querySelector(".act-lbl").textContent, "크로스");
    assert.ok(cb.querySelector(".act-more"), "후보 2명 이상 → ▾");
    for (const id of v8.receivers.cross.candidates) {
      const el = s8.querySelector(`.tok[data-side="home"][data-id="${id}"]`);
      assert.equal(el.dataset.role, "receiver");
      assert.ok(Number(el.dataset.y) >= 84, `크로스 후보 ${id} 는 상대 박스 (y ${el.dataset.y})`);
    }
    cb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s8.querySelector(".g-arrow path.ar-cross"), "크로스 = 포물선 화살표");
    cb.dispatchEvent(new window.Event("pointerleave"));
    // 크로스 후보 중 기본이 아닌 선수 탭 → 크로스 받는 선수만 바뀐다 (패스 후보가 아니면)
    const other = v8.receivers.cross.candidates.find((id) => id !== v8.receivers.cross.defaultId);
    s8.querySelector(`.tok[data-side="home"][data-id="${other}"]`).click();
    assert.equal(s8.querySelector('button[data-action="cross"]').dataset.receiver, other, "크로스 받는 선수 변경");
    if (!(v8.receivers.pass?.candidates || []).includes(other)) {
      assert.equal(s8.querySelector('button[data-action="pass"]')?.dataset.receiver ?? "", v8.receivers.pass?.defaultId ?? "", "패스 받는 선수는 그대로");
    }
    S.actions.resetToStart();
  }

  // 09 합체기: 바람의 실을 받은 그룸바 — 스킬 줄 '바람의 유성' 토글 → 슛만 가능 → 결정 { action, ultimate: true } → 컷인 2연속 + 이름
  {
    const { scr: s9, view: v9 } = inject("09_combo_ready");
    const ub = s9.querySelector(".skill-row .ult-btn");
    assert.ok(ub && !ub.disabled, "필살기 버튼");
    assert.ok(ub.textContent.includes("바람의 유성") && ub.classList.contains("combo"), "합체기면 합체기 이름");
    const carrierEl = s9.querySelector(`.tok[data-side="home"][data-id="${v9.carrier.id}"]`);
    assert.ok(carrierEl.classList.contains("has-ult") && carrierEl.classList.contains("ult-ready"), "게이지 링 · 준비되면 빛남");
    ub.click();
    assert.equal(s9.querySelector(".skill-row .ult-btn").getAttribute("aria-pressed"), "true", "토글");
    const shootBtn = s9.querySelector('button[data-action="shoot"]');
    assert.ok(!shootBtn.disabled && shootBtn.classList.contains("ult-on"), "슛 + 필살기");
    const u = v9.ultimateOptions.find((x) => x.usable);
    assert.equal(shootBtn.querySelector(".act-pct").textContent, `${u.expectedPct.shoot}%`, "필살기 기대 %");
    for (const b of s9.querySelectorAll("button[data-action]")) if (b.dataset.action !== "shoot") assert.ok(b.disabled, `${b.dataset.action}: 필살 슛과 함께 불가`);
    const e0 = S.store.match.events.length;
    shootBtn.click();
    assert.equal(ui.lastDecision.ultimate, true, "결정에 ultimate: true");
    const fresh = S.store.match.events.slice(e0);
    assert.ok(fresh.some((e) => e.type === "combo"), "합체기 이벤트");
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut"), 1500), "전체 화면 컷인");
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut.part-2"), 2500), "합체기: 두 번째 컷인");
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut-name"), 2500), "합체기 이름");
    assert.match(s9.querySelector(".m-cutin .cut-name").textContent, /바람의 유성/);
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    assert.ok(!s9.querySelector(".m-cutin.show"), "컷인 닫힘");
    S.actions.resetToStart();
  }

  // 10 상대 간파: "상대가 우리 수를 읽는 중" (정보 줄 · 말풍선)
  {
    const { scr: s10, view: v10 } = inject("10_opponent_reading");
    assert.equal(v10.opponentReading, true);
    assert.ok(s10.querySelector(".m-info").classList.contains("reading"));
    assert.match(s10.querySelector(".m-info .expect").textContent, /우리 수를 읽는 중/);
    assert.ok(s10.querySelector(".tok.reading.has-bubble"), "상대 듀얼 선수 말풍선 = 간파");
    S.actions.resetToStart();
  }

  // 11 수비: 3버튼 (태클 · 인터셉트 · 버티기), 짝 표시, 간파 사용권 = 즉시 사용하고 결정 대기 유지
  {
    const { scr: s11, view: v11 } = inject("11_defense_decision");
    const btns = [...s11.querySelectorAll("button[data-action]")];
    assert.deepEqual(btns.map((b) => b.dataset.action), ["tackle", "intercept", "hold"]);
    assert.deepEqual(btns.map((b) => b.querySelector(".act-lbl").textContent), ["태클", "인터셉트", "버티기"]);
    assert.ok(s11.querySelector(".action-grid").classList.contains("cols-3"), "수비 = 3열");
    const pairAct = { dribble: "tackle", pass: "intercept", cross: "intercept", shoot: "hold" }[v11.expected.attack.action];
    assert.ok(s11.querySelector(`button[data-action="${pairAct}"] .chip-pair`), "짝 표시");
    for (const b of btns) assert.ok(b.textContent.includes(v11.outcomes[b.dataset.action].success.short), "막으면 …");
    const gb = s11.querySelector('.skill-row [data-gaanpa="ticket"]');
    assert.ok(gb && !gb.disabled && /사용권/.test(gb.textContent), "간파 사용권 버튼");
    const e0 = S.store.match.events.length;
    gb.click();
    const ev = S.store.match.events.slice(e0);
    assert.ok(ev.length === 1 && ev[0].type === "skill" && ev[0].gaanpa && ev[0].ticket, "간파 사용권 이벤트만 (판정 없음)");
    assert.equal(S.match.getMatchView(S.store.match, S.store.data, "home").needsDecision, "defense", "결정 대기 유지");
    assert.ok(s11.querySelector(".skill-row .gaanpa-btn.active"), "간파 사용 표시");
    assert.equal([...s11.querySelectorAll("button[data-action]")].filter((b) => !b.disabled).length, 3, "수비 버튼 그대로 선택 가능");
    S.actions.resetToStart();
  }

  // §13.2-14: 이전 버전(v2) 저장 경기는 새로 만든다
  {
    const prep = buildScenarioState(sdata, SCENARIOS.find((s) => s.name === "01_home_buildup"), { runSeed: 1 });
    const old = JSON.parse(JSON.stringify(prep.matchState));
    old.version = 2;
    old.events = old.events.slice(0, 3);
    S.store.run = prep.runState;
    S.store.match = old;
    S.store.screen = "run";
    S.render();
    assert.equal(S.store.match.version, 3, "새 경기");
    assert.equal(S.store.match.events.length < prep.matchState.events.length || S.store.match.possession === 1, true, "처음부터");
    assert.equal(JSON.parse(window.localStorage.getItem("soccer.match")).version, 3, "저장도 새 경기");
    S.actions.resetToStart();
  }

  assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, "에러 토스트 없음");
  assert.deepEqual(errors, []);
});
