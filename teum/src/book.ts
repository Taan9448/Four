// 「틈」 무공록 도우미(2026-11-21 사용자 "무공록만 봐서는 이해가 안 간다 — 추천 스킬셋·무공 설명·매칭되는 스킬"):
// 무공·심법 자세한 설명, 함께 쓰면 좋은 짝, 추천 묶음(세트·탄막·근접·극의·인물)을 데이터(rules.json build)에서 만든다.
// 화면 없이 도는 순수 함수 — main.ts(무공록·레벨업 카드)와 테스트가 같이 쓴다.
import table from '../data/cardskills.json';
import { HEROES, LOCKABLE, PASSIVES, rarityOf, RULES, WEAPONS, type Kind } from './sim';

const T = table as unknown as { kindName: Record<string, string>; kindDesc: Record<string, string>; effectName: Record<string, string>; stats: { stat: string; name: string; unit: string }[] };
export const KIND_NAME = T.kindName;
export const RARITY_NAME: Record<string, string> = { common: '흔함', uncommon: '드묾', rare: '귀함', epic: '영웅', legendary: '전설' };
const RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
const STAT_NAME = new Map(T.stats.map((s) => [s.stat, s.name]));
/** 멀리 날리는 종류(그 밖은 몸 둘레 범위) */
export const RANGED: Kind[] = ['bolt', 'wave', 'beam', 'chain', 'strike'];

const B = RULES.build as typeof RULES.build & {
  kindStats: Record<string, string[]>;
  presets: { id: string; name: string; desc: string; element?: string; kinds?: string[]; rarity?: string[]; own?: boolean }[];
};

const ownerName = (o: string) => (o === '*' ? '모두' : (HEROES.find((h) => h.id === o)?.name ?? o));

export interface SkillInfo {
  name: string;
  /** 한 줄 꼬리표: 무공 · 종류 · 주인 · 등급 · 속성 */
  tag: string;
  /** 자세한 설명 줄 */
  lines: string[];
}

/** 무공·심법 자세한 설명 — 무엇을 하는지, 수치(Lv.1→5), 남기는 것, 세트, 각성 */
export function describe(id: string): SkillInfo {
  const w = WEAPONS.get(id);
  if (w) {
    const a = w.levels[0];
    const z = w.levels[w.levels.length - 1];
    const lines = [
      `${T.kindDesc[w.kind] ?? w.desc}${RANGED.includes(w.kind) ? ' (멀리)' : w.kind === 'heal' ? '' : ' (몸 둘레)'}`,
      w.kind === 'heal' ? `회복 ${a.damage} → ${z.damage} · 대기 ${a.cooldown}초 → ${z.cooldown}초` : `피해 ${a.damage} → ${z.damage} · 대기 ${a.cooldown}초 → ${z.cooldown}초${a.count > 1 || z.count > 1 ? ` · 개수 ${a.count} → ${z.count}` : ''}${a.area !== z.area ? ` · 범위 ×${a.area} → ×${z.area}` : ''}`,
    ];
    if (w.element) lines.push(`맞은 적을 ${T.effectName[w.element]} — ${RULES.sets[w.element].name} 세트(${RULES.sets[w.element].need}개면: ${RULES.sets[w.element].desc})`);
    if (w.evolve) lines.push(`각성: Lv.5 + 「${PASSIVES.get(w.evolve.with)?.name}」 심법을 들고 상자를 열면 「${WEAPONS.get(w.evolve.into)?.name}」`);
    if (w.evolved) lines.push('각성한 무공 — 상자로만 얻는다');
    const tag = ['무공', KIND_NAME[w.kind], ownerName(w.owner), w.rarity ? RARITY_NAME[w.rarity] : '기본', w.element ? RULES.sets[w.element].name : ''].filter(Boolean).join(' · ');
    return { name: w.name, tag, lines };
  }
  const p = PASSIVES.get(id);
  if (!p) return { name: id, tag: '', lines: [] };
  const stat = STAT_NAME.get(p.stat) ?? p.stat;
  const good = Object.entries(B.kindStats).filter(([, st]) => st.includes(p.stat)).map(([k]) => KIND_NAME[k]);
  const evolves = [...WEAPONS.values()].filter((x) => x.evolve?.with === p.id && !x.card).map((x) => x.name);
  const lines = [`${p.desc} — 최대 Lv.${p.max}`, good.length ? `잘 맞는 무공: ${good.join(' · ')}` : `${stat}`];
  if (evolves.length) lines.push(`이 심법이 각성 짝인 기본 무공: ${evolves.slice(0, 4).join(' · ')}${evolves.length > 4 ? ' …' : ''}`);
  if (!p.card) lines.push('기본 심법 — 무공록과 상관없이 늘 레벨업에 나온다');
  return { name: p.name, tag: ['심법', stat, p.rarity ? RARITY_NAME[p.rarity] : '기본'].join(' · '), lines };
}

