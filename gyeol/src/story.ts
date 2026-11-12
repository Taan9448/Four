// 「결」 이야기(2026-11-10 3단계, 설계 7-2절): 운곡루 회상 — 장 고르기 → 장면 → 대결 → 장면 → 장 결과(별 셋).
// 장·대결·장면은 gyeol/data/story.json. 대결 화면은 main.ts의 play를 nav로 부른다.
import storyRaw from '../data/story.json';
import { frameUrl } from '../../src/render/assets';
import { button, el, rankBadge } from './dom';
import { duelGrade, rhythmScore, type Duel, type DuelData, type DuelOptions, type DuelRank } from './duel';
import { setDuck, setMusic } from './music';
import { loadSave, writeSave } from './save';
import { announceAchievements, charPicker, setKeys, type Nav } from './screens';
import { chosen, HAUN, partyOpen } from './party';
import { playScene, type SceneLine, type Speaker } from './vn';

export interface TutorialStep {
  id: string;
  title: string;
  say: string;
  goal: { type: 'resolved' | 'block' | 'parry' | 'counter' | 'deathblow' | 'mikiri' | 'feintParry' | 'win'; count?: number };
  goalText: string;
  /** 이 단계에서 철목인이 쓰는 공격 패턴(없으면 철목인 기본 패턴) */
  drill: { weight: number; steps: { move: string; after?: number }[] }[] | null;
  assist: { slow?: number; earlyCue?: boolean; window?: boolean; labels?: boolean };
  hint?: 'parry' | 'attack' | 'dodge';
  final?: boolean;
}

interface Bout {
  foe: string;
  survive?: number;
  /** 이 대결만의 특수 규칙(쪼개지 않기·베지 않는다·붉은 장력·운해귀종으로만) */
  duel?: Pick<DuelOptions, 'fragile' | 'finish' | 'staggerWin' | 'veil' | 'noLose'>;
  /** 박자 도전 방식(에필로그 장작 패기) */
  mode?: 'rhythm';
  /** 장 안에서 고른 flag가 있으면 덧붙이는 규칙·장면(6장 바르가스의 열쇠) */
  ifFlag?: { flag: string; duel?: Pick<DuelOptions, 'foeDamageMul'>; intro?: SceneLine[] };
  intro?: SceneLine[];
  outro?: SceneLine[];
}

export interface Chapter {
  id: string;
  no: number;
  title: string;
  subtitle: string;
  recall: string;
  bg: string;
  intro: SceneLine[];
  outro: SceneLine[];
  tutorial?: TutorialStep[];
  bouts?: Bout[];
  rules?: Pick<DuelOptions, 'techs' | 'focus' | 'clash'>;
  tips?: string[];
  challenge?: { type: 'noHitsInBout' | 'noRedHits' | 'clashWin' | 'noCrack' | 'flagNot' | 'maxStreak'; bout?: number; flag?: string; n?: number; text: string };
  unlockText?: string;
  /** 고른 flag(지난 장까지 저장된 것 포함)가 있으면 장 끝 장면을 이것으로 바꾼다 */
  outroIf?: { flag: string; lines: SceneLine[] };
  /** 결과 화면 머리글 대신(에필로그) */
  ending?: string[];
  /** 이 장은 진하운만(합류 전 · 운해귀종으로 끝내는 9장 · 에필로그) */
  haunOnly?: boolean;
  /** 이야기 지도에서의 자리(journey_band 그림 기준 %)와 땅 이름 */
  map?: { x: number; y: number; place: string };
}

export interface StoryData {
  speakers: Record<string, Speaker>;
  chapters: Chapter[];
  upcoming: { no: number; subtitle: string }[];
  tips: Record<string, { key: string; text: string }>;
}

export const story = storyRaw as unknown as StoryData;

