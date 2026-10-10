// js/ui/screens/hexMatch.js — 육각 오토배틀 경기 화면 (store.isHexMatch() 일 때 런 경기 phase match — docs/HEX_AUTOBATTLE_PLAN.md §5 · §6, H1 SPEC §5)
//   + 경기 모드 훅 ctx.matchMode (연습 경기 — app.js practiceMatchMode, H5 도전 경기도 이 자리). 없으면 런 경기 그대로.
//
// 화면 골격 (스테이지 1280×720 — .match-screen 의 --pad · --fx · --ft · --fb 를 그대로 쓴다):
//   .screen.match-screen.hex-screen[data-screen=match]
//   ├ .hx-pitch            예전 .pitch 자리 (잔디 바탕) — .hx-canvas (Pixi 캔버스) · .hx-field (필드 영역 = 예전 .m-field, HTML 이름표 층)
//   │                       · .hx-fallback (WebGL 이 없을 때 안내) · .hx-note ("다시 그리는 중…")
//   ├ .mh                  점수 머리 (예전 클래스 그대로: .mh-team.home > .nm · .mh-score · .mh-team.away > .nm · .mh-sub)
//   ├ .hx-clock            남은 경기 시간 (hexScene.clockText — 결정 16)
//   ├ .hx-ctl              [1x/2x/4x] (.speed-btn — store.matchUi.speed) · [⏭] (.skip-btn — 결과까지)
//   ├ .hx-banner           골 · 골든골 · 추가시간 · 승부차기 알림
//   ├ .hx-ult              필살기 버튼 7개 (H3 — 아래 띠 가운데 · 오른쪽: 사람 쪽 선수, 포메이션 칸 순서) button.hx-ult-btn.ut-<type>.tier-<tier>
//   ├ .hx-stale            엔진 판이 안 맞을 때 (배포 직후 캐시 섞임) 띠 자리의 안내 + [새로고침] — 평소엔 없음
//   └ .m-cutin             필살기 컷인 층 (예전 경기 화면과 같은 클래스 · 전역 .cut* CSS — .show 의 배경이 캔버스 위 어두운 판 한 장, 문서 §5.2)
//   이름표 .hx-name (공 가진 선수 머리 위 — 매 프레임 hexScene.headPoint × 카메라) 는 .hx-field 안.
//   감정 말풍선 .hx-emote.hx-emote-win|lose > .hx-emote-b (공을 뺏은 · 뺏긴 선수 머리 위 — 이름표와 같은 층, 풀 ≤ 6) 도 .hx-field 안.
//
// 경기 모드 훅 ctx.matchMode (없으면 런 경기 — 괄호 안이 런 경기 기본값):
//   { label?: HUD 아랫줄 · 결과 제목의 경기 종류 글자 (KIND_LABELS[kind]),
//     getSetup?(): 셋업 { home, away, possessions, seed, kind } (ctx.run.getMatchSetup(store.run, data)),
//     stateKey?: 엔진 상태를 두는 store 칸 이름 ('hexMatch' — 연습 경기 'practiceMatch'),
//     save?: null 이면 저장 없음 — KEYS.hexMatch 를 읽지도 쓰지도 않는다 (그 밖 = KEYS.hexMatch 재생 기록),
//     onFinish?(result): 결과 [확인] (actions.finishMatch),
//     exits?: [{ label, title?, danger?, onClick() }] — 오른쪽 위 .m-exits 버튼들 (옛 경기 화면과 같은 클래스 — 런 경기에는 없다),
//     again?: { label, onClick() } — 결과 모달 [확인] 옆 버튼 (연습: [다시 하기]) }
//
// 경기 진행 (H1 은 입력이 없다 — 보기만):
//   - 상태: store[stateKey] (store.hexMatch — 엔진 상태, 메모리) + KEYS.hexMatch 재생 기록 { version, seed, steps, skipped? } (step 마다 저장, save: null 이면 없음).
//     같은 seed 의 store.hexMatch → 그대로, 아니면 재생 기록 → createMatch + step × steps (skipped 면 simulateAuto), 아니면 새 경기.
//   - 루프: requestAnimationFrame 하나 (setTimeout 없음 — 스크린샷 도구가 100 ms 이상 타이머를 묶고, 배경 탭은 rAF 가 멈춰 그대로 일시정지).
//     dt (프레임마다 최대 100 ms) 를 모아 한 턴 = hexTickMs() / 배속 이 차면 step. 그 사이는 hexScene.frameAt(이전, 지금, 진행도) 로 보간.
//   - 골: 공이 골망으로 → "골!" 배너 · 카메라 전체 · 시계 멈춤 ~1.6 초 / 배속 (끝 0.5 초는 킥오프 자리) → 다음 턴.
//     단계가 바뀌면 배너 (골든골 · 추가시간 · 승부차기). 승부차기는 ~0.9 초 / 배속 마다 한 킥 (머리 줄에 PK 점수).
//   - 끝: 결과 모달 (예전 showResult 와 같은 DOM) → [확인] → actions.finishMatch(result) 한 번. 실패하면 app 이 다시 그리고 이 화면이 결과를 다시 연다.
//   - ⏭: simulateAuto (양쪽 AI 필살기) → 저장 { skipped: true } → 결과. 컷인은 바로 닫는다.
//
// 필살기 (H3 — 문서 §3 · 결정 1 · 8, §6.4):
//   - 버튼 상태 = HM.ultimateList(state, data, 사람 쪽) — 충전 n% / 준비 (게이지 가득) / 지금! (준비 + 지금 상황) / 예약 (켬 · 아직 안 터짐) /
//     합체기 (합체기 대기 — 금색) / 발동 중 (팀 필살기). 필살기가 없는 선수는 꺼진 칸.
//   - 누르면 다음 step 의 입력 줄 (queued) 에 { side, playerId, op: 켬이면 'disarm' 아니면 'arm' } — 턴 경계에서 HM.step(state, data, { ultimates })
//     (문서 §2.2-1). 버튼은 줄에 넣는 즉시 그 상태 (예약 · 취소) 를 보인다. 준비 전 (합체기 대기 아님) · 승부차기 · 끝 · ⏭ 뒤는 무시.
//   - 재생 기록 판 2: { version, seed, steps, inputs: [[stepIndex, side, playerId, op], …], skipped? } — 되살리기는 그 step 에 같은 입력
//     (hexReplay). skipped 면 steps 만큼 입력대로 돌린 뒤 simulateAuto.
//   - 컷인: step 의 cutin · combo 이벤트 → 그 턴 그림을 움직이기 전에 차지 + 카드 (예전 등급별 길이 ÷ 배속, 바닥 있음), 그동안 시계 · 턴 멈춤.
//     역컷인 (겨루기 이벤트의 reverseCutin) 은 그 턴 그림이 끝난 뒤. 차지 동안은 캔버스의 분홍 고리 (frame p.ult) 만 — 카드부터 어두운 판.
//   - 수명: 모듈 HEX_GEN · alive() = 이 화면이 마지막이고 문서 안에 있다. 죽으면 루프가 멈추고 Pixi view 를 지우고 리스너를 뗀다.
//   - WebGL 이 없으면 (jsdom · 오래된 기기) 캔버스 없이 HTML 안내 + 시계 · 점수만 돌고 경기는 그대로 끝까지 간다.
//   - WebGL 문맥을 잃으면: (저장은 step 마다 이미 했다) view 를 지우고 "다시 그리는 중…" → 잠시 뒤 다시 만든다 (엔진 상태는 그대로).
//
// [구현 결정] (H1):
//  - 시작 · 이어하기 직후 0.9 초 / 배속 동안 전체 화면 (카메라 'full') 을 보여 주고 첫 step 을 한다.
//  - 골 연출 = 공이 골망에 들어가는 한 턴 + 1.1 초 / 배속 골 장면 + 0.5 초 / 배속 킥오프 자리 (hexScene: 골 턴은 선수를 prev 자리에 둔다).
//  - 경기가 끝나면 0.8 초 / 배속 마지막 장면을 보여 주고 결과를 연다 (⏭ 은 바로).
//  - 카메라는 목표 쪽으로 지수 보간 (시간 상수 250 ms), z 차이가 0.001 아래면 목표에 붙인다.
//  - 결과 표 = 슛 · 겨루기 승 · 골 · 패스 (성공/시도) · 가로채기 · 태클 성공 · MVP (육각 엔진 stats).
//  - 그림이 멈춰 있으면 (보간 끝 · 카메라 멈춤 · 늦은 그림 없음) Pixi 를 다시 그리지 않는다 (배터리).
//  - 골 장면 뒤 킥오프 자리 그림은 골 턴에 kickoff 이벤트가 있을 때만 — 골든골 결승골은 공이 골망에 남은 채 결과로 간다.
//  - 골과 같은 턴에 단계가 바뀌면 (동점골 → 골든골 · 골 → 추가시간) "골!" 배너를 먼저, 단계 배너는 골 장면 (1.1 초 / 배속) 뒤에.
//  - 배속을 바꾸면 턴 안 흐른 시간 · 기다림 · 골 장면 · 끝 대기 · 배너 시간을 배속 비율로 늘이고 줄인다 (보간 진행도가 이어진다).
//  - WebGL 문맥을 잃으면 1 초 뒤 다시 만든다. 다시 만든 view 가 5 초 버티면 횟수를 0 으로 — 연달아 4번째 잃으면 이 경기는 대체 화면.
//  - 만드는 도중 문맥을 잃은 view (lostWhileCreating · view.isLost()) 는 받지 않고 지운 뒤 다시 만들기를 기다린다.
//  - 화면 꾸밈 클래스는 모두 hx- 앞머리 (전역 .stage · .goal 등과 겹치지 않게).
// [구현 결정] (연습 경기 — 경기 모드 훅):
//  - 저장 없는 모드 (save: null) 의 ⏭ 여부는 모듈 WeakSet 에 둔다 — 다시 그려도 결과를 바로 다시 연다 (재생 기록 skipped 대신).
//  - [다시 하기] 와 [확인] 은 합쳐 한 번만 누를 수 있다 (먼저 누른 쪽).
//  - 나가기 버튼은 옛 경기 화면과 같은 .m-exits (css/match.css) 를 그대로 쓴다.
// [구현 결정] (H2 — 스프라이트):
//  - 그릴 목록에 정지 스프라이트 크기 (art.spriteOf — 이름표 높이 = 스프라이트 키, view.spriteKind 가 그 캐릭터를 스프라이트로 그린다고 할 때만 —
//    아니면 스탠디 키) 와 골 장면 여부 (공이 골망에 닿은 뒤 · 킥오프 자리 전 —
//    득점자 세리머니) 를 넘긴다. 동작 · 얼굴 방향은 hexScene, 시트 재생은 hexPixi.
//  - 스프라이트 시계 = 이 화면의 루프 시간 (dt 합 — 배경 탭에서 멈춘다). draw 에 { clock, speed, turnMs } 를 넘긴다.
//  - view.animating 이면 보간 · 카메라가 멈춰 있어도 다시 그린다 (대기 동작이 계속 돈다).
//  - 차는 턴의 공이 발을 떠나는 진행도 = hexScene.BALL_RELEASE × max(ONE_SHOT_MIN, 턴 ms) / 턴 ms (4배속은 한 번 동작이 늘어난 만큼 늦게, 최대 0.75).
//    공 가진 선수 표시 (금색 고리 · 이름표) 를 넘기는 때도 그 뒤 비행의 CARRIER_SWITCH 로 미룬다.
//  - 디버그 HEX_DEBUG.sprites = view.playing() (스프라이트 선수의 지금 동작 · 칸 · 화면 상자 — tools/hex_shot.mjs --practice 동작 사냥).
// 감정 말풍선 (기획자 요청 2026-10-10 — 공을 뺏을 때 · 뺏길 때 머리 위):
//   - 누구 · 무엇 = hexScene.emotesOf(step 전 sceneSnap, step 뒤 상태) — step 마다 한 번. win = 금색 "!" (태클로 뺏으면 "!!"), lose = "💦".
//   - 그 턴 그림의 닿는 순간 (보간 진행도 ≥ 공이 발을 떠나는 진행도 — 화면 release 와 같은 식, 태클 턴도 같은 때) 에 띄우고
//     매 프레임 머리 점 (headPoint × 카메라) 을 따라간다. 길이 = max(EMOTE.min, EMOTE.ms ÷ 배속) — 띄울 때 정한다.
//   - 팝 (0 → 1.15 → 1, 길이의 20 % ≈ 180 ms) · 유지 · 끝 28 % 페이드는 CSS 애니메이션 (--hx-emo = 길이). 움직임 줄이기 = 애니메이션 없이 보였다 사라짐.
//   - 컷인 · 차지 · 역컷인 동안 (cutCur · hold) 은 숨기고 시간 · 애니메이션을 멈춘다 → 끝나면 남은 시간만큼 다시. ⏭ · 캔버스 없음 (대체 화면 ·
//     다시 그리는 중) · 승부차기 · 골 턴 ("골!" 배너가 뜨는 때부터 — 지난 턴에 띄운 말풍선도) 은 모두 지운다.
//   - 필드 영역 안으로 자른다 (위 EMOTE.top — 시계 · 점수 머리 밑, 아래 = 필드 바닥 — 필살기 띠 위). 공 가진 선수 이름표가 같은 선수 위에 있으면 그 위로 올린다:
//     띄운 턴에 그 턴 끝 공 가진 선수면 처음부터 올린다 (이름표는 넘기는 때 ≈ 0.81 뒤에 뜬다 — 그때 22px 뛰지 않게, 2026-10-10 리뷰), 그 뒤로는
//     이름표가 그 선수 위에 보이는 동안만. 올리기 · 낮은 자세 내림은 한 목표로 부드럽게 (EMOTE_LOW_TAU) — 이름표가 떠나면 머리 위로 미끄러져 내려온다.
//   - 닿는 순간 창 [at, 1) 에 프레임이 하나도 없었던 턴 (4배속 · 20 fps) 의 말풍선은 다음 step 직전에 띄운다 (빠지지 않게).
//   - 말풍선 크기는 처음 보일 때 · 이름표 높이는 처음 한 번만 잰다 (프레임마다 layout 읽지 않게).
//   - 한 선수 머리 위에는 하나 — 다음 턴 말풍선이 같은 선수에게 뜨면 지난 것을 바로 지운다.
//   - 움직이는 스프라이트가 낮은 자세 (frame act tackle · fall) 면 선 키 머리 점에서 EMOTE_LOW × 키만큼 내린다 (뜬 말풍선이 옆 선수 것처럼 읽혀서 — 2026-10-10 스크린샷), 자세가 바뀌면 부드럽게.

