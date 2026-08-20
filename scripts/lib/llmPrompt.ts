import {
  Card,
  CardCombo,
  Hand,
  Trick,
  BotEngine,
  CapsaGame,
  CARD_3D,
  RANK_NAMES,
  SUIT_SYMBOLS,
  RANK_2,
  type BotDecision,
  type ComboType,
} from '../../web/src/domain';

export interface LlmMoveHistoryRecord {
  turn: number;
  seat: number;
  agentType: 'llm' | 'heuristic';
  action: 'play' | 'pass';
  cards: string[];
  isFallback?: boolean;
  illegalReason?: string | null;
}

export interface LlmPromptContext {
  game: CapsaGame;
  hand: Hand;
  seatIndex: number;
  seatName?: string;
  moveHistory?: LlmMoveHistoryRecord[];
}

export interface ParsedLlmDecision {
  reasoning?: string;
  action: 'play' | 'pass';
  cards: number[];
}

export interface ValidationResult {
  valid: boolean;
  decision: BotDecision;
  isFallback: boolean;
  illegalReason: string | null;
  rawResponse?: string;
  parsed?: ParsedLlmDecision;
}

export type StrategyVariant = 'balanced' | 'aggressive_tempo' | 'loss_minimizer' | 'adaptive_master';

export interface LlmClientConfig {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  mock?: boolean;
  temperature?: number;
  strategyVariant?: StrategyVariant;
}

/**
 * Format a CardCombo into human-readable description with card codes.
 */
export function formatComboDetailed(combo: CardCombo): string {
  const cardNames = combo.cards.map((c) => `${c.name}(#${c.code})`).join(' ');
  const typeLabel = combo.type.replace('_', ' ').toUpperCase();
  return `${typeLabel}: [${cardNames}]`;
}

/**
 * Build the system prompt establishing Capsa Banting rules, hierarchy, and contracts.
 */
export function buildSystemPrompt(): string {
  return `You are an elite Capsa Banting (Big Two) AI card game player.

### GAME RULES & CONSTRAINTS:
1. Four players (Seats 0 to 3) are dealt 13 cards each from a standard 52-card deck.
2. Card Hierarchy:
   - Rank Order: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A < 2 (2 is the highest individual rank; 3 is the lowest).
   - Suit Order: ♦ (Diamonds, suit 0) < ♣ (Clubs, suit 1) < ♥ (Hearts, suit 2) < ♠ (Spades, suit 3).
   - Card Code encoding: code = rank * 4 + suit (integer 0 to 51). 0 is 3♦ (lowest card), 51 is 2♠ (highest card).
3. Legal Combinations:
   - Single (1 card): beaten by higher rank, or same rank with higher suit.
   - Pair (2 cards of same rank): beaten by higher rank, or same rank with higher top suit.
   - 5-Card Combos: Hierarchy: Straight Flush > Quads (4-of-a-kind + 1 kicker) > Full House (3-of-a-kind + pair) > Flush > Straight.
4. Trick Flow & Turn Actions:
   - OPENING MOVE: The player holding 3♦ MUST open the very first trick of the game with a combo CONTAINING 3♦ (code 0). Passing is STRICTLY FORBIDDEN on opening.
   - FRESH TRICK LEAD: When the table is empty (all opponents passed the previous trick), the trick winner leads a fresh combo of any type. Passing is STRICTLY FORBIDDEN on fresh lead.
   - BEATING: You must play the EXACT same combo type (Single vs Single, Pair vs Pair, 5-Card vs 5-Card) and it must strictly BEAT the active combo on the table.
   - PASSING: If you cannot or choose not to beat the table combo, you may PASS. Passing locks you out of the remainder of the current trick.
5. Goal: Be the first to empty your hand (0 cards).

### STRATEGY GUIDANCE:
- Preserve high cards (Aces and 2s) for crucial control or endgame defense.
- On fresh leads, shed bulk cards first (5-card combos like full houses or straights, or lower pairs).
- Watch opponent card counts closely! If any opponent has <= 3 cards, they are in ENDGAME THREAT. Play aggressively to block them and prevent them from winning.

### OUTPUT FORMAT:
You MUST respond with a single valid JSON object strictly matching this schema:
\`\`\`json
{
  "reasoning": "Short 1-2 sentence tactical analysis",
  "action": "play" | "pass",
  "cards": [0, 4, 8] // array of integer card codes (0..51) to play, or empty array [] if passing
}
\`\`\``;
}

