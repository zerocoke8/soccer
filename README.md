# 킥오프 레거시 (가제) — 웹 프로토타입

우마무스메식 육성 + 사커스피리츠식 턴제 경기 + 로그라이크 런 구조를 섞은 **7인제 팀 육성 축구 게임**의 웹 프로토타입.
아트 없이 시스템만 검증하는 단계이며, 최종 타깃은 가로 모바일 게임(Unity)이다. 이 웹 프로토타입은 데스크톱 브라우저 테스트용.

- **플레이**: https://zerocoke8.github.io/soccer/
- **기획서**: [docs/GDD_v0.5.md](docs/GDD_v0.5.md) (이전 버전: v0.1~v0.4)
- **구현 계약(모듈 설계)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## 로컬 실행

빌드 없음. 정적 서버만 필요하다 (ES 모듈이라 `file://`로는 열리지 않음).

```bash
npm run serve        # python -m http.server 8080  →  http://localhost:8080
```

화면은 인게임·아웃게임 모두 가로 전용 고정 스테이지(논리 1280×720, 16:9)다. 창에 맞춰 한 배율로 키우거나 줄여 가운데에 두고, 남는 곳은 레터박스. 세로 창에서는 "화면을 가로로 돌려 주세요" 안내가 뜬다(스테이지는 그대로 쓸 수 있다). 세로 화면은 없다. 경기 화면은 home 골 왼쪽, 필드가 화면 전체이고 HUD(점수판·트랙·카드·컨트롤·스킬·로그 서랍)가 가장자리에 겹친다 — [GDD 9.16](docs/GDD_v0.5.md), [ARCHITECTURE §14](docs/ARCHITECTURE.md).

## 테스트 · 밸런스 시뮬

```bash
npm i                # devDependency(jsdom) 설치 — UI 스모크 테스트용. 없어도 엔진 테스트는 돌아간다
npm test             # node --test (rng · run · match · v05 · layout · orient · stage · outgame · ui 스모크, 115 테스트)
npm run sim          # node tools/sim.mjs --runs 300 --seed 1  (시즌별 승률·등급 분포·부상·우정 훈련·골)
node tools/shot.mjs <출력폴더>   # 로컬 Chrome으로 경기(01~17)·아웃게임(og_*) 시나리오 스크린샷 (puppeteer-core, 1280×720)
node tools/shot.mjs <출력폴더> --only og   # 아웃게임만 (--list 로 목록)
node tools/shot.mjs <출력폴더> --width 1920 --height 1080   # 다른 창 크기에서 스테이지 배율·레터박스 확인
```

밸런스 목표(자동 진행): 시즌1 승률 70~80% / 시즌2 50~60% / 시즌3 35~45%, 등급 중앙값 B, 런당 부상 0.5~1.5, 우정 훈련 3회 이상. 현재 값과 튠 이력은 [docs/ARCHITECTURE.md §9·§11](docs/ARCHITECTURE.md) 참고.

## 구조

```
index.html, css/, js/ui/     화면 (고정 스테이지 1280×720 가로, 아트 없음) — css: base · outgame · match
js/engine/                   순수 로직: rng, run(육성), training, effects, rating, match(경기), ai, skills
data/*.json                  밸런스·콘텐츠 데이터 (Unity로 그대로 이식 예정)
test/, tools/sim.mjs         엔진 테스트, 헤드리스 시뮬
docs/                        기획서, 아키텍처
```

엔진은 DOM에 의존하지 않고 결정적(시드 고정)으로 동작한다. 같은 시드 + 같은 입력 = 같은 결과.
