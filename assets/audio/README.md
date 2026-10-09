# 소리 파일 자리(assets/audio)

배경음악 8곡 전부와 효과음 22개는 opengameart.org의 CC0 음원 파일이다(아래 '출처' 표). 파일이 없는 효과음 4개(`status`, `rift`, `down`, `transform`)는 브라우저에서 합성한 소리를 그대로 쓴다. 합성하는 코드는 `src/render/audio.ts`, 곡의 악보는 `src/render/music.ts`에 있다.
이 폴더에 아래 이름으로 파일을 넣으면, 그 곡이나 소리만 합성 대신 그 파일로 바뀐다. 다른 코드는 고치지 않아도 된다. 파일을 지우면 다시 합성 소리로 돌아간다.

- 파일 형식: `.ogg`, `.mp3`, `.wav`
- 배경음악은 반복해서 튼다. 끝과 처음이 자연스럽게 이어지게 자른다.
- 넣을 수 있는 음원: 직접 만든 것(예: 수노 AI), 또는 CC0·상업 이용 가능 라이선스.
- 라이선스·출처는 아래 '출처' 표에 적는다.

## 배경음악 — `assets/audio/bgm/<곡>.ogg`

| 곡 | 언제 |
|---|---|
| `title` | 시작 화면 · 도감 · 클리어 지도 · 패배 화면 |
| `murim` | 무림 스테이지 지도·장면(S0 청운산, S6~S8) |
| `elheim` | 엘하임 스테이지(S1~S4) |
| `nocturna` | 마왕성 노크투르나(S5) |
| `rift` | 세계의 틈(S9) |
| `battle` | 일반·정예 전투 |
| `boss` | 보스 전투 |
| `ending` | 엔딩 장면 · 엔딩 화면 |

## 효과음 — `assets/audio/sfx/<이름>.ogg`

| 이름 | 언제 |
|---|---|
| `click` | 버튼 |
| `card` | 카드를 낼 때 |
| `turn` | 새 턴 |
| `hit` | 피해 |
| `hit_heavy` | 큰 피해(15 이상) |
| `crit` | 치명타·처치 |
| `fire` | 화염 피해(덧소리) |
| `ice` | 냉기 피해(덧소리) |
| `block` | 방어를 얻거나 피해를 다 막음 |
| `heal` | 회복 |
| `status` | 상태가 붙음 |
| `rift` | 균열이 오름 |
| `surge` | 균열 폭주 |
| `relic` | 유물이 일함 |
| `potion` | 물약 |
| `coin` | 골드를 얻거나 상점에서 삼 |
| `down` | 쓰러짐 |
| `transform` | 보스 변신 |
| `cutin` | 컷인(필살기·합격기 연출) |
| `power` | 상시 효과(파워) 카드가 걸림 |
| `summon` | 적이 졸개를 부름 |
| `enrage` | 적이 격노함 |
| `discard` | 카드를 버림 |
| `levelup` | 레벨 업 |
| `victory` | 전투 승리 |
| `defeat` | 전투 패배 |

## 출처

모두 opengameart.org에서 받았고, 각 페이지의 License 칸이 CC0(퍼블릭 도메인)인 것만 골랐다. 2026-10-08(엔딩 곡·효과음 6개는 2026-10-09)에 확인했다. (freepd.com은 2025년에 문을 닫아 쓰지 못했다.)
받은 원본은 ffmpeg로 손질했다: 배경음악은 Vorbis 96kbps 스테레오, 통합 음량 −18 LUFS로 맞췄다. 효과음은 Vorbis 모노로, 앞뒤 무음을 자르고 끝을 짧게 페이드아웃한 뒤 최대 음량을 약 −3 dBFS(버튼 `click`은 −9 dBFS)로 맞췄다.

### 배경음악

