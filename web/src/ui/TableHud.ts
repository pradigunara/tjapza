import {
  CardCombo,
  Room,
  seatsFromSnapshot,
  hasActiveHuman,
  TurnTimer,
  PUBLIC_LOBBY_AUTOSTART_MS,
  TURN_TIMEOUT_SECS,
} from '../domain';
import type { SeatInfo } from '../net/pb';
import { escapeHtml } from './escape';

export interface TableHudGame {
  status: 'waiting' | 'playing' | 'finished';
  room_code: string;
  is_public: boolean;
  seats: (SeatInfo | null)[];
  counts?: number[];
  created?: string;
  turn_started_at?: string;
}

export interface TableHudState {
  game: TableHudGame;
  localSeatIndex: number;
  isMyTurn: boolean;
  selectedCards: number[];
  canPlay: boolean;
  canPass: boolean;
  isProcessingMove: boolean;
  soundMuted: boolean;
}

export interface TableHudCallbacks {
  onHistory: () => void;
  onCopyRoomCode: () => void;
  onToggleSound: () => void;
  onLeave: () => void;
  onShareRoom: () => void;
  onStartGame: () => void;
  onPlay: () => void;
  onPass: () => void;
  onHint: () => void;
  onDeselect: () => void;
  onSort: () => void;
}

export function hostSeatIndexFromSeats(seats: TableHudGame['seats']): number {
  return new Room({ code: '', seats: seatsFromSnapshot(seats) }).hostSeatIndex;
}

export function comboPill(selectedCards: number[]): { visible: boolean; text: string } {
  if (selectedCards.length === 0) {
    return { visible: false, text: '' };
  }
  const classified = CardCombo.evaluate(selectedCards);
  if (classified) {
    return {
      visible: true,
      text: `✨ ${classified.description} (${selectedCards.length} cards)`,
    };
  }
  return { visible: true, text: `${selectedCards.length} cards selected` };
}

export function lobbyCountdownSecs(created: string, nowMs: number = Date.now()): number {
  const createdTime = new Date(created).getTime();
  const elapsed = Math.max(0, nowMs - createdTime);
  const remainingMs = Math.max(0, PUBLIC_LOBBY_AUTOSTART_MS - elapsed);
  return Math.ceil(remainingMs / 1000);
}

export function tableHudHtml(state: TableHudState): string {
  const { game, localSeatIndex, isMyTurn, soundMuted } = state;
  const isWaiting = game.status === 'waiting';
  const seats = game.seats || [];

  return `
      <!-- Top Clean Navigation Bar -->
      <div class="table-top-bar">
        <div class="top-bar-left">
          <div class="room-code-badge" id="btn-copy-code" title="Click to copy Room Code">
            <span class="badge-label">ROOM</span>
            <span class="badge-code">${game.room_code || '---'}</span>
            <span class="badge-copy-icon">📋</span>
          </div>
        </div>

        <div class="top-bar-right">
          ${
            game.status === 'playing'
              ? playingTimerHtml(game)
              : ''
          }

          <button id="btn-table-history" class="btn-icon" title="View Move History">
            <span>📜</span>
          </button>

          <button id="btn-table-sound" class="btn-icon" title="Toggle Sound">
            <span>${soundMuted ? '🔇' : '🔊'}</span>
          </button>

          <button id="btn-leave-table" class="btn-icon btn-leave" title="Leave Table">
            <span class="leave-text-desktop">Leave</span>
            <span class="leave-icon-mobile">✕</span>
          </button>
        </div>
      </div>

      <!-- Center Lobby Waiting Overlay -->
      ${isWaiting ? waitingOverlayHtml(game, localSeatIndex, seats) : ''}

      <!-- Bottom Selected Combo Indicator & Action Controls Bar -->
      ${
        !isWaiting
          ? `
        <div class="table-bottom-group">
          <div id="selected-combo-pill" class="selected-combo-pill" style="display: none;"></div>

          <div class="table-action-bar ${isMyTurn ? 'is-my-turn' : ''}">
            <div class="action-utility-group">
              <button id="btn-action-sort" class="btn-hud-action btn-sort" title="Sort Hand (S)">
                <span>Sort</span>
              </button>
              <button id="btn-action-deselect" class="btn-hud-action" title="Clear Selection (D)">
                <span>Clear</span>
              </button>
            </div>

            <div class="action-main-group">
              <button id="btn-action-hint" class="btn-hud-action btn-hint" title="Hint Play (H)">
                <span>Hint</span>
              </button>
              <button id="btn-action-pass" class="btn-hud-action btn-pass" title="Pass Turn (P)">
                <span>Pass</span>
              </button>
              <button id="btn-action-play" class="btn-hud-action btn-play" title="Play Selected Cards (Space)">
                <span>Play</span>
              </button>
            </div>
          </div>
        </div>
      `
          : ''
      }
    `;
}

