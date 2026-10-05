# Claude Code 프롬프트 v2 — 천외귀환 카드게임 저장소 세팅

## 사용법

아래 **프롬프트 본문 1~4**를 통째로 복사해 Claude Code 첫 메시지로 붙여 넣으세요.
저장소 안에서라면 "docs/prompts/claude-code-setup-v2.md의 프롬프트 본문대로 진행해"라고만 해도 됩니다.
Codex(ChatGPT)에 줄 지시문은 같은 폴더의 `codex-art-agent.md`에 있습니다.

### v1 대비 바뀐 점

| 영역 | v1 | v2 |
|---|---|---|
| 저장소 | `gh repo create`로 새로 만들고 이름·공개 여부를 질문 | 기존 `taan9448/four` 사용, 질문 없이 진행 |
| 진행 구조 | 로그라이크(경로 구조 미정) | 원작 순서 선형 캠페인 + 스테이지 내부 경로를 모듈로 무작위 구성(시드 고정 가능) |
| 스테이지 | 6개, 화산 협곡·운곡촌·구천 계단 누락, 청운산에서 할 일 없음 | S0 프롤로그(튜토리얼)~S5, 누락 장면을 고정 스토리 노드로 편입 |
| 캐릭터 | 5명, 운용 방식 미정 | 하운 고정 + 최대 3명 출전, 스토리 시점 합류, 왕일검은 비전투 지원 규칙 |
| 자원 | 내공·마나만 언급, 카드 비용 화폐 없음 | 내공 = 턴마다 차는 기본 비용, 마나 = 세계별로 차는 양이 다른 유한 자원, 융합 = 둘 다 |
| 균열 | 융합 시 쌓이는 게이지 | 전투 균열(세계별 감쇠) + 런 상흔(이후 경로에 틈 모듈 증가) |
| 결 읽기 | 약점 공개 | 결 노출 스택 + 최종 보스 '매듭' 공략으로 이어짐 |
| manifest | 스크립트만 갱신(두 AI가 같은 파일을 고쳐 충돌) | 커밋하지 않고 빌드 때 생성 |
| 명세 status | Codex가 status 줄 수정 | status 필드 삭제, 파일 상태로 계산. Codex는 specs를 건드리지 않음 |
| 크로마키 | 전부 마젠타 | 캐릭터: 마젠타(보라·붉은 계열은 초록), 이펙트: 검정 + 가산 합성, 일러스트·배경: 키 없음 |
| 기준 이미지 | 3/4 정면 1장 | 3/4 정면 + 측면 2칸 시트 |
| 검증 | 바운딩 박스 편차 15% 일괄 | 애니메이션별 허용치, death는 제외, 비율이 다르면 실패 |
| 프레임 번호 | 기준 없음 | 모든 파일에서 1부터 |
| 1차 에셋 | 하운 3종 + 이펙트 1 | + 그림자늑대 기준·idle, 선행 에셋(depends_on) 표시 |
| GitHub 도구 | gh CLI 전제 | gh가 없으면 GitHub MCP 도구, 불가능한 설정은 사람 할 일로 보고 |

### 미리 준비할 것(사람)

- ☐ Node.js 20 이상(로컬에서 돌려 볼 경우)
- ☐ Codex 앱 또는 CLI 설치, `taan9448/four` 저장소 연결
- ☐ 화풍 선택: 기본값은 **C(혼합)**. 다른 안을 고르면 본문 2의 11절 "확정 화풍" 줄만 바꾸세요.

---

## 프롬프트 본문 1 — 임무와 게임 설계

### 0. 너의 임무

무협×판타지 소설 「천외귀환」을 원작으로 한 **브라우저용 턴제 덱빌딩 카드 게임**의 저장소를 세팅해 줘.
이 저장소는 두 AI가 함께 개발한다. 코드·데이터·게임 로직은 너(Claude Code)가, 그래픽 에셋은 OpenAI Codex가 만든다.
이번 작업의 핵심은 게임 완성이 아니다. 다음 세 가지를 세우는 것이다.

1. 두 AI가 GitHub를 통해 충돌 없이 주고받는 파이프라인
2. Codex가 프레임 단위 애니메이션 시트를 정확히 만들어 오게 하는 규격
3. 원작 순서의 선형 캠페인과 모듈형 무작위 경로를 데이터로 표현하는 엔진의 뼈대

- 저장소는 **`taan9448/four`**이고 이미 존재한다. 새로 만들지 않는다.
- 작업은 세션이 지정한 브랜치(없으면 `feat/bootstrap`)에서 하고, `main`으로 가는 PR을 연다.
- 질문하지 말고 이 문서대로 진행해. 판단이 필요한 부분은 합리적으로 정하고, 마지막 보고의 "가정 목록"에 적어 줘.
- GitHub 작업에는 `gh` CLI가 있으면 그것을, 없으면 GitHub MCP 도구를 쓴다. 도구로 할 수 없는 설정(라벨 생성, 브랜치 보호, Pages 활성화 등)은 시도하다 막히면 멈추지 말고 "사람이 할 일"에 화면 경로까지 적는다.
- 원작 요약과 아래 설계는 `docs/GAME_DESIGN.md`에 정리한다. 이 파일이 게임 설계의 단일 기준이다.

### 1. 게임 개요

