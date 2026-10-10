#!/usr/bin/env node
// tools/hex_shot.mjs — 육각 경기 화면 (H1) 스크린샷 · 연기 시험 도구 (docs/HEX_AUTOBATTLE_PLAN.md §6.5). npm test 에는 넣지 않는다.
//
//   node tools/hex_shot.mjs <outDir> [--gpu] [--frames 4] [--gap 1500] [--sizes 1280x720,915x412] [--goal] [--practice] [--ult] [--moments] [--seed h2-7] [--hunt-ms 90000]
//
// 1) 내장 정적 서버 (tools/shot.mjs startServer) 로 프로젝트 루트를 띄운다.
// 2) puppeteer-core + 로컬 Chrome (shot.mjs findBrowser) 을 headless 로 띄운다. --gpu 가 없으면 소프트웨어 WebGL
//    (--use-angle=swiftshader --enable-unsafe-swiftshader — 기기 GPU 와 상관없이 같은 그림). 프로필은 os.tmpdir() 아래 임시 폴더 (끝나면 지운다).
// 3) 크기마다 새 브라우저 문맥으로 /index.html?hex=1&auto=1 을 연다 (915×412 는 휴대폰처럼 isMobile · hasTouch · DPR 2.625).
//    [새 런 시작] → [기본 편성으로 시작] → window.__soccer 의 manager.autoStep 으로 친선전을 고를 수 있는 주까지 → actions.weekAction(friendly)
//    → .hex-screen canvas 와 window.__soccer.hexView.renderer === 'webgl' 을 기다린다.
//    --practice: 런 대신 시작 화면 [⚽ 연습 경기] (회상 바로 아래인지 검사) → 기본 선수단 vs 거울 사본 (실루엔 · 아델린 · 네리아가 양쪽에).
//      스프라이트 (실루엔 시트 10장 · 아델린 · 네리아 시트 9장 — dribble 없음 → run) 가 다 올라올 때까지 기다리고 양쪽 셋이 움직이는 스프라이트로
//      그려지는지 본다. 텍스처 수 · 바이트 (view.stats) 를 요약에 적는다 (HEX_AUTOBATTLE_PLAN §5.4 결정 15 — 휴대폰 예산).
//      경기 시드는 --seed (기본 h2-7 — 4턴 원정 실루엔 태클 실패 · 67턴 홈 실루엔 골: 동작이 일찍 다 나온다, 'random' = 화면이 고른 시드).
//      연습 경기는 동작 사냥 (아래) 을 먼저 하고 그다음 프레임 N 장 · 골 장면을 찍는다.
// 4) 프레임 N 장을 ~gap ms 간격으로 찍는다 (<outDir>/<size>-<n>.png). 장마다 hexView 디버그 (turn · cam · score) 를 적고
//    시계가 흐르는지 (turn 증가) · 캔버스 크기 = .hx-pitch · HUD 요소가 화면 안에 보이는지 검사한다.
//    --goal: 4배속으로 첫 골까지 돌려 "골!" 배너가 뜬 뒤 (필살 슛 컷인이 있으면 그 뒤) 골 장면을 몇 장 더 찍는다 (<size>-goal-<n>.png).
//    배너 검사: 배너 (.hx-banner) 에 골 · 단계 · 승부차기 꾸밈 클래스를 잠깐 붙여 크기 · 자리 · 배경을 잰다 — 화면 안 · 경기장보다 작게 · 배경 없음
//    (전역 클래스와 겹쳐 배너가 큰 상자로 바뀌는 일을 잡는다 — 예: 예전 'stage' 꾸밈 = base.css .stage 1280×720).
//    --practice 동작 사냥: 움직이는 스프라이트 캐릭터 (실루엔 · 아델린 · 네리아) 의 동작 (idle · run · dribble · pass · kick · tackle · fall ·
//      celebrate · header · block) 마다 처음 보이는 순간 (한 번 동작은 재생이 40 % 넘게 간 칸) 에 화면 루프 시계를 멈추고 (rAF 가상 시간 배율 0) 찍는다
//      → 실루엔 <size>-act-<동작>.png · 아델린 <size>-act-adeline-<동작>.png · 네리아 <size>-act-neria-<동작>.png (+ 그 선수를 카메라 좌표로 잘라 확대한 -zoom.png).
//      아델린 · 네리아의 dribble 은 시트가 없어 run 으로 대신 그린다 (ANIM_FALLBACK) — frame 동작 dribble 인데 run 이 재생 중인 칸을 'dribble' 로 찍는다.
//      실루엔 기본 동작 (HUNT_NEED) 을 못 보면 NOTE, 아델린 · 네리아 동작은 찍은 것 · 못 본 것을 적는다 (실패 아님 — 경기마다 다르다).
//      사냥은 정한 턴 (ACT_TURN_CAP — 뒤 프레임 · 골 · ⏭ 가 정규 시간 안에 되게) 에서 끝난다. --ult 에서는 필살기 흐름 앞에 짧게 (ult 턴 상한) 한다.
//    --ult (H3 — 연습 경기로 간다, 동작 사냥 대신): 사람 쪽 (홈) 게이지를 window.__soccer (store.practiceMatch.live) 로 가득 채우고
//      필살기 띠 (.hx-ult) 를 찍는다 (<size>-ult-bar.png · 띠만 확대 -ult-bar-zoom.png): 버튼 7개 · 화면 안 · 이름 안 잘림 · 칸 크기 (CSS px).
//      시계를 멈추고 준비된 버튼을 다 눌러 "예약" 을 찍는다 (-ult-armed.png). 그다음 컷인 사냥 (1배속 · 가상 시간 2배): 홈 · 원정 게이지를
//      계속 채우고 준비 버튼을 계속 누르며, 컷인 카드 CSS 애니메이션이 30 % 넘게 간 순간 시계 · 카드 애니메이션을 멈추고 찍는다 →
//      -cut-own.png (우리) · -cut-opp.png (상대 — "상대" 글) · -cut-combo.png (합체기 이름 카드 — 나면) · -cut-rev.png (역컷인 — 나면).
//      우리 · 상대 컷인은 꼭 봐야 하고 (못 보면 실패), 합체기 · 역컷인은 못 보면 NOTE.
//    --practice 말풍선 사냥 (동작 사냥 · --ult 뒤): 감정 말풍선 (.hx-emote — 공을 뺏은 · 뺏긴 선수 머리 위) 이 팝을 끝낸 순간 (애니메이션 25 ~ 60 %)
//      시계 · 말풍선 애니메이션을 멈추고 찍는다 → <size>-emote-steal.png (태클 "!!") · -emote-win.png ("!") · -emote-lose.png ("💦"), 말풍선 둘레 확대 -zoom.
//      검사: 경기장 (.hx-pitch) 안 · HUD (점수 머리 · 시계 · 필살기 띠 · 컨트롤 · 나가기) 와 안 겹침 · 글 있음. 이름표와 겹치면 NOTE (넓이 %).
//      steal · lose 는 꼭 봐야 하고 (태클 · 가로채기는 흔하다), "!" 하나 (가로채기 · 선방 · 공중볼 · 흘러나온 공) 는 못 보면 NOTE.
//    --moments (H3.5 결정의 순간 — 연습 경기로 간다, 동작 · 말풍선 사냥 대신): [결정 ON] (기본) 으로 돌며 장면이 열릴 때마다 카메라가 붙기를 기다려 찍는다
//      → <size>-mom-<종류>.png (shot · danger · cross · counter · ult · combo) + 카드 띠 확대 -strip.png. 띠 검사: 카드 2 ~ 4장 · 화면 안 · 높이 ≥ 44 CSS px ·
//      큰 % 글자 · 이름 · 둘째 줄 잘림 (NOTE) · '자동' 한 장 · 시계가 서 있는지. 고르기: 슛 찬스 = 중거리 슛 (없으면 슛), 크로스 = 크로스, 역습 = 롱볼 · 스루,
//      수비 위기 = 패스길 막기 → 고른 뒤 그 턴 그림을 찍는다 (-mom-<종류>-go.png). 그 밖 · 두 번째부터는 '자동'.
//      다음 단계: 우리 게이지를 채워 ★ 카드를 기다려 고르고 그 컷인 카드를 찍는다 (-mom-star.png · -mom-star-cut.png). 마지막에 [⏸ 개입] 한 번 (-mom-manual.png)
//      → [결정 OFF] 로 끄고 (멈추지 않는지) 뒤 프레임 · ⏭ · 결과. 경기가 2골로 끝나면 새 시드로 다시 (--seed-N). 못 본 종류는 NOTE.
//      스크린샷 도구의 다른 흐름 (--moments 없음) 은 ?moments=0 ([결정 OFF] — 예전처럼 멈추지 않고 흐른다).
// 5) [⏭] → 결과 모달 캡처 (<size>-result.png) → [확인] → 런이 match phase 를 떠났는지 · store.hexMatch null · KEYS.hexMatch 비었는지 · 캔버스가 사라졌는지.
//    --practice: [다시 하기] → 새 경기 (시드가 바뀌고 turn 0) → [⏭] → [확인] → 시작 화면 · store.practiceMatch null · 런 없음 · KEYS.hexMatch 비었는지 · 캔버스 정리.
// 6) pageerror · console.error · 실패한 요청 · 400 이상 응답을 모아 요약을 찍는다. 하나라도 있거나 검사가 실패하면 exit 1.
//
// Chrome 경로: CHROME_PATH 환경변수 → 기본 설치 경로 (shot.mjs findBrowser). 없으면 안내 후 exit 0.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startServer, findBrowser } from "./shot.mjs";
import { KEYS } from "../js/ui/store.js";

const PHONE = { deviceScaleFactor: 2.625, isMobile: true, hasTouch: true };

/* ------------------------------------------------------------------ */
/* 인자                                                                  */
/* ------------------------------------------------------------------ */

function usage() {
  return [
    "usage: node tools/hex_shot.mjs <outDir> [options]",
    "  --gpu              하드웨어 WebGL (기본: SwiftShader 소프트웨어 WebGL)",
    "  --frames N         경기 프레임 캡처 수 (기본 4)",
    "  --gap MS           프레임 간격 (기본 1500)",
    "  --sizes WxH,…      뷰포트 (기본 1280x720,915x412 — 915×412 는 휴대폰: isMobile · hasTouch · DPR 2.625)",
    "  --goal             첫 골까지 4배속으로 돌려 골 장면도 찍는다 (<size>-goal-<n>.png)",
    "  --practice         런 대신 시작 화면 [⚽ 연습 경기] (실루엔 · 아델린 · 네리아가 양쪽) — 동작마다 멈춰 찍기 (<size>-act-<동작>.png)",
    "  --ult              연습 경기에서 필살기 띠 · 예약 · 컷인 (우리 · 상대 · 합체기 · 역컷인) 을 찍는다 (<size>-ult-*.png · -cut-*.png)",
    "  --moments          연습 경기에서 결정의 순간 카드 띠 (종류마다) · 고른 수 · ★ 컷인 · ⏸ 개입을 찍는다 (<size>-mom-*.png)",
    "  --seed S           --practice 경기 시드 (기본 h2-7, random = 화면이 고른 시드)",
    "  --hunt-ms MS       --practice 동작 사냥 최대 시간 (화면 시계 기준, 기본 90000)",
    "  환경변수 CHROME_PATH 로 브라우저 실행 파일 지정",
  ].join("\n");
}

