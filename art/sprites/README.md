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
| scenery/pitch_c.png | 경기장 (위에서 30°) | — | 위쪽 18.5% 를 잘라 `img/sprites/far_strip.webp` (먼 쪽 배경 띠) |
| scenery/grass_top.png | 잔디 바닥 (위에서 똑바로) | — | 선 없는 잔디 — 화면이 바닥 판에 깔고 눕힌다 (`img/sprites/grass_top.webp`) |

시험 그림 (각도 후보 A ~ F · B/C/D · 쿼터뷰 · 2:1 합성 장면) 은 `art/sprites/_trials/` 에 로컬로만 둔다 (`.gitignore`).
