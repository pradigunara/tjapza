import {
  Card,
  CardCombo,
  Hand,
  Trick,
  BotEngine,
  CapsaGame,
  Deck,
  CARD_3D,
  RANK_2,
  type BotDecision,
  type GameSeat,
} from '../web/src/domain';

interface SimulationStats {
  games: number;
  rankCounts: [number, number, number, number]; // 1st, 2nd, 3rd, 4th
  totalRemainingCards: number;
}

function emptyStats(): SimulationStats {
  return {
    games: 0,
    rankCounts: [0, 0, 0, 0],
    totalRemainingCards: 0,
  };
}

interface MoveLog {
  seat: number;
  action: 'play' | 'pass';
  cards: number[];
  combo?: CardCombo;
}

export type ContextVariant = 'baseline' | 'history_only' | 'history_power_tracking';

/**
 * Simulates an AI decision given a specific context strategy.
 */
function makeAiDecision(
  variant: ContextVariant,
  hand: Hand,
  trick: Trick,
  isOpeningMove: boolean,
  counts: number[],
  history: MoveLog[],
  allPlayedCards: Set<number>
): BotDecision {
  const decompCombos = hand.decompose();
  const fiveCardDecomp = decompCombos.filter(c => c.is5CardCombo);
  const pairDecomp = decompCombos.filter(c => c.isPair);
  const singleDecomp = decompCombos.filter(c => c.isSingle);

  // 1. Opening Move
  if (isOpeningMove) {
    const openingPlayable = hand.findPlayableCombos(null, true);
    if (openingPlayable.length === 0) {
      return { action: 'play', cards: [Card.fromCode(CARD_3D)] };
    }
    const fiveCard = openingPlayable.find(c => c.is5CardCombo);
    if (fiveCard) return { action: 'play', cards: fiveCard.cards, combo: fiveCard };
    const pair = openingPlayable.find(c => c.isPair);
    if (pair) return { action: 'play', cards: pair.cards, combo: pair };
    return { action: 'play', cards: openingPlayable[0].cards, combo: openingPlayable[0] };
  }

  // Extract remaining 2s and Aces
  const seen2s = [48, 49, 50, 51].filter(c => allPlayedCards.has(c) || hand.cards.some(hc => hc.code === c));
  const unseen2sCount = 4 - seen2s.length;

  const minOpponentCards = Math.min(...counts.filter((_, idx) => counts[idx] > 0));
  const isEmergency = minOpponentCards <= 2;

  // 2. Fresh Trick Lead
  if (trick.isFresh) {
    const allCombos = hand.findPlayableCombos(null, false);
    if (allCombos.length === 0) {
      return { action: 'play', cards: [hand.cards[0]] };
    }

    if (variant === 'history_power_tracking') {
      const myHighest = hand.cards[hand.cards.length - 1];
      const hasGuaranteedBoss = (myHighest.code === 51) || (myHighest.rank === 12 && unseen2sCount === 0);

      // M. Lee Rule with power knowledge: if guaranteed boss, lead intermediate single to draw out stoppers
      if (hasGuaranteedBoss && singleDecomp.length >= 2) {
        const sortedSingles = [...singleDecomp].sort((a, b) => a.cards[0].code - b.cards[0].code);
        const intermediate = sortedSingles[Math.floor(sortedSingles.length / 2)];
        return { action: 'play', cards: intermediate.cards, combo: intermediate };
      }
    }

    // Standard high-equity fresh leads: 5-cards first, then low pairs, then orphan singles
    if (fiveCardDecomp.length > 0) return { action: 'play', cards: fiveCardDecomp[0].cards, combo: fiveCardDecomp[0] };

    const lowPair = pairDecomp.find(p => p.mainRank < 10);
    if (lowPair) return { action: 'play', cards: lowPair.cards, combo: lowPair };

    const orphanSingle = singleDecomp.find(s => s.mainRank < RANK_2);
    if (orphanSingle) return { action: 'play', cards: orphanSingle.cards, combo: orphanSingle };

    return { action: 'play', cards: allCombos[0].cards, combo: allCombos[0] };
  }

  // 3. Active Trick Response
  const lastCombo = trick.lastCombo;
  if (!lastCombo) return { action: 'pass', cards: [] };

  const playable = hand.findPlayableCombos(lastCombo, false);
  if (playable.length === 0) return { action: 'pass', cards: [] };

  // Direct Win Check
  const directWin = playable.find(c => hand.length === c.cardCount);
  if (directWin) return { action: 'play', cards: directWin.cards, combo: directWin };

  if (variant === 'history_power_tracking' && isEmergency) {
    // Under emergency threat from downstream opponent: drop highest legal stopper immediately
    const highestStopper = playable[playable.length - 1];
    return { action: 'play', cards: highestStopper.cards, combo: highestStopper };
  }

  if (variant === 'history_power_tracking') {
    // If opponents passed the last combo of this type, we know they are weak in this combo count
    const recentPasses = history.slice(-3).filter(h => h.action === 'pass').length;
    if (recentPasses >= 2) {
      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }
  }

  // Baseline: lowest legal beating move
  return { action: 'play', cards: playable[0].cards, combo: playable[0] };
}

