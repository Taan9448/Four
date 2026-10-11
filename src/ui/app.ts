// 화면 흐름: 타이틀 → 지도 → (스토리/이벤트/휴식/여관 | 전투 → 보상) → 지도 … → 스테이지 클리어 / 패배
import { checkForUpdate } from './update-check';
import { logRun } from './run-log';
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
  splitMapBySurge,
  enterNode,
  discardSuspended,
  finishReplay,
  restoreParty,
  startReplay,
  stageGainsSummary,
  markStageStart,
  suspendReplay,
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
import { toast } from '../render/fx';
import { moodFor, type Mood } from '../render/music';
import { BattleView } from './battle-view';
import { bossLootView, choiceView, levelUpView, pilgrimRewardView, rewardView, type LootShown } from './choice-view';
import { claimLoot, openShop, rollLoot } from '../engine/economy';
import { shopView } from './shop-view';
import { openDeck } from './deck-view';
import { relicChip } from './items';
import { h } from './dom';
import { initDebug } from './debug';
import { mapView, openPartyGuide, pilgrimLabel, placeName } from './map-view';
import { confirmDialog, openOverlay } from './overlay';
import { installTooltips, tipAttrs } from './tooltip';
import { sceneView } from './scene-view';
import { applySettings, settingsForm } from './settings';
import { titleStage } from './title-fx';
import { runTour, tourSeen } from './tour';
import { iconEl } from './icons';
import { loadPortrait } from '../render/portrait';
import { challengeUnlockName, claimPilgrimReward, pilgrimRewardDue, pilgrimRewardOptions, settleChallenges } from '../engine/pilgrimage';
import {
  campaignCollection,
  clearAbyss,
  clearRun,
  lastSlot,
  listSlots,
  loadAbyss,
  readCodex,
  readProfile,
  readAbyssMeta,
  recordAbyss,
  recordChallenges,
  slotTitle,
  recordClear,
  saveAbyss,
  writeAbyssMeta,
  saveRun,
  SLOT_COUNT,
  updateCodex,
} from './storage';
import {
  abyssPaths,
  abyssPool,
  abyssScore,
  createAbyssRun,
  dailyPlan,
  dailySeed,
  loopLabel,
  nemesisEvery,
  oathMax,
  oathMods,
  oathScoreMul,
  pathOffer,
  pathPicks,
  poolByOwner,
  riftCards,
  unlockedPaths,
  unlockedRift,
  planLoop,
  unlockName,
  updateAbyssMeta,
  WORLD_NAME,
} from '../engine/abyss';
import { hubView, placeDialog } from './hub-view';
import { loadoutView } from './loadout-view';
import { COMMON, loadoutOwners, setLoadout } from '../engine/collection';
import { codexView, type CodexTab } from './codex-view';
import { codexCards, noteAffixes, noteBattleEnd, noteCard, noteEnemiesSeen, noteItem, noteRun, noteScene, recordsCards, type Codex } from '../engine/codex';

const data = gameData();

