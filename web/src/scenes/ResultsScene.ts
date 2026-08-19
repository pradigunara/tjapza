import type { GameRecord } from '../net/pb';
import { rematch, joinRoom, pb } from '../net/pb';
import { Podium, Seat } from '../domain';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import { escapeHtml } from '../ui/escape';

export interface ResultsCallbacks {
  onRematchStarted: (newGame: GameRecord, localSeatIndex: number) => void;
  onReturnToLobby: () => void;
}

export class ResultsScene {
  private container: HTMLElement;
  private game: GameRecord;
  private localSeatIndex: number;
  private callbacks: ResultsCallbacks;

  private countdownTimer: number | null = null;
  private secondsLeft = 30;
  private isRematching = false;
  private hasNavigatedToRematch = false;
  private unsubscribeGame?: () => void;

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

    // Determine local player's rank using Podium
    const seats = (this.game.seats || []).map((s, idx) =>
      s
        ? new Seat({
            index: idx,
            userId: s.user_id,
            name: s.name,
            isBot: s.is_bot,
            connected: s.connected,
            cardCount: this.game.counts?.[idx] ?? 0,
          })
        : Seat.createEmpty(idx)
    );

    const podium = new Podium(this.game.winner_ranks || [], this.game.counts || [], seats);
    const localRank = podium.getRank(this.localSeatIndex);

    if (localRank === 1) {
      sound.playWin();
    } else {
      sound.playLoss();
    }

    this.render();
    this.startCountdown();

    // Subscribe to game updates to catch rematch_game_id when any room player starts rematch
    try {
      this.unsubscribeGame = await pb.collection('games').subscribe(this.game.id, async (e) => {
        if (e.action === 'update' && e.record) {
          const rematchId = (e.record as any).rematch_game_id;
          if (rematchId && !this.hasNavigatedToRematch) {
            this.hasNavigatedToRematch = true;
            toast.info('Rematch started! Entering table…');
            try {
              const res = await joinRoom(rematchId);
              this.callbacks.onRematchStarted(res.game, res.seat_index !== undefined ? res.seat_index : this.localSeatIndex);
            } catch (err: any) {
              console.error('Failed to auto-join rematch:', err);
            }
          }
        }
      });
    } catch (subErr) {
      console.debug('Rematch SSE subscription notice:', subErr);
    }
  }

  public unmount(): void {
    if (this.unsubscribeGame) {
      this.unsubscribeGame();
      this.unsubscribeGame = undefined;
    }
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
    const seats = (this.game.seats || []).map((s, idx) =>
      s
        ? new Seat({
            index: idx,
            userId: s.user_id,
            name: s.name,
            isBot: s.is_bot,
            connected: s.connected,
            cardCount: this.game.counts?.[idx] ?? 0,
          })
        : Seat.createEmpty(idx)
    );

    const podium = new Podium(this.game.winner_ranks || [], this.game.counts || [], seats);
    const standings = podium.getStandings();
    const localRank = podium.getRank(this.localSeatIndex);
    const isWinner = localRank === 1;

    this.container.innerHTML = `
      <div class="results-backdrop"></div>
      <div class="results-card">
        <div class="results-header">
          <div class="results-trophy-wrap">
            ${
              isWinner
                ? `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45.98-.98 1.05A6.02 6.02 0 0 1 3.5 12V4h17v8a6.02 6.02 0 0 1-5.52 6.05c-.53-.07-.98-.5-.98-1.05v-2.34"/><path d="M12 2v6"/><path d="M12 17v5"/></svg>`
                : `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>`
            }
          </div>
          <h2 class="results-title">${isWinner ? 'Victory!' : 'Game Over'}</h2>
          <p class="results-sub">
            ${isWinner ? 'You emptied your hand first and took 1st Place!' : `You finished in ${localRank}${this.getOrdinal(localRank)} Place.`}
          </p>
        </div>

        <!-- Podium & Scoreboard -->
        <div class="results-scoreboard">
          ${standings
            .map((p) => {
              const isLocal = p.seatIndex === this.localSeatIndex;
              return `
                <div class="score-row ${isLocal ? 'score-row-local' : ''} rank-${p.rank}">
                  <div class="score-rank-badge">${p.rank === 1 ? '★ 1' : `${p.rank}`}</div>
                  <div class="score-avatar ${p.isBot ? 'is-bot' : ''}">${p.isBot ? 'AI' : escapeHtml(p.name.charAt(0).toUpperCase())}</div>
                  <div class="score-name-col">
                    <span class="score-name">${escapeHtml(p.name)} ${isLocal ? '(You)' : ''}</span>
                    <span class="score-role">${p.isBot ? 'Bot' : 'Player'}</span>
                  </div>
                  <div class="score-place-label">${p.title}</div>
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
