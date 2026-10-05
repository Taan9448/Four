# ROUTE_MODULES — 지도 생성과 모듈

구현: `src/engine/route.ts`(지도), `src/engine/run.ts`(진행·런 단위 동작). 테스트: `tests/route.test.ts`, `tests/run.test.ts`.

## 1. 지도

- 스테이지(`data/stages.json`)의 `floors`만큼 층을 만들고, 맨 위에 보스 층 하나를 더한다.
- 층마다 노드 `route.nodesPerFloor`(기본 2~3)개. 고정 노드가 있는 층은 노드 1개라 모든 경로가 지나간다.
- 연결: 위치가 비슷한 다음 층 노드와 잇고, `extraEdgeChance`(0.35) 확률로 옆 노드에 갈래길을 더한다. 들어오는 길이 없는 노드는 가장 가까운 노드에서 잇는다.
- 노드 유형: `battle`, `elite`, `event`, `rest`, `inn`, `story`(고정), `boss`(고정).
- 유형 선택은 스테이지의 `typeWeights` 가중치. `forcedTypes`로 특정 층을 강제한다(S1: 9층 휴식).

## 2. 생성 제약(테스트로 보장)

- 모든 노드는 1층에서 도달할 수 있고, 모든 노드에서 보스까지 갈 수 있다.
- 고정 노드는 지정한 층에 단독으로 있다.
- `eliteMinFloor`(3층) 이전에는 엘리트가 없다.
- 휴식 노드가 연이어 오지 않는다.
- `once` 모듈은 런당 1회(지도 안에서도, 이미 쓴 것도).
- 같은 시드 → 같은 지도. `validateMap()`이 이 규칙들을 검사하고, 테스트는 200개 시드로 돌린다.

## 3. 모듈 스키마(`data/modules/<stage>.json`)

```jsonc
{
  "id": "s1_battle_wolf_pack",        // 고유 id
  "stage": "s1",
  "type": "battle",                    // battle | elite | event | rest | inn | story | boss
  "name": "그림자늑대 무리",
  "weight": 2,                         // 같은 유형 안에서의 가중치
  "tags": [],                          // "scar"면 상흔에 비례해 가중치 증가
  "once": false,                       // 런당 1회
  "conditions": {                      // 생성 시점 조건(모두 선택)
    "floorRange": [3, 9],
    "scarMin": 0,
    "flag": "met_companions",          // 이전 고정 스토리 노드가 줄 플래그도 인정
    "partyHas": "kyle"                 // 합류(예정) 동료
  },
  "content": {
    "text": "...",
    "enemies": ["shadow_wolf", "shadow_wolf"],          // 전투형
    "choices": [ { "label": "...", "result": "...", "effects": [ /* 런 단위 동작 */ ] } ],  // 이벤트형
    "bonus": { "condition": { "partyHas": "kyle" }, "text": "...", "effects": [ /* 전투 동작 */ ] },
    "surviveTurns": 3,                 // 전투형: 이 턴 수를 버티면 승리(이길 수 없는 전투)
    "outro": "..."                     // 보스형: 스테이지를 마친 뒤 보여 줄 장면 글
  }
}
```

**런 단위 동작**(선택지·휴식·지원 규칙의 `restOption`): `gain_card`, `remove_card`(filter), `upgrade_card`(count, filter), `heal_party`(amount | ratio), `gain_run_mana`, `scar`, `set_flag`, `join_party`, `leave_party`.
filter: `{ pool, owner, costNeigongGte }`. 무작위 선택은 `시드 + 스테이지 + 노드 + 순번` 라벨의 RNG로 결정된다.

## 4. 원작 기반 모듈 목록

| 스테이지 | 구현 | 후보 |
|---|---|---|
| S0 | 장작 패는 아이★(튜토리얼 전투), 왕 노인의 천 조각, 담장 너머의 구령, 내원 사형들의 발길질, 주방 아궁이(휴식), 관운각 밀담★, 빈 바위 아래·미끄러운 비탈·사람 키를 넘는 덤불(4층 숲 추격), 귀곡애(보스, 3턴 버티기) | — |
| S1 | 동료 합류★, 운하검의 탄생★, 그림자늑대 두 마리, 그림자늑대 무리, 협곡 도롱뇽, 우두머리(엘리트), 빛 알갱이의 숲, 모닥불의 마나 수업, 국경 마을의 소문, 카일의 검술, 모닥불(휴식), 국경 마을 여관, 이그니스(보스) | — |
| S2 | — | 성문 공성, 칠 층 회랑, 사천왕 엘리트 셋(빙결의 여왕↔엘리아, 대지의 거인↔보른, 그림자 암살자↔카일 보너스) |
| S3 | — | 운곡촌 교세★, 폐사찰 재회★, 무당 봉쇄진, 소림 잿더미(보른 보너스), 객잔 만두(카일), 매화검수, 마교 분타, 하늘의 금(scar) |
| S4 | — | 구천 계단 연속전, 정파 연합 진법 선택, 혈교도·호법·장로, 금 아래의 틈 괴물(scar) |
| S5 | — | 떠다니는 세계의 조각, 불비늘 삼두견, 그림자 망령, 뼈 거인, 먼저 가★ |

★ = 고정 스토리 노드
