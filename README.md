# 천외귀환 — 세계의 틈 (카드 게임)

무협×판타지 소설 「천외귀환」을 원작으로 한 브라우저 턴제 덱빌딩 게임입니다.
원작 순서대로 가는 선형 캠페인이고, 각 스테이지 안의 경로는 모듈을 무작위로 조합해 매번 달라집니다(결말은 같음).

- 코드·데이터·문서: Claude Code (`CLAUDE.md`)
- 그래픽 에셋: OpenAI Codex (`AGENTS.md`)
- 사람: 에셋 이슈를 Codex에 넘기고 결과 확인(PR 머지는 Claude Code)

## 실행

```bash
npm ci             # Node.js 22.12 이상(Vitest 5 요구 사항)
npm run dev        # http://localhost:5173  (?seed=ABCD 로 같은 지도 재현, ?sandbox 로 바로 전투, ?sandbox=kyle,born 처럼 동료 지정)
npm test           # 엔진·경로·데이터·에셋 도구 테스트
npm run build      # dist/ → GitHub Pages
```

에셋 미리보기: `npm run dev` 후 `http://localhost:5173/tools/preview.html?id=haun_attack`

## 1차 프로토타입에 들어 있는 것

- S1 엘하임 숲 → 화산 협곡: 시드 기반 무작위 지도(고정 스토리 노드 2개 + 보스 이그니스), 모듈 13개
- 파티 전투(하운 고정 + 최대 3명), 내공·마나(세계별 규칙)·융합·균열(전투 균열 + 런 상흔)·결 읽기
- 왕일검 비전투 지원 규칙 4개(디버그 토글)
- 카드 17장(하운 10, 엘리아 6, 상태 1) — 전부 JSON 데이터
- 에셋 파이프라인: 명세 → 임시 시트 → 자르기 → 검증 → manifest 자동 교체, 폴더 소유권 CI
- 그래픽: 전투는 **픽셀 아트**(64 격자 → 80×80 프레임), 이야기(카드·초상화·스토리 장면)는 **애니메이션 채색 일러스트**(`docs/ART_STYLE.md`). 지금은 모두 임시 시트(`assets/placeholders/`)

## 문서

| 문서 | 내용 |
|---|---|
| `docs/GAME_DESIGN.md` | 원작 요약과 게임 설계(단일 기준) |
| `docs/ROUTE_MODULES.md` | 지도 생성 규칙, 모듈 스키마 |
| `docs/CARD_EFFECTS.md` | 효과 기본 동작, 카드 JSON 스키마 |
| `docs/ART_STYLE.md` | 화풍(초안)·팔레트·캐릭터 외형, 이미지 프롬프트 데이터 |
| `docs/ASSET_PIPELINE.md` | 시트 규격, 검증, GitHub 협업 흐름 |
| `docs/prompts/` | 이 저장소를 세팅한 프롬프트 원문(Claude Code용, Codex용) |
