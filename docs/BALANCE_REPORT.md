# 밸런스 보고서 — 자동 플레이 봇

`npm run balance`가 만든다(손으로 고치지 않는다). 시드 300개(B0001~), 봇 `src/sim/bot.ts`. 계산 110.4초.
봇은 한 수 앞만 보는 탐욕 봇이라 사람보다 약하다. 절대 승률보다 **스테이지·전투 사이의 상대적인 어려움**을 본다. 목표는 `docs/GAME_DESIGN.md` 12절.

## 요약

- 완주(에필로그까지): **81/300 (27%)**
- 평균 덱 44.5장 · 평균 상흔 20.5

## 스테이지별

| 스테이지 | 도달 | 통과 | 통과율 | 여기서 패배 | 들어설 때 하운 체력 | 들어설 때 덱 | 들어설 때 하운 레벨 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 청운산 (s0) | 300 | 300 | 100% | 0 | 100% | 16.0 | 1.0 |
| 은빛 숲 (s1) | 300 | 300 | 100% | 0 | 100% | 16.0 | 2.0 |
| 화산 협곡 (s2) | 300 | 300 | 100% | 0 | 100% | 40.0 | 3.0 |
| 아르덴 (s3) | 300 | 300 | 100% | 0 | 100% | 40.0 | 4.2 |
| 카즈둠 (s4) | 300 | 300 | 100% | 0 | 100% | 40.0 | 5.7 |
| 노크투르나 (s5) | 300 | 300 | 100% | 0 | 100% | 40.0 | 6.3 |
| 운곡촌 (s6) | 300 | 300 | 100% | 0 | 100% | 41.0 | 7.3 |
| 낙안봉 (s7) | 300 | 300 | 100% | 0 | 100% | 41.0 | 8.1 |
| 천마봉 (s8) | 300 | 300 | 100% | 0 | 100% | 41.0 | 9.0 |
| 세계의 틈 (s9) | 300 | 81 | 27% | 219 | 100% | 42.0 | 9.8 |

## 전투별

체력 손실은 출전 멤버 최대 체력 합 대비. 패배율이 높거나 손실이 큰 전투가 벽이다.

