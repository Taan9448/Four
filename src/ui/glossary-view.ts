// 도감 '용어' 탭(2026-10-12 C2): 내공·마나·균열·상흔·편성 점수… "이름 · 한 줄 정의 · 수치". 수치는 모두 데이터에서 읽는다(하드코딩 없음).
import type { GameData } from '../engine/data';
import { startRiftMaxText } from './map-view';
import { statusIconUrl } from './icons';
import { frameUrl } from '../render/assets';
import { h } from './dom';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const WORLD: Record<string, string> = { elheim: '엘하임', nocturna: '마왕성', murim: '무림', rift: '틈' };

export function glossaryTab(data: GameData): HTMLElement {
  const b = data.balance;
  const r = b.rift;
  const sc = r.scar;
  const manaRule = Object.entries(b.mana.worlds)
    .map(([w, m]) => `${WORLD[w] ?? w} ${m.battleStart === 'full' ? `가득·차례 +${m.perTurn}` : m.battleStart === 'carry' ? '이월·차지 않음' : `${m.battleStart}에서 시작·차례 +${m.perTurn}`}`)
    .join(' / ');
  const decay = Object.entries(r.decay).map(([w, n]) => `${WORLD[w] ?? w} -${n}`).join(' · ');
  const pts = Object.entries(b.loadout.points).filter(([k]) => k !== 'special').map(([k, v]) => `${({ common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' } as Record<string, string>)[k] ?? k} ${v}`).join(' · ');
  const st = (id: string) => data.statuses.get(id);
  // icon: 상태 아이콘(id) 또는 용어 아이콘 시트 icons_glossary의 칸 번호(2026-10-13)
  const rows: { name: string; def: string; num: string; icon: string | number }[] = [
    { name: '내공', def: '카드의 기본 비용. 차례마다 다시 찬다(이월 없음).', num: `차례마다 ${b.neigongPerTurn}`, icon: 1 },
    { name: '마나', def: '일행이 함께 쓰는 폭발 자원. 세계마다 차는 법이 다르다.', num: `최대 ${b.mana.max} — ${manaRule}`, icon: 2 },
    { name: '융합', def: '내공과 마나를 함께 쓰는 카드. 쓰면 하늘에 금이 간다(균열).', num: '균열 +(카드마다)', icon: 3 },
    { name: '균열', def: '융합으로 오르는 금. 차례 끝에 세계마다 아문다.', num: `0~${r.max} · 감쇠 ${decay} · ${r.echoThreshold} 이상이면 잔향`, icon: 4 },
    { name: '폭주', def: `균열이 ${r.max}에 닿으면 터진다.`, num: `일행 최대 체력 ${pct(r.surgeRatio)}(하운 +${r.surgeHaunExtra}) · 적 힘 +${r.surgeEnemyStrength} · 잔향 ${r.surgeEchoToHand}장 · 상흔 +${r.surgeScar} · 균열 ${r.surgeResetTo}으로`, icon: 5 },
    { name: '상흔', def: '전투가 끝나고 남은 균열·폭주가 쌓인 흔적.', num: `${sc.startRiftPer}마다 시작 균열 +1(${startRiftMaxText(data)}) · ${sc.restAt}+ 휴식 회복 -${pct(1 - sc.restHealMul)} · ${sc.shopAt}+ 상점 값 +${pct(sc.shopPriceMul - 1)}${r.map.scarCrackAt !== undefined ? ` · ${r.map.scarCrackAt}+ 새 지도가 갈라짐` : ''}`, icon: 6 },
    { name: '결 노출', def: st('grain')?.description ?? '결을 드러내 다음 공격을 크게.', num: `1스택 소모 · 피해 +${pct(b.grain.damageBonus)}${b.grain.ignoreBlock ? ' · 방어 무시' : ''} · 매듭은 ${b.grain.knotThreshold}스택`, icon: 'grain' },
    { name: '속성', def: '화염·냉기·번개. 약점이면 크게, 내성이면 작게 들어가고 상태도 붙지 않는다.', num: `약점 ×${b.elements.weakMultiplier} · 내성 ×${b.elements.resistMultiplier} · 화염↔냉기는 서로 지운다`, icon: 7 },
    { name: '냉기·빙결', def: st('chill')?.description ?? '냉기가 쌓이면 얼어붙는다.', num: `${b.elements.ice.threshold?.at}스택이면 빙결(보스 ${b.elements.ice.threshold?.bossAt}) · 줄지 않는다`, icon: 'chill' },
    { name: '감전·마비', def: st('shock')?.description ?? '감전이 쌓이면 마비된다.', num: `${b.elements.lightning.threshold?.at}스택이면 마비(보스 ${b.elements.lightning.threshold?.bossAt}) · 차례마다 ${st('shock')?.decay ?? 1} 가라앉음`, icon: 'shock' },
    { name: '전도', def: '냉기가 붙은 적에게 번개가 더 세게 들어간다. 냉기는 그대로 남는다.', num: `번개 피해 ×${b.elements.lightning.conduct?.multiplier ?? 1} · 빙결 중엔 감전, 마비 중엔 냉기가 쌓이지 않는다`, icon: 8 },
    { name: '치명타', def: '공격이 가끔 크게 들어간다(레벨로 오른다).', num: `기본 ${pct(b.crit.chance)} · ×${b.crit.multiplier}`, icon: 9 },
    { name: '심법', def: '한 번 쓰면 소멸하고, 지속 효과가 전투가 끝날 때까지 남는 카드.', num: '파워 카드', icon: 10 },
    { name: '편성 점수', def: '동료마다 덱에 넣는 카드의 등급 합. 상한을 넘을 수 없다.', num: `${pts} · 상한 ${b.loadout.cap.perCharacter}(공용 ${b.loadout.cap.common}) · 같은 갈래 ${b.loadout.focusMin}장이면 갈래 보너스`, icon: 11 },
    { name: '裂 틈새', def: '폭주가 연 자리. 틈의 짐승(엘리트+접사) 또는 틈새의 거래(감소 카드·봉인 유물).', num: `지도마다 최대 ${r.map.maxCracks}곳 · 짐승일 확률 ${pct(r.map.beastChance)}`, icon: 12 },
    { name: '순례 보상', def: '각 스테이지를 처음 다시 넘길 때 한 번만 보유 카드에 영구로 남는다. 그 뒤 보상은 그 길에서만.', num: '스테이지당 한 번', icon: 13 },
    { name: '심연 카드', def: '심연에서 얻은 카드는 도감에만 기록되고 보유 카드로 돌아가지 않는다. 틈의 카드는 심연에서만.', num: `숙적 ${b.abyss.nemesisEvery}굽이마다`, icon: 14 },
  ];
  // 아이콘은 모든 줄의 그림이 있을 때만 그린다(몇 줄만 아이콘이 붙어 섞여 보이지 않게, 2026-10-13)
  const urls = rows.map((x) => (typeof x.icon === 'number' ? frameUrl('icons_glossary', x.icon, { realOnly: true }) : statusIconUrl(data, x.icon)));
  const icons = urls.every(Boolean) ? urls : rows.map(() => null);
  return h(
    'div',
    { class: 'glossary' },
    h('h3', {}, '용어'),
    h(
      'table',
      { class: 'glossary-table' },
      h('thead', {}, h('tr', {}, h('th', {}, '이름'), h('th', {}, '뜻'), h('th', {}, '수치'))),
      h(
        'tbody',
        {},
        rows.map((x, i) => h('tr', {}, h('th', { scope: 'row' }, icons[i] ? h('img', { class: 'glossary-icon', src: icons[i]!, alt: '' }) : null, x.name), h('td', {}, x.def), h('td', { class: 'glossary-num' }, x.num))),
      ),
    ),
  );
}
