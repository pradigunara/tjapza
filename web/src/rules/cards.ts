/**
 * Capsa Banting (Big Two) Rules Engine & Bot AI
 * 
 * Standard 52-card deck encoding:
 * - Rank (0..12): 0=3, 1=4, 2=5, 3=6, 4=7, 5=8, 6=9, 7=10, 8=J, 9=Q, 10=K, 11=A, 12=2
 * - Suit (0..3):  0=♦ (Diamonds), 1=♣ (Clubs), 2=♥ (Hearts), 3=♠ (Spades)
 * - Code (0..51): code = rank * 4 + suit
 */

export type Suit = 0 | 1 | 2 | 3;
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const SUIT_DIAMONDS: Suit = 0;
export const SUIT_CLUBS: Suit = 1;
export const SUIT_HEARTS: Suit = 2;
export const SUIT_SPADES: Suit = 3;

export const RANK_3: Rank = 0;
export const RANK_4: Rank = 1;
export const RANK_5: Rank = 2;
export const RANK_6: Rank = 3;
export const RANK_7: Rank = 4;
export const RANK_8: Rank = 5;
export const RANK_9: Rank = 6;
export const RANK_10: Rank = 7;
export const RANK_J: Rank = 8;
export const RANK_Q: Rank = 9;
export const RANK_K: Rank = 10;
export const RANK_A: Rank = 11;
export const RANK_2: Rank = 12;

export const CARD_3D = 0; // 3♦ (Rank 0, Suit 0)

// Game Timing Constants
export const TURN_TIMEOUT_SECS = 60; // 60s human turn timer
export const TURN_TIMEOUT_MS = TURN_TIMEOUT_SECS * 1000; // 60,000 ms
export const PUBLIC_LOBBY_AUTOSTART_SECS = 30; // 30s public lobby auto-fill countdown
export const PUBLIC_LOBBY_AUTOSTART_MS = PUBLIC_LOBBY_AUTOSTART_SECS * 1000; // 30,000 ms

export const SUIT_SYMBOLS = ['♦', '♣', '♥', '♠'] as const;
export const SUIT_NAMES = ['D', 'C', 'H', 'S'] as const;
export const RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;

export type ComboType =
  | 'single'
  | 'pair'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'quads'
  | 'straight_flush';

export const CATEGORY_TIERS: Record<string, number> = {
  straight: 1,
  flush: 2,
  full_house: 3,
  quads: 4,
  straight_flush: 5,
};

/**
 * 10 Valid Straight patterns in ascending power order (0..9).
 * - Pattern 0: A-2-3-4-5 (ranks [0, 1, 2, 11, 12], top card rank = 2 / '5')
 * - Pattern 1: 3-4-5-6-7 (ranks [0, 1, 2, 3, 4], top card rank = 4 / '7')
 * - ...
 * - Pattern 8: 10-J-Q-K-A (ranks [7, 8, 9, 10, 11], top card rank = 11 / 'A')
 * - Pattern 9: J-Q-K-A-2 (ranks [8, 9, 10, 11, 12], top card rank = 12 / '2')
 */
export interface StraightPattern {
  order: number;
  ranks: [number, number, number, number, number];
  topRank: number;
  name: string;
}

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

export interface Combo {
  type: ComboType;
  cards: number[]; // sorted card codes
  categoryTier: number; // 0 for single/pair, 1..5 for 5-card combos
  mainRank: number; // primary comparison rank
  suit: number; // primary comparison suit
  straightOrder?: number; // 0..9 for straight / straight_flush
  ranksDesc?: number[]; // descending ranks for flush comparison
}

// -----------------------------------------------------------------------------
// Card Utilities
// -----------------------------------------------------------------------------

export function getRank(card: number): number {
  return Math.floor(card / 4);
}

export function getSuit(card: number): number {
  return card % 4;
}

export function makeCard(rank: number, suit: number): number {
  return rank * 4 + suit;
}

export function sortCards(cards: number[]): number[] {
  return [...cards].sort((a, b) => a - b);
}

export function sortCardsInPlace(cards: number[]): number[] {
  return cards.sort((a, b) => a - b);
}

export function cardToString(card: number): string {
  const rank = getRank(card);
  const suit = getSuit(card);
  return `${RANK_NAMES[rank]}${SUIT_SYMBOLS[suit]}`;
}

