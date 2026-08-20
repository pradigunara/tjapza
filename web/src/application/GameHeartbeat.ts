import { sendTick, type GameRecord } from '../net/pb';
import { TurnTimer } from '../domain/TurnTimer';
import { Room } from '../domain/Room';
import { hasActiveHuman, seatsFromSnapshot } from '../domain/Seat';

/**
 * Application Service: Orchestrates client bot heartbeats, queue debounce, and timeouts.
 */
export class GameHeartbeat {
  private gameId: string;
  private timer: number | null = null;
  private isTicking = false;
  private pendingTickTimer: number | null = null;
  private hasPendingNextTick = false;
  private getGameState: () => GameRecord | null;
  private getLocalSeat: () => number;

  constructor(
    gameId: string,
    getGameState: () => GameRecord | null,
    getLocalSeat: () => number
  ) {
    this.gameId = gameId;
    this.getGameState = getGameState;
    this.getLocalSeat = getLocalSeat;
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
  }

  public triggerImmediate(delayMs = 900): void {
    if (this.isTicking) {
      this.hasPendingNextTick = true;
      return;
    }
    if (this.pendingTickTimer) {
      clearTimeout(this.pendingTickTimer);
    }
    this.pendingTickTimer = window.setTimeout(() => {
      this.pendingTickTimer = null;
      this.tick();
    }, delayMs);
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
        await sendTick(this.gameId, currentTurn);
        tickSuccess = true;
      } catch (err: any) {
        if (err?.status !== 400) {
          console.debug('Heartbeat tick notice:', err?.message || err);
        }
      } finally {
        this.isTicking = false;
        if (tickSuccess) {
          if (isPrimary) {
            const delay = isBotOnlyRemaining ? 250 : 900;
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
