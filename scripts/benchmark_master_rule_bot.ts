import {
  Card,
  CardCombo,
  Deck,
  Hand,
  Trick,
  BotEngine,
  CapsaGame,
  CARD_3D,
  RANK_2,
  type BotDecision,
  type GameSeat,
} from '../web/src/domain';

import { decideLlmMove } from './lib/llmPrompt';

/**
 * Advanced Master Rule Bot implementing:
 * 1. Hand Power Equity (Aggressive vs Loss-Minimizing posture)
 * 2. Downstream 1-Card Defense (Blocking downstream finish)
 * 3. M. Lee Fresh Lead Principle (Leading intermediate single when holding Boss 2)
 * 4. Direct Out Sequence Detection
 * 5. Optimal 5-Card shedding hierarchy
 */
export class AdvancedBotEngine {
  public static decideMove(params: {
    hand: Hand;
    trick: Trick;
    isOpeningMove?: boolean;
    counts?: number[];
    seatIndex?: number;
  }): BotDecision {
    const { hand, trick, isOpeningMove = false, counts = [13, 13, 13, 13], seatIndex = 0 } = params;

    if (hand.isEmpty) return { action: 'pass', cards: [] };

    const decomposed = hand.decompose();
    const natural5s = decomposed.filter((c) => c.is5CardCombo);
    const naturalPairs = decomposed.filter((c) => c.type === 'pair');
    const orphanSingles = decomposed.filter((c) => c.type === 'single');

    // Hand Power Equity Calculation
    const twosCount = hand.cards.filter((c) => c.rank === RANK_2).length;
    const acesCount = hand.cards.filter((c) => c.rank === 11).length;
    const lowSinglesCount = orphanSingles.filter((c) => c.mainRank <= 5).length;
    const handPower = twosCount * 3.0 + acesCount * 1.5 + natural5s.length * 3.5 - lowSinglesCount * 0.8;

    const downstreamSeat = (seatIndex + 1) % 4;
    const isDownstreamThreat = (counts[downstreamSeat] ?? 13) <= 2 && (counts[downstreamSeat] ?? 13) > 0;
    const isAnyEndgameThreat = counts.some((cnt, s) => s !== seatIndex && cnt > 0 && cnt <= 3);

    // 1. Opening Move (Must contain 3♦)
    if (isOpeningMove) {
      const five3D = natural5s.find((c) => c.containsCardCode(CARD_3D));
      if (five3D) return { action: 'play', cards: five3D.cards, combo: five3D };
      const pair3D = naturalPairs.find((c) => c.containsCardCode(CARD_3D));
      if (pair3D) return { action: 'play', cards: pair3D.cards, combo: pair3D };
      const single3D = hand.cards.find((c) => c.code === CARD_3D) || hand.cards[0];
      const combo = CardCombo.evaluate([single3D])!;
      return { action: 'play', cards: [single3D], combo };
    }

    // 2. Fresh Trick Lead
    if (trick.isFresh) {
      // Direct Winning Out: If 1 combo remains, play it to win!
      if (decomposed.length === 1) {
        return { action: 'play', cards: decomposed[0].cards, combo: decomposed[0] };
      }

      // Priority A: Shed 5-card combos first
      if (natural5s.length > 0) {
        return { action: 'play', cards: natural5s[0].cards, combo: natural5s[0] };
      }

      // Priority B: Lead natural pairs (lowest pair < 10)
      const lowPairs = naturalPairs.filter((p) => p.mainRank < 10);
      if (lowPairs.length > 0) {
        return { action: 'play', cards: lowPairs[0].cards, combo: lowPairs[0] };
      }

      // Priority C: M. Lee Lead Principle for Singles
      // If we hold Boss 2 (2♠) and multiple singles, lead intermediate single to draw stoppers
      const hasBoss2 = hand.cards.some((c) => c.code === 51); // 2♠
      const non2Singles = orphanSingles.filter((s) => s.mainRank < RANK_2);
      if (hasBoss2 && non2Singles.length >= 2) {
        // Lead highest non-2 single (intermediate) to draw out Aces/2s
        const intermediate = non2Singles[non2Singles.length - 1];
        return { action: 'play', cards: intermediate.cards, combo: intermediate };
      }

      // Priority D: Normal low orphan single
      if (orphanSingles.length > 0) {
        const lowestOrphan = orphanSingles.find((s) => s.mainRank < RANK_2) || orphanSingles[0];
        return { action: 'play', cards: lowestOrphan.cards, combo: lowestOrphan };
      }

      // Priority E: Any remaining pair
      if (naturalPairs.length > 0) {
        return { action: 'play', cards: naturalPairs[0].cards, combo: naturalPairs[0] };
      }

      const allPlayable = hand.findPlayableCombos(null, false);
      return { action: 'play', cards: allPlayable[0].cards, combo: allPlayable[0] };
    }

    // 3. Beating Active Table Combo
    const lastCombo = trick.lastCombo!;
    const playable = hand.findPlayableCombos(lastCombo, false);
    if (playable.length === 0) return { action: 'pass', cards: [] };

    // Direct Win Out Check
    const winningMove = playable.find((c) => c.cardCount === hand.cards.length);
    if (winningMove) {
      return { action: 'play', cards: winningMove.cards, combo: winningMove };
    }

    // Singles Strategy
    if (lastCombo.isSingle) {
      // Downstream 1-Card Defense: Must play top single to block downstream opponent from winning
      if (isDownstreamThreat) {
        const highestSingle = playable[playable.length - 1];
        return { action: 'play', cards: highestSingle.cards, combo: highestSingle };
      }

      // If we have an orphan single that beats the table without breaking combos, play lowest orphan
      const orphanBeaters = playable.filter((c) => orphanSingles.some((s) => s.mainRank === c.mainRank));
      if (orphanBeaters.length > 0) {
        return { action: 'play', cards: orphanBeaters[0].cards, combo: orphanBeaters[0] };
      }

      // Tempo Seizure: If we have strong hand (multiple 2s / 5-cards), use 2 to seize lead
      if (handPower >= 5.0 && natural5s.length > 0) {
        const single2 = playable.find((c) => c.mainRank === RANK_2);
        if (single2) return { action: 'play', cards: single2.cards, combo: single2 };
      }

      // Double penalty defense: If holding >= 10 cards, shed any legal single
      if (hand.cards.length >= 10) {
        return { action: 'play', cards: playable[0].cards, combo: playable[0] };
      }

      // If playing would break a natural pair / 5-card combo and table is not endgame danger, PASS to preserve combos
      if (!isAnyEndgameThreat && lastCombo.mainRank < 10) {
        return { action: 'pass', cards: [] };
      }

      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }

    // Pairs Strategy
    if (lastCombo.isPair) {
      const naturalPairBeaters = playable.filter((c) => naturalPairs.some((p) => p.mainRank === c.mainRank));
      if (naturalPairBeaters.length > 0) {
        return { action: 'play', cards: naturalPairBeaters[0].cards, combo: naturalPairBeaters[0] };
      }

      // Don't break full houses or 4-of-a-kinds for a low pair trick
      if (!isAnyEndgameThreat && lastCombo.mainRank < 10) {
        return { action: 'pass', cards: [] };
      }

      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }

    // 5-Card Combos Strategy
    if (lastCombo.is5CardCombo) {
      // Play lowest beating 5-card combo
      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }

    return { action: 'play', cards: playable[0].cards, combo: playable[0] };
  }
}