/**
 * Build the game state prompt for the LLM turn.
 */
export function buildUserPrompt(ctx: LlmPromptContext): string {
  const { game, hand, seatIndex, seatName = `Seat ${seatIndex}`, moveHistory = [] } = ctx;
  const isOpening = game.isOpeningMove;
  const isFresh = game.trick.isFresh;
  const lastCombo = game.trick.lastCombo;

  // 1. Hand information
  const handCardsFormatted = hand.cards
    .map((c) => `${c.name}(code:${c.code})`)
    .join(', ');

  // Decompose hand to show natural combo partitions
  const decomposed = hand.decompose();
  const decomposedFormatted = decomposed.length > 0
    ? decomposed.map((c) => `  - ${formatComboDetailed(c)}`).join('\n')
    : '  - None (hand empty)';

  // 2. Table / Trick status
  let trickStatus = '';
  if (isOpening) {
    trickStatus = 'OPENING MOVE OF THE GAME. You hold 3♦. You MUST play a combination containing 3♦ (code 0). Passing is FORBIDDEN.';
  } else if (isFresh) {
    trickStatus = 'FRESH TRICK LEAD (Table is empty). You won the previous trick or were awarded the lead. You MUST play a combination. Passing is FORBIDDEN.';
  } else if (lastCombo) {
    const leaderSeat = game.trick.lastPlaySeatIndex >= 0 ? game.trick.lastPlaySeatIndex : game.leaderIndex;
    trickStatus = `ACTIVE COMBO ON TABLE: ${formatComboDetailed(lastCombo)} played by Seat ${leaderSeat}. You must play a higher ${lastCombo.type.replace('_', ' ')} or PASS.`;
  }

  // Passed seats
  const passedSeats = game.trick.passedSeats.length > 0
    ? game.trick.passedSeats.map((s) => `Seat ${s}`).join(', ')
    : 'None';

  // 3. Opponent card counts and danger warnings
  const countsInfo: string[] = [];
  const dangerWarnings: string[] = [];
  for (let s = 0; s < 4; s++) {
    const isMe = s === seatIndex;
    const count = game.counts[s] ?? 0;
    const label = isMe ? `${seatName} (YOU)` : `Seat ${s}`;
    countsInfo.push(`${label}: ${count} card${count === 1 ? '' : 's'}`);

    if (!isMe && count > 0 && count <= 3) {
      dangerWarnings.push(`🚨 CRITICAL THREAT: Seat ${s} has only ${count} card${count === 1 ? '' : 's'} remaining! BLOCK THEM!`);
    }
  }

  // 4. Candidate Legal Moves
  const playableCombos = hand.findPlayableCombos(lastCombo, isOpening);
  let candidatesFormatted = '';
  if (playableCombos.length === 0) {
    candidatesFormatted = '  - No legal beating combos available in your hand (You must PASS).';
  } else {
    candidatesFormatted = playableCombos
      .slice(0, 15) // limit to top 15 candidates for prompt compactness
      .map((c, idx) => `  [${idx + 1}] ${formatComboDetailed(c)} -> codes: [${c.cards.map((k) => k.code).join(', ')}]`)
      .join('\n');
    if (playableCombos.length > 15) {
      candidatesFormatted += `\n  ... and ${playableCombos.length - 15} more combinations.`;
    }
  }

  const passAllowed = game.canPass(seatIndex);

  // 5. Recent move history (last 4 moves)
  const recentMoves = moveHistory.slice(-4);
  const historyFormatted = recentMoves.length > 0
    ? recentMoves
        .map((m) => `Turn ${m.turn}: Seat ${m.seat} (${m.agentType}) -> ${m.action.toUpperCase()} ${m.cards.length > 0 ? `[${m.cards.join(', ')}]` : ''}`)
        .join('\n')
    : 'Game start / No prior moves';

  return `### CURRENT GAME STATE:
- Your Seat: ${seatName} (Seat Index: ${seatIndex})
- Your Hand (${hand.size} cards): [${handCardsFormatted}]
- Natural Hand Partition (Suggested Combos):
${decomposedFormatted}

### TABLE & TRICK STATUS:
- ${trickStatus}
- Passed Seats in current trick: [${passedSeats}]

### ALL PLAYERS CARD COUNTS:
${countsInfo.map((c) => `- ${c}`).join('\n')}
${dangerWarnings.length > 0 ? `\n${dangerWarnings.join('\n')}\n` : ''}
### RECENT MOVE HISTORY:
${historyFormatted}

### CANDIDATE LEGAL MOVES AVAILABLE:
${candidatesFormatted}
- PASS Action: ${passAllowed ? 'ALLOWED' : 'FORBIDDEN (You must play a legal combo)'}

Select your best strategic move. Respond with JSON strictly containing "reasoning", "action" ("play"|"pass"), and "cards" (array of card codes).`;
}

