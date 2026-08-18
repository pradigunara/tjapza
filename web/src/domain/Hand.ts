import { Card } from './Card';
import { CardCombo, STRAIGHT_PATTERNS } from './CardCombo';
import { CARD_3D } from './constants';

/**
 * Pure Immutable Domain Entity representing a player's hand of cards.
 */
export class Hand {
  readonly cards: Card[];

  constructor(cards: (Card | number)[] = []) {
    this.cards = Card.sort(
      cards.map((c) => (typeof c === 'number' ? new Card(c) : c))
    );
  }

  public static fromCodes(codes: number[]): Hand {
    return new Hand(codes);
  }

  // --- Getters & Queries ---

  public get size(): number {
    return this.cards.length;
  }

  public get isEmpty(): boolean {
    return this.cards.length === 0;
  }

  public get cardCodes(): number[] {
    return this.cards.map((c) => c.code);
  }

  public containsCode(code: number): boolean {
    return this.cards.some((c) => c.code === code);
  }

  public hasCards(subset: (Card | number)[]): boolean {
    const codes = subset.map((c) => (typeof c === 'number' ? c : c.code));
    const handCounts: Record<number, number> = {};
    for (const c of this.cards) {
      handCounts[c.code] = (handCounts[c.code] || 0) + 1;
    }
    for (const code of codes) {
      if (!handCounts[code] || handCounts[code] <= 0) return false;
      handCounts[code]--;
    }
    return true;
  }

  // --- Pure Transformations ---

  public remove(toRemove: (Card | number)[]): Hand {
    const removeCodes = new Set(
      toRemove.map((c) => (typeof c === 'number' ? c : c.code))
    );
    return new Hand(this.cards.filter((c) => !removeCodes.has(c.code)));
  }

  public add(toAdd: (Card | number)[]): Hand {
    return new Hand([...this.cards, ...toAdd.map((c) => (typeof c === 'number' ? new Card(c) : c))]);
  }

  // --- Combo Finders ---

  public findSingles(): CardCombo[] {
    return this.cards.map((c) => CardCombo.evaluate([c])!).filter(Boolean);
  }