// ---------------------------------------------------------
// Tournament Simulation: Advanced Rule Bot vs Baseline vs LLM
// ---------------------------------------------------------
const GAMES = 1000;
console.log('================================================================================');
console.log(`   TOURNAMENT BENCHMARK: ADVANCED RULE BOT vs BASELINE RULE BOT vs LLM (${GAMES} GAMES)`);
console.log('================================================================================\n');

// Scenario 1: 1 Advanced Rule Bot (Seat 0) vs 3 Baseline Rule Bots (Seats 1-3)
let advWins = 0;
let advRanks = [0, 0, 0, 0];

for (let g = 0; g < GAMES; g++) {
  const deck = new Deck().shuffle();
  const deal = deck.deal(4);
  const hands = deal.hands.map((cards) => new Hand(cards));

  const seats: GameSeat[] = [
    { userId: 'adv_0', name: 'Advanced Rule Bot', isBot: true, connected: true },
    { userId: 'base_1', name: 'Baseline 1', isBot: true, connected: true },
    { userId: 'base_2', name: 'Baseline 2', isBot: true, connected: true },
    { userId: 'base_3', name: 'Baseline 3', isBot: true, connected: true },
  ];

  let game = new CapsaGame({
    id: `g-${g}`,
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: deal.startingSeat,
    leaderIndex: deal.startingSeat,
    trick: Trick.createFresh(deal.startingSeat),
    winnerRanks: [],
  });

  let turns = 0;
  while (game.status === 'playing' && turns++ < 200) {
    const seat = game.turnIndex;
    const hand = hands[seat];

    if (seat === 0) {
      const dec = AdvancedBotEngine.decideMove({
        hand,
        trick: game.trick,
        isOpeningMove: game.isOpeningMove,
        counts: game.counts,
        seatIndex: seat,
      });

      if (dec.action === 'play' && dec.cards.length > 0) {
        hands[seat] = hands[seat].remove(dec.cards);
        game = game.applyPlay(dec.cards, seat, dec.combo);
      } else {
        game = game.applyPass(seat);
      }
    } else {
      const res = game.applyBotTurn(hand.cardCodes);
      if (res.action === 'play') {
        hands[seat] = hands[seat].remove(res.cards);
      }
      game = res.nextGame;
    }
  }

  const rankIdx = game.winnerRanks.indexOf(0);
  const rank = rankIdx !== -1 ? rankIdx + 1 : 4;
  advRanks[rank - 1]++;
  if (rank === 1) advWins++;
}

