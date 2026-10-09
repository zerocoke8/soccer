# 2.5D 스프라이트 · 경기장 그림 (브랜치 `outgame-sprite`)

2026-10-05 · 설계는 [docs/SPRITE_25D_PLAN.md](../../docs/SPRITE_25D_PLAN.md). Codex CLI (`gpt-6-astra`, reasoning xhigh) 이미지 생성.

## 정한 것 (기획자)

- 2.5등신 · 카메라 위에서 약 30° · **오른쪽을 보는 거의 옆모습 한 방향** (몸 약 75° 돌림) — 왼쪽은 화면에서 좌우 반전. 뒷모습 없음.
- 그림체 = 선수 일러스트와 같은 TV 애니 셀 채색, 64px 로 줄여도 읽히게 바깥선 조금 굵게. 공 · 바람 효과 · 그림자 없이, 머리카락은 차분하게.
- 배경은 단색 (자홍 `#FF00FF`, 붉은 계열 캐릭터는 초록 `#00FF00`) — `tools/sprites.mjs` 가 빼고 높이 240 투명 WebP 로 만든다 (`img/sprites/`, 목록 `data/sprites.json`).
- 그릴 때 넣는 그림: 그림체 기준 (`art/style_test/ref5/reference.png`, 커밋 안 함) · 그 캐릭터 일러스트 (`art/characters/`) · 같은 형식의 다른 스프라이트 (카메라 · 비율 기준).

## 목록

| 파일 | 캐릭터 | 배경 | 메모 |
|---|---|---|---|
| base/ch_elf_playmaker.png | 실루엔 | 자홍 | 공 몰고 나갈 준비 자세 |
| base/ch_human_captain.png | 아델린 | 초록 | 맞붙는 수비 자세 (두 번째 그림 — 첫 그림은 몸이 정면에 가까웠다) |
| base/ch_elf_regista.png | 나엘리스 | 자홍 | 커버하는 수비 자세 |
| base/ch_spirit_keeper.png | 네리아 | 자홍 | 골키퍼 준비 자세 (무릎 굽혀 두 손 앞으로, 2026-10-10) |
| scenery/pitch_c.png | 경기장 (위에서 30°) | — | 위쪽 18.5% 를 잘라 `img/sprites/far_strip.webp` (먼 쪽 배경 띠) |
| scenery/grass_top.png | 잔디 바닥 (위에서 똑바로) | — | 선 없는 잔디 — 화면이 바닥 판에 깔고 눕힌다 (`img/sprites/grass_top.webp`) |

시험 그림 (각도 후보 A ~ F · B/C/D · 쿼터뷰 · 2:1 합성 장면) 은 `art/sprites/_trials/` 에 로컬로만 둔다 (`.gitignore`).

## 동작 시트 (움직이는 스프라이트 — `img/sprites/anim/`, 만드는 법 docs/SPRITE_25D_PLAN.md §13.6)

| 캐릭터 | 동작 | 만든 날 · 고른 영상 |
|---|---|---|
| 실루엔 `ch_elf_playmaker` | 10개 (대기 · 달리기 · 드리블 · 패스 · 킥 · 헤더 · 태클 · 버티기 · 넘어짐 · 세리머니) | 2026-10-06 (태클 = 발 먼저 슬라이딩으로 다시) |
| 아델린 `ch_human_captain` | 9개 — 드리블 없음 (달리기로 대신) | 2026-10-10 · kick = kick2 · tackle = tackle2 · fall = fall2 (드리블 영상은 제자리 걸음이라 뺌) |
| 네리아 `ch_spirit_keeper` | 9개 — 드리블 없음 (달리기로 대신) | 2026-10-10 · header = header2 · tackle = tackle2a (`--despill` 로 다시 뽑음 — 반투명 덧치마로 비친 자홍) (드리블 영상은 약해서 뺌) |

나엘리스 `ch_elf_regista` 는 정지 그림만. 영상 · 시트 원본 (`art/sprites/_trials/video/<이름>/out/`) 은 로컬에만 둔다.
