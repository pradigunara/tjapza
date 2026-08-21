import { sendTick, fetchPlayerHand, playMove, type GameRecord } from '../net/pb';
import { TurnTimer } from '../domain/TurnTimer';
import { Room } from '../domain/Room';
import { hasActiveHuman, seatsFromSnapshot } from '../domain/Seat';
import { modelManager } from '../ai/ModelManager';

/** Bot tick pacing when no active humans remain (Fast Forward mode). */
export const FAST_FORWARD_TICK_DELAY_MS = 100;

/** Search effort per strength tier: rollouts per candidate move. */
export const BOT_STRENGTH_ROLLOUTS = { low: 10, medium: 20, high: 30 } as const;
export type BotStrength = keyof typeof BOT_STRENGTH_ROLLOUTS;

const ALL_STRENGTHS: BotStrength[] = ['low', 'medium', 'high'];

function randomStrength(): BotStrength {
  return ALL_STRENGTHS[(Math.random() * ALL_STRENGTHS.length) | 0];
}

/**
 * Application Service: Orchestrates client bot heartbeats, queue debounce, and timeouts.
 */
export class GameHeartbeat {
  private gameId: string;
  private timer: number | null = null;
  private isTicking = false;
  private pendingTickTimer: number | null = null;
  private pendingTickAt = 0;
  private hasPendingNextTick = false;
  private getGameState: () => GameRecord | null;
  private getLocalSeat: () => number;
  private getDomainGame?: () => any;
  private getPlayedCardCodes?: () => number[];
  /** Per-seat strength tier, rolled once per game so each bot plays consistently. */
  private botStrengths: BotStrength[];

  constructor(
    gameId: string,
    getGameState: () => GameRecord | null,
    getLocalSeat: () => number,
    getDomainGame?: () => any,
    getPlayedCardCodes?: () => number[]
  ) {
    this.gameId = gameId;
    this.getGameState = getGameState;
    this.getLocalSeat = getLocalSeat;
    this.getDomainGame = getDomainGame;
    this.getPlayedCardCodes = getPlayedCardCodes;
    this.botStrengths = Array.from({ length: 4 }, randomStrength);
    console.log(
      `[AI Host 🧠] Bot strengths this game: ${this.botStrengths.map((s, i) => `S${i}=${s}`).join(', ')}`
    );
  }