/** 장이 열려 있나: 서장은 늘, 그다음은 앞 장을 마쳐야 */
export function chapterOpen(i: number, cleared: string[]): boolean {
  return i === 0 || cleared.includes(story.chapters[i - 1].id);
}

interface BoutResult {
  rank: DuelRank | null;
  hits: number;
  redHits: number;
  clashWins: number;
  cracks: number;
  maxStreak: number;
}

const summarize = (d: Duel): BoutResult => ({ rank: d.mode === 'rhythm' ? rhythmScore(d).rank : (duelGrade(d)?.rank ?? null), hits: d.stats.hits, redHits: d.stats.redHits, clashWins: d.stats.clashWins, cracks: d.cracks, maxStreak: d.stats.maxStreak });

/** 장 결과의 별 셋: 장을 마침 · 모든 대결 A 이상 · 도전 과제 */
export function chapterStars(ch: Chapter, results: BoutResult[], flags: string[] = []): { met: boolean; text: string }[] {
  const c = ch.challenge;
  let challenge = false;
  if (c?.type === 'noCrack') challenge = results.length > 0 && results.every((r) => r.cracks === 0);
  else if (c?.type === 'flagNot') challenge = !flags.includes(c.flag ?? '');
  else if (c?.type === 'maxStreak') challenge = (c.bout !== undefined ? [results[c.bout]] : results).some((r) => (r?.maxStreak ?? 0) >= (c.n ?? 10));
  if (challenge) {
    /* 위에서 정했다 */
  } else if (c?.type === 'noHitsInBout') challenge = (results[c.bout ?? 0]?.hits ?? 1) === 0;
  else if (c?.type === 'noRedHits') challenge = results.every((r) => r.redHits === 0);
  else if (c?.type === 'clashWin') challenge = results.some((r) => r.clashWins > 0);
  return [
    { met: true, text: '장을 마쳤다' },
    { met: results.length > 0 && results.every((r) => r.rank === 'S' || r.rank === 'A'), text: '모든 대결 A 등급 이상' },
    { met: challenge, text: c?.text ?? '' },
  ];
}

const stars = (n: number, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));

/* ───────── 장 고르기 ───────── */

/** 이야기 지도에서 고른 장(다시 들어오면 그 장을 다시 고른다) */
let pickedChapter: string | null = null;

/**
 * 이야기 지도(2026-11-11 사용자 요청 — 「천외귀환」처럼 목록 대신 지도): 「천외귀환」 여정 띠 그림(journey_band) 위에 장마다 인장을 찍고
 * 지나온 길은 붉은 먹, 남은 길은 옅은 점선으로 잇는다. 인장을 누르면 아래 두루마리 쪽지에 그 장(제목·회상·별·도전)과 「들어가기」.
 * 그림이 아직 없으면 같은 자리에 빛바랜 종이 바탕만 깐다. ←→로 장을 옮기고 Enter로 들어간다
 */
