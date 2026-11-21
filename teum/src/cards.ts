// 「틈」 카드 무공(2026-11-19 사용자 "스킬이 너무 적다, 지금의 10배"): 「천외귀환」 카드 286장을 data/cardskills.json 표대로
// 무공(공격·방어·회복·약화 카드) · 심법(파워·도움 카드)으로 바꾼다. 카드마다 손으로 적은 코드는 없다 — 카드의 주인·종류·대상·효과·등급·비용·속성만 본다.
// 카드 그림(card_art_*)이 그대로 무공 아이콘이 된다(render.ts).
import table from '../data/cardskills.json';
import haun from '../../data/cards/haun.json';
import kyle from '../../data/cards/kyle.json';
import elia from '../../data/cards/elia.json';
import born from '../../data/cards/born.json';
import common from '../../data/cards/common.json';
import abyss from '../../data/cards/abyss.json';
import type { Kind, PassiveDef, WeaponDef, WeaponLevel } from './sim';

interface CardEffect {
  op: string;
  amount?: number;
  times?: number;
  element?: string;
  status?: string;
  stacks?: number;
  target?: string;
}
interface Card {
  id: string;
  name: string;
  owner?: string;
  type: string;
  rarity: string;
  pool: string;
  cost?: { neigong?: number; mana?: number };
  target: string;
  effects: CardEffect[];
  flavor?: string;
  fx?: string;
}
type Table = typeof table & { base: Record<string, WeaponLevel> };
const T = table as unknown as Table;
const SOURCES: Record<string, Card[]> = { haun, kyle, elia, born, common, abyss } as unknown as Record<string, Card[]>;
const HEROES = ['haun', 'kyle', 'elia', 'born'];

/** 카드 id로 고르는 정해진 수(같은 카드는 늘 같은 종류·능력치가 된다) */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const ENEMY_DEBUFF = new Set(['weak', 'vulnerable', 'chill', 'drowsy', 'stun', 'bind', 'seal', 'shock', 'burn', 'poison']);

export interface CardSkills {
  weapons: WeaponDef[];
  passives: PassiveDef[];
}

