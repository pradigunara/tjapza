import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Trick } from './index';

describe('Trick Entity & Elimination Rules', () => {
  test('skips passed players and advances clockwise until trick concludes', () => {
    const counts = [13, 13, 13, 13];
    let trick = Trick.createFresh(0);
    expect(trick.isFresh).toBe(true);

    const play1 = CardCombo.evaluate([Card.fromString('3♦')])!;
    trick = trick.applyPlay(play1, 0);
    expect(trick.isFresh).toBe(false);
    expect(trick.trickWinnerSeat).toBe(0);

    // Seat 1 passes
    trick = trick.applyPass(1);
    expect(trick.hasPlayerPassed(1)).toBe(true);

    // Next seat from 1 is Seat 2
    let nextSeat = trick.findNextSeat(counts, 1);
    expect(nextSeat).toBe(2);

    // Seat 2 plays higher card
    const play2 = CardCombo.evaluate([Card.fromString('4♦')])!;
    trick = trick.applyPlay(play2, 2);
    expect(trick.trickWinnerSeat).toBe(2);

    // Next seat from 2 is Seat 3
    nextSeat = trick.findNextSeat(counts, 2);
    expect(nextSeat).toBe(3);

    // Seat 3 passes
    trick = trick.applyPass(3);

    // Next seat from 3: Seat 0 (skipping passed Seat 1!)
    nextSeat = trick.findNextSeat(counts, 3);
    expect(nextSeat).toBe(0);

    // Seat 0 passes
    trick = trick.applyPass(0);

    // Now all other active players passed -> trick ends (returns -1)
    nextSeat = trick.findNextSeat(counts, 0);
    expect(nextSeat).toBe(-1);
  });
});
