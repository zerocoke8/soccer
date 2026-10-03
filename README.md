# 킥오프 레거시 (가제) — 웹 프로토타입

우마무스메식 육성 + 사커스피리츠식 턴제 경기 + 로그라이크 런 구조를 섞은 **7인제 팀 육성 축구 게임**의 웹 프로토타입.
아트 없이 시스템만 검증하는 단계이며, 최종 타깃은 가로 모바일 게임(Unity)이다. 이 웹 프로토타입은 데스크톱 브라우저 테스트용.

- **플레이**: https://zerocoke8.github.io/soccer/
- **카드 레슨 시험판** (이 브랜치 `outgame-lesson`): https://zerocoke8.github.io/soccer/lesson/ — 육성을 카드 레슨 배틀 + 15주 주 선택으로 바꾼 판. 경기 · 도전 모드는 같다
- **기획서**: [docs/GDD_v0.5.md](docs/GDD_v0.5.md) (이전 버전: v0.1~v0.4) · 카드 레슨 초안 [OUTGAME_LESSON_draft.md](docs/OUTGAME_LESSON_draft.md) · [OUTGAME_CARDS_draft.md](docs/OUTGAME_CARDS_draft.md)
- **구현 계약(모듈 설계)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (카드 레슨 시험판: §20, 구현 계획 [docs/LESSON_PROTO_PLAN.md](docs/LESSON_PROTO_PLAN.md))

## 카드 레슨 시험판 (1차)

- 3시즌 × 5주 (레슨 · 자유 · 레슨 · 자유 · 대비) → 경기 전 준비 → 경계전. 레슨 주에는 **중점 구역** 하나를 골라 **카드 배틀**(손패 3장, 6~8턴, 목표 · 퍼펙트 점수)로 7명을 키우고, 자유 주에는 상담(카드 구매 · 강화 · 삭제 = TP, 스킬 = SP) · 전술 미팅 · 친선전 · 외출 · 휴식 중 하나를 한다. 편성에서 **훈련 방침** 5개(에이스형 · 팀형 · 역습형 · 압박형 · 점유형) 중 하나를 고른다.
- **구역 방식** (2026-10-04): 경기장에 훈련 구역 5곳(수비 · 패스 · 슈팅 · 피지컬 · 드리블). 매 턴 7명이 포지션에 따라 구역에 흩어지고, 선수는 **서 있는 구역의 스탯**이 오른다. 카드를 손패에서 **끌어다 놓는다** — 단일(선수 위) · 원(작은 · 중간 · 큰, 원 안 전원) · 전체 · 주인(고유 카드). 카드가 없어도 매 턴 끝 **기본 훈련**으로 조금씩 크고, 지친 선수는 **벤치 칸으로 끌어** 그 턴 쉬게 한다 (턴 끝 체력 +15). 마우스 · 터치 끌기 외에 카드 클릭 → 경기장 클릭(터치는 탭 → 같은 자리 한 번 더), 키보드(← → 후보 · 1~5 구역 · Enter · Esc)로도 낸다.
- 감독 AI 추천은 "추천" 배지(카드 · 명단 [벤치] · [턴 끝])와 조준 중 청록 점선 원으로만 보인다. 개발용으로 주소에 `?autolesson=1` 을 붙이면 레슨 화면이 600ms 마다 추천 행동을 낸다.
- **저장이 본편과 따로다**: 키 앞머리 `soccer-lesson.` (런 · 경기 · 등록 팀 · 도전 진행). 본편(`/soccer/`) 저장은 보이지 않고 바뀌지도 않는다 — 그래서 레슨판 도전 모드는 처음에 샘플 팀만 있다.
- 1차에는 이벤트가 없고, 밸런스는 맞추지 않았다 (시뮬 결과만 본다).

## 로컬 실행

빌드 없음. 정적 서버만 필요하다 (ES 모듈이라 `file://`로는 열리지 않음).

```bash
npm run serve        # python -m http.server 8080  →  http://localhost:8080
```

화면은 인게임·아웃게임 모두 가로 전용 고정 스테이지(논리 1280×720, 16:9)다. 창에 맞춰 한 배율로 키우거나 줄여 가운데에 두고, 남는 곳은 레터박스. 세로 창에서는 "화면을 가로로 돌려 주세요" 안내가 뜬다(스테이지는 그대로 쓸 수 있다). 세로 화면은 없다. 경기 화면은 home 골 왼쪽, 필드가 화면 전체이고 HUD(점수판·트랙·카드·컨트롤·스킬·로그 서랍)가 가장자리에 겹친다 — [GDD 9.16](docs/GDD_v0.5.md), [ARCHITECTURE §14](docs/ARCHITECTURE.md).

## 테스트 · 밸런스 시뮬

