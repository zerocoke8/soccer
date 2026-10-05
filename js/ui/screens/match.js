// js/ui/screens/match.js — 경기 화면 (phase "match")
//
// v0.2 (ARCHITECTURE §12.3 · GDD v0.4 §9.3~9.7): 화면 위치 = 규칙 위치.
//  - 공·14명의 좌표, 역할, 구역 강조, 배너, 남은 수비는 전부 js/ui/layout.js computeLayout(view) 에서 온다.
//  - 비트 루프 (setInterval 없음): step() → 새 비트 이벤트가 있으면 ① 액션 연출(공 이동) → ② 전원 재배치 → ③ 결과 한 줄
//    → 다음 step 예약. 연출 중에는 step 을 부르지 않는다. 결정 대기(수동·개입)면 재배치까지 보여준 뒤 멈춘다.
//  - 토큰 DOM 은 경기 화면이 살아 있는 동안 유지하고 transform 만 바꾼다 (CSS transition 으로 달려가는 연출).
//
// v0.3 (ARCHITECTURE §13.6 · GDD v0.5 §9.6·9.7·9.16·9.17): 듀얼 개편 화면.
//  - 예상 행동(A안): 상대 듀얼 선수 머리 위 아이콘, 정보 줄에 근거("상대 X: 드리블형 — 드리블 600 > 패스 400")와 우리 선수 예상 행동.
//    상대가 간파를 쓴 듀얼(view.opponentReading)이면 "상대가 우리 수를 읽는 중".
//  - 결정 카드 (아래 가운데 한 줄): 공격은 켜진 액션만 (최대 4), 수비는 3. 제목 "드리블 41%" + 성공/실패 한 줄씩(엔진 Outcome.short) + "추천".
//  - 받는 선수: 후보 전원이 도착 구역에 선다(layout.js). 결정 중 후보 토큰 탭 = 선택, 길게 누르기 = 미니 카드. 결정 { action, receiverId }.
//  - 필살기: 토큰 게이지 링(준비되면 빛남), 스킬 묶음(.skill-row) 필살기 버튼(합체기면 합체기 이름) 토글 → 결정 { …, ultimate: true }.
//    cutin/combo 이벤트 = 3단 연출 (2026-09-29, 아트 전 틀): ① 차지 0.4초(필드 흑백 · 사용자와 듀얼 상대만 색 · 사용자 빛남)
//    ② 전체 화면 컷인 1.0초 — 경기의 첫 필살기만 이 길이, 이후는 합계 1.2초(차지 0.3 + 컷인 0.9). 합체기는 차지 + 두 컷인 + 이름
//    ③ 필살기가 막히면 막은 선수의 역방향 컷인 (아래 2026-09-29 사용자 결정 7 — GK 세이브 · DF 블록 · 필살 패스 차단).
//    전부 배속 비례, ⏭ 스킵 시 생략. 차지 중에는 선 · 배지 층도 흑백 (css .m-field.charging .pitch-svg).
//  - 에이스의 외침 (표시 전용, view.aceCall): 받으면 필살기가 준비 · 합체기가 되는 받는 선수 토큰에 "줘!" 말풍선(금색),
//    공 가진 선수 → 그 선수 금색 점선 + 배지("★ 연결하면 메테오 슛" / "💥 바람의 유성 가능"). 양 팀 공격 모두 — 상대는 먼저
//    커밋하므로 커밋한 받는 선수일 때만 외친다(= 실제로 공이 갈 곳, 엔진 aceCallFor). 같은 받는 선수의
//    미리보기 화살표가 떠 있는 동안은 점선을 숨긴다. 자동 진행이고 우리 자동이 그 선수에게 보내면 정보 줄 "자동: ○○에게 연결 예정".
//  - 간파 버튼(스킬 또는 사용권, 비용·사유) = 즉시 사용({ gaanpa }, 결정 대기 유지). 일반 액티브는 토글 후 액션과 함께.
//  - 연출: 크로스 포물선, 헤더, 연계 문구(킬패스!·원터치!·헤더!·침투!), 태클 실패 누운 모습, 필살기 공.
//  기대 %·결과·후보·게이지는 전부 엔진 getMatchView 값이다. 이 파일은 규칙을 다시 계산하지 않는다.
//
// 2026-09-29 (사용자 결정): 짝 표 크로스 ↔ 버티기 (짝 칩은 view.counter), ④ 박스 연결.
//  - ④ 결정 카드: 슛 + "컷백 → ○○"(→ 원터치 슛) + "센터링 → ○○"(크로서만 → 헤더). % = 득점 기대 (연결 성공 × 받은 선수 골),
//    받는 선수는 박스 안 후보 토큰 탭(▾), 필살 패스 토글 가능 (받는 선수가 필살 슛 보유자면 합체기 이름).
//  - 미리보기: 박스 안 짧은 패스(점선) · 센터링(포물선) + GK 가 튀어나오는 길(흰 점선), 끝 글자 = 원터치 슛 / 헤더.
//  - 연출: 성공 = 받은 선수에게 (컷백! · 센터링!), GK 는 조금 튀어나왔다 복귀 → 받은 선수가 GK 와 1:1.
//    실패 = GK 가 길목으로 튀어나와 잡음(🧤) → 세이브와 같은 흐름 (그 GK 의 배급).
//  - ④ 자동 규칙 = 기대 골 비교 (연결 성공 × 받은 선수 골 > 지금 슛 골일 때만 연결 — 엔진 boxLinkEval). 추천(엔진 recommended) = 자동 선택,
//    정보 줄 "우리: …" 도 같은 선택. 자동 진행 카드의 값 = 기대 골 %.
//
// 2026-09-29 (사용자 결정 3~7):
//  - GK 배급 (view.phase "distribution" · view.distribution): 세이브 · 박스 연결 차단 뒤 GK 가 자기 박스에서 공을 든다 (layout.js
//    distributionLayout — 팀은 빌드업 모양, 받는 선수 후보 = 짧은 패스 DF · 롱패스 MF, 롱패스를 다투는 상대 MF = 듀얼 수비 자리).
//    사람이 고를 차례(needsDecision "distribution")면 카드 두 장 "짧은 패스 100% (빌드업부터)" · "롱패스 p% (성공 중원부터 / 실패 상대 중원 공격)"
//    + 스킬 묶음의 캐논 킥 토글 (롱패스와만) → 결정 { action: "short"|"long", skillId? }. 자동 · 상대 배급은 자동 카드(자동 선택 표시),
//    상대 GK 머리 위 말풍선 = 상대 배급 (엔진 distribution.auto — 결정적). 연출: 짧은 패스 = DF 에게 땅볼, 롱패스 = 중원 MF 에게 포물선
//    + 낙하 지점 경합 (성공: 우리 MF 가 잡음 · 상대 MF 뒤로 / 실패: 상대 MF 가 끊음 — 이벤트 "turnover" distribution: true → 세컨드볼).
//  - 결정타 칩 (클래시 바 1단계, 표시 전용 — 판정 이벤트 decisive · upset): 결과 한 줄 맨 앞에 승자 쪽으로 가장 크게 기운 요인
//    ("짝 적중 ×1.7" · "킬패스 +20%" · "필살 ×2" · "제쳐짐 +25%"), 색 = 종류 (labels.js DECISIVE_KINDS), 이변(승자 확률 < 30%)이면 금색 "대이변!".
//    SHOW_DECISIVE_CHIP 하나로 끈다 (css .dchip). 결과 한 줄의 수명은 그대로 (4x 에서는 칩도 짧게 — 등장 애니메이션 없음).
//  - 마지막 공격 보장 (view.lastAttack): 추가 포제션이 시작되면 배너 "⏱ 추가시간 — 마지막 공격!" (금색), 그 포제션 동안 헤더 줄 "⏱ 추가시간".
//    그 포제션이 끝나면 엔진이 경기를 끝낸다 (결과 모달).
//  - 역방향 컷인 (이벤트 reverseCutin): 필살기가 막히면 막은 선수의 컷인 — GK 세이브 "기적의 세이브!" · 필드 수비 블록 "철벽 블록!" ·
//    필살 패스 차단 "필살 패스 차단!". 경기의 첫 역방향 컷인 0.8초, 이후 0.7초 (배속 비례, ⏭ 스킵 시 생략).
// 2026-09-30 (리뷰 수정 — 표시만): 롱패스 실패 결과 한 줄 "끊은 선수 롱패스 차단! → 역습 시작 선수 세컨드볼" (엔진 starterId) ·
//    경기가 끝났으면 "— 경기 종료" (엔진 matchEnd), 롱패스 경합에 진 선수 이름표 숨김(.tag-off), 캐논 킥 힌트 맨 앞 · 다음 카드
//    "첫 듀얼 +10%" (ballState.pending.nextBonus), 고른 배급의 연출 중 정보 줄 "우리 선택: …", 결과 한 줄은 공 위 · 아래 자리부터.
//
// 2026-10-01 도전 모드: 경기 모드 훅 ctx.matchMode (js/ui/app.js challengeMatchMode). 없으면 런 경기 그대로 (아래 renderMatch 머리).
//    셋업 · 저장 · 결과 [확인] · 경기 종류 글자만 바꾸고, 도전 모드면 오른쪽 위에 [나가기] [포기] 버튼, 오류 화면에 [도전 경기 버리기]. 규칙 · 연출은 같다.
//
// 2026-10-04 §19 (K4 — 브랜치 outgame-lesson, 선수 16명 · 전원 필살기): 필살기 종류 6개 (슛 · 패스 · 세이브 · 드리블 · 수비 · 호령).
//  - 스킬 줄 필살기 버튼은 공격 · 수비 결정 모두 (.ult-btn.ut-<type>, title = 종류 · 등급 · 설명 · 대사). 호환 액션 ultCompatible =
//    엔진 skills.ultMatchesAction 과 같은 규칙 (드리블 = 드리블, 수비 = 태클 · 인터셉트 · 버티기, 호령 = 전부, 패스 = ultimate.actions).
//  - 컷인 (E5): 작은 줄 "이름 · [종류 칩 .cut-type.ut-<type>]", 큰 이름, 대사 한 줄 .cut-line (이벤트 line). 등급 클래스 .tier-R|SR|SSR
//    (R 띠 · 얼굴 · 이름이 작다), 길이 CUT_TIER (R 0.2+0.6 / SR 0.3+0.8 / SSR 0.4+1.0초, 그 뒤 0.15+0.5 / 0.25+0.7 / 0.3+0.9).
//    이벤트에 tier · line 이 없으면 (옛 저장본) SSR 길이 · 대사 없음. 합체기는 두 컷인(대사 포함) + 이름 그대로.
//  - 합체기 이름은 등록된 짝만 (combos.json — "합체기" 폴백 없음). 필살 드리블 한 구역 더 = 드리블 화살표가 도착 단계까지 + "두 구역 전진".
//  - 확정 배급 (필살 세이브 sureDistribution): 롱패스 카드 % 칸 "확정", 실패 줄 "실패 없음 (확정)", 힌트 = 필살기 이름, 정보 줄 · 화살표도 확정.
//  - 팀 필살기 로그 줄 (.ev-teamUlt), 결과 한 줄 "필살 태클!" (필살 수비) · "확정 롱패스".
//
// 2026-10-05 일러스트 (LESSON_PROTO_PLAN §24.12.3 · 24.12.4, U2 — 이 슬라이스만 경기 화면을 고친다, layout.js 그대로):
//  - 얼굴: 토큰 .tok-face (44) · 미니 카드 얼굴 = 스냅샷 charId 의 얼굴 그림 (store.match[side].players — 우리 팀 늘, 상대는 도전 모드처럼 charId 가
//    있고 목록에 그림이 있을 때만). 그림 없는 상대는 지금 글자 칸 (원정 = 둥근 네모). 글자는 DOM 에 남는다 (dom.setFaceArt · avatar art).
//  - 컷인 (art.cutArt — .cut-face 가 그림 칸): SSR (등급 없는 합체기 두 장 포함) = 반신 260×390 이 자기 편 쪽에서 미끄러져 들어와 띠 위에 선다,
//    SR = 흉상 180×225 창 (띠 위로 약 50px), R = 지금 64 원에 얼굴. 역방향 컷인 = 막은 선수 흉상 (+4° 기울기), 합체기 이름 카드 = 두 선수 흉상 양쪽.
//    그림은 뒤집지 않는다 (object-position). 화면이 열릴 때 필살기 보유자의 반신 · 흉상 · 얼굴 + 다른 선수 흉상 (역방향)을 미리 불러 둔다.
//
// 2026-10-05 L54 (LESSON_PROTO_PLAN §25): 스루 패스 = 두 구역 패스 → 패스 미리보기 끝 글자 "→ 상대 진영 · 두 구역 전진" (엔진 outcome
//  success.step 이 한 구역 너머일 때). 라인 브레이커 = ③ 돌파 → 박스 슛 ×1.5 — 카드 문구 · % 는 엔진 변형(outcomesBySkill · skills[].expectedPct)
//  그대로, 화면 코드는 바뀌지 않는다.
//
// 2026-10-05 2.5D 모드 (docs/SPRITE_25D_PLAN.md §3 · §4 — D1, 브랜치 outgame-sprite): store.isD25() (주소 ?d25=1 · /sprite/ 사이트, ?flat=1 = 끔)
//  이면 화면을 만들 때 .match-screen.d25 — 평면 모드 (테스트 · 로컬 기본) 는 그대로다. 규칙 · 엔진 · layout.js 는 같고 그리는 법만 다르다.
//  - 좌표: toPx / fromPx / dirPx = js/ui/view25.js 원근 투영 (판 → 화면 호모그래피). 잔디 그림 · 구역 · 선 (.pitch-bg) 은 판 div (.w-ground) 안에
//    필드 % 그대로 두고 판 div 를 CSS matrix3d (같은 행렬) 로 눕힌다. 골대 = 판 위에 선 SVG (project3), 먼 쪽 배경 띠 (.w-strip) · 하늘 (.w-sky).
//  - 카메라 층 .w-cam (.m-field 안 — 판 · 띠 · 골대 · 토큰 · 공 · 화살표 · 글자 층): D1 은 확대 없이 전체 (z = 1). 차지 막 · 골 연출은 카메라 밖.
//  - 토큰 = 발 기준 (앵커 = 발): 발밑 타원 (.tok-ground — 팀 색 · 역할 고리), 선 그림 (.tok-figure — data/sprites.json 에 있으면 스프라이트,
//    없으면 얼굴 원 스탠디), 체력 바 · 이름표 = 발 아래, 말풍선 = 머리 위. 크기 = 깊이 배율 s, 겹침 = 화면 y 순 (z-index 100 + sy),
//    방향 = 공 가진 선수는 공격 방향 · 나머지는 공 쪽 (.face-l = 그림만 좌우 반전). 이름표 · 말풍선 자리 상자 (tokenRect · labelCands ·
//    bubbleCands) 는 토큰에 단 변수 (--fh 키 · --fhw 반폭 · --ny 이름표 위 끝 …) 와 같은 숫자 — CSS 가 그리는 자리 = JS 상자.
//  - 배치 간격: computeLayout(aspect = FD / FL, tokenSize = 46 / FD) — 판 px 기준 46 (몸 폭) 떨어지게.
//  - 공: 발 앞 (투영한 공격 방향), 크기 s 배, 바닥 그림자. 크로스 · 롱패스 = 바닥 직선 위로 뜨는 포물선 (화살표 · 궤적 · 공이 같은 곡선 curveCtrl).
//
// 가로 전용 (고정 스테이지 1280×720 — js/ui/stage.js, css/match.css). 세로 경기 화면·방향 전환은 없다 (?orient · 저장값은 무시).
//  - 필드 좌표(layout.js)는 그대로, 픽셀 변환만 가로 (layout.js fieldToScreen 'land' — home 골 왼쪽, away 골 오른쪽, 필드 x 0 = 위).
//    화면에 그리는 좌표는 전부 toPx(x, y) 를 거친다.
//  - 화면 = 잔디(.pitch)가 스테이지 전체, HUD 는 그 위에 겹친다 (사용자 목업):
//      위 가운데 = 스코어 헤더(.mh), 그 뒤 전폭 띠 = 상황 배너(.m-banner — 글자는 헤더 왼쪽 빈 곳), 헤더 아래 = 공격 진행 트랙(.m-track, 칸 = 구역 폭)
//      아래 가운데 = 정보 줄(.m-info, 상대 예상 행동 근거) + 결정 카드 한 줄(.action-grid)
//      왼쪽 아래 = 컨트롤 묶음(.match-controls: 자동 · 개입 · 배속 · ⏭ · 로그) + 남은 수비 칩, 오른쪽 아래 = 스킬 묶음(.skill-row)
//      로그(.m-logbox) = 로그 버튼으로 여는 반투명 서랍 (기본 닫힘, 안쪽 스크롤, 공 · 공격 방향의 반대쪽 절반 — placeLogBox)
//  - 규칙 영역(.m-field: 구역·선·박스·골문·토큰·공·화살표)은 위 HUD(헤더+트랙)와 아래 HUD(카드 줄) 사이로 줄인다 → HUD 가 토큰·이름표·말풍선·
//    미리보기를 가리지 않는다. 구역·선과 토큰이 같은 사각형을 쓴다 (화면 위치 = 규칙 위치). 크기는 논리 px 로 잰다 (스테이지 배율과 무관).
import { h, avatar, openModal, closeOverlays, bar, statBadge, toast, setFaceArt } from '../dom.js';
import { portraitUrl, portraitUrls, preloadArt, cutArt, spriteOf } from '../art.js';
import { saveMatch, isD25 } from '../store.js';
import { computeLayout, resolvePreview, withJosa, ZONES, SHAPE, fieldToScreen, screenToField } from '../layout.js';
import * as L from '../labels.js';
import * as V from '../view25.js';

const BEAT_FALLBACK = ['kickoff', 'counter', 'duel', 'turnover', 'save', 'goal', 'penalty', 'distribution'];
// 액션 연출(공 이동)이 있는 비트. distribution = GK 배급 (짧은 패스 · 롱패스 성공 — 롱패스 실패는 turnover)
const ACTION_BEATS = new Set(['duel', 'turnover', 'save', 'goal', 'penalty', 'distribution']);
// 1x 기준 ms. GDD §9.4: 액션 0.8 + 재배치 0.65 + 결과(읽는 시간) 0.95 ≈ 비트당 2.4초. 2x·4x 는 1/speed 로 비례 단축.
// 필살기 (GDD v0.5 §9.17-5, 2026-09-29): 차지 0.4 + 컷인 1.0 (경기의 첫 필살기), 이후 차지 0.3 + 컷인 0.9 = 1.2초.
// 합체기 = 차지 + 두 컷인 1.0초씩 + 이름 1.1초. 필살기가 막히면 역방향 컷인 0.8초 (경기의 첫 역방향 컷인), 이후 0.7초.
const T = {
  act: 800, move: 650, result: 950, hold: 250, goal: 900,
  revCut: 800, revCutShort: 700, comboCut: 1000, comboName: 1100, // 필살기 차지 · 컷인 = 아래 CUT_TIER (등급별, §19.8)
  start: 700, idle: 300, longPress: 450,
};
// §19.8 (E5) 등급별 컷인 길이 (1x ms): 경기 첫 필살기 = charge + cut, 그 뒤 = chargeShort + cutShort. 이벤트에 tier 가 없으면
// (옛 경기 저장본) SSR 길이. 합체기(두 컷인 + 이름)와 역방향 컷인은 위 T 그대로
const CUT_TIER = {
  SSR: { charge: 400, chargeShort: 300, cut: 1000, cutShort: 900 },
  SR: { charge: 300, chargeShort: 250, cut: 800, cutShort: 700 },
  R: { charge: 200, chargeShort: 150, cut: 600, cutShort: 500 },
};
const tierOf = (ev) => (ev && CUT_TIER[ev.tier] ? ev.tier : null);
// 필살기 연출의 바닥 길이 (ms, 배속 반영 뒤). 4x 에서도 걸리지 않게 둔다 — 4x = SSR 차지 100/75 · 컷인 250/225, R 차지 50/37.5 ·
// 컷인 150/125 · 역방향 컷인 200/175 (바닥에 걸리면 "첫 필살기 > 이후"와 배속 비례가 무너진다)
const CUT_MIN = { charge: 30, card: 120 };
// 결정타 칩 (클래시 바 1단계 — 사용자 테스트용): false 면 결과 한 줄에 칩 · "대이변!" 을 붙이지 않는다 (css .dchip · .dchip-upset 도 같이 지우면 된다).
// matchUi.decisiveChip = false 로도 끌 수 있다 (테스트용)
export const SHOW_DECISIVE_CHIP = true;
// 역방향 컷인 문구 · GK 배급 선택지: 엔진 match.REVERSE_CUTIN_TEXT · match.DISTRIBUTION_ACTIONS 를 쓴다 (renderMatch 안).
// 아래는 엔진 모듈에 없을 때(옛 번들 · 테스트 대역)의 대체값 — 이벤트 reverseCutin.text 가 먼저
const REVERSE_FALLBACK = { save: '기적의 세이브!', block: '철벽 블록!', passCut: '필살 패스 차단!' };
const DIST_FALLBACK = ['short', 'long'];
// 에이스의 외침 말풍선 글자
const ACE_BUBBLE = '줘!';
// 토큰 지름 = 필드 폭(골과 나란한 쪽 = 규칙 영역 높이) × 8.3%, 30~48px. 스테이지 1280×720: 규칙 영역 1244×528 → 44px
const TOKEN = { ratio: 0.083, min: 30, max: 48 };
// 글자 크기 (px) — CSS 와 같게 (자리 고르기의 글자 폭 추정 textWidth 에 쓴다): 이름표 · 말풍선 · 미리보기 글자 · 결과 한 줄 · 연계 문구
const FONT = { label: 12, bubble: 12, tip: 12.5, pop: 13, link: 16, chip: 11.5 };
const SPEEDS = [1, 2, 4];
const SVG_NS = 'http://www.w3.org/2000/svg';
// 2.5D 판 그림 (docs/SPRITE_25D_PLAN.md §2): 위에서 본 잔디 (필드 사각형에 맞춰 판 전체에 깐다) · 먼 쪽 배경 띠
const GRASS_URL = './img/sprites/grass_top.webp';
const STRIP_URL = './img/sprites/far_strip.webp';
const STEP_MARKS = ['①', '②', '③', '④'];
const RECV_ACTIONS = ['pass', 'cross'];
const ACTION_ORDER = ['dribble', 'pass', 'cross', 'shoot', 'tackle', 'intercept', 'hold', 'save'];
const MATCH_VERSION = 3; // §13.2-14: 이보다 낮은 저장 경기는 새로 만든다

/* ④ 박스 연결 (2026-09-29): 슈팅 찬스(lineIndex 3)의 패스 = 컷백 (→ 받은 선수 원터치 슛), 크로스 = 센터링 (크로서만 → 헤더).
   연결 자체가 GK 와의 듀얼 — 성공하면 공은 박스 그대로 받은 선수에게, 실패하면 GK 가 잡는다 (세이브와 같음). 포제션당 1회. */
const isBoxLink = (view, action) => Number(view?.lineIndex) >= 3 && (action === 'pass' || action === 'cross');
/**
 * 액션 표시 이름 · 아이콘: ④ 박스 연결은 짧은 이름 (컷백 · 센터링). 우리 슛은 엔진 액션 이름 (센터링을 받은 뒤 "헤더",
 * 파이널 서드 "중거리 슛") — 결정·성향 카드와 정보 줄이 같은 이름을 쓴다
 */
const shootLabel = (view) => (view?.actions || []).find((a) => a.action === 'shoot')?.label;
const actName = (view, action) => (isBoxLink(view, action)
  ? L.BOX_LINK_LABELS[action]
  : (action === 'shoot' && shootLabel(view)) || (L.ACTION_LABELS[action] ?? action));
const actIcon = (view, action) => (isBoxLink(view, action) ? L.BOX_LINK_ICONS[action] : L.ACTION_ICONS[action] ?? '');
/** 짝 표 (공격 → 짝이 맞는 수비): 엔진 view.counter (크로스 ↔ 버티기), 없으면 labels.js 사본 */
const counterOf = (view) => (view?.counter && typeof view.counter === 'object' ? view.counter : L.COUNTER);
/** GK 배급 대기 view 의 distribution (엔진 view.distribution — phase "distribution", 종료 전), 아니면 null */
const distOf = (view) => (view && !view.finished && view.phase === 'distribution' && view.distribution && typeof view.distribution === 'object'
  ? view.distribution : null);

let GEN = 0; // renderMatch 호출마다 증가 → 이전 경기 화면이 예약한 콜백을 무효화