| 파일 | 곡 · 지은이 | 출처 | 라이선스 |
|---|---|---|---|
| `bgm/title.ogg` | JRPG Theme [Loop Ready] · Juhani Junkala(SubspaceAudio) | https://opengameart.org/content/jrpg-trailer-theme | CC0 |
| `bgm/murim.ogg` | Hot Springs Town · Kistol | https://opengameart.org/content/hot-springs-town | CC0 |
| `bgm/elheim.ogg` | Forest Whisper Theme · Cleyton Kauffman | https://opengameart.org/content/forest-whisper-theme | CC0 |
| `bgm/nocturna.ogg` | Ancient Evil Awakens(JRPG Music Pack #3 [Evil]) · Juhani Junkala(SubspaceAudio) | https://opengameart.org/content/jrpg-pack-3-evil | CC0 |
| `bgm/rift.ogg` | Whispers From Beyond(JRPG Music Pack #3 [Evil]) · Juhani Junkala(SubspaceAudio) | https://opengameart.org/content/jrpg-pack-3-evil | CC0 |
| `bgm/battle.ogg` | Battle Theme A · cynicmusic | https://opengameart.org/content/battle-theme-a | CC0 — 앞 0.35초 페이드인과 끝 잔향을 잘라 반복이 끊기지 않게 했다 |
| `bgm/boss.ogg` | Epic Boss Battle [Seamlessly Looping] · Juhani Junkala(SubspaceAudio) | https://opengameart.org/content/boss-battle-music | CC0 |
| `bgm/ending.ogg` | Ending Scene(orchestral) · nene | https://opengameart.org/content/ending-scene | CC0 |

### 효과음

| 파일 | 원본 · 지은이 | 출처 | 라이선스 |
|---|---|---|---|
| `sfx/click.ogg` | click3.wav(UI SFX Set) · Kenney | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 |
| `sfx/card.ogg` | card-place-2.ogg(Casino Audio) · Kenney | https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips | CC0 |
| `sfx/turn.ogg` | card-fan-1.ogg(Casino Audio) · Kenney | https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips | CC0 |
| `sfx/hit.ogg` | qubodupPunch03 · qubodup | https://opengameart.org/content/punch | CC0 |
| `sfx/hit_heavy.ogg` | qubodupPunch02 · qubodup + bfh1_hit_02 · rubberduck(두 소리를 겹침) | https://opengameart.org/content/punch · https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 |
| `sfx/crit.ogg` | qubodupPunch05 + qubodupImpactMetal · qubodup(두 소리를 겹침) | https://opengameart.org/content/punch · https://opengameart.org/content/impact | CC0 |
| `sfx/block.ogg` | bfh1_metal_hit_02 · rubberduck | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx | CC0 |
| `sfx/fire.ogg` | Catching fire(flame) · themightyglider | https://opengameart.org/content/catching-fire | CC0 |
| `sfx/ice.ogg` | ice.wav(Ice spells) · bart | https://opengameart.org/content/ice-spells | CC0 |
| `sfx/heal.ogg` | health_restore.wav · Spring Spring(앞 2.2초) | https://opengameart.org/content/magic-words-healing-sound-effect | CC0 |
| `sfx/coin.ogg` | handleCoins.ogg(RPG sounds) · Kenney | https://opengameart.org/content/50-rpg-sound-effects | CC0 |
| `sfx/potion.ogg` | bottle.wav(RPG Sound Pack) · artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/surge.ogg` | Energy Drain(PowerDrain) · qubodup(앞 2.2초) | https://opengameart.org/content/energy-drain | CC0 |
| `sfx/levelup.ogg` | Level Up.mp3(7 Assorted Sound Effects) · Joth(앞 3.2초) | https://opengameart.org/content/7-assorted-sound-effects-menu-level-up | CC0 |
| `sfx/victory.ogg` | Medieval: Victory Theme · RandomMind(앞 3.2초, 끝 1초 페이드아웃 — 전투 뒤 장소 곡과 겹치지 않게) | https://opengameart.org/content/medieval-victory-theme | CC0 |
| `sfx/defeat.ogg` | Medieval: Defeat Theme · RandomMind(앞 8.6초) | https://opengameart.org/content/medieval-defeat-theme | CC0 |
| `sfx/cutin.ogg` | battle/sword-unsheathe.wav(RPG Sound Pack) · artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/power.ogg` | battle/magic1.wav(RPG Sound Pack) · artisticdude(−6 dBFS) | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/summon.ogg` | NPC/shade/shade5.wav(RPG Sound Pack) · artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/enrage.ogg` | NPC/gutteral beast/mnstr2.wav(RPG Sound Pack) · artisticdude | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/discard.ogg` | inventory/cloth.wav(RPG Sound Pack) · artisticdude(−6 dBFS) | https://opengameart.org/content/rpg-sound-pack | CC0 |
| `sfx/relic.ogg` | inventory/metal-ringing.wav(RPG Sound Pack) · artisticdude(−6 dBFS) | https://opengameart.org/content/rpg-sound-pack | CC0 |

합성 소리 그대로인 효과음: `status`, `rift`, `down`, `transform` — 짧고 자주 나거나(`status`, `rift`) 쓰러지는 몸·보스 변신에 맞는 CC0 소리를 찾지 못해 남겨 두었다.