export function parseArgs(argv) {
  const o = { outDir: null, gpu: false, frames: 4, gap: 1500, sizes: ["1280x720", "915x412"], goal: false, practice: false, ult: false, moments: false, seed: "h2-7", huntMs: 90000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v == null) throw new Error(`${a} 에 값이 없습니다`);
      return v;
    };
    if (a === "--gpu") o.gpu = true;
    else if (a === "--goal") o.goal = true;
    else if (a === "--practice") o.practice = true;
    else if (a === "--ult") { o.ult = true; o.practice = true; }
    else if (a === "--moments") { o.moments = true; o.practice = true; }
    else if (a === "--seed") o.seed = val();
    else if (a === "--hunt-ms") o.huntMs = Math.max(1000, Math.round(Number(val())) || 90000);
    else if (a === "--frames") o.frames = Math.max(1, Math.round(Number(val())) || 4);
    else if (a === "--gap") o.gap = Math.max(100, Math.round(Number(val())) || 1500);
    else if (a === "--sizes") o.sizes = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) throw new Error(`알 수 없는 옵션: ${a}`);
    else if (!o.outDir) o.outDir = a;
    else throw new Error(`인자가 너무 많습니다: ${a}`);
  }
  for (const s of o.sizes) if (!/^\d+x\d+$/.test(s)) throw new Error(`--sizes 형식: WxH (받은 값 ${s})`);
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* 페이지 쪽                                                              */
/* ------------------------------------------------------------------ */

async function clickText(page, text, root = "") {
  return page.evaluate((t, r) => {
    const b = [...document.querySelectorAll(`${r} button`)].find((x) => (x.textContent || "").trim().includes(t) && !x.disabled);
    if (!b) return false;
    b.click();
    return true;
  }, text, root);
}

/** 친선전 run 경기까지 (ui.smoke 와 같은 길: 자유 주까지 autoStep → weekAction friendly) */
async function enterFriendly(page) {
  return page.evaluate(() => {
    const S = window.__soccer;
    const playMatch = (setup) => {
      const ms0 = S.match.createMatch({ data: S.store.data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind });
      S.match.simulateAuto(ms0, S.store.data);
      return S.match.getResult(ms0);
    };
    const open = (st) => st.phase === "week" && st.weekOffer?.kind === "free" && st.weekOffer.actions.includes("friendly");
    let n = 0;
    for (; n < 3000 && !open(S.store.run) && S.store.run.phase !== "finished"; n++) S.manager.autoStep(S.store.run, S.store.data, { playMatch });
    if (!open(S.store.run)) return { ok: false, phase: S.store.run.phase, n };
    S.render();
    S.actions.weekAction({ type: "friendly" });
    return { ok: true, n, phase: S.store.run.phase };
  });
}

/* ---- --practice ---- */

/** 연습 경기 양쪽의 움직이는 스프라이트: 캐릭터 → 시트 수 (아델린 · 네리아는 dribble 없음 → run 으로 대신). 나엘리스 (정지 그림) 는 기본 선수단에 없다 */
const ANIM_CHARS = { ch_elf_playmaker: 10, ch_human_captain: 9, ch_spirit_keeper: 9 };
/** 동작 사냥: 실루엔이 꼭 볼 동작 · 보이면 찍는 동작 */
const HUNT_NEED = ["run", "dribble", "pass", "kick", "tackle", "fall", "celebrate"];
const HUNT_EXTRA = ["header", "block"];
/** 동작 사냥 캐릭터: 파일 이름 앞붙이 (실루엔은 예전 이름 그대로 '') · 이름 · 찾을 동작 (아델린 · 네리아는 idle 도 — 시트가 새것이라 다 본다) */
const HUNT_CHARS = {
  ch_elf_playmaker: { tag: "", name: "실루엔", acts: [...HUNT_NEED, ...HUNT_EXTRA] },
  ch_human_captain: { tag: "adeline-", name: "아델린", acts: ["idle", ...HUNT_NEED, ...HUNT_EXTRA] },
  ch_spirit_keeper: { tag: "neria-", name: "네리아", acts: ["idle", ...HUNT_NEED, ...HUNT_EXTRA] },
};
/** 동작 사냥을 끝내는 턴 (보통 · --ult 는 필살기 흐름 앞이라 짧게) */
const ACT_TURN_CAP = { plain: 140, ult: 60 };
/** 가상 시간 배율 — '멈춤' (0 이 아니라 아주 작게: 화면 루프 dt > 0 이라 카메라도 그 자리) */
const FREEZE = 1e-6;
/** 동작 사냥 중 가상 시간 배율 (1배속 경기를 두 배 빨리 — 화면 루프 dt 상한 100 ms 안) */
const HUNT_SCALE = 2;

/** 디버그 값 → 움직이는 스프라이트 선수 동작 한 줄 ("home run, away idle") */
function actLine(d) {
  const s = (d?.sprites || []).filter((x) => x.kind === "anim").map((x) => `${x.key.split(":")[0]} ${x.act}`).join(", ");
  return s || undefined;
}

/**
 * rAF 가상 시간 (문서마다 처음에): window.__hexClock.scale 배로 시간이 흐른다 (1 = 그대로).
 * 동작 사냥 window.__hunt = { on, want: { charId: [동작] }, seen: {}, hit: null } 이 켜져 있으면 매 프레임 (화면 루프 뒤) hexView.sprites 를 보고
 * 사냥 캐릭터 (want = { charId: [동작] }) 가 아직 못 본 동작 (seen 키 'charId:동작') 을 충분히 (반복 150 ms · 한 번 동작 40 % · 넘어짐 · 세리머니 60 %) 재생 중이고 화면 안이면 시간을 멈추고 hit 에 적는다.
 */
function installClock(page) {
  return page.evaluateOnNewDocument((freeze) => {
    const real = window.requestAnimationFrame.bind(window);
    const clock = { scale: 1, virt: 0, last: null };
    window.__hexClock = clock;
    const check = () => {
      const hu = window.__hunt;
      if (!hu || hu.hit || !hu.on) return;
      const d = window.__soccer?.hexView;
      const list = d?.sprites;
      if (!list || d.finished) return;
      const cv = document.querySelector(".hex-screen .hx-pitch canvas");
      if (!cv) return;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      for (const sp of list) {
        // 이름표 = 재생 중 동작, 단 frame 은 dribble 인데 시트가 없어 run 을 그리는 칸 (아델린 · 네리아) 은 'dribble'
        const label = sp.want === "dribble" && sp.act === "run" ? "dribble" : sp.act;
        if (sp.kind !== "anim" || !hu.want[sp.charId]?.includes(label) || hu.seen[`${sp.charId}:${label}`]) continue;
        const hold = sp.act === "fall" || sp.act === "celebrate";
        const loop = sp.act === "run" || sp.act === "dribble" || sp.act === "idle";
        const ready = loop ? sp.t >= 150 : sp.dur > 0 && sp.t / sp.dur >= (hold ? 0.6 : 0.4);
        const b = sp.box;
        const inView = b && b[2] > 4 && b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= W && b[1] + b[3] <= H;
        if (!ready || !inView) continue;
        clock.scale = freeze;
        hu.hit = { ...sp, label, turn: d.turn, speed: d.speed, score: d.score, W, H };
        return;
      }
    };
    // 컷인 사냥 (--ult): window.__cutHunt = { on, want: [종류], seen: {}, hit: null } — 컷인 카드의 CSS 애니메이션이 30 % 넘게 가면
    //   시계를 멈추고 카드 애니메이션도 멈춘 뒤 hit 에 적는다. 종류 = own (우리 카드) · opp (상대 카드) · combo (합체기 이름 카드) · rev (역컷인)
    const cutCheck = () => {
      const ch = window.__cutHunt;
      if (!ch || !ch.on || ch.hit) return;
      const el = document.querySelector(".hex-screen .m-cutin.show .cut");
      if (!el) return;
      const human = window.__soccer?.hexView?.ult?.side || "home";
      const kind = el.classList.contains("cut-rev") ? "rev" : el.classList.contains("cut-name") ? "combo"
        : el.classList.contains("part-1") || el.classList.contains("part-2") ? null : el.classList.contains(`side-${human}`) ? "own" : "opp";
      if (!kind || ch.seen[kind] || !ch.want.includes(kind)) return;
      const a = (el.getAnimations ? el.getAnimations() : [])[0];
      const dur = Number(a?.effect?.getComputedTiming?.().duration) || 0;
      if (!(dur > 0 && Number(a.currentTime) >= dur * 0.3)) return;
      clock.scale = freeze;
      for (const x of document.querySelector(".hex-screen .m-cutin").getAnimations({ subtree: true })) x.pause();
      ch.hit = { kind, cls: el.className, small: (el.querySelector(".cut-txt small")?.textContent || "").trim(), text: (el.querySelector(".cut-txt")?.textContent || "").replace(/\s+/g, " ").trim(), dur: Math.round(dur), ult: window.__soccer?.hexView?.ult };
    };
    // 말풍선 사냥: window.__emoteHunt = { on, want: [종류], seen: {}, hit: null } — 보이는 말풍선의 팝이 끝난 (애니메이션 25 %) 것 중
    //   아직 못 본 종류 (steal "!!" · win "!" · lose "💦") 가 있으면 시계 · 말풍선 애니메이션을 멈추고 hit 에 자리 (화면 px) 를 적는다
    const emoteCheck = () => {
      const eh = window.__emoteHunt;
      if (!eh || !eh.on || eh.hit) return;
      const els = [...document.querySelectorAll(".hex-screen .hx-field > .hx-emote")].filter((el) => !el.hidden && !el.classList.contains("hx-paused"));
      if (!els.length) return;
      const kindOf = (el) => (el.classList.contains("hx-emote-steal") ? "steal" : el.classList.contains("hx-emote-win") ? "win" : "lose");
      const popped = (el) => {
        const a = (el.querySelector(".hx-emote-b")?.getAnimations?.() || [])[0];
        if (!a) return true; // 움직임 줄이기 — 애니메이션 없음
        const dur = Number(a.effect?.getComputedTiming?.().duration) || 0;
        return dur > 0 && Number(a.currentTime) >= dur * 0.25 && Number(a.currentTime) <= dur * 0.6; // 팝 끝 ~ 페이드 전
      };
      if (!els.some((el) => popped(el) && eh.want.includes(kindOf(el)) && !eh.seen[kindOf(el)])) return;
      clock.scale = freeze;
      for (const el of els) for (const a of el.getAnimations({ subtree: true })) a.pause();
      const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
      const q = (sel) => rect(document.querySelector(sel));
      const name = document.querySelector(".hex-screen .hx-name:not([hidden])");
      eh.hit = {
        kinds: [...new Set(els.filter(popped).map(kindOf))],
        list: els.map((el) => ({ kind: kindOf(el), key: el.dataset.key, text: el.textContent, rect: rect(el.querySelector(".hx-emote-b")), font: getComputedStyle(el.querySelector(".hx-emote-b")).fontSize })),
        name: name ? { text: name.textContent, rect: rect(name) } : null,
        hud: { mh: q(".hex-screen .mh"), clock: q(".hex-screen .hx-clock"), ult: q(".hex-screen .hx-ult"), ctl: q(".hex-screen .hx-ctl"), exits: q(".hex-screen .m-exits") },
        pitch: q(".hex-screen .hx-pitch"), turn: window.__soccer?.hexView?.turn, emotes: window.__soccer?.hexView?.emotes,
      };
    };
    window.requestAnimationFrame = (cb) => real((t) => {
      if (clock.last == null) clock.last = t;
      clock.virt += (t - clock.last) * clock.scale;
      clock.last = t;
      cb(clock.virt);
      try { check(); } catch (_) { /* 디버그 값이 아직 없다 */ }
      try { cutCheck(); } catch (_) { /* 화면이 아직 없다 */ }
      try { emoteCheck(); } catch (_) { /* 화면이 아직 없다 */ }
    });
  }, FREEZE);
}

