# CARD_EFFECTS — 효과 기본 동작과 카드 JSON 스키마

카드·적 행동·지원 규칙의 효과는 모두 아래 **기본 동작의 조합**으로만 표현한다. 카드별 개별 코드는 금지한다.
새 효과가 필요하면 기본 동작을 하나 추가하고(`src/engine/schema.ts`의 `BATTLE_OPS` + `src/engine/effects.ts`),
이 문서와 `tests/engine.test.ts`(원작 기믹은 `tests/mechanics.test.ts`)를 함께 갱신한다. 스키마 검사는 `npm run data:check`.

## 1. 전투 기본 동작(16개)

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
| `dispel` | — | 카드 대상 | 돌려보내기(운해귀종·두린의 망치): 대상의 강화(`kind: buff`) 상태와 방어를 모두 걷어 낸다. 약화 같은 debuff·특성(trait)은 남는다 |
| `neigong_max` | amount | — | 이번 전투에서 턴마다 차는 내공 증감(내공의 실: 팔 년 내공을 실로 뽑는다). 0 아래로 내려가지 않는다 |
| `lose_hp` | amount | 자신 | 체력 잃기(방어 무시, 피의 값). '체력을 잃었을 때' 발동을 부른다 |

**공통 수식자**
- `target`: `self`(효과를 일으킨 쪽) · `ally`(카드가 지정한 아군) · `enemy`(지정한 적/적 행동의 대상) · `all_enemies` · `all_allies` · `random_enemy` · `trigger_enemy`(지원 규칙을 일으킨 적). 적 행동에서는 '적/아군'이 적 입장으로 뒤집힌다.
- `times`: 연타 횟수(`damage`).
- `condition`: `riftGte`, `riftLte`, `targetHasStatus`, `targetStatusGte: [status, n]`, `world`, `partyHas`, `turnMod: [n, r]`, `enemyId`, `hpRatioLte`, `flag`, `scarMin`. 대상이 있는 동작은 대상마다 검사한다.
- `scale`: `{ per, status?, amount, max? }` → 기본값 + ⌊amount × per⌋(max가 있으면 더하는 값의 상한). `apply_status`·`reveal_grain`·`taunt`의 스택에도 걸린다.
  - per: `rift` 균열 · `hand` 손패 수 · `mana` 마나 · `targetStatus` 대상의 status 스택 · `selfStatus` 자신의 status 스택 · `cardsPlayed` 이번 턴에 이 카드 **전에** 낸 카드 수 · `block` 자신의 방어 · `missingHp` 자신이 잃은 체력 · `enemies` 살아 있는 적 수
  - 예: 결을 따라 `{"op":"damage","amount":4,"scale":{"per":"targetStatus","status":"grain","amount":3}}`, 산처럼 `{"op":"damage","amount":0,"scale":{"per":"block","amount":0.5}}`, 불씨 잇기(화상 두 배) `{"op":"apply_status","status":"burn","stacks":0,"scale":{"per":"targetStatus","status":"burn","amount":1}}`
  - 카드 문구는 꼬리말을 자동으로 붙인다: "피해 4 (대상의 결 노출 1당 +3)", "피해 (자신의 방어 2당 +1)".

## 2. 피해 계산 순서

