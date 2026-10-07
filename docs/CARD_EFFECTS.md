# CARD_EFFECTS — 효과 기본 동작과 카드 JSON 스키마

카드·적 행동·지원 규칙의 효과는 모두 아래 **기본 동작의 조합**으로만 표현한다. 카드별 개별 코드는 금지한다.
새 효과가 필요하면 기본 동작을 하나 추가하고(`src/engine/schema.ts`의 `BATTLE_OPS` + `src/engine/effects.ts`),
이 문서와 `tests/engine.test.ts`를 함께 갱신한다. 스키마 검사는 `npm run data:check`.

## 1. 전투 기본 동작(13개)

| op | 필드 | 기본 대상 | 설명 |
|---|---|---|---|
| `damage` | amount, times | 카드 대상(적 1명 / 적 전체) | 피해. 힘·약화·취약·결 노출·무형·흐름 포식 보정 |
| `block` | amount | 자신 | 방어(다음 자기 턴 시작에 사라짐) |
| `heal` | amount | 자신 | 체력 회복(최대치까지) |
| `gain_neigong` | amount | — | 내공 증감 |
| `gain_mana` | amount | — | 마나 증감(0~최대) |
| `draw` | amount | — | 카드 뽑기 |
| `discard` | amount | — | 손패에서 무작위로 버리기 |
| `apply_status` | status, stacks | 카드 대상 | 상태 부여(`data/statuses.json`) |
| `remove_status` | status, stacks? | 자신 | 상태 제거(stacks 없으면 전부) |
| `rift` | amount | — | 전투 균열 증감. 증가 후 지원 트리거·폭주 검사 |
| `reveal_grain` | stacks | 카드 대상 | 결 노출 부여(매듭 검사 포함) |
| `taunt` | stacks | 자신 | 도발 |
| `add_card` | card, count, to | — | 카드 생성(hand / draw / discard) |

**공통 수식자**
- `target`: `self`(효과를 일으킨 쪽) · `ally`(카드가 지정한 아군) · `enemy`(지정한 적/적 행동의 대상) · `all_enemies` · `all_allies` · `random_enemy` · `trigger_enemy`(지원 규칙을 일으킨 적). 적 행동에서는 '적/아군'이 적 입장으로 뒤집힌다.
- `times`: 연타 횟수(`damage`).
- `condition`: `riftGte`, `riftLte`, `targetHasStatus`, `targetStatusGte: [status, n]`, `world`, `partyHas`, `turnMod: [n, r]`, `enemyId`, `hpRatioLte`, `flag`, `scarMin`. 대상이 있는 동작은 대상마다 검사한다.
- `scale`: `{ per: rift | hand | mana | targetStatus, status?, amount }` → 기본값 + amount × per.

## 2. 피해 계산 순서

1. 기본값 + 공격자 힘(스택당 +1)
2. × 공격자 약화(0.75)
3. 무형: 비용이 내공만이면 × 0.5
4. 결 노출: 아군 공격이면 1스택 소모, × 1.5, 방어 무시
5. × 대상 취약(1.5) → 내림
6. 흐름 포식: 내공·마나 비용이 있는 카드면 피해 대신 그만큼 최대 HP·HP 증가
7. 방어로 흡수 → HP 감소 → 0이면 쓰러짐/처치

## 3. 카드 JSON(`data/cards/<owner>.json`)

