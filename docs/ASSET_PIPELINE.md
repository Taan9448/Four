# ASSET_PIPELINE — 명세 → 생성 → 자르기 → 검증 → 연결

그래픽은 OpenAI Codex가, 명세·코드·연결은 Claude Code가 맡는다. 두 AI가 같은 파일을 고치지 않도록 폴더 소유권을 CI가 강제한다.

## 1. 폴더 소유권

| 경로 | 주인 | 비고 |
|---|---|---|
| `assets/source/` | Codex | 원본 시트 `<id>.png` + 실제 프롬프트 `<id>.prompt.txt` |
| `assets/sprites/<id>/` | Codex(스크립트 결과) | `frame_XX.png`, `meta.json`, `_contact.png`, `_preview.gif` |
| `assets/placeholders/<id>/` | Claude(스크립트 결과) | 임시 시트 `_sheet.png` + 같은 형식의 결과 |
| `specs/assets/` | Claude | 에셋 명세. Codex는 읽기만 한다 |
| `assets/manifest.json` | 아무도 커밋 안 함 | `tools/build-manifest.mjs`가 dev·build·test 전에 생성 |
| 그 밖(src, data, tools, docs, 설정) | Claude | |

CI(`tools/check-ownership.mjs`): `art/*` 브랜치는 `assets/source/**`·`assets/sprites/**` 외를 바꾸면 실패. 그 밖의 브랜치는 이 두 폴더를 바꾸면 실패. `assets/manifest.json`은 누구도 커밋할 수 없다.

## 2. 시트 규격 — 32px 픽셀 아트

**기본 원칙: 에셋 하나 = 시트 이미지 한 장 = 생성 한 번.** 모든 프레임을 격자로 배치한 시트 한 장을 받아 `tools/slice-sheet.mjs`로 자른다.
이미지 모델은 **확대된 픽셀 아트**를 그린다. 논리 픽셀 1개 = 시트의 정사각형 블록 하나. 자르기 도구가 칸마다:
1. 키 색 제거 → 2. 블록마다 그림 픽셀이 절반 이상이면 불투명, 색은 블록의 최빈색 → 3. 마스터 팔레트(ART_STYLE.md, 32색)의 가장 가까운 색으로 → 4. 논리 해상도 PNG(`frame_XX.png`)로 저장한다.

| type | size | 캔버스 | 격자 | 칸 | 논리 해상도 | 블록 | 배경(chroma) |
|---|---|---|---|---|---|---|---|
| `character-anim` | small | 1024×1024 | 4×4 | 256×256 | 32×32 | 8 | 마젠타 #FF00FF(보라·붉은 계열은 초록 #00FF00) |
| `character-anim` | large | 1536×1024 | 3×2 | 512×512 | 64×64 | 8 | 〃 |
| `character-ref` | small | 1024×1024 | 2×2 | 512×512 | 32×32 | 16 | 캐릭터의 키 색. 칸1 정면 3/4, 칸2 측면 |
| `character-ref` | large | 1024×1024 | 2×2 | 512×512 | 64×64 | 8 | 〃 |
| `fx` | small/large | 애니와 같음 | | | 32×32 / 64×64 | 8 | 검정 #000000(자를 때 투명으로) |
| `card-art` | — | 1024×1536 | 1 | — | 64×96 | 16 | 없음(풀 배경) |
| `background` | — | 1536×1024 | 1 | — | 192×128 | 8 | 없음 |
| `portrait` | — | 1024×1024 | 1 | — | 64×64 | 16 | 없음 |

최대 프레임: small 16, large 6(보스 skill도 6프레임 이내).

