# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 30.3초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **172/300 (57%)**
- 평균 덱 47.3장 · 평균 상흔 19.4

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 |
|---|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 |
| 은빛 숲 (s1) | 300 | 296 | 99% | 4 | 100% | 9.2 |
| 화산 협곡 (s2) | 296 | 267 | 90% | 29 | 100% | 27.1 |
| 아르덴 (s3) | 267 | 267 | 100% | 0 | 100% | 30.3 |
| 카즈둠 (s4) | 267 | 264 | 99% | 3 | 100% | 32.0 |
| 노크투르나 (s5) | 264 | 262 | 99% | 2 | 100% | 33.9 |
| 운곡촌 (s6) | 262 | 258 | 98% | 4 | 100% | 37.0 |
| 낙안봉 (s7) | 258 | 251 | 97% | 7 | 100% | 43.6 |
| 천마봉 (s8) | 251 | 235 | 94% | 16 | 100% | 45.4 |
| 세계의 틈 (s9) | 235 | 172 | 73% | 63 | 100% | 48.7 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 131 | 0 | 4.1 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 57 | 0 | 2.7 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 18% | 18% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 56 | 0 | 5.6 | 67.7 | 12% | 2% | 0.0 |
| 죽어 가는 숲 `s1_battle_dead_forest` | battle | 35 | 0 | 4.0 | 68.7 | 6% | 1% | 0.3 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 124 | 0 | 3.9 | 68.8 | 9% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 256 | 0 | 5.0 | 68.5 | 9% | 2% | 0.1 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 96 | 0 | 3.8 | 69.4 | 11% | 7% | 0.0 |
| 선봉의 빈 갑옷 `s1_battle_vanguard` | battle | 39 | 0 | 3.4 | 69.9 | 6% | 2% | 0.3 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 66 | 0 | 8.1 | 68.4 | 27% | 5% | 0.1 |
| 결계 밖의 창병들 `s1_elite_armor_ranks` | elite | 81 | 0 | 4.8 | 69.1 | 13% | 5% | 0.3 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 105 | 0 | 4.5 | 69.2 | 7% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | **4 (1%)** | 12.2 | 69.9 | 50% | 41% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 242 | 0 | 4.0 | 67.4 | 9% | 5% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 222 | 0 | 4.9 | 68.6 | 13% | 5% | 0.1 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 175 | **2 (1%)** | 4.1 | 58.6 | 14% | 10% | 0.2 |
| 화로 사이 `s2_battle_forge_row` | battle | 71 | **1 (1%)** | 6.4 | 57.8 | 33% | 23% | 0.3 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 80 | **1 (1%)** | 6.4 | 58.5 | 23% | 12% | 0.1 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 157 | 0 | 4.3 | 60.6 | 12% | 7% | 0.3 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 62 | 0 | 5.3 | 67.4 | 11% | 4% | 0.1 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 101 | 0 | 7.8 | 66.1 | 33% | 20% | 0.4 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 103 | 0 | 6.5 | 59.7 | 24% | 18% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 292 | **25 (9%)** | 11.8 | 63.8 | 61% | 57% | 0.1 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 169 | 0 | 3.1 | 69.2 | 4% | 2% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 82 | 0 | 3.6 | 64.0 | 5% | 3% | 0.4 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 246 | 0 | 2.4 | 69.7 | 2% | 1% | 0.5 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 79 | 0 | 5.3 | 62.5 | 12% | 4% | 0.5 |
| 얼음 궁전의 복도 `s3_battle_palace_hall` | battle | 58 | 0 | 5.1 | 58.5 | 10% | 3% | 0.4 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 202 | 0 | 4.6 | 66.4 | 9% | 2% | 0.7 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 113 | 0 | 5.4 | 64.9 | 13% | 8% | 0.4 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 267 | 0 | 5.4 | 66.9 | 14% | 11% | 0.7 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 47 | 0 | 6.0 | 68.4 | 16% | 2% | 0.7 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 267 | 0 | 8.5 | 68.9 | 33% | 21% | 0.5 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 109 | 0 | 2.1 | 67.6 | 2% | 1% | 0.6 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 125 | 0 | 3.4 | 66.3 | 4% | 2% | 0.5 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 270 | 0 | 3.2 | 67.8 | 6% | 2% | 0.6 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 67 | 0 | 3.9 | 66.4 | 10% | 4% | 0.8 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 141 | 0 | 8.0 | 68.4 | 21% | 15% | 0.3 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 119 | 0 | 3.0 | 66.2 | 8% | 1% | 0.7 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 19 | 0 | 5.1 | 67.9 | 24% | 4% | 1.2 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 39 | 0 | 3.6 | 67.7 | 7% | 4% | 0.5 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 94 | 0 | 5.0 | 67.4 | 12% | 12% | 0.8 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 267 | **3 (1%)** | 9.3 | 69.8 | 42% | 33% | 0.4 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 143 | 0 | 4.6 | 64.5 | 11% | 3% | 1.2 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 80 | 0 | 2.8 | 66.7 | 8% | 4% | 1.0 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 165 | **1 (1%)** | 7.6 | 62.8 | 18% | 4% | 1.2 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 128 | 0 | 2.5 | 65.2 | 4% | 2% | 0.8 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 52 | 0 | 3.3 | 64.8 | 6% | 1% | 1.2 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 111 | 0 | 3.4 | 61.9 | 6% | 3% | 0.8 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 114 | 0 | 2.7 | 62.3 | 4% | 1% | 0.6 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 167 | 0 | 6.5 | 66.7 | 22% | 18% | 1.3 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 125 | 0 | 5.4 | 64.8 | 12% | 4% | 1.1 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 66 | 0 | 4.0 | 64.5 | 6% | 3% | 1.5 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 264 | 0 | 1.7 | 70.0 | 1% | 0% | 0.5 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 263 | **1 (0%)** | 10.3 | 69.0 | 52% | 47% | 2.4 |
| 혈위대 함정 `s6_battle_ambush` | battle | 262 | 0 | 3.1 | 70.0 | 6% | 3% | 3.2 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 123 | 0 | 3.5 | 67.3 | 4% | 3% | 1.1 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 72 | 0 | 4.3 | 66.7 | 7% | 3% | 1.0 |
| 교세 순찰 `s6_battle_patrol` | battle | 134 | 0 | 2.7 | 68.8 | 2% | 1% | 0.7 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 152 | 0 | 3.2 | 68.7 | 4% | 1% | 1.0 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 185 | 0 | 3.8 | 67.6 | 5% | 2% | 1.0 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 85 | 0 | 4.5 | 66.2 | 10% | 4% | 1.1 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 65 | 0 | 6.1 | 68.3 | 9% | 11% | 2.7 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 183 | 0 | 4.1 | 67.7 | 7% | 4% | 2.0 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 262 | **4 (2%)** | 10.5 | 69.6 | 38% | 38% | 3.9 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 206 | 0 | 4.5 | 67.1 | 10% | 4% | 0.9 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 153 | 0 | 4.0 | 67.5 | 8% | 4% | 1.0 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 136 | 0 | 3.7 | 68.2 | 6% | 2% | 0.8 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 151 | **1 (1%)** | 5.1 | 64.1 | 6% | 3% | 1.5 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 179 | 0 | 4.1 | 65.6 | 5% | 2% | 1.1 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 139 | 0 | 3.5 | 68.8 | 6% | 2% | 0.8 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 124 | 0 | 4.5 | 65.6 | 9% | 4% | 1.0 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 99 | **1 (1%)** | 5.5 | 64.7 | 12% | 5% | 1.7 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 92 | 0 | 6.9 | 67.3 | 26% | 9% | 2.5 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 99 | 0 | 6.2 | 67.4 | 17% | 4% | 2.7 |
| 낙안봉 `s7_boss_blood_hand` | boss | 256 | **5 (2%)** | 15.8 | 69.5 | 43% | 22% | 4.6 |
| 화살 비 `s8_battle_arrow_rain` | battle | 109 | 0 | 4.6 | 64.5 | 15% | 5% | 0.6 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 58 | 0 | 5.4 | 61.1 | 13% | 3% | 0.4 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 157 | 0 | 4.1 | 68.0 | 12% | 5% | 0.8 |
| 호법의 굽이 `s8_battle_guardians` | battle | 82 | 0 | 3.9 | 63.8 | 6% | 1% | 0.3 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 146 | 0 | 3.7 | 63.9 | 7% | 2% | 0.5 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 168 | 0 | 3.4 | 67.2 | 6% | 3% | 0.5 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 83 | 0 | 7.0 | 66.0 | 14% | 5% | 1.3 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 121 | 0 | 5.2 | 68.7 | 16% | 4% | 1.6 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 89 | 0 | 5.6 | 65.9 | 11% | 4% | 0.8 |
| 혈전 `s8_boss_blood_hall` | boss | 251 | **16 (6%)** | 15.4 | 69.3 | 56% | 54% | 5.5 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 59 | 0 | 9.1 | 69.0 | 30% | 8% | 2.1 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 27 | 0 | 6.3 | 66.4 | 11% | 4% | 0.7 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 78 | 0 | 4.1 | 70.0 | 13% | 3% | 0.9 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 28 | 0 | 4.8 | 70.0 | 28% | 8% | 2.0 |
| 그림자 망령 `s9_battle_wraiths` | battle | 80 | 0 | 10.0 | 69.3 | 38% | 11% | 2.1 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 75 | **2 (3%)** | 27.5 | 69.9 | 57% | 50% | 0.7 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 64 | 0 | 5.7 | 69.2 | 29% | 10% | 1.3 |
| 틈의 심장 `s9_boss_mordecai` | boss | 233 | **61 (26%)** | 17.4 | 68.2 | 44% | 38% | 0.7 |

