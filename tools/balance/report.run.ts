// npm run balance의 마지막 단계: play.a·play.b가 남긴 성향별 결과를 모아 보고서를 쓴다.
// BALANCE_OUT(보고서 경로, 기본 docs/BALANCE_REPORT.md · 심연은 docs/BALANCE_ABYSS.md, "-"면 쓰지 않음)
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { gameData } from '../../src/engine/data';
import { abyssReport } from './abyss-report';
import { campaignReport } from './campaign-report';
import { MODE, PREFIX, readBatches, SEEDS, START, type AbyssBatch, type CampaignBatch } from './shared';

it('밸런스: 보고서', () => {
  const data = gameData();
  const text =
    MODE === 'abyss'
      ? abyssReport(data, readBatches<AbyssBatch>(), SEEDS, PREFIX)
      : campaignReport(data, readBatches<CampaignBatch>(), { seeds: SEEDS, prefix: PREFIX, start: START });
  const out = process.env.BALANCE_OUT ?? (MODE === 'abyss' ? 'docs/BALANCE_ABYSS.md' : 'docs/BALANCE_REPORT.md');
  if (out !== '-') writeFileSync(out, text + '\n');
  // 요약을 콘솔에도(vitest가 삼키지 않게 stderr)
  process.stderr.write(`\n${text.split(MODE === 'abyss' ? '\n## 동료 조합별' : '\n## 전투별')[0]}\n`);
});