function playingTimerHtml(game: TableHudGame): string {
  const domainSeats = seatsFromSnapshot(game.seats, game.counts);
  if (!hasActiveHuman(domainSeats)) {
    return `
                      <div class="turn-timer-hud" style="background: rgba(234, 179, 8, 0.2); border-color: rgba(234, 179, 8, 0.5);" title="Fast Forwarding Bot Turns">
                        <span class="timer-icon">⏩</span>
                        <span class="timer-text" style="color: #fde047;">Fast Forward</span>
                      </div>
                    `;
  }
  return `
                    <div class="turn-timer-hud" title="Turn Timer">
                      <span class="timer-icon">⏱️</span>
                      <span class="timer-text" id="turn-timer-text">${TURN_TIMEOUT_SECS}s</span>
                      <div class="timer-progress-track">
                        <div class="timer-progress-bar" id="turn-timer-bar"></div>
                      </div>
                    </div>
                  `;
}

function waitingOverlayHtml(
  game: TableHudGame,
  localSeatIndex: number,
  seats: (SeatInfo | null)[]
): string {
  const hostSeatIndex = hostSeatIndexFromSeats(seats);
  const isHost = localSeatIndex === hostSeatIndex;
  const hostName =
    hostSeatIndex !== -1 && seats[hostSeatIndex] ? seats[hostSeatIndex]?.name : 'Host';

  return `
        <div class="table-waiting-overlay">
          <div class="waiting-card">
            <h2 class="waiting-title">Game Lobby</h2>
            <p class="waiting-subtitle">Room Code: <strong class="text-gold">${escapeHtml(game.room_code)}</strong></p>

            <div class="waiting-seats-grid">
              ${[0, 1, 2, 3]
                .map((idx) => {
                  const s = seats[idx];
                  const occupied = s && s.user_id;
                  const isSeatHost = idx === hostSeatIndex;
                  return `
                  <div class="waiting-seat-box ${occupied ? 'occupied' : 'empty'} ${idx === localSeatIndex ? 'is-self' : ''}">
                    <div class="waiting-seat-num">
                      Seat ${idx + 1}
                      ${isSeatHost ? '<span class="host-badge" title="Room Host">👑 Host</span>' : ''}
                    </div>
                    <div class="waiting-seat-avatar">${occupied ? escapeHtml(s.name.charAt(0).toUpperCase()) : '👤'}</div>
                    <div class="waiting-seat-name">${occupied ? escapeHtml(s.name) : 'Waiting…'}</div>
                  </div>
                `;
                })
                .join('')}
            </div>

            <div class="waiting-actions">
              <button id="btn-share-room" class="btn-secondary">Share Room Link</button>
              ${
                isHost
                  ? `<button id="btn-start-game" class="btn-primary btn-gold btn-lg">Start Game (Fill Bots)</button>`
                  : game.is_public
                    ? `
                      <div class="waiting-host-notice">
                        <span>⏳ Waiting for players or host to start…</span>
                        <div id="quickplay-countdown-wrap" style="margin-top: 6px; font-size: 13px; color: #facc15;">
                          Auto-start in <strong id="quickplay-timer-sec">30s</strong>
                        </div>
                        <button id="btn-force-start-game" class="btn-primary btn-gold btn-sm" style="display: none; margin-top: 8px;">
                          ⚡ Start with Bots Now
                        </button>
                      </div>
                    `
                    : `<div class="waiting-host-notice">⏳ Waiting for host (<strong>${escapeHtml(hostName)}</strong>) to start…</div>`
              }
            </div>
          </div>
        </div>
      `;
}

export class TableHud {
  readonly element: HTMLElement;
  private callbacks: TableHudCallbacks;
  private state: TableHudState | null = null;