```jsonc
{
  "id": "haun_byeogun",                 // 소문자_숫자
  "name": "벽운단하",
  "owner": "haun",                      // 캐릭터 id | common | status
  "type": "attack",                     // attack | skill | power | status
  "rarity": "epic",                     // common(일반) | uncommon(고급) | rare(희귀) | epic(영웅) | legendary(전설) | special(상태·저주)
  "pool": "story",                      // starter | reward(전투 보상 후보) | story(이벤트로만) | status
  "cost": { "neigong": 1, "mana": 2 },  // 둘 다 > 0이면 융합(하운 전용, 반드시 rift 증가)
  "target": "enemy",                    // enemy | all_enemies | self | ally | all_allies | none
  "keywords": ["fusion"],               // exhaust(소멸) | retain(유지) | innate(선천) | fusion | unplayable
  "effects": [ { "op": "damage", "amount": 18 }, { "op": "rift", "amount": 3 } ],
  "upgrade": {                          // 강화 +1~+5(상태 카드 제외 필수)
    "growth": [4, 0],                   //   +1~+3: 단계마다 effects[i]의 amount(없으면 stacks)에 더할 값. 효과 수와 같아야 한다
    "plus4": { "name": "구름을 쪼개다", "effects": [ { "op": "apply_status", "status": "vulnerable", "stacks": 2 } ] },
    "plus5": { "name": "강을 끊다", "effects": [ { "op": "rift", "amount": -2 } ] }
    //   특수 스킬 필드: name, effects(뒤에 덧붙음), addKeywords, removeKeywords, cost(비용 교체)
  },
  "anim": "attack",                     // 선택: 카드 주인이 재생할 애니메이션
  "fx": "fx_slash_blue",                // 선택: 대상 위에 겹칠 이펙트 에셋 id
  "castLine": { "speaker": "haun", "face": "resolve", "text": "운하검 제일식, 벽운단하(劈雲斷河)." },  // 영웅·전설 필수: 컷인 대사(face: neutral | resolve | surprise)
  "text": "...",                        // 선택: 없으면 효과에서 자동 생성(src/engine/text.ts)
  "flavor": "운하검 제일식, 벽운단하(劈雲斷河). 구름을 쪼개고 강을 끊는다."
}
```

**강화 규칙**
- 카드 한 장마다 단계 0~5(`balance.upgrade.maxLevel`). `upgrade_card` 동작 한 번에 +1.
- +1~+3(`balance.upgrade.statLevels`): `growth`만큼 수치가 오른다. 비용·키워드·효과 수는 그대로.
- +4·+5: `plus4`, `plus5` 특수 스킬이 차례로 붙는다. 카드 문구에 `★이름: 설명` 줄로 보인다.
- 휴식의 수련(`upgrade_card` + `"choose": true`)은 사람이 강화할 카드를 고른다(강화 뒤 모습으로 미리 보기). 이벤트의 강화는 무작위.

**등급 규칙**(`data:check`가 검사)
- 시작 카드(`pool: starter`)는 모두 일반. 보상 풀에는 일반이 없다.
- 전설은 스토리로만 얻는다(`pool: story`).
- 영웅·전설은 `castLine`이 있어야 한다. 쓸 때마다 화면이 어두워지고, 화자의 반신 그림(`<화자>_stand`의 표정 프레임)과 대사가 나온 뒤 스킬이 나간다(약 1.5초, 클릭하면 건너뜀).
- 전투 보상 후보는 노드 유형별 등급 가중치(`balance.rewards.rarityWeights`)로 등급을 먼저 뽑고, 그 등급에서 카드를 고른다.

## 4. 상태(`data/statuses.json`)

| id | 이름 | 감소 | 효과 |
|---|---|---|---|
| weak | 약화 | 자기 턴 끝 -1 | 주는 피해 ×0.75 |
| vulnerable | 취약 | 자기 턴 끝 -1 | 받는 피해 ×1.5 |
| strength | 힘 | 없음 | 공격 피해 +스택 |
| bind | 빙결 | 자기 턴 끝 -1 | 행동 불가 |
| stun | 기절 | 자기 턴 끝 -1 | 행동 불가 |
| poison | 독 | 자기 턴 끝 -1 | 턴 시작마다 스택만큼 HP 손실 |
| grain | 결 노출 | 없음(적중 시 소모) | 8절 참고 |
| taunt | 도발 | 라운드 끝 -1 | 적 공격이 이 동료에게 |
| incorporeal | 무형 | 특성 | 내공만 쓴 공격 ×0.5 |
| flow_eater | 흐름 포식 | 특성 | 흐름을 쓴 카드 피해 흡수 |
| knot / knot_exposed | 매듭 / 매듭 노출 | 특성 | 결 3스택에 매듭 노출 |

일반 상태의 효과는 `modifiers`(damageDealtMul, damageDealtAddPerStack, damageTakenMul, skipTurn, turnStartDamagePerStack)로 데이터만으로 정의한다.
`special`이 붙은 6개는 엔진이 메커니즘으로 처리한다.

## 5. 적 JSON(`data/enemies.json`)

`moves[]`의 `effects`는 카드와 같은 기본 동작을 쓴다. `pattern: cycle`(순서대로) 또는 `random`(가중치, 같은 행동 3연속 금지).
`targeting`: random | lowest_hp | highest_hp | haun. `sprite`가 있으면 `<sprite>_idle / _attack / _hit` 에셋을 쓰고, 없으면 실루엣으로 대신한다.