function runTournament(numGames: number, variant: ContextVariant, mode: '1v3' | '2v2') {
  const stats: SimulationStats[] = [emptyStats(), emptyStats(), emptyStats(), emptyStats()];

  for (let g = 0; g < numGames; g++) {
    const deck = new Deck().shuffle();
    const deal = deck.deal(4);
    const hands = deal.hands.map(cards => new Hand(cards.map(c => c.code)));

    const isLlmSeat = (seatIdx: number) => (mode === '2v2' ? seatIdx === 0 || seatIdx === 2 : seatIdx === 0);

    const seats: GameSeat[] = [
      { userId: 'llm_0', name: 'AI 0', isBot: true, connected: true },
      { userId: 'bot_1', name: 'Bot 1', isBot: true, connected: true },
      { userId: mode === '2v2' ? 'llm_2' : 'bot_2', name: mode === '2v2' ? 'AI 2' : 'Bot 2', isBot: true, connected: true },
      { userId: 'bot_3', name: 'Bot 3', isBot: true, connected: true },
    ];

    let game = new CapsaGame({
      id: `sim_${g}`,
      status: 'playing',
      seats,
      counts: [13, 13, 13, 13],
      turnIndex: deal.startingSeat,
      leaderIndex: deal.startingSeat,
      trick: Trick.createFresh(deal.startingSeat),
      winnerRanks: [],
    });

    const history: MoveLog[] = [];
    const allPlayedCards = new Set<number>();
    let turns = 0;

    while (game.status === 'playing' && turns++ < 200) {
      const currentTurn = game.turnIndex;
      const hand = hands[currentTurn];

      if (isLlmSeat(currentTurn)) {
        const decision = makeAiDecision(
          variant,
          hand,
          game.trick,
          game.isOpeningMove,
          game.counts,
          history,
          allPlayedCards
        );

        if (decision.action === 'play' && decision.cards && decision.cards.length > 0) {
          for (const c of decision.cards) {
            allPlayedCards.add(c.code);
          }
          history.push({
            seat: currentTurn,
            action: 'play',
            cards: decision.cards.map(c => c.code),
            combo: decision.combo,
          });
          hands[currentTurn] = hands[currentTurn].remove(decision.cards);
          game = game.applyPlay(decision.cards, currentTurn, decision.combo);
        } else {
          history.push({
            seat: currentTurn,
            action: 'pass',
            cards: [],
          });
          game = game.applyPass(currentTurn);
        }
      } else {
        const res = game.applyBotTurn(hand.cardCodes);
        if (res.action === 'play') {
          for (const c of res.cards) {
            allPlayedCards.add(c.code);
          }
          history.push({
            seat: currentTurn,
            action: 'play',
            cards: res.cards.map(c => c.code),
            combo: res.combo,
          });
          hands[currentTurn] = hands[currentTurn].remove(res.cards);
        } else {
          history.push({
            seat: currentTurn,
            action: 'pass',
            cards: [],
          });
        }
        game = res.nextGame;
      }
    }

    const winners = game.winnerRanks;
    for (let s = 0; s < 4; s++) {
      const rankIdx = winners.indexOf(s);
      const finishRank = rankIdx !== -1 ? rankIdx : 3;
      stats[s].games++;
      stats[s].rankCounts[finishRank]++;
      stats[s].totalRemainingCards += hands[s].length;
    }
  }

  return stats;
}

