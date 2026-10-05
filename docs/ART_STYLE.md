# ART_STYLE — 화풍·팔레트·캐릭터 외형

> **확정 화풍: 32px 픽셀 아트** (사용자 결정, 2026-10-05)
> 세부 표현(외곽선 두께, 명암 단계, 얼굴 표현)은 첫 에셋 `haun_ref`로 시험합니다. 그 결과를 보고 이 문서를 다듬습니다.

이 문서는 Claude가 관리합니다. Codex는 읽기만 합니다. 이미지 프롬프트와 자르기 도구의 팔레트는 맨 아래 `prompt-data` 블록에서
도구(`tools/render-prompt.mjs`, `tools/slice-sheet.mjs`)가 자동으로 가져갑니다. 스타일을 바꾸려면 그 블록을 고칩니다.

## 1. 원칙

- **논리 해상도:** 캐릭터·일반 적·이펙트는 **32×32**, 보스·큰 이펙트는 **64×64**. 카드 일러스트 64×96, 전투 배경 192×128, 초상화 64×64.
- **게임에서는 정수배로만 확대**하고(기본 5배), 보간 없이(nearest neighbor) 표시합니다.
- **제작 방식:** 이미지 모델은 "확대된 픽셀 아트"(논리 픽셀 1개 = 8×8 또는 16×16 블록)를 그리고, 자르기 도구가 블록마다 가장 많은 색을 골라 논리 해상도로 줄인 뒤 마스터 팔레트로 색을 맞춥니다.
- **금지:** 안티에일리어싱, 흐림, 그라데이션, 반투명, 디더링 노이즈, 블록보다 작은 디테일.

## 2. 스프라이트 표현

| 항목 | 기준 |
|---|---|
| 캐릭터 키 | 32px 칸에서 약 24px(사람형), 보스는 64px 칸에서 약 52px |
| 발 위치 | 32px 칸의 29번째 줄(위에서 1부터), 가로 가운데 |
| 외곽선 | 1px, 짙은 남색 `#1d2433`. 바깥쪽만, 안쪽 선은 최소화 |
| 명암 | 색마다 2~3단계(밝은 면·기본·그림자). 광원은 왼쪽 위 |
| 색 수 | 스프라이트 하나에 16색 이하(이펙트 12색 이하), 마스터 팔레트 안에서 |
| 얼굴 | 눈은 1~2px. 표정은 눈과 눈썹 위치로 |
| 방향 | 아군은 오른쪽, 적은 왼쪽을 본다 |
| 이펙트 | 검정 배경에 빛나는 색만. 중심은 흰색, 바깥으로 갈수록 채도 높은 색, 테두리 1px 끊김으로 붓 느낌 |

**무협·판타지 구분**(같은 픽셀 문법 안에서 색으로)
- 무림: 회갈색·먹색·쪽빛, 금빛 내공 이펙트
- 엘하임: 은빛·청색·초록, 청은빛 마나 이펙트
- 마왕성·틈: 흑요석·검붉은색, 보랏빛 번개(초록 키 사용)

## 3. 색 코드(UI와 이펙트 공통)

| 의미 | 색 | 근거 |
|---|---|---|
| 내공 | 금빛·주황 `#f2a93b` | "따뜻하고 단단한, 작은 불씨 같은 것" |
| 마나 | 청은빛 `#8fd3ff` | 공기 속을 흐르는 빛 알갱이 |
| 운하검 | 푸른 검광 `#4fb4ff` | "푸른 검광이 협곡을 세로로 갈랐다" |
| 균열 | 검은 금 `#0b0b10` + 붉은 점멸 `#ff3b3b` | "그 안에서 이따금 붉은 빛이 깜빡였다" |
| 마기 | 검붉은 `#5a1020` | "무겁고 끈적한 것" |

크로마키 색(마젠타 `#FF00FF`, 초록 `#00FF00`)과 비슷한 색은 해당 키를 쓰는 캐릭터에 쓰지 않습니다. 마스터 팔레트에는 두 색이 없습니다.

## 4. 캐릭터 외형(원작 근거)

