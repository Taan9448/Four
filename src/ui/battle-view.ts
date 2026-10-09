// 전투 화면. 엔진 상태(BattleState)를 그리고, 엔진이 남긴 이벤트를 순서대로 연출한다.
import { canPlay, cardOwner, describeIntent, endTurn, incomingDamage, needsTarget, playCard, potionTarget, previewCard, usePotion, type CardPreviewHit, type IncomingView } from '../engine/battle';
import { potionChip, relicChip } from './items';
import { critChance, hasSkipTurn } from '../engine/effects';
import { ELEMENT_LABEL } from '../engine/text';
import type { GameData } from '../engine/data';
import { resolveCard, spritesFor, type BattleEvent, type BattleState, type Combatant, type EnemyState } from '../engine/state';
import { flash, floatOver, flyClone, flyIn, hitStop, shake, sleep, toast } from '../render/fx';
import { speakerInfo } from '../engine/text';
import { loadPortrait, standingFor } from '../render/portrait';
import { RiftOverlay } from '../render/rift-overlay';
import { frameUrl, spriteSource } from '../render/assets';
import { SpritePlayer } from '../render/sprite-player';
import { sfx } from '../render/audio';
import { cardView } from './card-view';
import { openDeck } from './deck-view';
import { clear, h } from './dom';
import { affinityChip, elementMark, gaugeChip, INTENT_LABEL, intentIcon, statusChip } from './icons';
import { confirmDialog, openOverlay } from './overlay';
import { settings, settingsForm } from './settings';
import { installTooltips, pruneTooltip, tipAttrs } from './tooltip';
import { runTour, tourSeen } from './tour';

export interface BattleContext {
  title: string;
  subtitle: string;
  seed: string;
  scar: number;
  supportActive: boolean;
  bonusText?: string;
  /** 모듈 글(튜토리얼 안내·장면 묘사). 전투 화면 위에 한 줄로 */
  introText?: string;
  /** 전투 배경 에셋 id(실제 그림이 있을 때만 쓴다) */
  background?: string;
  /** 메뉴의 "타이틀로"(abandon=false: 저장은 이 전투 직전 지도에 남는다) / "런 포기"(abandon=true). 없으면 메뉴에 안 나온다 */
  onQuit?: (abandon: boolean) => void;
}

interface Unit {
  c: Combatant;
  el: HTMLElement;
  player: SpritePlayer;
  hp: HTMLElement;
  hpText: HTMLElement;
  block: HTMLElement;
  statuses: HTMLElement;
  /** 적: 의도 / 아군: 받을 피해 예고 */
  intent: HTMLElement;
  /** 고른(또는 마우스를 올린) 카드를 쓰면 이 유닛에 들어갈 피해 */
  preview: HTMLElement;
}

export class BattleView {
  readonly root: HTMLElement;
  private units = new Map<string, Unit>();
  private field!: HTMLElement;
  private fxLayer!: HTMLElement;
  private toasts!: HTMLElement;
  private handEl!: HTMLElement;
  private resEl!: HTMLElement;
  private logEl!: HTMLElement;
  private pilesEl!: HTMLElement;
  private riftEl!: HTMLElement;
  private turnEl!: HTMLElement;
  private endBtn!: HTMLButtonElement;
  private rift: RiftOverlay;
  private selected: number | null = null;
  /** 대상을 고르는 중인 물약 칸 */
  private potionSel: number | null = null;
  private relicEl!: HTMLElement;
  private potionEl!: HTMLElement;
  /** 마우스를 올린 손패 카드(피해 미리보기) */
  private hovered: number | null = null;
  private busy = false;
  private lastCard: string | null = null;
  /** 손패 카드 요소(uid별). 손패를 떠난 카드를 더미로 날려 보내고, 새로 들어온 카드를 뽑을 더미에서 끌어오는 데 쓴다 */
  private handEls = new Map<string, HTMLElement>();
  /** 이미 따로 날려 보낸 카드(낸 카드·턴 끝에 버린 카드): 손패에서 사라져도 다시 날리지 않는다 */
  private flown = new Set<string>();
  /** 적 턴 연출 동안은 손패를 다시 그리지 않는다(다음 턴 손패는 연출이 끝난 뒤 뽑아 온다) */
  private handFrozen = false;

  constructor(
    private data: GameData,
    private state: BattleState,
    private ctx: BattleContext,
    private onFinish: (state: BattleState) => void,
  ) {
    const bal = data.balance.rift;
    this.rift = new RiftOverlay(bal.max, bal.echoThreshold);
    this.root = this.build();
    this.refresh();
    if (ctx.bonusText) setTimeout(() => toast(this.toasts, ctx.bonusText!, 'support'), 300);
    this.startTours();
    // 시작 시 남은 이벤트(지원 규칙 등)는 기록만
    void this.animate(this.state.events.splice(0));
  }