- **장르:** 턴제 덱빌딩(Slay the Spire 계열). 원작 순서대로 가는 **선형 캠페인**이다. 각 스테이지 안에서 보스까지 가는 경로는 **모듈을 무작위로 조합**해 만든다. 결말은 항상 같고, 경로는 매번 달라진다.
- **플랫폼:** 브라우저 정적 게임, 백엔드 없음, GitHub Pages 배포
- **연출 원칙:** 타격감은 피격 흔들림, 떠오르는 데미지 숫자, 짧은 번쩍임, 스프라이트 애니메이션으로 낸다. 복잡한 물리·파티클 엔진은 쓰지 않는다. 균열은 화면 위에 그린 검은 금(SVG/CSS)으로 표현한다.

### 2. 캠페인 구조

| 스테이지 | 원작 | 세계 | 파티 | 고정 스토리 노드 | 보스 |
|---|---|---|---|---|---|
| S0 청운산(프롤로그·튜토리얼) | 1~2장 | 무림 | 하운 단독 | 장작 패기(결 읽기 튜토리얼), 관운각 밀담, 귀곡애 추격 | 곽도진: 이길 수 없는 전투. N턴을 버티면 석문 연출로 넘어감 |
| S1 엘하임 숲 → 화산 협곡 | 3~4장 | 엘하임 | 1층에서 엘리아·카일·보른 합류 | 동료 합류, 마나의 숨결(마나 해금), 카일의 검술(검 획득), 운하검 탄생(벽운단하 획득) | 화염군주 이그니스 |
| S2 마왕성 노크투르나 | 5장 | 엘하임(마왕성) | 3명 편성 | 끝까지 돌린 고리(보스 직전, 천외귀운 획득), 공허의 열쇠(보스 후) | 마왕 바르가스 |
| S3 혈로 | 6~7장 | 무림 | 3명 + 왕일검 지원 시작 | 운곡촌 교세(첫 전투), 폐사찰 재회(왕일검 합류, 운해귀종 획득), 하늘의 금(보스 후, 런 상흔 공개) | 섬서 분타주(낙안봉) |
| S4 천마봉 | 8장 | 무림 | 3명 + 왕일검 | 구천 계단(정파 연합 진법 선택) | 곽도진 + 사무결 2인 보스 → 2페이즈 붉은 거인 사무결 |
| S5 세계의 틈 | 9~10장 | 틈 | 3명 → 보스 직전 '먼저 가' 이벤트 → 하운 + 엘리아 | 갈라지는 하늘(시작), 먼저 가(보스 직전) | 지옥왕 모르데카이 → 봉합 연출 |
| 에필로그 청운직상 | 에필로그 | 무림 | — | 연출만. 하운은 마나를 잃음 | — |

- **세계의 틈 예외:** 원작에서는 네 명이 함께 들어간다. 일반 전투는 3명이 출전하고 1명은 대기한다. 보스 직전 고정 이벤트에서 보른, 이어서 카일이 파티를 떠나고, 보스전은 하운 + 엘리아로 고정한다. 둘은 봉합 연출에서 돌아온다.

### 3. 파티와 왕일검

**파티 규칙**
- 하운은 항상 출전한다. 출전은 최대 3명이다. 스테이지 시작 때와 휴식 노드에서 편성을 바꿀 수 있다.
- 멤버마다 HP와 방어가 따로 있다. 덱은 출전 멤버 카드의 합이다. 모든 카드에는 `owner` 필드가 있다.
- 멤버가 쓰러지면 그 멤버의 카드는 뽑히는 즉시 버려진다. 전투가 끝나면 HP 1로 돌아온다. **하운이 쓰러지면 패배.**
- 적의 의도 표시에는 공격 대상(멤버)을 함께 보여 준다. 도발은 대상을 바꾼다.
- 합류 시점: 엘리아·카일·보른은 S1 1층, 왕일검은 S3 폐사찰 재회 노드.

**왕일검: 비전투 지원**
- 파티 슬롯을 차지하지 않는다. 전투 화면에는 초상화와 호흡 박자 표시만 나온다.
- 지원 규칙은 데이터(`data/support.json`)로 정의한다. 형식은 `trigger` + `condition` + `effects`이고, 효과는 카드와 같은 기본 동작을 쓴다. 왕일검 전용 로직 코드는 금지하고, 엔진에는 트리거 훅만 둔다.
- 초기 규칙(수치는 `data/balance.json`):
  1. **청운호흡 박자** — "세 번 짧게, 한 번 길게." 1·2·3턴은 '짧은 숨'을 표시하고, 4턴마다 턴 시작에 '긴 숨'으로 내공 +1, 카드 1장을 뽑는다.
  2. **장작의 결** — 전투당 1회, 전투 균열이 7 이상이 되는 순간 균열 -3. ("어디를 잘못 쳤는지 아는 사람은 도끼를 쥔 사람뿐이다")
  3. **"도진아"** — 곽도진의 HP가 처음으로 50% 이하가 되는 턴에 곽도진을 1턴 기절시킨다(스토리 개입).
  4. **토납 수련** — 휴식 노드의 추가 선택지. 내공 비용 카드 2장을 강화한다.

### 4. 자원, 균열, 결 읽기

모든 수치는 `data/balance.json`의 초기값이고, 코드에 숫자를 박지 않는다.

**내공(안정 자원)**
- 매 턴 3으로 다시 차고, 남은 양은 다음 턴으로 넘어가지 않는다. 카드의 기본 비용이다.

**마나(폭발 자원)**
- 파티가 함께 쓰는 풀이고 최대 10이다. 세계마다 규칙이 다르다.

