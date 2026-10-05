// 이벤트·휴식·여관·스토리 노드의 선택지 화면과 전투 보상 화면.
import type { GameData } from '../engine/data';
import type { ModuleDef } from '../engine/schema';
import { applyChoice, choicesFor, type RunState } from '../engine/run';
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
                  onclick: () => render(applyChoice(data, run, module, i), c.result),
                },
                c.label,
              ),
            ),
          ),
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
