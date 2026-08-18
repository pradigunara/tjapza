import { Seat } from './Seat';

export interface Standing {
  seatIndex: number;
  rank: number;
  name: string;
  isBot: boolean;
  cardsLeft: number;
  scorePenalty: number;
  medal: string;
  title: string;
}

/**
 * Pure Entity calculating game standings, rankings, medals, and score penalties.
 */
export class Podium {
  public readonly winnerRanks: number[];
  public readonly counts: number[];
  public readonly seats: Seat[];

  constructor(winnerRanks: number[] = [], counts: number[] = [0, 0, 0, 0], seats: Seat[] = []) {
    this.winnerRanks = [...winnerRanks];
    this.counts = [...counts];
    this.seats = [...seats];
  }

  public getRank(seatIndex: number): number {
    const idx = this.winnerRanks.indexOf(seatIndex);
    if (idx !== -1) {
      return idx + 1;
    }
    // If not in winnerRanks (e.g. 4th place unrecorded), default to 4
    return 4;
  }

  public static getMedal(rank: number): string {
    switch (rank) {
      case 1:
        return '🥇';
      case 2:
        return '🥈';
      case 3:
        return '🥉';
      default:
        return '💩';
    }
  }

  public static getTitle(rank: number): string {
    switch (rank) {
      case 1:
        return '1st Place (Winner)';
      case 2:
        return '2nd Place (Runner-up)';
      case 3:
        return '3rd Place';
      default:
        return '4th Place (Last)';
    }
  }

  /**
   * Calculates Capsa Banting point penalty:
   * - 1..7 cards: 1x penalty per card
   * - 8..9 cards: 2x penalty per card (Double)
   * - 10..12 cards: 3x penalty per card (Triple)
   * - 13 cards (Dragon penalty): 4x penalty per card (Quadruple = 52 pts)
   */
  public static calculatePenalty(cardsLeft: number): number {
    if (cardsLeft <= 0) return 0;
    if (cardsLeft < 8) return cardsLeft;
    if (cardsLeft < 10) return cardsLeft * 2;
    if (cardsLeft < 13) return cardsLeft * 3;
    return cardsLeft * 4; // 52 pts
  }

  public getStandings(): Standing[] {
    const standings: Standing[] = [];

    for (let rank = 1; rank <= 4; rank++) {
      const seatIdx = this.winnerRanks[rank - 1];
      if (seatIdx !== undefined && seatIdx >= 0) {
        const seat = this.seats[seatIdx];
        const cardsLeft = this.counts[seatIdx] ?? 0;
        standings.push({
          seatIndex: seatIdx,
          rank,
          name: seat ? seat.name : `Seat ${seatIdx + 1}`,
          isBot: seat ? seat.isBot : false,
          cardsLeft,
          scorePenalty: Podium.calculatePenalty(cardsLeft),
          medal: Podium.getMedal(rank),
          title: Podium.getTitle(rank),
        });
      }
    }

    return standings;
  }
}
