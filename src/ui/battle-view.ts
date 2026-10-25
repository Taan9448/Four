// 전투 화면. 엔진 상태(BattleState)를 그리고, 엔진이 남긴 이벤트를 순서대로 연출한다.
import { riftDecayOf, scarStartRift } from '../engine/battle';
import { canPlay, cardCausesSurge, cardOwner, describeIntent, endTurn, incomingDamage, needsTarget, playCard, potionTarget, previewCard, usePotion, type CardPreviewHit, type IncomingView } from '../engine/battle';
import { potionChip, relicChip } from './items';
import { hasSkipTurn } from '../engine/effects';
import { cardText, ELEMENT_LABEL } from '../engine/text';
import type { GameData } from '../engine/data';
import { intentHidden, resolveCard, spritesFor, type BattleEvent, type CardInstance, type BattleState, type Combatant, type EnemyState } from '../engine/state';
import { cssZoom, flash, floatOver, flyClone, flyIn, hitStop, impact, screenFlash, shake, sleep, slamRing, tearCard, toast } from '../render/fx';
import { speakerInfo } from '../engine/text';
import { loadPortrait, standingFor } from '../render/portrait';
import { RiftOverlay } from '../render/rift-overlay';
import { frameUrl, loadSprite, spriteSource } from '../render/assets';
import { cardFx, elementHitFx, fxSound, statusFx } from '../engine/fx-rules';
import { skinSpriteId } from '../engine/wardrobe';
import { skinReady } from './wardrobe-view';
import { SpritePlayer } from '../render/sprite-player';
import { sfx, type Sfx } from '../render/audio';
import { cardView } from './card-view';
import { openDeck } from './deck-view';
import { clear, h } from './dom';
import { affinityChip, controlMark, elementMark, gaugeChip, INTENT_LABEL, lawIconEl, intentIcon, statusChip } from './icons';
import { confirmDialog, openOverlay, popPanel, surgeGuide } from './overlay';
import { openShortcuts, settings, settingsForm } from './settings';
import { installTooltips, pruneTooltip, tipAttrs } from './tooltip';
import { isDebug } from './debug';
import { runTour, tourSeen } from './tour';
import { surgeCut } from './surge-cut';

/**
 * 전투 화면이 닫혔다(2026-10-15 렉 줄이기): 나가기·끝내기 뒤에 아직 기다리던 연출(await)이 깨어나면 이것을 던져
 * 남은 연출·효과음·다시 그리기·결과 창을 모두 건너뛴다. act()와 시작 연출이 받아서 조용히 끝낸다
 */
class BattleClosed extends Error {}
/** 손패 카드가 떠오르는 움직임(style.css .card transition 0.15s)이 끝날 때까지 + 여유 */
const HAND_LIFT_MS = 200;

const ignoreClosed = (e: unknown): void => {
  if (!(e instanceof BattleClosed)) throw e;
};

export interface BattleContext {
  title: string;
  subtitle: string;
  seed: string;
  scar: number;
  supportActive: boolean;
  bonusText?: string;
  /** 심연 굽이의 법칙(전투 화면 가운데 위 배지) */
  laws?: { id: string; name: string; glyph: string; icon?: number; description: string }[];
  /** 모듈 글(튜토리얼 안내·장면 묘사). 전투 화면 위에 한 줄로 */
  introText?: string;
  /** 순례 일행 보정 한 줄(자유 여정에서만, 이야기 글 위) */
  pilgrimText?: string;
  /** 전투 배경 에셋 id(실제 그림이 있을 때만 쓴다) */
  background?: string;
  /** 옷장(순례·심연): 동료 id → 입은 세트. 세 그림이 모두 실제로 왔을 때만 입는다 */
  skins?: Record<string, string>;
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
  /** 머리 위 행동 제약(기절·빙결·마비·졸음) 표시 자리 — 그림 위에 겹친다 */
  ctrl: HTMLElement;
}

