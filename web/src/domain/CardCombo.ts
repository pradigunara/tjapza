import { Card } from './Card';
import {
  type ComboType,
  CATEGORY_TIERS,
  RANK_NAMES,
  SUIT_SYMBOLS,
} from './constants';

export interface StraightPattern {
  order: number;
  ranks: [number, number, number, number, number];
  topRank: number;
  name: string;
}

/**
 * 11 Valid Straight patterns in ascending power order (0..10).
 * - Pattern 0: A-2-3-4-5 (top card rank = 2 / '5')
 * - Pattern 1: 2-3-4-5-6 (top card rank = 3 / '6')
 * - Pattern 2: 3-4-5-6-7 (top card rank = 4 / '7')
 * - ...
 * - Pattern 9: 10-J-Q-K-A (top card rank = 11 / 'A')
 * - Pattern 10: J-Q-K-A-2 (top card rank = 12 / '2')
 */
export const STRAIGHT_PATTERNS: StraightPattern[] = [
  { order: 0, ranks: [0, 1, 2, 11, 12], topRank: 2, name: 'A-2-3-4-5' },
  { order: 1, ranks: [0, 1, 2, 3, 12], topRank: 3, name: '2-3-4-5-6' },
  { order: 2, ranks: [0, 1, 2, 3, 4], topRank: 4, name: '3-4-5-6-7' },
  { order: 3, ranks: [1, 2, 3, 4, 5], topRank: 5, name: '4-5-6-7-8' },
  { order: 4, ranks: [2, 3, 4, 5, 6], topRank: 6, name: '5-6-7-8-9' },
  { order: 5, ranks: [3, 4, 5, 6, 7], topRank: 7, name: '6-7-8-9-10' },
  { order: 6, ranks: [4, 5, 6, 7, 8], topRank: 8, name: '7-8-9-10-J' },
  { order: 7, ranks: [5, 6, 7, 8, 9], topRank: 9, name: '8-9-10-J-Q' },
  { order: 8, ranks: [6, 7, 8, 9, 10], topRank: 10, name: '9-10-J-Q-K' },
  { order: 9, ranks: [7, 8, 9, 10, 11], topRank: 11, name: '10-J-Q-K-A' },
  { order: 10, ranks: [8, 9, 10, 11, 12], topRank: 12, name: 'J-Q-K-A-2' },
];

/**
 * Pure Immutable Domain Entity representing a valid Capsa Banting card combination.
 */
export class CardCombo {
  readonly type: ComboType;
  readonly cards: Card[];
  readonly categoryTier: number;
  readonly mainRank: number;
  readonly suit: number;
  readonly straightOrder?: number;
  readonly ranksDesc?: number[];

  constructor(params: {
    type: ComboType;
    cards: Card[];
    categoryTier: number;
    mainRank: number;
    suit: number;
    straightOrder?: number;
    ranksDesc?: number[];
  }) {
    this.type = params.type;
    this.cards = Card.sort(params.cards);
    this.categoryTier = params.categoryTier;
    this.mainRank = params.mainRank;
    this.suit = params.suit;
    this.straightOrder = params.straightOrder;
    this.ranksDesc = params.ranksDesc;
  }

  // --- Evaluation Factory ---

  public static evaluate(input: (Card | number)[]): CardCombo | null {
    if (!input || (input.length !== 1 && input.length !== 2 && input.length !== 5)) {
      return null;
    }

    const cards = Card.sort(
      input.map((c) => (typeof c === 'number' ? new Card(c) : c))
    );

    const count = cards.length;

    // 1. Single Card
    if (count === 1) {
      const card = cards[0];
      return new CardCombo({
        type: 'single',
        cards,
        categoryTier: 0,
        mainRank: card.rank,
        suit: card.suit,
      });
    }

    // 2. Pair
    if (count === 2) {
      if (cards[0].rank === cards[1].rank) {
        return new CardCombo({
          type: 'pair',
          cards,
          categoryTier: 0,
          mainRank: cards[0].rank,
          suit: cards[1].suit, // highest card suit in pair
        });
      }
      return null;
    }

    // 3. 5-Card Combinations
    return CardCombo.evaluate5Cards(cards);
  }

