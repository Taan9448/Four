// 카드 문구 자동 생성. 카드 JSON에 text가 없으면 효과로부터 만든다.
import type { GameData } from './data';
import type { Effect, UpgradeSkill } from './schema';
import { resolveCard, type CardInstance } from './state';

const TARGET_LABEL: Record<string, string> = {
  self: '자신',
  ally: '아군 1명',
  enemy: '적 1명',
  all_enemies: '적 전체',
  all_allies: '아군 전체',
  random_enemy: '무작위 적',
  trigger_enemy: '해당 적',
};

function condText(data: GameData, e: Effect): string {
  const c = e.condition;
  if (!c) return '';
  if (c.targetHasStatus) return `대상이 ${data.statuses.get(c.targetHasStatus)?.name ?? c.targetHasStatus} 상태면 `;
  if (c.riftGte !== undefined) return `균열 ${c.riftGte} 이상이면 `;
  if (c.partyHas) return `${data.characters.get(c.partyHas)?.name ?? c.partyHas} 출전 시 `;
  return '조건부: ';
}

export function describeEffect(data: GameData, e: Effect, cardTarget?: string): string {
  const n = e.amount ?? e.stacks ?? 0;
  const tgt = e.target ? TARGET_LABEL[e.target] : cardTarget === 'all_enemies' ? '적 전체' : '';
  const pre = condText(data, e);
  const times = e.times && e.times > 1 ? ` ×${e.times}` : '';
  switch (e.op) {
    case 'damage':
      return `${pre}${tgt && tgt !== '적 1명' ? `${tgt}에게 ` : ''}피해 ${n}${times}`;
    case 'block':
      return `${pre}${tgt && tgt !== '자신' ? `${tgt}에게 ` : ''}방어 ${n}`;
    case 'heal':
      return `${pre}${tgt && tgt !== '자신' ? `${tgt} ` : ''}체력 ${n} 회복`;
    case 'gain_neigong':
      return `${pre}내공 +${n}`;
    case 'gain_mana':
      return `${pre}마나 ${n >= 0 ? '+' : ''}${n}`;
    case 'draw':
      return `${pre}카드 ${n}장 뽑기`;
    case 'discard':
      return `${pre}무작위 카드 ${n}장 버리기`;
    case 'apply_status':
      return `${pre}${data.statuses.get(e.status ?? '')?.name ?? e.status} ${e.stacks ?? 1} 부여`;
    case 'remove_status':
      return `${pre}${data.statuses.get(e.status ?? '')?.name ?? e.status} 제거`;
    case 'rift':
      return `${pre}균열 ${n >= 0 ? '+' : ''}${n}`;
    case 'reveal_grain':
      return `${pre}결 노출 ${n}`;
    case 'taunt':
      return `${pre}도발`;
    case 'add_card':
      return `${pre}'${data.cards.get(e.card ?? '')?.name ?? e.card}' 추가`;
    default:
      return e.op;
  }
}

const KEYWORD_LABEL: Record<string, string> = { fusion: '융합', exhaust: '소멸', retain: '유지', innate: '선천', unplayable: '사용 불가' };

/** 특수 스킬(+4·+5) 한 줄: 추가 효과·키워드 변화·비용 변화 */
export function skillText(data: GameData, skill: UpgradeSkill, cardTarget?: string): string {
  const parts = skill.effects.map((e) => describeEffect(data, e, cardTarget));
  for (const k of skill.addKeywords) parts.push(`${KEYWORD_LABEL[k] ?? k} 추가`);
  for (const k of skill.removeKeywords) parts.push(`${KEYWORD_LABEL[k] ?? k} 없앰`);
  if (skill.cost) parts.push(`비용 내공 ${skill.cost.neigong}${skill.cost.mana ? `·마나 ${skill.cost.mana}` : ''}`);
  return `★${skill.name}: ${parts.join(', ')}`;
}

/** 카드 문구. 강화 단계의 수치를 반영하고, 열린 특수 스킬은 줄을 바꿔 ★로 붙인다 */
export function cardText(data: GameData, inst: CardInstance | string): string {
  const card = resolveCard(data, inst);
  if (card.level === 0 && card.def.text) return card.def.text;
  const parts = card.baseEffects.map((e) => describeEffect(data, e, card.def.target));
  const kw = (['fusion', 'exhaust', 'retain', 'innate'] as const).filter((k) => card.keywords.includes(k)).map((k) => KEYWORD_LABEL[k]);
  const head = [...(kw.length ? [`[${kw.join('·')}]`] : []), parts.join('. ')].join(' ');
  return [head, ...card.skills.map((s) => skillText(data, s, card.def.target))].join('\n');
}