/** 이미 있는 무공·심법과 이름이 같은 카드는 건너뛴다(낙운무흔·방패벽 등은 손으로 맞춘 무공이 있다) */
export function cardSkills(taken: Set<string>): CardSkills {
  const weapons: WeaponDef[] = [];
  const passives: PassiveDef[] = [];
  const names = new Set(taken);
  for (const src of T.sources) {
    for (const c of SOURCES[src] ?? []) {
      if (c.pool === 'status' || names.has(c.name)) continue;
      names.add(c.name);
      const owner = c.owner && HEROES.includes(c.owner) ? c.owner : '*';
      const rare = T.rarity[c.rarity as keyof typeof T.rarity] ?? 1;
      const cost = (c.cost?.neigong ?? 0) + (c.cost?.mana ?? 0);
      const h = hash(c.id);
      const dmgFx = c.effects.filter((e) => e.op === 'damage');
      const damage = dmgFx.reduce((a, e) => a + (e.amount ?? 0) * (e.times ?? 1), 0);
      const element = dmgFx.find((e) => e.element)?.element;
      const blocks = c.effects.some((e) => e.op === 'block');
      const heals = c.effects.some((e) => e.op === 'heal');
      const debuff = c.effects.find((e) => e.op === 'apply_status' && e.status && ENEMY_DEBUFF.has(e.status) && e.target !== 'self');
      const multi = dmgFx.some((e) => (e.times ?? 1) >= 2);
      const allEnemies = c.target === 'all_enemies';
      // 파워 · 피해도 방어도 회복도 약화도 없는 도움 카드 → 심법
      if (c.type === 'power' || (!damage && !blocks && !heals && !debuff)) {
        const st = T.stats[h % T.stats.length];
        const per = st.per * (0.8 + 0.2 * rare);
        passives.push({ id: `c_${c.id}`, name: c.name, desc: `${st.name} +${st.unit.includes('%') ? `${Math.round(per * 100)}%` : Math.round(per * 10) / 10}${st.unit === '-%' ? '(줄어듦)' : ''}(레벨마다)`, stat: st.stat, per, max: 5, card: c.id, rarity: c.rarity } as PassiveDef);
        continue;
      }
      // 무공 종류: 대상·속성·효과로 고르고, 겹치면 주인의 결로
      let kind: Kind;
      const pool = (T.owner as Record<string, string[]>)[owner] as Kind[];
      if (heals && !damage) kind = 'heal';
      else if (blocks && !damage) kind = c.target === 'all_allies' ? 'aura' : (['orbit', 'aura', 'nova'] as Kind[])[h % 3];
      else if (!damage && debuff) kind = allEnemies ? 'nova' : 'aura';
      else if (element === 'lightning') kind = allEnemies ? 'chain' : h % 2 ? 'chain' : 'strike';
      else if (allEnemies) kind = element === 'ice' ? 'nova' : element === 'fire' ? 'rain' : (['nova', 'rain', 'wave'] as Kind[])[h % 3];
      else if (element === 'fire' || element === 'ice') kind = 'bolt';
      else if (damage >= 150) kind = (['wave', 'beam', 'strike'] as Kind[])[h % 3];
      else if (multi) kind = 'slash';
      else kind = pool[h % pool.length];
      // 맞은 적에게 남기는 것: 속성 → 느림·태움·멈춤, 약화 카드 → 받는 피해 늘림
      const effect = element === 'ice' || debuff?.status === 'chill' || debuff?.status === 'bind' ? 'ice' : element === 'fire' || debuff?.status === 'burn' ? 'fire' : element === 'lightning' || debuff?.status === 'stun' || debuff?.status === 'shock' || debuff?.status === 'drowsy' ? 'shock' : debuff ? 'vuln' : undefined;
      const base = T.base[kind];
      // 카드 피해가 클수록·비쌀수록·귀할수록 세게(80이 보통)
      const power = rare * (damage ? Math.max(0.75, Math.min(1.6, damage / 80)) : 1) * (1 + 0.12 * cost);
      const levels: WeaponLevel[] = T.levels.damage.map((m, i) => ({
        damage: Math.max(1, Math.round(base.damage * power * m)),
        cooldown: Math.round(base.cooldown * (1 + 0.08 * cost) * T.levels.cooldown[i] * 100) / 100,
        area: Math.round(base.area * T.levels.area[i] * 100) / 100,
        count: base.count + T.levels.countAt.filter((at) => i + 1 >= at).length * (kind === 'slash' || kind === 'beam' || kind === 'heal' || kind === 'aura' || kind === 'nova' ? 0 : 1) + (kind === 'slash' && i >= 3 ? 1 : 0),
        speed: base.speed,
        pierce: base.pierce + (kind === 'bolt' && i >= 2 ? 1 : 0),
        duration: base.duration,
      }));
      const color = (T.color as Record<string, string>)[element ?? ''] ?? (c.pool === 'abyss' ? T.color.abyss : (T.color as Record<string, string>)[owner]);
      const tail = effect ? ` · ${(T.effectName as Record<string, string>)[effect]}` : '';
      const id = `c_${c.id}`;
      // 영웅·전설 카드: Lv.5 + 짝 심법 + 상자 = 「극의」 각성(손으로 맞춘 무공의 각성과 같은 길)
      const grand = c.rarity === 'epic' || c.rarity === 'legendary';
      const partner = (T.evolveWith as Record<string, string>)[kind];
      if (grand && partner) {
        const top = levels[levels.length - 1];
        weapons.push({
          id: `${id}_x`,
          name: `${c.name} · 극의`,
          owner,
          kind,
          desc: `각성 — ${c.name} Lv.5 + 「${partner}」 심법. ${(T.kindDesc as Record<string, string>)[kind]}${tail}, 훨씬 세게.`,
          color,
          levels: [{ ...top, damage: Math.round(top.damage * 2.2), cooldown: Math.round(top.cooldown * 0.7 * 100) / 100, count: top.count + (kind === 'slash' ? 2 : 2), area: Math.round(top.area * 1.25 * 100) / 100 }],
          ...(effect ? { element: effect as WeaponDef['element'] } : {}),
          ...(c.fx?.startsWith('fx_gyeol_') ? { fx: c.fx } : {}),
          knock: 10,
          card: c.id,
          evolved: true,
        } as WeaponDef);
      }
      weapons.push({
        ...(grand && partner ? { evolve: { with: partner, into: `${id}_x` } } : {}),
        id,
        name: c.name,
        owner,
        kind,
        desc: `${(T.kindDesc as Record<string, string>)[kind]}${tail}.`,
        color,
        levels,
        ...(effect ? { element: effect as WeaponDef['element'] } : {}),
        ...(c.fx?.startsWith('fx_gyeol_') ? { fx: c.fx } : {}),
        knock: kind === 'slash' || kind === 'orbit' ? 8 : 4,
        card: c.id,
        rarity: c.rarity,
      } as WeaponDef);
    }
  }
  return { weapons, passives };
}