/** localStorage 전부 (키 순서대로) — 연습 경기가 아무것도 쓰지 않았는지 비교 */
const storageDump = (page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));

/** 시작 화면 [⚽ 연습 경기] → 육각 경기 · 스프라이트가 다 올라올 때까지 */
async function enterPractice(page, out, pass, fail, seed) {
  await page.waitForFunction(() => document.querySelector(".practice-btn"), { timeout: 15000 });
  const btn = await page.evaluate(() => {
    const b = document.querySelector(".practice-btn");
    const prev = b.previousElementSibling;
    const hasRec = !!document.querySelector(".recollection-btn");
    return {
      text: (b.textContent || "").trim(),
      prev: prev ? prev.className : null,
      ok: hasRec ? !!prev?.classList.contains("recollection-btn") : !!prev?.classList.contains("challenge-btn"),
      hasRec,
    };
  });
  if (btn.ok && btn.text.includes("연습 경기")) pass(`[⚽ 연습 경기] 버튼 = ${btn.hasRec ? "회상" : "도전 모드"} 바로 아래 (${btn.text})`);
  else fail(`연습 경기 버튼 자리 · 글자: ${JSON.stringify(btn)}`);
  out.storageBefore = await storageDump(page);
  await page.evaluate(() => document.querySelector(".practice-btn").click());
  await page.waitForFunction(() => window.__soccer?.store?.screen === "practice" && document.querySelector(".hex-screen"), { timeout: 8000 });
  // 정한 시드로 다시 (같은 경기 = 같은 장면 — 화면 시드는 연습마다 새로라서)
  if (seed && seed !== "random") await page.evaluate((sd) => { const S = window.__soccer; S.store.practiceSeed = sd; S.store.practiceMatch = null; S.render(); }, seed);
  await page.waitForFunction(() => document.querySelector(".hex-screen canvas") && window.__soccer.hexView?.renderer && window.__soccer.hexView.renderer !== "pending", { timeout: 15000 });
  const hud = await page.evaluate(() => ({
    sub: document.querySelector(".hex-screen .mh-sub")?.textContent || "",
    home: document.querySelector(".hex-screen .mh-team.home .nm")?.textContent || "",
    away: document.querySelector(".hex-screen .mh-team.away .nm")?.textContent || "",
    exits: [...document.querySelectorAll(".hex-screen .m-exits button")].map((b) => b.textContent.trim()),
    seed: window.__soccer.store.practiceSeed,
  }));
  out.practice = { seed: hud.seed };
  if (hud.sub.includes("연습 경기") && hud.away.includes("연습 상대") && hud.exits.includes("나가기")) pass(`연습 경기 HUD (${hud.home} vs ${hud.away} · ${hud.sub.trim()} · [${hud.exits.join("·")}])`);
  else fail(`연습 경기 HUD: ${JSON.stringify(hud)}`);
  // 스프라이트: 실루엔 · 아델린 · 네리아 시트 전부가 양쪽에 (view.stats 는 30 프레임마다)
  const ready = await page.waitForFunction((want) => {
    const d = window.__soccer.hexView;
    const c = d?.tex?.chars;
    const sp = d?.sprites || [];
    return !!c && Object.entries(want).every(([id, n]) => c[id]?.kind === "anim" && c[id].acts.length >= n
      && sp.filter((x) => x.charId === id && x.kind === "anim").length === 2);
  }, { timeout: 30000, polling: 100 }, ANIM_CHARS).then(() => true, () => false);
  const st = await page.evaluate(() => ({ tex: window.__soccer.hexView?.tex, sprites: window.__soccer.hexView?.sprites }));
  out.tex = st.tex;
  const keys = (st.sprites || []).map((x) => `${x.key}=${x.kind}`);
  const MB = (b) => (b / 1048576).toFixed(1);
  const spr = st.tex?.byKind?.sprite;
  if (ready) pass(`스프라이트: 실루엔 · 아델린 · 네리아 양쪽 움직임 (시트 ${Object.keys(ANIM_CHARS).map((id) => st.tex.chars[id].acts.length).join(" + ")}장) [${keys.join(", ")}] · 텍스처 ${st.tex.textures}개 ${MB(st.tex.bytes)} MB (스프라이트 ${spr?.textures ?? 0}개 ${MB(spr?.bytes ?? 0)} MB · 칸 ${st.tex.cuts ?? "?"})`);
  else fail(`스프라이트가 다 올라오지 않았다: ${JSON.stringify(st.tex?.chars)} [${keys.join(", ")}]`);
}

/** 동작 사냥 (머리 주석 4 --practice) — 못 본 동작은 note (경기마다 다르다). turnCap 턴에서 끝 */
async function huntActs(page, size, opts, out, pass, turnCap) {
  const want = Object.fromEntries(Object.entries(HUNT_CHARS).map(([id, c]) => [id, c.acts]));
  const seen = {}; // 'charId:동작' → true
  const has = (id, act) => !!seen[`${id}:${act}`];
  const allSeen = () => Object.entries(want).every(([id, acts]) => acts.every((x) => has(id, x)));
  await page.evaluate((w, k) => {
    window.__soccer.store.matchUi.speed = 1;
    window.__hunt = { on: true, want: w, seen: {}, hit: null };
    window.__hexClock.scale = k;
  }, want, HUNT_SCALE);
  const t0 = await page.evaluate(() => window.__hexClock.virt);
  for (;;) {
    const st = await page.evaluate(() => ({ hit: window.__hunt.hit, virt: window.__hexClock.virt, fin: !!window.__soccer.hexView?.finished, turn: window.__soccer.hexView?.turn ?? 0 }));
    if (st.hit) {
      const hit = st.hit;
      const ch = HUNT_CHARS[hit.charId];
      await sleep(150); // 멈춘 그림이 한 번 더 그려지게
      const file = path.join(opts.outDir, `${size}-act-${ch.tag}${hit.label}.png`);
      await page.screenshot({ path: file });
      out.files.push(file);
      // 그 선수를 잘라 확대 (발밑 · 공 · 방향을 자세히)
      // 상자는 캔버스 CSS px (변환 전) — 휴대폰은 스테이지 전체를 CSS 로 줄이므로 화면 px = 상자 × (보이는 폭 / clientWidth)
      const cr = await page.evaluate(() => { const c = document.querySelector(".hex-screen .hx-pitch canvas"); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, r.width / (c.clientWidth || r.width)]; });
      const now = await page.evaluate((k) => (window.__soccer.hexView?.sprites || []).find((x) => x.key === k), hit.key);
      const bx = ((now && now.box) || hit.box).map((v) => v * cr[4]);
      const zw = Math.min(cr[2], Math.max(bx[3] * 2.2, 160));
      const zh = Math.min(cr[3], zw * 0.75);
      const zx = Math.min(cr[0] + cr[2] - zw, Math.max(cr[0], cr[0] + bx[0] + bx[2] / 2 - zw / 2));
      const zy = Math.min(cr[1] + cr[3] - zh, Math.max(cr[1], cr[1] + bx[1] + bx[3] * 0.6 - zh / 2));
      const zfile = path.join(opts.outDir, `${size}-act-${ch.tag}${hit.label}-zoom.png`);
      await page.screenshot({ path: zfile, clip: { x: zx, y: zy, width: zw, height: zh, scale: 2 } });
      out.files.push(zfile);
      seen[`${hit.charId}:${hit.label}`] = true;
      const shown = hit.label !== hit.act ? `${hit.label} (→ ${hit.act} 시트)` : hit.act;
      out.frames.push({ file, hunt: true, turn: hit.turn, score: hit.score, act: `${ch.name} ${shown} ${hit.key} 칸 ${hit.frame} · ${hit.t}/${hit.dur} ms · 얼굴 ${hit.flip} · 상자 ${Math.round(bx[2])}×${Math.round(bx[3])}px${hit.want !== hit.act && hit.want !== hit.label ? ` (frame 동작 ${hit.want})` : ""}` });
      await page.evaluate((key, k) => { window.__hunt.seen[key] = true; window.__hunt.hit = null; window.__hexClock.scale = k; }, `${hit.charId}:${hit.label}`, HUNT_SCALE);
      continue;
    }
    if (allSeen()) break;
    if (st.fin || st.turn >= turnCap || st.virt - t0 > opts.huntMs) break;
    await sleep(40);
  }
  await page.evaluate(() => { window.__hunt.on = false; window.__hexClock.scale = 1; window.__soccer.store.matchUi.speed = 1; });
  out.hunt = Object.keys(seen);
  const ME = "ch_elf_playmaker";
  const miss = HUNT_NEED.filter((x) => !has(ME, x));
  const extra = HUNT_EXTRA.filter((x) => has(ME, x));
  if (!miss.length) pass(`실루엔 동작 ${HUNT_NEED.length}가지 다 찍음${extra.length ? ` (+ ${extra.join(" · ")})` : ""}`);
  else out.notes.push(`실루엔 동작 못 봄: ${miss.join(" · ")} (턴 ${turnCap} 까지 — 실패 아님)${extra.length ? ` · 덤 ${extra.join(" · ")}` : ""}`);
  for (const [id, c] of Object.entries(HUNT_CHARS)) {
    if (id === ME) continue;
    const got = c.acts.filter((x) => has(id, x));
    const no = c.acts.filter((x) => !has(id, x));
    out.notes.push(`${c.name} 동작 찍음: ${got.join(" · ") || "없음"}${no.length ? ` · 못 봄: ${no.join(" · ")}` : ""}`);
  }
}

/** 필살기 띠 재기: 버튼 수 · 화면 안 · 이름 · 상태 글 잘림 · 칸 크기 (CSS px) · 띠 상자 */
async function probeUltBar(page) {
  return page.evaluate(() => {
    const bar = document.querySelector(".hex-screen .hx-ult");
    if (!bar) return { error: "띠 없음" };
    const r = bar.getBoundingClientRect();
    const btns = [...bar.querySelectorAll(".hx-ult-btn")].map((b) => {
      const br = b.getBoundingClientRect();
      const nm = b.querySelector(".hx-ult-nm");
      const st = b.querySelector(".hx-ult-st");
      return {
        cls: b.className, name: nm?.textContent || "", state: st?.textContent || "", disabled: b.disabled,
        rect: [Math.round(br.left), Math.round(br.top), Math.round(br.width * 10) / 10, Math.round(br.height * 10) / 10],
        inView: br.left >= -1 && br.top >= -1 && br.right <= innerWidth + 1 && br.bottom <= innerHeight + 1,
        clipName: nm ? nm.scrollWidth > nm.clientWidth + 1 : false, clipState: st ? st.scrollWidth > st.clientWidth + 1 : false,
      };
    });
    const field = document.querySelector(".hex-screen .hx-field")?.getBoundingClientRect();
    return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], belowField: field ? r.top >= field.bottom - 1 : null, btns };
  });
}

