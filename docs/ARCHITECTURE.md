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
| `data/characters.json`, `data/supports.json`, `data/events.json`, `data/skills.json`, `data/relics.json`, `data/opponents.json` | 데이터 | 콘텐츠 |
| `test/**`, `tools/sim.mjs` | 통합 | 테스트, 헤드리스 시뮬 |
| `docs/**`, `README.md`, `package.json` | 기획 | 문서 |

데이터 로딩: 브라우저는 `fetch('./data/x.json')`, Node는 `fs.readFileSync`. 엔진은 로딩을 모른다.

```js
// UI 또는 테스트가 만들어 엔진에 넘기는 데이터 번들
const data = {
  config, characters, supports, events, skills, relics, opponents, routes
};
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
  "name": "코치 하르",
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
  "attackingSide": "home", "phase": "decision",   // "decision" | "resolved" | "possessionEnd" | "extraTime" | "penalties" | "finished"
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
| DF 라인(line 2) 또는 GK 세이브 | 0 |
| 버티기(hold)로 뺏음 | 위 기본값 − `match.holdStartBack`(기본 1), 최소 0 → line 0 에서 1, line 1·2 에서 0. intercept·steal 보너스 없음 (GDD #54) |
| 킥오프 (경기 시작 · 골 후) | `match.kickoffLine` (기본 1 = 중원) (GDD #55) |
`steal` 스킬: +1 (최대 2). 시작 carrier: line 0 → DF 중 pass 최고, line 1 → MF 중 dribble+pass 최고, line 2 → FW 중 shoot 최고 (`tactics.kickoffPlayerId`가 있고 라인이 맞으면 그 선수).

### 7.6 종료
- friendly: possessionsTotal 후 종료, 무승부 허용.
- goal/arena: 동점이면 extraTimePossessions(각 팀 1회씩 공격) → 여전히 동점이면 승부차기 penaltyShots(슛 vs GK, 교대) → 동점이면 서든데스.

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
- 우리 팀 원소 공명: v0.1 배포 후 미르카(ch_cat_trickster)를 바람으로 바꿔, 바람 3명(실루엔·울릭·미르카) 편성 시 공명 가능. 시즌3 상대 팀은 불 4 / 물 5.
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
//   banner: null | string,                              // 구역이 바뀌는 비트에서 UI 가 띄울 한 줄 (예: "⚠ 슈팅 위기 — 카손이 우리 박스 진입, 네리아와 1:1")
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
- (수정 라운드) `test/layout.test.mjs` 추가: 경기 종료 모습(합성 3종 + 실제 300경기), 패스 후보 = 도착 구역(양 팀·extraLine), resolvePreview, 자동 진행 중 그린 패스 후보 = 실제 수신자(라인 브레이커 편성), UI 실제 범위(aspect 0.74~1.3 · tokenSize 0.0866~0.09, 합성·실제·승부차기) 겹침 없음·규칙 위치. `test/match.test.mjs`: 스킬 변형 미리보기 = 실제(1-3-2 울릭 DF1 + 소매치기). `test/ui.smoke.test.mjs`: 연출 중 배속 클릭 시 스코어·로그 그대로, 자동 OFF → 개입 해제, 종료 모습의 carrier.
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
실루엔 killpass, 울릭 crosser, 그룸바 targetman, 타린 runner, 미르카 carrier, 돌바르 wall, 네리아 distributor, 아르덴 captain.

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
| sk_iron_tackle | 철의 태클 | active (돌바르 고유) | 30 | null | boost `{defense:1.4, noMissPenalty:true}` phase defense |
| sk_line_breaker | 라인 브레이커 | active (울릭 고유) | 35 | null | extraLine, phase attack |
| sk_power_shot | 파워 슛 | active 학습 | 30 | FW | powerShot `{shoot:1.5, midrangeCoef:1.0, stamina:8}` |
| sk_eagle_eye | 매의 눈 | active 학습 | 40 | DF,MF | readBoost `{readMult:2.0}` phase defense |
| sk_see_through | 꿰뚫어보기 (신규) | active 학습, cost 140 | 40 | FW,MF | negateRead `{}` phase attack |
| sk_pickpocket | 소매치기 | active 학습 | 25 | MF | steal `{plus:1, tension:10, cappedNextBonus:0.15}` phase defense |
| sk_rally_cry | 함성 | active 학습 | 35 | null | rally `{stamina:30, clearBeaten:true, teamMult:1.1}` phase any |
| sk_stone_shield | 바위 방벽 | active 학습 | 35 | DF | boost `{defense:1.4, noFailPenalty:true}` phase defense |
| sk_burst_dribble | 폭발 드리블 | active 학습 | 30 | FW,MF | boost `{attack:1.5, actions:["dribble"], noStamina:true}` phase attack |
| sk_through_pass | 스루 패스 | active 학습 | 25 | MF | negateRead `{actions:["pass","cross"], nextDuelBonus:0.25}` phase attack |
| sk_wind_thread | 바람의 실 | unique (실루엔) | 0 | null | ultimate `{ type:"pass", attack:1.5, negateRead:true, nextDuelBonus:0.5, receiverGauge:50 }` |
| sk_meteor_shot | 메테오 슛 | unique (그룸바) | 0 | null | ultimate `{ type:"shot", shoot:2.0, gkMult:0.7, boxShot:true, stamina:10 }` |
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

1. **액션 id**: 공격 `dribble | pass | cross | shoot`, 수비 `tackle | intercept | hold` (v0.4 `block` → `hold` 로 **이름 변경**), GK `save`. `COUNTER` = { dribble: tackle, pass: intercept, cross: intercept, shoot: hold }.
2. **가능 액션**: line 0·1 = dribble, pass(수신 후보 ≥ 1). line 2 = dribble, pass(같은 라인 다른 FW ≥ 1), cross(carrier trait crosser 이고 크로스 후보 ≥ 1), shoot(중거리). line 3 = shoot. 수비 line 0~2 = tackle, intercept, hold 전부. line 3 = save (자동).
3. **판정 스탯**: tackle = (수비+피지컬)/2, intercept = (수비+패스)/2, hold = 수비 × holdMult (wall ×1.15, 드워프 종족 +10% 는 기존 종족 패시브 규칙대로), cross = (패스+드리블)/2 × actionCoef.cross, 헤더 슛 = (슈팅+피지컬)/2 × actionCoef.header, 중거리 = 슈팅 × midrangeShoot.
4. **수비 배율**: 짝 맞음 ×readBonus (readBoost 스킬이면 ×readMult), tackle·intercept 가 짝이 아니면 ×missMult (noMissPenalty 무시), hold ×1.0 (단 공격이 중거리 슛이면 ×holdVsMidrange). 공격이 negateRead 면 "짝 맞음"을 ×1.0 으로.
5. **공격 보너스 합**: Σ = 연계 특성(증폭 적용) + passChainBonus × chain + 제쳐짐 beatenBonus + 인터셉트 뚫림 interceptFailBonus + 스킬 nextDuelBonus(스루 패스·필살 패스) + 소매치기 cappedNextBonus. `att × (1 + min(Σ, bonusCap))`. 곱연산으로 따로: 스킬 boost·powerShot·필살기 배율, 합체기 comboBonus, extraLine 슛 +20%, 스타일·컨디션·체력·적성, 함성 teamMult.
6. **뚫림 결과**: 수비가 tackle 로 졌으면 `ball.pending.beaten = true` → 다음 듀얼 공격 보너스 +beatenBonus, 그 듀얼 coverCount 0 (다음이 GK 면 보너스만). intercept 로 졌으면 +interceptFailBonus. hold 는 없음. noFailPenalty 스킬이면 없음. 함성 clearBeaten 이면 해제. 한 번 쓰고 지운다.
7. **역습 시작**: 기본 (line 0 → 2, 1 → 1, 2 → 0, GK 세이브·골 → 0) + intercept 성공 +1 + steal +1, 상한 counterCap(2). intercept 의 +1 이 상한에 걸려 무의미하면 막은 팀 텐션 +counterCapTension. steal 이 상한에 걸리면 cappedNextBonus. **hold 로 막으면 항상 0** (steal 무시). distributor GK 의 세이브 → 1.
8. **간파**: line 0~2 에서만. 한 듀얼에 먼저 커밋한 쪽만 (AI 는 setupDuel 에서 먼저 커밋 → AI 가 썼으면 사람 간파 비활성).
   - 사람: readBoost(수비) / negateRead(공격) 효과만 (A안으로 이미 상대 행동을 앎).
   - AI: 효과 + 판정 때 사람의 실제 선택을 보고 행동을 교체 — 수비는 막을 확률 최고(hold 포함), 공격은 성공 확률 최고. 난수 추가 소비 없음.
   - 간파 사용권: team.gaanpaTickets(경기 시작 시 스냅샷 modifiers.gaanpaTicket) — 스킬 없이 텐션 0 으로 1회 (수비면 readBoost, 공격이면 negateRead). gaanpaCostHalf 면 간파 스킬(readBoost·negateRead effect) 텐션 ×0.5.
9. **자동 선택 (A안)**: `tendencyValues(state, side, playerId)` = 가능한 액션별 판정 기본값(짝·빗나감 제외): 스탯 × 계수 × 적성 × 스타일(상대 무관이므로 제외) × 특성 자기 보너스 × 전술 tacticBonus(공격 성향 dribble/pass, 수비 성향 tackle/intercept/hold, 슛 타이밍 midrange: "breakAll" → 중거리 0, "midrange" → ×1.15) × 체력 20% 이하 (드리블 ×0.7, 패스·크로스 ×1.2) × 필살기 준비·사용 조건 충족 시 필살 효과. 최대값 액션, 동률은 tie 순서. **난수 없음.** 수비수 선택(pickDefender)·수신자 선택도 동률은 슬롯 순서 — 판정 성공 주사위 외에는 rng 를 쓰지 않는다.
10. **수신자**: 후보 = pass: line 0 → MF 전원, line 1 → FW 전원, line 2 → 같은 라인 다른 FW (carrier 제외). cross: FW 전원 + MF 중 피지컬 최고 1명 (carrier 제외). 기본 수신자 = 도착 구역에서 쓸 주 액션의 판정값 최고 (도착 line < 3: 그 선수의 tendency 1위 값, 도착 line 3: pass → 슛 값(슈팅 × actionCoef.shoot) × (1 + finisher), cross → 헤더 값 × (1 + targetman)) — 상대 정보 미사용, 동률은 players 순서. 결정 `{ action, receiverId? }` — 후보가 아니면 throw. 없으면 기본값.
11. **원터치·헤더**: pass·cross 로 line 3 도착(extraLine 포함) → `ball.oneTouch = true`, cross 면 `ball.receivedVia = "cross"`. 첫 슛: GK 수비력 × oneTouchGk, cross 면 헤더 스탯. `ball.lastPasserId` (킬패스·필살 패스 판정용), `ball.receivedFresh = true` (첫 듀얼 판정 후 false).
12. **필살기**: `team.live[pid].gauge` (unique 보유자만, 시작 gaugeStart). 증가: 그 선수가 듀얼 승리(공격 성공·수비 성공·세이브) +onDuelWin, pass·cross 수신 +onReceive, 골 +onGoal, 필살 패스 수신 +onUltPassReceive. 상한 gaugeMax. **준비** = gauge ≥ max 또는 `ball.comboReadyId === pid`.
   - 사용: 사람 `decision.ultimate = true`, AI 규칙(13.3). 쓰면 gauge 0 (합체기로 쓴 경우는 소모 없음).
   - shot: line 2~3 에서 action shoot 과 함께. boxShot 이면 중거리 계수 대신 shoot 계수, att × shoot, GK × gkMult.
   - pass: action pass 또는 cross 와 함께. att × attack, negateRead, 성공 시 받은 선수 nextDuelBonus + gauge +receiverGauge(= onUltPassReceive 와 중복 아님, receiverGauge 사용), 받은 선수가 unique 보유자면 `ball.comboReadyId = receiverId`.
   - save: line 3 수비(GK)에서 자동 발동 조건 충족 시 save × saveMult.
   - 합체기: comboReadyId 선수가 다음 듀얼에서 자기 필살기를 쓰면 att × comboBonus, 이벤트 `type: "combo", name: combos.json 이름`.
   - 이벤트: 필살기 `type: "cutin", skillId, playerId, ultimateType`, 합체기 `type: "combo"` (cutin 2개 뒤).
13. **액티브**: 13.1 표의 effect 어휘. 한 듀얼에 팀당 일반 액티브 1개 + 필살기 1개(별도) 가능.
14. **상태 버전**: `MatchState.version = 3`. 이전 버전 저장 경기는 UI 가 버리고 새로 만든다.

### 13.3 AI (ai.js 재작성)

- `decideAttack(state, data, side)` / `decideDefense(...)` = 13.2-9 의 tendency 최대값 (결정적). `predictIntent`·의도 공개 관련 코드 삭제.
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
삭제: `intent`, `revealToHome` (UI 는 expected 로 대체). `remaining`·`zone`·`receiverPreview`(= receivers 기본값) 등 §12 필드는 유지.

### 13.5 run.js

- 스냅샷 선수에 `trait`, 팀에 `gaanpaTickets`(modifiers.gaanpaTicket 합), `gaanpaCostHalf`, 팀워크(+captain 은 match 가 계산). 상대 스냅샷도 trait·skillIds(보스 필살기) 포함.
- 전술 이행: `readIntent` → `balanced` (createRun 입력, 상대 데이터, 저장 등록 팀 로드 시).
- `getTurnView().nextMatch`: `intentReveal` 대신 `styleHint` (상대 필드 선수들의 공격 1위 액션 다수: "드리블 위주" / "패스 위주" / "혼합").
- 이벤트·유물 modifier 키 `gaanpaTicket`, `gaanpaCostHalf` 추가 (§6.7 표에 추가), `intentReveal` 제거.

### 13.6 화면

GDD 9.6·9.7·9.16·9.17 대로:
- 상대 듀얼 선수 머리 위 예상 행동 아이콘, 정보 줄에 근거("드리블형 — 드리블 600 > 패스 400")와 우리 선수 예상 행동. opponentReading 이면 "상대가 우리 수를 읽는 중".
- 공격 버튼 2×2(켜진 것만), 수비 3열 (v0.3.2: 아래 가운데 카드 한 줄 — §14.3). 버튼: 제목 "드리블 41%", 성공·실패 한 줄씩(짧은 형식), recommended 에 "추천" 표시.
- 받는 선수: 패스·크로스 버튼 제목에 "→ 그룸바▾", 필드의 후보 토큰(전원 도착 구역에 그림)을 탭하면 변경, 길게 누르기 = 미니 카드. 결정 시 `{ action, receiverId }`.
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
- **필살 패스의 기본 받는 선수**는 받는 선수의 합체기 가치(자기 필살 효과 × comboBonus)를 판정값에 넣는다. 없으면 기본 편성에서 실루엔 → 울릭(드리블형)으로 가서 자동 경기 합체기가 0회였다. `view.receivers[a].ultimateDefaultId` 추가, 수동 `{ action: "pass", ultimate: true }` 에 receiverId 가 없으면 이 값. 필살 패스 변형은 `receiverPreviewBySkill / outcomesBySkill / receiversBySkill` 에 **필살기 skillId 키**로 들어간다.
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
- 시즌 3 보스 엠버스론: 13.1 의 필살기 2개 외에 MF 세르바 `sk_eagle_eye`, FW 코르드 `sk_see_through` (GDD 0.1 #37 "보스가 우리 수를 읽는다" — readIntent 삭제 후 읽기 수단이 없어서).
- 상대 3명 드리블·패스 값 교환(합 불변): 아이언후프 DF2 하르둠·MF2 코르바, 썬더클로 DF2 스나르. A안에서 DF·MF 패스 스탯이 드리블을 이겨 "드리블 전술" 팀도 styleHint 가 패스 위주로 나왔기 때문.
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
- test/layout.test "자동 진행: 그린 패스 후보 = 실제 수신자": 픽스처를 DF1 아르덴(패스형) + `sk_line_breaker` 주입 + 텐션 60 으로 바꿈(A안에서 드리블형 DF 울릭은 패스를 안 해서 변형이 쓰이지 않았다). 숨김 상한 passes/4 → passes/3. **이 비율은 `tension.start` 에 민감**하다 — 35 이상이면 라인 브레이커가 킥오프 듀얼에 바로 발동해 0.35 로 실패.
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
| 상대 연계 특성·스탯 (13.8.6-4) | 13.1 | 피니셔 제거(무그렌·시온델·아그니르), 침투 이동(다린 → 로벨, 프레이 → 없음, + 코르바·카엘라·코르드), 파낙 슈팅 730·드리블 540·패스 610 · 루가 슈팅 710, 시온델 슈팅 780·드리블 580 → 실버리프 전원 ×1.05 | A안 자동에서 한 번도 발동하지 않던 특성을 공을 실제로 잡는 선수로 옮김. 실버리프는 중거리 팀이 되며 약해져(S2 59%) 스탯으로 되돌림 |

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
7. "추천"(`actions[].recommended`)은 토글 없는 기대 % 라 준비된 필살기를 보지 않는다. 필살기가 준비된 그룸바가 라인 2 에서 드리블 30% 를 추천받고, 메테오 중거리는 87%. 추천만 따르면 S1 −2.4%p. 제안: 필살기가 준비되면 `ultimateOptions` 에도 추천 표시.
8. line 0~1 공격 expectedPct 는 돌파 확률만 본다(계약대로) → 공격만 기대 % 최고의 이득은 +1.7~2.6%p (수비만 +5~7.5). 다음 듀얼 보너스·도착 구역 가치를 넣으면 공격 쪽 결정이 살아난다.
9. S3 목표 경기 골 4.07/경기 (전체 평균 2.64 는 목표 안).
10. 새 파일이 아직 git 에 없다: `data/traits.json, data/combos.json, test/v05.test.mjs, tools/choice.mjs` — 커밋에 넣어야 한다 (`npm test` 가 v05 를 요구한다).
11. **기획 확인 — 볼 운반** (13.8.6-3): "빌드업 구역(line 0)"은 규칙상 공 소유자가 항상 DF 라 미르카(MF/FW)·키르(MF)에게 발동하지 않았다. 검수 제안 1안(line ≤ 1, `buildupMaxLine`)으로 바꿨다. 다른 안: 효과를 "중원 드리블 +10%"로 한정, 또는 DF 캐릭터에 배정.
12. **기획 확인 — 중거리 전술** (13.8.6-5): ×3.0 은 "슈팅이 드리블·패스보다 약 1.2배 이상 높은 선수만" 중거리 1위. 자동 중거리 슛 골 확률은 15~17%(우리 DF 가 버티기 ×1.5 로 막음) 라서 중거리 팀(실버리프)은 오히려 약해진다 — GDD 9.11 "중거리 팀 = 버티기의 가치" 그대로. 우리 팀이 이 전술을 고르면 목표 경기 승률은 대략 중립(±3%p). 대안: 값을 2.5 로(상대 동작 불변, 우리 슈터만 뒤집힘), 또는 전술 설명을 "필살 슛·수동에서만 의미"로.
13. 피니셔(받은 직후 박스 슛·헤더)는 A안 자동에서 상대가 발동시킬 경로가 없다(FW 끼리 패스·크로스가 없음). GDD 9.10 대로 런치 캐릭터용으로 남기고 상대에서는 뺐다. 상대 철벽 노르윈(실버리프)은 매치업 수비수 선택이라 경기당 0.01회 — 수비할 때 자동 선택은 버티기라 테스트는 "발동 > 0 또는 버티기 선택"으로 본다.
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
- 상대 특성 발동 (목표 + 친선, 540경기): 피니셔 0 → 배정 없음, 침투 로벨 118 · 카엘라 133 · 코르바 191 · 코르드 191, 크로서 파낙 0 → 136, 타깃맨 루가 0 → 89, 볼 운반 키르 0 → 234.
- `node tools/shot.mjs`: 16/16 시나리오 390×844 스크롤 없음·잘린 스킬 0·콘솔 에러 0 (360 폭 04·11·12·16 도 스크롤·잘림 0, 320 폭에서는 16 의 이름 3개가 말줄임).
- 브라우저 확인(puppeteer 390×844): 라인 브레이커 + 울릭 탭 → 버튼 "울릭 원터치 · 상대 박스 진입", 미리보기 "→ 상대 박스", 판정 line 3 원터치. 개입 패스 뒤 자동 ON → 타린의 자동 패스가 끊긴 턴오버 궤적이 그룸바(이벤트 receiverId) 쪽 33px. 연계 문구 6건 토큰 얼굴·이름표 겹침 0 (전: 6건 모두 오르반 얼굴·이름표·말풍선을 가림). 편성 서포트 카드 390·360: 단어 중간 줄바꿈 0, 가로 넘침 없음.

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
| 편성 `setup` | 왼쪽 = 가로 미니 필드(home 골 왼쪽 — 경기 화면과 같은 방향). 슬롯 카드 7장을 포지션대로 GK 왼쪽 → FW 오른쪽, 같은 라인은 위아래로 고르게. 포메이션 선택은 패널 머리, 원소 공명·경고·빈 슬롯은 필드 아래. 오른쪽 = 서포트 카드 8장(2×4 — 데이터가 늘면 이 목록만 안쪽 스크롤, 전술·시작 패널은 늘 보임) · 전술 3항목 · seed · [기본 편성으로 시작] [런 시작]. 캐릭터 고르기 = 넓은 모달 2열 |
| 훈련 `training` | 상단 바: 시즌(x/3)·턴 + 턴 점(끝 ⚔) / 다음 상대 카드("N턴 후 경계전" · 마지막 턴 "이번 턴 뒤 경계전" · 행동 뒤 이벤트 "곧 경계전" · 이번 시즌 경계전을 치른 뒤(유물 모달 배경) "경계전 종료", 스타일 힌트·포제션·간파 사용권) / 상태 칩 4개(컨디션·팀워크·SP·호출권) + seed. 가운데: 훈련 칸 **5열 세로 카드** — 선수 두 줄(상승 합계 · 스탯별 상승 · 실패 %), 서포트 한 줄씩(★ 우정 · 💡 힌트 · 유대), 아래 스탯별 합계 · 상승 막대(가장 좋은 칸 기준) · 합계 · 실패 최대. 오른쪽 패널: 7명(체력 막대 · 5스탯 등급 · 부상) + 서포트 유대(80 문턱 표시). 아래 행동 바: [기록](유물·보정·로그 모달) · 휴식 · 외출 · 미팅 · 친선전 · 호출권 N |
| 훈련 팝업 | 상세 = 넓은 하단 시트(`.sheet-wide`, 선수 2열). 전술 미팅 = 3열 모달(전술 / 포메이션·포지션 / 스킬 상점 — 상점만 안쪽 스크롤). 호출권 = 선수 3열 → 칸 버튼 5개 한 줄 |
| 이벤트 `event` | 넓은 모달: 위 = 제목 · 등장 인물, 왼쪽 = 이야기, 오른쪽 = 선택지(효과 미리보기) 세로로. 배경은 훈련 화면 |
| 유물 `relic` | 모달, 후보 카드 한 줄로 나란히(카드 최대 270px, 가운데) |
| 루트 `route` | 위 = 시즌 진행 길(지난 결과 · 이번 시즌 강조 · 다음 시즌 점선), 아래 = 갈림길 선 → 루트 카드 3장 한 줄 |
| 결과 `result` | 왼쪽 = 등급 · 점수 구성(2열, 한 줄 = 관련 항목 한 쌍: 평균 스탯 / 습득 스킬 수 · 스킬 점수 / 팀워크 · 팀워크 점수 / 경계전 패배 · 패배 상한, 세로 선으로 나눔 — `result.js BD_ROWS`) · 경기 기록 · seed, 오른쪽 = 선수마다 한 줄(5스탯 격자, 시작 → 끝), 아래 = 버튼 한 줄 |

- 스모크 테스트·시나리오가 찾는 셀렉터는 유지: `.hero, .slot-cards, .slot-card, .slot-row, .recommended, #modal-root .sheet, .choice-btn, .relic-card, .route-card, .result-hero, .topbar, .next-match`, 버튼 문구 "닫기", "훈련하기", "미팅$", "^구매$".

### 14.5 테스트 (npm test 115 — rng 8, run 25, match 24, v05 24, layout 18, orient 5, stage 6, outgame 3, ui.smoke 2)

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
- 아웃게임 시나리오 형식: `{ name: "og_…", title, outgame: true, build(data, { runSeed }) → { runState | null, teams?, summary }, steps: [{ click: css } | { text: regex } | { wait }], ready: css, expect: { screen, phase?, modal? }, viewport? }`. `walkRun(data, { runSeed, require, prefer })` = 기본 진행(이벤트 0번 · 추천 훈련 · 자동 경기)으로 걸어가 조건에 맞는 첫 상태. steps 는 배율이 적용된 좌표에 실제 마우스 클릭 → 클릭 정확도도 확인한다.

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
6. 이름표가 이웃 토큰의 작은 연계 특성 아이콘 위에 올 수 있다(예: 시나리오 01 카손 ↔ 돌바르) — 이번 개편 전부터 있던 자리 고르기 동작.
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