  /**
   * 처음 하는 전투에서 화면 요소를 하나씩 짚는 안내(투어). 기본 안내를 본 뒤, 속성 약점·내성이 있는 적을 처음 만나면 속성 안내.
   * 브라우저에 기억해 한 번씩만(설정의 '안내 다시 보기'로 초기화)
   */
  private startTours(): void {
    const bal = this.data.balance;
    const hasAffinity = this.state.enemies.some((e) => {
      const d = this.data.enemies.get(e.defId);
      return !!d && (d.weak.length > 0 || d.resist.length > 0);
    });
    // 틈의 심장(모르데카이): 흐름 포식·매듭·고리 멈추기·격노를 처음 만날 때 짚는다
    const heart = this.state.enemies.find((e) => (e.statuses.flow_eater ?? 0) > 0 || (e.statuses.knot ?? 0) > 0);
    const heartTour = (then: () => void) => {
      if (!heart || tourSeen('battle-rift-heart')) return then();
      const enrage = this.data.enemies.get(heart.defId)?.enrage;
      runTour(
        [
          { target: '.unit-enemy .status-chip', title: '흐름 포식', text: '내공이나 마나를 쓴 카드의 피해는 먹혀서 붉은 "먹힘 +N"으로 뜨고, 그만큼 체력이 늘어난다. 비용 0인 카드로 때리거나 결을 쌓아라.' },
          { target: '.unit-enemy .chip-knot', title: '매듭 게이지', text: `결 노출을 ${bal.grain.knotThreshold}까지 쌓으면 매듭이 드러난다. 드러난 매듭에 '날 얹기'(비용 0)를 얹으면 크게 들어간다.` },
          { target: '.hand', title: '고리 멈추기', text: '내공을 모두 비우고 흐르지 않는 자가 된다. 그 차례에는 모르데카이가 하운을 보지 못하고, 결이 드러난다. 매듭을 열 준비에 쓴다.' },
          ...(enrage ? [{ target: '.unit-enemy .chip-enrage', title: '격노', text: `${enrage.afterTurn}턴부터 차례마다 더 세진다. 오래 끌수록 불리하다.` }] : []),
        ],
        { id: 'battle-rift-heart', once: true, onDone: then },
      );
    };
    const affinity = () => {
      if (!hasAffinity) return;
      runTour(
        [
          { target: '.unit-enemy .chip-weak, .unit-enemy .chip-resist', title: '속성 — 약점과 내성', text: `적 이름 아래 이름표. 약점 속성의 공격은 ${Math.round((bal.elements.weakMultiplier - 1) * 100)}% 더 들어가고, 내성 속성은 ${Math.round((1 - bal.elements.resistMultiplier) * 100)}% 덜 들어가며 상태도 붙지 않는다.` },
          { target: '.unit-enemy .intent', title: '속성 공격', text: `의도 옆 炎은 화염, 冷은 냉기 공격.\n화염에 맞으면 화상(차례 시작마다 피해), 냉기에 맞으면 냉기가 쌓이고 ${bal.elements.freezeAt}이 되면(보스는 ${bal.elements.bossFreezeAt}) 얼어붙어 한 차례 쉰다.` },
          { target: '.hand', title: '상극과 치명타', text: '화염은 냉기를 녹이고, 냉기는 화상을 끈다. 불의 정령에게는 냉기 카드(엘리아의 서리 바늘·서리바람)를.\n아군의 공격은 가끔 치명타(1.5배)가 터진다. 확률은 피해 미리보기에 적힌다.' },
        ],
        { id: 'battle-elements', once: true },
      );
    };
    const elements = () => heartTour(affinity);
    if (tourSeen('battle-basics')) return elements();
    runTour(
      [
        { target: '.hand', title: '손패', text: '카드를 눌러 쓴다. 카드 왼쪽 위의 금빛 점은 내공, 푸른 마름모는 마나 비용. 대상을 고르는 카드는 누른 뒤 적을 누른다.' },
        { target: '.orb.neigong', title: '내공', text: '매 턴 다시 차는 기본 비용.' },
        { target: '.orb.mana', title: '마나', text: '세계마다 차는 양이 다른 비용. 엘하임은 넉넉하고, 무림에서는 거의 차지 않는다.' },
        { target: '.unit-enemy .intent', title: '적의 의도', text: '적이 다음 차례에 할 행동. 피해 숫자와 노리는 아군이 보인다.' },
        { target: '.incoming', title: '받을 피해', text: '이대로 턴을 끝내면 이 아군이 받을 피해. 방어 카드를 쓰면 바로 줄어든다. 붉게 맥박치면 쓰러질 피해.' },
        { target: '.hand .card', title: '줄 피해 미리보기', text: '카드에 마우스를 올리거나 고르면, 맞을 적 위에 들어갈 피해가 뜬다. 힘·약화·취약·방어·약점이 모두 계산된 값이다.' },
        { target: '.b-rift', title: '균열', text: '내공과 마나를 함께 쓰는 융합 카드를 쓰면 쌓인다. 너무 쌓이면 틈의 잔향이 덱에 섞이고, 가득 차면 폭주한다.' },
        { target: '.btn-endturn', title: '턴 종료', text: '쓸 카드를 다 썼으면 턴을 끝낸다(단축키 E). 그다음 적이 움직인다.' },
      ],
      { id: 'battle-basics', once: true, onDone: elements },
    );
  }

  // ───────────────────────── 구성 ─────────────────────────

  /** 필드와 손패를 한 장면으로(GAME_DESIGN 13절): 배경 위에 위 HUD · 가운데 유닛 · 아래 자원/손패/턴 종료 */
  private build(): HTMLElement {
    this.resEl = h('div', { class: 'b-res' });
    this.fxLayer = h('div', { class: 'fx-layer' });
    this.toasts = h('div', { class: 'toasts' });
    this.handEl = h('div', { class: 'hand' });
    this.logEl = h('div', { class: 'log', 'aria-live': 'polite' });
    this.pilesEl = h('button', { class: 'chip piles', onclick: () => this.showPiles() });
    this.riftEl = h('div', { class: 'b-rift' });
    this.relicEl = h('div', { class: 'b-relics' }, this.state.relics.map((id) => relicChip(this.data, id)));
    this.potionEl = h('div', { class: 'b-potions' });
    this.turnEl = h('span', { class: 'turn' });
    this.endBtn = h('button', { class: 'btn btn-primary btn-endturn', onclick: () => this.onEndTurn() }, '턴 종료') as HTMLButtonElement;

    const partyEl = h('div', { class: 'side side-party' });
    const enemyEl = h('div', { class: 'side side-enemy' });
    for (const c of this.state.party) partyEl.appendChild(this.makeUnit(c).el);
    for (const c of this.state.enemies) enemyEl.appendChild(this.makeUnit(c).el);

    const bgUrl = frameUrl(this.ctx.background, 1, { realOnly: true });
    this.field = h(
      'div',
      { class: `b-scene world-${this.state.world}${bgUrl ? ' has-art' : ''}` },
      h('div', { class: 'b-bg', style: bgUrl ? `background-image:url("${bgUrl}")` : '' }),
      this.rift.el,
      h(
        'header',
        { class: 'b-hud' },
        h(
          'div',
          { class: 'b-hud-left' },
          h('div', { class: 'chip b-stage' }, h('b', {}, this.ctx.title), h('span', {}, this.ctx.subtitle)),
          h('div', { class: 'b-items' }, this.potionEl, this.state.relics.length ? this.relicEl : null),
        ),
        h(
          'div',
          { class: 'b-hud-right' },
          this.pilesEl,
          h('button', { class: 'btn btn-small', onclick: () => this.showPiles() }, '덱'),
          h('button', { class: 'btn btn-small', 'aria-label': '메뉴', onclick: () => this.showMenu() }, '⚙'),
        ),
      ),
      // 가운데 위: 이야기 글 → 그 아래 균열 게이지(잘 보이게 크게)
      h('div', { class: 'b-center' }, this.ctx.introText ? h('p', { class: 'battle-intro chip' }, this.ctx.introText) : null, this.riftEl),
      this.logEl,
      h('div', { class: 'units' }, partyEl, enemyEl),
      h('div', { class: 'shade' }),
      h('div', { class: 'dock' }, this.resEl, this.handEl, h('div', { class: 'endturn' }, this.turnEl, this.endBtn, h('small', { class: 'key-hint' }, 'E'))),
      this.fxLayer,
    );

    document.addEventListener('keydown', this.onKey);
    installTooltips();
    return h('section', { class: 'screen battle', 'data-seed': this.ctx.seed }, this.field, this.toasts);
  }