/** --ult: 필살기 띠 · 예약 · 컷인 사냥 (머리 주석 4 --ult) */
async function ultFlow(page, size, opts, out, pass, fail) {
  const shot = async (name, clip) => {
    const file = path.join(opts.outDir, `${size}-${name}.png`);
    await page.screenshot(clip ? { path: file, clip } : { path: file });
    out.files.push(file);
    return file;
  };
  const fill = (sides) => page.evaluate((ss) => {
    const st = window.__soccer.store.practiceMatch;
    let n = 0;
    for (const s of ss) for (const lv of Object.values(st?.live?.[s] || {})) if (typeof lv.gauge === "number" && !st.finished) { lv.gauge = 100; n++; }
    return n;
  }, sides);
  const tapReady = () => page.evaluate(() => {
    const list = [...document.querySelectorAll(".hex-screen .hx-ult-btn.hx-ready:not(.hx-armed):not(:disabled)")];
    for (const b of list) b.click();
    return list.length;
  });
  await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; window.__hexClock.scale = 1; });
  const filled = await fill(["home"]);
  const ready = await page.waitForFunction(() => document.querySelectorAll(".hex-screen .hx-ult-btn.hx-ready").length >= 5, { timeout: 8000, polling: 50 }).then(() => true, () => false);
  await page.evaluate((f) => { window.__hexClock.scale = f; }, FREEZE); // 띠를 찍는 동안 다음 턴으로 넘어가지 않게
  await sleep(150);
  const bar = await probeUltBar(page);
  out.ultBar = bar;
  await shot("ult-bar");
  if (!bar.error) {
    const [bx, by, bw, bh] = bar.rect;
    await shot("ult-bar-zoom", { x: Math.max(0, bx - 4), y: Math.max(0, by - 4), width: bw + 8, height: bh + 8, scale: 2 });
  }
  const names = bar.btns?.map((b) => `${b.name}=${b.state}`).join(", ");
  if (bar.error) fail(`필살기 띠: ${bar.error}`);
  else {
    const bad = bar.btns.filter((b) => !b.inView || b.clipName || b.clipState);
    const sz = bar.btns[0]?.rect;
    if (bar.btns.length === 7 && !bad.length && bar.belowField && ready) pass(`필살기 띠 7칸 (게이지 ${filled}명 가득) · 화면 안 · 경기장 아래 · 글 안 잘림 · 칸 ${sz?.[2]}×${sz?.[3]} CSS px [${names}]`);
    else fail(`필살기 띠: 칸 ${bar.btns.length} · 준비 ${ready} · 경기장 아래 ${bar.belowField} · 문제 ${JSON.stringify(bad)} [${names}]`);
  }
  // 준비된 버튼을 다 누른다 → 예약 (시계는 멈춘 채 — 누른 즉시 보이는 상태)
  const tapped = await tapReady();
  await page.waitForFunction((n) => window.__soccer.hexView?.ult?.queued?.length === n, { timeout: 3000, polling: 30 }, tapped).catch(() => {});
  const armed = await page.evaluate(() => ({
    labels: [...document.querySelectorAll(".hex-screen .hx-ult-btn")].map((b) => b.querySelector(".hx-ult-st")?.textContent || ""),
    armed: document.querySelectorAll(".hex-screen .hx-ult-btn.hx-armed").length,
    queued: window.__soccer.hexView?.ult?.queued?.length ?? 0,
  }));
  await shot("ult-armed");
  if (tapped >= 5 && armed.armed === tapped && armed.queued === tapped && armed.labels.filter((l) => l === "예약").length === tapped) pass(`준비 버튼 ${tapped}개 누름 → 예약 ${armed.armed} · 다음 턴 입력 줄 ${armed.queued} [${armed.labels.join(", ")}]`);
  else fail(`누른 뒤: 누름 ${tapped} · ${JSON.stringify(armed)}`);
  // 컷인 사냥 (가상 시간 2배 · 1배속)
  const want = ["own", "opp", "combo", "rev"];
  await page.evaluate((w, k) => { window.__cutHunt = { on: true, want: w, seen: {}, hit: null }; window.__hexClock.scale = k; }, want, HUNT_SCALE);
  const t0 = await page.evaluate(() => window.__hexClock.virt);
  const seen = {};
  let refill = 0;
  for (;;) {
    const st = await page.evaluate(() => ({ hit: window.__cutHunt.hit, virt: window.__hexClock.virt, fin: !!window.__soccer.hexView?.finished, turn: window.__soccer.hexView?.turn }));
    if (st.hit) {
      await sleep(120);
      const file = await shot(`cut-${st.hit.kind}`);
      out.frames.push({ file, hunt: true, turn: st.turn, act: `컷인 ${st.hit.kind}: ${st.hit.cls} — ${st.hit.text}` });
      seen[st.hit.kind] = st.hit;
      await page.evaluate((kd, k) => {
        for (const x of document.querySelector(".hex-screen .m-cutin")?.getAnimations({ subtree: true }) || []) x.play();
        window.__cutHunt.seen[kd] = true;
        window.__cutHunt.hit = null;
        window.__hexClock.scale = k;
      }, st.hit.kind, HUNT_SCALE);
      continue;
    }
    // 뒤 프레임 · 카메라 검사 · --goal (4배속 첫 골까지) · ⏭ 가 경기 중에 되게 정규 시간 끝 (300 턴) 보다 넉넉히 전에 멈춘다
    if (want.every((k) => seen[k]) || st.fin || (st.turn ?? 0) >= 150 || st.virt - t0 > opts.huntMs) break;
    // 우리 · 상대 컷인을 보면 2배속 (합체기 · 역컷인은 드물다 — 카드 길이도 반, 30 % 지점은 그대로 잡힌다)
    if (seen.own && seen.opp && !seen.fast) { seen.fast = true; await page.evaluate(() => { window.__soccer.store.matchUi.speed = 2; }); }
    // 양쪽 게이지를 다시 채우고 우리 준비 버튼을 누른다 (필살기가 계속 나게 — 합체기 · 역컷인 기회)
    if (++refill % 3 === 0) { await fill(["home", "away"]); await tapReady(); }
    await sleep(60);
  }
  await page.evaluate(() => { window.__cutHunt.on = false; window.__hexClock.scale = 1; window.__soccer.store.matchUi.speed = 1; });
  delete seen.fast;
  out.cuts = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.text]));
  const own = seen.own;
  const opp = seen.opp;
  if (own && /\btier-(R|SR|SSR)\b/.test(own.cls) && !own.small.startsWith("상대")) pass(`우리 컷인 (${own.cls}) "${own.text}"`);
  else fail(`우리 컷인을 못 봤다: ${JSON.stringify(own || null)}`);
  if (opp && opp.small.startsWith("상대")) pass(`상대 컷인 (${opp.cls}) "${opp.text}"`);
  else fail(`상대 컷인을 못 봤다 (또는 "상대" 글 없음): ${JSON.stringify(opp || null)}`);
  if (seen.combo) pass(`합체기 이름 카드 "${seen.combo.text}"`); else out.notes.push("합체기는 이 경기에서 나지 않았다 (실패 아님)");
  if (seen.rev) pass(`역컷인 (${seen.rev.cls}) "${seen.rev.text}"`); else out.notes.push("역컷인은 이 경기에서 나지 않았다 (실패 아님)");
}

/** 감정 말풍선 사냥 (머리 주석 4 — 말풍선 사냥): 1배속 · 가상 시간 2배, 최대 opts.huntMs 의 절반 */
async function huntEmotes(page, size, opts, out, pass, fail) {
  const want = ["steal", "win", "lose"];
  const need = ["steal", "lose"];
  await page.evaluate((w, k) => {
    window.__soccer.store.matchUi.speed = 1;
    window.__emoteHunt = { on: true, want: w, seen: {}, hit: null };
    window.__hexClock.scale = k;
  }, want, HUNT_SCALE);
  const t0 = await page.evaluate(() => window.__hexClock.virt);
  const seen = {};
  const area = (r) => Math.max(0, r[2]) * Math.max(0, r[3]);
  const inter = (a, b) => (a && b ? area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]), Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])]) : 0);
  const bad = [];
  const notes = [];
  for (;;) {
    const st = await page.evaluate(() => ({ hit: window.__emoteHunt.hit, virt: window.__hexClock.virt, fin: !!window.__soccer.hexView?.finished, turn: window.__soccer.hexView?.turn ?? 0 }));
    if (st.hit) {
      const hit = st.hit;
      await sleep(150);
      const fresh = hit.kinds.filter((k) => !seen[k]);
      const tag = fresh[0] || hit.kinds[0];
      const file = path.join(opts.outDir, `${size}-emote-${tag}.png`);
      await page.screenshot({ path: file });
      out.files.push(file);
      // 말풍선들 + 그 아래 선수까지 잘라 확대
      const rs = hit.list.map((x) => x.rect);
      const x0 = Math.min(...rs.map((r) => r[0]));
      const y0 = Math.min(...rs.map((r) => r[1]));
      const x1 = Math.max(...rs.map((r) => r[0] + r[2]));
      const bh = Math.max(...rs.map((r) => r[3]));
      const vw = await page.evaluate(() => [innerWidth, innerHeight]);
      const zx = Math.max(0, x0 - 50);
      const zy = Math.max(0, y0 - 16);
      const zfile = path.join(opts.outDir, `${size}-emote-${tag}-zoom.png`);
      await page.screenshot({ path: zfile, clip: { x: zx, y: zy, width: Math.min(vw[0] - zx, x1 - x0 + 100), height: Math.min(vw[1] - zy, bh * 5 + 16), scale: 2 } });
      out.files.push(zfile);
      for (const k of hit.kinds) seen[k] = true;
      // 검사: 경기장 안 · HUD 와 안 겹침 · 글 · 이름표 겹침
      const p = hit.pitch;
      for (const m of hit.list) {
        const r = m.rect;
        if (!(r[0] >= p[0] - 1 && r[1] >= p[1] - 1 && r[0] + r[2] <= p[0] + p[2] + 1 && r[1] + r[3] <= p[1] + p[3] + 1)) bad.push(`${m.key} 경기장 밖 ${JSON.stringify(r.map(Math.round))}`);
        for (const [k, hr] of Object.entries(hit.hud)) if (inter(r, hr) > 0.5) bad.push(`${m.key} 가 HUD ${k} 와 겹침`);
        if (!m.text.trim()) bad.push(`${m.key} 글 없음`);
        if (hit.name) {
          const ov = inter(r, hit.name.rect) / Math.max(1, area(r));
          if (ov > 0.01) notes.push(`${m.key} 이 이름표 '${hit.name.text}' 와 ${Math.round(ov * 100)}% 겹침`);
        }
      }
      const desc = hit.list.map((m) => `${m.kind} '${m.text}' ${m.key} ${Math.round(m.rect[2])}×${Math.round(m.rect[3])}px 글 ${m.font}`).join(" · ");
      out.frames.push({ file, hunt: true, turn: hit.turn, act: `말풍선 ${desc}${hit.name ? ` · 이름표 ${hit.name.text}` : ""}` });
      await page.evaluate((ks, k) => {
        for (const el of document.querySelectorAll(".hex-screen .hx-emote")) for (const a of el.getAnimations({ subtree: true })) a.play();
        for (const x of ks) window.__emoteHunt.seen[x] = true;
        window.__emoteHunt.hit = null;
        window.__hexClock.scale = k;
      }, hit.kinds, HUNT_SCALE);
      continue;
    }
    // 뒤 프레임 · 골 · ⏭ 가 정규 시간 (300 턴) 안에 되게 220 턴에서 끝
    if (want.every((k) => seen[k]) || st.fin || st.turn >= 220 || st.virt - t0 > opts.huntMs / 2) break;
    await sleep(40);
  }
  await page.evaluate(() => { window.__emoteHunt.on = false; window.__hexClock.scale = 1; });
  out.emotes = Object.keys(seen);
  const miss = need.filter((k) => !seen[k]);
  if (miss.length) fail(`말풍선 못 봄: ${miss.join(" · ")}`);
  else pass(`말풍선 찍음: ${Object.keys(seen).join(" · ")}`);
  if (!seen.win) out.notes.push("말풍선 '!' (가로채기 · 선방 · 공중볼 · 흘러나온 공) 은 이 구간에서 못 봄 (실패 아님)");
  if (bad.length) fail(`말풍선 자리: ${bad.join("; ")}`);
  else if (Object.keys(seen).length) pass("말풍선: 경기장 안 · HUD 와 안 겹침 · 글 있음");
  for (const n of notes) out.notes.push(n);
}