| id | 이름 | 외형(32px에서 읽혀야 하는 특징) | 키 색 | 크기 |
|---|---|---|---|---|
| haun | 진하운 | 마른 청년, 회갈색 무명옷, 손에 감은 흰 천, 묶은 검은 머리, 곧은 검(푸른 검광) | magenta | small |
| elia | 엘리아 | 긴 은발, 뾰족한 귀, 청회색 로브, 손끝의 빛 | magenta | small |
| kyle | 카일 로웬 | 금발, 은빛 갑옷, 파란 겉옷, 긴 검 | magenta | small |
| born | 보른 | 작고 다부진 드워프(24px 칸 높이의 약 70%), 갈색 땋은 수염, 큰 도끼, 둥근 방패 | magenta | small |
| wang | 왕일검 | 굽은 등, 지팡이, 흰 머리, 주방 노인 차림(초상화만) | none | portrait |
| kwak_dojin | 곽도진 | 백발 도인, 흰 학창의, 송문고검 | magenta | large |
| sa_mugyeol | 사무결 | 검은 삿갓, 창백한 얼굴, 붉은 눈, 핏빛 손톱. 2페이즈 붉은 거인 | green | large |
| shadow_wolf | 그림자늑대 | 숯빛 늑대, 등줄기의 검은 불꽃, 호박색 눈 | magenta | small |
| ignis | 화염군주 이그니스 | 용암과 불꽃의 거구 | magenta | large |
| vargas | 마왕 바르가스 | 찢어진 박쥐 날개, 일곱 뿔, 텅 빈 눈 | green | large |
| rift_beasts | 틈 괴물 | 머리 셋 달린 불비늘 개, 그림자 망령, 뼈 거인 | green | small/large |
| mordecai | 지옥왕 모르데카이 | 꿰매 붙인 몸, 가슴의 푸른 심장, 실밥이 모인 매듭 | green | large |

## 5. 프롬프트·팔레트 데이터

도구가 이 블록을 읽습니다. 영어로 씁니다. `palette`는 마스터 팔레트(32색)로, 자르기 도구가 모든 픽셀을 이 중 가장 가까운 색으로 맞춥니다.

<!-- prompt-data -->
```yaml
sprite_style: >-
  crisp 32x32 pixel art in the style of a 16-bit era game sprite; 1-pixel dark navy (#1d2433) outline
  around the silhouette, 2-3 flat tone steps per color with light from the upper left, clear readable
  silhouette, no anti-aliasing, no gradients, no dithering noise, no blur
fx_style: >-
  crisp pixel-art visual effect of pure light on black; a white core pixel line, then 2-3 bands of
  increasingly saturated color outward, clean stepped edges, a few single-block sparks, no smoke,
  no gradients, no blur, no anti-aliasing
illustration_style: >-
  detailed pixel art illustration, 16-bit era game key art, East Asian wuxia mood with ink-wash
  inspired limited colors, clean stepped shading, no anti-aliasing, no gradients, no blur
palette:
  - '#0b0b10'
  - '#1d2433'
  - '#2b2b3a'
  - '#3d4459'
  - '#5d6478'
  - '#8a90a3'
  - '#c2c6d1'
  - '#f1efe6'
  - '#2a1d16'
  - '#4a3426'
  - '#6e5440'
  - '#8f7a63'
  - '#b8a184'
  - '#e0cfae'
  - '#f2c8a0'
  - '#c98f6b'
  - '#5a1020'
  - '#a02634'
  - '#ff3b3b'
  - '#ff8a5c'
  - '#b8741a'
  - '#f2a93b'
  - '#ffe08a'
  - '#2f5a3a'
  - '#6aa84f'
  - '#bfe3a0'
  - '#1f3f73'
  - '#3a6ea5'
  - '#4fb4ff'
  - '#8fd3ff'
  - '#dff4ff'
  - '#4b3a6b'
subjects:
  haun: >-
    Jin Haun, a lean young East Asian man; worn grey-brown hemp robe, white cloth strips wrapped
    around both hands, black hair tied back, a plain straight sword
  elia: >-
    Elia, a half-elf mage woman; long silver hair, pointed ears, slate-blue hooded robe with silver trim
  kyle: >-
    Kyle Rowen, a blond young knight; silver plate armor over a blue tabard, long straight sword
  born: >-
    Born, a short stocky dwarf warrior; braided brown beard, a big two-handed axe and a round iron shield
  shadow_wolf: >-
    a shadow wolf; charcoal-black fur, black flames along its spine, amber eyes, lean and hungry
```
