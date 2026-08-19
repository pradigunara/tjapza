import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Trick } from './index';

describe('Trick Entity & Lifecycle Rules', () => {
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

  describe('Scenario A: Player sheds last card and opponents pass', () => {
    test('tracks trick correctly when leader sheds and all 3 opponents pass', () => {
      // Seat 0 played their last card
      const counts = [0, 8, 7, 6];
      let trick = Trick.createFresh(0);
      const play = CardCombo.evaluate([Card.fromString('2♠')])!;
      trick = trick.applyPlay(play, 0);
      expect(trick.trickWinnerSeat).toBe(0);

      // Turn moves to Seat 1
      let next = trick.findNextSeat(counts, 0);
      expect(next).toBe(1);

      // Seat 1 passes
      trick = trick.applyPass(1);
      next = trick.findNextSeat(counts, 1);
      expect(next).toBe(2);

      // Seat 2 passes
      trick = trick.applyPass(2);
      next = trick.findNextSeat(counts, 2);
      expect(next).toBe(3);

      // Seat 3 passes
      trick = trick.applyPass(3);
      // All active players passed, cycled back to shed winner Seat 0
      next = trick.findNextSeat(counts, 3);
      expect(next).toBe(-1);
      expect(trick.trickWinnerSeat).toBe(0);
    });

    test('allows higher play after leader sheds and eliminates earlier passers', () => {
      const counts = [0, 8, 7, 6];
      let trick = Trick.createFresh(0);
      const play0 = CardCombo.evaluate([Card.fromString('4♦')])!;
      trick = trick.applyPlay(play0, 0);

      // Seat 1 passes
      trick = trick.applyPass(1);
      expect(trick.hasPlayerPassed(1)).toBe(true);

      // Seat 2 beats with 9
      const play2 = CardCombo.evaluate([Card.fromString('9♠')])!;
      trick = trick.applyPlay(play2, 2);
      expect(trick.trickWinnerSeat).toBe(2);

      // Seat 3 passes
      trick = trick.applyPass(3);

      // Next seat from 3: Seat 0 is shed (0 cards), Seat 1 already passed -> cycles back to 2!
      const next = trick.findNextSeat(counts, 3);
      expect(next).toBe(-1);
      expect(trick.trickWinnerSeat).toBe(2);
    });
  });

  describe('Scenario B: Multi-play trick with re-engagement and pass lock-out', () => {
    test('Seat 0 leads 4, Seat 1 passes, Seat 2 plays 9, Seat 3 passes, Seat 0 plays Ace, Seat 2 passes', () => {
      const counts = [10, 10, 10, 10];
      let trick = Trick.createFresh(0);

      // 1. Seat 0 leads 4♦
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('4♦')])!, 0);
      expect(trick.trickWinnerSeat).toBe(0);

      // 2. Seat 1 passes (locked out for rest of trick)
      trick = trick.applyPass(1);
      expect(trick.hasPlayerPassed(1)).toBe(true);
      expect(trick.isPlayerEligible(1, counts)).toBe(false);

      // 3. Seat 2 plays 9♠
      expect(trick.findNextSeat(counts, 1)).toBe(2);
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('9♠')])!, 2);
      expect(trick.trickWinnerSeat).toBe(2);
      // Seat 1 remains passed despite new play!
      expect(trick.hasPlayerPassed(1)).toBe(true);

      // 4. Seat 3 passes
      expect(trick.findNextSeat(counts, 2)).toBe(3);
      trick = trick.applyPass(3);
      expect(trick.hasPlayerPassed(3)).toBe(true);

      // 5. Turn goes to Seat 0 (Seat 1 skipped)
      expect(trick.findNextSeat(counts, 3)).toBe(0);
      // Seat 0 plays A♥
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('A♥')])!, 0);
      expect(trick.trickWinnerSeat).toBe(0);
      expect(trick.passedSeats).toContain(1);
      expect(trick.passedSeats).toContain(3);

      // 6. Turn goes to Seat 2 (Seat 1 skipped because already passed)
      expect(trick.findNextSeat(counts, 0)).toBe(2);

      // 7. Seat 2 passes
      trick = trick.applyPass(2);
      expect(trick.passedSeats).toEqual([1, 3, 2]);

      // 8. Trick concludes to Seat 0
      expect(trick.findNextSeat(counts, 2)).toBe(-1);
      expect(trick.trickWinnerSeat).toBe(0);
    });
  });

  describe('Scenario C: 2-player heads-up endgame', () => {
    test('single pass immediately concludes trick to other player', () => {
      // Seats 0 and 1 have shed
      const counts = [0, 0, 5, 8];
      let trick = Trick.createFresh(2);

      // Seat 2 leads 10♦
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('10♦')])!, 2);
      expect(trick.trickWinnerSeat).toBe(2);

      // Turn advances to Seat 3
      expect(trick.findNextSeat(counts, 2)).toBe(3);

      // Seat 3 passes
      trick = trick.applyPass(3);

      // Immediately concludes trick back to Seat 2!
      expect(trick.findNextSeat(counts, 3)).toBe(-1);
      expect(trick.trickWinnerSeat).toBe(2);
    });

    test('opponent counter-plays and then leader passes -> trick concludes to opponent', () => {
      const counts = [0, 0, 5, 8];
      let trick = Trick.createFresh(2);

      // Seat 2 leads 10♦
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('10♦')])!, 2);
      expect(trick.findNextSeat(counts, 2)).toBe(3);

      // Seat 3 plays J♠
      trick = trick.applyPlay(CardCombo.evaluate([Card.fromString('J♠')])!, 3);
      expect(trick.trickWinnerSeat).toBe(3);

      // Turn returns to Seat 2
      expect(trick.findNextSeat(counts, 3)).toBe(2);

      // Seat 2 passes
      trick = trick.applyPass(2);

      // Concludes trick to Seat 3!
      expect(trick.findNextSeat(counts, 2)).toBe(-1);
      expect(trick.trickWinnerSeat).toBe(3);
    });
  });
});