export function stringToCard(str: string): number {
  const clean = str.trim();
  let rankStr = '';
  let suitStr = '';

  if (clean.startsWith('10')) {
    rankStr = '10';
    suitStr = clean.slice(2);
  } else {
    rankStr = clean.slice(0, 1);
    suitStr = clean.slice(1);
  }

  let rank = (RANK_NAMES as readonly string[]).indexOf(rankStr.toUpperCase() as any);
  if (rank === -1) {
    if (rankStr.toUpperCase() === 'T') rank = 7;
    else throw new Error(`Invalid card rank string: ${str}`);
  }

  let suit = (SUIT_SYMBOLS as readonly string[]).indexOf(suitStr as any);
  if (suit === -1) {
    suit = (SUIT_NAMES as readonly string[]).indexOf(suitStr.toUpperCase() as any);
  }
  if (suit === -1) {
    throw new Error(`Invalid card suit string: ${str}`);
  }

  return makeCard(rank, suit);
}

// -----------------------------------------------------------------------------
// Combo Classification
// -----------------------------------------------------------------------------

function matchStraightPattern(sortedRanks: number[]): StraightPattern | null {
  if (sortedRanks.length !== 5) return null;
  for (let i = 0; i < STRAIGHT_PATTERNS.length; i++) {
    const p = STRAIGHT_PATTERNS[i];
    let match = true;
    for (let j = 0; j < 5; j++) {
      if (sortedRanks[j] !== p.ranks[j]) {
        match = false;
        break;
      }
    }
    if (match) return p;
  }
  return null;
}

export function classifyCombo(cards: number[]): Combo | null {
  if (!cards || !cards.length) return null;
  const sorted = sortCards(cards);
  const len = sorted.length;

  if (len === 1) {
    const c = sorted[0];
    return {
      type: 'single',
      cards: sorted,
      categoryTier: 0,
      mainRank: getRank(c),
      suit: getSuit(c),
    };
  }

  if (len === 2) {
    const r0 = getRank(sorted[0]);
    const r1 = getRank(sorted[1]);
    if (r0 === r1) {
      const s0 = getSuit(sorted[0]);
      const s1 = getSuit(sorted[1]);
      return {
        type: 'pair',
        cards: sorted,
        categoryTier: 0,
        mainRank: r0,
        suit: Math.max(s0, s1),
      };
    }
    return null;
  }

  if (len === 5) {
    // Count ranks and suits
    const rankCounts: Record<number, number> = {};
    const suitCounts: Record<number, number> = {};
    const uniqueRanks: number[] = [];

    for (let i = 0; i < 5; i++) {
      const c = sorted[i];
      const r = getRank(c);
      const s = getSuit(c);

      if (!rankCounts[r]) {
        rankCounts[r] = 0;
        uniqueRanks.push(r);
      }
      rankCounts[r]++;

      suitCounts[s] = (suitCounts[s] || 0) + 1;
    }

    uniqueRanks.sort((a, b) => a - b);
    const isFlush = Object.keys(suitCounts).length === 1;
    const straightPattern = uniqueRanks.length === 5 ? matchStraightPattern(uniqueRanks) : null;

    // 1. Straight Flush
    if (isFlush && straightPattern) {
      // Find top determining card
      const topRank = straightPattern.topRank;
      let topCard = sorted[4];
      for (let i = 0; i < 5; i++) {
        if (getRank(sorted[i]) === topRank) {
          topCard = sorted[i];
          break;
        }
      }
      return {
        type: 'straight_flush',
        cards: sorted,
        categoryTier: CATEGORY_TIERS.straight_flush,
        mainRank: topRank,
        suit: getSuit(topCard),
        straightOrder: straightPattern.order,
      };
    }

    // 2. Four of a Kind (Quads)
    if (uniqueRanks.length === 2) {
      let quadRank = -1;
      for (const rStr in rankCounts) {
        const r = Number(rStr);
        if (rankCounts[r] === 4) {
          quadRank = r;
          break;
        }
      }
      if (quadRank !== -1) {
        return {
          type: 'quads',
          cards: sorted,
          categoryTier: CATEGORY_TIERS.quads,
          mainRank: quadRank,
          suit: 0,
        };
      }

      // 3. Full House
      let tripleRank = -1;
      let pairRank = -1;
      for (const rStr in rankCounts) {
        const r = Number(rStr);
        if (rankCounts[r] === 3) tripleRank = r;
        if (rankCounts[r] === 2) pairRank = r;
      }
      if (tripleRank !== -1 && pairRank !== -1) {
        return {
          type: 'full_house',
          cards: sorted,
          categoryTier: CATEGORY_TIERS.full_house,
          mainRank: tripleRank,
          suit: 0,
        };
      }
    }

    // 4. Flush
    if (isFlush) {
      const ranksDesc = sorted.map((c) => getRank(c)).sort((a, b) => b - a);
      const highestCard = sorted[4]; // highest card in sorted array
      return {
        type: 'flush',
        cards: sorted,
        categoryTier: CATEGORY_TIERS.flush,
        mainRank: getRank(highestCard),
        suit: getSuit(highestCard),
        ranksDesc,
      };
    }

    // 5. Straight
    if (straightPattern) {
      const topRank = straightPattern.topRank;
      let topCard = sorted[4];
      for (let i = 0; i < 5; i++) {
        if (getRank(sorted[i]) === topRank) {
          topCard = sorted[i];
          break;
        }
      }
      return {
        type: 'straight',
        cards: sorted,
        categoryTier: CATEGORY_TIERS.straight,
        mainRank: topRank,
        suit: getSuit(topCard),
        straightOrder: straightPattern.order,
      };
    }

    return null;
  }

  // Lengths 0, 3, 4, >5 are not legal combinations
  return null;
}

