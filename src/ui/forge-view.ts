// 대장간(대강화 +6~+10, GAME_DESIGN 16절 ⑦ — 2026-10-15 사용자 요청 "대장간에서 강화하는 느낌으로").
// 상점마다 카드 한 장만 모루에 올린다. 왼쪽 카드 · 가운데 성공 확률 고리와 망치 · 오른쪽 단계표(+6~+10) · 아래 비용과 소지 골드.
// 배경은 Codex 그림 bg_smithy(오기 전에는 화로 빛 그라데이션).
import type { GameData } from '../engine/data';
import { buyForge, forgeCandidates, forgeChance, forgeLocked, rerollCandidates, rerollEngraving, type ForgeResult, type RerollResult } from '../engine/economy';
import { chooseEngraving, rerollPool } from '../engine/forge';
import type { RunState } from '../engine/run';
import { forgeMax, resolveCard, type CardInstance } from '../engine/state';
import { frameUrl } from '../render/assets';
import { sfx } from '../render/audio';
import { cardView } from './card-view';
import { h } from './dom';
import { goldChip } from './items';
import { openOverlay } from './overlay';

const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const STRIKE_MS = 750;

function reducedMotion(): boolean {
  return document.documentElement.classList.contains('no-motion') || document.body.classList.contains('no-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 단계표: +6~+10마다 기본 성공률과 얻는 것. 지난 단계는 새긴 각인, 지금 단계는 밝게 */
function stepsView(data: GameData, run: RunState, c: CardInstance): HTMLElement {
  const f = data.balance.upgrade.forge;
  const base = data.balance.upgrade.maxLevel;
  const card = resolveCard(data, c);
  const max = forgeMax(data, card.def);
  const awaken = data.forge.awakenings[card.def.owner] ?? data.forge.awakenings.common;
  const rows = f.chance.map((chance, i) => {
    const lv = base + 1 + i;
    const done = c.level >= lv;
    const now = c.level + 1 === lv;
    const mark = card.engravings[i];
    const gain =
      lv === max
        ? `각성 · ${awaken?.name ?? ''}`
        : done && mark
          ? `◆${mark.name} — ${mark.text}`
          : `수치 +${Math.round(f.levelMul * 100)}% · 각인 셋 중 하나`;
    return h(
      'li',
      { class: `smithy-step${done ? ' is-done' : ''}${now ? ' is-now' : ''}` },
      h('span', { class: 'smithy-step-lv' }, `+${lv}`),
      h('span', { class: 'smithy-step-gain' }, gain),
      h('span', { class: 'smithy-step-rate' }, done ? '완료' : pct(chance)),
    );
  });
  return h('aside', { class: 'smithy-steps' }, h('h3', {}, '대강화 단계'), h('ol', {}, ...rows.reverse()));
}

/** 성공 확률 고리(원형 막대) */
function gauge(chance: number, label: string): HTMLElement {
  return h(
    'div',
    { class: 'smithy-gauge', style: `--p:${Math.round(chance * 1000) / 10}`, role: 'img', 'aria-label': `${label} ${pct(chance)}` },
    h('div', { class: 'smithy-gauge-in' }, h('b', {}, pct(chance)), h('small', {}, label)),
  );
}

/**
 * 대장간 창. onChange: 골드·카드가 바뀔 때(상점 화면 갱신). 닫으면 onClose
 */
export function openSmithy(data: GameData, run: RunState, onChange: (r: ForgeResult | null) => void): void {
  const price = data.balance.upgrade.forge.price;
  const bg = frameUrl('bg_smithy', 1, { realOnly: true });
  const root = h('div', { class: `smithy${bg ? ' has-art' : ''}`, style: bg ? `--smithy-bg:url("${bg}")` : '' });
  let picked: string | null = forgeLocked(run);
  let last: ForgeResult | null = null;
  let striking = false;
  // 각인 다시 새기기(큐브, 2026-10-25): 대강화와 같은 창의 다른 탭
  const rollPrice = data.balance.upgrade.forge.rerollPrice;
  let mode: 'forge' | 'reroll' = forgeCandidates(data, run).length || run.forgePending || picked ? 'forge' : rerollCandidates(data, run).length ? 'reroll' : 'forge';
  let rollPicked: string | null = null;
  let lastRoll: RerollResult | null = null;

  const foot = () =>
    h(
      'footer',
      { class: 'smithy-foot' },
      mode === 'forge' ? h('span', {}, '강화 비용 ', h('i', { class: 'coin' }), String(price)) : h('span', {}, '다시 새기기 ', h('i', { class: 'coin' }), String(rollPrice)),
      h('span', {}, '소지 골드 ', goldChip(run.gold)),
      h(
        'small',
        {},
        mode === 'forge'
          ? '이 대장간에서는 카드 한 장만 모루에 올린다(한 번 두드리면 바꿀 수 없다). 실패해도 단계는 그대로, 실패할수록 잘 된다.'
          : '+6~+9 각인을 한 칸씩 골라, 그 칸에 받을 수 있는 다른 각인으로 무작위로 바꾼다(몇 번이든). +10 각성은 동료마다 하나라 바뀌지 않는다.',
      ),
    );

  // 탭: 대강화 · 각인 다시 새기기
  const tabs = () =>
    h(
      'div',
      { class: 'smithy-tabs', role: 'tablist' },
      ...(
        [
          ['forge', '대강화'],
          ['reroll', `각인 다시 새기기 · ${rollPrice}G`],
        ] as const
      ).map(([id, label]) =>
        h(
          'button',
          {
            class: `smithy-tab${mode === id ? ' is-on' : ''}`,
            role: 'tab',
            'aria-selected': String(mode === id),
            disabled: id === 'reroll' && !!run.forgePending,
            onclick: () => {
              mode = id;
              draw();
            },
          },
          label,
        ),
      ),
    );

  // 다시 새길 카드 고르기
  const rollPickView = () => {
    const list = rerollCandidates(data, run);
    return h(
      'div',
      { class: 'smithy-pick' },
      h('p', { class: 'smithy-lead' }, list.length ? '각인을 다시 새길 카드를 고른다.' : '각인을 새긴 카드(+6 이상)가 덱에 없다.'),
      h(
        'div',
        { class: 'smithy-pick-grid' },
        ...list.map((c) => {
          const el = cardView(data, c);
          el.classList.add('smithy-pick-card');
          el.setAttribute('role', 'button');
          el.tabIndex = 0;
          const go = () => {
            rollPicked = c.uid;
            lastRoll = null;
            draw();
          };
          el.addEventListener('click', go);
          el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go());
          return el;
        }),
      ),
    );
  };

  // 각인 칸마다 [다시 새기기]: 바뀐 칸은 잠깐 빛난다
  const rollView = (c: CardInstance) => {
    const card = resolveCard(data, c);
    const max = forgeMax(data, card.def);
    const base = data.balance.upgrade.maxLevel;
    const awaken = data.forge.awakenings[card.def.owner] ?? data.forge.awakenings.common;
    const rows = (c.marks ?? []).map((id, slot) => {
      const mod = data.forge.engravings.find((m) => m.id === id);
      const fresh = lastRoll?.ok && lastRoll.slot === slot;
      const left = rerollPool(data, c, slot).length;
      return h(
        'li',
        { class: `smithy-roll-row${fresh ? ' is-new' : ''}` },
        h('span', { class: 'smithy-step-lv' }, `+${base + 1 + slot}`),
        h('span', { class: 'smithy-roll-mark' }, h('b', {}, h('span', { class: 'engrave-glyph', 'aria-hidden': 'true' }, mod?.glyph ?? ''), `◆${mod?.name ?? id}`), h('small', {}, mod?.text ?? '')),
        h(
          'button',
          {
            class: 'btn btn-small btn-primary',
            disabled: run.gold < rollPrice || !left,
            title: left ? `바뀔 수 있는 각인 ${left}가지` : '바꿀 수 있는 다른 각인이 없다',
            onclick: () => {
              lastRoll = rerollEngraving(data, run, c.uid, slot);
              if (lastRoll.ok) {
                sfx('card_rare');
                root.classList.remove('flash-ok');
                void root.offsetWidth;
                root.classList.add('flash-ok');
              }
              onChange(lastRoll.ok ? { ok: true, success: true, level: c.level, choices: [], message: lastRoll.message } : lastRoll);
              draw();
            },
          },
          run.gold < rollPrice ? '골드 부족' : '다시 새기기',
        ),
      );
    });
    if (c.level >= max) rows.push(h('li', { class: 'smithy-roll-row is-fixed' }, h('span', { class: 'smithy-step-lv' }, `+${max}`), h('span', { class: 'smithy-roll-mark' }, h('b', {}, `각성 · ${awaken?.name ?? ''}`), h('small', {}, '동료마다 하나 — 바뀌지 않는다')), h('span', {})));
    const result = lastRoll ? h('p', { class: `smithy-result ${lastRoll.ok ? 'is-ok' : 'is-fail'}`, role: 'status' }, lastRoll.ok ? lastRoll.message : lastRoll.reason) : null;
    return h(
      'div',
      { class: 'smithy-roll' },
      h(
        'section',
        { class: 'smithy-card' },
        h('div', { class: 'smithy-card-name' }, h('b', {}, card.def.name), h('span', {}, `+${c.level}`)),
        h('div', { class: 'smithy-anvil' }, cardView(data, c)),
        h('button', { class: 'btn btn-small', onclick: () => ((rollPicked = null), (lastRoll = null), draw()) }, '다른 카드 고르기'),
      ),
      h('section', { class: 'smithy-steps smithy-roll-list' }, h('h3', {}, '새긴 각인'), h('ol', {}, ...rows), result),
    );
  };

  // 카드 고르기: 모루에 올릴 한 장
  const pickView = () => {
    const list = forgeCandidates(data, run);
    return h(
      'div',
      { class: 'smithy-pick' },
      h('p', { class: 'smithy-lead' }, list.length ? '모루에 올릴 카드 한 장을 고른다 — 영웅·전설 카드 +5부터.' : '덱에 +5가 된 영웅·전설 카드가 없다.'),
      h(
        'div',
        { class: 'smithy-pick-grid' },
        ...list.map((c) => {
          const el = cardView(data, c);
          el.classList.add('smithy-pick-card');
          el.setAttribute('role', 'button');
          el.tabIndex = 0;
          const go = () => {
            picked = c.uid;
            draw();
          };
          el.addEventListener('click', go);
          el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go());
          return el;
        }),
      ),
    );
  };

  // 각인 고르기(성공 뒤): 셋 중 하나를 새긴다
  const engraveView = (c: CardInstance) => {
    const p = run.forgePending!;
    return h(
      'div',
      { class: 'smithy-engrave' },
      h('p', { class: 'smithy-lead' }, `+${p.level} — 새길 각인을 하나 고른다(한 번 새기면 바꿀 수 없다).`),
      h(
        'div',
        { class: 'engrave-choices' },
        ...p.choices.map((id) => {
          const mod = data.forge.engravings.find((m) => m.id === id)!;
          return h(
            'div',
            { class: 'engrave-choice' },
            cardView(data, { ...c, marks: [...(c.marks ?? []), id] }),
            h('b', { class: 'engrave-name' }, h('span', { class: 'engrave-glyph', 'aria-hidden': 'true' }, mod.glyph), mod.name),
            h('small', {}, mod.text),
            h(
              'button',
              {
                class: 'btn btn-small btn-primary',
                onclick: () => {
                  const r = chooseEngraving(data, run, id);
                  last = r.ok ? { ok: true, success: true, level: p.level, choices: [], message: r.message } : r;
                  onChange(last);
                  draw();
                },
              },
              '새기기',
            ),
          );
        }),
      ),
    );
  };

  const anvilView = (c: CardInstance) => {
    const card = resolveCard(data, c);
    const max = forgeMax(data, card.def);
    const doneAll = c.level >= max;
    const { chance, base, fails } = forgeChance(data, run, c);
    const locked = !!forgeLocked(run);
    const result = last
      ? h('p', { class: `smithy-result ${last.ok && last.success ? 'is-ok' : 'is-fail'}`, role: 'status' }, last.ok ? last.message : last.reason)
      : null;
    const strike = () => {
      if (striking) return;
      striking = true;
      root.classList.add('is-striking');
      sfx('hit_heavy');
      const finish = () => {
        const r = buyForge(data, run, c.uid);
        last = r;
        striking = false;
        root.classList.remove('is-striking');
        if (r.ok) {
          sfx(r.success ? 'levelup' : 'discard');
          root.classList.remove('flash-ok', 'flash-fail');
          void root.offsetWidth;
          root.classList.add(r.success ? 'flash-ok' : 'flash-fail');
        }
        onChange(r);
        draw();
      };
      if (reducedMotion()) finish();
      else setTimeout(finish, STRIKE_MS);
    };
    return h(
      'div',
      { class: 'smithy-main' },
      h(
        'section',
        { class: 'smithy-card' },
        h('div', { class: 'smithy-card-name' }, h('b', {}, card.def.name), h('span', {}, doneAll ? `+${c.level} 각성` : `+${c.level} → +${c.level + 1}`)),
        h('div', { class: 'smithy-anvil' }, cardView(data, c)),
        locked ? null : h('button', { class: 'btn btn-small', onclick: () => ((picked = null), draw()) }, '다른 카드 고르기'),
      ),
      h(
        'section',
        { class: 'smithy-center' },
        doneAll ? gauge(1, '각성 완료') : gauge(chance, '성공 확률'),
        h('p', { class: 'smithy-pity' }, doneAll ? '더 두드릴 곳이 없다.' : fails ? `기본 ${pct(base)} · 실패 ${fails}번(+${pct(chance - base)})` : `기본 ${pct(base)}`),
        h(
          'button',
          {
            class: 'btn btn-primary smithy-hammer',
            disabled: doneAll || run.gold < price || striking,
            onclick: strike,
          },
          h('span', { class: 'smithy-hammer-ico', 'aria-hidden': 'true' }, '鎚'),
          doneAll ? '완성' : run.gold < price ? '골드가 모자란다' : '강화',
        ),
        result,
        h('div', { class: 'smithy-sparks', 'aria-hidden': 'true' }, ...Array.from({ length: 8 }, (_, i) => h('i', { style: `--i:${i}` }))),
      ),
      stepsView(data, run, c),
    );
  };

  const draw = () => {
    const pending = run.forgePending;
    if (pending) mode = 'forge';
    let body: HTMLElement;
    if (mode === 'reroll') {
      const r = rerollCandidates(data, run).find((x) => x.uid === rollPicked);
      body = r ? rollView(r) : rollPickView();
    } else {
      const c = run.deck.find((x) => x.uid === (pending?.uid ?? picked));
      if (pending && c) body = engraveView(c);
      else if (c) body = anvilView(c);
      else body = pickView();
    }
    root.replaceChildren(tabs(), body, foot());
  };
  draw();
  openOverlay('대장간 — 대강화', root, { wide: true, className: 'smithy-panel', onClose: () => onChange(null) });
}
