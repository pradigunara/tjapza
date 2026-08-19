import { Card } from './Card';
import { CardCombo } from './CardCombo';
import { Hand } from './Hand';
import { Trick } from './Trick';
import { BotEngine } from './BotEngine';
import { CARD_3D } from './constants';

export interface GameSeat {
  userId: string | null;
  name: string;
  isBot: boolean;
  connected: boolean;
}

export interface GameMoveResult {
  nextGame: CapsaGame;
  action: 'play' | 'pass';
  cards: Card[];
  combo?: CardCombo;
}

export interface ReconcileResult {
  game: CapsaGame;
  healed: boolean;
  reasons: string[];
}

/**
 * Pure Domain Capsa Banting Game State Machine (Zero Side Effects).
 */
export class CapsaGame {
  readonly id: string;
  readonly status: 'waiting' | 'playing' | 'finished';
  readonly seats: GameSeat[];
  readonly counts: number[];
  readonly hands?: (Hand | null)[];
  readonly turnIndex: number;
  readonly leaderIndex: number;
  readonly trick: Trick;
  readonly winnerRanks: number[];
  readonly roomCode: string;
  readonly isPublic: boolean;

  constructor(params: {
    id?: string;
    status?: 'waiting' | 'playing' | 'finished';
    seats?: GameSeat[];
    counts?: number[];
    hands?: (Hand | null)[];
    turnIndex?: number;
    leaderIndex?: number;
    trick?: Trick;
    winnerRanks?: number[];
    roomCode?: string;
    isPublic?: boolean;
  } = {}) {
    this.id = params.id ?? '';
    this.status = params.status ?? 'waiting';
    this.seats = params.seats ? [...params.seats] : [];
    this.counts = params.counts ? [...params.counts] : [13, 13, 13, 13];
    this.hands = params.hands;
    this.turnIndex = params.turnIndex ?? 0;
    this.leaderIndex = params.leaderIndex ?? 0;
    this.trick = params.trick ?? Trick.createFresh(this.turnIndex);
    this.winnerRanks = params.winnerRanks ? [...params.winnerRanks] : [];
    this.roomCode = params.roomCode ?? '';
    this.isPublic = params.isPublic ?? false;
  }

  // --- Queries ---

  public get isOpeningMove(): boolean {
    return (
      this.trick.lastCombo === null &&
      this.counts.length === 4 &&
      this.counts[0] === 13 &&
      this.counts[1] === 13 &&
      this.counts[2] === 13 &&
      this.counts[3] === 13
    );
  }

  public get isFinished(): boolean {
    return this.status === 'finished';
  }

  public get activePlayerCount(): number {
    return this.counts.filter((c) => c > 0).length;
  }

  public get isCurrentTurnBot(): boolean {
    return Boolean(this.seats[this.turnIndex]?.isBot);
  }

  public static findNextActiveSeat(counts: number[], fromSeat: number): number {
    for (let i = 1; i <= 4; i++) {
      const s = (fromSeat + i) % 4;
      if ((counts[s] ?? 0) > 0) return s;
    }
    return fromSeat;
  }

  public findNextActiveSeat(fromSeat: number): number {
    return CapsaGame.findNextActiveSeat(this.counts, fromSeat);
  }

  // --- Self-Healing & Deterministic State Reconciliation ---