  private static evaluate5Cards(cards: Card[]): CardCombo | null {
    const ranks = cards.map((c) => c.rank);
    const suits = cards.map((c) => c.suit);

    const rankCounts: Record<number, number> = {};
    for (const r of ranks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const counts = Object.values(rankCounts).sort((a, b) => b - a);

    const isFlush = suits.every((s) => s === suits[0]);
    const straightMatch = CardCombo.findStraightPattern(ranks);

    // 3a. Straight Flush
    if (isFlush && straightMatch) {
      const topCard = cards.find((c) => c.rank === straightMatch.topRank)!;
      return new CardCombo({
        type: 'straight_flush',
        cards,
        categoryTier: CATEGORY_TIERS.straight_flush,
        mainRank: straightMatch.topRank,
        suit: topCard.suit,
        straightOrder: straightMatch.order,
      });
    }

    // 3b. Four of a Kind (Quads)
    if (counts[0] === 4) {
      let quadRank = 0;
      for (const [rStr, cnt] of Object.entries(rankCounts)) {
        if (cnt === 4) quadRank = Number(rStr);
      }
      return new CardCombo({
        type: 'quads',
        cards,
        categoryTier: CATEGORY_TIERS.quads,
        mainRank: quadRank,
        suit: 0, // rank is unique in single deck
      });
    }

    // 3c. Full House
    if (counts[0] === 3 && counts[1] === 2) {
      let tripleRank = 0;
      for (const [rStr, cnt] of Object.entries(rankCounts)) {
        if (cnt === 3) tripleRank = Number(rStr);
      }
      return new CardCombo({
        type: 'full_house',
        cards,
        categoryTier: CATEGORY_TIERS.full_house,
        mainRank: tripleRank,
        suit: 0,
      });
    }

    // 3d. Flush
    if (isFlush) {
      const ranksDesc = [...ranks].reverse();
      return new CardCombo({
        type: 'flush',
        cards,
        categoryTier: CATEGORY_TIERS.flush,
        mainRank: ranksDesc[0],
        suit: suits[0],
        ranksDesc,
      });
    }

    // 3e. Straight
    if (straightMatch) {
      const topCard = cards.find((c) => c.rank === straightMatch.topRank)!;
      return new CardCombo({
        type: 'straight',
        cards,
        categoryTier: CATEGORY_TIERS.straight,
        mainRank: straightMatch.topRank,
        suit: topCard.suit,
        straightOrder: straightMatch.order,
      });
    }

    return null;
  }

  private static findStraightPattern(sortedRanks: number[]): StraightPattern | null {
    for (const pattern of STRAIGHT_PATTERNS) {
      const pRanks = [...pattern.ranks].sort((a, b) => a - b);
      if (sortedRanks.every((r, idx) => r === pRanks[idx])) {
        return pattern;
      }
    }
    return null;
  }

  // --- Getters & Queries ---

  public get cardCodes(): number[] {
    return this.cards.map((c) => c.code);
  }

  public get cardCount(): number {
    return this.cards.length;
  }

  public get is5CardCombo(): boolean {
    return this.cardCount === 5;
  }

  public containsCardCode(code: number): boolean {
    return this.cards.some((c) => c.code === code);
  }

  public get description(): string {
    const mainRankName = RANK_NAMES[this.mainRank] ?? '';
    const suitSymbol = SUIT_SYMBOLS[this.suit] ?? '';

    switch (this.type) {
      case 'single':
        return `${mainRankName}${suitSymbol}`;
      case 'pair':
        return `Pair of ${mainRankName}s`;
      case 'straight':
        return `Straight (${STRAIGHT_PATTERNS[this.straightOrder ?? 0]?.name ?? mainRankName})`;
      case 'flush':
        return `Flush (${suitSymbol})`;
      case 'full_house':
        return `Full House (${mainRankName}s full)`;
      case 'quads':
        return `Four of a Kind (${mainRankName}s)`;
      case 'straight_flush':
        return `Straight Flush (${suitSymbol})`;
    }
  }

  // --- Power Comparison ---

  public get power(): number {
    return this.calculatedPower;
  }

  /**
   * Pure power integer for ordering in SQLite moves table.
   */
  public get calculatedPower(): number {
    switch (this.type) {
      case 'single':
        return this.cards[0].code;
      case 'pair':
        return this.mainRank * 4 + this.suit;
      case 'straight':
        return 10000000 + (this.straightOrder ?? 0) * 4 + this.suit;
      case 'flush': {
        const d = this.ranksDesc || [this.mainRank, 0, 0, 0, 0];
        const poly = d[0] * 28561 + d[1] * 2197 + d[2] * 169 + d[3] * 13 + d[4];
        return 20000000 + poly * 4 + this.suit;
      }
      case 'full_house':
        return 30000000 + this.mainRank * 100;
      case 'quads':
        return 40000000 + this.mainRank * 100;
      case 'straight_flush':
        return 50000000 + (this.straightOrder ?? 0) * 4 + this.suit;
    }
  }

  /**
   * Compare two combos: returns positive if this > other, negative if this < other, 0 if equal.
   */
  public compareTo(other: CardCombo): number {
    // 1. Single vs Single or Pair vs Pair
    if (this.type === 'single' && other.type === 'single') {
      if (this.mainRank !== other.mainRank) return this.mainRank - other.mainRank;
      return this.suit - other.suit;
    }

    if (this.type === 'pair' && other.type === 'pair') {
      if (this.mainRank !== other.mainRank) return this.mainRank - other.mainRank;
      return this.suit - other.suit;
    }

    // 2. 5-Card Combinations
    if (this.is5CardCombo && other.is5CardCombo) {
      if (this.categoryTier !== other.categoryTier) {
        return this.categoryTier - other.categoryTier;
      }

      // Same 5-card category tier
      switch (this.type) {
        case 'straight':
        case 'straight_flush': {
          if (this.straightOrder !== other.straightOrder) {
            return (this.straightOrder ?? 0) - (other.straightOrder ?? 0);
          }
          return this.suit - other.suit;
        }
        case 'flush': {
          const aRanks = this.ranksDesc || [];
          const bRanks = other.ranksDesc || [];
          for (let i = 0; i < 5; i++) {
            const diff = (aRanks[i] ?? 0) - (bRanks[i] ?? 0);
            if (diff !== 0) return diff;
          }
          return this.suit - other.suit;
        }
        case 'full_house':
        case 'quads':
          return this.mainRank - other.mainRank;
      }
    }

    // Incompatible combo types
    return 0;
  }

  /**
   * Pure predicate: can this combo beat the target combo?
   */
  public canBeat(target: CardCombo | null): boolean {
    if (!target) return true;
    if (this.cardCount !== target.cardCount) return false;
    return this.compareTo(target) > 0;
  }
}