/** 이 무공·심법과 함께 들면 좋은 것(무공록 후보 ids 안에서): 같은 속성 무공 · 잘 맞는 능력치 심법 · 각성 짝 */
export function matches(id: string, pool: Iterable<string>): string[] {
  const ids = [...pool].filter((x) => x !== id);
  const w = WEAPONS.get(id);
  const score = (x: string): number => {
    const ow = WEAPONS.get(x);
    const op = PASSIVES.get(x);
    if (w) {
      if (ow) return w.element && ow.element === w.element ? 3 : 0;
      if (op) return (B.kindStats[w.kind] ?? []).includes(op.stat) ? 2 + (w.evolve?.with === op.id ? 2 : 0) : 0;
      return 0;
    }
    const p = PASSIVES.get(id);
    if (!p || !ow) return 0;
    return (B.kindStats[ow.kind] ?? []).includes(p.stat) ? 2 : 0;
  };
  return ids
    .map((x) => [x, score(x) + (RANK[rarityOf(x)] ?? 1) * 0.1] as const)
    .filter(([, v]) => v >= 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([x]) => x);
}

export interface Preset {
  id: string;
  name: string;
  desc: string;
  ids: string[];
}

/** 추천 묶음: 연 것(open) 안에서 이 인물이 쓸 수 있는 것으로, 무공 다수 + 맞는 심법 */
export function presets(heroId: string, open: Iterable<string>): Preset[] {
  const lock = new Set(LOCKABLE);
  const usable = [...open].filter((id) => lock.has(id) && (PASSIVES.has(id) || ['*', heroId].includes(WEAPONS.get(id)?.owner ?? '')));
  const ws = usable.filter((id) => WEAPONS.has(id));
  const ps = usable.filter((id) => PASSIVES.has(id));
  const byRank = (a: string, b: string) => (WEAPONS.get(b)?.owner === heroId ? 1 : 0) - (WEAPONS.get(a)?.owner === heroId ? 1 : 0) || (RANK[rarityOf(b)] ?? 1) - (RANK[rarityOf(a)] ?? 1);
  const max = B.bookMax;
  const out: Preset[] = [];
  for (const pr of B.presets) {
    const pick = ws
      .filter((id) => {
        const w = WEAPONS.get(id)!;
        if (pr.element) return w.element === pr.element;
        if (pr.kinds) return pr.kinds.includes(w.kind);
        if (pr.rarity) return pr.rarity.includes(w.rarity ?? '');
        if (pr.own) return w.owner === heroId;
        return false;
      })
      .sort(byRank);
    if (pick.length < 3) continue;
    // 무공은 wantW장까지: 모자라면 같은 갈래(멀리/둘레)의 다른 무공으로 채운다 — 심법만 잔뜩 들고 가지 않게
    const wantW = Math.ceil(max * 0.62);
    const core = pick.slice(0, wantW);
    const ranged = core.filter((id) => RANGED.includes(WEAPONS.get(id)!.kind)).length >= core.length / 2;
    const fill = ws.filter((id) => !core.includes(id) && RANGED.includes(WEAPONS.get(id)!.kind) === ranged).sort(byRank);
    const weapons = [...core, ...fill].slice(0, wantW);
    // 고른 무공 종류에 맞는 능력치 심법
    const stats = new Set(weapons.flatMap((id) => B.kindStats[WEAPONS.get(id)!.kind] ?? []));
    const pas = ps.filter((id) => stats.has(PASSIVES.get(id)!.stat)).sort(byRank).slice(0, max - weapons.length);
    out.push({ id: pr.id, name: pr.name, desc: pr.desc, ids: [...weapons, ...pas] });
  }
  return out;
}

/** 무공록 미리 보기: 속성 세트 수 · 멀리/둘레 비율 */
export function bookSummary(ids: Iterable<string>): { sets: { name: string; n: number; need: number }[]; ranged: number; close: number; passives: number } {
  const c: Record<string, number> = {};
  let ranged = 0;
  let close = 0;
  let passives = 0;
  for (const id of ids) {
    const w = WEAPONS.get(id);
    if (!w) {
      if (PASSIVES.has(id)) passives++;
      continue;
    }
    if (w.element) c[w.element] = (c[w.element] ?? 0) + 1;
    if (RANGED.includes(w.kind)) ranged++;
    else if (w.kind !== 'heal') close++;
  }
  const sets = (['fire', 'ice', 'shock', 'vuln'] as const).filter((k) => c[k]).map((k) => ({ name: RULES.sets[k].name, n: c[k], need: RULES.sets[k].need }));
  return { sets, ranged, close, passives };
}