  public static reconcile(game: CapsaGame): ReconcileResult {
    let current = game;
    const reasons: string[] = [];
    const maxPasses = 10;

    for (let pass = 0; pass < maxPasses; pass++) {
      let passMutated = false;

      // Invariant I5 (Opening Guard): If opening game state, ensure trick is fresh
      if (
        current.counts.length === 4 &&
        current.counts.every((c) => c === 13) &&
        current.winnerRanks.length === 0 &&
        !current.trick.isFresh
      ) {
        current = new CapsaGame({
          ...current,
          trick: Trick.createFresh(current.leaderIndex),
        });
        reasons.push('Invariant I5 (Opening Guard): Reset non-fresh trick on opening game state');
        passMutated = true;
      }

      // Invariant I4 (Endgame Auto-Resolution): If status is playing and <= 1 active seats remain
      if (current.status === 'playing') {
        const activeSeats = [0, 1, 2, 3].filter((s) => (current.counts[s] ?? 0) > 0);
        if (activeSeats.length <= 1) {
          let newWinnerRanks = [...current.winnerRanks];
          // Include any finished seats (0 cards) missing from winnerRanks
          for (let s = 0; s < 4; s++) {
            if ((current.counts[s] ?? 0) === 0 && !newWinnerRanks.includes(s)) {
              newWinnerRanks.push(s);
            }
          }
          // Append the last remaining active seat (4th place)
          if (activeSeats.length === 1 && !newWinnerRanks.includes(activeSeats[0])) {
            newWinnerRanks.push(activeSeats[0]);
          }
          current = new CapsaGame({
            ...current,
            status: 'finished',
            winnerRanks: newWinnerRanks,
          });
          reasons.push('Invariant I4 (Endgame Auto-Resolution): Resolved endgame status to finished');
          passMutated = true;
        }
      }

      // Invariant I2 (Trick Conclusion): If trick has combo and all active opponents passed
      if (current.status === 'playing' && current.trick.lastCombo !== null) {
        const activeSeats = [0, 1, 2, 3].filter((s) => (current.counts[s] ?? 0) > 0);
        const trickWinner =
          current.trick.lastPlaySeatIndex >= 0
            ? current.trick.lastPlaySeatIndex
            : current.leaderIndex;
        const activeOpponents = activeSeats.filter((s) => s !== trickWinner);

        const allOpponentsPassed =
          activeOpponents.length > 0 &&
          activeOpponents.every((s) => current.trick.passedSeats.includes(s));

        if (allOpponentsPassed) {
          const nextLeader =
            (current.counts[trickWinner] ?? 0) > 0
              ? trickWinner
              : CapsaGame.findNextActiveSeat(current.counts, trickWinner);

          current = new CapsaGame({
            ...current,
            turnIndex: nextLeader,
            leaderIndex: nextLeader,
            trick: Trick.createFresh(nextLeader),
          });
          reasons.push(`Invariant I2 (Trick Conclusion): Concluded trick, awarded lead to seat ${nextLeader}`);
          passMutated = true;
        }
      }

      // Invariant I3 (Fresh Lead Sanitization): If trick is fresh but contains stale pass records
      if (
        current.trick.isFresh &&
        (current.trick.passedSeats.length > 0 || current.trick.passCount > 0)
      ) {
        current = new CapsaGame({
          ...current,
          trick: Trick.createFresh(current.leaderIndex),
        });
        reasons.push('Invariant I3 (Fresh Lead Sanitization): Cleared stale pass records on fresh trick');
        passMutated = true;
      }

      // Invariant I1 (Active Seat Integrity): If status is playing and current turn seat has 0 cards
      if (current.status === 'playing' && (current.counts[current.turnIndex] ?? 0) === 0) {
        const nextActive = CapsaGame.findNextActiveSeat(current.counts, current.turnIndex);
        const newLeader = current.trick.isFresh ? nextActive : current.leaderIndex;
        current = new CapsaGame({
          ...current,
          turnIndex: nextActive,
          leaderIndex: newLeader,
          trick: current.trick.isFresh ? Trick.createFresh(newLeader) : current.trick,
        });
        reasons.push(`Invariant I1 (Active Seat Integrity): Advanced turn from empty seat ${current.turnIndex} to active seat ${nextActive}`);
        passMutated = true;
      }

      if (!passMutated) {
        break;
      }
    }

    return {
      game: current,
      healed: reasons.length > 0,
      reasons,
    };
  }

  public reconcile(): ReconcileResult {
    return CapsaGame.reconcile(this);
  }

  // --- Validation ---

  public canPlay(cardsInput: (Card | number)[], seatIndex: number, handCards?: (Card | number)[]): boolean {
    if (this.status !== 'playing' || this.turnIndex !== seatIndex) return false;
    if (this.counts[seatIndex] <= 0) return false;
    if (this.trick.hasPlayerPassed(seatIndex)) return false;

    const cards = Card.sort(cardsInput.map((c) => (typeof c === 'number' ? new Card(c) : c)));
    const combo = CardCombo.evaluate(cards);
    if (!combo) return false;

    if (this.isOpeningMove && !combo.containsCardCode(CARD_3D)) {
      return false;
    }

    if (handCards) {
      const hand = new Hand(handCards);
      if (!hand.hasCards(cards)) return false;
    }

    return this.trick.canPlay(combo, seatIndex);
  }

