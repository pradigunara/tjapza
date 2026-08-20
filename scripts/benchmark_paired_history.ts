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

interface MoveLog {
  seat: number;
  action: 'play' | 'pass';
  cards: number[];
  combo?: CardCombo;
  passedCombo?: CardCombo;
}

/**
 * AI decision function parameterized by history window size K.
 */
function makeAiDecision(
  historyWindowSize: number,
  hand: Hand,
  trick: Trick,
  isOpeningMove: boolean,
  counts: number[],
  history: MoveLog[]
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

  // 2. Fresh Trick Lead
  if (trick.isFresh) {
    const allCombos = hand.findPlayableCombos(null, false);
    if (allCombos.length === 0) {
      return { action: 'play', cards: [hand.cards[0]] };
    }

    // Exploit opponent weaknesses revealed in recent history window
    if (historyWindowSize > 0) {
      const visibleHistory = history.slice(-historyWindowSize);

      // Count opponent passes against different combo types
      const pairPasses = visibleHistory.filter(h => h.action === 'pass' && h.passedCombo?.isPair).length;
      const singlePasses = visibleHistory.filter(h => h.action === 'pass' && h.passedCombo?.isSingle).length;
      const fiveCardPasses = visibleHistory.filter(h => h.action === 'pass' && h.passedCombo?.is5CardCombo).length;

      // If opponents repeatedly passed pairs and we have pairs, prioritize leading pairs
      if (pairPasses >= 2 && pairDecomp.length > 0) {
        const lowPair = pairDecomp.find(p => p.mainRank < 10) || pairDecomp[0];
        return { action: 'play', cards: lowPair.cards, combo: lowPair };
      }

      // If opponents passed 5-cards, prioritize dumping 5-cards
      if (fiveCardPasses >= 2 && fiveCardDecomp.length > 0) {
        return { action: 'play', cards: fiveCardDecomp[0].cards, combo: fiveCardDecomp[0] };
      }

      // If opponents passed singles, prioritize shedding orphan singles
      if (singlePasses >= 2 && singleDecomp.length > 0) {
        const orphanSingle = singleDecomp.find(s => s.mainRank < RANK_2) || singleDecomp[0];
        return { action: 'play', cards: orphanSingle.cards, combo: orphanSingle };
      }
    }

    // Default Fresh Lead Order: 5-cards first, then low pairs, then orphan singles
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

  // Direct Win Check: If playing this combo empties our hand, play it immediately!
  const directWin = playable.find(c => hand.length === c.cardCount);
  if (directWin) return { action: 'play', cards: directWin.cards, combo: directWin };

  // If history window is enabled:
  if (historyWindowSize > 0) {
    const visibleHistory = history.slice(-historyWindowSize);
    const downstreamSeat = (0 + 1) % 4;
    const isDownstreamThreat = counts[downstreamSeat] > 0 && counts[downstreamSeat] <= 2;

    // If downstream opponent is about to win, play top stopper to block them
    if (isDownstreamThreat) {
      const topStopper = playable[playable.length - 1];
      return { action: 'play', cards: topStopper.cards, combo: topStopper };
    }

    // If 2 opponents already passed the active trick, trick control is almost won:
    // Play minimal legal card to capture the lead cheaply
    const passesInTrick = visibleHistory.filter(h => h.action === 'pass' && h.passedCombo === lastCombo).length;
    if (passesInTrick >= 2) {
      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }
  }

  // Baseline: lowest legal beating move
  return { action: 'play', cards: playable[0].cards, combo: playable[0] };
}

function simulateGame(deal: { hands: Card[][]; startingSeat: number }, windowSize: number) {
  const hands = deal.hands.map(cards => new Hand(cards.map(c => c.code)));
  const seats: GameSeat[] = [
    { userId: 'ai_0', name: 'AI 0', isBot: true, connected: true },
    { userId: 'bot_1', name: 'Bot 1', isBot: true, connected: true },
    { userId: 'bot_2', name: 'Bot 2', isBot: true, connected: true },
    { userId: 'bot_3', name: 'Bot 3', isBot: true, connected: true },
  ];

  let game = new CapsaGame({
    id: `sim`,
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: deal.startingSeat,
    leaderIndex: deal.startingSeat,
    trick: Trick.createFresh(deal.startingSeat),
    winnerRanks: [],
  });

  const history: MoveLog[] = [];
  let turns = 0;

  while (game.status === 'playing' && turns++ < 200) {
    const currentTurn = game.turnIndex;
    const hand = hands[currentTurn];
    const activeCombo = game.trick.lastCombo;

    if (currentTurn === 0) {
      const decision = makeAiDecision(
        windowSize,
        hand,
        game.trick,
        game.isOpeningMove,
        game.counts,
        history
      );

      if (decision.action === 'play' && decision.cards && decision.cards.length > 0) {
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
          passedCombo: activeCombo,
        });
        game = game.applyPass(currentTurn);
      }
    } else {
      const res = game.applyBotTurn(hand.cardCodes);
      if (res.action === 'play') {
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
          passedCombo: activeCombo,
        });
      }
      game = res.nextGame;
    }
  }

  const rankIdx = game.winnerRanks.indexOf(0);
  const finishRank = rankIdx !== -1 ? rankIdx + 1 : 4;
  return finishRank;
}

