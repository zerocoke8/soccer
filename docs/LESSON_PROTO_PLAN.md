# 카드 레슨 프로토타입 1차 — 구현 계획

> 상태: 구현 계획 · 2026-10-02 · 브랜치 `outgame-lesson` (시작 시점 `main` = `fa1e4ec`과 같음)
> 기준 문서: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) (L1~L31) · [OUTGAME_CARDS_draft.md](OUTGAME_CARDS_draft.md) (66장) · [ARCHITECTURE.md](ARCHITECTURE.md)
> 사용자 결정 (2026-10-02): **A** 별도 브랜치에서 만들고 다른 주소(`/soccer/lesson/`)에 올린다 · 두 번에 나눠 1차 먼저. **C** 콘텐츠 결정은 추천대로 (L31).
> **2026-10-04 구역 방식 개편 (L32~L36)**: [§14](#14-구역-방식-개편-l32l36)가 §4 · §5 · §6.3 · §9 · §10 · §12의 해당 부분(대상 지정 · 종목 · 쉬기 · 자율 훈련 · 수치)을 대신한다.
> **2026-10-04 코치 지원 · 컷인 · 작은 원 카드 (L37 · L38)**: [§15](#15-코치-지원--컷인-l37--작은-원-카드-l38) — 레슨당 2~4번 코치가 손패 카드에 붙어 그 턴만 강화되고, 내면 컷인과 코치 능력. 카드 66장 → 68장.
> **2026-10-05 2차 콘텐츠 · 일러스트 적용 (L24 ~ L31 · L50)**: [§24](#24-2차--이벤트--외출-이야기--코치-연속-이벤트--레전드-메모리-카드--일러스트-적용) — 구현 계획. 주 끝 1개 확정 (코치 연속 이벤트 첫 만남 · 유대 40 · 80 이 슬롯 우선) · 시즌 시작 · 전야 · 루트, 외출 이벤트 (이야기 16명 × 3화 계정 1회 · 일반 6종) · 회상, 레슨 깜짝 말풍선, 레전드 메모리 카드, 얼굴 · 컷인 일러스트 · 새 배경 7장. 레슨 런 이벤트는 새 파일 `data/lesson_ev_*.json` 169개 (옛 `events.json` 그대로), 미리보기 자동, 저장 v5 + 계정 저장. 슬라이스 21개 · 기획자 질문 Q1 ~ Q12 (§24.18).
> **2026-10-05 레슨 배치 자연스럽게 (L52)**: [§23](#23-레슨-배치-자연스럽게-l52) — 구역 대형을 턴 · 구역마다 돌리고 · 크기를 바꾸고 · 선수마다 조금 비낀다 (해시 — rng 를 쓰지 않는다, 같은 턴 안에서는 그대로). 토큰 간격 ≥ 4.8u · 구역 바닥 안, 이름표는 겹치지 않는 쪽. `zones.jitter: null` = 예전 대형.
> **2026-10-05 경기 밸런스 1차 (L51)**: [§22](#22-경기-밸런스-1차-l51) — 필드 수비 세 행동 (태클 · 인터셉트 계수 · 버티기 holdMult) 1.0 → 0.6 · 친선전 6 → 10포제션 · 경계전 상대 스탯 ×0.85 ~ 0.88 · 도전 모드 3 ~ 10단계 statTarget 다시 맞춤. 모든 경기 종류 경기당 합계 3골 이상, 경계전 승률 90 / 76 / 60%.
> **2026-10-05 키퍼 게이지 규칙 (L49)**: [§21](#21-키퍼-게이지-규칙-l49) — 동료 필드 선수가 수비 듀얼을 이기면 우리 키퍼 게이지 +35. 키퍼 필살기 경기당 0.02 ~ 0.04 → 약 0.45번.
> **2026-10-05 선수 패시브 · SP 상점 · 코치 파티 패시브 (L48)**: [§20](#20-선수-패시브--sp-상점--코치-파티-패시브-l48) — SP로 사는 패시브는 선수마다 3개 (고유 1 + 공용 2), 주 · 상담 · 준비 어디서나. SP 수입 약 3배 (레슨 SP). 힌트는 많이 큰 선수에게서, 코치 힌트는 액티브 수업만. 코치마다 파티 패시브 1개 (처음부터). 슬롯 3은 액티브만. 크로스 대체 구역 (L47)은 §16.15.
> **2026-10-04 선수 16명 · 전원 필살기 · 경기 엔진 수정 (L44 ~ L46, 이 브랜치만)**: [§19](#19-선수-16명--전원-필살기--경기-엔진-수정-브랜치) — 새 8명 · 16명 모두 필살기(새 종류 필살 수비 · 팀 · 드리블) · 합체기는 등록된 짝만 · 컷인 대사 · 주장 1명분. §0의 "경기 쪽 파일 diff 0"은 §19 슬라이스에서만 풀린다.
> 표기: **[구현 결정]** = 기획서에 없거나 서로 다른 것을 이 계획이 정한 값. 프로토타입을 해 본 뒤 바꿀 수 있다. 수치는 모두 출발점이다. 밸런스는 조정하지 않고, 시뮬 결과만 보고한다.

---

## 0. 한눈에

- **경기는 그대로 둔다.** `js/engine/match.js` · `ai.js` · `skills.js` · `rng.js` · `js/ui/screens/match.js` · `js/ui/layout.js` · `css/match.css`는 바이트 하나도 바꾸지 않는다.
- **옛 육성 엔진도 지우지 않는다.** `ai.js:54`가 `run.js`를 import하므로 `run.js` · `training.js` · `effects.js` · `rating.js`는 남긴다. 옛 테스트(run · v05 · match · challenge · layout · lineup · rng)도 그대로 통과해야 한다. 옛 파일에는 **export를 더하는 것만** 한다.
- **새 런은 새 모듈이다.** 새로 만드는 엔진: `cards.js`(카드 정의), `lesson.js`(레슨 카드 배틀), `lessonRun.js`(15주 상태 머신), `manager.js`(감독 AI). 새 데이터: `cards.json` · `lesson.json` · `policies.json`.
- **UI는 `ctx.run`만 바꿔 끼운다.** app.js가 `run.js` 대신 `lessonRun.js`를 불러 `ctx.run`으로 넘긴다. 경기 · 이벤트 · 유물 · 결과 화면은 같은 이름의 함수를 그대로 부른다.
- **저장 키를 나눈다.** 키 앞머리가 `soccer.` → `soccer-lesson.`으로 바뀐다. 본편과 레슨판이 같은 origin을 쓰므로 반드시 필요하다.
- **1차에는 이벤트가 없다.** 주간 · 고정 · 깜짝 · 외출 이벤트를 모두 뺀다. 화면 라우팅과 엔진 자리만 남긴다 (§7 D1).

---

## 1. 범위

| 넣는다 (1차) | 뺀다 (2차 이후) |
|---|---|
| 15주 런 (시즌마다 레슨 · 자유 · 레슨 · 자유 · 대비 → 경기 전 준비 → 경계전) | 주간 · 시즌 시작 · 경계전 직전 · 루트 이벤트, 레슨 깜짝 이벤트 |
| 지금의 경계전 · 상대, 루트 · 유물 (10.1 키 매핑, 호출권 없음) | 외출 이벤트 · 외출 이야기 24화 · 회상 |
| 편성 화면 + 훈련 방침 줄 (5개) | 레전드 · 메모리 카드 · 레전드 인자 |
| 코치 6장: 유대(시작값 · 획득 +15 · 사용 +8 · 같은 종목 클리어 +5), 유대 80이면 강화판 | 리그 등급, 아트 · 연출 다듬기 |
| 힌트 (L22: 클리어 1 · 퍼펙트 2, 편성 코치의 `hintSkillIds`에서) | 도전 모드 샘플 팀 다시 만들기, 등급 기준선 재조정 |
| 레슨 카드 배틀 66장 (공용 13 · 방침 5종 · 고유 8(두 모드) · 코치 8(루미 포함) · 대비 3) | 밸런스 조정 |
| 보상 3택1 · 건너뛰기 · 퍼펙트 무료 강화 | |
| TP · SP, 상담(카드 구매 · 강화 · 삭제 = TP, 스킬 = SP) | |
| 전술 미팅(스킬 상점 없음) · 친선전 · 휴식 · **기본 외출**(7명 중 1명, 기본 효과만) | |
| 대비 레슨(대비 카드), 경기 전 준비, 레슨 단위 부상, 자율 훈련, 특별 레슨 | |
| 카드 1장마다 저장 + 결정적 RNG | |
| 평가 · 팀 등록은 지금과 같음 → 도전 모드가 그대로 동작 | |
| 감독 AI (추천 표시 + 자동 시뮬), 실제 엔진 시뮬 도구, 테스트 | |

---

## 2. 브랜치 · 배포 · 저장 분리

### 2.1 브랜치

- 모든 작업은 `outgame-lesson`에서 한다.
- `main`에는 **배포 워크플로 한 파일만** 들어간다 (§12 D 슬라이스). 이 변경은 지금 사이트의 동작을 바꾸지 않는다. main에 커밋 · 푸시하기 전에 사용자에게 한 줄로 알린다.
- `docs/GDD_v0.5.md`에는 아무것도 합치지 않는다. v0.6 판은 프로토타입 결과를 본 뒤에 만든다.

### 2.2 저장 키 [구현 결정]

`js/ui/store.js`:

```js
export const STORAGE_PREFIX = 'soccer-lesson.';   // 'soccer.'로 시작하면 안 된다 (본편 키와 섞이지 않게)
export const KEYS = {
  run: `${STORAGE_PREFIX}run`, match: `${STORAGE_PREFIX}match`, teams: `${STORAGE_PREFIX}teams`,
  challenge: `${STORAGE_PREFIX}challenge`, challengeMatch: `${STORAGE_PREFIX}challengeMatch`,
};
```

- `loadRun()`은 `lessonRun.isLessonRun(s)`가 참인 저장본만 돌려준다. 그 밖의 저장본은 "저장 없음"으로 본다. `continueRun`도 같은 검사를 한다.
- 본편 키(`soccer.*`)는 읽지 않고 옮기지도 않는다. 그래서 레슨판의 도전 모드는 처음에 샘플 팀만 보인다. 시작 화면에 "본편과 저장이 따로입니다"를 적는다.
- 키 문자열이 박혀 있는 곳은 모두 `KEYS`에서 가져오게 고친다.
  - `tools/shot.mjs` 252 · 337-340 (`page.evaluate`에는 키 이름을 인자로 넘긴다)
  - `tools/scenarios.mjs` 854 · 912-913 · 944-945
  - `test/outgame.test.mjs` 126 · 480-481
  - `test/ui.smoke.test.mjs` (약 20곳)
  - app.js · screens/challenge.js 주석

### 2.3 배포 (`https://zerocoke8.github.io/soccer/lesson/`)

확인된 제약은 세 가지다.
- github-pages 환경은 `main` 브랜치만 배포할 수 있다.
- Pages 사이트 하나는 아티팩트 하나로 올라가므로, 배포할 때마다 사이트 전체가 바뀐다.
- `GITHUB_TOKEN`으로 다른 워크플로를 깨울 수 있는 것은 `workflow_dispatch`뿐이다.

그래서 아래처럼 한다.

1. **main의 `.github/workflows/pages.yml`**
   - main을 `src/main`, `outgame-lesson`을 `src/lesson`으로 체크아웃한다.
   - `_site/` = main 전체 + (`src/lesson/.lesson-site` 표시 파일이 있을 때만) `_site/lesson/` = 레슨 브랜치에서 `.git` · `.github` · `art/` · `node_modules/` · `.lesson-site`를 뺀 것.
   - `concurrency.cancel-in-progress: false`로 둔다.
   - `if: github.ref == 'refs/heads/main'`를 건다.
   - main에 이미 `lesson/` 경로가 있으면 실패하게 한다.
   - YAML 전문은 통합 지도 §3.1을 그대로 쓴다.
2. **브랜치의 `.github/workflows/lesson-redeploy.yml`**
   - `push: [outgame-lesson]`에서 실행되고, 권한은 `actions: write`다.
   - `test` 잡: Node 24, `npm ci`, `npm test`.
   - 그다음 `gh workflow run pages.yml --ref main`을 실행한다.
3. **`.lesson-site` 표시 파일**은 저장 키 분리(§2.2)가 들어간 뒤에만 커밋한다. 그 전에는 `/lesson/`이 절대 올라가지 않는다.
4. **확인:**
   - `curl -sI https://zerocoke8.github.io/soccer/lesson/`이 200을 돌려준다.
   - Actions 목록에 `workflow_dispatch` · `head_branch: main` 실행이 보인다.
   - 본편 `/soccer/`가 그대로다.
   - Pages 캐시 때문에 약 10분은 옛 내용이 보일 수 있다.
5. 모든 경로는 상대 경로라서(테스트가 강제한다) `/lesson/` 아래에서도 그대로 동작한다.
6. `index.html`의 `<title>`은 "경계전 클럽 — 카드 레슨 시험판"으로 바꾼다.

---

## 3. 모듈 지도

### 3.1 새 파일

| 파일 | 담당 | 내용 |
|---|---|---|
| `data/cards.json` | E1 | 카드 66장. 스키마는 §4.3 |
| `data/lesson.json` | E1 | 레슨 · 주 · 보상 · 상담 수치. 스키마는 §4.1 |
| `data/policies.json` | E1 | 방침 5개 (이름 · 버프 · 설명) |
| `js/engine/cards.js` | E1 | 카드 정의 해석(강화판 · 유대 80), 대상 계산, `mainStatsOf`, 데이터 검증. 순수 함수 |
| `js/engine/lesson.js` | E2 · E3 | 레슨 카드 배틀. 순수 함수이고, 상태는 RunState 안의 `state.lesson`에 둔다 |
| `js/engine/lessonRun.js` | E4 | 15주 상태 머신이자 UI가 쓰는 공개 API |
| `js/engine/manager.js` | E5 | 감독 AI. 순수 함수이고 난수를 쓰지 않는다 |
| `tools/lesson_sim.mjs` | E5 | 실제 엔진 + 감독 AI + 실제 match.js 시뮬 |
| `tools/lesson_scenarios.mjs` | I1 | 레슨 런을 원하는 상태까지 걷는 도구 + 새 og_* 시나리오 |
| `test/cards.test.mjs` · `lesson.test.mjs` · `lessonRun.test.mjs` · `manager.test.mjs` · `lessonUi.test.mjs` | 각 슬라이스 | §9 |
| `js/ui/hud.js` | U1 | 상단 바 + 선수 · 코치 패널. training.js에서 떼어 낸다 |
| `js/ui/meeting.js` | U2 | `meetingEditor` (전술 + 포메이션 · 배치). 미팅과 경기 전 준비가 같이 쓴다 |
| `js/ui/cards.js` | U3 | `cardFace(view, opts)`, `miniCard` |
| `js/ui/lesson_layout.js` | U3 | 토큰 자리 · 훈련 동선 계산. DOM이 없는 순수 함수 |
| `js/ui/screens/week.js` | U2 | 주 선택 화면 (`inert` 지원) |
| `js/ui/screens/lesson.js` | U3 | 레슨 화면 (화면을 유지하는 DOM + 애니메이션 루프) |
| `js/ui/screens/reward.js` | U4 | 레슨 결과 · 보상 모달 |
| `js/ui/screens/consult.js` | U4 | 상담 화면 |
| `js/ui/screens/prep.js` | U2 | 경기 전 준비 화면 |
| `css/lesson.css` | U1~U4 | 주 · 레슨 · 보상 · 상담 · 준비 화면. `match.css` 다음에 링크한다 |
| `.lesson-site` · `.github/workflows/lesson-redeploy.yml` | D | 배포 |

### 3.2 바꾸는 파일

| 파일 | 담당 | 바꾸는 것 |
|---|---|---|
| `js/engine/run.js` | E0 | 흐름과 무관한 핵심 함수를 꺼내 **export만 더한다**. 동작은 그대로 (§5.6) |
| `js/engine/training.js` | E0 | `resolveMeeting(state, data, action, opts = {})` — `opts.teamwork === false`면 팀워크 +10을 하지 않는다. 기본 동작은 그대로 |
| `test/helpers.mjs` | E1 | `DATA_FILES`에 `cards`, `lesson`, `policies`를 더한다 (옛 테스트에는 영향 없음) |
| `package.json` | 각 슬라이스 | `test` 목록에 새 테스트 파일을 더한다. `"lesson-sim": "node tools/lesson_sim.mjs --runs 200 --seed 1"` |
| `js/ui/app.js` | U1 | 엔진 import, `DATA_FILES`, 라우팅, actions, `setStageMode('lesson')`, `lessonUi` 타이머 정리 |
| `js/ui/store.js` | U1 | 키 앞머리, `lessonUi` · `consultUi`, `resetLessonUi()`, `loadRun` 검증 |
| `js/ui/labels.js` | U1 | `POLICY_LABELS`, `POLICY_DESC`, `BUFF_LABELS`, `WEEK_KIND_LABELS`, `CARD_TARGET_LABELS`, `CARD_FAMILY_LABELS`, `FREE_ACTION_LABELS`. `SUPPORT_TYPE_LABELS.friend`는 남긴다 (옛 데이터) |
| `js/ui/screens/start.js` | U1 | 흐름 문구를 `seasons × weeksPerSeason` 주로, 새 phase 라벨, "본편과 저장이 따로입니다" |
| `js/ui/screens/setup.js` | U1 | 방침 패널, `initSetup().policy = 'team'`, `startRun`에 `policy` 전달 |
| `js/ui/screens/route.js` | U2 | 설명 = `data.lesson.routeOverrides[id]?.description ?? r.description` |
| `css/outgame.css` | U1 · U2 | 훈련 전용 선택자(`.training-screen`, `.slot-rows`, `.slot-row`, `.actionbar`, `.train-grid`, `.shop-list`의 미팅 쪽)는 지운다. `.meeting-cols`는 2단으로. `.topbar` · `.roster`는 남긴다 |
| `index.html` | U1 | 제목, `css/lesson.css` 링크 |
| `tools/scenarios.mjs` · `tools/shot.mjs` | U1 · I1 | 키는 `KEYS`에서 가져온다. `prepareRun`을 레슨 런으로 옮긴다. `OUTGAME_SCENARIOS`는 `lesson_scenarios.mjs`에서 다시 내보낸다 |
| `test/ui.smoke.test.mjs` · `test/outgame.test.mjs` | U1~I1 | 훈련 · 호출권 · 미팅 상점 검사 → 주 · 레슨 · 보상 · 상담 · 준비 검사. 키는 `KEYS`에서 |
| `docs/ARCHITECTURE.md` · `README.md` | I1 | §20 "v0.6-lesson 1차" 계약 + 레슨판 주소 · 저장 분리 |

### 3.3 지우는 파일

- `js/ui/screens/training.js`: 상단 바 · 명단 패널은 `hud.js`로, 미팅은 `meeting.js`로 옮긴 뒤 지운다 (U2).

### 3.4 손대지 않는 파일

- 엔진: `js/engine/match.js` · `ai.js` · `skills.js` · `rng.js` · `effects.js` · `rating.js` · `challenge.js`
- UI: `js/ui/screens/match.js` · `layout.js` · `stage.js` · `dom.js` (작은 export 추가만 허용) · `lineup.js` · `screens/event.js` · `relic.js` · `result.js` · `challenge.js`
- CSS: `css/match.css` · `base.css`
- 데이터: `data/config.json` · `supports.json` · `events.json` · `routes.json` · `skills.json` · `relics.json` · `opponents.json` · `characters.json` · `traits.json` · `combos.json` · `challenge*.json`
- 테스트 · 도구: `test/run` · `v05` · `match` · `challenge` · `layout` · `lineup` · `rng` · `orient` · `stage` 테스트, `tools/sim.mjs` · `challenge_sim.mjs` · `choice.mjs` · `drafts/lesson_sim.mjs`

---

## 4. 데이터 파일

### 4.1 `data/lesson.json`

```jsonc
{
  "version": 1,
  "weeksPerSeason": 5,
  "weekKinds": ["lesson", "free", "lesson", "free", "prep"],
  "startDeck": ["cd_basic", "cd_coaching", "cd_cooldown"],      // + 배치된 7명의 고유 카드
  "defaultPolicy": "team",
  "lesson": {
    "turns": [6, 7, 8],                                        // 시즌별
    "targets": [[330, 520], [380, 610], [450, 720]],            // [목표, 상한]
    "hand": 3,
    "costRate": 0.6,
    "subGainRatio": 0.36,
    "autoTrainRatio": 0.35, "autoTrainStamina": 10,
    "failStatLoss": 5, "injuryChanceOnFail": 0.5,
    "rest": { "picked": 20, "others": 5 },
    "perfectStaminaPerTurn": 5,
    "special": { "targetMult": 1.3, "gainBonus": 0.5, "secondChance": 0.5 },
    "coachSameTypeMult": 1.3
  },
  "teamwork": { "pair": 2, "perExtraTarget": 1, "lessonCap": 8, "clear": 3 },
  "buffs": {
    "hojoMult": 1.5, "focusPer": 6, "moodK": 1.5,
    "stealPer": 0.3, "stealCap": 4,
    "pressK": 0.2, "pressCostK": 0.2, "pressCap": 3, "pressRestHeal": 4,
    "possK": 0.05, "possCap": 8, "possNoMF": 2
  },
  "rewards": {
    "offer": 3, "skipTp": 10,
    "clear":   { "tp": 10, "hints": 1 },
    "perfect": { "tp": 20, "hints": 2, "freeUpgrades": 1 },
    "plusChance": { "special": 0.3, "perfect": 0.5, "max": 0.7 },
    "weights": { "common": 1, "policy": 1, "coachBase": 2, "coachRef": 0.4, "uniquePlus": 0.5 },
    "noHintSp": 10
  },
  "bond": { "acquire": 15, "play": 8, "sameTypeClear": 5, "upgradeAt": 80, "eventAt": 60 },
  "consult": {
    "stock": 3,
    "price": { "common": 20, "policy": 30, "coach": 30, "upgrade": 30, "delete": 25 },
    "upgradesPerVisit": 1, "deletesPerVisit": 1, "minDeck": 5
  },
  "freeWeek": { "slots": 3, "guaranteed": ["consult", "meeting"], "pool": ["outing", "friendly", "consult", "meeting"] },
  "outing": { "picked": 20, "team": 10, "condition": 1 },
  "prepCards": { "dribble": ["cd_p_tackle", "cd_p_tackle"], "pass": ["cd_p_intercept", "cd_p_intercept"],
                 "mixed": ["cd_p_tackle", "cd_p_intercept"], "midrangeSecond": "cd_p_hold" },
  "routeOverrides": {
    "rt_hotspring": { "description": "전원 체력 100·컨디션 최고 단계로 회복. 다음 시즌 첫 주에 주를 쓰지 않는 외출 1번", "freeOuting": 1 }
  },
  "events": { "support": false }                               // 1차는 이벤트 없음. true면 유대 60 서포트 이벤트를 주 끝에 낸다
}
```

- 실패율 표(`failRateByStamina`), 컨디션 배율(`condition.trainingMult`), 부 스탯 대응(`training.subStatMap`), 휴식, 친선전, 경계전, 유스, 평가 수치는 지금처럼 `config.json`에서 읽는다.

### 4.2 `data/policies.json`

```jsonc
{ "policies": [
  { "id": "ace",     "name": "에이스형", "buffs": ["hojo", "focus"], "desc": "한두 명을 확 키운다 — 호조 · 집중" },
  { "id": "team",    "name": "팀형",     "buffs": ["mood"],          "desc": "7명을 고르게 — 분위기" },
  { "id": "counter", "name": "역습형",   "buffs": ["steal"],         "desc": "수비진이 쌓고 공격진이 터뜨린다 — 탈취" },
  { "id": "press",   "name": "압박형",   "buffs": ["press"],         "desc": "몰아치고 내려서 정비 — 압박 단계" },
  { "id": "poss",    "name": "점유형",   "buffs": ["poss"],          "desc": "MF를 거쳐 끊기지 않게 — 점유" } ] }
```

### 4.3 `data/cards.json` 스키마

```jsonc
{ "version": 1, "cards": [ {
  "id": "cd_fw_drill", "name": "FW 라인 드릴",
  "family": "common",                   // common | ace | team | counter | press | poss | unique | coach | prep
  "start": false,                       // 시작 덱 공용 3장만 true
  "pool": true,                         // 보상 · 상담 풀에 나오는가 (공용 비시작 10장 + 방침 카드). 고유 · 코치 · 대비는 false
  "target": { "kind": "line", "line": "FW" },
  //   kind: all | line(+line) | attack(MF+FW) | defense(GK+DF) | single(+only?:[pos]) | pair | owner(+partner?:{power}) | tap | none
  "power": 40,                          // all/line/attack/defense = 카드 합계, single/pair/owner = 1인당, 상승 없는 카드는 null
  "costRate": 0.6,                      // 생략하면 lesson.costRate. 고유 0.4, 1:1 특훈 0.66
  "mods": { },                          // 이 카드의 계산 규칙 (아래 목록)
  "effects": [ ],                       // 자기 상승 뒤에 적용 (아래 목록)
  "exhaust": false,                     // 낸 뒤 이번 레슨에서 빠진다
  "plus": { "power": 50 },              // 강화판에서 덮어쓸 필드 (power / effects / mods / support)
  "desc": "짧은 효과 문구", "descPlus": "강화판 문구",
  "ownerCharId": "ch_…",                // unique만
  "support": { "effects": [ ] },        // unique만: 지원 모드 효과 (상승 · 비용 없음, 대상 없는 카드로 본다)
  "coach": { "supportId": "sp_…", "type": "shoot" },   // coach만. 타입은 여기가 기준 (루미 = physical)
  "bond80": { "power": 50, "effects": [ ] },           // coach만: 유대 80 이상이면 덮어쓴다
  "prepFor": "dribble"                  // prep만 (dribble | pass | midrange)
} ] }
```

**`mods` (닫힌 목록)**
- `noFail: true`
- `failPlus: 0.1`
- `focusX2: true`
- `lastTurnX2: 1|2` — 마지막 N턴이면 ×2
- `underdog: 0.5` — 점수 < 목표면 ×1.5
- `stealPer: 0.4|0.45`
- `stealBuild: 2`
- `possX2: true`
- `possKeep: true`
- `noPressCost: "always"|"atLeast2"`
- `perMood: 2.5` — 합계 위력에 분위기 1당 더함
- `perPress: 10`
- `lessonMult: { "stats": ["defense", "physical"], "mult": 1.5 }`

**`effects` (닫힌 목록)**
- 공통 필드: `when`(생략하면 `"always"`). `"success"`는 이 카드에 실패자가 없을 때, `"consume"`은 이 카드가 탈취를 썼을 때 적용한다.
- 버프: `hojo {n}`, `focus {n}`, `mood {n}`, `moodX2 {}`, `noDecay {turns}`, `steal {n}`, `press {n}`, `pressDrop {perStage}`, `poss {n}`, `possGuard {n}`
- 회복: `heal { to: "tap"|"all"|"defense"|"mostTired"|"owner", n }` (n이 음수일 수 있다)
- 팀워크: `teamwork {n}`
- 다음 카드: `nextPct {pct}`, `nextPairPct {pct}`, `nextNoFail {}`, `nextCostZero {}`, `routine {n}`
- 손패 · 사용: `extraPlay {n}`, `drawNext {n}`
- 레슨 끝: `endHeal {n}`, `lumiFlag {}`

### 4.4 66장 데이터 (id · 결정값)

수치의 기준은 [OUTGAME_CARDS_draft.md](OUTGAME_CARDS_draft.md)다. 아래는 id와, 초안에 없어서 이 계획이 정한 값이다. 위력 있는 카드의 강화판은 별도 표기가 없으면 `power = round(power × 1.25)`다.

**공용**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_basic` (start) | all 35 | — | 44 |
| `cd_coaching` (start) | single 35 | — | 44 |
| `cd_cooldown` (start) | tap | heal tap 20, extraPlay 1 | heal 30 |
| `cd_fw_drill` | line FW 40 | — | 50 |
| `cd_mf_drill` | line MF 40 | — | 50 |
| `cd_df_drill` | line DF 40 | — | 50 |
| `cd_gk_session` | line GK 38 | — | 48 |
| `cd_attack_build` | attack 43 | — | 54 |
| `cd_defense_org` | defense 43 | — | 54 |
| `cd_one_two` | pair 20 | teamwork 2 (L10의 짝 +2는 따로 붙는다) | 25 |
| `cd_one_on_one` | single 48 | costRate 0.66 | 60 |
| `cd_tactics_board` | none | drawNext 1, extraPlay 1 | drawNext 2 |
| `cd_icing` | tap | heal tap 30 | 40 |

**에이스형**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_hojo_up` | none | hojo 3 | 4 |
| `cd_focus_routine` | none | focus 2 | 3 |
| `cd_ace_training` | single 30 | focusX2 | 38 |
| `cd_one_point` | single 25 | focus 1 | 31 |
| `cd_immerse` | none | hojo 2, focus 1 | hojo 3 |
| `cd_break_limit` | single 65 | failPlus 0.1 | 81 |
| `cd_routine` | none | routine 8 | 10 |
| `cd_breath` | tap | heal tap 25, focus 1 | heal 35 |

**팀형**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_high_five` | none | mood 3 | 4 |
| `cd_set_piece` | attack 30 | mood 2 (when success) | 38 |
| `cd_pass_move` | pair 15 | mood 1 (success), teamwork 2 | 19 |
| `cd_one_team` | all 28 | mood 2 (success) | 35 |
| `cd_chant` | none | mood 2, heal all 5 | mood 3 |
| `cd_mood_maker` | none, exhaust | moodX2 | [mood 1, moodX2] |
| `cd_breath_together` | none | noDecay 3 | 4 |
| `cd_link_line` | defense 35 | perMood 2.5 | 44 |

**역습형**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_line_up` | defense 32 | stealBuild 2 | 40 |
| `cd_recover` | none | steal 1, heal defense 12 | heal 22 |
| `cd_long_ball` | none | steal 1, extraPlay 1 | steal 2 |
| `cd_counter_sprint` | attack 36 | stealPer 0.4 | 45 |
| `cd_finisher` | single only [MF, FW] 30 | stealPer 0.45 | 38 |
| `cd_all_counter` | all 30 | teamwork 2 (when consume) | 38 |

**압박형**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_front_press` | attack 34 | press 1 | 43 |
| `cd_full_press` | none | press 2, extraPlay 1 | press 3 |
| `cd_six_sec` | single 28 | press 1, noPressCost atLeast2 | 35 |
| `cd_drop_line` | none | pressDrop 6, nextNoFail | pressDrop 8 |
| `cd_all_out` | all 30 | perPress 10 | 38 |
| `cd_gegen` | attack 40 | noPressCost always | 50 |

**점유형**

| id | 대상 · 위력 | effects / mods | 강화판 |
|---|---|---|---|
| `cd_triangle` | pair 18 | poss 2 (success), teamwork 2 | 23 |
| `cd_mid_control` | line MF 34 | poss 2 (success) | 43 |
| `cd_circulate` | none | poss 3, heal mostTired 15 | poss 4 |
| `cd_tempo` | none | possGuard 1, drawNext 1 | guard 2 |
| `cd_dominate` | attack 32 | possX2 | 40 |
| `cd_back_build` | defense 34 | possKeep | 43 |

**고유** — 강화 모드는 owner 53, costRate 0.4, 강화판 66. 지원 모드는 `support.effects`.

| id | 주인 | 강화 모드 effects | 지원 모드 | 지원 모드 강화판 |
|---|---|---|---|---|
| `cd_u_neria` | ch_spirit_keeper | — | nextNoFail, heal owner 15 | heal 25 |
| `cd_u_dorbina` | ch_dwarf_wall | — | heal defense 10 | 15 |
| `cd_u_adeline` | ch_human_captain | teamwork 2 | teamwork 3, heal all 3 | teamwork 4, heal all 5 |
| `cd_u_silluen` | ch_elf_playmaker | nextPct 0.2 | nextPct 0.4 | 0.55 |
| `cd_u_taria` | ch_human_runner | — | drawNext 1 | 2 |
| `cd_u_ulrika` | ch_wolf_winger | owner + `partner {power:18}` (1명 더 탭), teamwork 1 | nextPairPct 0.5, teamwork 1 | 0.75 |
| `cd_u_greta` | ch_giant_striker | — | nextCostZero | + heal owner 10 [구현 결정] |
| `cd_u_mirka` | ch_cat_trickster | — | extraPlay 1, heal owner −5 | extraPlay 1 (자기 비용 0) |

**코치** — `pool: false`. 보상과 상담에는 편성한 코치 카드만 따로 나온다.

| id | 코치 (supportId · type) | 대상 · 위력 | effects / mods | bond80 |
|---|---|---|---|---|
| `cd_c_harr` | sp_coach_harr · shoot | line FW 40 | lastTurnX2 1 | lastTurnX2 2 |
| `cd_c_celia` | sp_wind_dancer · dribble | pair 20 | drawNext 1 | power 24 |
| `cd_c_ornella` | sp_elder_sage · pass | attack 43 | teamwork 2 | power 50, teamwork 3 |
| `cd_c_barbara` | sp_iron_captain · defense | defense 43 | noFail | power 50 |
| `cd_c_hanna` | sp_mountain_monk · physical | all 35 | endHeal 5 | endHeal 10 |
| `cd_c_joy` | sp_street_striker · shoot | single 40 | underdog 0.5 | power 48 |
| `cd_c_irene` | sp_river_scholar · pass | single 28 | drawNext 1 | + extraPlay 1 |
| `cd_c_lumi` | sp_bard_lumi · physical | all 30 | lumiFlag | power 36 |

**대비** — `pool: false`, 강화할 수 없다.

| id | 대상 · 위력 | mods |
|---|---|---|
| `cd_p_tackle` | defense 40 | lessonMult [defense, physical] ×1.5 |
| `cd_p_intercept` | defense 40 | lessonMult [defense, pass] ×1.5 |
| `cd_p_hold` | line DF 40 | lessonMult [defense] ×1.5 |

**카드 해석 규칙 (`cards.resolveCardDef`)**
- 덮어쓰는 순서는 base → (코치이고 유대 ≥ 80이면) `bond80` → (plus이면) `plus`다.
- 코치 카드의 강화판에 `plus`가 없으면 그 시점 power에 ×1.25를 한다.
- 결과는 매번 새로 계산하고, 상태에는 저장하지 않는다.

---

## 5. 엔진

### 5.1 RunState (`kind: "lessonRun"`)

```jsonc
{ "kind": "lessonRun", "version": 1, "seed": "…", "rngState": 0,
  "phase": "week" | "lesson" | "reward" | "consult" | "prep" | "event" | "match" | "relic" | "route" | "finished",
  "season": 1, "turn": 1,            // turn = 시즌 안의 주 번호 1..5
  "turnIndex": 0,                    // 0..14 = (season-1)*5 + turn-1. log · createdTurnIndex · 이벤트 시점 조건이 읽는다
  "leagueTier": 1, "policy": "team", "formation": "2-2-2", "tactics": { },
  "players": [ /* run.js RunPlayer 그대로 (id p1..p7, charId, stats, growth, stamina, injuredTurns, innateSkillId, learnedSkillIds …)
                  injuredTurns = 앞으로 결장할 "열린 레슨" 수. 0보다 크면 경기에서 유스로 바뀐다 */ ],
  "supports": [ { "id": "sp_…", "bond": 20, "firedEventIds": [] } ],   // 코치 6명
  "condition": 2, "teamwork": 0, "skillPoints": 0, "trainingPoints": 0,
  "hints": { }, "relics": [], "modifiers": [],
  "deck": [ { "uid": "k1", "cardId": "cd_basic", "plus": false } ], "nextUid": 11,
  "seasonPlan": { "guaranteed": { "2": "consult", "4": "meeting" } },   // 시즌 시작에 굴린다
  "weekOffer": { "kind": "lesson", "specials": ["pass"] }
             | { "kind": "free", "actions": ["meeting", "outing", "friendly"], "guaranteed": "meeting" }
             | { "kind": "prep", "prepCards": ["cd_p_intercept", "cd_p_hold"] },
  "freeOuting": 0,                   // 온천 효과. 1이면 시즌 1주차에 주를 쓰지 않는 외출 가능. 1주차가 끝나면 0
  "lesson": null,                    // LessonState (§5.2). 보상까지 끝나면 null
  "pendingReward": null,             // { offer: [{ cardId, plus, kind: "add"|"upgrade", uid? }], freeUpgrades, result }
  "consult": null,                   // { stock: [{ cardId, price, bought }], upgradesLeft, deletesLeft }
  "currentEvent": null, "pendingMatch": null, "lastMatchResult": null, "pendingRelicChoices": null, "pendingRoutes": null,
  "record": { "goalMatches": [], "friendlies": [], "losses": 0,
              "lessons": [ { "turnIndex": 0, "stat": "pass", "special": true, "prep": false, "score": 0, "target": 0, "cap": 0,
                             "result": "clear", "turns": 0, "plays": 0, "rests": 0, "fails": 0, "injuries": 0 } ] },
  "usedEventIds": [], "log": [], "rating": null, "queue": [] }
```

- `placement`, `summon`, `summonTickets`, `weekOptions`는 없다.
- `buildTeamSnapshot` · `computeRating` · `getModifier` · `playerSnapshot` · `applyEffects`가 읽는 필드 이름은 그대로 둔다.
- `isLessonRun(s)`는 `s.kind === "lessonRun" && s.version === 1 && typeof s.phase === "string"`이다.

### 5.2 LessonState

```jsonc
{ "stat": "pass", "special": true, "prep": false,
  "turn": 1, "turns": 6, "target": 429, "cap": 676, "score": 0,
  "status": "playing" | "perfect" | "clear" | "fail",
  "playsLeft": 1, "playedThisTurn": 0, "restTurn": false,
  "drawPile": ["k3"], "hand": ["k1"], "discard": [], "exhausted": [],
  "removed": ["k7"],                 // 결장한 주인의 고유 카드 (레슨 시작 때, 또는 레슨 중 부상)
  "temp": [ { "uid": "t1", "cardId": "cd_p_tackle" } ],     // 대비 카드. 레슨이 끝나면 사라진다
  "drawNext": 0,
  "buffs": { "hojo": 0, "focus": 0, "mood": 0, "noDecay": 0, "steal": 0, "press": 0, "poss": 0, "possGuard": 0,
             "routine": 0, "nextPct": 0, "nextPairPct": 0, "nextNoFail": false, "nextCostZero": false },
  "outAtStart": ["p3"], "out": ["p3"],                 // out = outAtStart + 레슨 중 부상
  "targeted": { "p1": 2 },                             // 상승 대상이 된 횟수 (실패자 포함, tap 제외)
  "cardGainSum": 0,                                    // 카드 주 스탯 상승 합 (자율 훈련 평균용)
  "twAccrued": 0, "endHeal": 0, "lumiFlag": false,
  "seq": 0,                                            // 상태를 바꾸는 레슨 호출마다 +1
  "lastFx": [],                                        // 마지막 호출의 연출 목록 (§5.3.5)
  "stats": { "plays": 0, "rests": 0, "fails": 0, "injuries": 0 } }
```

- 카드 uid: 덱은 `k1`, `k2`, … (`state.nextUid`), 임시 대비 카드는 `t1`, `t2`, … 이다.
- 레슨이 시작하면 덱 전체 uid(`removed`는 빼고) + `temp`를 섞어 `drawPile`을 만든다.

### 5.3 `lesson.js` API (순수 · 결정적 · JSON 상태)

상태를 바꾸는 함수는 모두 `(state, data, args)`를 받아 `state`를 돌려준다. RNG는 함수에 들어올 때 열고 나가기 직전에 저장한다.

| 함수 | 하는 일 |
|---|---|
| `startLesson(state, data, { stat, special, prep, prepCards })` | 목표 · 상한, 결장 처리, 고유 카드 제외, 대비 카드, 섞기, 1턴 뽑기 |
| `playCard(state, data, { uid, taps })` | §5.3.1. 끝나면 턴 끝이나 레슨 끝까지 진행한다 |
| `lessonRest(state, data, { playerId })` | 턴의 첫 행동일 때만 가능. 고른 선수 +20, 나머지 출전 선수 +5. 압박이 있으면 출전 선수 +4×단계 후 압박 0. 그 턴을 끝낸다 |
| `endLessonTurn(state, data)` | 카드를 1장 이상 낸 뒤에만 가능. 남은 추가 사용은 버린다 |
| `getLessonView(state, data)` | 순수 뷰 (§5.3.4) |
| `previewCard(state, data, { uid, taps })` | 순수 미리보기 (§5.3.4) |
| `lessonResult(state, data)` | 끝난 레슨의 결과 요약 (보상 화면용, 순수) |

레슨이 끝나면(`status` ≠ `playing`) `lesson.js`는 레슨 안의 끝 처리(§5.3.3의 1~3)까지만 한다. 보상 · 흐름은 `lessonRun`이 이어서 처리한다.

#### 5.3.1 `playCard` 처리 순서 (고정)

1. **검증.** phase는 lesson, 카드는 손패에 있어야 하고 `playsLeft ≥ 1`이어야 한다. `taps`는 다음과 같다.
   - single: 출전 중인 1명 (`only`가 있으면 그 라인만)
   - pair: 서로 다른 출전 선수 2명
   - tap: 1명 (결장 선수도 고를 수 있다 [구현 결정] — 회복만 하므로)
   - 울리카 강화 모드: 주인 말고 출전 선수 1명 더
   - 그 밖의 카드: 탭 없음
2. **모드.** 고유 카드는 `lesson.stat ∈ mainStatsOf(주인의 지금 position)`이면 강화 모드, 아니면 지원 모드다. 지원 모드는 대상 없는 카드로 처리한다.
3. **대상 T** (출전 선수만, 배치 포지션 기준). line · attack · defense · all은 `cards.targetsFor`가 계산한다. single · pair는 탭한 선수, owner는 주인(+ 파트너)이다. tap · none은 T = ∅이다.
4. **1인 위력 p_i** (소수 유지).
   - 범위 카드: `(power + perMood×mood + perPress×press) / |T|`
   - single · pair · owner: `power + (single이면 routine)`. 울리카 파트너는 18이다.
   - 집중 몫을 더한다: `+ focus × 6 × (focusX2 ? 2 : 1) / |T|`
5. **비용 c_i** [구현 결정].
   - `round(costBase_i × costRate × pressCostMult)`
   - `costBase_i`는 **강화 전 기본 카드**의 1인 위력이다 (perMood · perPress 몫 포함, 집중 · routine · 강화판 · 유대 80 증가분 제외). 그래서 강화는 순수한 이득이다.
   - `pressCostMult = 1 + 0.2×press`다. 단 `noPressCost: always`면 1이고, `atLeast2`이면서 카드를 내기 전 press ≥ 2면 1이다.
   - `nextCostZero`면 비용은 0이다.
6. **실패율 f.**
   - `noFail` 또는 `nextNoFail`이면 0이다.
   - 아니면 `clamp(max_i failRateForStamina(stamina_i, 비용 내기 전) + getModifier(injuryRate) + failPlus − (코치 카드면 supports.json의 failRateReduction), 0, 0.95)`
   - 실패율 표는 `config.training.failRateByStamina`, 함수는 `training.failRateForStamina`를 그대로 쓴다.
7. **배율 M** (모든 대상에 같다).

   ```
   M = condition.trainingMult[condition]
     × (hojo > 0 ? 1.5 : 1)
     × (1 + 0.5·special + Σ trainingEfficiency)
     × (코치 카드 && coach.type == stat ? 1.3 : 1)
     × (lastTurnX2 && 마지막 N턴 ? 2 : 1)
     × (underdog && score < target ? 1.5 : 1)
     × (lessonMult가 stat에 맞으면 ×mult)
     × (1 + nextPct + (짝 카드 ? nextPairPct : 0))
     × 방침 배율
   ```

   방침 배율은 run의 방침이 맞을 때만, 그리고 T ≠ ∅일 때만 붙는다.
   - counter: 탈취를 쓰는 카드면 `1 + (stealPer ?? 0.3) × steal`
   - poss: `1 + 0.05 × poss × (possX2 ? 2 : 1)`
   - press: `1 + 0.2 × press`

   "짝 카드" = target.kind가 pair이거나 owner+partner인 카드.
8. **비용 지불.** 대상마다 체력에서 뺀다 (0에서 멈춘다).
9. **실패 판정.** f > 0이면 1번 굴린다. 실패자는 실패율이 가장 높은 대상이고, 같으면 체력이 낮은 쪽, 그래도 같으면 슬롯 순서로 정한다.
10. **상승.** 실패자가 아닌 대상마다:
    - `g = round(p_i × growth[stat] × M)`
    - 실제 오른 양(상한 1000에 잘린 뒤)을 `score`와 `cardGainSum`에 더한다.
    - 부 스탯 += `round(g × 0.36 × growth[sub])` (점수에는 넣지 않는다)

    실패자:
    - stat −5 (0에서 멈춤). 실제로 줄어든 양을 score에서 뺀다.
    - 50% 확률로 부상: `out`에 넣고, `injuredTurns = max(cur, 1)`. 그 선수의 고유 카드는 손패 · 더미에서 `removed`로 옮긴다.
11. **L10 팀워크** (|T| ≥ 2일 때만).
    - 짝 카드: 실패자가 없으면 +2
    - 그 밖의 카드: +(성공 인원 − 1)
    - 레슨당 `twAccrued` 8까지만 준다. 카드 effects의 팀워크와 클리어 +3은 이 상한 밖이다. 팀워크는 0~100으로 묶는다.
12. **일회성 버프 소비** (T ≠ ∅일 때만).
    - hojo −1
    - `nextPct` · `nextNoFail` · `nextCostZero`를 0으로
    - 짝 카드면 `nextPairPct`도 0으로
13. **방침 패시브** (run의 방침이 맞을 때만).
    - counter
      - T에 MF · FW가 있으면 탈취를 쓴다: steal = 0 (실패해도). 이 카드는 "consume"이다.
      - T가 전부 GK · DF이고 실패자가 없으면 steal = min(4, steal + (stealBuild ?? 1))
    - poss
      - 실패자가 있으면: possGuard > 0이면 possGuard −1, 아니면 poss = 0
      - 실패자가 없고 T에 MF가 있으면 poss = min(8, poss + 1)
      - 실패자가 없고 T에 MF가 없으면, `possKeep`이 아닌 한 poss = max(0, poss − 2)
    - press: 실패자가 있으면 press = 0
14. **카드 effects.** 자기 상승 뒤에 순서대로 적용한다. `when` 조건을 확인한다. 다음 둘은 카드를 내기 전 상태를 읽는다: `focusX2` · `possX2` · `noPressCost atLeast2`, 그리고 삼각형 패스의 기본 +1(13번).
    - `moodX2`: mood ×2
    - `pressDrop`: 내린 단계 × n만큼 출전 선수 회복, press 0
    - `routine`: max(routine, n)
    - `endHeal`: 누적
    - `lumiFlag`: true
    - `heal mostTired`: 출전 선수 중 체력이 가장 낮은 1명
    - `heal defense`: 출전 중인 GK · DF
    - 코치 카드면 그 코치의 유대 += 8 + `getModifier(bondGain)` (상한 100)
15. **기록.** T(실패자 포함)를 `targeted`에 센다. 카드는 `exhaust`면 `exhausted`로, 아니면 `discard`로 간다. 대비 카드도 discard로 간다.
16. **퍼펙트 판정.** score ≥ cap이면 레슨을 즉시 끝낸다 (§5.3.3). 그 턴의 턴 끝 틱은 하지 않는다.
17. **사용 횟수.** `playsLeft = playsLeft − 1 + extraPlay`. 0이 되거나 손패가 비면 턴 끝(§5.3.2)으로 간다.

#### 5.3.2 턴 시작 · 턴 끝

- **턴 시작**
  - `3 + drawNext`장을 뽑고 drawNext는 0으로 한다. 뽑을 더미가 비면 버린 더미를 섞어 다시 채운다.
  - `playsLeft = 1`, `playedThisTurn = 0`, `restTurn = false`
  - **죽은 카드** — 대상 카드인데 지금 대상이 0명인 카드다 (라인 전원 결장, 마무리 일격에 MF · FW가 없음, 울리카 강화 모드에 파트너 후보가 없으면 지원 모드로). 이런 카드는 버리고 1장을 다시 뽑는다. 최대 (덱 크기)회까지 반복한다.
  - 출전 선수가 0명이면 레슨을 즉시 끝낸다 [구현 결정].
- **턴 끝**
  1. 분위기 틱 (mood > 0): 출전 선수마다 `round(mood × 1.5 × growth[stat] × trainingMult[condition] × (1 + 0.5·special + Σeff))`. 점수에 넣는다. 부 스탯은 없고, 대상으로 세지 않는다.
  2. 감소: `noDecay > 0`이면 noDecay −1(감소 없음). 아니면 mood −= (restTurn ? 2 : 1), 0에서 멈춘다.
  3. 퍼펙트 판정
  4. 남은 손패는 버린 더미로 간다.
  5. turn == turns면 레슨을 끝낸다. 아니면 turn +1, 턴 시작.

#### 5.3.3 레슨 끝 (lesson.js 안)

1. **자율 훈련.** `targeted`에 없고 `out`에도 없는 선수: stat += `round(cardGainSum / |targeted| × 0.35)`(대상이 0명이면 0), 체력 +10. 점수에는 넣지 않는다.
2. **한나 효과.** `endHeal`만큼 출전 선수의 체력을 올린다.
3. **결과 판정.**
   - 퍼펙트(score ≥ cap): 7명 전원 체력 += 5 × (turns − turn). 끝난 턴은 쓴 것으로 센다.
   - 아니면 score ≥ target이면 clear, 그 밖은 fail이다.

   레슨이 끝나도 버프는 `state.lesson`에 남는다 (보상 화면 배경용). 체력만 다음 주로 이어진다.

#### 5.3.4 뷰

```jsonc
getLessonView → {
  season, week, stat, special, prep, policy, turn, turns, score, target, cap, status,
  playsLeft, canRest, canEndTurn, buffs: { … },
  chips: [ { key: "hojo", label: "호조", value: "2장" } ],      // 방침에 맞는 것과 0이 아닌 것만
  hand: [ { uid, cardId, name, family, plus, bond80, mode: "power"|"support"|null, targetKind, needTaps: 0|1|2,
            playable, deadReason, power, cost, desc } ],
  piles: { draw, discard, exhausted },
  players: [ { id, name, slot, position, portraitColor, stamina, out, injured, targeted, failRate } ],
  seq, lastFx
}

previewCard → {
  ok, reason, mode,
  needTaps, tapCandidates: [id], blocked: [{ id, reason }],
  targets: [ { id, gain, sub, cost, failRate } ],
  failRate, failerId,
  notes: [ "탈취 3 → ×1.9", "실패하면 점유 6을 잃음", "점유 −2", "압박 2 · 비용 ×1.4", "호조 ×1.5 (남은 2장)" ]
}
```

- 탭이 모자라면 `ok: false`이고, `tapCandidates`를 채워 돌려준다.
- 두 함수 모두 rng를 쓰지 않고 상태도 바꾸지 않는다. 테스트가 JSON 비교로 확인한다.

#### 5.3.5 연출 목록 (`lastFx`)

`lastFx`는 상태를 바꾸는 호출마다 덮어쓴다. 항목 종류는 다음과 같다.
- `{ t: "cost", id, n }`
- `{ t: "gain", id, stat, n, sub }`
- `{ t: "fail", id, n, injured }`
- `{ t: "heal", id, n }`
- `{ t: "buff", key, from, to }`
- `{ t: "tick", id, n }`
- `{ t: "tw", n }`
- `{ t: "turnEnd", turn }`
- `{ t: "draw", uids }`
- `{ t: "end", status }`

UI는 `seq`가 자기가 마지막으로 보여 준 값보다 클 때만 연출한다. 새로고침한 뒤에는 다시 재생하지 않는다.

### 5.4 `lessonRun.js` — 15주 흐름

#### 5.4.1 공개 API

`ctx.run`으로 쓴다. run.js와 이름 · 시그니처가 같은 것에는 ★를 붙였다.

| 함수 | phase | 내용 |
|---|---|---|
| `createRun({ data, seed, squad, formation, supportIds, tactics, policy })` ★(+policy) | → week | `run.buildRoster`로 선수 · 코치, 시작 덱, 시즌 계획, `beginWeek` |
| `isLessonRun(s)` · `migrateLessonRun(s)` | — | 저장본 검사 · 이행 (지금은 tactics · modifiers만 `run.migrateRun`으로) |
| `getPhase(state)` ★ | — | |
| `getWeekView(state, data)` | week | §5.4.4 |
| `applyWeekAction(state, data, action)` | week | 아래 표 |
| `playCard` · `lessonRest` · `endLessonTurn` · `getLessonView` · `previewCard` | lesson | lesson.js를 감싸고, 레슨이 끝나면 `afterLesson`을 부른다 |
| `getRewardView(state, data)` · `resolveReward(state, data, { pick, upgradeUid })` | reward | §5.4.3 |
| `getConsultView` · `consultAction(state, data, op)` · `endConsult(state, data)` | consult | §5.4.3 |
| `getPrepView(state, data)` · `confirmPrep(state, data, { tactics, formation, swaps })` | prep → match | `resolveMeeting(..., { teamwork: false })` → `run.makeGoalMatch` |
| `getMatchSetup` ★ · `buildTeamSnapshot` ★ | match | run.js에서 그대로 다시 내보낸다 |
| `finishMatch(state, data, result)` ★ | match | `run.settleMatch` → (유물 후보가 있으면) relic, 아니면 `continueFlow` |
| `chooseRelic` ★ | relic | `run.applyRelicChoice` → `continueFlow` |
| `chooseRoute` ★ | route | §5.4.2 |
| `getEventView` ★ · `resolveEvent` ★ | event | `run.getEventView` 그대로 · `run.applyEventChoice` → `continueFlow` (1차에는 쓰지 않는다) |
| `finalizeRun` ★ | finished | `run.finalizeRun` + `registeredTeam.policy`. 모양은 지금과 같다 (`createdTurnIndex` = 14) |
| `nextMatchView(state, data)` | 아무 phase | run.js의 것을 다시 내보낸다 |

**주 행동 (`applyWeekAction`)**

| action | 열리는 주 | 결과 |
|---|---|---|
| `{ type: "lesson", stat }` | 레슨 주 · 대비 주 | `startLesson` (특별 = stat이 specials에 있음, 대비 = prep 주) → phase lesson |
| `{ type: "rest" }` | 늘 | `training.resolveRest` → 주 끝 |
| `{ type: "outing", playerId }` | 자유 주의 offer에 있을 때 | 그 선수 +20, 7명 +10, 컨디션 +1 → 주 끝 |
| `{ type: "outing", playerId, free: true }` | `freeOuting > 0`이고 turn == 1 | 같은 효과, freeOuting −1, **주는 그대로**, phase week 유지 |
| `{ type: "meeting", tactics, formation?, swaps? }` | offer에 있을 때 | `resolveMeeting` (buy 없음, +10 팀워크) → 주 끝 |
| `{ type: "consult" }` | offer에 있을 때 | 진열을 굴린다 → phase consult |
| `{ type: "friendly" }` | offer에 있을 때 | `run.makeFriendlyMatch(state, data, "friendly")`, queue = [weekEnd…] → phase match |

#### 5.4.2 queue 단계

`continueFlow(state, data)`는 queue를 앞에서부터 실행한다. 멈추는 phase(week · lesson · reward · consult · prep · event · match · relic · route · finished)에 닿으면 멈춘다.

| 단계 | 하는 일 |
|---|---|
| `beginWeek` | `weekKinds[turn-1]`로 `weekOffer`를 굴린다 → phase week |
| `supportEventCheck` | `lesson.events.support`가 참일 때만: `run.findSupportEvent` → `run.fireEvent` (1차 기본은 아무것도 안 함) |
| `advanceWeek` | turn == 1이면 `freeOuting = 0`. turn < 5면 turn +1, turnIndex +1 → `beginWeek`. turn == 5면 phase prep |
| `seasonEnd` | 시즌 < 3이면 `pendingRoutes` → route, 아니면 finished |
| `routeFriendly` | `run.makeFriendlyMatch(state, data, "route")` → match |

- **주 끝** = queue `["supportEventCheck", "advanceWeek"]`이다. 휴식 · 외출 · 미팅은 바로 넣고, 상담은 `endConsult`에서, 레슨은 `resolveReward`에서, 친선전은 경기 · 유물 뒤에 이어 처리한다.
- **경기 전 준비**: `confirmPrep` → `run.makeGoalMatch` → phase match, queue = `["seasonEnd"]`.
- **`chooseRoute`**
  1. season +1, turn 1, `turnIndex = (season-1)*5`
  2. 만료된 modifier 제거 (`untilSeason < season`)
  3. 루트 효과 `applyEffects`
  4. `routeOverrides[id].freeOuting`이 있으면 `state.freeOuting`
  5. 시즌 계획을 굴린다
  6. queue = [원정이면 `routeFriendly`] + `beginWeek`

  루트 이벤트와 `guaranteedSeasonStartEvent`는 무시한다.
- **`createRun`**: 시즌 계획 → queue `["beginWeek"]`. 시즌 시작 이벤트는 없다.

#### 5.4.3 레슨 뒤 · 보상 · 상담

**`afterLesson`** — `status`가 정해진 직후 lessonRun이 부른다.
1. 결과 보상
   - 클리어: TP +10, 힌트 1
   - 퍼펙트: TP +20, 힌트 2, 무료 강화 1 (클리어 보상과 겹치지 않는다)
   - 클리어 · 퍼펙트 공통
     - 팀워크 +3
     - 코치 타입 = stat인 편성 코치의 유대 +5
     - `lumiFlag`가 있으면 컨디션 +1
     - 대비 레슨이면 modifier `{ key: "goalMatchCondition", amount: 1, untilSeason: season, source: "prepLesson" }`
2. **힌트 뽑기** — 힌트 1개마다:
   - `hintRate` 가중으로 편성 코치를 고른다. 레벨 3이 아닌 힌트 스킬이 남은 코치만 후보다.
   - 그 코치의 스킬 중 균등하게 하나를 골라 레벨 +1 (최대 3).
   - 후보가 하나도 없으면 SP +10.
   - 클리어 이상이고 `rng.chance(getModifier(hintRate))`면 힌트를 1개 더 준다.
3. **결장 감소** — `outAtStart`인 선수: injuredTurns −1 (0에서 멈춤).
4. **`record.lessons` 기록**, 로그 1줄.
5. **보상 후보** (클리어 이상일 때만, 3장, 중복 없음).
   - 풀: `pool: true`인 공용, 내 방침 계열, 편성 코치 카드, 덱에 있는 강화 안 된 고유 카드(`kind: "upgrade"`, uid 지정)
   - 가중치: 공용 1, 방침 1, 코치 `2 × specialtyRate / 0.4`, 고유 강화 0.5
   - "add" 후보는 `plusChance`(특별 0.3, 퍼펙트 0.5, 둘 다면 최대 0.7)로 강화판이 된다.
   - fail이면 offer = []
6. phase reward, `pendingReward = { offer, freeUpgrades, result }`.

**`resolveReward(state, data, { pick, upgradeUid })`**
- `pick`
  - offer의 번호: add이면 덱에 추가하고, 코치 카드면 유대 +15. upgrade이면 그 uid의 카드를 plus로 바꾼다.
  - `null`: offer가 있었으면 TP +10.
- `upgradeUid`: freeUpgrades > 0일 때 그 카드를 plus로 바꾼다 (plus · 대비 카드는 안 된다). 안 고르면 그 기회는 사라진다.
- `state.lesson = null`, `pendingReward = null` → 주 끝.

**상담**
- 진열 3장: 편성 코치 카드 1장(`specialtyRate` 가중) + `pool: true` 공용 · 내 방침 카드 중 2장.
- 가격: 공용 20, 방침 · 코치 30.
- `consultAction(state, data, op)`

  | op | 비용 · 제한 |
  |---|---|
  | `{ op: "buy", index }` | 진열 1장당 1번. 코치 카드면 유대 +15 |
  | `{ op: "upgrade", uid }` | TP 30, 방문당 1번 |
  | `{ op: "delete", uid }` | TP 25, 방문당 1번. 덱이 5장 아래로 내려가면 안 된다. 고유 카드도 지울 수 있다 (UI가 경고) |
  | `{ op: "skill", skillId, playerId }` | SP. `canLearnSkill` + `skillDiscountedCost`. 횟수 제한 없음 |

  - 모든 op는 검증을 먼저 하고, 실패하면 상태를 바꾸지 않는다. 각 op는 엔진 호출 1번이므로 그때마다 저장된다.
- `endConsult` → 주 끝.

#### 5.4.4 그 밖의 뷰

모두 순수하고 rng를 쓰지 않는다.

```jsonc
getWeekView → {
  season, week, weekIndex, kind, seasons, weeksPerSeason,
  nextMatch, weeksToMatch,
  status: { condition, teamwork, sp, tp },
  lessons: [ { stat, special, target, cap, turns } ],      // 레슨 · 대비 주
  prepCards: [cardId],                                      // 대비 주
  actions: [ { type, guaranteed } ],                        // 자유 주
  freeOuting: bool,
  restGain,
  players: [ … ],
  coaches: [ { id, name, type, bond, cardId, upgraded } ],
  deck: [ { uid, cardId, name, plus } ],
  relics, modifiers, log
}

getRewardView  → { result: { stat, special, prep, score, target, cap, status, tp, hints: [{ skillId, level }], teamwork, bond: [...], perPlayer: [{ id, gain, sub, auto }] },
                   offer: [ cardView ], freeUpgrades, upgradable: [uid] }
getConsultView → { tp, sp, stock: [ { cardView, price, bought, affordable } ], deck: [ … ],
                   upgradesLeft, deletesLeft, prices, skills: [ { skillId, name, cost, level, eligiblePlayers: [id] } ] }
getPrepView    → { nextMatch, formation, tactics, players, injuredOut: [id], prepBonus: bool }
```

- `perPlayer`를 위해 `startLesson`이 레슨 시작 때 7명의 스탯 스냅샷 `lesson.before`를 저장한다.

### 5.5 `manager.js` — 감독 AI (순수, rng를 쓰지 않음)

| 함수 | 돌려주는 것 |
|---|---|
| `recommendWeek(state, data)` | `{ type, stat?, playerId?, reason }` |
| `recommendCard(state, data)` | `{ kind: "play", uid, taps, score } \| { kind: "rest", playerId } \| { kind: "endTurn" }` |
| `recommendReward(state, data)` | `{ pick, upgradeUid }` |
| `recommendConsult(state, data)` | 다음에 할 op 하나 또는 `{ op: "end" }` |
| `recommendPrep(state, data)` | `{}` (편성을 그대로) |
| `autoStep(state, data, { playMatch })` | 한 단계 진행. match phase에서는 `playMatch(setup) → result`를 부른다. 유물은 첫 번째, 루트는 `(season-1) % 3`번째 |

**규칙**
- **카드 고르기**
  - 손패의 각 카드 × 탭 후보에 `previewCard`를 돌린다.
  - 점수:

    ```
    EV = Σgain×(1−f) − f×(5+40) + 버프 가치 − 0.15×Σcost − 체력 40 미만 대상 1명당 10
    ```

    버프 가치는 `tools/drafts/lesson_sim.mjs`의 `value()` 상수를 문서 단위로 옮긴다.
  - `restV`를 계산한다: 체력 40 미만 출전 선수 1명당 18, 20 미만이 있으면 +30. 대상 평균 체력 < 40이거나 restV > 최고 EV면 쉬기를 고른다 (그 턴의 첫 행동일 때만, 아니면 턴 끝).
- **탭 대상**
  - 지명 · 짝: 레슨 종목을 주 스탯 쌍에 가진 출전 선수 중 체력이 가장 높은 선수. 같으면 성장률이 높은 쪽, 그다음 슬롯 순서.
  - tap 회복과 쉬기: 체력이 가장 낮은 선수.
- **방침별 한 줄**
  - counter: steal ≥ 3이면 공격진이 낀 카드에 +30
  - press: press ≥ 2이고 체력 40 미만 대상이 있으면 `cd_drop_line` 우선, 아니면 쉬기를 미룬다 (restV ×0.5)
  - poss: 실패 비용에 poss × 8을 더하고, MF 없는 대상 카드에 −min(2, poss) × 8
- **주 고르기**
  - 출전 선수 평균 체력 < 40이면 휴식.
  - 레슨 주 · 대비 주: 특별 레슨 > 다음 상대 대응 종목(수비, 단 수비가 7명 합계 1위면 패스) > 주 스탯 합이 가장 낮은 종목.
  - 자유 주 [구현 결정]:
    1. 평균 체력 < 50 → 휴식
    2. 상담이 열려 있고 (TP ≥ 20 또는 살 수 있는 힌트 스킬이 있음) → 상담
    3. 미팅이 열려 있고 팀워크 < 100 → 미팅
    4. 친선전이 열려 있고 평균 체력 ≥ 70 → 친선전
    5. 외출이 열려 있으면 → 외출 (체력이 가장 낮은 선수)
    6. 그 밖 → 휴식
  - 무료 외출이 있으면 먼저 쓴다.
- **보상**
  - 방침 > 코치 > 고유 강화 > 공용.
  - 덱이 20장을 넘으면 건너뛴다.
  - 무료 강화는 덱 순서상 첫 번째 강화 안 된 고유 카드에 쓰고, 없으면 첫 번째 강화 안 된 카드에 쓴다 [구현 결정]. 카드를 낸 횟수는 저장하지 않으므로 "가장 많이 낸 카드" 규칙은 쓰지 않는다.
- **상담**
  1. 살 수 있는 힌트 스킬 (힌트 레벨이 높은 것부터, 그 포지션에 맞는 선수)
  2. TP ≥ 30이면 방침 · 코치 카드 구매
  3. 고유가 아닌 첫 카드 강화
  4. 덱 > 14면 `cd_basic` · `cd_coaching` 삭제
  5. end
- **추천 표시**: UI는 `recommendWeek` · `recommendCard` · `recommendReward`의 결과에 "추천" 배지만 붙인다. 레슨을 자동으로 진행하는 버튼은 없다 (8.3). 개발용으로 `?autolesson=1`이 있으면 레슨 화면이 600ms마다 추천 행동을 낸다 (스크린샷 · 시간 측정용).

### 5.6 `run.js` / `training.js`에 더하는 export (E0, 동작 불변)

| 새 export | 꺼내 오는 곳 | 옛 함수는 |
|---|---|---|
| `buildRoster({ data, formation, squad, supportIds })` → `{ formation, players, supports }` | createRun의 검증 · 선수 · 서포트 생성 | createRun이 부른다 |
| `findSupportEvent`, `fireEvent`, `logLine(state, text)` | 그대로 export | — |
| `applyEventChoice(state, data, idx)` | resolveEvent에서 continueFlow 앞까지 | resolveEvent가 부른다 |
| `makeGoalMatch(state, data)` → pendingMatch를 설정하고 rng를 쓴다 | setupGoalMatch에서 endTurnTick · queue · phase를 뺀 것 | setupGoalMatch가 부른다 |
| `makeFriendlyMatch(state, data, reason)` | setupFriendly에서 phase를 뺀 것 | setupFriendly가 부른다 |
| `settleMatch(state, data, result)` → `{ relicChoices }` | finishMatch에서 `pendingMatch = null`까지 | finishMatch가 부른다 |
| `applyRelicChoice(state, data, relicId)` | chooseRelic에서 continueFlow 앞까지 | chooseRelic이 부른다 |
| `nextMatchView` | 그대로 export | — |
| `training.resolveMeeting(state, data, action, opts = {})` | `opts.teamwork !== false`일 때만 +10 | 기본은 같다 |

- 각 함수의 phase 설정 · `assertPhase`는 옛 공개 함수에 남긴다. 꺼낸 핵심 함수는 phase를 검사하지 않는다.
- **E0 검증:** 바꾸기 전과 뒤의 `node tools/sim.mjs --runs 40 --seed 3` 출력이 같고(diff 0), 옛 테스트가 모두 통과해야 한다.

---

## 6. UI

### 6.1 라우팅 (`app.js render()`)

```js
switch (run.getPhase(store.run)) {
  case 'week': renderWeek(root, ctx); break;
  case 'lesson': setStageMode('lesson'); renderLesson(root, ctx); break;
  case 'reward': setStageMode('lesson'); renderLesson(root, ctx, { inert: true }); renderRewardModal(ctx); break;
  case 'consult': renderConsult(root, ctx); break;
  case 'prep': renderPrep(root, ctx); break;
  case 'event': renderBackdrop(root, ctx); renderEventModal(ctx); break;
  case 'match': setStageMode('match'); renderMatch(root, ctx); break;   // 이 줄 글자 그대로 (stage.test)
  case 'relic': renderBackdrop(root, ctx); renderRelicModal(ctx); break;
  case 'route': renderRoute(root, ctx); break;
  case 'finished': renderResult(root, ctx); break;
  default: root.append(errorPanel(new Error(`알 수 없는 phase: ${phase}`)));
}
```

- `renderBackdrop` = `renderWeek(root, ctx, { inert: true })`
- 엔진 import는 `import('../engine/lessonRun.js')`(= `run`), `import('../engine/manager.js')`(= `manager`, ctx에 넣는다)다. challenge · match는 그대로다.
- `DATA_FILES`에 `'cards'`, `'lesson'`, `'policies'`를 더한다 (필수 파일). 불러오기 오류 문구의 "8개 파일"은 파일 수를 계산해서 쓴다.
- `render()` 시작에서 `store.lessonUi.timer`도 정리하고 `lessonUi.gen`을 +1 한다.
- **actions**

  | 바뀌는 것 | 내용 |
  |---|---|
  | `doAction` → `weekAction(action)` | `engine(() => run.applyWeekAction(...))` → announce → render |
  | 새로 | `resolveReward(args)`, `consultAction(op)`, `endConsult()`, `confirmPrep(args)` |
  | 그대로 | `startRun`(+policy), `continueRun`(`isLessonRun` 검사), `resolveEvent`, `chooseRelic`, `chooseRoute`, `finishMatch`, `registerTeam` |
  | 레슨 화면 전용 | `lessonCall(fnName, args)`: `safe` + `saveRun`만 하고 render하지 않는다. 레슨 화면이 직접 부른다 |

- `setStageMode('lesson')`: lesson.css에 `.stage[data-mode="lesson"] #toast-root { top: auto; bottom: 236px; }`를 두어 손패 위, 경기장 아래쪽에 토스트를 띄운다.

### 6.2 store 추가

- `store.lessonUi = { selectedUid: null, taps: [], shownSeq: 0, busy: false, timer: null, gen: 0 }` + `resetLessonUi()`
- `store.consultUi = { selectedUid: null }`
- `store.setup.policy`

### 6.3 화면 와이어프레임 (1280×720, 논리 px)

**편성 화면 — 방침 패널.** 옆 열(350) 안 tactics 패널 아래에 별도 패널을 둔다. `<select>`가 아니라 버튼 5개다 (outgame.test의 "전술 select 4개"를 지킨다).

```
┌ 훈련 방침 — 경기 전술 아님 ─────────────────┐
│ [에이스형][팀형●][역습형][압박형][점유형]   │  .policy-row  .btn-sm 5개 (64×32)
│ 7명을 고르게 — 분위기                         │  .tiny .muted 한 줄
└──────────────────────────────────────────────┘   높이 ≈ 92 (그만큼 코치 패널 스크롤이 줄어든다)
```

**주 선택 화면** (`.week-screen`, grid `"top top" "main roster" "bar roster"`, columns `1fr 350`)

```
y0   ┌ topbar (hud.js): 시즌1 · ●●○○⚔ 3/5주 · 레슨 주 │ ⚔ 아이언후프 · 2주 후 · 대지 · 드리블 위주 │ 컨디션●●●○○ 팀워크42 SP50 TP30 ┐  h64
y72  │ ┌슈팅┐┌드리블┐┌패스 ★특별┐┌수비 추천┐┌피지컬┐        │ 선수 7 (hud.roster)                    │
     │ │⚽  ││🦶   ││➡️ ×1.3     ││🛡️      ││💪    │        │ 네리아 GK ▮▮▮▮▯ 85  수비 B · …        │
     │ │6턴 ││     ││+50%        ││         ││      │        │ … 결장(레슨 1) 빨간 배지               │
     │ │330 ││     ││429 / 676   ││         ││      │ [휴식] │──────────────────────────────────────│
     │ │/520││     ││            ││         ││      │ +40    │ 코치 유대 (눈금 | = 80)               │
     │ └────┘└─────┘└───────────┘└─────────┘└──────┘        │ 하르나 ▬▬▬▬▬▬|▬ 62  인터벌 슈팅      │
     │  카드 크기 150×260, 간격 12 (.lesson-pick)             │ …                                       │
y600 ├─────────────────────────────────────────────────────────┤                                         │
     │ [덱 보기 12] [유물·효과] [기록]       (무료 외출 1 — 온천) │                                         │
y712 └─────────────────────────────────────────────────────────┴─────────────────────────────────────────┘
```

- **자유 주**: 가운데에 행동 카드 3장(220×260, 보장된 칸에는 "이번 시즌 보장" 배지) + [휴식].
  - 상담 → 상담 화면
  - 전술 미팅 → `meetingEditor` 모달(modal-xl)
  - 외출 → 선수 7명 고르는 모달 (modal-md, 아바타 · 체력 · "그 선수 +20 / 전원 +10 / 컨디션 +1")
  - 친선전 → 확인 후 경기
- **대비 주**: 5종목 카드에 "대비 레슨" 표시 + 대비 카드 2장 미리보기(miniCard) + [휴식].
- **추천**: `manager.recommendWeek` 결과의 카드 · 버튼에 `.badge-accent 추천`.
- **inert**: 모든 버튼을 disabled, `.inert` 클래스 (이벤트 · 유물 모달의 배경).

**레슨 화면** (`.screen.og.lesson-screen`, 화면을 유지하는 DOM)

```
y0   ┌ HUD h60 ─ 시즌1 · 3주 · 패스 ★특별 │ 턴 ●●●○○○ 4/6 │ 점수 [████▌····|·····|] 286 / 429 / 676 │ 호조 2장 · 집중 3 ┐
y64  │ ┌ 경기장 (.pitch > .m-field, 매치 마크업 복제) 980×420 ───────────────┐ ┌ 이번 레슨 248 ────────┐ │
     │ │  GK●     DF●      MF●       FW●          (홈 골 = 왼쪽)              │ │ 네리아 ▮▮▮▮ 85 · 1회  │ │
     │ │          DF●      MF●       FW●                                      │ │ …  결장 회색 / 부상 ✚  │ │
     │ │  토큰 40px · 이름 · 체력 막대 · 머리 위 말풍선 "+31 · 2%"            │ │ 덱 8 · 버림 5 · 제외 1 │ │
     │ │  고를 수 있음 .pickable(초록) / 안 됨 .tok.blocked(빨강) / 고름 .picked │ │ 방침: 팀형 (분위기)   │ │
y488 │ └──────────────────────────────────────────────────────────────────────┘ └───────────────────────┘ │
y496 ├ 손패 dock h216 ──────────────────────────────────────────────────────────────────────────────────────┤
     │ [덱 8]   ┌카드176×204┐┌카드┐┌카드┐ (4장 이상이면 겹쳐서 760 안에)      [쉬기]  [턴 끝]  [기록]   │
     │ [버림 5] │FW 라인·2명│                                                  안내: "카드를 고르세요" /    │
     │          │합계40→1인20│                                                 "대상 선수를 탭 (1/2)"      │
y712 └──────────┴───────────┴────────────────────────────────────────────────────────────────────────────┘
```

- `.lesson-screen`에 `--pad: 6px; --fx: 12px; --ft: 8px; --fb: 8px`을 정의한다. `.lesson-screen.no-anim`도 따로 정의한다 (`match.css`의 `.match-screen.no-anim`과 같은 내용).
- **경기장 · 토큰 마크업**은 match.js L176-219 · L398-450과 같은 클래스로 lesson.js 안에서 복제한다. `.pitch-bg`, `.zone.z1..z5`, `.pl-*`, `.tok-layer`, `.tok.home > .tok-ring + .tok-face + .tok-bar>i + .tok-name + .tok-bubble`. 그리고 `.pop-layer`.
- **토큰 자리**는 `lineup.slotSpot(slot, slots, { spread: true })`(가로 %)다. 위치는 `transform: translate()`로 놓는다 (`--t-move` transition).
- **카드 앞면** (`js/ui/cards.js cardFace`)
  - 위 띠: 계열 색 (공용 `--panel-3`, 에이스 `--gold`, 팀 `--good`, 역습 `--accent`, 압박 `--bad`, 점유 `--purple`, 고유 portraitColor, 코치 `--accent-2`, 대비 `--warn`)
  - 이름 + "+" · "유대80" 표시
  - 대상 칩 (`CARD_TARGET_LABELS` + 지금 인원)
  - 위력 줄 (범위는 "합계 40 → 1인 20", 고유 지원 모드는 "지원 모드")
  - 비용 "체력 −12"
  - 효과 문구 최대 3줄 (12px, 넘치면 `title`로 전문)
  - 추천 칩, 낼 수 없으면 dim + 이유
  - `.card-face` 고정 크기라서 넘치면 잘린다 → shot.mjs의 잘림 검사 대상 (`.card-face .cf-desc`)
- **고르기 흐름**
  1. 카드를 누르면 `lessonUi.selectedUid`에 넣는다. `previewCard`로 대상 강조 · 말풍선 · 노트를 띄운다 (카드 위 팝 `.cf-notes`).
  2. 탭이 필요하면 토큰을 누를 때마다 `taps`에 쌓고, 다 차면 [내기] 버튼이 켜진다. 탭이 필요 없는 카드는 카드를 한 번 더 누르거나 [내기]로 낸다.
  3. Esc나 빈 곳을 누르면 취소한다.
  4. [쉬기]를 누르면 탭 모드가 되고, 토큰 1명을 탭하면 `lessonRest`.
- **연출**
  - `seq`가 오르면 `lastFx`를 순서대로 재생한다: cost → 대상 토큰이 훈련 지점으로 (280ms) → `.m-pop` "+N" (good / bad) → 복귀 (280ms) → 버프 칩 깜빡임.
  - 카드 1장에 약 1.1초다. `no-anim`이면 즉시 끝난다.
  - 재생하는 동안 `busy`이고, 입력은 무시한다.
  - status ≠ playing이면 재생이 끝난 뒤 `ctx.render()`(→ reward)를 부른다.
- **훈련 지점** (`lesson_layout.drillSpot(stat, idx, n)`, 가로 %)

  | stat | 지점 |
  |---|---|
  | shoot | 상대 박스 앞 x 82–90 |
  | dribble | 오른쪽 하프 콘 지그재그 x 60–75 |
  | pass | 센터서클 둘레 삼각형 |
  | defense | 우리 박스 앞 x 18–28 |
  | physical | 터치라인 y 8 / 92를 따라 |

  여러 명은 y로 나눠 퍼진다.
- **inert** (reward 배경): 루프 없이 마지막 상태만 그리고, 입력을 받지 않는다.

**보상 모달** (`openModal(..., { closable: false, className: 'modal-xl reward-modal' })`)

```
┌ 패스 ★특별 레슨 — 퍼펙트! ────────────────────────────────────────────────────────┐
│ 점수 [█████████████|] 702 / 429 / 676   TP +20 · 힌트 2 (스루패스 Lv2, 캐논 킥 Lv1) │
│ 팀워크 +3 (+5 레슨 중) · 유대: 오르넬라 +5 · 실루엔 패스 +62 (부 +18) …  (선수 7 줄 1행 칩) │
├ 카드 1장을 고르세요 ───────────────────────────────────────────────────────────────┤
│   [cardFace]  [cardFace +]  [cardFace 코치]          [건너뛰기 — TP +10]             │
├ 무료 강화 1장 (퍼펙트) ── 덱 그리드 miniCard 8열 ───────────────────────────────────┤
│   [..][..][..] …  선택한 카드 → "강화 후" 미리보기                                   │
└──────────────────────────────────────────────────────────── [확인] ─────────────────┘
```

- 실패하면 결과 머리 + "보상 없음" + [계속]만 있다.
- [확인]은 `resolveReward({ pick, upgradeUid })`를 한 번 부른다.

**상담 화면** (`.consult-screen`, columns `300 | 1fr | 340`)

```
┌ 상담 — TP 50 · SP 120 ──────────────────────────────────────────── [상담 끝내기] ┐
│ 진열 (3)               │ 덱 (14)  miniCard 그리드 5열, 고르면 강조       │ 스킬 (SP)                   │
│ [cardFace 축소 0.8]    │                                                   │ 스루패스 Lv2  96 SP          │
│  30 TP [구매]          │ 고른 카드: 이름 · 효과 · 강화 후 미리보기          │  [선수 select] [구매]        │
│ [cardFace] 20 TP       │ [강화 30 TP] (남은 1) [삭제 25 TP] (남은 1)        │ 힌트 없는 스킬은 회색        │
│ [cardFace 코치] 30 TP  │ 고유 카드 삭제는 확인 모달                         │ (training.js L298 마크업 이전) │
└────────────────────────┴───────────────────────────────────────────────────┴─────────────────────────────┘
```

- 각 버튼은 엔진 호출 1번이고, 저장한 뒤 render한다. 선택은 `store.consultUi`에 두어 render 뒤에도 남는다.

**전술 미팅 모달 / 경기 전 준비 화면**

- `meetingEditor({ state, data, title, badge, submitLabel, onSubmit, opponent? })`: 2단 `.meeting-cols` (`260 | 1fr`).
  - 왼쪽: 전술 6개 select.
  - 오른쪽: 포메이션 select + `lineupBoard({ compact: true })` (`reseat ... { fillAll: true }`).
  - 제출: `{ tactics, formation?, swaps: meetingSwaps(...) }`.
  - 고유 카드 모드가 바뀌는 선수는 lineup 카드에 "고유 카드 모드 변경" 작은 표시를 붙인다.
- **경기 전 준비** (`.prep-screen`, columns `340 | 1fr`)
  - 왼쪽 패널: 다음 상대 (이름 · 원소 · 스타일 · 주 성향 · 포메이션 · 포제션), "대비 레슨 클리어: 경계전 컨디션 +1", 결장 선수 → "유스 출전" 경고.
  - 오른쪽: `meetingEditor` (팀워크 +10 표시 없음).
  - 버튼: [경기 시작].

**시작 화면**: 흐름 문구는 "3시즌 · 15주 · 레슨 최대 9회 · 경계전 3회"다. 이어하기 정보는 `시즌 n · w/5주 · phaseLabel`이다. "카드 레슨 시험판 — 본편과 저장이 따로입니다" 배지를 붙인다.

**결과 화면**: 바꾸지 않는다. 등록 팀에 들어가는 `policy`는 결과 화면이 읽지 않는다.

---

## 7. 결정 목록 — 지도에서 나온 빈칸 [구현 결정]

| # | 질문 | 결정 |
|---|---|---|
| D1 | 1차 이벤트 | **없음** (범위 지정). 유대 60 서포트 이벤트도 끈다 (`lesson.events.support: false`). 라우팅 · `supportEventCheck` 단계는 남겨 2차에 켠다. 결과: 유대 60은 표시만 한다. 시간 예산이 4~5분 짧아진다 |
| D2 | 외출 | 1차에 **기본 외출**을 넣는다 (그 선수 +20, 7명 +10, 컨디션 +1, 이벤트 없음). 결장 선수도 고를 수 있다. 유대는 오르지 않는다 |
| D3 | 자유 주 칸 | 3칸 = 보장 1 + {외출 · 친선전 · 상담 · 미팅} 중 보장을 뺀 2칸 (중복 없음) + 늘 열린 휴식. 시즌마다 [상담, 미팅]을 섞어 2주차와 4주차의 보장으로 둔다 |
| D4 | 온천 (L31) | 체력 100 + 컨디션 4. 그리고 다음 시즌 1주차에 주를 쓰지 않는 무료 외출 1번 (`freeOuting`). 1주차가 끝나면 사라진다. 설명 문구는 `lesson.json routeOverrides`로 덮는다 |
| D5 | 클리어 + 퍼펙트 | 퍼펙트가 TP · 힌트를 대신한다 (TP 20, 힌트 2, 무료 강화 1). 팀워크 +3 · 같은 종목 유대 +5 · 루미 · 대비 효과는 클리어 · 퍼펙트 공통 |
| D6 | 퍼펙트 시점 | 카드 처리 직후와 턴 끝 틱 직후. 카드로 닿으면 그 턴의 틱은 하지 않는다. 체력 보너스 = 5 × (turns − turn) |
| D7 | 보상 가중치 | 공용 1 · 방침 1 · 코치 2×specialtyRate/0.4 · 고유 강화 0.5. 한 번에 같은 카드가 두 번 나오지 않는다 |
| D8 | "좋은 카드↑" · "보상 등급↑" | 후보마다 강화판이 될 확률: 특별 30%, 퍼펙트 50%, 둘 다면 70% (상한) |
| D9 | 짝 팀워크 · 상한 | 짝 = 실패자가 없으면 +2. 다인 = 성공 인원 −1. 이 둘만 레슨당 8까지. 카드 효과와 클리어 +3은 상한 밖. 0~100으로 묶는다 |
| D10 | 대비 카드 | CARDS §5를 따른다 (태클 = 수비 · 피지컬, 인터셉트 = 수비 · 패스, 버티기 = 수비). 상대 `opponentStyleHint().key`로 짝을 고르고, `tactics.shootTiming == "midrange"`면 두 번째 카드를 버티기로 바꾼다. 지금 데이터로는 시즌1 태클×2, 시즌2 인터셉트×2, 시즌3 인터셉트+버티기다 |
| D11 | 상승 식 | §5.3.1 7번의 M. 분위기 틱에는 컨디션 × (1 + 0.5·특별 + Σeff)는 곱하고 호조는 곱하지 않는다 |
| D12 | 비용 | 강화 전 기본 1인 위력 기준. 집중 · routine · 강화판 · 유대80 증가분은 비용을 올리지 않는다. perMood · perPress 몫은 올린다 |
| D13 | 위력 없는 카드의 강화 | §4.4 표의 값. 그레타 지원 모드 강화판 = 비용 0 + 그레타 체력 +10 |
| D14 | 쿨다운 · 아이싱 · 숨 고르기 | 대상 종류 `tap`: 1명을 고르고, 상승 · 실패 판정 · 비용 · 방침 누적 · 대상 횟수 없음 |
| D15 | 쉬기 · 남은 사용 | 쉬기는 그 턴의 첫 행동일 때만. 1장 이상 낸 뒤에는 [턴 끝]으로 남은 추가 사용을 버린다 |
| D16 | 레슨 중 고유 카드 주인 부상 | 그 고유 카드를 이번 레슨의 손패 · 더미에서 뺀다 |
| D17 | 호조 | 대상 있는 카드만 1장씩 쓴다. 더하면 쌓인다. 호조를 준 카드 자신은 받지 않는다 |
| D18 | 분위기 감소 | 쉬기 턴 −2. "하나 된 호흡"이 켜져 있으면 쉬기 턴에도 줄지 않는다 |
| D19 | 카드 자신의 버프 | 자기 상승 뒤에 적용한다 |
| D20 | 자율 훈련 평균 | 카드 주 스탯 상승 합 ÷ 대상이 된 서로 다른 선수 수 (분위기 틱 · −5 제외, 실패자는 대상에 센다) |
| D21 | 실패자 동률 | 실패율 높은 쪽 → 체력 낮은 쪽 → 슬롯 순서 |
| D22 | 결장 단위 | 열린 레슨 수. 결장 중인 선수가 레슨 시작부터 빠진 레슨이 끝나면 −1. 대비 레슨에서 다치면 바로 뒤 경계전에서 유스. 그 레슨까지 모든 친선전 · 경계전에서도 유스 |
| D23 | 유대 +15 | 보상에서 고르든 상담에서 사든, 코치 카드를 얻을 때마다 |
| D24 | `friendshipBonus` · `trainingBonus` | 실행 중에는 쓰지 않는다 (카드 표 수치에 이미 들어 있다). 유대80과 강화판은 겹친다 |
| D25 | 울리카 파트너 비용 | round(18 × 0.4) = 7 |
| D26 | 힌트 뽑기 | 코치를 `hintRate` 가중으로 고르고, 그 코치 스킬 중 균등. 레벨 3은 제외. 후보가 없으면 SP +10 |
| D27 | 대비 레슨 특별 | 없음. 특별 레슨은 레슨 주에만 |
| D28 | 유대 60 이벤트 | D1에 따라 끈다. 켜면 주 끝에 1주 1개, 문턱 낮은 순 |
| D29 | 상담 가격 · 제한 | 구매 공용 20 / 방침 · 코치 30, 강화 30, 삭제 25. 진열 3장은 각각 1번, 강화 · 삭제는 방문당 1번. 덱 최소 5장 |
| D30 | `restEffect` | 주 휴식에만. 레슨 중 쉬기에는 적용하지 않는다 |
| D31 | 주 스탯 쌍 | `cards.mainStatsOf(pos)` 추가. `training.mainStatOf`는 그대로 |
| D32 | 실패가 낀 방어 카드 | 실패자가 있으면 탈취를 쌓지 않는다. 카드 고유의 스택 효과(`when: success`)도 실패자가 없을 때만 |
| D33 | 감독 탭 대상 | 문서 규칙 (주 스탯 쌍 중 체력 최고), 같으면 성장률 |
| D34 | "다음 상대 대응 종목" | 수비. 수비가 이미 7명 합 1위면 패스 |
| D35 | 자유 주 감독 AI | §5.5 순서 |
| D36 | "자동" | 자동 진행은 헤드리스 시뮬 + 개발용 `?autolesson=1`뿐. 플레이어에게는 추천 배지만 보인다 |
| D37 | 압박 실패 | 0으로 (문서대로, 초안 시뮬과 다름) |
| D38 | 방침 패시브 | 탈취 쌓기 · 쓰기, 점유 ±, 압박 실패 리셋은 run 방침이 맞을 때만. 카드에 적힌 효과는 늘 적용 |
| D39 | phase 이름 | week · lesson · reward · consult · prep (+ event · match · relic · route · finished). 미팅 · 외출 · 친선 확인은 주 화면의 모달이고 phase가 아니다 |
| D40 | 모듈 이름 | `cards.js` · `lesson.js` · `lessonRun.js` · `manager.js` |
| D41 | 저장 키 | `soccer-lesson.` 앞머리, `kind: "lessonRun"` + `version: 1` 검사 |
| D42 | 상담 저장 방식 | 행동마다 엔진 호출 + 저장 (상담은 phase, 새로고침해도 안전) |
| D43 | 레슨 결과 화면 | 실패해도 reward phase를 거친다 ([계속]만 있음) — 결과를 늘 보여 주기 위해 |
| D44 | 등록 팀 | `run.finalizeRun`과 같은 모양 + `policy` 필드 하나. 덱 · TP는 저장하지 않는다 |
| D45 | 대상 0명 · 출전 0명 | 죽은 카드는 버리고 다시 뽑는다. 출전 선수가 0명이면 레슨을 바로 끝낸다 |
| D46 | 시작 TP | 0 |

**사용자에게 나중에 확인받을 것** (프로토타입을 해 본 뒤, 번호로): D5 · D6 · D8 · D12 · D13 · D29 · D35 · D1(유대 60 이벤트를 1차에서 켤지).

---

## 8. 결정성 · 저장 규칙 (모든 엔진 슬라이스 공통)

- 엔진은 DOM · fetch · Date · Math.random · localStorage를 쓰지 않는다. 상태는 JSON 순수 객체이고, 함수를 넣지 않는다.
- rng는 함수에 들어올 때 `createRngFromState(state.rngState)`로 열고, 나가기 직전에 저장한다. 다른 rng 함수를 부르는 동안에는 rng를 들고 있지 않는다.
- rng를 쓰는 곳은 다음뿐이다.
  - 시즌 계획, 주 offer(특별 · 자유 칸)
  - 레슨 섞기 · 뽑기 · 다시 섞기 · 죽은 카드 다시 뽑기
  - 실패 · 부상 판정, 힌트, 보상 후보, 상담 진열
  - 주 휴식 컨디션, 친선 상대 · 경기 시드, 유물 후보
- 뷰 · 미리보기 · 감독 AI는 rng를 쓰지 않고 상태를 바꾸지 않는다.
- UI는 레슨 호출 1번마다 `saveRun`을 부른다. 새로고침하면 같은 손패가 나오고, 이미 나온 판정은 바뀌지 않는다.

---

## 9. 테스트 계획

### 9.1 그대로 통과해야 하는 테스트

`rng` · `run` · `match` · `v05` · `challenge` · `layout` · `lineup` · `orient` · `stage`

- 옛 엔진 · 경기 테스트라서 레슨판에서도 그대로 돈다.
- `stage.test`의 `case 'match': setStageMode('match')` 글자 검사를 지킨다.

### 9.2 고치는 테스트

- **`ui.smoke.test.mjs`**
  - 키는 `KEYS`에서 가져온다.
  - 걷기: 시작 → 편성 (`.slot-card` 7, `.support-card.selected` 6, `.policy-row` 버튼 5) → 기본 편성 → `.week-screen` · `.topbar` · `.next-match`(styleHint) · 레슨 카드 5장 → "추천" → `.lesson-screen` → 카드 1장 내기 → `store.run.lesson.seq === 1` · `soccer-lesson.run` 저장 확인.
  - 경기 부분은 자유 주까지 감독 AI로 걸은 뒤 `weekAction({ type: 'friendly' })`로 경기 화면에 들어간다.
  - 도전 블록은 그대로 두고 키만 바꾼다.
- **`outgame.test.mjs`**
  - CSS 검사 목록에 `lesson.css`를 더한다.
  - 필수 선택자: `.week-screen` · `.lesson-screen` · `.card-face` · `.reward-modal` · `.consult-screen` · `.prep-screen` · `.meeting-cols` · `.policy-row` · `.topbar` · `.roster`.
  - 편성: 전술 select 4개 + 방침 버튼 5개.
  - 주 화면: pips 5 + ⚔, 상태 칩 4개 (컨디션 · 팀워크 · SP · TP), 호출권 없음.
  - 미팅: 2단이고 상점이 없다.
  - 주입 확인: event · relic · route · result.
  - 시작 문구 "15주".

### 9.3 새 테스트

- **`cards.test.mjs`**
  - 66장, id가 겹치지 않는다.
  - 계열별 장수: 13 / 8 / 8 / 6 / 6 / 6 / 8 / 8 / 3
  - 모든 `ownerCharId`, `coach.supportId`, effects · mods 키가 닫힌 목록 안에 있다.
  - 2-2-2 기본 편성의 1인 비용이 CARDS 초안 표와 같다.
  - `resolveCardDef`의 plus · bond80 덮어쓰기
  - `mainStatsOf`
- **`lesson.test.mjs`**
  - 같은 시드 = 같은 결과
  - 레슨 중간 JSON 왕복 뒤 같은 손패 · 같은 판정
  - view · preview · manager가 상태를 바꾸지 않는다 (JSON 비교)
  - 카드 1장에 실패 판정 1번, 실패자만 −5
  - 부상 → out + 고유 카드 제외 + `injuredTurns = 1`
  - 범위 위력 ÷ 인원 (포메이션 4종)
  - 고유 카드 두 모드 (배치를 바꾸면 모드가 바뀜), 울리카 파트너
  - 방침 5개: 탈취 쌓기 · 쓰기(실패해도 사라짐), 압박 비용 · 쉬기 회복 · 실패 리셋, 점유 +1 / −2 / 가드, 분위기 틱 · 감소 · 무감소, 호조 장수 · 집중 몫
  - 점수 = 종목 순증가 (−5 포함, 부 스탯 · 자율 · 상한에 잘린 분 제외)
  - 퍼펙트 즉시 종료 + 체력 보너스, 클리어 · 실패 판정
  - 자율 훈련
  - 죽은 카드 다시 뽑기, 추가 사용 · 다음 턴 손패
  - 쉬기는 첫 행동일 때만, [턴 끝]
- **`lessonRun.test.mjs`**
  - 단계 전이: week → lesson → reward → week …, 자유 주 행동 6종, 대비 주 → prep → match → relic → route
  - 매 단계 불변식:
    - `turnIndex == (season-1)*5 + turn-1`
    - 체력 · 유대 0~100, 컨디션 0~4, 팀워크 0~100, 힌트 ≤ 3
    - JSON 왕복
    - 덱 uid가 겹치지 않는다
  - 자유 주 보장: 시즌마다 상담 · 미팅이 한 번씩 열린다
  - 경기 전 준비는 주와 팀워크를 쓰지 않는다
  - 온천 무료 외출
  - 원정 친선전
  - 결장 → 경기 스냅샷에서 유스 (`buildTeamSnapshot`)
  - 보상 · 건너뛰기 TP · 무료 강화 · 코치 +15 / +8 / +5 · 유대80 강화판 · 힌트 1 / 2
  - 상담 op 검증 실패 시 상태 불변
  - `finalizeRun().registeredTeam` → `challenge.buildChallengeTeamSnapshot` → `match.createMatch`가 통과한다
- **`manager.test.mjs`**
  - 감독 AI로 15주를 끝까지 간다: 실제 match.js `simulateAuto`, 시드 2개 × 방침 2개 (ace, counter)
  - 정해진 단계 수 안에 finished에 닿는다
  - 추천이 늘 유효한 행동이다
  - rng를 쓰지 않는다
- **`lessonUi.test.mjs`** (jsdom)
  - 레슨 화면에서 카드 선택 → 탭 → 내기 → seq 증가 → 다시 그려도 선택이 남는다
  - 보상 모달의 [확인]
  - 상담 구매 · 강화 · 삭제 · 스킬
  - 경기 전 준비의 [경기 시작] → 경기 화면
  - 이어하기는 `kind`가 다른 저장본을 거절한다

- 실행 시간 예산: 새 테스트를 다 합쳐 60초 안. 많은 시드를 돌리는 일은 시뮬 도구로 한다.

---

## 10. 시뮬 도구 · 스크린샷

### 10.1 `tools/lesson_sim.mjs`

- 실행: `node tools/lesson_sim.mjs --runs 200 --seed 1 [--policy all|ace|team|counter|press|poss] [--formation 2-2-2] [--no-match] [--json]`
- 데이터는 `import.meta.url` 기준으로 읽는다.
- 진행: `manager.autoStep` + `match.simulateAuto`.
- 방침별 지표 표:
  - 런 끝 평균 스탯 (참고: 지금 약 477), 팀워크 (약 90~94), 습득 스킬 (약 0.9), 평가 점수 · 등급 분포
  - 경계전 승률
  - 런당 레슨 수 · 클리어율 · 퍼펙트율 · 시즌별 평균 점수 (초안: 395 / 460 / 545)
  - 실패 · 부상 (목표 0.5~1.5)
  - 레슨 중 쉬기 · 주 휴식
  - 선수별 대상 횟수 최소~최대
  - 코치 카드 획득 수 · 유대 60 / 80 도달 코치 수 · 힌트 수
  - 덱 크기, TP · SP 흐름
  - 레슨 1회 카드 수 (시간 추정)
- 결과는 **보고만** 한다. 수치는 바꾸지 않는다 (밸런스는 나중에). 초안 시뮬과 다른 규칙(D9 · D11 · D12 · D18 · D20 · D37)도 함께 적는다.

### 10.2 시나리오 · 스크린샷 (`tools/lesson_scenarios.mjs`, `node tools/shot.mjs og_…`)

- **`walkLesson(data, { seed, policy, until })`**: 감독 AI로 걷다가 조건을 만족하는 상태를 돌려준다. 같은 결과가 나오게 시드로 고정한다.
- **`prepareRun`** (경기 시나리오 01~27용): 레슨 런에서 친선전 · 경계전 phase까지 걷는다. 경기 시나리오는 데이터가 달라져도 조건 검색으로 상태를 찾으므로 그대로 동작해야 한다 (스크린샷 모양은 바뀔 수 있다).

| 시나리오 | 상태 | ready / expect |
|---|---|---|
| `og_start` | 저장 없음 | 시작 · "15주" · "본편과 저장이 따로" |
| `og_setup` | 편성 | `.policy-row` 5버튼 |
| `og_week_lesson` | 시즌1 1주 | 레슨 카드 5 · 특별 ★ · 추천 |
| `og_week_free` | 자유 주 | 행동 3 + 휴식 · 보장 배지 |
| `og_week_prep` | 5주 | 대비 카드 2장 미리보기 |
| `og_outing` | 자유 주 + 외출 모달 | 선수 7 |
| `og_meeting` | 미팅 모달 | 2단, 상점 없음 |
| `og_lesson` | 레슨 1턴 | 손패 3 · HUD · 토큰 7 |
| `og_lesson_pick` | 지명 카드를 고른 상태 | `.tok.pickable` · 말풍선 |
| `og_lesson_pair` | 짝 카드, 탭 1/2 | `.tok.picked` 1 |
| `og_lesson_mid` | 카드를 낸 직후 (연출 멈춤) | `.m-pop` |
| `og_lesson_<policy>` ×5 | 각 방침의 3턴째 | 버프 칩 |
| `og_lesson_injury` | 부상 직후 | 빨간 토큰 · 결장 |
| `og_reward_clear` / `og_reward_perfect` / `og_reward_fail` | 레슨 끝 | 3장 / 무료 강화 그리드 / [계속] |
| `og_consult` | 상담 | 3단 · 가격 |
| `og_prep` | 경기 전 준비 | 상대 패널 + 편집 |
| `og_relic` · `og_route` · `og_result` · `og_challenge` | 기존과 같음 | 온천 설명 덮어쓰기 확인 · 레슨 등록 팀 |

- shot.mjs 검사에 **카드 문구 잘림**(`.card-face .cf-desc`, `.cf-name`)과 HUD 겹침(토스트가 점수 막대를 가리지 않음)을 더한다.

---

## 11. 위험과 대응

| 위험 | 대응 |
|---|---|
| run.js 리팩터로 옛 동작이 바뀜 | E0에서 export만 더하고, 시뮬 출력 diff 0 + 옛 테스트 통과를 조건으로 건다 |
| 레슨 화면이 전체 render로 연출이 끊김 | 레슨 화면은 화면을 유지하는 DOM + GEN · `alive()`. `actions`는 레슨이 끝날 때만 부른다 |
| match.css 변수가 레슨 컨테이너에 없음 | `.lesson-screen`에 `--pad` · `--fx` · `--ft` · `--fb`, `.no-anim`을 따로 정의한다 |
| 카드 효과가 늘 때마다 코드가 커짐 | effects · mods 닫힌 목록 + `cards.test`가 목록 밖 키를 거절한다 |
| 저장 섞임 | 키 앞머리 + `kind` 검사 + `.lesson-site` 표시 파일이 앞머리 커밋 뒤에만 |
| main 워크플로 실수로 본편 배포가 깨짐 | 표시 파일이 없으면 root만 배포한다. main 푸시 뒤 `/soccer/`를 먼저 확인한다 |
| 수치가 초안 시뮬과 다름 | 정상이다. 시뮬은 보고만 한다 (밸런스는 나중에) |

---

## 12. 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건:
- `npm test`가 통과한다 (그 슬라이스까지 바뀐 목록).
- 경기 쪽 파일 diff가 0이다.

```
git diff --stat main -- js/engine/match.js js/engine/ai.js js/engine/skills.js js/engine/rng.js js/ui/screens/match.js js/ui/layout.js css/match.css
```

커밋은 슬라이스마다 1개 이상, 브랜치 `outgame-lesson`에 한다.

### E0 · run.js 핵심 함수 export (동작 불변)
- **할 일:** §5.6 표대로 함수를 꺼내고 export만 더한다. `resolveMeeting`에 `opts`를 더한다.
- **완료 조건:**
  - 옛 테스트 전부 통과
  - 바꾸기 전 · 뒤의 `node tools/sim.mjs --runs 40 --seed 3` 출력 diff 0
  - run.js의 기존 export 목록이 줄지 않았다 (`git diff`로 확인)

### E1 · 데이터 + `cards.js`
- **할 일:**
  - `data/cards.json` (66장, §4.3 · §4.4), `data/lesson.json` (§4.1), `data/policies.json` (§4.2)
  - `js/engine/cards.js`: `indexCards`, `resolveCardDef(data, card, { plus, bond })`, `mainStatsOf`, `targetsFor(state, def, taps)`, `costBase`, `validateCardsData(data)`
  - `test/helpers.mjs`의 `DATA_FILES`에 추가
  - `test/cards.test.mjs`
- **완료 조건:**
  - cards.test 통과 (장수 · 키 · 2-2-2 비용 표 일치)
  - 옛 테스트 통과

### E2 · `lesson.js` 핵심 배틀
- **할 일:**
  - `startLesson` · `playCard` · `lessonRest` · `endLessonTurn` · 레슨 끝 1~3
  - 대상 · 위력 · 비용 · 실패 · 부상 · 상승 · 부 스탯 · 점수 · L10 팀워크
  - 뽑기 · 죽은 카드 · 추가 사용 · 다음 턴 손패 · exhaust
  - 공통 effects (heal, teamwork, next*, extraPlay, drawNext, endHeal, lumiFlag)
  - 고유 두 모드 + 울리카, 코치 배율 · 실패율 감소 · 유대 +8, 대비 카드 · lessonMult, lastTurnX2 · underdog
  - `getLessonView` · `previewCard` · `lastFx` · `seq`
  - 방침 버프 자리는 훅만 둔다 (값 0)
- **완료 조건:** lesson.test의 결정성 · JSON 왕복 · 순수 뷰 · 실패 1번 · 부상 · 범위 ÷ 인원 · 고유 모드 · 점수 정의 · 퍼펙트 · 자율 훈련 · 죽은 카드 · 쉬기 · 턴 끝 항목 통과

### E3 · 방침 버프 5종
- **할 일:**
  - hojo · focus · routine
  - mood · moodX2 · noDecay · 분위기 틱
  - steal (쌓기 · 쓰기 · stealPer · stealBuild · consume 효과)
  - press (배율 · 비용 · noPressCost · pressDrop · 쉬기 회복 · 실패 리셋 · perPress)
  - poss (+1 / −2 / 가드 / possX2 / possKeep)
  - perMood, 방침 게이트 (D38), 미리보기 노트 문구, `chips`
- **완료 조건:**
  - lesson.test의 방침 항목 통과
  - 66장 전부 "내기 → 오류 없음" 퍼즈 테스트 (방침 5개 × 시드 20, 무작위로 유효한 행동)

### E4 · `lessonRun.js`
- **할 일:** §5.4 전부 — createRun · 주 offer · 행동 6종 · afterLesson(보상 · 힌트 · 유대 · 결장 감소 · 기록) · resolveReward · 상담 · 경기 전 준비 · 경기 · 유물 · 루트(온천 · 원정) · finalize · 뷰 4종 · isLessonRun.
- **완료 조건:**
  - lessonRun.test 통과 (감독 AI 없이 테스트 안의 간단한 정책으로 15주 완주 포함)
  - `registeredTeam`이 `challenge.buildChallengeTeamSnapshot`을 통과한다

### E5 · `manager.js` + 시뮬
- **할 일:** §5.5 전부, `manager.test.mjs`, `tools/lesson_sim.mjs`, `package.json`에 `lesson-sim` 스크립트.
- **완료 조건:**
  - manager.test 통과 (실제 경기 포함, 60초 안)
  - `npm run lesson-sim`이 표를 내고, 그 출력을 슬라이스 보고에 붙인다 (수치는 조정하지 않는다)

### U1 · UI 기반
- **할 일:**
  - store (앞머리 · lessonUi · consultUi · `loadRun` 검사)
  - 키 문자열을 `KEYS`로 (§2.2 목록 전부)
  - app.js (import · DATA_FILES · §6.1 라우팅 · actions · stage mode · 타이머)
  - labels, start, setup 방침 패널, index.html (제목 · lesson.css), lesson.css 뼈대
  - `hud.js` 떼어 내기, 아직 없는 화면은 임시 패널 (`renderWeek` 등은 "준비 중" 패널 + 기본 버튼)
  - ui.smoke · outgame.test 앞부분(시작 · 편성 · 키)
- **완료 조건:**
  - jsdom: 시작 → 편성(방침) → 기본 편성 → week phase가 그려진다
  - 저장 키가 `soccer-lesson.run`
  - `stage.test` 통과

### U2 · 주 화면 · 미팅 · 외출 · 경기 전 준비 · 루트 문구
- **할 일:**
  - `screens/week.js` (레슨 · 자유 · 대비 3모양, inert, 추천 배지, 무료 외출)
  - `js/ui/meeting.js` (2단 `meetingEditor`), 외출 모달
  - `screens/prep.js`, route.js 설명 덮어쓰기
  - `screens/training.js` 삭제, outgame.css 정리
  - outgame.test의 주 · 미팅 · 준비 부분
- **완료 조건:**
  - jsdom으로 주 행동 6종 각각이 엔진을 부르고 다음 phase가 그려진다
  - prep → match 화면

### U3 · 레슨 화면
- **할 일:**
  - `js/ui/cards.js` (cardFace · miniCard), `js/ui/lesson_layout.js` (drillSpot · tokenSpot, 순수)
  - `screens/lesson.js`: 경기장 · 토큰 복제, HUD, 손패 dock, 선택 · 탭 · 취소 · 쉬기 · 턴 끝, 연출 루프 · GEN · alive · no-anim, `?autolesson=1`, inert 모드
  - lesson.css 레슨 부분
  - `lessonUi.test.mjs`의 레슨 부분, `lesson_layout`의 node 테스트
- **완료 조건:**
  - jsdom: 카드 내기 → seq +1 · 저장, 다시 그려도 선택 유지
  - 레슨 끝 → reward phase가 그려진다
  - 1280×720에서 페이지 · 내부 스크롤 없음 (shot 지표)

### U4 · 보상 모달 · 상담 화면
- **할 일:**
  - `screens/reward.js` (클리어 · 퍼펙트 · 실패)
  - `screens/consult.js` (진열 · 덱 · 스킬 3단, 행동마다 저장)
  - 해당 CSS, `lessonUi.test`의 보상 · 상담 부분
- **완료 조건:**
  - jsdom: 보상 고르기 · 건너뛰기 · 무료 강화
  - 상담 구매 · 강화 · 삭제 · 스킬 · 끝내기가 엔진 상태에 반영되고, 오류는 토스트로 뜬다

### I1 · 통합 · 시나리오 · 문서
- **할 일:**
  - `tools/lesson_scenarios.mjs`, scenarios.mjs `prepareRun` · `OUTGAME_SCENARIOS` 연결, shot.mjs 잘림 검사
  - §10.2 스크린샷 전부 찍고 확인 (잘림 · 겹침 · 스크롤)
  - ui.smoke 전체 걷기 (15주를 감독 AI로 → 결과 → 등록 → 도전 모드에 레슨 팀이 보임)
  - `ARCHITECTURE.md` §20, `README.md`
- **완료 조건:**
  - `npm test` 전부 통과
  - `node tools/shot.mjs og_` · 경기 시나리오 01~27이 검사를 통과한다
  - 스크린샷 경로 목록을 보고에 넣는다

### D · 배포
- **할 일:**
  1. (사용자에게 한 줄로 알린 뒤) main에 `pages.yml`만 커밋 · 푸시 → `/soccer/`가 그대로인지 확인
  2. 브랜치에 main을 `--ff-only`로 합칠 수 없으면(갈라졌으면) main의 `pages.yml`만 브랜치에 같은 내용으로 맞춘다
  3. 브랜치에 `lesson-redeploy.yml` + `.lesson-site`
  4. `git push -u origin outgame-lesson`
- **완료 조건:**
  - `https://zerocoke8.github.io/soccer/lesson/`이 200
  - 시작 화면에 "카드 레슨 시험판"
  - 본편 저장이 보이지 않는다 (같은 브라우저에서 본편 이어하기가 그대로)
  - Actions에 dispatch 실행이 보인다

순서 의존: E0 → E1 → E2 → E3 → E4 → E5 / U1은 E1 뒤에 시작할 수 있다 (뷰 계약 §5.4.4가 고정되어 있음) → U2 (E4 필요) → U3 (E3 필요) → U4 (E4 필요) → I1 (전부) → D. 이른 시험판을 원하면 U4가 끝난 뒤 D를 먼저 해도 된다.

---

## 13. 구현 중 바뀐 것

- E0: §5.6에 반환값이 없던 `applyEventChoice` · `applyRelicChoice`는 `state`를 돌려준다. `settleMatch`는 `pendingMatch` · `matchResult` 검사를 자기도 한다 (finishMatch의 같은 검사는 그대로, `migrateRun`은 옛 공개 함수에만 남김). `buildRoster`는 `assertData`와 config 기본 편성 채우기를 포함하고 rng를 쓰지 않는다. `resolveMeeting`의 반환 `teamworkGain`은 `opts.teamwork === false`면 0.
- E1: `effects` 항목은 `{ "type": "heal", "to": "tap", "n": 20 }`처럼 `type` 필드로 종류를 적는다 (§4.3의 `hojo {n}` = `{ type: "hojo", n }`). `cards.json`의 `plus`는 공용 · 방침 · 고유 카드에 모두 명시하고, 코치 카드는 `plus`를 두지 않으며(해석 때 ×1.25), 대비 카드는 `plus: null`이다. `policies.json`은 §4.2 그대로(version 없음).
- E1: `resolveCardDef` 결과에서 `plus` · `bond80`은 "적용됐는가" 불리언이고, `costRate`(생략 시 `lesson.lesson.costRate`), `basePower` · `baseMods`(비용 계산용 원본 값), `desc`(강화판이면 `descPlus`)를 더한다.
- E1: `cards.js`에 계획 목록 밖의 export를 더했다 — `cardMode(state, def, stat)`(고유 카드 강화/지원 모드. 주인이 명단에 없거나 울리카 강화 모드에 파트너 후보가 없으면 지원), `tapCandidates` · `validateTaps` · `deadReason` · `staminaCost` · `roundCost` · `isOut` · `activePlayers` · `ownerOf` · `isPairCard` · `effectiveKind`. 결장은 `state.lesson.out`이 있으면 그것, 없으면 `injuredTurns > 0`으로 본다. `targetsFor(state, def, taps, { mode })`는 탭이 틀리면 throw한다.
- E1: 비용 반올림은 `roundCost(x) = Math.round(Number(x.toFixed(9)))` (부동소수 오차로 .5가 내려가지 않게). 코치 · 대비 카드 비용은 같은 식으로 계산해 cards.test에 적었다 (2-2-2: 하르나 12 · 셀리아 12 · 오르넬라 6 · 바르바라 9 · 한나 3 · 조이 24 · 이레네 17 · 루미 3 · 태클/인터셉트 8 · 버티기 12).
- E2: 방침 버프는 "읽는 쪽"을 `lesson.js`에 넣었다 — 호조 배율 · 집중 몫 · routine · perMood · perPress · 압박 비용 배율(방침 게이트 없음, §5.3.1 5번 그대로) · 방침 배율(§5.3.1 7번, run 방침이 맞고 T ≠ ∅일 때만) · 호조 −1 소비. 버프가 0이라 E2에서는 영향이 없다. "바꾸는 쪽"(버프 effects 11종 `BUFF_EFFECT_TYPES`, 방침 패시브 13번, 분위기 틱 · 감소, 쉬기 압박 회복, `chips`, 미리보기 `notes`)은 `applyBuffEffect` · `applyPolicyPassive` · `turnEndBuffs` · `restBuffs` · `buffChips` · `previewNotes` 빈 훅으로 남겼다 (E3가 채운다). 패시브 훅이 `play.consumed`(탈취를 썼는가)를 정하고, `play.buffsBefore`(카드 내기 전 버프) · `play.ctx.{usesSteal, allDefense, hasMF, pairCard}`를 읽을 수 있다.
- E2: lesson.js는 phase를 바꾸지 않는다. 상태를 바꾸는 호출은 `state.phase`가 있으면 `"lesson"`이어야 하고 `lesson.status === "playing"`이어야 한다. `startLesson`은 phase를 검사하지 않는다 (lessonRun이 레슨 시작 뒤 phase를 lesson으로 둔다).
- E2: LessonState에 §5.2 밖의 필드 2개 — `before`(레슨 시작 때 7명 스탯 스냅샷, §5.4.4가 말한 `lesson.before`) · `autoGains`({ 선수 id: 자율 훈련 상승 }). 뷰 `hand[]`에 `count`(범위 카드의 지금 대상 수, 지명 · 짝 · 고유는 1) · `exhaust`, `piles`에 `removed`를 더했다. `lessonResult`는 `{ stat, special, prep, score, target, cap, status, turns, turnReached, plays, rests, fails, injuries, twAccrued, endHeal, lumiFlag, outAtStart, out, perPlayer: [{ id, gain, sub, auto, targeted }] }`.
- E2: 쉬기의 "고른 선수"는 7명 중 아무나 (결장 선수도 — 탭 카드 D14와 같게). heal `all` · `endHeal` · 분위기 쪽은 출전 선수, 퍼펙트 체력 보너스만 7명 전원. `nextPct` · `nextPairPct`는 겹치면 더한다. 코치 카드 유대 +8은 `round(bond + 8 + bondGain)` (0~100). 죽은 카드 다시 뽑기 상한은 그 시점 손패 + 뽑을 더미 + 버린 더미 장수. 자율 훈련 상승은 성장률을 곱하지 않는다 (§5.3.3 식 그대로).
- E3: "탈취를 썼다"(`when: "consume"`, 전원 역습 팀워크 +2)는 역습형 패시브가 탈취 **1 이상**을 0으로 만들었을 때만이다 (T에 MF · FW가 있어도 탈취가 0이면 consume 아님). 방침 패시브(13번)는 모두 T ≠ ∅일 때만 돈다 (점유 −2 · 탈취 쌓기 · 압박 실패 리셋). 점유형 실패 시 가드는 점유가 0이어도 1 쓴다 (13번 글자 그대로).
- E3: 버프 effects 쌓는 법 — hojo · focus · mood · possGuard는 더한다 (mood는 상한 없음), steal · press · poss는 각 상한(4 · 3 · 8)까지 더한다, routine · noDecay는 max (하나 된 호흡을 겹쳐 내면 남은 턴을 다시 채울 뿐 더하지 않는다). 카드에 적힌 버프 effects · 분위기 틱 · 감소 · 라인 내리기 · 쉬기 압박 회복은 방침 게이트가 없다 (D38: 패시브만 게이트). 그래서 다른 방침에서도 수비 복귀 · 롱볼의 탈취는 쌓이지만 쓰이지 않는다. 라인 내리기 · 쉬기 압박 회복은 §5.3.1 · §5.3 표대로 출전 선수만 (초안의 "7명"이 아님).
- E3: 뷰 `chips[]` 항목에 `policy`(그 방침의 버프인가) 필드를 더했다. 순서 · 라벨은 `lesson.BUFF_CHIP_LABELS` (호조 · 집중 · 루틴 · 분위기 · 분위기 유지 · 탈취 · 압박 · 점유 · 점유 가드 · 다음 카드 · 다음 짝 카드 · 실패 없음 · 비용 0), 값은 "2장" · "3" · "+8" · "3턴" · "2/4" · "+40%" · "다음 1장". 방침 버프 키는 `policies.json`의 `buffs`에서 읽는다. 미리보기 `notes`는 대상 있는 카드에 호조 · 집중 · 루틴 · 압박 비용, 방침별(역습 "탈취 4 → ×2.6 (탈취를 모두 씀)" / "성공하면 탈취 +2", 점유 "점유 4 → ×1.2" · "실패하면 점유 6을 잃음" · "실패해도 점유 유지 (가드 1)" · "성공하면 점유 +1" · "점유 −2", 압박 "압박 3 → ×1.6" · "실패하면 압박 0"), 대상 없는 카드에 라인 내리기 · 분위기 ×2 결과를 적는다.
- E3: 66장 퍼즈 테스트는 별도 파일 없이 `test/lesson.test.mjs` 안에 둔다 (방침 5 × 시드 20 × 5종목 = 레슨 500회, 덱 = 대비 제외 63장 + 대비 3장 temp, 무작위 포메이션 · 강화 · 유대 · 체력 · 결장 · 컨디션 · 시즌 · modifier, 미르카를 넣은 편성 포함). 매 행동 뒤 JSON 왕복 · 체력/스탯/팀워크/유대 범위 · 버프 상한 · 더미 합 · 점수 = 종목 순증가 − 자율 훈련 · seq +1을 검사하고, 방침마다 66장이 모두 한 번 이상 나오는지, 고유 8장이 두 모드로 모두 나오는지 확인한다. `makeState`에 `squad` 옵션을 더했다.
- E4: 대비 카드(D10)는 **상대** 경계전 팀의 `opponentStyleHint().key`와 **상대** `tactics.shootTiming`으로 정한다. 지금 데이터로는 시즌1 태클×2, 시즌2 인터셉트+버티기(실버리프가 midrange), 시즌3 인터셉트×2다 (D10의 "시즌2 인터셉트×2, 시즌3 인터셉트+버티기"는 데이터와 반대라 데이터를 따른다).
- E4: 주 offer 굴리기 — 레슨 주 특별 = 5종목 중 1개 균등 + `special.secondChance`(0.5)로 나머지 중 1개 더, `specials`는 STATS 순서로 저장. 시즌 계획 = `freeWeek.guaranteed`를 섞어 `weekKinds`의 자유 주(2 · 4주)에 차례로. 자유 주 `actions` = [보장, …(pool − 보장)을 섞은 앞 2개]. 상담 진열 = pool 공용 · 내 방침 카드 중 균등 2장 + 마지막에 편성 코치 카드 1장(`specialtyRate` 가중).
- E4: 외출은 "그 선수 +20, 7명 +10"을 글자 그대로 — 고른 선수는 +20 뒤 전원 +10을 또 받는다 (합 +30). 유대 +5(같은 종목 클리어) · +15(코치 카드 획득)에는 `bondGain` modifier를 더하지 않는다 (레슨 중 +8에만 — lesson.js). 힌트 1개 더(`hintRate` modifier)는 그 값이 0보다 클 때만 굴린다.
- E4: `continueFlow`는 queue를 도는 동안만 내부 phase `"flow"`를 쓴다 (멈추는 phase에 닿지 못하고 queue가 비면 throw — 저장되는 상태에는 남지 않는다). `advanceWeek`는 `weekOffer`를 null로 비운다. `getWeekView`는 phase를 검사하지 않는다 (event · relic 배경용, offer가 없으면 `weekKinds`로 kind만).
- E4: lessonRun이 레슨 시작 때 `state.lesson.bondBefore`(코치 유대 스냅샷)를 더한다 — 보상 결과 `bond`(레슨 중 +8 + 같은 종목 +5)용. `pendingReward.result` = `{ stat, special, prep, score, target, cap, status, turns, turnReached, tp, sp, hints: [{ skillId, level, supportId, name }], teamwork, twAccrued, condition, prepBonus, bond: [{ id, name, gain, bond }], plays, rests, fails, injuries, perPlayer }` (`sp` = 힌트 후보가 없어 받은 SP). `getRewardView`에 `skipTp`, offer 항목에 `kind` · `uid`. `resolveReward`는 무료 강화를 고른 업그레이드 후보와 같은 uid에 쓰면 거절한다.
- E4: 카드 뷰(보상 · 상담 · 덱) = `{ uid, cardId, name, family, plus, bond80, targetKind, target, power, costRate, exhaust, desc, ownerCharId, coachType, supportId, canUpgrade, upgrade: { power, desc } | null }`. 뷰 추가 필드 — 주: `phase · weekKinds · policy · hints · record · lastMatchResult`, 선수 `mainStats` 등, 코치 `portraitColor · hintSkillIds`, 덱 `family`. 상담: stock `{ card, cardId, price, bought, affordable }`, `minDeck`, `players`, skills `{ skillId, name, kind, description, positions, baseCost, cost, level, affordable, eligiblePlayers }`. 준비: `status`. lessonRun은 run.js의 상수 · 헬퍼(STATS · FORMATIONS · DISTRIBUTION_TACTICS · normalizeTactics · opponentStyleHint · buildOpponentSnapshot …)와 `lesson.lessonResult`도 다시 내보낸다.
- E5: 감독 탭은 카드마다 후보 1벌만 본다 (모든 조합을 돌리지 않음) — 지명 · 짝 · 울리카 파트너 = 주 스탯 쌍 선수 먼저, 체력 높은 순 → 성장률 → 슬롯 (주 스탯 선수가 모자라면 나머지에서 같은 순서), tap 회복 · 쉬기 = 출전 선수 중 체력 최저 (슬롯 순서). "대상 평균 체력 < 40"은 출전 선수 평균으로 읽는다. 체력 40 미만 대상 감점은 비용 내기 전 체력 기준.
- E5: 버프 가치는 초안 `value()`를 `data.lesson.buffs` 상수(focusPer 6 · moodK 1.5 · stealPer 0.3 …)와 출전 인원으로 옮겼다. 초안에 없던 항목 — routine(지금 값보다 큰 몫만) · endHeal · lumiFlag · 음수 회복 · `when: success`는 (1−f), `when: consume`은 탈취를 쓸 때만. 탈취 · 압박 · 점유 쌓기는 run 방침이 맞을 때만 값이 있다. 방침별 한 줄의 poss는 가드가 있으면 실패 비용 poss×8을 더하지 않고, `possKeep` 카드에는 −min(2, poss)×8을 하지 않는다 (엔진에서 점유를 잃지 않으므로). press 줄 = 압박 ≥ 2 · 체력 40 미만 출전 선수가 있을 때 손패에 `cd_drop_line`이 있으면 그것, 없으면 restV × 0.5.
- E5: 주 고르기에서 특별 레슨이 둘이면 7명 합이 낮은 쪽. 레슨 주에는 특별이 늘 1개 이상이라(E4) "대응 종목"은 사실상 대비 주에, "주 스탯 합 최저"는 대응 종목이 목록에 없을 때만 쓰인다. 미팅 추천은 전술을 바꾸지 않는 `{ type: "meeting" }`.
- E5: 보상 — 덱 > 20이면 "add" 후보만 건너뛰고 고유 강화(upgrade) 후보는 고른다 (덱이 늘지 않으므로). 같은 순위면 강화판 → 번호 순. 무료 강화는 고른 upgrade 후보와 같은 uid를 피한다. 상담 — 스킬은 배울 수 있는 첫 선수, 구매는 방침 카드 먼저 그다음 코치, 강화 · 삭제는 TP가 가격 이상일 때만.
- E5: `autoStep`은 `{ phase, action }`을 돌려준다 (finished면 action null, 상태 그대로). match phase에 `playMatch`가 없으면 throw, event phase는 0번 선택. `lesson_sim`: 시드는 `${seed}-${i}`, `--no-match`는 홈 1:0 승, 기본이 아닌 `--formation`은 기본 편성 7명을 슬롯 순서대로 새 슬롯에 놓는다, 레슨 시간 추정은 행동(카드 · 쉬기 · 턴 끝) 1번당 6초 가정.
- AUDIT: `getPrepView.prepBonus`는 이번 시즌 대비 레슨 클리어 modifier(`source: "prepLesson"`)만 본다. 전에는 `getModifier(goalMatchCondition) > 0`이라 유물 '낡은 주장 완장'만 있어도 "대비 레슨 클리어" 표시가 켜졌다 (경기 컨디션 계산은 그대로).
- AUDIT: 코치 카드 `bond80`에 `desc` · `descPlus`(유대 80판 문구)를 더했다. `resolveCardDef`는 유대 80이면 이 문구를 쓴다 (`BOND80_FIELDS`에 desc · descPlus 추가). 전에는 유대 80판에서도 기본 문구가 나와 하르나 "마지막 턴" · 한나 "+5" · 이레네(추가 사용 없음) · 위력 숫자가 실제 효과와 달랐다. 유대 80 + 강화판 위력은 round(bond80 power × 1.25) (오르넬라 · 바르바라 63, 조이 60, 루미 45, 셀리아 30).
- AUDIT: 66장 표 테스트 `test/cardEffects.test.mjs`(카드마다 기본판 · 강화판, 고유 두 모드, 코치 같은 타입 ×1.3 · 유대 80판, 대비 종목 배율, 방침 게이트)와 규칙 테스트 `test/lessonRules.test.mjs`(10.1 키 매핑 · D30 · D5/D6 턴 끝 틱 퍼펙트 · D22 대비 레슨 부상 · prepBonus · 뷰 rng 불변)를 더했다. 엔진 수치 · 규칙은 바꾸지 않았다.
- U1: `store.loadRun`은 엔진을 정적으로 불러오지 않으려고(엔진 로드가 실패해도 시작 화면은 뜬다) 같은 검사 사본 `isLessonRunSave`(kind · version · phase)를 store.js에 두고, outgame.test가 `lessonRun.isLessonRun`과 같은지 확인한다. `continueRun`은 엔진 `isLessonRun` + `migrateLessonRun`도 부른다. `actions.doAction`은 `weekAction`으로 바뀌었다.
- U1: 아직 없는 화면(week · lesson · reward · consult · prep)은 계획의 파일 이름 그대로 "임시 화면"(배지 표시)으로 만들었다 — 기본 버튼 + 감독 추천으로 15주를 끝까지 진행할 수 있다. U2~U4가 같은 파일을 덮어쓴다. `screens/training.js`는 라우팅에서 빠져 U2가 지울 때까지 쓰이지 않는다. outgame.test의 훈련 · 미팅(보드 드래그) 검사는 주 선택 검사로 바꿨다 — 미팅 드래그 검사는 U2의 meetingEditor가 되살린다.
- U1: 편성 옆 열에 방침 패널이 들어가도 코치 칩 8장이 스크롤 없이 보이게 lesson.css에서 전술 4개를 2×2(이름 위 · 선택 아래)로 바꾸고 칩 · 패널 여백을 조였다. 편성의 "서포트 카드" 패널 이름은 "코치"로 바꿨다.
- U1: `tools/lesson_scenarios.mjs`(walkLesson + 임시 화면 시나리오 og_week_lesson · og_week_free · og_week_prep · og_lesson_temp · og_reward_temp · og_consult_temp · og_prep_temp)를 먼저 만들어 scenarios.mjs `OUTGAME_SCENARIOS`에 붙였다. 경기 시나리오 01~27과 옛 og_*(훈련 · 미팅 · 이벤트 · 유물 · 루트 · 결과 · 도전 등록 팀)는 아직 옛 run.js 상태라 레슨판 `loadRun`이 거절한다 → shot.mjs에서는 "이어하기"가 없어 실패한다 (jsdom 테스트는 store.run에 직접 넣으므로 그대로 통과). I1이 `prepareRun` · `walkRun`을 레슨 런으로 옮긴다.
- U1: ui.smoke는 jsdom 저장소에만 본편 키('soccer.run' · 'soccer.teams')를 흉내 내 넣고, 레슨판이 그것을 읽지도 바꾸지도 않는지 확인한다 (앱 · 도구 코드는 본편 키 문자열을 쓰지 않는다 — outgame.test가 검사).
- U2: 미팅 · 준비 편집기의 "고유 카드 모드 변경" 표시를 위해 `lessonRun.js`가 `cards.mainStatsOf`를 다시 내보낸다 (`export { mainStatsOf } from "./cards.js"`, 동작 변경 없음 — outgame.test가 같은 함수인지 확인). 표시 조건 = 덱에 그 선수의 고유 카드가 있고, 옮긴 자리의 주 스탯 쌍이 지금 자리와 다를 때 (GK ⇄ DF는 같아서 표시 없음).
- U2: 대비 카드 미리보기는 U3의 `miniCard`가 아직 없어 주 화면 안의 작은 카드(`.prep-mini`: 이름 · 문구)로 그린다. 대비 주 종목 카드에는 그 종목에서 ×1.5가 붙는 대비 카드 수를 적는다. 레슨 카드 아래에 "고유 카드 강화" = 그 종목이 주 스탯 쌍이라 고유 카드가 강화 모드인 선수 얼굴을 붙였고, 주 화면 아래쪽에 시즌 일정 줄(1~5주 종류 · 보장 행동 · 경계전)을 더했다. 턴 수는 종목마다 같아서 머리 줄에 한 번만 적는다.
- U2: 무료 외출(온천)은 1주차 = 레슨 주라서 행동 카드가 아니라 아래 줄 버튼(`.free-outing`)으로 둔다. U1 임시 화면의 [감독 추천대로] 버튼은 지웠다 (§5.5 — 추천 배지만, 이유는 배지 title). 외출 모달은 modal-md 1열(선수 7명, 체력 → 외출 뒤 값).
- U2: 옛 훈련 · 미팅 스크린샷 시나리오(og_training · og_training_mid · og_train_sheet · og_meeting · og_meeting_drag · og_meeting_drop, 옛 run.js 상태)를 scenarios.mjs에서 지우고 lesson_scenarios.mjs에 레슨 런 판(og_week_hotspring · og_outing · og_meeting · og_meeting_drag · og_prep · og_prep_swap)을 더했다. og_prep_temp는 og_prep로 바꿨다. 미팅 · 준비의 작은 슬롯 카드는 "체력 100 · 수피"가 잘리지 않게 폭 122 → 134px (lesson.css `.meeting-board` 범위만).
- U3: 레슨 화면 dock = 더미 84 | 손패 1fr(≈648, 4장부터 겹침 · 마우스를 올린 카드가 맨 앞) | 안내 336 | 버튼 132. 미리보기 노트(`.cf-notes`)는 카드 위 팝이 아니라 dock 안내 칸에 둔다 (경기장 아래쪽 토큰을 가리지 않게). dock 의 [기록] 버튼은 뺐다 (주 화면에 있다). 오른쪽 "이번 레슨" 명단 줄도 토큰과 같은 탭 대상이다. `store.lessonUi.restPick`(쉬기 대상 고르는 중)을 더했다.
- U3: 훈련 지점(`lesson_layout.drillSpot`) — 7명이 토큰 · +N 팝과 겹치지 않게 §6.3 표를 조금 넓혔다: 슈팅 · 수비는 4명까지 한 줄(슈팅 반원), 5명부터 엇갈린 두 줄(슈팅 x 81 · 90, 수비 x 18 · 27), 드리블 x 57–78, 피지컬 y 9 / 91. 훈련 중에는 대상의 이름표를 숨기고 다른 선수를 옅게 한다. 대상이 3명 이상이면 +N 팝에 부 스탯을 적지 않는다.
- U3: 연출 = `lesson_layout.fxPlan(lastFx)` 단계(카드 · 턴 끝 · 레슨 끝) + `LESSON_T`(move 300 · hold 520 · back 300 · tick 650 · end 1000ms). prefers-reduced-motion 이면 타이머 0 (lessonUi.test 가 이것으로 빨리 돈다). 연출 중에는 턴 표시를 턴 끝 단계까지 이전 턴으로 둔다. 카드 앞면은 고유 카드 문구 "강화: … / 지원: …" 중 지금 모드 쪽만, 범위 카드 위력 "합계 N → 1인 n"(뷰 `count`), 비용은 1인당. 보상 · 상담 카드 뷰(cost 없음)는 "체력 −위력×0.6".
- U3: 도구 — shot.mjs 조작 단계에 `{ freeze: false|true }`(연출 중간 찍기) · 함수형 `steps(prepared)` · 시나리오 `query`(URL 파라미터, 예: `?autolesson=1`), 잘림 검사에 `.card-face .cf-name · .cf-desc · .cf-power · .cf-target`. scenarios.mjs `buildScenarioState`가 build 의 `info`를 넘긴다. og_lesson_temp → og_lesson · og_lesson_pick · _aim · _pair · _mid · _tired · _rest · _injury · _fail · _turnend · _end · _hand4 · _auto + 방침 5 (_ace … _poss). 부상 · 실패 장면은 걸어서는 거의 안 나와서 체력 30 으로 낮춘 상태에서 rng 상태를 바꿔 찾는다 (결정적).
- U4: `getRewardView`에 `deck`(덱 전체 카드 뷰 — 무료 강화 그리드 · "강화 후" 미리보기용, 순수)을 더했다 (lessonRun.test 퍼펙트 항목이 uid 순서 · `canUpgrade` = `upgradable` · 강화 후 위력을 확인). 엔진 동작은 그대로.
- U4: 보상 모달 — 고르기(카드 · 건너뛰기 타일 · 무료 강화 카드)는 모달 안 상태로만 바뀌고 [확인] 1번에 `resolveReward`를 부른다. [확인]은 카드나 건너뛰기를 고른 뒤에만 켜지고, 무료 강화는 안 골라도 되지만 "고르지 않으면 사라집니다"를 띄운다. 추천(`recommendReward`)은 배지만 붙이고 미리 고르지 않는다. 보상으로 강화하는 카드는 무료 강화 그리드에서 꺼진다. 선수 7 칩 = 종목 상승(+자율 훈련) · 부 스탯.
- U4: 상담 — 머리 줄은 주 화면 상단 바 대신 `og-head`(TP · SP · [상담 끝내기]). U1 임시 화면의 [감독 추천] 실행 버튼은 지우고 추천 배지만 둔다 (진열 · 덱 카드 "추천 강화/삭제" · 스킬 · 끝내기). `store.consultUi.skillPick`({ 스킬: 배울 선수 })을 더했다 (새 상담 · 끝내기에서 비움). 진열 카드는 0.8배(141×164 래퍼 + transform). 고유 카드 삭제는 `confirm()` 대신 확인 모달(modal-md). 스킬 6개 이상이면 설명 줄을 빼고(.compact) 9개 이상이면 더 조인다(.tight). 편성 코치의 힌트 스킬 중 아직 힌트가 없는 것은 회색 칩(힌트 스킬 4개 이하일 때, 넘으면 개수만). 덱 그리드에서 고유 카드의 둘째 줄은 문구 대신 "○○ 고유 카드".
- U4: 스크린샷 og_reward_temp · og_consult_temp → og_reward_clear · og_reward_pick · og_reward_perfect(점수 = 퍼펙트 − 1 주입 후 엔진에서 범위 카드, `perfectRewardState` export) · og_reward_fail · og_consult · og_consult_pick · og_consult_delete · og_consult_full(힌트 7 · 덱 24 · TP/SP 주입).
- I1: `prepareRun`(경기 시나리오 01~27) = `lesson_scenarios.prepareLessonMatch` — friendly 는 친선전이 열린 첫 자유 주에서 친선전을 고르고(감독 AI 선택과 무관), goal 은 감독 AI 그대로 첫 경계전까지. scenarios.mjs 의 `run` 은 lessonRun.js (옛 run.js 의 walkRun · policyStep · describeRun 은 지웠다). `OUTGAME_SCENARIOS` 는 lesson_scenarios.mjs 에서 다시 내보내지 않고 scenarios.mjs 에 그대로 두되(시작 · 편성 · 도전 모드) 등록 팀은 `lessonRegisteredTeam`(감독 AI 완주 레슨 런, 역습형 · 팀형) + `...LESSON_OG_SCENARIOS`. og_event · og_relic · og_route · og_result 는 lesson_scenarios.mjs 로 옮겼다 — og_event 는 1차에 이벤트가 없어 자유 주에 유대 60 서포트 이벤트(선택지 2개 이상)를 `run.fireEvent` 로 주입하고 queue 에 advanceWeek 를 남긴다 (2차 라우팅 확인용).
- I1: `27_df_block_cutin` — 레슨 런 팀은 실루엔 게이지가 함께 차서 메테오 슛이 합체기(컷인 2개)가 되어 2.85초 캡처가 이름 카드에 걸렸다 → `adjustSetup` 으로 바람의 실을 빼고 혼자 쓰는 필살 슛만 require, 시나리오 `maxSeeds: 1000`(buildScenarioState 가 읽는다, seed 465). `17_skill_row_many` 의 스킬 묶음 안쪽 스크롤은 의도라 `allowInnerScroll: /skill-row/`. 11 · 15 는 옛 run.js 때도 선호 조건 대체(fallback)였다.
- I1: shot.mjs 잘림 검사에 `.cf-reason` · `.mini-card .mc-name` · `.rw-pl-nm` · `.policy-desc` · `.ls-nm b` · `.lesson-screen .tok-name` 를 더하고, HUD 겹침(떠 있는 토스트 ↔ `.lh-score` · `.lh-pips`) 검사와 요약 끝 "검사 걸림" 줄을 더했다. 스크린샷에서 고친 것: 레슨 명단 이름 "도르비나" 끝 글자 잘림 → `.ls-row` 체력 칸 62 → 54px · 이름 말줄임, 무료 강화 그리드의 추천 배지가 카드 이름을 가림("물결 세이...") → 배지를 아래 줄(문구) 오른쪽으로(촘촘한 그리드는 위 테두리), 상담 덱 "추천 강화/삭제" 배지 자리 58px.
- I1: 결과 화면(§3.4 에서는 손대지 않는 파일)의 선수 줄 "훈련 N회" 는 레슨 런에 훈련 횟수가 없어 늘 0 이라 레슨 런(`state.kind === "lessonRun"`)이면 뺐다 (옛 런 표시는 그대로).
- I1: ui.smoke 전체 걷기는 `manager.autoStep` 대신 감독 AI 추천을 **앱 actions** 로 보낸다 (weekAction · lessonCall · resolveReward · consultAction/endConsult · confirmPrep · finishMatch · chooseRelic · chooseRoute) — phase 가 바뀔 때마다 그 화면이 그려졌는지 확인. 경기는 경기 화면이 만든 경기(같은 seed)를 쓰지 않고 같은 셋업으로 실제 match.js `simulateAuto` 결과를 `finishMatch` 에 넘긴다. 레슨이 끝나면(연출 대신) 직접 `render()`.
- 플레이 점검(브라우저 한 판, `/soccer/lesson/` 경로로 서빙): 보상 · 상담 · 덱 카드 앞면의 비용 "체력 −위력×0.6" → 선수 배치로 센 실제 1인 비용(`js/ui/cards.js estimateCost` = 엔진 `staminaCost`와 같은 값, 강화 전 기본 위력 · 범위 인원, lessonLayout.test 확인)과 범위 카드 "합계 N → 1인 n". 고유 카드 강화 모드에서 위력 줄과 같은 문구("주인 53")는 한 번만. 레슨 더미 보기의 고유 카드 둘째 줄 = "○○ 고유 카드". 카드를 고르기 전 [내기]는 회색. 외출 모달은 전원 체력 100 · 컨디션 최고면 "효과가 없습니다"를 띄운다. 상담 스킬 로그 "○○ 이(가) … 습득" → "○○ — '…' 습득" (로그 문구만).

---

## 14. 구역 방식 개편 (L32~L36)

> 상태: 구현 계획 · 2026-10-04 · 브랜치 `outgame-lesson`. 기준: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L32~L36 (사용자 결정 2026-10-04: 구역 5곳 · 서 있는 구역 기준 · 원은 자유 배치 · 벤치로 끌어내기 · 짝 카드는 작은 원 · 기본 훈련 약 3분의 1).
> 수치 근거: 구역 모델 보정 시뮬 (스크래치패드 `zone_sim.mjs`, 2-2-2 방침 5개 × 400런 — §14.18). 밸런스 조정이 아니라 **출발점**이다.
> 표기: **[가정]** = 기획자가 아직 정하지 않아 기본값을 쓴 것 (기획자 확인 대상). **[구현 결정]** = 이 계획이 정한 구현 세부. 둘 다 §14.20에 모았다.
> 이 절은 §4 · §5 · §6.3 · §9 · §10 · §12의 해당 부분을 **대신한다**. 여기 적지 않은 것(주 흐름 · 보상 · 상담 · 경기 · 저장 키 · 배포)은 앞 절 그대로다.

### 14.0 한눈에

| 바뀌는 것 | 예전 (L5 · L7 · L13 · L14 · L15 · 자율 훈련) | 구역 방식 |
|---|---|---|
| 무엇이 오르나 | 레슨 종목 하나 (L7) | 선수가 **서 있는 구역**의 스탯 (L33) |
| 레슨 주에 고르는 것 | 종목 | **중점 구역** 1곳 (서 있을 확률 ×2 · 상승 ×1.5) [가정] |
| 선수 자리 | 배치 자리에 고정 | **매 턴 시작**에 포지션 가중치로 5구역에 흩어진다 (L32) |
| 카드 없이 크는 것 | 레슨 끝 자율 훈련 (대상이 안 된 선수 × 0.35) | **기본 훈련**: 매 턴 끝 구역에 선 모두가 조금씩 (L34) |
| 대상 지정 | 범위(라인 · 공격진 · 수비진 · 전원) · 지명 탭 · 짝 탭 · 고유 | **끌어다 놓기**: 단일 · 원(작은 · 중간 · 큰) · 전체 · 주인 (L35) |
| 범위 위력 | 카드 합계 ÷ 대상 수 | **1인 위력** — 원 안 인원이 많을수록 합계가 커진다 [가정] |
| 쉬기 | 턴 전체를 쓰는 [쉬기] (1명 +20, 나머지 +5) | 지친 선수를 **벤치로 끌어낸다** — 그 선수만 쉬고 턴 끝 +15 (L36) |
| 고유 카드 | 두 모드 (L13) | 주인 1명 단일 · 주인이 자기 주 스탯 구역에 서 있으면 ×1.5 · 캐릭터 효과는 늘 [가정] |
| 레슨 점수 | 종목 스탯 순증가 | 7명의 **구역 스탯 상승 전부** (기본 훈련 + 카드, 실패 −5 포함) [가정] |

바뀌지 않는 것: 손패 3장 · 1장 내기 · 추가 사용 · 다음 턴 손패, 체력 비용 · 실패율 표 · 카드 1장에 실패 판정 1번(L16) · 부상 · 결장, 방침 5개와 버프 이름, 코치 · 유대 · 힌트 · 보상 · 상담 · TP/SP, 15주 흐름, 경기 쪽 파일 전부(§0).

### 14.1 핵심 수치 (보정 시뮬 → 데이터 키)

| 손잡이 (시뮬 env) | 값 | 데이터 키 (`data/lesson.json`) | 뜻 |
|---|---|---|---|
| BASE | 3.2 | `lesson.base.gain` | 기본 훈련 1인 1턴 = 3.2 × 그 구역 성장률 × 구역 배율 × 컨디션 × (1 + 훈련 효율) |
| BC | 1 | `lesson.base.stamina` | 기본 훈련 체력 1인 1턴 |
| GS 0.32 | **0.64** | `lesson.cardGainScale` | 시뮬 GS는 "처음 위력"(문서 위력 × 2) 기준. 문서 위력 기준으로는 카드 상승 ×0.64 (지금 엔진 = ×1) |
| CR / UCR 0.30 / 0.20 | 0.6 / 0.4 | `lesson.costRate` · `lesson.unique.costRate` | 지금과 같다. 비용 = 1인 위력 × 비용률 — 배율을 곱하기 **전** 위력 기준이라 체력 비용 절대값은 그대로 |
| RS · RM · RL · RA | 1.0 · 0.45 · 0.35 · 0.17 | (카드 데이터에 반영) | 1인 위력 = 짝 위력 × 1.0 / 예전 1라인 합계 × 0.45 / 2라인 합계 × 0.35 / 전 라인 합계 × 0.17 (§14.9) |
| BR | 15 | `lesson.bench.recover` | 벤치 회복, 턴 끝 |
| BT | 25 | (감독 AI 상수) | 체력 25 미만이면 벤치 후보 |
| 중점 구역 | ×1.5 · 특별 ×2.0 · 서 있을 가중치 ×2 | `lesson.focus` | §14.10 |
| 분위기 | 1스택 = 기본 훈련 +0.96 | `buffs.moodK` 1.5 × `cardGainScale` | 시뮬 코드 그대로 (`moodK 3 × GS 0.32`). 보정 보고문의 "+1.5"는 GS 0.5 기준 표기이고, 지표는 0.96으로 나왔다 [구현 결정] |
| 고유 카드 | 35 (강화 44), 주 스탯 구역 ×1.5 | 카드 `power` · `lesson.unique.mainMult` | 시뮬 70 × GS → 문서 단위 35 |
| 목표 · 상한 | 430/520 · 510/620 · 600/730 | `lesson.targets` | 시즌 1 · 2 · 3 (§14.12) |
| 특별 | 목표 ×1.15 · 상한 ×1.2 | `lesson.special` | 보정 권고 (×1.3이면 특별 목표가 특별 p30보다 높아진다) [가정] |

보정 결과 요약 (2-2-2, 방침 5개 범위): 런당 성장 6,333~6,859 · 기본 비중 33.4~35.4% · 부상 1.16~1.42 · 실패 2.28~2.81 · 벤치 3.3~7.7회/런 · 주 휴식 2.9~3.6 · 팀워크 에이스형 72, 나머지 96~108. 기준 6개 중 **(3) 고르게 크기만 미달** (가장 덜 큰 선수 / 가장 많이 큰 선수 주 스탯 0.54~0.56, 기준 0.60) — 원인과 기획자가 정할 것은 §14.20.

### 14.2 경기장 구역 배치

**좌표계.** 레슨 화면의 필드 좌표를 그대로 쓴다 (`lesson_layout.js` · `tokenSpot`과 같다). `x` = 가로 % (우리 골 0 → 상대 골 100), `y` = 세로 % (위 터치라인 0 → 아래 100), 필드 요소 안 픽셀 = `(x/100·W, y/100·H)`.
- `layout.js`와의 관계: 레슨 좌표 `(x, y)`는 경기 필드 좌표 `(x_f = y, y_f = x)`를 `fieldToScreen(x_f, y_f, W, H, "land")`로 그린 점과 같다 (`sx = y_f/100·W = x/100·W`, `sy = x_f/100·H = y/100·H`). 역변환은 `screenToField`와 같다. 그래서 구역 중심의 경기 구역 의미도 맞는다 — 수비 x 20 = 우리 진영(16~40), 패스 x 50 = 중원(40~60), 슈팅 x 80 = 상대 진영 끝(60~84, 박스 바로 앞).
- **거리 단위 u** = 필드 폭의 1%. 세로 % 차이는 `aspect`(= H/W = 392/968 = 0.405)를 곱해 u로 바꾼다: `distU(a, b) = hypot(a.x − b.x, (a.y − b.y) × aspect)`. 원은 화면에서 동그랗다 (`rx = r·W/100`, `ry = (r/aspect)·H/100` — 측정한 W · H로 그리면 화면 비율이 조금 달라도 엔진 판정과 같은 모양).
- `aspect`는 데이터 상수다 (엔진은 DOM을 모른다). 무대가 통째로 늘고 줄기 때문에(stage scale) 1280×720 비율에서는 늘 0.405다.

**구역 중심과 반지름** (`lesson.json zones`, 모두 [구현 결정] — 보정 시뮬의 "위 [수비][패스][슈팅] / 아래 [피지컬][드리블]"를 경기장 의미에 맞게 놓은 것)

| 구역 | 중심 (x, y %) | 픽셀 (968×392) | 이웃 (중심 거리 u) |
|---|---|---|---|
| 수비 `defense` | (20, 30) | (194, 118) | 피지컬 22.7 · 패스 30 |
| 패스 `pass` | (50, 30) | (484, 118) | 피지컬 22.7 · 드리블 22.7 · 수비 30 · 슈팅 30 |
| 슈팅 `shoot` | (80, 30) | (774, 118) | 드리블 22.7 · 패스 30 |
| 피지컬 `physical` | (35, 72) | (339, 282) | 수비 22.7 · 패스 22.7 · 드리블 30 |
| 드리블 `dribble` | (65, 72) | (629, 282) | 패스 22.7 · 슈팅 22.7 · 피지컬 30 |

- 패스 구역이 가운데 허브다 (4곳과 이웃) — 점유형의 "패스 구역을 거친다"와 맞는다. 시뮬의 이웃 6쌍에 패스–피지컬 1쌍이 더해졌다.
- 수비–드리블 · 슈팅–피지컬 · 수비–슈팅은 48~60u라 큰 원 하나로 잡을 수 없다.

**모여 서기 (huddle).** 한 구역에 n명이 서면 중심 둘레 반지름 R의 원형 대형이다. 순서는 슬롯 순서.

```
R = zones.huddle[min(n, 5) − 1]          // [0, 3.5, 4.5, 5.5, 6.5] u
n = 1 → (0, 0)
n = 2 → i = 0 왼쪽 (−R, 0), i = 1 오른쪽 (+R, 0)
n ≥ 3 → 각 = −90° + 360°·i/n (위에서 시계 방향), (R·cos, R·sin)
위치 = { x: c.x + dx, y: c.y + dy / aspect }   (소수 1자리 반올림)
```

- 이웃 토큰 간격은 n = 2 · 3 · 4 · 5 · 7에서 68 · 75 · 75 · 74 · 55px로 토큰(40px)이 겹치지 않는다. 위 줄 대형의 위끝은 y 14%(55px), 아래 줄 대형의 아래끝은 y 88%(345px)라 이름표까지 필드 안에 든다.
- **L52 (§23)**: `zones.jitter` 가 있으면 이 대형을 턴 · 구역마다 흔든다 (돌리기 · 반지름 × 0.85 ~ 1.25 · 선수마다 비낌, 간격 ≥ 4.8u · 중심에서 ≤ 6.6u). 위 대형과 아래 원 크기 표는 `jitter: null` 일 때 (예전 대형) 그대로이고, 흔들린 대형에서 지키는 약속 · 운이 된 약속은 §23.5.

**원 크기** (`zones.radius`, u) [가정 — 브리프의 "작은 ≈ 2명 · 중간 ≈ 한 구역 · 큰 ≈ 이웃 두 구역"을 이 배치에 맞춘 값]

| 크기 | r (u / px) | 이렇게 놓으면 |
|---|---|---|
| 작은 원 `small` | 4.2 / 41 | 같은 구역의 이웃한 두 명 사이 → 2명. 한 명 위 → 1명. 구역 중심 → 0명 (3명 이상 대형). 다른 구역에는 닿지 않는다 |
| 중간 원 `medium` | 9 / 87 | 구역 중심 → 그 구역 전원 (대형 R ≤ 6.5). 이웃 구역 선수는 16.2u 이상 떨어져 있어 들어오지 않는다. 두 무리 사이에 놓으면 양쪽 가장자리 선수를 1명씩 잡을 수 있다 (무리 사이 최소 9.7u) |
| 큰 원 `large` | 17 / 165 | 22.7u 이웃 두 구역의 가운데 → 두 무리 거의 전원, 세 번째 구역은 24u 밖이라 들어오지 않는다. 30u 이웃 쌍은 가까운 쪽 선수만 |
| 전체 `all` | — | 어디에 놓아도 경기장(벤치 · 결장 제외) 전원 |

- 판정: 선수 토큰 **중심**이 `distU(위치, 놓은 점) ≤ r`이면 원 안이다 (경계 포함, 오차 1e-9). 원 그림의 테두리와 같은 선이다.
- 자유 배치(사용자 결정 3) — 구역에 붙이지 않는다. 놓은 점은 필드 안 `[0,100]²`로 자른다.
- 단일 카드: 놓은 점에서 `zones.pickR` = 3u(29px — 토큰 반지름 20px + 여유) 안의 **가장 가까운** 대상 후보 선수. 같으면 슬롯 순서.
- 사람이 원을 잘 놓으면(예: 패스 · 피지컬 · 드리블 세 중심의 무게중심에 큰 원) 세 구역에서 몇 명씩 잡을 수 있다. 시뮬은 "이웃 두 구역 전원"으로 근사했다 → 사람 상한은 프로토타입에서 본다 [검증].

### 14.3 턴 흐름

```
레슨 시작  중점 구역 · 특별 · 목표 · 상한 → 결장 · 고유 카드 제외 · 대비 카드 → 섞기 → 턴 시작
턴 시작    ① 벤치 비우기 ② 흩어지기 (rng) ③ 3 + drawNext장 뽑기 (rng) ④ 죽은 카드 다시 뽑기 (rng) ⑤ playsLeft = 1
행동       아무 순서로: 카드 끌어다 놓기 (playCard) · 벤치로 / 벤치에서 (benchPlayer) · [턴 끝]
턴 끝      ① 기본 훈련 (분위기 몫 포함) ② 벤치 회복 +15 ③ 분위기 감소 ④ 퍼펙트 판정 ⑤ 손패 버리기 ⑥ 마지막 턴이면 레슨 끝, 아니면 턴 시작
레슨 끝    한나 endHeal → 결과 판정 (퍼펙트 체력 보너스) — 자율 훈련 없음
```

**흩어지기 (`scatterZones`, 엔진 lesson.js, rng 사용)**

```
lesson.bench = []
lesson.zones = {}
for p of state.players (슬롯 순서):
  if p가 out이면 건너뛴다 (경기장에 없음)
  pos = p의 배치 포지션 (GK | DF | MF | FW — 슬롯에서)
  w(z) = config.training.slotWeights[pos][z] × (z == lesson.zone ? lesson.focus.weight : 1)    // weight 2
  lesson.zones[p.id] = rng.weighted(ZONE_IDS, w)     // ZONE_IDS = STATS 순서 [shoot, dribble, pass, defense, physical]
```

- 선수 1명당 `rng.next()` 1번이다. 같은 rngState면 같은 배치다.
- 결과는 `lesson.zones`에 저장한다. 위치(huddle)는 저장하지 않고 `zones`에서 매번 계산한다 (`zones.js` — 순수).
- 가중치는 `config.json training.slotWeights`를 그대로 읽는다 (config는 바꾸지 않는다, §3.4). GK 가중치 조정 여부는 기획자 결정 (§14.20 Q1).
- **죽은 카드** (턴 시작에만 버리고 다시 뽑음, 예전 D45와 같은 상한): 대상 후보가 0명인 대상 카드 — 경기장 선수가 0명(모두 결장), `onlyZones` 단일(마무리 일격)인데 슈팅 · 드리블 · 패스 구역에 아무도 없음. 원 카드는 경기장에 1명이라도 있으면 죽지 않는다. 주인 카드는 주인이 결장이면 이미 `removed`다.
- 행동 중에 낼 수 없게 된 카드(주인을 벤치로 보냄, 마무리 일격 후보를 모두 벤치로 보냄)는 버리지 않고 손패에 남아 `playable: false`다.
- [턴 끝]은 카드를 내지 않아도 누를 수 있다 [구현 결정] — 기본 훈련이 늘 있으므로 "이번 턴은 그냥 넘긴다"가 정당한 선택이다 (예전 D15의 "1장 이상 낸 뒤에만" 폐지). 남은 추가 사용은 버린다.

### 14.4 기본 훈련 (L34)

턴 끝 ①. 경기장에 선 선수(결장 아님 · 벤치 아님)마다:

```
unit = base.gain + mood × buffs.moodK × cardGainScale            // 3.2 + 0.96 × 분위기
g    = round(unit × growth[zone] × zoneMult(zone) × condition.trainingMult[condition] × (1 + Σ trainingEfficiency))
zoneMult(z) = z == lesson.zone ? (lesson.special ? focus.specialMult : focus.mult) : 1     // 2.0 / 1.5 / 1
stats[zone] += g (1000에서 멈춤),  score += 실제 오른 양,  stamina −= base.stamina (0에서 멈춤)
```

- 부 스탯은 없다. 대상 횟수(`targeted`)에 세지 않는다. 실패 · 부상 판정이 없다 (L34).
- 분위기 몫은 기본 훈련에 얹는다 — 예전 "분위기 틱"을 대신한다. 결과 화면 · 시뮬에서는 분위기 몫을 카드 쪽으로 센다 (`baseGains`에는 `round(g × base.gain / unit)`, 나머지는 `moodGains`).
- 컨디션 · 훈련 효율을 곱하는 것은 [구현 결정] (카드 상승과 같게. 시뮬은 둘 다 1로 봤다).
- 연출: `{ t: "base", id, stat, n }`, 체력 `{ t: "cost", id, n: 1, src: "base" }`.

### 14.5 벤치 (L36)

`benchPlayer(state, data, { playerId, on })` — rng를 쓰지 않는다. seq +1, `lastFx = [{ t: "bench", id, on }]`.

| 규칙 | 값 |
|---|---|
| 언제 | 레슨 진행 중, 그 턴의 아무 때 (카드를 낸 뒤에도) [구현 결정] |
| 누구 | 결장이 아닌 선수. 이미 벤치면 `on: true`는 오류 |
| 최대 | 한 턴에 `bench.max` = 2명 [가정 — 시뮬 감독 AI의 한도. 7명을 모두 벤치에 두면 턴당 체력 +105라 한도를 둔다] |
| 효과 | 이번 턴 기본 훈련 없음 · 카드 대상이 될 수 없음(원 · 전체 · 단일 · 주인 모두) · 턴 끝 ② 체력 +`bench.recover`(15) |
| 되돌리기 | `on: false` → 이번 턴 자기 구역(`zones[id]`, 바뀌지 않음)으로 돌아간다. 턴 끝 전이면 언제든 |
| 다음 턴 | 턴 시작 ①에서 벤치를 비우고 ②에서 다시 흩어진다 |
| 회복 카드 | 쿨다운 · 아이싱 · 숨 고르기(단일 회복)는 벤치 · 결장 선수에게도 낼 수 있다 [구현 결정 — 예전 D14와 같게, 훈련이 아니므로] |
| 방침 | 벤치는 방침 버프를 바꾸지 않는다. 예전 "쉬기 → 압박 0 · 내린 단계당 +4"와 "쉬기 턴 분위기 −2"는 없어진다 [가정 — 시뮬과 같음]. 압박을 내리는 길은 라인 내리기 카드뿐 |

- 체력 회복은 벤치 · 주 휴식 · 회복 카드 · 퍼펙트 · 외출이다. 시뮬에서 주 휴식이 런당 약 1번 늘었다 (기본 훈련 체력 1 때문, §14.18).

### 14.6 대상 모델 · 판정

| `target.kind` | 놓는 법 | 대상 T | 인자 |
|---|---|---|---|
| `single` | 선수 위에 | 놓은 점에서 pickR 안 가장 가까운 후보 1명. 후보 = 경기장 선수(벤치 · 결장 제외), `onlyZones`가 있으면 그 구역에 선 선수만 | `{ at }` 또는 `{ playerId }` |
| `single` + 위력 없음 (회복) | 선수 위 · 벤치 칸 · 명단 줄 위에 | 결장 포함 7명 중 1명 (회복만) | `{ at }` 또는 `{ playerId }` |
| `circle` (`size`: small · medium · large) | 원하는 자리에 | 원 안의 경기장 선수 전원 (§14.2 판정). 0명이면 낼 수 없다 ("원 안에 선수가 없습니다") | `{ at }` 필수 |
| `all` | 경기장 아무 데나 | 경기장 선수 전원 | 없음 |
| `owner` | 경기장 아무 데나 (주인 토큰이 빛난다) | 주인 1명. 주인이 벤치 · 결장이면 낼 수 없다 | 없음 |
| `none` | 경기장 아무 데나 | ∅ (효과만) | 없음 |

- **엔진이 대상을 정한다.** UI는 놓은 점(필드 %)을 `at: { x, y }`로 넘길 뿐이고, 미리보기도 엔진 `previewCard`를 불러 받는다. 그래서 화면 강조 = 실제 대상이다.
- `playerId`는 키보드 · 클릭 대체 조작과 벤치 칸 · 명단 줄에 놓을 때 쓴다. 검증은 같다 (그 선수가 후보가 아니면 오류).
- 탭(`taps`) 인자와 `pair` · `line` · `attack` · `defense` · `tap` 종류, 울리카 파트너는 없어진다.
- 순수 기하 함수는 새 모듈 **`js/engine/zones.js`**에 둔다 (DOM · rng 없음):
  - `ZONE_IDS`
  - `huddleOffsets(n, cfg)`
  - `zonePositions(lesson, players, cfg)` → `{ id: {x, y} }` (경기장 선수만)
  - `distU(a, b, aspect)`
  - `inCircle(positions, at, r, aspect)` → id[] (슬롯 순서)
  - `nearestWithin(positions, at, r, aspect, ids)`
  - `candidatePoints(positions, cfg)` (§14.14)
- `cards.js`의 `targetsFor(state, def, args)`가 이 함수들로 T를 계산하고 틀리면 throw한다. `tapCandidates` · `validateTaps` · `isPairCard` · `cardMode` · `effectiveKind`는 지운다.

### 14.7 `playCard` 처리 순서 (§5.3.1을 대신함)

`playCard(state, data, { uid, at, playerId })`

1. **검증.** §5.3.1과 같고, 인자는 §14.6.
2. **대상 T** — §14.6. 실패자를 포함한 T의 각 선수 i는 자기 구역 `z_i = lesson.zones[i]`를 가진다 (회복 단일은 구역이 없어도 된다).
3. **1인 위력 p_i** (소수 유지)
   - 위력 카드 (단일 · 원 · 전체): `power + perMood × mood + perPress × press` — `power` · `perMood` · `perPress`는 모두 **1인** 값이다 (§14.8)
   - 고유: 카드 `power` 35 (강화판 44) × (`z_owner ∈ mainStatsOf(주인 배치 포지션)` ? `unique.mainMult` 1.5 : 1)
   - 단일 · 주인이면 `+ routine`
   - 모든 대상에 `+ focus × focusPer(6) × (focusX2 ? 2 : 1) / |T|` (예전과 같다)
4. **비용 c_i** = `roundCost(costBase_i × costRate × pressCostMult)`
   - `costBase_i` = 강화 전 기본 카드의 1인 위력 (+ perMood · perPress 몫, 고유는 ×1.5가 걸린 값 — 52.5 → 21, 35 → 14)
   - `nextCostZero`면 0이다
   - 원 · 전체 카드도 **1인당** 비용이라 포메이션 · 인원과 무관하다
5. **실패율 f** — 예전과 같다 (T 중 비용 내기 전 체력이 가장 위험한 선수, L16).
6. **배율 M_i** (대상마다)

   ```
   M_i = condition.trainingMult[condition] × (hojo > 0 ? 1.5 : 1) × (1 + Σ trainingEfficiency)
       × zoneMult(z_i)                                     // 중점 1.5 · 특별 중점 2.0
       × (코치 카드 && coach.type == z_i ? 1.3 : 1)          // 대상이 코치 타입 구역에 서 있을 때만
       × (lessonMult && z_i ∈ lessonMult.stats ? mult : 1)   // 대비 카드 1.5
       × (lastTurnX2 && 마지막 N턴 ? 2 : 1) × (underdog && score < target ? 1.5 : 1)
       × (1 + nextPct + (작은 원 카드 ? nextPairPct : 0))
       × 방침 배율 (§14.11)
       × cardGainScale (0.64)
   ```

   - 예전 `(1 + 0.5·special)`는 `zoneMult`로 바뀌었다.
   - "짝 카드" 판정은 "작은 원 카드"(`target.size == "small"`)로 바뀐다.
7. **비용 지불 · 실패 판정** — 예전 8~9와 같다.
8. **상승** (실패자가 아닌 i)
   - `g_i = round(p_i × growth[z_i] × M_i)` → `stats[z_i]` (1000에서 멈춤)
   - 실제 오른 양을 `score` · `cardGains[i]`에 더한다
   - 부 스탯: `subStatMap[z_i] += round(g_i × 0.36 × growth[sub])` (점수 밖)
   - 실패자: `stats[z_i] −5` (실제로 준 양을 점수에서 뺀다), 50%로 부상 → `out`에 넣고 `zones` · `bench`에서 빼고 고유 카드 제외 (예전과 같다)
9. **팀워크 (L10)**: |T| ≥ 2면 +(성공 인원 − 1), 레슨당 `lessonCap` 8까지. 예전 짝 +2 규칙은 지운다 [구현 결정 — 시뮬과 같다. 작은 원 2명 = +1, 원투 패스 · 패스 앤 무브 · 삼각형 패스의 카드 효과 팀워크 +2는 그대로].
10. **일회성 버프 소비** — 예전 12와 같다 (`nextPairPct`는 작은 원 카드일 때).
11. **방침 패시브** — §14.11.
12. **카드 effects** — 예전 14와 같다. 위치 규칙:
    - `heal defense` = GK · DF **배치 포지션** 선수 (결장 아님 — 벤치 포함)
    - `heal all` = 결장이 아닌 7명 (벤치 포함)
    - `heal mostTired` = 결장이 아닌 선수 중 체력 최저
    - `heal owner` = 주인
    - `heal tap` → `heal target` (그 단일 회복 대상)
    - [가정 — 시뮬과 같음: 회복은 대상 지정이 아니라 캐릭터 · 효과로 본다]
13. **기록 · 퍼펙트 · 사용 횟수** — 예전 15~17과 같다.

### 14.8 카드 데이터 스키마 변경 (`data/cards.json` version 2)

```jsonc
{ "version": 2, "cards": [ {
  "id": "cd_fw_drill", "name": "FW 라인 드릴",            // 이름은 이번에 바꾸지 않는다 (§14.20 Q4)
  "target": { "kind": "circle", "size": "medium" },
  //   kind: single(+onlyZones?: [zone]) | circle(+size: small|medium|large) | all | owner | none
  "power": 18,                                            // 늘 1인 위력. 위력 없는 카드(회복 단일 · none)는 null
  "costRate": 0.6, "mods": { }, "effects": [ ], "exhaust": false,
  "plus": { "power": 23 },                                // 강화판 1인 위력 (명시)
  "desc": "…", "descPlus": "…",
  "ownerCharId": "ch_…",                                  // unique만. support 필드는 없어지고, 예전 지원 효과가 effects로 온다
  "coach": { "supportId": "sp_…", "type": "shoot" }, "bond80": { "power": 18, … }, "prepFor": "dribble"
} ] }
```

- `TARGET_KINDS = ["single", "circle", "all", "owner", "none"]`, `CIRCLE_SIZES = ["small", "medium", "large"]`, `onlyZones ⊂ ZONE_IDS`. 닫힌 목록이다 (`validateCardsData`).
- `RANGE_KINDS` · `PER_PLAYER_KINDS`와 "합계 ÷ 인원" 계산은 지운다. `costBase(def, { mood, press })`는 1인 값이다.
- `mods.perMood` · `mods.perPress`는 1인 값이다 (라인 연동 0.9, 총공세 1.7).
- 고유 카드: `power` 35, `plus.power` 44, `costRate` 0.4, `effects` = 예전 `support.effects`, `plus.effects` = 예전 `plus.support.effects`. 예전 강화 모드 전용 효과(아델린 팀워크 +2, 실루엔 +20%, 울리카 파트너 · 팀워크 +1)는 지운다. `target.partner`도 없다.
- `PLUS_FIELDS` = power · effects · mods. `BOND80_FIELDS`는 그대로다.
- `heal.to`의 닫힌 목록: `target` · `all` · `defense` · `mostTired` · `owner` (`tap` → `target`).
- `data/lesson.json`도 version 2다 (§14.13).

### 14.9 66장 변환표

규칙: 예전 대상 `pair` → 작은 원 (짝 1인 위력 × 1.0), `line`(1라인) → 중간 원 (합계 × 0.45), `attack` · `defense`(2라인) → 큰 원 (합계 × 0.35), `all` → 전체 (합계 × 0.17), `single` · `tap` → 단일, `owner` → 주인 (§14.10).
- 1인 위력은 정수로 반올림했다. 시뮬 계수와 최대 ±5% 차이가 난다 (원 팀 4.76 → 5 등).
- 범위에서 바뀐 카드의 강화판 = `round(1인 × 1.25)`. 단일 카드의 강화판 · 유대 80판은 예전 값 그대로다.
- 비용 = 강화 전 1인 위력 × 비용률 (단일 0.6, 1:1 특훈 0.66, 고유 0.4). 1인당이라 포메이션과 무관하다.
- 상승 ≈ 1인 위력 × 0.64 × 성장률 × 배율이다 (성장률 1.0 · 컨디션 보통 · 중점 아님이면 위력 × 0.64).
- 강화판 · 유대 80판의 **효과** 변화는 §4.4 그대로다 (예: 하르나 유대 80 = 마지막 2턴, 한나 유대 80 = endHeal 10).

| id | 예전 대상 · 위력 | 새 대상 | 1인 위력 (+강화) | 비용 (1인) | mods · effects (유지) |
|---|---|---|---|---|---|
| `cd_basic` | all 35 | all | 6 (+8) | 4 | — |
| `cd_coaching` | single 35 | single | 35 (+44) | 21 | — |
| `cd_cooldown` | tap | single (회복) | — | — | heal target 20, extraPlay 1 |
| `cd_fw_drill` | line FW 40 | circle medium | 18 (+23) | 11 | — |
| `cd_mf_drill` | line MF 40 | circle medium | 18 (+23) | 11 | — |
| `cd_df_drill` | line DF 40 | circle medium | 18 (+23) | 11 | — |
| `cd_gk_session` | line GK 38 | circle medium | 17 (+21) | 10 | — |
| `cd_attack_build` | attack 43 | circle large | 15 (+19) | 9 | — |
| `cd_defense_org` | defense 43 | circle large | 15 (+19) | 9 | — |
| `cd_one_two` | pair 20 | circle small | 20 (+25) | 12 | teamwork 2 |
| `cd_one_on_one` | single 48 | single | 48 (+60) | 32 | costRate 0.66 |
| `cd_tactics_board` | none | none | — | — | drawNext 1, extraPlay 1 |
| `cd_icing` | tap | single (회복) | — | — | heal target 30 |
| `cd_hojo_up` | none | none | — | — | hojo 3 |
| `cd_focus_routine` | none | none | — | — | focus 2 |
| `cd_ace_training` | single 30 | single | 30 (+38) | 18 | focusX2 |
| `cd_one_point` | single 25 | single | 25 (+31) | 15 | focus 1 |
| `cd_immerse` | none | none | — | — | hojo 2, focus 1 |
| `cd_break_limit` | single 65 | single | 65 (+81) | 39 | failPlus 0.1 |
| `cd_routine` | none | none | — | — | routine 8 (단일 · 주인 카드 1인 +8) |
| `cd_breath` | tap | single (회복) | — | — | heal target 25, focus 1 |
| `cd_high_five` | none | none | — | — | mood 3 |
| `cd_set_piece` | attack 30 | circle large | 11 (+14) | 7 | mood 2 (success) |
| `cd_pass_move` | pair 15 | circle small | 15 (+19) | 9 | mood 1 (success), teamwork 2 |
| `cd_one_team` | all 28 | all | 5 (+6) | 3 | mood 2 (success) |
| `cd_chant` | none | none | — | — | mood 2, heal all 5 |
| `cd_mood_maker` | none, exhaust | none | — | — | moodX2 |
| `cd_breath_together` | none | none | — | — | noDecay 3 |
| `cd_link_line` | defense 35 | circle large | 12 (+15) | 7~ | perMood 0.9 (1인, 분위기 1당) |
| `cd_line_up` | defense 32 | circle large | 11 (+14) | 7 | stealBuild 2 |
| `cd_recover` | none | none | — | — | steal 1, heal defense 12 (GK · DF 포지션) |
| `cd_long_ball` | none | none | — | — | steal 1, extraPlay 1 |
| `cd_counter_sprint` | attack 36 | circle large | 13 (+16) | 8 | stealPer 0.4 |
| `cd_finisher` | single only MF · FW 30 | single `onlyZones` [shoot, dribble, pass] | 30 (+38) | 18 | stealPer 0.45 |
| `cd_all_counter` | all 30 | all | 5 (+6) | 3 | teamwork 2 (consume) |
| `cd_front_press` | attack 34 | circle large | 12 (+15) | 7 | press 1 |
| `cd_full_press` | none | none | — | — | press 2, extraPlay 1 |
| `cd_six_sec` | single 28 | single | 28 (+35) | 17 | press 1, noPressCost atLeast2 |
| `cd_drop_line` | none | none | — | — | pressDrop 6, nextNoFail |
| `cd_all_out` | all 30 | all | 5 (+6) | 3~ | perPress 1.7 (1인, 단계 1당) |
| `cd_gegen` | attack 40 | circle large | 14 (+18) | 8 | noPressCost always |
| `cd_triangle` | pair 18 | circle small | 18 (+23) | 11 | poss 2 (success), teamwork 2 |
| `cd_mid_control` | line MF 34 | circle medium | 15 (+19) | 9 | poss 2 (success) |
| `cd_circulate` | none | none | — | — | poss 3, heal mostTired 15 |
| `cd_tempo` | none | none | — | — | possGuard 1, drawNext 1 |
| `cd_dominate` | attack 32 | circle large | 11 (+14) | 7 | possX2 |
| `cd_back_build` | defense 34 | circle large | 12 (+15) | 7 | possKeep (패스 구역 대상이 없어도 점유 유지) |
| `cd_u_neria` | owner 53 / 지원 | owner | 35 (+44), 주 스탯 구역이면 ×1.5 = 52.5 (+66) | 14 / 21 | nextNoFail, heal owner 15 (+: 25) |
| `cd_u_dorbina` | owner 53 / 지원 | owner | 〃 | 14 / 21 | heal defense 10 (+: 15) |
| `cd_u_adeline` | owner 53 / 지원 | owner | 〃 | 14 / 21 | teamwork 3, heal all 3 (+: 4 · 5) |
| `cd_u_silluen` | owner 53 / 지원 | owner | 〃 | 14 / 21 | nextPct 0.4 (+: 0.55) |
| `cd_u_taria` | owner 53 / 지원 | owner | 〃 | 14 / 21 | drawNext 1 (+: 2) |
| `cd_u_ulrika` | owner + partner 53 / 지원 | owner | 〃 | 14 / 21 | nextPairPct 0.5 (다음 작은 원, +: 0.75), teamwork 1 |
| `cd_u_greta` | owner 53 / 지원 | owner | 〃 | 14 / 21 | nextCostZero (+: + heal owner 10) |
| `cd_u_mirka` | owner 53 / 지원 | owner | 〃 | 14 / 21 | extraPlay 1, heal owner −5 (+: −5 없음) |
| `cd_c_harr` | line FW 40 | circle medium | 18 (+23) | 11 | lastTurnX2 1 (유대80: 2) |
| `cd_c_celia` | pair 20 | circle small | 20 (+25) · 유대80 24 (+30) | 12 | drawNext 1 |
| `cd_c_ornella` | attack 43 | circle large | 15 (+19) · 유대80 18 (+23) | 9 | teamwork 2 (유대80: 3) |
| `cd_c_barbara` | defense 43 | circle large | 15 (+19) · 유대80 18 (+23) | 9 | noFail |
| `cd_c_hanna` | all 35 | all | 6 (+8) | 4 | endHeal 5 (유대80: 10) |
| `cd_c_joy` | single 40 | single | 40 (+50) · 유대80 48 (+60) | 24 | underdog 0.5 |
| `cd_c_irene` | single 28 | single | 28 (+35) | 17 | drawNext 1 (유대80: + extraPlay 1) |
| `cd_c_lumi` | all 30 | all | 5 (+6) · 유대80 6 (+8) | 3 | lumiFlag |
| `cd_p_tackle` | defense 40 | circle large | 14 | 8 | lessonMult [defense, physical] ×1.5 — 그 구역에 선 대상만 |
| `cd_p_intercept` | defense 40 | circle large | 14 | 8 | lessonMult [defense, pass] ×1.5 — 〃 |
| `cd_p_hold` | line DF 40 | circle medium | 18 | 11 | lessonMult [defense] ×1.5 — 〃 |

- 코치 카드 비용은 cards.test가 확인하던 2-2-2 값(하르나 12 · 셀리아 12 · 오르넬라 6 · 바르바라 9 · 한나 3 · 조이 24 · 이레네 17 · 루미 3 · 태클/인터셉트 8 · 버티기 12)에서 위 표 값으로 바뀐다.
- 카드 앞면 · 문구(`desc` · `descPlus`)는 "FW 라인 합계 40" → "중간 원 · 1인 18"처럼 대상 · 1인 위력으로 다시 쓴다 (ZE2).

### 14.10 고유 · 코치 · 대비 · 중점 구역 · 특별

- **고유 카드** [가정]
  - 주인 1명만 대상이다 (`owner`).
  - 위력 35(강화 44). 주인이 **자기 배치 포지션의 주 스탯 구역**(`mainStatsOf`: GK · DF = 수비 · 피지컬, MF = 드리블 · 패스, FW = 슈팅 · 드리블)에 서 있으면 ×1.5.
  - 캐릭터 효과(예전 지원 모드 효과)는 늘 붙는다.
  - L13의 두 모드는 없어진다. 매 턴 흩어지기 때문에 "이번 턴 주인이 어디 서 있나"가 카드의 값이 된다.
  - 미팅 · 경기 전 준비 편집기의 "고유 카드 모드 변경" 표시는 "고유 카드 ×1.5 구역: 수비 · 피지컬 → 슈팅 · 드리블"로 바꾼다 (주 스탯 쌍이 바뀔 때만).
- **코치 카드**: ×1.3은 대상마다, 그 대상이 코치 타입 구역(하르나 · 조이 = 슈팅, 셀리아 = 드리블, 오르넬라 · 이레네 = 패스, 바르바라 = 수비, 한나 · 루미 = 피지컬)에 서 있을 때만 붙는다 [가정].
  - 실패율 감소 · 유대 +8은 그대로다.
  - "같은 종목 레슨 클리어 유대 +5" → **중점 구역 = 코치 타입**인 레슨을 클리어하면 +5 [구현 결정].
- **대비 카드**: ×1.5는 대상마다, 그 대상의 구역이 카드의 `lessonMult.stats` 안일 때만 붙는다 [가정]. 대비 주에도 중점 구역을 고른다 (특별은 없다 — D27).
- **중점 구역** [가정]
  - 레슨 주 · 대비 주에 고르는 것 = 5구역 중 1곳 (`applyWeekAction({ type: "lesson", zone })`).
  - 그 구역은 흩어질 때 가중치 ×2 (`focus.weight`), 그 구역의 상승(기본 훈련 · 카드)은 ×1.5 (`focus.mult`).
  - 이름은 에이스형 버프 "집중"과 헷갈리지 않게 "중점 구역"으로 부른다 (보정 보고의 "집중 구역") [구현 결정].
- **특별 표시** [가정]
  - 레슨 주마다 5구역 중 1곳에 무작위로 붙는다 (`special.secondChance` 0.5 → **0**, 시뮬과 같게 1곳).
  - 그 구역을 중점으로 고르면 특별 레슨이다: 그 구역 상승 ×2.0 (×1.5 대신), 목표 ×1.15, 상한 ×1.2, 보상 강화판 확률(`plusChance.special`)은 예전과 같다.
  - 다른 구역을 중점으로 고르면 특별 표시는 효과가 없다.

### 14.11 방침 버프 — 구역 기준 [가정]

카드의 "공격 구역" = 슈팅 · 드리블 · 패스, "수비 구역" = 수비 · 피지컬. T ≠ ∅이고 run 방침이 맞을 때만 패시브가 돈다 (D38 그대로).

| 방침 | 예전 (배치 라인) | 구역 방식 |
|---|---|---|
| 역습형 (탈취) | T가 전부 GK · DF이고 실패자가 없으면 쌓기, T에 MF · FW가 있으면 쓰기 | T가 **전부 수비 구역**에 서 있고 실패자가 없으면 +(stealBuild ?? 1). T에 **공격 구역** 선수가 1명이라도 있으면 탈취를 모두 쓴다 (배율 `1 + stealPer × steal`, 실패해도 0) |
| 점유형 (점유) | T에 MF가 있으면 +1, 없으면 −2 | 실패자가 없고 T에 **패스 구역** 선수가 있으면 +1. 패스 구역 대상이 없으면 −2 (`possKeep`이면 유지). 실패 → 가드 또는 0. 삼각형 패스의 기본 +1도 "작은 원에 패스 구역 선수가 있으면" |
| 팀형 (분위기) | 턴 끝 7명 틱 · 쉬기 턴 −2 | 스택마다 **기본 훈련** +0.96 (§14.4). 감소는 턴마다 −1 (noDecay면 안 줆) |
| 압박형 (압박) | 쉬기 → 0 · 단계당 +4 | 배율 · 비용 · 실패 리셋 · 라인 내리기는 그대로. 쉬기 회복 규칙은 없어진다. 기본 훈련은 압박 배율 · 비용을 받지 않는다 |
| 에이스형 (호조 · 집중) | — | 그대로 (호조는 대상 있는 카드만, 기본 훈련에는 붙지 않는다) |

- `lesson.js` 패시브 문맥 `play.ctx.{usesSteal, allDefense, hasMF, pairCard}` → `{ hasAttackZone, allDefenseZone, hasPassZone, smallCircle }`.
- `buffs.possNoMF` → `possNoPass`, `buffs.pressRestHeal`은 지운다.
- 미리보기 노트 문구: "점유 −2 (패스 구역 대상 없음)", "탈취 3 → ×1.9 (공격 구역 대상 있음)", "성공하면 탈취 +2 (모두 수비 구역)".
- 칩: "분위기 3 · 기본 +2.9".
- 시뮬 관찰: 역습형 탈취 사용 16.1회/런 · 평균 1.47스택 (예전 9.3회 · 1.86). 점유형은 패스 구역 인원이 적어 스택이 잘 쌓이지 않는다 (깨질 때 평균 0.6스택). 수치는 나중에.

### 14.12 레슨 점수 · 목표 · 상한

- **점수** = 이번 레슨 7명의 **구역 스탯 순증가 합**이다 — 기본 훈련(분위기 몫 포함) + 카드 상승 − 실패 −5. 부 스탯 · 스탯 상한(1000)에 잘린 분은 뺀다 [가정].
- 점수가 예전 문서보다 높은 이유는 7명 전원의 기본 훈련이 들어가기 때문이다.

| 시즌 (턴) | 일반 p30 / 평균 / p90 | 특별 중점 p30 / p90 | **목표** | **상한** | 특별 목표 / 상한 (×1.15 / ×1.2) |
|---|---|---|---|---|---|
| 1 (6) | 433 / 457 / 517 | 518 / 627 | **430** | **520** | 495 / 624 |
| 2 (7) | 514 / 545 / 624 | 584 / 742 | **510** | **620** | 587 / 744 |
| 3 (8) | 596 / 635 / 731 | 677 / 879 | **600** | **730** | 690 / 876 |

- `lesson.targets = [[430, 520], [510, 620], [600, 730]]`, `special.targetMult` 1.15, `special.capMult` 1.2 (반올림) [가정].
- 퍼펙트 판정 시점(카드 직후 · 턴 끝 ④)과 체력 보너스(남은 턴 × 5, 7명)는 그대로다 (D6). 카드로 퍼펙트가 되면 그 턴의 기본 훈련 · 벤치 회복은 하지 않는다.

### 14.13 상태 · API · 뷰

**`data/lesson.json` (version 2)** — 바뀌는 부분만

```jsonc
{ "version": 2,
  "lesson": {
    "turns": [6, 7, 8], "targets": [[430, 520], [510, 620], [600, 730]],
    "hand": 3, "costRate": 0.6, "cardGainScale": 0.64, "subGainRatio": 0.36,
    "failStatLoss": 5, "injuryChanceOnFail": 0.5, "perfectStaminaPerTurn": 5,
    "base":  { "gain": 3.2, "stamina": 1 },
    "bench": { "recover": 15, "max": 2 },
    "focus": { "mult": 1.5, "specialMult": 2.0, "weight": 2 },
    "special": { "targetMult": 1.15, "capMult": 1.2, "secondChance": 0 },
    "unique": { "mainMult": 1.5 },                       // 위력 35 · 강화 44 · 비용률 0.4는 cards.json
    "coachSameTypeMult": 1.3
    // 지움: autoTrainRatio · autoTrainStamina · rest · special.gainBonus
  },
  "zones": {
    "aspect": 0.405, "pad": 9, "pickR": 3,
    "centers": { "defense": { "x": 20, "y": 30 }, "pass": { "x": 50, "y": 30 }, "shoot": { "x": 80, "y": 30 },
                 "physical": { "x": 35, "y": 72 }, "dribble": { "x": 65, "y": 72 } },
    "huddle": [0, 3.5, 4.5, 5.5, 6.5],
    "jitter": { "rotate": true, "radiusScale": [0.85, 1.25], "nudge": 1.2, "minGap": 4.8, "maxR": 6.6 },   // L52 (§23) — null = 예전 대형
    "radius": { "small": 4.2, "medium": 9, "large": 17 }
  },
  "teamwork": { "perExtraTarget": 1, "lessonCap": 8, "clear": 3 },          // pair 지움
  "buffs": { "hojoMult": 1.5, "focusPer": 6, "moodK": 1.5, "stealPer": 0.3, "stealCap": 4,
             "pressK": 0.2, "pressCostK": 0.2, "pressCap": 3, "possK": 0.05, "possCap": 8, "possNoPass": 2 }
  // 나머지(rewards · bond · consult · freeWeek · outing · prepCards · routeOverrides · events)는 그대로
}
```

**LessonState** (§5.2를 대신함)

```jsonc
{ "zone": "pass", "special": true, "prep": false,          // zone = 중점 구역 (예전 stat)
  "turn": 1, "turns": 6, "target": 495, "cap": 624, "score": 0, "status": "playing",
  "playsLeft": 1, "playedThisTurn": 0,
  "zones": { "p1": "defense", "p2": "physical" },          // 이번 턴 흩어진 결과 (경기장 선수만)
  "bench": ["p3"],                                          // 이번 턴 벤치 (최대 2)
  "layoutSeed": 749271294,                                  // L52 (§23): 대형 흔들림 씨앗 = zones.layoutSeedOf(seed, turnIndex) (예: seed "1" · 0주) — 레슨 시작 때, rng 아님
  "drawPile": [], "hand": [], "discard": [], "exhausted": [], "removed": [], "temp": [], "drawNext": 0,
  "buffs": { … },                                           // 예전과 같다
  "outAtStart": [], "out": [], "targeted": { },
  "baseGains": { "p1": 0 }, "moodGains": { }, "cardGains": { },      // 결과 화면 · 시뮬용 (구역 스탯 상승)
  "twAccrued": 0, "endHeal": 0, "lumiFlag": false, "seq": 0, "lastFx": [],
  "stats": { "plays": 0, "benches": 0, "fails": 0, "injuries": 0 },
  "before": { }, "bondBefore": { } }
// 지움: stat · restTurn · cardGainSum · autoGains · stats.rests
```

**lesson.js 공개 함수**

| 함수 | 바뀌는 것 |
|---|---|
| `startLesson(state, data, { zone, special, prep, prepCards })` | stat → zone. 1턴 시작에 흩어지기 |
| `playCard(state, data, { uid, at, playerId })` | §14.7 |
| `benchPlayer(state, data, { playerId, on })` | 새로 (§14.5) |
| `endLessonTurn(state, data)` | 카드 0장이어도 된다. 턴 끝 순서 §14.3 |
| `lessonRest` | **지운다** (lessonRun · manager · UI에서도) |
| `getLessonView(state, data)` | 아래 |
| `previewCard(state, data, { uid, at, playerId })` | 아래 |
| `dropCandidates(state, data, { uid })` | 새로 (§14.14 후보 점) — 키보드 대체 조작과 감독 AI가 같이 쓴다 |
| `lessonResult(state, data)` | `zone`, `benches`, `perPlayer[{ id, byStat: { shoot: n, … }, base, mood, card, sub, targeted, benched }]` (`auto` 지움) |

```jsonc
getLessonView → { …예전 필드 (stat → zone, canRest 지움),
  zoneCfg: { centers, radius, aspect, pad, pickR },          // UI가 그림만 그린다
  positions: { "p1": { "x": 23.5, "y": 30 } },               // 경기장 선수 위치 (zones.js) — 토큰을 그 자리에
  bench: ["p3"], benchMax: 2, canBench: true, canEndTurn: true,
  players: [ { …, zone, bench, out, baseNext, failRate } ],   // baseNext = 이번 턴 끝 기본 훈련 예상 (벤치면 0)
  hand: [ { …, targetKind: "single"|"circle"|"all"|"owner"|"none", size, radius, onlyZones,
            power, cost, heal: bool, playable, deadReason } ] }   // needTaps · mode · count 지움

previewCard → { ok, reason, kind, at, circle: { x, y, r } | null,
  targets: [ { id, zone, stat, gain, sub, cost, failRate, coach: bool, focus: bool, unique15: bool } ],
  failRate, failerId, total, notes }
// at이 없거나 대상 0명이면 ok:false. 순수 · rng 없음 (예전과 같다)
```

**lessonRun.js**

| 바뀌는 것 | 내용 |
|---|---|
| `applyWeekAction({ type: "lesson", zone })` | `stat` → `zone`. 특별 = `zone ∈ weekOffer.specials` (레슨 주만) |
| 주 offer | `specials`는 1곳 (`secondChance` 0) |
| `playCard` · `benchPlayer` · `endLessonTurn` · `getLessonView` · `previewCard` · `dropCandidates` | lesson.js를 감싼다. `lessonRest`는 지운다 |
| `afterLesson` | 같은 타입 유대 +5 = 중점 구역 = 코치 타입. 기록 `record.lessons[] = { turnIndex, zone, special, prep, score, target, cap, result, turns, plays, benches, fails, injuries }` |
| `getWeekView().lessons[]` | `{ zone, special, target, cap, turns, expected, boosted: [id] }` — `expected` = 그 구역을 중점으로 골랐을 때 서 있을 기대 인원 (가중치 식, 소수 1자리), `boosted` = 그 구역이 주 스탯이라 고유 카드 ×1.5가 걸리는 선수 |
| `getRewardView().result.perPlayer` | `lessonResult`의 새 모양 |
| `version` | **2** (§14.15) |

**연출 목록 (`lastFx`) 변경**

- 더한다:
  - `{ t: "scatter", zones: { id: zone } }` — 턴 시작, `draw` 앞
  - `{ t: "base", id, stat, n }` — 턴 끝 ①
  - `{ t: "bench", id, on }`
  - `{ t: "heal", id, n, src: "bench" }`
  - `{ t: "cost", id, n, src: "base" }`
- 지운다: `tick`, `gain`의 `auto`.

### 14.14 감독 AI (`manager.js`)

- **`recommendCard`** → `{ kind: "bench", playerId } | { kind: "play", uid, at?, playerId?, score } | { kind: "endTurn" }`
  1. **벤치 먼저.** 그 턴에 카드를 아직 내지 않았고, 벤치가 `bench.max`보다 적고, 체력 < 25인 경기장 선수가 있으면 → 체력이 가장 낮은 선수 (같으면 슬롯 순서)를 벤치로. 한 번에 1명씩 돌려준다.
  2. **카드마다 후보 점** (`dropCandidates` — 엔진 `zones.candidatePoints`, 대상 집합이 같은 점은 하나로 줄인다):
     - 단일: 후보 선수마다 그 선수 위치
     - 원: 경기장 선수마다 그 위치 + 사람이 있는 구역 중심 + 사람이 있는 두 구역 중심의 가운데 (거리 ≤ 2r인 쌍) + 같은 구역 · 이웃 구역 두 선수의 가운데 (거리 ≤ 2r인 쌍) → 원 안 0명인 점은 버린다
     - 전체 · 주인 · 없음: 점 1개 (경기장 가운데 `(50, 50)`)
     - 회복 단일: 결장 포함 7명 각각 (`playerId`)
  3. 각 후보에 `previewCard`를 돌려 점수를 매긴다.

     ```
     EV = Σ gain_i × pref_i × (1 − f) − f × (5 + 40) + 버프 가치 − 0.15 × Σ cost − 10 × (체력 40 미만 대상 수)
     pref_i = 대상의 구역이 자기 포지션 주 스탯이면 1.2, 아니면 0.8     // 시뮬과 같다
     ```

     - 버프 가치는 예전 `value()`에서 분위기 항목만 바꾼다: 스택 1당 `0.96 × 경기장 인원 × min(남은 턴 + 1, 스택)`.
     - 방침별 한 줄(§5.5)의 "MF" → "패스 구역", "공격진이 낀 카드" → "공격 구역 대상이 있는 카드"다.
  4. 최고 EV ≤ 0이면 `endTurn`. 같은 EV면 손패 순서 → 후보 순서(구역 중심 → 선수 → 가운데 점)다.
  - 예전 `restV` · 쉬기 · 탭 대상 규칙은 지운다. 라인 내리기 규칙은 그대로다 (압박 ≥ 2이고 체력 40 미만 선수가 있으면).
- **`recommendWeek`**: 레슨 주 → 특별 표시 구역이 있으면 그 구역 (늘 — 시뮬은 70% 확률이었다. 감독 AI는 rng를 쓰지 않으므로 [구현 결정]). 대비 주 → 다음 상대 대응 구역 (수비, 수비가 7명 합 1위면 패스, D34). 그 밖 → 7명 합이 가장 낮은 구역.
- 보상 · 상담 · 자유 주는 그대로다.
- `autoStep`은 bench · play · endTurn을 그대로 실행한다.
- 성능: 손패 3~5장 × 후보 점 약 30~45개 × `previewCard` — 1회 추천에 수 ms. `manager.test` 60초 예산 안.

### 14.15 저장 · 결정성

- rng를 쓰는 곳에 **흩어지기**가 더해진다 (턴 시작, 뽑기보다 먼저). 벤치 · 미리보기 · 후보 점 · 뷰 · 감독 AI는 rng를 쓰지 않는다.
- 상태를 바꾸는 호출 = `playCard` · `benchPlayer` · `endLessonTurn`. UI는 호출마다 `saveRun`을 부른다. 새로고침하면 같은 구역 배치 · 같은 손패 · 같은 벤치다.
- 위치는 저장하지 않는다 (`zones` + 데이터에서 계산 — 데이터를 바꿔도 저장본이 깨지지 않는다).
- **저장 버전:** `lessonRun.version` 1 → **2**. `isLessonRun`은 2만 참이고, `store.isLessonRunSave` 사본은 1 · 2를 받아 `continueRun`이 이행하게 한다.
  - `migrateLessonRun(v1)`: `lesson == null && pendingReward == null`(주 · 상담 · 준비 · 경기 · 유물 · 루트 · 끝)이면 version 2로 올리고 `record.lessons[].stat → zone`, `rests → benches`, `weekOffer.specials`는 그대로 둔다.
  - 레슨 · 보상 중인 v1은 이행하지 않는다 → "저장 없음" + 토스트 "구역 방식으로 바뀌어 진행 중인 레슨은 이어 할 수 없습니다" [구현 결정].
- 등록 팀(`registeredTeam`) 모양은 그대로다.

### 14.16 UI (1280×720)

**레슨 화면 배치** — 그리드(§6.3: HUD 56 · 경기장 + 옆 252 · dock 212)는 그대로 두고 안을 바꾼다.

```
y0   ┌ HUD ─ 시즌1 · 3주 · ➡️ 패스 중점 ★특별 ×2 │ 턴 ●●●○○○ 4/6 │ 점수 [████▌··|···|] 286 / 495 / 624 │ 칩 ┐
y64  │ ┌ 경기장 968×392 ─────────────────────────────────────────────┐ ┌ 옆 252 ────────────────┐ │
     │ │  (🛡️수비)         (➡️패스 ★중점)        (⚽슈팅)              │ │ 벤치 (턴 끝 +15, 최대 2) │ │
     │ │   ●●               ●●●                  ●                    │ │ [  빈 칸  ][  빈 칸  ]   │ │
     │ │        (💪피지컬)          (🦶드리블)                         │ ├─────────────────────────┤ │
     │ │          ●                   ●                                │ │ 네리아 🛡️ ▮▮▮ 85 2% [벤치]│ │
     │ │  끄는 동안: 원(점선) + 안의 토큰 흰 테두리 + 머리 위 "+12 · 2%" │ │ … 7줄 (결장 회색)       │ │
     │ └──────────────────────────────────────────────────────────────┘ └ 덱 · 버림 · 팀워크 ─────┘ │
y496 ├ dock: [덱][버림] │ 손패 (끌어서 경기장에) │ 안내 · 미리보기 합계 · 노트 │ [내기][턴 끝] ┤
```

- **구역 바닥** (`.zone-pad`): 각 구역 중심에 반지름 `pad` 9u 원.
  - 구역 색 옅게 + 아이콘 · 이름 라벨은 바닥 위쪽 (위 줄) / 아래쪽 (아래 줄).
  - 중점 구역은 금색 테두리 + "중점 ×1.5" (특별이면 "★ ×2.0").
  - 예전 `drillZone` · `drillSpot` · 훈련장 라벨은 지운다.
- **토큰**은 `v.positions`에 둔다 (`--t-move` transition).
  - 대형이 4명 이상이면 이름표를 짧게 (`.tok-name.short`, 이름 앞 2글자). 전체 이름은 hover · 명단 줄에서 본다.
  - `aria-label` = "네리아 — 수비 구역, 체력 85".
- **카드 끌기** (Pointer Events, `touch-action: none`)
  1. 손패 카드에서 `pointerdown` → 6px 넘게 움직이면 끌기 시작 (`setPointerCapture`). 넘지 않으면 클릭 (아래 대체 조작).
  2. 끄는 동안 카드 유령(`.drag-ghost` 88×102, 카드 축소판)이 포인터를 따른다. 경기장 위로 들어오면 유령 대신 **조준 표시**로 바뀐다.
     - 원 카드: 점선 원 (`rx = r·W/100`, `ry = (r/aspect)·H/100`)
     - 단일: 십자 + 가장 가까운 후보 토큰 강조
     - 전체 · 주인 · 없음: 경기장 전체(또는 주인 토큰)가 빛난다
  3. 포인터 → 필드 % 변환은 `lesson_layout.pointerToField(clientX, clientY, rect)` (`.m-field`의 `getBoundingClientRect` — 무대 scale을 포함한 값).
  4. 프레임마다 1번(rAF) `run.previewCard(state, data, { uid, at })`를 부른다.
     - 결과의 `targets` → 토큰 `.target`(흰 테두리) + 말풍선 "+12 · 2%", 실패 후보는 `.failer`(빨강)
     - dock 안내 칸 = "대상 3명 · 합계 +36 · 실패 10%" + notes
     - `ok:false` → 원이 빨간 점선 + "원 안에 선수가 없습니다"
  5. 경기장 위에서 놓으면 `actions.lessonCall('playCard', { uid, at })` → seq +1 → 연출. 경기장 밖(dock · 옆 칸)에서 놓으면 취소. Esc도 취소.
  6. 회복 단일 카드는 벤치 칸 · 명단 줄 위에 놓을 수 있다 (`playerId`).
- **벤치** (`.ls-bench`, 옆 칸 맨 위 252×84, 칸 2개)
  - 카드를 끌고 있지 않을 때 경기장 토큰을 끌어 벤치 칸에 놓으면 `benchPlayer({ playerId, on: true })`.
  - 벤치 토큰을 경기장에 끌어 놓으면 `on: false` (놓은 자리와 상관없이 자기 구역으로 간다).
  - 벤치가 차면 칸이 회색 + "최대 2명".
  - 명단 줄의 [벤치] / [복귀] 버튼과 토큰 포커스 + `B` 키가 같은 일을 한다.
- **클릭 · 키보드 대체 조작** (접근성 · 테스트용)
  - 카드를 클릭하거나 포커스 + Enter → **조준 모드** (`store.lessonUi.aim = { uid, idx }`).
  - 마우스: 원 · 십자가 hover를 따라오고 경기장을 클릭하면 그 점에 낸다. 터치: 탭 1번 = 원을 그 자리에 놓기, 같은 자리를 한 번 더 탭하거나 [내기] = 내기.
  - 키보드: ← → (또는 Tab)으로 `run.dropCandidates` 후보를 돈다 (라벨 "패스 구역 · 3명", "네리아", "패스–드리블 사이 · 4명"), 숫자 1~5 = 구역 중심, Enter = 내기, Esc = 취소.
  - 전체 · 주인 · 없음 카드는 조준 없이 Enter / [내기] / 카드 두 번 클릭으로 낸다.
- **버튼**: [쉬기]는 지운다. [내기](조준 모드에서만 켜짐) · [턴 끝](늘). 추천 배지: 감독 추천이 bench면 그 선수 명단 줄에, play면 카드 + 경기장에 추천 원(점선 · 청록), endTurn이면 [턴 끝].
- **연출** (`lesson_layout.fxPlan` 갱신)
  - 카드: 비용 → 대상이 **제자리에서** 훈련 동작(`.drilling` 통통 + 구역 색 고리, 280ms) → "+N" 팝 → 버프 칩. 대상이 달려가지 않는다 — 이미 훈련 구역에 서 있다.
  - 턴 끝: 기본 훈련 "+N" 작은 회색 팝이 경기장 선수 모두에게 **동시에** (650ms) + 점수 막대 → 벤치 "+15" → 새 턴 흩어지기 = 토큰이 새 자리로 뛰어감 (450ms) → 새 손패.
  - 턴당 약 1.1초가 늘어난다 → 런당 약 70초 (9장 시간 예산 [검증]).
  - `no-anim` · reduced-motion이면 0ms (예전과 같다).
- **주 화면**: 레슨 카드 5장 = 중점 구역 5곳.
  - 카드 내용: 아이콘 · 이름 · "서 있을 확률 ×2 · 상승 ×1.5" · 기대 인원 `expected` · ★특별(×2.0, 목표 495) · 고유 ×1.5 선수 얼굴(`boosted`)
  - 턴 수 · 목표는 머리 줄에 한 번.
- **카드 앞면** (`js/ui/cards.js`)
  - 대상 칩: `CARD_TARGET_LABELS = { single: '단일', circle: '원', all: '전체', owner: '주인', none: '대상 없음' }` + 크기 "작은 원 · 중간 원 · 큰 원", 원 아이콘 크기 3단계
  - 위력 줄 "1인 18" (고유 "1인 35 · 주 스탯 구역 ×1.5")
  - 비용 "체력 −11 /명" — `estimateCost`는 엔진 `staminaCost`를 그대로 쓴다 (인원 계산 없음)
- **보상 모달 · 결과**: 선수 칩 = 구역별 상승 합 (`byStat` 상위 2개 아이콘) · 기본 / 카드 · 부 스탯. "자율 훈련" 문구는 지운다.

### 14.17 테스트

| 파일 | 바뀌는 것 |
|---|---|
| `test/zones.test.mjs` (새) | 대형 위치 (n = 1~7, 겹침 없음 · 필드 안), `distU` · `inCircle` 경계 포함, 원 크기 표의 약속 (작은 원 = 이웃 2명 · 중간 원 = 한 구역 전원이고 이웃 구역 0명 · 큰 원 = 22.7u 이웃 두 구역 가운데에서 두 무리 전원이고 세 번째 0명), `candidatePoints` 중복 제거 |
| `cards.test` | 66장 · 닫힌 목록 (target kind · size · onlyZones · heal.to), §14.9 1인 위력 · 강화 · 비용 표, `resolveCardDef`, 고유 카드 effects = 예전 지원 효과 |
| `lesson.test` | 흩어지기 결정성 · 분포 (2,000번에 가중치 ±3%p, 중점 ×2) · 결장 제외 / 기본 훈련 식 (중점 · 특별 · 컨디션 · 분위기 몫, 부 스탯 없음, 체력 −1) / 벤치 (최대 2 · 대상 불가 · 기본 훈련 없음 · +15 · 되돌리기 · 다음 턴 비움) / 대상 판정 (단일 pickR · onlyZones, 원 안 0명 거절, 전체, 주인 벤치면 불가) / 상승이 서 있는 구역 스탯으로 / 고유 ×1.5 (주 스탯 구역) / 코치 ×1.3 · 대비 ×1.5 대상별 / 점수 = 기본 + 카드 − 실패 / 0장 턴 끝 / `lessonRest` 없음 / JSON 왕복에 zones · bench / 뷰 · 미리보기 · `dropCandidates` 순수. **지움:** 범위 ÷ 인원 · 두 모드 · 울리카 파트너 · 쉬기 · 자율 훈련 |
| `cardEffects.test` | 66장 기대값 표를 고정 배치(구역 지정 픽스처)로 다시 쓴다 — 기본 · 강화 · 코치 구역 ×1.3 · 유대 80 · 대비 구역 ×1.5 · 방침 게이트 |
| `lessonRules.test` | D5/D6 (턴 끝 퍼펙트가 기본 훈련으로 닿는 경우 포함) · D22 · 10.1 키 매핑 그대로, D30 쉬기 항목 → 벤치 |
| `lessonRun.test` | `{ type: "lesson", zone }`, specials 1곳, 특별 목표 · 상한 ×1.15/×1.2, 유대 +5 = 중점 구역, 기록 필드, v1 → v2 이행 · 레슨 중 v1 거절 |
| `manager.test` | 15주 완주 그대로. 추천이 늘 유효한 행동 (bench · play의 `at`이 실제로 대상 ≥ 1), rng 없음 |
| `lessonLayout.test` | `pointerToField`, `fxPlan`(scatter · base · bench), 그리기용 원 반지름 (rx · ry), 토큰 자리 = 뷰 positions |
| `lessonUi.test` | 클릭 조준 → 경기장 클릭 → seq +1 · 저장 / 키보드 후보 돌기 → Enter / 명단 [벤치] → 벤치 칸에 토큰 / [턴 끝] → 새 배치 / 다시 그려도 조준 유지. 끌기는 jsdom에 레이아웃이 없어 `pointerToField` 단위 테스트 + 브라우저 스크린샷으로 본다 |
| `ui.smoke` · `outgame.test` | 레슨 한 장 내기를 `at`으로. 필수 선택자 `.ls-bench` · `.zone-pad` 추가, `.ls-rest` 없음 |
| 그 밖 | `rng` · `run` · `match` · `v05` · `challenge` · `layout` · `lineup` · `orient` · `stage`는 그대로 통과 |

### 14.18 시뮬

- `tools/lesson_sim.mjs`(실제 엔진 + 감독 AI) 출력에 더한다:
  - 구역 상승 = 기본 + 분위기 + 카드 / 부 스탯, 기본 비중
  - 고르게 크기 (주 스탯 최저 / 최고, 선수별 주 스탯)
  - 벤치 회수 / 런 · 벤치 있는 턴 % · 벤치 2회 이상 런 %
  - 시즌별 일반 · 특별 점수 p30 / p90
  - 역습 · 점유 · 압박 지표
- 비교 기준은 보정 시뮬(스크래치패드 `zone_sim.mjs`, 위 §14.1 요약)이다.
- **구현 확인 띠** (수치 조정이 아니라 "규칙을 문서대로 만들었나" 점검 — 띠 밖이면 규칙 차이를 찾는다):
  - 2-2-2 런당 성장 5,900~7,300
  - 기본 비중 30~40%
  - 부상 0.9~1.7
  - 벤치 2~10회 / 런
  - 시즌1 일반 점수 평균 400~520
- 사람의 자유 배치 · 감독 AI의 후보 점이 시뮬의 "구역 무리 근사"보다 원을 잘 놓으므로 성장은 조금 높게 나올 수 있다. 결과는 보고만 한다 (밸런스는 나중에 한 번에).
- `tools/drafts/lesson_sim.mjs`(옛 초안 시뮬)는 그대로 둔다. 보정 시뮬 `zone_sim.mjs`는 `tools/drafts/zone_sim.mjs`로 옮겨 커밋한다 (ZE5) — 재현 명령은 §14.1의 env 그대로.

### 14.19 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건 (§12와 같음):
- `npm test` 통과
- 경기 쪽 파일 diff 0

슬라이스 사이 규칙: 다음 슬라이스가 고칠 테스트는 `test.skip` + 주석 `zone-pending:<슬라이스>`로 꺼 둔다. 그 슬라이스가 다시 켠다. ZI의 완료 조건은 `grep -rn "zone-pending" test` 0건이다.

**ZE1 · 구역 기하 + 데이터 키** (덧붙이기만, 동작 불변)
- 할 일:
  - `js/engine/zones.js` (§14.6 함수 전부)
  - `lesson.json`에 `zones` · `base` · `bench` · `focus` · `unique` · `cardGainScale` · `special.capMult` **추가** (아직 읽지 않음)
  - `test/zones.test.mjs`, `package.json` test 목록
- 완료 조건: zones.test 통과, 나머지 테스트 그대로

**ZE2 · 카드 데이터 + 레슨 핵심**
- 할 일:
  - `cards.json` v2 (§14.8 · §14.9, 문구 포함), `cards.js` (kind · size · onlyZones, `targetsFor(state, def, { at, playerId })`, 1인 `costBase`, 지울 export 정리)
  - `lesson.js`: 흩어지기 · 턴 흐름 · 기본 훈련 · 벤치 · §14.7 · 점수 · 레슨 끝(자율 훈련 제거) · `lessonRest` 제거 · 뷰 · 미리보기 · `dropCandidates` · lastFx
  - `lesson.json` v2 (지울 키)
  - 방침 패시브는 문맥 이름만 바꾸고 판정은 ZE3에서 (방침 테스트는 zone-pending)
  - cards.test · lesson.test 핵심 항목 · cardEffects.test(방침 게이트 제외)
- 완료 조건: §14.17 lesson.test 항목 중 방침 외 전부 통과, 결정성 · JSON 왕복 · 순수 뷰

**ZE3 · 방침 구역 판정**
- 할 일:
  - §14.11 전부 (탈취 · 점유 · 분위기 → 기본 훈련, 압박 쉬기 규칙 제거), 칩 · 노트 문구
  - 66장 퍼즈 테스트 갱신 (탭 → 무작위 drop 점 · 벤치 행동 포함, 매 행동 뒤 불변식 + 벤치 ≤ 2 + 벤치 선수 기본 훈련 0)
- 완료 조건: lesson.test 방침 항목 · 퍼즈 · cardEffects.test 전부

**ZE4 · `lessonRun.js`**
- 할 일: §14.13 lessonRun 표 · v2 이행 · 주 뷰 `expected` · `boosted` · 보상 결과 · lessonRules.test · lessonRun.test
- 완료 조건: 두 테스트 통과, `registeredTeam` → 도전 스냅샷 통과

**ZE5 · 감독 AI + 시뮬**
- 할 일: §14.14, manager.test, `tools/lesson_sim.mjs` 지표 추가, `tools/drafts/zone_sim.mjs` 커밋
- 완료 조건: manager.test 60초 안, `npm run lesson-sim` 출력을 보고에 붙이고 §14.18 확인 띠 안 (밖이면 원인 보고)

**ZU1 · 공용 UI**
- 할 일:
  - `labels.js` (대상 · 구역 · 중점 라벨)
  - `cards.js` 앞면 · `estimateCost`
  - `lesson_layout.js` (`pointerToField` · `circlePx` · `fxPlan`, `drillSpot` · `drillZone` 제거)
  - 주 화면 중점 구역 카드, 보상 · 상담 · 덱 문구, 미팅 편집기 표시
  - lessonLayout.test · outgame.test 해당 부분
- 완료 조건: jsdom 주 화면 → 레슨 시작, 카드 앞면 잘림 없음 (shot)

**ZU2 · 레슨 화면 끌어다 놓기**
- 할 일:
  - `screens/lesson.js` (구역 바닥 · 토큰 자리 · 끌기 · 조준 미리보기 · 벤치 칸 · 대체 조작 · 연출 · `?autolesson=1`이 bench · play `at` · endTurn을 따름), `lesson.css`
  - `store.lessonUi` = `{ aim, drag, shownSeq, busy, timer, gen }` (taps · restPick 지움)
  - lessonUi.test
- 완료 조건:
  - jsdom: 조준 → 내기 → seq +1 · 저장, 벤치 · 복귀, 턴 끝 재배치
  - 1280×720 스크롤 없음, 토큰 · 이름표 · 원 라벨 겹침 검사 통과

**ZI · 통합 · 시나리오 · 감사 · 문서**
- 할 일:
  - `lesson_scenarios` 갱신: og_lesson_pick → `_aim_single`, `_aim`(큰 원 미리보기) · `_pair` → `_small`, `_rest` → `_bench`, 새 `_drag`(끄는 중 프레임) · `_scatter`(턴 시작 연출 중간) · `_crowd`(한 구역 6~7명)
  - shot 검사에 원 · 라벨 겹침
  - 브라우저 한 판 점검 (끌기 · 터치 시뮬)
  - ARCHITECTURE §20 · README · OUTGAME_CARDS_draft 수치 확인
  - 이 절에 "14.21 구현 중 바뀐 것" 추가
  - `zone-pending` 0건
- 완료 조건: `npm test` 전부, `node tools/shot.mjs og_` 검사 통과, 스크린샷 경로 보고

**ZD · 배포**: 브랜치 푸시 → `lesson-redeploy.yml`이 `/soccer/lesson/`을 다시 올린다 (§2.3). 푸시는 기획자에게 확인받은 뒤에 한다.

순서 의존: ZE1 → ZE2 → ZE3 → ZE4 → ZE5. ZU1은 ZE2 뒤(뷰 계약 §14.13 고정)부터 할 수 있다 → ZU2 (ZE3 · ZE4 필요) → ZI → ZD.

### 14.20 [가정] · [구현 결정] 목록 · 기획자가 정할 것

**[가정] — 브리프 기본값 (기획자 확인 대상)**
1. 레슨 주에는 종목 대신 **중점 구역** 1곳을 고른다 (서 있을 가중치 ×2, 그 구역 상승 ×1.5). 특별 표시는 1곳이고, 그 구역을 중점으로 고르면 ×2.0 · 목표 ×1.15 · 상한 ×1.2 (보정 권고 — 브리프의 ×1.3 대신).
2. 원 · 전체 카드 위력은 **1인당** (원 안 인원이 많을수록 합계가 크다), 비용도 1인당, 실패 판정은 카드 1장에 1번 (가장 위험한 대상, L16).
3. 원 크기: 작은 ≈ 2명 (r 4.2u), 중간 ≈ 한 구역 (9u), 큰 ≈ 이웃 두 구역 (17u). 짝 카드 → 작은 원, 1라인 → 중간 원, 2라인 → 큰 원, 전 라인 → 전체. 마무리 일격 → 공격 구역(슈팅 · 드리블 · 패스)에 선 선수만.
4. 고유 카드: 주인 단일, 주인이 자기 포지션 주 스탯 구역에 서 있으면 ×1.5, 캐릭터 효과(예전 지원 모드)는 늘. L13 두 모드 폐지.
5. 코치 카드 ×1.3은 대상이 코치 타입 구역에 서 있을 때만. 대비 카드 ×1.5도 대상의 구역 기준.
6. 방침: 탈취 = 대상 전원이 수비 · 피지컬 구역이면 쌓고, 공격 구역 대상이 있으면 씀. 점유 = 패스 구역 대상 +1, 없으면 −2. 분위기 = 스택마다 기본 훈련 +. 압박 · 호조 · 집중은 그대로 (쉬기 압박 회복 · 쉬기 턴 분위기 −2는 없어짐).
7. 벤치: 기본 훈련 없음 · 대상 불가 · 턴 끝 +15 · 다음 턴 다시 구역으로. 턴 전체 [쉬기] 버튼은 없어지고 [턴 끝]은 남는다. 한 턴 최대 2명.
8. 레슨 점수 = 7명의 구역 스탯 상승 전부 (기본 + 카드, 실패 −5). 목표 430 / 510 / 600, 상한 520 / 620 / 730.
9. 회복 카드 · 도르비나 고유 · 수비 복귀의 회복 대상은 구역이 아니라 포지션 (GK · DF). 기본 훈련과 분위기 몫에는 부 스탯이 없다.

**[구현 결정] — 이 계획이 정한 세부**
- 구역 중심 좌표 · 대형 반지름 · 원 반지름 · pickR (§14.2), 토큰 중심이 원 안이면 대상
- 분위기 1스택 = 기본 훈련 +0.96 (시뮬 코드 값)
- 기본 훈련에 컨디션 · 훈련 효율을 곱한다
- 팀워크는 "성공 인원 − 1"로 통일 (짝 +2 규칙 폐지)
- 카드 0장으로도 [턴 끝]
- 벤치는 턴 중 아무 때나, 되돌리기 가능
- 회복 단일은 벤치 · 결장 선수에게도 낼 수 있다
- 유대 +5 = 중점 구역 = 코치 타입
- 감독 AI는 특별 표시 구역을 늘 고른다
- "중점 구역" 이름 (에이스형 "집중" 버프와 구분)
- 저장 v2 이행 (레슨 중 v1 거절)
- 1인 위력 정수 반올림, 범위에서 바뀐 카드 강화판 = round(1인 × 1.25)

**기획자가 정할 것 (보정 시뮬에서 나온 질문)**
- **Q1. 고르게 크기 (기준 3 미달).**
  - 2-2-2에서 가장 덜 큰 선수 / 가장 많이 큰 선수 = 0.54~0.56 (기준 0.60 이상, 지금 모델 0.56~0.60).
  - 손잡이로는 안 된다: 극단까지 돌려도 0.53~0.57, 기본 비중 80%에서도 0.63.
  - 원인은 구조다.
    - 네리아(GK)는 훈련 칸 가중치의 80%가 수비 · 피지컬에 몰려 있다 (DF · FW 65%, MF 60%).
    - 수비 · 피지컬 성장률이 1.25 / 1.15로 높다.
    - 수비 ↔ 피지컬은 서로 부 스탯이라 부 스탯 상승도 주 스탯이 된다.
    - 수비 쪽 구역에 사람이 몰려 원에 자주 들어간다.
  - 진단:
    - GK 가중치를 DF와 같게 (`{"GK":{"shoot":5,"dribble":10,"pass":20,"defense":40,"physical":25}}`) → 0.63~0.68
    - 감독 AI가 덜 큰 선수를 더 쳐줌 → 0.68~0.73
  - 정할 것: (a) GK 가중치를 낮출지 (`config.training.slotWeights.GK` — 이 계획은 config를 바꾸지 않는다), (b) "고르게"를 탐욕 감독 AI 기준으로 잴지 사람 플레이 기준으로 잴지.
- **Q2. 포메이션.**
  - 3-1-2 · 1-3-2는 원래부터 낮다 (0.44~0.51 · 0.37~0.40). 인원이 많은 라인이 덜 크고, 1-3-2에서는 MF로 간 아델린이 가장 덜 큰다. 3-1-2는 지금 모델보다 좋아졌다.
  - 2-3-1 · 3-1-2의 팀형 성장이 6,213 · 6,235로 목표 6,300 밑으로 조금 내려간다.
- **Q3. 주 휴식이 런당 약 1번 늘었다** (기본 훈련 체력 1, 2.9~3.6회). 기본 훈련 체력을 0으로 할지 그대로 둘지.
- **Q4. 카드 이름.** "FW 라인 드릴" · "수비 조직 훈련"처럼 라인 · 포지션이 들어간 이름이 이제 대상과 맞지 않는다 (중간 원 · 큰 원). 이번에는 이름을 두고 대상 칩으로 보여 준다. 바꿀지는 나중에.
- **Q5. 점유형 스택이 잘 쌓이지 않는다** (패스 구역 인원이 적어 깨질 때 평균 0.6스택). 수치는 밸런스 때.

### 14.21 구현 중 바뀐 것

- ZE1 [가정 Q1-a]: 흩어지기 가중치는 `config.training.slotWeights`가 아니라 `lesson.json zones.weights`를 읽는다 (slotWeights 사본, GK만 DF와 같은 `{shoot 5, dribble 10, pass 20, defense 40, physical 25}`). config.json은 그대로라 옛 run 테스트에 영향 없음. 가중치 계산은 `zones.zoneWeight(cfg, pos, zone, focusZone, focusWeight)`.
- ZE1: `zones.js`에 §14.6 목록 밖 export를 더했다 — `clampPoint(at)`(놓은 점 [0,100]² 자르기), `areNeighbors(a, b, cfg)`(구역 중심 거리 ≤ `NEIGHBOR_MAX_U` 30.5u — 22.7 · 30 쌍이 이웃, 48u 이상은 아님), `zoneWeight`.
- ZE1: `candidatePoints(positions, cfg, { kind, r | size, zoneOf, ids })` — 인자를 늘렸다 (원은 구역 판정에 `zoneOf` = `lesson.zones`가 필요, 단일은 `ids`로 후보 제한). 반환 `[{ at, ids, kind: "zone"|"player"|"between"|"field", zone?, zones?, playerId?, players? }]`, `ids` = 그 점의 대상. 전체 · 주인 · 없음은 `(50, 50)` 한 점(`ids` = 경기장 전원), 회복 단일의 7명(`playerId`) 후보는 `dropCandidates`(ZE2)가 만든다. 가운데 점은 소수 2자리.
- ZE1: 큰 원(17u)이 22.7u 이웃 두 구역의 가운데에서 "두 무리 전원"을 잡는 것은 무리당 4명까지다 (5명 이상 대형 R 6.5u면 11.35 + 6.5 > 17이라 가장자리 1명이 빠질 수 있다 — §14.2의 "거의 전원"). zones.test는 무리당 1~4명으로 고정했다.
- ZE2: `cards.targetsFor(state, def, { at, playerId }, data)` — 넷째 인자 `data`(구역 설정)를 더했다. §14.6 밖 export: `isBenched` · `fieldPlayers` · `fieldPositions` · `zoneCfg` · `isHealSingle`(single + power null) · `isSmallCircle` · `circleRadius` · `ownerOnMainZone` · `singleCandidates`. `deadReason(state, def)` 하나로 턴 시작 죽은 카드와 행동 중 낼 수 없는 카드(주인 벤치 등, `playable: false`)를 함께 판정한다. `costBase(def, { mood, press, mainMult })`.
- ZE2: LessonState 에 §14.13 밖 필드 `subGains`(부 스탯 상승) · `benchTurns`(벤치에서 보낸 턴 수)를 더했다 → `lessonResult.perPlayer[].sub` · `benched`. `lesson.scatterZones(state, data, rng)` · `ATTACK_ZONES` · `DEFENSE_ZONES` · `zoneMult` 를 export (테스트 · 감독 AI용). 카드 상승 fx 는 `{ t: "gain", id, stat, n, sub, subStat }`, 실패 fx 는 `stat` 을 더했다.
- ZE2: `previewCard` — 회복 단일은 `targets: []` + `healId`(회복 대상), 그 밖 필드 `total` · `kind` · `at`(자른 점). `circle` 은 대상 0명이어도 준다 (빨간 점선용). reason 문구 "원을 놓을 자리를 고르세요" · "선수 위에 놓으세요" · "원 안에 선수가 없습니다". `getLessonView` 에 `zones`(id → 구역) · `zoneMult`(중점 배율 1.5/2.0)를 더했다. 손패 `power` = 카드 1인 위력(고유는 35/44, ×1.5 전), `cost` = 지금 1인 비용(고유는 주인이 서 있는 구역에 따라 14/21).
- ZE2: `dropCandidates` 는 낼 수 없는 카드면 []. 회복 단일 = 7명 `{ at(경기장 위치, 벤치 · 결장이면 null), playerId, ids: [id], kind: "player" }`. 키보드 라벨은 엔진이 만들지 않는다 (UI 가 kind · zone · zones · playerId 로 만든다).
- ZE2: 방침 패시브 문맥을 `{ hasAttackZone, allDefenseZone, hasPassZone, smallCircle }` 로 바꾸면서 판정 · 노트 문구도 §14.11 대로 구역 기준으로 옮겼다 (값을 만들어야 문맥이 생기므로). 분위기 감소는 늘 −1 (쉬기 턴 −2 · `restBuffs` 없음), `buffs.possNoPass`, 칩 라벨 nextPairPct "다음 작은 원". ZE3 는 이것을 확인 · 테스트하고 칩 "분위기 3 · 기본 +2.9" 를 만든다. 66장 퍼즈도 ZE2 가 구역 방식(무작위 drop 점 · 벤치 · 매 행동 점수 = 기본 + 분위기 + 카드)으로 옮겼다 — ZE3 가 방침 불변식을 더한다.
- ZE2 [다리 — 다음 슬라이스가 지운다]: lessonRun 주 행동은 아직 `{ type: "lesson", stat }` 이고 `startLesson({ zone: stat })` 로 넘긴다. 기록 · 보상 결과는 `stat`(= 중점 구역) · `rests`(= 벤치 횟수) 키 그대로, `perPlayer.gain` = 기본 + 분위기 + 카드, `auto` 0 (ZE4). lessonRun 은 `lessonRest` 를 지우고 `benchPlayer` · `dropCandidates` 를 감쌌고, 주 화면 특별 상한은 `special.capMult` 로 계산한다. `manager.recommendCard` 는 §14.14 의 첫 판(벤치 < 25 먼저 · dropCandidates + previewCard EV · pref 1.2/0.8 · 분위기 0.96 · 최고 EV ≤ 0 이면 endTurn, Q1-b 보너스 없음)으로 바꿔 15주 완주가 돈다 (ZE5 가 다듬는다). `screens/lesson.js` 는 뷰의 `stat` 을 `zone` 으로 채우는 한 줄만 (ZU2). ui.smoke 완주 · manager.test 유효 추천 검사는 at · playerId · bench 로 고쳤다.
- ZE2: 감독 AI 첫 판(다리)으로 잰 2-2-2 고르게 크기 (런 끝 주 스탯 상승, 선수별 평균의 최저 / 최고, 방침 5개 × 40런 · 경기 없음) = 0.46~0.51. 런당 성장 6,362~6,677 · 기본 비중 31~33% · 벤치 5.4~7.4회/런 (§14.18 띠 안). Q1-b 보너스는 ZE5.
- ZE3: §14.11 판정(탈취 · 점유 · 분위기 → 기본 훈련 · 압박 쉬기 규칙 없음 · 호조는 대상 있는 카드만)은 ZE2 구현이 문서와 같아 엔진 판정은 바꾸지 않았다. 바꾼 것은 문구뿐 — 분위기 칩 값 = `"n · 기본 +x"`(라벨과 합쳐 "분위기 3 · 기본 +2.9", x = n × moodK × cardGainScale 소수 1자리, 0 이면 "0"), 대상 없는 카드의 분위기 노트 = "분위기 a → b · 기본 +x"(하이파이브 · 응원가 · 분위기 메이커 — 예전 moodX2 노트 "분위기 3 → 6" 대신), `labels.js BUFF_LABELS.nextPairPct` = "다음 작은 원"(엔진 칩 라벨과 같게).
- ZE3: 66장 퍼즈의 방침 불변식 = 테스트 모델 `expectBuffs`(패시브 §14.11 + 버프 effects(when success · consume) + 턴 끝 분위기 감소)를 매 카드 · 턴 끝 뒤 실제 버프와 비교. 벤치 행동은 버프 불변, 턴 끝 기본 훈련 fx = 직전 뷰 `baseNext`, 분위기 칩 문구도 매 행동 확인.
- ZE4: `lessonRun` — 주 행동 `{ type: "lesson", zone }`(예전 `{ stat }` 은 거절), `getWeekView().lessons[]` = `{ zone, label, special, prep, target, cap, turns, expected, boosted }` (`label` · `prep` 는 남겼다). `expected` 는 결장 선수를 빼고 `zones.zoneWeight` 식으로 센다, `boosted` = 덱에 고유 카드가 있고 결장이 아닌 선수 중 그 구역이 포지션 주 스탯인 선수. 기록 `record.lessons[]` · 보상 결과는 `zone` · `benches` (`stat` · `rests` 지움), `result.perPlayer` = `lessonResult` 모양 그대로.
- ZE4: 저장 — `lessonRun` 에 `SAVE_VERSIONS [1, 2]` · `isLessonRunSave(s)`(1 · 2) · `canMigrateLessonRun(s)` export 를 더했다. store 사본 `LESSON_RUN_SAVE_VERSIONS` · `isLessonRunSave` 는 1 · 2 를 받고 outgame.test 가 엔진 `isLessonRunSave` 와 비교한다. `continueRun` 은 `migrateLessonRun` 뒤 `isLessonRun` 이 거짓이면 저장본을 지우고(`clearRunSaves` — "저장 없음") info 토스트 "구역 방식으로 바뀌어 진행 중인 레슨은 이어 할 수 없습니다".
- ZE4: 인터페이스가 바뀐 곳만 최소로 고쳤다 (개편은 ZU1) — `manager.recommendWeek` 는 `{ type: "lesson", zone }` (이유 문구 "…구역"), `week.js` 레슨 카드 `data-zone` · 고유 ×1.5 = `ls.boosted` · 특별 문구 "목표 ×1.15 · 상승 ×2" · 머리 "중점 구역을 고르세요", `reward.js` 결과 머리 "◯◯ 중점" · "벤치 n" · 선수 칩 = 기본 + 분위기 + 카드 ("자율" 지움). `?autolesson` · 시나리오는 감독 AI 를 따르므로 그대로.
- ZE4: lessonRules.test D30 은 "레슨 벤치 회복 +15 (restEffect 무관) · 경기장 선수 기본 훈련 체력 −1" 로, D5 · D6 은 "턴 끝 기본 훈련으로 퍼펙트" 로 바꿨고, "카드로 퍼펙트면 그 턴 기본 훈련 · 벤치 회복 없음"(§14.12) 테스트를 더했다.
- ZE5 [가정 Q1-b]: 감독 AI 덜 큰 선수 보너스 — 대상이 **자기 포지션 주 스탯 구역**에 서 있을 때만 pref 1.2 에 `even_i = ((7명 평균 주 스탯 상승 + 50) / (i 의 주 스탯 상승 + 50))^1.75` 를 곱한다 (주 스탯 상승 = 지금 포지션 주 스탯 2개 − 캐릭터 `baseStats`, 런 처음엔 1). `manager.evenWeights` · `mainGrowth` export. 2-2-2 `npm run lesson-sim` (200런 · 경기 포함) 고르게 크기 = ace 0.65 · team 0.63 · counter 0.67 · press 0.63 · poss 0.62 (보너스 없으면 0.49~0.52, 지수 1.5 면 team 0.59). 주 스탯 구역 밖 상승에도 곱하면 같은 지수에서 주 스탯 지표가 덜 올라 (경기 없음 40런, 지수 2: 0.56~0.65 vs 0.62~0.71) 주 스탯 구역으로 한정했다.
- ZE5: `recommendWeek` 의 마지막 규칙을 §14.14 대로 "7명 합이 가장 낮은 구역" 으로 (ZE2 다리는 주 스탯 합). 회복 단일은 `dropCandidates` 7명 중 체력 최저(출전 선수 먼저) 1명만 미리보기로 재고, 회복 가치는 그 선수가 실제로 회복하는 양 (체력 100 에서 멈춤) 기준.
- ZE5: 감독 AI 는 특별 표시 구역을 늘 고르므로 기본 `npm run lesson-sim` 에는 일반 레슨이 없다 → `tools/lesson_sim.mjs --special-rate r` (시뮬 전용 rng, 보정 시뮬의 0.7) 로 일반 레슨 점수를 잰다. 0.7 에서 시즌1 일반 평균 447~472 (띠 400~520 안).
- ZE5 [띠 밖]: 런당 부상 1.94~2.26 (띠 0.9~1.7). 보너스 없을 때도 1.6~1.9 였다 (경기 없음 120런). 원인: 실제 감독 AI 가 체력이 내려간 대상에게도 카드를 내 실패 판정이 런당 4.0~4.4 (보정 시뮬 2.3~2.8) — 카드의 약 4할이 실패율 10% 이상. 보너스가 덜 큰 선수(주로 FW)에게 카드를 모아 +0.2 더한다. 감독 AI 의 실패 손실 상수(5 + 40)는 §14.14 그대로 두었다 (밸런스 때).
- ZE5: 보정 시뮬을 `tools/drafts/zone_sim.mjs` 로 옮겼다 — 데이터 경로만 파일 기준으로 바꾸고 재현 명령 (`BASE=3.2 BC=1 GS=0.32 node tools/drafts/zone_sim.mjs 400`, Q1 진단 `SW` · `EVENAI`) 을 머리 주석에 적었다.
- ZU1: `labels.js` — `CARD_TARGET_LABELS` 를 구역 방식 5종(단일 · 원 · 전체 · 주인 · 대상 없음)으로 바꾸고 `CIRCLE_SIZES` · `CIRCLE_SIZE_LABELS` · `ZONE_IDS` · `ZONE_LABELS`("패스 구역") · `ZONE_ICONS` · `ATTACK_ZONES` · `DEFENSE_ZONES` · `FOCUS_LABEL`("중점 구역") · `zoneLabel` · `zonesText`(공격 구역 3곳 = "공격 구역") · `multText`("×1.5")를 더했다. 방침 설명의 배치 라인 말(역습형 "수비진이 쌓고 공격진이…", 점유형 "MF를 거쳐…")을 구역 말로 바꿨다 (`data/policies.json` desc · `POLICY_DESC` 둘 다).
- ZU1: `ui/cards.js` — `targetInfo` · `targetText`(대상 칩: "작은 원" · "공격 구역 단일" · "선수 1명 회복" …) · `powerText`("1인 18") · `estimateCost(view, def, { mainMult })` · `costText(view, def, data)` · `effectDesc` 로 다시 썼다 (`rangeCount` · `descForMode` · 모드 표시 지움). 비용 줄: 원 · 전체 "체력 −11 /명", 단일 "체력 −21", 손패 밖 고유 카드 "체력 −14~21"(주인이 주 스탯 구역에 서 있으면 큰 값). 효과 문구는 cards.json desc 의 "대상 · 1인 N" 머리를 빼고 보여 준다 (칩 · 위력 줄과 겹침). 고유 카드 위력 줄 옆에 작은 "주 스탯 구역 ×1.5". 대상 아이콘 `.cf-ticon` (원 3단계 크기 · 단일 점 · 전체 · ★주인 · +회복).
- ZU1: `lesson_layout.js` — `drillSpot` · `drillSpots` · `drillZone` 를 지우고 `tokenSpots(view)`(경기장 선수 = 뷰 positions, 벤치 · 결장 null) · `pointerToField(cx, cy, rect)` → `{ x, y, inside } | null`(0~100 으로 자르고 소수 2자리, 빈 rect 면 null) · `circlePx(r, aspect, W, H)` → `{ rx, ry }` 를 더했다. `fxPlan` 반환 = `{ play: { targets, cost, gain{n, sub, stat, subStat}, fail{n, injured, stat}, heal, buffs, tw }, turn: { base, baseStat, baseCost, bench, heal, buffs, turn } | null, scatter, draw, bench: [{ id, on }], end: { status, heal } | null }` (`tick` · `auto` 지움 — turnEnd 뒤 회복 = 레슨 끝 회복). `scoreAfterPlay` = 최종 점수 − 턴 끝 기본 훈련 합. `screens/lesson.js` 는 [다리]로 토큰 자리 = 뷰 positions(벤치 · 결장은 편성 자리), 훈련장 그림 없음, 대상은 제자리 훈련 동작, 턴 끝 팝 = 기본 훈련 · 벤치 회복만 고쳤다 (ZU2 가 새로 쓴다).
- ZU1: 주 화면 — 레슨 · 대비 카드 = 중점 구역 5장 (`.wl-focus` "서 있을 확률 ×2 / 상승 ×1.5"(특별 ×2.0) · `.wl-exp` 예상 인원 · 고유 ×1.5 얼굴). 턴 수 · 일반 목표 · 퍼펙트는 머리 줄 `.week-lhead` 에 한 번, 특별 구역 카드만 자기 목표(`.wl-target`, 495 · 624)를 보여 준다. 카드 줄 아래 한 줄 설명 `.week-focus-note`. 덱 보기 모달의 카드 줄에 대상 칩 문구("공용 · 중간 원")를 더했다.
- ZU1: 보상 모달 선수 칩 = 1줄 이름 · 2줄 구역 스탯 합 + `byStat` 상위 2개(아이콘 + 양) · 3줄 "기본 n / 카드 n · 부+n" (기본 = 기본 훈련 + 분위기 몫). `byStat` 은 스탯 순변화라 부 스탯 상승도 들어간다 → 상위 2개에 부 스탯이 나올 수 있다 (합계 숫자는 구역 스탯만). "강화 후" 줄 "위력 a → b" → "1인 a → b".
- ZU1: 미팅 · 경기 전 준비 편집기 — 표시 "고유 카드 모드 변경" → "고유 ×1.5 구역 변경", 설명 "고유 카드 ×1.5 구역: 수비 · 피지컬 → 드리블 · 패스". 상담 고유 카드 삭제 확인 문구를 "고유 카드(주 스탯 구역 ×1.5 · 캐릭터 효과)" 로. `tools/shot.mjs` 잘린 글자 검사에 `.rw-pl-split` · `.rw-pl-by` · `.cf-cost` · `.wl-focus` · `.wl-target` · `.week-lhead` 를 더했다.
- ZU2: 구역 라벨 칩(`.zone-chip`: 키 번호 · 아이콘 · "수비 구역" · 중점 "중점 ×1.5" / 특별 "★ ×2.0")은 위 줄 · 아래 줄 모두 **바닥 바로 위**에 둔다 (§14.16 의 "아래 줄은 아래쪽" 대신) — 아래 줄 대형(4 · 6명)의 맨 아래 이름표가 y 88~99% 까지 내려와 바닥 아래 라벨과 겹친다. 경기장의 경기용 세로 구역 줄무늬(`.zone` 5칸)는 구역 바닥과 헷갈려서 레슨 화면에서는 그리지 않는다 (선 · 박스 · 원은 그대로).
- ZU2: 이름표 자리 = 대형 바깥쪽 — 옆으로 벌어진 선수(|dx| > 1.2·|dy|)는 바깥 옆(`.lp-r` · `.lp-l`), 나머지는 아래 (위 선수의 아래 = 대형 가운데 빈 곳), 3명 대형의 위 선수는 오른쪽 옆 (아래 이름표가 아래 두 얼굴 사이에 닿음). 4명 이상 대형은 이름 앞 2글자 · 체력 숫자 없음 (`.short`). 실패율 표(⚠)는 얼굴 위 바깥쪽 모서리. 조준 중 대상의 예상 상승 "+N" 은 따로 말풍선을 띄우지 않고 **이름표 자리**를 바꿔 쓴다 (겹침 없는 자리 그대로 — 7명 대형에서도), 실패 후보는 빨간 고리 · 실패율은 원 꼬리표와 dock 안내에만. `tools/shot.mjs` 겹침 검사에 이름표 ↔ 이름표 · 이름표 ↔ 다른 얼굴 · 구역 라벨 ↔ 얼굴 · 이름표 · 실패율 표 · 원 꼬리표를 더했다.
- ZU2: 경기장 밖 선수(벤치 · 결장)의 토큰은 경기장에 그리지 않는다 (`.tok.off`, 벤치 선수는 자기 구역 가운데에 숨겨 두었다가 복귀 · 새 턴에 거기서 뛰어나온다). 벤치는 옆 칸 맨 위 `.ls-bench` 칸 2개(얼굴 · 이름 · "체력 18 → 33"), 칸을 누르거나 경기장으로 끌면 복귀, 결장은 명단 줄의 "부상/결장"만. 명단 줄 = 구역 · 체력 · 실패율 · [벤치]/[복귀] (예전 "대상 n회" 칸은 title 로).
- ZU2: 조준 모드(`store.lessonUi.aim = { uid, idx, at, playerId }`) — 마우스 경기장 클릭은 그 점에 바로 낸다, 조준 카드를 한 번 더 누르면 전체 · 주인 · 없음 카드 = 내기, 원 · 단일 = 자리가 정해졌으면(키보드 · 탭) 내기 · 아니면 조준 취소. 숫자 키 1~5 = 수비 · 패스 · 슈팅 · 피지컬 · 드리블 (화면에서 읽는 순서, 조준 중 라벨 칩에 번호). 회복 카드는 명단 줄 · 벤치 칸을 눌러도(끌어 놓아도) 그 선수. 원 꼬리표("6명 · +128 · 실패 2%")는 원 바깥 모서리 중 경기장 안이고 구역 라벨과 겹치지 않는 첫 자리. Esc 로 끌기를 취소하면 포인터를 놓을 때까지 '취소됨'으로 남아 놓아도 아무것도 하지 않는다.
- ZU2: `lessonUi` = `{ aim, drag, shownSeq, busy, timer, gen }` (selectedUid · taps · restPick 지움). 연출 시간 `LESSON_T = { act 280 · hold 560 · tick 650 · scatter 450 · turn 260 · end 1000 · auto 600 · aimShow 320 }` — `?autolesson=1` 은 추천 자리를 320ms 보여 준 뒤 manager 추천의 `{ uid, at, playerId }` 를 그대로 낸다.
- ZU2: 스크린샷 시나리오 — `tools/shot.mjs` 단계에 `{ hoverAt | clickAt: { sel, x, y } }`(요소 박스 %) · `{ key, times }` · 드래그 `at` 을 더했다. ZI 목록 일부를 먼저 했다: og_lesson_pick → `_aim_pick` · `_aim_single`, `_aim` = 큰 원 hover, `_pair` → `_small`, `_rest` → `_bench`, 새 `_keys` · `_drag` · `_drag_ghost` · `_drag_bad` · `_drag_single` · `_drag_heal` · `_drag_bench` · `_drop` · `_drop_bench` · `_play` · `_base` · `_scatter` · `_crowd`(패스 6 + 1) · `_crowd7`(드리블 7) · `_crowd_aim`. `og_lesson_injury` · `_fail` 상태 찾기는 마지막 턴을 뺀다 (구역 방식은 남은 사용 0 이면 턴이 끝나 마지막 턴이면 레슨이 끝난다), `_injury` 의 ready 는 명단 `.ls-row.out`, `_turnend` 의 ready 는 기본 훈련 팝 `.ls-pop.base`.
- ZI: 시나리오 정리 — 옛 범위 카드 찾기(`RANGE`)를 전체 카드(`isAllCard`)로, 엔진 `playCard` 의 `taps` 인자를 지웠다. `og_lesson_mid`(제자리 훈련) · `_fail` · `_turnend` · `_end` 는 타이머 고정을 **클릭 전에** 풀어 연출 중간 프레임이 정확하다. 새 시나리오: `og_lesson_touch`(hasTouch 뷰포트에서 실제 터치 탭: 카드 → 구역 가운데 = 원 놓기) · `og_lesson_touch_drag`(손가락 끌기 중) · `og_reward_perfect_16 / _18 / _24 / _32`(덱 크기 주입). `tools/shot.mjs` 단계에 `{ tap }` · `{ tapAt }` · 드래그 `touch` 를 더했다.
- ZI: shot 검사 추가 — **원 판정**(그린 `.aim-circle` 타원 안에 얼굴 중심이 있는 토큰 = 엔진 미리보기 대상 `.target`, 테두리 ±3px 제외. 원을 0.3배로 그리게 일부러 망가뜨리면 걸리는 것을 확인), 원 꼬리표가 경기장 밖이면 걸림.
- ZI: 브라우저 한 판 점검 도구 `tools/lesson_play.mjs` — 실제 입력(마우스 끌기 · 터치 끌기 · 터치 탭 · 마우스 클릭 · 키보드)으로 감독 AI 추천을 돌아가며 내고, 행동마다 엔진 변화와 **놓기 직전 화면의 대상 = 실제 대상(lastFx)** 을 확인한다. 주 · 보상 · 상담 · 준비 · 경기(⏭ → 확인) · 유물 · 루트도 화면 버튼으로. 1280×720 역습형 15주 완주(레슨 9 · 상담 3 · 경계전 3, 실제 입력 행동 약 130번)와 팀형 시즌 1, 915×412 isMobile 터치 전용 에이스형 시즌 1 에서 입력 실패 · actions 대신 · 대상 불일치 · 에러 · 스크롤 0.
- ZI [고침]: 퍼펙트 보상 모달에서 덱이 17장 이상이면 무료 강화 그리드가 3줄이 되어 모달이 38px 넘치고 [확인]이 화면 밖으로 밀렸다 (브라우저 점검 시즌 3 덱 18장에서 발견, 그전 촘촘 기준은 24장 초과). 16장 초과면 `.rw-deck.dense`(문구 줄 접기 · 위아래 여백 축소) → 32장(4줄)까지 들어간다.
- ZI [고침]: 경기장 click 으로 놓는 자리가 미리보기와 어긋날 수 있었다 — click 좌표는 정수 px 로 반올림되고(hover 미리보기 · 끌기는 소수 px), 터치 탭이면 Chrome 터치 보정이 가까운 토큰 쪽으로 몇 px 당긴다 (토큰 얼굴 옆 24px 탭 → click 은 7px 안쪽). 브라우저 점검에서 마우스 클릭으로 낸 원의 테두리 선수 1명이 "화면 대상 5명 / 실제 4명" 으로 갈렸다. 놓는 자리는 경기장 `pointerup` 좌표(1초 안 · 16px 안일 때)를 쓴다 (`screens/lesson.js`).
- ZI [발견 · 밸런스 때]: 감독 AI 후보 점(두 구역 가운데 · 두 선수 가운데)은 가장자리 선수가 원 테두리에 거의 닿는 자리가 많다 — 큰 원(17u)이 22.7u 이웃 두 구역의 4명 무리 둘을 다 잡는 여유는 0.15u(약 1.5px). 브라우저 점검에서 추천 자리와 0.03~0.4% 다른 자리(터치 정수 px)에 놓으면 가장자리 1명이 빠졌다 (화면 미리보기는 늘 실제와 같아 사람은 보고 고칠 수 있다). 반지름을 17.5u 로 올리면 여유 0.65u(≈6px)이고 세 번째 구역(24u)은 그대로 밖이다 — 수치는 바꾸지 않았다.
- ZI: [가정 Q1] 기본값 확인 — 흩어지기 가중치는 `lesson.json zones.weights`(GK = DF 와 같은 `{shoot 5, dribble 10, pass 20, defense 40, physical 25}`), config.json 은 그대로. 감독 AI 덜 큰 선수 보너스(ZE5, 지수 1.75)로 2-2-2 고르게 크기(가장 덜 큰 / 가장 많이 큰 주 스탯) = 0.62~0.67 (ace 0.65 · team 0.63 · counter 0.67 · press 0.63 · poss 0.62, 기준 0.60 이상).
- ZI: 문서 — ARCHITECTURE §20 (구역 방식 요약 · zones.js · 저장 v2 · lessonUi · 시나리오 · shot 검사 · lesson_play · 테스트 283), README (구역 방식 조작 · 테스트 수 · 도구), OUTGAME_CARDS_draft 표 66장의 대상 · 1인 위력 · 1인 비용을 `data/cards.json` 과 대조 (모두 같음, 고유 35/44 · 비용 14/21, 목표 · 상한 430/520 · 510/620 · 600/730 = `lesson.json`). `zone-pending` 0건.

---

## 15. 코치 지원 · 컷인 (L37) · 작은 원 카드 (L38)

> 상태: 구현 계획 · 2026-10-04 · 브랜치 `outgame-lesson`. 기준: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L37 · L38 (사용자 결정 2026-10-04: 빈도 레슨당 2~4번 · 코치별 추가 능력은 출발점 표로 · 작은 원 크기는 그대로, 공용 카드 1~2장 추가 · 단일 카드 몇 장 변환). 조사: [RESEARCH_gakumas_trainer.md](RESEARCH_gakumas_trainer.md) §3 "스킬카드 서포트".
> 표기는 §14와 같다. **[가정]** = 기획자가 아직 정하지 않은 값 (사용자: "세부적인 건 어차피 나중에 바꿀 테니" — 나중에 한 번에 바꾼다). **[구현 결정]** = 이 계획이 정한 세부. 둘 다 §15.12에 모았다.
> 밸런스는 조정하지 않는다. 시뮬은 전 / 후만 보고한다.
> 여기 적지 않은 것은 §14 그대로다. 경기 쪽 파일(§0) · `data/config.json`은 바꾸지 않는다.

### 15.0 한눈에

| 무엇 | 규칙 |
|---|---|
| 언제 붙나 | 레슨 시작에 **붙을 턴 2~4개**를 정해 둔다 (rng, 화면에 안 보임). 그 턴의 시작(뽑기 · 죽은 카드 다시 뽑기 뒤)에 코치 1명이 손패 1장에 붙는다 |
| 누가 | 편성 코치 중 1명 — 레어도 가중 **SSR 3 · SR 2 · R 1**, 이번 레슨에 이미 붙은 코치는 ×0.5 [가정] |
| 어느 카드 | 그 코치 능력이 의미 있는 손패 카드 중 균등, **그 코치 자신의 코치 카드는 ×3** [가정] |
| 붙으면 | 그 카드가 **이번 턴만 한 단계 강화** (강화 전 카드 → 강화판, 이미 강화판 · 강화 불가 → 위력 +20%). 비용은 그대로. 카드에 코치 얼굴 칩 |
| 내면 | **코치 컷인** (첫 번 0.9초 · 다음부터 0.6초, 탭으로 넘김) → 카드 처리에 **코치 추가 능력**이 얹힌다 → 그 코치 **유대 +5** |
| 안 내면 | 턴 끝에 떨어진다 (손패와 함께 버린 더미로, 강화도 사라짐) |
| 작은 원 카드 | 새 공용 2장 (**2인 1조 드릴** · **짝 스트레칭**) + 단일 → 작은 원 2장 (**되찾기 6초** · **골목 슈팅**). 66장 → **68장**. 작은 원 카드 4장 → 8장 |

### 15.1 붙는 규칙 (엔진 `lesson.js`)

**① 붙을 턴 정하기 — `startLesson`, 덱 섞기 바로 뒤 · 1턴 시작 전**

```
coaches = state.supports 중 lesson.json attach.abilities 에 능력이 있는 코치 (편성 순서)
if !attach.enabled || coaches 가 비었으면 → L.attach = { turns: [], … }, rng 를 쓰지 않는다
k     = rng.int(attach.count.min, attach.count.max)            // 2~4 균등 [가정]
k     = min(k, L.turns)
turns = rng.shuffle([1 … L.turns]).slice(0, k) 를 오름차순     // 서로 다른 턴
```

- **턴마다 확률(0.4)이 아니라 레슨 시작에 횟수를 정하는 이유** [구현 결정]: 기획 결정은 "레슨당 2~4번"이다. 턴마다 독립 0.4면 6턴 레슨의 23%가 0~1번, 4%가 5번 이상이라 약속을 자주 어긴다 (이항분포 B(6, 0.4): P(≤1) = 0.233, P(≥5) = 0.041). 미리 정하면 끝까지 간 레슨은 늘 2~4번 붙고, 평균(3번)은 턴당 0.4~0.5와 같다.
- 붙을 턴은 화면에 보이지 않는다 (학마스처럼 "이번 턴에 붙을까"는 모른다).
- 퍼펙트로 일찍 끝나거나 출전 0명으로 끝나면 남은 턴의 붙기는 없다.
- 코치가 없는 상태(테스트 픽스처 · 편성 0명)면 rng 소비가 예전과 똑같다 → 기존 고정 rng 기대값 테스트 중 코치 없는 것은 그대로 통과한다.

**② 붙이기 — `beginTurn`, ④ 죽은 카드 다시 뽑기 뒤 · ⑤ playsLeft 앞**

```
if L.turn ∉ L.attach.turns → 끝
pairs = coaches 중 붙을 수 있는 손패 카드 (아래 needs) 가 1장 이상인 코치
if pairs 가 비었으면 → 다음 턴으로 미룬다 (L.turn + 1 ≤ L.turns 이고 아직 목록에 없으면 turns 에 넣는다), 끝
coach = rng.weighted(pairs, w_c)     w_c = attach.rarityWeight[rarity] × (이번 레슨 붙은 적 있으면 attach.repeatWeight : 1)
card  = rng.weighted(그 코치의 후보 카드, w_k)   w_k = (그 코치 자신의 코치 카드면 attach.ownCardWeight : 1)
L.attach.cur = { uid, supportId, turn, upgrade }    // upgrade: "plus" | "pct" | "none" (§15.2)
fx.push({ t: "attach", uid, supportId })             // draw fx 뒤
```

- 코치 레어도는 `data/supports.json rarity`다 (하르나 · 오르넬라 SSR, 셀리아 · 바르바라 · 루미 SR, 한나 · 조이 · 이레네 R). 6명 편성이 SSR 2 · SR 2 · R 2면 SSR 한 명의 몫 25%, R 한 명 8%다.
- **돌파는 프로토타입에 없다.** 생기면 `w_c × (1 + attach.lbWeight × 돌파 단계)`로 붙을 몫을 키운다 (스키마만 예약, §15.3).
- **"구역이 맞는 카드" 우선으로 고르지 않는 이유** [구현 결정]: 원 카드의 대상은 놓는 자리에서 정해지므로 턴 시작에는 "코치 타입 구역에 맞는 카드"를 알 수 없다. 대신 (1) 능력이 헛도는 카드에는 붙지 않게 `needs`로 거르고 (2) 자기 코치 카드에는 잘 붙게(×3) 해 "하르나가 인터벌 슈팅에 붙었다" 같은 장면을 만든다. 나머지는 균등이라 읽기 쉽다.
- **needs** (능력 데이터 필드, §15.3):

| needs | 붙을 수 있는 카드 |
|---|---|
| 없음 | 손패 전부 (위력 카드 · 효과 카드 · 회복 카드 · 대비 카드) |
| `"power"` | 위력이 있는 카드 (`power != null` — 단일 · 원 · 전체 · 주인). 회복 단일 · 대상 없음 카드는 안 된다 |
| `"fail"` | `"power"`이면서 `mods.noFail`이 없는 카드 (바르바라 — 이미 실패 없는 카드에는 붙지 않는다) |

- 손패 카드는 턴 시작에 모두 낼 수 있는 카드다 (죽은 카드는 이미 다시 뽑았다). 행동 중 낼 수 없게 된 카드(주인을 벤치로 보냄)에도 붙은 채로 남는다.

**③ 떨어지기**

| 언제 | 처리 |
|---|---|
| 그 카드를 냈다 | 컷인 · 능력 · 유대 (§15.4) 뒤 `cur = null` |
| 턴 끝 ⑤ 손패 버리기 | `cur = null` (강화도 사라진다 — 덱의 카드는 바뀌지 않는다) |
| 부상으로 그 고유 카드가 `removed`로 갔다 | `cur = null` |
| 레슨 끝 | `cur = null` |

### 15.2 "이번 턴만 한 단계 강화"

`resolveEntry(state, data, entry)`가 `entry.uid === L.attach.cur?.uid`를 보고 정한다. 덱(`state.deck`)의 `plus`는 바꾸지 않는다.

| 붙은 카드 | upgrade | 결과 |
|---|---|---|
| 강화 전이고 강화할 수 있다 (`canUpgrade`) | `"plus"` | 그 턴 동안 **강화판** (`resolveCardDef({ plus: true })` — 위력 · effects · 문구 모두. 코치 카드는 지금처럼 × 1.25) |
| 이미 강화판이거나 강화할 수 없다 (대비 카드) · 위력 있음 | `"pct"` | 1인 위력 × (1 + `attach.overPct` 0.2) [가정] — §14.7 3번의 `p_i`에 곱한다 (focus 몫 더하기 전) |
| 이미 강화판 · 위력 없음 | `"none"` | 강화 없음, 능력만 |

- **비용은 바뀌지 않는다.** `costBase`는 강화 전 기본 위력(`basePower`)을 쓰므로 강화판이어도 체력 비용이 같다 (§14.7 4번 그대로). 학마스처럼 "공짜로 한 단계".
- 유대 80판 코치 카드도 같다 (유대 80판 → 그 강화판).
- `upgrade`는 붙는 순간 정해 `cur`에 저장한다 (뷰 · 미리보기 · 실제가 같다).

### 15.3 데이터 (`data/lesson.json` — version 2 그대로, 키 추가)

```jsonc
"attach": {
  "enabled": true,
  "count": { "min": 2, "max": 4 },                       // 레슨당 붙는 횟수 [가정]
  "rarityWeight": { "SSR": 3, "SR": 2, "R": 1 },          // [가정]
  "repeatWeight": 0.5,                                    // 이번 레슨에 이미 붙은 코치 [가정]
  "ownCardWeight": 3,                                     // 그 코치 자신의 코치 카드 [가정]
  "overPct": 0.2,                                         // 이미 강화판 · 강화 불가 카드의 위력 + [가정]
  "bond": 5,                                              // 붙은 카드를 냈을 때 그 코치 유대 [가정]
  "cutinMs": { "first": 900, "repeat": 600 },             // UI 만 읽는다 [가정]
  "abilities": {
    "sp_coach_harr":     { "name": "골문을 보는 눈", "text": "슈팅 구역 대상 +50%",       "needs": "power", "mods": { "lessonMult": { "stats": ["shoot"], "mult": 1.5 } } },
    "sp_wind_dancer":    { "name": "바람의 스텝",    "text": "다음 턴 손패 +1",           "effects": [{ "type": "drawNext", "n": 1 }] },
    "sp_elder_sage":     { "name": "빈 공간의 지혜", "text": "팀워크 +3 · 50%로 힌트",    "effects": [{ "type": "teamwork", "n": 3 }, { "type": "hint", "chance": 0.5 }] },
    "sp_iron_captain":   { "name": "다치지 않는 법", "text": "이 카드 실패 없음",         "needs": "fail",  "mods": { "noFail": true } },
    "sp_mountain_monk":  { "name": "산사의 호흡",    "text": "대상 전원 체력 +10",        "needs": "power", "effects": [{ "type": "heal", "to": "targets", "n": 10 }] },
    "sp_bard_lumi":      { "name": "응원의 노래",    "text": "25%로 컨디션 +1",           "effects": [{ "type": "condition", "n": 1, "chance": 0.25 }] },
    "sp_street_striker": { "name": "뒷골목 근성",    "text": "점수가 목표 미만이면 +50%", "needs": "power", "mods": { "underdog": 0.5 } },
    "sp_river_scholar":  { "name": "기록의 수식",    "text": "다음 카드 위력 +30%",       "effects": [{ "type": "nextPct", "pct": 0.3 }] }
  }
}
```

- 능력 = `{ name, text, needs?, mods?, effects? }`. `name` · `text`는 컷인 · 카드 칩 · 미리보기 노트에 쓰는 한국어 (이름은 모두 [가정]).
- **mods**는 카드 mods 말을 그대로 쓴다 — `lessonMult`(대상 구역별 배율) · `noFail` · `underdog`. 카드 자신의 mods와 **따로** 곱한다 (대비 카드의 `lessonMult`와 하르나가 겹치면 둘 다, 조이 카드의 `underdog`과 조이 능력이 겹치면 ×1.5 × 1.5).
- **effects**는 카드 effects 말을 그대로 쓴다 — `drawNext` · `teamwork` · `nextPct` · `heal`. **새 말 3개**:

| 새 말 | 모양 | 뜻 | 어디에 쓸 수 있나 |
|---|---|---|---|
| `heal.to: "targets"` | `{ type: "heal", to: "targets", n }` | 이 카드의 대상 T 중 결장이 아닌 선수 전원 체력 +n (실패자 포함) | 카드 · 능력 (`heal.to` 닫힌 목록에 추가) |
| `hint` | `{ type: "hint", chance }` | rng.chance(chance) 성공이면 그 코치의 힌트 1개를 **레슨이 끝날 때** 받는다 (§15.5) | 능력만 (카드에 쓰면 검증 오류 — 어느 코치인지 알 수 없다) |
| `condition` | `{ type: "condition", n, chance? }` | (chance가 있으면 rng.chance 성공일 때) `state.condition += n` (0~4에서 멈춤) — 바로 다음 상승부터 컨디션 배율이 바뀐다 | 카드 · 능력 |

- 능력 effects에는 `when`을 쓰지 않는다 — 컷인은 낸 순간 터지므로 카드가 실패해도 능력은 모두 발동한다 (하르나 ×1.5는 실패자에게 원래 상승이 없어 의미 없음) [구현 결정].
- **표 값은 각 코치의 지금 레어도 기준**이다. 레어도 · 돌파에 따른 능력 크기 차이는 이번에 넣지 않는다 — 돌파가 생기면 `abilities[id].lb = [{ 덮어쓸 mods · effects }, …]`(단계별)로 넣는다 (스키마 예약, 지금 검증은 `lb`가 있으면 오류).
- 검증 (`cards.validateAttachData(data)` 새 export, `lessonRun` 데이터 검사에서 부른다): `abilities` 키 ⊂ `data.supports` id, `needs ∈ {power, fail}`, mods 키 ⊂ `{lessonMult, noFail, underdog}` (값 검사는 `cards.MOD_KEYS`), effects는 `checkEffects` + 위 새 말, `count.min ≤ count.max`, 가중치 ≥ 0.

### 15.4 붙은 카드를 냈을 때 (`playCard` — §14.7에 끼우는 자리)

| §14.7 단계 | 더하는 것 |
|---|---|
| 0. 맨 앞 | `fx.push({ t: "cutin", supportId, uid, cardId, name, text, repeat })` — `repeat` = 이번 레슨 앞선 컷인 수 (0 = 첫 컷인). 비용 fx보다 **앞** |
| 1. 검증 | 그대로 |
| 3. 1인 위력 | `upgrade == "pct"`면 `p_i × (1 + overPct)` (focus 몫 전) |
| 5. 실패율 | `noFail = mods.noFail ‖ 능력 mods.noFail ‖ B.nextNoFail` |
| 6. 배율 M_i | `× (능력 underdog && score < target ? 1 + underdog : 1)` · `× (능력 lessonMult && z_i ∈ stats ? mult : 1)` — 대상마다. rows에 `attachMult`(그 대상에 걸린 능력 배율, 없으면 1) |
| 12. 카드 effects 뒤 | **12b. 능력 effects** (나열 순서, rng는 hint · condition의 chance만) |
| 12c. 유대 | 그 코치 `bond += attach.bond + getModifier("bondGain")` (0~100). fx `{ t: "bond", supportId, n }`. 그 코치 자신의 코치 카드면 기존 `bond.play` +8도 따로 (+13) |
| 13. 기록 | `L.attach.cur = null`, `L.attach.log`의 그 항목 `played: true`, `L.stats.cutins += 1` |

- 새 fx: `{ t: "attach", uid, supportId }`(턴 시작) · `{ t: "cutin", … }` · `{ t: "bond", supportId, n }` · `{ t: "hint", supportId, src: "cutin" }`(성공했을 때만) · `{ t: "condition", n, src: "cutin" }`(바뀌었을 때만). 회복 · 팀워크 · 버프 fx는 예전 모양 그대로.
- rng 순서: 실패 판정 → 부상 판정 → 카드 effects → 능력 effects (hint · condition의 chance). 같은 rngState면 같은 결과.
- 퍼펙트 판정 · 턴 끝 진행은 그대로 (능력의 상승도 같은 카드 처리 안이다).

**8명 능력 — 출발점 표 (모두 [가정], 기획자 표 그대로)**

| 코치 (레어도 · 타입) | 능력 이름 | 효과 | 데이터 | needs |
|---|---|---|---|---|
| 하르나 (SSR · 슈팅) | 골문을 보는 눈 | 슈팅 구역에 선 대상 상승 ×1.5 | mods `lessonMult {shoot} ×1.5` | power |
| 셀리아 (SR · 드리블) | 바람의 스텝 | 다음 턴 손패 +1 | `drawNext 1` | — |
| 오르넬라 (SSR · 패스) | 빈 공간의 지혜 | 팀워크 +3 (카드 효과 팀워크처럼 레슨 팀워크 상한 8과 별개) · 50%로 힌트 1 | `teamwork 3`, `hint 0.5` | — |
| 바르바라 (SR · 수비) | 다치지 않는 법 | 이 카드 실패 판정 없음 | mods `noFail` | fail |
| 한나 (R · 피지컬) | 산사의 호흡 | 대상 전원 체력 +10 | `heal targets 10` | power |
| 루미 (SR · 피지컬 [가정, L28]) | 응원의 노래 | 25%로 컨디션 +1 | `condition 1, chance 0.25` | — |
| 조이 (R · 슈팅) | 뒷골목 근성 | 점수가 목표 미만이면 상승 ×1.5 | mods `underdog 0.5` | power |
| 이레네 (R · 패스) | 기록의 수식 | 다음 카드 위력 +30% | `nextPct 0.3` (지금 카드의 버프 소비 뒤에 걸리므로 **다음** 카드에) | — |

- 오르넬라 힌트 50%, 루미 25%는 기획자 표의 "힌트 기회" · "낮은 확률"을 숫자로 옮긴 것이다 [가정].
- 이레네 `nextPct`는 실루엔 고유 카드와 더해진다 (§14.7 6번 `1 + nextPct`).

### 15.5 상태 · 뷰 · 저장 · lessonRun

**LessonState 추가**

```jsonc
"attach": {
  "turns": [2, 4, 5],                                    // 붙을 턴 (레슨 시작에 정함, 미루면 늘어남)
  "cur": { "uid": "k12", "supportId": "sp_coach_harr", "turn": 4, "upgrade": "plus" },   // 없으면 null
  "count": { "sp_coach_harr": 1 },                       // 이번 레슨 코치별 붙은 횟수 (repeatWeight)
  "log": [ { "turn": 2, "supportId": "sp_elder_sage", "uid": "k3", "cardId": "cd_one_two", "played": true } ],
  "hints": ["sp_elder_sage"]                             // 컷인 힌트 성공 — 레슨 끝에 lessonRun 이 힌트로 바꾼다
},
"stats": { …, "attaches": 3, "cutins": 2 }
```

- 저장: `lessonRun.version` 2 그대로. `L.attach`가 없는 저장본(C1 전에 저장한 레슨 중 상태)은 `{ turns: [], cur: null, count: {}, log: [], hints: [] }`로 읽는다 → 이번 레슨은 붙기 없음 [구현 결정]. `stats.attaches` · `cutins`가 없으면 0.
- 뷰 · 미리보기 · `dropCandidates` · 감독 AI는 rng를 쓰지 않는다 (§14.15 그대로). 붙을 턴(`turns`)은 뷰에 내보내지 않는다.

**뷰**

```jsonc
getLessonView → { …,
  attach: { uid, supportId, name: "코치 하르나", short: "하르나", color: "#ff7a3d", coachType: "shoot",
            ability: { name: "골문을 보는 눈", text: "슈팅 구역 대상 +50%" }, upgrade: "plus" } | null,
  cutins: 2,                                             // 이번 레슨 컷인 수
  hand: [ { …, plus: true, attach: { supportId, short, color, abilityText, upgrade } | null } ] }
  // 붙은 카드의 power · desc 는 강화된 값, cost 는 그대로
previewCard → { …, attach: { supportId, name, text, effects: [능력 effects] } | null,
  targets: [ { …, attachMult } ], notes: [ "하르나 지원 · 슈팅 구역 ×1.5", … ] }
```

- `short` = 이름의 마지막 낱말 ("코치 하르나" → "하르나"), `coachType` = 그 코치의 코치 카드 타입 (루미 = 피지컬), `color` = `portraitColor`.
- 노트 문구 (맨 앞 줄): "하르나 지원 · 슈팅 구역 ×1.5" / "셀리아 지원 · 다음 턴 손패 +1" / "오르넬라 지원 · 팀워크 +3 · 힌트 50%" / "바르바라 지원 · 실패 없음" / "한나 지원 · 대상 체력 +10" / "루미 지원 · 컨디션 +1 25%" / "조이 지원 · 목표 미만 ×1.5" (점수 ≥ 목표면 "조이 지원 · 목표 이상이라 효과 없음") / "이레네 지원 · 다음 카드 +30%".
- `lessonResult`에 `cutins: [{ supportId, name, cardId, turn }]` · `attaches`를 더한다.

**lessonRun**

| 바뀌는 것 | 내용 |
|---|---|
| 레슨 끝 (`afterLesson`) | `L.attach.hints`의 코치마다 **그 코치의** 힌트 1개 (`drawHint`를 코치 하나로 좁힌 `drawHintFrom(state, data, rng, supportId)` — 그 코치 `hintSkillIds` 중 배울 수 있고 레벨 3 미만인 것 균등). 결과와 상관없이 받는다 (컷인 때 이미 얻은 것) [구현 결정]. 남은 스킬이 없으면 `noHintSp` SP. 클리어 · 퍼펙트 힌트 뒤에 처리 |
| 보상 뷰 | `result.hints[]`에 `src: "cutin" \| "clear"`, `result.cutins` (코치 얼굴 + 횟수) |
| 기록 | `record.lessons[]`에 `attaches` · `cutins` |
| 로그 | 컷인마다 "코치 하르나 지원 (인터벌 슈팅)" 한 줄 |

### 15.6 감독 AI (`manager.js`)

- `scoreDrop`은 `previewCard`를 쓰므로 강화 · `attachMult` · `noFail` · `underdog`은 이미 상승 · 실패율에 들어간다.
- `buffValue`에 넘기는 effects = 카드 effects + `pv.attach.effects`. 새 말의 가치 [가정]:

| effect | 가치 x |
|---|---|
| `heal to targets` | `n × (T 중 결장 아닌 수) × 0.3 + 2 × (체력 50 미만 대상 수)` |
| `hint` | `chance × 25` |
| `condition` | `(chance ?? 1) × n × (4 × 남은 턴 + 6)` (컨디션 4면 0) |

- 붙은 카드에는 `ATTACH_BONUS` = 6을 더한다 (유대 +5와 컷인의 값 — 비슷한 EV면 붙은 카드를 낸다) [가정].
- 그 밖(벤치 먼저 · 후보 점 · endTurn 규칙)은 §14.14 그대로. rng를 쓰지 않는다.

### 15.7 작은 원 카드 (L38)

**규칙.** 단일 → 작은 원 변환 1인 위력 = `round(단일 위력 × 0.6)` [가정] — 2명이 잡히면 합계 위력 · 합계 비용이 단일의 1.2배, 1명만 잡히면 0.6배 (지금 작은 원과 단일의 비: 원투 패스 20 / 개인 지도 35 = 0.57, 스텝 레슨 20 / 전술 노트 28 = 0.71). 강화판 = `round(1인 × 1.25)`, 비용 = `round(1인 × 0.6)` (§14.9와 같다). 작은 원 반지름 4.2u는 그대로 (L38).

**새 공용 카드 2장** (`family: "common"`, `start: false`, `pool: true` — 보상 · 상담 후보, 가중치 `rewards.weights.common` 1)

| id | 이름 | 대상 | 1인 위력 (+강화) | 비용 (1인) | 효과 | desc / descPlus |
|---|---|---|---|---|---|---|
| `cd_pair_drill` | 2인 1조 드릴 | circle small | 22 (+28) | 13 | 없음 — 효과가 없는 대신 작은 원 중 위력이 가장 높다 (원투 패스 20 + 팀워크 2와 비슷한 값) | "작은 원 · 1인 22" / "작은 원 · 1인 28" |
| `cd_pair_stretch` | 짝 스트레칭 | circle small | 14 (+18) | 8 | 대상 전원 체력 +10 (강화 +12) — `heal to targets` (§15.3 새 말) | "작은 원 · 1인 14, 대상 체력 +10" / "작은 원 · 1인 18, 대상 체력 +12" |

- 짝 스트레칭은 비용 8 · 회복 10이라 대상 체력이 1인 +2 — "지친 둘을 같이 훈련시키며 버티는" 카드다. 강화판 `plus = { "power": 18, "effects": [{ "type": "heal", "to": "targets", "n": 12 }] }`.
- `cards.json`에서 `cd_one_two` 바로 뒤에 넣는다 (공용 계열끼리).

**단일 → 작은 원 2장**

| id | 이름 | 예전 (1인 · 비용) | 새 대상 · 1인 위력 (+강화) | 비용 | 유대 80판 | 이유 |
|---|---|---|---|---|---|---|
| `cd_six_sec` | 되찾기 6초 | single 28 (+35) · 17 | circle small · **17 (+21)** | **10** | — | 공을 잃은 뒤 둘이 같이 달려드는 압박 — 주제에 맞는다. 압박 +1 · 압박 2 이상 비용 증가 없음은 그대로 |
| `cd_c_joy` | 골목 슈팅 | single 40 (+50) · 24 | circle small · **24 (+30)** | **14** | 48 → **29 (+36)** | 뒷골목 2대2 내기 축구. 목표 미만 +50% 그대로. 조이 능력과 겹치면 ×2.25 |

- desc: "작은 원 · 1인 17, 압박 +1, 압박 2 이상이면 비용 증가 없음" / "… 1인 21 …", 골목 슈팅 "작은 원 · 1인 24, 점수가 목표 미만이면 +50%" / "… 1인 30 …", 유대 80 "작은 원 · 1인 29, …" / "… 1인 36, …".
- **바꾸지 않는 단일 카드**: 에이스형 단일(에이스 특훈 · 원포인트 레슨 · 한계 돌파), 회복 단일(쿨다운 · 아이싱 · 숨 고르기), 개인 지도, 1:1 특훈, 마무리 일격, **전술 노트**(이레네 — 개인 과외 노트라는 그림에 단일이 맞고, 코치 카드 중 단일을 하나 남겨 고르는 맛을 둔다. 이레네 능력 "다음 카드 +30%"는 어느 카드에나 붙는다) [구현 결정].
- 작은 원 카드: 원투 패스 · 패스 앤 무브 · 삼각형 패스 · 스텝 레슨 + 2인 1조 드릴 · 짝 스트레칭 · 되찾기 6초 · 골목 슈팅 = **8장**. 카드 수 66 → **68**, 공용 13 → 15, 압박형 · 코치 장수는 그대로.
- 팀워크(L10)는 작은 원 2명 성공이면 +1 — 그대로. 울리카 "다음 작은 원 +50%"(nextPairPct)는 새 4장에도 걸린다.
- 압박형 패시브(§14.11)는 대상 구역과 무관해 되찾기 6초가 작은 원이 되어도 그대로다.
- 이름 · 문구 · 수치 모두 [가정]. `docs/OUTGAME_CARDS_draft.md` 표에 2장을 더하고 2장을 고친다 (C2).

### 15.8 UI (1280×720, 스크롤 · 잘림 없음)

**① 붙은 카드 표시 (`js/ui/cards.js cardFace` + `css/lesson.css`)**
- 손패 뷰의 `attach`가 있으면 카드에 `.attached` · `--coach: <portraitColor>`:
  - 테두리 + 바깥 빛 (`box-shadow: 0 0 0 2px var(--coach), 0 0 14px var(--coach)`). 선택(금색) · 추천(청록)과 겹치면 선택이 위다.
  - 위 띠(`.cf-band`)를 코치 색 사선 줄무늬로.
  - 메타 줄 맨 앞에 **코치 칩** `.cf-coach` = 코치 얼굴(`avatar(color, name, 'xs')`, 16px) + "하르나 지원". 손패가 겹쳐도 카드 왼쪽은 늘 보이므로 칩을 왼쪽에 둔다 (오른쪽은 다음 카드에 가린다). 계열 라벨은 칩 뒤로 밀리고 넘치면 메타 줄 안에서 잘린다 (`.cf-meta`는 원래 overflow hidden).
  - 이름 뒤 "+"는 코치 색 `.cf-plus.att` (덱의 강화와 구분). `upgrade == "pct"`면 위력 줄 옆 `.cf-pmult` "+20%".
  - title = "코치 하르나 지원 — 이번 턴만 강화 · 내면: 슈팅 구역 대상 +50%".
- 턴 시작 연출: 새 손패가 들어온 뒤(`deal`) 260ms에 칩이 튀어나온다 (`.cf-coach.pop` 크기 0.4 → 1.15 → 1, 300ms). `no-anim`이면 없음.
- 조준 · 끌기 중 dock 안내 칸 노트 맨 앞에 `preview.notes`의 "하르나 지원 · …" 줄. 하르나 ×1.5가 걸린 대상의 "+N" 이름표는 코치 색 (`.att`).

**② 코치 컷인 (`screens/lesson.js` + `css/lesson.css`만 — `match.css` · `screens/match.js`는 건드리지 않는다)**
- 시각 언어는 경기 필살기 컷인(`.m-cutin` · `.cut-band` · `.cut-face`)을 **베껴** 레슨 전용 클래스로 만든다: `.ls-cutin`(레슨 화면 전체 덮개, 어둡게 .5) > `.lc` > `.lc-band`(코치 색 `--ec` 그라데이션 띠, `skewY(-4deg)`, 높이 약 128px, 경기장 세로 가운데 y ≈ 260) = `.lc-face`(88px 원, 코치 색 + 이름 첫 글자, 흰 고리) + `.lc-txt`(`small` "코치 지원 · 슈팅" / `b` "코치 하르나" 34px / `.lc-sub` "골문을 보는 눈 — 슈팅 구역 대상 +50%").
- 애니메이션: 경기 `cut-life`와 같은 곡선 (왼쪽에서 들어와 12%에 멈추고 82%부터 오른쪽으로 빠짐) + 얼굴 튀어나오기. 길이 `--t-cut` = `attach.cutinMs.first` 900ms (이번 레슨 첫 컷인, `repeat == 0`) / `repeat` 600ms (`.lc.short` — 얼굴 튀기 없이 띠만).
- **넘기기**: 덮개 위 아무 곳 `pointerdown`, 또는 Enter · Space · Esc → 바로 닫고 다음 단계. 덮개는 `pointer-events: auto`라 그동안 경기장 · 손패 입력을 막는다. 화면 아래 작은 글씨 "탭하여 넘기기"는 첫 컷인에만.
- 연출 순서 (`fxPlan`이 `cutin`을 따로 꺼낸다 → `plan.cutin = { supportId, name, text, repeat } | null`): **컷인 → (닫힘) → 기존 카드 연출 (비용 → 제자리 훈련 → "+N" → 버프 칩)**. 능력 결과는 카드 연출 쪽에서 보인다: 힌트 성공 = 옆 칸 위 "힌트!" 팝 (코치 얼굴 + 글자), 컨디션 = HUD 컨디션 칩 깜빡 + "컨디션 ↑", 유대 = dock 노트 "하르나 유대 +5".
- `no-anim` · reduced-motion: 컷인 덮개를 띄우지 않는다 (0ms). 대신 dock 안내 칸에 "하르나 지원 발동 — 슈팅 구역 대상 +50%"를 연출이 끝날 때까지.
- `?autolesson=1`: 컷인도 그대로 보인다 (짧은 판이 저절로 닫힌다).
- `aria-live="polite"`로 "코치 하르나 지원: 슈팅 구역 대상 +50%"를 읽는다.
- 1280×720: 띠는 화면 폭 전체 (기울어진 양 끝이 화면 밖으로 나가도 덮개가 `overflow: hidden`이라 스크롤이 생기지 않는다). 글자는 1줄씩, `.lc-sub` 최대 약 26글자(13px) ≈ 340px.

**③ 그 밖**
- 보상 모달 결과 줄: "코치 지원 2번" + 힌트 목록에서 컷인 힌트는 코치 얼굴 + "지원".
- 카드 효과 문구 (`labels` · `ui/cards.js`): `heal to targets` → "대상 체력 +10".

### 15.9 테스트

| 파일 | 더하는 것 |
|---|---|
| `lesson.test` | 붙을 턴: 같은 rngState → 같은 turns · 코치 · 카드 / 횟수 ∈ [min, max] · 서로 다른 턴 · ≤ turns / 코치 없음 · `enabled: false`면 rng 소비가 붙기 없는 데이터와 똑같다 (rngState 같음) / 레어도 가중 (2,000번: 코치 몫이 3:2:1 비 ±3%p) · 반복 ×0.5 / needs: power 코치는 효과 카드 · 회복 카드에, fail 코치는 noFail 카드에 붙지 않는다 / 자기 코치 카드 ×3 / 후보가 없으면 다음 턴으로 미룸 (마지막 턴이면 없음) / 강화: 강화 전 → 강화판 값 (뷰 · 미리보기 · 실제 상승 같음, 비용 같음), 강화판 → 위력 ×1.2, 효과 카드 강화판 → none / 턴 끝 · 낸 뒤 · 부상 제거에 떨어짐, 덱 `plus` 그대로 / 8명 능력 각각 (구역 고정 픽스처) / 컷인 fx가 lastFx 맨 앞 · `repeat` 셈 / 유대 +5 (자기 카드면 +13) / 힌트 성공은 `attach.hints`에 / 컨디션 0~4 멈춤 / JSON 왕복 · `attach` 없는 저장본 / 뷰 · 미리보기 순수 (rngState 그대로) |
| `cards.test` | 68장 · 계열 장수 (공용 15) · 새 2장 · 변환 2장의 대상 · 1인 위력 · 강화 · 비용 · 유대 80 (§15.7) · `heal.to` 닫힌 목록에 `targets` · `hint`를 카드에 쓰면 오류 · 능력 데이터 검증 (모르는 코치 id · needs · mods 키 · effect 말 · `lb`) |
| `cardEffects.test` | 새 2장 · 변환 2장 기대값 줄 (작은 원 2명 · 1명), 짝 스트레칭 순회복 |
| `lessonRun.test` | 컷인 힌트 → 레슨 끝에 그 코치 힌트 (실패한 레슨도) · 남은 스킬이 없으면 SP / 보상 뷰 `src` · `cutins` / 기록 `attaches` · `cutins` / 새 카드가 보상 · 상담 후보에 나온다 |
| `manager.test` | 15주 완주 그대로 · 추천이 늘 유효 · rng 없음 / 같은 EV면 붙은 카드 (`ATTACH_BONUS`) / 새 effect 가치 |
| `lessonLayout.test` | `fxPlan`이 `cutin` · `attach` · `bond` · `hint` · `condition`을 꺼낸다 |
| `lessonUi.test` | 붙은 카드에 `.cf-coach` · `.attached` / 그 카드를 내면 `.ls-cutin`이 뜨고 클릭하면 닫히며 카드 연출로 이어진다 / 두 번째 컷인은 `.lc.short` / `no-anim`이면 덮개 없음 · 안내 문구 |
| `ui.smoke` · `outgame.test` | 필수 선택자 `.ls-cutin`(덮개 뿌리), 완주 중 컷인 1번 이상 |
| 그 밖 | 경기 쪽 테스트 그대로. 고정 rng 기대값이 붙기 rng 때문에 바뀌는 테스트는 기대값을 다시 계산하거나, 붙기와 무관한 테스트면 `attach.enabled: false` 데이터 사본을 쓴다 (어느 쪽인지 §15.13에 적는다) |

- `tools/shot.mjs` 시나리오: `og_lesson_attach`(붙은 카드가 있는 손패) · `og_lesson_attach_aim`(하르나가 붙은 원 카드 조준 — 코치 색 "+N" · 노트) · `og_lesson_cutin`(첫 컷인 중간 프레임) · `og_lesson_cutin_short`(두 번째 컷인) · `og_lesson_cutin_noanim`(안내 문구). 잘림 검사에 `.lc-txt b` · `.lc-sub` · `.cf-coach`를 더하고, 덮개가 1280×720 안 · 스크롤 0인지 본다. PNG를 직접 열어 본다.

### 15.10 시뮬 (`tools/lesson_sim.mjs`)

출력에 더한다 (보고만 — 수치는 바꾸지 않는다):
- 레슨당 붙기 · 컷인: 평균 · 분포 (0 · 1 · 2 · 3 · 4 · 5+) · **끝까지 간 레슨 중 컷인 2~4번 비율**
- 코치별 붙은 몫 (레어도별 평균), 붙은 카드 중 낸 비율
- 런당 컷인 힌트 · 컨디션 +1 · 컷인 유대 (코치별 평균), 유대 80에 닿은 코치 수
- 런당 성장 · 부상 · 실패 — C1 전 (이 문서 커밋 시점 엔진) / 후 비교표

**구현 확인 띠** (규칙을 문서대로 만들었나 — 밖이면 원인 보고):
- 끝까지 간 레슨의 붙기 횟수 2~4 = 100% (미룬 붙기가 마지막 턴을 넘어간 경우만 예외, 그 수를 따로 보고)
- 레슨당 컷인 평균 **2.3~3.2**, 끝까지 간 레슨의 컷인 2~4번 ≥ 85%
- 코치 몫 SSR > SR > R (같은 레어도 코치끼리 비슷)

### 15.11 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건:
- `npm test` 통과
- `git diff --stat main -- js/engine/match.js js/engine/ai.js js/engine/skills.js js/engine/rng.js js/ui/screens/match.js js/ui/layout.js css/match.css data/config.json` 비어 있음
- 엔진 순수 · 결정적 (rng는 `state.rngState`로만, 미리보기 · 뷰 · 감독 AI는 rng를 쓰지 않음)
- 바뀐 점은 §15.13에, 슬라이스마다 커밋 (경로 지정 `git add`)

**C1 · 엔진: 붙기 · 강화 · 컷인 · 능력**
- 할 일: `lesson.json attach` (§15.3) · 검증 (`cards.js` 새 effect 말 `heal targets` · `hint` · `condition`, `validateAttachData`) · `lesson.js` (§15.1 ①②③ · §15.2 · §15.4 · LessonState · 뷰 · 미리보기 노트 · `lessonResult`) · `lessonRun.js` (`drawHintFrom` · 레슨 끝 컷인 힌트 · 기록 · 보상 뷰 · 로그) · lesson.test · lessonRun.test · cards.test (검증 부분). 고정 rng 기대값이 바뀐 테스트 정리.
- 완료 조건: §15.9의 lesson · lessonRun 항목 통과, 결정성 · JSON 왕복 · 순수 뷰, 감독 AI 15주 완주 (manager.test 그대로 통과).

**C2 · 카드: 작은 원 (L38)**
- 할 일: `cards.json` 2장 추가 · 2장 변환 (§15.7, 문구 포함), cards.test (68장 · 표) · cardEffects.test, 회복 대상 문구, `docs/OUTGAME_CARDS_draft.md` 표.
- 완료 조건: 두 테스트 통과, 보상 · 상담 후보에 새 2장이 나온다 (lessonRun.test 1줄), 카드 앞면 잘림 없음 (`node tools/shot.mjs` 보상 · 손패 시나리오 PNG 확인).

**C3 · 감독 AI · 시뮬**
- 할 일: §15.6 (`buffValue` 새 말 · 능력 effects · `ATTACH_BONUS`), manager.test, `tools/lesson_sim.mjs` §15.10 지표 + C1 전 / 후 비교 (C1 전 = 이 문서 커밋의 엔진을 `git worktree`로 따로 돌린다).
- 완료 조건: manager.test 60초 안, `npm run lesson-sim` 출력을 보고에 붙이고 §15.10 띠 안 (밖이면 원인 보고 — 수치는 바꾸지 않는다).

**C4 · UI: 붙은 카드 · 컷인 · 시나리오 · 문서**
- 할 일: §15.8 전부 (`ui/cards.js` 칩 · `lesson_layout.fxPlan` · `screens/lesson.js` 컷인 덮개 · 넘기기 · 연출 순서 · no-anim 안내 · autolesson · 보상 모달 줄, CSS는 `css/lesson.css`만), lessonLayout.test · lessonUi.test · ui.smoke · outgame.test, shot 시나리오 5개 + 잘림 검사, `tools/lesson_play.mjs` 한 판 점검 (컷인을 탭으로 넘기는 입력 포함), ARCHITECTURE §20 · README 한 줄 · §15.13.
- 완료 조건: `npm test` 전부, `node tools/shot.mjs og_lesson_attach og_lesson_cutin …` 검사 통과 + PNG를 직접 보고 잘림 · 겹침 · 스크롤 없음, 스크린샷 경로 보고.

순서 의존: C1 → C2 (`heal targets`가 C1에 있다) → C3 (새 카드까지 들어간 뒤 시뮬) → C4 (뷰 · fx 계약 §15.5 고정 뒤). C4는 C1 뒤부터 시작할 수 있지만 시나리오 · 문서 마무리는 C3 뒤에 한다. 배포(푸시)는 기획자 확인 뒤.

### 15.12 [가정] · [구현 결정] 목록

**[가정]** (기획자 확인 대상 — 나중에 한 번에 바꾼다)
1. 붙는 횟수 레슨당 2~4번 균등 (평균 3), 레어도 가중 SSR 3 · SR 2 · R 1, 같은 코치 반복 ×0.5, 자기 코치 카드 ×3.
2. 이미 강화판인 카드에 붙으면 위력 +20%. 비용은 그대로.
3. 붙은 카드를 내면 유대 +5 (자기 코치 카드면 +8과 따로).
4. 8명 능력 표 (§15.4) — 오르넬라 힌트 50%, 루미 컨디션 25%를 숫자로 정함. 능력 이름 8개.
5. 컷인 0.9초 / 다음부터 0.6초.
6. 작은 원 변환 계수 0.6, 새 카드 2장의 이름 · 수치, 변환 2장 (되찾기 6초 · 골목 슈팅).
7. 감독 AI 새 effect 가치 · `ATTACH_BONUS` 6.

**[구현 결정]**
- 턴마다 확률 대신 레슨 시작에 붙을 턴을 정한다 (§15.1 ①의 이유).
- 카드 고르기 = needs 거르기 + 균등 (+ 자기 카드 ×3). 구역 맞춤 우선은 하지 않는다.
- 능력은 카드가 실패해도 발동한다. 컷인 힌트는 레슨 결과와 상관없이 받는다.
- 능력 mods는 카드 mods와 따로 곱한다.
- 코치가 없으면 rng를 쓰지 않는다. `attach` 없는 저장본은 붙기 없음으로 읽는다 (저장 버전 그대로).
- 대비 레슨에도 붙는다.
- 전술 노트는 단일로 남긴다.

### 15.13 구현 중 바뀐 것

**C1 · 엔진 + 카드 데이터 (2026-10-04)**
- **C2 의 카드 데이터를 C1 에서 함께 했다** (작업 지시): `cards.json` 2장 추가 (2인 1조 드릴 · 짝 스트레칭, 원투 패스 바로 뒤) · 2장 변환 (되찾기 6초 · 골목 슈팅, 유대 80 29) — 수치 · 문구는 §15.7 그대로. `cards.test` (68장 · 공용 15 · 변환표 · 작은 원 8장 · 새 effect 말 · `validateAttachData`) · `cardEffects.test` (새 2장 · 변환 2장, 작은 원 2명 · 1명 · 짝 스트레칭 순회복 · 100 에서 멈춤) · `docs/OUTGAME_CARDS_draft.md` 표 (공용 15장 · 합계 68)도 C1 에 들어갔다. C2 에 남은 일: 카드 앞면 문구는 `desc` 를 그대로 쓰므로 UI 수정은 필요 없었다 (`og_lesson` · `og_lesson_small` · `og_reward_clear` 스크린샷 확인, 잘림 0).
- **기존 테스트의 rng 기대값**: 다시 계산하지 않고 **`attach.enabled: false` 데이터 사본**을 썼다 — `lesson.test` 의 §14 테스트 (`data`), `cardEffects.test` (카드 1장 감사), `lessonRules.test` (규칙 감사). 붙기 테스트는 `lesson.test` 의 `DA` (실제 데이터). `lessonRun` · `manager` · `outgame` · `ui` 테스트는 실제 데이터 그대로 통과했다 (`lessonRun.test` 기록 키 목록에 `attaches` · `cutins` 만 더함). `lesson.test` 압박형 테스트의 되찾기 6초는 작은 원 (슈팅 구역 중심 → p6 혼자) 으로 바꿨다.
- **붙을 카드 후보에서 죽은 카드를 뺀다** (§15.1 ②는 "손패는 모두 낼 수 있다"고 가정 — 덱이 바닥나 다시 뽑기를 멈추면 죽은 카드가 남을 수 있다).
- 미룬 붙기: 다음 턴이 이미 붙을 턴이면 미룬 1번은 없어진다 (계획 그대로 — 레슨당 횟수가 줄 수 있다).
- `condition` 은 카드 effects 에도 쓸 수 있다 (chance 가 있으면 카드 처리 rng). `hint` 를 능력 밖에서 실행하면 오류 (검증도 막는다). 능력 effects 에 `when` 은 검증 오류.
- 뷰 · fx 필드를 조금 더 넣었다 (C4 용): 손패 `attach` = `{ supportId, name, short, color, coachType, abilityName, abilityText, upgrade }`, `previewCard.attach` 에 `upgrade` · `note` (노트 맨 앞 줄과 같은 문구 — 조준 전 · 0명이어도 `attach` 는 채운다, `notes` 는 ok 일 때만), `attach` fx 에 `upgrade`, `cutin` fx 에 `coach` (코치 이름 "코치 하르나"), `lessonResult` 에 `cutinHints` · `cutins[].cardName`. `pct` 붙은 카드의 뷰 위력 = round(위력 × 1.2).
- 노트 문구는 능력 데이터 (mods · effects) 에서 만든다 — 8명 모두 §15.5 문구와 같다.
- 유대 fx `{ t: "bond" }` 는 실제로 오른 만큼 (100 에서 멈추면 없다). 컨디션 fx 는 바뀌었을 때만.
- `validateAttachData` 는 `lessonRun.createRun` (런 시작 1번) 과 `validateCardsData` (attach 가 있으면) 에서 부른다 — 행동마다 부르지 않는다.
- 컷인 로그는 `lessonRun.playCard` 가 `lastFx[0]` 의 cutin 을 보고 남긴다 ("코치 하르나 지원 (기초 훈련)").
- 시뮬 (`npm run lesson-sim`, 200런 · seed 1, 감독 AI 는 아직 붙기를 모른다 — C3 전) **전 → 후** (방침 5열 범위, 수치는 조정하지 않았다): 클리어율 70~80% → 79~87% · 퍼펙트율 23~34% → 35~47% · 런당 성장 5,931~6,309 → 6,335~6,631 (띠 5,900~7,300 안) · 기본 비중 33~36% → 31~34% · 힌트 7.5~9.2 → 10.6~12.0 · 유대 80 도달 0.4~0.8 → 0.8~1.1 · 경계전 승률 51~55% → 55~59% · 런당 부상 1.94~2.26 → 1.98~2.14 · 실패 판정 3.98~4.39 → 3.87~3.98.

**C3 · 감독 AI · 시뮬 (2026-10-04)** (작업 지시의 슬라이스 이름은 "C2 MANAGER + SIM" — C1 이 카드 데이터를 함께 해서 번호가 하나 당겨졌다)
- `manager.js` §15.6 그대로: `buffValue` 에 `heal to "targets"` (n × 결장 아닌 대상 수 × 0.3 + 2 × 체력 50 미만 대상) · `hint` (chance × 25) · `condition` ((chance ?? 1) × min(n, 4 − 컨디션) × (4 × 남은 턴 + 6)), `scoreDrop` 의 effects = 카드 effects + `pv.attach.effects`, 붙은 카드 `ATTACH_BONUS` 6. rng 는 쓰지 않는다. manager.test 1개 추가 (능력별 점수 차이 · 같은 카드 2장이면 붙은 쪽).
- **붙는 횟수를 2~4 → 4~5 로 올렸다** (`lesson.json attach.count`, 작업 지시: "붙는 확률은 2~4번에 맞게 조정해도 된다"). 이유: 감독 AI 는 붙은 카드를 **약 60%만 낸다** (한 턴에 보통 1장만 내고, 붙는 카드는 손패에서 균등이라 더 좋은 카드가 있으면 그쪽을 낸다) · 퍼펙트로 일찍 끝나는 레슨이 45% 안팎. 2~4 그대로면 레슨당 **컷인 1.7~1.8** (끝까지 간 레슨의 컷인 2~4번 55~61%) 로 기획 "레슨당 2~4번" 아래였다. `ATTACH_BONUS` 를 올려 보는 것 (6 → 40 에서도 낸 비율 78%, 컷인 2.3) 보다 붙는 횟수를 올리는 쪽이 감독 AI 가정을 건드리지 않는다. 기획의 "2~4번" 은 **컷인 (보이는 연출)** 횟수로 읽었다 — 코치 얼굴 칩은 레슨당 4~5번 보인다.
- 테스트: `cards.test` (attach 값 표 `{min:4,max:5}`) · `lesson.test` §15.1 ① (횟수 범위를 데이터에서 읽는다). 302개 통과.
- 시뮬 지표 (§15.10) 를 `tools/lesson_sim.mjs` 에 더했다: 레슨당 붙기 · 컷인, 컷인 분포 0~5+, 끝까지 간 레슨 (퍼펙트 아님 · 마지막 턴까지) 비율 · 그 컷인 평균 · 붙기 count 범위 비율 (밖 · 미룸 수) · 컷인 2~4 비율, 낸 비율, 레어도별 붙기 몫, 런당 컷인 · 컷인 힌트 · 컷인 컨디션 +1 · 컷인 유대, 코치별 몫 · 컷인 (= 능력 발동) / 런.
- **띠 결과** (200런 · seed 1 · 경기 포함): 컷인 평균 (끝까지 간 레슨) 2.57~2.67 — 띠 2.3~3.2 안 · 붙기 4~5 = 100% (미룸 0) · 레어도 몫 SSR 22% > SR 16% > R 8~9% — 띠 안. **끝까지 간 레슨의 컷인 2~4번 81~83% — 띠 ≥ 85% 에 조금 모자란다**: 원인은 붙은 카드를 안 내는 턴 (40%) 이라 1번 (13~15%) 이 남는다. 횟수를 더 올리면 (4~6) 5번 이상이 늘어 (5~7%) 비율이 더 나아지지 않았다 — 수치는 여기서 멈췄다.
- 전 → C1 → C3 (방침 5열 범위, 밸런스는 조정하지 않았다): 클리어율 70~80% → 79~87% → **83~89%** · 퍼펙트율 23~34% → 35~47% → **43~51%** · 런당 성장 5,931~6,309 → 6,335~6,631 → **6,500~6,899** (띠 5,900~7,300 안) · 기본 비중 33~36% → 31~34% → **30.4~32.5%** · 힌트 7.5~9.2 → 10.6~12.0 → **12.8~14.0** · 유대 80 도달 0.4~0.8 → 0.8~1.1 → **1.3~1.6** · 경계전 승률 51~55% → 55~59% → **57~60%** · 런당 부상 1.94~2.26 → 1.98~2.14 → **1.86~2.00** · 실패 판정 3.98~4.39 → 3.87~3.98 → **3.70~3.94**. (참고: 감독 AI 만 바꾸고 2~4 그대로면 클리어 80~87% · 성장 6,317~6,611 · 컷인 1.69~1.80.)

**C4 · UI: 붙은 카드 · 컷인 · 시나리오 · 문서 (2026-10-04)** (작업 지시의 슬라이스 이름은 "C3 UI" — 번호가 하나 당겨졌다)
- **색 = 코치 타입 색** (작업 지시 "type colour"): 붙은 카드 테두리 · 빛 · 띠, 컷인 띠, 능력 알약, 코치 색 "+N" 은 코치 카드 타입의 구역 색 (`css/lesson.css` `.co-shoot · co-dribble · co-pass · co-defense · co-physical` → `--coach` 밝은 색 · `--coach-d` 짙은 띠 색 · `--coach-a` 빛 · `--coach-t` 옅은 바탕). **얼굴만 초상 색** (`--coach-face` = `portraitColor`). §15.8 ①의 `--coach: portraitColor` 대신 — 바르바라 초상 색(#6b7280 회색)은 빛 · 띠가 죽어 보였다. 얼굴 글자 = 짧은 이름 첫 글자 ("코치 하르나" → "하").
- **컷인 대사** (작업 지시 "a short line of dialogue per coach"): `lesson.json attach.abilities[id].line` 을 더했다 (8명, 22자 이하 [가정] — 하르나 "슛은 눈으로 차는 거야. 골문부터 봐!" 등, 각 코치 `bio` 에서). UI 만 읽는다. 검증 `cards.attachErrors` 가 `line` (빈 문자열 아닌 문자열, 없어도 됨) 을 받는다 · `cards.test` 2줄.
- **컷인 모양** (§15.8 ② + 더한 것): 덮개 `.ls-cutin` (레슨 화면 전체, z 80) > 섬광 `.lc-flash` (첫 번만) + `.lc` > `.lc-band` (기울어진 띠 164px, 경기장 세로 가운데, 흐르는 속도선 · 위아래 코치 색 선) = 얼굴 `.lc-face` 108px + `.lc-txt` (`small` "코치 지원 · 슈팅" / `b` 이름 34px / `.lc-line` 대사 / `.lc-sub` 능력 이름 · 문구) + **낸 카드 `.lc-card`** (띠 오른쪽, 기울어져 날아 들어옴 — 이름 · "+" · 1인 위력 · "지원") + "탭하여 넘기기" (첫 번만). 짧은 판 `.short` = 섬광 · 얼굴 튀기 · 카드 날아오기 · 대사 들어오기 없이 띠 150px. 넘기기 = 덮개 `pointerdown` · `click`, Enter · Space · Esc (document keydown capture), 시간 = `attach.cutinMs` (first 900 · repeat 600 — 그대로). 닫히는 순간 바로 카드 연출 (덮개를 누른 click 이 아래 손패 · 경기장에 떨어져도 busy 라 무시).
- **능력 연출** (§15.8 ② "능력 결과는 카드 연출 쪽에서"): 컷인 카드의 대상 훈련 고리 = 코치 색 (`.tok.att-drill`). 능력 배율이 걸린 대상 (`previewCard` 의 `attachMult > 1` — 내기 직전 미리보기, 순수) 의 "+N" 팝은 코치 색 "+N ×1.5". 경기장 가운데 (y 51%) **능력 알약 `.ls-abil`** 1.7초: 얼굴 · 능력 이름 · 문구 · 결과 칩 (힌트 획득! · 컨디션 +1 · 유대 +5) — §15.8 의 "옆 칸 위 힌트! 팝" · "HUD 컨디션 칩" · "dock 노트 유대 +5" 를 알약 하나로 모았다 (HUD 에 컨디션 칩이 없다). 컨디션이 오르면 옆 칸 아래 "방침 · 컨디션" 줄이 한 번 빛난다. 알약은 구역 라벨 칩 (피지컬 · 드리블) 위를 잠깐 덮는다 — 경기장에 빈 곳이 없어 연출 동안만 [구현 결정].
- **붙은 카드** (§15.8 ①): 칩 `.cf-coach` (얼굴 14px + "하르나 지원") 은 메타 줄 맨 앞, 지원 강화 "+" `.cf-plus.att`, `pct` 판은 위력 줄 옆 `.cf-pmult.att` "지원 +20%". 더한 것: 흐르는 사선 줄무늬 띠 · 위쪽 옅은 코치 색 · 3.2초마다 지나가는 반짝임, 새 턴에 막 붙으면 (`fxPlan.attach`) 손패가 들어온 뒤 260ms 에 칩이 튀어나오고 테두리가 한 번 크게 빛난다 (`.att-new`). dock 안내 칸 (조준 전) 두 줄 "[얼굴] 하르나 지원 → 인터벌 슈팅+" / "내면 골문을 보는 눈 · 슈팅 구역 대상 +50%" (한 줄이면 긴 카드 이름에서 잘렸다), 조준 중 자리를 고르기 전 "하르나 지원: 슈팅 구역 대상 +50%", 고른 뒤는 노트 맨 앞 "하르나 지원 · 슈팅 구역 ×1.5" (코치 색). ×1.5 가 걸린 대상 말풍선 = 코치 색 (`.tok-name.bub.att`). 끌기 유령: 코치 색 테두리 · 오른쪽 위 얼굴 · "하르나 지원" (유령 104×116 — 줄이 하나 늘어서).
- **no-anim**: §15.8 은 "연출이 끝날 때까지 안내 칸" 이지만 움직임 줄이기에서는 연출 타이머가 0ms 라 바로 지워진다 → 컷인 대신 안내 칸 "[얼굴] 바르바라 지원 발동 / 다치지 않는 법 — 이 카드 실패 없음" 을 **다음 조작 (다시 그리기) 전까지** 남긴다 (`.ls-cut-recap`). 연출이 켜져 있으면 컷인 · 카드 연출 동안 같은 줄 (`.ls-cut-note`).
- **fxPlan**: `cutin` (첫 cutin fx) · `attach` (새 턴 붙기) · `play.bond` · `play.hints` · `play.condition` (카드 단계의 컨디션 변화 합 — 카드 effects 의 컨디션도) 을 꺼낸다.
- **보상 모달** (§15.8 ③): 칩 "지원 N번" + 코치 얼굴 (title 에 턴 · 코치 · 카드), 힌트 칩의 컷인 힌트 = 얼굴 + "지원". 실패한 레슨도 컷인 힌트를 보인다 (칩 "실패 — TP · 보상 카드 없음"). 칩 줄이 한 줄을 넘어 퍼펙트 보상 모달이 안쪽 스크롤 (+18~55px) 되어 — "코치 지원" → "지원", **유대 칩을 짧은 이름으로** ("유대 하르나 +10 → 45", 전체 이름은 title), 얼굴 16px. 칩 클래스는 `rw-chip.coach-sup` (`.cutin` 은 base.css 의 옛 전역 컷인 클래스와 겹쳤다).
- **시나리오** (§15.9 5개 + 2): `og_lesson_attach` · `_attach_aim` · `_attach_drag`(유령) · `_cutin`(첫 컷인 0.42초) · `_cutin_after`(컷인 뒤 능력 연출 1.48초) · `_cutin_short`(오르넬라 → 2인 1조 드릴, 0.25초) · `_cutin_noanim`. 붙기는 엔진 rng 라 `attachInject` 로 `lesson.attach.cur` 를 주입한다 (하르나 장면 = 슈팅 구역 2명 이상 · 인터벌 슈팅 · 원 = 슈팅 구역 중심). `tools/shot.mjs`: 단계 `{ pauseAnim: true }` (`document.getAnimations()` 멈춤 — 타이머 고정은 CSS 애니메이션을 멈추지 못해 컷인이 캡처 전에 사라졌다), 시나리오 `reducedMotion`, 잘림 검사에 `.lc-txt b · .lc-sub · .lc-line · .cf-coach · .ls-att-line · .ls-cut-sub`. 7장 모두 스크롤 · 잘림 · 겹침 0.
- `tools/lesson_play.mjs`: 코치 지원 카드를 내면 컷인이 뜨는지, 3번 중 2번은 덮개 클릭 · 탭으로 넘기고 (400ms 안에 닫힘) 1번은 저절로 닫히는지 (2.5초). 시즌 1 (seed play-1): 컷인 7번 (클릭 4 · 탭 1 · 끝까지 2), 입력 실패 · 대상 불일치 · 에러 0.
- 테스트: `lessonLayout.test` 2개 (합성 fx · 실제 엔진 — attach = 뷰 attach, cutin = lastFx 맨 앞 · repeat 0), `lessonUi.test` (붙은 카드 칩 · 색 · title · dock 줄 / no-anim 덮개 없음 · 안내 / 연출 켬: 덮개 · 이름 · 대사 · 능력 · 카드 · 길이 · busy → pointerdown 넘기기 → 코치 색 고리 · 능력 알약 · 유대 +5 / 두 번째 = 짧은 판 · 저절로 닫힘 · Esc / 보상 "지원 N번" 칩), `outgame.test` (lesson.css 선택자), `ui.smoke` (15주 완주 중 컷인 1번 이상). 304개 통과.
- 기존 시나리오 2개 손봄: `og_lesson_turnend` 는 C1 의 붙기 rng 뒤 seed 1 에서 상태를 못 찾아 shot.mjs 전체가 멈췄다 → seed 를 바꿔 가며 찾는다. `og_lesson_turnend` · `og_lesson_end` 는 코치 지원이 붙은 전체 카드를 빼고 고른다 (컷인이 먼저라 연출 시각이 달라진다). `--only og_lesson,og_lesson_` 43장 모두 검사 통과.
- 이미 있던 것 (이번 슬라이스와 무관): `og_reward_perfect*` 무료 강화 그리드의 "물결 세이브 루틴+" 이름 잘림 (C1 전 reward.js 로 찍어도 같다).

**C4 · 통합 점검 (2026-10-04)** (작업 지시의 슬라이스 이름은 "C4 INTEGRATION" — 시나리오 · 문서 마무리 · 실제 브라우저 판)
- **`tools/lesson_play.mjs` 레슨마다 컷인 수**: 레슨이 끝날 때 `pendingReward.result` 의 붙기 · 컷인 수와 그 레슨에서 **화면에 뜬 컷인 수**를 함께 적고, 요약 줄 "컷인 (화면): 레슨당 평균 · 2~4번 비율 · 분포 0~5+" 를 낸다. 엔진 컷인 수 ≠ 화면 컷인 수면 입력 실패로 센다.
- **실제 브라우저 판 2번** (1280×720, 실제 입력, 둘 다 점검 통과 — 입력 실패 · actions 대신 · 대상 불일치 · 에러 토스트 · 페이지 에러 · 스크롤 0, 엔진 = 화면 컷인 수):
  - 시즌 1 (seed play-1 · 팀형, 68초): 레슨 3번 — 붙기 4 · 4 · 5, 컷인 **2 · 2 · 3** (2~4번 3/3). 컷인 7번 = 클릭 넘기기 4 · 탭 넘기기 1 · 끝까지 2.
  - 15주 완주 (seed play-2 · 역습형 `--until run`, 203초): 레슨 9번 — 붙기 3~5, 컷인 **4 · 4 · 4 · 1 · 2 · 1 · 3 · 2 · 3** (평균 2.67, 2~4번 7/9). 1번짜리 둘은 시즌 2 의 퍼펙트 레슨 (퍼펙트로 일찍 끝나 턴이 짧다 · 붙은 카드를 안 낸 턴) — C3 시뮬의 "끝까지 간 레슨 2~4번 81~83%" 와 같은 원인. 컷인 24번 = 클릭 13 · 탭 3 · 끝까지 8. 참고 줄 (추천 자리 ↔ 놓은 자리 0.03% 차로 큰 원 경계 선수 1명이 바뀜) 2건은 예전부터 있던 반올림 차이이고 대상 불일치는 아니다.
- **`node tools/shot.mjs` 전체 105장** (경기 01~27 · og_* 전부): 처음 돌렸을 때 `og_reward_perfect` · `_16` · `_18` · `_24` · `_32` 5장이 C4 UI 때 적어 둔 "물결 세이브 루틴+" 이름 잘림 (109.5 / 104.5px) 으로 걸렸다 → **고쳤다**: `ui/cards.js miniCard` 가 이름 (+ 포함) 9자 이상이면 `.mc-name.long` (12px · 자간 −0.03em, `css/lesson.css`) 을 붙인다. 다시 찍어 보상 · 상담 9장 · 전체 모두 스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0. `17_skill_row_many` 의 안쪽 가로 스크롤 +33 은 경기 화면 기존 동작 (검사 통과 대상).
- PNG 를 직접 봤다: `og_lesson_attach` (하르나 칩 · 주황 띠 · dock 두 줄) · `og_lesson_cutin_after` (×1.5 팝 · 능력 알약 · 유대 +5) · `og_lesson_cutin_short` (오르넬라 짧은 판 · 2인 1조 드릴+) · `og_lesson_small` (작은 원 2명 · 바르바라가 붙은 포스트 플레이+) · `og_reward_perfect_32` (긴 이름 전부 보임) · 브라우저 판 첫 컷인 (한나 → 기초 훈련+) · 보상 "지원 3번" 칩.
- 문서: `docs/OUTGAME_CARDS_draft.md` §4.1 **코치 지원 · 추가 능력** 표 (8명 — 능력 이름 · 능력 · 컷인 대사, 붙기 규칙 · 횟수 · [가정]) 와 §8 작은 원 8장 · 68장 설명, 상태 줄 L1~L38. ARCHITECTURE §20 규칙 범위 L1~L38 · lesson_play 컷인 수 보고, README lesson_play 한 줄.
- 바뀌지 않은 것: 엔진 · 데이터 · 수치 (붙기 4~5 · 컷인 0.9 / 0.6초 그대로). 테스트 304개 통과.

---

## 16. 고유 카드 모양 (L40)

> 상태: 구현 계획 · 2026-10-04 · 브랜치 `outgame-lesson`. 기준: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L40 (사용자 결정 2026-10-04: 고유 카드의 **모양을 연계 특성에서** 가져온다 — 같은 특성 = 같은 모양, 캐릭터마다 이름 · 그림만 다르다. 선수가 20명이 되어도 특성 수(9개)만큼만 설계한다).
> 표기는 §14 · §15와 같다. **[가정]** = 기획자가 아직 정하지 않은 값 (나중에 한 번에 바꾼다). **[구현 결정]** = 이 계획이 정한 세부. 둘 다 §16.13에 모았다.
> 수치는 "지금 고유 카드와 평균 값어치가 비슷하게"만 맞춘다 (§16.11 — 위력 손잡이 하나로). 그 밖의 밸런스는 건드리지 않고 시뮬 전 / 후만 보고한다.
> 여기 적지 않은 것은 §14 · §15 그대로다. 경기 쪽 파일(§0 — `match.js` · `ai.js` · `skills.js` · `rng.js` · `screens/match.js` · `layout.js` · `match.css`) · `data/config.json`은 바꾸지 않는다.

### 16.0 한눈에

| 무엇 | 지금 (§14.10 · L13 대체판) | L40 |
|---|---|---|
| 대상 | 주인 1명 (`target.kind: "owner"`) | 주인 **연계 특성의 모양** — 이어 주기 · 연결 · 크로스 (주인 + 1명), 주인 둘레 원 · 주인 구역 (주인 + 둘레), 자리 옮기기 · 가로지르기 (주인을 다른 구역으로), 마무리 (주인 1명) |
| 배율 | 주인이 포지션 주 스탯 구역에 서 있으면 ×1.5 (`lesson.unique.mainMult`) | **없앤다.** 배율은 모양이 정한다 (받는 선수 ×1.3 · 고른 선수 ×1.5 · 옮긴 구역 ×1.3 · 주인 ×1.5 · 슈팅 구역 ×2) |
| 데이터 | 카드마다 대상 · 효과 | 모양 = `data/traits.json`의 `lesson` 블록 (특성마다 1개). 카드는 `ownerCharId`로 주인을 가리키고 모양은 주인 캐릭터의 `trait`을 따라온다. 위력 · 비용률 · 남긴 효과 · 문구는 카드에 |
| 새 조작 | 경기장 아무 데나 놓기 | **이어 주기** (주인 → 선수로 끌기) · **자리 옮기기** · **가로지르기** (주인 → 구역으로 끌기). 나머지는 지금의 원 · 구역 · 단일 판정 그대로 |
| 성격 효과 | 8장 모두 예전 지원 효과 | 모양과 겹치는 것은 지우고 겹치지 않는 것만 남긴다 (§16.6) |
| 코치 지원 (L37) | 붙는다 | 그대로 붙는다 (§16.5) |
| 저장 | — | 바뀌지 않는다 (`lessonRun.version` 2, 이행 없음 — 모양은 데이터에서 계산) |

### 16.1 특성 → 모양 표

| 특성 (`traits.json` id) | 선수 · 카드 (이름 그대로) | 모양 `shape` | 대상 T (행 = 상승 1번) | 모양 배율 · 효과 | 엔진 인자 |
|---|---|---|---|---|---|
| 빠른 배급 `distributor` | 네리아 · 물결 세이브 루틴 | **이어 주기** `link` | 주인 + 받는 선수 1명 (경기장 어디든, 주인 아님) | 받는 선수 ×1.3 (`recvMult`) | `{ playerId }` 또는 `{ at }` |
| 철벽 `wall` | 도르비나 · 철벽 스쿼트 | **주인 둘레 작은 원** `ownerCircle` size small | 주인 위치 중심 r 8u 원 안 경기장 선수 전원 (= 주인 + 대형에서 바로 옆 0~2명) | 이 카드 **실패 판정 없음** (`mods.noFail`) | 없음 |
| 주장 `captain` | 아델린 · 주장의 호령 | **주인 구역 전원** `ownerZone` | 주인이 선 구역의 경기장 선수 전원 | 팀워크 +2 (`effects teamwork 2`) | 없음 |
| 킬패스 `killpass` | 실루엔 · 킬패스 리허설 | **연결** `pick` | 주인 + 고른 선수 1명 (경기장 어디든) | 고른 선수 ×1.5 (`recvMult`) | `{ playerId }` 또는 `{ at }` |
| 침투 `runner` | 타리아 · 침투 스프린트 | **자리 옮기기** `move` | 주인 1명 — 놓은 구역으로 **옮겨** 그 구역 스탯 | 주인 ×1.3 (`ownerMult`). 이번 턴 기본 훈련도 새 구역에서 | `{ zone }` 또는 `{ at }` |
| 크로서 `crosser` | 울리카 · 측면 왕복 크로스 | **크로스** `pick` + `onlyZones: [shoot]` + `fallbackZones: [dribble]` | 주인 + **슈팅 구역**에 선 선수 1명 (주인 아님). 슈팅 구역이 비면 **드리블 구역** 선수 1명 (L47, §16.15) | 팀워크 +1. 두 구역 모두 비면 낼 수 없다 (§16.4) | `{ playerId }` 또는 `{ at }` |
| 타깃맨 `targetman` | 그레타 · 포스트 플레이 | **주인 둘레 중간 원** `ownerCircle` size medium | 주인 위치 중심 r 15u 원 안 경기장 선수 전원 (= 주인 구역 전원, 이웃 구역 가장자리 선수가 들 수 있음) | 주인 ×1.5 (`ownerMult`) | 없음 |
| 볼 운반 `carrier` | 미르카 · 고양이 발재간 | **가로지르기** `carry` | 주인 1명 — **두 행**: 지금 구역 스탯 + 놓은 구역 스탯, 주인은 놓은 구역으로 옮긴다 | — (두 구역이 오르는 것이 모양) | `{ zone }` 또는 `{ at }` (지금 구역이면 오류) |
| 피니셔 `finisher` | (주인 없음 — 데이터 · 엔진만) | **마무리** `owner` + `zoneMult {shoot ×2}` | 주인 1명 (지금 구역 스탯) | 주인이 슈팅 구역이면 ×2 | 없음 |

- 모양 종류는 닫힌 목록 `cards.SHAPE_KINDS = ["link", "pick", "ownerCircle", "ownerZone", "move", "carry", "owner"]`. 크로서는 `pick`에 `onlyZones`, 피니셔는 `owner`에 `zoneMult`를 준 것이다 — 특성이 늘어도 종류는 늘리지 않고 인자로 만든다 [구현 결정].
- **이어 주기와 연결은 엔진에서 같은 해석기**(주인 + 받는 선수)이고 인자(`recvMult`)만 다르다. 다른 것은 **조작**이다 — 이어 주기는 주인 토큰에서 받는 선수로 선을 끌고 (§16.7), 연결 · 크로스는 받는 선수 위에 카드를 놓는다 (단일 카드와 같은 판정). 기획 표의 "새 조작 셋 = 이어 주기 · 자리 옮기기 · 가로지르기"와 같다.
- 모든 모양에서 **주인이 경기장에 있어야** 낼 수 있다 (벤치 · 결장이면 지금처럼 낼 수 없다).

### 16.2 데이터

**① `data/traits.json` — 특성마다 `lesson` 블록 (모양)**

```jsonc
{ "id": "distributor", …, "lesson": { "shape": "link",        "label": "이어 주기",         "chip": "이어 주기",   "recvMult": 1.3 } },
{ "id": "wall",        …, "lesson": { "shape": "ownerCircle", "label": "주인 둘레 작은 원", "chip": "둘레 작은 원", "size": "small", "mods": { "noFail": true } } },
{ "id": "captain",     …, "lesson": { "shape": "ownerZone",   "label": "주인 구역 전원",    "chip": "구역 전원",   "effects": [{ "type": "teamwork", "n": 2 }] } },
{ "id": "killpass",    …, "lesson": { "shape": "pick",        "label": "연결",              "chip": "연결",        "recvMult": 1.5 } },
{ "id": "runner",      …, "lesson": { "shape": "move",        "label": "자리 옮기기",       "chip": "자리 옮기기", "ownerMult": 1.3 } },
{ "id": "crosser",     …, "lesson": { "shape": "pick",        "label": "크로스",            "chip": "크로스",      "onlyZones": ["shoot"], "fallbackZones": ["dribble"], "effects": [{ "type": "teamwork", "n": 1 }] } },
{ "id": "targetman",   …, "lesson": { "shape": "ownerCircle", "label": "주인 둘레 중간 원", "chip": "둘레 중간 원", "size": "medium", "ownerMult": 1.5 } },
{ "id": "carrier",     …, "lesson": { "shape": "carry",       "label": "가로지르기",        "chip": "가로지르기" } },
{ "id": "finisher",    …, "lesson": { "shape": "owner",       "label": "마무리",            "chip": "마무리",      "zoneMult": { "zones": ["shoot"], "mult": 2 } } }
```

- **traits.json에 두는 이유** [구현 결정]: "같은 특성 = 같은 모양"이 데이터 구조로 보장된다 (20명이 되어도 특성 9개만 손본다). 경기 엔진은 `id` · `kind` · `amp` · `params`만 읽고 (`match.js traitMap`), `v05.test`의 무결성 검사도 필수 키 · `params` · `amp`만 비교하므로 `lesson` 키를 더해도 경기 쪽은 그대로다 (`match.js` · `DEFAULT_TRAITS`는 바꾸지 않는다 — 레슨 모양은 경기에 쓰이지 않는다).
- 인자 (모양마다 받는 키, 그 밖의 키는 검증 오류):

| 키 | 뜻 | 받는 모양 | 기본값 |
|---|---|---|---|
| `label` · `chip` | 한국어 이름 (카드 문구 머리 · 미리보기) / 카드 칩용 짧은 이름 (6자 이하) | 전부 (필수) | — |
| `recvMult` | 받는 선수 행 배율 | link · pick | 1 |
| `onlyZones` | 받는 선수 후보를 이 구역에 선 선수로 (⊂ `ZONE_IDS`) | link · pick | 없음 |
| `size` | `small` · `medium` → 반지름 `zones.ownerRadius[size]` | ownerCircle (필수) | — |
| `ownerMult` | 주인 행 배율 | ownerCircle · ownerZone · move · owner | 1 |
| `zoneMult` | `{ zones, mult }` — 주인 행이 그 구역이면 ×mult | owner | 없음 |
| `mods` | 카드 mods에 합친다 — `noFail`만 | 전부 | 없음 |
| `effects` | 카드 effects **앞**에 합친다 (`checkEffects`, `hint` · `when: consume` 금지) | 전부 | 없음 |

**② `data/lesson.json` (version 2 그대로)**

```jsonc
"zones": { …, "ownerRadius": { "small": 8, "medium": 15 }, "dropR": 12 }   // 더한다 [가정]
"lesson": { …, "unique": { "mainMult": 1.5 } }                              // 지운다 (L40 — 배율은 모양이)
```

- **주인 둘레 원의 반지름이 놓는 원(작은 4.2 · 중간 9)과 다른 이유** [구현 결정]: 놓는 원은 "두 선수 사이"에 놓도록 만든 크기다. 주인 둘레 원은 중심이 대형의 한 점(주인)이라 같은 반지름이면 작은 원(4.2u)은 늘 주인 혼자, 중간 원(9u)은 큰 대형에서 반대편이 빠진다. 대형 거리 실측 (`zones.zonePositions`, 반올림 포함):

  | 한 구역 인원 n | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|
  | 바로 옆 동료 거리 최대 (u) | 7.00 | 7.81 | 7.78 | 7.67 | 6.48 | 5.65 |
  | 그다음 동료 거리 최소 (u) | — | — | 11.00 | 12.34 | 11.20 | 10.11 |
  | 대형 지름 (u) | 7.00 | 7.81 | 11.02 | 12.40 | 12.96 | 12.68 |

  - 이웃 구역 선수와의 거리는 최소 **14.04u** (22.7u 이웃 쌍), 30u 쌍은 20.4u.
  - → `small` 8u = 주인 + 바로 옆 동료 최대 2명, 다른 구역은 절대 안 든다. `medium` 15u = 주인 구역 **전원**(지름 ≤ 12.96) + 22.7u 이웃 구역에서 주인 쪽 가장자리 선수가 드물게 든다 ("주변으로 모인 선수").
  - 흩어지기 2만 번 표본 (2-2-2, 중점 없음 · 슈팅 · 패스 · 수비): 평균 대상 수 small 2.00~2.15 · medium 2.12~2.31 · 주인 구역 2.12~2.31 · 17u여도 2.16~2.39 — 지금 배치에서 중간 원과 구역 전원은 대상이 거의 같다. 두 모양의 차이는 배율 · 효과다 (기획 표 그대로) [가정].
- `dropR` 12u: 자리 옮기기 · 가로지르기의 놓은 점 → 구역 = **중심이 가장 가까운 구역**, 그 거리가 `dropR` 이하일 때만 (구역 바닥 9u + 토큰 여유). 이웃 중심 22.7u의 가운데(11.35u)도 어느 한쪽으로 잡힌다. 같으면 `ZONE_IDS` 순서.

**③ `data/cards.json` — 고유 8장** (대상은 `{ "kind": "owner" }` 그대로 — "주인 특성의 모양"이라는 뜻이 된다. 위력 · 강화 · 효과 · 문구는 §16.6 표)

- 고유 카드는 모양 키를 갖지 않는다. 같은 특성의 새 선수 카드는 `ownerCharId` · 이름 · 문구만 다르게 쓰면 된다 (위력 · 효과를 같게 두는 것은 권장, 검증은 하지 않는다).

**④ 검증 (`cards.js`)**
- 새 export `SHAPE_KINDS` · `SHAPE_KEYS` (모양별 허용 키) · `shapeErrors(data)` · `validateShapeData(data)` (`lessonRun.createRun`과 `validateCardsData`에서 부른다 — §15의 `validateAttachData`와 같은 자리).
- 검사: `data.traits`가 있다 (없으면 "고유 카드 모양: data.traits 가 없습니다") / 덱에 들어갈 수 있는 고유 카드마다 `ownerCharId` → `characters[].trait` → `traits[].lesson`이 있다 / `shape ∈ SHAPE_KINDS` / 키가 그 모양의 허용 목록 안 / 배율 ≥ 1 / `size ∈ ownerRadius` 키 / `onlyZones` · `zoneMult.zones ⊂ ZONE_IDS` / `mods` 키 ⊂ `{noFail}` / `effects`는 `checkEffects` / `label` · `chip` 빈 문자열 아님 · `chip` ≤ 6자 / `lesson.json zones.ownerRadius` · `dropR` > 0.
- 9개 특성 모두 `lesson`을 갖는다 (피니셔 포함 — 지금 주인이 없어도).

### 16.3 엔진 의미 (`cards.js` · `lesson.js` · `zones.js`)

**① 카드 정의에 모양을 합친다 — `cards.resolveCardDef(data, card, opts)`**

고유 카드(`family: "unique"`)면 강화 · 유대 처리 **뒤**에:

```
shape   = cards.shapeOf(data, raw)            // traits[characters[ownerCharId].trait].lesson 를 기본값 채워 복사 + trait id
d.shape = shape                               // { kind, label, chip, trait, recvMult, ownerMult, onlyZones, size, zoneMult }
d.mods    = { ...shape.mods, ...d.mods }       // 철벽 → noFail
d.effects = [ ...shape.effects, ...d.effects ] // 주장 팀워크 2 · 크로서 팀워크 1 이 카드 효과 앞에
// baseMods 는 원본 카드 mods 그대로 (비용 계산용 — 모양 mods 에 비용 손잡이는 없다)
```

- 그래서 실패 없음 · 팀워크는 일반 카드 규칙(§14.7 5 · 12번)으로 처리되고, 코치 지원 needs (`fail` — 바르바라는 철벽 스쿼트에 붙지 않는다) · 감독 AI의 효과 가치 · 미리보기 노트가 따로 손보지 않아도 맞는다.
- 손패 밖 카드 뷰(보상 · 상담 · 덱 — `lessonRun cardView`)도 `resolveCardDef`를 거치므로 같은 `shape`를 쓴다.

**② 대상 계산 — `cards.shapePlan(state, def, args, data)` (새, 순수)** — `targetsFor`의 `owner` 갈래가 이것을 부르고 `T`만 돌려준다.

```jsonc
shapePlan → {
  kind,                                   // def.shape.kind
  ownerId,
  rows: [ { id, zone, role: "owner"|"recv"|"member", shapeMult } ],   // 상승 1번 = 행 1개. 주인 행이 늘 먼저
  T: [ id ],                              // 서로 다른 선수 (행 순서) — 비용 · 실패 · 팀워크 · 대상 횟수 · heal targets 의 단위
  receiverId: id | null,                  // link · pick
  circle: { x, y, r } | null,             // ownerCircle (주인 위치 중심)
  zone: z | null,                         // ownerZone: 주인 구역 · move · carry: 놓은 구역
  move: { id, from, to } | null           // move · carry: 옮기기 (move 에서 to == from 이면 null)
}
```

| 모양 | 인자 → 대상 | 행 (zone · shapeMult) | 틀리면 throw |
|---|---|---|---|
| `link` · `pick` | `playerId` (후보여야 함) 또는 `at` → `zones.nearestWithin(위치, at, pickR, 후보)`. 후보 = 경기장 선수 − 주인 (`onlyZones`면 그 구역에 선 선수만) | 주인 (자기 구역, ×1) · 받는 선수 (자기 구역, ×recvMult) | "받을 선수 위에 놓으세요" · "그 선수는 받을 수 없습니다" |
| `ownerCircle` | 인자 없음 (`at`이 와도 무시) → `zones.inCircle(위치, 주인 위치, ownerRadius[size])` | 주인 ×ownerMult, 나머지 ×1 (각자 자기 구역) | — (주인이 늘 안에 있다) |
| `ownerZone` | 인자 없음 → 경기장 선수 중 `zones[id] == zones[주인]` | 주인 ×ownerMult, 나머지 ×1 | — |
| `move` | `zone` (∈ ZONE_IDS) 또는 `at` → `zones.zoneAt(at, cfg)` | 주인 (놓은 구역, ×ownerMult). 놓은 구역 = 지금 구역이면 옮기지 않고 그 자리 ×1.3 | "구역 위에 놓으세요" |
| `carry` | `zone` 또는 `at` → `zoneAt`. 지금 구역과 같으면 오류 | 주인 (지금 구역, ×1) · 주인 (놓은 구역, ×1) — 같은 선수 두 행 | "다른 구역에 놓으세요" |
| `owner` | 인자 없음 | 주인 (지금 구역, ×ownerMult × (zoneMult.zones ∋ 구역 ? mult : 1)) | — |

- 행 순서: 주인 먼저, 그다음 받는 선수 · 원 · 구역 안 선수는 슬롯 순서 [구현 결정].
- 위치는 `cards.fieldPositions` (벤치 · 결장 제외) 그대로다. 주인 둘레 원 판정은 놓는 원과 같은 `inCircle`(경계 포함, 1e-9).
- `zones.zoneAt(at, cfg)` 새 export (순수): `clampPoint(at)` → 중심이 가장 가까운 구역, 거리 > `cfg.dropR`면 null.

**③ `planPlay` 처리 (§14.7을 고유 카드에 맞게 — 다른 카드는 그대로)**

| §14.7 단계 | 고유 카드 (L40) |
|---|---|
| 2. 대상 | `shapePlan`. `T` = 서로 다른 선수, `rows` = 상승 행 |
| 3. 1인 위력 | 행마다 `p = power` (모양에 상관없이 1인 위력, **주 스탯 ×1.5 없음**) `+ routine` (**주인 행만**) `× attPow` (§15.2 pct) `+ 집중 몫`. 집중 몫 = `focus × focusPer × (focusX2 ? 2 : 1) / 행 수` |
| 4. 비용 | **서로 다른 선수마다 1번** `roundCost(basePower × costRate × pressCostMult)` (`nextCostZero`면 0). 가로지르기는 두 행이어도 1번. `costBase`의 `mainMult` 인자는 지운다 |
| 5. 실패율 | 예전과 같다 (T 중 가장 위험한 선수 1명, 카드 1장에 1번). 철벽은 `mods.noFail`로 0 |
| 6. 배율 M | 행마다 `M0 × zoneMult(행 구역) × shapeMult × (코치 능력 lessonMult · 행 구역)`. 고유 카드는 코치 카드 ×1.3 · 대비 ×1.5 대상이 아니다 (예전과 같다) |
| 7. 비용 지불 · 옮기기 | **move · carry: 비용 앞에서 `L.zones[주인] = to`** (성공 · 실패와 상관없이 — 이미 달려갔다). fx `{ t: "move", id, from, to }` |
| 7. 실패 판정 | 실패자의 **모든 행**은 상승 없음. 손실 `failStatLoss`(5)는 실패자의 **마지막 행 구역** 스탯에서 1번 (가로지르기 · 자리 옮기기 = 놓은 구역). 부상이면 예전과 같다 (`zones`에서 빠진다) |
| 8. 상승 | 행마다 `g = round(p × growth[행 구역] × M)` → 그 구역 스탯, 부 스탯 = 그 구역의 부 스탯 (§14.7 8번 식 그대로). 가로지르기는 두 스탯 · 두 부 스탯이 오른다 |
| 9. 팀워크 (L10) | **서로 다른** 성공 인원 − 1 (가로지르기 = 1명이라 0). 모양 팀워크(주장 +2 · 크로스 +1)는 카드 효과 팀워크 — 레슨 상한 8과 별개 (§14.7 9번과 같다) |
| 10. 버프 소비 | T ≠ ∅ — 고유 카드는 늘 소비한다 (예전과 같다). `nextPairPct`는 쓰지 않는다 (주인 둘레 작은 원은 "작은 원 카드"가 아니다 — `isSmallCircle`은 `circle` 카드만) |
| 11. 방침 | 문맥은 **행 구역**(옮긴 뒤)으로: `hasAttackZone` = 어느 행이 공격 구역 · `allDefenseZone` = 모든 행이 수비 구역 · `hasPassZone` = 어느 행이 패스 구역 |
| 13. 기록 | `targeted`는 서로 다른 선수마다 +1. `cardGains`는 행 합 |

- fx 순서: `cutin`(붙었으면) → `move` → `cost` → `pass` (`{ t: "pass", from: 주인, to: 받는 선수 }`, link · pick) → `gain` / `fail` (행마다 — 가로지르기는 같은 id의 `gain` 2개, `stat`이 다르다) → 버프 · 효과 (예전과 같다).
- **옮긴 뒤**: 그 턴 남은 동안 주인은 새 구역에 서 있다 — 뷰 `positions`가 바뀌어 두 대형이 다시 모이고, 그 뒤에 내는 원 · 단일 · 크로스 판정도 새 자리 기준이다. 턴 끝 기본 훈련은 새 구역 (`L.zones`를 그대로 읽으므로 따로 할 일 없음). 벤치에 보냈다가 돌아오면 새 구역으로 (§14.5 "자기 구역" = `zones[id]`). 다음 턴 흩어지기가 다시 정한다.
- 한 턴에 여러 번 옮길 수 있다 (추가 사용으로 침투 스프린트를 두 번 등) [구현 결정].
- `deadReason(state, def)` (턴 시작 다시 뽑기 · `playable`): 주인 규칙(명단 · 결장 · 벤치 · 경기장) 다음에 link · pick은 받는 후보 0명이면 "받을 선수가 없습니다" (크로스: 슈팅 · 드리블 구역 모두 비면 "슈팅·드리블 구역에 받을 선수가 없습니다", L47). ownerCircle · ownerZone · move · carry · owner는 주인만 있으면 낼 수 있다.

**④ 미리보기 · 후보 · 뷰 (순수, rng 없음)**

```jsonc
previewCard(state, data, { uid, at, playerId, zone }) → { …예전,
  shape: { kind, label, chip, ownerId,
           receiverId, line: { from: {x,y}, to: {x,y} } | null,     // link · pick: 주인 → 받는 선수 (아직 없으면 주인 → 놓은 점, ok:false)
           circle, zone, from, to,
           positionsAfter: { id: {x,y} } | null,                     // move · carry: 옮긴 뒤 경기장 위치 (토큰 유령 · 다시 모인 대형)
           baseDelta } | null,                                      // move · carry: 이번 턴 끝 주인 기본 훈련 (새 구역 − 지금 구역)
  targets: [ { …, role, shapeMult } ] }                             // 가로지르기는 같은 id 두 줄 (stat 이 다름). unique15 는 지운다
```

- `ok:false` 이유 문구: "받을 선수 위에 놓으세요" · "슈팅 구역 선수 위에 놓으세요" · "구역 위에 놓으세요" · "다른 구역에 놓으세요" · "받을 선수가 없습니다" · "슈팅 구역에 받을 선수가 없습니다".
- 노트 (맨 앞, 코치 지원 노트 다음): "받는 선수 ×1.3" · "고른 선수 ×1.5" · "실패 없음 (철벽)" · "팀워크 +2" · "타리아 → 슈팅 구역 · 기본 훈련도" · "미르카 수비 → 패스 · 두 구역" · "슈팅 구역 ×2" / "슈팅 구역이 아니라 ×1".
- `dropCandidates(state, data, { uid })`:
  - link · pick: 받는 후보마다 `{ at: 그 선수 위치, playerId, ids: [주인, 그 선수], kind: "player" }`
  - move: 5구역 `{ at: 구역 중심, zone, ids: [주인], kind: "zone" }` (지금 구역 포함, `ZONE_IDS` 순서)
  - carry: 지금 구역을 뺀 4구역
  - ownerCircle · ownerZone · owner: 1개 `{ at: 주인 위치, ids: T, kind: "owner" }` (새 kind — 예전 `(50, 50)` "field" 대신)
- `getLessonView`:
  - `zoneCfg`에 `ownerRadius` · `dropR`를 더한다.
  - 손패 카드 뷰에 `shape: { kind, label, chip, size, r, recvMult, ownerMult, onlyZones, zoneMult, needs: "player"|"zone"|null }` · `ownerId` (고유 카드만, 그 밖 null).
  - 고유 카드 `cost` = 1인 비용 (주 스탯 분기 없음).

### 16.4 벤치 · 결장 · 부상

| 상황 | 처리 |
|---|---|
| 주인이 벤치 · 결장 | 낼 수 없다 (예전과 같다, 결장이면 고유 카드는 이미 `removed`) |
| 받는 선수 후보 | 경기장 선수만 (벤치 · 결장 · 주인 제외). 0명이면 죽은 카드 (턴 시작이면 다시 뽑기, 행동 중이면 `playable: false`) |
| 크로스에 슈팅 구역 선수가 없음 | **L47로 바뀜 → 드리블 구역 선수에게** (§16.15). 아래는 처음 결정: **낼 수 없다** (대체 대상 없음) [구현 결정 — "슈팅 구역으로 올리는 크로스"가 카드의 정체. 흩어지기 표본에서 울리카 말고 슈팅 구역에 누가 있을 확률 약 62%]. U2 시뮬에서 울리카 카드 낸 수 / 런이 기준(§16.11)의 60% 밑이면 "슈팅 구역이 비면 드리블 구역 선수" 대체를 기획자에게 묻는다 |
| 주인 둘레 원 · 구역 | 벤치 선수는 경기장에 없어 들지 않는다 |
| 옮긴 뒤 벤치 | 주인을 벤치로 보내면 기본 훈련 없음, 돌아오면 새 구역. 옮긴 사실은 되돌리지 않는다 |
| 실패 · 부상 | 실패자 1명(가장 위험한 대상). 받는 선수가 실패자일 수도 있다 (그 선수만 손해 — L16). 부상이면 그 선수 고유 카드 제거 (예전과 같다) |
| 회복 효과 | `heal owner` · `heal defense` · `heal all`은 예전 위치 규칙 (§14.7 12번), 코치 능력 `heal targets` = 서로 다른 T |

### 16.5 코치 지원 (L37) · 방침 · 기타 버프

- **코치는 고유 카드에 붙을 수 있다** (지금과 같다 — 위력이 있으므로 needs `power` 통과) [구현 결정]. 강화(`plus`)는 위력 · 효과만 바꾸고 모양 인자는 그대로다. `pct` (+20%)는 행마다 위력에. 하르나 `lessonMult`는 **행 구역**마다 (가로지르기에서 놓은 구역이 슈팅이면 그 행만 ×1.5). 바르바라(needs `fail`)는 철벽 스쿼트에 붙지 않는다 (모양 `noFail`이 합쳐져 있다). 한나 `heal targets` = 서로 다른 T.
- 방침 패시브는 §16.3 ③의 행 구역 문맥. 역습형: 자리 옮기기로 공격 구역에 가면 탈취를 쓴다 · 수비 구역 둘 사이 가로지르기는 쌓는다. 점유형: 패스 구역 행이 있으면 +1.
- 호조 · 다음 카드 +% · 실패 없음 · 비용 0 소비는 예전과 같다. 루틴(+8)은 주인 행에만.
- 퍼펙트 판정 · 턴 끝 진행은 예전과 같다.

### 16.6 8장 — 수치 · 효과 정리 · 문구 (모두 [가정], U2가 위력만 보정)

> U2 보정 뒤 위력 (§16.14 U2): 네리아 20 · 도르비나 **21** · 아델린 **19** · 실루엔 20 · 타리아 **33** · 울리카 **28** · 그레타 **20** · 미르카 **25** (강화 = round(×1.25), 비용 = roundCost(×0.4)). 아래 표는 U1 시작 수치다.

시작 위력은 "모양 1번의 기대 위력 합 ≈ 예전 주인 단일의 기대 위력 (35 × 주 스탯 구역 확률 반영 ≈ 1.3) ≈ 46"으로 잡았다 — 받는 선수 · 대형 인원 · 배율을 곱한 값. 강화판 = `round(1인 × 1.25)`, 비용 = `roundCost(1인 × 0.4)` (비용률 0.4 그대로).

| id · 이름 | 모양 | 1인 (+강화) | 비용 /명 | 기대 위력 합 | 남긴 효과 (강화) | 지운 효과 — 이유 |
|---|---|---|---|---|---|---|
| `cd_u_neria` 물결 세이브 루틴 | 이어 주기 ×1.3 | 20 (25) | 8 | 20 × 2.3 = 46 | 주인 체력 +10 (+15) — 배급하며 숨 고르기 (예전 15 / 25에서 줄임: 두 명이 비용을 낸다) | 다음 카드 실패 없음 — "실패 없음"은 철벽의 정체 |
| `cd_u_dorbina` 철벽 스쿼트 | 둘레 작은 원 · 실패 없음 | 22 (28) | 9 | 22 × 2.1 = 46 | GK · DF 체력 +10 (+15) 그대로 | — |
| `cd_u_adeline` 주장의 호령 | 구역 전원 · 팀워크 +2 | 20 (25) | 8 | 20 × 2.25 = 45 | 체력 전원 +3 (+5) 그대로 | 팀워크 +3 (+4) — 모양 팀워크 +2와 겹침 |
| `cd_u_silluen` 킬패스 리허설 | 연결 ×1.5 | 20 (25) | 8 | 20 × 2.5 = 50 | — | 다음 카드 +40% (+55%) — "고른 선수를 빛나게"와 겹침 (그만큼 위력을 조금 높게) |
| `cd_u_taria` 침투 스프린트 | 자리 옮기기 ×1.3 | 30 (38) | 12 | 30 × 1.3 = 39 + 구역 고르기 (중점 · 성장률) | 다음 턴 손패 +1 (+2) 그대로 | — |
| `cd_u_ulrika` 측면 왕복 크로스 | 크로스 · 팀워크 +1 | 24 (30) | 10 | 24 × 2 = 48 (낼 수 없는 턴이 있다) | — | 팀워크 +1 — 모양과 같음. 다음 작은 원 +50% (+75%) — "둘이 하는 훈련"이 모양과 겹침 |
| `cd_u_greta` 포스트 플레이 | 둘레 중간 원 · 주인 ×1.5 | 17 (21) | 7 | 17 × 2.7 = 46 | 다음 카드 비용 0 (강화: + 주인 체력 +10) 그대로 | — |
| `cd_u_mirka` 고양이 발재간 | 가로지르기 (두 구역) | 22 (28) | 9 | 22 × 2 = 44 | 추가 사용 +1, 주인 체력 −5 (강화: −5 없음) 그대로 | — |
| (피니셔 — 카드 없음) | 마무리 · 슈팅 ×2 | 참고 30 (38) | 12 | — | — | — |

- 모양 효과(실패 없음 · 팀워크)는 traits.json에 있고 카드 `effects`에는 남긴 효과만 쓴다. 강화판 `plus.effects`도 남긴 효과만.
- `nextPairPct`(다음 작은 원)를 쓰는 카드가 없어진다 — effect · 버프 · 칩 라벨은 엔진에 남긴다 (나중 카드용) [구현 결정].
- 문구 (`desc` / `descPlus`, 머리 = 모양 `label` — `ui/cards.js effectDesc`가 "… · 1인 N," 머리를 떼고 보여 준다):

| id | desc | descPlus |
|---|---|---|
| `cd_u_neria` | 이어 주기 · 1인 20, 받는 선수 ×1.3, 주인 체력 +10 | 이어 주기 · 1인 25, 받는 선수 ×1.3, 주인 체력 +15 |
| `cd_u_dorbina` | 주인 둘레 작은 원 · 1인 22, 실패 없음, GK·DF 체력 +10 | 주인 둘레 작은 원 · 1인 28, 실패 없음, GK·DF 체력 +15 |
| `cd_u_adeline` | 주인 구역 전원 · 1인 20, 팀워크 +2, 체력 +3 | 주인 구역 전원 · 1인 25, 팀워크 +2, 체력 +5 |
| `cd_u_silluen` | 연결 · 1인 20, 고른 선수 ×1.5 | 연결 · 1인 25, 고른 선수 ×1.5 |
| `cd_u_taria` | 자리 옮기기 · 1인 30, 옮긴 구역에서 ×1.3, 다음 턴 손패 +1 | 자리 옮기기 · 1인 38, 옮긴 구역에서 ×1.3, 다음 턴 손패 +2 |
| `cd_u_ulrika` | 크로스 · 1인 24, 슈팅 구역 1명과, 팀워크 +1 | 크로스 · 1인 30, 슈팅 구역 1명과, 팀워크 +1 |
| `cd_u_greta` | 주인 둘레 중간 원 · 1인 17, 주인 ×1.5, 다음 카드 비용 0 | 주인 둘레 중간 원 · 1인 21, 주인 ×1.5, 다음 카드 비용 0, 주인 체력 +10 |
| `cd_u_mirka` | 가로지르기 · 1인 22, 두 구역 스탯, 추가 사용 +1, 주인 체력 −5 | 가로지르기 · 1인 28, 두 구역 스탯, 추가 사용 +1 |

### 16.7 입력 모델 · UI (1280×720, 스크롤 · 잘림 없음)

**판정은 늘 엔진이다.** UI는 놓은 점(필드 %) · 고른 선수 id · 고른 구역 id만 넘기고, 끄는 동안의 강조는 `run.previewCard(…, { uid, at | playerId | zone })`의 `shape` · `targets`로 그린다 (§14.16과 같은 rAF 1번).

| 모양 | 끄는 동안 (카드를 경기장 위로) | 놓는 곳 → 인자 | 조준 모드 (클릭 · 탭) | 키보드 |
|---|---|---|---|---|
| 이어 주기 | 주인 토큰에서 포인터까지 **패스 선** `.aim-link` (공 점), pickR 안 후보에 붙는다. 후보 토큰 옅은 고리 `.cand`, 받는 선수 "+N ×1.3" | 받는 선수 위 → `{ at }` | 받는 선수를 누르면 `playerId`. **주인 토큰을 끌어** 받는 선수에 놓아도 된다 (선수 → 선수 끌기) | ← → 후보 ("네리아 → 실루엔"), Enter |
| 연결 · 크로스 | 단일처럼 십자 + 주인 → 받는 선수 점선. 크로스는 슈팅 구역 바닥이 빛나고 그 밖 토큰은 흐리게 | 받는 선수 위 → `{ at }` | 받는 선수를 누르면 `playerId` | ← → 후보, Enter |
| 둘레 작은 원 · 중간 원 | 카드를 집는 순간 주인 중심 원 `.aim-circle.owner` (rx · ry = `circlePx(ownerRadius)`) + 대상 강조 | 경기장 아무 데나 | 카드 두 번 누르기 / [내기] | Enter |
| 구역 전원 | 주인 구역 바닥 `.zone-pad.aim` + 그 구역 대상 강조 | 경기장 아무 데나 | 〃 | Enter |
| 자리 옮기기 | 주인 **토큰 유령** `.tok-ghost`가 포인터를 따르고, 포인터 밑 구역 바닥 강조 + 주인 → 바닥 화살표 + "+N ×1.3 · 기본 +b" | 구역 바닥 위 → `{ at }` (엔진 `zoneAt`) | 구역 바닥을 누르면 `zone`. **주인 토큰을 끌어** 구역에 놓아도 된다 | 숫자 1~5 = 구역 (§14.21 ZU2 순서), ← → 후보, Enter |
| 가로지르기 | 자리 옮기기와 같고, 지금 구역 바닥도 다른 색으로 강조. 꼬리표 "+a 수비 · +b 패스". 지금 구역 위면 빨간 점선 "다른 구역에 놓으세요" | 다른 구역 바닥 위 → `{ at }` | 〃 | 〃 (지금 구역 숫자는 무시) |
| 마무리 | 주인 토큰이 빛나고 슈팅 구역이면 "×2" 배지 | 경기장 아무 데나 | 두 번 누르기 / [내기] | Enter |

- **주인 토큰 끌기** (이어 주기 · 자리 옮기기 · 가로지르기의 "선수에서 끌기"): 그 카드가 조준 모드일 때만 주인 토큰 `pointerdown`이 모양 끌기가 된다 (6px 넘게 움직이면 시작, 놓으면 그 점으로 `playCard`). 조준 모드에서는 다른 토큰 끌기(벤치로)는 하지 않고, 누르면 받는 선수 / 구역 고르기다. 조준이 아닐 때 토큰 끌기 = 벤치 (§14.16 그대로).
- 터치: 탭 1번 = 자리 정하기 (받는 선수 · 구역), 같은 자리 한 번 더 또는 [내기] = 내기 (§14.16과 같다).
- dock 안내 칸 (조준 전): "네리아에서 받을 선수에게 끌어 놓으세요" · "실루엔과 함께할 선수 위에 놓으세요" · "슈팅 구역 선수 위에 놓으세요" · "타리아를 옮길 구역에 놓으세요" · "미르카가 가로지를 구역에 놓으세요" (24자 안팎 — 한 줄).
- **연출** (`lesson_layout.fxPlan` — `play.move` · `play.pass`를 꺼낸다):
  - `move`: 주인 토큰이 새 자리로 뛰어간다 (`--t-move` 450ms, 두 대형이 다시 모인다) → 비용 → 훈련 동작. 가로지르기는 지금 구역 색 고리 → 새 구역 색 고리, "+a" "+b" 두 팝 (아이콘으로 구분).
  - `pass`: 주인 → 받는 선수 공 호 `.ls-ball` 300ms → 두 선수 훈련 동작. 받는 선수 팝 "+N ×1.3".
  - `no-anim`이면 0ms (예전과 같다). 이 카드들만 약 0.3~0.45초 늘어난다.
- **카드 앞면** (`ui/cards.js`):
  - 대상 칩 = 모양 `chip` ("이어 주기" · "둘레 작은 원" · "구역 전원" · "연결" · "자리 옮기기" · "크로스" · "둘레 중간 원" · "가로지르기" · "마무리"), 아이콘 `.cf-ticon.s-<kind>` (선 · 원 · 바닥 · 화살표 · 두 화살표 · ★).
  - 위력 줄 "1인 20" + 작은 배율 칩 (`.cf-pmult` "받는 쪽 ×1.3" · "고른 쪽 ×1.5" · "×1.3" · "주인 ×1.5" · "슈팅 ×2"). "주 스탯 구역 ×1.5" 칩은 지운다.
  - 비용 줄: 여러 명이 비용을 내는 모양(이어 주기 · 연결 · 크로스 · 원 · 구역) "체력 −8 /명", 한 명(자리 옮기기 · 가로지르기 · 마무리) "체력 −12". `uniqueMainMult` · "−14~21" 범위 표기는 지운다.
  - 손패 밖(보상 · 상담 · 덱 · 미니 카드)도 같은 칩 — `lessonRun` 카드 뷰가 `shape`를 준다.
- **없애는 표시** (주 스탯 ×1.5가 없어져서):
  - 주 화면 레슨 카드의 고유 ×1.5 얼굴 `.wl-owners` (`getWeekView().lessons[].boosted` 키도 지운다)
  - 미팅 · 경기 전 준비의 "고유 ×1.5 구역 변경" `.mode-chg` (자리를 바꿔도 고유 카드는 바뀌지 않는다)
  - 상담 고유 카드 삭제 확인 문구 → "고유 카드(연계 특성 모양 · 캐릭터 효과)"
  - `lessonRun`의 `mainStatsOf` 재export 주석 · `boostedInZone`

### 16.8 상태 · 저장 · lessonRun

- **LessonState에 새 필드 없음.** 옮기기는 `L.zones`를 바꿀 뿐이다 (§14.15 "위치는 저장하지 않는다" 그대로).
- **저장**: `lessonRun.version` 2 그대로, 이행 없음. 레슨 중 저장본도 그대로 이어진다 — 손패의 고유 카드는 불러온 뒤 새 모양으로 낸다 (모양 · 수치는 데이터에서 계산) [구현 결정].
- `lessonRun.playCard`는 `zone` 인자를 그대로 넘긴다. `previewCard` · `dropCandidates`도.
- `getWeekView().lessons[]` = `{ zone, label, special, prep, target, cap, turns, expected }` (`boosted` 지움).
- `lessonResult` 모양 그대로 (가로지르기의 두 행은 `byStat`에 두 스탯으로 · `card`에 합으로 들어간다).
- `createRun`이 `validateShapeData`를 부른다 (런 시작 1번).

### 16.9 감독 AI (`manager.js`, rng 없음)

- 후보 = `dropCandidates` (§16.3 ④) — link · pick은 받는 후보 수(≤ 6), move 5, carry 4, 나머지 1. 손패 3~5장 × 후보 수가 지금 원 카드(30~45)보다 적어 성능 문제 없음.
- `scoreDrop`: `previewCard`에 `{ at, playerId, zone }`을 그대로. EV 식(§14.14 · §15.6)은 그대로이고 **하나 더한다**: `+ pv.shape.baseDelta` (자리 옮기기 · 가로지르기가 이번 턴 기본 훈련을 바꾸는 몫 — 미리보기 값 그대로, pref 없음) [가정].
- 이득 합 `Σ gain_i × pref_i`는 **행마다** (가로지르기 두 행이 각자 그 구역 주 스탯 여부로 pref).
- 모양 효과(주장 팀워크 · 크로스 팀워크)는 `def.effects`에 합쳐져 있어 `buffValue`가 그대로 센다. 철벽 noFail은 미리보기 실패율 0으로 들어간다.
- 추천 행동에 `zone`을 더한다: `{ kind: "play", uid, at?, playerId?, zone?, score }`. `autoStep` · `?autolesson=1`은 그대로 넘긴다.
- 벤치 먼저 · 라인 내리기 · endTurn 규칙은 그대로.

### 16.10 테스트

| 파일 | 더하는 것 · 바꾸는 것 |
|---|---|
| `cards.test` | 모양 데이터: 9특성 모두 `lesson` · 닫힌 목록 · 모양별 허용 키 · 배율 ≥ 1 · `size` · `onlyZones` · `mods` · `effects` · `chip` 길이 / 잘못된 데이터 오류 문구 (모르는 shape · 남는 키 · 주인 캐릭터 특성에 `lesson` 없음 · traits 없음) / 8장 표 (§16.6 위력 · 강화 · 비용 · 남긴 효과 · 문구 머리 = `label`) / `resolveCardDef` 합치기 (철벽 `mods.noFail`, 주장 · 크로서 팀워크가 카드 효과 앞, 강화판에도) / `costBase` 주 스탯 배율 없음 / `deadReason` 모양별 (크로스 슈팅 구역 비면 · 이어 주기 다른 선수 모두 벤치면 · 주인 벤치). **지움:** `ownerOnMainZone` · 비용 [14, 21] 표 |
| `zones.test` | `zoneAt` (중심 · `dropR` 경계 포함 · 가운데 점은 가까운 쪽 · 같으면 ZONE_IDS 순 · 밖이면 null) / 주인 둘레 원 약속: n = 1~7 대형에서 small = 주인 + 바로 옆 ≤ 2명 · 다른 구역 0명, medium = 주인 구역 전원 / `lesson.json`에 `ownerRadius` · `dropR`, `lesson.unique` 없음 |
| `lesson.test` | 모양 7종 각각 (구역 고정 픽스처): 대상 · 행 · 배율 · 인자 검증 오류 / **미리보기 = 실제** (상승 · 비용 · 실패율 · 실패자) / 옮기기: `zones` 바뀜 · 위치 다시 모임 · 턴 끝 기본 훈련이 새 구역 · 벤치 갔다 오면 새 구역 · 다음 턴 흩어지기 · 실패해도 옮김 · 실패 손실은 놓은 구역 스탯 · 부상 / 가로지르기 두 스탯 · 두 부 스탯 · 비용 1번 · 팀워크 0 · 같은 구역 거절 / 철벽 실패 0 / 팀워크 (모양 + L10, 서로 다른 인원) / 집중 몫 ÷ 행 수 · 루틴 주인 행만 / 방침 문맥이 행 구역 (역습형 옮겨서 공격 구역 → 탈취 사용, 가로지르기 수비 → 피지컬 → 쌓기, 점유형 패스 구역) / 코치 지원: 고유 카드에 붙음 · plus · pct 행마다 · 하르나 행 구역별 · 바르바라는 철벽에 안 붙음 · 한나 heal targets 서로 다른 T / 피니셔 픽스처 (데이터 사본에 피니셔 특성 캐릭터 + 고유 카드 — 슈팅 ×2, 아니면 ×1) / 뷰 손패 `shape` · `ownerId` / `dropCandidates` 모양별 / 순수 (미리보기 · 뷰 · 후보가 rngState · 상태를 바꾸지 않는다) / JSON 왕복 · 같은 rngState 같은 결과. 66장 → 68장 **퍼즈**에 모양 인자 (무작위 `playerId` · `zone` · `at`) 를 더하고 매 행동 뒤 불변식 (점수 = 기본 + 분위기 + 카드, 경기장 선수만 `zones`, 벤치 ≤ 2). **지움:** "고유 카드 주 스탯 구역 ×1.5" 테스트 |
| `cardEffects.test` | 고유 8줄을 모양 기대값으로 다시 쓴다 (기본판 · 강화판, 고정 배치 — 받는 선수 · 원 안 인원 · 옮길 구역 지정) |
| `lessonRun.test` | `playCard`에 `zone`이 넘어간다 / 주 뷰 `lessons[]` 키 목록에 `boosted` 없음 / 보상 · 상담 · 덱 카드 뷰의 고유 카드에 `shape` / `createRun`이 모양 데이터 오류를 막는다 |
| `manager.test` | 추천이 늘 유효 (move · carry는 `zone`, link · pick은 받는 선수) / 자리 옮기기 픽스처: 특별 중점 구역으로 옮기는 추천 (EV에 `baseDelta`) / rng 없음 / 15주 완주 그대로 + 미르카가 낀 편성 (`squad` FW2 = 미르카) 완주 |
| `lessonLayout.test` | `fxPlan` `move` · `pass` / 고유 카드 비용 문구 ("체력 −8 /명" · "체력 −12", 범위 표기 없음) / `effectDesc` 새 머리 8개 / `uniqueMainMult` 없음 |
| `lessonUi.test` | 모양별 조준 → 내기 (클릭 · 키보드: 받는 선수 누르기 · 숫자 키 구역 · 가로지르기 지금 구역 숫자 무시) → seq +1 · 저장 / 카드 앞면 칩 · 배율 칩 / 조준 중 주인 토큰 누르기는 벤치가 아님 / 주 화면 `.wl-owners` 없음 · 미팅 `.mode-chg` 없음 (`outgame.test` 해당 줄도). 끌기(선 · 유령)는 jsdom 레이아웃이 없어 스크린샷 · `lesson_play`로 본다 |
| `ui.smoke` · `outgame.test` | 15주 완주 중 고유 카드 모양 7종이 1번 이상 나온다 (미르카는 편성 바꾼 판), 필수 선택자 `.aim-link` · `.tok-ghost` 는 lesson.css 에 |
| 그 밖 | 경기 쪽 · `v05.test` (traits 무결성 · DEFAULT_TRAITS 비교) 그대로 통과 |

### 16.11 시뮬 · 보정 (`tools/lesson_sim.mjs`)

**기준 (이 문서 커밋의 엔진, U0 실측)** — 감독 AI · 경기 없음 · 2-2-2 · 방침 5개 × 40런 (seed `u0-<방침>-<i>`), 카드를 낸 행동의 `lastFx` (턴 끝 앞까지) 에서 직접 상승 = 상승 − 실패 손실, EV = 감독 AI 점수:

| 카드 | 낸 수 / 런 | 손에 든 턴 / 런 | 직접 상승 / 장 | 실패 % | 비용 / 장 | EV / 장 | 강화 % |
|---|---|---|---|---|---|---|---|
| 아델린 | 4.17 | 12.0 | 70.3 | 3.6 | 18.5 | 132 | 55 |
| 도르비나 | 3.38 | 12.3 | 79.1 | 5.2 | 19.2 | 138 | 65 |
| 그레타 | 3.69 | 11.6 | 61.2 | 7.1 | 20.1 | 146 | 15 |
| 네리아 | 4.67 | 12.3 | 76.1 | 3.7 | 18.3 | 126 | 81 |
| 실루엔 | 4.72 | 11.6 | 66.6 | 6.0 | 18.1 | 138 | 42 |
| 타리아 | 4.09 | 11.3 | 61.0 | 8.8 | 18.5 | 150 | 34 |
| 울리카 | 3.77 | 11.5 | 64.9 | 6.2 | 18.6 | 140 | 19 |
| 미르카 (FW2 자리 · 그레타 대신) | 5.40 | 11.1 | 54.4 | 8.7 | 19.5 | 146 | 12 |

- 7장 평균: 직접 상승 **68.5 / 장**, EV **약 139 / 장**, 고유 카드 낸 수 합 **28.5 / 런** (카드 전체 52.1 / 런).
- 재현: U2가 이 지표를 `lesson_sim`에 넣고, "전" 값은 이 커밋을 `git worktree`로 따로 돌린다 (C3과 같은 방법).

**`lesson_sim` 추가**
- `--unique-report`: 위 표 (카드별 · 모양별) + 가로지르기 / 자리 옮기기 구역 분포 (어디로 옮겼나) + 이어 주기 · 연결 받는 선수 포지션 분포 + 크로스를 낼 수 없던 턴 비율.
- `--slot SLOT=charId` (여러 번 가능): 기본 편성의 그 자리를 다른 캐릭터로 (미르카 측정용 `--slot FW2=ch_cat_trickster`).

**보정 규칙** (U2)
- 손잡이는 **카드 `power` · `plus.power`(= round(×1.25)) 하나** — 비용은 비용률 0.4로 따라온다. 모양 배율 · 남긴 효과 · 반지름은 바꾸지 않는다.
- 띠 (모양별, 방침 5개 합): **EV / 장 111~167** (기준 139 ± 20%) 이고 **직접 상승 / 장 55~85**. 고유 카드 낸 수 합 **21~36 / 런** (기준 28.5 ± 25%). 미르카는 FW2 판에서 같은 띠.
- 띠 밖이면 위력을 정수로 올리고 내려 다시 잰다 (최대 3번). 그래도 밖이면 원인 (예: 크로스 낼 수 없는 턴) 을 보고하고 멈춘다.
- 보고: 위 표의 전 / 후, 런 단위 전 / 후 (클리어율 · 퍼펙트율 · 런당 성장 · 기본 비중 · 부상 · 실패 · 팀워크 · 경계전 승률 — 경기 포함 200런 seed 1), 정한 위력.

### 16.12 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건:
- `npm test` 통과
- `git diff --stat main -- js/engine/match.js js/engine/ai.js js/engine/skills.js js/engine/rng.js js/ui/screens/match.js js/ui/layout.js css/match.css data/config.json` 비어 있음
- 엔진 순수 · 결정적 (rng는 `state.rngState`로만, 미리보기 · 뷰 · 후보 · 감독 AI는 rng를 쓰지 않음), 판정은 엔진의 필드 좌표
- 바뀐 점은 §16.14에, 슬라이스마다 커밋 (경로 지정 `git add`)

**U1 · 엔진 + 데이터**
- 할 일: `traits.json` `lesson` 9개 · `lesson.json` (`ownerRadius` · `dropR` 더하기, `unique` 지우기) · `cards.json` 8장 (§16.6 시작 수치 · 효과 · 문구) · `cards.js` (`SHAPE_KINDS` · `shapeOf` · `shapePlan` · `validateShapeData` · `resolveCardDef` 합치기 · `deadReason` · `costBase` · `ownerOnMainZone` 지움) · `zones.js` (`zoneAt`) · `lesson.js` (§16.3 ③ · ④ — 행 · 옮기기 · fx `move` · `pass` · 미리보기 `shape` · 노트 · 후보 · 뷰) · `lessonRun.js` (`zone` 넘기기 · `boosted` 지움 · 카드 뷰 `shape` · `createRun` 검증) · `manager.js` 최소 (추천에 `zone`, 후보 그대로 돌게 — 다듬기는 U2).
- 테스트: §16.10의 cards · zones · lesson · cardEffects · lessonRun. 엔진 키가 바뀌어 깨지는 UI 테스트(주 화면 `boosted` · `uniqueMainMult` · 비용 문구)는 **최소로 고쳐** 통과시키고 §16.14에 적는다 (본격 UI는 U3).
- 완료 조건: 모양 7종 미리보기 = 실제 (퍼즈 포함) · 옮기기 뒤 턴 끝 기본 훈련이 새 구역 · JSON 왕복 · 결정성 · 감독 AI 15주 완주 (manager.test 그대로).

**U2 · 감독 AI · 시뮬 · 보정**
- 할 일: §16.9 (`baseDelta` · 행마다 pref · `zone`), manager.test, `lesson_sim` `--unique-report` · `--slot`, §16.11 보정 (위력만), `cards.json` · 문구 · cards.test 표를 정한 위력으로.
- 완료 조건: manager.test 60초 안, §16.11 띠 안 (밖이면 원인 보고), 보고에 전 / 후 표.

**U3 · UI**
- 할 일: §16.7 전부 — `ui/cards.js` (칩 · 아이콘 · 배율 칩 · 비용 · `effectDesc` · `uniqueMainMult` 지움), `screens/lesson.js` (모양별 조준 표시 · 주인 토큰 끌기 · 받는 선수 / 구역 누르기 · 키보드 · 터치 · dock 안내 · 연출 `move` · `pass`), `lesson_layout.js` (`fxPlan`), `css/lesson.css`만, 주 화면 · 미팅 · 준비 · 상담 문구 정리, lessonLayout.test · lessonUi.test · outgame.test · ui.smoke.
- 시나리오 (`tools/lesson_scenarios.mjs`): `og_lesson_u_link` (주인 토큰 끌기 중 — 선 · 받는 선수 +N ×1.3) · `_u_pick` · `_u_cross` (슈팅 구역 강조) · `_u_cross_dead` (낼 수 없음 띠) · `_u_wall` (주인 둘레 작은 원) · `_u_zone` (주장 구역) · `_u_post` (중간 원 · 주인 ×1.5) · `_u_move` (유령 · 화살표 · 기본 +b) · `_u_move_after` (옮긴 뒤 대형) · `_u_carry` (두 바닥 · 두 팝) · `_u_hand` (고유 카드 3장 앞면) · `og_reward_unique` (보상 앞면 칩).
- 완료 조건: jsdom 모양별 조준 → 내기, `node tools/shot.mjs og_lesson_u_ …` 검사 통과 (스크롤 · 잘린 글자 · 겹침 · 원 판정 — 주인 둘레 원도 `.aim-circle` 타원 안 = `.target`), **PNG를 직접 열어** 잘림 · 겹침 · 선 · 유령 위치를 본다.

**U4 · 통합 · 문서**
- 할 일: `tools/lesson_play.mjs`에 모양 입력 (이어 주기 = 주인 토큰 끌기, 연결 · 크로스 = 카드 끌어 받는 선수, 자리 옮기기 = 카드 끌어 구역, 가로지르기 = 키보드 숫자, 둘레 원 = 터치 두 번) + "놓기 직전 화면 대상 = 실제 대상" 검사를 행 단위로, 실제 브라우저 판 2번 (1280×720 시즌 1 · 미르카 편성 시즌 1), `node tools/shot.mjs` 전체, `docs/OUTGAME_CARDS_draft.md` 고유 카드 표 · L40, ARCHITECTURE §20 · README 한 줄, §16.14.
- 완료 조건: `npm test` 전부 · shot 전체 통과 · 브라우저 판 입력 실패 · 대상 불일치 · 에러 · 스크롤 0, 스크린샷 경로 보고.

순서 의존: U1 → U2 (엔진 뒤 보정) → U3 (뷰 · fx 계약 §16.3 ④ 고정 뒤, U2의 수치 문구) → U4. U3는 U1 뒤부터 시작할 수 있지만 카드 문구 확인은 U2 뒤에 한다. 배포(푸시)는 기획자 확인 뒤.

### 16.13 [가정] · [구현 결정] 목록

**[가정]** (기획자 확인 대상 — 나중에 한 번에 바꾼다)
1. 주 스탯 구역 ×1.5를 없앤다 — 배율은 모양만 (받는 선수 ×1.3 · 고른 선수 ×1.5 · 옮긴 구역 ×1.3 · 주인 ×1.5 · 슈팅 ×2).
2. 주인 둘레 원 반지름 작은 8u · 중간 15u (놓는 원 4.2 · 9와 다름 — §16.2 ②), 구역 놓기 반경 12u.
3. §16.6 시작 위력 (20 · 22 · 20 · 20 · 30 · 24 · 17 · 22, 피니셔 참고 30) → U2 보정 위력 (20 · 21 · 19 · 20 · 33 · 28 · 20 · 25 — §16.14) · 비용률 0.4 · 남긴 효과의 양 (네리아 체력 +10/+15로 줄임).
4. 지운 성격 효과: 네리아 다음 카드 실패 없음 · 아델린 팀워크 +3 · 실루엔 다음 카드 +40% · 울리카 다음 작은 원 +50% · 팀워크 +1.
5. 크로스는 슈팅 구역에 받을 선수가 없으면 낼 수 없다 (대체 없음). → **L47 (2026-10-04)로 바뀜**: 슈팅 구역이 비면 드리블 구역 선수에게 (§16.15).
6. 가로지르기 뒤 주인은 놓은 구역에 선다 (돌아오지 않는다).
7. 감독 AI EV에 옮기기의 기본 훈련 변화(`baseDelta`)를 그대로 더한다.

**[구현 결정]**
- 모양은 `traits.json` `lesson` 블록 (경기 엔진은 읽지 않음), 카드는 `owner` 대상 그대로 + `ownerCharId` → 캐릭터 `trait`.
- 모양 종류 7개 닫힌 목록, 크로서 = `pick` + `onlyZones`, 피니셔 = `owner` + `zoneMult`. 이어 주기와 연결은 같은 해석기 · 다른 조작.
- 모양 mods · effects는 `resolveCardDef`에서 카드에 합친다 (실패 없음 · 팀워크가 일반 규칙으로).
- 행 단위 상승 · 서로 다른 선수 단위 비용 · 실패 · 팀워크 · 대상 횟수. 실패 손실은 실패자 마지막 행 구역.
- 옮기기는 비용 · 실패 판정 전에, 성공과 상관없이. 한 턴 여러 번 가능.
- 집중 몫은 행 수로 나누고, 루틴은 주인 행만.
- 코치 지원은 고유 카드에 붙는다 (모양 인자는 강화되지 않는다).
- 저장 버전 그대로 · 레슨 중 저장본도 새 모양으로.
- `nextPairPct`는 쓰는 카드가 없어도 엔진에 남긴다.

### 16.15 크로스 대체 구역 (L47, 2026-10-04)

기획자 결정: 크로서(울리카 · 리시엘)의 크로스 카드는 슈팅 구역에 받을 선수가 없으면 **드리블 구역** 선수에게 낸다.

- 데이터: `traits.json` crosser `lesson`에 `"fallbackZones": ["dribble"]`. `link` · `pick` 모양에서 `onlyZones`와 함께만 쓸 수 있고, `onlyZones`와 겹치면 안 된다 (`validateShapeData`).
- 엔진: `cards.receiverZones(state, def)` = 지금 받는 선수를 고를 구역. `onlyZones`에 받을 선수(주인 제외 · 경기장)가 있으면 `onlyZones`, 없으면 `fallbackZones`. **대체는 슈팅 구역이 비었을 때만** — 슈팅 구역에 누가 있으면 드리블 구역 선수는 받을 수 없다. `shapeReceivers` · `shapePlan` · `deadReason` · 미리보기 안내 문구(`cards.receiverHint`)가 이 함수를 쓴다. 두 구역 모두 비면 "슈팅·드리블 구역에 받을 선수가 없습니다".
- 배율 · 효과는 같다 (받는 선수 ×1, 팀워크 +1). 받는 선수의 행 구역 = 그 선수가 선 구역 (드리블 구역이면 드리블 스탯이 오른다).
- 뷰: 손패 `shape.zonesNow` (= `receiverZones`, 구역 제한이 있는 모양만). 화면은 `zonesNow`로 바닥 강조 · 놓기 안내를 한다 (슈팅 구역이 비면 드리블 구역 바닥이 빛난다). 쓰는 법 한 줄 "울리카 + 슈팅 1명 (없으면 드리블)", 카드 문구 "슈팅 구역 1명과 (없으면 드리블 구역)".
- 시뮬 (`lesson_sim --runs 100 --policy ace --no-match --unique-report --slot MF2=ch_elf_archer`, 바꾸기 전 → 뒤):

  | 카드 | 낸 수 / 런 | 손 턴 / 런 | 못 낸 턴 % |
  |---|---|---|---|
  | 울리카 측면 왕복 크로스 | 1.37 → 2.18 | 5.3 → 8.3 | 45.9 → 12.0 |
  | 리시엘 과녁 크로스 | 1.97 → 2.74 | 6.5 → 8.8 | 35.9 → 7.6 |

- 테스트 정리: 시드가 바뀌어 깨지기 쉬웠던 곳 세 군데를 고쳤다 — `lessonUi.test` 실패 보상은 마지막 턴 점수를 0으로 두고 만든다 (시드 40개에서 실패 레슨이 안 나왔다), 코치 수업 바꾸기 줄은 첫 수업을 받을 선수가 2명 이상인 시드를 찾는다, 경기 전 준비 부상 줄은 진행 중 부상을 지우고 1명만 다치게 한다. `lessonRun.test` 15주 완주는 대비 레슨 1~2번을 받는다 (테스트 정책이 평균 체력 40 미만이면 쉰다).

### 16.14 구현 중 바뀐 것

**U1 · 엔진 + 데이터** (2026-10-04)

- **행의 `cost`는 그 선수의 첫 행에만** 둔다. 가로지르기 두 번째 행은 0이다. 그래서 미리보기 `targets`의 Σ cost가 실제로 낸 비용과 같다 (감독 AI · UI가 행을 그대로 더해도 된다). 실제 지불은 서로 다른 선수 `T`마다 `plan.cost` 1번이다.
- **같은 선수의 두 행은 앞 행이 오른 뒤의 스탯으로 상한(1000)을 자른다** (`planPlay`가 행마다 스탯 사본을 이어 쓴다). 상한 근처에서도 미리보기와 실제가 같다. 다른 카드는 1명 = 1행이라 예전과 같다.
- `d.shape`(`resolveCardDef`)에는 §16.3 ①의 키에 더해 `traitName`(노트 "실패 없음 (철벽)"용) · `mods` · `effects`(모양 쪽 사본)도 둔다. 뷰용 `cards.shapeView`는 `mods` · `effects`를 빼고 `noFail` · `trait` · `r` · `needs`를 준다 (손패 · 보상 · 상담 · 덱 카드 뷰가 같은 함수를 쓴다).
- `chip` 길이 검사는 **띄어쓰기를 빼고 6자 이하**다. "둘레 작은 원" · "둘레 중간 원"은 띄어쓰기를 세면 7자다.
- 새 export: `cards.SHAPE_KINDS` · `SHAPE_KEYS` · `SHAPE_NEEDS`(`player` · `zone` · `null`) · `SHAPE_MOD_KEYS` · `zoneLabels` · `shapeOf` · `shapeView` · `shapeReceivers` · `shapePlan` · `validateShapeData`, `zones.zoneAt`. 지운 export: `cards.ownerOnMainZone`. `costBase`는 `mainMult` 인자를 받지 않는다 (넘겨도 무시).
- `validateCardsData`는 모양 검사를 늘 한다. 그래서 `data.traits`가 없는 번들은 카드 검증에 실패하고, 고유 카드 해석(`resolveCardDef`)은 "고유 카드 모양: data.traits 가 없습니다"로 throw한다. 고유 카드가 아닌 카드는 traits 없이도 해석된다. 앱 로더는 traits를 선택 파일로 읽지만 파일이 늘 있으므로 문제없다.
- 미리보기 `circle`(맨 위 키)은 놓는 원 카드만 쓰고, 주인 둘레 원은 `shape.circle`에만 둔다.
- 미리보기 노트 문구 (§16.3 ④에 없던 것): 주인 둘레 원 · 주인 구역에 `ownerMult`가 있으면 "그레타 ×1.5", 자리 옮기기를 지금 구역에 놓으면 "타리아 패스 구역 그대로". 크로스는 배율이 1이라 배율 노트가 없고 "팀워크 +1"만 붙는다.
- `zoneAt`의 경계: 중심에서 정확히 `dropR`는 그 구역이다 (1e-9). 수비 · 패스 중심의 가운데 (35, 30)은 두 중심 모두 15u라 어느 구역도 아니다 (null).
- `lessonRun`의 `mainStatsOf` 재export는 남겼다. 미팅 · 경기 전 준비 UI(`meeting.js`)가 아직 읽는다. 표시 정리는 U3에서 한다.
- **감독 AI는 최소로만 바꿨다** (§16.9의 나머지는 U2): 자리 옮기기 · 가로지르기 후보만 `zone`을 넘기고 추천 · `autoStep`도 `zone`을 넘긴다. 방침 문맥과 `buffValue`는 행 구역(`rowZones`)으로 계산하고, 대상 수 감점은 서로 다른 선수로 센다. EV의 `baseDelta`는 아직 더하지 않았다. 15주 완주(`manager.test`)는 그대로 통과한다.
- **UI는 최소로만 바꿨다** (본격 UI는 U3): `ui/cards.js uniqueMainMult`는 `lesson.unique`가 없으면 1을 돌려준다. 그래서 고유 카드 비용 범위("−14~21")와 "주 스탯 구역 ×1.5" 칩이 사라진다. `screens/lesson.js`의 `pointCard` · `needsPoint`에 `shape.needs`를 더했다 (받는 선수 · 구역이 필요한 고유 카드도 조준 → 키보드 후보 · 숫자 키 구역 → [내기]로 낸다). `?autolesson=1`도 `zone`을 넘긴다. 주 화면 `.wl-owners`는 얼굴이 0개로만 나오고, 요소는 아직 남아 있다.
- 테스트를 최소로 고친 것: `lessonUi.test`는 클리어 보상 상태를 시드 5개 안에서 찾는다 (시드 "lesson-ui"의 레슨 9개가 모두 퍼펙트가 되었다). `ui.smoke` 경기 장면 `18_box_link_decision`은 레슨 런 시드 1의 스탯이 바뀌어 처음으로 "GK 세이브" 갈래가 걸렸다. 예전 단언은 연출이 끝난 뒤의 공격 측을 봤는데, 화면이 상대 배급 · 포제션까지 이어 가므로 세이브 이벤트의 `toAttackingSide`로 바꿨다 (테스트 파일만 바꿨고 경기 쪽 코드는 그대로다). `outgame.test`는 `.wl-owners` 얼굴 0개와 `boosted` 키가 없는지 본다. `lessonLayout.test`는 고유 카드 비용 = 1인 비용 하나인지 본다. `cards.test`의 "모든 effect가 쓰인다" 검사는 `nextPairPct`를 예외로 둔다 (§16.6 — 엔진에 남김).
- **시뮬 (보고만 — 보정은 U2)**:
  - 측정 방법: U0 스크립트 `unique_base.mjs 40`, 감독 AI, 경기 없음, 방침 5개 × 40런, 시작 수치는 §16.6 그대로.

  | 카드 | 낸 수 / 런 (기준) | 직접 상승 / 장 (기준) | 실패 % | 비용 / 장 | EV / 장 (기준) |
  |---|---|---|---|---|---|
  | 아델린 | 3.37 (4.17) | 86.3 (70.3) | 10.8 | 21.8 | 105 (132) |
  | 도르비나 | 4.09 (3.38) | 90.5 (79.1) | 0.0 | 21.9 | 114 (138) |
  | 그레타 | 3.13 (3.69) | 68.2 (61.2) | 5.9 | 17.8 | 99 (146) |
  | 네리아 | 6.30 (4.67) | 70.1 (76.1) | 6.2 | 15.1 | 111 (126) |
  | 실루엔 | 4.56 (4.72) | 71.2 (66.6) | 9.2 | 14.8 | 113 (138) |
  | 타리아 | 4.46 (4.09) | 54.7 (61.0) | 9.1 | 11.3 | 112 (150) |
  | 울리카 | **1.27** (3.77) | 67.6 (64.9) | 6.3 | 18.6 | 100 (140) |
  | 미르카 (FW2 판) | 6.17 (5.40) | 47.2 (54.4) | 8.9 | 9.1 | 116 (146) |

  - 7장 직접 상승 평균은 72.7 / 장(기준 68.5)으로 띠 55~85 안이다. 고유 카드 낸 수 합은 27.2 / 런(기준 28.5)으로 띠 21~36 안이다.
  - EV / 장은 99~116으로 띠 111~167의 아래쪽이거나 그 밑이다. 이 시작 수치에서는 감독 AI 점수가 낮게 나온다: 비용을 여러 명이 내고, 지운 성격 효과의 버프 값이 빠졌다. U2가 위력 손잡이로 맞춘다.
  - **울리카 크로스는 낸 수가 기준의 34%다.** §16.4의 60% 밑이다: 손에 든 턴 6.5 / 런, 슈팅 구역이 비면 죽은 카드라 턴 시작에 다시 뽑힌다. §16.4에 따라 U2가 "슈팅 구역이 비면 드리블 구역 선수" 대체를 기획자에게 묻는다.
  - 런 단위 (`lesson_sim --runs 40 --no-match`, 방침 5개): 퍼펙트율 88~92% → 90~94%, 런당 성장 5,970~6,207 → 6,215~6,406, 기본 비중 28.6~30.1% → 28.0~29.5%, 부상 1.48~1.82 → 1.23~1.85 / 런. 경기 포함 200런 전 / 후는 U2가 잰다.

**U2 · 감독 AI · 시뮬 · 보정** (2026-10-04)

- **감독 AI** (`manager.js`): EV에 `+ pv.shape.baseDelta`를 더한다 (§16.9, 실패와 상관없이 — 옮기기는 실패해도 일어난다). pref는 이미 U1에서 행마다 (`pv.targets` 행 구역) 셌으므로 식만 주석에 적었다. 다른 EV 항 · 상수는 바꾸지 않았다.
- **manager.test** (+3): 추천 검사(`checkValid`)가 `zone`을 미리보기에 넘기고, 구역 모양은 `zone ∈ ZONE_IDS`, 받는 선수 모양은 주인이 아닌 경기장 선수 = `shape.receiverId`, 가로지르기는 다른 구역인지 본다 / 자리 옮기기 픽스처 (특별 수비 · 피지컬 · 슈팅 레슨 → 그 구역으로 옮기는 추천, 분위기로 기본 훈련 단위만 바꾸면 점수 차 = baseDelta 차, 낸 뒤 move fx · 턴 끝 기본 훈련이 새 구역) / 이어 주기 · 연결 · 크로스 · 가로지르기 추천 유효 · 후보 미리보기 ok · 상태 불변 / 미르카 편성 (FW2) 15주 완주 · 결정성 · JSON 왕복 · 미르카 카드 ≥ 1번 · 고유 카드 4종 이상. 파일 전체 약 1.3초.
- **`lesson_sim`**: `--slot SLOT=charId` (여러 번, 포메이션과 함께 써도 된다 — `squadFor` export) · `--unique-report` (카드별 · 모양별 표, 못 냄 턴 %, 자리 옮기기 · 가로지르기 놓은 구역 분포 · 제자리 비율, 이어 주기 · 연결 · 크로스 받는 선수 포지션 분포, `--json`이면 `unique` 키). U0 `unique_base.mjs`와 같은 방법(카드를 낸 행동의 `lastFx` 턴 끝 앞까지)이다. 다른 점 — "손에 든 턴"은 레슨 턴마다 1번 센다 (U0 스크립트는 행동마다 셌다), "못 냄 턴 %" = 레슨 턴 첫 행동 앞에 덱의 그 카드가 `deadReason`인 비율.
- **보정** (위력만, 3번 — §16.11 규칙). 측정: 감독 AI · 경기 없음 · 2-2-2 · 방침 5개 × 80런 (seed u2), 미르카는 `--slot FW2=ch_cat_trickster`. 1번: 아델린 20→19 · 도르비나 22→21 · 그레타 17→19 · 타리아 30→32 · 울리카 24→27 · 미르카 22→24. 2번: 타리아 33 · 울리카 28 · 미르카 25. 3번: 그레타 20.

  | 카드 · 모양 | 위력 (강화) U1 → U2 | 낸 수 / 런 기준 → U2 | 직접 상승 / 장 기준 → U2 | EV / 장 기준 → U2 | 실패 % | 비용 / 장 | 못 냄 턴 % |
  |---|---|---|---|---|---|---|---|
  | 아델린 · 주인 구역 전원 | 20 (25) → **19 (24)** | 4.17 → 3.11 | 70.3 → 83.8 | 132 → 103 | 8.2 | 21.0 | 0 |
  | 도르비나 · 주인 둘레 작은 원 | 22 (28) → **21 (26)** | 3.38 → 3.64 | 79.1 → 84.5 | 138 → 107 | 0.0 | 18.8 | 0 |
  | 그레타 · 주인 둘레 중간 원 | 17 (21) → **20 (25)** | 3.69 → 3.54 | 61.2 → 78.3 | 146 → 111 | 8.8 | 20.4 | 0 |
  | 네리아 · 이어 주기 | 20 (25) 그대로 | 4.67 → 6.42 | 76.1 → 70.1 | 126 → 113 | 6.3 | 15.2 | 0 |
  | 실루엔 · 연결 | 20 (25) 그대로 | 4.72 → 4.54 | 66.6 → 70.7 | 138 → 111 | 8.1 | 15.1 | 0 |
  | 타리아 · 자리 옮기기 | 30 (38) → **33 (41)** | 4.09 → 4.98 | 61.0 → 59.9 | 150 → 113 | 9.0 | 12.3 | 0 |
  | 울리카 · 크로스 | 24 (30) → **28 (35)** | 3.77 → **1.61** | 64.9 → 76.2 | 140 → 109 | 8.8 | 20.8 | **44.8** |
  | 미르카 · 가로지르기 (FW2 판) | 22 (28) → **25 (31)** | 5.40 → 6.39 | 54.4 → 54.5 | 146 → 122 | 9.3 | 10.1 | 0 |

  - U2 열 = 경기 포함 1000런 (`lesson_sim --runs 200 --seed 1 --unique-report`), 미르카 = 경기 없음 400런 FW2 판. 기준 = §16.11 (U0).
  - 7장 낸 수 가중 평균: 직접 상승 **73.2 / 장** (기준 68.5, U1 72.7) · EV **110 / 장** (기준 약 139, U1 99~116) · 고유 카드 낸 수 합 **27.8 / 런** (기준 28.5). 런당 고유 카드 직접 상승 합 = Σ 낸 수 × 상승 ≈ 2,040 (기준 약 1,950, +5%).
  - **띠 판정**: 직접 상승 55~85 — 7장 모두 안 (미르카 54.5는 기준 54.4와 같다 — 경계). 낸 수 합 21~36 — 안. **EV 111~167 — 그레타 · 실루엔 · 네리아 · 타리아 · 미르카만 안**, 아델린 103 · 도르비나 107 · 울리카 109는 밑이다. 3번 뒤에도 밖이라 멈췄다.
  - **EV가 띠 밑인 원인 (위력 아님)**: 같은 시드의 추천 시점 EV 분해 (경기 없음 100런, U0 엔진 vs U1 수치) — 기대 상승 × pref는 비슷하거나 더 큰데 (아델린 79.8 → 87.7, 도르비나 94.1 → 100.4) 나머지 항(버프 가치 − 실패 손실 − 체력 40 미만 대상 감점 + 덜 큰 선수 보너스 몫)이 41~82 → 17~52로 줄었다. 대상이 2~3명이 되어 "체력 40 미만 대상 −10 / 명"이 여러 번 걸리고, 예전 1명 단일이 받던 덜 큰 선수 보너스(주 스탯 구역 ×1.5 자리)가 사라졌고, 지운 성격 효과 (다음 카드 실패 없음 15 · 다음 카드 +40% 30 · 다음 작은 원 20) 의 가치가 빠졌다. 아델린 · 도르비나는 직접 상승이 이미 띠 위쪽 (84~86) 이라 EV를 위해 위력을 올리면 상승이 띠를 넘는다 → 직접 상승 띠를 우선했다 [구현 결정]. EV는 감독 AI의 내부 점수일 뿐이고 실제 성장 기여는 기준과 같거나 조금 크다.
  - **울리카 크로스 — 기획자에게 묻는다 (§16.4)**: 낸 수 1.61 / 런 = 기준의 **43%** (§16.4의 60% 밑). 레슨 턴의 45%에서 슈팅 구역에 울리카 말고 아무도 없어 낼 수 없다 (턴 시작에 다시 뽑힌다 — 손에 든 턴 5.8 / 런, 다른 카드 10~11). 위력을 올려도 낸 수는 늘지 않는다 (24 → 28에서 1.24 → 1.61, 대신 장당 상승이 기준보다 크다). 제안: "슈팅 구역이 비면 드리블 구역 선수에게 (팀워크 +1은 그대로)". 기획자 답 전에는 바꾸지 않는다.
  - 받는 선수 · 옮긴 구역 분포: 네리아 이어 주기 → DF 40% · FW 35% · MF 25%, 실루엔 연결 → FW 41% · DF 34% · GK 14% · MF 12%, 울리카 크로스 → FW 70% · MF 21%. 타리아 자리 옮기기 → 드리블 42% · 패스 35% · 수비 9% · 피지컬 8% · 슈팅 7%, 제자리 31%. 미르카 가로지르기 → 드리블 48% · 슈팅 23% · 패스 19% (슈팅 ↔ 드리블 왕복이 39%).
- **런 단위 전 / 후** (경기 포함 200런 × 방침 5개, seed 1, 감독 AI는 늘 특별 레슨 — 전 = `4950093` (L40 앞, `git worktree`), 후 = U2):

  | 지표 | ace | team | counter | press | poss |
  |---|---|---|---|---|---|
  | 클리어율 | 99% → 100% | 99% → 100% | 99% → 100% | 99% → 100% | 99% → 99% |
  | 퍼펙트율 | 88% → 92% | 87% → 92% | 92% → 94% | 89% → 92% | 87% → 91% |
  | 런당 성장 | 6,095 → 6,363 | 6,027 → 6,191 | 6,147 → 6,337 | 6,139 → 6,242 | 6,077 → 6,209 |
  | 기본 비중 | 29.6% → 28.3% | 30.4% → 29.6% | 28.6% → 27.9% | 29.0% → 28.2% | 29.9% → 28.6% |
  | 런당 부상 | 1.48 → 1.55 | 1.53 → 1.63 | 1.52 → 1.71 | 1.53 → 1.74 | 1.83 → 1.86 |
  | 런당 실패 판정 | 3.11 → 3.10 | 3.19 → 3.28 | 3.24 → 3.36 | 3.19 → 3.52 | 3.48 → 3.57 |
  | 팀워크 (런 끝) | 91 → 97 | 97 → 100 | 96 → 100 | 97 → 100 | 98 → 100 |
  | 경계전 승률 | 55% → 56% | 55% → 54% | 57% → 54% | 59% → 52% | 54% → 52% |

  - 성장 +2~4% · 퍼펙트 +2~5%p · 팀워크 상한 근처 (여러 명 모양의 L10 팀워크 + 주장 +2). 부상 · 실패가 조금 늘었다 (대상이 여러 명이라 위험한 대상이 더 자주 걸린다 — 부상 띠 0.9~1.7을 counter · press · poss가 조금 넘는다). 경계전 승률은 200런 표본 오차(±3.5%p) 안팎이다. 벤치는 6.5 → 4.5 / 런 (ace)로 줄었다. **보고만 한다** (밸런스는 나중에 한 번에 — 기획자 방침).

**U3 · UI** (2026-10-04)

- **카드 앞면** (`ui/cards.js`): 대상 칩 = 모양 `chip` (분홍 `.cf-target.shape`) + 아이콘 `.cf-ticon.s-<kind>`. 크로스는 `pick`이지만 따로 `s-cross`(호 + 주황 점)로 그려 8장이 모두 다른 아이콘이다. 카드 요소에도 `.sh-<kind>`를 단다. 배율 칩 `.cf-pmult.shape`는 "받는 쪽 ×1.3" · "고른 쪽 ×1.5" · "옮긴 구역 ×1.3" · "주인 ×1.5" · (마무리) "슈팅 ×2"다.
  - 배율 문구는 짧은 꼴 `multShort` ("×2", 엔진 노트와 같다)를 쓴다. 특별 레슨의 "×2.0"(`L.multText`)과는 다르다.
  - 문구(`cf-desc`)는 모양 머리를 떼고(`effectDesc`), **배율 칩과 같은 마디도 뺀다**(`shapeDesc` — "받는 선수 ×1.3" · "옮긴 구역에서 ×1.3" · "주인 ×1.5"). 남는 말이 없으면(실루엔) 쓰는 법 한 줄 `shapeHow` ("실루엔 + 고른 1명")를 쓴다. title에도 "연결: 실루엔 + 고른 1명"을 넣는다.
  - 비용: `shapeMulti` (이어 주기 · 연결 · 크로스 · 둘레 원 · 구역 전원) = "체력 −8 /명", 자리 옮기기 · 가로지르기 · 마무리 = "체력 −13". `uniqueMainMult` · `estimateCost`의 `mainMult` 인자 · 범위 표기는 지웠다.
  - 낼 수 없는 이유 띠(`.cf-reason`)는 두 줄까지 감싼다. "슈팅 구역에 받을 선수가 없습니다"가 176px 카드에서 잘렸다.
- **조준 표시** (`screens/lesson.js` — 판정은 늘 `previewCard`의 `shape` · `targets`):
  - 이어 주기 · 연결 · 크로스: `.aim-link` (주인 → `shape.line.to`, 아직 받는 선수가 없으면 → 포인터). 이어 주기는 실선 + 공(`.al-ball`), 연결 · 크로스는 점선, 크로스는 주황, 놓을 수 없으면 빨강. 받는 후보 `.cand`, 후보가 아닌 경기장 선수는 `.noncand`(흐리게), 크로스는 슈팅 구역 바닥 `.zone-pad.aim`.
  - 둘레 원: 놓는 원과 같은 `.aim-circle`에 `.owner` (분홍 실선). shot.mjs의 원 판정(타원 안 = `.target`)이 그대로 걸린다.
  - 구역 전원: 주인 구역 바닥 `.zone-pad.aim`.
  - 자리 옮기기 · 가로지르기: `.aim-arrow` (주인 → 옮긴 자리 = `shape.positionsAfter[주인]`), 유령 `.aim-ghost` (클래스 `tok-ghost`도 단다 — 끄는 중이면 포인터 `.follow`, 아니면 옮긴 자리), 끄는 중 옮긴 자리 점 `.aim-spot`, 놓을 구역 `.zone-pad.aim` / 놓을 수 없으면 `.bad`, 가로지르기 지금 구역 `.zone-pad.from` (하늘 점선), 감독 추천 구역 `.zone-pad.rec`.
  - `.zone-pad.aim` · `.bad`는 특별 중점 바닥의 빛 애니메이션(`pad-glow`)을 끈다 — 애니메이션이 box-shadow를 덮어 슈팅 구역 강조가 금색으로 보였다.
  - 꼬리표: 받는 선수 옆 "2명 · +53 · 실패 2%", 놓을 구역 바닥 모서리 "+52 ×1.3 · 기본 +2" / "+20 드리블 · +34 슈팅", 주인 둘레 원 · 구역 옆 "3명 · +49". 말풍선은 배율이 걸린 행만 "+37 ×1.3"(분홍 `.bub.shape`), 가로지르기는 두 행의 합이다.
  - 주인 토큰 `.shape-owner` (분홍 고리), 끄는 출발점이면 `.shape-src` (숨쉬기 · grab).
  - dock: 안내 한 줄 ("네리아에서 받을 선수에게 끌어 놓으세요" · "실루엔과 함께할 선수 위에 놓으세요" · "슈팅 구역 선수 위에 놓으세요" · "타리아를 옮길 구역에 놓으세요" · "미르카가 가로지를 구역에 놓으세요" — 받침에 따라 과/와 · 을/를 · 이/가). 대상 수는 서로 다른 선수로 센다. 자리 옮기기 · 가로지르기는 구역 합 줄 끝에 "기본 훈련 ±b" (`shape.baseDelta`). 키 안내 "받을 선수 누르기 · 네리아 끌기 · ←→ 후보 · Enter 내기".
- **조작**:
  - 주인 토큰 끌기(`ui.drag.kind` `"shape"`): 조준 중이고 그 카드가 받는 선수 · 구역이 필요할 때만이다. **이어 주기 · 자리 옮기기 · 가로지르기뿐 아니라 연결 · 크로스도** 된다 (막을 까닭이 없다) [구현 결정]. 끌기 동안 조준은 남고, 놓기에 실패하면 조준 모드로 돌아온다. 포인터 유령은 `.drag-ghost.tok-ghost.shape-drag` (경기장 위에서는 숨고 모양 표시가 대신한다).
  - 조준 중 주인 토큰을 누르기만 하면 아무 일도 없다 (끌기 출발점 — 내지도 벤치로 보내지도 않는다).
  - 키보드: ← → = `dropCandidates` (받는 선수 = `playerId`, 구역 = `zone`), 숫자 1~5 = 구역 모양만 (`zone`, 가로지르기는 지금 구역 숫자 무시). **받는 선수 모양은 숫자 키를 쓰지 않는다** [구현 결정]. 후보 라벨 "네리아 → 실루엔" · "타리아 → 슈팅 구역 (그대로)".
  - 터치: 같은 자리 다시 탭 = 내기에서 "같은 자리"를 고유 모양은 같은 받는 선수 · 같은 구역으로 본다 (두 점을 엔진 미리보기로 비교).
  - `ui.aim`에 `zone`을 더했다. `?autolesson=1` 추천의 `zone`도 조준에 넣는다.
- **연출**: 엔진 fx 순서대로 컷인 → `move` (주인 토큰이 새 자리로 450ms, 두 대형이 다시 모인다) → `pass` (공 호 `.ls-ball` 300ms) → 훈련 동작 → 팝.
  - 옮긴 뒤 대형은 **내기 직전 미리보기의 `shape.positionsAfter`**를 쓴다. 낸 뒤의 뷰는 턴이 끝나면 다음 턴 흩어지기라 옮긴 자리를 알 수 없다.
  - `fxPlan`: `play.move` · `play.pass` 배열, `play.gain[id].rows` (행마다). 가로지르기는 두 팝 "⚽슈팅 +34" · "🦶드리블 +20"이다. 한 선수 위 팝은 위로 쌓는다 (`.row1` · `.row2`): 주인 체력 회복("체력 +10")이 상승 팝과 겹쳐 글자가 깨졌다. 받는 선수 · 주인 배율 팝 "+37 ×1.3"은 분홍 `.ls-pop.shape`다.
- **지운 표시**: 주 화면 `.wl-owners`, 미팅 · 준비 `.mode-chg` (`meeting.js modeChange`), 상담 삭제 문구 → "고유 카드(연계 특성 모양 · 캐릭터 효과)", `lessonRun`의 `mainStatsOf` 재export. 미팅 슬롯의 "체력 · 수피" 주 스탯 표시는 남겼다 (포지션 정보 — 감독 AI pref도 쓴다).
- **하지 않은 것**: 조준 중 다른 선수들의 "다시 모인 대형" 미리보기는 그리지 않는다. 주인 유령만 옮긴 자리에 그리고, 대형은 낸 뒤 연출에서 다시 모인다. 피니셔(마무리)는 카드가 없어 주인 토큰 빛 · 꼬리표 "+N ×2"까지만 만들었다 (스크린샷 없음).
- **테스트**: `lessonLayout.test` (+1 — `fxPlan` move · pass · 가로지르기 rows, 고유 8장 칩 · 아이콘 · 배율 칩 · 문구 · 비용 "/명", `uniqueMainMult` 없음) · `lessonUi.test` (모양 절 — 앞면 칩, 이어 주기 조준: 후보 = 엔진 후보 · 주인 토큰 누르기는 벤치도 내기도 아님 · → + Enter · 받는 선수 클릭; 자리 옮기기 숫자 3 → 유령 · 화살표 · 바닥 · 꼬리표 → move fx · 새 자리 토큰 · 구역 바닥 클릭; 가로지르기 (미르카 편성) 지금 구역 숫자 무시 · 두 스탯; 둘레 작은 원 대상 = 엔진 · 두 번 누르기; 구역 전원 바닥; 크로스 낼 수 없음 띠) · `outgame.test` (`.wl-owners` · `.mode-chg` 없음, lesson.css에 `.aim-link` · `.tok-ghost` · `.aim-ghost` · `.cf-ticon.s-link`, `lessonRun.mainStatsOf` 없음) · `ui.smoke` 전체 걷기 (`zone`을 넘기고, 완주 중 이어 주기 · 연결 · 크로스 · 둘레 원 · 구역 전원 · 자리 옮기기를 1번 이상 낸다 — 가로지르기는 manager.test 미르카 편성 완주). jsdom 모양 픽스처는 낸 뒤 같은 턴을 보려고 `playsLeft` ≥ 2로 둔다.
- **스크린샷** (`tools/lesson_scenarios.mjs`, `node tools/shot.mjs <dir> --only og_lesson_u_,og_reward_unique` 21장 — 전부 검사 통과, PNG 직접 확인): `og_lesson_u_hand` · `_hand2` (고유 8장 앞면) · `_link` (주인 토큰 끄는 중) · `_link_aim` · `_link_bad` · `_pick` · `_cross` · `_cross_dead` · `_wall` · `_zone` · `_post` · `_move` (토큰 끄는 중) · `_move_card` (카드 끄는 중) · `_move_key` · `_move_after` · `_carry` · `_carry_bad` · `_carry_play` · `_link_play` (공 호) · `_link_pop` · `og_reward_unique`. 도우미 `shapeScene` (구역 주입 · 손패에 이미 있는 고유 카드는 그대로, 없으면 앞 칸에 주입), `walkLesson` · `defaultLessonRun`에 `slots` (미르카 편성 `{ FW2: "ch_cat_trickster" }`).
- **도구 수리** (UI와 무관하게 이미 깨져 있던 것): `og_reward_fail`은 L39 · U2 뒤로 감독 AI 레슨이 실패하지 않아 (seed 40개에서 0번) 상태를 찾지 못했다 → 마지막 턴 점수를 목표 60%로 낮추고 `endLessonTurn`. `og_lesson_turnend`는 찾은 상태에서 카드 한 장으로 퍼펙트가 나 레슨이 끝났다 → 조건에 "마지막 턴 아님 · 퍼펙트까지 150 이상". `og_prep_swap`의 준비 선택자는 `.mode-chg` → 옮긴 슬롯의 "← 원래" 줄. `og` 전체 99장 검사 통과.

**U4 · 통합 · 문서** (2026-10-04)

- **`tools/lesson_play.mjs` 모양 입력** (§16.12 U4): 고유 카드는 모양마다 입력을 돌아가며 쓴다. 목록의 첫 번째가 계획의 대표 조작이고, 나머지로 마우스 · 터치를 섞는다 [구현 결정].
  - 이어 주기: 카드 클릭 → 주인 토큰 마우스 끌기 · 카드 탭 → 주인 토큰 터치 끌기 · 카드 터치 끌기 · 키보드(→ 후보 · Enter) · 탭 두 번 · 카드 마우스 끌기
  - 연결 · 크로스: 카드 마우스 끌기 (받는 선수 위로) · 카드 터치 끌기 · 탭 두 번 · 카드 클릭 → 받는 선수 클릭 · 주인 토큰 끌기 · 키보드
  - 자리 옮기기: 카드 마우스 끌기 (구역으로) · 카드 터치 끌기 · 주인 토큰 터치 끌기 · 탭 두 번 · 숫자 키 · 주인 토큰 마우스 끌기 · 클릭
  - 가로지르기: 카드 클릭 → 숫자 키 → Enter · 카드 터치 끌기 · 주인 토큰 마우스 끌기 · 탭 두 번 · …
  - 둘레 원 · 구역 전원 (놓을 자리가 없는 모양): 카드 탭 두 번 · 마우스 끌기 · 클릭 → [내기] · 터치 끌기
  - `--touch-only`면 터치 방식만 남긴다. 구역에 놓는 점은 그 구역 바닥 안(중심에서 6u 안)에서 **토큰과 가장 먼 점**이다. 탭 · 클릭이 주인 토큰 위로 가면 조준 중 주인 누르기(아무 일 없음)가 되기 때문이다.
- **행 단위 검사**: 놓기 직전(누른 채 · 두 번째 탭 앞) 화면에서 행을 읽는다. 흰 고리 대상 `.tok.target` + 자리 옮기기 = 놓을 바닥 `.zone-pad.aim`, 가로지르기 = 지금 바닥 `.zone-pad.from` + 놓을 바닥, 그 밖 = 그 선수가 선 구역 → "선수:스탯". 낸 뒤 `lastFx`의 `gain` · `fail` 행과 비교한다. 실패자는 실제 fx가 마지막 행 1개라 기대 행도 실패자의 마지막 행만 남긴다.
  - 그 밖에 보는 것: 놓기 직전 빨간 바닥(`.zone-pad.bad`) 없음 · 받는 선수 모양은 패스 선 `.aim-link.on` · 구역 모양(제자리 옮기기 제외)은 화살표 `.aim-arrow.on` + 유령 `.aim-ghost.on` · 낸 뒤 `move` fx(자리 옮기기 · 가로지르기) · `pass` fx(이어 주기 · 연결 · 크로스). 숫자 키로 구역이 골라지지 않아 → 후보로 넘어가면 입력 실패로 센다.
- **고유 카드 모두 1번 이상** [구현 결정]: 시즌 1의 레슨은 3번뿐이라 감독 AI 추천만으로는 울리카 · 그레타가 안 나오는 판이 있었다. 그래서 아직 안 낸 고유 카드가 낼 수 있으면 감독 추천 대신 그 카드를 먼저 낸다. 자리는 `dropCandidates` 중 미리보기 상승 합이 가장 큰 곳이다 (감독 AI EV가 아님). 끝에 덱의 고유 카드가 모두 나왔는지 확인하고, 빠졌으면 실패다. `--no-cover`면 늘 추천대로 낸다. 시즌 1 판에서 이렇게 먼저 낸 것은 3~5번이다.
- **`--slot SLOT=charId`**: 편성 화면에서 그 슬롯을 눌러 선수 고르기 모달에서 고른 뒤 [런 시작]을 누른다 (실제 입력). 서포트 · 전술은 편성 화면 기본값 = 기본 편성과 같다. 끝 보고에 편성 · 고유 카드별 낸 수 · 쓴 입력을 적는다. 모양마다 처음 쓴 입력은 누른 채 PNG를 남긴다 (`lesson_<kind>_<입력>.png`).
- **실제 브라우저 판** (헤드리스 Chrome, 모두 통과 — 입력 실패 · actions 대신 · 대상(행) 불일치 · 추천과 놓은 자리 차이 · 에러 토스트 · 페이지 에러 · 스크롤 0):

  | 판 | 명령 | 결과 |
  |---|---|---|
  | 기본 편성 시즌 1 (1280×720) | `--seed play-1` | 레슨 3 · 고유 7장 모두 (네리아 2 · 도르비나 2 · 아델린 2 · 실루엔 2 · 타리아 3 · 울리카 1 · 그레타 2), 37장 |
  | 미르카 편성 시즌 1 (1280×720) | `--seed play-m1 --slot FW2=ch_cat_trickster` | 레슨 3 · 고유 7장 모두 (가로지르기 3 — 숫자 키 · 카드 터치 끌기 · 주인 토큰 마우스 끌기), 43장 |
  | 미르카 편성 터치만 (915×412 mobile) | `--seed play-t1 --slot FW2=ch_cat_trickster --mobile --touch-only --width 915 --height 412` | 레슨 3 · 고유 7장 모두, 터치 방식만, 41장 |
  | 15주 완주 (역습형) | `--until run --policy counter --seed play-2` | 레슨 9 · 경계전 3 · 결과 화면, 고유 7장 모두 (네리아 7 · 도르비나 7 · 아델린 3 · 실루엔 3 · 타리아 5 · 울리카 2 · 그레타 2), 모양 × 입력 23가지, 86장 |

- **스크린샷**: `node tools/shot.mjs <dir>` 전체 126장 (경기 01~27 + og_* 99장) 검사 통과. 모양별 시나리오는 U3의 `og_lesson_u_*` 21장 그대로다 (U4에서 더한 것 없음). 마무리(피니셔)는 주인 캐릭터가 없고 shot.mjs가 실제 데이터를 읽어 시나리오가 없다. 엔진은 `lesson.test` 피니셔 픽스처가 본다.
- **PNG 직접 확인**: 이어 주기(주인 토큰 끌기 — 선 · 받는 선수 "+54 ×1.3"), 자리 옮기기(유령 · 화살표 · 꼬리표 "+52 ×1.3 · 기본 +2"), 가로지르기(지금 바닥 하늘 점선 · 놓을 바닥 · "+34 슈팅 · +20 드리블"), 크로스 탭 두 번, 915×412 터치 화면의 이어 주기. 잘림 · 겹침은 없다.
  - 크로스 캡처 한 장에서 앞 카드의 "체력 +2" 팝이 사라지는 중에 이름표와 잠깐 겹쳐 보였다. 연출 중 프레임이라 고치지 않았다.
- **문서**: `OUTGAME_CARDS_draft.md` §3 (L40 — 특성 → 모양 9개 표 · 8장 표 · 울리카 질문) · 머리 · 구역 방식 요약 줄, `ARCHITECTURE.md` §20 (L40 문단 · 엔진 표 · 주 화면 줄 · 시나리오 · lesson_play · shot 126장 · 테스트 325 · L39 목표), `README.md` (L40 한 줄 · 테스트 325 · lesson_play `--slot`).
- **남은 질문 (그대로)**: 울리카 크로스 — 슈팅 구역이 비면 낼 수 없어 낸 수가 예전의 43%다 (U2). 대체("슈팅 구역이 비면 드리블 구역 선수에게")는 기획자 답 전에는 넣지 않았다.

## 17. 레슨 중 스탯 보기 (명단 줄 · 선수 정보 팝오버)

> 상태: 구현 · 2026-10-04 · 브랜치 `outgame-lesson`. 기획자 보고: "레슨 때 현재 스탯을 알 수가 없어. 클릭해도 나오지가 않고, 오른쪽에 표시도 너무 잘 안 돼서."
> UI만 바꾼다 — 엔진 동작 · 저장 · 밸런스는 그대로. 경기 쪽 파일(§0) · `data/config.json`은 바꾸지 않는다.

### 17.1 무엇이 보이나

- **명단 줄 (옆 칸 7줄, 두 줄)**: 위 = 이름 · 체력 · 실패율, 아래 = **서 있는 구역의 지금 스탯** "🛡️ 수비 C 552 +18" (아이콘 · 스탯 이름(구역 색) · 등급 · 값 · **이번 레슨 상승**).
  - 상승 = 지금 값 − 레슨 시작 값 (`lesson.before`) — 기본 훈련 · 카드 · 부 스탯 · 실패 −5가 모두 들어간다. 0이면 회색 "+0".
  - 벤치 = "벤치" + 돌아갈 구역의 스탯, 결장 = "결장" / "🚑 부상 · 결장" + 이번 상승 합.
  - 오른쪽 = **ⓘ** (선수 정보) · [벤치]/[복귀].
- **선수 정보 팝오버** (`.ls-pinfo`, 폭 292): 얼굴 · 이름 · 자리(슬롯) · 포지션 · 주 스탯, 구역(또는 벤치 · 결장) · 체력 · 실패율, 스탯 5개 표 (등급 · 지금 · 이번 레슨 · 성장률 ×1.25, 지금 구역 줄 = 구역 색 강조, 주 스탯 = "주"), 아래 "이번 레슨 +60 · 기본 30 / 카드 24 · 부+6" (보상 모달 선수 칩과 같은 나눔) · "턴 끝 기본 훈련 +8 예상 · 카드 대상 3회".
- 값은 순수 함수 `lesson_layout.playerStatInfo(state, id, view, thresholds)` (등급 = `dom.gradeOf` — 주 화면 명단과 같다, 주 스탯 = `MAIN_STATS` — 엔진 `cards.mainStatsOf`와 같은지 테스트가 본다).

### 17.2 여는 법 · 닫는 법 [구현 결정]

| 조작 | 카드를 고르지 않았을 때 | 카드를 골랐을 때 (조준 · 끌기) |
|---|---|---|
| 토큰 누르기 · 탭 | 팝오버 (고정) | **자리 고르기 그대로** (팝오버 아님) |
| 명단 줄 누르기 · 탭 | 팝오버 (고정) | 회복 카드 = 그 선수에게, 그 밖 카드 = 팝오버 (줄에는 자리 뜻이 없다) |
| 명단 ⓘ | 팝오버 (고정) | **팝오버 (고정) — 조준은 그대로** |
| 마우스 hover (데스크톱) | 토큰 · ⓘ 위 80ms 뒤 팝오버 (고정 아님 · 누를 수 없음, 떠나면 닫힘) | 열지 않는다 |
| 키보드 | 토큰 포커스 + Enter · Space · I, ⓘ 포커스 + Enter | 토큰 포커스 + I (Enter는 내기) |

- 닫기: 바깥 누르기 · Esc (조준 중이면 첫 Esc = 팝오버, 다음 Esc = 조준 취소) · 같은 토큰 · 줄 · ⓘ 다시 · × 버튼 · 끌기 시작 (카드 · 토큰).
- hover를 명단 줄 전체가 아니라 ⓘ에만 단 것: 줄 전체면 [벤치]를 누르러 갈 때마다 떠서 경기장을 가린다.
- 자리: 토큰에서 열면 토큰 오른쪽(모자라면 왼쪽), 높이는 경기장 칸 안. 명단에서 열면 명단 줄 왼쪽. 옆 칸 · 화면 밖으로 나가지 않는다. 연출(카드 · 턴 끝 · 흩어지기) 중에도 값 · 자리를 다시 그린다.
- 벤치 칸 높이 84 → 72 (명단 두 줄 높이 때문에, 칸 2개 그대로). 옆 칸 안쪽 여백 9 → 8, 명단 줄 간격 3 → 2.

### 17.3 테스트 · 스크린샷

- `lessonLayout.test` (+1): `playerStatInfo` 값 = 엔진 상태 (지금 · 레슨 시작 · 상승 · 등급 · 성장률 · 주 스탯 · 구역 줄 · 벤치 · 결장 · 기본 / 카드 / 부 나눔), 순수.
- `lessonUi.test` (스탯 보기 절): 명단 줄 값 = 엔진, 카드 없이 토큰 누르기 = 팝오버 · 값 = 엔진, 같은 토큰 다시 · Esc · 바깥 · × = 닫기, Enter · I 키, 명단 줄 · 다른 토큰, hover (열림 · 떠나면 닫힘), 벤치 줄, **카드를 골랐을 때 토큰 누르기 = 그 선수에게 낸다 (팝오버 없음)**, 조준 중 hover 없음 · I 키 · ⓘ = 팝오버 (조준 유지 · 내지 않음), Esc 순서.
- 스크린샷 (`tools/lesson_scenarios.mjs` `rosterState` = 부상 직후 + 벤치 1명): `og_lesson_roster` · `og_lesson_info_tok` · `og_lesson_info_hover` · `og_lesson_info_aim` (조준 중 ⓘ) · `og_lesson_info_touch` · `og_lesson_info_touch_aim` (915×412 터치). `tools/shot.mjs` 검사에 명단 줄 · 팝오버 글자 잘림, 옆 칸 넘침, 팝오버 화면 밖 · 내용 넘침을 더했다.

---

## 18. 부상은 레슨에만 · 액티브는 코치에게서 · SP는 패시브만

> 상태: 구현 계획 · 2026-10-04 · 브랜치 `outgame-lesson`. 기준: 기획자 결정 (2026-10-04) 세 가지.
> 1. **부상은 레슨에만 영향을 준다.** 다친 선수는 지금처럼 레슨을 쉬지만(L16 단위), 경기에는 늘 그대로 나온다 — 레슨 런의 경계전 · 친선전에 유스 교체가 없고 경기 스탯 벌칙도 없다.
> 2. **SP는 남기지만 SP 상점(상담)은 패시브 스킬만 판다. 액티브 스킬은 코치(서포트 카드)에게서 얻는다.** 액티브 스킬의 힌트가 생기는 순간 선수가 바로 배운다 — 레슨 보상 화면에서 코치가 "가르쳐 주고", 플레이어가 받을 선수를 고른다.
> 3. 경기 안의 "스루 패스" 액티브 스킬은 **지금 그대로** 둔다 (2구역 전진 같은 새 행동을 넣지 않는다).
>
> 표기는 §14 · §15와 같다. **[가정]** = 기획자가 아직 정하지 않은 값, **[구현 결정]** = 이 계획이 정한 세부. 둘 다 §18.10에 모았다.
> 밸런스는 조정하지 않는다. 시뮬은 전 / 후만 보고한다.
> 경기 쪽 파일(`js/engine/match.js` · `ai.js` · `skills.js` · `rng.js` · `js/ui/screens/match.js` · `js/ui/layout.js` · `css/match.css`) · `data/config.json`은 바꾸지 않는다. **옛 런(`run.js` · `training.js`)의 동작도 바꾸지 않는다** — 이번 변경은 모두 `lessonRun.js` 쪽에서 감싼다 (§18.1). 여기 적지 않은 것은 §14 ~ §17 그대로다.

### 18.0 한눈에

| 무엇 | 지금 | 바뀐 뒤 |
|---|---|---|
| 다친 선수 (레슨) | `injuredTurns` > 0이면 열린 레슨 시작에 결장 (`outAtStart`), 레슨이 끝나면 −1 | **그대로** |
| 다친 선수 (경계전 · 친선전) | 유스(`youthSnapshot`, 스탯 일괄 · 스킬 없음)로 바뀐다 | **본인이 그대로 출전** (스탯 · 스킬 · 공명 그대로, 벌칙 없음) |
| 친선전 체력 | 다친 선수는 체력 −30을 내지 않는다 (안 나왔으므로) | 나왔으므로 **7명 모두** 체력 −`friendly.staminaCost` |
| 클리어 · 퍼펙트 · 컷인 힌트가 **패시브** | 힌트 레벨 +1 (최대 3) → 상담에서 SP로 할인 구매 | **그대로** |
| 클리어 · 퍼펙트 · 컷인 힌트가 **액티브** | 힌트 레벨 +1 → 상담에서 SP로 구매 | **코치 수업** — 보상 화면에서 "하르나 코치가 '파워 슛'을 가르쳐 줍니다" → 받을 선수를 고르면 바로 습득 (SP 없음). 슬롯이 가득이면 바꿀 스킬을 고르거나, 배우지 않고 SP +20 |
| 상담 스킬 칸 | 힌트 받은 스킬 전부 (액티브 · 패시브) | **패시브만** (힌트가 있어야 진열 — 지금 규칙 그대로, §18.5) |
| 같은 액티브를 또 받음 | 힌트 레벨 +1 | 엔진에 스킬 레벨이 없다 (`skills.js`는 바꾸지 않는다) → 아직 그 스킬이 없는 다른 선수에게 가르치거나, 받을 선수가 없으면 **SP +20** (§18.3) |
| 경기 "스루 패스" | — | 그대로 |
| 저장 | `lessonRun.version` 2 | **3** (2 → 3 이행, 레슨 · 보상 중이어도 이행된다, §18.7) |

### 18.1 부상 — 레슨에만 (엔진 `lessonRun.js`)

**바뀌지 않는 것** (레슨 쪽 — 지금 그대로)
- 레슨 중 실패 → 50% 부상 → `out` · `injuredTurns = max(cur, 1)` · 고유 카드 `removed` (§5.3.1 10번, §14.7).
- 레슨 시작에 `injuredTurns > 0`인 선수는 `outAtStart` (경기장 · 벤치 · 대상 · 기본 훈련에서 빠짐), 그 레슨이 끝나면 −1 (§5.4.3 3번). 다친 주인의 고유 카드는 그 레슨 덱에서 빠진다.
- 주 화면 · 명단 · 미팅의 "결장 n" 배지, `getWeekView().lessons[].expected` · `boosted`(결장 제외), 감독 AI의 `weekActive`(주 고르기 평균 체력 — 결장 제외) [구현 결정: 레슨 기준 지표라 그대로].
- 휴식 · 외출 · 미팅 · 상담은 부상과 상관없다 (지금도 그렇다).

**바뀌는 것** (경기 쪽 — lessonRun이 감싼다, `run.js`는 그대로)

| lessonRun 공개 함수 | 지금 | 바뀐 뒤 |
|---|---|---|
| `buildTeamSnapshot(state, data)` | run.js 것을 그대로 다시 내보냄 → 다친 선수 = 유스 | lessonRun이 **자기 함수**로 내보낸다: `run.buildTeamSnapshot(fieldView(state), data)` |
| `getMatchSetup(state, data)` | run.js 그대로 | `run.getMatchSetup(fieldView(state), data)` (모양 · 시드 · 규칙 그대로, `home.players`에 유스 없음) |
| `finishMatch(state, data, result)` | `run.settleMatch` → 친선전이면 다친 선수 빼고 체력 −30 | `settleMatch` 전에 다친 선수 id를 적어 두고, 친선전이었으면 settle 뒤 그 선수들에게도 `−friendly.staminaCost` (0에서 멈춤) → 결과는 "7명 모두 −30"과 같다 |
| `getPrepView` | `injuredOut: [id]` | 그대로 (화면 문구만 바뀐다, §18.6) |

- `fieldView(state)` = `{ ...state, players: state.players.map((p) => ({ ...p, injuredTurns: 0 })) }` — **얕은 사본, 상태를 바꾸지 않고 rng도 쓰지 않는다**. 스냅샷은 사본으로 만들고 저장 상태의 `injuredTurns`는 그대로 남는다 (다음 레슨 결장은 그대로).
- 경기는 `injuredTurns`를 줄이지 않는다 (지금도 그렇다 — 경기 뒤 첫 레슨이 끝나야 −1, §14 D22).
- 옛 런(`run.js` `getMatchSetup` · `buildTeamSnapshot` · `settleMatch`)은 지금처럼 유스로 바꾸고 체력을 빼지 않는다 — `run.test` · `match.test` · `layout.test`는 그대로 통과해야 한다.
- 경기 화면 · 결과 화면은 스냅샷만 읽으므로 바꿀 것이 없다 (`isYouth`가 없을 뿐).
- 이벤트 효과 `injure`(effects.js)는 1차에 쓰지 않는다 (`lesson.events.support` false). 켜면 그 부상도 같은 뜻(레슨 결장만)이다.

### 18.2 액티브 · 패시브 판정 · 데이터

- 액티브 = `skills.json`의 `kind === "active"` · `learnable: true`. 패시브 = `kind === "passive"` · `learnable: true`. `unique`(필살기)와 `learnable: false`는 지금처럼 힌트 · 수업 · 상점 어디에도 없다.
- 지금 코치 힌트 목록(`supports.json hintSkillIds`)에서 나오는 액티브 · 패시브:

| 코치 | 액티브 (수업) | 패시브 (상점 힌트) |
|---|---|---|
| 하르나 | 파워 슛 (FW) | 막판 집중 · 승부사 |
| 셀리아 | 폭발 드리블 (FW · MF) · 꿰뚫어보기 (FW · MF) | 마지막 힘 |
| 오르넬라 | 스루 패스 (MF) · 매의 눈 (DF · MF) | 연계의 달인 |
| 바르바라 | 바위 방벽 (DF) · 캐논 킥 (GK) | 잠금 수비 (DF) |
| 한나 | — | 큰 경기 체질 · 마지막 힘 |
| 루미 | 함성 (전원) | — |
| 조이 | 파워 슛 (FW) | 언더독 정신 |
| 이레네 | 스루 패스 (MF) · 꿰뚫어보기 (FW · MF) | 침착한 수문장 (GK) |

- **소매치기(MF 액티브)는 어느 코치 목록에도 없어 레슨 런에서 얻을 수 없다** (지금도 코치 힌트로는 나오지 않는다) — 데이터는 바꾸지 않고 기획자 질문으로 둔다 (§18.10 Q2).
- **데이터 키 하나** (`data/lesson.json` `rewards`, version 2 그대로):

```jsonc
"rewards": { …, "noHintSp": 10,
  "teach": { "declineSp": 20 } }      // 수업을 받지 않거나 받을 선수가 없을 때 SP [가정]
```

  - 키가 없으면 20으로 읽는다. `config.json`은 바꾸지 않는다.

### 18.3 힌트 뽑기 · 수업 목록 (`afterLesson`)

**뽑기 후보** (`drawHint` · `drawHintFrom` 둘 다 — 코치 고르기 · 스킬 고르기 방식과 rng 호출 수는 지금 그대로)

| 스킬 | 후보 조건 |
|---|---|
| 패시브 | `state.hints[id] < 3` (지금 그대로) |
| 액티브 | **누군가 새로 배울 수 있다** — 7명 중 `positions`에 맞고(지금 포지션) 그 스킬이 없는(습득 · 고유 모두) 선수가 1명 이상 (슬롯이 가득이어도 바꾸기로 배울 수 있으므로 후보다) |

- 후보가 하나도 없는 힌트는 지금처럼 `noHintSp` (SP +10).
- 뽑은 결과
  - 패시브: `state.hints[id] += 1` (지금 그대로) → `result.hints[]` (`kind: "passive"`, `level`).
  - 액티브: `state.hints`를 건드리지 않는다. `pendingReward.teach[]`에 `{ skillId, supportId, src }`를 넣는다 (`src` = `"clear"` | `"cutin"` | `"event"`).
- 순서 (지금 순서 그대로): 클리어 · 퍼펙트 힌트(+ hintRate 추가 1개) → 컷인 힌트(`L.attach.hints`, 결과와 상관없이). 그 앞에 **이벤트 수업 대기열** `state.pendingTeach`(아래)를 먼저 붙이고 비운다.
- 레슨이 실패해도 컷인 힌트는 받으므로, 실패한 레슨에도 수업이 있을 수 있다.
- 같은 보상 안에서 같은 액티브가 두 번 뽑힐 수 있다 (예: 퍼펙트 힌트 2개가 모두 파워 슛). 뽑을 때는 막지 않고, 두 번째 수업 차례에 받을 선수가 없으면 SP로 바뀐다 (아래 "받을 선수 없음").

**코치 유대 이벤트 (1차는 꺼져 있음 — `lesson.events.support` false)**
- 켜면 이벤트 효과 `hint`가 액티브를 가리킬 수 있다 (`effects.js` — 바꾸지 않는다). lessonRun의 `supportEventCheck` · `resolveEvent`는 처리 **전후의 `state.hints`를 비교**해 늘어난 액티브 힌트를 되돌리고 `state.pendingTeach.push({ skillId, supportId: 이벤트 코치 | null, src: "event" })` 한다 (레벨 n이 늘었으면 1개만 — 수업은 1번) [구현 결정]. 다음 레슨 보상 화면에서 가르친다.
- 그래서 레슨 런의 `state.hints`에는 **액티브가 남지 않는다** (불변식, 테스트가 매 단계 확인).

**`pendingReward` 추가**

```jsonc
"pendingReward": { "offer": [ … ], "freeUpgrades": 1, "result": { …, "hints": [ /* 패시브만 */ ], "teach": [ /* 아래 항목 사본 */ ] },
  "teach": [
    { "skillId": "sk_power_shot", "supportId": "sp_coach_harr", "src": "clear",
      "result": null,                       // null = 아직 | "learned" | "declined" | "none"
      "playerId": null, "replaced": null,   // learned 일 때
      "sp": 0 }                             // declined · none 일 때 받은 SP
  ] }
```

### 18.4 수업 처리 (엔진 API · 규칙)

**받을 수 있는 선수 — `canTeachSkill(state, data, skillId, playerId)`** (lessonRun 새 export, 순수)

| 검사 | 실패 이유 (UI 문구) |
|---|---|
| 스킬이 `kind: "active"` · `learnable` | "수업할 수 없는 스킬" |
| 선수가 있다 | "선수 없음" |
| 그 스킬이 없다 (`learnedSkillIds` · `innateSkillId`) | "이미 보유" |
| `positions`가 있으면 지금 `position`이 그 안 | "FW만" 처럼 `positions`를 ` · `로 이은 것 + "만" |

- 돌려주는 값 `{ ok, reason, full }` — `full` = `learnedSkillIds.length ≥ MAX_LEARNED_SKILLS`(3). `ok && full`이면 바꿀 스킬을 골라야 배운다.
- **힌트 검사가 없다** (`training.canLearnSkill`과 다른 점 — 그 함수는 그대로 둔다).
- 다친 선수도 받을 수 있다 (경기에 나오므로).

**`resolveTeach(state, data, { playerId = null, replaceSkillId = null })`** (lessonRun 새 export, phase reward)
- 대상 = `pendingReward.teach` 중 `result === null`인 **첫 항목** (순서대로만 처리한다). 없으면 오류.
- `playerId == null` → 배우지 않는다: `result` = (받을 수 있는 선수가 0명이면 `"none"`, 아니면 `"declined"`), SP += `teach.declineSp`, `sp` 기록.
- `playerId`가 있으면
  - `canTeachSkill`이 `ok`가 아니면 오류 (상태 그대로).
  - `full`이면 `replaceSkillId`가 그 선수의 `learnedSkillIds` 안에 있어야 한다 (고유 스킬 · 없는 스킬이면 오류). 그 스킬을 빼고 새 스킬을 **그 자리에** 넣는다 (슬롯 순서 유지). 뺀 스킬은 사라진다 — 환불 · 힌트 복구 없음 [가정].
  - `full`이 아니면 `replaceSkillId`는 무시하지 않고 오류다 (실수 방지).
  - `learnedSkillIds`에 넣고 `result = "learned"`, `playerId`, `replaced` 기록.
- 로그 한 줄: "수업: 하르나 코치 → 실루엔 '파워 슛' 습득" / "… ('승부사' 대신)" / "수업: '파워 슛' 받지 않음 — SP +20" / "수업: '파워 슛' — 받을 선수 없음, SP +20".
- **rng를 쓰지 않는다.** 검증이 먼저고, 실패하면 상태를 바꾸지 않는다. 호출마다 UI가 저장한다.

**`resolveReward`** — `teach`에 `result === null`이 남아 있으면 오류 "코치 수업을 먼저 끝내세요" (상태 그대로). 나머지는 그대로.

**받을 선수 없음** — 그 수업 차례에 `canTeachSkill`이 `ok`인 선수가 0명이면 (포지션이 없음 · 모두 이미 보유 — 같은 보상의 앞 수업이 마지막 후보에게 가르친 경우 포함) 뷰가 `noneEligible: true`를 주고, 받을 수 있는 행동은 `resolveTeach({ playerId: null })` 하나다 → `"none"` · SP +20. 엔진이 저절로 넘기지 않는다 (플레이어가 무슨 일인지 보게 한다) [구현 결정].

**뷰 — `getRewardView` 추가** (순수, rng 없음)

```jsonc
teach: {
  total: 2, index: 0,                          // index = 지금 차례 (모두 끝났으면 total)
  declineSp: 20,
  list: [ { skillId, name, supportId, coachName: "코치 하르나", coachShort: "하르나", coachColor, src,
            result, playerId, replaced, replacedName, sp } ],
  cur: { skillId, name, kind: "active", description, positions: ["FW"], supportId, coachName, coachShort, coachColor, src,
         noneEligible: false,
         players: [ { id, name, slot, position, portraitColor, injured: bool,
                      ok, reason, full,
                      learned: [ { skillId, name, kind } ] } ] }   // 7명, state.players 순서
       | null }
```

- `coachShort` = 이름 마지막 낱말 (§15.5와 같다). `src: "event"`이고 `supportId`가 null이면 `coachName` · `coachShort` = "코치진".
- `result.teach` = 끝난 항목 요약 (보상 칩 · 로그용) — `resolveTeach`가 갱신한다.

### 18.5 상담 — SP는 패시브만

- `getConsultView().skills` = `state.hints`에 레벨이 있고 **`kind === "passive"`**인 스킬만 (가격 · 할인 · `eligiblePlayers`는 지금 그대로 — `canLearnSkill` · `skillDiscountedCost`).
- `consultAction({ op: "skill" })` — 액티브면 오류 "액티브 스킬은 코치 수업으로 배웁니다" (상태 그대로).
- **어떤 패시브를 진열할지 (캐릭터 기준 / 서포트 기준)는 기획자가 아직 정하지 않았다.** 기본값 = 지금 규칙 그대로 "편성 코치 힌트를 받은 패시브만" [가정, §18.10 Q1]. 바꾸기 쉽게 진열 목록은 `consultSkillRows(state, data)` 한 함수에서 만든다.
- 상담 화면 "힌트 대기" 칩도 편성 코치의 **패시브**만 보여 준다.
- 미팅 · 경기 전 준비의 스킬 구매는 지금도 없다 (`action.buy` 거절, 그대로).

### 18.6 UI (1280×720 · 915×412 터치, 스크롤 · 잘림 없음)

**보상 모달 — "코치 수업" 단계** (`js/ui/screens/reward.js`)
- `v.teach.cur`가 있으면 모달은 결과 머리 · 칩 · 선수 7줄 아래에 **카드 고르기 · 무료 강화 대신 수업 칸**을 그린다. 수업이 모두 끝나면(`cur == null`) 지금 모달(카드 고르기 · 무료 강화 · 실패면 "보상 없음")로 넘어간다.

```
├ 코치 수업 1/2 ──────────────────────────────────────────────────────────────────────────┤
│ (하르나 얼굴) 하르나 코치가 '파워 슛'을 가르쳐 줍니다          [액티브] FW · 설명 한 줄     │
│ 받을 선수  [얼굴 실루엔 FW ●●○ 추천] [얼굴 네리아 GK — FW만(회색)] … 7명 (한 줄)           │
│ (가득인 선수를 고르면) 바꿀 스킬 [승부사] [막판 집중] [언더독 정신] — 고른 스킬은 사라집니다 │
│ [배우지 않기 · SP +20]                                         [가르치기] (선수 고르면 켜짐) │
```

  - 문구: `"<coachShort> 코치가 '<스킬 이름>'<을|를> 가르쳐 줍니다"` — 조사는 스킬 이름 마지막 글자 받침으로 고른다 (`labels.objParticle(word)`: 받침 있으면 "을", 없으면 "를", 한글이 아니면 "을(를)"). 예: '파워 슛'을 · '스루 패스'를 · '함성'을.
  - 선수 칩 (`.rw-teach-pl`, 버튼): 얼굴 · 이름 · 슬롯 · 스킬 칸 점 `●●○`(습득 수 / 3), 다친 선수는 🚑 작은 표시(받을 수 있다). `ok: false`는 회색 + 이유("FW만" · "이미 보유"), 누를 수 없다. `full`은 "가득 — 바꾸기" 꼬리표.
  - 바꿀 스킬 줄 (`.rw-teach-rep`)은 가득인 선수를 골랐을 때만. 그 선수의 습득 스킬 3개(이름 · 액티브/패시브 표시)를 버튼으로 — 하나를 골라야 [가르치기]가 켜진다.
  - `noneEligible`이면 선수 칩은 모두 회색, 안내 "받을 수 있는 선수가 없습니다 (FW 없음 / 모두 이미 보유)", 버튼은 [SP +20 받기] 하나.
  - 여러 개면 머리 "코치 수업 1/2"이고, 끝난 수업은 칩 줄에 "수업 파워 슛 → 실루엔" · "수업 함성 → SP +20"으로 쌓인다.
  - [가르치기] = `actions.resolveTeach({ playerId, replaceSkillId })`, [배우지 않기] = `actions.resolveTeach({ playerId: null })` — 엔진 호출 1번 · 저장 · 모달 다시 그리기 (연타 방지). 고르는 동안(선수 · 바꿀 스킬)은 모달 안에서만 바뀐다.
  - 추천 배지: `manager.recommendTeach` 결과 선수 칩 (또는 [배우지 않기]). 미리 고르지는 않는다.
  - 키보드: 선수 칩 · 바꿀 스킬 · 버튼 모두 Tab · Enter.
  - 높이: 수업 칸은 카드 고르기 칸(카드 앞면 높이)보다 낮게 — 결과 머리 + 칩 + 선수 7줄 + 수업 칸이 모달 안에 들어가야 한다 (`tools/shot.mjs` 모달 넘침 · 글자 잘림 검사에 `.rw-teach` · `.rw-teach-pl` · `.rw-teach-rep`을 더한다).
- 보상 칩: 패시브 힌트는 지금처럼 "힌트 막판 집중 Lv2", 액티브는 힌트 칩에 넣지 않고 수업 칩(`.rw-chip.teach`)으로.

**그 밖 문구**
- 상담 스킬 칸 머리 "패시브 스킬 (SP)", 비었을 때 "힌트를 얻은 패시브 스킬이 없습니다. 레슨을 클리어하면 편성 코치의 힌트를 얻습니다.", 아래 한 줄 "액티브 스킬은 레슨 보상에서 코치가 가르쳐 줍니다." 카드의 `힌트 Lv` · 할인 표시는 그대로.
- 주 화면 상담 설명 "스킬 배우기 (SP)" → "패시브 스킬 배우기 (SP)". 주 화면 · 미팅 각주 "스킬은 상담에서 SP로 배웁니다." → "패시브는 상담에서 SP로, 액티브는 코치 수업으로 배웁니다."
- 경기 전 준비: "결장 n명 → 유스 출전"(경고) → "부상 n명 — 레슨만 쉬고 경기는 그대로 출전" (보통 글자색). 명단 · 미팅 결장 배지의 title "결장 (레슨 n회)" → "레슨 결장 n회 · 경기는 출전".
- 경기 화면은 바꾸지 않는다 (유스가 없을 뿐).

**app · store**
- `actions.resolveTeach(args)` (app.js — `resolveReward`와 같은 모양: 엔진 호출 → 저장 → 다시 그리기, 오류는 토스트).
- `store.LESSON_RUN_SAVE_VERSIONS` = `[1, 2, 3]` (엔진 `SAVE_VERSIONS`와 같게 — outgame.test가 비교).

### 18.7 저장 · 결정성 · 이행

- `lessonRun.RUN_VERSION` 2 → **3**, `SAVE_VERSIONS = [1, 2, 3]`. `isLessonRun`은 3만 참.
- `canMigrateLessonRun(s)`: 3 → 참, **2 → 늘 참** (레슨 · 보상 중이어도), 1 → 지금 규칙 (레슨 · 보상 중이 아니어야).
- `migrateLessonRun` (in-place, 멱등): 1 → 2 (지금 그대로) → 2 → 3:
  1. `state.hints`의 **액티브** 키를 지우고, 키마다 `레벨 × rewards.noHintSp` SP를 준다 (못 쓰게 된 힌트 = "힌트 없음" SP와 같은 값) [구현 결정]. 로그 "저장본 이행: 액티브 힌트 n개 → SP +x" (n > 0일 때만).
  2. 이미 배운 액티브(`learnedSkillIds`)는 그대로 둔다.
  3. `state.pendingTeach`가 없으면 `[]`.
  4. `pendingReward`가 있으면 `teach`가 없을 때 `[]`, `result.hints`에서 액티브 항목을 뺀다 (1번에서 SP로 바뀌었다), `result.teach`가 없으면 `[]`.
  5. `version = 3`. 진행 중인 레슨(`lesson`)은 바꿀 것이 없다 (`L.attach.hints`는 코치 id라 레슨 끝에 새 규칙으로 처리된다).
- rng: 힌트 뽑기는 rng 호출 수 · 순서가 지금과 같다 (후보 목록만 다르다). `resolveTeach` · `canTeachSkill` · 뷰 · `fieldView` 스냅샷 · 감독 AI는 rng를 쓰지 않는다. 친선전 체력 보정은 rng 없음.
- 등록 팀(`registeredTeam`)은 모양 그대로 — 선수 `skillIds`에 수업으로 배운 액티브가 들어갈 뿐.

### 18.8 감독 AI (`manager.js`, rng 없음)

- **`recommendTeach(state, data)`** → `{ playerId, replaceSkillId: null }` | `{ playerId: null }`
  1. 후보 = `teach.cur.players` 중 `ok && !full`.
  2. 점수 = 지금 포지션 주 스탯 2개(`cards.mainStatsOf(position)`)의 현재 값 합 — 그 스킬을 쓸 자리에서 가장 강한 선수 [구현 결정]. 같으면 슬롯 순서.
  3. 후보가 없으면 (모두 가득 · 받을 선수 없음) `{ playerId: null }` — 감독 AI는 스킬을 바꾸지 않는다 [구현 결정].
- **`autoStep` reward**: `teach.cur`가 있으면 `resolveTeach(recommendTeach)`를 한 단계로, 없으면 지금처럼 `resolveReward(recommendReward)`.
- **`recommendConsult`**: 규칙 그대로 (뷰가 패시브만 주므로 패시브만 산다). 자유 주의 "살 수 있는 힌트 스킬이 있음 → 상담"도 그대로.
- `?autolesson=1`은 레슨 화면만 돌리므로 그대로. 시나리오 · `lesson_play.mjs`는 수업 단계도 감독 추천으로 화면 버튼을 누른다 (S3).

### 18.9 테스트 · 시뮬

| 파일 | 더하는 것 · 바꾸는 것 |
|---|---|
| `lessonRun.test` | **부상**: 다친 선수가 있는 경계전 · 원정 친선전 · 자유 주 친선전 `getMatchSetup().home.players`에 유스 없음 · 그 선수 스냅샷 = 안 다쳤을 때와 같음 (스탯 · 스킬 · 공명) · `injuredTurns` 그대로 · 친선전 뒤 7명 모두 체력 −30 · 다음 레슨 `outAtStart`에 그대로. **힌트 · 수업**: 액티브 힌트 → `teach` 항목 · `state.hints`에 액티브 없음 / 패시브 → 레벨 +1 / 누구도 새로 배울 수 없는 액티브는 후보에서 빠짐 (모두 다른 스킬이면 `noHintSp`) / `resolveTeach` 빈 슬롯 습득 · 가득이면 `replaceSkillId` 필수 · 바꾸기 (그 자리) · 받지 않기 SP +20 · 이미 보유 · 포지션 불일치 · 고유 스킬 바꾸기 · 빈 슬롯인데 `replaceSkillId` → 오류 (상태 그대로, JSON 비교) / 순서대로만 / `resolveReward`는 수업이 남으면 거절 / 같은 액티브 두 번 (두 번째 받을 선수 없음 → `"none"` SP +20) / 실패한 레슨의 컷인 액티브 수업 / 다친 선수도 받음 / 이벤트 수업 대기열 (`pendingTeach` → 다음 보상 맨 앞, 이벤트 효과로 늘어난 액티브 힌트가 되돌려짐). **상담**: 액티브 힌트가 있어도 `skills`에 없음 · `op: "skill"` 액티브 거절 · 패시브 구매 그대로 (예전 `sk_power_shot` 상담 테스트를 패시브로). **이행**: v2 (주 · 상담 · 보상 · 레슨 중) → v3 — 액티브 힌트 → SP, 패시브 힌트 그대로, `pendingReward.teach` · `result.hints` 정리, 멱등 / v1 주 → v3 / v1 레슨 중 거절 그대로. **불변식**: 15주 완주 매 단계 `state.hints`에 액티브 키 없음 · 모든 선수 습득 ≤ 3 · 중복 없음 · 포지션 맞음 (수업 시점). 뷰 · `canTeachSkill` 순수 (rngState · JSON 그대로) |
| `lessonRules.test` | D22를 "대비 레슨에서 다치면 바로 뒤 경계전 · 원정 친선전에 **본인이** 나온다 (유스 없음), 다음 시즌 첫 레슨이 끝나면 −1"로 |
| `manager.test` | `recommendTeach` = 빈 슬롯 후보 중 주 스탯 합 최고 · 같으면 슬롯 순서 · 후보 없으면 받지 않기 · 늘 `resolveTeach`가 받는 행동 · rng 없음. 15주 완주 (수업 포함) |
| `run.test` · `match.test` · `layout.test` | 그대로 통과 (옛 런 유스 · 친선전 체력) |
| `outgame.test` | 저장 버전 사본 `[1, 2, 3]` = 엔진, v2 저장본 이어 하기 → v3 |
| `lessonUi.test` (S2) | 보상 모달 수업 단계: 문구 "하르나 코치가 '파워 슛'을 가르쳐 줍니다" · 조사 (을/를) · 선수 칩 회색 이유 · 선수 고르기 → [가르치기] → 엔진 `learnedSkillIds` · 저장 · 다음 수업 "2/2" → 카드 고르기 / 가득 → 바꿀 스킬 줄 · 고르기 전 [가르치기] 꺼짐 / 받지 않기 SP / 받을 선수 없음 화면 / 추천 배지 = `recommendTeach` / 실패 레슨 수업 → "보상 없음". 상담: 패시브만 · 안내 줄. 경기 전 준비 문구 |
| `ui.smoke` | 15주 완주가 수업 단계를 지난다 |

- 슬라이스 사이 규칙 (§14.19와 같다): 다음 슬라이스가 고칠 테스트는 `test.skip` + 주석 `teach-pending:<슬라이스>`. S3의 완료 조건은 `grep -rn "teach-pending" test` 0건.
- **시뮬** (`tools/lesson_sim.mjs`, 감독 AI): 런당 수업 수 · 습득 · 받지 않음 · 받을 선수 없음, 수업 SP, 상담 패시브 구매 수, 런 끝 선수당 액티브 · 패시브 수, 다친 선수의 경기 출전 수 (예전 유스 출전 수). 전 / 후 (방침 5 × 200런 · 경기 포함)만 보고하고 수치는 바꾸지 않는다.
- **스크린샷** (`tools/lesson_scenarios.mjs` → `node tools/shot.mjs`, PNG를 직접 본다): `og_reward_teach`(빈 슬롯 · 추천) · `og_reward_teach_pick`(선수 고름) · `og_reward_teach_full`(가득 → 바꿀 스킬 줄) · `og_reward_teach_none`(받을 선수 없음) · `og_reward_teach_multi`(퍼펙트 · 수업 1/2 · 무료 강화 칸은 다음 단계) · `og_reward_teach_fail`(실패 레슨 · 컷인 수업) · `og_reward_teach_touch`(915×412) · `og_consult_passive` · `og_prep_injured`.

### 18.10 [가정] · [구현 결정] · 기획자가 정할 것

**[가정]**
- 수업을 받지 않거나 받을 선수가 없으면 SP +20 (`rewards.teach.declineSp`). 액티브 원가 100~150 SP의 약 15%.
- 바꾸기로 뺀 스킬은 사라진다 (환불 없음).
- 같은 액티브 두 번 = 레벨업 대신 다른 선수에게 가르치거나 SP (엔진 `skills.js`에 스킬 레벨이 없고, 이번에 경기 쪽 파일을 바꾸지 않는다).

**[구현 결정]**
- 경기 쪽은 lessonRun의 `fieldView` 사본 스냅샷 + 친선전 체력 보정으로 감싼다 (`run.js` · `training.js` diff 0).
- 액티브 힌트 후보 = 누군가 새로 배울 수 있는 것 (패시브의 "레벨 3 미만"에 해당). 슬롯이 가득이어도 후보.
- 수업은 순서대로 한 번에 하나, 엔진이 저절로 넘기지 않는다 (받을 선수가 없어도 화면을 한 번 보여 준다).
- 이벤트 액티브 힌트 → `pendingTeach` → 다음 레슨 보상 맨 앞.
- 감독 AI: 빈 슬롯 · 주 스탯 합 최고, 바꾸지 않는다.
- 이행: 액티브 힌트 레벨 × `noHintSp` SP. v2는 레슨 · 보상 중이어도 이행.
- 다친 선수도 수업을 받는다. 주 화면 감독 AI의 평균 체력은 결장 제외 그대로.

**기획자가 정할 것**
- **Q1. 상점 패시브 목록** — 지금 기본값은 "편성 코치 힌트를 받은 패시브만"(지금 규칙). 캐릭터 기준(선수마다 배울 수 있는 패시브 목록) · 서포트 기준(편성 코치 목록 전체를 힌트 없이 진열, 힌트는 할인만) 중 무엇으로 할지.
- **Q2. 소매치기(MF 액티브)** — 어느 코치 힌트 목록에도 없어 레슨 런에서 얻을 수 없다. 어느 코치에게 줄지, 그대로 둘지.
- **Q3. 수업 빈도** — 액티브는 이제 레벨 3에서 빠지지 않아 런 동안 수업이 예전 액티브 힌트보다 자주 나올 수 있다 (시뮬 보고로 확인).

### 18.11 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건: `npm test` 통과, 경기 쪽 파일 · `data/config.json` · `run.js` · `training.js` diff 0, 커밋 메시지 끝 `Co-Authored-By`.

**S1 · 엔진** (`lessonRun.js` · `manager.js` · `data/lesson.json` · `js/ui/store.js` 버전 사본 한 줄 · 테스트 · `tools/lesson_sim.mjs`)
- §18.1 부상 (자기 `buildTeamSnapshot` · `getMatchSetup` · 친선전 체력), §18.3 힌트 후보 · `teach` · `pendingTeach` · 이벤트 되돌림, §18.4 `canTeachSkill` · `resolveTeach` · `resolveReward` 거절 · 뷰, §18.5 상담 패시브만, §18.7 v3 이행, §18.8 `recommendTeach` · `autoStep`.
- 테스트 §18.9 엔진 행 (`lessonRun` · `lessonRules` D22 · `manager` · `outgame` 버전). 보상 모달을 지나는 UI 테스트가 수업에서 멈추면 `teach-pending:S2`로 끈다.
- 시뮬 전 / 후 보고 (S1 커밋 전 기준 수치를 먼저 잰다).

**S2 · UI** (`reward.js` · `consult.js` · `prep.js` · `week.js` · `hud.js` · `meeting.js` · `labels.js` · `app.js` · css · 시나리오)
- §18.6 전부. `lessonUi.test` 수업 절 · 상담 · 준비 문구, `ui.smoke` 완주, `teach-pending:S2` 다시 켜기.
- §18.9 스크린샷 9장 + 기존 `og_reward_*` · `og_consult*` · `og_prep*` 다시 찍어 PNG를 직접 본다 (잘림 · 겹침 · 넘침 0).

**S3 · 통합 · 문서**
- `tools/lesson_play.mjs` — 보상 모달 수업 단계를 실제 클릭 · 키보드 · 터치로 (`recommendTeach` 따라), 행동마다 엔진 변화 확인. 1280×720 15주 완주 1번 + 915×412 터치 시즌 1.
- `grep -rn "teach-pending" test` 0건, 시뮬 전 / 후 최종 보고.
- 문서: ARCHITECTURE §20 (부상 · 수업 · 상담 · 저장 v3 · 테스트 수), README (수업 한 줄 · 테스트 수), §18.12 기록.

### 18.12 구현 중 바뀐 것

**S1 · 엔진 (2026-10-04)**
- `migrateLessonRun(s, data)` — **두 번째 인자 `data`** 를 받는다 (액티브 판정 · `noHintSp` 가 데이터에 있다). `data` 없이 부르면 v2 는 2 그대로 (`isLessonRun` 거짓). 그래서 `js/ui/app.js` `continueRun` 한 줄을 `run.migrateLessonRun(s, store.data)` 로 바꿨다 (S1 파일 목록 밖 — 이것이 없으면 v1 · v2 저장본 이어 하기가 "저장 없음" 이 된다).
- `js/ui/store.js` — `LESSON_RUN_SAVE_VERSIONS` 뿐 아니라 `LESSON_RUN_VERSION` 도 3 으로 (outgame.test 가 둘 다 엔진과 비교한다).
- 수업 뷰 `teach.cur.players[]` 에 `charId` 를 더했다 (S2 얼굴 그림용). 받는 선수 없이 `replaceSkillId` 만 넘기면 오류 (`{ playerId: null, replaceSkillId }`).
- 상담 `op: "skill"` — 액티브는 "액티브 스킬은 코치 수업으로 배웁니다", 그 밖 패시브가 아닌 것은 "상담에서는 패시브 스킬만 배울 수 있습니다" 로 거절. 감독 AI `hasBuyableSkill` (자유 주 "상담" 추천) 도 패시브만 센다 (레슨 런 힌트에는 액티브가 없으므로 결과는 같다 — 옛 상태 방어).
- 레슨 끝 로그에 `, 코치 수업 n` 을 붙인다.
- `autoStep` 의 수업 단계 action = `{ kind: "teach", playerId, replaceSkillId }` (받지 않기는 `{ kind: "teach", playerId: null }`).
- 테스트: 보상 모달을 지나는 UI 테스트 3곳 (`lessonUi` 클리어 · 퍼펙트 · 실패 보상 상태, `ui.smoke` 15주 완주) 은 `test.skip` 대신 **수업을 엔진으로 처리하고 넘기는 코드 + 주석 `teach-pending:S2`** 로 남겼다 (나머지 검사는 계속 돈다). S2 가 보상 모달 수업 단계를 만들면 이 줄을 화면 조작으로 바꾸고 주석을 지운다. `lessonUi` 상담 고정 상태는 편성 코치의 첫 **패시브** 힌트로 바꿨다.
- 시뮬 `tools/lesson_sim.mjs` 에 줄 4개: 런당 수업 · 습득 / 바꾸기 / 받지 않음 / 받을 선수 없음, 수업 SP, 런 끝 선수당 액티브 · 패시브, 다친 선수의 경기 출전 (예전 유스). "스킬 구매" 는 "(상담 — §18 뒤 패시브만)".

**S1 시뮬 전 / 후** (`node tools/lesson_sim.mjs --runs 200 --seed 1`, 방침 5 × 200런 · 경기 포함, 전 = S1 직전 커밋에 새 시뮬 도구, ace / team / counter / press / poss) — 수치는 바꾸지 않았다 (보고만)

| 지표 | 전 | 후 |
|---|---|---|
| 런당 코치 수업 (습득 / 바꾸기 / 받지 않음 / 받을 선수 없음) | 0 | 10.9~11.3 (10.7~11.1 / 0 / 0.1 / 0.1~0.2) |
| 수업 SP / 런 | 0 | 4~5 |
| 런 끝 선수당 액티브 · 패시브 | 0.07~0.08 · 0.05~0.06 | 1.53~1.58 · 0.13~0.14 |
| 습득 스킬 / 런 (7명 합) | 0.9~1.0 | 11.7~12.1 |
| 힌트 수 (§18 뒤 = 패시브만) | 18.4~18.8 | 7.5~7.6 |
| 상담 스킬 구매 | 0.9~1.0 | 0.9~1.0 |
| SP 얻음 / 씀 / 남음 | 139~142 / 72~77 / 64~68 | 143~147 / 74~77 / 68~72 |
| 다친 선수의 경기 출전 / 런 | 0.88~0.99 (유스) | 0.84~0.95 (본인) |
| 경계전 승률 (전체) | 52 / 54 / 54 / 52 / 52% | 57 / 55 / 56 / 52 / 54% |
| 경계전 승률 s1 / s2 / s3 (ace) | 80 / 52 / 36% | 83 / 53 / 35% |
| 평가 점수 · 등급 | 474~478 · 대부분 C (B 7~24) | 582~588 · 대부분 B (A 29~42, C 9~16) |
| 레슨 · 성장 · 부상 · 벤치 · 지원 지표 | — | 같은 띠 (±1%, rng 순서는 같고 후보만 다르다) |
| 런당 단계 수 | 100~101 | 110~112 (수업 단계) |

- 읽기: 액티브가 레벨 3 에서 빠지지 않고 거의 다 습득으로 바뀌어 **런당 습득 스킬이 약 12배** (Q3 — 수업 빈도). 감독 AI 는 빈 슬롯에만 받으므로 바꾸기 0 · 받지 않음은 슬롯이 가득일 때뿐. 평가 점수 (스킬 수가 들어간다) 가 크게 올랐고, 경계전 승률은 0~+2%p 로 거의 그대로. 밸런스는 나중에 한 번에 (방침).

**S2 · UI (2026-10-04)**
- 보상 모달 수업 칸 (`reward.js`): 계획 그림대로 머리 "코치 수업 n/m" + 안내 한 줄 (끝에 "수업이 끝나면 카드 고르기 / 다음 주로 / 계속"), 코치 얼굴 = 코치 색 원 + 짧은 이름 첫 글자 (`avatar`, 52px — 아직 초상화 그림이 없다), 문구 · 설명 2줄 · [액티브] · 포지션 ("전원" = 제한 없음) · 출처 (코치 지원 / 유대 이벤트). 선수 칩 `.rw-teach-pl[data-pid]` 7개 (스킬 칸 점 `●●○` + "빈 칸 n" / "가득 — 바꾸기" / 이유 회색, 습득 스킬 목록은 title). 가득인 선수를 고르면 `.rw-teach-rep` (`.rw-rep-btn[data-skill]`, 고른 스킬은 빨간 테두리 · 취소선). 아래 줄 = [배우지 않기 · SP +20] (`.rw-teach-skip`) · 요약 · [가르치기] (`.rw-teach-ok`). 받을 선수 없음 = [SP +20 받기] (`.rw-teach-skip.btn-primary`) 하나 · `.rw-teach-none` 안내.
- 수업 중에는 `manager.recommendReward` 를 부르지 않는다 (카드 고르기 칸이 없으므로). 추천 배지는 `recommendTeach` 선수 칩 (또는 [배우지 않기]).
- 끝난 수업 칩 `.rw-chip.teach` = 코치 얼굴 + "수업 함성 → 실루엔" / "→ SP +20" (title 에 바꾼 스킬 · 받을 선수 없음). 실패 레슨 칩 줄에도 붙는다.
- `labels.objParticle(word)` — 계획대로 "을" / "를" / "을(를)". "코치진" (supportId 없음) 은 "코치진이 '…'을 가르쳐 줍니다".
- 상담: 머리 설명 "패시브 스킬 = SP", "힌트 대기" 칩도 패시브만, 안내 줄 `.cs-active-note` (힌트 대기 줄이 없으면 칸 아래로 붙는다). 진열 기준 (Q1) 은 그대로 "힌트를 받은 패시브" — `consult.js` 머리말에 적어 두었다.
- 부상 문구: 경기 전 준비 "🚑 부상 n명 — 레슨만 쉬고 경기는 그대로 출전" (보통 글자색, 배지 흐림 없음, 없으면 "부상 선수 없음 — 7명 모두 출전"). 미팅 · 준비 편집기 (`meeting.js`) 슬롯은 얼굴을 흐리게 하지 않고 "🚑 레슨 결장 n" (경고색, title "레슨 결장 n회 · 경기는 출전"). 명단 (`hud.js`) 배지 "결장 n" 은 그대로 두고 title 만 바꿨다. 주 화면 외출 모달의 "결장 n" 배지는 레슨 기준이라 그대로.
- 시나리오: 기존 `og_reward_clear` · `unique` · `pick` · `perfect*` · `fail` 은 build 에서 남은 수업을 감독 추천으로 엔진 처리 (`finishTeach`) 하고 카드 고르기를 찍는다. 새 장면 `og_reward_teach` (seed 1 에는 수업이 남은 클리어 보상이 없어 퍼펙트 장면이 나온다 — `og_reward_teach_multi` 와 같은 상태) · `_pick` · `_full` (첫 수업을 끝낸 2/2 + 가득 주입 → 바꿀 스킬 고름, 수업 칩도 보인다) · `_none` · `_multi` · `_fail` (컷인 수업 주입) · `_touch` (915×412 탭) · `og_consult_passive` · `og_prep_injured`. `og_consult_full` 의 힌트 주입은 패시브만. `shot.mjs` 잘린 글자 검사에 수업 칸 · 수업 칩 · 요약 · 상담 안내 · 준비 부상 배지 선택자를 더했다.
- 테스트: `lessonUi` 에 수업 절 (문구 · 조사 · 회색 이유 · 추천 · 고르기는 엔진을 부르지 않음 · [가르치기] 연타 = 1번 · 저장 · 2/2 · 가득 → 바꾸기 그 자리 · 카드 고르기로 · 받지 않기 SP · 받을 선수 없음 · 실패 레슨 수업 → "다음 주로"), 상담 패시브만 · 안내, 경기 전 준비 부상 문구. `teach-pending:S2` 4곳은 화면 버튼 (`teachUi` · `ui.smoke` 완주의 선수 칩 → [가르치기]) 으로 바꿨다 — `grep -rn teach-pending test tools` 0건. 테스트 수는 그대로 332 (기존 테스트 안에 검사를 더했다).

**S3 · 통합 · 문서 (2026-10-04)**
- `tools/lesson_play.mjs` — 보상 모달에 수업이 남아 있으면 `recommendTeach` 대로 선수 칩 `.rw-teach-pl[data-pid]` → [가르치기] `.rw-teach-ok` (후보가 없으면 `.rw-teach-skip`) 을 **클릭 · 탭 · 키보드 (focus → Enter)** 로 돌아가며 누른다 (`--touch-only` 면 탭만). 행동마다 `pendingReward.teach` 의 끝난 항목이 하나 늘었는지, 받은 선수 `learnedSkillIds` 에 그 스킬이 있는지 (받지 않기면 SP 가 늘었는지) 확인하고, 안 먹으면 실패 + `actions.resolveTeach` 로 대신한다. 보고에 수업 목록 (시즌 · 주 · n/m · 스킬 → 선수 · 입력) · 런 끝 습득 스킬. 고르기 직후 PNG `…_teach<n>_pick`. 계획의 "바꾸기 (가득)" 는 감독 AI 가 바꾸지 않으므로 실제 판에서는 나오지 않는다 — `og_reward_teach_full` 스크린샷 · `lessonUi` 테스트가 맡는다.
- 실제 판 결과 (seed play-1 · 팀형): **1280×720 15주 완주** — 레슨 9 · 경기 3 · 코치 수업 8번 (클릭 3 · 탭 3 · 키보드 2, 수업 2/2 두 번), 입력 실패 · 대신한 것 · 대상 불일치 · 에러 · 스크롤 0, 점검 통과 (209초). 런 끝 습득: 네리아 함성 + 막판 집중(상담 패시브) · 도르비나 함성 · 매의 눈 · 실루엔 폭발 드리블 · 스루 패스 · 매의 눈 · 타리아 스루 패스 · 그레타 파워 슛. **915×412 터치 전용 시즌 1** — 수업 2번 (탭), 점검 통과.
- **고친 것 (UI)**: 수업 결과 토스트 ("수업: 하르나 코치 → 그레타 '파워 슛' 습득") 가 레슨 모드 토스트 자리 (`bottom: 236px`) 에 떠 다음 수업의 선수 칩을 2~3초 가렸다 (실제 판 PNG 에서 발견 — 누르기는 `pointer-events: none` 이라 막지 않았다). 보상 모달이 떠 있으면 토스트를 화면 맨 아래 (`bottom: 8px`, 모달 밖) 로 — `css/lesson.css` `.stage[data-mode="lesson"]:has(#modal-root .reward-modal) #toast-root`.
- **부상 선수 경기 출전 시나리오** — 경기 시나리오 `28_injured_plays` (`tools/scenarios.mjs`): 첫 경계전 직전 런 상태의 DF2 (아델린) 에 `injuredTurns = 2` 를 주입하고 (새 훅 `adjustRun(runState, data)` — `buildScenarioState` 가 `prepareRun` 뒤에 부른다), `lessonRun.getMatchSetup` 으로 만든 경기에서 home 7명 · 유스 없음 · 그 선수가 있는 장면을 찍는다 (캡처 시점에도 같은 조건). `ui.smoke` 에 주입 검사 (경계전 · 본인 출전 · 유스 토큰 0 · 스탯 = 안 다쳤을 때 · 런의 `injuredTurns` 그대로) — 테스트 수는 그대로 332. og 쪽 부상 화면은 S2 의 `og_prep_injured`.
- 스크린샷: `node tools/shot.mjs <dir> --only 0,1,2` 경기 **01~28 28/28**, `--only og` **114/114** — 스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0 (17 의 스킬 묶음 안쪽 스크롤은 의도). PNG 직접 확인: 28 (아델린 본인 토큰, 유스 없음) · 05 · 16 · `og_reward_teach_full` · `_none` · `_touch` · `og_reward_pick` · `og_prep_injured` · `og_consult_passive`. 토스트 고친 뒤 `og_reward*` · `og_lesson_end` · `og_lesson_fail` 18장 다시 통과.
- `grep -rn teach-pending test tools` 0건. `npm test` 332 통과. 경기 쪽 파일 · `data/config.json` · `run.js` · `training.js` diff 0.
- 문서: ARCHITECTURE §20 (부상 · 수업 · 상담 · 저장 v3 · 28 시나리오 · lesson_play 수업 · 테스트 332 · 142장), README (부상 · 스킬 한 줄 · 테스트 332 · 경기 01~28), OUTGAME_LESSON_draft 결정 L42 (부상은 레슨에만) · L43 (액티브는 코치에게서 · SP는 패시브만). 초안 결정 표에는 L41 행이 없다 (L41 = 레슨 중 스탯 보기 커밋 이름, §17) — 번호는 커밋 이름을 따라 L42 · L43 으로 두었다.

**최종 시뮬 전 / 후** (`npm run lesson-sim` = `--runs 200 --seed 1`, 방침 ace / team / counter / press / poss × 200런 · 경기 포함. 전 = S1 직전 커밋 `859fd1c` 에 지금 시뮬 도구, 후 = S3) — 보고만, 수치는 바꾸지 않았다

| 지표 | 전 | 후 |
|---|---|---|
| 런당 코치 수업 · 습득 / 바꾸기 / 받지 않음 / 받을 선수 없음 | 0 | 11.0 · 10.7/0/0.1/0.1 · 11.3 · 11.1/0/0.1/0.2 · 11.2 · 11.0/0/0.1/0.1 · 11.0 · 10.8/0/0.1/0.1 · 10.9 · 10.7/0/0.1/0.1 |
| 런 끝 선수당 액티브 · 패시브 | 0.08 · 0.06 / 0.08 · 0.05 / 0.08 · 0.06 / 0.07 · 0.06 / 0.07 · 0.06 | 1.53 · 0.14 / 1.58 · 0.14 / 1.57 · 0.14 / 1.54 · 0.14 / 1.53 · 0.13 |
| 습득 스킬 / 런 (7명 합) | 1.0 / 0.9 / 1.0 / 1.0 / 0.9 | 11.7 / 12.1 / 11.9 / 11.8 / 11.7 |
| 상담 스킬 구매 (후 = 패시브만) | 1.0 / 0.9 / 1.0 / 1.0 / 0.9 | 1.0 / 1.0 / 1.0 / 1.0 / 0.9 |
| 힌트 수 (후 = 패시브만) | 18.5 / 18.8 / 18.7 / 18.6 / 18.4 | 7.5 / 7.5 / 7.5 / 7.6 / 7.6 |
| 수업 SP / 런 · SP 얻음 / 씀 / 남음 | 0 · 139~142 / 72~77 / 64~68 | 4~5 · 143~147 / 74~77 / 68~72 |
| 런당 부상 | 1.55 / 1.63 / 1.71 / 1.74 / 1.86 | 1.61 / 1.67 / 1.70 / 1.68 / 1.81 |
| 다친 선수의 경기 출전 / 런 | 0.89 / 0.95 / 0.95 / 0.88 / 0.99 (유스) | 0.90 / 0.95 / 0.94 / 0.84 / 0.95 (본인) |
| 경계전 승률 (전체) | 56 / 54 / 54 / 52 / 52% | 57 / 55 / 56 / 52 / 54% |
| 경계전 승률 s1 / s2 / s3 | 80/52/36 · 82/53/28 · 82/50/29 · 77/52/28 · 80/47/29% | 83/53/35 · 84/54/28 · 81/53/34 · 78/53/27 · 80/52/30% |
| 런당 패배 | 1.32 / 1.38 / 1.40 / 1.44 / 1.45 | 1.30 / 1.33 / 1.32 / 1.43 / 1.39 |
| 평가 점수 · 등급 (A/B/C) | 474~478 · 0/7~24/176~193 | 582~588 · 29~42/144~157/9~16 |
| 레슨 · 성장 · 컷인 · 벤치 · 덱 · TP | — | 같은 띠 (±1%) |

- 읽기: S1 보고와 같다 (S2 · S3 는 엔진을 바꾸지 않았다). S1 표의 "전" 경계전 전체 승률 첫 칸 52% 는 다시 재면 56% (ace) 다. 경계전 승률은 방침마다 0~+2%p, 패배는 조금 줄었다 — 액티브가 런당 약 11개 더 생기는데도 경기 차이는 작다. 평가 점수만 크게 오른다 (스킬 수가 들어간다). Q3 (수업 빈도) · 등급 기준선은 밸런스 때 한 번에.

---

## 19. 선수 16명 · 전원 필살기 · 경기 엔진 수정 (브랜치)

> 상태: 구현 계획 (K0) · 2026-10-04 · 브랜치 `outgame-lesson` (시작 = `78cc0d3`). **main은 그대로 8명 · 옛 경기 엔진이다** — 이 절은 이 브랜치에만 들어간다 (`/soccer/lesson/`에만 보인다, §2.3).
> 기획자 결정 (2026-10-04, 이 계획의 L44 ~ L46):
> 1. **L44 선수 16명** — 새 8명(헤르타 · 브론테 · 나엘리스 · 온디나 · 리시엘 · 코니 · 카밀라 · 힐디)을 초안(`new_characters.json`) 그대로 넣는다. 고유 카드 8장은 초안 이름 · 연계 특성 모양(§16) · §16 보정 수치.
> 2. **L45 전원 필살기** — 모든 선수가 처음부터 자기 필살기(개인 게이지 · 컷인)를 갖는다. 레어도가 세기를 정한다: R ≈ 판정 ×1.3 + 작은 추가 0~1개 · **짧은 컷인**, SR ≈ ×1.6 + 추가 최대 1개, SSR ≥ ×1.9 + 판을 바꾸는 추가 + 합체기. 실루엔 바람의 실 · 그레타 메테오 슛은 그대로. 이를 위해 **경기 엔진 수정을 승인**했다: E1(필수) 합체기는 `combos.json`에 등록된 짝만, E2 필살 수비, E3 팀 필살기, E4 필살 드리블, E5 컷인 대사. 옛 고유 스킬 6개 중 패시브 4개는 SP 패시브 풀로, 액티브 2개(철의 태클 · 라인 브레이커)는 코치 힌트 목록으로 (액티브는 코치가 가르친다, §18).
> 3. **L46 주장 겹치지 않음** — 주장 두 명을 같이 내보내도 주장 효과는 한 명분만 (경기 · 그 밖 모든 곳).
> 4. 바꾸지 않는 것: `js/engine/rng.js`, 경기 액티브 "스루 패스"(2구역 전진 행동을 넣지 않는다), `data/config.json` (옛 런 테스트가 기대는 값 — 이 계획은 config 키를 하나도 더하지 않는다. 바꿔야 하면 §19.19에 이유를 적는다).
>
> **§0 · §3.4 · §14 ~ §18의 "경기 쪽 파일 diff 0" 규칙은 이 절의 슬라이스 K1 · K4에서만 풀린다** (`js/engine/match.js` · `skills.js` · `ai.js` · `js/ui/screens/match.js` · `css/match.css` · `js/ui/labels.js`). `rng.js` · `config.json` · `run.js` · `training.js` · `layout.js` 코드는 그대로다.
> 옛 런(`run.js`)도 이 브랜치에서는 같은 데이터(16명 · 새 필살기)를 쓴다 — 옛 런 테스트는 **데이터에 기대던 기대값만** 고친다 (§19.15).
> 표기는 §14 ~ §18과 같다. **[가정]** = 기획자가 아직 정하지 않은 값, **[구현 결정]** = 이 계획이 정한 세부. 둘 다 §19.18에 모았다. 밸런스는 조정하지 않는다 — 시뮬은 전 / 후만 보고한다 (승률이 크게 움직일 것이다, §19.16).

### 19.0 한눈에

| 무엇 | 지금 | 바뀐 뒤 |
|---|---|---|
| 캐릭터 | 8명 (`characters.json`) | **16명** (+8, 초안 그대로). 기본 편성(`config.defaultSquad`)은 그대로 |
| 필살기 보유 | SSR 2명 (실루엔 · 그레타), 나머지 6명은 고유 패시브 · 액티브 | **16명 모두** 필살기 1개 (`innateSkillId` = 필살기). 새 필살기 14개 |
| 필살기 종류 | `shot` · `pass` · `save` | + **`defense`**(E2) · **`team`**(E3) · **`dribble`**(E4) |
| 합체기 | 필살 패스를 받은 선수가 **아무 필살기나** 있으면 합체기 대기 | **`combos.json`에 (a, b)가 있을 때만** (E1). 5개 |
| AI 필살 패스 | 받는 선수가 필살기 보유자이거나 박스로 들어가는 패스 | **등록된 합체기 짝이거나 박스로 들어가는 패스** (+ 한 구역 더 가는 패스, §19.4) |
| 컷인 | 이름 · 종류. 첫 필살기만 길게 | + **대사 한 줄** `cutinLine` (E5), **등급별 길이** (R 짧게) |
| 옛 고유 6개 | 캐릭터 고유 (`learnable: false`) | 밀물의 벽 · 주장의 외침 · 지치지 않는 다리 · 고양이 페인트 → **SP 패시브** (코치 힌트), 철의 태클 · 라인 브레이커 → **코치 수업 액티브** |
| 주장 특성 | 주장마다 팀워크 +10 (`teamworkAmp`가 더한다) | **최대 1명분** (L46) |
| 고유 카드 | 8장 (카드 68장) | **16장** (카드 76장) — 피니셔 모양에 처음 주인이 생긴다 |
| 레슨 저장 | `lessonRun.version` 3 | **4** (옛 고유 스킬 id → 새 필살기 id) |
| 편성 화면 | 선수 풀 1줄 8장 | **2줄 × 8장**, 선수 고르기 모달 4열, 필살기 칩 |

### 19.1 파일 지도

| 파일 | 슬라이스 | 바꾸는 것 |
|---|---|---|
| `js/engine/skills.js` | K1 | `ULTIMATE_TYPES` 6종, `ULTIMATE_KEYS` (종류별 허용 키), `ultimateErrors(skill)` · `validateUltimates(data)` |
| `js/engine/match.js` | K1 | E0 공통 기반 · E1 ~ E4 (§19.3 ~ §19.7), 컷인 이벤트 `line` · `tier` (E5), 주장 최대 1명분 (§19.9) |
| `js/engine/ai.js` | K1 | 필살기 사용 규칙은 `match.aiWantsUltimate` 한 곳에 있다 — ai.js는 `decideAttack` · `decideDefense`가 새 종류를 그대로 넘기는지만 확인하고, 필요하면 필살 드리블 성향 반영 한 줄 |
| `data/skills.json` | K2 | 새 필살기 14개, 기존 필살기 4개에 `tier` · `cutinLine`, 옛 고유 6개 `learnable: true` · `cost` · `positions` |
| `data/characters.json` | K2 | +8명 (초안 그대로), 기존 6명 `innateSkillId` 교체 |
| `data/combos.json` | K2 | 1 → 5개 |
| `data/supports.json` | K2 | 코치 6명 `hintSkillIds`에 옛 고유 6개를 하나씩 |
| `data/traits.json` | K2 | 주장 `description`에 "1명분" (params 그대로) |
| `data/cards.json` | K2 | 고유 +8장 (version 2 그대로) |
| `js/engine/lessonRun.js` · `js/ui/store.js` | K3 | 저장 v4 (§19.13) |
| `tools/sim.mjs` · `tools/lesson_sim.mjs` · `tools/challenge_sim.mjs` | K1 · K3 | 필살기 종류 · 등급 · 합체기 이름별 지표 (§19.16) |
| `js/ui/screens/match.js` · `css/match.css` · `js/ui/labels.js` | K4 | 새 종류 버튼 · 호환 액션, 등급별 컷인 · 대사, 합체기 이름 폴백 제거, 역방향 컷인 (드리블) |
| `js/ui/screens/setup.js` · `js/ui/lineup.js` · `css/outgame.css` | K4 | 16명 편성 화면 · 선수 고르기 모달 · 필살기 칩 · 주장 2명 안내 |
| `js/ui/meeting.js` · `js/ui/screens/prep.js` · `js/ui/screens/result.js` · `css/lesson.css` | K4 | 필살기 표시 · 주장 2명 안내 · 결과 "고유 → 필살기" |
| `tools/scenarios.mjs` · `tools/lesson_scenarios.mjs` · `tools/shot.mjs` | K4 | 경기 29 ~ 34, og 새 장면 (§19.14 ⑥) |
| `docs/ARCHITECTURE.md` · `README.md` · `docs/OUTGAME_LESSON_draft.md` · `docs/OUTGAME_CARDS_draft.md` | K5 | §20 · 결정 L44 ~ L46 · 고유 카드 표 |

바꾸지 않는 파일: `js/engine/rng.js` · `run.js` · `training.js` · `effects.js` · `rating.js` · `challenge.js` · `js/ui/layout.js` · `data/config.json` · `data/opponents.json` · `data/challenge*.json` (도전 모드 샘플 팀은 옛 고유 스킬 그대로인 고정 스냅샷이다 [구현 결정]) · `data/events.json` · `data/lesson.json` · `data/policies.json`.

### 19.2 필살기 데이터 스키마 (`skills.json` `ultimate`)

`kind: "unique"` · `learnable: false` · `tension: 0` · `active: null`은 지금 그대로다. `ultimate` 객체:

```jsonc
"ultimate": {
  "type": "shot" | "pass" | "save" | "defense" | "team" | "dribble",
  "tier": "R" | "SR" | "SSR",            // 새 필수 키 (E5 — 컷인 길이 · 칩 색 · 등급 검사). 상대 보스 필살기는 "SSR"
  "cutinLine": "땅이 먼저 울릴 거야.",     // 새 필수 키 (E5) — 컷인 대사 한 줄, 1 ~ 24자 (띄어쓰기 포함)
  // 종류별 인자 (그 밖의 키는 검증 오류)
}
```

| 종류 | 허용 키 (기본값) | 뜻 |
|---|---|---|
| `shot` | `shoot` (1) · `gkMult` (1) · `boxShot` (false) · `minLine` (2) · `headerMult` (1) · `stamina` (0) | 슛 ×shoot, 막는 쪽 ×gkMult, 파이널 서드에서도 박스 슛 취급, **쓸 수 있는 최소 line** (새), **헤더면 ×headerMult 더** (새), 체력 추가 소모 |
| `pass` | `attack` (1) · `actions` (["pass","cross"]) · `negateRead` (false) · `nextDuelBonus` (0) · `receiverGauge` (= `onReceive`) · `extraLine` (false) | 패스 · 크로스 ×attack, **쓸 수 있는 액션** (새), 짝 무효, 받은 선수 다음 듀얼 +, 받은 선수 게이지, **한 구역 더** (새 — 라인 브레이커와 같은 `fx.extraLine`) |
| `save` | `saveMult` (1) · `sureDistribution` (false) | GK 세이브 ×saveMult, **막으면 그 GK의 롱패스 배급이 판정 없이 성공** (새) |
| `defense` | `defense` (1) · `noMissPenalty` (false) | **E2** — 필드 수비 ×defense, 짝 빗나감 ×0.8 없음 |
| `team` | `teamMult` (1) · `teamStamina` (0) | **E3** — 이번 듀얼부터 그 포제션 끝까지 팀 판정 ×teamMult, 판정 뒤 팀 전원 체력 +teamStamina |
| `dribble` | `attack` (1) · `extraLine` (false) · `negateRead` (false) · `noStamina` (false) | **E4** — 드리블 ×attack, 성공하면 한 구역 더, 짝 무효, 성공하면 체력 소모 없음 |

- **`receiverGauge` 기본값을 `onUltPassReceive`(50) → `onReceive`(35)로 바꾼다** [구현 결정]: 받은 선수 게이지 +50은 바람의 실의 SSR 추가 효과다. 지금 데이터의 필살 패스는 바람의 실 하나뿐이고 `receiverGauge: 50`을 직접 적어 두었으므로 K1에서 결과가 바뀌지 않는다 (config `onUltPassReceive`는 그대로 둔다 — 읽는 곳이 없어지면 §19.19에 적는다).
- **검증** `skills.ultimateErrors(skill)` → 오류 문구 배열 (순수): `type ∈ ULTIMATE_TYPES` / 허용 키 밖 = "필살기 <id>: <type>에 쓸 수 없는 키 <k>" / 배율 키(`shoot` · `attack` · `saveMult` · `defense` · `teamMult` · `headerMult`) ≥ 1, `gkMult` ∈ (0, 1] / `minLine` ∈ {2, 3} / `actions` ⊂ {pass, cross}, 비어 있지 않음 / `tier` ∈ {R, SR, SSR} / `cutinLine` 1 ~ 24자 / `nextDuelBonus` · `teamStamina` · `stamina` · `receiverGauge` ≥ 0. `validateUltimates(data)`는 모두 모아 throw — `match.createMatch`가 한 번 부른다 (팀 선수 스킬 참조 검증 바로 뒤).
- **등급 상한 검사**는 런타임이 아니라 **데이터 테스트**가 한다 (§19.15). "주 배율" = shot `shoot ÷ gkMult` · pass / dribble `attack` · save `saveMult` · defense `defense` · team `teamMult`. "추가" = `negateRead` · `nextDuelBonus` · `extraLine` · `noStamina` · `noMissPenalty` · `sureDistribution` · `teamStamina` · `headerMult ≠ 1` · `boxShot` · `receiverGauge > onReceive` (shot의 `gkMult`는 주 배율에 들어가므로 추가가 아니다). 제한 · 비용(`minLine` · `actions` · `stamina`)은 추가가 아니다.
  - R: 주 배율 1.15 ~ 1.45 (team은 1.05 ~ 1.1), 추가 ≤ 1.
  - SR: 주 배율 1.45 ~ 1.7, 추가 ≤ 1.
  - SSR: 주 배율 ≥ 1.9, **또는** pass이고 추가 ≥ 2 (바람의 실 — 기획자가 그대로 두기로 한 예외). SSR 필드 선수는 합체기 목록에 1번 이상 나온다 (헤르타 GK는 예외 — §19.18 Q1).

### 19.3 E0 · 공통 기반 (`match.js`) — 지금 데이터에서는 결과가 같다

1. **`ultTypeUsableAt(ult, line)`** — 인자를 type 문자열에서 ultimate 객체로 바꾼다. shot: `line ≥ (minLine ?? 2)` · pass: `line ≤ 3` · dribble: `line ≤ 2` · team: 늘 참 · save · defense: 거짓 (받는 선수 = 공격 쪽이라). 부르는 곳 4곳 (`receiverValue` · `aiWantsUltimate` · `aceCallFor` · `nextShotP`).
2. **`applyUlt(fx, skill, combo)`** — `fxPlusUlt`(미리보기)와 `commitUltimate`(실제)가 **같은 함수**로 fx를 만든다: `fx.ult = { skillId, ...ultimate }`, `fx.combo`, 그리고 위치를 바꾸는 인자를 fx 플래그로 접는다 — `ultimate.extraLine` → `fx.extraLine = true` (pass · dribble). 그래서 `passPlan` · `successTransition` · `outcomesBySkill`이 라인 브레이커와 같은 길로 한 구역 더 간다 (④ 박스 연결에는 추가 전진 없음 — 지금 규칙). 판정 배율(attack · defense · shoot)은 접지 않고 `computeOdds`가 `fx.ult`에서 읽는다 (결정타 칩이 "필살 ×1.6"으로 따로 보이게).
3. **`ultimateUsable`** — 종류마다 (지금 shot · pass · save 갈래 + E2 ~ E4):
   - shot: `role attack`, `line ≥ minLine` (minLine 3이면 사유 "박스 슛에서만", 아니면 지금 문구), `action ∈ {shoot, null}`.
   - pass: 지금 규칙 + `action ∈ actions` (사유 "크로스와 함께만" / "패스와 함께만").
   - save: 그대로.
   - defense · team · dribble: §19.5 ~ §19.7.
4. **`attackTendencyAt` 성향** (A안): `ultFor`가 dribble 필살기를 주면 드리블 성향 ×attack, shot은 `minLine` 아래 line이면 ultFor가 null, shot `headerMult`는 헤더 성향에만. 팀 필살기는 성향을 바꾸지 않는다 (모든 액션에 같은 배율).
5. **`computeOdds`**: 공격 `ultMultA` = shot(`shoot` × 헤더면 `headerMult`) · pass(`attack`, `actions` 안일 때) · **dribble(`attack`, action dribble)** · team(`teamMult`, E3). 수비 `ultMultD` = **defense(`defense`)** · team(`teamMult`). 칩 `F("atk"|"def", "ultimate", …, "필살 ×1.6")`. 짝 무효 `negateApplies`에 dribble `negateRead` (action dribble). 빗나감: `fxD.noMissPenalty || fxD.ult?.noMissPenalty`.
6. **체력** (`step`): shot `stamina` 그대로, dribble `noStamina`면 **성공했을 때** 드리블 소모 0 (폭발 드리블과 같은 규칙).
7. **`bestAttackResponse`** 필터: dribble 필살기 → 드리블만, team → 전부.
8. **`reverseCutinOf`**: dribble 필살기가 필드 수비에 막히면 `kind: "block"` ("철벽 블록!"). team · defense · save는 역방향 컷인 없음 (지금처럼 공격 필살기만).
9. **이벤트 문구** `TYPE_TEXT`: shot "필살 슛" · pass "필살 패스" · save "필살 세이브" · **dribble "필살 드리블"** · **defense "필살 수비"** · **team "필살 호령"**. `labels.ULT_TYPE_LABELS`도 같게 (K4).
10. **save `sureDistribution`** (헤르타): 그 세이브가 성공(= 공을 잡음)하고 배급이 이어지면 그 배급 한 번만 `sure: true` (배급 상태에 둔다). `longPassOdds` 결과 `p = 1` · `sure: true`, `resolveDistribution` 롱패스는 **`rng.chance`를 부르지 않고** 성공한다. 짧은 패스도 고를 수 있다 (사람). AI '상황 따라'는 p ≥ 0.55라 롱패스. 배급 뷰 · 카드에 "확정 (대지의 손바닥)". 승부차기 · 경기 끝 세이브면 배급이 없어 효과 없음. ④ 박스 연결을 잡은 경우도 세이브와 같다.
11. **`aceCallFor`** (표시 전용): 게이지 외침(①)은 **shot · pass 필살기만** 그대로 본다 — 새 종류(dribble · team · defense · save)는 외치지 않는다 [구현 결정: 7명 모두 필살기라 외침이 너무 잦아진다 — 지금도 공격 결정의 약 20%, GDD 9.17-6 확인 필요]. 합체기 외침(②)은 이미 등록된 짝만 본다.
12. **결정성 · 순수**: 새 규칙은 모두 상태 · 데이터만 읽는다. rng 호출이 달라지는 곳은 `sureDistribution` 롱패스에서 **하나 줄어드는 것**뿐이다. 미리보기 · 뷰 · AI는 rng를 쓰지 않는다 (지금 그대로).

### 19.4 E1 · 합체기는 등록된 짝만 (필수)

규칙: 필살 패스(a)를 받은 선수의 필살기(b)는 **`comboName(data, a, b)`가 있을 때만** 합체기 대기가 된다. 등록되지 않은 짝이면 받은 선수는 보통 필살 패스 수신(게이지 `+receiverGauge`, 다음 듀얼 `+nextDuelBonus`)만 받는다 — 게이지가 가득이면 자기 필살기를 보통처럼 쓸 수 있다.

| 곳 (`match.js`) | 지금 | 바뀐 뒤 |
|---|---|---|
| 새 헬퍼 `comboSkillFor(data, passSkillId, receiver)` | — | 받은 선수 필살기 b가 있고 `comboName(data, a, b.id)`가 있으면 b, 아니면 null |
| `step` 패스 성공 (`if (ultPass && getPlayerUltimate(data, receiver))`) | 필살기만 있으면 `comboReadyId` | `comboSkillFor(...)`가 있을 때만 `comboReadyId` · `comboFrom` |
| `nextShotP`의 `recvUlt` | 〃 | 〃 (`comboSkillFor`) |
| `receiverValue(…, combo)` | `combo` = 필살 패스 여부 (불리언) → 받은 선수 필살기 가치 | `passSkillId` (문자열 \| null) → `comboSkillFor`가 있을 때만 합체기 가치 |
| `boxReceiverValue` `combo = passUlt && shotUlt` | | `&& comboSkillFor(...)` |
| `defaultFromPlan` | 필살 패스면 합체기 가치 | `fx.ult.skillId`를 넘긴다 |
| `aiWantsUltimate` pass | `arrival ≥ 3` 또는 받는 선수 필살기가 도착 line에서 쓸 수 있음 | **`arrival ≥ 3` 또는 (등록된 짝 && `ultTypeUsableAt(b, arrival)`)** 또는 한 구역 더 가는 패스 (아래) |
| `comboFor` · `commitUltimate` · `getMatchView`의 이름 폴백 `"합체기"` | 이름이 없으면 "합체기" | 그대로 둔다 (옛 진행 중 경기 저장본의 `comboReadyId`용 — 새 경기에서는 생기지 않는다) |
| UI `boxComboName` (`screens/match.js`, K4) | `comboName(...) \|\| '합체기'` | `comboName(...) ?? null` (등록 안 된 짝은 합체기 표시 없음) |

- **AI 필살 패스 추가 규칙 — 한 구역 더 가는 패스** [구현 결정]: `extraLine` 필살 패스(나엘리스 심해 물길)는 `plan.arrival > min(3, line + 1)`일 때(실제로 한 구역을 건너뛸 때)도 쓴다. 이것이 없으면 DF 나엘리스(공을 line 0에서만 잡는다)는 박스로 바로 가는 패스가 없어 필살기를 거의 쓰지 못한다. 기획자 규칙("등록된 짝 또는 박스로 들어가는 패스")을 넓힌 것이라 §19.18에 적는다.
- 마지막 2포제션 · 합체기 대기 = 즉시 사용 (지금 그대로).
- **지금 데이터로는 결과가 같다**: 지금 필살 패스는 바람의 실 하나, 받는 쪽 필살기는 메테오 슛 하나 (등록된 짝)이고, 상대 보스는 필살 패스가 없다. K1은 이것을 시뮬 출력 비교로 확인한다 (§19.17).

### 19.5 E2 · 필살 수비 (`type: "defense"`)

- **쓸 수 있을 때**: `role === "defense"`, `line ≤ 2` (필드 수비 듀얼 — line 3은 GK 세이브), 수비 3종(태클 · 인터셉트 · 버티기) 어느 것과도. 사유 "필드 수비에서만".
- **효과**: 수비 판정 ×`defense` (칩 "산맥 쐐기 ×1.6"), `noMissPenalty`면 짝 빗나감 ×0.8 → ×1.0. 제쳐짐 · 인터셉트 뚫림 같은 뚫림 결과는 그대로 (바위 방벽의 `noFailPenalty`와 다르다).
- **AI** (`aiWantsUltimate` — `ai.decideDefense`가 이미 부른다): **line 2 수비**(= 상대의 파이널 서드, 우리 최종 수비 라인) 또는 남은 포제션 ≤ 2. line 0 · 1에서는 쓰지 않는다 (게이지를 아낀다).
- **사람**: 수비 결정에서 스킬 줄의 필살기 버튼 → `{ action: "tackle", ultimate: true }`. 호환 액션 = 수비 3종 (`ultCompatible`, K4). 미리보기 기대 % (`expectedMap(applyUlt(...))`)에 반영된다.
- 이벤트: `cutin` (`ultimateType: "defense"`). 막아도 따로 연출은 없다 (보통 수비 성공 연출 + 컷인).
- 게이지: 수비 성공 +`onDuelWin` (지금 규칙 — 필살기를 쓴 듀얼에서는 얻지 않는다).

### 19.6 E3 · 팀 필살기 (`type: "team"`)

- **쓸 수 있을 때**: 그 선수가 이번 듀얼의 참가자 (공격 = 공 가진 선수, 수비 = 막는 선수 · GK), 역할 · line 상관없음. **팀당 포제션마다 1번** — `state.possessionFx[side].teamUlt`(skillId)가 있으면 사유 "이번 포제션에 이미 사용". 함성과는 곱으로 쌓인다.
- **효과 (미리보기 = 실제가 되게 두 단계)** [구현 결정]:
  1. **이번 듀얼**: `computeOdds`가 `fx.ult.type === "team"`이면 그쪽(공격 att / 수비 def)에 ×`teamMult` (칩 "불꽃 호령 ×1.08").
  2. **판정 뒤** (`step`, 주사위 다음): `possessionFx[side].teamMult *= teamMult`, `teamUlt = skillId` → 남은 포제션 동안 그 팀의 모든 판정(공격 · 수비)에 붙는다. 포제션이 끝나면 지금처럼 리셋된다. 1번은 커밋한 fx로만, 2번은 판정 뒤에만 해서 이번 듀얼에 두 번 곱하지 않는다.
  3. **체력**: 판정 뒤 팀 전원 `+teamStamina` (상한 `staminaMax`). 판정 전에 올리면 이번 듀얼의 체력 배율이 미리보기와 달라진다.
- 수비 쪽에서 쓰면 "이번 포제션" = 상대 공격 포제션 (함성과 같은 뜻 — 막으면 포제션이 끝나 효과도 끝난다).
- **AI**: 그 팀이 **지고 있을 때** (`scoreDiffFor(state, side) < 0`) 또는 남은 포제션 ≤ 2. 그 선수가 참가하는 듀얼이 오면 바로 쓴다.
- **사람**: 공격 · 수비 결정 모두 버튼이 뜬다. 호환 액션 = 전부.
- 이벤트: `cutin` (`ultimateType: "team"`), 판정 이벤트 뒤 정보 이벤트 `type: "teamUlt"` 텍스트 "팀 판정 ×1.08 (이번 포제션) · 체력 +15" (화면은 로그 한 줄).

### 19.7 E4 · 필살 드리블 (`type: "dribble"`)

- **쓸 수 있을 때**: `role attack`, `line ≤ 2`, `action ∈ {dribble, null}`. 사유 "드리블과 함께만" · "박스에서는 드리블 없음".
- **효과**: 드리블 ×`attack` (칩). `negateRead`면 상대 짝 맞힘 ×1.0 (드리블에만). `noStamina`면 성공 시 드리블 체력 0. `extraLine`이면 성공 시 한 구역 더 (`applyUlt` → `fx.extraLine` — 라인 브레이커와 같은 처리: line 2에서 쓰면 박스 도착 + 원터치 + `extraLineShot` 슛 +20%).
- **미리보기**: `getMatchView`의 `outcomesBySkill` · `receiverPreviewBySkill`에 **필살기 skillId 키**로 드리블 결과(도착 구역)가 들어간다 — 지금 필살 패스가 쓰는 자리와 같다. 그래서 화면 화살표가 "두 구역 전진"을 보여 준다.
- **AI**: 드리블을 고른 듀얼이면 (성향에 필살 배율이 들어가 드리블이 1위가 되면) 준비됐을 때 쓴다 — 필살 슛과 같은 "준비되면 사용" 규칙. line 0의 DF(코니)도 쓴다.
- 막히면 역방향 컷인 "철벽 블록!" (§19.3 8번).

### 19.8 E5 · 컷인 대사 · 등급별 컷인 길이

- **엔진**: `cutin` 이벤트에 `line: ultimate.cutinLine`, `tier: ultimate.tier`를 싣는다. `combo` 이벤트는 그대로 (두 컷인이 각자 `line`을 가진다). `getMatchView().ultimateOptions[]`에 `tier` · `cutinLine` (버튼 title용). 판정에는 쓰이지 않는다.
- **화면** (`screens/match.js` 컷인 카드 · `css/match.css`, K4):
  - 컷인 띠 글자: 작은 줄 "실루엔 · 필살 패스"(지금) → 큰 이름 "바람의 실"(지금) → **대사 `.cut-line`** "“바람이 길을 알려 줄 거야.”" (16px, 흰색 85%, 한 줄 ellipsis — 1280 폭에서 24자는 넘치지 않는다).
  - 등급 클래스 `.cut.tier-R` · `.tier-SR` · `.tier-SSR`. R은 띠 위아래 여백 24 → 14px, 얼굴 88 → 64px, 이름 34 → 26px. SR은 얼굴 76px · 이름 30px. SSR은 지금 그대로.
  - **길이** (`T` 상수, 배속 비례 그대로 — 2x · 4x는 지금 비율):

    | 등급 | 경기 첫 필살기 (차지 + 컷인) | 그 뒤 | 이유 |
    |---|---|---|---|
    | SSR | 0.4 + 1.0초 | 0.3 + 0.9초 | 지금 그대로 |
    | SR | 0.3 + 0.8초 | 0.25 + 0.7초 | |
    | R | 0.2 + 0.6초 | 0.15 + 0.5초 | "짧은 컷인" — 한 경기 필살기가 팀당 5 ~ 8번이 된다 (§19.16 예상) |

    "경기 첫 필살기"는 지금처럼 그 경기의 첫 `cutin` 하나뿐이다 (등급과 상관없이). 합체기(두 컷인 1.0초씩 + 이름 1.1초)는 그대로.
- 옛 경기 저장본 이벤트에 `line` · `tier`가 없으면 대사 줄을 그리지 않고 SSR 길이로 그린다 (지금처럼 보인다).

### 19.9 L46 · 주장 겹치지 않음

- **경기** (`match.teamworkAmp`): `tw += Σ teamworkPlus` → **`tw += max(teamworkPlus)`** (경기장 선수 중 가장 큰 값 하나). 지금 데이터 · 상대 · 도전 샘플에는 주장이 둘인 팀이 없어 K1에서 결과가 같다.
- `data/traits.json` 주장 `description` → "팀워크 증폭 단계를 계산할 때 팀워크 +10 (주장이 여럿이어도 1명분)", `labels.js` 특성 설명도 같게. `params` · `amp`는 그대로 (`DEFAULT_TRAITS` 비교 테스트 그대로).
- **그 밖에 주장 효과가 있는 곳**: 코드 검색상 `teamworkPlus`는 `match.teamworkAmp` 한 곳뿐이다. 레슨의 주장 **모양**(주인 구역 전원 · 팀워크 +2, §16)은 그 주장의 고유 카드를 **낼 때**의 효과라 경기장에 둘이 있다고 저절로 겹치지 않는다 → 두 주장의 카드는 각자 그대로 낸다 [구현 결정 — §19.18 Q3로 묻는다].
- **화면** (K4): 편성 화면 공명 줄 · 경기 전 준비 왼쪽 칸에 주장이 2명 이상이면 칩 "©️ 주장 2명 — 팀워크 +10은 1명분". 경기 화면은 바꿀 것이 없다.

### 19.10 필살기 16개 (+ 상대 보스 2개)

판정 비율 = §19.2의 주 배율. 수치 · 이름 · 대사는 모두 [가정] (밸런스는 나중에 한 번에).

| 선수 (등급 · 포지션) | 필살기 id · 이름 | 종류 | 인자 | 판정 비율 · 추가 → 상한 | AI 사용 | `cutinLine` |
|---|---|---|---|---|---|---|
| 네리아 (SR · GK) | `sk_high_tide` 만조의 장벽 | save | `saveMult 1.6` | 1.6 · 0 → SR ✓ | 지금 save 규칙 (line 3, 동점 · 열세 · 남은 ≤ 3 · 게이지 가득) | 파도야, 골문을 지켜 줘. |
| 도르비나 (SR · DF) | `sk_mountain_wedge` 산맥 쐐기 | defense | `defense 1.6, noMissPenalty` | 1.6 · 1 → SR ✓ | line 2 수비 | 여기서부터는 산이다. |
| 아델린 (R · DF) | `sk_flame_command` 불꽃 호령 | team | `teamMult 1.08, teamStamina 15` | 1.08 / 듀얼 (포제션 3듀얼 ≈ 1.26) · 1 → R ✓ | 지고 있을 때 | 다들, 아직 안 끝났어! |
| 실루엔 (SSR · MF) | `sk_wind_thread` 바람의 실 (그대로) | pass | `attack 1.5, negateRead, nextDuelBonus 0.5, receiverGauge 50` | 1.5 · 3 → SSR (pass 예외) ✓ | 등록 짝 · 박스로 | 바람이 길을 알려 줄 거야. |
| 타리아 (R · MF) | `sk_lightning_dash` 번개 질주 | dribble | `attack 1.3, noStamina` | 1.3 · 1 → R ✓ | 드리블을 고르면 | 아직 한참 더 뛸 수 있어! |
| 울리카 (SR · FW) | `sk_prairie_gale` 초원의 질풍 | pass | `attack 1.5, negateRead` | 1.5 · 1 → SR ✓ | 박스로 (크로스는 늘 박스) | 따라올 수 있으면 와 봐! |
| 그레타 (SSR · FW) | `sk_meteor_shot` 메테오 슛 (그대로) | shot | `shoot 2, gkMult 0.7, boxShot, stamina 10` | 2.86 · 1 → SSR ✓ | 준비되면 (line ≥ 2) | 땅이 먼저 울릴 거야. |
| 미르카 (R · MF) | `sk_alley_cat_step` 골목 고양이 스텝 | dribble | `attack 1.25, negateRead` | 1.25 · 1 → R ✓ | 드리블을 고르면 | 힘으로는 못 잡아, 냐. |
| 헤르타 (SSR · GK) | `sk_earth_palm` 대지의 손바닥 | save | `saveMult 2, sureDistribution` | 2.0 · 1 → SSR ✓ (합체기 없음 — GK) | save 규칙 | 전원 앞으로! 공은 내가 보낸다. |
| 브론테 (SSR · FW) | `sk_thunderbolt` 낙뢰 | shot | `shoot 1.8, gkMult 0.6, minLine 3, stamina 10` | 3.0 · 0 → SSR ✓ + 합체기 2개 | 준비되면 (박스만) | 번쩍— 이미 들어갔어. |
| 나엘리스 (SR · DF) | `sk_deep_current` 심해 물길 | pass | `attack 1.5, actions ["pass"], extraLine` | 1.5 · 1 → SR ✓ + 합체기 1개 | 등록 짝 · 박스로 · 한 구역 더 갈 때 | 거리, 계산 끝났어요. |
| 코니 (R · DF) | `sk_moon_hop` 달토끼 도약 | dribble | `attack 1.2, extraLine` | 1.2 · 1 → R ✓ | 드리블을 고르면 | 무, 무서워도 뛴다! |
| 온디나 (SR · MF) | `sk_rapids` 급류 | dribble | `attack 1.6, negateRead` | 1.6 · 1 → SR ✓ | 드리블을 고르면 | 흐르는 물은 못 막아. |
| 리시엘 (SR · MF) | `sk_lightning_arrow` 뇌전 화살 | pass | `attack 1.5, actions ["cross"], nextDuelBonus 0.3` | 1.5 · 1 → SR ✓ + 합체기 2개 | 크로스면 (늘 박스) | 과녁은 저 머리 위. |
| 카밀라 (R · FW) | `sk_sky_header` 하늘 가르기 | shot | `shoot 1.3, minLine 3, headerMult 1.1` | 1.3 (헤더 1.43) · 1 → R ✓ | 준비되면 (박스만) | 공중볼은 전부 내 거야! |
| 힐디 (R · FW) | `sk_forge_finish` 담금질 일격 | shot | `shoot 1.3, gkMult 0.9, minLine 3` | 1.44 · 0 → R ✓ | 준비되면 (박스만) | 이건 내 최고 작품이야. |
| (상대) 엠버스론 FW | `sk_boss_strike` 업화의 일격 | shot | 그대로 + `tier SSR` | 2.86 | 그대로 | 다 태워 버려! |
| (상대) 엠버스론 GK | `sk_boss_save` 불꽃 장벽 | save | 그대로 + `tier SSR` | 2.0 | 그대로 | 불꽃이 골문을 막는다. |

- 새 필살기 공통: `kind "unique"`, `learnable false`, `cost 0`, `tension 0`, `positions null` (GK 필살기 2개는 `["GK"]`), `passive null`, `active null`.
- `description` (스킬 목록 · 버튼 title): 종류 머리 + 효과. 예 "필살 수비: 이번 수비 ×1.6, 짝이 빗나가도 ×0.8 페널티 없음" · "팀 필살기: 이번 포제션 동안 팀 판정 ×1.08, 판정 뒤 팀 전원 체력 +15" · "필살 드리블: 이번 드리블 ×1.2, 성공하면 한 구역 더 전진" · "필살 세이브: 이번 세이브 ×2, 막으면 롱패스 배급 확정" · "필살 슛: 박스 슛 ×1.8, GK ×0.6 (체력 −10)" · "필살 패스: 이번 크로스 ×1.5, 받은 선수 다음 듀얼(헤더) +30%".
- **브리프에서 고친 것** (등급 상한에 맞춤 — 모두 [가정], §19.18 Q2):

  | 선수 | 브리프 | 이 계획 | 이유 |
  |---|---|---|---|
  | 울리카 | 패스 · 크로스 ×1.3 + 짝 무효 | ×1.5 + 짝 무효 | SR ≈ ×1.6 (×1.3은 R 수준) |
  | 온디나 | 드리블 ×2 + 짝 무효 + 체력 소모 없음 | ×1.6 + 짝 무효 | SR 상한 (배율 ≤ 1.7 · 추가 1개) |
  | 리시엘 | 크로스 ×1.5 + 짝 무효 + 받은 선수 헤더 + | ×1.5 + 받은 선수 다음 듀얼 +30% | 추가 1개 — "머리 위 한 점"의 헤더 쪽을 남겼다 |
  | 카밀라 | 슛 ×1.7 | 박스 슛 ×1.3, 헤더면 ×1.1 더 | R 상한 · 타깃맨 (공중볼) |
  | 힐디 | 슛 ×1.4, GK ×0.5 | 박스 슛 ×1.3, GK ×0.9 | R 상한 |
  | 아델린 · 타리아 · 미르카 · 도르비나 · 나엘리스 | 종류만 정함 | 위 표 | 새 종류 (E2 ~ E4)에 맞춤 |
- 필살기에서 빠지는 옛 고유 6개는 §19.12 ②.

### 19.11 합체기 5개 (`data/combos.json`, a = 필살 패스 → b = 받은 선수의 필살기)

| a (패스) | b (받은 선수) | 이름 | 어디서 나오나 |
|---|---|---|---|
| 실루엔 바람의 실 | 그레타 메테오 슛 | **바람의 유성** (그대로, 목록 맨 앞 — 테스트가 `combos[0]`을 본다) | 파이널 서드 · 박스 |
| 실루엔 바람의 실 | 브론테 낙뢰 | **풍뢰일섬** | 박스로 들어가는 패스 · 박스 연결 (낙뢰는 박스만) |
| 나엘리스 심해 물길 | 브론테 낙뢰 | **뇌우** | MF 자리 나엘리스의 line 1 → 3 패스, 또는 line 2 → 3 |
| 리시엘 뇌전 화살 | 카밀라 하늘 가르기 | **하늘 과녁** | 크로스 → 헤더 (×1.1 · 합체기 ×1.2) |
| 리시엘 뇌전 화살 | 그레타 메테오 슛 | **뇌명 유성** | 크로스 → 헤더 |

- 합체기 보너스 `comboBonus` 1.2 (config 그대로), 받은 선수 게이지는 쓰지 않는다 (지금 그대로).
- 등록되지 않은 짝 예: 울리카 초원의 질풍 → 그레타 = 합체기 없음 (그레타는 게이지 +35, 게이지가 차 있으면 자기 메테오 슛). [가정] — 기획자가 짝을 더하면 `combos.json` 한 줄이다.
- 데이터 테스트: a는 `type pass`, b는 받은 뒤 공격에서 쓸 수 있는 종류 (shot · pass · dribble · team), 같은 (a, b) 중복 없음, 이름 1 ~ 8자, SSR 필드 선수(헤르타 제외)는 a나 b로 1번 이상.

### 19.12 데이터 변경 (K2)

**① `characters.json`** — 초안 8명을 그대로 뒤에 붙인다 (헤르타 · 브론테 · 나엘리스 · 코니 · 온디나 · 리시엘 · 카밀라 · 힐디 순, id · 스탯 · 성장률 · 적성 · 특성 · 색 · 소개 그대로). 기존 6명 `innateSkillId`:

| id | 지금 | 바뀐 뒤 |
|---|---|---|
| `ch_spirit_keeper` 네리아 | `sk_tide_wall` | `sk_high_tide` |
| `ch_dwarf_wall` 도르비나 | `sk_iron_tackle` | `sk_mountain_wedge` |
| `ch_human_captain` 아델린 | `sk_captain_call` | `sk_flame_command` |
| `ch_human_runner` 타리아 | `sk_tireless` | `sk_lightning_dash` |
| `ch_wolf_winger` 울리카 | `sk_line_breaker` | `sk_prairie_gale` |
| `ch_cat_trickster` 미르카 | `sk_feint` | `sk_alley_cat_step` |

- 이름 · 대사 · 소개는 여성형 규칙 그대로 (초안이 이미 맞춤). 스탯 합: SSR 1,420 · 1,380 / SR 1,210 · 1,190 · 1,160 / R 960 · 990 · 970 (GDD 7.1 가이드 안). A 적성은 모두 1개 (run.test 검사 그대로 통과).
- 16명이면 같은 원소 3명 공명이 가능해진다 (물 · 번개 · 땅 · 바람 · 불 모두 3명 이상). 기본 편성은 그대로 공명 없음.

**② `skills.json`** — 새 필살기 14개 (§19.10), 기존 필살기 4개(바람의 실 · 메테오 슛 · 보스 2개)에는 `tier` · `cutinLine`만 더한다. 옛 고유 6개는 **id · 효과 그대로** 두고:

| id | 바뀌는 것 | 레슨 런에서 얻는 곳 |
|---|---|---|
| `sk_tide_wall` 밀물의 벽 (GK 세이브 +15%) | `learnable: true`, `cost 180`, `positions ["GK"]` | 학자 이레네 힌트 → 상담 SP (패시브) |
| `sk_captain_call` 주장의 외침 | `learnable: true`, `cost 140` | 음유시인 루미 힌트 → 상담 |
| `sk_tireless` 지치지 않는 다리 | `learnable: true`, `cost 120` | 수행자 한나 힌트 → 상담 |
| `sk_feint` 고양이 페인트 | `learnable: true`, `cost 100`, `positions ["FW","MF"]` | 거리의 조이 힌트 → 상담 |
| `sk_iron_tackle` 철의 태클 (액티브) | `learnable: true`, `cost 130`, `positions ["DF","MF"]` | 주장 바르바라 → **코치 수업** (§18) |
| `sk_line_breaker` 라인 브레이커 (액티브) | `learnable: true`, `cost 140`, `positions ["FW","MF"]` | 무희 셀리아 → **코치 수업** |

- `cost`는 옛 런 상점과 레슨 상담(패시브)이 쓰는 SP다. 액티브의 `cost`는 레슨 런에서 쓰이지 않는다 (옛 런용). 수치 [가정] — 효과 대비 기존 패시브 가격에 맞췄다 (침착한 수문장 +8% = 150 → 밀물의 벽 +15% = 180).
- 액티브 텐션(철의 태클 30 · 라인 브레이커 35)과 v05 텐션 표는 그대로.

**③ `supports.json` `hintSkillIds`** (뒤에 하나씩 붙인다 — 힌트 뽑기 결과가 바뀌어 레슨 시뮬 값이 조금 달라진다):

| 코치 | 지금 | 더하는 것 |
|---|---|---|
| 주장 바르바라 | 바위 방벽 · 잠금 수비 · 캐논 킥 | + 철의 태클 |
| 무희 셀리아 | 폭발 드리블 · 마지막 힘 · 꿰뚫어보기 | + 라인 브레이커 |
| 학자 이레네 | 스루 패스 · 침착한 수문장 · 꿰뚫어보기 | + 밀물의 벽 |
| 음유시인 루미 | 함성 | + 주장의 외침 |
| 수행자 한나 | 큰 경기 체질 · 마지막 힘 | + 지치지 않는 다리 |
| 거리의 조이 | 파워 슛 · 언더독 정신 | + 고양이 페인트 |

- "SP 패시브 풀"은 §18.5 기본값("편성 코치 힌트를 받은 패시브")이 그대로이므로 **패시브 4개는 코치 힌트를 거쳐 상담 진열에 들어온다**. §18.10 Q1(진열 기준)이 정해지면 4개도 그 규칙을 따른다.
- 오르넬라 · 하르나는 그대로.

**④ `combos.json`** — §19.11 5개.

**⑤ `traits.json`** — 주장 `description`만 (§19.9).

**⑥ `cards.json` 고유 +8장** (version 2 그대로, 68 → **76장**). 모양은 주인 특성에서 온다 (§16 — 카드에 모양 키 없음). 수치는 같은 특성 카드와 같게 (§16.2 ③ 권장), 피니셔는 §16.6 참고값 30 (38). 위력 손잡이만 K3가 §16.11 띠로 보정한다.

| id | 이름 | 주인 (특성 → 모양) | 위력 (강화) | 효과 (강화) | `desc` |
|---|---|---|---|---|---|
| `cd_u_herta` | 골문 앞 허들 | 헤르타 (주장 → 주인 구역 전원 · 팀워크 +2) | 19 (24) | 체력 전원 +3 (+5) | 주인 구역 전원 · 1인 19, 팀워크 +2, 체력 +3 |
| `cd_u_bronte` | 번개 원터치 | 브론테 (피니셔 → 마무리 · 슈팅 ×2) | 30 (38) | — | 마무리 · 1인 30, 슈팅 구역이면 ×2 |
| `cd_u_naelis` | 물길 롱패스 | 나엘리스 (킬패스 → 연결 · 고른 선수 ×1.5) | 20 (25) | — | 연결 · 1인 20, 고른 선수 ×1.5 |
| `cd_u_coni` | 토끼굴 오버래핑 | 코니 (침투 → 자리 옮기기 ×1.3) | 33 (41) | 다음 턴 손패 +1 (+2) | 자리 옮기기 · 1인 33, 옮긴 구역에서 ×1.3, 다음 턴 손패 +1 |
| `cd_u_ondina` | 물살 타기 | 온디나 (볼 운반 → 가로지르기) | 25 (31) | 추가 사용 +1, 주인 체력 −5 (강화: −5 없음) | 가로지르기 · 1인 25, 두 구역 스탯, 추가 사용 +1, 주인 체력 −5 |
| `cd_u_risiel` | 과녁 크로스 | 리시엘 (크로서 → 크로스 · 팀워크 +1) | 28 (35) | — | 크로스 · 1인 28, 슈팅 구역 1명과, 팀워크 +1 |
| `cd_u_camila` | 공중볼 경합 | 카밀라 (타깃맨 → 둘레 중간 원 · 주인 ×1.5) | 20 (25) | 다음 카드 비용 0 (강화: + 주인 체력 +10) | 주인 둘레 중간 원 · 1인 20, 주인 ×1.5, 다음 카드 비용 0 |
| `cd_u_hildi` | 담금질 슈팅 | 힐디 (피니셔 → 마무리 · 슈팅 ×2) | 30 (38) | — | 마무리 · 1인 30, 슈팅 구역이면 ×2 |

- 공통: `family "unique"`, `start false`, `pool false`, `target {kind: "owner"}`, `costRate 0.4`, `mods {}`, `exhaust false`, `ownerCharId`. 비용은 `roundCost(위력 × 0.4)` (데이터에 적지 않는다 — 엔진 계산). `descPlus`는 같은 꼴로 강화 수치. 문구 머리 · 배율 마디는 U3 `effectDesc` · `shapeDesc` 규칙이 그대로 떼어 낸다 (마무리는 남는 말이 없어 쓰는 법 한 줄 "브론테 · 슈팅 구역이면 ×2").
- 리시엘 과녁 크로스는 울리카 크로스와 같은 "슈팅 구역에 받을 선수가 없으면 낼 수 없다" 문제를 그대로 가진다 (§16.4 · §16.14 U2 — 기획자 답 전에는 그대로).
- 덱: 편성 7명의 고유 카드만 들어간다 (지금 규칙). 새 8명을 쓰지 않으면 레슨은 지금과 같다.

### 19.13 저장 이행 (`lessonRun.version` 3 → 4, K3)

- `RUN_VERSION` 3 → **4**, `SAVE_VERSIONS = [1, 2, 3, 4]`, `isLessonRun`은 4만 참. `store.LESSON_RUN_VERSION` · `LESSON_RUN_SAVE_VERSIONS` 사본도 (outgame.test가 비교한다).
- `canMigrateLessonRun(s)`: 4 → 참, **3 → 늘 참** (레슨 · 보상 · 경기 전 준비 중이어도 — 레슨 상태는 고유 스킬을 읽지 않는다), 2 · 1 → 지금 규칙 (2 → 3 → 4로 이어서).
- `migrateLessonRun(s, data)` 3 → 4 (in-place, 멱등):
  1. 선수마다 `charId`로 `data.characters`를 찾아, `innateSkillId`가 그 캐릭터의 `innateSkillId`와 다르면 바꾼다 (**옛 고유 → 새 필살기**). 캐릭터를 찾을 수 없으면 그대로.
  2. 바뀐 옛 스킬은 사라진다 — `learnedSkillIds`에 넣지 않고 SP 보상도 없다 [가정, §19.18 Q6]. 옛 고유는 배울 수 없는 스킬이었으므로 습득 목록 · 힌트에 남은 것이 없다.
  3. `learnedSkillIds`에 새 필살기 id가 있으면 지운다 (방어 — 생길 수 없다).
  4. 로그 한 줄 "저장본 이행: 고유 스킬 → 필살기 (n명)" (n > 0일 때).
  5. `version = 4`.
- **진행 중인 경기 저장본**(`KEYS.match`)은 옮기지 않는다 — 경기 상태가 선수 `skillIds`를 복사해 두어 옛 스킬로 끝까지 진행된다 (옛 스킬 id는 `skills.json`에 남아 있다). E1 때문에 그 경기의 합체기는 등록된 짝만 생긴다.
- **등록 팀 · 도전 모드 저장본**은 그대로 (만들 때 복사한 스냅샷 — §2.2 · GDD #71과 같은 원칙).
- `data` 없이 부르면 v3는 3 그대로 (§18.12 S1과 같은 방식 — `app.js continueRun`은 이미 `data`를 넘긴다).
- rng · 결정성: 이행은 rng를 쓰지 않는다.

### 19.14 UI (1280×720 · 915×412 터치, 스크롤 · 잘림 없음, K4)

**① 편성 화면 (`setup.js` · `lineup.js` · `css/outgame.css`)**

```
├ 상단 바 (그대로) ──────────────────────────────────────────────────────────────────────┤ y 0–58
├ 포메이션 · 배치 (x 16–902, y 66–약 452) ──────────────┬ 코치 6/6 (그대로) ─────────────────┤
│ 필드 (높이 364 → 약 300, 슬롯 카드 3줄 그대로)          │ 전술 지시 (그대로)                   │
│ 공명 줄 + 주장 2명 칩                                   │ 훈련 방침 (그대로)                   │
├ 선수 16명 — 필드 7/7 · 벤치 9 (x 16–1264, y 약 460–708) ────────────────────────────────┤
│ 1줄: 필드 7장 (슬롯 순서) + 벤치 1장                                                      │
│ 2줄: 벤치 8장 (레어도 SSR → SR → R)                                                       │
```

- 선수 풀 = **2줄 × 8장** (카드 약 148 × 112px, 간격 6). 순서: 필드 선수(슬롯 순서) → 벤치(레어도 SSR → SR → R, 같으면 데이터 순서) [구현 결정]. 지금 카드 4줄(이름 · 레어도 · 원소 / 특성 / 적성)에 **필살기 칩** `.lu-ult` "✨ 낙뢰"(등급 색 `.rarity-SSR` 등, title = 종류 · 설명 · 대사)를 특성 칩 옆에 둔다. 둘이 한 줄에 안 들어가면 특성은 아이콘만 보이고 이름은 title로.
- 오른쪽 칸(코치 · 전술 · 방침)은 높이를 줄이지 않는다 — 필드 칸만 줄인다. 1-3-2(MF 3장)도 필드 높이 안에 슬롯이 들어가는지 shot으로 본다.
- 필드 슬롯 카드: 지금 3줄 그대로, title에 필살기.
- 공명 줄: 주장 2명이면 "©️ 주장 2명 — 팀워크 +10은 1명분" (§19.9). 공명은 지금 계산 그대로 보여 준다.
- **선수 고르기 모달** (`openSlotPicker`): `.pick-grid.cols-4` — **4열 × 4줄**, 버튼 `.char-pick` 압축판 (얼굴 sm, 3줄: 이름 · 레어도 · 배지 / 종족 · 원소 · 스타일 · 스탯 합 / 적성 · 특성 · ✨필살기). 모달 높이 ≤ 680 (머리 · 안내 · 그리드 · 슬롯 비우기). 정렬은 지금 그대로 (그 슬롯 적성 순).
- `outgame.test`의 "선수 풀 = 캐릭터 전원" · "벤치 = 캐릭터 − 7" · "모달 = 전원"은 `data.characters.length`를 읽으므로 그대로 통과해야 한다.

**② 미팅 · 경기 전 준비 (`meeting.js` · `prep.js`)** — 7명 그대로. 슬롯 카드 이름 옆 작은 "✨" (등급 색, title = 필살기 이름 · 종류 · 설명). 준비 왼쪽 칸 아래 주장 2명 칩 (있을 때). 레슨 · 주 화면 · 명단 · 외출(7명 중 1명)은 바꾸지 않는다.

**③ 경기 화면 (`screens/match.js` · `css/match.css` · `labels.js`)**

- `L.ULT_TYPE_LABELS`에 `dribble: '필살 드리블'`, `defense: '필살 수비'`, `team: '필살 호령'`.
- 스킬 줄 필살기 버튼의 호환 액션 `ultCompatible(u, action)`: shot = 슛, pass = `u.actions` 안 (없으면 패스 · 크로스), dribble = 드리블, defense = 태클 · 인터셉트 · 버티기, team = 전부. 수비 결정에서도 필살기 버튼이 뜬다 (save는 지금처럼 "GK 세이브에서 자동 발동").
- 버튼 title에 대사 · 등급. 버튼 글자에 등급 칩은 넣지 않는다 (줄이 좁다 — `.skill-row.many`가 이미 칸을 숨긴다).
- 결정 카드 미리보기: dribble `extraLine`은 `outcomesBySkill[ultId]`로 "두 구역 전진" 화살표 (라인 브레이커와 같은 그리기). 팀 필살기를 켜면 기대 %에 ×1.08이 반영된다 (엔진 `expectedPct`).
- 컷인: §19.8. 합체기 이름 카드 그대로.
- `boxComboName` 폴백 제거 (§19.4).
- 역방향 컷인: 필살 드리블이 막히면 "철벽 블록!" (엔진 `reverseCutin.kind block`).
- 정보 줄 · 로그: 팀 필살기 로그 줄. 배급 카드는 `distribution.sure`면 성공 확률 칸 "확정 (대지의 손바닥)", 실패 줄 숨김.
- 토큰 게이지 링은 이제 7명 모두에게 그려진다 (지금 그리기 그대로 — 게이지가 있는 선수만 링). 겹침이 생기면 K4가 링 굵기만 줄인다.

**④ 결과 화면** — 선수 줄 "고유 X" → "필살기 X".

**⑤ 상담 · 수업**: 바뀌는 문구 없음 (패시브 4개 · 액티브 2개가 힌트로 들어올 뿐).

**⑥ 스크린샷 시나리오** (`node tools/shot.mjs`, PNG를 직접 연다)

| 이름 | 장면 | 볼 것 |
|---|---|---|
| `29_ult_defense` | 도르비나 line 2 수비 결정, 필살기 버튼 켬 | 버튼 · 기대 % · 칩 |
| `30_ult_team_cutin` | 아델린 불꽃 호령 R 컷인 | 짧은 띠 · 대사 한 줄 · 잘림 없음 |
| `31_ult_dribble_extra` | 코니 달토끼 도약 결정 (line 0 → 2 화살표) | 두 구역 미리보기 |
| `32_combo_thunder` | 실루엔 → 브론테 풍뢰일섬 이름 카드 | 합체기 이름 · 두 이름 |
| `33_save_sure_dist` | 헤르타 대지의 손바닥 뒤 배급 카드 | "확정" |
| `34_cutin_sr_line` | 온디나 급류 SR 컷인 (상대 쪽 `side-away` 판 1장 더) | 대사 · 방향 |
| `og_setup16` · `og_setup16_132` | 편성 기본 (16명 풀 2줄) · 1-3-2 | 카드 잘림 · 필드 슬롯 |
| `og_setup_pick` | 슬롯 고르기 모달 16명 | 4열 · 스크롤 없음 |
| `og_setup_captain2` | GK 헤르타 + 아델린 | 주장 칩 |
| `og_setup16_touch` | 915×412 편성 | 터치 판 |
| `og_prep_ult` | 경기 전 준비 (새 편성 A) | ✨ · 칩 |
| `og_lesson_u_finish` | 브론테 마무리 조준 (§16.7 — U3에서 주인이 없어 못 찍은 장면) | 주인 빛 · "×2" |
| `og_lesson_u_hand3` · `_hand4` | 새 고유 8장 앞면 (손패 주입 2장면) | 칩 · 아이콘 · 문구 |

- 기존 01 ~ 28 · og_*는 모두 다시 찍는다 (기본 편성 7명 모두 필살기 → 게이지 링 · 스킬 줄 버튼이 는다 — 특히 16 · 17 스킬 줄, 20 · 21 외침, 22 차지).
- `shot.mjs` 잘린 글자 검사에 `.cut-line` · `.lu-ult` · `.char-pick` 줄을 더한다.

### 19.15 테스트

**새 테스트 파일** `test/ultimates.test.mjs` (K1, `package.json` test 목록에서 `v05.test` 다음). 합성 팀(v05의 `team()` · `mk()`와 같은 방식)을 쓰고, 테스트용 필살기는 **데이터 사본**에 넣는다 (K1에서는 `skills.json`이 아직 그대로다):

| 묶음 | 확인 |
|---|---|
| E0 | `ultimateErrors` (종류별 허용 키 · 모르는 키 · 배율 < 1 · `minLine` · `actions` · `tier` · `cutinLine` 길이) / `createMatch`가 잘못된 필살기를 막는다 / `receiverGauge` 기본 = `onReceive` / `minLine 3` 슛은 line 2에서 사유 "박스 슛에서만" · line 3에서 가능 / `headerMult`는 헤더에만 / pass `actions ["cross"]`는 패스에 쓸 수 없다 / pass `extraLine` 도착 = 한 구역 더 · `outcomesBySkill` = 실제 / `sureDistribution`: 세이브 → 배급 `p = 1` · 롱패스 판정 앞뒤 rngState가 같다 · 그다음 배급은 보통 |
| E1 | 등록 안 된 짝: `comboReadyId` null · 게이지 +receiverGauge · 게이지가 차지 않았으면 다음 듀얼에 필살기 불가 / 등록된 짝: 지금 합체기 그대로 (이름 · ×1.2 · 소모 없음) / AI: 등록 안 된 필살기 보유자에게 가는 line 0 → 1 패스는 필살 패스를 쓰지 않음 · 등록 짝이면 씀 · 박스로면 씀 · 한 구역 더 가는 패스면 씀 / `receiverValue` · `boxReceiverValue` · `defaultFromPlan`이 등록 안 된 짝에 합체기 가치를 주지 않음 / `nextShotP` / 외침 ②는 등록 짝만 |
| E2 | 수비 ×defense 칩 · `noMissPenalty` (빗나감 ×1.0) / line 3 · 공격 역할에서 사유 / AI: line 2 수비에서 씀 · line 0 · 1은 남은 > 2면 안 씀 / 사람 `{ action: "tackle", ultimate: true }` · 미리보기 % = 실제 p / 게이지 0 · 이벤트 `cutin` defense |
| E3 | 이번 듀얼 ×teamMult (공격 · 수비 둘 다) · 판정 뒤 `possessionFx` · 그 포제션 다음 듀얼에 붙음 · 포제션이 끝나면 1 / 체력 +teamStamina는 판정 뒤 (판정 때 체력 배율 = 미리보기) / 포제션당 1번 사유 / AI: 지고 있을 때만 (동점 · 앞섬이면 남은 > 2에서 안 씀) / 이번 듀얼에 두 번 곱하지 않음 |
| E4 | 드리블 ×attack · `negateRead` · `noStamina`(성공만) · `extraLine` (line 0 → 2, line 2 → 박스 + 원터치 + 슛 +20%) / 막히면 `reverseCutin.kind block` / A안 성향에 필살 배율이 들어가 드리블이 1위가 되는 픽스처 / 미리보기 = 실제 |
| E5 | `cutin` 이벤트 `line` · `tier` / `ultimateOptions[].tier` · `cutinLine` |
| L46 | 주장 2명 팀의 `teamworkAmp` = 주장 1명 팀 / 주장 0명은 그대로 |
| 공통 | 결정성 (같은 seed → 같은 이벤트 · rngState) · JSON 왕복 · 뷰 · AI · 미리보기가 rngState를 바꾸지 않음 · 7명 모두 필살기(6종 섞음)인 팀 500판 `simulateAuto` 불변식 (게이지 0 ~ 100 · 체력 · 텐션 · p 범위 · NaN 없음) |

**데이터 테스트** (K2 — `ultimates.test`에 더한다): 16명 모두 `innateSkillId` = `kind unique` 필살기 · 서로 다름 / `ultimate.tier` = 주인 캐릭터 `rarity` / §19.2 등급 상한 / §19.10 표 그대로 (id · 종류 · 인자 · 대사) / 합체기 5개 · §19.11 검사 / 옛 고유 6개 `learnable` · 코치 힌트 목록 (§19.12 ③) / 카드 76장 · 고유 16장 · 새 8장 표 (§19.12 ⑥).

**고치는 테스트** (원인 → 고치는 법)

| 파일 | 슬라이스 | 무엇 |
|---|---|---|
| `run.test` | K2 | 832-833 "캐릭터 8명 = `CHAR_TRAITS`" → 16명 표 (새 8명 특성을 더한다). 513 주석("8명 데이터에서는 공명 불가")만 고친다 (기본 편성은 여전히 공명 없음) |
| `match.test` | K2 | 445 · 1140 "울리카 = 라인 브레이커" → 테스트 안에서 그 선수 `skillIds`에 `sk_line_breaker`를 넣는다 (라인 브레이커 동작 검사는 그대로) |
| `layout.test` | K2 | 1066 라인 브레이커 편성 → 같은 방법 (주입) |
| `v05.test` | K1 · K2 | K1: 그대로 통과해야 한다 (합성 팀 · 등록 짝). K2: 실제 스냅샷을 쓰는 테스트 (`a-plan` 90 · `many` 1146 · `box` 1739 · `ace` 1927 · `pen-dist` 2216 · `chips` 2231) 중 7명 모두 필살기가 되어 기대값이 바뀐 것은 **기대값이 데이터에서 나오게** 고친다 (고정 id · 횟수를 박지 않는다) |
| `lessonRun.test` | K2 · K3 | 1414 "`sk_iron_tackle` 수업 불가 (learnable false)" → `sk_boss_strike`(필살기)로. 이행 테스트 v3 → v4 (K3) |
| `cards.test` · `cardEffects.test` · `lesson.test` | K2 | 68 → 76장, 표에 8줄, 퍼즈 76장 |
| `lessonLayout.test` | K2 · K4 | 382 고유 8장 → 16장 표 (새 8장 칩 · 아이콘 · 배율 칩 · 문구 · 비용) |
| `outgame.test` | K3 · K4 | 저장 버전 사본 `[1, 2, 3, 4]`, 편성 2줄 · 모달 4열 · 필살기 칩 · 주장 칩 |
| `ui.smoke` | K2 · K4 | 1119 라인 브레이커 버튼 (울리카) → 주입, 09 · 12 · 13 · 20 (합체기 · 외침) 장면이 데이터에서 나오게, 15주 완주 그대로 |
| `manager.test` | K3 | 새 편성 A 15주 완주 (+ 결정성 · JSON 왕복) |
| `lessonUi.test` | K2 | 힌트 목록이 늘어 시드에 기대던 상태 찾기 (클리어 보상 · 수업 · 상담 패시브)가 빗나가면 찾는 시드 범위만 넓힌다 |
| `challenge.test` | — | 그대로 통과해야 한다 (샘플 팀 · 보스 그대로). 실패하면 원인을 §19.19에 적는다 |

- 슬라이스 사이 규칙: 다음 슬라이스가 고칠 테스트는 `test.skip` + 주석 `k-pending:<슬라이스>`. K5 완료 조건은 `grep -rn "k-pending" test tools` 0건.
- 테스트 수: 332 → K1 새 파일 약 +25, K2 데이터 약 +5, K3 약 +3 (정확한 수는 각 슬라이스가 §19.19에 적는다).

### 19.16 시뮬

**전 값 (이 커밋 = K0 — 엔진 · 데이터는 `78cc0d3`과 같다)**

- 옛 런 경기 (`node tools/sim.mjs --runs 300 --seed 1`, 자동 A안, K0에서 잼): 목표 경기 승률 S1 / S2 / S3 = **80.0 / 59.7 / 38.3%** (전체 53.8%), 골 2.76 / 경기 (우리 1.49 · 상대 1.27), 필살기 / 경기 우리 **1.77** (보유자 2명, 보유자당 0.89) · 상대 보유자당 0.31, 필살 슛 / 패스 / 세이브 1.18 / 0.74 / 0.02, 필살 슛 골 84.2%, 합체기 **0.576** / 경기, 일반 액티브 3.34 / 1.04, 런당 패배 1.22, 평가 중앙값 B.
- 레슨 런 (`npm run lesson-sim` = 방침 5 × 200런 · 경기 포함, §18.12 S3 최종): 경계전 승률 57 / 55 / 56 / 52 / 54% (ace / team / counter / press / poss), ace s1 / s2 / s3 = 83 / 53 / 35%. 이 도구는 경기당 필살기 수를 아직 세지 않는다 → K3가 지표를 더하고 **이 커밋을 `git worktree`로 다시 재서** 전 값을 채운다.
- 도전 모드 (`node tools/challenge_sim.mjs`): K1이 전 값을 재어 §19.19에 적는다.

**지표 추가** (K1 = `sim.mjs`, K3 = `lesson_sim.mjs` · `challenge_sim.mjs`)
- 경기당 필살기 수 (우리 / 상대) — **종류별** (슛 · 패스 · 세이브 · 수비 · 호령 · 드리블), **등급별** (R · SR · SSR), 필살기 성공률 (쓴 듀얼을 이긴 비율), 합체기 수 **이름별**, 경기당 컷인 연출 시간 합 (1x 기준 초 — §19.8 길이표로 계산: 화면이 경기마다 얼마나 멈추나), 팀 필살기 배율이 붙은 듀얼 수, 확정 배급 수.
- `lesson_sim --squad A` (새 편성 A = GK 헤르타 · DF1 나엘리스 · DF2 코니 · MF1 온디나 · MF2 리시엘 · FW1 브론테 · FW2 카밀라, 2-2-2 — 모두 적성 A) · `--squad B` (A의 FW2 = 힐디). 주장 2명 판은 지금 기능 `--slot GK=ch_giant_keeper` (기본 편성 + 헤르타 → 아델린과 주장 2명).

**보고할 것** (수치는 바꾸지 않는다 — 기획자 방침)
- K1 뒤: 옛 런 · 레슨 · 도전 시뮬의 **기존 지표가 전과 같다** (같은 seed — 엔진 수정이 지금 데이터에서는 동작을 바꾸지 않는다는 증거).
- K2 뒤: 옛 런 sim 전 / 후 (기본 편성 7명 모두 필살기), 레슨 sim 전 / 후 (기본 편성), 도전 sim 전 / 후. 예상: 우리 필살기가 경기당 1.8 → 5 ~ 8회, 승률이 크게 오른다 (상대는 보스 2명만 필살기) — **보고만** 하고, 기획자에게 "상대 팀 필살기 · 게이지 수치"를 묻는다 (§19.18 Q4).
- K3 뒤: 레슨 sim 4판 (기본 · 새 편성 A · B · 주장 2명), 새 고유 카드 8장 `--unique-report` (§16.11 표와 같은 꼴).

**고유 카드 보정 (K3, §16.11 규칙 그대로)**: 손잡이 = 카드 `power` · `plus.power`(= round(×1.25))만. 띠 = 모양별 직접 상승 / 장 55 ~ 85, EV / 장 111 ~ 167 (§16.14 U2에서 위력이 원인이 아니라고 밝힌 EV 밑은 그대로 보고), 측정은 새 편성 A · B · 경기 없음 · 방침 5 × 80런. 최대 3번. 피니셔 2장(브론테 · 힐디)은 처음 실측이다.

### 19.17 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건:
- `git branch --show-current` = `outgame-lesson`. main은 건드리지 않고, 푸시하지 않는다.
- `npm test` 통과.
- `git diff --stat 78cc0d3 -- js/engine/rng.js data/config.json js/engine/run.js js/engine/training.js js/ui/layout.js` 비어 있음.
- 엔진 순수 · 결정적 (rng는 `state.rngState`로만, 미리보기 · 뷰 · AI는 rng 없음). UI 문구는 한국어.
- 바뀐 점은 §19.19에 적고, 슬라이스마다 커밋한다 (경로 지정 `git add`, 메시지 끝 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).

**K1 · 경기 엔진 E0 ~ E5 · 주장** (`skills.js` · `match.js` · `ai.js` · `test/ultimates.test.mjs` · `package.json` · `tools/sim.mjs` 지표)
- 할 일: §19.2 검증, §19.3 ~ §19.9의 엔진 부분 (UI 제외). 데이터 파일은 바꾸지 않는다.
- 완료 조건:
  - `ultimates.test` 전부 + 기존 332개가 **테스트 파일을 고치지 않고** 통과.
  - **같은 데이터 같은 결과**: K0과 K1에서 `node tools/sim.mjs --runs 300 --seed 1` · `node tools/lesson_sim.mjs --runs 40 --seed 1` · `node tools/challenge_sim.mjs`의 기존 지표가 같다 (`git worktree`로 K0을 따로 돌려 diff — 새로 더한 줄은 빼고 비교).
  - `node tools/shot.mjs <dir> --only 0,1,2` (경기 01 ~ 28) 검사 통과.

**K2 · 데이터** (`characters.json` · `skills.json` · `combos.json` · `supports.json` · `traits.json` · `cards.json` · 데이터 테스트 · 깨진 테스트 고치기)
- 할 일: §19.12 전부, §19.15 데이터 테스트 · K2 행.
- 완료 조건: `npm test` 통과 (`k-pending:K3|K4` 말고는 skip 없음), `validateUltimates` · `validateCardsData` · `validateShapeData` 통과, 시뮬 전 / 후 보고 (§19.16 K2 뒤 — 옛 런 · 레슨 기본 편성 · 도전), `node tools/shot.mjs` 01 ~ 28 · og 전체를 돌려 **실패 목록만** 적는다 (UI 고치기는 K4 — 단, 엔진 오류로 장면이 만들어지지 않으면 K2가 고친다).

**K3 · 레슨 쪽 · 저장 · 보정** (`lessonRun.js` · `store.js` · 필요하면 `manager.js` · `lesson_sim.mjs` · `challenge_sim.mjs` · `cards.json` 위력 · 테스트)
- 할 일: §19.13 v4 이행, `lesson_sim` `--squad A|B` · 필살기 지표, 새 고유 8장 보정 (§19.16), manager.test 새 편성 A 15주 완주, lessonRun 이행 테스트, outgame 버전 사본.
- 완료 조건: v3 저장본(주 · 상담 · 보상 · 레슨 · 경기 전 준비 중)이 v4로 이어지고 `innateSkillId`가 새 필살기 · 멱등, v1 · v2 → v4, 새 편성 A · B 15주 완주 · 결정성 · JSON 왕복, 보정 표 전 / 후, 레슨 sim 4판 보고.

**K4 · UI** (`screens/match.js` · `css/match.css` · `labels.js` · `setup.js` · `lineup.js` · `meeting.js` · `prep.js` · `result.js` · `css/outgame.css` · `css/lesson.css` · 새 고유 문구가 깨지면 `ui/cards.js` · 시나리오 · `shot.mjs` · UI 테스트)
- 할 일: §19.14 전부 · §19.8 화면 · 새 장면 · 기존 장면 다시 찍기.
- 완료 조건: `node tools/shot.mjs <dir>` **전체** (경기 01 ~ 34 · og 전체) 검사 통과 (스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0 — 17의 스킬 묶음 안쪽 스크롤은 지금처럼 의도), **PNG를 직접 연다** — 최소 29 ~ 34 · `og_setup16` · `_132` · `og_setup_pick` · `og_setup_captain2` · `og_setup16_touch` · `og_prep_ult` · `og_lesson_u_finish` · `og_lesson_u_hand3` · 16 · 17 · 20 · 22. jsdom: 편성 2줄 순서 · 모달 4열 · 필살기 칩 · 주장 칩 · 수비 결정 필살기 버튼 → `decision.ultimate` · 팀 필살기 버튼 (공격 · 수비) · 드리블 필살기 화살표 · 컷인 대사 · R 컷인 클래스.

**K5 · 통합 · 문서**
- 할 일: `tools/lesson_play.mjs` 실제 브라우저 판 — 새 편성 A 시즌 1 (1280×720, `--slot` 7개로 편성 화면에서 실제로 고르기) · 기본 편성 15주 완주 · 915×412 터치 시즌 1 (새 편성 A). 경기 화면은 자동 진행 그대로 (컷인 · 에러 0). 문서: ARCHITECTURE §20 (16명 · 필살기 6종 · E1 ~ E5 · 저장 v4 · 테스트 수 · shot 장수), README (16명 · 필살기 한 줄 · 테스트 수), OUTGAME_LESSON_draft 결정 L44 ~ L46, OUTGAME_CARDS_draft 고유 카드 16장 표, §19.19, 최종 시뮬 전 / 후 (K0 대비).
- 완료 조건: `npm test` · shot 전체 통과, 브라우저 판 입력 실패 · 대상 불일치 · 에러 · 스크롤 0, `grep -rn "k-pending" test tools` 0건, 공통 diff 조건.

순서 의존: K1 → K2 (엔진이 새 종류를 받아야 데이터가 검증을 지난다) → K3 (데이터 위에서 보정 · 이행) → K4 (뷰 계약이 고정된 뒤) → K5. K4는 K2 뒤부터 시작할 수 있지만 고유 카드 문구 확인은 K3 뒤에 한다. 배포(푸시)는 기획자 확인 뒤.

### 19.18 [가정] · [구현 결정] · 기획자가 정할 것

**[가정]**
- §19.10의 필살기 수치 · 대사 · 이름 (새 이름 6개: 만조의 장벽 · 산맥 쐐기 · 불꽃 호령 · 번개 질주 · 초원의 질풍 · 골목 고양이 스텝), 브리프에서 고친 5명 (§19.10 아래 표).
- 등급 상한 정의 (§19.2 — 주 배율 범위 · "추가" 목록).
- 합체기 5개와 새 이름 4개 (풍뢰일섬 · 뇌우 · 하늘 과녁 · 뇌명 유성), 울리카 초원의 질풍은 합체기 없음.
- 컷인 길이 R 0.2 + 0.6초 / SR 0.3 + 0.8초.
- 옛 고유 6개의 SP `cost` · `positions` · 넣을 코치 (§19.12 ②③).
- 새 고유 카드 8장 수치 = 같은 특성 카드 사본, 피니셔 30 (38).
- 이행에서 옛 고유 스킬은 사라지고 보상이 없다.

**[구현 결정]**
- `ultimate.tier` · `cutinLine`을 스킬 데이터에 둔다 (캐릭터 `rarity`가 아니라 — 상대 보스 필살기도 같은 길로 간다). 데이터 테스트가 주인 레어도와 같은지 본다.
- `receiverGauge` 기본 = `onReceive` (바람의 실은 50을 직접 적어 두어 그대로).
- 위치를 바꾸는 필살 인자(`extraLine`)는 `applyUlt`에서 `fx.extraLine`으로 접는다 — 라인 브레이커와 같은 길.
- 팀 필살기: 이번 듀얼은 fx로, 남은 포제션은 판정 뒤 `possessionFx`로 (두 번 곱하지 않음), 체력은 판정 뒤. 팀당 포제션 1번.
- 필살 수비: line ≤ 2 필드 수비만, AI는 line 2.
- 필살 드리블 AI = 드리블을 고르면 준비됐을 때 사용 (필살 슛과 같다).
- AI 필살 패스에 "한 구역 더 가는 패스"를 더했다 (나엘리스).
- 외침(표시 전용)은 shot · pass 필살기만.
- 확정 배급은 롱패스 판정에서 rng를 부르지 않는다.
- 레슨 주장 모양은 카드마다 그대로 (자동으로 겹치는 효과가 아니다).
- 편성 풀 정렬 (필드 → 벤치 레어도 순), 모달 4열.
- 도전 모드 샘플 팀 · 상대 팀 데이터는 그대로.

**기획자가 정할 것**
- **Q1. 헤르타(SSR GK)의 합체기** — 합체기는 "패스 → 받은 선수" 공격 연결이라 GK가 낄 자리가 없다. SSR 조건 "합체기"를 GK에서는 빼도 될지, 아니면 "대지의 손바닥 → 확정 롱패스 → 받은 MF의 필살기" 같은 배급 합체기를 새로 만들지.
- **Q2. 브리프에서 고친 수치** (울리카 ×1.5 · 온디나 · 리시엘 · 카밀라 · 힐디) — 등급 상한을 지키느라 바꿨다. 그대로 둘지.
- **Q3. 레슨의 주장 겹침** — 주장이 두 명이면 각자의 고유 카드(팀워크 +2)를 그대로 낼 수 있게 두었다. "레슨 한 번에 주장 모양 팀워크는 1명분만"처럼 막아야 하는지.
- **Q4. 필살기 빈도 · 상대 팀** — 우리는 7명 모두 필살기, 상대는 보스 2명뿐이다. 승률이 크게 오를 것이다 (K2 보고). 상대 팀에도 필살기를 줄지, 게이지(시작 30 · 듀얼 승 +35)를 등급별로 나눌지는 밸런스 때 한 번에.
- **Q5. 리시엘 과녁 크로스** — 울리카 크로스와 같은 "슈팅 구역이 비면 낼 수 없음" 문제 (§16.4 질문과 함께).
- **Q6. 저장 이행** — 진행 중인 런의 6명이 옛 고유 스킬을 잃는다 (보상 없음). SP로 돌려줄지.

### 19.19 구현 중 바뀐 것

(K1 ~ K5가 채운다.)

#### K1 · 경기 엔진 E0 ~ E5 · 주장 (2026-10-04)

바꾼 파일: `js/engine/skills.js` · `match.js` · `ai.js` · `tools/sim.mjs` · `package.json` · 새 `test/ultimates.test.mjs`. 데이터 파일 · `rng.js` · `config.json` · `run.js` · `training.js` · `layout.js`는 그대로 (`git diff 78cc0d3`에 없음).

**완료 조건 확인**
- `npm test` **356개 통과** (332 + `ultimates.test` 24개). 기존 테스트 파일은 하나도 고치지 않았다.
- **같은 데이터 같은 결과**: K0(`0d33f14`)을 `git worktree`로 따로 돌려 비교 — `node tools/sim.mjs --runs 300 --seed 1` · `node tools/lesson_sim.mjs --runs 40 --seed 1` · `node tools/challenge_sim.mjs`의 기존 지표가 모두 같다 (다른 것은 실행 시간뿐). `sim.mjs`는 표 끝에 새 줄을 더해 열 폭이 넓어졌으므로 공백을 접어서 비교했다.
- `node tools/shot.mjs <dir> --only 0,1,2` — 경기 01 ~ 28 검사 통과 (17의 스킬 묶음 안쪽 스크롤은 원래 의도). 09 · 13 · 20 · 23 PNG를 열어 봤다 — 지금 데이터에서는 화면이 그대로다.

**도전 모드 전 값 (§19.16 — K0 = K1, `node tools/challenge_sim.mjs`, 7팀 × 100판)**: 단계별 전체 승률 1 ~ 10단계 = 95 / 90 / 81 / 65 / 51 / 39 / 34 / 26 / 18 / 10%.
**새 지표의 전 값 (K1, 옛 런 sim 300런 전체 경기)**: 필살기 종류 / 경기 우리 슛 1.03 · 패스 0.74 · 나머지 0, 상대 슛 0.15 · 세이브 0.02, 등급은 모두 "없음"(데이터에 `tier`가 아직 없다), 필살기를 쓴 듀얼 승률 81.9%, 합체기 이름별 바람의 유성 0.576, 컷인 연출 3.6초 / 경기 (1x), 팀 필살기 배율 듀얼 0 · 확정 배급 0.

**계획과 다르게 · 계획에 없던 세부로 정한 것**
1. **`tier` · `cutinLine`은 K1 런타임에서 "있을 때만" 검사한다** — §19.2는 필수 키라고 했지만 K1은 데이터를 바꾸지 않으므로 지금 필살기 4개(`tier` 없음)가 `createMatch`에서 막히면 안 된다. "모든 필살기에 있다"는 K2 데이터 테스트가 본다. 없으면 `cutin` 이벤트 · `ultimateOptions`에 `line` · `tier`가 없다(`ultimateOptions`는 `null`) → 화면은 대사 없이 SSR 길이 (§19.8 옛 저장본 규칙과 같다).
2. **팀 필살기의 포제션 배율은 `possessionFx[side].ultMult`에 따로 둔다** (§19.6은 `teamMult *= teamMult`). 함성(`rally`)이 `teamMult = max(지금, 함성)`으로 쓰기 때문에 같은 칸에 곱하면 함성이 팀 필살기를 지운다 — "함성과는 곱으로 쌓인다"를 지키려고 칸을 나눴다. `computeOdds`가 `teamMult × ultMult`를 곱하고, 결정타 칩은 `teamUlt`(그룹 "팀 판정") 항목. `teamUlt`(skillId) 표시도 같은 객체에 있다. 포제션이 시작되면 `possessionFx`가 통째로 리셋되므로 둘 다 사라진다.
3. **팀 필살기 정보 이벤트** `type "teamUlt"` 문구 = "<팀 이름> 팀 판정 ×1.08 (이번 포제션) · 체력 +15", 판정 비트 이벤트 바로 뒤 (다음 듀얼의 AI 컷인보다 앞). 이벤트에 `skillId` · `teamMult` · `teamStamina`.
4. **`onUltPassReceive`는 더 읽지 않는다** — 받은 선수 게이지는 `ultimate.receiverGauge ?? onReceive` (`receiverGaugeOf`). config 키는 그대로 남겼다 (§19.2 그대로, 기록만).
5. **actions를 적은 필살 패스는 액션 없이 물어도(`action null`) 그 액션을 지금 할 수 있어야 "쓸 수 있음"** — 크로스 전용(리시엘)이 line 0 · 1에서 버튼만 켜지고 호환 액션이 없는 것을 막는다. `actions`가 없는 필살 패스(바람의 실)는 지금 규칙 그대로.
6. **외침 ② (합체기)는 필살 패스를 쓴 계획으로 본다** — 한 구역 더 가는 필살 패스(나엘리스 → 브론테 "뇌우")는 도착이 달라서, 보통 계획(도착 line 2, 낙뢰 `minLine 3`)으로는 외칠 수 없었다. 게이지 외침 ①은 보통 계획 그대로. 지금 데이터에서는 두 계획이 같다.
7. **`ai.decideAttack`**: 패스 · 크로스를 고른 듀얼에서 필살 패스가 아닌 필살기(팀 필살기)도 `aiWantsUltimate`로 판단한다 (전에는 필살 패스만 봤다). AI가 필살 패스 받는 선수를 고를 때 `extraLine`을 접는다 (`match.applyUlt`와 같은 규칙).
8. **④ `boxLinkEval`**: carrier 자기 필살기는 "그 액션과 맞는 종류"(`ultMatchesAction`)면 넣는다 — 팀 필살기도 슛 · 연결의 기대 골에 들어가 AI가 지고 있을 때 ④에서도 쓴다. 필살 슛 · 필살 패스는 지금 그대로.
9. **`nextShotP`(line 2 돌파 · ④ 연결의 다음 슛 기대)**: 이번 듀얼에 쓰는 팀 필살기의 포제션 배율을 다음 박스 슛에 넣는다. 팀 체력 회복은 넣지 않았다 (다음 슛 기대 %에만 쓰이는 근사).
10. **헤더 배율(`headerMult`)** 은 받는 선수 가치(합체기 · 받은 뒤 준비되는 자기 필살 슛)의 센터링 · 크로스 값에도 곱한다 (판정과 같은 규칙).
11. **합체기 배율(×comboBonus)** 은 쓰인 필살기가 이번 액션에 붙을 때(슛 · 패스 actions · 드리블 · 팀) — 받는 쪽(b)이 새 종류인 합체기도 같은 규칙 (§19.11 데이터 테스트가 b = shot · pass · dribble · team을 허용하므로).
12. **`getMatchView.outcomesBySkill` · `receiverPreviewBySkill` · `receiversBySkill`** 에 필살 드리블은 `extraLine`이 없어도 넣는다 (도착 구역이 같아도 맵이 있으면 화면이 "필살기 켬" 미리보기를 같은 길로 그린다).
13. **확정 배급**: `longPassOdds`에 옵션 `dist`(배급 대기 상태)를 더했다 — `resolveDistribution`은 판정 전에 `state.distribution`을 지우므로 지우기 전 사본을 넘긴다. 결과 `{ p: 1, sure: true, sureSkillId }`, 결정타 칩 없음 (`factors []`), 배급 이벤트에 `sure` · `sureSkillId`, 문구 "(확정 — <필살기 이름>)". `view.distribution.sure = { skillId, name }`, `options.long.sure` · `sureName`, 실패 줄 `fail: null`, 문구 "롱패스 확정 (<이름>) — 중원부터". 캐논 킥과 같이 쓰면 확정 + 첫 듀얼 보너스 (AI 캐논 킥 규칙은 그대로).
14. **수비 쪽 필살 배율 칩**: 필살 수비 · 수비 쪽 팀 필살기는 `F("def", "ultimate", …, "필살 ×1.6")` (공격 쪽과 같은 모양). 필살 세이브는 지금처럼 `saveUlt`.
15. **필살기 종류 문구** `match.ULT_TYPE_TEXT`를 export (K4 `labels.ULT_TYPE_LABELS`가 같은 값을 쓴다).
16. **`skills.js` 새 export**: `ULTIMATE_KEYS` · `ULTIMATE_COMMON_KEYS` · `ULTIMATE_TIERS` · `CUTIN_LINE_MAX`(24) · `ultimateErrors` · `validateUltimates`(같은 `skills` 배열은 한 번만 — WeakSet 캐시) · `ultPassActions` · `ultMatchesAction`(종류 ↔ 액션 호환, 엔진 · K4 화면 공용). 불리언 키(`boxShot` · `negateRead` · `extraLine` · `noStamina` · `noMissPenalty` · `sureDistribution`)는 `true / false`만 허용하는 검사를 더했다. `match.js` 새 export: `comboSkillFor`.
17. **`tools/sim.mjs` 지표**: 경기 표 맨 끝에 8줄 (종류별 우리 / 상대, 등급별 우리 / 상대, 필살기를 쓴 듀얼 승률, 합체기 이름별, 컷인 연출 초, 팀 필살기 배율 듀얼 · 확정 배급). 컷인 초 = §19.8 길이표 (첫 필살기 SSR 1.4 · SR 1.1 · R 0.8초, 그 뒤 1.2 · 0.95 · 0.65초, 등급 없음 = SSR, 합체기 = 3.1초). "필살기를 쓴 듀얼" = 판정 이벤트의 `ultimate`(공격) · `defUltimate`(수비), 이김 = 그쪽이 이긴 판정.

#### K2 · 데이터 · 데이터 테스트 · 저장 v4 (2026-10-04)

바꾼 파일: `data/characters.json` · `skills.json` · `combos.json` · `supports.json` · `traits.json` · `cards.json`, `js/engine/lessonRun.js` · `js/ui/store.js` · `js/ui/app.js`(주석) · `js/ui/labels.js`(주장 설명 한 줄), `tools/scenarios.mjs`(12 prefer 한 줄), 테스트 12개 파일. `rng.js` · `config.json` · `run.js` · `training.js` · `layout.js`는 그대로 (`git diff 78cc0d3`에 없음).

**완료 조건 확인**
- `npm test` **363개 통과** (K1 356 + K2 7: `ultimates.test` 실제 데이터 6개 · `lessonRun.test` v3 → v4 이행 1개), skip 0 (`k-pending` 없음).
- `validateUltimates`(실제 데이터, 데이터 테스트) · `validateCardsData` · `validateShapeData`(`createRun`이 부른다) 통과.
- `node tools/shot.mjs <dir>` 전체 142장: 경기 01 ~ 28 모두 통과. **걸린 것 3장 (K4)**: `og_reward_perfect` · `og_reward_perfect_16` (모달 안쪽 스크롤 +13px) · `og_reward_perfect_32` (+32px). 원인 = 퍼펙트 보상 칩 줄이 두 줄이 됨 — 한나 힌트 목록에 `지치지 않는 다리`가 붙어 이 시드의 힌트가 "마지막 힘 Lv1" → "지치지 않는 다리 Lv1"(더 긴 이름)로 바뀌었다. K1 워크트리에서는 같은 장면이 통과한다. 데이터 문제가 아니라 칩 줄 높이 문제라 K4가 고친다. PNG는 12 · 13 · 17 · og_reward_perfect를 열어 봤다 (기본 편성 7명 모두 게이지 링이 그려진다 — K4 몫).

**계획과 다르게 · 계획에 없던 세부로 정한 것**
1. **철의 태클 · 라인 브레이커 `positions`는 `null` 그대로** (§19.12 ②는 `["DF","MF"]` · `["FW","MF"]`). 경기 엔진이 액티브의 포지션 조건을 검사하므로("포지션 조건 불충족"), 라인 브레이커를 DF 자리에서 쓰는 기존 장면 · 테스트(1-3-2 울리카 DF1 · v05 DF1 · layout 아델린 DF1)가 깨진다. 옛 고유일 때도 제한이 없었다. 수업은 누구나 받을 수 있다 (패시브 2개 밀물의 벽 `["GK"]` · 고양이 페인트 `["FW","MF"]`는 계획대로).
2. **레슨 저장 v3 → v4 이행을 K2에서 했다** (§19.13은 K3) — K2 작업 지시에 들어 있었다. `RUN_VERSION 4` · `SAVE_VERSIONS [1,2,3,4]` · `canMigrateLessonRun` 3 → 늘 참 · `migrateV3toV4`(선수마다 캐릭터 `innateSkillId`로, 습득 목록의 새 필살기 id는 지움, 캐릭터를 모르면 그대로, 로그 "저장본 이행: 고유 스킬 → 필살기 (n명)", rng 없음) · `data` 없으면 3 그대로 · store 사본 · app 주석. 테스트: 주 · 상담 · 레슨 · 보상 · 경기 전 준비 중 v3 → v4, 멱등, 이행 뒤 경기 설정 스킬 = 새 필살기. K3는 이 부분을 건너뛴다.
3. **필살기 `description`**: 계획의 예시 머리(필살 슛 · 필살 패스 · 필살 세이브 · 필살 수비 · **팀 필살기** · 필살 드리블)에 쓸 수 있는 곳을 괄호로 붙였다 — 산맥 쐐기 "(필드 수비에서만)", 불꽃 호령 "(포제션당 1번)", 심해 물길 "(크로스에는 못 씀)", 뇌전 화살 "(크로스에서만)", 박스 슛 필살기 3개 "박스 슛에서만". 데이터 테스트가 머리를 확인한다.
4. **새 필살기 14개의 자리** = `skills.json`에서 `sk_boss_save` 바로 뒤 (배울 수 있는 스킬 앞). `tier` · `cutinLine`은 `ultimate` 끝에 붙였다.
5. **`labels.js` 주장 설명**도 "(주장이 여럿이어도 1명분)" (§19.9 — 파일 지도는 K4지만 L46 문구라 같이).
6. **`tools/scenarios.mjs` 12_ult_pass `prefer`**: "받는 선수 기본값이 필살기 보유" → "등록된 합체기 짝" (16명 모두 필살기라 울리카 초원의 질풍 장면이 먼저 잡혀 `ui.smoke`의 합체기 외침 검사가 깨졌다).
7. **레슨 퍼즈 (`lesson.test`)**: 덱 = 고유가 아닌 카드 전부 + 그 편성 주인의 고유 카드 2장씩, 편성은 기본 · 미르카 · 새 편성 A · B 중 무작위 (주인이 없는 고유 9장을 손패에 섞으면 방침마다 "한 번도 내지 않은 카드"가 생겼다). 시드 · 레슨 수(500)는 그대로.
8. **고친 테스트** (기대값만 — 동작 검사는 그대로): `cards.test` 76장 · 고유 16 · 변환표 · 남긴 효과 표 +8줄 / `cardEffects.test` 76장 · 새 8장 기본 · 강화판 16케이스 (주인을 같은 특성 선수 자리에 넣은 편성) / `lessonLayout.test` 고유 16장 칩 · 아이콘 · 배율 칩 · 문구 표 (피니셔 2장 = "마무리" · "슈팅 ×2" · 남는 말 없음) / `lessonRun.test` 퍼펙트 힌트 2 = 패시브 힌트 + 코치 수업, 수비 · 퍼펙트 보상에서 수업 받지 않기 뒤 진행, `canTeachSkill` learnable false 예 = `sk_boss_strike` (+ 철의 태클은 이제 수업 가능), 버전 4 / `match.test` · `layout.test` 라인 브레이커를 울리카 습득 스킬로 주입 / `run.test` `CHAR_TRAITS` 16명 · 공명 주석 / `ultimates.test` E5 옛 필살기 검사는 `tier` · `cutinLine`을 지운 데이터 사본으로 / `outgame.test` · `ui.smoke` 저장 버전 4. `v05.test` · `challenge.test`는 고치지 않고 통과.

**시뮬 전 / 후** (전 = K1 `c782bae` 워크트리, 후 = K2. 밸런스는 바꾸지 않았다 — 보고만)

옛 런 `node tools/sim.mjs --runs 300 --seed 1` (기본 편성, 열 = 전체 경기 / S1 / S2 / S3 목표 경기)

| 지표 | 전 (K1) | 후 (K2) |
|---|---|---|
| 목표 경기 승률 S1 / S2 / S3 (전체) | 80.0 / 59.7 / 38.3% (53.8%) | **77.0 / 56.7 / 36.7%** (51.5%) |
| 런당 패배 | 1.22 | 1.30 |
| 필살기 / 경기 우리 (보유자 수) | 1.77 (2.0) | **3.12 (6.8)** · S1 3.12 · S2 3.44 · S3 3.74 |
| 필살기 / 보유자 · 경기 | 0.89 | 0.45 |
| 등급별 / 경기 우리 R · SR · SSR (전체 경기) | — · — · — (없음 1.77) | **0.11 · 1.13 · 1.88** |
| 등급별 목표 경기 S1 / S2 / S3 | — | 0.06·0.97·2.09 / 0.15·1.27·2.02 / 0.12·1.41·2.20 |
| 종류별 / 경기 우리 슛 · 패 · 세 · 수 · 호 · 드 | 1.03 · 0.74 · 0 · 0 · 0 · 0 | 1.15 · 1.38 · 0.08 · 0.40 · 0.07 · 0.04 |
| 합체기 / 경기 (이름별) | 0.576 (바람의 유성) | 0.571 (바람의 유성 — 기본 편성에는 새 짝이 없다) |
| 일반 액티브 / 경기 우리 | 3.34 | **0.11** (철의 태클 · 라인 브레이커가 고유에서 빠졌다) |
| 필살기 쓴 듀얼 승률 | 81.9% | 76.1% |
| 컷인 연출 초 / 경기 (1x) | 3.6 | 4.9 |
| 골 / 경기 (우리 / 상대) | 2.76 (1.49 / 1.27) | 2.98 (1.57 / 1.41) |

- 예상(§19.16 "필살기 5 ~ 8회, 승률이 크게 오른다")과 달리 **승률이 3%p 정도 내려갔다**: 기본 편성 6명이 잃은 옛 고유(액티브 2개 경기당 약 3.2회 · 밀물의 벽 세이브 +15% · 주장의 외침 · 지치지 않는 다리)가 새 필살기(R 2명 합쳐 경기당 0.11회)보다 컸다. R 필살기는 AI가 거의 쓰지 않는다 — 불꽃 호령은 지고 있을 때만(0.07), 번개 질주는 드리블을 고를 때만(0.04). 옛 고유 6개는 이제 옛 런 상점에도 나온다 (습득 0.90 → 0.85).
- 같은 도구로 새 편성 (`--set defaultSquad.slots.*`, 후만): **새 편성 A** (헤르타 · 나엘리스 · 코니 · 온디나 · 리시엘 · 브론테 · 카밀라) 목표 경기 71.3 / 29.3 / 37.3%, 필살기 / 경기 1.97 (R 0.08 · SR 0.82 · SSR 1.07), 합체기 0.028 (하늘 과녁 0.027 · 뇌우 0.001), 확정 배급 0.023. **새 편성 B** (A의 FW2 = 힐디) 72.0 / 27.3 / 33.0%, 필살기 1.96, 합체기 0.001 (뇌우). **기본 + FW1 브론테** 82.3 / 57.3 / 46.0%, 필살기 2.94 (SSR 2.35), 합체기 0.560 (바람의 유성 0.550 · 풍뢰일섬 0.010).

레슨 런 `node tools/lesson_sim.mjs --runs 200 --seed 1` (기본 편성 · 방침 ace / team / counter / press / poss — 이 도구는 필살기를 아직 세지 않는다, K3)

| 지표 | 전 (K1) | 후 (K2) |
|---|---|---|
| 경계전 승률 (전체) | 57 / 55 / 56 / 52 / 54% | 58 / 58 / 54 / 52 / 56% |
| ace s1 / s2 / s3 | 83 / 53 / 35% | 83 / 54 / 37% |
| 힌트 수 / 런 | 7.5 ~ 7.6 | 8.3 ~ 8.7 |
| 수업 / 런 · 선수당 액티브 | 10.9 ~ 11.3 · 1.53 ~ 1.58 | 9.8 ~ 10.3 · 1.37 ~ 1.44 |
| 평가 점수 | 582 ~ 588 | 571 ~ 579 |

도전 모드 `node tools/challenge_sim.mjs` (7팀 × 100판, 전체 승률 1 ~ 10단계): 전 95 / 90 / 81 / 65 / 51 / 39 / 34 / 26 / 18 / 10% → 후 **94 / 88 / 79 / 62 / 50 / 36 / 31 / 23 / 17 / 11%**. 샘플 팀(고정 스냅샷 — 옛 고유 그대로)은 같고, 완주 팀 6개가 조금 내려갔다.

**K3 · K4에 넘기는 것**
- K3: 저장 v4는 끝났다 (위 2번). 남은 것 = `lesson_sim` `--squad A|B` · 필살기 지표 · 새 고유 8장 보정 · manager.test 새 편성 A 15주 완주.
- K4: `og_reward_perfect` 3장 칩 줄 높이, 게이지 링 7명 · 스킬 줄 필살기 버튼 (17번 장면에 이미 "바람의 실" 버튼 · 링이 보인다).
- 기획자 질문 (§19.18 Q4에 더함): 기본 편성은 옛 고유 액티브를 잃어 오히려 약해졌다. R 필살기 사용 빈도(경기당 0.1회 아래)와 상대 팀 필살기를 밸런스 때 같이 본다.

#### K3 · 아웃게임 UI — 편성 16명 · 미팅 · 경기 전 준비 · 새 고유 카드 앞면 · 상담 (2026-10-04)

이 슬라이스는 오케스트레이터가 정한 순서로 **§19.14 ① ② ④ ⑤ (아웃게임 화면)** 를 먼저 했다. §19.17의 원래 K3 할 일(`lesson_sim --squad A|B` · 필살기 지표 · 새 고유 8장 보정 · manager.test 새 편성 A 15주 완주)과 §19.14 ③ 경기 화면 · 경기 장면 29 ~ 34는 다음 슬라이스로 넘긴다. 저장 v4는 K2에서 끝났다.

바꾼 파일: `js/ui/screens/setup.js` · `js/ui/lineup.js` · `js/ui/meeting.js` · `js/ui/screens/prep.js` · `js/ui/screens/result.js` · `js/ui/screens/reward.js` · `js/ui/labels.js` · `css/outgame.css` · `css/lesson.css` · `tools/shot.mjs` · `tools/scenarios.mjs` · `tools/lesson_scenarios.mjs` · `test/lineup.test.mjs` · `test/outgame.test.mjs`. 엔진 · 데이터 · `rng.js` · `config.json` · `run.js` · `training.js` · `layout.js`는 그대로.

**한 것**
- **편성 선수 풀 2줄 × 8장** (`.setup-pool .lu-pool` = `repeat(8, …)`, 가로 스크롤 없음). 순서 = 순수 함수 `lineup.poolOrder(ids, slots, assign, rarityOf)`: 필드 선수(슬롯 순서) → 벤치(레어도 SSR → SR → R, 같으면 데이터 순서). 끌어 놓을 때마다 다시 정렬된다.
- 풀 카드 4줄 (얼굴 xs · 이름 · 자리 / 레어도 · 원소 · 스타일 / **특성 아이콘 + 필살기 칩** `.lu-ult` "✨ 낙뢰" / 적성 4칸). 칩 바탕 = 등급 색 (`tier-SSR|SR|R`), title = 이름 · 종류 · 등급 · 설명 · 대사 (`labels.ultimateInfo`).
- 슬롯 카드 (편성 · 미팅 · 경기 전 준비): 이름 옆 작은 ✨ `.ult-mark` (등급 색 바탕, title), 슬롯 카드 title 끝에 필살기 줄 (`lineupBoard({ titleOf })`).
- **선수 고르기 모달 4열 × 4줄** (`.modal-xl.setup-pick` · `.pick-grid.cols-4` · `.char-pick.compact`): 이름 · 레어도 · 배지 / 종족 · 원소 · 스타일 · 스탯 합 / 적성 4 / 특성 · ✨필살기. 16명이 스크롤 없이 보인다.
- **주장 2명 칩** (L46): 편성 공명 줄 · 경기 전 준비 왼쪽 칸에 "©️ 주장 2명 — 팀워크 +10은 1명분" (`labels.captainCount` · `captainNote`, 수치는 `traits.json` params).
- 결과 화면 선수 줄 "고유 X" → **"필살기 X"** (필살기가 아닌 옛 고유만 "고유 X").
- 상담: 문구는 그대로 (§19.14 ⑤). 옛 고유 패시브 4개(밀물의 벽 GK만 · 주장의 외침 · 지치지 않는 다리 · 고양이 페인트 FW·MF)가 패시브 줄에 그대로 나오고, 배울 선수 목록이 포지션 제한을 따른다 — 새 장면 `og_consult_old_innate`로 확인했다.
- 주 화면 · 레슨 명단 · 외출 · 미팅의 선수 수(7명)는 그대로.

**바뀐 것 (계획과 다름)**
- **훈련 방침 패널을 전술 패널 안 아래 칸으로 합쳤다** (`.setup-tactics` 안 `.setup-policy` — 구분선 + 작은 머리 "훈련 방침 · 경기 전술 아님"). §19.14 ①은 "오른쪽 칸 높이를 줄이지 않는다"였지만, 그 그림의 좌표(오른쪽 칸 y 66 ~ 452)와 실제 높이(코치 · 전술 · 방침 459px)가 맞지 않았다. 풀 2줄(≈ 240px)이 들어가면 코치 칩이 안쪽 스크롤되어(+77px), 방침을 합치고 코치 칩 34 → 29px · 전술 선택 30 → 28px · 화면 간격 12 → 10px로 조였다. 코치 8장 · 전술 4 · 방침 5버튼 · 설명 줄은 모두 스크롤 없이 보인다. 테스트 선택자(`.setup-policy .policy-row` · `.policy-desc` · `.setup-tactics .tac-row select` 4개)는 그대로다.
- 풀 카드의 특성은 **늘 아이콘만** (이름 · 설명은 title). 계획은 "한 줄에 안 들어가면"이었지만 148px 카드에서는 필살기 이름(최대 "골목 고양이 스텝")과 특성 이름이 함께 들어가지 않는다.
- 고르기 모달은 `modal-lg`(880px) 대신 `modal-xl`(1120px) — 4열이 들어가게. 배지 "MF2 ⇄ 맞바꾸기" → "⇄ MF2", 특성 설명 문구는 title로.
- 편성 슬롯 카드에도 ✨ (계획은 title만) — 미팅 · 준비와 같은 모양.
- `labels.ULT_TYPE_LABELS`에 `dribble` · `defense` · `team`을 더했다 (§19.14 ③ 항목 — 칩 title이 쓴다, `match.ULT_TYPE_TEXT`와 같은 글).
- **보상 칩 줄 (K2가 남긴 `og_reward_perfect` · `_16` · `_32` 실패)**: 유대가 3명 이상 오르면 한 칩 "유대 하르나 +5 · 한나 +5 · 루미 +5"로 묶는다 (→ 값은 title). 긴 힌트 이름("지치지 않는 다리 Lv1")이 들어와도 한 줄.
- `tools/shot.mjs`: 조작 단계 `{ select: { sel, value } }` (포메이션 바꾸기), 잘린 글자 검사에 `.lu-card-nm` · `.lu-ult` · `.lu-ult-nm` · `.slot-card .slot-nm` · `.char-pick.compact` 줄 · `.cap-note`.
- 새 장면: `og_setup16` (기본 편성에서 벤치 카드 7장을 끌어 새 편성 A — 벤치 = 옛 8명 + 힐디, 계획의 "편성 기본"은 `og_setup`이 그대로 찍는다) · `og_setup16_132` · `og_setup_pick` · `og_setup_captain2` (헤르타를 GK에 끌어 놓기) · `og_setup16_touch` (915×412) · `og_prep_ult` (새 편성 A) · `og_prep_captain2` (더함 — 기본 + GK 헤르타) · `og_lesson_u_hand3` (헤르타 · 브론테 · 나엘리스 · 코니) · `og_lesson_u_hand4` (온디나 · 리시엘 · 카밀라 · 힐디, FW1 힐디 편성) · `og_lesson_u_finish` (브론테 마무리 조준: 주인 빛 · "+100 ×2") · `og_consult_old_innate` (더함).

**테스트**: 365개 통과 (K2 363 + `lineup.test` 2: `poolOrder` 순서 · 빈 슬롯 · 모르는 id / 기본 편성에서 보드 이동만으로 새 편성 A · B → 모두 적성 A · `validateSquad` · `createRun` 통과 · 벤치 순서). `outgame.test` jsdom에 더한 것: 풀 순서(기본 · 헤르타 GK 뒤) · 카드마다 필살기 칩(이름 · 등급 색 · 대사 title) · 특성 아이콘 title · 슬롯 ✨ 7 · 모달 4열 압축판 4줄 · 헤르타 GK → 주장 칩 → 네리아로 되돌리면 사라짐 · 미팅 ✨ 7 · 준비 ✨ 7 (등급 = 필살기 tier) · 준비 주장 2명 칩 (`og_prep_captain2` 주입) · 새 편성 A 준비 SSR ✨ = GK · FW1 · 결과 "필살기 X".

**스크린샷**: `node tools/shot.mjs <dir>` **전체 153장** (경기 01 ~ 28 · og 전체, 새 og 12장 포함) 검사 통과 — 스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0. K2가 남긴 `og_reward_perfect` · `_16` · `_32` 실패도 없어졌다. 열어 본 PNG: `og_setup` · `og_setup16` · `og_setup16_132` · `og_setup_pick` · `og_setup_captain2` · `og_setup16_touch` · `og_setup_drag` · `og_meeting` · `og_prep` · `og_prep_ult` · `og_prep_captain2` · `og_lesson_u_hand3` · `og_lesson_u_hand4` · `og_lesson_u_finish` · `og_consult_full` · `og_consult_passive` · `og_consult_old_innate` · `og_reward_perfect` · `og_reward_perfect_32` · `og_result`.

**다음 슬라이스에 넘기는 것**: §19.14 ③ 경기 화면 (새 종류 버튼 · 호환 액션 · 등급별 컷인 · 대사 · `boxComboName` 폴백 제거 · 역방향 컷인 "철벽 블록!" · 확정 배급 카드) · 경기 장면 29 ~ 34 · §19.17 원래 K3 (`lesson_sim --squad A|B` · 필살기 지표 · 새 고유 8장 보정 · manager.test 새 편성 A 15주). 새 고유 8장 수치를 바꾸면 `og_lesson_u_hand3` · `_hand4` 앞면 문구를 다시 본다.

#### K4 · 경기 화면 — 새 필살기 종류 · 등급별 컷인 · 대사 · 합체기 이름 · 확정 배급 · 장면 29 ~ 34 (2026-10-04)

이 슬라이스는 §19.14 ③ (경기 화면)과 경기 장면 29 ~ 34를 했다. K3가 §19.14 ① ② ④ ⑤를 먼저 했고, §19.17의 원래 K3 할 일(`lesson_sim --squad A|B` · 필살기 지표 · 새 고유 8장 보정 · manager.test 새 편성 A 15주)은 아직 남아 있다.

바꾼 파일: `js/ui/screens/match.js` · `css/match.css` · `tools/scenarios.mjs` · `tools/lesson_scenarios.mjs` · `tools/shot.mjs` · `test/ui.smoke.test.mjs`. 엔진 · 데이터 · `labels.js`(K3가 `ULT_TYPE_LABELS` 6종을 이미 넣었다) · `rng.js` · `config.json` · `run.js` · `training.js` · `layout.js`는 그대로.

**한 것**
- **스킬 줄 필살기 버튼**: 공격 · 수비 결정 모두 (엔진 `ultimateOptions` 그대로). 클래스 `.ult-btn.ut-<type>`, `data-type` · `data-tier`, title = "종류 이름 (등급)" · 설명 · “대사”. 호환 액션 `ultCompatible` = 엔진 `skills.ultMatchesAction`과 같은 규칙 (슛 = 슛, 패스 = `ultimate.actions` 안 — 없으면 패스 · 크로스, 드리블 = 드리블, 수비 = 태클 · 인터셉트 · 버티기, 호령 = 전부). 켜면 호환 액션 카드만 켜지고 % = 엔진 `expectedPct`.
- **컷인 (E5 · §19.8)**: 작은 줄 "이름 · [종류 칩]" (`.cut-type.ut-<type>` — 슛 주황 · 패스 초록 · 세이브 하늘 · 드리블 노랑 · 수비 강철 · 호령 금), 큰 이름, **대사 한 줄** `.cut-line` “…” (16px · 흰색 85% · 한 줄 말줄임, 이벤트 `line`이 있을 때만). 등급 클래스 `.tier-R` (띠 위아래 14px · 얼굴 64 · 이름 26px) · `.tier-SR` (얼굴 76 · 이름 30px) · SSR = 지금 그대로. **길이** `CUT_TIER` = 계획 표 그대로 (R 0.2 + 0.6 / 0.15 + 0.5초, SR 0.3 + 0.8 / 0.25 + 0.7초, SSR 0.4 + 1.0 / 0.3 + 0.9초). 이벤트에 `tier` · `line`이 없으면(옛 저장본) 대사 없이 SSR 길이.
- **합체기**: 이름 카드 · 길이 그대로. 두 컷인 카드에도 대사 (받은 선수 = 그 `cutin` 이벤트의 `line`, 패스한 선수 = 스킬 데이터 `cutinLine` — 받은 선수 이벤트에 `line`이 있을 때만).
- **`boxComboName` 폴백 제거** (§19.4): ④ 박스 연결 + 필살 패스의 합체기 표시는 `combos.json`에 등록된 짝일 때만 (`|| '합체기'` → `|| null`).
- **필살 드리블 한 구역 더**: 드리블 미리보기 화살표가 엔진 outcome `success.step`까지 늘어나고 끝 글자 "<구역> · 두 구역 전진" (라인 브레이커 드리블도 같은 그리기).
- **확정 배급**: 롱패스 카드 % 칸 "확정", 실패 줄 "실패 없음 (확정)", 힌트 "대지의 손바닥 — 판정 없이 성공", title "롱패스 → ○○ 확정 (대지의 손바닥)", 정보 줄 "롱패스 확정 (대지의 손바닥)", 화살표 끝 글자 "→ 중원 · 확정", 결과 한 줄 "확정 롱패스".
- 역방향 컷인 "철벽 블록!" — 엔진 `reverseCutin.kind block`을 그대로 그린다 (필살 드리블이 막혀도, 작은 줄 "… 급류 봉쇄").
- 팀 필살기 로그 줄 `.ev-teamUlt` (금색), 결과 한 줄 "○○ 필살 태클!" (필살 수비로 막았을 때만 — 수비 쪽 팀 필살기는 "필살" 없음).
- 4x 배속에서도 R 짧은 컷인이 바닥에 걸리지 않게 `CUT_MIN` 60 · 170ms → 30 · 120ms.

**장면** (`tools/scenarios.mjs`, 새 옵션 3개: `slots` = 기본 편성의 자리 바꾸기 (`prepareLessonMatch`까지), `adjustMatch(ms)` = 경기를 만든 직후 상태 주입, `drive(ms)` = 탐색 중 사람 결정을 대신 고르기. 모두 결정적. `shot.mjs` `{ press, waitMs }`는 함수도 받는다)

| 이름 | 장면 |
|---|---|
| `29_ult_defense` | 기본 편성, 상대 line 2 수비 결정, 도르비나 산맥 쐐기 토글 + 태클 hover |
| `30_ult_team_cutin` | 아델린 불꽃 호령 토글 + 패스 480ms 뒤 R 컷인 (전술 `kickoffPlayerId` = 아델린, 경기 시작 게이지 100) |
| `31_ult_dribble_extra` | DF1 코니, 달토끼 도약 토글 + 드리블 hover (화살표 ① → ③), 킥오프 선수 = 코니 |
| `32_combo_thunder` | FW1 브론테, 풍뢰일섬 슛 2.8초 뒤 이름 카드 (`drive`: 실루엔 ② 드리블 → ③ 바람의 실 패스 → 브론테) |
| `33_save_sure_dist` | GK 헤르타 (경기 시작 게이지 100), 대지의 손바닥 세이브 뒤 배급 결정 · 롱패스 hover |
| `34_cutin_sr_line` | MF1 온디나 (실루엔 자리), 급류 토글 + 드리블 650ms 뒤 SR 컷인 |
| `34_cutin_sr_line_away` | 상대 MF에 급류 주입, 우리 결정 뒤 상대 AI가 커밋한 SR 컷인 (`.side-away`) — 누를 액션 · 대기 시간을 장면 상태에서 계산 |

**바뀐 것 (계획과 다름)**
1. **확정 배급 카드의 % 칸은 "확정"만**, 필살기 이름은 힌트 줄 · title · 정보 줄에 (계획은 % 칸 "확정 (대지의 손바닥)"). 카드 제목 줄을 받는 선수 이름과 나눠 써서 "→ 실루엔"이 "→ 실"로 잘렸다. **실패 줄은 숨기지 않고** "실패 없음 (확정)" — 짧은 패스 카드의 "실패 없음"과 같은 모양 (숨기면 빈 줄이 생겼다).
2. **장면 30 · 31 · 34의 선수 자리**: 듀얼 당사자는 엔진 `pickStarter` (line 0 = 패스가 가장 높은 DF, line 1 = 드리블 + 패스가 가장 높은 MF) · `pickDefender` (수비가 가장 높은 선수)가 고른다. 그래서 기본 편성에서 아델린(DF2) · 타리아(MF2)는 **거의 듀얼에 나오지 않는다** (기본 편성 친선 50판: 공격 당사자 = 도르비나 · 실루엔 · 울리카 · 그레타, 수비 = 도르비나 · 실루엔 · 그레타 · 네리아. 타리아 게이지는 시작 30에서 오르지 않았다). 장면은 킥오프 선수 전술(`kickoffPlayerId`) · 자리 바꾸기로 만들었다. → **기획자 질문 (Q4에 더함)**: K2가 본 "R 필살기 거의 안 씀"의 큰 이유가 이것이다 — 각 줄 둘째 선수의 필살기는 그 선수가 듀얼에 나와야 쓸 수 있다.
3. 장면 33은 GK 게이지를 경기 시작 때 100으로 넣었다 (`adjustMatch`) — GK는 듀얼 승이 드물어 400판 안에 대지의 손바닥이 한 번도 나오지 않았다. 장면 32는 우리 AI가 실루엔 ③ 박스 패스를 거의 하지 않아 `drive`로 결정을 대신했다.
4. 34의 상대 쪽 판은 `34_cutin_sr_line_away`로 따로 (계획 "1장 더"). 상대 팀에 온디나가 없어 상대 MF에 급류를 주입했다 (컷인 이름은 그 상대 선수).
5. `shot.mjs` 잘린 글자 검사에 `.m-cutin .cut-line` · `.cut-txt b` · `.cut-txt small` · `.dist-btn .act-rname`. 계획의 `.lu-ult` · `.char-pick`은 K3가 이미 넣었다.
6. 토큰 게이지 링 굵기는 바꾸지 않았다 — 7명 모두 링이 그려져도 16 · 17 · 20 · 21 · 22 장면에서 겹침이 보이지 않았다.

**테스트**: 365개 통과 (`ui.smoke` 한 테스트 안에 장면 29 ~ 34 검사 추가 — 그래서 수는 그대로): 수비 결정 필살기 버튼 → 수비 3종 켜짐 · 기대 % = 엔진 · 결정 `{ tackle, ultimate: true }` · SR 수비 컷인 / 수비 결정 팀 필살기 버튼 (막는 선수 스킬을 불꽃 호령으로 바꿔서) → `{ intercept, ultimate: true }` / 공격 팀 필살기 → 켜진 액션 전부 · R 컷인 `.tier-R.ut-team` · 종류 칩 "필살 호령" · 대사 · 로그 줄 "팀 판정 ×1.08" / 필살 드리블 → 드리블만 · 화살표가 더 멀리 · "두 구역 전진" / 풍뢰일섬 버튼 · 이름 카드 "실루엔 → 브론테" / 확정 배급 카드 · 정보 줄 / SR 컷인 `.tier-SR` · 대사 / 필살 드리블이 막히면 "철벽 블록!" · "급류 봉쇄".

**스크린샷**: `node tools/shot.mjs <dir>` **전체 160장** (경기 01 ~ 34 · 34_away · og 전체) 검사 통과 — 스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0. 열어 본 PNG: 29 · 30 · 31 · 32 · 33 · 34 · 34_away · 13 · 17 · 20 · 21 · 22.

#### K5 · 통합 · 문서 · 최종 시뮬 (2026-10-04)

바꾼 파일: `tools/lesson_play.mjs` (`--watch-match`), `docs/ARCHITECTURE.md` (§20 머리 단락 · §20.2 "경기 쪽 파일" 줄 · 카드 76장 · shot 160장 · 테스트 365 · **새 §20.7**), `README.md`, `docs/OUTGAME_LESSON_draft.md` (결정 L44 ~ L46 · 범위 줄 예외), `docs/OUTGAME_CARDS_draft.md` (§3 제목 · 피니셔 주인 · **§3.3 새 8장 표** · §8 카드 수 76), `docs/OUTGAME_CONTENT_draft.md` (§0.5 캐릭터 설정 +8줄 · 안내 한 줄), 이 절. 엔진 · 데이터 · UI 코드는 바꾸지 않았다.

**완료 조건 확인**
- `npm test` **365개 통과** (skip 0). `grep -rn "k-pending" test tools` 0건.
- `git diff --stat 78cc0d3 -- js/engine/rng.js data/config.json js/engine/run.js js/engine/training.js js/ui/layout.js` 비어 있음. `config.json`은 그대로다.
- `node tools/shot.mjs <dir>` **전체 160장 (경기 01 ~ 34 · 34_away · og 전체) 검사 통과** — 스크롤 · 잘린 글자 · 겹침 · 상태 · 에러 0. 열어 본 PNG: 17 · 30 · 32 · 33 · `og_setup16_touch` · `og_lesson_u_finish` (+ 아래 브라우저 판 PNG).
- **실제 브라우저 판** (`tools/lesson_play.mjs`, 헤드리스 Chrome · 실제 입력) — 모두 "점검 통과" (입력 실패 · actions 대신 · 대상 불일치 · 에러 토스트 · 페이지 에러 · 스크롤 0):

  | 판 | 편성 (`--slot`, 편성 화면 슬롯 → 고르기 모달에서 실제로 고름) | 끝 | 경기 (`--watch-match`, 4x 자동 진행 끝까지) |
  |---|---|---|---|
  | 1280×720 · 팀형 · seed `k5-a` | **새 편성 A** (헤르타 · 나엘리스 · 코니 · 온디나 · 리시엘 · 브론테 · 카밀라, 7슬롯) | 시즌 1 경계전 · 유물 · 루트 → 시즌 2 1주. 레슨 3번 (퍼펙트 3), 새 고유 7장 모두 1번 이상 (모양 6종 — 구역 전원 · 연결 · 자리 옮기기 · 가로지르기 · 크로스 · 마무리 · 둘레 중간 원), 코치 수업 4번 (클릭 · 탭 · 키보드) | 경계전 1:0 — 급류(SR 드리블) · 뇌전 화살(SR 패스) 컷인 2 + 역방향 "철벽 블록!" 1 → 화면 카드 3/3, 잘림 0 |
  | 915×412 · `--mobile --touch-only` · 압박형 · seed `k5-t` | 새 편성 A | 시즌 1 경계전 · 루트 → 시즌 2 1주. 레슨 3번, 수업 5번 | 경계전 1:2 (패) — 급류 SR 1 → 1/1 |
  | 1280×720 · 에이스형 · seed `k5-c` | 기본 + GK 헤르타 · FW1 브론테 · FW2 힐디 (**주장 2명** — 경기 전 준비 칩 "©️ 주장 2명 — 팀워크 +10은 1명분" 확인) | 시즌 1 → 시즌 2 1주. 레슨 3번 (피니셔 2장 포함) | 경계전 2:0 — 낙뢰 · SSR 슛 2 + 역방향 1 → 3/3 |
  | 1280×720 · 역습형 · seed `k5-r` | 기본 편성 | **15주 완주** (`finished`), 레슨 9번 · 수업 9번 · 상담 5번 | 경계전 3번: 3:0 (바람의 유성 합체기 1 → 5/5) · 2:1 (산맥 쐐기 · 초원의 질풍 SR 2 + 메테오 슛 → 3/3) · 2:0 (메테오 슛 · 산맥 쐐기 → 2/2) |

  "화면 카드" = `.m-cutin` 에 붙은 컷인 카드 수, 기대값 = 엔진 이벤트 `cutin` + 2 × `combo` + `reverseCutin` (합체기 1번 = 받은 선수 컷인 1장이 두 컷인 + 이름 카드로). 찍은 장면: 등급별 첫 컷인 (R은 네 판에서 한 번도 나오지 않았다 — 아래), 합체기 이름 카드, 역방향 컷인.

**시뮬 전 / 후** (같은 seed. 보고만 — 수치는 바꾸지 않았다. 전 = K0 `0d33f14` 워크트리 (옛 런 sim은 새 지표가 있는 K1 `c782bae` — K1에서 기존 지표가 K0과 같음을 확인했다), 후 = K5. K3 · K4는 엔진 · 데이터를 바꾸지 않아 후 값은 K2 보고와 같다)

옛 런 `npm run sim` (기본 편성, 열 = 전체 / S1 / S2 / S3 목표 경기)

| 지표 | 전 (K0) | 후 (K5) |
|---|---|---|
| 목표 경기 승률 S1 / S2 / S3 (전체) | 80.0 / 59.7 / 38.3% (53.8%) | 77.0 / 56.7 / 36.7% (51.5%) |
| 런당 패배 · 평가 점수 중앙값 | 1.22 · 532.3 (B) | 1.30 · 532.0 (B) |
| 골 / 경기 (우리 / 상대) | 2.76 (1.49 / 1.27) | 2.98 (1.57 / 1.41) |
| 필살기 / 경기 우리 (보유자 수) | 1.77 (2.0) | 3.12 (6.8) |
| 종류 / 경기 우리 슛 · 패 · 세 · 수 · 호 · 드 | 1.03 · 0.74 · 0 · 0 · 0 · 0 | 1.15 · 1.38 · 0.08 · 0.40 · 0.07 · 0.04 |
| 등급 / 경기 우리 R · SR · SSR | (등급 없음 1.77) | 0.11 · 1.13 · 1.88 |
| 일반 액티브 / 경기 우리 / 상대 | 3.34 / 1.04 | 0.11 / 1.08 |
| 필살기 쓴 듀얼 승률 · 필살 슛 골 확률 | 81.9% · 84.2% | 76.1% · 84.4% |
| 합체기 / 경기 | 0.576 (바람의 유성) | 0.571 (바람의 유성) |
| 크로스 / 경기 · 헤더 슛 / 경기 | 0.36 · 0.34 | 0.75 · 0.75 |
| 컷인 연출 초 / 경기 (1x) | 3.6 | 4.9 |

레슨 런 `npm run lesson-sim` (방침 ace / team / counter / press / poss × 200런, 경기 포함)

| 지표 | 전 (K0, 기본 편성) | 후 (K5, 기본 편성) | 후 · 새 편성 A (`--slot` 7개) | 후 · 주장 2명 (`--slot GK=ch_giant_keeper`) |
|---|---|---|---|---|
| 경계전 승률 (전체) | 57 / 55 / 56 / 52 / 54% | 58 / 58 / 54 / 52 / 56% | 48 / 44 / 45 / 44 / 47% | 54 / 52 / 56 / 55 / 54% |
| ace s1 / s2 / s3 | 83 / 53 / 35% | 83 / 54 / 37% | 74 / 36 / 35% | 88 / 48 / 27% |
| 런당 패배 | 1.30 ~ 1.43 | 1.27 ~ 1.44 | 1.55 ~ 1.69 | 1.31 ~ 1.44 |
| 평가 점수 | 582 ~ 588 | 571 ~ 579 | 572 ~ 575 | 582 ~ 592 |
| 런 끝 평균 스탯 · 런당 성장 | 415 ~ 420 · 6,187 ~ 6,353 | 415 ~ 419 · 6,196 ~ 6,340 | 412 ~ 420 · 6,122 ~ 6,378 | 425 ~ 430 · 6,296 ~ 6,487 |
| 퍼펙트율 | 92 ~ 94% | 92 ~ 94% | 96 ~ 98% | 92 ~ 96% |
| 힌트 / 런 · 수업 / 런 | 7.5 ~ 7.6 · 10.9 ~ 11.3 | 8.3 ~ 8.7 · 9.8 ~ 10.3 | 8.4 ~ 8.7 · 10.0 ~ 10.5 | 8.4 ~ 8.6 · 10.1 ~ 10.5 |

도전 모드 `node tools/challenge_sim.mjs` (7팀 × 100판, 전체 승률 1 ~ 10단계): 전 95 / 90 / 81 / 65 / 51 / 39 / 34 / 26 / 18 / 10% → 후 94 / 88 / 79 / 62 / 50 / 36 / 31 / 23 / 17 / 11%.

- 기본 편성은 옛 고유(액티브 2개 경기당 약 3.2회 · 밀물의 벽 등)를 잃은 만큼 옛 런에서 조금 약해졌고, 레슨 런에서는 거의 같다 (코치 수업으로 액티브를 다시 얻는다).
- **새 편성 A는 레슨 런 경계전 승률이 기본보다 약 10%p 낮다** (특히 s2 27 ~ 36%). 주장 2명 판(기본 + 헤르타)은 평균 스탯이 높아 s1이 오르고 s2 · s3이 내려갔다.
  - **원인 (2026-10-04 다시 잼 — 처음 적은 "새 8명 중 R · SR이 많아서"는 틀렸다. 두 편성 모두 SSR 2 · SR 3 · R 2)**: 기본 편성에서 한 자리씩 새 선수로 바꾼 레슨 런 경계전 승률 (`lesson_sim --runs 100 --slot ...`, 방침 5개 평균, 기본 54%): GK 헤르타 +1%p · DF1 나엘리스 +4 · DF2 코니 −1 · **MF1 온디나 (실루엔 SSR → SR) −13** · MF2 리시엘 +1 · FW1 브론테 +4 · **FW2 카밀라 (그레타 SSR → R) −15**. 거꾸로 편성 A (49%)에 옛 선수를 하나씩 넣으면: 실루엔 +7 · 그레타 0 · 울리카 (브론테 대신) −14. → 새 선수 하나하나는 약하지 않다 (7명 중 5명은 같거나 낫다). 편성 A가 약한 것은 **공격 축 (MF1 플레이메이커 · FW 마무리)이 SSR → SR · R로 내려가고, SSR 하나를 경기 영향이 작은 GK에 썼기 때문**이다 (GK SSR은 +1 ~ 4%p). 밸런스 때 볼 것: GK SSR의 체감, MF1 자리 쏠림.
- 브라우저 판 6경기에서 R 필살기 컷인은 0번이었다 (sim도 경기당 0.11). K4가 적은 원인 — 각 줄 둘째 선수는 듀얼에 거의 나오지 않는다 — 과 같다.

**계획과 다르게 · 계획에 없던 것**
1. **`lesson_play.mjs --watch-match`를 더했다.** §19.17 K5는 "경기 화면은 자동 진행 그대로 (컷인 · 에러 0)"였지만, 이 도구는 경기를 ⏭로 건너뛰어 컷인을 볼 수 없었다. 이 옵션은 배속을 4x로 올리고 ⏭ 없이 결과 [확인]까지 기다린다 (경기당 최대 8분). `.m-cutin` 카드를 MutationObserver로 세어 엔진 기대 장수와 비교하고, 대사 · 이름 줄 잘림을 보고, 등급 · 합체기 · 역방향 첫 장면을 PNG로 남긴다. 옵션이 없으면 예전과 같다.
2. 브라우저 판 넷을 동시에 돌렸더니 세 판의 실행 시간이 모두 "261초"로 찍혔다. 셋이 같이 끝날 때까지 프로세스가 기다린 것으로 보인다. 각 판의 결과에는 영향이 없다.
3. **§19.17의 원래 K3 일 중 남은 것** — `lesson_sim` 필살기 지표 · 새 고유 8장 위력 보정 (§19.16) · manager.test 새 편성 A 15주 완주. 이 슬라이스의 작업 지시(브라우저 판 · shot · 문서 · 시뮬 전 / 후)에 들어 있지 않아 하지 않았다. 새 편성 A의 15주 완주는 단위 테스트가 아니라 lesson_sim(200런 × 5방침)으로만 확인했다.
4. **캐릭터 설정 (OUTGAME_CONTENT_draft §0.5)**: 초안에는 소개(`bio`)만 있다. 외형은 체형 규칙(단신 = 어려 보이는 인상 / 장신 = 몸매 강조)과 `portraitColor`로만 정했고, 성격 · 말투는 소개와 `cutinLine`에서 뽑았다. 모두 [가정]이다. 새 8명의 깜짝 이벤트 · 외출 이야기는 아직 없다.
5. 기본 편성 15주 판은 1280×720 하나 (역습형)만 돌렸다. 915×412 터치 판은 새 편성 A 시즌 1이다 (§19.17 그대로).

**기획자에게 넘기는 것** (§19.18 Q1 ~ Q6에 더해): 새 편성 A의 레슨 런 승률 (위 표), R 필살기 사용 빈도. 둘 다 밸런스를 한 번에 볼 때 같이 정한다.

## 20. 선수 패시브 · SP 상점 · 코치 파티 패시브 (L48)

> 상태: 구현됨 · 2026-10-04 · 브랜치 `outgame-lesson`. 기획자 결정 (2026-10-04): SP 패시브 목록은 **선수(캐릭터 카드) 기준**, 서포트 카드(코치)는 **파티 전체 패시브** — 편성하면 **처음부터** 켜진다, 힌트는 **레슨에서 많이 큰 선수**에게서, SP가 허울이 되지 않게 **수입을 약 3배**로 (방향 A). 수치는 모두 [가정] — 밸런스는 나중에 한 번에.

### 20.0 한눈에

| 무엇 | 전 (§18) | 뒤 (L48) |
|---|---|---|
| SP로 사는 것 | 패시브 — 편성 코치 힌트가 나온 것만 진열 | 패시브 — **선수마다 자기 목록 3개** (고유 1 + 공용 2), 늘 진열 |
| 사는 곳 | 상담 | **주 화면 · 상담 · 경기 전 준비** |
| 값 | 80 ~ 180 | 공용 80 ~ 110 · 고유 120 ~ 150 (힌트 레벨당 −10%, 최대 −30%) |
| SP 수입 / 런 | 약 140 (경계전 · 친선전이 대부분) | 약 430 (레슨 클리어 +20 · 퍼펙트 +35를 더함) |
| 패시브 / 런 | 0.8개 (SP 절반이 남음) | 4.1 ~ 4.3개 |
| 힌트 | 코치 목록 (패시브 → 할인, 액티브 → 수업) | **선수 힌트** = 레슨에서 가장 많이 큰 선수의 목록에서 (클리어 1명 · 퍼펙트 2명). **코치 힌트** = 액티브 수업만 (클리어 · 퍼펙트 1개) |
| 코치 | 수업 · 지원 컷인 · 카드 | + **파티 패시브 1개** (편성하면 처음부터, 유대 80이면 한 단계 위) |
| 스킬 슬롯 3 | 액티브 + 패시브 | **액티브만** [구현 결정] — 패시브는 자기 목록 3개로 따로 |

### 20.1 데이터

- `characters.json` 캐릭터마다 `passiveIds: [고유, 공용, 공용]`.
- `skills.json` 고유 패시브는 `ownerCharId` (주인 캐릭터). 옛 고유 패시브 4개는 원래 주인의 고유로 돌아갔다 (밀물의 벽 = 네리아 · 주장의 외침 = 아델린 · 지치지 않는 다리 = 타리아 · 고양이 페인트 = 미르카). 새 고유 12개:

  | 선수 | 고유 패시브 | 효과 | 값 |
  |---|---|---|---|
  | 도르비나 | 대지의 뿌리 | 본인 수비 판정 +8% | 130 |
  | 실루엔 | 바람 읽기 | 연계 1 이상일 때 본인 패스 판정 +12% | 150 |
  | 울리카 | 측면 질주 | 본인 크로스 판정 +12% | 130 |
  | 그레타 | 불꽃 마무리 | 연계 1 이상일 때 본인 슛 위력 +12% | 150 |
  | 헤르타 | 대지의 수호 | 본인 세이브 판정 +10% (GK) | 150 |
  | 브론테 | 번개 감각 | 본인 슛 위력 +8% | 150 |
  | 나엘리스 | 물길 패스 | 본인 패스 판정 +10% | 130 |
  | 온디나 | 물살 드리블 | 본인 드리블 판정 +10% | 130 |
  | 리시엘 | 과녁 읽기 | 본인 패스 · 크로스 판정 +8% | 130 |
  | 코니 | 토끼 스텝 | 본인 드리블 판정 +8%, 그 드리블 체력 소모 −10% | 120 |
  | 카밀라 | 공중전 | 뒤지고 있을 때 본인 슛 판정 +12% | 120 |
  | 힐디 | 담금질 | 체력 20% 이하일 때 본인 슛 위력 +25% | 120 |

- 공용 패시브 8개 (값을 낮춤): 침착한 수문장 100 (GK) · 잠금 수비 90 (DF) · 막판 집중 100 · 승부사 90 · 언더독 정신 90 · 큰 경기 체질 110 · 연계의 달인 100 · 마지막 힘 80. 목록: GK = 침착한 수문장 + (큰 경기 체질 | 마지막 힘), DF = 잠금 수비 + 하나, MF = 연계의 달인 + 하나, FW = 막판 집중 · 승부사 · 언더독 중 둘 (선수마다 다르게).
- `supports.json` 코치마다 `teachSkillIds` (수업 액티브 2 ~ 3개 — 레슨판은 옛 `hintSkillIds` 대신 이것을 읽는다, 옛 런은 그대로) · `partyPassive`:

  | 코치 | 레어도 | 파티 패시브 | 효과 (유대 80) |
  |---|---|---|---|
  | 하르나 | SSR | 골문 사냥 | 팀 슛 위력 +7% (+10%) |
  | 오르넬라 | SSR | 빈 공간의 눈 | 연계 2 이상일 때 팀 패스 · 크로스 판정 +10% (+13%) |
  | 셀리아 | SR | 바람의 스텝 | 팀 드리블 판정 +5% (+7%) |
  | 바르바라 | SR | 버텨라! | 지고 있을 때 팀 수비 · 세이브 판정 +8% (+11%) |
  | 루미 | SR | 역전의 노래 | 지고 있을 때 팀 공격 판정 +8% (+11%) |
  | 한나 | R | 호흡 수련 | 팀 체력 소모 −6% (−9%) |
  | 조이 | R | 막판 근성 | 남은 포제션 2 이하일 때 팀 슛 위력 +8% (+11%) |
  | 이레네 | R | 흐름 읽기 | 앞서고 있을 때 팀 패스 판정 +6% (+8%) |

  [구현 결정] 늘 켜지는 것은 낮게, 조건이 붙은 것은 한 단계 높게 잡았다.
- `lesson.json rewards`: `clear { tp 10, sp 20, hints 1, playerHints 1 }` · `perfect { tp 20, sp 35, hints 1, playerHints 2, freeUpgrades 1 }` (`hints` = 코치 힌트 = 수업, 퍼펙트 2 → 1).

### 20.2 엔진

- 새 모듈 `js/engine/passives.js`: `passiveListOf` · `canBuyPassive` (목록 안 · 미보유 · 포지션) · `passiveCost` (힌트 할인) · `passiveShopView` · `applyBuyPassive` · `topGrowers` (5스탯 상승 합 내림차순, 같으면 명단 순서) · `playerHintCands` · `drawPlayerHint` (후보 1개면 rng 를 쓰지 않는다) · `partyPassivesFor` · `validatePassiveData`.
- `lessonRun`: `getPassiveShopView` · `buyPassive` (phase 주 · 상담 · 경기 전 준비) · `getPartyPassives`. 주 · 준비 뷰에 `partyPassives` · `shopBuyable`. 상담 `skills` = (선수, 패시브) 한 쌍이 한 줄 (가진 것은 뺀다), `consultAction op skill` 은 `applyBuyPassive`. 보상 `result.sp` (= 레슨 SP + 후보 없음 SP) · `spLesson` · `hints[]` 에 `playerId` · `playerName` · `src "player"`.
- 레슨 끝 순서: 결과 보상 (TP · SP) → 코치 힌트 (`teachSkillIds` → 수업) → **선수 힌트** (많이 큰 선수부터, 한 명에 1개, 후보가 없는 선수는 건너뛰고 모자라면 SP +10) → 컷인 힌트 (코치 → 수업).
- 슬롯: `canTeachSkill(...).full` 은 **액티브만** 센다. `resolveTeach` 바꾸기는 액티브만 (패시브면 throw).
- 경기: `lessonRun.buildTeamSnapshot` · `getMatchSetup` 이 home 에 `partyPassives` 를 싣는다 (없으면 키 없음). `skills.collectMods` · `collectModSources` 가 팀 패시브(target team)처럼 센다 — 주인 선수 없음, 출처 id = 코치 (결정타 칩에 이름이 뜬다). `match.initTeam` 은 배열이 아니면 throw. 옛 런 · 도전 모드 · 상대 팀은 키가 없어 예전과 같다 [구현 결정 — 등록 팀(레전드)은 파티 패시브를 가져가지 않는다].
- 감독 AI: `recommendPassive` (고유 → 힌트 레벨 → 패시브 적은 선수 → 싼 것 → 명단). 상담 추천 1번 · 경기 전 준비 `autoStep` 이 먼저 산다 (`{ kind: "passive" }`). 주 화면에서는 사지 않는다 (시뮬은 상담 · 준비로 충분히 쓴다).
- 저장: 상태 모양은 그대로라 이행 없음 (v4).

### 20.3 테스트 · 시뮬

- 새 `test/passives.test.mjs` 5개 (데이터 · 상점 · 선수 힌트 · 파티 패시브 · 레슨 SP). 고친 것: `lessonRun.test` (보상 · 힌트 · 수업 슬롯 · 이행 상담 진열), `lessonRules.test` (보상 개수), `manager.test` (상담 추천 · 준비 패시브 · 수업 추천), `ultimates.test` (옛 고유 4개 = 고유 패시브).
- `npm run lesson-sim` (방침 5 × 100런, 경기 포함):

  | 지표 | 전 (L47) | 뒤 (L48) |
  |---|---|---|
  | SP 얻음 / 씀 / 남음 | 139 ~ 145 / 69 ~ 80 / 66 ~ 72 | 428 ~ 439 / 358 ~ 371 / 65 ~ 70 |
  | 패시브 구매 / 런 | 0.8 ~ 0.9 | 4.1 ~ 4.3 |
  | 런 끝 선수당 액티브 · 패시브 | 1.37 ~ 1.43 · 0.12 ~ 0.13 | 1.49 ~ 1.54 · 0.59 ~ 0.61 |
  | 수업 / 런 | 9.8 ~ 10.2 | 10.7 ~ 11.1 |
  | 경계전 승률 (전체) | 50 ~ 56% | 53 ~ 61% |
  | 평가 점수 · A 비율 | 571 ~ 575 · 7 ~ 15% | 612 ~ 617 · 35 ~ 54% |

  패시브 · 파티 패시브만큼 경기가 쉬워지고 평가가 올랐다 — 밸런스 때 한 번에 본다.

### 20.4 화면

- 새 `js/ui/passives.js` (한 모듈을 세 곳에서): `openPassiveShop` (모달) · `passiveShopGrid` (선수 줄 · 패시브 칩, 상담 화면은 압축판으로 그대로) · `passiveShopButton` (버튼 · 배지) · `partyPassiveRows` (준비 화면 목록) · `setupPartyLine` (편성 화면 코치 칩 한 줄). `app.js actions.buyPassive` 는 다른 행동과 같은 길 (저장 · 오류 토스트).
- **SP 상점 모달**: 머리 "✦ 패시브 (SP)" · 규칙 한 줄 · SP 칩 · [닫기], 선수 7줄 (얼굴 · 이름 · 자리 · "보유 n/3 · 살 수 있음 n") × 패시브 칩 3개 (고유 먼저 — 금색 띠 · "고유" 배지, "힌트 LvN", 값은 원래 값 취소선 + 할인값, 설명 2줄). 상태: 보유 = 초록 "✓ 보유" · 살 수 없음 = 흐리게 + 이유 · SP 부족 = 흐리게 + 값 빨강 · 감독 추천 = 파란 테두리 "추천". **칩을 누르면 바로 산다** (확인 단계 없음 [구현 결정]), 모달은 열린 채 산 칩이 초록으로 반짝인다.
- **주 화면**: 아래 줄 [✦ 패시브 · SP n] (살 수 있는 수 = 보라 배지). 코치 패널은 "코치 유대 · 파티 패시브" — 코치 칸 셋째 줄 "⚑ 이름 + 효과", 유대 80이면 금색 "★".
- **경기 전 준비**: 왼쪽 "코치 파티 패시브 n — 이번 경기 내내" (얼굴 · 이름 · 효과 · 유대 80 배지 · 아니면 "· 80: +x%"), [경기 시작] 앞에 [✦ 패시브] 버튼. 사도 편집 중인 자리 바꾸기 · 전술은 그대로 남는다.
- **상담**: 옛 스킬 칸 (고르기 + 배우기 · 힌트 기다림 칩) 을 지우고 상점 압축판 (선수 7줄 × 칩 3, 설명은 툴팁, [크게 보기] = 모달). 상담에서는 `consultAction op skill` 로 산다.
- **보상 모달**: SP 칩이 TP 칩 옆 (후보 없음 SP는 "(힌트 없음 +x)"), 선수 힌트 "[얼굴] 울리카 · 측면 질주 Lv1". 코치 수업 바꾸기 고르기는 **액티브만**, 칸 표시 "액티브 칸 n/3".
- **편성 화면**: 코치 칩에 "⚑ 효과 · 80: +x%" (이름 · 유대 80 문구는 툴팁). 자리를 내려고 옆 칸을 350 → 380px로 넓히고, 전술 선택 4개를 미니 경기장 아래 한 줄로, 훈련 방침을 따로 패널로 옮겼다.
- **레슨 선수 정보 팝오버 (§17)**: "패시브" 줄에 그 선수 목록 3개 (보유 = 초록 ✓, 고유 = 금색 테두리).
- 자리 맞춤: 준비 화면 상대 정보 4개를 한 줄로, 주 화면 선수 줄 4px 줄임, 보상 모달 칩 줄이 두 줄이 되어 간격을 줄이고 덱 16장 넘는 무료 강화(`.rw-tight`)에서는 선수 "기본/카드" 줄을 숨김 (툴팁에는 있음).
- 스크린샷 (`node tools/shot.mjs <폴더> --only og` 136장 모두 통과): 새 장면 `og_week_party` · `og_passive_shop` · `og_passive_shop_bought` · `og_passive_shop_touch` (915×412) · `og_consult_passives` · `og_consult_passives_modal` · `og_prep_party` · `og_prep_party_long` · `og_prep_shop` · `og_reward_player_hint`. 뜻이 바뀐 장면: `og_reward_teach_full` (액티브 3 + 패시브 1), `og_consult_full` · `og_consult_passive` · `og_consult_old_innate` (상점 압축판). `shot.mjs` 에 새 요소 잘림 검사와 "패널 넘침" 검사 (`.prep-opp` · `.roster` · `.cs-skills` · `.setup-policy`) 를 더했다.
- 테스트: `lessonUi.test` (상담 칩 = 상점 뷰 · 사기 · 주 버튼 · 모달 · 실패 토스트 · 준비 목록 · 사도 자리 바꾸기 유지 · 보상 SP · 선수 힌트 · 수업 바꾸기 액티브만), `outgame.test` (편성 코치 칩 · 주 버튼). `npm test` 365 → 370.

## 21. 키퍼 게이지 규칙 (L49)

> 상태: 구현됨 · 2026-10-05 · 브랜치 `outgame-lesson` (경기 엔진 — §19 처럼 이 브랜치만). 기획자 결정: "키퍼 게이지 규칙을 따로, 동료 수비 승리로 충전".

- **문제**: 키퍼 SSR을 넣어도 승률이 +1 ~ 4%p뿐이었다. 키퍼는 필살기 · 액티브 · 패시브가 이미 있는데, 게이지가 듀얼 승리(+35, 시작 30, 100에 사용)로만 차고 키퍼가 막는 슛은 경기당 약 1.5번이라 **필살 세이브가 경기당 0.02 ~ 0.04번** (25경기에 한 번)만 나왔다.
- **규칙**: 원정 · 홈 상관없이, 공격이 **필드 수비 듀얼에서 막히면** (line ≤ 2, 막은 선수 ≠ GK) 막은 팀의 GK 게이지 + `gkOnTeamDefWin` (기본 **35** = 듀얼 승리와 같은 양). GK 가 직접 막은 세이브 · 박스 연결은 지금처럼 `onDuelWin` 만. 필살기가 없는 GK 는 게이지가 없어 그대로. **GK 자리에서 쓸 수 있는 필살기 (세이브 · 팀) 일 때만** 채운다 [구현 결정 — 도르비나처럼 필드용 필살기를 가진 선수를 GK 에 세우면 게이지만 차고 못 써 "준비" 빛이 경기 내내 켜졌다]. GK 배급 롱패스를 끊은 것 · 승부차기는 채우지 않는다.
- **값 자리 · 범위**: `match.js ultCfg` 의 기본값 [구현 결정] — `data/config.json` 은 옛 런 테스트가 기대는 파일이라 키를 더하지 않는다 (`config.match.ultimate.gkOnTeamDefWin` 을 적으면 그 값, 0 = 끔). 그래서 이 브랜치의 **모든 경기** (레슨 런 · 옛 런 · 도전 모드) 와 **상대 팀 GK** 에도 걸린다.
- **보정 (한 레슨 런 경계전 세팅 · 300경기, 값별)**: 경기당 키퍼 필살기 — 0: 0.02 (네리아) · 0.04 (헤르타) / 15: 0.02 · 0.05 / 25: 0.16 · 0.20 / **35: 0.45 · 0.46** / 70: 0.62 · 0.61. 실점 (헤르타): 0.72 → 0.63 (35). 동료 필드 수비 승리는 경기당 약 2.8번, 키퍼가 받는 슛은 약 2.2번이라 35면 두 번째 슛쯤에 준비된다. 0.45가 상한에 가깝다 (게이지가 찬 뒤 슛이 와야 쓴다).
- 테스트: `ultimates.test` "L49 GK 게이지" (홈 · 원정 · 뚫림 · 직접 세이브 · 가득 · 필살기 없는 GK · 필드용 필살기 GK · 팀 필살기 GK · 0 = 끔). `npm test` 371.
- **검증 (2026-10-05, 워크플로 3갈래 — 코드 검토 · 시뮬 전 / 후 · 실제 브라우저)**:
  - 코드: 버그 없음. 값 0 이면 옛 결과와 300 / 300 경기가 바이트까지 같다 (rng 를 쓰지 않는다). 400경기 한 걸음씩 GK 게이지 불변식 위반 0.
  - 레슨 런 (`lesson_sim` 방침 5 × 100런 + 경기 탐침 500런): 우리 GK 필살기 / 경기 0.05 → 0.44 (경계전 0.57 · 편성 A 0.62), 경계전 승률 +1.4 ~ 1.8%p (기본 58.3 → 60.1% · 편성 A 50.5 → 51.9%), 평가 점수 그대로. 한 경기 2번 이상은 600경기 중 1 ~ 2번 — 쓰고 나면 0에서 다시 차야 해 사실상 경기당 최대 1번. 필살 세이브의 세이브 확률 약 32 ~ 35% → 48%.
  - **상대 GK 도 같이 세진다**: 시즌 3 경계전 상대 GK 필살기 0.04 → 0.70, 도전 모드 6 · 9 · 10단계 보스 GK 0.01 → 0.36. 우리 득점이 조금 줄지만 우리 GK 도 덜 먹어 승률은 거의 그대로 (도전 1 ~ 5단계 +0.6 ~ 1.4%p, 6 ~ 10단계 ±1%p). 옛 런 (`tools/sim.mjs`) 필살 세이브 0.08 → 0.64, 승률 49.6 → 50.7%.
  - 브라우저 (`lesson_play --watch-match`, 헤르타 GK 5경기 · 915×412 터치 포함): 4경기에서 "대지의 손바닥" 컷인, 화면 컷인 수 = 엔진 이벤트, 오류 0. 게이지 고리가 동료의 인터셉트 · 태클마다 30 → 65 → 100 으로 엔진과 같이 찬다.
  - 기획자 확인 (2026-10-05): 보스 GK 에도 같은 규칙 · 동료가 막을 때 GK 게이지 표시는 붙이지 않는다 (고리만 찬다).
  - 남은 것 (밸런스 때): 필살 세이브가 박스 연결 (컷백 · 센터링) 에서도 자동으로 나가 뚫리면 "허탕" 장면이 생긴다 — 예전 규칙이지만 이제 자주 보인다.

## 22. 경기 밸런스 1차 (L51)

> 상태: 구현됨 · 2026-10-05 · 브랜치 `outgame-lesson`. 기획자 결정 (2026-10-05, [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L51): 첫 밸런스는 **경기 득점만** (레슨 난이도 · 평가 · SP 는 다음). ① 모든 경기 종류 — 레슨 런 경계전 시즌 1 · 2 · 3, 레슨 런 친선전, 도전 모드 1 ~ 10단계 — 에서 경기당 **양 팀 합계 평균 3골 이상** (정규 + 연장, 승부차기 제외). ② 레슨 런 경계전 승률 **시즌 1 90% · 시즌 2 75% · 시즌 3 60%** (기본 편성, 방침 5개 평균, ±3%p). ③ 키퍼가 세진 만큼 (L49) **공격이 수비보다 조금 강하게**. 수치는 모두 [가정].

### 22.0 한눈에

| 무엇 | 전 | 뒤 (L51) |
|---|---|---|
| 태클 계수 `config.match.actionCoef.tackle` | 1.0 | **0.6** |
| 인터셉트 계수 `config.match.actionCoef.intercept` | 1.0 | **0.6** |
| 버티기 배율 `config.match.holdMult` | 1.0 | **0.6** |
| 친선전 포제션 `config.friendly.possessions` | 6 | **10** |
| 경계전 상대 스탯 (`opponents.json`, 7명 × 5스탯 합) | 아이언후프 11900 · 실버리프 18010 · 엠버스론 23790 | ×0.85 → 10100 · ×0.88 → 15840 · ×0.85 → 20270 |
| 도전 모드 `statTarget` 3 ~ 10단계 (`challenge.json`) | 480 / 525 / 590 / 610 / 790 / 830 / 875 / 920 | **500 / 555 / 650 / 660 / 880 / 910 / 950 / 1100** (1 · 2단계 340 / 460 그대로) |
| 결정타 칩 버티기의 "순수 능력치" (`match.js computeOdds`, 표시 전용) | 수비 × holdMult | 수비 그대로 (holdMult 는 계수 쪽 — §22.5) |

바뀌지 않은 것: 엔진 규칙 · GK 세이브 계수 · 공격 계수 · 짝 배율 (readBonus 1.7 · missMult 0.8 · holdVsCross 1.7 · holdVsMidrange 1.5) · 경계전 (8 / 10 / 12) · 도전 (8) 포제션 · 친선전 상대 (뒤에 §22.8 에서 따로 축소) · 상대 모양 (대형 · 스타일 · 전술 · 스킬 · 특성) · L49 키퍼 게이지.

### 22.1 레버 고르기 — 세 갈래 비교

측정: 경기 탐침 (`lesson_sim` 과 같은 런 진행 + 경기마다 득점 · 세이브 · 경기 시간 기록 — 기본 편성 · 방침 5 × 100런 · seed 1, 도전 = 샘플 팀 + 자동 팀 6 × 100번). 합계 득점 = 정규 + 연장 (승부차기 제외). 세 갈래 모두 L51 전 데이터 (경계전 상대 축소 전) 에서 쟀다.

| 레버 | 바꾼 것 | 합계 득점 경계전 s1 / s2 / s3 · 친선 | 도전 1 ~ 10단계 | 경계전 승률 s1 / s2 / s3 | 판단 |
|---|---|---|---|---|---|
| 지금 (전) | — | 2.75 / 2.38 / 4.09 · 1.46 | 2.39 ~ 2.94 | 82 / 59 / 39% | 시즌 3 경계전 말고는 모두 3골 미만 |
| ① 키퍼 약화 | GK 세이브 계수 1.0 → 0.35 · 원터치 GK 0.85 → 0.6 · 박스 연결 GK 0.6 → 0.35 · 친선 12포제션 | 3.42 / **3.14** / 5.25 · 3.54 | 3.13 ~ 3.81 | 80 / 56 / 32% | 시즌 2 가 겨우 3.14. 키퍼 세이브율 (필살기 없이) 약 30 ~ 55% → 9 ~ 21% — 박스에 들어가면 거의 골. 방금 키퍼를 세게 만든 L49 와 거꾸로 간다 |
| ② 경기 길이 | 경계전 8 / 10 / 12 → 10 / 14 / 14 · 도전 8 → 12 · 친선 6 → 14포제션 | 3.41 / 3.14 / 4.74 · 3.34 | 3.30 ~ 4.23 | 85 / 64 / 35% | 경기 시간 (1배속 추정) 경계전 1.14 → 1.38분 (+21%) · 도전 0.95 → 1.31분 (+38%) · 친선 0.57 → 1.23분. 듀얼 하나하나는 그대로라 공격이 세진 느낌이 없다 — 골은 시간이 늘어서 는다 |
| **③ 필드 수비 약화 (고름)** | 태클 · 인터셉트 계수 · holdMult 1.0 → 0.6 · 친선 10포제션 | 3.59 / 3.35 / 4.87 · 3.36 | 3.11 ~ 3.85 | 80 / 61 / 43% | 모든 종류 3골 이상. 경계전 · 도전 경기 길이 그대로 (친선만 +4포제션). 키퍼 (L49) 는 그대로 두고 공격이 필드 수비를 더 자주 뚫는다 — 결정 ③ 그대로 |

- [구현 결정] 세 행동을 **같은 배율**로 줄였다. 셋 사이 비율이 그대로라 수비 성향 (스탯 × 계수 × 전술) 의 순위 · 짝 표 · 간파 최선 대응이 예전과 같다 — 수비 행동 고르기는 바뀌지 않고 세기만 준다.
- ③ 만으로는 승률이 목표보다 낮아 (80 / 61 / 43%) 경계전 상대를 줄였다 (§22.2).

### 22.2 경계전 상대 축소 (승률 맞추기)

- 경계전 상대 3팀의 **스탯만** 일괄 축소. 규칙은 `tools/sim.mjs scaleOpponents` 와 같다: `Math.round(x × f / 10) × 10` (모든 스탯 10 단위 유지). 모양 (대형 · 스타일 · 전술 · 스킬 · 특성) 은 그대로, 친선전 상대도 그대로.

  | 상대 | 배율 | 7명 × 5스탯 합 | 반올림 뒤 실제 배율 | 예 |
  |---|---|---|---|---|
  | 아이언후프 (시즌 1) | ×0.85 | 11900 → 10100 | ×0.849 | GK 바르디스 수비 600 → 510 |
  | 실버리프 (시즌 2) | ×0.88 | 18010 → 15840 | ×0.880 | FW 시오넬라 슈팅 820 → 720 |
  | 엠버스론 (시즌 3) | ×0.85 | 23790 → 20270 | ×0.852 | FW 아그니스 슈팅 1090 → 930 |

- 고른 방법: 한 배율을 세 팀에 같이 걸어 훑고 (seed 1, 반올림 없이 — 1.0 = 80 / 61 / 43 · 0.9 = 86 / 71 / 54 · **0.85 = 90 / 75 / 60** · 0.8 = 92 / 80 / 65 · 0.7 = 95 / 84 / 74%), 후보 셋을 5시드 (1 · 2 · 3 · 11 · 12) 평균으로 비교했다 — 전부 ×0.85 = 89.8 / 77.6 / 59.9 · (×0.83 · ×0.87 · ×0.85) = 89.8 / 76.0 / 59.7 · **(×0.85 · ×0.88 · ×0.85) = 89.8 / 75.7 / 59.8**. 승률 잡음이 500경기 칸마다 ±2%p 쯤이라 한 시드가 아니라 평균으로 골랐다.

### 22.3 도전 모드 다시 맞추기

- 도전 모드는 단계 상대를 템플릿에서 `statTarget` 으로 다시 늘이므로 경계전 상대 축소는 거의 영향이 없다 (10 단위 반올림으로 스탯 비율이 조금 바뀌어 3 ~ 9단계 −0.6 ~ −2.0%p, 득점 ±0.07). 하지만 필드 수비 약화로 우리가 이기기 쉬워져 (예: 5단계 50 → 60%) 3 ~ 10단계 `statTarget` 을 올려 2026-10-01 보정 곡선 (95 / 90 / 81 / 65 / 51 / 39 / 34 / 26 / 18 / 10%) 에 다시 맞췄다. 측정은 `node tools/challenge_sim.mjs --runs 100 --teams 6` (seed 1 = 샘플 팀 + 자동 팀 6, 단계당 700경기). 스킬 단계 · 팀워크 · 포제션 · 전술은 그대로. `challenge.json _calibration` 에 2026-10-05 항목을 더했다.

  | 단계 | 목표 | statTarget | 전 (L51 전) | 필드 수비 + 상대 축소 | 뒤 (statTarget 보정) | 샘플 팀 (뒤) |
  |---|---|---|---|---|---|---|
  | 1 | 95% | 340 | 94.9% · 2.56골 | 96.6% · 3.07 | 96.6% · 3.07 | 96% |
  | 2 | 90% | 460 | 88.7% · 2.79 | 89.3% · 3.62 | 89.3% · 3.62 | 86% |
  | 3 | 81% | 480 → 500 | 79.4% · 2.58 | 84.0% · 3.31 | 81.9% · 3.31 | 73% |
  | 4 | 65% | 525 → 555 | 63.3% · 2.39 | 69.0% · 3.28 | 65.4% · 3.29 | 54% |
  | 5 | 51% | 590 → 650 | 50.3% · 2.58 | 59.6% · 3.49 | 51.3% · 3.55 | 39% |
  | 6 | 39% | 610 → 660 | 36.7% · 2.86 | 44.3% · 3.58 | 38.0% · 3.58 | 33% |
  | 7 | 34% | 790 → 880 | 31.9% · 2.94 | 42.7% · 3.81 | 34.4% · 3.84 | 28% |
  | 8 | 26% | 830 → 910 | 23.6% · 2.39 | 32.6% · 3.28 | 25.6% · 3.28 | 18% |
  | 9 | 18% | 875 → 950 | 15.9% · 2.69 | 22.6% · 3.57 | 18.1% · 3.57 | 13% |
  | 10 | 10% | 920 → 1100 | 10.7% · 2.82 | 16.0% · 3.55 | 10.6% · 3.47 | 4% |

- 뒤 (seed 1): 모든 단계가 목표 ±1.6%p, 단계마다 내려가고, 모두 3골 이상 (가장 낮은 1단계 3.07). 다른 자동 팀 묶음에서도 단계마다 내려간다 — seed 2 = 96 / 87 / 81 / 67 / 49 / 38 / 31 / 21 / 15 / 11%, seed 3 (약한 팀들) = 95 / 83 / 75 / 57 / 40 / 34 / 24 / 21 / 11 / 6%.

### 22.4 결과 (전 → 뒤)

레슨 런 경계전 · 친선전 (경기 탐침, 기본 편성 · 방침 5 × 100런). 칸 = 승률 · 합계 득점 (우리 / 상대). 경계전 승률은 연장 · 승부차기 승 포함, 친선전은 무승부 따로.

| | 시즌 1 경계전 | 시즌 2 경계전 | 시즌 3 경계전 | 친선전 · 무승부 |
|---|---|---|---|---|
| 전 seed 1 | 82.4% · 2.75 (1.89 / 0.87) | 59.2% · 2.38 (1.35 / 1.03) | 38.6% · 4.09 (1.75 / 2.33) | 23.5% · 1.46 (0.66 / 0.80) · 44% |
| 전 seed 2 | 79.0% · 2.71 | 60.4% · 2.39 | 36.6% · 3.96 | 26.1% · 1.45 · 44% |
| 뒤 seed 1 | 90.0% · 3.52 (2.44 / 1.08) | 73.2% · 3.28 (2.04 / 1.25) | 58.6% · 4.89 (2.65 / 2.24) | 33.8% · 3.36 (1.63 / 1.73) · 31% |
| 뒤 seed 2 | 88.2% · 3.39 | 77.4% · 3.50 | 63.8% · 4.84 | 30.0% · 3.46 · 31% |
| **뒤 5시드 평균** (1 · 2 · 3 · 11 · 12) | **89.8% · 3.45** | **75.7% · 3.40** | **59.8% · 4.90** | 33.0% · 3.46 |
| 목표 | 90% | 75% | 60% | — (모두 3골 이상) |

- 시즌 1 친선전은 드물다 (5시드 합쳐 67경기): 3.40골 · 승 56.7%.
- `npm run lesson-sim` (방침 5 × 200런, seed 1): 경계전 승률 (방침 평균) 84 / 61 / 39% → 90 / 74 / 60%, 전체 59 ~ 64% → 74 ~ 76%. 런당 패배 1.07 ~ 1.25 → 0.71 ~ 0.78. 평가 점수 613 ~ 617 → 614 ~ 616 (그대로), A 등급 비율 42 ~ 53% → 55 ~ 63%. SP 얻음 432 ~ 441 → 443 ~ 451 (경계전 승리 SP). 레슨 · 성장 · 부상 지표는 그대로.
- 편성 A (참고, 탐침 `--A`): 전 75.8 / 43.4 / 36.4% → 뒤 seed 1 86.4 / 48.4 / 59.0% · seed 2 87.4 / 52.2 / 58.2%. 득점은 모두 3골 이상 (친선 3.6). 시즌 2 만 기본 편성 곡선 (75%) 에서 크게 떨어진다 — 이유는 아직 보지 않았다.
- 도전 모드: §22.3 표.

### 22.5 결정타 칩 — 버티기 표시 수정

- **문제**: `computeOdds` 결정타 칩 목록에서 버티기 수비의 "순수 능력치" (수비 기본 factor 의 `stat`) 가 `defenseStat` 그대로 = **수비 × holdMult** 였다 (철벽만 빼고). holdMult 1.0 일 때는 드러나지 않았지만 0.6 이 되자 같은 능력치끼리 드리블 400 : 버티기 240 으로 보여, 공격이 이기면 "능력치 우위 ×1.67" 칩이 잘못 뜨고 클래시 바 "수비 기본" 도 어긋났다. 수비가 더 높아도 (600 × 0.6 = 360 < 400) 수비 쪽 능력치 우위가 뜨지 않았다.
- **고침**: 버티기면 holdMult 를 철벽처럼 `stat` 에서 빼서 `coef` 쪽으로 — `stat` = 판정 스탯 ÷ 철벽 ÷ holdMult (= 수비 그대로), `coef` = 계수 × holdMult (태클 · 인터셉트 계수와 같은 자리). 기본 배율 (`mult` = 판정값) 은 그대로라 **확률 · 난수 불변**: 200경기 (레슨 런 75 + 도전 125, seed 고정) 의 rngState · 점수 · 이벤트 (factors · decisive · upset 빼고) 가 고치기 전과 모두 같다. 결정타 칩만 3956개 중 1039개가 바뀌었다 (예: "능력치 우위 ×1.22" → "인터셉트 뚫림 +10%").

### 22.6 부작용 · 남은 것

- 친선전이 6 → 10포제션으로 길어지고 무승부가 줄었다 (44 → 31%), 친선전 승률 24 → 33%.
- 도전 모드 득점 바닥: 문서 기준 묶음 (seed 1) 은 모두 3골 이상이지만, 다른 자동 팀 묶음에서는 몇 단계가 조금 못 미친다 (seed 2 4단계 2.90 · seed 3 1단계 2.91 · 3단계 2.89 · 4단계 2.93 — statTarget 을 고치기 전부터). `statTarget` 은 득점을 거의 못 움직인다 (4단계 525 ~ 595 에서 3.25 ~ 3.29, 1단계 330 ~ 380 에서 3.04 ~ 3.08). 바닥을 보장하려면 단계 포제션 9 (`challenge.test` 가 8 을 확인한다) 나 스킬 단계 · 템플릿을 건드려야 한다.
- 도전 모드 자동 팀 묶음 차이가 크다: seed 3 은 seed 1 보다 3 ~ 9단계가 4 ~ 10%p 낮다. 3시드 평균 95.7 / 86.5 / 79.3 / 62.9 / 46.9 / 36.8 / 30.0 / 22.5 / 14.8 / 9.3% — 5단계 · 7단계가 ±4%p 가장자리.
- 도전 모드 스탯 인플레: 10단계 최고 스탯 1580 → 1880 (GK 수비), 9단계 1680 — [ARCHITECTURE §18.12](ARCHITECTURE.md) 4 (1000 넘는 스탯 그대로 표시) 가 더 눈에 띈다. 단계 간격도 고르지 않다 (5 → 6 +2%, 6 → 7 +33%, 9 → 10 +16%) — 승률 순서만 맞췄다.
- 샘플 팀은 3 ~ 5단계가 자동 팀 평균보다 낮고 (73 / 54 / 39% vs 82 / 65 / 51%) 10단계 4% (전 7%) — 참고만.
- 도전 모드 자동 팀은 **옛 런** (`run.createRun` → `run.finalizeRun`, `tools/challenge_sim.mjs autoTeam`) 으로 만든다 — 같은 `config.json` · `opponents.json` 을 쓰므로 경기 설정 · 경계전 상대를 다시 바꾸면 도전 곡선도 다시 맞춰야 한다.
- **독립 검증 (다른 시드 — 워크플로 검증 갈래)**:
  - 레슨 런 (seed 7 · 13 · 21, 방침 5 × 100런): 경계전 승률 평균 90.5 / 74.2 / 57.9% (seed 7 시즌 3 은 56.2% — ±3%p 밖), 합계 득점 시즌 1 3.36 ~ 3.47 · 2 3.41 ~ 3.52 · 3 4.75 ~ 5.02 · 친선 3.49 ~ 3.56. 시즌 3 경계전 중 7골 이상 19% (전 7.8%).
  - 도전 모드: 6개 팀 묶음 모두 단계마다 내려가지만 곡선은 seed 1 묶음에 맞춘 것 — 다른 5묶음 평균 96.0 / 84.8 / 78.4 / 62.5 / 45.2 / 36.6 / 28.6 / 20.2 / 14.6 / 8.7% (2 · 5 · 7 · 8단계가 목표보다 5 ~ 6%p 낮다, L51 전에는 같은 묶음에서 2.8%p 안).
  - 도전 모드 3골 바닥은 seed 1 묶음에서만 확실하다: 샘플 팀 1 · 3 · 4 · 8단계 2.74 / 2.82 / 2.83 / 2.70, 레슨 런 등록 팀 1단계 2.81 ~ 2.98 · 4단계 2.85 ~ 2.96. `statTarget` 으로는 득점이 거의 안 움직인다 — 바닥을 확실히 하려면 도전 포제션 8 → 9 같은 다른 손잡이가 필요하다 (기획자 질문).
  - **확률 상한 0.9 몰림**: 도전 10단계 상대 필드 공격의 59% (전 11%) · 8단계 38% (전 6%) 가 0.9 에 붙는다 — 우리가 맞는 수비를 골라도 (짝 ×1.7) 10단계 55% 는 0.9 그대로라 수동 수비 선택이 소용없다. 우리 공격도 레슨 시즌 1 경계전 30% (전 2%) 가 0.9. 우리 필드 수비 버튼 확률이 대개 10 ~ 26% (최소 10%).
  - 옛 런 (`tools/sim.mjs`) 경계전 승률 78 / 58 / 39 → 87 / 75 / 59% (seed 1) — 같은 설정 · 상대를 쓰기 때문 (옛 런 목표 띠 70 ~ 80 / 50 ~ 60 / 35 ~ 45 를 넘는다, 참고만).
  - 각 시즌 경계전 상대의 전체 스탯이 이제 그 시즌 친선 상대보다 낮다 (축소 결과 — 이름 · 역할상 어색할 수 있다).
  - 실제 브라우저 (`lesson_play --watch-match`, 친선을 시즌마다 넣은 복사본 10경기): 컷인 화면 = 엔진, 오류 0. 슛은 경기당 약 5.4개, 성공 67% — 필살 슛이 0.9 에 붙어 골 대부분을 정한다. 시즌 1 경계전 4판은 평균 2.0골 (표본 적음, 시뮬은 3.5).
- 이번 범위 밖 (다음 밸런스): 레슨 난이도 · 평가 (A 비율이 오른 것 포함) · SP, 편성 A 의 시즌 2.

### 22.7 테스트

- 고친 것 — 옛 값을 박아 둔 기대값만 바꿨고 동작 검사는 그대로 (더 늘렸다):
  - `match.test` "목표 경기: 동점이면 연장 → 승부차기": 연장 경기 총 포제션 = 8 + 연장 `extraTimePossessions` + **마지막 공격 보장 수** (lastAttack 이벤트, 단계당 1회 검사 추가). 새 값에서는 정규 마지막 공격 골로 동점 → 연장인 경기가 생겨 11 이 된다.
  - `v05.test` "수비 스탯 · 배율" · "짝 표 (2026-09-29)": 기대값에 태클 · 인터셉트 계수 · holdMult 를 데이터에서 곱한다 (간파 · 짝 무효 · 철벽 · holdVsCross 사본 줄 포함).
  - `v05.test` "결정타 칩 예" 대이변: 드리블 100 고정 대신 100 에서 10씩 내려 p < upsetP − 2%p 가 되는 첫 값을 찾는다 (지금 60 → p 0.227).
- 새 것 (`v05.test`):
  - "결정타 칩 · 버티기 (L51 표시 수정)": 같은 스탯 버티기 → 수비 기본 `stat` 400 · `coef` = holdMult · 곱 = 판정값, 태클 · 인터셉트와 같은 모양, 철벽 + holdMult, holdMult 1.0 · 0.8 사본, 실제 판정 (공격 승 · 수비 승) 에 "능력치 우위" 없음 · 이벤트 p = `computeOdds` p, 수비 600 이면 수비 승 결정타 "능력치 우위 ×1.5". 고치기 전 `match.js` 로는 실패한다.
  - "L51 경기 밸런스 1차 데이터": 태클 · 인터셉트 · holdMult 0.6 · 친선 10포제션 · 같은 스탯이면 세 행동 기본 수비값이 같다 · 친선전 `pendingMatch.possessions` 10.
- `npm test` 371 → **373** (모두 통과). 스크린샷 경기 시나리오 01 ~ 34 (35개, `tools/scenarios.mjs buildScenarioState`) 는 새 값에서도 모두 만들어진다.

### 22.8 친선 상대 (L51 추가, 2026-10-05)

> 기획자 결정 (2026-10-05): 레슨 런 **친선전 승률도 약 60%** (무승부는 승리로 치지 않는다) — 시즌마다 (기본 편성, 방침 5개 평균, ±4%p), 친선전도 합계 3골 이상 유지. **도전 모드는 지금은 테스트용**이라 밸런스를 크게 신경 쓰지 않는다 — 기획자 말대로 다시 맞추지 않았다 (깨진 것만 확인).

- 친선 상대 3팀 (시즌마다 1팀, `role: "friendly"`) 의 **스탯만** 일괄 축소. 규칙은 §22.2 와 같다 (`Math.round(x × f / 10) × 10`, 모양 · 스킬 · 특성 그대로). 경계전 상대 · `config` 는 건드리지 않았다.

  | 상대 | 배율 | 7명 × 5스탯 합 | 반올림 뒤 실제 배율 |
  |---|---|---|---|
  | 강변 마을 클럽 (`op_f1_riverside`, 시즌 1) | ×0.92 | 11240 → 10320 | ×0.918 |
  | 썬더클로 (`op_f2_thunderclaw`, 시즌 2) | ×0.87 | 16300 → 14180 | ×0.870 |
  | 프로스트베일 (`op_f3_frostveil`, 시즌 3) | ×0.69 | 22390 → 15440 | ×0.690 |

- 측정 — **친선 강제 탐침**: 감독 AI 는 자유 주에 상담 · 미팅을 먼저 골라 친선전을 거의 하지 않는다 (런당 친선 약 1.06번 중 1번은 시즌 3 첫머리의 원정 루트 강제 친선, 시즌 1 은 런당 0.03번 · 시즌 2 는 0). 그래서 `lesson_sim` 과 같은 런 진행 (기본 편성 · 방침 5 × 100런 · 감독 AI) 에서 시즌마다 **친선이 열린 첫 자유 주**에만 감독 AI 대신 친선전을 고르게 했다 (그 시즌 자유 주 둘 중 친선이 열리는 시즌 약 89%). 시즌 3 은 원정 친선 (감독 AI 가 시즌 2 끝에 원정 루트를 고른다) 도 따로 쟀다. 칸 = 승 · 무 · 패 · 합계 득점 (우리 / 상대). 친선전은 연장 없음.
- 고른 방법: seed 1 에서 세 팀에 같은 배율을 걸어 훑고 (시즌 1 / 2 / 3 강제 친선 승률: 1.0 = 50 / 52 / 31% · 0.9 = 58 / 57 / 50 · 0.85 = 65 / 64 / 56 · 0.8 = 71 / 69 / 62%), 후보 6개를 3시드 (1 · 2 · 3) **평균**으로 비교했다. 시즌 3 은 강제 친선과 원정 친선이 둘 다 60 ±4%p 안에 드는 ×0.69 (×0.70 이면 원정 55.6%).

  | 3시드 평균 | 시즌 1 친선 (강제) | 시즌 2 친선 (강제) | 시즌 3 친선 (강제) | 시즌 3 원정 친선 |
  |---|---|---|---|---|
  | 전 | 54.0 · 28.0 · 18.1% · 3.88 (2.29 / 1.60) | 49.2 · 30.7 · 20.1% · 3.86 (2.19 / 1.67) | 30.6 · 34.6 · 34.8% · 3.44 (1.64 / 1.80) | 27.7 · 34.4 · 37.9% · 3.44 (1.59 / 1.85) |
  | **뒤** | **59.9** · 25.9 · 14.1% · 3.81 (2.36 / 1.45) | **60.9** · 26.9 · 12.2% · 3.82 (2.40 / 1.43) | **61.7** · 27.8 · 10.5% · 3.33 (2.15 / 1.17) | **58.0** · 29.4 · 12.6% · 3.34 (2.10 / 1.24) |
  | 승률 시드별 전 → 뒤 (1 / 2 / 3) | 49.7 / 61.0 / 51.2 → 54.1 / 65.3 / 60.4 | 51.8 / 46.1 / 49.6 → 61.8 / 60.1 / 60.9 | 31.4 / 29.5 / 30.8 → 61.3 / 62.9 / 60.9 | 27.2 / 27.0 / 28.8 → 59.4 / 55.6 / 59.0 |
  | 경기 수 (3시드 합) | 1329 | 1352 | 1332 | 1500 |

  - 시즌 1 은 시드 차이가 크다 (뒤 54 / 65 / 60%) — seed 1 하나만 보면 ±4%p 밖이라 3시드 평균으로 골랐다. 시즌 3 (강제 + 원정 합) 59.8%, 친선 전체 60.1%.
  - 합계 득점은 모두 3골 이상 (가장 낮은 시즌 3 3.33). 상대가 약해져 무승부 · 패가 줄고 득점이 우리 쪽으로 옮겨 갔다.
- 감독 AI 그대로 둔 레슨 런 (강제 없음, 경기 탐침 3시드 평균): 친선전 (거의 시즌 3 원정 친선) 승 32.4 → **59.6%** · 무 32.1 → 27.3% · 합계 득점 3.45 → 3.36.
- 경계전 (친선 상대를 쓰지 않는다): 경기 탐침 3시드 평균 승률 89.1 / 74.6 / 59.9 → 89.2 / 74.7 / 61.6%, 합계 득점 3.49 / 3.40 / 4.88 → 3.49 / 3.41 / 4.88. 시즌 3 만 조금 움직인다 — seed 1 58.6 → 64.4% · seed 2 63.8 → 62.0 · seed 3 57.4 → 58.4% (평균 +1.7%p). 독립 검증 (seed 7 · 13 · 21) 에서는 57.9 → 57.2% (−0.7%p) 라 **오차 범위** — 원정 친선을 더 이겨 SP · 유물이 는다는 설명은 뒷받침되지 않는다. 시즌 3 경계전이 seed 에 따라 56 ~ 64% 로 흔들리는 것은 L51 부터다. `lesson_sim --runs 100 --seed 1` 경계전 승률 s1 / s2 / s3 (ace · team · counter · press · poss): 전 88/74/60 · 89/68/61 · 91/73/62 · 89/71/55 · 93/80/55% → 뒤 88/75/64 · 89/68/61 · 91/73/70 · 90/71/61 · 93/80/66%.
- 도전 모드 (다시 맞추지 않음): 단계 상대는 템플릿을 `statTarget` 으로 다시 늘이므로 반올림 차이와 자동 팀 (옛 런의 친선전도 이 상대를 쓴다 — 완주4 팀 점수 535 → 509) 만 바뀐다. `challenge_sim` seed 1 승률 1 ~ 10단계 97 / 89 / 82 / 65 / 51 / 38 / 34 / 26 / 18 / 11 → 96 / 89 / 82 / 67 / 53 / 38 / 35 / 26 / 17 / 11%, 합계 득점 3.05 ~ 3.80 (모두 3골 이상). 깨진 것 없음.
- 옛 런 (`tools/sim.mjs` seed 1, 참고): 같은 친선 상대를 쓴다 — 친선 (200경기, 전체 − 경계전으로 셈) 약 49 → 58%, 경계전 86.7 / 75.3 / 59.0 → 86.7 / 73.7 / 59.3%.
- 부작용: 시즌 2 · 3 친선 상대가 이제 그 시즌 경계전 상대보다 약하다 — 썬더클로 14180 < 실버리프 15840, 프로스트베일 15440 < 엠버스론 20270 (시즌 2 실버리프보다도 낮다). §22.6 끝의 "경계전 상대가 친선 상대보다 낮다" 는 시즌 2 · 3 에서 거꾸로 됐다 (시즌 1 은 강변 마을 클럽 10320 > 아이언후프 10100 그대로). 시즌 3 친선이 크게 줄어든 것은 시즌 첫머리 (원정 · 첫 자유 주) 에 치러져 시즌 끝 경계전 때보다 우리 팀이 덜 자랐고, 무승부 (약 28%) 가 승리 몫을 깎기 때문으로 보인다.
- 테스트: 친선 상대 스탯을 박아 둔 테스트는 없다 — `npm test` 373 그대로 통과. 시나리오 (`tools/scenarios.mjs SCENARIOS` 171개 = 경기 35 + 아웃게임 136, runSeed 1) 도 모두 만들어진다. 독립 검증 (seed 7 · 13 · 21): 친선 시즌 1 / 2 / 3 59.6 / 61.4 / 60.3% (원정 친선 포함 시즌 3 57.9%), 합계 득점 3.32 이상.

## 23. 레슨 배치 자연스럽게 (L52)

> 상태: 구현됨 · 2026-10-05 · 브랜치 `outgame-lesson`. 기획자 요청 (2026-10-05, [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L52): "레슨에서 캐릭터들이 1명 · 2명 · 3명 · 4명 · 5명용 위치가 정해져 있고 그 위치에 정직하게 서 있어서 너무 인위적이다. 조금 랜덤하게 서 있으면 좋겠다. 겹치는 건 막아야 한다." 수치는 모두 [가정].

### 23.0 한눈에

- 구역 대형 (§14.2 huddle) 을 **턴 · 구역마다** 흔든다: ① 해시 각도만큼 돌리고 ② 반지름 × 0.85 ~ 1.25 ③ 선수마다 1.2u 안에서 비끼고 ④ 겹침을 푼다. 2명이 늘 좌우가 아니고, 3명 이상이 정원형이 아니고, 혼자 선 선수도 중심에서 조금 비낀다.
- **겹치지 않는다**: 경기장 토큰 두 개 (같은 구역 · 다른 구역 모두) 의 중심 거리 ≥ `minGap` 4.8u. 모두 구역 중심에서 `maxR` 6.6u 안 (토큰 끝까지 구역 바닥 `pad` 9u 안, 필드 안).
- **rng 를 쓰지 않는다**: 흔들림은 해시 (`lesson.layoutSeed` · `lesson.turn` · 구역 · 선수 id) 에서만 나온다. `jitter: null` 이면 예전 대형과 한 자리도 다르지 않다 — 그 데이터로 `lesson_sim` 을 돌리면 L52 전과 숫자가 모두 같다.
- 이름표 · 실패율 표: 예전 고정 규칙 (옆으로 벌어지면 옆, 아니면 아래 · 3명 위 선수는 오른쪽) 대신 **겹치지 않는 쪽**을 고른다 (`lesson_layout.labelPlan`).

### 23.1 데이터 (`lesson.json zones.jitter`)

```jsonc
"jitter": { "rotate": true, "radiusScale": [0.85, 1.25], "nudge": 1.2, "minGap": 4.8, "maxR": 6.6 }   // null (또는 키 없음) = 예전 대형
```

| 키 | 값 | 뜻 |
|---|---|---|
| `rotate` | true | 대형을 해시 각도 (0 ~ 360°) 만큼 돌린다 |
| `radiusScale` | [0.85, 1.25] | 대형 반지름 = `huddle[n]` × 이 사이 값 — n명이 간격을 지킬 수 있는 가장 작은 반지름 ~ `maxR` 사이로 자른다 |
| `nudge` | 1.2u (12px) | 선수마다 이 반지름 원 안에서 비낀다 (혼자 선 선수도) |
| `minGap` | 4.8u (46px) | 토큰 중심 사이 최소 거리. 토큰 얼굴 40px + 테 2px × 2 = 44px = 4.55u (1280×720 필드 968px — 915×412 터치 화면도 무대가 통째로 줄어 u 로는 같다) 보다 크고, 작은 원 4.2u 보다 크다 (한 명 위 작은 원 = 그 1명) |
| `maxR` | 6.6u (64px) | 구역 중심에서 최대 거리. `maxR + minGap/2` = 9 = `pad` (토큰이 바닥 안). 예전 대형 최대 6.5u 가 들어간다 |

- 검사 `zones.jitterErrors(cfg)` — `cards.validateShapeData` (런 시작 · 카드 데이터 검사) 가 부르고 문구는 "레슨 배치: …": 키 · 형식 (rotate bool · radiusScale [lo ≤ hi] · nudge ≥ 0 · minGap · maxR > 0) · `maxR + minGap/2 ≤ pad` · n = 2 ~ 7 예전 대형이 `minGap + 0.15` · `maxR − 0.08` 을 지킨다 (흔들림이 막히면 돌아갈 자리) · 구역 중심끼리 ≥ `2·maxR + minGap` (지금 22.7 ≥ 18 — 다른 구역 토큰은 겹칠 수 없다) · 바닥이 필드 안.

### 23.2 규칙 (`zones.zonePositions`, 구역마다)

```
key = layoutSeed | turn | zone                         // 해시 = FNV-1a + murmur3 마무리 → mulberry32 (zones.hash32, 정수 연산)
θ   = rotate ? hash(key) × 360° : 0
R   = huddle[n] × lerp(radiusScale, hash(key))  →  [ringMin(n), maxR − 0.08] 로 자름     // ringMin = (minGap + 0.15) / (2·sin(π/n))
p_i = (돌린 예전 대형 i) × R / huddle[n] + (nudge 원 안 한 점 — hash(key | 선수 id))      // i = 그 구역 선수의 슬롯 순서
겹침 풀기 (최대 120번): 간격 < minGap + 0.15 인 두 명을 반씩 밀고, maxR − 0.08 밖은 안으로 당긴다
소수 1자리 반올림 → 검사 (간격 ≥ minGap · 중심에서 ≤ maxR) → 안 되면 돌리기만 한 예전 대형 → 그래도 안 되면 예전 대형
```

- 씨앗: 레슨 시작 때 `lesson.layoutSeed = zones.layoutSeedOf(state.seed, state.turnIndex)` (런 · 주마다 다르다). 상태에 더하는 것은 이 정수 하나뿐이고, 자리는 예전처럼 저장하지 않고 매번 계산한다. 옛 저장본 (layoutSeed 없음) 은 0 으로 본다 — 그래도 결정적.
- 측정 (40 씨앗 × 6 턴 × 구역 5 × n 1 ~ 7): 최소 간격 4.85u · 최대 반지름 6.57u. 반지름 편차 (가장 먼 − 가장 가까운) 평균 n = 2 0.7u · n ≥ 3 1.0 ~ 1.2u, 혼자 선 선수 중심에서 평균 0.8u. 정원형 (편차 < 0.12u) 으로 남는 대형 1% 안팎.

### 23.3 결정성 · 게임 안전

- 같은 턴: 카드를 내도 (구역 인원이 그대로면) 같은 자리 — 미리보기 = 실제. 벤치 · 부상 · 자리 옮기기 · 가로지르기로 구역 인원이 바뀌면 **그 구역만** 다시 모이고 다른 구역은 그대로다. 옮긴 뒤 자리 (`previewCard.shape.positionsAfter`) = 실제 (다시 모이는 연출도 그 자리).
- 턴이 바뀌면 (흩어지기 결과가 같아도) 새 대형, 런이 다르면 다른 대형.
- JSON 왕복 · Math.random · Date 없음. `state.rngState` 를 읽지도 쓰지도 않는다 — 흩어지기 · 뽑기 · 실패 판정 순서는 그대로다.
- 엔진 · UI 가 같은 곳을 본다: `cards.fieldPositions` → `zonePositions` 하나 (원 · 단일 판정, 감독 AI 후보 점, 미리보기, 토큰 자리, 다시 모이기 연출).

### 23.4 이름표 · 실패율 표 (`lesson_layout.labelPlan` — 화면)

- 후보: 이름표 아래 (기본) · 오른쪽 `lp-r` · 왼쪽 `lp-l` · 위 `lp-u` (새로) / 실패율 표 바깥 위 모서리 · 반대 위 · 아래 모서리 `wd` (새로).
- 다른 토큰 얼굴 (테 · 체력 막대 포함) · 앞서 놓은 이름표 · 실패율 표 · 구역 라벨 · 필드 밖과 **3px 여유를 두고** 겹치는 넓이가 가장 작은 쪽, 같으면 바깥쪽 (옆으로 벌어진 선수는 옆, 나머지는 아래). 자리가 적은 토큰부터 놓는다.
- 폭은 평소 이름표 (이름 + 체력, 4명부터 앞 2글자) 추정 (`labelWidth` — 한글 12.5px · 그 밖 7.5px, 실제보다 조금 넓게) — 조준 중 말풍선도 같은 자리라 조준해도 이름표가 옮겨 다니지 않는다.
- 검증 (`lessonLayout.test`, `shot.mjs` 와 같은 기준 — 서로 다른 토큰 부품 넓이 > 4px²): 7명 구역 나누기 330가지 × 씨앗 3 (이름 · 실패율 표 섞어) — 예전 대형 **0건**, 흔들린 대형 **1% 미만** (3960 배치 중 11 — 한 구역 6 ~ 7명일 때가 대부분, 몇 십 px²). 예전 고정 규칙은 같은 표본에서 예전 대형 3.2% (6 ~ 7명 구역 실패율 표 ↔ 이웃 얼굴 · 이웃 구역 옆 이름표끼리), 흔들린 대형이면 45% 가 겹쳤다 — 그래서 이름표 자리 고르기를 함께 바꿨다.

### 23.5 원 약속 — 지키는 것 · 운이 된 것

- **지키는 것** (`zones.test` "L52 흔들린 대형에서도 지키는 원 약속"): 작은 원을 한 명 위에 = 그 1명 · 중간 원을 구역 중심에 = 그 구역 전원 (이웃 구역 0명) · 큰 원을 22.7u 이웃 두 구역 가운데에 = 세 번째 구역 0명 · 주인 둘레 작은 원 (8u) = 다른 구역 0명 · 주인 둘레 중간 원 (15u) = 주인 구역 전원.
- **운이 된 것** (요청대로 받아들임): 작은 원 "같은 구역 이웃 두 명 사이 = 2명" (간격이 8.4u 를 넘으면 1명), "3명 이상 대형 중심 = 0명", 큰 원 "두 무리 전원 (무리당 4명까지)" (구역 중심에서 5.65u 를 넘는 선수는 빠질 수 있다), 철벽 둘레 작은 원 "주인 + 바로 옆 0 ~ 2명" (2명 대형이 넓게 서면 주인 혼자, 5 ~ 7명이 몰리면 3명 이상도). §14.2 · §16.2 의 표는 `jitter: null` 일 때 그대로다.

### 23.6 시뮬 (전 = `31a0e9c` → 뒤, `node tools/lesson_sim.mjs --runs 100 --seed 1`, 방침 5개 — 칸 = 방침 최소 ~ 최대)

| 지표 | 전 | 뒤 |
|---|---|---|
| 원 카드 대상 / 장 — 작은 원 | 1.83 ~ 1.88 | **1.71 ~ 1.77** |
| 중간 원 | 2.59 ~ 2.80 | 2.56 ~ 2.82 |
| 큰 원 | 4.06 ~ 4.21 | 4.10 ~ 4.19 |
| 고유 주인 둘레 작은 원 (철벽) 대상 / 장 · 낸 수 / 런 | 2.47 ~ 2.54 · 3.3 ~ 3.9 | **1.99 ~ 2.18 · 2.1 ~ 2.7** |
| 고유 주인 둘레 중간 원 대상 / 장 | 2.43 ~ 2.50 | 2.52 ~ 2.58 |
| 레슨 점수 s1 / s2 / s3 | 515 ~ 517 / 632 ~ 640 / 722 ~ 738 | 512 ~ 519 / 633 ~ 639 / 726 ~ 741 |
| 퍼펙트율 · 클리어율 | 91 ~ 94% · 99 ~ 100% | 91 ~ 94% · 100% |
| 런당 성장 | 6166 ~ 6344 | 6115 ~ 6314 |
| 런당 실패 판정 · 부상 | 3.04 ~ 3.40 · 1.46 ~ 1.87 | 3.05 ~ 3.57 · 1.57 ~ 1.87 |
| 평가 점수 | 613 ~ 615 | 610 ~ 615 |
| 경계전 승률 (전체) | 72 ~ 76% | 68 ~ 76% |

- 작은 원이 조금 덜 잡고 (−0.1명), 철벽 둘레 작은 원은 눈에 띄게 덜 잡는다 (−0.4명 — 감독 AI 가 덜 낸다). 중간 · 큰 원 · 레슨 점수 · 퍼펙트율은 그대로. 경계전 승률 · 평가 점수 차이는 레슨 결과가 조금씩 달라진 런의 경기 rng 흐름 차이 (방침당 100런 잡음 범위). 밸런스는 고치지 않았다 (나중에 한 번에).
- `jitter: null` 로 같은 시뮬을 돌리면 전과 모든 숫자가 같다 (배치 씨앗이 rng 를 건드리지 않는다는 확인).
- `lesson_sim` 표에 [L52] 지표 3줄을 더했다: 원 카드 대상 / 장 (작은 · 중간 · 큰) · 원 카드 낸 수 / 런 · 고유 둘레 원 대상 / 장 (낸 수 / 런). 대상 = 카드를 낸 행동의 lastFx (턴 끝 앞까지) 상승 · 실패 선수.

### 23.7 테스트 · 스크린샷

- 고친 것: `zones.test` 예전 대형 · 원 약속 테스트 (n = 1 ~ 7 대형 · 슬롯 순서 · 작은 · 중간 · 큰 원 · 후보 점 · 주인 둘레 원) 는 `jitter: null` 로 그대로 · `cards.test` "targetsFor: 원" 은 `jitter: null` 사본으로 · `cardEffects.test` 는 고정 놓을 점 (구역 중심 · 가운데) 으로 대상을 정하므로 `jitter: null` · `lesson.test` 뷰 좌표 고정값 → 구역 바닥 안 + `jitter: null` 이면 예전 자리, 철벽 기대 대상 → 엔진 위치 (`inCircle`), 자리 옮기기 `positionsAfter` 비교에 레슨 씨앗 · 턴을 넣었다.
- 새 것: `zones.test` 8개 (데이터 · 토큰 크기 간격 · 검사 문구 / n = 1 ~ 7 × 구역 × 씨앗 40 × 턴 6 겹침 · 바닥 · 필드 / 7명 구역 나누기 330가지 × 씨앗 4 × 턴 3 (+ 벤치 2명) 다른 구역끼리도 / 결정성 · JSON · Math.random · Date 없음 · 턴 · 씨앗마다 바뀜 · 다른 구역 사람이 움직여도 그대로 / jitter null = 예전 대형 / 흔들림이 보인다 / 지키는 원 약속 / 흔들린 후보 점) · `lesson.test` 1개 (layoutSeed · rng 불변 · 같은 턴 같은 자리 · 턴마다 새 대형 · 겹침 · 뷰 = 엔진 · JSON) · `cards.test` 1개 (흔들린 대형 원 판정) + 검증 문구 4줄 · `lessonLayout.test` 2개 (`labelPlan` 손 예제 · 엔진 대형 330가지 겹침).
- `npm test` 373 → **385** (모두 통과).
- 스크린샷 `node tools/shot.mjs <dir> --only og`: 136 / 136 캡처 · 검사 통과 (스크롤 · 잘린 글자 · 겹침 · 원 판정 · 상태 · 에러 없음). 레슨 장면 (1턴 · 큰 · 작은 원 조준 · 6 · 7명 대형 · 벤치 · 지친 선수 ⚠ · 자리 옮기기 뒤 · 가로지르기 · 철벽) 과 915×412 터치 장면 (`og_lesson_info_touch` · `_info_touch_aim`) 을 눈으로 확인 — 대형이 구역마다 기울고 · 비껴 서고, 토큰 · 이름표가 겹치지 않는다. `og_lesson_u_wall` (철벽) 은 이제 주인 1명만 잡힌다 (같은 구역 둘이 8u 밖) — §23.5 운이 된 약속의 예.

### 23.9 검증 뒤 고친 것 (2026-10-05)

- 독립 검증 (480런 · 레슨 배치 82,285개 · 실제 브라우저 650 상태): 겹침 0 · 바닥 밖 0 · 미리보기 ≠ 실제 0 · 한 턴 안 움직임 0 · `jitter: null` = 예전 배치 82,285 / 82,285.
- **체력 바 가림**: 붐비는 구역에서 아래 이웃의 얼굴이 위 선수의 체력 바 (얼굴 아래 3 ~ 7px) 를 가렸다 (1280×720 붐비는 400 상태 중 23). `minGap` 을 늘리면 `maxR + minGap/2 ≤ pad` 를 못 지켜 7명 대형이 안 들어가므로, 그리기 순서로 고쳤다 — 위쪽 선수를 앞에 (`--zy` = 500 − y × 4, 훈련 동작 · 옮기는 중 토큰은 600 · 700 으로 그 위).
- `jitter.minGap` 아래 한계 `MIN_TOKEN_GAP` 4.6u (얼굴 + 테 44px) — 그보다 작으면 데이터 오류. 배치 오류 문구 머리 "레슨 배치 (zones.jitter)".
- 남은 것 (아주 드묾): 한 구역 6 ~ 7명 + 실패 배지일 때 이름표가 배지에 조금 걸리는 배치 0.28%, 같은 턴에 ⚠ 배지가 생기면 이름표가 반대쪽으로 옮겨 가는 경우 0.9%. 철벽(도르비나) 작은 둘레 원이 주인만 잡는 일이 잦아졌다 (대상 2.5 → 2.1명, 런당 사용 3.3 ~ 3.9 → 2.1 ~ 2.7) — 밸런스 때.

## 24. 2차 — 이벤트 · 외출 이야기 · 코치 연속 이벤트 · 레전드 메모리 카드 · 일러스트 적용

> 상태: **구현됨** · 2026-10-05 · 브랜치 `outgame-lesson` (시작 = `9013725`, 슬라이스 E1 ~ E6 · C1 ~ C7 · A1 · A2 · U1 ~ U5 · I1 — 데이터 스위치를 모두 켰다, 구현 중 바뀐 것 · 시뮬 전 / 후 · 남은 것은 §24.19). 기획자 요청 (2026-10-05): ① 코치 8명 일러스트 — **끝남** (`art/coaches/*.png`, `9013725`) ② **2차 콘텐츠 전부** — 주 끝 랜덤 · 고정 이벤트 (시즌 시작 · 경계전 전야 · 루트), 코치 연속 이벤트 (L50), 레슨 깜짝 이벤트 (L29), 일반 외출 이벤트 6종 + 선수 외출 이야기 (L30 — **16명 전원**), 레전드 메모리 카드 (L26 · L27) ③ UI 에서 그림이 필요한 곳은 새로 그려서 바꾼다 ④ 컷인에 일러스트 일부를 넣는다.
> 기준: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) L24 ~ L31 · L44 · L48 · L50 · 1장 · 6.2 · 6.3, [OUTGAME_CONTENT_draft.md](OUTGAME_CONTENT_draft.md) (초안 103개 · 0장 규칙). §1 의 "2차 이후" 칸과 §7 D1 ("1차에는 이벤트가 없다") 을 이 절이 채운다.
> **바꾸지 않는 파일**: `js/engine/rng.js` · `run.js` · `training.js` · `effects.js` · `js/ui/layout.js` · `data/config.json` · `data/events.json` · `data/supports.json` · `data/routes.json`. 옛 런과 옛 테스트가 이 파일들을 읽는다 (`run.test` 는 `events.json` 의 모든 선택지를 옛 `effects.js` 로 돌린다). 레슨 런 이벤트는 **새 파일**에 둔다 (§24.3).
> **경기 화면 freeze (§0 · §3.4) 는 슬라이스 U2 에서만 풀린다.** 범위는 `js/ui/screens/match.js` · `css/match.css` 의 컷인 · 토큰 얼굴 부분뿐이다 (요청 ④). `layout.js` 는 그대로 둔다 (ARCHITECTURE §20.2 diff 검사).
> **main 은 건드리지 않는다.** main 의 배포 (`pages.yml`) 가 레슨판에서 `/art/` 를 빼므로, 화면용 그림은 `img/` 에 작게 만든 사본으로 커밋한다 (§24.12).
> 표기는 §14 ~ §23 과 같다. 수치 · 글은 모두 [가정]. 밸런스는 고치지 않고 시뮬 전 / 후만 보고한다. [가정] · [구현 결정] · 기획자 질문은 §24.18 에 모았다.

### 24.0 한눈에

| 무엇 | 지금 (1차) | 2차 |
|---|---|---|
| 이벤트 데이터 | `data/events.json` 37개 — 옛 런 전용. 레슨 런은 꺼 둠 (`lesson.json events.support: false`) | 새 파일 `data/lesson_ev_*.json` 7개, 레슨 런 전용 169개. 옛 파일은 그대로 |
| 주 끝 | 이벤트 없음 | 매주 1개 확정 (L24). 준비된 코치 연속 이벤트가 있으면 그것, 아니면 주 끝 랜덤. 외출한 주는 외출 이벤트가 그 자리를 쓴다 |
| 고정 | 없음 | 시즌 시작 3 · 경계전 전야 3 · 루트 3 |
| 코치 | 유대 60 이벤트 (꺼 둠) | 코치마다 3개 — 첫 만남 (계정 1회) · 유대 40 · 유대 80 (L50) |
| 외출 | 기본 효과만 | 기본 효과 + 외출 이벤트 1개. 안 본 이야기가 남았으면 다음 화 확정 (16명 × 3화, 계정 1회), 아니면 일반 6종 (런 안에서 겹치지 않게) |
| 회상 | 없음 | 시작 화면 [회상] — 본 이야기를 다시 읽는다 |
| 레슨 | 깜짝 이벤트 없음 | 레슨당 50%. 2턴 끝 ~ 마지막 앞 턴 끝에 말풍선 1개 (L29), 28개 |
| 메모리 · 레전드 | 없음 | 팀 등록 때 덱에서 1장을 남긴다 → 다음 런 편성에서 레전드 2명 (코치와 따로) → 그 카드가 시작 덱에 (L26 · L27). 인자는 없음 |
| 미리보기 | 손으로 쓴 문자열 | **효과에서 자동으로 만든다** (조사 · 이미 결장 · 이미 강화판 · 남은 레슨 없음까지 반영) |
| 이벤트 글 | `{player}` 만 바꾼다 | `{선수\|이/가}` 조사 · `{코치}` · 반말판 (`alt.banmal`) |
| 얼굴 | 색 원 + 첫 글자 | 일러스트 얼굴 (`img/portraits/*.webp`). 그림이 없는 상대 · 유스는 지금처럼 |
| 컷인 | 108 / 88px 원 | 레슨 코치 컷인 = 반신. 경기 필살기 = SSR 반신 · SR 흉상 · R 얼굴, 역방향 · 합체기 = 흉상 |
| 저장 | `lessonRun.version` 4 | **5** (이행 있음) + 런 밖의 계정 저장 `soccer-lesson.account` |

### 24.1 파일 지도

| 파일 | 슬라이스 | 바꾸는 것 |
|---|---|---|
| `js/engine/lessonText.js` (새) | E1 | 조사 · 자리표시 · 말투 (`fillText` · `josa`) |
| `js/engine/lessonEvents.js` (새) | E1 → E2 ~ E4 | E1: 데이터 읽기 · 검사. E2: 주인공 · 띄우기 · 뷰 · 고르기. E3: 흐름 자격. E4: 코치 · 이야기 |
| `js/engine/lessonEffects.js` (새) | E1 → E2 | E1: 효과 스키마. E2: 적용 · 미리보기 글 |
| `js/engine/lessonCommon.js` (새) | E2 | `lessonRun` 안의 덱 · 유대 · 수업 · 보상 후보 도우미를 옮긴다 (동작 그대로) |
| `js/engine/lessonSurprise.js` (새) | E5 | 깜짝 이벤트 조건 · 후보 · 주인공 (순수) |
| `js/engine/lessonRun.js` | E2 ~ E6 | 이벤트 뷰 · 고르기 교체, `cardOffer` 단계, 저장 v5, 주 끝 queue, 외출 이벤트, 코치 기록, 계정 스냅샷, 깜짝 래퍼, 레전드 |
| `js/engine/lesson.js` · `js/engine/cards.js` | E4 · E5 | E4: 코치 만남 기록. E5: 깜짝 계획 · 턴 기록 · 해결 · 레슨 안 효과 · 쉬는 선수 |
| `js/engine/manager.js` | E2 ~ E6 | 이벤트 · 카드 3택1 · 깜짝 선택, 외출 상대, 메모리 카드 추천 |
| `data/lesson_ev_*.json` (새 7개) | E1 (빈 틀) · C1 ~ C7 | 이벤트 169개 |
| `data/lesson.json` | E1 · E2 · E4 · E5 · I1 | `events` 키 (기능 스위치 · 말투 표 · 대체값), `bond.eventSteps`. I1 이 스위치를 켠다 |
| `tools/portraits.mjs` (새) · `art/portraits.json` (새) · `img/` (새, 생성물) · `data/portraits.json` (새, 생성물) | A1 · A2 | 그림 자르기 · WebP · 목록 |
| `art/scenes/` (새) | A2 | 사람 없는 배경 7장 (Codex) |
| `js/ui/art.js` (새) · `js/ui/dom.js` · 화면 · CSS | U1 ~ U5 | 얼굴 · 컷인 · 이벤트 모달 · 결과 카드 · 카드 고르기 · 3택1 · 외출 이야기 표시 · 회상 · 깜짝 말풍선 · 레전드 · 메모리 카드 |
| `js/ui/store.js` | E2 (버전 사본) · U3 · U5 | 버전 5, 계정 저장 키, 편성 레전드 |
| `js/ui/app.js` | E1 · U3 ~ U5 | 데이터 목록, 라우팅 (`cardOffer` · 회상), 계정 동기화, 새 행동 |
| `test/helpers.mjs` · `tools/lesson_sim.mjs` · `tools/scenarios.mjs` | E1 (+ E3 ~ E6 은 `lesson_sim` 지표만) | 새 데이터 파일 등록. 테스트는 이벤트를 끈 데이터가 기본 |
| `tools/lesson_scenarios.mjs` · `tools/shot.mjs` · `tools/lesson_play.mjs` | E2 (`og_event` 만) · U1 ~ U5 · I1 | 새 장면, 그림 기다리기, 브라우저 판 이벤트 처리 |
| `tools/events_doc.mjs` (새) · `docs/LESSON_EVENTS.md` (생성물) | E1 · I1 | 데이터 → 검토용 한국어 문서 |
| 새 테스트 6개 | E1 (빈 틀 등록) | `lessonEvents` · `lessonContent` · `lessonSurprise` · `legends` · `portraits` · `eventsUi` |

### 24.2 런 흐름 — 이벤트가 뜨는 자리

```
편성 ─ createRun ─ [시즌 시작 s1] ─ 1주
매주  ┬ 레슨(→ 보상) · 휴식 · 전술 미팅 · 상담 · 친선전 → [주 끝 슬롯] → (5주면 [경계전 전야]) → 다음 주 / 경기 전 준비
      ├ 외출 (자유 주)            → [외출 이벤트] → 다음 주            (외출 이벤트가 그 주의 슬롯)
      └ 무료 외출 (온천 뒤 1주)   → [외출 이벤트] → 같은 주로 (offer 그대로)
레슨 안 ─ 시작할 때 50% → 2턴 끝 ~ 마지막 앞 턴 끝에 [깜짝] 말풍선 1개
경계전 ─ 루트 고르기 ─ [루트 이벤트] ─ (원정) 친선전 ─ [시즌 시작 s2 · s3] ─ 1주
```

- **주 끝 슬롯은 1개 확정이다 (L24).** 준비된 코치 연속 이벤트가 있으면 그것을 띄운다 — 편성 순 · 낮은 단계 먼저 · 한 주에 1개 · **2주 연속은 안 된다** (§24.6). 없으면 주 끝 랜덤 1개. [구현 결정] 코치 이벤트가 슬롯을 차지하므로 런 길이는 L24 그대로다.
- 레슨 주는 레슨 결과 · 보상 다음에 주 끝 슬롯이 뜬다 (초안 5.0 순서: 레슨 → 보상 → 코치 → 주 끝 랜덤 → 전야).

| 때 | `state.queue` (지금 → 2차) |
|---|---|
| `createRun` | `["beginWeek"]` → `["seasonStartEvent", "beginWeek"]` |
| 주 끝 (레슨 보상 · 휴식 · 미팅 · 상담 끝 · 친선전) | `WEEK_END` 상수 → `weekEndQueue(state, data)` = `["weekSlot", (마지막 주면) "preMatchEvent", "advanceWeek"]` |
| 외출 | `WEEK_END` → `["outingEvent:<playerId>", "advanceWeek"]` |
| 무료 외출 | (queue 없이 phase week) → `["outingEvent:<playerId>", "resumeWeek"]`. `resumeWeek` 는 phase 만 week 로 바꾼다 (offer 를 다시 굴리지 않는다, rng 없음) |
| 루트 고른 뒤 | `[routeFriendly?, "beginWeek"]` → `["routeEvent:<routeId>", routeFriendly?, "seasonStartEvent", "beginWeek"]` |
| 옛 저장본의 `"supportEventCheck"` | = `"weekSlot"` (별칭) |

- 이벤트 단계는 띄울 것이 없으면 그냥 지나간다. 기능 스위치 (`lesson.json events.*`) 를 끄면 그 단계는 아무것도 하지 않는다. **모두 끄면 1차와 같은 흐름 · 같은 rng** 다 (테스트로 확인).
- `continueFlow` 의 queue 끝 검사 (멈추는 phase 없이 비면 throw) 는 그대로 둔다. 모든 queue 가 `beginWeek` · `advanceWeek` · `resumeWeek` 로 끝난다.

**런당 이벤트 수 (어림 — I1 시뮬로 확인)**

| 종류 | 런당 | 근거 |
|---|---|---|
| 주 끝 슬롯 (코치 + 랜덤) | 약 12 ~ 13 | 15주 − 외출 주 |
| 그중 코치 | 첫 런 약 8 · 다음 런부터 약 4 ~ 5 | 첫 만남 6 (계정 1회) + 유대 40 약 3 ~ 4 + 유대 80 약 1 |
| 외출 | 약 2 ~ 3 (+ 무료 외출 0 ~ 1) | 자유 주 6번 중 외출 2 ~ 3번 |
| 시즌 시작 · 전야 · 루트 | 3 · 3 · 2 | |
| 깜짝 | 약 3 ~ 4.5 | 레슨 9번 × 50% (조건이 안 맞으면 덜) |
| **합계** | **약 25 ~ 29** (깜짝을 빼면 22 ~ 25) | L24 (20 ~ 24) + L29 (4 ~ 5) |

### 24.3 데이터

#### 24.3.1 파일 (`data/lesson_ev_*.json`, 레슨 런 전용)

`data/events.json` (옛 런) 은 그대로 둔다. 파일은 **쓰는 슬라이스마다 하나**라서 콘텐츠 슬라이스가 동시에 작업해도 겹치지 않는다. 엔진은 7개를 이어 붙여 한 목록으로 본다 (`lessonEvents.allEvents`). id 는 7개 파일 전체에서 하나뿐이어야 한다.

| 파일 | 슬라이스 | 내용 | 개수 |
|---|---|---|---|
| `lesson_ev_surprise.json` | C1 | 깜짝 (초안 1장) | 20 |
| `lesson_ev_week.json` | C2 | 주 끝 랜덤 (초안 2 · 3장). E1 이 `ev_local_kids` 1개를 본보기로 먼저 넣는다 | 42 |
| `lesson_ev_story.json` | C3 | 외출 이야기 — 옛 8명 × 3화 (초안 4장) | 24 |
| `lesson_ev_fixed.json` | C4 | 시즌 시작 3 · 전야 3 · 루트 3 (초안 5.2 ~ 5.4) + 일반 외출 6종 (새 글) | 15 |
| `lesson_ev_new_a.json` | C5 | 헤르타 · 브론테 · 나엘리스 · 온디나 — 이야기 12 · 깜짝 4 · 주 끝 단독 4 · 짝 2 | 22 |
| `lesson_ev_new_b.json` | C6 | 리시엘 · 코니 · 카밀라 · 힐디 — C5 와 같은 묶음 | 22 |
| `lesson_ev_coach.json` | C7 | 코치 연속 이벤트 8 × 3 (유대 60 다시 쓰기 8 + 새 16) | 24 |
| | | **합계** | **169** |

파일 모양: `{ "version": 1, "notes": { "<charId 또는 supportId>": { "arc": "이야기 줄기 한 줄", "setting": ["새 설정 [가정]", …] } }, "events": [ … ] }`. `notes` 는 검토 문서에만 쓴다.

#### 24.3.2 이벤트 한 개

```jsonc
{
  "id": "ev_night_training",            // 영문 소문자 · 숫자 · _ , 파일 7개 전체에서 하나
  "trigger": "week",                    // week | seasonStart | preMatch | route | outing | story | coach | surprise
  "title": "야간 특훈",
  "text": "{선수|이/가} …\n\"…\"",       // 장면 2 ~ 4줄 (깜짝은 1 ~ 2줄), 줄바꿈은 \n
  "who": { "pick": "random", "pos": ["FW", "MF"] },   // 주인공 ({선수}) — §24.3.4
  "chars": ["ch_wolf_winger", "ch_giant_striker"], "charMode": "all",   // 편성 조건 (결장 아님) — all | any
  "coach": "sp_mountain_monk",          // 코치 편성 조건 ({코치} = 이 코치)
  "weeks": [1, 14],                     // 주 번호 (turnIndex 0 ~ 14) 범위. 또는 "weekList": [0, 1, 5, 6, 10, 11]
  "seasons": [1, 2, 3],
  "once": "run",                        // run (기본) | season | false (반복 — 바로 다음 주에는 다시 뜨지 않는다)
  "weight": 2,
  "weightIf": { "cond": { "anyInjured": true }, "weight": 3 },
  "cond": { "avgStaminaBelow": 50 },    // §24.3.3
  "scene": "ground",                    // 배경 그림 — §24.12.5
  "choices": [                          // 늘 2개
    { "label": "\"오늘 밤은 네 날이다.\"",               // 감독의 결정 (말 또는 행동)
      "effects": [ { "type": "random", "chance": 0.7,
                     "then": [ { "type": "stat", "target": "player", "stat": "shoot", "amount": 30 } ],
                     "else": [ { "type": "stat", "target": "player", "stat": "shoot", "amount": 30 },
                               { "type": "stamina", "target": "player", "amount": -40 },
                               { "type": "injury", "target": "player" } ] } ],
      "result": { "then": "…", "else": "…" } },        // 확률이 있으면 갈래마다, 없으면 문자열 하나
    { "label": "…", "effects": [ { "type": "condition", "amount": 1 } ], "result": "…" }
  ],
  "alt": { "banmal": { "text": "…", "results": ["…", { "then": "…", "else": "…" }] } }   // 반말판 (§24.3.5)
}
```

트리거별 키:

| trigger | 꼭 있는 키 | 쓸 수 있는 키 | 뜻 |
|---|---|---|---|
| `week` | — | who · chars · coach · weeks/weekList · seasons · once · weight · weightIf · cond | 주 끝 랜덤 |
| `seasonStart` · `preMatch` | `seasons` (하나) | who | 시즌 시작 / 경계전 전야 |
| `route` | `routeId` | who | 루트를 고른 뒤 (반복) |
| `outing` | — | weight | 일반 외출 6종 (`who.pick` = `partner` 고정) |
| `story` | `story: { charId, ep }` | — | 외출 이야기 (ep 1 ~ 3, 계정 1회, 주인공 = 그 선수) |
| `coach` | `chain: { supportId, step }` · `bondAtLeast` | — | 코치 연속 이벤트 (step 1 = 첫 만남 0, 2 = 유대 40, 3 = 유대 80). 주인공 `coachTarget` 고정 |
| `surprise` | `cond` | who · chars · policy · weight · seasons | 레슨 깜짝 (§24.8). 레슨 안 효과도 쓸 수 있다 |

#### 24.3.3 조건 `cond` (week · weightIf)

| 키 | 뜻 |
|---|---|
| `anyStaminaBelow: n` | 편성 7명 중 체력 n 미만인 (결장 아닌) 선수가 있다 |
| `avgStaminaBelow: n` | 7명 평균 체력 n 미만 |
| `anyInjured: true` | 결장 중인 선수가 있다 |
| `teamworkBelow: n` · `conditionBelow: n` · `conditionAtLeast: n` | 팀 값 |

- 모든 조건은 AND 로 묶는다.
- 선수 전용 (`chars`) · 짝 이벤트는 그 선수(들)가 편성돼 있고 **결장이 아닐 때만** 뜬다 (초안 6.2). 지금 `run.eventCommonOk` 는 결장을 보지 않으므로 새로 짠다.

#### 24.3.4 주인공 `who.pick`

| pick | 누구 | 트리거 |
|---|---|---|
| `none` | 없음 (`{선수}` 를 쓰면 검사 오류) | 모두 |
| `random` | 결장 아닌 선수 중 무작위. `pos: [..]` (배치 포지션) · `zone: ".."` (레슨 안 — 지금 서 있는 구역) 로 좁힌다. 좁혀서 아무도 없으면 전원 중 무작위 | 모두 |
| `char` | `who.charId` | 모두 |
| `lowestStamina` · `highestStamina` | 체력이 가장 낮은 / 높은 선수 (같으면 무작위). `pos` · `zone` 가능 | 모두 |
| `partner` | 외출 상대 (결장이어도) | outing · story |
| `coachTarget` | 이번 런에 그 코치 카드의 대상이 가장 많이 된 선수 → 같으면 코치 종목이 주 스탯인 선수 → 그래도 같으면 7명 중 무작위 (결장 제외, 초안 5.0) | coach |
| `turnFailer` · `streaker` · `coachCardTarget` · `multiTarget` · `mostTargeted` | 이번 턴 실패한 선수 · 연속 대상 선수 · 이번 턴 코치 카드 대상 중 무작위 · 3명 이상 원 카드 대상 중 무작위 · 이번 레슨 대상 최다 | surprise |

#### 24.3.5 글 — 자리표시 · 조사 · 반말판

- **자리표시**: `{선수}` · `{코치}` (칭호까지, 예: 무희 셀리아) · `{시즌}`.
- **조사**: `{선수|이/가}` · `|은/는` · `|을/를` · `|과/와` · `|으로/로` · `|아/야` · `|이랑/랑` · `|이에요/예요` (`{코치|…}` 도 같다).
  - `lessonText.josa` 가 이름 끝 글자의 받침으로 고른다 (`(code − 0xAC00) % 28`).
  - `으로/로` 는 ㄹ 받침이면 `로` 를 쓴다.
  - 끝 글자가 한글이 아니면 `이(가)` 꼴로 둘 다 적는다.
  - 데이터에서는 역슬래시 없이 쓴다 (초안 표의 `\|` 는 Markdown 표 때문에 붙인 것).
- 특정 선수 전용 · 짝 · 이야기 글은 실제 이름과 맞는 조사를 그대로 쓴다.
- **반말판** (초안의 "도르비나판"을 넓힌 것): 주인공이 감독에게 반말을 쓰는 선수면 `alt.banmal` 의 본문 · 결과 문구를 쓴다 (없으면 기본 글). 말투는 `lesson.json events.speech` 표에서 읽고, 표에 없는 선수는 존댓말로 본다.

  | 반말 [가정] | 존댓말 [가정] |
  |---|---|
  | 도르비나 (감독을 "감독"이라 부른다) · 헤르타 (짧은 호령) · 브론테 (짧고 빠르다) · 온디나 (장난스럽다) · 카밀라 (자신만만) · 힐디 (장인 고집) | 네리아 · 아델린 (~습니다) · 실루엔 · 타리아 · 울리카 · 그레타 · 미르카 · 나엘리스 (계산하는 존댓말) · 리시엘 (짧은 해요) · 코니 (더듬는 해요) |

  반말판 글은 **누구에게나 맞게** 쓴다. 도르비나의 광산 · 망치 같은 개인 소재는 넣지 않는다.
- **문체** (초안 0.1): 감독 시점 · 담백한 서술 + 짧은 대사. 감독은 초상화 없이 듣는 쪽이다. 선수 · 코치는 **전원 성인 여성**이고, 몸매 · 외모를 성적으로 묘사하지 않는다.

#### 24.3.6 `data/lesson.json` `events`

```jsonc
"events": {
  "week": false, "seasonStart": false, "preMatch": false, "route": false, "outing": false,   // I1 이 true 로
  "coach": { "enabled": false, "firstMeet": "account", "gapWeeks": 1 },
  "surprise": { "enabled": false, "chance": 0.5, "fromTurn": 2 },
  "speech": { "ch_dwarf_wall": "banmal", "ch_giant_keeper": "banmal", "ch_spirit_striker": "banmal",
              "ch_spirit_dribbler": "banmal", "ch_human_header": "banmal", "ch_dwarf_finisher": "banmal" },
  "fallback": { "injuredStamina": -20, "uniquePlusTp": 20, "cardPickTp": 10, "offerSkipTp": 10, "noHintSp": 10 }
}
```

- 옛 `"support": false` 는 E2 가 지운다. 레슨 런은 옛 유대 60 이벤트를 더는 읽지 않는다.
- `bond.eventAt: 60` 은 그대로 두고 (`lesson_sim` 표시용), E4 가 `bond.eventSteps: [40, 80]` 을 더한다.

#### 24.3.7 검사 `lessonEvents.validateLessonEvents(data)`

E1 이 만들고, E2 부터 `createRun` 이 부른다. 오류를 모두 모아 한 번에 던진다 ("레슨 이벤트 데이터: …").
- **모양**: 파일 모양 (`version` · `events` 배열), id 형식 · 파일 7개 전체에서 하나, trigger 값, 트리거별 꼭 있는 키, 모르는 키 없음.
- **글**:
  - title · text · 선택지 label · result 가 비어 있지 않다.
  - 자리표시 · 조사 꼴은 §24.3.5 표에 있는 것만 쓴다.
  - `who.pick: none` 이면 `{선수}` 가 없다.
  - `{코치}` 는 coach 트리거 · `coach` 키 · 깜짝 `coachCardOkThisTurn` 조건일 때만 쓴다.
  - result 가 갈래 (`{ then, else }`) 면 그 선택지 맨 위에 `random` 이 하나 있다.
  - `alt.banmal.results` 길이 = 선택지 수.
- **선택지**: 정확히 2개, 효과 스키마 (§24.4 — 트리거마다 쓸 수 있는 효과가 다르다). `random` 은 선택지 맨 위에 하나까지 (안에 `random` 없음). 한 선택지에 `relic` 과 `rewardOffer` 를 같이 쓰지 않는다.
- **참조**:
  - 캐릭터 · 코치 · 카드 · 스킬 · 루트 id 가 있다.
  - `playerHint.skillId` 는 패시브다. 주인공이 정해진 이벤트 (`char` · `story` · 짝) 면 그 선수 `passiveIds` 안에 있다.
  - `teach.skillId` 는 액티브다.
  - `cardAdd` 는 고유 · 대비 카드가 아니다.
  - `modifier.key` 는 `effects.MODIFIER_KEYS` 안, `duration` 은 season | run.
- **금지 (옛 효과)**: `summonTicket` · 옛 `hint` (무작위 풀) · 1차 이전의 훈련 칸 키.
- **이야기**: 캐릭터마다 ep 1 · 2 · 3 이 하나씩. 그 캐릭터 이야기가 하나도 없으면 오류가 아니다 (콘텐츠가 들어오는 중).
- **코치**: 코치마다 step 1 · 2 · 3 이 하나씩, `bondAtLeast` 는 0 · 40 · 80. 하나도 없으면 오류가 아니다.
- `scene` 은 §24.12.5 목록 안.

### 24.4 효과 어휘

#### 24.4.1 런에 남는 효과 (모든 트리거)

| type | 키 | 미리보기 (자동) | 규칙 |
|---|---|---|---|
| `stat` | target (`player` · `team` · `char:<id>`) · stat (`shoot` · `dribble` · `pass` · `defense` · `physical` · `main` · `main2` · `random`) · amount | "그레타 슈팅 +15" · "7명 패스 +6" · "그레타 주 스탯 2개 (슈팅 · 피지컬) +10씩" | `main2` = `cards.mainStatsOf(배치 포지션)` 2개. 상한 `config.statCap` |
| `stamina` | target · amount 또는 full | "7명 체력 +10" · "네리아 체력 완전 회복" | 0 ~ 100 |
| `condition` | amount | "컨디션 +1" | 0 ~ 4 |
| `goalCondition` | amount | "다음 경계전 1회만 컨디션 +1" | modifier `goalMatchCondition`, 이번 시즌 (시즌마다 경계전 1번) |
| `teamwork` · `sp` · `tp` | amount | "팀워크 +5" · "SP +15" · "TP +20" | SP 에는 `skillPointGain` 보정 |
| `bond` | target (`all` = 편성 코치 전원 · `coach` = 그 이벤트의 코치 · `<supportId>`) · amount | "편성 코치 전원 유대 +5" · "하르나 유대 +15" | 0 ~ 100, `bondGain` 보정 |
| `injury` | target (`player` · `randomPlayer` · `char:<id>`) | "타리아 다음 레슨 1회 결장" | **레슨만** 빠진다 (§18.1 — 경기는 나온다). 이미 결장 중이면 결장 대신 **체력 −20** (미리보기도) |
| `heal` | target (`player` · `all`) | "결장 중인 선수 전원 결장 해제" | |
| `relic` | — | "유물 3택1" | `pendingRelicChoices` → phase relic (지금 길) |
| `modifier` | key · amount · duration | "이번 시즌 레슨 상승 +10%" · "이번 경계전 간파 사용권 1" · "런 동안 경기 슛 위력 +5%" | 옛 `events.json` 과 같은 꼴 (`amount` 0.1 = +10%, 간파 사용권 1). `state.modifiers` 에 `{ key, amount, untilSeason }`. 전야 이벤트의 `season` = 바로 그 경계전 |
| `cardAdd` | cardId · plus? | "덱에 「원투 패스」 추가" (코치 카드면 ", 하르나 유대 +15" 를 붙인다) | `addToDeck` + `acquireBond` (코치 카드 유대 +15, 초안 6.3 #5) |
| `cardPick` | op (`upgrade` · `delete`) | "덱의 카드 1장 강화 (고른다)" | 고를 카드가 없으면 TP +10 (미리보기도). 강화 = 상담과 같은 조건 (강화판 · 대비 카드가 아님), 삭제 = 덱 5장 이상일 때 |
| `cardUpgradeRandom` | — | "덱의 카드 1장 무작위 강화" | |
| `rewardOffer` | — | "보상 카드 3택1" | `pendingCardOffer` → phase `cardOffer` (§24.5.3) |
| `uniquePlus` | target | "네리아 고유 카드 「물결 세이브 루틴」 이번 런 동안 강화판" | 이미 강화판이거나 덱에 없으면 **TP +20** (미리보기도) |
| `teach` | skillId · supportId? | "코치 수업: 파워 슛 (다음 레슨 보상에서 가르칠 선수를 고른다)" | `pendingTeach` 에 넣는다. supportId 가 없으면 그 액티브를 가르치는 편성 코치가 맡고, 그런 코치가 없으면 `coachHint` 로 바꾼다. **남은 레슨이 없으면 SP** (`declineSp`, 미리보기도) |
| `coachHint` | from (`fielded` · `coach` · `<supportId>`) | "코치 수업 1 (편성 코치 액티브 중 무작위)" | `drawHint` · `drawHintFrom` (§18.3). 후보가 없으면 SP +10 |
| `playerHint` | target · skillId? | "울리카 · 측면 질주 힌트 1" | 그 선수 패시브 목록 3개 안에서 (§20, L48). skillId 가 없으면 `passives.drawPlayerHint`. 이미 Lv3 이면 SP +10 |
| `random` | chance · then · else | "70%: … / 30%: …" | 선택지 맨 위에 1개. 갈래마다 결과 문구 |

- **미리보기는 데이터에 쓰지 않는다.** `lessonEffects.describe(state, data, effects, ctx)` 가 뷰를 만들 때 지금 상태로 쓴다 (이름 · 조사 · 대체값 · 남은 레슨 없음). 그래서 효과와 미리보기가 어긋날 수 없다.
- 효과는 적힌 순서대로 적용한다. 같은 선택지의 효과는 모두 같은 주인공을 가리킨다 (`ctx.playerId` · `ctx.supportId` · `ctx.charIds`).

#### 24.4.2 레슨 안 효과 (깜짝 전용)

| type | 키 | 미리보기 | 엔진 |
|---|---|---|---|
| `nextPct` | pct (±) | "다음 카드 위력 +40%" | `L.buffs.nextPct += pct / 100` (음수 가능) |
| `nextNoFail` | — | "다음 카드 실패 판정 없음" | 지금 있는 버프 |
| `drawNext` | n | "다음 턴 손패 +1" | 지금 있는 `drawNext` |
| `extraPlayNext` | n | "다음 턴 카드 1장 더 낼 수 있다" | 새 `L.nextExtraPlay` → 다음 `beginTurn` 의 `playsLeft` 에 더한다 |
| `score` | amount | "이번 레슨 점수 +40" | 점수에만 더한다 (L31). 상한을 넘으면 퍼펙트로 끝난다 |
| `buff` | n | "집중 +1" (방침 버프 이름) | 지금 방침의 `applyBuffEffect` 한 단위 |
| `restRemaining` | target · stamina | "타리아 이번 레슨 남은 턴 쉼 (대상 제외, 체력 +20)" | 새 `L.rested`. 벤치 2칸과 따로 센다 [구현 결정]. 쉬는 동안 기본 훈련도 빠진다 |
| `injureNow` | target | "울리카 결장 (이번 레슨 남은 턴도)" | `lesson.injure` (지금 내부 함수) |

깜짝에서도 `stamina` · `teamwork` · `condition` · `bond` (`coach` = 방금 낸 코치 카드의 코치) · `coachHint` · `playerHint` · `tp` · `random` 을 쓸 수 있다. 뜻은 런 효과와 같다.

### 24.5 엔진

#### 24.5.1 모듈 (모두 순수 — DOM · Date · Math.random · localStorage 없음)

- **`lessonText.js`** (E1): `hasBatchim` · `josa(name, pair)` · `fillText(text, { player, coach, season })` · `speechOf(data, charId)` · `pickText(ev, charId, data)` (반말판 고르기).
- **`lessonEvents.js`**:
  - E1: `EVENT_FILES` (파일 7개 이름 — app · helpers · 도구가 같은 목록인지 테스트로 본다), `allEvents(data)`, `eventById(data, id)`, `TRIGGERS` · `WHO_PICKS` · `COND_KEYS` · `SURPRISE_COND_KEYS` · `SCENE_IDS`, `validateLessonEvents(data)`.
  - E2: `pickProtagonist(state, data, ev, ctx, rng)` · `fireEvent(state, data, ev, ctx)` (`currentEvent = { eventId, playerId, supportId, charIds, kind, ctx }` · `usedEventIds` · phase event) · `getEventView(state, data)` · `resolveEvent(state, data, choiceIndex, { uid })` · `choiceScore(state, data, view, i)` (감독 AI 용 기대값 — §24.11).
  - E3: `eligible(state, data, trigger, opts)` · `pickWeekEvent` · `pickOutingEvent`.
  - E4: `coachReady(state, data)` · `storyNext(state, data, charId)` · `storyList(data)` (회상 — 화면이 쓴다) · `accountMerge(account, state)` (화면이 저장한 뒤 부른다).
- **`lessonEffects.js`**: E1 이 `EFFECTS` 스키마 표 · `effectErrors(eff, where)` 를 만든다. E2 가 `applyEffects(state, data, effects, ctx, rng)` · `describe(state, data, effects, ctx)` → `{ text, lines }` 를 만든다. 옛 `effects.js` 는 부르지 않고, 같은 범위 · 보정 규칙을 따라 다시 쓴다 [구현 결정 — 레슨 런은 결장 · 힌트 · 덱의 뜻이 달라 옛 함수에 맡기면 예외가 더 많다].
- **`lessonCommon.js`** (E2): `lessonRun.js` 의 `addToDeck` · `acquireBond` · `deckEntry` · `upgradable` · `coachSkillList` · `hintCandidate` · `drawHint` · `drawHintFrom` · `teachEntry` · `rollRewardOffer` · `declineSpOf` 를 옮긴다. `lessonRun` 은 그것을 import 하고 동작은 그대로다 (`lesson_sim` 숫자가 같다). `lessonEffects` 가 `lessonRun` 을 부르는 순환 import 를 막으려고 옮긴다.
- **`lessonSurprise.js`** (E5): `planSurprise(L, data, rng)` · `turnLogBlank()` · `condTrue(state, data, ev)` · `candidates(state, data)` · `pickSurpriseProtagonist` · `surpriseView`.

#### 24.5.2 `lessonRun.js` 공개 API (바뀜 · 새로)

| API | 슬라이스 | 뜻 |
|---|---|---|
| `getEventView(state, data)` | E2 | `run.getEventView` 다시 내보내기 → `lessonEvents.getEventView`. 지금 `screens/event.js` 가 그대로 읽을 수 있는 모양 (title · text · player · support · choices[{ text, preview }]) + `kind` · `badge` · `scene` · `art { charIds, supportId }` · `players` (짝) · choices[].`lines` · `.needs { op, candidates[{ uid, name, plus }] }` · `.recommended` |
| `resolveEvent(state, data, choiceIndex, { uid } = {})` | E2 | 고르는 선택지면 `uid` 가 꼭 있어야 한다 (검사를 먼저 하고 그 뒤에 바꾼다). `state.lastEvent = { seq, eventId, title, choice, branch, result, lines }` (화면의 결과 카드용) |
| `getCardOfferView` · `resolveCardOffer(state, data, { pick })` | E2 | phase `cardOffer` (pick = 0 ~ 2, null = 건너뛰기 TP +10) |
| `getWeekView().players[].story` | E4 | `{ next: 1 ~ 3 \| null, total: 3 }` — 외출 모달의 "이야기 2/3화" |
| `createRun({ …, account, legends })` | E4 · E6 | 계정 스냅샷 `{ stories: { [charId]: 0 ~ 3 }, coachMet: { [supportId]: true } }` · 레전드 (§24.9). 둘 다 없으면 빈 값 |
| `resolveSurprise(state, data, { choice })` | E5 | 레슨 깜짝 (`lesson.resolveSurprise` + `afterIfEnded`) |
| `memoryCardOptions(state, data)` · `validateLegends(data, legends)` | E6 | 메모리 카드 후보 · 레전드 검사 |

- **phase**: `STOP_PHASES` 에 `cardOffer` 를 더한다. `continueFlow` 는 들어갈 때 유물 후보 다음으로 `pendingCardOffer` 를 본다.
- **남은 수업 → SP** (E2): 마지막 시즌 `seasonEnd` (phase finished) 때 `pendingTeach` 가 남았으면 하나에 `declineSpOf` 씩 SP 로 바꾸고 로그를 남긴다. 이벤트 미리보기에도 "남은 레슨 없음 → SP +N" 이 뜬다.
- **코치 대상 기록** (E4): `playCard` 래퍼가, 낸 카드가 코치 카드면 `L.targeted` 앞뒤를 비교해 `state.coachTargets[supportId][playerId] += 1`.

#### 24.5.3 카드 고르기 · 3택1

- **"카드 1장 강화 · 삭제 (고른다)"** 는 새 단계 없이 한 번의 호출로 끝낸다. 뷰가 선택지에 `needs { op, candidates }` 를 붙이고, 화면이 덱 고르기를 연 뒤 `resolveEvent(i, { uid })` 를 부른다. 후보 · 검사는 상담과 같다 (`upgradable` · 덱 최소 5장).
- **"보상 카드 3택1"** 은 후보가 무작위라 고르기 전에 보여야 한다. 그래서 `state.pendingCardOffer = { cards: [{ cardId, plus }], src: eventId }` + phase `cardOffer` 를 쓴다. 레슨 보상 phase 는 빌려 쓰지 않는다 — `resolveReward` 가 queue 를 `weekEnd` 로 덮어써서 남은 이벤트 queue 가 사라진다.

#### 24.5.4 rng 를 쓰는 곳 (§8 에 더한다)

- **쓰는 곳**: 주 끝 랜덤 · 일반 외출 이벤트 고르기 (가중치), 주인공 무작위 · 같은 값 깨기, 효과 `random` 갈래 · `randomPlayer` · `stat random` · `coachHint` · `playerHint` · `rewardOffer` · `cardUpgradeRandom`, 깜짝 계획 (레슨 시작 때 2번 — **켜져 있을 때만**) · 깜짝 고르기.
- **쓰지 않는 곳**: 뷰 · 미리보기 · 감독 AI · `resumeWeek`.
- 바꾸는 함수는 들어갈 때 rng 를 한 번 열고 나갈 때 저장한다 (rng 를 쓰는 다른 함수를 부르기 전에 먼저 저장).
- 계정 진행 (이야기 · 코치 첫 만남) 은 `createRun` 옵션 스냅샷으로만 들어오므로 엔진은 순수하다. 그래서 **"다시 하기 (같은 seed)" 도 계정 진행이 바뀌었으면 다른 런이 될 수 있다** [구현 결정].

### 24.6 코치 연속 이벤트 (L50)

| 단계 | 조건 | 보상 방향 [가정] |
|---|---|---|
| 1 첫 만남 | 그 코치가 레슨에 처음 나온 주 (지원 컷인 · 코치 카드 사용 · 같은 종목 클리어 유대) · **계정에서 1회** | 작게 — 유대 +5 ~ 10 · {선수} 1스탯 +10 · 팀워크 +5 |
| 2 유대 40 | 유대 ≥ 40 · 1단계를 봤다 (이번 런 또는 계정) | 옛 유대 60 이벤트를 다시 쓴다. 그 코치 수업 액티브 1 (`teach`) + {선수} 스탯 +15 ~ 20, 또는 코치 카드 추가 (유대 +15) + 작은 덤 |
| 3 유대 80 | 유대 ≥ 80 · 2단계를 이번 런에 봤다 | 가장 크게. 수업 1 + 스탯 +25, 또는 7명 스탯 +6 · 컨디션. 코치 카드 강화판 · 파티 패시브 강화를 이야기로 받는다 (카드를 직접 강화하지 않는다, 초안 5.5) |

- **슬롯**: 주 끝 슬롯에 준비된 단계가 있으면 그것이 그 주의 이벤트다 (편성 순 · 낮은 단계 먼저 · 주당 1개). `events.coach.gapWeeks: 1` = 바로 앞 주 슬롯이 코치 이벤트였으면 이번 주는 주 끝 랜덤. 그래서 주 끝 랜덤이 런마다 최소 절반은 보인다.
- **첫 만남은 계정 1회** [구현 결정 · 기획자 확인 Q2]: 같은 첫 만남이 런마다 6개씩 되풀이되지 않게 한다. 계정에 본 기록이 있으면 1단계는 본 것으로 치고 건너뛰어 유대 40부터 시작한다. `events.coach.firstMeet: "run"` 이면 런마다 본다.
- **"레슨에 나왔다"**: 레슨이 끝날 때 (`afterLesson`) 그 레슨에서 지원 컷인 · 코치 카드 사용 · 같은 종목 클리어 유대 중 하나라도 있었으면 `state.coachSeen[supportId] = true`.
- **주인공** = `coachTarget` (§24.3.4). 코치 이벤트에서 {선수} 의 직접 대사는 간접 화법으로 쓴다 (초안 5.0 — 반말 · 존댓말이 갈리므로). 코치 대사는 그 코치의 말투.
- 옛 `ev_sp_*_60` · `supports.json eventIds` 는 옛 런 몫으로 그대로 둔다. 새 id 는 `ev_coach_<slug>_<1|2|3>` (slug = 코치 카드 id 의 뒷부분 — harr · celia · ornella · barbara · hanna · lumi · joy · irene).

### 24.7 외출 · 이야기 · 회상 (L25 · L30)

- **외출** = 기본 효과 (그 선수 체력 +20 · 7명 +10 · 컨디션 +1) **다음에** 외출 이벤트 1개:
  1. 그 선수의 다음 화 = `min(3, 계정에서 본 수 + 이번 런에 본 수) + 1`. 이 값이 3 이하이고 데이터에 있으면 **그 화가 확정**으로 뜬다.
  2. 아니면 일반 외출 6종 중 이번 런에 안 본 것에서 무작위 (6종을 다 보면 처음부터). 주인공 = 외출 상대.
- 무료 외출 (온천 다음 시즌 1주) 도 같다. 이벤트 뒤 같은 주로 돌아온다 (§24.2).
- **계정 진행**: 이야기 화는 **고른 순간 (resolve)** 에 본 것으로 센다 — 모달이 떠 있는 동안 새로 고침해도 잃지 않는다.
  - 엔진은 `state.storySeen` (이번 런에 본 이야기 id) 만 쌓는다.
  - 화면이 엔진 호출마다 저장한 뒤 계정 저장소에 합친다 (`accountMerge` — `stories[charId] = max(지금 값, 이번 런에 본 가장 큰 화)`, 여러 번 불러도 같다). 코치 첫 만남 (`coachMet`) 도 같은 길로 합친다.
- **계정 저장** (`js/ui/store.js`): `KEYS.account = 'soccer-lesson.account'` → `{ version: 1, stories: { [charId]: 0 ~ 3 }, coachMet: { [supportId]: true } }`. `clearRunSaves` · 저장 삭제 · 다시 하기는 이 키를 지우지 않는다. 읽기에 실패하거나 모양이 틀리면 빈 값으로 본다.
- **회상** (시작 화면 [회상]): 16명 × 3화 칸.
  - 본 화는 열 수 있다 — 흉상 · 배경 · 본문 · 두 선택지와 결과 문구. 효과 없이 읽기만 한다.
  - 안 본 화는 실루엣 · "?" 로 보인다. 다음 화에만 "외출하면 볼 수 있다" 를 적는다.
  - 진행 n/48. 엔진 상태와 상관없다 (데이터 + 계정 저장만 읽는다).
- **외출 모달**: 선수 줄마다 "이야기 n/3화" 배지 (다 봤으면 "일반 외출"). 감독 AI 는 안 본 화가 남은 선수 중 체력이 가장 낮은 선수를 먼저 외출 상대로 고른다 [구현 결정].

### 24.8 레슨 깜짝 이벤트 (L29)

규칙 (초안 0.3 · 1장): 레슨 시작 때 50% 로 "이번 레슨에 있다" 가 정해진다. 2턴 끝 ~ 마지막 바로 앞 턴 끝 중 **조건이 처음 맞는 턴 끝** (조건 이벤트) 또는 **정해 둔 무작위 턴 끝** (무작위 이벤트) 에 뜬다. 레슨당 최대 1개, 런당 같은 이벤트는 1번. 화면 전환 없는 말풍선이고, 효과는 대부분 이번 레슨 안이다.

- **계획** (`startLesson`, `planAttachTurns` 다음 — 켜져 있을 때만 rng): `L.surprise = { planned: rng.chance(0.5), randTurn: rng.int(fromTurn, turns − 1), pending: null, fired: null }`. 꺼져 있으면 rng 를 쓰지 않는다 → 1차와 같은 흐름 [구현 결정 — 해시 대신 rngState 를 쓴다. 켜면 레슨 뽑기 순서가 밀려 시뮬 기준선이 옮겨 간다].
- **턴 기록** `L.turnLog`: `beginTurn` 에서 비우고 `playCard` · `drawOne` · `benchPlayer` 가 쓴다. 담는 것 — 대상 (카드 · 모양 · 성공 · 실패), 실패 선수, 코치 카드 성공, 원 카드 3명 이상 모두 성공, 다시 섞기, 벤치, 자리 옮긴 선수, 턴 시작 때 빈 구역. 레슨 단위로 `L.streak` (단일 · 주인 카드 연속 대상 — 벤치에 앉으면 0) 도 센다.
- **띄우기** (`endTurn` 안. 마지막 턴 · 상한 검사 **뒤**, `L.turn += 1` **앞**):
  1. `planned && !fired && turn ≥ fromTurn` 일 때만 본다.
  2. 후보 = 조건이 지금 참인 조건 이벤트 + (turn = randTurn 이면) 무작위 이벤트.
  3. 거르기 = 런 1회 · 방침 · 편성 · 결장 · 쉼.
  4. 가중치로 고르고 주인공을 정해 `L.surprise.pending` 과 fx `{ t: "surprise" }` 를 남긴다.
  5. **다음 턴을 시작하지 않고 멈춘다.**
- **해결** `lesson.resolveSurprise(state, data, { choice })`: rng 열기 → 효과 → fx `{ t: "surpriseResult", text }` → `pending` 비움 → 점수 ≥ 상한이면 레슨 끝, 아니면 `L.turn += 1` · `beginTurn` → seq · lastFx · rng 저장.
- 기다리는 동안 `playCard` · `benchPlayer` · `endLessonTurn` 은 throw 한다 (`assertPlaying`). 뷰는 `surprise: { … }` 를 싣고 `canEndTurn: false` · `canBench: false`.
- **조건** `cond` (깜짝 — 모두 AND):

| 키 | 뜻 |
|---|---|
| `randomTurn: true` | 정해 둔 무작위 턴에만 (`special` · `zoneIn` 같은 레슨 조건과 함께 쓴다) |
| `turnMin` · `turnsLeftMax` · `halfway: true` | 턴 범위 (기본 범위 2 ~ 마지막 앞은 늘 걸린다), 절반이 지난 턴 (시즌 1 = 3턴 · 시즌 2 · 3 = 4턴) |
| `special: true` · `zoneIn: [..]` | 특별 레슨 · 중점 구역 |
| `buffAtLeast: { key, n }` · `buffEquals: { key, n }` | 방침 버프 (이벤트 최상위 `policy` 와 함께) |
| `scoreToTargetMax` · `scoreBelowTargetFrac` · `capLeftMax` · `notCleared` · `notPerfect` | 점수 |
| `anyStaminaBelow` | 결장 · 쉼 아닌 선수 |
| `failedThisTurn` · `coachCardOkThisTurn` · `multiOkThisTurn: n` · `reshuffledThisTurn` · `benchedThisTurn` · `targetStreak: n` | 턴 기록 |
| `char: { id, staminaMin, staminaMax, targetedMin, targetedMax, untargetedTurnsMin, zone, zoneCountMin, aloneInZone, movedThisTurn, targetedThisTurn, ownCardThisTurn }` | 선수 전용 (그 선수가 편성 · 결장 아님 · 쉼 아님은 늘 걸린다) |
| `zoneEmptyAtTurnStart: "<zone>"` | 그 턴 시작 때 빈 구역 (리시엘 — L47) |

- 새 8명 깜짝 (C5 · C6) 은 이 표의 키로만 쓴다. 표에 없는 조건이 꼭 필요하면 슬라이스 보고에 적고 I1 에서 정한다.
- **화면** (U4): 주인공 토큰 위 말풍선 (본문 1 ~ 2줄) + 아래에 선택지 2개 (미리보기 · 추천 배지). 손패 · 벤치 · [턴 끝] 은 잠근다. 고르면 결과 한 줄이 2.5초 뜬다.

### 24.9 레전드 · 메모리 카드 (L26 · L27)

- **남기기 (팀 등록)**: 결과 화면 [팀 등록] 옆에 "메모리 카드" 고르기 줄을 둔다.
  - 후보 = 이번 런 덱에서 고유 · 대비 · **코치** 카드를 뺀 것 (같은 카드 · 같은 강화는 한 칸) [구현 결정 — 코치 카드는 그 코치가 다음 편성에 없으면 고유 카드처럼 쓸모가 없다. 기획자 확인 Q5].
  - 감독 추천 (`manager.recommendMemoryCard` — 값이 높은 카드 · 강화판 먼저) 이 처음부터 골라져 있다.
  - 등록 팀에 `memoryCard: { cardId, plus }` 를 남긴다. 덱 전체는 여전히 저장하지 않는다 (D44). 옛 등록 팀은 메모리 카드가 없다.
- **데려가기 (편성)**: 코치 6장과 **따로** 레전드 칸 2개.
  - 등록 팀 목록 (최신순 · 이름 · 평가 · 메모리 카드 · 7명 얼굴) 에서 선수를 누르면 칸에 들어간다.
  - 같은 선수를 이번 런 선수로도 편성할 수 있다.
  - 같은 팀에서 둘을 데려가면 카드는 1장이다 (화면에 적는다).
  - 등록 팀이 없으면 칸을 잠근다.
- **엔진**: `createRun({ legends: [{ teamId, teamName, charId, name, memoryCard }] })`.
  - 화면이 등록 팀에서 **사본**을 넘긴다 (나중에 등록 팀이 50개 상한으로 지워져도 상관없다). 팀 id = `challenge.teamIdOf(team)`.
  - 검사: 2명까지 · 캐릭터 · 카드가 있다 · 카드가 고유 · 대비 · 코치 카드가 아니다.
  - 팀 id 로 중복을 빼고, 메모리 카드를 시작 덱 (고유 카드 뒤) 에 `{ uid, cardId, plus, src: "memory" }` 로 넣는다. `state.legends` 에 남긴다.
- **인자 없음**: 레전드의 스탯 · 힌트 · 적성 인자는 넣지 않는다 (초안 6.3 "나중에"). 레전드는 경기 · 평가에 아무것도 하지 않는다.
- 덱 화면 (상담 · 보상 · 덱 보기) 의 메모리 카드에는 작은 "메모리" 띠를 붙인다.

### 24.10 저장 v5 · 결정성

- `RUN_VERSION` 4 → **5**, `SAVE_VERSIONS` [1 ~ 5], `js/ui/store.js` 사본도 같이 바꾼다 (E2 — `outgame.test` 가 비교한다).
- `migrateV4toV5` (rng 없음 · 멱등) 는 2차 전체가 쓰는 필드를 **E2 에서 한 번에** 더한다:
  - 런: `storySeen: []` · `outingSeen: []` · `coachTargets: {}` · `coachSeen: {}` · `coachSteps: {}` (코치마다 이번 런에 본 단계) · `lastCoachTurnIndex: null` · `lastWeekEventId: null` · `usedEventSeasons: {}` (시즌 1회) · `account: { stories: {}, coachMet: {} }` · `legends: []` · `pendingCardOffer: null` · `lastEvent: null` · `eventSeq: 0`.
  - queue 의 `"supportEventCheck"` 는 별칭이라 그대로 둔다.
  - `currentEvent` 의 id 가 레슨 이벤트에 없으면 버린다 (v4 는 옛 `data.events` 를 썼다 — 꺼져 있어 실제로는 없다). phase 가 event 였으면 `continueFlow`.
  - 진행 중인 레슨: `L.surprise = { planned: false, … }` (그 레슨의 rng 흐름 그대로) · `L.turnLog` 빈 값 · `L.rested = []` · `L.nextExtraPlay = 0`.
- 결정성 규칙 (§8) 은 그대로다. 같은 seed · 같은 입력 · **같은 계정 스냅샷** → 같은 런. 새 상태는 모두 JSON 이다.

### 24.11 감독 AI · 도구

- **`manager`** (rng 없음):
  - `recommendEventChoice(state, data)` — 선택지 기대값이 큰 쪽, 같으면 0번. 기대값은 `lessonEvents.choiceScore` [가정]: 스탯 1점 = 1 · 체력 1 = 0.3 (체력이 낮을수록 ×2) · 컨디션 1 = 25 · 팀워크 1 = 3 · SP 1 · TP 1.5 · 유대 1 · 수업 40 · 패시브 힌트 20 · 카드 추가 30 · 강화 25 · 삭제 15 · 3택1 35 · 유물 50 · 결장 −40 · 레슨 점수 1 · 다음 카드 위력 1% = 0.8 · 실패 없음 15 · 손패 +1 = 30 · 추가 사용 = 80 · 버프 1 = 30. 확률이 걸리면 기대값. 고르는 선택지면 `recommendConsult` 와 같은 규칙으로 uid 를 고른다.
  - `autoStep`: event (추천 선택지) · `cardOffer` (보상 추천과 같은 규칙) · 레슨 깜짝 (뷰에 `surprise` 가 있으면 `resolveSurprise`) · 외출 상대 (§24.7).
  - `recommendMemoryCard(state, data)`.
- **`tools/lesson_sim.mjs`**: `--events on|off` (기본 = 데이터), `--account fresh|carry` (fresh = 런마다 빈 계정, carry = 시뮬 안에서 계정이 쌓인다), `--legends <n>` (앞 런의 등록 팀에서 레전드). 새 지표는 §24.16.
- **`tools/lesson_play.mjs`** (실제 브라우저): event · `cardOffer` · 깜짝 · 외출 이야기 · 레전드 편성을 처리한다 (I1).
- **`tools/events_doc.mjs`** (E1): 이벤트 데이터 → `docs/LESSON_EVENTS.md`. 한국어, 초안과 같은 꼴 (트리거 줄 · 주인공 · 본문 · 선택지 표 — 미리보기는 `describe` 를 예시 주인공으로 · 반말판 · notes). 기획자는 이 문서로 글을 검토한다. **생성물이라 손으로 고치지 않는다** (I1 이 마지막에 만든다).

### 24.12 일러스트

#### 24.12.1 파이프라인 (A1, 새 npm 패키지 없음)

- **원본**: `art/characters/<slug>.png` 16장 · `art/coaches/<slug>.png` 8장 (1024×1536). `art/` 는 배포에서 빠지므로 원본으로만 쓴다.
- **자르기 명세** `art/portraits.json` (손으로 고친다, 배포 안 됨): 캐릭터마다 얼굴 중심 x · y · 머리 높이 head. 프리셋은 head 의 배수다.

  ```json
  { "version": 1, "sourceSize": [1024, 1536],
    "presets": { "face": { "w": 1.8, "h": 1.8, "top": 0.85, "out": [256, 256], "quality": 0.85 },
                 "bust": { "w": 3.6, "h": 4.5, "top": 1.3, "out": [384, 480], "quality": 0.82 },
                 "half": { "w": 4.4, "h": 6.6, "top": 1.4, "out": [512, 768], "quality": 0.8 } },
    "chars":   { "ch_spirit_keeper": { "file": "characters/neria.png", "x": 380, "y": 240, "head": 130 } },
    "coaches": { "sp_coach_harr":    { "file": "coaches/harr.png", "x": 0, "y": 0, "head": 0 } },
    "scenes":  { "ground": { "file": "scenes/ground.png", "out": [1280, 853], "quality": 0.8 } } }
  ```

  자르는 칸 = `w·head × h·head`. 가운데가 x, 위 끝이 `y − top·head`. 원본 밖으로 나가면 안으로 밀어 넣는다 (빈 칸을 채우지 않는다). 프리셋마다 `dx` · `dy` · `scale` 로 덮어쓸 수 있다.
- **`tools/portraits.mjs`**:
  - `tools/shot.mjs` 의 `startServer` · `findBrowser` + `puppeteer-core` 로 원본을 같은 origin 에서 열고, canvas 로 잘라 `toBlob('image/webp', q)` 로 저장한다.
  - 출력: `img/portraits/<dataId>.<face|bust|half>.webp` · `img/scenes/<id>.webp`, 목록 `data/portraits.json` (`{ version, presets, chars: { id: { v } }, coaches, scenes }`). v = sha1 앞 8자 — 주소 뒤 `?v=` 로 붙여 Pages 캐시 (약 10분) 를 피한다.
  - `--sheet <png>` = 검토용 한 장 (얼굴 128 · 64 · 40 · 22 원형 + 흉상 + 반신).
  - Chrome 이 필요해 `npm test` 밖에서 돌리고, 결과물을 커밋한다.
- **선수 시작값** (조사 때 한 번 맞춘 값 — 브론테 · 헤르타 · 미르카 · 온디나는 검토 한 장에서 한 번 더 본다):

  | 파일 | charId | x | y | head |
  |---|---|---|---|---|
  | adeline | ch_human_captain | 520 | 225 | 130 |
  | bronte | ch_spirit_striker | 430 | 240 | 130 |
  | camila | ch_human_header | 500 | 215 | 130 |
  | connie | ch_rabbit_fullback | 534 | 474 | 150 |
  | dorbina | ch_dwarf_wall | 440 | 200 | 150 |
  | greta | ch_giant_striker | 480 | 180 | 130 |
  | herta | ch_giant_keeper | 430 | 225 | 130 |
  | hildi | ch_dwarf_finisher | 470 | 285 | 150 |
  | mirka | ch_cat_trickster | 395 | 215 | 150 |
  | naelis | ch_elf_regista | 450 | 190 | 130 |
  | neria | ch_spirit_keeper | 380 | 240 | 130 |
  | ondina | ch_spirit_dribbler | 410 | 300 | 150 |
  | risiel | ch_elf_archer | 470 | 190 | 130 |
  | silluen | ch_elf_playmaker | 500 | 205 | 130 |
  | taria | ch_human_runner | 360 | 205 | 150 |
  | ulrika | ch_wolf_winger | 480 | 205 | 130 |

- **코치 8명**은 A1 이 같은 방법으로 처음 맞춘다 (키 = 서포트 id: harr = `sp_coach_harr` · celia = `sp_wind_dancer` · ornella = `sp_elder_sage` · barbara = `sp_iron_captain` · hanna = `sp_mountain_monk` · lumi = `sp_bard_lumi` · joy = `sp_street_striker` · irene = `sp_river_scholar`).
- **크기**: 선수 16 × 3 ≈ 1.45MB, 코치 포함 약 2.2MB, 배경 7장 약 1MB.

#### 24.12.2 화면 도우미 (U1, `js/ui/art.js` 새)

- `portraitUrl(data, id, preset)` → `./img/portraits/<id>.<preset>.webp?v=…`. **목록에 없으면 null** (상대 팀 · 유스 · 그림 없는 것). 파일 이름을 짐작해 불러 보지 않는다 — `tools/shot.mjs` 는 404 를 오류로 센다. `sceneUrl(data, id)` 도 같다.
- `dom.avatar(color, name, size, cls, { art })`: 지금처럼 색 원 + 첫 글자를 만들고, art 가 있으면 그 위에 `<img class="pt" alt="" draggable="false" decoding="async">` 를 얹는다 (절대 위치 · `object-fit: cover` · `border-radius: inherit` · `pointer-events: none` · `-webkit-user-drag: none`). **글자는 남긴다** — 그림이 늦거나 실패해도 글자가 보이고, `textContent` 를 읽는 테스트도 그대로 통과한다.
- `charIdOf(ctx, playerId)`: `charId` 가 없는 뷰 (레슨 · 이벤트 · 미팅 · 보상) 는 `store.run.players` 에서 찾는다 (엔진 뷰는 고치지 않는다). 경기는 `store.match[side].players` (스냅샷에 `charId` 가 있다, `layout.js` 는 그대로).
- `preloadArt(urls)`: 컷인 그림을 화면이 열릴 때 미리 불러 `decode()` 한다 (`decode` 가 없으면 건너뛴다 — jsdom 은 그림을 불러오지 않는다). 그림을 기다리느라 그리기를 미루지 않는다.
- 끌기 안전: 그림은 `.tok-face` · `.lu-card` · 벤치 칸의 pointer 끌기를 가로채지 않는다 (위 `pointer-events` · `draggable`). 이벤트 리스너는 지금처럼 span 에 둔다.

#### 24.12.3 얼굴 자리 (U1)

| 화면 | 자리 (지금 크기 px) | 그림 |
|---|---|---|
| 편성 | 필드 칸 카드 (30 → 44) · 선수 풀 16장 (22) · 선수 고르기 모달 (30) · 코치 칩 (22) · 끌기 유령 (30, `lineup` 에 `faceOf`) | 얼굴 |
| 주 · HUD | 명단 (22) · 코치 유대 줄 (22) · 외출 모달 (40) | 얼굴 (외출 모달 흉상은 U3) |
| 레슨 | 경기장 토큰 `.tok-face` (40 — 크기 그대로, 겹침 검사가 이 상자를 쓴다) · 조준 유령 · 끌기 유령 (40) · 벤치 (26) · 명단 (22) · 선수 정보 (30 → 48) · 카드 코치 칩 (14) · 지원 줄 (18) · 능력 알약 (28) · 고유 카드 앞면 주인 색 띠 (작은 얼굴) | 얼굴 |
| 보상 · 수업 | 힌트 칩 (16) · 선수 결과 (30) · 수업 선수 고르기 (30) · 가르치는 코치 (52 → 흉상 64×80) | 얼굴 · 흉상 |
| 상담 · SP 상점 · 경기 전 준비 | 고유 카드 삭제 확인 (22) · 상점 줄 (30 · 22) · 파티 패시브 (18) · 결장 배지 (22) · 미팅 칸 (30) | 얼굴 |
| 경기 (**U2** — 경기 화면 파일은 U2 만 고친다) | 토큰 `.tok-face` (44 — 우리 팀 · 도전 모드 상대만, 그림 없는 상대는 글자) · 선수 미니 카드 (40) | 얼굴 |
| 결과 | 선수 줄 (40 → 흉상 56×70) | 흉상 |
| 이벤트 (지금 모달) | 등장 인물 (40) | 얼굴 (새 모달은 U3) |

30px 이하 자리는 얼굴 그림을 `transform: scale(1.2)` 로 조금 당긴다 (22px 에서는 머리색으로 읽힌다).

#### 24.12.4 컷인 (U2 — 요청 ④)

- **레슨 코치 컷인** `.ls-cutin` (`screens/lesson.js` `showCutin`, `css/lesson.css`):
  - 띠 왼쪽 3분의 1 에 코치 **반신** (약 240×360). 아래 끝은 띠 아래 테두리에 맞추고, 머리 · 어깨가 띠 위로 120 ~ 190px 솟는다. 띠의 −4° 기울기를 따르는 `clip-path`.
  - `.short` 컷인은 흉상.
  - `.lc-face` 는 DOM 에 남긴다 (테스트가 글자를 읽는다). 그림이 있으면 그 칸이 그림을 담는다.
  - 글 (`.lc-txt b` · `.lc-sub` · `.lc-line`) 이 잘리지 않게 한다 (`shot.mjs` 잘림 검사). 줄인 움직임 설정에서는 지금처럼 컷인을 건너뛴다.
- **경기 필살기 컷인** `.m-cutin` (`screens/match.js` `cutCard`, `css/match.css`):
  - SSR = 반신 약 260×390 이 자기 편 쪽에서 미끄러져 들어와 띠에 겹친다 (머리가 띠 위로). SR = 흉상 180×225 창 (띠 위로 50px). R = 지금 64 원에 얼굴.
  - **역방향 컷인** (세이브 · 블록 · 패스 끊기) = 수비 선수 흉상 (기울기 +4°).
  - **합체기 이름 카드** = 패스한 선수 · 받은 선수 흉상을 양쪽에.
  - 원정 쪽은 스냅샷에 `charId` 가 있고 그림이 있을 때만 (도전 모드). 아니면 지금 글자 칸.
  - 그림을 **좌우로 뒤집지 않는다** (머리핀 · 비대칭 장식이 뒤집힌다). `object-position` 으로 맞춘다. 줄인 움직임 설정에서는 그림도 멈춘다.
- **지키는 클래스 · 글**: `.cut.part-2` · `.cut-save` · `.cut-rev.rev-block` · `rev-passCut` · `.ut-defense.tier-SR` · `.tier-R` · `.cut-type` · `.cut-line` (ui.smoke), `.cut-line` 최대 폭 620, `shot.mjs` 잘림 검사 (`.m-cutin .cut-line` · `.cut-txt b` · `.cut-txt small`).
- **미리 불러오기**: 화면이 열릴 때 컷인 그림을 불러 둔다 (레슨 = 편성 코치 6명 반신 · 흉상, 경기 = 양 팀 필살기 보유자 반신 · 흉상 · 얼굴). 컷인이 0.6 ~ 1.0초라 그때 불러오면 빈 띠가 보인다.

#### 24.12.5 새로 그릴 그림 (A2 — 요청 ③, 7장만)

사람이 없는 **배경**만 그린다 [구현 결정 — 여러 캐릭터를 한 장에 그리면 확정 외형이 어긋나기 쉽다. 사람은 이미 확정한 일러스트를 잘라 겹친다]. 1536×1024 가로, 확정 그림체 (셀 채색 · 단순한 배경 · 저녁 하늘 그라데이션), 글자 · 로고 · 문장 무늬 없음.

| id | 장소 | 쓰는 곳 |
|---|---|---|
| `title` | 노을 진 신생 클럽 경기장 전경 (조명탑 · 빈 관중석 · 잔디) | 시작 화면 키 아트 배경 (+ 선수 반신 5명을 CSS 로 겹친다) |
| `ground` | 낮 훈련장 (콘 · 골대 · 클럽하우스 벽) | 주 끝 기본 · 둘만의 특훈 · 코치 이벤트 기본 · 명문 캠프 루트 |
| `clubhouse` | 밤 숙소 안 (대전쟁 막사를 고친 숙소 · 난로 · 긴 식탁) | 고민 상담 · 밤 · 숙소 이벤트 |
| `town` | 낮 마을 장터 거리 (노점 · 빵집 · 등불) | 맛집 탐방 · 쇼핑 · 마을 이벤트 |
| `stands` | 경기장 관중석과 선수 입장 터널 (경기 전 저녁) | 시즌 시작 · 경계전 전야 · 경기 관전 · 소식지 |
| `nature` | 오후 물가 언덕 (호수 · 들판 · 먼 산) | 이야기 기본 · 원정 루트 · 바깥 이벤트 |
| `onsen` | 산속 온천 (김 · 바위 · 나무 난간) | 온천 루트 · 휴식 이벤트 |

- 이벤트에 `scene` 이 없으면 트리거 기본값을 쓴다 (week · coach = ground, story · outing = nature, seasonStart · preMatch = stands, route = 루트마다 — camp ground · expedition nature · hotspring onsen). 그림이 아직 없으면 CSS 그라데이션.
- **만드는 법** (메모리 `art-pipeline-tools`): `codex exec --skip-git-repo-check --ephemeral -s workspace-write -C <dir> -m gpt-6-astra -c 'model_reasoning_effort="xhigh"' -i art/characters/silluen.png -i art/characters/neria.png --json -o last.txt - < prompt.txt` (프롬프트 첫 줄 `$imagegen`, 배경 그림체 참고로 확정 두 장을 넣는다). 프롬프트는 `art/scenes/prompts/` 에 남기고, `art/scenes/README.md` 에 목록 · 검토 메모를 적는다.
- **나중 (이번 범위 밖)**: 이야기 3화 CG (16장 → 48장), 상대 팀 주장 · 문장, 카드 앞면 그림, 루트 · 유물 · 주 행동 아이콘 (지금 이모지).

### 24.13 화면 (1280×720 · 915×412 터치, 스크롤 · 잘림 없음)

- **이벤트 모달** (U3, `screens/event.js` 를 다시 짠다):
  - 위 = 배경 띠 (scene, 약 200px). 그 위에 제목 · 종류 배지 ("주 끝" · "시즌 시작" · "경계전 전야" · "루트" · "외출" · "이야기 2/3화" · "코치 · 첫 만남 / 유대 40 / 유대 80").
  - 왼쪽 = 흉상 (주인공 · 코치 · 짝이면 둘). 오른쪽 = 본문 + 선택지 2개 (감독의 결정 · 미리보기 줄 · 감독 추천 배지).
  - 고르는 선택지는 덱 고르기 (상담 덱 칸과 같은 카드 앞면) → 확인.
  - **결과 카드**: 고른 뒤 같은 자리에 결과 문구 + 받은 효과 줄 + [계속]. 화면 전용이고 엔진 단계가 아니다 (`state.lastEvent` 로 그린다 — 새로 고침하면 보이지 않는다).
- **카드 3택1** (U3): phase `cardOffer`. 보상 모달의 카드 칸 · [건너뛰기 (TP +10)] 를 빌려 쓴다. 배경은 주 화면 (조작 불가).
- **외출 모달** (U3): 선수 줄 = 흉상 + 이름 + 체력 + "이야기 n/3화" 또는 "일반 외출".
- **회상** (U3): 시작 화면 [회상] → 새 화면 (`store.screen = 'recollection'`). 4 × 4 얼굴 칸 (진행 n/3) → 고르면 3화 목록 → 읽기 모달.
- **시작 화면 키 아트** (U3): `.hero` 792×688 (지금 CSS 경기장 + ⚽) 를 `title` 배경 + 선수 반신 5명 (CSS 겹침) 으로.
- **깜짝 말풍선** (U4): §24.8. 터치 화면에서 말풍선이 필드 밖으로 나가면 필드 위쪽 가운데로 옮긴다.
- **레전드 · 메모리** (U5): 편성 화면 코치 패널 머리에 [레전드 n/2] → 모달. 고른 레전드 칸 2개 (얼굴 · 이름 · 팀 · 메모리 카드 · ✕). 결과 화면에 메모리 카드 고르기 줄. 덱의 "메모리" 띠.
- **라우팅** (`app.js`): `cardOffer` → 배경 + 3택1 모달, `recollection` 화면. `actions.resolveEvent(i, { uid })` · `resolveCardOffer` · `resolveSurprise` · `registerTeam({ memory })`. `startRun` 이 `account: loadAccount()` · `legends` 를 넘기고, `engine()` 이 저장한 뒤 `accountMerge`.
- **이벤트 배경** (`renderBackdrop` = 주 화면 비활성): 시즌 시작 이벤트 때는 `weekOffer` 가 아직 없다. `getWeekView` 가 이것을 받아 주는지 확인한다 (지금 `state.weekOffer || { kind }`).

### 24.14 콘텐츠 작업

#### 24.14.1 초안 → 데이터 옮기기 규칙 (C1 ~ C4 · C7 — 초안 뒤에 바뀐 규칙 L32 ~ L52 를 반영)

| # | 초안 | 데이터 |
|---|---|---|
| R1 | "결장 (그 사이 친선전 · 경계전도)" | `injury` — 레슨 1회만 (§18.1). 경기 결장 문구를 지운다 |
| R2 | "힌트 1 (편성 코치 스킬 중 무작위)" | 코치 쪽 장면 → `coachHint { from: "fielded" }` (= 코치 수업). 선수 쪽 장면 (외출 · 선수 이벤트) → `playerHint` (그 선수 패시브) |
| R3 | "○○ 힌트" — 패시브 | `playerHint { skillId }` — 주인공 목록 안일 때만. 일반 {선수} 이벤트는 skillId 없이 (그 선수 목록에서). 목록 밖을 지정했으면 그 선수 고유 패시브로 (예: 타리아 1화 마지막 힘 → 지치지 않는 다리) |
| R4 | "○○ 힌트 (2)" — 액티브 | 코치 이벤트 · 코치 편성 조건 이벤트 → `teach { skillId, supportId }` (수업 1번. "힌트 2" 는 수업 1 + 스탯 +5 ~ 10). 선수 전용이 아닌 일반 이벤트 → `teach { skillId }` (supportId 없이 — 가르치는 편성 코치를 엔진이 찾는다). 선수 전용 이벤트 · 이야기 → 그 선수 패시브 힌트나 스탯으로 바꾼다 (액티브는 코치에게서, L48) |
| R5 | "라인 · 공격진 · 수비진 카드" | 원 카드 3명 이상 모두 성공 (`multiOkThisTurn: 3`) |
| R6 | "쉬기 턴" | 벤치를 쓴 턴 (`benchedThisTurn`). `ls_hot_hand` 의 연속 대상은 단일 · 주인 카드만 센다 (`targetStreak`) |
| R7 | "수비 · 피지컬 레슨" · "패스 · 드리블 레슨" | 중점 구역 `zoneIn` |
| R8 | 방침 이벤트 주인공 "GK · DF 중" · "MF · FW 중" | 구역 기준 — `who { pick: "highestStamina", zone: "defense" }` 처럼 (탈취 = 수비 구역, 점유 = 패스 구역) |
| R9 | "자율 훈련" 언급 | 기본 훈련 (L34) |
| R10 | "다음 경계전 1회만 컨디션 +1" · "이번 경계전 간파 · 슛 위력" · "이번 시즌 레슨 상승 +10%" | `goalCondition` · `modifier` (season) |
| R11 | "보상 카드 3택1" · "카드 1장 강화 / 삭제 (고른다)" · "무작위 1장 강화" · "덱에 「…」 추가" | `rewardOffer` · `cardPick` · `cardUpgradeRandom` · `cardAdd` (원투 패스 `cd_one_two` · 아이싱 `cd_icing` · 전술 보드 `cd_tactics_board` · 코치 카드 `cd_c_*`) |
| R12 | "도르비나판" | `alt.banmal` — 누구에게나 맞는 반말로 다듬는다 (§24.3.5) |
| R13 | 조사 `{선수\|이/가}` | 역슬래시를 뺀다 |
| R14 | 손으로 쓴 미리보기 | 버린다 (자동으로 만든다). 수치는 효과로 옮긴다 |
| R15 | `ev_kit_tailholes` "울리카 또는 미르카" | `chars` (any) 에 코니 (솜꼬리) 를 더한다 |
| R16 | `ev_wandering_healer` 가중치 3 조건 | "결장 중인 선수가 있으면" (`weightIf anyInjured`) [가정 · Q7] |
| R17 | `ev_summon_letter` 등 1차 이전 효과 | 호출권 · 훈련 칸은 없다 (검사가 막는다) |
| R18 | 아델린을 "그" 주장으로 쓴 글 (L46 — 주장이 둘) | 아델린 전용 글은 그대로 둔다. 일반 글에서는 "주장" 을 한 사람으로 가리키지 않는다 |

#### 24.14.2 새로 쓰기 (C4 일반 외출 6 · C5 · C6 · C7)

- **형식 · 문체 · 조사 · 반말판** = 초안 0장 · §24.3.5. 이야기는 장면 3 ~ 4줄, 일반 · 코치는 2 ~ 4줄, 깜짝은 1 ~ 2줄. 선택지의 따옴표 = 감독이 건네는 말.
- **이야기 (새 8명 24화)** — 초안 4.0 그대로:
  - 보상은 1화 < 2화 < 3화. 3화 A = `uniquePlus` + 작은 덤, 3화 B = 스탯 합 24 ~ 40 + 팀워크 · 카드 · 경계전 1회 컨디션.
  - 위험한 선택지는 한 사람에 1개까지. 런 시점 (몇 주째 · 몇 번째 경계전) 에 기대지 않게 쓴다.
  - 깨닫는 장면은 이야기에만 둔다 (깜짝과 주제가 겹치지 않게).
  - 캐릭터마다 `notes` 에 "이야기 줄기" 1줄 + "새 설정 [가정]" 을 먼저 정한다.
- 패시브 힌트는 그 선수 목록 (`characters.json passiveIds`) 에서만, 액티브는 주지 않는다 (R4).
- **설정 충돌 정리** [가정 — 기획자 확인 Q10]:
  - 주장 둘: 헤르타 = 골문 뒤에서 팀을 부르는 맏언니 (산맥 수정굴 경기장 주장 출신, 은색 완장). 아델린 = 필드의 주장 (붉은 천 완장 · 「내 탓」 노트). 두 사람이 한 장면에 나오는 이벤트는 이번에 쓰지 않는다.
  - 대장장이 집안 둘: 힐디 (대장간 집 막내) 와 도르비나 (광산촌 대장장이 어머니) 는 같은 산맥의 다른 마을 출신이고, 서로 이름만 아는 사이. 짝 이벤트 (C6) 에서 처음 만난다.
  - 정령: "물가를 오래 떠나면 몸이 무거워진다" 는 물의 정령 (네리아 · 온디나) 만. 번개 정령 브론테는 "맑은 날이 길면 몸이 근질거린다".
  - 엘프 셋은 서로 다른 사회 — 숲 (실루엔) · 바다 (나엘리스, 남쪽 군도) · 고원 (리시엘, 폭풍 고원 궁수). 실루엔 2화의 숲 설정과 섞지 않는다.
  - 조약 기관 출신 둘 (나엘리스 = 조약 함대 항해사 · 타리아 = 조약 사무소 전령) 은 아는 사이로 쓰지 않는다.
  - 거인 둘: 그레타 1화의 "거인은 원래 다 이렇게 신어요" 는 그레타의 농담이다. 헤르타 글에서 거인 축구화 소재를 다시 쓰지 않는다.
  - 외형은 일러스트 기준 (`art/characters/README.md`): 헤르타 남색 낮은 포니테일 · 작은 수정 뿔 · 은색 완장, 브론테 보랏빛 번개 줄무늬 머리, 나엘리스 조개 땋은 머리 · 놋쇠 나침반, 온디나 끝이 물로 변하는 머리 (단신), 리시엘 하늘색 높은 포니테일 · 활 팔 보호대, 코니 한쪽 접힌 귀 · 솜꼬리 · 당근 머리핀 (단신), 카밀라 진분홍 머리 · 닻 머리핀, 힐디 구릿빛 양갈래 · 대장장이 고글 · 공구 주머니 (단신).
- **새 8명 깜짝** (한 명에 1개, §24.8 조건 표로) — 제안:
  - 헤르타 = 자기 구역에 3명 이상 (`char.zoneCountMin: 3`, 호령)
  - 브론테 = 슈팅 구역에 서서 2턴째 대상이 안 됨 (`char.zone: "shoot"` + `untargetedTurnsMin: 2`)
  - 나엘리스 = 자기 고유 카드가 성공한 턴 (`ownCardThisTurn`)
  - 온디나 = 자리 옮기기 · 가로지르기로 구역을 바꾼 턴 (`movedThisTurn`)
  - 리시엘 = 턴 시작에 슈팅 구역이 비었다 (`zoneEmptyAtTurnStart: "shoot"`)
  - 코니 = 혼자 한 구역에 있다 (`aloneInZone`)
  - 카밀라 = 같은 구역에 3명 이상 + 슈팅 구역
  - 힐디 = 체력 30 미만 (`char.staminaMax: 29`, 가중치 3 — `ls_running_on_empty` 와 같은 턴이면 힐디 전용이 먼저 뽑히기 쉽게)
- **새 8명 주 끝 단독 4 + 짝 2 (슬라이스마다)**:
  - 단독 소재 예: 헤르타 수정굴 · 호령 / 브론테 번개 치는 밤 / 나엘리스 함대에서 온 해도 / 온디나 밀물 장난 (미르카 장난과 다르게) / 리시엘 과녁 연습 / 코니 굴 · 겁 / 카밀라 등대 · 공중볼 / 힐디 대장간 "작품".
  - 짝: C5 = 실루엔 × 브론테 (합체기 풍뢰일섬) · 네리아 × 온디나 (물 정령). C6 = 리시엘 × 카밀라 (합체기 하늘 과녁) · 도르비나 × 힐디 (드워프).
- **코치 연속 이벤트 24** (C7):
  - 단계 · 보상은 §24.6 표. 코치 설정: 하르나 득점왕 · 셀리아 바람 축제 무희 · 오르넬라 조약 리그 초대 전술가 · 바르바라 은퇴한 철벽 · 한나 산사 · 루미 떠돌이 음유시인 (피지컬 코치, L28) · 조이 항구 3번 부두 · 이레네 강변 서고 학자. 외형은 `art/coaches/README.md`.
  - 옛 유대 60 의 어긋난 보상은 고친다: 하르나 B 막판 집중 · 오르넬라 A 연계의 달인 · 한나 B 큰 경기 체질 · 조이 B 언더독 = 패시브 → 수업이나 주인공 패시브 힌트로. "힌트 2" → 수업 1.
  - 1단계는 코치의 됨됨이를 보여 주는 짧은 장면, 3단계는 그 코치 이야기의 마무리 (파티 패시브가 한 단계 오르는 것과 잇는다).
- **일반 외출 6종** (C4): OUTGAME_LESSON_draft 6.2 표의 효과 그대로 — 맛집 탐방 · 쇼핑 · 둘만의 특훈 (B 의 "50%: 힌트 1 (편성 코치 스킬)" 은 선수 쪽 장면이라 R2 에 따라 `playerHint`) · 고민 상담 · 경기 관전 · "{선수}의 이야기". {선수} 는 아무 선수나 될 수 있으므로 개인 소재 없이 쓰고, 반말판을 붙인다.

### 24.15 테스트

- **새 파일** (E1 이 빈 틀로 `package.json` 에 등록하고, 슬라이스가 채운다):
  - `lessonEvents.test` (E1 ~ E4)
  - `lessonContent.test` (E1 · E2 · E5) — **실제 데이터**: 검사 통과 · 모든 선택지가 만든 상태 위에서 오류 없이 적용 · 깜짝 효과 · 이야기 · 코치 단계 개수 · 반말판 길이
  - `lessonSurprise.test` (E5) · `legends.test` (E6)
  - `portraits.test` (A1) — 목록 ↔ 파일 ↔ 캐릭터 · 코치 id, 파일 크기 한도, `js` · `css` · `index.html` 에 `art/` 경로 없음
  - `eventsUi.test` (U3 ~ U5, jsdom)
- **기존 테스트는 이벤트를 끈 데이터가 기본이다.** `test/helpers.mjs loadData()` 는 `lesson.events` 를 모두 끈 사본을 돌려준다 (`loadData({ events: true })` = 데이터 그대로). jsdom 앱 테스트의 fetch 도 같은 옵션을 갖는다 (E1). 그래서 I1 이 데이터 스위치를 켜도 기존 흐름 테스트가 흔들리지 않는다. 이벤트 테스트는 켠 데이터 + **테스트 안의 고정 이벤트**를 쓴다 (실제 콘텐츠에 기대지 않는다).
- **꼭 볼 것**:
  - 스위치를 모두 끄면 1차와 같은 최종 상태 (같은 seed 15주 완주 비교).
  - 같은 seed → 같은 이벤트, JSON 왕복, Math.random · Date 없음.
  - v1 ~ v4 → v5 (주 · 레슨 중 · 보상 · 상담 · 경기 · 이벤트 중), 멱등.
  - 무료 외출 뒤 offer 그대로, 외출 주에는 주 끝 랜덤 없음, 시즌 시작 · 전야 · 루트 순서.
  - 코치 단계 순서 · 간격, 계정 스냅샷 (이야기 다음 화 · 첫 만남 건너뛰기), 남은 수업 → SP.
  - 깜짝 계획 rng (끄면 rng 그대로), 기다리는 동안 카드 내기 throw.
  - 레전드 검사 · 같은 팀이면 카드 1장.
- `npm test` 는 지금 385 (§23). 늘어난 수는 슬라이스마다 보고한다.

### 24.16 시뮬 · 스크린샷

- **시뮬** (밸런스는 고치지 않는다): `node tools/lesson_sim.mjs --runs 200 --seed 1`, 방침 5개. **전 = E1 시작점 (이벤트 없음)**, **뒤 = I1 (스위치 켬)**. 계정은 fresh · carry 둘 다.
  - 표: 런당 이벤트 수 (종류별) · 런 시간 어림 (이벤트 하나 12초) · 코치 단계 도달 (1 · 2 · 3) · 이야기 화 / 런 · 깜짝 / 런 (id 별) · 이벤트로 얻은 스탯 · TP · SP · 수업 · 카드 · 유물 · 결장 · 남은 수업 → SP · 레슨 점수 · 퍼펙트율 · 성장 · 평가 점수 · A 비율 · 경계전 승률.
  - 레전드 (`--legends 2`) 한 줄.
  - 엔진 슬라이스 (E2 ~ E6) 마다 "스위치를 끄면 앞 슬라이스와 숫자가 같다" 를 확인한다.
- **스크린샷** (`node tools/shot.mjs <dir> --only og` + 경기 장면):
  - 새 장면: `og_event_week` · `og_event_banmal` · `og_event_pair` · `og_event_coach1` · `og_event_coach3` · `og_event_story` · `og_event_pick` · `og_event_result` · `og_card_offer` · `og_outing_story` · `og_season_start` · `og_recollection` · `og_recollection_read` · `og_lesson_surprise` · `og_lesson_surprise_result` · `og_lesson_cutin` · `og_lesson_cutin_short` · `og_setup_legends` · `og_setup_legend_pick` · `og_result_memory` · `og_start_keyart`.
  - 터치 915×412: `og_event_week_touch` · `og_lesson_surprise_touch` · `og_recollection_touch`.
  - 경기 13 (합체기) · 27 (수비 블록) · 30 (팀 필살기) · 34 (SR 대사) 는 그림이 든 채로 다시 찍는다.
  - 모든 장면 오류 0 · 스크롤 0 · 잘림 0 · 겹침 0 · 404 0. PNG 를 직접 연다.
- `shot.mjs` 는 찍기 전에 `document.images` 가 모두 `complete` 이고 `decode()` 될 때까지 기다린다 (최대 3초, U1).

### 24.17 구현 슬라이스 (순서대로, 슬라이스 하나 = 에이전트 하나)

공통 완료 조건:
- 브랜치 `outgame-lesson` 그대로. 브랜치를 바꾸지 않고, 커밋 · 푸시 · stash 하지 않는다 (커밋은 오케스트레이터가 한다). main 은 건드리지 않는다.
- `npm test` 통과 (지금 385).
- `git diff --stat 9013725 -- js/engine/rng.js js/engine/run.js js/engine/training.js js/engine/effects.js js/ui/layout.js data/config.json data/events.json data/supports.json data/routes.json` 이 비어 있다. `js/ui/screens/match.js` · `css/match.css` 는 U2 만 고친다.
- 줄 끝은 파일 그대로 (저장소 `.gitattributes` = `eol=lf`). UI 문구 · 이벤트 글은 한국어.
- 엔진은 순수 · 결정적 (§8 · §24.5.4).
- 바뀐 점 · [구현 결정] 은 끝 보고에 적는다. 문서 (§24.19 · ARCHITECTURE · README · 초안) 는 **I1 만** 고친다.
- 파일 주인: 슬라이스의 "파일" 밖은 고치지 않는다. 같이 달리는 슬라이스끼리 같은 파일을 만지지 않게 나눴다.

| 갈래 | 슬라이스 | 앞 슬라이스 | 같이 달릴 수 있는 것 |
|---|---|---|---|
| 기반 | E1 | — | 없음 (맨 처음) |
| 그림 | A1 → A2 | E1 | 엔진 · 콘텐츠 · U1 · U2 |
| 콘텐츠 | C1 · C2 · C3 · C4 · C5 · C6 · C7 | E1 | 서로 · 엔진 · 그림 · 화면 (자기 데이터 파일만 고친다) |
| 엔진 | E2 → E3 → E4 → E5 → E6 | E1 | 그림 · 콘텐츠 · U1 · U2 |
| 화면 | U1 → U2 → U3 → U4 → U5 | U1 ← A1, U3 ← E4 · A2, U4 ← E5, U5 ← E6 | U1 · U2 는 엔진과 같이 |
| 통합 | I1 | U5 · C1 ~ C7 (모두) | — |

**E1 · 기반 — 데이터 틀 · 검사 · 글자 처리 · 등록**
- 파일: `js/engine/lessonText.js` · `lessonEvents.js` · `lessonEffects.js` (새, §24.5.1 의 E1 부분), `data/lesson_ev_*.json` 7개 (빈 틀 + `lesson_ev_week.json` 에 본보기 `ev_local_kids` 1개), `data/lesson.json` (`events` — 모두 끔), `js/ui/app.js` (`DATA_FILES` · `OPTIONAL_FILES` 에 7개 + `portraits`), `test/helpers.mjs` · `tools/lesson_sim.mjs` · `tools/scenarios.mjs` (파일 목록 · 이벤트 끈 데이터 기본), jsdom 앱 테스트의 fetch 도우미, `tools/events_doc.mjs` (새), `package.json` (새 테스트 6개), `test/lessonEvents.test.mjs` · `test/lessonContent.test.mjs` (새) + 빈 틀 4개.
- 완료: 검사가 잘못된 본보기 20개 이상을 문구와 함께 막는다, 조사 표 (받침 · ㄹ · 한글 아님), 파일 목록 4곳이 `EVENT_FILES` 와 같다, `lesson_sim --runs 40 --seed 1` 이 E1 전과 같다.

**E2 · 효과 층 · 이벤트 뷰 · 고르기 · 3택1 · 저장 v5** — `lessonCommon.js` (옮기기), `lessonEffects.js` 적용 · 미리보기, `lessonEvents.js` 주인공 · 띄우기 · 뷰 · 고르기, `lessonRun.js` (뷰 · 고르기 교체, `cardOffer`, 남은 수업 → SP, v5 이행, `supportEventCheck` → 아무것도 안 함, `createRun` 이 검사), `data/lesson.json` (`support` 키 지움), `js/ui/store.js` (버전 사본 두 줄만), `manager.js` (이벤트 · 3택1), `tools/lesson_scenarios.mjs` (`og_event` 만 — 레슨 이벤트로 주입), 테스트 (`lessonEvents` · `lessonContent` 의 "모든 선택지 적용" · `lessonRun` 의 유대 60 테스트 다시 쓰기 · `manager`).

**E3 · 흐름 — 주 끝 슬롯 · 고정 · 외출 이벤트** — §24.2 queue 전부 (코치 · 이야기 빼고), 자격 · 가중치 · 시즌 1회 · 연속 금지, 무료 외출 `resumeWeek`, 스위치, `lesson_sim` 지표 (`--events`). 파일: `lessonRun.js` · `lessonEvents.js` · `manager.js` · `tools/lesson_sim.mjs` · 엔진 테스트.

**E4 · 코치 연속 이벤트 · 외출 이야기 · 계정 스냅샷** — §24.6 · §24.7 엔진 부분, `coachTargets` · `coachSeen` (`lesson.js` 의 만남 신호), 주 뷰 `story`, `storyList` · `accountMerge`, 외출 상대 AI, `bond.eventSteps`, `lesson_sim --account`. 파일: `lessonRun.js` · `lessonEvents.js` · `lesson.js` · `manager.js` · `data/lesson.json` · `tools/lesson_sim.mjs` · 엔진 테스트.

**E5 · 레슨 깜짝 이벤트** — §24.8 전부 (엔진). 파일: `lessonSurprise.js` (새) · `lesson.js` · `cards.js` (쉬는 선수) · `lessonRun.js` · `lessonEffects.js` (레슨 안 효과 미리보기) · `manager.js` · `data/lesson.json` · `tools/lesson_sim.mjs` · `test/lessonSurprise.test.mjs` · `test/lesson.test.mjs` · `test/lessonContent.test.mjs`.

**E6 · 레전드 · 메모리 카드 (엔진)** — §24.9 엔진 부분. 파일: `lessonRun.js` · `manager.js` · `tools/lesson_sim.mjs` · `test/legends.test.mjs`.

**A1 · 초상화 파이프라인** — §24.12.1. 파일: `tools/portraits.mjs` · `art/portraits.json` · `img/portraits/` · `data/portraits.json` · `test/portraits.test.mjs`. 완료: 24명 × 3 프리셋, 검토 한 장을 열어 얼굴이 가운데 · 잘리지 않음.

**A2 · 새 배경 7장** — §24.12.5. 파일: `art/scenes/` (그림 · 프롬프트 · README) · `art/portraits.json` 의 `scenes` · `img/scenes/` · `data/portraits.json`. 완료: 7장 모두 사람 · 글자 · 로고 없음, 그림체가 확정 그림과 같다, 각 300KB 이하 WebP.

**C1 ~ C7 · 콘텐츠** (§24.14, 각자 자기 파일 하나만) — C1 깜짝 20 · C2 주 끝 42 · C3 이야기 24 · C4 고정 9 + 일반 외출 6 · C5 새 A 22 · C6 새 B 22 · C7 코치 24. 초안은 스크래치에서 쓰고, 검사를 통과한 판만 `data/` 에 넣는다 (같은 작업 트리에서 다른 슬라이스의 `npm test` 를 깨지 않게). 완료: `npm test` (`lessonContent`) 통과, `node tools/events_doc.mjs <스크래치 경로>` 로 만든 문서를 다시 읽고 글 · 조사 · 반말판 · 수치를 확인.

**U1 · 얼굴 그림** — §24.12.2 · §24.12.3. 파일: `js/ui/art.js` (새) · `dom.js` · `hud.js` · `lineup.js` · `ui/cards.js` · `meeting.js` · `ui/passives.js` · `screens/setup.js` · `week.js` · `lesson.js` · `reward.js` · `consult.js` · `prep.js` · `result.js` · `event.js` · `css/base.css` · `outgame.css` · `lesson.css` · `tools/shot.mjs` (그림 기다리기) · `test/lessonUi.test.mjs` · `test/outgame.test.mjs`. 경기 화면 · `lesson_scenarios.mjs` · `art/` · `img/` 는 고치지 않는다 (자르기 문제는 보고).

**U2 · 컷인 일러스트** — §24.12.4. 파일: `screens/lesson.js` · `css/lesson.css` · `screens/match.js` · `css/match.css` (이 슬라이스만) · `test/ui.smoke.test.mjs` · `test/lessonUi.test.mjs` · 필요하면 `tools/scenarios.mjs` 경기 장면.

**U3 · 이벤트 화면 · 3택1 · 외출 이야기 · 회상 · 키 아트 · 계정 저장** — §24.13 의 U3 부분. 파일: `screens/event.js` · `screens/cardOffer.js` (새) · `screens/recollection.js` (새) · `week.js` · `start.js` · `app.js` · `store.js` · CSS · `tools/lesson_scenarios.mjs` · `test/eventsUi.test.mjs` · `test/outgame.test.mjs`. `art/portraits.json` 자르기 수정은 이 슬라이스부터 할 수 있다.

**U4 · 깜짝 말풍선** — §24.8 화면. 파일: `screens/lesson.js` · `css/lesson.css` · `app.js` · `tools/lesson_scenarios.mjs` · `test/eventsUi.test.mjs` · `test/lessonUi.test.mjs`.

**U5 · 레전드 · 메모리 카드 화면** — §24.9 화면. 파일: `screens/setup.js` · `screens/result.js` · `app.js` · `store.js` · `ui/cards.js` · CSS · `tools/lesson_scenarios.mjs` · `test/eventsUi.test.mjs` · `test/outgame.test.mjs`.

**I1 · 통합 · 문서** — `data/lesson.json` 스위치를 켠다. `tools/lesson_play.mjs` 이벤트 처리 · 실제 브라우저 15주 완주 (1280×720 · 915×412), 스크린샷 전체, 시뮬 전 / 후 (§24.16), `docs/LESSON_EVENTS.md` 생성, 문서 (ARCHITECTURE §20 · README · OUTGAME_LESSON_draft 결정 L53 · OUTGAME_CONTENT_draft 머리말 · §24.19). 깨진 것은 고치되 밸런스는 고치지 않는다.

### 24.18 [가정] · [구현 결정] · 기획자 질문

**[가정]**
- 모든 이벤트 수치 · 글 (초안 103개 + 새로 쓰는 66개), 새 8명 말투 표 (§24.3.5), 설정 충돌 정리 (§24.14.2), 새 8명 깜짝 조건 제안.
- 코치 단계 문턱 0 · 40 · 80 과 보상 크기 (§24.6), 일반 외출 6종 효과 (OUTGAME_LESSON_draft 6.2 그대로).
- 대체값: 이미 결장 → 체력 −20 · 이미 강화판 / 고유 카드 없음 → TP +20 · 고를 카드 없음 → TP +10 · 3택1 건너뛰기 → TP +10 · 힌트 후보 없음 → SP +10.
- 감독 AI 기대값 표 (§24.11), 이벤트 하나 12초 (시간 어림).
- `ev_wandering_healer` 가중치 3 = 결장 선수가 있을 때.
- 배경 7장의 장소 · 쓰는 곳 (§24.12.5).

**[구현 결정]**
- 레슨 런 이벤트는 새 파일 7개 (슬라이스마다 하나), 옛 `events.json` · `effects.js` 는 그대로. 레슨 효과 층은 새로 쓴다.
- 미리보기는 효과에서 자동으로 만든다 (데이터에 쓰지 않는다).
- 주 끝 슬롯 1개를 코치 · 랜덤이 나눠 쓴다 (코치 우선 · 2주 연속 금지), 외출한 주는 외출 이벤트가 슬롯.
- 코치 첫 만남 = 계정 1회, "레슨에 나왔다" = 지원 컷인 · 코치 카드 사용 · 같은 종목 클리어 유대.
- 이야기는 고른 순간에 본 것으로 센다. 계정 진행은 `createRun` 스냅샷으로만 들어온다 (같은 seed 다시 하기가 달라질 수 있다).
- 무료 외출 이벤트 뒤에는 같은 주로 돌아온다 (`resumeWeek`, offer 그대로).
- "카드 고르기" 는 한 번의 호출, "3택1" 은 새 phase `cardOffer`.
- 남은 수업은 런 끝에 SP 로 바꾼다.
- 깜짝 계획은 rngState (켤 때만), 깜짝 중 "남은 턴 쉼" 은 벤치 칸과 따로.
- 메모리 카드에서 코치 카드도 뺀다. 레전드는 팀 사본으로 넘긴다.
- 그림은 `img/` 사본 + 목록 `data/portraits.json` (목록에 없으면 글자). 그림 위에 글자를 남긴다. 그림을 좌우로 뒤집지 않는다. 새 그림은 사람 없는 배경 7장만.
- 기존 테스트는 이벤트를 끈 데이터가 기본. 문서는 I1 만 고친다.

**기획자 질문** (번호로 답해 주시면 됩니다)
- **Q1. 코치 이벤트 박자**: 주 끝 슬롯을 차지하고 (주당 최대 1 · 2주 연속 안 됨) 런 길이를 그대로 둘까요, 아니면 주 끝 랜덤에 **더해서** 띄울까요 (런당 이벤트 약 +5 ~ 8)?
- **Q2. 코치 첫 만남**: 계정에서 한 번만 보고 다음 런부터는 유대 40부터 시작할까요, 아니면 런마다 볼까요?
- **Q3. 외출한 주**: 외출 이벤트가 그 주의 주 끝 이벤트를 대신해도 될까요 (주당 이벤트 1개)?
- **Q4. 새 8명의 말투**: 반말 = 헤르타 · 브론테 · 온디나 · 카밀라 · 힐디, 존댓말 = 나엘리스 · 리시엘 · 코니 — 이대로 할까요?
- **Q5. 메모리 카드**: 코치 카드도 남길 수 없게 해도 될까요? (L26 은 고유 · 대비만 뺀다)
- **Q6. 깜짝 이벤트**: "남은 턴 쉼" 은 벤치 2칸을 쓰지 않는다 · "다음 턴 추가 사용 +1" 은 그대로 둔다 (초안 6.3 #7) — 이대로 할까요?
- **Q7. `ev_wandering_healer`**: 가중치 3 조건을 "결장 선수가 있으면" (2.1) 으로 할까요, "체력 40 미만 선수가 있으면" (6.3) 으로 할까요?
- **Q8. 마지막 레슨 뒤 수업**: 전야 · 코치 이벤트에서 마지막 레슨 뒤에 얻은 코치 수업은 SP 로 바꿔 줄까요?
- **Q9. 힌트 바꾸기**: 이벤트의 "힌트 1 (편성 코치 스킬)" 은 코치 수업 (액티브) 으로, 선수 이야기의 힌트는 그 선수 패시브 힌트로 — 이대로 할까요?
- **Q10. 설정**: 두 주장 (헤르타 = 골문의 맏언니 · 아델린 = 필드의 주장, 이번에는 한 장면에 넣지 않음) · 힐디와 도르비나 (같은 산맥 다른 마을, 이름만 아는 사이) · 정령 · 엘프 · 조약 기관 정리 (§24.14.2) 를 받아들일까요?
- **Q11. 새 그림**: 사람 없는 배경 7장 (키 아트 배경 포함) 만 새로 그리고, 이야기 CG · 카드 그림 · 아이콘은 나중으로 미룰까요?
- **Q12. 같은 seed 다시 하기**: 계정 진행 (본 이야기) 이 바뀌면 같은 seed 라도 다른 런이 될 수 있습니다. 괜찮을까요?

### 24.19 구현 중 바뀐 것

I1 (2026-10-05) 이 슬라이스 보고 · 검증 보고 · `git log 9013725..` 를 모아 적는다. 수치 · 글은 모두 [가정], 밸런스는 고치지 않았다.

**한눈에**
- **데이터 스위치를 모두 켰다** (`lesson.json events` — week · seasonStart · preMatch · route · outing · `coach.enabled` · `surprise.enabled` = true). 레슨 런 이벤트 169개 (`data/lesson_ev_*.json` 7개), 검토 문서 `docs/LESSON_EVENTS.md` (생성물).
- `npm test` 385 → **500** (todo 0). 슬라이스 트리마다 E1 403 · E2 422 · E3 435 · E4 450 · E5 478 · E6 488 · A1 410 · A2 411 · U1 · U2 412 → 합친 뒤 U3 ~ U5 · I1 500. 기존 테스트는 이벤트를 끈 데이터가 기본이라 스위치를 켜도 그대로 통과한다.
- 바꾸지 않는 파일 9개 (`rng.js` · `run.js` · `training.js` · `effects.js` · `layout.js` · `config.json` · `events.json` · `supports.json` · `routes.json`) — `git diff --stat 9013725` 비어 있음.
- 브라우저 완주 (`tools/lesson_play.mjs`, 실제 입력): 1280×720 15주 (`--until run --legends --outings 3`) · 915×412 터치 시즌 1 (`--width 915 --height 412 --mobile --touch-only --outings 1` — `--mobile` 만으로는 화면 크기가 바뀌지 않는다) — 오류 0 · 입력 실패 0 · actions 대신 0 · 스크롤 0. 이벤트를 화면 버튼으로 고르고 (덱 고르기 · 결과 카드 · 3택1 · 외출 이야기 · 레슨 깜짝 · 레전드 메모리 카드 2장 확인). 독립 검증에서 터치 판을 다시 돌리면 그 시드의 자유 주에 외출이 나오지 않아 외출 이야기 0 · 깜짝 1번이었다 (완주는 같음).
- 스크린샷 `node tools/shot.mjs <dir>` 전체 197장 (경기 36 · og 161) — 오류 · 스크롤 · 잘림 · 겹침 · 상태 · 404 모두 0 (`검사 통과`), §24.16 의 새 장면 · 터치 장면 · 경기 13 · 27 · 30 · 34 PNG 를 열어 봤다.

**E1 · 기반**
- [구현 결정] `who` 를 빼면 주인공 없음 (`none`) — week · seasonStart · preMatch · route · surprise. outing (partner) · story (그 선수) · coach (coachTarget) 는 주인공이 정해져 있고 `who` 는 그 값만 쓸 수 있다. `who.pick: "char"` · 효과 `char:<id>` 는 그 선수가 편성 보장일 때만 (`chars` · 이야기 주인공 · 깜짝 `cond.char.id`) — 그래서 시즌 시작 · 전야 · 루트는 `char` 를 쓰지 못한다 (계획 §24.3.4 표보다 좁다).
- [구현 결정] R3 / R4 를 검사기가 막는다: `playerHint.skillId` 는 주인공이 정해진 이벤트에서 그 선수 `passiveIds` 안만, 일반 이벤트는 skillId 없이. `teach` 는 이야기 · 선수 전용 이벤트에 쓸 수 없다 (코치가 있는 이벤트만). 깜짝 효과는 런 효과 몇 개 (`stamina · teamwork · condition · bond · coachHint · playerHint · tp · random`) + 레슨 안 효과만.
- [구현 결정] 값 규칙 (정수 · 범위), 갈래 결과 `{ then, else }` ↔ 맨 위 `random` 1개, `relic` + `rewardOffer` 는 갈래마다 검사, 자리표시 뒤에 손으로 쓴 조사 (`{선수}가`) 거부, 옛 키 · 옛 효과 (`summonTicket` · `hint` · 훈련 칸) 는 한국어 안내와 함께 거부. `lesson.json events.speech` · 파일 `notes` 도 검사.
- [구현 결정] jsdom 테스트는 `test/helpers.mjs dataFetch(root, { events })` 하나로 (세 벌 fetch 사본 대신). `events_doc.mjs` 는 검사에 걸리면 쓰지 않는다 (날짜 없음 — 같은 데이터면 같은 문서).
- `ev_local_kids` 본보기에 {선수} 대사 한 줄을 더했다 ("감독님, 딱 한 판만요." / 반말 "감독, 딱 한 판만.") — 반말판 본보기가 있게.

**E2 · 효과 층 · 뷰 · 고르기 · 3택1 · 저장 v5**
- [구현 결정] `lessonEvents.resolveEvent` = 적용 · `lastEvent` · 로그 · 기록 훅 · phase `flow`, `lessonRun.resolveEvent` 가 감싸 `continueFlow` (순환 import 없음). 레슨 안 효과는 `ctx.applyLesson` 훅 (없으면 아무것도 바꾸지 않고 throw).
- [구현 결정] `applyEffects` 는 바꾸기 전에 모두 검사한다 (모르는 효과 · 주인공 없는 `player` · uid 없음 / 후보 아님 · 레슨 밖 레슨 효과 · 3택1 이 이미 기다리는 중). 한 선택지에 `cardPick` 1개까지 (갈래 합쳐서 — 새 검사 규칙). 앞 효과가 고른 카드를 못 쓰게 만들면 TP 로 대신한다.
- [구현 결정] 이벤트 modifier · goalCondition 의 출처 `event:<id>`. `sp` 는 `skillPointGain`, `bond` 는 양수에 `bondGain` (effects.js 와 같게) — 대체 SP · 코치 카드 유대 +15 는 보정 없이.
- [구현 결정] `rewardOffer` = `rollRewardOffer` 를 status `event` 로 (강화판 확률 없음 · rng 더 쓰지 않음). 후보가 비면 TP `offerSkipTp`. 고유 카드 "강화" 칸을 고르면 덱의 그 카드를 강화판으로.
- [구현 결정] 계획에 없던 대체값: `cardUpgradeRandom` 할 카드 없음 → TP +10, `relic` 남은 유물 없음 → 아무것도 없음 (미리보기 "(남은 유물 없음)"), `injury randomPlayer` 는 결장 아닌 선수 중.
- [구현 결정] `teach` 는 늘 `pendingTeach` 에 들어가고, 마지막 시즌 끝에 남은 것을 하나에 `declineSp` 씩 SP 로 (미리보기 "→ 남은 레슨이 없어 런 끝에 SP +20"). 남은 레슨 = 지금 뒤의 레슨 · 대비 주 (+ 지금 주가 아직 시작 전이면 지금 주).
- [구현 결정] 주인공 같은 값 깨기 = 같은 값인 선수 중 `rng.pick`. `ctx.playerId` 로 주인공을 정할 수 있다 (도구 · 테스트). 뷰의 `players` = 짝 이벤트면 둘.
- [구현 결정] 추천 = `choiceScore` 가 큰 쪽 (같으면 0번). §24.11 표에 없던 값: goalCondition 1 = 20 · modifier = 시즌 20 / 런 40 · 결장 해제 1명 = 40 · restRemaining = 체력 − 20. 감독 AI 의 카드 고르기 = 강화 → 상담처럼 고유 아닌 첫 강화 가능 카드, 삭제 → 기초 훈련 · 개인 지도 (강화판 아닌 것 먼저) · 공용.
- [구현 결정] v4 → v5 는 data 가 있어야 한다 (2 → 3 · 3 → 4 처럼). `createRun` 은 v5 필드를 모두 빈 값으로 (rng 없음). 이벤트 데이터 검사는 데이터 객체마다 한 번 (WeakSet).
- 다른 슬라이스 파일 3곳 (`cards.test` · `outgame.test` · `ui.smoke.test`) 의 저장 버전 · `events.support` 기대값을 같이 고쳤다.

**E3 · 런 흐름**
- [구현 결정] 시즌 시작 · 전야 · 루트는 데이터 순서의 첫 맞는 이벤트 (뽑기 없음). 주 끝 · 외출은 후보가 하나여도 가중치 뽑기 1번 (없으면 rng 없음).
- [구현 결정] `lastWeekEventId` = weekSlot 이 띄운 id (없으면 null). 외출 주는 null 로 (외출이 "2주 연속" 을 끊는다), 무료 외출은 그대로. 외출은 띄울 때 `outingSeen` 에 넣고 6종을 다 보면 비운다.
- [구현 결정] 외출 스위치만 꺼져 있으면 외출 주에는 이벤트가 없다 (주 끝 슬롯으로 바꾸지 않는다). `anyStaminaBelow` = 결장 아닌 선수, `avgStaminaBelow` = 7명 모두.
- `routes.json rt_hotspring` 의 `guaranteedSeasonStartEvent` 는 레슨 런이 읽지 않는다 (시즌 시작 이벤트는 스위치가 켜져 있으면 늘 뜬다).

**E4 · 코치 연속 · 외출 이야기 · 계정**
- [구현 결정] "레슨에 나왔다" (`coachSeen`) = 그 레슨의 붙기 기록 (`attach.log` — 낸 컷인뿐 아니라 손패에 붙은 것도) · 코치 카드 사용 (`lesson.coachPlayed`) · 같은 종목 클리어 유대 · `bondBefore` 대비 유대 변화. 그래서 AI 런에서는 편성 코치 6명이 모두 시즌 1 안에 "나왔다" 가 된다 (계획 §24.6 은 "지원 컷인" 만 적었다).
- [구현 결정] `coachSeen` · `coachTargets` 는 스위치와 상관없이 쌓는다 (기록만 · rng 없음). 끈 15주 최종 JSON 은 이 두 값과 `storyEps` 만 E3 과 다르다 (흐름 · rng 같음).
- [구현 결정] 단계 순서 = 낮은 단계 먼저, 같으면 편성 순. 2 · 3 단계 문턱 = `bond.eventSteps` (검사기가 `bondAtLeast` 와 맞는지 본다). 2주 연속 금지 = `turnIndex − lastCoachTurnIndex ≤ gapWeeks` (시즌 경계를 넘어도). 주 끝 랜덤 스위치가 꺼져 있어도 코치 연속은 뜬다. `firstMeet "run"` 이면 2단계도 이번 런의 1단계가 있어야 한다.
- [구현 결정] `coachSteps` · 이야기는 **고른 순간** (resolve) 에 기록. 계정 `coachMet` 은 `coachSteps[sid]` 에 1단계가 있으면 만난 것으로 합친다. 런 필드 **`storyEps`** `{ charId: 이번 런에 본 가장 큰 화 }` 를 더했다 (§24.10 목록에 없던 것 — `accountMerge` 가 data 없이 화를 알게). `storyNext = min(3, max(계정 화, storyEps)) + 1`.
- [구현 결정] 주 뷰 `players[].story.next` 는 외출 스위치가 꺼져 있으면 null — 감독 AI 의 이야기 우선도 이 값을 쓰므로 끄면 예전 규칙. `normalizeAccount` = 모르는 키 · 버전 버림, 화 1 ~ 3 정수, 키 정렬 (여러 번 불러도 같은 JSON), 데이터에 없는 id 도 남긴다. `storyList` 에 `name` 을 더하고 제목 {선수} 를 채운다. `lessonRun` 이 `accountMerge` · `normalizeAccount` · `storyList` 를 다시 내보낸다.
- `lesson_sim --account carry` 는 방침 칸마다 따로 쌓는다 (방침끼리 섞지 않는다).

**E5 · 레슨 깜짝**
- [구현 결정] 깜짝 필드 (`surprise` · `turnLog` · `rested` · `nextExtraPlay` · `streak` · `lastTargeted`) 는 `surprise.enabled` 일 때만 `startLesson` 이 만든다 — 꺼져 있으면 키도 rng 도 없다 (레슨 JSON · rng 가 E4 와 같다).
- [구현 결정] 턴 기록 = `{ plays[{ uid, cardId, family, kind, shape, targets, failed, coach, ownerId }], failed[], reshuffled, benched[], moved[], emptyAtStart[] }` — 코치 카드 성공 · 원 카드 n명 모두 성공 · 이번 턴 대상 · 자기 고유 카드는 plays 에서 계산. 연속 대상 `L.streak` = 단일 카드 대상과 고유 카드의 주인 · 받는 선수만 (원 · 구역 동료 빼고 — R6), 한 턴 거르거나 벤치면 끊긴다.
- [구현 결정] `halfway` = ⌈turns / 2⌉ 턴 하나 (6턴 3 · 7 · 8턴 4). `failedThisTurn` 은 실패한 선수가 결장 · 쉼이 아닐 때만. `zoneCountMin` · `aloneInZone` 은 경기장 선수만 센다 (본인 포함). 주인공 후보가 없으면 그 깜짝을 뺀다. `{코치}` · bond `coach` = 이번 턴 실패 없이 끝난 마지막 코치 카드의 코치.
- [구현 결정] `score` 는 점수에만 (`L.surprise.bonus` 에도 적는다), `nextPct` 는 −100% 아래로 내려가지 않는다, `injureNow` = `lesson.injure` (다음 레슨 1회도 빠지고 부상 수에 센다). `restRemaining` = `L.rested` — 벤치 · 구역 · 대상 · 기본 훈련에서 빠지고 벤치 2칸과 따로 센다 [Q6]. 쉬는 선수의 고유 카드는 제거하지 않고 "쉬는 중" 죽은 카드, 한나 레슨 끝 회복도 받지 않는다.
- [구현 결정] `buff` 에 선택 키 `key` (호조 · 집중 · 분위기 · 탈취 · 압박 · 점유 — 이벤트 맨 위 `policy` 의 버프만) 를 더했다. 미리보기 = 단위와 지금 값 ("호조 +1장 (0 → 1)" · "이미 최대").
- [구현 결정] 깜짝 중 얻은 수업은 그 레슨 보상에서 받으므로 "남은 레슨 없음 → SP" 판단에 지금 레슨을 센다. 데이터에서 빠진 깜짝을 기다리던 저장본은 "계속한다" 하나짜리 말풍선 (효과 없음). 도구 · 테스트용 `lesson.forceSurprise`.

**E6 · 레전드 · 메모리 카드**
- [구현 결정] `validateLegends` 는 오류를 모아 "레전드: 오류 N개 …" 로 throw (`legendErrors` 는 던지지 않는 판, `MAX_LEGENDS` 2). 더한 규칙: `teamId` 비어 있지 않은 문자열 · `plus` 는 강화할 수 있는 카드만 · 같은 팀 + 같은 캐릭터 둘 거부.
- [구현 결정] 팀 id 마다 메모리 카드 1장 = 그 팀에서 카드를 가진 첫 레전드의 것. 고유 카드 뒤 · 레전드 순서. 레전드가 없으면 상태가 바이트 그대로 (테스트).
- [구현 결정] `recommendMemoryCard` = 값 (`cardPrice` — 방침 30 > 공용 20) → 강화판 → 덱 순서. 카드 뷰 · 주 뷰 덱에 `memory` 칸.
- `lesson_sim --legends n` = 앞 런 등록 팀에서 스탯 합이 큰 n 명 (팀 id `challenge.teamIdOf`).

**C1 ~ C7 · 콘텐츠** (옮기기 규칙 R1 ~ R18 그대로 — 아래는 규칙 밖 판단)
- C1 깜짝 20: `ls_ace_in_the_zone` A "호조 +1장" → `nextPct +50` (호조 = 다음 카드 ×1.5), B "집중 +1" → `buff` (E5 뒤 `key` 로 가를 수 있다). 방침 깜짝 주인공 구역 = 역습 수비 · 점유 패스 · **압박 피지컬** (R8 이 정하지 않아 체력 주제로 — 기획자 확인). `ls_neria_watching` = 3턴 끝부터 + 대상 0번 (초안 "3턴 끝에만" 은 키가 없어 그 뒤에도 뜰 수 있다), `ls_dorbina_heavier` = 대상 2번 이상 + 이번 턴 대상 (초안 "두 번째로 대상이 된 턴" 근사). `ls_silluen_two_ahead` B 스루 패스 힌트 → 실루엔 패시브 바람 읽기 (R4). 반말판 12개 (초안 도르비나판을 누구에게나 맞게).
- C2 주 끝 42: 짝 이벤트 4개는 주인공 없음 + `chars` 2명 (효과 `char:<id>`). 패시브 힌트 이름 두 곳이 빠졌다 — `ev_rival_shootout` B (승부사) · `ev_supporters_banner` B (큰 경기 체질) — 주인공이 런마다 바뀌어 skillId 를 쓸 수 없어 그 선수 패시브 중 무작위 (기획자 확인). 밤 그림이 없어 밤 장면은 clubhouse · ground · nature.
- C3 이야기 24: 액티브 · 목록 밖 힌트 바꾸기 — 도르비나 2화 B 바위 방벽 → 대지의 뿌리, 아델린 2화 A 매의 눈 → 잠금 수비, 실루엔 2화 B 스루 패스 2 → 바람 읽기 + 패스 +20 (+5), 미르카 1화 B 소매치기 → 고양이 페인트 (결과 글도 페인트로), 타리아 1화 B 마지막 힘 → 지치지 않는 다리. `out_neria_1` "정령은" → "물의 정령은" (§24.14.2). 도르비나 3화 B 스탯 합 42 (가이드 24 ~ 40 보다 조금 큼 — 초안 그대로).
- C4 고정 9 + 일반 외출 6: 시즌 시작 · 전야 · 루트는 `char` 를 못 써서 `none` / `random`. 외출 반말판은 상대 대사 줄만 바꾼다. `ev_prematch_s1` 배경 stands → **clubhouse** (밤 숙소 복도, I1).
- C5 새 A 22 · C6 새 B 22: 새 설정은 모두 [가정] (각 파일 `notes` · `LESSON_EVENTS.md` 메모 — 수정굴 · '친 날' · 배 한 척 거리 · 조약 함대 · 산호초 급류 · 폭풍제 · 굴 마을 · 등대 · 각인 …, Q10 묶음). 위험한 선택지 = 브론테 2화 A · 코니 2화 A · 힐디 2화 B. `ls_hildi_red_hot` 가중치 3 = `ls_running_on_empty` 와 같아 같은 턴이면 반반 (기획 의도 "힐디가 먼저" 를 지키려면 힐디를 4 ~ 6 으로 — 기획자 확인).
- C7 코치 24: 2단계 = 옛 유대 60 다시 쓰기 (제목 · 장면 · 선택지 그대로, 보상만 고침 — 하르나 B 막판 집중 · 오르넬라 A 연계의 달인 · 한나 B 큰 경기 체질 · 조이 B 언더독 → 수업이나 주인공 패시브 힌트), 3단계 끝 줄에 파티 패시브가 세진다는 서술 (카드를 직접 강화하지 않는다). 같은 액티브를 두 코치가 가르친다 (스루 패스 · 파워 슛 · 매의 눈 · 꿰뚫어보기 · 라인 브레이커 각 2번). 오르넬라 사슬은 코치 카드를 주지 않고, 한나 2단계는 수업이 없다 (초안 그대로).
- 합칠 때 E1 의 `lessonEvents.test` 'allEvents' 기대값을 이야기 · 코치 파일이 비어 있지 않아도 되게 고쳤다 (C3 · C7 같은 수정 1벌, `9a5d278`).

**A1 · A2 · 그림**
- [구현 결정] `v` 는 항목마다 1개 = face · bust · half 파일을 이어 붙인 sha1 앞 8자 (배경은 그 파일). 자르기 값 `head` 는 실제 머리 높이보다 작은 "얼굴이 원을 채우는" 배율, 24명 모두 다시 쟀다 (§24.12.1 시작값과 30 ~ 90px 차이). 흉상 = 항목마다 `bust` 덮어쓰기 (dy ≈ −0.12 head · scale 0.8 — 머리 ~ 가슴). 크기 한도 face 40 · bust 80 · half 120 KB (실제 최대 약 18 · 36 · 63 KB, 합계 약 2.1MB) · 배경 300 KB (최대 town 164 KB).
- [구현 결정] 배경 7장 (Codex `gpt-6-astra` xhigh, 확정 그림 실루엔 · 네리아를 참고로): 다시 그리기는 1번까지 — `title` 만 다시 그렸다 (첫 판에 문장 같은 무늬). 남은 것: `title` 먼 깃발의 아주 옅은 V 모양 접힘, `clubhouse` 식탁의 살짝 윤기, `town` 이 가장 복잡 (`art/scenes/README.md`). PNG 의 C2PA 기록은 원본에만 남고 WebP 에는 없다.
- `.gitattributes` 에 `*.webp binary` 줄은 없다 (git 이 바이너리로 알아보지만 넣는 편이 안전하다).

**U1 · U2 · 얼굴 · 컷인**
- [구현 결정] 고유 카드의 주인 얼굴은 6px 띠 대신 메타 줄 "고유 · 이름" 앞 14px 얼굴. 선수 정보 팝오버 얼굴 44px (48 이면 터치 팝오버 부제가 잘린다). 결과 흉상 56×70 은 줄 간격을 줄여 7줄이 들어가게. 가르치는 코치 흉상 64×80 은 그림이 있을 때만.
- [구현 결정] `portraitUrl` 은 목록의 자기 키 (`__proto__` 같은 키는 null) · 목록의 프리셋 · 비어 있지 않은 `v` 일 때만 주소. shot.mjs 그림 기다리기는 animation frame 으로 (타이머 멈춤과 상관없이), 실패한 그림도 complete 로 친다 (HTTP 오류는 따로 센다).
- [구현 결정] 컷인 그림 `cutArt` 는 실패하면 그림 · 클래스를 지워 예전 원 + 글자로 돌아간다 (`:has()` 배치도 같이). 그림이 불투명 (배경이 칠해진 자른 그림) 이라 **테두리 있는 창**으로 보인다 (띠 기울기에 평행하게 위아래를 자른다, 그림은 기울이지 않는다). 레슨 첫 컷인 = 240×350 반신 창 (띠 위로 약 180px, 글은 왼쪽 150px 띄움), `.short` = 192×240 흉상. 경기 SSR = 자기 편 쪽에서 ±150px 미끄러져 들어오는 반신 (색 없는 합체기 카드도 SSR), SR · 역방향 · 이름 카드 = 띠 위로 약 56px 솟는 흉상 창 (띠 아래로도 약 50px — 계획은 위만 적었다). 이름 카드는 원정 팀도 패스한 선수 왼쪽 · 받은 선수 오른쪽.
- 미리 불러오기: 레슨 = 편성 코치 반신 · 흉상 (inert · 움직임 줄이기면 건너뜀), 경기 = 필살기 보유자 반신 · 흉상 · 얼굴 + 그림 있는 모든 선수 흉상. 새 경기 장면 `35_cutin_ssr`.
- 지금 데이터에서는 그림 있는 상대가 경기에 나오지 않는다 (도전 모드 원정 = 단계 상대, 등록 팀 = 홈). 원정 쪽 그림은 임시 페이지로만 확인했다.

**U3 ~ U5 · 화면** (코드 머리말 · 커밋에서)
- [구현 결정] 결과 카드는 화면 전용 (`store.eventUi.resultSeq`) — [계속] 을 누르면 다음 phase 화면 (다음 이벤트 · 3택1 · 유물 · 주). 덱 고르기는 감독 추천 카드를 **미리 골라 둔다** (한 번 더 누르면 풀린다). 짝 이벤트 흉상 = `art.charIds` 두 명, 주인공 없는 이벤트는 흉상 없이.
- [구현 결정] 시작 화면 키 아트 반신 5명 = 네리아 · 울리카 · 실루엔 (가운데 · 가장 크게) · 그레타 · 헤르타. 회상 칸 순서 = `characters.json`, 이야기가 없는 캐릭터는 흐리게. 회상은 데이터 + 계정 저장만 읽는다.
- [구현 결정] 깜짝 말풍선 자리: 주인공 토큰 위 → 위로 넘치면 필드 위쪽 가운데 (꼬리 없음 — 주인공 금색 고리), 위쪽이 주인공 얼굴을 가리면 아래쪽 가운데. 숫자 키 1 · 2 로도 고른다. 결과 띠 `.ls-sres` 는 CSS 애니메이션 + 타이머 (움직임 줄이기 = 애니메이션 없이 그 시간 뒤 지움).
- [구현 결정] 레전드 모달의 등록 팀 = 지금 데이터에 선수가 남아 있는 팀만 (최신순). 메모리 카드를 실을 수 없는 옛 팀 · 카드 (데이터에 없음 · 고유 · 대비 · 코치) 는 "메모리 카드 없음" 으로 데려간다. 결과 화면 메모리 카드 줄 = 칩 → 고르기 모달, 등록한 뒤에는 남긴 카드를 보여 준다.
- `js/ui/app.js` 머리말의 `?events=on` (데이터 스위치를 켜는 개발용 주소) 은 I1 전의 것이다 — 지금은 데이터가 켜져 있어 없어도 된다 (그대로 둠).

**I1 · 통합**
- 데이터 스위치 켬 (`data/lesson.json`). `npm test` 그대로 500 (기존 흐름 테스트는 꺼진 데이터, 이벤트 테스트는 고정 이벤트 — 고칠 것이 없었다).
- 글 고침 (`LESSON_EVENTS.md` 를 읽고 · 콘텐츠 검증 보고에서): `ev_neria_ondina_spirits` "호수 어른들" → "호수의 어른들" · `out_camila_3` A 결과 "남은 훈련 내내" → "돌아가기 전 며칠 동안 훈련마다" (장면은 훈련이 끝난 뒤) · `ev_outing_shopping` "넉넉" 세 번 → 선택지 "제대로 갖춰 두자" · 결과 "든든해졌습니다" · `ev_prematch_s1` 배경 stands → clubhouse · `out_coni_2` 오버래핑 설명 ("수비수 둘 사이를 비집고" → "앞선 동료의 바깥쪽을 휘돌아 측면 뒤 빈 곳으로") · `ls_coni_alone` "코니 혼자 한 구역에" · `ev_camila_windy_day` "차올리고" · "녹초가 됐지만" · `ls_risiel_empty_target` B 결과 (노트의 점 = 맞힘이라 "그 빈자리가 작게 그려졌습니다" 로). 기계 검사 (16명 × 모든 글 채우기 — 남은 자리표시 · `이(가)` 꼴 · 빈 글 · 따옴표 · 반말판의 "감독님" · 성적 표현 단어) 는 걸린 것이 없다.
- `tools/lesson_sim.mjs`: [이벤트 몫] 줄 3개 (이벤트 · 3택1 · 깜짝을 고른 행동의 앞뒤 차이 — 그 행동 뒤 흐름에서 생긴 변화도 들어간다 [구현 결정]). 이벤트를 끈 출력은 2차 전과 같다 (`--events off` = 아래 "전").
- `tools/lesson_play.mjs`: 이벤트 모달 · 덱 고르기 · 결과 카드 · 3택1 · 레슨 깜짝 말풍선 · 외출 이야기 배지 · `--legends` · `--outings N` (§24.11 — 아래 표처럼 감독 AI 가 외출을 거의 고르지 않아 이야기 화면을 보려고 [구현 결정]).
- `docs/LESSON_EVENTS.md` 생성 (2364줄).

**시뮬 전 / 후** (`node tools/lesson_sim.mjs --runs 200 --seed 1`, 방침 ace / team / counter / press / poss — 보고만, 수치는 바꾸지 않았다. 전 = 이벤트 끔 (2차 전과 같은 숫자), 뒤 = 스위치 켬)

| 지표 | 전 | 뒤 · 계정 fresh | 뒤 · 계정 carry | 뒤 · fresh + 레전드 2 |
|---|---|---|---|---|
| 런당 이벤트 (깜짝 포함) · 시간 어림 (12초) | 0 | 26.8 ~ 27.2 · 5.4분 | 27.1 ~ 27.2 · 5.4분 | 27.0 ~ 27.3 · 5.4분 |
| 주 끝 랜덤 · 코치 · 시즌 시작 · 전야 · 루트 | — | 6.8 ~ 6.9 · 8.0 · 3 · 3 · 2 | 7.8 ~ 8.2 · 6.7 ~ 7.0 · 3 · 3 · 2 | 6.8 · 7.9 ~ 8.0 · 3 · 3 · 2 |
| 외출 일반 · 이야기 화 / 런 | — | 0 · 0.14 ~ 0.23 | 0 ~ 0.07 · 0.09 ~ 0.10 | 0 · 0.17 ~ 0.23 |
| 깜짝 / 런 (계획된 레슨 · 뜬 비율) | — | 3.8 ~ 4.2 (47 ~ 50% · 91 ~ 94%) | 4.1 ~ 4.2 | 4.0 ~ 4.3 |
| 코치 단계 도달 / 런 1 · 2 · 3 | — | 6.0 · 2.0 · **0** | 0.03 · 5.3 ~ 5.4 · 1.4 ~ 1.6 (첫 만남 계정 6) | 6.0 · 2.0 · 0 |
| 이벤트 몫 / 런: 스탯 합 (7명) · TP · SP | — | 222 ~ 233 · 2.7 ~ 3.8 · 20 ~ 21 | 345 ~ 362 · 4.9 ~ 6.0 · 20 ~ 22 | 215 ~ 226 · 2.4 ~ 3.7 · 20 ~ 22 |
| 이벤트 몫 / 런: 수업 · 카드 추가 / 강화 / 삭제 · 유물 · 결장 | — | 3.9 ~ 4.0 · 1.5 ~ 1.7 / 0.24 ~ 0.30 / 1.0 · 0 · 0.17 ~ 0.25 | 6.1 ~ 6.3 · 3.1 / 1.2 ~ 1.3 / 1.0 · 0 ~ 0.01 · 0.20 ~ 0.28 | 4.0 ~ 4.2 · 1.5 ~ 1.7 / 0.23 ~ 0.32 / 1.0 · 0 · 0.15 ~ 0.18 |
| 런 끝 남은 수업 → SP (개 · SP) | — | 0.9 · 18 | 0.45 ~ 0.58 · 9 ~ 12 | 0.9 ~ 1.0 · 18 ~ 20 |
| 런 끝 평균 스탯 | 416 / 412 / 419 / 415 / 414 | 441 / 436 / 441 / 441 / 438 | 445 / 440 / 446 / 445 / 444 | 441 / 435 / 440 / 440 / 438 |
| 런당 성장 | 6236 / 6101 / 6339 / 6192 / 6152 | 6889 / 6709 / 6871 / 6860 / 6766 | 6899 / 6736 / 6908 / 6890 / 6846 | 6873 / 6669 / 6872 / 6854 / 6788 |
| 습득 스킬 · 런당 수업 | 14.8 · 10.7 | 18.4 ~ 18.8 · 14.3 ~ 14.8 | 20.7 ~ 21.1 · 16.8 ~ 17.2 | 18.7 ~ 18.8 · 14.6 ~ 14.9 |
| 런당 레슨 수 · 주 휴식 | 8.3 ~ 8.5 · 1.2 ~ 1.4 | 8.9 · 0.6 ~ 0.8 | 9.0 · 0.5 ~ 0.6 | 8.9 ~ 9.0 · 0.6 ~ 0.8 |
| 레슨 점수 s1 / s2 / s3 (team) | 515 / 633 / 726 | 521 / 636 / 739 | 522 / 637 / 742 | 519 / 637 / 734 |
| 퍼펙트율 | 91 / 91 / 94 / 92 / 92% | 95 / 95 / 96 / 96 / 94% | 95 / 95 / 97 / 96 / 96% | 94 / 95 / 97 / 94 / 94% |
| 평가 점수 | 612 / 611 / 617 / 612 / 612 | 675 / 674 / 674 / 676 / 673 | 702 / 700 / 705 / 706 / 703 | 679 / 672 / 679 / 679 / 675 |
| 등급 S · A (200런) | 0 · 126 / 0 · 99 / 0 · 113 / 0 · 111 / 0 · 112 | 10 · 159 / 7 · 168 / 10 · 163 / 9 · 163 / 6 · 166 | 55 · 120 / 42 · 136 / 54 · 121 / 76 · 101 / 55 · 128 | 18 · 159 / 5 · 171 / 8 · 171 / 14 · 167 / 15 · 162 |
| A 이상 비율 | 63 / 50 / 57 / 56 / 56% | 85 / 88 / 87 / 86 / 86% | 88 / 89 / 88 / 89 / 92% | 89 / 88 / 90 / 91 / 89% |
| 경계전 승률 전체 | 78 / 70 / 74 / 73 / 75% | 76 / 76 / 77 / 75 / 79% | 77 / 76 / 77 / 79 / 80% | 79 / 78 / 78 / 78 / 78% |
| 경계전 승률 s1 / s2 / s3 (team) | 91 / 66 / 53% | 90 / 77 / 62% | 91 / 74 / 65% | 95 / 77 / 63% |
| 런당 부상 | 1.55 ~ 1.87 | 1.42 ~ 1.57 | 1.44 ~ 1.57 | 1.54 ~ 1.66 |
| TP · SP 얻음 | 164 ~ 171 · 446 ~ 455 | 189 ~ 192 · 526 ~ 533 | 199 ~ 201 · 524 ~ 535 | 194 ~ 199 · 528 ~ 535 |
| 코치 카드 / 런 끝 덱 · 덱 크기 | 4.4 ~ 5.2 · 21 | 4.8 ~ 5.9 · 22 | 6.2 ~ 7.4 · 23 | 4.6 ~ 5.6 · 22.2 ~ 22.5 |

- 깜짝 id 별 / 런 (fresh, 방침 합): 한 사람처럼 0.70 · 한 번만 더 보여 주세요 0.64 · 바닥난 숨 0.45 · 더 얹어 0.41 · 골문 앞에서 0.41 · 새 공 0.38 · 상한이 보인다 0.36 · 어디서 어긋났는지 0.17 · 두 수 앞 0.16 · 한 끗 차이 0.12 · 방침 깜짝 0.01 ~ 0.04 (그 방침 런만) · 마지막 한 바퀴 0.04 · 고개 들어 0.02 · 감이 왔어요 0.02 · 쉬는 동안에도 0.01. 미르카 · 새 8명 깜짝은 기본 편성에 없어 0 (편성하면 뜬다 — 브라우저 확인).
- 깜짝이 뜬 레슨 / 안 뜬 레슨 점수 · 퍼펙트율 차이는 거의 없다 (604 / 607 · 95 / 95% 등). 고른 선택지 1번 51 ~ 61%.
- 레전드 2명 (`--legends 2`): 시작 덱 11장 (+메모리 카드 1장 — 같은 팀 둘), 메모리 카드 낸 수 / 런 ace 3.65 · team 1.95 · counter 3.28 · press 0.59 · poss 0.24, 런 끝 덱에 늘 남는다 (AI 가 지우지 않는다).
- **L24 (런당 이벤트 20 ~ 24) 대비**: 깜짝을 빼면 fresh 약 22.9 · carry 약 23.0 — 띠 안. 깜짝까지 약 27 (§24.2 어림 25 ~ 29 안). 이벤트 시간 어림 5.4분 (12초 × 27), 레슨 시간 어림 약 6.2분 (0.7분 × 8.9).

**남은 것 · 기획자 확인** (밸런스는 나중에 한 번에 — 이번에 고치지 않았다)
1. **외출이 거의 없다**: 감독 AI 는 자유 주에 상담 · 미팅 · 친선전을 먼저 고르고 외출을 거의 고르지 않는다 (런당 0.1 ~ 0.2번) — 계획 어림 2 ~ 3번. 이야기 · 일반 외출 6종이 시뮬 지표에 잘 안 잡힌다 (사람은 고를 수 있다 — 브라우저는 `--outings` 로 확인). 감독 AI 의 외출 판단은 E4 브리프대로 그대로 뒀다.
2. **계정이 처음인 런에서 코치 3단계 (유대 80) 가 뜨지 않는다**: 첫 만남 6개가 시즌 1 ~ 2 의 코치 슬롯을 차지하고 (2주 연속 금지), 2단계 2개 뒤 런이 끝난다. 계정이 쌓이면 (carry) 3단계 1.4 ~ 1.6 / 런. 첫 만남을 슬롯 밖으로 빼거나 (Q1 의 "더해서 띄우기"), 같은 주에 2 · 3단계를 먼저 띄우는 순서 등은 기획자 결정.
3. **코치 "레슨에 나왔다" 신호가 넓다** (E4): 붙기만 해도 나온 것으로 쳐서 6명 모두 시즌 1 안에 첫 만남 후보가 된다. 낸 컷인만 셀지 기획자 확인.
4. 이벤트 몫 런당 스탯 합 +220 (fresh) ~ +350 (carry), 평균 스탯 +25 ~ 30 · 평가 +60 ~ 90 · A 이상 56% → 86 ~ 90%. 경계전 승률은 시즌 2 · 3 이 조금 오르고 (team 66 / 53% → 77 / 62%) 시즌 1 은 그대로. 런 끝 남은 수업 → SP 가 fresh 런당 약 0.9개 (마지막 시즌 전야 · 코치 이벤트) — 모두 보고만.
5. 콘텐츠 판단 확인: 압박 깜짝 주인공 구역 (피지컬) · 힐디 깜짝 가중치 (3 — 바닥난 숨과 같은 턴이면 반반) · 이름이 빠진 패시브 힌트 2곳 (C2) · 같은 액티브를 두 코치가 가르침 (C7) · 루미 3단계 수업 = 매의 눈 (뜻이 조금 느슨) · 깜짝 제목에 반말판이 없다 (반말 주인공이어도 제목 "…주세요" 그대로) · 다친 외출 상대도 "둘만의 특훈" 을 한다.
6. 미리보기 글 손질 거리 (엔진 `lessonEffects`, 이번에 고치지 않음): "TP +10 (덱이 5장 아래로 줄지 않아 삭제할 카드 없음)" 이 어색하다 · 마지막 레슨 뒤 수업 줄 괄호가 두 겹 ("코치 수업: 함성 (루미) (남은 레슨이 없어 런 끝에 SP +20)").
7. 그림: `title` 배경의 옅은 깃발 무늬 · `clubhouse` 윤기 (다시 그릴지), 컷인이 불투명 창이라 "잘라 낸 사람" 이 아니다 (투명 그림이 필요하면 파이프라인 확장), 헤르타 (남색 머리 · 남색 배경) 는 22px 에서 어둡게 뭉친다, 실루엔 · 셀리아 (초록) · 코니 · 힐디 (주황) 가 22px 에서 비슷하다. 이야기 CG · 상대 팀 · 카드 그림 · 아이콘은 나중 (Q11).
8. 기획자 질문 Q1 ~ Q12 (§24.18) 은 아직 답을 받지 않았다 — 지금 구현은 각 질문의 [구현 결정] · [가정] 쪽이다.

**I1 뒤 후속 정리 (2026-10-05)**: 미리보기 문구 2개 (`TP +10 (덱이 최소 5장이라 지울 카드 없음)` · `코치 수업: 함성 (루미 · 남은 레슨이 없어 런 끝에 SP +20)` — 괄호 하나), 보상 모달에 깜짝 점수 보너스 "깜짝 +N" (`lessonResult.surpriseBonus` · `surpriseTitle` → 보상 결과), 주 화면 [덱 보기] · 레슨 더미 보기에 메모리 카드 표시, `.gitattributes` 에 `*.webp binary`, 문서 수치 (주 끝 54 = 초안 42 + 새 8명 12 · 장면 이름 `og_lesson_cutin` · 터치 판 명령).
