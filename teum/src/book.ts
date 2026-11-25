// 「틈」 무공록 도우미(2026-11-21 사용자 "무공록만 봐서는 이해가 안 간다 — 추천 스킬셋·무공 설명·매칭되는 스킬"):
// 무공·심법 자세한 설명, 함께 쓰면 좋은 짝, 추천 묶음(세트·탄막·근접·극의·인물)을 데이터(rules.json build)에서 만든다.
// 화면 없이 도는 순수 함수 — main.ts(무공록·레벨업 카드)와 테스트가 같이 쓴다.
import table from '../data/cardskills.json';
import { elementCounts, elemName, isSetElem, partnerName, type Debuff, HEROES, LOCKABLE, partnersOf, PASSIVES, rarityOf, RULES, WEAPONS, type Choice, type Kind, type State } from './sim';
/** 디버프 설명(2026-11-25) */
const DEBUFF_DESC: Record<Debuff, string> = { poison: '0.5초마다 독 피해', bleed: '겹칠수록 커지는 출혈 피해', weaken: '그림자가 주는 피해 -40%', fear: '겁먹고 달아나며 공격·기술을 못 쓴다', silence: '탄·내려찍기 같은 기술을 못 쓴다', root: '그 자리에 묶여 움직이지 못한다' };

const T = table as unknown as { kindName: Record<string, string>; kindDesc: Record<string, string>; effectName: Record<string, string>; stats: { stat: string; name: string; unit: string }[] };
export const KIND_NAME = T.kindName;
export const RARITY_NAME: Record<string, string> = { common: '흔함', uncommon: '드묾', rare: '귀함', epic: '영웅', legendary: '전설' };
const RANK: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
const STAT_NAME = new Map(T.stats.map((s) => [s.stat, s.name]));
/** 멀리 날리는 종류(그 밖은 몸 둘레 범위) */
export const RANGED: Kind[] = ['bolt', 'wave', 'beam', 'chain', 'strike'];

