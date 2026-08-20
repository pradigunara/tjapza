#!/usr/bin/env bun
/**
 * Prompt Strategy Variant Experimentation & Statistical Benchmark Runner.
 * Supports large-sample testing (500+ rounds) across 1v3 and 2v2 scenarios,
 * including randomized top-two strategy adoption.
 */

import {
  Deck,
  Hand,
  Trick,
  CapsaGame,
  type GameSeat,
} from '../web/src/domain';

import {
  decideLlmMove,
  type StrategyVariant,
} from './lib/llmPrompt';

interface VariantResult {
  variant: StrategyVariant;
  name: string;
  scenario: '1v3' | '2v2';
  totalGames: number;
  firstPlace: number;
  secondPlace: number;
  thirdPlace: number;
  fourthPlace: number;
  winRate: number;
  secondPlaceRate: number;
  top2Rate: number;
  fourthPlaceRate: number;
  avgRank: number;
  avgRemainingCards: number;
  totalDecisions: number;
  fallbacks: number;
  durationMs: number;
}

const VARIANTS: Array<{ variant: StrategyVariant; name: string; desc: string }> = [
  {
    variant: 'adaptive_master',
    name: 'Adaptive Master',
    desc: 'Dynamic equity: aggressive on strong hands, loss-minimizing on weak hands',
  },
  {
    variant: 'aggressive_tempo',
    name: 'Aggressive Out-First',
    desc: 'Proactive 2s tempo expenditure, M. Lee intermediate lead rule, win-hunting',
  },
  {
    variant: 'random_top2',
    name: 'Randomized Top-2 Ensemble',
    desc: '50/50 randomized adoption between Adaptive Master and Aggressive Out-First',
  },
  {
    variant: 'balanced',
    name: 'Balanced (Baseline)',
    desc: 'Combo integrity, natural pairs/5s preservation, standard 2s conversion',
  },
  {
    variant: 'loss_minimizer',
    name: 'Loss Minimizer (Anti-4th)',
    desc: 'Early hand pruning, double penalty escape (>=10 cards), aggressive blocking',
  },
];

async function runBenchmarkScenario(
  variant: StrategyVariant,
  numGames: number,
  mode: '1v3' | '2v2'
): Promise<VariantResult> {
  let first = 0;
  let second = 0;
  let third = 0;
  let fourth = 0;
  let totalRankSum = 0;
  let totalCardsSum = 0;
  let totalDecisions = 0;
  let totalFallbacks = 0;

  const startTime = Date.now();

  for (let g = 0; g < numGames; g++) {
    const deck = new Deck().shuffle();
    const deal = deck.deal(4);
    const hands = deal.hands.map((cards) => new Hand(cards.map((c) => c.code)));

    // In 1v3: Seat 0 is LLM, Seats 1-3 are RuleBots
    // In 2v2: Seats 0 and 2 are LLM, Seats 1 and 3 are RuleBots
    const isLlmSeat = (seatIdx: number) => (mode === '2v2' ? seatIdx === 0 || seatIdx === 2 : seatIdx === 0);

    const seats: GameSeat[] = [
      { userId: 'llm_0', name: 'LLM Agent 0', isBot: true, connected: true },
      { userId: 'bot_1', name: 'RuleBot 1', isBot: true, connected: true },
      { userId: mode === '2v2' ? 'llm_2' : 'bot_2', name: mode === '2v2' ? 'LLM Agent 2' : 'RuleBot 2', isBot: true, connected: true },
      { userId: 'bot_3', name: 'RuleBot 3', isBot: true, connected: true },
    ];

    let game = new CapsaGame({
      id: `sim_${mode}_${g}`,
      status: 'playing',
      seats,
      counts: [13, 13, 13, 13],
      turnIndex: deal.startingSeat,
      leaderIndex: deal.startingSeat,
      trick: Trick.createFresh(deal.startingSeat),
      winnerRanks: [],
    });

    let turns = 0;
    const maxTurns = 200;

    while (game.status === 'playing' && turns++ < maxTurns) {
      const currentTurn = game.turnIndex;
      const hand = hands[currentTurn];

      if (isLlmSeat(currentTurn)) {
        // LLM turn
        const res = await decideLlmMove({
          game,
          hand,
          seatIndex: currentTurn,
          seatName: `LLM_${currentTurn}`,
          mock: true,
          llmConfig: { strategyVariant: variant },
        });

        totalDecisions++;
        if (res.isFallback) totalFallbacks++;

        if (res.decision.action === 'play') {
          hands[currentTurn] = hands[currentTurn].remove(res.decision.cards);
          game = game.applyPlay(res.decision.cards, currentTurn, res.decision.combo);
        } else {
          game = game.applyPass(currentTurn);
        }
      } else {
        // RuleBot turn
        const res = game.applyBotTurn(hand.cardCodes);
        if (res.action === 'play') {
          hands[currentTurn] = hands[currentTurn].remove(res.cards);
        }
        game = res.nextGame;
      }
    }

    // Tally ranks for LLM seat(s)
    const ranks = game.winnerRanks || [];
    const llmSeats = mode === '2v2' ? [0, 2] : [0];

    for (const s of llmSeats) {
      const rankIndex = ranks.indexOf(s);
      const place = rankIndex >= 0 ? rankIndex + 1 : 4;

      if (place === 1) first++;
      else if (place === 2) second++;
      else if (place === 3) third++;
      else fourth++;

      totalRankSum += place;
      totalCardsSum += hands[s].cards.length;
    }
  }

  const durationMs = Date.now() - startTime;
  const totalSamples = numGames * (mode === '2v2' ? 2 : 1);

  return {
    variant,
    name: VARIANTS.find((v) => v.variant === variant)!.name,
    scenario: mode,
    totalGames: totalSamples,
    firstPlace: first,
    secondPlace: second,
    thirdPlace: third,
    fourthPlace: fourth,
    winRate: (first / totalSamples) * 100,
    secondPlaceRate: (second / totalSamples) * 100,
    top2Rate: ((first + second) / totalSamples) * 100,
    fourthPlaceRate: (fourth / totalSamples) * 100,
    avgRank: totalRankSum / totalSamples,
    avgRemainingCards: totalCardsSum / totalSamples,
    totalDecisions,
    fallbacks: totalFallbacks,
    durationMs,
  };
}