  private spriteFor(c: Combatant, anim: string): string | null {
    if (c.side === 'party') {
      const def = this.data.characters.get(c.defId);
      if (!def) return null;
      // 복장(못생긴 검·두린의 망치)은 실제 그림이 들어온 뒤에만 쓴다(임시 그림보다 기본 복장의 실제 그림이 낫다)
      const pick = (s: Record<string, string>) => s[anim] ?? (anim === 'skill' ? s.attack : undefined);
      const outfit = pick(spritesFor(def, this.state.flags));
      return (outfit && spriteSource(outfit) === 'sprites' ? outfit : pick(def.sprites)) ?? null;
    }
    const def = this.data.enemies.get(c.defId);
    return def?.sprite ? `${def.sprite}_${anim === 'skill' ? 'attack' : anim}` : null;
  }

  private makeUnit(c: Combatant): Unit {
    const canvas = h('canvas', { class: 'sprite' }) as HTMLCanvasElement;
    const enemyDef = c.side === 'enemy' ? this.data.enemies.get(c.defId) : undefined;
    const charDef = c.side === 'party' ? this.data.characters.get(c.defId) : undefined;
    const player = new SpritePlayer(canvas, {
      fallbackColor: charDef?.color ?? enemyDef?.color ?? '#5a4a5a',
      fallbackShape: enemyDef?.silhouette ?? (enemyDef?.tier === 'boss' ? 'boss' : 'humanoid'),
    });
    if (enemyDef?.tint) canvas.style.filter = enemyDef.tint;
    const hp = h('div', { class: 'hp-fill' });
    const hpText = h('div', { class: 'hp-text' });
    const block = h('div', { class: 'block-badge' });
    const statuses = h('div', { class: 'statuses' });
    const preview = h('div', { class: 'dmg-preview' });
    // 적: 의도 / 아군: 받을 피해 예고. 둘 다 머리 위
    const intent = h('div', { class: c.side === 'enemy' ? 'intent chip' : 'incoming' });
    const el = h(
      'div',
      {
        class: `unit unit-${c.side}${enemyDef?.tier === 'boss' ? ' unit-boss' : ''}`,
        style: `--scale:${enemyDef?.scale ?? charDef?.scale ?? 1}`,
        onclick: () => this.onUnitClick(c),
      },
      intent,
      h('div', { class: 'sprite-wrap' }, canvas, preview),
      h('div', { class: 'unit-name' }, c.name, c.side === 'party' && c.level ? h('small', { class: 'unit-lv' }, ` Lv${c.level}`) : ''),
      h('div', { class: 'unit-bars' }, block, h('div', { class: 'hp-bar' }, hp, hpText)),
      statuses,
    );
    const unit: Unit = { c, el, player, hp, hpText, block, statuses, intent, preview };
    this.units.set(c.uid, unit);
    void player.play(this.spriteFor(c, 'idle'), { loop: true });
    return unit;
  }

  // ───────────────────────── 갱신 ─────────────────────────

  private refresh(): void {
    const s = this.state;
    const bal = this.data.balance;
    const incoming = s.result ? new Map() : incomingDamage(s);
    for (const u of this.units.values()) {
      const c = u.c;
      u.hp.style.width = `${Math.max(0, (c.hp / c.maxHp) * 100)}%`;
      u.hpText.textContent = `${c.hp} / ${c.maxHp}`;
      u.block.textContent = c.block > 0 ? String(c.block) : '';
      u.block.style.display = c.block > 0 ? '' : 'none';
      if (c.block > 0) Object.entries(tipAttrs(`방어 ${c.block}`, '받는 피해를 먼저 막는다. 자기 턴이 시작되면 사라진다.')).forEach(([k, v]) => v && u.block.setAttribute(k, v));
      u.el.classList.toggle('down', c.downed);
      clear(u.statuses);
      for (const [id, n] of Object.entries(c.statuses)) if (n > 0 || this.data.statuses.get(id)?.kind === 'trait') u.statuses.appendChild(statusChip(this.data, id, n));
      // 적의 속성 약점·내성(정의에서 온다, 상태가 아님)
      const edef = c.side === 'enemy' ? this.data.enemies.get(c.defId) : undefined;
      if (edef && !c.downed) {
        for (const el of edef.weak) u.statuses.appendChild(affinityChip(this.data, 'weak', el));
        for (const el of edef.resist) u.statuses.appendChild(affinityChip(this.data, 'resist', el));
        // 매듭 게이지: 결 노출을 문턱까지 쌓으면 매듭이 드러난다(날 얹기)
        if ((c.statuses.knot ?? 0) > 0 && !(c.statuses.knot_exposed > 0)) {
          const at = bal.grain.knotThreshold;
          const n = Math.min(c.statuses.grain ?? 0, at);
          u.statuses.appendChild(gaugeChip('knot', `${n}/${at}`, `매듭 ${n}/${at}`, `매듭까지 결 노출 ${n} / ${at}`, `결 노출을 ${at}까지 쌓으면 매듭이 드러난다. 드러난 매듭에 '날 얹기'를 얹으면 크게 들어간다.`));
        }
        // 격노까지 남은 턴
        if (edef.enrage) {
          const left = edef.enrage.afterTurn - s.turn;
          const chip = gaugeChip('enrage', left > 0 ? `${left}` : '怒', left > 0 ? `격노까지 ${left}턴` : '격노', left > 0 ? `${left}턴 뒤 격노` : '격노', edef.enrage.text);
          if (left <= 0) chip.classList.add('on');
          u.statuses.appendChild(chip);
        }
      }
      clear(u.intent);
      if (c.side === 'enemy') this.renderIntent(u, c as EnemyState);
      else this.renderIncoming(u, c.downed ? undefined : incoming.get(c.uid));
    }

    // 위: 균열 게이지 · 버티기 / 더미
    const hot = s.rift >= bal.rift.echoThreshold;
    clear(this.riftEl);
    this.riftEl.className = `b-rift${hot ? ' hot' : ''}`;
    Object.entries(tipAttrs(`균열 ${s.rift} / ${bal.rift.max}`, `융합 카드를 쓰면 쌓인다. ${bal.rift.echoThreshold} 이상이면 틈의 잔향이 덱에 섞이고, ${bal.rift.max}이면 폭주한다.\n전투가 끝나면 일부가 상흔으로 남는다(지금 상흔 ${this.ctx.scar}).`, 'rift')).forEach(([k, v]) => v && this.riftEl.setAttribute(k, v));
    this.riftEl.append(
      h('div', { class: 'gauge' }, h('i', { style: `width:${(s.rift / bal.rift.max) * 100}%` })),
      h('span', {}, `균열 ${s.rift} / ${bal.rift.max}`),
      s.surviveTurns !== null ? h('span', { class: 'survive' }, `버티기 ${Math.min(s.turn, s.surviveTurns)} / ${s.surviveTurns}턴`) : '',
    );
    this.riftEl.querySelector('span')!.replaceChildren('균열 ', h('b', {}, s.rift), ` / ${bal.rift.max}`, hot ? h('em', {}, ' 잔향') : '');
    this.pilesEl.replaceChildren('뽑을', h('i', {}, s.draw.length), '버림', h('i', {}, s.discard.length), '소멸', h('i', {}, s.exhaust.length));
    this.pilesEl.title = '이번 전투의 카드 더미 보기';

    // 아래 왼쪽: 자원 구슬(내공 = 금빛 원, 마나 = 청색 마름모)
    clear(this.resEl);
    const breath = this.ctx.supportActive
      ? h(
          'div',
          { class: 'breath', ...tipAttrs('왕일검 — 청운호흡', '세 번 짧게, 한 번 길게. 박자가 맞는 턴에 지원이 붙는다.') },
          [1, 2, 3, 4].map((i) => h('span', { class: `beat${i === 4 ? ' long' : ''}${((s.turn - 1) % 4) + 1 === i ? ' now' : ''}` })),
        )
      : null;
    const worldName: Record<string, string> = { murim: '무림: 이월, 회복 없음', elheim: '엘하임: 시작에 가득, 턴마다 +2', nocturna: '마왕성', rift: '틈: 턴마다 줄어든다' };
    // 물약 칸: 누르면 쓴다(대상을 고르는 물약은 누른 뒤 대상을 누른다)
    clear(this.potionEl);
    s.potions.forEach((id, i) =>
      this.potionEl.appendChild(potionChip(this.data, id, { onClick: id && !this.busy && !s.result ? () => this.onPotion(i) : undefined, extra: this.potionSel === i ? 'selected' : '' })),
    );
    this.resEl.append(
      breath ?? '',
      h(
        'div',
        { class: `orb neigong${s.neigong === 0 ? ' empty' : ''}`, ...tipAttrs(`내공 ${s.neigong} / ${s.neigongMax}`, '매 턴 다시 차는 기본 비용.', 'neigong') },
        h('span', {}, s.neigong),
        h('small', {}, `내공 ${s.neigong}/${s.neigongMax}`),
      ),
      h(
        'div',
        { class: `orb mana${s.mana === 0 ? ' empty' : ''}`, ...tipAttrs(`마나 ${s.mana} / ${bal.mana.max}`, `세계마다 차는 양이 다른 유한 자원.\n${worldName[s.world] ?? s.world}`, 'mana') },
        h('span', {}, s.mana),
        h('small', {}, `마나 ${s.mana}/${bal.mana.max}`),
      ),
    );

    if (!this.handFrozen) this.renderHand();

    // 대상 표시
    if (this.selected !== null && !s.hand[this.selected]) this.selected = null;
    const need = this.potionSel !== null ? potionTarget(s, this.potionSel) : this.selected !== null ? needsTarget(s, s.hand[this.selected]) : null;
    for (const u of this.units.values()) {
      const ok = !u.c.downed && ((need === 'enemy' && u.c.side === 'enemy') || (need === 'ally' && u.c.side === 'party'));
      u.el.classList.toggle('targetable', ok);
    }

    this.renderPreview();

    clear(this.logEl);
    for (const line of s.log.slice(-5)) this.logEl.appendChild(h('div', {}, line));
    this.turnEl.textContent = `${s.turn}턴`;
    this.endBtn.disabled = this.busy || !!s.result;
    pruneTooltip();
  }

