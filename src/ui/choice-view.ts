// 이벤트·휴식·여관·스토리 노드의 선택지 화면과 전투 보상 화면.
import type { GameData } from '../engine/data';
import type { ModuleDef } from '../engine/schema';
import { applyChoice, choiceNeedsPick, choicesFor, upgradeCandidates, type RunState } from '../engine/run';
import { cardView } from './card-view';
import { h } from './dom';

const TYPE_LABEL: Record<string, string> = { event: '이벤트', rest: '휴식', inn: '여관', story: '이야기' };

export function choiceView(data: GameData, run: RunState, module: ModuleDef, onDone: () => void): HTMLElement {
  const box = h('div', { class: 'choice-box' });
  const render = (result?: string[], resultText?: string) => {
    box.replaceChildren(
      h('div', { class: 'choice-kind' }, TYPE_LABEL[module.type] ?? module.type),
      h('h2', {}, module.name),
      h('p', { class: 'choice-text' }, module.content.text ?? ''),
      result
        ? h(
            'div',
            { class: 'choice-result' },
            resultText ? h('p', {}, resultText) : null,
            h('ul', {}, result.map((r) => h('li', {}, r))),
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
                c.label,
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
      h('div', { class: 'choice-kind' }, '수련'),
      h('h2', {}, '강화할 카드'),
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
  return h('section', { class: `screen choice-screen choice-${module.type}` }, box);
}

export function rewardView(data: GameData, options: string[], onPick: (cardId: string | null) => void): HTMLElement {
  return h(
    'section',
    { class: 'screen reward-screen' },
    h(
      'div',
      { class: 'choice-box' },
      h('h2', {}, '전리품'),
      h('p', {}, '카드 한 장을 덱에 더한다.'),
      h(
        'div',
        { class: 'reward-cards' },
        options.map((id) => {
          const el = cardView(data, id);
          el.addEventListener('click', () => onPick(id));
          return el;
        }),
      ),
      h('button', { class: 'btn', onclick: () => onPick(null) }, '넘어가기'),
    ),
  );
}