export function renderMatch(root, ctx) {
  const { store, data, match, safe, actions } = ctx;
  const ui = store.matchUi;
  const cfg = data.config || {};
  // 경기 모드 훅 (도전 모드). 없으면 런 경기: run.getMatchSetup · saveMatch('soccer.match') · actions.finishMatch · KIND_LABELS
  //   { label?: 헤더 줄 · 결과 제목의 경기 종류 글자, getSetup?(): 셋업, save?(ms | null): 저장, onFinish?(result): 결과 [확인],
  //     exits?: [{ label, title?, danger?, onClick() }] — 오른쪽 위 버튼들 (도전: [나가기] [포기]),
  //     discard?: { label, title?, onClick() } — 오류 화면(경기를 만들 수 없음)에 더하는 버튼 (도전: [도전 경기 버리기]) }
  const mode = ctx.matchMode && typeof ctx.matchMode === 'object' ? ctx.matchMode : null;
  const persist = typeof mode?.save === 'function' ? mode.save : saveMatch;
  const kindLabel = (kind) => mode?.label ?? L.KIND_LABELS[kind] ?? kind ?? '';
  const exits = (Array.isArray(mode?.exits) ? mode.exits : []).filter((x) => x && typeof x.onClick === 'function');
  const BEATS = new Set(Array.isArray(match.BEAT_TYPES) && match.BEAT_TYPES.length ? match.BEAT_TYPES : BEAT_FALLBACK);
  const REVERSE_TEXT = match.REVERSE_CUTIN_TEXT && typeof match.REVERSE_CUTIN_TEXT === 'object' ? match.REVERSE_CUTIN_TEXT : REVERSE_FALLBACK;
  const DIST_ACTIONS = Array.isArray(match.DISTRIBUTION_ACTIONS) && match.DISTRIBUTION_ACTIONS.length ? match.DISTRIBUTION_ACTIONS : DIST_FALLBACK;
  const wantVersion = Number(match.MATCH_VERSION) || MATCH_VERSION;
  const gaugeMax = Number(cfg.match?.ultimate?.gaugeMax) || 100;
  if (!ui.receiverPick || typeof ui.receiverPick !== 'object') ui.receiverPick = {};

  if (store.match && !((Number(store.match.version) || 0) >= wantVersion)) {
    // 이전 규칙(v0.2 이하)으로 저장된 경기: 상태 모양이 달라 이어서 진행할 수 없다 → 새로 만든다 (§13.2-14)
    store.match = null;
    persist(null);
    toast('이전 버전에서 저장된 경기라 새로 시작합니다.', 'info', 3000);
  }
  if (!store.match) {
    const setup = safe(() => (typeof mode?.getSetup === 'function' ? mode.getSetup() : ctx.run.getMatchSetup(store.run, data)));
    if (!setup) { root.append(errorScreen('경기 정보를 불러올 수 없습니다.', ctx, mode)); return; }
    const ms = safe(() => match.createMatch({
      data, seed: setup.seed, home: setup.home, away: setup.away, possessions: setup.possessions, kind: setup.kind,
    }));
    if (!ms) { root.append(errorScreen('경기를 생성할 수 없습니다.', ctx, mode)); return; }
    store.match = ms;
    persist(ms);
    ui.intervene = false;
    ui.selectedSkillId = null;
    ui.ultimate = false;
    ui.receiverPick = {};
    ui.pickKey = null;
    ui.resultShown = false;
    ui.logOpen = false;
  }
  ui.busy = false;

  const gen = ++GEN;
  // 2.5D 모드 (docs/SPRITE_25D_PLAN.md §4): 화면을 만들 때 한 번 정한다 (경기 중에는 바뀌지 않는다)
  const d25 = isD25();
  // 로그 서랍 열림 (matchUi.logOpen): 한 경기 안에서는 경기 화면을 다시 그려도 유지, 새 경기(위 · store.resetMatchUi)는 닫힌 채 시작
  if (typeof ui.logOpen !== 'boolean') ui.logOpen = false;

  /* ------------------------------------------------------------------ */
  /* DOM 골격 (한 번 만들고 부분 갱신)                                        */
  /* ------------------------------------------------------------------ */
  const screen = h('div', { class: ['screen', 'match-screen', d25 ? 'd25' : ''], dataset: { screen: 'match' } });
  const hud = h('div', { class: 'mh' });
  // 상황 배너: 전폭 띠(헤더 뒤), 글자는 헤더 왼쪽의 보이는 칸에
  const bannerTxt = h('span', { class: 'm-banner-txt' });
  const bannerEl = h('div', { class: 'm-banner', role: 'status', 'aria-live': 'polite' }, bannerTxt);
  const trackCells = STEP_MARKS.map((mk, i) => h('span', { class: 'trk', dataset: { step: String(i) }, title: `${mk} ${L.ATTACK_STEP_LABELS[i]}` }, mk));
  const track = h('div', { class: 'm-track', role: 'img' }, trackCells);
  const zoneEls = new Map();
  // 구역 = 세로 줄 (home 골 왼쪽). 박스·골문·스폿: .top = away 골(오른쪽), .bottom = home 골(왼쪽)
  const bg = h('div', { class: 'pitch-bg' },
    ZONES.map((z) => {
      const el = h('div', {
        class: ['zone', `z${z.id}`],
        dataset: { zone: String(z.id) },
        style: { left: `${z.from}%`, width: `${z.to - z.from}%` },
      }, h('span', { class: 'zone-name' }, z.name), h('span', { class: 'zone-hl' }));
      zoneEls.set(z.id, el);
      return el;
    }),
    h('div', { class: 'pl-half' }), h('div', { class: 'pl-circle' }),
    h('div', { class: 'pl-box top' }), h('div', { class: 'pl-box bottom' }),
    h('div', { class: 'pl-goal top' }), h('div', { class: 'pl-goal bottom' }),
    h('div', { class: 'pl-spot top' }), h('div', { class: 'pl-spot bottom' }));
  const trailG = svgEl('g', { class: 'g-trail' });
  const arrowG = svgEl('g', { class: 'g-arrow' });
  // 에이스의 외침 점선 (미리보기 화살표 아래 층, hideArrow 가 지우지 않는다)
  const aceG = svgEl('g', { class: 'g-ace' });
  const svg = svgEl('svg', { class: 'pitch-svg', 'aria-hidden': 'true', focusable: 'false' },
    svgEl('defs', {}, arrowMarker('mah-gold', '#ffd166'), arrowMarker('mah-white', '#ffffff')),
    trailG, aceG, arrowG);
  // 미리보기 글자(도착 구역 · 차단 액션 이름)는 토큰 위 층에 — 토큰이 없는 쪽을 골라 놓는다 (tipSpot)
  const tipG = svgEl('g', { class: 'g-tip' });
  const aceTipG = svgEl('g', { class: 'g-ace-tip' }); // 에이스의 외침 배지 (토큰 위 층)
  const svgTop = svgEl('svg', { class: 'pitch-svg top', 'aria-hidden': 'true', focusable: 'false' }, aceTipG, tipG);
  const tokLayer = h('div', { class: 'tok-layer' });
  // 공: 2.5D 는 바닥 그림자(.b-shadow)를 앞에 둔다 (공 글자는 그림자 위로 뜬다 — arcBall)
  const ballIco = h('span', {}, '⚽');
  const ballEl = h('div', { class: 'm-ball', 'aria-hidden': 'true' }, d25 ? h('i', { class: 'b-shadow' }) : null, ballIco);
  const popLayer = h('div', { class: 'pop-layer', 'aria-hidden': 'true' });
  const goalFx = h('div', { class: 'goal-fx', 'aria-hidden': 'true' });
  // 필살기 차지: 잔디 전체를 흑백으로 (사용자 · 듀얼 상대 토큰은 이 막 위에 색 그대로 — css .m-field.charging)
  const chargeVeil = h('div', { class: 'charge-veil', 'aria-hidden': 'true' });
  // 2.5D 월드 층 (§4): 판 div (잔디 그림 + 구역 · 선 = .pitch-bg, matrix3d 로 눕힌다) · 먼 쪽 배경 띠 · 서 있는 골대 SVG 를
  // 카메라 층 .w-cam 에 토큰 · 공 · 화살표 · 글자 층과 함께 둔다 (크기 · 자리는 layoutWorld). 하늘은 잔디(.pitch) 맨 뒤
  const groundEl = d25 ? h('div', { class: 'w-ground' }, bg) : null;
  const stripEl = d25 ? h('div', { class: 'w-strip', 'aria-hidden': 'true' }) : null;
  const goalsSvg = d25 ? svgEl('svg', { class: 'w-goals', 'aria-hidden': 'true', focusable: 'false' }) : null;
  const cam = d25 ? h('div', { class: 'w-cam' }, stripEl, groundEl, goalsSvg, tokLayer, ballEl, svg, svgTop, popLayer) : null;
  // 규칙 영역: 좌표의 기준 사각형 (구역·선·토큰·공·화살표·결과 한 줄). 잔디(.pitch)는 스테이지 전체, 규칙 영역은 위·아래 HUD 사이
  // (2.5D: 차지 막은 카메라 층 뒤 — 판 · 띠 · 골대는 .charging 에서 스스로 흑백, 골 연출은 카메라 밖 위)
  const field = d25 ? h('div', { class: 'm-field' }, chargeVeil, cam, goalFx)
    : h('div', { class: 'm-field' }, bg, chargeVeil, tokLayer, ballEl, svg, svgTop, popLayer, goalFx);
  const grass = h('div', { class: 'pitch' }, d25 ? h('div', { class: 'w-sky', 'aria-hidden': 'true' }) : null, field);
  // 아래 가운데: 정보 줄(상대 예상 행동 근거) + 결정 카드 한 줄
  const info = h('div', { class: 'm-info' });
  const actGrid = h('div', { class: 'action-grid' });
  const dock = h('div', { class: 'm-dock' }, info, actGrid);
  // 왼쪽 아래: 컨트롤 묶음 + 남은 수비 칩 · 오른쪽 아래: 스킬 묶음
  const controls = h('div', { class: 'match-controls' });
  const remainEl = h('div', { class: 'm-remain' });
  const ctlBox = h('div', { class: 'm-ctl' }, controls, remainEl);
  const skillRow = h('div', { class: 'skill-row' });
  // 로그 서랍 (로그 버튼으로 연다, 안쪽 스크롤)
  const log = h('div', { class: 'match-log', role: 'log', 'aria-label': '경기 로그' });
  const logBox = h('div', { class: 'm-logbox', id: 'm-logbox' },
    h('div', { class: 'm-logbox-head' },
      h('b', {}, '경기 로그'),
      h('button', { class: 'btn m-logbox-close', type: 'button', title: '로그 닫기', 'aria-label': '로그 닫기', onclick: () => setLogOpen(false) }, '✕')),
    log);
  const cutLayer = h('div', { class: 'm-cutin', 'aria-live': 'polite' });
  screen.append(grass, bannerEl, hud, track, dock, ctlBox, skillRow, logBox);
  // 경기 모드 나가기 버튼들 (도전: [나가기] [포기]): 상황 배너 띠의 오른쪽 빈 곳. 런 경기에는 없다
  if (exits.length) {
    screen.append(h('div', { class: 'm-exits' }, exits.map((x) => h('button', {
      class: ['btn', 'btn-sm', 'm-exit', x.danger ? 'danger' : ''], type: 'button', title: x.title || '', onclick: () => x.onClick(),
    }, x.label || '나가기'))));
  }
  screen.append(cutLayer);
  root.append(screen);

  /* ------------------------------------------------------------------ */
  /* 상태                                                                 */
  /* ------------------------------------------------------------------ */
  let W = 1244; // 규칙 영역 픽셀 크기 (논리 px — 레이아웃이 없는 jsdom 은 스테이지 기준 기본값)
  let H = 528;
  let tokPx = 44;
  let curL = null;      // 지금 화면에 그려진 레이아웃
  let curView = null;   // curL 을 만든 view
  let busy = false;     // 비트 연출 중
  let bannerKey = null;
  let arrowFor = null;
  let finishing = false;
  let ballAnim = null;       // 크로스 포물선 (Web Animations)
  let lastDecision = null;   // 사람이 보낸 마지막 결정 (실패한 패스의 받는 선수 연출용)
  let cardModal = null;
  let tagBoxes = [];         // 이름 라벨·말풍선이 놓인 자리 (픽셀 박스)
  let laShown = null;        // 마지막 공격 배너를 띄운 추가 포제션 ("stage|possession") — 첫 배너만 "⏱ 추가시간 — 마지막 공격!"
  let curAce = null;         // 지금 그린 에이스의 외침 (aceInfo) — 같은 받는 선수의 미리보기 화살표면 점선을 숨긴다
  let aceSig = null;         // 점선 모양 서명: 같으면 다시 그려도 페이드 없이
  const tokEls = new Map();
  const timers = new Set();
  const reduced = prefersReducedMotion();

  const alive = () => gen === GEN && screen.isConnected;
  const fx = () => 1 / (Number(ui.speed) || 1);
  const isFinished = () => safe(() => match.isFinished(store.match)) === true;
  const getView = () => {
    const v = safe(() => match.getMatchView(store.match, data, 'home'));
    if (v) syncDecisionUi(v);
    return v;
  };
  const paused = (view) => !!(view?.needsDecision && (!ui.auto || ui.intervene));
  const canDecideNow = (view) => !busy && !isFinished() && paused(view);
  const humanOf = (view) => (view?.humanSide === 'away' ? 'away' : 'home');

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); if (alive()) fn(); }, Math.max(0, ms));
    timers.add(id);
    return id;
  }
  function cancelTimers() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
  }
  function setBusy(v) { busy = v; ui.busy = v; }

  /* ------------------------------------------------------------------ */
  /* 결정 토글 (스킬 · 필살기 · 받는 선수)                                     */
  /* ------------------------------------------------------------------ */
  /** 결정(듀얼) 식별자: 판정이 일어나면 바뀐다. 간파 부분 커밋(비트 없음)으로는 바뀌지 않는다 */
  function decisionKey(view) {
    const d = distOf(view);
    if (d) return ['dist', view.possession, view.lastBeat?.seq ?? -1, d.side, d.gkId].join('|'); // GK 배급 결정
    if (!view || view.phase !== 'decision') return null;
    return [view.possession, view.lastBeat?.seq ?? -1, view.attackingSide, view.lineIndex, view.carrier?.id ?? '', view.defender?.id ?? ''].join('|');
  }
  /** 토글할 수 있는 일반 액티브: GK 배급이면 배급 스킬(캐논 킥 — 우리 배급일 때만), 아니면 듀얼 당사자의 액티브 */
  function skillList(view) {
    const d = distOf(view);
    if (d) return d.side === humanOf(view) && Array.isArray(d.skills) ? d.skills : [];
    return Array.isArray(view?.skills) ? view.skills : [];
  }
  function syncDecisionUi(view) {
    const key = decisionKey(view);
    if (key !== ui.pickKey) {
      ui.pickKey = key;
      ui.selectedSkillId = null;
      ui.ultimate = false;
      ui.receiverPick = {};
      ui.gaanpaUsedKey = null;
    }
    // 간파 부분 커밋 등으로 쓸 수 없게 된 토글은 푼다
    if (ui.selectedSkillId && !skillList(view).some((s) => s.skillId === ui.selectedSkillId && s.enabled !== false)) ui.selectedSkillId = null;
    if (ui.ultimate && !ultOption(view)?.usable) ui.ultimate = false;
  }
  /** 사람 측 결정 당사자의 필살기 (세이브형 제외 — GK 세이브는 자동) */
  function ultOption(view) {
    const opts = Array.isArray(view?.ultimateOptions) ? view.ultimateOptions : [];
    return opts.find((u) => u && u.type !== 'save') || null;
  }
  /** 엔진 힌트의 받는 선수("→ 이름 · …")는 기본값 기준이라 실제(선택·필살 패스·스킬 변형)와 다를 수 있다 → 떼고 쓴다 */
  function stripRecvHint(hint) {
    return String(hint ?? '').replace(/^→\s*[^·]*·\s*/, '');
  }
  /**
   * 필살기와 함께 고를 수 있는 액션 (§19.14 ③ — 엔진 skills.ultMatchesAction 과 같은 규칙): shot = 슛, pass = ultimate.actions 안
   * (없으면 패스 · 크로스), dribble = 드리블, defense = 태클 · 인터셉트 · 버티기, team = 전부. save 는 버튼이 없다 (GK 세이브 자동)
   */
  function ultCompatible(u, action) {
    if (!u) return true;
    const ult = skillById(u.skillId)?.ultimate || null;
    switch (u.type) {
      case 'shot': return action === 'shoot';
      case 'pass': return (Array.isArray(ult?.actions) && ult.actions.length ? ult.actions : ['pass', 'cross']).includes(action);
      case 'dribble': return action === 'dribble';
      case 'defense': return action === 'tackle' || action === 'intercept' || action === 'hold';
      case 'team': return true;
      default: return false;
    }
  }
  /** 화면에 그릴 미리보기: 사람이 고르는 중이면 토글한 스킬·필살기 변형, 자동 진행 중이면 확정할 수 없는 후보를 뺀다 */
  function shownView(view) {
    if (!view) return view;
    const deciding = paused(view);
    return resolvePreview(view, { skillId: deciding ? ui.selectedSkillId : null, ultimate: deciding && !!ui.ultimate, deciding });
  }
  /** 액션(pass|cross)의 받는 선수: 직접 고른 선수(같은 도착 단계의 후보일 때만) → 없으면 기본값 */
  function recvInfo(view, action) {
    const sv = shownView(view);
    const r = sv?.receivers?.[action];
    if (!r || !Array.isArray(r.candidates) || !r.candidates.length) return null;
    const pick = ui.receiverPick?.[action];
    const picked = pick && r.candidates.includes(pick.id) && pick.arrival === r.arrival ? pick.id : null;
    const defaultId = r.defaultId ?? r.candidates[0];
    return { id: picked || defaultId, defaultId, candidates: r.candidates, arrival: r.arrival, picked: !!picked && picked !== defaultId };
  }
  const nameOf = (view, side, id) => (view?.players?.[side] || []).find((p) => p.id === id)?.name ?? '';
  const skillById = (id) => (Array.isArray(data.skills) ? data.skills.find((s) => s.id === id) : null) || null;

  /* ------------------------------------------------------------------ */
  /* 좌표                                                                 */
  /* ------------------------------------------------------------------ */
  /** 규칙 영역 크기 (논리 px: 스테이지 transform 전 값이라 창 배율과 무관 — 경기 중에는 바뀌지 않는다) */
  function measure() {
    const w = field.clientWidth;
    const hh = field.clientHeight;
    if (w > 40 && hh > 40) { W = w; H = hh; } // jsdom 등 레이아웃이 없으면 기본값
    tokPx = Math.round(Math.min(TOKEN.max, Math.max(TOKEN.min, H * TOKEN.ratio)));
    field.style.setProperty('--tok', `${tokPx}px`);
    svg.setAttribute('viewBox', `0 0 ${round1(W)} ${round1(H)}`);
    svgTop.setAttribute('viewBox', `0 0 ${round1(W)} ${round1(H)}`);
    if (d25) layoutWorld();
  }
  function layoutFor(view) {
    if (!view) return null;
    measure();
    // 겹침 방지 간격 = 토큰 지름 + 팀 링(2px×2) → 링끼리도 닿지 않게. 필드 폭(골과 나란한 쪽) = 요소 높이 H, 길이(골↔골) = 폭 W → aspect = H/W
    // 2.5D: 판 px 기준 — 필드 깊이 FD · 길이 FL, 간격 46 판 px (가까이 선 두 선수가 몸 폭만큼 떨어지게, SPRITE_25D_PLAN §4)
    const geo = d25 ? { aspect: V.V25.FD / V.V25.FL, tokenSize: V.V25.TOK_GAP / V.V25.FD } : { aspect: H / W, tokenSize: (tokPx + 4) / H };
    return safe(() => computeLayout(shownView(view), geo)) || null;
  }
  /** 지금 view 로 다시 배치 (스킬 토글 · 받는 선수 선택 · 자동/개입 전환). 보던 미리보기 화살표도 새 좌표로 */
  function relayout({ anim = !reduced } = {}) {
    if (!curView) return;
    const Lay = layoutFor(curView);
    if (!Lay) return;
    applyLayout(Lay, curView, { anim });
    const keep = arrowFor;
    hideArrow();
    if (keep) showArrow(keep);
  }
  /** 필드 좌표(%) → 규칙 영역 안 픽셀 [sx, sy]: home 골 왼쪽, away 골 오른쪽, 필드 x 0 = 위 (layout.js fieldToScreen 'land') */
  const toPx = d25 ? (x, y) => { const p = V.project(x, y, W, H); return [p.sx, p.sy]; } : (x, y) => fieldToScreen(x, y, W, H, 'land');
  /** 픽셀 → 필드 좌표 { x, y } (2.5D: 바닥 위 점으로 본다) */
  const fromPx = d25 ? (sx, sy) => V.unproject(sx, sy, W, H) : (sx, sy) => screenToField(sx, sy, W, H, 'land');
  /** 필드 방향(단위 벡터 성분 fx: x 증가, fy: y 증가 = away 골 쪽)의 화면 방향 [dx, dy] (2.5D: 자리 (x, y) 에서 투영한 방향) */
  const dirPx = d25 ? (fx, fy, x = 50, y = 50) => V.dirAt(fx, fy, x, y, W, H) : (fx, fy) => [fy, fx];

  /* 2.5D 월드 (SPRITE_25D_PLAN §3 · §4) ------------------------------------ */
  let worldKey = null;
  /** 판 div (matrix3d · 잔디 그림 · 필드 사각형 = .pitch-bg) · 배경 띠 · 골대 · 카메라 층을 지금 W × H 에 맞춘다 (크기가 바뀔 때만) */
  function layoutWorld() {
    const key = `${W}x${H}`;
    if (key === worldKey) return;
    worldKey = key;
    const { FL, FD, RU, RV } = V.V25;
    const { PL, PD } = V.planeSize();
    Object.assign(groundEl.style, {
      width: `${PL}px`, height: `${PD}px`, transform: V.cssMatrix3d(W, H),
      backgroundImage: `url("${GRASS_URL}")`, backgroundPosition: `${RU}px ${RV}px`, backgroundSize: `${FL}px ${FD}px`,
    });
    Object.assign(bg.style, { left: `${RU}px`, top: `${RV}px`, width: `${FL}px`, height: `${FD}px` });
    const st = V.stripRect(W, H);
    Object.assign(stripEl.style, {
      left: `${round1(st.x)}px`, top: `${round1(st.y)}px`, width: `${round1(st.w)}px`, height: `${round1(st.h)}px`,
      backgroundImage: `url("${STRIP_URL}")`,
    });
    goalsSvg.setAttribute('viewBox', `0 0 ${round1(W)} ${round1(H)}`);
    drawGoals();
    cam.style.transform = 'translate(0px, 0px) scale(1)'; // D1: 카메라 없이 전체 (D2 가 공 따라가기 · 결정 확대)
  }
  /** 서 있는 골대 두 개 (뒤 그물 → 옆 · 지붕 → 앞 틀 순서, 흰 선 SVG) */
  function drawGoals() {
    goalsSvg.replaceChildren();
    const pts = (list) => list.map((p) => `${round1(p[0])},${round1(p[1])}`).join(' ');
    for (const end of ['home', 'away']) {
      const g = V.goalShapes(end, W, H);
      const grp = svgEl('g', { class: `goal ${end}` });
      for (const poly of g.nets) grp.append(svgEl('polygon', { class: 'net', points: pts(poly) }));
      for (const [a, b] of g.grid) grp.append(svgEl('line', { class: 'net-line', x1: round1(a[0]), y1: round1(a[1]), x2: round1(b[0]), y2: round1(b[1]) }));
      grp.append(svgEl('polyline', { class: 'frame-halo', points: pts(g.frame) }), svgEl('polyline', { class: 'frame', points: pts(g.frame) }));
      goalsSvg.append(grp);
    }
  }
  // 스프라이트 (data/sprites.json): 토큰 키 → { url, w, h, footX } | null (스냅샷 charId — 그림 없는 선수 · 런 상대 = null = 스탠디)
  const spriteCache = new Map();
  function spriteFor(side, id) {
    const key = `${side}:${id}`;
    if (!spriteCache.has(key)) spriteCache.set(key, spriteOf(data, playerSnap(side, id)?.charId));
    return spriteCache.get(key);
  }
  /**
   * 2.5D 토큰 한 명의 화면 치수 (발 = (sx, sy)): s 깊이 배율, ga 바닥 납작 비율, fh 키, hw 반폭, gw 발밑 타원 폭, gh 그 높이,
   * by 체력 바 위 끝 · ny 이름표 위 끝 (발 기준 아래로). CSS 변수 (place) 와 자리 상자 (tokenRect · labelCands · bubbleCands) 가 같은 값을 쓴다
   */
  function tokGeo(t) {
    const p = V.project(t.x, t.y, W, H);
    const s = round3(p.s);
    const ga = round3(V.groundAspect(t.x, t.y, W, H));
    const f = V.figureSize(s, spriteFor(t.side, t.id));
    const gw = round1(V.V25.GROUND_W * s);
    const gh = round1(gw * ga);
    return { sx: p.sx, sy: p.sy, s, ga, fh: round1(f.fh), hw: round1(f.hw), gw, gh, by: round1(gh / 2 + 3), ny: round1(gh / 2 + 9) };
  }
  const tokOf = (Lay, id, side) => (Lay && id != null ? Lay.tokens.find((t) => t.id === id && (!side || t.side === side)) : null) || null;

  /* ------------------------------------------------------------------ */
  /* 토큰 / 공 / 구역 / 트랙                                                 */
  /* ------------------------------------------------------------------ */
  function tokenEl(t) {
    const key = `${t.side}:${t.id}`;
    let el = tokEls.get(key);
    if (el) return el;
    // 얼굴 그림 (§24.12.3): 스냅샷 charId 가 있고 목록에 그림이 있을 때만 (그림 없는 상대 = 글자). 그림은 탭 · 길게 누르기를 가로채지 않는다 (.pt)
    const face = setFaceArt(h('span', { class: 'tok-face', style: { background: t.portraitColor || '#4b5563' } }, initialOf(t.name)), snapArt(t.side, t.id));
    const barI = h('i');
    const nameEl = h('span', { class: 'tok-name' }, t.name);
    const bubble = h('span', { class: 'tok-bubble' });
    const ring = h('span', { class: 'tok-ring', 'aria-hidden': 'true' });
    const ti = t.trait ? L.traitInfo(t.trait, data) : null;
    let lpTimer = null;
    let lpFired = false;
    const clearLp = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    el = h('div', {
      class: ['tok', t.side],
      role: 'button',
      tabindex: '0',
      dataset: { side: t.side, id: t.id },
      // 탭 = (결정 중 받는 선수 후보면) 선택, 아니면 미니 카드. 길게 누르기 / 우클릭 = 미니 카드 (GDD v0.5 §9.6·9.7)
      onpointerdown: (e) => {
        if (e && e.button > 0) return;
        lpFired = false;
        clearLp();
        lpTimer = setTimeout(() => {
          lpTimer = null;
          if (!alive()) return;
          lpFired = true;
          openCard(t.side, t.id);
        }, T.longPress);
      },
      onpointerup: clearLp,
      onpointerleave: clearLp,
      onpointercancel: clearLp,
      onclick: (e) => {
        clearLp();
        if (lpFired) { lpFired = false; e?.preventDefault?.(); return; }
        tapToken(t.side, t.id);
      },
      // 안드로이드는 길게 누르면 contextmenu 도 온다 → 이미 연 카드면 무시, 뒤따르는 click 도 막는다 (다음 pointerdown 에서 풀림)
      oncontextmenu: (e) => {
        e?.preventDefault?.();
        clearLp();
        if (!lpFired) { lpFired = true; openCard(t.side, t.id); }
      },
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapToken(t.side, t.id); } },
    }, ring, d25 ? figureEls(t, face) : face, h('span', { class: 'tok-bar' }, barI), nameEl,
    t.isYouth ? h('span', { class: 'tok-yu' }, '유') : null,
    ti ? h('span', { class: 'tok-trait', title: `${ti.name} — ${ti.description}` }, ti.icon) : null,
    bubble);
    el._bar = barI;
    el._bubble = bubble;
    el._name = nameEl;
    tokLayer.append(el);
    tokEls.set(key, el);
    return el;
  }

  /**
   * 2.5D 토큰의 발밑 타원 + 선 그림 (SPRITE_25D_PLAN §4): 스프라이트가 있으면 <img class="spr-img"> (높이 72 · 발 가운데 = 앵커,
   * 크기는 .tok-figure 의 scale(--ts)), 없으면 얼굴 원(face — 평면과 같은 .tok-face)을 몸 위에 세운 스탠디. 스프라이트를 못 불러오면 스탠디로.
   */
  function figureEls(t, face) {
    const ground = h('span', { class: 'tok-ground', 'aria-hidden': 'true' });
    const spr = spriteFor(t.side, t.id);
    if (!spr) return [ground, h('span', { class: ['tok-figure', 'standee'] }, face)];
    const fh = V.V25.SPR_H;
    const fw = round1(fh * (spr.w / spr.h));
    const img = h('img', {
      class: 'spr-img', src: spr.url, alt: '', draggable: 'false', decoding: 'async',
      style: { height: `${fh}px`, width: `${fw}px`, left: `${round1(-spr.footX * fw)}px`, transformOrigin: `${round1(spr.footX * fw)}px 100%` },
    });
    const fig = h('span', { class: ['tok-figure', 'spr'] }, img);
    img.addEventListener('error', () => {
      // 그림이 없으면 스탠디 (다음 재배치부터 자리 상자도 스탠디 치수)
      spriteCache.set(`${t.side}:${t.id}`, null);
      img.remove();
      fig.classList.remove('spr');
      fig.classList.add('standee');
      fig.append(face);
    });
    return [ground, fig];
  }

  /* 라벨 · 말풍선 · 결과 한 줄 · 미리보기 글자의 자리 고르기 (픽셀 박스 {l,r,t,b}).
     토큰끼리는 layout.js 가 겹치지 않게 놓지만, 그 위에 붙는 글자는 이웃 토큰을 가릴 수 있다 → 후보 자리 중
     다른 토큰 · 공 · 이미 놓인 글자와 겹치지 않는 첫 자리 (없으면 가장 덜 겹치는 자리). */
  // 가리면 안 되는 정도(w): 듀얼 당사자·패스 후보 2, 보통 1, 뚫린(반투명) 선수 0.35
  const TAG_WEIGHT = { carrier: 2, defender: 2, receiver: 2, broken: 0.35 };
  function tokenRect(t) {
    if (d25) {
      // 2.5D: 서 있는 그림 (발에서 위로 키 fh, 좌우 반폭 hw) + 발밑 체력 바
      const g = tokGeo(t);
      return { l: g.sx - g.hw - 2, r: g.sx + g.hw + 2, t: g.sy - g.fh - 2, b: g.sy + g.by + 5, w: TAG_WEIGHT[t.role] ?? 1 };
    }
    const [cx, cy] = toPx(t.x, t.y);
    const r = tokPx / 2 + 2; // 팀 링 포함
    return { l: cx - r, r: cx + r, t: cy - r, b: cy + r + 5, w: TAG_WEIGHT[t.role] ?? 1 }; // + 체력 바
  }
  function ballRect(Lay) {
    const [bx, by] = ballPx(Lay.ball.x, Lay.ball.y, Lay.mode === 'play' && Lay.carrierId ? Lay.attackingSide : null);
    if (d25) {
      // 2.5D: 공 글자 (16px × s) 는 땅 점 위로, 그림자 (18 × 7) 는 땅 점에 — css .d25 .m-ball > span · .b-shadow
      const s = V.project(Lay.ball.x, Lay.ball.y, W, H).s;
      return { l: bx - 9 * s, r: bx + 9 * s, t: by - 19 * s, b: by + 4 * s, w: 1.5 };
    }
    return { l: bx - 8, r: bx + 8, t: by - 10, b: by + 10, w: 1.5 }; // css .m-ball > span
  }
  function spotScore(box, obstacles) {
    let s = 0;
    for (const o of obstacles) s += rectOverlap(box, o) * (o.w ?? 1);
    const inside = rectOverlap(box, { l: 0, r: W, t: 0, b: H });
    const area = (box.r - box.l) * (box.b - box.t);
    return s + (area - inside) * 2; // 필드 밖으로 나가는 부분은 두 배로 싫다
  }
  function pickSpot(cands, obstacles) {
    let best = null;
    let bestScore = Infinity;
    for (const c of cands) {
      const sc = spotScore(c.box, obstacles);
      if (sc <= 1) return c;
      if (sc < bestScore - 0.5) { best = c; bestScore = sc; }
    }
    return best;
  }

  /**
   * 이름 라벨 후보 (선호 순): 공격이 좌우라 위·아래는 듀얼 상대와 겹치지 않는다 → 아래 → 위 (가운데 → 듀얼 상대 반대편으로 비낌 → 반대쪽),
   * 그다음 옆 (듀얼 상대 반대편부터). 듀얼 상대 반대편 = 공격 팀은 자기 골 쪽, 수비 팀은 공격 방향 쪽 (둘 다 상대에게서 멀어지는 쪽).
   * 박스 크기는 CSS .tok-name 과 같게 (글자 FONT.label, 줄 높이 16, 좌우 여백 5)
   */
  function labelCands(t, Lay, text) {
    const ahead = Lay.attackingSide === 'home' ? 'r' : 'l'; // 공격 방향 (화면)
    const awayFromDuel = t.side === Lay.attackingSide ? (ahead === 'r' ? 'l' : 'r') : ahead;
    const vs = ['down', 'up'];
    const hzs = ['c', awayFromDuel, awayFromDuel === 'l' ? 'r' : 'l'];
    const [cx, cy] = toPx(t.x, t.y);
    const r = tokPx / 2;
    const w = textWidth(text, FONT.label) + 10;
    // 2.5D: 아래 = 발밑 체력 바 아래 (--ny), 위 = 머리 위 (--fh), 옆 = 몸 가운데 높이 · 반폭 (--fhw) 바깥 — css .d25 .tok-name
    const g = d25 ? tokGeo(t) : null;
    const vBox = (v) => (g
      ? (v === 'up' ? { t: cy - g.fh - 19, b: cy - g.fh - 3 } : { t: cy + g.ny, b: cy + g.ny + 16 })
      : (v === 'up' ? { t: cy - r - 19, b: cy - r - 3 } : { t: cy + r + 7, b: cy + r + 23 }));
    const hBox = (hz) => (hz === 'c' ? { l: cx - w / 2, r: cx + w / 2 } : hz === 'l' ? { l: cx - w + 4, r: cx + 4 } : { l: cx - 4, r: cx - 4 + w });
    const out = [];
    for (const v of vs) for (const hz of hzs) out.push({ v, hz, box: { ...vBox(v), ...hBox(hz) } });
    const sr = g ? g.hw : r; // 옆 자리: 몸 반폭 바깥
    const sm = g ? cy - g.fh / 2 : cy; // 옆 자리 세로 가운데
    const sideR = { v: 'side', hz: 'c', box: { l: cx + sr + 5, r: cx + sr + 5 + w, t: sm - 8, b: sm + 8 } };
    const sideL = { v: 'side-l', hz: 'c', box: { l: cx - sr - 5 - w, r: cx - sr - 5, t: sm - 8, b: sm + 8 } };
    out.push(...(awayFromDuel === 'l' ? [sideL, sideR] : [sideR, sideL]));
    return out;
  }
  /** 예상 행동 말풍선 후보: 토큰 위 오른쪽(기본) → 위 왼쪽 → 옆 오른쪽 → 옆 왼쪽 → 아래 오른쪽 → 아래 왼쪽 (CSS .tok-bubble: 줄 높이 18) */
  function bubbleCands(t, text) {
    const [cx, cy] = toPx(t.x, t.y);
    let r = tokPx / 2;
    const bw = textWidth(text, FONT.bubble) + 14;
    let up = { t: cy - r - 21, b: cy - r - 3 };
    let mid = { t: cy - 9, b: cy + 9 };
    let dn = { t: cy + r + 8, b: cy + r + 26 };
    if (d25) {
      // 2.5D: 위 = 머리 위 (--fh), 옆 = 머리 높이 (키의 3/4) · 반폭 (--fhw) 바깥, 아래 = 발 아래 — css .d25 .tok-bubble
      const g = tokGeo(t);
      r = g.hw;
      up = { t: cy - g.fh - 21, b: cy - g.fh - 3 };
      mid = { t: cy - g.fh * 0.75 - 9, b: cy - g.fh * 0.75 + 9 };
      dn = { t: cy + 10, b: cy + 28 };
    }
    return [
      { cls: '', box: { l: cx + 5, r: cx + 5 + bw, ...up } },
      { cls: 'bub-l', box: { l: cx - 5 - bw, r: cx - 5, ...up } },
      { cls: 'bub-s', box: { l: cx + r + 4, r: cx + r + 4 + bw, ...mid } },
      { cls: 'bub-s bub-l', box: { l: cx - r - 4 - bw, r: cx - r - 4, ...mid } },
      { cls: 'bub-d', box: { l: cx + 5, r: cx + 5 + bw, ...dn } },
      { cls: 'bub-d bub-l', box: { l: cx - 5 - bw, r: cx - 5, ...dn } },
    ];
  }

  /**
   * 이름을 붙일 받는 선수 후보: 사람이 공격 결정 중이면 후보 전원(고른 선수 표시), 아니면 예상 받는 선수 한 명
   * (상대 공격이면 상대가 커밋한 액션의 받는 선수). → Map(id → 고른 액션 목록)
   */
  function receiverTags(view, Lay) {
    const m = new Map();
    if (!Lay || Lay.mode !== 'play' || !view || view.finished) return m;
    const human = humanOf(view);
    const d = distOf(view);
    if (d && Lay.dist) {
      // GK 배급: 사람이 고르는 중이면 두 받는 선수 모두 ("이름 (짧게)" · "이름 (길게)"), 아니면 자동 배급의 받는 선수 한 명
      const deciding = !busy && paused(view) && d.side === human;
      for (const a of DIST_ACTIONS) {
        const id = Lay.dist[a];
        if (!id || !(Lay.receiverIds || []).includes(id)) continue;
        if (deciding || d.auto?.action === a) m.set(id, [...(m.get(id) || []), `dist-${a}`]);
      }
      return m;
    }
    if (!busy && paused(view) && view.attackingSide === human) {
      for (const id of Lay.receiverIds || []) m.set(id, []);
      for (const a of RECV_ACTIONS) {
        const ri = recvInfo(view, a);
        if (ri && m.has(ri.id)) m.get(ri.id).push(a);
      }
      return m;
    }
    // 자동 진행: 공 가진 선수의 예상 행동(패스·크로스)의 받는 선수 한 명. 사람 측이 스킬·필살기로 바꿀 수 있어 확정할 수 없으면 이름 없음
    const sv = shownView(view);
    if (view.receiverPreview && !sv?.receiverPreview) return m;
    let id = Lay.receiverId;
    const ea = view.expected?.attack?.action;
    // 예상 받는 선수: 엔진 expected.attack.receiverId (커밋한 선수 · ④ 자동 연결 규칙의 선수) → 없으면 그 액션의 기본값
    if (ea === 'pass' || ea === 'cross') id = view.expected?.attack?.receiverId ?? sv?.receivers?.[ea]?.defaultId ?? id;
    if (id && (Lay.receiverIds || []).includes(id)) m.set(id, []);
    return m;
  }
  function labelText(t, picks, view) {
    if (!picks || !picks.length) return t.name;
    if (picks.some((p) => String(p).startsWith('dist-'))) {
      // GK 배급 받는 선수: 짧게(DF) · 길게(MF). 같은 선수면 둘 다
      const kinds = picks.filter((p) => String(p).startsWith('dist-')).map((p) => (p === 'dist-long' ? '길게' : '짧게'));
      return `${t.name} (${kinds.join('·')})`;
    }
    const rs = shownView(view)?.receivers || {};
    const both = RECV_ACTIONS.filter((a) => rs[a]).length > 1;
    const sameForAll = RECV_ACTIONS.filter((a) => rs[a]).every((a) => picks.includes(a));
    return both && !sameForAll ? `${t.name} ✓${actName(view, picks[0])}` : `${t.name} ✓`;
  }

  /**
   * 결정 대기 중 패스·크로스(·인터셉트) 미리보기 화살표가 지나갈 길(공 가진 선수 → 받는 선수)을 6px 점 박스로.
   * 옆 패스·크로스는 화면 위아래로 가서 이름표(아래 → 위)가 화살표 끝·시작을 덮기 쉽다 → placeTags 가 이 점들도 피한다.
   * 드리블·슛 길은 넣지 않는다: 대체로 좌우라 위·아래 이름표와 부딪히지 않고, 듀얼 상대 바로 위를 지나 자리만 막는다
   */
  function previewLanes(Lay, view) {
    if (!Lay || Lay.mode !== 'play' || !canDecideNow(view)) return [];
    const atk = Lay.attackingSide;
    const C = tokOf(Lay, Lay.carrierId, atk);
    if (!C) return [];
    const c = toPx(C.x, C.y);
    const out = [];
    const along = (b, curve) => out.push(...lineDots(c, b, curve));
    if (Lay.dist) {
      // GK 배급: 짧은 패스(직선) · 롱패스(포물선) 길
      for (const a of DIST_ACTIONS) {
        const R = tokOf(Lay, Lay.dist[a], atk);
        if (R) along(toPx(R.x, R.y), a === 'long');
      }
      return out;
    }
    // 받는 선수: 패스·크로스(고른 선수 또는 기본값) — 인터셉트 미리보기도 같은 길. 크로스는 포물선
    const rids = RECV_ACTIONS.map((a) => [a, recvInfo(view, a)?.id]).filter(([, id]) => id);
    if (!rids.length && Lay.receiverId) rids.push(['pass', Lay.receiverId]);
    for (const [a, id] of rids) {
      const R = tokOf(Lay, id, atk);
      if (R) along(toPx(R.x, R.y), a === 'cross');
    }
    return out;
  }
  /**
   * ④ 박스 연결 미리보기에서 GK 가 튀어나오는 길: GK → 연결 길 위 한 점 (크로스면 포물선 위 점) — [시작, 끝] 픽셀, 없으면 null.
   * 끝점은 가운데(0.55)부터 앞뒤로 — 화살촉이 다른 토큰(뚫린 수비 · 후보) 위에 앉지 않는 첫 자리 (없으면 가장 덜 겹치는 자리)
   */
  function gkLane(Lay, c, r, curve) {
    const def = Lay.attackingSide === 'home' ? 'away' : 'home';
    const G = tokOf(Lay, Lay.defenderId, def);
    if (!G) return null;
    const obstacles = Lay.tokens.filter((t) => t !== G).map((t) => ({ ...tokenRect(t), w: 1 }));
    const cands = [0.55, 0.45, 0.65, 0.35, 0.75].map((k) => {
      const e = curve && !d25 ? curvePoint(c, r, k) : lerp2(c, r, k); // 2.5D: GK 가 달려가는 곳 = 곡선 아래 바닥
      return { e, box: { l: e[0] - 9, r: e[0] + 9, t: e[1] - 9, b: e[1] + 9 } };
    });
    return [toPx(G.x, G.y), (pickSpot(cands, obstacles) || cands[0]).e];
  }
  /** 선(a → b 픽셀, curve 면 크로스 포물선)을 따라 6px 점 박스 — 글자 자리 고르기의 장애물. 무게 0.5: 선보다 토큰을 덜 가리는 게 먼저 */
  function lineDots(a, b, curve = false) {
    const out = [];
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6));
    for (let i = 1; i < n; i++) {
      const p = curve ? curvePoint(a, b, i / n) : lerp2(a, b, i / n);
      out.push({ l: p[0] - 3, r: p[0] + 3, t: p[1] - 3, b: p[1] + 3, w: 0.5 });
    }
    return out;
  }

  /**
   * 이름 라벨(carrier · defender · 받는 선수 · 외치는 선수)과 말풍선(상대 예상 행동 · 에이스의 외침 "줘!")의 자리:
   * key → { label: 'lbl-…' 클래스, bubble: 'bub-…' 클래스 }. bubbles = [{ key, text }] — 앞의 것부터 자리를 잡는다
   */
  function placeTags(Lay, named, bubbles = [], lanes = []) {
    const rects = new Map(Lay.tokens.map((t) => [`${t.side}:${t.id}`, tokenRect(t)]));
    const ball = ballRect(Lay);
    const taken = []; // 이미 놓인 글자
    const obstaclesFor = (key) => [...[...rects].filter(([k]) => k !== key).map(([, r]) => r), ball, ...lanes, ...taken];
    const out = new Map();
    out.boxes = taken; // 놓인 글자 자리 (미리보기 글자가 피한다)
    for (const b of bubbles) {
      const bubTok = b && b.key && b.text ? Lay.tokens.find((t) => `${t.side}:${t.id}` === b.key) : null;
      if (!bubTok) continue;
      // 연계 특성 아이콘(토큰 오른쪽 위 16px — css .tok-trait, tokenRect 밖)도 되도록 가리지 않게 (자기 · 이웃 토큰)
      const traits = Lay.tokens.filter((t) => t.trait).map((t) => {
        if (d25) {
          // 2.5D: 머리 오른쪽 (css .d25 .tok-trait — 반폭 × 0.55, 키 × 0.92 위)
          const g = tokGeo(t);
          return { l: g.sx + g.hw * 0.55, r: g.sx + g.hw * 0.55 + 16, t: g.sy - g.fh * 0.92, b: g.sy - g.fh * 0.92 + 16, w: 0.6 };
        }
        const [tx, ty] = toPx(t.x, t.y);
        return { l: tx + tokPx * 0.3, r: tx + tokPx * 0.3 + 16, t: ty - tokPx * 0.72, b: ty - tokPx * 0.72 + 16, w: 0.6 };
      });
      const pick = pickSpot(bubbleCands(bubTok, b.text), [...obstaclesFor(b.key), ...traits]);
      out.set(b.key, { label: '', bubble: pick.cls });
      taken.push({ ...pick.box, w: 1.5 });
    }
    const order = ['carrier', 'defender', 'receiver'];
    const list = Lay.tokens.filter((t) => named.has(`${t.side}:${t.id}`)).sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
    for (const t of list) {
      const key = `${t.side}:${t.id}`;
      const pick = pickSpot(labelCands(t, Lay, named.get(key)), obstaclesFor(key));
      const cls = [pick.v !== 'down' ? `lbl-${pick.v}` : '', pick.hz === 'l' ? 'lbl-sl' : pick.hz === 'r' ? 'lbl-sr' : ''].filter(Boolean).join(' ');
      out.set(key, { label: cls, bubble: out.get(key)?.bubble ?? '' });
      taken.push({ ...pick.box, w: 1.5, role: t.role }); // role: 수비 미리보기에서 접히는 수비수 이름표를 tipText 가 가려낸다
    }
    return out;
  }

  function tokenClass(t, tag, extra) {
    const named = !!extra.named;
    return [
      'tok', t.side, `role-${t.role}`,
      named ? 'named' : '',
      named && tag?.label ? tag.label : '',
      tag?.bubble || '',
      t.staminaRatio <= 0.2 ? 'low' : '',
      t.isYouth ? 'youth' : '',
      t.role === 'broken' ? (t.side === 'home' ? 'chase-down' : 'chase-up') : '',
      extra.picked ? 'picked' : '',
      extra.pickable ? 'pickable' : '',
      extra.ult ? 'has-ult' : '',
      extra.ult?.ready ? 'ult-ready' : '',
      extra.ult?.combo ? 'ult-combo' : '',
      extra.calling ? 'calling' : '',
    ].filter(Boolean).join(' ');
  }

  function place(el, x, y) {
    if (d25) {
      // 2.5D: 앵커 = 발. 크기 (--ts) · 치수 변수는 자리마다 (tokGeo — 자리 상자와 같은 값), 겹침 = 화면 y 순 (아래 = 가까운 선수가 앞)
      const g = tokGeo({ x, y, side: el.dataset.side, id: el.dataset.id });
      el.style.transform = `translate(${round1(g.sx)}px, ${round1(g.sy)}px)`;
      el.style.zIndex = String(100 + Math.round(round1(g.sy)));
      for (const [k, v] of [['--ts', g.s], ['--ga', g.ga], ['--fh', `${g.fh}px`], ['--fhw', `${g.hw}px`], ['--by', `${g.by}px`], ['--ny', `${g.ny}px`]]) {
        el.style.setProperty(k, String(v));
      }
      return;
    }
    const [sx, sy] = toPx(x, y);
    el.style.transform = `translate(${round1(sx)}px, ${round1(sy)}px)`;
  }

  function applyLayout(Lay, view, { anim = true } = {}) {
    if (!Lay) return;
    curL = Lay;
    curView = view;
    if (!anim) screen.classList.add('no-anim'); // 토큰 · 공 · 트랙 칸 트랜지션 없이
    const seen = new Set();
    const ei = expectInfo(view);
    const oppKey = oppDuelKey(view);
    const rtags = receiverTags(view, Lay);
    const atk = Lay.attackingSide;
    const ace = aceInfo(view, Lay);
    const named = new Map();
    for (const t of Lay.tokens) {
      const key = `${t.side}:${t.id}`;
      if (t.role === 'carrier' || t.role === 'defender') named.set(key, t.name);
      else if (t.role === 'receiver' && t.side === atk && rtags.has(t.id)) named.set(key, labelText(t, rtags.get(t.id), view));
    }
    // 외치는 선수는 이름도 (자동 진행 중 예상 받는 선수가 아니어도 누가 외치는지 보이게)
    if (ace && !named.has(ace.key)) named.set(ace.key, ace.R.name);
    const bubbles = [];
    if (ei.bubble && oppKey) bubbles.push({ key: oppKey, text: ei.bubble });
    if (ace) bubbles.push({ key: ace.key, text: ACE_BUBBLE });
    // 이름표 · 말풍선은 미리보기 길과 외침 점선도 피한다 (점 박스 — 토큰보다 덜 싫다)
    const tags = placeTags(Lay, named, bubbles, [...previewLanes(Lay, view), ...(ace ? aceDots(ace) : [])]);
    tagBoxes = tags.boxes || [];
    // 받는 선수 탭 선택은 듀얼 공격 결정에서만 (GK 배급의 받는 선수는 카드로 고른다)
    const deciding = !busy && paused(view) && view?.attackingSide === humanOf(view) && !Lay.dist;
    // 2.5D 방향 (SPRITE_25D_PLAN §4): 공 가진 선수 = 공격 방향, 나머지 = 공 쪽 (.face-l = 그림만 좌우 반전)
    const ballSx = d25 && Lay.ball ? toPx(Lay.ball.x, Lay.ball.y)[0] : null;
    for (const t of Lay.tokens) {
      const key = `${t.side}:${t.id}`;
      seen.add(key);
      const el = tokenEl(t);
      const ult = view?.ultimate?.[t.side]?.[t.id] || null;
      const picks = t.side === atk ? rtags.get(t.id) : null;
      const calling = !!(ace && key === ace.key);
      el.className = tokenClass(t, tags.get(key), {
        named: named.has(key),
        picked: !!(deciding && picks && picks.length),
        pickable: !!(deciding && t.role === 'receiver' && t.side === atk),
        ult,
        calling,
      });
      if (d25) {
        const face = V.facing({
          carrier: t.side === atk && t.id === Lay.carrierId, attackRight: atk !== 'away', sx: toPx(t.x, t.y)[0], ballSx, side: t.side,
        });
        el.classList.toggle('face-l', face === 'l');
      }
      el.dataset.role = t.role;
      el.dataset.x = String(round1(t.x));
      el.dataset.y = String(round1(t.y));
      el.style.setProperty('--g', ult ? String(round3(clamp01((Number(ult.gauge) || 0) / gaugeMax))) : '0');
      const nm = named.get(key) ?? t.name;
      if (el._name.textContent !== nm) el._name.textContent = nm;
      el.setAttribute('aria-label', `${t.side === 'home' ? '우리' : '상대'} ${t.slot ?? t.position} ${t.name} — ${L.TOKEN_ROLE_LABELS[t.role] ?? t.role}` +
        `${ult ? ` · 필살 게이지 ${Math.round(ult.gauge)}${ult.ready ? ' (준비)' : ''}` : ''}${deciding && t.role === 'receiver' && t.side === atk ? ' · 탭하면 받는 선수로' : ''}` +
        `${calling ? ` · "${ACE_BUBBLE}" ${ace.title}` : ''}`);
      place(el, t.x, t.y);
      el._bar.style.width = `${Math.round(clamp01(t.staminaRatio) * 100)}%`;
      const bub = key === oppKey && ei.bubble ? ei.bubble : calling ? ACE_BUBBLE : '';
      el._bubble.textContent = bub;
      el._bubble.title = bub ? (calling ? ace.title : ei.text) : '';
      el.classList.toggle('has-bubble', !!bub);
      el.classList.toggle('reading', !!(bub && !calling && ei.reading));
    }
    for (const [key, el] of tokEls) if (!seen.has(key)) el.classList.add('gone');
    // 외침 점선 · 배지 (재배치로 토큰이 움직이는 중이면 도착한 뒤 나타난다). 배지 자리는 결과 한 줄 · 미리보기 글자도 피한다
    const badge = drawAce(Lay, ace, anim);
    if (badge) tagBoxes.push(badge);
    placeBall(Lay);
    updateZones(Lay);
    updateTrack(Lay);
    placeLogBox(Lay);
    // 남은 수비 칩 (왼쪽 아래 컨트롤 묶음): "남은 수비: MF 2 + DF 2 + GK" → "남은 수비: MF2·DF2·GK" (짧게, 전체 문구는 title)
    const rem = Lay.remainingText || '';
    remainEl.textContent = rem.replace(/([A-Z]{2}) (\d+)/g, '$1$2').replace(/ \+ /g, '·');
    remainEl.title = rem;
    remainEl.classList.toggle('hidden', !rem);
    if (!anim) {
      void screen.offsetWidth; // 트랜지션 없이 즉시 반영
      screen.classList.remove('no-anim');
    }
  }

  /**
   * 로그 서랍 자리 = 공 · 공격 방향의 반대쪽 절반 (기본 오른쪽, .side-l = 왼쪽 — css/match.css). 필드 y 0 = home 골(왼쪽) … 100 = away 골(오른쪽).
   * 플레이 중에는 공격 방향으로 15 앞을 본다 (받는 선수 후보 · 미리보기 화살표는 공 앞) → home 공격이 중원에 오면 서랍은 왼쪽,
   * 상대 공격이 중원에 오면 오른쪽. 열어 둔 채 결정 차례가 와도 공 가진 선수 · 수비수 · 후보 토큰을 가리거나 탭을 막지 않는다.
   */
  function placeLogBox(Lay) {
    const by = Number(Lay?.ball?.y);
    if (!Number.isFinite(by)) return;
    const lead = Lay.mode === 'play' ? (Lay.attackingSide === 'away' ? -15 : 15) : 0;
    logBox.classList.toggle('side-l', by + lead >= 50);
  }

  /** 공: play 모드에서 공 가진 선수가 있으면 발 앞(공격 방향)으로 살짝 — 얼굴을 가리지 않게. 승부차기·골문 안은 그대로 */
  function placeBall(Lay) {
    stopBallArc();
    ballEl.dataset.x = String(round1(Lay.ball.x));
    ballEl.dataset.y = String(round1(Lay.ball.y));
    placeBallAt(Lay.ball.x, Lay.ball.y, Lay.mode === 'play' && Lay.carrierId ? Lay.attackingSide : null);
  }
  function ballPx(x, y, frontOf = null) {
    if (d25) {
      // 2.5D: 발 앞 = 투영한 공격 방향으로 몸 폭(46) × 0.35, 화면 쪽(필드 x +)으로 4 — 둘 다 그 깊이의 배율 s
      const p = V.project(x, y, W, H);
      if (!frontOf) return [p.sx, p.sy];
      const fwd = dirPx(0, frontOf === 'home' ? 1 : -1, x, y);
      const near = dirPx(1, 0, x, y);
      const k = V.V25.TOK_GAP * 0.35 * p.s;
      return [p.sx + fwd[0] * k + near[0] * 4 * p.s, p.sy + fwd[1] * k + near[1] * 4 * p.s];
    }
    let dx = 0;
    let dy = 0;
    if (frontOf) {
      // 공격 방향(필드 y) 앞 + 필드 x 쪽으로 비낀 대각선 = 화면에서 앞 아래
      const k = tokPx * 0.42;
      const fwd = dirPx(0, frontOf === 'home' ? 1 : -1);
      const side = dirPx(1, 0);
      dx = (fwd[0] + side[0]) * k;
      dy = (fwd[1] + side[1]) * k;
    }
    const [sx, sy] = toPx(x, y);
    return [sx + dx, sy + dy];
  }
  function placeBallAt(x, y, frontOf = null) {
    const [bx, by] = ballPx(x, y, frontOf);
    // 2.5D: 크기 = 그 깊이의 배율 s (그림자 · 공 글자가 함께 — css .d25 .m-ball)
    ballEl.style.transform = `translate(${round1(bx)}px, ${round1(by)}px)${d25 ? ` scale(${round3(V.project(x, y, W, H).s)})` : ''}`;
  }

  function updateZones(Lay) {
    const hl = Lay.highlight || {};
    for (const [id, el] of zoneEls) {
      el.classList.remove('hl-danger', 'hl-crisis', 'hl-chance', 'hl-shotChance', 'ball-zone');
      const lbl = el.querySelector('.zone-hl');
      if (lbl) lbl.textContent = '';
      if (id === Lay.zone) el.classList.add('ball-zone');
      if (hl.level && id === hl.zone) {
        el.classList.add(`hl-${hl.level}`);
        if (lbl) lbl.textContent = hl.label || '';
      }
    }
    field.dataset.zone = String(Lay.zone);
  }

  /**
   * 공격 진행 트랙: 헤더 아래 가로 줄, 단계 i 칸을 그 단계의 구역 폭에 맞춘다 (home: Z2→Z5 왼쪽 → 오른쪽, away: Z4→Z1 오른쪽 → 왼쪽).
   * 트랙의 좌우 끝 = 규칙 영역의 좌우 끝 (css .m-track) 이라 % 가 구역과 같다
   */
  function updateTrack(Lay) {
    const tr = Lay.track || { side: 'home', step: 0, dir: 'up' };
    const pre = !!tr.gk; // GK 배급 대기: 아직 ① 전 — 칸을 켜지 않는다
    trackCells.forEach((cell, i) => {
      const zone = tr.side === 'away' ? 4 - i : i + 2;
      const z = ZONES[zone - 1];
      cell.style.left = `calc(${z.from}% + 2px)`;
      cell.style.width = `calc(${z.to - z.from}% - 4px)`;
      const on = !pre && (Lay.mode === 'penalties' ? i === tr.step : i <= tr.step); // 승부차기: ④ 만
      cell.className = ['trk', tr.side, on ? 'on' : '', !pre && i === tr.step ? 'cur' : ''].filter(Boolean).join(' ');
    });
    track.className = ['m-track', tr.side, tr.dir, pre ? 'pre' : ''].filter(Boolean).join(' ');
    track.setAttribute('aria-label', pre
      ? `공격 진행 ${tr.side === 'home' ? '우리' : '상대'} GK 배급 (① 전)`
      : `공격 진행 ${tr.side === 'home' ? '우리' : '상대'} ${STEP_MARKS[tr.step] ?? ''} ${L.ATTACK_STEP_LABELS[tr.step] ?? ''}`);
  }

  /**
   * 상황 배너: 구역(또는 공격 팀·포제션)이 바뀔 때만 갱신 (GDD §9.5-3). ④ 박스 연결 성공도 (구역 그대로, 받은 선수의 찬스).
   * 마지막 공격 보장 (view.lastAttack.active, 2026-09-29): 추가 포제션의 첫 배너 = "⏱ 추가시간 — 마지막 공격!" (금색 .lv-last),
   * 그 포제션의 다음 배너들은 앞에 "⏱ ".
   */
  function updateBanner(Lay, view, force = false) {
    if (!Lay) return;
    let text = Lay.banner || view?.lineLabel || '';
    const la = !view?.finished && Lay.mode === 'play' && view?.lastAttack?.active ? view.lastAttack : null;
    const key = Lay.mode === 'penalties' || view?.finished
      ? `${Lay.mode}|${view?.finished ? 'end' : ''}|${text}`
      : `${Lay.attackingSide}|${Lay.zone}|${view?.possession ?? ''}|${view?.ballState?.boxLinkUsed ? 'link' : ''}|${la ? 'la' : ''}`;
    if (!force && key === bannerKey) return;
    bannerKey = key;
    let lv = Lay.highlight?.level;
    if (la) {
      const laKey = `${la.stage}|${la.possession}`;
      if (laShown !== laKey) {
        laShown = laKey;
        text = la.side === humanOf(view) ? '⏱ 추가시간 — 마지막 공격!' : '⏱ 추가시간 — 상대 마지막 공격!';
        lv = 'last';
      } else if (text) text = `⏱ ${text}`;
    }
    bannerEl.className = ['m-banner', lv ? `lv-${lv}` : '', `side-${Lay.attackingSide}`].filter(Boolean).join(' ');
    bannerTxt.textContent = text;
    bannerEl.title = text;
    void bannerEl.offsetWidth;
    bannerEl.classList.add('fresh');
  }

  /* ------------------------------------------------------------------ */
  /* 예상 행동 (A안 — GDD v0.5 §9.6·9.9)                                     */
  /* ------------------------------------------------------------------ */
  /**
   * → { ico, text(정보 줄 왼쪽), bubble(상대 듀얼 토큰 위 말풍선) | null, mine(정보 줄 오른쪽: 우리 선수 예상 행동), reading }
   * 상대 예상 행동 = view.expected[상대 역할].action (AI 커밋), 근거 = 성향값 상위 두 개.
   */
  function expectInfo(view) {
    const none = { ico: '⏳', text: '', bubble: null, mine: '', reading: false };
    if (!view) return none;
    if (view.finished) return { ...none, ico: '🏁', text: '경기 종료' };
    if (view.phase === 'penalties') return { ...none, ico: '🥅', text: '승부차기 — 키커 vs GK (자동)' };
    const dist = distOf(view);
    if (dist) return distInfo(view, dist, none);
    const ex = view.expected;
    if (view.phase !== 'decision' || !ex) return { ...none, text: view.lineLabel ?? '진행 중' };
    const human = humanOf(view);
    const opp = human === 'home' ? 'away' : 'home';
    const myRole = view.attackingSide === human ? 'attack' : 'defense';
    const oppRole = myRole === 'attack' ? 'defense' : 'attack';
    const o = ex[oppRole] || null;
    const me = ex[myRole] || null;
    const oppName = nameOf(view, opp, o?.playerId) || '상대';
    const myName = nameOf(view, human, me?.playerId);
    const box = Number(view.lineIndex) >= 3;
    // ④ 박스 연결 자동 규칙 (A안 예외 — 상대 수를 읽지 않음, 2026-09-29 기대 골): 연결 성공 × 받은 선수 골 > 지금 슛 골일 때만 연결
    const linkRule = box ? boxRuleText(view.boxLink) : '';
    const recvOf = (side, x) => (isBoxLink(view, x?.action) && x.receiverId ? ` → ${nameOf(view, side, x.receiverId)}` : '');
    let mine = '';
    let mineTitle = '';
    let ace = false;
    if (me) {
      mine = myRole === 'defense' && box
        ? '우리: 세이브(자동)'
        : `우리: ${actName(view, me.action)}${recvOf(human, me)}`;
      mineTitle = `우리 ${myName}의 예상 행동 — 자동이면 이것을 고른다${myRole === 'attack' && linkRule ? `\n${linkRule}` : ''}`;
      // 에이스의 외침: 자동 진행 중 우리 자동이 외치는 선수에게 보내면 (엔진 aceCall.expected — 새 판단 · 보너스 없음)
      const ac = view.aceCall;
      if (myRole === 'attack' && ac && ac.side === human && ac.expected && ui.auto && !paused(view)) {
        mine = `자동: ${ac.name}에게 연결 예정`;
        mineTitle = `${ac.name}${ac.reason === 'combo' ? `: 필살 패스를 받으면 합체기 [${ac.comboName}]` : `: 받으면 필살기 [${ac.ultimateName}] 준비`}` +
          ` — 우리 자동(${actName(view, ac.expectedAction)})이 ${ac.name}에게 보낸다\n${mineTitle}`;
        ace = true;
      }
    }
    if (view.opponentReading) {
      return {
        ico: '👁', text: `상대 ${withJosa(oppName, '이/가')} 우리 수를 읽는 중`, bubble: '👁 간파', mine, mineTitle, ace, reading: true,
        title: `상대 ${withJosa(oppName, '이/가')} 간파를 썼다 — 우리가 고른 액션을 보고 판정 때 가장 유리한 액션으로 바꾼다. 기대 %는 그 대응 기준`,
      };
    }
    if (!o) return { ...none, text: view.lineLabel ?? '', mine, mineTitle, ace };
    if (oppRole === 'defense' && box) {
      // 우리 ④: GK 세이브(자동) 상대. 컷백 · 센터링도 GK 와 경합 (GK 가 튀어나와 끊는다)
      const links = (view.actions || []).filter((x) => x.enabled && isBoxLink(view, x.action)).map((x) => actName(view, x.action));
      return {
        ico: '🧤',
        text: `상대 GK ${withJosa(oppName, '과/와')} 1:1 — 세이브${links.length ? ` · ${links.join('·')}도 GK와 경합` : ''}`,
        title: `상대 GK ${oppName}: 슛은 세이브로, ${links.length ? `${links.join('·')}은 튀어나와 끊어서 막는다 (끊기면 세이브와 같음)` : '박스에서는 세이브 자동'}`,
        bubble: null, mine, mineTitle, ace, reading: false,
      };
    }
    const a = o.action;
    // 성향값 근거. ④ 상대 공격이면 기대 골 % (슛 vs 박스 연결 — 컷백 · 센터링)
    const vals = Object.entries(o.values || {}).filter(([, v]) => Number(v) > 0).sort((x, y) => y[1] - x[1]);
    const fmtV = (v) => (box ? `${Math.round(Number(v))}%` : v);
    const why = vals.length >= 2
      ? ` · ${actName(view, vals[0][0])} ${fmtV(vals[0][1])} > ${actName(view, vals[1][0])} ${fmtV(vals[1][1])}`
      : '';
    const kind = box ? `${actName(view, a)}${recvOf(opp, o)}` : (L.ACTION_TYPE_LABELS[a] ?? L.ACTION_LABELS[a] ?? a);
    return {
      ico: actIcon(view, a) || '🎯',
      text: `상대 ${oppName} ${kind}${why}`,
      title: `상대 ${oppName}의 예상 행동: ${actName(view, a)}${recvOf(opp, o)} (${box ? '기대 골' : '성향값'} 1위 — 자동은 늘 이것을 고른다)${why ? ` —${why.slice(2)}` : ''}` +
        `${linkRule ? `\n${linkRule}` : ''}`,
      bubble: `${actIcon(view, a)} ${actName(view, a)}`.trim(),
      mine,
      mineTitle,
      ace,
      reading: false,
    };
  }

  /**
   * GK 배급 대기의 정보 줄: 왼쪽 = 배급 GK · 롱패스 확률 · 롱패스 경합 선수, 오른쪽 = 우리 배급의 자동 선택 (배급 전술).
   * 상대 배급이면 상대 선택(엔진 distribution.auto — 상대 전술 · 결정적)을 왼쪽 끝에 붙이고, 상대 GK 머리 위 말풍선으로도 보인다.
   */
  function distInfo(view, d, none) {
    const us = d.side === humanOf(view);
    const lp = d.options?.long;
    const pctOf = (p) => Math.round((Number(p) || 0) * 100);
    const contest = d.contest?.name ? `${us ? '상대' : '우리'} ${d.contest.name}` : '';
    const autoA = d.auto?.action === 'long' ? 'long' : 'short';
    const autoSk = d.auto?.skillId ? (d.skills || []).find((s) => s.skillId === d.auto.skillId)?.name || '' : '';
    const autoTxt = `${L.DIST_LABELS[autoA]}${autoA === 'long' ? (lp?.sure ? ' 확정' : ` ${pctOf(d.auto?.p)}%`) : ''}${autoSk ? ` + ${autoSk}` : ''}`;
    const rule = `배급 전술 "${L.tacticLabel('distribution', d.tactic)}" — 상황 따라 = 롱패스 성공 ${pctOf(d.autoMin)}% 이상이면 길게, 아니면 짧게`;
    // 확정 롱패스 (§19.3-10): "롱패스 확정 (대지의 손바닥)" — 경합 없음
    const lpTxt = lp?.sure ? `확정 (${lp.sureName || d.sure?.name || '필살 세이브'})` : `${lp?.pct ?? '-'}%`;
    const text = `${us ? '우리' : '상대'} GK ${d.gkName ?? ''} 배급 — 롱패스 ${lpTxt}${contest && !lp?.sure ? ` (경합: ${contest})` : ''}`;
    const title = [
      text,
      `짧은 패스 = 항상 성공, 빌드업(①)부터 · 롱패스 = 성공하면 중원(②)부터, 막히면 ${us ? '상대' : '우리'}가 중원에서 공격 (세컨드볼)`,
      lp?.bonus ? `빠른 배급 +${pctOf(lp.bonus)}%` : null,
      rule,
    ].filter(Boolean).join('\n');
    if (us) {
      // 사람이 방금 고른 배급의 연출 중 (2026-09-30): 자동 예상 대신 고른 것 (캐논 킥이면 그 확률)
      const chosen = busy && lastDecision && DIST_ACTIONS.includes(lastDecision.action) ? lastDecision : null;
      if (chosen) {
        const csk = chosen.skillId ? (d.skills || []).find((s) => s.skillId === chosen.skillId) || null : null;
        const cp = chosen.action === 'long' ? (lp?.sure ? ' 확정' : ` ${csk ? csk.pct : lp?.pct ?? '-'}%`) : '';
        const chosenTxt = `${L.DIST_LABELS[chosen.action]}${cp}${csk ? ` + ${csk.name}` : ''}`;
        return { ...none, ico: '🧤', text, title, mine: `우리 선택: ${chosenTxt}`, mineTitle: `우리 GK ${d.gkName ?? ''}의 배급 — 직접 고름\n${rule}` };
      }
      return { ...none, ico: '🧤', text, title, mine: `우리: ${autoTxt}`, mineTitle: `우리 GK ${d.gkName ?? ''}의 배급 — 자동이면 이것을 고른다\n${rule}` };
    }
    return {
      ...none, ico: '🧤', text: `${text} · 상대 선택: ${autoTxt}`, title: `${title}\n상대 선택 = 상대 배급 전술 (자동 — 결정적)`,
      bubble: `${L.DIST_ICONS[autoA]} ${L.DIST_LABELS[autoA]}`,
    };
  }
  /** ④ 박스 연결 자동 규칙 문구 (기대 골 비교 — 엔진 view.boxLink rule "ev"): 정보 줄 예상 행동의 title */
  function boxRuleText(bl) {
    if (!bl || !bl.shoot) return '';
    const p = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
    const links = RECV_ACTIONS.filter((k) => bl[k])
      .map((k) => ` · ${L.BOX_LINK_LABELS[k]} ${bl[k].value}% (연결 ${p(bl[k].linkP)} × ${L.BOX_LINK_FINISH[k]} ${p(bl[k].finishP)})`).join('');
    return `④ 자동 규칙 (기대 골): 연결 성공 × 받은 선수 골이 지금 슛 골보다 높을 때만 연결 — 슛 ${bl.shoot.value}%${links}`;
  }

  /** 예상 행동 말풍선을 달 상대 듀얼 토큰: 우리 공격이면 상대 수비수(GK 제외), 우리 수비면 상대 carrier, 상대 GK 배급이면 그 GK */
  function oppDuelKey(view) {
    const human = humanOf(view);
    const opp = human === 'home' ? 'away' : 'home';
    const d = distOf(view);
    if (d) return d.side === opp && d.gkId ? `${opp}:${d.gkId}` : null;
    if (!view || view.finished || view.phase !== 'decision') return null;
    if (view.attackingSide === human && Number(view.lineIndex) >= 3) return null;
    const id = view.attackingSide === human ? view.defender?.id : view.carrier?.id;
    return id ? `${opp}:${id}` : null;
  }

  /* ------------------------------------------------------------------ */
  /* 에이스의 외침 (2026-09-29, 표시 전용 — 엔진 view.aceCall)                   */
  /* ------------------------------------------------------------------ */
  /**
   * 지금 레이아웃에서 그릴 외침 → { call, key, R(외치는 토큰), C(공 가진 토큰), curve, action, text, title, combo } | null.
   * 점선 모양 = 그 선수에게 닿는 액션: 패스로 닿으면 직선, 크로스(센터링)로만 닿으면 포물선 (자동이 고른 액션이 있으면 그것)
   */
  function aceInfo(view, Lay) {
    const c = view?.aceCall;
    if (!c || !Lay || Lay.mode !== 'play' || view.finished || view.phase !== 'decision' || c.side !== Lay.attackingSide) return null;
    const R = tokOf(Lay, c.playerId, c.side);
    const C = tokOf(Lay, Lay.carrierId, c.side);
    if (!R || !C || R === C) return null;
    const acts = Array.isArray(c.actions) ? c.actions : [];
    const action = acts.includes(c.expectedAction) ? c.expectedAction : acts.includes('pass') ? 'pass' : acts[0] || 'pass';
    const combo = c.reason === 'combo' && !!c.comboName;
    const text = combo ? `💥 ${c.comboName} 가능` : `★ 연결하면 ${c.ultimateName}`;
    const short = combo ? `💥 ${c.comboName}` : `★ ${c.ultimateName}`; // 붐비는 자리에서만 (drawAce)
    const via = acts.map((a) => actName(view, a)).join('·');
    const title = combo
      ? `${c.name}: 필살 패스를 받으면 합체기 [${c.comboName}] (${via})`
      : `${c.name}: 받으면 필살기 [${c.ultimateName}] 준비 — 게이지 ${Math.round(Number(c.gauge) || 0)} (${via})`;
    return { call: c, key: `${c.side}:${c.playerId}`, R, C, curve: action === 'cross', action, text, short, combo, title };
  }
  /** 외침 점선의 점 박스 (이름표 · 말풍선 자리 고르기의 장애물) */
  function aceDots(ace) {
    const rTok = tokPx / 2 + 3;
    const a = toPx(ace.C.x, ace.C.y);
    const b = toPx(ace.R.x, ace.R.y);
    // 토큰 안쪽 점은 빼고 (토큰 자체가 이미 장애물)
    return lineDots(a, b, ace.curve).filter((d) => {
      const cx = (d.l + d.r) / 2;
      const cy = (d.t + d.b) / 2;
      return Math.hypot(cx - a[0], cy - a[1]) > rTok && Math.hypot(cx - b[0], cy - b[1]) > rTok;
    });
  }
  /**
   * 외침 점선(공 가진 선수 → 외치는 선수, 금색 점) + 배지. 배지 자리 = 점선 위 여러 점의 양옆 · 점선 위 중 토큰 · 이름표 · 말풍선 ·
   * 공을 가장 덜 가리는 자리 (tipText 와 같은 pickSpot). anim 이고 모양이 바뀌었으면 재배치(--t-move)가 끝난 뒤 나타난다.
   * @returns 배지 박스 (없으면 null)
   */
  function drawAce(Lay, ace, anim) {
    aceG.replaceChildren();
    aceTipG.replaceChildren();
    curAce = ace;
    if (!ace) {
      aceSig = null;
      field.classList.remove('ace-off');
      return null;
    }
    const a = toPx(ace.C.x, ace.C.y);
    const b = toPx(ace.R.x, ace.R.y);
    const sig = [ace.key, ace.text, ace.curve ? 'c' : 'l', round1(a[0]), round1(a[1]), round1(b[0]), round1(b[1])].join('|');
    const fade = !!anim && !reduced && sig !== aceSig;
    aceSig = sig;
    aceG.classList.toggle('fade', fade);
    aceTipG.classList.toggle('fade', fade);
    const rTok = tokPx / 2 + 3;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < rTok * 2 + 4) return null;
    const cls = `ace-line${ace.combo ? ' combo' : ''}`;
    if (ace.curve) {
      const s = curvePoint(a, b, Math.min(0.3, rTok / len));
      const e = curvePoint(a, b, Math.max(0.7, 1 - (rTok + 3) / len));
      const cp = curveCtrl(a, b);
      const d = `M${round1(s[0])},${round1(s[1])} Q${round1(cp[0])},${round1(cp[1])} ${round1(e[0])},${round1(e[1])}`;
      aceG.append(svgEl('path', { d, class: 'ace-halo' }), svgEl('path', { d, class: cls }));
    } else {
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const common = {
        x1: round1(a[0] + u[0] * rTok), y1: round1(a[1] + u[1] * rTok),
        x2: round1(b[0] - u[0] * (rTok + 3)), y2: round1(b[1] - u[1] * (rTok + 3)),
      };
      aceG.append(svgEl('line', { ...common, class: 'ace-halo' }), svgEl('line', { ...common, class: cls }));
    }
    // 출발점 고리: 점선 층은 토큰 아래라, 공 가진 선수 옆에 붙은 마커 토큰이 첫 구간을 가리면 점선이 그 선수에게서 나가는 것처럼 보인다
    // → 공 가진 선수 둘레에 금색 점선 고리를 위 층에 그려 "여기서 나간다"를 표시
    if (d25) {
      // 2.5D: 발밑 고리 = 바닥 위 타원 (발밑 타원보다 조금 크게)
      const g = tokGeo(ace.C);
      const rx = g.gw / 2 + 6;
      aceTipG.append(svgEl('ellipse', { cx: round1(a[0]), cy: round1(a[1]), rx: round1(rx), ry: round1(rx * g.ga), class: `ace-origin${ace.combo ? ' combo' : ''}` }));
    } else aceTipG.append(svgEl('circle', { cx: round1(a[0]), cy: round1(a[1]), r: round1(rTok + 2), class: `ace-origin${ace.combo ? ' combo' : ''}` }));
    // 배지: 글자 12px 굵게, 좌우 여백 7, 높이 18
    const hh = 18;
    const at = (t) => (ace.curve ? curvePoint(a, b, t) : lerp2(a, b, t));
    const tangent = (t) => {
      const d = sub2(at(Math.min(1, t + 0.05)), at(Math.max(0, t - 0.05)));
      const l = Math.hypot(d[0], d[1]) || 1;
      return [d[0] / l, d[1] / l];
    };
    const obstacles = [...Lay.tokens.map(tokenRect), ...tagBoxes, ballRect(Lay), ...aceDots(ace).map((d) => ({ ...d, w: 0.3 }))];
    /** 배지 글 text 의 자리: ① 점선 옆 (5px 띄움) ② 외치는 선수 너머 · 옆 (배지 = 그 선수의 필살기) ③ 한 칸 더 바깥 ④ 점선 위 */
    const spotFor = (text) => {
      const w = textWidth(text, 12) + 14;
      const halfAlong = (v) => (Math.abs(v[0]) * w + Math.abs(v[1]) * hh) / 2; // 배지 박스의 v 방향 반폭
      const cands = [];
      const beside = (gap) => {
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
          const p = at(t);
          const tg = tangent(t);
          const n = [-tg[1], tg[0]];
          const off = halfAlong(n) + gap;
          for (const s of [-1, 1]) cands.push([p[0] + n[0] * off * s, p[1] + n[1] * off * s]);
        }
      };
      beside(5);
      const u1 = tangent(1);
      const n1 = [-u1[1], u1[0]];
      const ahead = rTok + 4 + halfAlong(u1);
      cands.push([b[0] + u1[0] * ahead, b[1] + u1[1] * ahead]);
      const across = rTok + 8 + halfAlong(n1);
      for (const s of [-1, 1]) cands.push([b[0] + n1[0] * across * s, b[1] + n1[1] * across * s]);
      beside(5 + hh + 4);
      for (const t of [0.5, 0.4, 0.6]) cands.push(at(t));
      const spots = cands.map(([x0, y0]) => {
        const x = clamp(x0, w / 2 + 2, W - w / 2 - 2);
        const y = clamp(y0, hh / 2 + 2, H - hh / 2 - 2);
        return { x, y, box: { l: x - w / 2, r: x + w / 2, t: y - hh / 2, b: y + hh / 2 } };
      });
      const pick = pickSpot(spots, obstacles) || spots[0];
      return { ...pick, w, text, score: spotScore(pick.box, obstacles) };
    };
    // 긴 글("★ 연결하면 메테오 슛")이 토큰 · 이름표를 가리지 않고 놓일 자리가 없으면 짧은 글("★ 메테오 슛")이 더 나은지 본다
    let pick = spotFor(ace.text);
    if (pick.score > 40 && ace.short) {
      const alt = spotFor(ace.short);
      if (alt.score < pick.score - 40) pick = alt;
    }
    const g = svgEl('g', { class: `ace-badge${ace.combo ? ' combo' : ''}`, transform: `translate(${round1(pick.x)},${round1(pick.y)})` });
    g.append(
      svgEl('rect', { x: round1(-pick.w / 2), y: -hh / 2, width: round1(pick.w), height: hh, rx: 9, ry: 9 }),
      Object.assign(svgEl('text', { x: 0, y: 4.5, 'text-anchor': 'middle' }), { textContent: pick.text }));
    aceTipG.append(g);
    return { ...pick.box, w: 1.5, role: 'ace' };
  }
  /** 비트 연출이 시작되면 외침을 걷는다 (점선 · 배지 · "줘!" 말풍선) — 재배치 때 다음 결정의 외침을 다시 그린다 */
  function clearAce() {
    aceG.replaceChildren();
    aceTipG.replaceChildren();
    aceSig = null;
    curAce = null;
    field.classList.remove('ace-off');
    tagBoxes = tagBoxes.filter((b) => b.role !== 'ace'); // 걷은 배지 자리는 연계 문구 · 결과 한 줄이 피하지 않는다
    for (const el of tokLayer.querySelectorAll('.tok.calling')) {
      el.classList.remove('calling', 'has-bubble');
      if (el._bubble) { el._bubble.textContent = ''; el._bubble.title = ''; }
    }
  }
  /** 미리보기 화살표가 외치는 선수에게 가면 외침 점선 · 배지를 숨긴다 (같은 길이 두 번 그려지지 않게) */
  function setAceOff(receiverId) {
    field.classList.toggle('ace-off', !!(curAce && receiverId != null && String(receiverId) === String(curAce.call.playerId)));
  }

  /* ------------------------------------------------------------------ */
  /* HUD (스코어 · 정보 줄 · 결정 카드 · 스킬 묶음 · 컨트롤 묶음 · 로그 서랍)       */
  /* ------------------------------------------------------------------ */
  function drawPanels(view) {
    const finished = isFinished();
    const canDecide = !busy && !finished && paused(view);
    drawHud(view, finished);
    drawInfo(view, canDecide);
    drawActions(view, canDecide, finished);
    drawSkills(view, canDecide);
    drawControls(finished, canDecide);
    drawLog(canDecide);
  }

  function drawHud(view, finished) {
    const ms = store.match || {};
    const score = view?.score || ms.score || { home: 0, away: 0 };
    const kind = view?.kind ?? ms.kind;
    const stage = view?.stage ?? ms.stage;
    const pen = view?.penalties ?? null;
    const atk = view?.attackingSide ?? ms.attackingSide;
    const tMax = view?.tensionMax ?? cfg.match?.tension?.max ?? 100;
    const penMode = curL?.mode === 'penalties';
    // 마지막 공격 보장 (view.lastAttack.active): 추가 포제션 진행 중 → "⏱ 추가시간"
    const la = !finished && view?.lastAttack?.active ? view.lastAttack : null;
    const sub = [
      kindLabel(kind),
      `포제션 ${view?.possession ?? ms.possession ?? '-'}/${view?.possessionsTotal ?? ms.possessionsTotal ?? '-'}`,
      stage === 'extraTime' ? '연장' : null,
      la ? `⏱ 추가시간${la.side === humanOf(view) ? '' : ' (상대)'}` : null,
      pen ? `승부차기 ${pen.home ?? 0}:${pen.away ?? 0}${pen.suddenDeath ? ' 서든데스' : ''}` : null,
      finished ? '경기 종료' : penMode ? null : atk === 'home' ? '우리 공격' : '상대 공격',
    ].filter(Boolean).join(' · ');
    const team = (side, name, tension) => {
      const val = Math.round(Number(tension) || 0);
      const b = bar((Number(tension) || 0) / (tMax || 100), `tension ${side}`);
      return h('div', { class: ['mh-team', side] },
        h('span', { class: 'nm ellipsis' }, name),
        h('span', { class: 'mh-ten', title: `텐션 ${val}/${tMax} (일반 액티브·간파)` },
          side === 'home' ? [h('span', {}, '텐션'), b, h('b', {}, val)] : [h('b', {}, val), b, h('span', {}, '텐션')]));
    };
    hud.classList.toggle('last-attack', !!la);
    hud.replaceChildren(
      team('home', ms.home?.name ?? view?.names?.home ?? '우리 클럽', view?.tension?.home ?? ms.home?.tension),
      h('div', { class: 'mh-score' }, `${score.home ?? 0} : ${score.away ?? 0}`),
      team('away', ms.away?.name ?? view?.names?.away ?? '상대', view?.tension?.away ?? ms.away?.tension),
      h('div', { class: 'mh-sub' }, sub));
  }

  function drawInfo(view, canDecide) {
    const ei = expectInfo(view);
    // 결정 차례는 액션 버튼 테두리(금색)로 알린다. 배지는 개입 대기일 때만 (정보 줄 폭을 예상 행동에 쓴다)
    const badge = !canDecide && ui.auto && ui.intervene && !isFinished() ? h('span', { class: 'badge badge-accent' }, '개입 대기') : null;
    info.classList.toggle('deciding', canDecide);
    info.classList.toggle('reading', !!ei.reading);
    // replaceChildren 은 null 을 "null" 글자로 넣는다 → 빈 항목은 빼고 넘긴다
    info.replaceChildren(...[
      h('span', { class: 'expect', title: ei.title || ei.text }, badge, h('span', { class: 'ico' }, ei.ico), h('span', { class: 'ellipsis' }, ei.text)),
      ei.mine ? h('span', { class: ['mine', 'ellipsis', ei.ace ? 'ace' : ''], title: ei.mineTitle || ei.mine }, ei.mine) : null,
    ].filter(Boolean));
  }

  /** 액션 버튼 한 개가 보여줄 값: 결과(Outcome), 기대 %, 받는 선수, 근사 여부(엔진이 조합 미리보기를 주지 않는 경우) */
  function actionInfo(view, a) {
    const sv = shownView(view);
    const variant = sv !== view;
    const ri = RECV_ACTIONS.includes(a.action) ? recvInfo(view, a.action) : null;
    const u = ui.ultimate ? ultOption(view) : null;
    const sk = ui.selectedSkillId ? (view.skills || []).find((s) => s.skillId === ui.selectedSkillId) || null : null;
    const ultOk = !u || ultCompatible(u, a.action);
    const nonDefault = !!(ri && ri.id !== ri.defaultId);
    // 받는 선수별 결과(outcomesByReceiver)는 스킬·필살기 없이 계산된다 → 변형이 도착 구역을 바꾸면(스루 패스: 중원 → 상대 진영)
    // 쓰지 않는다 (구역 문구·화살표가 틀린다). 그때는 아래에서 변형 결과의 받는 선수 이름만 바꾼다 (≈)
    const sameArrival = !variant || view.receivers?.[a.action]?.arrival === sv?.receivers?.[a.action]?.arrival;
    const byR = ri && sameArrival ? view.outcomesByReceiver?.[a.action]?.[ri.id] ?? null : null;
    let out = sv?.outcomes?.[a.action] ?? null;
    let approx = false;
    if (nonDefault && byR) {
      out = byR;
      if (variant) approx = true; // 스킬·필살기 + 기본 아닌 받는 선수: 엔진 조합 미리보기가 없어 기본 규칙 결과
    }
    // 변형(예: 스루 패스로 후보가 FW 로 바뀜)에서 기본이 아닌 선수를 골랐는데 받는 선수별 결과가 없으면:
    // 도착 구역은 같으므로 변형 결과의 받는 선수 이름만 바꿔 보여주고 근사로 표시한다
    if (ri && out?.success?.receiver && out.success.receiver.id !== ri.id) {
      const from = out.success.receiver.name;
      const to = nameOf(view, humanOf(view), ri.id);
      if (from && to) {
        const sw = (t) => (typeof t === 'string' ? t.split(from).join(to) : t);
        out = { ...out, success: { ...out.success, receiver: { ...out.success.receiver, id: ri.id, name: to }, short: sw(out.success.short), label: sw(out.success.label) } };
      }
      approx = true;
    }
    let pct = a.expectedPct ?? null;
    if (u && ultOk && u.expectedPct?.[a.action] != null) {
      pct = u.expectedPct[a.action];
      if (sk || nonDefault) approx = true;
    } else if (sk && sk.expectedPct?.[a.action] != null) {
      pct = sk.expectedPct[a.action];
      if (nonDefault) approx = true;
    } else if (nonDefault && byR?.expectedPct != null) {
      pct = byR.expectedPct;
    }
    // 제목·약점 문구: 켠 필살기·스킬의 효과를 반영한 엔진 문구 (예: 필살 패스 → "짝 무효 (바람의 실)", 필살 슛 → "필살 슛 · 박스 슛 취급")
    const shown = (u && ultOk && u.actions?.[a.action]) || (sk && sk.actions?.[a.action]) || null;
    return { out, pct, approx, ri, ultOk, nonDefault, label: shown?.label ?? null, hint: shown?.hint ?? null };
  }

  /**
   * 결정 카드 한 줄 (아래 가운데): 공격 = 켜진 액션만 (최대 4 — 드리블 · 패스 · 크로스 · 중거리 슛), 수비 = 3 (태클 · 인터셉트 · 버티기),
   * 결정 차례가 아니면 우리 당사자의 성향값 카드 (자동 선택 표시), 고를 것이 없으면 넓은 상태 카드 1장.
   * 클래스: action-grid k-atk|k-def|k-wide n-<장 수> [auto] [deciding]
   */
  function drawActions(view, canDecide, finished) {
    const penMode = curL?.mode === 'penalties';
    const setRow = (kind, n, auto = false) => {
      actGrid.className = ['action-grid', `k-${kind}`, `n-${n}`, auto ? 'auto' : '', canDecide ? 'deciding' : ''].filter(Boolean).join(' ');
    };
    const dist = !finished && !penMode ? distOf(view) : null;
    if (dist) { drawDistActions(view, dist, canDecide, setRow); return; }
    if (finished || penMode || !view || view.phase !== 'decision') {
      // 고를 액션이 없는 구간: 한 칸짜리 상태 표시
      const pen = view?.penalties;
      setRow('wide', 1);
      actGrid.replaceChildren(h('button', { class: 'btn act-btn', type: 'button', disabled: true },
        h('span', { class: 'act-title' }, h('span', { class: 'act-nm' }, finished ? '🏁 경기 종료' : penMode ? '🥅 승부차기 — 자동 진행' : `⏳ ${view?.lineLabel ?? '진행 중'}`)),
        h('span', { class: 'btn-sub' }, finished
          ? '결과를 확인하세요'
          : penMode ? `키커 vs GK · ${pen ? `${pen.home ?? 0} : ${pen.away ?? 0}${pen.suddenDeath ? ' · 서든데스' : ''}` : ''}` : '다음 포제션 준비')));
      return;
    }
    const human = humanOf(view);
    const role = view.attackingSide === human ? 'attack' : 'defense';
    if (!canDecide && !ui.auto && busy && !(role === 'defense' && Number(view.lineIndex) >= 3)) {
      // 수동(자동 OFF)의 연출 중: 다음 결정의 성향 카드("자동 선택")를 미리 보이지 않는다 — 자동이 고른 것처럼 읽힌다.
      // 연출이 끝나면 결정 카드가 나온다. (GK 세이브 자동 카드는 그대로)
      setRow('wide', 1);
      actGrid.replaceChildren(h('button', { class: 'btn act-btn', type: 'button', disabled: true },
        h('span', { class: 'act-title' }, h('span', { class: 'act-nm' }, `⏳ ${view.lineLabel ?? '진행 중'}`)),
        h('span', { class: 'btn-sub' }, '연출이 끝나면 직접 고른다')));
      return;
    }
    if (!canDecide) { drawAutoActions(view, role, setRow); return; }

    const acts = (Array.isArray(view.actions) ? view.actions : []).filter((a) => a.enabled !== false);
    if (!acts.length) { drawAutoActions(view, role, setRow); return; }
    const infos = acts.map((a) => ({ a, i: actionInfo(view, a) }));
    // 추천: 엔진 recommended (기본 조건). 스킬·필살기·받는 선수를 바꿨으면 지금 보이는 기대 % 최고
    const toggled = !!(ui.selectedSkillId || ui.ultimate || infos.some((x) => x.i.nonDefault));
    let recAction = acts.find((a) => a.recommended)?.action ?? null;
    if (toggled) {
      let best = -1;
      recAction = null;
      for (const { a, i } of infos) if (i.ultOk && i.pct != null && i.pct > best) { best = i.pct; recAction = a.action; }
    }
    // 짝 칩: 상대 예상 공격의 짝 수비 (엔진 view.counter — 크로스 ↔ 버티기)
    const pairWith = role === 'defense' && !view.opponentReading ? counterOf(view)[view.expected?.attack?.action] ?? null : null;
    setRow(role === 'attack' ? 'atk' : 'def', acts.length);
    actGrid.replaceChildren(...infos.map(({ a, i }) =>
      actionButton(view, a, i, { role, rec: a.action === recAction, pair: pairWith === a.action })));
  }

  /**
   * ④ 박스 연결 + 필살 패스: 받는 선수의 필살 슛과 등록된 합체기 짝(combos.json)이면 그 이름, 아니면 null.
   * 엔진 E1(§19.4 — 합체기는 등록된 짝만)과 같은 조건. 등록되지 않은 짝은 합체기 표시 없음 ("합체기" 폴백 없음)
   */
  function boxComboName(view, u, receiverId) {
    if (!u || u.type !== 'pass' || !receiverId) return null;
    const snap = playerSnap(humanOf(view), receiverId);
    const skills = Array.isArray(data.skills) ? data.skills : [];
    const shot = (Array.isArray(snap?.skillIds) ? snap.skillIds : []).map((id) => skills.find((s) => s.id === id)).find((s) => s?.ultimate?.type === 'shot');
    if (!shot) return null;
    return safe(() => match.comboName?.(data, u.skillId, shot.id)) || null;
  }

  function actionButton(view, a, info, { role, rec, pair }) {
    const enabled = info.ultOk;
    const box = isBoxLink(view, a.action);
    // ④ 박스 연결은 짧은 이름 "컷백 → ○○" · "센터링 → ○○" (엔진 label "컷백 패스"는 title 에)
    const label = box ? actName(view, a.action) : info.label ?? a.label ?? L.ACTION_LABELS[a.action] ?? a.action;
    const human = humanOf(view);
    const ri = info.ri;
    const rName = ri ? nameOf(view, human, ri.id) : '';
    const out = info.out;
    const okShort = out?.success?.short || out?.success?.label || '';
    const ngShort = out?.fail?.short || out?.fail?.label || '';
    const okLong = out?.success?.label ? `성공: ${out.success.label}` : okShort;
    const ngLong = out?.fail?.label ? `실패: ${out.fail.label}` : ngShort;
    const pctText = info.pct != null ? `${info.approx ? '≈' : ''}${info.pct}%` : '';
    let hintText = stripRecvHint(info.hint ?? a.hint);
    const u = ui.ultimate && info.ultOk ? ultOption(view) : null;
    const combo = box ? boxComboName(view, u, ri?.id) : null;
    if (box) {
      // 막혔을 때 결과는 카드의 실패 줄(엔진 outcome)에 이미 있다 → 약점 줄은 경합 상대만 (엔진 힌트의 "(막히면 …)" 은 중복이라 뺀다)
      hintText = [combo ? `💥 ${combo}` : null, hintText.replace(/\s*\(막히면[^)]*\)/, '') || 'GK와 경합', '포제션당 1회'].filter(Boolean).join(' · ');
    }
    // 이번 포제션 첫 듀얼 보너스 (캐논 킥 롱패스 성공 · 소매치기 상한 — 엔진 ballState.pending.nextBonus, 이미 % 에 들어 있다):
    // 카드 % 가 왜 높은지 약점 줄 맨 앞에 짧게 (2026-09-30)
    const nextBonus = role === 'attack' ? Number(view.ballState?.pending?.nextBonus) || 0 : 0;
    const bonusNote = nextBonus > 0 ? `첫 듀얼 +${Math.round(nextBonus * 100)}%` : '';
    if (bonusNote) hintText = [bonusNote, hintText].filter(Boolean).join(' · ');
    const formula = role === 'defense' ? hintText.split(' · ')[0] : '';
    const title = [
      `${box ? `${a.label ?? label}` : label}${rName ? ` → ${rName}` : ''}${pctText ? ` ${pctText}` : ''}${rec && enabled ? ' (추천)' : ''}${pair ? ' (짝)' : ''}`,
      role !== 'attack' ? '% = 막을 확률 (상대 예상 행동 기준)'
        : box ? `% = 득점 기대 (연결 성공 × ${rName || '받은 선수'} ${L.BOX_LINK_FINISH[a.action]} 골)`
          : Number(view.lineIndex) === 2 && a.action !== 'shoot' ? '% = 이번 공격 득점 기대 (돌파 × 박스 슛)'
            : a.action === 'shoot' ? '% = 골 확률' : '% = 돌파 확률',
      box ? `GK가 튀어나와 끊으면 GK 배급과 같음 · 박스 연결은 포제션당 1회${combo ? ` · 필살 패스 → ${rName} 필살 슛 = 합체기 [${combo}]` : ''}` : null,
      // ④ 추천 = 자동 선택 (기대 골 규칙 — 자동이 쓸 필살기 포함): 그 기준 % 가 카드 % 와 다르면 함께 적는다
      a.autoExpectedPct != null && a.autoExpectedPct !== a.expectedPct ? `자동 기준 기대 골 ${a.autoExpectedPct}% (자동이 쓸 필살기 포함 — 추천 기준)` : null,
      bonusNote ? `${bonusNote} — 이번 포제션 첫 듀얼 보너스 (% 에 포함)` : null,
      hintText,
      out?.success?.label, out?.fail?.label,
      info.approx ? '≈ 스킬·필살기와 받는 선수 조합은 기본 결과 기준 (근사)' : null,
      !info.ultOk ? '필살기와 함께 쓸 수 없는 액션' : null,
      ri && ri.candidates.length > 1 ? `필드의 후보 토큰을 탭하면 받는 선수가 바뀐다${box ? ' (박스 안 후보)' : ''}` : null,
    ].filter(Boolean).join('\n');
    const chips = [
      pair ? h('span', { class: 'chip chip-pair' }, '짝') : null,
      rec && enabled ? h('span', { class: 'chip chip-rec' }, '추천') : null,
    ].filter(Boolean);
    // 공격: 추천 칩은 성공 줄 오른쪽 (제목 폭은 받는 선수 이름에 쓴다), 성공·실패는 짧은 문구 한 줄씩 (긴 문구는 title) + 약점 힌트 한 줄.
    // 수비: 짝·추천 칩 + 판정 스탯을 아래 줄에
    const lines = role === 'attack'
      ? [
        h('span', { class: ['act-out', 'ok', out?.success?.goal ? 'goal' : ''] },
          h('span', { class: 'txt short' }, okShort), h('span', { class: 'txt long' }, okLong), ...chips),
        h('span', { class: ['act-out', 'ng', out?.fail?.conceded || out?.fail?.goal ? 'risk' : ''] },
          h('span', { class: 'txt short' }, ngShort), h('span', { class: 'txt long' }, ngLong)),
        hintText ? h('span', { class: 'act-hint' }, hintText) : null,
      ]
      : [
        h('span', { class: 'act-out ok' }, h('span', { class: 'txt' }, okShort)),
        h('span', { class: ['act-out', 'ng', out?.fail?.conceded || out?.fail?.goal ? 'risk' : ''] }, h('span', { class: 'txt' }, ngShort)),
        h('span', { class: 'act-foot' }, ...chips, formula ? h('span', { class: 'act-formula' }, formula) : null),
      ];
    return h('button', {
      class: ['btn', 'act-btn', enabled ? 'decide' : 'dim', rec && enabled ? 'rec' : '', info.ultOk && ui.ultimate && ultOption(view) ? 'ult-on' : '',
        box ? 'box-link' : '', combo ? 'combo' : ''],
      type: 'button',
      disabled: !enabled,
      dataset: { action: a.action, receiver: ri?.id ?? '' },
      title,
      onclick: () => decide(a.action),
      onpointerenter: (e) => { if (!e.pointerType || e.pointerType === 'mouse') showArrow(a.action); },
      onpointerdown: () => showArrow(a.action),
      onpointerleave: () => hideArrow(a.action),
      onpointercancel: () => hideArrow(a.action),
      onfocus: () => showArrow(a.action),
      onblur: () => hideArrow(a.action),
    },
    h('span', { class: 'act-title' },
      h('span', { class: 'act-nm' },
        h('span', { class: 'act-ico' }, actIcon(view, a.action)),
        h('span', { class: 'act-lbl' }, label),
        ri ? h('span', { class: 'act-rcv' },
          h('span', { class: 'act-arrow' }, '→'),
          h('span', { class: 'act-rname' }, rName),
          ri.candidates.length > 1 ? h('span', { class: 'act-more' }, '▾') : null) : null),
      pctText ? h('b', { class: 'act-pct' }, pctText) : null),
    ...lines);
  }

  /* ---- GK 배급 (2026-09-29) ---- */
  /** 우리 배급에서 켠 배급 스킬 (캐논 킥 — view.distribution.skills 중 쓸 수 있는 것), 아니면 null */
  function distSkill(view) {
    const d = distOf(view);
    if (!d || !ui.selectedSkillId || d.side !== humanOf(view)) return null;
    return (d.skills || []).find((s) => s.skillId === ui.selectedSkillId && s.enabled) || null;
  }
  /**
   * GK 배급 카드 두 장 (짧은 패스 · 롱패스 — 엔진 view.distribution.options, 순서 order).
   * 우리 배급 + 결정 차례: 고르는 카드 (% · 성공/실패 한 줄 · 추천 · 캐논 킥을 켜면 롱패스 % = 스킬 확률, 짧은 패스는 흐리게).
   * 그 밖(자동 진행 · 상대 배급): 자동 카드 — 자동이 고른 쪽에 "자동" (우리 = 배급 전술, 상대 = 상대 전술 — 엔진 distribution.auto).
   * 수동(자동 OFF)의 연출 중 우리 배급은 넓은 대기 카드 (자동 선택처럼 읽히지 않게).
   */
  function drawDistActions(view, d, canDecide, setRow) {
    const us = d.side === humanOf(view);
    if (us && !canDecide && !ui.auto && busy) {
      setRow('wide', 1);
      actGrid.replaceChildren(h('button', { class: 'btn act-btn', type: 'button', disabled: true },
        h('span', { class: 'act-title' }, h('span', { class: 'act-nm' }, `🧤 ${view.lineLabel ?? '우리 GK 배급'}`)),
        h('span', { class: 'btn-sub' }, '연출이 끝나면 직접 고른다')));
      return;
    }
    const deciding = canDecide && us;
    const sk = deciding ? distSkill(view) : null;
    const order = Array.isArray(d.order) && d.order.length ? d.order : DIST_ACTIONS;
    const opts = order.map((a) => d.options?.[a]).filter(Boolean);
    // 추천: 엔진 recommended (롱패스 확률 ≥ longPassAutoMin → 길게). 캐논 킥을 켰으면 그 확률로
    const rec = sk ? (Number(sk.p) >= Number(d.autoMin) ? 'long' : 'short') : d.recommended;
    setRow('dist', opts.length, !deciding);
    // 확정 배급 (§19.3-10 — 필살 세이브 sureDistribution 뒤 한 번): 롱패스 % 칸 = "확정 (필살기 이름)" (캐논 킥을 켜도 확정)
    actGrid.replaceChildren(...opts.map((o) => distButton(view, d, o, {
      deciding, sk, rec: deciding && o.action === rec, pct: o.action === 'long' && sk && !o.sure ? sk.pct : o.pct,
    })));
  }
  function distButton(view, d, o, { deciding, sk, rec, pct }) {
    const a = o.action;
    const us = d.side === humanOf(view);
    const enabled = deciding && !(sk && a === 'short'); // 캐논 킥은 롱패스와만
    const autoPick = !deciding && d.auto?.action === a;
    const starter = o.success?.starterName ?? '';
    const okShort = o.success?.short ?? '';
    const ngShort = o.fail ? o.fail.short : '실패 없음';
    const pctOf = (x) => Math.round((Number(x) || 0) * 100);
    // 확정 롱패스 (엔진 options.long.sure · sureName): % 칸 "확정 (대지의 손바닥)", 실패 줄은 숨긴다
    const sure = a === 'long' && !!o.sure;
    const sureName = sure ? (o.sureName || d.sure?.name || '') : '';
    // 카드 제목 줄은 받는 선수 이름과 나눠 쓰므로 % 칸은 "확정"만, 필살기 이름은 힌트 줄 맨 앞 (§19.19 K4)
    const pctText = sure ? '확정' : `${pct}%`;
    // 카드 힌트 한 줄 (좁다 — 2026-09-30): 켠 캐논 킥의 첫 듀얼 보너스를 맨 앞에 짧게, 그다음 경합 선수 · 빠른 배급. 긴 문구는 title
    const hint = a === 'long'
      ? [sure ? `${sureName || '필살 세이브'} — 판정 없이 성공` : null, sk?.nextDuelBonus ? `${sk.name} 첫 듀얼+${pctOf(sk.nextDuelBonus)}%` : null,
        !sure && d.contest?.name ? `경합 ${d.contest.name}` : null,
        o.bonus ? `빠른 배급 +${pctOf(o.bonus)}%` : null].filter(Boolean).join(' · ') || '상대 MF 와 경합'
      : '항상 성공 · 체력 · 텐션 그대로';
    const hintLong = a === 'long'
      ? [d.contest?.name ? `경합 ${us ? '상대' : '우리'} ${d.contest.name}` : null, o.bonus ? `빠른 배급 +${pctOf(o.bonus)}%` : null,
        sk ? `${sk.name}: 성공하면 첫 듀얼 +${pctOf(sk.nextDuelBonus)}%` : null].filter(Boolean).join(' · ') || '상대 MF 와 경합'
      : hint;
    const title = [
      `${L.DIST_LABELS[a]}${starter ? ` → ${starter}` : ''} ${sure && sureName ? `확정 (${sureName})` : pctText}${rec && enabled ? ' (추천)' : ''}${autoPick ? ' — 자동 선택' : ''}`,
      o.success?.label ? `성공: ${o.success.label}` : null,
      sure ? `실패 없음 — ${sureName || '필살 세이브'} 뒤 롱패스 확정 (이 배급 한 번)`
        : o.fail?.label ? `실패: ${o.fail.label}` : '실패 없음 (짧은 패스는 항상 성공)',
      hintLong,
      deciding && sk && a === 'short' ? `${sk.name}은(는) 롱패스와만 — 스킬을 끄면 고를 수 있다` : null,
      deciding && a === 'long' && sk ? `${sk.name} 사용 (텐션 ${sk.cost ?? sk.tension ?? 0})` : null,
      // 추천이 캐논 킥 롱패스 기준이면 (엔진 recommendedSkillId — 기본 확률은 문턱 아래) 그 사실을 적는다
      deciding && a === 'long' && rec && !sk && d.recommendedSkillId
        ? `추천 = ${(d.skills || []).find((s) => s.skillId === d.recommendedSkillId)?.name ?? '배급 스킬'}과 함께 쓸 때 (상황 따라 규칙)` : null,
    ].filter(Boolean).join('\n');
    const chips = [
      rec && enabled ? h('span', { class: 'chip chip-rec' }, '추천') : null,
      autoPick ? h('span', { class: 'chip chip-auto' }, '자동') : null,
    ].filter(Boolean);
    const arrow = (fn) => (deciding ? fn : undefined);
    return h('button', {
      class: ['btn', 'act-btn', 'dist-btn', deciding ? (enabled ? 'decide' : 'dim') : 'auto-view', autoPick ? 'auto-pick' : '',
        rec && enabled ? 'rec' : '', sk && a === 'long' ? 'skill-on' : '', sure ? 'sure' : ''],
      type: 'button',
      disabled: !enabled,
      dataset: { action: a, receiver: o.success?.starterId ?? '' },
      title,
      onclick: () => decide(a),
      onpointerenter: arrow((e) => { if (!e.pointerType || e.pointerType === 'mouse') showArrow(a); }),
      onpointerdown: arrow(() => showArrow(a)),
      onpointerleave: arrow(() => hideArrow(a)),
      onpointercancel: arrow(() => hideArrow(a)),
      onfocus: arrow(() => showArrow(a)),
      onblur: arrow(() => hideArrow(a)),
    },
    h('span', { class: 'act-title' },
      h('span', { class: 'act-nm' },
        h('span', { class: 'act-ico' }, L.DIST_ICONS[a] ?? ''),
        h('span', { class: 'act-lbl' }, L.DIST_LABELS[a] ?? a),
        starter ? h('span', { class: 'act-rcv' }, h('span', { class: 'act-arrow' }, '→'), h('span', { class: 'act-rname' }, starter)) : null),
      h('b', { class: ['act-pct', deciding ? '' : 'muted', sure ? 'sure' : ''] }, pctText)),
    h('span', { class: ['act-out', 'ok'] }, h('span', { class: 'txt short' }, okShort), ...chips),
    h('span', { class: ['act-out', 'ng', o.fail ? 'risk' : 'none'] }, h('span', { class: 'txt short' }, sure ? '실패 없음 (확정)' : ngShort)),
    h('span', { class: 'act-hint' }, hint));
  }

  /** 결정 차례가 아닐 때(자동 진행·연출 중): 우리 당사자의 성향값과 자동 선택 (GDD v0.5 §9.9 — 자동은 1위 액션) */
  function drawAutoActions(view, role, setRow) {
    const ex = view.expected?.[role] || null;
    const box = Number(view.lineIndex) >= 3;
    if (!ex || (role === 'defense' && box)) {
      // GK 듀얼(세이브 자동) 등: 넓은 상태 카드 1장
      const gk = role === 'defense' ? nameOf(view, humanOf(view), ex?.playerId ?? view.defender?.id) : '';
      setRow('wide', 1);
      actGrid.replaceChildren(h('button', { class: 'btn act-btn', type: 'button', disabled: true },
        h('span', { class: 'act-title' }, h('span', { class: 'act-nm' }, role === 'defense' && box ? `🧤 ${gk ? `${gk} ` : ''}세이브 — 자동` : `⏳ ${view.lineLabel ?? ''}`)),
        h('span', { class: 'btn-sub' }, role === 'defense' && box ? 'GK 듀얼은 세이브 자동 (필살 세이브도 조건이 맞으면 자동)' : '')));
      return;
    }
    const entries = Object.entries(ex.values || {})
      .filter(([k, v]) => Number(v) > 0 || k === ex.action)
      .sort((x, y) => ACTION_ORDER.indexOf(x[0]) - ACTION_ORDER.indexOf(y[0]));
    const hints = new Map((view.actions || []).map((a) => [a.action, a]));
    // ④ 공격 (2026-09-29 기대 골 규칙): 값 = 기대 골 % (슛 = 지금 슛 골, 컷백 · 센터링 = 연결 성공 × 받은 선수 골 — 엔진 boxLinkEval) — 자동은 1위
    const boxAtk = role === 'attack' && box;
    const bl = boxAtk ? view.boxLink : null;
    const pctP = (x) => `${Math.round((Number(x) || 0) * 100)}%`;
    setRow(role === 'attack' ? 'atk' : 'def', Math.max(1, entries.length), true);
    actGrid.replaceChildren(...entries.map(([k, v]) => {
      const auto = k === ex.action;
      const a = hints.get(k);
      const link = isBoxLink(view, k);
      const rcv = link && auto && ex.receiverId ? nameOf(view, humanOf(view), ex.receiverId) : '';
      const shown = boxAtk ? `${Math.round(Number(v))}%` : String(v);
      const detail = link && bl?.[k] ? ` (연결 ${pctP(bl[k].linkP)} × ${L.BOX_LINK_FINISH[k]} ${pctP(bl[k].finishP)})` : '';
      return h('button', {
        class: ['btn', 'act-btn', 'auto-view', auto ? 'auto-pick' : ''],
        type: 'button',
        disabled: true,
        dataset: { action: k },
        title: boxAtk
          ? `${actName(view, k)} 기대 골 ${shown}${detail}${auto ? ` — 자동이면 이 액션${rcv ? ` → ${rcv}` : ''}` : ''}\n④ 자동 규칙: 연결 기대 골이 슛보다 높을 때만 연결 (쓸 필살기 포함)`
          : `${L.ACTION_LABELS[k] ?? k} 성향값 ${v}${auto ? ' — 자동이면 이 액션' : ''}`,
      },
      h('span', { class: 'act-title' },
        h('span', { class: 'act-nm' }, h('span', { class: 'act-ico' }, actIcon(view, k)),
          ` ${link || boxAtk ? actName(view, k) : a?.label ?? L.ACTION_LABELS[k] ?? k}${rcv ? ` → ${rcv}` : ''}`),
        h('b', { class: 'act-pct muted' }, shown)),
      h('span', { class: ['act-out', auto ? 'auto' : 'muted'] }, auto ? '자동 선택' : boxAtk ? '기대 골' : '성향값'),
      a?.hint ? h('span', { class: 'act-why' }, box ? stripRecvHint(a.hint).replace(/\s*\(막히면[^)]*\)/, '') : stripRecvHint(a.hint)) : null);
    }));
  }

  /**
   * GK 배급의 스킬 묶음: 우리 배급 GK 의 배급 스킬(캐논 킥 — view.distribution.skills) 토글. 켜면 롱패스 카드 % = 스킬 확률,
   * 결정 { action: "long", skillId }. 상대 배급 중이면 안내 한 줄
   */
  function drawDistSkills(view, d, canDecide) {
    const us = d.side === humanOf(view);
    const items = skillList(view).map((s) => {
      const on = ui.selectedSkillId === s.skillId;
      const cost = s.cost ?? s.tension ?? 0;
      return h('button', {
        class: ['btn', 'btn-sm', 'sk-btn', 'dist-skill', on ? 'active' : ''],
        type: 'button',
        disabled: !canDecide || s.enabled === false,
        dataset: { skill: s.skillId },
        'aria-pressed': on ? 'true' : 'false',
        title: [
          s.name, s.description,
          `롱패스 ${s.pct}% (스킬 없이 ${d.options?.long?.pct ?? '-'}%)${s.nextDuelBonus ? ` · 성공하면 첫 듀얼 +${Math.round(s.nextDuelBonus * 100)}%` : ''}`,
          `텐션 ${cost} · 롱패스와 함께만`,
          s.enabled === false && s.reason ? `(${s.reason})` : null,
        ].filter(Boolean).join('\n'),
        onclick: () => {
          if (busy || !canDecideNow(getView())) return;
          ui.selectedSkillId = on ? null : s.skillId;
          drawPanels(curView);
          if (arrowFor) showArrow(arrowFor);
        },
      },
      h('span', { class: 'sk-nm ellipsis' }, h('span', { class: 'sk-ico', 'aria-hidden': 'true' }, '⚡ '), s.name ?? s.skillId),
      h('span', { class: 'sk-cost', 'aria-label': `텐션 ${cost}` }, `✦${cost}`));
    });
    skillRow.classList.remove('many', 'over');
    if (!items.length) {
      skillRow.replaceChildren(h('span', { class: 'tiny muted' }, us ? 'GK 배급 — 쓸 수 있는 스킬 없음' : '상대 GK 배급 중'));
      return;
    }
    skillRow.replaceChildren(...items);
  }

  function drawSkills(view, canDecide) {
    const dist = distOf(view);
    if (dist) { drawDistSkills(view, dist, canDecide); return; }
    const items = [];
    const guard = () => !busy && canDecideNow(getView());
    // 1) 필살기 (개인 게이지 — 텐션과 별도)
    for (const u of Array.isArray(view?.ultimateOptions) ? view.ultimateOptions : []) {
      const isSave = u.type === 'save';
      const on = !!ui.ultimate && u.usable && !isSave;
      const name = u.comboName || u.name;
      const gaugeTxt = `${Math.round(Number(u.gauge) || 0)}%`;
      items.push(h('button', {
        class: ['btn', 'btn-sm', 'sk-btn', 'ult-btn', `ut-${u.type}`, u.usable && !isSave ? 'ready' : '', u.comboName ? 'combo' : '', on ? 'active' : ''],
        type: 'button',
        disabled: !canDecide || !u.usable || isSave,
        dataset: { ultimate: u.skillId, type: u.type, tier: u.tier ?? '' },
        'aria-pressed': on ? 'true' : 'false',
        title: [
          `${u.comboName ? `합체기 [${u.comboName}] — ` : ''}${L.ULT_TYPE_LABELS[u.type] ?? '필살기'} ${u.name}${u.tier ? ` (${u.tier})` : ''}`,
          u.description,
          u.cutinLine ? `“${u.cutinLine}”` : null,
          `필살 게이지 ${gaugeTxt}`,
          !u.usable && u.reason ? `(${u.reason})` : null,
          u.usable && u.type === 'pass' && Number(view?.lineIndex) >= 3 ? '④ 박스 연결(컷백·센터링)과 함께 — 받는 선수의 필살 슛과 등록된 짝이면 박스 안 합체기' : null,
          u.usable && !isSave ? '토글한 뒤 액션을 고르면 함께 쓴다' : null,
        ].filter(Boolean).join('\n'),
        onclick: () => {
          if (!guard()) return;
          ui.ultimate = !ui.ultimate;
          relayout(); // 필살 패스: 기본 받는 선수(합체기)가 바뀔 수 있다
          drawPanels(curView);
        },
      },
      h('span', { class: 'sk-nm ellipsis' }, `${u.comboName ? '💥' : '✨'} ${name}`),
      isSave ? h('span', { class: 'sk-cost' }, '자동')
        : u.usable ? h('span', { class: 'sk-cost' }, u.comboName ? '합체기' : '필살기')
          : h('span', { class: 'sk-gauge', 'aria-label': `필살 게이지 ${gaugeTxt}` }, h('i', { style: { width: gaugeTxt } }))));
    }
    // 2) 간파 (스킬 또는 사용권 — 누르면 즉시 사용, 결정 대기 유지)
    const g = view?.gaanpa;
    const usedHere = ui.gaanpaUsedKey && ui.gaanpaUsedKey === ui.pickKey;
    if (g && (g.source || usedHere)) {
      const used = usedHere || g.reason === '이번 듀얼에 이미 간파';
      const costTxt = g.source === 'ticket' ? `사용권 ${g.tickets ?? 0}` : g.source === 'skill' ? `✦${g.cost ?? 0}` : '';
      // 수비 간파 배율 = readBoost 스킬 데이터 (엔진 ticketReadMult 와 같은 출처)
      const readMult = Number((data?.skills || []).find((sk) => sk?.active?.effect === 'readBoost')?.active?.params?.readMult) || 2;
      const roleTxt = view?.attackingSide === humanOf(view) ? '상대 짝 맞힘 무효' : `짝을 맞히면 ×${readMult.toFixed(1)}`;
      items.push(h('button', {
        class: ['btn', 'btn-sm', 'sk-btn', 'gaanpa-btn', used ? 'active' : ''],
        type: 'button',
        disabled: !canDecide || !g.usable,
        dataset: { gaanpa: g.source || 'used' },
        title: [
          `간파 (${g.source === 'ticket' ? '사용권' : '스킬'}) — 이번 듀얼 ${roleTxt}`,
          g.source === 'ticket' ? `비용: 사용권 1회 (남은 ${g.tickets ?? 0})` : g.source === 'skill' ? `비용: 텐션 ${g.cost ?? 0}` : null,
          !g.usable && g.reason ? `(${g.reason})` : null,
          g.usable ? '누르면 바로 쓰고, 액션은 이어서 고른다' : null,
        ].filter(Boolean).join('\n'),
        onclick: () => {
          if (!guard() || !g.usable) return;
          ui.gaanpaUsedKey = ui.pickKey;
          doStep({ gaanpa: g.source || true });
        },
      },
      h('span', { class: 'sk-nm' }, used ? '👁 간파 ✓' : '👁 간파'),
      h('span', { class: 'sk-cost' }, used ? '사용' : !g.usable && canDecide && g.reason ? shortReason(g.reason) : costTxt)));
    }
    // 3) 일반 액티브 (토글 → 액션과 함께). 간파 스킬은 위 간파 버튼으로만
    for (const s of Array.isArray(view?.skills) ? view.skills : []) {
      if (s.gaanpa) continue;
      const on = ui.selectedSkillId === s.skillId;
      items.push(h('button', {
        class: ['btn', 'btn-sm', 'sk-btn', on ? 'active' : ''],
        type: 'button',
        disabled: !canDecide || s.enabled === false,
        dataset: { skill: s.skillId },
        'aria-pressed': on ? 'true' : 'false',
        title: [s.name, s.description, `텐션 ${s.cost ?? s.tension ?? 0}`, s.enabled === false && s.reason ? `(${s.reason})` : null].filter(Boolean).join('\n'),
        onclick: () => {
          if (!guard()) return;
          ui.selectedSkillId = on ? null : s.skillId;
          // 스루 패스 등: 받는 선수 후보·도착 구역이 바뀌므로 필드도 다시 그린다 (미리보기 = 실제)
          relayout();
          drawPanels(curView);
        },
      },
      h('span', { class: 'sk-nm ellipsis' }, h('span', { class: 'sk-ico', 'aria-hidden': 'true' }, '⚡ '), s.name ?? s.skillId),
      h('span', { class: 'sk-cost', 'aria-label': `텐션 ${s.cost ?? s.tension ?? 0}` }, `✦${s.cost ?? s.tension ?? 0}`)));
    }
    if (!items.length) {
      skillRow.classList.remove('many', 'over');
      skillRow.replaceChildren(h('span', { class: 'tiny muted' },
        curL?.mode === 'penalties' ? '승부차기 중에는 스킬을 쓸 수 없음' : '쓸 수 있는 스킬·필살기 없음'));
      return;
    }
    // 오른쪽 아래 묶음 (상자 96px — 필드 위로 자라지 않는다): 3개까지 한 줄에 하나씩 세로로 쌓고, 4개 이상이면 2열 압축 모드
    // (이름 두 줄까지 · ✦ 비용은 작게 · 필살기 "필살기/합체기" 꼬리표만 숨김 — css/match.css), 7개 이상(2열 × 3줄 초과)은 상자 안 스크롤(.over)
    skillRow.classList.toggle('many', items.length >= 4);
    skillRow.classList.toggle('over', items.length > 6);
    skillRow.replaceChildren(...items);
  }

  /**
   * 컨트롤(자동 · 배속 · 개입) 변경 후 다시 그리기. 비트 연출 중에는 컨트롤과 정보 줄만 — 스코어·로그·필드는 연출 단계가
   * 갱신한다 (연출 중 curView 는 아직 판정 전 view 라 스코어가 되돌아가거나 결과가 연출보다 먼저 보이면 안 된다).
   */
  function refreshControls() {
    if (busy) {
      drawControls(isFinished(), false);
      drawInfo(curView, false);
      return;
    }
    relayout(); // 자동 ↔ 수동 전환: 받는 선수 후보 표시(확정/불확실)가 바뀔 수 있다
    drawPanels(curView);
  }

  /**
   * 왼쪽 아래 컨트롤 묶음 (목업: 자동 OFF 위 · 배속 아래): [자동][개입] / [배속][⏭][로그].
   * 배속 = 버튼 하나가 1x → 2x → 4x → 1x 로 돈다. 개입은 자동 진행 중에만 의미가 있어 자동 OFF 이거나 경기가 끝났으면 자리만 두고 숨긴다 (.off).
   */
  function drawControls(finished, canDecide = false) {
    const intervening = ui.auto && ui.intervene && !finished;
    const sp = SPEEDS.includes(Number(ui.speed)) ? Number(ui.speed) : 1;
    const nextSp = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length];
    controls.replaceChildren(
      h('button', {
        class: ['btn', 'auto-btn', ui.auto ? 'active' : ''],
        type: 'button',
        'aria-pressed': ui.auto ? 'true' : 'false',
        disabled: finished,
        title: ui.auto ? '자동 진행 중 — 누르면 매 결정을 직접 고른다' : '매 결정을 직접 고른다 — 누르면 자동 진행',
        onclick: () => {
          ui.auto = !ui.auto;
          ui.intervene = false; // 켜든 끄든 개입 대기는 해제 (자동 OFF 면 매 결정이 이미 수동)
          hideArrow();
          refreshControls();
          schedule(T.idle * fx());
        },
      }, ui.auto ? '자동 ON' : '자동 OFF'),
      h('button', {
        class: ['btn', 'iv-btn', intervening ? 'active' : '', ui.auto && !finished ? '' : 'off'],
        type: 'button',
        disabled: !ui.auto || finished,
        'aria-pressed': intervening ? 'true' : 'false',
        title: '다음 결정 차례에서 멈추고 직접 고른다',
        onclick: () => { ui.intervene = !ui.intervene; refreshControls(); schedule(T.idle * fx()); },
      }, intervening ? (canDecide ? '직접 선택 중' : '개입 대기…') : '개입'),
      h('button', {
        class: ['btn', 'speed-btn', sp > 1 ? 'active' : ''],
        type: 'button',
        title: `배속 ${sp}x — 누르면 ${nextSp}x`,
        'aria-label': `배속 ${sp}x, 누르면 ${nextSp}x`,
        dataset: { speed: String(sp) },
        onclick: () => { ui.speed = nextSp; refreshControls(); },
      }, `${sp}x`),
      h('button', { class: 'btn skip-btn', type: 'button', disabled: finished, title: '결과까지 스킵', 'aria-label': '결과까지 스킵', onclick: skip }, '⏭'),
      h('button', {
        class: ['btn', 'log-btn', ui.logOpen ? 'active' : ''],
        type: 'button',
        'aria-expanded': ui.logOpen ? 'true' : 'false',
        'aria-controls': 'm-logbox',
        title: ui.logOpen ? '경기 로그 닫기' : '경기 로그 열기',
        onclick: () => setLogOpen(!ui.logOpen),
      }, '로그'));
  }

  /** 로그 서랍 열기/닫기 (ui.logOpen — 경기 화면을 다시 그려도 유지). 열면 맨 아래(최신)로 */
  function setLogOpen(open) {
    ui.logOpen = !!open;
    logBox.classList.toggle('open', ui.logOpen);
    logBox.setAttribute('aria-hidden', ui.logOpen ? 'false' : 'true');
    drawControls(isFinished(), canDecideNow(curView));
    if (ui.logOpen) log.scrollTop = log.scrollHeight;
  }

  function drawLog(canDecide = false) {
    const evs = (Array.isArray(store.match?.events) ? store.match.events : []).slice(-60);
    log.classList.toggle('deciding', !!canDecide);
    log.replaceChildren(...(evs.length
      ? evs.map((e) => h('div', {
        class: ['log-line', e.side ?? '', e.success ? 'success' : '', e.type ? `ev-${e.type}` : ''],
        // 판정 줄의 title = 결정타 칩 (표시 전용 — 엔진 decisive · upset)
        title: `${e.text ?? ''}${e.decisive?.text ? `\n결정타: ${e.decisive.text}` : ''}${e.upset ? ' · 대이변' : ''}`,
      },
        `${e.possession != null ? `[${e.possession}] ` : ''}${e.text ?? ''}`))
      : [h('div', { class: 'log-line' }, '킥오프 대기')]));
    log.scrollTop = log.scrollHeight;
  }

  /* ------------------------------------------------------------------ */
  /* 결과 미리보기 화살표 (결정 대기 · 수동에서만)                               */
  /* ------------------------------------------------------------------ */
  function showArrow(action) {
    const view = curView;
    if (!curL || !view || !canDecideNow(view)) return;
    if (distOf(view)) {
      if (!DIST_ACTIONS.includes(action) || !curL.dist) return;
      arrowFor = action;
      drawDistArrow(action);
      return;
    }
    const a = (view.actions || []).find((x) => x.action === action);
    if (!a || a.enabled === false) return;
    arrowFor = action;
    drawArrow(action, actionInfo(view, a).out, view.needsDecision, view);
  }
  function hideArrow(action) {
    if (action && arrowFor !== action) return;
    arrowFor = null;
    arrowG.replaceChildren();
    tipG.replaceChildren();
    field.classList.remove('previewing', 'previewing-def', 'ace-off');
  }

  function drawArrow(action, out, role, view) {
    arrowG.replaceChildren();
    tipG.replaceChildren();
    const Lay = curL;
    const atk = Lay.attackingSide;
    const def = atk === 'home' ? 'away' : 'home';
    const C = tokOf(Lay, Lay.carrierId, atk) || Lay.ball;
    const c = toPx(C.x, C.y);
    const rTok = tokPx / 2 + 3;
    const zoneName = (z) => ZONES[(z ?? 0) - 1]?.name ?? '';
    field.classList.add('previewing');
    setAceOff(null); // 받는 선수에게 가는 미리보기만 아래에서 다시 숨긴다

    if (role === 'attack') {
      let to = null;
      let tip = '';
      if (action === 'dribble' && Lay.nextBall) {
        to = Lay.nextBall;
        tip = zoneName(out?.success?.zone);
        // 한 구역 더 (필살 드리블 extraLine — 엔진 outcome success.step): 화살표를 도착 단계까지 늘리고 "두 구역 전진"
        const st = Number(out?.success?.step);
        const from = Number(Lay.attackStep);
        if (Number.isFinite(st) && Number.isFinite(from) && st > from + 1 && st <= 3 && SHAPE.ball?.[st] != null) {
          to = { x: Lay.nextBall.x, y: atk === 'home' ? SHAPE.ball[st] : 100 - SHAPE.ball[st] };
          tip = `${tip ? `${tip} · ` : ''}두 구역 전진`;
        }
      } else if (action === 'pass' || action === 'cross') {
        // 받는 선수(고른 선수 또는 기본값)까지: 패스 = 점선, 크로스 = 포물선. 이름은 토큰 라벨에 있으므로 도착 구역만
        const rid = recvInfo(view, action)?.id ?? Lay.receiverId;
        const R = tokOf(Lay, rid, atk);
        setAceOff(R ? rid : null); // 외치는 선수에게 가는 미리보기면 외침 점선은 숨긴다
        if (R) {
          const t2 = toPx(R.x, R.y);
          const curve = action === 'cross';
          if (curve) arrowCurve(c, t2, { startGap: rTok, endGap: rTok, color: '#ffd166', marker: 'mah-gold', cls: 'ar-cross' });
          else arrowLine(c, t2, { startGap: rTok, endGap: rTok, dashed: true, color: '#ffd166', marker: 'mah-gold', cls: 'ar-pass' });
          const at = (k) => (curve ? curvePoint(c, t2, k) : lerp2(c, t2, k));
          const obs = lineDots(c, t2, curve);
          if (out?.success?.boxLink || isBoxLink(view, action)) {
            // ④ 박스 연결: 공은 박스 그대로 → 끝 글자 = 받은 선수의 마무리. GK 가 튀어나와 끊는 길(흰 점선)
            const gl = gkLane(Lay, c, t2, curve);
            if (gl) {
              arrowLine(gl[0], gl[1], { startGap: rTok, endGap: 5, dashed: true, color: '#ffffff', marker: 'mah-white', cls: 'ar-gk', opacity: 0.6 });
              obs.push(...lineDots(gl[0], gl[1]));
              // GK 화살촉 옆은 비운다 — 마무리 글자가 GK 의 글자로 읽히지 않게
              obs.push({ l: gl[1][0] - 22, r: gl[1][0] + 22, t: gl[1][1] - 22, b: gl[1][1] + 22, w: 2 });
            }
            // 마무리 글자("→ 원터치 슛" · "→ 헤더")는 받는 선수 쪽 끝에 — 받은 선수가 하는 일
            arrowTip(at(0.8), `→ ${L.BOX_LINK_FINISH[action]}`, c, t2, obs, [at(0.68), at(0.9)]);
            return;
          }
          const z = zoneName(out?.success?.zone);
          // 두 구역 패스 (스루 패스 · 필살 패스 extraLine, L54 — 엔진 outcome success.step 이 한 구역 너머): 끝 글자에 "두 구역 전진"
          const st = Number(out?.success?.step);
          const two = action === 'pass' && Number.isFinite(st) && st > Number(Lay.attackStep) + 1;
          if (z) arrowTip(at(0.5), `→ ${z}${two ? ' · 두 구역 전진' : ''}`, c, t2, obs, [at(0.7), at(0.3)]);
        }
        return;
      } else if (action === 'shoot') {
        to = { x: Lay.goal.x, y: Lay.goal.y >= 50 ? 99 : 1 };
        tip = '골문';
      }
      if (!to) return;
      const t = toPx(to.x, to.y);
      arrowLine(c, t, { startGap: rTok, endGap: 0, dashed: false, color: '#ffd166', marker: 'mah-gold', cls: `ar-${action}` });
      if (tip) arrowTip(t, tip, c, t, lineDots(c, t));
      return;
    }

    // 수비: 상대 carrier 앞 차단 표시 — 막으려는 길(드리블 길 / 패스·크로스 길 / 슛 길)을 흰 점선으로, 우리 수비가 끊는 지점에 빨간 ✕
    field.classList.add('previewing-def'); // 미리보기 동안 우리 수비수 이름표를 접어 ✕ 자리를 비운다
    const D = tokOf(Lay, Lay.defenderId, def);
    const d = D ? toPx(D.x, D.y) : null;
    const goal = toPx(Lay.goal.x, Lay.goal.y >= 50 ? 99 : 1);
    const ea = view?.expected?.attack?.action;
    const recvId = (ea === 'pass' || ea === 'cross')
      ? view?.expected?.attack?.receiverId ?? view?.receivers?.[ea]?.defaultId ?? Lay.receiverId
      : Lay.receiverId;
    // 받는 선수까지의 길을 막는 수비: 인터셉트 = 패스·크로스 길목, 버티기 = 크로스(공중볼)가 떨어지는 곳에서 몸싸움 (2026-09-29 짝)
    const toRecv = action === 'intercept' || (action === 'hold' && ea === 'cross');
    const R = toRecv ? tokOf(Lay, recvId, atk) : null;
    setAceOff(R ? R.id : null); // 외치는 선수에게 가는 길을 막는 미리보기면 외침 점선은 숨긴다
    const curve = !!R && ea === 'cross'; // 상대가 크로스를 올릴 것 같으면 길 = 포물선
    let pathTo;
    let endGap = 0;
    let alongs;
    if (R) {
      pathTo = toPx(R.x, R.y);
      endGap = rTok;
      alongs = action === 'hold' ? [0.8, 0.72, 0.88, 0.64] : [0.5, 0.4, 0.6, 0.3, 0.7];
    } else {
      pathTo = action === 'hold' || !Lay.nextBall ? goal : toPx(Lay.nextBall.x, Lay.nextBall.y);
      const len0 = Math.hypot(pathTo[0] - c[0], pathTo[1] - c[1]) || 1;
      // 수비수 바로 뒤(골 쪽) — 수비수 얼굴을 가리지 않게 토큰 1.6개만큼 (다른 토큰과 겹치면 수비수 쪽으로 당기거나 더 멀리)
      const base = d ? projectOn(c, pathTo, d) : lerp2(c, pathTo, 0.3);
      const b0 = Math.hypot(base[0] - c[0], base[1] - c[1]);
      alongs = [1.6, 1.25, 1.0, 2.4, 3.0].map((k) => Math.min(0.85, (b0 + tokPx * k) / len0));
    }
    const vv = sub2(pathTo, c);
    const vlen = Math.hypot(vv[0], vv[1]) || 1;
    const nrm = [-vv[1] / vlen, vv[0] / vlen];
    const half = tokPx * 0.45;
    // ✕ 자리의 장애물: 토큰 + 보이는 이름표 (접히는 우리 수비수 이름표 제외 — 버티기 ✕ 가 받는 선수 이름표를 덮지 않게)
    const others = [
      ...(Lay.tokens || []).filter((t) => !(t.side === atk && t.id === Lay.carrierId)).map(tokenRect),
      ...tagBoxes.filter((b) => b.role !== 'defender' && !(b.role === 'ace' && field.classList.contains('ace-off'))),
    ];
    const cutCands = [];
    for (const lat of [0, 0.8, -0.8]) {
      for (const a of alongs) {
        const p = curve ? curvePoint(c, pathTo, a) : lerp2(c, pathTo, a);
        const q = [p[0] + nrm[0] * tokPx * lat, p[1] + nrm[1] * tokPx * lat];
        cutCands.push({ p: q, box: { l: q[0] - half, r: q[0] + half, t: q[1] - half, b: q[1] + half } });
      }
    }
    const cut = (pickSpot(cutCands, others) || cutCands[0]).p;
    if (curve) arrowCurve(c, pathTo, { startGap: rTok, endGap, color: '#ffffff', marker: 'mah-white', cls: 'ar-lane', opacity: 0.75 });
    else arrowLine(c, pathTo, { startGap: rTok, endGap, dashed: true, color: '#ffffff', marker: 'mah-white', cls: 'ar-lane', opacity: 0.75 });
    crossMark(cut, tokPx * 0.4);
    sideLabel(cut, L.ACTION_LABELS[action] ?? action, tokPx * 0.7, vv, lineDots(c, pathTo, curve));
  }

  /**
   * GK 배급 미리보기: 짧은 패스 = GK → DF 점선 + "→ 빌드업", 롱패스 = GK → 중원 MF 포물선 + "→ 중원 · 경합"
   * (롱패스를 다투는 상대 MF 는 받는 선수와 같은 레인 — layout.js distributionLayout 의 듀얼 수비 자리 · 흰 고리)
   */
  function drawDistArrow(action) {
    arrowG.replaceChildren();
    tipG.replaceChildren();
    const Lay = curL;
    const atk = Lay.attackingSide;
    const C = tokOf(Lay, Lay.carrierId, atk) || Lay.ball;
    const R = tokOf(Lay, Lay.dist?.[action], atk);
    field.classList.add('previewing');
    if (!R) return;
    const c = toPx(C.x, C.y);
    const r = toPx(R.x, R.y);
    const rTok = tokPx / 2 + 3;
    const curve = action === 'long';
    const at = (k) => (curve ? curvePoint(c, r, k) : lerp2(c, r, k));
    if (curve) arrowCurve(c, r, { startGap: rTok, endGap: rTok, color: '#ffd166', marker: 'mah-gold', cls: 'ar-long' });
    else arrowLine(c, r, { startGap: rTok, endGap: rTok, dashed: true, color: '#ffd166', marker: 'mah-gold', cls: 'ar-pass' });
    const sure = curve && !!distOf(curView)?.options?.long?.sure; // 확정 롱패스: 경합 없음
    arrowTip(at(0.5), curve ? (sure ? '→ 중원 · 확정' : '→ 중원 · 경합') : '→ 빌드업', c, r, lineDots(c, r, curve), [at(0.7), at(0.3)]);
  }

  /** 미리보기 글자 한 줄을 토큰 위 층에: 후보 자리 중 토큰이 없는 첫 자리 (없으면 가장 덜 가리는 자리). extra = 더 피할 박스 (화살표 선의 점) */
  function tipText(cands, text, cls, extra = []) {
    const w = textWidth(text, FONT.tip) + 4;
    const boxOf = (c) => {
      const l = c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - w : c.x - w / 2;
      return { l, r: l + w, t: c.y - 12, b: c.y + 3 };
    };
    // 수비 미리보기 동안 접힌 수비수 이름표(.previewing-def)는 보이지 않으니 피하지 않는다 → ✕ 옆 빈자리를 쓴다
    // 숨긴 외침 배지(.ace-off — 같은 받는 선수의 미리보기)도 피하지 않는다
    const aceOff = field.classList.contains('ace-off');
    const tags = tagBoxes.filter((b) => !(b.role === 'defender' && field.classList.contains('previewing-def')) && !(b.role === 'ace' && aceOff));
    const obstacles = [...(curL?.tokens || []).map(tokenRect), ...tags, ...extra];
    const pick = pickSpot(cands.map((c) => ({ ...c, box: boxOf(c) })), obstacles) || { ...cands[0] };
    const el = svgEl('text', { x: round1(pick.x), y: round1(pick.y), class: cls, 'text-anchor': pick.anchor });
    el.textContent = text;
    tipG.append(el);
  }

  function sideLabel(p, text, off, dir, lineObs = []) {
    // ✕ 옆 차단 액션 이름: 막는 길(dir)이 대체로 좌우라 오른쪽·왼쪽은 길 위에 놓인다 → 길의 수직 양쪽(아래 먼저) → 오른쪽 → 왼쪽 → 위 → 아래
    const rightFirst = p[0] < W * 0.62;
    const R = { x: p[0] + off, y: p[1] + 4, anchor: 'start' };
    const Lf = { x: p[0] - off, y: p[1] + 4, anchor: 'end' };
    const across = dir ? normalTips(p, dir, textWidth(text, FONT.tip) + 4, off - 1, [rightFirst ? 0.01 : -0.01, p[1] < H * 0.62 ? 1 : -1]) : [];
    tipText([...across, rightFirst ? R : Lf, rightFirst ? Lf : R,
      { x: p[0], y: p[1] - off - 2, anchor: 'middle' }, { x: p[0], y: p[1] + off + 12, anchor: 'middle' }], text, 'ar-tip def', lineObs);
  }
  /**
   * 미리보기 글자 후보 2개: 선 방향 dir 의 수직 양쪽, 글자 박스(폭 w · 높이 15)가 선에서 gap 만큼 떨어지게.
   * prefer 와 같은 쪽(내적 > 0)을 먼저. tipText 후보 형식 { x, y(기준선), anchor: 'middle' }, 필드 안으로 clamp
   */
  function normalTips(p, dir, w, gap, prefer) {
    const len = Math.hypot(dir[0], dir[1]);
    let n = len > 0.5 ? [-dir[1] / len, dir[0] / len] : [0, -1];
    if (n[0] * prefer[0] + n[1] * prefer[1] < 0) n = [-n[0], -n[1]];
    const d = (Math.abs(n[0]) * w + Math.abs(n[1]) * 15) / 2 + gap; // 박스 중심까지: 박스의 n 방향 반폭 + 간격
    return [1, -1].map((s) => ({
      x: clamp(p[0] + n[0] * d * s, w / 2 + 2, W - w / 2 - 2),
      y: clamp(p[1] + n[1] * d * s + 4.5, 13, H - 5), // 기준선 = 박스 중심 + 4.5 (tipText 박스: 기준선 −12 ~ +3)
      anchor: 'middle',
    }));
  }

  function arrowLine(a, b, { startGap = 0, endGap = 0, dashed = false, color, marker, cls = '', opacity = 1 }) {
    const v = sub2(b, a);
    const len = Math.hypot(v[0], v[1]);
    if (len < 1) return;
    const u = [v[0] / len, v[1] / len];
    const s = [a[0] + u[0] * startGap, a[1] + u[1] * startGap];
    const e = [b[0] - u[0] * endGap, b[1] - u[1] * endGap];
    const common = { x1: round1(s[0]), y1: round1(s[1]), x2: round1(e[0]), y2: round1(e[1]) };
    arrowG.append(
      svgEl('line', { ...common, class: 'ar-halo', 'stroke-dasharray': dashed ? '7 5' : null }),
      svgEl('line', { ...common, class: `ar ${cls}`, stroke: color, opacity, 'stroke-dasharray': dashed ? '7 5' : null, 'marker-end': `url(#${marker})` }));
  }
  /** 포물선 화살표 (크로스): 필드 바깥쪽으로 휘는 2차 곡선 */
  function arrowCurve(a, b, { startGap = 0, endGap = 0, color, marker, cls = '', opacity = 1 }) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1) return;
    const k0 = startGap / len;
    const k1 = 1 - endGap / len;
    const s = curvePoint(a, b, Math.min(0.3, k0));
    const e = curvePoint(a, b, Math.max(0.7, k1));
    const cp = curveCtrl(a, b);
    const d = `M${round1(s[0])},${round1(s[1])} Q${round1(cp[0])},${round1(cp[1])} ${round1(e[0])},${round1(e[1])}`;
    if (d25) {
      // 2.5D: 공중 곡선 아래 바닥 그림자 길 (발밑 타원 사이)
      const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      arrowG.append(svgEl('line', {
        x1: round1(a[0] + u[0] * startGap), y1: round1(a[1] + u[1] * startGap), x2: round1(b[0] - u[0] * endGap), y2: round1(b[1] - u[1] * endGap), class: 'ar-ground',
      }));
    }
    arrowG.append(
      svgEl('path', { d, class: 'ar-halo', 'stroke-dasharray': '7 5' }),
      svgEl('path', { d, class: `ar ${cls}`, stroke: color, opacity, 'stroke-dasharray': '7 5', 'marker-end': `url(#${marker})` }));
  }
  function crossMark(p, r) {
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      const common = { x1: round1(p[0] - dx * r), y1: round1(p[1] - dy * r), x2: round1(p[0] + dx * r), y2: round1(p[1] + dy * r) };
      arrowG.append(svgEl('line', { ...common, class: 'ar-halo bar' }), svgEl('line', { ...common, class: 'ar-block' }));
    }
  }
  function arrowTip(p, text, from, to = p, lineObs = [], alts = []) {
    // 화살표 끝(또는 궤적 가운데) 옆에 짧은 라벨, 필드 밖으로 나가지 않게 clamp. 후보: 화살표 방향(from → to; 크로스 곡선 가운데의 접선도
    // 이 방향)의 수직 양쪽(위쪽 먼저) → 위 → 아래 → 앞 → 뒤 → 그래도 다 막히면 alts(패스·크로스 길 위 다른 점)의 수직 양쪽
    // (뒤에 붙인 후보라 앞 자리가 비면 결과는 그대로)
    const side = p[0] >= from[0] ? 1 : -1;
    const x = clamp(p[0] + side * (tokPx * 0.2), 34, W - 34);
    const cy = (dy) => clamp(p[1] + dy, 13, H - 5);
    const off = tokPx * 0.8;
    const right = { x: clamp(p[0] + off, 0, W - 40), y: cy(4), anchor: 'start' };
    const left = { x: clamp(p[0] - off, 40, W), y: cy(4), anchor: 'end' };
    const w = textWidth(text, FONT.tip) + 4;
    tipText([
      ...normalTips(p, sub2(to, from), w, 8, [0, -1]),
      { x, y: cy(-tokPx * 0.75), anchor: 'middle' },
      { x, y: cy(tokPx * 0.95), anchor: 'middle' },
      side > 0 ? right : left,
      side > 0 ? left : right,
      ...alts.flatMap((q) => normalTips(q, sub2(to, from), w, 8, [0, -1])),
    ], text, 'ar-tip', lineObs);
  }
  /** 크로스 곡선의 제어점: 중점에서 진행 방향의 수직으로 길이 × 0.28, 필드 가운데(골과 나란한 축의 가운데)에서 먼 쪽 */
  function curveCtrl(a, b) {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if (d25) {
      // 2.5D: 위로 뜨는 곡선 — 바닥 직선 위 4t(1−t) · 꼭대기 (V.arcLift: 90 · s, 짧으면 낮게). 2차 곡선 제어점 = 중점에서 꼭대기 × 2 위
      const lift = V.arcLift(Math.hypot(b[0] - a[0], b[1] - a[1]), V.scaleAtScreen(mx, my, W, H));
      return [mx, my - 2 * lift];
    }
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    // 필드 폭 방향 축 = 화면 y (가운데 H/2)
    const out = my + ny * 10 - H / 2;
    const inn = my - ny * 10 - H / 2;
    if (Math.abs(inn) > Math.abs(out)) { nx = -nx; ny = -ny; }
    const k = len * 0.28;
    return [mx + nx * k, my + ny * k];
  }
  function curvePoint(a, b, t) {
    const cp = curveCtrl(a, b);
    const u = 1 - t;
    return [u * u * a[0] + 2 * u * t * cp[0] + t * t * b[0], u * u * a[1] + 2 * u * t * cp[1] + t * t * b[1]];
  }

  /* ------------------------------------------------------------------ */
  /* 비트 연출                                                             */
  /* ------------------------------------------------------------------ */
  function setDurations(k) {
    const act = reduced ? 0 : Math.round(T.act * k);
    const move = reduced ? 0 : Math.round(T.move * k);
    field.style.setProperty('--t-act', `${act}ms`);
    field.style.setProperty('--t-move', `${move}ms`);
  }

  /**
   * 한 step 의 새 이벤트 연출. 컷인은 판정 비트 앞의 것(이번 듀얼에 쓴 필살기) → 액션 전에,
   * 판정 비트 뒤의 것(다음 듀얼에 AI 가 먼저 커밋한 필살기) → 결과 한 줄 뒤에 보여준다.
   */
  function animateBeat(fresh, prevL, nextL, nextView, prevView, chosen = null) {
    setBusy(true);
    hideArrow();
    clearAce(); // 공이 움직이면 외침(점선 · "줘!")은 걷는다 — 재배치 때 다음 결정의 외침
    clearPops(); // 이전 비트의 결과 한 줄은 새 비트가 시작되면 걷는다 (필드·로그와 어긋나지 않게)
    lockButtons(chosen);
    const k = fx();
    setDurations(k);
    const mainIdx = fresh.findIndex((e) => e && ACTION_BEATS.has(e.type));
    const main = mainIdx >= 0 ? fresh[mainIdx] : null;
    const beats = fresh.filter((e) => e && BEATS.has(e.type));
    // 경기의 첫 필살기만 긴 연출 (이번 비트 전에 컷인 이벤트가 없었는가) — 역방향 컷인도 경기의 첫 것만 0.8초
    const evs = Array.isArray(store.match?.events) ? store.match.events : [];
    const before = evs.slice(0, Math.max(0, evs.length - fresh.length));
    const priorCut = before.some((e) => e && e.type === 'cutin');
    // 차지 때 색을 남길 듀얼 상대: 판정 비트 앞 컷인 = 이번 듀얼(main), 뒤 컷인 = 다음 듀얼(AI 가 먼저 커밋 — nextView)
    const preDuel = main ? { atk: main.side, carrierId: main.playerId, defenderId: main.defenderId } : null;
    const postDuel = nextView && nextView.phase === 'decision'
      ? { atk: nextView.attackingSide, carrierId: nextView.carrier?.id, defenderId: nextView.defender?.id } : null;
    const pre = main ? cutSeq(fresh.slice(0, mainIdx), { first: !priorCut, duel: preDuel }) : [];
    const post = cutSeq(main ? fresh.slice(mainIdx + 1) : fresh, { first: !priorCut && !pre.some((c) => c.kind === 'cut'), duel: postDuel });
    let t = playCuts(pre, 0, k);
    if (main) {
      later(() => actionPhase(main, prevL, prevView), t);
      t += T.act * k;
      if (main.type === 'turnover' || main.type === 'save' || (main.type === 'penalty' && !main.success)) t += T.hold * k;
      // 필살기가 막히면: 막은 선수의 역방향 컷인 (기적의 세이브! · 철벽 블록! · 필살 패스 차단! — 막는 동작 뒤, 재배치 전)
      const rc = reverseOf(main);
      if (rc) {
        const firstRev = !before.some((e) => reverseOf(e));
        t = playCuts([{ kind: 'reverse', ev: main, rc, dur: firstRev ? T.revCut : T.revCutShort }], t, k);
      }
      if (main.type === 'goal') {
        later(() => goalFlash(main, nextView), t);
        t += T.goal * k;
      }
    }
    later(() => movePhase(nextL, nextView), t);
    t += T.move * k;
    const shown = main || beats[beats.length - 1];
    if (shown) {
      later(() => resultPhase(shown, prevL, nextL, nextView), t);
      t += T.result * k;
    }
    t = playCuts(post, t, k);
    later(() => finishBeat(), t);
  }

  /**
   * 필살기 연출 카드 목록 (2026-09-29 3단): cutin → [차지, 컷인], combo → [차지, 두 선수 컷인, 합체기 이름] (앞에 온 받은 선수의
   * 차지 · cutin 을 대신한다). ctx.first = 이 경기의 첫 필살기(긴 연출: 차지 0.4 + 컷인 1.0), 이후는 차지 0.3 + 컷인 0.9 (합체기 컷인은 그대로).
   * ctx.duel = { atk, carrierId, defenderId } — 차지 때 색을 남길 듀얼 상대 (공격 쪽 사용자 ↔ 수비수, 수비 쪽(필살 세이브) ↔ 공 가진 선수)
   */
  function cutSeq(evs, ctx = {}) {
    const out = [];
    let first = !!ctx.first;
    const duel = ctx.duel || null;
    const chargeFor = (side, pid, isFirst, tier = 'SSR') => {
      const foeSide = side === 'home' ? 'away' : 'home';
      const foe = duel ? (side === duel.atk ? duel.defenderId : duel.carrierId) : null;
      const tt = CUT_TIER[tier] || CUT_TIER.SSR;
      return { kind: 'charge', user: `${side}:${pid}`, foe: foe ? `${foeSide}:${foe}` : null, dur: isFirst ? tt.charge : tt.chargeShort };
    };
    for (const e of evs) {
      if (!e) continue;
      if (e.type === 'cutin') {
        // §19.8: 등급별 길이 (R 짧게) — 이벤트 tier 가 없으면 SSR
        const tier = tierOf(e) || 'SSR';
        const tt = CUT_TIER[tier];
        out.push(chargeFor(e.side === 'away' ? 'away' : 'home', e.playerId, first, tier), { kind: 'cut', ev: e, dur: first ? tt.cut : tt.cutShort });
        first = false;
      } else if (e.type === 'combo') {
        const [sa, sb] = Array.isArray(e.skillIds) ? e.skillIds : [];
        const [pa, pb] = Array.isArray(e.playerIds) ? e.playerIds : [];
        const side = e.side === 'away' ? 'away' : 'home';
        const i = out.findIndex((c) => c.kind === 'cut' && c.ev.skillId === sb && c.ev.playerId === pb);
        const recvCut = i >= 0 ? out.splice(i, 1)[0].ev : null;
        const j = i > 0 && out[i - 1].kind === 'charge' ? i - 1 : -1;
        const charge = j >= 0 ? out.splice(j, 1)[0] : chargeFor(side, pb, first);
        first = false;
        // 합체기 컷인 두 장: 길이 · 크기는 그대로 (SSR 판), 대사(E5)는 새 이벤트(받은 선수 cutin 에 line 이 있을 때)만 —
        // 패스한 선수(a)의 대사는 스킬 데이터에서
        const lineA = recvCut?.line ? ultLineOf(sa) : null;
        out.push(
          charge,
          { kind: 'cut', ev: { side, playerId: pa, skillId: sa, line: lineA || undefined }, dur: T.comboCut, part: 1 },
          { kind: 'cut', ev: { side, playerId: pb, skillId: sb, ultimateType: recvCut?.ultimateType, line: recvCut?.line }, dur: T.comboCut, part: 2 },
          { kind: 'name', ev: e, dur: T.comboName });
      }
    }
    return out;
  }
  function playCuts(cards, t0, k) {
    if (!cards.length) return t0;
    let t = t0;
    for (const c of cards) {
      if (c.kind === 'charge') {
        const dur = Math.max(CUT_MIN.charge, c.dur * k);
        later(() => showCharge(c, dur), t);
        t += dur;
        continue;
      }
      const dur = Math.max(CUT_MIN.card, c.dur * k);
      later(() => { endCharge(); showCut(c, dur); }, t);
      t += dur;
    }
    later(() => { endCharge(); hideCut(); }, t);
    return t;
  }
  /** ① 차지: 잔디 흑백(.m-field.charging), 필살기 사용자 빛남(.charge-user), 듀얼 상대는 색 그대로(.charge-foe) */
  function showCharge(c, dur) {
    endCharge();
    field.style.setProperty('--t-charge', `${Math.round(dur)}ms`);
    field.classList.add('charging');
    tokEls.get(c.user)?.classList.add('charge-user');
    if (c.foe) tokEls.get(c.foe)?.classList.add('charge-foe');
  }
  function endCharge() {
    field.classList.remove('charging');
    for (const el of tokLayer.querySelectorAll('.charge-user, .charge-foe')) el.classList.remove('charge-user', 'charge-foe');
  }
  /**
   * 판정 비트의 역방향 컷인 정보 (필살기가 막혔다 — 표시 전용): 엔진 이벤트 reverseCutin { kind: save | block | passCut, side(막은 팀),
   * playerId(막은 선수), text, skillId, ultimateType, combo }. 옛 저장 이벤트(reverseCutin 없음)는 필살 슛 GK 세이브만 규칙으로 대신한다.
   */
  function reverseOf(ev) {
    if (!ev) return null;
    if (ev.reverseCutin && REVERSE_TEXT[ev.reverseCutin.kind]) return ev.reverseCutin;
    if (ev.type !== 'save' || ev.boxLink || ev.action !== 'shoot' || !ev.ultimate || 'factors' in ev) return null;
    const sk = Array.isArray(data.skills) ? data.skills.find((s) => s.id === ev.ultimate) : null;
    if (sk && sk.ultimate?.type !== 'shot') return null;
    return { kind: 'save', side: ev.side === 'away' ? 'home' : 'away', playerId: ev.defenderId, text: REVERSE_TEXT.save, skillId: ev.ultimate, ultimateType: 'shot', combo: false };
  }
  function showCut(c, dur) {
    const el = cutCard(c);
    el.style.setProperty('--t-cut', `${Math.round(dur)}ms`);
    cutLayer.replaceChildren(el);
    cutLayer.classList.add('show');
  }
  function hideCut() {
    endCharge();
    cutLayer.classList.remove('show');
    cutLayer.replaceChildren();
  }
  function cutCard(c) {
    const ev = c.ev || {};
    if (c.kind === 'reverse') {
      // ③ 역방향 컷인: 막은 선수 쪽에서 들어온다 (필살기 컷인과 반대 방향 · 반대 기울기), 차가운 색 (.cut-save) — 종류별 색은 .rev-<kind>
      //   save = GK 세이브 "기적의 세이브!", block = 필드 수비가 필살 슛 블록 "철벽 블록!", passCut = 필살 패스 차단 "필살 패스 차단!"
      const rc = c.rc || {};
      const defSide = rc.side === 'home' || rc.side === 'away' ? rc.side : ev.side === 'away' ? 'home' : 'away';
      const g = playerSnap(defSide, rc.playerId ?? ev.defenderId) || {};
      const usDef = defSide === humanOf(curView);
      const sk = Array.isArray(data.skills) ? data.skills.find((s) => s.id === (rc.skillId ?? ev.ultimate)) : null;
      const what = rc.combo ? '합체기' : sk?.name ?? L.ULT_TYPE_LABELS[rc.ultimateType] ?? '필살기';
      const role = rc.kind === 'save' ? 'GK' : g.position ?? rc.position ?? '';
      return h('div', { class: ['cut', 'cut-save', 'cut-rev', `rev-${rc.kind}`, `side-${defSide}`], dataset: { kind: rc.kind } },
        h('div', { class: 'cut-band' },
          // 막은 선수 흉상 창 (§24.12.4 — 띠와 같은 +4° 기울기로 자른다), 그림이 없으면 지금 글자 원
          cutArt(h('span', { class: 'cut-face', style: { background: g.portraitColor || '#4b5563' } }, initialOf(g.name)), snapArt(defSide, rc.playerId ?? ev.defenderId, 'bust'), 'bust'),
          h('div', { class: 'cut-txt' },
            h('small', {}, `${usDef ? '' : '상대 '}${role ? `${role} ` : ''}${g.name ?? ''} · ${what} ${rc.kind === 'passCut' ? '차단' : '봉쇄'}`),
            h('b', {}, rc.text || REVERSE_TEXT[rc.kind] || '막아냈다!'))));
    }
    const side = ev.side === 'away' ? 'away' : 'home';
    const us = side === humanOf(curView);
    if (c.kind === 'name') {
      const [pa, pb] = Array.isArray(ev.playerIds) ? ev.playerIds : [];
      // 두 선수 흉상 (§24.12.4): 패스한 선수 왼쪽 · 받은 선수 오른쪽 (아래 글 "A → B" 와 같은 순서). 둘 다 그림이 없으면 지금처럼 이름 띠만
      const duo = [pa, pb].map((id) => {
        const q = playerSnap(side, id) || {};
        return cutArt(h('span', { class: ['cut-face', 'cut-duo'], style: { background: q.portraitColor || '#4b5563' } }, initialOf(q.name)), snapArt(side, id, 'bust'), 'bust');
      });
      const withArt = duo.some((el) => el.classList.contains('has-art'));
      return h('div', { class: ['cut', 'cut-name', `side-${side}`, withArt ? 'has-duo' : ''] },
        h('div', { class: 'cut-band' },
          withArt ? duo[0] : null,
          h('div', { class: 'cut-txt' },
            h('small', {}, `${us ? '' : '상대 '}합체기`),
            h('b', {}, ev.name ?? '합체기'),
            h('span', { class: 'cut-sub' }, [playerSnap(side, pa)?.name, playerSnap(side, pb)?.name].filter(Boolean).join(' → '))),
          withArt ? duo[1] : null));
    }
    const p = playerSnap(side, ev.playerId) || {};
    const sk = skillById(ev.skillId);
    const type = ev.ultimateType || sk?.ultimate?.type;
    // §19.8 (E5): 등급 클래스 tier-R · tier-SR · tier-SSR (R 은 띠 · 얼굴 · 이름이 작다 — css), 이벤트에 tier 가 없으면(옛 저장본 ·
    // 합체기 두 장) 클래스 없음 = SSR 판. 종류 칩 .cut-type.ut-<type> (색 = 종류), 대사 한 줄 .cut-line (이벤트 line 이 있을 때만)
    const tier = c.part ? null : tierOf(ev);
    const typeLabel = L.ULT_TYPE_LABELS[type] ?? '필살기';
    // 그림 (§24.12.4): SSR (등급 없는 판 · 합체기 두 장) = 반신, SR = 흉상 창, R = 얼굴 원. 그림이 없으면 (상대 · 유스) 지금 글자 칸
    const preset = tier === 'R' ? 'face' : tier === 'SR' ? 'bust' : 'half';
    return h('div', { class: ['cut', `side-${side}`, `el-${p.element ?? 'none'}`, type ? `ut-${type}` : '', tier ? `tier-${tier}` : '', c.part ? `part-${c.part}` : ''],
      dataset: { type: type ?? '', tier: tier ?? '' } },
      h('div', { class: 'cut-band' },
        cutArt(h('span', { class: 'cut-face', style: { background: p.portraitColor || '#4b5563' } }, initialOf(p.name)), snapArt(side, ev.playerId, preset), preset),
        h('div', { class: 'cut-txt' },
          h('small', {}, `${us ? '' : '상대 '}${p.name ?? ''} · `, h('span', { class: ['cut-type', type ? `ut-${type}` : ''] }, typeLabel),
            c.part ? ` (${c.part}/2)` : ''),
          h('b', {}, sk?.name ?? ev.skillId ?? '필살기'),
          ev.line ? h('span', { class: 'cut-line', title: ev.line }, `“${ev.line}”`) : null)));
  }
  /** 필살기 컷인 대사 (스킬 데이터 ultimate.cutinLine — 합체기 패스한 선수의 컷인용) */
  const ultLineOf = (id) => skillById(id)?.ultimate?.cutinLine || null;
  const playerSnap = (side, id) => store.match?.[side]?.players?.find?.((p) => p.id === id) || null;
  /** 경기 선수 그림 주소 (§24.12.3): 스냅샷 charId → 목록에 있을 때만 (런 상대 · 유스 = null → 글자 칸) */
  const snapArt = (side, id, preset = 'face') => portraitUrl(data, playerSnap(side, id)?.charId, preset);
  /**
   * 컷인 그림 미리 불러오기 목록 (§24.12.4): 필살기 보유자 = 반신 · 흉상 · 얼굴, 그 밖의 선수 = 흉상 (역방향 컷인 — 막은 선수).
   * 컷인은 0.6 ~ 1.0초라 그때 불러오면 빈 띠가 보인다
   */
  function cutArtUrls() {
    const urls = [];
    for (const side of ['home', 'away']) {
      for (const p of store.match?.[side]?.players || []) {
        if (!p?.charId) continue;
        const hasUlt = (Array.isArray(p.skillIds) ? p.skillIds : []).some((sid) => skillById(sid)?.ultimate);
        urls.push(...portraitUrls(data, [p.charId], hasUlt ? ['half', 'bust', 'face'] : ['bust']));
      }
    }
    return urls;
  }

  /**
   * 연출 시작: 결정 UI 를 즉시 잠근다. 사람이 방금 고른 결정이면 버튼을 그대로 두고(고른 액션 표시) 비활성만,
   * 자동 진행이면 자동 패널로. 스코어·로그는 재배치 때 갱신
   */
  function lockButtons(chosen = null) {
    drawInfo(curView, false);
    if (chosen && actGrid.querySelector(`button[data-action="${chosen}"]`)) {
      actGrid.classList.remove('deciding');
      for (const b of actGrid.querySelectorAll('button')) {
        b.disabled = true;
        b.classList.toggle('chosen', b.dataset.action === chosen);
      }
      for (const b of skillRow.querySelectorAll('button')) b.disabled = true;
      return;
    }
    drawActions(curView, false, false);
    drawSkills(curView, false);
  }

  /** ① 액션 연출: 드리블 = carrier 와 함께, 패스 = receiver 로, 크로스 = 포물선, 슛 = 골문으로, 실패 = defender 로 (§12.3) */
  function actionPhase(ev, prevL, prevView) {
    field.classList.remove('phase-move');
    field.classList.add('phase-act');
    const atk = ev.side === 'away' ? 'away' : 'home';
    const def = atk === 'home' ? 'away' : 'home';
    const C = tokOf(prevL, ev.playerId, atk) || tokOf(prevL, prevL.carrierId, atk) || prevL.ball;
    const D = tokOf(prevL, ev.defenderId, def) || tokOf(prevL, prevL.defenderId, def);
    const goalPt = { x: prevL.goal.x, y: prevL.goal.y >= 50 ? 99.5 : 0.5 };
    const tokEl2 = (side, id) => tokEls.get(`${side}:${id}`);
    const moveTok = (side, id, p) => { const el = tokEl2(side, id); if (el && p) place(el, p.x, p.y); };
    const addCls = (side, id, c) => { const el = tokEl2(side, id); if (el) el.classList.add(c); };
    const isCross = ev.action === 'cross';
    const k = fx();
    ballEl.classList.toggle('ult', !!ev.ultimate);
    let linkAt = C;
    const distBeat = ev.type === 'distribution' || (ev.type === 'turnover' && ev.distribution);

    if (distBeat) {
      // GK 배급 (2026-09-29): 짧은 패스 = DF 에게 땅볼, 롱패스 = 중원 MF 에게 포물선 + 낙하 지점 경합 (성공: 우리 MF 가 잡음 ·
      // 상대 MF 뒤로 / 실패 = turnover: 상대 MF 가 낙하 지점에서 끊음 → 세컨드볼)
      const R = tokOf(prevL, ev.receiverId, atk) || tokOf(prevL, prevL.dist?.[ev.action], atk);
      const Dc = tokOf(prevL, ev.defenderId, def) || tokOf(prevL, prevL.dist?.contest, def);
      if (ev.action === 'short') {
        if (R) {
          trail(C, R, atk);
          placeBallAt(R.x, R.y);
          addCls(atk, R.id, 'catching');
          linkAt = R;
        }
      } else if (ev.success) {
        if (R) {
          trailCurve(C, R, atk);
          arcBall(C, R, T.act * k);
          addCls(atk, R.id, 'catching');
          linkAt = R;
        }
        // 경합에 진 선수는 받는 선수 쪽으로 붙으며 뒤로 처진다 — 이름표가 받는 선수 이름표와 겹치지 않게 잠깐 숨긴다 (tag-off, 2026-09-30)
        if (Dc && R) { moveTok(def, Dc.id, lerp(Dc, R, 0.35)); addCls(def, Dc.id, 'beaten'); addCls(def, Dc.id, 'tag-off'); }
      } else {
        // 낙하 지점 = 받을 선수와 경합 선수 사이 (경합 선수 쪽) — 공은 거기로 날아가고 상대 MF 가 끊는다
        const to = R || Dc || C;
        const P = R && Dc ? lerp(R, Dc, 0.55) : to;
        trailCurve(C, P, atk);
        arcBall(C, P, T.act * k);
        if (Dc) { moveTok(def, Dc.id, P); addCls(def, Dc.id, 'steal'); }
        if (R) { addCls(atk, R.id, 'beaten'); addCls(atk, R.id, 'tag-off'); }
      }
    } else if (ev.type === 'duel' && (ev.action === 'pass' || isCross)) {
      const R = tokOf(prevL, ev.receiverId, atk) || prevL.ball;
      if (isCross) {
        trailCurve(C, R, atk, !!ev.ultimate);
        arcBall(C, R, T.act * k);
      } else {
        trail(C, R, atk, !!ev.ultimate);
        placeBallAt(R.x, R.y);
      }
      addCls(atk, ev.receiverId, 'catching');
      linkAt = R;
      if (D && ev.defAction === 'tackle') addCls(def, D.id, 'fallen');
      // ④ 박스 연결 성공: GK 가 길목으로 튀어나왔지만 못 끊음 (재배치 때 골문으로 돌아가 받은 선수와 1:1)
      if (ev.boxLink && D) moveTok(def, D.id, lerp(D, linkPoint(C, R, isCross, 0.55), 0.3));
    } else if (ev.type === 'save' && ev.boxLink) {
      // ④ 박스 연결 실패: GK 가 튀어나와 길목에서 잡는다 (🧤) → 세이브와 같은 흐름 (그 GK 의 배급)
      const R = tokOf(prevL, failedReceiver(ev, prevL, prevView), atk);
      let P = D ? lerp(C, D, 0.5) : C;
      if (R) {
        const mid = linkPoint(C, R, isCross, 0.55);
        P = D ? lerp(mid, D, 0.25) : mid;
        if (isCross) trailCurve(C, R, atk, !!ev.ultimate, 0.55);
        else trail(C, P, atk, !!ev.ultimate);
      }
      if (D) { moveTok(def, D.id, P); addCls(def, D.id, 'claim'); }
      placeBallAt(P.x, P.y);
      if (ev.defUltimate && D) addCls(def, D.id, 'ult-act');
    } else if (ev.type === 'duel') {
      const to = prevL.nextBall || C;
      moveTok(atk, ev.playerId, to);
      placeBallAt(to.x, to.y, atk);
      linkAt = to;
      // 태클 실패 = 제쳐짐: 수비수가 넘어져 잠깐 누운 모습 (GDD v0.5 §9.4). 그 밖의 뚫림은 뒤로 처짐
      if (D) addCls(def, D.id, ev.defAction === 'tackle' ? 'fallen' : 'beaten');
    } else if (ev.type === 'turnover') {
      let P = D ? lerp(D, C, 0.55) : C;
      if (ev.action === 'pass' || isCross) {
        const rid = failedReceiver(ev, prevL, prevView);
        const R = tokOf(prevL, rid, atk);
        if (R) {
          if (isCross) {
            const q = curvePoint(toPx(C.x, C.y), toPx(R.x, R.y), 0.5);
            P = d25 ? lerp(C, R, 0.5) : fromPx(q[0], q[1]); // 2.5D: 끊긴 자리 = 곡선 아래 바닥 점
            trailCurve(C, R, atk, false, 0.5);
          } else {
            P = lerp(C, R, 0.5);
            trail(C, P, atk);
          }
        }
      }
      if (D) { moveTok(def, D.id, P); addCls(def, D.id, 'steal'); }
      placeBallAt(P.x, P.y);
    } else if (ev.type === 'save' || (ev.type === 'penalty' && !ev.success)) {
      const G = D || goalPt;
      const p = lerp(C, G, 0.92);
      placeBallAt(p.x, p.y);
      if (D) addCls(def, D.id, 'dive');
      if (ev.header) addCls(atk, C.id, 'header');
      if (ev.defUltimate && D) addCls(def, D.id, 'ult-act');
    } else if (ev.type === 'goal' || ev.type === 'penalty') {
      trail(C, goalPt, atk, !!ev.ultimate);
      placeBallAt(goalPt.x + (ev.type === 'penalty' ? 6 : 0), goalPt.y);
      if (D) addCls(def, D.id, 'dive');
      if (ev.header) addCls(atk, C.id, 'header');
    }
    if (ev.ultimate && C?.id) addCls(atk, C.id, 'ult-act');
    // 연계 문구 (성공한 비트만): 킬패스! · 원터치! · 헤더! · 침투! · 합체기! — ④ 박스 연결 성공이면 앞에 "컷백!" · "센터링!"
    const ok = ev.type === 'goal' || (ev.type === 'duel' && ev.success) || (ev.type === 'penalty' && ev.success) || (ev.type === 'distribution' && ev.success);
    const links = Array.isArray(ev.links) ? ev.links.map((l) => (typeof l === 'string' ? l : l?.label)).filter(Boolean) : [];
    if (ok && ev.boxLink && ev.type === 'duel') links.unshift(`${L.BOX_LINK_LABELS[ev.action] ?? ''}!`);
    // GK 롱패스 성공: "롱패스!" (캐논 킥이면 "캐논 킥!" 도)
    if (ok && ev.type === 'distribution' && ev.action === 'long') {
      const sk = ev.skillId && Array.isArray(data.skills) ? data.skills.find((s) => s.id === ev.skillId) : null;
      links.push(...[sk ? `${sk.name}!` : null, '롱패스!'].filter(Boolean));
    }
    if (ok && links.length) later(() => linkPop(links.join(' '), linkAt, prevL), Math.round(T.act * k * 0.5));
  }
  /** 패스(직선) · 크로스(포물선) 길 위의 점 (필드 좌표) — t = 0 공 가진 선수 … 1 받는 선수 */
  function linkPoint(C, R, curve, t) {
    if (!curve || d25) return lerp(C, R, t); // 2.5D: 공중 곡선 아래의 바닥 점 = 직선 위 점
    const q = curvePoint(toPx(C.x, C.y), toPx(R.x, R.y), t);
    return fromPx(q[0], q[1]);
  }

  /** 실패한 패스·크로스가 향하던 선수: 엔진 이벤트(판정 때 정한 받는 선수) → 이번 비트의 사람 결정 → 직전 view 의 기본값 → 레이아웃 기본값 */
  function failedReceiver(ev, prevL, prevView) {
    if (ev.receiverId) return ev.receiverId;
    const human = humanOf(prevView);
    if (ev.side === human && lastDecision && lastDecision.action === ev.action && lastDecision.receiverId) return lastDecision.receiverId;
    return prevView?.receivers?.[ev.action]?.defaultId ?? prevL.receiverId ?? null;
  }

  function linkPop(text, at, Lay = null) {
    if (!at) return;
    // 문구 상자(가운데 기준): 토큰 위(이름표 위) → 오른쪽 → 왼쪽 → 아래. 필드 위쪽 끝이라 위에 못 두면 아래부터.
    // 장애물 = 토큰 전원 + 연계가 터진 자리(공 가진 선수가 옮겨 간 자리) + 이름표·말풍선 + 공 → 수비수 이름표·GK 얼굴을 덮지 않는다
    const w = textWidth(text, FONT.link) + 10;
    const hh = 22;
    const [cx, cy] = toPx(at.x, at.y);
    const r = tokPx / 2;
    const spot = (x0, y0) => {
      const x = clamp(x0, w / 2 + 2, W - w / 2 - 2);
      const y = clamp(y0, hh / 2 + 2, H - hh / 2 - 2);
      return { x, y, box: { l: x - w / 2, r: x + w / 2, t: y - hh / 2, b: y + hh / 2 } };
    };
    // 2.5D: at = 발 → 위 = 머리 위, 옆 = 몸 가운데 높이 · 반폭 바깥, 아래 = 발밑 이름표 아래
    const g = d25 ? tokGeo({ x: at.x, y: at.y, side: at.side, id: at.id }) : null;
    const rx = g ? g.hw : r;
    const upY = g ? cy - g.fh - 16 : cy - r - 30;
    const midY = g ? cy - g.fh / 2 : cy;
    const up = spot(cx, upY);
    const down = spot(cx, g ? cy + g.ny + 30 : cy + r + 26);
    const right = spot(cx + rx + 8 + w / 2, midY);
    const left = spot(cx - rx - 8 - w / 2, midY);
    const upR = spot(cx + rx + w / 2, g ? cy - g.fh * 0.85 : cy - r - 14);
    const upL = spot(cx - rx - w / 2, g ? cy - g.fh * 0.85 : cy - r - 14);
    const nearTop = upY - hh / 2 < 2;
    const cands = nearTop ? [down, right, left, upR, upL, up] : [up, upR, upL, right, left, down];
    const L0 = Lay || curL;
    const obstacles = [...(L0?.tokens || []).map(tokenRect), tokenRect({ x: at.x, y: at.y, role: 'carrier' }), ...tagBoxes];
    if (L0?.ball) obstacles.push(ballRect(L0));
    const pick = pickSpot(cands, obstacles) || cands[0];
    const el = h('div', { class: 'm-link', style: { transform: `translate(${round1(pick.x)}px, ${round1(pick.y)}px)` } }, h('span', {}, text));
    el.style.setProperty('--t-pop', `${Math.round(Math.max(600, (T.act + T.move) * fx()))}ms`);
    popLayer.append(el);
    later(() => el.remove(), Math.max(600, (T.act + T.move) * fx()));
  }

  function goalFlash(ev, view) {
    const us = ev.side === humanOf(view);
    drawHud(view, isFinished());
    goalFx.textContent = us ? 'GOAL!' : '실점';
    goalFx.className = `goal-fx show ${us ? 'home' : 'away'}`;
    grass.classList.add(us ? 'flash-good' : 'flash-bad');
    later(() => {
      goalFx.className = 'goal-fx';
      grass.classList.remove('flash-good', 'flash-bad');
    }, Math.max(350, (T.goal + T.move * 0.5) * fx()));
  }

  /** ② 재배치: computeLayout 새 좌표로 전원 이동 + 패널·배너 갱신 */
  function movePhase(nextL, view) {
    field.classList.remove('phase-act');
    field.classList.add('phase-move');
    ballEl.classList.remove('ult');
    trailG.replaceChildren();
    applyLayout(nextL, view, { anim: !reduced });
    drawPanels(view);
    updateBanner(nextL, view);
  }

  /** ③ 결과 한 줄: 공 근처에 짧게 띄운다 (로그에는 전체 문장). 토큰을 덜 가리는 쪽(좌/우 · 위/아래)을 고른다 */
  function resultPhase(ev, prevL, nextL, view) {
    const r = ev ? beatResult(ev, view) : null;
    if (!r) return;
    let at = nextL?.ball || { x: 50, y: 50 };
    if (ev.type === 'penalty') at = prevL?.ball || at;
    // 세이브(④ 박스 연결 실패 = GK 캐치 포함): 잡은 GK 옆 (재배치 뒤 GK 는 자기 박스에서 공을 들고 배급을 기다린다)
    if (ev.type === 'save') at = tokOf(nextL, ev.defenderId, ev.side === 'away' ? 'home' : 'away') || at;
    let side;
    let x;
    let y;
    if (ev.type === 'goal') {
      side = 'c'; x = W / 2; y = H * 0.62;
    }
    // 결정타 칩 (표시 전용): 결과 한 줄 맨 앞 — 자리 고르기의 폭에도 넣는다 (칩 = 글자 FONT.chip + 좌우 여백 · 간격 14)
    const chips = popChips(ev, view);
    const chipW = chips.reduce((s, c) => s + textWidth(c.text, FONT.chip) + 14, 0);
    if (ev.type !== 'goal') {
      const w = textWidth(r.text, FONT.pop) + 20 + chipW;
      const [ax, ay] = toPx(at.x, at.y);
      const firstR = ax <= W / 2; // 공이 화면 왼쪽 절반이면 오른쪽부터
      const cands = [];
      for (const dy of [0, -tokPx * 1.1, tokPx * 1.1]) {
        for (const s of firstR ? ['r', 'l'] : ['l', 'r']) {
          const px = ax + (s === 'r' ? 1 : -1) * tokPx;
          const py = clamp(ay + dy, 14, H - 14);
          cands.push({ side: s, x: px, y: py, box: { l: s === 'r' ? px : px - w, r: s === 'r' ? px + w : px, t: py - 12, b: py + 12 } });
        }
      }
      // 옆이 막혔으면 공 위 · 아래 (가운데 맞춤, 필드 안으로 당김) → 한 칸 더 위 · 아래 옆 (2026-09-30: 칩으로 줄이 길어져도 공 근처에)
      const cx = clamp(ax, w / 2 + 4, W - w / 2 - 4);
      for (const dy of [-tokPx * 1.7, tokPx * 1.7, -tokPx * 2.5, tokPx * 2.5]) {
        const py = ay + dy;
        if (py < 14 || py > H - 14) continue;
        cands.push({ side: 'c', x: cx, y: py, box: { l: cx - w / 2, r: cx + w / 2, t: py - 12, b: py + 12 } });
      }
      for (const dy of [-tokPx * 2.2, tokPx * 2.2]) {
        for (const s of firstR ? ['r', 'l'] : ['l', 'r']) {
          const px = ax + (s === 'r' ? 1 : -1) * tokPx;
          const py = ay + dy;
          if (py < 14 || py > H - 14) continue;
          cands.push({ side: s, x: px, y: py, box: { l: s === 'r' ? px : px - w, r: s === 'r' ? px + w : px, t: py - 12, b: py + 12 } });
        }
      }
      // 공 근처가 다 막혔으면 필드 가운데 줄 중 빈 띠로 (공과 가까운 띠부터)
      const bands = [0.1, 0.28, 0.5, 0.72, 0.9].map((f) => H * f).sort((a, b) => Math.abs(a - ay) - Math.abs(b - ay));
      for (const by of bands) cands.push({ side: 'c', x: W / 2, y: by, box: { l: W / 2 - w / 2, r: W / 2 + w / 2, t: by - 12, b: by + 12 } });
      // 장애물 = 토큰 전원 + 공 + 이름표·말풍선 (재배치 applyLayout 이 방금 고른 자리 — 결과 한 줄이 예상 행동 말풍선을 덮지 않게)
      const obstacles = [...(nextL?.tokens || []).map(tokenRect), ...tagBoxes];
      if (nextL?.ball) obstacles.push(ballRect(nextL));
      const pick = pickSpot(cands, obstacles) || cands[0];
      ({ side, x, y } = pick);
    }
    // 수명: 다음 비트가 시작되면 걷히고(clearPops), 멈춰 있으면(결정 대기) 결과 + 액션 시간만큼 보인 뒤 사라진다
    const life = Math.max(900, (T.result + T.act) * fx());
    const el = h('div', {
      // 4x (fast): 칩도 등장 애니메이션 없이 — 결과 한 줄 수명(다음 비트까지)은 그대로
      class: ['m-pop', side, r.tone, ev.type === 'goal' ? 'big' : '', fx() <= 0.25 ? 'fast' : ''],
      style: { transform: `translate(${round1(x)}px, ${round1(y)}px)` },
    }, h('span', {}, ...chips.map((c) => h('b', { class: c.cls, title: c.title }, c.text)), r.text));
    el.style.setProperty('--t-pop', `${Math.round(life)}ms`); // CSS 페이드 길이 = 배속 반영 수명
    for (const old of [...popLayer.querySelectorAll('.m-pop')]) old.remove();
    popLayer.append(el);
    later(() => el.remove(), life);
  }

  /**
   * 결과 한 줄 앞 결정타 칩 (클래시 바 1단계, 표시 전용 — 엔진 판정 이벤트 decisive · upset · p): [요인 칩] [대이변!].
   * 요인 칩 = decisive.text ("짝 적중 ×1.7" · "킬패스 +20%" · "필살 ×2" · "제쳐짐 +25%" · "능력치 우위 ×1.3"),
   * 색 = 종류 (labels.js DECISIVE_KINDS: 짝 = 이긴 팀 색, 연계 = 초록, 필살기 = 분홍, 제쳐짐 · 첫 듀얼 = 주황, 스킬 = 보라, 그 밖 = 흰색).
   * 대이변 = 이긴 쪽 확률 < 30% (엔진 upset) → 금색 "대이변!". SHOW_DECISIVE_CHIP = false 또는 matchUi.decisiveChip = false 면 없음.
   * @returns {Array<{ cls: string, text: string, title: string }>}
   */
  function popChips(ev, view) {
    if (!SHOW_DECISIVE_CHIP || ui.decisiveChip === false || !ev) return [];
    const d = ev.decisive && typeof ev.decisive === 'object' ? ev.decisive : null;
    if (!d && !ev.upset) return [];
    const human = humanOf(view);
    const atkSide = ev.side === 'away' ? 'away' : 'home';
    const defSide = atkSide === 'home' ? 'away' : 'home';
    const favours = d?.favours === 'atk' || d?.favours === 'def' ? d.favours : ev.success || ev.type === 'goal' ? 'atk' : 'def';
    const winSide = favours === 'atk' ? atkSide : defSide;
    const who = winSide === human ? '우리' : '상대';
    const p = Number(ev.p);
    const winP = Number.isFinite(p) ? Math.round((favours === 'atk' ? p : 1 - p) * 100) : null;
    const out = [];
    if (d && d.text) {
      const kind = L.DECISIVE_KINDS[d.id] ?? 'base';
      out.push({
        cls: `dchip k-${kind} side-${winSide}`,
        text: d.text,
        title: `결정타: ${d.text} — ${who} 쪽으로 가장 크게 기운 요인${winP != null ? ` (이긴 쪽 확률 ${winP}%)` : ''}`,
      });
    }
    if (ev.upset) out.push({ cls: 'dchip dchip-upset', text: '대이변!', title: `대이변 — ${who}의 승리 확률 ${winP ?? '-'}%` });
    return out;
  }

  function clearPops() {
    for (const el of [...popLayer.children]) {
      if (el.classList.contains('out')) continue;
      el.classList.add('out');
      later(() => el.remove(), 160);
    }
  }

  function finishBeat() {
    field.classList.remove('phase-act', 'phase-move');
    hideCut();
    setBusy(false);
    // 연출 중 바뀐 것 반영: 자동/개입 전환(받는 선수 후보 확정 여부), 토글
    relayout({ anim: !reduced });
    drawPanels(curView);
    schedule(0);
  }

  function trail(a, b, side, ult = false) {
    trailG.replaceChildren();
    const [ax, ay] = toPx(a.x, a.y);
    const [bx, by] = toPx(b.x, b.y);
    const common = { x1: round1(ax), y1: round1(ay), x2: round1(bx), y2: round1(by) };
    trailG.append(svgEl('line', { ...common, class: `trail ${side}${ult ? ' ult' : ''}` }));
  }
  /** 크로스 궤적 (포물선). upTo < 1 이면 곡선의 앞부분만 (중간에 끊긴 크로스) */
  function trailCurve(a, b, side, ult = false, upTo = 1) {
    trailG.replaceChildren();
    const p0 = toPx(a.x, a.y);
    const p2 = toPx(b.x, b.y);
    const cp = curveCtrl(p0, p2);
    let d;
    if (upTo >= 1) d = `M${round1(p0[0])},${round1(p0[1])} Q${round1(cp[0])},${round1(cp[1])} ${round1(p2[0])},${round1(p2[1])}`;
    else {
      // 드 카스텔조 분할: [0, upTo] 구간의 제어점
      const t = upTo;
      const c1 = [p0[0] + (cp[0] - p0[0]) * t, p0[1] + (cp[1] - p0[1]) * t];
      const e = curvePoint(p0, p2, t);
      d = `M${round1(p0[0])},${round1(p0[1])} Q${round1(c1[0])},${round1(c1[1])} ${round1(e[0])},${round1(e[1])}`;
    }
    if (d25) {
      // 2.5D: 공중 곡선 아래 바닥 그림자 길 (곡선 끝까지의 바닥 직선)
      const e = lerp2(p0, p2, Math.min(1, upTo));
      trailG.append(svgEl('line', { x1: round1(p0[0]), y1: round1(p0[1]), x2: round1(e[0]), y2: round1(e[1]), class: 'trail ground' }));
    }
    trailG.append(svgEl('path', { d, class: `trail cross ${side}${ult ? ' ult' : ''}` }));
  }
  /** 공이 포물선으로 날아간다 (높이 = 크기). Web Animations 가 없으면(jsdom) 바로 도착 */
  function arcBall(a, b, duration) {
    if (d25) { arcBall25(a, b, duration); return; }
    stopBallArc();
    const p0 = toPx(a.x, a.y);
    const p2 = toPx(b.x, b.y);
    ballEl.classList.add('arc');
    ballEl.style.transform = `translate(${round1(p2[0])}px, ${round1(p2[1])}px)`;
    if (reduced || typeof ballEl.animate !== 'function' || duration < 50) return;
    const frames = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const p = curvePoint(p0, p2, t);
      frames.push({ transform: `translate(${round1(p[0])}px, ${round1(p[1])}px) scale(${round3(1 + 0.7 * Math.sin(Math.PI * t))})` });
    }
    try {
      ballAnim = ballEl.animate(frames, { duration: Math.round(duration * 0.9), easing: 'ease-in-out' });
      ballAnim.onfinish = () => { ballAnim = null; };
    } catch (_) {
      ballAnim = null;
    }
  }
  /**
   * 2.5D 호 (SPRITE_25D_PLAN §4): 공 요소 (= 바닥 그림자 자리) 는 바닥 직선을 따라가고 크기는 깊이 배율, 공 글자만 위로 뜬다
   * (꼭대기 = curveCtrl 과 같은 arcLift, 모양 4t(1−t) — 궤적 · 화살표 곡선과 같은 길). 그림자는 높을수록 작고 옅게.
   */
  function arcBall25(a, b, duration) {
    stopBallArc();
    const pa = V.project(a.x, a.y, W, H);
    const pb = V.project(b.x, b.y, W, H);
    const p0 = [pa.sx, pa.sy];
    const p2 = [pb.sx, pb.sy];
    ballEl.classList.add('arc');
    ballEl.style.transform = `translate(${round1(p2[0])}px, ${round1(p2[1])}px) scale(${round3(pb.s)})`;
    if (reduced || typeof ballEl.animate !== 'function' || duration < 50) return;
    const cp = curveCtrl(p0, p2);
    const lift = (p0[1] + p2[1]) / 2 - cp[1]; // = 2 × 꼭대기
    const shadow = ballEl.querySelector('.b-shadow');
    const ground = [];
    const up = [];
    const sh = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const p = lerp2(p0, p2, t);
      const sc = pa.s + (pb.s - pa.s) * t;
      const hgt = lift * 2 * t * (1 - t); // 4t(1−t) × 꼭대기
      ground.push({ transform: `translate(${round1(p[0])}px, ${round1(p[1])}px) scale(${round3(sc)})` });
      up.push({ transform: `translateY(${round1(-hgt / sc)}px)` });
      const k = Math.sin(Math.PI * t);
      sh.push({ transform: `scale(${round3(1 - 0.3 * k)})`, opacity: round3(1 - 0.35 * k) });
    }
    try {
      const opts = { duration: Math.round(duration * 0.9), easing: 'ease-in-out' };
      const anims = [ballEl.animate(ground, opts), ballIco.animate(up, opts), shadow ? shadow.animate(sh, opts) : null].filter(Boolean);
      ballAnim = { cancel: () => { for (const x of anims) x.cancel(); } };
      anims[0].onfinish = () => { ballAnim = null; };
    } catch (_) {
      ballAnim = null;
    }
  }
  function stopBallArc() {
    if (ballAnim) { try { ballAnim.cancel(); } catch (_) { /* ignore */ } ballAnim = null; }
    if (ballEl.classList.contains('arc')) {
      ballEl.classList.remove('arc');
      void ballEl.offsetWidth;
    }
  }

  function beatResult(ev, view) {
    const nm = (side, id) => nameOf(view, side, id);
    const atk = ev.side === 'away' ? 'away' : 'home';
    const def = atk === 'home' ? 'away' : 'home';
    const us = atk === humanOf(view);
    const good = us ? 'good' : 'bad';
    const bad = us ? 'bad' : 'good';
    const read = ev.readBy ? ' (간파)' : '';
    switch (ev.type) {
      case 'duel':
        if (ev.boxLink && (ev.action === 'pass' || ev.action === 'cross')) {
          // ④ 박스 연결 성공: 받은 선수의 원터치 슛 · 헤더 찬스 (GK 와 1:1)
          return { text: `${nm(atk, ev.playerId)} → ${nm(atk, ev.receiverId)} ${L.BOX_LINK_LABELS[ev.action]} 성공 · ${L.BOX_LINK_FINISH[ev.action]} 찬스`, tone: good };
        }
        if (ev.action === 'pass' || ev.action === 'cross') {
          return { text: `${nm(atk, ev.playerId)} → ${nm(atk, ev.receiverId)} ${ev.action === 'cross' ? '크로스' : '패스'} 성공${read}`, tone: good };
        }
        return { text: `${nm(atk, ev.playerId)} 드리블 돌파${read}`, tone: good };
      case 'turnover':
        // GK 롱패스 실패 (2026-09-29): 상대 MF 가 낙하 지점에서 끊음 → 세컨드볼, 끊은 팀이 중원에서 공격.
        // 2026-09-30: 역습을 시작하는 선수(엔진 starterId)가 끊은 선수와 다르면 "끊은 선수 → 시작 선수 세컨드볼" (공이 그 선수에게 가므로),
        // 마지막 포제션이라 경기가 끝났으면(엔진 matchEnd) "— 경기 종료"
        if (ev.distribution) {
          const stealer = nm(def, ev.defenderId) || '상대';
          if (ev.matchEnd) return { text: `${stealer} 롱패스 차단! — ${ev.matchEnd === 'penalties' ? '승부차기' : '경기 종료'}`, tone: bad };
          const starter = ev.starterId && ev.starterId !== ev.defenderId ? nm(def, ev.starterId) : '';
          return { text: starter ? `${stealer} 롱패스 차단! → ${starter} 세컨드볼` : `${stealer} 롱패스 차단! 세컨드볼 — ${us ? '상대' : '우리'} 중원 공격`, tone: bad };
        }
        // 필살 수비(E2 — 판정 이벤트 defUltimate)로 막았으면 "필살 태클!" 처럼
        return { text: `${nm(def, ev.defenderId)} ${skillById(ev.defUltimate)?.ultimate?.type === 'defense' ? '필살 ' : ''}${L.ACTION_LABELS[ev.defAction] ?? '수비'}! ${us ? '공 뺏김' : '공 탈취'}${read}`, tone: bad };
      case 'distribution':
        // GK 배급 (2026-09-29): 짧은 패스 = 빌드업부터, 롱패스 성공 = 중원부터
        return ev.action === 'long'
          ? { text: `${nm(atk, ev.playerId)} ${ev.sure ? '확정 ' : ''}롱패스 → ${nm(atk, ev.receiverId)} · 중원부터${ev.nextBonus ? ` (첫 듀얼 +${Math.round(ev.nextBonus * 100)}%)` : ''}`, tone: good }
          : { text: `${nm(atk, ev.playerId)} → ${nm(atk, ev.receiverId)} 짧은 패스 · 빌드업부터`, tone: 'neutral' };
      case 'save':
        // ④ 박스 연결 실패 = GK 가 튀어나와 잡음 (세이브와 같음)
        if (ev.boxLink) return { text: `${nm(def, ev.defenderId)} ${ev.defUltimate ? '필살 ' : ''}캐치! ${L.BOX_LINK_LABELS[ev.action] ?? ''} 끊어냄`, tone: bad };
        return { text: `${nm(def, ev.defenderId)} ${ev.defUltimate ? '필살 ' : ''}세이브!`, tone: bad };
      case 'goal':
        return { text: us ? `골!! ${nm(atk, ev.playerId)}${ev.header ? ' (헤더)' : ''}` : `실점 — ${nm(atk, ev.playerId)}`, tone: good };
      case 'penalty':
        return ev.success
          ? { text: `${nm(atk, ev.playerId)} 성공`, tone: good }
          : { text: `${nm(def, ev.defenderId)} 선방`, tone: bad };
      case 'counter':
        return { text: us ? '역습!' : '상대 역습!', tone: good };
      case 'kickoff':
        return { text: us ? '우리 킥오프' : '상대 킥오프', tone: 'neutral' };
      default:
        return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 진행 루프                                                             */
  /* ------------------------------------------------------------------ */
  /** 다음 step 예약. 연출 중·결정 대기(수동)·종료면 예약하지 않는다. */
  function schedule(delay = 0) {
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
    if (!alive() || busy) return;
    if (isFinished()) { showResult(); return; }
    if (paused(getView())) return; // 사람이 선택할 차례
    ui.timer = setTimeout(() => {
      ui.timer = null;
      if (alive() && !busy) doStep(null);
    }, Math.max(0, delay));
  }

  function doStep(decision) {
    if (busy || !alive()) return false;
    const ms = store.match;
    if (!ms || isFinished()) { schedule(); return false; }
    if (ui.timer) { clearTimeout(ui.timer); ui.timer = null; }
    const before = Array.isArray(ms.events) ? ms.events.length : 0;
    const prevL = curL;
    const prevView = curView;
    const r = safe(() => match.step(ms, data, decision));
    if (r === undefined) { refresh(); return false; } // 엔진 오류: 루프를 멈춘다 (토스트 표시됨)
    persist(ms);
    lastDecision = decision && decision.action ? decision : null; // 자동 비트(결정 없음)는 이전 사람 결정을 물려받지 않는다
    if (decision && decision.action) ui.lastDecision = { ...decision }; // 테스트·도구용 (읽기 전용)
    const fresh = Array.isArray(ms.events) ? ms.events.slice(before) : [];
    const view = getView();
    const nextL = layoutFor(view);
    const hasBeat = fresh.some((e) => e && BEATS.has(e.type));
    const hasCut = fresh.some((e) => e && (e.type === 'cutin' || e.type === 'combo'));
    if ((!hasBeat && !hasCut) || !prevL || !nextL) {
      // 간파 단독 사용 등: 연출 없이 바로 갱신
      applyLayout(nextL, view);
      drawPanels(view);
      updateBanner(nextL, view);
      schedule(T.idle * fx());
      return true;
    }
    animateBeat(fresh, prevL, nextL, view, prevView, decision && decision.action ? decision.action : null);
    return true;
  }

  function decide(action) {
    const view = getView();
    if (!canDecideNow(view) || !view.needsDecision) return;
    if (distOf(view)) {
      // GK 배급 결정 { action: "short"|"long", skillId? } — 배급 스킬(캐논 킥)은 롱패스와만 (엔진이 짧은 패스 + 스킬은 거부)
      if (!DIST_ACTIONS.includes(action)) return;
      const d = { action };
      const sk = distSkill(view);
      if (sk && action === 'long') d.skillId = sk.skillId;
      ui.intervene = false;
      doStep(d);
      return;
    }
    const decision = { action };
    if (ui.selectedSkillId) decision.skillId = ui.selectedSkillId;
    const u = ultOption(view);
    if (ui.ultimate && u?.usable && ultCompatible(u, action)) decision.ultimate = true;
    if (RECV_ACTIONS.includes(action)) {
      const ri = recvInfo(view, action);
      if (ri?.id) decision.receiverId = ri.id;
    }
    ui.intervene = false;
    doStep(decision);
  }

  /** 토큰 탭: 결정 중 받는 선수 후보면 그 선수를 받는 선수로 (패스·크로스 중 후보인 액션 모두), 아니면 미니 카드 */
  function tapToken(side, id) {
    const view = curView;
    if (view && !busy && canDecideNow(view) && side === humanOf(view) && view.attackingSide === side) {
      const acts = RECV_ACTIONS.filter((a) => recvInfo(view, a)?.candidates.includes(id));
      if (acts.length) {
        for (const a of acts) ui.receiverPick[a] = { id, arrival: recvInfo(view, a).arrival };
        relayout({ anim: false });
        drawPanels(curView);
        const el = tokEls.get(`${side}:${id}`);
        if (el) { el.classList.remove('pick-flash'); void el.offsetWidth; el.classList.add('pick-flash'); }
        return;
      }
    }
    openCard(side, id);
  }

  function refresh() {
    const view = getView();
    const Lay = layoutFor(view);
    applyLayout(Lay, view, { anim: false });
    drawPanels(view);
    updateBanner(Lay, view, true);
  }

  function skip() {
    if (isFinished()) { showResult(); return; }
    cancelTimers();
    setBusy(false);
    hideArrow();
    hideCut();
    stopBallArc();
    trailG.replaceChildren();
    popLayer.replaceChildren();
    field.classList.remove('phase-act', 'phase-move');
    const ms = store.match;
    const r = safe(() => match.simulateAuto(ms, data));
    persist(ms);
    refresh();
    if (r !== undefined) showResult();
  }

  function showResult() {
    if (ui.resultShown || !alive()) return;
    const ms = store.match;
    const result = safe(() => match.getResult(ms));
    if (!result) return;
    ui.resultShown = true;
    const home = ms.home || {};
    const away = ms.away || {};
    const score = ms.score || {};
    const winner = result.winner;
    const verdict = winner === 'home' ? '승리!' : winner === 'away' ? '패배…' : '무승부';
    const nameOfP = (side, id) => (side === 'home' ? home : away)?.players?.find?.((p) => p.id === id)?.name ?? '-';
    const st = result.stats || ms.stats || {};
    const hg = result.homeGoals ?? score.home ?? 0;
    const ag = result.awayGoals ?? score.away ?? 0;
    const rows = [['슛', 'shots'], ['듀얼 승', 'duelsWon'], ['골', 'goals'], ['필살기', 'ultimatesUsed'], ['합체기', 'combos'], ['간파', 'gaanpaUsed']]
      .filter(([, k]) => k in (st.home || {}) || k in (st.away || {}) || ['shots', 'duelsWon', 'goals'].includes(k));
    openModal(h('div', { class: 'col', style: { gap: '12px' } },
      h('h2', { class: 'center' }, `${mode?.label ?? L.KIND_LABELS[result.kind ?? ms.kind] ?? ''} 결과`),
      h('div', { class: 'row between small muted' }, h('span', { class: 'ellipsis' }, home.name ?? '우리 클럽'), h('span', { class: 'ellipsis' }, away.name ?? '상대')),
      h('div', { class: 'score-big' }, `${hg} : ${ag}`),
      h('div', { class: ['result-verdict', winner === 'home' ? 'good' : winner === 'away' ? 'bad' : 'muted'] }, verdict),
      result.penalties ? h('p', { class: 'center small muted' }, `승부차기 ${result.penalties.home ?? 0} : ${result.penalties.away ?? 0}`) : null,
      h('table', { class: 'stats-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '우리'), h('th', {}, '상대'))),
        h('tbody', {},
          rows.map(([lbl, k]) => h('tr', {}, h('td', {}, lbl), h('td', {}, st.home?.[k] ?? 0), h('td', {}, st.away?.[k] ?? 0))),
          h('tr', {}, h('td', {}, 'MVP'), h('td', {}, nameOfP('home', st.home?.mvpId)), h('td', {}, nameOfP('away', st.away?.mvpId))))),
      h('button', {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: (e) => {
          // run.finishMatch (도전 모드: mode.onFinish) 는 정확히 1회: 연타 방지 (실패하면 app.js 가 render() 로 경기 화면을 다시 그려 재시도 가능)
          if (finishing) return;
          finishing = true;
          if (e?.currentTarget) e.currentTarget.disabled = true;
          closeOverlays();
          ui.resultShown = false;
          if (typeof mode?.onFinish === 'function') mode.onFinish(result);
          else actions.finishMatch(result);
        },
      }, '확인'),
    ), { closable: false });
  }

  /* ------------------------------------------------------------------ */
  /* 토큰 길게 누르기 → 미니 카드 (스탯 · 체력 · 스킬 · 적성 · 연계 특성 · 필살 게이지)  */
  /* ------------------------------------------------------------------ */
  function openCard(side, id) {
    if (cardModal?.el?.isConnected) return;
    const snap = store.match?.[side]?.players?.find?.((p) => p.id === id) || null;
    const pv = (curView?.players?.[side] || []).find((p) => p.id === id) || null;
    if (!snap && !pv) return;
    const p = { ...(pv || {}), ...(snap || {}) };
    const mx = Number(pv?.staminaMax) || cfg.match?.staminaMax || 100;
    const st = Number(pv?.stamina ?? mx);
    const ratio = mx ? st / mx : 0;
    const skillDefs = (Array.isArray(snap?.skillIds) ? snap.skillIds : [])
      .map((sid) => (Array.isArray(data.skills) ? data.skills.find((s) => s.id === sid) : null) || { id: sid, name: sid, kind: '' });
    const tok = tokOf(curL, id, side);
    const ti = p.trait ? L.traitInfo(p.trait, data) : null;
    const ult = curView?.ultimate?.[side]?.[id] || null;
    const meta = [
      side === 'home' ? '우리' : '상대',
      p.slot ?? p.position,
      L.STYLE_LABELS[p.style] ?? p.style,
      p.element ? `${L.ELEMENT_ICONS[p.element] ?? ''}${L.ELEMENT_LABELS[p.element] ?? p.element}` : null,
      p.race ? L.RACE_LABELS[p.race] ?? p.race : null,
      p.aptitude ? `적성 ${p.aptitude}` : null,
    ].filter(Boolean).join(' · ');
    // 결정 중 받는 선수 후보면 카드에서도 고를 수 있게
    const view = curView;
    const pickActs = view && !busy && canDecideNow(view) && side === humanOf(view) && view.attackingSide === side
      ? RECV_ACTIONS.filter((a) => recvInfo(view, a)?.candidates.includes(id)) : [];
    const content = h('div', { class: 'mini-card' },
      h('div', { class: 'row' },
        avatar(p.portraitColor, p.name, 'md', side === 'home' ? 'ring-home' : 'ring-away', { art: snapArt(side, id) }),
        h('div', { class: 'col grow' },
          h('b', {}, p.name ?? ''),
          h('span', { class: 'small muted' }, meta)),
        p.isYouth ? h('span', { class: 'badge badge-warn' }, '유스') : null,
        tok ? h('span', { class: 'badge' }, L.TOKEN_ROLE_LABELS[tok.role] ?? tok.role) : null),
      ti ? h('div', { class: 'mc-trait' }, h('span', { class: 'badge badge-accent' }, `${ti.icon} ${ti.name}`), h('span', { class: 'tiny muted' }, ti.description)) : null,
      p.stats ? h('div', { class: 'mc-stats' }, L.STATS.map((k) =>
        h('div', { class: 'cell' }, h('span', { class: 'tiny muted' }, L.STAT_LABELS[k]), statBadge(p.stats[k], ctx.thresholds)))) : null,
      h('div', { class: 'row small' }, h('span', { class: 'muted' }, '체력'),
        bar(ratio, ratio <= 0.2 ? 'bad' : ratio <= 0.5 ? 'warn' : 'good'), h('span', {}, `${Math.round(st)}/${mx}`)),
      ult ? h('div', { class: 'row small' }, h('span', { class: 'muted' }, '필살'),
        bar((Number(ult.gauge) || 0) / gaugeMax, 'ult'), h('span', {}, `${Math.round(Number(ult.gauge) || 0)}/${gaugeMax}${ult.combo ? ' · 합체기 가능' : ult.ready ? ' · 준비' : ''}`)) : null,
      skillDefs.length
        ? h('div', { class: 'col small' }, skillDefs.map((sk) => h('div', { class: 'mc-skill' },
          sk.kind ? h('span', { class: 'badge' }, L.SKILL_KIND_LABELS[sk.kind] ?? sk.kind) : null, ' ',
          h('b', {}, sk.name ?? sk.id), sk.description ? h('span', { class: 'tiny muted' }, ` ${sk.description}`) : null)))
        : h('p', { class: 'tiny muted' }, '스킬 없음'),
      pickActs.length ? h('button', {
        class: 'btn btn-primary btn-block',
        type: 'button',
        onclick: () => { cardModal?.close(); tapToken(side, id); },
      }, `받는 선수로 (${pickActs.map((a) => actName(view, a)).join('·')})`) : null,
      h('button', { class: 'btn btn-block', type: 'button', onclick: () => cardModal?.close() }, '닫기'));
    cardModal = openModal(content, { className: 'mini-card-modal', onClose: () => { cardModal = null; } });
  }

  /* ------------------------------------------------------------------ */
  /* 시작                                                                 */
  /* ------------------------------------------------------------------ */
  // 창 크기가 바뀌어도 다시 그리지 않는다: 스테이지 배율만 바뀌고 규칙 영역의 논리 크기(W×H)는 그대로 (js/ui/stage.js)
  logBox.classList.toggle('open', !!ui.logOpen);
  logBox.setAttribute('aria-hidden', ui.logOpen ? 'false' : 'true');
  setDurations(fx());
  preloadArt(cutArtUrls()); // 컷인 그림 (§24.12.4) — 기다리지 않는다
  const v0 = getView();
  const L0 = layoutFor(v0);
  applyLayout(L0, v0, { anim: false });
  drawPanels(v0);
  updateBanner(L0, v0, true);
  if (isFinished()) showResult();
  else schedule(T.start * fx());
}

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                  */
/* ------------------------------------------------------------------ */
function errorScreen(msg, ctx, mode) {
  // 경기 모드 훅 discard (도전: [도전 경기 버리기] — 고장 난 저장본을 지운다). 런 경기는 [처음으로] 하나 그대로
  const discard = mode?.discard && typeof mode.discard.onClick === 'function' ? mode.discard : null;
  return h('div', { class: 'screen' },
    h('div', { class: 'error-panel' }, msg),
    h('button', { class: 'btn', onclick: () => ctx.actions.resetToStart() }, '처음으로'),
    discard ? h('button', { class: 'btn btn-danger', title: discard.title || '', onclick: () => discard.onClick() }, discard.label || '버리기') : null);
}

function svgEl(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k) el.append(k);
  return el;
}

function arrowMarker(id, color) {
  return svgEl('marker', { id, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 3.2, markerHeight: 3.2, orient: 'auto-start-reverse' },
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }));
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/** 간파 비활성 사유의 짧은 형태 (스킬 묶음 버튼 안) */
function shortReason(reason) {
  const map = { '상대가 먼저 간파': '상대 선점', '박스에서는 간파 불가': '박스 불가', '텐션 부족': '텐션 부족', '결정 차례가 아님': '' };
  return map[reason] ?? '';
}

function initialOf(name) {
  const s = String(name ?? '').trim();
  return s ? Array.from(s)[0] : '?';
}
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const clamp01 = (x) => clamp(Number(x) || 0, 0, 1);
/** 두 픽셀 박스 {l,r,t,b} 가 겹치는 넓이 */
const rectOverlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/** 굵은 글자 한 줄의 대략 폭 (px): 한글·기호·이모지는 글자 크기만큼, 영숫자·공백은 0.6배 */
function textWidth(text, size) {
  let w = 0;
  for (const ch of Array.from(String(text ?? ''))) w += ch.codePointAt(0) >= 0x2000 ? size * 1.05 : size * 0.62;
  return w;
}
const round1 = (x) => Math.round(x * 10) / 10;
const round3 = (x) => Math.round(x * 1000) / 1000;
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
function projectOn(a, b, p) {
  // p 를 선분 a→b 위로 투영 (0.2~0.85 구간으로 제한)
  const v = sub2(b, a);
  const len2 = v[0] * v[0] + v[1] * v[1] || 1;
  const t = clamp(((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len2, 0.2, 0.85);
  return lerp2(a, b, t);
}