  /** 더미 칩의 숫자 자리(뽑을·버림·소멸) — 카드가 날아가고 오는 곳 */
  private pileRect(which: 'draw' | 'discard' | 'exhaust'): DOMRect {
    const marks = this.pilesEl.querySelectorAll('i');
    const el = marks[{ draw: 0, discard: 1, exhaust: 2 }[which]] ?? this.pilesEl;
    return el.getBoundingClientRect();
  }

  /**
   * 손패: 부채꼴(가운데가 가장 높고 바깥으로 기운다).
   * 손패를 떠난 카드는 마지막 자리에서 버림·소멸 더미로 날아가고, 새로 들어온 카드는 뽑을 더미에서 차례로 날아온다.
   */
  private renderHand(): void {
    const s = this.state;
    const now = new Set(s.hand.map((c) => c.uid));
    const leaving: { el: HTMLElement; rect: DOMRect; to: 'draw' | 'discard' | 'exhaust' }[] = [];
    for (const [uid, el] of this.handEls) {
      if (now.has(uid)) continue;
      if (this.flown.delete(uid) || !el.isConnected) continue;
      const to = s.exhaust.some((c) => c.uid === uid) ? 'exhaust' : s.discard.some((c) => c.uid === uid) ? 'discard' : 'draw';
      leaving.push({ el, rect: el.getBoundingClientRect(), to });
    }
    const first = this.handEls.size === 0;
    const prev = this.handEls;
    this.handEls = new Map();
    clear(this.handEl);
    const n = s.hand.length;
    const mid = (n - 1) / 2;
    const step = n > 1 ? Math.min(5, 36 / (n - 1)) : 0;
    this.handEl.style.setProperty('--overlap', `${n > 8 ? -46 : n > 6 ? -32 : n > 4 ? -18 : -8}px`);
    s.hand.forEach((inst, i) => {
      const check = canPlay(s, i);
      const el = cardView(this.data, inst, { disabled: check.ok ? undefined : check.reason, selected: this.selected === i });
      const off = i - mid;
      el.style.setProperty('--rot', `${off * step}deg`);
      el.style.setProperty('--lift', `${Math.round(off * off * step * 0.7)}px`);
      el.style.zIndex = String(10 + i);
      el.addEventListener('click', () => this.onCardClick(i));
      el.addEventListener('mouseenter', () => this.setHover(i));
      el.addEventListener('mouseleave', () => this.setHover(null));
      this.handEl.appendChild(el);
      this.handEls.set(inst.uid, el);
    });

    const ms = 260 * Math.max(0.6, settings.speed);
    for (const x of leaving) void flyClone(x.el, this.pileRect(x.to), { ms, scale: 0.25 }, x.rect);
    const arriving = s.hand.filter((c) => !prev.has(c.uid)).map((c) => this.handEls.get(c.uid)!);
    if (!arriving.length) return;
    // 처음 그릴 때는 아직 화면에 붙기 전이라 한 박자 뒤에
    const run = () => {
      const from = this.pileRect('draw');
      arriving.forEach((el, k) => flyIn(el, from, k * 70 * settings.speed, ms));
    };
    if (first || !this.handEl.isConnected) requestAnimationFrame(run);
    else run();
  }