// 결정의 순간 (H3.5 — 문서 결정 26 · 27, SPEC §3):
//   - 엔진이 턴 끝에 정한 사람 쪽 장면 (state.moment — 슈팅 찬스 · 크로스 · 역습 · 수비 위기 · 필살기 · 합체기) 이 있고 [결정 ON] (store.matchUi.moments,
//     기본 켬) 이면: 그 턴 그림 (컷인 → 골 장면 → 역컷인 뒤) 이 끝난 턴 경계에서 멈춘다 — 시계 · 턴이 서고 (제한 시간 없음 — 고를 때까지 기다린다),
//     카메라가 장면 쪽으로 (공 가진 선수 · 받는 선수 · 붙은 수비 · 슈팅 찬스면 상대 GK 틀, MOMENT_ZMIN ~ MOMENT_Z), 필살기 띠 자리를 카드 띠 .hx-moment 가 대신한다.
//   - 카드 = HM.momentView (엔진 순수 미리보기) 그대로: 큰 % · 둘째 줄 "성공하면 …" · '자동' (AI 가 하려던 수) · ★ 금색 (필살기) · 받는 선수 ▾ (상위 3 돌리기) ·
//     수비 위기는 압박 / 패스길 막기 / 물러서기 + 상대 성향 칩. 카드를 누르면 그 카드의 input 을 다음 step 에 넣고 (재생 기록 choose · defend · arm 줄) 이어간다.
//   - 밝힌 카드 (처음 = '자동', 마우스 · 포커스 · ▾ 로 바뀜) 의 화살표 · 끝 고리를 캔버스에 (frame.aim — hexScene.momentAim, 글자 없음).
//   - [결정 OFF] = 멈추지 않는다 (H3 그대로 — 합체기 대기는 예전 T.comboHold 알림). [⏸ 개입] (store.matchUi.hexIntervene) = 다음 우리 공 가진 선수 ·
//     공 앞 수비 장면에서 한 번 멈춘다 (HM.peekMoment manual — 10초 간격 · 횟수 상관없음, 멈추면 꺼진다). ⏭ = 카드를 고르지 않고 (= '자동') simulateAuto.

// 엔진 판 확인 (2026-10-10 기획자 폰 "HM.ultimateList is not a function" — 배포 직후 새 화면 모듈 + 캐시의 옛 엔진 모듈, 루트 sw.js 머리 주석):
//   - 띄울 때 hexEngineCompat(HM) 로 이 화면이 쓰는 엔진 API (createMatch · step · ultimateList · ultimateStatus 함수, HEX_MATCH_VERSION ≥ HEX_ENGINE_EXPECT) 를 본다.
//   - 필살기 API 만 안 맞으면: 필살기 띠를 숨기고 (엔진을 부르지 않는다 — 턴마다 토스트 나던 것) 띠 자리에 작은 안내 .hx-stale
//     "새 버전으로 바뀌는 중이에요 — 잠시 뒤 새로고침해 주세요" + [새로고침] (location.reload). 경기는 그대로 돈다 (필살기 없이).
//   - createMatch · step 도 없으면: 경기 대신 같은 안내 + [새로고침] · [처음으로] 판.
//   - 이 화면의 safe() 는 같은 오류 글을 한 번만 토스트한다 (그 뒤는 console.error 만 — 매 턴 · 매 프레임 같은 토스트가 쌓이지 않게).

// [구현 결정] (H3 — 필살기 버튼 · 컷인 · 저장):
//  - 버튼 글 = 선수 이름 + 상태 한 줄 + 게이지 막대 (스킬 이름 · 유형 · 등급 · 설명 · 대사 · 이유는 title). 얼굴 = 초상 face, 없으면 색 원.
//  - 켠 버튼은 지금 상황이어도 "예약" (다음 턴 시작에 들어가 그 턴에 터진다) — "지금!" 은 아직 안 켠 준비 버튼에만.
//  - 차지 (예전 잔디 흑백 + 사용자 빛남) 는 캔버스의 분홍 고리 · 빛만 (DOM 판으로 캔버스 선수 하나만 밝힐 수 없어서) — 길이는 예전 그대로.
//  - 컷인 · 차지 · 역컷인은 rAF 루프 시간으로 센다 (setTimeout 없음 — 배경 탭에서 함께 멈춘다). 배속을 바꾸면 남은 길이를 비율대로.
//  - 컷인이 있는 턴은 골 · 단계 배너 (onEvents) 를 컷인이 끝난 뒤에 건다 (컷인 동안 "골!" 이 먼저 뜨지 않게).
//  - 역컷인의 필살기 이름 = 엔진 reverseCutin 의 skillId · combo (여러 턴 나는 필살 패스 · 크로스 공중볼도), 없으면 그 턴 막힌 쪽의 마지막 cutin.
//  - "경기의 첫 필살기 / 첫 역컷인" = 이벤트 목록에 그 턴 전 cutin / reverseCutin 이 없었다 (이어하기도 이벤트로 판단).
//  - 사람 쪽 준비 (게이지 가득 · 합체기 대기 · 켬 · 켜기 줄) 선수 = 캔버스의 가는 분홍 고리 (frame ultReady).
//  - 재생 기록에는 무시될 입력 (step 사이에 상황이 바뀌어 엔진이 받지 않은 것) 도 그대로 남긴다 — 엔진이 같은 자리에서 또 무시한다.
//  - 턴 전 컷인 동안 (hold) 은 그 턴 결과를 미리 보이지 않는다: 점수 · 시계 · 단계 글 (HUD) · ⏭ · 필살기 띠 · 카메라 · 스프라이트 시계를
//    step 전 그림에 멈춘다 (컷인이 끝나 onEvents 가 돌 때 풀린다 — H3 리뷰 H3S-1 · H3S-2 · F1).
//  - 사람 쪽 합체기 대기: 다음 step 전에 경기를 멈추고 (시계 · 턴, 배속과 상관없이 최대 T.comboHold) "합체기!" 알림 — 그 버튼을 누르거나
//    (켬 → 바로 다음 step) 시간이 지나거나 ⏭ 이면 이어간다. 같은 대기 (선수 · 대기 끝 턴) 에 한 번만 (H3 리뷰 H3S-3).
//    H3.5: [결정 ON] 이면 엔진의 합체기 장면 (★ 카드) 이 대신한다 — 장면으로 물은 대기는 이 알림을 다시 띄우지 않는다.
// [구현 결정] (H3.5 — 결정의 순간 화면):
//  - 카드 띠는 필살기 띠 자리 (컨트롤 오른쪽 아래, 높이 96 — 915×412 에서 ≈ 55 CSS px) 를 대신하고 장면 이름 · 고르는 선수 · 상대 성향은 그 위 작은 머리표.
//  - 밝힌 카드 = 처음 '자동' 카드 → 마우스 올림 · 포커스 · ▾ 돌림이 바꾼다 (손가락은 누르면 바로 고른다 — 화살표는 '자동' 또는 ▾ 로 고른 받는 선수).
//  - '자동' 카드를 골라도 입력 줄을 남긴다 (사람이 고른 것 — 엔진은 AI 와 같은 수를 둔다). '아끼기' (팀 필살기 장면) · 수비 위기의 '자동' 은 입력 없음
//    (고른 자세는 상대 공격 동안 이어지는데 '자동' 은 AI 규칙 그대로 — 엔진 stanceHold).
//  - ★ 가 아닌 카드 ('아끼기' 포함) 를 고르면 장면 전에 띠에서 눌러 둔 그 선수 (· ★ 선수) 의 켜기 · 끄기 줄을 지운다 — 장면이 그 선수 입력의 유일한 출처.
//  - 장면 동안 고르는 선수 · 밝힌 카드의 받는 선수 머리 위에 HTML 이름표 (.hx-mo-tag — 띠가 숨어 얼굴 ↔ 이름 짝이 없다, 거울 경기는 얼굴도 같다).
//  - 다른 카드의 ▾ 첫 누름은 그 카드를 밝히기만 (보이던 받는 선수 그대로), 그다음 누름부터 받는 선수를 돌린다.
//  - 경기가 끝나면 ⏸ 개입을 끈다 (연습 경기 [다시 하기] · 다음 경기로 새지 않게 — app 의 연습 경로도 끈다).
//  - 규칙 판 2 경기 (판 1 · 2 재생 기록 · rules 없는 옛 엔진 상태) 는 [결정 —] (꺼짐 · 못 누름), 저장에 rules: 2 (엔진 rulesOf 와 같이 "3 미만").
//  - ★ 카드의 켜기 (arm) 는 그 step 의 필살기 입력 줄에 더한다 (같은 선수의 줄은 ★ 쪽이 이긴다).
//  - 이름 줄 ("롱볼 → 도르비나") 이 카드 폭을 넘치면 받는 선수를 둘째 줄 앞으로 옮긴다 (★ 카드와 같은 꼴 — 말줄임 대신).
//  - 물러서기 카드의 % 는 "슛이면 실점" (낮을수록 좋다) 이라 붉은 글자 (hx-mc-risk) — 다른 카드 % (높을수록 좋다) 와 헷갈리지 않게.
//  - 장면 동안 배속 · ⏭ · [결정 OFF] 는 된다. 장면 중 [결정 OFF] = '자동' 으로 이어간다 (⏸ 개입 장면은 그대로).
//  - 장면이 열린 채 다시 그리면 (재생 기록으로 되살림) 같은 장면을 다시 연다 — 엔진 state.moment 는 재생이 그대로 만든다.
//  - 장면 카메라는 평소 결정 틀 (Z_FOLLOW 1.4 아래로는 안 감) 보다 더 물러날 수 있다 (MOMENT_ZMIN 1.15): 멈춘 그림이라 노린 칸 · 골이 다 보이는 게 먼저
//    (2026-10-10 스크린샷 — 슈팅 찬스에 골이 화면 밖, 스루 칸이 카드 띠 밑).
//  - 슈팅 찬스 · 슛 카드를 밝히면 상대 GK 를 꼭 넣는다 (노린 골이 보이게), 수비 위기는 우리 GK 를 보이면 넣는다.
//  - 팀 필살기 장면은 쓰는 선수도 꼭 넣는다 (예전: 보이면 — 머리표의 선수가 화면 밖이었다).

import { h, openModal, closeOverlays } from '../dom.js';
import { saveHexMatch, loadHexMatch, HEX_SAVE_VERSION, hexTickMs } from '../store.js';
import * as L from '../labels.js';
import * as V from '../view25.js';
import * as S from '../hexScene.js';
import { createHexView, hexResolution, ONE_SHOT_MIN } from '../hexPixi.js';
import { spriteOf, portraitUrl, portraitUrls, preloadArt, cutArt } from '../art.js';

const SPEEDS = [1, 2, 4];
/** 시간 (ms, 1배속 — 배속으로 나눈다) */
const T = Object.freeze({
  start: 900, // 시작 · 이어하기 전체 화면
  goalScene: 1100, // 공이 골망에 들어간 뒤 골 장면
  goalKickoff: 500, // 그 뒤 킥오프 자리
  penalty: 900, // 승부차기 한 킥
  stageBanner: 1400, // 단계 배너
  goalBanner: 1600, // 골 배너
  end: 800, // 끝난 뒤 결과까지
  camTau: 250, // 카메라 시간 상수 (배속과 상관없음)
  comboHold: 2500, // 사람 쪽 합체기 대기 — 누를 때까지 기다리는 최대 시간 (배속과 상관없음 — 4배속에서도 누를 틈)
  retry: 1000, // WebGL 다시 만들기 (배속과 상관없음)
  stable: 5000, // 다시 만든 view 가 이만큼 살아 있으면 문맥 잃음 횟수를 0 으로 (배속과 상관없음)
});
/** 연달아 (stable 안에) 문맥을 이만큼 넘게 잃으면 이 경기 동안은 대체 화면 */
const MAX_RETRIES = 3;
const DT_CAP = 100;
/** 공 가진 선수가 바뀐 턴: 공 보간이 이만큼 (0 ~ 1) 오면 새 선수에게 금색 고리 · 이름표 */
const CARRIER_SWITCH = 0.7;
const FALLBACK_MSG = '이 기기에서는 경기장을 그릴 수 없어요 — 결과는 그대로 진행돼요';
/** 필살기 컷인 길이 (ms, 1배속 — 예전 경기 화면 screens/match.js CUT_TIER 와 같은 값): 경기 첫 필살기 = charge + cut, 그 뒤 = 짧은 것 */
const CUT_TIER = Object.freeze({
  SSR: { charge: 400, chargeShort: 300, cut: 1000, cutShort: 900 },
  SR: { charge: 300, chargeShort: 250, cut: 800, cutShort: 700 },
  R: { charge: 200, chargeShort: 150, cut: 600, cutShort: 500 },
});
/** 합체기 두 컷인 · 이름 카드, 역컷인 (경기 첫 / 그 뒤) — 예전 T 와 같은 값 */
const CUT_T = Object.freeze({ comboCut: 1000, comboName: 1100, revCut: 800, revCutShort: 700 });
/** 배속을 나눈 뒤의 바닥 (ms — 4배속에서도 읽히게, 예전 CUT_MIN) */
const CUT_MIN = Object.freeze({ charge: 30, card: 120 });
/** 감정 말풍선: 길이 (ms, 1배속 — 배속으로 나누고 min 바닥) · 필드 영역 위 여백 (시계 밑) · 크기를 못 잴 때 (jsdom) 의 말풍선 크기 */
const EMOTE = Object.freeze({ ms: 900, min: 450, top: 16, w: 34, h: 38 });
const EMOTE_TEXT = Object.freeze({ win: '!', steal: '!!', lose: '💦' });
/** 낮은 자세 (움직이는 스프라이트의 태클 슬라이딩 · 넘어짐) 에서 말풍선을 내리는 몫 (선 키 figure.fh 기준 — 시트에서 잰 머리 높이 ≈ 65 · 75 %) · 따라가는 시간 상수 (ms) */
const EMOTE_LOW = Object.freeze({ tackle: 0.33, fall: 0.25 });
const EMOTE_LOW_TAU = 90;
/** 결정의 순간 (H3.5): 카메라 최대 배율 · 장면 이름 */
const MOMENT_Z = 1.9;
const MOMENT_ZMIN = 1.15; // 장면은 멈춘 그림이라 틀 (공 가진 선수 · 노린 칸 · 골) 이 다 들어가는 게 확대보다 먼저 — 평소 따라가기 (1.4) 보다 더 물러날 수 있다
const MOMENT_TITLE = Object.freeze({
  shot: '슈팅 찬스', cross: '크로스 · 스루 찬스', counter: '역습', danger: '수비 위기', ult: '필살기 찬스', combo: '합체기 찬스', attack: '개입',
});
/** 역컷인 글 (엔진 이벤트 reverseCutin.text 가 먼저 — 없을 때) */
const REVERSE_FALLBACK = Object.freeze({ save: '기적의 세이브!', block: '철벽 블록!', passCut: '필살 패스 차단!' });

let HEX_GEN = 0;
// 화면 디버그 (window.__soccer.hexView — app.js): { renderer: 'webgl'|'fallback'|'pending', fps, turn, steps, … }. 화면을 연 적이 없으면 null
let HEX_DEBUG = null;
// 엔진 상태 → 지금까지 step 횟수 (store.hexMatch 를 그대로 이어받을 때)
const STEPS = new WeakMap();
// ⏭ 한 엔진 상태 (저장 없는 모드 — 재생 기록 skipped 대신. 다시 그려도 카메라가 ⏭ 장면 그대로)
const SKIPPED = new WeakSet();
// 엔진 상태 → 필살기 입력 기록 [[stepIndex, side, playerId, op], …] (store.hexMatch 를 그대로 이어받을 때 · 저장 없는 모드)
const INPUTS = new WeakMap();

/** 육각 경기 화면 디버그 값 (app.js window.__soccer.hexView 가 읽는다) — 화면을 연 적이 없으면 null */
export function hexViewDebug() {
  return HEX_DEBUG;
}

// 시험 전용: 턴마다 말풍선 목록을 hexScene.emotesOf 대신 이 함수로 (풀 상한 · 다시 쓰기 시험 — 한 턴 6개를 여러 턴 이어서). null = 원래대로
let emotesOfTest = null;
/** 시험 전용 — fn(prevSnap, state) → [{ side, id, kind, cause, key }] 또는 null (원래 hexScene.emotesOf) */
export function setHexEmotesForTest(fn) {
  emotesOfTest = typeof fn === 'function' ? fn : null;
}