/* ---- --moments (H3.5 결정의 순간) ---- */

/** 카드 띠 재기: 카드 수 · 상자 (CSS px) · 화면 안 · 글자 크기 · 잘림 · '자동' 수 · 머리표 */
async function probeMoment(page) {
  return page.evaluate(() => {
    const m = document.querySelector(".hex-screen .hx-moment");
    if (!m || m.hidden) return { error: "띠 없음" };
    const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };
    const inView = (el) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; };
    const clip = (el) => !!el && !el.hidden && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1); // 말줄임 · 두 줄 넘침
    const fs = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * (el.getBoundingClientRect().height / Math.max(1, el.offsetHeight)) * 10) / 10 : null);
    const cards = [...m.querySelectorAll(".hx-mc")].map((c) => ({
      key: c.dataset.key, cls: c.className, rect: rect(c), inView: inView(c),
      p: c.querySelector(".hx-mc-p")?.textContent || "", pl: c.querySelector(".hx-mc-pl")?.textContent || "",
      lbl: c.querySelector(".hx-mc-lbl")?.textContent || "", af: c.querySelector(".hx-mc-af")?.textContent || "",
      auto: c.classList.contains("hx-mc-auto"), star: c.classList.contains("hx-mc-star"), rcv: !!c.querySelector(".hx-mc-rcv"),
      clip: { lbl: clip(c.querySelector(".hx-mc-lbl")), af: clip(c.querySelector(".hx-mc-af")), pl: clip(c.querySelector(".hx-mc-pl")) },
      font: { p: fs(c.querySelector(".hx-mc-p")), lbl: fs(c.querySelector(".hx-mc-lbl")), af: fs(c.querySelector(".hx-mc-af")),
        pl: fs(c.querySelector(".hx-mc-pl")), badge: fs(c.querySelector(".hx-mc-badge")) },
    }));
    const head = m.querySelector(".hx-mo-head");
    const field = document.querySelector(".hex-screen .hx-field")?.getBoundingClientRect();
    const ctl = document.querySelector(".hex-screen .hx-ctl")?.getBoundingClientRect();
    const mr = m.getBoundingClientRect();
    return {
      rect: rect(m), cards, head: head ? { text: head.textContent.replace(/\s+/g, " ").trim(), rect: rect(head), inView: inView(head), clip: head.scrollWidth > head.clientWidth + 1 } : null,
      belowField: field ? mr.top >= field.bottom - 1 : null, ctlClear: ctl ? ctl.right <= mr.left + 1 : null,
      clock: document.querySelector(".hex-screen .hx-clock")?.textContent || "", ult: !!document.querySelector(".hex-screen .hx-ult")?.hidden,
    };
  });
}

