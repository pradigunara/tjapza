#!/usr/bin/env bun
/**
 * Headless Benchmark & Experimentation Runner for Capsa Banting (Big Two) LLM Bots.
 *
 * Runs complete 4-player games using pure domain models (CapsaGame, Deck, Hand, CardCombo, Trick, BotEngine).
 * Tests and tunes LLM prompt generation, structured JSON response parsing, safety validation,
 * and comparative win-rate performance against rule-based heuristic bots.
 */

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

import {
  decideLlmMove,
  type LlmClientConfig,
  type LlmMoveHistoryRecord,
} from './lib/llmPrompt';

export type BenchmarkMode = '1v3' | '2v2' | '4v0' | 'all';
export type AgentType = 'llm' | 'heuristic';

export interface CliOptions {
  games: number;
  mode: BenchmarkMode;
  mockLlm: boolean;
  verbose: boolean;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  timeoutMs?: number;
  help?: boolean;
}

export interface SingleGameStats {
  gameIndex: number;
  startingSeat: number;
  winnerRanks: number[]; // [1st, 2nd, 3rd, 4th]
  remainingCards: number[]; // per seat [s0, s1, s2, s3]
  turns: number;
  trickCycles: number;
  durationMs: number;
  llmAttempts: number;
  llmFallbacks: number;
  illegalReasons: Record<string, number>;
  moves: LlmMoveHistoryRecord[];
}

export interface ScenarioDefinition {
  id: '1v3' | '2v2' | '4v0';
  title: string;
  description: string;
  agentTypes: [AgentType, AgentType, AgentType, AgentType];
}

export const SCENARIOS: Record<'1v3' | '2v2' | '4v0', ScenarioDefinition> = {
  '1v3': {
    id: '1v3',
    title: '1 LLM vs 3 Rule-based Bots',
    description: 'Seat 0: LLM Agent | Seats 1-3: Heuristic BotEngine',
    agentTypes: ['llm', 'heuristic', 'heuristic', 'heuristic'],
  },
  '2v2': {
    id: '2v2',
    title: '2 LLMs vs 2 Rule-based Bots',
    description: 'Seats 0 & 2: LLM Agent | Seats 1 & 3: Heuristic BotEngine',
    agentTypes: ['llm', 'heuristic', 'llm', 'heuristic'],
  },
  '4v0': {
    id: '4v0',
    title: '4 LLM Players',
    description: 'Seats 0-3: LLM Agents (Self-Play)',
    agentTypes: ['llm', 'llm', 'llm', 'llm'],
  },
};

export interface ScenarioBenchmarkResult {
  scenario: ScenarioDefinition;
  totalGames: number;
  gameStats: SingleGameStats[];
  seatStats: Array<{
    seat: number;
    agentType: AgentType;
    rankCounts: [number, number, number, number]; // [1st, 2nd, 3rd, 4th]
    winRate: number; // 0..100
    avgRank: number; // 1..4
    avgRemainingCards: number;
  }>;
  aggregateLlm: {
    totalPlayerGames: number;
    rankCounts: [number, number, number, number];
    winRate: number;
    avgRank: number;
    avgRemainingCards: number;
    totalAttempts: number;
    totalFallbacks: number;
    fallbackRate: number;
    illegalReasons: Record<string, number>;
  } | null;
  aggregateHeuristic: {
    totalPlayerGames: number;
    rankCounts: [number, number, number, number];
    winRate: number;
    avgRank: number;
    avgRemainingCards: number;
  } | null;
  pacing: {
    avgTurns: number;
    minTurns: number;
    maxTurns: number;
    avgTrickCycles: number;
    avgDurationMs: number;
    totalElapsedMs: number;
  };
}

/**
 * Parse command line flags into CliOptions.
 */
