// `npm run data:check` — data/ 폴더의 스키마와 상호 참조를 검사한다.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/engine/data';
import { fastFaceChanges } from '../src/engine/scene';
import { playableStages } from '../src/engine/run';
import { BATTLE_OPS, RUN_OPS, type Effect } from '../src/engine/schema';

const data = loadGameData();
const battleOps = new Set<string>(BATTLE_OPS);
const runOps = new Set<string>(RUN_OPS);
const specIds = new Set(
  readdirSync(new URL('../specs/assets/', import.meta.url))
    .filter((f) => f.endsWith('.yaml') && !f.startsWith('_'))
    .map((f) => f.replace(/\.yaml$/, '')),
);
/** 명세 id → type(장면 일러스트 검사용) */
const specTypes = new Map(
  [...specIds].map((id) => {
    const text = readFileSync(new URL(`../specs/assets/${id}.yaml`, import.meta.url), 'utf8');
    return [id, text.match(/^type:\s*(\S+)/m)?.[1] ?? ''] as const;
  }),
);

function checkEffects(label: string, effects: Effect[], allowed: Set<string>): string[] {
  const errors: string[] = [];
  for (const e of effects) {
    if (!allowed.has(e.op)) errors.push(`${label}: 이 자리에서 쓸 수 없는 동작 ${e.op}`);
    if (e.status && !data.statuses.has(e.status)) errors.push(`${label}: 알 수 없는 상태 ${e.status}`);
    if (e.condition?.targetHasStatus && !data.statuses.has(e.condition.targetHasStatus)) {
      errors.push(`${label}: 조건의 알 수 없는 상태 ${e.condition.targetHasStatus}`);
    }
    if (e.card && !data.cards.has(e.card)) errors.push(`${label}: 알 수 없는 카드 ${e.card}`);
    if (e.op === 'summon' && !(e.enemy && data.enemies.has(e.enemy))) errors.push(`${label}: summon의 알 수 없는 적 ${e.enemy}`);
    if (e.member && !data.characters.has(e.member)) errors.push(`${label}: 알 수 없는 캐릭터 ${e.member}`);
    if (e.op === 'apply_status' && !e.status) errors.push(`${label}: apply_status에 status 없음`);
    if (e.scale?.status && !data.statuses.has(e.scale.status)) errors.push(`${label}: 비례의 알 수 없는 상태 ${e.scale.status}`);
    if ((e.scale?.per === 'targetStatus' || e.scale?.per === 'selfStatus') && !e.scale.status) errors.push(`${label}: ${e.scale.per}에 status 없음`);
  }
  return errors;
}

