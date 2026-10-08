# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 500개(B0001~), 봇 `src/sim/bot.ts`. 계산 52.4초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **233/500 (47%)**
- 평균 덱 46.9장 · 평균 상흔 24.3

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 500 | 500 | 100% | 0 | 100% | 8.0 | 1.0 |
| 은빛 숲 (s1) | 500 | 498 | 100% | 2 | 100% | 9.4 | 2.0 |
| 화산 협곡 (s2) | 498 | 481 | 97% | 17 | 100% | 27.4 | 3.1 |
| 아르덴 (s3) | 481 | 478 | 99% | 3 | 100% | 30.6 | 4.4 |
| 카즈둠 (s4) | 478 | 473 | 99% | 5 | 100% | 32.3 | 5.8 |
| 노크투르나 (s5) | 473 | 423 | 89% | 50 | 100% | 34.3 | 6.5 |
| 운곡촌 (s6) | 423 | 381 | 90% | 42 | 100% | 37.3 | 7.5 |
| 낙안봉 (s7) | 381 | 344 | 90% | 37 | 100% | 43.9 | 8.2 |
| 천마봉 (s8) | 344 | 292 | 85% | 52 | 100% | 45.8 | 9.0 |
| 세계의 틈 (s9) | 292 | 233 | 80% | 59 | 100% | 49.3 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 344 | 0 | 4.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 156 | 0 | 2.7 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 500 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 500 | 0 | 5.0 | 70.0 | 17% | 17% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 94 | 0 | 5.8 | 70.7 | 12% | 3% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 68 | 0 | 4.3 | 72.7 | 6% | 2% | 0.1 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 161 | 0 | 4.0 | 72.2 | 9% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 358 | 0 | 5.2 | 72.1 | 9% | 2% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 193 | 0 | 3.8 | 72.0 | 11% | 7% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 75 | 0 | 3.5 | 73.1 | 6% | 2% | 0.2 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 105 | 0 | 8.3 | 71.3 | 27% | 5% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 199 | 0 | 4.7 | 73.6 | 12% | 6% | 0.2 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 276 | 0 | 4.8 | 73.4 | 7% | 5% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 500 | **2 (0%)** | 12.2 | 76.5 | 48% | 40% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 421 | 0 | 4.3 | 76.6 | 9% | 5% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 356 | 0 | 5.3 | 76.9 | 13% | 5% | 0.2 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 294 | 0 | 4.5 | 69.2 | 14% | 9% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 120 | **2 (2%)** | 6.5 | 66.8 | 30% | 23% | 0.2 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 132 | **1 (1%)** | 6.8 | 66.6 | 22% | 13% | 0.1 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 295 | 0 | 4.5 | 70.1 | 12% | 8% | 0.2 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 123 | 0 | 5.8 | 75.8 | 11% | 4% | 0.2 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 178 | 0 | 8.4 | 74.7 | 32% | 24% | 0.1 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 194 | 0 | 7.2 | 69.8 | 24% | 18% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 495 | **14 (3%)** | 13.0 | 75.2 | 54% | 54% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 321 | 0 | 3.9 | 82.8 | 8% | 3% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 166 | 0 | 4.7 | 75.4 | 9% | 5% | 0.7 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 423 | 0 | 3.0 | 83.4 | 4% | 2% | 0.6 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 134 | 0 | 7.0 | 71.7 | 19% | 12% | 0.7 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 104 | 0 | 6.3 | 67.9 | 17% | 9% | 0.6 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 389 | 0 | 5.8 | 77.6 | 14% | 5% | 0.5 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 174 | 0 | 6.9 | 79.2 | 20% | 15% | 0.7 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 481 | 0 | 6.8 | 79.4 | 20% | 19% | 0.6 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 64 | 0 | 8.1 | 81.5 | 26% | 7% | 0.5 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 481 | **3 (1%)** | 10.1 | 81.3 | 42% | 35% | 0.6 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 197 | 0 | 2.5 | 87.0 | 4% | 2% | 0.7 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 227 | 0 | 3.9 | 83.6 | 4% | 3% | 0.6 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 490 | 0 | 3.9 | 86.4 | 6% | 4% | 0.6 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 127 | 0 | 5.0 | 85.4 | 13% | 6% | 0.4 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 261 | 0 | 9.3 | 86.8 | 23% | 20% | 0.3 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 217 | 0 | 3.8 | 84.4 | 10% | 3% | 0.7 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 45 | 0 | 6.2 | 88.4 | 27% | 13% | 0.5 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 92 | 0 | 4.2 | 84.0 | 8% | 5% | 0.5 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 175 | 0 | 6.1 | 86.4 | 14% | 15% | 0.6 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 478 | **5 (1%)** | 10.9 | 89.9 | 44% | 46% | 0.5 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 264 | 0 | 6.0 | 83.3 | 14% | 6% | 1.2 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 157 | 0 | 3.6 | 88.4 | 8% | 7% | 0.9 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 319 | **6 (2%)** | 10.2 | 82.2 | 26% | 9% | 1.9 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 238 | 0 | 4.3 | 87.0 | 8% | 6% | 1.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 96 | 0 | 4.2 | 87.8 | 6% | 2% | 1.3 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 193 | 0 | 4.3 | 80.8 | 8% | 6% | 0.9 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 213 | 0 | 3.6 | 81.1 | 5% | 3% | 0.9 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 303 | **1 (0%)** | 8.3 | 89.6 | 29% | 26% | 1.2 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 204 | 0 | 7.6 | 84.0 | 17% | 8% | 1.3 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 115 | **1 (1%)** | 5.5 | 83.7 | 8% | 4% | 1.4 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 473 | 0 | 2.2 | 92.1 | 2% | 0% | 0.7 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 465 | **42 (9%)** | 13.5 | 90.7 | 62% | 81% | 1.6 |
| 혈위대 함정 `s6_battle_ambush` | battle | 423 | 0 | 4.2 | 95.9 | 10% | 8% | 5.3 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 223 | 0 | 4.5 | 91.8 | 6% | 4% | 1.6 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 122 | 0 | 5.7 | 90.7 | 10% | 6% | 1.9 |
| 교세 순찰 `s6_battle_patrol` | battle | 217 | 0 | 3.9 | 93.8 | 3% | 2% | 2.0 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 247 | 0 | 4.2 | 93.6 | 5% | 3% | 1.7 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 309 | 0 | 5.2 | 92.1 | 7% | 5% | 2.4 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 146 | 0 | 5.7 | 91.4 | 13% | 9% | 2.0 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 120 | 0 | 8.4 | 93.4 | 14% | 25% | 3.2 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 303 | 0 | 5.8 | 92.9 | 10% | 8% | 2.9 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 423 | **42 (10%)** | 13.8 | 96.9 | 55% | 81% | 4.2 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 305 | 0 | 5.4 | 93.6 | 12% | 7% | 1.9 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 260 | 0 | 5.2 | 94.7 | 10% | 6% | 2.1 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 229 | 0 | 4.7 | 94.3 | 7% | 3% | 2.0 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 244 | **1 (0%)** | 6.5 | 89.8 | 8% | 4% | 2.6 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 261 | 0 | 5.3 | 91.0 | 7% | 5% | 1.5 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 197 | 0 | 4.3 | 96.4 | 7% | 3% | 2.0 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 156 | 0 | 6.1 | 91.0 | 12% | 8% | 2.1 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 173 | **1 (1%)** | 7.1 | 90.3 | 15% | 11% | 2.7 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 127 | **1 (1%)** | 9.4 | 94.9 | 31% | 19% | 3.6 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 131 | 0 | 8.0 | 95.4 | 19% | 9% | 3.7 |
| 낙안봉 `s7_boss_blood_hand` | boss | 378 | **34 (9%)** | 21.4 | 98.9 | 51% | 42% | 4.9 |
| 화살 비 `s8_battle_arrow_rain` | battle | 154 | 0 | 6.1 | 93.9 | 18% | 10% | 1.5 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 66 | 0 | 7.3 | 92.0 | 14% | 7% | 0.7 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 209 | 0 | 5.0 | 98.7 | 13% | 8% | 2.0 |
| 호법의 굽이 `s8_battle_guardians` | battle | 116 | 0 | 4.9 | 91.9 | 5% | 3% | 1.4 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 208 | 0 | 4.5 | 94.1 | 6% | 3% | 0.8 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 245 | 0 | 4.3 | 97.8 | 7% | 4% | 1.2 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 128 | 0 | 8.7 | 94.9 | 14% | 7% | 2.0 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 172 | 0 | 6.5 | 100.6 | 17% | 8% | 2.7 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 136 | 0 | 6.6 | 96.4 | 13% | 8% | 2.0 |
| 혈전 `s8_boss_blood_hall` | boss | 344 | **52 (15%)** | 19.4 | 102.1 | 69% | 103% | 5.3 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 73 | 0 | 8.8 | 105.7 | 21% | 7% | 2.1 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 31 | 0 | 6.5 | 105.6 | 7% | 5% | 0.6 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 226 | 0 | 4.1 | 103.0 | 12% | 7% | 1.2 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 35 | 0 | 4.7 | 105.2 | 21% | 7% | 1.4 |
| 그림자 망령 `s9_battle_wraiths` | battle | 261 | **17 (7%)** | 9.5 | 103.1 | 36% | 37% | 3.0 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 128 | 0 | 6.2 | 105.3 | 8% | 11% | 0.8 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 122 | 0 | 5.5 | 105.5 | 20% | 7% | 1.3 |
| 틈의 심장 `s9_boss_mordecai` | boss | 275 | **42 (15%)** | 14.5 | 99.9 | 31% | 40% | 1.0 |

