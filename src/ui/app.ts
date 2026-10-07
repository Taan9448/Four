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
  enterNode,
  isBattle,
  nextStage,
  rewardOptions,
  type Encounter,
  type RunState,
} from '../engine/run';
import { BattleView } from './battle-view';
import { choiceView, rewardView } from './choice-view';
import { h } from './dom';
import { mapView } from './map-view';
import { sceneView } from './scene-view';

const data = gameData();

export class App {
  private run: RunState | null = null;

  constructor(private root: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const seed = params.get('seed');
    if (params.has('sandbox')) this.sandbox(seed ?? 'SANDBOX', (params.get('sandbox') || 'elia').split(',').filter(Boolean));
    else if (seed) this.start(seed, params.has('wang'));
    else this.title();
  }

  /** ?sandbox[=kyle,born] — 지도 없이 바로 전투(하운+동료(기본 엘리아) vs 그림자늑대 2마리, 융합 카드·왕일검 지원 포함). 연출 확인용 */
  private sandbox(seed: string, mates: string[]): void {
    const run = createRun(data, seed, { stageId: 's1', supportActive: true });
    applyRunOps(data, run, [
      ...mates.map((member) => ({ op: 'join_party' as const, member })),
      { op: 'gain_card', card: 'haun_byeogun', count: 2 },
      { op: 'gain_card', card: 'haun_cloud_form' },
    ]);
    this.run = run;
    const node = { id: 'sandbox', floor: 0, index: 0, type: 'battle' as const, moduleId: 's1_battle_wolves_pair', next: [] };
    this.battle({ node, module: data.modules.get('s1_battle_wolves_pair')! });
  }

  private show(el: HTMLElement): void {
    this.root.replaceChildren(el);
    window.scrollTo(0, 0);
  }

  private title(): void {
    const seedInput = h('input', { class: 'seed-input', value: randomSeed(), maxlength: 24, 'aria-label': '시드' }) as HTMLInputElement;
    const wang = h('input', { type: 'checkbox' }) as HTMLInputElement;
    this.show(
      h(
        'section',
        { class: 'screen title-screen' },
        h('h1', {}, '천외귀환', h('small', {}, '天外歸還 — 세계의 틈')),
        h('p', { class: 'tagline' }, '장작을 패던 소년이 결을 따라, 두 세계를 가른다.'),
        h(
          'div',
          { class: 'title-form' },
          h('label', {}, '시드 ', seedInput, h('button', { class: 'btn', onclick: () => (seedInput.value = randomSeed()) }, '↻')),
          h('label', { class: 'support-toggle' }, wang, ' 왕일검 지원(디버그)'),
          h('button', { class: 'btn btn-primary', onclick: () => this.start(seedInput.value.trim() || randomSeed(), wang.checked) }, '시작 — S0 청운산'),
        ),
        h('p', { class: 'hint' }, '1차 프로토타입: S0 청운산(프롤로그) → S1 엘하임 숲. 같은 시드면 같은 지도가 나옵니다. 그래픽은 대부분 임시 그림입니다.'),
      ),
    );
  }

  private start(seed: string, support: boolean): void {
    this.run = createRun(data, seed, { supportActive: support });
    const url = new URL(location.href);
    url.searchParams.set('seed', seed);
    if (support) url.searchParams.set('wang', '1');
    else url.searchParams.delete('wang');
    history.replaceState(null, '', url);
    this.map();
  }

  private map(): void {
    const run = this.run!;
    if (run.status === 'stage_clear') {
      // 보스의 끝 장면(outroScene) → 스테이지 끝 화면
      const stage = data.stages.find((s) => s.id === run.stageId)!;
      const outroScene = data.modules.get(stage.boss ?? '')?.content.outroScene;
      return this.playScene(outroScene, () => this.stageClear());
    }
    if (run.status === 'complete') return this.end(true);
    if (run.status === 'defeat') return this.end(false);
    this.show(
      mapView(data, run, {
        onEnter: (node) => this.enter(node),
        onToggleSupport: (on) => {
          run.supportActive = on;
          this.map();
        },
        onRefresh: () => this.map(),
        onRestart: () => this.title(),
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
        subtitle: `${stage.name} · ${enc.node.floor}층`,
        seed: run.seed,
        scar: run.scar,
        supportActive: run.supportActive,
        bonusText: bonus,
        introText: enc.module.content.text,
      },
      (final) => {
        applyBattleOutcome(data, run, enc, battleOutcome(final)!);
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
        next ? h('p', { class: 'next-stage' }, `다음: ${next.name} (${next.chapters})`) : null,
        h(
          'button',
          {
            class: 'btn btn-primary',
            onclick: () => {
              advanceStage(data, run);
              this.map();
            },
          },
          next ? '계속' : '마치기',
        ),
      ),
    );
  }

  private end(win: boolean): void {
    const run = this.run!;
    this.show(
      h(
        'section',
        { class: `screen end-screen ${win ? 'win' : 'lose'}` },
        h('h1', {}, win ? '화염군주를 베었다' : '여기까지'),
        h(
          'p',
          {},
          win
            ? '푸른 검광이 협곡을 세로로 갈랐다. 그 자리의 허공에, 머리카락보다 가는 검은 금이 그어졌다가 사라졌다. (S1 클리어 — 다음 스테이지는 이후 작업)'
            : '하운이 쓰러졌다.',
        ),
        h('p', { class: 'hint' }, `시드 ${run.seed} · 상흔 ${run.scar} · 덱 ${run.deck.length}장`),
        h('button', { class: 'btn btn-primary', onclick: () => this.title() }, '새 런'),
      ),
    );
  }
}
