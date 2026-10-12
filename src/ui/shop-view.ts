// 상점 화면(2026-10-08): 카드·유물·물약을 사고, 카드 지우기·강화를 한 번씩 쓴다. 진열은 노드마다 시드로 정해져 런에 남는다.
import type { GameData } from '../engine/data';
import { sfx } from '../render/audio';
import { buyCard, buyPotion, buyRelic, buyRemove, buyStitch, buySwap, buyUpgrade, openShop, swappable, swapPrice, type BuyResult } from '../engine/economy';
import { removePrice } from '../engine/abyss';
import type { ModuleDef } from '../engine/schema';
import { upgradeCandidates, type RunState } from '../engine/run';
import type { CardInstance } from '../engine/state';
import { cardView, offerCardView } from './card-view';
import { h } from './dom';
import { goldChip, potionChip, relicChip } from './items';
import { openOverlay } from './overlay';
import { toast } from '../render/fx';

/** 덱에서 카드 한 장 고르기(지우기·강화). preview: 고를 카드를 강화 뒤 모습으로 */
function pickCard(data: GameData, title: string, cards: CardInstance[], onPick: (uid: string) => void, preview = false): void {
  const seen = new Set<string>();
  const list = cards.filter((c) => {
    const key = `${c.cardId}:${c.level}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const grid = h(
    'div',
    { class: 'deck-cards pick-grid' },
    list.map((c) => {
      const el = cardView(data, preview ? { ...c, level: c.level + 1 } : c);
      el.addEventListener('click', () => {
        ov.close();
        onPick(c.uid);
      });
      return el;
    }),
  );
  const ov = openOverlay(title, grid, { wide: true });
}

export function shopView(data: GameData, run: RunState, module: ModuleDef, nodeId: string, onDone: () => void): HTMLElement {
  const shop = openShop(data, run, nodeId);
  const toasts = h('div', { class: 'toasts' });
  const box = h('div', { class: 'shop-layout' });
  const result = (r: BuyResult) => {
    toast(toasts, r.ok ? r.message : r.reason, r.ok ? 'support' : 'danger');
    if (r.ok) sfx('coin');
    render();
  };
  const price = (n: number, sold: boolean) => h('span', { class: `price${!sold && run.gold < n ? ' short' : ''}` }, sold ? '팔림' : h('span', {}, h('i', { class: 'coin' }), String(n)));

  const render = () => {
    const swapCost = swapPrice(data, run);
    const upCost = data.balance.economy.shop.upgradePrice;
    // 편성 화면과 같은 틀(2026-10-12): 위 머리말(이름·글·가진 골드) · 왼쪽 진열대(카드 · 유물 · 물약) · 오른쪽 옆단(손질 · 내 물약 칸 · 떠나기)
    const head = h(
      'header',
      { class: 'shop-head panel' },
      h('span', { class: 'seal' }, '市'),
      h(
        'div',
        { class: 'shop-title' },
        h('div', { class: 'choice-kind' }, '상점'),
        h('h2', {}, module.name),
        module.content.text ? h('p', { class: 'shop-text' }, module.content.text) : null,
        // 상흔이 깊으면: '틈 냄새가 나는 손님' — 값이 오르고, 감소 카드 한 장과 꿰매기(GAME_DESIGN 7절)
        shop.scarred ? h('p', { class: 'shop-scarred' }, `틈 냄새가 나는 손님 — 상흔 ${data.balance.rift.scar.shopAt} 이상이라 값이 ${Math.round((data.balance.rift.scar.shopPriceMul - 1) * 100)}% 올랐다. 대신 금을 꿰매 주겠단다.`) : null,
      ),
      h('div', { class: 'shop-purse', 'aria-label': `가진 골드 ${run.gold}` }, h('small', {}, '가진 골드'), goldChip(run.gold)),
    );
    const cardShelf = [
      h('h3', { class: 'shop-h' }, '카드'),
      h(
        'div',
        { class: 'shop-cards' },
        shop.cards.map((item, i) => {
          const el = item.sold ? cardView(data, item.cardId) : offerCardView(data, run, item.cardId);
          return h(
            'div',
            { class: `shop-item${item.sold ? ' sold' : ''}` },
            el,
            price(item.price, item.sold),
            item.sold ? null : h('button', { class: 'btn btn-small', disabled: run.gold < item.price, onclick: () => result(buyCard(data, run, i)) }, '사기'),
          );
        }),
      ),
    ];
    const goods = h(
        'div',
        { class: 'shop-row' },
        h(
          'div',
          { class: 'shop-col' },
          h('h3', { class: 'shop-h' }, '유물'),
          shop.relics.length
            ? shop.relics.map((item, i) => {
                const def = data.relics.get(item.relicId)!;
                return h(
                  'div',
                  { class: `shop-line${item.sold ? ' sold' : ''}` },
                  relicChip(data, item.relicId),
                  h('div', { class: 'shop-desc' }, h('b', {}, def.name), h('small', {}, def.description)),
                  price(item.price, item.sold),
                  item.sold ? null : h('button', { class: 'btn btn-small', disabled: run.gold < item.price, onclick: () => result(buyRelic(data, run, i)) }, '사기'),
                );
              })
            : h('p', { class: 'hint' }, '팔 유물이 없다.'),
        ),
        h(
          'div',
          { class: 'shop-col' },
          h('h3', { class: 'shop-h' }, '물약'),
          shop.potions.map((item, i) => {
            const def = data.potions.get(item.potionId)!;
            const full = !run.potions.includes(null);
            return h(
              'div',
              { class: `shop-line${item.sold ? ' sold' : ''}` },
              potionChip(data, item.potionId),
              h('div', { class: 'shop-desc' }, h('b', {}, def.name), h('small', {}, def.description)),
              price(item.price, item.sold),
              item.sold ? null : h('button', { class: 'btn btn-small', disabled: run.gold < item.price || full, title: full ? '물약 칸이 가득하다' : '', onclick: () => result(buyPotion(data, run, i)) }, '사기'),
            );
          }),
        ),
    );
    const services = h(
          'div',
          { class: 'shop-services panel' },
          h('h3', { class: 'shop-h' }, '손질(상점마다 한 번)'),
          run.abyss
            ? h(
                'div',
                { class: `shop-line${shop.swapUsed ? ' sold' : ''}` },
                h('span', { class: 'service-glyph' }, '棄'),
                h('div', { class: 'shop-desc' }, h('b', {}, '카드 지우기'), h('small', {}, '덱에서 카드 한 장을 영영 뺀다. 쓸 때마다 값이 오른다.')),
                price(removePrice(data, run), shop.swapUsed),
                shop.swapUsed
                  ? null
                  : h(
                      'button',
                      {
                        class: 'btn btn-small',
                        disabled: run.gold < removePrice(data, run) || run.deck.length <= 1,
                        onclick: () => pickCard(data, `지울 카드 고르기 — ${removePrice(data, run)}골드`, run.deck, (uid) => result(buyRemove(data, run, uid))),
                      },
                      '고르기',
                    ),
              )
            : h(
            'div',
            { class: `shop-line${shop.swapUsed ? ' sold' : ''}` },
            h('span', { class: 'service-glyph' }, '換'),
            h('div', { class: 'shop-desc' }, h('b', {}, '카드 바꾸기'), h('small', {}, '보유 카드 한 장을 같은 주인의 다른 카드(아직 없는 것 우선)로 바꾼다. 편성에 있었으면 그 자리에 들어간다. 쓸 때마다 값이 오른다.')),
            price(swapCost, shop.swapUsed),
            shop.swapUsed
              ? null
              : h(
                  'button',
                  {
                    class: 'btn btn-small',
                    disabled: run.gold < swapCost || swappable(data, run).length === 0,
                    onclick: () =>
                      pickCard(
                        data,
                        `바꿀 카드 고르기 — ${swapCost}골드`,
                        swappable(data, run).map((id) => ({ uid: id, cardId: id, level: run.collection[id] ?? 0 })),
                        (id) => result(buySwap(data, run, id)),
                      ),
                  },
                  '고르기',
                ),
          ),
          shop.scarred
            ? h(
                'div',
                { class: `shop-line${shop.stitchUsed ? ' sold' : ''}` },
                h('span', { class: 'service-glyph' }, '縫'),
                h('div', { class: 'shop-desc' }, h('b', {}, '꿰매기'), h('small', {}, `하늘의 금을 꿰맨다. 상흔 -${data.balance.rift.scar.shopStitch}(지금 ${run.scar}).`)),
                price(data.balance.rift.scar.shopStitchGold, !!shop.stitchUsed),
                shop.stitchUsed ? null : h('button', { class: 'btn btn-small', disabled: run.gold < data.balance.rift.scar.shopStitchGold, onclick: () => result(buyStitch(data, run)) }, '꿰매기'),
              )
            : null,
          h(
            'div',
            { class: `shop-line${shop.upgradeUsed ? ' sold' : ''}` },
            h('span', { class: 'service-glyph' }, '鍛'),
            h('div', { class: 'shop-desc' }, h('b', {}, '카드 강화'), h('small', {}, run.abyss ? '덱의 카드 한 장을 강화한다(+1, 이번 심연에서만).' : '이번 덱의 카드 한 장을 강화한다(+1, 보유 카드에 남는다).')),
            price(upCost, shop.upgradeUsed),
            shop.upgradeUsed
              ? null
              : h(
                  'button',
                  {
                    class: 'btn btn-small',
                    disabled: run.gold < upCost || upgradeCandidates(data, run).length === 0,
                    onclick: () => pickCard(data, `강화할 카드 고르기 — ${upCost}골드(강화 뒤 모습)`, upgradeCandidates(data, run), (uid) => result(buyUpgrade(data, run, uid)), true),
                  },
                  '고르기',
                ),
          ),
    );
    box.replaceChildren(
      head,
      h(
        'div',
        { class: 'shop-body' },
        h('div', { class: 'shop-main panel' }, ...cardShelf, goods),
        h(
          'aside',
          { class: 'shop-side' },
          services,
          h('div', { class: 'shop-own panel' }, h('h3', { class: 'shop-h' }, '내 물약 칸'), h('div', { class: 'shop-potions-own' }, run.potions.map((p) => potionChip(data, p)))),
          h('button', { class: 'btn btn-primary shop-leave', onclick: onDone }, '떠나기'),
        ),
      ),
    );
  };
  render();
  return h('section', { class: 'screen shop-screen' }, box, toasts);
}