export class BattleView {
  readonly root: HTMLElement;
  private units = new Map<string, Unit>();
  /** 키보드로 고른 대상(Tab) */
  private targetFocus: string | null = null;
  /** 끌어 놓기 중이던 카드(놓은 뒤 click을 한 번 막는다) */
  private dragged = false;
  private enemySide!: HTMLElement;
  /** 아군·적 줄(둘 사이가 붙지 않게 --fit으로 줄인다) */
  private unitsEl!: HTMLElement;
  private field!: HTMLElement;
  private fxLayer!: HTMLElement;
  private toasts!: HTMLElement;
  /** 갑자기 일어난 일(보스 변신·격노·균열 폭주·지원)은 화면 가운데에, 글이 길수록 오래 */
  private alerts!: HTMLElement;
  /**
   * 연출 중에 보여 주는 체력(2026-10-09): 엔진은 한 번에 끝까지 계산하므로, 상태의 체력은 이미 마지막 값이다.
   * 행동 직전 체력을 적어 두고 피해·회복 이벤트가 재생될 때마다 옮겨, 체력 바가 공격보다 먼저 줄지 않게 한다. 연출이 끝나면 비운다
   */
  private shown = new Map<string, { hp: number; maxHp: number; downed: boolean }>();
  private handEl!: HTMLElement;
  private resEl!: HTMLElement;
  private aimEl!: HTMLElement;
  private deckMedal!: HTMLElement;
  private logEl!: HTMLElement;
  private logMedal!: HTMLElement;
  /** 휴대폰: 손패 위 "◀ 5장 ▶" */
  private handHint!: HTMLElement;
  private pilesEl!: HTMLElement;
  private riftEl!: HTMLElement;
  private turnEl!: HTMLElement;
  private endBtn!: HTMLButtonElement;
  private rift: RiftOverlay;
  private selected: number | null = null;
  /** 대상을 고르는 중인 물약 칸 */
  private potionSel: number | null = null;
  /** 물약 확인(설정 confirmPotion): 대상 없는 물약의 첫 누름 — 2초 안에 다시 누르면 쓴다 */
  private potionArm: number | null = null;
  private potionArmTimer: number | null = null;
  private relicEl!: HTMLElement;
  private potionEl!: HTMLElement;
  /** 마우스를 올린 손패 카드(피해 미리보기) */
  private hovered: number | null = null;
  /** 손패에서 떠오른 카드(.card-hover)·떠오르기 시작한 때·마지막 마우스 자리 — CSS :hover 대신 판정한다(resolveHandHover) */
  private hoverCard: HTMLElement | null = null;
  private hoverAt = 0;
  private hoverTimer: number | null = null;
  private pointer = { x: -1, y: -1 };
  /** 뽑은 카드가 다 날아와 앉는 때 · 손패 요소마다 그린 결과(다시 그릴 때 그대로면 요소를 그대로 둔다) */
  private handSettleAt = 0;
  private handSig = new WeakMap<HTMLElement, string>();
  private busy = false;
  private lastCard: string | null = null;
  /** 손패 카드 요소(uid별). 손패를 떠난 카드를 더미로 날려 보내고, 새로 들어온 카드를 뽑을 더미에서 끌어오는 데 쓴다 */
  private handEls = new Map<string, HTMLElement>();
  /** 이미 따로 날려 보낸 카드(낸 카드·턴 끝에 버린 카드): 손패에서 사라져도 다시 날리지 않는다 */
  private flown = new Set<string>();
  /** 적 턴 연출 동안은 손패를 다시 그리지 않는다(다음 턴 손패는 연출이 끝난 뒤 뽑아 온다) */
  private handFrozen = false;
  /** 전투 화면이 닫혔는가(finish). 닫힌 뒤에는 연출·타이머·대기 동작이 새 일을 만들지 않는다 */
  private disposed = false;
  private resizeObs!: ResizeObserver;
  /** 끌고 있는 카드의 창 듣개를 거두는 함수(끄는 도중 나가도 남지 않게) */
  private dragCleanup: (() => void) | null = null;
  private bonusTimer: ReturnType<typeof setTimeout> | null = null;

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
    // ?debug: 콘솔·화면 점검에서 전투를 들여다볼 수 있게(window.__battle)
    if (isDebug()) (window as unknown as { __battle?: unknown }).__battle = this;
    // 화면에 붙을 때·창 크기가 바뀔 때 아군·적 간격을 다시 맞춘다
    this.resizeObs = new ResizeObserver(() => requestAnimationFrame(() => !this.disposed && this.fitUnits()));
    this.resizeObs.observe(this.unitsEl);
    if (ctx.bonusText) this.bonusTimer = setTimeout(() => this.alert(ctx.bonusText!, 'support'), 300);
    this.startTours();
    // 시작 시 남은 이벤트(지원 규칙 등)는 기록만
    void this.animate(this.state.events.splice(0)).catch(ignoreClosed);
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
    // 틈의 심장(모르데카이): 흐름 포식·매듭·고리 멈추기·격노를 처음 만날 때 짚는다(2막이 있는 보스는 2막이 열릴 때 — 'gate' 사건)
    const heartTour = (then: () => void) => this.riftHeartTour(then);
    const affinity = () => {
      if (!hasAffinity) return;
      runTour(
        [
          { target: '.unit-enemy .chip-weak, .unit-enemy .chip-resist', title: '속성 — 약점과 내성', text: `적 이름 아래 이름표. 약점 속성의 공격은 ${Math.round((bal.elements.weakMultiplier - 1) * 100)}% 더 들어가고, 내성 속성은 ${Math.round((1 - bal.elements.resistMultiplier) * 100)}% 덜 들어가며 상태도 붙지 않는다.` },
          {
            target: '.unit-enemy .intent',
            title: '속성 공격',
            text: `炎 화염 → 화상(차례 시작마다 피해).\n冷 냉기 → ${bal.elements.ice.threshold?.at}이면 빙결(보스 ${bal.elements.ice.threshold?.bossAt}), 한 차례 쉰다.\n雷 번개 → 감전(차례마다 1 가라앉음), ${bal.elements.lightning.threshold?.at}이면 마비(보스 ${bal.elements.lightning.threshold?.bossAt}).\n냉기가 붙은 적에게 번개는 ${bal.elements.lightning.conduct?.multiplier ?? 1}배.`,
          },
          { target: '.hand', title: '상극과 치명타', text: '화염은 냉기를 녹이고, 냉기는 화상을 끈다. 번개는 아무것도 지우지 않지만, 얼어붙은 적에겐 감전이, 마비된 적에겐 냉기가 쌓이지 않는다.\n아군의 공격은 가끔 치명타(1.5배)가 터진다. 확률은 피해 미리보기에 적힌다.' },
        ],
        { id: 'battle-elements', once: true },
      );
    };
    const elements = () => heartTour(affinity);
    if (tourSeen('battle-basics')) return elements();
    runTour(
      [
        { target: '.hand', title: '손패', text: '카드를 눌러 쓴다. 카드 왼쪽 위의 금빛 점은 내공, 푸른 마름모는 마나 비용. 대상을 고르는 카드는 누르면 가운데로 떠오르고, 금빛 고리가 붙은 적을 누르거나 그 번호 키를 누르면 쓴다.' },
        { target: '.half.neigong', title: '내공', text: '구슬의 왼쪽 금빛. 매 턴 다시 차는 기본 비용.' },
        { target: '.half.mana', title: '마나', text: '구슬의 오른쪽 푸른빛. 세계마다 차는 양이 다른 비용. 엘하임은 넉넉하고, 무림에서는 거의 차지 않는다.' },
        { target: '.unit-enemy .intent', title: '적의 의도', text: '적이 다음 차례에 할 행동. 피해 숫자와 노리는 아군이 보인다.' },
        { target: '.incoming', title: '받을 피해', text: '이대로 턴을 끝내면 이 아군이 받을 피해. 방어 카드를 쓰면 바로 줄어든다. 붉게 맥박치면 쓰러질 피해.' },
        { target: '.hand .card', title: '줄 피해 미리보기', text: '카드에 마우스를 올리거나 고르면, 맞을 적 위에 들어갈 피해가 뜬다. 힘·약화·취약·방어·약점이 모두 계산된 값이다.' },
        { target: '.b-rift', title: '균열', text: '내공과 마나를 함께 쓰는 융합 카드를 쓰면 쌓인다. 너무 쌓이면 틈의 잔향이 덱에 섞이고, 가득 차면 폭주한다.' },
        { target: '.btn-endturn', title: '턴 종료', text: '쓸 카드를 다 썼으면 턴을 끝낸다(단축키 E). 그다음 적이 움직인다.' },
        // 다섯 표식(2026-10-11 UI/UX 4-3)
        { target: '.medal-row', title: '다섯 표식', text: '抽 뽑을 더미 · 棄 버린 더미 · 滅 소멸한 카드 · 冊 이번 전투의 덱 전체 · 設 메뉴와 설정. 記는 전투 기록을 보이고 숨긴다. 설정의 "표식에 글자 함께"를 켜면 아래에 이름이 붙는다.' },
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
    // 대사 띠: 툴팁이 피해 가고(data-tip-avoid), 떠 있는 동안 손패 힌트는 띠 위로(.strip-on)
    this.alerts = h('div', { class: 'toasts toasts-center', 'data-tip-avoid': '' });
    this.handEl = h('div', { class: 'hand' });
    this.logEl = h('div', { class: 'log', 'aria-live': 'polite' });
    this.pilesEl = h('div', { class: 'medals' });
    this.riftEl = h('div', { class: 'b-rift' });
    this.relicEl = h('div', { class: 'b-relics' }, this.state.relics.map((id) => relicChip(this.data, id)));
    this.potionEl = h('div', { class: 'b-potions' });
    this.turnEl = h('span', { class: 'turn' });
    // 턴 종료: 붉은 인장(Codex 그림 ui_endturn — 칸1 보통 · 칸2 준비/올림 · 칸3 꺼짐). 그림이 오기 전에는 CSS 인장
    const seal = [1, 2, 3].map((n) => frameUrl('ui_endturn', n, { realOnly: true }));
    this.endBtn = h(
      'button',
      {
        class: `seal-btn btn-endturn${seal[0] ? ' has-art' : ''}`,
        style: seal[0] ? `--seal:url("${seal[0]}");--seal-hot:url("${seal[1] ?? seal[0]}");--seal-off:url("${seal[2] ?? seal[0]}")` : '',
        onclick: () => this.onEndTurn(),
      },
      h('b', {}, '終'),
      h('span', {}, '턴 종료'),
    ) as HTMLButtonElement;
    this.aimEl = h('div', { class: 'aim-ribbon' });

    const partyEl = h('div', { class: 'side side-party' });
    const enemyEl = h('div', { class: 'side side-enemy' });
    for (const c of this.state.party) partyEl.appendChild(this.makeUnit(c).el);
    for (const c of this.state.enemies) enemyEl.appendChild(this.makeUnit(c).el);
    this.enemySide = enemyEl;

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
        ),
        // 오른쪽 위: 둥근 표식(뽑을 抽 · 버림 棄 · 소멸 滅 · 덱 冊 · 설정 設)
        // 그 아래 유물 줄
        h(
          'div',
          { class: 'b-hud-right' },
          h(
            'div',
            { class: 'medal-row' },
            this.pilesEl,
            (this.deckMedal = medal('冊', '덱', '이번 전투의 카드 전부(손패·뽑을·버림·소멸)', () => this.showPiles(), 0)),
            // 전투 기록: 기본은 숨김, 누르면 반투명 판 위에(2026-10-11 UI/UX 2-2)
            (this.logMedal = medal('記', '전투 기록', '최근 일어난 일 다섯 줄을 보이고 숨긴다', () => this.toggleLog())),
            medal('設', '설정', '설정 · 전투 나가기', () => this.showMenu()),
            // 단축키 표(키보드가 없는 기기에서는 CSS로 숨긴다 — pointer: coarse)
            h('button', { class: 'medal medal-help', 'aria-label': '단축키', onclick: () => openShortcuts(), ...tipAttrs('단축키', '1~0 카드 · E 턴 종료 · Esc 취소 · Tab/←→ 대상 · Enter/Space 확정 · D 덱 보기') }, h('b', {}, '?')),
          ),
          this.state.relics.length ? this.relicEl : null,
        ),
      ),
      // 가운데 위: 이야기 글 → 그 아래 균열 게이지(바탕 없이) · 굽이의 법칙
      h(
        'div',
        { class: 'b-center' },
        this.ctx.pilgrimText ? h('p', { class: 'battle-pilgrim chip' }, this.ctx.pilgrimText) : null,
        this.ctx.introText ? this.introEl() : null,
        this.riftEl,
        this.ctx.laws?.length
          ? h('div', { class: 'law-badges' }, this.ctx.laws.map((l) => h('span', { class: 'law-badge', ...tipAttrs(`굽이의 법칙 — ${l.name}`, l.description, 'rift') }, lawIconEl(l), l.name)))
          : null,
      ),
      this.logEl,
      (this.unitsEl = h('div', { class: 'units' }, partyEl, enemyEl)),
      h('div', { class: 'shade' }),
      this.aimEl,
      // 아래: 왼쪽(물약 → 자원 구슬) · 가운데(손패) · 오른쪽(턴 종료)
      h(
        'div',
        { class: 'dock' },
        h('div', { class: 'dock-left' }, h('div', { class: 'b-items' }, this.potionEl), this.resEl),
        // 전투 중 대사·경고 띠는 손패 바로 위(this.alerts)
        this.watchStrip(h('div', { class: 'dock-mid' }, this.alerts, (this.handHint = h('div', { class: 'hand-hint', 'aria-hidden': 'true' })), this.handEl)),
        h('div', { class: 'endturn' }, this.turnEl, this.endBtn, h('small', { class: 'key-hint' }, 'E')),
      ),
      this.fxLayer,
    );

    document.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    installTooltips();
    return h('section', { class: 'screen battle', 'data-seed': this.ctx.seed }, this.field, this.toasts);
  }

  private spriteFor(c: Combatant, anim: string): string | null {
    if (c.side === 'party') {
      const def = this.data.characters.get(c.defId);
      if (!def) return null;
      // 복장(못생긴 검·두린의 망치)은 실제 그림이 들어온 뒤에만 쓴다(임시 그림보다 기본 복장의 실제 그림이 낫다)
      const pick = (s: Record<string, string>) => s[anim] ?? (anim === 'skill' ? s.attack : undefined);
      // 옷장 세트(순례·심연, anyMode 세트는 캠페인에서도)가 가장 먼저
      const skin = this.ctx.skins?.[c.defId];
      if (skin && skinReady(this.data, skin, c.defId)) return skinSpriteId(this.data, skin, c.defId, anim === 'skill' ? 'attack' : anim);
      const outfit = pick(spritesFor(def, this.state.flags));
      return (outfit && spriteSource(outfit) === 'sprites' ? outfit : pick(def.sprites)) ?? null;
    }
    const def = this.data.enemies.get(c.defId);
    if (!def?.sprite) return null;
    // 물체형 적(문·경계)은 공격 그림이 없다. 대기 그림만 실제로 들어왔으면 임시 그림 대신 대기 그림을 이어 쓴다
    const id = `${def.sprite}_${anim === 'skill' ? 'attack' : anim}`;
    const idle = `${def.sprite}_idle`;
    if (!spriteSource(id) || (spriteSource(idle) === 'sprites' && spriteSource(id) !== 'sprites')) return idle;
    return id;
  }

  /**
   * 상태 이름표는 두 줄까지(2026-10-14 사용자 요청 — 상태가 늘면 캐릭터가 위로 밀려 올라갔다): 넘치면 이름을 빼고 아이콘·스택만,
   * 그래도 넘치면 뒤에서부터 접어 +N 이름표 하나로(주석에 접힌 상태 이름)
   */
  private fitStatuses(box: HTMLElement): void {
    box.classList.remove('dense');
    const chips = [...box.children] as HTMLElement[];
    if (chips.length < 2 || !box.isConnected) return;
    const rows = () => new Set(chips.filter((c) => !c.hidden).map((c) => c.offsetTop)).size;
    if (rows() <= 2) return;
    box.classList.add('dense');
    if (rows() <= 2) return;
    const more = h('span', { class: 'status-chip chip-more' });
    box.appendChild(more);
    chips.push(more);
    const folded: string[] = [];
    for (let i = chips.length - 2; i > 0 && rows() > 2; i--) {
      chips[i].hidden = true;
      folded.unshift(chips[i].getAttribute('data-tip-title') ?? chips[i].textContent ?? '');
      more.textContent = `+${folded.length}`;
    }
    Object.entries(tipAttrs(`상태 ${folded.length}개 더`, folded.join(' · '))).forEach(([k, v]) => v && more.setAttribute(k, v));
  }

  /**
   * 아군과 적 사이 간격 지키기(2026-10-14 사용자 요청 — 심연 4인 출전에서 넷째가 적에 바로 붙었다, 휴대폰은 4px):
   * 두 줄의 본래 폭 + 최소 간격이 자리를 넘으면 유닛 폭·그림 크기를 같은 비율(--fit, 0.62까지)로 줄인다
   */
  private fitUnits(): void {
    const box = this.unitsEl;
    if (!box?.isConnected) return;
    box.style.setProperty('--fit', '1');
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const need = [...box.querySelectorAll<HTMLElement>(':scope > .side')].reduce((a, e) => a + e.getBoundingClientRect().width, 0);
    if (!avail || !need) return;
    const gap = Math.max(innerWidth <= 700 ? 16 : 48, avail * 0.06);
    const fit = Math.max(0.62, Math.min(1, (avail - gap) / need));
    box.style.setProperty('--fit', fit.toFixed(3));
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
    const ctrl = h('div', { class: 'ctrl-slot' });
    const el = h(
      'div',
      {
        class: `unit unit-${c.side}${enemyDef?.tier === 'boss' ? ' unit-boss' : ''}`,
        style: `--scale:${enemyDef?.scale ?? charDef?.scale ?? 1}`,
        onclick: () => this.onUnitClick(c),
      },
      // 줄 피해 미리보기는 의도 이름표 바로 위에 같은 모양으로(평소에는 비어 있어 자리를 차지하지 않는다)
      preview,
      intent,
      h('div', { class: 'sprite-wrap' }, canvas, ctrl),
      h('div', { class: 'unit-name' }, c.name, c.side === 'party' && c.level ? h('small', { class: 'unit-lv' }, ` Lv${c.level}`) : ''),
      h('div', { class: 'unit-bars' }, block, h('div', { class: 'hp-bar', role: 'progressbar', 'aria-label': `${c.name} 체력`, 'aria-valuemin': '0' }, hp, hpText)),
      statuses,
    );
    const unit: Unit = { c, el, player, hp, hpText, block, statuses, intent, preview, ctrl };
    this.units.set(c.uid, unit);
    void player.play(this.spriteFor(c, 'idle'), { loop: true });
    return unit;
  }

  // ───────────────────────── 갱신 ─────────────────────────

  private refresh(): void {
    if (this.disposed) return;
    const s = this.state;
    const bal = this.data.balance;
    const incoming = s.result ? new Map() : incomingDamage(s);
    for (const u of this.units.values()) {
      const c = u.c;
      const shown = this.shown.get(c.uid);
      const hp = shown?.hp ?? c.hp;
      const maxHp = shown?.maxHp ?? c.maxHp;
      u.hp.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
      // 10배 단위(2026-10-12): 세·네 자리가 칸에 들어가게 띄어 쓰지 않는다
      u.hpText.textContent = `${Math.max(0, hp)}/${maxHp}`;
      const bar = u.hpText.parentElement!;
      bar.setAttribute('aria-valuemax', String(maxHp));
      bar.setAttribute('aria-valuenow', String(Math.max(0, hp)));
      u.block.textContent = c.block > 0 ? String(c.block) : '';
      u.block.style.display = c.block > 0 ? '' : 'none';
      if (c.block > 0) Object.entries(tipAttrs(`방어 ${c.block}`, '받는 피해를 먼저 막는다. 자기 턴이 시작되면 사라진다.')).forEach(([k, v]) => v && u.block.setAttribute(k, v));
      u.el.classList.toggle('down', shown?.downed ?? c.downed);
      u.el.classList.toggle('target-focus', this.selected !== null && this.targetFocus === c.uid);
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
      this.fitStatuses(u.statuses);
      // 행동 제약은 이름표가 접혀도 머리 위에 늘 크게(#1317). 같은 상태·스택이면 다시 그리지 않아 깜빡임 애니메이션이 이어진다
      const ctrl = (shown?.downed ?? c.downed) ? null : controlMark(this.data, c.statuses);
      const key = ctrl?.getAttribute('aria-label') ?? '';
      const stacks = ctrl ? [...ctrl.querySelectorAll('b')].map((b) => b.textContent).join(',') : '';
      if (u.ctrl.dataset.key !== `${key}|${stacks}`) {
        u.ctrl.dataset.key = `${key}|${stacks}`;
        u.ctrl.replaceChildren(...(ctrl ? [ctrl] : []));
      }
      clear(u.intent);
      if (c.side === 'enemy') this.renderIntent(u, c as EnemyState);
      else this.renderIncoming(u, c.downed ? undefined : incoming.get(c.uid));
    }

    // 손패 위: 균열 게이지 · 버티기 / 오른쪽 위: 둥근 표식(더미 수)
    const hot = s.rift >= bal.rift.echoThreshold;
    clear(this.riftEl);
    this.riftEl.className = `b-rift${hot ? ' hot' : ''}`;
    Object.entries(tipAttrs(`균열 ${s.rift} / ${bal.rift.max}`, `융합 카드를 쓰면 쌓인다. ${riftDecayLine(s)}${bal.rift.echoThreshold} 이상이면 틈의 잔향이 덱에 섞이고, ${bal.rift.max}이면 폭주한다.\n폭주: 일행 체력 ${Math.round(bal.rift.surgeRatio * 100)}%(하운 +${bal.rift.surgeHaunExtra}) · 적 힘 +${bal.rift.surgeEnemyStrength} · 잔향 ${bal.rift.surgeEchoToHand}장을 손에 · 상흔 +${bal.rift.surgeScar}. 균열은 ${bal.rift.surgeResetTo}으로.\n전투가 끝나면 남은 균열의 절반이 상흔으로 남는다(지금 상흔 ${this.ctx.scar}, 상흔 ${bal.rift.scar.startRiftPer}마다 전투 시작 균열 +1).`, 'rift')).forEach(([k, v]) => v && this.riftEl.setAttribute(k, v));
    this.riftEl.append(
      h('div', { class: 'gauge' }, h('i', { style: `width:${(s.rift / bal.rift.max) * 100}%` })),
      h('span', {}, `균열 ${s.rift} / ${bal.rift.max}`),
      s.surviveTurns !== null ? h('span', { class: 'survive' }, `버티기 ${Math.min(s.turn, s.surviveTurns)} / ${s.surviveTurns}턴`) : '',
    );
    this.riftEl.querySelector('span')!.replaceChildren('균열 ', h('b', {}, s.rift), ` / ${bal.rift.max}`, hot ? h('em', {}, ' 잔향') : '');
    // 폭주 예고: 균열이 max-2 이상이면 게이지가 붉게 고동치고 "다음 +N이면 폭주"
    const near = s.rift >= bal.rift.max - 2 && s.rift < bal.rift.max;
    this.riftEl.classList.toggle('near', near);
    if (near) this.riftEl.append(h('span', { class: 'surge-warn' }, `다음 +${bal.rift.max - s.rift}이면 폭주`));
    this.pilesEl.replaceChildren(
      medal('抽', '뽑을 더미', '다음에 뽑을 카드(순서는 감춤). 누르면 더미 보기', () => this.showPiles(), s.draw.length),
      medal('棄', '버린 더미', '쓰거나 버린 카드. 뽑을 더미가 비면 섞여 돌아간다', () => this.showPiles(), s.discard.length),
      medal('滅', '소멸', '이번 전투에서 사라진 카드', () => this.showPiles(), s.exhaust.length),
    );
    this.deckMedal.querySelector('i')!.textContent = String(s.hand.length + s.draw.length + s.discard.length + s.exhaust.length);

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
    s.potions.forEach((id, i) => {
      const chip = potionChip(this.data, id, {
        onClick: id && !this.busy && !s.result ? () => this.onPotion(i) : undefined,
        extra: this.potionSel === i ? 'selected' : this.potionArm === i ? 'arming' : '',
      });
      if (this.potionArm === i) chip.appendChild(h('small', { class: 'potion-arm-hint', role: 'status' }, '다시 누르면 사용'));
      this.potionEl.appendChild(chip);
    });
    // 반반 체력구: 왼쪽 금빛 = 내공, 오른쪽 푸른빛 = 마나. 차오른 높이가 남은 양(틀은 Codex 그림 ui_orb_frame, 없으면 CSS 고리)
    // 가득 차도 물결 수면이 보이게 높이의 80%까지만 채운다(액체가 담긴 느낌)
    const pct = (n: number, max: number) => `${Math.round(Math.max(0, Math.min(1, max > 0 ? n / max : 0)) * 80)}%`;
    const orbFrame = frameUrl('ui_orb_frame', 1, { realOnly: true });
    this.resEl.append(
      breath ?? '',
      h(
        'div',
        { class: `globe${orbFrame ? ' has-art' : ''}` },
        h(
          'div',
          { class: 'globe-in' },
          h(
            'div',
            { class: `half neigong${s.neigong === 0 ? ' empty' : ''}`, style: `--fill:${pct(s.neigong, s.neigongMax)}`, ...tipAttrs(`내공 ${s.neigong} / ${s.neigongMax}`, '매 턴 다시 차는 기본 비용.', 'neigong') },
            h('i', { class: 'liquid' }, h('b', { class: 'bubbles' })),
            h('span', {}, s.neigong),
          ),
          h(
            'div',
            { class: `half mana${s.mana === 0 ? ' empty' : ''}`, style: `--fill:${pct(s.mana, bal.mana.max)}`, ...tipAttrs(`마나 ${s.mana} / ${bal.mana.max}`, `세계마다 차는 양이 다른 유한 자원.\n${worldName[s.world] ?? s.world}`, 'mana') },
            h('i', { class: 'liquid' }, h('b', { class: 'bubbles' })),
            h('span', {}, s.mana),
          ),
          h('i', { class: 'glass' }),
        ),
        orbFrame ? h('img', { class: 'globe-frame', src: orbFrame, alt: '' }) : null,
      ),
      h('small', { class: 'globe-cap' }, h('b', { class: 'ng' }, `내공 ${s.neigong}/${s.neigongMax}`), h('b', { class: 'mn' }, `마나 ${s.mana}/${bal.mana.max}`)),
    );

    if (!this.handFrozen) this.renderHand();

    // 대상 표시
    if (this.selected !== null && !s.hand[this.selected]) this.selected = null;
    // 대상 고르기(B안): 맞을 수 있는 대상마다 발밑 금빛 고리와 번호(숫자 키). 고른 카드는 손패 가운데에 크게 떠오른다
    const need = this.aimNeed();
    const pool = this.targetPool();
    for (const u of this.units.values()) {
      const k = pool.indexOf(u.c);
      u.el.classList.toggle('targetable', k >= 0);
    }
    this.field.classList.toggle('aiming', !!need);
    const what = this.potionSel !== null ? (s.potions[this.potionSel] ? this.data.potions.get(s.potions[this.potionSel]!)?.name : '') : this.selected !== null ? resolveCard(this.data, s.hand[this.selected].cardId).def.name : '';
    this.aimEl.replaceChildren(
      ...(need
        ? [
            h('b', {}, `${what ? `${what} — ` : ''}${need === 'enemy' ? '적' : '아군'}을 고르세요`),
            h('span', {}, `금빛 고리가 붙은 ${need === 'enemy' ? '적' : '아군'}을 누르세요 · ${this.potionSel !== null ? '물약' : '카드'}을 다시 누르면 취소`),
          ]
        : []),
    );

    this.renderPreview();

    clear(this.logEl);
    for (const line of s.log.slice(-5)) this.logEl.appendChild(h('div', {}, line));
    this.turnEl.textContent = `${s.turn}턴`;
    this.endBtn.disabled = this.busy || !!s.result;
    // 쓸 카드가 남지 않았으면 턴 종료 인장이 맥박친다
    this.endBtn.classList.toggle('ready', !this.busy && !s.result && !s.hand.some((c, i) => canPlay(s, i).ok && resolveCard(this.data, c.cardId).def.type !== 'status'));
    pruneTooltip();
  }

  /** 더미 칩의 숫자 자리(뽑을·버림·소멸) — 카드가 날아가고 오는 곳 */
  private pileRect(which: 'draw' | 'discard' | 'exhaust'): DOMRect {
    const marks = this.pilesEl.querySelectorAll('.medal');
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
    // 떠 있던 카드(새로 그려도 같은 카드면 처음부터 떠 있게 — 다시 그릴 때마다 떠오르는 움직임이 처음부터 다시 돌지 않게)
    const hoverUid = this.hoverCard ? [...prev].find(([, e]) => e === this.hoverCard)?.[0] : undefined;
    const n = s.hand.length;
    const mid = (n - 1) / 2;
    const step = n > 1 ? Math.min(5, 36 / (n - 1)) : 0;
    this.handEl.style.setProperty('--overlap', `${n > 8 ? -46 : n > 6 ? -32 : n > 4 ? -18 : -8}px`);
    this.handHint.textContent = n ? `◀ ${n}장 ▶` : '';
    const els = s.hand.map((inst, i) => {
      const check = canPlay(s, i);
      const fresh = cardView(this.data, inst, { disabled: check.ok ? undefined : check.reason, selected: this.selected === i, flavor: 'hover' });
      // 그대로인 카드는 요소를 그대로 둔다(2026-10-25 사용자 요청 — 유물이 연달아 돌 때 0.12초마다 손패를 새로 만들어
      // 마우스 밑 카드가 매번 다시 떠오르고, 대강화·등급 빛도 매번 처음부터 다시 돌았다). 자리(i)·장수가 같고 그린 결과가 같을 때만
      const sig = `${i}/${n}|${fresh.outerHTML}`;
      const old = prev.get(inst.uid);
      const off = i - mid;
      // 낸 카드(찢기며 감춘 요소)가 손패에 남았으면 새로 만든다 — 감춘 채로 남지 않게
      if (old && this.handSig.get(old) === sig && !this.flown.has(inst.uid)) {
        old.style.zIndex = String(10 + i);
        this.handEls.set(inst.uid, old);
        return old;
      }
      const el = fresh;
      this.handSig.set(el, sig);
      if (inst.uid === hoverUid) {
        el.classList.add('card-hover');
        this.hoverCard = el;
      }
      el.style.setProperty('--rot', `${off * step}deg`);
      el.style.setProperty('--lift', `${Math.round(off * off * step * 0.7)}px`);
      el.style.zIndex = String(10 + i);
      el.addEventListener('click', () => {
        if (this.dragged) return void (this.dragged = false);
        this.onCardClick(i);
      });
      el.addEventListener('pointerdown', (e) => this.startDrag(e, i, el));
      // 키보드: Tab으로 옮겨 다니고 Enter·Space로 고른다(포커스 링은 style.css :focus-visible)
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', this.cardLabel(inst, check.ok ? undefined : check.reason));
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        this.onCardClick(i);
      });
      el.addEventListener('focus', () => this.setHover(i));
      el.addEventListener('blur', () => this.setHover(null));
      el.addEventListener('mouseenter', this.resolveHandHover);
      el.addEventListener('mouseleave', this.resolveHandHover);
      // 떠오른 카드 밑 빈자리도 이 카드로 친다(style.css .hand-hit) — 카드 아래쪽에 마우스를 두면 오르내리길 되풀이하지 않게
      el.append(h('span', { class: 'hand-hit', 'aria-hidden': 'true' }));
      this.handEls.set(inst.uid, el);
      return el;
    });
    // 제자리에 있는 요소는 옮기지 않는다(떼었다 붙이면 CSS 움직임이 처음부터 다시 돈다): 빠진 것부터 걷고, 필요한 자리에만 끼운다
    const keep = new Set(els);
    for (const c of [...this.handEl.children]) if (!keep.has(c as HTMLElement)) c.remove();
    let at = this.handEl.firstElementChild;
    for (const el of els) {
      if (el === at) at = at.nextElementSibling;
      else this.handEl.insertBefore(el, at);
    }
    if (this.hoverCard && !keep.has(this.hoverCard)) this.hoverCard = null;

    if (this.selected !== null && this.handEl.isConnected) this.layoutAim();

    const ms = 260 * Math.max(0.6, settings.speed);
    for (const x of leaving) void flyClone(x.el, this.pileRect(x.to), { ms, scale: 0.25 }, x.rect);
    const arriving = s.hand.filter((c) => !prev.has(c.uid)).map((c) => this.handEls.get(c.uid)!);
    // 뽑은 카드가 날아오는 동안은 떠오를 카드를 정하지 않는다(지나가는 카드가 마우스 밑에서 잠깐씩 떠오르지 않게)
    if (arriving.length) this.handSettleAt = performance.now() + (arriving.length - 1) * 70 * settings.speed + ms + 40;
    if (this.handEl.isConnected) this.resolveHandHover();
    if (!arriving.length) return;
    // 처음 그릴 때는 아직 화면에 붙기 전이라 한 박자 뒤에
    const run = () => {
      const from = this.pileRect('draw');
      arriving.forEach((el, k) => flyIn(el, from, k * 70 * settings.speed, ms));
    };
    if (first || !this.handEl.isConnected) requestAnimationFrame(run);
    else run();
  }

  /**
   * 대상 고르기 중의 손패(B안): 고른 카드는 손패 가운데로 옮겨 크게 띄우고, 나머지는 반씩 나눠 그 양옆으로 비켜 세운다.
   * 자리(레이아웃 기준) 차이를 --dx로 넘기면 CSS가 옮긴다
   */
  private layoutAim(): void {
    const s = this.state;
    const sel = this.selected;
    if (sel === null) return;
    const els = s.hand.map((c) => this.handEls.get(c.uid)!);
    const picked = els[sel];
    if (!picked) return;
    const cx = (el: HTMLElement) => el.offsetLeft + el.offsetWidth / 2;
    const mid = this.handEl.offsetLeft + this.handEl.clientWidth / 2;
    picked.style.setProperty('--dx', `${Math.round(mid - cx(picked))}px`);
    const rest = els.filter((_, i) => i !== sel);
    const w = picked.offsetWidth;
    const step = w * 0.62;
    const gap = w * 0.78;
    const left = Math.ceil(rest.length / 2);
    rest.forEach((el, k) => {
      const at = k < left ? mid - gap - (left - 1 - k) * step : mid + gap + (k - left) * step;
      el.style.setProperty('--dx', `${Math.round(at - cx(el))}px`);
      el.style.setProperty('--aside', k < left ? '-1' : '1');
      el.style.zIndex = String(k < left ? 10 + k : 40 - k);
    });
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

  /**
   * 낸 카드 찢기: 대상 쪽으로 살짝 떠올라 금빛으로 달아오른 뒤 두 조각으로 찢어져 흩어진다(원본은 감추고, 손패에서 빠질 때 다시 날리지 않게 표시).
   * 찢기는 순간 Codex 그림 이펙트(fx_card_tear)가 들어와 있으면 그 자리에 겹친다
   */
  private async flyPlayed(handIndex: number, targetUid?: string): Promise<void> {
    const inst = this.state.hand[handIndex];
    const el = inst ? this.handEls.get(inst.uid) : undefined;
    if (!inst || !el) return;
    const to = this.flyTarget(handIndex, targetUid);
    this.flown.add(inst.uid);
    // Codex 그림(fx_card_tear)이 있으면: 솔기가 터지는 프레임(events.impact)이 카드가 벌어지는 순간에 오게 앞당기고, 조각은 그림이 그린다
    const tearFx = spriteSource('fx_card_tear') === 'sprites' ? await loadSprite('fx_card_tear') : null;
    const lead = tearFx ? (((tearFx.meta.events.impact ?? 1) - 1) * 1000) / tearFx.meta.fps : undefined;
    // 카드를 낼 때(data/fx.json cardPlay, 2026-10-23): 등급 소리를 얹고, 대강화 +8·+9·+10은 크게 치솟았다가 쾅 내리꽂힌다
    // (묵직한 소리 · 화면 흔들림 · 단계 색 번쩍 · 충격파 · 짧은 타격 멈춤 — 일반 카드를 내는 느낌이 아니게)
    const card = resolveCard(this.data, inst);
    const play = this.data.fx.cardPlay;
    const raritySound = play?.rarity[card.def.rarity] as Sfx | undefined;
    if (raritySound) sfx(raritySound, { volume: 0.6 });
    const slam = card.forge >= 3 ? play?.forge[String(card.level)] : undefined;
    sfx('tear', { volume: 0.7 });
    const tear = tearCard(el, {
      ms: 850 * Math.max(0.6, settings.speed) * (slam ? 1.25 : 1),
      slam: slam ? card.level - 7 : 0,
      onSlam: (x, y, height) => {
        if (!slam || this.disposed) return;
        sfx(slam.sound as Sfx, { volume: 0.9 });
        shake(this.field, slam.shake);
        screenFlash(this.field, slam.flash);
        slamRing(x, y, height * 1.5, slam.ring);
        void hitStop(slam.stop);
      },
      toward: to,
      stage: this.tearStage(el),
      leadMs: lead,
      bits: !tearFx,
      onTear: (x, y, height) => {
        if (!tearFx) return;
        const size = height * 1.25;
        const canvas = h('canvas', { class: 'fx-canvas fx-tear', style: `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px` }) as HTMLCanvasElement;
        document.body.appendChild(canvas);
        void new SpritePlayer(canvas).play('fx_card_tear').finally(() => canvas.remove());
      },
    });
    el.style.visibility = 'hidden';
    await tear;
  }

  /**
   * 낸 카드를 찢는 자리(2026-10-11 사용자 요청 세 번째): 고른 카드가 그 가로 자리에서 캐릭터가 서 있는 높이까지
   * 올라와 1.5배쯤으로 커진 뒤 찢어진다(전장 가운데는 너무 위, 손패 자리는 너무 아래였다)
   */
  private tearStage(el: HTMLElement): { x: number; y: number; height: number } | null {
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    // 보이는 카드 높이(픽셀 카드는 zoom 1.2배)의 1.5배
    const height = Math.min(el.offsetHeight * cssZoom(el) * 1.5, innerHeight * 0.42);
    const width = height * (el.offsetWidth / Math.max(1, el.offsetHeight));
    const x = Math.min(Math.max(r.left + r.width / 2, width / 2 + 8), innerWidth - width / 2 - 8);
    // 캐릭터 그림(아군·적 스프라이트)의 가운데 높이
    const sprites = [...this.root.querySelectorAll<HTMLElement>('.unit:not(.down) .sprite-wrap')].map((e) => e.getBoundingClientRect()).filter((b) => b.height);
    const charY = sprites.length ? sprites.reduce((a, b) => a + b.top + b.height / 2, 0) / sprites.length : r.top;
    const y = Math.min(Math.max(charY, height / 2 + 8), innerHeight - 12 - height / 2);
    return { x, y, height };
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
    // 굽이의 법칙 '안개': 의도가 보이지 않는다
    if (intentHidden(s)) {
      u.intent.append(h('span', { class: 'intent-fog' }, '?'));
      u.intent.setAttribute('aria-label', `${enemy.name}의 의도: 안개에 가려 보이지 않음`);
      Object.entries(tipAttrs('안개', '짙은 안개 때문에 이 적이 무엇을 할지 보이지 않는다.')).forEach(([k, v]) => v !== undefined && u.intent.setAttribute(k, v));
      return;
    }
    const target = view.intent.targetUid ? s.party.find((p) => p.uid === view.intent.targetUid) : undefined;
    const d = view.damage;
    const dmg = d ? `${d.perHit}${d.times > 1 ? `×${d.times}` : ''}` : '';
    const skip = hasSkipTurn(s, enemy);
    u.intent.classList.toggle('skipped', skip);
    u.intent.append(
      intentIcon(view.intent.kind),
      h('span', { class: 'intent-name' }, view.intent.name),
      dmg ? h('b', {}, dmg) : '',
      d?.element ? elementMark(d.element) : '',
      // 공격 말고 하는 일의 핵심 수치(방어·강화·약화·카드·소환)
      ...view.badges.map((b) => h('span', { class: `intent-badge intent-badge-${view.intent.kind}` }, b)),
      d?.all ? h('span', { class: 'intent-target' }, '전체') : target ? h('span', { class: 'intent-target' }, `→ ${target.name}`) : '',
    );
    const body = [
      `${INTENT_LABEL[view.intent.kind] ?? ''}${d ? ` · 1회 ${d.perHit}${d.times > 1 ? ` × ${d.times}회` : ''}${d.all ? ' · 아군 전체' : ''}` : ''}`,
      d?.element ? `${ELEMENT_LABEL[d.element]} 공격: 맞으면 ${this.data.statuses.get(this.data.balance.elements[d.element].status)?.name} ${this.data.balance.elements[d.element].stacks}` : '',
      view.badges.length ? `그 밖에: ${view.badges.join(' · ')}` : '',
      target && !d?.all ? `노리는 대상: ${target.name}` : '',
      skip ? '움직이지 못해 이번 차례에는 행동하지 않는다.' : '',
    ].filter(Boolean);
    Object.entries(tipAttrs(view.intent.name, body.join('\n'), view.intent.kind)).forEach(([k, v]) => v !== undefined && u.intent.setAttribute(k, v));
    // 화면 낭독기: "형의 검 9 → 진하운"
    u.intent.setAttribute('aria-label', [`${enemy.name}의 의도: ${view.intent.name}`, dmg, d?.all ? '→ 아군 전체' : target ? `→ ${target.name}` : '', skip ? '(행동 못 함)' : ''].filter(Boolean).join(' '));
  }

  /** 손패 카드 낭독 문구: 이름 · 비용 · 효과(못 쓰면 그 까닭) */
  private cardLabel(inst: CardInstance, blocked?: string): string {
    const card = resolveCard(this.data, inst);
    const cost = card.cost.neigong + card.cost.mana === 0 ? '비용 없음' : [card.cost.neigong ? `내공 ${card.cost.neigong}` : '', card.cost.mana ? `마나 ${card.cost.mana}` : ''].filter(Boolean).join(' ');
    return [card.def.name + (inst.level ? ` +${inst.level}` : ''), cost, cardText(this.data, inst).replace(/\n/g, ' '), blocked ? `쓸 수 없음: ${blocked}` : ''].filter(Boolean).join(', ');
  }

  /** 아군 머리 위: 이번 적 턴에 받을 피해(방어를 뺀 값). 쓰러질 피해면 진하게 */
  private renderIncoming(u: Unit, v: IncomingView | undefined): void {
    if (intentHidden(this.state)) v = undefined;
    u.intent.style.display = v && v.raw > 0 ? '' : 'none';
    if (!v || v.raw === 0) return;
    u.intent.className = `incoming${v.lethal ? ' lethal' : ''}${v.hpLoss === 0 ? ' safe' : ''}`;
    u.intent.append(intentIcon('attack'), h('b', {}, v.hpLoss), v.blocked > 0 ? h('span', { class: 'blk' }, `(${v.raw} − 방어 ${v.blocked})`) : '');
    const lines = v.hits.map((x) => `${x.enemyName} · ${x.moveName} ${x.perHit}${x.times > 1 ? `×${x.times}` : ''}`);
    if (v.blocked > 0) lines.push(`방어로 ${v.blocked} 막음`);
    if (v.lethal) lines.push('이대로면 쓰러진다');
    Object.entries(tipAttrs(`받을 피해 ${v.hpLoss}`, lines.join('\n'), 'attack')).forEach(([k, v2]) => v2 !== undefined && u.intent.setAttribute(k, v2));
  }

  /**
   * 손패의 떠오른 카드 정하기(2026-10-25 사용자 요청 — 가장자리에 마우스를 두면 카드가 오르내리길 되풀이했다).
   * 카드가 떠오르는 0.15초 동안은 카드와 받침(.hand-hit)이 함께 움직여 바깥 모서리가 잠깐 비고, CSS :hover는 그 틈에 풀렸다.
   * 그래서 떠오르기 시작한 뒤 움직임이 끝날 때까지는 판정을 미루고, 끝난 뒤 마우스 자리 맨 위 카드(받침 포함)로 정한다
   */
  private resolveHandHover = (e?: MouseEvent): void => {
    // mouseenter·mouseleave는 pointermove보다 먼저 오므로 자리는 그 이벤트에서 읽는다
    if (e instanceof MouseEvent) this.pointer = { x: e.clientX, y: e.clientY };
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.hoverTimer = null;
    if (this.disposed) return;
    const now = performance.now();
    const wait = Math.max(this.hoverCard ? this.hoverAt + HAND_LIFT_MS - now : 0, this.handSettleAt - now);
    if (wait > 0) {
      this.hoverTimer = window.setTimeout(() => this.resolveHandHover(), wait);
      return;
    }
    const next = this.handCardAt(this.pointer.x, this.pointer.y);
    if (next === this.hoverCard) return;
    this.hoverCard?.classList.remove('card-hover');
    this.hoverCard = next;
    this.hoverAt = performance.now();
    next?.classList.add('card-hover');
    const i = next ? [...this.handEls.values()].indexOf(next) : -1;
    this.setHover(i >= 0 ? i : null);
  };

  /**
   * 그 자리 맨 위의 손패 카드(받침 포함). 잠깐 덮는 알림 띠·숫자·연출 층은 건너뛰고(유물·물약 알림이 손패 위에 뜰 때 내려앉지 않게),
   * 단추·창 같은 다른 화면 요소가 위에 있으면 카드로 치지 않는다
   */
  private handCardAt(x: number, y: number): HTMLElement | null {
    if (x < 0) return null;
    for (const el of document.elementsFromPoint(x, y)) {
      const card = el.closest<HTMLElement>('.card');
      if (card && card.parentElement === this.handEl) return card;
      if (el.closest('.toast, .float-text, .fx-layer, .card-ghost, .card-slam, .tooltip')) continue;
      return null;
    }
    return null;
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    // 손패를 다시 그린 뒤에는 브라우저가 옛 카드에만 mouseleave를 보내므로, 떠오른 카드 밖으로 나가면 여기서도 다시 정한다
    if (this.hoverCard && !(e.target instanceof Node && this.hoverCard.contains(e.target))) this.resolveHandHover(e);
  };

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
    for (const el of this.handEls.values()) el.classList.remove('surge-risk');
    this.riftEl.querySelector('.surge-now')?.remove();
    const s = this.state;
    const i = this.selected ?? this.hovered;
    if (i === null || this.busy || s.result || !s.hand[i]) return;
    // 이 카드를 쓰면 폭주한다: 카드에 붉은 금 테두리, 균열 게이지에 "폭주!"
    if (cardCausesSurge(s, i)) {
      this.handEls.get(s.hand[i].uid)?.classList.add('surge-risk');
      this.riftEl.append(h('span', { class: 'surge-now' }, '폭주!'));
    }
    const need = needsTarget(s, s.hand[i]);
    // 줄 피해는 아군의 받을 피해와 같은 작은 상자로(치명타는 운이라 미리 보이지 않는다)
    const show = (uid: string, v: CardPreviewHit | undefined) => {
      const u = this.units.get(uid);
      if (!u || !v || u.c.downed) return;
      u.preview.className = `dmg-preview on${v.kills ? ' kill' : ''}${v.hpLoss === 0 ? ' blocked' : ''}`;
      u.preview.append(
        intentIcon('attack'),
        h('b', {}, v.hpLoss > 0 ? `−${v.hpLoss}` : '0'),
        v.hits > 1 ? h('small', {}, `×${v.hits}`) : '',
        v.blocked > 0 ? h('small', { class: 'blk' }, `방어 ${v.blocked}`) : '',
        v.kills ? h('small', { class: 'ko' }, '처치') : '',
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

  /**
   * 단축키: 1~9·0 손패 고르기 · Tab/←→ 대상 바꾸기 · Enter/Space 고른 대상에 쓰기 · E 턴 종료 · Esc 취소
   */
  private onKey = (e: KeyboardEvent) => {
    // D: 이번 전투의 카드 창 열기·닫기(2026-10-12 B8)
    if ((e.key === 'd' || e.key === 'D') && !(e.target as HTMLElement | null)?.closest?.('input, textarea')) {
      if (this.pilesOverlay?.el.isConnected) {
        this.pilesOverlay.close();
        this.pilesOverlay = null;
        return;
      }
      if (!document.querySelector('.overlay, .tour') && !this.state.result) return this.showPiles();
    }
    if (document.querySelector('.overlay, .tour')) return; // 창·안내가 떠 있으면 전투 단축키를 받지 않는다
    if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
    if (e.key === 'Escape') {
      this.selected = null;
      this.potionSel = null;
      this.targetFocus = null;
      this.refresh();
    } else if (e.key === 'e' || e.key === 'E') this.onEndTurn();
    else if (/^[1-9]$/.test(e.key) && this.aimNeed()) {
      // 대상을 고르는 중: 숫자 = 그 번호의 대상
      const c = this.targetPool()[Number(e.key) - 1];
      if (c) this.onUnitClick(c);
    } else if (/^[0-9]$/.test(e.key)) {
      const i = e.key === '0' ? 9 : Number(e.key) - 1;
      if (i < this.state.hand.length) this.onCardClick(i);
    } else if (this.aimNeed() && (e.key === 'Tab' || e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      this.cycleTarget(e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey) ? -1 : 1);
    } else if (this.aimNeed() && this.targetFocus && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      const c = [...this.state.party, ...this.state.enemies].find((x) => x.uid === this.targetFocus);
      if (c) this.onUnitClick(c);
    }
  };

  /** 지금 고르는 중인 대상 종류(고른 물약 → 고른 카드) */
  private aimNeed(): 'enemy' | 'ally' | null {
    const s = this.state;
    if (this.potionSel !== null) return potionTarget(s, this.potionSel) ?? null;
    if (this.selected !== null && s.hand[this.selected]) return needsTarget(s, s.hand[this.selected]) ?? null;
    return null;
  }

  /** 고른 카드·물약이 노릴 수 있는 대상들(번호 순서 = 화면 왼쪽부터) */
  private targetPool(): Combatant[] {
    const need = this.aimNeed();
    const x = (c: Combatant) => this.units.get(c.uid)?.el.getBoundingClientRect().left ?? 0;
    return (need === 'enemy' ? this.state.enemies : need === 'ally' ? this.state.party : []).filter((c) => !c.downed).sort((a, b) => x(a) - x(b));
  }

  /**
   * 끌어 놓기: 카드를 끌어 대상 위에 놓으면 그 대상에게 쓴다. 대상이 없는 카드는 손패 위쪽으로 끌어 올리면 쓴다.
   * 조금(14px) 움직이기 전까지는 보통 누르기로 둔다
   */
  private startDrag(e: PointerEvent, i: number, el: HTMLElement): void {
    if (this.busy || this.state.result || e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    const need = needsTarget(this.state, this.state.hand[i]);
    const unitAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y)?.closest<HTMLElement>('.unit');
      if (!hit) return null;
      const u = [...this.units.values()].find((v) => v.el === hit);
      if (!u || u.c.downed) return null;
      if ((need === 'enemy' && u.c.side !== 'enemy') || (need === 'ally' && u.c.side !== 'party') || !need) return null;
      return u;
    };
    const dragZoom = cssZoom(el);
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 14 || !canPlay(this.state, i).ok) return;
        ghost = el.cloneNode(true) as HTMLElement;
        ghost.classList.add('card-ghost', 'card-drag');
        const r = el.getBoundingClientRect();
        Object.assign(ghost.style, { position: 'fixed', left: `${r.left / dragZoom}px`, top: `${r.top / dragZoom}px`, width: `${r.width / dragZoom}px`, pointerEvents: 'none', zIndex: '200', transform: 'none', margin: '0' });
        document.body.appendChild(ghost);
        el.classList.add('drag-source');
      }
      // 픽셀 카드는 zoom이 걸려 있어 화면 좌표를 zoom으로 나눠 준다
      ghost.style.left = `${ev.clientX / dragZoom - ghost.offsetWidth / 2}px`;
      ghost.style.top = `${ev.clientY / dragZoom - ghost.offsetHeight * 0.4}px`;
      const u = unitAt(ev.clientX, ev.clientY);
      if (over && over !== u?.el) over.classList.remove('drop-target');
      over = u?.el ?? null;
      over?.classList.add('drop-target');
    };
    const stopListening = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.dragCleanup = null;
    };
    const up = (ev: PointerEvent) => {
      stopListening();
      if (!ghost) return;
      ghost.remove();
      el.classList.remove('drag-source');
      over?.classList.remove('drop-target');
      this.dragged = true;
      setTimeout(() => (this.dragged = false), 0);
      const u = unitAt(ev.clientX, ev.clientY);
      if (need && u) {
        this.selected = null;
        void this.act(() => playCard(this.state, i, u.c.uid), () => this.flyPlayed(i, u.c.uid));
      } else if (!need && ev.clientY < this.handEl.getBoundingClientRect().top - 30) {
        this.selected = null;
        void this.act(() => playCard(this.state, i), () => this.flyPlayed(i));
      }
    };
    this.dragCleanup?.();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.dragCleanup = () => {
      stopListening();
      ghost?.remove();
    };
  }

  /** 키보드 대상: 다음·앞 대상으로 */
  private cycleTarget(dir: 1 | -1): void {
    const pool = this.targetPool();
    if (!pool.length) return;
    const at = pool.findIndex((c) => c.uid === this.targetFocus);
    this.targetFocus = pool[(at + dir + pool.length) % pool.length].uid;
    this.refresh();
  }

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
    this.targetFocus = pool[0]?.uid ?? null;
    this.refresh();
    // 휴대폰: 고른 카드가 손패 띠 밖이면 손패 띠만 옆으로 민다(화면 전체가 움직이지 않게)
    const picked = this.handEls.get(this.state.hand[i].uid);
    if (picked && this.handEl.scrollWidth > this.handEl.clientWidth + 1) {
      this.handEl.scrollTo?.({ left: picked.offsetLeft - this.handEl.offsetLeft - (this.handEl.clientWidth - picked.offsetWidth) / 2, behavior: 'smooth' });
    }
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
      // 물약 확인: 첫 누름은 칩을 키우고 "다시 누르면 사용"(2초 뒤 풀림), 두 번째 누름에 쓴다
      if (settings.confirmPotion && this.potionArm !== slot) {
        this.potionArm = slot;
        if (this.potionArmTimer !== null) clearTimeout(this.potionArmTimer);
        this.potionArmTimer = window.setTimeout(() => {
          this.potionArm = this.potionArmTimer = null;
          this.refresh();
        }, 2000);
        return this.refresh();
      }
      this.disarmPotion();
      return void this.act(() => usePotion(this.state, slot));
    }
    this.disarmPotion();
    const pool = (need === 'enemy' ? this.state.enemies : this.state.party).filter((c) => !c.downed);
    if (pool.length === 1) return void this.act(() => usePotion(this.state, slot, pool[0].uid));
    this.potionSel = slot;
    this.refresh();
  }

  private disarmPotion(): void {
    if (this.potionArmTimer !== null) clearTimeout(this.potionArmTimer);
    this.potionArm = this.potionArmTimer = null;
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

  private onEndTurn(confirmed = false): void {
    if (this.busy || this.state.result) return;
    // 쓸 수 있는 카드가 남았으면 한 번 묻는다(설정에서 끌 수 있다)
    const playable = this.state.hand.filter((c, i) => canPlay(this.state, i).ok && resolveCard(this.data, c).def.type !== 'status').length;
    if (!confirmed && settings.confirmEndTurn && playable > 0) {
      void confirmDialog('턴 종료', `아직 쓸 수 있는 카드가 ${playable}장 있다. 턴을 끝낼까?`, '턴 끝내기').then((ok) => ok && this.onEndTurn(true));
      return;
    }
    this.selected = null;
    this.potionSel = null;
    this.targetFocus = null;
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
    try {
      await this.actInner(fn, before, freezeHand);
    } catch (e) {
      ignoreClosed(e);
    }
  }

  private async actInner(fn: () => unknown, before: (() => Promise<void>) | undefined, freezeHand: boolean): Promise<void> {
    this.alive();
    this.busy = true;
    this.hovered = null;
    this.endBtn.disabled = true;
    // 대상 고르기 표시를 걷는다(낸 카드는 떠오른 자리에서 찢긴다)
    this.field.classList.remove('aiming');
    for (const u of this.units.values()) {
      u.el.classList.remove('targetable', 'target-focus');
    }
    this.renderPreview();
    if (before) await before();
    this.alive();
    this.handFrozen = freezeHand;
    // 여기서 다시 그리지 않는다: 낸 카드가 손패에 잠깐 되살아나거나, 피해가 연출보다 먼저 보이지 않게(연출이 이벤트마다 다시 그린다)
    // 행동 직전 체력을 적어 둔다(연출이 이벤트마다 옮긴다)
    this.shown = new Map([...this.state.party, ...this.state.enemies].map((c) => [c.uid, { hp: c.hp, maxHp: c.maxHp, downed: c.downed }]));
    const r = fn() as { ok?: boolean; reason?: string } | undefined;
    if (r && r.ok === false && r.reason) toast(this.toasts, r.reason, 'danger');
    await this.animate(this.state.events.splice(0));
    this.alive();
    this.shown.clear();
    this.busy = false;
    this.handFrozen = false;
    this.refresh();
    if (this.state.result) this.showResult();
  }

  // ───────────────────────── 연출 ─────────────────────────

  private async animate(events: BattleEvent[]): Promise<void> {
    for (const [idx, ev] of events.entries()) {
      this.alive();
      switch (ev.type) {
        case 'turn':
          if (ev.turn > 1) {
            toast(this.toasts, `${ev.turn}턴`, 'info');
            sfx('turn');
          } else {
            // 상흔이 시작 균열을 올렸으면 첫 턴에 한 번 알린다(2026-10-12 A5)
            const m = scarStartRift(this.data, this.ctx.scar, this.state.world);
            if (m > 0) toast(this.toasts, `상흔 ${this.ctx.scar} → 시작 균열 +${m}`, 'danger', 2400);
          }
          break;
        case 'card': {
          this.lastCard = ev.cardId;
          sfx('card');
          const def = resolveCard(this.data, ev.cardId).def;
          if (def.castLine && settings.cutIn) await this.cutIn(ev.cardId, def.castLine);
          this.alive();
          // 피해 없는 카드(기술·파워): 쓴 사람 위에 시전 이펙트(data/fx.json castFx)
          const cast = def.type !== 'attack' && ev.sourceUid ? this.realFx(cardFx(this.data, def).castFx) : null;
          if (cast) void this.playFx(cast, ev.sourceUid!);
          break;
        }
        case 'attack':
          await this.playAttack(ev.sourceUid, ev.targetUids);
          break;
        case 'damage': {
          const u = this.units.get(ev.targetUid);
          if (!u) break;
          const sh = this.shown.get(ev.targetUid);
          if (sh && ev.absorbed) {
            sh.hp += ev.amount;
            sh.maxHp += ev.amount;
          } else if (sh) sh.hp = Math.max(0, sh.hp - ev.amount);
          if (ev.absorbed) floatOver(this.fxLayer, u.el, `먹힘 +${ev.amount}`, 'absorb');
          else {
            // 소리: 맞은 쪽 자리(적 오른쪽, 일행 왼쪽)에서. 막혀서 0이면 막는 소리
            const pan = u.c.side === 'enemy' ? 0.35 : -0.35;
            // 치명타는 금빛 큰 숫자, 결은 푸른 숫자. 약점·내성은 작은 글자를 하나 더
            const heavy = ev.amount >= 150;
            floatOver(this.fxLayer, u.el, ev.crit ? `치명 ${ev.amount}!` : ev.grain ? `${ev.amount}!` : String(ev.amount), ev.crit ? 'critical' : ev.grain ? 'crit' : heavy ? 'heavy' : 'damage');
            if (ev.weak) floatOver(this.fxLayer, u.el, '약점!', 'weak');
            else if (ev.resisted) floatOver(this.fxLayer, u.el, '내성', 'resist');
            if (ev.conducted) floatOver(this.fxLayer, u.el, '전도!', 'conduct');
            if (ev.blocked) floatOver(this.fxLayer, u.el, `막음 ${ev.blocked}`, 'block');
            // 이 피해로 쓰러지는가(엔진은 피해 바로 뒤에 쓰러짐 이벤트를 남긴다)
            const kill = events.slice(idx + 1, idx + 4).some((e) => (e.type === 'downed' || e.type === 'death') && e.uid === ev.targetUid);
            sfx(ev.amount <= 0 ? 'block' : ev.crit || kill ? 'crit' : ev.amount >= 150 ? 'hit_heavy' : 'hit', { pan });
            if (ev.amount > 0 && ev.element) sfx(ev.element, { pan, volume: 0.7 });
            const fx = this.hitFxFor(ev);
            if (fx) void this.playFx(fx, ev.targetUid);
            if (!u.c.downed) void u.player.play(this.spriteFor(u.c, 'hit')).then((done) => done && this.idle(u));
            flash(u.el, ev.grain ? 'blue' : 'white');
            this.refresh();
            if (ev.amount > 0) {
              // 세기: 피해가 클수록, 치명타·처치면 가장 세게. 맞은 쪽은 공격 반대편으로 밀린다
              // (2026-10-11 사용자 요청 — 타격감이 약했다: 작은 피해도 화면이 조금 흔들리고, 맞은 자리에 충격 고리·베기 줄)
              const big = ev.crit || kill;
              const power = big ? 1 : Math.min(0.9, 0.45 + ev.amount / 300);
              const dir = u.c.side === 'enemy' ? 1 : -1;
              const strength = big ? 'crit' : heavy ? 'heavy' : 'light';
              const tone = u.c.side === 'party' ? 'red' : ev.crit ? 'gold' : ev.grain ? 'blue' : ev.element === 'fire' || ev.element === 'lightning' ? 'gold' : 'white';
              impact(this.fxLayer, u.el, strength, tone, dir);
              shake(u.el, power, dir);
              shake(this.field, power * (big ? 0.7 : heavy ? 0.5 : 0.3), dir);
              if (big || heavy) screenFlash(this.field, u.c.side === 'party' ? 'red' : ev.crit ? 'gold' : 'white');
              // 타격 멈춤: 보통 70ms, 큰 피해 110ms, 치명타·처치 150ms(빠른 속도면 줄인다)
              await hitStop((big ? 150 : heavy ? 110 : 70) * Math.max(0.5, settings.speed));
              this.alive();
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
          const sh = this.shown.get(ev.targetUid);
          if (sh) sh.hp = Math.min(sh.maxHp, sh.hp + ev.amount);
          if (u) floatOver(this.fxLayer, u.el, `+${ev.amount}`, 'heal');
          if (u && ev.amount > 0) this.playEventFx('heal', ev.targetUid);
          sfx('heal');
          this.refresh();
          await this.wait(100);
          break;
        }
        case 'status': {
          const u = this.units.get(ev.targetUid);
          if (u && ev.stacks > 0) {
            floatOver(this.fxLayer, u.el, this.data.statuses.get(ev.status)?.name ?? ev.status, 'status');
            // 상태 이펙트: 독 → 독구름, 해로운 상태 → 보랏빛 문양, 이로운 상태 → 금빛 화살표(data/fx.json events)
            const kind = this.data.statuses.get(ev.status)?.kind;
            // 감전·마비처럼 상태마다 정한 이펙트가 있으면 그것(data/fx.json statusFx).
            // 행동 제약 내성(수면 내성 등)은 본 상태(졸음)보다 한 발 먼저 붙는다 — 여기서 금빛 화살표가 나가면 0.4초 겹침 막기에
            // 걸려 본 상태 이펙트(잠 안개)가 지워진다(2026-10-22). 내성은 이펙트 없이 글자만 띄운다
            const played = this.resistMarkers().has(ev.status)
              ? null
              : this.playEventFx(statusFx(this.data, ev.status) ?? (ev.status === 'poison' ? 'poison' : kind === 'debuff' ? 'debuff' : 'buff'), ev.targetUid);
            // 이펙트에 제 소리(독 보글보글·잠 종소리 등)가 있으면 그 소리, 없으면 공통 상태 소리
            if (!played || !fxSound(this.data, played)) sfx('status', { volume: 0.6 });
          }
          if (ev.status === 'knot_exposed' && ev.stacks > 0) this.alert('매듭이 드러났다 — 날 얹기!', 'support');
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
        case 'surge': {
          void this.rift.surge();
          sfx('surge');
          shake(this.field, 1);
          flash(this.field, 'red');
          await this.wait(350);
          // 첫 폭주(브라우저마다 한 번): 멈추고 네 가지와 막는 법 → 잔향·적의 힘·균열 게이지를 차례로 짚는다. 그다음부터는 짧은 띠만
          const b = this.data.balance.rift;
          const n = ev.count ?? 1;
          // 폭주 그림(설정 「폭주 그림」, 누르거나 아무 키로 건너뜀): 네 가지를 그림 위에 보여 주므로 짧은 띠를 대신한다
          if (settings.surgeArt) await surgeCut(this.data, n);
          this.alive();
          if (!tourSeen('surge-guide')) {
            this.refresh();
            await openSurgeGuide(this.data);
            this.alive();
            runTour(
              [
                { target: this.handEls.get(this.state.hand.find((c) => c.cardId === b.echoCard)?.uid ?? '') ?? '.hand', title: '틈의 잔향', text: '손에 든 채 턴을 끝내면 균열 +1. 내공 1을 써서 털어 내면(소멸) 사라진다.' },
                { target: '.unit-enemy .chip-buff, .unit-enemy .status-chip', title: '적의 힘 +1', text: '폭주할 때마다 적 모두의 공격이 1씩 세진다. 이 전투가 끝날 때까지 남는다.' },
                { target: '.b-rift', title: '균열 게이지', text: `균열은 ${b.surgeResetTo}으로 돌아왔다. 8이 넘으면 게이지가 붉게 고동치고, 쓰면 폭주하는 카드는 붉은 금 테두리가 붙는다.` },
              ],
              { id: 'surge-guide' },
            );
          } else if (!settings.surgeArt) this.alert(`폭주${n > 1 ? ` ×${n}` : ''} — 체력 ${Math.round(b.surgeRatio * 100) * n}% · 힘 +${b.surgeEnemyStrength} · 잔향 ${b.surgeEchoToHand} · 상흔 +${b.surgeScar}`, 'danger');
          break;
        }
        case 'focus': {
          // 갈래 보너스(편성): 전투 시작 효과
          const m = this.data.characters.get(ev.member);
          const arch = m?.archetypes.find((a) => a.id === ev.arch);
          this.alert(`갈래 보너스 — ${m?.name ?? ev.member}${arch?.focus ? ` · ${arch.focus.text.replace(/^전투 시작: /, '')}` : ''}`, 'support');
          break;
        }
        case 'recall':
          this.alert(`되찾았다 — ${this.data.cards.get(ev.cardId)?.name ?? ev.cardId}`, 'support');
          break;
        case 'copy':
          this.alert(`한 장 더 — ${this.data.cards.get(ev.cardId)?.name ?? ev.cardId}`, 'support');
          break;
        case 'echo':
          this.alert('틈의 잔향이 덱에 섞였다', 'danger');
          break;
        case 'support':
          this.alert(`왕일검 — ${ev.name}`, 'support');
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
          const sh = this.shown.get(ev.uid);
          if (sh) sh.downed = true;
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
          // 새 모습의 체력은 상태의 값 그대로
          this.shown.delete(ev.uid);
          if (old) {
            old.player.stop();
            const fresh = this.makeUnit(old.c);
            old.el.replaceWith(fresh.el);
            this.alert(`${ev.from} — ${ev.text}`, 'danger');
            sfx('transform');
            shake(this.field, 0.8);
            flash(this.field, 'red');
            this.refresh();
          }
          await this.wait(600);
          break;
        }
        case 'gate': {
          // 보스 2막(모듈 content.bossGate): 체력이 다시 차고 잠든 특성이 깨어난다 — 바로 뒤에 폭주 사건이 이어진다
          this.alert(`${ev.name} — ${ev.text}`, 'danger');
          sfx('transform');
          shake(this.field, 0.9);
          flash(this.field, 'red');
          this.refresh();
          await this.wait(900);
          // 흐름 포식·매듭·고리 멈추기 안내는 2막이 열릴 때(처음 한 번)
          this.riftHeartTour();
          break;
        }
        case 'sealSurge': {
          this.alert('꿰맨 자리에서 하늘의 금 하나가 닫혔다 — 폭주 −1', 'support');
          await this.wait(500);
          break;
        }
        case 'summon': {
          // 소환: 적 편 끝에 새 자리를 만든다
          const c = this.state.enemies.find((e) => e.uid === ev.uid);
          if (c && !this.units.has(c.uid)) {
            const u = this.makeUnit(c);
            this.enemySide.appendChild(u.el);
            this.fitUnits();
            u.el.classList.add('summoned');
            floatOver(this.fxLayer, u.el, '소환', 'status');
            sfx('summon');
            this.refresh();
          }
          await this.wait(450);
          break;
        }
        case 'discard': {
          const haun = [...this.units.values()].find((u) => u.c.defId === 'haun');
          if (haun) floatOver(this.fxLayer, haun.el, `버림: ${this.data.cards.get(ev.cardId)?.name ?? ev.cardId}`, 'status');
          sfx('discard', { volume: 0.7 });
          await this.wait(200);
          break;
        }
        case 'enrage': {
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, '격노', 'crit');
          sfx('enrage');
          this.alert(ev.text, 'danger');
          shake(this.field, 0.6);
          await this.wait(500);
          break;
        }
        case 'power': {
          // 파워(발동 상태)가 일어났다: 그 상태 이름을 띄운다
          const u = this.units.get(ev.uid);
          if (u) floatOver(this.fxLayer, u.el, `${this.data.statuses.get(ev.status)?.glyph ?? ''} ${this.data.statuses.get(ev.status)?.name ?? ev.status}`, 'status');
          sfx('power', { volume: 0.5 });
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
          // 단계 기술(이그니스의 '협곡의 하늘이 찢어진다' 등): 검은 틈이 그어지듯 짧게 흔들리고 붉게 번쩍인다. 폭주 연출이 바로 이어진다
          if (u && this.data.enemies.get(u.c.defId)?.moves.some((m) => m.phase && m.name === ev.moveName)) {
            shake(this.field, 0.8);
            flash(this.field, 'red');
            sfx('rift', { volume: 0.9 });
            await this.wait(250);
          }
          await this.wait(200);
          break;
        }
        case 'phase': {
          // 단계 기술이 다음 의도로 끼어들었다: 의도 표시가 바뀐 것을 화면 가운데에서 한 번 알린다
          const u = this.units.get(ev.uid);
          this.refresh();
          this.alert(`${u?.c.name ?? '적'}의 기색이 바뀐다 — 다음 차례: ${ev.moveName}`, 'danger');
          shake(this.field, 0.4);
          await this.wait(400);
          break;
        }
        case 'result':
          sfx(ev.result === 'victory' ? 'victory' : 'defeat');
          break;
      }
    }
  }

  /**
   * 전투 이야기 글(가운데 위): 첫 턴 2.5초 뒤 한 줄 칩으로 접힌다. 누르면 펼치고 다시 누르면 접는다.
   * 움직임 줄이기·화면 연출 끔이면 처음부터 접힌 채(2026-10-11 UI/UX 2-2)
   */
  private introEl(): HTMLElement {
    const el = h('p', { class: 'battle-intro chip', role: 'button', tabindex: '0', title: '눌러서 펼치기·접기' }, this.ctx.introText!);
    const toggle = () => el.classList.toggle('collapsed');
    el.addEventListener('click', toggle);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle()));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('no-motion')) el.classList.add('collapsed');
    else setTimeout(() => el.classList.add('collapsed'), 2500);
    return el;
  }

  /** 전투 기록 판 보이기·숨기기(기본 숨김) */
  private toggleLog(): void {
    const on = this.logEl.classList.toggle('on');
    this.logMedal.classList.toggle('on', on);
  }

  /** 대사 띠가 떠 있는 동안 dock-mid에 strip-on(휴대폰: 손패 힌트를 띠 위로) */
  private watchStrip(mid: HTMLElement): HTMLElement {
    const sync = () => mid.classList.toggle('strip-on', this.alerts.childElementCount > 0);
    new MutationObserver(sync).observe(this.alerts, { childList: true });
    return mid;
  }

  /** 전투 중 이야기 대사·경고: 손패 바로 위 띠. 3초 뒤 또는 누르면 닫힌다(의도·받을 피해 예고를 가리지 않게) */
  private alert(text: string, kind: 'support' | 'danger'): void {
    const el = toast(this.alerts, text, kind, 3000);
    el.addEventListener('click', () => el.remove());
  }

  /** 연출 사이 쉬기. 그사이 전투 화면이 닫혔으면 BattleClosed를 던져 남은 연출을 건너뛴다 */
  private wait(ms: number): Promise<void> {
    return sleep(ms * settings.speed).then(() => this.alive());
  }

  private alive(): void {
    if (this.disposed) throw new BattleClosed();
  }

  /** D 키·冊 표식: 이번 전투의 카드 창(D는 다시 누르면 닫는다) */
  private pilesOverlay: { close: () => void; el: HTMLElement } | null = null;
  private showPiles(): void {
    const s = this.state;
    this.pilesOverlay = openDeck(this.data, '이번 전투의 카드', [
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
    // 네 줄 메뉴: 이어하기 / 설정(2단계) / 타이틀로 / 런 포기(붉은 옻칠, 확인 창) — 2026-10-11 UI/UX 4-2
    const body = h('div', { class: 'menu' });
    const main = () =>
      body.replaceChildren(
        h(
          'div',
          { class: 'menu-list' },
          h('button', { class: 'btn btn-primary btn-large', onclick: () => menu.close() }, '이어하기'),
          h('button', { class: 'btn btn-large', onclick: settingsPage }, '설정'),
          quit ? h('button', { class: 'btn btn-large', title: '진행은 이 전투에 들어오기 직전의 지도에서 이어집니다', onclick: () => leave(false) }, '타이틀로', h('small', {}, '이 전투 직전 지도에서 이어진다')) : null,
          quit
            ? h(
                'button',
                {
                  class: 'btn btn-large btn-danger menu-abandon',
                  onclick: async () => {
                    if (await confirmDialog('런 포기', '지금 런을 끝내고 저장을 지웁니다. 되돌릴 수 없습니다.', '포기')) leave(true);
                  },
                },
                '런 포기',
              )
            : null,
        ),
      );
    const settingsPage = () => body.replaceChildren(h('button', { class: 'btn btn-small menu-back', onclick: main }, '← 메뉴로'), settingsForm({ tab: 'battle' }));
    main();
    const menu = openOverlay('메뉴', body);
    requestAnimationFrame(() => body.querySelector<HTMLElement>('.menu-list .btn-primary')?.focus());
  }

  private idle(u: Unit): void {
    if (!this.disposed && !u.c.downed) void u.player.play(this.spriteFor(u.c, 'idle'), { loop: true });
  }

  /** 공격 애니메이션을 재생하고, hit 이벤트 프레임에서 다음 연출(피해 숫자)로 넘어간다 */
  /** 틈의 심장 안내(흐름 포식·매듭·고리 멈추기·격노). 흐름 포식·매듭이 붙은 적이 있을 때 처음 한 번 */
  private riftHeartTour(then: () => void = () => {}): void {
    const bal = this.data.balance;
    const heart = this.state.enemies.find((e) => !e.downed && ((e.statuses.flow_eater ?? 0) > 0 || (e.statuses.knot ?? 0) > 0));
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
  }

  private async playAttack(sourceUid: string, targetUids: string[]): Promise<void> {
    const u = this.units.get(sourceUid);
    if (!u) return;
    const card = u.c.side === 'party' && this.lastCard ? resolveCard(this.data, this.lastCard).def : null;
    const anim = card?.anim ?? (card && card.type !== 'attack' ? 'skill' : 'attack');
    let hitResolve!: () => void;
    const hit = new Promise<void>((r) => (hitResolve = r));
    const done = u.player.play(this.spriteFor(u.c, anim), { onEvent: (name) => name === 'hit' && hitResolve() });
    void done.then((finished) => {
      hitResolve();
      if (finished) this.idle(u);
    });
    const fx = card ? this.realFx(cardFx(this.data, card).fx) : null;
    if (fx) for (const t of targetUids) void this.playFx(fx, t);
    await Promise.race([hit, this.wait(900)]);
    this.alive();
  }

  /**
   * 피해마다 맞은 자리의 피격 이펙트(GAME_DESIGN 13절): 결 노출 → 결, 방어로 모두 막음 → 막힘, 그 밖에는 공격한 쪽의 hitFx.
   * 카드에 fx(검광 등)가 있으면 공격 연출에서 이미 나가므로 겹치지 않는다. 독처럼 출처가 없는 피해는 이펙트 없음
   */
  private hitFxFor(ev: Extract<BattleEvent, { type: 'damage' }>): string | null {
    if (ev.absorbed) return null;
    if (ev.grain) return 'fx_hit_grain';
    if (ev.amount === 0 && ev.blocked > 0) return 'fx_block';
    // 전도(냉기 붙은 적에게 번개 ×1.5): 얼음을 타고 번지는 번개 — 공격 이펙트가 있어도 겹친다(2026-10-14)
    if (ev.conducted && this.realFx('fx_hit_conduct')) return 'fx_hit_conduct';
    // 속성 피격(2026-10-14 사용자 요청 — 번개 카드 = 번개 피격): 번개 피해면 카드·물약·강화 효과·공격 이펙트와 상관없이 전기 불꽃
    const element = this.realFx(elementHitFx(this.data, ev.element));
    if (element) {
      this.eventFxAt.set(ev.targetUid, performance.now());
      return element;
    }
    const src = ev.sourceUid ? this.units.get(ev.sourceUid)?.c : undefined;
    if (!src) return null;
    if (src.side === 'enemy') return this.data.enemies.get(src.defId)?.hitFx ?? 'fx_hit_strike';
    const card = this.lastCard ? resolveCard(this.data, this.lastCard).def : null;
    if (!card) return 'fx_hit_strike';
    const rule = cardFx(this.data, card);
    if (this.realFx(rule.fx)) return null;
    return this.realFx(rule.hitFx) ?? card.hitFx ?? 'fx_hit_strike';
  }

  /**
   * 이펙트 규칙(data/fx.json)이 고른 그림은 실제 그림이 왔을 때만 쓴다 — 임시 그림이면 지금처럼(fx 없음 · 카드 hitFx · fx_hit_strike)
   */
  private realFx(id: string | undefined): string | null {
    return id && spriteSource(id) === 'sprites' ? id : null;
  }

  /** 다른 상태의 행동 제약 내성으로 쓰이는 상태(statuses[].resist) */
  private resistMarkerSet: Set<string> | null = null;
  private resistMarkers(): Set<string> {
    return (this.resistMarkerSet ??= new Set([...this.data.statuses.values()].map((s) => s.resist).filter((r): r is string => !!r)));
  }

  /** 카드와 상관없이 회복·이로운 상태·해로운 상태·독에 겹치는 이펙트. 같은 자리에 0.4초 안에 두 번은 겹치지 않는다 */
  private eventFxAt = new Map<string, number>();
  /** 낸 이펙트 id(겹침 막기·임시 그림이면 null) */
  private playEventFx(kind: 'heal' | 'buff' | 'debuff' | 'poison' | (string & {}), targetUid: string): string | null {
    const id = this.realFx(kind in this.data.fx.events ? this.data.fx.events[kind as 'heal'] : kind);
    if (!id) return null;
    const now = performance.now();
    if ((this.eventFxAt.get(targetUid) ?? -1e9) > now - 400) return null;
    this.eventFxAt.set(targetUid, now);
    void this.playFx(id, targetUid);
    return id;
  }

  private async playFx(fxId: string, targetUid: string): Promise<void> {
    const t = this.units.get(targetUid);
    if (!t || this.disposed) return;
    // 이펙트별 효과음(data/fx.json sounds, 2026-10-22): 피격·상태 소리 위에 작게 얹는다. 같은 소리가 한 순간에 겹치면 sfx가 하나로 줄인다
    const sound = fxSound(this.data, fxId) as Sfx | undefined;
    if (sound) sfx(sound, { pan: t.c.side === 'enemy' ? 0.35 : -0.35, volume: 0.55 });
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
    sfx('cutin');
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

  /** 전투 결과 팝업(2026-10-11 목업): 勝 이겼다 · 守 버텼다 · 敗 쓰러졌다 + 턴 · 준 피해 · 처치 */
  private showResult(): void {
    const s = this.state;
    const win = s.result === 'victory';
    const t = s.tally;
    const stats: [string, number][] = [[s.survived ? '버틴 턴' : '턴', s.turn], ['준 피해', t?.damage ?? 0], ['쓰러뜨림', t?.kills ?? 0]];
    // 폭주가 났으면 횟수와 폭주로 잃은 체력(GAME_DESIGN 7절)
    if (t?.surges) stats.push(['폭주', t.surges], ['폭주로 잃은 체력', t.surgeHp ?? 0]);
    const haun = s.party.find((p) => p.defId === 'haun');
    // 받침이 있으면 '이', 없으면 '가'
    const iga = (name: string) => { const c = name.charCodeAt(name.length - 1) - 0xac00; return c >= 0 && c < 11172 && c % 28 ? '이' : '가'; };
    const cause = haun ? h('p', { class: 'pop-cause' }, `${haun.name}${iga(haun.name)} `, h('b', {}, t?.haunHitBy ?? '알 수 없는 것'), '에 쓰러졌다.') : h('p', { class: 'pop-cause' }, '출전한 일행이 모두 쓰러졌다.');
    const go = h('button', { class: 'btn btn-primary', onclick: () => this.finish() }, win ? '계속' : '결과 보기');
    const overlay = h(
      'div',
      { class: `result-overlay ${win ? 'win' : 'lose'}` },
      popPanel(
        s.survived
          ? { seal: '守', eyebrow: '전투 결과', title: '버텼다', tone: 'win', lead: `${s.turn}턴, 끝까지 자리를 지켰다.`, stats, actions: [go] }
          : win
            ? { seal: '勝', sealKind: 'solid', eyebrow: '전투 승리', title: '이겼다', tone: 'win', lead: '결을 따라, 날을 얹었다.', stats, actions: [go] }
            : { seal: '敗', sealKind: 'muted', eyebrow: '전투 패배', title: '쓰러졌다', tone: 'lose', lead: cause, stats, actions: [go] },
      ),
    );
    this.root.appendChild(overlay);
    requestAnimationFrame(() => go.focus());
  }

  /** report=false: 결과를 넘기지 않고 화면만 정리(메뉴에서 나갈 때) */
  private finish(report = true): void {
    // 두 번 눌러도 결과는 한 번만 넘긴다
    if (this.disposed) return;
    this.disposed = true;
    // 이 화면이 건 듣개·관찰자·타이머를 거두고, 돌던 스프라이트를 멈춘다(기다리던 연출은 깨어나면 BattleClosed로 끝난다)
    document.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onPointerMove);
    if (this.hoverTimer !== null) clearTimeout(this.hoverTimer);
    this.resizeObs.disconnect();
    this.dragCleanup?.();
    if (this.bonusTimer !== null) clearTimeout(this.bonusTimer);
    if (this.potionArmTimer !== null) clearTimeout(this.potionArmTimer);
    this.pilesOverlay?.close();
    for (const u of this.units.values()) u.player.stop();
    const w = window as unknown as { __battle?: unknown };
    if (w.__battle === this) delete w.__battle;
    if (report) this.onFinish(this.state);
  }
}


/** 오른쪽 위 둥근 표식: 한자 한 글자 + 숫자 배지(count가 없으면 배지 없음). 이름·설명은 주석(툴팁)으로 */
/** 표식 아래 작은 글자(설정 '표식에 글자 함께') */
const MEDAL_SHORT: Record<string, string> = { 抽: '뽑을', 棄: '버림', 滅: '소멸', 冊: '덱', 記: '기록', 設: '설정' };

function medal(glyph: string, label: string, body: string, onclick: () => void, count?: number): HTMLElement {
  return h(
    'button',
    { class: 'medal', 'aria-label': count === undefined ? label : `${label} ${count}`, onclick, ...tipAttrs(count === undefined ? label : `${label} ${count}`, body) },
    h('b', {}, glyph),
    count === undefined ? null : h('i', {}, count),
    MEDAL_SHORT[glyph] ? h('small', { class: 'medal-label', 'aria-hidden': 'true' }, MEDAL_SHORT[glyph]) : null,
  );
}

/** 균열 게이지 주석의 감쇠 한 줄: 차례 끝마다 균열 −N, 모듈이 덮어썼으면 그 까닭(예: 감쇠 없음(화로)) */
function riftDecayLine(s: BattleState): string {
  const d = riftDecayOf(s);
  const note = s.riftDecayNote ? `(${s.riftDecayNote})` : '';
  if (d === 0) return `이 전투는 감쇠 없음${note} — 차례가 끝나도 줄지 않는다. `;
  return `차례 끝마다 −${d}${note}. `;
}

/** 첫 폭주 안내 창(GAME_DESIGN 7절): 네 가지 + 균열이 돌아오는 값 + 막는 법. ?screen=surgeguide로도 본다 */
export function openSurgeGuide(data: GameData): Promise<void> {
  const b = data.balance.rift;
  return surgeGuide(
    [
      ['血', `일행 모두 최대 체력의 ${Math.round(b.surgeRatio * 100)}%를 잃는다(하운은 ${b.surgeHaunExtra} 더). 같은 전투에서 또 터지면 ×2, ×3.`],
      ['力', `적 모두 힘 +${b.surgeEnemyStrength}. 흐름을 먹는 적은 체력 ${b.surgeEnemyHeal}을 채운다.`],
      ['響', `틈의 잔향 ${b.surgeEchoToHand}장이 손에 들어온다. 든 채 턴을 끝내면 균열 +1 — 내공 1로 털어 낼 수 있다.`],
      ['裂', `상흔 +${b.surgeScar}. 지도로 돌아가면 앞길 하나가 끊기고 裂 틈새가 열린다.`],
    ],
    [`균열은 ${b.surgeResetTo}으로 돌아온다.`, '막는 법: 숨 세기 같은 감소 카드 · 봉인 · 휴식의 꿰매기 · 지도의 裂 틈새'],
  );
}