| 세계 | 전투 시작 | 턴 시작 | 전투 사이 |
|---|---|---|---|
| 엘하임 | 가득 | +2 | — |
| 무림 | 이전 전투에서 이월 | +0 | 휴식 노드 +3 |
| 틈 | 이월 | -1(흐름 포식) | — |

**융합**
- 하운 전용 카드 유형. 내공과 마나를 함께 소모하고, 전투 균열을 올린다.

**전투 균열(0~10)**
- 융합 카드로 오른다. 턴 종료 때 세계별로 줄어든다: 엘하임 -2, 마왕성 -1, 무림 0, 틈 0. (원작: 화산 협곡의 금은 숨 한 번에 사라지고, 무림의 금은 사라지지 않는다)
- 5 이상이면 턴 종료마다 사용할 수 없는 상태 카드 '틈의 잔향' 1장을 버린 카드 더미에 넣는다.
- 10이 되면 **균열 폭주**: 파티 전원이 5 피해를 받고 균열이 5로 내려간다.

**런 상흔**
- 전투가 끝날 때 남은 전투 균열의 절반(내림)이 누적된다.
- 경로 생성에 영향을 준다: S3부터 '하늘의 금' 이벤트, S4부터 '틈 괴물' 전투 모듈의 가중치가 올라간다. **결말은 바뀌지 않는다.**

**결 읽기**
- 적에게 `grain`(결 노출) 상태를 스택으로 쌓는다. 공격이 적중하면 1스택을 소모해 피해 +50%, 방어 무시가 된다.

**특수 상태**
- **무형**(그림자 망령): 내공만 소모하는 공격의 피해가 50%로 줄어든다. ("장력이 그림자를 그냥 통과했다")
- **흐름 포식**(모르데카이): 내공·마나 비용 카드로 준 피해만큼 회복하고 최대 HP가 늘어난다.
- **매듭**(모르데카이): 결 노출이 3스택 이상이면 '매듭 노출' 상태가 된다. 비용 0 카드 '날 얹기'가 매듭 노출 상태에 큰 피해를 준다. 최종 보스는 자원을 쓰지 않고 결만 보고 이긴다는 원작 구조를 그대로 옮긴 것이다.

### 5. 카드

**배분(약 150장)**

| 소속 | 장수 | 성격 |
|---|---|---|
| 진하운 | 40 | 장작 패기·결 읽기 → 청운십팔식 → 운하검 융합 |
| 엘리아 | 30 | 화염·얼음 방어막·속박·회복·마나 양도 |
| 카일 | 25 | 무겁고 곧은 기사검술, 선제 공격 |
| 보른 | 25 | 방패, 도발, 희생, 묵직한 도끼 |
| 공용·이벤트 | 20 | 정파 연합 무공(금강진·태극검진·매화검 등), 이벤트 보상 |
| 상태·저주 | 10 | 틈의 잔향, 상처, 마기 중독 등 |

**원칙**
- 카드는 반드시 JSON 데이터(`data/cards/<owner>.json`)로 정의한다. 카드별 개별 코드는 금지한다.
- 비용은 `{ "neigong": n, "mana": m }` 형식이다. 둘 다 0보다 크면 융합이다.
- 카드 문구는 효과로부터 자동 생성할 수 있어야 한다. 원작 인용은 `flavor` 필드에 넣는다.
- **효과 기본 동작(15개 이내):** `damage`, `block`, `heal`, `gain_neigong`, `gain_mana`, `draw`, `discard`, `apply_status`, `remove_status`, `rift`, `reveal_grain`, `taunt`, `add_card`
  - 수식자: `times`(연타), `target`(self/ally/enemy/all_enemies/all_allies/random_enemy), `condition`(균열 ≥ N, 결 스택, 세계, 출전 멤버), `scale`(스택당 배율)
  - 키워드: `exhaust`, `retain`, `innate`, `fusion`
- **런 단위 동작:** 이벤트와 지원 규칙에서만 쓴다. `gain_card`, `remove_card`, `upgrade_card`, `heal_party`, `gain_run_mana`, `scar`, `set_flag`, `join_party`, `leave_party`
- 새 효과가 필요하면 기본 동작을 하나 추가하고, `docs/CARD_EFFECTS.md`와 테스트를 함께 갱신한다.
- **무기 진행:** 시작은 도끼·나뭇가지(장작 패기) → S1에서 카일에게 검을 배움 → 운하검

**원작 기반 카드 후보**
- **하운:** 장작 패기, 발 디딤, 결 읽기, 청운호흡, 청운십팔식, 운해귀종(내공만, 균열 없음), 벽운단하(융합, 균열 +), 천외귀운(융합, 균열 ++), 날 얹기(비용 0)
- **엘리아:** 불덩이, 화염 폭풍, 얼음 벽, 발 얼리기(속박), 상처 막기, 마나 양도, 언어 전이(드로)
- **카일:** 기사의 일격, 날개 베기, 발목 찌르기, 왼편의 검(선제), 만두 한 접시(회복)
- **보른:** 방패 막기, 무릎 내리찍기, "같이 가"(아군 방어), "먼저 가"(도발 + 희생)

### 6. 경로와 모듈

**지도**
- 스테이지마다 층 수를 데이터로 정한다(기본 8~12층).
- 층마다 노드 2~3개를 두고, 인접한 다음 층 노드와 연결한다(Slay the Spire식 지도).

