# 웹 프로토타입 아키텍처 & 모듈 계약 (v1.2 — 리뷰 수정 반영)

> 이 문서는 **구현 계약**이다. 각 모듈을 만드는 사람(에이전트)은 서로의 코드를 보지 않고 이 문서만 보고 작업한다.
> 여기 적힌 함수 시그니처·데이터 스키마·수치 키는 그대로 지켜야 한다. 필요한 것이 빠져 있으면 **추가는 하되 기존 것을 바꾸지 않는다.**
> 게임 규칙의 배경은 `docs/GDD_v0.3.md`(없으면 v0.2) 참고. 규칙이 충돌하면 이 문서가 우선.

---

## 0. 원칙

- **Vanilla JS, ES Modules, 빌드 없음.** 프레임워크·번들러·외부 런타임 의존성 금지 (테스트용 devDependency는 허용).
- **엔진은 순수 로직.** `js/engine/*`는 DOM·window·localStorage·fetch·Date.now·Math.random을 쓰지 않는다. 데이터는 인자로 주입받는다.
- **결정적.** 모든 난수는 `rng.js`를 통해서만. 같은 seed + 같은 입력 = 같은 결과.
- **상태는 JSON 직렬화 가능한 순수 객체.** 함수·클래스 인스턴스·Map·Set을 상태에 넣지 않는다. rng 상태는 숫자로 저장한다.
- **엔진 함수는 상태를 in-place로 변경하고 그 상태를 반환한다** (`return state`). UI는 호출 후 `JSON.stringify(state)`로 자동 저장한다.
- **경로는 모두 상대 경로.** GitHub Pages가 `/soccer/` 하위에서 서빙하므로 `/js/...` 같은 절대 경로 금지. `./js/...`, `./data/...`.
- UI 문자열은 한국어. 코드 식별자·주석은 영어 또는 한국어 자유.
- Node 18+에서 `node --test`로 엔진 테스트가 돌아야 한다 (`package.json`에 `"type": "module"`).

---

## 1. 디렉터리 & 소유권

| 경로 | 담당 | 내용 |
|---|---|---|
| `index.html`, `css/base.css` · `css/outgame.css` · `css/match.css` (v0.3.2 — `css/style.css` 를 나눔, §14.2), `js/ui/**` | UI | 화면 전부 (고정 스테이지 1280×720 가로, §14) |
| `js/engine/rng.js`, `js/engine/run.js`, `js/engine/training.js`, `js/engine/rating.js`, `js/engine/effects.js`, `data/config.json`, `data/routes.json` | 엔진(육성) | 런 상태 머신, 훈련, 이벤트 효과 적용, 평가 |
| `js/engine/match.js`, `js/engine/ai.js`, `js/engine/skills.js` | 엔진(경기) | 경기 시뮬, 전술 AI, 스킬 효과 |
| `js/engine/challenge.js`, `data/challenge.json`, `data/challenge_sample_team.json`, `tools/challenge_sim.mjs` (v0.4.5) | 엔진(도전 모드) | 도전 모드 단계 상대 생성 · 등록 팀 스냅샷 · 진행 기록 헬퍼 · 보정 도구 (§18) |
| `data/characters.json`, `data/supports.json`, `data/events.json`, `data/skills.json`, `data/relics.json`, `data/opponents.json` | 데이터 | 콘텐츠 |
| `test/**`, `tools/sim.mjs` | 통합 | 테스트, 헤드리스 시뮬 |
| `docs/**`, `README.md`, `package.json` | 기획 | 문서 |

데이터 로딩: 브라우저는 `fetch('./data/x.json')`, Node는 `fs.readFileSync`. 엔진은 로딩을 모른다.

```js
// UI 또는 테스트가 만들어 엔진에 넘기는 데이터 번들
const data = {
  config, characters, supports, events, skills, relics, opponents, routes
};
// 이후 추가 (선택 파일 — 없으면 404 를 건너뛴다): traits · combos (v0.3), challenge · challenge_sample_team (v0.4.5 도전 모드, §18.1)
```

---

## 2. 공통 열거값

```js
STATS      = ["shoot", "dribble", "pass", "defense", "physical"]
POSITIONS  = ["GK", "DF", "MF", "FW"]
SLOT_TYPES = STATS                       // 훈련 칸 5개 = 스탯 5개
STYLES     = ["power", "speed", "technique"]   // power > technique > speed > power
ELEMENTS   = ["fire", "water", "wind", "earth", "lightning"]
RACES      = ["human", "elf", "dwarf", "beast", "spirit", "giant"]
RARITIES   = ["R", "SR", "SSR"]
APTITUDE   = ["A", "B", "C", "-"]
FORMATIONS = {
  "2-2-2": { DF: 2, MF: 2, FW: 2 },
  "3-1-2": { DF: 3, MF: 1, FW: 2 },
  "1-3-2": { DF: 1, MF: 3, FW: 2 },
  "2-3-1": { DF: 2, MF: 3, FW: 1 }
}
// 슬롯 id: "GK", "DF1".."DF3", "MF1".."MF3", "FW1".."FW2"  (포메이션에 따라 존재)
ACTIONS_ATTACK  = ["dribble", "pass", "shoot"]
ACTIONS_DEFENSE = ["tackle", "intercept", "block"]
// 수읽기: tackle↔dribble, intercept↔pass, block↔shoot
```

---

## 3. rng.js

```js
export function createRng(seed)            // seed: string | number → Rng. 문자열은 해시(예: cyrb53)로 uint32 변환
export function createRngFromState(state)  // state: number (uint32) → Rng
// Rng 인터페이스 (mulberry32 등 단일 uint32 상태)
rng.next()                 // float [0,1)
rng.int(min, max)          // 정수, 양끝 포함
rng.chance(p)              // boolean
rng.pick(arr)              // 원소 1개 (빈 배열이면 undefined)
rng.weighted(items, weightFn) // weightFn(item) → number, 가중 선택
rng.shuffle(arr)           // 새 배열 반환
rng.getState()             // number
```

엔진 내부 관례: 상태 객체에 `rngState: number`를 두고, 함수 진입 시 `const rng = createRngFromState(state.rngState)`, 종료 직전 `state.rngState = rng.getState()`. (`run.js`, `match.js` 각각 자기 상태의 rngState를 관리한다. 경기의 seed는 런이 `rng.int(0, 2**31)`로 뽑아 넘긴다.)

---

## 4. 데이터 스키마

### 4.1 characters.json (배열, 프로토타입 8명)

```jsonc
{
  "id": "ch_wolf_winger",
  "name": "가렌",                    // 독창적 판타지 이름. 실존 IP 이름 금지
  "race": "beast", "element": "wind", "style": "speed", "rarity": "SR",
  "baseStats": { "shoot": 240, "dribble": 300, "pass": 180, "defense": 120, "physical": 220 },
  "growth":    { "shoot": 1.1,  "dribble": 1.2, "pass": 0.9, "defense": 0.8, "physical": 1.0 },
  "aptitude":  { "GK": "-", "DF": "C", "MF": "B", "FW": "A" },   // A는 정확히 1개
  "innateSkillId": "sk_line_breaker",       // skills.json 에 있어야 함. SSR=unique, SR=active, R=passive
  "portraitColor": "#4aa3ff",               // UI가 아트 대신 쓰는 색
  "bio": "한 줄 소개"
}
```
- 초기 스탯 합 가이드: R 900~1000, SR 1100~1250, SSR 1350~1500. 주 포지션 관련 스탯이 높게.
- 8명 구성: GK-A 1, DF-A 2, MF-A 2, FW-A 2, 그리고 MF-A/FW-B 유연 선수 1. 전원 B 부적성 1개 이상 (GK 제외 가능). 종족 6종·원소 5종·스타일 3종이 고르게 섞이도록.
- 기본 스쿼드(`config.defaultSquad`)로 7명이 2-2-2에 A 적성으로 서야 한다.

### 4.2 supports.json (배열, 프로토타입 8장)

```jsonc
{
  "id": "sp_coach_harr",
  "name": "코치 하르나",
  "type": "shoot",                 // STATS 중 하나 | "friend"
  "rarity": "SSR",
  "trainingBonus": 0.15,           // 같은 칸에서 훈련 효율 +15%  (friend 타입은 0)
  "friendshipBonus": 0.6,          // 우정 훈련 시 추가 배율 (효율 × (1 + 0.6))
  "initialBond": 25,
  "specialtyRate": 0.45,           // 자기 타입 칸에 등장할 확률. 나머지는 5칸 균등
  "hintRate": 0.3,                 // 같이 훈련 시 힌트 발생 확률
  "hintSkillIds": ["sk_power_shot", "sk_focus_finish"],
  "failRateReduction": 0.0,        // 같은 칸 선수 실패율 절대값 감소 (예 0.05)
  "eventIds": ["ev_sp_harr_60"],   // events.json 의 trigger:"support" 이벤트
  "portraitColor": "#ff7a3d",
  "bio": "한 줄 소개"
}
```
- 8장: shoot, dribble, pass, defense, physical 각 1 + friend 1 + shoot 1 + pass 1. 레어도 섞기.
- friend 타입: trainingBonus 0, 훈련 칸에도 등장하지만(유대만 상승) 주 역할은 **외출**(§6.4).

### 4.3 skills.json (배열, 학습 가능 15 + 고유 8 = 23)

```jsonc
{
  "id": "sk_line_breaker",
  "name": "라인 브레이커",
  "kind": "active",                 // "passive" | "active" | "unique"  (unique = SSR 고유 필살기, 컷인 표시)
  "learnable": false,               // true면 힌트→구매 가능. 고유 스킬은 false
  "cost": 120,                      // 스킬 포인트 가격 (learnable일 때)
  "tension": 40,                    // active/unique: 사용 시 소모 텐션. passive: 0
  "positions": null,                // null = 전 포지션 | ["FW"] 등 (해당 포지션으로 출전한 선수만 발동/구매)
  "description": "드리블 성공 시 한 라인 추가 전진",
  // passive
  "passive": { "when": "always", "target": "self", "mods": { "attack": 1.1 }, "actions": ["shoot"] },
  // active / unique
  "active": { "effect": "extraLine", "params": {}, "phase": "attack",
              "ai": { "useWhen": "attackDuel", "minTension": 40 } }
}
```

**passive.when** (전부 구현): `"always"`, `"lastPossessions:N"` (남은 포제션 ≤ N), `"trailing"`, `"leading"`, `"tied"`, `"chain>=N"` (연계 스택), `"lowStamina"` (본인 20% 이하), `"goalMatch"`, `"vsStyle:power|speed|technique"` (상대 듀얼 선수 스타일), `"element:fire..."` 는 쓰지 않음(공명이 대신).
**passive.target**: `"self"` (이 선수가 듀얼 당사자일 때) | `"team"` (팀 전원의 듀얼).
**passive.mods** (곱, 생략 가능): `attack`, `defense`, `staminaCost`, `tensionGain`, `save`(GK 세이브), `shootPower`, `coverBonus`.
**passive.actions**: 해당 액션일 때만 적용 (생략 = 전부).

**active.phase**: `"attack"` (공격 듀얼 당사자일 때) | `"defense"` | `"any"`.
**active.effect** (전부 구현):

| effect | params | 의미 |
|---|---|---|
| `boost` | `{ "attack": 1.3 }` 또는 `{ "defense": 1.3 }` | 이번 듀얼 배율 |
| `extraLine` | — | 이번 듀얼 성공 시 한 라인 추가 전진 (DF 라인 돌파 후면 슛 위력 +20%) |
| `reveal` | — | 이번 듀얼 상대 의도 완전 공개 (AI는 사용 시 상대 선택에 맞춰 카운터) |
| `steal` | — | 수비 성공 시 역습 시작 라인 한 칸 전진 |
| `recover` | `{ "amount": 20 }` | 팀 전원 경기 체력 회복 |
| `chainBoost` | `{ "amount": 2 }` | 연계 스택 +N |
| `shield` | `{ "defense": 1.4 }` | (defense 전용) 이번 듀얼 수비 배율 |
| `powerShot` | `{ "shoot": 1.5, "stamina": 10 }` | 슛 위력 배율, 추가 체력 소모 |

**active.ai.useWhen**: `"attackDuel"`, `"defenseDuel"`, `"beforeShoot"`, `"anyDuel"`, `"whenTrailing"`, `"lastPossessions:N"`.

### 4.4 events.json (배열: 랜덤 20 + 서포트 8 + 시즌/경기 전 4 이상)

```jsonc
{
  "id": "ev_night_training",
  "trigger": "random",              // "random" | "support" | "seasonStart" | "preMatch" | "route"
  "supportId": null,                // trigger:"support" 일 때 필수
  "bondAtLeast": 60,                // trigger:"support" 일 때 (한 번만 발생)
  "routeId": null,                  // trigger:"route" 일 때
  "characterId": null,              // 특정 선수 전용이면 지정. null이면 {player}는 랜덤 선수
  "weight": 1, "minTurnIndex": 0, "seasons": [1, 2, 3], "once": true,
  "title": "야간 특훈",
  "text": "{player}가 야간 특훈을 하고 싶다고 합니다.",     // 치환: {player} {support} {season}
  "choices": [
    {
      "text": "허락한다",
      "preview": "슈팅 +30 / 50%: 체력 −40, 부상",          // UI에 결과 공개 (GDD 결정)
      "effects": [
        { "type": "stat", "target": "player", "stat": "shoot", "amount": 30 },
        { "type": "random", "chance": 0.5,
          "then": [ { "type": "stamina", "target": "player", "amount": -40 },
                    { "type": "injury", "target": "player", "turns": 2 } ],
          "else": [] }
      ],
      "resultText": "{player}의 슈팅이 날카로워졌습니다."
    },
    { "text": "쉬라고 한다", "preview": "컨디션 +1",
      "effects": [ { "type": "condition", "amount": 1 } ],
      "resultText": "{player}가 아쉬워하며 돌아갑니다." }
  ]
}
```
- 선택지는 1~2개. `choices`가 1개면 확인만.
- `preMatch`는 목표 경기 직전 턴(turn 8 행동 후)에, `seasonStart`는 시즌 첫 턴 시작에 발생.

**효과 타입** (`effects.js`가 전부 구현):

| type | 필드 | 의미 |
|---|---|---|
| `stat` | `target`, `stat` (STATS \| `"main"` \| `"random"`), `amount` | 스탯 증감. `main` = 대상의 포지션 주 스탯(§6.2) |
| `stamina` | `target`, `amount` | 훈련 체력 증감 (0~100 클램프) |
| `condition` | `amount` | 팀 컨디션 단계 증감 (0~4) |
| `teamwork` | `amount` | 팀워크 증감 (0~100) |
| `bond` | `target` (`"trigger"` \| `"all"` \| supportId), `amount` | 유대 증감 |
| `hint` | `skill` (`"random"` \| skillId), `level` | 힌트 획득 (레벨 누적, 최대 3). random = 학습 가능 스킬 중 |
| `skillPoints` | `amount` | 스킬 포인트 |
| `injury` | `target`, `turns` | 부상 (훈련·경기 결장) |
| `heal` | `target` | 부상 회복 |
| `relic` | — | 유물 선택 3개 제시 (phase → `relic`) |
| `summonTicket` | `amount` | 호출권 |
| `modifier` | `key`, `amount`, `duration` (`"season"` \| `"run"`) | §6.7 modifier 추가 |
| `random` | `chance`, `then[]`, `else[]` | 확률 분기 |

**target**: `"player"` (이벤트의 {player}) | `"randomPlayer"` | `"team"` (전원) | `"position:FW"` 등 | `"trigger"` (bond 전용) | characterId.

### 4.5 relics.json (배열, 10개)

```jsonc
{ "id": "rl_captain_band", "name": "낡은 주장 완장", "rarity": "SR",
  "description": "목표 경기에서 팀 컨디션 +1단계",
  "modifiers": { "goalMatchCondition": 1 } }
```
modifier 키는 §6.7 목록만 사용.

### 4.6 opponents.json (배열, 목표 경기 3 + 친선전 풀 3 = 6팀)

```jsonc
{
  "id": "op_s1_ironhoof", "name": "아이언후프 FC", "race": "dwarf", "element": "earth",
  "role": "goal", "season": 1,             // role: "goal" | "friendly" ; friendly는 season = 등장 시즌
  "formation": "2-2-2",
  "intentReveal": "full",                  // 시즌1 full, 시즌2 partial, 시즌3 none  (friendly는 시즌 따라)
  "tactics": { "attack": "dribble", "shootTiming": "breakAll", "defense": "tackle", "tension": "immediate", "duelPicker": "best" },
  "players": [
    { "name": "…", "slot": "GK", "position": "GK", "style": "power", "element": "earth",
      "stats": { "shoot": 100, "dribble": 120, "pass": 150, "defense": 360, "physical": 340 },
      "skillIds": [] }
    // 7명. 슬롯은 포메이션과 일치
  ]
}
```
- 스탯 가이드 (선수당 합, `tools/sim.mjs` 로 튠한 v1.1 값): 시즌1 목표 1400~1450, 시즌2 2180~2250, 시즌3 2840~2950. 친선전은 같은 시즌 목표팀보다 4~6% 낮게. (초안 1400~1500 / 1900~2000 / 2500~2600 은 시즌2·3 승률이 목표를 크게 넘겨 상향.)
- 시즌3 팀은 원소 공명(같은 원소 3명+)과 스킬 2~3개 보유.

### 4.7 routes.json (3개)

```jsonc
{ "id": "rt_camp", "name": "명문 캠프", "description": "다음 시즌 훈련 효율 +20%, 부상률 +5%p",
  "effects": [ { "type": "modifier", "key": "trainingEfficiency", "amount": 0.2, "duration": "season" },
               { "type": "modifier", "key": "injuryRate", "amount": 0.05, "duration": "season" } ],
  "forcedFriendly": false,
  "guaranteedSeasonStartEvent": false }   // true 면 다음 시즌 seasonStart 이벤트 확정 (온천)
```
3개: 명문 캠프 / 원정(`forcedFriendly: true`, 승리 시 `relic` 효과는 run.js가 처리) / 온천 휴양(전원 체력 100·컨디션 4, `guaranteedSeasonStartEvent: true` 로 `seasonStart` 이벤트 1개 확정).

### 4.8 config.json (엔진(육성) 소유. 아래는 v1.1 튠 값 — 실제 기준은 `data/config.json`)

```jsonc
{
  "turnsPerSeason": 8, "seasons": 3, "statCap": 1000,
  "defaultSquad": { "formation": "2-2-2",
    "slots": { "GK": "ch_…", "DF1": "…", "DF2": "…", "MF1": "…", "MF2": "…", "FW1": "…", "FW2": "…" } },
  "defaultSupports": ["sp_…" ×6],
  "defaultTactics": { "attack": "balanced", "shootTiming": "breakAll", "defense": "balanced", "tension": "clutch", "duelPicker": "best" },
  "training": {
    "mainGain": 56, "subGain": 20, "freeTrainRatio": 0.35, "staminaCost": 20,   // 초안 14/5/0.2 → sim 튠 (24턴 후 avgStat ≈ 480 = B)
    "crowdBonusPerExtraPlayer": 0.05,
    "failRateByStamina": [[60, 0.02], [40, 0.10], [20, 0.25], [0, 0.45]],
    "failStatLoss": 5, "injuryChanceOnFail": 0.5, "injuryTurns": 2,
    "bondPerTraining": 12, "friendshipThreshold": 80, "teamworkPerExtraPlayer": 2,   // 초안 7 → 12 (우정 훈련 ≥ 3회/런)
    "subStatMap": { "shoot": "dribble", "dribble": "pass", "pass": "shoot", "defense": "physical", "physical": "defense" },
    "slotWeights": {
      "GK": { "shoot": 2,  "dribble": 3,  "pass": 15, "defense": 40, "physical": 40 },
      "DF": { "shoot": 5,  "dribble": 10, "pass": 20, "defense": 40, "physical": 25 },
      "MF": { "shoot": 15, "dribble": 25, "pass": 35, "defense": 15, "physical": 10 },
      "FW": { "shoot": 35, "dribble": 30, "pass": 15, "defense": 5,  "physical": 15 } }
  },
  "rest":     { "stamina": 40, "conditionUpChance": 0.3 },
  "outing":   { "condition": 1, "bond": 10, "teamStamina": 10 },
  "meeting":  { "teamwork": 10 },
  "friendly": { "staminaCost": 30, "possessions": 6, "skillPointsWin": 20, "skillPointsLoss": 10, "relicChanceOnWin": 0.3 },
  "goalMatch": { "possessions": [8, 10, 12], "skillPointsWin": 30, "skillPointsLoss": 15 },
  "condition": { "start": 2, "trainingMult": [0.8, 0.9, 1.0, 1.1, 1.2], "matchMult": [0.9, 0.95, 1.0, 1.05, 1.1] },
  "aptitudeMult": { "A": 1.0, "B": 0.9, "C": 0.75 },
  "eventChancePerTurn": 0.6,
  "summonTicketsPerSeason": 1,
  "youthSubstitute": { "stats": 120, "style": "power" },
  "elementResonance": { "minPlayers": 3, "strongPlayers": 4, "strongMult": 1.5,
    "bonus": { "fire": { "shootPower": 0.05 }, "water": { "staminaCost": -0.10 }, "wind": { "passAttack": 0.05 },
               "earth": { "defense": 0.05 }, "lightning": { "tensionGain": 0.20 } } },
  "rating": { "skillValue": 10, "teamworkWeight": 0.5,
    "thresholds": { "S": 700, "A": 600, "B": 500, "C": 400, "D": 300, "E": 200, "F": 100, "G": 0 },
    "capByLosses": ["S", "A", "B", "C"] },
  "match": {
    "styleAdv": 1.25, "styleDis": 0.8, "readBonus": 1.5, "minP": 0.1, "maxP": 0.9,
    "actionCoef": { "dribble": 1.8, "pass": 1.8, "shoot": 1.5, "midrangeShoot": 1.0, "tackle": 1.0, "intercept": 1.0, "block": 1.0, "save": 1.0 },   // 초안 전부 1.0/0.7 → 골 ≈ 1.5/경기
    "passChainBonus": 0.1, "coverBonusPerExtraDefender": 0.1, "teamworkPassBonusPer100": 0.1,
    "staminaCost": { "dribble": 8, "pass": 4, "shoot": 5, "defend": 4 }, "staminaMax": 100,
    "lowStaminaThreshold": 0.2, "lowStaminaMult": 0.8,
    "tension": { "duelWin": 10, "steal": 15, "save": 15, "goal": 20, "max": 100, "start": 20 },
    "extraTimePossessions": 2, "penaltyShots": 5,
    "aiRevealForOpponent": "partial"
  }
}
```

---

## 5. 런 상태 (`RunState`) — run.js 소유

```jsonc
{
  "version": 1,
  "seed": "abc", "rngState": 123456,
  "phase": "turn",            // "turn" | "event" | "match" | "relic" | "route" | "finished"
  "season": 1, "turn": 1, "turnIndex": 0,      // turnIndex 0..23
  "leagueTier": 1,
  "formation": "2-2-2",
  "tactics": { … },
  "players": [ {
      "id": "p1", "charId": "ch_…", "name": "…", "slot": "FW1", "position": "FW", "aptitude": "A",
      "race": "beast", "element": "wind", "style": "speed", "rarity": "SR", "portraitColor": "#…",
      "stats": { … }, "growth": { … },
      "stamina": 100, "injuredTurns": 0,
      "innateSkillId": "sk_…", "learnedSkillIds": [],       // learned 최대 3
      "trainedCount": 0
  } ],
  "supports": [ { "id": "sp_…", "bond": 25, "firedEventIds": [] } ],
  "condition": 2, "teamwork": 0, "skillPoints": 0,
  "hints": { "sk_…": 1 },
  "relics": ["rl_…"],
  "modifiers": [ { "key": "trainingEfficiency", "amount": 0.2, "untilSeason": 2 } ],   // untilSeason null = 런 끝까지
  "summonTickets": 1, "summon": null,        // { "playerId": "p3", "slot": "shoot" } 이번 턴 예약
  "placement": { "shoot": { "players": ["p1"], "supports": ["sp_a"] }, "dribble": {…}, "pass": {…}, "defense": {…}, "physical": {…} },
  "currentEvent": null,       // { "eventId", "playerId", "supportId" }
  "pendingMatch": null,       // { "kind": "goal"|"friendly", "opponentId", "possessions", "seed", "reason": "goal"|"friendly"|"route" }
  "lastMatchResult": null,    // finishMatch 가 채움 (UI 결과 표시용)
  "pendingRelicChoices": null,   // [relicId ×3]
  "pendingRoutes": null,         // [routeId ×3]
  "record": { "goalMatches": [ { "season": 1, "opponentId": "…", "win": true, "home": 2, "away": 1, "penalties": { "home": 4, "away": 3 } } ], "friendlies": [], "losses": 0 },
  //   goalMatches[].penalties 는 승부차기로 끝났을 때만 (v1.2 추가). 목표 경기는 무승부가 없으므로 UI 는 동점 스코어에 PK 결과를 붙여 표시
  "usedEventIds": [],
  "log": [ { "turnIndex": 0, "text": "…" } ],
  "rating": null,             // finalize 후 { score, grade, cappedGrade, breakdown }
  "queue": []                 // (v1.1 추가) 이벤트/경기/유물/루트 대기 뒤에 이어 처리할 내부 단계 목록. 순수 문자열 배열
}
```

### 5.1 run.js API

```js
export function createRun({ data, seed, squad, formation, supportIds, tactics, leagueTier = 1 })
// squad: { [slotId]: characterId }  (포메이션 슬롯 전부 채움). GK는 적성 A/B만 허용 → 아니면 throw.
// 적성 "-" 배치 → throw. C는 허용(페널티).
// 시작: 유대 = support.initialBond, 컨디션 = config.condition.start, 텐션 등 초기화, 시즌1 seasonStart 이벤트 체크 → 없으면 placement 생성 후 phase "turn".

export function getPhase(state)   // state.phase

export function getTurnView(state, data)
// → {
//   season, turn, turnIndex, turnsUntilMatch, nextMatch: { opponentName, element, style(주요), intentReveal, baseIntentReveal, possessions },
//     nextMatch.intentReveal 은 실제 경기와 같은 값(상대 기본값 + getModifier("intentReveal") 단계 상승, none→partial→full). 기본값은 baseIntentReveal (v1.2)
//   condition, teamwork, skillPoints, summonTickets,
//   players: [ { id, name, slot, position, aptitude, stamina, injuredTurns, stats, portraitColor, mainStat } ],
//   slots: [ { type, players: [playerId], supports: [ { id, name, type, bond, friendship: bool, hint: bool } ],
//             preview: { perPlayer: [ { playerId, gains: { [stat]: n }, staminaCost, failRate } ], freePlayers: [ { playerId, gains } ],
//                        totalGain, maxFailRate, friendship: bool, bondGain: [ { supportId, amount } ] } } ],
//   recommendedSlot: "shoot",
//   recommendedAction: "train" | "rest",   // (v1.1 추가) 팀 평균 체력 < 40 또는 추천 칸 실패율 ≥ 25% 면 "rest"
//   canOuting: bool (friend 타입 서포트 보유 여부와 무관하게 항상 true; friend 있으면 friendSupportId 제공), friendSupportId,
//   shop: [ { skillId, name, cost, discountedCost, hintLevel, eligiblePlayerIds } ],     // 힌트 보유 스킬만
//   relics: [relicId], modifiers: [...], log: 최근 20개
// }

export function applyAction(state, data, action)
// action: { type: "train", slot } | { type: "rest" } | { type: "outing" } |
//         { type: "meeting", tactics?, formation?, swaps?: [ { playerId, slot } ], buy?: { skillId, playerId } } |
//         { type: "friendly" } | { type: "summon", playerId, slot }  (턴 소모 없음, placement 재계산: 그 선수를 그 칸으로)
// 턴 소모 행동 후: 이벤트 판정(§6.6) → phase "event" 또는 턴 진행 → 시즌 마지막 턴이면 pendingMatch 세팅 후 phase "match".
// friendly는 즉시 pendingMatch(kind friendly) 세팅, phase "match". 경기 후 턴 진행.
// 반환: state

export function resolveEvent(state, data, choiceIndex)   // phase "event" → 효과 적용, 결과 텍스트를 log에 → 다음 phase
export function getEventView(state, data)   // { eventId, trigger, title, text(치환 완료), choices: [ { text, preview } ], player: { id, name, portraitColor, slot, position }|null, support: { id, name, portraitColor, type, bond }|null }

export function getMatchSetup(state, data)  // phase "match" → { home: TeamSnapshot, away: TeamSnapshot, possessions, seed, rules, kind, opponentName }
export function finishMatch(state, data, matchResult)
// 기록·스킬 포인트·유물 선택(승리 시 3개 → phase "relic") → 시즌 끝이면 route(시즌1,2) 또는 finished(시즌3) → 아니면 다음 턴
// matchResult = match.getResult() 반환값. 선수별 경기 체력은 훈련 체력에 영향 없음(분리).

export function chooseRelic(state, data, relicId)   // phase "relic" → 다음 phase. 선택지가 비어 있으면 relicId null 로 건너뛰기 허용
export function chooseRoute(state, data, routeId)   // phase "route" → 효과 적용, 다음 시즌 시작(호출권 +1, 시즌 modifier 만료, seasonStart 이벤트)

export function finalizeRun(state, data)  // phase "finished" 에서 rating 채움 → { rating, registeredTeam }
// registeredTeam = { name, seed, formation, tactics, players: [ snapshot 7명 ], teamwork, rating, createdTurnIndex }

export function buildTeamSnapshot(state, data)              // 우리 팀 → TeamSnapshot (부상 선수는 유스로 교체)
export function buildOpponentSnapshot(opponent, data)        // opponents.json 항목 → TeamSnapshot
export function getModifier(state, key)                      // 활성 modifier 합 (없으면 0)
export function getEffectiveStats(state, playerId, data?)   // 스탯 × 적성 배율 (경기용). data 생략 시 배율 {A:1, B:0.9, C:0.75}
```

### 5.2 TeamSnapshot (run → match)

```jsonc
{
  "side": "home", "name": "우리 클럽", "formation": "2-2-2",
  "tactics": { … }, "teamwork": 42, "conditionMult": 1.0,
  "gaanpaTickets": 0, "gaanpaCostHalf": false,   // (v0.3) 경기마다 간파 사용권 수 · 간파 스킬 텐션 ×0.5 (§13.2-8). intentReveal 은 삭제
  "resonance": { "element": "wind", "strong": false, "bonus": { "passAttack": 0.05 } } | null,
  "modifiers": { "shootPower": 0, "defense": 0, "tensionGain": 0, "staminaCost": 0, "passAttack": 0, "dribbleStaminaRefund": 0,
                 "gaanpaTicket": 0, "gaanpaCostHalf": 0 },  // 유물 등 합산치 (v0.3: intentReveal 삭제, gaanpa 2키 추가)
  "players": [ { "id": "p1", "charId": "ch_…", "name": "…", "slot": "FW1", "position": "FW", "style": "speed", "element": "wind", "race": "beast",
                 "stats": { … 적성 배율 적용됨 … }, "skillIds": ["sk_…"], "trait": "runner" | null,   // (v0.3) 연계 특성, 유스 null
                 "portraitColor": "#…", "isYouth": false } ]
}
```

---

## 6. 육성 규칙 (training.js / effects.js / run.js)

### 6.1 훈련 칸 배치 (`placeSlots`)
- 매 턴 시작에 선수 7명(부상자 제외)을 `slotWeights[player.position]` 가중으로 칸에 배치. `state.summon`이 있으면 그 선수는 그 칸으로 고정.
- 서포트 6장: `specialtyRate` 확률로 자기 타입 칸, 아니면 5칸 균등. friend 타입은 균등.

### 6.2 훈련 결과 (`resolveTraining`)
칸 `T`를 고르면 그 칸 선수 각각:
```
eff = trainingMult[condition] × (1 + Σ supportsInSlot.trainingBonus) × (1 + friendshipBonusSum) × (1 + crowdBonusPerExtraPlayer × (n-1)) × (1 + getModifier("trainingEfficiency"))
friendshipBonusSum = Σ (bond ≥ 80 이고 support.type === T 인 카드의 friendshipBonus)
mainGain = round(config.training.mainGain × growth[T] × eff)
subGain  = round(config.training.subGain × growth[sub] × eff)      // sub = subStatMap[T]
failRate = failRateByStamina 구간값(현재 체력) + getModifier("injuryRate") − Σ support.failRateReduction, [0, 0.95]
```
- 성공: 스탯 +gain (cap 1000), 체력 −staminaCost, trainedCount+1.
- 실패: 스탯 −failStatLoss(T), 체력 −staminaCost, `injuryChanceOnFail`로 부상(`injuredTurns`).
- 유대: 칸의 서포트 전부 `bondPerTraining` (+ getModifier("bondGain")).
- 힌트: 칸의 서포트 각각 `hintRate` 확률로 `hintSkillIds` 중 하나 힌트 +1 (최대 3).
- 팀워크 += teamworkPerExtraPlayer × (n−1).
- 다른 칸 선수: 자기 칸 주 스탯 += round(mainGain(그 선수 기준, eff 없이 trainingMult만) × freeTrainRatio). 체력 소모 없음.
- 주 스탯(`main`) 정의: GK/DF → defense, MF → pass, FW → shoot.
- 부상자: `injuredTurns` = **앞으로 결장하는 턴 시작 배치 횟수**. 매 턴 시작 배치(`beginTurn`)에서 제외된 직후 −1 (턴 종료 시가 아님 — 종료 시 감소면 부상이 난 그 턴에 바로 1 줄어 `turns:1` 이 무효가 된다). `turns:1` → 다음 배치 1회 결장, 훈련 실패(`injuryTurns` 2) → 2회 결장. 목표 경기 직전(preMatch) 부상은 경기에서 유스 대체 후 다음 시즌 배치에서 소진(경기는 배치가 아니라 카운트하지 않음). 부상 중엔 배치되지 않고 훈련 없음.

### 6.3 휴식 — 전원 체력 += rest.stamina × (1 + getModifier("restEffect")); conditionUpChance로 컨디션 +1.
### 6.4 외출 — friend 서포트 있으면 그 카드 유대 += outing.bond, 컨디션 += 1, 그 카드의 미발생 support 이벤트 중 조건 충족한 것을 즉시 발생. 없으면 컨디션 +1, 전원 체력 += outing.teamStamina.
### 6.5 전술 미팅 — 팀워크 += meeting.teamwork. 같은 액션 안에서 전술/포메이션/선수 스왑/스킬 구매 1회 처리. 구매: 힌트 보유 스킬만, 가격 = cost × (1 − 0.1 × hintLevel), 대상 선수 `learnedSkillIds` < 3, positions 조건 충족.
### 6.6 이벤트 판정 (턴 소모 행동 직후)
1. `support` 트리거: 유대가 `bondAtLeast` 이상이고 미발생인 서포트 이벤트가 있으면 그것 (우선).
2. 아니면 `eventChancePerTurn` 확률로 `random` 이벤트 1개 (weight, minTurnIndex, seasons, once 필터).
3. 시즌 마지막 턴 행동 후에는 `preMatch` 이벤트 1개 확정(있으면).
이벤트가 발생하면 phase `event`. `resolveEvent` 후 원래 진행(다음 턴 또는 match).
### 6.7 modifier 키 (getModifier 합산; 유물·루트·이벤트가 씀)

| key | 쓰는 곳 |
|---|---|
| `trainingEfficiency` | 훈련 eff |
| `injuryRate` | failRate 가산 |
| `restEffect` | 휴식량 배율 가산 |
| `bondGain` | 유대 상승 가산 |
| `hintRate` | 힌트 확률 가산 |
| `skillPointGain` | 스킬 포인트 배율 가산 |
| ~~`intentReveal`~~ | (v0.3 삭제 — 의도 공개 폐지. effects.js 가 이 키를 throw 한다. 옛 저장 런은 `gaanpaTicket` 으로 이행) |
| `gaanpaTicket` | (v0.3) 경기마다 간파 사용권 수 → 스냅샷 `team.gaanpaTickets` (§13.2-8) |
| `gaanpaCostHalf` | (v0.3) ≥ 1 이면 간파 스킬(readBoost·negateRead) 텐션 ×0.5 → 스냅샷 `team.gaanpaCostHalf` |
| `goalMatchCondition` | 목표 경기 컨디션 단계 가산 |
| `shootPower`, `defense`, `passAttack`, `tensionGain`, `staminaCost` (+ `dribbleStaminaRefund`, `gaanpaTicket`, `gaanpaCostHalf`) | 경기 스냅샷 `modifiers`로 전달 |
| `lossPenaltyHalf` | 1이면 패배 보상 감소 절반 |
| `dribbleStaminaRefund` | 드리블 성공 시 확률로 체력 +5 (값 = 확률) |

### 6.8 시즌 흐름
- turn 8 행동 → (preMatch 이벤트) → `pendingMatch = goal` (possessions = goalMatch.possessions[season−1], 상대 = opponents 중 role goal & season). 컨디션에 `goalMatchCondition` 임시 가산.
- 경기 후: 승 → skillPoints += 30 × (1+skillPointGain), `pendingRelicChoices` 3개(미보유 중 랜덤) → phase relic. 패 → skillPoints += 15, losses += 1, 유물 없음(`lossPenaltyHalf`면 2개 중 1개).
- 시즌 1·2 끝: phase `route` (routes.json 3개 전부 제시). `chooseRoute` → 효과 → 다음 시즌 turn 1, 호출권 += 1, `untilSeason < 새 시즌` modifier 제거, seasonStart 이벤트 체크.
- 원정 루트: 다음 시즌 turn 1 시작 전에 `pendingMatch = friendly (reason: "route")` (상대 = 그 시즌 friendly 중 가장 강한 팀). 승리 시 유물 3택.
- 시즌 3 끝: phase `finished`.

### 6.9 평가 (rating.js)
```
avgStat = Σ(7명 5스탯, 적성 배율 미적용) / 35
score   = avgStat + skillValue × (learned 스킬 수) + teamworkWeight × teamwork
grade   = thresholds 로 결정, cappedGrade = min(grade, capByLosses[min(losses,3)])
```
`breakdown`에 위 항목과 경기 기록 포함.

---

## 7. 경기 규칙 (match.js / ai.js / skills.js)

### 7.1 MatchState
```jsonc
{
  "seed": 1, "rngState": 1, "kind": "goal", "possessionsTotal": 8, "possession": 1,
  "attackingSide": "home", "phase": "decision",   // "decision" | "resolved" | "possessionEnd" | "extraTime" | "penalties" | "finished" | "distribution"(v0.4.4 GK 배급 대기 — §17.1)
  "home": { …TeamSnapshot, "tension": 20, "live": { "p1": { "stamina": 100 } } }, "away": { … },
  "ball": { "carrierId": "p3", "lineIndex": 0, "chain": 0, "extraLine": false },
  // lineIndex 0 = 상대 FW 라인, 1 = MF 라인, 2 = DF 라인, 3 = GK(슛)
  "duel": { "defenderId": "q5", "coverCount": 1,
            "awayChoice": { "action": "tackle", "skillId": null } | null,     // AI가 먼저 결정(비공개)
            "homeChoice": null,
            "revealToHome": { "level": "partial", "candidates": ["tackle", "intercept"] } | null },
  "score": { "home": 0, "away": 0 },
  "events": [ { "possession": 1, "type": "duel", "text": "…", "side": "home", "success": true } ],   // UI 로그용, 전체 누적
  "stats": { "home": { "shots": 0, "duelsWon": 0, "goals": 0, "mvpId": null }, "away": { … } },
  "finished": false, "result": null
}
```

### 7.2 match.js API
```js
export function createMatch({ data, seed, home, away, possessions, kind })  // kind: "goal" | "friendly" | "arena"
export function getMatchView(state, data, humanSide = "home")
// → { score, possession, possessionsTotal, attackingSide, lineIndex, lineLabel,
//     carrier: { id, name, side, stamina }, defender: { id, name, side, stamina, coverCount },
//     needsDecision: null | "attack" | "defense",        // humanSide 차례이고 아직 선택 안 했을 때
//     actions: [ { action, enabled, label, hint: "vs 태클에 약함" } ],
//     skills:  [ { skillId, name, tension, enabled, description, kind } ],   // 현재 당사자(우리 선수)의 active/unique
//     intent:  null | { level: "full"|"partial"|"none", candidates: [action], countered?: true },  // 상대 선택 공개 정보
//              countered: 상대 AI 가 이번 듀얼에 reveal 스킬을 써서 우리 선택에 맞춰 카운터한다 → level "none", candidates [] (커밋 액션은 판정 시 바뀌므로 공개하지 않음) (v1.2)
//     tension: { home, away }, players: { home: [ { id, name, slot, stamina, staminaMax, isCarrier, isDefender } ], away: [...] },
//     recentEvents: 마지막 6개, phase, finished, result }
export function step(state, data, decision = null)
// 한 듀얼(또는 킥오프/포제션 종료) 진행. decision = { action, skillId? } 는 humanSide가 needsDecision 상태일 때만 사용.
// decision 없이 호출되면 humanSide도 AI가 결정(자동). 반환: state
export function simulateAuto(state, data)   // finished까지 step 반복 → state
export function isFinished(state)
export function getResult(state)  // { kind, home, away, winner: "home"|"away"|"draw", homeGoals, awayGoals, penalties?: {home, away}, stats, events }
```

### 7.3 포제션 진행
1. **시작**: 킥오프 또는 역습. 공격 팀의 시작 선수와 lineIndex 결정(§7.5). chain = 0. 킥오프(경기 시작·골 후)는 `match.kickoffLine`(기본 1 = 중원, MF 시작 — GDD #55).
2. **듀얼 준비**: 수비 라인 = lineIndex에 대응하는 상대 라인(0→FW, 1→MF, 2→DF). 수비 선수 선택 = 수비 팀 `tactics.duelPicker` (`best`: 관련 수비 스탯 최고, `matchup`: 공격자 스타일에 유리한 선수 우선). 라인의 나머지 선수 수 = coverCount.
3. **선택**: AI 측(항상 away; 자동이면 home도)이 먼저 결정. 인간 측에는 `intentReveal`(상대 팀 스냅샷의 intentReveal + modifiers.intentReveal 단계 상승)에 따라 공개: `full` = 정확히, `partial` = 실제 + 무작위 1개(순서 섞음), `none` = null.
   - 공격 가능 액션: line 0·1: dribble, pass. line 2: dribble, pass(같은 라인 FW 동료가 있을 때만), shoot(midrangeShoot 계수). line 3(GK): shoot만, 수비 선택 없음(GK는 save).
   - 수비 가능 액션: line 0·1: tackle, intercept (block 비활성). line 2: 셋 다.
4. **판정**:
```
att = stat(action) × actionCoef × styleMult × conditionMult × staminaMult × skillMods × (1 + passChainBonus × chain if shoot) × (1 + teamworkPassBonusPer100 × teamwork/100 if pass) × (1 + resonance/modifier 보너스)
def = stat(defense; block은 (defense+physical)/2) × actionCoef × styleMult × conditionMult × staminaMult × skillMods × (1 + coverBonusPerExtraDefender × coverCount) × (readBonus if 수읽기 성공)
GK: def = defense × save 계수 × … (수읽기 없음, coverCount 0)
p = clamp(att / (att + def), minP, maxP)
```
   - stat(action): dribble→dribble, pass→pass, shoot→shoot, tackle/intercept→defense.
   - 수읽기 성공 = (tackle & dribble) | (intercept & pass) | (block & shoot).
   - styleMult: 공격자 vs 수비자 스타일 유리 ×styleAdv / 불리 ×styleDis (power>technique>speed>power).
   - staminaMult: 체력 ≤ 20% → lowStaminaMult.
5. **결과**:
   - dribble 성공: lineIndex+1, 같은 carrier. 체력 −8(×(1−physical/2000)). `extraLine`이면 +2.
   - pass 성공: lineIndex+1, carrier = 다음 라인 동료(관련 스탯 최고, 동률 랜덤; line 2에서는 같은 라인 다른 FW). chain+1.
   - shoot(midrange/GK) 성공: 골. 텐션 +goal. 상대 킥오프.
   - 실패: 턴오버 → 포제션 종료. 텐션: 수비 팀 +steal(또는 GK save). 공격 팀 duelWin 텐션은 성공 시 +duelWin.
   - 수비자 체력 −defend, 공격자 −action 비용. staminaCost mods 적용.
6. **포제션 종료** → possession+1. 새 공격 팀 = 공을 얻은 팀. 시작 위치 §7.5. possession > possessionsTotal → 종료 판정(§7.6).

### 7.5 역습 시작 위치
| 턴오버 위치 (수비 성공 라인) | 역습 팀 시작 lineIndex |
|---|---|
| 상대 FW 라인(line 0)에서 뺏음 | 2 (바로 DF 라인 공략) |
| MF 라인(line 1) | 1 |
| DF 라인(line 2) | 0 |
| GK 세이브 · 박스 연결 차단 | ~~0 (distributor GK 면 1)~~ → **GK 배급** (v0.4.4, §17.1): 짧은 패스 = 0, 롱패스 성공 = 1, 롱패스 실패 = 상대가 1 |
| 버티기(hold)로 뺏음 | 위 기본값 − `match.holdStartBack`(기본 1), 최소 0 → line 0 에서 1, line 1·2 에서 0. intercept·steal 보너스 없음 (GDD #54) |
| 킥오프 (경기 시작 · 골 후) | `match.kickoffLine` (기본 1 = 중원) (GDD #55) |
`steal` 스킬: +1 (최대 2). 시작 carrier: line 0 → DF 중 pass 최고, line 1 → MF 중 dribble+pass 최고, line 2 → FW 중 shoot 최고 (`tactics.kickoffPlayerId`가 있고 라인이 맞으면 그 선수).

### 7.6 종료
- friendly: possessionsTotal 후 종료, 무승부 허용.
- goal/arena: 동점이면 extraTimePossessions(각 팀 1회씩 공격) → 여전히 동점이면 승부차기 penaltyShots(슛 vs GK, 교대) → 동점이면 서든데스.
- v0.4.4: 종료 판정 전에 **마지막 공격 보장**(정확히 1골 뒤진 다음 포제션 팀에 +1 포제션, 단계당 1회 — §17.7).

### 7.7 텐션 & 스킬
- 텐션은 팀 게이지(0~max, 시작 start). 획득 ×(1 + tensionGain 보정).
- active/unique 사용 시점: 결정 단계에서 `decision.skillId`로 함께 제출. AI는 `active.ai`와 `tactics.tension` (`save`: 남은 포제션 ≤ 3 또는 슛일 때만 / `immediate`: 조건 충족 시 즉시 / `clutch`: 동점·열세이고 남은 포제션 ≤ 3, 또는 슛)으로 결정.
- passive는 매 판정에서 `skills.js`의 `collectMods(team, playerId, ctx)`가 적용. ctx = { action, phase, lineIndex, chain, possessionsLeft, scoreDiff, opponentStyle, isGoalMatch, stamina }.
- `unique` 사용 시 events에 `type: "cutin"` 추가 (UI 연출).

### 7.8 ai.js
```js
export function decideAttack(state, data, side)   // → { action, skillId|null }
export function decideDefense(state, data, side)  // → { action, skillId|null }
```
- 공격: 가능한 액션의 성공 확률 추정(자기 스탯 vs 수비자 defense, 스타일 포함)에 tactics 가중(`dribble` +0.15 드리블, `pass` +0.15 패스; `shootTiming: midrange`면 line 2에서 슛 확률 ≥ 0.35이면 슛). 체력 20% 이하 carrier는 패스 선호. 소량 랜덤(±0.1).
- 수비: 상대 tactics 분포 추정(상대 스냅샷 tactics 보고 dribble/pass 확률) + 공개된 의도(`aiRevealForOpponent`, AI 측이 볼 수 있는 수준)로 카운터. `tactics.defense`: `tackle`/`intercept` 편향, `readIntent`면 공개 정보 우선.
- 인간 팀 자동 진행도 같은 함수 사용 (side = "home").

---

## 8. UI 요구사항 (index.html / css / js/ui)

- ~~**세로 고정 레이아웃**: `.app` 컨테이너 최대 폭 420px, 중앙 정렬, 데스크톱에서는 폰 프레임처럼 보이게. 모바일에서는 전폭.~~ → **가로 고정 스테이지** (v0.3.2, §14.1): 모든 화면을 논리 1280×720 판에 그리고 창에 맞춰 한 배율로 확대·축소. 세로 화면 없음. 시스템 폰트. 아트 없음: 색 원(portraitColor) + 이름 첫 글자.
- **화면**: `start`(새 런 / 이어하기 / 등록 팀 목록 / seed 입력) → `setup`(포메이션, 슬롯 탭 → 캐릭터 목록에 그 슬롯 적성 표시, GK A/B 제한 경고, 서포트 6장 선택, 전술 3항목, 공명 표시, "기본 편성으로 시작" 버튼) → `training`(v0.1: GDD 목업 상단 바, 체력 스트립, 5칸 리스트, 행동 바 — v0.3.2 가로 배치는 §14.4) → `event` 모달 → `match` → `relic` 모달 → `route` → `result`(평가, 선수별 스탯, "팀 등록", "다시 하기", seed 표시).
- **훈련 칸** (v0.1 은 행, v0.3.2 는 세로 카드 5열 — §14.4): 칸 이름, 선수 아이콘들(체력 낮으면 어둡게, 부상자 표시 없음), 서포트 아이콘(★ 우정 가능, 💡 힌트 가능), 총 상승치, 최대 실패율, 추천 표시. 탭 → 하단 시트에 선수별 상세 + [훈련하기]. 호출권 버튼(선수 선택 → 칸 선택).
- **경기 화면** (v0.2부터 §12, v0.3.2부터 §14.3 이 기준, 아래는 v0.1 기록): 세로 필드(상대 GK/DF/MF/FW 위, 우리 FW/MF/DF/GK 아래), 공 소유자·듀얼 상대 강조, 스코어·포제션, 텐션 바 2개, 의도 표시(아이콘+텍스트), 액션 버튼 3개(비활성 처리), 스킬 버튼, 로그(최근 6개). **자동 토글**(기본 ON, 배속 1x/2x/4x), **개입 버튼**(자동 중 누르면 다음 결정에서 멈춤). 자동 진행은 `setInterval`로 `step()`; 결정 필요 & 수동이면 대기. 컷인 이벤트는 1초 배너.
- **저장**: 매 엔진 호출 후 `localStorage["soccer.run"] = JSON.stringify(state)`; `localStorage["soccer.match"]`도 별도. 등록 팀은 `localStorage["soccer.teams"]` 배열. 모든 localStorage 접근은 try/catch.
- **UI는 엔진을 계약대로만 호출**하고 상태를 직접 계산하지 않는다(표시용 정렬·포맷만).
- `js/ui/app.js`가 진입점. 화면별 파일 분리(`js/ui/screens/*.js`) 권장. 전역 상태는 `js/ui/store.js` 하나.
- 접근성 최소: 버튼은 `<button>`, 비활성은 `disabled`.

---

## 9. 테스트 & 시뮬 (test/, tools/)

- 실행: `npm test` = `node --test test/rng.test.mjs test/run.test.mjs test/match.test.mjs test/ui.smoke.test.mjs` (디렉터리/glob 인자는 Node 버전마다 달라 파일을 명시). 지금 목록은 `package.json` — §14.5. 공용 로더·자동 진행 드라이버는 `test/helpers.mjs`.
- `test/rng.test.mjs`: 같은 seed 동일 시퀀스, getState/fromState 복원.
- `test/run.test.mjs`: 기본 편성으로 createRun → 24턴을 항상 `train` (추천 칸) + 자동 경기로 완주. phase 전이 검증, 스탯 ≤ cap, 체력 0~100, JSON roundtrip 후 동일 진행(결정성), 모든 이벤트 효과 타입이 throw 없이 적용(전 이벤트 강제 실행), 모든 스킬 id 참조 유효, 유물/루트 modifier가 실제 수치에 반영.
- `test/match.test.mjs`: 결정성(같은 seed 2회 = 같은 결과), 포제션 수 준수, 승부차기 종료, 1-FW 포메이션에서 pass 규칙, 모든 active effect 발동 경로 1회 이상, 체력 0 이하 없음, NaN 없음.
- `test/ui.smoke.test.mjs`: index.html 참조 경로·상대 경로 검사 + (jsdom 이 있으면) app.js 부트 → start → 편성 → 기본 편성으로 런 시작 → 훈련 1회 클릭-스루. jsdom 은 devDependency (`npm i` 후 실행, 없으면 skip).
- `tools/sim.mjs`: `node tools/sim.mjs --runs 300 --seed 1 [--policy smart|train] [--json]` → 기본 편성·기본 전술로 자동 완주 (smart: 추천 칸 훈련, 휴식 추천 시 휴식, 살 수 있는 스킬은 미팅 구매, 이벤트 0번, 유물 첫 번째, 루트 순환). 출력: 시즌별 목표 경기 승률, 평균 최종 스탯, 평가 등급 분포, 런당 부상 수, 우정 훈련 발생 수, 평균 경기 골 수. 목표: 시즌1 승률 70~80%, 시즌2 50~60%, 시즌3 35~45%, 등급 중앙값 B, 런당 부상 0.5~1.5, 우정 훈련 ≥ 3.
  - v1.1 결과 (300런, seed 1): 승률 79.0 / 60.7 / 44.3%, 등급 B 263·C 36·A 1 (중앙값 B), 부상 1.43, 우정 훈련 4.1, 골 1.49/경기 (우리 0.84 / 상대 0.65), 승부차기 18%.
  - v1.2 결과 (부상 카운트 수정 후, config 변경 없음 — 300런): seed 1 승률 75.7 / 53.3 / 40.3%, seed 2 81.3 / 57.0 / 47.0%, 등급 중앙값 B, 부상 1.45, 유스 대체 슬롯 0.58/런 (v1.1 0.26 — 부상이 약속된 기간만큼 실제로 결장하게 되어 증가).

---

## 10. 구현 시 흔한 함정

- `placement`는 **턴 시작에 한 번** 만들고 그 턴 동안 고정. `summon`만 재계산.
- `getTurnView`는 상태를 바꾸지 않는다 (rng 소비 금지). 미리보기 수치는 결정적으로 계산(실패 판정은 확률만 표시).
- 부상 선수는 경기에 유스로 대체되되 원래 선수 객체의 스탯은 그대로.
- 경기 체력(`live.stamina`)과 훈련 체력(`player.stamina`)은 별개.
- 스킬 `positions` 제한은 **현재 슬롯 포지션** 기준.
- 이벤트 텍스트 치환은 `getEventView`에서만. 데이터에는 `{player}` 그대로.
- 모든 `data` 배열 조회는 id → 항목 Map을 함수 시작에 만들어 쓰거나 `find`; 없으면 명확한 에러 메시지로 throw.

---

## 11. 통합 노트 (v1.1)

4개 모듈(데이터 / 육성 엔진 / 경기 엔진 / UI)을 계약만 보고 만든 뒤 통합하면서 확정·추가된 사항. 기존 시그니처는 바꾸지 않았고 전부 **추가**다.

### 11.1 계약에 추가된 것 (구현이 기준)
- `RunState.queue: string[]` — 대기 phase 뒤의 후속 단계. 저장/복원은 JSON 그대로.
- `routes.json` 항목의 `guaranteedSeasonStartEvent: boolean` (온천만 true). `seasonStart` 이벤트는 기본적으로 `eventChancePerTurn` 확률로 발생하고, 온천 뒤에는 확정.
- `getTurnView().recommendedAction` ("train" | "rest"). `recommendedSlot` 은 기대값 휴리스틱(성공률×상승치 − 실패율×(스탯 손실+부상 기회비용) + 자율 훈련 + 우정 20 + 서포트 장당 6 + 소외 선수 가중). UI 의 "추천" 배지와 sim 정책이 이것을 쓴다.
- `getTurnView()` 추가 필드: `phase, turnsPerSeason, summon, formation, tactics, supports, hints, record, lastMatchResult`, `slots[].label`, `preview.eff/teamworkGain`, `shop[].kind/description/positions/canAfford`. `getMatchSetup()` 에 `reason, opponentId, rules{allowDraw, extraTime, penalties, isGoalMatch, possessions}`.
- `getEventView().support.bond`, `getEventView().eventId/trigger`.
- `getEffectiveStats(state, playerId, data?)` — data 가 있으면 `config.aptitudeMult` 사용.
- 스냅샷 `modifiers` 에 `dribbleStaminaRefund` 포함(7키). 유스 선수는 `id "youth_<slot>"`, `isYouth true`, 공명 계산에서 제외. 상대 스냅샷에 `id/role/season` 추가, `opponent.teamwork` 가 없으면 시즌별 25/50/75.
- 유물의 modifier 는 `chooseRelic` 시 `state.modifiers` 에 `untilSeason null, source "relic:<id>"` 로 복사된다 (`getModifier` 만으로 조회 가능).
- match: `createMatch({ …, humanSide = "home" })`, `step(state, data, decision, humanSide?)`, `getMatchView(state, data, humanSide = state.humanSide)`. `MatchState` 에 `stage("regular"|"extraTime"|"penalties"), humanSide, penalties, duel.effects{home,away}`. `getResult()` 에 `homeName, awayName, possessionsPlayed, stage, seed, provisional?`. `decision = { skillId }` 만 보내면 스킬만 발동하고 결정 대기 유지(reveal 흐름). events type: info, kickoff, counter, duel, turnover, save, goal, skill, cutin, extraTime, penalties, penalty, end.
- match 판정 세부: styleMult 는 유리한 쪽 ×styleAdv, 불리한 쪽 ×styleDis 를 각각 적용. 체력 소모 계수 (1 − physical/2000) 는 모든 액션·수비에 적용. 액티브 스킬은 듀얼당 팀 1개. 승부차기는 shoot×actionCoef.shoot vs GK defense×actionCoef.save.
- (v1.2) `getAttackActions(state, side, data?)` / `getDefenseActions(state, side, data?)`: `data` 를 주면 힌트 문구의 배율을 config 에서 계산한다 — 중거리 슛 "위력 ×(actionCoef.midrangeShoot / actionCoef.shoot)", 수비 "수읽기 ×readBonus". `getMatchView` 가 data 를 넘긴다. data 없이 부르면(ai.js) 숫자 없는 문구.
- (v1.2) 상대 AI 가 reveal 스킬을 커밋한 듀얼: `duel.revealToHome` 과 `getMatchView().intent` 는 `{ level: "none", candidates: [], countered: true }`. 사람 측이 `{ skillId }` 단독으로 reveal 을 쓴 경우에도 상대가 countered 면 full 공개로 바꾸지 않는다. UI 는 "상대가 우리 의도를 읽고 있음" 으로 표시하고, reveal 스킬 버튼은 토글 대신 `{ skillId }` 단독 결정을 즉시 보낸다.
- (v1.2) `finishMatch` 는 `matchResult.penalties` 가 있으면 `record.goalMatches[]` 항목에 `penalties {home, away}` 를 기록한다.
- ai: 의도 예측·수비 가중치 등 §7.8 에 없던 수치는 `js/engine/ai.js` 머리말 참고.

### 11.2 데이터 결정
- `sk_tide_wall`(SR GK 고유)은 passive `save 1.15` — "SR=active" 규칙의 승인된 예외.
- friend 카드(`sp_bard_lumi`)의 `specialtyRate` 는 무시되고 균등 배치된다.
- 우리 팀 원소 공명: v0.1 배포 후 미르카(ch_cat_trickster)를 바람으로 바꿔, 바람 3명(실루엔·울리카·미르카) 편성 시 공명 가능. 시즌3 상대 팀은 불 4 / 물 5.
- `ev_night_training` / `ev_secret_dribble` 의 부상 확률 0.5 → 0.3 (자동 진행 기준 런당 부상 0.5~1.5 목표).
- 상대 스탯: 초안 대비 시즌1 ×0.97, 시즌2 ×1.13, 시즌3 ×1.13 (10 단위 반올림). 자동 진행이 시즌2·3 에 컨디션 3.5~3.8·팀워크 66~94·유물 1~2개를 들고 가기 때문.

### 11.3 밸런스 튠 요약 (data/config.json)
| 키 | 초안 | v1.1 | 이유 |
|---|---|---|---|
| training.mainGain / subGain / freeTrainRatio | 14 / 5 / 0.2 | 56 / 20 / 0.35 | 초안은 24턴 후 avgStat 238→294 (D). 등급 중앙값 B 목표 |
| training.bondPerTraining | 7 | 12 | 우정 훈련 0.9회 → 4.1회/런 |
| match.actionCoef dribble/pass/shoot/midrangeShoot | 1.0/1.0/1.0/0.7 | 1.8/1.8/1.5/1.0 | 골 0.9 → 1.5/경기, 승부차기 31% → 18% |

### 11.4 검증
- `npm test`: 45 테스트 (rng 8, run 18, match 16, ui 2 + jsdom 클릭-스루) 전부 통과. v1.2 추가: 부상 카운트 타이밍(3 케이스), nextMatch.intentReveal modifier 반영, record.goalMatches.penalties, 힌트 배율 config 연동, 상대 reveal countered. 결정성(같은 seed·JSON roundtrip), 전 이벤트×전 선택지 강제 적용(효과 13종), 전 스킬 id 참조, 유물/루트 modifier 반영, 24턴 완주(실제 match.js), 승부차기, 2-3-1 패스 규칙, 액티브 8종 수동 발동, 전술 반영.
- `python -m http.server` 로 서빙 시 index.html · css · js · data 전부 200, 참조는 모두 `./` 상대 경로.

---

## 12. v0.2 — 경기 화면 위치 표현 (GDD v0.4 §9)

> 원칙: **화면 위치 = 규칙 위치.** 판정 공식·수치는 바꾸지 않는다. 바뀌는 규칙은 §12.1-4 (패스 수신자 결정적) 하나.
> 배경: v0.1 화면은 편성 위치를 고정으로 그려서, 상대가 우리 박스에서 슛 직전(lineIndex 3)인데 상대 FW 토큰이 하프라인 위(상대 진영)에 그려졌다. 또 경기 화면이 390×844 폰에서 세로 2000px 이상이라 스크롤해야 버튼이 보였다.

### 12.1 엔진 (js/engine/match.js) — 추가만, 기존 필드 유지

1. **구역 헬퍼 (export)**
   ```js
   export const ZONE_NAMES = { 1: "우리 박스", 2: "우리 진영", 3: "중원", 4: "상대 진영", 5: "상대 박스" }; // home 시점
   export function zoneOf(attackingSide, lineIndex) // home: lineIndex + 2 (0→2 … 3→5), away: 4 − lineIndex (0→4 … 3→1)
   ```
   구역은 항상 **home 시점**으로 고정 (Z1 = home 골 앞). humanSide 가 away 인 경우는 프로토타입 범위 밖.
2. **getMatchView 추가 필드**
   ```js
   zone,            // 1..5 — 현재 공 구역. 승부차기면 슛하는 팀이 노리는 박스 (home 키커 → 5, away 키커 → 1). 경기 종료 후 마지막 값 유지
   attackStep,      // 0..3 = lineIndex (① 빌드업 … ④ 슈팅)
   attackDir,       // "up" (home 공격) | "down" (away 공격)
   remaining,       // { lines: ["MF","DF"], gk: true, text: "남은 수비: MF 2 + DF 2 + GK" } — 공과 목표 골 사이에 남은(뚫리지 않은) 수비. POS_BY_LINE.slice(lineIndex) 기준, 인원수 포함
   receiverPreview, // null | { id, name, side, step, zone } — 지금 패스가 성공하면 받을 선수와 도착 단계·구역. pass 가 불가능하면 null. 실제 판정과 반드시 동일 (§12.1-4)
   outcomes,        // null | { [action]: { success: Outcome, fail: Outcome } } — 사람 측이 고를 수 있는 액션(actions[] 의 action)마다
                    // Outcome = { zone, attackingSide, goal?: true, label }
                    //   공격 역할 예: dribble.success = { zone: 다음 단계 구역, attackingSide: 우리, label: "상대 박스 진입 — 슈팅 찬스" }
                    //                 *.fail = { zone: 역습 시작 구역(§7.5 규칙 그대로), attackingSide: 상대, label: "상대 역습 — 우리 진영부터" }
                    //                 shoot.success = { zone, goal: true, label: "골!" }, shoot.fail(세이브/블록) = { zone: 상대 빌드업 구역, label: "세이브 → 상대 골킥" }
                    //   수비 역할 예: tackle.success(= 막음) = { zone: 우리 역습 시작 구역, attackingSide: 우리, label: "막으면 — 우리 역습, 중원부터" }
                    //                 tackle.fail(= 뚫림) = { zone: 상대 다음 단계 구역, attackingSide: 상대, label: "뚫리면 — 상대 슈팅" }
                    //   이번 결정과 함께 고를 스킬(extraLine, steal)은 반영하지 않는다(기본 규칙 기준, 이미 커밋된 효과는 반영). needsDecision 이 아니면 null
   outcomesBySkill,        // (수정 라운드) null | { [skillId]: outcomes } — 결정 대기 중 사람 측이 쓸 수 있는(enabled) 위치 스킬
                           //   (공격 extraLine / 수비 steal)을 액션과 함께 쓸 때의 outcomes. 키 = 기본 outcomes 와 같다
   receiverPreviewBySkill, // (수정 라운드) null | { [skillId]: receiverPreview|null } — 공격 extraLine 스킬을 쓸 때의 수신자
                           //   (line 0 + 라인 브레이커 + 패스 → MF 가 아니라 FW, 상대 진영). UI 는 스킬을 토글하면 이 값으로 그린다
   lastBeat,        // null | 가장 최근의 "비트 이벤트" (아래 3번) 사본. UI 연출 트리거
   ```
3. **이벤트에 위치 필드** — type 이 `kickoff | counter | duel | turnover | save | goal | penalty` 인 이벤트에 추가:
   `seq` (이벤트 배열 인덱스, 단조 증가), `zone` (일어난 구역), `toZone` (결과 후 공 구역), `step`, `toStep`, `attackingSide` (그 이벤트 시점 공격 팀).
   duel/turnover/save/goal 에는 기존 `playerId, defenderId, receiverId?, action, defAction, success` 가 이미 있다. kickoff/counter 에는 `playerId`(시작 선수) 추가.
   `view.lastBeat` = 위 타입 중 마지막 이벤트.
4. **규칙 변경 (유일)**: `pickReceiver` 는 난수를 쓰지 않는다. 동률이면 `team.players` 배열 순서(슬롯 순서)의 첫 선수. `receiverPreview` 는 같은 함수를 쓴다.
   → 동률일 때만 rng 소비가 줄어든다. 판정 공식·수치는 그대로. sim 수치는 v1.2(300런 seed 1: 75.7 / 53.3 / 40.3%)와 같거나 노이즈 범위(±3pp)여야 한다.

### 12.2 레이아웃 (js/ui/layout.js — 신규, 순수 함수, DOM 금지, Node 에서 테스트)

> 아래 좌표는 **필드 좌표**다 (x = 폭 방향, y = 길이 방향, y 0 = home 골). 문구의 "세로·가로·아래·위"는 당시 세로 화면 기준. v0.3.2 부터 화면은 가로 전용이고 픽셀 변환은 `fieldToScreen(x, y, W, H, 'land')` 하나 — home 골 왼쪽, 필드 x 0 = 위 (§14.3). computeLayout 규칙·좌표는 그대로다.

```js
export const ZONES = [ { id: 1, from: 0, to: 16, name: "우리 박스" }, { id: 2, from: 16, to: 40, name: "우리 진영" },
                       { id: 3, from: 40, to: 60, name: "중원" }, { id: 4, from: 60, to: 84, name: "상대 진영" }, { id: 5, from: 84, to: 100, name: "상대 박스" } ];
export const SHAPE = {            // 공격 방향 기준 세로 % (0 = 공격 팀 골, 100 = 상대 골) — GDD v0.4 §9.3 표
  ball: [28, 50, 72, 90],
  atk: { GK: [4, 6, 8, 10], DF: [26, 34, 44, 50], MF: [46, 52, 62, 70], FW: [60, 68, 78, 86] },
  def: { FW: [32, 42, 58, 68], MF: [52, 54, 64, 78], DF: [70, 72, 76, 86], GK: [96, 96, 96, 97] },
};
export const RECEIVER_INSET = 2;   // (수정 라운드) 패스 후보: 도착 구역 시작 + 2
export function resolvePreview(view, { skillId = null, deciding = true } = {})
// (수정 라운드) 화면에 그릴 receiverPreview · outcomes 를 고른 view 사본 (view 불변, 바꿀 것이 없으면 view 그대로).
//  deciding=true (사람이 고르는 중): skillId 가 receiverPreviewBySkill / outcomesBySkill 에 있으면 그 변형.
//  deciding=false (자동 진행 중): 사람 측 공격이고 스킬 변형 중 수신자가 기본과 다른 것이 있으면 receiverPreview = null
//   (사람 측 AI 가 step() 안에서 라인 브레이커를 쓸 수 있어 확정할 수 없다). 상대 공격은 AI 가 먼저 커밋해 정확 → 그대로.
export function computeLayout(view, opts = {})
// view = match.getMatchView(...) 반환값. opts: { aspect = 0.8 (필드 폭/높이), tokenSize = 0.075 (필드 폭 대비 지름) }
// → {
//   ball: { x, y },                                     // % (x: 0 왼쪽 … 100 오른쪽, y: 0 = home 골(아래) … 100 = away 골(위))
//   tokens: [ { side, id, name, slot, position, x, y, role, staminaRatio, portraitColor, isYouth } ],
//      role: "carrier" | "defender" | "cover" | "receiver" | "broken" | "support" | "gk"
//   zone,                                               // view.zone
//   highlight: { zone, level: "danger" | "crisis" | "chance" | "shotChance" | null, label },   // GDD §9.5 표
//   track: { side: attackingSide, step: 0..3, dir: "up" | "down" },
//   remainingText,                                      // view.remaining.text
//   banner: null | string,                              // 구역이 바뀌는 비트에서 UI 가 띄울 한 줄 (예: "⚠ 슈팅 위기 — 카샤가 우리 박스 진입, 네리아와 1:1")
// }
```
규칙 (GDD §9.3):
- 세로: `SHAPE` 표. away 공격이면 `y = 100 − y`. 공 가진 선수는 공 좌표. 듀얼 수비수는 그 라인의 `def` 좌표, 같은 라인 나머지는 `cover`.
- 수비 팀에서 `POS_BY_LINE` 인덱스 < attackStep 인 라인 = `broken` (공 뒤). 공격 팀에서 다음 단계 수신 후보 = `receiver` (view.receiverPreview 의 선수만). 공격 팀 나머지 필드 선수 = `support`, 양 팀 GK(듀얼 중이 아닐 때) = `gk`.
- 가로: 라인 인원 1 → [50], 2 → [30, 70], 3 → [20, 50, 80] (slot 순서). 공 가진 선수 x = 자기 라인 x. 듀얼 수비수 x = carrier x.
- **겹침 방지**: 모든 토큰 쌍의 거리 ≥ tokenSize (필드 폭 기준, 세로는 aspect 로 환산). 가까우면 가로로 밀어낸다(세로 좌표는 유지 → 규칙 위치 보존). 결과 x 는 [6, 94] 로 clamp. 단 carrier–defender 쌍은 마주보는 연출이라 세로 간격을 우선 확보한다(세로 최소 간격 = tokenSize 환산값, 수비수를 자기 골 쪽으로 민다 — 여전히 공과 자기 골 사이).
- 포제션 사이(`phase` 가 possessionEnd, 또는 duel 없음): view.attackStep/attackingSide 기준으로 같은 규칙.
- (수정 라운드) **패스 후보**: `fy = max(SHAPE.atk[pos][step], ZONES[도착 구역].from + RECEIVER_INSET)` — 도착 단계 = `receiverPreview.step` (없으면 step+1). ③ 단계 FW 후보 78 → 86 (상대 박스). SHAPE 표는 그대로.
- (수정 라운드) **경기 종료 view** (`finished`, 승부차기 아님): 엔진은 종료 시 다음 포제션을 시작하지 않아 view.carrier / attackingSide 가 판정 전(공을 잃은 쪽)이다 → `lastBeat` 로 판정 뒤 모습을 그린다.
  turnover = 뺏은 수비수(`defenderId`)가 carrier, 공을 얻은 팀(`toAttackingSide`)의 `toStep` 모양 · zone = `toZone`.
  save = GK 가 carrier, 공은 GK 자리(자기 골문 앞, zone = 슛한 박스), GK 팀의 `toStep` 모양.
  goal = carrier 없음, 공은 골문 안(공격 방향 99.5, x 58), 상대 GK 는 반대로 다이브(x 38), 득점자는 슛한 자리(support).
  defender/receiver 없음, highlight 없음, banner "경기 종료", remainingText "" (남은 수비 문구 없음), zone = 공 구역. lastBeat 가 없으면 마지막 상태 그대로.
  위치 필드가 없는 옛 저장 이벤트는 §7.5 로 대신 (turnover line 0/1/2 → 역습 2/1/0, save → 0).
- (수정 라운드) **좁고 높은 필드** (aspect ≳ 1.05): 듀얼 수비수를 `ball + minDy` 로 밀다 97(골문)을 넘으면 먼저 공(= carrier)을 자기 골 쪽으로 당긴다 — 하한 = max(공 구역 시작, 뚫린 수비 라인 좌표) + 0.5, 그래도 모자라면 수비수를 99.5 까지. 기본 범위(aspect ≤ 1)에서는 공 = SHAPE.ball 그대로.
- (수정 라운드) 가로로 놓을 자리가 없으면(`findFreeX` null) 규칙 방향으로만 세로를 1.5%씩(최대 8회) 민다 — 뚫린 라인·공격 팀 support/GK 는 자기 골 쪽, 남은 수비·패스 후보는 공격 방향 골 쪽 → 공 앞/뒤 관계 유지. 그래도 없으면 겹침 허용.
- 승부차기(`phase === "penalties"`): 공 = 노리는 박스의 페널티 스폿(y 10 또는 90, x 50), 키커 = 공 옆, 상대 GK = 골문, 나머지 12명 = 박스 밖 반원(y 30±6 또는 70±6)에 `support`. (수정 라운드) 반원에 겹치지 않는 자리가 모자라면(좁고 높은 필드) 같은 띠 안 두 줄 지그재그(64 / 76).
- 결정적: 같은 view → 같은 결과. 난수 금지.

### 12.3 UI (js/ui/screens/match.js 재작성 + css/style.css 경기 부분)

> v0.3.2 에서 화면 배치는 가로 HUD 로 대체됐다 (§14.3, `css/style.css` → `css/match.css`). 아래 중 390×844 · 세로 필드 · 필드 왼쪽 트랙 · 로그 4줄 · 필드 위 배너 줄은 옛 세로 화면 기록이다. 비트 연출·토큰·위기 표시·미리보기·자동/개입 규칙은 그대로 유지한다.

- **한 화면**: 390×844 에서 결정 대기 상태로 페이지 세로 스크롤이 생기지 않는다 (로그는 내부 스크롤 가능, 최근 4줄). 필드는 화면 세로의 55~60%.
- **필드**: 세로 5구역 밴드(구역 이름 작게), 하프라인, 양 골문·박스. 토큰은 절대 좌표 `transform: translate(...)` + `transition` (재배치 애니메이션). 공은 별도 요소.
- **토큰**: 지름 ≈ 필드 폭 7.5%. home = 원형 + 파랑 링(#4da3ff), away = 둥근 사각 + 빨강 링(#ff5d5d) (색 + 모양 이중 구분). 안쪽 portraitColor + 이름 첫 글자. 아래 체력 바(≤20% 빨강). 이름 라벨은 carrier / defender / receiver 만. broken = opacity 0.45. 유스 = 작은 "유". 탭 → 미니 카드(이름·포지션·스타일·원소·스탯 5·체력·스킬).
- **비트 연출** (GDD §9.4): step() 결과로 새 `lastBeat.seq` 가 생기면 ① 액션 연출(공 이동: 드리블=carrier 와 함께, 패스=receiver 로, 슛=골문으로, 실패=defender 로) → ② computeLayout 새 좌표로 전원 재배치 → ③ 결과 한 줄. (수정 라운드) 1x = 액션 0.8s + 재배치 0.65s + 결과 0.95s ≈ 2.4s (턴오버·세이브 +0.25s, 골 +0.9s, 컷인 +0.9s) — 1.2s 로는 자동 1x 목표 경기 중앙 23초로 GDD 40~60초에 못 미쳤다. 새 값: 목표 경기(8포제션) 중앙 약 42초, 친선(6) 약 31초. 2x·4x 비례. `prefers-reduced-motion` 이면 트랜지션 최소화. 연출 중에는 다음 step 을 호출하지 않는다(비트 큐). setInterval 대신 비트 완료 후 다음 step 을 예약하는 루프.
- (수정 라운드) 결과 한 줄(pill): 다음 비트가 시작되면(animateBeat) 걷는다. 수명 = max(0.9s, (결과 + 액션) × 배속 계수), CSS 페이드 길이(`--t-pop`)도 같은 값. 자리는 공 옆 좌/우·위/아래 → 필드 가운데 띠 중 토큰(가중치: 듀얼 당사자·패스 후보 2, 보통 1, 뚫린 선수 0.35)을 덜 가리는 곳.
- (수정 라운드) 이름 라벨 · 의도 말풍선 · 미리보기 글자(도착 구역 · 차단 액션 이름)는 후보 자리(라벨: 선호 위/아래 × 가운데/좌/우 → 반대편 → 옆, 말풍선: 위 좌우 → 옆 → 아래) 중 이웃 토큰·공·이미 놓은 글자와 겹치지 않는 첫 자리. 미리보기 글자는 토큰 위 층(`svg.pitch-svg.top`).
- (수정 라운드) 비트 연출 중 컨트롤(자동·배속·개입) 클릭은 컨트롤과 정보 줄만 다시 그린다 (스코어·로그는 연출 단계가 갱신). 연출 중 resize 는 미뤘다가 비트가 끝날 때 새 크기로 다시 배치. 비트가 끝날 때(finishBeat) 항상 현재 view 로 다시 배치(자동/개입 전환·resize 반영).
- (수정 라운드) 자동 토글은 켜든 끄든 개입(intervene)을 해제한다. 개입 버튼 강조·문구는 자동 ON 이고 개입 중일 때만.
- **위기·찬스**: `highlight` 구역 색 (danger 주황 / crisis 빨강 점멸 / chance 금색 / shotChance 금색 점멸), 필드 위 상황 배너(`banner`, 구역이 바뀔 때만 갱신), 필드 왼쪽 공격 진행 트랙 4칸, 남은 수비 텍스트.
- **결정 대기(수동)** 에서만: 액션 버튼마다 `outcomes` 두 줄(성공/실패 label). (수정 라운드) 위치 스킬(라인 브레이커·소매치기)을 토글하면 `resolvePreview(view, { skillId, deciding: true })` 의 변형으로 버튼 문구·화살표·패스 후보 토큰을 바꾼다. 자동 진행 중에는 `resolvePreview(view, { deciding: false })` 로 확정할 수 없는 패스 후보를 그리지 않는다. 버튼 누르고 있기(pointerdown) / hover → 필드 위 SVG 화살표(드리블 = 다음 구역으로, 패스 = receiverPreview 토큰으로 점선, 슛 = 골문으로, 수비 액션 = 상대 carrier 앞 차단 표시). 자동 진행 중에는 미리보기·화살표를 그리지 않는다.
- **의도 표시**: 상대 듀얼 토큰 위 말풍선(아이콘) + 정보 줄 텍스트(기존 문구 유지: 확정 / 2지선다 / 비공개 / countered).
- **유지할 기존 기능**: 자동 토글(기본 ON), 배속 1x/2x/4x, 개입(다음 결정 비트에서 재배치까지 보여준 뒤 멈춤), 결과 스킵, 스킬 버튼(reveal 은 `{skillId}` 단독 즉시 전송), 컷인 배너, 연장·승부차기 표시, 결과 모달, `finishMatch` 정확히 1회, localStorage 저장/이어하기.

### 12.4 테스트 · 도구

- `test/layout.test.mjs` (신규, npm test 에 추가):
  - 4 포메이션 × 공격 팀 2 × 단계 4: 공 y 가 `zoneOf` 구역 안.
  - **회귀 (v0.1 버그)**: away 공격 ④ 슈팅 단계에서 home 필드 선수 6명 전원 y > 공 y (공 뒤), home GK y < 공 y. 일반화: 모든 단계에서 수비 팀의 뚫린 라인은 공 뒤, 남은 라인은 공과 골 사이.
  - carrier 토큰 = 공 좌표, receiver 역할 = view.receiverPreview.
  - 모든 토큰 쌍 겹침 없음 (§12.2 기준), 좌표 범위 [0, 100].
  - 실제 경기(여러 seed, step 반복)에서 매 view 마다 위 불변식 검사.
  - 승부차기 레이아웃.
- (수정 라운드) `test/layout.test.mjs` 추가: 경기 종료 모습(합성 3종 + 실제 300경기), 패스 후보 = 도착 구역(양 팀·extraLine), resolvePreview, 자동 진행 중 그린 패스 후보 = 실제 수신자(라인 브레이커 편성), UI 실제 범위(aspect 0.74~1.3 · tokenSize 0.0866~0.09, 합성·실제·승부차기) 겹침 없음·규칙 위치. `test/match.test.mjs`: 스킬 변형 미리보기 = 실제(1-3-2 울리카 DF1 + 소매치기). `test/ui.smoke.test.mjs`: 연출 중 배속 클릭 시 스코어·로그 그대로, 자동 OFF → 개입 해제, 종료 모습의 carrier.
- `test/match.test.mjs` 추가: zoneOf 표, 많은 seed 에서 **패스 성공 시 실제 수신자 = 직전 view.receiverPreview**, **판정 후 공 구역 = 직전 view.outcomes[선택 액션].success/fail.zone** (사람 측 결정을 넣어 진행; 스킬 미사용), 이벤트 seq 단조 증가·zone 필드 존재, getMatchView 가 상태를 바꾸지 않음(JSON 동일).
- `tools/shot.mjs` (신규): puppeteer-core(devDependency, 설치됨) + 로컬 Chrome(`C:/Program Files/Google/Chrome/Application/chrome.exe`) 또는 Edge, `CHROME_PATH` 로 덮어쓰기; 없으면 안내 후 exit 0. 내장 정적 서버로 앱을 띄우고, Node 에서 엔진으로 만든 run/match 상태를 localStorage(`soccer.run`, `soccer.match`)에 주입한 뒤 시작 화면의 "이어하기" 버튼으로 진입 (app.js `continueRun` 은 run.phase === "match" 이고 match.seed === run.pendingMatch.seed 일 때 저장된 경기를 복원한다 → 주입 시 pendingMatch.seed 를 맞출 것). 시나리오별 PNG (390×844, deviceScaleFactor 2 — v0.3.2 부터 기본 1280×720 DPR 1, §14.6): 우리 빌드업 / 우리 파이널 서드 수동 결정(자동 끄고 미리보기 + 액션 버튼 hover 화살표) / **상대 ④ 슈팅(회귀)** / 상대 ③ 위험 / 승부차기 / 패스 비트 연출 중간 프레임 / 데스크톱 1280×900. 각 시나리오의 페이지 scrollHeight 와 콘솔 에러를 출력. 사용: `node tools/shot.mjs <outDir>`. (도구 스크립트는 반드시 프로젝트 안에 둬야 puppeteer-core 가 resolve 된다.)

---

## 13. v0.3 — 듀얼 개편 · 연계 · 간파 · 필살기 · 액티브 (GDD v0.5 §9.6, 9.8~9.11, 9.17, 9.18)

> 기획 근거는 docs/GDD_v0.5.md. 이 절이 구현 기준이며, GDD와 충돌하면 이 절이 우선한다. 수치는 모두 config 로 빼서 튜닝 가능하게 한다.
> 기존 §7·§11·§12 계약 중 여기서 바꾸지 않은 것은 유지한다. 바뀐 것은 **대체**다(추가만이 아님). 판정식·AI·데이터 스키마가 바뀐다.

### 13.0 이번 라운드 소유권

| 담당 | 파일 |
|---|---|
| 경기 엔진 | js/engine/match.js, js/engine/ai.js, js/engine/skills.js, test/match.test.mjs, test/v05.test.mjs (신규) |
| 데이터·런 | data/*.json (config·characters·skills·opponents·relics·events·traits(신규)·combos(신규)), js/engine/run.js, js/engine/effects.js, js/engine/training.js(필요 시), test/run.test.mjs |
| 화면 | js/ui/screens/match.js, js/ui/layout.js, js/ui/screens/setup.js·training.js(표시 추가만), js/ui/labels.js, js/ui/dom.js, css/style.css, test/layout.test.mjs, test/ui.smoke.test.mjs |
| 도구·밸런스 | tools/sim.mjs, tools/choice.mjs(신규), tools/shot.mjs·scenarios.mjs |

### 13.1 데이터

**characters.json** — 각 캐릭터에 `"trait": "<traitId>"` 추가:
실루엔 killpass, 울리카 crosser, 그레타 targetman, 타리아 runner, 미르카 carrier, 도르비나 wall, 네리아 distributor, 아델린 captain.

**traits.json** (신규, 배열) — `{ id, name, description, kind: "bonus"|"condition"|"position"|"mult"|"team", params }`:

| id | 이름 | params | 증폭(teamworkAmp) |
|---|---|---|---|
| killpass | 킬패스 | `{ nextDuelBonus: 0.20 }` — 이 선수가 패스·크로스 성공 → 받은 선수의 첫 듀얼(중거리 슛 제외) | O |
| finisher | 피니셔 | `{ receivedShotBonus: 0.15 }` — 받은 직후 박스 슛·헤더 | O |
| crosser | 크로서 | `{ canCross: true, crossBonus: 0.10 }` | X |
| targetman | 타깃맨 | `{ headerBonus: 0.25 }` | O |
| runner | 침투 | `{ receivedDribbleBonus: 0.15 }` — 받은 직후 드리블 | O |
| carrier | 볼 운반 | `{ dribbleStaminaMult: 0.7, buildupDribbleBonus: 0.10 }` (line 0 드리블) | 보너스만 O |
| wall | 철벽 | `{ holdMult: 1.15 }` | X |
| distributor | 빠른 배급 | `{ saveCounterLine: 1 }` — 이 GK가 세이브하면 역습 line 1 | X |
| captain | 주장 | `{ teamworkPlus: 10 }` — 증폭 단계 계산용 팀워크 가산 | X |

**combos.json** (신규) — `[{ "a": "sk_wind_thread", "b": "sk_meteor_shot", "name": "바람의 유성" }]` (a = 필살 패스, b = 받은 선수의 필살기).

**skills.json** — 액티브·고유 재정의 (패시브 유지). `unique` = 필살기이고 `tension: 0`, `ultimate` 객체를 가진다 (`active` 없음). 일반 액티브의 `active.effect` 어휘를 아래로 **교체**:

| effect | params | 의미 |
|---|---|---|
| `boost` | `{ attack?, defense?, actions?, noMissPenalty?, noFailPenalty?, noStamina? }` | 이번 듀얼 배율. noMissPenalty = 빗나감 ×0.8 무시, noFailPenalty = 뚫려도 제쳐짐·+10% 없음, noStamina = 성공 시 체력 소모 0 |
| `extraLine` | — | 성공 시 한 구역 추가 전진 (박스 도착이면 원터치) |
| `powerShot` | `{ shoot, midrangeCoef?, stamina? }` | 슛 배율, 중거리 계수 덮어쓰기 |
| `readBoost` | `{ readMult: 2.0 }` | 수비 간파 (13.2-8) |
| `negateRead` | `{ actions?, nextDuelBonus? }` | 공격 간파·스루 패스: 이번 듀얼 상대 짝 맞힘 ×1.0 |
| `steal` | `{ plus: 1, tension: 10, cappedNextBonus: 0.15 }` | 막으면 역습 +1, 텐션 +10, 이미 상한이면 역습 첫 듀얼 +15% |
| `rally` | `{ stamina: 30, clearBeaten: true, teamMult: 1.1 }` | 전원 체력 +30, 제쳐짐 해제, 이번 포제션 팀 판정 ×1.1 |

스킬별 값 (GDD 9.18):

| id | 이름 | kind | 텐션 | positions | effect / params |
|---|---|---|---|---|---|
| sk_iron_tackle | 철의 태클 | active (도르비나 고유) | 30 | null | boost `{defense:1.4, noMissPenalty:true}` phase defense |
| sk_line_breaker | 라인 브레이커 | active (울리카 고유) | 35 | null | extraLine, phase attack |
| sk_power_shot | 파워 슛 | active 학습 | 30 | FW | powerShot `{shoot:1.5, midrangeCoef:1.0, stamina:8}` |
| sk_eagle_eye | 매의 눈 | active 학습 | 40 | DF,MF | readBoost `{readMult:2.0}` phase defense |
| sk_see_through | 꿰뚫어보기 (신규) | active 학습, cost 140 | 40 | FW,MF | negateRead `{}` phase attack |
| sk_pickpocket | 소매치기 | active 학습 | 25 | MF | steal `{plus:1, tension:10, cappedNextBonus:0.15}` phase defense |
| sk_rally_cry | 함성 | active 학습 | 35 | null | rally `{stamina:30, clearBeaten:true, teamMult:1.1}` phase any |
| sk_stone_shield | 바위 방벽 | active 학습 | 35 | DF | boost `{defense:1.4, noFailPenalty:true}` phase defense |
| sk_burst_dribble | 폭발 드리블 | active 학습 | 30 | FW,MF | boost `{attack:1.5, actions:["dribble"], noStamina:true}` phase attack |
| sk_through_pass | 스루 패스 | active 학습 | 25 | MF | negateRead `{actions:["pass","cross"], nextDuelBonus:0.25}` phase attack |
| sk_wind_thread | 바람의 실 | unique (실루엔) | 0 | null | ultimate `{ type:"pass", attack:1.5, negateRead:true, nextDuelBonus:0.5, receiverGauge:50 }` |
| sk_meteor_shot | 메테오 슛 | unique (그레타) | 0 | null | ultimate `{ type:"shot", shoot:2.0, gkMult:0.7, boxShot:true, stamina:10 }` |
| sk_boss_strike | 업화의 일격 (신규) | unique (상대 전용) | 0 | FW | ultimate type shot (메테오와 같은 값) |
| sk_boss_save | 불꽃 장벽 (신규) | unique (상대 전용) | 0 | GK | ultimate `{ type:"save", saveMult:2.0 }` |

서포트 힌트: sk_see_through 를 서포트 1~2장의 hintSkillIds 에 추가.

**opponents.json** — `tactics.defense: "readIntent"` → `"balanced"`. `intentReveal` 필드 삭제. 선수에 `trait` 를 팀마다 2~4명 (시즌이 오를수록 많이). 시즌 3 보스(엠버스론) 에이스 FW `skillIds` 에 sk_boss_strike, GK 에 sk_boss_save.

**relics.json / events.json** — 간파 사용권:
- rl_coach_notebook: `modifiers: { gaanpaTicket: 1, gaanpaCostHalf: 1 }` (경기마다 사용권 1, 간파 스킬 비용 −50%)
- ev_prematch_s2 정찰 선택지: `modifier gaanpaTicket 1, duration "season"` (그 시즌 목표 경기)
- ev_treaty_inspector: `modifier gaanpaTicket 1, duration "season"`
- 그 외 `intentReveal` modifier 를 쓰던 효과는 제거 또는 위 키로 교체.

**config.json `match`** — 추가/변경 (모두 튜닝값):
```jsonc
"actionCoef": { "dribble": 2.2, "pass": 2.2, "cross": 2.2, "shoot": 1.5, "midrangeShoot": 0.6, "header": 1.5, "save": 1.0 },
"readBonus": 1.5, "missMult": 0.8, "holdMult": 1.0, "holdVsMidrange": 1.5,
"beatenBonus": 0.25, "interceptFailBonus": 0.10, "oneTouchGk": 0.85, "bonusCap": 0.60, "passChainBonus": 0.10,
"counterCap": 2, "counterCapTension": 10,
"tendency": { "tacticBonus": 1.15, "lowStaminaDribble": 0.7, "lowStaminaPass": 1.2,
              "tieAttack": ["dribble", "pass", "cross", "shoot"], "tieDefense": ["hold", "tackle", "intercept"] },
"ultimate": { "gaugeStart": 30, "gaugeMax": 100, "onDuelWin": 20, "onReceive": 15, "onGoal": 30, "onUltPassReceive": 50, "comboBonus": 1.2 },
"teamworkAmp": { "thresholds": [60, 80, 100], "mult": [1.1, 1.2, 1.3] }
// 삭제: aiRevealForOpponent
```
`config.defaultTactics.defense` 선택지: `tackle | balanced | intercept | hold`.

### 13.2 경기 엔진 규칙

1. **액션 id**: 공격 `dribble | pass | cross | shoot`, 수비 `tackle | intercept | hold` (v0.4 `block` → `hold` 로 **이름 변경**), GK `save`. `COUNTER` = { dribble: tackle, pass: intercept, cross: intercept, shoot: hold }. (v0.4.2: **`cross: hold`** — §15.1)
2. **가능 액션**: line 0·1 = dribble, pass(수신 후보 ≥ 1). line 2 = dribble, pass(같은 라인 다른 FW ≥ 1), cross(carrier trait crosser 이고 크로스 후보 ≥ 1), shoot(중거리). line 3 = shoot (v0.4.2: + 박스 연결 pass·cross, 포제션당 1회 — §15.2). 수비 line 0~2 = tackle, intercept, hold 전부. line 3 = save (자동).
3. **판정 스탯**: tackle = (수비+피지컬)/2, intercept = (수비+패스)/2, hold = 수비 × holdMult (wall ×1.15, 드워프 종족 +10% 는 기존 종족 패시브 규칙대로), cross = (패스+드리블)/2 × actionCoef.cross, 헤더 슛 = (슈팅+피지컬)/2 × actionCoef.header, 중거리 = 슈팅 × midrangeShoot.
4. **수비 배율**: 짝 맞음 ×readBonus (readBoost 스킬이면 ×readMult), tackle·intercept 가 짝이 아니면 ×missMult (noMissPenalty 무시), hold ×1.0 (단 공격이 중거리 슛이면 ×holdVsMidrange, v0.4.2: 크로스면 ×holdVsCross — §15.1). 공격이 negateRead 면 "짝 맞음"을 ×1.0 으로.
5. **공격 보너스 합**: Σ = 연계 특성(증폭 적용) + passChainBonus × chain + 제쳐짐 beatenBonus + 인터셉트 뚫림 interceptFailBonus + 스킬 nextDuelBonus(스루 패스·필살 패스) + 소매치기 cappedNextBonus. `att × (1 + min(Σ, bonusCap))`. 곱연산으로 따로: 스킬 boost·powerShot·필살기 배율, 합체기 comboBonus, extraLine 슛 +20%, 스타일·컨디션·체력·적성, 함성 teamMult.
6. **뚫림 결과**: 수비가 tackle 로 졌으면 `ball.pending.beaten = true` → 다음 듀얼 공격 보너스 +beatenBonus, 그 듀얼 coverCount 0 (다음이 GK 면 보너스만). intercept 로 졌으면 +interceptFailBonus. hold 는 없음. noFailPenalty 스킬이면 없음. 함성 clearBeaten 이면 해제. 한 번 쓰고 지운다.
7. **역습 시작**: 기본 (line 0 → 2, 1 → 1, 2 → 0, GK 세이브·골 → 0) + intercept 성공 +1 + steal +1, 상한 counterCap(2). intercept 의 +1 이 상한에 걸려 무의미하면 막은 팀 텐션 +counterCapTension. steal 이 상한에 걸리면 cappedNextBonus. **hold 로 막으면 항상 0** (steal 무시). distributor GK 의 세이브 → 1.
8. **간파**: line 0~2 에서만. 한 듀얼에 먼저 커밋한 쪽만 (AI 는 setupDuel 에서 먼저 커밋 → AI 가 썼으면 사람 간파 비활성).
   - 사람: readBoost(수비) / negateRead(공격) 효과만 (A안으로 이미 상대 행동을 앎).
   - AI: 효과 + 판정 때 사람의 실제 선택을 보고 행동을 교체 — 수비는 막을 확률 최고(hold 포함), 공격은 성공 확률 최고. 난수 추가 소비 없음.
   - 간파 사용권: team.gaanpaTickets(경기 시작 시 스냅샷 modifiers.gaanpaTicket) — 스킬 없이 텐션 0 으로 1회 (수비면 readBoost, 공격이면 negateRead). gaanpaCostHalf 면 간파 스킬(readBoost·negateRead effect) 텐션 ×0.5.
9. **자동 선택 (A안)**: `tendencyValues(state, side, playerId)` = 가능한 액션별 판정 기본값(짝·빗나감 제외): 스탯 × 계수 × 적성 × 스타일(상대 무관이므로 제외) × 특성 자기 보너스 × 전술 tacticBonus(공격 성향 dribble/pass, 수비 성향 tackle/intercept/hold, 슛 타이밍 midrange: "breakAll" → 중거리 0, "midrange" → ×1.15) × 체력 20% 이하 (드리블 ×0.7, 패스·크로스 ×1.2) × 필살기 준비·사용 조건 충족 시 필살 효과. 최대값 액션, 동률은 tie 순서. **난수 없음.** 수비수 선택(pickDefender)·수신자 선택도 동률은 슬롯 순서 — 판정 성공 주사위 외에는 rng 를 쓰지 않는다.
10. **수신자**: 후보 = pass: line 0 → MF 전원, line 1 → FW 전원, line 2 → 같은 라인 다른 FW (carrier 제외). cross: FW 전원 + MF 중 피지컬 최고 1명 (carrier 제외). 기본 수신자 = 도착 구역에서 쓸 주 액션의 판정값 최고 (도착 line < 3: 그 선수의 tendency 1위 값, 도착 line 3: pass → 슛 값(슈팅 × actionCoef.shoot) × (1 + finisher), cross → 헤더 값 × (1 + targetman)) — 상대 정보 미사용, 동률은 players 순서. 결정 `{ action, receiverId? }` — 후보가 아니면 throw. 없으면 기본값. (v0.4.2: line 3 박스 연결 후보·기본값 — §15.2)
11. **원터치·헤더**: pass·cross 로 line 3 도착(extraLine 포함) → `ball.oneTouch = true`, cross 면 `ball.receivedVia = "cross"`. 첫 슛: GK 수비력 × oneTouchGk, cross 면 헤더 스탯. `ball.lastPasserId` (킬패스·필살 패스 판정용), `ball.receivedFresh = true` (첫 듀얼 판정 후 false).
12. **필살기**: `team.live[pid].gauge` (unique 보유자만, 시작 gaugeStart). 증가: 그 선수가 듀얼 승리(공격 성공·수비 성공·세이브) +onDuelWin, pass·cross 수신 +onReceive, 골 +onGoal, 필살 패스 수신 +onUltPassReceive. 상한 gaugeMax. **준비** = gauge ≥ max 또는 `ball.comboReadyId === pid`.
   - 사용: 사람 `decision.ultimate = true`, AI 규칙(13.3). 쓰면 gauge 0 (합체기로 쓴 경우는 소모 없음).
   - shot: line 2~3 에서 action shoot 과 함께. boxShot 이면 중거리 계수 대신 shoot 계수, att × shoot, GK × gkMult.
   - pass: action pass 또는 cross 와 함께 (v0.4.2: line 3 박스 연결에서도 — §15.2). att × attack, negateRead, 성공 시 받은 선수 nextDuelBonus + gauge +receiverGauge(= onUltPassReceive 와 중복 아님, receiverGauge 사용), 받은 선수가 unique 보유자면 `ball.comboReadyId = receiverId`.
   - save: line 3 수비(GK)에서 자동 발동 조건 충족 시 save × saveMult.
   - 합체기: comboReadyId 선수가 다음 듀얼에서 자기 필살기를 쓰면 att × comboBonus, 이벤트 `type: "combo", name: combos.json 이름`.
   - 이벤트: 필살기 `type: "cutin", skillId, playerId, ultimateType`, 합체기 `type: "combo"` (cutin 2개 뒤).
13. **액티브**: 13.1 표의 effect 어휘. 한 듀얼에 팀당 일반 액티브 1개 + 필살기 1개(별도) 가능.
14. **상태 버전**: `MatchState.version = 3`. 이전 버전 저장 경기는 UI 가 버리고 새로 만든다.

### 13.3 AI (ai.js 재작성)

- `decideAttack(state, data, side)` / `decideDefense(...)` = 13.2-9 의 tendency 최대값 (결정적). `predictIntent`·의도 공개 관련 코드 삭제. (v0.4.2: line 3 도 tendency 최대값 — pass·cross 값 = `boxLinkEval` 점수, §15.3)
- 스킬 선택 `chooseSkill`: 전술 tension(save / immediate / clutch)을 따른다. 기본 레버리지 = line 2 공격·수비, 또는 동점·열세이고 남은 포제션 ≤ 3. 효과 없는 사용 금지(hold 인데 steal, 박스에서 간파, 짝 여부와 무관한 readBoost 는 레버리지일 때만 등). 간파: 레버리지 비트에서 텐션 충분하면 사용.
- 필살기 사용: shot = line 2~3 에서 선택 액션이 shoot 이면 (또는 필살 효과를 반영한 슛 값이 1위면), pass = 받는 선수가 unique 보유자이거나 도착이 박스면, save = line 3 에서 동점·열세 또는 남은 포제션 ≤ 3 이거나 게이지 가득, 합체기 = 가능하면 항상, 마지막 2포제션 = 준비되면 즉시.
- 수신자 = 13.2-10 기본값.

### 13.4 getMatchView 추가·변경

```js
expected: { attack: { playerId, action, values: {dribble, pass, cross?, shoot?} }, defense: { playerId, action, values: {tackle, intercept, hold} } } | null,
actions: [ { action, enabled, label, hint, expectedPct, recommended } ],   // expectedPct: 수비 = 막을 확률(상대 expected 행동 기준), 공격 = 돌파 확률, line 2 공격 = 이번 공격 득점 기대(돌파 × 박스 슛 성공), 중거리 = 골 확률
receivers: { pass?: { candidates: [id], defaultId }, cross?: {...} },
outcomesByReceiver: { pass?: { [receiverId]: { success: Outcome, fail: Outcome } }, cross?: {...} },   // outcomes[action] 은 기본 수신자 기준 (기존 필드 유지)
ultimate: { home: { [playerId]: { gauge, ready, combo } }, away: {...} },  // players[] 에도 gauge 필드
ultimateOptions: [ { playerId, skillId, name, type, usable, reason, comboName? } ],   // 사람 측 현재 당사자
gaanpa: { usable, reason, source: "skill"|"ticket"|null, skillId, cost, tickets },
opponentReading: boolean,   // 상대 AI 가 이번 듀얼에 간파를 커밋함
state.version, events type: "combo" 추가, "block" → "hold"
```
삭제: `intent`, `revealToHome` (UI 는 expected 로 대체). `remaining`·`zone`·`receiverPreview`(= receivers 기본값) 등 §12 필드는 유지. v0.4.2 추가(`boxLink`, `counter`, `ballState.boxLinkUsed`, `expected.attack.receiverId`, line 3 에서도 채워지는 receivers·outcomes) — §15.4.

### 13.5 run.js

- 스냅샷 선수에 `trait`, 팀에 `gaanpaTickets`(modifiers.gaanpaTicket 합), `gaanpaCostHalf`, 팀워크(+captain 은 match 가 계산). 상대 스냅샷도 trait·skillIds(보스 필살기) 포함.
- 전술 이행: `readIntent` → `balanced` (createRun 입력, 상대 데이터, 저장 등록 팀 로드 시).
- `getTurnView().nextMatch`: `intentReveal` 대신 `styleHint` (상대 필드 선수들의 공격 1위 액션 다수: "드리블 위주" / "패스 위주" / "혼합").
- 이벤트·유물 modifier 키 `gaanpaTicket`, `gaanpaCostHalf` 추가 (§6.7 표에 추가), `intentReveal` 제거.

### 13.6 화면

GDD 9.6·9.7·9.16·9.17 대로:
- 상대 듀얼 선수 머리 위 예상 행동 아이콘, 정보 줄에 근거("드리블형 — 드리블 600 > 패스 400")와 우리 선수 예상 행동. opponentReading 이면 "상대가 우리 수를 읽는 중".
- 공격 버튼 2×2(켜진 것만), 수비 3열 (v0.3.2: 아래 가운데 카드 한 줄 — §14.3). 버튼: 제목 "드리블 41%", 성공·실패 한 줄씩(짧은 형식), recommended 에 "추천" 표시.
- 받는 선수: 패스·크로스 버튼 제목에 "→ 그레타▾", 필드의 후보 토큰(전원 도착 구역에 그림)을 탭하면 변경, 길게 누르기 = 미니 카드. 결정 시 `{ action, receiverId }`.
- 필살 게이지 링(토큰 둘레), 준비되면 빛남. 스킬 줄에 필살기 버튼(합체기면 합체기 이름). 결정 시 `ultimate: true`. 전체 화면 컷인 1.5초(배속 비례), 합체기 2연속 + 이름.
- 간파 버튼(스킬 또는 사용권, 비용 표시, 비활성 사유).
- 크로스 포물선, 헤더 연출, 연계 문구("킬패스!", "원터치!", "헤더!", "침투!"), 태클 실패 누운 모습.
- 편성 화면: 캐릭터 카드에 연계 특성, 전술 수비 성향에 "버티기 선호", "의도 따라가기" 제거. 훈련 화면 다음 경기 정보에 styleHint.
- 390×844 결정 대기(공격 4버튼 + 받는 선수 + 필살기·간파) 스크롤 없음. 결정 중 로그 3줄. (v0.3.2: 세로 화면 폐지 — 1280×720 가로 HUD, 로그는 서랍, §14.3)
- 저장된 경기 version < 3 이면 새로 만든다.

### 13.7 테스트 · 도구 · 밸런스

- test/v05.test.mjs: A안 결정성(같은 상태 → 같은 자동 선택, rng 소비 없음), 수비 스탯·배율(짝/빗나감/hold/중거리), 뚫림 결과, 역습 시작 표(상한·hold·steal·distributor), 크로스 후보·헤더·원터치, 수신자 기본값·결정 receiverId, 연계 특성 전부, 보너스 합 상한, 팀워크 증폭, 간파(사람/AI/사용권/먼저 쓴 쪽), 필살기 게이지 증가·준비·사용·합체기, 액티브 9종 효과, 데이터 무결성(모든 trait·skill·combo 참조).
- 기존 테스트는 규칙 변경에 맞게 갱신 (block → hold, intent 삭제 등). 회귀 불변식(§12 레이아웃)은 유지.
- tools/choice.mjs: 수동 정책 비교 — auto / 버튼 기대 % 최고(expectedPct) / 무작위 / 항상 짝 맞힘, 그리고 스킬 끄기·필살기 끄기 변형. 출력: 시즌별 승률, 수동 이득, 필살기 1회당 승률 효과, 액티브 전체 효과, 경기당 필살기·액티브 사용 수.
- 밸런스 목표 (자동, sim 300런): 시즌 승률 70~80 / 50~60 / 35~45%, 골 1.5~3.5/경기, 필살기 보유자당 경기 1~2회 사용, 팀당 일반 액티브 3~4회. choice.mjs: 수동(expectedPct) 이득 5~10%p, 필살기 1회 +5~8%p, 액티브·필살기 전체 +6~10%p. 조정은 config·opponents 수치로.

### 13.8 통합 노트 (v0.3)

4개 담당(경기 엔진 / 데이터·런 / 화면 / 도구·밸런스)이 13.0~13.7 만 보고 만든 뒤 통합하면서 확정·추가된 사항. **구현이 기준**이다.

#### 13.8.1 계약과 달라진 것 · 추가된 것

**경기 엔진 (match.js · ai.js · skills.js)**
- `tendencyValues(state, data, side, playerId?)` — config 가 필요해 `data` 인자 추가 (13.2-9 문구는 `(state, side, playerId)`).
- 추가 export: `pickByTendency, autoAction, receiverPlan, defaultReceiverId, ultimateUsable, ultimateReady, aiWantsUltimate, gaanpaStatus, bestDefenseResponse, bestAttackResponse, teamworkAmp, getTrait, comboName, fxOf, gaugeOf, DEFAULT_TRAITS, DEFAULT_COMBOS, MATCH_VERSION` (ai.js `isLeverage`, skills.js `getPlayerUltimate, isGaanpaSkill, skillCost, addSkillFx, ULTIMATE_TYPES`). 삭제: `revealLevelFor, REVEAL_LEVELS`.
- **필살 패스의 기본 받는 선수**는 받는 선수의 합체기 가치(자기 필살 효과 × comboBonus)를 판정값에 넣는다. 없으면 기본 편성에서 실루엔 → 울리카(드리블형)로 가서 자동 경기 합체기가 0회였다. `view.receivers[a].ultimateDefaultId` 추가, 수동 `{ action: "pass", ultimate: true }` 에 receiverId 가 없으면 이 값. 필살 패스 변형은 `receiverPreviewBySkill / outcomesBySkill / receiversBySkill` 에 **필살기 skillId 키**로 들어간다.
- 연계 스택 `passChainBonus × chain` 은 **슛에만** (v0.1 규칙 유지, GDD 9.10-6). 13.2-5 문구에는 액션 제한이 없다.
- 필살 슛 `gkMult ×0.7` 은 파이널 서드 중거리(박스 슛 취급)에서 막는 DF 에도 적용. 박스 슛 취급이라 버티기 중거리 배율(×holdVsMidrange)은 붙지 않는다.
- 필살기를 쓴 선수는 그 듀얼에서 게이지를 얻지 않는다(0 유지). 필살 패스 수신은 onReceive 대신 `ultimate.receiverGauge`(50). 게이지 증가는 한 번씩 상한으로 자른다(승 → 골 순서).
- AI 텐션 정책 save/clutch 의 "슛 상황" = line ≥ 2 공격·수비 (13.3 기본 레버리지). 슛만으로는 팀당 액티브 2.0~2.5 로 목표 미달이었다.
- 결정 형식: `decision.gaanpa = true | "ticket" | "skill"` (true 는 사용권 우선). `{ skillId }` 또는 `{ gaanpa }` 단독 = 부분 커밋(결정 대기 유지). `{ ultimate: true }` 단독은 throw. 부분 커밋한 skillId 를 최종 결정에 다시 보내면 "이미 사용" throw. 간파 스킬과 다른 액티브는 한 듀얼에 함께 못 쓴다(throw) — 화면은 비활성이 된 토글을 스스로 해제한다.
- **사람 측 자동 진행도 AI 규칙**(`byAI`)이라, 자동 중 우리 팀이 간파(사용권)를 쓰면 AI 처럼 판정 때 상대의 실제 선택에 맞춰 액션을 바꾼다. 수동 결정은 효과만 (13.2-8).
- 데이터: traits.json 항목에 `amp: boolean`(팀워크 증폭 대상). skills.json 전 항목에 `ultimate` 키(null | 객체), 필살기는 `active: null`·`tension 0`. config.match: `actionCoef.block` 삭제, `actionCoef.tackle/intercept`(1.0)·`staminaCost.cross`(4) 추가, `aiRevealForOpponent` 삭제.
- `data.traits` / `data.combos` 가 번들에 없으면 `DEFAULT_TRAITS / DEFAULT_COMBOS`(같은 값)로 동작 — 테스트가 같은 경기 결과를 확인한다.
- getMatchView 추가 필드: `actions[].expected`(소수), `skills[].cost/gaanpa/expectedPct{action:%}`, `ultimateOptions[].gauge/description/expectedPct`, `gaanpa.expectedPct`, `receivers[a].arrival/zone/ultimateDefaultId`, `outcomesByReceiver[a][id].expectedPct`, `receiversBySkill`, `ballState{oneTouch, receivedVia, receivedFresh, comboReadyId, pending}`, `gaanpaTickets{home, away}`, `carrier/defender.trait/gauge`, `players[].trait/gauge/ultimateSkillId`, Outcome `short`(버튼용 짧은 문구)·`oneTouch`. 필살 세이브는 `ultimateOptions` 에 `type "save", usable false, reason "GK 세이브에서 자동 발동"`.
- 이벤트: 판정 이벤트에 `pair, links[{id, label}]`(킬패스!/원터치!/헤더!/침투!/합체기!), `header, oneTouch, readBy, ultimate, defUltimate, via, counterStart`. skill 이벤트에 `gaanpa, ticket, cost`. **모든 이벤트가 `seq` 를 가진다.** combo 이벤트 = `{ type: "combo", name, skillIds: [a, b], playerIds: [a, b] }` (받은 선수의 cutin 뒤). `stats[side]` 에 `skillsUsed, ultimatesUsed, combos, gaanpaUsed`. `state.possessionFx`(함성 teamMult).
- 이벤트 로그의 "X의 버티기 제침" 은 "뚫었다"는 동사일 뿐이다. 제쳐짐 상태(+beatenBonus)는 태클이 졌을 때만 붙는 별도 꼬리표("— X 제쳐짐 (다음 듀얼 +25%)").

**데이터 · 런 (data/*.json · run.js · effects.js)**
- 시즌 3 보스 엠버스론: 13.1 의 필살기 2개 외에 MF 세르바 `sk_eagle_eye`, FW 코르델리아 `sk_see_through` (GDD 0.1 #37 "보스가 우리 수를 읽는다" — readIntent 삭제 후 읽기 수단이 없어서).
- 상대 3명 드리블·패스 값 교환(합 불변): 아이언후프 DF2 하르디아·MF2 코르바, 썬더클로 DF2 스나리. A안에서 DF·MF 패스 스탯이 드리블을 이겨 "드리블 전술" 팀도 styleHint 가 패스 위주로 나왔기 때문.
- `styleHint` 는 엔진 tendency 가 아니라 스탯 비교(필드 선수 dribble×계수 vs pass×계수, 전술 선호 ×tacticBonus, 동률 드리블, 과반이 아니면 "혼합"). 경기 상태 없이 계산해야 해서.
- 추가: `nextMatch.styleHintKey / styleCounts / gaanpaTickets`, 스냅샷 선수 `charId`, `getTurnView().players[].trait`, export `normalizeTactics, migrateRun, migrateRegisteredTeam, opponentStyleHint, DEFENSE_TACTICS, MODIFIER_KEYS, assertModifierKey`. `team.gaanpaCostHalf` 는 boolean, `modifiers.gaanpaCostHalf` 는 숫자.
- 옛 저장 런 이행: `intentReveal` modifier → 같은 양·기간의 `gaanpaTicket` (감독의 수첩 유물이면 `gaanpaCostHalf 1` 추가), 전술 readIntent → balanced. 상태를 바꾸는 run 함수는 모두 `migrateRun` 을 먼저 부른다. RUN_VERSION 은 1 유지(모양 불변, 내용으로 이행).
- effects.js 는 알 수 없는·삭제된 modifier 키를 throw 한다 (전에는 조용히 통과).

**화면 (screens/match.js · layout.js · setup.js · training.js)** — 배치 수치(필드 높이, 360~390px 폭, 로그 줄 수, 칩 자리)는 v0.3.2 가로 HUD 로 대체 (§14.3). 나머지 동작은 유지.
- 남은 수비 문구는 필드 왼쪽 아래 칩("남은 수비: MF2·DF2·GK"). 정보 줄은 예상 행동 근거(GDD 9.6)에 쓴다.
- "추천"·"짝" 칩은 버튼 제목 밖(공격 = 성공 줄 오른쪽, 수비 = 아래 줄) — 제목에 두면 360~390px 에서 받는 선수 이름이 잘렸다. 스킬·필살기·받는 선수를 토글하면 "추천"은 화면에 보이는 % 최고로 옮긴다.
- **근사 % (≈)**: 엔진 view 에 스킬 + 필살기 동시 토글, 또는 토글 + 기본이 아닌 받는 선수 조합의 미리보기가 없어 가장 가까운 엔진 값에 ≈ 를 붙인다(규칙 재계산 없음). 정확히 하려면 엔진에 `outcomesByReceiverBySkill` 류가 필요하다.
- 합체기 컷인 = 1.0s + 1.0s + 이름 1.1s (단일 필살기 1.5s). 1x 에서 합체기 비트가 4.5초를 넘지 않게.
- 간파는 탭하면 즉시 부분 커밋(`{ gaanpa: source }`), 결정 대기 유지. 스킬·사용권이 둘 다 있으면 엔진 우선(사용권). 간파 스킬은 일반 액티브 줄에서 숨긴다.
- 자동 진행 중 액션 영역 = 우리 선수의 성향값 + "자동 선택" 표시.
- 로그 줄 클래스 `ev-<type>` (전역 `.cutin` 배너 스타일과 충돌 방지). 필드 높이 = 화면 높이 − 370px.
- layout API: `L.receiverIds`(패스·크로스 후보 전원, 도착 구역에 role receiver), `receiverCandidates` export, `resolvePreview(view, { skillId, ultimate, deciding })` 가 `receivers` 도 바꾼다. 자동 진행 중에는 변형이 후보·도착을 바꾸면 후보 전원을, 기본값만 다르면 그 선수만 숨긴다.
- store.matchUi 추가: `ultimate, receiverPick, pickKey, gaanpaUsedKey, lastDecision`(읽기 전용).
- 편성 화면 서포트 그리드 가로 넘침(390px 에서 429px) 수정 — 이번 라운드 전부터 있던 문제.

**도구 · 테스트**
- test/layout.test "자동 진행: 그린 패스 후보 = 실제 수신자": 픽스처를 DF1 아델린(패스형) + `sk_line_breaker` 주입 + 텐션 60 으로 바꿈(A안에서 드리블형 DF 울리카는 패스를 안 해서 변형이 쓰이지 않았다). 숨김 상한 passes/4 → passes/3. **이 비율은 `tension.start` 에 민감**하다 — 35 이상이면 라인 브레이커가 킥오프 듀얼에 바로 발동해 0.35 로 실패.
- tools/sim.mjs: `--manualOracle` 삭제(view.intent 사용) → tools/choice.mjs 가 대체. 경기 표를 전체 / S1~S3 목표 경기로 나눠 출력. `--oppScale` 에 `cap=`.
- tools/choice.mjs 정책: auto / expected(AI 규칙으로 붙을 스킬·필살기·간파 토글의 기대 % 까지 보고 최고) / rec("추천"만, 스킬·필살기는 AI 규칙) / random / pair / hold / expD·expA. 변형: 필살기·액티브·둘 다 끔(`--strip both` 면 상대도).
- tools/scenarios.mjs 시나리오 08~15, `adjustSetup` 훅, shot.mjs `steps` 상호작용.

#### 13.8.2 통합에서 고친 경계 불일치

1. js/ui/app.js · test/helpers.mjs 로더에 `traits`, `combos` 추가 (app.js 는 두 파일이 404 면 건너뛴다 — 엔진·화면 기본값이 같다).
2. test/v05.test 게이지 테스트: 기대값을 한 번씩 `min(…, gaugeMax)` 로 자르고 제목의 고정 수치를 config 키로. 이전에는 증가량 합이 100 을 넘으면 실패해 튜닝을 `(100 − 시작)/2` 이하로 묶었다. 수비 배율 테스트 제목 "짝 ×1.5" → "×readBonus".
3. 화면 자동 진행 액션 영역이 엔진 힌트를 그대로 써서 "→ 기본 받는 선수" 를 보였다 — 필살 패스(합체기 기본값)·스킬 변형이면 실제 받는 선수와 달랐다. 결정 버튼과 같은 처리(`stripRecvHint`)로 뗀다.
4. 간파 버튼 설명의 "짝을 맞히면 ×2.0" 고정값 → readBoost 스킬 데이터의 readMult (엔진 `ticketReadMult` 와 같은 출처).
5. §5.2 TeamSnapshot · §6.7 modifier 표를 v0.3 로 갱신.

#### 13.8.3 튜닝 값 (13.1 config 블록 · §4.6 · §11.3 대체)

| 키 | 13.1 | v0.3 | 이유 |
|---|---|---|---|
| match.readBonus (짝) | 1.5 | **1.7** | 1.5 에서는 수동 이득의 수비 쪽이 약했다. 1.7 에서 수동 이득 약 +7%p, "추천만 따르기"가 S2·S3 에서 자동보다 손해가 아니다 |
| match.tension.start / duelWin | 20 / 10 | **30 / 9** | 우리 액티브 S1 2.9 → 3.0 수준. 35 이상은 layout.test 숨김 상한에 걸림 |
| match.ultimate.onDuelWin / onReceive / onGoal | 20 / 15 / 30 | **35 / 35 / 35** | 보유자가 경기당 4~5회 관여하는데 사용 0.4회(실루엔 35% 경기가 가득 찬 채 종료). 시작 30 + 35×2 = 100 → 첫 필살기는 관여 2번 뒤, 이후 3번마다 |
| 상대 스탯 | §4.6 가이드 | S1 ×1.18, S2 ×1.07, S3 ×1.17 (10 단위 반올림, 스탯만) | 필살기가 강해진 만큼 시즌 승률을 목표 대역에 다시 맞춤 |
| match.tendency.midrangeTactic (신규, 13.8.6-5) | (tacticBonus 1.15) | **3.0** | 중거리 계수 0.6 이 드리블·패스 2.2 보다 훨씬 낮아 ×1.15 로는 1위를 절대 못 뒤집었다(상대 최대 비율 0.448). 중거리 = 한 번 이기면 골, 돌파 = 두 번 → 반반 승부에서 약 3배가 같은 득점 기대 |
| 상대 연계 특성·스탯 (13.8.6-4) | 13.1 | 피니셔 제거(무그리·시오넬라·아그니스), 침투 이동(다리아 → 로웨나, 프레야 → 없음, + 코르바·카엘라·코르델리아), 파냐 슈팅 730·드리블 540·패스 610 · 루가 슈팅 710, 시오넬라 슈팅 780·드리블 580 → 실버리프 전원 ×1.05 | A안 자동에서 한 번도 발동하지 않던 특성을 공을 실제로 잡는 선수로 옮김. 실버리프는 중거리 팀이 되며 약해져(S2 59%) 스탯으로 되돌림 |

- 상대 선수당 5스탯 합 평균: S1 아이언후프 1700 · 강변 1606, S2 실버리프 2573(QA 전 2451) · 썬더클로 2329(QA 전 2316), S3 엠버스론 3399 · 프로스트베일 3199. **S3 최대 스탯 1170 > statCap 1000** (엠버스론 GK·DF, 프로스트베일 GK). 엔진은 상대 스탯을 자르지 않고 화면에 상대 스탯 바가 없어 드러나지 않는다. 1000 으로 자르면 팀 개성이 사라져 쓰지 않았다.
- GDD v0.5 의 [가정] 수치 중 바뀐 것: 짝 ×1.5 → ×1.7, 필살 게이지 +20/+15/+30 → +35/+35/+35, 팀 텐션 시작 20 → 30 · 듀얼 승 +10 → +9, "기회 보이면 중거리" 중거리 성향 ×1.15 → ×3.0 (13.8.6-5). 규칙 문구 중 바뀐 것: 볼 운반 "빌드업 구역 드리블 +10%" → "빌드업·중원(line ≤ 1)" (13.8.6-3).

#### 13.8.4 검증 (통합 시점)

- `npm test`: 97 테스트 전부 통과 (rng 8, run 25, match 24, v05 22, layout 16, ui.smoke 2 — jsdom 클릭-스루·시나리오 포함).
- `node tools/sim.mjs --runs 300 --seed 1` (자동 A안): 목표 경기 승률 **73.7 / 53.0 / 41.3%**, 골 2.64/경기(S3 목표 경기 4.07), 우리 일반 액티브 3.04/경기(S1 2.74 · S2 3.01 · S3 4.15), 필살기 보유자당 0.99 / 0.85 / 1.22, 합체기 0.67 / 0.52 / 0.81, 필살 슛 골 확률 81.8 / 70.4 / 81.0%, 연장 19.5% · 승부차기 10.7%, 등급 중앙값 B.
- `node tools/choice.mjs --runs 300 --seeds 8` (시즌당 2400경기): 수동 이득(expected − auto) **+7.0 / +6.7 / +8.4%p**, 필살기 1회 효과 **+5.3 / +8.4 / +5.5%p**, 일반 액티브 효과 +4.0 / +3.3 / +4.3%p(1회 +1.0~1.4), 액티브·필살기 전체 **+15.0 / +17.6 / +16.6%p**, 무작위 − 자동 −22.6%p, 추천만 − 자동 −2.4 / +1.0 / +0.1%p.
- 화면 계약 퍼즈(임시 스크립트, 180경기 · 사람 결정 3117회): 화면이 허용하는 조합(액션 · resolvePreview 로 고른 받는 선수 · 일반 액티브 · 필살기 · 간파 부분 커밋)을 무작위로 보내 `step()` throw 0, 공격·수비 액션 교체 0, 받는 선수 불일치 0(기본값이 아닌 선택 154회), 필살기 120회 전부 cutin, 합체기 18회, 간파 255회 뒤 결정 대기 유지. 토글 없는 결정 2598회 중 약속한 구역 ≠ 판정 뒤 구역은 승부차기로 넘어간 8회뿐(승부차기 view.zone = 키커가 노리는 박스, §12.1 규칙).
- `node tools/shot.mjs <outDir>`: 15/15 시나리오 390×844 페이지 스크롤 없음(로그 내부 스크롤만), 콘솔 에러 0.
- 실제 브라우저(puppeteer, 390×844): 시작 → 새 런 → 기본 편성 → 친선전 자동 4x 완주 → 결과 모달 → 확인 → 런 진행. 수동(`?auto=0`, 간파 사용권 2 주입): 받는 선수 탭 2회(버튼 · 실제 수신자 일치), 메테오 슛(cutin, 골), 간파 사용권 2회(결정 대기 유지), 판정 액션 불일치 0, 콘솔 에러 0.

#### 13.8.5 남은 문제 · 기획 결정 필요

1. **액티브·필살기 전체 효과 +16.4%p (목표 +6~10)**. 필살기 1회 효과는 게이지 설정과 무관하게 5~9%p 로 거의 일정해서 전체 ≈ 1회 효과 × 사용 수다. 보유자 2명 × 1~2회 × 5~8%p 면 10%p 를 넘을 수밖에 없어 "보유자당 1~2회"와 "전체 +6~10"은 양립하지 않는다. 현재는 승인된 사용 빈도를 우선했다. 대안: 게이지 증가를 20/15/30 으로 되돌리고 상대를 약하게 → 보유자당 0.3~0.6회, 전체 약 +8~11.
2. S2 필살기 보유자당 0.85회 (목표 1~2). 측정(sim 300런 seed 1, 증가량 셋 다 같은 값): 40 은 35 와 **완전히 같은 결과**(가득 차는 관여 횟수가 같다), 50 도 0.99/0.85/1.22 → 1.07/0.94/1.38 · 승률 +1~2%p 에 그친다. S2 는 보유자의 관여 자체가 적어서, 1회 이상은 "관여 1번 만에 준비"(시작 65 등, 전체 효과 +20~25%p) 구간에서만 나온다 (13.8.2-2 로 테스트 제약은 풀렸다).
3. S1 우리 일반 액티브 2.74~2.89회 (목표 3~4). 포제션 8/10/12 차이로 텐션만으로 S1·S3 를 함께 맞출 수 없다(S3 4.15).
4. S1·S2 상대 4팀에 일반 액티브가 없어 상대 액티브 0회/경기 (GDD 9.18 "팀당 3~4"). 1~2개씩 넣고 `--oppScale` 로 스탯을 다시 맞추면 된다.
5. 크로서가 자동에서 크로스를 거의 안 한다 (0.17회/경기): 크로스 성향 (패스+드리블)/2 × 1.1 < 드리블. 예: 스크린샷 08 에서 자동은 드리블 25%, 크로스는 53%. 크로스 → 헤더 → 타깃맨 연계는 사실상 수동 전용.
6. 보스 GK 필살 세이브 0.02회/경기 — GK 게이지는 세이브로만 차고 가득 찼을 때만 쓴다. GK 전용 증가량(예: 세이브 +50) 검토.
7. "추천"(`actions[].recommended`)은 토글 없는 기대 % 라 준비된 필살기를 보지 않는다. 필살기가 준비된 그레타가 라인 2 에서 드리블 30% 를 추천받고, 메테오 중거리는 87%. 추천만 따르면 S1 −2.4%p. 제안: 필살기가 준비되면 `ultimateOptions` 에도 추천 표시.
8. line 0~1 공격 expectedPct 는 돌파 확률만 본다(계약대로) → 공격만 기대 % 최고의 이득은 +1.7~2.6%p (수비만 +5~7.5). 다음 듀얼 보너스·도착 구역 가치를 넣으면 공격 쪽 결정이 살아난다.
9. S3 목표 경기 골 4.07/경기 (전체 평균 2.64 는 목표 안).
10. 새 파일이 아직 git 에 없다: `data/traits.json, data/combos.json, test/v05.test.mjs, tools/choice.mjs` — 커밋에 넣어야 한다 (`npm test` 가 v05 를 요구한다).
11. **기획 확인 — 볼 운반** (13.8.6-3): "빌드업 구역(line 0)"은 규칙상 공 소유자가 항상 DF 라 미르카(MF/FW)·키라(MF)에게 발동하지 않았다. 검수 제안 1안(line ≤ 1, `buildupMaxLine`)으로 바꿨다. 다른 안: 효과를 "중원 드리블 +10%"로 한정, 또는 DF 캐릭터에 배정.
12. **기획 확인 — 중거리 전술** (13.8.6-5): ×3.0 은 "슈팅이 드리블·패스보다 약 1.2배 이상 높은 선수만" 중거리 1위. 자동 중거리 슛 골 확률은 15~17%(우리 DF 가 버티기 ×1.5 로 막음) 라서 중거리 팀(실버리프)은 오히려 약해진다 — GDD 9.11 "중거리 팀 = 버티기의 가치" 그대로. 우리 팀이 이 전술을 고르면 목표 경기 승률은 대략 중립(±3%p). 대안: 값을 2.5 로(상대 동작 불변, 우리 슈터만 뒤집힘), 또는 전술 설명을 "필살 슛·수동에서만 의미"로.
13. 피니셔(받은 직후 박스 슛·헤더)는 A안 자동에서 상대가 발동시킬 경로가 없다(FW 끼리 패스·크로스가 없음). GDD 9.10 대로 런치 캐릭터용으로 남기고 상대에서는 뺐다. 상대 철벽 노르웬(실버리프)은 매치업 수비수 선택이라 경기당 0.01회 — 수비할 때 자동 선택은 버티기라 테스트는 "발동 > 0 또는 버티기 선택"으로 본다.
14. 수비 미리보기 ✕ 는 다음 구역 같은 레인에 선 선수와 겹치면 레인 옆으로 비킨다 (13.8.6-10). 수비수와 그 선수 사이 틈(약 17px)이 ✕(약 23px)보다 좁아서 레인 위에는 못 둔다.

#### 13.8.6 검수 수정 (v0.3 QA — 14건, 구현이 기준)

**엔진 (match.js)**
1. 함성(rally) 미리보기: `skills[].expectedPct` 를 발동 뒤 가상 상태(`stateAfterActive` = 사본에 실제 `applyActive`)에서 계산 — 전원 체력, 제쳐짐 해제·커버 복구, 이번 포제션 팀 판정 ×teamMult(다음 박스 슛까지) 포함. 받는 선수는 실제 결정처럼 발동 전 기본값. 전에는 함성을 안 켰을 때와 같은 값(2~11%p 낮음).
2. line 2 드리블·패스·크로스 기대 %(돌파 × 박스 슛)의 박스 슛에 **슈터 자기 필살 슛** 포함: 판정 뒤 게이지(드리블 = +onDuelWin, 패스·크로스 = +onReceive / 필살 패스 receiverGauge, 이번 듀얼에 필살기를 쓴 선수는 0)가 gaugeMax 면 필살 슛 효과로 계산 (AI 규칙: shot 은 준비되면 항상 사용). 합체기·상대 GK 필살 세이브는 전과 같다. "추천"도 따라 바뀐다.
3. 볼 운반 `buildupDribbleBonus` 조건: line 0 → **line ≤ `buildupMaxLine`(1)** (traits.json · DEFAULT_TRAITS 에 `buildupMaxLine: 1`, 설명 "빌드업·중원 드리블 +10%"). 판정(attackBonus)과 성향값 모두. 13.8.5-11.
4. (데이터) 상대 연계 특성이 자동에서 발동하도록 재배정 — 13.8.3 표. 테스트 "상대 연계 특성은 자동(A안) 경기에서 발동한다"(v05)가 모든 상대 특성의 발동 > 0 을 확인한다(철벽은 "발동 또는 수비 시 버티기 선택").
5. `config.match.tendency.midrangeTactic`(3.0): 슛 타이밍 "기회 보이면 중거리"의 중거리 성향 배율 (없으면 tacticBonus). 13.8.5-12.
6. `getAttackActions(state, side, data, fx?)` · `getDefenseActions(state, side, data, fx?)`: 힌트가 효과를 따른다 (fx 없으면 이번 듀얼에 커밋된 효과 — 간파 부분 커밋 포함). 짝 무효(간파·스루 패스·필살 패스) → "짝 무효 (이름)", 파이널 서드 필살 슛(boxShot) → 제목 **"필살 슛"** · "박스 슛 취급 · GK ×0.7", 박스 필살 슛 → "… · 필살 · GK ×0.7", 파워 슛 → 중거리 위력 배율, 수비 간파 → "짝 ×2", 빗나감 무시 → "빗나감 없음". view 추가: `skills[].actions` · `ultimateOptions[].actions` · `gaanpa.actions` = `{ [action]: { label, hint } }` (그 토글을 켰을 때의 제목·약점 문구).
7. 판정 이벤트(duel · turnover)에 패스·크로스면 `receiverId` (판정 전에 정한 받는 선수 — 턴오버에도).

**화면 (screens/match.js · setup.js · css)**
8. 액션 버튼 제목·약점 문구 = 켠 필살기 → 스킬의 `actions[action]` (없으면 기본). 필살 패스를 켜면 "vs 인터셉트에 약함" 대신 "짝 무효 (바람의 실)".
9. 한 줄 버튼(rows-1, 2열 이하) 성공 긴 문구 3줄까지. 수비 3열: 짝·추천 칩과 판정 스탯이 한 줄에 안 들어가면 판정 스탯을 다음 줄로(잘리지 않음).
10. 연계 문구(`linkPop`) 자리: 위 → 위 좌우 → 좌우 → 아래(필드 위쪽 끝이면 아래부터) 중 토큰·이름표·말풍선·공을 피한 자리 (`pickSpot`). 수비 미리보기 ✕: 길 위(수비수 뒤 1.6 → 1.25 → 1.0 → 2.4 → 3.0 토큰) → 레인 옆 ±0.8 토큰 중 다른 토큰과 안 겹치는 첫 자리.
11. 자동 진행 중 성향값 보기의 힌트: 한국어 단어 중간 줄바꿈 금지(keep-all).
12. 라인 브레이커 등 **도착 구역을 바꾸는 변형** + 기본 아닌 받는 선수: `outcomesByReceiver`(스킬 없이 계산)를 쓰지 않고 변형 결과에 받는 선수 이름만 바꾼다(≈). 전에는 "상대 진영 진입, 중거리 슛"(스킬 없는 도착)을 보였는데 실제는 박스 원터치였다.
13. 실패한 패스·크로스 연출의 받는 선수 = 이벤트 `receiverId` → 이번 비트의 사람 결정 → 기본값. 화면 내부 `lastDecision` 은 자동 비트에서 지운다 (전에는 개입 뒤 자동 패스가 끊기면 옛 받는 선수 쪽으로 길이 0 궤적). `store.matchUi.lastDecision`(도구용)은 그대로.
14. 스킬 줄 4개 이상 = 압축 모드(`.skill-row.many`: 필살기 "필살기/합체기" 꼬리표·텐션 ✦ 숨김, 게이지 16px, 간격·글자 축소 — 제목에 전부 있음), 간파 버튼은 줄지 않는다. 편성 서포트 카드: 이름은 단어 단위 줄바꿈(희귀도는 보조 줄 맨 앞), 보조 줄은 항목 단위 줄바꿈.

**도구**
- tools/sim.mjs: 경기 표에 "중거리 슛/경기 우리/상대 (골%)" (필살 슛 제외).
- tools/scenarios.mjs: 시나리오 `16_skill_row_4` (실루엔 + 스루 패스·폭발 드리블·꿰뚫어보기 → 필살기·간파·액티브 2). tools/shot.mjs: "잘린 스킬" 열 (스킬 이름 말줄임 — 소수 픽셀 Range 폭으로 잰다).

**검증 (QA 수정 뒤)**
- `npm test`: 99 전부 통과 (rng 8, run 25, match 24, v05 24, layout 16, ui.smoke 2).
- `node tools/sim.mjs --runs 300 --seed 1`: 목표 경기 승률 **74.3 / 57.3 / 41.3%** (seed 1~4 평균 S2 약 55%), 골 2.58/경기(S3 4.15), 우리 일반 액티브 3.08/경기, 필살기 보유자당 0.98 / 0.88 / 1.23, 필살 슛 골 확률 80.4%, 상대 중거리 슛 S2 2.72/경기(골 15%), 침투 연계 1.56/경기(전 0.09).
- `node tools/choice.mjs` (60런 × 6시드): 수동 이득 **+7.0%p** (7.8 / 5.3 / 8.1), 필살기 1회 +7.0%p, 액티브·필살기 전체 +17.3%p(13.8.5-1 그대로), 추천만 − 자동 −1.2%p.
- 미리보기 = 실제 (실제 목표 경기 36셋업 × 시드 2, 액티브 8종 주입): 액티브 토글 8705건(함성 2588) 불일치 0, line 2 비슛 기대 % 538건 중 1%p 넘는 차이 0.
- 상대 특성 발동 (목표 + 친선, 540경기): 피니셔 0 → 배정 없음, 침투 로웨나 118 · 카엘라 133 · 코르바 191 · 코르델리아 191, 크로서 파냐 0 → 136, 타깃맨 루가 0 → 89, 볼 운반 키라 0 → 234.
- `node tools/shot.mjs`: 16/16 시나리오 390×844 스크롤 없음·잘린 스킬 0·콘솔 에러 0 (360 폭 04·11·12·16 도 스크롤·잘림 0, 320 폭에서는 16 의 이름 3개가 말줄임).
- 브라우저 확인(puppeteer 390×844): 라인 브레이커 + 울리카 탭 → 버튼 "울리카 원터치 · 상대 박스 진입", 미리보기 "→ 상대 박스", 판정 line 3 원터치. 개입 패스 뒤 자동 ON → 타리아의 자동 패스가 끊긴 턴오버 궤적이 그레타(이벤트 receiverId) 쪽 33px. 연계 문구 6건 토큰 얼굴·이름표 겹침 0 (전: 6건 모두 오르비아 얼굴·이름표·말풍선을 가림). 편성 서포트 카드 390·360: 단어 중간 줄바꿈 0, 가로 넘침 없음.

### 13.9 가로 경기 화면 (테스트, v0.3.1) — **폐기: §14 로 대체**

> v0.3.1 은 **경기 화면만** 가로로 시험했다 (아웃게임은 420px 세로 프레임, 세로 경기 화면과 공존). 2026-09-29 사용자 결정으로 인게임·아웃게임 모두 가로 전용이 되어(GDD v0.5 0.1 #50~52) 이 절의 방향 전환 구조는 **코드에서 삭제**했다. 옛 본문은 git 기록(커밋 4a282be)에 있다.

- **삭제한 것**: 세로 경기 화면 전부(세로 토큰 크기·세로 이름표/미리보기/트랙 분기), 방향 고르기(`resolveOrient` 우선순위 = 토글 > `?orient` > 저장값 `soccer.orient` > 창 크기 `landFits` 폭 ≥ 900 · 높이 ≥ 500), store 의 `KEYS.orient · matchUi.orient · normOrient · loadOrient · saveOrient · landFits · autoOrient · LAND_MIN`, 컨트롤 줄 ⇄ 버튼(`.orient-btn`)과 전환 대기, 방향 전환용 resize 처리, 넓은 프레임 `#app.match-land`(폭 min(100vw − 32px, (100dvh − 32px) × 1.9), `--land-h`), `.match-screen.land` 2단 grid(오른쪽 패널 404px · 로그 패널), `shot.mjs --land`(이제 받기만 하고 무시).
- **남긴 것**: `layout.js fieldToScreen / screenToField` (순수 함수, 테스트 있음 — `'port'` 분기와 기본값 `'port'` 도 그대로. match.js 는 항상 `'land'` 로 부른다). 가로에서만 의미가 있는 배치 규칙(이름표·말풍선·미리보기 글자 자리, 크로스 곡선 방향, 뚫린 선수 표시)은 §14.3 으로 옮겼다.
- **"남은 것"(당시) 처리**: 아웃게임 가로 배치 → §14.4. 가로 폰·폭 900 미만 창의 세로 강제 → 없음(모든 창이 같은 무대를 배율만 바꿔 쓴다). 1920×1080 에서 글자가 작던 문제 → 무대째 1.5배.

---

## 14. v0.3.2 — 가로 확정: 고정 스테이지 · 경기 HUD · 아웃게임 가로 (GDD v0.5 0.1 #50~52)

> 사용자 결정 (2026-09-29): **인게임·아웃게임 모두 가로**. 최종 타깃은 유니티 가로 모바일 게임이고, 이 웹 프로토타입은 데스크톱 브라우저 테스트용이다. 경기 화면은 사용자 목업(필드가 화면 전체, HUD 는 가장자리)을 따른다 — GDD 9.16.
> **규칙·데이터 변경 없음**: `js/engine/*`, `data/*`, `layout.js computeLayout` 은 그대로. 바뀐 것은 화면(`index.html`, `css/`, `js/ui/`)과 도구·테스트뿐이다. 이 절이 v0.3.2 화면의 기준이고, §8·§12.3·§13.6·§13.9 의 배치 문구와 충돌하면 이 절이 우선한다.

### 14.0 이번 라운드 소유권

| 담당 | 파일 |
|---|---|
| 스테이지(기반) | index.html, css/base.css(신규), js/ui/stage.js(신규), js/ui/app.js(부트), js/ui/store.js(`landOnly`), tools/shot.mjs · scenarios.mjs(og_* 시나리오), test/stage.test.mjs(신규), README.md. `css/style.css` 삭제 |
| 경기 HUD | js/ui/screens/match.js, css/match.css(신규), js/ui/store.js(방향 API 삭제), test/orient.test.mjs(재작성), test/ui.smoke.test.mjs(경기 부분), test/layout.test.mjs |
| 아웃게임 | js/ui/screens/start·setup·training·event·relic·route·result.js, css/outgame.css(신규), js/ui/dom.js(`panel` 추가), js/ui/labels.js(아이콘 추가), test/outgame.test.mjs(신규) |

### 14.1 고정 스테이지 (js/ui/stage.js · css/base.css · index.html)

- **논리 해상도** `STAGE_W × STAGE_H = 1280 × 720` (16:9). `base.css` 의 `--stage-w / --stage-h` 와 같아야 한다 (test/stage).
- `fitStage(winW, winH)` (순수 함수) → `{ scale, x, y, width, height, portrait }`: `scale = min(winW / 1280, winH / 720)`, x·y = 가운데에 둔 왼쪽 위(창 px, 가장자리 번짐을 막으려고 정수로 내림), `portrait = winW < winH`. 크기를 모르면(0·NaN·음수 — 레이아웃 없는 환경) 1배·왼쪽 위. `toStage(clientX, clientY, fit)` = 창 좌표 → 무대 논리 좌표 (역변환).
- `mountStage()`: `app.js boot()` 맨 처음(데이터 로딩 전 — 로딩 화면부터 무대 안). 붙일 때·`resize`·`orientationchange` 마다 `<html>` 에 `--stage-scale / --stage-x / --stage-y` 와 클래스 `stage-portrait` 를 갱신. `#stage` 가 없으면 null.
- `.stage`: `position: fixed`, 1280×720, `transform: translate(x, y) scale(s)`, 원점 왼쪽 위, `overflow: hidden`. 남는 곳 = body 배경 `--letterbox` (레터박스). `html, body { overflow: hidden }` → **페이지 스크롤 없음**, 스크롤은 지정한 안쪽 목록만.
- **오버레이도 무대 안**: index.html 에서 `#app`, `#modal-root`, `#banner-root`, `#toast-root` 가 모두 `#stage` 안이다 → 모달·시트·토스트·배너·컷인이 무대와 함께 확대·축소된다. dom.js 는 바꿀 필요가 없었다. 오버레이는 `position: absolute`(무대 기준).
- **세로 창 안내**: `html.stage-portrait` 면 `.rotate-hint` "↻ 화면을 가로로 돌려 주세요" 가 위쪽 레터박스 가운데에 뜬다. 클릭을 막지 않고, 무대는 그대로 쓸 수 있다 (세로 화면 배치는 없다).
- 부트: 방향 스위치는 없다 (옛 `store.landOnly` · `resolveOrient` 는 §14.9 에서 삭제). `window.__soccer.stage` = 현재 fit (도구·디버깅용). 기존 훅(`store, run, match, render, actions`)은 그대로.
- 화면 종류 표시: `app.js render()` 가 `#stage[data-mode]` 를 `"match"`(경기 화면) / `"og"`(그 밖)로 둔다 → 경기 화면에서는 토스트가 오른쪽 위 좁은 칸 (§14.3 표).
- **규칙 (다음 작업자 필독)**
  - 무대 안에서 `vw / vh / dvh` 와 창 크기 media query 금지 — 실제 창 기준이라 배율과 어긋난다. 논리 px 나 % 로. (test/orient · test/outgame 이 CSS 를 검사한다)
  - 무대 안의 `position: fixed` 는 무대(transform 조상) 기준이다.
  - `clientWidth / clientHeight` 등 레이아웃 값은 논리 px, `getBoundingClientRect` 와 포인터 `clientX / clientY` 는 화면 px(배율 후) → 섞어 쓰지 말고 `toStage()` 로 바꾼다.
- 유니티 대응: 기준 해상도 1280×720 + Canvas Scaler(Scale With Screen Size) 와 같은 방식 (GDD 13.1). 16:9 가 아닌 기기의 남는 폭은 GDD 16-23 결정 대기.

### 14.2 CSS 파일 (`css/style.css` → 3개, 불러오는 순서 base → outgame → match)

| 파일 | 담당 | 내용 |
|---|---|---|
| `css/base.css` | 공용 | 디자인 토큰(`--letterbox`, `--stage-w/h` 포함) · 리셋 · 글자 도우미 · `.stage / .app / .rotate-hint / .loading` · `.screen`(넘치면 안쪽 스크롤) · 카드 · `.row / .col / .grow / .grid-*` · 버튼(`.btn-lg` 추가) · `.select / .input` · `.field`(라벨 + 입력 — 옛 초록 상자 규칙은 삭제) · avatar · grade(`.grade.xs` 추가) · badge · apt · rarity · `.bar` · `.list` · `.kv` · `.overlay / .modal`(기본 400px, `.modal-md` 480 · `.modal-lg` 880 · `.modal-xl` 1120) · `.sheet`(`.sheet-wide` 860) · toast · `.cutin` · `.error-panel` |
| `css/outgame.css` | 아웃게임 | 공통 `.screen.og`(무대 전체, 페이지 스크롤 없음) · `.og-head` · `.og-panel`(+ `dom.panel()`) · `.og-scroll`(안쪽 스크롤) · 시작 · 편성 · 훈련(상단 바 · 훈련 칸 · 선수 패널 · 행동 바 · 시트/모달) · 이벤트 · 유물 · 루트 · 결과. `.og` 가 없는 화면(오류 패널 등)은 가운데 760px 열 |
| `css/match.css` | 경기 | `:root { --home, --away, --ult }` · `.match-screen` 전부(잔디 · 규칙 영역 · 토큰 · 공 · 화살표 · HUD · 로그 서랍 · 컷인) · 미니 카드 · `.bar.ult` · `.avatar.ring-*` · reduced-motion · 경기 결과 모달(`.score-big`, `.result-verdict`, `.stats-table`) |

- 삭제: `vw / vh / dvh` 단위 전부, 폰 프레임(`min-width: 480px`), `.app.match-land`, `.match-screen.land · .orient-btn · .pitch-row · --screen-h`, 세로 경기 화면 규칙, 창 폭 media query(`max-width: 360px / 380px`).
- `--home / --away / --ult` 는 match.css 에 있다 — 아웃게임에서 쓰려면 base.css 로 옮긴다.
- 분리 검증: 같은 페이지에서 옛 style.css ↔ 새 3파일을 바꿔 끼워 캡처 → 정적 장면 픽셀 차이 0 (1280×720 · 390×844). base.css 를 아웃게임 개편 뒤 것으로 바꿔도 경기 화면 01·02·05·09·11·16 차이 0.

### 14.3 경기 화면 HUD (js/ui/screens/match.js · css/match.css) — 가로 전용

**방향 코드 삭제** — 세로 경기 화면이 없다. 화면 좌표는 전부 `toPx / fromPx / dirPx` → `fieldToScreen(x, y, W, H, 'land')`: home 골 왼쪽, away 골 오른쪽, home 은 오른쪽으로 공격, 필드 x 0 = 위 (세로 그림을 시계 방향 90° 돌린 것, 거울상 아님). `?orient=…` 와 옛 저장값 `soccer.orient` 는 무시한다.

**골격** (GDD 9.16 목업): `.match-screen` = 무대 전체. `.pitch`(잔디) = 무대 − 여백. HUD 는 전부 절대 위치로 잔디 위에 겹친다. **규칙 영역 `.m-field`** (구역·선·박스·골문·토큰·공·화살표 — 화면 위치 = 규칙 위치의 기준 사각형)는 위 HUD(헤더 + 트랙) 아래 · 아래 HUD(정보 줄 + 카드 줄) 위로 줄여, HUD 가 토큰·이름표·말풍선·미리보기를 가리지 않는다. CSS 변수(논리 px): `--pad 6 · --fx 12 · --ft 78 · --fb 102 · --mh-w 440 · --dock-w 842 · --side-w 196`.

| 요소 | 클래스 | 자리 (무대 px, 1280×720) |
|---|---|---|
| 잔디 | `.pitch` | inset 6 → 1268×708, 둥근 모서리. 줄무늬는 장식 |
| 규칙 영역 | `.m-field` | x 18~1262, y 84~612 = **1244×528**. 토큰 `TOKEN` = 규칙 영역 높이 × 8.3% (30~48px) → **44px** |
| 상황 배너 | `.m-banner` + `.m-banner-txt` | 전폭 띠 y 12~50. 글자는 헤더 왼쪽 칸(`right: 50% + 헤더 폭/2 + 10px`), 레벨 색(danger·crisis·chance·shotChance)은 띠 전체. 오른쪽 칸은 장식 |
| 스코어 헤더 | `.mh` | 가운데 440폭, y 4~59, 띠 위. 팀 이름 · 스코어 · 텐션 바 2개 · 아랫줄(경기 종류 · 포제션 · 공격 팀) |
| 공격 진행 트랙 | `.m-track` | y 63~80, 규칙 영역과 같은 좌우 끝, 칸 = 구역 폭 (home ①~④ = Z2→Z5 왼→오, away ①~④ = Z4→Z1 오→왼) |
| 아래 가운데 | `.m-dock` = `.m-info`(22px) + `.action-grid`(한 줄, 70px) | 842폭, bottom 10. 카드 최대 240px. 클래스 `action-grid k-atk\|k-def\|k-wide n-N [auto] [deciding]` |
| 컨트롤 | `.m-ctl` > `.match-controls` + `.m-remain` | 왼쪽 아래 196폭. 1줄 [자동][개입], 2줄 [배속][⏭][로그], 아래 남은 수비 칩 |
| 스킬 | `.skill-row` | 오른쪽 아래 196폭 × 높이 최대 96 (y 614~710 — 규칙 영역 아래 띠 안). 3개까지 세로(28px), 4개 이상 2열(`.many`: 칸 30px × 3줄 = 96, 이름 두 줄까지 · 일반 액티브 ⚡ 숨기고 ✦ 비용은 작게 표시 · 필살기 꼬리표만 숨김), 7개 이상(`.over`) 묶음 안 스크롤 |
| 로그 서랍 | `.m-logbox` | 규칙 영역 위 y 90~604, 폭 400. **공 · 공격 방향의 반대쪽 절반** (`placeLogBox`: 공 필드 y + 공격 방향 15 ≥ 50 이면 `.side-l` = 왼쪽 x 24~424, 아니면 오른쪽 x 856~1256). 기본 닫힘, 안쪽 스크롤, 긴 줄 줄바꿈, ✕ |
| 토스트 | `#toast-root` (base.css) | `#stage[data-mode="match"]` 이면 오른쪽 위 x 880~1256, y 12~ (배너 띠의 빈 오른쪽 칸 — 스코어 헤더 x 420~860 밖), 글 두 줄까지, 한 번에 2개 |
| 컷인 | `.m-cutin` | 무대 전체 |

**바뀐 동작** (엔진 계약·결정 객체는 그대로 — `{ action, receiverId? }`, `ultimate: true`, `{ skillId }`, `{ gaanpa }`)
- 배너: 따로 있던 줄 → 헤더 뒤 전폭 띠.
- 정보 줄(상대 예상 행동·근거 + 오른쪽 "우리: …"): 카드 줄 바로 위 반투명 띠.
- 로그: 늘 보이던 패널 → [로그] 버튼으로 여는 서랍. 열림 상태 `matchUi.logOpen`(store 에 선언) — 한 경기 안에서는 경기 화면을 다시 그려도 유지, 새 경기(`resetMatchUi` · 새 경기 생성)는 닫힌 채 시작, 새로고침하면 닫힘. 연출 중에도 여닫을 수 있다. 자리는 레이아웃마다(`applyLayout` → `placeLogBox`) 공 반대쪽으로 옮긴다 → 열어 둔 채 결정 차례가 와도 공 가진 선수 · 수비수 · 받는 선수 후보 · 화살표를 가리거나 후보 탭을 막지 않는다.
- 배속: 버튼 하나가 1x → 2x → 4x → 1x 로 돈다.
- 개입: 자동 OFF 이거나 경기가 끝났으면 `.off` (자리만 두고 숨김).
- 남은 수비 칩: 필드 구석 → 컨트롤 묶음 아래.
- 스킬: 오른쪽 아래 묶음. 클래스 `.skill-row` 는 유지(시나리오 셀렉터 호환). 엔진에 선수당 액티브 상한이 없어 개수와 무관하게 상자(96px) 안에 머문다 (위 표).
- 결정 카드: 2×2 / 3열 → 한 줄 (공격 켜진 것만 최대 4, 수비 3, 상태 안내는 넓은 카드 1장 `k-wide`). 카드 = 제목 + 기대 %, 성공·실패 짧은 문구, 약점 또는 판정 스탯, "추천"·"짝" 칩. 자동 진행 중에는 우리 선수의 성향값 카드.
- 결과 한 줄(pill): 토큰·공에 더해 이름표·말풍선도 피한다 (예상 행동 말풍선을 덮지 않게).
- 글자 크기 상수 `FONT`(이름표 12 · 말풍선 12 · 미리보기 12.5 · 결과 13 · 연계 16) = CSS 와 같게 (자리 고르기의 글자 폭 추정).
- 창 크기가 바뀌어도(연출 중 포함) 경기 화면을 다시 그리지 않는다 — 무대 배율만 바뀌고 규칙 영역은 논리 px 로 같다.

**가로 배치 규칙** (§13.9 에서 옮김, 유지)
- 구역 = 세로 띠(왼쪽 Z1 우리 박스 → 오른쪽 Z5 상대 박스, 경계 점선), 하프라인 세로, 박스·골문·페널티 스폿은 양 끝(`.bottom` = home = 왼쪽, `.top` = away = 오른쪽).
- `computeLayout(view, { aspect: H / W, tokenSize: (tok + 4) / H })` — H = 규칙 영역 높이(필드 폭), W = 길이. 무대 기준 0.424 / 0.091. test/layout 이 이 값과 옛 가로 범위(aspect 0.40~0.8)에서 겹침 없음·규칙 위치 불변식을 확인한다.
- 공 = 공 가진 선수의 공격 방향 앞 + 아래 대각선. 크로스 곡선은 필드 폭 축 가운데에서 먼 쪽으로 휜다. 뚫린 선수 추격 표시 ◀(home)·▶(away) = 자기 골 쪽.
- 이름표 자리 선호 = 아래 → 위 (가운데 → 듀얼 상대 반대편으로 비낌 → 반대쪽), 그다음 옆(듀얼 상대 반대편부터). 결정 대기 중에는 공 가진 선수 → 받는 선수(패스·크로스) 길을 6px 점 박스로 장애물에 넣는다(`previewLanes`). 미리보기 글자는 선 방향의 수직 양쪽이 먼저(`normalTips`). 결과 한 줄의 좌우 선호는 화면 기준.

### 14.4 아웃게임 (js/ui/screens/*.js · css/outgame.css)

공통: 한 화면 = 무대 전체(`.screen.og`), 페이지 스크롤 없음. 길어질 수 있는 목록만 안쪽 스크롤(`.og-scroll`). 패널은 `dom.panel(title, { right, cls, bodyCls, scroll }, ...children)` (dom.js 에 추가, 기존 export 는 그대로). labels.js 추가: `STAT_ICONS`, `ROUTE_ICONS`, `ROUTE_ICON_FALLBACK`. 게임 규칙·수치는 바꾸지 않았다 (표시만).

| 화면 | 배치 |
|---|---|
| 시작 `start` | 왼쪽 = 타이틀(잔디 배경) + 세 단계(편성 → 육성 24턴 → 경계전 3회, 숫자는 config). 오른쪽 = 메뉴 패널(새 런 / 이어하기 / 저장 삭제) + 등록 팀 목록(안쪽 스크롤) |
| 편성 `setup` | (v0.4.2: 드래그 라인업 보드 · 서포트 칩 · 선수 풀로 대체 — §15.8) 왼쪽 = 가로 미니 필드(home 골 왼쪽 — 경기 화면과 같은 방향). 슬롯 카드 7장을 포지션대로 GK 왼쪽 → FW 오른쪽, 같은 라인은 위아래로 고르게. 포메이션 선택은 패널 머리, 원소 공명·경고·빈 슬롯은 필드 아래. 오른쪽 = 서포트 카드 8장(2×4 — 데이터가 늘면 이 목록만 안쪽 스크롤, 전술·시작 패널은 늘 보임) · 전술 3항목 · seed · [기본 편성으로 시작] [런 시작]. 캐릭터 고르기 = 넓은 모달 2열 |
| 훈련 `training` | 상단 바: 시즌(x/3)·턴 + 턴 점(끝 ⚔) / 다음 상대 카드("N턴 후 경계전" · 마지막 턴 "이번 턴 뒤 경계전" · 행동 뒤 이벤트 "곧 경계전" · 이번 시즌 경계전을 치른 뒤(유물 모달 배경) "경계전 종료", 스타일 힌트·포제션·간파 사용권) / 상태 칩 4개(컨디션·팀워크·SP·호출권) + seed. 가운데: 훈련 칸 **5열 세로 카드** — 선수 두 줄(상승 합계 · 스탯별 상승 · 실패 %), 서포트 한 줄씩(★ 우정 · 💡 힌트 · 유대), 아래 스탯별 합계 · 상승 막대(가장 좋은 칸 기준) · 합계 · 실패 최대. 오른쪽 패널: 7명(체력 막대 · 5스탯 등급 · 부상) + 서포트 유대(80 문턱 표시). 아래 행동 바: [기록](유물·보정·로그 모달) · 휴식 · 외출 · 미팅 · 친선전 · 호출권 N |
| 훈련 팝업 | 상세 = 넓은 하단 시트(`.sheet-wide`, 선수 2열). 전술 미팅 = 3열 모달(전술 / 포메이션·포지션 / 스킬 상점 — 상점만 안쪽 스크롤. v0.4.2: 가운데 열 = 라인업 보드, §15.8). 호출권 = 선수 3열 → 칸 버튼 5개 한 줄 |
| 이벤트 `event` | 넓은 모달: 위 = 제목 · 등장 인물, 왼쪽 = 이야기, 오른쪽 = 선택지(효과 미리보기) 세로로. 배경은 훈련 화면 |
| 유물 `relic` | 모달, 후보 카드 한 줄로 나란히(카드 최대 270px, 가운데) |
| 루트 `route` | 위 = 시즌 진행 길(지난 결과 · 이번 시즌 강조 · 다음 시즌 점선), 아래 = 갈림길 선 → 루트 카드 3장 한 줄 |
| 결과 `result` | 왼쪽 = 등급 · 점수 구성(2열, 한 줄 = 관련 항목 한 쌍: 평균 스탯 / 습득 스킬 수 · 스킬 점수 / 팀워크 · 팀워크 점수 / 경계전 패배 · 패배 상한, 세로 선으로 나눔 — `result.js BD_ROWS`) · 경기 기록 · seed, 오른쪽 = 선수마다 한 줄(5스탯 격자, 시작 → 끝), 아래 = 버튼 한 줄 |

- 스모크 테스트·시나리오가 찾는 셀렉터는 유지: `.hero, .slot-cards, .slot-card, .slot-row, .recommended, #modal-root .sheet, .choice-btn, .relic-card, .route-card, .result-hero, .topbar, .next-match`, 버튼 문구 "닫기", "훈련하기", "미팅$", "^구매$".

### 14.5 테스트 (npm test 115 — rng 8, run 25, match 24, v05 24, layout 18, orient 5, stage 6, outgame 3, ui.smoke 2)

> v0.4.2 에서 136 으로 — §15.9.

- `npm test` = `node --test test/rng test/run test/match test/v05 test/layout test/orient test/stage test/outgame test/ui.smoke` (각 `.test.mjs`, package.json).
- `test/stage.test.mjs` (6): fitStage 여러 창 크기(한 배율 · 가운데 · 레터박스), 잘못된 입력(0·NaN·음수) → 1배, toStage 역변환, base.css `--stage-w/h` = stage.js, `tools/shot.mjs --only`(정확히 같은 이름이면 그것만, 아니면 접두어), 가로 전용(store 에 `resolveOrient`·`landOnly` 없음, app.js 가 경기 화면이면 `data-mode="match"`, base.css 에 `env(safe-area-*)` 없음, 토스트 2개까지, 경기 화면 토스트는 스코어 헤더 오른쪽 · 배너 띠 안).
- `test/orient.test.mjs` (5): match.js 에 방향 분기·store 방향 API import 없음, match.css 에 세로 규칙·⇄·창 크기 media query·vw/vh 없음, store.js 방향 API(`resolveOrient` 포함)·`landOnly` 없음 + `fieldToScreen` 기본값 = 가로 + `matchUi.logOpen` 선언 · `resetMatchUi` 가 닫음, 가로 좌표(home 골 왼쪽 · 필드 x 0 = 위 · 구역 왼쪽부터 Z1 → Z5), **HUD 배치 계약**(규칙 영역 = 위 HUD 아래 · 아래 HUD 위, 왼쪽·오른쪽 묶음과 가운데 카드 줄이 겹치지 않음, 배너 글자는 헤더 앞에서 끝남, 스킬 묶음 상자 위 끝 ≥ 규칙 영역 아래 끝 · 2열 3줄 ≤ 상자 · 7개 이상 `.over` 스크롤, 로그 서랍 `.side-l` 자리 · 폭 ≤ 규칙 영역 1/3).
- `test/outgame.test.mjs` (3): base.css·outgame.css 에 vw/vh/dvh·창 크기 media query 없음 · 옛 420px 열 규칙 없음, 편성 미니 필드 자리(모든 포메이션에서 GK < DF < MF < FW 왼→오, 같은 라인 위아래 균등·가운데), jsdom 걷기(시작 → 편성(3-1-2 변경·캐릭터 고르기) → 훈련(상단 바 · 칸 5 · 선수/서포트 줄 · 7명 패널 · 행동 6 · 상세 시트 · 기록 · 휴식 확인 · 미팅 select 5+1+7 · 호출권 두 단계) → og_event·og_relic·og_route·og_result 상태 주입: 전부 `#stage` 안, 오류 토스트·window 오류·console.error 0).
- `test/ui.smoke.test.mjs`: 부트가 무대를 세움 · `#stage[data-mode]` og → match → og, 루트가 무대 안, 1600×1000 배율 변수, 저장값·`?orient=port` 여도 가로, ⇄ 없음, 미니 카드가 무대 안, 세로 창 안내, resize(연출 중 포함)에 경기 화면을 다시 그리지 않음, HUD 영역이 있고 `.m-field` 밖, 컨트롤 5개, 로그 서랍 여닫기(연출 중 · 다시 그린 뒤 유지 · 경기가 끝나면 닫힘) · 자리(03 공이 우리 박스 → 오른쪽, 08 우리 공격 ③ → 왼쪽), 경기 종료 뒤 개입 숨김(자동 ON 이어도), 배속 4x→1x→2x→4x, 결정 객체 불변(`{action:"cross", receiverId}` · `ultimate: true`), 03 회귀(상대 ④ 슈팅)를 가로 기준으로, 17 스킬 7개 = `.many.over` · 라인 브레이커 ✦ 비용 / 16 스킬 4개 = `.many` 만.
- `test/layout.test.mjs`: 가로 범위에 무대 규칙 영역 비율(0.424 / 0.091) 추가, `fieldToScreen / screenToField` 기본값 = 가로 (18 테스트).

### 14.6 도구 (tools/shot.mjs · tools/scenarios.mjs)

- 기본 뷰포트 **1280×720, DPR 1**, 데스크톱(터치 없음) = 무대 1배. `--width / --height / --dpr` 로 다른 창(1920×1080 = 1.5배, 1600×900, 1024×576 = 0.8배, 세로 900×1200 = 0.703배 + 안내)을 확인한다. `--land` 는 받기만 하고 무시, URL 에 `orient` 를 붙이지 않는다. `07_desktop` 은 1280×900 고정(위아래 레터박스).
- 캡처 = 뷰포트만 (페이지는 스크롤하지 않는다). 출력: 시나리오마다 파일 · 무대 배율과 위치 · 페이지/안쪽 스크롤 · 상태 확인 · pageerror/console.error, 요약 표에 "배율" 열.
- 잘린 스킬 이름 검사: 말줄임(글자 Range 폭 > 요소 폭) + 2열의 두 줄 제한 넘침(`-webkit-line-clamp` 요소의 scrollHeight > clientHeight).
- 시나리오: 경기 `01_…`~`17_…` (형식 그대로 — `17_skill_row_many` = 실루엔에 액티브 6개를 더해 스킬 7개: 2열 · 묶음 안 스크롤 · 라인 브레이커 이름과 ✦ 비용) + **아웃게임 `og_*` 10개** — `og_start`(저장 런 없음 · 등록 팀 2), `og_setup`(새 런 시작 클릭), `og_training`(시즌 1 턴 1), `og_training_mid`(시즌 2 턴 7: SP 50 · 상점 8 · 우정 ★ · 힌트 💡 · 체력 70~100), `og_train_sheet`(추천 칸 클릭 → 상세 시트), `og_meeting`(전술 미팅 · SP 200 주입 · 첫 스킬 [구매]), `og_event`(서포트 이벤트 "바람의 스텝" 선택지 2), `og_relic`, `og_route`(시즌 1 종료), `og_result`. 기본 런 seed 1. `--only a,b` = 이름이 정확히 같은 시나리오가 있으면 그것만(`og_training` → `og_training_mid` 는 빼고), 없으면 접두어(`og` = 아웃게임 전부, `02` = `02_…`), `--list`.
- 아웃게임 시나리오 형식: `{ name: "og_…", title, outgame: true, build(data, { runSeed }) → { runState | null, teams?, summary }, steps: [{ click: css } | { text: regex } | { wait } | { drag } (v0.4.2 — §15.10)], ready: css, expect: { screen, phase?, modal? }, viewport? }`. `walkRun(data, { runSeed, require, prefer })` = 기본 진행(이벤트 0번 · 추천 훈련 · 자동 경기)으로 걸어가 조건에 맞는 첫 상태. steps 는 배율이 적용된 좌표에 실제 마우스 클릭 → 클릭 정확도도 확인한다.

### 14.7 검증 (구현 시점)

- `npm test` 114 전부 통과 (fix1 뒤 115 — §14.9).
- `shot.mjs` 26 시나리오(경기 16 + 아웃게임 10) 1280×720: 페이지 스크롤 없음 · 상태 확인 OK · 콘솔 에러 0. 경기 16/16 안쪽 스크롤·잘린 스킬 이름 0. 아웃게임은 전술 미팅 스킬 목록만 안쪽 스크롤(+228px). 1920×1080(경기 02·08·11·13, 아웃게임 10개) 배율 1.5 동일. 1024×576(배율 0.8) 읽힘 — 가장 작은 글자 화면에서 약 9px. 900×1200 세로 창: 레터박스 + 안내, 실제 클릭 정상.
- HUD 조사(임시 스크립트 hud_probe): 우리 결정 상태 150개(런 2 · 상대 7팀 · seed 3) × (그대로 + 카드마다 hover) — 토큰·이름표·말풍선·화살표가 HUD 와 겹침 0, 규칙 영역 밖 0, 잘린 글자 0, 페이지 오류 0.
- 실제 Chrome: 로그 서랍 · 미니 카드 · 자동 ON 개입 대기 · 결과 모달 · 골 연출 · 결과 한 줄, 1600×900 에서 받는 선수 탭 → 크로스 카드 = `{"action":"cross","receiverId":"p4"}`. 창 크기를 바꾸는 동안 배율·안내 갱신, 배율 0.70 에서도 클릭 위치 정확, 휠로 편성 목록 스크롤. 아웃게임 모달(캐릭터 고르기 · 호출권 두 단계 · 기록 · 휴식 확인 · 미팅)과 경계 상태(부상 선수 · 선수 2명 + 서포트 6장 칸 · 저장 런 있는 시작 화면 · 시즌 2 끝 루트 · 선수 없는 칸 상세) 잘림·오류 0.

### 14.8 남은 문제

1. ~~호환 코드 `store.resolveOrient()` · `store.landOnly`~~ → §14.9 에서 삭제.
2. `layout.js fieldToScreen / screenToField` 는 `'port'` 분기를 가진 채 남았다(순수 함수 + 테스트, 명시할 때만). 기본값은 §14.9 에서 `'land'` 로 바꿨다.
3. **필드 비율**: 규칙 영역 1244×528 ≈ 2.36:1 — 사용자 목업(약 1.4:1)보다 길다. 16:9 에서 위·아래 HUD 띠를 빼고 남는 모양 (GDD 16-24).
4. 배너 띠 오른쪽 절반은 장식(글자는 왼쪽 칸만).
5. 로그 서랍은 공 반대쪽 절반을 가린다(사용자가 열 때만, §14.9). 열림 상태는 새로고침에 저장하지 않는다. 공이 가운데를 넘나들면 서랍이 좌우로 옮겨 간다(비트마다 한 번까지).
6. 이름표가 이웃 토큰의 작은 연계 특성 아이콘 위에 올 수 있다(예: 시나리오 01 카샤 ↔ 도르비나) — 이번 개편 전부터 있던 자리 고르기 동작.
7. 아웃게임: 평범한 턴에는 훈련 칸 가운데가 비어 칸 아이콘 워터마크로 채웠다(다음 단계 = 선수 줄 키우기). [기록] 로그는 엔진이 보관하는 20줄(예전 화면은 마지막 8줄). 보정 배지는 여전히 키 그대로(`shootPower +5%`) — labels.js 에 한국어 이름이 필요. `view.recommendedAction === "rest"` 는 예전처럼 표시하지 않는다(새 동작이라 넣지 않음).
8. **폰 크기**: 데스크톱 기준이라 1280×720 무대의 글자 11~12px · 컨트롤 32px 가 6인치급 폰 가로에서 약 1mm · 3mm (계산값). 유니티 이식 전에 최소 글자·터치 크기를 정한다 (GDD 15 · 16-24).
9. 커밋에 함께 넣을 새 파일: `css/base.css, css/outgame.css, css/match.css, js/ui/stage.js, test/stage.test.mjs, test/outgame.test.mjs` (+ `git rm css/style.css` — 작업 트리에서만 지워져 있다). `npm test` 가 stage·outgame 을 요구한다. `art/style_test/` 는 그림체 시험 결과(9.4 MB — Pages 는 저장소 루트 전체를 올리므로 `git add -A` 로 섞지 말 것, 커밋 여부는 사용자 결정).
10. 이어하기(새로고침)로 경기를 되살리면 자동은 ON · 배속 1x 로 돌아온다(`matchUi.auto/speed` 는 저장하지 않는다 — 이번 개편 전부터 같은 동작).
11. 아웃게임 토스트는 위 가운데(한 번에 2개)라 3.5초 동안 그 아래 내용(다음 상대 카드 · 미팅 모달 제목 · 결과 화면 첫 줄)을 가릴 수 있다. 클릭은 막지 않는다.

### 14.9 검수 뒤 수정 (v0.3.2 fix1)

규칙·데이터 변경 없음 (`js/engine/*`, `data/*` 그대로). 화면 · 도구 · 테스트 · 문서만.

| 문제 | 고친 것 | 파일 |
|---|---|---|
| 스킬 7개 이상이면 2열 묶음이 96px 상자를 넘어 필드(상대 박스 구석)를 덮음 (엔진에 선수당 액티브 상한 없음) | 2열 칸 30px × 3줄 = 상자 96px, 7개 이상 `.over` = 묶음 안 스크롤. 스크롤이 없어진 경우 `many/over` 클래스도 지운다 | match.js `drawSkills`, match.css |
| 2열에서 "라인 브레이커" 가 "라인 브레…" 로 잘리고 일반 액티브의 ✦ 비용이 숨음 (터치는 title 을 못 봄) | 2열에서 이름 두 줄까지(낱말 단위) · ⚡ 숨김 · ✦ 비용 작게 표시. 도구의 잘림 검사에 두 줄 넘침 추가, 시나리오 17 | match.js · match.css · shot.mjs · scenarios.mjs |
| 로그 서랍이 늘 오른쪽 → 우리 공격 결정 때 공 가진 선수 · 받는 선수 후보 · 크로스 화살표를 가리고 후보 탭을 가로막음, 한 번 열면 다음 경기까지 열림 | 공 · 공격 방향의 반대쪽 절반에 연다(`placeLogBox`, `.side-l`), 폭 420 → 400. `matchUi.logOpen` 을 store 에 선언하고 `resetMatchUi` · 새 경기 생성이 닫는다. 실측(1280×720): 08 · 11 · 03 · 01 에서 carrier · defender · receiver 토큰이 서랍 아래 0, `elementFromPoint` = 토큰 | match.js, match.css, store.js |
| 로그 줄이 한 줄 말줄임 | 서랍 안 줄바꿈(`white-space: normal`, 낱말 단위) | match.css |
| 경기 시작 토스트(친선전 · 경계전 전야 결과)가 스코어 헤더와 필드 윗부분을 3.5초 가림 (최대 4개 쌓임) | 경기 화면이면 `#stage[data-mode="match"]` → 토스트를 오른쪽 위 x 880~1256 (배너 띠의 빈 칸)으로, 두 줄까지. 모든 화면에서 한 번에 2개만 보인다 | app.js `setStageMode`, base.css, match.css |
| 경기가 끝나도 자동 ON 이면 개입 버튼이 보임 | 종료면 `.off` | match.js `drawControls` |
| 결과 화면 점수 구성이 엔진 키 순서로 2열에 섞임 | 관련 항목끼리 한 줄(`BD_ROWS`), 오른쪽 칸 세로 선. 쓰지 않게 된 `dom.keyValue` · `frag` 삭제 | result.js, outgame.css, dom.js |
| 유물 선택 배경의 다음 상대 카드 "0턴 후 경계전" | "경계전 종료"(이번 시즌 경계전 기록이 있으면) · "이번 턴 뒤 경계전" · "곧 경계전"(이벤트) | training.js |
| 편성 서포트 목록이 데이터로 늘면 전술 패널 아래로 넘치고 [런 시작]이 밀림 | 서포트 패널만 `grow-panel` + 안쪽 스크롤, 전술 · 시작 패널은 `flex: none`, 오른쪽 열 간격 12 → 10 | setup.js, outgame.css |
| 시작 화면 [새 런 시작] 부제가 "24턴 · 3회" 고정 | config(`seasons × turnsPerSeason`)와 편성 슬롯 수로 | start.js |
| 호환 코드 `resolveOrient` · `landOnly`, `fieldToScreen` 기본값 `'port'` | 삭제 · 기본값 `'land'` | store.js, app.js, layout.js, test/stage · orient · layout · ui.smoke |
| 무대 안의 `env(safe-area-inset-*)`(창 px 가 배율과 곱해짐), 안 쓰는 `.screen-title` · `.card.selectable` · `.bar.thick` · `dom.section` | 삭제 | base.css, dom.js |
| `--only og_training` 이 `og_training_mid` 도 잡음 | 정확히 같은 이름이 있으면 그것만 (`selectScenarios` export, 테스트) | shot.mjs |

- 확인: `npm test` 115 통과. `shot.mjs` 27 시나리오 1280×720 페이지 스크롤 0 · 상태 OK · 콘솔 에러 0 · 잘린 스킬 0 (안쪽 스크롤 = 17 스킬 묶음 +33 · 미팅 상점 +228), 1920×1080 (02 · 08 · 11 · og_training · og_setup) 동일. 바뀌지 않은 장면(경기 01~05 · 08~12, 아웃게임 start · training · training_mid · train_sheet · meeting · event · route)은 이전 캡처와 픽셀 차이 0.

---

## 15. v0.4.2 — 크로스 짝 = 버티기 · 박스 연결(④) · 드래그 배치 (GDD v0.5 0.1 #56~61)

> 사용자 결정 (2026-09-29): ① 크로스의 짝 = 버티기 (패스 = 인터셉트) ② 크로스는 크로서만 (변경 없음) ③ 슈팅 찬스(④) 박스 연결 — 컷백·센터링, GK 와 판정, 실패 = 골킥, 포제션당 1회 ④ 자동 연결 조건 1.25배 / 필살기 ⑤ 편성·미팅 드래그 배치(초록/빨강), 편성 서포트 영역 축소 ⑥ **밸런스는 나중에 한 번에** — 이번 라운드는 수치를 맞추지 않고 시뮬만 기록 (§15.11).
> 이 절이 v0.4.2 의 구현 기준이다. §13.2 · §13.3 · §13.4 · §14.4 중 여기서 바꾼 것은 **대체**, 나머지는 유지. `MATCH_VERSION` 은 3 그대로 — 옛 저장 경기의 ball 에 `boxLinkUsed` 가 없으면 false 로 읽는다. 커밋 1dd0d8c. (v0.4.4 에서 바뀐 것: 15.2-6 실패 → GK 배급, 15.3 자동 규칙 → 기대 골, 15.6 gkMult 0.6 · autoRatio 삭제 — §17)

### 15.0 이번 라운드 소유권

| 담당 | 파일 |
|---|---|
| 경기 엔진 | js/engine/match.js, js/engine/ai.js, js/engine/skills.js, data/config.json(키 추가만), test/match.test.mjs, test/v05.test.mjs, tools/sim.mjs(박스 연결 줄), tools/scenarios.mjs(18 · 19) |
| 경기 화면 | js/ui/screens/match.js, js/ui/layout.js, js/ui/labels.js, css/match.css, test/layout.test.mjs, test/ui.smoke.test.mjs |
| 라인업(배치) | js/ui/lineup.js(신규), js/ui/screens/setup.js, js/ui/screens/training.js(미팅), css/outgame.css, test/lineup.test.mjs(신규), test/outgame.test.mjs, package.json, tools/shot.mjs(드래그 단계), tools/scenarios.mjs(og_*_drag/drop/reject) |
| 기획 | docs/GDD_v0.5.md, docs/ARCHITECTURE.md, README.md |

### 15.1 짝 표 (§13.2-1 · 13.2-4 대체)

- `COUNTER = { dribble: "tackle", pass: "intercept", cross: "hold", shoot: "hold" }`, `COUNTERED = { tackle: ["dribble"], intercept: ["pass"], hold: ["cross", "shoot"] }` (match.js export). shoot ↔ hold 는 파이널 서드 중거리만 — 박스 슛은 GK 와 1:1 이라 짝이 없다.
- `computeOdds` 수비 배율: hold vs cross = 짝(`pair "read"`) ×`match.holdVsCross`(없으면 readBonus). 수비 간파면 `max(readMult, holdVsCross)`, 공격 negateRead(꿰뚫어보기 · 스루 패스 · 필살 패스 · 간파 사용권)면 ×1.0 — 중거리 짝과 같은 처리. tackle · intercept vs cross = 빗나감 ×missMult (noMissPenalty 면 무시). hold vs dribble · pass = ×1.0 그대로.
- 짝을 쓰는 곳은 모두 `COUNTER` 를 읽으므로 따라 바뀐다: `bestDefenseResponse / bestAttackResponse`(AI 간파의 교체), `tools/choice.mjs` 정책(pair 등), 기대 % · 추천.
- 힌트 (`getAttackActions / getDefenseActions`): 크로스 "→ ○○ 헤더 · vs 버티기에 약함", 인터셉트 "(수비+패스)/2 · 패스 짝 ×1.7 · 빗나감 ×0.8 · 빠른 역습", 버티기 "수비 · 크로스 ×1.7 · 중거리 슛 ×1.5 · 역습 이점 없음(…)" (간파 readMult 면 그 이상으로 표시).
- `view.counter` = COUNTER 사본. 경기 화면의 "짝" 칩은 이것을 먼저 쓰고, 없을 때만 `labels.js COUNTER`(같은 값으로 고침 — ui.smoke 가 두 표가 같은지 본다).

### 15.2 박스 연결 규칙 (lineIndex 3)

1. **가능 액션** (`attackOptionsFor`): line 3 = shoot + (`ball.boxLinkUsed` 가 아니면) pass(후보 ≥ 1) · cross(carrier 가 crosser 이고 후보 ≥ 1). dribble 은 없다.
2. **후보** (`boxLinkCands`, carrier 제외, players 순서): pass(컷백) = FW 전원 + MF 중 **shoot** 최고 1명, cross(센터링) = `crossCands` 와 같다(FW 전원 + MF 중 **physical** 최고 1명). 동률은 슬롯 순서. `planFor(line ≥ 3)` → `{ arrival: 3, candidates, box: true }`.
3. **기본 받는 선수** (`defaultFromPlan` → `boxReceiverValue`): 마무리 값 최고. 마무리 값 = `receiverValue(arrival 3)`(pass = shoot × actionCoef.shoot × (1 + finisher), cross = 헤더 스탯 × actionCoef.header × (1 + targetman + finisher), 필살 패스면 합체기 ×shoot×comboBonus) × 받는 선수 자기 필살 슛(받은 뒤 게이지 = 지금 + onReceive · 필살 패스면 receiverGauge ≥ gaugeMax 면 ×ultimate.shoot). 결정 `{ action, receiverId? }` — 후보가 아니면 throw (§13.2-10 과 같다).
4. **판정** (`computeOdds`, `boxLink = line ≥ 3 && action ∈ {pass, cross}`): 공격 = 보통 pass / cross 공격값(cross = (패스+드리블)/2 × crosser +10%) × actionCoef, 보너스 합·필살기·boost 등 기존 규칙 그대로. 수비 = GK save 값 × `boxLink.gkMult` — 짝 · 빗나감 없음, **oneTouchGk 는 붙지 않는다**(연결 자체는 원터치 슛이 아님), 이번 듀얼에 커밋된 GK 필살 세이브(saveMult)는 붙는다. odds 에 `boxLink: true`.
5. **성공** (`successTransition`, `resolveDuel`): 공 line 3 그대로, carrier = 받은 선수, `oneTouch = true`, `receivedVia = "pass" | "cross"`(cross → 다음 슛 = 헤더), `receivedFresh = true`, `lastPasserId`, chain +1, 받은 선수 게이지 +onReceive(필살 패스면 receiverGauge, 받은 선수가 unique 보유자면 `comboReadyId`), 연계 특성(킬패스 nextDuelBonus 등)은 §13.2 그대로. extraLine(라인 브레이커)은 line 3 에서 추가 전진이 없다. 공격 팀 텐션 duelWin.
6. **실패**: GK 가 잡음 = 세이브와 같다 — ~~`counterPlan` GK 규칙(시작 0, distributor GK 면 1)~~ → v0.4.4 `counterPlan` GK = `distribution: true` → 그 GK 의 배급 대기(`from: "boxLink"`, §17.1), 수비 팀 텐션 save, 공격권 교대. 슛 수 · 슛 이벤트로 세지 않는다.
7. **포제션당 1회**: 판정 때(성공 · 실패 무관) `ball.boxLinkUsed = true`. `newBall` 이 false 로 시작 → 새 포제션마다 초기화. 그 뒤 line 3 = shoot 만.
8. **체력**: `staminaCost.pass / cross` 그대로.
9. **필살기** (`ultimateUsable`): pass 타입이 line 3 에서도 가능 — 연결(pass 또는 cross)이 켜져 있을 때만, 아니면 사유 "박스 연결은 포제션당 1회" / "연결할 동료 없음". 받은 선수가 필살 슛 보유자면 합체기(`comboReadyId`) → 다음 슛에서 comboBonus · combo 이벤트 (§13.2-12). shot · save 타입은 전과 같다.
10. **스킬** (`checkSkillUsable`): line ≥ 3 에서 간파가 아닌 `extraLine`(라인 브레이커)과 받은 선수 보너스가 없는 `negateRead` = 사유 "박스에서는 효과 없음". 간파(꿰뚫어보기 · 매의 눈)는 전처럼 "박스에서는 간파 불가". **스루 패스**(negateRead + `nextDuelBonus`, `skills.hasLinkBonus`)는 연결에 쓸 수 있다 — 짝 무효는 GK 상대라 의미 없지만 받은 선수 다음 듀얼 +25%가 원터치 슛·헤더에 붙는다(필살 패스 바람의 실과 같은 규칙, 리뷰 수정 2026-09-29). 연결을 이미 했으면 "박스 연결은 포제션당 1회". 다른 액티브(boost · rally 등)는 연결 판정에 붙는다. ai.js `effectSensible`: extraLine 은 line < 3 에서만, negateRead 는 line 3 이면 nextDuelBonus 가 있고 액션이 pass · cross 일 때만.

### 15.3 자동 규칙 — `boxLinkEval(state, data, side)` (A안 예외, §13.2-9 · §13.3 보완)

> **v0.4.4 에서 대체 — 기대 골 규칙 (§17.5).** 아래 비율 규칙(autoRatio · forced)은 기록으로 남긴다.

```text
shoot.value = carrier 의 line 3 슛 성향값 (받은 직후 특성 · 헤더 · AI 규칙상 쓸 필살 슛 · 합체기 포함)
[pass|cross]: r = 기본 받는 선수 (carrier 에게 필살 패스가 있고 aiWantsUltimate 면 필살 패스를 쓴다고 보고 고름 → ultimate: true)
  value  = boxReceiverValue(r).value × gkBasis          gkBasis = (carrier 가 원터치로 받았으면 oneTouchGk, 아니면 1) ÷ oneTouchGk
  forced = r 의 필살 슛 준비(합체기 포함) && carrier 에게 쓸 수 있는 필살 슛 없음
  score  = value ÷ autoRatio,  forced 면 max(score, shoot.value + 1e-6)   // 강제 연결은 tieAttack 순서와 무관하게 1위
auto.action = pickByTendency({ shoot: shoot.value, pass: score, cross: score }, tieAttack)   // 동률 → pass · cross 가 shoot 보다 앞
```
- 결과 `{ ratio, shoot: { value, ultimate }, pass | cross: { action, receiverId, value, score, forced, ultimate, receiverUltimate, combo } | null, auto: { action, receiverId, ultimate } }`. 결정적, 상대 선택 · 상대 스탯을 보지 않는다(GK 기준만 맞춘다), 난수 없음.
- **연결 조건** ⇔ 받는 선수 마무리 ≥ autoRatio × 내 슛 (같은 GK 기준) 또는 forced.
- 연결 방식: `tendencyValues` 가 line 3 carrier 의 pass / cross 값을 이 **score** 로 채운다(성향값 계산 `attackTendencyAt` 은 line 3 에서 shoot 만). 그래서 `autoAction`(사람 측 자동) · `ai.decideAttack`(상대 AI) · `expectedFor`(예상 행동)가 기존 "1위 액션" 코드 그대로 이 규칙을 따른다. `expected.attack.receiverId` = 커밋한 받는 선수, 없으면 boxLinkEval 의 받는 선수.
- 필살 패스: AI 규칙(도착이 박스면 사용)대로 연결에 함께 쓴다(`auto.ultimate`).
- 이미 커밋한 필살기(AI 는 판정 전에 먼저 커밋 — 게이지 0): `carrierUltFor` 가 커밋한 필살기를 "준비된 필살기"로 본다 → 커밋 뒤에 다시 계산해도(`view.boxLink`) 슛 값 · forced 가 커밋 전과 같다. `view.boxLink.auto` 는 커밋한 측이면 커밋한 선택 그대로 (리뷰 수정 2026-09-29).

### 15.4 getMatchView 추가 · 변경 (§13.4 보완)

```js
actions: [...]                  // line 3: pass label "컷백 패스", cross label "센터링", dribble 은 항상 off.
                                //   hint "→ ○○ 원터치 슛 · GK와 경합 (막히면 상대 골킥)" / "→ ○○ 헤더 · GK와 경합 (…)" — 괄호는 GK 배급 기준
                                //   (boxLinkFailHint = counterPlan: distributor GK 면 "막히면 상대 역습, ○○부터" — outcomes.fail 과 같은 규칙)
                                //   off 사유 "박스 연결은 포제션당 1회" · "크로서 특성 선수만" · "받을 동료 없음"
                                //   expectedPct = 득점 기대: shoot = 지금 골, pass·cross = 연결 성공 × 받은 선수 원터치 슛·헤더 골 (nextShotP — line 2 와 같은 경로)
receivers: { pass?: { candidates, defaultId, arrival: 3, zone, boxLink: true, ultimateDefaultId? }, cross?: {...} }
receiverPreview                 // line 3 에서도 (step 3)
outcomes.pass | cross (line 3): success { zone, attackingSide, step: 3, label "○○ 원터치 슛 찬스" | "○○ 헤더 찬스", short "성공 ○○ 원터치|헤더",
                                          receiver { id, name, side }, oneTouch: true, boxLink: true }
                                fail    { …, label "GK가 끊어냄 → 상대 골킥" | "GK가 끊어냄 → 상대 역습, ○○부터"(distributor), short, boxLink: true }
outcomesByReceiver · ultimateOptions(pass 타입) · outcomesBySkill · receiverPreviewBySkill · receiversBySkill   // line 3 에서도 채워짐
boxLink: { side, used, available, ratio, gkMult, shoot: { value, ultimate },
           pass | cross: { receiverId, value, score, forced, ultimate, receiverUltimate, combo } | null,
           auto: { action, receiverId, ultimate } } | null      // line 3 결정 대기 중만 (값은 반올림)
ballState.boxLinkUsed: boolean
expected.attack.receiverId      // pass · cross 일 때
counter: { dribble, pass, cross, shoot }   // = COUNTER (§15.1)
```
- 연결 힌트의 괄호는 실패 줄(outcomes.fail)과 같은 규칙이다 (리뷰 수정 전에는 늘 "골킥"이었다). 화면은 카드에 실패 줄이 이미 있어 약점 줄에서는 뺀다.

### 15.5 이벤트

- 연결 성공: `type "duel", success: true, action "pass" | "cross", defAction "save", boxLink: true, via, receiverId` — zone · step 그대로(3 → 3). text "A → B, 컷백 패스 성공! GK를 넘김 (p%) … — B 원터치 슛 찬스". `links` 에 oneTouch 없음(연결 자체).
- 연결 실패: `type "save", success: false, action "pass" | "cross", boxLink: true, receiverId, counterStart`, `toStep` 0 또는 1. text "GK, A의 컷백 패스를 끊어냄! (p%)".
- 연결 뒤 슛: `oneTouch: true`, 센터링 뒤면 `header: true` (기존 필드).
- tools/sim.mjs 는 `e.boxLink` 로 박스 연결을 세고, 성공 뒤 같은 포제션의 다음 슛을 "연결 뒤 슛"으로 센다.

### 15.6 config.match 추가 (튜닝값 — 이번 라운드는 [가정] 그대로)

```jsonc
"holdVsCross": 1.7,                             // 버티기 vs 크로스 짝 배율 (= readBonus, 따로 조정 가능). 없으면 readBonus
"boxLink": { "gkMult": 1.0, "autoRatio": 1.25 } // 연결 듀얼 GK 수비 배율 · 자동 연결 기준 배율 (없으면 1.0 · 1.25)
```
- v0.4.4: `"boxLink": { "gkMult": 0.6 }` — autoRatio 삭제(읽지 않음), §17.10.

### 15.7 경기 화면 (screens/match.js · layout.js · labels.js · css/match.css)

- labels.js: `COUNTER.cross 'intercept' → 'hold'` (유일한 기존 값 변경 — 옛 값은 "짝" 칩을 틀린 카드에 붙였다), 추가 `BOX_LINK_LABELS { pass: '컷백', cross: '센터링' }` · `BOX_LINK_ICONS { pass: '↩️', cross: '⤴️' }` · `BOX_LINK_FINISH { pass: '원터치 슛', cross: '헤더' }`.
- 결정 카드 (line 3): "컷백 → ○○ ▾" · "센터링 → ○○ ▾" · "슛", 꺼진 것은 숨김. % = `expectedPct`, 툴팁 "% = 득점 기대 (연결 성공 × ○○ 원터치 슛/헤더 골)". 성공·실패 줄 = `outcomes`. 약점 줄 "GK와 경합 · 포제션당 1회"(엔진 힌트의 "(막히면 상대 골킥)" 은 지운다). 연결 뒤에는 슛 카드만. "추천"은 다른 줄과 같다. 필살 패스 토글 가능 — 받는 선수가 필살 슛 보유자면 카드에 합체기 이름("💥 바람의 유성", 필살기 색).
- 정보 줄 · 말풍선: 박스 이름 — "우리: 센터링 → 그레타", "상대 키라 컷백 → 파냐 · 컷백 1031 > 슛 600". 툴팁은 `view.boxLink` 의 슛 값 · 연결 점수로 자동 규칙 설명. 자동 진행 중 카드 = "연결 점수" + 고른 받는 선수.
- 짝 칩: `view.counter`(없으면 L.COUNTER). 버티기 미리보기가 예상 크로스를 막을 때 ✕ 는 크로스 곡선의 떨어지는 자리 근처(인터셉트는 길 가운데). ✕ 가 이름표를 덮지 않게 자리 고르기.
- layout.js: line 3 후보 = 공과 같은 박스(박스 시작 + INSET), `validArrival` 이 step 3 → arrival 3 을 허용. 공 가진 선수와 레인 차이 < `BOX_LANE.gap`(16) 이면 `BOX_LANE.shift`(16) 만큼 비켜 선다 — 다른 후보가 적은 쪽(같으면 가운데 쪽), [10, 90] 안 (`boxLaneX`). 연결 성공 직후 배너 "★ 컷백! ○○ 원터치 슛 찬스, GK와 1:1" / 상대 "⚠ 상대 컷백! ○○ 원터치 슛 위기 …".
- 미리보기: 컷백 = 점선, 센터링 = 곡선, GK 가 나오는 흰 점선(`gkLane` — 끝점은 연결 길 위 0.55 → 0.45 → 0.65 → … 중 화살촉이 다른 토큰 위에 앉지 않는 첫 자리), 끝 글자 "→ 원터치 슛" / "→ 헤더"는 받는 선수 쪽(길의 0.8)에 — GK 화살촉 둘레는 비운다.
- layout.js `boxDepths` (리뷰 수정 2026-09-29): 박스 연결 후보마다 박스 가장자리(박스 시작 + INSET) 또는 **깊은 줄** `BOX_LANE.deep`(93.5 — 공 90 과 GK 97 사이, 먼 포스트) 중, 후보 ≤ 3명의 모든 조합을 놓아 보고 공 가진 선수 → 후보 선분이 다른 토큰 중심에서 `BOX_LANE.clear`(0.6) × 지름 안을 지나는 벌점(다른 후보 10 · 그 밖 3 · 뚫린 선수 1, 기본 받는 선수 ×2, 깊은 줄 1명당 +1)이 가장 적은 배치. 같은 레인 후보 둘(2-2-2 FW2 carrier → FW1 · MF1)이 겹쳐 서서 컷백 화살표가 다른 후보 위를 지나던 문제 해결. 같은 쪽 후보가 3명 이상(3-MF 포메이션의 MF carrier + 크로서)이면 기본 받는 선수의 화살표만 보장.
- 비트 연출: 성공 = 공이 받는 선수에게(직선 · 포물선) + "컷백!" / "센터링!" 문구 + GK 가 반쯤 나옴 → 결과 "A → B 컷백 성공 · 원터치 슛 찬스". 실패 = GK 가 패스 길로 나와 🧤 "○○ 캐치! 컷백 끊어냄"(필살 세이브면 "필살 캐치") → 기존 세이브 · 골킥 흐름. 세이브(연결 실패 포함)의 결과 한 줄은 재배치 뒤 공(골킥 · 빠른 배급이면 중원 역습 시작점)이 아니라 **잡은 GK 옆**.
- 수동(자동 OFF)의 연출 중: 다음 결정의 성향 카드("자동 선택")를 미리 보이지 않고 넓은 상태 카드 "⏳ (라인) · 연출이 끝나면 직접 고른다" (GK 세이브 자동 카드는 그대로).
- 우리 슛 이름: `actName` 이 엔진 액션 이름을 쓴다(센터링을 받은 뒤 "헤더", 파이널 서드 "중거리 슛") — 결정 · 성향 카드와 정보 줄 "우리: …" 가 같은 이름.
- 경기 화면 토스트는 가장 최근 1개만 (두 번째가 배너 띠 아래로 내려와 구역 트랙 ③·④ 칸을 가렸다).

### 15.8 라인업 보드 — `js/ui/lineup.js` (신규, 편성 · 미팅 공용)

**순수 도우미** (DOM 없음, test/lineup):

| export | 내용 |
|---|---|
| `DRAG_PX` = 6 | 이만큼(화면 px) 움직여야 드래그, 그 전에 떼면 탭 |
| `LINE_X`, `SPREAD_Y`, `slotSpot(slot, slots, { spread })` | 미니 필드 슬롯 자리 % (GK 12.5 → FW 87.5, 같은 포지션은 세로로 고르게). `spread`(편성 — 큰 카드, 보드가 `!compact` 로 넘김): 3명 줄은 15/50/85% (25/50/75% 면 88px 카드 사이가 몇 px 라 위 카드의 안내 알약이 아래 카드에 가렸다). setup.js 가 다시 export (호환) |
| `placeReason(pos, apt)` · `canPlay` · `badText` | 엔진 `validateSquad` 와 같은 규칙: 적성 '-' = "적성 없음", GK 는 A/B 만 = "GK는 A/B만". 빨강 글 "GK 적성 없음" · "GK C · GK는 A/B만" |
| `slotOfId(assign, id)` | assign(`{ 슬롯: 선수 id }`, 빈 슬롯은 키 없음)에서 선수의 슬롯, 벤치면 null |
| `resolveTarget(model, id, target)` | 놓은 곳 → 이동 `{ id, to }` (to = 슬롯 \| null = 벤치). target `{ slot }` = 그 자리, `{ player }` 필드 선수 = 그 선수 자리 · 벤치 선수 = 교체(벤치 선수가 내 자리로), `{ pool }` = 벤치로(bench 모델만) |
| `checkMove(model, move)` | `{ ok, reason, pos, apt, from, occupant, occPos?, occApt?, occReason? }` — 끈 선수가 새 자리에 설 수 있고, 밀려난 선수가 끈 선수의 원래 자리에 설 수 있어야 ok (벤치로 밀려나는 것은 늘 가능) |
| `applyMove(assign, move)` | 새 assign (원본 불변): 맞바꾸기 · 빈 슬롯 이동 · 벤치 투입(있던 선수 벤치로) · 벤치로 |
| `lineupIssues(model)` | 빈 슬롯 · 규칙 위반 `[{ slot, id, reason }]` |
| `reseat(assign, slots, aptOf, { fillAll, extraIds })` | 포메이션 변경: 남는 슬롯은 그대로, 없어진 슬롯 선수(+ extraIds)는 설 수 있는 빈 슬롯으로(적성 좋은 순 → 슬롯 순), 남으면 벤치. fillAll(미팅)은 남은 선수를 남은 슬롯에 순서대로(설 수 없으면 보드에 빨강) |
| `meetingSwaps(slots, assign, currentSlotOf)` | 미팅 액션 swaps = 슬롯 순서대로 `{ playerId, slot }`, 이미 그 자리인 선수 제외. 엔진 `resolveMeeting` 이 순서대로 적용하면 최종 배치 = assign |

**보드** `lineupBoard({ slots, assign, aptOf, nameOf, colorOf?, slotBody, onChange(next, move), bench?, ids?, poolBody?, compact?, onSlotTap? })` → `{ pitch, pool | null, addPoolZone(el), cancel() }`. 보드는 assign 을 바꾸지 않고 `onChange` 로 새 assign 을 넘긴다(화면이 다시 그린다).
- 드래그(포인터 이벤트 — 마우스 · 터치): 누른 뒤 DRAG_PX 를 넘으면 시작. 모든 놓을 곳(`.lu-slot`, `.lu-card`, 풀 영역)에 `drop-ok`(초록) / `drop-bad`(빨강) / `drop-origin`(지금 자리) 클래스와 `.lu-hint` 글("MF A · 타리아 벤치로", "GK B ⇄ 네리아", "MF A · 교체 투입", "벤치로" / 이유). 알약 자리: 편성 슬롯 = 카드 아래 걸침, 미팅 작은 카드 = 카드 바로 아래 빈틈(스탯 줄을 가리지 않게), 풀 카드 = 둘째 줄(희귀도 · 원소) 위(적성 줄 GK/DF/MF/FW 를 가리지 않게). 고스트 `.lu-ghost`(이름 + ✔/✖ — 마우스는 포인터 밑 자리의 알약이 보이므로 기호만, 터치 · 알약 없는 풀 영역은 글까지; 마우스는 포인터 오른쪽 · 세로 가운데 · 터치는 손가락 위)는 `#stage` 안에 논리 px — 포인터 clientX/Y 는 화면 px 라 스테이지 배율로 바꾸고, 놓을 곳 찾기는 `elementFromPoint`(화면 px 그대로). 빨강에 놓으면 `lu-shake` + 토스트 "놓을 수 없음 — 미르카: GK 적성 없음", 변경 없음. 보드 밖 · 끄는 중 Esc = 취소.
- 탭: 카드 탭 = 고르기(`lu-selected`, 같은 초록/빨강) → 자리 · 선수 · 풀 탭 = 놓기. 다시 탭 · Esc · 바깥 = 취소. 빈 슬롯을 먼저 누르면 그 자리에 올 선수가 초록/빨강. 포인터 탭은 pointerup 에서 처리하고 뒤따르는 click 은 무시(키보드 Enter/Space 는 click) — Chrome 터치 에뮬레이션에서 드래그 직후 첫 탭에 click 이 안 오던 문제 우회. 무시하는 click 은 뗀 자리 24px 안의 것만, 새 pointerdown 이 오면 그만(따라오는 click 이 안 만들어졌을 때 곧바로 누른 모달 버튼을 삼키지 않게).
- 화면 읽기: 고른 카드 `aria-pressed="true"`, 자리마다 `aria-description` = 알약 글("놓을 수 있음: MF A · …" / "놓을 수 없음: GK 적성 없음"), 필드 안 `.lu-sr`(role=status) 에 "○○ 선택 — 놓을 자리를 고르세요 (Esc 취소)". 편성의 다시 그리기(서포트 칩 등)는 먼저 `board.cancel()`.
- `onSlotTap`(편성만): 아무것도 고르지 않은 채 슬롯 탭 = 기존 선수 고르기 모달(초록/빨강 규칙 · 맞바꾸기 동일). 미팅은 없음 → 슬롯 탭 = 그 선수 고르기 (§15.12).

**편성 `setup.js`** (§14.4 편성 행 대체, 1280×720 페이지 스크롤 없음)
- 위 줄: ← 처음으로 · 편성 · 안내 한 줄("선수 카드를 끌어 필드 자리에 놓으세요 — 초록 가능 · 빨강 불가 …") · seed · [기본 편성으로 시작] · [런 시작].
- 가운데 왼쪽: `panel('포메이션 · 배치')` = 포메이션 select + 보드 pitch(큰 가로 필드) + 원소 공명 줄 · 경고. 오른쪽: 서포트 칩(2열, 초상 · 이름 · 레어도 · 타입 · 효율, 탭 = 선택/해제, 6/6 이면 제목 초록 · 나머지 비활성, 상세는 title 툴팁) + 전술 3행(라벨 + select).
- 아래: 선수 풀 줄(`panel("선수 N명 — 필드 7/7 · 벤치 K")`) = 보드 pool, 패널 전체가 `addPoolZone`(벤치로 놓는 곳). 카드 = 초상 · 이름 · 레어도 · 원소 · 스타일 · 특성 · GK/DF/MF/FW 적성, 배치된 선수는 슬롯 이름("MF1"), 벤치는 "벤치" + 주황 점선 테두리.
- 포메이션 변경 = `reseat`(벤치 있음). 시작 검증(빈 슬롯 · 서포트 수 · GK A/B)은 그대로.

**미팅 `training.js openMeeting`** (가운데 열)
- 7개 select → 보드(`compact: true`, 벤치 없음, 슬롯 카드 = 아바타 · 이름 · 주 스탯 또는 "← 원래 DF2" · 부상). 아래 안내 + "자리 변경 N명".
- 포메이션 변경 = `reseat(…, { fillAll: true, extraIds: 전원 })` — **이번 미팅에서 옮긴 배치를 유지**(전에는 런의 배치로 되돌렸다). 설 자리가 없는 선수는 빨강 "배치 불가", [미팅 진행] 은 `lineupIssues` 로 막고 옛 문구 토스트.
- [미팅 진행] = 엔진 액션 그대로, swaps 는 `meetingSwaps`. 상점 버튼 줄바꿈 없음. 모달이 닫히면 `board.cancel()`.

### 15.9 테스트 (npm test 137 — rng 8, run 25, match 24, v05 35, layout 20, orient 5, stage 6, lineup 9, outgame 3, ui.smoke 2)

- `npm test` = `node --test --test-isolation=process` + 위 파일들 (lineup 추가, package.json).
- **test/v05** (+10): 짝 표 · holdVsCross(간파 · 읽는 AI 가 버티기를 고름 포함) / 박스 연결 가능 · 후보 · 기본값 · receiverId · 포제션당 1회 / 연결 판정 = GK × gkMult / 성공 → 원터치 슛 · 헤더 · 연계 · 게이지 · 체력 · 이벤트 / 실패 = save(distributor 포함) / 필살 패스 박스 합체기 · 연결 뒤 필살 패스 불가 / 자동 규칙(비율 문턱 · 원터치 기준 · forced · carrier 필살 슛 · 합체기 · autoRatio 조정, 양 팀) / 미리보기 = 실제(expectedPct · outcomes · outcomesByReceiver) / ④ 스킬 / 자동 경기 불변식 · 결정성. 기존 cross↔intercept 단언 갱신.
- **test/match**: 1-FW line 3, receiverPreview 규칙, 이벤트 "toStep > step"(박스 연결 3 → 3 예외), away line 3 미리보기, line 3 outcomes(pass + shoot, 연결 뒤 shoot 만), 미리보기 = 실제 하네스(박스 연결 결정 20회 이상 포함).
- **test/layout** (+2): line 3 후보는 박스 안(이전 "공보다 앞" 대신), 박스 연결 후보 — 4 포메이션² × 양 팀 × carrier 전원 × 스테이지 비율: 박스 안 · 겹침 없음 · 레인 비키기, 연결 직후 배너(양 팀).
- **리뷰 수정 (2026-09-29)**: v05 +1 "박스 연결 뷰"(AI 가 먼저 커밋한 필살 슛이 view.boxLink 에 그대로 · 엔진 힌트 = GK 배급 기준), 자동 규칙 테스트에 강제 연결 × tieAttack 순서, ④ 스킬 테스트 = 스루 패스 가능(받은 선수 +25%, 연결 뒤 불가) · 꿰뚫어보기 불가. layout 박스 테스트에 화살표–다른 후보 거리 ≥ 반지름(스테이지 비율 포함) · 같은 레인 후보 둘은 가장자리/깊은 줄. lineup `slotSpot` spread, outgame 3-1-2 DF 15/50/85 · 화면 읽기(aria-pressed · aria-description · 알림) · 끄는 중 Esc.
- **test/ui.smoke**: 시나리오 18(카드 · 이름 · % · outcomes · 힌트 · 추천 · 정보 줄 · 박스 안 후보 · 두 미리보기 · 후보 탭 → `{ action: "pass", receiverId }` 결정과 결과), 19(연결 성공 뒤 "컷백!" 문구 · 결과 줄 · 슛만 · 배너), 11 의 "짝" 확인이 `view.counter` 를 쓴다, `view.counter` = `labels.COUNTER`.
- **test/lineup** (신규 9): 배치 규칙 = 엔진 validateSquad(무작위 400 · GK A/B), resolveTarget · checkMove(밀려난 선수도 맞아야) · applyMove(원본 불변), 무작위 드래그 1500번 → 늘 규칙에 맞고 createRun 통과, reseat, meetingSwaps → resolveMeeting 결과 = 보드(600 무작위 · 포메이션 4 · 이미 바뀐 배치 · run.applyAction).
- **test/outgame** (확장): 서포트 칩(6/6 이면 나머지 비활성), 선수 풀, jsdom 포인터 이벤트 드래그(초록/빨강 클래스 · 안내 글 · 고스트 · 놓기 · 거절 + 토스트 · 교체 · 맞바꾸기 · 벤치로), 탭 고르기 · Esc · 탭 놓기, 선수 목록 모달, 미팅 보드(빨강 · 초록 드래그, 모달 밖 놓기, 탭 맞바꾸기, "미팅 진행" = resolveMeeting 결과).

### 15.10 도구

- **tools/shot.mjs**: 아웃게임 steps 에 `{ drag: { from: css, to: css, release?, steps?: 12, waitMs?: 150 } }` — from 가운데 누르기 → 문턱 전 4px → to 가운데로 steps 번 나눠 이동 → release 면 놓기, 아니면 **누른 채 캡처**(끄는 중 초록/빨강 · 고스트). 좌표는 puppeteer boundingBox(화면 px) 그대로라 `--width/--height` 를 바꿔도 같은 곳에 놓인다.
- **tools/scenarios.mjs**:
  - 경기 `18_box_link_decision`(④ 결정 — 울리카(크로서) 컷백 24% / 센터링 31% / 슛 39%, 받는 선수 후보 박스 안, 컷백 hover) · `19_box_link_beat_mid`(컷백 성공 비트 중간 프레임, 클릭 600ms 뒤) → 경기 01~19.
  - 아웃게임 `og_setup_drag`(벤치 미르카를 MF2 위로, 누른 채) · `og_setup_drop`(놓음 → 타리아 벤치, ready 로 결과 슬롯 확인) · `og_setup_reject`(미르카를 GK 에 → 거절, GK 네리아 그대로) · `og_meeting_drag`(도르비나 DF1 → FW1 위, 누른 채) · `og_meeting_drop`(도르비나 → GK, 네리아 DF1 맞바꾸기) → 아웃게임 15개.
- **tools/sim.mjs**: 경기 표에 "박스 연결/경기 컷백/센터링 우리 · 상대", "박스 연결 성공률 · 다음 슛 골%", "박스 합체기/경기".

### 15.11 검증 (구현 시점)

- `npm test` 136 통과. `shot.mjs` 경기 19 + 아웃게임 15 시나리오 1280×720 페이지 스크롤 없음 · 상태 OK · 콘솔 에러 0. 드래그 5개는 1920×1080(배율 1.5)에서도 통과. 임시 puppeteer 스크립트(scratchpad `dragtest.mjs`)로 1280×720 · 1920×1080 · 1024×700(0.8) · 1920×1080 터치에서 모든 드래그 종류 · 거절 · 탭 · 목록 모달 · 미팅 맞바꾸기 · 모달 밖 놓기 확인. 추가 경기 장면(연결 뒤 · 컷백/센터링 실패 · 박스 합체기 · 상대 연결 · 크로스 수비)은 scratchpad `myscen.mjs` 로 캡처.
- 시뮬 (`node tools/sim.mjs --runs 300 --seed 1`, **수치 조정 없음** — GDD #61). 화면 작업은 시뮬에 영향 없음(두 화면 담당 모두 같은 값):

| 지표 | 전 (v0.4.1) | 후 (v0.4.2) |
|---|---|---|
| 시즌 승률 | 78.0 / 58.3 / 37.7% | 84.0 / 63.7 / 44.3% |
| 골/경기 (우리 / 상대) | 2.75 (1.46 / 1.30) | 2.48 (1.43 / 1.06) |
| 필드 듀얼/경기 | 15.8 | 15.7 |
| 필살기 보유자당 | 0.81 | 0.96 |
| 합체기/경기 | 0.55 | 0.57 |
| 크로스/경기 (성공률) | 0.37 (63%) | 0.37 (52%) |
| 헤더 슛/경기 | 0.24 | 0.62 |
| 박스 연결/경기 컷백 · 센터링 (우리 / 상대) | — | 0.22 · 0.71 / 1.28 · 0.00 |
| 박스 연결 성공률 · 다음 슛 골% | — | 52.5% · 78.3% |
| 박스 합체기/경기 | — | 0.018 |

- 변화는 거의 전부 자동 연결 규칙에서 온다: `autoRatio` 99(자동 연결 사실상 끔) → 77.0 / 57.7 / 39.7%, 골 2.64. 1.6 → 78.7 / 56.7 / 35.0%, 2.62 · 2.0 → 79.7 / 55.3 / 37.3%, 2.67. 상대 AI 의 MF carrier 가 박스에서 FW 에게 자주 넘겨 상대 골이 줄었다.
- 조사(우리 박스 찬스 182개): 자동이 76% 에서 연결, 평균 득점 기대 55.1%(항상 슛) → 47.4%(규칙대로). 규칙이 공격값만 비교하고 연결 실패를 보지 않기 때문.

### 15.12 남은 문제 (GDD 16-25~28)

1. ~~**자동 연결 조건**이 득점 기대를 낮춘다(위). 시나리오 18: "추천" = 슛 39%, 자동 = 센터링 → 그레타 31%.~~ → v0.4.4 기대 골 규칙 · GK ×0.6 (§17.5). 시나리오 18: 추천 = 자동 = 센터링 → 그레타 41%.
2. **라인 브레이커 모멘텀**: 라인 브레이커로 박스에 들어온 슛 +20%(extraLine)가 연결 뒤 받은 선수의 슛에도 이어진다 (규칙 그대로 둠 — 지울지 결정 필요).
3. **GK 필살 세이브**는 슛인지 연결인지 모른 채 먼저 커밋되어, 연결이 오면 연결 듀얼에서 쓰인다.
4. ~~엔진 힌트 문구~~ → 리뷰 수정: GK 배급 기준 (§15.4).
5. **화면**: ~~뚫린 수비수 · 다른 후보 위를 지나는 연결 화살표~~ → 리뷰 수정 `boxDepths` · `gkLane` (§15.7). 연결 뒤 재배치에서 받은 선수가 박스 자리 → 공 자리로 한 번 움직인다(그대로).
6. **시나리오 부족**: 박스 합체기 · 상대 연결 · 연결 실패 · 크로스 수비 장면은 `tools/scenarios.mjs` 에 없다 (scratchpad `myscen.mjs` 에 임시판).
7. **라인업**: 편성은 "고른 것 없이 슬롯 탭 = 선수 목록 모달", 미팅은 "슬롯 탭 = 그 선수 고르기" — ui.smoke 의 기존 단언 때문. 통일하려면 그 테스트를 바꾼다. 캐릭터가 8명을 넘으면 선수 풀 줄이 가로 스크롤되고, 터치에서는 카드 사이 틈에서만 밀린다(카드 위는 드래그).
8. 커밋에 함께 넣을 새 파일: `js/ui/lineup.js`, `test/lineup.test.mjs` (`npm test` 가 lineup 을 요구한다).

---

## 16. v0.4.3 — 에이스의 외침 (표시 전용) · 필살기 3단 연출 (GDD v0.5 0.1 #62 · §9.17-5·6)

> 사용자 결정 (2026-09-29): "에이스의 외침은 넣어보자". 받으면 필살기가 준비되는 · 합체기가 되는 받는 선수가 "줘!"를 외치고, 공 가진 선수 → 그 선수 금색 점선 + 배지. **표시 전용** — 판정 · 자동 선택(A안 · boxLinkEval) · AI · 난수 소비는 그대로. 같은 날 필살기 연출을 3단(차지 → 컷인 → GK 가 막으면 역방향 컷인)으로 (아트 전 틀).
> `MATCH_VERSION` 3 그대로 (상태 모양 변경 없음). config 키 추가 없음 — `match.ultimate.aceCallGauge` 는 **읽기만**(없으면 `gaugeMax − onReceive`, 그래서 onReceive 를 바꾸면 문턱도 따라간다). 문턱을 따로 올리려면(GDD 16-29 ③) `data/config.json` 의 `match.ultimate` 에 `"aceCallGauge": 80` 처럼 키를 넣는다. 커밋 9d58905. (③ 역방향 컷인은 v0.4.4 에서 3종 — §17.8)

### 16.1 엔진 — `aceCallFor(state, data)` (match.js export) · `view.aceCall`

```text
대상: state.phase "decision" · duel 있음 · 끝나지 않음. side = attackingSide (양 팀 공격 모두), carrier = ball.carrierId
fx = 이번 듀얼 공격 효과 (fxOf) — 라인 브레이커 등으로 도착이 바뀌면 그 기준
액션: attackOptionsFor(...) 의 pass · cross 중 켜진 것 (④ 면 박스 연결 — boxLinkUsed 면 없음)
필살 패스: fx.ult 가 pass 면 그 skillId(AI 가 먼저 커밋 — 게이지 0), 아니면 carrier 의 pass 필살기
  passReady(액션) = 커밋했거나 ultimateUsable(carrier, "attack", 액션).ok
후보 p (planFor(...).candidates, players 순서) — 받는 선수 필살기 u 가 받은 뒤 쓸 수 있을 때만:
  ultTypeUsableAt(u.type, plan.arrival) && !(plan.box && u.type === "pass")   // 박스 연결로 받으면 연결을 이미 써서 필살 패스 불가
  reason "combo" : passReady && comboName(data, 필살 패스 id, u.id) (combos.json — 목록에 없는 조합은 합체기 외침이 아님)
  reason "gauge" : gauge(p) ≥ aceCallGauge (config.match.ultimate.aceCallGauge ?? gaugeMax − onReceive = 65)
예상 공격 = 커밋한 선택(committedAction || action, receiverId) — AI 는 먼저 커밋, 없으면 ai.decideAttack (사람 측 자동과 같은 함수, 순수)
커밋한 공격(상대 AI — 사람이 고르기 전에 이미 커밋)이면 후보를 (커밋한 액션, 커밋한 받는 선수) 하나로 좁힌다
  → 그 선수가 조건에 맞으면 외침, 드리블 · 슛 커밋 / 다른 선수에게 보냄 / 커밋한 AI 가 간파 중(판정 때 액션을 바꿀 수 있음)이면 null (상대 외침 = 실제로 공이 갈 곳, expected 늘 true). UI: 공 가진 선수 둘레에 금색 점선 고리(.ace-origin, 위 층) — 마커 토큰이 점선 첫 구간을 가려도 출발점이 보이게
  사람 측은 결정 전이라 커밋이 없다 → 아래 우선순위 그대로
하나 고르기 (비트당 한 명): [combo 0 / gauge 1] → [그 액션의 기본 받는 선수 0 / 아님 1] → players 순서
  기본 받는 선수 = defaultFromPlan(combo 는 필살 패스를 쓴다고 본 fx — 합체기 가치, gauge 는 fx 그대로)
actions = 그 선수에게 같은 이유로 닿는 액션 (["pass"] · ["cross"] · ["pass", "cross"], 커밋한 측은 커밋한 액션 하나)
expected = 예상 공격이 그 선수에게 가는가 (액션 ∈ actions && receiverId = 그 선수)
```

```js
view.aceCall = null | {
  side, playerId, name,
  reason: "gauge" | "combo",
  actions: ["pass"] | ["cross"] | ["pass", "cross"],
  arrival: 1..3, boxLink: boolean,             // 받는 도착 단계, ④ 박스 연결인가
  ultimateSkillId, ultimateName, ultimateType, // 받는 선수의 필살기 ("sk_meteor_shot", "메테오 슛", "shot")
  comboName: string | null, passSkillId: string | null,   // 합체기면 이름 · carrier 의 필살 패스
  gauge: number | null, threshold: number,     // 받는 선수 지금 게이지 · 문턱
  expected: boolean, expectedAction: "pass" | "cross" | null,
}
```
- 결정적, 상태 · 난수 불변(뷰 규약 §12.1 그대로). 상대 선택을 보지 않는다 — expected 와 커밋 좁히기는 **공격 팀 자기** 선택(상대 공격이면 이미 공개된 `expected.attack` · 인터셉트 미리보기와 같은 정보라 새로 드러나는 것이 없다).
- 커밋 좁히기 이유 (리뷰 2026-09-29): 처음에는 상대도 우선순위로 골라, 상대 FW · MF 에 필살기를 넣은 친선 200판에서 상대 외침 445개 중 183개(41%)가 AI 가 커밋한 받는 선수가 아니었다(110개는 드리블 · 슛 커밋). 금색 점선이 인터셉트 화살표(실제 받는 선수)와 다른 선수를 가리켜 수비 선택을 잘못 이끌 수 있었다.
- 확인: 같은 시드 → 같은 경기 (scratchpad `baseline.mjs` — simulateAuto · 매 스텝 양쪽 getMatchView 후 step, 친선 · 목표 경기 20판 + 런 1개 JSON 해시 전/후 동일; 리뷰 수정 뒤 `review_det.mjs` — HEAD 1dd0d8c 엔진과 192경기 · 런 3개 JSON 동일), 시뮬 300런 출력 동일.

### 16.2 화면 — 외침 (screens/match.js · css/match.css)

- `aceInfo(view, Lay)`: 외치는 토큰 R · 공 가진 토큰 C (공격 팀 = aceCall.side 일 때만). 점선 모양 = expectedAction(있으면) → pass 가 있으면 직선, cross 로만 닿으면 포물선(`curveCtrl` — 크로스 미리보기와 같은 곡선). 글: combo = `💥 {comboName} 가능`, gauge = `★ 연결하면 {ultimateName}`.
- **말풍선** "줘!" (`ACE_BUBBLE`): 기존 토큰 말풍선(`.tok-bubble`)을 외치는 토큰에 — `.tok.calling`(금색, 살짝 뜀). `placeTags(Lay, named, bubbles[], lanes)` 가 말풍선 여러 개를 받는다(상대 예상 행동 → 외침 순서). 외치는 선수는 이름표도(자동 진행 중 예상 받는 선수가 아니어도). 말풍선 자리 고르기가 토큰 오른쪽 위 **연계 특성 아이콘**(tokenRect 밖)도 피한다(무게 0.6 — 모든 말풍선 공통).
- **점선** (`.g-ace`, 아래 SVG 층 — 미리보기 화살표 `.g-arrow` 아래, `hideArrow` 가 지우지 않음): 금색 둥근 점(`stroke-dasharray .1 8`) + 어두운 테두리 점, 합체기는 분홍(`.ace-line.combo` · `.ace-badge.combo` — 그룹에는 클래스 없음). 양 끝은 토큰 반지름만큼 비운다. 이름표 · 말풍선 자리 고르기의 장애물(점 박스, 무게 0.5).
- **배지** (`.g-ace-tip`, 위 SVG 층): 둥근 사각 + 글 12px. 후보 순서 = ① 점선 위 0.5 · 0.4 · 0.6 · 0.3 · 0.7 · 0.2 · 0.8 지점의 양옆(점선에서 5px) ② 외치는 선수 너머(점선 방향) · 그 선수 위아래 ③ ①을 한 칸(배지 높이 + 4) 더 바깥 ④ 점선 위. 토큰 · 이름표 · 말풍선 · 공 · 점선 점(0.3)을 가리지 않는 첫 자리, 없으면 가장 덜 가리는 자리(`pickSpot`). 그래도 겹치면(점수 > 40) 짧은 글 `★ {ultimateName}` / `💥 {comboName}` 이 40 이상 나으면 그것 (짧은 점선이 붐비는 빌드업 등). 놓인 배지 박스(`role: 'ace'`)를 `tagBoxes` 에 넣어 결과 한 줄 · 연계 문구 · 미리보기 글자가 피한다(`clearAce` 가 뺀다).
- **숨김**: 같은 받는 선수에게 가는 미리보기(공격 패스 · 크로스 화살표, 수비 인터셉트 · 크로스 버티기 길)가 떠 있는 동안 `.m-field.ace-off` (점선 · 배지 display none, 미리보기 글자는 숨긴 배지를 피하지 않음). `hideArrow` 가 해제. 상대 외침은 늘 AI 가 커밋한 받는 선수라(§16.1) 우리 인터셉트 미리보기 길 = 외치는 선수 → 인터셉트를 누르는 동안은 늘 숨김.
- **차지 중**: `.m-field.charging .pitch-svg` 흑백(grayscale 1 · brightness .55 — 흑백 토큰과 같게). 막(`.charge-veil`)과 선 SVG 가 같은 z(1)라 선이 막 위에 그려지고, 배지 SVG(`.top`, z 7)는 토큰 위라서 이것이 없으면 판정 비트 뒤 AI 필살기 차지(재배치 뒤 — 다음 결정의 외침이 이미 그려짐) 동안 금색 점선 · 배지가 필드에서 가장 밝았다(보스 경기 GK 볼카라 불꽃 장벽 ↔ 우리 그레타 외침).
- **나타남 · 걷힘**: `applyLayout` 이 매번 다시 그린다. 모양 서명(선수 · 글 · 양 끝 좌표)이 바뀌었고 애니메이션이면 `.fade` — 재배치(`--t-move`)가 끝난 뒤 0.3초 페이드 인(연출 중 토큰이 달려가는 동안 선이 먼저 서지 않게). 같으면 그대로. `animateBeat` 시작 = `clearAce()` (점선 · 배지 · "줘!" 걷음) → `movePhase` 재배치 때 다음 결정의 외침.
- **정보 줄**: 자동 진행(`ui.auto` · 결정 대기 아님)이고 우리 공격 · `aceCall.side` = 우리 · `expected` 면 오른쪽 "우리: …" 자리에 `자동: {name}에게 연결 예정` (`.mine.ace` 금색, title 에 이유). 그 밖에는 아무것도 더하지 않는다.
- 접근성: 외치는 토큰 aria-label 에 `· "줘!" {이유}`, 말풍선 title = 이유 ("그레타: 받으면 필살기 [메테오 슛] 준비 — 게이지 100 (패스)").

### 16.3 화면 — 필살기 3단 연출

| 단계 | 1x 길이 | 내용 |
|---|---|---|
| ① 차지 | 0.4초 (이후 0.3) | `.m-field.charging`: 잔디 전체 막(`.charge-veil` — 규칙 영역보다 넓게, backdrop 흑백) + 나머지 토큰 · 선 · 배지 SVG 흑백, 사용자 `.charge-user`(빛나며 커짐 · 게이지 링 퍼짐, `--t-charge`), 듀얼 상대 `.charge-foe`(색 그대로). HUD 는 그대로 |
| ② 컷인 | 1.0초 (이후 0.9) | 기존 컷인 카드 (`T.cutin` 1500 → 1000). 합체기는 차지 뒤 두 컷인 `T.comboCut` 1000 × 2 + 이름 `T.comboName` 1100 그대로 |
| ③ GK 역방향 컷인 | 0.8초 | 판정 비트가 필살 슛(`ev.ultimate` 의 스킬이 shot)을 GK 가 막은 `save`(박스 연결 실패 제외)면, 액션(다이브) + hold 뒤 · 재배치 전에 `.cut.cut-save` — GK 팀 쪽에서 들어오고(필살 슛 컷인의 반대 방향), 반대 기울기 · 차가운 색, "기적의 세이브!". **GK 만** (`ultShotSaved`): ③ 파이널 서드(line 2)의 필살 슛은 DF 와 판정해 막히면 `turnover`(DF 블록)라 없음 — 자동 친선 300판 막힌 필살 슛 61 중 50(82%). DF 블록판은 GDD 16-30 결정 대기 |

- "첫 필살기" = 이번 비트 전 `store.match.events` 에 `cutin` 이 없음 (저장 · 이어하기에도 같은 판정). 같은 비트에서 두 번째 컷인(판정 뒤 AI 가 먼저 커밋한 필살기)은 짧게.
- 차지의 듀얼 상대: 판정 비트 앞 컷인 = 이번 듀얼(`main.playerId` ↔ `main.defenderId`), 뒤 컷인 = 다음 듀얼(`nextView.carrier` ↔ `nextView.defender`). 사용자가 수비(필살 세이브)면 상대 = 공 가진 선수.
- `cutSeq(evs, { first, duel })` → 카드 `{ kind: 'charge' | 'cut' | 'name' | 'gksave', dur }`, `playCuts` 가 차지는 `showCharge`, 나머지는 `endCharge` + `showCut`. 바닥 길이 `CUT_MIN` = 차지 60 · 카드 200ms (배속 반영 뒤) — 4x 에서도 걸리지 않아 비율이 그대로다(차지 100/75, 컷인 250/225, GK 세이브 200; 처음 구현의 100 · 250 바닥은 4x 에서 첫 필살기와 이후를 같게 만들었다). 전부 `1/speed` 비례, ⏭(`skip` → `hideCut` → `endCharge`) 이면 생략. `prefers-reduced-motion` 이면 차지 · 외침 애니메이션 없이 정지 모양.

### 16.4 테스트 (npm test 139 — rng 8, run 25, match 24, v05 37, layout 20, orient 5, stage 6, lineup 9, outgame 3, ui.smoke 2)

- **test/v05** (+2): 외침 규칙 — 문턱(64 없음 / 65 있음, 이미 가득도, `aceCallGauge` 40, onReceive 50 → 기본 문턱 50), 받은 뒤 못 쓰는 필살기 제외(도착 ① 필살 슛 · 박스 연결로 받는 필살 패스), 합체기 > 게이지(필살 패스가 준비 안 되면 게이지 외침), 비트당 한 명 = 기본 받는 선수 · 동률 players 순서, ④ 박스 연결(컷백 + 센터링), 크로스로만 닿는 MF, 상대 공격(AI 가 FW1 에게 패스 커밋 → 외침 · expected true · 보는 쪽과 무관 / 드리블 커밋 → null / FW2 에게 패스 커밋 → FW1 외침 없음, 같은 배치의 우리 공격은 결정 전이라 우선순위대로 FW1 · expected false), 없음(보유자 없음 · 끝 · resolved), `aceCallFor` = `view.aceCall`. 표시 전용 — 상대 3팀 × 시드 3: 매 스텝 양쪽 뷰가 상태를 바꾸지 않고, 뷰를 만들며 진행한 경기 = `simulateAuto` 경기(JSON 동일), 외침 선수 ∈ 그 액션의 후보, 상대 외침 = 커밋한 받는 선수.
- **test/ui.smoke**: 시나리오 20(말풍선 한 명 · 이름표 · 점선 · 배지 글, 외치는 선수를 골라 패스 미리보기 → `ace-off`, 드리블 미리보기는 그대로, 결정 → 연출 중 외침 걷힘 · 결정 `{ action, receiverId }` 그대로), 21(상대 받는 선수 "줘!" = 커밋한 받는 선수 · 상대 carrier 예상 행동 말풍선 그대로 · 인터셉트 미리보기 중 숨김 → 떼면 다시 · 자동 문구 없음), 12 자동(합체기 배지 "💥 바람의 유성 가능" · 정보 줄 "자동: 그레타에게 연결 예정") / 수동(문구 없음, 외침은 보임), 22(필살 슛이 막히는 주사위를 넣고 → 차지 사용자 = carrier · 상대 = GK → 컷인 → "기적의 세이브!" → 닫힘).

### 16.5 도구

- **tools/scenarios.mjs**: `20_ace_call`(우리 ② 결정 — 실루엔 → 그레타 "★ 연결하면 메테오 슛", 게이지 100), `21_ace_call_opponent`(상대 FW 에 업화의 일격을 `adjustSetup` 으로 주입 — 친선 상대에는 필살기가 없다. 우리 수비 결정 중 상대 AI 가 패스를 커밋한 로웨나 "줘!"), `22_ult_charge_mid`(메테오 슛 토글 + 슛 클릭 150ms 뒤 = 차지 중간, 경기의 첫 필살기 · ④). `13_combo_cutin` 캡처 2400 → 2800ms (차지 0.3초가 앞에 붙어 이름 카드 2.3~3.4초). → 경기 01~22.

### 16.6 남은 문제

1. **외침 빈도**: 기본 편성 자동 60판에서 우리 공격 결정의 20.5%(212/1034) — 그레타 111 · 실루엔 101. 실루엔(필살 패스)은 게이지가 찬 채로 받지 못하고 외침을 반복한다 (③ 크로스 후보 · ① 패스 후보). 좁히는 안: 필살 슛만 · "이번 패스로 차는 경우만" · 문턱 상향 (GDD 16-29).
2. 합체기 외침은 `combos.json` 조합만 — 엔진은 목록에 없는 조합도 "합체기"로 쓰지만(`comboName` 없으면 "합체기"), 외침은 게이지 규칙으로만 뜬다.
3. ~~외침은 상대가 필살 슛을 이미 커밋했어도 뜬다~~ → 리뷰 수정: 커밋한 측은 커밋한 받는 선수만 외친다 (§16.1). 드리블 · 슛을 커밋하면 상대 외침 없음.
4. 차지 막(`backdrop-filter`)은 Chrome 기준. 지원하지 않는 브라우저에서는 어두운 막만(토큰 · 선 흑백은 그대로).
5. ~~③ 역방향 컷인은 GK 세이브만 — 파이널 서드의 DF 블록(막힌 필살 슛의 82%)에는 없다.~~ → v0.4.4 GDD #68: 철벽 블록 · 필살 패스 차단 추가 (§17.8).
6. 결정성 테스트(`test/v05` 표시 전용)는 같은 엔진끼리 비교라 "뷰에 부작용 없음"만 보장한다. HEAD 대비 같은 결과는 scratchpad 스크립트로 확인했다 — 규칙 변경이 잦은 동안은 고정 골든 값을 두지 않는다(밸런스 작업 뒤 필요하면 추가).

---

## 17. v0.4.4 — GK 배급 · 박스 연결 기대 골 · 결정타 칩 · 마지막 공격 · 역방향 컷인 (GDD v0.5 0.1 #63~68)

> 사용자 결정 (2026-09-29): ③ GK 배급 짧은 패스 · 롱패스 + 롱패스 스킬(캐논 킥) ④ 박스 연결 GK ×0.6 + 자동 = 기대 골 ⑤ 클래시 바는 **결정타 칩만** (테스트 후 뺄 수 있게) ⑥ 마지막 공격 보장 = **1골 차로 질 때만** ⑦ 역방향 컷인 (DF 블록 · 필살 패스 차단). ①② GK 자세(캐치/전진)는 **보류** (GDD 16-31). 밸런스는 #61 그대로 — 시뮬 전/후만 기록 (§17.14).
> 이 절이 v0.4.4 의 구현 기준이다. §7.5(GK 세이브 행) · §15.2-6 · §15.3 · §15.6 · §16.3-③ 중 여기서 바꾼 것은 **대체**. `MATCH_VERSION` 3 그대로 — 새 상태 키(`distribution` · `lastAttack` · `lastAttackUsed`)가 없는 옛 저장 경기는 null / 미사용으로 읽는다. 결정적(시드 고정), 한 step = 주사위 최대 한 번. 커밋 전(로컬 작업 트리).

### 17.0 이번 라운드 소유권

| 담당 | 파일 |
|---|---|
| 경기 엔진 | js/engine/match.js, js/engine/ai.js, js/engine/skills.js, js/engine/run.js(배급 전술 이행), data/config.json · skills.json · traits.json · supports.json, test/match · v05 · run.test.mjs, tools/sim.mjs · choice.mjs · scenarios.mjs(22 우선순위 · 23~27) |
| 경기 화면 | js/ui/screens/match.js, js/ui/layout.js, js/ui/labels.js, css/match.css, js/ui/screens/setup.js · training.js(배급 전술 select만), test/ui.smoke · layout · outgame.test.mjs |
| 기획 | docs/GDD_v0.5.md, docs/ARCHITECTURE.md, README.md |

### 17.1 GK 배급 — 흐름 (match.js)

```text
④ 판정 실패 & 수비 = GK (슛 세이브 · 박스 연결 차단)
  counterPlan(isGK) → { start: 0, distribution: true }        // 옛 saveCounterLine(빠른 배급 → 1) 폐지
  이벤트 "save" { counterStart: 0, toStep: 0, nextDistribution: true (배급이 이어질 때), reverseCutin? }
  endPossession(defSide, 0, "distribution", { gkId, from: "save"|"boxLink", saveEvent })
    possession += 1 → 포제션이 다 됐으면 checkEnd (마지막 공격 보장 · 종료 · 연장 · 승부차기) — 끝나면 배급 없음
    startDistribution: attackingSide = GK 팀, ball = newBall(GK, lineIndex 0), duel = null,
                       state.distribution = { side, gkId, from, possession }, phase = "distribution"
다음 step (phase "distribution") → resolveDistribution(decision | null)
  사람 측 배급(humanNeedsDecision = "distribution")이고 decision 이 있으면 그것, 아니면 ai.decideDistribution (전술 자동)
```

- **짧은 패스** (`short`): 주사위 없음, 체력 · 텐션 변화 없음. 이벤트 `"distribution"` → `startPossession(side, 0, "distribution")` (시작 선수 `pickStarter(0)` = DF 중 pass 최고). 시작 비트 이벤트(킥오프 · 역습)를 따로 넣지 않는다 — 배급 비트가 시작 비트.
- **롱패스** (`long`): `longPassOdds` 한 번 → `rng.chance(p)`. 체력: GK −`staminaCost.pass`, 경합 MF −`staminaCost.defend` (피지컬 경감 — 듀얼과 같은 공식). 게이지 · `duelsWon` · `playerDuelWins` 는 바꾸지 않는다.
  - 성공: GK 팀 텐션 +`tension.duelWin`, 이벤트 `"distribution"`, `startPossession(side, 1, "distribution", { nextBonus })` (시작 = `pickStarter(1)` MF 중 dribble+pass 최고, 캐논 킥이면 첫 듀얼 +nextDuelBonus).
  - 실패: 상대 텐션 +`tension.steal`, 이벤트 `"turnover"`(distribution: true, defAction "intercept", counterStart 1) → `endPossession(opp, 1, "counter")` — **포제션 +1**, 상대가 중원(line 1)에서 공격(보통 역습 이벤트가 뒤따른다). 턴오버로 둔 이유: 끝난 경기의 마지막 비트는 turnover · save · goal 이라는 기존 레이아웃 테스트, 기존 턴오버 연출 재사용.
- **배급 없음**: 그 세이브로 경기가 끝날 때(정규 · 연장 마지막 포제션, 마지막 공격 보장 포제션), 승부차기(`penaltyKick` 은 별도 흐름).
- 마지막 공격 보장(§17.7)으로 준 포제션이 세이브 뒤 GK 팀 몫이면 그 포제션은 배급으로 시작한다.
- 결정 검증: `action ∉ { short, long }` → throw, `skillId` 는 long 과만(아니면 throw), `checkDistributionSkill` 실패 → throw. `{ skillId }` 만 보내도 throw(듀얼과 달리 "스킬 먼저 쓰기" 없음).

**롱패스 확률** — `longPassOdds(state, data, side, { skill?, gkId?, explain? })` (export, 판정 · 미리보기 · 자동 공용, 순수)

```text
att = GK (pass + physical)/2 × actionCoef.longPass (없으면 actionCoef.pass, 2.2) × (1 + traits distributor.longPassBonus 0.25) × skill.active.params.longPass (1.5)
def = 상대 longPassContest = MF 중 (defense + physical)/2 최고 (동률 슬롯 순서; MF 없으면 GK 아닌 선수 → 전원) × 1.0
p   = clamp(att / (att + def), minP, maxP)          // 짝 · 선택 · 스타일 · 컨디션 · 체력 보정 없음
→ { p, att, def, gk, contest, bonus, skillMult, coef, factors (explain) }
```

### 17.2 캐논 킥 · 빠른 배급 (data · skills.js · ai.js)

- `data/skills.json` `sk_cannon_kick` "캐논 킥": active, learnable, cost 120, tension 25, positions ["GK"], `active: { effect: "longPassBoost", params: { longPass: 1.5, nextDuelBonus: 0.1 }, phase: "distribution", ai: { useWhen: "distribution", minTension: 25 } }`. 스킬 26 → 27개(학습 16 → 17). `data/supports.json` 주장 바르바라(`sp_iron_captain`) `hintSkillIds` 에 추가. 이벤트에는 넣지 않았다.
- `data/traits.json` `distributor` "빠른 배급": `params { saveCounterLine: 1 }` → `{ longPassBonus: 0.25 }`, 설명 "이 골키퍼의 롱패스 배급 +25% (세이브 · 박스 연결 차단 뒤 GK 배급)".
- skills.js: `ACTIVE_EFFECTS` += "longPassBoost", `DISTRIBUTION_EFFECTS = ["longPassBoost"]`, `isDistributionSkill(skill)`, `checkDistributionSkill(state, data, side, playerId, skill)` → `{ ok, reason }` (배급하는 GK 본인 · 보유 · 포지션 · 유스 아님 · phase "distribution" · 텐션). `checkSkillUsable` 은 배급 스킬을 듀얼에서 거절 — 사유 "GK 롱패스 배급에서만". `addSkillFx` 는 longPassMult · longPassNextBonus 를 기록(설명 문구용). 텐션 소모 · `skill` 이벤트(effect "longPassBoost") · `stats.skillsUsed` 는 match.js `resolveDistribution` 이 한다 (applyActive 는 듀얼 전용).
- `distributionSkills(state, data, side)` (match.js export): 배급 GK 의 배급 스킬마다 `{ skill, check, cost }`.
- ai.js `decideDistribution(state, data, side)` → `{ action, skillId, p, pLong, pSkill, tactic, values }` (사람 측 자동 · 상대 AI 공통, 결정적, 상대 **선택** 없음 — 상대 MF 스탯만):
  - 전술 `short` → 짧게, `long` → 길게, `auto`(기본) → `pLong ≥ longPassAutoMin`(0.55) 이거나 쓸 캐논 킥의 확률 `pSkill ≥ longPassAutoMin` 이면 길게, 아니면 짧게.
  - 길게일 때만 `chooseDistributionSkill`: 쓸 수 있고 텐션 ≥ max(비용, ai.minTension × 비용 비율)이며 전술 tension 규칙 — `immediate` 항상, `save` 남은 포제션 ≤ 3, `clutch` 동점·열세 && 남은 포제션 ≤ 3 (배급은 슛 상황이 아니므로 "또는 슛" 예외 없음). 비용 최고 1개.

### 17.3 전술 `distribution` (run.js · config · 화면)

- run.js `DISTRIBUTION_TACTICS = ["short", "long", "auto"]` (export), 기본 "auto". `normalizeTactics` 가 없거나 잘못된 값을 "auto" 로 → 옛 저장 런(`migrateRun`, 멱등) · 등록 팀 · 상대 데이터 모두 이행. config `defaultTactics.distribution: "auto"`.
- labels.js `TACTIC_LABELS.distribution = '배급'`, `TACTIC_OPTIONS.distribution = [['auto','상황 따라'], ['short','짧게'], ['long','길게']]`, `TACTIC_SETUP_KEYS = [...TACTIC_MAIN_KEYS, 'distribution']`. 편성(setup.js) 전술 4줄, 전술 미팅(training.js) = 주요 3 + tension · duelPicker · distribution.

### 17.4 getMatchView — GK 배급 (§12.1 · §13.4 · §15.4 보완)

- 배급 대기 중: `phase "distribution"`, `needsDecision "distribution"`(사람 측 배급일 때만, 상대 배급이면 null), duel 없음(`defender` null), `carrier` = 배급 GK, `lineIndex` 0, `actions` · `skills` 는 빈 배열, `lineLabel` "우리 GK 배급" / "상대 GK 배급".
- `view.distribution` (그 밖에는 null, 순수 · 난수 없음, 문구는 보는 쪽 시점):

```js
distribution: null | {
  side, gkId, gkName, from: "save" | "boxLink", needsDecision: boolean, tactic, autoMin,   // autoMin = longPassAutoMin
  gkZone,                                               // GK 가 선 박스 (gkZoneOf — home 1 · away 5)
  contest: { id, name, side } | null,                   // 롱패스를 다투는 상대 MF
  order: ["short", "long"],
  recommended: "short" | "long",                        // "상황 따라" 규칙 = decideDistribution(…, { tactic: "auto" }) — 자동이 쓸 캐논 킥 포함, 배급 전술과 무관 (§17.16)
  recommendedSkillId: string | null,                    // 추천이 캐논 킥 롱패스면 그 스킬
  auto: { action, skillId, p },                         // ai.decideDistribution — 자동이면 고를 것 (상대 배급 = 상대 선택)
  options: {
    short: { action, label: "짧은 패스", p: 1, pct: 100, text: "짧은 패스 100% — 빌드업부터", recommended,
             success: { zone, attackingSide, step: 0, starterId, starterName, label, short: "빌드업부터" }, fail: null },
    long:  { action, label: "롱패스", p, pct, text: "롱패스 70% — 성공 중원부터 / 실패 상대 중원 공격", recommended, bonus,
             success: { zone, attackingSide, step: 1, starterId, starterName, label, short: "성공 중원부터" },
             fail: { zone, attackingSide: 상대, step: 1, contestId, label: "세컨드볼 — 상대 중원 공격", short: "실패 상대 중원 공격",
                     matchEnd? } },            // 마지막 포제션이라 막히면 끝나면 label "롱패스 차단 — 경기 종료" · short "실패 경기 종료" (§17.16)
  },
  skills: [{ skillId, name, description, effect, tension, cost, enabled, reason, p, pct, nextDuelBonus }],   // 캐논 킥 켠 롱패스 확률
}
```
- 상대 배급이면 text · short 가 "상대 롱패스 ○% — 성공 상대 중원부터 / 실패 우리 중원 공격", skills.enabled false(사유 "결정 차례가 아님").
- 결정 `step(state, data, { action: "short" | "long", skillId? })`. 결정 없이 step = 전술 자동.
- 미리보기 = 실제: `options.*.success/fail` 의 구역 · 공격 팀 · 단계가 실제 결과와 같다 (test/match 하네스에 배급 포함).

### 17.5 박스 연결 — GK ×0.6 · 기대 골 자동 규칙 (§15.3 · §15.6 대체)

- config `match.boxLink = { gkMult: 0.6 }` (1.0 → 0.6). `autoRatio` 삭제 — 남아 있어도 읽지 않는다.
- `boxLinkEval(state, data, side)` → `{ rule: "ev", gkMult, shoot, pass, cross, auto }` (사람 측 자동 · 상대 AI 공통, 결정적, 상대 **선택** 없음, 난수 없음):

```text
fxG   = gkFxFor: GK 측이 이미 커밋했으면 그 효과(세이브 스킬 · 필살 세이브), 아니면 같은 규칙의 예측(ai.decideDefense) → 커밋 전후 같은 값 (GK 는 "중립" — 고르는 자세가 없다)
shoot = boxExpect(carrier, "shoot", fxS, fxG)         fxS = 커밋한 필살 슛, 아니면 aiWantsUltimate 면 carrier 필살 슛(합체기 포함)
        → { exp = 지금 슛 골 확률, value = exp × 100, ultimate, combo }
pass|cross (켜진 것만): r = 기본 받는 선수 (defaultFromPlan — carrier 필살 패스를 AI 규칙상 쓰면 그 fx 로 고름 → ultimate: true)
        ex = boxExpect(carrier, a, fxA, fxG, r)        → exp = 연결 p(GK × gkMult) × finishP(nextShotP: 원터치 · 헤더 · 킬패스 · 피니셔 · 타깃맨 ·
                                                              받은 뒤 준비되는 필살 슛 · 합체기) — 결정 카드 expectedPct 와 같은 함수
        → { receiverId, exp, linkP, finishP, value = score = exp × 100, forced: false, ultimate, receiverUltimate, combo }
link  = pass · cross 중 exp 최고 (동률 tieAttack 순서 → pass 먼저)
auto  = link.exp > shoot.exp (+1e-12) ? { action: link, receiverId, ultimate } : { action: "shoot", receiverId: null, ultimate }   // 동률 = 슛
```
- `boxTendency(ev)` → `{ shoot, pass?, cross? }` (기대 골 %). ④ carrier 의 `tendencyValues` 와 `expected.*.values` 가 이것 → `autoAction` · `ai.decideAttack` · `expectedFor` 가 기존 "1위 액션" 코드 그대로 기대 골 규칙을 따른다. forced(필살 슛 준비 강제 연결)는 폐지 — 필살기는 기대 골에 이미 들어간다.
- 뷰 (§15.4 보완): ④ `actions[].recommended` = 자동 선택(기대 골 규칙), `actions[].autoExpectedPct` = 자동 규칙이 본 기대 골 %(자동이 쓸 필살기 포함 — 필살기를 쓸 수 없으면 expectedPct 와 같다). `view.boxLink = { side, used, available, rule: "ev", ratio: null, gkMult, shoot: { value, exp, ultimate, combo }, pass | cross: { receiverId, value, score, exp, linkP, finishP, forced: false, ultimate, receiverUltimate, combo } | null, evAuto, auto }` — `auto` 는 커밋한 측이면 커밋한 선택, `evAuto` 는 늘 규칙 값.
- 연결 힌트 · 실패 줄: "→ ○○ 원터치 슛 · GK와 경합 (막히면 상대 GK 배급)", outcomes.fail label "GK가 끊어냄 → 상대 GK 배급" · short "실패 상대 GK 배급", ④ 슛 실패 "세이브 → 상대 GK 배급" (`distribution: true`, `gkZone` 포함). 마지막 포제션이라 막히면 경기가 끝나면 "(막히면 경기 종료)" · "세이브 → 경기 종료" · "실패 경기 종료" (§17.16).

### 17.6 결정타 칩 (클래시 바 1단계 — 표시 전용)

- `computeOdds(…, { explain: true })` 가 `factors` 를 함께 낸다 — 실제로 곱한 배율 목록 `{ id, side: "atk"|"def", mult, label, text, base?, group?, parts? }`. **Π(atk 의 mult) = att, Π(def 의 mult) = def** (base 항목 = 스탯 × 계수, ×1 항목은 뺀다). 확률 · 난수 소비는 explain 과 무관(같은 계산).
  - id 예: atk = base · bonus(보너스 합 — parts 에 chain · beaten · interceptFail · next · 연계 특성별, 상한이면 비례 축소) · teamwork · skill · passive · ultimate(필살 ×2 등) · combo · extraLine · style · condition · stamina · team · resonance, def = base · pair(짝 적중 / 빗나감 / 간파 짝 적중) · cover · wall(철벽) · boxLinkGk · oneTouch · saveUlt · ultShotGk · skill · passive · style · condition · stamina · team · resonance.
  - label 은 데이터 이름(연계 특성 · 스킬 · 필살기 이름, 함성 = rally 스킬 이름).
- `chipOf(factors, p, success, m)` (판정 · 롱패스 공용, 2026-09-30 보완 — §17.16): winner = 성공이면 atk, 실패면 def. 후보 = base · **rule**(규칙 상수 — `boxLinkGk` ×0.6, 모든 연결에 같다)이 아닌 배율(보너스 합은 항목별 — 빼면 1 + min(합 − 항목, 상한), style · condition · stamina · team · resonance 는 양쪽 합쳐 한 요인). **effect** = 그 요인을 뺐을 때 승자 확률이 떨어지는 폭(clamp 포함). **능력치 우위**도 후보(목록 맨 끝) = **순수 능력치 비**(base 의 `stat` — 행동 계수 2.2 / 1.0 제외)를 같게 했을 때(divA = statA/statD)의 승자 확률 하락폭 — 다른 요인과 같은 잣대 · 같은 순위. **decisive** = effect 최대 후보 `{ id, side, favours, label, text, mult, effect }` (동률 목록 앞 → 능력치 우위와 동률이면 요인; 능력치 우위면 `{ id: "stat", label: "능력치 우위", text: "능력치 우위 ×1.25", base: true }`), 최대 effect < `match.decisiveMinDelta`(0.02)면 null. **upset** = 승자 확률 < `match.upsetP`(0.3).
- 판정 이벤트(duel · turnover · save · goal, 롱패스의 distribution · turnover)에 `factors · decisive · upset`. 승부차기 · 짧은 패스에는 없음.
- text 예: "짝 적중 ×1.7", "빗나감 ×0.8", "킬패스 +20%", "제쳐짐 +25%", "필살 ×2", "빠른 배급 +25%", "밀물의 벽 ×1.15", "능력치 우위 ×1.3".

### 17.7 마지막 공격 보장 (match.js)

- 상태: `lastAttack: null | { side, stage, possession }` (준 포제션), `lastAttackUsed: { regular, extraTime }` (단계당 1회).
- `endPossession` → possession > possessionsTotal → `checkEnd(state, data, nextSide)` → 동점이 아니면 먼저 `grantLastAttack`:
  - 조건: stage ∈ { regular, extraTime } · 그 단계 미사용 · `scoreDiffFor(nextSide) === −lastAttackDeficit`(1) · deficit > 0. nextSide = 이어질 포제션의 팀 = 방금 끝난 포제션을 갖지 않은 팀.
  - 주면: `possessionsTotal += 1`, `lastAttack` 기록, 이벤트 `{ type: "lastAttack", side, stage, deficit, banner: "추가시간 — 마지막 공격!", text: "추가시간 — 마지막 공격! ○○ (1골 차)" }` → 평소 시작(킥오프 · 역습 · GK 배급).
  - 그 포제션이 끝나면 다시 checkEnd → 이미 썼으니 평소 종료 판정(동점이면 목표 경기 연장 · 친선 무승부, 아니면 종료). 세이브로 끝나도 배급 없음.
- 그 포제션의 시작 비트 · 판정 이벤트 · 배급 이벤트에 `lastAttack: true`. `view.lastAttack = { side, stage, possession, active }` (active = 끝나지 않았고 지금이 그 포제션), `getResult().lastAttack` 도.

### 17.8 역방향 컷인 (표시 전용)

- 필살기를 쓴 공격(`fxA.ult`)이 실패하면 판정 이벤트(save · turnover)에 `reverseCutin: { kind, side(막은 팀), playerId, position, text, skillId, ultimateType, combo }` (`REVERSE_CUTIN_TEXT` export):
  - shot 필살기 + 슛 → GK 면 `save` "기적의 세이브!", 필드 수비면 `block` "철벽 블록!"
  - pass 필살기 + 패스 · 크로스(④ 박스 연결 포함) → `passCut` "필살 패스 차단!"
- 화면(`reverseOf` — 옛 저장 이벤트는 필살 슛 GK 세이브만 규칙으로 대신): 막는 동작(액션 + hold) 뒤 · 재배치 전 `.cut.cut-save.cut-rev.rev-<kind>` — 막은 선수 얼굴 · 막은 팀 쪽에서 들어옴, 아랫줄 "(상대) DF 도르비나 · 메테오 슛 봉쇄" / "… 차단". 색: save 얼음 · block 강철 · passCut 연보라. 길이 `T.revCut` 800 → 이후 `T.revCutShort` 700 (경기의 첫 역방향 컷인만 800 — GK 세이브도 이제 두 번째부터 700), 배속 비례, 바닥 `CUT_MIN.card` 170, ⏭ 생략.

### 17.9 이벤트 요약

| type | 언제 | 필드 (위치 필드 zone · toZone · step · toStep · attackingSide · toAttackingSide 는 beatPos 공통) |
|---|---|---|
| `save` (기존) | ④ 세이브 · 박스 연결 차단 | + `counterStart: 0`, `toStep: 0`, `nextDistribution: true`(배급이 이어질 때), `factors · decisive · upset`, `reverseCutin?`, `lastAttack?` |
| `distribution` (신규 — `BEAT_TYPES` 에 추가) | 짧은 패스 · 롱패스 성공 | `side, playerId(GK), action("short" 또는 "long"), success: true, p, receiverId(시작 선수), defenderId?(롱패스 경합), skillId?, nextBonus?, gkZone, from, distribution: true, byAI, lastAttack?`, 롱패스면 `factors · decisive · upset`. 위치 = GK 팀 step 0 → step 0(짧게) · 1(길게) |
| `turnover` + `distribution: true` | 롱패스 실패 | `action: "long", defAction: "intercept", counterStart: 1, defenderId(끊은 MF), receiverId(향하던 MF), starterId?(세컨드볼 역습 시작 — 경기가 끝나면 없음), p, factors · decisive · upset`, 위치 = GK 팀 step 0 → 상대 step 1. 뒤에 상대 `counter` (경기가 끝나면 없음) |
| `skill` (기존) | 캐논 킥 | `effect: "longPassBoost", playerId(GK), cost` |
| `lastAttack` (신규, 비트 아님) | 보장 포제션을 줄 때 | `side, stage, deficit, banner, text` |
| duel · turnover · goal (기존) | 모든 판정 | + `factors · decisive · upset`, 보장 포제션이면 `lastAttack: true`, 필살기 실패면 `reverseCutin` |
| (모든 비트) | 그 비트로 경기가 끝남 | `matchEnd: "end" | "penalties"` — 포제션을 끝낸 마지막 비트 (endPossession → checkEnd, §17.16) |

### 17.10 config.match 추가 · 변경 ([가정] 그대로 — #61)

```jsonc
"actionCoef": { …, "longPass": 2.2 },   // GK 롱패스 계수 (없으면 actionCoef.pass)
"boxLink": { "gkMult": 0.6 },           // 1.0 → 0.6, autoRatio 삭제
"longPassAutoMin": 0.55,                // 배급 전술 "상황 따라" 의 롱패스 문턱
"lastAttackDeficit": 1,                 // 마지막 공격 보장 점수 차 (0 이하 = 끔)
"upsetP": 0.3,                          // 대이변: 승자 확률 < 이 값
"decisiveMinDelta": 0.02                // 결정타 칩: 뺐을 때 승자 확률이 이만큼 이상 떨어지는 요인만 (2026-09-30)
// defaultTactics.distribution: "auto"
```

### 17.11 경기 화면 (screens/match.js · layout.js · labels.js · css/match.css)

- **배급 모양** (layout.js `distributionLayout`, `DISTRIBUTION = { gkFy: 9 }`): `view.phase "distribution"` 이면 공 = 배급 GK(자기 박스 안), 배급 팀 = ① 빌드업 모양 `SHAPE.atk[pos][0]`, 상대 = ① 수비 모양. 받는 선수 후보(receiver) = `options.short/long.success.starterId`(DF · MF, 제자리 — 이름표 "(짧게)" · "(길게)"), 경합 상대 MF = defender 역할로 롱패스 받는 선수와 같은 레인. zone = gkZone, `track = { side, step: 0, dir, gk: true }`(아직 ① 전 — `.m-track.pre`), `receiverId` = 자동 배급의 받는 선수, `dist = { short, long, contest }`. 배너 "🧤 ○○가 배급 — 짧게 빌드업 · 길게 중원" / "상대 GK ○○ 배급 — 롱패스면 중원 경합".
- 배급 뒤 배너 (`playBanner`, `findPrevBeat`): 롱패스 성공 "롱패스 성공! {구역}에서 시작 — ○○", 짧은 패스 "GK 짧은 패스 — ○○가 빌드업 시작", 상대 롱패스를 끊은 역습 "세컨드볼! {구역}에서 공격 — ○○" (상대면 "⚠ …").
- **배급 카드** (사람 차례): 두 장 — `DIST_ICONS`/`DIST_LABELS` ('➡️ 짧은 패스' · '🚀 롱패스') → 받는 선수, % , 성공 · 실패 줄(짧은 패스 "실패 없음"), 셋째 줄(짧은 패스 "항상 성공 · 체력 · 텐션 그대로", 롱패스 "경합 상대 ○○ · 빠른 배급 +25%"), 추천 = `distribution.recommended`. 스킬 묶음 = `distribution.skills`(캐논 킥) 토글 → 롱패스 카드 % = 스킬 %, 테두리 보라(`.skill-on`), 짧은 패스 카드 흐림. 결정 `{ action, skillId? }` (`data-action="short"|"long"`). 자동 진행 · 상대 배급 = 읽기 전용 카드에 고른 쪽 "자동"(`.chip-auto`), 상대 GK 말풍선 = 상대 선택, 스킬 묶음 = 안내 한 줄.
- **정보 줄** (`distInfo`): "우리 GK 네리아 배급 — 롱패스 70% (경합: 상대 페리나)" + 오른쪽 "우리: 롱패스 70%(+ 캐논 킥)", 상대면 "… · 상대 선택: …". 툴팁에 규칙 · 빠른 배급 · 전술.
- **배급 연출**: 짧은 패스 = DF 에게 땅볼. 롱패스 = 중원 MF 에게 포물선 + 낙하 지점 경합 — 성공 우리 MF 가 잡음 · 상대 MF 뒤로("롱패스!", 캐논 킥이면 "캐논 킥!"), 실패(turnover distribution) 상대 MF 가 끊음 → 결과 "○○ 롱패스 차단! 세컨드볼 — 상대 중원 공격". 롱패스를 끊은 선수와 이어서 역습을 시작하는 선수(`pickStarter(1)`)가 다를 수 있어 재배치 때 공이 다른 MF 로 옮겨 간다(보통 턴오버와 같다).
- **④**: 추천 = 자동 = 정보 줄 "우리: …"(시나리오 18: 센터링 → 그레타). 정보 줄 툴팁 `boxRuleText` "④ 자동 규칙 (기대 골): … 슛 39% · 센터링 41% (연결 ○% × 헤더 ○%)", 상대 ④ 근거 "컷백 ○% > 슛 ○%"(값 = 기대 골 %, 이전 성향값), 카드 툴팁에 `autoExpectedPct` 가 다르면 "자동 기준 기대 골 ○%", 자동 진행 카드 값 = 기대 골 %. (옛 `bl.ratio` 기반 문구 삭제)
- **결정타 칩** (`popChips`): 결과 한 줄 맨 앞 `.dchip.k-<kind>.side-<이긴 팀>` = `decisive.text`, 종류 `DECISIVE_KINDS` (pair = 이긴 팀 색 · link(연계 특성 · chain · oneTouch · teamwork · distributor) = 초록 · ult(ultimate · combo · saveUlt · ultShotGk) = 분홍 · edge(beaten · interceptFail · next) = 주황 · skill = 보라 · 그 밖 base = 흰색). upset 이면 금색 `.dchip-upset` "대이변!". 툴팁 "결정타: … (이긴 쪽 확률 ○%)". 결과 한 줄 수명 그대로, 4x(`.fast`)는 등장 애니메이션 없음. 로그 줄 title 에도 결정타. **끄기**: `export const SHOW_DECISIVE_CHIP = true` → false (테스트는 `matchUi.decisiveChip = false`).
- **마지막 공격**: 보장 포제션의 첫 배너 "⏱ 추가시간 — 마지막 공격!"(상대 "⏱ 추가시간 — 상대 마지막 공격!", 금색 깜빡임 `.m-banner.lv-last`), 이후 배너 앞 "⏱ ", 점수판 `.mh.last-attack` 아랫줄 "… · ⏱ 추가시간"(상대면 "(상대)"), 로그 `.ev-lastAttack` 금색. 끝나면 결과 모달.
- labels.js: `DIST_LABELS` · `DIST_ICONS` · `DECISIVE_KINDS` · 배급 전술(§17.3), `TRAIT_LABELS.distributor.description` 새 문구.

### 17.12 테스트 (npm test 155 — rng 8, run 26, match 24, v05 50, layout 22, orient 5, stage 6, lineup 9, outgame 3, ui.smoke 2; 리뷰 수정 뒤 161 — §17.16)

- **test/v05** (37 → 50): GK 배급 대기(phase · needsDecision · view.distribution 두 선택지) / 짧은 패스(주사위 없음 · line 0 pickStarter · 위치 필드 · 포제션 그대로) / 롱패스 확률 공식(계수 · 빠른 배급 · 캐논 킥 · clamp) / 롱패스 성공 · 실패(주사위 한 번 · 텐션 · 체력 · turnover distribution · 포제션 +1) / 캐논 킥(×1.5 · +10% · 텐션 · 롱패스와만 · 듀얼 불가 · 뷰) / 배급 전술(short · long · auto 문턱 · 캐논 킥 텐션 규칙 · 사람 자동 = 상대 AI · 결정적) / 배급 없음(경기를 끝내는 세이브 · 승부차기) / 박스 연결 실패 = 상대 GK 배급(from boxLink) / 기대 골 자동 규칙(동률 = 슛 · 미리보기와 같은 확률 · 양 팀) / 기대 골 + 필살기(받은 뒤 준비 · 합체기 · 내 필살 슛, 추천 = 자동) / 결정타 칩(모든 판정 · 롱패스에서 factors 곱 → att/def → clamp = 이벤트 p, decisive · upset, 판정 · 난수 불변) / 칩 예(짝 적중 · 제쳐짐 · 대이변 · 필살 ×2) / 마지막 공격(1골 차 · 단계당 1회 · 끝나면 종료 · 친선 동점 무승부 · 목표 경기 연장) / 마지막 공격 + GK 배급 / 역방향 컷인 정보 3종. 옛 autoRatio · "골킥(0) / 빠른 배급(1)" 테스트 2개는 새 규칙으로 교체.
- **test/match**: 포제션 시작 비트에 배급 포함, 미리보기 = 실제 하네스에 GK 배급(구역 · 공격 팀 · 단계), line 3 실패 = 상대 GK 배급.
- **test/run** (+1): 배급 전술 이행(없음 · 잘못된 값 → auto, 옛 런 · 등록 팀 · 상대, 미팅 변경, 캐논 킥 힌트).
- **test/layout** (+2): 배급 대기 합성(4 포메이션² × 양 팀, 비율 범위 — GK 박스 · 빌드업 모양 · 받는 선수 · 경합 MF 레인), 배급 뒤 배너 3종.
- **test/ui.smoke**: 23(배급 카드 · 이름표 · 캐논 킥 토글 → 롱패스 % · 짧은 패스 흐림 → 짧은 패스 결정 · 배너), 상대 배급(자동 카드 · 말풍선 · 스킬 안내), 18 추천 = 자동, 25(칩 글 · 종류 클래스 · 대이변 · 끄기), 26(배너 · 헤더 · 로그 · 종료 모달), 27(철벽 블록 · 필살 패스 차단 컷인).
- **test/outgame**: 편성 전술 4줄 · 미팅 전술 6개(배급 포함).

### 17.13 도구

- **tools/scenarios.mjs** → 경기 01~27: `23_gk_distribution`(세이브 뒤 우리 배급 결정 — 네리아에 캐논 킥 주입, 자동 끔), `24_long_ball_mid`(롱패스 클릭 400ms 뒤, 성공 주사위), `25_decisive_chip`(드리블 클릭 1.7초 뒤 결과 줄 칩 — 짝 · 제쳐짐 · 킬패스 · 침투 우선), `26_last_attack`(1골 뒤진 우리의 추가 포제션 첫 결정), `27_df_block_cutin`(③ 메테오 슛이 DF 에게 막힘, 슛 클릭 2.85초 뒤 "철벽 블록!"). `22_ult_charge_mid` 는 ④ 우선(막히면 GK 세이브 컷인 — ui.smoke 가 GK 세이브를 쓴다). 새 도우미: `isDistribution`(export), `chipFor`(복제 상태에 결정을 넣은 판정의 decisive — 기존 `tryDecision` 사용).
- **tools/sim.mjs** 경기 표 추가: "④ 연결 비율 우리/상대", "GK 배급/경기 짧게·길게 우리 · 상대", "롱패스 성공률 우리/상대 (캐논 킥/경기)", "마지막 공격/경기 우리/상대 (골%)", "대이변/경기 (판정 중 %) · 결정타 칩 %". 배급 이벤트는 필드 듀얼 지표에서 뺀다.
- **tools/choice.mjs**: 배급(needsDecision "distribution")은 모든 정책에서 전술 자동 — 듀얼 결정 방식만 비교.

### 17.14 검증 (구현 시점)

- `npm test` 155 통과. `shot.mjs` 29 캡처(경기 01~27 · og_setup · og_meeting) 페이지 스크롤 없음 · 콘솔 에러 0, 18 · 23~27 · 03 · 13 · og_* 눈으로 확인. 추가 장면(상대 배급 · 롱패스 실패 3프레임 · 필살 패스 차단 컷인 · 대이변 칩 · 짝 칩 · 자동 배급 · 보장 포제션 부여 비트 · ④ 자동 카드)은 scratchpad `extra_shots.mjs` 로 캡처.
- 시뮬 (`node tools/sim.mjs --runs 300 --seed 1`, **수치 조정 없음** — GDD #61). 화면 작업은 시뮬에 영향 없음(두 담당 같은 값):

| 지표 | 전 (v0.4.3) | 후 (v0.4.4) |
|---|---|---|
| 시즌 승률 | 84.0 / 63.7 / 44.3% | 80.0 / 59.7 / 38.3% |
| 골/경기 (우리 / 상대) | 2.48 (1.43 / 1.06) | 2.76 (1.49 / 1.27) |
| 필드 듀얼/경기 | 15.7 | 15.6 |
| 필살기/보유자 우리 / 상대 | 0.96 / 0.53 | 0.89 / 0.31 |
| 합체기/경기 | 0.565 | 0.576 |
| 헤더 슛/경기 | 0.62 | 0.34 |
| 박스 연결/경기 컷백 · 센터링 (우리 / 상대) | 0.22 · 0.71 / 1.28 · 0.00 | 0.07 · 0.25 / 0.14 · 0.00 |
| ④ 연결 비율 우리 / 상대 | — | 22.5% / 8.0% |
| 박스 연결 성공률 · 다음 슛 골% | 52.5% · 78.3% | 64.1% · 79.3% |
| 연장 / 승부차기 | 19.1% / 11.5% | 24.1% / 16.0% |
| GK 배급/경기 짧게 · 길게 (우리 / 상대) | — | 0.00 · 0.58 / 0.00 · 0.48 |
| 롱패스 성공률 우리 / 상대 (캐논 킥/경기) | — | 73.3% / 79.8% (0.003) |
| 마지막 공격/경기 우리 / 상대 (골%) | — | 0.211 / 0.010 (29.6%) |
| 대이변/경기 (판정 중) · 칩 붙은 판정 | — | 2.04 (10.1%) · 97.0% |

- 하나씩: 마지막 공격 끔 → 77.3 / 57.0 / 37.0%, 배급 늘 짧게 → 77.7 / 57.7 / 40.0%, gkMult 1.0 → 거의 같음. 출력: scratchpad `eng/sim_before.txt` · `sim_after.txt`.

### 17.15 남은 문제 (GDD 16-31~36)

1. **GK 자세(캐치/전진)** 보류 — 넣으면 `boxLinkEval` 의 "GK 중립"(gkFxFor)과 칩 요인이 바뀐다.
2. **롱패스가 거의 늘 선택**: 롱패스 p 가 대부분 0.65~0.85 라 `longPassAutoMin` 0.55 를 넘는다(계수 1.5 에서도). 계수 · 문턱 · 경합 공식 재검토. 리뷰 측정: 자동 1,169 배급 중 롱패스 1,166 (짧게 3 = 유스 GK), 같은 주사위로 롱 vs 짧게를 끝까지 돌리면 승률 차 +0.7%p(구간별 −0.1 ~ +1.5%p), 손익 분기 p ≈ 0.72~0.75 — 선택이 거의 결과를 바꾸지 않는다.
3. **대이변 빈도** 경기당 약 2(판정의 10%) — `upsetP` 0.25 또는 슛 · 골만. 롱패스는 p ≥ 0.67 이라 실패가 거의 다 "대이변"(대이변 배지의 약 12%, 롱패스 실패 1,294 중 1,260) — 롱패스를 대이변 판정에서 뺄지도.
4. **마지막 공격 쏠림**: 포제션 교대라 정규 마지막 포제션은 늘 away → 보장은 거의 늘 home (우리 0.21 · 상대 0.01/경기). PvP 대칭성 검토.
5. **캐논 킥 AI** 는 tension 전술을 따라 기본(clutch)에서 거의 안 쓴다(경기당 0.003회) — 배급 스킬만 따로 규칙을 둘지. 캐논 킥을 가진 상대 GK 가 없어 상대 AI 경로는 실전에서 안 쓰인다 (한 S3 상대에게 줄지는 밸런스 때).
6. **칩 없는 판정**: 이긴 쪽을 2%p 이상 도운 요인도 능력치 우위도 없으면 decisive null (판정의 약 8% — §17.16) — 칩 없이 결과 줄만 (대이변이면 "대이변!" 만).
7. **배급 화면 붐빔**: "(짧게)/(길게)" 이름표 · 경합 강조 · 상대 말풍선이 한 화면에 — 4x 에서 확인 필요.
8. ui.smoke 시나리오 20 블록이 경기를 끝내 `ui.resultShown` 을 남긴다(테스트 전용 누수 — 26 블록이 지우고 쓴다).
9. **마지막 공격이 배급으로 시작할 때 자동(상황 따라)도 롱패스**: 실패하면 듀얼 한 번 없이 경기가 끝난다(보장 1,224번 중 19번). 그 포제션에선 역습 위험이 없어 짧은 패스가 조금 낫다(21 상태 × 200: 승 13.3 vs 14.3%, 표본 작음). 카드는 이제 "실패 경기 종료"를 보여 준다 — 자동 규칙을 바꿀지는 사용자 결정 (GDD 16-37).
10. **④ 기대 골 규칙은 받는 선수의 일반 액티브를 보지 않는다** (필살기만 — 명세 그대로): 판정의 약 10% 에서 다음 슛 값이 최대 약 6%p 낮게 잡힌다. 나빠지는 연결은 없었다(0/498), 놓친 연결 23번(평균 0.11%p). 넣으려면 nextShotP 에 chooseSkill 예측 (GDD 16-38).
11. **4x 에서 칩 읽기**: 결과 한 줄이 약 130~240ms, 역방향 컷인 200/175ms 만 보인다 — 4x 는 빠르게 보는 배속이라 그대로 둔다(최소 표시 시간을 두면 4x 가 느려진다). 칩 확인은 1x · 2x 로.

### 17.16 리뷰 수정 (2026-09-30 — 판정 · 난수 · 승률 불변)

v0.4.4 리뷰(화면 · 코드 · 규칙)에서 나온 결함을 고쳤다. 판정 규칙 · 확률 · 주사위 소비는 그대로 — 시뮬 승률 80.0 / 59.7 / 38.3%, 골 2.76 그대로이고 "결정타 칩 %"만 97.0 → 91.8% (작은 요인 칩이 빠짐).

**① 마지막 포제션 문구** (match.js `endForecast` · `lastAttackDue`)
- `endForecast(state, data, nextSide, score = state.score)` (export, 순수 — checkEnd 와 같은 규칙): 지금 포제션이 끝나면 `null`(남은 포제션 있음) · `"extraTime"`(동점 → 연장) · `"lastAttack"`(nextSide 가 마지막 공격 보장을 받음) · `"end"` · `"penalties"`. `grantLastAttack` 과 조건 함수 `lastAttackDue` 를 공유한다.
- 미리보기: 공격 결과 실패(④ "세이브 → 경기 종료", 박스 연결 "GK가 끊어냄 → 경기 종료", 필드 "뺏기면 → 경기 종료", short "실패 경기 종료", `matchEnd`, `distribution` 없음) · 골(`goalOutcome` — "골! → 경기 종료 · 연장전 · 승부차기 · 상대 마지막 공격", 실점은 "뚫리면 — 실점 → …") · 수비 결과 막음("막으면 — 경기 종료", 우리가 보장을 받으면 "… (추가시간 — 우리 마지막 공격)") · ④ 연결 힌트 "(막히면 경기 종료)" · 배급 롱패스 실패("롱패스 차단 — 경기 종료", text "… / 실패 경기 종료").
- 이벤트: 포제션을 끝내 경기를 끝낸 비트에 `matchEnd: "end" | "penalties"` (`endPossession` → checkEnd true). 끝나는 턴오버 · 세이브 문구에 " 빠른 역습!" 없음. 롱패스 실패 turnover 에 `receiverId`(향하던 MF — 끊긴 롱패스 방향) · `starterId`(세컨드볼 역습을 시작할 상대 선수 = `pickStarter(1)`, 끊은 선수와 다를 수 있다 — 경기가 끝나면 없음), 문구 "…롱패스 — 세컨드볼 → 셀마, ○○ 중원부터 공격"(시작 선수가 끊은 선수와 다를 때) / "…롱패스 — 경기 종료".

**② 결정타 칩 보완** (`chipOf`, config `match.decisiveMinDelta` 0.02 — §17.6)
- 규칙 상수 `boxLinkGk`(×0.6)는 `rule: true` — factors 곱에는 남고 후보에서 빠진다 (예전엔 성공한 박스 연결마다 "연결 GK ×0.6").
- 크기 = 그 요인을 뺐을 때 승자 확률 하락폭 (보너스 항목은 더하기 기준, 상한 · clamp 포함 — 영향 없던 요인은 0). "능력치 우위" = **순수 능력치 비**(행동 계수 제외 — 예전엔 계수 2.2 가 들어가 GK 스탯이 낮아도 롱패스 성공에 "능력치 우위"가 붙었다).
- **재수정 (같은 날, 최종 QA)**: 능력치 우위가 처음엔 "모든 요인 < 0.02 일 때만"의 대체라, 2~4%p 요인이 훨씬 큰 능력치 차를 제치고 칩이 됐다 (프로브: 요인 칩 839 중 182 = 21.7%, 3배 넘게 차이 41 — 예 "철벽 ×1.15" 3.5%p vs 수비 능력치 2.21배 19.4%p). 이제 능력치 우위를 후보 목록 끝에 넣어 같은 잣대로 순위를 매긴다 → 그 경우 0. 최대 크기 < 0.02 면 null (칩이 붙는 비율은 그대로).
- 분포 (자동 목표 경기 240판, 판정 5,312, seed 1 — 판정 대비): 칩 91.7% — 능력치 우위 30.8% · 상성 24.6% · 짝 15.1% · 필살기 7.1% · 컨디션 2.9% · 스킬 2.2% · 빠른 배급 2.0% · 인터셉트 뚫림 1.9% · 킬패스 · 연계 1.2%. 재수정 전 같은 표본: 상성 30.2 · 짝 19.3 · 능력치 우위 8.6 · 필살기 7.6 · 컨디션 5.2 · 철벽 4.0%. ×1.05 이하 칩 0 (예전 9.6%). 대안(미적용): 요인 크기 ≥ 능력치 크기 × 0.5 면 요인 → 능력치 우위 19.2% · 상성 29.2% · 짝 17.7% (GDD 16-36).
- 테스트 (v05 "결정타 칩 보완"): 빠른 배급 +25%(3.2%p ≥ 2%p)와 능력치 2배(11.3%p)가 둘 다 승자 편 → "능력치 우위 ×2", 거꾸로 GK 450 vs MF 400(능력치 2.2%p < 빠른 배급 4.4%p) → "빠른 배급 +25%".

**③ 배급 추천** — `view.distribution.recommended` = `ai.decideDistribution(state, data, side, { tactic: "auto" })`("상황 따라" 규칙, 자동이 쓸 캐논 킥 포함), `recommendedSkillId`. 배급 전술이 auto 면 `auto.action` 과 같다. 전술이 short/long 이면 추천(확률 기준)과 자동(전술)이 다를 수 있다 — 필드 듀얼의 추천(기대 %) ↔ 자동(성향)과 같은 관계.

**④ 화면** (screens/match.js · layout.js · css)
- 롱패스 실패 결과 한 줄: `starterId` 가 끊은 선수와 다르면 "페리나 롱패스 차단! → 셀마 세컨드볼"(공이 그 선수에게 간다), 같으면 "… 세컨드볼 — 상대 중원 공격", `matchEnd` 면 "페리나 롱패스 차단! — 경기 종료". 경기가 끝난 마지막 모습(`finalFrame.laneId`)에서 끊은 선수는 롱패스 받을 선수의 레인(낙하 지점)에 공을 든 채.
- 롱패스 경합 연출: 경합에 진 선수(성공 = 상대 MF, 실패 = 우리 받는 선수)의 이름표를 act 동안 숨긴다 (`.tok.tag-off .tok-name { visibility: hidden }` — 재배치 때 풀림).
- 배급 카드 힌트: 캐논 킥을 켜면 맨 앞 "캐논 킥 첫 듀얼+10%", 그다음 "경합 ○○ · 빠른 배급 +25%" (긴 문구는 title).
- 공격 카드: 이번 포제션 첫 듀얼 보너스(`ballState.pending.nextBonus` — 캐논 킥 · 소매치기 상한)가 있으면 약점 줄 맨 앞 "첫 듀얼 +10%" (% 에 이미 포함).
- 정보 줄: 사람이 고른 배급의 연출 중 오른쪽 = "우리 선택: 롱패스 78% + 캐논 킥" (예전엔 자동 예상 "우리: 롱패스 70%").
- 결과 한 줄 자리: 공 옆이 막히면 공 위 · 아래(가운데 맞춤) → 한 칸 더 위 · 아래 옆 → 필드 가운데 띠 (칩으로 줄이 길어져도 공 근처).
- 상수: 역방향 컷인 문구 · 배급 선택지는 엔진 `match.REVERSE_CUTIN_TEXT` · `match.DISTRIBUTION_ACTIONS` (화면 사본은 대체값만). ai.js 는 `DISTRIBUTION_TACTICS` 를 run.js 에서 가져온다 (사본 없음).

**⑤ 도구 · 테스트**
- scenarios.mjs `20_ace_call` 은 정규 포제션 우선(마지막 공격 포제션은 `26_last_attack`) — 다시 포제션 3/6.
- 테스트 161 (+6): v05 +5 (배급 대기 JSON 왕복 · 연장 마지막 공격 부여/종료 · 마지막 포제션 문구 · 칩 보완 · 배급 추천), outgame +1 (배급 전술 목록 = run.js 하나), match(수비 문구 하네스가 마지막 포제션 "막으면 — 경기 종료"를 확인), layout(롱패스 차단으로 끝난 모습의 레인), ui.smoke(캐논 킥 힌트 · "우리 선택" · 첫 듀얼 보너스 · 이름표 숨김 · 세컨드볼 문구 · 마지막 공격 배급 "실패 경기 종료" → "— 경기 종료").
- 확인: `shot.mjs` 42 캡처 스크롤 · 콘솔 에러 없음, 추가 장면(마지막 공격 배급 카드 · 롱패스 실패로 종료 · 세컨드볼 문구 · 캐논 킥 힌트/정보 줄/다음 카드 · 마지막 수비 카드 · 박스 연결 결과 자리)은 scratchpad `gkfix/fix_shots.mjs`.

---

## 18. v0.4.5 — 도전 모드 (플레이테스트용, GDD v0.5 0.1 #69~70 · §11.7)

> 사용자 요청 (2026-10-01): "완성된 최종팀으로, 점점 강해지는 도전모드… 1단계~10단계 정도… 플레이테스트용이라 밸런스를 꼼꼼하게 챙기지 않아도 괜찮아. 스탯이나 스킬이 단계별로 증가". 입장 · 팀 선택 · 단계 수치 · 저장 · 화면 같은 세부는 기본값으로 정했고, 단계 수치는 모두 `data/challenge.json` 에서 바꾼다.
> 이 절이 도전 모드의 구현 기준이다. **기존 엔진 파일(run.js · match.js · ai.js · skills.js · rng.js)과 규칙 · 수치는 그대로** — 같은 시드 → 같은 경기, 런 시뮬 승률 그대로. 도전 모드는 런 상태(`store.run`)와 런 저장(`'soccer.run'` · `'soccer.match'`)을 읽지도 쓰지도 않는다. 커밋 전(로컬 작업 트리).

### 18.0 이번 라운드 소유권

| 담당 | 파일 |
|---|---|
| 도전 엔진 · 데이터 | js/engine/challenge.js (신규), data/challenge.json · challenge_sample_team.json (신규), tools/challenge_sim.mjs (신규), test/challenge.test.mjs (신규), package.json (test 스크립트에 challenge 추가) |
| 화면 | js/ui/screens/challenge.js (신규), js/ui/app.js, js/ui/store.js, js/ui/screens/start.js, js/ui/screens/match.js (경기 모드 훅만), css/outgame.css · match.css, tools/scenarios.mjs · shot.mjs, test/ui.smoke · outgame.test.mjs |
| 기획 | docs/GDD_v0.5.md, docs/ARCHITECTURE.md, README.md |

### 18.1 데이터

**로딩**: app.js `DATA_FILES` 와 `OPTIONAL_FILES` 에 `'challenge'` · `'challenge_sample_team'` → `data.challenge` · `data.challenge_sample_team`. 둘 다 선택 파일이다 — `challenge` 가 없으면 시작 화면 [도전 모드] 버튼이 숨고, 샘플 팀이 없으면 `sampleTeam(data)` 가 null 이라 팀 목록에서 빠진다. tools/scenarios.mjs `loadData` 도 선택 파일로 읽고, tools/challenge_sim.mjs `loadData` = sim.mjs 번들 + 두 파일.

**`data/challenge.json`**

```jsonc
{
  "version": 1,
  "possessions": 8, "kind": "goal",       // 단계 기본값 (단계에 없을 때)
  "statRound": 10,                         // 상대 스탯 반올림 단위
  "activePool": [                          // 일반 액티브 후보 — 우선순위 순
    { "skillId": "sk_power_shot", "positions": ["FW"], "pick": "shoot" },   // pick = 받는 선수 고르는 스탯
    …                                      // 바위 방벽 DF/defense → 스루 패스 MF/pass → 폭발 드리블 FW·MF/dribble → 매의 눈 DF·MF/defense
  ],                                       // → 꿰뚫어보기 FW·MF/dribble → 소매치기 MF/defense → 함성 MF·DF·FW/physical
  "tiers": [ { "tier", "label", "actives", "gaanpaTickets", "aceShot"?, "gkSave"?, "gkDistribution"? }, … ],
  "stages": [ { "stage", "title", "opponentTemplate", "suffix"?, "statTarget", "skillTier", "teamwork"?, "tactics"?, "possessions", "kind" }, … ]
}
```

| tier | label | 단계 | actives | gaanpaTickets | 추가 |
|---|---|---|---|---|---|
| 0 | 스킬 없음 | 1–2 | 0 | 0 | — |
| 1 | 액티브 | 3–4 | 2 | 0 | — |
| 2 | 액티브 · 간파 | 5–6 | 3 | 1 | — |
| 3 | 필살 슛 | 7–8 | 3 | 1 | `aceShot: "sk_boss_strike"` (업화의 일격) |
| 4 | 필살 세이브 | 9 | 3 | 2 | + `gkSave: "sk_boss_save"` (불꽃 장벽) |
| 5 | 총력 | 10 | 4 | 2 | + `gkDistribution: "sk_cannon_kick"` (캐논 킥) |

| stage | title | opponentTemplate | suffix | statTarget | skillTier | teamwork | tactics |
|---|---|---|---|---|---|---|---|
| 1 | 첫 시험 | op_f1_riverside | — | 340 | 0 | 25 | — |
| 2 | 산맥의 벽 | op_s1_ironhoof | — | 460 | 0 | 25 | — |
| 3 | 번개 평원 | op_f2_thunderclaw | — | 480 | 1 | 50 | — |
| 4 | 은빛 숲의 지휘 | op_s2_silverleaf | — | 525 | 1 | 50 | — |
| 5 | 얼음 호수 | op_f3_frostveil | — | 590 | 2 | 75 | — |
| 6 | 챔피언의 왕좌 | op_s3_emberthrone | — | 610 | 2 | 75 | — |
| 7 | 폭주하는 발톱 | op_f2_thunderclaw | 각성 | 790 | 3 | 85 | — |
| 8 | 깨어난 숲 | op_s2_silverleaf | 각성 | 830 | 3 | 85 | — |
| 9 | 얼어붙은 심연 | op_f3_frostveil | 각성 | 875 | 4 | 100 | `{ "tension": "clutch" }` |
| 10 | 업화의 정점 | op_s3_emberthrone | 각성 | 920 | 5 | 100 | — |

모두 `possessions: 8`, `kind: "goal"`. 템플릿 평균(7명 × 5스탯): 강변 321.1 · 아이언후프 340 · 썬더클로 465.7 · 실버리프 514.6 · 프로스트베일 639.7 · 엠버스론 679.7. statTarget 은 §18.10 보정 뒤 값이다 (`_calibration` 주석에 이력).

**`data/challenge_sample_team.json`**: `{ _comment, generator: { tool, seed: "challenge-sample-7", routeStart: 1, policy: "smart" }, team }`. `team` = 등록 팀 저장본과 같은 모양(`run.finalizeRun().registeredTeam` + `grade` · `score` · `registeredAt: "2026-10-01T00:00:00.000Z"`). tools/sim.mjs `simulateOne`(기본 편성 · smart 자동 정책)으로 고정 시드 런을 완주한 결과다. 다시 만들기 `node tools/challenge_sim.mjs --write-sample [--sample-seed S] [--route-start R]`. 지금 값: 2-2-2 · B · 533.7 · 전력 475 · 팀워크 97 · 유물 바위 각반 · 짝짝이 축구화. 선수는 GK 네리아(수비 1000) · DF 도르비나(968, 철의 태클 · 매의 눈) · DF 아델린(795) · MF 실루엔(패스 651, 바람의 실) · MF 타리아(568) · FW 울리카(슛 600) · FW 그레타(674, 메테오 슛).

### 18.2 js/engine/challenge.js — API (순수)

- 의존: rng.js `hashString`, run.js `STATS · POSITIONS · formationSlots · slotPosition · mainStatOf · normalizeTactics · migrateRegisteredTeam · buildOpponentSnapshot · opponentStyleHint`, skills.js `getSkillMap · isGaanpaSkill · isDistributionSkill`.
- **순수 함수**: DOM · fetch · Date · Math.random · localStorage 를 쓰지 않는다. 입력(데이터 · 팀 · 진행)을 바꾸지 않고 새 객체를 돌려준다 — §0 의 "엔진 함수는 상태를 in-place 로" 와 다르다(도전 진행은 엔진 상태가 아니라 UI 저장값). 날짜(`lastResult.at`)는 호출하는 쪽이 넘긴다.
- 데이터 오류(없는 템플릿 · 스킬, 0 평균, 없는 단계)는 throw.

**상수**

```js
CHALLENGE_PROGRESS_VERSION = 1
SAMPLE_TEAM_ID = "sample", SAMPLE_TEAM_NAME = "테스트용 샘플 팀"
FEATURE_KEYS   = ["active", "gaanpa", "ultShot", "ultSave", "cannon"]
FEATURE_LABELS = { active: "액티브", gaanpa: "간파", ultShot: "필살 슛", ultSave: "필살 세이브", cannon: "캐논 킥" }
STAGE_STATES   = ["locked", "open", "cleared"]
```

**단계**

| 함수 | 반환 |
|---|---|
| `getStages(data)` | `ChallengeStage[]` (stage 오름차순, 기본값 채운 사본) — `{ stage, title, opponentTemplate, suffix \| null, statTarget, skillTier, teamwork \| null, tactics \| null, possessions, kind }` |
| `stageCount(data)` | 10 |
| `getStage(data, n)` | 단계 하나 (없으면 throw) |
| `stageDisplayName(data, n \| def)` | `"7단계 · 썬더클로 (각성)"` |

**단계 상대**

| 함수 | 반환 |
|---|---|
| `buildStageOpponent(n \| def, data)` | opponents.json 항목 모양 `{ id(= 템플릿 id), name("썬더클로 (각성)"), baseName, race, element, role, season, formation, description, tactics, teamwork, players }` + `challenge: { stage, tier, tierLabel, statTarget, scale, templateId, templatePower, power, gaanpaTickets, added: [{ slot, name, skillId, skillName, kind: "active" \| "ultimate" \| "distribution" }], features }` |
| `buildStageOpponentSnapshot(n \| def, data)` | away `TeamSnapshot` (`run.buildOpponentSnapshot`) + `modifiers.gaanpaTicket` · `gaanpaTickets` = 티어 간파 사용권, `challengeStage` |
| `featuresOf(data, players, gaanpaTickets)` | `{ active, gaanpa, ultShot, ultSave, cannon }` — 액티브(배급 스킬 제외) / 간파(사용권 또는 간파 스킬) / 필살 슛 / 필살 세이브 / 배급 스킬 |
| `featureBadges(features)` | `[{ key, label }]` (FEATURE_KEYS 순서, 켜진 것만) |
| `teamPower(players)` | 7명 × 5스탯 평균 (배율 기준 · 화면 "전력") |

**단계 보기**

- `stageInfo(n | def, data)` → `{ stage, title, displayName, teamName, opponentId, opponentName, suffix, description, formation, power, statTarget, skillTier, tierLabel, teamwork, possessions, kind, tactics, styleHint: { key, label }, features, badges, gaanpaTickets, added, players: [{ slot, position, name, style, element, trait, traitName, mainStat, mainValue, stats, skillIds, skillNames, addedSkillIds, ultimate \| null }] }`
- `ladderView(data, progress, teamId)` → 단계마다 `stageInfo` + `{ state, attempts, wins }`.

**우리 팀**

| 함수 | 반환 |
|---|---|
| `sampleTeam(data)` | `{ ...challenge_sample_team.team, name: "테스트용 샘플 팀", isSample: true, challengeId: "sample" }` 또는 null |
| `teamIdOf(team)` | `"sample"` 또는 `"t_" + base36(hashString(seed \| createdTurnIndex \| registeredAt))` — 사본이면 같은 id, registeredAt 이 다르면 다른 id (`team.challengeId` 가 있으면 그것) |
| `teamSummary(team, data)` | `{ teamId, isSample, name, grade, score(반올림 안 함), formation, registeredAt, seed, power, teamwork, relics: [{ id, name }], tactics, features, players: [슬롯 순(GK 먼저) { id, slot, position, name, aptitude, rarity, element, style, trait, traitName, mainStat, mainValue, stats, skillIds, skillNames, ultimate }] }` |
| `listChallengeTeams(registeredTeams, data)` | `[{ teamId, team, summary }]` — 샘플 팀 먼저, 이어서 등록 팀(주어진 순서). 같은 id 는 처음 것만, 고장 난 저장본(슬롯 불일치 등 — teamSummary throw)은 뺀다 |
| `buildChallengeTeamSnapshot(team, data, { kind })` | home `TeamSnapshot` (§18.4) |

**진행 기록** (§18.5)

| 함수 | 반환 |
|---|---|
| `emptyProgress()` | `{ version: 1, teams: {} }` |
| `normalizeProgress(raw)` | 정리한 사본 (쓰레기 입력 → 빈 진행) |
| `teamProgress(progress, teamId)` | `{ cleared, attempts: { [stage]: n }, wins: { [stage]: n }, lastResult \| null, resets }` — `resets` = [진행 초기화] 횟수(시드에 섞인다), `lastResult.forfeit` = 경기 중 [포기] |
| `isUnlocked(p, id, n)` · `isCleared(p, id, n)` · `stageState(p, id, n)` | 1단계는 늘 열림, n ≤ cleared → "cleared", n ≤ cleared + 1 → "open", 그 밖 "locked" |
| `nextAttempt(p, id, n)` | `attempts[n] + 1` (경기 시드에 쓴다) |
| `recordResult(p, id, n, { attempt, winner \| win, homeGoals, awayGoals, penalties?, at?, forfeit? })` | 새 진행. **한 번만 세기**: `attempt ≤ attempts[n]` 이면 **입력 그대로(같은 참조)** — `===` 로 확인. 승리면 `wins[n] + 1`, `cleared = max(cleared, n)` (클리어한 단계에서 져도 클리어 유지). `forfeit: true` = 경기 중 [포기] — 늘 패배, `lastResult.forfeit = true`. `match.getResult(ms)` 에 attempt · at 을 더해 넘기면 된다. attempt 를 안 주면 다음 번호(중복 방지 없음) |
| `resetProgress(p, id)` | 그 팀의 기록(클리어 · 도전 · 승리 · 최근)을 지우고 **`resets + 1` 만 남긴** 새 진행 — 초기화 뒤 1회차가 초기화 전 1회차와 다른 시드 |
| `forgetTeams(p, ids)` | 그 팀들을 `resets` 까지 통째로 뺀 새 진행 (샘플 팀은 빼지 않는다) — 등록 팀 상한(50)에 밀려난 팀 정리용 |

**경기 준비**

- `challengeSeed(teamId, stage, attempt, resets = 0)` → uint32 = `hashString("challenge|팀|단계|도전 번호")`, `resets > 0` 이면 키 끝에 `"|r<resets>"`. resets 0 은 예전 키 그대로(옛 저장 경기 · 도구 시드 호환).
- `challengeSetup(team, stage, attempt, data, { resets }?)` → `{ home, away, seed, possessions, kind, reason: "challenge", rules: { allowDraw, extraTime, penalties, isGoalMatch, possessions }, opponentName, opponentId, stage, attempt, resets, teamId, displayName }` — `run.getMatchSetup` 과 같은 모양이라 `match.createMatch({ data, seed, home, away, possessions, kind })` 에 바로 넘긴다. UI 는 `resets = teamProgress(progress, teamId).resets` 를 넘긴다.

### 18.3 단계 상대 생성 규칙 (`buildStageOpponent`)

1. **스탯**: 템플릿 선수 복제, 모든 스탯 = round(원래 × statTarget / 템플릿 평균 / statRound) × statRound. **1000 상한 없음** — 원래 엠버스론도 1000을 넘고 경기 엔진에는 상한이 없다. 결과 전력 339 / 460 / 480 / 526 / 591 / 610 / 791 / 830 / 875 / 920, 10단계 최고 스탯 1580(GK).
2. 템플릿 고유 스킬 · 필살기 · 연계 특성 · 포메이션 · 원소 · 종족은 그대로. 전술 = `normalizeTactics({ ...config.defaultTactics, ...템플릿.tactics, ...단계.tactics })`. 팀워크 = 단계 teamwork (없으면 템플릿 시즌 기본 25 / 50 / 75 — buildOpponentSnapshot 과 같은 값).
3. **일반 액티브**: `activePool` 순서대로 `tier.actives` 개. 팀이 이미 가진 스킬은 건너뛰고 개수에 넣지 않는다. 후보 = entry.positions ∩ 스킬 positions 에 맞는 선수 → 이번에 받은 스킬이 적은 → `pick` 스탯(없으면 포지션 주 스탯)이 높은 → 슬롯 순서.
4. **aceShot**: 팀에 슛 필살기가 없을 때만, 필살기가 없는 FW 중 shoot 최고(동률 슬롯 순서). **gkSave**: 팀에 세이브 필살기가 없고 GK 에게 필살기가 없을 때 GK. **gkDistribution**: GK 에게 배급 스킬이 없으면 GK.
5. **간파 사용권** = `tier.gaanpaTickets` → 스냅샷 `modifiers.gaanpaTicket` · `gaanpaTickets`.

단계별 추가 (현재 데이터): 3 파냐 파워 슛 · 파르가 바위 방벽 / 4 시오넬라 파워 슛 · 노르웬 바위 방벽 / 5 헤일리 · 글라시아 + 세렌 스루 패스 / 6 엠버스론(파워 슛 · 바위 방벽 · 매의 눈 보유) 세르바 스루 패스 · 코르델리아 폭발 드리블 · 브란디 소매치기 / 7 · 8 액티브 3 + FW 업화의 일격(파냐 · 시오넬라) / 9 + 헤일리 업화의 일격 · GK 니벨라 불꽃 장벽 / 10 스루 패스 · 폭발 드리블 · 소매치기 · 마그다 함성 + GK 볼카라 캐논 킥 (필살 슛 · 필살 세이브는 보스 고유라 추가 없음).

### 18.4 우리 팀 스냅샷 (`buildChallengeTeamSnapshot`)

- `run.migrateRegisteredTeam` → 선수 정리: 스탯 정수화, position = 슬롯, **없는 스킬 id · 특성 id 는 버린다**(옛 저장본 방어 — 실패하지 않음), 특성이 없으면 migrate 가 캐릭터 데이터로 채운다(charId, 없으면 이름 — 2026-10-01 이름 변경 전 옛 이름 5개도 `LEGACY_CHAR_NAMES` 로 받는다. 저장된 표시 이름은 바꾸지 않음). 슬롯 · 선수 수 · id 가 포메이션과 안 맞으면 throw(→ 목록에서 빠짐).
- `side "home"`, 이름 = 팀 이름(없으면 "우리 클럽"), 전술 = `normalizeTactics(team.tactics)`, 팀워크 = 저장값.
- 컨디션 = `config.condition.matchMult[condition.start (+ 목표 경기면 유물 goalMatchCondition)]` — 낡은 주장 완장 +1단계.
- `modifiers` = **등록 팀 `relics` 에서 다시 계산** (run.js `SNAPSHOT_MODIFIER_KEYS` 와 같은 키 — 예: 감독의 수첩 → gaanpaTicket 1). 런 중 이벤트 · 루트 modifier 는 등록 팀에 저장되지 않아 빠진다.
- 공명 = `run.buildOpponentSnapshot` 과 같은 계산(그 함수로 슬롯 검증 겸 계산). 체력 · 텐션 · 필살 게이지는 `match.createMatch` 가 시작값으로 채운다.

### 18.5 진행 기록 · 저장 키 (js/ui/store.js)

| 키 | 값 | 쓰는 곳 |
|---|---|---|
| `'soccer.challenge'` (`KEYS.challenge`) | `{ version: 1, teams: { [teamId]: { cleared, attempts: { "1": 3 }, wins: { "1": 1 }, lastResult: { stage, attempt, win, homeGoals, awayGoals, penalties: { home, away } \| null, at: ISO \| null, forfeit } \| null, resets } } }` | `loadChallengeProgress()` → 엔진 `normalizeProgress` 로 읽고, `recordResult` · `resetProgress` · `forgetTeams` 결과를 `saveChallengeProgress` |
| `'soccer.challengeMatch'` (`KEYS.challengeMatch`) | `{ version: CHALLENGE_MATCH_VERSION(1), teamId, stage, attempt, resets, seed, team, match: MatchState }` — `team` 은 팀 저장본 자체(복원이 팀 목록에 기대지 않게). `resets` 는 참고용 — 복원은 진행 기록의 `resets` 로 시드를 다시 계산해 맞춘다 | `loadChallengeMatch()` · `saveChallengeMatch()` — 경기 step 마다 저장, 기록하거나 포기 · 버리기하면 지움, [나가기] · [처음으로]는 남김 |

- 메모리 전용(세션): `store.challenge = { teamId, stage, active: { teamId, stage, attempt, resets, seed, team, displayName } | null, result | null }` — 고른 팀 · 고른 단계 · 진행 중인 경기 · 열린 결과 모달.
- 화면 키 `store.screen`: `'challenge'`(목록) · `'challengeMatch'`(경기) 추가.
- `TEAMS_CAP = 50` (store.js) — `addTeam` 은 자르기 전 목록을 돌려준다. `registerTeam` 이 `slice(TEAMS_CAP)`(밀려난 팀)의 도전 기록을 `forgetTeams` 로 지운다(남은 팀과 id 가 같으면 둔다).
- **도전 경기는 `store.match` 슬롯을 빌려 쓴다** (경기 화면이 그것을 읽으므로). 나갈 때(`leaveChallengeMatch(screen, keepSave)` — 기록 · 포기 · 버리기 · [나가기] · [처음으로]) null 로 비운다. 런 경기는 `'soccer.match'` 에 그대로 있고 [이어하기]가 다시 읽는다. `store.run` · `'soccer.run'` · `'soccer.match'` 는 읽지도 쓰지도 않는다 (ui.smoke 와 실제 브라우저 플레이에서 바이트 단위로 같음을 확인).

### 18.6 화면 흐름 (js/ui/app.js)

```text
부트: 엔진 run · match 로드 → challenge.js 따로 동적 import (실패해도 런은 그대로, 도전 모드만 못 연다) → 늘 시작 화면 (런과 같다)
시작 화면: ctx.pendingChallenge() (= peekChallengeMatch 가 'ok') 면 [🏆 도전 모드 — 이어하기] (.challenge-btn.resume, "진행 중: 단계 · n회차")
시작 [🏆 도전 모드] → actions.openChallenge(): restoreChallengeMatch() 성공이면 그 경기, 아니면 'challenge'
'challenge' (renderChallenge) ─ selectChallengeTeam(id) · selectChallengeStage(n) · resetChallenge(id)(confirm) · resetToStart
   [도전] → startChallenge(teamId, n): listChallengeTeams 에서 팀 → isUnlocked → attempt = nextAttempt, resets = teamProgress.resets
            → challengeSetup 확인(고장 난 팀이면 화면 그대로) → store.challenge.active, store.match = null → 'challengeMatch'
'challengeMatch' → renderMatch(root, { ...ctx, matchMode: challengeMatchMode() })   // §18.7
   결과 모달 [확인] → mode.onFinish → finishChallengeMatch(result):
        recordChallenge (recordResult + saveChallengeProgress, at = new Date().toISOString()) → { prev, tp, counted, saved }
          — 엔진 오류 · saved = false(localStorage 쓰기 실패)면 경기 화면 · 저장본 그대로 render() → 결과 모달 [확인] 으로 재시도
        → store.challenge.result (도전 결과 모달 데이터: win · 점수 · 승부차기 · firstClear · counted · wins/attempts · MVP · nextName)
        → store.challenge.stage = 이겼고 다음이 있으면 n+1 → leaveChallengeMatch() → 'challenge' + 결과 모달
   [나가기] → suspendChallenge(): 기록 없이 leaveChallengeMatch('start', keepSave) — 저장본은 남아 [도전 모드 — 이어하기]
   [포기] → forfeitChallenge(): 끝난 경기면 finishChallengeMatch 와 같음, 아니면 confirm → { forfeit: true, win: false, 지금 점수 } 기록
            (saved = false 면 경기 그대로) → 목록 + 토스트
   오류 화면 [처음으로] → resetToStart(): 'challengeMatch' 면 leaveChallengeMatch('start', keepSave) (저장본 유지)
   오류 화면 [도전 경기 버리기] → discardChallengeMatch(): confirm → 기록 없이 저장본 지움 → 'challenge'
도전 결과 모달: [도전 목록] closeChallengeResult · [다시 도전] startChallenge(같은 단계) · [다음 단계 ▶] startChallenge(n+1) (이겼고 다음이 있을 때)
[팀 등록] (런 결과) → addTeam → forgetDroppedTeams(밀려난 팀) — 도전 기록 정리
```

- **peekChallengeMatch** (저장은 바꾸지 않음) → `none` · `unknown`(엔진 · `data.challenge` 없음 — 판단하지 않고 **저장본을 남긴다**) · `invalid` · `ok`. `ok` 조건: `version === 1`, `team.players` 배열, `getStage` 성공, `attempt ≥ 1`, `s.teamId`(있으면) = `teamIdOf(team)`, **아직 세지 않은 도전 번호**(`nextAttempt > attempt` 이면 이미 기록 → 버림), `match.seed === challengeSeed(teamId, stage, attempt, 진행 기록의 resets)`(match 가 없으면 경기 화면이 같은 시드로 새로 만든다 — 초기화 전 경기 저장본은 시드가 달라 버린다). **restoreChallengeMatch** 는 `invalid` 만 지운다.
- **기록은 한 번**: [확인] 연타(match.js `finishing` — ui.smoke 가 떼어진 버튼을 다시 켜고 눌러 확인) · 새로고침 뒤 다시 [확인] · 포기 후 복원 — 모두 `recordResult` 의 도전 번호 검사로도 막힌다 (`counted` 가 결과 모달에 남는다).
- 오류 패널(app.js `errorPanel`, render 예외)은 도전 경기 화면이면 런 [저장 삭제] 대신 **[도전 경기 버리기]** 를 보인다. 경기 화면 자체 오류 화면(match.js `errorScreen` — 셋업 · 경기 생성 실패)은 훅 `discard` 로 같은 버튼.

### 18.7 경기 화면 훅 — `ctx.matchMode` (js/ui/screens/match.js)

```js
ctx.matchMode = {
  label,                 // 점수판 아랫줄 · 결과 모달 제목의 경기 종류 글자 — "도전 3단계" (없으면 L.KIND_LABELS[kind])
  getSetup(),            // 셋업 (없으면 ctx.run.getMatchSetup(store.run, data)) — 도전: challengeSetup(team, stage, attempt, data, { resets })
  save(ms | null),       // 경기 저장 (없으면 saveMatch → 'soccer.match') — 도전: 'soccer.challengeMatch'
  onFinish(result),      // 결과 모달 [확인] (없으면 actions.finishMatch → run.finishMatch) — 정확히 1회(연타 방지 그대로)
  exits: [{ label, title?, danger?, onClick() }],   // 오른쪽 위 버튼들 `.m-exits > .m-exit[.danger]` — 도전: "나가기" · "포기"(danger)
  discard: { label, title?, onClick() },            // 오류 화면(셋업 · 경기 생성 실패)에 더하는 버튼 — 도전: "도전 경기 버리기"
}
```

- 바꾼 곳은 이것뿐이다: 셋업 출처, `saveMatch` 4곳(옛 버전 경기 폐기 · 새 경기 · step · ⏭ simulateAuto) → `persist`, 결과 [확인] 호출, 경기 종류 글자 2곳(결과 제목은 `label ?? KIND_LABELS[kind] ?? ''` — 런 출력 그대로), `.m-exits` 버튼(컷인 층 아래), `errorScreen` 의 discard 버튼. **훅이 없으면 런 경기는 전과 똑같다** (ui.smoke: 런 경기에는 [포기]가 없고 "친선전" 글자 그대로).
- css/match.css `.m-exits`: 상황 배너 띠 오른쪽 끝(top 16px, 버튼 사이 6px). `.stage[data-mode="match"]:has(.m-exits) #toast-root` 로 토스트 칸을 왼쪽으로 좁힌다(right 150px · 폭 250px — `:has()` 없는 브라우저에서는 토스트가 몇 초 버튼을 가릴 수 있다).
- 규칙 · 연출 · 자동 · 개입 · 배속 · ⏭ 는 같다. 배속 · 자동 설정은 새로고침하면 기본값(런 경기와 같음).

### 18.8 도전 화면 (js/ui/screens/challenge.js · css/outgame.css)

- `renderChallenge(root, ctx)` — `ctx.challenge`(엔진 모듈) · `data.challenge` 가 없으면 오류 패널 + [처음으로]. 진행 = `normalizeProgress(loadChallengeProgress())`, 팀 = `listChallengeTeams(loadTeams(), data)`, 사다리 = `ladderView`.
- `.challenge-screen` 격자 (1280×720, 페이지 스크롤 없음): 머리 줄 `.ch-head`("도전 모드" · "플레이테스트" 배지 · 안내 · [처음으로]) / 왼쪽 `.ch-left` = `.ch-teams`(팀 목록 — 안쪽 스크롤, 행 `.ch-team[.sel][.sample]`: 등급 · 이름 · "테스트용" · 포메이션 · 전력 · 점수 · 날짜(샘플 "고정 팀") · 클리어 n/10) + `.ch-team-sum`(선수 7명 `.ch-pl` · 유물 · 전술 · 최근 결과 · 배지 · 클리어 · [진행 초기화] `.ch-reset`) / 가운데 `.ch-ladder`(`.ch-stage[data-stage][.sel]` — 번호 · 상대 · 부제 · 배지 `.ch-feat` · 전력 · 상태 🔒 / 도전 가능 / ✓ n승 n패) / 오른쪽 `.ch-preview`(이름 · 부제 · 티어, 설명, 상대 전력과 우리와의 차, 팀워크, 포제션 · 연장 · 승부차기, 간파 사용권, 성향 · 전술(공격 · 수비 · 텐션), 미니 필드 `.ch-pitch`(lineup.js `slotSpot`, 좌우 반전), 선수 7명(추가 스킬 `.ch-added` "+", 필살기 "★"), [도전] / [다시 도전] `.ch-go` — 잠긴 단계는 disabled "🔒 n−1단계를 클리어하면 열립니다").
- 기본 선택: 팀 = 가장 최근 등록 팀(목록 첫 비샘플), 없으면 샘플 / 단계 = 열린 가장 높은 단계. 팀을 바꾸면 단계 선택을 다시 계산.
- 배지 색 `FEATURE_CLASS`: 액티브 accent · 간파 purple · 필살 슛 / 필살 세이브 gold · 캐논 킥 warn.
- 결과 모달 `.ch-result`(modal-md): 제목 "N단계 클리어!"(첫 클리어) / "N단계 승리" / "N단계 패배", 점수 · 승부차기, "N+1단계가 열렸습니다" / "10단계 전부 클리어!", "n회차 도전", "이 단계 n승 / n전", MVP, 버튼 3개.
- 최근 결과 한 줄 `lastResultText`: "4단계 2회차 · 1:2 패" (승부차기면 괄호), 기권이면 "4단계 2회차 · 기권 패 (0:0)".
- 미리보기 세로 배분: 설명 `.ch-pv-desc` 는 `flex: none`(두 줄 그대로), 미니 필드 `.ch-pitch` 는 `flex: 0 1 150px; min-height: 130px` — 열린 단계의 두 줄짜리 [도전] 버튼(56px)만큼 모자란 5px 는 필드가 내준다(예전에는 설명이 줄어 둘째 줄 아래가 잘렸다 — 4~6 · 8~10단계).
- 시작 화면 (start.js): 메뉴 맨 아래 `.challenge-btn` "🏆 도전 모드" + 아랫줄 "완성된 팀으로 1~N단계 · 등록 팀 N + 샘플 팀" (`data.challenge.stages` 가 없으면 숨김). 진행 중인 도전 경기가 있으면 `.challenge-btn.resume` "🏆 도전 모드 — 이어하기" + "진행 중: 3단계 · 썬더클로 · 1회차"(끝난 경기면 "(결과 확인 전)").

### 18.9 테스트 (npm test 172 — rng 8, run 26, match 24, v05 55, challenge 11, layout 22, orient 5, stage 6, lineup 9, outgame 4, ui.smoke 2)

- **test/challenge** (신규 11): challenge.json(10단계 · 템플릿 존재 · 연속 단계 다른 상대 · 8포제션 목표 경기 · statTarget 증가 · 티어 비감소) / buildStageOpponent(전력 = 목표 ± 반올림, 템플릿 스킬 · 특성 유지, 스킬 · 포지션 유효, 입력 불변) / 스킬 티어 0~5 / 상대 스냅샷(createMatch 검증 · 자동 경기 완주 · 목표 경기 무승부 없음 · 간파 사용권) / teamIdOf / challengeSetup(getMatchSetup 모양 · 시드 결정 · 팀 불변 · 우리 스탯 = 저장본) / 유물 modifier(간파 사용권 · 목표 경기 컨디션) / 옛 등록 팀 방어 / 샘플 팀(모양 · B 등급 · 요약 · 생성 결정적) / 진행 기록(잠김 · 패배 · 클리어 · 한 번만 · 초기화 · 입력 불변) / 기권 · 초기화 시드 · forgetTeams(포기 = forfeit 패, resets 0 = 예전 시드, 초기화마다 새 시드, 저장 왕복, 밀려난 팀 정리).
- **test/ui.smoke** (테스트 수 그대로 확장): 시작 [도전 모드] → 샘플 팀 1단계 → ⏭ → 결과 [확인] → 기록 1회 · 연타 방지(떼어진 버튼을 다시 켜고 눌러도 onFinish 1회) · 도전 결과 모달, 이미 기록된 끝난 경기 저장본은 복원하지 않음, 다음 단계 → 몇 비트 → [나가기](시작 화면 · 저장본 유지 · 기록 없음 · 런 저장 불변) → "새로고침"(메모리 비우고 시작 화면) → [도전 모드 — 이어하기] → 같은 경기, [포기] → 기권 패 기록 · "기권 패" 표시, 진행 초기화(resets 1) → 1단계 1회차 = 새 시드, 기록 저장 실패 → 경기 · 저장본 유지 → 다시 [확인] → 1회 기록, 고장 난 도전 경기 → 오류 화면 [처음으로](저장본 유지) · [도전 경기 버리기](지움), `data.challenge` 없으면 저장본 유지, `store.run` · 런 저장 불변. 런 경기에는 [포기] 없음 · "친선전" 글자.
- **test/outgame** (테스트 수 그대로 4 — 기존 테스트 안에 확장): 도전 화면 — 팀 목록(고장 난 등록 팀 제외), 사다리 상태 · 배지 수(1단계 0 · 10단계 5), 미리보기, 잠긴 단계, 팀 바꾸기, 진행 초기화, 시작 화면 [도전 모드 — 이어하기], `og_challenge_result` 상태의 결과 모달.

### 18.10 도구

- **tools/scenarios.mjs**: `challenge` 모듈 export, 아웃게임 시나리오 `build()` 가 `storage`({ 키: 값 } — 그 밖의 localStorage)를 낼 수 있다. 추가 5개:
  - `og_challenge` — 등록 팀 2개, 첫 팀 1~3단계 클리어 · 4단계 2패 · 5~10단계 잠김, 4단계 미리보기.
  - `og_challenge_sample` — 등록 팀 없음 → 샘플 팀, 1단계만 열림.
  - `og_challenge_resume` — 샘플 팀 3단계 1회차 진행 중 저장본 → 시작 화면 [🏆 도전 모드 — 이어하기].
  - `og_challenge_match` — 같은 저장본 → [도전 모드 — 이어하기] → 도전 경기 화면(수동, 오른쪽 위 [나가기] [포기]).
  - `og_challenge_result` — 샘플 팀이 이긴 2단계의 끝난 경기를 `'soccer.challengeMatch'` 로 주입 → [도전 모드] 가 그 경기로 → 결과 [확인] → 도전 결과 모달.
  - 도우미 `recordPlays(progress, teamId, [[단계, 승?, 우리 골, 상대 골], …])` · `challengeInProgress(data, stage)`.
- **tools/shot.mjs**: 시나리오 `storage` 를 localStorage 에 주입. 부트는 늘 시작 화면이라 시작 대기 조건은 예전 그대로("새 런 시작" · "이어하기" 버튼).
- **tools/challenge_sim.mjs** (신규):

```text
node tools/challenge_sim.mjs [--runs 100] [--teams 6] [--seed 1] [--targets 340,390,...] [--json]
node tools/challenge_sim.mjs --write-sample [--sample-seed challenge-sample-7] [--route-start 1]
```
  - 팀 = 샘플 팀 + sim.mjs `simulateOne`(smart 정책)으로 완주한 팀 `--teams` 개(시드 `challenge-cal-<seed>-<i>`, 루트 시작 i % 3). 단계 × 팀마다 도전 번호 1..runs 로 `challengeSetup` → `createMatch` → `simulateAuto`(A안 자동) — UI 와 같은 시드 규칙.
  - 출력: 팀 표(등급 · 점수 · 전력 · 팀워크 · 포메이션), 단계 표(statTarget · 전력 · 스킬 티어 · 샘플 승률 · 완주 평균(최저~최고) · 전체 · 골 · 연장/PK). `--targets` 는 statTarget 을 메모리에서만 덮어쓴다. export: `parseArgs · loadData · autoTeam · buildSampleFile · applyTargets · runChallengeSim · printSummary`.

### 18.11 보정 (한 번 — GDD 14장 v0.4.5)

`node tools/challenge_sim.mjs --runs 100 --teams 6` (샘플 + B 등급 완주 팀 6개 = 7팀, 단계 × 팀 100판). 목표(B 등급 팀): 1단계 ≥ 85% · 5단계 ≈ 50% · 10단계 ≤ 15%.

| 단계 | 상대 | statTarget 처음 | 승률 처음 | statTarget 조정 후 | 승률 조정 후 (전체 / 샘플) |
|---|---|---|---|---|---|
| 1 | 강변 | 340 | 95% | 340 | 95% / 95% |
| 2 | 아이언후프 | 390 | 95% | 460 | 90% / 89% |
| 3 | 썬더클로 | 450 | 83% | 480 | 81% / 76% |
| 4 | 실버리프 | 515 | 67% | 525 | 65% / 55% |
| 5 | 프로스트베일 | 590 | 51% | 590 | 51% / 43% |
| 6 | 엠버스론 | 680 | 31% | 610 | 39% / 35% |
| 7 | 썬더클로 (각성) | 735 | 42% | 790 | 34% / 31% |
| 8 | 실버리프 (각성) | 790 | 30% | 830 | 26% / 21% |
| 9 | 프로스트베일 (각성) | 850 | 19% | 875 | 18% / 16% |
| 10 | 엠버스론 (각성) | 920 | 10% | 920 | 10% / 7% |

- 처음 기하 배치에서 6단계(보스 — 고유 필살 슛 · 필살 세이브 + 티어 2 액티브)가 7단계보다 어려워 6을 내리고 2 · 3 · 7~9를 올렸다. 6단계 39% ≈ 실제 시즌 3 보스전 승률(약 40%).
- `--seed 2`(다른, 조금 강한 팀 6개): 96 / 92 / 84 / 69 / 58 / 46 / 40 / 25 / 23 / 18% — 순서 유지.
- 후보 목표 묶음 두 개를 `--targets` 로 비교한 뒤 한 번 바꿨고 이후 조정 없음 (#61).

### 18.12 남은 문제 (GDD 16-39~44)

1. ~~포기 표시 없음~~ → 리뷰 수정: `lastResult.forfeit` · "기권 패". 남은 질문: 기권을 전적 "n패"에 그대로 셀지(지금 셈).
2. ~~진행 중인 도전 경기 우선(부트가 바로 경기로)~~ → 리뷰 수정: 부트는 시작 화면, [도전 모드 — 이어하기], 경기 중 [나가기]. 진행 중인 도전 경기가 있는 동안 [도전 모드]는 늘 그 경기로 간다(다른 단계를 하려면 끝내거나 포기).
3. **포제션 고정 8** (런 목표 경기는 8 / 10 / 12) — 단계별 `possessions` 로 바꿀 수 있다.
4. **1000 넘는 스탯 그대로 표시** (10단계 GK 1580) — 표시를 자를지, 스탯 대신 다른 축으로 난이도를 올릴지.
5. **경기 전 전술 변경 없음** — 등록 팀 저장 전술 그대로.
6. **클리어 보상 · 첫 클리어 보너스 없음.**
7. **등록 팀 저장 범위**: 런 중 이벤트 · 루트 modifier 는 등록 팀에 없어 빠진다(유물만 다시 계산).
8. 등록 팀 이름이 대부분 "우리 클럽"이라 목록에서 등급 · 점수 · 날짜로만 구별된다. 시작 화면 "등록 팀 N" 숫자는 고장 난 저장본까지 센다(도전 목록은 뺀다).
9. `:has()` 없는 브라우저에서는 경기 화면 토스트가 몇 초 동안 [나가기] [포기]를 가릴 수 있다.
10. 경기 밸런스를 일괄 조정하면(GDD 16-25) 단계 승률도 움직인다 — 그 뒤 `challenge_sim.mjs` 로 statTarget 을 다시 맞춘다.

## 19. 이름 변경 — 전원 여성 · 여성형 이름 (2026-10-01, GDD v0.5 0.1 #71 · 이름 변경 표)

규칙 · 수치 · 난수 · id 는 그대로. 화면에 보이는 이름과 그 이름이 들어간 문구만 바꿨다 (`tools/sim.mjs --runs 40 --seed 3` 출력이 바꾸기 전과 같다).

- **데이터**: `characters.json` 선수 5명, `supports.json` 카드 이름 6장(`sp_mountain_monk` 은 칭호도 "수도사 한" → "수행자 한나", 소개 "수도사" → "수행자"), `opponents.json` 상대 선수 32명(이름 칸 정렬 빈칸만 함께 맞춤), `events.json` `ev_sp_harr_60` 제목 "하르나의 눈", `challenge_sample_team.json` 선수 이름(팀 · 스냅샷 둘 다). 옛 → 새 전체 표는 GDD 0.1.
- **id 불변**: `ch_*` · `sp_*`(예: `sp_coach_harr`) · `sk_*` · `ev_*` · `op_*`. 테스트의 로마자 지역 변수만 새 이름으로 (`ID.dorbina` · `taria` · `ulrika` · `greta` · `adeline`, `TARIA`, `kasha`).
- **조사**: 문서 · 테스트 · 도구 문구의 이름 + 조사를 새 이름 받침에 맞춤 (예: "타린이" → "타리아가", "울릭(크로서)이" → "울리카(크로서)가", "마르텐과" → "마르타와"). 런타임에 이름을 넣는 문구는 이미 `withJosa`(layout.js)라 코드 변경 없음.
- **합성 테스트 이름** (`test/layout.test.mjs` `NAMES.away`, 데이터에 없는 이름): 카손 → 카샤, 브란 → 브란디, 케일 → 케일라. `withJosa` 받침 있는 경우 검사는 "카손이" 대신 `withJosa("아델린", "이/가") → "아델린이"`.
- **저장본**: 런(`createRun` 이 `ch.name` 복사) · 등록 팀 · 진행 중인 경기 저장본은 만들 때의 이름을 그대로 가진다 — 이미 브라우저에 저장된 것은 옛 이름으로 보인다. 옮기지 않는다(새 런부터 새 이름). 서포트 카드 이름은 화면에서 데이터로 다시 읽어 새 이름.
- **남은 것**: 이벤트 문구의 `{player}가` · `{player}를` 처럼 치환자 뒤 조사는 고정이다(`substitute`, run.js). 새 이름 중 받침이 있는 선수는 아델린 · 실루엔뿐이라(서포트 카드는 이제 전원 받침 없음) 이 둘이 이벤트 대상이면 "아델린가"처럼 나온다 — 바꾸기 전부터 있던 문제(옛 이름은 선수 4명 · 서포트 3장이 해당).

## 20. v0.6-lesson 1차 — 카드 레슨 시험판 (브랜치 `outgame-lesson`, 2026-10-02)

육성(훈련 칸 · 서포트 배치 · 호출권)을 **카드 레슨 배틀 + 15주 주 선택**으로 바꾼 시험판이다. 경기 · 도전 모드 · 평가 · 팀 등록은 그대로다. 구현 계획 전문과 구현 중 바뀐 것은 [LESSON_PROTO_PLAN.md](LESSON_PROTO_PLAN.md) (§13 · 구역 방식 §14 · §14.21), 규칙은 [OUTGAME_LESSON_draft.md](OUTGAME_LESSON_draft.md) (L1~L40) · [OUTGAME_CARDS_draft.md](OUTGAME_CARDS_draft.md) (고유 카드 모양 §3 · 코치 추가 능력 표 §4.1). 고유 카드 모양(L40)은 계획 §16. 이 절은 그 계약의 요약이다.

**구역 방식 (L32~L36, 2026-10-04 — 계획 §14).** 레슨은 **훈련 구역 5곳**(경기장 위 수비 · 패스 · 슈팅 / 아래 피지컬 · 드리블) 위에서 한다.
- 레슨 주에는 종목 대신 **중점 구역** 1곳을 고른다 (서 있을 가중치 ×2 · 그 구역 상승 ×1.5, 특별 표시 구역이면 ×2.0 · 목표 ×1.15 · 상한 ×1.2) [가정].
- 매 턴 시작에 7명이 포지션 가중치(`lesson.json zones.weights` — config `slotWeights` 사본, GK 만 DF 와 같게 [가정 Q1-a])로 구역에 **흩어진다**. 오르는 스탯 = 그 선수가 **서 있는 구역**.
- 카드는 **끌어다 놓는다**: 단일(선수 위) · 원(작은 4.2u / 중간 9u / 큰 17u — 놓은 자리의 원 안 전원) · 전체 · 주인(고유). 위력 · 비용은 1인당, 실패 판정은 카드 1장에 1번.
- **기본 훈련**: 매 턴 끝 경기장 선수 모두 3.2 × 구역 성장률 × 배율 (체력 −1, 레슨 성장의 약 3분의 1). 자율 훈련 · [쉬기] 는 없어졌다.
- **벤치**: 지친 선수를 벤치 칸으로 끌면 그 턴 대상 · 기본 훈련에서 빠지고 턴 끝 체력 +15 (한 턴 최대 2명).
- 레슨 점수 = 7명의 구역 스탯 상승 전부 (기본 + 카드, 실패 −5). 목표 / 퍼펙트 344/416 · 408/496 · 480/584 (L39 — 20% 낮춤, 특별 레슨 배율 그대로).

**코치 지원 · 컷인 (L37) · 작은 원 카드 (L38), 2026-10-04 — 계획 §15.** 레슨 시작에 붙을 턴을 정하고 (`lesson.json attach.count` 4~5 — 컷인이 레슨당 2~4번이 되게), 그 턴 손패 1장에 편성 코치 1명이 **붙는다** (그 턴만 한 단계 강화, 비용 그대로). 붙은 카드를 내면 **코치 컷인**(첫 번 0.9초 · 다음부터 0.6초, 탭 · Enter · Space · Esc = 넘기기) 뒤 그 코치의 **추가 능력**(`attach.abilities` 8명 — 이름 · 문구 · 컷인 대사 `line` · mods · effects) + 유대 +5. 작은 원 카드 8장 (새 공용 2장 · 단일 → 작은 원 2장), 카드 68장.
- 엔진: `lesson.js` 붙기 · 강화 · 컷인 fx (`lastFx[0]` = `{ t: "cutin", … repeat }`) · 능력 · 뷰 `attach` (손패 카드 뷰에도) · `previewCard.attach` · 노트, `lessonRun` 레슨 끝 컷인 힌트, `manager` 능력 가치 · `ATTACH_BONUS`.
- UI: 붙은 카드 = `.card-face.attached` + `co-<코치 타입>` (테두리 · 빛 · 흐르는 줄무늬 띠 = 코치 타입 색 `--coach`), 메타 줄 맨 앞 코치 칩 `.cf-coach` (얼굴 + "하르나 지원"), 지원 강화 "+" = 코치 색, 끌기 유령에 코치 얼굴. 컷인 덮개 `.ls-cutin` (레슨 화면 전체, `screens/lesson.js` · `css/lesson.css` — 경기 `.m-cutin` 은 건드리지 않는다): 코치 타입 색 띠 · 얼굴 · 이름 · 대사 · 능력 · 낸 카드, 두 번째부터 `.short`. 닫히면 카드 연출 (대상 고리 = 코치 색, 능력 배율이 걸린 대상 "+N ×1.5") + 경기장 가운데 능력 알약 `.ls-abil` (유대 · 힌트 · 컨디션). 움직임 줄이기면 덮개 없이 dock 안내 칸. `lesson_layout.fxPlan` 이 `cutin · attach · play.bond · play.hints · play.condition` 을 꺼낸다. 보상 모달 "지원 N번" 칩 + 컷인 힌트 얼굴.

**고유 카드 모양 (L40, 2026-10-04 — 계획 §16).** 고유 카드의 대상 모양을 **주인의 연계 특성**이 정한다 (`data/traits.json` 특성마다 `lesson` 블록 — 같은 특성 = 같은 모양, 카드에는 위력 · 비용률 · 남긴 효과 · 문구만). 주 스탯 구역 ×1.5(`lesson.unique`)는 없어졌다.
- 모양 7종 (닫힌 목록 `cards.SHAPE_KINDS`): 이어 주기 `link` (빠른 배급 — 주인 + 받는 선수, 받는 쪽 ×1.3) · 연결 `pick` (킬패스 — 고른 쪽 ×1.5) · 크로스 = `pick` + `onlyZones: [shoot]` (크로서 — 팀워크 +1, 슈팅 구역이 비면 낼 수 없음) · 주인 둘레 원 `ownerCircle` (철벽 작은 8u + 실패 없음 · 타깃맨 중간 15u + 주인 ×1.5) · 주인 구역 전원 `ownerZone` (주장 — 팀워크 +2) · 자리 옮기기 `move` (침투 — 주인을 놓은 구역으로, ×1.3, 그 턴 기본 훈련도 새 구역) · 가로지르기 `carry` (볼 운반 — 지금 구역 + 놓은 구역 두 행) · 마무리 = `owner` + `zoneMult` (피니셔 — 슈팅 구역 ×2, 지금 주인 캐릭터 없음).
- 엔진: `cards.shapeOf · shapePlan`(행 = 상승 1번, `T` = 서로 다른 선수 — 비용 · 실패 · 팀워크 단위) · `validateShapeData` · `zones.zoneAt`(놓은 점 → 구역, `dropR` 12u), `lesson.playCard / previewCard / dropCandidates` 가 `{ playerId }` · `{ zone }` · `{ at }` 을 받는다. fx `move` · `pass`, 미리보기 `shape` (`line · circle · from · to · positionsAfter · baseDelta`). 옮기기는 `L.zones`만 바꾼다 (저장 형식 그대로). 감독 AI 는 EV 에 `baseDelta` 를 더한다.
- UI: 카드 앞면 모양 칩 · 아이콘 `.cf-ticon.s-<kind>` · 배율 칩, 조준 표시 `.aim-link`(패스 선) · `.aim-circle.owner` · `.aim-arrow` · `.aim-ghost` · `.zone-pad.aim / .from / .bad`, 조준 중 **주인 토큰 끌기**(받는 선수 · 구역으로), 받는 선수 · 구역 바닥 누르기, 숫자 1~5 = 구역, 연출 = 주인이 달려가고 공이 호를 그린다.

### 20.1 주소 · 저장 분리

- **플레이**: `https://zerocoke8.github.io/soccer/lesson/` (본편 `/soccer/` 와 같은 origin). 배포는 main 의 `pages.yml` 이 `outgame-lesson` 브랜치를 `_site/lesson/` 으로 함께 올린다 (계획 §2.3 — D 슬라이스).
- **저장 키**: `js/ui/store.js` `STORAGE_PREFIX = 'soccer-lesson.'` → `KEYS.run · match · teams · challenge · challengeMatch` (+ `soccer-lesson.orient` 등). 본편 키(`soccer.*`)는 읽지도 쓰지도 옮기지도 않는다 — 그래서 레슨판 도전 모드는 처음에 샘플 팀만 보인다. 앱 · 도구 코드에 `'soccer.'` 문자열이 없어야 한다 (outgame.test 검사). 시작 화면 배지 "카드 레슨 시험판 — 본편과 저장이 따로입니다", `<title>` "경계전 클럽 — 카드 레슨 시험판".
- **저장본 검사**: `loadRun` · `continueRun` 은 `kind === "lessonRun" && version ∈ {1, 2} && typeof phase === "string"` 인 저장본만 연다 (`lessonRun.isLessonRunSave`, store.js 사본 `LESSON_RUN_SAVE_VERSIONS` · `isLessonRunSave`). 구역 방식 저장은 version 2 — v1 은 `migrateLessonRun` 으로 옮기고, **레슨 중** v1 은 옮길 수 없어 지우고 토스트 "구역 방식으로 바뀌어 진행 중인 레슨은 이어 할 수 없습니다". 옛 run.js 저장본은 "저장 없음".

### 20.2 엔진 (순수 · 결정적, DOM 없음)

| 모듈 | 내용 |
|---|---|
| `js/engine/zones.js` | 구역 기하 (순수): `ZONE_IDS` · 대형 위치 `huddleOffsets · zonePositions` · 거리 `distU`(u = 필드 폭 1%, 세로는 × aspect 0.405) · `inCircle · nearestWithin · clampPoint · areNeighbors · zoneWeight` · 놓은 점 → 구역 `zoneAt` (L40) · 키보드 · 감독 AI 후보 점 `candidatePoints` |
| `js/engine/cards.js` | 카드 68장 정의 해석(`resolveCardDef` — base → 유대 80 → 강화판), 대상 모델(kind single · circle · all · owner · none, size, onlyZones) · `targetsFor(state, def, { at, playerId }, data)` · `deadReason`, 고유 카드 모양 (L40) `SHAPE_KINDS · shapeOf · shapePlan · shapeView · validateShapeData`, `mainStatsOf(pos)`, 1인 비용 `costBase · staminaCost`, 데이터 검증 (cards.json version 2) |
| `js/engine/lesson.js` | 레슨 카드 배틀 (`startLesson · playCard({ uid, at, playerId }) · benchPlayer · endLessonTurn · getLessonView · previewCard · dropCandidates · lessonResult`), 흩어지기 `scatterZones`(rng) · 기본 훈련 · 벤치, 방침 버프 5종(구역 기준), 코치 지원 · 컷인 (§15), `seq` · `lastFx` (연출 목록 — scatter · base · bench · attach · cutin 포함) |
| `js/engine/lessonRun.js` | 15주 상태 머신 = 앱의 `ctx.run`. 주 행동 · 레슨 뒤 보상 · 상담 · 경기 전 준비 · 경기 · 유물 · 루트 · 평가. run.js 의 경기 · 평가 함수를 그대로 다시 내보낸다 |
| `js/engine/manager.js` | 감독 AI (rng 없음): `recommendWeek · recommendCard · recommendReward · recommendConsult · recommendPrep · autoStep` |
| 데이터 | `data/cards.json`(68장) · `data/lesson.json`(주 · 레슨 · 보상 · 상담 · 코치 지원 `attach` 수치 · `zones.ownerRadius · dropR`) · `data/policies.json`(방침 5) · `data/traits.json` 의 `lesson` 블록 (고유 카드 모양 — 경기 엔진은 읽지 않는다) |

- 옛 `run.js` · `training.js` · `effects.js` · `rating.js` 는 남는다 (`ai.js` 가 run.js 를 import). 옛 파일에는 export 만 더했다 (§5.6, 동작 불변).
- **경기 쪽 파일은 바이트 하나도 바꾸지 않는다**: `js/engine/match.js · ai.js · skills.js · rng.js`, `js/ui/screens/match.js`, `js/ui/layout.js`, `css/match.css` — `git diff --stat main -- <이 7개>` 가 비어 있어야 한다.
- 런 흐름: 시즌 3 × 5주 (레슨 · 자유 · 레슨 · 자유 · 대비) → 경기 전 준비 → 경계전 → (유물) → 루트. 1차에는 이벤트가 없다 (`lesson.events.support = false`, 라우팅 · `supportEventCheck` 단계만 남김).
- 등록 팀 = `run.finalizeRun` 과 같은 모양 + `policy` (`createdTurnIndex` 14). 도전 모드 `buildChallengeTeamSnapshot` 을 그대로 통과한다.

### 20.3 화면 · 라우팅 (js/ui/app.js `render()`)

| phase | 화면 |
|---|---|
| `week` | `screens/week.js` — 레슨 주(중점 구역 5 + 휴식 — 예상 인원) · 자유 주(행동 3 + 휴식, 보장 배지) · 대비 주(대비 카드 2장 + 중점 구역 5), 추천 배지, 외출 모달, 전술 미팅 모달(`js/ui/meeting.js` `meetingEditor`) |
| `lesson` | `screens/lesson.js` (stage mode `lesson`) — 화면을 유지하는 DOM + 연출 루프(GEN · alive). 구역 바닥 · 라벨 칩, 토큰 = 뷰 positions(대형), 카드 끌기(Pointer Events — 마우스 · 터치 같은 코드, 프레임마다 `previewCard`) · 조준 모드(클릭 · 터치 탭 · 키보드 ← → / 1~5 / Enter / Esc) · 벤치 칸, 카드 앞면 `js/ui/cards.js`, 좌표 · 원 · 연출 계획 `js/ui/lesson_layout.js`(`pointerToField · circlePx · tokenSpots · fxPlan`), 개발용 `?autolesson=1` |
| `reward` | 레슨 화면(inert) + `screens/reward.js` 보상 모달 (클리어 · 퍼펙트 · 실패) |
| `consult` | `screens/consult.js` (진열 · 덱 · 스킬 3단, 행동마다 엔진 호출 + 저장) |
| `prep` | `screens/prep.js` (상대 패널 + `meetingEditor`, [경기 시작]) |
| `event` · `relic` | 주 화면(inert) 위 모달 — event 는 1차에 나오지 않는다 |
| `match` · `route` · `finished` | 그대로 (경기 화면 · 루트 · 결과) |

- 레슨 화면 호출은 `actions.lessonCall(fn, args)` (저장만, render 없음 — 화면이 연출을 이어 그린다). 화면 상태 `store.lessonUi = { aim, drag, shownSeq, busy, timer, gen }` — 판정(원 안 · 가장 가까운 선수)은 늘 엔진이 필드 좌표로 한다. 터치 탭의 원 자리는 click 이 아니라 `pointerup` 좌표다 (브라우저 터치 보정이 click 을 토큰 쪽으로 몇 px 당긴다). 나머지는 `weekAction · resolveReward · consultAction · endConsult · confirmPrep` + 기존 `finishMatch · chooseRelic · chooseRoute · registerTeam`.
- 추천은 배지만 붙인다 (자동 진행 버튼 없음). 결과 화면은 레슨 런이면 선수 줄의 "훈련 N회" 를 뺀다 (레슨 런에는 훈련 횟수가 없다).
- CSS: `css/lesson.css` (주 · 레슨 · 보상 · 상담 · 준비 · 편성 방침 패널), `match.css` 다음에 링크.

### 20.4 도구 · 시나리오

- **tools/lesson_scenarios.mjs**: `walkLesson(data, { seed, policy, until })` (감독 AI 로 걷다가 조건을 만족하는 첫 상태), `prepareLessonMatch(data, { runSeed, kind })` (기본 편성 레슨 런 → 친선전이 열린 첫 자유 주의 친선전 / 첫 경계전 직전), `lessonRegisteredTeam(data, seed, registeredAt, policy)` (완주 → 등록 팀), `perfectRewardState`, 그리고 레슨판 og_* 시나리오 (`LESSON_OG_SCENARIOS`).
- **tools/scenarios.mjs**: `run` = lessonRun.js, `prepareRun` = `prepareLessonMatch` (경기 시나리오 01~27 도 레슨 런의 경기에서 찾는다 — 옛 run.js 는 더 쓰지 않는다). 시나리오에 `maxSeeds`(기본 400) · `allowInnerScroll`(의도한 안쪽 스크롤) 를 둘 수 있다. `27_df_block_cutin` 은 레슨 런 팀에서 실루엔 게이지가 함께 차 합체기가 되므로 바람의 실을 빼고(`adjustSetup`) 1000 seed 안에서 찾는다.
- **og_\* (레슨판)**: `og_start`(등록 팀 2 = 감독 AI 로 완주한 레슨 런, 역습형 · 팀형) · `og_setup*` · `og_challenge*` · `og_week_lesson / _free / _prep / _hotspring` · `og_outing` · `og_meeting / _drag` · `og_lesson` + 조준 `_aim_pick _aim_single _aim(큰 원) _small(작은 원) _keys` · 끌기 `_drag _drag_ghost _drag_bad _drag_single _drag_heal _drag_bench` · 놓기 `_drop _drop_bench _play` · 터치 `_touch(탭 → 원 놓기) _touch_drag` · 벤치 `_bench` · 턴 끝 `_base _scatter _turnend` · 대형 `_crowd(6+1) _crowd7 _crowd_aim` · `_mid _tired _injury _fail _end _hand4 _auto` · 코치 지원 `_attach _attach_aim _attach_drag _cutin(첫 컷인 중간 프레임) _cutin_after(능력 연출) _cutin_short _cutin_noanim`(`attachInject` 주입) · 고유 카드 모양 (L40, `shapeScene` 구역 · 손패 주입, 미르카 편성 `MIRKA`) `_u_hand _u_hand2 _u_link(주인 토큰 끌기) _u_link_aim _u_link_bad _u_pick _u_cross _u_cross_dead _u_wall _u_zone _u_post _u_move _u_move_card _u_move_key _u_move_after _u_carry _u_carry_bad _u_carry_play _u_link_play _u_link_pop` · `og_reward_unique` + 방침 5 (`_ace _team _counter _press _poss`) · `og_reward_clear / _pick / _perfect / _fail` · `og_consult / _pick / _full / _delete` · `og_prep / _swap` · `og_event`(2차 라우팅 확인용 주입 — 유대 60 서포트 이벤트) · `og_relic` · `og_route`(온천 설명 = `lesson.json routeOverrides`) · `og_result`. 구역 배치는 `zones` 주입(`crowdState`), 손패 카드는 `withHandCard` 주입.
- **tools/shot.mjs**: 잘린 글자 검사 = 스킬 묶음 이름 · 카드 앞면(`.cf-name · .cf-desc · .cf-power · .cf-target · .cf-cost · .cf-reason`) · 작은 카드 이름(`.mc-name`) · 보상 선수 칩 · 주 화면 중점 구역 카드 · 방침 설명 · 레슨 명단 이름(`.ls-nm b`) · 레슨 토큰 이름. 겹침 = 떠 있는 토스트 ↔ 레슨 점수 막대 · 턴 점, 레슨 경기장의 이름표 ↔ 이름표 · 다른 얼굴, 구역 라벨 칩 ↔ 얼굴 · 이름표 · 실패율 표 · 원 꼬리표, 원 꼬리표가 경기장 밖, **원 판정**(그린 원 안에 얼굴 중심이 있는 토큰 = 엔진 미리보기 대상 `.target`, 테두리 ±3px 제외). 요약 끝 줄에 검사에 걸린 시나리오 이름(페이지 · 로그 아닌 안쪽 스크롤 · 잘림 · 겹침 · 상태 · 에러). 조작 단계 `{ freeze }` · `{ click | text }` · `{ drag: { from, to, at?, release?, touch? } }` · `{ hoverAt | clickAt | tapAt: { sel, x, y } }` · `{ tap }` · `{ key, times }` · `{ pauseAnim }`(CSS 애니메이션 멈춤 — 컷인 중간 프레임) · 함수형 `steps(prepared)` · 시나리오 `query` · `viewport`(터치는 `hasTouch`) · `reducedMotion`. 잘림 검사에 컷인 `.lc-txt b · .lc-sub · .lc-line` · 코치 칩 `.cf-coach` · 안내 칸 지원 줄.
- **tools/lesson_play.mjs** (ZI 브라우저 한 판 점검): 헤드리스 Chrome 에서 시작 → 편성 → 런을 **실제 입력**으로 진행한다. 레슨은 감독 AI 추천을 마우스 끌기 · 터치 끌기 · 터치 탭(카드 → 자리 → 한 번 더) · 마우스 클릭 · 키보드로 돌아가며 내고(벤치 = 토큰 끌기 / [벤치], 회복 = 명단 줄), 행동마다 엔진이 바뀌었는지 · 실제 대상(lastFx)이 놓기 직전 화면의 대상(흰 고리)과 같은지 확인한다. 주 · 보상 · 상담 · 준비 · 경기(⏭ → 확인) · 유물 · 루트도 화면 버튼으로. `--until season|lesson|run` · `--mobile --touch-only --width 915 --height 412`(터치 전용 작은 화면). 화면마다 PNG, 에러 토스트 · 페이지 에러 · 스크롤을 센다. 코치 지원 카드를 내면 컷인이 뜨는지 보고 3번 중 2번은 클릭 · 탭으로 넘기고(바로 닫히는지) 1번은 저절로 닫히는지 본다. 레슨마다 붙기 · 컷인 수 (엔진 `lessonResult` = 화면에서 본 컷인 수인지)와 평균 · 2~4번 비율 · 분포를 보고한다. **고유 카드 모양 (L40)**: 모양마다 입력을 돌아가며 쓴다 (이어 주기 = 카드 클릭 · 탭 → 주인 토큰 끌기, 연결 · 크로스 = 카드를 받는 선수 위로, 자리 옮기기 = 카드를 구역으로, 가로지르기 = 숫자 키, 둘레 원 · 구역 전원 = 카드 탭 두 번 + 마우스 · 터치 끌기 · 탭 · 클릭 · 키보드). 놓기 직전 화면에서 읽은 **행**(흰 고리 대상 + 놓을 바닥 `.zone-pad.aim` · 가로지르기 지금 바닥 `.from` → 선수:스탯)이 실제 `lastFx` 행과 같은지, 패스 선 · 화살표 · 유령이 보이는지, `move` · `pass` fx 가 났는지 본다. 아직 안 낸 고유 카드가 낼 수 있으면 감독 추천보다 먼저 내고 (`--no-cover` 로 끔), 끝에 덱의 고유 카드가 모두 1번 이상 나왔는지 확인한다. `--slot FW2=ch_cat_trickster` = 편성 화면에서 슬롯을 눌러 선수를 바꾼 판 (미르카).
- **tools/lesson_sim.mjs** (`npm run lesson-sim`): 실제 엔진 + 감독 AI + 실제 match.js 로 방침별 지표 표. 보고만 하고 수치는 바꾸지 않는다 (밸런스는 나중에 한 번에).

```bash
node tools/shot.mjs <출력폴더>                      # 경기 01~27 + og_* 전부 (126장)
node tools/shot.mjs <출력폴더> --only og_lesson,og_lesson_   # 이름이 정확히 같으면 그것만 → 접두어도 함께 준다
node tools/lesson_play.mjs <출력폴더>                 # 실제 입력(마우스 · 터치 · 키보드)으로 시즌 1 (레슨 3 · 경계전 · 루트)
node tools/lesson_play.mjs <출력폴더> --until run --policy counter --seed play-2       # 15주 완주
node tools/lesson_play.mjs <출력폴더> --slot FW2=ch_cat_trickster --seed play-m1    # 미르카 편성 시즌 1 (가로지르기)
node tools/lesson_play.mjs <출력폴더> --mobile --touch-only --width 915 --height 412  # 터치 전용 작은 가로 화면
```

### 20.5 테스트 (npm test 325)

- 새 테스트: `zones`(대형 · 거리 · 원 크기 약속 · 후보 점) · `cards`(카드 표 · 대상 모델 · 1인 비용) · `lesson`(흩어지기 · 기본 훈련 · 벤치 · 대상 판정 · 방침 · 66장 퍼즈) · `lessonRun`(15주 흐름 · 보상 · 상담 · 등록 팀 · 저장 v1 → v2) · `manager`(감독 AI 완주, 실제 경기, 추천이 늘 유효한 행동) · `cardEffects`(66장 효과 표, 구역 고정 픽스처) · `lessonRules`(규칙 · 키 매핑) · `lessonLayout`(`pointerToField · circlePx · tokenSpots · fxPlan` — 코치 지원 fx 포함) · `lessonUi`(jsdom: 조준 → 경기장 클릭 · 키보드 후보 · 벤치 · 턴 끝 재배치 · 코치 칩 · 컷인 덮개 넘기기 · 짧은 판 · no-anim 안내 · 보상 · 상담 · 준비). 끌기 · 터치는 jsdom 에 레이아웃이 없어 shot 시나리오(`_drag* _drop* _touch*`)와 `tools/lesson_play.mjs` 로 본다. L40 고유 카드 모양: `cards`(모양 데이터 · 검증 · 8장 표) · `zones`(`zoneAt` · 주인 둘레 원 약속) · `lesson`(모양 7종 미리보기 = 실제 · 옮기기 · 가로지르기 · 피니셔 픽스처 · 68장 퍼즈에 모양 인자) · `manager`(`baseDelta` · 미르카 편성 완주) · `lessonUi`(모양별 조준 → 내기 · 주인 토큰 누르기) — 주인 토큰 끌기 · 패스 선 · 유령은 `og_lesson_u_*` 와 `lesson_play` 로 본다.
- **ui.smoke 전체 걷기** (I1): 기존 걷기(시작 → 편성 방침 → 주 → 레슨 1장 → 친선전 경기 → 시나리오 주입 경기 01~27 → 도전 모드) 뒤에 — 새 런(역습형, seed `ui-full`) → **15주를 감독 AI 추천대로 앱 actions 로** (주 · 레슨 · 보상 · 상담 · 준비 · 경기 · 유물 · 루트, phase 가 바뀔 때마다 그 화면이 그려졌는지 · 에러 토스트 없음) → 결과 화면(훈련 횟수 없음) → [팀 등록] (policy · createdTurnIndex 14) → 시작 화면 등록 팀 → 도전 모드 팀 목록에 그 팀(기본 선택, 선수 7) → 그 팀으로 도전 경기 생성. 본편 키(`soccer.run` · `soccer.teams`)는 끝까지 그대로.
- 옛 테스트(`rng · run · match · v05 · challenge · layout · lineup · orient · stage`)는 그대로 통과한다.

### 20.6 남은 것 (2차 이후)

- 이벤트(주간 · 시즌 시작 · 경계전 직전 · 루트 · 유대 60 서포트 · 레슨 깜짝 · 외출 이야기)는 1차에 없다. 유대 60 은 표시만 한다.
- 밸런스: 시뮬 결과만 보고했고 수치는 조정하지 않았다 (계획 §10.1 · §14.18, `npm run lesson-sim`). 사용자에게 확인받을 결정: 계획 §7 D5 · D6 · D8 · D12 · D13 · D29 · D35 · D1, 구역 방식 §14.20 [가정] 1~9 · Q1~Q5 (Q1 고르게 크기 — GK 가중치 사본 · 감독 AI 덜 큰 선수 보너스를 기본값으로 넣었다, §14.21).
- 큰 원(17u)이 22.7u 이웃 두 구역의 4명 무리 둘을 다 잡는 여유는 0.15u(약 1.5px)라 손 · 터치로는 가장자리 1명이 자주 빠진다 (화면 미리보기는 늘 실제와 같다 — §14.21 ZI).
- 도전 모드 샘플 팀 · 등급 기준선은 옛 육성 기준 그대로다.
- 대비 주 카드 미리보기는 `miniCard` 가 아니라 주 화면 안의 작은 카드(`.prep-mini`)다.
