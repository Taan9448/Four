# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 59.8초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **137/300 (46%)**
- 평균 덱 47.3장 · 평균 상흔 24.6

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 | 1.0 |
| 은빛 숲 (s1) | 300 | 300 | 100% | 0 | 100% | 9.3 | 2.0 |
| 화산 협곡 (s2) | 300 | 287 | 96% | 13 | 100% | 27.4 | 3.1 |
| 아르덴 (s3) | 287 | 283 | 99% | 4 | 100% | 30.8 | 4.7 |
| 카즈둠 (s4) | 283 | 275 | 97% | 8 | 100% | 32.5 | 6.0 |
| 노크투르나 (s5) | 275 | 244 | 89% | 31 | 100% | 34.7 | 6.9 |
| 운곡촌 (s6) | 244 | 227 | 93% | 17 | 100% | 37.7 | 7.9 |
| 낙안봉 (s7) | 227 | 202 | 89% | 25 | 100% | 44.5 | 8.8 |
| 천마봉 (s8) | 202 | 180 | 89% | 22 | 100% | 46.4 | 9.4 |
| 세계의 틈 (s9) | 180 | 137 | 76% | 43 | 100% | 49.9 | 10.0 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 206 | 0 | 4.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 94 | 0 | 2.7 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 17% | 17% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 88 | 0 | 5.8 | 70.0 | 12% | 3% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 32 | 0 | 4.3 | 73.3 | 6% | 2% | 0.1 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 131 | 0 | 4.0 | 71.8 | 9% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 253 | 0 | 5.2 | 72.1 | 10% | 2% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 140 | 0 | 3.7 | 71.8 | 11% | 7% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 40 | 0 | 3.4 | 71.4 | 5% | 2% | 0.3 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 72 | 0 | 8.5 | 70.8 | 27% | 7% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 117 | 0 | 4.7 | 73.3 | 12% | 4% | 0.1 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 174 | 0 | 4.7 | 73.3 | 7% | 5% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | 0 | 12.4 | 77.1 | 48% | 40% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 275 | 0 | 4.3 | 76.3 | 9% | 4% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 267 | 0 | 5.4 | 77.2 | 13% | 4% | 0.2 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 208 | **1 (0%)** | 4.4 | 65.9 | 13% | 9% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 79 | 0 | 6.5 | 61.3 | 28% | 22% | 0.1 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 94 | **1 (1%)** | 6.7 | 65.2 | 19% | 12% | 0.2 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 211 | 0 | 4.5 | 65.8 | 11% | 8% | 0.2 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 84 | 0 | 5.8 | 74.5 | 11% | 3% | 0.2 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 144 | 0 | 8.5 | 74.8 | 31% | 23% | 0.2 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 122 | 0 | 7.0 | 67.5 | 22% | 18% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 298 | **11 (4%)** | 12.8 | 72.2 | 52% | 53% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 212 | 0 | 4.0 | 83.1 | 7% | 4% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 109 | 0 | 5.0 | 75.3 | 9% | 6% | 0.5 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 303 | 0 | 3.0 | 83.8 | 4% | 1% | 0.6 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 85 | 0 | 7.2 | 70.6 | 19% | 11% | 0.9 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 67 | 0 | 6.6 | 64.9 | 16% | 7% | 0.7 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 259 | 0 | 6.2 | 78.7 | 14% | 5% | 0.6 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 148 | 0 | 7.2 | 78.3 | 20% | 13% | 0.6 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 287 | 0 | 7.1 | 77.1 | 20% | 18% | 0.5 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 56 | 0 | 8.0 | 82.1 | 28% | 7% | 0.4 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 287 | **4 (1%)** | 10.4 | 81.5 | 42% | 38% | 0.6 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 146 | 0 | 2.6 | 86.1 | 3% | 1% | 0.7 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 143 | 0 | 4.1 | 82.6 | 5% | 3% | 0.4 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 317 | 0 | 4.0 | 84.6 | 6% | 4% | 0.6 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 86 | 0 | 5.1 | 84.9 | 15% | 9% | 0.7 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 181 | 0 | 9.7 | 86.1 | 24% | 22% | 0.3 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 143 | 0 | 4.0 | 82.8 | 11% | 4% | 0.5 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 34 | 0 | 6.7 | 87.4 | 25% | 7% | 0.4 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 61 | 0 | 4.5 | 85.1 | 8% | 5% | 0.4 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 134 | 0 | 6.6 | 85.1 | 14% | 14% | 0.8 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 283 | **8 (3%)** | 11.3 | 90.2 | 45% | 48% | 0.5 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 177 | 0 | 5.9 | 81.9 | 13% | 5% | 1.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 98 | 0 | 3.3 | 86.5 | 7% | 5% | 0.9 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 238 | **5 (2%)** | 10.1 | 78.8 | 24% | 10% | 1.9 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 139 | 0 | 4.0 | 83.6 | 7% | 4% | 0.8 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 60 | 0 | 4.4 | 85.0 | 7% | 2% | 1.3 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 133 | 0 | 4.3 | 77.6 | 6% | 5% | 0.9 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 145 | 0 | 3.6 | 80.0 | 5% | 3% | 0.8 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 195 | 0 | 8.0 | 89.8 | 29% | 27% | 1.0 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 111 | 0 | 7.6 | 82.7 | 16% | 7% | 1.2 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 77 | 0 | 5.3 | 80.4 | 9% | 5% | 1.4 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 275 | 0 | 2.1 | 93.6 | 2% | 0% | 0.7 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 270 | **26 (10%)** | 13.1 | 89.7 | 59% | 80% | 1.5 |
| 혈위대 함정 `s6_battle_ambush` | battle | 244 | 0 | 4.0 | 97.5 | 9% | 6% | 5.1 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 155 | 0 | 4.4 | 89.8 | 6% | 3% | 1.6 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 98 | 0 | 5.5 | 88.7 | 9% | 4% | 1.8 |
| 교세 순찰 `s6_battle_patrol` | battle | 137 | 0 | 3.6 | 95.6 | 3% | 2% | 2.1 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 191 | 0 | 4.3 | 92.7 | 5% | 4% | 1.5 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 209 | 0 | 4.9 | 92.6 | 7% | 4% | 2.6 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 87 | 0 | 5.6 | 89.6 | 12% | 7% | 1.8 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 74 | 0 | 8.5 | 94.2 | 14% | 23% | 2.7 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 204 | 0 | 5.7 | 93.4 | 9% | 9% | 2.8 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 244 | **17 (7%)** | 13.7 | 97.2 | 52% | 73% | 4.2 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 217 | **1 (0%)** | 5.3 | 95.3 | 11% | 7% | 1.9 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 160 | 0 | 5.2 | 97.0 | 9% | 6% | 1.8 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 161 | 0 | 4.7 | 96.7 | 7% | 3% | 2.0 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 168 | **2 (1%)** | 6.4 | 89.8 | 7% | 7% | 2.2 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 181 | 0 | 5.4 | 89.6 | 5% | 4% | 1.5 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 154 | 0 | 4.5 | 97.2 | 6% | 3% | 1.7 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 131 | 0 | 5.8 | 93.5 | 10% | 5% | 1.9 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 98 | 0 | 7.1 | 90.6 | 13% | 9% | 2.5 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 77 | 0 | 9.0 | 93.8 | 29% | 17% | 3.5 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 76 | 0 | 7.5 | 97.1 | 18% | 7% | 3.5 |
| 낙안봉 `s7_boss_blood_hand` | boss | 224 | **22 (10%)** | 21.9 | 100.0 | 49% | 42% | 4.7 |
| 화살 비 `s8_battle_arrow_rain` | battle | 89 | 0 | 6.1 | 93.7 | 16% | 9% | 1.3 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 41 | 0 | 7.0 | 90.6 | 13% | 6% | 0.7 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 126 | 0 | 5.2 | 99.6 | 12% | 9% | 1.7 |
| 호법의 굽이 `s8_battle_guardians` | battle | 79 | 0 | 5.1 | 93.7 | 6% | 2% | 1.1 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 125 | 0 | 4.5 | 93.2 | 6% | 3% | 0.7 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 169 | 0 | 4.1 | 98.7 | 6% | 4% | 1.4 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 72 | 0 | 9.0 | 96.1 | 12% | 5% | 2.0 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 115 | 0 | 6.2 | 102.8 | 18% | 10% | 2.5 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 90 | 0 | 6.4 | 96.5 | 11% | 6% | 1.7 |
| 혈전 `s8_boss_blood_hall` | boss | 202 | **22 (11%)** | 19.3 | 104.0 | 68% | 105% | 5.5 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 39 | 0 | 9.3 | 106.0 | 23% | 6% | 2.1 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 24 | 0 | 6.8 | 106.0 | 8% | 4% | 0.5 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 145 | 0 | 4.2 | 103.4 | 11% | 6% | 1.3 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 15 | 0 | 4.4 | 106.0 | 23% | 5% | 1.8 |
| 그림자 망령 `s9_battle_wraiths` | battle | 169 | **13 (8%)** | 9.4 | 103.7 | 34% | 35% | 3.0 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 71 | 0 | 6.5 | 105.9 | 8% | 10% | 0.8 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 77 | 0 | 5.5 | 106.0 | 20% | 8% | 1.6 |
| 틈의 심장 `s9_boss_mordecai` | boss | 167 | **30 (18%)** | 15.9 | 101.0 | 33% | 43% | 0.8 |