export function renderStory(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const chs = story.chapters;
  const openAt = (i: number) => chapterOpen(i, save.story.cleared);
  const isCleared = (i: number) => save.story.cleared.includes(chs[i].id);
  // 처음 고를 장: 지난번 고른 장, 없으면 아직 안 깬 열린 장 중 첫째, 다 깼으면 마지막
  let cur = chs.findIndex((c) => c.id === pickedChapter);
  if (cur < 0 || !openAt(cur)) cur = chs.findIndex((_, i) => openAt(i) && !isCleared(i));
  if (cur < 0) cur = chs.length - 1;
  const art = frameUrl('journey_band', 1, { realOnly: true });
  // 지도는 그림의 20~95% 높이만 보인다(위아래 빈 종이를 자름, CSS .story-map 2:1) — 장 자리(그림 기준 %)를 보이는 칸 기준으로 옮긴다
  const CROP_TOP = 20;
  const CROP_H = 75;
  const pos = (i: number) => {
    const m = chs[i].map ?? { x: 6 + (88 * i) / Math.max(1, chs.length - 1), y: 55, place: '' };
    return { ...m, y: ((m.y - CROP_TOP) / CROP_H) * 100 };
  };

  // 길: 장 순서대로 잇는 선(지나온 구간은 붉은 먹)
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'story-path');
  svg.setAttribute('viewBox', '0 0 200 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  for (let i = 1; i < chs.length; i++) {
    const a = pos(i - 1);
    const b = pos(i);
    const line = document.createElementNS(NS, 'path');
    // 살짝 휘어진 붓길
    const mx = ((a.x + b.x) / 2) * 2;
    const my = (a.y + b.y) / 2 - 8;
    line.setAttribute('d', `M ${a.x * 2} ${a.y} Q ${mx} ${my} ${b.x * 2} ${b.y}`);
    line.setAttribute('class', isCleared(i - 1) && openAt(i) ? (isCleared(i) ? 'walked' : 'walked next') : 'ahead');
    svg.append(line);
  }

  const card = el('div', { class: 'story-card' });
  const pins: HTMLButtonElement[] = [];
  const select = (i: number, focus = false) => {
    cur = i;
    pickedChapter = chs[i].id;
    pins.forEach((p, j) => p.classList.toggle('picked', j === i));
    if (focus) pins[i]?.focus();
    const ch = chs[i];
    const open = openAt(i);
    const cleared = isCleared(i);
    const got = save.story.stars[ch.id] ?? 0;
    const go = button([el('b', {}, cleared ? '다시 들어가기' : '들어가기'), el('small', {}, 'Enter')], 'res-btn primary', () => void runChapter(app, nav, data, ch), open ? {} : { disabled: '' });
    card.replaceChildren(
      el('div', { class: 'sc-seal', 'aria-hidden': 'true' }, sealOf(ch)),
      el(
        'div',
        { class: 'sc-text' },
        el('p', { class: 'sc-place' }, ch.map?.place ?? ''),
        el('h2', {}, `${ch.title} · ${ch.subtitle}`),
        el('p', { class: 'sc-recall' }, open ? ch.recall : '앞 장을 마치면 열린다.'),
        el(
          'p',
          { class: 'sc-meta' },
          ch.tutorial ? el('span', {}, cleared ? '튜토리얼 · 마침' : '튜토리얼') : el('span', { class: 'sc-stars' }, stars(got)),
          ch.bouts?.length ? el('span', {}, `대결 ${ch.bouts.length}`) : '',
          ch.challenge && open ? el('span', { class: 'sc-chal' }, `☆ ${ch.challenge.text}`) : '',
        ),
      ),
      el('div', { class: 'sc-go' }, go),
      // 동료가 합류했으면 들어갈 인물을 고른다(진하운만인 장은 안내만)
      open && !ch.tutorial && partyOpen(data, save.story.cleared)
        ? ch.haunOnly
          ? el('p', { class: 'sc-solo' }, '이 장은 진하운 혼자 들어간다.')
          : el('div', { class: 'sc-party' }, charPicker(data, () => renderStory(app, nav, data), true))
        : '',
    );
  };
  chs.forEach((ch, i) => {
    const p = pos(i);
    const open = openAt(i);
    const cleared = isCleared(i);
    const got = save.story.stars[ch.id] ?? 0;
    const state = cleared ? 'cleared' : open ? 'open' : 'locked';
    const pin = button(
      [el('span', { class: 'pin-seal' }, sealOf(ch)), el('span', { class: 'pin-name' }, ch.map?.place || ch.subtitle), cleared && !ch.tutorial ? el('span', { class: 'pin-stars' }, stars(got)) : ''],
      `story-pin ${state}`,
      () => (cur === i && open ? void runChapter(app, nav, data, ch) : select(i)),
      { style: `left:${p.x}%;top:${p.y}%`, 'aria-label': `${ch.title} ${ch.subtitle}${open ? '' : ' (잠김)'}` },
    ) as HTMLButtonElement;
    pins.push(pin);
  });
  const head = el(
    'header',
    { class: 'screen-head' },
    button(['‹ 로비'], 'btn back-lobby', () => nav.go('lobby')),
    el('div', {}, el('h1', {}, '이야기'), el('p', { class: 'sub' }, '운곡루의 밤 — 지나온 싸움을 하나씩 떠올린다.')),
  );
  const map = el('div', { class: `story-map${art ? ' has-art' : ''}`, style: art ? `background-image:url("${art}")` : '' }, svg, ...pins);
  app.replaceChildren(el('section', { class: 'screen story story-screen' }, head, el('div', { class: 'story-frame' }, map, card)));
  select(cur, true);
  setKeys((e) => {
    if (e.key === 'Escape') nav.go('lobby');
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (cur + 1 < chs.length && openAt(cur + 1)) select(cur + 1, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (cur > 0) select(cur - 1, true);
    }
    // Enter: 초점이 간 인장을 누른 것과 같다(고른 장이면 들어간다)
  });
}

