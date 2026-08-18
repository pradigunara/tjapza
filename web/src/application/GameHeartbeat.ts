import { pb } from '../net/pb';
import { TurnTimer } from '../domain/TurnTimer';
import { Room } from '../domain/Room';
import { Seat } from '../domain/Seat';
import type { GameRecord } from '../net/pb';

export async function sendTick(gameId: string, seatIndex: number): Promise<void> {
  await pb.collection('moves').create({
    game_id: gameId,
    seat_index: seatIndex >= 0 && seatIndex <= 3 ? seatIndex : 0,
    action: 'tick',
    cards: [],
  });
}

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
    // Continuous background safety poll every 600ms
    this.timer = window.setInterval(() => this.tick(), 600);
    this.triggerImmediate(100);
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

  public triggerImmediate(delayMs = 200): void {
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

    const counts = game.counts || [13, 13, 13, 13];
    const seats: Seat[] = (game.seats || []).map((s, idx) =>
      s
        ? new Seat({
            index: idx,
            userId: s.user_id,
            name: s.name,
            isBot: s.is_bot,
            connected: s.connected,
            cardCount: counts[idx] ?? 0,
          })
        : Seat.createEmpty(idx)
    );

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
    const hasActiveHuman = seats.some((s) => s.isHuman && s.cardCount > 0);
    const isBotOnlyRemaining = !hasActiveHuman;

    // Check if human turn has timed out using TurnTimer
    const timer = new TurnTimer(game.turn_started_at);
    const isTimeout = !isBotTurn && timer.isExpired();

    if (isBotTurn || isTimeout) {
      // Primary ticker is the lowest active human; secondary humans act as fallback
      const isPrimary = lowestHumanSeat === localSeat || lowestHumanSeat === -1;
      const turnElapsed = timer.getElapsedMs();
      const fallbackThreshold = isBotOnlyRemaining ? 200 : 900;

      if (!isPrimary && turnElapsed < fallbackThreshold) {
        return;
      }

      this.isTicking = true;
      this.hasPendingNextTick = false;

      try {
        await sendTick(this.gameId, currentTurn);
      } catch (err: any) {
        if (err?.status !== 400) {
          console.debug('Heartbeat tick notice:', err?.message || err);
        }
      } finally {
        this.isTicking = false;
        if (isPrimary) {
          const delay = isBotOnlyRemaining ? 200 : 350;
          this.triggerImmediate(delay);
        } else if (this.hasPendingNextTick) {
          this.hasPendingNextTick = false;
          this.triggerImmediate(300);
        }
      }
    }
  }
}