/** 이 화면이 기대하는 육각 엔진 상태 판 (js/engine/hexMatch.js HEX_MATCH_VERSION — 판 2 = H3 필살기, 판 3 = H3.5 결정의 순간 · 입력 choose · defend) */
export const HEX_ENGINE_EXPECT = 3;
/** 엔진 판이 안 맞을 때 안내 글 (필살기 띠 자리 · 대체 판) */
export const STALE_MSG = '새 버전으로 바뀌는 중이에요 — 잠시 뒤 새로고침해 주세요';

/**
 * 엔진 모듈이 이 화면과 맞는지 (머리 주석 "엔진 판 확인").
 * @param {object} HM 육각 엔진 모듈 (js/engine/hexMatch.js)
 * @returns {{ step: boolean, ult: boolean, missing: string[] }} step = 경기를 돌릴 수 있다 (createMatch · step) · ult = 필살기 띠를 쓸 수 있다 · missing = 빠진 것
 */
export function hexEngineCompat(HM) {
  const missing = [];
  const fn = (k) => {
    const ok = !!HM && typeof HM[k] === 'function';
    if (!ok) missing.push(k);
    return ok;
  };
  const step = fn('createMatch') & fn('step');
  const api = fn('ultimateList') & fn('ultimateStatus');
  const ver = Number(HM?.HEX_MATCH_VERSION);
  const verOk = Number.isFinite(ver) && ver >= HEX_ENGINE_EXPECT;
  if (!verOk) missing.push(`HEX_MATCH_VERSION ${HM?.HEX_MATCH_VERSION} < ${HEX_ENGINE_EXPECT}`);
  return { step: !!step, ult: !!(step && api && verOk), missing };
}

/**
 * 장면 모듈 (js/ui/hexScene.js) 판 확인 — 배포 직후 옛 hexScene.js 가 캐시에서 섞이면 새 화면이 부르는 함수가 없다
 * (2026-10-10: 말풍선 emotesOf). 없으면 말풍선을 끄고 엔진이 안 맞을 때와 같은 새로고침 안내를 띄운다.
 * @returns {boolean}
 */
export function hexSceneCompat(S) {
  return !!S && typeof S.emotesOf === 'function';
}

/** 같은 오류 글은 한 번만 넘기는 safe (그 뒤는 console.error 만) — base = ctx.safe (토스트) */
function onceSafe(base) {
  const seen = new Set();
  return (fn) => {
    try {
      return fn();
    } catch (e) {
      const key = String(e?.message ?? e);
      if (seen.has(key)) { console.error(e); return undefined; }
      seen.add(key);
      return base(() => { throw e; });
    }
  };
}

const isHexState = (s, HM) => !!(s && typeof s === 'object' && s.engine === 'hex' && s.version === HM.HEX_MATCH_VERSION);

/**
 * 재생 기록 한 step 의 입력 줄들 [[i, side, playerId, op, payload?], …] → HM.step 입력 { ultimates?, choice?, defend? } (판 3):
 * arm · disarm = 필살기 (넣은 순서대로), choose = 결정의 순간 선택지 (payload = key), defend = 수비 자세 (payload = mode). 한 step 에
 * choose · defend 가 여럿이면 마지막 것.
 * @returns {{ ultimates?: object[], choice?: object, defend?: object } | null}
 */
export function hexStepInput(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const out = {};
  for (const x of rows) {
    if (!Array.isArray(x)) continue;
    const [, side, playerId, op, payload] = x;
    const pid = String(playerId);
    if (op === 'arm' || op === 'disarm') (out.ultimates || (out.ultimates = [])).push({ side, playerId: pid, op });
    else if (op === 'choose') out.choice = { side, playerId: pid, key: payload };
    else if (op === 'defend') out.defend = { side, playerId: pid, mode: payload };
  }
  return Object.keys(out).length ? out : null;
}

/**
 * 재생 기록 (판 3 — 문서 §6.4) 을 새 경기 상태에 다시 돌린다: i 번째 step 에 inputs 의 [i, side, playerId, op, payload?] 들을 넣은 순서대로
 * (hexStepInput), steps 만큼 (끝나면 멈춤), skipped 면 그 뒤 simulateAuto (양쪽 AI). 화면 · 시험 · 도구가 같은 함수를 쓴다.
 * 판 1 · 2 재생 기록 (loadHexMatch 가 rules: 2 를 붙인다) 은 st 를 createMatch({ …, rules: 2 }) 로 만들어 넘긴다.
 * @param {object} HM 육각 엔진 (js/engine/hexMatch.js)
 * @param {object} st createMatch 결과 (turn 0)
 * @param {object} data
 * @param {{ steps: number, inputs?: Array<Array<number|string>>, skipped?: boolean }} save
 * @returns {object} st
 */
export function hexReplay(HM, st, data, save) {
  const at = new Map();
  for (const x of Array.isArray(save?.inputs) ? save.inputs : []) {
    if (!Array.isArray(x)) continue;
    if (!at.has(x[0])) at.set(x[0], []);
    at.get(x[0]).push(x);
  }
  const n = Number.isInteger(save?.steps) ? save.steps : 0;
  for (let i = 0; i < n && !st.finished; i++) HM.step(st, data, hexStepInput(at.get(i)));
  if (save?.skipped && !st.finished) HM.simulateAuto(st, data);
  return st;
}

/**
 * 육각 경기 화면을 root 에 그린다 (런 경기 — app.js render 의 phase match · 연습 경기 — screen 'practice').
 * @param {HTMLElement} root  #app
 * @param {object} ctx  app.js makeCtx() — ctx.hexMatch = 육각 경기 엔진 (js/engine/hexMatch.js), ctx.matchMode = 경기 모드 훅 (머리 주석, 없으면 런 경기)
 */