  /** 카드가 날아갈 자리: 고른 대상 → 공격이면 적 진영 → 그 밖에는 카드 주인(없으면 우리 진영) */
  private flyTarget(handIndex: number, targetUid?: string): DOMRect | null {
    const s = this.state;
    const inst = s.hand[handIndex];
    if (!inst) return null;
    const wrap = (uid: string | undefined) => (uid ? this.units.get(uid)?.el.querySelector<HTMLElement>('.sprite-wrap')?.getBoundingClientRect() : undefined);
    const t = wrap(targetUid);
    if (t) return t;
    if (resolveCard(this.data, inst.cardId).def.type === 'attack') return this.field.querySelector<HTMLElement>('.side-enemy')?.getBoundingClientRect() ?? null;
    return wrap(cardOwner(s, inst)?.uid) ?? this.field.querySelector<HTMLElement>('.side-party')?.getBoundingClientRect() ?? null;
  }

  /** 낸 카드를 대상 쪽으로 날린다(원본은 감추고, 손패에서 빠질 때 다시 날리지 않게 표시) */
  private async flyPlayed(handIndex: number, targetUid?: string): Promise<void> {
    const inst = this.state.hand[handIndex];
    const el = inst ? this.handEls.get(inst.uid) : undefined;
    const to = this.flyTarget(handIndex, targetUid);
    if (!inst || !el || !to) return;
    this.flown.add(inst.uid);
    el.style.visibility = 'hidden';
    await flyClone(el, to, { ms: 320 * Math.max(0.6, settings.speed), scale: 0.4 });
  }

  /** 턴 종료: 남길(유지) 카드를 뺀 손패를 버린 더미로 차례로 날린다 */
  private async flyDiscardHand(): Promise<void> {
    const to = this.pileRect('discard');
    const ms = 220 * Math.max(0.6, settings.speed);
    const flights = this.state.hand
      .filter((c) => !resolveCard(this.data, c.cardId).keywords.includes('retain'))
      .map((c, k) => {
        const el = this.handEls.get(c.uid);
        if (!el) return Promise.resolve();
        this.flown.add(c.uid);
        const p = flyClone(el, to, { ms, scale: 0.25, delay: k * 40 });
        // 복제본이 뜬 다음 원본을 감춘다
        requestAnimationFrame(() => (el.style.visibility = 'hidden'));
        return p;
      });
    await Promise.all(flights);
  }

  /** 적 머리 위: 의도 아이콘 · 행동 이름 · 피해 · 노리는 아군 */
  private renderIntent(u: Unit, enemy: EnemyState): void {
    const s = this.state;
    const view = enemy.downed ? null : describeIntent(s, enemy);
    u.intent.style.display = view ? '' : 'none';
    if (!view) return;
    const target = view.intent.targetUid ? s.party.find((p) => p.uid === view.intent.targetUid) : undefined;
    const d = view.damage;
    const dmg = d ? `${d.perHit}${d.times > 1 ? `×${d.times}` : ''}` : '';
    const skip = hasSkipTurn(s, enemy);
    u.intent.classList.toggle('skipped', skip);
    u.intent.append(intentIcon(view.intent.kind), h('span', {}, view.intent.name), dmg ? h('b', {}, dmg) : '', d?.element ? elementMark(d.element) : '', d?.all ? h('span', { class: 'intent-target' }, '전체') : target ? h('span', { class: 'intent-target' }, `→ ${target.name}`) : '');
    const body = [
      `${INTENT_LABEL[view.intent.kind] ?? ''}${d ? ` · 1회 ${d.perHit}${d.times > 1 ? ` × ${d.times}회` : ''}${d.all ? ' · 아군 전체' : ''}` : ''}`,
      d?.element ? `${ELEMENT_LABEL[d.element]} 공격: 맞으면 ${this.data.statuses.get(this.data.balance.elements[d.element].status)?.name} ${this.data.balance.elements[d.element].stacks}` : '',
      target && !d?.all ? `노리는 대상: ${target.name}` : '',
      skip ? '움직이지 못해 이번 차례에는 행동하지 않는다.' : '',
    ].filter(Boolean);
    Object.entries(tipAttrs(view.intent.name, body.join('\n'), view.intent.kind)).forEach(([k, v]) => v !== undefined && u.intent.setAttribute(k, v));
  }

  /** 아군 머리 위: 이번 적 턴에 받을 피해(방어를 뺀 값). 쓰러질 피해면 진하게 */
  private renderIncoming(u: Unit, v: IncomingView | undefined): void {
    u.intent.style.display = v && v.raw > 0 ? '' : 'none';
    if (!v || v.raw === 0) return;
    u.intent.className = `incoming${v.lethal ? ' lethal' : ''}${v.hpLoss === 0 ? ' safe' : ''}`;
    u.intent.append(intentIcon('attack'), h('b', {}, v.hpLoss), v.blocked > 0 ? h('span', { class: 'blk' }, `(${v.raw} − 방어 ${v.blocked})`) : '');
    const lines = v.hits.map((x) => `${x.enemyName} · ${x.moveName} ${x.perHit}${x.times > 1 ? `×${x.times}` : ''}`);
    if (v.blocked > 0) lines.push(`방어로 ${v.blocked} 막음`);
    if (v.lethal) lines.push('이대로면 쓰러진다');
    Object.entries(tipAttrs(`받을 피해 ${v.hpLoss}`, lines.join('\n'), 'attack')).forEach(([k, v2]) => v2 !== undefined && u.intent.setAttribute(k, v2));
  }

  private setHover(i: number | null): void {
    if (this.hovered === i) return;
    this.hovered = i;
    this.renderPreview();
  }

