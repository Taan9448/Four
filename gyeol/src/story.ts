// 「결」 이야기(2026-11-10 3단계, 설계 7-2절): 운곡루 회상 — 장 고르기 → 장면 → 대결 → 장면 → 장 결과(별 셋).
// 장·대결·장면은 gyeol/data/story.json. 대결 화면은 main.ts의 play를 nav로 부른다.
import storyRaw from '../data/story.json';
import { button, el, rankBadge } from './dom';
import { duelGrade, type Duel, type DuelData, type DuelOptions, type DuelRank } from './duel';
import { loadSave, writeSave } from './save';
import { setKeys, type Nav } from './screens';
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
  challenge?: { type: 'noHitsInBout' | 'noRedHits' | 'clashWin'; bout?: number; text: string };
  unlockText?: string;
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
}

const summarize = (d: Duel): BoutResult => ({ rank: duelGrade(d)?.rank ?? null, hits: d.stats.hits, redHits: d.stats.redHits, clashWins: d.stats.clashWins });

/** 장 결과의 별 셋: 장을 마침 · 모든 대결 A 이상 · 도전 과제 */
export function chapterStars(ch: Chapter, results: BoutResult[]): { met: boolean; text: string }[] {
  const c = ch.challenge;
  let challenge = false;
  if (c?.type === 'noHitsInBout') challenge = (results[c.bout ?? 0]?.hits ?? 1) === 0;
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

export function renderStory(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const cards = story.chapters.map((ch, i) => {
    const open = chapterOpen(i, save.story.cleared);
    const cleared = save.story.cleared.includes(ch.id);
    const got = save.story.stars[ch.id] ?? 0;
    const b = button(
      [
        el('span', { class: 'ch-no' }, ch.no === 0 ? '序' : String(ch.no)),
        el('span', { class: 'ch-text' }, el('b', {}, `${ch.title} · ${ch.subtitle}`), el('small', {}, ch.recall)),
        el('span', { class: 'ch-state' }, ch.tutorial ? (cleared ? '마침' : '튜토리얼') : cleared ? stars(got) : open ? '새 장' : '🔒'),
      ],
      `chapter${cleared ? ' cleared' : ''}`,
      () => void runChapter(app, nav, data, ch),
      open ? {} : { disabled: '' },
    );
    return el('li', {}, b);
  });
  const later = story.upcoming.map((u) => el('li', {}, el('div', { class: 'chapter upcoming' }, el('span', { class: 'ch-no' }, String(u.no)), el('span', { class: 'ch-text' }, el('b', {}, `${u.no}장 · ${u.subtitle}`), el('small', {}, '다음 단계에서 열린다')), el('span', { class: 'ch-state' }, '🔒'))));
  const head = el(
    'header',
    { class: 'screen-head' },
    button(['‹ 로비'], 'btn back-lobby', () => nav.go('lobby')),
    el('div', {}, el('h1', {}, '이야기'), el('p', { class: 'sub' }, '운곡루의 밤 — 왕일검에게 놓는 연습을 배우며, 지나온 싸움을 하나씩 떠올린다.')),
  );
  app.replaceChildren(el('section', { class: 'screen story' }, head, el('ol', { class: 'chapters' }, ...cards, ...later)));
  setKeys((e) => e.key === 'Escape' && nav.go('lobby'));
  (app.querySelector('.chapter:not([disabled]):not(.cleared)') as HTMLButtonElement | null)?.focus();
}

/* ───────── 장 하나 ───────── */

export async function runChapter(app: HTMLElement, nav: Nav, data: DuelData, ch: Chapter): Promise<void> {
  setKeys(null);
  const label = `${ch.title} · ${ch.subtitle}`;
  await playScene(document.body, ch.intro, story.speakers, ch.bg, label);
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
    await playScene(document.body, bout.intro ?? [], story.speakers, foe.bg);
    const last = i + 1 >= bouts.length;
    nav.play(foe, 'duel', {
      back: 'story',
      title: `${label} · ${i + 1}/${bouts.length}`,
      duel: { ...ch.rules, survive: bout.survive },
      tips: ch.tips,
      next: {
        label: last ? '장 마치기' : '다음',
        go: async (d) => {
          results[i] = summarize(d);
          await playScene(document.body, bout.outro ?? [], story.speakers, foe.bg);
          if (!last) void runBout(i + 1);
          else {
            await playScene(document.body, ch.outro, story.speakers, ch.bg);
            complete(ch, results);
            showResult(app, nav, data, ch, results);
          }
        },
      },
    });
  };
  await runBout(0);
}

function complete(ch: Chapter, results: BoutResult[]): void {
  const save = loadSave();
  if (!save.story.cleared.includes(ch.id)) save.story.cleared.push(ch.id);
  if (!ch.tutorial) {
    const got = chapterStars(ch, results).filter((s) => s.met).length;
    save.story.stars[ch.id] = Math.max(save.story.stars[ch.id] ?? 0, got);
  }
  writeSave(save);
}

function showResult(app: HTMLElement, nav: Nav, data: DuelData, ch: Chapter, results: BoutResult[]): void {
  nav.stop();
  const i = story.chapters.indexOf(ch);
  const next = story.chapters[i + 1];
  const rows = ch.tutorial ? [] : chapterStars(ch, results);
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
      el('div', { class: 'row' }, toNext ?? '', button('이야기 목록', 'btn', () => nav.go('story'))),
    ),
  );
  setKeys((e) => {
    if (e.key === 'Enter' && toNext) toNext.click();
    else if (e.key === 'Escape') nav.go('story');
  });
  (toNext ?? (app.querySelector('.btn') as HTMLButtonElement | null))?.focus();
}
