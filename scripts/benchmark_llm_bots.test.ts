import { describe, it, expect } from 'bun:test';
import {
  parseArgs,
  runSingleGame,
  runScenarioBenchmark,
  SCENARIOS,
} from './benchmark_llm_bots';

describe('Capsa Banting Headless LLM Benchmark Runner', () => {
  it('parses CLI arguments correctly', () => {
    const opts1 = parseArgs(['--games', '50', '--mode', '2v2', '--mock-llm', '--verbose']);
    expect(opts1.games).toBe(50);
    expect(opts1.mode).toBe('2v2');
    expect(opts1.mockLlm).toBe(true);
    expect(opts1.verbose).toBe(true);

    const opts2 = parseArgs(['-g', '15', '-m', '1v3'], {});
    expect(opts2.games).toBe(15);
    expect(opts2.mode).toBe('1v3');
    expect(opts2.mockLlm).toBe(true); // Defaults to true when no API key
  });

  it('runs a single 4-player game to full completion and returns valid stats', async () => {
    const result = await runSingleGame({
      gameIndex: 1,
      agentTypes: ['llm', 'heuristic', 'heuristic', 'heuristic'],
      mockLlm: true,
      verbose: false,
    });

    expect(result.gameIndex).toBe(1);
    expect(result.startingSeat).toBeGreaterThanOrEqual(0);
    expect(result.startingSeat).toBeLessThanOrEqual(3);
    expect(result.winnerRanks.length).toBe(4);
    // Ensure all 4 seats are present in winner ranks
    expect(new Set(result.winnerRanks).size).toBe(4);
    expect(result.turns).toBeGreaterThan(0);
    expect(result.trickCycles).toBeGreaterThan(0);
    expect(result.remainingCards.length).toBe(4);
    // At least 3 players should have 0 cards left
    const finishedCount = result.remainingCards.filter((c) => c === 0).length;
    expect(finishedCount).toBeGreaterThanOrEqual(3);
  });

  it('executes a scenario benchmark and computes accurate aggregate statistics', async () => {
    const totalGames = 5;
    const scenarioResult = await runScenarioBenchmark({
      scenario: SCENARIOS['1v3'],
      totalGames,
      mockLlm: true,
      verbose: false,
    });

    expect(scenarioResult.totalGames).toBe(totalGames);
    expect(scenarioResult.seatStats.length).toBe(4);

    // Sum of 1st places across all seats must equal totalGames
    const total1stPlaces = scenarioResult.seatStats.reduce(
      (sum, s) => sum + s.rankCounts[0],
      0
    );
    expect(total1stPlaces).toBe(totalGames);

    // LLM Aggregate check
    expect(scenarioResult.aggregateLlm).not.toBeNull();
    expect(scenarioResult.aggregateLlm?.totalPlayerGames).toBe(totalGames);
    expect(scenarioResult.aggregateLlm?.fallbackRate).toBeGreaterThanOrEqual(0);

    // Rule-based Aggregate check
    expect(scenarioResult.aggregateHeuristic).not.toBeNull();
    expect(scenarioResult.aggregateHeuristic?.totalPlayerGames).toBe(totalGames * 3);

    // Pacing checks
    expect(scenarioResult.pacing.avgTurns).toBeGreaterThan(20);
    expect(scenarioResult.pacing.avgTrickCycles).toBeGreaterThan(0);
    expect(scenarioResult.pacing.totalElapsedMs).toBeGreaterThan(0);
  });

  it('supports 2v2 and 4v0 modes smoothly', async () => {
    const res2v2 = await runScenarioBenchmark({
      scenario: SCENARIOS['2v2'],
      totalGames: 3,
      mockLlm: true,
      verbose: false,
    });
    expect(res2v2.aggregateLlm?.totalPlayerGames).toBe(6); // 2 seats * 3 games
    expect(res2v2.aggregateHeuristic?.totalPlayerGames).toBe(6);

    const res4v0 = await runScenarioBenchmark({
      scenario: SCENARIOS['4v0'],
      totalGames: 3,
      mockLlm: true,
      verbose: false,
    });
    expect(res4v0.aggregateLlm?.totalPlayerGames).toBe(12); // 4 seats * 3 games
    expect(res4v0.aggregateHeuristic).toBeNull();
  });
});
