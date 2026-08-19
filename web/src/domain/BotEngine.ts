import { Card } from './Card';
import { CardCombo } from './CardCombo';
import { Hand } from './Hand';
import { Trick } from './Trick';
import { CARD_3D, RANK_2 } from './constants';

export interface BotDecision {
  action: 'play' | 'pass';
  cards: Card[];
  combo?: CardCombo;
}

/**
 * Pure Domain Bot AI decision engine (Capsa Banting heuristics).
 */
export class BotEngine {
  public static decideMove(params: {
    hand: Hand;
    trick: Trick;
    isOpeningMove?: boolean;
    counts?: number[];
    seatIndex?: number;
  }): BotDecision {
    const { hand, trick, isOpeningMove = false, counts = [13, 13, 13, 13] } = params;

    if (hand.isEmpty) {
      return { action: 'pass', cards: [] };
    }

    // Check if current player or any opponent is in endgame danger (<= 3 cards left)
    const isEndgame = counts.some((cnt) => cnt > 0 && cnt <= 3);

    // 1. Opening Move of the Game (Must include 3♦)
    if (isOpeningMove) {
      return BotEngine.decideOpeningMove(hand);
    }

    // 2. Fresh Trick Lead (No active cards on table)
    if (trick.isFresh) {
      return BotEngine.decideFreshLead(hand, isEndgame);
    }

    // 3. Beating an Active Combo
    return BotEngine.decideBeatMove(hand, trick.lastCombo!, isEndgame);
  }

  // --- Private Decision Strategies ---

  private static decideOpeningMove(hand: Hand): BotDecision {
    // Priority 1: 5-Card combo containing 3♦
    const fiveCardCombos = [
      ...hand.findStraightFlushes(),
      ...hand.findQuads(),
      ...hand.findFullHouses(),
      ...hand.findFlushes(),
      ...hand.findStraights(),
    ];

    const opening5 = fiveCardCombos.find((c) => c.containsCardCode(CARD_3D));
    if (opening5) {
      return { action: 'play', cards: opening5.cards, combo: opening5 };
    }

    // Priority 2: Pair containing 3♦
    const pairs = hand.findPairs();
    const openingPair = pairs.find((c) => c.containsCardCode(CARD_3D));
    if (openingPair) {
      return { action: 'play', cards: openingPair.cards, combo: openingPair };
    }

    // Priority 3: Single 3♦
    const card3D = hand.cards.find((c) => c.code === CARD_3D) || hand.cards[0];
    const combo = CardCombo.evaluate([card3D])!;
    return { action: 'play', cards: [card3D], combo };
  }

  private static decideFreshLead(hand: Hand, isEndgame: boolean): BotDecision {
    const partitioned = hand.decompose();

    // 1. Lead 5-card combo if available
    const fiveCard = partitioned.find((c) => c.is5CardCombo);
    if (fiveCard) {
      return { action: 'play', cards: fiveCard.cards, combo: fiveCard };
    }

    // 2. Lead pairs (saving pair of 2s unless endgame)
    const pairs = partitioned.filter((c) => c.type === 'pair');
    const safePairs = isEndgame ? pairs : pairs.filter((c) => c.mainRank < RANK_2);
    if (safePairs.length > 0) {
      const lowestPair = safePairs[0];
      return { action: 'play', cards: lowestPair.cards, combo: lowestPair };
    }

    // 3. Lead singles (lowest non-2 if possible)
    const singles = partitioned.filter((c) => c.type === 'single');
    const safeSingles = isEndgame ? singles : singles.filter((c) => c.mainRank < RANK_2);
    if (safeSingles.length > 0) {
      const lowestSingle = safeSingles[0];
      return { action: 'play', cards: lowestSingle.cards, combo: lowestSingle };
    }

    // Fallback: play lowest available combo from partition
    if (partitioned.length > 0) {
      const fallback = partitioned[0];
      return { action: 'play', cards: fallback.cards, combo: fallback };
    }

    // Absolute fallback: lowest card
    const firstCard = hand.cards[0];
    const combo = CardCombo.evaluate([firstCard])!;
    return { action: 'play', cards: [firstCard], combo };
  }

  private static decideBeatMove(
    hand: Hand,
    lastCombo: CardCombo,
    isEndgame: boolean
  ): BotDecision {
    // 1. Beating Single
    if (lastCombo.type === 'single') {
      const singles = hand.findSingles();
      const beating = singles.filter((c) => c.canBeat(lastCombo));

      if (beating.length === 0) {
        return { action: 'pass', cards: [] };
      }

      // Do not waste 2s outside of endgame unless beating an Ace
      const non2Beating = beating.filter((c) => c.mainRank < RANK_2);
      if (non2Beating.length > 0) {
        const chosen = non2Beating[0];
        return { action: 'play', cards: chosen.cards, combo: chosen };
      }

      if (isEndgame || lastCombo.mainRank === 11) { // rank 11 is Ace
        const chosen = beating[0];
        return { action: 'play', cards: chosen.cards, combo: chosen };
      }

      return { action: 'pass', cards: [] };
    }

    // 2. Beating Pair
    if (lastCombo.type === 'pair') {
      const pairs = hand.findPairs();
      const beating = pairs.filter((c) => c.canBeat(lastCombo));

      if (beating.length === 0) {
        return { action: 'pass', cards: [] };
      }

      const non2Beating = beating.filter((c) => c.mainRank < RANK_2);
      if (non2Beating.length > 0) {
        const chosen = non2Beating[0];
        return { action: 'play', cards: chosen.cards, combo: chosen };
      }

      if (isEndgame) {
        const chosen = beating[0];
        return { action: 'play', cards: chosen.cards, combo: chosen };
      }

      return { action: 'pass', cards: [] };
    }

    // 3. Beating 5-Card Combo
    if (lastCombo.is5CardCombo) {
      const all5Combos = [
        ...hand.findStraights(),
        ...hand.findFlushes(),
        ...hand.findFullHouses(),
        ...hand.findQuads(),
        ...hand.findStraightFlushes(),
      ];

      const beating = all5Combos
        .filter((c) => c.canBeat(lastCombo))
        .sort((a, b) => a.compareTo(b));

      if (beating.length > 0) {
        const chosen = beating[0];
        return { action: 'play', cards: chosen.cards, combo: chosen };
      }

      return { action: 'pass', cards: [] };
    }

    return { action: 'pass', cards: [] };
  }
}