export function parseArgs(args: string[], env: Record<string, string | undefined> = process.env): CliOptions {
  const options: CliOptions = {
    games: 30,
    mode: 'all',
    mockLlm: false,
    verbose: false,
    timeoutMs: 10000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--games' || arg === '-g') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.games = val;
    } else if (arg === '--mode' || arg === '-m') {
      const val = (args[++i] || '').toLowerCase() as BenchmarkMode;
      if (['1v3', '2v2', '4v0', 'all'].includes(val)) {
        options.mode = val;
      }
    } else if (arg === '--mock-llm') {
      options.mockLlm = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--model') {
      options.model = args[++i];
    } else if (arg === '--endpoint') {
      options.endpoint = args[++i];
    } else if (arg === '--api-key') {
      options.apiKey = args[++i];
    } else if (arg === '--timeout') {
      const val = parseInt(args[++i], 10);
      if (!isNaN(val) && val > 0) options.timeoutMs = val;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  // Default to mock-llm if no live API key/endpoint is present
  if (!options.mockLlm && !options.apiKey && !options.endpoint && !env.OPENAI_API_KEY && !env.GEMINI_API_KEY) {
    options.mockLlm = true;
  }

  return options;
}

/**
 * Print CLI Help message.
 */
export function printHelp(): void {
  console.log(`
🃏 Tjapza - LLM Bot Headless Benchmark & Experimentation Runner

USAGE:
  bun scripts/benchmark_llm_bots.ts [OPTIONS]

OPTIONS:
  --games <N>, -g <N>       Number of games to simulate per scenario (default: 30)
  --mode <MODE>, -m <MODE>  Experiment scenario: '1v3' | '2v2' | '4v0' | 'all' (default: 'all')
  --mock-llm                Run simulated LLM decisions via prompt-builder + validator (fast test)
  --verbose, -v             Print turn-by-turn or per-game log details
  --model <name>            LLM Model name (e.g. gpt-4o-mini, gemini-1.5-flash)
  --endpoint <url>          LLM HTTP endpoint URL
  --api-key <key>           LLM API key
  --timeout <ms>            Per-turn timeout in milliseconds (default: 10000)
  --help, -h                Show this help screen

SCENARIOS:
  1v3:  1 LLM Bot (Seat 0) vs 3 Heuristic Rule Bots (Seats 1-3)
  2v2:  2 LLM Bots (Seats 0, 2) vs 2 Heuristic Rule Bots (Seats 1, 3)
  4v0:  4 LLM Bots (Seats 0-3 Self-Play)
  all:  Runs 1v3, 2v2, and 4v0 sequentially with summary comparison
`);
}

/**
 * Simulate a single complete 4-player game.
 */
export async function runSingleGame(params: {
  gameIndex: number;
  agentTypes: [AgentType, AgentType, AgentType, AgentType];
  mockLlm: boolean;
  verbose: boolean;
  llmConfig?: LlmClientConfig;
}): Promise<SingleGameStats> {
  const { gameIndex, agentTypes, mockLlm, verbose, llmConfig } = params;

  const deck = new Deck().shuffle();
  const deal = deck.deal(4);
  const hands: Hand[] = deal.hands.map((cards) => new Hand(cards));

  const seats: GameSeat[] = agentTypes.map((type, idx) => ({
    userId: null,
    name: type === 'llm' ? `LLM_P${idx}` : `RuleBot_P${idx}`,
    isBot: true,
    connected: true,
  }));

  let game = new CapsaGame({
    id: `game-${gameIndex}`,
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: deal.startingSeat,
    leaderIndex: deal.startingSeat,
    trick: Trick.createFresh(deal.startingSeat),
    winnerRanks: [],
  });

  let turns = 0;
  let trickCycles = 1;
  let lastLeader = game.leaderIndex;
  let llmAttempts = 0;
  let llmFallbacks = 0;
  const illegalReasons: Record<string, number> = {};
  const moveHistory: LlmMoveHistoryRecord[] = [];
  const maxTurns = 500;
  const t0 = performance.now();

  while (game.status === 'playing' && turns < maxTurns) {
    turns++;
    const seat = game.turnIndex;
    const agentType = agentTypes[seat];
    const hand = hands[seat];

    if (hand.isEmpty) {
      const rec = game.reconcile();
      game = rec.game;
      if (game.status === 'finished') break;
      continue;
    }

    let decision: BotDecision;
    let isFallback = false;
    let illegalReason: string | null = null;

    if (agentType === 'llm') {
      llmAttempts++;
      const res = await decideLlmMove({
        game,
        hand,
        seatIndex: seat,
        seatName: seats[seat].name,
        moveHistory,
        mock: mockLlm,
        llmConfig,
      });

      decision = res.decision;
      isFallback = res.isFallback;
      illegalReason = res.illegalReason;

      if (isFallback) {
        llmFallbacks++;
        const reasonKey = illegalReason || 'unknown';
        illegalReasons[reasonKey] = (illegalReasons[reasonKey] || 0) + 1;
      }
    } else {
      // Heuristic Bot AI
      decision = BotEngine.decideMove({
        hand,
        trick: game.trick,
        isOpeningMove: game.isOpeningMove,
        counts: game.counts,
        seatIndex: seat,
      });
    }

    // Safety check and state application
    if (decision.action === 'play' && decision.cards.length > 0) {
      if (!game.canPlay(decision.cards, seat, hand.cards)) {
        decision = BotEngine.decideMove({
          hand,
          trick: game.trick,
          isOpeningMove: game.isOpeningMove,
          counts: game.counts,
          seatIndex: seat,
        });
        if (agentType === 'llm' && !isFallback) {
          llmFallbacks++;
          isFallback = true;
          illegalReason = 'unvalidated_can_play_failed';
          illegalReasons['unvalidated_can_play_failed'] = (illegalReasons['unvalidated_can_play_failed'] || 0) + 1;
        }
      }

      if (decision.action === 'play' && decision.cards.length > 0) {
        hands[seat] = hand.remove(decision.cards);
        game = game.applyPlay(decision.cards, seat);
      } else {
        if (game.canPass(seat)) {
          game = game.applyPass(seat);
        } else {
          const forced = game.isOpeningMove && hand.containsCode(CARD_3D)
            ? new Card(CARD_3D)
            : hand.cards[0];
          hands[seat] = hand.remove([forced]);
          game = game.applyPlay([forced], seat);
        }
      }
    } else {
      // Pass Action
      if (!game.canPass(seat)) {
        decision = BotEngine.decideMove({
          hand,
          trick: game.trick,
          isOpeningMove: game.isOpeningMove,
          counts: game.counts,
          seatIndex: seat,
        });
        if (agentType === 'llm' && !isFallback) {
          llmFallbacks++;
          isFallback = true;
          illegalReason = 'unvalidated_can_pass_failed';
          illegalReasons['unvalidated_can_pass_failed'] = (illegalReasons['unvalidated_can_pass_failed'] || 0) + 1;
        }

        if (decision.action === 'play' && decision.cards.length > 0) {
          hands[seat] = hand.remove(decision.cards);
          game = game.applyPlay(decision.cards, seat);
        } else {
          const forced = game.isOpeningMove && hand.containsCode(CARD_3D)
            ? new Card(CARD_3D)
            : hand.cards[0];
          hands[seat] = hand.remove([forced]);
          game = game.applyPlay([forced], seat);
        }
      } else {
        game = game.applyPass(seat);
      }
    }

    if (game.leaderIndex !== lastLeader) {
      trickCycles++;
      lastLeader = game.leaderIndex;
    }

    moveHistory.push({
      turn: turns,
      seat,
      agentType,
      action: decision.action,
      cards: decision.cards.map((c) => c.name),
      isFallback,
      illegalReason,
    });

    const rec = game.reconcile();
    game = rec.game;
  }

  const durationMs = performance.now() - t0;

  // Finalize full finish ranks for all 4 seats
  const finalWinnerRanks = [...game.winnerRanks];
  for (let s = 0; s < 4; s++) {
    if (hands[s].isEmpty && !finalWinnerRanks.includes(s)) {
      finalWinnerRanks.push(s);
    }
  }
  const remaining = [0, 1, 2, 3]
    .filter((s) => !finalWinnerRanks.includes(s))
    .sort((a, b) => hands[a].size - hands[b].size);
  finalWinnerRanks.push(...remaining);

  const remainingCards = [
    hands[0].size,
    hands[1].size,
    hands[2].size,
    hands[3].size,
  ];

  if (verbose) {
    console.log(
      `  Game #${gameIndex.toString().padStart(3)} | Winner: Seat ${finalWinnerRanks[0]} (${seats[finalWinnerRanks[0]].name}) | Turns: ${turns} | Tricks: ${trickCycles} | Duration: ${durationMs.toFixed(1)}ms`
    );
  }

  return {
    gameIndex,
    startingSeat: deal.startingSeat,
    winnerRanks: finalWinnerRanks,
    remainingCards,
    turns,
    trickCycles,
    durationMs,
    llmAttempts,
    llmFallbacks,
    illegalReasons,
    moves: moveHistory,
  };
}

/**
 * Run a full benchmark scenario across N games and compute aggregate statistics.
 */
export async function runScenarioBenchmark(params: {
  scenario: ScenarioDefinition;
  totalGames: number;
  mockLlm: boolean;
  verbose: boolean;
  llmConfig?: LlmClientConfig;
}): Promise<ScenarioBenchmarkResult> {
  const { scenario, totalGames, mockLlm, verbose, llmConfig } = params;

  console.log(`\n================================================================================`);
  console.log(`▶ Running Scenario: ${scenario.title}`);
  console.log(`  Configuration:    ${scenario.description}`);
  console.log(`  Total Games:      ${totalGames} | Mock LLM: ${mockLlm ? 'YES (Simulated)' : 'NO (Live API)'}`);
  console.log(`================================================================================`);

  const tStart = performance.now();
  const gameStats: SingleGameStats[] = [];

  for (let g = 1; g <= totalGames; g++) {
    const stats = await runSingleGame({
      gameIndex: g,
      agentTypes: scenario.agentTypes,
      mockLlm,
      verbose,
      llmConfig,
    });
    gameStats.push(stats);

    if (!verbose && (g % 10 === 0 || g === totalGames)) {
      process.stdout.write(`  Progress: ${g}/${totalGames} games completed...\r`);
    }
  }
  if (!verbose) {
    console.log(`  Progress: ${totalGames}/${totalGames} games completed!    `);
  }

  const totalElapsedMs = performance.now() - tStart;

  // 1. Seat Stats
  const seatStats = [0, 1, 2, 3].map((seat) => {
    const agentType = scenario.agentTypes[seat];
    const rankCounts: [number, number, number, number] = [0, 0, 0, 0];
    let totalRemCards = 0;

    for (const g of gameStats) {
      const rankIdx = g.winnerRanks.indexOf(seat); // 0 = 1st, 1 = 2nd, etc.
      if (rankIdx >= 0 && rankIdx < 4) {
        rankCounts[rankIdx]++;
      }
      totalRemCards += g.remainingCards[seat] ?? 0;
    }

    const wins = rankCounts[0];
    const winRate = (wins / totalGames) * 100;
    const avgRank = (1 * rankCounts[0] + 2 * rankCounts[1] + 3 * rankCounts[2] + 4 * rankCounts[3]) / totalGames;
    const avgRemainingCards = totalRemCards / totalGames;

    return {
      seat,
      agentType,
      rankCounts,
      winRate,
      avgRank,
      avgRemainingCards,
    };
  });

  // 2. Aggregate LLM Stats
  const llmSeats = [0, 1, 2, 3].filter((s) => scenario.agentTypes[s] === 'llm');
  let aggregateLlm: ScenarioBenchmarkResult['aggregateLlm'] = null;

  if (llmSeats.length > 0) {
    const totalPlayerGames = totalGames * llmSeats.length;
    const rankCounts: [number, number, number, number] = [0, 0, 0, 0];
    let totalRemCards = 0;
    let totalAttempts = 0;
    let totalFallbacks = 0;
    const illegalReasons: Record<string, number> = {};

    for (const s of llmSeats) {
      const st = seatStats[s];
      rankCounts[0] += st.rankCounts[0];
      rankCounts[1] += st.rankCounts[1];
      rankCounts[2] += st.rankCounts[2];
      rankCounts[3] += st.rankCounts[3];
      totalRemCards += st.avgRemainingCards * totalGames;
    }

    for (const g of gameStats) {
      totalAttempts += g.llmAttempts;
      totalFallbacks += g.llmFallbacks;
      for (const [r, cnt] of Object.entries(g.illegalReasons)) {
        illegalReasons[r] = (illegalReasons[r] || 0) + cnt;
      }
    }

    const winRate = (rankCounts[0] / totalPlayerGames) * 100;
    const avgRank = (1 * rankCounts[0] + 2 * rankCounts[1] + 3 * rankCounts[2] + 4 * rankCounts[3]) / totalPlayerGames;
    const avgRemainingCards = totalRemCards / totalPlayerGames;
    const fallbackRate = totalAttempts > 0 ? (totalFallbacks / totalAttempts) * 100 : 0;

    aggregateLlm = {
      totalPlayerGames,
      rankCounts,
      winRate,
      avgRank,
      avgRemainingCards,
      totalAttempts,
      totalFallbacks,
      fallbackRate,
      illegalReasons,
    };
  }

  // 3. Aggregate Heuristic Stats
  const heuristicSeats = [0, 1, 2, 3].filter((s) => scenario.agentTypes[s] === 'heuristic');
  let aggregateHeuristic: ScenarioBenchmarkResult['aggregateHeuristic'] = null;

  if (heuristicSeats.length > 0) {
    const totalPlayerGames = totalGames * heuristicSeats.length;
    const rankCounts: [number, number, number, number] = [0, 0, 0, 0];
    let totalRemCards = 0;

    for (const s of heuristicSeats) {
      const st = seatStats[s];
      rankCounts[0] += st.rankCounts[0];
      rankCounts[1] += st.rankCounts[1];
      rankCounts[2] += st.rankCounts[2];
      rankCounts[3] += st.rankCounts[3];
      totalRemCards += st.avgRemainingCards * totalGames;
    }

    const winRate = (rankCounts[0] / totalPlayerGames) * 100;
    const avgRank = (1 * rankCounts[0] + 2 * rankCounts[1] + 3 * rankCounts[2] + 4 * rankCounts[3]) / totalPlayerGames;
    const avgRemainingCards = totalRemCards / totalPlayerGames;

    aggregateHeuristic = {
      totalPlayerGames,
      rankCounts,
      winRate,
      avgRank,
      avgRemainingCards,
    };
  }

  // 4. Pacing
  const turnsArr = gameStats.map((g) => g.turns);
  const minTurns = Math.min(...turnsArr);
  const maxTurns = Math.max(...turnsArr);
  const avgTurns = turnsArr.reduce((a, b) => a + b, 0) / totalGames;
  const avgTrickCycles = gameStats.reduce((a, g) => a + g.trickCycles, 0) / totalGames;
  const avgDurationMs = gameStats.reduce((a, g) => a + g.durationMs, 0) / totalGames;

  return {
    scenario,
    totalGames,
    gameStats,
    seatStats,
    aggregateLlm,
    aggregateHeuristic,
    pacing: {
      avgTurns,
      minTurns,
      maxTurns,
      avgTrickCycles,
      avgDurationMs,
      totalElapsedMs,
    },
  };
}

/**
 * Format and print comprehensive benchmark tables for a scenario.
 */
export function printScenarioReport(result: ScenarioBenchmarkResult): void {
  const { scenario, totalGames, seatStats, aggregateLlm, aggregateHeuristic, pacing } = result;

  console.log(`\n📊 RESULTS: ${scenario.title}`);
  console.log(`--------------------------------------------------------------------------------`);

  // Table 1: Seat Breakdown
  console.log(`\n1. SEAT-BY-SEAT PERFORMANCE:`);
  console.log(`┌──────┬───────────┬──────────────┬────────┬────────┬────────┬────────┬──────────┬───────────┐`);
  console.log(`│ Seat │ Agent     │ 1st Place %  │ 1st Pl │ 2nd Pl │ 3rd Pl │ 4th Pl │ Avg Rank │ Avg Cards │`);
  console.log(`├──────┼───────────┼──────────────┼────────┼────────┼────────┼────────┼──────────┼───────────┤`);

  for (const st of seatStats) {
    const seatStr = `Seat ${st.seat}`.padEnd(4);
    const agentStr = (st.agentType === 'llm' ? 'LLM Bot' : 'RuleBot').padEnd(9);
    const winRateStr = `${st.winRate.toFixed(1)}%`.padStart(12);
    const r1Str = `${st.rankCounts[0]}`.padStart(6);
    const r2Str = `${st.rankCounts[1]}`.padStart(6);
    const r3Str = `${st.rankCounts[2]}`.padStart(6);
    const r4Str = `${st.rankCounts[3]}`.padStart(6);
    const avgRankStr = st.avgRank.toFixed(2).padStart(8);
    const avgCardsStr = st.avgRemainingCards.toFixed(2).padStart(9);

    console.log(`│ ${seatStr} │ ${agentStr} │ ${winRateStr} │ ${r1Str} │ ${r2Str} │ ${r3Str} │ ${r4Str} │ ${avgRankStr} │ ${avgCardsStr} │`);
  }
  console.log(`└──────┴───────────┴──────────────┴────────┴────────┴────────┴────────┴──────────┴───────────┘`);

  // Table 2: Agent Type Comparison
  console.log(`\n2. AGENT TYPE COMPARISON:`);
  console.log(`┌───────────────┬───────────┬─────────────┬───────────┬───────────┬───────────┬──────────┬───────────┐`);
  console.log(`│ Agent Type    │ Samples   │ Win Rate %  │ 2nd Pl %  │ 3rd Pl %  │ 4th Pl %  │ Avg Rank │ Avg Cards │`);
  console.log(`├───────────────┼───────────┼─────────────┼───────────┼───────────┼───────────┼──────────┼───────────┤`);

  if (aggregateLlm) {
    const name = 'LLM Bot'.padEnd(13);
    const nStr = `${aggregateLlm.totalPlayerGames}`.padStart(9);
    const winStr = `${aggregateLlm.winRate.toFixed(1)}%`.padStart(11);
    const r2Str = `${((aggregateLlm.rankCounts[1] / aggregateLlm.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const r3Str = `${((aggregateLlm.rankCounts[2] / aggregateLlm.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const r4Str = `${((aggregateLlm.rankCounts[3] / aggregateLlm.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const avgRStr = aggregateLlm.avgRank.toFixed(2).padStart(8);
    const avgCStr = aggregateLlm.avgRemainingCards.toFixed(2).padStart(9);

    console.log(`│ ${name} │ ${nStr} │ ${winStr} │ ${r2Str} │ ${r3Str} │ ${r4Str} │ ${avgRStr} │ ${avgCStr} │`);
  }

  if (aggregateHeuristic) {
    const name = 'Rule-based Bot'.padEnd(13);
    const nStr = `${aggregateHeuristic.totalPlayerGames}`.padStart(9);
    const winStr = `${aggregateHeuristic.winRate.toFixed(1)}%`.padStart(11);
    const r2Str = `${((aggregateHeuristic.rankCounts[1] / aggregateHeuristic.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const r3Str = `${((aggregateHeuristic.rankCounts[2] / aggregateHeuristic.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const r4Str = `${((aggregateHeuristic.rankCounts[3] / aggregateHeuristic.totalPlayerGames) * 100).toFixed(1)}%`.padStart(9);
    const avgRStr = aggregateHeuristic.avgRank.toFixed(2).padStart(8);
    const avgCStr = aggregateHeuristic.avgRemainingCards.toFixed(2).padStart(9);

    console.log(`│ ${name} │ ${nStr} │ ${winStr} │ ${r2Str} │ ${r3Str} │ ${r4Str} │ ${avgRStr} │ ${avgCStr} │`);
  }
  console.log(`└───────────────┴───────────┴─────────────┴───────────┴───────────┴───────────┴──────────┴───────────┘`);

  // Table 3: Safety & Validation Metrics
  if (aggregateLlm) {
    console.log(`\n3. LLM SAFETY VALIDATOR & DECISION RELIABILITY:`);
    console.log(`  - Total LLM Decisions Attempted:  ${aggregateLlm.totalAttempts}`);
    console.log(`  - Valid / Legal LLM Plays:        ${aggregateLlm.totalAttempts - aggregateLlm.totalFallbacks}`);
    console.log(`  - Fallbacks (Caught by Validator): ${aggregateLlm.totalFallbacks} (${aggregateLlm.fallbackRate.toFixed(2)}%)`);
    if (aggregateLlm.totalFallbacks > 0) {
      console.log(`  - Illegal Attempt Breakdown:`);
      for (const [reason, count] of Object.entries(aggregateLlm.illegalReasons)) {
        console.log(`      * ${reason}: ${count}`);
      }
    } else {
      console.log(`  - Safety Status:                   PERFECT (0 illegal proposals / 100% compliant)`);
    }
  }

  // Table 4: Game Dynamics & Pacing
  console.log(`\n4. GAME PACING & EXECUTION DYNAMICS:`);
  console.log(`  - Total Games Played:       ${totalGames}`);
  console.log(`  - Average Turns per Game:   ${pacing.avgTurns.toFixed(1)} turns (min: ${pacing.minTurns}, max: ${pacing.maxTurns})`);
  console.log(`  - Average Trick Cycles:     ${pacing.avgTrickCycles.toFixed(1)} tricks`);
  console.log(`  - Average Game Duration:    ${pacing.avgDurationMs.toFixed(1)} ms`);
  console.log(`  - Total Scenario Runtime:   ${(pacing.totalElapsedMs / 1000).toFixed(2)}s`);
}

/**
 * Print Cross-Scenario Comparative Summary Table when 'all' mode is executed.
 */
export function printComparativeSummary(results: ScenarioBenchmarkResult[]): void {
  console.log(`\n================================================================================`);
  console.log(`🏆 OVERALL BENCHMARK COMPARATIVE SUMMARY`);
  console.log(`================================================================================`);

  console.log(`┌──────────────────────────────┬──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐`);
  console.log(`│ Scenario                     │ LLM Win Rate │ LLM Avg Rank │ Rule WinRate │ Rule AvgRank │ LLM Fallback │`);
  console.log(`├──────────────────────────────┼──────────────┼──────────────┼──────────────┼──────────────┼──────────────┤`);

  for (const res of results) {
    const scStr = res.scenario.title.padEnd(28);
    const llmWinStr = res.aggregateLlm ? `${res.aggregateLlm.winRate.toFixed(1)}%`.padStart(12) : 'N/A'.padStart(12);
    const llmRankStr = res.aggregateLlm ? res.aggregateLlm.avgRank.toFixed(2).padStart(12) : 'N/A'.padStart(12);
    const ruleWinStr = res.aggregateHeuristic ? `${res.aggregateHeuristic.winRate.toFixed(1)}%`.padStart(12) : 'N/A'.padStart(12);
    const ruleRankStr = res.aggregateHeuristic ? res.aggregateHeuristic.avgRank.toFixed(2).padStart(12) : 'N/A'.padStart(12);
    const fallbackStr = res.aggregateLlm ? `${res.aggregateLlm.fallbackRate.toFixed(1)}%`.padStart(12) : 'N/A'.padStart(12);

    console.log(`│ ${scStr} │ ${llmWinStr} │ ${llmRankStr} │ ${ruleWinStr} │ ${ruleRankStr} │ ${fallbackStr} │`);
  }
  console.log(`└──────────────────────────────┴──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘`);
}

/**
 * Main script runner entry point.
 */
export async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    return 0;
  }

  console.log(`\n🤖 Tjapza Capsa Banting - Headless LLM Benchmark`);
  console.log(`================================================================================`);
  console.log(`Mode:           ${options.mode}`);
  console.log(`Games/Scenario: ${options.games}`);
  console.log(`Execution Mode: ${options.mockLlm ? 'Simulated LLM (Mock/Offline)' : 'Live LLM API'}`);
  if (!options.mockLlm) {
    console.log(`Model:          ${options.model || process.env.LLM_MODEL || 'gpt-4o-mini'}`);
    console.log(`Endpoint:       ${options.endpoint || process.env.OPENAI_BASE_URL || 'OpenAI Default'}`);
  }

  const scenariosToRun: ScenarioDefinition[] =
    options.mode === 'all'
      ? [SCENARIOS['1v3'], SCENARIOS['2v2'], SCENARIOS['4v0']]
      : [SCENARIOS[options.mode]];

  const llmConfig: LlmClientConfig = {
    endpoint: options.endpoint,
    model: options.model,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
    mock: options.mockLlm,
  };

  const results: ScenarioBenchmarkResult[] = [];

  for (const scenario of scenariosToRun) {
    const res = await runScenarioBenchmark({
      scenario,
      totalGames: options.games,
      mockLlm: options.mockLlm,
      verbose: options.verbose,
      llmConfig,
    });
    printScenarioReport(res);
    results.push(res);
  }

  if (results.length > 1) {
    printComparativeSummary(results);
  }

  console.log(`\n✅ Benchmark suite completed successfully! (Exit Code 0)\n`);
  return 0;
}

// Execute if run directly from CLI
if (import.meta.main) {
  main()
    .then((exitCode) => {
      process.exit(exitCode);
    })
    .catch((err) => {
      console.error('\n❌ Benchmark error:', err);
      process.exit(1);
    });
}
