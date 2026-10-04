// js/ui/screens/lesson.js — 레슨 화면 (phase lesson; 레슨 결과 모달의 배경 — inert). LESSON_PROTO_PLAN §14.16 "레슨 화면" (구역 방식, ZU2).
//
//   ┌ HUD: ➡️ 패스 중점 ★특별 ×2.0 │ 턴 ●●●○○○ 4/6 │ 점수 [████▌··|···] 286 / 목표 495 · 퍼펙트 624 │ 버프 칩 ─────────────┐
//   │ ┌ 경기장 (.pitch > .m-field, 968×392) ──────────────────────────────┐ ┌ 옆 252 ───────────────────┐ │
//   │ │  구역 바닥 5 (.zone-pad) + 라벨 칩 (.zone-chip, 바닥 바로 위)        │ │ 벤치 (턴 끝 +15 · 최대 2) │ │
//   │ │  토큰 = 뷰 positions (구역 대형) · 이름표는 대형 바깥쪽 / 4명부터 짧게 │ │ 명단 7: 구역 · 체력 · 실패 · [벤치] │ │
//   │ │  조준: 원(점선) · 십자 · 전체 빛 · 추천 원(청록) · 대상 말풍선       │ │ 팀워크 · 방침              │ │
//   │ └──────────────────────────────────────────────────────────────────┘ └──────────────────────────┘ │
//   ├ dock: [덱][버림] │ 손패 (끌어서 경기장에) │ 안내 · 미리보기 합계 · 노트 │ [내기][턴 끝] ┤
//
// 조작 (§14.16)
//   끌기: 손패 카드를 누르고 6px 넘게 움직이면 끌기 → 카드 유령이 포인터를 따르고, 경기장 위에서는 조준 표시(원 · 십자 · 전체 빛)로 바뀐다.
//         프레임마다(rAF) 엔진 previewCard({ uid, at }) → 대상 토큰 흰 고리 + 말풍선 "+12" · 실패 후보 빨강 · dock 안내 합계.
//         경기장 위에서 놓으면 playCard({ uid, at }), 회복 카드는 명단 줄 · 벤치 칸에 놓아도 된다 (playerId). 밖에서 놓거나 Esc = 취소.
//   벤치: 카드를 끌지 않을 때 경기장 토큰을 벤치 칸에 끌어 놓기 = benchPlayer(on), 벤치 토큰을 경기장에 = 복귀. 명단 [벤치]/[복귀] · 토큰 포커스 + B 도 같다.
//   대체 조작: 카드 클릭 · Enter = 조준 모드 (store.lessonUi.aim) → 마우스는 원이 hover 를 따르고 경기장 클릭 = 그 점에 낸다,
//         터치는 탭 = 원 놓기 · 같은 자리 다시 탭 / [내기] = 내기. 키보드 ← → (Tab) = dropCandidates 후보, 1~5 = 구역 중심, Enter = 내기, Esc = 취소.
//         전체 · 주인 · 없음 카드는 [내기] · 카드 두 번 클릭 · Enter.
// 엔진 호출 = ctx.actions.lessonCall (호출 1번 = 저장 1번, render 없음). 화면 DOM 은 그대로 두고 부분만 고친다.
// 연출: lastFx(lesson_layout.fxPlan) → 카드: 비용 → 대상이 제자리에서 훈련 동작(구역 색 고리) → "+N" 팝 → 버프 칩.
//   턴 끝: 기본 훈련 "+N" 회색 팝이 전원 동시에 + 점수 막대 → 벤치 "+15" → 새 턴 흩어지기 (토큰이 새 자리로 450ms) → 새 손패.
//   재생 중 busy (입력 무시). 레슨이 끝나면 재생 뒤 ctx.render() → 보상 모달. GEN (app.render 가 gen +1) → 옛 화면 타이머는 alive() 로 멈춘다.
// 코치 지원 (§15.8, L37): 붙은 카드 = 코치 칩 · 코치 타입 색 테두리 (cards.js), 끌기 유령에도 코치 얼굴. 그 카드를 내면 코치 컷인 (.ls-cutin —
//   화면 전체 덮개 · 코치 타입 색 띠 · 얼굴 · 이름 · 대사 · 능력, 첫 번 attach.cutinMs.first · 다음부터 repeat 짧은 판, 탭 · Enter · Space · Esc = 넘기기)
//   → 카드 연출 (대상 고리 = 코치 색, 능력 배율이 걸린 "+N ×1.5" 는 코치 색) + 경기장 가운데 능력 알약 (얼굴 · 능력 이름 · 결과 — 유대 · 힌트 · 컨디션).
//   no-anim(움직임 줄이기)이면 덮개 없이 dock 안내 칸에 "하르나 지원 발동 — …". 새 턴에 붙으면 손패가 들어온 뒤 칩이 튀어나온다.
// 고유 카드 모양 (§16.7, L40 — 판정은 늘 엔진 previewCard 의 shape · targets, UI 는 점 · 선수 id · 구역 id 만 넘긴다):
//   이어 주기 · 연결 · 크로스 (needs player): 주인 토큰 → 받는 선수 선 (.aim-link — 이어 주기 = 실선 + 공, 연결 · 크로스 = 점선), 받는 후보 초록 테 · 나머지 흐리게,
//     크로스는 슈팅 구역 바닥이 빛난다. 카드를 받는 선수 위에 끌어 놓거나, 조준 중 받는 선수를 누르거나, **주인 토큰을 끌어** 받는 선수에 놓는다.
//   자리 옮기기 · 가로지르기 (needs zone): 주인 토큰 유령 (.aim-ghost — 끄는 중에는 포인터, 아니면 옮긴 뒤 자리) · 포인터 밑 구역 바닥 강조 ·
//     주인 → 옮긴 자리 화살표 (.aim-arrow) · 꼬리표 "+N ×1.3 · 기본 +b" / "+a 수비 · +b 패스". 가로지르기는 지금 구역 바닥도 다른 색 (.zone-pad.from).
//     구역 바닥을 누르거나 · 숫자 1~5 (가로지르기는 지금 구역 숫자 무시) · 카드나 주인 토큰을 구역에 끌어 놓는다.
//   둘레 작은 · 중간 원 (ownerCircle): 카드를 집는 순간 주인 중심 원 (.aim-circle.owner) · 구역 전원 (ownerZone): 주인 구역 바닥 · 마무리 (owner): 주인 토큰 빛.
//     자리를 고르지 않는다 — 카드 두 번 누르기 · [내기] · Enter · 경기장 아무 데나.
//   연출: fx move → 주인 토큰이 새 자리로 뛰어간다 (두 대형이 다시 모인다) / fx pass → 공 호 (.ls-ball) → 훈련 동작, 받는 선수 "+N ×1.3", 가로지르기 두 팝.
// 개발용 ?autolesson=1: 600ms 마다 감독 추천(manager.recommendCard: bench · play { at, playerId, zone } · endTurn)을 그대로 낸다 (컷인도 그대로 — 저절로 닫힌다). inert: 마지막 상태만.
// 스탯 보기 (§17): 명단 줄 두 번째 줄 = 서 있는 구역의 지금 스탯 "🛡️ 수비 B 552 +18" (+N = 이번 레슨 상승, 벤치 = 돌아갈 구역, 결장 = 부상 · 이번 상승 합).
//   선수 정보 팝오버 (.ls-pinfo — lesson_layout.playerStatInfo): 스탯 5개 등급 · 지금 값 · 이번 레슨 상승 · 성장률, 자리 · 구역 · 체력 · 실패율 · 기본 / 카드 / 부 나눔.
//   여는 법: 카드를 고르지 않았을 때 토큰 · 명단 줄 누르기 (탭) · 마우스 올리기 (잠깐 — 누르면 고정), 명단 ⓘ 버튼 (카드를 골랐어도 늘),
//   토큰 포커스 + Enter · Space (카드를 고르지 않았을 때) · I (늘). 닫기: 바깥 누르기 · Esc · 같은 토큰 · 줄 · ⓘ 다시 · × 버튼. 끌기가 시작되면 닫는다.
//   카드를 골랐을 때 토큰 누르기는 그대로 자리 고르기다 (팝오버를 열지 않는다).
import { h, avatar, bar, gradeBadge, openModal, toast } from '../dom.js';
import * as L from '../labels.js';
import { cardFace, miniCard, attachTitle, shapeIconKey, shapeHow, multShort } from '../cards.js';
import { tokenSpot, pointerToField, circlePx, fxPlan, scoreAfterPlay, handStep, playerStatInfo, FIELD_PX, TOKEN_PX } from '../lesson_layout.js';
import { stamCls } from '../hud.js';
import { uniqueNote } from './reward.js';

/** 연출 시간 (ms): 훈련 동작 · +N 머무르기 · 턴 끝 기본 훈련 · 흩어지기 · 턴 배너 · 레슨 끝 배너 · 자동 진행 간격 · 자동 진행 조준 보여 주기 */
export const LESSON_T = { act: 280, hold: 560, tick: 650, scatter: 450, turn: 260, end: 1000, auto: 600, aimShow: 320, move: 450, pass: 300 };
const CARD_W = 176;
const DRAG_PX = 6;
/** 코치 컷인 길이 (ms) — data.lesson.attach.cutinMs 가 없을 때 (§15.3: 첫 번 900 · 다음부터 600) */
export const CUTIN_MS = { first: 900, repeat: 600 };
/** 키 1~5 = 구역 (위 줄 왼 → 오, 아래 줄 왼 → 오 — 화면에서 읽는 순서) */
export const ZONE_KEY_ORDER = ['defense', 'pass', 'shoot', 'physical', 'dribble'];