/** --moments: 장면마다 찍고 고르기 · ★ 컷인 · ⏸ 개입 · [결정 OFF] (머리 주석 4 --moments) */
async function momentFlow(page, size, opts, out, pass, fail) {
  const shot = async (name, clip) => {
    const file = path.join(opts.outDir, `${size}-${name}.png`);
    await page.screenshot(clip ? { path: file, clip } : { path: file });
    out.files.push(file);
    return file;
  };
  const dbgM = () => page.evaluate(() => ({ m: window.__soccer.hexView?.moment, turn: window.__soccer.hexView?.turn, fin: !!window.__soccer.hexView?.finished, cam: window.__soccer.hexView?.cam, cut: window.__soccer.hexView?.ult?.cut }));
  const fill = () => page.evaluate(() => {
    const st = window.__soccer.store.practiceMatch;
    for (const lv of Object.values(st?.live?.home || {})) if (typeof lv.gauge === "number" && !st.finished) lv.gauge = 100;
  });
  let restarts = 0;
  const restart = async () => {
    restarts += 1;
    await page.evaluate((sd) => { const S = window.__soccer; S.store.practiceSeed = sd; S.store.practiceMatch = null; S.render(); }, `${opts.seed === "random" ? "mom" : opts.seed}-${restarts}`);
    await page.waitForFunction(() => window.__soccer.hexView?.renderer === "webgl" && (window.__soccer.hexView?.turn ?? 1) === 0, { timeout: 15000 }).catch(() => {});
  };
  // 고르는 규칙 (페이지 안에서 함수로 — 문자열로 넘겨 new Function)
  const PREF = {
    shot: ["c => c.querySelector('.hx-mc-lbl')?.textContent.startsWith('중거리 슛')", "c => c.dataset.kind === 'shoot'"],
    cross: ["c => c.dataset.kind === 'cross'", "c => c.querySelector('.hx-mc-lbl')?.textContent.startsWith('스루')"],
    counter: ["c => c.dataset.kind === 'loft'"],
    danger: ["c => c.dataset.key === 'block'"],
    longball: ["c => c.dataset.kind === 'loft' && !c.classList.contains('hx-mc-auto') && !c.classList.contains('hx-mc-star')"],
  };
  const pickBy = (list) => page.evaluate((fns) => {
    const cards = [...document.querySelectorAll(".hex-screen .hx-moment .hx-mc")];
    let el = null;
    // eslint-disable-next-line no-new-func
    for (const f of fns) { const fn = new Function(`return (${f})`)(); el = cards.find((c) => fn(c)); if (el) break; }
    el = el || cards.find((c) => c.classList.contains("hx-mc-auto")) || cards[0];
    if (!el) return null;
    const r = { key: el.dataset.key, kind: el.dataset.kind, lbl: el.querySelector(".hx-mc-lbl")?.textContent, p: el.querySelector(".hx-mc-p")?.textContent, auto: el.classList.contains("hx-mc-auto") };
    el.querySelector(".hx-mc-pick").dispatchEvent(new PointerEvent("pointerenter")); // 밝힘 (화살표) — pointerenter 는 버블링하지 않는다
    return r;
  }, list || []);
  const clickSel = () => page.evaluate(() => { const el = document.querySelector(".hex-screen .hx-moment .hx-mc.hx-mc-sel .hx-mc-pick"); if (el) el.click(); return !!el; });

  // 2배속 (장면 사이를 빨리 — 장면에서는 배속과 상관없이 선다) · 가상 시간 2배
  await page.evaluate((k) => { window.__soccer.store.matchUi.speed = 2; window.__soccer.store.matchUi.moments = true; window.__hexClock.scale = k; }, HUNT_SCALE);
  const KINDS = ["shot", "danger", "cross", "counter", "ult", "combo"];
  const seen = {};
  const probes = [];
  let phase = "kinds"; // kinds → star → manual → done
  // 장면 종류를 다 봤나 — 2골 선승 (결정 27) 으로 경기가 짧아 역습 장면을 못 보고 다시 시작만 하다 끝나지 않게 3판을 넘겼으면 둘만 봐도 다음으로
  const need = ["shot", "danger", "cross", "counter"];
  const kindsDone = (virt) => need.every((k) => seen[k]) || ((virt - t0 > opts.huntMs * 0.8 || restarts >= 3) && need.filter((k) => seen[k]).length >= 2);
  let starDone = null;
  const t0 = await page.evaluate(() => window.__hexClock.virt);
  for (let guard = 0; guard < 4000; guard++) {
    const d = await dbgM();
    const virt = await page.evaluate(() => window.__hexClock.virt);
    if (virt - t0 > opts.huntMs * 2) { out.notes.push(`결정의 순간 사냥 시간 끝 (${phase})`); break; }
    if (phase === "kinds" && kindsDone(virt)) phase = "star"; // 이미 본 종류 장면만 이어져도 (아래 continue) 다음 단계로
    if (d.fin) {
      if (restarts >= 15) { out.notes.push("다시 시작 15번 — 그만"); break; }
      await restart();
      continue;
    }
    const open = d.m?.open;
    if (!open) {
      if (phase === "star" && guard % 3 === 0) await fill();
      await sleep(40);
      continue;
    }
    // 장면이 열렸다: 카메라가 장면 틀 (moment.open.camT) 에 붙을 때까지 (최대 4 초). 디버그 값은 프레임마다라 방금 고른 장면이 남아 있을 수 있다 → 다시 읽는다
    await sleep(200);
    await page.waitForFunction(() => {
      const v = window.__soccer.hexView;
      const a = v?.cam;
      const b = v?.moment?.open?.camT;
      return !v?.moment?.open || (a && b && Math.abs(a.cx - b.cx) < 3 && Math.abs(a.cy - b.cy) < 3 && Math.abs(a.z - b.z) < 0.01);
    }, { timeout: 4000, polling: 50 }).catch(() => out.notes.push(`${size} 장면 카메라가 4 초 안에 틀에 안 붙었다 (turn ${d.turn})`));
    const d2 = await dbgM();
    if (!d2.m?.open || d2.turn !== d.turn) continue;
    const kind = open.kind;
    const hasStar = open.cards.some((c) => c.star);
    if (phase === "star" && hasStar) {
      const pr = await probeMoment(page);
      await page.evaluate((f) => { window.__hexClock.scale = f; }, FREEZE);
      await sleep(120);
      await shot("mom-star");
      const st = await page.evaluate(() => {
        const el = document.querySelector(".hex-screen .hx-moment .hx-mc.hx-mc-star");
        if (!el) return null;
        const r = { key: el.dataset.key, lbl: el.querySelector(".hx-mc-lbl").textContent, p: el.querySelector(".hx-mc-p").textContent, af: el.querySelector(".hx-mc-af").textContent };
        el.querySelector(".hx-mc-pick").click();
        return r;
      });
      if (!st) { await page.evaluate((k) => { window.__hexClock.scale = k; }, HUNT_SCALE); continue; }
      // 컷인 카드가 30 % 쯤 올 때까지 (cutHunt 처럼 — 카드 애니메이션을 멈추고 찍는다)
      await page.evaluate((k) => { window.__cutHunt = { on: true, want: ["own"], seen: {}, hit: null }; window.__hexClock.scale = k; }, 1);
      const got = await page.waitForFunction(() => window.__cutHunt.hit, { timeout: 8000, polling: 16 }).then(() => true, () => false);
      await sleep(120);
      if (got) {
        const file = await shot("mom-star-cut");
        const hit = await page.evaluate(() => window.__cutHunt.hit);
        out.frames.push({ file, hunt: true, turn: d.turn, act: `★ 카드 ${st.lbl} ${st.p} → 컷인 ${hit.text}` });
        pass(`★ 카드 "${st.lbl}" ${st.p} (${st.af}) → 고름 → 우리 컷인 (${hit.cls})`);
      } else fail(`★ 카드 "${st.lbl}" 를 골랐는데 컷인을 못 봤다`);
      await page.evaluate((k) => {
        for (const x of document.querySelector(".hex-screen .m-cutin")?.getAnimations({ subtree: true }) || []) x.play();
        window.__cutHunt.on = false; window.__hexClock.scale = k;
      }, HUNT_SCALE);
      starDone = { ...st, kind, probe: pr };
      phase = "manual";
      // ⏸ 개입: [결정 OFF] 로 끄고 개입 한 번
      await page.evaluate(() => { document.querySelector(".hex-screen .hx-int-btn")?.click(); });
      continue;
    }
    if (phase === "manual") {
      await page.evaluate((f) => { window.__hexClock.scale = f; }, FREEZE);
      await sleep(120);
      const file = await shot("mom-manual");
      const pr = await probeMoment(page);
      out.frames.push({ file, hunt: true, turn: d.turn, act: `⏸ 개입 장면 ${kind}${open.manual ? " (manual)" : ""}: ${pr.head?.text}` });
      const iv = await page.evaluate(() => window.__soccer.store.matchUi.hexIntervene);
      if (!iv) pass(`⏸ 개입 → 한 번 멈춤 (${kind}${open.manual ? " · 간격 밖" : ""}) "${pr.head?.text}" · 멈춘 뒤 꺼짐`);
      else fail("⏸ 개입 뒤에도 켜져 있다");
      await clickSel();
      await page.evaluate((k) => { window.__hexClock.scale = k; }, HUNT_SCALE);
      phase = "done";
      break;
    }
    // 이미 찍은 종류라도 '자동' 이 아닌 띄운 공 (롱볼 · 전환 · 스루) 카드가 있으면 한 번 그것을 골라 찍는다 (longball — 고른 롱볼이 날아가는 그림)
    const longOk = phase === "kinds" && seen[kind] && !seen.longball && kind !== "danger" && open.cards.some((c) => c.kind === "loft" && !c.auto && !c.star);
    if ((seen[kind] && !longOk) || phase !== "kinds") { await clickSel(); await sleep(40); continue; }
    const tag = longOk ? "longball" : kind;
    // 처음 보는 종류: 고를 카드를 밝혀 (화살표) 멈추고 찍는다
    const chosen = await pickBy(PREF[tag]);
    await page.evaluate((f) => { window.__hexClock.scale = f; }, FREEZE);
    await sleep(160);
    const pr = await probeMoment(page);
    const clk = (await probeMoment(page)).clock;
    const file = await shot(`mom-${tag}`);
    if (!pr.error) {
      const [x, y, w, hh] = pr.rect;
      const top = Math.max(0, (pr.head?.rect?.[1] ?? y) - 6);
      await shot(`mom-${tag}-strip`, { x: Math.max(0, x - 6), y: top, width: w + 12, height: y + hh + 6 - top, scale: 2 });
    }
    const dd = await dbgM();
    out.frames.push({ file, hunt: true, turn: d.turn, act: `장면 ${tag} "${pr.head?.text}" · cam z ${dd.cam?.z?.toFixed(2)} · 카드 ${pr.cards?.map((c) => `${c.lbl} ${c.p}${c.auto ? "(자동)" : ""}${c.star ? "★" : ""} [${c.af}]`).join(" | ")}` });
    probes.push({ kind: tag, pr });
    // 검사
    if (pr.error) fail(`장면 ${tag}: ${pr.error}`);
    else {
      const bad = [];
      if (pr.cards.length < 2 || pr.cards.length > 4) bad.push(`카드 ${pr.cards.length}장`);
      if (pr.cards.some((c) => !c.inView)) bad.push("화면 밖 카드");
      if (pr.cards.filter((c) => c.auto).length !== 1) bad.push(`'자동' ${pr.cards.filter((c) => c.auto).length}장`);
      if (pr.cards.some((c) => c.rect[3] < 44)) bad.push(`카드 높이 ${Math.min(...pr.cards.map((c) => c.rect[3]))} CSS px`);
      if (!pr.belowField) bad.push("띠가 경기장 위");
      if (!pr.ctlClear) bad.push("컨트롤과 겹침");
      if (!pr.ult) bad.push("필살기 띠가 보인다");
      if (!pr.head?.inView) bad.push("머리표 화면 밖");
      const clips = pr.cards.flatMap((c) => Object.entries(c.clip).filter(([, v]) => v).map(([k]) => `${c.key}.${k}`));
      if (clips.length) out.notes.push(`${size} 장면 ${tag}: 글자 잘림 (말줄임) ${clips.join(", ")}`);
      if (pr.head?.clip) out.notes.push(`${size} 장면 ${tag}: 머리표 잘림`);
      const f = pr.cards[0]?.font || {};
      // 작은 글자 (% 이름 · '자동' 꼬리표) 도 폰 바닥 9 CSS px (2026-10-10 리뷰 — 예전엔 p · lbl · af 만 쟀다)
      const small = pr.cards.flatMap((c) => ["pl", "badge"].filter((k) => c.font[k] != null && c.font[k] > 0 && c.font[k] < 9).map((k) => `${c.key}.${k} ${c.font[k]}px`));
      if (small.length) bad.push(`글자 9 CSS px 아래 ${small.join(", ")}`);
      if (bad.length) fail(`장면 ${tag}: ${bad.join(" · ")}`);
      else pass(`장면 ${tag} "${pr.head.text}" 카드 ${pr.cards.length}장 · ${pr.cards[0].rect[2]}×${pr.cards[0].rect[3]} CSS px · 글자 % ${f.p} / 이름 ${f.lbl} / 둘째 줄 ${f.af} / % 이름 ${f.pl} px · cam z ${dd.cam?.z?.toFixed(2)}`);
    }
    // 시계가 서 있나 (가상 시간 1 초 흘려도 같은 턴 · 같은 시계)
    await page.evaluate(() => { window.__hexClock.scale = 1; });
    await sleep(1000);
    const after = await dbgM();
    const clk2 = (await probeMoment(page)).clock;
    if (after.turn === d.turn && clk2 === clk && after.m?.open) pass(`장면 ${tag}: 고를 때까지 시계 · 턴 멈춤 (${clk})`);
    else fail(`장면 ${tag}: 시계가 흐른다 (${d.turn} → ${after.turn}, ${clk} → ${clk2})`);
    seen[tag] = { chosen, file };
    // 고름 → 그 턴 그림 (공이 떠난 뒤 — 1배속으로 그 턴의 ~65 %) 을 찍는다
    const go = !!(PREF[tag] && chosen && !chosen.auto);
    if (go) await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; });
    await clickSel();
    if (go) {
      await page.waitForFunction((t) => (window.__soccer.hexView?.turn ?? 0) > t, { timeout: 4000, polling: 16 }, d.turn).catch(() => {});
      // 공이 떠난 뒤 (그 턴의 ~55 % — 1배속 한 턴 400 ms) 에 멈춘다: 가상 시간으로 재고, 닿는 rAF 에서 바로 멈춘다
      await page.evaluate((f) => new Promise((res) => {
        const v0 = window.__hexClock.virt;
        const tick = () => { if (window.__hexClock.virt - v0 >= 220) { window.__hexClock.scale = f; res(); } else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }), FREEZE);
      await sleep(120);
      const gf = await shot(`mom-${tag}-go`);
      const evs = await page.evaluate((t) => (window.__soccer.store.practiceMatch?.events || []).filter((e) => e.turn === t + 1 && ["choice", "pass", "shot", "stance", "goal", "save", "tackle", "intercept", "aerial"].includes(e.type)).map((e) => `${e.type}${e.key ? `:${e.key}` : ""}${e.mode ? `:${e.mode}` : ""}${e.success != null ? (e.success ? "+" : "-") : ""}${e.lofted ? "(띄움)" : ""}${e.cross ? "(크로스)" : ""}`), d.turn);
      out.frames.push({ file: gf, hunt: true, turn: d.turn + 1, act: `고름 ${chosen.lbl} ${chosen.p} → ${evs.join(" ")}` });
      // 한 턴 뒤 (띄운 공 · 크로스는 여러 턴 난다)
      await page.evaluate(() => { window.__hexClock.scale = 1; });
      await sleep(400);
      await page.evaluate((f) => { window.__hexClock.scale = f; }, FREEZE);
      await sleep(120);
      out.frames.push({ file: await shot(`mom-${tag}-go2`), hunt: true, turn: d.turn + 2, act: `고름 ${chosen.lbl} — 한 턴 뒤` });
      if (evs.some((e) => e.startsWith("choice:") || e.startsWith("stance:"))) pass(`장면 ${tag}: "${chosen.lbl}" 고름 → 엔진 ${evs.join(" ")}`);
      else fail(`장면 ${tag}: 고른 입력을 엔진이 안 받았다 (${evs.join(" ")})`);
    }
    await page.evaluate((k) => { window.__hexClock.scale = k; window.__soccer.store.matchUi.speed = 2; }, HUNT_SCALE);
    if (kindsDone(virt)) phase = "star";
  }
  out.moments = Object.keys(seen);
  const miss = [...KINDS, "longball"].filter((k) => !seen[k]);
  if (["shot", "danger"].every((k) => seen[k])) pass(`장면 찍음: ${Object.keys(seen).join(" · ")}`);
  else fail(`슈팅 찬스 · 수비 위기 장면을 못 봤다 (본 것 ${Object.keys(seen).join(" · ") || "없음"})`);
  if (miss.length) out.notes.push(`못 본 장면 종류: ${miss.join(" · ")} (실패 아님)`);
  if (!starDone) out.notes.push("★ 카드 장면을 못 봤다");
  if (phase !== "done") out.notes.push(`⏸ 개입까지 못 갔다 (${phase})`);
  // [결정 OFF]: 버튼으로 끄고 멈추지 않는지 (뒤 프레임 · ⏭ 를 위해서도)
  const offBtn = await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; const b = document.querySelector(".hex-screen .hx-mom-btn"); b?.click(); return b?.textContent; });
  await page.evaluate(() => { window.__hexClock.scale = 1; });
  const a0 = await dbgM();
  await sleep(2500);
  const a1 = await dbgM();
  if (offBtn === "결정 OFF" && !a1.m?.open && (a1.fin || a1.turn > a0.turn)) pass(`[결정 OFF] → 멈추지 않고 흐른다 (turn ${a0.turn} → ${a1.turn}, 연 장면 ${a1.m?.opened})`);
  else fail(`[결정 OFF] 뒤: ${JSON.stringify({ offBtn, a0: a0.turn, a1: a1.turn, open: a1.m?.open })}`);
  if (a1.fin) await restart();
}

