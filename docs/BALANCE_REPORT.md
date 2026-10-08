# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 31.8초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **168/300 (56%)**
- 평균 덱 49.2장 · 평균 상흔 22.7

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 |
|---|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 |
| 은빛 숲 (s1) | 300 | 299 | 100% | 1 | 100% | 9.2 |
| 화산 협곡 (s2) | 299 | 299 | 100% | 0 | 100% | 27.1 |
| 아르덴 (s3) | 299 | 299 | 100% | 0 | 100% | 30.2 |
| 카즈둠 (s4) | 299 | 294 | 98% | 5 | 100% | 32.0 |
| 노크투르나 (s5) | 294 | 291 | 99% | 3 | 100% | 33.9 |
| 운곡촌 (s6) | 291 | 285 | 98% | 6 | 100% | 37.0 |
| 낙안봉 (s7) | 285 | 267 | 94% | 18 | 100% | 43.6 |
| 천마봉 (s8) | 267 | 233 | 87% | 34 | 100% | 45.4 |
| 세계의 틈 (s9) | 233 | 168 | 72% | 65 | 100% | 48.7 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 131 | 0 | 4.2 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 57 | 0 | 2.8 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 18% | 18% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 56 | 0 | 5.9 | 67.9 | 14% | 3% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 35 | 0 | 4.4 | 68.9 | 7% | 2% | 0.3 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 124 | 0 | 4.2 | 68.9 | 10% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 255 | 0 | 5.4 | 68.6 | 11% | 2% | 0.1 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 96 | 0 | 3.9 | 69.2 | 12% | 7% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 39 | 0 | 3.6 | 68.8 | 6% | 2% | 0.4 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 67 | 0 | 8.4 | 67.9 | 28% | 8% | 0.3 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 81 | 0 | 5.0 | 69.1 | 13% | 6% | 0.2 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 104 | 0 | 4.9 | 69.2 | 7% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | **1 (0%)** | 12.9 | 69.9 | 54% | 42% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 242 | 0 | 3.2 | 69.1 | 5% | 2% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 224 | 0 | 3.8 | 69.4 | 7% | 2% | 0.3 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 174 | 0 | 3.5 | 66.5 | 4% | 1% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 74 | 0 | 5.1 | 65.5 | 12% | 6% | 0.3 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 79 | 0 | 5.2 | 66.3 | 13% | 5% | 0.2 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 149 | 0 | 3.4 | 66.9 | 4% | 2% | 0.3 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 63 | 0 | 4.2 | 68.4 | 7% | 1% | 0.2 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 104 | 0 | 6.5 | 68.2 | 15% | 10% | 0.3 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 126 | 0 | 5.7 | 65.6 | 10% | 6% | 0.3 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 299 | 0 | 11.9 | 69.8 | 49% | 39% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 186 | 0 | 3.4 | 69.1 | 5% | 2% | 0.8 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 89 | 0 | 4.0 | 62.9 | 6% | 3% | 0.6 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 278 | 0 | 2.7 | 69.5 | 3% | 1% | 0.8 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 87 | 0 | 5.7 | 60.8 | 13% | 6% | 0.7 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 61 | 0 | 5.2 | 58.1 | 11% | 3% | 0.6 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 233 | 0 | 5.0 | 65.9 | 9% | 3% | 0.8 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 127 | 0 | 6.0 | 65.4 | 15% | 9% | 0.6 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 299 | 0 | 6.0 | 66.3 | 17% | 12% | 0.6 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 51 | 0 | 6.5 | 68.0 | 16% | 2% | 0.6 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 299 | 0 | 8.7 | 68.7 | 32% | 19% | 0.8 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 130 | 0 | 2.4 | 67.4 | 3% | 1% | 0.6 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 143 | 0 | 3.5 | 65.8 | 4% | 2% | 0.7 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 289 | 0 | 3.4 | 67.6 | 6% | 3% | 0.7 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 76 | 0 | 4.1 | 66.6 | 12% | 5% | 0.5 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 156 | 0 | 8.5 | 68.6 | 23% | 17% | 0.5 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 134 | 0 | 3.1 | 65.9 | 8% | 2% | 0.7 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 22 | 0 | 5.7 | 68.5 | 23% | 8% | 0.9 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 45 | 0 | 4.1 | 67.1 | 9% | 2% | 0.6 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 108 | 0 | 4.7 | 67.3 | 9% | 10% | 0.7 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 299 | **5 (2%)** | 9.8 | 69.7 | 44% | 36% | 0.5 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 155 | 0 | 4.9 | 65.4 | 11% | 3% | 1.3 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 90 | 0 | 2.4 | 67.4 | 2% | 0% | 0.7 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 179 | 0 | 8.2 | 64.9 | 20% | 3% | 1.4 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 141 | 0 | 3.1 | 67.3 | 5% | 2% | 0.9 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 61 | 0 | 3.5 | 66.3 | 6% | 1% | 1.3 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 126 | 0 | 3.2 | 64.5 | 4% | 2% | 0.9 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 129 | 0 | 2.7 | 64.1 | 4% | 1% | 1.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 190 | 0 | 6.5 | 67.6 | 20% | 14% | 1.2 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 143 | 0 | 6.0 | 65.5 | 11% | 3% | 1.1 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 73 | 0 | 4.7 | 65.6 | 7% | 3% | 1.2 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 294 | 0 | 1.8 | 70.0 | 1% | 0% | 0.7 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 294 | **3 (1%)** | 11.2 | 69.7 | 55% | 51% | 2.1 |
| 혈위대 함정 `s6_battle_ambush` | battle | 291 | 0 | 3.3 | 70.0 | 7% | 3% | 3.2 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 142 | 0 | 3.6 | 67.2 | 5% | 2% | 1.0 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 82 | 0 | 4.4 | 66.2 | 8% | 3% | 1.3 |
| 교세 순찰 `s6_battle_patrol` | battle | 146 | 0 | 2.9 | 68.8 | 2% | 1% | 0.9 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 170 | 0 | 3.2 | 68.3 | 4% | 2% | 1.2 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 203 | 0 | 4.0 | 67.7 | 6% | 3% | 1.2 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 92 | 0 | 4.7 | 66.5 | 11% | 5% | 1.1 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 69 | 0 | 6.2 | 68.3 | 9% | 12% | 3.3 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 205 | 0 | 4.4 | 68.1 | 7% | 3% | 1.9 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 291 | **6 (2%)** | 11.1 | 69.6 | 40% | 38% | 4.1 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 226 | 0 | 4.1 | 68.0 | 10% | 3% | 1.1 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 163 | 0 | 4.0 | 67.4 | 9% | 4% | 0.9 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 148 | 0 | 3.9 | 67.3 | 7% | 2% | 1.4 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 162 | 0 | 5.1 | 64.2 | 6% | 2% | 1.7 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 199 | 0 | 4.3 | 65.9 | 6% | 2% | 0.9 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 153 | 0 | 3.7 | 68.7 | 6% | 1% | 1.1 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 137 | 0 | 4.7 | 66.5 | 9% | 3% | 1.2 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 112 | 0 | 5.9 | 62.9 | 12% | 5% | 1.4 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 101 | 0 | 7.1 | 67.2 | 27% | 11% | 2.9 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 109 | 0 | 6.3 | 67.2 | 16% | 4% | 2.4 |
| 낙안봉 `s7_boss_blood_hand` | boss | 285 | **18 (6%)** | 17.1 | 69.0 | 47% | 26% | 4.8 |
| 화살 비 `s8_battle_arrow_rain` | battle | 115 | 0 | 5.1 | 65.2 | 18% | 6% | 0.7 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 55 | 0 | 5.8 | 63.3 | 14% | 4% | 0.5 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 157 | 0 | 4.3 | 68.4 | 13% | 5% | 0.6 |
| 호법의 굽이 `s8_battle_guardians` | battle | 91 | 0 | 4.0 | 63.7 | 5% | 1% | 0.9 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 161 | 0 | 3.9 | 65.2 | 7% | 2% | 0.6 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 180 | 0 | 3.5 | 67.2 | 6% | 3% | 0.6 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 87 | 0 | 7.0 | 66.0 | 12% | 3% | 2.1 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 128 | 0 | 5.1 | 68.9 | 15% | 5% | 2.5 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 97 | 0 | 5.9 | 66.5 | 13% | 3% | 1.0 |
| 혈전 `s8_boss_blood_hall` | boss | 267 | **34 (13%)** | 15.9 | 69.4 | 60% | 61% | 5.4 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 60 | 0 | 9.5 | 68.9 | 30% | 7% | 2.7 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 29 | 0 | 6.9 | 66.8 | 11% | 3% | 0.5 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 78 | 0 | 4.3 | 69.8 | 14% | 3% | 0.8 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 27 | 0 | 5.1 | 70.0 | 30% | 9% | 1.9 |
| 그림자 망령 `s9_battle_wraiths` | battle | 81 | 0 | 10.5 | 68.3 | 38% | 11% | 2.7 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 70 | **1 (1%)** | 31.5 | 70.0 | 67% | 59% | 1.2 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 62 | 0 | 5.5 | 69.4 | 28% | 8% | 1.2 |
| 틈의 심장 `s9_boss_mordecai` | boss | 232 | **64 (28%)** | 17.1 | 67.5 | 44% | 39% | 0.7 |

