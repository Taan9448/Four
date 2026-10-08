// 이벤트·휴식·여관·스토리 노드의 선택지 화면과 전투 보상 화면.
import type { GameData } from '../engine/data';
import type { ModuleDef } from '../engine/schema';
import { applyChoice, choiceNeedsPick, choicesFor, upgradeCandidates, type RunState } from '../engine/run';
import { cardView } from './card-view';
import { h } from './dom';

const TYPE_LABEL: Record<string, string> = { event: '이벤트', rest: '휴식', inn: '여관', story: '이야기' };
/** 판 머리의 붉은 낙관(지도 노드와 같은 한자) */
const TYPE_SEAL: Record<string, string> = { event: '事', rest: '休', inn: '宿', story: '史' };

/** 판 머리: 낙관 + 갈래 + 제목 */
function panelHead(seal: string, kind: string, title: string): HTMLElement {
  return h('header', { class: 'panel-head' }, h('span', { class: 'seal' }, seal), h('div', {}, h('div', { class: 'choice-kind' }, kind), h('h2', {}, title)));
}

/** 휴식·여관에서 쉴지 고를 때 보는 일행 체력(출전 중인 동료만) */
function partyStrip(data: GameData, run: RunState): HTMLElement {
  return h(
    'div',
    { class: 'party-strip' },
    run.roster
      .filter((r) => run.selected.includes(r.id))
      .map((r) => {
        const def = data.characters.get(r.id);
        return h(
          'div',
          { class: 'ps-member', style: `--owner:${def?.color ?? '#888'}` },
          h('span', { class: 'ps-name' }, def?.name ?? r.id),
          h('div', { class: 'ps-hp' }, h('i', { style: `width:${Math.round((r.hp / r.maxHp) * 100)}%` })),
          h('small', {}, `${r.hp} / ${r.maxHp}`),
        );
      }),
  );
}

export function choiceView(data: GameData, run: RunState, module: ModuleDef, onDone: () => void): HTMLElement {
  const box = h('div', { class: 'choice-box panel' });
  const render = (result?: string[], resultText?: string) => {
    box.replaceChildren(
      panelHead(TYPE_SEAL[module.type] ?? '事', TYPE_LABEL[module.type] ?? module.type, module.name),
      h('p', { class: 'choice-text' }, module.content.text ?? ''),
      module.type === 'rest' || module.type === 'inn' ? partyStrip(data, run) : '',
      result
        ? h(
            'div',
            { class: 'choice-result' },
            resultText ? h('p', { class: 'result-text' }, resultText) : null,
            result.length ? h('ul', { class: 'gains' }, result.map((r) => h('li', {}, r))) : null,
            module.type === 'rest' || module.type === 'inn' ? partyStrip(data, run) : null,
            h('button', { class: 'btn btn-primary', onclick: onDone }, '지도로'),
          )
        : h(
            'div',
            { class: 'choices' },
            choicesFor(data, run, module).map((c, i) =>
              h(
                'button',
                {
                  class: `btn choice${c.source === 'support' ? ' choice-support' : ''}`,
                  onclick: () => {
                    const pick = choiceNeedsPick(c);
                    if (pick) return pickUpgrade(pick.filter, i, c.result);
                    render(applyChoice(data, run, module, i), c.result);
                  },
                },
                h('span', { class: 'choice-mark' }, '▸'),
                h('span', {}, c.label),
              ),
            ),
          ),
    );
  };
  // 수련: 강화할 카드를 고른다. 카드는 강화 뒤 모습(+1)으로 보여 준다
  const pickUpgrade = (filter: Parameters<typeof upgradeCandidates>[2], index: number, resultText?: string) => {
    // 같은 카드·같은 단계는 한 장만 보여 준다(어느 것을 골라도 결과가 같다)
    const seen = new Set<string>();
    const list = upgradeCandidates(data, run, filter).filter((c) => {
      const key = `${c.cardId}:${c.level}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    box.replaceChildren(
      panelHead('練', '수련', '강화할 카드'),
      h('p', { class: 'choice-text' }, '+1~+3은 수치가 오르고, +4·+5에는 특수 스킬(★)이 붙는다. 강화 뒤 모습으로 보여 준다.'),
      list.length
        ? h(
            'div',
            { class: 'reward-cards upgrade-cards' },
            list.map((c) => {
              const el = cardView(data, { ...c, level: c.level + 1 });
              el.addEventListener('click', () => render(applyChoice(data, run, module, index, c.uid), resultText));
              return el;
            }),
          )
        : h('p', {}, '더 강화할 수 있는 카드가 없다.'),
      h('button', { class: 'btn', onclick: () => render() }, '돌아가기'),
    );
  };
  render();
  return h('section', { class: `screen choice-screen backdrop choice-${module.type}` }, box);
}

export function rewardView(data: GameData, options: string[], onPick: (cardId: string | null) => void): HTMLElement {
  return h(
    'section',
    { class: 'screen reward-screen backdrop' },
    h(
      'div',
      { class: 'choice-box panel reward-box' },
      panelHead('賞', '전투 승리', '전리품'),
      h('p', { class: 'choice-text' }, '카드 한 장을 골라 덱에 더한다. 마음에 드는 카드가 없으면 넘어간다.'),
      h(
        'div',
        { class: 'reward-cards' },
        options.map((id) => {
          const el = cardView(data, id);
          el.addEventListener('click', () => onPick(id));
          return el;
        }),
      ),
      h('div', { class: 'panel-actions' }, h('button', { class: 'btn', onclick: () => onPick(null) }, '넘어가기')),
    ),
  );
}