const B = RULES.build as typeof RULES.build & {
  bookWeapons: number;
  bookPassives: number;
  grade: { cut: Record<'S' | 'A' | 'B', number>; kindMult: Record<string, number>; statWeight: Record<string, number> };
  roles: Record<string, [string, string]>;
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
    if (isSetElem(w.element)) lines.push(`맞은 적을 ${T.effectName[w.element]} — ${RULES.sets[w.element].name} 세트(${RULES.sets[w.element].need}개면: ${RULES.sets[w.element].desc})`);
    else if (w.element) lines.push(`맞은 적에게 ${elemName(w.element)} — ${DEBUFF_DESC[w.element as Debuff] ?? ''}`);
    if (w.evolve) lines.push(`각성: Lv.5 + 「${partnerName(w.evolve.with)}」 ${WEAPONS.has(w.evolve.with) ? '무공(합쳐져 사라진다)' : '심법'}을 들고 상자를 열면 「${WEAPONS.get(w.evolve.into)?.name}」`);
    if (w.evolved) lines.push('각성한 무공 — 상자로만 얻는다');
    const tag = ['무공', KIND_NAME[w.kind], ownerName(w.owner), w.rarity ? RARITY_NAME[w.rarity] : '기본', w.element ? elemName(w.element) : '', w.endless ? '무한 모드' : ''].filter(Boolean).join(' · ');
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

// ── 등급(2026-11-21 사용자 "스킬에 각각 등급을 부여하고 UI/UX 전면 개편") ──
export type Grade = 'S' | 'A' | 'B' | 'C' | '극';
/** 무공 힘: Lv.5 피해 × 개수 ÷ 대기 × 종류 배율(여럿 맞히는 종류일수록 크게) */
export function weaponPower(id: string): number {
  const w = WEAPONS.get(id);
  if (!w) return 0;
  const z = w.levels[w.levels.length - 1];
  return ((z.damage * Math.max(1, z.count)) / Math.max(0.1, z.cooldown)) * (B.grade.kindMult[w.kind] ?? 1) * (w.element ? 1.1 : 1);
}
function passivePower(id: string): number {
  const p = PASSIVES.get(id)!;
  const best = Math.max(...[...PASSIVES.values()].filter((x) => x.stat === p.stat).map((x) => x.per));
  return (p.per / best) * (B.grade.statWeight[p.stat] ?? 1);
}
const GRADES = new Map<string, Grade>();
function rankInto(ids: string[], power: (id: string) => number): void {
  const sorted = [...ids].sort((a, b) => power(b) - power(a));
  const n = sorted.length;
  const cS = Math.round(n * B.grade.cut.S);
  const cA = cS + Math.round(n * B.grade.cut.A);
  const cB = cA + Math.round(n * B.grade.cut.B);
  sorted.forEach((id, i) => GRADES.set(id, i < cS ? 'S' : i < cA ? 'A' : i < cB ? 'B' : 'C'));
}
// 회복은 피해가 아니니 따로, 각성은 「극」
rankInto([...WEAPONS.values()].filter((w) => !w.evolved && w.kind !== 'heal').map((w) => w.id), weaponPower);
rankInto([...WEAPONS.values()].filter((w) => !w.evolved && w.kind === 'heal').map((w) => w.id), weaponPower);
rankInto([...PASSIVES.keys()], passivePower);
for (const w of WEAPONS.values()) if (w.evolved) GRADES.set(w.id, '극');
export const gradeOf = (id: string): Grade => GRADES.get(id) ?? 'C';
export const GRADE_ORDER: Record<Grade, number> = { 극: 5, S: 4, A: 3, B: 2, C: 1 };

/** 쉬운 갈래: shot 투사체 · line 관통/연쇄 · drop 낙하/장판 · close 근접 · spin 회전 · heal 회복 */
export function roleOf(id: string): { key: string; name: string } {
  const w = WEAPONS.get(id);
  if (!w) return { key: 'passive', name: '심법' };
  const r = B.roles[w.kind] ?? ['close', '근접'];
  return { key: r[0], name: r[1] };
}

/** 숫자 한눈에: 레벨 lv의 핵심 값(무공) / 레벨당 값(심법) */
export function keyNumbers(id: string, lv: number): { label: string; from?: string; to: string; better?: boolean }[] {
  const w = WEAPONS.get(id);
  if (w) {
    const b = w.levels[Math.min(lv, w.levels.length) - 1];
    const a = lv > 1 ? w.levels[lv - 2] : undefined;
    const out: { label: string; from?: string; to: string; better?: boolean }[] = [];
    out.push({ label: w.kind === 'heal' ? '회복' : '피해', from: a ? String(a.damage) : undefined, to: String(b.damage), better: !!a && b.damage > a.damage });
    out.push({ label: '대기', from: a ? `${a.cooldown}초` : undefined, to: `${b.cooldown}초`, better: !!a && b.cooldown < a.cooldown });
    if (b.count > 1 || (a && a.count !== b.count)) out.push({ label: '개수', from: a ? String(a.count) : undefined, to: String(b.count), better: !!a && b.count > a.count });
    if (a && a.area !== b.area) out.push({ label: '범위', from: `×${a.area}`, to: `×${b.area}`, better: b.area > a.area });
    return out;
  }
  const p = PASSIVES.get(id);
  if (!p) return [];
  const stat = STAT_NAME.get(p.stat) ?? p.stat;
  const v = (n: number) => (Math.abs(p.per) < 1 && !['breath', 'thorns', 'amount'].includes(p.stat) ? `${Math.round(p.per * n * 100)}%` : `${Math.round(p.per * n * 10) / 10}`);
  return [{ label: stat, from: lv > 1 ? `+${v(lv - 1)}` : undefined, to: `+${v(lv)}`, better: true }];
}

/** 레벨업 추천(2026-11-21 "어떤 스킬을 골라야 하는지 이해가 어렵다"): 가장 좋은 하나와 그 까닭 */
export function recommend(s: State, choices: Choice[]): { index: number; reason: string } | null {
  if (choices.some((c) => c.kind === 'buy' || c.kind === 'leave')) return null;
  const partners = partnersOf(s);
  const ec = elementCounts(s);
  const ownStats = new Set(s.weapons.flatMap((w) => B.kindStats[WEAPONS.get(w.id)?.kind ?? ''] ?? []));
  const G: Record<Grade, number> = { 극: 30, S: 20, A: 12, B: 6, C: 0 };
  let best = -1;
  let bestV = -Infinity;
  let why = '';
  choices.forEach((c, i) => {
    let v = 0;
    let r = '';
    if (c.kind === 'weapon') {
      const w = WEAPONS.get(c.id)!;
      if (c.lv > 1) {
        v = 30 + c.lv * 2 + G[gradeOf(c.id)] * 0.6;
        r = '가진 무공 강화';
        if (c.lv >= w.levels.length && w.evolve && s.passives.has(w.evolve.with)) {
          v += 25;
          r = '각성 준비 완료';
        }
      } else {
        v = G[gradeOf(c.id)] + (s.weapons.filter((w) => !WEAPONS.get(w.id)?.relic).length < 3 ? 12 : 0);
        r = `${gradeOf(c.id)}급 새 무공`;
        if (isSetElem(w.element)) {
          const n = (ec[w.element] ?? 0) + 1;
          if (n === RULES.sets[w.element].need) {
            v += 28;
            r = `${RULES.sets[w.element].name} 세트 완성`;
          } else if (n < RULES.sets[w.element].need && n > 1) v += 8;
        }
      }
    } else if (c.kind === 'passive') {
      const p = PASSIVES.get(c.id)!;
      v = G[gradeOf(c.id)] * 0.8 + (ownStats.has(p.stat) ? 8 : 0) + (c.lv > 1 ? 6 : 0);
      r = ownStats.has(p.stat) ? '가진 무공과 잘 맞음' : `${gradeOf(c.id)}급 심법`;
      const pw = partners.get(c.id);
      if (pw && c.lv === 1) {
        v += 40;
        r = `「${WEAPONS.get(pw)?.name}」 각성 짝`;
      }
    } else v = -5;
    if (v > bestV) {
      bestV = v;
      best = i;
      why = r;
    }
  });
  return best >= 0 ? { index: best, reason: why } : null;
}

/** 갈래 아이콘(SVG): 무협 이름·카드 그림만으로 모르는 「무엇을 하는지」를 모양으로 */
export function roleIcon(key: string): string {
  const s = 'stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const body: Record<string, string> = {
    shot: `<path ${s} d="M4 16h14"/><path ${s} d="M13 10l6 6-6 6"/><circle cx="6" cy="9" r="1.6" fill="currentColor"/>`,
    line: `<path ${s} d="M3 16l6-6 4 6 4-6 4 6"/>`,
    drop: `<path ${s} d="M16 4v14"/><path ${s} d="M10 13l6 6 6-6"/><ellipse ${s} cx="16" cy="25" rx="9" ry="3"/>`,
    close: `<circle ${s} cx="16" cy="16" r="5"/><circle ${s} cx="16" cy="16" r="11" stroke-dasharray="4 3"/>`,
    spin: `<circle ${s} cx="16" cy="16" r="9" stroke-dasharray="2 4"/><circle cx="25" cy="16" r="2.8" fill="currentColor"/><circle cx="7" cy="16" r="2.8" fill="currentColor"/>`,
    heal: `<path ${s} d="M16 7v18M7 16h18"/>`,
    passive: `<path ${s} d="M16 5l3 7 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z"/>`,
  };
  return `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">${body[key] ?? body.close}</svg>`;
}

