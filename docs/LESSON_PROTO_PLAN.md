# 카드 레슨 프로토타입 1차 — 구현 계획

> 상태: 구현 계획 · 2026-10-02 · 브랜치 `outgame-lesson` (시작 시점 `main` = `fa1e4ec`과 같음)
> 기준 문서: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) (L1~L31) · [OUTGAME_CARDS_draft.md](OUTGAME_CARDS_draft.md) (66장) · [ARCHITECTURE.md](ARCHITECTURE.md)
> 사용자 결정 (2026-10-02): **A** 별도 브랜치에서 만들고 다른 주소(`/soccer/lesson/`)에 올린다 · 두 번에 나눠 1차 먼저. **C** 콘텐츠 결정은 추천대로 (L31).
> **2026-10-04 구역 방식 개편 (L32~L36)**: [§14](#14-구역-방식-개편-l32l36)가 §4 · §5 · §6.3 · §9 · §10 · §12의 해당 부분(대상 지정 · 종목 · 쉬기 · 자율 훈련 · 수치)을 대신한다.
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
