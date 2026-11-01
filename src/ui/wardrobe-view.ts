// 옷장(GAME_DESIGN 13-2절, 2026-10-12 사용자 요청): 스토리를 마친 뒤 순례·심연에서 네 동료가 입는 옷을 고른다(카일 '은빛 기사검'은 처음부터·캠페인에서도).
// 위: 머리 판, 동료 줄(이름·입은 옷), 아래: 미리 보기(대기 그림) + 세트 목록(원래 옷 + 연 세트 · 잠긴 세트는 여는 조건).
import type { GameData } from '../engine/data';
import { spritesFor } from '../engine/state';
import { equipSkin, SKIN_ANIMS, skinFits, skinSpriteId, unlockText, type Wardrobe } from '../engine/wardrobe';
import { spriteSource } from '../render/assets';
import { SpritePlayer } from '../render/sprite-player';
import { loadPortrait, standingFor } from '../render/portrait';
import { h } from './dom';

/** 세트의 세 그림(대기·공격·피격)이 모두 실제 그림인가 — 아니면 원래 옷을 입는다 */
export function skinReady(data: GameData, setId: string, charId: string): boolean {
  return SKIN_ANIMS.every((a) => spriteSource(skinSpriteId(data, setId, charId, a)) === 'sprites');
}

/** 원래 옷의 대기 그림: 늘 입는 복장(flag 없는 outfits, 카일 붉은 검)이 실제 그림으로 왔으면 그것 */
function baseIdle(data: GameData, charId: string): string {
  const def = data.characters.get(charId)!;
  const outfit = spritesFor(def, []).idle;
  return outfit && spriteSource(outfit) === 'sprites' ? outfit : def.sprites.idle;
}

export interface WardrobeHandlers {
  onBack: () => void;
  /** 고른 옷을 저장한다 */
  onSave: (w: Wardrobe) => void;
}

export function wardrobeView(data: GameData, wardrobe: Wardrobe, handlers: WardrobeHandlers): HTMLElement {
  const chars = data.skins.characters.filter((id) => data.characters.has(id));
  let tab = chars[0];
  let player: SpritePlayer | null = null;
  const roster = h('div', { class: 'wd-roster', role: 'tablist', 'aria-label': '동료' });
  const preview = h('div', { class: 'panel wd-preview' });
  const list = h('div', { class: 'panel wd-list' });
  const setName = (id: string | undefined) => (id ? (data.skins.sets.find((s) => s.id === id)?.name ?? id) : '원래 옷');

  const draw = () => {
    roster.replaceChildren(
      ...chars.map((id) =>
        h(
          'button',
          { class: `wd-mate${id === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': String(id === tab), onclick: () => ((tab = id), draw()) },
          h('b', {}, data.characters.get(id)!.name),
          h('small', {}, setName(wardrobe.equipped[id])),
        ),
      ),
    );
    // 미리 보기: 입은 세트의 대기 그림(그림이 아직이면 원래 옷)
    const worn = wardrobe.equipped[tab];
    const ready = worn ? skinReady(data, worn, tab) : true;
    const canvas = h('canvas', { class: 'wd-canvas', width: 160, height: 160 }) as HTMLCanvasElement;
    player?.stop();
    player = new SpritePlayer(canvas);
    void player.play(worn && ready ? skinSpriteId(data, worn, tab, 'idle') : baseIdle(data, tab), { loop: true });
    // 반신 그림(2026-11-01): 반신 그림이 있는 세트(portrait)를 입으면 장면·컷인의 표정 셋도 이 옷 — 미리 보기에 함께 보인다
    const set = worn ? data.skins.sets.find((s) => s.id === worn) : undefined;
    const pic = h('div', { class: 'wd-portrait' });
    const shown = tab;
    void loadPortrait(tab, 'neutral', standingFor(data, tab, [], worn ? { [tab]: worn } : undefined)).then(
      (img) => img && shown === tab && pic.replaceChildren(h('img', { src: img.src, alt: '' })),
    );
    preview.replaceChildren(
      ...[
        h('div', { class: 'wd-figures' }, pic, canvas),
        h('h3', {}, `${data.characters.get(tab)!.name} — ${setName(worn)}`),
        worn && !ready ? h('p', { class: 'wd-note' }, '그림 준비 중 — 그림이 오면 바로 이 옷을 입는다. 그때까지는 원래 옷.') : null,
        set?.portrait ? h('p', { class: 'wd-note' }, '장면·컷인의 반신 그림(표정 셋)도 이 옷으로 바뀐다.') : null,
        h(
          'p',
          { class: 'wd-note' },
          worn && data.skins.sets.find((s) => s.id === worn)?.anyMode ? '캠페인·순례·심연 어디서나 입는다.' : '순례·심연에서 입는다. 캠페인(이야기)에서는 원래 옷.',
        ),
      ].filter((x): x is NonNullable<typeof x> => !!x),
    );
    const row = (id: string | null) => {
      const set = id ? data.skins.sets.find((s) => s.id === id)! : null;
      const open = !id || wardrobe.unlocked.includes(id);
      const on = (wardrobe.equipped[tab] ?? null) === id;
      return h(
        'div',
        { class: `wd-item${on ? ' on' : ''}${open ? '' : ' locked'}` },
        h(
          'div',
          { class: 'wd-item-text' },
          h('b', {}, set ? set.name : '원래 옷'),
          h('small', {}, set ? (open ? set.description : `🔒 ${unlockText(data, set.unlock)}`) : '이야기의 옷 그대로'),
          set && open && !skinReady(data, set.id, tab) ? h('em', { class: 'wd-pending' }, '그림 준비 중') : null,
        ),
        h(
          'button',
          {
            class: `btn btn-small${on ? ' btn-primary' : ''}`,
            disabled: !open || on,
            onclick: () => {
              equipSkin(data, wardrobe, tab, id);
              handlers.onSave(wardrobe);
              draw();
            },
          },
          on ? '입는 중' : open ? '입기' : '잠김',
        ),
      );
    };
    list.replaceChildren(h('h3', {}, '옷'), row(null), ...data.skins.sets.filter((s) => skinFits(data, s.id, tab)).map((s) => row(s.id)));
  };
  draw();
  const opened = wardrobe.unlocked.length;
  return h(
    'section',
    { class: 'screen wardrobe-screen' },
    h(
      'header',
      { class: 'panel wd-head' },
      h('div', {}, h('h2', {}, '옷장'), h('p', { class: 'hint' }, `연 옷 ${opened} / ${data.skins.sets.length}벌 — 캠페인·어려움·하드코어를 마치거나 심연·순례를 넘거나 수련 레벨이 오르면 열린다.`)),
      h('button', { class: 'btn', onclick: () => (player?.stop(), handlers.onBack()) }, '돌아가기'),
    ),
    roster,
    h('div', { class: 'wd-body' }, preview, list),
  );
}