/**
 * Extract and parse JSON from raw LLM output.
 */
export function parseLlmResponse(raw: string): ParsedLlmDecision {
  let cleaned = raw.trim();

  // Strip markdown code fences if present
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonMatch && jsonMatch[1]) {
    cleaned = jsonMatch[1].trim();
  } else {
    // Try to isolate the first JSON object {}
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }

  const parsed = JSON.parse(cleaned);

  const actionStr = String(parsed.action || '').toLowerCase().trim();
  const action: 'play' | 'pass' = actionStr === 'pass' ? 'pass' : 'play';
  const reasoning = typeof parsed.reasoning === 'string' ? parsed.reasoning : '';

  let cards: number[] = [];
  if (Array.isArray(parsed.cards)) {
    cards = parsed.cards
      .map((c: any) => {
        if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c <= 51) {
          return c;
        }
        if (typeof c === 'string') {
          const trimmed = c.trim();
          if (/^\d+$/.test(trimmed)) {
            const num = parseInt(trimmed, 10);
            if (!isNaN(num) && num >= 0 && num <= 51) return num;
          }
          try {
            return Card.fromString(trimmed).code;
          } catch {
            return -1;
          }
        }
        return -1;
      })
      .filter((code: number) => code >= 0 && code <= 51);
  }

  return {
    reasoning,
    action,
    cards,
  };
}

/**
 * Validate LLM move against game state rules and hand integrity.
 * If invalid, falls back safely to BotEngine heuristic.
 */
export function validateLlmMove(params: {
  game: CapsaGame;
  hand: Hand;
  seatIndex: number;
  parsed: ParsedLlmDecision | null;
  rawResponse?: string;
}): ValidationResult {
  const { game, hand, seatIndex, parsed, rawResponse } = params;

  if (!parsed) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'json_parse_failed',
      rawResponse,
    };
  }

  // 1. Pass Action Validation
  if (parsed.action === 'pass') {
    if (game.canPass(seatIndex)) {
      return {
        valid: true,
        decision: { action: 'pass', cards: [] },
        isFallback: false,
        illegalReason: null,
        rawResponse,
        parsed,
      };
    }

    // Illegal pass (e.g. on opening move or fresh lead)
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: game.isOpeningMove
        ? 'illegal_pass_on_opening'
        : 'illegal_pass_on_fresh_lead',
      rawResponse,
      parsed,
    };
  }

  // 2. Play Action Validation
  if (parsed.cards.length === 0) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'empty_play_cards',
      rawResponse,
      parsed,
    };
  }

  // Verify all cards exist in player hand
  if (!hand.hasCards(parsed.cards)) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'cards_not_in_hand',
      rawResponse,
      parsed,
    };
  }

  // Evaluate card combination
  const combo = CardCombo.evaluate(parsed.cards);
  if (!combo) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'invalid_card_combo',
      rawResponse,
      parsed,
    };
  }

  // Check opening move constraint (must contain 3♦)
  if (game.isOpeningMove && !combo.containsCardCode(CARD_3D)) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'missing_3d_opening',
      rawResponse,
      parsed,
    };
  }

  // Check trick beating rules
  if (!game.trick.canPlay(combo, seatIndex)) {
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: 'cannot_beat_table_combo',
      rawResponse,
      parsed,
    };
  }

  // All checks passed!
  return {
    valid: true,
    decision: {
      action: 'play',
      cards: combo.cards,
      combo,
    },
    isFallback: false,
    illegalReason: null,
    rawResponse,
    parsed,
  };
}

