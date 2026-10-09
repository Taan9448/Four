# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 150개(B0001~), 봇 `src/sim/bot.ts`. 계산 60.9초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **53/150 (35%)**
- 평균 덱 43.4장 · 평균 상흔 13.6

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 150 | 150 | 100% | 0 | 100% | 16.0 | 1.0 |
| 은빛 숲 (s1) | 150 | 150 | 100% | 0 | 100% | 16.0 | 2.0 |
| 화산 협곡 (s2) | 150 | 138 | 92% | 12 | 100% | 40.0 | 3.0 |
| 아르덴 (s3) | 138 | 122 | 88% | 16 | 100% | 40.0 | 4.1 |
| 카즈둠 (s4) | 122 | 108 | 89% | 14 | 100% | 40.0 | 5.6 |
| 노크투르나 (s5) | 108 | 79 | 73% | 29 | 100% | 40.0 | 6.2 |
| 운곡촌 (s6) | 79 | 73 | 92% | 6 | 100% | 41.0 | 7.2 |
| 낙안봉 (s7) | 73 | 66 | 90% | 7 | 100% | 41.0 | 8.1 |
| 천마봉 (s8) | 66 | 58 | 88% | 8 | 100% | 41.0 | 9.0 |
| 세계의 틈 (s9) | 58 | 53 | 91% | 5 | 100% | 42.0 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 102 | 0 | 5.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 48 | 0 | 3.4 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 150 | 0 | 3.0 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 150 | 0 | 5.0 | 70.0 | 21% | 21% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 49 | 0 | 7.5 | 74.6 | 8% | 0% | 0.0 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 67 | 0 | 5.7 | 76.8 | 5% | 1% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 101 | 0 | 7.0 | 75.5 | 8% | 1% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 79 | 0 | 5.2 | 75.8 | 7% | 3% | 0.0 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 21 | 0 | 10.8 | 76.3 | 26% | 4% | 0.0 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 85 | 0 | 4.9 | 76.4 | 5% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 150 | 0 | 11.0 | 79.1 | 36% | 30% | 0.1 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 133 | 0 | 5.9 | 81.0 | 7% | 3% | 0.0 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 141 | 0 | 7.6 | 81.7 | 14% | 3% | 0.0 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 81 | 0 | 5.3 | 75.0 | 11% | 5% | 0.0 |
| 화로 사이 `s2_battle_forge_row` | battle | 22 | **1 (5%)** | 7.9 | 73.7 | 27% | 19% | 0.0 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 33 | **1 (3%)** | 7.8 | 70.5 | 17% | 6% | 0.0 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 69 | 0 | 5.4 | 70.8 | 8% | 2% | 0.0 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 36 | 0 | 7.2 | 83.3 | 10% | 3% | 0.0 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 69 | **3 (4%)** | 10.8 | 82.9 | 55% | 54% | 0.0 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 44 | **5 (11%)** | 9.2 | 79.0 | 52% | 64% | 0.0 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 140 | **2 (1%)** | 8.9 | 79.8 | 47% | 52% | 0.0 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 98 | 0 | 6.3 | 92.9 | 7% | 4% | 0.0 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 30 | 0 | 6.6 | 88.3 | 6% | -1% | 0.0 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 143 | 0 | 5.2 | 91.6 | 5% | 2% | 0.0 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 19 | 0 | 10.1 | 92.2 | 22% | 19% | 0.0 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 98 | 0 | 8.2 | 90.9 | 18% | 5% | 0.0 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 39 | 0 | 8.5 | 93.2 | 34% | 47% | 0.0 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 138 | **6 (4%)** | 8.8 | 87.1 | 39% | 49% | 0.0 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 30 | 0 | 11.3 | 91.9 | 38% | 9% | 0.0 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 132 | **10 (8%)** | 10.9 | 86.7 | 47% | 45% | 0.0 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 65 | 0 | 3.6 | 99.5 | 2% | 1% | 0.0 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 42 | 0 | 4.9 | 92.3 | 4% | 4% | 0.0 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 115 | 0 | 5.2 | 94.7 | 5% | 6% | 0.0 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 18 | **1 (6%)** | 6.4 | 84.8 | 14% | 6% | 0.0 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 70 | **4 (6%)** | 9.3 | 98.3 | 43% | 47% | 0.0 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 40 | 0 | 5.2 | 87.1 | 8% | -1% | 0.0 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 7 | 0 | 7.6 | 103.7 | 18% | 4% | 0.0 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 21 | 0 | 5.5 | 102.2 | 7% | 2% | 0.0 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 48 | **4 (8%)** | 8.0 | 100.5 | 62% | 90% | 0.0 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 113 | **5 (4%)** | 8.5 | 99.4 | 58% | 73% | 0.0 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 45 | 0 | 6.7 | 95.9 | 10% | -1% | 0.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 40 | 0 | 4.1 | 98.4 | 5% | 2% | 0.0 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 48 | **5 (10%)** | 10.6 | 89.5 | 22% | 9% | 0.0 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 46 | 0 | 5.2 | 96.4 | 5% | 2% | 0.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 17 | 0 | 5.2 | 93.8 | 4% | -2% | 0.0 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 26 | 0 | 4.4 | 91.3 | 2% | -1% | 0.0 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 54 | 0 | 4.4 | 92.9 | 3% | 2% | 0.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 67 | **23 (34%)** | 9.7 | 103.3 | 80% | 121% | 0.0 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 22 | 0 | 7.7 | 105.7 | 10% | 2% | 0.0 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 18 | 0 | 6.0 | 98.0 | 10% | 1% | 0.3 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 108 | 0 | 3.5 | 104.9 | 6% | 3% | 0.0 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 80 | **1 (1%)** | 9.2 | 106.8 | 53% | 78% | 0.1 |
| 혈위대 함정 `s6_battle_ambush` | battle | 79 | 0 | 5.8 | 110.2 | 13% | 11% | 3.4 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 34 | **1 (3%)** | 4.6 | 101.4 | 8% | 6% | 2.8 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 15 | 0 | 4.7 | 109.3 | 12% | 9% | 5.1 |
| 교세 순찰 `s6_battle_patrol` | battle | 49 | 0 | 3.6 | 104.6 | 3% | 2% | 3.2 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 70 | 0 | 4.2 | 106.5 | 7% | 9% | 2.8 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 50 | 0 | 5.0 | 100.2 | 10% | 5% | 3.6 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 21 | 0 | 5.0 | 104.5 | 16% | 9% | 3.7 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 24 | **3 (13%)** | 6.6 | 108.8 | 39% | 97% | 3.5 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 63 | 0 | 5.6 | 107.6 | 14% | 15% | 4.0 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 75 | **2 (3%)** | 9.9 | 112.4 | 32% | 54% | 2.7 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 82 | 0 | 4.5 | 107.0 | 12% | 6% | 3.8 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 45 | 0 | 4.7 | 107.9 | 10% | 4% | 3.6 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 42 | 0 | 4.1 | 110.0 | 10% | 15% | 3.6 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 33 | 0 | 5.7 | 111.9 | 10% | 7% | 3.1 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 29 | 0 | 4.7 | 112.2 | 6% | 7% | 2.8 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 51 | 0 | 4.2 | 111.0 | 7% | 5% | 3.2 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 36 | 0 | 4.6 | 110.4 | 8% | 3% | 4.0 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 21 | 0 | 6.0 | 107.4 | 17% | 20% | 3.1 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 28 | **2 (7%)** | 6.5 | 107.4 | 44% | 49% | 3.4 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 32 | **2 (6%)** | 7.2 | 114.0 | 42% | 52% | 2.9 |
| 낙안봉 `s7_boss_blood_hand` | boss | 69 | **3 (4%)** | 9.2 | 117.8 | 40% | 43% | 3.2 |
| 화살 비 `s8_battle_arrow_rain` | battle | 18 | 0 | 4.6 | 117.7 | 21% | 6% | 2.5 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 14 | **1 (7%)** | 5.2 | 109.4 | 21% | 15% | 3.3 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 35 | 0 | 4.9 | 116.2 | 10% | 8% | 2.3 |
| 호법의 굽이 `s8_battle_guardians` | battle | 16 | 0 | 4.0 | 108.4 | 9% | 3% | 2.4 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 29 | 0 | 4.0 | 107.9 | 6% | 1% | 1.6 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 50 | 0 | 3.7 | 110.8 | 6% | 7% | 2.8 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 23 | **2 (9%)** | 6.8 | 116.3 | 31% | 41% | 1.8 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 38 | **3 (8%)** | 5.4 | 118.8 | 30% | 36% | 2.7 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 23 | 0 | 5.8 | 113.7 | 23% | 17% | 1.7 |
| 혈전 `s8_boss_blood_hall` | boss | 60 | **2 (3%)** | 9.6 | 118.3 | 42% | 86% | 2.0 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 14 | 0 | 6.1 | 122.7 | 11% | 7% | 1.6 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 8 | 0 | 4.0 | 122.8 | 4% | 2% | 2.3 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 51 | 0 | 3.7 | 122.4 | 8% | 2% | 1.2 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 9 | 0 | 4.8 | 124.0 | 16% | 3% | 1.1 |
| 그림자 망령 `s9_battle_wraiths` | battle | 48 | 0 | 6.6 | 122.5 | 25% | 15% | 1.9 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 16 | 0 | 5.8 | 121.5 | 18% | 30% | 1.1 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 28 | 0 | 4.7 | 123.6 | 14% | 2% | 2.2 |
| 틈의 심장 `s9_boss_mordecai` | boss | 58 | **5 (9%)** | 9.9 | 122.2 | 53% | 74% | 0.1 |

