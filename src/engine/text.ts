// 카드 문구 자동 생성. 카드 JSON에 text가 없으면 효과로부터 만든다.
import type { GameData } from './data';
import type { Effect } from './schema';
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

export function cardText(data: GameData, inst: CardInstance | string): string {
  const card = resolveCard(data, inst);
  if (card.upgraded && card.def.upgrade?.text) return card.def.upgrade.text;
  if (!card.upgraded && card.def.text) return card.def.text;
  const parts = card.effects.map((e) => describeEffect(data, e, card.def.target));
  const kw: string[] = [];
  if (card.keywords.includes('fusion')) kw.unshift('융합');
  if (card.keywords.includes('exhaust')) kw.push('소멸');
  if (card.keywords.includes('retain')) kw.push('유지');
  if (card.keywords.includes('innate')) kw.push('선천');
  return [...(kw.length ? [`[${kw.join('·')}]`] : []), parts.join('. ')].join(' ');
}