export type StrategyVariant = 'balanced' | 'aggressive_tempo' | 'loss_minimizer' | 'adaptive_master' | 'random_top2';

export interface LlmClientConfig {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  mock?: boolean;
  temperature?: number;
  strategyVariant?: StrategyVariant;
}

/**
 * Intelligent Mock LLM strategy simulator that exercises the prompt builder,
 * response serialization, JSON parsing, safety validation pipeline, and multi-variant tuning.
 */
export function simulateMockLlmDecision(
  ctx: LlmPromptContext,
  requestedVariant: StrategyVariant = 'random_top2'
): string {
  const { game, hand, seatIndex } = ctx;
  const isOpening = game.isOpeningMove;
  const isFresh = game.trick.isFresh;
  const lastCombo = game.trick.lastCombo;

  const decomposed = hand.decompose();
  const natural5s = decomposed.filter((c) => c.is5CardCombo);
  const naturalPairs = decomposed.filter((c) => c.type === 'pair');
  const orphanSingles = decomposed.filter((c) => c.type === 'single');

  // Compute Hand Power Equity for adaptive tuning
  const twosCount = hand.cards.filter((c) => c.rank === RANK_2).length;
  const acesCount = hand.cards.filter((c) => c.rank === 11).length;
  const combosCount = natural5s.length;
  const lowSinglesCount = orphanSingles.filter((c) => c.mainRank <= 5).length;
  const handPower = twosCount * 3 + acesCount * 1.5 + combosCount * 3.5 - lowSinglesCount * 0.8;

  // Resolve active variant
  let activeVariant: 'balanced' | 'aggressive_tempo' | 'loss_minimizer' = 'balanced';
  const effectiveVariant = requestedVariant === 'random_top2' 
    ? (Math.random() < 0.5 ? 'adaptive_master' : 'aggressive_tempo')
    : requestedVariant;

  if (effectiveVariant === 'adaptive_master') {
    if (handPower >= 5.0) {
      activeVariant = 'aggressive_tempo';
    } else if (handPower <= 2.0 || hand.cards.length >= 10) {
      activeVariant = 'loss_minimizer';
    } else {
      activeVariant = 'balanced';
    }
  } else {
    activeVariant = effectiveVariant as 'balanced' | 'aggressive_tempo' | 'loss_minimizer';
  }

  // Determine threat threshold based on variant
  const threatLimit = activeVariant === 'loss_minimizer' ? 4 : 3;
  const isEndgameThreat = game.counts.some((cnt, s) => s !== seatIndex && cnt > 0 && cnt <= threatLimit);
  const downstreamSeat = (seatIndex + 1) % 4;
  const isDownstreamCritical = (game.counts[downstreamSeat] ?? 13) <= 2;

  // 1. Opening Move (Must contain 3♦)
  if (isOpening) {
    const fiveCard3D = decomposed.find((c) => c.is5CardCombo && c.containsCardCode(CARD_3D));
    if (fiveCard3D) {
      return JSON.stringify({
        reasoning: `Opening with natural 5-card ${fiveCard3D.type} containing 3♦ to shed bulk early.`,
        action: 'play',
        cards: fiveCard3D.cards.map((c) => c.code),
      });
    }

    const pair3D = decomposed.find((c) => c.type === 'pair' && c.containsCardCode(CARD_3D));
    if (pair3D) {
      return JSON.stringify({
        reasoning: `Opening with natural pair containing 3♦.`,
        action: 'play',
        cards: pair3D.cards.map((c) => c.code),
      });
    }

    const single3D = hand.cards.find((c) => c.code === CARD_3D) || hand.cards[0];
    return JSON.stringify({
      reasoning: 'Opening with single 3♦.',
      action: 'play',
      cards: [single3D.code],
    });
  }

  // 2. Fresh Lead
  if (isFresh) {
    // A. Direct winning out: if only 1 combo left, play it to win!
    if (decomposed.length === 1) {
      const outCombo = decomposed[0];
      return JSON.stringify({
        reasoning: `Final combination in hand (${outCombo.type}). Playing to empty hand and win!`,
        action: 'play',
        cards: outCombo.cards.map((c) => c.code),
      });
    }

    // B. Lead 5-card combo to dump 5 cards at once (highest efficiency)
    if (natural5s.length > 0) {
      const lowest5 = natural5s[0];
      return JSON.stringify({
        reasoning: `Leading fresh trick with 5-card ${lowest5.type} (${lowest5.description}) to rapidly shed hand bulk.`,
        action: 'play',
        cards: lowest5.cards.map((c) => c.code),
      });
    }

    // C. Lead natural pairs (lowest non-2 pair unless endgame threat)
    if (naturalPairs.length > 0) {
      const safePairs = isEndgameThreat ? naturalPairs : naturalPairs.filter((c) => c.mainRank < RANK_2);
      if (safePairs.length > 0) {
        const lowestPair = safePairs[0];
        return JSON.stringify({
          reasoning: `Leading low natural pair of ${RANK_NAMES[lowestPair.mainRank]}s.`,
          action: 'play',
          cards: lowestPair.cards.map((c) => c.code),
        });
      }
    }

    // D. Lead singles:
    if (orphanSingles.length > 0) {
      // M. Lee Rule for aggressive variant: with <2S, x, y>, lead intermediate x
      if (activeVariant === 'aggressive_tempo' && orphanSingles.length === 3 && hand.cards.length === 3) {
        const has2S = orphanSingles.some((s) => s.cards[0].code === 51);
        if (has2S) {
          const non2s = orphanSingles.filter((s) => s.cards[0].code !== 51).sort((a, b) => b.mainRank - a.mainRank);
          if (non2s.length >= 2) {
            const intermediate = non2s[0]; // highest of the non-2s
            return JSON.stringify({
              reasoning: `M. Lee Intermediate Lead: Leading ${intermediate.cards[0].name} to force opponent high card before closing with 2♠.`,
              action: 'play',
              cards: intermediate.cards.map((c) => c.code),
            });
          }
        }
      }

      // Safe singles (avoid leading 2 unless endgame)
      const safeSingles = isEndgameThreat ? orphanSingles : orphanSingles.filter((c) => c.mainRank < RANK_2);
      if (safeSingles.length > 0) {
        const lowestSingle = safeSingles[0];
        return JSON.stringify({
          reasoning: `Leading lowest orphan single ${lowestSingle.cards[0].name}.`,
          action: 'play',
          cards: lowestSingle.cards.map((c) => c.code),
        });
      }
    }

    // E. Fallback lead lowest single card
    return JSON.stringify({
      reasoning: 'Leading lowest card in hand.',
      action: 'play',
      cards: [hand.cards[0].code],
    });
  }

  // 3. Beating an active trick
  if (lastCombo) {
    const playable = hand.findPlayableCombos(lastCombo, false);
    if (playable.length === 0) {
      return JSON.stringify({
        reasoning: `Cannot beat active ${lastCombo.type} (${lastCombo.description}). Passing.`,
        action: 'pass',
        cards: [],
      });
    }

    // A. Winning Path Check: If we can beat the table and our remaining hand is completely clean
    const directWinCandidate = playable.find((combo) => {
      const remainingCodes = hand.cardCodes.filter((c) => !combo.containsCardCode(c));
      return remainingCodes.length === 0;
    });
    if (directWinCandidate) {
      return JSON.stringify({
        reasoning: `Direct winning play! Emptying hand with ${directWinCandidate.type}.`,
        action: 'play',
        cards: directWinCandidate.cards.map((c) => c.code),
      });
    }

    // B. If 5-card combo on table: play lowest beating 5-card combo
    if (lastCombo.is5CardCombo) {
      const beating5s = playable.filter((c) => c.is5CardCombo);
      if (beating5s.length > 0) {
        const lowestBeat5 = beating5s[0];
        return JSON.stringify({
          reasoning: `Beating 5-card ${lastCombo.type} with ${lowestBeat5.type} (${lowestBeat5.description}).`,
          action: 'play',
          cards: lowestBeat5.cards.map((c) => c.code),
        });
      }
      return JSON.stringify({
        reasoning: 'Cannot beat 5-card combo. Passing.',
        action: 'pass',
        cards: [],
      });
    }

    // C. If Pair on table:
    if (lastCombo.type === 'pair') {
      const beatingNaturalPairs = naturalPairs.filter((p) => p.canBeat(lastCombo));
      if (beatingNaturalPairs.length > 0) {
        const non2Pairs = beatingNaturalPairs.filter((p) => p.mainRank < RANK_2);
        if (non2Pairs.length > 0) {
          const lowestPair = non2Pairs[0];
          return JSON.stringify({
            reasoning: `Beating pair with lowest natural pair of ${RANK_NAMES[lowestPair.mainRank]}s.`,
            action: 'play',
            cards: lowestPair.cards.map((c) => c.code),
          });
        }

        // We have pair of 2s: spend it if we have 5-card bulk, loss mitigation, or endgame
        if (
          isEndgameThreat ||
          natural5s.length > 0 ||
          hand.cards.length <= 4 ||
          (activeVariant === 'aggressive_tempo' && twosCount >= 2) ||
          (activeVariant === 'loss_minimizer' && hand.cards.length >= 8)
        ) {
          const pair2 = beatingNaturalPairs[0];
          return JSON.stringify({
            reasoning: `Seizing tempo with Pair of 2s to dump ${natural5s.length > 0 ? '5-card combo' : 'hand bulk'}.`,
            action: 'play',
            cards: pair2.cards.map((c) => c.code),
          });
        }
      }

      // If no natural non-2 pair, but opponent is about to win
      if (isEndgameThreat || isDownstreamCritical) {
        const highestPair = playable[playable.length - 1];
        return JSON.stringify({
          reasoning: `Endgame defense! Blocking dangerous opponent with high pair.`,
          action: 'play',
          cards: highestPair.cards.map((c) => c.code),
        });
      }

      return JSON.stringify({
        reasoning: `Preserving structure against pair of ${RANK_NAMES[lastCombo.mainRank]}s. Passing.`,
        action: 'pass',
        cards: [],
      });
    }

    // D. If Single on table:
    if (lastCombo.type === 'single') {
      // 1. First preference: Beat with an orphan single (preserves pairs and 5-cards)
      const beatingOrphans = orphanSingles.filter((s) => s.canBeat(lastCombo));
      const non2Orphans = beatingOrphans.filter((s) => s.mainRank < RANK_2);

      if (non2Orphans.length > 0) {
        const lowestOrphan = non2Orphans[0];
        return JSON.stringify({
          reasoning: `Beating single ${lastCombo.cards[0].name} with lowest orphan single ${lowestOrphan.cards[0].name}.`,
          action: 'play',
          cards: lowestOrphan.cards.map((c) => c.code),
        });
      }

      // 2. High Value Tempo Play: If we hold a 2 single and have 5-card combo(s) or strong endgame
      if (
        natural5s.length > 0 ||
        (hand.cards.length <= 4 && decomposed.length <= 2) ||
        (activeVariant === 'aggressive_tempo' && twosCount >= 2) ||
        (activeVariant === 'loss_minimizer' && hand.cards.length >= 9)
      ) {
        const single2 = beatingOrphans.find((s) => s.mainRank === RANK_2) || playable.find((c) => c.mainRank === RANK_2);
        if (single2) {
          return JSON.stringify({
            reasoning: `Tactical Tempo Seizure: Playing high 2 (${single2.cards[0].name}) to gain fresh lead for hand shedding.`,
            action: 'play',
            cards: single2.cards.map((c) => c.code),
          });
        }
      }

      // 3. Endgame Threat Defense / Downstream 1-Card Rule: Block opponent finish
      if (isEndgameThreat || isDownstreamCritical) {
        const highestSingle = playable[playable.length - 1];
        return JSON.stringify({
          reasoning: `Endgame Defense: Playing top single (${highestSingle.cards[0].name}) to block dangerous opponent.`,
          action: 'play',
          cards: highestSingle.cards.map((c) => c.code),
        });
      }

      // 4. Opponent played high rank (Ace or 2): contest if we have 2S
      if (lastCombo.mainRank >= 11) {
        const single2 = playable.find((c) => c.mainRank === RANK_2);
        if (single2 && (hand.cards.length <= 6 || natural5s.length > 0 || activeVariant === 'aggressive_tempo')) {
          return JSON.stringify({
            reasoning: `Contesting high card with 2 (${single2.cards[0].name}) to regain control.`,
            action: 'play',
            cards: single2.cards.map((c) => c.code),
          });
        }
      }

      // 5. Loss Minimizer: In double penalty territory (>= 10 cards), shed any legal single
      if (activeVariant === 'loss_minimizer' && hand.cards.length >= 10 && playable.length > 0) {
        const lowestLegal = playable[0];
        return JSON.stringify({
          reasoning: `Loss Minimization: Shedding single card (${lowestLegal.cards[0].name}) to escape double penalty territory.`,
          action: 'play',
          cards: lowestLegal.cards.map((c) => c.code),
        });
      }

      return JSON.stringify({
        reasoning: `Preserving high cards and combo structures. Passing.`,
        action: 'pass',
        cards: [],
      });
    }
  }

  return JSON.stringify({
    action: 'pass',
    cards: [],
  });
}

