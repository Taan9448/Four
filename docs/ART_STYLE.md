# ART_STYLE — 화풍·팔레트·캐릭터 외형

> **확정 화풍: 두 갈래** (사용자 결정, 2026-10-05)
> - **전투 = 128 격자 픽셀 아트**: 캐릭터·적·이펙트 (2026-10-07 64 → 128 변경, 사용자 결정: 모델이 64 격자보다 세밀하게 그려 64로 줄이면 얼굴·무늬가 뭉개졌다. 같은 원본을 128로 자르면 원본에 가깝게 살아난다. 게임 프레임 160, 화면 크기는 그대로. 이전: 2026-10-05 32 → 64)
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
| 전투(pixel) | character-anim, character-ref, fx, background, icon-sheet, card-frame | 확대된 픽셀 아트 시트(칸당 128 격자) → 블록 크기 자동 감지 → 160×160 프레임(카드 틀은 128×192) | 전투 필드, 아이콘, 카드 틀 |
| 이야기(illustration) | card-art, portrait, story-cg, character-sheet, character-standing | 일러스트 한 장 → 출력 크기로만 축소(반신 그림은 배경을 지워 투명) | 카드, 대화, 스토리 장면, 설정 기준 |

두 갈래를 잇는 규칙: **같은 색 코드(3절)**, **같은 캐릭터 외형(4절)**. 같은 인물이 두 그림에서 다른 사람처럼 보이면 안 됩니다.

## 1. 전투 — 픽셀 아트 원칙

- **그림 격자와 프레임:** 캐릭터·적·보스·이펙트 모두 칸당 **128×128 격자로 그리고 160×160 프레임**에 담습니다(둘레 여유 16px씩). 전투 배경 384×256.
- **게임에서는 보간 없이(nearest neighbor) 표시**합니다. 160 프레임을 화면 240px 칸에 그리므로 1.5배(고해상도 화면에서는 장치 픽셀 3배).
- **제작 방식:** 이미지 모델은 "확대된 픽셀 아트"(요청 블록 4×4)를 그립니다. 모델은 블록 크기를 정확히 지키지 못하므로, 자르기 도구가 **그림에서 실제 블록 크기와 격자 위치를 감지**해 블록마다 가장 많은 색을 고르고 마스터 팔레트로 맞춘 뒤 160×160 프레임에 담습니다(모델이 더 굵게 그렸다면 그 해상도 그대로).
- **금지:** 안티에일리어싱, 흐림, 그라데이션, 반투명, 디더링 노이즈, 블록보다 작은 디테일.

## 2. 전투 — 스프라이트 표현

| 항목 | 기준 |
|---|---|
| 캐릭터 키 | 128 격자에서 약 96px(사람형, 칸 높이의 약 3/4). 보스는 명세의 `scale`로 화면에서 키운다. 160 프레임에서도 같은 크기(줄이지 않음) |
| 발 위치 | 그릴 때 128 격자의 115번째 줄(위에서 1부터), 가로 가운데. 자르기 도구가 160 프레임의 144번째 줄에 맞춘다 |
| 외곽선 | 1px, 짙은 남색 `#1d2433`. 바깥쪽만, 안쪽 선은 최소화 |
| 명암 | 색마다 2~3단계(밝은 면·기본·그림자). 광원은 왼쪽 위 |
| 색 수 | 스프라이트 하나에 16색 이하(이펙트 12색 이하), 마스터 팔레트 안에서 |
| 얼굴 | 눈은 3~5px, 눈매·앞머리·눈동자 색으로 인상을 만든다 |
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
| character-standing | 1536×1024(3칸) | 512×1024 ×3 | 비주얼 노벨 장면·영웅/전설 컷인용 반신 그림. 칸1 기본·칸2 결의·칸3 놀람, 같은 크기·위치, 마젠타 배경은 지워 투명 |

이미지 생성 프롬프트에는 **특정 스튜디오·작가 이름을 쓰지 않고** 화풍의 특징(선, 채색, 배경, 빛)으로 설명합니다. 이름을 쓰면 생성기가 거부하거나 결과가 흔들릴 수 있습니다.

## 2-2. 화면 그림(2026-10-08, GAME_DESIGN 13절)

| 그림 | 갈래 | 기준 |
|---|---|---|
| 전투 배경 `bg_*` | 픽셀(384×256) | 인물 없는 옆에서 본 무대. 발 딛는 줄은 높이 62%, 아래 30%는 손패에 가려지는 어두운 땅, 위 가운데는 균열 게이지 자리라 비운다. 큰 물체는 좌우 가장자리에만. 인물보다 조금 어둡고 먼 배경은 대비를 낮게 |
| 시작 화면 `title_world` | 일러스트 | 하늘의 틈을 사이에 두고 왼쪽 무림(새벽, 금빛·먹빛), 오른쪽 엘하임(밤, 두 달, 은빛·청색). 인물 없음, 가운데는 제목·메뉴 자리라 차분하게 |
| 여정 띠 `journey_band` | 일러스트 | 두 세계를 잇는 원작 여정의 파노라마. 가운데 귀곡애 석문이 유일한 통로. **틈은 그리지 않는다**(게임이 사건으로 그린다) |
| 지역 지도 `map_*` | 일러스트(먹 그림) | 한지 위의 먹 그림 가로 지도, 엷은 채색. 왼쪽 = 출발, 오른쪽 = 보스. 가운데 70%(위아래 가장자리를 뺀 띠)는 비워 노드·길을 게임이 그린다. 글자·범례·나침반 없음 |
| 아이콘 `icons_*` | 픽셀(64 격자) | 한 세트처럼 같은 크기·같은 문법. 배경 판 없이 굵은 기호 하나, 28px로 줄여도 읽혀야 한다 |

| 카드 틀 `card_frame_*` | 픽셀(128×192, 2026-10-11 사용자 결정) | 하스스톤형 빈 틀: 위쪽 그림 창(키 색 구멍), 왼쪽 위 비용 자리, 창 아래를 가로지르는 이름 띠, 등급 보석 자리, 아래 절반 밝은 글 칸, 맨 아래 종류 판. 틀 3종은 같은 자리(명세 `layout`)를 쓰고 재질만 다르다 — 무공 = 옻칠 나무·먹빛 가장자리·놋쇠 구름무늬·한지 두루마리 띠·붉은 낙관 / 마법 = 짙은 청색 가죽·은테 세공·마법진 고리·푸른 수정 / 융합 = 가운데 금빛 이음매로 왼쪽 무공·오른쪽 마법, 위에 해와 초승달 금장식. 글자·숫자는 그리지 않는다(게임이 쓴다) |
| 카드 보석 `card_gems` | 픽셀(32 격자) | 칸1 내공 비용(금빛 원판) · 칸2 마나 비용(육각 푸른 수정), 지름 약 28px에 가운데는 숫자 자리라 밋밋하게 · 칸3~7 등급 보석(일반 회백·고급 비취·희귀 청옥·영웅 자수정·전설 황옥, 약 14px) |

