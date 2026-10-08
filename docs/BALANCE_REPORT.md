# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 29.3초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **139/300 (46%)**
- 평균 덱 47.7장 · 평균 상흔 20.3

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 |
|---|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 |
| 은빛 숲 (s1) | 300 | 297 | 99% | 3 | 100% | 9.2 |
| 화산 협곡 (s2) | 297 | 274 | 92% | 23 | 100% | 27.1 |
| 아르덴 (s3) | 274 | 273 | 100% | 1 | 100% | 30.4 |
| 카즈둠 (s4) | 273 | 268 | 98% | 5 | 100% | 32.1 |
| 노크투르나 (s5) | 268 | 261 | 97% | 7 | 100% | 34.0 |
| 운곡촌 (s6) | 261 | 256 | 98% | 5 | 100% | 37.1 |
| 낙안봉 (s7) | 256 | 243 | 95% | 13 | 100% | 43.8 |
| 천마봉 (s8) | 243 | 222 | 91% | 21 | 100% | 45.8 |
| 세계의 틈 (s9) | 222 | 139 | 63% | 83 | 100% | 49.0 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 131 | 0 | 4.1 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 57 | 0 | 2.7 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 18% | 18% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 64 | 0 | 5.6 | 68.0 | 12% | 2% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 38 | 0 | 4.1 | 68.4 | 6% | 1% | 0.4 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 131 | 0 | 3.9 | 68.8 | 9% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 250 | 0 | 5.0 | 68.4 | 10% | 2% | 0.1 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 105 | 0 | 3.7 | 69.4 | 11% | 6% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 45 | 0 | 3.2 | 69.8 | 4% | 1% | 0.4 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 55 | 0 | 8.3 | 68.6 | 28% | 5% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 108 | 0 | 4.5 | 69.2 | 13% | 6% | 0.3 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 107 | 0 | 4.5 | 69.1 | 7% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | **3 (1%)** | 12.2 | 69.9 | 50% | 41% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 247 | 0 | 4.0 | 67.4 | 10% | 4% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 228 | 0 | 4.9 | 68.9 | 13% | 5% | 0.1 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 184 | **3 (2%)** | 4.2 | 58.2 | 14% | 10% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 77 | **1 (1%)** | 6.2 | 57.1 | 32% | 22% | 0.4 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 87 | **1 (1%)** | 6.3 | 57.6 | 22% | 12% | 0.2 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 176 | **1 (1%)** | 4.3 | 60.3 | 12% | 8% | 0.3 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 65 | 0 | 5.3 | 67.1 | 11% | 4% | 0.2 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 107 | 0 | 8.0 | 66.0 | 33% | 21% | 0.2 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 113 | **1 (1%)** | 6.6 | 58.3 | 25% | 18% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 290 | **16 (6%)** | 12.1 | 63.1 | 58% | 52% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 171 | 0 | 3.5 | 68.7 | 7% | 2% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 91 | 0 | 4.2 | 62.0 | 7% | 3% | 0.8 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 256 | 0 | 2.7 | 69.5 | 3% | 1% | 0.6 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 83 | 0 | 6.3 | 59.4 | 17% | 7% | 0.4 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 59 | 0 | 5.5 | 55.9 | 13% | 5% | 0.7 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 224 | 0 | 5.4 | 64.8 | 13% | 4% | 0.5 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 104 | 0 | 6.0 | 65.0 | 18% | 12% | 0.7 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 274 | 0 | 6.2 | 65.2 | 19% | 15% | 0.6 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 52 | 0 | 7.3 | 67.8 | 23% | 5% | 0.6 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 274 | **1 (0%)** | 9.2 | 67.0 | 39% | 26% | 0.5 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 116 | 0 | 2.2 | 67.1 | 2% | 1% | 0.6 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 134 | 0 | 3.2 | 65.9 | 4% | 2% | 0.6 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 280 | 0 | 3.2 | 67.6 | 6% | 2% | 0.6 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 76 | 0 | 3.8 | 66.0 | 11% | 5% | 0.6 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 144 | 0 | 7.8 | 68.4 | 20% | 14% | 0.4 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 129 | 0 | 3.1 | 65.9 | 8% | 1% | 0.8 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 21 | 0 | 5.2 | 68.9 | 22% | 5% | 0.8 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 47 | 0 | 3.6 | 67.2 | 7% | 4% | 0.8 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 105 | 0 | 5.0 | 67.4 | 12% | 13% | 0.7 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 273 | **5 (2%)** | 9.5 | 69.8 | 43% | 36% | 0.4 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 153 | 0 | 4.6 | 63.7 | 11% | 3% | 1.2 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 80 | 0 | 2.9 | 66.1 | 8% | 4% | 0.9 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 173 | 0 | 7.9 | 62.4 | 19% | 3% | 1.4 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 131 | 0 | 3.2 | 65.4 | 6% | 3% | 0.7 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 52 | 0 | 3.6 | 65.5 | 5% | 1% | 1.1 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 120 | 0 | 3.5 | 61.9 | 5% | 3% | 0.9 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 120 | 0 | 2.9 | 61.6 | 3% | 2% | 0.6 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 181 | 0 | 6.5 | 66.6 | 23% | 17% | 1.2 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 136 | 0 | 5.8 | 64.4 | 13% | 4% | 1.2 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 73 | 0 | 4.1 | 64.2 | 6% | 3% | 1.6 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 268 | 0 | 1.7 | 70.0 | 1% | 0% | 0.5 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 268 | **7 (3%)** | 10.7 | 68.5 | 52% | 47% | 1.9 |
| 혈위대 함정 `s6_battle_ambush` | battle | 261 | 0 | 3.2 | 70.0 | 7% | 3% | 3.0 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 143 | 0 | 3.7 | 67.1 | 4% | 2% | 1.1 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 88 | 0 | 4.4 | 66.1 | 8% | 3% | 1.0 |
| 교세 순찰 `s6_battle_patrol` | battle | 132 | 0 | 2.8 | 68.9 | 2% | 1% | 0.7 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 155 | 0 | 3.2 | 68.3 | 4% | 2% | 0.9 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 200 | 0 | 3.9 | 67.7 | 5% | 2% | 1.1 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 102 | 0 | 4.5 | 65.6 | 10% | 3% | 1.3 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 74 | 0 | 6.0 | 68.3 | 8% | 11% | 2.5 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 206 | 0 | 4.2 | 67.7 | 7% | 4% | 1.9 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 261 | **5 (2%)** | 10.6 | 69.5 | 38% | 38% | 3.9 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 201 | 0 | 4.3 | 67.0 | 10% | 3% | 1.1 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 166 | 0 | 4.2 | 67.5 | 8% | 4% | 0.9 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 142 | 0 | 4.0 | 67.2 | 7% | 2% | 1.0 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 164 | 0 | 5.1 | 64.5 | 6% | 2% | 1.4 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 198 | **1 (1%)** | 4.1 | 64.9 | 6% | 3% | 1.2 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 150 | 0 | 3.6 | 68.8 | 6% | 1% | 1.1 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 117 | 0 | 4.9 | 65.6 | 10% | 3% | 1.1 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 122 | 0 | 5.6 | 65.1 | 11% | 5% | 1.8 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 91 | 0 | 7.0 | 67.8 | 26% | 9% | 2.6 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 108 | 0 | 6.0 | 67.6 | 16% | 4% | 2.5 |
| 낙안봉 `s7_boss_blood_hand` | boss | 255 | **12 (5%)** | 16.1 | 69.3 | 43% | 22% | 4.8 |
| 화살 비 `s8_battle_arrow_rain` | battle | 106 | 0 | 5.1 | 65.0 | 17% | 5% | 0.5 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 52 | 0 | 6.2 | 62.3 | 14% | 3% | 0.2 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 151 | 0 | 4.5 | 68.3 | 13% | 5% | 0.6 |
| 호법의 굽이 `s8_battle_guardians` | battle | 81 | 0 | 3.9 | 65.1 | 5% | 1% | 0.6 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 142 | 0 | 3.8 | 64.2 | 7% | 3% | 0.5 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 165 | 0 | 3.4 | 67.6 | 6% | 3% | 0.5 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 86 | 0 | 7.1 | 65.3 | 13% | 4% | 2.0 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 114 | 0 | 5.1 | 69.0 | 15% | 3% | 1.8 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 97 | 0 | 5.4 | 66.8 | 10% | 3% | 0.7 |
| 혈전 `s8_boss_blood_hall` | boss | 243 | **21 (9%)** | 16.2 | 69.3 | 57% | 56% | 5.4 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 56 | 0 | 9.1 | 69.4 | 29% | 6% | 2.3 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 29 | 0 | 6.6 | 67.3 | 12% | 5% | 0.6 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 186 | **4 (2%)** | 4.4 | 64.2 | 15% | 9% | 1.1 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 28 | 0 | 4.8 | 70.0 | 28% | 9% | 2.1 |
| 그림자 망령 `s9_battle_wraiths` | battle | 178 | **33 (19%)** | 10.3 | 66.5 | 42% | 35% | 2.2 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 67 | 0 | 28.4 | 70.0 | 61% | 52% | 0.9 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 57 | 0 | 5.4 | 69.9 | 27% | 7% | 1.4 |
| 틈의 심장 `s9_boss_mordecai` | boss | 185 | **46 (25%)** | 15.3 | 62.6 | 34% | 34% | 0.9 |