describe('데이터 검사', () => {
  it('스키마를 통과한다(로드 성공)', () => {
    expect(data.cards.size).toBeGreaterThan(0);
  });

  it('카드: 전투 동작만, 주인·상태·카드 참조가 유효하다', () => {
    const errors: string[] = [];
    for (const c of data.cards.values()) {
      if (c.owner !== 'status' && c.owner !== 'common' && !data.characters.has(c.owner)) errors.push(`${c.id}: 알 수 없는 주인 ${c.owner}`);
      errors.push(...checkEffects(c.id, c.effects, battleOps));
      if (c.upgrade) for (const sk of [c.upgrade.plus4, c.upgrade.plus5]) errors.push(...checkEffects(`${c.id} ${sk.name}`, sk.effects, battleOps));
      const fusion = c.keywords.includes('fusion');
      const both = c.cost.neigong > 0 && c.cost.mana > 0;
      if (fusion !== both) errors.push(`${c.id}: 융합 키워드와 비용(내공+마나)이 맞지 않는다`);
      if (fusion && c.owner !== 'haun') errors.push(`${c.id}: 융합(내공+마나 동시 소모)은 하운 전용이다`);
      if (fusion && !c.effects.some((e) => e.op === 'rift' && (e.amount ?? 0) > 0)) errors.push(`${c.id}: 융합 카드는 균열을 올려야 한다`);
    }
    expect(errors).toEqual([]);
  });

  it('상태 발동(파워): 발동 효과는 전투 동작만 쓰고, 파워 카드는 소멸하며 자신에게 발동 상태를 건다', () => {
    const errors: string[] = [];
    for (const st of data.statuses.values()) for (const t of st.triggers) errors.push(...checkEffects(`상태 ${st.id}`, t.effects, battleOps));
    for (const c of data.cards.values()) {
      if (c.type !== 'power') continue;
      if (!c.keywords.includes('exhaust')) errors.push(`${c.id}: 파워 카드는 소멸(exhaust)`);
      if (c.target !== 'self') errors.push(`${c.id}: 파워 카드의 대상은 self`);
    }
    expect(errors).toEqual([]);
  });

  it('아키타입(9-2): 싸우는 동료는 아키타입 2개, 카드 태그는 주인의 것(공용은 아무 동료의 것), 아키타입마다 보유할 수 있는 카드 4장 이상', () => {
    const errors: string[] = [];
    const all = new Map<string, string>();
    for (const ch of data.characters.values()) {
      if (ch.role !== 'fighter') continue;
      if (ch.archetypes.length !== 2) errors.push(`${ch.id}: 아키타입 ${ch.archetypes.length}개(2개여야 한다)`);
      for (const a of ch.archetypes) all.set(a.id, ch.id);
    }
    const count = new Map<string, number>();
    for (const c of data.cards.values()) {
      for (const t of c.tags) {
        const owner = all.get(t);
        if (!owner) errors.push(`${c.id}: 알 수 없는 아키타입 ${t}`);
        else if (c.owner !== 'common' && c.owner !== owner) errors.push(`${c.id}: ${t}는 ${owner}의 아키타입`);
        if (c.owner === owner && (c.pool === 'starter' || c.pool === 'reward')) count.set(t, (count.get(t) ?? 0) + 1);
      }
    }
    for (const [t] of all) if ((count.get(t) ?? 0) < 4) errors.push(`${t}: 시작·보상 카드 ${count.get(t) ?? 0}장(4장 이상)`);
    expect(errors).toEqual([]);
  });

  it('보유·편성(9-1): 싸우는 동료와 공용의 시작 카드가 편성 칸보다 많고, 필수 카드는 이야기로만 얻는다', () => {
    const errors: string[] = [];
    const starters = (owner: string) => [...data.cards.values()].filter((c) => c.pool === 'starter' && (data.characters.has(c.owner) ? c.owner : 'common') === owner);
    for (const ch of data.characters.values()) {
      if (ch.role !== 'fighter') continue;
      const n = starters(ch.id).length;
      if (n < data.balance.loadout.perCharacter) errors.push(`${ch.id}: 시작 카드 ${n}장 < 편성 ${data.balance.loadout.perCharacter}장`);
    }
    const common = starters('common').length;
    if (common < data.balance.loadout.common) errors.push(`공용: 시작 카드 ${common}장 < 편성 ${data.balance.loadout.common}장`);
    for (const c of data.cards.values()) if (c.essential && c.pool !== 'story') errors.push(`${c.id}: 필수 카드는 이야기 카드여야 한다`);
    expect(errors).toEqual([]);
  });

  it('적: 행동 효과가 유효하다', () => {
    const errors: string[] = [];
    for (const en of data.enemies.values()) {
      for (const m of en.moves) errors.push(...checkEffects(`${en.id}.${m.id}`, m.effects, battleOps));
      for (const t of en.traits) if (!data.statuses.has(t.status)) errors.push(`${en.id}: 알 수 없는 특성 ${t.status}`);
      if (en.transform) {
        if (!data.enemies.has(en.transform.into)) errors.push(`${en.id}: 변신 대상 없음 ${en.transform.into}`);
        else if (data.enemies.get(en.transform.into)!.transform) errors.push(`${en.id}: 변신한 모습이 다시 변신한다`);
        errors.push(...checkEffects(`${en.id}.transform`, en.transform.partyEffects, battleOps));
      }
    }
    expect(errors).toEqual([]);
  });

  it('스테이지·모듈: 고정 노드와 보스, 적, 선택지가 유효하다', () => {
    const errors: string[] = [];
    for (const st of data.stages) {
      if (st.endingScene && !data.scenes.has(st.endingScene)) errors.push(`${st.id}: 없는 엔딩 장면 ${st.endingScene}`);
      if (st.playable && !st.boss) errors.push(`${st.id}: 플레이 가능한 스테이지에 보스가 없다`);
      if (st.boss && data.modules.get(st.boss)?.type !== 'boss') errors.push(`${st.id}: 보스 모듈 ${st.boss}이(가) boss 유형이 아니다`);
      for (const p of st.pinned) {
        const m = data.modules.get(p.module);
        if (!m) errors.push(`${st.id}: 없는 고정 모듈 ${p.module}`);
        else if (m.stage !== st.id) errors.push(`${p.module}: 다른 스테이지 모듈`);
        if (p.floor > st.floors) errors.push(`${p.module}: 층 범위 밖`);
      }
    }
    for (const m of data.modules.values()) {
      if (!data.stages.some((s) => s.id === m.stage)) errors.push(`${m.id}: 알 수 없는 스테이지 ${m.stage}`);
      const battle = ['battle', 'elite', 'boss'].includes(m.type);
      if (battle && !m.content.enemies?.length) errors.push(`${m.id}: 전투 모듈에 적이 없다`);
      if (!battle && m.type !== 'shop' && !m.content.choices?.length) errors.push(`${m.id}: 선택지가 없다`);
      for (const id of m.content.enemies ?? []) if (!data.enemies.has(id)) errors.push(`${m.id}: 없는 적 ${id}`);
      for (const [i, c] of (m.content.choices ?? []).entries()) errors.push(...checkEffects(`${m.id}#${i}`, c.effects, runOps));
      if (m.content.bonus) errors.push(...checkEffects(`${m.id}.bonus`, m.content.bonus.effects, battleOps));
      if (m.content.clearEffects) {
        if (!['battle', 'elite', 'boss'].includes(m.type)) errors.push(`${m.id}: clearEffects는 전투형 모듈만`);
        errors.push(...checkEffects(`${m.id}.clearEffects`, m.content.clearEffects, runOps));
      }
    }
    expect(errors).toEqual([]);
  });

  it('지원 규칙: 휴식 선택지는 런 동작, 나머지는 전투 동작만 쓴다', () => {
    const errors: string[] = [];
    for (const r of data.support) {
      errors.push(...checkEffects(r.id, r.effects, r.trigger === 'restOption' ? runOps : battleOps));
      if (!data.characters.has(r.source)) errors.push(`${r.id}: 알 수 없는 출처 ${r.source}`);
    }
    expect(errors).toEqual([]);
  });

  it('스프라이트: 캐릭터·적이 참조하는 에셋은 명세가 있다', () => {
    const missing: string[] = [];
    for (const ch of data.characters.values()) {
      for (const id of Object.values(ch.sprites)) if (id !== 'wang_portrait' && !specIds.has(id)) missing.push(`${ch.id}: ${id}`);
    }
    for (const en of data.enemies.values()) {
      if (en.sprite && !specIds.has(`${en.sprite}_idle`)) missing.push(`${en.id}: ${en.sprite}_idle`);
    }
    for (const c of data.cards.values()) {
      if (c.fx && !specIds.has(c.fx)) missing.push(`${c.id}: fx ${c.fx}`);
      if (c.hitFx && !specIds.has(c.hitFx)) missing.push(`${c.id}: hitFx ${c.hitFx}`);
    }
    for (const en of data.enemies.values()) if (en.hitFx && !specIds.has(en.hitFx)) missing.push(`${en.id}: hitFx ${en.hitFx}`);
    for (const st of data.stages) {
      for (const id of [st.background, st.mapArt]) if (id && !specIds.has(id)) missing.push(`${st.id}: ${id}`);
    }
    for (const m of data.modules.values()) {
      if (m.content.background && !specIds.has(m.content.background)) missing.push(`${m.id}: ${m.content.background}`);
    }
    expect(missing).toEqual([]);
  });

  it('화면 그림: 플레이 가능한 스테이지는 전투 배경·지역 지도·여정 띠 자리가 있고, 상태 아이콘 번호는 겹치지 않는다', () => {
    const bad: string[] = [];
    for (const st of playableStages(data)) {
      if (!st.background) bad.push(`${st.id}: background 없음`);
      if (!st.mapArt) bad.push(`${st.id}: mapArt 없음`);
      if (!st.journey) bad.push(`${st.id}: journey 없음`);
      // 정보 공개 원칙(GAME_DESIGN 14절): 지도에는 줄거리(summary) 대신 도착했을 때 아는 만큼의 도입 글
      if (!st.teaser) bad.push(`${st.id}: teaser 없음`);
      if (st.journey?.unknownLabel && !st.journey.knownFlag) bad.push(`${st.id}: unknownLabel에는 knownFlag가 필요`);
    }
    const icons = [...data.statuses.values()].map((s) => s.icon).filter((n) => n !== undefined);
    if (new Set(icons).size !== icons.length) bad.push('상태 아이콘 번호 중복');
    expect(bad).toEqual([]);
  });

  it('카드 등급(9-1): 시작 카드는 일반·고급, 영웅·전설은 대사(castLine)가 있고 화자가 캐릭터다', () => {
    const bad: string[] = [];
    for (const c of data.cards.values()) {
      if (c.pool === 'starter' && c.rarity !== 'common' && c.rarity !== 'uncommon') bad.push(`${c.id}: 시작 카드는 일반·고급`);
      if ((c.rarity === 'epic' || c.rarity === 'legendary') && !c.castLine) bad.push(`${c.id}: 영웅·전설은 castLine 필요`);
      if (c.castLine && !data.characters.has(c.castLine.speaker)) bad.push(`${c.id}: castLine 화자 ${c.castLine.speaker}`);
    }
    expect(bad).toEqual([]);
  });

  it('카드 강화: 상태 카드 외 모두 강화가 있고, growth는 효과 수와 같으며 수치 있는 효과만 오른다', () => {
    const bad: string[] = [];
    for (const c of data.cards.values()) {
      if (c.type === 'status') {
        if (c.upgrade) bad.push(`${c.id}: 상태 카드는 강화 없음`);
        continue;
      }
      if (!c.upgrade) {
        bad.push(`${c.id}: 강화 없음`);
        continue;
      }
      const { growth } = c.upgrade;
      if (growth.length !== c.effects.length) bad.push(`${c.id}: growth ${growth.length}개 ≠ 효과 ${c.effects.length}개`);
      growth.forEach((g, i) => {
        const e = c.effects[i];
        if (g && e && e.amount === undefined && e.stacks === undefined) bad.push(`${c.id}: ${i}번 효과는 수치가 없다`);
      });
      if (!growth.some((g) => g > 0)) bad.push(`${c.id}: +1~+3에 오르는 수치가 없다`);
    }
    expect(bad).toEqual([]);
  });

  it('장면: 모듈이 부르는 장면이 있고, 화자는 캐릭터·speakers이며 반신 그림 명세(<화자>_stand)가 있다', () => {
    const bad: string[] = [];
    for (const m of data.modules.values()) {
      for (const id of [m.content.scene, m.content.outroScene]) if (id && !data.scenes.has(id)) bad.push(`${m.id}: 없는 장면 ${id}`);
    }
    const speakers = new Set<string>();
    for (const sc of data.scenes.values()) for (const l of sc.lines) if (l.speaker) speakers.add(l.speaker);
    for (const c of data.cards.values()) if (c.castLine) speakers.add(c.castLine.speaker);
    for (const sp of speakers) {
      if (!data.characters.has(sp) && !data.speakers.has(sp)) bad.push(`화자 ${sp}: characters·speakers에 없음`);
      if (!specIds.has(`${sp}_stand`)) bad.push(`화자 ${sp}: 반신 그림 명세 ${sp}_stand 없음`);
    }
    expect(bad).toEqual([]);
  });

  it('장면 일러스트: cg는 story-cg 명세가 있는 에셋이다("none"은 걷기)', () => {
    const bad: string[] = [];
    for (const sc of data.scenes.values()) {
      for (const l of sc.lines) {
        if (!l.cg || l.cg === 'none') continue;
        const spec = specTypes.get(l.cg);
        if (spec !== 'story-cg') bad.push(`${sc.id}: cg ${l.cg}(${spec ?? '명세 없음'})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('장면 배경: background는 전투 배경·장면 일러스트·화면 그림 명세가 있는 에셋이다', () => {
    const ok = new Set(['background', 'story-cg', 'key-art']);
    const bad = [...data.scenes.values()].filter((sc) => sc.background && !ok.has(specTypes.get(sc.background) ?? '')).map((sc) => `${sc.id}: ${sc.background}`);
    expect(bad).toEqual([]);
  });

  it('장면 표정: 한 인물의 표정은 바뀐 뒤 3줄 안에 다시 바뀌지 않는다(표정이 확확 바뀌지 않게)', () => {
    const bad = [...data.scenes.values()].flatMap((sc) => fastFaceChanges(sc));
    expect(bad).toEqual([]);
  });

  it('balance: 세계별 마나·균열 규칙이 모든 세계에 정의돼 있다', () => {
    for (const w of ['murim', 'elheim', 'nocturna', 'rift'] as const) {
      expect(data.balance.mana.worlds[w]).toBeDefined();
      expect(data.balance.rift.decay[w]).toBeDefined();
    }
    expect(data.cards.has(data.balance.rift.echoCard)).toBe(true);
  });
});
