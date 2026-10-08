# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 29.9초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **174/300 (58%)**
- 평균 덱 49.2장 · 평균 상흔 22.8

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 |
|---|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 |
| 은빛 숲 (s1) | 300 | 300 | 100% | 0 | 100% | 9.2 |
| 화산 협곡 (s2) | 300 | 300 | 100% | 0 | 100% | 27.1 |
| 아르덴 (s3) | 300 | 300 | 100% | 0 | 100% | 30.3 |
| 카즈둠 (s4) | 300 | 294 | 98% | 6 | 100% | 32.1 |
| 노크투르나 (s5) | 294 | 292 | 99% | 2 | 100% | 34.0 |
| 운곡촌 (s6) | 292 | 286 | 98% | 6 | 100% | 37.0 |
| 낙안봉 (s7) | 286 | 270 | 94% | 16 | 100% | 43.6 |
| 천마봉 (s8) | 270 | 232 | 86% | 38 | 100% | 45.4 |
| 세계의 틈 (s9) | 232 | 174 | 75% | 58 | 100% | 48.7 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 131 | 0 | 4.2 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 57 | 0 | 2.8 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 3.0 | 70.0 | 9% | 9% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 56 | 0 | 5.1 | 68.9 | 9% | 2% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 35 | 0 | 3.9 | 69.6 | 4% | 1% | 0.5 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 124 | 0 | 3.7 | 69.4 | 6% | 1% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 255 | 0 | 4.5 | 69.2 | 6% | 1% | 0.1 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 96 | 0 | 3.4 | 69.5 | 9% | 6% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 39 | 0 | 3.1 | 69.7 | 4% | 1% | 0.2 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 66 | 0 | 7.0 | 68.8 | 18% | 5% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 82 | 0 | 4.0 | 69.7 | 9% | 3% | 0.3 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 105 | 0 | 3.4 | 69.3 | 3% | 1% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | 0 | 11.3 | 69.9 | 41% | 30% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 243 | 0 | 2.7 | 69.4 | 4% | 1% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 225 | 0 | 3.1 | 69.7 | 4% | 1% | 0.3 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 173 | 0 | 3.3 | 67.8 | 4% | 1% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 73 | 0 | 4.9 | 67.1 | 12% | 5% | 0.3 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 80 | 0 | 4.3 | 66.3 | 9% | 3% | 0.3 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 151 | 0 | 3.2 | 66.9 | 3% | 1% | 0.2 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 63 | 0 | 3.5 | 69.0 | 4% | 1% | 0.2 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 104 | 0 | 6.0 | 68.7 | 14% | 8% | 0.3 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 126 | 0 | 5.7 | 66.7 | 10% | 6% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 300 | 0 | 12.0 | 69.9 | 50% | 39% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 187 | 0 | 3.4 | 69.0 | 5% | 2% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 88 | 0 | 3.9 | 63.9 | 6% | 3% | 0.8 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 278 | 0 | 2.7 | 69.5 | 2% | 1% | 0.9 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 88 | 0 | 5.5 | 60.9 | 12% | 5% | 0.6 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 63 | 0 | 5.2 | 57.3 | 11% | 3% | 0.5 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 235 | 0 | 5.0 | 65.8 | 9% | 2% | 0.6 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 128 | 0 | 5.9 | 65.5 | 15% | 10% | 0.6 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 300 | 0 | 5.9 | 66.4 | 16% | 12% | 0.7 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 51 | 0 | 6.4 | 68.2 | 17% | 3% | 0.8 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 300 | 0 | 8.7 | 68.8 | 32% | 19% | 0.8 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 131 | 0 | 2.0 | 68.5 | 2% | 1% | 0.6 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 142 | 0 | 3.2 | 68.0 | 4% | 1% | 0.7 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 290 | 0 | 3.4 | 68.7 | 6% | 3% | 0.7 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 76 | 0 | 4.1 | 68.3 | 11% | 6% | 0.5 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 158 | 0 | 5.9 | 69.1 | 9% | 5% | 0.5 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 135 | 0 | 3.1 | 67.4 | 8% | 1% | 0.7 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 22 | 0 | 5.4 | 69.4 | 23% | 7% | 0.9 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 44 | 0 | 3.3 | 68.0 | 5% | 2% | 0.5 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 110 | 0 | 4.5 | 68.4 | 9% | 10% | 0.7 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 300 | **6 (2%)** | 9.8 | 69.9 | 44% | 36% | 0.5 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 159 | 0 | 4.2 | 65.6 | 6% | 2% | 1.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 90 | 0 | 2.4 | 67.4 | 2% | 1% | 0.7 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 178 | 0 | 8.1 | 65.3 | 21% | 3% | 1.5 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 146 | 0 | 3.0 | 67.4 | 5% | 2% | 0.8 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 60 | 0 | 3.0 | 66.5 | 4% | 1% | 1.1 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 121 | 0 | 3.3 | 64.5 | 4% | 2% | 0.9 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 128 | 0 | 2.7 | 64.9 | 4% | 2% | 1.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 189 | 0 | 6.4 | 68.2 | 20% | 15% | 1.3 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 138 | 0 | 5.8 | 66.0 | 10% | 2% | 1.2 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 76 | 0 | 4.3 | 65.1 | 7% | 3% | 1.3 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 294 | 0 | 1.8 | 70.0 | 1% | 0% | 0.6 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 294 | **2 (1%)** | 11.3 | 69.6 | 55% | 49% | 2.2 |
| 혈위대 함정 `s6_battle_ambush` | battle | 292 | 0 | 3.3 | 70.0 | 7% | 3% | 3.5 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 143 | 0 | 3.6 | 67.2 | 5% | 2% | 1.0 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 81 | 0 | 4.4 | 66.4 | 8% | 4% | 1.1 |
| 교세 순찰 `s6_battle_patrol` | battle | 145 | 0 | 2.9 | 68.6 | 3% | 1% | 0.7 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 169 | 0 | 3.3 | 68.5 | 4% | 2% | 1.0 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 205 | 0 | 3.9 | 67.3 | 6% | 3% | 1.2 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 93 | 0 | 4.4 | 66.8 | 9% | 4% | 1.3 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 72 | 0 | 6.3 | 67.6 | 9% | 11% | 3.3 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 203 | 0 | 4.5 | 68.2 | 7% | 3% | 2.2 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 292 | **6 (2%)** | 10.9 | 69.7 | 40% | 39% | 4.1 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 222 | 0 | 4.2 | 67.8 | 10% | 4% | 1.2 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 172 | 0 | 3.9 | 67.5 | 9% | 4% | 1.0 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 149 | 0 | 4.0 | 67.4 | 7% | 2% | 1.2 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 162 | 0 | 5.0 | 64.8 | 6% | 2% | 1.6 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 198 | 0 | 4.2 | 65.0 | 6% | 1% | 0.9 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 152 | 0 | 3.7 | 69.0 | 6% | 1% | 1.1 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 136 | 0 | 4.7 | 65.8 | 9% | 4% | 1.3 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 113 | **1 (1%)** | 5.8 | 64.9 | 12% | 4% | 1.6 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 103 | **1 (1%)** | 7.1 | 66.9 | 28% | 11% | 2.9 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 108 | 0 | 6.5 | 67.3 | 17% | 4% | 2.3 |
| 낙안봉 `s7_boss_blood_hand` | boss | 284 | **14 (5%)** | 16.9 | 69.5 | 46% | 25% | 4.8 |
| 화살 비 `s8_battle_arrow_rain` | battle | 117 | 0 | 4.9 | 64.9 | 17% | 5% | 0.7 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 59 | 0 | 5.6 | 63.0 | 12% | 3% | 0.6 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 153 | 0 | 4.4 | 69.0 | 13% | 5% | 1.0 |
| 호법의 굽이 `s8_battle_guardians` | battle | 96 | 0 | 4.0 | 62.8 | 6% | 2% | 0.9 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 162 | 0 | 3.7 | 65.3 | 7% | 2% | 0.6 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 182 | 0 | 3.6 | 67.1 | 6% | 2% | 0.5 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 84 | 0 | 6.9 | 66.4 | 13% | 5% | 2.0 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 133 | 0 | 5.2 | 68.9 | 16% | 5% | 2.0 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 99 | 0 | 5.7 | 66.1 | 11% | 3% | 1.0 |
| 혈전 `s8_boss_blood_hall` | boss | 270 | **38 (14%)** | 16.1 | 69.5 | 60% | 62% | 5.6 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 57 | 0 | 10.0 | 69.0 | 31% | 6% | 1.8 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 24 | 0 | 6.8 | 67.5 | 10% | 2% | 1.0 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 81 | 0 | 4.2 | 70.0 | 14% | 3% | 0.7 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 27 | 0 | 5.0 | 70.0 | 31% | 9% | 1.7 |
| 그림자 망령 `s9_battle_wraiths` | battle | 81 | 0 | 10.6 | 69.1 | 39% | 11% | 2.5 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 70 | **1 (1%)** | 31.3 | 69.9 | 65% | 54% | 0.9 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 65 | 0 | 5.6 | 69.2 | 27% | 6% | 1.5 |
| 틈의 심장 `s9_boss_mordecai` | boss | 231 | **57 (25%)** | 16.6 | 67.7 | 42% | 37% | 0.7 |