// -----------------------------------------------------------------------------
// Combo Comparison & Beating Logic
// -----------------------------------------------------------------------------

/**
 * Compare two combos of the same combo class.
 * Returns > 0 if a beats b, < 0 if b beats a, 0 if equal.
 */
export function compareCombos(a: Combo, b: Combo): number {
  if (a.type === 'single' && b.type === 'single') {
    return a.cards[0] - b.cards[0];
  }

  if (a.type === 'pair' && b.type === 'pair') {
    if (a.mainRank !== b.mainRank) {
      return a.mainRank - b.mainRank;
    }
    return a.suit - b.suit;
  }

  // 5-Card Combos
  if (a.categoryTier !== b.categoryTier) {
    return a.categoryTier - b.categoryTier;
  }

  // Same 5-card category
  if (a.type === 'straight' && b.type === 'straight') {
    if (a.straightOrder !== b.straightOrder) {
      return (a.straightOrder ?? 0) - (b.straightOrder ?? 0);
    }
    return a.suit - b.suit;
  }

  if (a.type === 'flush' && b.type === 'flush') {
    // Rank-first tiebreaker
    const rA = a.ranksDesc || [];
    const rB = b.ranksDesc || [];
    for (let i = 0; i < 5; i++) {
      const rankA = rA[i] !== undefined ? rA[i] : -1;
      const rankB = rB[i] !== undefined ? rB[i] : -1;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
    }
    // All 5 ranks are tied, compare suit of highest card
    return a.suit - b.suit;
  }

  if (a.type === 'full_house' && b.type === 'full_house') {
    return a.mainRank - b.mainRank;
  }

  if (a.type === 'quads' && b.type === 'quads') {
    return a.mainRank - b.mainRank;
  }

  if (a.type === 'straight_flush' && b.type === 'straight_flush') {
    if (a.straightOrder !== b.straightOrder) {
      return (a.straightOrder ?? 0) - (b.straightOrder ?? 0);
    }
    return a.suit - b.suit;
  }

  return 0;
}

/**
 * Checks if newCardsOrCombo can legally beat previousCardsOrCombo.
 */
export function canBeat(
  previousCardsOrCombo: number[] | Combo,
  newCardsOrCombo: number[] | Combo
): boolean {
  const prevCombo = Array.isArray(previousCardsOrCombo)
    ? classifyCombo(previousCardsOrCombo)
    : previousCardsOrCombo;
  const newCombo = Array.isArray(newCardsOrCombo)
    ? classifyCombo(newCardsOrCombo)
    : newCardsOrCombo;

  if (!prevCombo || !newCombo) return false;

  // Single can only beat Single
  if (prevCombo.type === 'single') {
    if (newCombo.type !== 'single') return false;
    return compareCombos(newCombo, prevCombo) > 0;
  }

  // Pair can only beat Pair
  if (prevCombo.type === 'pair') {
    if (newCombo.type !== 'pair') return false;
    return compareCombos(newCombo, prevCombo) > 0;
  }

  // 5-Card combo can be beaten by a higher 5-card category or higher combo in same category
  if (prevCombo.categoryTier > 0) {
    if (newCombo.categoryTier <= 0) return false;
    return compareCombos(newCombo, prevCombo) > 0;
  }

  return false;
}