카드 틀은 Codex 그림이 들어오면 게임이 그것으로 바꾼다. 그 전에는 CSS 틀(무공 = 한지·먹 테두리·붉은 낙관 / 마법 = 짙은 청색 양피지·은테·마법진 / 융합 = 사선으로 만나는 한지와 청색·금테)을 쓴다. 버튼·창은 그림 없이 CSS로 그린다.
**카드 그림도 픽셀로**(2026-10-11 사용자 결정 "전체적으로 디자인 조화를 위해서 픽셀", "카드 제목과 어울리게, 잡다한 것보다 심플하게"): `card_art_*` 시트(4×4칸, 칸마다 96×64 격자). 카드 하나에 **주제 하나**를 크고 단순하게, 바탕은 2~3가지 차분한 색(지평선이나 두 띠). 소품·군중·잔무늬 없음, 글자 없음. 세계별 색: 하운·공용 = 한지·황토·솔잎·먹빛에 금빛 내공 / 엘리아 = 달빛 은·짙은 청·서리 흰색 / 카일 = 은·강철·청색에 붉은 검 / 보른 = 화강암·쇠·불씨 주황 / 틈의 카드 = 검은 허공과 붉게 깜박이는 검은 금. 아래 2-1절 card-art 규격(일러스트)은 쓰지 않는다.

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

2026-10-08 원작 전문(제1부 전 4권) 기준으로 고쳤다(`GAME_DESIGN.md` 15절). 원작에 적힌 것은 그대로, 원작에 없는 것(머리 길이 등)은 이 화풍에 맞춰 정하되 원작과 부딪치지 않게 한다.

