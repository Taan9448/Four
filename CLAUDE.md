# CLAUDE.md — Claude Code 작업 규칙

무협×판타지 소설 「천외귀환」을 원작으로 한 브라우저 덱빌딩 게임. 코드·데이터·문서·명세는 Claude Code가,
그래픽 에셋은 OpenAI Codex(`AGENTS.md`)가 만든다. 사람은 이슈를 Codex에 넘기고 결과를 확인한다. PR 머지는 Claude Code가 한다(규칙 6).

## 기준 문서
- 게임 설계의 단일 기준은 `docs/GAME_DESIGN.md`다. 설계를 바꾸면 이 문서부터 고친다.
- 경로·모듈: `docs/ROUTE_MODULES.md` / 카드·효과: `docs/CARD_EFFECTS.md` / 에셋: `docs/ASSET_PIPELINE.md` / 화풍: `docs/ART_STYLE.md`
- 이 저장소를 세팅한 프롬프트 원문: `docs/prompts/`(보관용, 수정하지 않는다)

## 명령
```bash
npm ci
npm run dev                 # 게임(http://localhost:5173), ?seed=XXXX[&stage=s2], ?sandbox[=kyle,born][&module=<모듈 id>], ?abyss[=시드](심연 시작)
                            # ?screen=reward|choice|scene|clear|win|lose|deck|levelup|shop|bossloot|hub|codex|loadout[&module=<id>] (화면 하나만 띄우기)
                            # ?screen=abyssclear|abyssend|abyssshop|abyssrest[&module=<id>] (심연 화면)
npm test                    # Vitest(엔진·경로·런·데이터·에셋 도구)
npm run typecheck           # tsc
npm run data:check          # data/ 스키마·상호 참조 검사
npm run balance             # 자동 플레이 봇(수비형·공격형 동시) 밸런스 → docs/BALANCE_REPORT.md (BALANCE_SEEDS, BALANCE_START=s8)
                            # BALANCE_MODE=abyss → 심연 보고서 docs/BALANCE_ABYSS.md
npm run balance:human       # 도감에서 내보낸 사람 플레이 기록을 봇과 비교 (HUMAN=파일.json)
npm run balance:trace       # 봇의 전투 하나를 턴마다 기록 (TRACE=s8:s8_boss_blood_hall)
npm run build               # dist/
npm run assets:placeholder -- <id> | --all
npm run assets:prompt -- <id>
npm run assets:slice -- <id> [--fallback 2|3] [--placeholder]
npm run assets:validate [-- <id> ...]
npm run assets:status
```

## 규칙
1. **카드·적·모듈·지원 규칙은 JSON 데이터로만 추가한다.** 카드별 개별 코드는 금지. 새 효과가 필요하면 기본 동작을 하나 추가하고(`src/engine/schema.ts` BATTLE_OPS/RUN_OPS + `effects.ts`/`run.ts`), `docs/CARD_EFFECTS.md`와 테스트를 함께 갱신한다.
2. **엔진 안의 무작위는 시드 RNG(`src/engine/rng.ts`)만 쓴다.** `Math.random` 금지. 수치는 `data/balance.json`에 두고 코드에 박지 않는다.
3. **그래픽이 필요하면 요청만 한다.** 명세(`specs/assets/<id>.yaml`) → `assets:placeholder` → `assets:prompt` → 에셋 요청 이슈(라벨 `asset-request`, `codex`, 선행 에셋 대기면 `blocked`). 이미지를 직접 만들거나 `assets/source/`·`assets/sprites/`를 고치지 않는다(CI가 막는다). `assets/manifest.json`은 커밋하지 않는다.
4. **애니메이션은 반드시 meta.json을 읽는 SpritePlayer로 재생한다.** 피격 판정 같은 타이밍은 `events`의 프레임 번호(1부터)에 맞춘다.
5. **Codex PR 검토 기준:** CI 통과(검증·소유권), `_contact.png`·`_preview.gif`로 본 프레임 간 일관성, ART_STYLE.md 준수, 다른 폴더 미수정. 문제는 "몇 번째 프레임이 무엇이 틀렸는지" 구체적으로 댓글 + `needs-fix`. 통과면 "아트 승인" 댓글.
6. **머지(2026-10-05 사용자 위임):** 아트 PR은 "아트 승인" + CI 통과, 코드 PR은 CI 통과면 Claude가 스쿼시 머지한다. 초안이면 해제하고 `needs-fix`를 뗀 뒤 머지한다. 머지할 때마다 무엇을 머지했는지 사람에게 짧게 알린다. 설계 결정이 걸린 PR(화풍·규격·규칙 변경)은 사람이 확인한 뒤 머지한다.
   **머지 후 확인:** 게임에서 실제 에셋으로 자동 교체됐는지 확인하고 이슈에 `integrated`, 이 에셋을 기다리던 이슈의 `blocked`를 푼다.
7. **브랜치·커밋:** `main` 직접 푸시 금지. 코드는 세션 지정 브랜치 또는 `feat/…`·`fix/…`. 커밋 접두어 `feat(<영역>):`, `fix(<영역>):`, `docs:`, `ci:`.
8. **GitHub 작업:** `gh` CLI가 있으면 gh, 없으면 GitHub MCP 도구. 도구로 못 하는 설정은 사람 할 일로 보고한다.
9. **작업을 끝내면** 무엇을 바꿨는지와 사람이 해야 할 일을 짧게 보고한다.

## 구조
- `src/engine/` — rng, schema(데이터 타입), data(로더), state, effects(해석기), battle, route(지도 생성), run(런 진행), economy(골드·상점·전리품), collection(보유 카드·편성), codex(도감 기록), save(저장 직렬화), text(카드 문구), abyss(심연: 굽이·풀·점수)
- `src/sim/` — bot(자동 플레이 봇: 밸런스 측정용, 엔진만 씀)
- `src/render/` — assets(manifest 조회), sprite-player, fx(흔들림·숫자·번쩍임), rift-overlay, preview, portrait(반신 그림), audio(합성 효과음·배경음악), music(곡 악보)
- `src/ui/` — app(화면 흐름), map-view(여정 띠·두루마리 지도), battle-view, choice-view, card-view(세계별 카드 틀), scene-view, deck-view, hub-view(클리어 지도), shop-view, codex-view(도감), loadout-view(편성), overlay(창), tooltip(주석), icons(상태·의도 아이콘), settings, storage(localStorage)
- `data/` — balance, statuses, characters, stages, support, speakers, cards/, enemies/(스테이지별), modules/, scenes/, abyss_laws·abyss_affixes·abyss_oaths·abyss_achievements(심연)
- `tools/` — 에셋 파이프라인 스크립트(Node + sharp), `__fixtures__/`(검증기 테스트용 명세), `balance/`(봇 실행·기록, vitest로 돈다)
