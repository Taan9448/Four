// 화면 흐름: 타이틀 → 지도 → (스토리/이벤트/휴식/여관 | 전투 → 보상) → 지도 … → 스테이지 클리어 / 패배
import { battleOutcome, createBattle } from '../engine/battle';
import { gameData } from '../engine/data';
import { randomSeed } from '../engine/rng';
import type { MapNode } from '../engine/route';
import {
  addCard,
  advanceStage,
  applyBattleOutcome,
  applyRunOps,
  battleSetupFor,
  createRun,
  createRunAt,
  enterNode,
  isBattle,
  nextStage,
  rewardOptions,
  type Encounter,
  type RunState,
} from '../engine/run';
import { frameUrl } from '../render/assets';
import { BattleView } from './battle-view';
import { choiceView, rewardView } from './choice-view';
import { openDeck } from './deck-view';
import { h } from './dom';
import { initDebug, isDebug } from './debug';
import { mapView, placeName } from './map-view';
import { confirmDialog, openOverlay } from './overlay';
import { sceneView } from './scene-view';
import { applySettings, settingsForm } from './settings';
import { clearRun, loadRun, saveRun } from './storage';

const data = gameData();

export class App {
  private run: RunState | null = null;
  /** 보스를 이긴 뒤 clearEffects 결과(스테이지 끝 화면에 보여 준다) */
  private clearMessages: string[] = [];
  /** 이 런을 브라우저에 저장하는가(샌드박스는 저장하지 않는다) */
  private persist = true;

  constructor(private root: HTMLElement) {
    applySettings();
    const params = new URLSearchParams(location.search);
    initDebug(params);
    const seed = params.get('seed');
    if (params.has('sandbox'))
      this.sandbox(seed ?? 'SANDBOX', (params.get('sandbox') || 'elia').split(',').filter(Boolean), params.get('module') ?? undefined);
    else if (seed) this.start(seed, params.has('wang'), params.get('stage') ?? undefined);
    else this.title();
  }

  /**
   * ?sandbox[=kyle,born][&module=s5_boss_vargas] — 지도 없이 바로 전투(하운+동료(기본 엘리아), 융합 카드·왕일검 지원 포함).
   * module이 없으면 그림자늑대 2마리. 모듈에 장면이 있으면 먼저 재생한다. 연출 확인용
   */
  private sandbox(seed: string, mates: string[], moduleId = 's1_battle_wolves_pair'): void {
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
    this.playScene(module.content.scene, () => this.battle({ node, module }));
  }

  private show(el: HTMLElement): void {
    this.root.replaceChildren(el);
    window.scrollTo(0, 0);
  }

