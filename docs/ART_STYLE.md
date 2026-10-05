# ART_STYLE — 화풍·팔레트·캐릭터 외형

> **확정 화풍: 두 갈래** (사용자 결정, 2026-10-05)
> - **전투 = 64px 픽셀 아트**: 캐릭터·적·이펙트·전투 배경 (2026-10-05 32px → 64px 변경: 모델이 자연스럽게 그리는 해상도와 맞추고 얼굴이 읽히게. 같은 날 게임 프레임만 80px로 넓힘: 도끼를 치켜드는 동작·칸을 꽉 채운 그림을 줄이지 않고 담으려고)
> - **이야기 = 선이 살아 있는 애니메이션 채색 일러스트**: 카드 일러스트·인물 초상화·스토리 장면(CG)·캐릭터 설정화
>
> 주인공 외형은 사용자가 준 참고 이미지의 분위기(긴 흑발, 날카로운 눈매, 어두운 긴 겹옷)를 따릅니다(4절). 참고 이미지는 인물 모델링 참고용일 뿐 화풍 기준이 아니며, 저장소에 넣지 않고 글로만 기록합니다.
> 지금 정한 하운 복장은 **초반(기본) 복장**입니다. 스테이지별 복장 분리는 게임이 어느 정도 완성된 뒤 추가합니다.
> 픽셀 쪽 세부(외곽선·명암·얼굴)는 첫 에셋 `haun_ref`로 시험합니다. 일러스트 캐릭터 설정화는 픽셀 작업 결과를 본 뒤 만들고, 필요하면 픽셀 쪽을 일부 고칩니다.

이 문서는 Claude가 관리합니다. Codex는 읽기만 합니다. 이미지 프롬프트와 자르기 도구의 팔레트는 맨 아래 `prompt-data` 블록에서
도구(`tools/render-prompt.mjs`, `tools/slice-sheet.mjs`)가 자동으로 가져갑니다. 스타일을 바꾸려면 그 블록을 고칩니다.

## 0. 두 갈래 한눈에

| 갈래 | 그림 | 형태 | 게임에서 |
|---|---|---|---|
| 전투(pixel) | character-anim, character-ref, fx, background | 확대된 픽셀 아트 시트(칸당 64 격자) → 블록 크기 자동 감지 → 80×80 프레임 | 전투 필드 |
| 이야기(illustration) | card-art, portrait, story-cg, character-sheet | 일러스트 한 장 → 출력 크기로만 축소 | 카드, 대화, 스토리 장면, 설정 기준 |

두 갈래를 잇는 규칙: **같은 색 코드(3절)**, **같은 캐릭터 외형(4절)**. 같은 인물이 두 그림에서 다른 사람처럼 보이면 안 됩니다.

## 1. 전투 — 픽셀 아트 원칙

- **그림 격자와 프레임:** 캐릭터·일반 적·이펙트는 칸당 **64×64 격자로 그리고 80×80 프레임**에 담습니다(둘레 여유 8px씩). 보스는 128 격자 → 160 프레임, 전투 배경 384×256.
- **게임에서는 정수배로만 확대**하고(기본 3배), 보간 없이(nearest neighbor) 표시합니다.
- **제작 방식:** 이미지 모델은 "확대된 픽셀 아트"(요청 블록 8×8)를 그립니다. 모델은 블록 크기를 정확히 지키지 못하므로, 자르기 도구가 **그림에서 실제 블록 크기와 격자 위치를 감지**해 블록마다 가장 많은 색을 고르고 마스터 팔레트로 맞춘 뒤 80×80 프레임에 담습니다(모델이 48px로 그렸다면 48px 그대로, 72px로 그렸다면 72px 그대로).
- **금지:** 안티에일리어싱, 흐림, 그라데이션, 반투명, 디더링 노이즈, 블록보다 작은 디테일.

## 2. 전투 — 스프라이트 표현

