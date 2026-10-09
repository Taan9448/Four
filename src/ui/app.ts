// 화면 흐름: 타이틀 → 지도 → (스토리/이벤트/휴식/여관 | 전투 → 보상) → 지도 … → 스테이지 클리어 / 패배
import { battleOutcome, createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { randomSeed } from '../engine/rng';
import type { MapNode } from '../engine/route';
import {
  addCard,
  advanceStage,
  applyBattleOutcome,
  bonusActive,
  applyRunOps,
  battleSetupFor,
  createRun,
  createRunAt,
  enterNode,
  finishReplay,
  startReplay,
  type Difficulty,
  gainXp,
  xpToNext,
  isBattle,
  nextStage,
  rewardOptions,
  type Encounter,
  type RunState,
} from '../engine/run';
import { frameUrl } from '../render/assets';
import { initAudio, playBgm, sfx } from '../render/audio';
import { moodFor, type Mood } from '../render/music';
import { BattleView } from './battle-view';
import { bossLootView, choiceView, levelUpView, rewardView, type LootShown } from './choice-view';
import { claimLoot, rollLoot } from '../engine/economy';
import { shopView } from './shop-view';
import { openDeck } from './deck-view';
import { relicChip } from './items';
import { h } from './dom';
import { initDebug } from './debug';
import { mapView, openPartyGuide, placeName } from './map-view';
import { confirmDialog, openOverlay } from './overlay';
import { sceneView } from './scene-view';
import { applySettings, settingsForm } from './settings';
import { clearRun, lastSlot, listSlots, readCodex, readProfile, recordClear, saveRun, SLOT_COUNT, updateCodex } from './storage';
import { hubView } from './hub-view';
import { loadoutView } from './loadout-view';
import { COMMON, loadoutOwners, setLoadout } from '../engine/collection';
import { codexView, type CodexTab } from './codex-view';
import { noteBattleEnd, noteCard, noteEnemiesSeen, noteItem, noteRun, noteScene, type Codex } from '../engine/codex';

const data = gameData();

/** 저장 칸 한 줄 요약: 장소 · 층 · 하운 레벨 */
function slotSummary(run: RunState): string {
  const stage = data.stages.find((st) => st.id === run.stageId)!;
  const floor = run.map.floors.flat().find((n) => n.id === run.position)?.floor ?? 0;
  const where = run.status === 'stage_clear' ? '보스를 넘음' : floor ? `${floor}층` : '출발 전';
  const haun = run.roster.find((r) => r.id === 'haun');
  const mode = `${run.difficulty === 'hard' ? ' · 어려움' : ''}${run.hardcore ? ' · 하드코어' : ''}`;
  if (run.status === 'complete') return `클리어${mode}${haun ? ` · Lv ${haun.level}` : ''}`;
  return `${run.replayOf ? '다시 하기 — ' : ''}${placeName(stage, run)} · ${where}${haun ? ` · Lv ${haun.level}` : ''}${mode}`;
}

/** 스테이지 끝 화면 머리의 세계 이름 */
const WORLD_LABEL: Record<string, string> = { murim: '武林 · 무림', elheim: '엘하임', nocturna: '마왕성', rift: '세계의 틈' };

export class App {
  private run: RunState | null = null;
  /** 보스를 이긴 뒤 clearEffects 결과(스테이지 끝 화면에 보여 준다) */
  private clearMessages: string[] = [];
  /** 이 런을 브라우저에 저장하는가(샌드박스는 저장하지 않는다) */
  private persist = true;
  /** 지금 런을 저장하는 칸(1~3) */
  private slot = 1;

  constructor(private root: HTMLElement) {
    applySettings();
    initAudio();
    const params = new URLSearchParams(location.search);
    initDebug(params);
    const seed = params.get('seed');
    if (params.has('screen')) this.screen(params.get('screen') || 'reward', params.get('module') ?? undefined, params.get('stage') ?? 's2');
    else if (params.has('sandbox'))
      this.sandbox(seed ?? 'SANDBOX', (params.get('sandbox') || 'elia').split(',').filter(Boolean), params.get('module') ?? undefined);
    else if (seed) this.start(seed, params.has('wang'), params.get('stage') ?? undefined);
    else this.title();
  }

  /**
   * ?sandbox[=kyle,born][&module=s5_boss_vargas] — 지도 없이 바로 전투(하운+동료(기본 엘리아), 융합 카드·왕일검 지원 포함).
   * module이 없으면 그림자늑대 2마리. 모듈에 장면이 있으면 먼저 재생한다. 연출 확인용
   */
  private sandbox(seed: string, mates: string[], moduleId = 's1_battle_shadow_wolves'): void {
    const module = data.modules.get(moduleId);
    if (!module?.content.enemies?.length) throw new Error(`sandbox: 전투 모듈이 아니다: ${moduleId}`);
    const run = createRun(data, seed, { stageId: module.stage, supportActive: true });
    this.persist = false;
    applyRunOps(data, run, [
      ...mates.map((member) => ({ op: 'join_party' as const, member })),
      { op: 'gain_card', card: 'haun_byeogun', count: 2 },
      { op: 'gain_card', card: 'haun_cloud_form' },
    ]);
    this.run = run;
    const node = { id: 'sandbox', floor: 0, index: 0, type: module.type, moduleId, next: [] };
    this.playScene(module.content.scene, () => this.battle({ node, module }), module.content.background);
  }

  /**
   * ?screen=<이름>[&module=<모듈·장면 id>][&stage=s2] — 화면 하나를 바로 띄운다(UI 확인용, 저장 안 함).
   * reward · choice(module: 이벤트·휴식·여관 모듈) · scene(module: 장면 id) · clear · win · lose · deck · levelup · shop · bossloot · hub · codex(module: 탭) · loadout
   */
  private screen(name: string, id: string | undefined, stageId: string): void {
    const run = createRunAt(data, 'SCREEN', stageId, { supportActive: true });
    this.persist = false;
    this.run = run;
    const first = run.map.floors[0][0];
    switch (name) {
      case 'choice': {
        const module = data.modules.get(id ?? '') ?? [...data.modules.values()].find((m) => m.stage === stageId && m.type === 'rest')!;
        return this.show(this.backdrop(choiceView(data, run, module, () => this.map())));
      }
      case 'scene':
        return this.playScene(id ?? [...data.scenes.keys()][0], () => this.map());
      case 'clear':
        run.status = 'stage_clear';
        return this.stageClear();
      case 'win':
      case 'lose':
        return this.end(name === 'win');
      case 'levelup': {
        // 하운이 3레벨(강화 고르기)까지, 동료 한 명도 한 레벨
        gainXp(data, run, 'haun', 2 * (xpToNext(data, run.roster[0].level) ?? 0));
        const mate = run.roster.find((r) => r.id !== 'haun');
        if (mate) gainXp(data, run, mate.id, xpToNext(data, mate.level) ?? 0);
        return this.map();
      }
      case 'deck':
        this.map();
        return this.showCards();
      case 'loadout':
        run.needsLoadout = true;
        return this.loadout();
      case 'shop': {
        const module = data.modules.get(id ?? '') ?? [...data.modules.values()].find((m) => m.stage === stageId && m.type === 'shop');
        if (!module) return this.map();
        run.gold = 300;
        return this.show(this.backdrop(shopView(data, run, module, first.id, () => this.map())));
      }
      case 'hub': {
        // 캠페인을 마친 런의 클리어 지도
        const done = createRunAt(data, 'SCREEN', 's9', { supportActive: true });
        done.status = 'complete';
        done.flags.push('ui:ending_seen');
        done.replays = { s1: 2, s5: 1 };
        this.run = done;
        return this.hub();
      }
      case 'codex':
        return this.codex((id as CodexTab | undefined) ?? 'cards');
      case 'bossloot': {
        const loot = rollLoot(data, run, { ...first, type: 'boss' });
        return this.show(this.backdrop(bossLootView(data, run, { loot, potionLeft: claimLoot(data, run, loot).potionLeft }, () => this.map())));
      }
      default: {
        // 전리품(엘리트: 유물 포함) + 카드 보상. 물약 칸을 채워 두어 바꿔 넣기도 보인다
        run.potions = run.potions.map(() => 'fire_flask');
        const loot = rollLoot(data, run, { ...first, type: 'elite' });
        const shown: LootShown = { loot: { ...loot, potion: loot.potion ?? 'wound_salve' }, potionLeft: null };
        shown.potionLeft = claimLoot(data, run, shown.loot).potionLeft;
        return this.show(this.backdrop(rewardView(data, rewardOptions(data, run, first.id), () => this.map(), { run, shown })));
      }
    }
  }

  /** 도감에 적는다(저장하는 런만: 샌드박스·화면 확인은 적지 않는다) */
  private note(fn: (codex: Codex) => void): void {
    if (this.persist) updateCodex(data, fn);
  }

  /** 도감 화면. 본 장면을 다시 보면 끝나고 같은 탭으로 돌아온다. back: 돌아갈 화면(기본 시작 화면, 지도에서 열면 지도) */
  private codex(tab: CodexTab = 'cards', from?: () => void): void {
    // 시작 화면에서 열면 시작 화면의 곡, 지도에서 열면 그 장소의 곡을 그대로
    if (!from) playBgm('title');
    const back = from ?? (() => this.title());
    this.show(
      codexView(
        data,
        readCodex(data),
        readProfile(),
        {
          onBack: () => back(),
          onPlayScene: (id, tabBack) => {
            const scene = data.scenes.get(id);
            if (scene) this.show(sceneView(data, scene, () => this.codex(tabBack, from), { background: data.stages.find((st) => id.startsWith(`${st.id}_`))?.background }));
          },
        },
        tab,
        from ? this.run?.collection : undefined,
      ),
    );
  }

  private show(el: HTMLElement): void {
    this.root.replaceChildren(el);
    window.scrollTo(0, 0);
  }

  /**
   * 지도 밖 화면(선택지·보상·스테이지 끝·엔딩)의 뒷배경: 지금 스테이지의 전투 배경을 어둡게 깐다(GAME_DESIGN 13절).
   * art로 다른 그림(시작 화면 그림 등)을 줄 수 있고, 실제 그림이 없으면 세계별 색 바탕
   */
  private backdrop(el: HTMLElement, art?: string): HTMLElement {
    const stage = this.run ? data.stages.find((s) => s.id === this.run!.stageId) : undefined;
    const url = frameUrl(art ?? stage?.background, 1, { realOnly: true });
    el.classList.add('backdrop', `world-${stage?.world ?? 'murim'}`);
    if (url) {
      el.classList.add('has-art');
      el.style.setProperty('--backdrop', `url("${url}")`);
    }
    return el;
  }

  /**
   * 시작 화면(GAME_DESIGN 13절): 세계관 그림 한 장 위 가운데에 제목과 메뉴.
   * 메뉴 버튼은 모두 같은 크기(이어하기 · 새로 시작 · 불러오기 · 설정). 저장은 3칸. 시드는 주소의 ?seed=로만(확인용)
   */
  private title(): void {
    const last = lastSlot(data);
    const anySaved = listSlots(data).some((x) => x.saved);
    const url = frameUrl('title_world', 1, { realOnly: true });
    playBgm('title');
    this.show(
      h(
        'section',
        { class: `screen title-screen${url ? ' has-art' : ''}` },
        h('div', { class: 'title-bg', style: url ? `background-image:url("${url}")` : '' }),
        h(
          'div',
          { class: 'title-center' },
          h('h1', {}, '천외귀환'),
          h('div', { class: 'title-sub' }, '天外歸還 · 세계의 틈'),
          h(
            'div',
            { class: 'title-menu' },
            last
              ? h(
                  'button',
                  { class: 'btn btn-primary', title: `저장 ${last.slot} · 시드 ${last.saved.run.seed}`, onclick: () => this.resume(last.saved.run, last.slot) },
                  '이어하기',
                  h('small', {}, `저장 ${last.slot} · ${slotSummary(last.saved.run)}`),
                )
              : null,
            h('button', { class: `btn${last ? '' : ' btn-primary'}`, onclick: () => this.openSlots('new') }, '새로 시작', h('small', {}, '빈 칸이나 고른 칸에서')),
            anySaved ? h('button', { class: 'btn', onclick: () => this.openSlots('load') }, '불러오기', h('small', {}, `저장 ${SLOT_COUNT}칸`)) : null,
            h('button', { class: 'btn', onclick: () => this.codex() }, '도감', h('small', {}, '본 카드 · 적 · 장면')),
            h('button', { class: 'btn', onclick: () => this.openSettings() }, '설정', h('small', {}, '소리 · 속도 · 연출')),
          ),
        ),
        h('p', { class: 'title-foot' }, '장작을 패던 소년이 결을 따라, 두 세계를 가른다.'),
      ),
    );
  }

  /**
   * 새 런의 난이도(2026-10-08): 캠페인을 한 번 마친 뒤에만 고른다. 보통 · 어려움(적 체력·공격력↑), 하드코어(쓰러진 동료는 돌아오지 않는다)는 따로 켠다
   */
  private newRun(slot: number): void {
    const begin = (difficulty: Difficulty, hardcore: boolean) => this.start(randomSeed(), false, undefined, slot, { difficulty, hardcore });
    if (readProfile().clears < 1) return begin('normal', false);
    let difficulty: Difficulty = 'normal';
    const hardcore = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const card = (value: Difficulty, title: string, text: string) =>
      h(
        'label',
        { class: 'diff-card' },
        h('input', { type: 'radio', name: 'difficulty', checked: value === difficulty, onchange: () => (difficulty = value) }),
        h('b', {}, title),
        h('small', {}, text),
      );
    const hard = data.balance.difficulty.hard;
    let started = false;
    const ov = openOverlay(
      '난이도',
      h(
        'div',
        { class: 'diff-pick' },
        h('div', { class: 'diff-cards' }, card('normal', '보통', '처음 마친 그 길 그대로.'), card('hard', '어려움', `적 체력·공격력이 앞 스테이지 ×${hard.byStage.s0?.hp ?? 1}·×${hard.byStage.s0?.dmg ?? 1}에서 끝 ×${hard.byStage.s9?.hp ?? 1}·×${hard.byStage.s9?.dmg ?? 1}까지 오른다. 끝까지 가는 사람이 드물다.`)),
        h('label', { class: 'diff-hardcore' }, hardcore, h('span', {}, h('b', {}, '하드코어'), h('small', {}, '전투가 끝날 때 쓰러져 있던 동료는 다시 일어나지 않는다. 수치는 그대로.'))),
        h('div', { class: 'confirm-actions' }, h('button', { class: 'btn btn-primary', onclick: () => ((started = true), ov.close(), begin(difficulty, hardcore.checked)) }, '시작')),
      ),
      { onClose: () => !started && this.title(), wide: true },
    );
  }

  /** 저장 칸 고르기. new: 그 칸에 새 런(차 있으면 덮어쓰기 확인) / load: 그 칸을 이어하기·지우기 */
  private openSlots(mode: 'new' | 'load'): void {
    const body = h('div', { class: 'slots' });
    // 런을 시작·이어 가며 닫으면 그대로, 그냥 닫으면 시작 화면을 다시 그린다(지운 칸 반영)
    let leaving = false;
    const ov = openOverlay(mode === 'new' ? '새로 시작 — 저장할 칸' : '불러오기', body, { onClose: () => !leaving && this.title() });
    const go = (fn: () => void) => {
      leaving = true;
      ov.close();
      fn();
    };
    const render = () => {
      body.replaceChildren(
        ...listSlots(data).map(({ slot, saved }) => {
          const run = saved?.run;
          const info = run
            ? h('div', { class: 'slot-info' }, h('b', {}, slotSummary(run)), h('small', {}, `${new Date(saved!.savedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · 덱 ${run.deck.length}장 · 상흔 ${run.scar}`))
            : h('div', { class: 'slot-info empty' }, h('b', {}, '빈 칸'));
          const actions =
            mode === 'new'
              ? [
                  h(
                    'button',
                    {
                      class: `btn btn-small${run ? ' btn-danger' : ' btn-primary'}`,
                      onclick: async () => {
                        if (run && !(await confirmDialog('새로 시작', `저장 ${slot}의 런을 지우고 새 런을 시작합니다.`, '덮어쓰기'))) return;
                        go(() => {
                          clearRun(slot);
                          this.newRun(slot);
                        });
                      },
                    },
                    run ? '덮어쓰고 시작' : '여기서 시작',
                  ),
                ]
              : run
                ? [
                    h('button', { class: 'btn btn-small btn-primary', onclick: () => go(() => this.resume(run, slot)) }, '이어하기'),
                    h(
                      'button',
                      {
                        class: 'btn btn-small',
                        onclick: async () => {
                          if (!(await confirmDialog('저장 지우기', `저장 ${slot}을(를) 지웁니다. 되돌릴 수 없습니다.`, '지우기'))) return;
                          clearRun(slot);
                          render();
                        },
                      },
                      '지우기',
                    ),
                  ]
                : [];
          return h('div', { class: `slot${run ? '' : ' is-empty'}` }, h('span', { class: 'slot-no' }, String(slot)), info, h('div', { class: 'slot-actions' }, ...actions));
        }),
      );
    };
    render();
  }

  private resume(run: RunState, slot: number): void {
    this.run = run;
    this.slot = slot;
    this.persist = true;
    this.map();
  }

  private openSettings(): void {
    openOverlay('설정', settingsForm());
  }

  /** stageId(?stage=s2): 앞 스테이지를 건너뛰고 시작(확인용, createRunAt) */
  private start(seed: string, support: boolean, stageId?: string, slot = this.slot, mode: { difficulty?: Difficulty; hardcore?: boolean } = {}): void {
    this.slot = slot;
    this.run = stageId
      ? createRunAt(data, seed, stageId, { supportActive: support, ...mode })
      : createRun(data, seed, { supportActive: support, ...mode });
    this.persist = true;
    this.note((c) => (c.stats.runs += 1));
    // 주소창의 ?seed=…(디버그 시작)를 지운다: 새로고침하면 타이틀의 "이어하기"로 돌아온다
    if (location.search) history.replaceState(null, '', location.pathname);
    this.map();
  }

  private map(): void {
    const run = this.run!;
    // 자동 저장: 지도(또는 스테이지 끝)에 설 때마다. 노드에 들어간 뒤 새로고침하면 그 노드 직전 지도에서 이어진다
    if (this.persist) {
      // 마친 런(complete)도 남긴다(스테이지 다시 하기). 다시 하다 지면 클리어한 런으로 되돌려 저장
      if (run.status === 'map' || run.status === 'stage_clear' || run.status === 'complete') saveRun(this.slot, run);
      else if (run.replayOf) saveRun(this.slot, run.replayOf);
      else clearRun(this.slot);
    }
    this.note((c) => noteRun(c, run));
    // 레벨업 소식·고를 강화가 남았으면 먼저(전투 뒤 지도로 가기 전, 보스 뒤에는 스테이지 끝 화면 전에)
    if (run.levelLog.length || run.pendingUpgrades.length) {
      if (run.levelLog.length) sfx('levelup');
      return this.show(this.backdrop(levelUpView(data, run, () => this.map())));
    }
    // 스테이지를 시작하기 전 편성(GAME_DESIGN 9-1): 다 채워야 출발한다
    if (run.status === 'map' && run.needsLoadout) return this.loadout();
    if (run.status === 'stage_clear') {
      // 보스의 끝 장면(outroScene) → 스테이지 끝 화면
      const stage = data.stages.find((s) => s.id === run.stageId)!;
      const outroScene = data.modules.get(stage.boss ?? '')?.content.outroScene;
      return this.playScene(outroScene, () => this.stageClear());
    }
    if (run.status === 'complete') {
      // 이미 엔딩을 본 런: 클리어 지도(스테이지 다시 하기)
      if (run.flags.includes('ui:ending_seen')) return this.hub();
      // 캠페인의 끝: 에필로그 장면 → 엔딩 화면. 기록(난이도 열림)은 한 번만
      run.flags.push('ui:ending_seen');
      if (this.persist) {
        recordClear(run);
        saveRun(this.slot, run);
      }
      const last = data.stages.find((s) => s.id === run.stageId)!;
      return this.playScene(last.endingScene, () => this.end(true), undefined, 'ending');
    }
    if (run.status === 'defeat') return this.end(false);
    playBgm(moodFor(data.stages.find((s) => s.id === run.stageId)?.world));
    // 출전 편성 안내: 동료가 처음 합류했을 때, 자리가 처음 가득 찼을 때 한 번씩(런 플래그로 기억)
    const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').length;
    const guide = (flag: string, when: boolean) => when && !run.flags.includes(flag) && (run.flags.push(flag), true);
    const firstMate = guide('ui:party_guide', fighters >= 2);
    const overFull = guide('ui:party_full', fighters > data.balance.party.max);
    this.show(
      mapView(data, run, {
        onEnter: (node) => this.enter(node),
        onToggleSupport: (on) => {
          run.supportActive = on;
          this.map();
        },
        onRefresh: () => this.map(),
        onShowDeck: () => this.showCards(),
        onSettings: () => this.openSettings(),
        onCodex: () => this.codex('cards', () => this.map()),
        onTitle: () => this.title(),
        highlightParty: firstMate || overFull,
      }),
    );
    if (firstMate || overFull) openPartyGuide(data, run);
  }

  private enter(node: MapNode): void {
    const run = this.run!;
    const enc = enterNode(data, run, node.id);
    const go = () => {
      if (isBattle(enc)) this.battle(enc);
      else if (enc.module.type === 'shop') this.show(this.backdrop(shopView(data, run, enc.module, enc.node.id, () => this.map()), enc.module.content.background));
      else {
        const showChoice = (): void =>
          this.show(
            this.backdrop(
              choiceView(data, run, enc.module, () => this.map(), enc.module.type === 'inn' ? { onEditLoadout: () => this.loadout(showChoice) } : {}),
              enc.module.content.background,
            ),
          );
        showChoice();
      }
    };
    // 장면이 있는 노드는 비주얼 노벨 장면을 먼저 재생한다
    this.playScene(enc.module.content.scene, go, enc.module.content.background);
  }

  /** 장면 id가 있으면 재생하고 끝나면 then, 없으면 바로 then. 배경은 background(모듈 배경) → 지금 스테이지의 전투 배경 */
  private playScene(id: string | undefined, then: () => void, background?: string, mood?: Mood): void {
    const scene = id ? data.scenes.get(id) : undefined;
    if (!scene) return then();
    this.note((c) => noteScene(data, c, scene.id));
    const stage = this.run ? data.stages.find((s) => s.id === this.run!.stageId) : undefined;
    playBgm(mood ?? moodFor(scene.world ?? stage?.world));
    this.show(sceneView(data, scene, then, { background: background ?? stage?.background, flags: this.run?.flags }));
  }

  private battle(enc: Encounter): void {
    const run = this.run!;
    const setup = battleSetupFor(data, run, enc);
    const state = createBattle(data, setup);
    this.note((c) => noteEnemiesSeen(c, state.enemies.map((e) => e.defId)));
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    playBgm(moodFor(stage.world, enc.module.type === 'boss' ? 'boss' : 'battle'));
    const bonus = bonusActive(run, enc.module) ? enc.module.content.bonus?.text : undefined;
    const view = new BattleView(
      data,
      state,
      {
        title: enc.module.name,
        subtitle: `${placeName(stage, run)} · ${enc.node.floor}층`,
        seed: run.seed,
        scar: run.scar,
        supportActive: run.supportActive,
        bonusText: bonus,
        introText: enc.module.content.text,
        background: enc.module.content.background ?? stage.background,
        onQuit: (abandon) => {
          if (abandon && this.persist) clearRun(this.slot);
          this.title();
        },
      },
      (final) => {
        const outcome = battleOutcome(final)!;
        // 전투가 끝나면 장소의 곡으로(지면 엔딩 화면이 멈춘다)
        playBgm(outcome.result === 'victory' ? moodFor(stage.world) : null);
        this.note((c) => noteBattleEnd(c, final.enemies.map((e) => e.defId), outcome.result === 'victory', final.tally?.moves));
        this.clearMessages = applyBattleOutcome(data, run, enc, outcome);
        if (run.status === 'defeat') return this.map();
        // 전리품: 골드·엘리트 유물·물약은 바로 받고, 칸이 가득한 물약·보스 유물은 화면에서 고른다
        const loot = rollLoot(data, run, enc.node);
        const shown: LootShown = { loot, potionLeft: claimLoot(data, run, loot).potionLeft, notes: run.status === 'map' ? this.clearMessages : [] };
        this.note((c) => noteItem(noteRun(c, run), 'potions', loot.potion));
        if (run.status !== 'map') return this.show(this.backdrop(bossLootView(data, run, shown, () => this.map()), enc.module.content.background));
        // 일반·엘리트 전투의 끝 장면(원작의 그 전투 뒷이야기) → 보상
        this.playScene(
          enc.module.content.outroScene,
          () =>
            this.show(
              this.backdrop(
                rewardView(
                  data,
                  this.rewardSeen(rewardOptions(data, run, enc.node.id)),
                  (cardId) => {
                    if (cardId) addCard(data, run, cardId);
                    this.map();
                  },
                  { run, shown },
                ),
                enc.module.content.background,
              ),
            ),
          enc.module.content.background,
        );
      },
    );
    this.show(view.root);
  }

  /** 보유 카드 보기: 이번 스테이지 덱 + 주인별 보유 카드(강화 단계 그대로) */
  private showCards(): void {
    const run = this.run!;
    const owned = (owner: string) =>
      Object.entries(run.collection)
        .filter(([id]) => {
          const d = data.cards.get(id);
          return d && (data.characters.has(d.owner) ? d.owner : COMMON) === owner;
        })
        .map(([cardId, level]) => ({ uid: `own_${cardId}`, cardId, level }));
    const name = (o: string) => (o === COMMON ? '공용' : (data.characters.get(o)?.name ?? o));
    openDeck(data, `보유 카드 ${Object.keys(run.collection).length}장`, [
      { label: '이번 스테이지 덱', cards: run.deck },
      ...loadoutOwners(data, run).map((o) => ({ label: `보유 — ${name(o)}`, cards: owned(o) })),
    ]);
  }

  /** 편성 화면. inn: 여관에서 바꾸기(돌아갈 곳) */
  private loadout(inn?: () => void): void {
    const run = this.run!;
    const stage = data.stages.find((st) => st.id === run.stageId)!;
    this.show(
      this.backdrop(
        loadoutView(data, run, inn ? `${placeName(stage, run)} — 여관에서 편성 바꾸기` : `${placeName(stage, run)} — 출발 전`, {
          onConfirm: (lo) => {
            setLoadout(data, run, lo);
            if (this.persist) saveRun(this.slot, run);
            if (inn) inn();
            else this.map();
          },
          onCancel: inn,
          onShowCollection: () => this.showCards(),
        }),
      ),
    );
  }

  /** 보상으로 본 카드도 도감에 */
  private rewardSeen(options: string[]): string[] {
    this.note((c) => options.forEach((id) => noteCard(c, id)));
    return options;
  }

  /** 클리어 지도: 마친 런의 여정 띠에서 스테이지를 골라 마지막 파티로 다시 한다(GAME_DESIGN 2절) */
  private hub(): void {
    const run = this.run!;
    playBgm('title');
    this.show(
      hubView(data, run, {
        onReplay: async (stageId) => {
          const st = data.stages.find((s) => s.id === stageId)!;
          if (!(await confirmDialog(`${placeName(st, run)} 다시 하기`, '마지막에 클리어한 파티·덱·유물로 이 스테이지를 처음부터 다시 한다. 결과는 이 저장에 남지 않고 이긴 횟수만 남는다.', '다시 하기'))) return;
          this.run = startReplay(data, run, stageId);
          this.map();
        },
        onShowDeck: () => this.showCards(),
        onCodex: () => this.codex('cards', () => this.hub()),
        onTitle: () => this.title(),
      }),
    );
  }

  /** 보스를 넘은 뒤: 보스 모듈의 장면 글(outro)을 보여 주고 다음 스테이지로 */
  private stageClear(): void {
    const run = this.run!;
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    const boss = data.modules.get(stage.boss ?? '');
    // 끝 장면을 이미 보여 줬으면 장면 글은 생략
    const outro = boss?.content.outroScene ? undefined : boss?.content.outro;
    const next = nextStage(data, run);
    this.show(
      this.backdrop(
        h(
          'section',
          { class: 'screen end-screen stage-clear win' },
          h(
            'div',
            { class: 'end-box' },
            // 책 권·장 표시는 쓰지 않는다(2026-10-08 사용자 결정). 세계 이름만
            h('div', { class: 'end-kicker' }, WORLD_LABEL[stage.world] ?? ''),
            h('h1', {}, stage.name),
            h('div', { class: 'end-sub' }, '— 끝 —'),
            outro ? h('p', { class: 'outro' }, outro) : null,
            this.clearMessages.length ? h('ul', { class: 'gains clear-gains' }, ...this.clearMessages.map((m) => h('li', {}, m))) : null,
            run.scar > 0
              ? h(
                  'p',
                  { class: 'scar-reveal' },
                  // '하늘의 금'을 보기 전에는 그 말을 쓰지 않는다(GAME_DESIGN 14절)
                  run.flags.includes('sky_crack') ? `지금까지 쌓인 상흔 ${run.scar} — 하늘의 금이 그만큼 벌어졌다.` : `엉킨 흐름이 남긴 상흔 ${run.scar}.`,
                )
              : null,
            h(
              'button',
              {
                class: 'btn btn-primary btn-large',
                onclick: () => {
                  this.clearMessages = [];
                  // 다시 하기는 이 스테이지만: 클리어 지도로 돌아간다
                  if (run.replayOf) this.run = finishReplay(run);
                  else advanceStage(data, run);
                  this.map();
                },
              },
              run.replayOf ? '클리어 지도로' : next ? '계속' : stage.endingScene ? '에필로그' : '마치기',
            ),
          ),
        ),
      ),
    );
  }

  /** 결과 화면 통계: 전투·턴·처치·피해·치명타·균열 폭주, 많이 쓴 카드 5장, 패배 원인, 마지막 파티·유물·덱 */
  private runStats(run: RunState, win: boolean): HTMLElement {
    const st = run.stats;
    const top = Object.entries(st?.cards ?? {})
      .filter(([id]) => data.cards.get(id)?.type !== 'status')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const cell = (label: string, value: string | number) => h('div', { class: 'rs-cell' }, h('b', {}, String(value)), h('small', {}, label));
    return h(
      'div',
      { class: 'run-stats panel' },
      h(
        'div',
        { class: 'rs-grid' },
        cell('전투', st?.battles ?? 0),
        cell('턴', st?.turns ?? 0),
        cell('처치', st?.kills ?? 0),
        cell('준 피해', (st?.damage ?? 0).toLocaleString('ko-KR')),
        cell('치명타', st?.crits ?? 0),
        cell('균열 폭주', st?.surges ?? 0),
      ),
      !win && st?.deathCause ? h('p', { class: 'rs-death' }, `쓰러진 곳: ${st.deathCause}`) : null,
      top.length
        ? h(
            'div',
            { class: 'rs-top' },
            h('h3', {}, '많이 쓴 카드'),
            h('ol', {}, top.map(([id, n]) => h('li', {}, h('span', {}, data.cards.get(id)?.name ?? id), h('small', {}, `${n}번`)))),
          )
        : null,
      h(
        'div',
        { class: 'rs-party' },
        run.roster.map((r) => h('span', { class: 'chip' }, `${data.characters.get(r.id)?.name ?? r.id} Lv${r.level}`)),
        run.relics.length ? h('span', { class: 'rs-relics' }, run.relics.map((id) => relicChip(data, id))) : null,
        h('button', { class: 'btn btn-small', onclick: () => openDeck(data, '마지막 덱', [{ label: `덱 ${run.deck.length}장`, cards: run.deck }]) }, '마지막 덱 보기'),
      ),
    );
  }

  private end(win: boolean): void {
    const run = this.run!;
    const last = data.stages.find((s) => s.id === run.stageId)!;
    // 엔딩 장면이 있는 스테이지까지 왔으면 이야기의 끝, 아니면 지금 만들어진 범위의 끝
    const finale = win && !!last.endingScene;
    playBgm(finale ? 'ending' : win ? 'title' : null);
    this.show(
      this.backdrop(
        h(
          'section',
          { class: `screen end-screen ${win ? 'win' : 'lose'}${finale ? ' finale' : ''}` },
          h(
            'div',
            { class: 'end-box' },
            h('h1', {}, finale ? '천외귀환' : win ? `${last.name}까지` : '여기까지'),
            finale ? h('p', { class: 'end-sub' }, '天外歸還 — 세계의 틈 · 완') : null,
            h(
              'p',
              { class: 'outro' },
              finale
                ? '세계의 틈이 닫혔다. 천마봉 위에는 바느질 자국처럼 가지런한 흉터, 청운봉선(靑雲縫線)이 남았다.'
                : win
                  ? '지금 만들어진 이야기는 여기까지다. 다음 이야기는 이후 작업.'
                  : '하운이 쓰러졌다.',
            ),
            h('p', { class: 'hint' }, `시드 ${run.seed} · 상흔 ${run.scar} · 덱 ${run.deck.length}장${run.difficulty === 'hard' ? ' · 어려움' : ''}${run.hardcore ? ' · 하드코어' : ''}`),
            this.runStats(run, win),
            finale && readProfile().clears === 1 && this.persist ? h('p', { class: 'end-unlock' }, '새 런에서 난이도(어려움)와 하드코어를 고를 수 있게 되었다.') : null,
            h(
              'div',
              { class: 'end-actions' },
              // 마친 런·다시 하던 런은 클리어 지도로(스테이지 다시 하기), 그 밖에는 새 런
              finale || run.replayOf
                ? h(
                    'button',
                    {
                      class: 'btn btn-primary btn-large',
                      onclick: () => {
                        if (run.replayOf) this.run = finishReplay(run);
                        this.map();
                      },
                    },
                    '클리어 지도',
                  )
                : null,
              h('button', { class: `btn btn-large${finale || run.replayOf ? '' : ' btn-primary'}`, onclick: () => this.title() }, finale || run.replayOf ? '타이틀로' : '새 런'),
              // 같은 시드로 처음부터(같은 지도·같은 보상), 다른 사람에게 줄 시드 복사
              !run.replayOf
                ? h(
                    'button',
                    { class: 'btn btn-large', onclick: () => this.start(run.seed, run.supportActive, undefined, this.slot, { difficulty: run.difficulty, hardcore: run.hardcore }) },
                    '같은 시드로 다시',
                  )
                : null,
              h(
                'button',
                {
                  class: 'btn btn-large',
                  onclick: (e: Event) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    const done = () => (btn.textContent = `복사됨: ${run.seed}`);
                    navigator.clipboard?.writeText(run.seed).then(done, () => (btn.textContent = `시드: ${run.seed}`)) ?? (btn.textContent = `시드: ${run.seed}`);
                  },
                },
                '시드 복사',
              ),
            ),
          ),
        ),
        // 이야기의 끝은 시작 화면의 세계관 그림 위에서
        finale ? 'title_world' : undefined,
      ),
    );
  }
}