**노드 유형**
- `battle`, `elite`, `event`, `rest`(휴식·수련), `inn`(상점: 엘하임 여관, 무림 객잔), `story`(고정), `boss`(고정, 마지막 층)

**고정 노드**
- 스토리 노드는 `pinned`로 층을 지정한다. 그 층에는 노드가 하나뿐이어서 모든 경로가 지나간다.

**모듈 스키마**(`data/modules/<stage>.json`)
- 필드: `id`, `stage`, `type`, `weight`, `tags`, `once`
- `conditions`: `partyHas`, `flag`, `scarMin`, `floorRange`
- `content`: 전투면 적 구성, 이벤트면 선택지 → 효과

**시드**
- 모든 무작위는 시드 RNG를 거친다. 엔진 안에서 `Math.random`은 금지한다.
- 런 시드를 화면에 표시하고, 같은 시드면 같은 지도와 보상이 나와야 한다.

**생성 제약(테스트로 보장)**
- 모든 경로가 보스에 닿는다.
- 고정 노드는 모든 경로에 있다.
- 3층 이전에는 엘리트가 없다.
- 휴식 노드가 연속으로 오지 않는다.
- `once` 모듈은 런당 1회만 나온다.

**원작 기반 모듈 후보**
- **S0:** 장작더미(튜토리얼 전투), 내원 사형의 심부름, 왕 노인의 천 조각
- **S1:** 그림자늑대 무리, 빛 알갱이 숲, 국경 마을 여관, 모닥불 마나 수업
- **S2:** 성문 공성, 칠 층 회랑. 사천왕 엘리트 셋은 원작에서 쓰러뜨린 동료가 출전하면 보너스가 붙는다(빙결의 여왕↔엘리아, 대지의 거인↔보른, 그림자 암살자↔카일)
- **S3:** 무당 봉쇄진의 호법 셋, 소림 잿더미의 무승(보른 출전 시 보너스), 객잔 만두(카일 이벤트), 매화검수, 마교 분타
- **S4:** 구천 계단 연속전, 정파 연합 진법 선택(금강진·태극검진·매화검진 버프), 혈교도·호법·장로
- **S5:** 떠다니는 세계의 조각, 불비늘 삼두견, 그림자 망령, 뼈 거인
- **상흔 모듈:** S3 '하늘의 금', S4 '금 아래의 틈 괴물'

### 7. 기술 스택

- Vite + TypeScript. UI는 프레임워크 없이 DOM + CSS로 만든다.
- 스프라이트 재생: `<canvas>` 기반 SpritePlayer(프레임 배열 + fps + loop + 이벤트 프레임). 이펙트는 가산 합성(`lighter`)으로 재생한다.
- 이미지 처리: Node + sharp. 미리보기 GIF는 sharp로 어려우면 gifenc를 쓴다.
- 명세 파싱: `yaml`. 데이터 스키마 검사: zod 또는 ajv(`npm run data:check`).
- 테스트: Vitest(효과 해석기, 전투, 균열, 지원 규칙, 경로 생성기, 에셋 검증기)
- 배포: GitHub Actions → GitHub Pages

### 8. 저장소 구조

```
/
├─ CLAUDE.md                  # Claude Code용 작업 규칙
├─ AGENTS.md                  # Codex용 작업 규칙(아트 전용)
├─ docs/
│  ├─ GAME_DESIGN.md          # 원작 요약, 캠페인·파티·자원·균열 설계(단일 기준)
│  ├─ ROUTE_MODULES.md        # 지도 생성 규칙, 모듈 스키마
│  ├─ CARD_EFFECTS.md         # 효과 기본 동작, 카드 JSON 스키마
│  ├─ ART_STYLE.md            # 화풍·팔레트·캐릭터 외형(초안)
│  ├─ ASSET_PIPELINE.md       # 명세→생성→자르기→검증→연결
│  └─ prompts/                # 이 프롬프트와 Codex 지시문 원문(보관용)
├─ specs/assets/              # 에셋 명세(YAML), Claude가 작성
│  └─ _template.yaml
├─ assets/
│  ├─ source/                 # Codex 원본 시트       ← Codex 전용
│  ├─ sprites/<asset-id>/     # 잘린 프레임 + meta.json + _contact.png + _preview.gif ← Codex 전용
│  └─ placeholders/<asset-id>/ # 임시 시트(스크립트 생성) ← Claude 전용
├─ data/                      # cards/, characters.json, enemies.json, stages.json,
│                             # modules/, support.json, statuses.json, balance.json
├─ src/
│  ├─ engine/                 # rng, effects(해석기), battle, party, rift, support, route
│  ├─ render/                 # SpritePlayer, 타격 연출, 균열 오버레이
│  └─ ui/                     # 지도, 전투, 편성
├─ tools/
│  ├─ slice-sheet.mjs         # 시트 → 프레임, 크로마키 제거 + despill (--fallback 2|3 지원)
│  ├─ validate-assets.mjs     # 규격 검증, 콘택트 시트·GIF 생성
│  ├─ make-placeholder.mjs    # 명세 기반 임시 시트
│  ├─ render-prompt.mjs       # 명세 → 완성 이미지 프롬프트
│  ├─ build-manifest.mjs      # meta.json 수집 → manifest(커밋 안 함)
│  ├─ asset-status.mjs        # 명세별 상태 계산
│  ├─ check-ownership.mjs     # CI 폴더 소유권 검사
│  ├─ __fixtures__/           # 검증기 테스트용 정상·불량 시트
│  └─ preview.html            # 에셋 하나를 재생해 보는 미리보기
└─ .github/
   ├─ ISSUE_TEMPLATE/asset-request.yml
   ├─ PULL_REQUEST_TEMPLATE/art.md, code.md
   └─ workflows/validate.yml, deploy.yml
```