/** 연습 경기 끝: [⏭] → 결과 → [다시 하기] → 새 경기 → [⏭] → [확인] → 시작 화면 */
async function finishPractice(page, size, opts, out, pass, fail) {
  const skip = () => page.evaluate(() => { const b = document.querySelector(".hex-screen .skip-btn"); if (!b || b.disabled) return false; b.click(); return true; });
  const modal = () => page.waitForFunction(() => document.querySelector("#modal-root .score-big"), { timeout: 6000 }).then(() => true, () => false);
  if (!(await skip())) {
    // 경기가 이미 끝났으면 (⏭ 꺼짐) 결과 모달이 스스로 열린다 — 실패가 아니다
    if (await page.evaluate(() => !!window.__soccer.hexView?.finished)) out.notes.push("⏭ 전에 경기가 끝났다 (결과 모달이 스스로 열림)");
    else fail("⏭ 버튼을 누를 수 없다");
  }
  if (!(await modal())) throw new Error("⏭ 뒤 결과 모달이 열리지 않았다");
  await sleep(500);
  const rfile = path.join(opts.outDir, `${size}-result.png`);
  await page.screenshot({ path: rfile });
  out.files.push(rfile);
  const res = await page.evaluate(() => ({
    title: document.querySelector("#modal-root h2")?.textContent,
    score: document.querySelector("#modal-root .score-big")?.textContent,
    verdict: document.querySelector("#modal-root .result-verdict")?.textContent,
    rows: document.querySelectorAll("#modal-root .stats-table tbody tr").length,
    again: !!document.querySelector("#modal-root .again-btn"),
    modalFits: (() => { const m = document.querySelector("#modal-root .modal"); if (!m) return null; const r = m.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && m.scrollHeight <= m.clientHeight + 1; })(),
  }));
  out.result = res;
  if (res.rows >= 7 && res.title === "연습 경기 결과" && res.again) pass(`결과 모달 "${res.title}" ${res.score} ${res.verdict} · 표 ${res.rows}줄 · [다시 하기]`);
  else fail(`연습 결과 모달: ${JSON.stringify(res)}`);
  if (res.modalFits === false) fail("결과 모달이 화면에 다 들어가지 않는다 (스크롤 · 잘림)");
  // [다시 하기] → 새 시드 · 처음부터
  const seed0 = out.practice?.seed;
  await page.evaluate(() => document.querySelector("#modal-root .again-btn").click());
  const again = await page.waitForFunction((s0) => {
    const S = window.__soccer.store;
    return S.screen === "practice" && S.practiceSeed && S.practiceSeed !== s0 && document.querySelector(".hex-screen canvas") && !document.querySelector("#modal-root .score-big");
  }, { timeout: 8000 }, seed0).then(() => true, () => false);
  const ag = await page.evaluate(() => ({ seed: window.__soccer.store.practiceSeed, turn: window.__soccer.store.practiceMatch?.turn ?? null }));
  if (again && (ag.turn ?? 0) <= 1) pass(`[다시 하기] → 새 경기 (시드 ${ag.seed}, turn ${ag.turn})`);
  else fail(`[다시 하기] 뒤: ${JSON.stringify({ again, ...ag, seed0 })}`);
  await page.waitForFunction(() => window.__soccer.hexView?.renderer === "webgl", { timeout: 15000 }).catch(() => {});
  await sleep(700);
  const afile = path.join(opts.outDir, `${size}-again.png`);
  await page.screenshot({ path: afile });
  out.files.push(afile);
  if (!(await skip())) fail("다시 하기 뒤 ⏭ 버튼을 누를 수 없다");
  if (!(await modal())) throw new Error("다시 하기 뒤 결과 모달이 열리지 않았다");
  await sleep(300);
  if (!(await clickText(page, "확인", "#modal-root"))) throw new Error("결과 모달의 [확인] 이 없다");
  const left = await page.waitForFunction(() => window.__soccer.store.screen === "start", { timeout: 6000 }).then(() => true, () => false);
  await sleep(300);
  const after = await page.evaluate(() => ({
    screen: window.__soccer.store.screen, practiceMatch: window.__soccer.store.practiceMatch, run: !!window.__soccer.store.run, hexMatch: window.__soccer.store.hexMatch,
    canvas: !!document.querySelector("canvas"),
  }));
  const same = (await storageDump(page)) === out.storageBefore;
  const mem = await page.evaluate(async () => { try { return (await import("/js/ui/hexPixi.js")).hexPixiMemory(); } catch (e) { return { error: String(e) }; } });
  out.after = { ...after, storage: same ? "같음" : "바뀜", mem };
  if (left && after.practiceMatch == null && !after.run && after.hexMatch == null && !after.canvas && same && mem.textures === 0)
    pass("[확인] → 시작 화면 (practiceMatch · 런 · hexMatch 없음, localStorage 그대로, 캔버스 · 텍스처 0)");
  else fail(`확인 뒤 상태가 이상하다: ${JSON.stringify(out.after)}`);
}

/** 화면 검사: 캔버스 크기 · HUD 요소가 뷰포트 안에 보이는가 · 가로 스크롤 */
async function inspect(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const vis = (el) => {
      if (!el) return { ok: false, why: "없음" };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const inView = r.width > 0 && r.height > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
      const shown = cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05;
      return { ok: inView && shown, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], text: (el.textContent || "").trim().slice(0, 40) };
    };
    const cv = q(".hex-screen .hx-pitch canvas");
    const pitch = q(".hex-screen .hx-pitch");
    const cr = cv?.getBoundingClientRect();
    const pr = pitch?.getBoundingClientRect();
    const clip = (el) => (el ? el.scrollWidth > el.clientWidth + 1 : false);
    return {
      canvas: cv ? { w: cv.width, h: cv.height, css: [Math.round(cr.width), Math.round(cr.height)], pitch: [Math.round(pr.width), Math.round(pr.height)], match: Math.abs(cr.width - pr.width) < 2 && Math.abs(cr.height - pr.height) < 2 } : null,
      hud: {
        home: vis(q(".hex-screen .mh-team.home .nm")),
        away: vis(q(".hex-screen .mh-team.away .nm")),
        score: vis(q(".hex-screen .mh-score")),
        sub: vis(q(".hex-screen .mh-sub")),
        clock: vis(q(".hex-screen .hx-clock")),
        speed: vis(q(".hex-screen .speed-btn")),
        skip: vis(q(".hex-screen .skip-btn")),
      },
      clipped: { home: clip(q(".hex-screen .mh-team.home .nm")), away: clip(q(".hex-screen .mh-team.away .nm")), sub: clip(q(".hex-screen .mh-sub")) },
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
      name: (() => { const n = q(".hex-screen .hx-name"); return n && !n.hidden ? vis(n) : null; })(),
      dbg: JSON.parse(JSON.stringify(window.__soccer.hexView || null)),
    };
  });
}

/** 배너 꾸밈마다 잠깐 붙여 재고 되돌린다 (한 evaluate 안 — 화면 루프와 섞이지 않는다) */
async function probeBanners(page) {
  return page.evaluate(() => {
    const b = document.querySelector(".hex-screen .hx-banner");
    const pitch = document.querySelector(".hex-screen .hx-pitch");
    if (!b || !pitch) return { error: "배너 · 경기장 없음" };
    const txt = b.querySelector(".hx-banner-txt");
    const sub = b.querySelector(".hx-banner-sub");
    const keep = { cls: b.className, txt: txt.textContent, sub: sub.textContent };
    const pr = pitch.getBoundingClientRect();
    const out = [];
    for (const [cls, t, st] of [
      ["hx-banner hx-show hx-goal hx-home", "골!", "선수 · 1 : 0"],
      ["hx-banner hx-show hx-stage", "골든골", "먼저 넣는 쪽이 이긴다"],
      ["hx-banner hx-show hx-stage", "승부차기", ""],
      ["hx-banner hx-show hx-pk hx-away hx-miss", "실패", "선수 · 승부차기 2 : 3"],
    ]) {
      b.className = cls;
      txt.textContent = t;
      sub.textContent = st;
      const r = b.getBoundingClientRect();
      const tr = txt.getBoundingClientRect();
      const bg = getComputedStyle(b).backgroundColor;
      const inView = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && tr.top >= pr.top - 1 && tr.bottom <= pr.bottom + 1;
      const small = r.width < pr.width * 0.8 && r.height < pr.height * 0.5;
      const clear = bg === "rgba(0, 0, 0, 0)" || bg === "transparent";
      out.push({ cls, text: t, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], bg, ok: inView && small && clear });
    }
    b.className = keep.cls;
    txt.textContent = keep.txt;
    sub.textContent = keep.sub;
    return { list: out };
  });
}

/* ------------------------------------------------------------------ */
/* 한 크기                                                                */
/* ------------------------------------------------------------------ */