function prefersReducedMotion() {
  try {
    return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (_) {
    return false;
  }
}
function autoLessonOn() {
  try {
    return new URLSearchParams(globalThis.location?.search || '').get('autolesson') === '1';
  } catch (_) {
    return false;
  }
}
const pctText = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
/** 단어 잇기 (U+2060) — 카드 이름 뒤 "+" 만 다음 줄로 넘어가지 않게 */
const WJ = String.fromCharCode(0x2060);
const round1 = (x) => Math.round(x * 10) / 10;
const px = (x) => `${round1(x)}px`;
const initialOf = (name) => {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
};
const shortName = (name) => Array.from(String(name ?? '')).slice(0, 2).join('');
const zoneShort = (z) => L.STAT_LABELS[z] ?? z ?? '';
/** 받침 있는 글자인가 (조사: 과/와 · 을/를 · 이/가) */
const hasBatchim = (word) => {
  const ch = Array.from(String(word ?? '')).pop();
  const c = ch ? ch.charCodeAt(0) - 0xac00 : -1;
  return c >= 0 && c <= 11171 && c % 28 !== 0;
};
const josa = (word, withB, without) => `${word}${hasBatchim(word) ? withB : without}`;
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
/** 고유 카드 모양이 놓을 자리를 요구하는가: 'player' (이어 주기 · 연결 · 크로스) · 'zone' (자리 옮기기 · 가로지르기) · null */
const shapeNeedsOf = (c) => (c && c.shape && c.shape.needs) || null;
/** 회복 카드 문구의 "체력 +N" (강화판 문구 그대로 — 뷰 desc 는 강화판이면 descPlus) */
const healAmountOf = (c) => {
  const m = String(c?.desc || '').match(/체력 \+(\d+)/);
  return m ? Number(m[1]) : null;
};

export function renderLesson(root, ctx, { inert = false } = {}) {
  const { store, data, run, manager, safe, actions } = ctx;
  const ui = store.lessonUi;
  const gen = ui.gen;
  const st = () => store.run;
  const reduced = prefersReducedMotion();
  const autoMode = !inert && autoLessonOn();

  const screen = h('div', { class: ['screen', 'og', 'lesson-screen', inert ? 'inert' : '', reduced ? 'no-anim' : ''], dataset: { screen: 'lesson' } });
  root.append(screen);

  const getView = (quiet = inert) => {
    if (quiet) { try { return run.getLessonView(st(), data); } catch (_) { return null; } }
    return safe(() => run.getLessonView(st(), data));
  };
  let v = getView();
  if (!v) {
    if (inert) { screen.classList.add('lesson-blank'); return; } // 보상 모달 배경: 레슨 상태가 없으면 빈 배경
    screen.classList.add('og-error');
    screen.append(h('div', { class: 'error-panel' }, '레슨 화면 정보를 불러올 수 없습니다.'),
      h('button', { class: 'btn', onclick: () => actions.resetToStart() }, '처음으로'));
    return;
  }
  const isLive = () => !inert && st()?.phase === 'lesson' && st()?.lesson?.status === 'playing';
  const alive = () => gen === ui.gen && screen.isConnected;
  ui.shownSeq = v.seq; // 새로고침 · 다시 그리기 뒤에는 지난 연출을 다시 재생하지 않는다
  ui.busy = false;
  ui.drag = null;
  // 조준 중인 카드가 손패에 없으면(다른 상태) 조준을 푼다 — 다시 그려도 조준은 남는다 (§14.17 lessonUi)
  if (ui.aim && !(v.hand || []).some((c) => c.uid === ui.aim.uid && c.playable)) ui.aim = null;
  if (!isLive()) ui.aim = null;

  const Z = v.zoneCfg;
  const LS = data.lesson?.lesson || {};
  const benchRecover = LS.bench?.recover ?? 15;
  const policy = L.policyInfo(st().policy, data);

  /* ------------------------------------------------------------------ */
  /* DOM 골격 (한 번 만들고 부분 갱신)                                        */
  /* ------------------------------------------------------------------ */
  // ---- HUD ----
  const zoneTitle = `${zoneShort(v.zone)} 중점${v.prep ? ' · 대비' : ''}`;
  const multTxt = L.multText(v.zoneMult);
  const hudTitle = h('div', { class: 'lh-title' },
    h('h2', {}, h('span', { class: 'lh-ico' }, L.ZONE_ICONS[v.zone] ?? ''), zoneTitle,
      h('span', {
        class: ['badge', v.special ? 'badge-gold' : 'badge-focus', 'lh-special'],
        title: v.special
          ? `특별 레슨 — ${L.zoneLabel(v.zone)} 상승 ${multTxt} · 목표 ×${LS.special?.targetMult ?? 1.15}`
          : `${L.FOCUS_LABEL} — 서 있을 확률 ×${LS.focus?.weight ?? 2} · 상승 ${multTxt}`,
      }, v.special ? `★특별 ${multTxt}` : multTxt)),
    h('span', { class: 'muted small' }, `시즌 ${v.season} · ${v.week}주 · ${policy.name}`));
  const turnPips = h('span', { class: 'lh-pips' });
  const turnNum = h('b', { class: 'lh-turn-n' });
  const hudTurn = h('div', { class: 'lh-turn' }, h('span', { class: 'tiny muted' }, '턴'), turnPips, turnNum);
  const scoreNum = h('b', { class: 'lh-score-n' });
  const scoreFill = h('i', { class: 'lh-fill' });
  const scoreGhost = h('i', { class: 'lh-ghost' });
  const targetMark = h('i', { class: 'lh-target-mk' });
  const scoreText = h('span', { class: 'lh-score-t' });
  const scoreDelta = h('span', { class: 'lh-delta' });
  const hudScore = h('div', { class: 'lh-score' },
    h('div', { class: 'lh-score-top' }, h('span', { class: 'tiny muted' }, '점수'), scoreNum, scoreDelta, scoreText),
    h('div', { class: 'lh-bar', 'aria-hidden': 'true' }, scoreFill, scoreGhost, targetMark));
  const chipsEl = h('div', { class: 'lh-chips' });
  const hud = h('header', { class: 'lh' }, hudTitle, hudTurn, hudScore, chipsEl);

  // ---- 경기장 (경기 화면 마크업: .pitch > .m-field > .pitch-bg) ----
  const bg = h('div', { class: 'pitch-bg' },
    h('div', { class: 'pl-half' }), h('div', { class: 'pl-circle' }),
    h('div', { class: 'pl-box top' }), h('div', { class: 'pl-box bottom' }),
    h('div', { class: 'pl-goal top' }), h('div', { class: 'pl-goal bottom' }),
    h('div', { class: 'pl-spot top' }), h('div', { class: 'pl-spot bottom' }));
  const zoneLayer = h('div', { class: 'zone-layer', 'aria-hidden': 'true' });
  const aimCircle = h('div', { class: 'aim-circle' });
  const recCircle = h('div', { class: 'aim-rec' });
  const aimCross = h('div', { class: 'aim-cross' }, h('i', { class: 'ac-h' }), h('i', { class: 'ac-v' }), h('i', { class: 'ac-r' }));
  const aimTag = h('div', { class: 'aim-tag' });
  // 고유 카드 모양 (§16.7): 주인 → 받는 선수 선 · 주인 → 옮긴 자리 화살표 · 옮긴 자리 점 · 주인 토큰 유령
  const aimLink = h('div', { class: 'aim-link' }, h('i', { class: 'al-ball' }));
  const aimArrow = h('div', { class: 'aim-arrow' }, h('i', { class: 'aa-head' }));
  const aimSpot = h('div', { class: 'aim-spot' });
  const aimGhost = h('div', { class: 'aim-ghost tok-ghost' }, h('span', { class: 'ag-face' }));
  const aimLayer = h('div', { class: 'aim-layer', 'aria-hidden': 'true' }, recCircle, aimCircle, aimCross, aimLink, aimArrow, aimSpot);
  const ghostLayer = h('div', { class: 'aim-ghost-layer', 'aria-hidden': 'true' }, aimGhost);
  const tokLayer = h('div', { class: 'tok-layer' });
  const chipLayer = h('div', { class: 'zone-chips', 'aria-hidden': 'true' });
  const popLayer = h('div', { class: 'pop-layer', 'aria-hidden': 'true' }, aimTag);
  const field = h('div', { class: 'm-field', role: 'application', 'aria-label': '경기장 — 카드를 끌어 놓을 자리' },
    bg, zoneLayer, aimLayer, tokLayer, ghostLayer, chipLayer, popLayer);
  const grass = h('div', { class: 'pitch' }, field);
  const pitchWrap = h('div', { class: 'ls-pitch' }, grass);

  // ---- 오른쪽: 벤치 · 명단 · 팀워크 ----
  const benchNote = h('span', { class: 'tiny muted ls-bench-note' });
  const benchSlots = h('div', { class: 'ls-bench-slots' });
  const benchEl = h('div', { class: 'ls-bench', title: '지친 선수를 끌어 놓으면 이번 턴은 쉰다 — 기본 훈련 · 카드 대상 없음, 턴 끝 체력 회복' },
    h('div', { class: 'ls-bench-head' }, h('b', {}, '벤치'), benchNote), benchSlots);
  const sideRows = h('div', { class: 'ls-rows' });
  const sideFoot = h('div', { class: 'ls-foot' });
  const side = h('aside', { class: ['og-panel', 'ls-side'] }, benchEl, sideRows, sideFoot);

  // ---- 손패 dock ----
  const drawBtn = h('button', { class: 'btn btn-sm ls-pile', type: 'button', onclick: () => openPile('draw') });
  const discBtn = h('button', { class: 'btn btn-sm ls-pile', type: 'button', onclick: () => openPile('discard') });
  const pileNote = h('span', { class: 'tiny muted ls-pile-note' });
  const playsEl = h('span', { class: 'ls-plays' });
  const piles = h('div', { class: 'ls-piles' }, playsEl, drawBtn, discBtn, pileNote);
  const handEl = h('div', { class: 'ls-hand' });
  const infoEl = h('div', { class: 'ls-info', role: 'status', 'aria-live': 'polite' });
  const playBtn = h('button', { class: 'btn btn-primary ls-play', type: 'button', onclick: () => playAim() }, '내기');
  const endBtn = h('button', { class: 'btn ls-end', type: 'button', onclick: () => endTurn() }, '턴 끝');
  const btns = h('div', { class: 'ls-btns' }, playBtn, endBtn);
  const dock = h('div', { class: 'ls-dock' }, piles, handEl, infoEl, btns);

  const ghost = h('div', { class: 'drag-ghost', 'aria-hidden': 'true' });
  // 선수 정보 팝오버 (§17): 토큰 옆 · 명단 줄 왼쪽에 뜬다 (화면 좌표 — 무대 배율을 나눈 값)
  const pinfo = h('div', { class: 'ls-pinfo', role: 'dialog', 'aria-hidden': 'true' });
  // 코치 컷인 덮개 (§15.8 ②): 레슨 화면 전체 — 떠 있는 동안 경기장 · 손패 입력을 막고, 누르면 넘긴다
  const cutLayer = h('div', { class: 'ls-cutin', role: 'status', 'aria-live': 'polite' });
  cutLayer.addEventListener('pointerdown', (e) => { if (cutClose) { e.preventDefault?.(); e.stopPropagation?.(); cutClose(); } });
  cutLayer.addEventListener('click', (e) => { e.stopPropagation?.(); if (cutClose) cutClose(); });
  screen.append(hud, pitchWrap, side, dock, pinfo, ghost, cutLayer);

  /* ------------------------------------------------------------------ */
  /* 상태 · 좌표                                                           */
  /* ------------------------------------------------------------------ */
  let W = FIELD_PX.w;
  let H = FIELD_PX.h;
  const tokEls = new Map();
  const rowEls = new Map();
  let pv = null;          // 조준 · 끄는 카드의 previewCard
  let rec = null;         // manager.recommendCard
  let hoverAt = null;     // 조준 모드 마우스 hover 점 (필드 %) — 확정 점(ui.aim.at)보다 앞선다
  let candCache = null;   // { uid, list } dropCandidates (키보드 후보 · 단일 후보 강조)
  let press = null;       // 누른 포인터 { kind: 'card'|'tok', uid | id, from, x0, y0, pointerId, el, started }
  let lastPt = null;      // 끄는 중 마지막 포인터 (client px)
  let frameReq = false;
  let suppressClick = false;
  let benchFx = null;     // 방금 벤치에 들어간 선수 (칸 등장 연출)
  let cutClose = null;    // 떠 있는 컷인을 닫는 함수 (탭 · 키 · 시간)
  let cutNote = null;     // 컷인 연출 중 dock 안내 { color, name, short, ability, text } (no-anim 에서는 이 줄이 컷인 대신)
  let attachNew = null;   // 새 턴에 막 붙은 카드 uid (칩 튀어나오기)
  let cutRecap = null;    // no-anim: 방금 발동한 지원 (연출이 0ms 라 컷인 대신 다음 조작 전까지 안내 칸에 남긴다)
  let infoPop = null;     // 선수 정보 팝오버 { id, src: 'tok' | 'row' | 'btn', pinned } (§17) — pinned = 누르기 · 키로 연 것 (hover 는 떠나면 닫힌다)
  let hoverTid = null;    // hover 로 여는 짧은 지연 타이머
  const thresholds = data.config?.rating?.thresholds;
  let shown = { score: v.score, stamina: {} }; // 연출 중 보여 주는 값 (점수 · 체력 · 턴)

  function measure() {
    const w = field.clientWidth;
    const hh = field.clientHeight;
    if (w > 40 && hh > 40) { W = w; H = hh; }
  }
  const toPx = (s) => [(s.x / 100) * W, (s.y / 100) * H];
  const distU = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * Z.aspect);
  function later(fn, ms) {
    const id = setTimeout(() => { if (alive()) fn(); }, Math.max(0, reduced ? 0 : ms));
    ui.timer = id;
    return id;
  }
  const setBusy = (b) => { ui.busy = b; screen.classList.toggle('busy', b); };
  const CUT_MS = { ...CUTIN_MS, ...(data.lesson?.attach?.cutinMs || {}) };
  /** 화면의 코치 색 (co-<타입> · --coach-face): 조준 말풍선 · 연출 고리 · 팝 · 능력 알약이 쓴다. 지원이 없으면 지운다 */
  function setCoach(type, color) {
    for (const z of ZONE_KEY_ORDER) screen.classList.remove(`co-${z}`);
    if (type) screen.classList.add(`co-${type}`);
    if (color) screen.style.setProperty('--coach-face', color);
    else screen.style.removeProperty('--coach-face');
  }
  /** 컷인 대사 (lesson.json attach.abilities[id].line — UI 전용) */
  const coachLine = (supportId) => data.lesson?.attach?.abilities?.[supportId]?.line || '';
  const playerOf = (id) => (v.players || []).find((p) => p.id === id);
  const staminaOf = (p) => shown.stamina[p.id] ?? Number(p.stamina) ?? 0;
  const handCard = (uid) => (uid ? (v.hand || []).find((c) => c.uid === uid) || null : null);
  // L40 고유 카드: 받는 선수 · 구역이 필요한 모양 (shape.needs) 도 놓는 자리가 있는 카드다
  const shapeNeeds = (c) => !!shapeNeedsOf(c);
  const pointCard = (c) => !!c && (c.targetKind === 'circle' || c.targetKind === 'single' || shapeNeeds(c)); // 놓는 자리가 뜻이 있는 카드 (회복 단일 포함)
  /** 고유 카드 주인 이름 (뷰 ownerId) */
  const ownerName = (c) => playerOf(c?.ownerId)?.name ?? '';
  /** 고유 카드 놓기 안내 (§16.7 dock 안내 칸 — 자리를 고르기 전) */
  function shapeGuide(c) {
    const sh = c.shape;
    const o = ownerName(c);
    if (sh.kind === 'link') return `${o}에서 받을 선수에게 끌어 놓으세요`;
    if (sh.kind === 'pick') return sh.onlyZones?.length ? `${L.zonesText(sh.onlyZones)} 구역 선수 위에 놓으세요` : `${josa(o, '과', '와')} 함께할 선수 위에 놓으세요`;
    if (sh.kind === 'move') return `${josa(o, '을', '를')} 옮길 구역에 놓으세요`;
    if (sh.kind === 'carry') return `${josa(o, '이', '가')} 가로지를 구역에 놓으세요`;
    return shapeHow(sh, o);
  }

  /* ------------------------------------------------------------------ */
  /* 구역 바닥 · 라벨                                                      */
  /* ------------------------------------------------------------------ */
  function renderZones() {
    const pr = circlePx(Z.pad, Z.aspect, W, H);
    const pads = [];
    const chips = [];
    ZONE_KEY_ORDER.forEach((z, i) => {
      const c = Z.centers[z];
      if (!c) return;
      const [x, y] = toPx(c);
      const focus = z === v.zone;
      pads.push(h('div', {
        class: ['zone-pad', `zp-${z}`, focus ? 'focus' : '', focus && v.special ? 'special' : ''],
        dataset: { zone: z },
        style: { left: px(x - pr.rx), top: px(y - pr.ry), width: px(2 * pr.rx), height: px(2 * pr.ry) },
      }));
      // 라벨 칩은 바닥 바로 위 (위 줄 · 아래 줄 모두 — 대형의 이름표는 아래 · 바깥쪽이라 겹치지 않는다)
      chips.push(h('div', {
        class: ['zone-chip', `zc-${z}`, focus ? 'focus' : ''],
        dataset: { zone: z },
        style: { left: px(x), top: px(y - pr.ry - 5) },
      },
      h('span', { class: 'zc-key' }, String(i + 1)),
      h('span', { class: 'zc-ico' }, L.ZONE_ICONS[z] ?? ''),
      h('b', {}, L.ZONE_LABELS[z] ?? z),
      focus ? h('span', { class: 'zc-focus' }, v.special ? `★ ${multTxt}` : `중점 ${multTxt}`) : null));
    });
    zoneLayer.replaceChildren(...pads);
    chipLayer.replaceChildren(...chips);
  }

  /* ------------------------------------------------------------------ */
  /* 조준 · 미리보기                                                       */
  /* ------------------------------------------------------------------ */
  function aimCard() {
    if (ui.drag?.kind === 'card') return handCard(ui.drag.uid);
    return ui.aim ? handCard(ui.aim.uid) : null;
  }
  /** 지금 미리보기 · 낼 인자 { uid, at?, playerId?, zone? } (조준 카드가 없으면 null). 주인 토큰 끌기(ui.drag.kind 'shape')는 끄는 점 */
  function aimArgs() {
    const c = aimCard();
    if (!c) return null;
    if (ui.drag?.kind === 'card' || ui.drag?.kind === 'shape') {
      const a = { uid: c.uid };
      if (ui.drag.at) a.at = ui.drag.at;
      if (ui.drag.playerId) a.playerId = ui.drag.playerId;
      return a;
    }
    const a = { uid: c.uid };
    if (hoverAt) a.at = hoverAt;
    else {
      if (ui.aim.at) a.at = ui.aim.at;
      if (ui.aim.playerId) a.playerId = ui.aim.playerId;
      if (ui.aim.zone) a.zone = ui.aim.zone;
    }
    return a;
  }
  /** 놓을 자리를 골랐는가 (점 · 선수 · 구역) */
  const hasPick = (a) => !!(a && (a.at || a.playerId || a.zone));
  function computePreview() {
    const a = isLive() && !ui.busy ? aimArgs() : null;
    if (!a) { pv = null; return; }
    try { pv = run.previewCard(st(), data, a); } catch (_) { pv = null; }
  }
  function candidates(uid) {
    if (!uid) return [];
    if (candCache && candCache.uid === uid) return candCache.list;
    let list = [];
    try { list = run.dropCandidates(st(), data, { uid }) || []; } catch (_) { list = []; }
    candCache = { uid, list };
    return list;
  }
  /** 키보드 후보 라벨 (§14.16): "패스 구역 · 3명" · "네리아" · "패스–드리블 사이 · 4명" */
  function candLabel(cd) {
    const n = (cd.ids || []).length;
    const sc = handCard(ui.aim?.uid);
    if (sc?.shape) {
      // 고유 카드 모양 후보: "네리아 → 실루엔" · "타리아 → 슈팅 구역" · 주인 한 점 "도르비나 둘레 · 3명"
      const o = ownerName(sc);
      if (cd.kind === 'player') return `${o} → ${playerOf(cd.playerId)?.name ?? ''}`;
      if (cd.kind === 'zone') return `${o} → ${L.zoneLabel(cd.zone)}${cd.zone === v.zones?.[sc.ownerId] ? ' (그대로)' : ''}`;
      return `${shapeHow(sc.shape, o)} · ${n}명`;
    }
    if (cd.kind === 'zone') return `${L.zoneLabel(cd.zone)} · ${n}명`;
    if (cd.kind === 'player') {
      const p = playerOf(cd.playerId);
      const where = p?.out ? '결장' : p?.bench ? '벤치' : p?.zone ? zoneShort(p.zone) : '';
      return n > 1 ? `${p?.name ?? ''} 자리 · ${n}명` : `${p?.name ?? ''}${where ? ` (${where})` : ''}`;
    }
    if (cd.kind === 'between') {
      const zs = (cd.zones || []).filter(Boolean);
      if (zs.length === 2 && zs[0] !== zs[1]) return `${zoneShort(zs[0])}–${zoneShort(zs[1])} 사이 · ${n}명`;
      return `${zs[0] ? L.zoneLabel(zs[0]) : ''} 안 · ${n}명`;
    }
    return n ? `경기장 전원 · ${n}명` : '경기장';
  }

  /**
   * 꼬리표 자리: (x, y) 둘레 (rx · ry) 의 바깥 모서리 (오른쪽 위 → 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래 → 아래) 중
   * 경기장 안이고 구역 라벨 칩과 겹치지 않는 첫 자리
   */
  function placeTag(txt, tone, x, y, rx, ry, k) {
    aimTag.textContent = txt;
    aimTag.className = ['aim-tag', 'on', ...String(tone || '').split(' ').filter(Boolean)].join(' ');
    const tw = aimTag.offsetWidth || txt.length * 8;
    const th = aimTag.offsetHeight || 19;
    const cands = [
      [x + rx * k, y - ry * k, 0, 1], [x - rx * k, y - ry * k, 1, 1],
      [x + rx * k, y + ry * k, 0, 0], [x - rx * k, y + ry * k, 1, 0],
      [x - tw / 2, y + Math.max(26, ry + 4), 0, 0],
    ].map(([ax, ay, toL, up]) => ({ l: toL ? ax - tw : ax, t: up ? ay - th : ay }));
    const chipRects = [...chipLayer.children].map((el) => {
      const w = el.offsetWidth || 0;
      const hh = el.offsetHeight || 0;
      return { l: (parseFloat(el.style.left) || 0) - w / 2, t: (parseFloat(el.style.top) || 0) - hh, w, h: hh };
    });
    const fits = (b) => b.l >= 2 && b.t >= 2 && b.l + tw <= W - 2 && b.t + th <= H - 2
      && !chipRects.some((cr) => cr.w > 0 && b.l < cr.l + cr.w + 3 && b.l + tw + 3 > cr.l && b.t < cr.t + cr.h + 2 && b.t + th + 2 > cr.t);
    const box = cands.find(fits) || { l: Math.min(W - 2 - tw, Math.max(2, cands[0].l)), t: Math.min(H - 2 - th, Math.max(2, cands[0].t)) };
    aimTag.style.transform = `translate(${px(box.l)}, ${px(box.t)})`;
  }
  /** 필드 두 점 사이 선 (회전한 막대 — 선 · 화살표) */
  function drawLine(el, base, from, to, cls = []) {
    const [x1, y1] = toPx(from);
    const [x2, y2] = toPx(to);
    const len = Math.hypot(x2 - x1, y2 - y1);
    el.style.transform = `translate(${px(x1)}, ${px(y1)}) rotate(${round1((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI)}deg)`;
    el.style.width = px(len);
    el.className = [base, 'on', len < 56 ? 'short' : '', ...cls].filter(Boolean).join(' ');
  }
  const placeAt = (el, spot) => {
    const [x, y] = toPx(spot);
    el.style.transform = `translate(${px(x)}, ${px(y)})`;
  };
  const failTxt = () => (pv?.failRate > 0 ? ` · 실패 ${pctText(pv.failRate)}` : '');
  const failTone = () => (pv?.failRate > 0 ? (pv.failRate >= 0.25 ? 'risk bad' : 'risk') : 'ok');
  const distinctN = (targets) => new Set((targets || []).map((t) => t.id)).size;
  /** 모양 꼬리표 (§16.7): 받는 선수 · 옮긴 구역 · 주인 둘레 옆 */
  function shapeTag(c, sh, needs, opos, at, dest) {
    const tr = TOKEN_PX * 0.62;
    if (needs === 'player') {
      if (pv?.ok) {
        const rp = v.positions?.[pv.shape?.receiverId] || at;
        const [x, y] = toPx(rp);
        placeTag(`${distinctN(pv.targets)}명 · +${pv.total ?? 0}${failTxt()}`, failTone(), x, y, tr, tr, 0.9);
        return;
      }
      if (at) {
        const [x, y] = toPx(at);
        placeTag(pv?.reason || '받을 선수 위에 놓으세요', 'bad', x, y, tr, tr, 0.9);
        return;
      }
      aimTag.className = 'aim-tag';
      return;
    }
    if (needs === 'zone') {
      // 놓을 구역 바닥 모서리 (대형 토큰과 겹치지 않게), 구역이 없으면 포인터 옆
      const toZ = pv?.shape?.to || null;
      const anchor = (toZ && Z.centers[toZ]) || dest || at;
      if (!anchor) { aimTag.className = 'aim-tag'; return; }
      const [x, y] = toPx(anchor);
      const pr = toZ ? circlePx(Z.pad, Z.aspect, W, H) : { rx: tr, ry: tr };
      const k = toZ ? 0.74 : 0.9;
      if (!pv?.ok) { placeTag(pv?.reason || '구역 위에 놓으세요', 'bad', x, y, pr.rx, pr.ry, k); return; }
      let txt;
      if (sh.kind === 'carry') {
        txt = (pv.targets || []).map((t) => `+${t.gain} ${zoneShort(t.stat)}`).join(' · ');
      } else {
        const t = (pv.targets || [])[0];
        const m = Number(t?.shapeMult) || 1;
        const bd = Number(pv.shape?.baseDelta) || 0;
        txt = `+${t?.gain ?? 0}${m > 1 ? ` ${multShort(m)}` : ''} · 기본 ${signed(bd)}`;
      }
      placeTag(txt + failTxt(), failTone(), x, y, pr.rx, pr.ry, k);
      return;
    }
    // 주인 둘레 원 · 주인 구역 · 마무리: 주인 자리 옆
    if (!opos || !pv?.ok) { aimTag.className = 'aim-tag'; return; }
    if (sh.kind === 'ownerZone') {
      const zc = Z.centers[v.zones?.[c.ownerId]] || opos;
      const pr = circlePx(Z.pad, Z.aspect, W, H);
      const [x, y] = toPx(zc);
      placeTag(`${distinctN(pv.targets)}명 · +${pv.total ?? 0}${failTxt()}`, failTone(), x, y, pr.rx, pr.ry, 0.74);
      return;
    }
    if (sh.kind === 'ownerCircle') {
      const r = sh.r ?? Z.ownerRadius?.[sh.size] ?? 8;
      const { rx, ry } = circlePx(r, Z.aspect, W, H);
      const [x, y] = toPx(opos);
      placeTag(`${distinctN(pv.targets)}명 · +${pv.total ?? 0}${failTxt()}`, failTone(), x, y, rx, ry, 0.74);
      return;
    }
    const t = (pv.targets || [])[0];
    const m = Number(t?.shapeMult) || 1;
    const [x, y] = toPx(opos);
    placeTag(`+${pv.total ?? 0}${m > 1 ? ` ${multShort(m)}` : ''}${failTxt()}`, failTone(), x, y, tr, tr, 0.9);
  }

  function renderAim() {
    const c = isLive() && !ui.busy ? aimCard() : null;
    const a = c ? aimArgs() : null;
    const sh = c?.shape || null;
    const needs = shapeNeedsOf(c);
    screen.classList.toggle('aiming', !!c);
    screen.classList.toggle('aim-has', !!(pv && pv.ok && ((pv.targets || []).length || pv.healId)));
    screen.classList.toggle('aim-shape', !!sh);
    const dragOver = ui.drag?.kind === 'card' ? ui.drag.over : null;
    const dragging = ui.drag?.kind === 'card' || ui.drag?.kind === 'shape';
    const fieldWide = !!c && !sh && !pointCard(c) && (ui.drag?.kind !== 'card' || dragOver === 'field');
    field.classList.toggle('aim-all', fieldWide && c.targetKind === 'all');
    field.classList.toggle('aim-soft', fieldWide && c.targetKind !== 'all');
    // 원 · 십자
    const at = a?.at || null;
    const show = (el, on) => el.classList.toggle('on', !!on);
    const opos = sh ? v.positions?.[c.ownerId] || null : null;
    if (c && c.targetKind === 'circle' && at) {
      const r = c.radius ?? Z.radius[c.size] ?? 9;
      const { rx, ry } = circlePx(r, Z.aspect, W, H);
      const [x, y] = toPx(at);
      Object.assign(aimCircle.style, { left: px(x - rx), top: px(y - ry), width: px(2 * rx), height: px(2 * ry) });
      aimCircle.className = ['aim-circle', 'on', `sz-${c.size}`, pv?.ok ? 'ok' : 'bad'].join(' ');
    } else if (sh?.kind === 'ownerCircle' && opos) {
      // 주인 둘레 원 (§16.7): 카드를 집는 순간 주인 위치 중심 — 반지름 ownerRadius[size] (판정 = 엔진 shape.circle)
      const cc = pv?.shape?.circle || { x: opos.x, y: opos.y, r: sh.r ?? Z.ownerRadius?.[sh.size] ?? 8 };
      const { rx, ry } = circlePx(cc.r, Z.aspect, W, H);
      const [x, y] = toPx(cc);
      Object.assign(aimCircle.style, { left: px(x - rx), top: px(y - ry), width: px(2 * rx), height: px(2 * ry) });
      aimCircle.className = ['aim-circle', 'on', 'owner', `sz-${sh.size}`, pv?.ok ? 'ok' : 'bad'].join(' ');
    } else show(aimCircle, false);
    if (c && c.targetKind === 'single' && at) {
      const [x, y] = toPx(at);
      const rr = circlePx(Z.pickR, Z.aspect, W, H);
      aimCross.style.transform = `translate(${px(x)}, ${px(y)})`;
      aimCross.style.setProperty('--pr', px(rr.rx));
      aimCross.className = ['aim-cross', 'on', pv?.ok ? 'ok' : 'bad'].join(' ');
    } else show(aimCross, false);
    // 추천 원 (감독 추천 카드를 조준 · 끄는 중일 때만, 점선 청록)
    if (c && rec?.kind === 'play' && rec.uid === c.uid && c.targetKind === 'circle' && rec.at) {
      const r = c.radius ?? Z.radius[c.size] ?? 9;
      const { rx, ry } = circlePx(r, Z.aspect, W, H);
      const [x, y] = toPx(rec.at);
      Object.assign(recCircle.style, { left: px(x - rx), top: px(y - ry), width: px(2 * rx), height: px(2 * ry) });
      show(recCircle, true);
    } else show(recCircle, false);
    // 이어 주기 · 연결 · 크로스: 주인 → 받는 선수 (아직 없으면 → 포인터) 선
    if (needs === 'player' && opos) {
      const ln = pv?.shape?.line || null;
      const to = ln?.to || at;
      if (to && distU(opos, to) > 0.8) {
        drawLine(aimLink, 'aim-link', opos, to, [sh.kind === 'link' ? 'solid' : 'dash', sh.onlyZones?.length ? 'cross' : '', pv?.ok ? 'ok' : 'bad']);
      } else aimLink.className = 'aim-link';
    } else aimLink.className = 'aim-link';
    // 자리 옮기기 · 가로지르기: 주인 → 옮긴 자리 화살표 · 유령 (끄는 중 = 포인터, 아니면 옮긴 자리) · 끄는 중 옮긴 자리 점
    let dest = null;
    if (needs === 'zone' && opos) {
      const toZ = pv?.shape?.to || null;
      if (toZ) dest = pv.shape.positionsAfter?.[c.ownerId] || (toZ === v.zones?.[c.ownerId] ? opos : Z.centers[toZ]) || null;
      if (dest && distU(opos, dest) > 1) drawLine(aimArrow, 'aim-arrow', opos, dest, [sh.kind, pv?.ok ? 'ok' : 'bad']);
      else aimArrow.className = 'aim-arrow';
      const gpos = dragging && at ? at : dest;
      if (gpos) {
        const p = playerOf(c.ownerId);
        const face = aimGhost.firstChild;
        face.textContent = initialOf(p?.name);
        face.style.background = p?.portraitColor || '#4b5563';
        placeAt(aimGhost, gpos);
        aimGhost.className = ['aim-ghost', 'tok-ghost', 'on', pv?.ok ? 'ok' : 'bad', dragging ? 'follow' : ''].filter(Boolean).join(' ');
      } else aimGhost.className = 'aim-ghost tok-ghost';
      if (dragging && dest && pv?.ok) { placeAt(aimSpot, dest); aimSpot.className = 'aim-spot on'; } else aimSpot.className = 'aim-spot';
    } else {
      aimArrow.className = 'aim-arrow';
      aimGhost.className = 'aim-ghost tok-ghost';
      aimSpot.className = 'aim-spot';
    }
    // 구역 바닥 강조: 크로스 = 슈팅 구역 · 구역 전원 = 주인 구역 · 옮기기 = 놓을 구역 (가로지르기는 지금 구역 .from) · 추천 구역 .rec
    const padCls = {};
    const addPad = (z, k) => { if (z) (padCls[z] ||= []).push(k); };
    if (sh) {
      for (const z of sh.onlyZones || []) addPad(z, 'aim');
      if (sh.kind === 'ownerZone') addPad(v.zones?.[c.ownerId], 'aim');
      if (needs === 'zone') {
        if (sh.kind === 'carry') addPad(v.zones?.[c.ownerId], 'from');
        if (pv?.shape?.to) addPad(pv.shape.to, pv.ok ? 'aim' : 'bad');
      }
      if (rec?.kind === 'play' && rec.uid === c.uid && rec.zone) addPad(rec.zone, 'rec');
    }
    for (const el of zoneLayer.children) {
      const ks = padCls[el.dataset.zone] || [];
      for (const k of ['aim', 'from', 'bad', 'rec']) el.classList.toggle(k, ks.includes(k));
    }
    // 꼬리표: "3명 · +36" / 빨강 이유 (모양 카드는 받는 선수 · 옮긴 구역 · 주인 둘레 옆)
    if (sh) {
      shapeTag(c, sh, needs, opos, at, dest);
    } else if (c && pointCard(c) && at) {
      const [x, y] = toPx(at);
      const r = c.targetKind === 'circle' ? (c.radius ?? Z.radius[c.size] ?? 9) : Z.pickR;
      const { ry } = circlePx(r, Z.aspect, W, H);
      let txt = '';
      let tone = 'ok';
      if (pv?.ok) {
        if (c.heal) {
          const p = playerOf(pv.healId);
          const n = healAmountOf(c);
          txt = `${p?.name ?? ''} 체력${n ? ` +${n}` : ' 회복'}`;
          tone = 'heal';
        } else {
          txt = `${(pv.targets || []).length}명 · +${pv.total ?? 0}${failTxt()}`;
          tone = failTone();
        }
      } else {
        txt = c.targetKind === 'circle' ? '원 안에 선수가 없습니다' : '선수 위에 놓으세요';
        tone = 'bad';
      }
      const rx = c.targetKind === 'circle' ? circlePx(r, Z.aspect, W, H).rx : ry;
      placeTag(txt, tone, x, y, rx, ry, c.targetKind === 'circle' ? 0.74 : 0.9);
    } else {
      aimTag.className = 'aim-tag';
    }
  }

  /* ------------------------------------------------------------------ */
  /* 토큰                                                                  */
  /* ------------------------------------------------------------------ */
  function tokenEl(p) {
    let el = tokEls.get(p.id);
    if (el) return el;
    const face = h('span', { class: 'tok-face', style: { background: p.portraitColor || '#4b5563' } }, initialOf(p.name));
    const barI = h('i');
    const nm = h('span', { class: 'tok-nm' }, p.name);
    const stN = h('b', { class: 'tok-stn' });
    const nameEl = h('span', { class: 'tok-name' }, nm, stN);
    const warn = h('span', { class: 'tok-warn' });
    el = h('div', {
      class: ['tok', 'home', 'named'],
      tabindex: '0',
      dataset: { side: 'home', id: p.id },
      onkeydown: (e) => {
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleBench(p.id); return; }
        // 선수 정보 (§17): I = 늘, Enter · Space = 카드를 고르지 않았을 때 (조준 중 Enter 는 내기 — 문서 keydown)
        if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggleInfo(p.id, 'tok'); return; }
        if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && !ui.aim && !ui.drag) { e.preventDefault(); e.stopPropagation?.(); toggleInfo(p.id, 'tok'); }
      },
      // 카드를 고르지 않았을 때 누르기 · 탭 = 선수 정보 (조준 중에는 경기장 click 이 자리 고르기로 쓴다)
      onclick: (e) => {
        if (suppressClick || ui.aim || ui.drag || el.classList.contains('off')) return;
        e.stopPropagation?.();
        toggleInfo(p.id, 'tok');
      },
    }, h('span', { class: 'tok-ring', 'aria-hidden': 'true' }), face, h('span', { class: 'tok-bar' }, barI), nameEl, warn);
    face.addEventListener('pointerdown', (e) => onTokPointerDown(e, p.id, 'field'));
    el.addEventListener('pointerenter', (e) => hoverInfo(e, p.id, 'tok', true));
    el.addEventListener('pointerleave', (e) => hoverInfo(e, p.id, 'tok', false));
    el._bar = barI;
    el._nm = nm;
    el._stn = stN;
    el._name = nameEl;
    el._warn = warn;
    tokLayer.append(el);
    tokEls.set(p.id, el);
    return el;
  }
  function placeTok(el, spot) {
    const [x, y] = toPx(spot);
    el.style.transform = `translate(${px(x)}, ${px(y)})`;
    el.dataset.x = String(round1(spot.x));
    el.dataset.y = String(round1(spot.y));
  }
  /**
   * 이름표 자리: 대형 바깥쪽 — 옆으로 벌어진 선수는 옆(바깥), 나머지는 아래 (위 선수의 아래 = 대형 가운데 빈 곳).
   * 실패율 표(⚠)는 얼굴 위 바깥쪽 모서리 (대형 왼쪽 선수 = 왼쪽 위) — 가운데로 내려오는 이름표와 겹치지 않게.
   * @returns {string[]} 클래스
   */
  function labelSide(id, n) {
    const pos = v.positions?.[id];
    const c = Z.centers[v.zones?.[id]];
    if (!pos || !c || n <= 1) return [];
    const dx = ((pos.x - c.x) / 100) * W;
    const dy = ((pos.y - c.y) / 100) * H;
    const out = dx < -0.5 ? ['wl'] : [];
    if (Math.abs(dx) > Math.abs(dy) * 1.2) out.push(dx > 0 ? 'lp-r' : 'lp-l');
    // 3명 대형의 위 선수: 아래 이름표가 아래 두 선수 얼굴 사이에 끼어 닿는다 → 오른쪽 옆으로
    else if (n === 3 && dy < 0) out.push('lp-r');
    return out;
  }
  /** 조준 표시 정보 (대상 · 실패 · 후보 · 추천 · 회복 대상) */
  function aimInfo() {
    const out = { target: new Map(), rows: new Map(), failer: null, cand: new Set(), rec: null, healId: null, owner: null, needs: null };
    const c = isLive() && !ui.busy ? aimCard() : null;
    if (!c) return out;
    if (pv?.ok) {
      for (const t of pv.targets || []) {
        if (!out.target.has(t.id)) out.target.set(t.id, t);
        out.rows.set(t.id, [...(out.rows.get(t.id) || []), t]); // 고유 가로지르기 = 같은 선수 두 행
      }
      out.failer = pv.failRate > 0 ? pv.failerId : null;
      out.healId = pv.healId || null;
    }
    out.needs = shapeNeedsOf(c);
    if (c.shape) out.owner = c.ownerId || null;
    if (c.targetKind === 'single' || out.needs === 'player') for (const cd of candidates(c.uid)) if (cd.playerId) out.cand.add(cd.playerId);
    if (rec?.kind === 'play' && rec.uid === c.uid && rec.playerId) out.rec = rec.playerId;
    return out;
  }

  function renderTokens() {
    const info = aimInfo();
    const counts = {};
    for (const id of Object.keys(v.positions || {})) { const z = v.zones?.[id]; if (z) counts[z] = (counts[z] || 0) + 1; }
    const liftId = ui.drag?.kind === 'tok' ? ui.drag.id : null;
    for (const p of v.players) {
      const el = tokenEl(p);
      const pos = v.positions?.[p.id] || null;
      const stam = staminaOf(p);
      const n = p.zone ? counts[p.zone] || 0 : 0;
      const t = info.target.get(p.id);
      const cls = ['tok', 'home', 'named', `st-${stamCls(stam)}`];
      if (p.zone) cls.push(`z-${p.zone}`);
      if (!pos) cls.push('off');
      if (n >= 4) cls.push('short');
      if (pos) cls.push(...labelSide(p.id, n));
      if (t) cls.push('target');
      if (info.failer === p.id) cls.push('failer');
      if (info.healId === p.id) cls.push('heal-target');
      if (info.cand.has(p.id) && !t) cls.push('cand');
      // 고유 카드 모양: 주인 토큰 빛 (이어 주기 · 옮기기 = 끄는 출발점), 받는 선수가 필요한데 후보가 아닌 선수는 흐리게 (크로스 = 슈팅 구역 밖)
      if (info.owner === p.id) cls.push('shape-owner', info.needs ? 'shape-src' : '');
      else if (info.needs === 'player' && pos && !info.cand.has(p.id) && !t) cls.push('noncand');
      if (info.rec === p.id) cls.push('rec');
      if (liftId === p.id) cls.push('lifting');
      if (infoPop?.id === p.id) cls.push('info-on');
      if (el.classList.contains('drilling')) cls.push('drilling');
      el.className = cls.join(' ');
      if (pos) placeTok(el, pos);
      else if (!el.dataset.x) placeTok(el, p.zone && Z.centers[p.zone] ? Z.centers[p.zone] : tokenSpot(p.slot, L.slotsOf(st().formation)));
      else if (p.zone && Z.centers[p.zone]) placeTok(el, Z.centers[p.zone]); // 벤치: 자기 구역 가운데에 숨겨 둔다 (돌아올 때 거기서 뛰어나온다)
      el.tabIndex = pos && isLive() ? 0 : -1;
      el._bar.style.width = `${Math.max(0, Math.min(100, stam))}%`;
      const fr = Number(p.failRate) || 0;
      const warnOn = !!pos && fr >= 0.1 && !t;
      el._warn.textContent = warnOn ? `⚠${pctText(fr)}` : '';
      el._warn.classList.toggle('on', warnOn);
      // 이름표 = 이름 + 체력 (4명 이상 대형: 이름 앞 2글자). 조준 중 대상이면 이름표 자리에 말풍선 "+12" (겹침 없는 자리 그대로)
      let bub = '';
      let tone = '';
      if (t) {
        // 실패율은 원 꼬리표 · dock 안내 (말풍선은 이름표 자리 폭 그대로 짧게), 실패 후보 = 빨간 고리.
        // 고유 모양: 배율이 걸린 행 "+N ×1.3" (받는 선수 · 고른 선수 · 주인), 가로지르기 두 행 = 합
        const rows = info.rows.get(p.id) || [t];
        const gsum = rows.reduce((s, r) => s + (Number(r.gain) || 0), 0);
        const sm = rows.length === 1 ? Number(t.shapeMult) || 1 : 1;
        bub = sm > 1 ? `+${gsum} ${multShort(sm)}` : `+${gsum}`;
        if (sm > 1) tone = 'shape';
        if (info.failer === p.id) tone = 'risk';
        else if ((Number(t.attachMult) || 1) > 1) tone = 'att'; // 코치 지원 배율 (하르나 슈팅 구역 · 조이 목표 미만) = 코치 색
      } else if (info.healId === p.id) {
        const c = aimCard();
        const hn = healAmountOf(c);
        bub = `체력${hn ? ` +${hn}` : ' 회복'}`;
        tone = 'heal';
      }
      if (bub) {
        el._name.className = ['tok-name', 'bub', tone].filter(Boolean).join(' ');
        el._nm.textContent = bub;
        el._stn.textContent = '';
      } else {
        el._name.className = 'tok-name';
        el._nm.textContent = n >= 4 ? shortName(p.name) : p.name;
        el._stn.textContent = n >= 4 ? '' : String(stam);
      }
      const cur = p.zone ? st().players.find((x) => x.id === p.id)?.stats?.[p.zone] : null;
      // 브라우저 title 풍선은 조준 중에만 (평소 hover 는 선수 정보 팝오버가 대신 — 두 개가 겹치지 않게)
      if (ui.aim || ui.drag) el.title = `${p.name} — ${p.zone ? L.zoneLabel(p.zone) : p.out ? '결장' : ''}${p.bench ? ' (벤치)' : ''}${cur != null ? ` · ${zoneShort(p.zone)} ${Math.round(cur)}` : ''} · 체력 ${stam} · 실패율 ${pctText(fr)}`;
      else el.removeAttribute('title');
      el.setAttribute('aria-label', `${p.name} — ${p.bench ? '벤치' : p.zone ? L.zoneLabel(p.zone) : '결장'}${cur != null ? `, ${zoneShort(p.zone)} ${Math.round(cur)}` : ''}, 체력 ${stam}${t ? `, 예상 +${t.gain}` : ''} — I 키 = 선수 정보`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* HUD · 벤치 · 명단 · 손패 · 안내                                          */
  /* ------------------------------------------------------------------ */
  function renderHud(scoreShown = shown.score) {
    const turn = shown.turn ?? v.turn; // 연출 중에는 턴 끝 단계까지 이전 턴
    turnPips.replaceChildren(...Array.from({ length: v.turns }, (_, i) => h('i', { class: i + 1 < turn ? 'done' : i + 1 === turn ? 'cur' : '' })));
    turnNum.textContent = `${turn}/${v.turns}`;
    const cap = Math.max(1, Number(v.cap) || 1);
    const sc = Math.max(0, Number(scoreShown) || 0);
    scoreNum.textContent = String(scoreShown);
    scoreText.textContent = ` / 목표 ${v.target} · 퍼펙트 ${v.cap}`;
    scoreFill.style.width = `${Math.min(100, (sc / cap) * 100)}%`;
    hudScore.classList.toggle('clear', sc >= v.target);
    hudScore.classList.toggle('perfect', sc >= v.cap);
    targetMark.style.left = `${Math.min(100, (v.target / cap) * 100)}%`;
    targetMark.title = `목표 ${v.target}`;
    // 미리보기: 성공하면 오를 점수 (조준 카드의 대상 상승 합)
    const gain = pv?.ok ? Number(pv.total) || 0 : 0;
    scoreGhost.style.left = `${Math.min(100, (sc / cap) * 100)}%`;
    scoreGhost.style.width = `${Math.max(0, Math.min(100 - (sc / cap) * 100, (gain / cap) * 100))}%`;
    scoreDelta.textContent = gain > 0 ? `+${gain}` : '';
    hud.title = `점수 ${v.score} · 목표 ${v.target} (클리어) · 퍼펙트 ${v.cap} (즉시 끝 + 남은 턴당 전원 체력 +${LS.perfectStaminaPerTurn ?? 5})`;
    renderChips();
  }
  function renderChips(flash = []) {
    const chips = v.chips || [];
    chipsEl.replaceChildren(...(chips.length ? chips.map((c) => h('span', {
      class: ['badge', 'lh-chip', c.policy ? 'pol' : '', flash.includes(c.key) ? 'flash' : ''],
      dataset: { key: c.key },
      title: c.policy ? `${policy.name} 방침 버프` : '카드 효과',
    }, h('span', { class: 'lh-chip-k' }, c.label), h('b', {}, c.value))) : [h('span', { class: 'tiny muted' }, '버프 없음')]));
  }

  function renderBench(dropState = null) {
    const ids = v.bench || [];
    const max = v.benchMax ?? 2;
    const full = ids.length >= max;
    benchNote.textContent = full ? `최대 ${max}명 — 꽉 참` : `턴 끝 체력 +${benchRecover} · 최대 ${max}명`;
    benchNote.classList.toggle('warn', full);
    benchEl.classList.toggle('full', full);
    benchEl.classList.toggle('drop-ok', dropState === 'ok');
    benchEl.classList.toggle('drop-bad', dropState === 'bad');
    benchEl.classList.toggle('drop-hint', dropState === 'hint');
    const c = aimCard();
    const healAim = !!(c && c.heal);
    const slots = [];
    for (let i = 0; i < max; i++) {
      const id = ids[i];
      const p = id ? playerOf(id) : null;
      if (!p) {
        slots.push(h('div', { class: ['ls-bench-slot', 'empty'] }, h('span', {}, full ? '최대' : '빈 칸')));
        continue;
      }
      const stam = staminaOf(p);
      const heal = pv?.ok && pv.healId === p.id;
      const slot = h('button', {
        class: ['ls-bench-slot', 'filled', benchFx && benchFx.id === id && benchFx.on ? 'enter' : '', healAim ? 'pickable' : '', heal ? 'heal-target' : '',
          ui.drag?.kind === 'tok' && ui.drag.id === id ? 'lifting' : ''],
        type: 'button',
        dataset: { pid: p.id },
        title: healAim ? `${p.name}에게 회복 카드` : `${p.name} — 벤치 (턴 끝 체력 +${benchRecover}). 눌러서 · 끌어서 경기장으로`,
        'aria-label': `${p.name} 벤치, 체력 ${stam}${healAim ? '' : ' — 눌러서 복귀'}`,
        onclick: (e) => { e.stopPropagation(); if (suppressClick) return; if (healAim) playHealOn(p.id); else toggleBench(p.id); },
        onkeydown: (e) => { if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleBench(p.id); } },
      },
      h('span', { class: 'bs-face', style: { background: p.portraitColor || '#4b5563' } }, initialOf(p.name)),
      h('span', { class: 'bs-txt' }, h('b', {}, p.name), h('span', { class: ['bs-st', stamCls(stam)] }, `체력 ${stam} → ${Math.min(100, stam + benchRecover)}`)));
      slot.addEventListener('pointerdown', (e) => onTokPointerDown(e, p.id, 'bench'));
      slots.push(slot);
    }
    benchSlots.replaceChildren(...slots);
  }

  function renderSide() {
    renderBench(benchDropState());
    const c = aimCard();
    const healAim = !!(c && c.heal);
    const info = aimInfo();
    const live = isLive() && !ui.busy;
    for (const p of v.players) {
      let row = rowEls.get(p.id);
      if (!row) {
        const btn = h('button', { class: 'btn btn-xs ls-bench-btn', type: 'button', onclick: (e) => { e.stopPropagation(); toggleBench(p.id); } });
        // ⓘ = 선수 정보 (§17) — 카드를 골랐어도 늘 연다. 다시 그려도 같은 버튼 (키보드 포커스가 남는다)
        const pi = h('button', {
          class: 'ls-pi-btn', type: 'button', 'aria-label': `${p.name} 선수 정보 — 스탯 · 이번 레슨 상승`, 'aria-expanded': 'false',
          onclick: (e) => { e.stopPropagation(); toggleInfo(p.id, 'btn'); },
        }, 'ⓘ');
        // 줄 누르기: 회복 카드 조준이면 그 선수에게, 아니면 선수 정보 (자리를 고르는 카드는 명단 줄에 놓지 않는다)
        row = h('div', {
          class: 'ls-row', dataset: { pid: p.id },
          onclick: () => { if (healAimNow()) playHealOn(p.id); else if (!ui.drag && !suppressClick) toggleInfo(p.id, 'row'); },
          onkeydown: (e) => { if (e.key === 'i' || e.key === 'I') { e.preventDefault(); toggleInfo(p.id, 'btn'); } },
        });
        // hover 는 ⓘ 위에서만 (줄 전체면 [벤치] 를 누르러 갈 때마다 떠서 경기장을 가린다)
        pi.addEventListener('pointerenter', (e) => hoverInfo(e, p.id, 'btn', true));
        pi.addEventListener('pointerleave', (e) => hoverInfo(e, p.id, 'btn', false));
        row._btn = btn;
        row._pi = pi;
        rowEls.set(p.id, row);
        sideRows.append(row);
      }
      const stam = staminaOf(p);
      const fr = Number(p.failRate) || 0;
      const where = p.out ? (p.injured ? '부상' : '결장') : p.bench ? '벤치' : p.zone ? zoneShort(p.zone) : '';
      const d = playerStatInfo(st(), p.id, v, thresholds);
      row.className = ['ls-row', p.out ? 'out' : '', p.bench ? 'benched' : '', healAim ? 'pickable' : '',
        info.target.has(p.id) ? 'target' : '', info.healId === p.id ? 'heal-target' : '', rec?.kind === 'bench' && rec.playerId === p.id && live ? 'rec' : '',
        infoPop?.id === p.id ? 'info-on' : ''].filter(Boolean).join(' ');
      row.title = `${p.name} (${p.slot}) — ${where}${d?.cur ? ` · ${zoneShort(d.cur.stat)} ${d.cur.value} (이번 레슨 ${signed(d.cur.gain)})` : ''} · 체력 ${stam} · 실패율 ${pctText(fr)} · 이번 레슨 대상 ${p.targeted}회`;
      const btn = row._btn;
      const canOn = live && !p.out && !p.bench && v.canBench;
      const canOff = live && p.bench;
      btn.textContent = p.bench ? '복귀' : '벤치';
      btn.disabled = !(canOn || canOff);
      btn.title = p.out ? '결장 중' : p.bench ? '이번 턴 자기 구역으로 돌아간다' : v.canBench ? `이번 턴 쉬기 — 턴 끝 체력 +${benchRecover}` : `벤치는 최대 ${v.benchMax}명`;
      btn.classList.toggle('recommended', rec?.kind === 'bench' && rec.playerId === p.id && live);
      const pi = row._pi;
      pi.disabled = inert;
      pi.setAttribute('aria-expanded', infoPop?.id === p.id ? 'true' : 'false');
      row.replaceChildren(
        avatar(p.portraitColor, p.name, 'xs', p.out ? 'dim' : ''),
        h('span', { class: 'ls-nm' }, h('b', {}, p.name)),
        h('span', { class: 'ls-st', title: `체력 ${stam}` }, bar(stam / 100, stamCls(stam)), h('b', { class: stamCls(stam) }, stam)),
        p.out ? h('span', { class: 'ls-fr muted' }, '–') : h('span', { class: ['ls-fr', fr >= 0.25 ? 'bad' : fr >= 0.1 ? 'warn' : 'muted'], title: `실패율 ${pctText(fr)}` }, pctText(fr)),
        curLine(p, d),
        pi,
        btn);
    }
    const lsn = st().lesson || {};
    const twCap = data.lesson?.teamwork?.lessonCap ?? 8;
    sideFoot.replaceChildren(
      h('div', { class: 'ls-foot-row' }, h('span', { class: 'muted' }, '팀워크'), h('b', {}, st().teamwork ?? 0),
        h('span', { class: 'tiny muted' }, `레슨 중 +${lsn.twAccrued ?? 0}/${twCap}`)),
      h('div', { class: 'ls-foot-row ls-cond' }, h('span', { class: 'muted' }, '방침'), h('b', {}, policy.name),
        h('span', { class: 'tiny muted ellipsis', title: policy.desc }, `컨디션 ${L.CONDITION_LABELS[st().condition] ?? st().condition}`)));
    renderInfoPop();
  }
  const healAimNow = () => { const c = aimCard(); return !!(c && c.heal && isLive() && !ui.busy); };

  /* ------------------------------------------------------------------ */
  /* 스탯 보기 (§17): 명단 줄 구역 스탯 · 선수 정보 팝오버                      */
  /* ------------------------------------------------------------------ */
  const gainCls = (n) => (n > 0 ? 'good' : n < 0 ? 'bad' : 'muted');
  const gainTxt = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
  /** 명단 줄 두 번째 줄: 서 있는 구역의 지금 스탯 + 이번 레슨 상승 "🛡️ 수비 B 552 +18" (벤치 = "벤치" + 돌아갈 구역, 결장 = 부상 · 이번 상승 합) */
  function curLine(p, d) {
    if (!d || p.out || !d.cur) {
      const t = d?.total || 0;
      return h('span', { class: ['ls-cur', 'off'] },
        h('span', { class: 'bad' }, p.injured ? '🚑 부상 · 결장' : '결장'),
        t ? h('span', { class: ['ls-cur-g', gainCls(t)], title: '이번 레슨 스탯 상승 합' }, ` 이번 ${gainTxt(t)}`) : null);
    }
    const c = d.cur;
    return h('span', {
      class: ['ls-cur', `z-${c.stat}`, p.bench ? 'on-bench' : ''],
      dataset: { stat: c.stat, value: String(c.value), gain: String(c.gain) },
      title: `${p.bench ? '벤치 — 돌아갈 구역 ' : '서 있는 구역 '}${L.zoneLabel(c.stat)}: ${L.STAT_LABELS[c.stat]} ${c.value} (${c.grade}) · 이번 레슨 ${signed(c.gain)}`,
    },
    p.bench ? h('span', { class: 'ls-cur-bench' }, '벤치') : h('span', { class: 'ls-cur-ico', 'aria-hidden': 'true' }, L.ZONE_ICONS[c.stat] ?? ''),
    h('span', { class: 'ls-cur-k' }, L.STAT_LABELS[c.stat] ?? c.stat),
    gradeBadge(c.grade, 'xs'),
    h('b', { class: 'ls-cur-v' }, c.value),
    h('span', { class: ['ls-cur-g', gainCls(c.gain)] }, gainTxt(c.gain)));
  }

  /** 팝오버 열기 · 닫기 (pinned = 누르기 · 키, hover = 마우스를 올린 동안) */
  function openInfo(id, src, pinned) {
    if (inert || !playerOf(id)) return;
    clearTimeout(hoverTid);
    hoverTid = null;
    infoPop = { id, src, pinned };
    syncInfoMarks();
    renderInfoPop();
  }
  function closeInfo() {
    clearTimeout(hoverTid);
    hoverTid = null;
    if (!infoPop) return;
    infoPop = null;
    syncInfoMarks();
    renderInfoPop();
  }
  /** 같은 선수 · 같은 자리(토큰 / 명단)에서 다시 누르면 닫고, 아니면 고정해서 연다 */
  function toggleInfo(id, src) {
    if (inert) return;
    const same = infoPop && infoPop.id === id && infoPop.pinned && (infoPop.src === 'tok') === (src === 'tok');
    if (same) closeInfo();
    else openInfo(id, src, true);
  }
  /** 마우스 hover (데스크톱): 카드를 고르지 않고 끌지 않을 때 잠깐 뒤 열고, 떠나면 닫는다 (고정된 팝오버는 그대로) */
  function hoverInfo(e, id, src, on) {
    if (inert || (e?.pointerType && e.pointerType !== 'mouse')) return;
    clearTimeout(hoverTid);
    hoverTid = null;
    if (!on) {
      if (infoPop && !infoPop.pinned && infoPop.id === id) closeInfo();
      return;
    }
    if (infoPop?.pinned || ui.aim || ui.drag || press) return;
    hoverTid = setTimeout(() => {
      hoverTid = null;
      if (!alive() || infoPop?.pinned || ui.aim || ui.drag || press) return;
      if (src === 'tok' && tokEls.get(id)?.classList.contains('off')) return;
      openInfo(id, src, false);
    }, 80);
  }
  /** 명단 줄 · ⓘ · 토큰의 열림 표시 */
  function syncInfoMarks() {
    for (const [id, row] of rowEls) {
      row.classList.toggle('info-on', infoPop?.id === id);
      row._pi?.setAttribute('aria-expanded', infoPop?.id === id ? 'true' : 'false');
    }
    for (const [id, el] of tokEls) el.classList.toggle('info-on', infoPop?.id === id);
  }
  /** 화면(.lesson-screen) 안 좌표 (논리 px — 무대 배율을 나눈 값) */
  function relRect(el) {
    const sr = screen.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const s = stageScale();
    return { l: (r.left - sr.left) / s, t: (r.top - sr.top) / s, w: r.width / s, h: r.height / s };
  }
  /** 팝오버 내용 · 자리. 토큰에서 열었고 경기장에 있으면 토큰 옆, 아니면 명단 줄 왼쪽 */
  function renderInfoPop() {
    const d = infoPop && !inert ? playerStatInfo(st(), infoPop.id, v, thresholds) : null;
    if (!d) {
      if (infoPop) { infoPop = null; syncInfoMarks(); }
      pinfo.className = 'ls-pinfo';
      pinfo.setAttribute('aria-hidden', 'true');
      pinfo.replaceChildren();
      return;
    }
    const stam = staminaOf({ id: d.id, stamina: d.stamina });
    const fr = d.failRate;
    const where = d.out ? (d.injured ? '🚑 부상 — 결장' : '결장') : d.bench ? `벤치 · 턴 끝 +${benchRecover}` : d.zone ? `${L.ZONE_ICONS[d.zone] ?? ''} ${L.zoneLabel(d.zone)}` : '';
    const mains = d.mainStats.map((s) => L.STAT_LABELS[s] ?? s).join('·');
    const head = h('div', { class: 'pi-head' },
      avatar(d.portraitColor, d.name, 'sm', d.out ? 'dim' : ''),
      h('div', { class: 'pi-id' },
        h('b', { class: 'pi-name' }, d.name),
        h('span', { class: 'pi-sub' }, h('span', { class: 'pi-slot' }, d.slot ?? ''), ` ${L.POSITION_LABELS[d.position] ?? d.position ?? ''}${mains ? ` · 주 스탯 ${mains}` : ''}`)),
      infoPop.pinned ? h('button', { class: 'pi-x', type: 'button', 'aria-label': '닫기', title: '닫기 (Esc)', onclick: (e) => { e.stopPropagation(); closeInfo(); } }, '×') : null);
    const state = h('div', { class: 'pi-state' },
      h('span', { class: ['pi-where', d.out ? 'bad' : d.bench ? 'heal' : d.zone ? `z-${d.zone}` : ''] }, where),
      h('span', { class: 'pi-stam' }, h('span', { class: 'muted' }, '체력'), bar(stam / 100, stamCls(stam)), h('b', { class: stamCls(stam) }, stam)),
      d.out ? null : h('span', { class: ['pi-fr', fr >= 0.25 ? 'bad' : fr >= 0.1 ? 'warn' : 'muted'] }, `실패 ${pctText(fr)}`));
    const grid = h('div', { class: 'pi-stats', role: 'table', 'aria-label': `${d.name} 스탯` },
      h('div', { class: 'pi-row pi-hd', role: 'row' },
        h('span', { role: 'columnheader' }, '스탯'), h('span', { role: 'columnheader' }, '지금'),
        h('span', { role: 'columnheader', title: '이번 레슨에서 오른 양 (기본 훈련 · 카드 · 부 스탯 · 실패 −5)' }, '이번 레슨'),
        h('span', { role: 'columnheader', title: '성장률 — 상승량에 곱한다' }, '성장')),
      d.stats.map((s) => h('div', {
        class: ['pi-row', `z-${s.stat}`, s.here ? 'here' : '', s.main ? 'main' : ''], role: 'row',
        dataset: { stat: s.stat, value: String(s.value), gain: String(s.gain), grade: s.grade },
        title: `${L.STAT_LABELS[s.stat]} ${s.value} (${s.grade}) · 레슨 시작 ${s.before} → 이번 레슨 ${signed(s.gain)} · 성장 ×${s.growth.toFixed(2)}${s.main ? ' · 주 스탯' : ''}${s.here ? ' · 지금 서 있는 구역' : ''}`,
      },
      h('span', { class: 'pi-k', role: 'cell' }, h('span', { class: 'pi-ico', 'aria-hidden': 'true' }, L.STAT_ICONS[s.stat] ?? ''), L.STAT_LABELS[s.stat] ?? s.stat,
        s.main ? h('i', { class: 'pi-main', title: '주 스탯' }, '주') : null),
      h('span', { class: 'pi-v', role: 'cell' }, gradeBadge(s.grade, 'xs'), h('b', { class: 'pi-num' }, s.value)),
      h('span', { class: ['pi-g', gainCls(s.gain)], role: 'cell' }, s.gain ? gainTxt(s.gain) : '–'),
      h('span', { class: ['pi-gr', s.growth >= 1.1 ? 'hi' : s.growth <= 0.9 ? 'lo' : ''], role: 'cell' }, `×${s.growth.toFixed(2)}`))));
    const sp = d.split;
    const foot = h('div', { class: 'pi-foot' },
      h('span', {}, '이번 레슨 ', h('b', { class: gainCls(d.total) }, gainTxt(d.total)),
        h('span', { class: 'muted' }, ` · 기본 ${sp.base} / 카드 ${sp.card}`), sp.sub ? h('span', { class: 'muted' }, ` · 부+${sp.sub}`) : null),
      h('span', { class: 'muted' }, d.out ? '이번 레슨은 훈련하지 않는다'
        : d.bench ? `벤치 — 이번 턴 기본 훈련 · 카드 대상 없음`
          : `턴 끝 기본 훈련 +${d.baseNext} 예상 · 카드 대상 ${d.targeted}회`));
    pinfo.replaceChildren(head, state, grid, foot);
    pinfo.className = ['ls-pinfo', 'on', infoPop.pinned ? 'pinned' : 'hover'].join(' ');
    pinfo.dataset.pid = d.id;
    pinfo.setAttribute('aria-hidden', 'false');
    pinfo.setAttribute('aria-label', `${d.name} 선수 정보`);
    placeInfoPop(d);
  }
  function placeInfoPop(d) {
    const sw = screen.offsetWidth;
    const sh = screen.offsetHeight;
    const w = pinfo.offsetWidth;
    const hh = pinfo.offsetHeight;
    if (!(sw > 0 && sh > 0 && w > 0 && hh > 0)) { pinfo.style.transform = ''; return; } // jsdom (레이아웃 없음)
    const M = 6;
    const sideR = relRect(side);
    const pos = infoPop.src === 'tok' ? v.positions?.[d.id] : null;
    let l;
    let t;
    let top = M;
    let bottom = sh - M;
    if (pos) {
      // 토큰 옆 (오른쪽 → 왼쪽), 옆 칸을 가리지 않게. 높이는 경기장 칸 안 (HUD · 손패를 덜 가리게 — 넘치면 화면 안)
      const fr = relRect(field);
      const pr = relRect(pitchWrap);
      const [x, y] = toPx(pos);
      const cx = fr.l + (x / W) * fr.w;
      const cy = fr.t + (y / H) * fr.h;
      const gap = TOKEN_PX * 0.5 + 12;
      l = cx + gap + w <= sideR.l - M ? cx + gap : cx - gap - w;
      t = cy - hh / 2;
      l = Math.max(M, Math.min(sideR.l - M - w, l));
      if (pr.h >= hh) { top = pr.t; bottom = pr.t + pr.h; }
    } else {
      // 명단 줄 왼쪽 (줄 가운데 높이)
      const row = rowEls.get(d.id);
      const rr = row ? relRect(row) : { t: sideR.t, h: 0 };
      l = sideR.l - M - w;
      t = rr.t + rr.h / 2 - hh / 2;
    }
    t = Math.max(top, Math.min(bottom - hh, t));
    pinfo.style.transform = `translate(${px(l)}, ${px(t)})`;
  }

  function renderHand(deal = false) {
    const hand = v.hand || [];
    const avail = handEl.clientWidth > 100 ? handEl.clientWidth : 600;
    const step = handStep(hand.length, avail, CARD_W, 12);
    const recUid = rec?.kind === 'play' ? rec.uid : null;
    const els = hand.map((c, i) => {
      const el = cardFace(c, {
        data,
        players: st().players,
        recommended: c.uid === recUid,
        selected: c.uid === ui.aim?.uid,
        onClick: (e) => { e?.stopPropagation?.(); onCardClick(c.uid); },
      });
      el.disabled = inert || !isLive();
      el.addEventListener('pointerdown', (e) => onCardPointerDown(e, c.uid));
      if (i > 0) el.style.marginLeft = `${round1(step - CARD_W)}px`;
      el.style.zIndex = String(c.uid === ui.aim?.uid ? 20 : i + 1);
      const popNew = !!c.attach && attachNew === c.uid; // 새 턴에 막 붙은 카드: 손패가 들어온 뒤 260ms 에 칩이 튀어나오고 테두리가 한 번 빛난다
      if (popNew) el.classList.add('att-new');
      if (deal) {
        el.classList.add('deal');
        el.style.animationDelay = popNew ? `${i * 70}ms, ${i * 70 + 260}ms` : `${i * 70}ms`;
      }
      if (popNew) el.style.setProperty('--pop-d', `${(deal ? i * 70 : 0) + 260}ms`);
      return el;
    });
    handEl.replaceChildren(...els);
    handEl.classList.toggle('overlap', step < CARD_W + 12);
    if (!hand.length) handEl.append(h('p', { class: 'muted small ls-empty' }, '손패 없음'));
  }
  /** 손패 DOM 은 그대로 두고 조준 표시만 (끄는 중에는 카드 요소를 바꾸지 않는다 — pointer capture) */
  function markHand() {
    for (const el of handEl.querySelectorAll('.card-face')) {
      const on = el.dataset.uid === ui.aim?.uid;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      el.classList.toggle('dragging', ui.drag?.kind === 'card' && ui.drag.uid === el.dataset.uid);
    }
  }

  function renderPiles() {
    const p = v.piles || {};
    drawBtn.textContent = `덱 ${p.draw ?? 0}`;
    discBtn.textContent = `버림 ${p.discard ?? 0}`;
    drawBtn.title = '뽑을 더미 — 순서는 보이지 않습니다';
    discBtn.title = '버린 더미 — 뽑을 더미가 비면 섞어서 다시 씁니다';
    const gone = (p.exhausted ?? 0) + (p.removed ?? 0);
    pileNote.textContent = gone ? `제외 ${gone}` : '';
    pileNote.title = gone ? `1회 카드 ${p.exhausted ?? 0}장 · 결장 선수의 고유 카드 ${p.removed ?? 0}장` : '';
    playsEl.replaceChildren(h('span', { class: 'tiny muted' }, '이번 턴'), h('b', {}, `${Math.max(0, v.playsLeft ?? 0)}장`), h('span', { class: 'tiny muted' }, '더 낼 수 있음'));
  }

  function renderInfo() {
    const c = isLive() && !ui.busy ? aimCard() : null;
    const lines = [];
    if (ui.busy && !inert) {
      if (cutNote) {
        // 코치 지원 발동 (컷인 · 카드 연출 동안 — no-anim 에서는 컷인 덮개 대신 이 줄)
        lines.push(h('b', { class: 'ls-guide ls-cut-note' }, avatar(cutNote.color, cutNote.short, 'xs'), ` ${cutNote.short} 지원 발동`));
        lines.push(h('span', { class: 'small ls-cut-sub' }, h('b', {}, cutNote.ability), ` — ${cutNote.text}`));
      } else lines.push(h('b', { class: 'ls-guide' }, '훈련 중…'));
    } else if (inert || !isLive()) {
      lines.push(h('b', { class: 'ls-guide' }, `레슨 ${L.LESSON_STATUS_LABELS[v.status] ?? v.status}`));
    } else if (ui.drag?.kind === 'tok') {
      const p = playerOf(ui.drag.id);
      lines.push(h('b', { class: 'ls-guide' }, ui.drag.from === 'bench' ? `${p?.name ?? ''} — 경기장에 놓으면 복귀` : `${p?.name ?? ''} — 벤치 칸에 놓으면 쉬기`));
      lines.push(h('span', { class: 'small muted' }, ui.drag.from === 'bench' ? '자기 구역으로 돌아가 기본 훈련 · 카드 대상이 된다' : `이번 턴 기본 훈련 · 카드 대상 없음, 턴 끝 체력 +${benchRecover}`));
      if (ui.drag.from === 'field' && !v.canBench) lines.push(h('span', { class: 'small bad' }, `벤치는 최대 ${v.benchMax}명`));
    } else if (!c) {
      lines.push(h('b', { class: 'ls-guide' }, '카드를 끌어 경기장에 놓으세요'));
      lines.push(h('span', { class: 'small muted' }, '누르면 조준 · 지친 선수는 벤치 칸으로 끌어 쉬게'));
      const baseSum = (v.players || []).reduce((a, p) => a + (Number(p.baseNext) || 0), 0);
      if (baseSum > 0) lines.push(h('span', { class: 'small' }, '턴 끝 기본 훈련 ', h('b', { class: 'good' }, `+${baseSum}`), h('span', { class: 'muted' }, ' 예상')));
      if (cutRecap) {
        lines.push(h('span', { class: 'small ls-att-line ls-cut-recap' }, avatar(cutRecap.color, cutRecap.short, 'xs'),
          h('b', {}, ` ${cutRecap.short} 지원 발동`)));
        lines.push(h('span', { class: 'small ls-cut-sub' }, h('b', {}, cutRecap.ability), ` — ${cutRecap.text}`));
      }
      if (v.attach) {
        // 이번 턴 코치 지원: "[얼굴] 하르나 지원 → 인터벌 슈팅+" / "내면 골문을 보는 눈 · 슈팅 구역 대상 +50%"
        const ac = handCard(v.attach.uid);
        lines.push(h('span', { class: 'small ls-att-line', title: ac ? attachTitle(ac.attach, data) : '' },
          avatar(v.attach.color, v.attach.short, 'xs'), h('b', {}, ` ${v.attach.short} 지원`), ` → ${ac?.name ?? ''}${ac?.plus ? '+' : ''}`));
        lines.push(h('span', { class: 'tiny ls-att-sub' }, `내면 ${v.attach.ability?.name ?? ''} · ${v.attach.ability?.text ?? ''}`));
      }
      if (rec) {
        const t = rec.kind === 'play' ? (handCard(rec.uid)?.name ?? '')
          : rec.kind === 'bench' ? `${playerOf(rec.playerId)?.name ?? ''} 벤치 (체력 ${playerOf(rec.playerId)?.stamina ?? ''})` : '턴 끝';
        lines.push(h('span', { class: 'small' }, h('span', { class: 'badge badge-accent' }, '추천'), ` ${t}`));
      }
    } else {
      const dragging = ui.drag?.kind === 'card';
      lines.push(h('b', { class: 'ls-guide' }, c.name, c.plus ? '+' : '', h('span', { class: 'tiny muted ls-tk' }, ` · ${tkText(c)}`)));
      if (c.attach && !(pv?.ok && pv.attach)) { // 자리를 고르기 전: 지원 줄 (고른 뒤에는 노트 맨 앞 "하르나 지원 · …" 가 대신한다)
        lines.push(h('span', { class: 'small ls-att-line', title: attachTitle(c.attach, data) },
          avatar(c.attach.color, c.attach.short, 'xs'), h('b', {}, ` ${c.attach.short} 지원:`), ` ${c.attach.abilityText ?? ''}`));
      }
      const a = aimArgs();
      const hasPoint = hasPick(a);
      if (pv?.ok && c.heal) {
        const p = playerOf(pv.healId);
        const n = healAmountOf(c);
        lines.push(h('span', { class: 'ls-pv' }, h('span', { class: 'heal' }, `${p?.name ?? ''} 체력${n ? ` +${n}` : ' 회복'}`), h('span', { class: 'muted' }, ` (지금 ${p?.stamina ?? '–'})`)));
      } else if (pv?.ok && (pv.targets || []).length) {
        const n = new Set(pv.targets.map((t) => t.id)).size; // 서로 다른 선수 (고유 가로지르기 = 1명 두 행)
        const costs = pv.targets.map((t) => Number(t.cost) || 0);
        lines.push(h('span', { class: 'ls-pv' },
          `대상 ${n}명 · `, h('span', { class: 'good' }, `합계 +${pv.total}`),
          costs.some((x) => x > 0) ? h('span', { class: 'warn' }, ` · 체력 −${Math.max(...costs)}${n > 1 ? '/명' : ''}`) : null,
          pv.failRate > 0 ? h('span', { class: pv.failRate >= 0.25 ? 'bad' : 'warn' }, ` · 실패 ${pctText(pv.failRate)}`) : h('span', { class: 'muted' }, ' · 실패 없음')));
        // 구역별 상승: "➡️패스 +24 · 🛡️수비 +12"
        const byZone = {};
        for (const t of pv.targets) byZone[t.stat] = (byZone[t.stat] || 0) + (Number(t.gain) || 0);
        const zs = Object.entries(byZone).sort((x, y) => y[1] - x[1]);
        const bd = pv.shape && pv.shape.baseDelta != null ? Number(pv.shape.baseDelta) || 0 : null; // 자리 옮기기 · 가로지르기: 이번 턴 끝 기본 훈련 변화
        lines.push(h('span', { class: 'small ls-zsum' }, zs.map(([z, g], i) => [i ? ' · ' : '', `${L.ZONE_ICONS[z] ?? ''}${zoneShort(z)} +${g}`]),
          bd != null ? h('span', { class: bd > 0 ? 'good' : bd < 0 ? 'warn' : 'muted' }, ` · 기본 훈련 ${signed(bd)}`) : null));
        if (pv.failRate > 0 && pv.failerId) {
          const fp = playerOf(pv.failerId);
          lines.push(h('span', { class: 'tiny muted' }, `실패하면 ${fp?.name ?? ''} ${zoneShort(fp?.zone)} −${LS.failStatLoss ?? 5} (부상 ${pctText(LS.injuryChanceOnFail ?? 0.5)})`));
        }
      } else if (pv?.ok) {
        lines.push(h('span', { class: 'small' }, String(c.desc || '').slice(0, 64)));
      } else if (pointCard(c) && hasPoint) {
        lines.push(h('span', { class: 'small bad' }, pv?.reason || '여기에는 낼 수 없습니다'));
      } else if (pointCard(c)) {
        lines.push(h('span', { class: 'small' }, c.shape ? shapeGuide(c) : c.heal ? '회복할 선수 위 · 명단 줄 · 벤치 칸에 놓으세요' : c.targetKind === 'circle' ? '원을 놓을 자리를 고르세요 — 원 안 선수 전원이 대상' : '선수 위에 놓으세요'));
      } else if (pv?.reason) {
        lines.push(h('span', { class: 'small bad' }, pv.reason));
      }
      // 노트 (코치 지원 노트 "하르나 지원 · 슈팅 구역 ×1.5" 는 맨 앞 — 코치 색. 위 지원 줄과 같은 문구면 뺀다)
      const notes = pv?.ok ? (pv.notes || []) : [];
      if (notes.length) lines.push(h('ul', { class: 'cf-notes' }, notes.slice(0, 2).map((n, i) => h('li', { class: i === 0 && pv.attach && n === pv.attach.note ? 'att' : '' }, n))));
      if (!dragging && ui.aim && ui.aim.idx >= 0) {
        const list = candidates(c.uid);
        const cd = list[ui.aim.idx];
        if (cd) lines.push(h('span', { class: 'tiny ls-cand' }, `후보 ${ui.aim.idx + 1}/${list.length} · ${candLabel(cd)}`));
      }
      const needs = shapeNeedsOf(c);
      lines.push(h('span', { class: 'tiny muted' }, dragging || ui.drag?.kind === 'shape'
        ? '놓으면 냅니다 · 밖에서 놓거나 Esc = 취소'
        : needs === 'player' ? `받을 선수 누르기 · ${ownerName(c)} 끌기 · ←→ 후보 · Enter 내기`
          : needs === 'zone' ? `구역 누르기 · ${ownerName(c)} 끌기 · 1~5 · ←→ · Enter 내기`
            : pointCard(c) ? '경기장을 눌러 놓기 · ←→ 후보 · 1~5 구역 · Enter 내기 · Esc 취소' : '[내기] · 카드 한 번 더 · Enter = 내기 · Esc = 취소'));
    }
    infoEl.replaceChildren(...lines);
  }
  function tkText(c) {
    if (c.shape) return c.shape.chip || c.shape.label || '주인';
    if (c.heal) return '선수 1명 회복';
    if (c.targetKind === 'circle') return L.CIRCLE_SIZE_LABELS[c.size] ?? '원';
    if (c.targetKind === 'single') return c.onlyZones?.length ? `${L.zonesText(c.onlyZones)} 단일` : '단일';
    return L.CARD_TARGET_LABELS[c.targetKind] ?? c.targetKind;
  }

  function renderButtons() {
    const live = isLive() && !ui.busy;
    const c = ui.aim ? handCard(ui.aim.uid) : null;
    const a = c ? aimArgs() : null;
    const ready = !!(c && pv?.ok && (!pointCard(c) || hasPick(a)));
    playBtn.disabled = !(live && !ui.drag && ready);
    endBtn.disabled = !(live && v.canEndTurn && !ui.drag);
    endBtn.title = '남은 추가 사용을 버리고 턴을 끝냅니다 — 경기장 선수 기본 훈련 · 벤치 회복';
    playBtn.title = c ? (ready ? `${c.name} 내기` : '놓을 자리를 먼저 고르세요') : '카드를 눌러 조준하면 켜집니다';
    const on = live && rec?.kind === 'endTurn';
    endBtn.classList.toggle('recommended', on);
    const old = endBtn.querySelector('.rec-badge');
    if (on && !old) endBtn.append(h('span', { class: 'badge badge-accent rec-badge' }, '추천'));
    if (!on && old) old.remove();
  }

  /** 끄는 중 · 조준 중 다시 그리기 (손패 DOM 은 그대로) */
  function renderLive() {
    computePreview();
    renderHud();
    renderTokens();
    renderSide();
    markHand();
    renderInfo();
    renderButtons();
    renderAim();
  }
  /** 전체 갱신 (엔진 뷰 다시 읽기) — 연출이 끝난 뒤 · 조작이 바뀔 때 */
  function refresh({ deal = false, flash = [], attached = null } = {}) {
    if (!alive()) return;
    v = getView(true) || v;
    shown = { score: v.score, stamina: {} };
    cutNote = null;
    cutRecap = null;
    attachNew = attached && v.attach?.uid === attached ? attached : null;
    setCoach(v.attach?.coachType, v.attach?.color);
    candCache = null;
    rec = isLive() && manager ? safe(() => manager.recommendCard(st(), data)) : null;
    if (ui.aim && !(v.hand || []).some((c) => c.uid === ui.aim.uid && c.playable)) { ui.aim = null; hoverAt = null; }
    if (!isLive()) ui.aim = null;
    computePreview();
    renderHud();
    if (flash.length) renderChips(flash);
    renderTokens();
    renderSide();
    renderHand(deal);
    renderPiles();
    renderInfo();
    renderButtons();
    renderAim();
    benchFx = null;
    attachNew = null;
    scheduleAuto();
  }

  /* ------------------------------------------------------------------ */
  /* 조작: 조준 · 내기 · 벤치 · 턴 끝                                          */
  /* ------------------------------------------------------------------ */
  function onCardClick(uid) {
    if (suppressClick || !isLive() || ui.busy || ui.drag) return;
    const c = handCard(uid);
    if (!c) return;
    if (!c.playable) { toast(`${c.name}: ${c.deadReason || '지금은 낼 수 없습니다'}`, 'info', 2200); return; }
    if (ui.aim?.uid === uid) {
      const a = aimArgs();
      if (!pointCard(c) || (pv?.ok && a && (ui.aim.at || ui.aim.playerId || ui.aim.zone))) { playAim(); return; } // 전체 · 주인 · 없음, 또는 고른 자리에 = 두 번 누르기로 낸다
      ui.aim = null;
      hoverAt = null;
      renderLive();
      return;
    }
    ui.aim = { uid, idx: -1, at: null, playerId: null, zone: null };
    hoverAt = null;
    renderLive();
  }
  function cancelAim() {
    if (!ui.aim) return;
    ui.aim = null;
    hoverAt = null;
    renderLive();
  }
  /** 조준 · 끌기 결과로 낸다 (args = { uid, at?, playerId? }) */
  function playWith(args) {
    if (!isLive() || ui.busy || !args?.uid) return;
    const vPrev = v;
    // 코치 지원 배율이 걸린 대상 (미리보기 — 순수, rng 없음): 연출에서 "+N ×1.5" 를 코치 색으로
    const boost = {};
    // 고유 카드 모양 연출 (§16.7): 배율이 걸린 행 (받는 선수 ×1.3 · 주인 ×1.5 — "+N ×1.3" 팝), 옮긴 뒤 대형 (토큰이 뛰어간다)
    const shapeFx = { mult: {}, positionsAfter: null };
    const hc = handCard(args.uid);
    if (hc?.attach || hc?.shape) {
      try {
        const p0 = run.previewCard(st(), data, args);
        for (const t of p0?.targets || []) {
          if ((Number(t.attachMult) || 1) > 1) boost[t.id] = Number(t.attachMult);
          if ((Number(t.shapeMult) || 1) > 1) shapeFx.mult[t.id] = Number(t.shapeMult);
        }
        if (p0?.shape?.positionsAfter) shapeFx.positionsAfter = p0.shape.positionsAfter;
      } catch (_) { /* 미리보기 실패는 연출만 줄인다 */ }
    }
    const r = actions.lessonCall('playCard', args);
    ui.aim = null;
    hoverAt = null;
    ui.drag = null;
    if (r === undefined) { refresh(); return; }
    animate(vPrev, { kind: 'play', uid: args.uid, boost, shapeFx });
  }
  function playAim() {
    if (!isLive() || ui.busy || !ui.aim) return;
    const c = handCard(ui.aim.uid);
    if (!c) return;
    const a = aimArgs();
    computePreview();
    if (!pv?.ok) { toast(`${c.name}: ${pv?.reason || '놓을 자리를 고르세요'}`, 'info', 2000); renderLive(); return; }
    playWith(a);
  }
  function playHealOn(playerId) {
    const c = aimCard();
    if (!c || !c.heal || !isLive() || ui.busy) return;
    playWith({ uid: c.uid, playerId });
  }
  function toggleBench(id) {
    if (!isLive() || ui.busy || ui.drag) return;
    const p = playerOf(id);
    if (!p || p.out) return;
    doBench(id, !p.bench);
  }
  function doBench(id, on) {
    if (!isLive() || ui.busy) return;
    if (on && !v.canBench) { toast(`벤치는 한 턴에 최대 ${v.benchMax}명입니다`, 'info', 1800); return; }
    const r = actions.lessonCall('benchPlayer', { playerId: id, on });
    if (r === undefined) { refresh(); return; }
    ui.shownSeq = st().lesson?.seq ?? ui.shownSeq;
    benchFx = { id, on };
    refresh();
  }
  function endTurn() {
    if (!isLive() || ui.busy || !v.canEndTurn) return;
    const vPrev = v;
    ui.aim = null;
    hoverAt = null;
    const r = actions.lessonCall('endLessonTurn');
    if (r === undefined) { refresh(); return; }
    animate(vPrev, { kind: 'end' });
  }

  /* ------------------------------------------------------------------ */
  /* 끌기 (Pointer Events): 카드 → 경기장 · 명단 / 토큰 ↔ 벤치                   */
  /* ------------------------------------------------------------------ */
  function stageScale() {
    const r = screen.getBoundingClientRect();
    return screen.offsetWidth > 0 && r.width > 0 ? r.width / screen.offsetWidth : 1;
  }
  function onCardPointerDown(e, uid) {
    if (!isLive() || ui.busy || (e.button != null && e.button > 0) || press) return;
    const c = handCard(uid);
    if (!c || !c.playable) return;
    press = { kind: 'card', uid, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, el: e.currentTarget, started: false };
    listen(true);
  }
  function onTokPointerDown(e, id, from) {
    if (!isLive() || ui.busy || (e.button != null && e.button > 0) || press) return;
    if (ui.aim) {
      // 조준 중: 받는 선수 · 구역이 필요한 고유 카드의 주인 토큰 = 모양 끌기 (이어 주기 · 자리 옮기기 · 가로지르기 — 선수에서 끌기, §16.7).
      // 그 밖 토큰 누르기 = 그 자리에 놓기 (경기장 click) — 벤치 끌기는 하지 않는다
      const c = handCard(ui.aim.uid);
      if (from === 'field' && shapeNeeds(c) && c.ownerId === id) {
        press = { kind: 'shape', uid: c.uid, id, from, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, el: e.currentTarget, started: false };
        listen(true);
      }
      return;
    }
    press = { kind: 'tok', id, from, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId, el: e.currentTarget, started: false };
    listen(true);
  }
  function listen(on) {
    const f = on ? 'addEventListener' : 'removeEventListener';
    globalThis[f]?.('pointermove', onPointerMove, { passive: false });
    globalThis[f]?.('pointerup', onPointerUp);
    globalThis[f]?.('pointercancel', onPointerCancel);
  }
  function onPointerMove(e) {
    if (!alive()) { listen(false); press = null; return; }
    if (!press || e.pointerId !== press.pointerId || press.cancelled) return;
    if (!press.started) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < DRAG_PX) return;
      startDrag();
    }
    e.preventDefault?.();
    lastPt = { x: e.clientX, y: e.clientY };
    if (!frameReq) {
      frameReq = true;
      const raf = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
      raf(() => { frameReq = false; if (alive() && ui.drag) dragFrame(); });
    }
  }
  function startDrag() {
    press.started = true;
    closeInfo(); // 끌기 = 선수 정보 팝오버 닫기 (경기장 · 명단을 가리지 않게)
    try { press.el?.setPointerCapture?.(press.pointerId); } catch (_) { /* 이미 놓았으면 무시 */ }
    hoverAt = null;
    if (press.kind === 'shape') {
      // 주인 토큰 끌기: 조준은 그대로 (놓기에 실패하면 조준 모드로 돌아온다). 포인터 유령 = 주인 얼굴 (경기장 위에서는 모양 표시가 대신)
      const p = playerOf(press.id);
      ui.drag = { kind: 'shape', uid: press.uid, id: press.id, at: null, over: null };
      ghost.className = 'drag-ghost on tok-ghost shape-drag';
      ghost.replaceChildren(h('span', { class: 'tg-face', style: { background: p?.portraitColor || '#4b5563' } }, initialOf(p?.name)), h('span', { class: 'tg-nm' }, p?.name ?? ''));
      screen.classList.add('dragging');
      renderLive();
      return;
    }
    ui.aim = null;
    if (press.kind === 'card') {
      const c = handCard(press.uid);
      ui.drag = { kind: 'card', uid: press.uid, at: null, playerId: null, over: null };
      const att = c?.attach || null;
      ghost.className = ['drag-ghost', 'on', 'card-ghost', `fam-${c?.family ?? 'common'}`, att ? 'attached' : '', att?.coachType ? `co-${att.coachType}` : ''].filter(Boolean).join(' ');
      if (att?.color) ghost.style.setProperty('--coach-face', att.color);
      else ghost.style.removeProperty('--coach-face');
      ghost.replaceChildren(...[
        h('span', { class: 'dg-band' }),
        att ? h('span', { class: 'dg-coach', title: attachTitle(att, data) }, initialOf(att.short || att.name)) : null,
        h('b', { class: 'dg-name' }, c?.name ?? '', c?.plus ? [WJ, h('span', { class: att?.upgrade === 'plus' ? 'dg-plus att' : 'dg-plus' }, '+')] : ''), // U+2060: "+" 만 다음 줄로 넘어가지 않게
        c?.shape
          ? h('span', { class: ['dg-tk', 'shape'] }, h('i', { class: ['cf-ticon', `s-${shapeIconKey(c.shape)}`, c.shape.size ? `sz-${c.shape.size}` : ''] }), tkText(c))
          : h('span', { class: ['dg-tk', c?.heal ? 'heal' : c?.targetKind, c?.size ? `sz-${c.size}` : ''] }, h('i'), tkText(c || {})),
        att ? h('span', { class: 'dg-att' }, `${att.short} 지원`) : null,
        c?.power != null ? h('span', { class: 'dg-pw' }, `1인 ${c.power}`) : h('span', { class: 'dg-pw heal' }, c?.heal ? `체력 +${healAmountOf(c) ?? ''}` : '효과'),
      ].filter(Boolean)); // 네이티브 replaceChildren 은 null 을 "null" 글자로 넣는다
    } else {
      const p = playerOf(press.id);
      ui.drag = { kind: 'tok', id: press.id, from: press.from, over: null };
      ghost.className = 'drag-ghost on tok-ghost';
      ghost.replaceChildren(h('span', { class: 'tg-face', style: { background: p?.portraitColor || '#4b5563' } }, initialOf(p?.name)), h('span', { class: 'tg-nm' }, p?.name ?? ''));
    }
    screen.classList.add('dragging');
    renderLive();
  }
  function moveGhost(pt) {
    const sr = screen.getBoundingClientRect();
    const s = stageScale();
    ghost.style.transform = `translate(${px((pt.x - sr.left) / s)}, ${px((pt.y - sr.top) / s)})`;
  }
  function hitAt(pt) {
    try { return document.elementFromPoint?.(pt.x, pt.y) || null; } catch (_) { return null; }
  }
  function benchDropState() {
    const d = ui.drag;
    if (!d || d.kind !== 'tok' || d.from !== 'field') return null;
    if (d.over !== 'bench') return 'hint';
    return v.canBench ? 'ok' : 'bad';
  }
  function dragFrame() {
    const d = ui.drag;
    const pt = lastPt;
    if (!d || !pt) return;
    moveGhost(pt);
    const fp = pointerToField(pt.x, pt.y, field.getBoundingClientRect());
    const overField = !!(fp && fp.inside);
    const hit = hitAt(pt);
    if (d.kind === 'card') {
      const c = handCard(d.uid);
      d.at = null;
      d.playerId = null;
      d.over = null;
      if (overField) {
        d.over = 'field';
        d.at = { x: fp.x, y: fp.y };
      } else if (c?.heal) {
        const row = hit?.closest?.('.ls-row, .ls-bench-slot.filled');
        if (row?.dataset?.pid) { d.over = 'row'; d.playerId = row.dataset.pid; }
      }
      ghost.classList.toggle('over-field', overField);
      ghost.classList.toggle('over-row', d.over === 'row');
    } else if (d.kind === 'shape') {
      d.over = overField ? 'field' : null;
      d.at = overField ? { x: fp.x, y: fp.y } : null;
      ghost.classList.toggle('over-field', overField);
    } else {
      d.over = overField ? 'field' : hit?.closest?.('.ls-bench') ? 'bench' : null;
      ghost.classList.toggle('over-ok', (d.from === 'field' && d.over === 'bench' && v.canBench) || (d.from === 'bench' && d.over === 'field'));
      ghost.classList.toggle('over-bad', d.from === 'field' && d.over === 'bench' && !v.canBench);
    }
    renderLive();
  }
  function endDragUi() {
    ui.drag = null;
    ghost.className = 'drag-ghost';
    ghost.replaceChildren();
    screen.classList.remove('dragging');
    markHand();
  }
  function onPointerUp(e) {
    if (!press || e.pointerId !== press.pointerId) return;
    listen(false);
    const p = press;
    press = null;
    if (p.cancelled) { suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); return; } // Esc 로 취소한 끌기: 놓아도 아무것도 안 함
    if (!p.started) return; // 움직이지 않음 = 클릭 (click 이벤트가 처리)
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (!alive()) return;
    lastPt = { x: e.clientX, y: e.clientY };
    dragFrame();
    const d = ui.drag;
    if (!d) return;
    if (d.kind === 'card') {
      const c = handCard(d.uid);
      const args = aimArgs();
      endDragUi();
      if (d.over === 'field' || d.over === 'row') {
        if (pv?.ok && c) { playWith(args); return; }
        toast(`${c?.name ?? '카드'}: ${pv?.reason || '여기에는 낼 수 없습니다'}`, 'info', 2000);
      }
      renderLive();
      return;
    }
    if (d.kind === 'shape') {
      // 주인 토큰을 받는 선수 · 구역에 놓았다 → 그 점으로 낸다 (판정 = 엔진). 밖이면 조준 모드로 돌아온다
      const c = handCard(d.uid);
      const args = aimArgs();
      endDragUi();
      if (d.over === 'field') {
        if (pv?.ok && c) { playWith(args); return; }
        toast(`${c?.name ?? '카드'}: ${pv?.reason || '여기에는 낼 수 없습니다'}`, 'info', 2000);
      }
      renderLive();
      return;
    }
    endDragUi();
    if (d.from === 'field' && d.over === 'bench') { doBench(d.id, true); return; }
    if (d.from === 'bench' && d.over === 'field') { doBench(d.id, false); return; }
    renderLive();
  }
  function onPointerCancel(e) {
    if (!press || e.pointerId !== press.pointerId) return;
    listen(false);
    press = null;
    if (ui.drag) { endDragUi(); renderLive(); }
  }
  /** Esc: 끌기 취소 — 포인터를 놓을 때까지 누른 상태는 '취소됨'으로 남겨 놓을 때 클릭 · 내기가 나가지 않게 한다 */
  function cancelDrag() {
    const started = !!(press?.started || ui.drag);
    if (press && started) press = { ...press, cancelled: true };
    else { listen(false); press = null; }
    if (!started) return;
    endDragUi();
    renderLive();
  }

  // ---- 경기장: hover (조준 모드 마우스) · 클릭 · 탭 ----
  field.addEventListener('pointermove', (e) => {
    if (ui.drag || press || !ui.aim || ui.busy || !isLive()) return;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const c = handCard(ui.aim.uid);
    if (!pointCard(c)) return;
    const fp = pointerToField(e.clientX, e.clientY, field.getBoundingClientRect());
    if (!fp) return;
    hoverAt = { x: fp.x, y: fp.y };
    if (!frameReq) {
      frameReq = true;
      const raf = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
      raf(() => { frameReq = false; if (alive() && ui.aim && !ui.drag) renderLive(); });
    }
  });
  field.addEventListener('pointerleave', () => {
    if (!hoverAt) return;
    hoverAt = null;
    if (alive() && !ui.drag) renderLive();
  });
  // 놓을 자리 = 경기장 pointerup 좌표 (ZI 브라우저 점검): click 좌표는 정수 px 로 반올림되고(hover 미리보기는 소수 px —
  // 원 테두리의 선수가 미리보기와 달라질 수 있다), 터치 탭이면 브라우저 터치 보정이 토큰 쪽으로 몇 px 당긴다
  let lastUp = null;
  field.addEventListener('pointerup', (e) => {
    lastUp = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  });
  field.addEventListener('click', (e) => {
    if (suppressClick || !isLive() || ui.busy || ui.drag || !ui.aim) return;
    const c = handCard(ui.aim.uid);
    if (!c) return;
    if (!pointCard(c)) { playAim(); return; } // 전체 · 주인 · 없음 · 주인 둘레 원 · 구역 전원: 경기장 아무 데나
    // 받는 선수 · 구역이 필요한 고유 카드: 주인 토큰 누르기 = 끌기 출발점 (내지 않는다 — 받는 선수 · 구역을 누르거나 주인을 끌어 놓는다)
    if (shapeNeeds(c) && e.target?.closest?.('.tok')?.dataset?.id === c.ownerId) return;
    const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    const raw = lastUp && Math.abs(e.timeStamp - lastUp.t) < 1000 && Math.hypot(lastUp.x - e.clientX, lastUp.y - e.clientY) < 16 ? lastUp : { x: e.clientX, y: e.clientY };
    lastUp = null;
    const fp = pointerToField(raw.x, raw.y, field.getBoundingClientRect());
    if (!fp) return;
    const at = { x: fp.x, y: fp.y };
    // 같은 자리 다시 탭 = 내기. 고유 모양은 "같은 받는 선수 · 같은 구역" 이면 같은 자리 (엔진 미리보기로 비교 — 순수)
    const sameSpot = () => {
      if (!ui.aim.at) return false;
      if (distU(ui.aim.at, at) <= Z.pickR + 1) return true;
      const needs = shapeNeedsOf(c);
      if (!needs) return false;
      try {
        const p1 = run.previewCard(st(), data, { uid: c.uid, at: ui.aim.at })?.shape;
        const p2 = run.previewCard(st(), data, { uid: c.uid, at })?.shape;
        return needs === 'zone' ? !!p1?.to && p1.to === p2?.to : !!p1?.receiverId && p1.receiverId === p2?.receiverId;
      } catch (_) { return false; }
    };
    if (touch && !sameSpot()) {
      // 터치: 탭 1번 = 그 자리에 놓기, 같은 자리 한 번 더 · [내기] = 내기
      ui.aim.at = at;
      ui.aim.playerId = null;
      ui.aim.zone = null;
      ui.aim.idx = -1;
      hoverAt = null;
      renderLive();
      return;
    }
    hoverAt = null;
    ui.aim.at = touch ? ui.aim.at : at;
    ui.aim.playerId = null;
    ui.aim.zone = null;
    computePreview();
    if (pv?.ok) playAim();
    else { toast(`${c.name}: ${pv?.reason || '여기에는 낼 수 없습니다'}`, 'info', 1800); renderLive(); }
  });

  /* ------------------------------------------------------------------ */
  /* 키보드: Esc · ← → (Tab) 후보 · 1~5 구역 · Enter · B                        */
  /* ------------------------------------------------------------------ */
  function cycleCand(dir) {
    const c = handCard(ui.aim?.uid);
    if (!c) return;
    const list = candidates(c.uid);
    if (!list.length) { toast(`${c.name}: 놓을 수 있는 자리가 없습니다`, 'info', 1600); return; }
    const n = list.length;
    const i0 = ui.aim.idx;
    const idx = i0 < 0 ? (dir > 0 ? 0 : n - 1) : (i0 + dir + n) % n;
    const cd = list[idx];
    const needs = shapeNeedsOf(c);
    ui.aim.idx = idx;
    ui.aim.at = cd.at ? { ...cd.at } : null;
    ui.aim.playerId = cd.playerId && (c.targetKind === 'single' || needs === 'player') ? cd.playerId : null;
    ui.aim.zone = cd.zone && needs === 'zone' ? cd.zone : null;
    hoverAt = null;
    renderLive();
  }
  function zoneKey(k) {
    const c = handCard(ui.aim?.uid);
    const z = ZONE_KEY_ORDER[k - 1];
    if (!c || !z || !Z.centers[z] || !pointCard(c)) return;
    const needs = shapeNeedsOf(c);
    if (needs === 'player') return; // 받는 선수 모양: 숫자 키는 쓰지 않는다 (← → 후보)
    if (needs === 'zone' && c.shape.kind === 'carry' && v.zones?.[c.ownerId] === z) return; // 가로지르기: 지금 구역 숫자는 무시
    ui.aim.at = needs === 'zone' ? null : { ...Z.centers[z] };
    ui.aim.zone = needs === 'zone' ? z : null;
    ui.aim.playerId = null;
    ui.aim.idx = -1;
    hoverAt = null;
    renderLive();
  }
  const onKey = (e) => {
    if (!alive()) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') {
      if (press || ui.drag) { cancelDrag(); return; }
      if (infoPop) { closeInfo(); return; } // 선수 정보 팝오버 먼저 (다음 Esc = 조준 취소)
      if (ui.aim && !ui.busy) cancelAim();
      return;
    }
    if (!isLive() || ui.busy || ui.drag || !ui.aim) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'Tab') {
      const c = handCard(ui.aim.uid);
      if (!pointCard(c)) return;
      e.preventDefault();
      cycleCand(e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
      return;
    }
    if (/^[1-5]$/.test(e.key)) { e.preventDefault(); zoneKey(Number(e.key)); return; }
    if (e.key === 'Enter') {
      if (e.target?.closest?.('button')) return; // 포커스된 버튼(카드 · [내기])은 제 click 으로
      e.preventDefault();
      playAim();
    }
  };
  if (!inert) document.addEventListener('keydown', onKey);
  // 선수 정보 팝오버: 바깥 누르기 = 닫기 (같은 토큰 · 줄은 그 click 이 열고 닫는다 — 토글). 캡처 단계라 다른 처리보다 먼저, 막지는 않는다
  const onDocDown = (e) => {
    if (!alive()) { document.removeEventListener('pointerdown', onDocDown, true); return; }
    if (!infoPop) return;
    const t = e.target;
    if (t && pinfo.contains(t)) return;
    const tokId = t?.closest?.('.tok')?.dataset?.id;
    const rowId = t?.closest?.('.ls-row')?.dataset?.pid;
    if (infoPop.src === 'tok' ? tokId === infoPop.id : rowId === infoPop.id) return;
    closeInfo();
  };
  if (!inert) document.addEventListener('pointerdown', onDocDown, true);

  /** 덱 · 버림 더미 보기 (뽑을 더미는 이름순 — 순서는 보이지 않는다) */
  function openPile(which) {
    const L0 = st().lesson;
    if (!L0) return;
    const uids = which === 'draw' ? L0.drawPile : L0.discard;
    const defs = new Map(((data.cards && data.cards.cards) || []).map((c) => [c.id, c]));
    const entryOf = (uid) => (st().deck || []).find((d) => d.uid === uid) || (L0.temp || []).find((d) => d.uid === uid) || null;
    const items = (uids || []).map((uid) => {
      const e = entryOf(uid);
      const d = e ? defs.get(e.cardId) : null;
      return d ? { uid, cardId: d.id, name: d.name, family: d.family, plus: !!e.plus, ownerCharId: d.ownerCharId, desc: e.plus && d.descPlus ? d.descPlus : d.desc } : null;
    }).filter(Boolean);
    if (which === 'draw') items.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const title = which === 'draw' ? `뽑을 더미 ${items.length}장 (순서는 비밀)` : `버린 더미 ${items.length}장`;
    const m = openModal(h('div', { class: 'col pile-modal' },
      h('h3', {}, title),
      items.length ? h('div', { class: 'pile-grid' }, items.map((it) => miniCard(it, { data, note: uniqueNote(it, st().players) }))) : h('p', { class: 'muted' }, '비어 있음'),
      h('div', { class: 'row end modal-foot' }, h('button', { class: 'btn', onclick: () => m.close() }, '닫기'))), { className: 'modal-lg' });
  }

  /* ------------------------------------------------------------------ */
  /* 연출 (§14.16): 제자리 훈련 → +N → 턴 끝 기본 훈련 · 벤치 회복 → 흩어지기 · 새 손패 → (레슨 끝) 보상 */
  /* ------------------------------------------------------------------ */
  function pop(spot, text, tone = 'good', extra = '') {
    const [x, y] = toPx(spot);
    const dy = TOKEN_PX * 0.95;
    const py = Math.max(12, y - dy);
    const el = h('div', { class: ['m-pop', 'c', 'ls-pop', tone, extra], style: { transform: `translate(${px(x)}, ${px(py)})` } },
      h('span', {}, text));
    el.style.setProperty('--t-pop', `${reduced ? 900 : 1300}ms`);
    popLayer.append(el);
    setTimeout(() => el.remove(), reduced ? 900 : 1400);
    return el;
  }
  const centerPop = (text, tone = 'good', extra = 'big') => pop({ x: 50, y: 50 + (TOKEN_PX * 0.95 / H) * 100 }, text, tone, extra);
  /** 벤치 칸 · 명단 줄 위 작은 팝 (경기장 밖 선수: 벤치 회복 · 회복 카드) */
  function sidePop(id, text, tone = 'heal') {
    const host = benchSlots.querySelector(`.ls-bench-slot[data-pid="${id}"]`) || rowEls.get(id);
    if (!host) return;
    const el = h('span', { class: ['side-pop', tone] }, text);
    host.append(el);
    setTimeout(() => el.remove(), reduced ? 900 : 1300);
  }
  const spotOf = (id) => v.positions?.[id] || null;
  function popAt(id, text, tone, extra) {
    const s = spotOf(id);
    if (s) pop(s, text, tone, extra);
    else sidePop(id, text, tone === 'bad' ? 'bad' : 'heal');
  }

  /* ---- 코치 컷인 (§15.8 ②) ---- */
  /** fxPlan.cutin + 내기 전 뷰(붙은 지원 · 손패 카드) → 컷인 그림 정보 */
  function cutinInfo(fc, vPrev) {
    const a = vPrev?.attach && vPrev.attach.supportId === fc.supportId ? vPrev.attach : null;
    const sp = (data.supports || []).find((x) => x.id === fc.supportId) || null;
    const coach = fc.coach || a?.name || sp?.name || '';
    const parts = String(coach).trim().split(/\s+/);
    return {
      supportId: fc.supportId, coach, short: a?.short || parts[parts.length - 1] || coach,
      color: a?.color || sp?.portraitColor || '#4b5563', coachType: a?.coachType || sp?.type || null,
      ability: fc.name || a?.ability?.name || '', text: fc.text || a?.ability?.text || '', line: coachLine(fc.supportId),
      repeat: Number(fc.repeat) || 0, card: (vPrev?.hand || []).find((c) => c.uid === fc.uid) || null,
    };
  }
  /**
   * 컷인 덮개를 띄우고 닫히면 next() — 첫 컷인(repeat 0) CUT_MS.first · 다음부터 .short CUT_MS.repeat.
   * 넘기기: 덮개 누르기(pointerdown · click) · Enter · Space · Esc. no-anim 이면 덮개 없이 바로 next (dock 안내 칸이 cutNote 를 보인다).
   */
  function showCutin(cut, next) {
    const short = cut.repeat > 0;
    const dur = Number(short ? CUT_MS.repeat : CUT_MS.first) || 0;
    if (reduced || dur <= 0) { next(); return; }
    const typeLabel = cut.coachType ? (L.STAT_LABELS[cut.coachType] ?? '') : '';
    const card = cut.card;
    cutLayer.className = ['ls-cutin', 'on', short ? 'short' : 'first', cut.coachType ? `co-${cut.coachType}` : ''].filter(Boolean).join(' ');
    cutLayer.style.setProperty('--t-cut', `${dur}ms`);
    cutLayer.style.setProperty('--coach-face', cut.color);
    cutLayer.setAttribute('aria-label', `${cut.coach} 지원: ${cut.text}`);
    cutLayer.replaceChildren(
      h('div', { class: 'lc-flash', 'aria-hidden': 'true' }),
      h('div', { class: ['lc', short ? 'short' : ''] },
        h('div', { class: 'lc-band' },
          h('span', { class: 'lc-face', 'aria-hidden': 'true' }, initialOf(cut.short || cut.coach)),
          h('div', { class: 'lc-txt' },
            h('small', {}, `코치 지원${typeLabel ? ` · ${typeLabel}` : ''}`),
            h('b', {}, cut.coach),
            cut.line ? h('span', { class: 'lc-line' }, `“${cut.line}”`) : null,
            h('span', { class: 'lc-sub' }, h('em', {}, cut.ability), h('span', {}, cut.text))),
          card ? h('span', { class: ['lc-card', `fam-${card.family || 'common'}`], 'aria-hidden': 'true' },
            h('i', { class: 'lc-card-band' }),
            h('b', { class: 'lc-card-nm' }, card.name, card.plus ? WJ : null, card.plus ? h('span', { class: card.attach?.upgrade === 'plus' ? 'lc-plus att' : 'lc-plus' }, '+') : null),
            card.power != null ? h('span', { class: 'lc-card-pw' }, `1인 ${card.power}`) : h('span', { class: 'lc-card-pw' }, '효과'),
            h('span', { class: 'lc-card-tag' }, '지원')) : null)),
      ...(short ? [] : [h('span', { class: 'lc-skip' }, '탭하여 넘기기')]));
    let done = false;
    let tid = null;
    const onK = (e) => {
      if (!alive()) { document.removeEventListener('keydown', onK, true); return; }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar' || e.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        close();
      }
    };
    const close = () => {
      if (done) return;
      done = true;
      cutClose = null;
      if (tid != null) clearTimeout(tid);
      document.removeEventListener('keydown', onK, true);
      cutLayer.className = 'ls-cutin';
      cutLayer.replaceChildren();
      if (alive()) next();
    };
    cutClose = close;
    document.addEventListener('keydown', onK, true);
    tid = setTimeout(() => {
      if (alive()) close();
      else document.removeEventListener('keydown', onK, true);
    }, dur);
  }
  /** 능력 연출 (카드 "+N" 과 함께): 경기장 가운데 알약 — 코치 얼굴 · 능력 이름 · 효과 · 결과 (힌트 · 컨디션 · 유대), 컨디션이 오르면 옆 칸 컨디션 줄이 빛난다 */
  function abilityFx(cut, plan) {
    const bits = [];
    if (plan.play.hints.includes(cut.supportId)) bits.push(['hint', '힌트 획득!']);
    if (plan.play.condition > 0) bits.push(['cond', `컨디션 +${plan.play.condition}`]);
    const bond = plan.play.bond.find((b) => b.supportId === cut.supportId);
    if (bond?.n) bits.push(['bond', `유대 +${bond.n}`]);
    const el = h('div', { class: ['ls-abil', cut.coachType ? `co-${cut.coachType}` : ''] },
      h('span', { class: 'la-face', style: { background: cut.color } }, initialOf(cut.short || cut.coach)),
      h('b', { class: 'la-name' }, cut.ability),
      h('span', { class: 'la-text' }, cut.text),
      bits.map(([k, t]) => h('span', { class: ['la-bit', k] }, t)));
    popLayer.append(el);
    setTimeout(() => el.remove(), reduced ? 900 : 1700);
    if (plan.play.condition > 0) sideFoot.querySelector('.ls-cond')?.classList.add('flash');
  }

  function animate(vPrev, act) {
    setBusy(true);
    pv = null;
    const L1 = st().lesson;
    const plan = fxPlan(L1?.lastFx || []);
    ui.shownSeq = L1?.seq ?? ui.shownSeq;
    const vNew = getView(true) || v;
    const ended = st().phase !== 'lesson' || vNew.status !== 'playing';
    const cut = act.kind === 'play' && plan.cutin ? cutinInfo(plan.cutin, vPrev) : null;
    const boost = act.boost || {};
    cutNote = cut ? { color: cut.color, name: cut.coach, short: cut.short, ability: cut.ability, text: cut.text } : null;
    if (cut) setCoach(cut.coachType, cut.color);
    // 보여 주는 값: 처음에는 이전 점수 · 체력 (카드 비용은 바로), 단계마다 바꾼다
    v = vPrev;
    shown = { score: vPrev.score, stamina: {}, turn: vPrev.turn };
    for (const p of vPrev.players) shown.stamina[p.id] = Math.max(0, (Number(p.stamina) || 0) - (plan.play.cost[p.id] || 0));
    if (act.kind === 'play') {
      const el = handEl.querySelector(`.card-face[data-uid="${act.uid}"]`);
      if (el) el.classList.add('played');
    }
    renderAim();
    renderInfo();
    renderButtons();
    renderTokens();
    renderSide();
    const targets = plan.play.targets;
    // 카드 단계 뒤 체력 (턴 끝 · 레슨 끝 변화를 뺀 값)
    const afterPlayStamina = (p) => {
      let s = Number(p.stamina) || 0;
      if (plan.turn) s = s - (plan.turn.bench[p.id] || 0) - (plan.turn.heal[p.id] || 0) + (plan.turn.baseCost[p.id] || 0);
      if (plan.end) s -= plan.end.heal[p.id] || 0;
      return Math.max(0, Math.min(100, s));
    };
    const sfx = act.shapeFx || { mult: {}, positionsAfter: null };
    // 고유 모양 ① 자리 옮기기 · 가로지르기: 주인 토큰이 새 자리로 뛰어간다 (두 대형이 다시 모인다 — 미리보기 positionsAfter)
    const stepMove = () => {
      const mv = plan.play.move[0];
      if (!mv || !sfx.positionsAfter || mv.from === mv.to) { stepPass(); return; }
      v = {
        ...v,
        positions: sfx.positionsAfter,
        zones: { ...(v.zones || {}), [mv.id]: mv.to },
        players: (v.players || []).map((p) => (p.id === mv.id ? { ...p, zone: mv.to } : p)),
      };
      field.classList.add('scatter');
      tokEls.get(mv.id)?.classList.add('moving');
      renderTokens();
      later(() => {
        field.classList.remove('scatter');
        tokEls.get(mv.id)?.classList.remove('moving');
        stepPass();
      }, LESSON_T.move);
    };
    // 고유 모양 ② 이어 주기 · 연결 · 크로스: 주인 → 받는 선수 공 호
    const stepPass = () => {
      const ps = plan.play.pass[0];
      const a0 = ps ? spotOf(ps.from) : null;
      const b0 = ps ? spotOf(ps.to) : null;
      if (!a0 || !b0 || reduced) { stepA(); return; }
      const ball = h('div', { class: 'ls-ball', 'aria-hidden': 'true' }, h('i'));
      const [x1, y1] = toPx(a0);
      const [x2, y2] = toPx(b0);
      ball.style.transform = `translate(${px(x1)}, ${px(y1)})`;
      ball.style.setProperty('--t-pass', `${LESSON_T.pass}ms`);
      ball.style.setProperty('--arc', px(-Math.min(46, 18 + Math.hypot(x2 - x1, y2 - y1) * 0.12)));
      popLayer.append(ball);
      void ball.offsetWidth;
      ball.classList.add('go');
      ball.style.transform = `translate(${px(x2)}, ${px(y2)})`;
      setTimeout(() => ball.remove(), LESSON_T.pass + 120);
      later(stepA, LESSON_T.pass);
    };
    const stepA = () => {
      if (!targets.length) { stepB(); return; }
      screen.classList.add('drilling-on'); // 훈련하지 않는 선수는 옅게
      for (const id of targets) {
        tokEls.get(id)?.classList.add('drilling');
        if (cut) tokEls.get(id)?.classList.add('att-drill'); // 코치 지원 카드: 훈련 고리 = 코치 색
      }
      later(stepB, LESSON_T.act);
    };
    const stepB = () => {
      shown.score = scoreAfterPlay(plan, vNew.score);
      for (const p of vNew.players) shown.stamina[p.id] = afterPlayStamina(p);
      let any = false;
      // 한 선수 위 팝 쌓기 (가로지르기 두 팝 · 주인 체력 회복): 두 번째부터 위로 한 줄씩 (.row1 · .row2)
      const rowN = {};
      const rowOf = (id) => { const k = rowN[id] ?? 0; rowN[id] = k + 1; return k ? `row${Math.min(2, k)}` : ''; };
      for (const id of targets) {
        const g = plan.play.gain[id];
        const f = plan.play.fail[id];
        if (f) { popAt(id, f.injured ? `부상! −${f.n}` : `실패 −${f.n}`, 'bad'); any = true; }
        else if (g && cut && boost[id] > 1) { popAt(id, `+${g.n} ×${round1(boost[id])}`, 'good', 'att'); any = true; } // 코치 능력 배율 = 코치 색
        else if (g && (g.rows || []).length > 1) {
          // 가로지르기: 두 구역 스탯 두 팝 (구역 아이콘으로 구분, 위아래로)
          g.rows.forEach((r) => popAt(id, `${L.ZONE_ICONS[r.stat] ?? ''}${zoneShort(r.stat)} +${r.n}`, 'good', `shape ${rowOf(id)}`));
          any = true;
        } else if (g && sfx.mult[id] > 1) { popAt(id, `+${g.n} ${multShort(sfx.mult[id])}`, 'good', 'shape'); any = true; } // 모양 배율 (받는 선수 ×1.3 · 주인 ×1.5)
        else if (g) { popAt(id, g.sub && targets.length <= 2 ? `+${g.n}  (${L.STAT_SHORT[g.subStat] ?? '부'}+${g.sub})` : `+${g.n}`, 'good'); any = true; }
      }
      for (const [id, n] of Object.entries(plan.play.heal)) {
        if (!n) continue;
        popAt(id, `체력 ${n > 0 ? '+' : ''}${n}`, n > 0 ? 'heal' : 'bad', `small ${targets.includes(id) ? rowOf(id) || 'row1' : ''}`);
        any = true;
      }
      if (plan.play.tw) pop({ x: 50, y: 92 }, `팀워크 +${plan.play.tw}`, 'good', 'small tw');
      renderHud(shown.score);
      const flash = Object.keys(plan.play.buffs);
      if (flash.length) renderChips(flash);
      renderTokens();
      renderSide();
      if (cut) { abilityFx(cut, plan); any = true; }
      later(stepC, targets.length ? LESSON_T.hold : any || flash.length ? (cut ? LESSON_T.hold : 420) : 0);
    };
    const stepC = () => {
      screen.classList.remove('drilling-on');
      for (const id of targets) tokEls.get(id)?.classList.remove('drilling', 'att-drill');
      // 부상으로 경기장을 떠난 선수 · 퍼펙트 등은 새 뷰로 (턴 끝이 없으면 바로 마무리)
      if (plan.turn && plan.turn.turn != null) stepTurn();
      else stepEnd();
    };
    const stepTurn = () => {
      // 턴 끝 ① 기본 훈련 (분위기 몫 포함) — 경기장 선수 전원 동시에 · ② 벤치 회복 (§14.4 · §14.5)
      const ticks = Object.entries(plan.turn.base || {}).filter(([, n]) => n > 0);
      for (const [id, n] of ticks) popAt(id, `+${n}`, 'base', 'small');
      for (const [id, n] of Object.entries(plan.turn.bench || {})) if (n) sidePop(id, `체력 +${n}`, 'heal');
      for (const [id, n] of Object.entries(plan.turn.heal || {})) if (n) popAt(id, `체력 +${n}`, 'heal', 'small');
      shown.score = vNew.score;
      for (const p of vNew.players) shown.stamina[p.id] = Math.max(0, Math.min(100, (Number(p.stamina) || 0) - (plan.end?.heal[p.id] || 0)));
      renderHud(shown.score);
      const flash = Object.keys(plan.turn.buffs || {});
      if (flash.length) renderChips(flash);
      renderSide();
      renderTokens();
      if (!ended) centerPop(ticks.length ? `턴 ${vNew.turn} — 기본 훈련 +${ticks.reduce((a, [, n]) => a + n, 0)}` : `턴 ${vNew.turn}`, 'turn', 'mid');
      later(stepScatter, ticks.length ? LESSON_T.tick : LESSON_T.turn);
    };
    const stepScatter = () => {
      if (ended) { stepEnd(); return; }
      // 새 턴 흩어지기: 토큰이 새 자리로 뛰어간다 (벤치 선수는 자기 구역에서 나온다)
      v = vNew;
      shown = { score: vNew.score, stamina: {}, turn: vNew.turn };
      field.classList.add('scatter');
      renderHud();
      renderTokens();
      renderSide();
      later(() => { field.classList.remove('scatter'); stepEnd(); }, plan.scatter ? LESSON_T.scatter : 0);
    };
    const stepEnd = () => {
      if (ended) {
        v = vNew;
        const status = plan.end?.status || vNew.status;
        shown = { score: vNew.score, stamina: {}, turn: shown.turn };
        renderHud(shown.score);
        renderTokens();
        renderSide();
        centerPop(L.LESSON_STATUS_LABELS[status] ?? status, status === 'fail' ? 'bad' : status === 'perfect' ? 'gold' : 'good', 'big');
        infoEl.replaceChildren(h('b', { class: 'ls-guide' }, `레슨 ${L.LESSON_STATUS_LABELS[status] ?? status}`), h('span', { class: 'small muted' }, '결과를 정리하는 중…'));
        later(() => { setBusy(false); ctx.render(); }, LESSON_T.end);
        return;
      }
      setBusy(false);
      const recap = reduced && cutNote ? cutNote : null;
      refresh({ deal: !!plan.draw, attached: plan.attach?.uid ?? null });
      if (recap && alive()) { cutRecap = recap; renderInfo(); }
    };
    if (cut) showCutin(cut, stepMove);
    else stepMove();
  }

  /* ------------------------------------------------------------------ */
  /* ?autolesson=1 — 감독 추천 행동을 600ms 마다 (개발 · 스크린샷용)              */
  /* ------------------------------------------------------------------ */
  let autoTimer = null;
  function scheduleAuto() {
    if (!autoMode || !isLive() || ui.busy || autoTimer) return;
    autoTimer = later(() => {
      autoTimer = null;
      if (!isLive() || ui.busy || ui.drag) return;
      const r = manager ? safe(() => manager.recommendCard(st(), data)) : null;
      if (!r) return;
      if (r.kind === 'bench') { doBench(r.playerId, true); return; }
      if (r.kind === 'play') {
        // 추천 자리를 잠깐 보여 주고 (원 · 대상 말풍선) 그대로 낸다 — at · playerId 는 manager.autoStep 과 같다
        ui.aim = { uid: r.uid, idx: -1, at: r.zone ? null : r.at ? { ...r.at } : null, playerId: r.playerId ?? null, zone: r.zone ?? null };
        hoverAt = null;
        renderLive();
        later(() => {
          if (!isLive() || ui.busy || ui.aim?.uid !== r.uid) return;
          const args = { uid: r.uid };
          if (r.at) args.at = r.at;
          if (r.playerId) args.playerId = r.playerId;
          if (r.zone) args.zone = r.zone;
          playWith(args);
        }, LESSON_T.aimShow);
        return;
      }
      endTurn();
    }, LESSON_T.auto);
  }

  // 첫 그리기: 레이아웃이 잡힌 뒤 좌표를 잰다 (토큰은 처음 자리에 트랜지션 없이)
  measure();
  screen.classList.add('no-anim');
  renderZones();
  refresh();
  void screen.offsetWidth;
  if (!reduced) screen.classList.remove('no-anim');
  // 스테이지 배율 · 폰트 로드로 필드 크기가 바뀌면 다시 놓는다 (jsdom 은 0 → 기본값 그대로)
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (!alive()) return;
      const w0 = W;
      const h0 = H;
      measure();
      if (w0 !== W || h0 !== H) {
        screen.classList.add('no-anim');
        renderZones();
        renderTokens();
        renderAim();
        renderHand();
        void screen.offsetWidth;
        if (!reduced) screen.classList.remove('no-anim');
      }
    });
  }
}
