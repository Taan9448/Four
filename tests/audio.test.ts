// 배경음악 수명(2026-10-15 렉 줄이기): 곡 파일은 <audio>로 흘려 듣고, 바뀐 앞 곡은 1.5초 뒤 소스를 비워 놓아 준다.
// 빠르게 여러 번 바꿔도 마지막 곡만 남고, 탭을 숨기면 멈췄다가 돌아오면 지금 곡만 다시 튼다. 곡 전체를 decodeAudioData로 풀지 않는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static all: FakeAudio[] = [];
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
    if (!this.src) return Promise.reject(new Error('no source'));
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
});
