// test/ui.smoke.test.mjs — index.html 을 jsdom 으로 올리고 js/ui/app.js 가 start → setup → run 화면을 그리는지 확인
// 카드 레슨 시험판 (LESSON_PROTO_PLAN §9.2): 시작 → 편성(훈련 방침) → 기본 편성 → 주 선택(week) → 레슨 1장 → (감독 AI 로 자유 주까지) 친선전 경기.
// 저장 키는 js/ui/store.js KEYS ('soccer-lesson.' 앞머리) — 본편 키('soccer.')는 읽지 않는다.
// jsdom 이 없으면(devDependency 미설치) 건너뛴다. fetch 는 fs 읽기로 폴리필한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dataFetch } from "./helpers.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { KEYS, STORAGE_PREFIX } = await import(pathToFileURL(path.join(ROOT, "js/ui/store.js")).href);

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
  g.fetch = dataFetch(ROOT); // data/lesson.json 은 이벤트 기능 스위치를 끈 사본 (§24.15 — 켜려면 dataFetch(ROOT, { events: true }))
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
  window.localStorage.setItem(`${STORAGE_PREFIX}orient`, "port");
  // 같은 origin 의 본편 저장(앞머리 'soccer.')은 레슨판이 읽지 않는다 — jsdom 저장소에만 흉내 낸다
  const MAIN_RUN = JSON.stringify({ seed: "main-game", phase: "turn", season: 2, turn: 3 });
  window.localStorage.setItem("soccer.run", MAIN_RUN);
  window.localStorage.setItem("soccer.teams", JSON.stringify([{ name: "본편 팀", grade: "A", formation: "2-2-2", seed: "m" }]));
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
  // 시험판 표시 · 흐름 · 저장 분리
  assert.equal(KEYS.run, "soccer-lesson.run", "런 저장 키");
  for (const k of Object.values(KEYS)) assert.ok(k.startsWith("soccer-lesson.") && !k.startsWith("soccer."), `키 앞머리: ${k}`);
  assert.equal(doc.title, "경계전 클럽 — 카드 레슨 시험판");
  assert.match(doc.querySelector(".hero-badge")?.textContent ?? "", /카드 레슨 시험판 — 본편과 저장이 따로입니다/, "시작 화면 배지");
  assert.match(startBtn.textContent, /3시즌 · 15주 · 레슨 최대 9회 · 경계전 3회/, "흐름 문구");
  assert.ok(![...doc.querySelectorAll(".start-menu button")].some((b) => !b.classList.contains("challenge-btn") && b.textContent.includes("이어하기")), "본편 런 저장 → 이어하기 없음");
  assert.equal(doc.querySelectorAll(".start-teams .team-row").length, 0, "본편 등록 팀은 보이지 않는다");

  // setup 화면
  startBtn.click();
  await until(() => window.__soccer.store.screen === "setup");
  const slotCards = doc.querySelectorAll(".slot-card");
  assert.equal(slotCards.length, 7, "2-2-2 슬롯 카드 7개");
  assert.equal(doc.querySelectorAll(".support-card.selected").length, 6, "기본 코치 6명 선택됨");
  // 훈련 방침: 버튼 5개 (기본 팀형) → 에이스형으로
  const polBtns = [...doc.querySelectorAll(".setup-policy .policy-row button")];
  assert.equal(polBtns.length, 5, "방침 버튼 5개");
  assert.deepEqual(polBtns.map((b) => b.dataset.policy), ["ace", "team", "counter", "press", "poss"]);
  assert.equal(doc.querySelector(".policy-btn.active")?.dataset.policy, "team", "기본 방침 = 팀형");
  assert.equal(window.__soccer.store.setup.policy, "team");
  doc.querySelector('.policy-btn[data-policy="ace"]').click();
  assert.equal(window.__soccer.store.setup.policy, "ace", "방침 고르기");
  assert.equal(doc.querySelector(".policy-btn.active")?.dataset.policy, "ace");
  assert.match(doc.querySelector(".policy-desc").textContent, /호조 · 집중/, "방침 설명 한 줄");
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

  // 기본 편성으로 시작 (고른 방침은 그대로) → 레슨 런 · 주 선택 화면
  const defaultBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent.includes("기본 편성으로 시작"));
  defaultBtn.click();
  await until(() => window.__soccer.store.screen === "run" && window.__soccer.store.run);
  const run = window.__soccer.store.run;
  assert.equal(run.kind, "lessonRun", "레슨 런 (lessonRun.createRun)");
  assert.equal(run.seed, "ui-smoke");
  assert.equal(run.policy, "ace", "방침 전달");
  assert.equal(run.phase, "week", "1주 = 주 선택");
  assert.ok(doc.querySelector(".screen.og.week-screen"), "주 선택 화면");
  assert.ok(doc.querySelector(".week-screen .topbar") && doc.querySelector(".week-screen .roster"), "상단 바 · 선수 패널 (hud.js)");
  const wv = window.__soccer.run.getWeekView(run, window.__soccer.store.data);
  assert.ok(wv.nextMatch.styleHint && doc.querySelector(".next-match").textContent.includes(wv.nextMatch.styleHint), "다음 경기 정보에 상대 성향(styleHint)");
  assert.ok(!doc.querySelector(".next-match").textContent.includes("의도"), "의도 공개 표시 제거");
  assert.equal(doc.querySelectorAll(".topbar .turn-pips i").length, 5, "주 점 5");
  assert.ok(doc.querySelector(".topbar .turn-pips .pip-match"), "주 점 끝 ⚔");
  assert.deepEqual([...doc.querySelectorAll(".topbar .status-chip")].map((e) => e.textContent.trim().split(" ")[0]), ["컨디션", "팀워크", "SP", "TP"], "상태 칩 4 (호출권 없음)");
  assert.ok(!doc.querySelector(".topbar").textContent.includes("호출권"));
  assert.equal(doc.querySelectorAll(".roster .ro-row").length, 7, "선수 7");
  assert.equal(doc.querySelectorAll(".roster .bond-row").length, 6, "코치 유대 6");
  const lessonBtns = [...doc.querySelectorAll(".week-lesson")];
  assert.equal(lessonBtns.length, 5, "레슨 종목 5");
  const recLesson = lessonBtns.find((b) => b.classList.contains("recommended"));
  assert.ok(recLesson && recLesson.textContent.includes("추천"), "추천 배지 (manager.recommendWeek)");
  assert.equal(recLesson.dataset.zone, window.__soccer.manager.recommendWeek(run, window.__soccer.store.data).zone);
  // 저장 확인: 레슨판 키에만, 본편 저장은 그대로
  const savedRun = JSON.parse(window.localStorage.getItem(KEYS.run));
  assert.equal(savedRun.seed, "ui-smoke");
  assert.equal(savedRun.kind, "lessonRun");
  assert.equal(window.localStorage.getItem("soccer.run"), MAIN_RUN, "본편 런 저장은 건드리지 않는다");

  // 레슨 시작 → 레슨 화면(카드 배틀): 추천 카드를 고르고 → (대상이 필요하면 추천 대상 토큰) → [내기] → seq 1 · 저장
  recLesson.click();
  await until(() => window.__soccer.store.run.phase === "lesson" && doc.querySelector(".lesson-screen"));
  assert.equal(doc.getElementById("stage").dataset.mode, "lesson", "레슨 화면 표시 → 토스트는 손패 위 (css/lesson.css)");
  assert.equal(window.__soccer.store.run.lesson.seq, 0);
  assert.equal(doc.querySelectorAll(".lesson-screen .ls-hand .card-face").length, 3, "손패 3장");
  assert.equal(doc.querySelectorAll(".lesson-screen .tok").length, 7, "경기장 토큰 7");
  const recCard = window.__soccer.manager.recommendCard(window.__soccer.store.run, window.__soccer.store.data);
  assert.equal(doc.querySelectorAll(".lesson-screen .zone-pad").length, 5, "구역 바닥 5");
  assert.ok(doc.querySelector(".lesson-screen .ls-bench"), "벤치 칸");
  assert.equal(doc.querySelectorAll(".lesson-screen .ls-rest").length, 0, "[쉬기] 없음");
  if (recCard.kind === "play") {
    // 카드 클릭 = 조준 모드 → (자리가 필요한 카드) 키보드 → 첫 후보 → [내기]
    doc.querySelector(`.ls-hand .card-face[data-uid="${recCard.uid}"]`).click();
    if (recCard.at || recCard.playerId) doc.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    doc.querySelector(".ls-btns .ls-play").click();
  } else if (recCard.kind === "bench") {
    doc.querySelector(`.ls-row[data-pid="${recCard.playerId}"] .ls-bench-btn`).click();
  } else {
    doc.querySelector(".ls-btns .ls-end").click();
  }
  await until(() => window.__soccer.store.run.lesson?.seq === 1);
  assert.equal(window.__soccer.store.run.lesson.seq, 1, "레슨 호출 1번 = seq +1");
  assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).lesson.seq, 1, "레슨 호출마다 저장");
  // 이어하기: 레슨 런 저장본만 (kind 가 다른 저장본은 거절)
  window.__soccer.actions.resetToStart();
  const contBtn = [...doc.querySelectorAll(".start-menu button")].find((b) => !b.classList.contains("challenge-btn") && b.textContent.includes("이어하기"));
  assert.ok(contBtn && /시즌 1 · 1\/5주 · 레슨/.test(contBtn.textContent), `이어하기 줄: ${contBtn?.textContent}`);
  contBtn.click();
  assert.equal(window.__soccer.store.run.phase, "lesson", "이어하기 → 레슨");
  assert.ok(doc.querySelector(".lesson-screen"));
  {
    // 저장 v1 (§14.15): 주 phase v1 → v2 로 올려 이어하기, 레슨 중 v1 → "저장 없음" + 토스트
    const S0 = window.__soccer;
    const cur = JSON.parse(JSON.stringify(S0.store.run));
    const weekV1 = S0.run.createRun({ data: S0.store.data, seed: "v1-save" });
    weekV1.version = 1;
    weekV1.record.lessons = [{ turnIndex: 0, stat: "pass", special: false, prep: false, score: 300, target: 300, cap: 400, result: "clear", turns: 6, plays: 5, rests: 1, fails: 0, injuries: 0 }];
    const contOf = () => [...doc.querySelectorAll(".start-menu button")].find((b) => !b.classList.contains("challenge-btn") && b.textContent.includes("이어하기"));
    S0.actions.resetToStart();
    window.localStorage.setItem(KEYS.run, JSON.stringify(weekV1));
    S0.render();
    contOf().click();
    assert.equal(S0.store.run.version, 5, "v1 (주) → v5 (§18.7 · §19.13 · §24.10)");
    assert.equal(S0.store.run.record.lessons[0].zone, "pass");
    assert.equal(S0.store.run.record.lessons[0].benches, 1);
    assert.ok(doc.querySelector(".week-screen"), "이어하기 → 주 화면");
    S0.actions.resetToStart();
    window.localStorage.setItem(KEYS.run, JSON.stringify({ ...cur, version: 1 }));
    S0.render();
    contOf().click();
    assert.equal(S0.store.screen, "start", "레슨 중 v1 은 이어 하지 않는다");
    assert.equal(window.localStorage.getItem(KEYS.run), null, "저장 없음");
    assert.ok(!contOf(), "이어하기 버튼 없음");
    assert.ok([...doc.querySelectorAll("#toast-root .toast")].some((t) => t.textContent.includes("구역 방식으로 바뀌어 진행 중인 레슨은 이어 할 수 없습니다")), "토스트");
    // 원래 런으로 돌아간다
    window.localStorage.setItem(KEYS.run, JSON.stringify(cur));
    S0.render();
    contOf().click();
    assert.equal(S0.store.run.phase, "lesson");
  }

  // ---- 경기 화면 (§12.3 + v0.3 §13.6): 친선전 한 판 — 수동 결정(받는 선수 선택) → 연출 → 스킵 → 결과 → finishMatch 1회 ----
  const S = window.__soccer;
  const ui = S.store.matchUi;
  ui.auto = false;
  ui.speed = 4;
  let finishCalls = 0;
  const origFinish = S.actions.finishMatch;
  S.actions.finishMatch = (r) => { finishCalls++; return origFinish(r); };
  // 친선전이 열린 자유 주까지 감독 AI 로 걷는다 (경기는 실제 match.js 자동 진행)
  const playMatch = (setup) => {
    const ms0 = S.match.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
    S.match.simulateAuto(ms0, S.store.data);
    return S.match.getResult(ms0);
  };
  const friendlyOpen = (st) => st.phase === "week" && st.weekOffer?.kind === "free" && st.weekOffer.actions.includes("friendly");
  for (let i = 0; i < 3000 && !friendlyOpen(S.store.run) && S.store.run.phase !== "finished"; i++) S.manager.autoStep(S.store.run, S.store.data, { playMatch });
  assert.ok(friendlyOpen(S.store.run), "친선전이 열린 자유 주");
  S.render();
  assert.ok(doc.querySelector('.week-screen .week-act[data-act="friendly"]'), "자유 주 친선전 버튼");
  S.actions.weekAction({ type: "friendly" });
  const scr = await until(() => S.store.run.phase === "match" && doc.querySelector(".match-screen"));
  assert.ok(scr, "경기 화면");
  assert.equal(doc.getElementById("stage").dataset.mode, "match", "경기 화면 표시 → 토스트는 오른쪽 위 (css/match.css)");
  assert.equal(S.store.match.version, 3, "경기 상태 v3");
  assert.equal(scr.querySelectorAll(".tok").length, 14, "토큰 14개");
  assert.equal(scr.querySelectorAll(".pitch .zone").length, 5, "5구역 밴드");
  assert.equal(scr.querySelectorAll(".m-track .trk").length, 4, "공격 진행 트랙 4칸");
  assert.equal(scr.querySelector(".m-exit"), null, "런 경기에는 [포기] 없음 (도전 모드 훅만)");
  assert.match(scr.querySelector(".mh-sub").textContent, /^친선전 · /, "헤더 줄 경기 종류 = KIND_LABELS (훅 없음)");
  // HUD 골격 (사용자 목업): 잔디(.pitch) 안 규칙 영역(.m-field) — 토큰·구역·공은 규칙 영역 안, HUD 는 잔디 위에 겹친다
  assert.equal(scr.dataset.orient, undefined, "방향 표시 없음 (가로 전용)");
  assert.ok(!scr.classList.contains("land") && !scr.querySelector(".pitch-row, .orient-btn, [data-orient]"), "세로/전환 흔적 없음");
  const fieldEl = scr.querySelector(".pitch > .m-field");
  assert.ok(fieldEl, "잔디 안 규칙 영역");
  assert.equal(fieldEl.querySelectorAll(".tok").length, 14, "토큰은 규칙 영역 안");
  assert.equal(fieldEl.querySelectorAll(".zone").length, 5, "구역도 같은 규칙 영역 (화면 위치 = 규칙 위치)");
  assert.ok(fieldEl.querySelector(".m-ball") && fieldEl.querySelector(".pitch-svg"), "공 · 화살표 층도 규칙 영역");
  // 얼굴 일러스트 (LESSON_PROTO_PLAN §24.12.3 · U2): 우리 토큰 = 스냅샷 charId 의 얼굴 그림 (글자는 남는다), 런 상대 (charId 없음) = 글자 칸만
  const PT = S.store.data.portraits;
  assert.ok(PT && PT.chars, "그림 목록 data.portraits");
  const artUrl = (cid, preset = "face") => `./img/portraits/${cid}.${preset}.webp?v=${PT.chars[cid].v}`;
  for (const p of S.store.match.home.players) {
    const face = fieldEl.querySelector(`.tok[data-side="home"][data-id="${p.id}"] .tok-face`);
    assert.equal(face.querySelector("img.pt")?.getAttribute("src"), artUrl(p.charId), `${p.name}: 토큰 얼굴 그림 = 스냅샷 charId`);
    assert.equal(face.querySelector("img.pt").getAttribute("draggable"), "false", `${p.name}: 그림 draggable false`);
    assert.equal(face.textContent, Array.from(p.name)[0], `${p.name}: 글자는 남는다`);
  }
  for (const p of S.store.match.away.players) {
    assert.ok(!p.charId, `런 상대 ${p.name}: 스냅샷에 charId 없음`);
    const face = fieldEl.querySelector(`.tok[data-side="away"][data-id="${p.id}"] .tok-face`);
    assert.ok(face && !face.querySelector("img") && !face.classList.contains("has-art"), `상대 ${p.name}: 그림 없음 (글자 칸)`);
  }
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
    assert.ok(!doc.querySelector("#modal-root .mini-card .avatar img"), "상대 미니 카드 얼굴 = 글자 (그림 없음)");
    [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "닫기").click();
    const ownTrait = mv.players.home.find((p) => p.id === picked).trait;
    scr.querySelector(`.tok[data-side="home"][data-id="${picked}"]`).dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const card = doc.querySelector("#modal-root .mini-card");
    assert.ok(card, "후보도 길게 누르기(우클릭) = 미니 카드");
    assert.equal(card.querySelector(".avatar.ring-home > img.pt")?.getAttribute("src"), artUrl(S.store.match.home.players.find((p) => p.id === picked).charId), "우리 미니 카드 얼굴 그림");
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

  // 08 크로스: 울리카(크로서) ③ — 공격 카드 4장 한 줄, 크로스 후보(FW + 피지컬 최고 MF) 전원 박스, 크로스 화살표 = 포물선
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

  // 09 합체기: 바람의 실을 받은 그레타 — 스킬 줄 '바람의 유성' 토글 → 슛만 가능 → 결정 { action, ultimate: true } → 컷인 2연속 + 이름
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
    const comboEv = fresh.find((e) => e.type === "combo");
    const cidOf9 = (id) => S.store.match.home.players.find((p) => p.id === id).charId;
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut"), 1500), "전체 화면 컷인");
    // 컷인 일러스트 (§24.12.4 · U2): 합체기 두 장 = SSR 판 → 반신 그림 (우리 팀), 글자는 DOM 에 남는다 · 이름 카드 = 두 선수 흉상 양쪽
    const c9 = s9.querySelector(".m-cutin.show .cut");
    assert.ok(c9.classList.contains("part-1"), "첫 장 = 패스한 선수");
    assert.ok(c9.querySelector(".cut-face").classList.contains("has-art") && c9.querySelector(".cut-face").classList.contains("art-half"), "SSR 컷인 = 반신 칸");
    assert.equal(c9.querySelector(".cut-face > img.cut-art")?.getAttribute("src"), artUrl(cidOf9(comboEv.playerIds[0]), "half"), "우리 SSR 컷인 = 패스한 선수 반신 그림");
    assert.equal(c9.querySelector(".cut-face").textContent, Array.from(S.store.match.home.players.find((p) => p.id === comboEv.playerIds[0]).name)[0], "컷인 글자는 남는다");
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut.part-2"), 2500), "합체기: 두 번째 컷인");
    assert.equal(s9.querySelector(".m-cutin.show .cut.part-2 .cut-face > img.cut-art")?.getAttribute("src"), artUrl(cidOf9(comboEv.playerIds[1]), "half"), "두 번째 컷인 = 받은 선수 반신");
    assert.ok(await until(() => s9.querySelector(".m-cutin.show .cut-name"), 2500), "합체기 이름");
    assert.match(s9.querySelector(".m-cutin .cut-name").textContent, /바람의 유성/);
    assert.deepEqual([...s9.querySelectorAll(".m-cutin .cut-name .cut-duo > img.cut-art")].map((i) => i.getAttribute("src")),
      comboEv.playerIds.map((id) => artUrl(cidOf9(id), "bust")), "이름 카드 = 패스한 선수 · 받은 선수 흉상 양쪽");
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
    // 짝 표 (2026-09-29): 크로스 ↔ 버티기 — 짝 칩은 엔진 view.counter, labels.js 사본도 엔진과 같다
    const Lb = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);
    assert.deepEqual(v11.counter, { dribble: "tackle", pass: "intercept", cross: "hold", shoot: "hold" }, "view.counter = 새 짝 표");
    assert.deepEqual(Lb.COUNTER, S.match.COUNTER, "labels.js COUNTER = 엔진 COUNTER");
    const pairAct = v11.counter[v11.expected.attack.action];
    assert.ok(s11.querySelector(`button[data-action="${pairAct}"] .chip-pair`), "짝 표시");
    assert.equal(s11.querySelectorAll(".chip-pair").length, 1, "짝 칩은 한 버튼");
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

  // 18 ④ 박스 연결 (2026-09-29): 슛 + "컷백 → ○○" + "센터링 → ○○"(크로서 울리카) 카드, % = 득점 기대 (엔진 expectedPct), 성공·실패 = 엔진 outcome,
  // 후보는 박스 안 (탭 = 받는 선수), 미리보기 = 박스 안 연결 + GK 가 튀어나오는 길, 결정 { action, receiverId } → 박스 연결 판정
  {
    const { scr: s18, view: v18 } = inject("18_box_link_decision");
    assert.equal(v18.lineIndex, 3, "④ 슈팅 찬스");
    const nm = (id) => v18.players.home.find((p) => p.id === id)?.name;
    const btns = [...s18.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
    assert.deepEqual(btns.map((b) => b.dataset.action), v18.actions.filter((a) => a.enabled).map((a) => a.action), "켜진 액션만 (엔진 순서)");
    assert.deepEqual(btns.map((b) => b.dataset.action), ["pass", "cross", "shoot"], "컷백 · 센터링 · 슛");
    assert.ok(!s18.querySelector('button[data-action="dribble"]'), "④ 드리블 카드 없음 (꺼진 액션은 숨김)");
    assert.ok(s18.querySelector(".action-grid").classList.contains("n-3"), "카드 3장 한 줄");
    for (const [a, lbl, fin] of [["pass", "컷백", "원터치 슛"], ["cross", "센터링", "헤더"]]) {
      const b = s18.querySelector(`button[data-action="${a}"]`);
      const act = v18.actions.find((x) => x.action === a);
      assert.ok(b.classList.contains("box-link"), `${a}: 박스 연결 카드`);
      assert.equal(b.querySelector(".act-lbl").textContent, lbl, `${a}: "${lbl} → ○○"`);
      assert.equal(b.querySelector(".act-rname").textContent, nm(v18.receivers[a].defaultId), `${a}: 기본 받는 선수`);
      assert.ok(b.querySelector(".act-more"), `${a}: 후보 2명 이상 → ▾`);
      assert.equal(b.querySelector(".act-pct").textContent, `${act.expectedPct}%`, `${a}: 득점 기대 %`);
      assert.match(b.title, new RegExp(`% = 득점 기대 \\(연결 성공 × .+ ${fin} 골\\)`), `${a}: % 설명 (돌파 확률 아님)`);
      assert.ok(b.textContent.includes(v18.outcomes[a].success.short) && b.textContent.includes(v18.outcomes[a].fail.short), `${a}: 성공·실패 한 줄 = 엔진 outcome`);
      assert.ok(v18.outcomes[a].success.boxLink && b.title.includes(v18.outcomes[a].fail.label), `${a}: 실패 = GK 가 끊어냄`);
      assert.match(b.querySelector(".act-hint").textContent, /^GK와 경합 · 포제션당 1회$/, `${a}: 힌트 (막혔을 때 결과는 실패 줄)`);
      assert.equal(!!b.querySelector(".chip-rec"), !!act.recommended, `${a}: 추천 = 엔진 recommended`);
    }
    assert.match(s18.querySelector('button[data-action="shoot"]').title, /% = 골 확률/);
    assert.equal(s18.querySelectorAll(".chip-rec").length, 1, "추천 한 개");
    // 정보 줄: GK 와 1:1 + 연결도 GK 와 경합, 우리 예상 행동은 박스 이름 (패스·크로스 아님)
    assert.match(s18.querySelector(".m-info .expect").textContent, /GK .+1:1 — 세이브 · 컷백·센터링도 GK와 경합/);
    const mine = s18.querySelector(".m-info .mine").textContent;
    assert.match(mine, /^우리: (슛|컷백|센터링)/, `우리 예상 행동 ${mine}`);
    if (v18.expected.attack.action !== "shoot") assert.ok(mine.includes(`→ ${nm(v18.expected.attack.receiverId)}`), "자동 연결의 받는 선수");
    // ④ 자동 규칙 (2026-09-29 기대 골): 연결 성공 × 받은 선수 골 > 지금 슛 골일 때만 연결 — 추천(엔진 recommended) = 자동 선택 = 정보 줄 "우리: …"
    assert.match(s18.querySelector(".m-info .mine").title, /④ 자동 규칙 \(기대 골\): 연결 성공 × 받은 선수 골이 지금 슛 골보다 높을 때만 연결 — 슛 \d+%/);
    const recBtn18 = s18.querySelector(".act-btn .chip-rec")?.closest("button");
    assert.equal(recBtn18?.dataset.action, v18.expected.attack.action, "④ 추천 = 우리 자동 선택 (기대 골 규칙)");
    assert.ok(mine.startsWith(`우리: ${recBtn18.querySelector(".act-lbl").textContent}`), `정보 줄 우리 자동 = 추천 카드 (${mine})`);
    if (v18.expected.attack.action !== "shoot") assert.equal(recBtn18.dataset.receiver, v18.expected.attack.receiverId, "추천 카드 받는 선수 = 자동 연결 받는 선수");
    // 후보 전원 박스 안 (home 공격 → 필드 y ≥ 84), 탭할 수 있다
    const cands = [...new Set([...v18.receivers.pass.candidates, ...v18.receivers.cross.candidates])];
    for (const id of cands) {
      const el = s18.querySelector(`.tok[data-side="home"][data-id="${id}"]`);
      assert.equal(el.dataset.role, "receiver", `후보 ${id}`);
      assert.ok(Number(el.dataset.y) >= 84, `후보 ${id} 는 상대 박스 안 (y ${el.dataset.y})`);
      assert.ok(el.classList.contains("pickable"), `후보 ${id} 탭 가능`);
    }
    // 미리보기: 컷백 = 박스 안 점선 + GK 길, 끝 글자 "→ 원터치 슛" / 센터링 = 포물선 + "→ 헤더"
    const pb = s18.querySelector('button[data-action="pass"]');
    pb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s18.querySelector(".g-arrow line.ar-pass") && s18.querySelector(".g-arrow line.ar-gk"), "컷백 점선 + GK 가 튀어나오는 길");
    assert.equal(s18.querySelector(".g-tip text")?.textContent, "→ 원터치 슛");
    pb.dispatchEvent(new window.Event("pointerleave"));
    const cb = s18.querySelector('button[data-action="cross"]');
    cb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s18.querySelector(".g-arrow path.ar-cross") && s18.querySelector(".g-arrow line.ar-gk"), "센터링 포물선 + GK 길");
    assert.equal(s18.querySelector(".g-tip text")?.textContent, "→ 헤더");
    cb.dispatchEvent(new window.Event("pointerleave"));
    // 기본이 아닌 컷백 후보 탭 → 카드 받는 선수 · 받는 선수별 득점 기대 → 결정 { action: "pass", receiverId }
    const other = v18.receivers.pass.candidates.find((id) => id !== v18.receivers.pass.defaultId);
    s18.querySelector(`.tok[data-side="home"][data-id="${other}"]`).click();
    assert.equal(doc.querySelectorAll("#modal-root .mini-card").length, 0, "후보 탭 = 선택");
    const pb2 = s18.querySelector('button[data-action="pass"]');
    assert.equal(pb2.dataset.receiver, other, "탭한 후보 = 컷백 받는 선수");
    assert.equal(pb2.querySelector(".act-rname").textContent, nm(other));
    assert.equal(pb2.querySelector(".act-pct").textContent, `${v18.outcomesByReceiver.pass[other].expectedPct}%`, "받는 선수별 득점 기대");
    assert.ok(pb2.textContent.includes(v18.outcomesByReceiver.pass[other].success.short), "받는 선수별 성공 줄");
    assert.ok(s18.querySelector(`.tok[data-side="home"][data-id="${other}"]`).classList.contains("picked"), "고른 후보 표시");
    const e0 = S.store.match.events.length;
    pb2.click();
    assert.deepEqual(ui.lastDecision, { action: "pass", receiverId: other }, "결정 { action: pass, receiverId }");
    const ev = S.store.match.events.slice(e0).find((e) => e.boxLink);
    assert.ok(ev && ev.receiverId === other && ((ev.type === "duel" && ev.success) || ev.type === "save"), `박스 연결 판정 (${ev?.type})`);
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    const va = S.match.getMatchView(S.store.match, S.store.data, "home");
    if (ev.type === "duel") {
      assert.equal(va.carrier.id, other, "받은 선수가 공");
      assert.match(s18.querySelector(".m-banner-txt").textContent, new RegExp(`^★ 컷백! ${nm(other)} 원터치 슛 찬스`), "배너 = 받은 선수의 찬스");
    } else {
      // GK 가 잡음 → 상대 공 (세이브 이벤트의 다음 공격 측). 화면은 그 뒤 상대 배급 · 상대 포제션을 이어 갈 수 있어 지금 공격 측은 보지 않는다
      // (L40 으로 레슨 런 시드 1 의 스탯이 바뀌어 이 갈래가 처음 걸렸다 — 예전 기대는 연출이 끝난 뒤의 공격 측이라 맞지 않았다)
      assert.equal(ev.toAttackingSide, "away", "GK 가 잡음 → 상대 공");
      assert.ok(va.attackingSide === "away" || S.store.match.events.slice(e0).some((e) => e.attackingSide === "away"), "상대 포제션이 이어졌다");
    }
    S.actions.resetToStart();
  }

  // 19 ④ 컷백 성공 → 받은 선수가 GK 와 1:1: 연결은 포제션당 1회라 카드는 슛만, 연계 문구 "컷백!", 결과 한 줄
  {
    const { scr: s19, view: v19 } = inject("19_box_link_beat_mid");
    const e0 = S.store.match.events.length;
    s19.querySelector('button[data-action="pass"]').click();
    const ev = S.store.match.events.slice(e0).find((e) => e.type === "duel" && e.boxLink);
    assert.ok(ev && ev.success, "컷백 성공 이벤트");
    assert.ok(await until(() => s19.querySelector(".m-link")?.textContent.includes("컷백!"), 2000), "연계 문구 컷백!");
    assert.ok(await until(() => [...s19.querySelectorAll(".m-pop")].some((el) => el.textContent.includes("컷백 성공 · 원터치 슛 찬스")), 3000), "결과 한 줄");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    const va = S.match.getMatchView(S.store.match, S.store.data, "home");
    assert.ok(va.ballState.boxLinkUsed && va.carrier.id === ev.receiverId, "받은 선수가 공, 연결 사용");
    const btns = [...s19.querySelectorAll("button[data-action]")].filter((b) => !b.disabled);
    assert.deepEqual(btns.map((b) => b.dataset.action), ["shoot"], "연결 뒤에는 슛만");
    assert.match(btns[0].title, /원터치/, "원터치 슛");
    assert.equal(s19.querySelector(`.tok[data-side="home"][data-id="${ev.receiverId}"]`).dataset.role, "carrier");
    assert.equal(s19.querySelectorAll('.tok[data-role="receiver"]').length, 0, "받는 선수 후보 없음");
    assert.match(s19.querySelector(".m-banner-txt").textContent, /^★ 컷백! .+ 원터치 슛 찬스/);
    assert.doesNotMatch(s19.querySelector(".m-info .expect").textContent, /컷백|센터링/, "정보 줄: 연결 문구 없음");
    void v19;
    S.actions.resetToStart();
  }

  // 20 · 21 에이스의 외침 (2026-09-29, 표시 전용 view.aceCall): "줘!" 말풍선(금색) + 금색 점선 + 배지, 같은 받는 선수 미리보기면 점선 숨김,
  // 공이 움직이면(비트 연출) 걷힌다. 21 = 상대 공격 중 상대 받는 선수의 외침. 12(자동) = 정보 줄 "자동: ○○에게 연결 예정"
  {
    const { scr: s20, view: v20 } = inject("20_ace_call");
    const ac = v20.aceCall;
    assert.ok(ac && ac.side === "home" && ac.reason === "gauge", "우리 받는 선수의 외침");
    const callers = [...s20.querySelectorAll(".tok.calling")];
    assert.equal(callers.length, 1, "외침은 한 명");
    assert.equal(callers[0].dataset.id, ac.playerId);
    assert.ok(callers[0].classList.contains("has-bubble") && callers[0].querySelector(".tok-bubble").textContent === "줘!", "말풍선 줘!");
    assert.ok(callers[0].classList.contains("named"), "외치는 선수 이름표");
    assert.ok(s20.querySelector(".g-ace .ace-line"), "금색 점선");
    assert.equal(s20.querySelector(".g-ace-tip .ace-badge text").textContent, `★ 연결하면 ${ac.ultimateName}`, "배지");
    // 외치는 선수를 받는 선수로 고르고 패스 미리보기 → 같은 길이라 점선 숨김, 떼면 다시
    s20.querySelector(`.tok[data-side="home"][data-id="${ac.playerId}"]`).click();
    const pb = s20.querySelector('button[data-action="pass"]');
    assert.equal(pb.dataset.receiver, ac.playerId);
    pb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s20.querySelector(".m-field").classList.contains("ace-off"), "같은 받는 선수 미리보기 → 점선 숨김");
    pb.dispatchEvent(new window.Event("pointerleave"));
    assert.ok(!s20.querySelector(".m-field").classList.contains("ace-off"), "미리보기 해제 → 점선 다시");
    const db = s20.querySelector('button[data-action="dribble"]');
    if (db) {
      db.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
      assert.ok(!s20.querySelector(".m-field").classList.contains("ace-off"), "다른 미리보기(드리블)면 점선 그대로");
      db.dispatchEvent(new window.Event("pointerleave"));
    }
    // 결정 → 비트 연출 시작과 함께 외침은 걷힌다 (판정 · 결정은 그대로: 외침은 표시 전용)
    s20.querySelector('button[data-action="pass"]').click();
    assert.deepEqual(ui.lastDecision, { action: "pass", receiverId: ac.playerId });
    assert.equal(s20.querySelectorAll(".tok.calling").length, 0, "연출 중 줘! 없음");
    assert.equal(s20.querySelectorAll(".g-ace > *, .g-ace-tip > *").length, 0, "연출 중 점선 없음");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    S.actions.resetToStart();

    const { scr: s21, view: v21 } = inject("21_ace_call_opponent");
    const oc = v21.aceCall;
    assert.ok(oc && oc.side === "away" && v21.needsDecision === "defense", "상대 공격 · 우리 수비 결정 중 상대의 외침");
    // 상대는 먼저 커밋 → 외침 = 실제로 공이 갈 선수 (커밋한 패스 · 크로스의 받는 선수)
    assert.ok(oc.expected && oc.actions.includes(v21.expected.attack.action) && v21.expected.attack.receiverId === oc.playerId, "상대 외침 = 커밋한 받는 선수");
    const oTok = s21.querySelector(`.tok[data-side="away"][data-id="${oc.playerId}"]`);
    assert.ok(oTok.classList.contains("calling") && oTok.querySelector(".tok-bubble").textContent === "줘!", "상대 받는 선수 줘!");
    const carrierBub = s21.querySelector(`.tok[data-side="away"][data-id="${v21.carrier.id}"] .tok-bubble`).textContent;
    assert.ok(carrierBub && carrierBub !== "줘!", "상대 carrier 의 예상 행동 말풍선은 그대로");
    assert.equal(s21.querySelector(".g-ace-tip .ace-badge text").textContent, `★ 연결하면 ${oc.ultimateName}`);
    // 인터셉트 미리보기는 상대 예상 받는 선수(= 외치는 선수)에게 가는 길 → 점선 숨김 (화살표와 점선이 같은 곳을 가리킨다)
    const ib = s21.querySelector('button[data-action="intercept"]');
    ib.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s21.querySelector(".m-field").classList.contains("ace-off"), "인터셉트 길 = 외치는 선수 → 점선 숨김");
    ib.dispatchEvent(new window.Event("pointerleave"));
    assert.ok(!s21.querySelector(".m-field").classList.contains("ace-off"), "미리보기 해제 → 점선 다시");
    assert.doesNotMatch(s21.querySelector(".m-info .mine").textContent, /연결 예정/, "상대 외침에는 자동 문구 없음");
    S.actions.resetToStart();

    // 12 (자동 진행): 합체기 외침 배지 + 정보 줄 "자동: 그레타에게 연결 예정" (우리 자동이 그 선수에게 보낼 때만)
    const { scr: s12, view: v12 } = inject("12_ult_pass", { auto: true });
    const cc = v12.aceCall;
    assert.ok(cc && cc.reason === "combo" && cc.expected, "합체기 외침 · 자동이 그 선수에게");
    assert.equal(s12.querySelector(".g-ace-tip .ace-badge.combo text").textContent, `💥 ${cc.comboName} 가능`, "합체기 배지");
    const mine = s12.querySelector(".m-info .mine");
    assert.ok(mine.classList.contains("ace"), "정보 줄 금색");
    assert.equal(mine.textContent, `자동: ${cc.name}에게 연결 예정`);
    ui.auto = false;
    S.actions.resetToStart();
    // 수동 결정 중에는 자동 문구 없음 (말풍선 · 점선만)
    const { scr: s12m } = inject("12_ult_pass");
    assert.doesNotMatch(s12m.querySelector(".m-info .mine").textContent, /연결 예정/);
    assert.ok(s12m.querySelector(".tok.calling"), "수동이어도 외침은 보인다");
    S.actions.resetToStart();
  }

  // 22 필살기 3단 연출: ① 차지(필드 흑백 · 사용자 빛남 · 듀얼 상대만 색) → ② 컷인 → (막히면) ③ GK 역방향 컷인 "기적의 세이브!"
  {
    const { scr: s22, view: v22 } = inject("22_ult_charge_mid");
    const { createRng } = await import(pathToFileURL(path.join(ROOT, "js/engine/rng.js")).href);
    // 필살 슛이 막히는 주사위를 찾아 넣는다 (연출 확인용 — 판정 규칙은 그대로)
    let rs = null;
    for (let i = 1; i < 400 && !rs; i++) {
      const c = JSON.parse(JSON.stringify(S.store.match));
      c.rngState = createRng(`gksave${i}`).getState();
      const n0 = c.events.length;
      S.match.step(c, S.store.data, { action: "shoot", ultimate: true });
      if (c.events.slice(n0).some((e) => e.type === "save" && e.ultimate)) rs = createRng(`gksave${i}`).getState();
    }
    assert.ok(rs, "필살 슛이 막히는 주사위");
    S.store.match.rngState = rs;
    s22.querySelector(".skill-row .ult-btn:not(:disabled)").click();
    s22.querySelector('button[data-action="shoot"]').click();
    const user = await until(() => s22.querySelector(".m-field.charging .tok.charge-user"), 1000);
    assert.ok(user, "차지: 사용자 빛남");
    assert.equal(user.dataset.id, v22.carrier.id, "사용자 = 공 가진 선수");
    const foe = s22.querySelector(".m-field.charging .tok.charge-foe");
    assert.ok(foe && foe.dataset.id === v22.defender.id, "듀얼 상대(GK)만 색");
    assert.ok(await until(() => s22.querySelector(".m-cutin.show .cut:not(.cut-save)"), 1500), "② 컷인");
    const c22 = s22.querySelector(".m-cutin.show .cut:not(.cut-save)");
    assert.equal(c22.querySelector(".cut-face.art-half > img.cut-art")?.getAttribute("src"),
      artUrl(S.store.match.home.players.find((p) => p.id === v22.carrier.id).charId, "half"), "우리 SSR 컷인 (메테오 슛) = 반신 그림");
    assert.ok(!s22.querySelector(".m-field.charging"), "컷인이 뜨면 차지 끝");
    const gk = await until(() => s22.querySelector(".m-cutin.show .cut.cut-save"), 3000);
    assert.ok(gk && /기적의 세이브!/.test(gk.textContent), "③ GK 역방향 컷인");
    assert.ok(gk.classList.contains("cut-rev") && gk.classList.contains("rev-save"), "역방향 컷인 종류 = save (이벤트 reverseCutin)");
    assert.ok(!gk.querySelector("img") && !gk.querySelector(".cut-face").classList.contains("has-art"), "상대 GK (charId 없음) 역방향 컷인 = 그림 없음");
    assert.equal(gk.querySelector(".cut-face").textContent, Array.from(S.store.match.away.players.find((p) => p.id === v22.defender.id).name)[0], "상대 GK = 글자 칸");
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    assert.ok(!s22.querySelector(".m-cutin.show") && !s22.querySelector(".m-field.charging"), "컷인 · 차지 닫힘");
    S.actions.resetToStart();
  }

  // ---- 2026-09-29 사용자 결정 3~7: GK 배급 · 결정타 칩 · 마지막 공격 · 역방향 컷인 ----
  const Lb = await import(pathToFileURL(path.join(ROOT, "js/ui/labels.js")).href);
  const { createRng: rngOf } = await import(pathToFileURL(path.join(ROOT, "js/engine/rng.js")).href);
  /** 지금 경기 상태에서 decision 을 넣었을 때 pred(새 이벤트들)를 만족하는 주사위 상태 (없으면 null) — 연출 확인용, 판정 규칙은 그대로 */
  const findRng = (decision, pred, tag) => {
    for (let i = 1; i < 400; i++) {
      const c = JSON.parse(JSON.stringify(S.store.match));
      c.rngState = rngOf(`${tag}${i}`).getState();
      const n0 = c.events.length;
      S.match.step(c, S.store.data, decision);
      if (pred(c.events.slice(n0))) return rngOf(`${tag}${i}`).getState();
    }
    return null;
  };

  // 23 GK 배급 결정: 세이브 뒤 우리 GK 가 자기 박스에서 공 — 카드 두 장 (짧은 패스 100% · 롱패스 p%) + 캐논 킥 토글 → 결정 { action, skillId? }
  {
    const { scr: s23, view: v23 } = inject("23_gk_distribution");
    const d = v23.distribution;
    assert.ok(d && v23.phase === "distribution" && v23.needsDecision === "distribution" && d.side === "home", "우리 GK 배급 결정 대기");
    // 필드: GK = 공 (우리 박스), 받는 선수 = 짧은 패스 DF · 롱패스 MF (이름표 "(짧게)" · "(길게)"), 롱패스 경합 = 상대 MF (듀얼 수비 자리)
    const gkTok = s23.querySelector(`.tok[data-side="home"][data-id="${d.gkId}"]`);
    assert.equal(gkTok.dataset.role, "carrier", "배급 GK = 공 가진 선수");
    assert.ok(Number(gkTok.dataset.y) < 16, `GK 는 우리 박스 안 (y ${gkTok.dataset.y})`);
    const ballE = s23.querySelector(".m-ball");
    assert.deepEqual([ballE.dataset.x, ballE.dataset.y], [gkTok.dataset.x, gkTok.dataset.y], "공 = GK");
    for (const a of ["short", "long"]) {
      const el = s23.querySelector(`.tok[data-side="home"][data-id="${d.options[a].success.starterId}"]`);
      assert.equal(el.dataset.role, "receiver", `${a} 받는 선수`);
      assert.match(el.querySelector(".tok-name").textContent, a === "long" ? /\(.*길게.*\)$/ : /\(.*짧게.*\)$/, `${a} 이름표`);
      assert.ok(!el.classList.contains("pickable"), "배급 받는 선수는 탭 선택 아님 (카드로 고른다)");
    }
    if (d.contest) assert.equal(s23.querySelector(`.tok[data-side="away"][data-id="${d.contest.id}"]`).dataset.role, "defender", "롱패스 경합 상대 MF");
    assert.ok(s23.querySelector(".zone.z1.ball-zone"), "공 구역 = 우리 박스");
    assert.equal(s23.querySelectorAll(".m-track .trk.on").length, 0, "트랙: 아직 ① 전");
    assert.match(s23.querySelector(".m-banner-txt").textContent, /배급 — 짧게 빌드업 · 길게 중원$/);
    assert.ok(s23.querySelector(".m-info .expect").textContent.includes(`우리 GK ${d.gkName} 배급 — 롱패스 ${d.options.long.pct}%`), "정보 줄: 배급 GK · 롱패스 %");
    assert.match(s23.querySelector(".m-info .mine").textContent, /^우리: (짧은 패스|롱패스)/, "정보 줄: 우리 자동 배급");
    const grid = s23.querySelector(".action-grid");
    assert.ok(grid.classList.contains("k-dist") && grid.classList.contains("n-2") && grid.classList.contains("deciding"), `배급 카드 두 장: ${grid.className}`);
    const cards = [...s23.querySelectorAll("button[data-action]")];
    assert.deepEqual(cards.map((b) => b.dataset.action), ["short", "long"], "짧은 패스 · 롱패스");
    assert.ok(cards.every((b) => !b.disabled), "둘 다 고를 수 있다");
    const [sb, lb] = cards;
    assert.equal(sb.querySelector(".act-lbl").textContent, "짧은 패스");
    assert.equal(sb.querySelector(".act-pct").textContent, "100%");
    assert.ok(sb.textContent.includes("빌드업부터") && sb.textContent.includes("실패 없음"), "짧은 패스: 빌드업부터 · 실패 없음");
    assert.equal(sb.querySelector(".act-rname").textContent, d.options.short.success.starterName);
    assert.equal(lb.querySelector(".act-lbl").textContent, "롱패스");
    assert.equal(lb.querySelector(".act-pct").textContent, `${d.options.long.pct}%`, "롱패스 % = 엔진");
    assert.ok(lb.textContent.includes("성공 중원부터") && lb.textContent.includes("실패 상대 중원 공격"), "롱패스 성공 · 실패 한 줄");
    assert.equal(s23.querySelectorAll(".chip-rec").length, 1, "추천 한 개");
    assert.equal(s23.querySelector(".chip-rec").closest("button").dataset.action, d.recommended, "추천 = 엔진 recommended");
    sb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s23.querySelector(".g-arrow line.ar-pass"), "짧은 패스 미리보기 = 점선");
    assert.equal(s23.querySelector(".g-tip text")?.textContent, "→ 빌드업");
    sb.dispatchEvent(new window.Event("pointerleave"));
    lb.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.ok(s23.querySelector(".g-arrow path.ar-long"), "롱패스 미리보기 = 포물선");
    lb.dispatchEvent(new window.Event("pointerleave"));
    assert.equal(s23.querySelectorAll(".g-arrow > *").length, 0, "미리보기 해제");
    // 캐논 킥 토글 → 롱패스 % = 스킬 확률, 짧은 패스는 흐리게 (롱패스와만)
    const ck = d.skills.find((k) => k.skillId === "sk_cannon_kick");
    const kb = s23.querySelector('.skill-row [data-skill="sk_cannon_kick"]');
    assert.ok(ck && kb && !kb.disabled, "캐논 킥 버튼");
    kb.click();
    assert.equal(s23.querySelector('.skill-row [data-skill="sk_cannon_kick"]').getAttribute("aria-pressed"), "true", "캐논 킥 켜짐");
    assert.equal(s23.querySelector('button[data-action="long"] .act-pct').textContent, `${ck.pct}%`, "캐논 킥 롱패스 %");
    assert.ok(s23.querySelector('button[data-action="short"]').disabled, "캐논 킥은 롱패스와만 → 짧은 패스 흐림");
    const e0 = S.store.match.events.length;
    s23.querySelector('button[data-action="long"]').click();
    assert.deepEqual(ui.lastDecision, { action: "long", skillId: "sk_cannon_kick" }, "결정 { action: long, skillId }");
    const fresh = S.store.match.events.slice(e0);
    assert.ok(fresh.some((e) => e.type === "skill" && e.effect === "longPassBoost"), "캐논 킥 발동");
    const beat = fresh.find((e) => (e.type === "distribution" || e.type === "turnover") && e.distribution);
    assert.ok(beat && beat.action === "long", "롱패스 판정");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    const va = S.match.getMatchView(S.store.match, S.store.data, "home");
    if (beat.type === "distribution") {
      assert.ok(va.attackingSide === "home" && va.lineIndex === 1, "롱패스 성공 → 중원부터");
      assert.match(s23.querySelector(".m-banner-txt").textContent, /^롱패스 성공! 중원에서 시작/);
    } else {
      assert.equal(va.attackingSide, "away", "롱패스 실패 → 상대 중원 공격");
      assert.match(s23.querySelector(".m-banner-txt").textContent, /세컨드볼!/);
    }
    S.actions.resetToStart();

    // 짧은 패스: 결정 { action: short } → 빌드업(①) DF 부터, 결과 한 줄 · 배너 "GK 짧은 패스"
    const { scr: s23b, view: v23b } = inject("23_gk_distribution");
    const e1 = S.store.match.events.length;
    s23b.querySelector('button[data-action="short"]').click();
    assert.deepEqual(ui.lastDecision, { action: "short" }, "결정 { action: short }");
    const sev = S.store.match.events.slice(e1).find((e) => e.type === "distribution");
    assert.ok(sev && sev.action === "short" && sev.success && sev.receiverId === v23b.distribution.options.short.success.starterId, "짧은 패스 = 빌드업 DF");
    assert.ok(await until(() => [...s23b.querySelectorAll(".m-pop")].some((el) => el.textContent.includes("짧은 패스 · 빌드업부터")), 3000), "결과 한 줄");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    assert.match(s23b.querySelector(".m-banner-txt").textContent, /^GK 짧은 패스 — /);
    S.actions.resetToStart();
  }

  // 상대 GK 배급 (자동): 카드 두 장은 자동 카드 (상대 선택에 "자동"), 상대 GK 말풍선 = 상대 배급, 스킬 묶음 = 안내 한 줄
  {
    // 18 (우리 ④)에서 슛이 상대 GK 에게 막히는 주사위 → 세이브 → 상대 GK 배급 대기
    inject("18_box_link_decision");
    const rsS = findRng({ action: "shoot" }, (evs) => evs.some((e) => e.type === "save" && e.nextDistribution), "osave");
    assert.ok(rsS, "우리 슛이 막히는 주사위");
    const ms = JSON.parse(JSON.stringify(S.store.match));
    ms.rngState = rsS;
    S.match.step(ms, S.store.data, { action: "shoot" });
    assert.ok(ms.phase === "distribution" && ms.distribution.side === "away", "상대 GK 배급 대기 상태");
    S.store.match = ms;
    S.render();
    const so = doc.querySelector(".match-screen");
    const vo = S.match.getMatchView(ms, S.store.data, "home");
    const d = vo.distribution;
    assert.equal(vo.needsDecision, null, "상대 배급은 우리 결정 아님");
    const cards = [...so.querySelectorAll("button[data-action]")];
    assert.deepEqual(cards.map((b) => b.dataset.action), ["short", "long"]);
    assert.ok(cards.every((b) => b.disabled && b.classList.contains("auto-view")), "자동 카드");
    assert.equal(so.querySelector(".chip-auto")?.closest("button").dataset.action, d.auto.action, "상대 선택 = 엔진 auto");
    assert.ok(so.querySelector('button[data-action="long"]').textContent.includes("실패 우리 중원 공격"), "상대 롱패스 실패 = 우리 중원 공격");
    const gkBub = so.querySelector(`.tok[data-side="away"][data-id="${d.gkId}"] .tok-bubble`);
    assert.equal(gkBub.textContent, `${Lb.DIST_ICONS[d.auto.action]} ${Lb.DIST_LABELS[d.auto.action]}`, "상대 GK 말풍선 = 상대 배급");
    assert.match(so.querySelector(".m-info .expect").textContent, /상대 GK .+ 배급 — 롱패스 \d+% .*· 상대 선택: /);
    assert.match(so.querySelector(".skill-row").textContent, /상대 GK 배급 중/);
    assert.ok(so.querySelector(".zone.z5.ball-zone"), "공 구역 = 상대 박스");
    S.actions.resetToStart();
  }

  // 2026-09-30 결함 수정: 캐논 킥 힌트(짧게) · 연출 중 정보 줄 = 고른 배급 · 첫 듀얼 보너스 표시 · 롱패스 경합 이름표 숨김 ·
  // 세컨드볼 결과 한 줄(끊은 선수 → 역습 시작 선수) · 마지막 공격 배급의 "실패 경기 종료"
  {
    const { scr: sc } = inject("23_gk_distribution");
    const kb = sc.querySelector('.skill-row [data-skill="sk_cannon_kick"]');
    kb.click();
    assert.match(sc.querySelector('button[data-action="long"] .act-hint').textContent, /^캐논 킥 첫 듀얼\+10%/, "캐논 킥 힌트가 맨 앞 (잘리지 않게)");
    const rsOk = findRng({ action: "long", skillId: "sk_cannon_kick" }, (evs) => evs.some((e) => e.type === "distribution" && e.success), "ckok");
    assert.ok(rsOk, "캐논 킥 롱패스 성공 주사위");
    S.store.match.rngState = rsOk;
    sc.querySelector('button[data-action="long"]').click();
    assert.match(sc.querySelector(".m-info .mine").textContent, /^우리 선택: 롱패스 \d+% \+ 캐논 킥$/, "연출 중 정보 줄 = 고른 배급");
    assert.ok(await until(() => sc.querySelector(".tok.tag-off"), 3000), "경합에 진 선수 이름표 숨김");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    const vn = S.match.getMatchView(S.store.match, S.store.data, "home");
    assert.equal(vn.needsDecision, "attack", "롱패스 성공 → 중원 우리 공격 결정");
    assert.ok(vn.ballState.pending.nextBonus > 0, "첫 듀얼 보너스 대기");
    const hints = [...sc.querySelectorAll("button[data-action] .act-hint")].map((e) => e.textContent);
    assert.ok(hints.length && hints.every((t) => t.startsWith("첫 듀얼 +10%")), `첫 듀얼 보너스 표시: ${hints.join(" | ")}`);
    S.actions.resetToStart();

    // 롱패스 실패 (평소): 결과 한 줄 = "끊은 선수 롱패스 차단! → 역습 시작 선수 세컨드볼" (같은 선수면 "세컨드볼 — 상대 중원 공격")
    const { scr: sf } = inject("23_gk_distribution");
    const rsNg = findRng({ action: "long" }, (evs) => evs.some((e) => e.type === "turnover" && e.distribution), "lngf");
    S.store.match.rngState = rsNg;
    const f0 = S.store.match.events.length;
    sf.querySelector('button[data-action="long"]').click();
    const tev = S.store.match.events.slice(f0).find((e) => e.type === "turnover" && e.distribution);
    assert.ok(tev && tev.starterId && tev.receiverId && !tev.matchEnd, "롱패스 실패 이벤트 starterId · receiverId");
    assert.ok(await until(() => sf.querySelector(`.tok[data-side="home"][data-id="${tev.receiverId}"].tag-off`), 3000), "끊긴 받는 선수 이름표 숨김");
    const nmA = (id) => S.store.match.away.players.find((p) => p.id === id).name;
    const want = tev.starterId !== tev.defenderId ? `${nmA(tev.defenderId)} 롱패스 차단! → ${nmA(tev.starterId)} 세컨드볼` : `${nmA(tev.defenderId)} 롱패스 차단! 세컨드볼 — 상대 중원 공격`;
    assert.ok(await until(() => [...sf.querySelectorAll(".m-pop")].some((el) => el.textContent.endsWith(want)), 4000), `결과 한 줄: ${want}`);
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    S.actions.resetToStart();

    // 1골 뒤진 우리의 마지막 공격이 GK 배급으로 시작: 롱패스 실패 = 경기 종료 (카드 · 결과 한 줄)
    inject("23_gk_distribution");
    const ms = JSON.parse(JSON.stringify(S.store.match));
    ms.possessionsTotal = ms.possession;
    ms.score = { home: 0, away: 1 };
    ms.lastAttack = { side: "home", stage: "regular", possession: ms.possession };
    ms.lastAttackUsed = { regular: true, extraTime: false };
    S.store.match = ms;
    S.render();
    const sl = doc.querySelector(".match-screen");
    assert.ok(sl.querySelector('button[data-action="long"]').textContent.includes("실패 경기 종료"), "마지막 공격 롱패스: 실패 경기 종료");
    const rsEnd = findRng({ action: "long" }, (evs) => evs.some((e) => e.type === "turnover" && e.distribution), "lend");
    S.store.match.rngState = rsEnd;
    sl.querySelector('button[data-action="long"]').click();
    assert.ok(S.store.match.finished, "롱패스 실패로 경기 종료");
    assert.ok(await until(() => [...sl.querySelectorAll(".m-pop")].some((el) => /롱패스 차단! — 경기 종료$/.test(el.textContent)), 4000), "결과 한 줄 = 경기 종료");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    ui.resultShown = false;
    S.actions.resetToStart();
  }

  // 25 결정타 칩 (클래시 바 1단계, 표시 전용): 결과 한 줄 맨 앞 칩 = 판정 이벤트 decisive.text, 색 종류 클래스, 대이변이면 금색 "대이변!".
  // matchUi.decisiveChip = false (코드는 SHOW_DECISIVE_CHIP) 면 칩 없음 — 결과 한 줄은 그대로
  {
    const { scr: s25 } = inject("25_decisive_chip");
    const e0 = S.store.match.events.length;
    s25.querySelector('button[data-action="dribble"]').click();
    const ev = S.store.match.events.slice(e0).find((e) => ["duel", "turnover"].includes(e.type) && e.decisive);
    assert.ok(ev, "결정타 있는 판정");
    const chip = await until(() => s25.querySelector(".m-pop .dchip:not(.dchip-upset)"), 3000);
    assert.ok(chip, "결과 한 줄에 결정타 칩");
    assert.equal(chip.textContent, ev.decisive.text, "칩 = 엔진 decisive.text");
    assert.equal(chip.parentElement.firstElementChild, chip, "칩이 결과 한 줄 맨 앞");
    assert.ok(chip.classList.contains(`k-${Lb.DECISIVE_KINDS[ev.decisive.id] ?? "base"}`), `색 종류 (${ev.decisive.id})`);
    assert.equal(!!chip.parentElement.querySelector(".dchip-upset"), !!ev.upset, "대이변 표시 = 이벤트 upset");
    assert.ok(await until(() => !ui.busy, 6000), "연출 끝");
    S.actions.resetToStart();
    // 대이변: 이긴 쪽 확률 < upsetP(25%) 인 판정 (주사위만 바꿈) → 금색 "대이변!"
    // 시나리오 25 는 드리블 74% · 패스 64% 라 어느 쪽이 이겨도 25% 밑이 아니다 → 공 가진 선수 스탯을 두 배로 올려
    // 실패(수비 승)가 25% 미만이 되게 한 뒤, 켜진 공격 액션을 차례로 시도한다
    inject("25_decisive_chip");
    {
      const mm = S.store.match;
      const cp = mm.home.players.find((p) => p.id === mm.ball.carrierId);
      for (const k of ["dribble", "pass"]) cp.stats[k] = Math.round(cp.stats[k] * 2);
      S.render();
    }
    const v25u = { actions: S.match.getMatchView(S.store.match, S.store.data, "home").actions };
    let rsU = null;
    let upAct = null;
    for (const a of v25u.actions.filter((x) => x.enabled).map((x) => x.action)) {
      rsU = findRng({ action: a }, (evs) => evs.some((e) => e.upset), `upset-${a}`);
      if (rsU) { upAct = a; break; }
    }
    assert.ok(rsU, "대이변 주사위");
    S.store.match.rngState = rsU;
    const s25u = doc.querySelector(".match-screen");
    s25u.querySelector(`button[data-action="${upAct}"]`).click();
    const up = await until(() => s25u.querySelector(".m-pop .dchip-upset"), 3000);
    assert.ok(up && up.textContent === "대이변!", "대이변 칩");
    assert.ok(await until(() => !ui.busy, 6000));
    S.actions.resetToStart();
    // 칩 끄기
    ui.decisiveChip = false;
    try {
      const { scr: s25b } = inject("25_decisive_chip");
      s25b.querySelector('button[data-action="dribble"]').click();
      assert.ok(await until(() => s25b.querySelector(".m-pop"), 3000), "결과 한 줄은 그대로");
      assert.equal(s25b.querySelectorAll(".dchip").length, 0, "칩 끄면 없음");
      assert.ok(await until(() => !ui.busy, 6000));
    } finally {
      delete ui.decisiveChip;
    }
    S.actions.resetToStart();
  }

  // 26 마지막 공격 보장: 1골 뒤진 우리의 추가 포제션 — 배너 "⏱ 추가시간 — 마지막 공격!" (금색), 헤더 줄 "⏱ 추가시간", 로그 줄
  {
    const { scr: s26, view: v26 } = inject("26_last_attack");
    assert.ok(v26.lastAttack?.active && v26.lastAttack.side === "home", "추가 포제션 진행 중");
    assert.equal(s26.querySelector(".m-banner-txt").textContent, "⏱ 추가시간 — 마지막 공격!");
    assert.ok(s26.querySelector(".m-banner").classList.contains("lv-last"), "배너 = 금색");
    assert.match(s26.querySelector(".mh-sub").textContent, /⏱ 추가시간/);
    assert.ok(s26.querySelector(".mh").classList.contains("last-attack"));
    assert.ok(s26.querySelector(".match-log .log-line.ev-lastAttack")?.textContent.includes("추가시간 — 마지막 공격!"), "로그 줄");
    // 포제션이 끝나면 경기 종료 → 결과 모달 (⏭). 앞 시나리오가 남긴 결과 모달 표시 여부는 지운다 (주입 경기는 새 경기가 아니라 초기화되지 않는다)
    ui.resultShown = false;
    [...s26.querySelectorAll("button")].find((b) => b.textContent === "⏭").click();
    assert.ok(await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인"), 3000), "결과 모달");
    assert.ok(!s26.querySelector(".mh").classList.contains("last-attack"), "종료 뒤 추가시간 표시 없음");
    ui.resultShown = false; // 결과 모달은 resetToStart → render 가 닫는다 (finishMatch 는 부르지 않는다)
    S.actions.resetToStart();
  }

  // 27 역방향 컷인: ③ 필살 슛이 DF 에게 막힘 → "철벽 블록!" (막은 팀 쪽, .cut-rev.rev-block) · 필살 패스가 끊김 → "필살 패스 차단!" (.rev-passCut)
  {
    const { scr: s27 } = inject("27_df_block_cutin");
    const e0 = S.store.match.events.length;
    s27.querySelector(".skill-row .ult-btn:not(:disabled)").click();
    s27.querySelector('button[data-action="shoot"]').click();
    const ev = S.store.match.events.slice(e0).find((e) => e.type === "turnover" && e.reverseCutin);
    assert.ok(ev && ev.reverseCutin.kind === "block", "DF 블록 이벤트");
    const rc = await until(() => s27.querySelector(".m-cutin.show .cut.cut-rev.rev-block"), 4000);
    assert.ok(rc && /철벽 블록!/.test(rc.textContent), "철벽 블록! 컷인");
    assert.ok(rc.classList.contains(`side-${ev.reverseCutin.side}`) && rc.classList.contains("cut-save"), "막은 팀 쪽 · 역방향 스타일");
    const blocker = S.store.match[ev.reverseCutin.side].players.find((p) => p.id === ev.reverseCutin.playerId);
    assert.ok(rc.textContent.includes(blocker.name), "막은 선수 이름");
    assert.ok(!blocker.charId && !rc.querySelector("img"), "charId 없는 상대가 막은 역방향 컷인 = 그림 없음 (글자 칸)");
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    S.actions.resetToStart();

    const { scr: s12p } = inject("12_ult_pass");
    const rsP = findRng({ action: "pass", ultimate: true }, (evs) => evs.some((e) => e.reverseCutin?.kind === "passCut"), "pcut");
    assert.ok(rsP, "필살 패스가 끊기는 주사위");
    S.store.match.rngState = rsP;
    const e1 = S.store.match.events.length;
    s12p.querySelector(".skill-row .ult-btn:not(:disabled)").click();
    s12p.querySelector('button[data-action="pass"]').click();
    assert.ok(S.store.match.events.slice(e1).some((e) => e.reverseCutin?.kind === "passCut"), "필살 패스 차단 이벤트");
    const pc = await until(() => s12p.querySelector(".m-cutin.show .cut.cut-rev.rev-passCut"), 4000);
    assert.ok(pc && /필살 패스 차단!/.test(pc.textContent), "필살 패스 차단! 컷인");
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    S.actions.resetToStart();
  }

  // 28 부상 선수 경기 출전 (§18.1 L42): 레슨 결장 2 를 주입한 DF2 가 경계전에 본인으로 나온다 — 유스 토큰 · 유스 선수 없음, 스탯 · 스킬 = 런 선수 그대로
  {
    const { prep: p28, scr: s28 } = inject("28_injured_plays", { auto: true });
    const hurt = p28.runState.players.find((p) => p.injuredTurns > 0);
    assert.ok(hurt, "부상 주입 (런 상태)");
    assert.equal(S.store.match.kind, "goal", "경계전");
    const mp = S.store.match.home.players.find((p) => p.id === hurt.id);
    assert.ok(mp && !mp.isYouth && mp.name === hurt.name, "다친 선수 본인 출전");
    assert.ok(!S.store.match.home.players.some((p) => p.isYouth), "유스 없음");
    assert.deepEqual(mp.stats, S.run.buildTeamSnapshot({ ...p28.runState, players: p28.runState.players.map((p) => ({ ...p, injuredTurns: 0 })) }, S.store.data).players.find((p) => p.id === hurt.id).stats, "스탯 = 안 다쳤을 때와 같음");
    assert.equal(s28.querySelectorAll(".tok.home.youth").length, 0, "유스 토큰 없음");
    assert.equal(s28.querySelectorAll(".tok.home").length, 7, "우리 토큰 7");
    assert.equal(p28.runState.players.find((p) => p.id === hurt.id).injuredTurns, 2, "경기 전 injuredTurns 그대로");
    S.actions.resetToStart();
  }

  // §19 (K4) 새 필살기 종류 — 29 필살 수비 · 30 팀 필살기(공격 · 수비) · 31 필살 드리블 화살표 · 32 합체기 이름 · 33 확정 배급 · 34 SR 컷인
  {
    // 29 필살 수비: 수비 결정에도 필살기 버튼 → 토글하면 수비 3종 모두 켜짐 · 기대 % = 엔진 ultimateOptions · 결정 { action, ultimate: true }
    const { scr: s29, view: v29 } = inject("29_ult_defense");
    const u29 = v29.ultimateOptions.find((x) => x.usable);
    assert.equal(u29.type, "defense");
    const ub29 = s29.querySelector(".skill-row .ult-btn.ut-defense");
    assert.ok(ub29 && !ub29.disabled && ub29.dataset.tier === "SR", "필살 수비 버튼 (SR)");
    assert.match(ub29.title, /필살 수비 산맥 쐐기 \(SR\)/);
    assert.match(ub29.title, /“여기서부터는 산이다\.”/, "버튼 title 에 대사");
    ub29.click();
    for (const a of ["tackle", "intercept", "hold"]) {
      const b = s29.querySelector(`button[data-action="${a}"]`);
      assert.ok(b && !b.disabled && b.classList.contains("ult-on"), `${a}: 필살 수비와 함께`);
      assert.equal(b.querySelector(".act-pct").textContent, `${u29.expectedPct[a]}%`, `${a} 기대 % (필살 수비)`);
    }
    s29.querySelector('button[data-action="tackle"]').click();
    assert.deepEqual([ui.lastDecision.action, ui.lastDecision.ultimate], ["tackle", true], "결정 { tackle, ultimate: true }");
    assert.ok(await until(() => s29.querySelector(".m-cutin.show .cut.ut-defense.tier-SR"), 2000), "필살 수비 SR 컷인");
    assert.match(s29.querySelector(".m-cutin .cut .cut-type").textContent, /필살 수비/);
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    S.actions.resetToStart();

    // 팀 필살기 (수비): 같은 장면에서 막는 선수의 필살기를 불꽃 호령으로 바꾸면 수비 결정에도 팀 필살기 버튼 → 수비 3종 모두
    inject("29_ult_defense");
    const d29 = S.store.match.home.players.find((p) => p.id === S.store.match.duel.defenderId);
    d29.skillIds = d29.skillIds.map((id) => (id === "sk_mountain_wedge" ? "sk_flame_command" : id));
    S.render();
    const s29t = doc.querySelector(".match-screen");
    const tb = s29t.querySelector(".skill-row .ult-btn.ut-team");
    assert.ok(tb && !tb.disabled, "수비 결정의 팀 필살기 버튼");
    tb.click();
    for (const a of ["tackle", "intercept", "hold"]) assert.ok(!s29t.querySelector(`button[data-action="${a}"]`).disabled, `${a}: 팀 필살기와 함께`);
    s29t.querySelector('button[data-action="intercept"]').click();
    assert.deepEqual([ui.lastDecision.action, ui.lastDecision.ultimate], ["intercept", true], "결정 { intercept, ultimate: true }");
    assert.ok(await until(() => !ui.busy, 8000));
    S.actions.resetToStart();

    // 30 팀 필살기 (공격) + R 짧은 컷인: 공격 액션 전부 켜짐 → 컷인 .tier-R · 종류 칩 '필살 호령' · 대사 한 줄 → 로그 줄 (teamUlt)
    const { scr: s30, view: v30 } = inject("30_ult_team_cutin");
    const u30 = v30.ultimateOptions.find((x) => x.usable);
    assert.equal(u30.type, "team");
    s30.querySelector(".skill-row .ult-btn.ut-team").click();
    const enabled30 = v30.actions.filter((a) => a.enabled).map((a) => a.action);
    for (const a of enabled30) assert.ok(!s30.querySelector(`button[data-action="${a}"]`).disabled, `${a}: 팀 필살기와 함께`);
    s30.querySelector('button[data-action="pass"]').click();
    assert.equal(ui.lastDecision.ultimate, true);
    const cut30 = await until(() => s30.querySelector(".m-cutin.show .cut.tier-R"), 2000);
    assert.ok(cut30 && cut30.classList.contains("ut-team"), "R 컷인 (.tier-R · .ut-team)");
    assert.equal(cut30.querySelector(".cut-type").textContent, "필살 호령");
    assert.equal(cut30.querySelector(".cut-line").textContent, "“다들, 아직 안 끝났어!”", "컷인 대사");
    const user30 = S.store.match.home.players.find((p) => p.skillIds.includes(u30.skillId));
    assert.equal(cut30.querySelector(".cut-face.art-face > img.cut-art")?.getAttribute("src"), artUrl(user30.charId, "face"), "R 컷인 = 64 원에 얼굴 그림");
    assert.ok(await until(() => !ui.busy, 8000), "연출 끝");
    assert.ok(s30.querySelector(".match-log .log-line.ev-teamUlt")?.textContent.includes("팀 판정 ×1.08"), "팀 필살기 로그 줄");
    S.actions.resetToStart();

    // 31 필살 드리블 extraLine: 토글 → 드리블만 켜짐, 미리보기 화살표 = 두 구역 (① → ③, 끝 글자 "두 구역 전진")
    const { scr: s31, view: v31 } = inject("31_ult_dribble_extra");
    assert.equal(v31.ultimateOptions.find((x) => x.usable)?.type, "dribble");
    const db = () => s31.querySelector('button[data-action="dribble"]');
    db().dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    const x1 = Number(s31.querySelector(".g-arrow line.ar-dribble")?.getAttribute("x2"));
    db().dispatchEvent(new window.Event("pointerleave"));
    s31.querySelector(".skill-row .ult-btn.ut-dribble").click();
    for (const b of s31.querySelectorAll("button[data-action]")) assert.equal(b.disabled, b.dataset.action !== "dribble", `${b.dataset.action}: 필살 드리블과 함께는 드리블만`);
    db().dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    const x2 = Number(s31.querySelector(".g-arrow line.ar-dribble")?.getAttribute("x2"));
    assert.ok(x2 > x1 + 50, `필살 드리블 화살표가 더 멀리 (${x1} → ${x2})`);
    assert.match(s31.querySelector(".g-tip text")?.textContent ?? "", /두 구역 전진/);
    db().dispatchEvent(new window.Event("pointerleave"));
    S.actions.resetToStart();

    // 32 합체기 이름 (등록된 짝 — 풍뢰일섬): 버튼 · 이름 카드
    const { scr: s32 } = inject("32_combo_thunder");
    const cb32 = s32.querySelector(".skill-row .ult-btn.combo");
    assert.ok(cb32 && cb32.textContent.includes("풍뢰일섬"), "합체기 버튼 = 풍뢰일섬");
    cb32.click();
    s32.querySelector('button[data-action="shoot"]').click();
    const nm32 = await until(() => s32.querySelector(".m-cutin.show .cut-name"), 4000);
    assert.ok(nm32 && /풍뢰일섬/.test(nm32.textContent) && /실루엔 → 브론테/.test(nm32.textContent), "합체기 이름 카드");
    assert.ok(await until(() => !ui.busy, 8000));
    S.actions.resetToStart();

    // 33 확정 배급: 롱패스 % 칸 "확정", 실패 줄 "실패 없음 (확정)", 힌트 = 필살기 이름, 정보 줄 "롱패스 확정 (대지의 손바닥)"
    const { scr: s33, view: v33 } = inject("33_save_sure_dist");
    assert.equal(v33.distribution.sure?.name, "대지의 손바닥");
    const lb33 = s33.querySelector('button[data-action="long"]');
    assert.ok(lb33.classList.contains("sure"));
    assert.equal(lb33.querySelector(".act-pct").textContent, "확정");
    assert.equal(lb33.querySelector(".act-out.ng").textContent, "실패 없음 (확정)");
    assert.match(lb33.querySelector(".act-hint").textContent, /대지의 손바닥 — 판정 없이 성공/);
    assert.match(lb33.title, /롱패스 → .* 확정 \(대지의 손바닥\)/);
    assert.match(s33.querySelector(".m-info").textContent, /롱패스 확정 \(대지의 손바닥\)/);
    S.actions.resetToStart();

    // 34 SR 컷인: .tier-SR · 종류 칩 '필살 드리블' · 대사
    const { scr: s34 } = inject("34_cutin_sr_line");
    s34.querySelector(".skill-row .ult-btn.ut-dribble").click();
    s34.querySelector('button[data-action="dribble"]').click();
    const cut34 = await until(() => s34.querySelector(".m-cutin.show .cut.tier-SR"), 2000);
    assert.ok(cut34 && cut34.classList.contains("ut-dribble") && cut34.classList.contains("side-home"), "SR 컷인 (우리 쪽)");
    assert.equal(cut34.querySelector(".cut-line").textContent, "“흐르는 물은 못 막아.”");
    assert.equal(cut34.querySelector(".cut-face.art-bust > img.cut-art")?.getAttribute("src"), artUrl("ch_spirit_dribbler", "bust"), "SR 컷인 = 흉상 창 (온디나)");
    assert.ok(await until(() => !ui.busy, 8000));
    S.actions.resetToStart();

    // 필살 드리블이 필드 수비에 막히면 역방향 컷인 "철벽 블록!" (엔진 reverseCutin.kind block — E4)
    const { scr: s34b } = inject("34_cutin_sr_line");
    const rs34 = findRng({ action: "dribble", ultimate: true }, (evs) => evs.some((e) => e.reverseCutin?.kind === "block"), "dblk");
    assert.ok(rs34, "필살 드리블이 막히는 주사위");
    S.store.match.rngState = rs34;
    s34b.querySelector(".skill-row .ult-btn.ut-dribble").click();
    s34b.querySelector('button[data-action="dribble"]').click();
    const rb34 = await until(() => s34b.querySelector(".m-cutin.show .cut.cut-rev.rev-block"), 4000);
    assert.ok(rb34 && /철벽 블록!/.test(rb34.textContent) && /급류 봉쇄/.test(rb34.textContent), "필살 드리블 → 철벽 블록! 컷인");
    assert.ok(await until(() => !ui.busy, 8000));
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

  // L54 (LESSON_PROTO_PLAN §25): 36 스루 패스 토글 → 패스 받는 선수 = 두 구역 앞 FW, 화살표 끝 글자 "두 구역 전진", 패스 카드 약점 줄 "두 구역 전진"
  // 37 라인 브레이커 (③ FW) 토글 → 켜져 있고, 드리블 카드 성공 줄 "성공 박스 원터치 ×1.5" · % 가 엔진 변형 값
  {
    const { scr: s36, view: v36 } = inject("36_through_pass");
    const tpBtn = s36.querySelector('.skill-row .sk-btn[data-skill="sk_through_pass"]');
    assert.ok(tpBtn && !tpBtn.disabled, "스루 패스 버튼 켜짐");
    const pb = () => s36.querySelector('button[data-action="pass"]');
    assert.ok(!/두 구역/.test(pb().textContent), "토글 전 패스 카드 = 보통");
    tpBtn.click();
    assert.equal(pb().dataset.receiver, v36.receiverPreviewBySkill.sk_through_pass.id, "패스 카드 받는 선수 = 변형 (FW)");
    assert.match(pb().querySelector(".act-hint").textContent, /두 구역 전진/);
    pb().dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
    assert.match(s36.querySelector(".g-tip text")?.textContent ?? "", /두 구역 전진/, "패스 화살표 끝 글자");
    pb().dispatchEvent(new window.Event("pointerleave"));
    S.actions.resetToStart();

    const { scr: s37, view: v37 } = inject("37_line_breaker");
    const lbBtn = s37.querySelector('.skill-row .sk-btn[data-skill="sk_line_breaker"]');
    assert.ok(lbBtn && !lbBtn.disabled, "③ FW 라인 브레이커 켜짐");
    lbBtn.click();
    const db = s37.querySelector('button[data-action="dribble"]');
    assert.equal(db.querySelector(".act-out.ok .txt.short").textContent, "성공 박스 원터치 ×1.5");
    const lbV = v37.skills.find((x) => x.skillId === "sk_line_breaker");
    assert.equal(db.querySelector(".act-pct").textContent, `${lbV.expectedPct.dribble}%`, "카드 % = 엔진 변형 득점 기대");
    assert.match(s37.querySelector('button[data-action="shoot"] .act-hint').textContent, /^라인 브레이커 효과 없음/);
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
    assert.equal(JSON.parse(window.localStorage.getItem(KEYS.match)).version, 3, "저장도 새 경기");
    S.actions.resetToStart();
  }

  // 가로 전용: 옛 세로 저장값(…orient) · ?orient=port · matchUi.orient 는 무시한다 — home 골 왼쪽 · away 골 오른쪽 (필드 y → 화면 x, 필드 x → 화면 y).
  // 받는 선수 탭 · 크로스 포물선 · 결정 { action, receiverId } 는 그대로. 창 크기가 바뀌어도(연출 중이어도) 경기 화면을 다시 그리지 않는다.
  {
    window.localStorage.setItem(`${STORAGE_PREFIX}orient`, "port");
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

  // ---- 도전 모드 (2026-10-01): 시작 화면 [도전 모드] → 샘플 팀 1단계 → ⏭ → 결과 [확인] 연타 → 진행 기록 1회 · 결과 모달,
  // 이미 기록된 경기는 복원하지 않음, 경기 중 "새로고침"(저장본 복원) → 같은 경기, [포기] → 패배 기록. 런 상태 · 런 저장은 그대로 ----
  {
    const runSave = window.localStorage.getItem(KEYS.run);
    const runMatchSave = window.localStorage.getItem(KEYS.match);
    const runMem = JSON.stringify(S.store.run);
    const CH = S.challenge;
    assert.ok(CH && typeof CH.challengeSetup === "function", "도전 모드 엔진 모듈 로드됨");
    window.localStorage.removeItem(KEYS.challenge);
    window.localStorage.removeItem(KEYS.challengeMatch);
    S.store.challenge.teamId = null;
    S.store.challenge.stage = null;
    S.render();
    const chBtn = [...doc.querySelectorAll(".start-menu button")].find((b) => b.textContent.includes("도전 모드"));
    assert.ok(chBtn, "시작 화면 [도전 모드]");
    chBtn.click();
    assert.equal(S.store.screen, "challenge");
    assert.equal(doc.getElementById("stage").dataset.mode, "og");
    assert.equal(S.store.challenge.teamId, "sample", "등록 팀 없음 → 테스트용 샘플 팀");
    assert.deepEqual([...doc.querySelectorAll(".ch-ladder .ch-stage")].map((b) => b.dataset.state), ["open", ...Array(9).fill("locked")], "1단계만 열림");
    doc.querySelector('.ch-stage[data-stage="3"]').click();
    assert.equal(S.store.challenge.stage, 3, "잠긴 단계도 미리보기");
    assert.ok(doc.querySelector(".ch-go").disabled, "잠긴 단계 = 도전 버튼 잠김");
    doc.querySelector('.ch-stage[data-stage="1"]').click();
    let chFinish = 0;
    const origChFinish = S.actions.finishChallengeMatch;
    S.actions.finishChallengeMatch = (r) => { chFinish++; return origChFinish(r); };
    ui.auto = true;
    ui.speed = 4;
    doc.querySelector(".ch-go").click();
    assert.equal(S.store.screen, "challengeMatch");
    const cms = doc.querySelector(".match-screen");
    assert.ok(cms, "도전 경기 = 같은 경기 화면");
    assert.equal(doc.getElementById("stage").dataset.mode, "match");
    assert.deepEqual([...cms.querySelectorAll(".m-exits .m-exit")].map((b) => b.textContent), ["나가기", "포기"], "도전 경기 [나가기] [포기]");
    assert.match(cms.querySelector(".mh-sub").textContent, /^도전 1단계 · 포제션 \d+\/8/, "헤더 줄 = 도전 단계 · 8 포제션");
    assert.equal(S.store.match.kind, "goal", "경계전 규칙 (연장 · 승부차기)");
    const saved1 = JSON.parse(window.localStorage.getItem(KEYS.challengeMatch));
    assert.deepEqual([saved1.version, saved1.teamId, saved1.stage, saved1.attempt], [1, "sample", 1, 1], "도전 경기 저장 KEYS.challengeMatch");
    assert.equal(saved1.match.seed, CH.challengeSeed("sample", 1, 1), "시드 = (팀, 단계, 도전 번호)");
    assert.equal(window.localStorage.getItem(KEYS.match), runMatchSave, "런 경기 저장 그대로");
    cms.querySelector(".skip-btn").click();
    const chOk = await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인"));
    assert.ok(chOk, "경기 결과 모달");
    assert.match(doc.querySelector("#modal-root h2").textContent, /^도전 1단계 결과$/);
    const finishedSave = window.localStorage.getItem(KEYS.challengeMatch);
    assert.ok(JSON.parse(finishedSave).match.finished, "끝난 경기도 [확인] 전까지는 저장 (새로고침하면 결과 모달로)");
    const r1 = S.match.getResult(S.store.match);
    chOk.click();
    assert.equal(chFinish, 1, "finishChallengeMatch 1회");
    // 연타 방지(match.js finishing): 첫 클릭이 버튼을 끄고 화면을 다시 그렸다 → 떼어진 그 버튼을 다시 켜고 눌러도 onFinish 는 다시 불리지 않는다
    assert.ok(chOk.disabled && !chOk.isConnected, "첫 클릭 → 버튼 꺼짐 · 모달 닫힘");
    chOk.disabled = false;
    chOk.click();
    assert.equal(chFinish, 1, "finishChallengeMatch 정확히 1회 (연타 방지)");
    const p1 = JSON.parse(window.localStorage.getItem(KEYS.challenge));
    const won1 = r1.winner === "home";
    assert.equal(p1.teams.sample.attempts["1"], 1, "도전 1회 기록");
    assert.equal(p1.teams.sample.wins["1"] ?? 0, won1 ? 1 : 0);
    assert.equal(p1.teams.sample.cleared, won1 ? 1 : 0);
    assert.equal(window.localStorage.getItem(KEYS.challengeMatch), null, "기록 뒤 도전 경기 저장 지움");
    assert.equal(S.store.screen, "challenge");
    assert.equal(S.store.match, null);
    const resEl = doc.querySelector("#modal-root .ch-result");
    assert.ok(resEl, "도전 결과 모달");
    assert.ok(resEl.classList.contains(won1 ? "win" : "loss"));
    const resBtns = [...resEl.querySelectorAll("button")].map((b) => b.textContent);
    assert.ok(resBtns.includes("도전 목록") && resBtns.includes("다시 도전"), `결과 버튼: ${resBtns}`);
    assert.equal(resBtns.some((t) => t.startsWith("다음 단계")), won1, "이기면 [다음 단계]");
    // 또 불러도(끝난 뒤) 다시 세지 않는다 · 이미 기록된 끝난 경기 저장본은 복원하지 않고 버린다
    origChFinish(r1);
    assert.equal(JSON.parse(window.localStorage.getItem(KEYS.challenge)).teams.sample.attempts["1"], 1, "두 번 세지 않음");
    window.localStorage.setItem(KEYS.challengeMatch, finishedSave);
    S.actions.openChallenge();
    assert.equal(S.store.screen, "challenge", "기록된 도전 번호의 저장본 → 복원 안 함");
    assert.equal(window.localStorage.getItem(KEYS.challengeMatch), null, "그 저장본은 지움");
    assert.equal(JSON.parse(window.localStorage.getItem(KEYS.challenge)).teams.sample.attempts["1"], 1);
    // 다음 단계(지면 다시 도전) → 몇 비트 진행 → [나가기] (기록 없이 시작 화면, 저장본 유지) → "새로고침"(메모리를 비우고 시작 화면 —
    // 부트는 늘 시작 화면) → [도전 모드 — 이어하기] → 같은 경기 → [포기] = 기권 패 기록
    const nextStage = won1 ? 2 : 1;
    const attemptsOf = (stage) => JSON.parse(window.localStorage.getItem(KEYS.challenge) || "null")?.teams?.sample?.attempts?.[String(stage)] ?? 0;
    const doneBefore = attemptsOf(nextStage);
    S.actions.startChallenge("sample", nextStage);
    assert.equal(S.store.screen, "challengeMatch");
    assert.equal(S.store.challenge.active.attempt, won1 ? 1 : 2, "도전 번호 = 끝난 도전 + 1");
    await until(() => (JSON.parse(window.localStorage.getItem(KEYS.challengeMatch) || "null")?.match?.events?.length ?? 0) >= 4, 8000);
    const mid = JSON.parse(window.localStorage.getItem(KEYS.challengeMatch));
    assert.ok(mid.match.events.length >= 4 && !mid.match.finished, "경기 중 저장");
    doc.querySelector(".match-screen .m-exit:not(.danger)").click(); // [나가기]
    assert.equal(S.store.screen, "start", "[나가기] → 시작 화면");
    assert.equal(S.store.match, null, "도전 경기 메모리 비움");
    assert.equal(S.store.challenge.active, null);
    const kept = JSON.parse(window.localStorage.getItem(KEYS.challengeMatch));
    assert.ok(kept && kept.attempt === mid.attempt && kept.match.events.length >= mid.match.events.length && !kept.match.finished, "[나가기] = 저장본 유지");
    assert.equal(attemptsOf(nextStage), doneBefore, "[나가기] 는 기록하지 않는다");
    assert.equal(window.localStorage.getItem(KEYS.run), runSave, "[나가기] 뒤 런 저장 그대로");
    assert.equal(window.localStorage.getItem(KEYS.match), runMatchSave, "[나가기] 뒤 런 경기 저장 그대로");
    // 시작 화면에서 런은 그대로 고를 수 있다 (도전 경기가 런을 막지 않는다)
    assert.ok([...doc.querySelectorAll(".start-menu button")].some((b) => b.textContent.includes("새 런 시작")), "시작 화면 [새 런 시작]");
    S.store.screen = "start";
    S.render();
    const resumeBtn = doc.querySelector(".start-menu .challenge-btn");
    assert.ok(resumeBtn?.classList.contains("resume") && resumeBtn.textContent.includes("이어하기"), "[도전 모드 — 이어하기]");
    assert.ok(resumeBtn.textContent.includes(`${kept.attempt}회차`), `이어할 회차 표시: ${resumeBtn.textContent}`);
    resumeBtn.click();
    assert.equal(S.store.screen, "challengeMatch", "진행 중인 도전 경기로 돌아온다");
    assert.equal(S.store.match.events.length, kept.match.events.length, "저장된 그 경기");
    assert.deepEqual([S.store.challenge.active.stage, S.store.challenge.active.attempt], [mid.stage, mid.attempt]);
    doc.querySelector(".match-screen .m-exit.danger").click(); // [포기] (confirm → true 폴리필)
    assert.equal(S.store.screen, "challenge", "[포기] → 도전 목록");
    const p2 = JSON.parse(window.localStorage.getItem(KEYS.challenge));
    assert.equal(p2.teams.sample.attempts[String(nextStage)], won1 ? 1 : 2, "포기 = 도전 1회");
    assert.equal(p2.teams.sample.lastResult.win, false, "포기 = 패배");
    assert.equal(p2.teams.sample.lastResult.forfeit, true, "포기 = 기권 표시");
    assert.match(doc.querySelector(".ch-team-sum .ch-sum-more").textContent, /기권 패/, "최근 결과 = 기권 패");
    assert.equal(window.localStorage.getItem(KEYS.challengeMatch), null);
    assert.equal(chFinish, 1, "포기는 결과 [확인] 경로가 아니다");
    // 진행 초기화 (confirm → true): 기록은 지우고 초기화 횟수만 남는다 → 다시 1단계 1회차는 초기화 전과 다른 시드
    doc.querySelector(".ch-reset").click();
    const p3 = JSON.parse(window.localStorage.getItem(KEYS.challenge)).teams.sample;
    assert.deepEqual([p3.cleared, p3.attempts, p3.wins, p3.lastResult, p3.resets], [0, {}, {}, null, 1], "진행 초기화");
    assert.deepEqual([...doc.querySelectorAll(".ch-ladder .ch-stage")].map((b) => b.dataset.state), ["open", ...Array(9).fill("locked")], "초기화 → 1단계만 열림");
    S.actions.startChallenge("sample", 1);
    assert.equal(S.store.challenge.active.attempt, 1, "초기화 뒤 1회차");
    assert.equal(S.store.match.seed, CH.challengeSeed("sample", 1, 1, 1), "시드에 초기화 횟수");
    assert.notEqual(S.store.match.seed, CH.challengeSeed("sample", 1, 1), "초기화 전 1회차와 다른 경기");
    // 결과 [확인] 때 진행 기록 저장 실패(localStorage) → 경기 화면 · 저장본 그대로 → 다시 [확인] → 한 번 기록
    doc.querySelector(".match-screen .skip-btn").click();
    const ok2 = await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인"));
    const SP = window.Storage.prototype;
    const realSetItem = SP.setItem;
    const realWarn = console.warn;
    SP.setItem = function (k, v) {
      if (k === KEYS.challenge) throw new Error("QuotaExceededError (테스트)");
      return realSetItem.call(this, k, v);
    };
    console.warn = () => {}; // store.lsSet 경고 (의도한 실패)
    try {
      ok2.click();
    } finally {
      SP.setItem = realSetItem;
      console.warn = realWarn;
    }
    assert.equal(S.store.screen, "challengeMatch", "기록 저장 실패 → 경기 화면 그대로");
    assert.ok(S.store.challenge.active && S.store.match?.finished, "도전 경기 상태 그대로");
    assert.ok(window.localStorage.getItem(KEYS.challengeMatch), "도전 경기 저장본 그대로");
    assert.equal(attemptsOf(1), 0, "기록 안 됨");
    assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 1, "저장 실패 토스트");
    doc.querySelectorAll("#toast-root .toast-error").forEach((el) => el.remove());
    const ok3 = await until(() => [...doc.querySelectorAll("#modal-root button")].find((b) => b.textContent === "확인" && !b.disabled));
    assert.ok(ok3 && ok3 !== ok2, "결과 모달 다시 — [확인] 으로 다시 시도");
    ok3.click();
    assert.equal(S.store.screen, "challenge");
    assert.equal(attemptsOf(1), 1, "다시 시도 → 한 번 기록");
    assert.equal(window.localStorage.getItem(KEYS.challengeMatch), null);
    assert.ok(doc.querySelector("#modal-root .ch-result"), "도전 결과 모달");
    S.actions.closeChallengeResult();
    // 고장 난 도전 경기(셋업 실패) → 경기 오류 화면 [처음으로](저장본 유지) · [도전 경기 버리기](저장본 지움, 기록 없음)
    const brokenSave = JSON.stringify({ version: 1, teamId: "sample", stage: 1, attempt: 2, seed: 1, team: { players: [] }, match: null });
    const brokenActive = () => ({ teamId: "sample", stage: 1, attempt: 2, resets: 1, seed: 1, team: { players: [] }, displayName: "1단계 · 고장" });
    const realErr = console.error;
    console.error = () => {}; // safe() 가 찍는 의도한 오류
    try {
      window.localStorage.setItem(KEYS.challengeMatch, brokenSave);
      S.store.challenge.active = brokenActive();
      S.store.match = null;
      S.store.screen = "challengeMatch";
      S.render();
      const errBtns = [...doc.querySelectorAll("#app .screen button")].map((b) => b.textContent);
      assert.deepEqual(errBtns, ["처음으로", "도전 경기 버리기"], `도전 경기 오류 화면 버튼: ${errBtns}`);
      [...doc.querySelectorAll("#app .screen button")].find((b) => b.textContent === "처음으로").click();
      assert.equal(S.store.screen, "start");
      assert.equal(S.store.challenge.active, null);
      assert.equal(window.localStorage.getItem(KEYS.challengeMatch), brokenSave, "[처음으로] = 저장본 유지");
      S.store.challenge.active = brokenActive();
      S.store.screen = "challengeMatch";
      S.render();
      [...doc.querySelectorAll("#app .screen button")].find((b) => b.textContent === "도전 경기 버리기").click();
      assert.equal(S.store.screen, "challenge", "[도전 경기 버리기] → 도전 목록");
      assert.equal(S.store.challenge.active, null);
      assert.equal(window.localStorage.getItem(KEYS.challengeMatch), null, "도전 경기 저장본 지움");
      assert.equal(attemptsOf(1), 1, "버리기는 기록하지 않는다");
    } finally {
      console.error = realErr;
    }
    doc.querySelectorAll("#toast-root .toast-error").forEach((el) => el.remove());
    // data/challenge.json 이 없으면(선택 파일 404) 저장본을 판단하지 않고 그대로 둔다 (지우지 않는다)
    const chData = S.store.data.challenge;
    try {
      window.localStorage.setItem(KEYS.challengeMatch, brokenSave);
      delete S.store.data.challenge;
      S.actions.resetToStart();
      S.actions.openChallenge();
      assert.equal(window.localStorage.getItem(KEYS.challengeMatch), brokenSave, "도전 데이터 없음 → 저장본 그대로");
    } finally {
      S.store.data.challenge = chData;
      window.localStorage.removeItem(KEYS.challengeMatch);
    }
    doc.querySelectorAll("#toast-root .toast-error").forEach((el) => el.remove()); // "도전 모드 데이터가 없습니다" (의도한 안내)
    S.actions.openChallenge();
    assert.equal(S.store.screen, "challenge");
    // 런 상태 · 런 저장은 그대로
    assert.equal(window.localStorage.getItem(KEYS.run), runSave, "런 저장 그대로");
    assert.equal(window.localStorage.getItem(KEYS.match), runMatchSave, "런 경기 저장 그대로");
    assert.equal(JSON.stringify(S.store.run), runMem, "store.run 그대로");
    S.actions.finishChallengeMatch = origChFinish;
    [...doc.querySelectorAll(".ch-head button")].find((b) => b.textContent === "처음으로").click();
    assert.equal(S.store.screen, "start");
    ui.auto = false;
  }

  // ---- 전체 걷기 (LESSON_PROTO_PLAN §12 I1): 새 런(역습형) → 15주를 감독 AI 추천대로 앱 actions 로 (화면을 그리며) → 결과 →
  // [팀 등록] → 시작 화면 등록 팀 · 도전 모드 팀 목록에 레슨 팀 (policy 포함) → 그 팀으로 도전 경기를 만들 수 있다 ----
  {
    const data = S.store.data;
    const cfg = data.config;
    const M = S.manager;
    const teamsBefore = JSON.parse(window.localStorage.getItem(KEYS.teams) || "[]");
    ui.auto = false;
    S.actions.startRun({
      squad: cfg.defaultSquad.slots, formation: cfg.defaultSquad.formation, supportIds: cfg.defaultSupports, tactics: cfg.defaultTactics,
      policy: "counter", seed: "ui-full",
    });
    assert.equal(S.store.run.policy, "counter");
    // phase → 그 화면 (레슨 결과는 레슨 화면 위 모달, 이벤트 · 유물은 주 화면 위 모달)
    const SCREEN = {
      week: ".screen.og.week-screen", lesson: ".lesson-screen", reward: "#modal-root .reward-modal", consult: ".consult-screen",
      prep: ".prep-screen", match: ".match-screen", relic: "#modal-root .relic-card", route: ".route-screen", event: "#modal-root .choice-btn",
      finished: ".result-screen",
    };
    const seen = {};
    const shapesPlayed = new Set(); // L40 (§16.10): 완주 중 낸 고유 카드 모양
    let teachSteps = 0; // §18.6: 완주 중 보상 모달 코치 수업 칸을 화면 버튼으로 지난 수
    let prev = null;
    let steps = 0;
    for (; steps < 4000 && S.store.run.phase !== "finished"; steps++) {
      const st = S.store.run;
      const phase = st.phase;
      if (phase !== prev) {
        assert.ok(SCREEN[phase] && doc.querySelector(SCREEN[phase]), `${phase} 화면 (시즌 ${st.season} ${st.turn}주)`);
        assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, `에러 토스트 없음 (${phase}, 시즌 ${st.season} ${st.turn}주)`);
        seen[phase] = (seen[phase] || 0) + 1;
        prev = phase;
      }
      if (phase === "week") {
        const { reason, ...a } = M.recommendWeek(st, data);
        S.actions.weekAction(a);
      } else if (phase === "lesson") {
        // 레슨 화면 전용 호출 (저장만 — 실제 화면은 연출 뒤 render). 레슨이 끝나면 직접 render
        const a = M.recommendCard(st, data);
        if (a.kind === "play") { const hc = S.run.getLessonView(st, data).hand.find((c) => c.uid === a.uid); if (hc?.shape) shapesPlayed.add(hc.shape.kind + (hc.shape.onlyZones ? ":cross" : "")); }
        const r = a.kind === "play" ? S.actions.lessonCall("playCard", { uid: a.uid, at: a.at, playerId: a.playerId, zone: a.zone })
          : a.kind === "bench" ? S.actions.lessonCall("benchPlayer", { playerId: a.playerId, on: true })
            : S.actions.lessonCall("endLessonTurn");
        assert.ok(r !== undefined, `레슨 호출 ${a.kind}`);
        if (S.store.run.phase !== "lesson") S.render();
      } else if (phase === "reward") {
        // 코치 수업 (§18.6): 보상 모달 수업 칸 버튼 — 감독 추천 선수 칩 → [가르치기], 추천이 "받지 않기" 면 [배우지 않기]
        if (S.run.getRewardView(st, data).teach.cur) {
          const tr = M.recommendTeach(st, data);
          const nTeach = st.pendingReward.teach.filter((t) => t.result === null).length;
          if (tr.playerId) {
            doc.querySelector(`#modal-root .rw-teach-pl[data-pid="${tr.playerId}"]`).click();
            doc.querySelector("#modal-root .rw-teach-ok").click();
          } else doc.querySelector("#modal-root .rw-teach-skip").click();
          assert.equal(S.store.run.pendingReward.teach.filter((t) => t.result === null).length, nTeach - 1, "수업 1개 처리 (화면 버튼)");
          teachSteps += 1;
          continue;
        }
        S.actions.resolveReward(M.recommendReward(st, data));
      } else if (phase === "consult") {
        const a = M.recommendConsult(st, data);
        if (a.op === "end") S.actions.endConsult();
        else S.actions.consultAction(a);
      } else if (phase === "prep") {
        S.actions.confirmPrep(M.recommendPrep(st, data));
      } else if (phase === "match") {
        assert.equal(S.store.match?.seed, st.pendingMatch.seed, "경기 화면이 그 경기를 만들었다");
        S.actions.finishMatch(playMatch(S.run.getMatchSetup(st, data)));
      } else if (phase === "relic") {
        S.actions.chooseRelic(st.pendingRelicChoices?.[0] ?? null);
      } else if (phase === "route") {
        S.actions.chooseRoute(st.pendingRoutes[(st.season - 1) % st.pendingRoutes.length]);
      } else if (phase === "event") {
        S.actions.resolveEvent(0);
      } else {
        assert.fail(`알 수 없는 phase ${phase}`);
      }
      assert.notEqual(S.store.run.phase, "flow", "내부 phase 가 저장되지 않는다");
    }
    const fin = S.store.run;
    assert.equal(fin.phase, "finished", `15주 완주 (${steps} 단계)`);
    assert.equal(fin.season, 3);
    assert.equal(fin.record.goalMatches.length, 3, "경계전 3회");
    assert.ok(fin.record.lessons.length >= 1 && fin.record.lessons.length <= 9, `레슨 ${fin.record.lessons.length}회 (최대 9)`);
    for (const ph of ["week", "lesson", "reward", "prep", "match", "route"]) assert.ok(seen[ph] > 0, `거친 화면: ${ph}`);
    const cutinsRun = fin.record.lessons.reduce((a, l) => a + (Number(l.cutins) || 0), 0);
    assert.ok(cutinsRun >= 1, `완주 중 코치 컷인 ${cutinsRun}번 (§15.9)`);
    assert.ok(teachSteps >= 1, `완주 중 코치 수업 ${teachSteps}번 (화면 버튼, §18.6)`);
    // 기본 편성의 고유 카드 7장 = 모양 5종 + 크로스 (가로지르기는 미르카 편성 — manager.test 15주 완주)
    for (const k of ["link", "pick", "pick:cross", "ownerCircle", "ownerZone", "move"]) assert.ok(shapesPlayed.has(k), `완주 중 고유 카드 모양 ${k} (낸 모양: ${[...shapesPlayed].join(" · ")})`);
    assert.equal(JSON.parse(window.localStorage.getItem(KEYS.run)).phase, "finished", "끝난 런 저장");
    // 결과 화면 → [팀 등록]
    assert.ok(doc.querySelector(".result-screen .result-hero"), "결과 화면");
    assert.ok(![...doc.querySelectorAll(".player-result .pr-who")].some((el) => el.textContent.includes("훈련")), "레슨 런 결과: 훈련 횟수 표시 없음");
    const regBtn = [...doc.querySelectorAll(".result-actions button")].find((b) => /^팀 등록$/.test(b.textContent));
    assert.ok(regBtn && !regBtn.disabled, "[팀 등록]");
    regBtn.click();
    const teams = JSON.parse(window.localStorage.getItem(KEYS.teams) || "[]");
    assert.equal(teams.length, teamsBefore.length + 1, "등록 팀 +1");
    const team = teams[0];
    assert.deepEqual([team.seed, team.policy, team.createdTurnIndex, team.players.length], ["ui-full", "counter", 14, 7], "레슨 팀 등록 (policy · createdTurnIndex 14)");
    assert.ok(team.grade && team.grade !== "-", `등급 ${team.grade}`);
    assert.ok([...doc.querySelectorAll(".result-actions button")].some((b) => b.disabled && /팀 등록 완료/.test(b.textContent)), "등록 뒤 [팀 등록 완료]");
    assert.equal(window.localStorage.getItem("soccer.teams") !== null && JSON.parse(window.localStorage.getItem("soccer.teams")).length, 1, "본편 등록 팀 저장은 그대로");
    // 시작 화면 등록 팀 · 도전 모드 팀 목록
    S.actions.resetToStart();
    assert.ok([...doc.querySelectorAll(".start-teams .team-row")].some((el) => el.textContent.includes("ui-full")), "시작 화면 등록 팀에 레슨 팀");
    S.store.challenge.teamId = null;
    S.store.challenge.stage = null;
    S.actions.openChallenge();
    assert.equal(S.store.screen, "challenge");
    const tid = S.challenge.teamIdOf(team);
    const row = doc.querySelector(`.ch-team[data-team="${tid}"]`);
    assert.ok(row && !row.classList.contains("sample"), "도전 모드 팀 목록에 레슨 팀");
    assert.ok(row.classList.contains("sel"), "기본 선택 = 가장 최근 등록 팀");
    assert.equal(doc.querySelectorAll(".ch-team-sum .ch-pl").length, 7, "고른 팀 선수 7명");
    const chSetup = S.challenge.challengeSetup(team, 1, 1, data);
    const chMs = S.match.createMatch({ data, seed: chSetup.seed, home: chSetup.home, away: chSetup.away, possessions: chSetup.possessions, kind: chSetup.kind });
    assert.ok(chMs && chMs.home.players.length === 7, "레슨 팀으로 도전 경기를 만들 수 있다");
    [...doc.querySelectorAll(".ch-head button")].find((b) => b.textContent === "처음으로").click();
    assert.equal(S.store.screen, "start");
  }

  assert.equal(doc.querySelectorAll("#toast-root .toast-error").length, 0, "에러 토스트 없음");
  assert.equal(window.localStorage.getItem("soccer.run"), MAIN_RUN, "본편 런 저장은 끝까지 그대로");
  assert.deepEqual(errors, []);
});
