// 배경음악 수명(2026-10-15 렉 줄이기): 곡 파일은 <audio>로 흘려 듣고, 바뀐 앞 곡은 1.5초 뒤 소스를 비워 놓아 준다.
// 빠르게 여러 번 바꿔도 마지막 곡만 남고, 탭을 숨기면 멈췄다가 돌아오면 지금 곡만 다시 튼다. 곡 전체를 decodeAudioData로 풀지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static all: FakeAudio[] = [];
  /** 브라우저가 입력 밖의 재생을 막는 흉내 */
  static blocked = false;
  paused = true;
  loop = false;
  preload = '';
  private attrs = new Map<string, string>();
  constructor() {
    FakeAudio.all.push(this);
  }
  set src(v: string) {
    this.attrs.set('src', v);
  }
  get src(): string {
    return this.attrs.get('src') ?? '';
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  load() {}
  play() {
    if (!this.src || FakeAudio.blocked) return Promise.reject(new Error('not allowed'));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const param = () => ({ value: 1, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
const node = () => ({ connect: (n: unknown) => n, disconnect: vi.fn() });
let decodes = 0;
let made: string[] = [];
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state = 'running';
  destination = node();
  createGain = () => ({ ...node(), gain: param() });
  createDynamicsCompressor = () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
  createConvolver = () => ({ ...node(), buffer: null });
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  createMediaElementSource = () => node();
  // 합성 효과음용(이펙트별 소리 시험): 만든 소리 마디를 센다
  createOscillator = () => (made.push('osc'), { ...node(), type: 'sine', frequency: param(), detune: param(), start() {}, stop() {} });
  createBufferSource = () => (made.push('noise'), { ...node(), buffer: null, start() {}, stop() {} });
  createBiquadFilter = () => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() });
  createStereoPanner = () => ({ ...node(), pan: param() });
  decodeAudioData = () => {
    decodes++;
    return Promise.resolve({});
  };
  resume = () => Promise.resolve();
  suspend = () => Promise.resolve();
}

type Handler = () => void;
const winHandlers = new Map<string, Handler[]>();
const docHandlers = new Map<string, Handler[]>();
const on = (m: Map<string, Handler[]>) => (type: string, fn: Handler) => m.set(type, [...(m.get(type) ?? []), fn]);
const fire = (m: Map<string, Handler[]>, type: string) => m.get(type)?.forEach((fn) => fn());
const doc = { hidden: false, addEventListener: on(docHandlers) };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeAudio.all = [];
  FakeAudio.blocked = false;
  decodes = 0;
  winHandlers.clear();
  docHandlers.clear();
  doc.hidden = false;
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('window', { addEventListener: on(winHandlers), setInterval, clearInterval });
  vi.stubGlobal('document', doc);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 소리 모듈을 새로 읽고 첫 입력으로 켠다 */
async function audio() {
  const m = await import('../src/render/audio');
  m.initAudio();
  fire(winHandlers, 'pointerdown');
  return m;
}
const name = (a: FakeAudio) => a.src.split('/').pop()?.replace(/\.\w+$/, '');

describe('배경음악 흘려 듣기', () => {
  it('곡을 빠르게 여러 번 바꿔도 마지막 곡만 소스를 붙들고 재생된다(앞 곡은 1.5초 뒤 놓아 준다)', async () => {
    const m = await audio();
    for (const mood of ['title', 'murim', 'boss', 'rift'] as const) m.playBgm(mood);
    await vi.advanceTimersByTimeAsync(2000);
    const held = FakeAudio.all.filter((a) => a.getAttribute('src'));
    expect(held.map(name)).toEqual(['rift']);
    expect(FakeAudio.all.filter((a) => !a.paused).map(name)).toEqual(['rift']);
    expect(m.currentBgm()).toBe('rift');
    // 곡 전체를 풀지 않는다
    expect(decodes).toBe(0);
  });

  it('같은 곡을 다시 부르면 새로 열지 않는다', async () => {
    const m = await audio();
    m.playBgm('murim');
    m.playBgm('murim');
    expect(FakeAudio.all.length).toBe(1);
  });

  it('탭을 숨기면 멈추고, 돌아오면 지금 곡만 다시 튼다(바뀌는 중이던 앞 곡은 되살리지 않는다)', async () => {
    const m = await audio();
    m.playBgm('title');
    await vi.advanceTimersByTimeAsync(10);
    m.playBgm('battle');
    doc.hidden = true;
    fire(docHandlers, 'visibilitychange');
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeAudio.all.filter((a) => !a.paused)).toEqual([]);
    doc.hidden = false;
    fire(docHandlers, 'visibilitychange');
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeAudio.all.filter((a) => !a.paused).map(name)).toEqual(['battle']);
  });

  it('숨긴 동안 곡이 바뀌면 바로 틀지 않고, 돌아올 때 그 곡을 튼다', async () => {
    const m = await audio();
    doc.hidden = true;
    fire(docHandlers, 'visibilitychange');
    m.playBgm('nocturna');
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeAudio.all.filter((a) => !a.paused)).toEqual([]);
    doc.hidden = false;
    fire(docHandlers, 'visibilitychange');
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeAudio.all.filter((a) => !a.paused).map(name)).toEqual(['nocturna']);
  });

  it('멈춤(null)이면 곡을 놓아 주고 아무것도 재생하지 않는다', async () => {
    const m = await audio();
    m.playBgm('elheim');
    await vi.advanceTimersByTimeAsync(10);
    m.playBgm(null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeAudio.all.filter((a) => !a.paused || a.getAttribute('src'))).toEqual([]);
  });

  it('브라우저가 재생을 막았으면 다음 입력 때 지금 곡을 다시 튼다', async () => {
    const m = await audio();
    FakeAudio.blocked = true;
    m.playBgm('ending');
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeAudio.all.filter((a) => !a.paused)).toEqual([]);
    FakeAudio.blocked = false;
    fire(winHandlers, 'keydown');
    await vi.advanceTimersByTimeAsync(10);
    expect(FakeAudio.all.filter((a) => !a.paused).map(name)).toEqual(['ending']);
  });
});

describe('이펙트별 효과음(2026-10-22)', () => {
  it('data/fx.json sounds가 쓰는 소리는 모두 합성할 수 있다(파일 없이 소리 마디를 만든다)', async () => {
    const m = await audio();
    const fx = (await import('../data/fx.json')).default as { sounds: Record<string, string>; cardPlay: { rarity: Record<string, string>; forge: Record<string, { sound: string }> } };
    // 카드를 낼 때의 등급 소리·대강화 쾅(2026-10-23)도 합성한다
    const cardPlay = [...Object.values(fx.cardPlay.rarity), ...Object.values(fx.cardPlay.forge).map((f) => f.sound)];
    for (const name of new Set([...Object.values(fx.sounds), ...cardPlay])) {
      if (name === 'power') continue; // 파일(assets/audio/sfx/power.ogg)이 있는 소리
      made = [];
      m.sfx(name as Parameters<typeof m.sfx>[0]);
      expect(made.length, name).toBeGreaterThan(0);
    }
  });
});