0. 꿰맬 자리(`seam`): 실(`thread`) 키워드 카드가 아니면 피해 0으로 끝
1. 기본값 + 공격자 힘(스택당 +1)
2. × 공격자 약화(0.75)
3. 틈의 굶주림(`hungry`): 카드 비용 내공이 2 이상이면 × 0.5
4. 무형: 비용이 내공만이면 × 0.5
5. 결 노출: 아군 공격이면 1스택 소모, × 1.5, 방어 무시
5a. 속성(`damage`의 `element`: fire | ice): 적의 `weak`이면 × `elements.weakMultiplier`(1.5), `resist`면 × `resistMultiplier`(0.5)
5b. 치명타: 아군 **카드**의 피해 한 번마다 시드 RNG로 굴린다. 확률은 `characters[].crit`(없으면 `balance.crit.chance`), 배율 `balance.crit.multiplier`(1.5). 피해 미리보기 복제·시험(`state.noCrit`)에서는 굴리지 않는다
6. × 대상 취약(1.5)·받는 피해 보정(얼음 속 심장 0.2 등) → 내림
7. 흐름 포식: 내공·마나 비용이 있는 카드면 피해 대신 그만큼 최대 HP·HP 증가
8. 방어로 흡수 → HP 감소 → 맞았으면(방어로 막혔어도) 속성 상태를 붙인다(9) → 0이면 쓰러짐/처치(처치 효과 → 짝 변신 → 혼자 남음 변신 → 승리 검사). 굶주린 적을 3의 카드로 쓰러뜨렸으면 균열 +1

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
  "keywords": ["fusion"],               // exhaust(소멸) | retain(유지) | innate(선천) | fusion | unplayable | thread(실: 꿰맬 자리에 들어간다)
  "tags": ["haun_rift"],                // 선택: 아키타입(characters[].archetypes의 id, GAME_DESIGN 9-2). 공용은 아무 동료의 것
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
- 보유 카드 종류마다 단계 0~5(`balance.upgrade.maxLevel`, GAME_DESIGN 9-1 — 같은 카드는 한 장만 가진다). `upgrade_card` 동작 한 번에 +1. 가진 카드를 또 얻어도 +1.
- `essential: true`: 보스를 깨는 열쇠 카드. 가지고 있으면 편성과 상관없이 늘 덱에 들어간다(이야기 카드만).
- +1~+3(`balance.upgrade.statLevels`): `growth`만큼 수치가 오른다. 비용·키워드·효과 수는 그대로.
- +4·+5: `plus4`, `plus5` 특수 스킬이 차례로 붙는다. 카드 문구에 `★이름: 설명` 줄로 보인다.
- 휴식의 수련(`upgrade_card` + `"choose": true`)은 사람이 강화할 카드를 고른다(강화 뒤 모습으로 미리 보기). 이벤트의 강화는 무작위.

**등급 규칙**(`data:check`가 검사)
- 시작 카드(`pool: starter`)는 일반·고급 — 동료가 합류할 때(공용은 런을 시작할 때) 10장씩 보유 카드가 된다(GAME_DESIGN 9-1).
- 동료마다 시작·보상 카드 20장(일반 8 · 고급 6 · 희귀 3 · 영웅 2 · 전설 1), 공용(`owner: "common"`, `data/cards/common.json`, 전투에서는 하운이 쓴다) 30장(일반 12 · 고급 9 · 희귀 5 · 영웅 3 · 전설 1). 이야기 카드(`pool: story`)는 따로.
- 영웅·전설은 `castLine`이 있어야 한다. 쓸 때마다 화면이 어두워지고, 화자의 반신 그림(`<화자>_stand`의 표정 프레임)과 대사가 나온 뒤 스킬이 나간다(약 1.5초, 클릭하면 건너뜀).
- 전투 보상 후보는 노드 유형별 등급 가중치(`balance.rewards.rarityWeights`)로 등급을 먼저 뽑고, 그 등급에서 카드를 고른다.

9. **속성 상태**(`balance.elements`): 화염 → 화상(`burn`) 1, 냉기 → 냉기(`chill`) 1. 대상이 그 속성에 내성이면 붙지 않는다.
   상극: 화염은 대상의 냉기를 녹이고(지운다), 냉기는 화상을 끈다. 냉기가 `freezeAt`(3, 보스는 `bossFreezeAt` 5)에 이르면 냉기를 비우고 `freezeStatus`(빙결) 1.

