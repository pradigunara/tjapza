import {
  Card,
  CardCombo,
  Deck,
  Hand,
  Trick,
  BotEngine,
  CapsaGame,
  CARD_3D,
  type BotDecision,
  type GameSeat,
} from '../web/src/domain';

import { decideLlmMove } from './lib/llmPrompt';

/**
 * Determinized Monte Carlo Search (PIMC) Engine for Capsa Banting.
 *
 * Simulates rollouts across random determinizations of unseen opponent cards
 * to find the mathematically optimal move.
 */
export class MonteCarloBotEngine {
  public static decideMove(params: {
    hand: Hand;
    trick: Trick;
    isOpeningMove?: boolean;
    counts?: number[];
    seatIndex?: number;
    rolloutsPerMove?: number;
  }): BotDecision {
    const {
      hand,
      trick,
      isOpeningMove = false,
      counts = [13, 13, 13, 13],
      seatIndex = 0,
      rolloutsPerMove = 25,
    } = params;

    if (hand.isEmpty) return { action: 'pass', cards: [] };

    // 1. Generate Legal Candidate Moves
    let candidates: Array<{ action: 'play' | 'pass'; cards: Card[]; combo?: CardCombo }> = [];

    if (isOpeningMove) {
      const playable = hand.findPlayableCombos(null, true);
      candidates = playable.map((c) => ({ action: 'play' as const, cards: c.cards, combo: c }));
    } else if (trick.isFresh) {
      const playable = hand.findPlayableCombos(null, false);
      candidates = playable.map((c) => ({ action: 'play' as const, cards: c.cards, combo: c }));
    } else {
      const playable = hand.findPlayableCombos(trick.lastCombo!, false);
      candidates = playable.map((c) => ({ action: 'play' as const, cards: c.cards, combo: c }));
      candidates.push({ action: 'pass', cards: [] });
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Direct Instant Win Check: If any candidate empties our hand, take it immediately
    const instantWin = candidates.find((c) => c.action === 'play' && c.cards.length === hand.cards.length);
    if (instantWin) return instantWin;

    // 2. Identify Unseen Cards Pool
    const myCardCodes = new Set(hand.cardCodes);
    const unseenCardCodes: number[] = [];
    for (let c = 0; c < 52; c++) {
      if (!myCardCodes.has(c)) {
        unseenCardCodes.push(c);
      }
    }

    // 3. Evaluate each candidate via Monte Carlo Rollouts
    let bestScore = -Infinity;
    let bestCandidate = candidates[0];

    for (const candidate of candidates) {
      let candidateWins = 0;
      let candidateScore = 0;

      for (let r = 0; r < rolloutsPerMove; r++) {
        // Shuffle unseen cards for a random determinization
        const shuffled = [...unseenCardCodes];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const tmp = shuffled[i];
          shuffled[i] = shuffled[j];
          shuffled[j] = tmp;
        }

        // Deal cards to opponents according to their remaining counts
        const simHands: Hand[] = new Array(4);
        simHands[seatIndex] = hand;

        let offset = 0;
        for (let s = 0; s < 4; s++) {
          if (s !== seatIndex) {
            const oppCount = counts[s] || 0;
            const oppCards = shuffled.slice(offset, offset + oppCount);
            offset += oppCount;
            simHands[s] = new Hand(oppCards);
          }
        }

        // Initialize simulation state
        const simSeats: GameSeat[] = [
          { userId: 's0', name: 'S0', isBot: true, connected: true },
          { userId: 's1', name: 'S1', isBot: true, connected: true },
          { userId: 's2', name: 'S2', isBot: true, connected: true },
          { userId: 's3', name: 'S3', isBot: true, connected: true },
        ];

        let simGame = new CapsaGame({
          id: 'sim',
          status: 'playing',
          seats: simSeats,
          counts: [...counts],
          turnIndex: seatIndex,
          leaderIndex: trick.leaderIndex,
          trick: trick,
          winnerRanks: [],
        });

        // Apply candidate move first
        if (candidate.action === 'play' && candidate.cards.length > 0) {
          simHands[seatIndex] = simHands[seatIndex].remove(candidate.cards);
          simGame = simGame.applyPlay(candidate.cards, seatIndex, candidate.combo);
        } else {
          simGame = simGame.applyPass(seatIndex);
        }

        // Fast Playout Rollout until match completion
        let simTurns = 0;
        while (simGame.status === 'playing' && simTurns++ < 60) {
          const curTurn = simGame.turnIndex;
          const curHand = simHands[curTurn];

          if (curHand.isEmpty) {
            const rec = simGame.reconcile();
            simGame = rec.game;
            if (simGame.status === 'finished') break;
            continue;
          }

          const res = simGame.applyBotTurn(curHand.cardCodes);
          if (res.action === 'play') {
            simHands[curTurn] = simHands[curTurn].remove(res.cards);
          }
          simGame = res.nextGame;
        }

        const rankIdx = simGame.winnerRanks.indexOf(seatIndex);
        const finishRank = rankIdx !== -1 ? rankIdx + 1 : 4;

        if (finishRank === 1) {
          candidateWins += 1.0;
          candidateScore += 10.0;
        } else if (finishRank === 2) {
          candidateScore += 4.0;
        } else if (finishRank === 3) {
          candidateScore += 1.0;
        } else {
          candidateScore -= 5.0; // Heavy penalty for 4th place
        }
      }

      const avgScore = candidateScore / rolloutsPerMove;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }
}

// ---------------------------------------------------------
// TOURNAMENT: MCTS Bot vs LLM Bot vs Baseline RuleBots
// ---------------------------------------------------------
const MATCHES = 500;
console.log('================================================================================');
console.log(`   3-WAY CLASH: MONTE CARLO SEARCH (MCTS) vs LLM BOT vs BASELINE RULEBOTS`);
console.log(`   Tournament Sample: ${MATCHES} Games | Rollouts: 25 per candidate move`);
console.log('================================================================================\n');

interface TournamentStats {
  wins: number;
  second: number;
  third: number;
  fourth: number;
  totalRank: number;
}

const stats: Record<string, TournamentStats> = {
  mcts: { wins: 0, second: 0, third: 0, fourth: 0, totalRank: 0 },
  llm: { wins: 0, second: 0, third: 0, fourth: 0, totalRank: 0 },
  rule1: { wins: 0, second: 0, third: 0, fourth: 0, totalRank: 0 },
  rule2: { wins: 0, second: 0, third: 0, fourth: 0, totalRank: 0 },
};

const startTime = performance.now();

for (let g = 0; g < MATCHES; g++) {
  if ((g + 1) % 50 === 0) {
    process.stdout.write(`  Progress: ${g + 1}/${MATCHES} games completed...\r`);
  }

  const deck = new Deck().shuffle();
  const deal = deck.deal(4);
  const hands = deal.hands.map((cards) => new Hand(cards));

  // Seat 0: Monte Carlo Search Bot
  // Seat 1: LLM Strategy Bot
  // Seat 2: Baseline RuleBot A
  // Seat 3: Baseline RuleBot B
  const seats: GameSeat[] = [
    { userId: 'mcts_0', name: 'MCTS Bot', isBot: true, connected: true },
    { userId: 'llm_1', name: 'LLM Bot', isBot: true, connected: true },
    { userId: 'rule_2', name: 'RuleBot A', isBot: true, connected: true },
    { userId: 'rule_3', name: 'RuleBot B', isBot: true, connected: true },
  ];

  let game = new CapsaGame({
    id: `clash-${g}`,
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: deal.startingSeat,
    leaderIndex: deal.startingSeat,
    trick: Trick.createFresh(deal.startingSeat),
    winnerRanks: [],
  });

  let turns = 0;
  while (game.status === 'playing' && turns++ < 150) {
    const seat = game.turnIndex;
    const hand = hands[seat];

    if (seat === 0) {
      // MCTS Bot
      const dec = MonteCarloBotEngine.decideMove({
        hand,
        trick: game.trick,
        isOpeningMove: game.isOpeningMove,
        counts: game.counts,
        seatIndex: seat,
        rolloutsPerMove: 25,
      });

      if (dec.action === 'play' && dec.cards.length > 0) {
        hands[seat] = hands[seat].remove(dec.cards);
        game = game.applyPlay(dec.cards, seat, dec.combo);
      } else {
        game = game.applyPass(seat);
      }
    } else if (seat === 1) {
      // LLM Bot
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
      // Baseline RuleBots
      const res = game.applyBotTurn(hand.cardCodes);
      if (res.action === 'play') {
        hands[seat] = hands[seat].remove(res.cards);
      }
      game = res.nextGame;
    }
  }

  // Record finish placements
  const keys = ['mcts', 'llm', 'rule1', 'rule2'];
  for (let s = 0; s < 4; s++) {
    const rankIdx = game.winnerRanks.indexOf(s);
    const rank = rankIdx !== -1 ? rankIdx + 1 : 4;
    const st = stats[keys[s]];
    if (rank === 1) st.wins++;
    else if (rank === 2) st.second++;
    else if (rank === 3) st.third++;
    else if (rank === 4) st.fourth++;
    st.totalRank += rank;
  }
}

const elapsedSeconds = ((performance.now() - startTime) / 1000).toFixed(2);
console.log(`\nCompleted ${MATCHES} games in ${elapsedSeconds}s!\n`);

console.log('=======================================================================================================');
console.log('   FINAL TOURNAMENT RESULTS: MCTS vs LLM vs BASELINE RULEBOTS');
console.log('=======================================================================================================');
console.log('| Bot Architecture | 1st Place (Win %) | 2nd Place % | 3rd Place % | 4th Place % | Avg Finish Rank |');
console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');

const rows = [
  { name: '🎲 **Monte Carlo Search (MCTS / PIMC)**', key: 'mcts' },
  { name: '🧠 **LLM Strategy Bot (LFM2.5)**', key: 'llm' },
  { name: '⚙️ **Baseline RuleBot A**', key: 'rule1' },
  { name: '⚙️ **Baseline RuleBot B**', key: 'rule2' },
];

for (const r of rows) {
  const st = stats[r.key];
  const winPct = ((st.wins / MATCHES) * 100).toFixed(1) + '%';
  const p2Pct = ((st.second / MATCHES) * 100).toFixed(1) + '%';
  const p3Pct = ((st.third / MATCHES) * 100).toFixed(1) + '%';
  const p4Pct = ((st.fourth / MATCHES) * 100).toFixed(1) + '%';
  const avgRank = (st.totalRank / MATCHES).toFixed(3);
  console.log(`| ${r.name} | **${winPct}** | ${p2Pct} | ${p3Pct} | ${p4Pct} | **${avgRank}** |`);
}
console.log('=======================================================================================================\n');