function printTable(title: string, results: VariantResult[]) {
  console.log('\n' + '='.repeat(102));
  console.log(`🏆 ${title}`);
  console.log('='.repeat(102));

  // Sort by Win Rate desc, then 4th Place asc
  const sorted = [...results].sort((a, b) => b.winRate - a.winRate || a.fourthPlaceRate - b.fourthPlaceRate);

  console.log(
    '┌──────────────────────────────┬──────────────┬──────────┬──────────┬──────────┬──────────────┬──────────┬───────────┐'
  );
  console.log(
    '│ Strategy Variant             │ 1st Place %  │ 2nd Pl % │ Top-2 %  │ 4th Pl % │ Avg Finish   │ Leftover │ Fallback% │'
  );
  console.log(
    '├──────────────────────────────┼──────────────┼──────────┼──────────┼──────────┼──────────────┼──────────┼───────────┤'
  );

  for (const r of sorted) {
    const nameStr = r.name.padEnd(28, ' ');
    const winStr = `${r.winRate.toFixed(1)}%`.padStart(12, ' ');
    const p2Str = `${r.secondPlaceRate.toFixed(1)}%`.padStart(8, ' ');
    const top2Str = `${r.top2Rate.toFixed(1)}%`.padStart(8, ' ');
    const p4Str = `${r.fourthPlaceRate.toFixed(1)}%`.padStart(8, ' ');
    const rankStr = r.avgRank.toFixed(2).padStart(12, ' ');
    const cardsStr = r.avgRemainingCards.toFixed(2).padStart(8, ' ');
    const fbStr = `${((r.fallbacks / (r.totalDecisions || 1)) * 100).toFixed(1)}%`.padStart(9, ' ');

    console.log(
      `│ ${nameStr} │ ${winStr} │ ${p2Str} │ ${top2Str} │ ${p4Str} │ ${rankStr} │ ${cardsStr} │ ${fbStr} │`
    );
  }

  console.log(
    '└──────────────────────────────┴──────────────┴──────────┴──────────┴──────────┴──────────────┴──────────┴───────────┘'
  );
}

async function main() {
  const gamesPerVariant = parseInt(process.argv[2] || '500', 10);

  console.log(`\n🧪 Capsa Banting High-Sample Tournament (${gamesPerVariant} games per variant)`);
  console.log('='.repeat(102));

  // --- 1. Scenario: 1 LLM vs 3 Rule-based Bots ---
  console.log(`\n▶ [Part 1/2] Running 1 LLM vs 3 Rule-based Bots (${gamesPerVariant} games/variant)...`);
  const results1v3: VariantResult[] = [];
  for (const v of VARIANTS) {
    process.stdout.write(`  - Simulating ${v.name}... `);
    const res = await runBenchmarkScenario(v.variant, gamesPerVariant, '1v3');
    results1v3.push(res);
    console.log(`Done (${res.durationMs}ms, ${res.winRate.toFixed(1)}% win rate, ${res.fourthPlaceRate.toFixed(1)}% 4th)`);
  }
  printTable(`1 LLM vs 3 Rule-Based Bots (${gamesPerVariant} Games per Variant)`, results1v3);

  // --- 2. Scenario: 2 LLMs vs 2 Rule-based Bots ---
  console.log(`\n▶ [Part 2/2] Running 2 LLMs vs 2 Rule-based Bots (${gamesPerVariant} games/variant)...`);
  const results2v2: VariantResult[] = [];
  for (const v of VARIANTS) {
    process.stdout.write(`  - Simulating ${v.name}... `);
    const res = await runBenchmarkScenario(v.variant, gamesPerVariant, '2v2');
    results2v2.push(res);
    console.log(`Done (${res.durationMs}ms, ${res.winRate.toFixed(1)}% win rate, ${res.fourthPlaceRate.toFixed(1)}% 4th)`);
  }
  printTable(`2 LLMs vs 2 Rule-Based Bots (${gamesPerVariant * 2} Samples per Variant)`, results2v2);
}

main().catch(console.error);