  /**
   * 피해 미리보기: 고른 카드(없으면 마우스를 올린 카드)를 썼을 때 들어갈 피해를 유닛 위에 보인다.
   * 엔진이 복제 상태로 실제로 써 보고 계산하므로 힘·약화·취약·결 노출·방어가 모두 반영된다.
   * 대상을 고르는 카드는 적마다 "그 적을 노렸을 때"의 값.
   */
  private renderPreview(): void {
    for (const u of this.units.values()) {
      clear(u.preview);
      u.preview.className = 'dmg-preview';
    }
    const s = this.state;
    const i = this.selected ?? this.hovered;
    if (i === null || this.busy || s.result || !s.hand[i]) return;
    const need = needsTarget(s, s.hand[i]);
    // 치명타는 미리보기에 넣지 않고(운을 미리 보이지 않게) 확률만 적는다
    const owner = cardOwner(s, s.hand[i]);
    const crit = owner ? critChance(s, owner) : 0;
    const show = (uid: string, v: CardPreviewHit | undefined) => {
      const u = this.units.get(uid);
      if (!u || !v || u.c.downed) return;
      u.preview.className = `dmg-preview on${v.kills ? ' kill' : ''}${v.hpLoss === 0 ? ' blocked' : ''}`;
      u.preview.append(
        h('b', {}, v.hpLoss > 0 ? `−${v.hpLoss}` : '0'),
        v.hits > 1 ? h('small', {}, `${v.hits}회`) : '',
        v.blocked > 0 ? h('small', { class: 'blk' }, `방어 ${v.blocked}`) : '',
        v.kills ? h('small', { class: 'ko' }, '처치') : '',
        crit > 0 && v.hpLoss > 0 && u.c.side === 'enemy' ? h('small', { class: 'cr' }, `치명 ${Math.round(crit * 100)}%`) : '',
      );
    };
    if (need === 'enemy') {
      for (const e of s.enemies) if (!e.downed) show(e.uid, previewCard(s, i, e.uid).get(e.uid));
      return;
    }
    const ally = need === 'ally' ? s.party.find((p) => !p.downed)?.uid : undefined;
    for (const [uid, v] of previewCard(s, i, ally)) show(uid, v);
  }

  // ───────────────────────── 입력 ─────────────────────────