/**
 * Opening Move Validation:
 * The opening move of the game MUST contain 3♦ (card code 0) and be a legal combo.
 */
export function isOpeningMoveValid(cards: number[]): boolean {
  if (!cards || !cards.length) return false;
  if (!cards.includes(CARD_3D)) return false;
  const combo = classifyCombo(cards);
  return combo !== null;
}

/**
 * Checks if a play is completely valid given a player's hand and game state.
 */
export function isValidPlay(
  hand: number[],
  playedCards: number[],
  lastCombo: Combo | number[] | null,
  isOpeningTrick: boolean
): boolean {
  if (!playedCards || !playedCards.length) return false;

  // Hand must contain all played cards
  const handSet = new Set(hand);
  for (const c of playedCards) {
    if (!handSet.has(c)) return false;
  }

  const combo = classifyCombo(playedCards);
  if (!combo) return false;

  if (isOpeningTrick) {
    return isOpeningMoveValid(playedCards);
  }

  if (!lastCombo) {
    // Leading a fresh trick: any valid combo is allowed
    return true;
  }

  return canBeat(lastCombo, combo);
}

// -----------------------------------------------------------------------------
// Combo Finders (for hand inspection & Bot AI)
// -----------------------------------------------------------------------------

export function findSingles(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const combos: Combo[] = [];
  for (const c of sorted) {
    const combo = classifyCombo([c]);
    if (combo) combos.push(combo);
  }
  return combos;
}

