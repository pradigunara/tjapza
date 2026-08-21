import { CapsaGame, Deck, Hand, Trick, type BotDecision, type GameSeat } from '../web/src/domain';
import { MonteCarloBotEngine } from '../web/src/ai/MonteCarloBotEngine';

interface DecideParams {
  hand: Hand;
  trick: Trick;
  isOpeningMove: boolean;
  counts: number[];
  seatIndex: number;
  playedCardCodes: number[];
}

type Policy = (params: DecideParams) => BotDecision;

const mctsPolicy =
  (rolloutsPerMove: number): Policy =>
  (p) =>
    MonteCarloBotEngine.decideMove({ ...p, options: { rolloutsPerMove } });

function playGame(policies: Policy[]): { ranks: number[]; latencyMs: number[][] } {
  const deck = new Deck().shuffle();
  const { hands: dealt, startingSeat } = deck.deal();
  const hands = dealt.map((cards) => new Hand(cards));
  const seats: GameSeat[] = [0, 1, 2, 3].map((i) => ({
    userId: `s${i}`,
    name: `S${i}`,
    isBot: true,
    connected: true,
  }));

  let game = new CapsaGame({
    id: 'sim',
    status: 'playing',
    seats,
    counts: [13, 13, 13, 13],
    turnIndex: startingSeat,
    leaderIndex: startingSeat,
    trick: Trick.createFresh(startingSeat),
    winnerRanks: [],
  });

  const playedCardCodes: number[] = [];
  const latencyMs: number[][] = policies.map(() => []);

  let guard = 0;
  while (game.status === 'playing' && guard++ < 500) {
    const cur = game.turnIndex;
    if ((game.counts[cur] ?? 0) === 0) {
      game = game.reconcile().game;
      continue;
    }

    const params: DecideParams = {
      hand: hands[cur],
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: [...game.counts],
      seatIndex: cur,
      playedCardCodes,
    };

    const t0 = performance.now();
    const decision = policies[cur](params);
    latencyMs[cur].push(performance.now() - t0);

    if (decision.action === 'play') {
      for (const c of decision.cards) playedCardCodes.push(c.code);
      hands[cur] = hands[cur].remove(decision.cards);
      game = game.applyPlay(decision.cards, cur);
    } else {
      if (game.trick.isFresh || game.isOpeningMove) {
        throw new Error(`Illegal pass by seat ${cur} on fresh/opening trick`);
      }
      game = game.applyPass(cur);
    }
  }

  if (game.status !== 'finished') throw new Error('Game did not finish within guard limit');
  return { ranks: game.winnerRanks, latencyMs };
}

interface SideStats {
  games: number;
  firsts: number;
  seconds: number;
  placeSum: number;
  latencies: number[];
}

function emptyStats(): SideStats {
  return { games: 0, firsts: 0, seconds: 0, placeSum: 0, latencies: [] };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function runFourWay(rollouts: number[], games: number): void {
  const stats = rollouts.map(() => emptyStats());

  for (let g = 0; g < games; g++) {
    // Rotate tier assignment across seats every game to cancel positional bias
    const policies: Policy[] = rollouts.map((_, s) =>
      mctsPolicy(rollouts[(s + g) % rollouts.length])
    );

    const { ranks, latencyMs } = playGame(policies);

    for (let s = 0; s < 4; s++) {
      const tierIdx = (s + g) % rollouts.length;
      const place = ranks.indexOf(s) + 1;
      const st = stats[tierIdx];
      st.games++;
      st.placeSum += place;
      if (place === 1) st.firsts++;
      if (place === 2) st.seconds++;
      st.latencies.push(...latencyMs[s]);
    }
  }

  console.log(`\n=== Four-way: ${rollouts.map((n) => `mcts-${n}`).join(' / ')} — ${games} games ===`);
  rollouts.forEach((n, i) => {
    const s = stats[i];
    const winPct = ((100 * s.firsts) / s.games).toFixed(1).padStart(5);
    const top2Pct = ((100 * (s.firsts + s.seconds)) / s.games).toFixed(1).padStart(5);
    const avgPlace = (s.placeSum / s.games).toFixed(2).padStart(4);
    const p50 = percentile(s.latencies, 50).toFixed(1).padStart(6);
    const p95 = percentile(s.latencies, 95).toFixed(1).padStart(7);
    console.log(`mcts-${String(n).padEnd(3)} win ${winPct}%  top2 ${top2Pct}%  avgPlace ${avgPlace}  latency p50 ${p50}ms p95 ${p95}ms`);
  });
}

const games = Number(process.argv[2] ?? 200);
runFourWay([10, 30, 60, 80], games);
