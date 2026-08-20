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
  rankCounts: [number, number, number, number];
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

function makeAiDecisionWithWindow(
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

  if (trick.isFresh) {
    const allCombos = hand.findPlayableCombos(null, false);
    if (allCombos.length === 0) {
      return { action: 'play', cards: [hand.cards[0]] };
    }

    if (historyWindowSize > 0) {
      const visibleHistory = history.slice(-historyWindowSize);
      const recentSinglePasses = visibleHistory.filter(h => h.action === 'pass' && h.combo?.isSingle).length;
      const recentPairPasses = visibleHistory.filter(h => h.action === 'pass' && h.combo?.isPair).length;

      if (recentPairPasses >= 2 && pairDecomp.length > 0) {
        const lowPair = pairDecomp.find(p => p.mainRank < 10) || pairDecomp[0];
        return { action: 'play', cards: lowPair.cards, combo: lowPair };
      }

      if (recentSinglePasses >= 2 && singleDecomp.length > 0) {
        const orphanSingle = singleDecomp.find(s => s.mainRank < RANK_2) || singleDecomp[0];
        return { action: 'play', cards: orphanSingle.cards, combo: orphanSingle };
      }
    }

    if (fiveCardDecomp.length > 0) return { action: 'play', cards: fiveCardDecomp[0].cards, combo: fiveCardDecomp[0] };

    const lowPair = pairDecomp.find(p => p.mainRank < 10);
    if (lowPair) return { action: 'play', cards: lowPair.cards, combo: lowPair };

    const orphanSingle = singleDecomp.find(s => s.mainRank < RANK_2);
    if (orphanSingle) return { action: 'play', cards: orphanSingle.cards, combo: orphanSingle };

    return { action: 'play', cards: allCombos[0].cards, combo: allCombos[0] };
  }

  const lastCombo = trick.lastCombo;
  if (!lastCombo) return { action: 'pass', cards: [] };

  const playable = hand.findPlayableCombos(lastCombo, false);
  if (playable.length === 0) return { action: 'pass', cards: [] };

  const directWin = playable.find(c => hand.length === c.cardCount);
  if (directWin) return { action: 'play', cards: directWin.cards, combo: directWin };

  if (historyWindowSize > 0) {
    const visibleHistory = history.slice(-historyWindowSize);
    const passesInTrick = visibleHistory.filter(h => h.action === 'pass').length;
    if (passesInTrick >= 2) {
      return { action: 'play', cards: playable[0].cards, combo: playable[0] };
    }
  }

  return { action: 'play', cards: playable[0].cards, combo: playable[0] };
}

function runTournamentForWindow(numGames: number, windowSize: number, mode: '1v3' | '2v2') {
  const stats: SimulationStats[] = [emptyStats(), emptyStats(), emptyStats(), emptyStats()];

  for (let g = 0; g < numGames; g++) {
    const deck = new Deck().shuffle();
    const deal = deck.deal(4);
    const hands = deal.hands.map(cards => new Hand(cards.map(c => c.code)));

    const isLlmSeat = (seatIdx: number) => (mode === '2v2' ? seatIdx === 0 || seatIdx === 2 : seatIdx === 0);

    const seats: GameSeat[] = [
      { userId: 'ai_0', name: 'AI 0', isBot: true, connected: true },
      { userId: 'bot_1', name: 'Bot 1', isBot: true, connected: true },
      { userId: mode === '2v2' ? 'ai_2' : 'bot_2', name: mode === '2v2' ? 'AI 2' : 'Bot 2', isBot: true, connected: true },
      { userId: 'bot_3', name: 'Bot 3', isBot: true, connected: true },
    ];

    let game = new CapsaGame({
      id: `sim_win_${windowSize}_${g}`,
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

      if (isLlmSeat(currentTurn)) {
        const decision = makeAiDecisionWithWindow(
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

console.log('===================================================================================');
console.log('    HIGH-PRECISION REFINED BENCHMARK: 2,000 GAMES / WINDOW (10,000 TOTAL GAMES)    ');
console.log('===================================================================================\n');

const windowSizes = [0, 3, 4, 5, 6];

console.log(`| History Window (K) | 1v3 Win % | 1v3 Top-2 % | 1v3 4th Place % | 1v3 Avg Rank | 2v2 Team Win % | 2v2 Avg Rank |`);
console.log(`| :---: | :---: | :---: | :---: | :---: | :---: | :---: |`);

for (const k of windowSizes) {
  const stats1v3 = runTournamentForWindow(2000, k, '1v3');
  const aiStats = stats1v3[0];
  const winPct = ((aiStats.rankCounts[0] / aiStats.games) * 100).toFixed(1);
  const top2Pct = (((aiStats.rankCounts[0] + aiStats.rankCounts[1]) / aiStats.games) * 100).toFixed(1);
  const fourthPct = ((aiStats.rankCounts[3] / aiStats.games) * 100).toFixed(1);
  const avgRank = ((aiStats.rankCounts[0] * 1 + aiStats.rankCounts[1] * 2 + aiStats.rankCounts[2] * 3 + aiStats.rankCounts[3] * 4) / aiStats.games).toFixed(2);

  const stats2v2 = runTournamentForWindow(2000, k, '2v2');
  const teamWins = stats2v2[0].rankCounts[0] + stats2v2[2].rankCounts[0];
  const teamWinPct = ((teamWins / 2000) * 100).toFixed(1);
  const avgRank2v2 = (((stats2v2[0].rankCounts[0] + stats2v2[2].rankCounts[0]) * 1 +
    (stats2v2[0].rankCounts[1] + stats2v2[2].rankCounts[1]) * 2 +
    (stats2v2[0].rankCounts[2] + stats2v2[2].rankCounts[2]) * 3 +
    (stats2v2[0].rankCounts[3] + stats2v2[2].rankCounts[3]) * 4) / 4000).toFixed(2);

  const label = k === 0 ? '0 (No History)' : `${k} moves`;
  console.log(`| **${label}** | ${winPct}% | ${top2Pct}% | ${fourthPct}% | ${avgRank} | ${teamWinPct}% | ${avgRank2v2} |`);
}
