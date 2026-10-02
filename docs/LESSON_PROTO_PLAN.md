# 카드 레슨 프로토타입 1차 — 구현 계획

> 상태: 구현 계획 · 2026-10-02 · 브랜치 `outgame-lesson` (시작 시점 `main` = `fa1e4ec`과 같음)
> 기준 문서: [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) (L1~L31) · [OUTGAME_CARDS_draft.md](OUTGAME_CARDS_draft.md) (66장) · [ARCHITECTURE.md](ARCHITECTURE.md)
> 사용자 결정 (2026-10-02): **A** 별도 브랜치에서 만들고 다른 주소(`/soccer/lesson/`)에 올린다 · 두 번에 나눠 1차 먼저. **C** 콘텐츠 결정은 추천대로 (L31).
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
