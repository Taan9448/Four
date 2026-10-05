// tools/preview.html: 에셋 하나를 SpritePlayer로 재생해 본다(이벤트 프레임 표시 포함).
import { allSpriteIds, loadSprite, spriteSource } from './assets';
import { SpritePlayer } from './sprite-player';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const ids = allSpriteIds();

const select = document.createElement('select');
select.size = Math.min(16, ids.length);
for (const id of ids) select.add(new Option(`${id} (${spriteSource(id) === 'sprites' ? '실제' : '임시'})`, id));
select.value = params.get('id') ?? ids[0] ?? '';

const canvas = document.createElement('canvas');
const stage = document.createElement('div');
stage.className = 'preview-stage';
stage.append(canvas);
const meta = document.createElement('pre');
meta.className = 'preview-meta';
const log = document.createElement('div');
log.className = 'hint';

const left = document.createElement('div');
left.append(select, meta);
const right = document.createElement('div');
right.append(stage, log);
const wrap = document.createElement('div');
wrap.className = 'preview';
wrap.append(left, right);
const title = document.createElement('h2');
title.textContent = '에셋 미리보기';
app.append(title, wrap);

const player = new SpritePlayer(canvas);

async function show(id: string) {
  const url = new URL(location.href);
  url.searchParams.set('id', id);
  history.replaceState(null, '', url);
  const asset = await loadSprite(id);
  meta.textContent = asset ? JSON.stringify(asset.meta, null, 2) : '에셋 없음';
  log.textContent = '';
  // 반복 재생: 1회 애니메이션도 끝나면 잠시 쉬고 다시 재생
  const loopOnce = async () => {
    await player.play(id, { loop: false, onEvent: (name) => (log.textContent = `이벤트: ${name} @ ${new Date().toLocaleTimeString()}`) });
    if (select.value === id) setTimeout(loopOnce, 400);
  };
  if (asset?.meta.loop) void player.play(id, { loop: true });
  else void loopOnce();
}

select.addEventListener('change', () => void show(select.value));
if (select.value) void show(select.value);