| 항목 | 기준 |
|---|---|
| 캐릭터 키 | 64 격자에서 약 48px(사람형), 보스는 128 격자에서 약 100px. 80 프레임에서도 같은 크기(줄이지 않음) |
| 발 위치 | 그릴 때 64 격자의 58번째 줄(위에서 1부터), 가로 가운데. 자르기 도구가 80 프레임의 72번째 줄에 맞춘다 |
| 외곽선 | 1px, 짙은 남색 `#1d2433`. 바깥쪽만, 안쪽 선은 최소화 |
| 명암 | 색마다 2~3단계(밝은 면·기본·그림자). 광원은 왼쪽 위 |
| 색 수 | 스프라이트 하나에 16색 이하(이펙트 12색 이하), 마스터 팔레트 안에서 |
| 얼굴 | 눈은 2~3px, 눈매·앞머리로 인상을 만든다 |
| 방향 | 아군은 오른쪽, 적은 왼쪽을 본다 |
| 이펙트 | 검정 배경에 빛나는 색만. 중심은 흰색, 바깥으로 갈수록 채도 높은 색, 테두리 1px 끊김으로 붓 느낌 |

**무협·판타지 구분**(같은 픽셀 문법 안에서 색으로)
- 무림: 회갈색·먹색·쪽빛, 금빛 내공 이펙트
- 엘하임: 은빛·청색·초록, 청은빛 마나 이펙트
- 마왕성·틈: 흑요석·검붉은색, 보랏빛 번개(초록 키 사용)

## 2-1. 이야기 — 애니메이션 채색 일러스트

손으로 그린 극장판 2D 애니메이션 같은 가볍고 따뜻한 그림. 선이 살아 있고 채색은 단순하게.

| 항목 | 기준 |
|---|---|
| 선 | 손으로 그린 듯한 깔끔한 선, 굵기에 약간의 강약. 윤곽선은 짙은 갈색·남색 계열(검정 일색 금지) |
| 인물 채색 | 셀 채색: 기본색 + 그림자 1단계 + 작은 하이라이트. 과한 광택·질감 없음 |
| 배경 | 수채화처럼 부드럽게 칠한 배경, 자연광, 하늘·숲·산의 디테일은 풍부하게 |
| 분위기 | 밝고 공기감 있는 색. 무림은 소나무·기와·안개, 엘하임은 은빛 숲과 두 개의 달 |
| 얼굴 | 큰 눈 과장 없이 자연스러운 비율, 표정이 읽히게 |
| 금지 | 사진 같은 질감, 두꺼운 유화 붓질, 3D 렌더 느낌, 글자·로고·서명 |

| 유형 | 캔버스 | 게임 출력 | 용도 |
|---|---|---|---|
| card-art | 1024×1536 | 512×768 | 카드 일러스트(주인공·초식·장면) |
| portrait | 1024×1024 | 512×512 | 대화·왕일검 지원 표시. 표정별로 따로 |
| story-cg | 1536×1024 | 1152×768 | 스토리 노드 장면(밀담, 재회, 결전 등) |
| character-sheet | 1536×1024 | 1536×1024 | 캐릭터 설정화(정면·3/4·측면 + 표정). 다른 그림의 참조용 |

이미지 생성 프롬프트에는 **특정 스튜디오·작가 이름을 쓰지 않고** 화풍의 특징(선, 채색, 배경, 빛)으로 설명합니다. 이름을 쓰면 생성기가 거부하거나 결과가 흔들릴 수 있습니다.

## 3. 색 코드(UI·이펙트·일러스트 공통)

| 의미 | 색 | 근거 |
|---|---|---|
| 내공 | 금빛·주황 `#f2a93b` | "따뜻하고 단단한, 작은 불씨 같은 것" |
| 마나 | 청은빛 `#8fd3ff` | 공기 속을 흐르는 빛 알갱이 |
| 운하검 | 푸른 검광 `#4fb4ff` | "푸른 검광이 협곡을 세로로 갈랐다" |
| 균열 | 검은 금 `#0b0b10` + 붉은 점멸 `#ff3b3b` | "그 안에서 이따금 붉은 빛이 깜빡였다" |
| 마기 | 검붉은 `#5a1020` | "무겁고 끈적한 것" |

크로마키 색(마젠타 `#FF00FF`, 초록 `#00FF00`)과 비슷한 색은 해당 키를 쓰는 캐릭터에 쓰지 않습니다. 마스터 팔레트에는 두 색이 없습니다.
일러스트는 마스터 팔레트에 묶이지 않지만, 인물의 옷·머리 색과 위 색 코드는 픽셀 쪽과 같은 색감으로 맞춥니다.

## 4. 캐릭터 외형(원작 근거)

