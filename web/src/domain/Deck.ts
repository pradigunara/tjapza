import { Card } from './Card';
import { CARD_3D } from './constants';

export interface DealResult {
  hands: Card[][];
  startingSeat: number;
}

/**
 * Pure Domain Deck representation.
 */
export class Deck {
  readonly cards: Card[];

  constructor(cards?: Card[]) {
    if (cards) {
      this.cards = cards;
    } else {
      this.cards = Array.from({ length: 52 }, (_, i) => new Card(i));
    }
  }

  public static createStandard(): Deck {
    return new Deck();
  }

  /**
   * Pure deterministic/injected shuffle or default random shuffle.
   */
  public shuffle(randomFn: () => number = Math.random): Deck {
    const arr = [...this.cards];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return new Deck(arr);
  }

  /**
   * Deal 52 cards equally among 4 seats.
   * Returns sorted hands and identifies which seat holds 3♦.
   */
  public deal(playerCount = 4): DealResult {
    const hands: Card[][] = Array.from({ length: playerCount }, () => []);
    let startingSeat = 0;

    for (let i = 0; i < this.cards.length; i++) {
      const seat = i % playerCount;
      const card = this.cards[i];
      hands[seat].push(card);
      if (card.code === CARD_3D) {
        startingSeat = seat;
      }
    }

    // Sort all dealt hands in ascending power
    for (let s = 0; s < playerCount; s++) {
      hands[s] = Card.sort(hands[s]);
    }

    return {
      hands,
      startingSeat,
    };
  }
}