카드 문구는 속성 피해를 "화염 피해 9(화상 1)"처럼 자동으로 쓴다. 적 의도 옆에는 炎(화염)·冷(냉기) 표시, 적 이름 아래에는 '약점 냉기'·'내성 화염' 이름표가 붙는다.

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
| blood_cover | 피의 덮개 | 특성 | 결 노출이 붙지 않는다(천마혈공). 천외귀운의 `remove_status`가 벗긴다 |
| hungry | 틈의 굶주림 | 특성 | 내공 2 이상 카드 피해 ×0.5, 그 카드로 처치하면 균열 +1 |
| still | 흐르지 않는 자 | 라운드 끝 -1 | 적이 이 아군을 노리지 못한다(special `unseen`). 다른 아군이 없으면 헛손질 |
| seam | 꿰맬 자리 | 특성 | 실(thread) 카드의 피해만 받는다 |
| burn | 화상 | 자기 턴 끝 -1 | 턴 시작마다 스택×2 HP 손실. 냉기 공격에 꺼진다 |
| chill | 냉기 | 없음 | special `chill`: 3스택(보스 5)이면 빙결 1로 바뀐다. 화염 공격에 녹는다 |
| mountain_regen | 산이 메운다 | 없음 | 차례 시작마다 스택×4 회복(`turnStartDamagePerStack` 음수 = 회복) |
| frozen_heart / shadow_body / blood_veil / dead_forest | 얼음 속 심장 / 그림자 몸 / 두 옥좌 / 죽은 숲의 몸 | 없음 | 받는 피해 ×0.2 / ×0.25 / ×0.5 / ×0.6 (짝·처치·dispel로 풀리는 보스 기믹) |

일반 상태의 효과는 `modifiers`(damageDealtMul, damageDealtAddPerStack, damageTakenMul, skipTurn, turnStartDamagePerStack — 음수면 회복)로 데이터만으로 정의한다.
`special`(grain, taunt, incorporeal, flow_eater, knot, knot_exposed, blood_cover, hungry, unseen, seam, chill)은 엔진이 메커니즘으로 처리한다.

## 4-1. 상태 발동(파워)

상태에 `triggers`를 두면, 그 상태를 가진 쪽에게 일이 생길 때마다 효과가 **그 쪽을 출처로** 일어난다. 파워 카드(`type: power`)는 자신에게 이런 상태를 거는 카드다. 파워 카드는 늘 소멸하고 대상은 `self`(`data:check`).

```jsonc
{ "id": "p_payback", "name": "되갚기", "kind": "buff", "decay": 0, "glyph": "報",
  "description": "공격을 맞을 때마다(방어로 막아도) 때린 적에게 피해 3(스택마다).",
  "triggers": [ { "on": "attacked", "effects": [ { "op": "damage", "amount": 3, "target": "trigger_enemy" } ] } ] }
```

| 필드 | 뜻 |
|---|---|
| `on` | `turnStart` 그 편 차례 시작(아군: 카드를 뽑은 뒤, 지원 규칙·유물보다 먼저) · `turnEnd` 그 편 차례 끝(감소 전) · `cardPlayed` 아군이 카드를 낸 뒤(효과가 다 끝난 다음, 적이 가진 상태도 발동) · `attacked` 공격을 맞았을 때(방어로 다 막아도) · `hpLost` 체력을 잃었을 때(자해·화상·독 포함) |
| `perStack` | 기본 true: 수치에 스택 수를 곱한다 |
| `cardType` · `keyword` · `ownCards` | `cardPlayed` 거르기: 카드 유형 / 키워드(예: fusion) / 가진 동료의 카드만 |
| `condition` | 일반 조건(대상 검사는 가진 쪽) |
| `effects` | 전투 동작. `trigger_enemy`는 공격자(attacked·hpLost) |

- 발동이 다른 발동을 부를 수 있지만 깊이 2까지만(되갚기끼리 끝없이 주고받지 않게).
- 전투 화면은 발동할 때마다 그 쪽 위에 상태 이름을 띄운다(`power` 이벤트).

