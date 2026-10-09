// npm run balance의 둘째 성향(BALANCE_STYLES의 둘째, 기본 공격형). play.a와 다른 프로세스에서 동시에 돈다
import { it } from 'vitest';
import { gameData } from '../../src/engine/data';
import { playStyle } from './shared';

it('밸런스: 봇 성향 2', () => playStyle(gameData(), 1));
