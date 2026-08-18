import {
  type Rank,
  type Suit,
  RANK_NAMES,
  SUIT_SYMBOLS,
  SUIT_NAMES,
  CARD_3D,
} from './constants';

/**
 * Pure Immutable Value Object representing a playing card.
 *
 * Encoding:
 * - code (0..51): code = rank * 4 + suit
 * - rank (0..12): 0=3, 1=4, ..., 8=J, 9=Q, 10=K, 11=A, 12=2
 * - suit (0..3):  0=♦, 1=♣, 2=♥, 3=♠
 */
export class Card {
  readonly code: number;
  readonly rank: Rank;
  readonly suit: Suit;

  constructor(code: number) {
    if (!Number.isInteger(code) || code < 0 || code > 51) {
      throw new Error(`Invalid card code: ${code}. Expected integer between 0 and 51.`);
    }
    this.code = code;
    this.rank = Math.floor(code / 4) as Rank;
    this.suit = (code % 4) as Suit;
  }

  // --- Static Factories ---

  public static fromCode(code: number): Card {
    return new Card(code);
  }

  public static fromRankSuit(rank: Rank, suit: Suit): Card {
    return new Card(rank * 4 + suit);
  }

  public static fromString(str: string): Card {
    const trimmed = str.trim();
    if (trimmed.length < 2) {
      throw new Error(`Invalid card string representation: "${str}"`);
    }

    let rankStr: string;
    let suitStr: string;

    if (trimmed.startsWith('10')) {
      rankStr = '10';
      suitStr = trimmed.substring(2);
    } else {
      rankStr = trimmed.substring(0, 1).toUpperCase();
      suitStr = trimmed.substring(1);
    }

    const rankIdx = RANK_NAMES.indexOf(rankStr as any);
    if (rankIdx === -1) {
      throw new Error(`Unknown card rank in string: "${rankStr}"`);
    }

    let suitIdx: number = SUIT_SYMBOLS.indexOf(suitStr as any);
    if (suitIdx === -1) {
      const upperSuit = suitStr.toUpperCase();
      suitIdx = SUIT_NAMES.indexOf(upperSuit as any);
    }

    if (suitIdx === -1) {
      throw new Error(`Unknown card suit in string: "${suitStr}"`);
    }

    return Card.fromRankSuit(rankIdx as Rank, suitIdx as Suit);
  }

  public static sort(cards: Card[]): Card[] {
    return [...cards].sort((a, b) => a.compareTo(b));
  }

  public static sortCodes(codes: number[]): number[] {
    return [...codes].sort((a, b) => a - b);
  }

  // --- Getters & Queries ---

  public get rankName(): string {
    return RANK_NAMES[this.rank];
  }

  public get suitSymbol(): string {
    return SUIT_SYMBOLS[this.suit];
  }

  public get name(): string {
    return `${this.rankName}${this.suitSymbol}`;
  }

  public get isRed(): boolean {
    return this.suit === 0 || this.suit === 2; // ♦ or ♥
  }

  public get is3Diamonds(): boolean {
    return this.code === CARD_3D;
  }

  // --- Comparisons ---

  /**
   * Pure comparison for ascending power (Rank primary, Suit secondary).
   */
  public compareTo(other: Card): number {
    return this.code - other.code;
  }

  public equals(other: Card | null | undefined): boolean {
    return other != null && this.code === other.code;
  }

  public isHigherThan(other: Card): boolean {
    return this.code > other.code;
  }

  public hasSameRank(other: Card): boolean {
    return this.rank === other.rank;
  }

  public hasSameSuit(other: Card): boolean {
    return this.suit === other.suit;
  }

  public toString(): string {
    return this.name;
  }
}
