import { describe, expect, it } from 'vitest';
import { cardWorld } from '../src/ui/card-view';
import { resolveCard } from '../src/engine/state';
import { data } from './helpers';

describe('카드 틀 색(2026-10-12 사용자 결정)', () => {
  it('비용으로 정한다: 내공만 = 무공(노랑), 마나만 = 마법(파랑), 둘 다 = 융합, 비용 0만 주인으로', () => {
    for (const def of data.cards.values()) {
      if (def.owner === 'status' || def.pool === 'status') continue;
      const card = resolveCard(data, { uid: 't', cardId: def.id, level: 0 });
      const w = cardWorld(card);
      const n = card.cost.neigong > 0, m = card.cost.mana > 0;
      if (n && m) expect(w, def.id).toBe('fusion');
      else if (m) expect(w, def.id).toBe('elheim');
      else if (n) expect(w, def.id).toBe('murim');
      else expect(w, def.id).toBe(def.owner === 'haun' || def.owner === 'common' ? 'murim' : 'elheim');
    }
  });
});