export function renderHexMatch(root, ctx) {
  const { store, data, actions } = ctx;
  const HM = ctx.hexMatch;
  // 같은 오류는 한 번만 토스트 (머리 주석 "엔진 판 확인") — 매 턴 · 매 프레임 부르는 곳이 같은 토스트를 쌓지 않게
  const safe = onceSafe(typeof ctx.safe === 'function' ? ctx.safe : (fn) => { try { return fn(); } catch (e) { console.error(e); return undefined; } });
  const ui = store.matchUi;
  // 경기 모드 훅 (머리 주석) — 없으면 런 경기: getMatchSetup · store.hexMatch · KEYS.hexMatch · actions.finishMatch · KIND_LABELS
  const mode = ctx.matchMode && typeof ctx.matchMode === 'object' ? ctx.matchMode : null;
  const stateKey = typeof mode?.stateKey === 'string' && mode.stateKey ? mode.stateKey : 'hexMatch';
  const saveOn = !(mode && mode.save === null);
  const loadSave = () => (saveOn ? loadHexMatch() : null);
  const writeSave = (sv) => { if (saveOn) saveHexMatch(sv); };
  const onFinish = typeof mode?.onFinish === 'function' ? mode.onFinish : (r) => actions.finishMatch(r);
  const exits = (Array.isArray(mode?.exits) ? mode.exits : []).filter((x) => x && typeof x.onClick === 'function');
  const again = mode?.again && typeof mode.again.onClick === 'function' ? mode.again : null;

  /* ---- 경기 상태 (만들기 · 이어받기 · 되살리기) ---- */
  const setup = safe(() => (typeof mode?.getSetup === 'function' ? mode.getSetup() : ctx.run.getMatchSetup(store.run, data)));
  if (!setup || !HM) { root.append(errorScreen('경기 정보를 불러올 수 없습니다.', ctx)); return; }
  // 엔진 판 확인: 경기를 못 돌리면 새로고침 안내 판, 필살기만 안 맞으면 띠 대신 안내 (경기는 그대로)
  const compat = hexEngineCompat(HM);
  if (!compat.step) {
    console.warn('육각 엔진 판이 화면과 맞지 않습니다', compat.missing);
    root.append(staleScreen(ctx));
    return;
  }
  const ultApi = compat.ult;
  if (!ultApi) console.warn('육각 엔진 판이 화면과 맞지 않습니다 — 필살기 띠를 숨깁니다', compat.missing);
  const sceneOk = hexSceneCompat(S);
  if (!sceneOk) console.warn('육각 장면 모듈 판이 화면과 맞지 않습니다 — 말풍선을 끕니다');
  const stale = !ultApi || !sceneOk; // 판이 섞임 → 띠 자리에 새로고침 안내
  /** HM.ultimateList (엔진이 안 맞으면 부르지 않는다 — null) */
  const ultListOf = (side) => (ultApi ? safe(() => HM.ultimateList(state, data, side)) : null);
  // 결정의 순간 API (판 3 — 엔진이 안 맞으면 장면 없이 H3 처럼 흐른다)
  const momOk = ultApi && typeof HM.momentView === 'function' && typeof HM.peekMoment === 'function';
  // rules 2 = 판 1 · 2 재생 기록 (H3 규칙 — 2골 선승 · 수비 자세 없음) 을 같은 경기로 되살릴 때 (store.loadHexMatch 가 붙인다)
  const create = (rules) => HM.createMatch({
    data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
    ...(rules === 2 ? { rules: 2 } : {}),
  });
  let state = null;
  let steps = 0;
  let skipped = false;
  let inputs = []; // 필살기 입력 기록 [[stepIndex, side, playerId, op], …] (재생 기록 판 2)
  const live = store[stateKey];
  if (isHexState(live, HM) && live.seed === setup.seed) {
    state = live;
    const sv = loadSave();
    const same = !!(sv && sv.seed === setup.seed);
    steps = STEPS.get(live) ?? (same ? sv.steps : 0);
    inputs = (INPUTS.get(live) ?? (same ? sv.inputs : [])).slice();
    skipped = saveOn ? !!(same && sv.skipped) : SKIPPED.has(live);
  } else {
    const sv = loadSave();
    if (sv && sv.seed === setup.seed) {
      state = safe(() => hexReplay(HM, create(sv.rules), data, sv)) || null;
      if (state) { steps = sv.steps; skipped = !!sv.skipped; inputs = sv.inputs.slice(); }
    }
    if (!state) {
      state = safe(create) || null;
      if (!state) { root.append(errorScreen('경기를 생성할 수 없습니다.', ctx)); return; }
      steps = 0;
      skipped = false;
      inputs = [];
      writeSave({ version: HEX_SAVE_VERSION, seed: setup.seed, steps: 0, inputs: [] });
    }
  }
  store[stateKey] = state;
  STEPS.set(state, steps);
  INPUTS.set(state, inputs);
  const persist = () => {
    STEPS.set(state, steps);
    INPUTS.set(state, inputs);
    if (skipped) SKIPPED.add(state);
    const sv = skipped
      ? { version: HEX_SAVE_VERSION, seed: state.seed, steps, inputs: inputs.slice(), skipped: true }
      : { version: HEX_SAVE_VERSION, seed: state.seed, steps, inputs: inputs.slice() };
    // 판 1 · 2 재생 기록에서 이어 온 경기 · rules 가 없는 상태 (캐시의 옛 H3 엔진이 만든 경기) — 엔진 rulesOf 와 같이 "3 미만 = 2" 로 남겨
    // 다음에도 같은 규칙으로 되살린다 (2026-10-10 리뷰: rules 없는 상태를 판 3 으로 되살려 다른 경기가 됐다)
    if (!(Number(state.rules) >= 3)) sv.rules = 2;
    writeSave(sv);
  };

  const gen = ++HEX_GEN;
  const speedOf = () => (SPEEDS.includes(Number(ui.speed)) ? Number(ui.speed) : 1);
  const clockCfg = { turnsRegular: Number(HM.TURNS_REGULAR) || 300, goldenTurns: Number(HM.GOLDEN_TURNS) || 75 };
  const kindLabel = mode?.label ?? L.KIND_LABELS[state.kind] ?? state.kind ?? '';
  const playerOf = (side, id) => state[side]?.players?.find((p) => String(p.id) === String(id)) || null;
  const nameOf = (side, id) => playerOf(side, id)?.name ?? '';
  const humanSide = state.humanSide === 'away' ? 'away' : 'home';

  /* ---- DOM ---- */
  const screen = h('div', { class: ['screen', 'match-screen', 'hex-screen'], dataset: { screen: 'match' } });
  const canvasHost = h('div', { class: 'hx-canvas', 'aria-hidden': 'true' });
  const nameEl = h('div', { class: 'hx-name', hidden: true });
  // 결정의 순간 이름표 (고르는 선수 · 밝힌 카드의 받는 선수 — 카드가 이름으로 부르는 선수를 경기장에서 찾게, HTML 글자)
  const momTagEls = [0, 1].map(() => h('div', { class: 'hx-name hx-mo-tag', hidden: true }));
  const field = h('div', { class: 'hx-field' }, nameEl, ...momTagEls);
  const fallbackEl = h('div', { class: 'hx-fallback', hidden: true }, FALLBACK_MSG);
  const noteEl = h('div', { class: 'hx-note', hidden: true }, '다시 그리는 중…');
  const pitch = h('div', { class: 'hx-pitch' }, canvasHost, field, fallbackEl, noteEl);
  const homeNm = h('span', { class: 'nm ellipsis' }, state.home?.name ?? '우리 클럽');
  const awayNm = h('span', { class: 'nm ellipsis' }, state.away?.name ?? '상대');
  const scoreEl = h('div', { class: 'mh-score' }, S.scoreText(state));
  const subEl = h('div', { class: 'mh-sub' }, '');
  const hud = h('div', { class: 'mh' }, h('div', { class: ['mh-team', 'home'] }, homeNm), scoreEl, h('div', { class: ['mh-team', 'away'] }, awayNm), subEl);
  const clockEl = h('div', { class: 'hx-clock', 'aria-live': 'off' }, S.clockText(state, clockCfg));
  const speedBtn = h('button', { class: 'btn speed-btn', type: 'button', onclick: () => cycleSpeed() });
  const skipBtn = h('button', { class: 'btn skip-btn', type: 'button', title: '결과까지 스킵', 'aria-label': '결과까지 스킵', onclick: () => skip() }, '⏭');
  // 결정의 순간 (H3.5): [결정 ON/OFF] · [⏸ 개입] — 컨트롤 둘째 줄
  const momBtn = h('button', { class: 'btn hx-mom-btn', type: 'button', onclick: () => toggleMoments(), hidden: !momOk });
  const intBtn = h('button', { class: 'btn hx-int-btn', type: 'button', onclick: () => toggleIntervene(), hidden: !momOk }, '⏸ 개입');
  const ctl = h('div', { class: 'hx-ctl' }, speedBtn, skipBtn, momBtn, intBtn);
  const bannerEl = h('div', { class: 'hx-banner', 'aria-live': 'polite' }, h('b', { class: 'hx-banner-txt' }), h('span', { class: 'hx-banner-sub' }));
  const ultBar = h('div', { class: 'hx-ult', role: 'group', 'aria-label': '필살기', hidden: stale });
  const cutLayer = h('div', { class: 'm-cutin', 'aria-live': 'polite' });
  // 결정의 순간 카드 띠 (필살기 띠 자리 — 장면 동안만): 머리표 (장면 이름 · 고르는 선수 · 상대 성향) + 카드 2 ~ 4장
  const momHead = h('div', { class: 'hx-mo-head' });
  const momCards = h('div', { class: 'hx-mo-cards' });
  const momEl = h('div', { class: 'hx-moment', role: 'group', 'aria-label': '결정의 순간', hidden: true }, momHead, momCards);
  screen.append(pitch, hud, clockEl, ctl, bannerEl, ultBar, momEl);
  // 엔진 판이 안 맞으면 띠 자리에 작은 안내 + [새로고침] (막지 않는다 — 경기는 필살기 없이 그대로)
  if (stale) {
    screen.append(h('div', { class: 'hx-stale', role: 'status' },
      h('span', { class: 'hx-stale-txt' }, STALE_MSG),
      h('button', { class: 'btn btn-sm hx-stale-btn', type: 'button', onclick: () => reloadPage() }, '새로고침')));
  }
  // 경기 모드 나가기 버튼들 (연습: [나가기]) — 옛 경기 화면과 같은 .m-exits (오른쪽 위). 런 경기에는 없다
  if (exits.length) {
    screen.append(h('div', { class: 'm-exits' }, exits.map((x) => h('button', {
      class: ['btn', 'btn-sm', 'm-exit', x.danger ? 'danger' : ''], type: 'button', title: x.title || '', onclick: () => x.onClick(),
    }, x.label || '나가기'))));
  }
  screen.append(cutLayer); // 컷인 층은 맨 위 (z 30 — 필살기 띠 · 나가기 버튼까지 덮는 어두운 판 한 장, 누르기는 지나간다)
  root.appendChild(screen);
  const alive = () => gen === HEX_GEN && screen.isConnected;

  // 필드 영역 크기 (논리 px — 스테이지 배율 전 값, 경기 중 그대로). 레이아웃이 없으면 (jsdom) 1280×720 스테이지 기본값
  const W = field.clientWidth > 40 ? field.clientWidth : 1244;
  const H = field.clientHeight > 40 ? field.clientHeight : 528;
  const PW = pitch.clientWidth > 40 ? pitch.clientWidth : 1268;
  const PH = pitch.clientHeight > 40 ? pitch.clientHeight : 708;
  const origin = { x: field.offsetLeft || (pitch.clientWidth > 40 ? 0 : 12), y: field.offsetTop || (pitch.clientHeight > 40 ? 0 : 78) };
  const world = V.worldRect(W, H);
  // 정지 스프라이트 크기 (charId 마다 한 번 — hexScene figure 키 · 이름표 높이). view 가 그 캐릭터를 지금 스프라이트로 그릴 때만
  // (그림이 아직 안 왔거나 실패해 스탠디로 그리는 동안은 null — 이름표가 스탠디 머리 위에 붙게)
  const sprCache = new Map();
  const spriteSize = (charId) => {
    if (!view || typeof view.spriteKind !== 'function' || !view.spriteKind(charId)) return null;
    if (!sprCache.has(charId)) sprCache.set(charId, spriteOf(data, charId));
    return sprCache.get(charId);
  };

  /* ---- HUD ---- */
  let hudKey = '';
  function drawHud() {
    if (hold) return; // 턴 전 컷인 동안은 step 전 HUD 그대로 (결과를 미리 보이지 않는다)
    const clock = S.clockText(state, clockCfg);
    const score = S.scoreText(state);
    const sub = [kindLabel, S.stageLabel(state)].filter(Boolean).join(' · ');
    const key = `${clock}|${score}|${sub}|${state.finished}`;
    if (key === hudKey) return;
    hudKey = key;
    clockEl.textContent = clock;
    clockEl.classList.toggle('hx-golden', state.stage === 'goldenGoal' && !state.finished);
    clockEl.classList.toggle('hx-low', state.stage === 'regular' && !state.finished && clockCfg.turnsRegular - state.turn <= 25);
    scoreEl.textContent = score;
    subEl.textContent = sub;
    hud.classList.toggle('last-attack', state.stage === 'addedTime' && !state.finished);
    skipBtn.disabled = !!state.finished;
  }
  function drawSpeed() {
    const sp = speedOf();
    const next = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length];
    speedBtn.textContent = `${sp}x`;
    speedBtn.dataset.speed = String(sp);
    speedBtn.classList.toggle('active', sp > 1);
    speedBtn.title = `배속 ${sp}x — 누르면 ${next}x`;
    speedBtn.setAttribute('aria-label', `배속 ${sp}x, 누르면 ${next}x`);
  }
  function cycleSpeed() {
    const sp = speedOf();
    const ns = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length];
    ui.speed = ns;
    // 턴 안에서 흐른 시간 · 남은 기다림을 새 배속에 맞춰 늘이고 줄인다 — 보간 진행도 (acc / 한 턴) 가 그대로 이어지게 (뒤로 튀거나 건너뛰지 않게)
    const k = sp / ns;
    acc *= k;
    wait *= k;
    if (goal) { goal.scene *= k; goal.until *= k; }
    if (endLeft > 0) endLeft *= k;
    if (bannerLeft > 0) bannerLeft *= k;
    if (pendingBanner) pendingBanner.ms *= k;
    // 컷인: 지금 카드의 남은 시간 · 뒤 카드 · 턴 뒤 역컷인 길이도 같은 비율로 (카드 CSS 애니메이션 길이는 이미 건 것 그대로)
    if (cutCur) cutCur.left *= k;
    for (const c of cutQ) c.dur *= k;
    for (const c of postCuts) c.dur *= k;
    drawSpeed();
  }

  /* ---- 배너 ---- */
  // 꾸밈 클래스는 모두 hx- 앞머리 (.stage · .goal 같은 전역 클래스와 겹치면 전역 규칙이 배너를 덮는다 — base.css .stage = 1280×720 상자)
  let bannerLeft = 0;
  let pendingBanner = null; // 골과 같은 턴에 단계가 바뀌면 (동점골 → 골든골 등) 골 장면 뒤로 미룬 단계 배너 { text, sub, cls, ms }
  function banner(text, sub, cls, ms) {
    bannerEl.className = ['hx-banner', 'hx-show', cls].filter(Boolean).join(' ');
    bannerEl.querySelector('.hx-banner-txt').textContent = text;
    bannerEl.querySelector('.hx-banner-sub').textContent = sub || '';
    bannerLeft = ms;
  }
  function flushBanner() {
    const b = pendingBanner;
    pendingBanner = null;
    if (b) banner(b.text, b.sub, b.cls, b.ms);
  }
  function tickBanner(dt) {
    if (bannerLeft <= 0) return;
    bannerLeft -= dt;
    if (bannerLeft <= 0) bannerEl.classList.remove('hx-show');
  }

  /* ---- 필살기 버튼 (H3 — 문서 §3 · 결정 8) ---- */
  // 다음 step 에 넣을 입력 줄: playerId → 'arm' | 'disarm' (넣은 순서 그대로 — Map). 같은 선수를 다시 누르면 줄에서 뺀다 (예약 취소 · 끄기 취소)
  const queued = new Map();
  let hold = null; // 턴 전 컷인이 그 턴을 붙잡는 동안 { playing, sent: 이번 step 입력 } — HUD · 띠 · 카메라 · 스프라이트 시계가 step 전 그림에 멈춘다
  let ultList = []; // HM.ultimateList (마지막으로 읽은 것 — 사람 쪽 7명)
  let ultKey = '';
  let readySet = new Set(); // 캔버스 가는 분홍 고리 (frame ultReady): 'side:id'
  const ultBtns = new Map(); // playerId → { btn, face, nm, st, g }
  const ultPlaying = () => !state.finished && state.stage !== 'penalties' && !skipped && !broken;
  // 띠가 살아 있나 (턴 전 컷인 동안은 step 전 값 — hold.playing)
  const barPlaying = () => (hold ? hold.playing && !skipped && !broken : ultPlaying());
  /** 줄까지 친 켬 상태 (화면에 보일 것) */
  const armedNow = (u) => (queued.has(u.playerId) ? queued.get(u.playerId) === 'arm'
    : hold && hold.sent.has(u.playerId) ? hold.sent.get(u.playerId) === 'arm' : !!u.armed); // 컷인 동안은 방금 보낸 입력도
  function buildUltBar() {
    ultList = ultListOf(humanSide) || [];
    ultBar.replaceChildren();
    ultBtns.clear();
    for (const u of ultList) {
      const p = playerOf(humanSide, u.playerId) || {};
      const face = h('span', { class: 'hx-ult-face', style: { background: p.portraitColor || '#4b5563' } });
      const url = portraitUrl(data, p.charId, 'face');
      if (url) {
        const img = h('img', { class: 'hx-ult-img', alt: '', draggable: 'false', decoding: 'async' });
        img.addEventListener('error', () => img.remove());
        img.src = url;
        face.append(img);
      }
      const nm = h('span', { class: 'hx-ult-nm' }, p.name ?? u.playerId);
      const st = h('span', { class: 'hx-ult-st' }, '');
      const g = h('span', { class: 'hx-ult-g' }, h('i'));
      const btn = h('button', {
        class: ['hx-ult-btn', u.has ? `ut-${u.type}` : 'hx-none', u.has && u.tier ? `tier-${u.tier}` : ''],
        type: 'button', dataset: { player: String(u.playerId), type: u.type ?? '', tier: u.tier ?? '' },
        onclick: () => tapUlt(u.playerId),
      }, face, h('span', { class: 'hx-ult-txt' }, nm, st), g);
      ultBar.append(btn);
      ultBtns.set(u.playerId, { btn, nm, st, g });
    }
    ultKey = '';
  }
  /** 버튼 상태 다시 그리기 (턴 · 단계 · 줄이 바뀔 때만 엔진 상태를 다시 읽는다) */
  function drawUlt(force = false) {
    const key = `${state.turn}|${state.stage}|${state.finished}|${skipped}|${broken}|${hold ? 'h' : ''}|${[...queued].join(',')}`;
    if (!force && key === ultKey) return;
    ultKey = key;
    // 턴 전 컷인 동안은 step 전 목록 그대로 (게이지 0 · 경기 끝 같은 그 턴 결과를 미리 보이지 않는다) — 입력 줄 표시만 바뀐다
    if (!hold) ultList = ultListOf(humanSide) || ultList;
    const playing = barPlaying();
    if (!playing) queued.clear();
    const ready = new Set();
    for (const u of ultList) {
      const el = ultBtns.get(u.playerId);
      if (!el) continue;
      const { btn, st, g } = el;
      if (!u.has) {
        btn.disabled = true;
        st.textContent = '';
        btn.title = `${nameOf(humanSide, u.playerId)} — 필살기 없음`;
        btn.setAttribute('aria-label', btn.title);
        continue;
      }
      const armed = armedNow(u);
      const pending = queued.has(u.playerId);
      const pct = Math.max(0, Math.min(100, Math.floor(((Number(u.gauge) || 0) / (Number(u.max) || 100)) * 100)));
      const teamOn = u.reason === '팀 필살기 발동 중';
      const canTap = playing && !teamOn && (armed || u.ready || u.comboReady);
      let label;
      let cls = '';
      if (!playing) label = `충전 ${pct}%`;
      else if (teamOn) { label = '발동 중'; cls = 'hx-on'; }
      else if (armed) { label = '예약'; cls = 'hx-armed'; }
      else if (u.comboReady) { label = '합체기'; cls = 'hx-ready'; }
      else if (u.ready && u.canNow) { label = '지금!'; cls = 'hx-ready hx-now'; }
      else if (u.ready) { label = '준비'; cls = 'hx-ready'; }
      else label = `충전 ${pct}%`;
      btn.className = ['hx-ult-btn', `ut-${u.type}`, u.tier ? `tier-${u.tier}` : '', cls, u.comboReady ? 'hx-combo' : '', pending ? 'hx-pending' : '',
        canTap ? '' : 'hx-wait'].filter(Boolean).join(' ');
      btn.disabled = !playing;
      btn.setAttribute('aria-pressed', armed ? 'true' : 'false');
      st.textContent = label;
      g.style.setProperty('--g', String(pct / 100));
      const typeLabel = L.ULT_TYPE_LABELS[u.type] ?? '필살기';
      const why = pending ? (armed ? '다음 턴에 켬' : '다음 턴에 끔') : u.reason;
      btn.title = [`${typeLabel} · ${u.name}${u.tier ? ` (${u.tier})` : ''}${u.comboReady && u.comboName ? ` — 합체기 ${u.comboName}` : ''}`,
        u.description || '', u.line ? `“${u.line}”` : '', `필살 게이지 ${pct}%`, why || ''].filter(Boolean).join('\n');
      btn.setAttribute('aria-label', `${nameOf(humanSide, u.playerId)} ${u.name} ${label}`);
      if (playing && (armed || u.ready || u.comboReady)) ready.add(`${humanSide}:${u.playerId}`);
    }
    readySet = ready;
  }
  /** 버튼 누름 → 다음 step 입력 줄 (켬이면 끄기, 아니면 켜기 — 준비 전 · 팀 필살기 발동 중 · 승부차기 · 끝 · ⏭ 뒤는 무시) */
  function tapUlt(playerId) {
    if (!alive() || !barPlaying()) return;
    const u = ultList.find((x) => x.playerId === playerId);
    if (!u || !u.has || u.reason === '팀 필살기 발동 중') return;
    if (armedNow(u)) {
      if (u.armed) queued.set(playerId, 'disarm');
      else queued.delete(playerId);
    } else {
      if (u.armed) { queued.delete(playerId); } // 끄기 줄을 취소 (엔진에서는 아직 켬)
      else if (u.ready || u.comboReady) queued.set(playerId, 'arm');
      else return;
    }
    drawUlt(true);
    if (comboWait && !comboPending()) endComboWait(); // 합체기 대기 멈춤 — 눌렀으면 바로 다음 step
  }
  /** 사람 쪽 합체기 대기 중이고 아직 안 켠 (줄에도 없는) 선수 → { key, name, combo } (없으면 null) */
  function comboPending() {
    if (hold || !ultPlaying()) return null;
    for (const u of ultList) {
      if (!u.has || !u.comboReady || armedNow(u)) continue;
      const until = state.live?.[humanSide]?.[u.playerId]?.combo?.until;
      return { key: `${u.playerId}:${until}`, name: nameOf(humanSide, u.playerId), combo: u.comboName || '합체기' };
    }
    return null;
  }
  /** 합체기 대기 멈춤 시작 (같은 대기에 한 번만) — 이번 step 을 미루면 true */
  function startComboWait() {
    const c = comboPending();
    if (!c || comboAsked.has(c.key)) return false;
    comboAsked.add(c.key);
    comboWait = { left: T.comboHold };
    banner('합체기!', `${c.name} — 버튼을 누르면 ${c.combo}`, 'hx-stage hx-combo-call', T.comboHold);
    return true;
  }
  function endComboWait() {
    if (!comboWait) return;
    comboWait = null;
    if (bannerEl.classList.contains('hx-combo-call')) { bannerLeft = 0; bannerEl.classList.remove('hx-show'); }
  }
  /** 이번 step 에 넣을 입력 (줄을 비운다) */
  function takeInput() {
    if (!queued.size || !ultPlaying()) { queued.clear(); return []; }
    const list = [...queued].map(([playerId, op]) => ({ side: humanSide, playerId, op }));
    queued.clear();
    return list;
  }

  /* ---- 결정의 순간 (H3.5 — 머리 주석) ---- */
  let mom = null; // 열린 장면 { mo, view, sel: 밝힌 카드 번호, rcv: 카드마다 ▾ 번호, manual, turn, els: 카드 DOM, camKey, cam, aimKey, aim }
  let momPick = null; // 고른 카드 → 다음 step 입력 { turn, input, key, kind } (그 턴에는 장면을 다시 열지 않는다)
  let momCount = 0; // 이 화면에서 연 장면 수 (디버그)
  // 규칙 판 2 (판 1 · 2 재생 기록 · 옛 엔진 상태) 경기는 엔진이 장면을 정하지 않는다 — [결정 ON/OFF] 는 꺼 두고 (⏸ 개입은 공격 장면만 — 엔진 peekMoment)
  const legacyRules = !(Number(state.rules) >= 3);
  const momentsOn = () => momOk && !legacyRules && ui.moments !== false;
  /** 지금 턴 경계에서 열 장면 (state.moment — [결정 ON] 또는 ⏸ 개입, 아니면 ⏸ 개입의 peekMoment manual) | null */
  function findMoment() {
    if (!momOk || skipped || broken || state.finished || state.stage === 'penalties' || hold || cutCur) return null;
    if (momPick && momPick.turn === state.turn) return null;
    if (state.moment && (momentsOn() || ui.hexIntervene)) return state.moment;
    if (ui.hexIntervene) return safe(() => HM.peekMoment(state, data, { manual: true })) || null;
    return null;
  }
  /** 턴 경계: 장면이 있으면 연다 (true = 이번 step 을 미룬다) */
  function openMoment() {
    const mo = findMoment();
    if (!mo) return false;
    const v = safe(() => HM.momentView(state, data, mo));
    if (!v || !Array.isArray(v.cards) || !v.cards.length) return false;
    if (ui.hexIntervene) ui.hexIntervene = false; // 한 번 멈췄다 (장면이 무엇이든)
    const autoI = v.cards.findIndex((c) => c.auto);
    mom = { mo, view: v, sel: autoI >= 0 ? autoI : 0, rcv: v.cards.map(() => 0), manual: !!mo.manual, turn: state.turn, els: [], camKey: '', cam: null, aimKey: '', aim: null };
    momCount += 1;
    // 이 장면이 물은 합체기 대기는 예전 알림 (comboHold) 을 다시 띄우지 않는다
    const pid = v.carrier && v.carrier.side === humanSide ? v.carrier.id : null;
    const until = pid != null ? state.live?.[humanSide]?.[pid]?.combo?.until : null;
    if (until != null) comboAsked.add(`${pid}:${until}`);
    endComboWait();
    buildMoment();
    clockEl.classList.add('hx-hold');
    drawCtl();
    return true;
  }
  /** 카드 i (▾ 로 돌린 받는 선수 갈래면 그 값을 넣은 카드) */
  function momCard(i) {
    const c = mom?.view?.cards?.[i];
    if (!c) return null;
    const ri = mom.rcv[i] || 0;
    const r = Array.isArray(c.receivers) && c.receivers.length > 1 ? c.receivers[ri] : null;
    return r ? { ...c, ...r, kind: c.kind, star: c.star } : c;
  }
  const pctText = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : '');
  /** 카드 DOM 하나 다시 그리기 (▾ · 밝힘) */
  function fillMomCard(i) {
    const el = mom.els[i];
    const c = momCard(i);
    const base = mom.view.cards[i];
    const n = Array.isArray(base.receivers) ? base.receivers.length : 0;
    el.wrap.className = ['hx-mc', `hx-mc-${base.kind}`, c.auto ? 'hx-mc-auto' : '', c.star ? 'hx-mc-star' : '',
      ['press', 'block', 'drop'].includes(base.kind) ? 'hx-mc-def' : '', base.kind === 'drop' ? 'hx-mc-risk' : '',
      i === mom.sel ? 'hx-mc-sel' : '', n > 1 ? 'hx-mc-has-rcv' : ''].filter(Boolean).join(' ');
    el.wrap.dataset.key = c.key;
    el.wrap.dataset.kind = base.kind;
    const pc = pctText(c.p);
    el.p.textContent = pc;
    el.p.hidden = !pc;
    el.pl.textContent = [c.pLabel, c.estimate ? '추정' : ''].filter(Boolean).join(' '); // '성공 추정' · '가로채기 추정' (한두 줄)
    el.pl.hidden = !el.pl.textContent;
    el.num.hidden = !pc && !el.pl.textContent; // 숫자가 없는 카드 (팀 필살기 · 아끼기) 는 글만
    // ★ 카드는 필살기 이름이 길어 받는 선수를 둘째 줄 앞으로 ("→ 그레타 · 공 돌리기") — 보통 카드도 이름 줄이 넘치면 (폰 4장) 같은 꼴로
    let split = !!c.star;
    el.lbl.textContent = c.receiverName && !split ? `${c.label} → ${c.receiverName}` : c.label;
    if (c.receiverName && !split && el.lbl.scrollWidth > el.lbl.clientWidth + 1) { split = true; el.lbl.textContent = c.label; }
    el.af.textContent = c.receiverName && split ? `→ ${c.receiverName}${c.after ? ` · ${c.after}` : ''}` : c.after || '';
    el.badge.hidden = !c.auto;
    if (el.rcvBtn) {
      el.rcvN.textContent = `${(mom.rcv[i] || 0) + 1}/${n}`;
      el.rcvBtn.setAttribute('aria-label', `받는 선수 바꾸기 (${(mom.rcv[i] || 0) + 1}/${n})`);
    }
    const desc = [c.receiverName ? `${c.label} → ${c.receiverName}` : c.label, pc ? `${c.pLabel || ''} ${pc}${c.estimate ? ' (추정)' : ''}`.trim() : '', c.after, c.auto ? '자동' : ''].filter(Boolean).join(' · ');
    el.pick.title = desc;
    el.pick.setAttribute('aria-label', desc);
  }
  /** 카드 띠 그리기 (장면을 열 때) */
  function buildMoment() {
    const v = mom.view;
    const who = nameOf(v.side, v.playerId) || v.name || '';
    const title = v.kind === 'shot' && v.cards.some((c) => c.after === 'GK 와 1:1') ? 'GK 와 1:1' : MOMENT_TITLE[v.kind] ?? '결정의 순간';
    momHead.replaceChildren(...[
      h('b', { class: 'hx-mo-title' }, `${mom.manual ? '⏸ ' : ''}${title}`),
      who ? h('span', { class: 'hx-mo-who' }, who) : null,
      v.tendency && v.carrier ? h('span', { class: ['hx-mo-chip', `hx-tend-${v.tendency.type}`] }, `상대 ${v.carrier.name} · ${v.tendency.label}`) : null,
      h('span', { class: 'hx-mo-wait' }, '고를 때까지 멈춤')].filter(Boolean));
    momHead.className = ['hx-mo-head', `hx-mo-${v.kind}`].join(' ');
    momCards.replaceChildren();
    momCards.dataset.n = String(v.cards.length);
    mom.els = v.cards.map((c, i) => {
      const p = h('span', { class: 'hx-mc-p' });
      const pl = h('span', { class: 'hx-mc-pl' });
      const lbl = h('span', { class: 'hx-mc-lbl' });
      const af = h('span', { class: 'hx-mc-af' });
      const badge = h('span', { class: 'hx-mc-badge' }, '자동');
      const num = h('span', { class: 'hx-mc-num' }, p, pl);
      const pick = h('button', {
        class: 'hx-mc-pick', type: 'button', onclick: () => pickMoment(i),
        onpointerenter: () => selMoment(i), onfocus: () => selMoment(i),
      }, num, h('span', { class: 'hx-mc-txt' }, lbl, af), badge);
      const rcvN = h('small', { class: 'hx-mc-rn' });
      const rcvBtn = Array.isArray(c.receivers) && c.receivers.length > 1
        ? h('button', { class: 'hx-mc-rcv', type: 'button', onclick: () => cycleReceiver(i) }, h('b', {}, '▾'), rcvN) : null;
      const wrap = h('div', { class: 'hx-mc', role: 'group' }, pick, rcvBtn);
      momCards.append(wrap);
      return { wrap, pick, num, p, pl, lbl, af, badge, rcvBtn, rcvN };
    });
    momEl.hidden = false; // 먼저 보여야 이름 줄 넘침을 잴 수 있다 (fillMomCard)
    ultBar.hidden = true;
    mom.els.forEach((_, i) => fillMomCard(i));
  }
  function selMoment(i) {
    if (!mom || i === mom.sel || !mom.view.cards[i]) return;
    const prev = mom.sel;
    mom.sel = i;
    fillMomCard(prev);
    fillMomCard(i);
  }
  function cycleReceiver(i) {
    if (!mom) return;
    const n = mom.view.cards[i]?.receivers?.length || 0;
    if (n <= 1) return;
    const prev = mom.sel;
    // 다른 카드의 ▾ 첫 누름은 그 카드를 밝히기만 (보이던 받는 선수 그대로 — 화살표 · 이름표가 먼저 그 선수를 가리킨다), 그다음부터 돌린다
    if (prev === i) mom.rcv[i] = ((mom.rcv[i] || 0) + 1) % n;
    mom.sel = i;
    if (prev !== i) fillMomCard(prev);
    fillMomCard(i);
  }
  /** 카드를 골랐다 → 다음 step 입력 (턴 경계에서 이미 기다리는 중이라 다음 프레임에 step) */
  function pickMoment(i) {
    if (!alive() || !mom) return;
    const c = momCard(i);
    if (!c) return;
    momPick = { turn: state.turn, input: c.input || null, key: c.key, kind: mom.view.kind };
    // 장면이 그 선수 입력의 유일한 출처: ★ 가 아닌 카드 ('아끼기' · 보통 카드) 를 고르면 장면 전에 띠에서 눌러 둔 그 선수 · ★ 선수의 켜기 · 끄기 줄을 지운다
    // (띠는 장면 동안 숨어 보이지 않는다 — 2026-10-10 리뷰: '아끼기' 를 골랐는데 필살기가 터졌다). ★ 를 고르면 doStep 이 ★ 쪽 줄로 바꾼다
    if (!c.star) {
      for (const pid of [mom.view.playerId, ...mom.view.cards.filter((x) => x.star).map((x) => x.playerId)]) queued.delete(pid);
    }
    closeMoment();
  }
  function closeMoment() {
    mom = null;
    momEl.hidden = true;
    momCards.replaceChildren();
    ultBar.hidden = stale;
    clockEl.classList.remove('hx-hold');
    drawCtl();
  }
  /** [결정 ON/OFF] — 장면 중 OFF 면 '자동' 으로 이어간다 (⏸ 개입 장면은 그대로) */
  function toggleMoments() {
    if (!momOk || legacyRules) return;
    ui.moments = !momentsOn();
    if (!ui.moments && mom && !mom.manual) {
      momPick = { turn: state.turn, input: null, key: null, kind: mom.view.kind };
      closeMoment();
    }
    drawCtl();
  }
  /** [⏸ 개입] — 다음 우리 장면에서 한 번 멈춤 (다시 누르면 취소) */
  function toggleIntervene() {
    if (!momOk || state.finished || skipped || broken) return;
    ui.hexIntervene = !ui.hexIntervene;
    drawCtl();
  }
  function drawCtl() {
    const on = momentsOn();
    momBtn.textContent = legacyRules ? '결정 —' : on ? '결정 ON' : '결정 OFF';
    momBtn.classList.toggle('active', on);
    momBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    momBtn.disabled = legacyRules;
    momBtn.title = legacyRules ? '이전 판 기록에서 이어 온 경기 — 결정의 순간 없음 (⏸ 개입은 공격 장면만)'
      : on ? '결정의 순간: 중요한 장면에서 멈추고 카드를 고른다 — 누르면 끔 (완전 자동)' : '결정의 순간 꺼짐 (완전 자동) — 누르면 켬';
    const iv = !!ui.hexIntervene;
    intBtn.classList.toggle('active', iv);
    intBtn.setAttribute('aria-pressed', iv ? 'true' : 'false');
    intBtn.title = iv ? '다음 우리 장면에서 한 번 멈춤 — 누르면 취소' : '다음 우리 공 · 수비 장면에서 한 번 멈춘다';
    intBtn.disabled = !!(state.finished || skipped || broken);
  }
  /** 장면 카메라 목표 (공 가진 선수 · 받는 선수 · 붙은 수비 · 노린 칸 틀 — 최대 MOMENT_Z) */
  function momentCam(frame) {
    const key = `${mom.sel}|${mom.rcv.join(',')}`;
    if (mom.camKey === key && mom.cam) return mom.cam;
    const f = S.momentFocus(state, mom.view, momCard(mom.sel));
    const boxes = [];
    for (const x of f.players) {
      const p = frame.players.find((q) => q.key === `${x.side}:${x.id}`);
      if (!p) continue;
      boxes.push({ l: p.sx - p.figure.hw, r: p.sx + p.figure.hw, t: p.sy - p.figure.fh, b: p.sy + 12, core: !!x.core, opt: !!x.opt, key: p.key });
    }
    for (const cell of f.cells) {
      const u = S.cellPlane(cell);
      const pr = V.projectPlane(u.u, u.v, W, H);
      boxes.push({ l: pr.sx - 20, r: pr.sx + 20, t: pr.sy - 20, b: pr.sy + 12 });
    }
    if (!boxes.length) return null;
    const t = V.cameraTarget({ phase: 'decide', W, H, boxes, world, zMin: MOMENT_ZMIN });
    mom.cam = V.clampCamera({ ...t, z: Math.min(MOMENT_Z, t.z) }, W, H, world);
    mom.camKey = key;
    return mom.cam;
  }
  /** 밝힌 카드의 화살표 (frame.aim) */
  function momentAim() {
    const key = `${mom.sel}|${mom.rcv.join(',')}`;
    if (mom.aimKey !== key) {
      mom.aimKey = key;
      mom.aim = safe(() => S.momentAim(state, mom.view, momCard(mom.sel), W, H)) || null;
    }
    return mom.aim;
  }

  /* ---- 컷인 (H3 — 문서 §3 · §5.2, 예전 screens/match.js cutSeq · cutCard) ---- */
  let cutQ = []; // 남은 카드 [{ kind: 'charge'|'cut'|'name'|'reverse', ev?, rc?, part?, dur }]
  let cutCur = null; // 지금 카드 { card, left }
  let cutDone = null; // 카드를 다 보이면 부를 것 (그 턴의 onEvents)
  let postCuts = []; // 이번 턴 그림이 끝난 뒤 보일 역컷인 카드
  const skillById = (id) => (Array.isArray(data.skills) ? data.skills.find((x) => x.id === id) : null) || null;
  const initialOf = (name) => { const t = String(name ?? '').trim(); return t ? Array.from(t)[0] : '?'; };
  const artOf = (side, id, preset) => portraitUrl(data, playerOf(side, id)?.charId, preset);
  /** 이번 step 이벤트 → 컷인 카드 (cutin → 차지 + 카드, combo → 받은 선수의 차지 + 두 선수 카드 + 이름 카드) */
  function cutSeq(evs, first) {
    const out = [];
    let f = !!first;
    const k = 1 / speedOf();
    const charge = (ms) => ({ kind: 'charge', dur: Math.max(CUT_MIN.charge, ms * k) });
    const card = (c, ms) => Object.assign(c, { dur: Math.max(CUT_MIN.card, ms * k) });
    for (const e of evs) {
      if (e.type === 'cutin') {
        const tt = CUT_TIER[e.tier] || CUT_TIER.SSR;
        out.push(charge(f ? tt.charge : tt.chargeShort), card({ kind: 'cut', ev: e }, f ? tt.cut : tt.cutShort));
        f = false;
      } else if (e.type === 'combo') {
        const [sa, sb] = Array.isArray(e.skillIds) ? e.skillIds : [];
        const [pa, pb] = Array.isArray(e.playerIds) ? e.playerIds : [];
        const side = e.side === 'away' ? 'away' : 'home';
        // 받은 선수의 cutin 카드 (와 그 앞 차지) 를 합체기 묶음이 대신한다
        const i = out.findIndex((c) => c.kind === 'cut' && c.ev.skillId === sb && String(c.ev.playerId) === String(pb));
        const recv = i >= 0 ? out.splice(i, 1)[0].ev : null;
        const ch = i > 0 && out[i - 1].kind === 'charge' ? out.splice(i - 1, 1)[0] : charge(f ? CUT_TIER.SSR.charge : CUT_TIER.SSR.chargeShort);
        f = false;
        out.push(ch,
          card({ kind: 'cut', part: 1, ev: { side, playerId: pa, skillId: sa, line: skillById(sa)?.ultimate?.cutinLine || null } }, CUT_T.comboCut),
          card({ kind: 'cut', part: 2, ev: { side, playerId: pb, skillId: sb, ultimateType: recv?.ultimateType, line: recv?.line || null } }, CUT_T.comboCut),
          card({ kind: 'name', ev: e }, CUT_T.comboName));
      }
    }
    return out;
  }
  /** 이번 step 이벤트 → 역컷인 카드 (겨루기 이벤트의 reverseCutin — 막힌 필살기 = 그 턴 막힌 쪽의 마지막 cutin) */
  function reverseSeq(evs, first) {
    const out = [];
    let f = !!first;
    const k = 1 / speedOf();
    evs.forEach((e, i) => {
      const rc = e && e.reverseCutin;
      if (!rc || !REVERSE_FALLBACK[rc.kind]) return;
      const atk = rc.side === 'home' ? 'away' : 'home';
      // 막힌 필살기: 엔진이 실어 준 것 (skillId · combo) 이 먼저, 없으면 (예전 저장) 그 턴 막힌 쪽의 마지막 cutin
      let used = rc.skillId ? { skillId: rc.skillId, ultimateType: rc.ultimateType, combo: !!rc.combo } : null;
      for (let j = i - 1; j >= 0 && !used; j--) if (evs[j].type === 'cutin' && evs[j].side === atk) used = evs[j];
      out.push({ kind: 'reverse', rc, used, dur: Math.max(CUT_MIN.card, (f ? CUT_T.revCut : CUT_T.revCutShort) * k) });
      f = false;
    });
    return out;
  }
  function startCuts(cards, done) {
    cutQ = cards.slice();
    cutDone = done || null;
    nextCut();
  }
  function nextCut() {
    const c = cutQ.shift();
    if (!c) {
      cutCur = null;
      hideCut();
      const d = cutDone;
      cutDone = null;
      if (d) d();
      return;
    }
    cutCur = { card: c, left: c.dur };
    if (c.kind === 'charge') hideCut(); // 차지: 어두운 판 없이 캔버스의 분홍 고리 · 빛 (frame p.ult)
    else showCut(c);
  }
  function tickCuts(dt) {
    let t = dt;
    while (cutCur && t > 0) {
      const used = Math.min(t, cutCur.left);
      cutCur.left -= used;
      t -= used;
      if (cutCur.left <= 1e-6) nextCut();
    }
  }
  function clearCuts() {
    cutQ = [];
    cutCur = null;
    cutDone = null;
    postCuts = [];
    hold = null;
    hideCut();
  }
  function showCut(c) {
    const el = cutCard(c);
    el.style.setProperty('--t-cut', `${Math.round(c.dur)}ms`);
    cutLayer.replaceChildren(el);
    cutLayer.classList.add('show');
  }
  function hideCut() {
    if (!cutLayer.classList.contains('show') && !cutLayer.firstChild) return;
    cutLayer.classList.remove('show');
    cutLayer.replaceChildren();
  }
  /** 카드 DOM (예전 경기 화면 cutCard 와 같은 클래스 · 모양 — 전역 .cut* CSS) */
  function cutCard(c) {
    const ev = c.ev || {};
    if (c.kind === 'reverse') {
      // 역컷인: 막은 선수 쪽에서 들어온다 (반대 기울기 · 차가운 색 .cut-save), 종류별 색 .rev-<kind>
      const rc = c.rc || {};
      const defSide = rc.side === 'away' ? 'away' : 'home';
      const g = playerOf(defSide, rc.playerId) || {};
      const usDef = defSide === humanSide;
      const used = c.used || null;
      const what = used?.combo ? '합체기' : skillById(used?.skillId)?.name ?? L.ULT_TYPE_LABELS[used?.ultimateType] ?? '필살기';
      const role = rc.kind === 'save' ? 'GK' : state.roles?.[defSide]?.[rc.playerId] ?? g.position ?? '';
      return h('div', { class: ['cut', 'cut-save', 'cut-rev', `rev-${rc.kind}`, `side-${defSide}`], dataset: { kind: rc.kind } },
        h('div', { class: 'cut-band' },
          cutArt(h('span', { class: 'cut-face', style: { background: g.portraitColor || '#4b5563' } }, initialOf(g.name)), artOf(defSide, rc.playerId, 'bust'), 'bust'),
          h('div', { class: 'cut-txt' },
            h('small', {}, `${usDef ? '' : '상대 '}${role ? `${role} ` : ''}${g.name ?? ''} · ${what} ${rc.kind === 'passCut' ? '차단' : '봉쇄'}`),
            h('b', {}, rc.text || REVERSE_FALLBACK[rc.kind] || '막아냈다!'))));
    }
    const side = ev.side === 'away' ? 'away' : 'home';
    const us = side === humanSide;
    if (c.kind === 'name') {
      // 합체기 이름 카드: 두 선수 흉상 (패스한 선수 왼쪽 · 받은 선수 오른쪽 — 아래 글 "A → B" 와 같은 순서)
      const [pa, pb] = Array.isArray(ev.playerIds) ? ev.playerIds : [];
      const duo = [pa, pb].map((id) => {
        const q = playerOf(side, id) || {};
        return cutArt(h('span', { class: ['cut-face', 'cut-duo'], style: { background: q.portraitColor || '#4b5563' } }, initialOf(q.name)), artOf(side, id, 'bust'), 'bust');
      });
      const withArt = duo.some((el) => el.classList.contains('has-art'));
      return h('div', { class: ['cut', 'cut-name', `side-${side}`, withArt ? 'has-duo' : ''] },
        h('div', { class: 'cut-band' },
          withArt ? duo[0] : null,
          h('div', { class: 'cut-txt' },
            h('small', {}, `${us ? '' : '상대 '}합체기`),
            h('b', {}, ev.name ?? '합체기'),
            h('span', { class: 'cut-sub' }, [nameOf(side, pa), nameOf(side, pb)].filter(Boolean).join(' → '))),
          withArt ? duo[1] : null));
    }
    const p = playerOf(side, ev.playerId) || {};
    const sk = skillById(ev.skillId);
    const type = ev.ultimateType || sk?.ultimate?.type;
    // 등급 클래스 (합체기 두 장은 없음 = SSR 판), 그림: SSR = 반신 · SR = 흉상 · R = 얼굴 (없으면 글자 원)
    const tier = c.part ? null : (CUT_TIER[ev.tier] ? ev.tier : null);
    const typeLabel = L.ULT_TYPE_LABELS[type] ?? '필살기';
    const preset = tier === 'R' ? 'face' : tier === 'SR' ? 'bust' : 'half';
    return h('div', { class: ['cut', `side-${side}`, `el-${p.element ?? 'none'}`, type ? `ut-${type}` : '', tier ? `tier-${tier}` : '', c.part ? `part-${c.part}` : ''],
      dataset: { type: type ?? '', tier: tier ?? '' } },
      h('div', { class: 'cut-band' },
        cutArt(h('span', { class: 'cut-face', style: { background: p.portraitColor || '#4b5563' } }, initialOf(p.name)), artOf(side, ev.playerId, preset), preset),
        h('div', { class: 'cut-txt' },
          h('small', {}, `${us ? '' : '상대 '}${p.name ?? ''} · `, h('span', { class: ['cut-type', type ? `ut-${type}` : ''] }, typeLabel),
            c.part ? ` (${c.part}/2)` : ''),
          h('b', {}, sk?.name ?? ev.skillId ?? '필살기'),
          ev.line ? h('span', { class: 'cut-line', title: ev.line }, `“${ev.line}”`) : null)));
  }
  /** 컷인 그림 미리 불러오기: 필살기 보유자 = 반신 · 흉상 · 얼굴, 그 밖 = 흉상 (역컷인 — 막은 선수) */
  function preloadCutArt() {
    const holders = [];
    const others = [];
    for (const side of ['home', 'away']) {
      const list = ultListOf(side) || [];
      for (const u of list) (u.has ? holders : others).push(playerOf(side, u.playerId)?.charId);
    }
    preloadArt([...portraitUrls(data, holders, ['half', 'bust', 'face']), ...portraitUrls(data, others, ['bust'])]);
  }

  /* ---- Pixi view ---- */
  let view = null;
  let viewState = 'pending'; // 'pending' | 'webgl' | 'fallback' | 'lost'
  let retryLeft = 0;
  let retries = 0; // 연달아 잃은 횟수 (다시 만든 view 가 T.stable 동안 살아 있으면 0)
  let viewAge = 0; // 지금 view 가 살아 있은 시간 (ms, 루프 dt)
  let creating = false;
  let lostWhileCreating = false; // 만드는 도중 (app.init 뒤 그림 읽는 중) 문맥을 잃었다 → 다 만든 view 를 받지 않는다
  function makeView() {
    if (creating) return;
    creating = true;
    lostWhileCreating = false;
    viewState = view ? viewState : 'pending';
    let p;
    try {
      p = Promise.resolve(createHexView(canvasHost, {
        W, H, width: PW, height: PH, origin, data, resolution: hexResolution(),
        onContextLost: () => contextLost(),
      }));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then((v) => {
      creating = false;
      if (!alive()) { try { v?.destroy?.(); } catch (_) { /* 이미 */ } return; }
      if (!v) {
        viewState = 'fallback';
        fallbackEl.hidden = false;
        noteEl.hidden = true;
        return;
      }
      let lost = lostWhileCreating;
      try { lost = lost || !!v.isLost?.(); } catch (_) { /* 모름 = 살아 있다 */ }
      lostWhileCreating = false;
      if (lost) {
        // 죽은 문맥으로 다 만든 view: 받지 않고 지운다 (contextLost 가 이미 다시 만들기를 걸어 두었다 — 아니면 지금 건다)
        try { v.destroy?.(); } catch (_) { /* 이미 */ }
        if (viewState !== 'fallback' && viewState !== 'lost') contextLost();
        return;
      }
      view = v;
      viewAge = 0;
      viewState = v.renderer || 'webgl';
      fallbackEl.hidden = true;
      noteEl.hidden = true;
      drawSig = '';
    }, (e) => {
      creating = false;
      console.warn('육각 경기장 view 를 만들지 못했습니다', e);
      if (!alive()) return;
      viewState = 'fallback';
      fallbackEl.hidden = false;
    });
  }
  function dropView() {
    const v = view;
    view = null;
    if (v) { try { v.destroy(); } catch (e) { console.warn('view 정리 실패', e); } }
  }
  function contextLost() {
    if (!alive()) return;
    if (creating) lostWhileCreating = true;
    persist();
    dropView();
    viewState = 'lost';
    noteEl.hidden = false;
    retries += 1;
    retryLeft = retries <= MAX_RETRIES ? T.retry : 0;
    if (retries > MAX_RETRIES) { viewState = 'fallback'; noteEl.hidden = true; fallbackEl.hidden = false; }
  }

  /* ---- 진행 ---- */
  let prevSnap = null; // 지난 step 전 상태 (sceneSnap)
  let acc = 0; // 이번 턴 안에서 흐른 시간 (ms)
  let wait = 0; // 이번 턴 다음 step 까지 더 기다릴 시간 (골 · 시작)
  let goal = null; // { scene: 골 장면 끝 (acc ms), until: 킥오프 자리 끝, kickoff: 이 턴에 킥오프로 돌아갔나 } — 골 턴만
  let startHold = !state.finished;
  wait = startHold ? T.start / speedOf() : 0;
  acc = 0;
  let endLeft = state.finished ? 0 : -1; // 끝난 뒤 결과까지 남은 시간 (−1 = 아직 안 끝남)
  let comboWait = null; // 사람 쪽 합체기 대기 멈춤 { left } (다음 step 을 미룬다)
  const comboAsked = new Set(); // 멈춘 적 있는 합체기 대기 ('playerId:until' — 같은 대기에 한 번만)
  let resultShown = false;
  let finishing = false;
  let broken = false;

  function turnMs() {
    return (state.stage === 'penalties' ? T.penalty : hexTickMs()) / speedOf();
  }

  function doStep() {
    flushEmotes(); // 지난 턴의 닿는 순간 프레임을 못 만났으면 (4배속 · 낮은 fps) 그 말풍선을 지금 — 조용히 빠지지 않게
    prevSnap = S.sceneSnap(state);
    const n0 = state.events.length;
    const playingBefore = ultPlaying();
    endComboWait();
    // 필살기 입력 (턴 경계 — 문서 §2.2-1): 이 step 의 번호 (0 부터) 와 함께 재생 기록에 남긴다
    const list = takeInput();
    // 결정의 순간에 고른 카드 (H3.5): ★ 카드의 켜기는 필살기 줄에 (같은 선수 줄은 ★ 쪽이), choice · defend 는 그대로
    const pick = momPick && momPick.turn === state.turn && ultPlaying() ? momPick.input : null;
    momPick = null;
    for (const u of Array.isArray(pick?.ultimates) ? pick.ultimates : []) {
      const i = list.findIndex((x) => String(x.playerId) === String(u.playerId));
      if (i >= 0) list.splice(i, 1);
      list.push({ side: u.side, playerId: u.playerId, op: u.op });
    }
    const input = {};
    if (list.length) input.ultimates = list;
    if (pick?.choice) input.choice = { ...pick.choice };
    if (pick?.defend) input.defend = { ...pick.defend };
    const idx = steps;
    const hadCut = state.events.some((e) => e.type === 'cutin');
    const hadRev = state.events.some((e) => e.reverseCutin);
    const r = safe(() => HM.step(state, data, Object.keys(input).length ? input : null));
    if (r === undefined) { prevSnap = null; broken = true; return false; } // 엔진 오류: 더 돌리지 않는다 (⏭ · 처음으로는 그대로)
    for (const x of list) inputs.push([idx, x.side, String(x.playerId), x.op]);
    if (input.choice) inputs.push([idx, input.choice.side, String(input.choice.playerId), 'choose', String(input.choice.key)]);
    if (input.defend) inputs.push([idx, input.defend.side, String(input.defend.playerId), 'defend', input.defend.mode]);
    steps += 1;
    persist();
    const emotesFn = emotesOfTest || (sceneOk ? S.emotesOf : null); // 옛 hexScene.js 가 섞이면 말풍선 없이
    turnEmotes = emotesFn ? safe(() => emotesFn(prevSnap, state)) || [] : []; // 이번 턴 말풍선 (닿는 순간에 drawEmotes 가 띄운다)
    emoteSeen.clear();
    const evs = state.events.slice(n0);
    // 컷인 (그 턴 그림 전) · 역컷인 (그 턴 그림 뒤). 컷인이 있으면 골 · 단계 배너는 컷인 뒤에
    goal = null;
    flushBanner();
    postCuts = reverseSeq(evs, !hadRev);
    const pre = cutSeq(evs, !hadCut);
    if (pre.length) {
      acc = 0; // 그 턴 그림은 처음 (보간 0) 에서 멈춘 채 컷인
      hold = { playing: playingBefore, sent: new Map(list.map((x) => [x.playerId, x.op])) }; // 컷인이 끝날 때까지 HUD · 띠 · 카메라 · 스프라이트 시계는 step 전 그림
      startCuts(pre, () => { hold = null; onEvents(evs); });
    } else {
      onEvents(evs);
    }
    drawUlt();
    return true;
  }

  function onEvents(evs) {
    const sp = speedOf();
    flushBanner(); // 지난 골 장면 뒤로 미룬 단계 배너가 아직 남았으면 지금
    goal = null;
    const hasGoal = evs.some((e) => e.type === 'goal');
    // 단계 배너: 같은 턴에 골이 있으면 "골!" 을 덮지 않게 골 장면 뒤로 미룬다 (동점골 → 골든골 · 골 → 추가시간)
    const stageBanner = (text, sub) => {
      const b = { text, sub, cls: 'hx-stage', ms: T.stageBanner / sp };
      if (hasGoal) pendingBanner = b;
      else banner(b.text, b.sub, b.cls, b.ms);
    };
    for (const e of evs) {
      if (e.type === 'goal') {
        const tm = turnMs();
        goal = {
          scene: tm + T.goalScene / sp, until: tm + (T.goalScene + T.goalKickoff) / sp,
          kickoff: evs.some((x) => x.type === 'kickoff'), // 골든골 결승골은 킥오프 없이 끝난다 → 공은 골망에 그대로
        };
        wait = goal.until - tm;
        // 2골 선승 (결정 27) 으로 끝나는 골이면 아랫줄에 그 까닭 — 시계 자리는 이미 "경기 종료"
        const won = evs.some((x) => x.type === 'end' && x.reason === 'goals') ? ' · 2골 선승' : '';
        banner('골!', `${nameOf(e.side, e.playerId)} · ${e.score ? `${e.score.home} : ${e.score.away}` : S.scoreText(state)}${won}`, `hx-goal hx-${e.side}`, T.goalBanner / sp + tm);
      } else if (e.type === 'goldenGoal') {
        stageBanner('골든골', '먼저 넣는 쪽이 이긴다');
      } else if (e.type === 'addedTime') {
        stageBanner('추가시간', e.side === 'home' ? '우리 마지막 공격' : '상대 마지막 공격');
      } else if (e.type === 'penalties') {
        stageBanner('승부차기', '');
      } else if (e.type === 'penalty' && !goal) {
        const pen = state.penalties;
        banner(e.success ? '성공' : '실패', `${nameOf(e.side, e.playerId)} · 승부차기 ${pen?.home ?? 0} : ${pen?.away ?? 0}`, `hx-pk hx-${e.side} ${e.success ? 'hx-ok' : 'hx-miss'}`, (T.penalty * 0.9) / sp);
      }
    }
    if (state.finished && endLeft < 0) endLeft = T.end / sp + (goal ? goal.until : turnMs());
    if (state.finished) endIntervene();
  }
  /** 경기가 끝났다: ⏸ 개입 끄기 (다음 연습 경기로 새지 않게 — 2026-10-10 리뷰) · 버튼 끔 */
  function endIntervene() {
    ui.hexIntervene = false;
    drawCtl();
  }

  function skip() {
    if (!alive()) return;
    queued.clear();
    // ⏭ = 장면 카드를 고르지 않고 ('자동' 과 같다) 양쪽 AI 로 끝까지
    momPick = null;
    if (mom) closeMoment();
    ui.hexIntervene = false;
    clearCuts(); // ⏭ 은 컷인을 닫는다
    turnEmotes = [];
    clearEmotes(); // ⏭ 뒤에는 말풍선 없음
    endComboWait();
    if (state.finished) { showResult(); return; }
    const r = safe(() => HM.simulateAuto(state, data));
    skipped = true;
    persist();
    drawUlt(true);
    prevSnap = null;
    goal = null;
    pendingBanner = null;
    wait = 0;
    acc = 0;
    startHold = false;
    endLeft = 0;
    drawHud();
    drawCtl();
    if (r !== undefined) showResult();
  }

  /* ---- 결과 ---- */
  function showResult() {
    if (resultShown || !alive() || !state.finished) return;
    endIntervene();
    const result = safe(() => HM.getResult(state));
    if (!result) return;
    resultShown = true;
    ui.resultShown = true;
    const home = state.home || {};
    const away = state.away || {};
    const winner = result.winner;
    const verdict = winner === 'home' ? '승리!' : winner === 'away' ? '패배…' : '무승부';
    const st = result.stats || state.stats || {};
    const hg = result.homeGoals ?? state.score?.home ?? 0;
    const ag = result.awayGoals ?? state.score?.away ?? 0;
    const num = (side, k) => Number(st[side]?.[k]) || 0;
    const rows = [
      ['슛', (s) => num(s, 'shots')],
      ['겨루기 승', (s) => num(s, 'duelsWon')],
      ['골', (s) => num(s, 'goals')],
      ['패스 (성공/시도)', (s) => `${num(s, 'passesCompleted')}/${num(s, 'passes')}`],
      ['가로채기', (s) => num(s, 'interceptions')],
      ['태클 성공', (s) => num(s, 'tacklesWon')],
      ['필살기', (s) => num(s, 'ultimatesUsed')],
      ['합체기', (s) => num(s, 'combos')],
    ];
    const mvp = (side) => nameOf(side, st[side]?.mvpId) || '-';
    // [확인] · [다시 하기] 는 합쳐 정확히 1회 (런: run.finishMatch 가 실패하면 app.js 가 render() — 이 화면이 다시 그려지며 결과를 다시 연다)
    const once = (fn) => (e) => {
      if (finishing) return;
      finishing = true;
      if (e?.currentTarget) e.currentTarget.disabled = true;
      closeOverlays();
      ui.resultShown = false;
      fn();
    };
    const okBtn = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: once(() => onFinish(result)) }, '확인');
    // 경기 모드 [다시 하기] (연습): [확인] 옆
    const againBtn = again ? h('button', { class: 'btn btn-block again-btn', type: 'button', onclick: once(() => again.onClick()) }, again.label || '다시 하기') : null;
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h2', { class: 'center' }, `${mode?.label ?? L.KIND_LABELS[result.kind ?? state.kind] ?? ''} 결과`),
      h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, home.name ?? '우리 클럽'), h('span', { class: 'ellipsis' }, away.name ?? '상대')),
      h('div', { class: 'score-big' }, `${hg} : ${ag}`),
      h('div', { class: ['result-verdict', winner === 'home' ? 'good' : winner === 'away' ? 'bad' : 'muted'] }, verdict),
      result.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${result.penalties.home ?? 0} : ${result.penalties.away ?? 0}`) : null,
      h('table', { class: 'stats-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '우리'), h('th', {}, '상대'))),
        h('tbody', {},
          rows.map(([lbl, f]) => h('tr', {}, h('td', {}, lbl), h('td', {}, f('home')), h('td', {}, f('away')))),
          h('tr', {}, h('td', {}, 'MVP'), h('td', {}, mvp('home')), h('td', {}, mvp('away'))))),
      againBtn ? h('div', { class: 'row hx-result-btns', style: { gap: '8px' } }, againBtn, okBtn) : okBtn,
    ), { closable: false });
  }

  /* ---- 카메라 ---- */
  let cam = { cx: W / 2, cy: H / 2, z: 1 };
  function camStep(frame, dt) {
    const sp = speedOf();
    const inGoal = !!(goal && acc < goal.until);
    const phase = V.cameraPhase({
      skip: skipped, finished: state.finished, goal: inGoal,
      kickoff: !!frame.kickoff || state.stage === 'penalties', start: startHold,
    });
    const target = (mom && phase !== 'full' && momentCam(frame))
      || V.cameraTarget({ phase, W, H, speed: sp, ball: frame.focus, attackRight: frame.attackRight, world });
    const k = 1 - Math.exp(-dt / T.camTau);
    const z = Math.abs(target.z - cam.z) < 0.001 ? target.z : cam.z + (target.z - cam.z) * k;
    const next = { cx: cam.cx + (target.cx - cam.cx) * k, cy: cam.cy + (target.cy - cam.cy) * k, z };
    // z = 1 이면 clampCamera 가 가운데로 바로 붙이므로 그대로 둔다 (가운데로 함께 수렴 중)
    cam = z <= 1 + 1e-9 ? { cx: next.cx, cy: next.cy, z: 1 } : V.clampCamera(next, W, H, world);
  }

  /* ---- 이름표 (공 가진 선수) ---- */
  let nameKey = null;
  function drawName(frame) {
    const p = frame.carrierKey ? frame.players.find((x) => x.key === frame.carrierKey) : null;
    if (!p || state.finished || !view) { // 캔버스가 없으면 (대체 화면 · 다시 그리는 중) 이름표도 숨긴다
      if (!nameEl.hidden) nameEl.hidden = true;
      return;
    }
    if (nameKey !== p.key) {
      nameKey = p.key;
      nameEl.textContent = p.name;
      nameEl.className = `hx-name hx-${p.side}`;
    }
    const pt = S.camPoint(S.headPoint(p), cam, W, H);
    nameEl.style.transform = `translate(${Math.round(pt.x * 10) / 10}px, ${Math.round(pt.y * 10) / 10}px) translate(-50%, -100%)`;
    if (nameEl.hidden) nameEl.hidden = false;
  }

  /** 결정의 순간 이름표: 고르는 선수 (수비 위기의 우리 수비 · 필살기 선수) · 밝힌 카드의 받는 선수 (패스길 막기 = 상대 받는 선수). 공 가진 선수는 위 이름표 */
  function drawMomTags(frame) {
    const want = [];
    if (mom && view && !state.finished) {
      const v = mom.view;
      const c = momCard(mom.sel);
      want.push({ side: v.side, id: v.playerId });
      if (c && c.receiverId != null) want.push({ side: c.receiverSide || v.side, id: c.receiverId });
    }
    momTagEls.forEach((el, i) => {
      const w = want[i];
      const key = w ? `${w.side}:${w.id}` : null;
      const p = key && key !== frame.carrierKey ? frame.players.find((x) => x.key === key) : null;
      if (!p) {
        if (!el.hidden) el.hidden = true;
        return;
      }
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.textContent = p.name;
        el.className = `hx-name hx-mo-tag hx-${p.side}`;
      }
      const pt = S.camPoint(S.headPoint(p), cam, W, H);
      el.style.transform = `translate(${Math.round(pt.x * 10) / 10}px, ${Math.round(pt.y * 10) / 10}px) translate(-50%, -100%)`;
      if (el.hidden) el.hidden = false;
    });
  }

  /* ---- 감정 말풍선 (공을 뺏은 · 뺏긴 선수 — 머리 주석) ---- */
  let turnEmotes = []; // 이번 턴 hexScene.emotesOf
  const emoteSeen = new Set(); // 이번 턴 이미 띄운 key (프레임마다 다시 띄우지 않게)
  const emotes = []; // 보이는 말풍선 { el, b, key, side, id, kind, text, left, dur, x, y, drop, lift, bw, bh } (최대 S.EMOTE_MAX — 넘치면 남은 시간이 가장 짧은 것을 다시 쓴다)
  const emotePool = []; // 쉬는 .hx-emote 칸
  let nameH = 0; // 이름표 높이 (처음 보일 때 한 번 잰다 — 글꼴 고정)
  function clearEmotes() {
    while (emotes.length) {
      const m = emotes.pop();
      m.el.hidden = true;
      m.el.replaceChildren();
      emotePool.push(m.el);
    }
  }
  function dropEmote(m) {
    const i = emotes.indexOf(m);
    if (i >= 0) emotes.splice(i, 1);
    m.el.hidden = true;
    m.el.replaceChildren();
    emotePool.push(m.el);
  }
  function spawnEmote(e) {
    // 같은 선수의 지난 턴 말풍선은 새것으로 바꾼다 (공이 연달아 오가면 "!!" 와 "💦" 가 한 머리 위에 겹쳐서)
    for (const m of emotes.filter((x) => x.side === e.side && x.id === e.id)) dropEmote(m);
    if (emotes.length >= S.EMOTE_MAX) dropEmote(emotes.reduce((a, b) => (b.left < a.left ? b : a)));
    const el = emotePool.pop() || field.appendChild(h('div', { class: 'hx-emote', 'aria-hidden': 'true', hidden: true }));
    const text = e.kind === 'win' ? (e.cause === 'tackle' ? EMOTE_TEXT.steal : EMOTE_TEXT.win) : EMOTE_TEXT.lose;
    const dur = Math.max(EMOTE.min, EMOTE.ms / speedOf());
    // 안쪽 말풍선은 띄울 때마다 새로 (CSS 팝 애니메이션이 처음부터)
    const b = h('span', { class: 'hx-emote-b' }, text);
    b.style.setProperty('--hx-emo', `${Math.round(dur)}ms`);
    el.className = `hx-emote hx-emote-${e.kind} hx-${e.side}${text === EMOTE_TEXT.steal ? ' hx-emote-steal' : ''}`;
    el.dataset.key = e.key;
    el.replaceChildren(b);
    // 이번 턴 끝에 공을 가질 선수 (뺏은 선수) 면 그 턴 동안은 처음부터 이름표 위 — 이름표는 넘기는 때 (진행도 ≈ 0.81) 뒤에야 뜨므로 미리 비워 둔다
    const h0 = state.ball?.holder;
    const holds = !state.finished && !!h0 && h0.side === e.side && String(h0.id) === String(e.id);
    emotes.push({ el, b, key: e.key, side: e.side, id: e.id, kind: e.kind, text, left: dur, dur, x: 0, y: 0, drop: null, turn: state.turn, holds, lift: false, bw: 0, bh: 0 });
  }
  function spawnTurnEmotes() {
    for (const e of turnEmotes) {
      if (emoteSeen.has(e.key)) continue;
      emoteSeen.add(e.key);
      spawnEmote(e);
    }
  }
  /** step 직전: 이번 턴 말풍선 중 아직 못 띄운 것 (닿는 순간 창 [at, 1) 에 프레임이 하나도 안 떨어짐 — 4배속 · 20 fps) 을 띄운다 */
  function flushEmotes() {
    if (!turnEmotes.length || !view || skipped || state.stage === 'penalties' || goal || cutCur || hold) return;
    spawnTurnEmotes();
  }
  /** 매 프레임: 닿는 순간이면 이번 턴 말풍선을 띄우고, 보이는 것은 시간을 줄이고 머리 위로 옮긴다 */
  function drawEmotes(frame, dt) {
    // 캔버스가 없거나 (대체 화면 · 다시 그리는 중) ⏭ 뒤 · 승부차기 · 골 턴 (골 배너 · 골 장면 — 지난 턴 말풍선도) → 모두 지운다
    if (!view || skipped || state.stage === 'penalties' || goal) {
      if (emotes.length) clearEmotes();
      return;
    }
    const paused = !!(cutCur || hold); // 컷인 · 차지 · 역컷인 동안: 숨기고 멈춤
    if (!paused) {
      for (const m of emotes.slice()) {
        m.left -= dt;
        if (m.left <= 0) dropEmote(m);
      }
      const tm = turnMs();
      const at = Math.min(0.75, S.BALL_RELEASE * Math.max(ONE_SHOT_MIN, tm) / tm); // 닿는 순간 (currentFrame 의 release 와 같은 식)
      if (prevSnap && frame.alpha >= at) spawnTurnEmotes();
    }
    if (!emotes.length) return;
    if (!nameH && !nameEl.hidden) nameH = nameEl.offsetHeight; // 한 번만 (jsdom = 0 → 18)
    const tagLift = (nameH || 18) + 2;
    for (const m of emotes) {
      m.el.classList.toggle('hx-paused', paused);
      const p = frame.players.find((x) => x.key === `${m.side}:${m.id}`);
      if (!p) { m.el.hidden = true; continue; }
      const pt = S.camPoint(S.headPoint(p), cam, W, H);
      // 같은 선수 위 이름표 (공 가진 선수) 가 보이거나 곧 뜰 때 (띄운 턴 · 그 턴 끝에 공을 가짐) 는 그 위로. 이름표가 떠나면 (다음 턴 패스) 머리 위로 내려온다 —
      // 올리고 내리기는 한 번에 뛰지 않고 아래 목표로 부드럽게 (이름표가 붙었다 떨어질 때마다 22px 뛰던 것 — 2026-10-10 리뷰)
      m.lift = (!nameEl.hidden && nameKey === p.key) || (m.holds && m.turn === state.turn);
      // 움직이는 스프라이트가 태클 · 넘어짐 (낮은 자세) 이면 머리 점이 선 키라 말풍선이 떠 보인다 (옆 선수 것처럼) → 그만큼 내린다.
      // 올린 말풍선의 목표는 이름표 위 (이름표가 선 키 머리 점이라 낮은 자세여도) — 낮은 자세에서 띄우면 그 머리에서 솟아올라 이름표 위로 간다.
      // 목표가 바뀌면 (자세 · 올리기) 부드럽게 (EMOTE_LOW_TAU)
      const low = p.charId && view.spriteKind?.(p.charId) === 'anim' ? (EMOTE_LOW[p.act] || 0) * p.figure.fh * cam.z : 0;
      const target = m.lift ? -tagLift : low;
      m.drop = m.drop == null ? (low > 0 ? low : target) : m.drop + (target - m.drop) * (1 - Math.exp(-(paused ? 0 : dt || 16) / EMOTE_LOW_TAU));
      pt.y += m.drop;
      if (!m.bw) { // 크기는 글자를 넣은 뒤 그대로 → 처음 보일 때 한 번 잰다 (프레임마다 layout 읽지 않게)
        if (m.el.hidden) m.el.hidden = false;
        m.bw = m.el.offsetWidth || EMOTE.w;
        m.bh = m.el.offsetHeight || EMOTE.h;
      }
      // 필드 영역 안 (위 = 시계 · 점수 머리 밑, 아래 = 필드 바닥 — 필살기 띠 위). 말풍선 자리 = 아래 가운데 (꼬리 끝)
      const spot = S.emoteSpot(pt, m.bw, m.bh, W, H, EMOTE.top);
      m.x = spot.x;
      m.y = spot.y;
      m.el.style.transform = `translate(${Math.round(m.x * 10) / 10}px, ${Math.round(m.y * 10) / 10}px) translate(-50%, -100%)`;
      if (m.el.hidden) m.el.hidden = false;
    }
  }

  /* ---- 한 프레임 ---- */
  let lastT = null;
  let fps = 0;
  let frames = 0;
  let drawSig = '';
  let animClock = 0; // 스프라이트 시계 (ms — 루프 dt 합, 배경 탭에서 멈춘다)
  let texStats = null; // view.stats() (30 프레임마다 — 디버그 · 메모리 재기)
  let rafId = null;
  const raf = (fn) => {
    const w = globalThis.window;
    if (w && typeof w.requestAnimationFrame === 'function') return w.requestAnimationFrame(fn);
    if (typeof globalThis.requestAnimationFrame === 'function') return globalThis.requestAnimationFrame(fn);
    return setTimeout(() => fn(Date.now()), 16);
  };
  const caf = (id) => {
    const w = globalThis.window;
    if (w && typeof w.cancelAnimationFrame === 'function') w.cancelAnimationFrame(id);
    else if (typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(id);
    else clearTimeout(id);
  };
  const onVisibility = () => {
    if (!alive()) { stop(); return; }
    lastT = null; // 돌아오면 dt 를 새로 잰다 (밀린 시간을 한꺼번에 돌리지 않는다)
  };
  globalThis.document?.addEventListener?.('visibilitychange', onVisibility);

  function stop() {
    if (rafId != null) caf(rafId);
    rafId = null;
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
    dropView();
  }

  function advance(dt) {
    if (broken) return;
    // 컷인 · 역컷인 동안은 시계 · 턴 · 보간 · 끝 대기가 모두 멈춘다
    if (cutCur) { tickCuts(dt); return; }
    // 역컷인: 그 턴 그림 (한 턴) 이 끝난 순간 — 다음 step · 골 장면 기다림 · 끝 대기보다 먼저
    const playPost = () => {
      if (!postCuts.length || acc < turnMs()) return false;
      acc = turnMs();
      const cards = postCuts;
      postCuts = [];
      startCuts(cards, null);
      return true;
    };
    if (state.finished) {
      if (endLeft >= 0 && !resultShown) {
        acc += dt;
        if (playPost()) return;
        endLeft -= dt;
        if (endLeft <= 0) showResult();
      }
      return;
    }
    acc += dt;
    if (pendingBanner && (!goal || acc >= goal.scene)) flushBanner(); // 골 장면이 끝나면 미룬 단계 배너
    if (startHold) {
      if (acc < wait) return;
      // 시작 · 이어하기 전체 화면이 끝났다 → 바로 턴 경계 (아래 — 사람 쪽 합체기 대기 멈춤도 같은 자리, 그다음 step 은 보간 0 부터)
      startHold = false;
      acc = turnMs();
      wait = 0;
    }
    if (playPost()) return;
    const tm = turnMs();
    if (acc >= tm + wait) {
      // 결정의 순간 (H3.5): 장면이 열려 있으면 고를 때까지 (제한 없음) 이 턴 경계에 선다 — 컷인 · 골 장면 · 역컷인은 이미 끝났다
      if (mom || openMoment()) { acc = tm + wait; return; }
      // 사람 쪽 합체기 대기: 누를 틈 (시계 · 턴 멈춤, 배속과 상관없이 최대 T.comboHold) — 누르면 tapUlt 가 풀고 다음 프레임에 step
      if (comboWait || startComboWait()) {
        comboWait.left -= dt;
        if (comboWait.left > 0 && comboPending()) { acc = tm + wait; return; }
        endComboWait();
      }
      acc = Math.min(acc - tm - wait, tm); // 밀린 시간은 한 턴까지만
      wait = 0;
      doStep();
    }
  }

  function currentFrame() {
    const tm = turnMs();
    if (goal && goal.kickoff && acc >= goal.scene) return S.frameAt(null, state, 1, { W, H, sprite: spriteSize, ultReady: readySet }); // 골 뒤 킥오프 자리 (골든골 결승골은 없음 — 공은 골망에)
    const alpha = startHold || !prevSnap ? 1 : Math.min(1, acc / tm);
    // 골 장면 = 공이 골망에 닿은 뒤 (득점자 세리머니 — 골든골 결승골은 끝까지).
    // 공이 발을 떠나는 진행도: 한 번 동작은 최소 ONE_SHOT_MIN ms 로 늘어나므로 (4배속) 발이 닿는 때도 그만큼 늦다
    const release = Math.min(0.75, S.BALL_RELEASE * Math.max(ONE_SHOT_MIN, tm) / tm);
    const f = S.frameAt(prevSnap, state, alpha, { W, H, sprite: spriteSize, goalScene: !!(goal && acc >= tm), release, ultReady: readySet });
    // 공 가진 선수가 이번 턴에 바뀌었으면 (패스 받기 · 가로채기 · 태클) 공이 거의 도착할 때까지 새 선수 표시 (금색 고리 · 이름표) 를 미룬다
    // — 공이 아직 앞 선수 발밑에 있는데 고리 · 이름표만 먼저 건너가 보이지 않게.
    const ph = prevSnap?.ball?.holder || null;
    const nh = state.ball?.holder || null;
    const handover = !!(prevSnap && nh && !f.kickoff && (!ph || ph.side !== nh.side || ph.id !== nh.id) && alpha < f.release + CARRIER_SWITCH * (1 - f.release));
    if (goal || state.stage === 'penalties' || state.finished || handover) {
      // 골 장면 (공은 골망 안 — 다음 킥오프 선수 표시는 킥오프 자리에서만) · 승부차기 · 끝 · 공이 건너가는 중: 공 가진 선수 표시 없음
      f.carrierKey = null;
      for (const p of f.players) p.carrier = false;
    }
    return f;
  }

  function loop(now) {
    rafId = null;
    if (!alive()) { stop(); return; }
    const hidden = !!globalThis.document?.hidden;
    const dt = lastT == null || hidden ? 0 : Math.min(DT_CAP, Math.max(0, now - lastT));
    lastT = hidden ? null : now;
    if (dt > 0) {
      if (!hold) animClock += dt; // 턴 전 컷인 동안은 스프라이트 시계도 멈춘다 (그 턴 한 번 동작이 컷인 뒤에 공과 함께 돈다)
      fps = fps ? fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
      advance(dt);
      tickBanner(dt);
    }
    if (!alive()) { stop(); return; }
    if (viewState === 'lost' && retryLeft > 0) {
      retryLeft -= dt;
      if (retryLeft <= 0) makeView();
    }
    if (view && retries > 0) {
      viewAge += dt;
      if (viewAge >= T.stable) retries = 0; // 다시 만든 view 가 버텼다 → 다음 잃음은 처음부터 센다
    }
    drawUlt(); // 필살기 버튼 (턴 · 단계 · 입력 줄이 바뀔 때만) — 준비 고리 (readySet) 를 frame 보다 먼저
    const frame = currentFrame();
    if (mom) frame.aim = momentAim(); // 결정의 순간: 밝힌 카드의 화살표 (캔버스 — 글자 없음)
    if (!hold) camStep(frame, dt || 16); // 턴 전 컷인 동안 카메라는 step 전 자리 (골 턴의 전체 화면으로 미리 빠지지 않게)
    drawHud();
    drawName(frame);
    drawMomTags(frame);
    drawEmotes(frame, dt);
    if (view) {
      const sig = `${frame.turn}|${frame.alpha.toFixed(3)}|${goal && goal.kickoff && acc >= goal.scene ? 'k' : ''}|${cam.cx.toFixed(1)}|${cam.cy.toFixed(1)}|${cam.z.toFixed(3)}|${[...readySet].join(',')}|${frame.aim?.key ?? ''}`;
      if (sig !== drawSig || view.dirty || view.animating) {
        drawSig = sig;
        try {
          view.draw(frame, cam, { clock: animClock, speed: speedOf(), turnMs: turnMs() });
          frames += 1;
          if (frames % 30 === 1 && typeof view.stats === 'function') texStats = view.stats();
        } catch (e) {
          console.warn('육각 경기장 그리기 실패', e);
        }
      }
    }
    HEX_DEBUG = {
      renderer: viewState, fps: Math.round(fps), turn: state.turn, steps, stage: state.stage, finished: !!state.finished,
      frames, speed: speedOf(), cam: { ...cam }, score: { ...state.score }, resultShown, tex: texStats,
      sprites: view && typeof view.playing === 'function' ? view.playing() : null,
      ult: ultDebug(),
      moment: momentDebug(),
      emotes: emotes.map((m) => ({ key: m.key, side: m.side, id: m.id, kind: m.kind, text: m.text, left: Math.round(m.left), dur: Math.round(m.dur), x: m.x, y: m.y, drop: Math.round((m.drop || 0) * 10) / 10, lift: m.lift, paused: m.el.classList.contains('hx-paused') })),
    };
    rafId = raf(loop);
  }

  /** 디버그 (HEX_DEBUG.ult — 시험 · tools/hex_shot.mjs --ult): 사람 쪽 · 입력 줄 · 기록 수 · 지금 컷인 카드 · 남은 카드 · 턴 뒤 역컷인 수 */
  function ultDebug() {
    return {
      side: humanSide, queued: [...queued].map(([playerId, op]) => ({ playerId, op })), inputs: inputs.length,
      cut: cutCur ? { kind: cutCur.card.kind, left: Math.round(cutCur.left), rev: cutCur.card.kind === 'reverse' ? cutCur.card.rc?.kind : null } : null,
      cutsLeft: cutQ.length, post: postCuts.length, hold: !!hold, comboWait: comboWait ? Math.round(comboWait.left) : null,
    };
  }

  /** 디버그 (HEX_DEBUG.moment — 시험 · tools/hex_shot.mjs --moments): 열린 장면 · 카드 · 밝힘 · 고른 것 · 켜기 상태 */
  function momentDebug() {
    return {
      on: momentsOn(), intervene: !!ui.hexIntervene, opened: momCount, engine: state.moment ? { kind: state.moment.kind, playerId: state.moment.playerId } : null,
      open: mom ? {
        kind: mom.view.kind, playerId: mom.view.playerId, manual: mom.manual, turn: mom.turn, sel: mom.sel,
        cards: mom.view.cards.map((c, i) => ({ key: momCard(i).key, kind: c.kind, label: momCard(i).label, p: momCard(i).p, auto: !!momCard(i).auto, star: !!c.star })),
        aim: mom.aim ? { kind: mom.aim.kind, tone: mom.aim.tone } : null,
        camT: mom.cam ? { ...mom.cam } : null, carrier: mom.view.carrier ? { side: mom.view.carrier.side, id: mom.view.carrier.id } : null,
      } : null,
      pick: momPick ? { key: momPick.key, kind: momPick.kind } : null,
    };
  }

  /* ---- 시작 ---- */
  drawSpeed();
  drawCtl();
  drawHud();
  buildUltBar();
  drawUlt(true);
  safe(preloadCutArt);
  HEX_DEBUG = { renderer: 'pending', fps: 0, turn: state.turn, steps, stage: state.stage, finished: !!state.finished, frames: 0, speed: speedOf(), cam: { ...cam }, score: { ...state.score }, resultShown, ult: ultDebug(), moment: momentDebug() };
  makeView();
  rafId = raf(loop);
  if (state.finished) showResult();
}

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                  */
/* ------------------------------------------------------------------ */
/** 새로고침 (엔진 판 안내 [새로고침]) */
function reloadPage() {
  try { globalThis.location?.reload?.(); } catch (e) { console.warn('새로고침 실패', e); }
}
/** 엔진이 경기를 못 돌릴 때 (판이 안 맞음) — 안내 + [새로고침] · [처음으로] */
function staleScreen(ctx) {
  return h('div', { class: ['screen', 'match-screen', 'hex-screen'], dataset: { screen: 'match' } },
    h('div', { class: ['error-panel', 'hx-stale-panel'] }, STALE_MSG),
    h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
      h('button', { class: 'btn btn-primary hx-stale-btn', type: 'button', onclick: () => reloadPage() }, '새로고침'),
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.actions.resetToStart() }, '처음으로')));
}
function errorScreen(msg, ctx) {
  return h('div', { class: ['screen', 'match-screen', 'hex-screen'], dataset: { screen: 'match' } },
    h('div', { class: 'error-panel' }, msg),
    h('button', { class: 'btn', onclick: () => ctx.actions.resetToStart() }, '처음으로'));
}
