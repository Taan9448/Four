# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 150개(C0001~), 봇 `src/sim/bot.ts`. 계산 61.3초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **50/150 (33%)**
- 평균 덱 43.6장 · 평균 상흔 13.6

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 150 | 150 | 100% | 0 | 100% | 16.0 | 1.0 |
| 은빛 숲 (s1) | 150 | 150 | 100% | 0 | 100% | 16.0 | 2.0 |
| 화산 협곡 (s2) | 150 | 133 | 89% | 17 | 100% | 40.0 | 3.0 |
| 아르덴 (s3) | 133 | 123 | 92% | 10 | 100% | 40.0 | 4.1 |
| 카즈둠 (s4) | 123 | 106 | 86% | 17 | 100% | 40.0 | 5.7 |
| 노크투르나 (s5) | 106 | 76 | 72% | 30 | 100% | 40.0 | 6.2 |
| 운곡촌 (s6) | 76 | 70 | 92% | 6 | 100% | 41.0 | 7.2 |
| 낙안봉 (s7) | 70 | 63 | 90% | 7 | 100% | 41.0 | 8.1 |
| 천마봉 (s8) | 63 | 54 | 86% | 9 | 100% | 41.0 | 9.0 |
| 세계의 틈 (s9) | 54 | 50 | 93% | 4 | 100% | 42.0 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 93 | 0 | 4.9 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 57 | 0 | 3.5 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 150 | 0 | 2.9 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 150 | 0 | 5.0 | 69.9 | 23% | 23% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 44 | 0 | 7.5 | 73.7 | 8% | 1% | 0.0 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 67 | 0 | 5.5 | 75.1 | 5% | 0% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 93 | 0 | 6.8 | 74.8 | 7% | 1% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 75 | 0 | 5.5 | 75.0 | 7% | 3% | 0.0 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 22 | 0 | 9.9 | 73.7 | 24% | 3% | 0.0 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 93 | 0 | 4.9 | 75.4 | 5% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 150 | 0 | 11.1 | 78.2 | 35% | 29% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 161 | 0 | 6.0 | 82.2 | 6% | 2% | 0.0 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 110 | 0 | 7.7 | 83.9 | 13% | 3% | 0.0 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 64 | 0 | 5.4 | 73.8 | 12% | 3% | 0.0 |
| 화로 사이 `s2_battle_forge_row` | battle | 30 | **4 (13%)** | 8.3 | 74.3 | 29% | 16% | 0.0 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 36 | 0 | 8.5 | 70.9 | 18% | 7% | 0.0 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 76 | 0 | 5.8 | 77.8 | 10% | 4% | 0.0 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 50 | **1 (2%)** | 7.1 | 78.7 | 10% | 4% | 0.0 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 65 | **4 (6%)** | 10.4 | 84.1 | 54% | 51% | 0.0 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 40 | **5 (13%)** | 9.5 | 75.7 | 46% | 49% | 0.0 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 136 | **3 (2%)** | 8.9 | 83.4 | 46% | 53% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 114 | 0 | 6.1 | 91.8 | 7% | 3% | 0.0 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 42 | 0 | 7.1 | 93.7 | 7% | 4% | 0.0 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 127 | 0 | 5.2 | 92.5 | 4% | 0% | 0.0 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 19 | 0 | 9.4 | 89.2 | 23% | 8% | 0.0 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 94 | **1 (1%)** | 8.5 | 93.1 | 17% | 2% | 0.0 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 35 | 0 | 8.7 | 92.0 | 33% | 32% | 0.0 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 132 | **1 (1%)** | 8.7 | 92.0 | 39% | 51% | 0.0 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 22 | 0 | 11.0 | 94.0 | 38% | 18% | 0.0 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 131 | **8 (6%)** | 10.4 | 87.3 | 41% | 36% | 0.0 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 60 | 0 | 3.9 | 96.1 | 2% | 1% | 0.0 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 41 | 0 | 4.6 | 96.3 | 3% | 3% | 0.0 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 113 | 0 | 5.4 | 96.3 | 5% | 4% | 0.0 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 13 | **1 (8%)** | 5.8 | 92.8 | 16% | 22% | 0.0 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 68 | **5 (7%)** | 8.3 | 97.4 | 38% | 52% | 0.0 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 43 | 0 | 4.8 | 93.4 | 7% | -1% | 0.0 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 9 | 0 | 7.4 | 103.1 | 25% | 12% | 0.0 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 17 | 0 | 5.4 | 100.3 | 7% | 4% | 0.0 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 49 | **6 (12%)** | 8.1 | 98.3 | 60% | 78% | 0.0 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 111 | **5 (5%)** | 8.2 | 100.6 | 54% | 65% | 0.0 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 42 | 0 | 6.7 | 95.7 | 11% | 1% | 0.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 32 | 0 | 3.9 | 100.6 | 5% | 4% | 0.0 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 57 | **4 (7%)** | 10.6 | 92.5 | 18% | 2% | 0.0 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 44 | 0 | 5.7 | 98.6 | 5% | 3% | 0.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 28 | 0 | 5.5 | 105.7 | 5% | 0% | 0.0 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 20 | 0 | 4.8 | 79.8 | 0% | -8% | 0.0 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 56 | 0 | 4.5 | 93.0 | 3% | 1% | 0.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 84 | **20 (24%)** | 9.4 | 100.7 | 70% | 100% | 0.0 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 28 | 0 | 8.1 | 92.1 | 11% | -2% | 0.0 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 9 | 0 | 5.9 | 107.0 | 11% | 10% | 0.0 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 106 | 0 | 3.4 | 105.1 | 6% | 2% | 0.0 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 82 | **6 (7%)** | 9.0 | 105.6 | 49% | 78% | 0.0 |
| 혈위대 함정 `s6_battle_ambush` | battle | 76 | 0 | 5.4 | 109.9 | 11% | 9% | 3.7 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 39 | 0 | 4.8 | 103.0 | 10% | 9% | 2.5 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 19 | 0 | 4.8 | 108.5 | 9% | 3% | 3.8 |
| 교세 순찰 `s6_battle_patrol` | battle | 49 | 0 | 3.7 | 107.7 | 3% | 2% | 3.3 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 52 | 0 | 4.2 | 109.2 | 5% | 3% | 2.5 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 47 | 0 | 5.1 | 108.9 | 8% | 5% | 4.0 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 25 | 0 | 4.7 | 108.8 | 17% | 15% | 3.7 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 13 | **1 (8%)** | 6.4 | 112.3 | 34% | 91% | 2.6 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 68 | 0 | 5.2 | 107.5 | 11% | 9% | 4.3 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 75 | **5 (7%)** | 9.6 | 112.0 | 34% | 61% | 2.5 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 67 | 0 | 4.3 | 110.3 | 11% | 5% | 4.0 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 55 | 0 | 4.6 | 107.5 | 10% | 2% | 3.8 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 58 | 0 | 4.5 | 109.6 | 12% | 14% | 3.2 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 39 | 0 | 5.3 | 105.7 | 8% | 4% | 3.5 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 35 | 0 | 4.1 | 105.1 | 6% | 3% | 3.7 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 44 | 0 | 4.0 | 111.8 | 7% | 8% | 3.1 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 37 | 0 | 5.2 | 104.7 | 9% | 5% | 3.1 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 17 | 0 | 5.8 | 112.4 | 19% | 21% | 4.4 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 24 | 0 | 7.3 | 110.5 | 49% | 49% | 3.0 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 27 | **3 (11%)** | 6.7 | 113.0 | 44% | 53% | 3.6 |
| 낙안봉 `s7_boss_blood_hand` | boss | 67 | **4 (6%)** | 9.3 | 116.3 | 42% | 37% | 2.7 |
| 화살 비 `s8_battle_arrow_rain` | battle | 27 | **2 (7%)** | 4.4 | 106.7 | 20% | 12% | 2.9 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 14 | 0 | 5.5 | 108.9 | 18% | 17% | 2.1 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 30 | 0 | 4.2 | 117.3 | 12% | 16% | 3.2 |
| 호법의 굽이 `s8_battle_guardians` | battle | 11 | 0 | 4.0 | 115.5 | 6% | 8% | 2.1 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 37 | 0 | 3.8 | 113.8 | 6% | 0% | 2.6 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 43 | 0 | 3.6 | 110.1 | 6% | 2% | 2.2 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 23 | **1 (4%)** | 6.7 | 114.7 | 32% | 41% | 1.8 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 35 | 0 | 5.9 | 116.6 | 28% | 25% | 2.0 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 20 | 0 | 5.5 | 111.2 | 23% | 16% | 3.0 |
| 혈전 `s8_boss_blood_hall` | boss | 60 | **6 (10%)** | 8.8 | 119.3 | 42% | 88% | 2.4 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 6 | 0 | 4.8 | 119.7 | 13% | 3% | 1.3 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 9 | 0 | 4.6 | 122.7 | 5% | 4% | 1.4 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 45 | 0 | 3.7 | 123.3 | 6% | 2% | 1.2 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 4 | 0 | 5.3 | 124.0 | 20% | 7% | 2.5 |
| 그림자 망령 `s9_battle_wraiths` | battle | 48 | 0 | 6.2 | 120.9 | 22% | 7% | 1.9 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 25 | 0 | 5.9 | 122.1 | 17% | 36% | 1.4 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 25 | 0 | 4.3 | 123.0 | 14% | 8% | 2.6 |
| 틈의 심장 `s9_boss_mordecai` | boss | 54 | **4 (7%)** | 9.9 | 123.6 | 52% | 72% | 0.1 |