---

## 프롬프트 본문 2 — 에셋 규격

### 9. 스프라이트 시트 규격(`docs/ASSET_PIPELINE.md`에 그대로 반영)

**기본 원칙:** 에셋 하나 = 시트 이미지 한 장 = 생성 한 번.
모든 프레임을 격자로 배치한 시트 한 장을 받아 `tools/slice-sheet.mjs`로 자른다. 같은 생성 안에서 그려야 프레임끼리 모습이 가장 일관된다.

| 종류(`type`) | 캔버스 | 격자 | 칸 크기 | 최대 프레임 | 배경(`chroma`) | 게임 내 표시 |
|---|---|---|---|---|---|---|
| `character-anim` | 1536×1024 | 4×2 | 384×512 | 8 | 마젠타 #FF00FF. 보라·붉은 계열 캐릭터는 초록 #00FF00 | 50% 축소 |
| `character-ref` | 1536×1024 | 2×1 | 768×1024 | 2 | 해당 캐릭터의 키 색 | 사용 안 함(참조용) |
| `fx` | 1024×1024 | 4×4 | 256×256 | 16 | 검정 #000000. 키 제거 없이 가산 합성 | 원본 또는 확대 |
| `card-art` | 1024×1536 | 1칸 | 1024×1536 | 1 | 없음(배경까지 그림) | 카드 프레임에 맞춰 축소 |
| `background` | 1536×1024 | 1칸 | 1536×1024 | 1 | 없음 | 전투 배경 |
| `portrait` | 1024×1024 | 1칸 | 1024×1024 | 1 | 없음 | 왕일검 지원 UI, 대화 |

**초록 키를 쓰는 대상:** 마왕 바르가스와 마왕성 적, 사무결, 혈교도, 모르데카이, 틈 괴물. 판단 기준은 캐릭터 색 안에 키 색과 가까운 색이 있는지다.

**공통 규칙**
- **프레임 번호는 모든 파일(명세, meta.json, 코드)에서 1부터 센다.** SpritePlayer가 내부에서 변환한다.
- 캐릭터는 모든 칸에서 크기·의상·색이 같다. 발은 칸 높이 90% 기준선에 놓고 가로 가운데 정렬한다. 아군은 오른쪽, 적은 왼쪽을 본다.
- 격자선·테두리·글자·숫자·워터마크는 금지한다. 어떤 그림도 칸 경계를 넘지 않는다(칸 안쪽 8% 여백). 빈 칸은 순수 배경색이다.
- 결과물 크기가 규정과 다를 때: **비율이 같으면** 규정 크기로 리사이즈한 뒤 자르고, **비율이 다르면** 실패로 처리한다(왜곡 리사이즈 금지).
- 크로마키 제거 뒤에는 가장자리 색 번짐 제거(despill)를 적용한다. 허용 오차는 명세의 `chroma_tolerance`로 바꿀 수 있다.

**표준 애니메이션 세트**

| 이름 | 프레임 | fps | 반복 | 이벤트 프레임 | 바운딩 박스 높이 허용 편차 |
|---|---|---|---|---|---|
| idle | 4 | 6 | 반복 | — | 8% |
| attack | 6 | 12 | 1회 | hit: 4 | 20% |
| skill | 8 | 12 | 1회 | cast: 5 | 25% |
| hit | 3 | 12 | 1회 | — | 15% |
| death | 6 | 10 | 1회 | — | 검사 안 함 |
| fx(slash·fire·mana_burst 등) | 6~12 | 15 | 1회 | impact: 중간 프레임 | 검사 안 함 |

**캐릭터별 필요한 세트**
- 하운·엘리아·카일·보른: ref + 전체 세트(skill 포함)
- 왕일검: portrait만(전투 애니메이션 없음)
- 일반 적: ref + idle·attack·hit·death
- 보스: 일반 적 세트 + skill

**일관성 확보 전략**
- 캐릭터마다 기준 시트(`<char>_ref`)를 먼저 만든다. 왼쪽 칸은 3/4 정면 전신, 오른쪽 칸은 측면 전신(바라보는 방향은 애니메이션과 같게)이다.
- 그 캐릭터의 모든 애니메이션 시트는 기준 시트를 참조 이미지로 넣어 생성한다. 명세에는 `depends_on: [<char>_ref]`를 적는다. 선행 에셋이 머지되기 전에는 처리하지 않는다.
- 2회 재시도해도 프레임끼리 모습이 어긋나면 단계적으로 내려간다. 사용한 단계는 meta.json의 `fallbackLevel`에 기록한다.
  - 1단계(기본): 전체 프레임 시트
  - 2단계: 키 포즈 3장(준비·타격·회복) 시트. SpritePlayer가 이동·늘림·회전으로 사이를 보간한다.
  - 3단계: 머리·몸통·팔·무기를 분리한 파츠 시트. 코드로 관절 애니메이션을 만든다.

**에셋 명세 예시**(`specs/assets/haun_attack.yaml`)