| id | 이름 | 외형(128 격자에서 읽혀야 하는 특징) | 키 색 | 크기 |
|---|---|---|---|---|
| haun | 진하운(S0, 도끼) | 마른 17세 소년, 어깨 아래까지 내려오는 긴 흑발과 눈을 반쯤 가리는 앞머리, 검은 눈, 창백한 피부. **청운문 잡역의 회색 잡역복**(무릎까지 오는 여민 웃옷, 끈 띠, 회색 바지, 짚신 또는 헝겊신), 물집 잡힌 손에 감은 천. 벌목 도끼 | magenta | large |
| haun_sword | 진하운(S1~, 못생긴 검) | 같은 인물·같은 회색 잡역복(조금 해지고 옆구리를 꿰맨 자국). **장식 하나 없는 좁고 얇은 검**(투박한 손잡이, 흠 없는 칼날)과 허리의 검은 검집. 푸른 검광은 이펙트로만 | magenta | large |
| elia | 엘리아 | 하프엘프 19세, 은발(뒤로 묶음), 끝이 살짝 솟은 귀, 회색 눈에 옅은 초록. **회색 망토와 두건**(귀를 가리는 버릇), 안에 갈색 여행복, **끝에 푸른 돌이 박힌 긴 나무 지팡이** | magenta | large |
| kyle | 카일 로웬 | 금발, 장난기 있는 얼굴, 호리호리. 온몸 은빛 판금, 어깨·무릎의 둥근 쇠판, 가슴의 로웬 문장(푸른 바탕·흰 눈송이·은빛 검), 긴 양날 검 | magenta | large |
| kyle_red | 카일 로웬(붉은 검, 2026-10-12 기본 전투 그림) | 같은 인물·같은 갑옷. **칼날이 짙은 진홍이고 날 끝이 식어 가는 숯불처럼 은은히 빛나는 긴 양날 검**(이그니스의 심장으로 벼림), 검은 쇠 코등이. 은빛 검(`kyle`)은 옷장 '은빛 기사검'으로 남는다 | magenta | large |
| born | 보른(S1~S3, 도끼) | 작고 다부진 드워프(사람 키의 약 70%), 문짝 같은 어깨, 굵은 팔뚝, **얼굴 절반을 덮은 붉은 수염을 세 갈래로 땋음**, 자기 키만 한 양손 도끼. **방패 없음** | magenta | large |
| born_hammer | 보른(S4~, 두린의 망치) | 같은 인물(붉은 수염은 그을려 끝이 조금 짧다). 드워프 문자가 새겨진 손잡이의 큰 전투 망치 | magenta | large |
| skin_cheongun_haun | 진하운 옷장 「청운의 귀환」(노말 클리어) | 같은 인물·같은 키와 비율(`haun_sword_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheongun_haun` | magenta | large |
| skin_cheongun_elia | 엘리아 옷장 「청운의 귀환」(노말 클리어) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheongun_elia` | magenta | large |
| skin_cheongun_kyle | 카일 옷장 「청운의 귀환」(노말 클리어) | 같은 인물·같은 키와 비율(`kyle_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheongun_kyle` | magenta | large |
| skin_cheongun_born | 보른 옷장 「청운의 귀환」(노말 클리어) | 같은 인물·같은 키와 비율(`born_hammer_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheongun_born` | magenta | large |
| skin_cheonma_haun | 진하운 옷장 「천마를 넘어」(어려움 클리어) | 같은 인물·같은 키와 비율(`haun_sword_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheonma_haun` | green | large |
| skin_cheonma_elia | 엘리아 옷장 「천마를 넘어」(어려움 클리어) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheonma_elia` | green | large |
| skin_cheonma_kyle | 카일 옷장 「천마를 넘어」(어려움 클리어) | 같은 인물·같은 키와 비율(`kyle_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheonma_kyle` | green | large |
| skin_cheonma_born | 보른 옷장 「천마를 넘어」(어려움 클리어) | 같은 인물·같은 키와 비율(`born_hammer_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_cheonma_born` | green | large |
| skin_bulmyeol_haun | 진하운 옷장 「불멸」(하드코어 클리어) | 같은 인물·같은 키와 비율(`haun_sword_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_bulmyeol_haun` | magenta | large |
| skin_bulmyeol_elia | 엘리아 옷장 「불멸」(하드코어 클리어) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_bulmyeol_elia` | magenta | large |
| skin_bulmyeol_kyle | 카일 옷장 「불멸」(하드코어 클리어) | 같은 인물·같은 키와 비율(`kyle_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_bulmyeol_kyle` | magenta | large |
| skin_bulmyeol_born | 보른 옷장 「불멸」(하드코어 클리어) | 같은 인물·같은 키와 비율(`born_hammer_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_bulmyeol_born` | magenta | large |
| skin_simyeon_haun | 진하운 옷장 「심연을 걷는 자」(심연 5굽이 클리어) | 같은 인물·같은 키와 비율(`haun_sword_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_simyeon_haun` | green | large |
| skin_simyeon_elia | 엘리아 옷장 「심연을 걷는 자」(심연 5굽이 클리어) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_simyeon_elia` | green | large |
| skin_simyeon_kyle | 카일 옷장 「심연을 걷는 자」(심연 5굽이 클리어) | 같은 인물·같은 키와 비율(`kyle_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_simyeon_kyle` | green | large |
| skin_simyeon_born | 보른 옷장 「심연을 걷는 자」(심연 5굽이 클리어) | 같은 인물·같은 키와 비율(`born_hammer_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_simyeon_born` | green | large |
| skin_sullye_haun | 진하운 옷장 「순례의 끝」(순례 S9 클리어) | 같은 인물·같은 키와 비율(`haun_sword_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_sullye_haun` | magenta | large |
| skin_sullye_elia | 엘리아 옷장 「순례의 끝」(순례 S9 클리어) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_sullye_elia` | magenta | large |
| skin_sullye_kyle | 카일 옷장 「순례의 끝」(순례 S9 클리어) | 같은 인물·같은 키와 비율(`kyle_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_sullye_kyle` | magenta | large |
| skin_sullye_born | 보른 옷장 「순례의 끝」(순례 S9 클리어) | 같은 인물·같은 키와 비율(`born_hammer_ref` 기준), 옷과 무기만 바꾼다 — 5절 `subjects.skin_sullye_born` | magenta | large |
| skin_moon_dancer_elia | 엘리아 옷장 「달빛 무희」(처음부터, 캠페인에서도, 반신 그림 포함 — 2026-11-01 사용자 요청) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷만 바꾼다. 남색 비단 홀터 상의·드러난 등과 허리·옆트임 긴 치마폭·은빛 초승달 장신구, 맨발 — 5절 `subjects.skin_moon_dancer_elia` | magenta | large |
| skin_summer_lake_elia | 엘리아 옷장 「여름 호숫가」(처음부터, 캠페인에서도, 반신 그림 포함 — 2026-11-01 사용자 요청) | 같은 인물·같은 키와 비율(`elia_ref` 기준), 옷만 바꾼다. 잎사귀 장식 흰 비키니·어깨로 흘러내린 연초록 리넨 덧옷·귀 뒤 흰 꽃·샌들, 화관 감은 지팡이 — 5절 `subjects.skin_summer_lake_elia` | magenta | large |
| maeseol | 매설 — 진하운 옷장 「화산의 매설」(수련 Lv.20, 캠페인에서도, 반신 그림은 `maeseol_stand` 그대로 — 2026-11-01 사용자 요청) | 반신 그림(`maeseol_stand`)과 같은 인물·같은 옷을 전신으로: 턱선 단발·붉은 머리띠·왼뺨 대각 흉터, 흰 홀터·매화 자수·낮은 허리띠·옆트임 붉은 치마폭, 붉은 장화, 매화 술 직검 — 5절 `subjects.maeseol` | magenta | large |
| wang | 왕일검(S6~) | 낫처럼 굽은 등, 흐릿한 눈 속의 날카로운 빛, 숱 적은 흰 머리. **다리가 없어 바퀴 달린 나무 의자에 앉고 무릎에 담요**(초상화만) | none | portrait |
| wang_cook | 왕 노인(S0) | 같은 인물이 두 다리가 있을 때: 낫처럼 굽은 등, 오른 다리를 절며 지팡이, 낡은 회갈색 주방 옷과 앞치마(초상화만) | none | portrait |
| kwak_dojin | 곽도진 | 마른 몸, 단정히 빗어 넘긴 흰머리, 이마 주름, 서른 살처럼 맑고 차가운 눈, 흰 학창의, 소나무 결 무늬 송문고검 | magenta | large |
| sa_mugyeol | 사무결(S8) | **삿갓 없이** 피로 산 젊은 얼굴, 피를 머금은 붉은 눈, 붉은 비단을 댄 검은 장포, 길고 창백한 손가락의 핏빛 손톱 | green | large |
| satgat_man | 삿갓의 사내(S0) | 깊이 눌러쓴 검은 삿갓(눈이 보이지 않음), 창백한 턱선, 먼지 하나 없는 검은 장포, 핏빛 손톱(초상화만) | none | portrait |
| sa_mugyeol_giant | 붉은 거인 사무결 | 사무결의 2페이즈. 온몸이 피로 된 거구, 가슴 안에서 뛰는 핏빛 심장, 갈라진 붉은 피부, 긴 붉은 손톱, 피어오르는 피안개 | green | large |
| branch_lord | 혈수마군 | 섬서 분타주이자 교주의 오른팔. 큰 키, 넓은 어깨, **두 손이 팔꿈치까지 핏빛**, 검은 단을 댄 짙은 진홍 교복 | green | large |
| shadow_wolf | 그림자늑대 | 송아지만 한 늑대 모양, **털 대신 일렁이는 검은 연기**, 등줄기의 검은 불꽃, **눈 대신 붉은 점 둘** | magenta | large |
| ignis | 화염군주 이그니스 | 사람 세 배 키의 사람 형상의 불: **흰 불길의 몸에 검은 용암이 핏줄처럼** 흐름, 불꽃 왕관, **얼굴 없이** 가장 뜨거운 흰 불 구멍 두 개가 눈 | magenta | large |
| vargas | 마왕 바르가스 | 사람 세 배 키, 찢어진 박쥐 날개, 왕관처럼 솟은 비틀린 뿔 일곱, 바닥이 보이지 않는 텅 빈 우물 같은 눈(빛나지 않음) | magenta | large |
| rift_beasts | 틈 괴물 | 머리 셋 달린 불비늘 개, 쐐기를 깎은 검은 단검의 그림자 망령, 뼈 거인 | green | large |
| mordecai | 지옥왕 모르데카이 | **검은 쐐기 수백 개를 엮은 등뼈**, 꿰매 붙인 흐름의 몸, 은빛 마나의 팔·감긴 고리 같은 내공의 팔, 이름 모를 세계의 다리·날개·뿔, **푸른빛과 검은빛이 엉킨 심장**, 실밥이 모인 매듭 | green | large |
| (장면 인물) | 석두·조명각·마 씨·실리엔·한스·토마·리나·베일락·셀리아스·고르몬·그림자 암살자 | 5절 `subjects`(반신 그림 명세 `<id>_stand`) | none | portrait |
| (적 보스·엘리트, 2026-10-09) | 베일락·셀리아스·고르몬·조명각·찢긴 경계·광석거미·사슬 감독관·얼음 궁전의 문지기·에드릭 로웬·용암 핏줄 골렘·그림자 암살자·쐐기 박힌 흑요석 문·흑풍대주·독수마군·계단의 장로·뼈 거인 | 5절 `subjects`(전투 명세 `<id>_ref`·`_idle`·`_attack`·`_hit`, 문·경계 같은 물체는 공격 없이 `_idle`·`_hit`). 부서지는 셀리아스·다시 일어선 뼈 거인은 같은 그림에 색 필터 | 보라·붉은 몸은 green, 나머지 magenta | large |
| (일반 적·틈의 짐승, 2026-10-09 2차) | 틈의 짐승·참나무 둥치·옹이 박힌 둥치·철목인·고블린·늪지 독두꺼비·빈 갑옷·불의 정령·얼음 늑대·얼음 기사·왕녀의 얼음·바위 골렘·벽에서 솟은 손·검은 수정·그림자·쐐기·혈위대·흑풍대·마맛자국 부대주·혈교도·마교 호법·분타 정예·계단의 궁수·불비늘 삼두견 | 5절 `subjects`(전투 스프라이트 `<id>_ref/idle/attack/hit`, 물건은 공격 없음). 로웬가의 얼음 기사는 에드릭 로웬, 꺼져 가는 그림자·그림자 망령은 그림자 암살자, 재 묻은 빈 갑옷은 빈 갑옷 그림을 같이 쓴다 | 명세 | large |

## 5. 프롬프트·팔레트 데이터

도구가 이 블록을 읽습니다. 영어로 씁니다. `palette`는 전투(픽셀) 마스터 팔레트(35색 — 2026-10-12 사용자 결정으로 밝은 보라 3단계 `#6b4fa3`·`#a35cff`·`#d4b8ff` 추가: 저주·틈 이펙트의 보라가 은회색으로 바뀌던 문제)로, 자르기 도구가 모든 픽셀을 이 중 가장 가까운 색으로 맞춥니다.
`illustration_style`은 이야기 갈래(card-art, portrait, story-cg, character-sheet, character-standing) 프롬프트에 들어갑니다.

<!-- prompt-data -->
```yaml
sprite_style: >-
  crisp detailed 128x128 pixel art in the style of a late 16-bit era game sprite; 1-pixel dark navy (#1d2433) outline
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
  - '#6b4fa3'
  - '#a35cff'
  - '#d4b8ff'
subjects:
  haun: >-
    Jin Haun, a lean, wiry seventeen-year-old East Asian woodcutter, a lowly servant of the Cheongun sect, with a
    cool, quiet presence; long straight black hair falling past the shoulders with long bangs partly covering
    sharp, calm black eyes; pale skin; a plain grey servant's outfit of the sect — a knee-length grey jacket
    wrapped and tied with a cord sash, grey trousers, cloth shoes; strips of cloth wrapped around blistered
    hands; carries a plain woodcutting axe with a dark wooden handle and an iron head
  haun_sword: >-
    Jin Haun, a lean, wiry young East Asian swordsman who used to be a woodcutter; long straight black hair
    falling past the shoulders with long bangs partly covering sharp, calm black eyes; pale skin; the same
    plain grey servant's outfit, a little worn and mended at the side — a knee-length grey jacket tied with a
    cord sash, grey trousers, cloth shoes; a narrow, thin, completely unadorned straight sword with a plain
    crude grip ("the ugly sword"), and a plain black scabbard at the hip
  elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips,
    grey eyes with a faint green tint; a grey travelling cloak with a hood (she tends to pull it over her ears)
    over a simple brown travelling dress; a long wooden staff topped with a blue stone
  kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; full silver plate armor with round steel
    pauldrons and knee guards, the Rowen crest on the chest (a white snowflake over a silver sword on a blue
    field), a long straight double-edged sword
  kyle_red: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; full silver plate armor with round steel
    pauldrons and knee guards, the Rowen crest on the chest (a white snowflake over a silver sword on a blue
    field); a long straight double-edged sword whose blade is deep crimson, glowing faintly like cooling
    embers along the edge (forged from the fire lord's heart), with a dark steel crossguard
  born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; a two-handed axe as
    tall as himself; no shield
  born_hammer: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a slightly singed red beard braided into three braids; a heavy two-handed war hammer
    whose handle is carved with dwarven runes (his late brother Durin's hammer); no shield
  skin_cheongun_haun: >-
    Jin Haun, a lean, wiry young East Asian swordsman; long straight black hair falling past the shoulders with
    long bangs partly covering sharp, calm black eyes; pale skin; wearing the formal robes of a Cheongun sect
    disciple: a white long robe with sky-blue lapels and silver cloud embroidery at the hems and sleeves, a blue
    sash with a small jade pendant, a white ribbon tying his long hair high; holding a narrow straight sword with
    a silver guard, a white scabbard with silver fittings at the hip
  skin_cheongun_elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips, grey
    eyes with a faint green tint; wearing a white mage robe with sky-blue trims and silver leaf embroidery, a
    short light-blue hooded cape, a thin silver circlet; holding a long pale wooden staff whose blue stone is set
    in a silver crescent frame
  skin_cheongun_kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; wearing polished silver plate armor with blue
    enamel trims and a white fur collar, a long blue cape bearing the Rowen crest (a white snowflake over a silver
    sword); holding a long straight double-edged sword with a sapphire pommel
  skin_cheongun_born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; no shield; wearing
    dwarven ceremonial armor of blue-grey steel with silver knotwork, his three beard braids clasped with silver
    rings; holding a heavy two-handed war hammer whose head is inlaid with blue runes
  skin_cheonma_haun: >-
    Jin Haun, a lean, wiry young East Asian swordsman; long straight black hair falling past the shoulders with
    long bangs partly covering sharp, calm black eyes; pale skin; wearing a black martial robe with a crimson
    inner lining and gold-thread dragon motifs at the collar, a long crimson sash trailing behind, black leather
    bracers with gold studs, his hair tied high with a crimson cord; holding a narrow straight sword whose edge
    has a faint red sheen
  skin_cheonma_elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips, grey
    eyes with a faint green tint; wearing a deep crimson sorceress robe with a black vest and gold trims, a black
    hood lined with crimson; holding a long black wooden staff topped with a red crystal held in gold claws
  skin_cheonma_kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; wearing blackened steel plate armor with gold
    filigree edges, a crimson cape and a crimson plume at one shoulder; holding a long straight double-edged sword
    with a gold crossguard
  skin_cheonma_born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; no shield; wearing black
    iron dwarven armor with gold-banded pauldrons and a crimson tabard, his beard braids bound with gold rings;
    holding a heavy two-handed war hammer of black iron with gold runes
  skin_bulmyeol_haun: >-
    Jin Haun, a lean, wiry young East Asian swordsman; long straight black hair falling past the shoulders with
    long bangs partly covering sharp, calm black eyes; pale skin; wearing gleaming black-and-gold lamellar armor
    over a white robe, a golden phoenix motif across the chest, a long white-and-gold scarf flowing behind, a
    golden hairpin in his tied hair; holding a narrow straight sword with a radiant gold blade
  skin_bulmyeol_elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips, grey
    eyes with a faint green tint; wearing a white-and-gold high mage gown with flowing translucent gold-white
    sleeves and a golden circlet; holding a long white wooden staff topped with a radiant gold star crystal
  skin_bulmyeol_kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; wearing golden-white plate armor with a sunburst
    crest on the chest, a white cape lined with gold, a gold circlet instead of a helmet; holding a gleaming gold-
    edged long sword
  skin_bulmyeol_born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; no shield; wearing golden
    dwarven warplate engraved with glowing runes, gold-braided beard braids with jewel clasps; holding a heavy
    two-handed war hammer with a golden head and glowing runes
  skin_simyeon_haun: >-
    Jin Haun, a lean, wiry young East Asian swordsman; long straight black hair falling past the shoulders with
    long bangs partly covering sharp, calm black eyes; pale skin; wearing a dark violet-black long coat with
    silver crack-shaped embroidery that glows faintly violet, a tattered black cloak, his long hair loose; holding
    a narrow straight sword with a black blade and a violet glowing edge
  skin_simyeon_elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips, grey
    eyes with a faint green tint; wearing a deep indigo-black robe with silver star-and-crack patterns, a hood
    with a violet glowing lining; holding a long staff of twisted black wood with a violet crystal floating inside
    a ring at the top
  skin_simyeon_kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; wearing dark gunmetal plate armor whose seams glow
    violet like cracks, a tattered black cape; holding a black long sword with a violet glowing fuller
  skin_simyeon_born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; no shield; wearing dark
    gunmetal dwarven plate with violet glowing rune-cracks, beard braids with black iron rings; holding a heavy
    two-handed war hammer of black stone with violet crack-light
  skin_sullye_haun: >-
    Jin Haun, a lean, wiry young East Asian swordsman; long straight black hair falling past the shoulders with
    long bangs partly covering sharp, calm black eyes; pale skin; wearing a cream-white traveller's robe with
    ochre trims, a wide bamboo hat hanging on his back by a cord, a small travelling satchel and wooden prayer
    beads around the wrist; holding a narrow straight sword whose hilt is wrapped in white cloth
  skin_sullye_elia: >-
    Elia, a nineteen-year-old half-elf mage woman; silver hair tied back, ears slightly pointed at the tips, grey
    eyes with a faint green tint; wearing a cream-white pilgrim cloak with gold-embroidered leaves and tiny silver
    bells along the hem, a satchel of scrolls; holding a long wooden staff tied with a white ribbon and a small
    bell under the blue stone
  skin_sullye_kyle: >-
    Kyle Rowen, a blond, slim young knight with a playful grin; wearing light silver half-plate over a cream
    tunic, a sandy-ochre travelling cloak and a scallop-shell pilgrim badge on the chest; holding a long straight
    double-edged sword
  skin_sullye_born: >-
    Born, a short, very stocky dwarf warrior about seventy percent of a man's height; shoulders as broad as a
    door, thick forearms; a red beard covering half his face, braided into three braids; no shield; wearing a
    sturdy sand-coloured travelling coat over chainmail, an ochre hood, wooden beads woven into his beard braids;
    holding a heavy two-handed war hammer with a leather-wrapped haft
  skin_moon_dancer_elia: >-
    Elia, a nineteen-year-old half-elf mage, unmistakably an adult young woman with a slender, softly curvy
    figure; long silver hair worn loose this time with a few thin braids and a silver crescent hairpin, ears
    slightly pointed at the tips, grey eyes with a faint green tint; wearing a revealing elven moon-dancer
    outfit for the Silver Forest moon festival: an opaque deep midnight-blue silk halter top with a deep V
    neckline held by a silver crescent clasp, bare shoulders, bare back and bare arms; a bare slim midriff and
    navel; a low-slung silver chain belt with small crescent pendants over a long midnight-blue silk skirt made
    of a front panel and a back panel with side slits open up to the hip, so her bare legs show as she moves;
    thin silver armlets, wrist bangles and anklets, barefoot; a long airy pale-blue silk ribbon draped over both
    elbows; holding a slender pale wooden staff whose blue stone sits in a silver crescent. Glamorous, alluring
    fantasy-game heroine style with an adult figure; all fabric is opaque, her nipples and groin always stay
    covered; ordinary graceful poses
  skin_summer_lake_elia: >-
    Elia, a nineteen-year-old half-elf mage, unmistakably an adult young woman with a slender, softly curvy
    figure; silver hair tied up in a loose high ponytail with a white flower tucked behind one slightly pointed
    ear, grey eyes with a faint green tint, a cheerful summer smile; wearing a summer lakeside swimsuit outfit:
    an opaque white two-piece bikini trimmed with small green leaf shapes — a halter bikini top that fully
    covers the bust and classic bikini bottoms with an opaque front and small side ties — under a thin, open,
    pale-green linen cover-up shirt that slips off both shoulders with the sleeves rolled up; bare midriff,
    bare legs, simple woven sandals; holding her long wooden staff with the blue stone, a small wreath of white
    flowers wound around the top of the staff. Bright, playful fantasy-game summer-event heroine style with an
    adult figure; all fabric is opaque, her nipples and groin always stay covered; ordinary cheerful poses
  wang: >-
    Wang Ilgeom, the old former first disciple of the Cheongun sect who hid for forty years as a kitchen elder;
    back bent like a sickle, thin white hair tied back, deep wrinkles, hazy eyes hiding a sharp glint, a worn
    grey-brown robe; he has lost both legs and sits in a plain wooden chair with cart wheels, a blanket lying
    flat over his lap below the knees
  wang_cook: >-
    Old Wang, the stooped kitchen elder of the Cheongun sect; back bent like a sickle, thin white hair tied
    back, deep wrinkles, gentle hazy eyes hiding a sharp glint, a worn grey-brown cook's robe with rolled
    sleeves and an apron, limping on the right leg with a simple wooden walking stick
  kwak_dojin: >-
    Kwak Dojin, the Taoist head of the Cheongun sect; a thin man with neatly combed-back white hair, lines on
    the forehead, eyes as clear and cold as a thirty-year-old's, a flowing white crane-pattern Taoist robe
    (hakchangui), an elegant straight sword whose blade bears a pine-grain pattern
  sa_mugyeol: >-
    Sa Mugyeol, the Heavenly Demon Cult leader who bought youth with blood for sixty years; no hat, an
    unnaturally young, handsome pale face, blood-red eyes, a thin cruel smile, black layered robes lined with red
    silk, long pale fingers with blood-red fingernails
  satgat_man: >-
    a mysterious man in a deep black bamboo hat (satgat) pulled low so his eyes cannot be seen, only a pale jaw
    and a thin cruel smile visible, a spotless black long robe, long pale fingers with dark blood-red nails
  mordecai: >-
    Mordecai, the King of Hell who rules the rift between worlds; a towering shapeless body stitched together
    from countless stolen flows, with a great spine made of hundreds of black iron wedges bound together, one
    arm of flowing pale silver mana and one of coiled dark martial qi like rings, legs, wings and horns of
    unknown worlds sewn on with glowing seams, a heart of tangled blue and black light pulsing in the chest
  vargas: >-
    Vargas, the Demon King of Nocturna; a towering gaunt figure three times a man's height, seven twisted
    black horns rising like a crown, torn leathery bat wings, eyes like bottomless empty wells (no glow), a
    tattered black royal mantle over dark obsidian armor, long clawed fingers
  sa_mugyeol_giant: >-
    the Red Giant, Sa Mugyeol transformed by the Heavenly Demon blood art; a hulking giant whose whole body is
    made of blood, cracked crimson skin glowing from within, a blood-red heart beating visibly inside the
    chest, long blood-red claws, blood mist steaming from the shoulders
  ignis: >-
    Ignis, the Flame Lord, one of the Demon King's Four Heavenly Kings; a humanoid made of fire three times a
    man's height, a body of white flame with black lava running through it like veins, a crown of flames, no
    face — only two holes of the hottest white fire for eyes
  branch_lord: >-
    Hyeolsu Magun ("Blood-Hand Demon Lord"), the Shaanxi branch lord and right hand of the Heavenly Demon Cult
    leader; a very tall man with broad shoulders, both hands and forearms blood-red up to the elbows, a dark
    crimson cult robe with black trim, a cold proud face
  shadow_wolf: >-
    a shadow wolf the size of a calf; instead of fur, a body of wavering black smoke, black flames along its
    spine, no eyes — only two red dots where the eyes should be
  seokdu: >-
    Seokdu, a fifteen-year-old giant of a boy, a head taller than Jin Haun, shoulders as broad as a door, round
    eyes, one front tooth missing, an honest face; a white disciple robe with sleeves too short for him
  jo_myeonggak: >-
    Jo Myeonggak, a disciple of the Cheongun sect around twenty; a narrow face, sharply upturned eye corners,
    pale with dark shadows under the eyes, a white disciple robe with a red tassel of a direct disciple
  ma: >-
    Ma, the innkeeper of Ungok village; a pot-bellied bald man with a double chin and old burn scars, a plain
    innkeeper's apron over a brown robe
  silien: >-
    Silien, an elf woman of Silvaren and Elia's mother; silver hair reaching the ground, thin and frail, grey
    eyes with a deep green tint, a simple pale green elven dress
  hans: >-
    Hans, a human blacksmith around forty from the chained village of Belkan; broad shoulders, thick forearms,
    a beard thinned by fire burns, a heavy leather apron, soot on the face
  toma: >-
    Toma, a ten-year-old boy of Belkan, the blacksmith's son; red volcanic ash smudged on his face, bright
    stubborn eyes, a too-big patched shirt
  lina: >-
    Princess Lina of Arden; golden hair braided and pinned up, sky-blue eyes, a sky-blue gown, later silver
    armor; a calm, strong smile
  mara: >-
    Mara, a leader of the Belkan refugees in her forties; sun-darkened skin, hair tied back with a rag, red ash
    on a patched brown dress, a list of names and a small cloth sack at her belt, sharp counting eyes
  garret: >-
    Sir Garret, an old knight of Arden in his sixties who leads a refugee village; one ear missing, a short white
    beard, a dented steel cuirass over a fur-lined coat, two empty fingers on one leather glove
  herda: >-
    Herda, a female DWARF mine engineer of Kazdum in her fifties, clearly a dwarf and not a human: short (about
    four feet) and very broad and stocky, thick strong arms and big work-worn hands, a wide square face with a
    broad nose, ruddy weathered cheeks and fine wrinkles; thick brown hair with grey streaks in two heavy braids,
    a leather work apron full of measuring tools, a coil of rope over one shoulder, steady practical eyes
  yeojin: >-
    Yeojin, a village woman of Ungok in her thirties who passes messages through laundry; hair in a plain bun
    with a wooden pin, a faded blue jeogori-like jacket, sleeves rolled up, a folded cloth with stitched names
  yeonbun: >-
    Yeonbun, an old village woman of Ungok in her seventies; deeply wrinkled kind face, white hair in a small bun,
    a worn grey-brown cotton jacket, a hoe in her hand, dirt on her fingers
  doyeon: >-
    Doyeon, a young Daoist priest of Wudang in his twenties; a plain grey Daoist robe soaked at the hem, hair in a
    topknot with a wooden pin, a messenger's satchel, a serious guarded face
  maeseol: >-
    Maeseol, a twenty-two-year-old swordswoman of the Hwasan (Mount Hua) sect, unmistakably a grown woman with a
    mature face and a voluptuous adult figure (full bust, narrow waist, wide hips, long legs), who must look
    nothing like Jin Haun: SHORT dark-brown hair cut bluntly at the jaw with a straight fringe, a red cloth
    headband with long trailing ends; a sharp angular face with fierce upturned eyes, red lips, sun-tanned skin, a
    few freckles; one LONG pale diagonal scar from above her left eyebrow across the cheek down to the jaw, clearly
    visible. A very revealing, glamorous martial outfit: a white wrap-front halter top with a deep plunging
    neckline showing ample cleavage, cut short under the bust to bare the whole toned midriff and navel, bare
    shoulders, back and arms, dark-red plum-blossom embroidery along the edges; a wide dark-red sash belt slung low
    on the hips; a short dark-red skirt-panel front and back with side slits open up to the hip, showing her bare
    thighs; tall dark-red wrapped boots to above the knee; black fingerless gloves, leather bracers, a thin gold
    anklet-like chain at the hip; a slim straight jian with a small plum-blossom tassel. Bold bikini-armor-level
    fan-service in the style of fantasy game heroines; her nipples and groin always stay covered by the outfit
  veilak: >-
    Veilak, the Shadow Legion commander; a knight and horse made of black smoke, twice a man's height, a
    greatsword of smoke, two red lights burning inside the empty helmet
  celias: >-
    Celias, the Ice Queen, one of the Four Heavenly Kings; a woman made of gathered snowflakes, twice a man's
    height, a translucent body of ice, hair of icicles, a calm sculpted expressionless face
  gormon: >-
    Gormon, the Earth Giant, one of the Four Heavenly Kings; a giant of rock fused with the mountain itself,
    a single finger as large as a man's torso, eyes red like lava, cracks and roots of stone spreading from
    the body into the cave walls
  shadow_assassin: >-
    the Shadow Assassin, the last of the Four Heavenly Kings; a faceless, thin and elongated figure of shadow,
    only the black dagger in its hand is solid, its blade engraved with wave-like ancient letters
  torn_border: >-
    the Torn Border, a wound in the edge between worlds; a tall jagged vertical tear in the air with ragged
    stitched edges, inside it a swirling vortex of stolen flows (pale silver mana threads and dark coiled
    qi), torn threads hanging from the rim; no face, no body
  ore_spider: >-
    the Ore Spider, a giant spider as large as a cart that grew by eating silver in an old mine; a body
    covered in a hard silver ore shell with rough crystal ridges, eight long jointed legs, a cluster of
    small dark violet eyes, white silk strands trailing from the abdomen
  chain_overseer: >-
    the Chain Overseer, an empty suit of black armor a head taller than the others, red ash packed in the
    joints, two red lights inside the helmet, both hands gripping a heavy iron chain whose links glow orange
    like hot iron
  ice_gatekeeper: >-
    the Gatekeeper of the Ice Palace, a knight who fell guarding the city gate ten years ago, now frozen
    solid; armor and body all turned to translucent ice, a large tower shield bearing the crest of Arden
    with frost flowers blooming on it, a long ice spear
  edric_rowen: >-
    Edric Rowen, a knight of Arden and Kyle's father, frozen into an ice knight; a broad-shouldered man in
    plate armor all turned to translucent ice, eyes replaced by the light of frozen blue mana, a round
    shield bearing the Rowen crest (a white snowflake and a silver sword on blue), a long double-edged sword
    of ice
  vein_golem: >-
    the Lava-Vein Golem, a hulking golem of dark rock whose lava veins run down into the roots of the
    mountain; glowing orange-red lava veins across the whole body pulse like a heartbeat, a heavy blocky
    head with no face but a burning crack
  obsidian_door: >-
    the Obsidian Door, a huge sealed door of black obsidian at the end of the seventh corridor of Nocturna;
    wave-like ancient letters carved on its surface, seven black iron wedges driven into the door frame, the
    air around the wedges warped like heat haze
  black_wind_captain: >-
    the Black Wind Captain of the Heavenly Demon Cult's Shaanxi branch; a lean hard man in black martial
    robes and a black hood pushed back, three sword scars across the face, a curved saber in one hand, the
    other palm wrapped in black wind
  poison_hand: >-
    Poison-Hand Demon Lord, an elder of the Heavenly Demon Cult's Shaanxi branch; a gaunt middle-aged man in
    a dark green cult robe, long fingernails painted dark blue-green with poison, dark green veins running
    up from the wrists
  stair_elder: >-
    an Elder of the Nine Heaven Stairs of the Heavenly Demon Cult; an old man with a long grey beard and a
    stern face, a deep crimson elder's robe with black trim and a blood-drop crest on the chest, both palms
    glowing blood-red with demon qi
  bone_giant: >-
    the Bone Giant of the rift, a hunched giant built of huge pale bones fitted together, a ribcage like a
    cage, dark crimson qi flowing in the gaps between the bones like veins, a skull with dim red light in
    the sockets
  rift_beast: >-
    the Rift Beast, a hound-like predator crawling down from the deeper rifts; a long low body of dark
    violet hide split by glowing cracks like torn sky, a jaw full of black wedge-shaped teeth, shards of
    black rift crystal embedded along the spine, six thin clawed legs, no eyes, only a faint violet glow
    inside the cracks
  oak_stump: >-
    a thick old oak stump from the woodpile of the Cheongun sect, waist high, rough dark bark, a flat cut
    top showing pale wood rings and fine visible grain lines, a few small roots at the base; an inanimate
    object, no face
  knotted_stump: >-
    a gnarled tree stump covered in twisted knots, the grain bending again and again around three large dark
    knots, an old axe head stuck deep in its side; an inanimate object, no face
  iron_dummy: >-
    the Iron-Wood Training Dummy of the Cheongun sect, a man-sized wooden training dummy carved from black
    iron-wood as hard as metal, a thick round trunk with three short wooden arms sticking out at different
    heights and one leg-post, set in a stone base, tiny nicks on its surface; an inanimate object, no face
  goblin: >-
    a small goblin, about two thirds a man's height, mossy green skin, long pointed ears, a big nose, yellow
    eyes, ragged brown leather scraps and a rope belt, a rusty dagger in one hand and a pouch of stones at
    the hip
  swamp_toad: >-
    a huge swamp toad as large as a calf, warty olive-green and brown skin with sickly yellow poison spots,
    bulging golden eyes, a wide mouth, a long yellowish tongue with a poison-dripping tip
  empty_armor: >-
    an empty suit of black plate armor of the Demon King's army with no body inside, two red lights floating
    inside the helmet slit, dark gaps visible at the joints, red ash caught in the seams, a long plain spear
  fire_spirit: >-
    a Fire Spirit, a flame that stood up in human shape out of a volcanic forge; a floating body of orange
    and yellow fire with a bright white-yellow core in the chest, no legs, arms of flickering flame, two
    dark hollows for eyes, embers trailing below
  ice_wolf: >-
    an Ice Wolf of frozen Arden, a large wolf with a translucent body of ice, blue mana frozen inside it
    like veins, a faint hexagonal lattice pattern across the ice, frost mane, pale glowing blue eyes
  ice_knight: >-
    an Ice Knight of Arden, a knight frozen solid on the night the Ice Queen froze the kingdom; armor and
    body both turned to translucent pale-blue ice, a closed-eyed human face visible inside the ice of the
    open helmet, an ice longsword and a round ice shield
  princess_ice: >-
    a tall pillar of clear ice standing behind the throne; frozen inside it a young princess with golden
    hair braided up and a sky-blue dress, eyes closed, one hand reaching forward as if to catch someone; at
    her reaching fingertip a tiny point where all the hexagonal ice lines meet; an object, she does not move
  rock_golem: >-
    a Rock Golem shaped from the stone of Grandfather Mountain, a bulky man-shaped body of grey-brown
    boulders, red lava glowing in the cracks between the stones, small glowing orange eyes, huge stone fists
  mountain_hand: >-
    a giant hand of rock rising out of a mine wall, part of the mountain itself; a huge stone forearm
    emerging from a broken slab of cave wall, each finger as large as a man's torso, cracks glowing faintly
    red, small rubble at the base
  black_crystal: >-
    a fist-sized black crystal hanging on a short black chain from a wooden beam, smooth and many-faceted,
    swallowing the light so that dark shadow streaks flow away from it in one direction; an object
  shadow_fragment: >-
    a Shadow, a remnant of the Shadow Assassin's power; a flat, flowing man-shaped shadow rising out of the
    floor, its lower body still melted into a puddle of darkness, no face, one arm ending in a solid grey
    blade, the only real thing about it
  wedge: >-
    a black iron wedge as long as a forearm driven into the air itself, one end blunt and one end a needle
    point, engraved with flowing wave-like letters, the air around it twisting and warping like heat haze
    with thin violet distortion lines; an object floating in place
  blood_guard: >-
    a Blood Guard of the demonic cult, once a Cheongun disciple; a young swordsman in a dark crimson martial
    robe under a white over-robe, red tassels on the sleeves, hair tied up, a straight sword, a wary uneasy
    face
  black_wind: >-
    a Black Wind Squad warrior of the demonic cult's Shaanxi branch; a lean fighter all in black, black
    martial robe and a black hood covering the head and lower face, only sharp eyes showing, a curved saber
  pockmark_vice: >-
    the pockmarked vice-captain of the Blood Guard, mounted on a dark brown horse; a stocky man in his late
    twenties with a pockmarked face and a thin mustache, a dark crimson martial robe under a white over-robe
    with red tassels, a straight sword raised; the horse with a plain leather saddle and bridle
  blood_cultist: >-
    a Blood Cultist, a rank-and-file follower of the Heavenly Demon Cult; a gaunt man in a dark blood-red
    martial robe with a blood-drop crest on the chest, a red headband, a thin heavy dark red aura clinging
    to the body, a broad blood-red saber
  cult_guardian: >-
    a Demon Cult Guardian, a guardian-protector of the Heavenly Demon Cult; a broad middle-aged martial
    artist in a long dark crimson robe with black trim, a shaved head with a topknot, both palms blood-red,
    dark red qi curling up from the hands
  branch_elite: >-
    an Elite of the cult's Shaanxi branch, bodyguard of the branch lord; a tall broad warrior in dark
    crimson lamellar armor over a black robe, a blood-drop crest on the chest plate, a red-glowing left palm
    and a heavy dao blade in the right hand
  stair_archer: >-
    an archer of the cult on the Nine Heaven Stairs; a lean man in a dark red martial robe with a black
    leather bracer and a quiver of black-fletched arrows on the back, a red headband, a long recurve bow
  fire_scale_hound: >-
    a three-headed hound from the rift, larger than a horse; burning orange-red scales instead of fur, three
    dog heads with glowing yellow eyes on necks that join into one thick neck, small flames flickering
    between the scales, a long spiked tail
  inner_senior: >-
    an inner-court senior disciple of the Cheongun sect, a smug young martial artist in neat grey-blue
    inner-court robes with a white sash, hair tied in a topknot, a sneering expression, bare fists
  dry_vine: >-
    a knot of dried grey-brown barrier vines from the dead silver forest, thick twisted stems rising from
    dead soil with faint silver veins of old barrier magic along the bark, a few withered leaves, curling
    tendrils; an inanimate plant mass, no face
  great_furnace: >-
    the Great Furnace of the Velkan canyon, a huge stone and iron furnace with a roaring white-hot flame in
    its mouth, many heavy iron slave chains running into it from all sides, glowing orange cracks in the
    stone; an inanimate object, no face
  ash_bat: >-
    a cave bat of the volcanic canyon about the size of a dog, soot-black fur, wide leathery wings crusted
    with hot glowing ash, small red eyes, bared fangs
  tomb_warrior: >-
    the ghost of a dwarf warrior from the Tomb of Five Thousand, stout and pale translucent with blue-green
    ghost light leaking from the joints of old dwarven plate armor, a long braided beard, a broad axe and a
    round dwarf shield
  rock_eater: >-
    a large burrowing rock-eater grub of Khazdum, a segmented body with rock-plated back armor, a round
    grinding mouth ringed with stone teeth, small dark eyes, flecks of metal ore on its shell
  sleeping_sentry: >-
    a blood cult sentry of the Gyosaeso checkpoint, a man in dark red guard clothes and a bamboo hat, a
    curved broadsword at the hip and a small bone whistle on a cord, drowsy half-closed eyes
  needle_cultist: >-
    a blood cult needle thrower, a lean assassin in dark crimson robes with long sleeves, a half-mask over
    the lower face, thin green-tipped poison needles between the fingers, a needle case on the belt
  poison_palm_elder: >-
    a Poison Palm Elder of the Heavenly Demon Cult, an old man in layered black and dark green robes with a
    long white beard, the right palm stained dark blue-green and faintly steaming with poison mist
  array_statue: >-
    a stone guardian of the Nine Heaven Stairs array, a weathered man-sized stone statue shaped like a robed
    martial artist, carved array symbols glowing faint gold on its chest, moss in the cracks; a stone
    construct, a blank carved face
  cult_swordsman: >-
    a saber swordsman of the Heavenly Demon Cult, a lean man in black robes with a red sash, a heavy curved
    saber held low, a scar across the face, cold eyes
  shadow_bridge: >-
    the Shadow Bridge of the world rift, a long narrow bridge of dark solidified shadow spanning between
    floating rock fragments, one end rearing up like a beast, ghostly figures with black wedge daggers
    half-formed inside it; an inanimate structure, no face
  frozen_shard: >-
    a frozen shard of Arden ice drifting in the dark void of the rift, a large jagged hexagonal shard of
    pale blue ice with a faint inner light like a frozen star, frost mist trailing from its edges; an
    inanimate object, no face
```