/** 저장 칸 한 줄 요약: 장소 · 층 · 하운 레벨 */
function slotSummary(run: RunState): string {
  const stage = data.stages.find((st) => st.id === run.stageId)!;
  const floor = run.map.floors.flat().find((n) => n.id === run.position)?.floor ?? 0;
  const where = run.status === 'stage_clear' ? '보스를 넘음' : floor ? `${floor}층` : '출발 전';
  const haun = run.roster.find((r) => r.id === 'haun');
  const mode = `${run.difficulty === 'hard' ? ' · 어려움' : ''}${run.hardcore ? ' · 하드코어' : ''}`;
  // 마친 런(클리어 지도·순례 길)은 끝에 대표 칭호(순례 도전, 도감 '기록'에서 바꾼다)
  const tail = slotTitle(run);
  if (run.status === 'complete') return `클리어${mode}${haun ? ` · Lv ${haun.level}` : ''}${tail}`;
  return `${run.replayOf ? '순례 — ' : ''}${placeName(stage, run)} · ${where}${haun ? ` · Lv ${haun.level}` : ''}${mode}${tail}`;
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
    else if (params.has('abyss')) this.openAbyss(params.get('abyss') || randomSeed());
    else if (seed) this.start(seed, params.has('wang'), params.get('stage') ?? undefined);
    else this.title();
  }

  /**
   * ?abyss[=시드] — 심연 시작 화면을 바로(스토리를 마치지 않아도, 확인용).
   * ?sandbox[=kyle,born][&module=s5_boss_vargas] — 지도 없이 바로 전투(하운+동료(기본 엘리아), 융합 카드·왕일검 지원 포함).
   * module이 없으면 그림자늑대 2마리. 모듈에 장면이 있으면 먼저 재생한다. 연출 확인용. &pilgrim이면 순례 길로(일행 보정)
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
      // 유물 칸이 보이게 둘(전투 화면 확인용)
      { op: 'gain_relic', relic: 'woodcutter_whetstone' },
      { op: 'gain_relic', relic: 'cloud_tea' },
    ]);
    this.run = run;
    // &pilgrim: 클리어한 런에서 이 스테이지를 다시 걷는 길(순례)로 — 일행 보정이 걸린다
    if (new URLSearchParams(location.search).has('pilgrim')) {
      const hub = createRunAt(data, seed, 's9', { supportActive: true });
      hub.status = 'complete';
      this.run = startReplay(data, hub, module.stage);
    }
    const node = { id: 'sandbox', floor: 0, index: 0, type: module.type, moduleId, next: [] };
    this.playScene(module.content.scene, () => this.battle({ node, module }), module.content.background);
  }

  /**
   * ?screen=<이름>[&module=<모듈·장면 id>][&stage=s2] — 화면 하나를 바로 띄운다(UI 확인용, 저장 안 함).
   * reward · choice(module: 이벤트·휴식·여관 모듈) · scene(module: 장면 id) · clear · win · lose · deck · levelup · shop · bossloot · hub · codex(module: 탭) · loadout · pilgrim(순례의 보상)
   * &pilgrim을 붙이면 클리어한 런에서 그 스테이지를 다시 걷는 길(순례)로
   */
  private screen(name: string, id: string | undefined, stageId: string): void {
    this.persist = false;
    // ?screen=surgeguide — 첫 폭주 안내 창(GAME_DESIGN 7절)
    if (name === 'surgeguide') {
      this.title();
      void import('./battle-view').then(({ openSurgeGuide }) => openSurgeGuide(data));
      return;
    }
    if (name.startsWith('abyss')) {
      // 심연 화면 확인: abyssclear(굽이를 넘음) · abyssend(멈춤) · abyssshop(상점) · abyssrest(휴식)
      const seed = 'SCREEN';
      const ar = createAbyssRun(data, seed, { mates: ['elia', 'kyle'], paths: pathOffer(data, seed).slice(0, 1), pool: this.abyssPoolNow() });
      ar.abyss!.revealed = [...data.cards.keys()].slice(0, 2);
      this.run = ar;
      if (name === 'abyssclear') {
        ar.status = 'stage_clear';
        return this.abyssLoopClear();
      }
      if (name === 'abyssend') {
        ar.status = 'defeat';
        return this.abyssEnd();
      }
      if (name === 'abyssshop') {
        ar.gold = 300;
        const shop = data.modules.get('abyss_shop')!;
        return this.show(this.backdrop(shopView(data, ar, shop, ar.map.floors[0][0].id, () => this.map())));
      }
      const mod = data.modules.get(id ?? '') ?? [...data.modules.values()].find((m) => m.stage === ar.stageId && m.type === 'rest')!;
      return this.show(this.backdrop(choiceView(data, ar, mod, () => this.map())));
    }
    let run = createRunAt(data, 'SCREEN', stageId, { supportActive: true });
    // &pilgrim: 클리어한 런에서 이 스테이지를 다시 걷는 길(순례)로 띄운다
    if (new URLSearchParams(location.search).has('pilgrim')) {
      const hub = createRunAt(data, 'SCREEN', 's9', { supportActive: true });
      hub.status = 'complete';
      run = startReplay(data, hub, stageId);
    }
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
        // 끝 화면의 '얻은 것'이 보이게: 이번 스테이지에 카드 2장·유물 1개·레벨업·상흔 +2
        markStageStart(run);
        run.stageGains.push(...rewardOptions(data, run, first.id).slice(0, 2));
        run.relics.push([...data.relics.values()].find((r) => r.rarity === 'common' && !run.relics.includes(r.id))!.id);
        run.roster[0].level += 1;
        run.scar += 2;
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
        // 보유 맥락 표가 보이게: 진열 첫 카드는 보유 +2
        const shelf = openShop(data, run, first.id).cards[0];
        if (shelf) run.collection[shelf.cardId] = 2;
        return this.show(this.backdrop(shopView(data, run, module, first.id, () => this.map())));
      }
      case 'hub': {
        // 캠페인을 마친 런의 클리어 지도
        const done = createRunAt(data, 'SCREEN', 's9', { supportActive: true });
        done.status = 'complete';
        done.flags.push('ui:ending_seen');
        done.replays = { s1: 2, s5: 1 };
        // 순례 표식이 보이게: 첫 보상 받은 곳(금빛 점)·이룬 도전(n/3)
        done.pilgrimRewarded = { s1: true, s5: true };
        done.challenges = { s1: ['s1_branch', 's1_no_one_falls'], s5: ['s5_wedge_first'] };
        this.run = done;
        return this.hub();
      }
      case 'codex':
        return this.codex((id as CodexTab | undefined) ?? 'cards');
      case 'pilgrim': {
        // 순례의 보상(클리어한 런에서 이 스테이지를 처음 다시 넘겼을 때)
        const hub = createRunAt(data, 'SCREEN', 's9', { supportActive: true });
        hub.status = 'complete';
        return this.show(this.backdrop(pilgrimRewardView(data, hub, pilgrimRewardOptions(data, hub, stageId), () => this.title())));
      }
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
        // 보유 맥락 표가 셋 다 보이게: 둘째 후보는 보유 +1, 셋째는 최대 강화
        const options = rewardOptions(data, run, first.id);
        if (options[1] && !run.replayOf) run.collection[options[1]] = 1;
        if (options[2] && !run.replayOf) run.collection[options[2]] = data.balance.upgrade.maxLevel;
        return this.show(this.backdrop(rewardView(data, options, () => this.map(), { run, shown })));
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
        // 카드 칸의 실물(보유): 캠페인 지도에서 열면 지금 저장, 그 밖(시작 화면·심연)은 이 브라우저의 모든 저장 칸
        from && this.run && !this.run.abyss ? this.run.collection : campaignCollection(data),
        readAbyssMeta(data),
      ),
    );
  }

  private show(el: HTMLElement): void {
    this.root.replaceChildren(el);
    window.scrollTo(0, 0);
    // 화면이 바뀐 뒤 띄울 알림(자유 여정: 멈춰 두었다·동료가 돌아왔다)
    if (this.notices.length) {
      const box = h('div', { class: 'toasts' });
      el.appendChild(box);
      for (const text of this.notices.splice(0)) toast(box, text, 'support', 2600);
    }
  }

  /** 다음 화면에 띄울 알림 */
  private notices: string[] = [];

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
    installTooltips();
    const last = lastSlot(data);
    const anySaved = listSlots(data).some((x) => x.saved);
    const abyssSaved = loadAbyss(data);
    const url = frameUrl('title_world', 1, { realOnly: true });
    playBgm('title');
    this.show(
      h(
        'section',
        { class: `screen title-screen${url ? ' has-art' : ''}` },
        // 그림이 있으면 그 위에 움직임 층(하늘의 금·불티·운해·꽃잎·마나 알갱이·달무리·느린 확대, 2026-10-11)
        h('div', { class: 'title-bg' }, url ? titleStage(url) : null),
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
            // 심연(GAME_DESIGN 16절): 스토리를 한 번 마친 뒤 열린다
            readProfile().clears >= 1 || abyssSaved
              ? h(
                  'button',
                  { class: 'btn btn-abyss', onclick: () => (abyssSaved ? this.resumeAbyss(abyssSaved.run) : this.openAbyss()) },
                  abyssSaved ? '심연 — 이어하기' : '심연',
                  h('small', {}, abyssSaved ? loopLabel(abyssSaved.run.abyss!) : `바늘구멍만 한 문 너머${readProfile().abyssBestDepth ? ` · 최고 ${readProfile().abyssBestDepth}굽이` : ''}`),
                )
              : null,
          ),
        ),
        // 도감·설정은 오른쪽 아래 둥근 표식으로(2026-10-11 사용자 요청: 가운데 메뉴는 이어하기·새로 시작·불러오기·심연만)
        h(
          'div',
          { class: 'title-corner' },
          h('button', { class: 'medal title-medal', 'aria-label': '도감', ...tipAttrs('도감', '본 카드 · 적 · 장면 · 기록'), onclick: () => this.codex() }, h('b', {}, '錄'), h('span', {}, '도감')),
          h('button', { class: 'medal title-medal', 'aria-label': '설정', ...tipAttrs('설정', '소리 · 속도 · 연출'), onclick: () => this.openSettings() }, h('b', {}, '設'), h('span', {}, '설정')),
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
    // ?seed=…&surge=N(확인용): 시작 지도에 폭주 N번의 흔적(끊긴 길·裂 틈새)과 상흔 3N
    const surge = Number(new URLSearchParams(location.search).get('surge') ?? 0);
    if (surge > 0) {
      splitMapBySurge(data, this.run, surge, 'debug');
      this.run.scar += surge * data.balance.rift.surgeScar;
    }
    // 주소창의 ?seed=…(디버그 시작)를 지운다: 새로고침하면 타이틀의 "이어하기"로 돌아온다
    if (location.search) history.replaceState(null, '', location.pathname);
    this.map();
  }

  private map(): void {
    const run = this.run!;
    void checkForUpdate();
    // 자동 저장: 지도(또는 스테이지 끝)에 설 때마다. 노드에 들어간 뒤 새로고침하면 그 노드 직전 지도에서 이어진다
    if (this.persist && run.abyss) {
      // 심연: 따로 1칸. 쓰러지면 지운다
      if (run.status === 'defeat') clearAbyss();
      else saveAbyss(run);
    } else if (this.persist) {
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
    if (run.abyss && run.status === 'stage_clear') return this.abyssLoopClear();
    if (run.abyss && run.status === 'defeat') return this.abyssEnd();
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
    playBgm(moodFor(run.abyss?.world ?? data.stages.find((s) => s.id === run.stageId)?.world));
    // 출전 편성 안내: 동료가 처음 합류했을 때, 자리가 처음 가득 찼을 때 한 번씩(런 플래그로 기억)
    const fighters = run.roster.filter((r) => data.characters.get(r.id)?.role === 'fighter').length;
    const guide = (flag: string, when: boolean) => when && !run.flags.includes(flag) && (run.flags.push(flag), true);
    const firstMate = !run.abyss && guide('ui:party_guide', fighters >= 2);
    const overFull = !run.abyss && guide('ui:party_full', fighters > data.balance.party.max);
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
        // 자유 여정(다시 하는 중): 이 스테이지를 멈춰 두고 전체 지도로 / 다른 장소로
        onWorldMap: run.replayOf ? () => this.toWorld() : undefined,
        onSwitchStage: run.replayOf ? (stageId) => this.toWorld(stageId) : undefined,
      }),
    );
    if (firstMate || overFull) openPartyGuide(data, run);
    else this.riftNotices(run);
  }

  /**
   * 균열·폭주를 이야기 뒤에 짚는 한 번짜리 안내(GAME_DESIGN 7절): 첫눈의 개울가 뒤 '균열', 경계의 금 뒤 '상흔',
   * 폭주가 처음 지도를 가른 뒤 끊긴 길과 裂 틈새. 브라우저마다 한 번(설정의 '안내 다시 보기'로 다시)
   */
  private riftNotices(run: RunState): void {
    const sc = data.balance.rift.scar;
    if (run.usedModules.includes('s1_story_first_snow') && !tourSeen('notice-rift'))
      return runTour([{ title: '균열', text: `융합 카드(내공과 마나를 함께 쓰는 카드)를 쓰면 하늘에 금이 간다. 전투의 균열이 ${data.balance.rift.max}이 되면 터진다 — 폭주.` }], { id: 'notice-rift' });
    if (run.flags.includes('rift_known') && !tourSeen('notice-scar'))
      return runTour([{ title: '상흔', text: `전투가 끝날 때 남은 균열과 폭주가 상흔으로 남는다. 전투 시작 균열 = 상흔 ÷ ${sc.startRiftPer}(최대 ${sc.startRiftMax}). 휴식의 꿰매기, 폭주 없이 넘긴 보스, 裂 틈새로 덜어 낸다.` }], { id: 'notice-scar' });
    if (run.map.cuts?.length && !tourSeen('notice-surge-map'))
      return runTour(
        [
          { target: '.map-lines', title: '길이 끊겼다', text: '폭주가 지도를 갈랐다. 검은 금이 그어진 길로는 더 갈 수 없다.' },
          { target: '.node-crack', title: '裂 틈새', text: '폭주가 연 자리. 들어가면 상흔을 덜 수 있다 — 틈의 짐승을 이기거나, 틈새의 거래에서.' },
        ],
        { id: 'notice-surge-map' },
      );
  }

  private enter(node: MapNode): void {
    const run = this.run!;
    const enc = enterNode(data, run, node.id);
    const go = () => {
      if (isBattle(enc)) this.battle(enc);
      else if (enc.module.type === 'shop') this.show(this.backdrop(shopView(data, run, enc.module, enc.node.id, () => this.map()), enc.module.content.background));
      else {
        // 이벤트 선택지에 이름으로 나온 카드도 본 것(GAME_DESIGN 16절 — 도감 기록 기준)
        const named = (enc.module.content.choices ?? []).flatMap((c) => [...c.effects, ...(c.outcomes ?? []).flatMap((o) => o.effects)]).filter((e) => e.op === 'gain_card' && e.card);
        if (named.length && recordsCards(run)) this.note((c) => named.forEach((e) => noteCard(c, e.card!)));
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
    // 장면이 있는 노드는 비주얼 노벨 장면을 먼저 재생한다(심연에는 이야기 장면이 없다)
    this.playScene(run.abyss ? undefined : enc.module.content.scene, go, enc.module.content.background);
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
    this.note((c) => noteAffixes(noteEnemiesSeen(c, state.enemies.map((e) => e.defId)), state.enemies.flatMap((e) => e.affixes ?? [])));
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    const own = data.stages.find((s) => s.id === enc.module.stage) ?? stage;
    playBgm(moodFor(run.abyss ? own.world : stage.world, enc.module.type === 'boss' ? 'boss' : 'battle'));
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
        pilgrimText: run.replayOf ? pilgrimLabel(data, run) : undefined,
        laws: (run.abyss?.laws ?? []).map((id) => data.laws.get(id)!).filter(Boolean),
        background: enc.module.content.background ?? (run.abyss ? own.background : stage.background),
        onQuit: (abandon) => {
          if (abandon && this.persist) {
            if (run.abyss) clearAbyss();
            else clearRun(this.slot);
          }
          this.title();
        },
      },
      (final) => {
        const outcome = battleOutcome(final)!;
        // 전투가 끝나면 장소의 곡으로(지면 엔딩 화면이 멈춘다)
        playBgm(outcome.result === 'victory' ? moodFor(stage.world) : null);
        this.note((c) => noteBattleEnd(c, final.enemies.map((e) => e.defId), outcome.result === 'victory', final.tally?.moves, final.tally?.surges ?? 0));
        this.clearMessages = applyBattleOutcome(data, run, enc, outcome);
        if (run.status === 'defeat') return this.map();
        // 전리품: 골드·엘리트 유물·물약은 바로 받고, 칸이 가득한 물약·보스 유물은 화면에서 고른다
        const loot = rollLoot(data, run, enc.node);
        const shown: LootShown = { loot, potionLeft: claimLoot(data, run, loot).potionLeft, notes: run.status === 'map' ? this.clearMessages : [] };
        this.note((c) => noteItem(noteRun(c, run), 'potions', loot.potion));
        if (run.status !== 'map') return this.show(this.backdrop(bossLootView(data, run, shown, () => this.map()), enc.module.content.background));
        // 일반·엘리트 전투의 끝 장면(원작의 그 전투 뒷이야기) → 보상
        this.playScene(
          run.abyss ? undefined : enc.module.content.outroScene,
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
    if (run.abyss) return openDeck(data, `덱 ${run.deck.length}장`, [{ label: loopLabel(run.abyss), cards: run.deck }]);
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
    // 처음 여는 편성 화면(새 캠페인은 S1 출발 전)에서 한 번: 편성이란(2026-10-11 UI/UX 2-1)
    if (!inn)
      runTour(
        [
          { target: '.loadout-tabs', title: '편성이란', text: `동료마다 ${data.balance.loadout.perCharacter}장 + 공용 ${data.balance.loadout.common}장을 보유 카드에서 골라 이번 스테이지의 덱을 짠다. 탭에는 채운 수와 갈래(아키타입)별 장수.` },
          { target: '.loadout-grid', title: '카드 고르기', text: '누르면 넣고, 다시 누르면 뺀다. 같은 카드는 한 장만.' },
          { target: '.loadout-bar', title: '점수 상한', text: `카드마다 등급 점수(카드 위 배지). 동료 ${data.balance.loadout.cap.perCharacter}점 · 공용 ${data.balance.loadout.cap.common}점까지 — 센 카드를 넣으면 나머지는 싼 카드로 채운다. 같은 갈래 카드 ${data.balance.loadout.focusMin}장이면 그 갈래의 전투 시작 보너스(✓).` },
          { target: '.loadout-actions', title: '추천을 눌러도 된다', text: '"전체 추천 편성"이 알아서 채운다. 다음 스테이지부터는 "지난 편성 그대로 출발" 한 번이면 된다.' },
        ],
        { id: 'loadout', once: true },
      );
  }

  /** 보상으로 본 카드도 도감에 */
  private rewardSeen(options: string[]): string[] {
    // 자유 여정의 보상 후보는 도감에 적지 않는다(순례 A안)
    if (this.run && recordsCards(this.run)) this.note((c) => options.forEach((id) => noteCard(c, id)));
    return options;
  }

  /** 클리어 지도 = 자유 여정: 큰 세계 지도에서 장소를 눌러 그곳을 걷는다. 멈춰 둔 곳은 이어서(GAME_DESIGN 2절) */
  private hub(): void {
    const run = this.run!;
    playBgm('title');
    // 캠페인을 마치면 이야기로 떠난 동료(카일·보른)가 돌아온다. 옛 저장도 여기서 한 번 맞춘다
    const back = restoreParty(data, run);
    if (back.length) {
      if (this.persist) saveRun(this.slot, run);
      this.notices.push(`${back.join('·')} — 다시 일행에 섰다`);
    }
    this.show(
      hubView(data, run, {
        // 장소를 누르면 작은 창(이긴 횟수·첫 순례 보상·도전 3개) → 출발(지금 편성 그대로) · 편성부터 · 이어서
        onStage: (stageId) =>
          placeDialog(data, run, stageId, {
            onGo: () => {
              this.run = startReplay(data, run, stageId);
              try {
                setLoadout(data, this.run, this.run.loadout);
              } catch {
                /* 편성에 문제가 있으면 편성 화면부터 */
              }
              this.map();
            },
            onLoadout: () => {
              this.run = startReplay(data, run, stageId);
              this.map();
            },
            onResume: () => {
              this.run = startReplay(data, run, stageId);
              this.map();
            },
            onDiscard: () => {
              discardSuspended(run, stageId);
              this.run = startReplay(data, run, stageId);
              this.map();
            },
          }),
        onResume: (stageId) => {
          this.run = startReplay(data, run, stageId);
          this.map();
        },
        onDiscard: async (stageId) => {
          const st = data.stages.find((s) => s.id === stageId)!;
          if (!(await confirmDialog(`${placeName(st, run)} — 멈춘 길 버리기`, '멈춰 둔 진행을 버린다. 그 길에서 얻은 카드·골드·유물도 함께 사라진다. 다음에 누르면 처음부터 걷는다.', '버리기'))) return;
          discardSuspended(run, stageId);
          if (this.persist) saveRun(this.slot, run);
          this.hub();
        },
        onShowDeck: () => this.showCards(),
        onCodex: () => this.codex('cards', () => this.hub()),
        onTitle: () => this.title(),
      }),
    );
  }

  /**
   * 자유 여정: 다시 하던 스테이지를 지금 자리에 멈춰 두고 전체 지도로(stageId가 있으면 곧장 그 장소로).
   * 멈춘 진행은 클리어한 런에 남아(저장도 된다) 그 장소를 다시 누르면 이어진다
   */
  private toWorld(stageId?: string): void {
    const run = this.run!;
    const here = data.stages.find((s) => s.id === run.stageId)!;
    const hub = suspendReplay(run);
    this.notices.push(`${placeName(here, hub)} — 이 자리에 멈춰 두었다. 다시 누르면 이어진다`);
    this.run = stageId ? startReplay(data, hub, stageId) : hub;
    this.map();
  }

  /**
   * 순례 길에서 보스를 넘겼을 때 한 번: 도전을 판정해 클리어한 런에 적고, 여는 것(칭호·틈의 카드·길)은 저장 칸과 상관없는 기록에 남긴다.
   * 끝 화면에 넣을 "도전 「…」 — …이(가) 열렸다" 목록(없으면 null)
   */
  private pilgrimNews(run: RunState): HTMLElement | null {
    if (!run.replayOf) return null;
    const fresh = settleChallenges(data, run);
    if (this.persist) recordChallenges(data, fresh);
    if (!fresh.length) return null;
    return h(
      'ul',
      { class: 'gains pilgrim-news' },
      fresh.map((c) => h('li', {}, `도전 「${c.name}」 — ${challengeUnlockName(data, c)}${c.unlock.title ? '을 얻었다' : '이(가) 열렸다'}`)),
    );
  }

  /** 순례 길을 마친다: 이겼고 이 스테이지의 첫 순례 보상이 남았으면 '순례의 보상'을 거쳐, 클리어 지도로 */
  private endPilgrimage(run: RunState): void {
    const hub = run.replayOf!;
    const won = run.status === 'stage_clear' || run.status === 'complete';
    const back = () => {
      this.run = finishReplay(run);
      this.map();
    };
    if (!won || !pilgrimRewardDue(hub, run.stageId)) return back();
    const offers = pilgrimRewardOptions(data, hub, run.stageId);
    this.show(
      this.backdrop(
        pilgrimRewardView(data, hub, offers, (pick) => {
          this.notices.push(claimPilgrimReward(data, hub, run.stageId, pick));
          // 보유에 든 카드는 도감에 실물로
          if (pick) this.note((c) => noteCard(c, pick.cardId, hub.collection[pick.cardId] ?? 0));
          back();
        }),
      ),
    );
  }

  /** 스테이지·굽이 끝 화면의 '얻은 것' 표: 카드 · 유물 · 레벨업(없으면 null) */
  private stageGainsEl(run: RunState): HTMLElement | null {
    const g = stageGainsSummary(data, run);
    const rows: [string, string][] = [
      ['카드', g.cards.join(' · ')],
      ['유물', g.relics.join(' · ')],
      ['레벨', g.levels.map((l) => `${l.name} ${l.from} → ${l.to}`).join(' · ')],
    ];
    const shown = rows.filter(([, v]) => v);
    if (!shown.length) return null;
    return h('dl', { class: 'stage-gains' }, shown.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
  }

  /** 심연 굽이 끝: 다음 굽이에 걸릴 법칙(없으면 null) */
  private nextLawsEl(run: RunState): HTMLElement | null {
    const ab = run.abyss!;
    const laws = planLoop(data, ab, ab.depth + 1).laws.map((id) => data.laws.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
    if (!laws.length) return h('p', { class: 'next-laws' }, '다음 굽이에는 법칙이 걸리지 않는다.');
    return h(
      'div',
      { class: 'next-laws' },
      h('span', {}, '다음 굽이의 법칙'),
      h('div', { class: 'law-badges' }, laws.map((l) => h('span', { class: 'law-badge', ...tipAttrs(`굽이의 법칙 — ${l.name}`, l.description, 'rift') }, iconEl('icons_abyss_laws', l.icon, l.glyph, 'law-icon'), l.name))),
    );
  }

  /** "이번 스테이지 상흔 +N → " */
  private scarDeltaText(run: RunState): string {
    const d = stageGainsSummary(data, run).scarDelta;
    return d ? `이번에 상흔 ${d > 0 ? '+' : ''}${d} → ` : '';
  }

  /** 보스를 넘은 뒤: 보스 모듈의 장면 글(outro)을 보여 주고 다음 스테이지로 */
  private stageClear(): void {
    const run = this.run!;
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    const boss = data.modules.get(stage.boss ?? '');
    // 끝 장면을 이미 보여 줬으면 장면 글은 생략
    const outro = boss?.content.outroScene ? undefined : boss?.content.outro;
    const next = nextStage(data, run);
    const news = this.pilgrimNews(run);
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
            // 이번 스테이지에 얻은 것(카드·유물·레벨업, 2026-10-11 UI/UX 3-2)
            this.stageGainsEl(run),
            news,
            run.scar > 0
              ? h(
                  'p',
                  { class: 'scar-reveal' },
                  // '하늘의 금'을 보기 전에는 그 말을 쓰지 않는다(GAME_DESIGN 14절)
                  `${this.scarDeltaText(run)}${run.flags.includes('sky_crack') ? `지금까지 쌓인 상흔 ${run.scar} — 하늘의 금이 그만큼 벌어졌다.` : `엉킨 흐름이 남긴 상흔 ${run.scar}.`}`,
                )
              : null,
            h(
              'button',
              {
                class: 'btn btn-primary btn-large',
                onclick: () => {
                  this.clearMessages = [];
                  // 다시 하기는 이 스테이지만: (처음 다시 넘겼으면 순례의 보상 뒤) 클리어 지도로 돌아간다
                  if (run.replayOf) return this.endPilgrimage(run);
                  advanceStage(data, run);
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

  // ───────────────────────── 심연(GAME_DESIGN 16절) ─────────────────────────

  /** 심연 풀(이 브라우저의 저장 칸 보유 카드 ∪ 도감 기록) */
  private abyssPoolNow(): Record<string, number> {
    return abyssPool(data, campaignCollection(data), readCodex(data).cards);
  }

  /** 심연 시작: 동료 1~3명, 길(동료 수에 따라 1~2개), 서약 단계. 시드는 새로. 아래에 오늘의 심연 */
  private openAbyss(seed = randomSeed(), presetMates?: string[], presetPaths?: string[], presetOath?: number): void {
    const pool = this.abyssPoolNow();
    const counts = poolByOwner(data, pool);
    const meta = readAbyssMeta(data);
    const profile = readProfile();
    const openPaths = unlockedPaths(data, meta.achievements, meta.opened);
    const openRift = unlockedRift(data, meta.achievements, meta.opened);
    const maxOath = oathMax(data, profile.abyssBestDepth, meta.oathCleared);
    let oath = Math.min(maxOath, presetOath ?? 0);
    const mates = new Set<string>(presetMates ?? ['elia']);
    const offer = pathOffer(data, seed, openPaths);
    const paths = new Set<string>(presetPaths?.filter((p) => offer.includes(p)) ?? []);
    const body = h('div', { class: 'abyss-start' });
    let started = false;
    const ov = openOverlay('심연 — 바늘구멍만 한 문', body, { onClose: () => !started && this.title(), wide: true });
    const fighters = [...data.characters.values()].filter((c) => c.role === 'fighter' && c.id !== 'haun');
    const today = dailySeed(new Date());
    const plan = dailyPlan(data, today);
    const todayRec = meta.daily[today.slice(1)];
    // 서약 목록은 열린 단계와 다음 한 단계만, 나머지 잠긴 단계는 접어 둔다(문을 넘는 단추가 위로 오게)
    let showAllOaths = false;
    const hiddenOaths = () => data.oaths.filter((o) => o.level > maxOath + 1).length;
    // 동료 반신 그림은 한 번만 불러 두고 다시 그릴 때 그대로 쓴다
    const faces = new Map<string, HTMLElement>();
    const mateFace = (id: string) => {
      let el = faces.get(id);
      if (!el) {
        const box = h('span', { class: 'abyss-mate-pic', 'aria-hidden': 'true' });
        void loadPortrait(id).then((img) => img && box.replaceChildren(h('img', { src: img.src, alt: '' })));
        faces.set(id, (el = box));
      }
      return el;
    };
    const render = () => {
      const mods = oathMods(data, oath);
      const mateMax = Math.min(fighters.length, mods.maxMates ?? fighters.length);
      while (mates.size > mateMax) mates.delete([...mates][mates.size - 1]);
      const picks = pathPicks(data, mates.size);
      while (paths.size > picks.picks) paths.delete([...paths][paths.size - 1]);
      const ready = mates.size >= 1 && paths.size === picks.picks;
      body.replaceChildren(
        h('p', { class: 'abyss-intro' }, '하늘을 꿰맨 뒤, 바늘구멍만 한 문이 남았다. 문 너머를 한 굽이씩 내려간다. 끝은 없다 — 얼마나 깊이 갔는지만 남는다.'),
        h(
          'p',
          { class: 'hint' },
          `업적 ${meta.achievements.length}/${data.achievements.size} · 열린 틈의 카드 ${openRift.length}/${riftCards(data).length} · 열린 길 ${openPaths.length}/${abyssPaths(data).length}${profile.abyssBestDepth ? ` · 최고 ${profile.abyssBestDepth}굽이 · ${profile.abyssBestScore}점` : ''}`,
        ),
        h('h3', {}, `함께 갈 동료 (${mates.size}/${mateMax}) — 하운은 늘 간다`),
        h(
          'div',
          { class: 'abyss-mates' },
          fighters.map((c) =>
            h(
              'label',
              { class: `abyss-mate${mates.has(c.id) ? ' on' : ''}`, style: `--owner:${c.color}` },
              h('input', {
                type: 'checkbox',
                checked: mates.has(c.id),
                disabled: !mates.has(c.id) && mates.size >= mateMax,
                onchange: (e: Event) => {
                  if ((e.target as HTMLInputElement).checked) mates.add(c.id);
                  else mates.delete(c.id);
                  render();
                },
              }),
              // 반신 그림(2026-10-11 UI/UX 3-4)
              mateFace(c.id),
              h('b', {}, c.name),
              h('small', {}, `${c.archetypes.map((a) => a.name).join(' · ')} — 심연 풀 ${counts[c.id] ?? 0}장`),
              (counts[c.id] ?? 0) < data.balance.abyss.narrowPool
                ? h('small', { class: 'abyss-narrow' }, '좁음 — 캠페인에서 더 보고 오면 넓어진다')
                : null,
            ),
          ),
        ),
        h('p', { class: 'hint' }, `심연 풀: 하운 ${counts.haun ?? 0}장 · 공용 ${counts.common ?? 0}장${fighters.map((c) => ` · ${c.name} ${counts[c.id] ?? 0}장`).join('')}. 캠페인에서 보거나 얻은 카드만 보상에 나온다 — 더 보고 오면 넓어진다.`),
        h('h3', {}, `길 — ${picks.picks}개 고르기${picks.gold ? ` (덤: 골드 +${picks.gold})` : ''}`),
        h('p', { class: 'hint' }, '동료가 적을수록 길을 더 고른다(1명: 2개와 골드 100 · 2명: 1개와 골드 50 · 3명: 1개).'),
        h(
          'div',
          { class: 'abyss-paths' },
          offer.map((id) => {
            const r = data.relics.get(id)!;
            return h(
              'label',
              { class: `abyss-path${paths.has(id) ? ' on' : ''}` },
              h('input', {
                type: 'checkbox',
                checked: paths.has(id),
                disabled: !paths.has(id) && paths.size >= picks.picks,
                onchange: (e: Event) => {
                  if ((e.target as HTMLInputElement).checked) paths.add(id);
                  else paths.delete(id);
                  render();
                },
              }),
              h('span', { class: 'abyss-path-glyph' }, r.glyph),
              h('b', {}, r.name),
              h('small', {}, r.description),
            );
          }),
        ),
        h('h3', {}, `서약 — ${oath ? `${oath}단계` : '없음'} (열린 단계 ${maxOath}/${data.oaths.length})`),
        h(
          'div',
          { class: 'abyss-oath-row' },
          maxOath
          ? h('input', {
              type: 'range',
              class: 'abyss-oath-range',
              min: 0,
              max: maxOath,
              value: oath,
              'aria-label': '서약 단계',
              onchange: (e: Event) => {
                oath = Number((e.target as HTMLInputElement).value);
                render();
              },
            })
          : null,
        ),
        h(
          'ol',
          { class: 'abyss-oaths' },
          data.oaths.filter((o) => showAllOaths || o.level <= Math.max(oath, maxOath) + 1).map((o) =>
            h(
              'li',
              {
                class: o.level <= oath ? 'on' : o.level > maxOath ? 'locked' : 'pickable',
                // 열린 단계는 줄 전체를 눌러 고른다(같은 단계를 다시 누르면 한 단계 아래로)
                onclick: o.level <= maxOath ? () => ((oath = oath === o.level ? o.level - 1 : o.level), render()) : undefined,
              },
              h('span', { class: 'abyss-oath-glyph' }, o.glyph),
              h('b', {}, o.level > maxOath ? `${o.level}단계 — 잠김` : `${o.level}. ${o.name}`),
              h('small', {}, o.level > maxOath ? (o.level === maxOath + 1 ? `${o.level + data.balance.abyss.oath.depthOffset}굽이를 넘거나, 서약 ${o.level - 1}단계로 ${data.balance.abyss.oath.stepDepth}굽이를 넘으면 열린다` : '') : o.description),
            ),
          ),
        ),
        hiddenOaths() && !showAllOaths
          ? h('button', { class: 'btn btn-small abyss-oath-more', onclick: () => ((showAllOaths = true), render()) }, `잠긴 단계 ${hiddenOaths()}개 — 펼치기`)
          : '',
        h('p', { class: 'hint' }, `고른 단계까지 모두 걸린다. 점수 ×${oathScoreMul(data, oath).toFixed(2)}. 시드 ${seed} · 길 ${abyssPaths(data).length}종 중 열린 ${openPaths.length}종에서 시드로 ${offer.length}개`),
        h(
          'div',
          { class: 'confirm-actions' },
          h(
            'button',
            {
              class: 'btn btn-primary',
              disabled: !ready,
              onclick: () => {
                started = true;
                ov.close();
                this.startAbyss(seed, [...mates], [...paths], oath);
              },
            },
            '문을 넘는다',
          ),
        ),
        h(
          'div',
          { class: 'abyss-daily' },
          h('h3', {}, `오늘의 심연 — ${today.slice(1, 5)}.${today.slice(5, 7)}.${today.slice(7)}`),
          h(
            'p',
            { class: 'hint' },
            `모두가 같은 시드(${today}): 동료 ${plan.mates.map((id) => data.characters.get(id)?.name ?? id).join('·')} · 길 ${plan.paths.map((id) => data.relics.get(id)?.name ?? id).join('·')} · 서약 ${plan.oath}단계 · 그날의 법칙 ${plan.laws.map((id) => data.laws.get(id)?.name ?? id).join('·')}(모든 굽이에).${todayRec ? ` 오늘 최고 ${todayRec.score}점(${todayRec.cleared}굽이).` : ''}`,
          ),
          h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                started = true;
                ov.close();
                this.startDaily();
              },
            },
            '오늘의 심연',
          ),
        ),
      );
    };
    render();
  }

  private startAbyss(seed: string, mates: string[], paths: string[], oath = 0): void {
    const meta = readAbyssMeta(data);
    this.run = createAbyssRun(data, seed, {
      mates,
      paths,
      oath,
      pool: this.abyssPoolNow(),
      unlocked: unlockedRift(data, meta.achievements, meta.opened),
      unlockedPaths: unlockedPaths(data, meta.achievements, meta.opened),
    });
    this.persist = true;
    recordAbyss({ started: true });
    this.map();
  }

  /** 오늘의 심연: 날짜 시드로 동료·길·서약·그날의 법칙이 정해진다(해금과 상관없이. 틈의 카드는 이 브라우저에서 열린 것) */
  private startDaily(): void {
    const seed = dailySeed(new Date());
    const plan = dailyPlan(data, seed);
    this.run = createAbyssRun(data, seed, {
      mates: plan.mates,
      paths: plan.paths,
      oath: plan.oath,
      pool: this.abyssPoolNow(),
      unlocked: unlockedRift(data, readAbyssMeta(data).achievements, readAbyssMeta(data).opened),
      daily: { date: seed.slice(1), laws: plan.laws },
    });
    this.persist = true;
    recordAbyss({ started: true });
    this.map();
  }

  private resumeAbyss(run: RunState): void {
    this.run = run;
    this.persist = true;
    this.map();
  }

  /** 심연 기록 갱신(업적·서약·멈춘 굽이·일일). 새로 이룬 업적의 안내 문구 */
  private abyssRecord(ended: boolean): string[] {
    if (!this.persist) return [];
    const run = this.run!;
    const meta = readAbyssMeta(data);
    const codex = readCodex(data);
    const fresh = updateAbyssMeta(data, meta, run, { ended, codexCards: codexCards(data).filter((c) => c.id in codex.cards).length });
    writeAbyssMeta(meta);
    return fresh.map((a) => `업적 「${a.name}」 — ${unlockName(data, a)}이(가) 열렸다`);
  }

  /** 굽이 보스를 넘은 뒤: 다음 굽이로 */
  private abyssLoopClear(): void {
    const run = this.run!;
    const ab = run.abyss!;
    if (this.persist) recordAbyss({ cleared: ab.depth, score: abyssScore(data, run) });
    const unlocks = this.abyssRecord(false);
    const every = nemesisEvery(data, ab);
    this.show(
      this.backdrop(
        h(
          'section',
          { class: 'screen end-screen stage-clear win abyss-clear' },
          h(
            'div',
            { class: 'end-box' },
            h('div', { class: 'end-kicker' }, `심연 · ${WORLD_NAME[ab.world]}${ab.oath ? ` · 서약 ${ab.oath}` : ''}${ab.daily ? ' · 오늘의 심연' : ''}`),
            h('h1', {}, `${ab.depth}굽이를 넘었다`),
            h('p', { class: 'outro' }, (ab.depth + 1) % every === 0 ? '다음 굽이 끝에서 익숙한 목소리가 울린다. 숙적이 기다린다.' : '틈은 더 깊이 이어진다. 다음 굽이로 내려가면 상처가 조금 아문다.'),
            unlocks.length ? h('ul', { class: 'gains end-unlock' }, ...unlocks.map((m) => h('li', {}, m))) : null,
            this.clearMessages.length ? h('ul', { class: 'gains clear-gains' }, ...this.clearMessages.map((m) => h('li', {}, m))) : null,
            // 스테이지 끝과 같은 틀: 얻은 것 · 상흔 · 다음 굽이의 법칙 예고(2026-10-11 UI/UX 3-2)
            this.stageGainsEl(run),
            this.nextLawsEl(run),
            h('p', { class: 'hint' }, `점수 ${abyssScore(data, run)} · 보스 ${ab.bosses} · 엘리트 ${ab.elites} · 덱 ${run.deck.length}장 · ${this.scarDeltaText(run)}상흔 ${run.scar}`),
            h(
              'button',
              {
                class: 'btn btn-primary btn-large',
                onclick: () => {
                  this.clearMessages = [];
                  advanceStage(data, run);
                  this.map();
                },
              },
              `${ab.depth + 1}굽이로`,
            ),
          ),
        ),
      ),
    );
  }

  /** 심연의 끝: N굽이에서 멈췄다 + 사망 원인 + 점수 + 새로 기록한 카드·이룬 업적 */
  private abyssEnd(): void {
    const run = this.run!;
    const ab = run.abyss!;
    const score = abyssScore(data, run);
    const cleared = ab.depth - 1;
    const best = readProfile();
    if (this.persist) recordAbyss({ cleared, score });
    if (this.persist) logRun(data, run, 'defeat');
    const unlocks = this.abyssRecord(true);
    playBgm(null);
    this.show(
      this.backdrop(
        h(
          'section',
          { class: 'screen end-screen lose abyss-end' },
          h(
            'div',
            { class: 'end-box' },
            h('div', { class: 'end-kicker' }, `심연${ab.oath ? ` · 서약 ${ab.oath}` : ''}${ab.daily ? ' · 오늘의 심연' : ''}`),
            h('h1', {}, `${ab.depth}굽이에서 멈췄다`),
            h('p', { class: 'outro' }, `넘은 굽이 ${cleared} · 점수 ${score}${score > best.abyssBestScore && this.persist ? ' — 새 기록' : ''}`),
            run.stats?.deathCause ? h('p', { class: 'hint' }, `쓰러진 곳: ${run.stats.deathCause}`) : null,
            ab.revealed.length ? h('p', { class: 'end-unlock' }, `이번 심연에서 처음 본 카드 ${ab.revealed.length}장 — 도감에 적었다. 다음 심연부터 보상에 나온다.`) : null,
            unlocks.length ? h('ul', { class: 'gains end-unlock' }, ...unlocks.map((m) => h('li', {}, m))) : null,
            h('p', { class: 'hint' }, `시드 ${ab.baseSeed} · 보스 ${ab.bosses} · 엘리트 ${ab.elites} · 덱 ${run.deck.length}장 · 상흔 ${run.scar}`),
            this.runStats(run, false),
            h(
              'div',
              { class: 'end-actions' },
              h('button', { class: 'btn btn-primary btn-large', onclick: () => this.openAbyss() }, '새 심연'),
              ab.daily
                ? h('button', { class: 'btn btn-large', onclick: () => this.startDaily() }, '오늘의 심연 다시')
                : h('button', { class: 'btn btn-large', onclick: () => this.openAbyss(ab.baseSeed, ab.mates.slice(0, ab.track?.startMates ?? ab.mates.length), ab.paths, ab.oath) }, '같은 시드로 다시'),
              h(
                'button',
                {
                  class: 'btn btn-large',
                  onclick: (e: Event) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    navigator.clipboard?.writeText(ab.baseSeed).then(() => (btn.textContent = `복사됨: ${ab.baseSeed}`), () => (btn.textContent = `시드: ${ab.baseSeed}`));
                  },
                },
                '시드 복사',
              ),
              h('button', { class: 'btn btn-large', onclick: () => this.title() }, '타이틀로'),
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
    const empty = !st || (st.battles + st.turns + st.kills + st.damage + st.crits + st.surges === 0);
    return h(
      'div',
      { class: 'run-stats panel' },
      // 맨 위 한 줄: 쓰러진 곳(모듈 — 마지막으로 때린 적·행동)
      !win && st?.deathCause ? h('p', { class: 'rs-death' }, `쓰러진 곳 — ${st.deathCause}`) : null,
      empty
        ? h('p', { class: 'rs-empty hint' }, '기록 없음')
        : h(
            'div',
            { class: 'rs-grid' },
            cell('전투', st.battles),
            cell('턴', st.turns),
            cell('처치', st.kills),
            cell('준 피해', st.damage.toLocaleString('ko-KR')),
            cell('치명타', st.crits),
            cell('균열 폭주', st.surges),
            cell('폭주로 잃은 체력', st.surgeHp ?? 0),
          ),
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
    if (this.persist && !run.replayOf) logRun(data, run, win ? 'complete' : 'defeat');
    const last = data.stages.find((s) => s.id === run.stageId)!;
    // 엔딩 장면이 있는 스테이지까지 왔으면 이야기의 끝, 아니면 지금 만들어진 범위의 끝
    const finale = win && !!last.endingScene;
    const news = win ? this.pilgrimNews(run) : null;
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
            news,
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
                        if (run.replayOf) return this.endPilgrimage(run);
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
