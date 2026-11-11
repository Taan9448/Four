// 「결」 이야기(2026-11-10 3단계, 설계 7-2절): 운곡루 회상 — 장 고르기 → 장면 → 대결 → 장면 → 장 결과(별 셋).
// 장·대결·장면은 gyeol/data/story.json. 대결 화면은 main.ts의 play를 nav로 부른다.
import storyRaw from '../data/story.json';
import { button, el, rankBadge } from './dom';
import { duelGrade, rhythmScore, type Duel, type DuelData, type DuelOptions, type DuelRank } from './duel';
import { loadSave, writeSave } from './save';
import { announceAchievements, setKeys, type Nav } from './screens';
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

export function renderStory(app: HTMLElement, nav: Nav, data: DuelData): void {
  const save = loadSave();
  const cards = story.chapters.map((ch, i) => {
    const open = chapterOpen(i, save.story.cleared);
    const cleared = save.story.cleared.includes(ch.id);
    const got = save.story.stars[ch.id] ?? 0;
    const b = button(
      [
        el('span', { class: 'ch-no' }, ch.no === 0 ? '序' : ch.id === 'epilogue' ? '終' : String(ch.no)),
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
  dataRef = data;
  const label = `${ch.title} · ${ch.subtitle}`;
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
    nav.play(foe, bout.mode ?? 'duel', {
      back: 'story',
      title: `${label} · ${i + 1}/${bouts.length}`,
      duel: { ...ch.rules, survive: bout.survive, ...bout.duel, ...flagged?.duel },
      tips: ch.tips,
      next: {
        label: last ? '장 마치기' : '다음',
        go: async (d) => {
          results[i] = summarize(d);
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