console.log('1. SCENARIO A: 1 Advanced Rule Bot vs 3 Baseline Rule Bots');
console.log(`- Advanced Rule Bot Win Rate: ${(advWins / GAMES * 100).toFixed(1)}% (1st: ${advRanks[0]}, 2nd: ${advRanks[1]}, 3rd: ${advRanks[2]}, 4th: ${advRanks[3]})`);
console.log(`- Baseline Rule Bots Avg Win Rate: ${(((GAMES - advWins) / 3) / GAMES * 100).toFixed(1)}%`);
console.log(`- Advanced Bot 4th Place Rate: ${(advRanks[3] / GAMES * 100).toFixed(1)}%`);
console.log(`- Advanced Bot Avg Rank: ${((advRanks[0]*1 + advRanks[1]*2 + advRanks[2]*3 + advRanks[3]*4) / GAMES).toFixed(3)}\n`);

// Scenario 2: 1 Advanced Rule Bot (Seat 0) vs 1 LLM Bot (Seat 1) vs 2 Baseline Bots (Seats 2-3)
let headWins = [0, 0, 0, 0];
for (let g = 0; g < GAMES; g++) {
  const deck = new Deck().shuffle();
  const deal = deck.deal(4);
  const hands = deal.hands.map((cards) => new Hand(cards));

  const seats: GameSeat[] = [
    { userId: 'adv_0', name: 'Advanced Rule Bot', isBot: true, connected: true },
    { userId: 'llm_1', name: 'LLM Bot', isBot: true, connected: true },
    { userId: 'base_2', name: 'Baseline 2', isBot: true, connected: true },
    { userId: 'base_3', name: 'Baseline 3', isBot: true, connected: true },
  ];

  let game = new CapsaGame({
    id: `g2-${g}`,
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: deal.startingSeat,
    leaderIndex: deal.startingSeat,
    trick: Trick.createFresh(deal.startingSeat),
    winnerRanks: [],
  });

  let turns = 0;
  while (game.status === 'playing' && turns++ < 200) {
    const seat = game.turnIndex;
    const hand = hands[seat];

    if (seat === 0) {
      const dec = AdvancedBotEngine.decideMove({
        hand,
        trick: game.trick,
        isOpeningMove: game.isOpeningMove,
        counts: game.counts,
        seatIndex: seat,
      });
      if (dec.action === 'play' && dec.cards.length > 0) {
        hands[seat] = hands[seat].remove(dec.cards);
        game = game.applyPlay(dec.cards, seat, dec.combo);
      } else {
        game = game.applyPass(seat);
      }
    } else if (seat === 1) {
      const res = await decideLlmMove({
        game,
        hand,
        seatIndex: seat,
        seatName: 'LLM Bot',
        mock: true,
      });
      if (res.decision.action === 'play' && res.decision.cards.length > 0) {
        hands[seat] = hands[seat].remove(res.decision.cards);
        game = game.applyPlay(res.decision.cards, seat, res.decision.combo);
      } else {
        game = game.applyPass(seat);
      }
    } else {
      const res = game.applyBotTurn(hand.cardCodes);
      if (res.action === 'play') {
        hands[seat] = hands[seat].remove(res.cards);
      }
      game = res.nextGame;
    }
  }

  const winner = game.winnerRanks[0];
  if (winner !== undefined) headWins[winner]++;
}

console.log('2. SCENARIO B: Advanced Rule Bot (Seat 0) vs LLM Bot (Seat 1) vs 2 Baseline Bots');
console.log(`- Advanced Rule Bot Win Rate: ${(headWins[0] / GAMES * 100).toFixed(1)}%`);
console.log(`- LLM Bot Win Rate:           ${(headWins[1] / GAMES * 100).toFixed(1)}%`);
console.log(`- Baseline Bot 2 Win Rate:    ${(headWins[2] / GAMES * 100).toFixed(1)}%`);
console.log(`- Baseline Bot 3 Win Rate:    ${(headWins[3] / GAMES * 100).toFixed(1)}%`);
