# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 150개(B0001~), 봇 `src/sim/bot.ts`. 계산 71.8초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **42/150 (28%)**
- 평균 덱 43.7장 · 평균 상흔 12.6

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 150 | 150 | 100% | 0 | 100% | 16.0 | 1.0 |
| 은빛 숲 (s1) | 150 | 150 | 100% | 0 | 100% | 16.0 | 2.0 |
| 화산 협곡 (s2) | 150 | 138 | 92% | 12 | 100% | 40.0 | 3.0 |
| 아르덴 (s3) | 138 | 126 | 91% | 12 | 100% | 40.0 | 4.1 |
| 카즈둠 (s4) | 126 | 117 | 93% | 9 | 100% | 40.0 | 5.6 |
| 노크투르나 (s5) | 117 | 88 | 75% | 29 | 100% | 40.0 | 6.3 |
| 운곡촌 (s6) | 88 | 72 | 82% | 16 | 100% | 41.0 | 7.2 |
| 낙안봉 (s7) | 72 | 59 | 82% | 13 | 100% | 41.0 | 8.1 |
| 천마봉 (s8) | 59 | 48 | 81% | 11 | 100% | 41.0 | 9.0 |
| 세계의 틈 (s9) | 48 | 42 | 88% | 6 | 100% | 42.0 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 102 | 0 | 5.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 48 | 0 | 3.4 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 150 | 0 | 3.0 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 150 | 0 | 5.0 | 70.0 | 22% | 22% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 49 | 0 | 6.7 | 73.7 | 8% | -1% | 0.0 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 67 | 0 | 5.4 | 75.1 | 5% | 0% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 101 | 0 | 6.6 | 74.8 | 9% | 0% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 79 | 0 | 5.2 | 74.8 | 7% | 4% | 0.0 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 21 | 0 | 9.6 | 74.9 | 21% | 3% | 0.0 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 85 | 0 | 5.1 | 75.9 | 5% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 150 | 0 | 10.6 | 78.4 | 34% | 28% | 0.1 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 134 | 0 | 5.4 | 79.8 | 7% | 3% | 0.0 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 141 | 0 | 7.3 | 79.8 | 14% | 3% | 0.0 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 81 | **1 (1%)** | 4.9 | 71.5 | 10% | 6% | 0.0 |
| 화로 사이 `s2_battle_forge_row` | battle | 22 | 0 | 7.0 | 70.5 | 24% | 15% | 0.0 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 33 | 0 | 7.4 | 72.9 | 18% | 7% | 0.0 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 70 | 0 | 5.4 | 68.1 | 9% | 2% | 0.0 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 35 | 0 | 7.2 | 78.9 | 9% | 2% | 0.0 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 67 | **2 (3%)** | 9.7 | 82.1 | 50% | 47% | 0.0 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 45 | **2 (4%)** | 8.7 | 73.2 | 44% | 44% | 0.0 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 145 | **7 (5%)** | 8.1 | 78.7 | 43% | 49% | 0.0 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 99 | 0 | 5.9 | 89.9 | 8% | 2% | 0.0 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 31 | 0 | 6.5 | 82.5 | 9% | 2% | 0.0 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 147 | 0 | 4.8 | 87.8 | 6% | 2% | 0.0 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 20 | 0 | 8.8 | 85.6 | 21% | 16% | 0.0 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 97 | 0 | 7.3 | 87.8 | 20% | 6% | 0.0 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 39 | 0 | 7.4 | 87.8 | 33% | 35% | 0.0 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 137 | **7 (5%)** | 8.0 | 82.6 | 36% | 47% | 0.0 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 30 | **1 (3%)** | 8.9 | 84.9 | 33% | 15% | 0.0 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 130 | **4 (3%)** | 10.4 | 81.8 | 41% | 39% | 0.0 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 67 | 0 | 3.4 | 93.9 | 4% | 3% | 0.0 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 43 | 0 | 4.2 | 83.5 | 5% | 3% | 0.0 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 124 | 0 | 4.6 | 90.9 | 7% | 6% | 0.0 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 17 | 0 | 4.9 | 76.3 | 16% | 9% | 0.0 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 69 | 0 | 7.8 | 95.7 | 37% | 33% | 0.0 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 39 | 0 | 4.5 | 86.9 | 10% | 2% | 0.0 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 8 | 0 | 6.1 | 102.8 | 18% | 1% | 0.0 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 27 | 0 | 4.9 | 94.8 | 11% | 8% | 0.0 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 52 | **5 (10%)** | 6.4 | 94.5 | 54% | 75% | 0.0 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 121 | **4 (3%)** | 7.6 | 93.5 | 53% | 59% | 0.0 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 47 | 0 | 5.2 | 96.0 | 11% | 1% | 0.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 46 | 0 | 3.5 | 91.3 | 6% | 3% | 0.0 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 62 | **2 (3%)** | 8.0 | 81.7 | 18% | -1% | 0.0 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 47 | 0 | 4.6 | 90.1 | 7% | 6% | 0.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 28 | **1 (4%)** | 4.3 | 81.9 | 6% | -1% | 0.0 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 35 | **2 (6%)** | 3.7 | 74.3 | 3% | -1% | 0.0 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 61 | 0 | 4.0 | 87.2 | 5% | 5% | 0.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 78 | **15 (19%)** | 6.8 | 99.9 | 63% | 96% | 0.0 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 24 | **2 (8%)** | 6.6 | 94.0 | 15% | 7% | 0.0 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 17 | **1 (6%)** | 4.6 | 84.5 | 13% | 13% | 0.1 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 117 | 0 | 3.7 | 101.0 | 10% | 4% | 0.0 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 94 | **6 (6%)** | 8.7 | 101.1 | 50% | 69% | 0.1 |
| 혈위대 함정 `s6_battle_ambush` | battle | 88 | 0 | 5.0 | 106.4 | 17% | 16% | 3.6 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 42 | 0 | 3.7 | 92.3 | 12% | 8% | 1.7 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 18 | **2 (11%)** | 4.6 | 88.7 | 17% | 15% | 2.8 |
| 교세 순찰 `s6_battle_patrol` | battle | 55 | 0 | 3.6 | 101.6 | 7% | 6% | 2.5 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 70 | 0 | 3.9 | 101.7 | 11% | 13% | 2.4 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 68 | 0 | 4.7 | 92.0 | 16% | 16% | 3.1 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 18 | 0 | 4.7 | 90.4 | 25% | 24% | 1.8 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 24 | **8 (33%)** | 4.4 | 98.1 | 40% | 112% | 1.3 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 59 | **2 (3%)** | 5.2 | 96.9 | 20% | 28% | 3.3 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 76 | **4 (5%)** | 7.6 | 103.4 | 33% | 50% | 3.7 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 60 | 0 | 4.0 | 103.3 | 18% | 19% | 2.8 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 42 | 0 | 4.6 | 106.4 | 16% | 13% | 3.2 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 50 | 0 | 3.9 | 100.6 | 15% | 22% | 2.7 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 32 | 0 | 5.6 | 93.8 | 13% | 6% | 3.7 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 27 | **1 (4%)** | 4.4 | 92.7 | 8% | 9% | 2.7 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 56 | 0 | 3.8 | 104.3 | 9% | 7% | 2.7 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 39 | 0 | 5.2 | 95.1 | 17% | 11% | 3.2 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 16 | 0 | 5.1 | 100.8 | 21% | 11% | 3.9 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 26 | **4 (15%)** | 6.3 | 91.5 | 43% | 56% | 2.6 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 27 | **5 (19%)** | 4.9 | 107.0 | 41% | 61% | 3.2 |
| 낙안봉 `s7_boss_blood_hand` | boss | 62 | **3 (5%)** | 8.5 | 109.9 | 42% | 40% | 5.1 |
| 화살 비 `s8_battle_arrow_rain` | battle | 13 | **1 (8%)** | 3.8 | 99.8 | 30% | 28% | 1.2 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 9 | **1 (11%)** | 3.9 | 110.4 | 25% | 24% | 1.6 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 31 | 0 | 4.4 | 109.9 | 16% | 17% | 2.7 |
| 호법의 굽이 `s8_battle_guardians` | battle | 15 | 0 | 3.9 | 102.3 | 11% | 13% | 1.3 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 40 | **1 (3%)** | 3.6 | 96.0 | 7% | -1% | 1.4 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 34 | 0 | 3.9 | 104.9 | 10% | 10% | 2.6 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 21 | **1 (5%)** | 6.0 | 112.1 | 27% | 29% | 2.5 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 41 | **1 (2%)** | 5.8 | 114.7 | 29% | 30% | 2.7 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 18 | 0 | 4.7 | 109.4 | 24% | 21% | 3.1 |
| 혈전 `s8_boss_blood_hall` | boss | 54 | **6 (11%)** | 8.1 | 114.7 | 44% | 93% | 3.6 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 20 | 0 | 4.0 | 120.1 | 16% | 7% | 1.8 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 1 | 0 | 3.0 | 124.0 | 9% | 19% | 0.0 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 46 | 0 | 2.8 | 117.2 | 13% | 10% | 0.8 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 5 | 0 | 3.6 | 121.6 | 11% | 0% | 1.4 |
| 그림자 망령 `s9_battle_wraiths` | battle | 35 | **1 (3%)** | 3.9 | 117.2 | 27% | 25% | 1.5 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 13 | 0 | 4.3 | 117.4 | 18% | 42% | 1.3 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 24 | 0 | 3.6 | 118.3 | 22% | 19% | 1.1 |
| 틈의 심장 `s9_boss_mordecai` | boss | 47 | **5 (11%)** | 9.4 | 118.1 | 49% | 73% | 0.5 |