  constructor(callbacks: TableHudCallbacks, root?: HTMLElement) {
    this.callbacks = callbacks;
    this.element = root ?? document.createElement('div');
    this.element.className = 'tjapza-table-hud';
  }

  render(state: TableHudState): void {
    this.state = state;
    this.element.innerHTML = tableHudHtml(state);
    this.attachEvents();
    this.updateTimer(state);
    this.updateActionState(state);
  }

  updateActionState(state: TableHudState): void {
    this.state = state;
    const btnPlay = this.element.querySelector('#btn-action-play') as HTMLButtonElement | null;
    const btnPass = this.element.querySelector('#btn-action-pass') as HTMLButtonElement | null;
    const btnHint = this.element.querySelector('#btn-action-hint') as HTMLButtonElement | null;
    const pillEl = this.element.querySelector('#selected-combo-pill') as HTMLElement | null;

    const pill = comboPill(state.selectedCards);
    if (pillEl) {
      if (pill.visible) {
        pillEl.textContent = pill.text;
        pillEl.style.display = 'inline-block';
      } else {
        pillEl.style.display = 'none';
      }
    }

    if (!btnPlay || !btnPass) return;

    const canPlay = state.canPlay && !state.isProcessingMove;
    btnPlay.disabled = !canPlay;
    if (canPlay) {
      btnPlay.classList.add('ready');
    } else {
      btnPlay.classList.remove('ready');
    }

    btnPass.disabled = !state.canPass || state.isProcessingMove;
    if (btnHint) {
      btnHint.disabled = !state.isMyTurn || state.isProcessingMove;
    }
  }

  updateTimer(state: TableHudState = this.state!, nowMs: number = Date.now()): void {
    if (!state) return;
    this.state = state;
    const game = state.game;

    if (game.status === 'waiting' && game.is_public && game.created) {
      const secondsLeft = lobbyCountdownSecs(game.created, nowMs);
      const qpSec = this.element.querySelector('#quickplay-timer-sec');
      const qpWrap = this.element.querySelector('#quickplay-countdown-wrap') as HTMLElement | null;
      const btnForce = this.element.querySelector('#btn-force-start-game') as HTMLElement | null;

      if (qpSec) qpSec.textContent = `${secondsLeft}s`;
      if (secondsLeft === 0) {
        if (qpWrap) qpWrap.style.display = 'none';
        if (btnForce) btnForce.style.display = 'inline-block';
      }
      return;
    }

    if (game.status !== 'playing' || !game.turn_started_at) return;

    const timer = new TurnTimer(game.turn_started_at);
    const secondsLeft = timer.getRemainingSecs(nowMs);
    const pct = Math.min(100, Math.max(0, (1.0 - timer.getProgress(nowMs)) * 100));
    const statusColor = timer.getStatusColor(nowMs);

    const textEl = this.element.querySelector('#turn-timer-text');
    const barEl = this.element.querySelector('#turn-timer-bar') as HTMLElement | null;
    if (textEl) textEl.textContent = `${secondsLeft}s`;
    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.style.backgroundColor = statusColor;
    }
  }

  remove(): void {
    this.element.remove();
  }

  private attachEvents(): void {
    const $ = (id: string) => this.element.querySelector(id);
    const c = this.callbacks;

    $('#btn-table-history')?.addEventListener('click', () => c.onHistory());
    $('#btn-copy-code')?.addEventListener('click', () => c.onCopyRoomCode());
    $('#btn-table-sound')?.addEventListener('click', () => c.onToggleSound());
    $('#btn-leave-table')?.addEventListener('click', () => c.onLeave());
    $('#btn-share-room')?.addEventListener('click', () => c.onShareRoom());
    $('#btn-start-game')?.addEventListener('click', () => c.onStartGame());
    $('#btn-force-start-game')?.addEventListener('click', () => c.onStartGame());
    $('#btn-action-play')?.addEventListener('click', () => c.onPlay());
    $('#btn-action-pass')?.addEventListener('click', () => c.onPass());
    $('#btn-action-hint')?.addEventListener('click', () => c.onHint());
    $('#btn-action-deselect')?.addEventListener('click', () => c.onDeselect());
    $('#btn-action-sort')?.addEventListener('click', () => c.onSort());
  }
}