```yaml
id: haun_attack
type: character-anim
character: haun
depends_on: [haun_ref]
reference: assets/source/haun_ref.png
canvas: [1536, 1024]
grid: [4, 2]
cell: [384, 512]
chroma: magenta          # magenta | green | black | none
frames: 6
fps: 12
loop: false
facing: right
baseline: 0.9
events: { hit: 4 }       # 프레임 번호는 1부터
bbox_tolerance: 0.20     # 생략하면 애니메이션 기본값
frame_notes:
  1: sword held low at right hip, knees bent, weight back
  2: steps forward, sword rising behind the head
  3: sword at peak overhead, body coiled
  4: downward cut, blade blurred with a thin blue streak
  5: follow-through, sword tip near the ground
  6: recovering to guard stance
```

명세에는 `status` 필드가 없다. 상태는 `tools/asset-status.mjs`가 파일로 계산한다.
- `requested`: 명세만 있음
- `delivered`: `assets/sprites/<id>/meta.json`이 있음
- `integrated`: 사람이 확인한 뒤 이슈에 라벨로 표시

**meta.json**(스크립트가 생성): `id`, `type`, `frameW`, `frameH`, `frames`, `fps`, `loop`, `anchor: [0.5, 0.9]`, `events`, `blend`(normal | lighter), `fallbackLevel`, `sourceHash`

**manifest**
- `assets/manifest.json`은 **커밋하지 않는다**(.gitignore).
- `tools/build-manifest.mjs`가 `predev`·`prebuild`에서 모든 meta.json을 모아 생성한다.
- 게임은 에셋 id를 `assets/sprites/<id>` → `assets/placeholders/<id>` 순서로 찾는다. 그래서 실제 에셋이 머지되면 코드 수정 없이 임시 시트가 자동으로 교체된다.

**검증 기준**(`tools/validate-assets.mjs`, CI에서도 실행)
- 캔버스 비율·크기
- 내용이 있는 칸 수가 명세의 frames와 같은지(빈 칸이 아닌지)
- frames 이후 칸이 비어 있는지
- 키 색 잔여 픽셀 비율
- 그림이 칸 경계(8% 여백)를 침범했는지
- 바운딩 박스 높이 편차(애니메이션별 허용치)
- meta.json과 명세 일치
- 통과하면 `_contact.png`(번호 붙은 콘택트 시트)와 `_preview.gif`를 `assets/sprites/<id>/`에 남긴다.

### 10. AGENTS.md(Codex 지시문)

`docs/prompts/codex-art-agent.md`의 "AGENTS.md 본문"을 그대로 옮기되, 경로와 npm 스크립트 이름을 실제 저장소에 맞춰 고친다.
이미지 생성 프롬프트 템플릿은 `tools/render-prompt.mjs`가 유형별로 채운다. 이미지 모델은 영어 지시를 더 정확히 따르므로 템플릿은 영어로 쓴다.

**`character-anim` 템플릿**

```
Create ONE PNG sprite sheet.
Canvas: {canvasW}x{canvasH} px. Grid: {cols} columns x {rows} rows.
Each cell is exactly {cellW}x{cellH} px. Read cells left-to-right, top-to-bottom; cell numbers start at 1.
Background: flat solid {chromaName} {chromaHex} in every cell. No gradient, no floor, no cast shadow, no vignette.
Subject: {subject from ART_STYLE.md}. Match the attached reference sheet exactly: face, hair, outfit, colors, proportions.
The SAME character in every cell, at the SAME scale.
Side view. Facing {facing}. Feet rest on a baseline at {baselinePct}% of cell height, horizontally centered.
Style: {sprite style line from ART_STYLE.md}. Never use {chromaName} or similar hues on the character.
Frames:
{for each frame: "Cell N: <frame_notes[N]>"}
Cells {frames+1} to {cols*rows} are empty {chromaName}.
Rules: no grid lines, no borders, no text, no numbers, no labels, no watermark.
Nothing crosses a cell boundary; keep 8% padding inside every cell.
```

**`character-ref` 템플릿:** 같은 머리말에, 칸 1 = "full body, three-quarter front view, neutral standing pose", 칸 2 = "full body, side view facing {facing}, same pose"를 넣는다.

**`fx` 템플릿:** 배경은 "flat solid black #000000", 내용은 "a light-emitting effect drawn for additive blending; no character, no ground, no background elements"로 바꾸고 프레임 메모를 그대로 쓴다.

**`card-art`, `background`, `portrait` 템플릿:** 격자와 키 문장을 빼고 "full-bleed illustration, {illustration style line}"과 장면 설명을 넣는다. 글자 금지 규칙은 유지한다.

### 11. ART_STYLE.md 초안 내용

**확정 화풍: C(혼합)** ← 사용자가 다른 안을 고르면 이 줄만 바꾼다. 확정 전까지 문서 상단에 "초안"을 표시한다. 첫 에셋 `haun_ref`가 화풍 시험 역할을 하고, 사용자가 승인하면 "확정"으로 바꾼다.

- **A. 수묵 담채:** 먹선의 굵기 변화, 번짐, 여백, 한지 질감, 옅은 채색. 무협 정서와 '결·구름·강' 이미지에 맞는다. 다만 번지는 가장자리 때문에 크로마키 제거와 프레임 일관성에 불리하다.
- **B. 굵은 외곽선 셀 채색:** 2~3단계 명암, 짙은 남색 외곽선, 평면 색. 크로마키 제거가 깔끔하고, 프레임 일관성과 50% 축소 판독성이 좋다. 무협 고유의 정서는 약하다.
- **C. 혼합(권장):** 스프라이트(캐릭터·적·이펙트)는 B 방식에 외곽선만 붓선 질감(굵기 변화)을 준다. 카드 일러스트·배경·초상화는 A 방식이다.
  - 무림 배경: 먹·한지 톤
  - 엘하임 배경: 같은 수묵 기법에 은빛·청색 담채
  - 틈 배경: 검붉은 어둠에 부서진 세계의 조각

