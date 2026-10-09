// 이벤트·휴식·여관·스토리 노드의 선택지 화면과 전투 보상 화면.
import { sfx } from '../render/audio';
import type { GameData } from '../engine/data';
import type { ModuleDef } from '../engine/schema';
import { applyChoice, applyLevelUpgrade, choiceCardPick, choiceNeedsPick, choiceRemovePick, choicesFor, levelUpgradeCandidates, removeCandidates, upgradeCandidates, type RunState } from '../engine/run';
import { swappableCards } from '../engine/collection';
import { cardView, offerCardView } from './card-view';
import { h } from './dom';
import { gainRelic } from '../engine/run';
import { swapPotion, type Loot } from '../engine/economy';
import { potionChip, relicChip } from './items';

const TYPE_LABEL: Record<string, string> = { event: '이벤트', rest: '휴식', inn: '여관', shop: '상점', story: '이야기' };
/** 판 머리의 붉은 낙관(지도 노드와 같은 한자) */
const TYPE_SEAL: Record<string, string> = { event: '事', rest: '休', inn: '宿', shop: '市', story: '史' };

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

/** opts.onEditLoadout: 여관에서 편성 바꾸기(GAME_DESIGN 9-1) */
export function choiceView(data: GameData, run: RunState, module: ModuleDef, onDone: () => void, opts: { onEditLoadout?: () => void } = {}): HTMLElement {
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
                  class: `btn choice${c.source === 'support' ? ' choice-support' : ''}${c.disabled ? ' choice-off' : ''}`,
                  disabled: !!c.disabled,
                  onclick: () => {
                    const pick = choiceNeedsPick(c);
                    if (pick) return pickUpgrade(pick.filter, i, c.result);
                    const remove = choiceRemovePick(c);
                    if (remove) return pickRemove(remove.filter, i, c.result);
                    const cardPick = choiceCardPick(c);
                    if (cardPick) return pickOwned(cardPick.op === 'sell_card' ? '넘길 카드' : '바꿀 카드', i, c.result);
                    render(applyChoice(data, run, module, i), c.result);
                  },
                },
                h('span', { class: 'choice-mark' }, '▸'),
                h('span', {}, c.label),
                c.disabled ? h('small', { class: 'choice-why' }, c.disabled) : null,
              ),
            ),
            // 여관: 편성 바꾸기(선택지와 따로, 고르기 전에)
            opts.onEditLoadout
              ? h(
                  'button',
                  { class: 'btn choice choice-loadout', onclick: opts.onEditLoadout },
                  h('span', { class: 'choice-mark' }, '編'),
                  h('span', {}, '편성 바꾸기 — 여관에서만, 이번 스테이지에 얻은 카드는 그대로'),
                )
              : null,
          ),
    );
  };
  // 카드 바꾸기·팔기: 보유 카드 한 장을 고른다(필수 카드는 빠진다)
  const pickOwned = (title: string, index: number, resultText?: string) => {
    // 심연: 보유 목록이 없다. 덱의 카드 한 장
    if (run.abyss) return pickDeck('換', title, '덱의 카드 한 장을 고른다.', run.deck.filter((c) => data.cards.get(c.cardId)!.type !== 'status'), index, resultText);
    const ids = swappableCards(data, run).sort((a, b) => (data.cards.get(a)!.owner).localeCompare(data.cards.get(b)!.owner) || a.localeCompare(b));
    box.replaceChildren(
      panelHead('換', module.name, title),
      h('p', { class: 'choice-text' }, '보유 카드 한 장을 고른다. 편성에 들어 있었으면 그 자리도 바뀐다.'),
      ids.length
        ? h(
            'div',
            { class: 'reward-cards upgrade-cards' },
            ids.map((id) => {
              const el = cardView(data, { uid: `own_${id}`, cardId: id, level: run.collection[id] ?? 0 });
              el.addEventListener('click', () => render(applyChoice(data, run, module, index, id), resultText));
              return el;
            }),
          )
        : h('p', {}, '고를 카드가 없다.'),
      h('button', { class: 'btn', onclick: () => render() }, '돌아가기'),
    );
  };
  // 버리기(심연 휴식·틈의 거래): 덱에서 뺄 카드
  const pickRemove = (filter: Parameters<typeof removeCandidates>[2], index: number, resultText?: string) =>
    pickDeck('棄', '덜어 낼 카드', '덱에서 영영 빠진다.', removeCandidates(data, run, filter), index, resultText);
  const pickDeck = (seal: string, title: string, text: string, list: ReturnType<typeof removeCandidates>, index: number, resultText?: string) => {
    box.replaceChildren(
      panelHead(seal, module.name, title),
      h('p', { class: 'choice-text' }, text),
      list.length
        ? h(
            'div',
            { class: 'reward-cards upgrade-cards' },
            list.map((c) => {
              const el = cardView(data, c);
              el.addEventListener('click', () => render(applyChoice(data, run, module, index, c.uid), resultText));
              return el;
            }),
          )
        : h('p', {}, '고를 카드가 없다.'),
      h('button', { class: 'btn', onclick: () => render() }, '돌아가기'),
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

/** 받은 전리품 정보(받은 직후의 런 상태와 함께 그린다) */
export interface LootShown {
  loot: Loot;
  /** 칸이 가득해 못 넣은 물약 */
  potionLeft: string | null;
  /** 전투 결과로 일어난 일(모듈 clearEffects·하드코어로 잃은 동료 등) */
  notes?: string[];
}

/**
 * 전리품 줄: 골드·유물·물약. 물약 칸이 가득하면 바꿔 넣을 칸을 누르거나 두고 간다
 */
function lootLine(data: GameData, run: RunState, shown: LootShown): HTMLElement {
  const wrap = h('div', { class: 'loot' });
  if (shown.loot.gold > 0) sfx('coin');
  const render = () => {
    const { loot } = shown;
    const items: (HTMLElement | null)[] = [
      h('span', { class: 'loot-item' }, h('span', { class: 'gold-chip' }, h('i', {}), `+${loot.gold}`), h('small', {}, `골드 (지금 ${run.gold})`)),
      loot.relic ? h('span', { class: 'loot-item' }, relicChip(data, loot.relic), h('small', {}, data.relics.get(loot.relic)!.name)) : null,
      loot.potion && !shown.potionLeft ? h('span', { class: 'loot-item' }, potionChip(data, loot.potion), h('small', {}, data.potions.get(loot.potion)!.name)) : null,
    ];
    const swap = shown.potionLeft
      ? h(
          'div',
          { class: 'loot-swap' },
          h('span', {}, '물약 칸이 가득하다: '),
          potionChip(data, shown.potionLeft),
          h('b', {}, data.potions.get(shown.potionLeft)!.name),
          h('span', {}, ' — 버릴 칸을 누르면 바꿔 넣는다'),
          run.potions.map((p, i) =>
            potionChip(data, p, {
              extra: 'swap-slot',
              onClick: () => {
                swapPotion(run, i, shown.potionLeft!);
                shown.potionLeft = null;
                render();
              },
            }),
          ),
          h('button', { class: 'btn btn-small', onclick: () => ((shown.potionLeft = null), (shown.loot = { ...shown.loot, potion: null }), render()) }, '두고 간다'),
        )
      : null;
    const notes = shown.notes?.length ? h('ul', { class: 'gains loot-notes' }, shown.notes.map((n) => h('li', { class: n.includes('하드코어') ? 'fallen' : '' }, n))) : null;
    wrap.replaceChildren(h('div', { class: 'loot-items' }, items), notes ?? '', swap ?? '');
  };
  render();
  return wrap;
}

export function rewardView(data: GameData, options: string[], onPick: (cardId: string | null) => void, loot?: { run: RunState; shown: LootShown }): HTMLElement {
  return h(
    'section',
    { class: 'screen reward-screen backdrop' },
    h(
      'div',
      { class: 'choice-box panel reward-box' },
      panelHead('賞', '전투 승리', '전리품'),
      loot ? lootLine(data, loot.run, loot.shown) : null,
      h('p', { class: 'choice-text' }, '카드 한 장을 골라 덱에 더한다. 마음에 드는 카드가 없으면 넘어간다.'),
      h(
        'div',
        { class: 'reward-cards' },
        options.map((id) => {
          const el = loot ? offerCardView(data, loot.run, id) : cardView(data, id);
          el.addEventListener('click', () => onPick(id));
          return el;
        }),
      ),
      h('div', { class: 'panel-actions' }, h('button', { class: 'btn', onclick: () => onPick(null) }, '넘어가기')),
    ),
  );
}

/** 보스 전리품: 골드·물약을 받고, 유물 후보 중 하나를 고른다 */
export function bossLootView(data: GameData, run: RunState, shown: LootShown, onDone: () => void): HTMLElement {
  const choices = shown.loot.relicChoices;
  return h(
    'section',
    { class: 'screen reward-screen backdrop' },
    h(
      'div',
      { class: 'choice-box panel reward-box' },
      panelHead('寶', '보스 격파', '전리품'),
      lootLine(data, run, shown),
      choices.length ? h('p', { class: 'choice-text' }, '유물 하나를 고른다.') : null,
      h(
        'div',
        { class: 'relic-choices' },
        choices.map((id) => {
          const def = data.relics.get(id)!;
          return h(
            'button',
            {
              class: `relic-choice rarity-${def.rarity}`,
              onclick: () => {
                gainRelic(data, run, id);
                onDone();
              },
            },
            relicChip(data, id, 'big'),
            h('b', {}, def.name),
            h('span', {}, def.description),
            def.flavor ? h('small', {}, def.flavor) : null,
          );
        }),
      ),
      h('div', { class: 'panel-actions' }, h('button', { class: 'btn', onclick: onDone }, choices.length ? '고르지 않고 넘어가기' : '계속')),
    ),
  );
}

/**
 * 레벨업 화면(전투 뒤 지도로 가기 전): 오른 레벨과 최대 체력·치명타를 보여 주고,
 * upgradeEvery 레벨에 이르렀으면 그 동료의 카드 한 장을 고르게 한다(강화 뒤 모습으로 보여 준다)
 */
export function levelUpView(data: GameData, run: RunState, onDone: () => void): HTMLElement {
  const box = h('div', { class: 'choice-box panel levelup-box' });
  const crit = data.balance.leveling.critPerLevel;
  const done: string[] = [];
  const render = () => {
    const member = run.pendingUpgrades[0];
    const list = run.levelLog.map((l) =>
      h(
        'li',
        { class: 'lv-row', style: `--owner:${data.characters.get(l.id)?.color ?? '#888'}` },
        h('span', { class: 'lv-name' }, l.name),
        h('span', { class: 'lv-step' }, h('small', {}, 'Lv '), String(l.from), h('i', {}, ' → '), h('b', {}, String(l.to))),
        h('span', { class: 'lv-gain' }, `최대 체력 +${l.hpGain} · 치명 +${Math.round((l.to - l.from) * crit * 1000) / 10}%`),
      ),
    );
    const upgrade = member
      ? (() => {
          const name = data.characters.get(member)?.name ?? member;
          const seen = new Set<string>();
          const cands = levelUpgradeCandidates(data, run, member).filter((c) => {
            const key = `${c.cardId}:${c.level}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return h(
            'div',
            { class: 'lv-upgrade' },
            h('p', { class: 'choice-text' }, `${name}의 성장 — 카드 한 장을 골라 강화한다(+1). 강화 뒤 모습으로 보여 준다.`),
            h(
              'div',
              { class: 'reward-cards upgrade-cards' },
              cands.map((c) => {
                const el = cardView(data, { ...c, level: c.level + 1 });
                el.addEventListener('click', () => {
                  // 빠른 두 번 누름이 다음 동료의 카드까지 강화하지 않게, 한 번 고르면 이번 칸은 잠근다
                  if (box.dataset.picked === member) return;
                  box.dataset.picked = member;
                  done.push(...applyLevelUpgrade(data, run, c.uid));
                  setTimeout(() => {
                    delete box.dataset.picked;
                    render();
                  }, 250);
                });
                return el;
              }),
            ),
          );
        })()
      : null;
    // 강화할 카드가 하나도 없으면 그 차례는 건너뛴다
    if (member && !levelUpgradeCandidates(data, run, member).length) {
      applyLevelUpgrade(data, run, null);
      return render();
    }
    box.replaceChildren(
      panelHead('昇', '성장', '레벨이 올랐다'),
      list.length ? h('ul', { class: 'lv-list' }, list) : '',
      done.length ? h('ul', { class: 'gains' }, done.map((d) => h('li', {}, d))) : '',
      upgrade ?? h('div', { class: 'panel-actions' }, h('button', { class: 'btn btn-primary', onclick: () => ((run.levelLog = []), onDone()) }, '계속')),
    );
  };
  render();
  return h('section', { class: 'screen choice-screen levelup-screen' }, box);
}
