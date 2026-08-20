import { describe, expect, test } from 'bun:test';
import { Card, CardCombo, Trick, CapsaGame } from './index';

describe('CapsaGame State Machine & Self-Healing Reconciliation', () => {
  test('executes pure game plays and transitions turns accurately', () => {
    const game = new CapsaGame({
      status: 'playing',
      turnIndex: 0,
      leaderIndex: 0,
      counts: [13, 13, 13, 13],
    });

    expect(game.isOpeningMove).toBe(true);
    expect(game.canPass(0)).toBe(false); // cannot pass opening move
    expect(game.canPlay([Card.fromString('4♦')], 0)).toBe(false); // must contain 3♦
    expect(game.canPlay([Card.fromString('3♦')], 0)).toBe(true);

    const nextGame = game.applyPlay([Card.fromString('3♦')], 0);
    expect(nextGame.counts[0]).toBe(12);
    expect(nextGame.turnIndex).toBe(1);
    expect(nextGame.trick.lastCombo?.type).toBe('single');

    const afterPass = nextGame.applyPass(1);
    expect(afterPass.trick.passCount).toBe(1);
    const afterBeat = afterPass.applyPlay([Card.fromString('4♦')], 2);
    expect(afterBeat.trick.passCount).toBe(0);
    expect(afterBeat.trick.hasPlayerPassed(1)).toBe(true);
    expect(afterBeat.turnIndex).toBe(3);
  });

  describe('Invariant I1: Active Seat Integrity', () => {
    test('advances turnIndex clockwise to next active seat when current seat has 0 cards', () => {
      const single = CardCombo.evaluate([Card.fromString('10♠')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 0, // Seat 0 has 0 cards!
        leaderIndex: 2,
        counts: [0, 0, 5, 8], // Seat 0 and 1 have 0, seat 2 has 5, seat 3 has 8
        trick: new Trick({
          lastCombo: single,
          leaderSeatIndex: 2,
          lastPlaySeatIndex: 2,
          passedSeats: [],
        }),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.turnIndex).toBe(2); // Skipped 0 and 1, landed on 2
      expect(healedGame.leaderIndex).toBe(2); // Trick was active, leader preserved
      expect(reasons.some((r) => r.includes('Invariant I1'))).toBe(true);
    });

    test('advances turnIndex and updates leaderIndex if trick is fresh', () => {
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 1, // Seat 1 has 0 cards
        leaderIndex: 1,
        counts: [7, 0, 4, 3],
        trick: Trick.createFresh(1),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.turnIndex).toBe(2);
      expect(healedGame.leaderIndex).toBe(2);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.trick.leaderSeatIndex).toBe(2);
      expect(reasons.some((r) => r.includes('Invariant I1'))).toBe(true);
    });
  });

  describe('Invariant I2: Trick Conclusion', () => {
    test('concludes trick when all active opponents passed and awards lead to trick winner', () => {
      const pair = CardCombo.evaluate([Card.fromString('K♠'), Card.fromString('K♥')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 3,
        leaderIndex: 0,
        counts: [10, 8, 5, 6],
        trick: new Trick({
          lastCombo: pair,
          leaderSeatIndex: 0,
          lastPlaySeatIndex: 0, // Seat 0 played pair of Kings
          passedSeats: [1, 2, 3], // All 3 active opponents passed
          passCount: 3,
        }),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.turnIndex).toBe(0); // Winner seat 0 leads next trick
      expect(healedGame.leaderIndex).toBe(0);
      expect(healedGame.trick.passedSeats).toEqual([]);
      expect(reasons.some((r) => r.includes('Invariant I2'))).toBe(true);
    });

    test('hands over lead clockwise if trick winner shed all cards', () => {
      const pair = CardCombo.evaluate([
        Card.fromString('A♦'),
        Card.fromString('A♣'),
      ]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 3,
        leaderIndex: 1,
        counts: [0, 6, 4, 0], // Seat 0 shed, seat 3 shed
        winnerRanks: [0, 3],
        trick: new Trick({
          lastCombo: pair,
          leaderSeatIndex: 1,
          lastPlaySeatIndex: 0, // Seat 0 was trick winner, but counts[0] === 0!
          passedSeats: [1, 2], // Remaining active players passed
          passCount: 2,
        }),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      // Next active seat clockwise from 0 is seat 1 (counts[1] = 6)
      expect(healedGame.turnIndex).toBe(1);
      expect(healedGame.leaderIndex).toBe(1);
      expect(reasons.some((r) => r.includes('Invariant I2'))).toBe(true);
    });

    test('does NOT conclude trick prematurely when only some active opponents have passed', () => {
      const combo = CardCombo.evaluate([Card.fromString('2♠')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 2,
        counts: [4, 1, 1, 0], // Active seats: 0, 1, 2. Seat 3 shed.
        winnerRanks: [3],
        trick: new Trick({
          lastCombo: combo,
          leaderSeatIndex: 2,
          lastPlaySeatIndex: 2, // Seat 2 (Bot Charlie) played 2♠
          passedSeats: [3], // Only seat 3 passed/shed, seat 0 and seat 1 are active opponents
          passCount: 1,
        }),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(game);

      expect(healed).toBe(false);
      expect(healedGame.trick.isFresh).toBe(false);
      expect(healedGame.turnIndex).toBe(0); // Turn stays on Seat 0!
    });

    test('concludes trick when all active opponents have passed', () => {
      const combo = CardCombo.evaluate([Card.fromString('Q♠')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 2,
        leaderIndex: 2,
        counts: [5, 4, 3, 0], // 3 active seats (0, 1, 2). Trick winner is 2. Opponents are 0, 1.
        winnerRanks: [3],
        trick: new Trick({
          lastCombo: combo,
          leaderSeatIndex: 2,
          lastPlaySeatIndex: 2,
          passedSeats: [0, 1], // Both active opponents passed
          passCount: 2,
        }),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.turnIndex).toBe(2);
      expect(healedGame.leaderIndex).toBe(2);
      expect(reasons.some((r) => r.includes('Invariant I2'))).toBe(true);
    });
  });

  describe('Invariant I3: Fresh Lead Sanitization', () => {
    test('sanitizes stale pass counts and passed seats on fresh trick', () => {
      const dirtyTrick = new Trick({
        lastCombo: null,
        leaderSeatIndex: 2,
        passedSeats: [0, 1, 3],
        passCount: 3,
        lastPlaySeatIndex: 2,
      });

      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 2,
        leaderIndex: 2,
        counts: [10, 9, 8, 7],
        trick: dirtyTrick,
      });

      expect(game.trick.isFresh).toBe(true);
      expect(game.trick.passedSeats.length).toBe(3);

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.trick.passedSeats).toEqual([]);
      expect(healedGame.trick.passCount).toBe(0);
      expect(healedGame.trick.leaderSeatIndex).toBe(2);
      expect(reasons.some((r) => r.includes('Invariant I3'))).toBe(true);
    });
  });

  describe('Invariant I4: Endgame Auto-Resolution', () => {
    test('auto-assigns 4th place and finishes game when 3 players shed', () => {
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 3,
        leaderIndex: 2,
        counts: [0, 0, 0, 7], // Seats 0, 1, 2 finished; seat 3 has 7 cards
        winnerRanks: [1, 0, 2], // 1st: Seat 1, 2nd: Seat 0, 3rd: Seat 2
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.status).toBe('finished');
      expect(healedGame.isFinished).toBe(true);
      expect(healedGame.winnerRanks).toEqual([1, 0, 2, 3]); // 4th place auto-assigned
      expect(reasons.some((r) => r.includes('Invariant I4'))).toBe(true);
    });

    test('sets status to finished if 0 active seats remain', () => {
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [0, 0, 0, 0],
        winnerRanks: [0, 1, 2, 3],
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.status).toBe('finished');
      expect(reasons.some((r) => r.includes('Invariant I4'))).toBe(true);
    });
  });

  describe('Invariant I5: Opening Guard', () => {
    test('ensures trick is fresh when game is at opening move state', () => {
      const staleCombo = CardCombo.evaluate([Card.fromString('3♦')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [13, 13, 13, 13],
        winnerRanks: [],
        trick: new Trick({
          lastCombo: staleCombo,
          leaderSeatIndex: 0,
          lastPlaySeatIndex: 0,
        }),
      });

      const { game: healedGame, healed, reasons } = CapsaGame.reconcile(game);

      expect(healed).toBe(true);
      expect(healedGame.isOpeningMove).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.trick.lastCombo).toBeNull();
      expect(reasons.some((r) => r.includes('Invariant I5'))).toBe(true);
    });
  });

  describe('Strict Idempotency & Purity', () => {
    test('reconcile on an already healthy game produces healed === false and no changes', () => {
      const healthyGame = new CapsaGame({
        status: 'playing',
        turnIndex: 1,
        leaderIndex: 1,
        counts: [13, 13, 13, 13],
        trick: Trick.createFresh(1),
      });

      const res = CapsaGame.reconcile(healthyGame);
      expect(res.healed).toBe(false);
      expect(res.reasons).toEqual([]);
      expect(res.game.turnIndex).toBe(1);
    });

    test('reconcile(reconcile(g).game) is strictly idempotent across complex corrupted states', () => {
      // Corrupted state: Seat 0 has 0 cards, dirty trick, but status still playing
      const corruptedGame = new CapsaGame({
        status: 'playing',
        turnIndex: 0, // Invariant I1
        leaderIndex: 0,
        counts: [0, 5, 4, 3],
        trick: new Trick({
          lastCombo: null,
          leaderSeatIndex: 0,
          passedSeats: [1, 2], // Invariant I3
          passCount: 2,
        }),
      });

      const pass1 = CapsaGame.reconcile(corruptedGame);
      expect(pass1.healed).toBe(true);
      expect(pass1.game.turnIndex).toBe(1);
      expect(pass1.game.trick.isFresh).toBe(true);
      expect(pass1.game.trick.passedSeats).toEqual([]);

      // Second reconcile pass MUST be a no-op
      const pass2 = CapsaGame.reconcile(pass1.game);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
      expect(pass2.game.turnIndex).toBe(pass1.game.turnIndex);
      expect(pass2.game.leaderIndex).toBe(pass1.game.leaderIndex);
      expect(pass2.game.status).toBe(pass1.game.status);
    });

    test('reconcile does not mutate the input game instance', () => {
      const originalGame = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [0, 10, 10, 10],
        trick: Trick.createFresh(0),
      });

      const frozenCounts = [...originalGame.counts];
      const { game: healedGame } = CapsaGame.reconcile(originalGame);

      expect(originalGame.turnIndex).toBe(0);
      expect(originalGame.counts).toEqual(frozenCounts);
      expect(healedGame.turnIndex).toBe(1);
    });
  });

  describe('Scenario A: Player Sheds Last Card & Clockwise Lead Handover', () => {
    test('Player 0 sheds last card (rank 1), remaining 3 players pass -> trick concludes and hands lead to Seat 1', () => {
      let game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [1, 5, 6, 7],
        winnerRanks: [],
        trick: Trick.createFresh(0),
      });

      // 1. Seat 0 plays their last card (single 2♠)
      game = game.applyPlay([Card.fromString('2♠')], 0);
      expect(game.counts[0]).toBe(0);
      expect(game.winnerRanks).toEqual([0]); // Seat 0 took 1st place!
      expect(game.status).toBe('playing'); // 3 active players remain
      expect(game.turnIndex).toBe(1); // Turn moved to Seat 1
      expect(game.trick.trickWinnerSeat).toBe(0);

      // 2. Seat 1 passes
      game = game.applyPass(1);
      expect(game.turnIndex).toBe(2);
      expect(game.trick.hasPlayerPassed(1)).toBe(true);

      // 3. Seat 2 passes
      game = game.applyPass(2);
      expect(game.turnIndex).toBe(3);
      expect(game.trick.hasPlayerPassed(2)).toBe(true);

      // 4. Seat 3 passes -> all active players passed!
      game = game.applyPass(3);

      // Trick concludes! Lead hands over clockwise from shed winner Seat 0 -> Seat 1 leads
      expect(game.trick.isFresh).toBe(true);
      expect(game.turnIndex).toBe(1);
      expect(game.leaderIndex).toBe(1);
      expect(game.trick.passedSeats).toEqual([]);
    });

    test('Player 0 sheds last card, Seat 1 passes, Seat 2 plays higher card, Seat 3 passes -> Seat 2 wins trick', () => {
      let game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [1, 5, 6, 7],
        winnerRanks: [],
        trick: Trick.createFresh(0),
      });

      // 1. Seat 0 plays single 4♦ (shedding last card)
      game = game.applyPlay([Card.fromString('4♦')], 0);
      expect(game.counts[0]).toBe(0);
      expect(game.turnIndex).toBe(1);

      // 2. Seat 1 passes
      game = game.applyPass(1);
      expect(game.turnIndex).toBe(2);

      // 3. Seat 2 plays 9♠
      game = game.applyPlay([Card.fromString('9♠')], 2);
      expect(game.counts[2]).toBe(5);
      expect(game.turnIndex).toBe(3);
      expect(game.trick.trickWinnerSeat).toBe(2);

      // 4. Seat 3 passes -> Seat 0 has 0 cards, Seat 1 already passed -> trick concludes immediately to Seat 2!
      game = game.applyPass(3);
      expect(game.trick.isFresh).toBe(true);
      expect(game.turnIndex).toBe(2);
      expect(game.leaderIndex).toBe(2);
    });
  });

  describe('Scenario B: Multi-Play / Pass Game Sequence', () => {
    test('Seat 0 leads 4, Seat 1 passes, Seat 2 plays 9, Seat 3 passes, Seat 0 plays Ace, Seat 2 passes -> Seat 0 wins', () => {
      let game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [8, 8, 8, 8],
        trick: Trick.createFresh(0),
      });

      // 1. Seat 0 leads 4♦
      game = game.applyPlay([Card.fromString('4♦')], 0);
      expect(game.counts[0]).toBe(7);
      expect(game.turnIndex).toBe(1);

      // 2. Seat 1 passes
      game = game.applyPass(1);
      expect(game.turnIndex).toBe(2);

      // 3. Seat 2 plays 9♠
      game = game.applyPlay([Card.fromString('9♠')], 2);
      expect(game.counts[2]).toBe(7);
      expect(game.turnIndex).toBe(3);

      // 4. Seat 3 passes
      game = game.applyPass(3);
      // Turn advances to Seat 0 (Seat 1 skipped because passed)
      expect(game.turnIndex).toBe(0);

      // 5. Seat 0 plays A♥
      game = game.applyPlay([Card.fromString('A♥')], 0);
      expect(game.counts[0]).toBe(6);
      // Turn advances to Seat 2 (Seat 1 skipped)
      expect(game.turnIndex).toBe(2);

      // 6. Seat 2 passes -> trick concludes to Seat 0
      game = game.applyPass(2);
      expect(game.trick.isFresh).toBe(true);
      expect(game.turnIndex).toBe(0);
      expect(game.leaderIndex).toBe(0);
    });
  });

  describe('Scenario C: 2-Player Heads-Up Endgame', () => {
    test('Heads-up: single pass immediately concludes trick to other active player', () => {
      let game = new CapsaGame({
        status: 'playing',
        turnIndex: 2,
        leaderIndex: 2,
        counts: [0, 0, 5, 8], // Seats 0 and 1 finished
        winnerRanks: [0, 1],
        trick: Trick.createFresh(2),
      });

      // Seat 2 leads 10♦
      game = game.applyPlay([Card.fromString('10♦')], 2);
      expect(game.counts[2]).toBe(4);
      expect(game.turnIndex).toBe(3);

      // Seat 3 passes -> immediately concludes trick!
      game = game.applyPass(3);
      expect(game.trick.isFresh).toBe(true);
      expect(game.turnIndex).toBe(2);
      expect(game.leaderIndex).toBe(2);
    });

    test('Heads-up: counter-play then pass concludes trick to counter-player', () => {
      let game = new CapsaGame({
        status: 'playing',
        turnIndex: 2,
        leaderIndex: 2,
        counts: [0, 0, 5, 8],
        winnerRanks: [0, 1],
        trick: Trick.createFresh(2),
      });

      // Seat 2 leads 10♦
      game = game.applyPlay([Card.fromString('10♦')], 2);
      expect(game.turnIndex).toBe(3);

      // Seat 3 plays J♠
      game = game.applyPlay([Card.fromString('J♠')], 3);
      expect(game.counts[3]).toBe(7);
      expect(game.turnIndex).toBe(2);

      // Seat 2 passes -> trick concludes to Seat 3
      game = game.applyPass(2);
      expect(game.trick.isFresh).toBe(true);
      expect(game.turnIndex).toBe(3);
      expect(game.leaderIndex).toBe(3);
    });
  });

  describe('applyBotTurn', () => {
    test('on opening with 3♦ in hand plays a combo containing 3♦ (never pass)', () => {
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [13, 13, 13, 13],
        trick: Trick.createFresh(0),
      });

      const hand = [
        Card.fromString('3♦'),
        Card.fromString('5♠'),
        Card.fromString('7♥'),
        Card.fromString('9♣'),
      ];
      const result = game.applyBotTurn(hand);

      expect(result.action).toBe('play');
      expect(result.cards.some((c) => c.code === Card.fromString('3♦').code)).toBe(true);
      expect(result.combo).toBeDefined();
      expect(result.nextGame.counts[0]).toBe(13 - result.cards.length);
      expect(result.nextGame.turnIndex).toBe(1);
    });

    test('on a fresh trick (not opening) with cards never returns pass', () => {
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 1,
        leaderIndex: 1,
        counts: [10, 10, 10, 10],
        trick: Trick.createFresh(1),
      });

      const hand = [
        Card.fromString('4♦'),
        Card.fromString('6♠'),
        Card.fromString('8♥'),
      ];
      const result = game.applyBotTurn(hand);

      expect(result.action).toBe('play');
      expect(result.cards.length).toBeGreaterThan(0);
      expect(result.combo).toBeDefined();
      expect(result.nextGame.trick.isFresh).toBe(false);
    });

    test('when it cannot beat lastCombo returns pass and advances via applyPass', () => {
      const lastCombo = CardCombo.evaluate([Card.fromString('2♠')]);
      const game = new CapsaGame({
        status: 'playing',
        turnIndex: 2,
        leaderIndex: 0,
        counts: [8, 8, 8, 8],
        trick: new Trick({
          lastCombo,
          leaderSeatIndex: 0,
          lastPlaySeatIndex: 0,
          passedSeats: [],
        }),
      });

      // Hand with only low singles — cannot beat 2♠
      const hand = [
        Card.fromString('4♦'),
        Card.fromString('5♠'),
        Card.fromString('6♥'),
      ];
      const result = game.applyBotTurn(hand);

      expect(result.action).toBe('pass');
      expect(result.cards).toEqual([]);
      expect(result.nextGame.trick.hasPlayerPassed(2)).toBe(true);
      expect(result.nextGame.turnIndex).toBe(3);
    });
  });

  describe('Scenario F: Synthetic & Highly Corrupt State Reconciliation', () => {
    test('Vector 1: Out-of-bounds turnIndex (e.g. 5) is safely healed to next active seat', () => {
      const corruptGame = new CapsaGame({
        status: 'playing',
        turnIndex: 5,
        leaderIndex: 0,
        counts: [0, 6, 4, 3],
        trick: Trick.createFresh(0),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(corruptGame);
      expect(healed).toBe(true);
      expect(healedGame.turnIndex).toBe(2); // Next active seat clockwise from (5 + 1) % 4 = 2 is 2

      // Strictly idempotent
      const pass2 = CapsaGame.reconcile(healedGame);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
    });

    test('Vector 2: Negative turnIndex (-1) is safely healed', () => {
      const corruptGame = new CapsaGame({
        status: 'playing',
        turnIndex: -1,
        leaderIndex: 0,
        counts: [3, 4, 5, 6],
        trick: Trick.createFresh(0),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(corruptGame);
      expect(healed).toBe(true);
      expect(healedGame.turnIndex).toBe(0);

      // Strictly idempotent
      const pass2 = CapsaGame.reconcile(healedGame);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
    });

    test('Vector 3: Multi-corruption (empty seat + stale passedSeats + unfinished endgame)', () => {
      const corruptGame = new CapsaGame({
        status: 'playing',
        turnIndex: 0, // Seat 0 has 0 cards
        leaderIndex: 0,
        counts: [0, 0, 0, 5], // 3 players finished, but status still playing!
        winnerRanks: [1, 0], // missing 3rd and 4th place
        trick: new Trick({
          lastCombo: null,
          leaderSeatIndex: 0,
          passedSeats: [0, 1, 2],
          passCount: 3,
        }),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(corruptGame);
      expect(healed).toBe(true);
      expect(healedGame.status).toBe('finished');
      expect(healedGame.winnerRanks).toEqual([1, 0, 2, 3]); // Auto-resolved

      // Strictly idempotent
      const pass2 = CapsaGame.reconcile(healedGame);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
    });

    test('Vector 4: 2-player endgame with un-concluded trick after opponent pass', () => {
      const corruptGame = new CapsaGame({
        status: 'playing',
        turnIndex: 3,
        leaderIndex: 2,
        counts: [0, 0, 4, 7], // Active seats: 2 and 3
        winnerRanks: [0, 1],
        trick: new Trick({
          lastCombo: CardCombo.evaluate([Card.fromString('Q♠')]),
          leaderSeatIndex: 2,
          lastPlaySeatIndex: 2, // Seat 2 played Queen
          passedSeats: [3], // Seat 3 passed, so all active opponents passed!
          passCount: 1,
        }),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(corruptGame);
      expect(healed).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.turnIndex).toBe(2);
      expect(healedGame.leaderIndex).toBe(2);

      // Strictly idempotent
      const pass2 = CapsaGame.reconcile(healedGame);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
    });

    test('Vector 5: Corrupt opening state with dirty trick and stale pass count', () => {
      const corruptGame = new CapsaGame({
        status: 'playing',
        turnIndex: 0,
        leaderIndex: 0,
        counts: [13, 13, 13, 13],
        winnerRanks: [],
        trick: new Trick({
          lastCombo: CardCombo.evaluate([Card.fromString('2♠')]),
          leaderSeatIndex: 1,
          passedSeats: [2, 3],
          passCount: 2,
        }),
      });

      const { game: healedGame, healed } = CapsaGame.reconcile(corruptGame);
      expect(healed).toBe(true);
      expect(healedGame.isOpeningMove).toBe(true);
      expect(healedGame.trick.isFresh).toBe(true);
      expect(healedGame.trick.passedSeats).toEqual([]);
      expect(healedGame.trick.passCount).toBe(0);

      // Strictly idempotent
      const pass2 = CapsaGame.reconcile(healedGame);
      expect(pass2.healed).toBe(false);
      expect(pass2.reasons).toEqual([]);
    });
  });
});