| 전투 | 유형 | 횟수 | 패배 | 평균 턴 | 시작 하운 체력 | 파티 체력 손실 | 하운 체력 손실 | 끝날 때 균열 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 도끼 잡아먹는 놈들 `s0_battle_axe_eaters` | battle | 206 | 0 | 4.0 | 70.0 | 0% | 0% | 0.0 |
| 밤의 철목인 `s0_battle_iron_dummy` | battle | 94 | 0 | 2.6 | 70.0 | 0% | 0% | 0.0 |
| 장작 패는 아이 `s0_tutorial_woodpile` | battle | 300 | 0 | 2.2 | 70.0 | 0% | 0% | 0.0 |
| 귀곡애(鬼哭崖) `s0_boss_ghost_cliff` | boss | 300 | 0 | 5.0 | 69.9 | 20% | 20% | 0.0 |
| 상단 호위 `s1_battle_caravan` | battle | 99 | 0 | 5.2 | 75.6 | 7% | 1% | 0.0 |
| 고블린 무리 소탕 `s1_battle_goblins` | battle | 134 | 0 | 4.2 | 76.1 | 5% | 1% | 0.0 |
| 그림자늑대 두 마리 `s1_battle_shadow_wolves` | battle | 195 | 0 | 5.1 | 75.7 | 7% | 1% | 0.0 |
| 늪지의 독두꺼비 `s1_battle_swamp_toads` | battle | 153 | 0 | 3.9 | 76.0 | 8% | 5% | 0.0 |
| 그림자늑대 무리 `s1_battle_wolf_pack` | battle | 43 | 0 | 7.5 | 75.6 | 21% | 4% | 0.0 |
| 옛 은광의 광석거미 `s1_elite_ore_spider` | elite | 174 | 0 | 4.8 | 76.4 | 4% | 3% | 0.0 |
| 실바렌 — 그림자 군단장 `s1_boss_veilak` | boss | 300 | 0 | 10.0 | 79.0 | 30% | 25% | 0.1 |
| 재 속의 순찰 `s2_battle_ash_patrol` | battle | 276 | 0 | 4.4 | 83.2 | 5% | 3% | 0.0 |
| 목줄 찬 늑대 `s2_battle_collared_wolves` | battle | 267 | 0 | 5.5 | 83.0 | 9% | 2% | 0.0 |
| 화로의 불씨 `s2_battle_fire_spirits` | battle | 159 | 0 | 4.1 | 83.2 | 8% | 6% | 0.0 |
| 화로 사이 `s2_battle_forge_row` | battle | 53 | 0 | 5.7 | 80.7 | 17% | 10% | 0.0 |
| 협곡 감시대 `s2_battle_forge_watch` | battle | 64 | 0 | 6.3 | 82.9 | 13% | 7% | 0.0 |
| 광석 수레 길 `s2_battle_ore_road` | battle | 152 | 0 | 4.1 | 82.0 | 7% | 4% | 0.0 |
| 도망자 사냥 `s2_battle_runaway_hunt` | battle | 84 | 0 | 5.5 | 83.8 | 7% | 2% | 0.0 |
| 사슬 감독관 `s2_elite_chain_overseer` | elite | 144 | 0 | 7.1 | 84.2 | 17% | 11% | 0.0 |
| 화로의 사슬 `s2_elite_furnace_chain` | elite | 100 | 0 | 6.0 | 83.1 | 10% | 8% | 0.0 |
| 큰 화로 — 화염군주 이그니스 `s2_boss_ignis` | boss | 300 | 0 | 8.5 | 88.0 | 26% | 26% | 0.0 |
| 얼어붙은 길목 `s3_battle_frozen_road` | battle | 224 | 0 | 4.5 | 93.1 | 5% | 3% | 0.0 |
| 얼음 기사 둘 `s3_battle_ice_knights` | battle | 73 | 0 | 4.9 | 93.1 | 6% | 4% | 0.0 |
| 얼음 늑대 `s3_battle_ice_wolves` | battle | 314 | 0 | 3.6 | 92.7 | 3% | 1% | 0.0 |
| 호수의 벽 `s3_battle_lake_wall` | battle | 36 | 0 | 6.9 | 93.6 | 13% | 12% | 0.0 |
| 눈보라의 무리 `s3_battle_wolf_storm` | battle | 208 | 0 | 6.1 | 93.4 | 10% | 3% | 0.0 |
| 얼음 궁전의 문지기 `s3_elite_gatekeeper` | elite | 94 | 0 | 6.9 | 92.7 | 14% | 11% | 0.0 |
| 남쪽 성문 `s3_elite_rowen_knights` | elite | 300 | 0 | 6.7 | 93.2 | 13% | 14% | 0.0 |
| 스무 마리의 늑대 `s3_elite_wolf_pack` | elite | 59 | 0 | 8.3 | 93.3 | 23% | 4% | 0.0 |
| 얼음 궁전의 탑 — 빙결의 여왕 셀리아스 `s3_boss_celias` | boss | 300 | 0 | 9.0 | 96.5 | 28% | 22% | 0.0 |
| 갱도의 빈 갑옷 `s4_battle_armor_tunnel` | battle | 156 | 0 | 2.6 | 102.8 | 1% | 1% | 0.0 |
| 골렘과 빈 갑옷 `s4_battle_golem_armor` | battle | 104 | 0 | 3.5 | 103.2 | 1% | 1% | 0.0 |
| 깨어난 바위 골렘 `s4_battle_golem_pair` | battle | 265 | 0 | 4.0 | 102.6 | 2% | 3% | 0.0 |
| 심장이 뛸 때마다 `s4_battle_heartbeat_guard` | battle | 35 | 0 | 5.2 | 104.7 | 7% | 4% | 0.0 |
| 금맥의 광석거미 `s4_battle_ore_spiders` | battle | 185 | 0 | 9.0 | 102.7 | 11% | 8% | 0.0 |
| 벽에서 솟은 손 `s4_battle_wall_hands` | battle | 104 | 0 | 3.7 | 103.8 | 5% | 1% | 0.0 |
| 오므라드는 동굴 `s4_elite_closing_cave` | elite | 28 | 0 | 4.9 | 104.1 | 10% | 4% | 0.0 |
| 묻히지 않은 갑옷들 `s4_elite_unburied` | elite | 63 | 0 | 4.0 | 103.5 | 3% | 2% | 0.0 |
| 용암 핏줄의 골렘 `s4_elite_vein_golem` | elite | 136 | 0 | 5.1 | 103.4 | 6% | 11% | 0.0 |
| 산의 심장 — 고르몬 `s4_boss_gormon` | boss | 300 | 0 | 8.4 | 104.2 | 20% | 23% | 0.0 |
| 회랑의 빈 갑옷 `s5_battle_armor_wolves` | battle | 144 | 0 | 4.6 | 108.4 | 4% | 1% | 0.0 |
| 첫째 회랑 — 불의 정령 `s5_battle_first_corridor` | battle | 100 | 0 | 2.7 | 108.3 | 2% | 2% | 0.0 |
| 넷째 회랑 — 그림자들 `s5_battle_fourth_corridor` | battle | 173 | 0 | 7.4 | 108.0 | 11% | 1% | 0.0 |
| 둘째 회랑 — 얼음 기사 `s5_battle_second_corridor` | battle | 147 | 0 | 3.5 | 108.1 | 2% | 2% | 0.0 |
| 하수로의 그림자늑대 `s5_battle_sewer_wolves` | battle | 68 | 0 | 3.8 | 108.3 | 2% | 0% | 0.0 |
| 여섯째 회랑의 잔당 `s5_battle_sixth_corridor` | battle | 100 | 0 | 3.2 | 108.3 | 1% | 1% | 0.0 |
| 셋째 회랑 — 바위 골렘 `s5_battle_third_corridor` | battle | 174 | 0 | 3.1 | 108.5 | 1% | 1% | 0.0 |
| 회랑의 수문장 `s5_elite_corridor_warden` | elite | 240 | 0 | 6.6 | 107.8 | 9% | 8% | 0.0 |
| 다섯째 회랑 `s5_elite_fifth_corridor` | elite | 95 | 0 | 5.4 | 108.9 | 4% | 1% | 0.0 |
| 일곱째 회랑의 쐐기 문 `s5_elite_seventh_door` | elite | 61 | 0 | 4.2 | 108.6 | 0% | 1% | 0.2 |
| 그림자의 밤 `s5_story_shadow_night` | elite | 300 | 0 | 2.4 | 105.4 | 0% | 0% | 0.0 |
| 왕좌의 방 — 마왕 바르가스 `s5_boss_vargas` | boss | 300 | 0 | 8.9 | 109.5 | 20% | 28% | 0.0 |
| 혈위대 함정 `s6_battle_ambush` | battle | 300 | 0 | 3.3 | 110.6 | 1% | 0% | 2.9 |
| 흑풍대 척후 `s6_battle_black_wind` | battle | 154 | 0 | 2.7 | 113.0 | 0% | 0% | 1.3 |
| 청운산 아래 `s6_battle_mountain_gate` | battle | 63 | 0 | 2.6 | 113.3 | 1% | 0% | 1.7 |
| 교세 순찰 `s6_battle_patrol` | battle | 166 | 0 | 2.4 | 111.7 | 0% | 0% | 1.5 |
| 교세 수레 길 `s6_battle_tax_cart` | battle | 239 | 0 | 2.5 | 112.5 | 0% | 0% | 1.6 |
| 마을을 벌주러 `s6_battle_village_raid` | battle | 217 | 0 | 3.0 | 112.5 | 0% | 0% | 2.5 |
| 벽을 넘는 자들 `s6_battle_wall_climb` | battle | 90 | 0 | 3.2 | 113.3 | 1% | 0% | 2.5 |
| 첫 토벌 `s6_elite_black_wind_captain` | elite | 88 | 0 | 4.3 | 113.1 | 1% | 4% | 2.5 |
| 혈위대 이백 `s6_elite_guard_two_hundred` | elite | 232 | 0 | 3.4 | 112.5 | 1% | 1% | 2.2 |
| 보름의 연무장 `s6_boss_full_moon` | boss | 300 | 0 | 7.0 | 114.1 | 8% | 12% | 2.7 |
| 흑풍대 잔당 `s7_battle_black_wind_remnant` | battle | 284 | 0 | 2.5 | 115.7 | 1% | 0% | 1.0 |
| 수실을 떼지 않은 자들 `s7_battle_holdouts` | battle | 212 | 0 | 2.7 | 115.3 | 1% | 0% | 1.5 |
| 진무관 초소 `s7_battle_jinmu_watch` | battle | 217 | 0 | 2.5 | 115.3 | 0% | 0% | 2.1 |
| 낙안봉 골짜기 `s7_battle_nakan_valley` | battle | 145 | 0 | 2.9 | 117.4 | 0% | 0% | 2.6 |
| 분타 외곽 초소 `s7_battle_outpost` | battle | 165 | 0 | 2.4 | 117.2 | 0% | 0% | 1.6 |
| 보급 수레 호위 `s7_battle_supply_cart` | battle | 199 | 0 | 2.3 | 115.3 | 0% | 0% | 1.9 |
| 탑림의 혈교도 `s7_battle_tower_cultists` | battle | 169 | 0 | 2.7 | 116.4 | 1% | 0% | 2.1 |
| 분타의 정예 `s7_elite_branch_guard` | elite | 91 | 0 | 2.8 | 117.7 | 1% | 1% | 2.5 |
| 탑림의 독수마군 `s7_elite_poison_hand` | elite | 108 | 0 | 4.3 | 116.1 | 4% | 1% | 3.1 |
| 혈마삼재진 `s7_elite_three_talents` | elite | 101 | 0 | 3.1 | 115.4 | 1% | 1% | 3.5 |
| 낙안봉 `s7_boss_blood_hand` | boss | 300 | 0 | 5.2 | 118.3 | 2% | 0% | 3.7 |
| 화살 비 `s8_battle_arrow_rain` | battle | 119 | 0 | 2.7 | 119.7 | 2% | 0% | 1.3 |
| 여덟째 굽이 `s8_battle_eighth_turn` | battle | 56 | 0 | 3.0 | 120.1 | 1% | 0% | 1.6 |
| 첫 굽이의 물결 `s8_battle_first_wave` | battle | 135 | 0 | 2.5 | 118.9 | 0% | 0% | 1.1 |
| 호법의 굽이 `s8_battle_guardians` | battle | 79 | 0 | 2.5 | 119.8 | 0% | 0% | 0.6 |
| 태극검진의 왼편 `s8_battle_taiji` | battle | 150 | 0 | 2.1 | 119.5 | 0% | 0% | 1.0 |
| 금강진의 오른편 `s8_battle_vajra` | battle | 219 | 0 | 2.1 | 119.1 | 0% | 0% | 1.1 |
| 장로와 궁수 `s8_elite_elder_archers` | elite | 108 | 0 | 3.7 | 119.7 | 1% | 0% | 1.8 |
| 여섯째 굽이의 장로 `s8_elite_elder_descends` | elite | 164 | 0 | 3.0 | 119.0 | 1% | 0% | 2.2 |
| 호법 셋의 진 `s8_elite_guardian_trio` | elite | 121 | 0 | 3.0 | 119.4 | 1% | 1% | 1.6 |
| 혈전 `s8_boss_blood_hall` | boss | 300 | 0 | 6.3 | 120.8 | 5% | 8% | 2.8 |
| 유리 탑의 잔해 `s9_battle_glass_tower` | battle | 72 | 0 | 3.2 | 123.4 | 1% | 0% | 1.4 |
| 거꾸로 매달린 숲 `s9_battle_hanging_forest` | battle | 36 | 0 | 2.0 | 123.7 | 0% | 0% | 0.7 |
| 불비늘 삼두견 `s9_battle_hounds` | battle | 249 | 0 | 2.1 | 123.5 | 0% | 0% | 0.6 |
| 일곱째 조각 `s9_battle_seventh_fragment` | battle | 25 | 0 | 2.7 | 124.0 | 1% | 0% | 1.2 |
| 그림자 망령 `s9_battle_wraiths` | battle | 272 | 0 | 3.4 | 123.2 | 3% | 0% | 1.5 |
| 뼈 거인 `s9_elite_bone_giant` | elite | 121 | **1 (1%)** | 4.0 | 122.7 | 0% | 0% | 0.5 |
| 굶주린 무리 `s9_elite_hungry_pack` | elite | 123 | 0 | 2.3 | 123.2 | 1% | 0% | 1.4 |
| 틈의 심장 `s9_boss_mordecai` | boss | 299 | **218 (73%)** | 49.4 | 123.7 | 63% | 87% | 0.0 |