| id | 이름 | 외형(64 격자에서 읽혀야 하는 특징) | 키 색 | 크기 |
|---|---|---|---|---|
| haun | 진하운 | 어깨 아래까지 내려오는 긴 흑발과 눈을 반쯤 가리는 앞머리, 창백한 피부, 날카롭고 차분한 눈매, 마른 잔근육 체형. 숯빛 긴 겉옷(넓은 소매, 발목까지)과 짙은 청회색 속옷, 가는 붉은 깃, 검은 띠, 검은 바지·장화. 무기는 소박한 벌목용 도끼(푸른 검광은 융합 이펙트) | magenta | small |
| elia | 엘리아 | 긴 은발, 뾰족한 귀, 청회색 로브, 손끝의 빛 | magenta | small |
| kyle | 카일 로웬 | 금발, 은빛 갑옷, 파란 겉옷, 긴 검 | magenta | small |
| born | 보른 | 작고 다부진 드워프(사람형 키의 약 70%), 갈색 땋은 수염, 큰 도끼, 둥근 방패 | magenta | small |
| wang | 왕일검 | 굽은 등, 지팡이, 흰 머리, 주방 노인 차림(초상화만) | none | portrait |
| kwak_dojin | 곽도진 | 백발 도인, 흰 학창의, 송문고검 | magenta | large |
| sa_mugyeol | 사무결 | 검은 삿갓, 창백한 얼굴, 붉은 눈, 핏빛 손톱. 2페이즈 붉은 거인 | green | large |
| shadow_wolf | 그림자늑대 | 숯빛 늑대, 등줄기의 검은 불꽃, 호박색 눈 | magenta | small |
| ignis | 화염군주 이그니스 | 용암과 불꽃의 거구 | magenta | large |
| vargas | 마왕 바르가스 | 찢어진 박쥐 날개, 일곱 뿔, 텅 빈 눈 | green | large |
| rift_beasts | 틈 괴물 | 머리 셋 달린 불비늘 개, 그림자 망령, 뼈 거인 | green | small/large |
| mordecai | 지옥왕 모르데카이 | 꿰매 붙인 몸, 가슴의 푸른 심장, 실밥이 모인 매듭 | green | large |

## 5. 프롬프트·팔레트 데이터

도구가 이 블록을 읽습니다. 영어로 씁니다. `palette`는 전투(픽셀) 마스터 팔레트(32색)로, 자르기 도구가 모든 픽셀을 이 중 가장 가까운 색으로 맞춥니다.
`illustration_style`은 이야기 갈래(card-art, portrait, story-cg, character-sheet) 프롬프트에 들어갑니다.

<!-- prompt-data -->
```yaml
sprite_style: >-
  crisp 64x64 pixel art in the style of a 16-bit era game sprite; 1-pixel dark navy (#1d2433) outline
  around the silhouette, 2-3 flat tone steps per color with light from the upper left, clear readable
  silhouette, no anti-aliasing, no gradients, no dithering noise, no blur
fx_style: >-
  crisp pixel-art visual effect of pure light on black; a white core pixel line, then 2-3 bands of
  increasingly saturated color outward, clean stepped edges, a few single-block sparks, no smoke,
  no gradients, no blur, no anti-aliasing
illustration_style: >-
  hand-drawn 2D animated feature film look; clean, lively hand-inked line art with gentle line weight
  variation and warm dark-brown outlines; simple cel shading with one shadow tone and small highlights;
  light, airy, natural colors; softly painted watercolor-like backgrounds with rich natural detail and
  warm daylight; gentle, nostalgic atmosphere; East Asian wuxia world blended with a European fantasy
  forest; not photorealistic, not 3D, no heavy oil-paint texture
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
    Jin Haun, a lean, wiry young East Asian woodcutter turned martial artist, with a cool, quiet presence; long
    straight black hair falling past the shoulders with long bangs partly covering sharp, calm dark
    eyes; pale skin; a long charcoal-black outer robe with wide sleeves reaching the ankles, worn open
    over a dark slate-blue inner robe, a thin dark-red inner collar, a black cloth sash, dark trousers
    and black boots; carries a plain woodcutting axe with a dark wooden handle and an iron head
  elia: >-
    Elia, a half-elf mage woman; long silver hair, pointed ears, slate-blue hooded robe with silver trim
  kyle: >-
    Kyle Rowen, a blond young knight; silver plate armor over a blue tabard, long straight sword
  born: >-
    Born, a short stocky dwarf warrior; braided brown beard, a big two-handed axe and a round iron shield
  shadow_wolf: >-
    a shadow wolf; charcoal-black fur, black flames along its spine, amber eyes, lean and hungry
```