/**
 * Execute LLM move decision (Mock or Live HTTP inference) with automatic validation.
 */
export async function decideLlmMove(params: {
  game: CapsaGame;
  hand: Hand;
  seatIndex: number;
  seatName?: string;
  moveHistory?: LlmMoveHistoryRecord[];
  mock?: boolean;
  llmConfig?: LlmClientConfig;
}): Promise<ValidationResult> {
  const { game, hand, seatIndex, seatName, moveHistory, mock = true, llmConfig } = params;

  const promptCtx: LlmPromptContext = {
    game,
    hand,
    seatIndex,
    seatName,
    moveHistory,
  };

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(promptCtx);

  // If mock mode requested or no live credentials configured
  if (mock || (!llmConfig?.apiKey && !llmConfig?.endpoint && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY)) {
    const rawMockResponse = simulateMockLlmDecision(promptCtx, llmConfig?.strategyVariant || 'adaptive_master');
    let parsed: ParsedLlmDecision | null = null;
    try {
      parsed = parseLlmResponse(rawMockResponse);
    } catch {
      parsed = null;
    }
    return validateLlmMove({
      game,
      hand,
      seatIndex,
      parsed,
      rawResponse: rawMockResponse,
    });
  }

  // Live HTTP Inference (OpenAI / Ollama / Gemini compatible)
  const endpoint =
    llmConfig?.endpoint ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1/chat/completions';
  const apiKey =
    llmConfig?.apiKey ||
    process.env.OPENAI_API_KEY ||
    '';
  const model =
    llmConfig?.model ||
    process.env.LLM_MODEL ||
    'gpt-4o-mini';
  const timeoutMs = llmConfig?.timeoutMs || 10000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: llmConfig?.temperature ?? 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`LLM HTTP error: ${res.status} ${res.statusText}`);
    }

    const data: any = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = parseLlmResponse(content);

    return validateLlmMove({
      game,
      hand,
      seatIndex,
      parsed,
      rawResponse: content,
    });
  } catch (err: any) {
    // Fallback on network/inference error
    const fallbackDecision = BotEngine.decideMove({
      hand,
      trick: game.trick,
      isOpeningMove: game.isOpeningMove,
      counts: game.counts,
      seatIndex,
    });
    return {
      valid: false,
      decision: fallbackDecision,
      isFallback: true,
      illegalReason: `inference_error: ${err.message || 'unknown'}`,
      rawResponse: '',
    };
  }
}
