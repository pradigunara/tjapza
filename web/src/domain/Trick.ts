import { CardCombo } from './CardCombo';

/**
 * Pure Immutable Domain Entity representing an active trick / round of plays.
 */
export class Trick {
  readonly lastCombo: CardCombo | null;
  readonly leaderSeatIndex: number;
  readonly passedSeats: number[];
  readonly passCount: number;
  readonly lastPlaySeatIndex: number;

  constructor(params: {
    lastCombo?: CardCombo | null;
    leaderSeatIndex?: number;
    passedSeats?: number[];
    passCount?: number;
    lastPlaySeatIndex?: number;
    trickWinnerSeat?: number;
  } = {}) {
    this.lastCombo = params.lastCombo ?? null;
    this.leaderSeatIndex = params.leaderSeatIndex ?? 0;
    this.passedSeats = params.passedSeats ? [...params.passedSeats] : [];
    this.passCount = params.passCount ?? 0;
    this.lastPlaySeatIndex = params.lastPlaySeatIndex ?? params.trickWinnerSeat ?? this.leaderSeatIndex;
  }

  public static createFresh(leaderSeatIndex: number): Trick {
    return new Trick({
      lastCombo: null,
      leaderSeatIndex,
      passedSeats: [],
      passCount: 0,
      lastPlaySeatIndex: leaderSeatIndex,
    });
  }

  // --- Queries ---

  public get isFresh(): boolean {
    return this.lastCombo === null;
  }

  public get trickWinnerSeat(): number {
    return this.lastCombo ? this.lastPlaySeatIndex : this.leaderSeatIndex;
  }

  public hasPlayerPassed(seatIndex: number): boolean {
    return this.passedSeats.includes(seatIndex);
  }

  public isPlayerEligible(seatIndex: number, counts: number[]): boolean {
    return counts[seatIndex] > 0 && !this.hasPlayerPassed(seatIndex);
  }

  public canPlay(combo: CardCombo, seatIndex: number): boolean {
    if (this.hasPlayerPassed(seatIndex)) return false;
    if (!this.lastCombo) return true;
    return combo.canBeat(this.lastCombo);
  }

  /**
   * Pure algorithm finding the next eligible active player clockwise in this trick.
   * Returns -1 if all other eligible players have passed (concluding the trick).
   */
  public findNextSeat(
    counts: number[],
    currentSeat: number,
    totalSeats = 4
  ): number {
    const winnerSeat = this.trickWinnerSeat;

    for (let i = 1; i <= totalSeats; i++) {
      const s = (currentSeat + i) % totalSeats;
      // If we cycled back to the winner of the current trick, all others passed!
      if (s === winnerSeat) {
        return -1;
      }
      if (counts[s] > 0 && !this.passedSeats.includes(s)) {
        return s;
      }
    }
    return -1;
  }

  // --- Pure State Transitions ---

  public applyPlay(combo: CardCombo, seatIndex: number): Trick {
    return new Trick({
      lastCombo: combo,
      leaderSeatIndex: this.leaderSeatIndex,
      passedSeats: this.passedSeats, // retain previously passed seats within the trick
      passCount: 0, // consecutive passes since the last play
      lastPlaySeatIndex: seatIndex,
    });
  }

  public applyPass(seatIndex: number): Trick {
    const nextPassed = this.passedSeats.includes(seatIndex)
      ? this.passedSeats
      : [...this.passedSeats, seatIndex];

    return new Trick({
      lastCombo: this.lastCombo,
      leaderSeatIndex: this.leaderSeatIndex,
      passedSeats: nextPassed,
      passCount: this.passCount + 1,
      lastPlaySeatIndex: this.lastPlaySeatIndex,
    });
  }
}
