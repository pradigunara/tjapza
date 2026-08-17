import type { GameRecord, ResultRecord } from '../net/pb';
import { rematch, fetchResults } from '../net/pb';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';

export interface ResultsCallbacks {
  onRematchStarted: (newGame: GameRecord, localSeatIndex: number) => void;
  onReturnToLobby: () => void;
}

export class ResultsScene {
  private container: HTMLElement;
  private game: GameRecord;
  private localSeatIndex: number;
  private callbacks: ResultsCallbacks;

  private results: ResultRecord[] = [];
  private countdownTimer: number | null = null;
  private secondsLeft = 30;
  private isRematching = false;

  constructor(
    game: GameRecord,
    localSeatIndex: number,
    callbacks: ResultsCallbacks
  ) {
    this.game = game;
    this.localSeatIndex = localSeatIndex;
    this.callbacks = callbacks;

    this.container = document.createElement('div');
    this.container.id = 'tjapza-results';
    this.container.className = 'tjapza-results-overlay';
  }

  public async mount(parent: HTMLElement): Promise<void> {
    parent.appendChild(this.container);

    // Fetch full results
    this.results = await fetchResults(this.game.id);

    // Determine local player's rank
    const localResult = this.results.find((r) => r.seat_index === this.localSeatIndex);
    const localRank = localResult ? localResult.rank : 4;

    if (localRank === 1) {
      sound.playWin();
    } else {
      sound.playLoss();
    }

    this.render();
    this.startCountdown();
  }

  public unmount(): void {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.container.remove();
  }

  private startCountdown(): void {
    this.secondsLeft = 30;
    this.countdownTimer = window.setInterval(() => {
      this.secondsLeft--;
      const el = this.container.querySelector('#rematch-timer-text');
      if (el) {
        el.textContent = `(${this.secondsLeft}s)`;
      }
      if (this.secondsLeft <= 0) {
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.callbacks.onReturnToLobby();
      }
    }, 1000);
  }

  private render(): void {
    const seats = this.game.seats || [];

    // Order players by rank (1..4)
    const rankedPlayers: Array<{
      rank: number;
      name: string;
      isBot: boolean;
      isLocal: boolean;
      seatIndex: number;
    }> = [];

    for (let r = 1; r <= 4; r++) {
      const res = this.results.find((item) => item.rank === r);
      if (res) {
        const seat = seats[res.seat_index];
        rankedPlayers.push({
          rank: r,
          name: seat?.name || `Player ${res.seat_index + 1}`,
          isBot: !!res.is_bot,
          isLocal: res.seat_index === this.localSeatIndex,
          seatIndex: res.seat_index,
        });
      } else {
        // Fallback to game.winner_ranks if results not fully recorded yet
        const winnerSeat = this.game.winner_ranks ? this.game.winner_ranks[r - 1] : undefined;
        if (winnerSeat !== undefined) {
          const seat = seats[winnerSeat];
          rankedPlayers.push({
            rank: r,
            name: seat?.name || `Player ${winnerSeat + 1}`,
            isBot: !!seat?.is_bot,
            isLocal: winnerSeat === this.localSeatIndex,
            seatIndex: winnerSeat,
          });
        }
      }
    }

    const localResult = rankedPlayers.find((p) => p.isLocal);
    const localRank = localResult ? localResult.rank : 4;
    const isWinner = localRank === 1;

    this.container.innerHTML = `
      <div class="results-backdrop"></div>
      <div class="results-card">
        <div class="results-header">
          <div class="results-trophy">${isWinner ? '🏆' : '🎮'}</div>
          <h2 class="results-title">${isWinner ? 'Victory!' : 'Game Over'}</h2>
          <p class="results-sub">
            ${isWinner ? 'You emptied your hand first and took 1st Place!' : `You finished in ${localRank}${this.getOrdinal(localRank)} Place.`}
          </p>
        </div>

        <!-- Podium & Scoreboard -->
        <div class="results-scoreboard">
          ${rankedPlayers
            .map((p) => {
              const medal =
                p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '4th';
              return `
                <div class="score-row ${p.isLocal ? 'score-row-local' : ''} rank-${p.rank}">
                  <div class="score-rank-badge">${medal}</div>
                  <div class="score-avatar">${p.isBot ? '🤖' : p.name.charAt(0).toUpperCase()}</div>
                  <div class="score-name-col">
                    <span class="score-name">${p.name} ${p.isLocal ? '(You)' : ''}</span>
                    <span class="score-role">${p.isBot ? 'Bot' : 'Player'}</span>
                  </div>
                  <div class="score-place-label">${p.rank}${this.getOrdinal(p.rank)} Place</div>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Action Buttons -->
        <div class="results-actions">
          <button id="btn-return-lobby" class="btn-secondary btn-lg">
            Back to Lobby
          </button>
          <button id="btn-rematch" class="btn-primary btn-gold btn-lg ${this.isRematching ? 'loading' : ''}">
            <span>Rematch</span>
            <span id="rematch-timer-text">(${this.secondsLeft}s)</span>
          </button>
        </div>
      </div>
    `;

    this.attachEvents();
  }

  private getOrdinal(n: number): string {
    if (n === 1) return 'st';
    if (n === 2) return 'nd';
    if (n === 3) return 'rd';
    return 'th';
  }

  private attachEvents(): void {
    const btnLobby = this.container.querySelector('#btn-return-lobby');
    btnLobby?.addEventListener('click', () => {
      sound.playClick();
      this.callbacks.onReturnToLobby();
    });

    const btnRematch = this.container.querySelector('#btn-rematch');
    btnRematch?.addEventListener('click', async () => {
      if (this.isRematching) return;
      sound.playClick();
      this.isRematching = true;
      this.render();

      try {
        toast.info('Starting rematch…');
        const res = await rematch(this.game.id);
        this.callbacks.onRematchStarted(res.game, this.localSeatIndex);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to trigger rematch');
        this.isRematching = false;
        this.render();
      }
    });
  }
}