  public findPairs(): CardCombo[] {
    const combos: CardCombo[] = [];
    const rankGroups = this.groupByRank();

    for (const cards of Object.values(rankGroups)) {
      if (cards.length >= 2) {
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            const combo = CardCombo.evaluate([cards[i], cards[j]]);
            if (combo) combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findStraights(): CardCombo[] {
    const rankGroups = this.groupByRank();
    const combos: CardCombo[] = [];

    for (const pattern of STRAIGHT_PATTERNS) {
      const [r0, r1, r2, r3, r4] = pattern.ranks;
      if (
        rankGroups[r0] &&
        rankGroups[r1] &&
        rankGroups[r2] &&
        rankGroups[r3] &&
        rankGroups[r4]
      ) {
        for (const c0 of rankGroups[r0]) {
          for (const c1 of rankGroups[r1]) {
            for (const c2 of rankGroups[r2]) {
              for (const c3 of rankGroups[r3]) {
                for (const c4 of rankGroups[r4]) {
                  const combo = CardCombo.evaluate([c0, c1, c2, c3, c4]);
                  if (combo && (combo.type === 'straight' || combo.type === 'straight_flush')) {
                    combos.push(combo);
                  }
                }
              }
            }
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findFlushes(): CardCombo[] {
    const suitGroups: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const c of this.cards) {
      suitGroups[c.suit].push(c);
    }

    const combos: CardCombo[] = [];
    for (const cards of Object.values(suitGroups)) {
      if (cards.length >= 5) {
        const combinations = this.getKCombinations(cards, 5);
        for (const set of combinations) {
          const combo = CardCombo.evaluate(set);
          if (combo && (combo.type === 'flush' || combo.type === 'straight_flush')) {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findFullHouses(): CardCombo[] {
    const rankGroups = this.groupByRank();
    const triples: Card[][] = [];
    const pairs: Card[][] = [];

    for (const cards of Object.values(rankGroups)) {
      if (cards.length >= 3) {
        triples.push(...this.getKCombinations(cards, 3));
      }
      if (cards.length >= 2) {
        pairs.push(...this.getKCombinations(cards, 2));
      }
    }

    const combos: CardCombo[] = [];
    for (const t of triples) {
      for (const p of pairs) {
        if (t[0].rank !== p[0].rank) {
          const combo = CardCombo.evaluate([...t, ...p]);
          if (combo && combo.type === 'full_house') {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findQuads(): CardCombo[] {
    const rankGroups = this.groupByRank();
    const quads: Card[][] = [];

    for (const cards of Object.values(rankGroups)) {
      if (cards.length === 4) {
        quads.push(cards);
      }
    }

    const combos: CardCombo[] = [];
    for (const q of quads) {
      for (const kicker of this.cards) {
        if (kicker.rank !== q[0].rank) {
          const combo = CardCombo.evaluate([...q, kicker]);
          if (combo && combo.type === 'quads') {
            combos.push(combo);
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findStraightFlushes(): CardCombo[] {
    const suitGroups: Record<number, Card[]> = { 0: [], 1: [], 2: [], 3: [] };
    for (const c of this.cards) {
      suitGroups[c.suit].push(c);
    }

    const combos: CardCombo[] = [];
    for (const cards of Object.values(suitGroups)) {
      if (cards.length >= 5) {
        const hand = new Hand(cards);
        const rankGroups = hand.groupByRank();

        for (const pattern of STRAIGHT_PATTERNS) {
          const [r0, r1, r2, r3, r4] = pattern.ranks;
          if (
            rankGroups[r0] &&
            rankGroups[r1] &&
            rankGroups[r2] &&
            rankGroups[r3] &&
            rankGroups[r4]
          ) {
            for (const c0 of rankGroups[r0]) {
              for (const c1 of rankGroups[r1]) {
                for (const c2 of rankGroups[r2]) {
                  for (const c3 of rankGroups[r3]) {
                    for (const c4 of rankGroups[r4]) {
                      const combo = CardCombo.evaluate([c0, c1, c2, c3, c4]);
                      if (combo && combo.type === 'straight_flush') {
                        combos.push(combo);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return combos.sort((a, b) => a.compareTo(b));
  }

  public findAllCombos(): CardCombo[] {
    return [
      ...this.findSingles(),
      ...this.findPairs(),
      ...this.findStraights(),
      ...this.findFlushes(),
      ...this.findFullHouses(),
      ...this.findQuads(),
      ...this.findStraightFlushes(),
    ];
  }

  public findPlayableCombos(
    lastCombo: CardCombo | null,
    mustContain3D = false
  ): CardCombo[] {
    let candidates: CardCombo[];

    if (!lastCombo) {
      candidates = this.findAllCombos();
    } else {
      switch (lastCombo.type) {
        case 'single':
          candidates = this.findSingles();
          break;
        case 'pair':
          candidates = this.findPairs();
          break;
        default:
          candidates = [
            ...this.findStraights(),
            ...this.findFlushes(),
            ...this.findFullHouses(),
            ...this.findQuads(),
            ...this.findStraightFlushes(),
          ];
          break;
      }
    }

    return candidates.filter((c) => {
      if (mustContain3D && !c.containsCardCode(CARD_3D)) return false;
      return lastCombo ? c.canBeat(lastCombo) : true;
    });
  }

  /**
   * Pure greedy partition of hand into disjoint combos with minimal turns.
   */
  public decompose(): CardCombo[] {
    let remainingHand = new Hand(this.cards);
    const chosenCombos: CardCombo[] = [];

    // Priority 1: 5-card combos (Straight Flush > Quads > Full House > Flush > Straight)
    const fiveCardFinders = [
      () => remainingHand.findStraightFlushes(),
      () => remainingHand.findQuads(),
      () => remainingHand.findFullHouses(),
      () => remainingHand.findFlushes(),
      () => remainingHand.findStraights(),
    ];

    for (const finder of fiveCardFinders) {
      let combos = finder();
      while (combos.length > 0) {
        const best = combos[0];
        chosenCombos.push(best);
        remainingHand = remainingHand.remove(best.cards);
        combos = finder();
      }
    }

    // Priority 2: Disjoint pairs
    const rankGroups = remainingHand.groupByRank();
    for (const [, rCards] of Object.entries(rankGroups)) {
      if (rCards.length >= 2) {
        const pairCards = [rCards[0], rCards[1]];
        const pairCombo = CardCombo.evaluate(pairCards);
        if (pairCombo) {
          chosenCombos.push(pairCombo);
          remainingHand = remainingHand.remove(pairCards);
        }
      }
    }

    // Priority 3: Remaining singles
    for (const c of remainingHand.cards) {
      const single = CardCombo.evaluate([c]);
      if (single) chosenCombos.push(single);
    }

    return chosenCombos;
  }

  // --- Private Helpers ---

  private groupByRank(): Record<number, Card[]> {
    const groups: Record<number, Card[]> = {};
    for (const c of this.cards) {
      if (!groups[c.rank]) groups[c.rank] = [];
      groups[c.rank].push(c);
    }
    return groups;
  }

  private getKCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const head = arr[0];
    const tail = arr.slice(1);
    const withHead = this.getKCombinations(tail, k - 1).map((c) => [head, ...c]);
    const withoutHead = this.getKCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }
}