  public start(): void {
    if (this.timer) return;
    // Background safety poll every 3s. Turn changes trigger immediate ticks
    // via triggerImmediate (SSE-driven); this is only the fallback net, so a
    // relaxed cadence avoids needless no-op tick requests.
    this.timer = window.setInterval(() => this.tick(), 3000);
    this.triggerImmediate(300);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.pendingTickTimer) {
      clearTimeout(this.pendingTickTimer);
      this.pendingTickTimer = null;
    }
    this.pendingTickAt = 0;
  }

  public triggerImmediate(delayMs = 900): void {
    if (this.isTicking) {
      this.hasPendingNextTick = true;
      return;
    }
    const deadline = Date.now() + delayMs;
    if (this.pendingTickTimer) {
      // Monotonic deadlines: a new trigger may only tighten a scheduled
      // tick, never push it out. Without this, the SSE turn-change poke
      // (900ms) would cancel and replace the pending fast-forward tick,
      // throttling bot-only endgames back to ~1 move/s.
      if (this.pendingTickAt <= deadline) return;
      clearTimeout(this.pendingTickTimer);
    }
    this.pendingTickAt = deadline;
    this.pendingTickTimer = window.setTimeout(() => {
      this.pendingTickTimer = null;
      this.pendingTickAt = 0;
      this.tick();
    }, delayMs);
  }

  /**
   * Turn-change poke (SSE game update / post-start): fast-forward tables
   * resolve bot turns at the fast cadence instead of the 900ms default.
   */
  public triggerBotTurn(): void {
    this.triggerImmediate(this.isFastForward() ? FAST_FORWARD_TICK_DELAY_MS : 900);
  }

  private isFastForward(): boolean {
    const game = this.getGameState();
    if (!game || game.status !== 'playing') return false;
    return !hasActiveHuman(seatsFromSnapshot(game.seats, game.counts || [13, 13, 13, 13]));
  }

  private async tick(): Promise<void> {
    if (this.isTicking) {
      this.hasPendingNextTick = true;
      return;
    }
    const game = this.getGameState();
    if (!game || game.status !== 'playing') return;

    const localSeat = this.getLocalSeat();
    if (localSeat < 0 || localSeat > 3) return;

    const seats = seatsFromSnapshot(game.seats, game.counts || [13, 13, 13, 13]);
    const room = new Room({
      id: game.id,
      code: game.room_code || '',
      seats,
    });

    const lowestHumanSeat = room.hostSeatIndex;
    const currentTurn = game.turn_index;
    const currentSeat = seats[currentTurn];
    const isBotTurn = currentSeat ? currentSeat.isBot : false;

    // Check if remaining active players are all bots (Fast Forward)
    const isBotOnlyRemaining = !hasActiveHuman(seats);

    // Check if human turn has timed out using TurnTimer
    const timer = new TurnTimer(game.turn_started_at);
    const isTimeout = !isBotTurn && timer.isExpired();

    if (isBotTurn || isTimeout) {
      // Primary ticker is the lowest active human; secondary humans act as fallback
      const isPrimary = lowestHumanSeat === localSeat || lowestHumanSeat === -1;
      const turnElapsed = timer.getElapsedMs();
      const fallbackThreshold = isBotOnlyRemaining ? 250 : 1200;

      if (!isPrimary && turnElapsed < fallbackThreshold) {
        return;
      }

      this.isTicking = true;
      this.hasPendingNextTick = false;
      let tickSuccess = false;

      try {
        if (isBotTurn && isPrimary && modelManager.isReady()) {
          try {
            const botHandCards = await fetchPlayerHand(this.gameId, currentTurn);
            if (botHandCards && botHandCards.length > 0) {
              const domainGame = this.getDomainGame ? this.getDomainGame() : null;

              console.log(`[AI Host 🧠] Turn triggered for Bot Seat ${currentTurn} (${currentSeat.name}). Cards: ${botHandCards.length}`);

              const decision = await modelManager.generateDecision({
                handCards: botHandCards,
                trick: domainGame?.trick,
                opponentCounts: game.counts || [13, 13, 13, 13],
                isOpeningMove: domainGame?.isOpeningMove ?? false,
                seatIndex: currentTurn,
                playedCardCodes: this.getPlayedCardCodes ? this.getPlayedCardCodes() : [],
              }, {
                rolloutsPerMove: BOT_STRENGTH_ROLLOUTS[this.botStrengths[currentTurn] ?? 'medium'],
              });

              const playedCards = decision.action === 'play' ? decision.cards : [];
              console.log(`[AI Host 🧠] Dispatching move to server: ${decision.action} [${playedCards.join(', ')}] (source: ${decision.source}, strength: ${this.botStrengths[currentTurn] ?? 'medium'})`);
              await playMove(this.gameId, currentTurn, decision.action, playedCards);
              tickSuccess = true;
            }
          } catch (aiErr) {
            console.debug('AI host move failed, falling back to server tick:', aiErr);
          }
        }

        if (!tickSuccess) {
          await sendTick(this.gameId, currentTurn);
          tickSuccess = true;
        }
      } catch (err: any) {
        if (err?.status !== 400) {
          console.debug('Heartbeat tick notice:', err?.message || err);
        }
      } finally {
        this.isTicking = false;
        if (tickSuccess) {
          if (isPrimary) {
            const delay = isBotOnlyRemaining ? FAST_FORWARD_TICK_DELAY_MS : 900;
            this.triggerImmediate(delay);
          } else if (this.hasPendingNextTick) {
            this.hasPendingNextTick = false;
            this.triggerImmediate(500);
          }
        } else if (this.hasPendingNextTick) {
          this.hasPendingNextTick = false;
          this.triggerImmediate(800);
        }
      }
    }
  }
}
