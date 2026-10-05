// 전투 화면. 엔진 상태(BattleState)를 그리고, 엔진이 남긴 이벤트를 순서대로 연출한다.
import { canPlay, describeIntent, endTurn, needsTarget, playCard } from '../engine/battle';
import type { GameData } from '../engine/data';
import { resolveCard, type BattleEvent, type BattleState, type Combatant, type EnemyState } from '../engine/state';
import { flash, floatOver, shake, sleep, toast } from '../render/fx';
import { RiftOverlay } from '../render/rift-overlay';
import { SpritePlayer } from '../render/sprite-player';
import { cardView } from './card-view';
import { clear, h } from './dom';

export interface BattleContext {
  title: string;
  subtitle: string;
  seed: string;
  scar: number;
  supportActive: boolean;
  bonusText?: string;
}

interface Unit {
  c: Combatant;
  el: HTMLElement;
  player: SpritePlayer;
  hp: HTMLElement;
  hpText: HTMLElement;
  block: HTMLElement;
  statuses: HTMLElement;
  intent?: HTMLElement;
}

const INTENT_ICON: Record<string, string> = { attack: '⚔', defend: '🛡', buff: '▲', debuff: '▼', special: '✦' };

export class BattleView {
  readonly root: HTMLElement;
  private units = new Map<string, Unit>();
  private field!: HTMLElement;
  private fxLayer!: HTMLElement;
  private toasts!: HTMLElement;
  private handEl!: HTMLElement;
  private resEl!: HTMLElement;
  private logEl!: HTMLElement;
  private endBtn!: HTMLButtonElement;
  private rift: RiftOverlay;
  private selected: number | null = null;
  private busy = false;
  private lastCard: string | null = null;

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
    // 시작 시 남은 이벤트(지원 규칙 등)는 기록만
    void this.animate(this.state.events.splice(0));
  }

  // ───────────────────────── 구성 ─────────────────────────

  private build(): HTMLElement {
    this.resEl = h('div', { class: 'resources' });
    this.field = h('div', { class: 'field' });
    this.fxLayer = h('div', { class: 'fx-layer' });
    this.toasts = h('div', { class: 'toasts' });
    this.handEl = h('div', { class: 'hand' });
    this.logEl = h('div', { class: 'log' });
    this.endBtn = h('button', { class: 'btn btn-primary', onclick: () => this.onEndTurn() }, '턴 종료') as HTMLButtonElement;

    const partyEl = h('div', { class: 'side side-party' });
    const enemyEl = h('div', { class: 'side side-enemy' });
    for (const c of this.state.party) partyEl.appendChild(this.makeUnit(c).el);
    for (const c of this.state.enemies) enemyEl.appendChild(this.makeUnit(c).el);
    this.field.append(this.rift.el, partyEl, enemyEl, this.fxLayer);

    document.addEventListener('keydown', this.onKey);
    return h(
      'section',
      { class: 'screen battle' },
      h('header', { class: 'topbar' }, h('div', { class: 'title' }, this.ctx.title), h('div', { class: 'sub' }, this.ctx.subtitle), h('div', { class: 'seed' }, `시드 ${this.ctx.seed}`)),
      this.resEl,
      this.field,
      h('div', { class: 'controls' }, this.handEl, h('div', { class: 'control-side' }, this.endBtn, this.logEl)),
      this.toasts,
    );
  }

  private spriteFor(c: Combatant, anim: string): string | null {
    if (c.side === 'party') {
      const s = this.data.characters.get(c.defId)?.sprites ?? {};
      return s[anim] ?? (anim === 'skill' ? s.attack : null) ?? null;
    }
    const def = this.data.enemies.get(c.defId);
    return def?.sprite ? `${def.sprite}_${anim === 'skill' ? 'attack' : anim}` : null;
  }

  private makeUnit(c: Combatant): Unit {
    const canvas = h('canvas', { class: 'sprite' }) as HTMLCanvasElement;
    const enemyDef = c.side === 'enemy' ? this.data.enemies.get(c.defId) : undefined;
    const charDef = c.side === 'party' ? this.data.characters.get(c.defId) : undefined;
    const player = new SpritePlayer(canvas, {
      fallbackColor: charDef?.color ?? '#5a4a5a',
      fallbackShape: enemyDef?.tier === 'boss' ? 'boss' : 'humanoid',
    });
    if (enemyDef?.tint) canvas.style.filter = enemyDef.tint;
    const hp = h('div', { class: 'hp-fill' });
    const hpText = h('div', { class: 'hp-text' });
    const block = h('div', { class: 'block-badge' });
    const statuses = h('div', { class: 'statuses' });
    const intent = c.side === 'enemy' ? h('div', { class: 'intent' }) : undefined;
    const el = h(
      'div',
      {
        class: `unit unit-${c.side}`,
        style: `--scale:${enemyDef?.scale ?? 1}`,
        onclick: () => this.onUnitClick(c),
      },
      intent,
      h('div', { class: 'sprite-wrap' }, canvas, block),
      h('div', { class: 'unit-name' }, c.name),
      h('div', { class: 'hp-bar' }, hp, hpText),
      statuses,
    );
    const unit: Unit = { c, el, player, hp, hpText, block, statuses, intent };
    this.units.set(c.uid, unit);
    void player.play(this.spriteFor(c, 'idle'), { loop: true });
    return unit;
  }

  // ───────────────────────── 갱신 ─────────────────────────

  private refresh(): void {
    const s = this.state;
    const bal = this.data.balance;
    for (const u of this.units.values()) {
      const c = u.c;
      u.hp.style.width = `${Math.max(0, (c.hp / c.maxHp) * 100)}%`;
      u.hpText.textContent = `${c.hp} / ${c.maxHp}`;
      u.block.textContent = c.block > 0 ? `🛡${c.block}` : '';
      u.block.style.display = c.block > 0 ? '' : 'none';
      u.el.classList.toggle('down', c.downed);
      clear(u.statuses);
      for (const [id, n] of Object.entries(c.statuses)) {
        const def = this.data.statuses.get(id);
        u.statuses.appendChild(h('span', { class: `status status-${def?.kind ?? 'buff'}`, title: def?.description ?? '' }, `${def?.name ?? id}${n > 1 ? ` ${n}` : ''}`));
      }
      if (u.intent) {
        const view = c.downed ? null : describeIntent(s, c as EnemyState);
        clear(u.intent);
        if (view) {
          const target = view.intent.targetUid ? s.party.find((p) => p.uid === view.intent.targetUid) : undefined;
          const dmg = view.damage ? ` ${view.damage.perHit}${view.damage.times > 1 ? `×${view.damage.times}` : ''}${view.damage.all ? ' 전체' : ''}` : '';
          u.intent.append(
            h('span', { class: `intent-icon intent-${view.intent.kind}` }, INTENT_ICON[view.intent.kind] ?? '?'),
            h('span', {}, `${view.intent.name}${dmg}`),
          );
          if (target) u.intent.append(h('span', { class: 'intent-target' }, `→ ${target.name}`));
        }
      }
    }

    // 자원
    clear(this.resEl);
    const pips = (n: number, max: number, cls: string) =>
      h('span', { class: 'pips' }, Array.from({ length: Math.max(n, max) }, (_, i) => h('span', { class: `pip ${cls}${i < n ? '' : ' empty'}` })));
    const breath = this.ctx.supportActive
      ? h(
          'div',
          { class: 'res res-breath', title: '왕일검 — 청운호흡 박자: 세 번 짧게, 한 번 길게' },
          h('label', {}, '호흡'),
          h('span', { class: 'breath' }, [1, 2, 3, 4].map((i) => h('span', { class: `beat${i === 4 ? ' long' : ''}${((s.turn - 1) % 4) + 1 === i ? ' now' : ''}` }))),
        )
      : null;
    this.resEl.append(
      h('div', { class: 'res res-neigong', title: '내공: 매 턴 다시 차는 기본 비용' }, h('label', {}, '내공'), pips(s.neigong, bal.neigongPerTurn, 'pip-neigong'), h('b', {}, s.neigong)),
      h('div', { class: 'res res-mana', title: `마나: 세계마다 차는 양이 다른 유한 자원 (${s.world})` }, h('label', {}, '마나'), h('div', { class: 'bar' }, h('div', { class: 'bar-fill mana-fill', style: `width:${(s.mana / bal.mana.max) * 100}%` })), h('b', {}, `${s.mana}/${bal.mana.max}`)),
      h('div', { class: `res res-rift${s.rift >= bal.rift.echoThreshold ? ' hot' : ''}`, title: `균열: ${bal.rift.echoThreshold} 이상이면 틈의 잔향, ${bal.rift.max}이면 폭주` }, h('label', {}, '균열'), h('div', { class: 'bar' }, h('div', { class: 'bar-fill rift-fill', style: `width:${(s.rift / bal.rift.max) * 100}%` })), h('b', {}, `${s.rift}/${bal.rift.max}`)),
      ...(breath ? [breath] : []),
      h('div', { class: 'res res-piles' }, `턴 ${s.turn} · 뽑을 ${s.draw.length} · 버림 ${s.discard.length} · 소멸 ${s.exhaust.length} · 상흔 ${this.ctx.scar}`),
    );
    this.rift.update(s.rift);

    // 손패
    clear(this.handEl);
    s.hand.forEach((inst, i) => {
      const check = canPlay(s, i);
      const el = cardView(this.data, inst, { disabled: check.ok ? undefined : check.reason, selected: this.selected === i });
      el.addEventListener('click', () => this.onCardClick(i));
      this.handEl.appendChild(el);
    });

    // 대상 표시
    const need = this.selected !== null ? needsTarget(s, s.hand[this.selected]) : null;
    for (const u of this.units.values()) {
      const ok = !u.c.downed && ((need === 'enemy' && u.c.side === 'enemy') || (need === 'ally' && u.c.side === 'party'));
      u.el.classList.toggle('targetable', ok);
    }

    clear(this.logEl);
    for (const line of s.log.slice(-7)) this.logEl.appendChild(h('div', {}, line));
    this.endBtn.disabled = this.busy || !!s.result;
  }

  // ───────────────────────── 입력 ─────────────────────────

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.selected = null;
      this.refresh();
    } else if (e.key === 'e' || e.key === 'E') this.onEndTurn();
  };

  private onCardClick(i: number): void {
    if (this.busy || this.state.result) return;
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
    if (!need) return void this.act(() => playCard(this.state, i));
    // 대상이 하나뿐이면 바로 사용
    const pool = (need === 'enemy' ? this.state.enemies : this.state.party).filter((c) => !c.downed);
    if (pool.length === 1) return void this.act(() => playCard(this.state, i, pool[0].uid));
    this.selected = i;
    this.refresh();
  }

  private onUnitClick(c: Combatant): void {
    if (this.busy || this.selected === null) return;
    const i = this.selected;
    const need = needsTarget(this.state, this.state.hand[i]);
    if ((need === 'enemy' && c.side !== 'enemy') || (need === 'ally' && c.side !== 'party') || c.downed) return;
    this.selected = null;
    void this.act(() => playCard(this.state, i, c.uid));
  }

  private onEndTurn(): void {
    if (this.busy || this.state.result) return;
    this.selected = null;
    void this.act(() => endTurn(this.state));
  }

  private async act(fn: () => unknown): Promise<void> {
    this.busy = true;
    this.refresh();
    const r = fn() as { ok?: boolean; reason?: string } | undefined;
    if (r && r.ok === false && r.reason) toast(this.toasts, r.reason, 'danger');
    await this.animate(this.state.events.splice(0));
    this.busy = false;
    this.refresh();
    if (this.state.result) this.showResult();
  }

  // ───────────────────────── 연출 ─────────────────────────

  private async animate(events: BattleEvent[]): Promise<void> {
    for (const ev of events) {
      switch (ev.type) {
        case 'turn':
          if (ev.turn > 1) toast(this.toasts, `${ev.turn}턴`, 'info');
          break;
        case 'card':
          this.lastCard = ev.cardId;
          break;
        case 'attack':
          await this.playAttack(ev.sourceUid, ev.targetUids);
          break;
        case 'damage': {
          const u = this.units.get(ev.targetUid);
          if (!u) break;
          if (ev.absorbed) floatOver(this.fxLayer, u.el, `흡수 +${ev.amount}`, 'absorb');
          else {
            floatOver(this.fxLayer, u.el, ev.grain ? `${ev.amount}!` : String(ev.amount), ev.grain ? 'crit' : 'damage');
            if (ev.blocked) floatOver(this.fxLayer, u.el, `막음 ${ev.blocked}`, 'block');
            shake(u.el, ev.amount >= 15);
            flash(u.el, ev.grain ? 'blue' : 'white');
            if (!u.c.downed) void u.player.play(this.spriteFor(u.c, 'hit')).then(() => this.idle(u));
          }
          this.refresh();
          await sleep(140);
          break;
        }
        case 'block': {
          const u = this.units.get(ev.targetUid);
          if (u) floatOver(this.fxLayer, u.el, `+${ev.amount} 방어`, 'block');
          this.refresh();
          await sleep(100);
          break;
        }
        case 'heal': {
          const u = this.units.get(ev.targetUid);
          if (u) floatOver(this.fxLayer, u.el, `+${ev.amount}`, 'heal');
          this.refresh();
          await sleep(100);
          break;
        }
        case 'status': {
          const u = this.units.get(ev.targetUid);
          if (u && ev.stacks > 0) floatOver(this.fxLayer, u.el, this.data.statuses.get(ev.status)?.name ?? ev.status, 'status');
          if (ev.status === 'knot_exposed' && ev.stacks > 0) toast(this.toasts, '매듭이 드러났다 — 날 얹기!', 'support');
          break;
        }
        case 'rift':
          this.rift.update(ev.value);
          this.refresh();
          if (ev.delta > 0) flash(this.field, 'blue');
          await sleep(80);
          break;
        case 'surge':
          toast(this.toasts, '균열 폭주! 하늘이 갈라진다', 'danger');
          shake(this.field, true);
          flash(this.field, 'red');
          await sleep(350);
          break;
        case 'echo':
          toast(this.toasts, '틈의 잔향이 덱에 섞였다', 'danger');
          break;
        case 'support':
          toast(this.toasts, `왕일검 — ${ev.name}`, 'support');
          await sleep(250);
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
          }
          await sleep(200);
          break;
        }
        case 'skip': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, '움직이지 못함', 'status');
          await sleep(250);
          break;
        }
        case 'enemy_action': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, ev.moveName, 'status');
          this.lastCard = null;
          await sleep(200);
          break;
        }
        case 'result':
          break;
      }
    }
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
    await Promise.race([hit, sleep(900)]);
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

  private showResult(): void {
    const win = this.state.result === 'victory';
    const overlay = h(
      'div',
      { class: `result-overlay ${win ? 'win' : 'lose'}` },
      h('div', { class: 'result-box' }, h('h2', {}, win ? '승리' : '패배'), h('p', {}, win ? '결을 따라, 날을 얹었다.' : '하운이 쓰러졌다.'), h('button', { class: 'btn btn-primary', onclick: () => this.finish() }, '계속')),
    );
    this.root.appendChild(overlay);
  }

  private finish(): void {
    document.removeEventListener('keydown', this.onKey);
    for (const u of this.units.values()) u.player.stop();
    this.onFinish(this.state);
  }
}

