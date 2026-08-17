import { Application, Container, Graphics } from 'pixi.js';
import {
  type GameRecord,
  type MoveRecord,
  fetchPlayerHand,
  subscribeToGame,
  playCards,
  passTurn,
  startGame,
  GameHeartbeat,
} from '../net/pb';
import { HandFan } from '../render/HandFan';
import { SeatView } from '../render/SeatView';
import { PileView } from '../render/PileView';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import {
  isValidPlay,
  getBotMove,
  sortCards,
  classifyCombo,
} from '../rules/cards';

export interface TableCallbacks {
  onGameFinished: (game: GameRecord, localSeatIndex: number) => void;
  onLeaveTable: () => void;
}

export class TableScene {
  private app: Application;
  private game: GameRecord;
  private localSeatIndex: number;
  private callbacks: TableCallbacks;

  // Pixi Containers
  private rootContainer: Container;
  private tableBg: Graphics;
  private seatViews: SeatView[] = [];
  private pileView: PileView;
  private handFan: HandFan;

  // DOM HUD Overlay
  private hudContainer: HTMLElement;

  // Realtime & Loop
  private unsubscribeSSE?: () => void;
  private heartbeat?: GameHeartbeat;
  private tickerCallback?: (ticker: any) => void;
  private timerInterval?: number;

  // State
  private handCards: number[] = [];
  private selectedCards: number[] = [];
  private isOpeningMove = false;
  private isProcessingMove = false;
  private lastTurnIndex = -1;

  constructor(
    app: Application,
    game: GameRecord,
    localSeatIndex: number,
    callbacks: TableCallbacks
  ) {
    this.app = app;
    this.game = game;
    this.localSeatIndex = localSeatIndex;
    this.callbacks = callbacks;

    // 1. Pixi Scene Hierarchy
    this.rootContainer = new Container();
    this.tableBg = new Graphics();
    this.rootContainer.addChild(this.tableBg);

    // 4 Seat views
    for (let i = 0; i < 4; i++) {
      const sv = new SeatView(i, i === this.localSeatIndex);
      this.seatViews.push(sv);
      this.rootContainer.addChild(sv);
    }

    // Pile in center
    this.pileView = new PileView();
    this.rootContainer.addChild(this.pileView);

    // Hand fan at bottom
    this.handFan = new HandFan();
    this.rootContainer.addChild(this.handFan);

    // 2. DOM HUD Overlay
    this.hudContainer = document.createElement('div');
    this.hudContainer.id = 'tjapza-table-hud';
    this.hudContainer.className = 'tjapza-table-hud';
  }

  public async mount(parent: HTMLElement): Promise<void> {
    this.app.stage.addChild(this.rootContainer);
    parent.appendChild(this.hudContainer);

    this.setupHandFanEvents();
    this.renderHud();
    this.resize(window.innerWidth, window.innerHeight);

    // Fetch local hand
    this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
    this.handFan.setCards(this.handCards);

    // Initial audio deal swoosh if playing
    if (this.game.status === 'playing') {
      sound.playDeal();
    }

    // Start Pixi render ticker
    this.tickerCallback = (ticker) => {
      const delta = ticker.deltaTime || 1;
      this.update(delta);
    };
    this.app.ticker.add(this.tickerCallback);

    // Start 1s timer interval for turn countdown
    this.timerInterval = window.setInterval(() => this.updateTimerUI(), 500);

    // Setup Realtime SSE subscriptions
    this.unsubscribeSSE = subscribeToGame(this.game.id, this.localSeatIndex, {
      onGameUpdate: (updated) => this.handleGameUpdate(updated),
      onMoveCreated: (move) => this.handleMoveCreated(move),
      onHandUpdate: (cards) => this.handleHandUpdate(cards),
    });

    // Start client heartbeat ticker
    this.heartbeat = new GameHeartbeat(
      this.game.id,
      () => this.game,
      () => this.localSeatIndex
    );
    this.heartbeat.start();

    this.applyGameState();
  }