**색 코드(UI와 이펙트 공통)**
- 내공: 따뜻한 금빛·주황("단전의 작은 불씨")
- 마나: 청은빛 빛 알갱이
- 운하검: 푸른 검광
- 균열: 검은 금 + 붉은 점멸
- 마기: 검붉은색

**캐릭터 외형(원작 근거)**
- **진하운:** 18~20세, 마른 잔근육 체격, 해진 무명옷, 손에 감은 천. 초반엔 도끼·나뭇가지, 이후 검. 융합 시 피부 아래로 푸른 빛줄기.
- **엘리아:** 하프엘프 마법사, 긴 은발, 끝이 뾰족한 귀.
- **카일 로웬:** 금발 청년 기사, 은빛 갑옷, 긴 검. 몰락 가문의 낡은 문장.
- **보른:** 드워프, 하운의 가슴께 키, 덥수룩한 수염, 자기 키만 한 도끼와 방패.
- **왕일검:** 등이 굽고 한쪽 다리를 저는 노인, 지팡이, 흐린 눈, 주방 노인 차림.
- **곽도진:** 백발 도인, 학창의, 송문고검.
- **사무결:** 검은 삿갓, 창백한 턱선, 핏빛 손톱, 의외로 젊은 얼굴, 붉은 눈. 2페이즈는 붉은 거인.
- **그림자늑대:** 송아지만 한 늑대, 등줄기를 따라 검은 불꽃.
- **화염군주 이그니스**, 사천왕(빙결의 여왕·대지의 거인·그림자 암살자)
- **마왕 바르가스:** 사람의 세 배 키, 찢어진 박쥐 날개, 왕관처럼 솟은 비틀린 뿔 일곱, 텅 빈 우물 같은 눈.
- **틈 괴물:** 불타는 비늘의 머리 셋 달린 개, 그림자 망령(지나간 자리의 풀이 재가 됨), 뼈 거인.
- **지옥왕 모르데카이:** 여러 세계의 흐름을 꿰매 붙인 몸(마나의 팔, 내공의 팔), 가슴에 고동치는 푸른 심장, 꿰맨 실밥이 한곳에 모인 매듭.

---

## 프롬프트 본문 3 — GitHub 협업 흐름

### 12. 규칙(`docs/ASSET_PIPELINE.md`에도 반영)

- **라벨:** `asset-request`, `codex`, `claude`, `needs-fix`, `integrated`, `blocked`(선행 에셋 대기)
- **브랜치:** `main`은 보호한다(직접 푸시 금지, PR + CI 통과 후 스쿼시 머지).
  - 아트: `art/<이슈번호>-<id>`
  - 코드: 세션 지정 브랜치 또는 `feat/…`, `fix/…`
- **커밋 접두어:** `art(<id>):`, `feat(<영역>):`, `fix(<영역>):`, `docs:`, `ci:`

### 13. 진행 순서

1. **Claude — 요청.** 에셋이 필요하면 직접 그리지 않는다.
   - `specs/assets/<id>.yaml`을 쓰고 `npm run assets:placeholder -- <id>`로 임시 시트를 만들어 게임이 먼저 돌아가게 한다.
   - `npm run assets:prompt -- <id>`로 완성 프롬프트를 뽑아 에셋 요청 이슈를 연다(라벨 `asset-request`, `codex`. 선행 에셋이 아직 없으면 `blocked`도).
   - 이슈 본문에는 명세 경로, 한 줄 요약, 선행 에셋, 완성 프롬프트 전문, 참조 이미지 경로를 넣는다. Codex가 해석할 여지를 남기지 않는다.
2. **사람 — 전달.** Codex 앱·CLI에서 저장소를 열고 "이슈 #N 처리해"라고 맡긴다. 클라우드 작업을 쓰려면 이슈에 "@codex AGENTS.md 절차대로 이 이슈 처리해"라고 댓글을 단다.
3. **Codex — 제작.** AGENTS.md 순서대로 시트 생성 → 자르기 → 검증 → 아트 PR(라벨 `codex`, `Closes #N`). `specs/`는 건드리지 않는다.
4. **CI — 자동 검증**(`validate.yml`)
   - `assets/**`나 `specs/**`가 바뀐 PR: `assets:validate`
   - `src/**`·`data/**`·`tools/**`가 바뀐 PR: 타입 검사, `data:check`, 테스트
   - 폴더 소유권 검사: `art/*` 브랜치는 `assets/source/**`·`assets/sprites/**` 외의 파일을 바꾸면 실패한다. 그 밖의 브랜치는 이 두 폴더를 바꾸면 실패한다.
5. **Claude — 검토.** PR을 받아 `_contact.png`와 `_preview.gif`를 확인한다.
   - 문제가 있으면 "몇 번째 프레임이 무엇이 틀렸는지" 구체적으로 PR 댓글을 남기고 `needs-fix` 라벨을 단다. 사람이 "@codex 이 피드백 반영해"로 넘길 수 있다.
   - 통과면 "아트 승인" 댓글을 단다.
