// 카드 문구 자동 생성. 카드 JSON에 text가 없으면 효과로부터 만든다.
import type { GameData } from './data';
import type { Effect, UpgradeSkill } from './schema';
import { resolveCard, type CardInstance } from './state';

/** 속성 이름(카드 문구·의도·약점 표시) */
export const ELEMENT_LABEL: Record<string, string> = { fire: '화염', ice: '냉기' };

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
  if (c.flag) return '';
  return '조건부: ';
}

const SCALE_LABEL: Record<string, string> = {
  rift: '균열 1당',
  hand: '손패 1장당',
  mana: '마나 1당',
  cardsPlayed: '이번 턴에 먼저 낸 카드 1장당',
  block: '자신의 방어 1당',
  missingHp: '자신이 잃은 체력 1당',
  enemies: '적 1명당',
};

/** 비례 수치 꼬리말: "(결 노출 1스택당 +3)" / 방어의 절반이면 "(자신의 방어 2당 +1)" */
function scaleText(data: GameData, e: Effect): string {
  const sc = e.scale;
  if (!sc) return '';
  const st = sc.status ? (data.statuses.get(sc.status)?.name ?? sc.status) : '';
  const label =
    sc.per === 'targetStatus' ? `대상의 ${st} 1당` : sc.per === 'selfStatus' ? `자신의 ${st} 1당` : (SCALE_LABEL[sc.per] ?? sc.per);
  let body: string;
  if (sc.amount >= 1 || sc.amount <= -1) body = `${label} ${sc.amount > 0 ? '+' : ''}${sc.amount}`;
  else {
    const every = Math.round(1 / Math.abs(sc.amount));
    body = `${label.replace(/ 1(장|명)?당$/, (_m, u) => ` ${every}${u ?? ''}당`)} ${sc.amount > 0 ? '+' : '-'}1`;
  }
  return ` (${body}${sc.max !== undefined ? `, 최대 +${sc.max}` : ''})`;
}

export function describeEffect(data: GameData, e: Effect, cardTarget?: string): string {
  if (e.op === 'apply_status' && data.statuses.get(e.status ?? '')?.triggers.length) return describeBase(data, e, cardTarget);
  // 기본값 0에 비례만 있으면 "피해 (자신의 방어 2당 +1)"
  const base = describeBase(data, e, cardTarget);
  const tail = scaleText(data, e);
  return tail && (e.amount ?? e.stacks ?? 0) === 0 ? base.replace(/ 0(?=( ×\d+)?(\(|$))/, '') + tail : base + tail;
}

function describeBase(data: GameData, e: Effect, cardTarget?: string): string {
  const n = e.amount ?? e.stacks ?? 0;
  const tgt = e.target ? TARGET_LABEL[e.target] : cardTarget === 'all_enemies' ? '적 전체' : '';
  const pre = condText(data, e);
  const times = e.times && e.times > 1 ? ` ×${e.times}` : '';
  switch (e.op) {
    case 'damage': {
      // 속성 피해: "화염 피해 9(화상 1)" — 실리는 상태는 balance.elements
      const el = e.element ? data.balance.elements[e.element] : undefined;
      const elName = e.element ? ELEMENT_LABEL[e.element] : '';
      const rider = el ? `(${data.statuses.get(el.status)?.name ?? el.status} ${el.stacks})` : '';
      return `${pre}${tgt && tgt !== '적 1명' ? `${tgt}에게 ` : ''}${elName ? `${elName} ` : ''}피해 ${n}${times}${rider}`;
    }
    case 'block':
      return `${pre}${tgt && tgt !== '자신' ? `${tgt}에게 ` : ''}방어 ${n}`;
    case 'heal':
      return `${pre}${tgt && tgt !== '자신' ? `${tgt} ` : ''}체력 ${n} 회복`;
    case 'gain_neigong':
      return n <= -10 ? `${pre}내공을 모두 비운다` : `${pre}내공 ${n >= 0 ? '+' : ''}${n}`;
    case 'neigong_max':
      return `${pre}이번 전투에서 턴마다 차는 내공 ${n >= 0 ? '+' : ''}${n}`;
    case 'dispel':
      return `${pre}${tgt && tgt !== '적 1명' ? `${tgt}의 ` : ''}강화와 방어를 걷어 낸다`;
    case 'gain_mana':
      return `${pre}마나 ${n >= 0 ? '+' : ''}${n}`;
    case 'draw':
      return `${pre}카드 ${n}장 뽑기`;
    case 'discard':
      return `${pre}무작위 카드 ${n}장 버리기`;
    case 'apply_status': {
      const st = data.statuses.get(e.status ?? '');
      // 파워(지속 효과): 상태의 설명을 그대로 보여 준다
      if (st?.triggers.length && (e.target ?? 'self') === 'self') return `${pre}지속 「${st.name}」${(e.stacks ?? 1) > 1 ? ` ×${e.stacks}` : ''}: ${st.description.replace(/\.$/, '')}`;
      if (e.scale && e.stacks === undefined && e.amount === undefined) return `${pre}${st?.name ?? e.status} 부여`;
      return `${pre}${st?.name ?? e.status} ${e.stacks ?? e.amount ?? 1} 부여`;
    }
    case 'lose_hp':
      return `${pre}${tgt && tgt !== '자신' ? `${tgt}의 ` : ''}체력 ${n} 잃기`;
    case 'remove_status':
      return `${pre}${tgt && tgt !== '적 1명' ? `${tgt}의 ` : ''}${data.statuses.get(e.status ?? '')?.name ?? e.status} ${e.stacks ? `${e.stacks} ` : ''}제거`;
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

const KEYWORD_LABEL: Record<string, string> = { fusion: '융합', exhaust: '소멸', retain: '유지', innate: '선천', unplayable: '사용 불가', thread: '실' };

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
  const kw = (['fusion', 'thread', 'exhaust', 'retain', 'innate'] as const).filter((k) => card.keywords.includes(k)).map((k) => KEYWORD_LABEL[k]);
  const head = [...(kw.length ? [`[${kw.join('·')}]`] : []), parts.join('. ')].join(' ');
  return [head, ...card.skills.map((s) => skillText(data, s, card.def.target))].join('\n');
}

/** 장면·컷인의 화자 이름과 색: 캐릭터(동료·왕일검) 또는 data/speakers.json */
export function speakerInfo(data: GameData, id: string): { name: string; color: string } {
  const c = data.characters.get(id) ?? data.speakers.get(id);
  return { name: c?.name ?? id, color: c?.color ?? '#888888' };
}