/** 장 인장 글자(2026-11-11 한글로): 서장 '서', 에필로그 '끝', 그 밖은 장 번호 */
const HAN_NO = ['서', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
function sealOf(ch: Chapter): string {
  return ch.id === 'epilogue' ? '끝' : (HAN_NO[ch.no] ?? String(ch.no));
}

/* ───────── 장 하나 ───────── */

export async function runChapter(app: HTMLElement, nav: Nav, data: DuelData, ch: Chapter): Promise<void> {
  setKeys(null);
  dataRef = data;
  const label = `${ch.title} · ${ch.subtitle}`;
  // 장면 곡: 대결 사이 장면은 여정 곡(에필로그는 새벽 곡) — 대결이 시작되면 main.ts가 대결 곡으로 바꾼다
  const calm = () => {
    setMusic(ch.id === 'epilogue' ? 'epilogue' : 'journey');
    setDuck(false);
  };
  calm();
  /** 이 장에서 고른 것 + 지난 장까지 저장된 것 */
  const flags = new Set<string>(loadSave().story.flags);
  const pick = (got: string[]) => got.forEach((f) => flags.add(f));
  pick(await playScene(document.body, ch.intro, story.speakers, ch.bg, label));
  if (ch.tutorial) {
    const dummy = data.foes.find((f) => f.practice);
    if (!dummy) return;
    nav.play(dummy, 'practice', {
      back: 'story',
      title: label,
      // 서장: 기술·집중·겨루기는 아직 배우지 않았다(1~3장에서 처음 나오는 순간 안내)
      duel: { techs: [], focus: false, clash: false },
      tutorial: ch.tutorial,
      onTutorialDone: async (skipped) => {
        if (!skipped) await playScene(document.body, ch.outro, story.speakers, ch.bg);
        complete(ch, []);
        showResult(app, nav, data, ch, []);
      },
    });
    return;
  }
  const bouts = ch.bouts ?? [];
  const results: BoutResult[] = [];
  const runBout = async (i: number) => {
    const bout = bouts[i];
    const foe = data.foes.find((f) => f.id === bout.foe);
    if (!foe) throw new Error(`이야기 상대가 없다: ${bout.foe}`);
    pick(await playScene(document.body, bout.intro ?? [], story.speakers, foe.bg));
    const flagged = bout.ifFlag && flags.has(bout.ifFlag.flag) ? bout.ifFlag : null;
    if (flagged?.intro) pick(await playScene(document.body, flagged.intro, story.speakers, foe.bg));
    const last = i + 1 >= bouts.length;
    const sv = loadSave();
    nav.play(foe, bout.mode ?? 'duel', {
      character: ch.haunOnly ? HAUN : chosen(data, sv.character, sv.story.cleared),
      back: 'story',
      title: `${label} · ${i + 1}/${bouts.length}`,
      duel: { ...ch.rules, survive: bout.survive, ...bout.duel, ...flagged?.duel },
      tips: ch.tips,
      next: {
        label: last ? '장 마치기' : '다음',
        go: async (d) => {
          results[i] = summarize(d);
          calm();
          pick(await playScene(document.body, bout.outro ?? [], story.speakers, foe.bg));
          if (!last) void runBout(i + 1);
          else {
            const alt = ch.outroIf && flags.has(ch.outroIf.flag) ? ch.outroIf.lines : ch.outro;
            await playScene(document.body, alt, story.speakers, ch.bg);
            complete(ch, results, [...flags]);
            showResult(app, nav, data, ch, results, [...flags]);
          }
        },
      },
    });
  };
  await runBout(0);
}

function complete(ch: Chapter, results: BoutResult[], flags: string[] = []): void {
  const save = loadSave();
  if (!save.story.cleared.includes(ch.id)) save.story.cleared.push(ch.id);
  // 고른 것은 다음 장(에필로그 대사)까지 남는다 — 같은 장을 다시 하면 그 장의 선택을 새로 쓴다
  const mine = new Set([...(ch.bouts ?? []).map((b) => b.ifFlag?.flag), ch.outroIf?.flag, ch.challenge?.flag].filter((x): x is string => !!x));
  save.story.flags = [...new Set([...save.story.flags.filter((f) => !mine.has(f)), ...flags])];
  if (!ch.tutorial) {
    const got = chapterStars(ch, results, flags).filter((s) => s.met).length;
    save.story.stars[ch.id] = Math.max(save.story.stars[ch.id] ?? 0, got);
  }
  writeSave(save);
  announceAchievements(dataRef ?? { foes: [] } as unknown as DuelData);
}

/** 업적 판정에 쓰는 대결 데이터(runChapter가 넣는다) */
let dataRef: DuelData | null = null;

function showResult(app: HTMLElement, nav: Nav, data: DuelData, ch: Chapter, results: BoutResult[], flags: string[] = []): void {
  nav.stop();
  const i = story.chapters.indexOf(ch);
  const next = story.chapters[i + 1];
  const rows = ch.tutorial ? [] : chapterStars(ch, results, flags);
  const got = rows.filter((r) => r.met).length;
  const toNext = next ? button(`${next.title} · ${next.subtitle}`, 'btn primary big', () => void runChapter(app, nav, data, next)) : null;
  app.replaceChildren(
    el(
      'section',
      { class: 'screen chapter-result' },
      el('p', { class: 'kicker' }, ch.recall),
      el('h1', {}, `${ch.title} · ${ch.subtitle}`),
      ch.tutorial ? el('p', { class: 'big-note' }, '서장을 마쳤다. 이제 지나온 싸움을 떠올릴 차례다.') : el('p', { class: 'stars' }, stars(got)),
      rows.length ? el('ul', { class: 'star-rows' }, ...rows.map((r) => el('li', { class: r.met ? 'met' : '' }, `${r.met ? '★' : '☆'} ${r.text}`))) : '',
      results.length ? el('div', { class: 'bout-ranks' }, ...results.map((r, k) => el('span', {}, el('small', {}, `${k + 1}번째`), rankBadge(r.rank ?? undefined)))) : '',
      ch.unlockText ? el('p', { class: 'unlock' }, `열림 — ${ch.unlockText}`) : '',
      ch.ending ? el('div', { class: 'credits' }, ...ch.ending.map((l) => el('p', {}, l))) : '',
      el('div', { class: 'row' }, toNext ?? '', button('이야기 목록', 'btn', () => nav.go('story'))),
    ),
  );
  setKeys((e) => {
    if (e.key === 'Enter' && toNext) toNext.click();
    else if (e.key === 'Escape') nav.go('story');
  });
  (toNext ?? (app.querySelector('.btn') as HTMLButtonElement | null))?.focus();
}
