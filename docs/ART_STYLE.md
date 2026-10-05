# ART_STYLE — 화풍·팔레트·캐릭터 외형

> **상태: 초안 v0.1** — 기본값은 화풍 C(혼합)입니다. 첫 에셋 `haun_ref`가 화풍 시험을 겸합니다.
> 사용자가 그 PR을 보고 승인하면 이 줄을 "확정"으로 바꿉니다. 다른 안을 고르면 아래 "확정 화풍"과 `prompt-data`의 스타일 줄만 바꿉니다.

**확정 화풍: C(혼합)** _(초안)_

이 문서는 Claude가 관리합니다. Codex는 읽기만 합니다. 이미지 프롬프트는 맨 아래 `prompt-data` 블록에서
`tools/render-prompt.mjs`가 자동으로 가져가므로, 스타일을 바꾸려면 그 블록을 고칩니다.

## 1. 화풍 후보

| 안 | 모습 | 장점 | 단점 |
|---|---|---|---|
| A. 수묵 담채 | 먹선 굵기 변화, 번짐, 여백, 한지 질감, 옅은 채색 | 무협 정서, '결·구름·강' 이미지와 잘 맞음 | 번지는 가장자리 때문에 크로마키 제거·프레임 일관성에 불리 |
| B. 굵은 외곽선 셀 채색 | 2~3단계 명암, 짙은 남색 외곽선, 평면 색 | 배경 제거가 깔끔, 프레임 일관성·50% 축소 판독성 좋음 | 무협 고유 정서가 약함 |
| **C. 혼합(권장)** | 스프라이트는 B에 외곽선만 붓선 질감. 카드 일러스트·배경·초상화는 A | 제작 안정성과 무협 정서를 함께 | 두 화풍의 경계를 문서로 관리해야 함 |