  public unmount(): void {
    this.unsubscribeSSE?.();
    this.heartbeat?.stop();

    if (this.tickerCallback) {
      this.app.ticker.remove(this.tickerCallback);
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.app.stage.removeChild(this.rootContainer);
    this.rootContainer.destroy({ children: true });
    this.hudContainer.remove();
  }

  private setupHandFanEvents(): void {
    this.handFan.onSelectionChanged = (selected) => {
      this.selectedCards = selected;
      this.updateHudActionState();
    };

    this.handFan.onPlayRequested = () => this.handlePlayAction();
    this.handFan.onPassRequested = () => this.handlePassAction();
    this.handFan.onHintRequested = () => this.handleHintAction();
  }

  public resize(width: number, height: number): void {
    // 1. Draw Table Background Felt & Border
    this.tableBg.clear();
    const cx = width / 2;
    const cy = height / 2;

    // Felt table surface
    this.tableBg.rect(0, 0, width, height);
    this.tableBg.fill({ color: 0x0a1e15 });

    // Inner felt glow oval / rounded rect
    const tableW = Math.min(width * 0.94, 1100);
    const tableH = Math.min(height * 0.88, 720);
    const tableRadius = Math.min(tableW, tableH) * 0.28;

    this.tableBg.roundRect(cx - tableW / 2, cy - tableH / 2, tableW, tableH, tableRadius);
    this.tableBg.fill({ color: 0x0f2d1e });
    this.tableBg.stroke({ width: 4, color: 0xd97706, alpha: 0.7 });

    // Subtle table pattern center
    this.tableBg.circle(cx, cy, Math.min(tableW, tableH) * 0.25);
    this.tableBg.stroke({ width: 1, color: 0x166534, alpha: 0.4 });

    // 2. Position Seats relative to local seat
    const isMobile = width < 600;
    const seatMarginX = isMobile ? 32 : 70;
    const seatMarginY = isMobile ? 45 : 60;

    for (let i = 0; i < 4; i++) {
      const sv = this.seatViews[i];
      // Relative offset from local seat
      const relPos = (i - this.localSeatIndex + 4) % 4;

      if (relPos === 0) {
        // Bottom (Local Player)
        sv.layoutForPosition('bottom');
        sv.position.set(cx, height - (isMobile ? 120 : 145));
      } else if (relPos === 1) {
        // Left
        sv.layoutForPosition('left');
        sv.position.set(seatMarginX, cy - 30);
      } else if (relPos === 2) {
        // Top
        sv.layoutForPosition('top');
        sv.position.set(cx, seatMarginY + 20);
      } else if (relPos === 3) {
        // Right
        sv.layoutForPosition('right');
        sv.position.set(width - seatMarginX, cy - 30);
      }
    }

    // 3. Position Pile & HandFan
    this.pileView.position.set(cx, cy - (isMobile ? 15 : 20));
    this.handFan.resize(width, height);
  }

  private async handleGameUpdate(game: GameRecord): Promise<void> {
    const wasWaiting = this.game.status === 'waiting';
    this.game = game;
    this.applyGameState();

    if (wasWaiting && game.status === 'playing') {
      this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
      this.handFan.setCards(this.handCards);
      this.renderHud();
      sound.playDeal();
    }

    if (game.status === 'finished') {
      this.callbacks.onGameFinished(game, this.localSeatIndex);
    }
  }

  private handleMoveCreated(move: MoveRecord): void {
    const seats = this.game.seats || [];
    const seatName = seats[move.seat_index]?.name || `Seat ${move.seat_index + 1}`;

    if (move.action === 'play') {
      const sv = this.seatViews[move.seat_index];
      const origin = sv ? { x: sv.x, y: sv.y } : undefined;

      this.pileView.setCombo(
        {
          type: move.combo_type,
          power: move.combo_power,
          cards: move.cards || [],
          seat_index: move.seat_index,
        },
        seatName,
        origin
      );
    } else if (move.action === 'pass') {
      sound.playPass();
      toast.info(`${seatName} passed`);
    }
  }

  private handleHandUpdate(cards: number[]): void {
    this.handCards = cards;
    this.handFan.setCards(cards);
    this.updateHudActionState();
  }

  private applyGameState(): void {
    const seats = this.game.seats || [];
    const counts = this.game.counts || [13, 13, 13, 13];
    const winnerRanks = this.game.winner_ranks || [];
    const currentTurn = this.game.turn_index;
    const lastCombo = this.game.last_combo;
    const passCount = this.game.pass_count || 0;

    // Check if opening move of the game
    this.isOpeningMove =
      lastCombo === null &&
      counts[0] === 13 &&
      counts[1] === 13 &&
      counts[2] === 13 &&
      counts[3] === 13;

    // Check if turn changed to local player for turn chime
    if (currentTurn === this.localSeatIndex && this.lastTurnIndex !== this.localSeatIndex) {
      sound.playTurnChime();
    }
    this.lastTurnIndex = currentTurn;

    // Update Seat Views
    for (let i = 0; i < 4; i++) {
      const sInfo = seats[i];
      const sv = this.seatViews[i];

      if (sInfo) {
        sv.setPlayerInfo(sInfo.name, sInfo.is_bot, sInfo.connected);
      } else {
        sv.setPlayerInfo(`Empty Seat ${i + 1}`, false, false);
      }

      sv.setCardCount(counts[i]);
      sv.setIsTurn(this.game.status === 'playing' && currentTurn === i);

      // Rank or Pass status
      const rankIdx = winnerRanks.indexOf(i);
      if (rankIdx !== -1) {
        sv.setRank(rankIdx + 1);
        sv.setHasPassed(false);
      } else {
        sv.setRank(null);
        // Has passed if in current trick and passCount > 0
        sv.setHasPassed(passCount > 0 && currentTurn !== i && counts[i] > 0);
      }
    }

    // Update Pile
    if (lastCombo && lastCombo.cards && lastCombo.cards.length > 0) {
      const pName = seats[lastCombo.seat_index]?.name || `Seat ${lastCombo.seat_index + 1}`;
      this.pileView.setCombo(lastCombo, pName);
    } else {
      this.pileView.clearPile();
    }

    this.renderHud();
    this.updateHudActionState();
  }

  private renderHud(): void {
    const isWaiting = this.game.status === 'waiting';
    const isMuted = sound.isMuted();
    const currentTurn = this.game.turn_index;
    const isMyTurn = this.game.status === 'playing' && currentTurn === this.localSeatIndex;
    const seats = this.game.seats || [];
    const turnPlayerName = seats[currentTurn]?.name || `Seat ${currentTurn + 1}`;

    let statusText = '';
    if (isWaiting) {
      const seatedCount = seats.filter((s) => s && s.user_id).length;
      statusText = `Waiting for players (${seatedCount}/4)…`;
    } else if (isMyTurn) {
      statusText = '✨ Your Turn to Play!';
    } else {
      statusText = `Waiting for ${turnPlayerName}…`;
    }

    this.hudContainer.innerHTML = `
      <!-- Top HUD Bar -->
      <div class="table-top-bar">
        <div class="top-bar-left">
          <div class="room-code-badge" id="btn-copy-code" title="Click to copy room code">
            <span class="badge-label">ROOM</span>
            <span class="badge-code">${this.game.room_code || '------'}</span>
            <span class="badge-copy-icon">📋</span>
          </div>
          <span class="table-status-pill ${isMyTurn ? 'my-turn' : ''}">${statusText}</span>
        </div>

        <div class="top-bar-right">
          <!-- Turn Timer (120s bar) -->
          ${
            !isWaiting
              ? `
            <div class="turn-timer-hud" id="turn-timer-hud">
              <span class="timer-icon">⏳</span>
              <span class="timer-text" id="turn-timer-text">120s</span>
              <div class="timer-progress-track">
                <div class="timer-progress-bar" id="turn-timer-bar"></div>
              </div>
            </div>
          `
              : ''
          }

          <button id="btn-table-sound" class="btn-icon" title="Toggle Sound">
            ${
              isMuted
                ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`
                : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`
            }
          </button>

          <button id="btn-leave-table" class="btn-icon-text btn-leave" title="Leave Table">
            <span>Leave</span>
          </button>
        </div>
      </div>

      <!-- Waiting Room Modal Overlay (if waiting) -->
      ${
        isWaiting
          ? `
        <div class="waiting-room-overlay">
          <div class="waiting-card">
            <h2 class="waiting-title">Game Lobby</h2>
            <p class="waiting-sub">Room Code: <strong class="gold-text">${this.game.room_code}</strong></p>

            <div class="waiting-seats-grid">
              ${[0, 1, 2, 3]
                .map((idx) => {
                  const s = seats[idx];
                  const occupied = s && s.user_id;
                  return `
                  <div class="waiting-seat-box ${occupied ? 'occupied' : 'empty'} ${idx === this.localSeatIndex ? 'is-self' : ''}">
                    <div class="waiting-seat-num">Seat ${idx + 1}</div>
                    <div class="waiting-seat-avatar">${occupied ? s.name.charAt(0).toUpperCase() : '👤'}</div>
                    <div class="waiting-seat-name">${occupied ? s.name : 'Waiting…'}</div>
                  </div>
                `;
                })
                .join('')}
            </div>

            <div class="waiting-actions">
              <button id="btn-share-room" class="btn-secondary">Share Room Link</button>
              <button id="btn-start-game" class="btn-primary btn-gold btn-lg">Start Game (Fill Bots)</button>
            </div>
          </div>
        </div>
      `
          : ''
      }

      <!-- Bottom Action Controls Bar -->
      ${
        !isWaiting
          ? `
        <div class="table-action-bar">
          <button id="btn-action-sort" class="btn-hud-action btn-sort" title="Sort Hand (S)">
            <span>Sort</span>
          </button>
          <button id="btn-action-deselect" class="btn-hud-action" title="Clear Selection (D)">
            <span>Clear</span>
          </button>
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
      `
          : ''
      }
    `;

    this.attachHudEvents();
    this.updateTimerUI();
  }

  private attachHudEvents(): void {
    // Copy Room Code
    const btnCopy = this.hudContainer.querySelector('#btn-copy-code');
    btnCopy?.addEventListener('click', () => {
      sound.playClick();
      navigator.clipboard?.writeText(this.game.room_code || '');
      toast.success(`Copied room code: ${this.game.room_code}`);
    });

    // Sound toggle
    const btnSound = this.hudContainer.querySelector('#btn-table-sound');
    btnSound?.addEventListener('click', () => {
      sound.toggleMute();
      this.renderHud();
    });

    // Leave table
    const btnLeave = this.hudContainer.querySelector('#btn-leave-table');
    btnLeave?.addEventListener('click', () => {
      sound.playClick();
      if (confirm('Leave current table and return to lobby?')) {
        this.callbacks.onLeaveTable();
      }
    });

    // Waiting: Share room link
    const btnShare = this.hudContainer.querySelector('#btn-share-room');
    btnShare?.addEventListener('click', () => {
      sound.playClick();
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${this.game.room_code}`;
      navigator.clipboard?.writeText(shareUrl);
      toast.success('Room link copied to clipboard!');
    });

    // Waiting: Start Game
    const btnStart = this.hudContainer.querySelector('#btn-start-game');
    btnStart?.addEventListener('click', async () => {
      sound.playClick();
      try {
        toast.info('Starting game with bots…');
        const res = await startGame(this.game.id);
        this.game = res.game;
        this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
        this.handFan.setCards(this.handCards);
        this.renderHud();
        this.applyGameState();
      } catch (err: any) {
        toast.error(err?.message || 'Failed to start game');
      }
    });

    // In-game actions
    const btnPlay = this.hudContainer.querySelector('#btn-action-play');
    btnPlay?.addEventListener('click', () => this.handlePlayAction());

    const btnPass = this.hudContainer.querySelector('#btn-action-pass');
    btnPass?.addEventListener('click', () => this.handlePassAction());

    const btnHint = this.hudContainer.querySelector('#btn-action-hint');
    btnHint?.addEventListener('click', () => this.handleHintAction());

    const btnDeselect = this.hudContainer.querySelector('#btn-action-deselect');
    btnDeselect?.addEventListener('click', () => {
      sound.playClick();
      this.handFan.clearSelection();
    });

    const btnSort = this.hudContainer.querySelector('#btn-action-sort');
    btnSort?.addEventListener('click', () => {
      sound.playClick();
      this.handCards = sortCards(this.handCards);
      this.handFan.setCards(this.handCards);
      toast.info('Cards sorted');
    });
  }

  private updateHudActionState(): void {
    const isMyTurn =
      this.game.status === 'playing' && this.game.turn_index === this.localSeatIndex;

    const btnPlay = this.hudContainer.querySelector('#btn-action-play') as HTMLButtonElement;
    const btnPass = this.hudContainer.querySelector('#btn-action-pass') as HTMLButtonElement;
    const btnHint = this.hudContainer.querySelector('#btn-action-hint') as HTMLButtonElement;

    if (!btnPlay || !btnPass) return;

    // 1. Play Button Validation
    let canPlay = false;
    if (isMyTurn && this.selectedCards.length > 0) {
      canPlay = isValidPlay(
        this.handCards,
        this.selectedCards,
        this.game.last_combo?.cards || null,
        this.isOpeningMove
      );
    }

    btnPlay.disabled = !canPlay || this.isProcessingMove;
    if (canPlay) {
      btnPlay.classList.add('ready');
    } else {
      btnPlay.classList.remove('ready');
    }

    // 2. Pass Button Validation
    const canPass =
      isMyTurn &&
      this.game.last_combo !== null &&
      !this.isOpeningMove &&
      !this.isProcessingMove;
    btnPass.disabled = !canPass;

    // 3. Hint Button
    if (btnHint) {
      btnHint.disabled = !isMyTurn || this.isProcessingMove;
    }
  }

  private updateTimerUI(): void {
    if (this.game.status !== 'playing' || !this.game.turn_started_at) return;

    const startTime = new Date(this.game.turn_started_at).getTime();
    const elapsed = Math.max(0, Date.now() - startTime);
    const totalDuration = 120000; // 120s
    const remainingMs = Math.max(0, totalDuration - elapsed);
    const secondsLeft = Math.ceil(remainingMs / 1000);
    const pct = Math.min(100, Math.max(0, (remainingMs / totalDuration) * 100));

    const textEl = this.hudContainer.querySelector('#turn-timer-text');
    const barEl = this.hudContainer.querySelector('#turn-timer-bar') as HTMLElement;

    if (textEl) {
      textEl.textContent = `${secondsLeft}s`;
    }
    if (barEl) {
      barEl.style.width = `${pct}%`;
      if (secondsLeft <= 15) {
        barEl.style.backgroundColor = '#ef4444'; // Red
      } else if (secondsLeft <= 45) {
        barEl.style.backgroundColor = '#f59e0b'; // Amber
      } else {
        barEl.style.backgroundColor = '#22c55e'; // Green
      }
    }
  }

  private async handlePlayAction(): Promise<void> {
    if (this.isProcessingMove) return;
    const isMyTurn =
      this.game.status === 'playing' && this.game.turn_index === this.localSeatIndex;

    if (!isMyTurn) {
      toast.warning('Not your turn to play');
      return;
    }

    if (this.selectedCards.length === 0) {
      toast.warning('Select cards from your hand to play');
      return;
    }

    const valid = isValidPlay(
      this.handCards,
      this.selectedCards,
      this.game.last_combo?.cards || null,
      this.isOpeningMove
    );

    if (!valid) {
      if (this.isOpeningMove) {
        toast.error('Opening move must contain 3♦ (3 of Diamonds)');
      } else if (!this.game.last_combo) {
        toast.error('Invalid combination (must be Single, Pair, Straight, Flush, Full House, Quads, or Straight Flush)');
      } else {
        toast.error('Played combination does not beat the current pile');
      }
      return;
    }

    this.isProcessingMove = true;
    this.updateHudActionState();

    const played = [...this.selectedCards];
    try {
      await playCards(this.game.id, this.localSeatIndex, played);
      sound.playCardSnap();
      this.handCards = this.handCards.filter((c) => !played.includes(c));
      this.handFan.setCards(this.handCards);
      this.handFan.clearSelection();
    } catch (err: any) {
      toast.error(err?.message || 'Play rejected by server');
    } finally {
      this.isProcessingMove = false;
      this.updateHudActionState();
    }
  }

  private async handlePassAction(): Promise<void> {
    if (this.isProcessingMove) return;
    const isMyTurn =
      this.game.status === 'playing' && this.game.turn_index === this.localSeatIndex;

    if (!isMyTurn) {
      toast.warning('Not your turn');
      return;
    }

    if (!this.game.last_combo) {
      toast.warning('Cannot pass when leading a fresh trick');
      return;
    }

    if (this.isOpeningMove) {
      toast.warning('Cannot pass on the opening move of the game');
      return;
    }

    this.isProcessingMove = true;
    this.updateHudActionState();

    try {
      await passTurn(this.game.id, this.localSeatIndex);
      this.handFan.clearSelection();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to pass turn');
    } finally {
      this.isProcessingMove = false;
      this.updateHudActionState();
    }
  }

  private handleHintAction(): void {
    sound.playClick();
    const suggested = getBotMove(
      this.handCards,
      this.game.last_combo?.cards || null,
      this.isOpeningMove,
      13
    );

    if (suggested && suggested.length > 0) {
      this.handFan.setSelectedCards(suggested);
      const combo = classifyCombo(suggested);
      const comboName = combo ? combo.type.replace(/_/g, ' ').toUpperCase() : 'COMBO';
      toast.info(`Hint: Selected ${comboName}`);
    } else {
      toast.info('Hint: No beating move available — pass recommended');
    }
  }

  private update(delta: number): void {
    for (const sv of this.seatViews) {
      sv.update(delta);
    }
    this.pileView.update(delta);
    this.handFan.update(delta);
  }
}