console.log('======================================================================');
console.log('   CAPSA BANTING: MOVE HISTORY & CONTEXT ABLATION BENCHMARK (1,000 GAMES)');
console.log('======================================================================\n');

const variants: { name: string; key: ContextVariant }[] = [
  { name: '1. Baseline (Hand Structure + Current Trick + Counts)', key: 'baseline' },
  { name: '2. Move History Only (Last 5 Moves Log)', key: 'history_only' },
  { name: '3. Full History + Power Card Tracking (2s/Aces + Threat)', key: 'history_power_tracking' },
];

for (const v of variants) {
  console.log(`\n>>> Evaluating Strategy: ${v.name}`);
  
  // 1v3 Scenario
  const stats1v3 = runTournament(1000, v.key, '1v3');
  const aiStats = stats1v3[0];
  const aiWinPct = ((aiStats.rankCounts[0] / aiStats.games) * 100).toFixed(1);
  const aiTop2Pct = (((aiStats.rankCounts[0] + aiStats.rankCounts[1]) / aiStats.games) * 100).toFixed(1);
  const ai4thPct = ((aiStats.rankCounts[3] / aiStats.games) * 100).toFixed(1);
  const aiAvgRank = ((aiStats.rankCounts[0] * 1 + aiStats.rankCounts[1] * 2 + aiStats.rankCounts[2] * 3 + aiStats.rankCounts[3] * 4) / aiStats.games).toFixed(2);
  const aiAvgRemaining = (aiStats.totalRemainingCards / aiStats.games).toFixed(1);

  console.log(`  [1v3 Matchup (1,000 Games)]`);
  console.log(`    AI Bot (Seat 0): Win: ${aiWinPct}% | Top-2: ${aiTop2Pct}% | 4th: ${ai4thPct}% | Avg Rank: ${aiAvgRank} | Avg Cards Left: ${aiAvgRemaining}`);

  // 2v2 Scenario
  const stats2v2 = runTournament(1000, v.key, '2v2');
  const aiTeamWins = stats2v2[0].rankCounts[0] + stats2v2[2].rankCounts[0];
  const aiTeamWinPct = ((aiTeamWins / 1000) * 100).toFixed(1);
  const aiSeat0Win = ((stats2v2[0].rankCounts[0] / 1000) * 100).toFixed(1);
  const aiSeat2Win = ((stats2v2[2].rankCounts[0] / 1000) * 100).toFixed(1);
  const ai2v2Top2 = (((stats2v2[0].rankCounts[0] + stats2v2[0].rankCounts[1] + stats2v2[2].rankCounts[0] + stats2v2[2].rankCounts[1]) / 2000) * 100).toFixed(1);
  const ai2v2_4th = (((stats2v2[0].rankCounts[3] + stats2v2[2].rankCounts[3]) / 2000) * 100).toFixed(1);
  const ai2v2AvgRank = (((stats2v2[0].rankCounts[0] + stats2v2[0].rankCounts[1]) * 1 +
    (stats2v2[0].rankCounts[1] + stats2v2[2].rankCounts[1]) * 2 +
    (stats2v2[0].rankCounts[2] + stats2v2[2].rankCounts[2]) * 3 +
    (stats2v2[0].rankCounts[3] + stats2v2[2].rankCounts[3]) * 4) / 2000).toFixed(2);

  console.log(`  [2v2 Matchup (1,000 Games)]`);
  console.log(`    AI Team Win Rate: ${aiTeamWinPct}% (Seat 0: ${aiSeat0Win}%, Seat 2: ${aiSeat2Win}%) | Top-2: ${ai2v2Top2}% | 4th: ${ai2v2_4th}% | Avg Rank: ${ai2v2AvgRank}`);
}