### C안 세부
- **스프라이트**(캐릭터·적·이펙트): 평면 셀 채색 2~3단계, 짙은 남색(#1d2433) 외곽선, 외곽선 굵기에만 붓 터치 변화. 그라데이션·번짐·텍스처 금지(크로마키·일관성 때문).
- **일러스트**(카드·배경·초상화): 수묵 담채. 먹선과 여백, 한지 질감, 옅은 채색.
  - 무림: 먹·한지 톤, 쪽빛과 황토 담채
  - 엘하임: 같은 수묵 기법에 은빛·청색 담채, 두 개의 달(은빛·옅은 푸른빛)
  - 마왕성: 흑요석과 보랏빛 번개(스프라이트는 초록 키 사용)
  - 세계의 틈: 검붉은 어둠에 부서진 세계의 조각들이 떠 있음
- 비율: 스프라이트 캐릭터는 약 6등신. 칸 높이의 60~70%를 차지.
- 조명: 왼쪽 위에서 오는 부드러운 주광. 아군은 오른쪽, 적은 왼쪽을 본다.

## 2. 색 코드(UI와 이펙트 공통)

| 의미 | 색 | 근거 |
|---|---|---|
| 내공 | 따뜻한 금빛·주황 `#f2a93b` | "따뜻하고 단단한, 작은 불씨 같은 것" |
| 마나 | 청은빛 `#8fd3ff` | 공기 속을 흐르는 빛 알갱이 |
| 운하검 | 푸른 검광 `#4fb4ff` | "푸른 검광이 협곡을 세로로 갈랐다" |
| 균열 | 검은 금 `#0b0b10` + 붉은 점멸 `#ff3b3b` | "그 안에서 이따금 붉은 빛이 깜빡였다" |
| 마기 | 검붉은 `#5a1020` | "무겁고 끈적한 것" |

크로마키 색(마젠타 `#FF00FF`, 초록 `#00FF00`)과 비슷한 색은 해당 키를 쓰는 캐릭터에 쓰지 않는다.

## 3. 캐릭터 외형(원작 근거)

| id | 이름 | 외형 | 키 색 |
|---|---|---|---|
| haun | 진하운 | 18~20세, 마른 잔근육 체격, 해진 회갈색 무명옷, 손에 감은 천. 초반 도끼·나뭇가지, 이후 검. 융합 시 피부 아래 푸른 빛줄기 | magenta |
| elia | 엘리아 | 하프엘프 마법사, 긴 은발, 끝이 뾰족한 귀, 청회색 여행용 로브 | magenta |
| kyle | 카일 로웬 | 금발 청년 기사, 은빛 갑옷(찢긴 자국), 긴 검, 몰락 가문의 낡은 문장 | magenta |
| born | 보른 | 드워프, 하운 가슴께 키, 덥수룩한 수염, 자기 키만 한 도끼와 둥근 방패 | magenta |
| wang | 왕일검 | 등이 굽고 한쪽 다리를 저는 노인, 지팡이, 흐린 눈, 주방 노인 차림(초상화만) | none |
| kwak_dojin | 곽도진 | 백발 도인, 학창의, 송문고검 | magenta |
| sa_mugyeol | 사무결 | 검은 삿갓, 창백한 턱선, 핏빛 손톱, 젊은 얼굴, 붉은 눈. 2페이즈 붉은 거인 | green |
| shadow_wolf | 그림자늑대 | 송아지만 한 늑대, 등줄기를 따라 검은 불꽃 | magenta |
| ignis | 화염군주 이그니스 | 용암과 불꽃의 거구 | magenta |
| vargas | 마왕 바르가스 | 사람의 세 배 키, 찢어진 박쥐 날개, 왕관처럼 솟은 비틀린 뿔 일곱, 텅 빈 우물 같은 눈 | green |
| rift_beasts | 틈 괴물 | 불타는 비늘의 머리 셋 달린 개, 그림자 망령, 뼈 거인 | green |
| mordecai | 지옥왕 모르데카이 | 여러 세계의 흐름을 꿰매 붙인 몸, 가슴에 고동치는 푸른 심장, 실밥이 모인 매듭 | green |

## 4. 프롬프트 데이터

`tools/render-prompt.mjs`가 이 블록을 읽어 이미지 생성 프롬프트를 채운다. 영어로 쓴다.

<!-- prompt-data -->
```yaml
sprite_style: >-
  2D game sprite, flat cel shading with 2-3 tone steps, clean dark navy (#1d2433) outline whose
  thickness varies slightly like an ink brush stroke, no gradients, no texture, no soft glow on the body,
  readable silhouette at half size, soft key light from the upper left
fx_style: >-
  2D game visual effect of pure light on black, crisp white-hot core fading to a saturated colored edge,
  clean sweeping shapes whose edges taper like an ink brush stroke, a few sharp sparks, no smoke,
  no realistic particles, no lens flare
illustration_style: >-
  East Asian ink wash painting with light watercolor tints (sumuk damchae), expressive brush lines,
  generous empty space, subtle hanji paper texture
subjects:
  haun: >-
    Jin Haun, a lean 19-year-old East Asian young man, former servant disciple of a martial sect;
    worn grey-brown hemp robe with rolled sleeves, cloth strips wrapped around both hands,
    short messy black hair tied back, a plain straight sword; determined calm eyes
  elia: >-
    Elia, a half-elf mage woman, long silver hair, pointed ear tips, slate-blue hooded travelling robe
    with silver trim, slender hands, gentle but tired eyes
  kyle: >-
    Kyle Rowen, a blond young knight, scratched silver plate armor over a faded blue tabard with a worn
    family crest, long straight sword, cocky grin
  born: >-
    Born, a stocky dwarf warrior reaching a man's chest, thick braided brown beard, a two-handed axe
    as tall as himself and a round iron shield, few words
  shadow_wolf: >-
    a shadow wolf, a wolf the size of a calf with charcoal-black fur, black flames flickering along its
    spine, amber eyes, lean and hungry
```