const TOTAL_PAIRED_DEALS = 10000;
console.log('========================================================================================');
console.log(`   CORRECTED PAIRED BENCHMARK: ${TOTAL_PAIRED_DEALS.toLocaleString()} IDENTICAL DEALS PER WINDOW`);
console.log('========================================================================================\n');

console.log(`Generating ${TOTAL_PAIRED_DEALS.toLocaleString()} fixed deal seeds...`);
const deals: Array<{ hands: Card[][]; startingSeat: number }> = [];
for (let i = 0; i < TOTAL_PAIRED_DEALS; i++) {
  const deck = new Deck().shuffle();
  deals.push(deck.deal(4));
}
console.log(`Deals generated. Running paired tournaments across window sizes...\n`);

const windows = [0, 1, 2, 3, 4, 5, 8, 12];
interface WindowResult {
  k: number;
  ranks: number[];
  winCount: number;
  top2Count: number;
  fourthCount: number;
  avgRank: number;
  pairedWinDiffVsK0: number;
}

const results: WindowResult[] = [];

for (const k of windows) {
  const ranks: number[] = new Array(TOTAL_PAIRED_DEALS);
  let winCount = 0;
  let top2Count = 0;
  let fourthCount = 0;
  let totalRank = 0;

  for (let i = 0; i < TOTAL_PAIRED_DEALS; i++) {
    const rank = simulateGame(deals[i], k);
    ranks[i] = rank;
    if (rank === 1) winCount++;
    if (rank <= 2) top2Count++;
    if (rank === 4) fourthCount++;
    totalRank += rank;
  }

  const avgRank = totalRank / TOTAL_PAIRED_DEALS;
  results.push({
    k,
    ranks,
    winCount,
    top2Count,
    fourthCount,
    avgRank,
    pairedWinDiffVsK0: 0,
  });
}

// Compute paired statistics relative to K=0
const baseRanks = results[0].ranks;
for (const r of results) {
  let winDiff = 0;
  for (let i = 0; i < TOTAL_PAIRED_DEALS; i++) {
    const winBase = baseRanks[i] === 1 ? 1 : 0;
    const winK = r.ranks[i] === 1 ? 1 : 0;
    winDiff += (winK - winBase);
  }
  r.pairedWinDiffVsK0 = winDiff;
}

console.log(`| History Window (K) | 1st Place (Win %) ± 95% CI | Top-2 % | 4th Place % | Avg Rank | Paired Δ Wins vs K=0 | Stat Significance |`);
console.log(`| :---: | :---: | :---: | :---: | :---: | :---: | :---: |`);

for (const r of results) {
  const winRate = r.winCount / TOTAL_PAIRED_DEALS;
  const se = Math.sqrt((winRate * (1 - winRate)) / TOTAL_PAIRED_DEALS);
  const ci95 = (1.96 * se * 100).toFixed(2);
  const winPctStr = `${(winRate * 100).toFixed(2)}% ± ${ci95}%`;
  const top2PctStr = `${((r.top2Count / TOTAL_PAIRED_DEALS) * 100).toFixed(2)}%`;
  const fourthPctStr = `${((r.fourthCount / TOTAL_PAIRED_DEALS) * 100).toFixed(2)}%`;
  const avgRankStr = r.avgRank.toFixed(3);
  const diffStr = r.k === 0 ? 'Baseline (0)' : `${r.pairedWinDiffVsK0 > 0 ? '+' : ''}${r.pairedWinDiffVsK0} wins (${((r.pairedWinDiffVsK0 / TOTAL_PAIRED_DEALS) * 100).toFixed(2)}%)`;
  
  let sigStr = '—';
  if (r.k !== 0) {
    const pValueEst = Math.abs(r.pairedWinDiffVsK0) / Math.sqrt(TOTAL_PAIRED_DEALS * 0.5);
    sigStr = pValueEst > 2.58 ? 'p < 0.01 (Very High)' : pValueEst > 1.96 ? 'p < 0.05 (High)' : 'p > 0.05 (Noise)';
  }

  const label = r.k === 0 ? '**K = 0 (None)**' : `**K = ${r.k} moves**`;
  console.log(`| ${label} | ${winPctStr} | ${top2PctStr} | ${fourthPctStr} | ${avgRankStr} | ${diffStr} | ${sigStr} |`);
}
