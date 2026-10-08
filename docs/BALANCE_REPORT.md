# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 99.5초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **85/300 (28%)**
- 평균 덱 46.1장 · 평균 상흔 32.2

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 8.0 | 1.0 |
| 은빛 숲 (s1) | 300 | 300 | 100% | 0 | 100% | 9.3 | 2.0 |
| 화산 협곡 (s2) | 300 | 300 | 100% | 0 | 100% | 26.1 | 3.0 |
| 아르덴 (s3) | 300 | 300 | 100% | 0 | 100% | 28.4 | 4.2 |
| 카즈둠 (s4) | 300 | 300 | 100% | 0 | 100% | 29.8 | 5.7 |
| 노크투르나 (s5) | 300 | 300 | 100% | 0 | 100% | 31.5 | 6.3 |
| 운곡촌 (s6) | 300 | 300 | 100% | 0 | 100% | 33.4 | 7.3 |
| 낙안봉 (s7) | 300 | 300 | 100% | 0 | 100% | 39.5 | 8.1 |
| 천마봉 (s8) | 300 | 300 | 100% | 0 | 100% | 41.0 | 9.0 |
| 세계의 틈 (s9) | 300 | 85 | 28% | 215 | 100% | 43.4 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 206 | 0 | 3.9 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 94 | 0 | 2.6 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.1 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 70.0 | 16% | 16% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 99 | 0 | 5.0 | 75.3 | 9% | 2% | 0.0 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 134 | 0 | 3.6 | 76.0 | 7% | 2% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 195 | 0 | 4.9 | 75.4 | 8% | 2% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 153 | 0 | 3.4 | 75.8 | 8% | 5% | 0.0 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 43 | 0 | 8.0 | 74.6 | 24% | 6% | 0.0 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 174 | 0 | 4.2 | 76.1 | 6% | 4% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | 0 | 10.9 | 78.8 | 37% | 24% | 0.2 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 275 | 0 | 3.7 | 83.2 | 7% | 4% | 0.2 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 267 | 0 | 4.3 | 82.9 | 9% | 3% | 0.2 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 158 | 0 | 3.7 | 82.8 | 9% | 5% | 0.3 |
| 화로 사이 `s2_battle_forge_row` | battle | 51 | 0 | 5.7 | 80.6 | 22% | 15% | 0.2 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 63 | 0 | 5.8 | 82.8 | 15% | 9% | 0.3 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 153 | 0 | 3.7 | 80.8 | 8% | 4% | 0.2 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 83 | 0 | 4.7 | 83.3 | 8% | 2% | 0.1 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 146 | 0 | 6.9 | 83.3 | 22% | 15% | 0.2 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 102 | 0 | 5.5 | 81.8 | 16% | 13% | 0.2 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 300 | 0 | 10.0 | 87.5 | 37% | 34% | 0.2 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 224 | 0 | 3.1 | 92.7 | 5% | 3% | 0.7 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 74 | 0 | 3.6 | 91.3 | 6% | 5% | 0.6 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 314 | 0 | 2.2 | 92.3 | 2% | 1% | 0.7 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 36 | 0 | 5.2 | 91.9 | 12% | 10% | 0.6 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 209 | 0 | 4.5 | 93.1 | 9% | 4% | 0.7 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 94 | 0 | 5.2 | 92.8 | 13% | 11% | 0.6 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 300 | 0 | 5.3 | 92.5 | 11% | 10% | 0.7 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 59 | 0 | 5.9 | 93.1 | 17% | 5% | 0.7 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 300 | 0 | 7.3 | 96.1 | 25% | 17% | 0.7 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 156 | 0 | 2.0 | 102.2 | 1% | 0% | 0.7 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 104 | 0 | 2.7 | 102.4 | 2% | 2% | 0.8 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 265 | 0 | 2.8 | 101.8 | 3% | 2% | 0.7 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 35 | 0 | 3.4 | 104.1 | 7% | 2% | 0.7 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 185 | 0 | 6.5 | 101.6 | 12% | 13% | 0.5 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 104 | 0 | 2.7 | 102.6 | 4% | 1% | 0.7 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 28 | 0 | 4.2 | 103.8 | 10% | 2% | 0.6 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 63 | 0 | 2.9 | 102.7 | 4% | 2% | 0.7 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 136 | 0 | 4.3 | 103.2 | 7% | 12% | 0.6 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 300 | 0 | 7.5 | 103.9 | 21% | 23% | 0.8 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 144 | 0 | 3.4 | 107.1 | 4% | 1% | 1.2 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 100 | 0 | 2.0 | 107.2 | 2% | 2% | 0.8 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 173 | 0 | 5.4 | 107.5 | 10% | 0% | 1.6 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 147 | 0 | 2.3 | 107.4 | 2% | 1% | 1.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 68 | 0 | 2.6 | 107.4 | 2% | 0% | 0.9 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 100 | 0 | 2.5 | 107.2 | 2% | 1% | 0.8 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 174 | 0 | 2.1 | 107.7 | 1% | 1% | 0.9 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 240 | 0 | 4.8 | 107.1 | 11% | 14% | 1.4 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 95 | 0 | 4.0 | 107.8 | 4% | 2% | 1.5 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 61 | 0 | 3.1 | 108.1 | 2% | 1% | 0.9 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 300 | 0 | 1.6 | 105.0 | 0% | 0% | 0.7 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 300 | 0 | 7.8 | 109.2 | 22% | 26% | 2.6 |
| 혈위대 함정 `s6_battle_ambush` | battle | 300 | 0 | 2.3 | 110.3 | 1% | 0% | 4.0 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 154 | 0 | 2.1 | 112.5 | 1% | 0% | 2.2 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 63 | 0 | 2.2 | 113.8 | 1% | 0% | 2.1 |
| 교세 순찰 `s6_battle_patrol` | battle | 166 | 0 | 1.8 | 111.7 | 1% | 0% | 2.1 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 239 | 0 | 1.9 | 112.4 | 0% | 0% | 2.3 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 217 | 0 | 2.3 | 112.1 | 1% | 1% | 3.1 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 90 | 0 | 2.4 | 113.0 | 2% | 0% | 3.1 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 88 | 0 | 3.1 | 112.9 | 3% | 7% | 3.5 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 232 | 0 | 2.5 | 111.6 | 1% | 1% | 3.0 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 300 | 0 | 6.0 | 113.6 | 12% | 15% | 5.1 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 284 | 0 | 2.0 | 115.3 | 1% | 0% | 1.2 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 212 | 0 | 2.3 | 114.9 | 1% | 0% | 1.5 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 217 | 0 | 2.0 | 114.9 | 1% | 0% | 2.7 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 145 | 0 | 2.6 | 117.0 | 1% | 0% | 2.8 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 165 | 0 | 2.2 | 116.6 | 1% | 0% | 2.4 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 199 | 0 | 1.9 | 114.6 | 0% | 0% | 2.2 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 169 | 0 | 2.4 | 115.7 | 2% | 0% | 1.6 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 91 | 0 | 2.8 | 117.4 | 2% | 1% | 2.7 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 108 | 0 | 3.5 | 115.5 | 6% | 1% | 4.0 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 101 | 0 | 2.8 | 115.1 | 3% | 0% | 4.1 |
| 낙안봉 `s7_boss_blood_hand` | boss | 300 | 0 | 5.1 | 117.8 | 5% | 2% | 5.5 |
| 화살 비 `s8_battle_arrow_rain` | battle | 119 | 0 | 2.5 | 119.3 | 2% | 0% | 1.5 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 56 | 0 | 2.8 | 119.0 | 2% | 1% | 1.1 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 135 | 0 | 2.3 | 118.3 | 1% | 0% | 1.1 |
| 호법의 굽이 `s8_battle_guardians` | battle | 79 | 0 | 1.9 | 119.3 | 1% | 0% | 1.3 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 150 | 0 | 1.8 | 119.4 | 0% | 0% | 1.3 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 219 | 0 | 1.8 | 118.6 | 1% | 0% | 1.4 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 108 | 0 | 3.5 | 119.5 | 2% | 0% | 2.2 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 164 | 0 | 2.7 | 118.4 | 2% | 1% | 2.8 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 121 | 0 | 2.7 | 118.8 | 2% | 1% | 2.0 |
| 혈전 `s8_boss_blood_hall` | boss | 300 | 0 | 6.5 | 120.2 | 13% | 18% | 4.1 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 71 | 0 | 2.9 | 122.6 | 2% | 0% | 2.5 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 35 | 0 | 1.6 | 123.3 | 0% | 0% | 1.2 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 247 | 0 | 1.8 | 123.0 | 0% | 0% | 1.6 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 25 | 0 | 2.1 | 123.5 | 1% | 0% | 1.3 |
| 그림자 망령 `s9_battle_wraiths` | battle | 267 | 0 | 3.0 | 122.8 | 3% | 0% | 2.9 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 121 | **7 (6%)** | 6.7 | 122.2 | 3% | 4% | 1.3 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 122 | 0 | 2.1 | 122.7 | 1% | 0% | 1.7 |
| 틈의 심장 `s9_boss_mordecai` | boss | 293 | **208 (71%)** | 49.8 | 123.3 | 71% | 101% | 0.1 |

