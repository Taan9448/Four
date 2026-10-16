// 대장간(대강화 +6~+10, GAME_DESIGN 16절 ⑦ — 2026-10-15 사용자 요청 "대장간에서 강화하는 느낌으로").
// 상점마다 카드 한 장만 모루에 올린다. 왼쪽 카드 · 가운데 성공 확률 고리와 망치 · 오른쪽 단계표(+6~+10) · 아래 비용과 소지 골드.
// 배경은 Codex 그림 bg_smithy(오기 전에는 화로 빛 그라데이션).
import type { GameData } from '../engine/data';
import { buyForge, forgeCandidates, forgeChance, forgeLocked, type ForgeResult } from '../engine/economy';
import { chooseEngraving } from '../engine/forge';
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

  const foot = () =>
    h(
      'footer',
      { class: 'smithy-foot' },
      h('span', {}, '강화 비용 ', h('i', { class: 'coin' }), String(price)),
      h('span', {}, '소지 골드 ', goldChip(run.gold)),
      h('small', {}, '이 대장간에서는 카드 한 장만 모루에 올린다(한 번 두드리면 바꿀 수 없다). 실패해도 단계는 그대로, 실패할수록 잘 된다.'),
    );

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
    const c = run.deck.find((x) => x.uid === (pending?.uid ?? picked));
    let body: HTMLElement;
    if (pending && c) body = engraveView(c);
    else if (c) body = anvilView(c);
    else body = pickView();
    root.replaceChildren(body, foot());
  };
  draw();
  openOverlay('대장간 — 대강화', root, { wide: true, className: 'smithy-panel', onClose: () => onChange(null) });
}
