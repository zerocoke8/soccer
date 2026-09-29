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

  // 경기 화면은 가로 전용 (고정 스테이지 1280×720): 옛 세로 저장값 · ?orient 는 무시된다 (아래 가로 좌표 블록에서 확인)
  window.localStorage.setItem("soccer.orient", "port");
  await import(pathToFileURL(path.join(ROOT, "js/ui/app.js")).href);
  const doc = window.document;

  // start 화면
  const startBtn = await until(() => [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("새 런 시작")));
  assert.ok(startBtn, "start 화면의 [새 런 시작] 버튼");
  assert.ok(doc.querySelector("#app h1")?.textContent.length > 0, "타이틀");
  assert.ok(window.__soccer && window.__soccer.store.data, "데이터 로드됨");
  assert.ok(window.__soccer.run && window.__soccer.match, "엔진 모듈 로드됨");
  assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, "에러 토스트 없음");
  assert.ok(window.__soccer.stage && window.__soccer.stage.scale > 0, "고정 스테이지가 섰다");
  assert.equal(doc.getElementById("stage").dataset.mode, "og", "아웃게임 화면 표시 (#stage[data-mode])");

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
  assert.equal(doc.getElementById("stage").dataset.mode, "match", "경기 화면 표시 → 토스트는 오른쪽 위 (css/match.css)");
  assert.equal(S.store.match.version, 3, "경기 상태 v3");
  assert.equal(scr.querySelectorAll(".tok").length, 14, "토큰 14개");
  assert.equal(scr.querySelectorAll(".pitch .zone").length, 5, "5구역 밴드");
  assert.equal(scr.querySelectorAll(".m-track .trk").length, 4, "공격 진행 트랙 4칸");
  // HUD 골격 (사용자 목업): 잔디(.pitch) 안 규칙 영역(.m-field) — 토큰·구역·공은 규칙 영역 안, HUD 는 잔디 위에 겹친다
  assert.equal(scr.dataset.orient, undefined, "방향 표시 없음 (가로 전용)");
  assert.ok(!scr.classList.contains("land") && !scr.querySelector(".pitch-row, .orient-btn, [data-orient]"), "세로/전환 흔적 없음");
  const fieldEl = scr.querySelector(".pitch > .m-field");
  assert.ok(fieldEl, "잔디 안 규칙 영역");
  assert.equal(fieldEl.querySelectorAll(".tok").length, 14, "토큰은 규칙 영역 안");
  assert.equal(fieldEl.querySelectorAll(".zone").length, 5, "구역도 같은 규칙 영역 (화면 위치 = 규칙 위치)");
  assert.ok(fieldEl.querySelector(".m-ball") && fieldEl.querySelector(".pitch-svg"), "공 · 화살표 층도 규칙 영역");
  for (const sel of [".mh", ".m-banner", ".m-track", ".m-dock", ".m-ctl", ".skill-row", ".m-logbox", ".m-cutin"]) {
    const el = scr.querySelector(`:scope > ${sel}`);
    assert.ok(el, `HUD ${sel} (화면 바로 아래)`);
    assert.ok(!fieldEl.contains(el), `${sel} 는 규칙 영역 밖`);
  }
  assert.ok(scr.querySelector(".m-banner > .m-banner-txt").textContent.length > 0, "배너 글자 (헤더 왼쪽 칸)");
  assert.deepEqual([...scr.querySelector(".m-dock").children].map((el) => el.className.split(" ")[0]), ["m-info", "action-grid"], "아래 가운데: 정보 줄 → 결정 카드 한 줄");
  assert.ok(scr.querySelector(".m-ctl > .match-controls") && scr.querySelector(".m-ctl > .m-remain"), "왼쪽 아래: 컨트롤 + 남은 수비");
  const ctlNames = [...scr.querySelectorAll(".match-controls > button")].map((b) => b.className.split(" ").find((c) => /-btn$/.test(c)));
  assert.deepEqual(ctlNames, ["auto-btn", "iv-btn", "speed-btn", "skip-btn", "log-btn"], "컨트롤: 자동 · 개입 · 배속 · ⏭ · 로그");
  assert.ok(scr.querySelector(".iv-btn").classList.contains("off"), "자동 OFF 면 개입은 숨김");
  assert.ok(!scr.querySelector(".m-logbox").classList.contains("open"), "로그 서랍은 기본 닫힘");
  assert.equal(scr.querySelector(".log-btn").getAttribute("aria-expanded"), "false");
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
  // 결정 대기(수동): 공격 카드 = 켜진 액션만 한 줄, 제목 "액션 N%", 성공/실패 한 줄씩 (엔진 Outcome.short), 추천 1개
  const enabledActs = [...scr.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
  assert.equal(enabledActs.length, mv.actions.filter((a) => a.enabled).length, "켜진 액션만 버튼");
  assert.ok(enabledActs.length >= 2, "고를 수 있는 액션");
  const grid0 = scr.querySelector(".action-grid");
  assert.ok(grid0.classList.contains("k-atk") && grid0.classList.contains(`n-${enabledActs.length}`) && grid0.classList.contains("deciding"), `공격 카드 한 줄: ${grid0.className}`);
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
  // 연출 중 배속 버튼(하나가 1x → 2x → 4x → 1x 로 돈다): 스코어·로그는 연출 단계가 갱신한다 (판정 전 view 로 되돌리거나 결과를 먼저 보여주지 않음)
  const logBefore = scr.querySelector(".match-log").textContent;
  const scoreBefore = scr.querySelector(".mh-score").textContent;
  const spBtn = () => scr.querySelector(".match-controls .speed-btn");
  assert.equal(spBtn().textContent, "4x");
  const cycle = [];
  for (let i = 0; i < 3; i++) { spBtn().click(); cycle.push([spBtn().textContent, ui.speed]); }
  assert.deepEqual(cycle, [["1x", 1], ["2x", 2], ["4x", 4]], "배속 버튼 순환 4x → 1x → 2x → 4x");
  assert.equal(scr.querySelectorAll(".match-controls .speed-btn").length, 1, "배속 버튼은 하나");
  assert.equal(ui.busy, true);
  assert.equal(scr.querySelector(".match-log").textContent, logBefore, "연출 중 컨트롤 클릭: 로그 그대로");
  assert.equal(scr.querySelector(".mh-score").textContent, scoreBefore, "연출 중 컨트롤 클릭: 스코어 그대로");
  // 로그 서랍: 로그 버튼으로 열고(연출 중에도) ✕ 로 닫는다 — 열림 상태는 ui.logOpen
  scr.querySelector(".log-btn").click();
  assert.ok(scr.querySelector(".m-logbox").classList.contains("open") && ui.logOpen === true, "로그 열림");
  assert.equal(scr.querySelector(".log-btn").getAttribute("aria-expanded"), "true");
  assert.ok(scr.querySelector(".log-btn").classList.contains("active"));
  assert.equal(scr.querySelector(".match-log").textContent, logBefore, "로그를 열어도 연출 전 내용 (연출 단계가 갱신)");
  assert.ok(await until(() => !ui.busy, 5000), "연출 끝");
  assert.ok(scr.querySelectorAll(".match-log .log-line").length > 1 && scr.querySelector(".match-log").textContent !== logBefore, "연출 뒤 로그 갱신");
  scr.querySelector(".m-logbox-close").click();
  assert.ok(!scr.querySelector(".m-logbox").classList.contains("open") && ui.logOpen === false, "✕ = 로그 닫힘");
  assert.equal(scr.querySelector(".log-btn").getAttribute("aria-expanded"), "false");
  // 자동 켜고 개입 → 자동 끄기: 개입 대기도 해제 (끈 뒤 '직접 선택 중'/'개입 대기…' 로 남지 않음)
  const ctlBtn = (re) => [...scr.querySelectorAll(".match-controls button")].find((b) => re.test(b.textContent));
  ctlBtn(/^자동 OFF$/).click();
  assert.ok(!ctlBtn(/^개입$/).classList.contains("off") && !ctlBtn(/^개입$/).disabled, "자동 ON → 개입 보임");
  ctlBtn(/^개입$/).click();
  assert.equal(ui.intervene, true, "개입 켜짐");
  ctlBtn(/^자동 ON$/).click();
  assert.equal(ui.auto, false);
  assert.equal(ui.intervene, false, "자동 OFF → 개입 해제");
  const iv = ctlBtn(/개입/);
  assert.equal(iv.textContent, "개입");
  assert.ok(iv.disabled && !iv.classList.contains("active") && iv.classList.contains("off"), "개입 버튼: 비활성 · 강조 없음 · 숨김");
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
  // 경기가 끝나면 개입은 자동 ON 이어도 숨김 (.off — 자리만)
  ui.auto = true;
  scr.querySelector(".log-btn").click(); // 컨트롤 다시 그리기 (+ 로그 서랍 열기: 다음 경기는 닫힌 채 시작해야 한다)
  assert.ok(ui.logOpen && scr.querySelector(".iv-btn").classList.contains("off"), "경기 종료: 개입 숨김");
  okBtn.click();
  okBtn.click();
  assert.equal(finishCalls, 1, "finishMatch 정확히 1회");
  assert.notEqual(S.store.run.phase, "match", "경기 후 다음 단계");
  assert.equal(S.store.match, null);
  assert.equal(ui.logOpen, false, "경기가 끝나면 로그 서랍 닫힘 (다음 경기는 닫힌 채)");
  assert.equal(doc.getElementById("stage").dataset.mode, "og", "경기 뒤 아웃게임 표시");
  ui.auto = false;
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

  // [회귀 v0.1] 상대 ④ 슈팅: DOM 에서도 우리 필드 6명 전원이 공 뒤(가로 화면: 공 오른쪽 — 상대는 왼쪽 우리 골로 공격), 우리 GK 만 공 왼쪽(골문 앞)
  {
    const { scr: scr2 } = inject("03_away_shot", { auto: true });
    assert.ok(scr2, "경기 화면 (주입 상태)");
    const pxOf = (el) => Number(/translate\(\s*([-\d.]+)px,\s*[-\d.]+px\)/.exec(el.style.transform)?.[1]);
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
      assert.ok(pxOf(el) > pxOf(awayCarrier), "화면에서도 공보다 오른쪽 (공 뒤)");
    }
    assert.ok(keeper && Number(keeper.dataset.y) < ballY && pxOf(keeper) < pxOf(awayCarrier), "우리 GK 만 공 왼쪽 (골문 앞)");
    assert.ok(scr2.querySelector(".zone.z1.hl-crisis"), "우리 박스 빨강(슈팅 위기)");
    assert.match(scr2.querySelector(".m-banner .m-banner-txt").textContent, /슈팅 위기/);
    assert.ok(scr2.querySelector(".m-banner").classList.contains("lv-crisis"), "배너 띠 = 위기 색");
    // GK 듀얼: 넓은 상태 카드 1장 (세이브 자동)
    assert.ok(scr2.querySelector(".action-grid").classList.contains("k-wide"), "GK 세이브 = 넓은 카드");
    assert.match(scr2.querySelector(".action-grid").textContent, /세이브/);
    assert.equal(scr2.querySelectorAll(".m-track .trk.on.away").length, 4, "트랙: 상대 ④ 까지");
    assert.match(scr2.querySelector(".m-remain").title, /남은 수비: GK/);
    assert.equal(scr2.querySelector(".m-remain").textContent, "남은 수비: GK");
    assert.ok(!scr2.querySelector(".m-logbox").classList.contains("side-l"), "로그 서랍 = 공 반대쪽 (공이 우리 박스 → 오른쪽)");
    S.actions.resetToStart();
  }

  // 08 크로스: 울릭(크로서) ③ — 공격 카드 4장 한 줄, 크로스 후보(FW + 피지컬 최고 MF) 전원 박스, 크로스 화살표 = 포물선
  {
    const { scr: s8, view: v8 } = inject("08_cross_decision");
    const btns = [...s8.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
    assert.deepEqual(btns.map((b) => b.dataset.action).sort(), v8.actions.filter((a) => a.enabled).map((a) => a.action).sort());
    assert.ok(btns.some((b) => b.dataset.action === "cross"), "크로스 버튼");
    assert.ok(s8.querySelector(".action-grid").classList.contains("k-atk") && s8.querySelector(".action-grid").classList.contains(`n-${btns.length}`), "공격 카드 한 줄");
    assert.equal(btns.length, 4, "드리블 · 패스 · 크로스 · 중거리 슛");
    assert.deepEqual(btns.map((b) => b.dataset.action), ["dribble", "pass", "cross", "shoot"], "카드 순서");
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
    assert.ok(s11.querySelector(".action-grid").classList.contains("k-def") && s11.querySelector(".action-grid").classList.contains("n-3"), "수비 = 카드 3장 한 줄");
    for (const b of btns) assert.ok(b.querySelector(".act-foot .act-formula"), `${b.dataset.action}: 판정 스탯 줄`);
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

  // 17 스킬 묶음 7개 이상: 2열(.many) + 상자 안 스크롤(.over) — 묶음이 필드 위로 자라지 않는다. 일반 액티브 ✦ 비용은 2열에서도 보인다
  {
    const { scr: s17 } = inject("17_skill_row_many");
    const row = s17.querySelector(".skill-row");
    const n = row.querySelectorAll("button").length;
    assert.ok(n >= 7 && row.classList.contains("many") && row.classList.contains("over"), `스킬 ${n}개: ${row.className}`);
    const lb = row.querySelector('[data-skill="sk_line_breaker"]');
    assert.ok(lb, "라인 브레이커 버튼");
    assert.match(lb.querySelector(".sk-nm").textContent, /라인 브레이커/);
    assert.match(lb.querySelector(".sk-cost").textContent, /^✦\d+$/, "2열에서도 텐션 비용");
    S.actions.resetToStart();
    const { scr: s16 } = inject("16_skill_row_4");
    const row16 = s16.querySelector(".skill-row");
    assert.ok(row16.classList.contains("many") && !row16.classList.contains("over"), `4개 = 2열, 스크롤 없음: ${row16.className}`);
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

  // 가로 전용: 옛 세로 저장값(soccer.orient) · ?orient=port · matchUi.orient 는 무시한다 — home 골 왼쪽 · away 골 오른쪽 (필드 y → 화면 x, 필드 x → 화면 y).
  // 받는 선수 탭 · 크로스 포물선 · 결정 { action, receiverId } 는 그대로. 창 크기가 바뀌어도(연출 중이어도) 경기 화면을 다시 그리지 않는다.
  {
    window.localStorage.setItem("soccer.orient", "port");
    ui.orient = "port";
    window.history.replaceState(null, "", "?orient=port&auto=1");
    try {
      const { scr: sL, view: vL } = inject("08_cross_decision");
      const app = doc.getElementById("app");
      assert.ok(!sL.classList.contains("land") && sL.dataset.orient === undefined, "방향 클래스·표시 없음 (가로 하나)");
      assert.equal(sL.querySelector(".orient-btn, [data-orient]"), null, "⇄ 버튼 없음");
      assert.ok(!app.classList.contains("match-land"), "넓은 프레임 클래스 없음 (스테이지)");
      const pos = (el) => {
        const m = /translate\(\s*([-\d.]+)px,\s*([-\d.]+)px\)/.exec(el?.style.transform || "");
        return m ? [Number(m[1]), Number(m[2])] : null;
      };
      const gkId = (side) => S.store.match[side].players.find((p) => p.position === "GK").id;
      const hg = pos(sL.querySelector(`.tok[data-side="home"][data-id="${gkId("home")}"]`));
      const ag = pos(sL.querySelector(`.tok[data-side="away"][data-id="${gkId("away")}"]`));
      assert.ok(hg && ag && hg[0] < ag[0], `?orient=port · 저장값 port 여도 가로: home GK ${hg} 는 away GK ${ag} 왼쪽`);
      const toks = [...sL.querySelectorAll(".tok:not(.gone)")].map((el) => ({ fx: Number(el.dataset.x), fy: Number(el.dataset.y), p: pos(el) }));
      assert.equal(toks.length, 14);
      for (const a of toks) {
        for (const b of toks) {
          if (b.fy - a.fy > 0.5) assert.ok(a.p[0] < b.p[0], `필드 y 가 클수록 오른쪽 (${a.fy} → ${b.fy})`);
          if (b.fx - a.fx > 0.5) assert.ok(a.p[1] < b.p[1], `필드 x 가 클수록 아래 (${a.fx} → ${b.fx})`);
        }
      }
      // 규칙 영역 기본 크기(레이아웃이 없는 jsdom = 스테이지 기준 1244×528) 안에 전원, 토큰 44px
      for (const t of toks) assert.ok(t.p[0] >= 0 && t.p[0] <= 1244 && t.p[1] >= 0 && t.p[1] <= 528, `규칙 영역 안 ${t.p}`);
      assert.equal(sL.querySelector(".m-field").style.getPropertyValue("--tok"), "44px", "토큰 44px");
      const carrier = sL.querySelector(`.tok[data-side="home"][data-id="${vL.carrier.id}"]`);
      assert.ok(pos(sL.querySelector(".m-ball"))[0] > pos(carrier)[0], "공은 공격 방향(오른쪽) 앞");
      assert.equal(sL.querySelector(".zone.z1").style.left, "0%", "구역 = 세로 줄 (우리 박스 왼쪽)");
      assert.equal(sL.querySelector(".zone.z5").style.width, "16%");
      // 트랙 칸 = 구역 폭 (home ③ = Z4 60~84%)
      assert.equal(sL.querySelector('.m-track .trk[data-step="2"]').style.left, "calc(60% + 2px)");
      const cb = sL.querySelector('button[data-action="cross"]');
      cb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
      assert.ok(sL.querySelector(".g-arrow path.ar-cross"), "크로스 포물선 화살표");
      cb.dispatchEvent(new window.Event("pointerleave"));
      // 기본이 아닌 크로스 후보 탭 → 결정 { action: "cross", receiverId }
      const other = vL.receivers.cross.candidates.find((id) => id !== vL.receivers.cross.defaultId);
      sL.querySelector(`.tok[data-side="home"][data-id="${other}"]`).click();
      assert.equal(sL.querySelector('button[data-action="cross"]').dataset.receiver, other, "받는 선수 탭");
      const e0 = S.store.match.events.length;
      sL.querySelector('button[data-action="cross"]').click();
      assert.deepEqual(ui.lastDecision, { action: "cross", receiverId: other }, "결정 객체 (예전과 같은 모양)");
      assert.ok(S.store.match.events.length > e0, "클릭 즉시 판정");
      assert.equal(ui.busy, true, "비트 연출 중");
      // 연출 중 창 크기 변경: 스테이지 배율만 바뀌고 경기 화면은 그대로 (다시 그리지 않음), 연출은 끝까지
      window.innerWidth = 900;
      window.innerHeight = 1200;
      window.dispatchEvent(new window.Event("resize"));
      assert.equal(doc.querySelector(".match-screen"), sL, "연출 중 resize: 같은 화면");
      assert.ok(await until(() => !ui.busy, 5000), "연출 끝");
      assert.equal(doc.querySelector(".match-screen"), sL, "resize 뒤에도 같은 화면");
    } finally {
      delete ui.orient;
      window.history.replaceState(null, "", "/soccer/");
      window.innerWidth = 1024;
      window.innerHeight = 768;
      window.dispatchEvent(new window.Event("resize"));
    }
    S.actions.resetToStart();
  }

  // 고정 스테이지 (1280×720, js/ui/stage.js): 앱 · 오버레이 루트가 스테이지 안, 창에 맞춘 배율 변수, 미니 카드 모달 · 로그 서랍도 스테이지 안
  {
    const stageEl = doc.getElementById("stage");
    for (const id of ["app", "modal-root", "toast-root", "banner-root"]) assert.ok(stageEl?.contains(doc.getElementById(id)), `#${id} 는 #stage 안`);
    window.innerWidth = 1600;
    window.innerHeight = 1000;
    try {
      window.dispatchEvent(new window.Event("resize"));
      const css = doc.documentElement.style;
      assert.equal(css.getPropertyValue("--stage-scale"), "1.25", "1600×1000 → 1.25배 (폭에 맞춤)");
      assert.equal(css.getPropertyValue("--stage-x"), "0px");
      assert.equal(css.getPropertyValue("--stage-y"), "50px", "위아래 레터박스 50px");
      assert.deepEqual({ scale: S.stage.scale, portrait: S.stage.portrait }, { scale: 1.25, portrait: false }, "window.__soccer.stage");
      assert.ok(!doc.documentElement.classList.contains("stage-portrait"));
      const { scr: sS, view: vS } = inject("08_cross_decision");
      sS.querySelector(`.tok[data-side="away"][data-id="${vS.expected.defense.playerId}"]`).click();
      assert.ok(stageEl.contains(doc.querySelector("#modal-root .mini-card")), "미니 카드 모달은 스테이지 안");
      [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "닫기").click();
      // 로그 서랍 열림은 경기 화면을 다시 그려도 유지 (ui.logOpen). 자리 = 공 · 공격 방향 반대쪽 (우리 공격 ③ → 왼쪽)
      sS.querySelector(".log-btn").click();
      assert.ok(stageEl.contains(sS.querySelector(".m-logbox.open")), "로그 서랍 = 스테이지 안");
      assert.ok(sS.querySelector(".m-logbox").classList.contains("side-l"), "우리 공격 ③: 로그 서랍은 왼쪽 (받는 선수 후보 · 크로스를 가리지 않게)");
      S.render();
      const sR = doc.querySelector(".match-screen");
      assert.ok(sR !== sS && sR.querySelector(".m-logbox").classList.contains("open"), "다시 그려도 로그 서랍 열림 유지");
      sR.querySelector(".log-btn").click();
      assert.ok(!sR.querySelector(".m-logbox").classList.contains("open"), "로그 버튼 = 토글 (닫힘)");
      // 세로 창: 안내 표시 (스테이지는 그대로)
      window.innerWidth = 900;
      window.innerHeight = 1200;
      window.dispatchEvent(new window.Event("resize"));
      assert.ok(doc.documentElement.classList.contains("stage-portrait"), "세로 창 → 가로로 돌려 달라는 안내");
      assert.equal(doc.querySelector(".match-screen"), sR, "창 크기가 바뀌어도 경기 화면을 다시 그리지 않는다 (논리 크기 그대로)");
    } finally {
      window.innerWidth = 1024;
      window.innerHeight = 768;
      window.dispatchEvent(new window.Event("resize"));
    }
    S.actions.resetToStart();
  }

  assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, "에러 토스트 없음");
  assert.deepEqual(errors, []);
});