**공통 규칙**
- **프레임 번호는 모든 파일(명세, meta.json, 코드)에서 1부터.**
- 같은 캐릭터는 모든 칸에서 크기·의상·색이 같다. 사람형은 약 24px 키, 발의 가장 아래 픽셀은 32줄 중 29번째 줄(baseline 0.9), 가로 가운데. 아군은 오른쪽, 적은 왼쪽.
- 1px 외곽선 `#1d2433`, 색마다 2~3단계 명암, 스프라이트 하나에 16색 이하(이펙트 12색).
- 격자선·테두리·글자·숫자·워터마크·안티에일리어싱·흐림·그라데이션 금지. 칸 가장자리 2px 비움. 빈 칸은 순수 배경색.
- 크기가 다를 때: 비율이 같으면 규정 크기로 리사이즈해 자르고(경고), 비율이 다르면 실패.
- 크로마키 제거: 키 색과의 거리 < `chroma_tolerance`(기본 90)면 투명, 그 2.2배까지는 반투명 + 색 번짐 제거(블록 판정 전).
- 명세에서 `palette: free`로 팔레트 맞춤을 끌 수 있다(특수한 경우만).
- **게임 표시:** 정수배(기본 5배), 보간 없음(`image-rendering: pixelated`, `imageSmoothingEnabled = false`).

## 3. 표준 애니메이션 세트

| 이름 | 프레임 | fps | 반복 | 이벤트 프레임 | 높이 허용 편차 |
|---|---|---|---|---|---|
| idle | 4 | 6 | 반복 | — | 8% |
| attack | 6 | 12 | 1회 | hit: 4 | 20% |
| skill | 8 | 12 | 1회 | cast: 5 | 25% |
| hit | 3 | 12 | 1회 | — | 15% |
| death | 6 | 10 | 1회 | — | 검사 안 함 |
| fx | 6~12 | 15 | 1회 | impact: 중간 | 검사 안 함 |

명세의 `bbox_tolerance`로 바꿀 수 있다(예: `haun_attack`은 칼을 머리 위로 드는 프레임 때문에 35%).

**캐릭터별 세트:** 하운·엘리아·카일·보른 = ref + 전체 세트(skill 포함) / 왕일검 = portrait / 일반 적 = ref + idle·attack·hit·death / 보스 = 적 세트 + skill.

## 4. 일관성 전략과 대체 단계

- 캐릭터마다 기준 시트(`<char>_ref`)를 먼저 만든다. 칸1 3/4 정면 전신, 칸2 측면 전신(애니메이션과 같은 방향).
- 애니메이션 시트는 기준 시트를 참조 이미지로 넣어 생성한다. 명세의 `depends_on`에 기준 시트를 적고, 선행 에셋이 머지되기 전에는 처리하지 않는다(이슈에 `blocked` 라벨).
- 2회 재시도해도 프레임 간 모습이 어긋나면 내려간다. 사용한 단계는 `meta.json`의 `fallbackLevel`.

| 단계 | 시트 | 자르기 | 게임 재생 |
|---|---|---|---|
| 1(기본) | 전체 프레임 | `assets:slice -- <id>` | 그대로 |
| 2 | 키 포즈 3장(준비·타격·회복) | `assets:slice -- <id> --fallback 2` | SpritePlayer가 `virtualFrames` 길이로 보간 |
| 3 | 파츠(머리·몸통·팔·무기) | `assets:slice -- <id> --fallback 3` | 이후 관절 애니메이션(1차에는 첫 파츠만 표시) |

## 5. 명세(`specs/assets/<id>.yaml`)

템플릿은 `specs/assets/_template.yaml`. 명세에는 `status` 필드가 없다 — 상태는 파일로 계산한다(`npm run assets:status`).
- `requested`: 명세만 있음
- `delivered`: `assets/sprites/<id>/meta.json`이 있음
- `integrated`: 사람이 게임에서 확인한 뒤 이슈에 라벨

**meta.json**(스크립트 생성): `id`, `type`, `frameW`, `frameH`(논리 해상도), `pixelScale`, `gridPurity`, `frames`, `fps`, `loop`, `anchor: [0.5, baseline]`, `events`, `blend`(normal | lighter), `facing`, `fallbackLevel`, `virtualFrames`, `sourceHash`, `placeholder`, `resizedFrom`.

## 6. 검증(`npm run assets:validate`, CI에서도 실행)

