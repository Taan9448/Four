import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';
import { playCard } from '../src/engine/battle';
import { BOT_STYLES, cloneBattle, playBattle, playRun } from '../src/sim/bot';
import { battle, data, give } from './helpers';

describe('자동 플레이 봇', () => {
  it('RNG 사본은 같은 위치에서 같은 수열을 잇고, 원본과 따로 움직인다', () => {
    const a = createRng('CLONE');
    a.next();
    const b = a.clone();
    expect(b.next()).toBe(a.next());
    b.next();
    expect(a.clone().next()).not.toBe(b.next());
  });

  it('전투 사본에서 카드를 써도 원본은 그대로다', () => {
    const s = battle({ enemies: ['shadow_wolf'] });
    const c = cloneBattle(s);
    playCard(c, give(c, 'haun_chop'), c.enemies[0].uid);
    expect(c.enemies[0].hp).toBeLessThan(s.enemies[0].hp);
    expect(s.hand.length).toBe(c.hand.length);
  });

  it('전투를 끝까지 둔다', () => {
    const s = battle({ enemies: ['shadow_wolf'] });
    playBattle(s);
    expect(s.result).toBe('victory');
  });

  it('런 하나를 S0부터 끝(또는 패배)까지 두고, 같은 시드면 같은 결과다', () => {
    const a = playRun(data, 'BOT1');
    expect(['complete', 'defeat']).toContain(a.result);
    expect(a.battles.length).toBeGreaterThan(5);
    expect(a.stageEntry[0].stageId).toBe('s0');
    expect(playRun(data, 'BOT1')).toEqual(a);
  });

  it('봇 두 성향(수비·공격)도 런을 끝까지 두고, 같은 시드에서 서로 다르게 둔다', () => {
    const guard = playRun(data, 'BOT2', BOT_STYLES.guard);
    const strike = playRun(data, 'BOT2', BOT_STYLES.strike);
    for (const r of [guard, strike]) expect(['complete', 'defeat']).toContain(r.result);
    expect(playRun(data, 'BOT2', BOT_STYLES.guard)).toEqual(guard);
    expect(JSON.stringify(guard.battles)).not.toBe(JSON.stringify(strike.battles));
  });
});
