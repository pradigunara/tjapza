import { describe, expect, test } from 'bun:test';
import { Card, CapsaGame } from './index';

describe('CapsaGame State Machine', () => {
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
  });
});