// ── 무공록 편성 도우미(2026-11-21 6차 "무공록 고르기가 여전히 불편 — UI/UX 전면 개편"): 칸 중심 편성 ──
export const BOOK_SLOTS = { weapons: B.bookWeapons, passives: B.bookPassives };

/** 무공록을 칸으로 나눈다: 무공 칸 · 심법 칸(넘치는 것은 버린다) */
export function splitBook(ids: Iterable<string>): { weapons: string[]; passives: string[] } {
  const all = [...ids];
  return { weapons: all.filter((id) => WEAPONS.has(id)).slice(0, B.bookWeapons), passives: all.filter((id) => PASSIVES.has(id)).slice(0, B.bookPassives) };
}

export interface Suggestion {
  id: string;
  score: number;
  /** 왜 좋은지 짧게(칩) */
  why: string[];
}
/** 칸에 넣을 후보: 지금 무공록과 잘 맞는 순서(등급 · 세트 · 멀리/둘레 균형 · 능력치) */
export function suggest(heroId: string, open: Iterable<string>, deck: Iterable<string>, kind: 'weapon' | 'passive', replacing?: string): Suggestion[] {
  const lock = new Set(LOCKABLE);
  const cur = new Set(deck);
  if (replacing) cur.delete(replacing);
  const { weapons } = splitBook(cur);
  const ec: Record<string, number> = {};
  let ranged = 0;
  for (const id of weapons) {
    const w = WEAPONS.get(id)!;
    if (w.element) ec[w.element] = (ec[w.element] ?? 0) + 1;
    if (RANGED.includes(w.kind)) ranged++;
  }
  const stats = new Map<string, number>();
  for (const id of weapons) for (const st of B.kindStats[WEAPONS.get(id)!.kind] ?? []) stats.set(st, (stats.get(st) ?? 0) + 1);
  const out: Suggestion[] = [];
  for (const id of open) {
    if (!lock.has(id) || cur.has(id) || id === replacing) continue;
    const w = WEAPONS.get(id);
    const p = PASSIVES.get(id);
    if (kind === 'weapon' ? !w || (w.owner !== '*' && w.owner !== heroId) : !p) continue;
    const g = gradeOf(id);
    let score = GRADE_ORDER[g] * 10;
    const why: string[] = [`${g}급`];
    if (w) {
      if (isSetElem(w.element)) {
        const n = (ec[w.element] ?? 0) + 1;
        const need = RULES.sets[w.element].need;
        if (n >= need && (ec[w.element] ?? 0) < need) {
          score += 14;
          why.push(`${RULES.sets[w.element].name} 세트 완성`);
        } else if (n > 1) {
          score += 6;
          why.push(`${RULES.sets[w.element].name} ${n}/${need}`);
        }
      }
      if (RANGED.includes(w.kind) && ranged < 4) {
        score += 5;
        why.push('멀리 공격 보강');
      }
      if (w.owner === heroId) {
        score += 3;
        why.push('인물 전용');
      }
    } else if (p) {
      const m = stats.get(p.stat) ?? 0;
      if (m) {
        score += Math.min(12, m * 3);
        why.push(`든 무공 ${m}개와 잘 맞음`);
      }
    }
    out.push({ id, score, why });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** 무공록 조언(짧게, 많아야 셋): 모자란 것 · 세트 하나 남음 · 안 맞는 심법 */
export function advice(deck: Iterable<string>): string[] {
  const { weapons, passives } = splitBook(deck);
  const tips: string[] = [];
  const ec: Record<string, number> = {};
  let ranged = 0;
  let close = 0;
  for (const id of weapons) {
    const w = WEAPONS.get(id)!;
    if (w.element) ec[w.element] = (ec[w.element] ?? 0) + 1;
    if (RANGED.includes(w.kind)) ranged++;
    else if (w.kind !== 'heal') close++;
  }
  for (const k of ['fire', 'ice', 'shock', 'vuln'] as const) if ((ec[k] ?? 0) === RULES.sets[k].need - 1) tips.push(`${RULES.sets[k].name} ${ec[k]}/${RULES.sets[k].need} — 하나만 더 넣으면 세트(${RULES.sets[k].desc})`);
  if (weapons.length < 6) tips.push(`무공이 ${weapons.length}개뿐 — 레벨업에서 고를 것이 모자랄 수 있다`);
  if (weapons.length >= 4 && ranged < 2) tips.push('멀리 공격이 적다 — 투사체·관통을 섞으면 안전하다');
  if (weapons.length >= 4 && close === 0) tips.push('몸 둘레 공격이 없다 — 무리에 둘러싸이면 위험하다');
  const stats = new Set(weapons.flatMap((id) => B.kindStats[WEAPONS.get(id)!.kind] ?? []));
  const off = passives.filter((id) => !stats.has(PASSIVES.get(id)!.stat)).map((id) => PASSIVES.get(id)!.name);
  if (off.length) tips.push(`든 무공과 잘 안 맞는 심법: ${off.slice(0, 3).join(' · ')}`);
  if (weapons.length && !weapons.some((id) => ['S', '극'].includes(gradeOf(id))) && !weapons.some((id) => gradeOf(id) === 'A')) tips.push('S·A급 무공이 없다');
  return tips.slice(0, 3);
}
