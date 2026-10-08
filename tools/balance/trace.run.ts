// npm run balance:trace — 봇이 전투 하나를 어떻게 두는지 턴마다 적는다(밸런스 원인 찾기용).
// 환경 변수: TRACE=<스테이지>:<모듈 id>(기본 s8:s8_boss_blood_hall), TRACE_SEED(기본 T1), TRACE_OUT(파일 경로, 없으면 화면),
// TRACE_LEAVE=born,kyle(그 동료를 빼고 — S9 보스는 하운+엘리아)
// 그 스테이지 시작 상태(createRunAt: 앞 스테이지의 스토리 카드·동료만, 보상·강화 없음)에서 바로 그 전투를 둔다.
import { appendFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createBattle, describeIntent } from '../../src/engine/battle';
import { gameData } from '../../src/engine/data';
import { applyRunOps, battleSetupFor, createRunAt } from '../../src/engine/run';
import { playTurn } from '../../src/sim/bot';

const OUT = process.env.TRACE_OUT;
const log = (line: string) => (OUT ? appendFileSync(OUT, line + '\n') : process.stderr.write(line + '\n'));

it('봇 전투 기록', () => {
  if (OUT) writeFileSync(OUT, '');
  const data = gameData();
  const [stage, moduleId] = (process.env.TRACE ?? 's8:s8_boss_blood_hall').split(':');
  const run = createRunAt(data, process.env.TRACE_SEED ?? 'T1', stage);
  for (const member of (process.env.TRACE_LEAVE ?? '').split(',').filter(Boolean)) applyRunOps(data, run, [{ op: 'leave_party', member }]);
  const module = data.modules.get(moduleId);
  if (!module?.content.enemies?.length) throw new Error(`전투 모듈이 아니다: ${moduleId}`);
  log(`출전 ${run.selected.join(', ')} · 덱 ${run.deck.length}장`);
  const node = { id: 'trace', floor: 0, index: 0, type: module.type, moduleId, next: [] };
  const s = createBattle(data, battleSetupFor(data, run, { node, module }));
  while (!s.result && s.turn <= 60) {
    const intents = s.enemies
      .filter((e) => !e.downed)
      .map((e) => {
        const v = describeIntent(s, e);
        const dmg = v?.damage ? ` ${v.damage.perHit}×${v.damage.times}${v.damage.all ? ' 전체' : ''}` : '';
        return `${e.name}(${e.hp}) ${v?.intent.name ?? '-'}${dmg}`;
      });
    log(`${s.turn}턴 내공 ${s.neigong} 마나 ${s.mana} 균열 ${s.rift} | ${s.party.map((p) => `${p.name} ${p.hp}`).join(', ')} | 적: ${intents.join(' / ')}`);
    const before = s.log.length;
    playTurn(s);
    for (const line of s.log.slice(before)) log(`    ${line}`);
  }
  log(`결과: ${s.result ?? '끝나지 않음'}`);
});
