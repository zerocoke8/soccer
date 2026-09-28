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
| `index.html`, `css/style.css`, `js/ui/**` | UI | 화면 전부 |
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
  "tactics": { … }, "teamwork": 42, "conditionMult": 1.0, "intentReveal": "none",   // intentReveal = 상대가 이 팀 의도를 보는 수준
  "resonance": { "element": "wind", "strong": false, "bonus": { "passAttack": 0.05 } } | null,
  "modifiers": { "shootPower": 0, "defense": 0, "tensionGain": 0, "staminaCost": 0, "intentReveal": 0, "passAttack": 0 },  // 유물 등 합산치
  "players": [ { "id": "p1", "name": "…", "slot": "FW1", "position": "FW", "style": "speed", "element": "wind", "race": "beast",
                 "stats": { … 적성 배율 적용됨 … }, "skillIds": ["sk_…"], "portraitColor": "#…", "isYouth": false } ]
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
| `intentReveal` | 상대 의도 공개 +1 단계 (none→partial→full) |
| `goalMatchCondition` | 목표 경기 컨디션 단계 가산 |
| `shootPower`, `defense`, `passAttack`, `tensionGain`, `staminaCost` | 경기 스냅샷 `modifiers`로 전달 |
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
1. **시작**: 킥오프 또는 역습. 공격 팀의 시작 선수와 lineIndex 결정(§7.5). chain = 0.
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
| DF 라인(line 2) 또는 GK 세이브, 골 후 킥오프 | 0 |
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

- **세로 고정 레이아웃**: `.app` 컨테이너 최대 폭 420px, 중앙 정렬, 데스크톱에서는 폰 프레임처럼 보이게. 모바일에서는 전폭. 시스템 폰트. 아트 없음: 색 원(portraitColor) + 이름 첫 글자.
- **화면**: `start`(새 런 / 이어하기 / 등록 팀 목록 / seed 입력) → `setup`(포메이션, 슬롯 탭 → 캐릭터 목록에 그 슬롯 적성 표시, GK A/B 제한 경고, 서포트 6장 선택, 전술 3항목, 공명 표시, "기본 편성으로 시작" 버튼) → `training`(§7.2 GDD 목업: 상단 바, 체력 스트립, 5칸 리스트, 행동 바) → `event` 모달 → `match` → `relic` 모달 → `route` → `result`(평가, 선수별 스탯, "팀 등록", "다시 하기", seed 표시).
- **훈련 칸 행**: 칸 이름, 선수 아이콘들(체력 낮으면 어둡게, 부상자 표시 없음), 서포트 아이콘(★ 우정 가능, 💡 힌트 가능), 총 상승치, 최대 실패율, 추천 표시. 탭 → 하단 시트에 선수별 상세 + [훈련하기]. 호출권 버튼(선수 선택 → 칸 선택).
- **경기 화면** (v0.2부터 §12 가 기준, 아래는 v0.1 기록): 세로 필드(상대 GK/DF/MF/FW 위, 우리 FW/MF/DF/GK 아래), 공 소유자·듀얼 상대 강조, 스코어·포제션, 텐션 바 2개, 의도 표시(아이콘+텍스트), 액션 버튼 3개(비활성 처리), 스킬 버튼, 로그(최근 6개). **자동 토글**(기본 ON, 배속 1x/2x/4x), **개입 버튼**(자동 중 누르면 다음 결정에서 멈춤). 자동 진행은 `setInterval`로 `step()`; 결정 필요 & 수동이면 대기. 컷인 이벤트는 1초 배너.
- **저장**: 매 엔진 호출 후 `localStorage["soccer.run"] = JSON.stringify(state)`; `localStorage["soccer.match"]`도 별도. 등록 팀은 `localStorage["soccer.teams"]` 배열. 모든 localStorage 접근은 try/catch.
- **UI는 엔진을 계약대로만 호출**하고 상태를 직접 계산하지 않는다(표시용 정렬·포맷만).
- `js/ui/app.js`가 진입점. 화면별 파일 분리(`js/ui/screens/*.js`) 권장. 전역 상태는 `js/ui/store.js` 하나.
- 접근성 최소: 버튼은 `<button>`, 비활성은 `disabled`.

---

## 9. 테스트 & 시뮬 (test/, tools/)

- 실행: `npm test` = `node --test test/rng.test.mjs test/run.test.mjs test/match.test.mjs test/ui.smoke.test.mjs` (디렉터리/glob 인자는 Node 버전마다 달라 파일을 명시). 공용 로더·자동 진행 드라이버는 `test/helpers.mjs`.
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
- `tools/shot.mjs` (신규): puppeteer-core(devDependency, 설치됨) + 로컬 Chrome(`C:/Program Files/Google/Chrome/Application/chrome.exe`) 또는 Edge, `CHROME_PATH` 로 덮어쓰기; 없으면 안내 후 exit 0. 내장 정적 서버로 앱을 띄우고, Node 에서 엔진으로 만든 run/match 상태를 localStorage(`soccer.run`, `soccer.match`)에 주입한 뒤 시작 화면의 "이어하기" 버튼으로 진입 (app.js `continueRun` 은 run.phase === "match" 이고 match.seed === run.pendingMatch.seed 일 때 저장된 경기를 복원한다 → 주입 시 pendingMatch.seed 를 맞출 것). 시나리오별 PNG (390×844, deviceScaleFactor 2): 우리 빌드업 / 우리 파이널 서드 수동 결정(자동 끄고 미리보기 + 액션 버튼 hover 화살표) / **상대 ④ 슈팅(회귀)** / 상대 ③ 위험 / 승부차기 / 패스 비트 연출 중간 프레임 / 데스크톱 1280×900. 각 시나리오의 페이지 scrollHeight 와 콘솔 에러를 출력. 사용: `node tools/shot.mjs <outDir>`. (도구 스크립트는 반드시 프로젝트 안에 둬야 puppeteer-core 가 resolve 된다.)
