// 「틈」의 그림·적·이펙트를 「천외귀환」에도(2026-11-27 사용자 요청 "틈에서 만든 스킬 이펙트나 몬스터, 아이콘 등 결·천외귀환 시나리오에도 등장하도록")
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { endTurn, playCard } from '../src/engine/battle';
import { createRunAt, splitMapBySurge } from '../src/engine/run';
import { battle, data, give } from './helpers';

const teumEnemies = [...data.enemies.values()].filter((e) => e.id.startsWith('teum_'));
const spec = (id: string) => existsSync(`specs/assets/${id}.yaml`);

describe('「틈」 몬스터가 「천외귀환」에', () => {
  it('틈 그림자 10 · 작은 진흙 · 둥지 · 구역 보스 8 — 모두 「틈」 그림(teum_*)과 「틈」 이펙트를 쓴다', () => {
    expect(teumEnemies.length).toBe(20);
    expect(teumEnemies.filter((e) => e.id.startsWith('teum_zb_')).length).toBe(8);
    for (const e of teumEnemies) {
      expect(e.sprite, e.id).toMatch(/^teum_/);
      expect(spec(`${e.sprite}_idle`), e.id).toBe(true);
      if (e.hitFx) expect(spec(e.hitFx), `${e.id} hitFx`).toBe(true);
      for (const m of e.moves) if (m.fx) expect(spec(m.fx), `${e.id}.${m.id}`).toBe(true);
    }
  });

  it('세계의 틈(S9)·노크투르나(S5) 전투에 나오고, 구역 보스는 엘리트다', () => {
    const where = (id: string) => [...data.modules.values()].filter((m) => m.content.enemies?.includes(id)).map((m) => m.stage);
    for (const e of teumEnemies.filter((x) => x.id.startsWith('teum_zb_'))) {
      expect(e.tier, e.id).toBe('elite');
      expect(where(e.id).length, e.id).toBeGreaterThan(0);
    }
    expect(where('teum_zb_dream_queen')).toContain('s5');
    expect(where('teum_rift_warden')).toContain('s9');
  });

  it('갈라지는 진흙은 체력이 절반 아래로 내려가면 다음 차례에 작은 진흙 둘을 떼어 낸다(한 번)', () => {
    const s = battle({ enemies: ['teum_rift_slime'] });
    s.enemies[0].hp = Math.floor(s.enemies[0].maxHp * 0.5) + 30;
    playCard(s, give(s, 'haun_chop'), s.enemies[0].uid);
    expect(s.enemies[0].intent?.moveId).toBe('split');
    endTurn(s);
    expect(s.enemies.filter((e) => e.defId === 'teum_rift_slime_small' && !e.downed).length).toBe(2);
  });

  it('틈새의 짐승: 「틈」 모듈은 제 구역 보스가 나온다(세계의 틈)', () => {
    let node;
    for (let i = 0; i < 60 && !node; i++) {
      const run = createRunAt(data, `TEUM-${i}`, 's9');
      for (let k = 0; k < 6 && !node; k++) {
        splitMapBySurge(data, run, 1, `t${k}`);
        node = run.map.floors.flat().find((n) => n.crack && n.moduleId?.startsWith('crack_rift_teum_'));
      }
    }
    expect(node).toBeTruthy();
    expect(node!.enemies).toEqual(data.modules.get(node!.moduleId!)!.content.enemies);
  });
});

describe('「틈」 이펙트가 「천외귀환」 카드·상태에', () => {
  it('이름이 같은 카드(청운십팔식·기사의 일격·불덩이·도끼질 …)는 「틈」 무공 전용 이펙트로 나간다', () => {
    const want: Record<string, string> = { haun_eighteen: 'fx_teum_w_eighteen', kyle_strike: 'fx_teum_w_knight_strike', elia_fireball: 'fx_teum_w_fireball', born_axe: 'fx_teum_w_axe_chop' };
    for (const [id, fx] of Object.entries(want)) {
      expect(data.cards.get(id)?.fx, id).toBe(fx);
      expect(spec(fx), fx).toBe(true);
    }
  });

  it('약화·취약·화상·냉기·빙결이 걸리면 「틈」 상태 적중 이펙트', () => {
    const fx = data.fx.statusFx ?? {};
    for (const [st, id] of Object.entries({ weak: 'fx_teum_hit_weaken', vulnerable: 'fx_teum_hit_vuln', burn: 'fx_teum_hit_fire', chill: 'fx_teum_hit_ice', bind: 'fx_teum_hit_root' })) {
      expect(fx[st], st).toBe(id);
      expect(spec(id), id).toBe(true);
    }
  });
});