  private onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.overlay, .tour')) return; // 창·안내가 떠 있으면 전투 단축키를 받지 않는다
    if (e.key === 'Escape') {
      this.selected = null;
      this.potionSel = null;
      this.refresh();
    } else if (e.key === 'e' || e.key === 'E') this.onEndTurn();
  };

  private onCardClick(i: number): void {
    if (this.busy || this.state.result) return;
    this.potionSel = null;
    if (this.selected === i) {
      this.selected = null;
      return this.refresh();
    }
    const check = canPlay(this.state, i);
    if (!check.ok) {
      toast(this.toasts, check.reason, 'danger');
      return;
    }
    const need = needsTarget(this.state, this.state.hand[i]);
    // 바로 쓰는 카드: 고른 카드를 풀어 둔다(손패가 줄면 고른 칸이 다른 카드·빈 칸을 가리키게 된다)
    if (!need) {
      this.selected = null;
      return void this.act(() => playCard(this.state, i), () => this.flyPlayed(i));
    }
    // 대상이 하나뿐이면 바로 사용
    const pool = (need === 'enemy' ? this.state.enemies : this.state.party).filter((c) => !c.downed);
    if (pool.length === 1) {
      this.selected = null;
      return void this.act(() => playCard(this.state, i, pool[0].uid), () => this.flyPlayed(i, pool[0].uid));
    }
    this.selected = i;
    this.refresh();
  }

  /** 물약: 대상이 필요 없으면 바로, 있으면 고르는 상태로(같은 칸을 다시 누르면 취소) */
  private onPotion(slot: number): void {
    if (this.busy || this.state.result) return;
    if (this.potionSel === slot) {
      this.potionSel = null;
      return this.refresh();
    }
    this.selected = null;
    const need = potionTarget(this.state, slot);
    if (!need) {
      this.potionSel = null;
      return void this.act(() => usePotion(this.state, slot));
    }
    const pool = (need === 'enemy' ? this.state.enemies : this.state.party).filter((c) => !c.downed);
    if (pool.length === 1) return void this.act(() => usePotion(this.state, slot, pool[0].uid));
    this.potionSel = slot;
    this.refresh();
  }

  private onUnitClick(c: Combatant): void {
    if (this.busy) return;
    if (this.potionSel !== null) {
      const slot = this.potionSel;
      const need = potionTarget(this.state, slot);
      if ((need === 'enemy' && c.side !== 'enemy') || (need === 'ally' && c.side !== 'party') || c.downed) return;
      this.potionSel = null;
      return void this.act(() => usePotion(this.state, slot, c.uid));
    }
    if (this.selected === null) return;
    const i = this.selected;
    const need = needsTarget(this.state, this.state.hand[i]);
    if ((need === 'enemy' && c.side !== 'enemy') || (need === 'ally' && c.side !== 'party') || c.downed) return;
    this.selected = null;
    void this.act(() => playCard(this.state, i, c.uid), () => this.flyPlayed(i, c.uid));
  }

  private onEndTurn(): void {
    if (this.busy || this.state.result) return;
    this.selected = null;
    this.potionSel = null;
    void this.act(
      () => endTurn(this.state),
      () => this.flyDiscardHand(),
      true,
    );
  }

  /**
   * 행동 하나: 먼저 카드 연출(before: 낸 카드·버리는 손패가 날아감) → 엔진 실행 → 이벤트 연출.
   * freezeHand: 적 턴처럼 연출이 끝난 뒤에야 손패를 다시 그린다(새 손패는 그때 뽑아 온다)
   */
  private async act(fn: () => unknown, before?: () => Promise<void>, freezeHand = false): Promise<void> {
    this.busy = true;
    this.hovered = null;
    this.endBtn.disabled = true;
    this.renderPreview();
    if (before) await before();
    this.handFrozen = freezeHand;
    // 여기서 다시 그리지 않는다: 낸 카드가 손패에 잠깐 되살아나거나, 피해가 연출보다 먼저 보이지 않게(연출이 이벤트마다 다시 그린다)
    const r = fn() as { ok?: boolean; reason?: string } | undefined;
    if (r && r.ok === false && r.reason) toast(this.toasts, r.reason, 'danger');
    await this.animate(this.state.events.splice(0));
    this.busy = false;
    this.handFrozen = false;
    this.refresh();
    if (this.state.result) this.showResult();
  }

  // ───────────────────────── 연출 ─────────────────────────

  private async animate(events: BattleEvent[]): Promise<void> {
    for (const [idx, ev] of events.entries()) {
      switch (ev.type) {
        case 'turn':
          if (ev.turn > 1) {
            toast(this.toasts, `${ev.turn}턴`, 'info');
            sfx('turn');
          }
          break;
        case 'card': {
          this.lastCard = ev.cardId;
          sfx('card');
          const line = resolveCard(this.data, ev.cardId).def.castLine;
          if (line && settings.cutIn) await this.cutIn(ev.cardId, line);
          break;
        }
        case 'attack':
          await this.playAttack(ev.sourceUid, ev.targetUids);
          break;
        case 'damage': {
          const u = this.units.get(ev.targetUid);
          if (!u) break;
          if (ev.absorbed) floatOver(this.fxLayer, u.el, `먹힘 +${ev.amount}`, 'absorb');
          else {
            // 소리: 맞은 쪽 자리(적 오른쪽, 일행 왼쪽)에서. 막혀서 0이면 막는 소리
            const pan = u.c.side === 'enemy' ? 0.35 : -0.35;
            // 치명타는 금빛 큰 숫자, 결은 푸른 숫자. 약점·내성은 작은 글자를 하나 더
            const heavy = ev.amount >= 15;
            floatOver(this.fxLayer, u.el, ev.crit ? `치명 ${ev.amount}!` : ev.grain ? `${ev.amount}!` : String(ev.amount), ev.crit ? 'critical' : ev.grain ? 'crit' : heavy ? 'heavy' : 'damage');
            if (ev.weak) floatOver(this.fxLayer, u.el, '약점!', 'weak');
            else if (ev.resisted) floatOver(this.fxLayer, u.el, '내성', 'resist');
            if (ev.blocked) floatOver(this.fxLayer, u.el, `막음 ${ev.blocked}`, 'block');
            // 이 피해로 쓰러지는가(엔진은 피해 바로 뒤에 쓰러짐 이벤트를 남긴다)
            const kill = events.slice(idx + 1, idx + 4).some((e) => (e.type === 'downed' || e.type === 'death') && e.uid === ev.targetUid);
            sfx(ev.amount <= 0 ? 'block' : ev.crit || kill ? 'crit' : ev.amount >= 15 ? 'hit_heavy' : 'hit', { pan });
            if (ev.amount > 0 && (ev.element === 'fire' || ev.element === 'ice')) sfx(ev.element, { pan, volume: 0.7 });
            const fx = this.hitFxFor(ev);
            if (fx) void this.playFx(fx, ev.targetUid);
            if (!u.c.downed) void u.player.play(this.spriteFor(u.c, 'hit')).then(() => this.idle(u));
            flash(u.el, ev.grain ? 'blue' : 'white');
            this.refresh();
            if (ev.amount > 0) {
              // 세기: 피해가 클수록, 치명타·처치면 가장 세게. 맞은 쪽은 공격 반대편으로 밀린다
              const power = ev.crit || kill ? 1 : Math.min(0.85, 0.25 + ev.amount / 28);
              const dir = u.c.side === 'enemy' ? 1 : -1;
              shake(u.el, power, dir);
              if (ev.crit || kill || ev.amount >= 20) shake(this.field, power * 0.45, dir);
              // 타격 멈춤: 보통 55ms, 큰 피해 90ms, 치명타·처치 120ms(빠른 속도면 줄인다)
              await hitStop((ev.crit || kill ? 120 : heavy ? 90 : 55) * Math.max(0.5, settings.speed));
            }
          }
          if (ev.absorbed) this.refresh();
          await this.wait(110);
          break;
        }
        case 'block': {
          const u = this.units.get(ev.targetUid);
          if (u) floatOver(this.fxLayer, u.el, `+${ev.amount} 방어`, 'block');
          sfx('block', { volume: 0.6 });
          this.refresh();
          await this.wait(100);
          break;
        }
        case 'heal': {
          const u = this.units.get(ev.targetUid);
          if (u) floatOver(this.fxLayer, u.el, `+${ev.amount}`, 'heal');
          sfx('heal');
          this.refresh();
          await this.wait(100);
          break;
        }
        case 'status': {
          const u = this.units.get(ev.targetUid);
          if (u && ev.stacks > 0) {
            floatOver(this.fxLayer, u.el, this.data.statuses.get(ev.status)?.name ?? ev.status, 'status');
            sfx('status', { volume: 0.6 });
          }
          if (ev.status === 'knot_exposed' && ev.stacks > 0) toast(this.toasts, '매듭이 드러났다 — 날 얹기!', 'support');
          break;
        }
        case 'rift':
          this.rift.update(ev.value);
          this.refresh();
          if (ev.delta > 0) {
            flash(this.field, 'blue');
            sfx('rift', { volume: 0.7 });
          }
          await this.wait(80);
          break;
        case 'surge':
          toast(this.toasts, '균열 폭주! 하늘이 갈라진다', 'danger');
          void this.rift.surge();
          sfx('surge');
          shake(this.field, 1);
          flash(this.field, 'red');
          await this.wait(350);
          break;
        case 'echo':
          toast(this.toasts, '틈의 잔향이 덱에 섞였다', 'danger');
          break;
        case 'support':
          toast(this.toasts, `왕일검 — ${ev.name}`, 'support');
          await this.wait(250);
          break;
        case 'relic': {
          // 유물이 일하면 그 표식이 번쩍인다
          sfx('relic');
          const chip = this.relicEl.querySelector<HTMLElement>(`[data-relic="${ev.relicId}"]`);
          if (chip) {
            chip.classList.remove('fired');
            void chip.offsetWidth;
            chip.classList.add('fired');
          }
          this.refresh();
          await this.wait(120);
          break;
        }
        case 'potion':
          toast(this.toasts, `물약 — ${ev.name}`, 'support');
          sfx('potion');
          this.refresh();
          await this.wait(150);
          break;
        case 'dead_draw':
          toast(this.toasts, `쓰러진 동료의 카드(${this.data.cards.get(ev.cardId)?.name})가 버려졌다`, 'info');
          break;
        case 'downed':
        case 'death': {
          const u = this.units.get(ev.uid);
          if (u) {
            u.player.stop();
            u.el.classList.add('down');
            sfx('down', { pan: u.c.side === 'enemy' ? 0.35 : -0.35 });
          }
          await this.wait(200);
          break;
        }
        case 'transform': {
          // 보스 2단계: 같은 자리에서 새 모습(실루엣·크기·이름)으로 다시 만든다
          const old = this.units.get(ev.uid);
          if (old) {
            old.player.stop();
            const fresh = this.makeUnit(old.c);
            old.el.replaceWith(fresh.el);
            toast(this.toasts, `${ev.from} — ${ev.text}`, 'danger');
            sfx('transform');
            shake(this.field, 0.8);
            flash(this.field, 'red');
            this.refresh();
          }
          await this.wait(600);
          break;
        }
        case 'enrage': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, '격노', 'crit');
          toast(this.toasts, ev.text, 'danger');
          shake(this.field, 0.6);
          await this.wait(500);
          break;
        }
        case 'power': {
          // 파워(발동 상태)가 일어났다: 그 상태 이름을 띄운다
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, `${this.data.statuses.get(ev.status)?.glyph ?? ''} ${this.data.statuses.get(ev.status)?.name ?? ev.status}`, 'status');
          await this.wait(160);
          break;
        }
        case 'skip': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, '움직이지 못함', 'status');
          await this.wait(250);
          break;
        }
        case 'enemy_action': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, ev.moveName, 'status');
          this.lastCard = null;
          await this.wait(200);
          break;
        }
        case 'result':
          sfx(ev.result === 'victory' ? 'victory' : 'defeat');
          break;
      }
    }
  }

  /** 전투 연출 대기(설정의 전투 속도 배율) */
  private wait(ms: number): Promise<void> {
    return sleep(ms * settings.speed);
  }

  private showPiles(): void {
    const s = this.state;
    openDeck(this.data, '이번 전투의 카드', [
      { label: '손패', cards: s.hand },
      { label: '뽑을 더미', cards: s.draw, hint: ' — 순서는 감춤' },
      { label: '버린 더미', cards: s.discard },
      { label: '소멸', cards: s.exhaust },
    ]);
  }

  private showMenu(): void {
    const quit = this.ctx.onQuit;
    const leave = (abandon: boolean) => {
      menu.close();
      this.finish(false);
      quit!(abandon);
    };
    const menu = openOverlay(
      '메뉴',
      h(
        'div',
        { class: 'menu' },
        settingsForm(),
        quit
          ? h(
              'div',
              { class: 'menu-actions' },
              h(
                'button',
                {
                  class: 'btn',
                  title: '진행은 이 전투에 들어오기 직전의 지도에서 이어집니다',
                  onclick: () => leave(false),
                },
                '타이틀로',
              ),
              h(
                'button',
                {
                  class: 'btn btn-danger',
                  onclick: async () => {
                    if (await confirmDialog('런 포기', '지금 런을 끝내고 저장을 지웁니다. 되돌릴 수 없습니다.', '포기')) leave(true);
                  },
                },
                '런 포기',
              ),
            )
          : null,
      ),
    );
  }

  private idle(u: Unit): void {
    if (!u.c.downed) void u.player.play(this.spriteFor(u.c, 'idle'), { loop: true });
  }

  /** 공격 애니메이션을 재생하고, hit 이벤트 프레임에서 다음 연출(피해 숫자)로 넘어간다 */
  private async playAttack(sourceUid: string, targetUids: string[]): Promise<void> {
    const u = this.units.get(sourceUid);
    if (!u) return;
    const card = u.c.side === 'party' && this.lastCard ? resolveCard(this.data, this.lastCard).def : null;
    const anim = card?.anim ?? (card && card.type !== 'attack' ? 'skill' : 'attack');
    let hitResolve!: () => void;
    const hit = new Promise<void>((r) => (hitResolve = r));
    const done = u.player.play(this.spriteFor(u.c, anim), { onEvent: (name) => name === 'hit' && hitResolve() });
    void done.then(() => {
      hitResolve();
      this.idle(u);
    });
    if (card?.fx) for (const t of targetUids) void this.playFx(card.fx, t);
    await Promise.race([hit, this.wait(900)]);
  }

  /**
   * 피해마다 맞은 자리의 피격 이펙트(GAME_DESIGN 13절): 결 노출 → 결, 방어로 모두 막음 → 막힘, 그 밖에는 공격한 쪽의 hitFx.
   * 카드에 fx(검광 등)가 있으면 공격 연출에서 이미 나가므로 겹치지 않는다. 독처럼 출처가 없는 피해는 이펙트 없음
   */
  private hitFxFor(ev: Extract<BattleEvent, { type: 'damage' }>): string | null {
    if (ev.absorbed) return null;
    if (ev.grain) return 'fx_hit_grain';
    if (ev.amount === 0 && ev.blocked > 0) return 'fx_block';
    const src = ev.sourceUid ? this.units.get(ev.sourceUid)?.c : undefined;
    if (!src) return null;
    if (src.side === 'enemy') return this.data.enemies.get(src.defId)?.hitFx ?? 'fx_hit_strike';
    const card = this.lastCard ? resolveCard(this.data, this.lastCard).def : null;
    if (card?.fx) return null;
    return card?.hitFx ?? 'fx_hit_strike';
  }

  private async playFx(fxId: string, targetUid: string): Promise<void> {
    const t = this.units.get(targetUid);
    if (!t) return;
    const canvas = h('canvas', { class: 'fx-canvas' }) as HTMLCanvasElement;
    const lr = this.fxLayer.getBoundingClientRect();
    const tr = t.el.getBoundingClientRect();
    const size = Math.max(tr.width, tr.height * 0.8);
    canvas.style.left = `${tr.left - lr.left + tr.width / 2 - size / 2}px`;
    canvas.style.top = `${tr.top - lr.top + tr.height * 0.1}px`;
    canvas.style.width = canvas.style.height = `${size}px`;
    this.fxLayer.appendChild(canvas);
    await new SpritePlayer(canvas).play(fxId);
    canvas.remove();
  }

  /** 영웅·전설 카드 컷인: 화면이 어두워지고 반신 그림과 대사가 나온 뒤 스킬이 나간다. 매번 재생, 클릭하면 건너뜀 */
  private async cutIn(cardId: string, line: { speaker: string; face: 'neutral' | 'resolve' | 'surprise'; text: string }): Promise<void> {
    const def = resolveCard(this.data, cardId).def;
    const who = speakerInfo(this.data, line.speaker);
    const img = await loadPortrait(line.speaker, line.face, standingFor(this.data, line.speaker, this.state.flags));
    const portrait = img
      ? h('img', { class: 'cutin-portrait', src: img.src, alt: who.name })
      : h('div', { class: 'cutin-portrait cutin-fallback', style: `--owner:${who.color}` }, who.name);
    const overlay = h(
      'div',
      { class: `cutin cutin-${def.rarity}`, style: `--owner:${who.color}` },
      h('div', { class: 'cutin-band' }),
      portrait,
      h('div', { class: 'cutin-text' }, h('div', { class: 'cutin-card' }, def.name), h('div', { class: 'cutin-line' }, `"${line.text}"`)),
    );
    this.root.appendChild(overlay);
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        overlay.removeEventListener('click', done);
        resolve();
      };
      const timer = setTimeout(done, 1500 * settings.speed);
      overlay.addEventListener('click', done);
    });
    overlay.classList.add('out');
    await this.wait(180);
    overlay.remove();
  }

  private showResult(): void {
    const win = this.state.result === 'victory';
    const overlay = h(
      'div',
      { class: `result-overlay ${win ? 'win' : 'lose'}` },
      h(
        'div',
        { class: 'result-box' },
        h('h2', {}, this.state.survived ? '버텼다' : win ? '승리' : '패배'),
        h('p', {}, this.state.survived ? `${this.state.turn}턴을 버텼다.` : win ? '결을 따라, 날을 얹었다.' : '하운이 쓰러졌다.'),
        h('button', { class: 'btn btn-primary', onclick: () => this.finish() }, '계속'),
      ),
    );
    this.root.appendChild(overlay);
  }

  /** report=false: 결과를 넘기지 않고 화면만 정리(메뉴에서 나갈 때) */
  private finish(report = true): void {
    document.removeEventListener('keydown', this.onKey);
    for (const u of this.units.values()) u.player.stop();
    if (report) this.onFinish(this.state);
  }
}

