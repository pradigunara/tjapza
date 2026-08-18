import { describe, expect, test } from 'bun:test';
import { Podium, Seat } from './index';

describe('Podium Entity & Standings Calculation', () => {
  test('computes standings, medals, titles, and score penalties', () => {
    const seats = [
      new Seat({ index: 0, userId: 'u1', name: 'Alice', isBot: false, connected: true }),
      Seat.createBot(1, 'Bot Bob'),
      Seat.createBot(2, 'Bot Charlie'),
      Seat.createBot(3, 'Bot Dave'),
    ];

    // Winner order: Seat 0, Seat 1, Seat 2, Seat 3
    const podium = new Podium([0, 1, 2, 3], [0, 5, 9, 13], seats);
    const standings = podium.getStandings();

    expect(standings.length).toBe(4);
    expect(standings[0].medal).toBe('🥇');
    expect(standings[0].name).toBe('Alice');
    expect(standings[0].scorePenalty).toBe(0);

    expect(standings[1].medal).toBe('🥈');
    expect(standings[1].scorePenalty).toBe(5); // 5 * 1

    expect(standings[2].medal).toBe('🥉');
    expect(standings[2].scorePenalty).toBe(18); // 9 * 2 (Double penalty)

    expect(standings[3].medal).toBe('💩');
    expect(standings[3].scorePenalty).toBe(52); // 13 * 4 (Quadruple Dragon penalty)
  });
});