```bash
npm i                # devDependency(jsdom) 설치 — UI 스모크 테스트용. 없어도 엔진 테스트는 돌아간다
npm test             # node --test (rng · zones · cards · lesson · lessonRun · manager · cardEffects · lessonRules · run · match · v05 · challenge · layout · orient · stage · lineup · lessonLayout · outgame · lessonUi · ui 스모크, 283 테스트)
npm run lesson-sim   # node tools/lesson_sim.mjs --runs 200 --seed 1  (카드 레슨 런: 감독 AI + 실제 경기, 방침별 스탯 · 승률 · 클리어율 · 부상 · 덱 · TP/SP, 구역 지표 — 기본 훈련 비중 · 고르게 크기 · 벤치 · 일반/특별 점수 p30/p90)
npm run sim          # node tools/sim.mjs --runs 300 --seed 1  (옛 육성 런: 시즌별 승률·등급 분포·부상·우정 훈련·골 · 박스 연결 · GK 배급 · 마지막 공격 · 대이변)
node tools/shot.mjs <출력폴더>   # 로컬 Chrome으로 경기(01~27 — 레슨 런의 친선전 · 경계전에서 찾음)·아웃게임(og_* — 주 · 레슨 · 보상 · 상담 · 준비 · 도전 모드 등) 시나리오 스크린샷 (puppeteer-core, 1280×720). 요약 끝 줄 = 스크롤 · 잘린 글자 · HUD 겹침 · 상태 · 에러 검사에 걸린 시나리오
node tools/shot.mjs <출력폴더> --only og   # 아웃게임만 (--list 로 목록). 레슨 화면만: --only og_lesson,og_lesson_  (레슨 경기장 이름표 · 구역 라벨 겹침, 원 판정 = 그린 원 ↔ 엔진 대상도 검사)
node tools/lesson_play.mjs <출력폴더>     # 실제 입력(마우스 끌기 · 터치 끌기 · 터치 탭 · 클릭 · 키보드)으로 시즌 1 을 진행하며 행동마다 엔진 · 화면 대상 확인 (--until run = 15주, --mobile --touch-only --width 915 --height 412 = 터치 전용 작은 화면)
node tools/shot.mjs <출력폴더> --width 1920 --height 1080   # 다른 창 크기에서 스테이지 배율·레터박스 확인
node tools/challenge_sim.mjs --runs 100 --teams 6   # 도전 모드 단계별 승률 (샘플 팀 + 자동 완주 팀 6개, --targets 로 단계 목표 시험)
node tools/challenge_sim.mjs --write-sample         # 테스트용 샘플 팀(data/challenge_sample_team.json) 다시 만들기
```

밸런스 목표(자동 진행): 시즌1 승률 70~80% / 시즌2 50~60% / 시즌3 35~45%, 등급 중앙값 B, 런당 부상 0.5~1.5, 우정 훈련 3회 이상. 현재 값과 튠 이력은 [docs/ARCHITECTURE.md §9·§11](docs/ARCHITECTURE.md) 참고 (최신 시뮬 전/후: §17.14, v0.4.4 — 80.0 / 59.7 / 38.3%, 밸런스는 기능 정리 뒤 한 번에).

## 도전 모드 (플레이테스트용)

시작 화면 **[🏆 도전 모드]** — 런을 완주하고 등록한 팀(또는 등록 팀이 없어도 쓸 수 있는 **테스트용 샘플 팀**)으로 1~10단계 사다리에 도전한다. 이기면 다음 단계가 열리고, 단계마다 상대의 평균 스탯과 스킬(액티브 → 간파 → 필살 슛 → 필살 세이브 → 캐논 킥)이 늘어난다. 경기는 목표 경기 규칙(8포제션, 연장 · 승부차기)이고 자동 · 개입 · 배속은 런 경기와 같다. 진행은 팀별로 이 브라우저에 저장되며(본편 `soccer.challenge` · `soccer.challengeMatch`, 레슨판 `soccer-lesson.challenge` · `soccer-lesson.challengeMatch`) 런 저장과는 따로다. 경기 중 [나가기]는 기록 없이 저장한 채 시작 화면으로 가고(새로고침도 시작 화면), 시작 화면 [🏆 도전 모드 — 이어하기]로 그 경기를 이어 한다. [포기]는 기권 패로 기록된다. 단계 수치는 `data/challenge.json` — 한 번만 보정했다(B 등급 팀 기준 1단계 95% · 5단계 51% · 10단계 10%). 기획 [GDD 11.7](docs/GDD_v0.5.md), 구현 [ARCHITECTURE §18](docs/ARCHITECTURE.md).

## 구조

```
index.html, css/, js/ui/     화면 (고정 스테이지 1280×720 가로, 아트 없음) — css: base · outgame · match · lesson
js/engine/                   순수 로직: rng, lessonRun(레슨 런 15주) · lesson(카드 배틀) · zones(훈련 구역 기하) · cards(카드 66장) · manager(감독 AI),
                             run(옛 육성 — 경기 · 평가 함수는 레슨 런이 그대로 쓴다), training, effects, rating, match(경기), ai, skills, challenge(도전 모드)
data/*.json                  밸런스·콘텐츠 데이터 (Unity로 그대로 이식 예정) — 레슨: cards · lesson · policies
test/, tools/                엔진 · UI 테스트, 헤드리스 시뮬 (lesson_sim · sim · challenge_sim), 스크린샷 (shot · scenarios · lesson_scenarios), 브라우저 한 판 점검 (lesson_play)
docs/                        기획서, 아키텍처
```

엔진은 DOM에 의존하지 않고 결정적(시드 고정)으로 동작한다. 같은 시드 + 같은 입력 = 같은 결과.