| id | 이름 | 발동 |
|---|---|---|
| p_grain_eye | 결을 보는 눈(하운 청운출수) | 차례 시작: 무작위 적 결 노출 1 |
| p_waterwheel | 물레방아(하운) | 차례 시작: 마나 +1 / 융합 카드를 낸 뒤: 무작위 적 피해 4 |
| p_wildfire | 번지는 불길(엘리아 청염초) | 차례 시작: 적 전체 화상 1 |
| p_frost_branch | 서리 내린 가지(엘리아 은빛 나무) | 차례 시작: 무작위 적 냉기 1, 아군 전체 방어 2 |
| p_sword_rhythm | 검의 박자(카일 눈을 감고) | 공격 카드를 낸 뒤: 무작위 적 피해 2 |
| p_blood_taste | 피 맛(카일 흉터의 맹세) | 체력을 잃었을 때: 힘 +1 |
| p_mountain_body | 산의 소리(보른) | 차례 시작: 방어 5 |
| p_payback | 되갚기(보른) | 공격을 맞았을 때: 때린 적에게 피해 3 |

## 5. 적 JSON(`data/enemies/<stage>.json`)

적은 처음 나오는 스테이지의 파일에 정의하고, 뒤 스테이지는 id로 다시 쓴다(로더가 `data/enemies/*.json`을 모두 읽는다. id 중복은 오류).

`moves[]`의 `effects`는 카드와 같은 기본 동작을 쓴다. `pattern: cycle`(순서대로) 또는 `random`(가중치, 같은 행동 3연속 금지).
`targeting`: random | lowest_hp | highest_hp | haun. `sprite`가 있으면 `<sprite>_idle / _attack / _hit` 에셋을 쓰고, 없으면 실루엣으로 대신한다.

- `weak` / `resist`: 속성 약점·내성 배열(fire | ice). 예: 불의 정령·이그니스 `weak: ["ice"], resist: ["fire"]`, 아르덴의 얼음 적 `weak: ["fire"], resist: ["ice"]`.
- `hpPerScar`: 런 상흔 1마다 늘어나는 최대 체력(마지막 한 땀의 '찢긴 경계').
- `deathEffects`: 이 적이 쓰러질 때 그 적을 출처로 일어나는 전투 동작. 예: 베일락 `[{ "op": "damage", "amount": 999, "target": "all_allies" }]`(졸개가 무너진다), 쐐기 `[{ "op": "rift", "amount": -2 }]`.

**변신(보스 2단계)** — `transform: { triggers, partner?, into, text, partyEffects }`
- `triggers`: `downed`(쓰러질 자리에서 대신 변신) / `lastStanding`(다른 적이 모두 쓰러져 혼자 남으면 변신) / `partnerDowned`(`partner`로 지정한 적이 쓰러지면 변신 — 사무결 ← 곽도진의 피, 셀리아스 ← 왕녀의 얼음, 그림자 암살자 ← 검은 수정). 여럿 줄 수 있다.
- `into`의 적 정의로 바뀌고 체력은 가득 찬다. 상태는 `into.traits`로 다시 시작하고, 변신한 차례에는 행동하지 않는다. 변신한 모습은 다시 변신하지 않는다(데이터 검사).
- `partyEffects`: 변신 순간 하운을 출처로 일어나는 전투 동작(원작 연출: 엘리아의 마나 `gain_mana`, `add_card … to: hand`).
- 예: 사무결 → 붉은 거인 사무결(S8 혈전), 모르데카이 → 찢긴 경계(S9 마지막 한 땀). 전투 이벤트 `transform`으로 화면에서 같은 자리에 새 모습으로 다시 그린다.

## 6. 전투 마나 규칙

세계 기본값 `balance.mana.worlds[world]`(`battleStart: full | carry | 숫자`, `perTurn`)을 스테이지 `mana`, 모듈 `content.mana` 순으로 덮어쓴다(`GAME_DESIGN.md` 6절). 모듈 `content.startEffects`는 전투 시작에 언제나 일어나는 전투 동작이다(이그니스전의 '흐름에 올라타기', 모르데카이전의 '고리 멈추기'를 손패에).
