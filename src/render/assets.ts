// 에셋 조회. assets/manifest.json(빌드 때 생성)이 id마다 실제 스프라이트 또는 임시 시트를 가리킨다.
import manifest from '../../assets/manifest.json';

export interface SpriteMeta {
  id: string;
  type: string;
  frameW: number;
  frameH: number;
  frames: number;
  fps: number;
  loop: boolean;
  anchor: [number, number];
  /** 이벤트 이름 → 프레임 번호(1부터) */
  events: Record<string, number>;
  blend: 'normal' | 'lighter';
  facing?: 'left' | 'right';
  fallbackLevel: number;
  virtualFrames?: number;
  placeholder?: boolean;
}

export interface SpriteAsset {
  id: string;
  source: 'sprites' | 'placeholders';
  meta: SpriteMeta;
  images: CanvasImageSource[];
}

interface ManifestEntry {
  source: 'sprites' | 'placeholders';
  dir: string;
  meta: SpriteMeta;
}

// manifest.json은 빌드 때 생성되므로 JSON 추론 타입 대신 명시한 타입으로 읽는다
const entries = (manifest as unknown as { assets: Record<string, ManifestEntry> }).assets;

// 프레임 PNG는 Vite가 처리해 URL을 준다(빌드 시 해시가 붙음)
const frameUrls = import.meta.glob('../../assets/{sprites,placeholders}/*/frame_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const cache = new Map<string, Promise<SpriteAsset | null>>();

export function hasSprite(id: string): boolean {
  return id in entries;
}

export function spriteSource(id: string): 'sprites' | 'placeholders' | null {
  return entries[id]?.source ?? null;
}

export function loadSprite(id: string | null | undefined): Promise<SpriteAsset | null> {
  if (!id) return Promise.resolve(null);
  let p = cache.get(id);
  if (!p) {
    p = (async () => {
      const entry = entries[id];
      if (!entry) return null;
      const urls = Array.from({ length: entry.meta.frames }, (_, i) => {
        const key = `../../${entry.dir}/frame_${String(i + 1).padStart(2, '0')}.png`;
        return frameUrls[key];
      });
      if (urls.some((u) => !u)) return null;
      const images = await Promise.all(
        urls.map(
          (url) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = url;
            }),
        ),
      );
      return {
        id,
        source: entry.source,
        meta: entry.meta,
        images: entry.meta.blend === 'lighter' ? images.map(lightToAlpha) : images,
      };
    })().catch(() => null);
    cache.set(id, p);
  }
  return p;
}

export function allSpriteIds(): string[] {
  return Object.keys(entries).sort();
}

/**
 * 가산 합성용 이펙트(검정 배경)를 '밝기 = 불투명도'인 투명 이미지로 바꾼다.
 * DOM 위에서는 캔버스의 가산 합성이 배경까지 닿지 않으므로, 이렇게 바꿔 일반 합성으로 비슷하게 보이게 한다.
 */
function lightToAlpha(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = Math.max(d[i], d[i + 1], d[i + 2]);
    if (a === 0) {
      d[i + 3] = 0;
      continue;
    }
    d[i] = Math.round((d[i] / a) * 255);
    d[i + 1] = Math.round((d[i + 1] / a) * 255);
    d[i + 2] = Math.round((d[i + 2] / a) * 255);
    d[i + 3] = Math.round((a * d[i + 3]) / 255);
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/**
 * 프레임 한 장의 URL(CSS 배경·img용). realOnly면 Codex가 납품한 실제 그림만(임시 시트는 null).
 * 화면 그림(전투 배경·지도·시작 화면·아이콘)은 실제 그림이 들어온 것만 쓰고, 그 전에는 CSS가 대신한다.
 */
export function frameUrl(id: string | null | undefined, frame = 1, { realOnly = false } = {}): string | null {
  const entry = id ? entries[id] : undefined;
  if (!entry || (realOnly && entry.source !== 'sprites') || frame < 1 || frame > entry.meta.frames) return null;
  return frameUrls[`../../${entry.dir}/frame_${String(frame).padStart(2, '0')}.png`] ?? null;
}