  /** 시작 화면(GAME_DESIGN 13절): 세계관 그림 한 장 위 가운데에 제목과 메뉴. 시드·디버그는 접힌 "시작 옵션" 안에 */
  private title(): void {
    const saved = loadRun(data);
    const seedInput = h('input', { class: 'seed-input', value: randomSeed(), maxlength: 24, 'aria-label': '시드' }) as HTMLInputElement;
    const wang = h('input', { type: 'checkbox' }) as HTMLInputElement;
    const startNew = async () => {
      if (saved && !(await confirmDialog('새로 시작', '저장된 런을 지우고 새 런을 시작합니다.', '새로 시작'))) return;
      clearRun();
      this.start(seedInput.value.trim() || randomSeed(), wang.checked);
    };
    let resume: HTMLElement | null = null;
    if (saved) {
      const run = saved.run;
      const stage = data.stages.find((st) => st.id === run.stageId)!;
      const floor = run.map.floors.flat().find((n) => n.id === run.position)?.floor ?? 0;
      const where = run.status === 'stage_clear' ? '보스를 넘음' : floor ? `${floor}층` : '출발 전';
      resume = h(
        'button',
        { class: 'btn btn-primary', title: `상흔 ${run.scar} · 시드 ${run.seed}`, onclick: () => this.resume(run) },
        '이어하기',
        h('small', {}, `${placeName(stage, run)} · ${where} · 덱 ${run.deck.length}장`),
      );
    }
    const url = frameUrl('title_world', 1, { realOnly: true });
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
            resume,
            h('button', { class: `btn${saved ? '' : ' btn-primary'}`, onclick: startNew }, saved ? '새로 시작' : '시작하기', saved ? null : h('small', {}, 'S0 청운산부터')),
            h('button', { class: 'btn', onclick: () => this.openSettings() }, '설정'),
          ),
          h(
            'details',
            { class: 'title-options' },
            h('summary', {}, '시작 옵션'),
            h('label', {}, '시드 ', seedInput, h('button', { class: 'btn btn-small', 'aria-label': '시드 바꾸기', onclick: () => (seedInput.value = randomSeed()) }, '↻')),
            // 디버그 옵션은 ?debug에서만(합류 전 동료 이름·스테이지 목록을 미리 보여 주지 않는다, GAME_DESIGN 14절)
            isDebug() ? h('label', { class: 'support-toggle' }, wang, ' 왕일검 지원(디버그)') : null,
            h('p', { class: 'hint' }, '같은 시드면 같은 지도가 나옵니다. 지도에 설 때마다 자동 저장됩니다.'),
          ),
        ),
        h('p', { class: 'title-foot' }, '장작을 패던 소년이 결을 따라, 두 세계를 가른다.'),
      ),
    );
  }

  private resume(run: RunState): void {
    this.run = run;
    this.persist = true;
    this.map();
  }

  private openSettings(): void {
    openOverlay('설정', settingsForm());
  }

  /** stageId(?stage=s2): 앞 스테이지를 건너뛰고 시작(확인용, createRunAt) */
  private start(seed: string, support: boolean, stageId?: string): void {
    this.run = stageId
      ? createRunAt(data, seed, stageId, { supportActive: support })
      : createRun(data, seed, { supportActive: support });
    this.persist = true;
    // 주소창의 ?seed=…(디버그 시작)를 지운다: 새로고침하면 타이틀의 "이어하기"로 돌아온다
    if (location.search) history.replaceState(null, '', location.pathname);
    this.map();
  }

  private map(): void {
    const run = this.run!;
    // 자동 저장: 지도(또는 스테이지 끝)에 설 때마다. 노드에 들어간 뒤 새로고침하면 그 노드 직전 지도에서 이어진다
    if (this.persist) {
      if (run.status === 'map' || run.status === 'stage_clear') saveRun(run);
      else clearRun();
    }
    if (run.status === 'stage_clear') {
      // 보스의 끝 장면(outroScene) → 스테이지 끝 화면
      const stage = data.stages.find((s) => s.id === run.stageId)!;
      const outroScene = data.modules.get(stage.boss ?? '')?.content.outroScene;
      return this.playScene(outroScene, () => this.stageClear());
    }
    if (run.status === 'complete') {
      // 캠페인의 끝: 에필로그 장면 → 엔딩 화면
      const last = data.stages.find((s) => s.id === run.stageId)!;
      return this.playScene(last.endingScene, () => this.end(true));
    }
    if (run.status === 'defeat') return this.end(false);
    this.show(
      mapView(data, run, {
        onEnter: (node) => this.enter(node),
        onToggleSupport: (on) => {
          run.supportActive = on;
          this.map();
        },
        onRefresh: () => this.map(),
        onShowDeck: () => openDeck(data, `덱 ${run.deck.length}장`, [{ label: '덱', cards: run.deck }]),
        onSettings: () => this.openSettings(),
        onTitle: () => this.title(),
      }),
    );
  }

  private enter(node: MapNode): void {
    const run = this.run!;
    const enc = enterNode(data, run, node.id);
    const go = () => {
      if (isBattle(enc)) this.battle(enc);
      else this.show(choiceView(data, run, enc.module, () => this.map()));
    };
    // 장면이 있는 노드는 비주얼 노벨 장면을 먼저 재생한다
    this.playScene(enc.module.content.scene, go);
  }

  /** 장면 id가 있으면 재생하고 끝나면 then, 없으면 바로 then */
  private playScene(id: string | undefined, then: () => void): void {
    const scene = id ? data.scenes.get(id) : undefined;
    if (!scene) return then();
    this.show(sceneView(data, scene, then));
  }

  private battle(enc: Encounter): void {
    const run = this.run!;
    const setup = battleSetupFor(data, run, enc);
    const state = createBattle(data, setup);
    const stage = data.stages.find((s) => s.id === run.stageId)!;
    const bonus = setup.startEffects?.length ? enc.module.content.bonus?.text : undefined;
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
          if (abandon && this.persist) clearRun();
          this.title();
        },
      },
      (final) => {
        this.clearMessages = applyBattleOutcome(data, run, enc, battleOutcome(final)!);
        if (run.status !== 'map') return this.map();
        this.show(
          rewardView(data, rewardOptions(data, run, enc.node.id), (cardId) => {
            if (cardId) addCard(run, cardId);
            this.map();
          }),
        );
      },
    );
    this.show(view.root);
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
      h(
        'section',
        { class: 'screen end-screen stage-clear win' },
        h('h1', {}, `${stage.name} — 끝`),
        outro ? h('p', { class: 'outro' }, outro) : null,
        this.clearMessages.length ? h('ul', { class: 'clear-gains' }, ...this.clearMessages.map((m) => h('li', {}, m))) : null,
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
            class: 'btn btn-primary',
            onclick: () => {
              this.clearMessages = [];
              advanceStage(data, run);
              this.map();
            },
          },
          next ? '계속' : stage.endingScene ? '에필로그' : '마치기',
        ),
      ),
    );
  }

  private end(win: boolean): void {
    const run = this.run!;
    const last = data.stages.find((s) => s.id === run.stageId)!;
    // 엔딩 장면이 있는 스테이지까지 왔으면 이야기의 끝, 아니면 지금 만들어진 범위의 끝
    const finale = win && !!last.endingScene;
    this.show(
      h(
        'section',
        { class: `screen end-screen ${win ? 'win' : 'lose'}${finale ? ' finale' : ''}` },
        h('h1', {}, finale ? '천외귀환' : win ? `${last.name}까지` : '여기까지'),
        finale ? h('p', { class: 'finale-sub' }, '天外歸還 — 세계의 틈 · 완') : null,
        h(
          'p',
          {},
          finale
            ? '세계의 틈이 닫혔다. 천마봉 위에는 바느질 자국처럼 가지런한 흉터, 청운봉선(靑雲縫線)이 남았다.'
            : win
              ? `지금 만들어진 이야기는 여기까지다. (${last.chapters} — 다음 스테이지는 이후 작업)`
              : '하운이 쓰러졌다.',
        ),
        h('p', { class: 'hint' }, `시드 ${run.seed} · 상흔 ${run.scar} · 덱 ${run.deck.length}장`),
        h('button', { class: 'btn btn-primary', onclick: () => this.title() }, '새 런'),
      ),
    );
  }
}
