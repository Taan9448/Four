// npm run balance의 첫 성향(BALANCE_STYLES의 첫째, 기본 수비형). play.b와 다른 프로세스에서 동시에 돈다
import { it } from 'vitest';
import { gameData } from '../../src/engine/data';
import { playStyle } from './shared';

it('밸런스: 봇 성향 1', () => playStyle(gameData(), 0));