async function runSize(browser, baseUrl, size, opts) {
  const [w, h] = size.split("x").map(Number);
  const phone = size === "915x412" || (w <= 1000 && h <= 500);
  const viewport = phone ? { width: w, height: h, ...PHONE } : { width: w, height: h, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const out = { size, viewport, files: [], frames: [], checks: [], errors: [], notes: [] };
  const fail = (msg) => out.checks.push({ ok: false, msg });
  const pass = (msg) => out.checks.push({ ok: true, msg });
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    page.on("pageerror", (e) => out.errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") out.errors.push(`console.error: ${m.text()}`); });
    page.on("requestfailed", (r) => out.errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`));
    page.on("response", (r) => { if (r.status() >= 400) out.errors.push(`HTTP ${r.status()}: ${r.url()}`); });
    await page.setViewport(viewport);
    if (opts.practice) await installClock(page);
    // --moments 가 아니면 [결정 OFF] (예전처럼 멈추지 않고 흐른다 — 사냥 · 프레임 · 골 흐름이 장면에서 서지 않게)
    await page.goto(`${baseUrl}/index.html?hex=1&auto=1${opts.moments ? "" : "&moments=0"}`, { waitUntil: "load" });
    if (opts.moments) {
      await enterPractice(page, out, pass, fail, opts.seed);
      await momentFlow(page, size, opts, out, pass, fail);
    } else if (opts.practice) {
      await enterPractice(page, out, pass, fail, opts.seed);
      await huntActs(page, size, opts, out, pass, opts.ult ? ACT_TURN_CAP.ult : ACT_TURN_CAP.plain);
      if (opts.ult) await ultFlow(page, size, opts, out, pass, fail);
      await huntEmotes(page, size, opts, out, pass, fail);
    }
    else {
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("새 런 시작")), { timeout: 15000 });
      await clickText(page, "새 런 시작");
      await page.waitForFunction(() => window.__soccer?.store?.screen === "setup", { timeout: 8000 });
      if (!(await clickText(page, "기본 편성으로 시작"))) throw new Error("[기본 편성으로 시작] 버튼이 없습니다");
      await page.waitForFunction(() => window.__soccer.store.screen === "run" && window.__soccer.store.run, { timeout: 8000 });
      const ent = await enterFriendly(page);
      if (!ent.ok) throw new Error(`친선전 주를 찾지 못했습니다 (phase ${ent.phase}, ${ent.n} 걸음)`);
      await page.waitForFunction(() => window.__soccer.store.run?.phase === "match" && document.querySelector(".hex-screen"), { timeout: 8000 });
      await page.waitForFunction(() => document.querySelector(".hex-screen canvas") && window.__soccer.hexView?.renderer && window.__soccer.hexView.renderer !== "pending", { timeout: 15000 });
    }
    const renderer = await page.evaluate(() => window.__soccer.hexView.renderer);
    if (renderer === "webgl") pass("renderer webgl"); else fail(`renderer = ${renderer} (webgl 이어야 한다)`);
    await sleep(400); // 얼굴 그림 · 첫 그리기

    // 프레임
    for (let i = 0; i < opts.frames; i++) {
      if (i) await sleep(opts.gap);
      const file = path.join(opts.outDir, `${size}-${i}.png`);
      await page.screenshot({ path: file });
      const ins = await inspect(page);
      out.files.push(file);
      out.frames.push({ file, turn: ins.dbg?.turn, stage: ins.dbg?.stage, score: ins.dbg?.score, cam: ins.dbg?.cam, fps: ins.dbg?.fps, clock: ins.hud.clock.text, name: ins.name?.text ?? null, act: actLine(ins.dbg) });
      if (i === 0) {
        if (ins.canvas?.match) pass(`캔버스 = .hx-pitch (${ins.canvas.css.join("×")}, 버퍼 ${ins.canvas.w}×${ins.canvas.h})`);
        else fail(`캔버스 크기가 .hx-pitch 와 다르다: ${JSON.stringify(ins.canvas)}`);
        const bad = Object.entries(ins.hud).filter(([, v]) => !v.ok).map(([k, v]) => `${k} ${JSON.stringify(v)}`);
        if (bad.length) fail(`HUD 가 화면 밖 · 안 보임: ${bad.join("; ")}`); else pass("HUD (이름 · 점수 · 보조 줄 · 시계 · 배속 · ⏭) 보임");
        const cl = Object.entries(ins.clipped).filter(([, v]) => v).map(([k]) => k);
        if (cl.length) fail(`HUD 글자 잘림: ${cl.join(", ")}`);
        if (ins.hscroll) fail("가로 스크롤이 생겼다");
      }
      if (ins.name && !ins.name.ok) fail(`이름표가 화면 밖: ${JSON.stringify(ins.name)}`);
    }
    const flow = out.frames.filter((f) => !f.hunt); // 동작 사냥 사진 (멈춘 시계) 은 빼고
    const turns = flow.map((f) => f.turn);
    // 골 장면 (~1.6 초) · 컷인 (H3 — 시계가 멈춘다) 이 사진 간격에 걸치면 같은 turn 이 두 장 나올 수 있다 → 줄지 않고 처음보다 끝이 크면 흐른다
    if (turns.length > 1 && turns.every((t, i) => !i || t >= turns[i - 1]) && turns[turns.length - 1] > turns[0]) pass(`경기가 흐른다 (turn ${turns.join(" → ")}, 시계 ${flow.map((f) => f.clock).join(" → ")})`);
    else if (turns.length > 1) fail(`turn 이 늘지 않는다: ${turns.join(", ")}`);
    // 카메라 떨림: 2초 동안 매 프레임 cam 을 떠서 한 프레임 이동량 · 방향 뒤집힘을 본다
    const camProbe = await page.evaluate(() => new Promise((resolve) => {
      const pts = [];
      const t0 = performance.now();
      const tick = () => {
        const d = window.__soccer.hexView;
        const c = d?.cam;
        if (c) pts.push([c.cx, c.cy, c.z, performance.now(), d.score.home + d.score.away]);
        if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
        else resolve(pts);
      };
      requestAnimationFrame(tick);
    }));
    {
      let maxStep = 0;
      let flips = 0;
      let goalAt = -Infinity;
      let goals = 0;
      for (let i = 1; i < camProbe.length; i++) {
        // 골 뒤 1.6 초 (골 장면 — 카메라가 일부러 전체로 빠르게 빠진다) 는 따라가기 떨림 잣대에서 뺀다
        if (camProbe[i][4] !== camProbe[i - 1][4]) { goalAt = camProbe[i][3]; goals += 1; }
        if (camProbe[i][3] - goalAt < 1600) continue;
        const [x0, y0, , t0] = camProbe[i - 1];
        const [x1, y1, z1, t1] = camProbe[i];
        // 60 fps 한 프레임 (16.7 ms) 으로 맞춘 이동량 — 헤드리스 (특히 휴대폰 DPR 2.625 SwiftShader) 프레임이 느려도 같은 잣대
        maxStep = Math.max(maxStep, (Math.hypot(x1 - x0, y1 - y0) * z1 * 16.7) / Math.max(16.7, t1 - t0));
        if (i > 1) {
          const [xa, ya] = camProbe[i - 2];
          const d0 = [x0 - xa, y0 - ya];
          const d1 = [x1 - x0, y1 - y0];
          if (Math.hypot(...d0) > 0.5 && Math.hypot(...d1) > 0.5 && d0[0] * d1[0] + d0[1] * d1[1] < 0) flips += 1;
        }
      }
      out.cam = { samples: camProbe.length, maxStep: Math.round(maxStep * 10) / 10, flips, goals };
      if (maxStep > 30 || flips > 2) fail(`카메라가 튄다 (60 fps 한 프레임 최대 ${out.cam.maxStep}px · 방향 뒤집힘 ${flips}번 / ${camProbe.length} 프레임)`);
      else pass(`카메라 부드러움 (60 fps 한 프레임 최대 ${out.cam.maxStep}px · 뒤집힘 ${flips} / ${camProbe.length} 프레임${goals ? ` · 골 장면 ${goals}번 뺌` : ""})`);
    }
    {
      const pb = await probeBanners(page);
      if (pb.error) fail(`배너 검사: ${pb.error}`);
      else {
        const bad = pb.list.filter((x) => !x.ok);
        if (bad.length) fail(`배너가 화면 밖 · 너무 큼 · 배경 있음: ${JSON.stringify(bad)}`);
        else pass(`배너 ${pb.list.length}가지 (골 · 골든골 · 승부차기 · PK) 화면 안 · 작게 · 배경 없음`);
      }
    }
    const zs = out.frames.filter((f) => !f.hunt).map((f) => f.cam?.z ?? 1);
    if (zs.some((z) => z > 1.05)) pass(`카메라 따라가기 (z ${zs.map((z) => z.toFixed(2)).join(", ")})`);
    else fail(`카메라가 확대하지 않았다 (z ${zs.join(", ")})`);

    // 골 장면 (선택)
    if (opts.goal) {
      const g0 = await page.evaluate(() => { const d = window.__soccer.hexView; window.__soccer.store.matchUi.speed = 4; return d.score.home + d.score.away; });
      const ok = await page.waitForFunction((n) => { const d = window.__soccer.hexView; return d && (d.score.home + d.score.away > n || d.finished); }, { timeout: 120000, polling: 16 }, g0).then(() => true, () => false);
      // 골 턴에 컷인 (필살 슛) 이 있으면 엔진 점수가 먼저 바뀌고 그림은 컷인 뒤 — "골!" 배너가 뜰 때부터 찍는다 (못 보면 그대로)
      if (ok) await page.waitForFunction(() => document.querySelector(".hex-screen .hx-banner.hx-show.hx-goal") || window.__soccer.hexView?.finished, { timeout: 8000, polling: 16 }).catch(() => out.notes.push("골 배너를 못 봤다 (--goal)"));
      if (ok) {
        for (const [i, ms] of [[0, 60], [1, 250], [2, 400], [3, 500]]) {
          await sleep(ms);
          const file = path.join(opts.outDir, `${size}-goal-${i}.png`);
          await page.screenshot({ path: file });
          out.files.push(file);
          const d = await page.evaluate(() => window.__soccer.hexView);
          out.frames.push({ file, turn: d?.turn, stage: d?.stage, score: d?.score, cam: d?.cam, act: actLine(d) });
        }
        await page.evaluate(() => { window.__soccer.store.matchUi.speed = 1; });
      } else fail("2분 안에 골이 나지 않았다 (--goal)");
    }

    if (opts.practice) {
      await finishPractice(page, size, opts, out, pass, fail);
      await sleep(300);
      return out;
    }

    // ⏭ → 결과 → 확인
    if (!(await page.evaluate(() => { const b = document.querySelector(".hex-screen .skip-btn"); if (!b || b.disabled) return false; b.click(); return true; }))) {
      fail("⏭ 버튼을 누를 수 없다");
    }
    const modal = await page.waitForFunction(() => document.querySelector("#modal-root .score-big"), { timeout: 6000 }).then(() => true, () => false);
    if (!modal) throw new Error("⏭ 뒤 결과 모달이 열리지 않았다");
    await sleep(500);
    const rfile = path.join(opts.outDir, `${size}-result.png`);
    await page.screenshot({ path: rfile });
    out.files.push(rfile);
    const res = await page.evaluate(() => ({
      score: document.querySelector("#modal-root .score-big")?.textContent,
      verdict: document.querySelector("#modal-root .result-verdict")?.textContent,
      rows: document.querySelectorAll("#modal-root .stats-table tbody tr").length,
      modalFits: (() => { const m = document.querySelector("#modal-root .modal"); if (!m) return null; const r = m.getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1 && m.scrollHeight <= m.clientHeight + 1; })(),
    }));
    out.result = res;
    if (res.rows >= 7) pass(`결과 모달 ${res.score} ${res.verdict} · 표 ${res.rows}줄`); else fail(`결과 표 줄 수 ${res.rows}`);
    if (res.modalFits === false) fail("결과 모달이 화면에 다 들어가지 않는다 (스크롤 · 잘림)");
    if (!(await clickText(page, "확인", "#modal-root"))) throw new Error("결과 모달의 [확인] 이 없다");
    const left = await page.waitForFunction(() => window.__soccer.store.run?.phase !== "match", { timeout: 6000 }).then(() => true, () => false);
    const after = await page.evaluate((key) => ({
      phase: window.__soccer.store.run?.phase, hexMatch: window.__soccer.store.hexMatch, saved: localStorage.getItem(key),
      canvas: !!document.querySelector("canvas"), screen: document.querySelector("#app > .screen")?.dataset?.screen ?? null,
    }), KEYS.hexMatch);
    out.after = after;
    if (left && after.hexMatch == null && after.saved == null && !after.canvas) pass(`런 계속 (phase ${after.phase}, hexMatch · 저장 비움, 캔버스 정리)`);
    else fail(`확인 뒤 상태가 이상하다: ${JSON.stringify(after)}`);
    await sleep(300);
  } catch (e) {
    fail(`예외: ${e && e.message ? e.message : e}`);
  } finally {
    await context.close().catch(() => {});
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* main                                                                  */
/* ------------------------------------------------------------------ */

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }
  if (opts.help || !opts.outDir) {
    console.log(usage());
    if (!opts.help) process.exitCode = 2;
    return;
  }
  opts.outDir = path.resolve(opts.outDir);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const browserInfo = findBrowser();
  if (!browserInfo) {
    console.log("Chrome/Edge 를 찾지 못했습니다 — CHROME_PATH 환경변수로 지정하세요. (건너뜀)");
    return;
  }
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch (e) {
    console.error("puppeteer-core 가 없습니다 — npm install 후 다시 실행하세요.");
    process.exitCode = 1;
    return;
  }
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), "hex-shot-"));
  const args = ["--no-first-run", "--no-default-browser-check", "--disable-extensions", "--lang=ko-KR"];
  if (!opts.gpu) args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  const browser = await puppeteer.launch({ executablePath: browserInfo.path, headless: true, userDataDir: udd, args });
  const results = [];
  try {
    const gl = await (async () => {
      const p = await browser.newPage();
      try {
        return await p.evaluate(() => {
          const c = document.createElement("canvas").getContext("webgl2") || document.createElement("canvas").getContext("webgl");
          const ext = c && c.getExtension("WEBGL_debug_renderer_info");
          return c ? (ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "webgl") : "없음";
        });
      } finally {
        await p.close();
      }
    })();
    console.log(`브라우저 ${browserInfo.path} (${browserInfo.source}) · ${opts.gpu ? "GPU" : "SwiftShader"} · WebGL: ${gl}`);
    for (const size of opts.sizes) results.push(await runSize(browser, baseUrl, size, opts));
  } finally {
    await browser.close().catch(() => {});
    server.close();
    for (let i = 0; i < 5; i++) {
      try { fs.rmSync(udd, { recursive: true, force: true }); break; } catch { await sleep(300); } // Windows: 브라우저가 파일을 늦게 놓는다
    }
  }

  let bad = 0;
  for (const r of results) {
    console.log(`\n== ${r.size} (${r.viewport.isMobile ? `휴대폰 DPR ${r.viewport.deviceScaleFactor}` : "데스크톱 DPR 1"})`);
    for (const f of r.frames) console.log(`  ${path.basename(f.file)}  turn ${f.turn} ${f.stage ?? ""} ${f.clock ? `시계 ${f.clock}` : ""} 점수 ${f.score ? `${f.score.home}:${f.score.away}` : "-"} cam z ${f.cam ? f.cam.z.toFixed(2) : "-"}${f.name ? ` 이름표 ${f.name}` : ""}${f.fps && f.fps < 1000 ? ` fps ${f.fps}` : ""}${f.act ? ` [${f.act}]` : ""}`);
    if (r.result) console.log(`  ${r.size}-result.png  ${r.result.score} ${r.result.verdict}`);
    for (const c of r.checks) console.log(`  ${c.ok ? "OK  " : "FAIL"} ${c.msg}`);
    for (const e of r.errors) console.log(`  ERR  ${e}`);
    for (const n of r.notes) console.log(`  NOTE ${n}`);
    const n = r.checks.filter((c) => !c.ok).length + r.errors.length;
    bad += n;
  }
  console.log(`\n${bad ? `실패 ${bad}건` : "통과"} — ${results.map((r) => `${r.size}: ${r.files.length}장`).join(", ")} → ${opts.outDir}`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
