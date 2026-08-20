import { describe, expect, test } from 'bun:test';
import { CardCombo } from './index';
// Generated bundle (gitignored): built by `bun run build:domain`, which the
// `pretest` script runs automatically before `bun run test`.
// @ts-ignore
import domainCjs from '../../../pb/pb_hooks/domain.js';

describe('Domain Parity with Transpiled PocketBase domain.js', () => {
  test('matches transpiled CJS domain evaluation and canBeat results', () => {
    const testCards = [0, 5, 8, 13, 16]; // 3♦, 4♣, 5♦, 6♣, 7♦ (mixed suits straight)
    const cjsCombo = domainCjs.CardCombo.evaluate(testCards);
    const tsCombo = CardCombo.evaluate(testCards);

    expect(cjsCombo.type).toBe('straight');
    expect(tsCombo?.type).toBe('straight');
    expect(tsCombo?.cardCodes).toEqual(testCards);

    const higherStraight = [4, 9, 12, 17, 20]; // 4♦, 5♣, 6♦, 7♣, 8♦
    const higherCjsCombo = domainCjs.CardCombo.evaluate(higherStraight);
    expect(higherCjsCombo.canBeat(cjsCombo)).toBe(true);
    expect(CardCombo.evaluate(higherStraight)!.canBeat(tsCombo!)).toBe(true);
  });
});