- 명세 모양(cell×grid = canvas, frames ≤ 칸 수, 이벤트·frame_notes 범위, depends_on 존재, reference)
- 캔버스 비율·크기
- 1~frames 칸에 그림이 있는지, 그 뒤 칸이 비었는지
- meta.json과 명세 일치, 프레임 파일 수
- **픽셀 격자 일치도**(블록 안이 한 색인 정도): 75% 미만 경고, 50% 미만 실패 — 흐린 그림·안티에일리어싱·격자 어긋남 감지
- 프레임이 논리 해상도(32×32 등)인지, 모든 색이 마스터 팔레트 안인지(실패), 색 수가 권장치 이하인지(경고)
- 키 색 잔여 픽셀(불투명 픽셀 중 채도 높은 키 색 비율 > 0.5%면 실패)
- 그림이 칸 경계에 닿았는지(실패), 가장자리 2px 여백 침범(경고)
- 프레임 간 바운딩 박스 높이 편차(애니메이션별 허용치, 1px 흔들림 허용, 대체 단계 1에서만)
- 통과하면 `_contact.png`(번호·이벤트 표시, 정수배 확대)와 `_preview.gif`를 결과 폴더에 남긴다.

## 7. manifest와 자동 교체

`tools/build-manifest.mjs`가 `predev`·`prebuild`·`test`·`typecheck` 전에 모든 `meta.json`을 모아 `assets/manifest.json`을 만든다.
게임은 에셋 id를 **`assets/sprites/<id>` → `assets/placeholders/<id>`** 순서로 찾는다. 아트 PR이 머지되면 코드 수정 없이 임시 시트가 실제 그림으로 바뀐다.

## 8. GitHub 협업 흐름

- **라벨:** `asset-request`, `codex`, `claude`, `needs-fix`, `integrated`, `blocked`
- **브랜치:** `main` 보호(PR + CI 통과 후 스쿼시 머지). 아트 `art/<이슈번호>-<id>`, 코드 `feat/…`·`fix/…`(또는 세션 지정 브랜치)
- **커밋 접두어:** `art(<id>):`, `feat(<영역>):`, `fix(<영역>):`, `docs:`, `ci:`

1. **Claude — 요청.** `specs/assets/<id>.yaml` 작성 → `npm run assets:placeholder -- <id>`(게임이 먼저 돌아가게) → `npm run assets:prompt -- <id>`로 완성 프롬프트 → 에셋 요청 이슈(라벨 `asset-request`, `codex`, 선행 에셋 대기면 `blocked`). 본문: 명세 경로, 한 줄 요약, 선행 에셋, 완성 프롬프트 전문, 참조 이미지 경로.
2. **사람 — 전달.** Codex 앱·CLI에서 "이슈 #N AGENTS.md 절차대로 처리해". 클라우드는 이슈 댓글 "@codex AGENTS.md 절차대로 이 이슈 처리해".
3. **Codex — 제작.** AGENTS.md 순서: 생성 → `assets:slice` → `assets:validate` → 콘택트 시트 확인 → 아트 PR(`codex`, `Closes #N`).
4. **CI — 자동 검증**(`validate.yml`): 소유권 검사, 타입 검사·데이터 검사·테스트, 에셋 검증, 빌드.
5. **Claude — 검토.** `_contact.png`·`_preview.gif` 확인. 문제가 있으면 "몇 번째 프레임이 무엇이 틀렸는지" PR 댓글 + `needs-fix`. 통과면 "아트 승인" 댓글.
6. **사람 — 머지.**
7. **Claude — 확인.** 게임에서 자동 교체 확인 → 이슈에 `integrated`. 이 에셋을 기다리던 이슈의 `blocked`를 푼다. 이벤트 프레임 타이밍 조정 같은 코드 변경이 필요할 때만 `feat/<id>-integrate`.

## 9. 미리보기

`npm run dev` 후 `http://localhost:5173/tools/preview.html?id=<id>` — SpritePlayer로 재생하고 이벤트 발생을 표시한다.
`http://localhost:5173/?sandbox` — 지도 없이 바로 전투(융합 카드·왕일검 지원 포함)로 연출을 확인한다.
