# 킥오프 레거시 (가제) — 웹 프로토타입

우마무스메식 육성 + 사커스피리츠식 턴제 경기 + 로그라이크 런 구조를 섞은 **7인제 팀 육성 축구 게임**의 웹 프로토타입.
아트 없이 시스템만 검증하는 단계이며, 최종 타깃은 모바일(Unity)이다.

- **플레이**: https://zerocoke8.github.io/soccer/
- **기획서**: [docs/GDD_v0.3.md](docs/GDD_v0.3.md) (이전 버전: v0.1, v0.2)
- **구현 계약(모듈 설계)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 로컬 실행

빌드 없음. 정적 서버만 필요하다 (ES 모듈이라 `file://`로는 열리지 않음).

```bash
npm run serve        # python -m http.server 8080  →  http://localhost:8080
```

## 테스트 · 밸런스 시뮬

```bash
npm test             # node --test test/
npm run sim          # node tools/sim.mjs --runs 300 --seed 1  (시즌별 승률·등급 분포 등)
```

## 구조

```
index.html, css/, js/ui/     화면 (세로 레이아웃, 아트 없음)
js/engine/                   순수 로직: rng, run(육성), training, effects, rating, match(경기), ai, skills
data/*.json                  밸런스·콘텐츠 데이터 (Unity로 그대로 이식 예정)
test/, tools/sim.mjs         엔진 테스트, 헤드리스 시뮬
docs/                        기획서, 아키텍처
```

엔진은 DOM에 의존하지 않고 결정적(시드 고정)으로 동작한다. 같은 시드 + 같은 입력 = 같은 결과.