export function findPairs(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const combos: Combo[] = [];
  const rankGroups: Record<number, number[]> = {};

  for (const c of sorted) {
    const r = getRank(c);
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(c);
  }

  for (const rStr in rankGroups) {
    const group = rankGroups[rStr];
    if (group.length >= 2) {
      for (let i = 0; i < group.length - 1; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const combo = classifyCombo([group[i], group[j]]);
          if (combo) combos.push(combo);
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findStraights(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const rankCards: Record<number, number[]> = {};

  for (const c of sorted) {
    const r = getRank(c);
    if (!rankCards[r]) rankCards[r] = [];
    rankCards[r].push(c);
  }

  const combos: Combo[] = [];

  for (const pattern of STRAIGHT_PATTERNS) {
    const [r0, r1, r2, r3, r4] = pattern.ranks;
    if (
      rankCards[r0] &&
      rankCards[r1] &&
      rankCards[r2] &&
      rankCards[r3] &&
      rankCards[r4]
    ) {
      // Form all possible combinations of cards for these 5 ranks
      for (const c0 of rankCards[r0]) {
        for (const c1 of rankCards[r1]) {
          for (const c2 of rankCards[r2]) {
            for (const c3 of rankCards[r3]) {
              for (const c4 of rankCards[r4]) {
                const cards = [c0, c1, c2, c3, c4];
                const combo = classifyCombo(cards);
                if (combo && combo.type === 'straight') {
                  combos.push(combo);
                }
              }
            }
          }
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findFlushes(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const suitCards: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };

  for (const c of sorted) {
    suitCards[getSuit(c)].push(c);
  }

  const combos: Combo[] = [];

  for (let s = 0; s < 4; s++) {
    const list = suitCards[s];
    const n = list.length;
    if (n >= 5) {
      // Combinations of 5 cards from n
      for (let i = 0; i < n - 4; i++) {
        for (let j = i + 1; j < n - 3; j++) {
          for (let k = j + 1; k < n - 2; k++) {
            for (let l = k + 1; l < n - 1; l++) {
              for (let m = l + 1; m < n; m++) {
                const cards = [list[i], list[j], list[k], list[l], list[m]];
                const combo = classifyCombo(cards);
                if (combo && combo.type === 'flush') {
                  combos.push(combo);
                }
              }
            }
          }
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findFullHouses(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const rankGroups: Record<number, number[]> = {};

  for (const c of sorted) {
    const r = getRank(c);
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(c);
  }

  const combos: Combo[] = [];
  const ranksWith3Plus: number[] = [];
  const ranksWith2Plus: number[] = [];

  for (const rStr in rankGroups) {
    const r = Number(rStr);
    if (rankGroups[r].length >= 3) ranksWith3Plus.push(r);
    if (rankGroups[r].length >= 2) ranksWith2Plus.push(r);
  }

  for (const tripRank of ranksWith3Plus) {
    const tripCards = rankGroups[tripRank];
    // Combinations of 3 from tripCards
    for (let i = 0; i < tripCards.length - 2; i++) {
      for (let j = i + 1; j < tripCards.length - 1; j++) {
        for (let k = j + 1; k < tripCards.length; k++) {
          const three = [tripCards[i], tripCards[j], tripCards[k]];

          for (const pairRank of ranksWith2Plus) {
            if (pairRank === tripRank) continue;
            const pairCards = rankGroups[pairRank];
            for (let p1 = 0; p1 < pairCards.length - 1; p1++) {
              for (let p2 = p1 + 1; p2 < pairCards.length; p2++) {
                const cards = [...three, pairCards[p1], pairCards[p2]];
                const combo = classifyCombo(cards);
                if (combo && combo.type === 'full_house') {
                  combos.push(combo);
                }
              }
            }
          }
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findQuads(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const rankGroups: Record<number, number[]> = {};

  for (const c of sorted) {
    const r = getRank(c);
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(c);
  }

  const combos: Combo[] = [];

  for (const rStr in rankGroups) {
    const r = Number(rStr);
    const quadCards = rankGroups[r];
    if (quadCards.length === 4) {
      // Any other card in hand as kicker
      for (const kicker of sorted) {
        if (getRank(kicker) === r) continue;
        const cards = [...quadCards, kicker];
        const combo = classifyCombo(cards);
        if (combo && combo.type === 'quads') {
          combos.push(combo);
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findStraightFlushes(hand: number[]): Combo[] {
  const sorted = sortCards(hand);
  const suitCards: Record<number, number[]> = { 0: [], 1: [], 2: [], 3: [] };

  for (const c of sorted) {
    suitCards[getSuit(c)].push(c);
  }

  const combos: Combo[] = [];

  for (let s = 0; s < 4; s++) {
    const list = suitCards[s];
    if (list.length >= 5) {
      const rankMap: Record<number, number> = {};
      for (const c of list) {
        rankMap[getRank(c)] = c;
      }

      for (const pattern of STRAIGHT_PATTERNS) {
        const [r0, r1, r2, r3, r4] = pattern.ranks;
        if (
          rankMap[r0] !== undefined &&
          rankMap[r1] !== undefined &&
          rankMap[r2] !== undefined &&
          rankMap[r3] !== undefined &&
          rankMap[r4] !== undefined
        ) {
          const cards = [rankMap[r0], rankMap[r1], rankMap[r2], rankMap[r3], rankMap[r4]];
          const combo = classifyCombo(cards);
          if (combo && combo.type === 'straight_flush') {
            combos.push(combo);
          }
        }
      }
    }
  }

  combos.sort((a, b) => compareCombos(a, b));
  return combos;
}

export function findAll5CardCombos(hand: number[]): Combo[] {
  const all = [
    ...findStraights(hand),
    ...findFlushes(hand),
    ...findFullHouses(hand),
    ...findQuads(hand),
    ...findStraightFlushes(hand),
  ];
  all.sort((a, b) => compareCombos(a, b));
  return all;
}

export function findAllLegalCombos(hand: number[]): Combo[] {
  return [
    ...findSingles(hand),
    ...findPairs(hand),
    ...findAll5CardCombos(hand),
  ];
}

export function findAllBeatingCombos(
  hand: number[],
  lastCombo: Combo | number[]
): Combo[] {
  const target = Array.isArray(lastCombo) ? classifyCombo(lastCombo) : lastCombo;
  if (!target) return [];

  let candidates: Combo[] = [];
  if (target.type === 'single') {
    candidates = findSingles(hand);
  } else if (target.type === 'pair') {
    candidates = findPairs(hand);
  } else if (target.categoryTier > 0) {
    candidates = findAll5CardCombos(hand);
  }

  return candidates.filter((c) => compareCombos(c, target) > 0);
}

// -----------------------------------------------------------------------------
// Advanced Hand Partitioning & Bot AI
// -----------------------------------------------------------------------------

/**
 * Decomposes a hand into a partition of non-overlapping combinations that minimizes
 * the total number of moves (turns) required to empty the hand.
 */
export function decomposeHand(hand: number[]): Combo[] {
  if (!hand || hand.length === 0) return [];
  const sorted = sortCards(hand);

  let bestPartition: Combo[] = [];
  let minTurns = 999;

  function search(remaining: number[], current: Combo[]) {
    if (remaining.length === 0) {
      if (current.length < minTurns) {
        minTurns = current.length;
        bestPartition = [...current];
      }
      return;
    }

    // Pruning: if current count >= minTurns, can't beat best
    if (current.length + 1 >= minTurns && minTurns !== 999) {
      return;
    }

    // 1. Try 5-card combos
    if (remaining.length >= 5) {
      const fiveCombos = findAll5CardCombos(remaining);
      for (const combo of fiveCombos) {
        const nextRem = remaining.filter((c) => !combo.cards.includes(c));
        search(nextRem, [...current, combo]);
      }
    }

    // 2. Try Pairs
    if (remaining.length >= 2) {
      const pairs = findPairs(remaining);
      for (const pair of pairs) {
        const nextRem = remaining.filter((c) => !pair.cards.includes(c));
        search(nextRem, [...current, pair]);
      }
    }

    // 3. Base fallback: All remaining cards as singles
    const singles = findSingles(remaining);
    const fullPartition = [...current, ...singles];
    if (fullPartition.length < minTurns) {
      minTurns = fullPartition.length;
      bestPartition = fullPartition;
    }
  }

  search(sorted, []);
  // Sort partition: 5-card combos first, then pairs, then singles (ascending power)
  bestPartition.sort((a, b) => {
    if (a.cards.length !== b.cards.length) {
      return b.cards.length - a.cards.length; // 5-card > 2-card > 1-card
    }
    return compareCombos(a, b);
  });
  return bestPartition;
}

/**
 * Determines the best move for a bot given the hand and current game state.
 * Returns card codes to play, or `null` to pass.
 */
export function getBotMove(
  hand: number[],
  lastCombo: Combo | number[] | null,
  isOpeningTrick: boolean,
  opponentMinCards = 13
): number[] | null {
  if (!hand || hand.length === 0) return null;
  const sortedHand = sortCards(hand);
  const isEndgame = opponentMinCards <= 3;

  // Rank distribution for conservation analysis
  const rankCounts: Record<number, number> = {};
  for (const c of sortedHand) {
    const r = getRank(c);
    rankCounts[r] = (rankCounts[r] || 0) + 1;
  }

  // Compute optimal hand partition (Minimum Moves to Empty Hand)
  const partition = decomposeHand(sortedHand);

  // 1. OPENING TRICK (Must include 3♦)
  if (isOpeningTrick) {
    if (!sortedHand.includes(CARD_3D)) return null;

    // Check if any combo in optimal partition contains 3♦
    const partitionWith3D = partition.filter((c) => c.cards.includes(CARD_3D));
    if (partitionWith3D.length > 0) {
      return partitionWith3D[0].cards;
    }

    // Fallback: Check 5-card combos containing 3♦
    const fiveCardCombos = findAll5CardCombos(sortedHand).filter((c) =>
      c.cards.includes(CARD_3D)
    );
    if (fiveCardCombos.length > 0) {
      return fiveCardCombos[0].cards;
    }

    // Check pairs containing 3♦
    const pairs = findPairs(sortedHand).filter((c) => c.cards.includes(CARD_3D));
    if (pairs.length > 0) {
      return pairs[0].cards;
    }

    // Single 3♦
    return [CARD_3D];
  }

  // 2. LEADING A FRESH TRICK
  if (!lastCombo) {
    // Lead lowest combo from optimal partition to preserve clean decomposition
    if (partition.length > 0) {
      // 2a. Prefer 5-card combo from partition
      const fiveCombos = partition.filter((c) => c.cards.length === 5);
      if (fiveCombos.length > 0) {
        return fiveCombos[0].cards;
      }

      // 2b. Prefer non-2 pair from partition
      const pairs = partition.filter((c) => c.type === 'pair');
      if (pairs.length > 0) {
        const nonTwoPairs = pairs.filter((p) => p.mainRank !== RANK_2);
        if (nonTwoPairs.length > 0) {
          return nonTwoPairs[0].cards;
        }
        if (isEndgame || partition.length === 1) {
          return pairs[0].cards;
        }
      }

      // 2c. Lowest single from partition (prefer non-2)
      const singles = partition.filter((c) => c.type === 'single');
      if (singles.length > 0) {
        const nonTwoSingles = singles.filter((s) => s.mainRank !== RANK_2);
        if (nonTwoSingles.length > 0) {
          return nonTwoSingles[0].cards;
        }
        return singles[0].cards;
      }

      return partition[0].cards;
    }

    return [sortedHand[0]];
  }

  // 3. BEATING LAST COMBO
  const beating = findAllBeatingCombos(sortedHand, lastCombo);
  if (beating.length === 0) {
    return null; // Pass
  }

  const target = Array.isArray(lastCombo) ? classifyCombo(lastCombo) : lastCombo;
  if (!target) return null;

  // 3a. Beating a 5-Card Combo
  if (target.categoryTier > 0) {
    // Play lowest beating 5-card combo
    return beating[0].cards;
  }

  // 3b. Beating a Pair
  if (target.type === 'pair') {
    if (isEndgame) {
      return beating[0].cards;
    }
    // Conserve pair of 2s if target is low and we're not in endgame
    const nonTwoBeating = beating.filter((p) => p.mainRank !== RANK_2);
    if (nonTwoBeating.length > 0) {
      return nonTwoBeating[0].cards;
    }
    // If only pair of 2s can beat, play only if target pair is high (>= K) or endgame
    if (target.mainRank >= RANK_K) {
      return beating[0].cards;
    }
    return null; // Pass to conserve 2s
  }

  // 3c. Beating a Single
  if (target.type === 'single') {
    if (isEndgame) {
      return beating[0].cards;
    }

    // Try pure singles (count === 1) first to avoid breaking combos
    const pureBeating = beating.filter((s) => rankCounts[s.mainRank] === 1);

    // Look for pure singles < 2 (rank < 12)
    const lowPureBeating = pureBeating.filter((s) => s.mainRank < RANK_2);
    if (lowPureBeating.length > 0) {
      return lowPureBeating[0].cards;
    }

    // Look for any beating cards from pairs of rank < 2 if pure singles not available
    const nonTwoBeating = beating.filter((s) => s.mainRank < RANK_2);
    if (nonTwoBeating.length > 0) {
      // If target is fairly high (>= 10 / J / Q / K), willing to play a card from pair
      if (target.mainRank >= RANK_10) {
        return nonTwoBeating[0].cards;
      }
      // If target is lower, prefer lowest candidate
      return nonTwoBeating[0].cards;
    }

    // If only 2s beat the single:
    // Only play 2 if target single was high (A) or endgame
    if (target.mainRank === RANK_A) {
      return beating[0].cards;
    }

    // Otherwise pass to conserve 2
    return null;
  }

  return null;
}

/**
 * Finds the next active seat clockwise from startSeat that has cards remaining.
 */
export function findNextActiveSeat(counts: number[], startSeat: number): number {
  for (let i = 1; i <= 3; i++) {
    const s = (startSeat + i) % 4;
    if (counts && counts[s] > 0) {
      return s;
    }
  }
  return startSeat;
}

/**
 * Finds the next seat clockwise from startSeat that has cards remaining and has NOT passed in the current trick.
 * If no other eligible player remains, returns -1 (trick ends).
 */
export function findNextTrickSeat(
  counts: number[],
  passedSeats: number[],
  startSeat: number,
  trickWinnerSeat: number
): number {
  passedSeats = passedSeats || [];
  for (let i = 1; i <= 3; i++) {
    const s = (startSeat + i) % 4;
    if (s === trickWinnerSeat) continue;
    if (counts && counts[s] > 0 && !passedSeats.includes(s)) {
      return s;
    }
  }
  return -1;
}