  public canPass(seatIndex: number): boolean {
    if (this.status !== 'playing' || this.turnIndex !== seatIndex) return false;
    if (this.isOpeningMove) return false; // cannot pass opening move
    if (this.trick.isFresh) return false; // trick leader cannot pass
    if (this.trick.hasPlayerPassed(seatIndex)) return false;
    return true;
  }

  // --- Pure State Transitions ---

  public applyPlay(cardsInput: (Card | number)[], seatIndex: number): CapsaGame {
    const cards = Card.sort(cardsInput.map((c) => (typeof c === 'number' ? new Card(c) : c)));
    const combo = CardCombo.evaluate(cards);
    if (!combo) throw new Error('Invalid combo played');

    const newCounts = [...this.counts];
    newCounts[seatIndex] -= cards.length;

    const newWinnerRanks = [...this.winnerRanks];
    let newStatus = this.status;

    // Check if player shed their hand
    if (newCounts[seatIndex] === 0 && !newWinnerRanks.includes(seatIndex)) {
      newWinnerRanks.push(seatIndex);
    }

    // Check if 4th place endgame is reached (only 1 player remains)
    const activeSeats = newCounts.map((cnt, s) => (cnt > 0 ? s : -1)).filter((s) => s !== -1);
    if (activeSeats.length <= 1) {
      if (activeSeats.length === 1 && !newWinnerRanks.includes(activeSeats[0])) {
        newWinnerRanks.push(activeSeats[0]);
      }
      newStatus = 'finished';
    }

    if (newStatus === 'finished') {
      return new CapsaGame({
        ...this,
        status: 'finished',
        counts: newCounts,
        winnerRanks: newWinnerRanks,
        trick: this.trick.applyPlay(combo, seatIndex),
      });
    }

    // Advance turn to next eligible player in trick
    const updatedTrick = this.trick.applyPlay(combo, seatIndex);
    const nextTurn = updatedTrick.findNextSeat(newCounts, seatIndex);

    if (nextTurn === -1) {
      // All other players passed, trick ends immediately!
      const newLeader = newCounts[seatIndex] > 0
        ? seatIndex
        : this.findNextActiveSeat(seatIndex);

      return new CapsaGame({
        ...this,
        counts: newCounts,
        winnerRanks: newWinnerRanks,
        turnIndex: newLeader,
        leaderIndex: newLeader,
        trick: Trick.createFresh(newLeader),
      });
    }

    return new CapsaGame({
      ...this,
      counts: newCounts,
      winnerRanks: newWinnerRanks,
      turnIndex: nextTurn,
      trick: updatedTrick,
    });
  }

  public applyPass(seatIndex: number): CapsaGame {
    const updatedTrick = this.trick.applyPass(seatIndex);
    const nextTurn = updatedTrick.findNextSeat(this.counts, seatIndex);

    if (nextTurn === -1) {
      // Trick ends! Trick winner leads next trick
      const trickWinner = updatedTrick.trickWinnerSeat;
      const newLeader = this.counts[trickWinner] > 0
        ? trickWinner
        : this.findNextActiveSeat(trickWinner);

      return new CapsaGame({
        ...this,
        turnIndex: newLeader,
        leaderIndex: newLeader,
        trick: Trick.createFresh(newLeader),
      });
    }

    return new CapsaGame({
      ...this,
      turnIndex: nextTurn,
      trick: updatedTrick,
    });
  }

  public applyBotTurn(botHandCards: (Card | number)[]): GameMoveResult {
    const hand = new Hand(botHandCards);
    const decision = BotEngine.decideMove({
      hand,
      trick: this.trick,
      isOpeningMove: this.isOpeningMove,
      counts: this.counts,
      seatIndex: this.turnIndex,
    });

    if (decision.action === 'play') {
      const nextGame = this.applyPlay(decision.cards, this.turnIndex);
      return {
        nextGame,
        action: 'play',
        cards: decision.cards,
        combo: decision.combo,
      };
    } else {
      const nextGame = this.applyPass(this.turnIndex);
      return {
        nextGame,
        action: 'pass',
        cards: [],
      };
    }
  }
}
