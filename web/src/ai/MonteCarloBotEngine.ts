import {
  Card,
  CardCombo,
  Hand,
  Trick,
  CapsaGame,
  type BotDecision,
  type GameSeat,
} from '../domain';

export interface MctsOptions {
  rolloutsPerMove?: number;
  maxPlayoutTurns?: number;
}

/**
 * Cards the deciding seat has not seen: everything outside its hand and
 * outside the publicly played record. Determinizations deal only from this pool.
 */
export function unseenCardCodes(
  handCodes: number[],
  playedCardCodes: number[] = []
): number[] {
  const seen = new Set<number>(handCodes);
  for (const code of playedCardCodes) seen.add(code);
  const unseen: number[] = [];
  for (let c = 0; c < 52; c++) {
    if (!seen.has(c)) unseen.push(c);
  }
  return unseen;
}

/**
 * High-performance Determinized Monte Carlo Search (PIMC) Bot Engine for Capsa Banting.
 *
 * Evaluates all legal candidate plays by simulating rollouts across random determinizations
 * of unseen cards, optimizing for 1st-place equity while heavily penalizing 4th-place risk.
 */
export class MonteCarloBotEngine {
  public static decideMove(params: {
    hand: Hand;
    trick: Trick;
    isOpeningMove?: boolean;
    counts?: number[];
    seatIndex?: number;
    playedCardCodes?: number[];
    options?: MctsOptions;
  }): BotDecision {
    const {
      hand,
      trick,
      isOpeningMove = false,
      counts = [13, 13, 13, 13],
      seatIndex = 0,
      playedCardCodes = [],
      options = {},
    } = params;

    if (hand.isEmpty) {
      return { action: 'pass', cards: [] };
    }

    const rolloutsPerMove = options.rolloutsPerMove ?? 25;
    const maxPlayoutTurns = options.maxPlayoutTurns ?? 50;

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

    // Direct Return if Only 1 Option Exists
    if (candidates.length === 1) {
      return candidates[0];
    }

    // Direct Instant Win Check: If any candidate directly sheds the entire remaining hand, play it!
    const instantWin = candidates.find(
      (c) => c.action === 'play' && c.cards.length === hand.cards.length
    );
    if (instantWin) {
      return instantWin;
    }

    // 2. Identify Unseen Cards Pool (Without Cheating - Imperfect Information)
    const unseenPool = unseenCardCodes(hand.cardCodes, playedCardCodes);

    // 3. Evaluate each candidate via Monte Carlo Rollouts
    let bestScore = -Infinity;
    let bestCandidate = candidates[0];

    for (const candidate of candidates) {
      let candidateScore = 0;

      for (let r = 0; r < rolloutsPerMove; r++) {
        // Fast in-place Fisher-Yates shuffle of unseen cards pool
        const shuffled = [...unseenPool];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const tmp = shuffled[i];
          shuffled[i] = shuffled[j];
          shuffled[j] = tmp;
        }

        // Deal cards to opponents according to their current visible counts
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
          leaderIndex: trick.leaderSeatIndex,
          trick: trick,
          winnerRanks: [],
        });

        // Apply candidate move first
        if (candidate.action === 'play' && candidate.cards.length > 0) {
          simHands[seatIndex] = simHands[seatIndex].remove(candidate.cards);
          simGame = simGame.applyPlay(candidate.cards, seatIndex);
        } else {
          simGame = simGame.applyPass(seatIndex);
        }

        // Fast Playout Rollout until match completion
        let simTurns = 0;
        while (simGame.status === 'playing' && simTurns++ < maxPlayoutTurns) {
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
          candidateScore += 10.0;
        } else if (finishRank === 2) {
          candidateScore += 4.0;
        } else if (finishRank === 3) {
          candidateScore += 1.0;
        } else {
          candidateScore -= 6.0; // Heavy penalty for 4th place risk
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