6. **사람 — 머지.** 아트 PR을 머지한다.
7. **Claude — 확인.** 게임에서 실제 에셋으로 자동 교체됐는지 확인하고, 이슈에 `integrated` 라벨을 단다. 그 에셋을 기다리던 `blocked` 이슈의 라벨을 푼다. 이벤트 프레임 타이밍 조정 같은 코드 변경이 필요할 때만 `feat/<id>-integrate` 브랜치를 쓴다.

### 14. CLAUDE.md에 반드시 들어갈 내용

- 게임 설계의 기준은 `docs/GAME_DESIGN.md`다. 설계를 바꾸면 이 문서부터 고친다.
- 카드·적·모듈·지원 규칙은 JSON 데이터로만 추가한다. 새 효과가 필요하면 기본 동작을 하나 추가하고 `docs/CARD_EFFECTS.md`와 테스트를 함께 갱신한다.
- 엔진 안의 무작위는 시드 RNG만 쓴다. 수치는 `data/balance.json`에 둔다.
- 그래픽이 필요하면 13절 1단계(명세 + 임시 시트 + 이슈)만 한다. 이미지를 직접 만들거나 `assets/source/`·`assets/sprites/`를 고치지 않는다. manifest는 커밋하지 않는다.
- 애니메이션은 반드시 meta.json을 읽는 SpritePlayer로 재생한다. 피격 판정 같은 타이밍은 `events`의 프레임 번호(1부터)에 맞춘다.
- Codex PR 검토 기준: 검증 통과, 프레임 간 일관성, ART_STYLE.md 준수, 다른 폴더 미수정.
- 작업을 끝내면 무엇을 바꿨는지와 사람이 해야 할 일을 짧게 보고한다.

---

## 프롬프트 본문 4 — 1차 작업 범위와 완료 기준

### 15. 1차 작업 범위

1. **구조와 문서:** 8절 구조, CLAUDE.md, AGENTS.md, docs 5종(GAME_DESIGN, ROUTE_MODULES, CARD_EFFECTS, ART_STYLE 초안, ASSET_PIPELINE)
2. **도구:** `tools/` 스크립트 전부와 npm 스크립트
   - `assets:slice`, `assets:validate`, `assets:placeholder`, `assets:prompt`, `assets:status`, `assets:manifest`, `data:check`
3. **GitHub:** 이슈·PR 템플릿, `validate.yml`(소유권 검사 포함), `deploy.yml`. 라벨은 도구로 가능하면 만들고, 안 되면 사람 할 일로 넘긴다.
4. **엔진**
   - 시드 RNG, 효과 해석기, 파티 전투(최대 3명, 개별 HP, 쓰러짐)
   - 내공·마나(세계 규칙), 융합, 전투 균열·런 상흔, 결 읽기, 지원 규칙 트리거(왕일검 규칙 4개)
5. **경로:** 경로 생성기, 모듈 스키마, S1 엘하임 숲 모듈 8개 이상(전투 3, 엘리트 1, 이벤트 3, 휴식 1) + 고정 노드(동료 합류, 운하검 탄생) + 보스 자리(이그니스, 임시 데이터)
6. **연출:** SpritePlayer, 타격 연출(흔들림, 데미지 숫자, 번쩍임), 균열 오버레이
7. **프로토타입**
   - 시드 입력 → S1 지도 → 노드 선택 → 전투(하운 + 엘리아 vs 그림자늑대 2마리)
   - 카드는 하운 10장 + 엘리아 6장(JSON). 내공·마나·균열·결 표시.
   - 왕일검 지원은 디버그 토글로 시연한다. 그래픽은 전부 임시 시트다.
8. **에셋 명세와 이슈:** `haun_ref`, `haun_idle`, `haun_attack`, `fx_slash_blue`(운하검 벽운단하), `wolf_ref`, `wolf_idle`
   - 이슈 6개를 연다. ref가 아닌 것은 `depends_on`과 `blocked` 라벨을 단다.
   - 프로토타입에 필요한 나머지(`haun_hit`, `wolf_attack`, `wolf_hit`, `elia_idle`, `elia_attack`, `elia_hit`)는 명세 + 임시 시트만 만든다.

### 16. 완료 기준

- ☐ `npm run dev`로 지도 → 전투가 실행되고 임시 애니메이션이 재생된다.
- ☐ 같은 시드로 두 번 생성하면 같은 지도, 다른 시드면 다른 지도가 나온다. 생성 제약 테스트가 통과한다.
- ☐ 임시 시트 하나가 자르기 → 검증을 통과한다(파이프라인 자체 시험).
- ☐ 프레임 수가 모자란 시트와 비율이 틀린 시트(fixture)에 대해 검증기가 실패하는 테스트가 있다.
- ☐ 엔진 테스트가 통과한다: 융합 시 균열 증가, 세계별 감쇠, 균열 폭주, 결 노출 소모, 왕일검 4턴 박자, 멤버 쓰러짐과 하운 쓰러짐 패배.
- ☐ CI가 PR에서 통과하고, 템플릿·워크플로가 반영되고, 에셋 요청 이슈 6개가 열려 있다.
- ☐ 마지막 보고: 만든 것, 사람이 Codex에 이슈를 넘기는 방법, 네가 정한 가정 목록, 사람이 할 일(라벨·브랜치 보호·Pages 활성화 등 도구로 못 한 것)
