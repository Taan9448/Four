# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 37.4초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **181/300 (60%)**
- 평균 덱 48.2장 · 평균 상흔 26.7

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 | 1.0 |
| 은빛 숲 (s1) | 300 | 300 | 100% | 0 | 100% | 9.3 | 2.0 |
| 화산 협곡 (s2) | 300 | 286 | 95% | 14 | 100% | 27.4 | 3.1 |
| 아르덴 (s3) | 286 | 286 | 100% | 0 | 100% | 30.5 | 4.4 |
| 카즈둠 (s4) | 286 | 282 | 99% | 4 | 100% | 32.2 | 5.8 |
| 노크투르나 (s5) | 282 | 276 | 98% | 6 | 100% | 34.1 | 6.5 |
| 운곡촌 (s6) | 276 | 257 | 93% | 19 | 100% | 37.1 | 7.5 |
| 낙안봉 (s7) | 257 | 235 | 91% | 22 | 100% | 43.8 | 8.3 |
| 천마봉 (s8) | 235 | 224 | 95% | 11 | 100% | 45.7 | 9.1 |
| 세계의 틈 (s9) | 224 | 181 | 81% | 43 | 100% | 49.0 | 9.9 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 206 | 0 | 4.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 94 | 0 | 2.7 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 16% | 16% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 55 | 0 | 5.7 | 70.8 | 13% | 4% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 43 | 0 | 4.2 | 72.4 | 7% | 2% | 0.2 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 104 | 0 | 4.0 | 72.1 | 9% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 205 | 0 | 5.1 | 72.1 | 9% | 2% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 98 | 0 | 3.8 | 72.7 | 11% | 6% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 47 | 0 | 3.4 | 73.8 | 5% | 2% | 0.2 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 59 | 0 | 8.4 | 71.6 | 27% | 7% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 113 | 0 | 4.6 | 73.7 | 12% | 6% | 0.2 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 177 | 0 | 4.7 | 73.4 | 8% | 5% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | 0 | 12.3 | 76.6 | 48% | 41% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 246 | 0 | 4.2 | 76.6 | 9% | 5% | 0.1 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 229 | 0 | 5.3 | 77.3 | 13% | 5% | 0.2 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 184 | 0 | 4.5 | 68.6 | 14% | 10% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 76 | **5 (7%)** | 6.6 | 66.9 | 31% | 22% | 0.2 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 81 | 0 | 6.7 | 68.3 | 21% | 12% | 0.2 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 166 | 0 | 4.5 | 69.6 | 12% | 9% | 0.2 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 64 | 0 | 5.8 | 75.7 | 10% | 3% | 0.3 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 106 | 0 | 8.5 | 74.7 | 32% | 23% | 0.2 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 109 | 0 | 7.1 | 70.7 | 24% | 18% | 0.1 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 295 | **9 (3%)** | 12.9 | 75.9 | 55% | 55% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 178 | 0 | 3.9 | 82.5 | 6% | 3% | 0.6 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 92 | 0 | 4.7 | 76.7 | 7% | 3% | 0.7 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 272 | 0 | 3.0 | 83.5 | 3% | 1% | 0.7 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 84 | 0 | 6.8 | 73.9 | 15% | 9% | 0.7 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 64 | 0 | 6.1 | 71.0 | 13% | 6% | 0.6 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 232 | 0 | 5.7 | 79.8 | 12% | 4% | 0.6 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 114 | 0 | 6.7 | 79.0 | 16% | 12% | 0.6 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 286 | 0 | 6.8 | 80.8 | 17% | 15% | 0.5 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 51 | 0 | 7.7 | 82.8 | 21% | 4% | 0.5 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 286 | 0 | 9.8 | 84.1 | 35% | 28% | 0.6 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 121 | 0 | 2.6 | 87.1 | 3% | 1% | 0.5 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 139 | 0 | 3.9 | 86.3 | 4% | 3% | 0.5 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 290 | 0 | 3.9 | 87.0 | 5% | 4% | 0.5 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 77 | 0 | 4.8 | 86.8 | 11% | 6% | 0.6 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 156 | 0 | 9.2 | 87.8 | 19% | 17% | 0.6 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 135 | 0 | 3.6 | 85.3 | 7% | 2% | 0.6 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 23 | 0 | 6.0 | 88.7 | 22% | 9% | 1.1 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 47 | 0 | 4.1 | 86.4 | 8% | 3% | 0.7 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 111 | 0 | 5.9 | 86.8 | 11% | 10% | 0.6 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 286 | **4 (1%)** | 10.7 | 90.2 | 40% | 41% | 0.4 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 153 | 0 | 6.0 | 84.6 | 12% | 5% | 1.2 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 93 | 0 | 3.6 | 89.3 | 8% | 5% | 0.9 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 184 | 0 | 10.1 | 82.8 | 22% | 8% | 1.9 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 138 | 0 | 4.3 | 87.7 | 8% | 5% | 1.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 58 | 0 | 4.3 | 86.8 | 6% | 2% | 1.4 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 124 | 0 | 4.3 | 82.4 | 7% | 6% | 0.7 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 124 | 0 | 3.5 | 81.3 | 4% | 3% | 0.9 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 185 | 0 | 8.2 | 88.7 | 26% | 24% | 1.2 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 135 | 0 | 7.6 | 86.2 | 16% | 7% | 1.0 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 75 | 0 | 5.3 | 83.4 | 7% | 4% | 1.3 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 282 | 0 | 2.3 | 92.1 | 2% | 0% | 0.7 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 282 | **6 (2%)** | 13.5 | 91.1 | 59% | 74% | 1.5 |
| 혈위대 함정 `s6_battle_ambush` | battle | 276 | 0 | 4.2 | 96.0 | 9% | 7% | 5.4 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 143 | 0 | 4.6 | 91.7 | 6% | 4% | 1.5 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 80 | 0 | 5.7 | 91.3 | 9% | 7% | 1.8 |
| 교세 순찰 `s6_battle_patrol` | battle | 141 | 0 | 3.8 | 94.6 | 3% | 2% | 2.2 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 168 | 0 | 4.0 | 94.5 | 5% | 3% | 1.8 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 205 | 0 | 5.2 | 92.9 | 7% | 4% | 2.3 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 93 | 0 | 5.8 | 91.8 | 14% | 9% | 2.3 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 68 | 0 | 8.2 | 93.5 | 11% | 18% | 3.3 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 204 | 0 | 5.6 | 93.1 | 8% | 7% | 2.8 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 276 | **19 (7%)** | 14.0 | 97.4 | 48% | 70% | 4.3 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 213 | 0 | 5.5 | 93.5 | 12% | 8% | 1.9 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 156 | 0 | 5.3 | 93.4 | 10% | 7% | 2.0 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 141 | 0 | 4.9 | 95.0 | 7% | 4% | 1.9 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 162 | **3 (2%)** | 6.5 | 89.3 | 8% | 7% | 2.5 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 177 | 0 | 5.4 | 91.8 | 6% | 3% | 1.7 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 139 | 0 | 4.4 | 97.5 | 7% | 4% | 1.6 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 112 | 0 | 6.1 | 92.0 | 11% | 7% | 2.2 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 107 | **1 (1%)** | 7.0 | 90.3 | 15% | 12% | 2.7 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 87 | 0 | 8.9 | 94.9 | 29% | 17% | 3.4 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 107 | 0 | 7.9 | 95.0 | 20% | 9% | 3.9 |
| 낙안봉 `s7_boss_blood_hand` | boss | 253 | **18 (7%)** | 21.8 | 99.8 | 51% | 44% | 4.8 |
| 화살 비 `s8_battle_arrow_rain` | battle | 111 | 0 | 6.4 | 92.7 | 18% | 10% | 1.2 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 48 | 0 | 7.3 | 90.7 | 13% | 6% | 0.6 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 154 | 0 | 5.1 | 99.3 | 13% | 9% | 2.0 |
| 호법의 굽이 `s8_battle_guardians` | battle | 75 | 0 | 5.1 | 91.2 | 5% | 3% | 1.0 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 148 | 0 | 4.3 | 93.2 | 6% | 3% | 1.0 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 163 | 0 | 4.3 | 97.9 | 6% | 5% | 1.1 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 76 | 0 | 8.3 | 95.7 | 14% | 5% | 2.5 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 117 | 0 | 6.4 | 100.3 | 16% | 7% | 2.9 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 92 | 0 | 6.8 | 96.9 | 12% | 7% | 1.9 |
| 혈전 `s8_boss_blood_hall` | boss | 235 | **11 (5%)** | 19.3 | 102.5 | 63% | 92% | 5.4 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 51 | 0 | 8.5 | 105.9 | 22% | 10% | 1.9 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 28 | 0 | 6.1 | 105.7 | 8% | 5% | 0.6 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 188 | 0 | 4.0 | 103.0 | 11% | 6% | 1.4 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 17 | 0 | 4.9 | 105.5 | 23% | 3% | 1.8 |
| 그림자 망령 `s9_battle_wraiths` | battle | 204 | **9 (4%)** | 9.5 | 103.3 | 33% | 32% | 3.2 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 89 | 0 | 6.1 | 105.4 | 9% | 10% | 1.0 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 95 | 0 | 5.4 | 105.4 | 19% | 7% | 1.3 |
| 틈의 심장 `s9_boss_mordecai` | boss | 215 | **34 (16%)** | 15.0 | 99.8 | 31% | 39% | 0.8 |

