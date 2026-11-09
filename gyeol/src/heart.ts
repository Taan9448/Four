// 「결」 위기 심장 소리(2026-11-09): 낮은 두 번 울림. 「천외귀환」 효과음에 없어서 여기서만 합성한다.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

function thump(c: AudioContext, at: number, gain: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(70, at);
  o.frequency.exponentialRampToValueAtTime(38, at + 0.16);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + 0.22);
}

/** 두근(lub-dub) 한 번 */
export function heartbeat(volume = 0.5): void {
  const c = audio();
  if (!c) return;
  const now = c.currentTime;
  thump(c, now, volume);
  thump(c, now + 0.17, volume * 0.7);
}
