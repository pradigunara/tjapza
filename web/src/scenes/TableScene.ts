import { Application, Container, Graphics } from 'pixi.js';
import {
  GameHeartbeat,
  fetchGame,
  fetchPlayerHand,
  playCards,
  passTurn,
  startGame,
  subscribeToGame,
  type GameRecord,
  type MoveRecord,
} from '../net/pb';
import { HandFan } from '../render/HandFan';
import { SeatView } from '../render/SeatView';
import { PileView } from '../render/PileView';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import { isValidPlay, sortCards, classifyCombo, getBotMove } from '../rules/cards';

export interface TableSceneCallbacks {
  onGameFinished: (game: GameRecord, localSeatIndex: number) => void;
  onLeaveTable: () => void;
}

export class TableScene {
  private app: Application;
  private game: GameRecord;
  private localSeatIndex: number;
  private callbacks: TableSceneCallbacks;

  // Pixi Display Containers
  private rootContainer: Container;
  private tableBg: Graphics;
  private seatViews: SeatView[] = [];
  private pileView: PileView;
  private handFan: HandFan;

  // DOM HUD Overlay
  private hudContainer: HTMLElement;

  // Game Engine & State
  private handCards: number[] = [];
  private selectedCards: number[] = [];
  private isProcessingMove = false;
  private heartbeat: GameHeartbeat | null = null;
  private unsubscribeMoves?: () => void;
  private isOpeningMove = false;
  private lastTurnIndex = -1;

  private timerInterval?: number;
  private tickerCallback?: (ticker: any) => void;
  private visibilityHandler?: () => void;

  constructor(
    app: Application,
    game: GameRecord,
    localSeatIndex: number,
    callbacks: TableSceneCallbacks
  ) {
    this.app = app;
    this.game = game;
    this.localSeatIndex = localSeatIndex;
    this.callbacks = callbacks;

    // 1. Pixi Display Hierarchy
    this.rootContainer = new Container();
    this.tableBg = new Graphics();
    this.rootContainer.addChild(this.tableBg);

    // 4 Seats
    for (let i = 0; i < 4; i++) {
      const sv = new SeatView(i, i === this.localSeatIndex);
      this.seatViews.push(sv);
      this.rootContainer.addChild(sv);
    }

    // Center Trick Pile
    this.pileView = new PileView();
    this.rootContainer.addChild(this.pileView);

    // Player Hand Fan
    this.handFan = new HandFan();
    this.rootContainer.addChild(this.handFan);

    this.setupHandFanEvents();

    // 2. DOM HUD Container
    this.hudContainer = document.createElement('div');
    this.hudContainer.className = 'tjapza-table-hud';

    // 3. Ticker loop
    this.tickerCallback = (ticker) => this.update(ticker.deltaTime);
    this.app.ticker.add(this.tickerCallback);

    // 4. Timer update interval
    this.timerInterval = window.setInterval(() => this.updateTimerUI(), 500);
  }

  public async mount(parentEl: HTMLElement): Promise<void> {
    this.app.stage.addChild(this.rootContainer);
    parentEl.appendChild(this.hudContainer);

    this.renderHud();
    this.resize(window.innerWidth, window.innerHeight);

    // Initial game state apply
    this.applyGameState();

    // Fetch initial hand if playing
    if (this.game.status === 'playing') {
      try {
        this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
        this.handFan.setCards(this.handCards);
        this.updateHudActionState();
        sound.playDeal();
      } catch (err) {
        console.error('Failed to fetch initial hand:', err);
      }
    }

    // Start Realtime SSE Subscriptions
    try {
      this.unsubscribeMoves = subscribeToGame(
        this.game.id,
        this.localSeatIndex,
        {
          onGameUpdate: (updatedGame: GameRecord) => this.handleGameUpdate(updatedGame),
          onMoveCreated: (move: MoveRecord) => this.handleMoveCreated(move),
          onHandUpdate: (cards: number[]) => {
            this.handCards = cards;
            this.handFan.setCards(cards);
            this.updateHudActionState();
          },
        }
      );
    } catch (err) {
      console.error('Failed to subscribe realtime moves:', err);
      toast.warning('Realtime sync connecting in polling fallback mode…');
    }

    // Start Client-driven Heartbeat
    this.heartbeat = new GameHeartbeat(
      this.game.id,
      () => this.game,
      () => this.localSeatIndex
    );
    this.heartbeat.start();

    // Reconcile state immediately when mobile tab becomes visible again
    this.visibilityHandler = async () => {
      if (document.visibilityState === 'visible' && this.game?.id) {
        try {
          const fresh = await fetchGame(this.game.id);
          this.handleGameUpdate(fresh);
          if (fresh.status === 'playing') {
            const hand = await fetchPlayerHand(this.game.id, this.localSeatIndex);
            if (JSON.stringify(hand) !== JSON.stringify(this.handCards)) {
              this.handCards = hand;
              this.handFan.setCards(hand);
              this.updateHudActionState();
            }
          }
        } catch (_) {}
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  public unmount(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat = null;
    }
    if (this.unsubscribeMoves) {
      this.unsubscribeMoves();
      this.unsubscribeMoves = undefined;
    }
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

  // Viewport dimensions
  private viewWidth = 1000;
  private viewHeight = 700;

  public resize(width: number, height: number): void {
    this.viewWidth = width || window.innerWidth;
    this.viewHeight = height || window.innerHeight;
    const cx = this.viewWidth / 2;
    const cy = this.viewHeight / 2;
    const isPortrait = this.viewHeight > this.viewWidth;
    const isMobile = this.viewWidth < 640;

    // 1. Draw Table Background Felt & Vignette
    this.tableBg.clear();

    // Deep luxury dark felt backdrop
    this.tableBg.rect(0, 0, width, height);
    this.tableBg.fill({ color: 0x05130e });

    if (isPortrait) {
      // Mobile Portrait: Center table felt with generous spacing
      const tableW = Math.min(width * 0.94, 400);
      const tableH = Math.min(height * 0.75, 640);
      const tableRadius = tableW * 0.40;
      const feltCy = Math.round(height * 0.45);

      this.tableBg.roundRect(cx - tableW / 2, feltCy - tableH / 2, tableW, tableH, tableRadius);
      this.tableBg.fill({ color: 0x0a2a1c });
      this.tableBg.stroke({ width: 3, color: 0xd97706, alpha: 0.75 });

      // 2. Position Seats in Top-Arc Layout below sleek top bar
      const topArcY = Math.max(96, height * 0.12);

      for (let i = 0; i < 4; i++) {
        const sv = this.seatViews[i];
        const relPos = (i - this.localSeatIndex + 4) % 4;

        if (relPos === 0) {
          // Local player canvas seat hidden on mobile portrait (HUD controls show turn)
          sv.visible = false;
        } else if (relPos === 1) {
          // Left Opponent
          sv.visible = true;
          sv.layoutForPosition('top_arc');
          sv.position.set(width * 0.18, topArcY + 18);
        } else if (relPos === 2) {
          // Center Top Opponent
          sv.visible = true;
          sv.layoutForPosition('top_arc');
          sv.position.set(width * 0.50, topArcY + 6);
        } else if (relPos === 3) {
          // Right Opponent
          sv.visible = true;
          sv.layoutForPosition('top_arc');
          sv.position.set(width * 0.82, topArcY + 18);
        }
      }

      // 3. Position Center Pile comfortably above HandFan
      const pileY = Math.round(height * 0.40);
      this.tableBg.circle(cx, pileY, tableW * 0.25);
      this.tableBg.stroke({ width: 1, color: 0x15803d, alpha: 0.35 });

      this.pileView.position.set(cx, pileY);
      this.handFan.resize(width, height);
    } else {
      // Landscape / Desktop Layout: Classic 4-side casino oval
      const tableW = Math.min(width * 0.94, 1140);
      const tableH = Math.min(height * 0.88, 740);
      const tableRadius = Math.min(tableW, tableH) * 0.28;

      this.tableBg.roundRect(cx - tableW / 2, cy - tableH / 2, tableW, tableH, tableRadius);
      this.tableBg.fill({ color: 0x0a2a1c });
      this.tableBg.stroke({ width: 4, color: 0xd97706, alpha: 0.8 });

      this.tableBg.circle(cx, cy, Math.min(tableW, tableH) * 0.24);
      this.tableBg.stroke({ width: 1, color: 0x15803d, alpha: 0.35 });

      const seatMarginX = isMobile ? 35 : 70;
      const seatMarginY = isMobile ? 45 : 60;

      for (let i = 0; i < 4; i++) {
        const sv = this.seatViews[i];
        sv.visible = true;
        const relPos = (i - this.localSeatIndex + 4) % 4;

        if (relPos === 0) {
          sv.layoutForPosition('bottom');
          sv.position.set(cx, height - (isMobile ? 120 : 145));
        } else if (relPos === 1) {
          sv.layoutForPosition('left');
          sv.position.set(seatMarginX, cy - 20);
        } else if (relPos === 2) {
          sv.layoutForPosition('top');
          sv.position.set(cx, seatMarginY + 20);
        } else if (relPos === 3) {
          sv.layoutForPosition('right');
          sv.position.set(width - seatMarginX, cy - 20);
        }
      }

      this.pileView.position.set(cx, cy - (isMobile ? 15 : 20));
      this.handFan.resize(width, height);
    }
  }

  private getHostSeatIndex(seats: any[]): number {
    for (let i = 0; i < 4; i++) {
      if (seats[i] && seats[i]?.user_id && !seats[i]?.is_bot) {
        return i;
      }
    }
    return -1;
  }

  private async handleGameUpdate(game: GameRecord): Promise<void> {
    const wasWaiting = this.game.status === 'waiting';
    const prevHost = this.getHostSeatIndex(this.game.seats || []);
    const nextHost = this.getHostSeatIndex(game.seats || []);

    this.game = game;
    this.applyGameState();

    if (wasWaiting && game.status === 'waiting' && prevHost !== nextHost && nextHost === this.localSeatIndex) {
      toast.info('You are now the room host 👑');
    }

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
          seat_index: move.seat_index,
          cards: move.cards || [],
          type: move.combo_type || 'combo',
          power: move.combo_power || 0,
        },
        seatName,
        origin
      );
    } else if (move.action === 'pass') {
      sound.playPass();
      toast.info(`${seatName} passed`);
    }
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
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([20, 50, 20]); } catch (_) {}
      }
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
      const pName = seats[lastCombo.seat_index]?.name;
      this.pileView.setCombo(lastCombo, pName);
    } else {
      this.pileView.clearPile();
    }

    this.resize(this.viewWidth, this.viewHeight);
    this.renderHud();
    this.updateHudActionState();
  }

  private renderHud(): void {
    const isWaiting = this.game.status === 'waiting';
    const isMyTurn =
      this.game.status === 'playing' && this.game.turn_index === this.localSeatIndex;

    const seats = this.game.seats || [];

    this.hudContainer.innerHTML = `
      <!-- Top Clean Navigation Bar -->
      <div class="table-top-bar">
        <div class="top-bar-left">
          <div class="room-code-badge" id="btn-copy-code" title="Click to copy Room Code">
            <span class="badge-label">ROOM</span>
            <span class="badge-code">${this.game.room_code || '---'}</span>
            <span class="badge-copy-icon">📋</span>
          </div>
        </div>

        <div class="top-bar-right">
          ${
            this.game.status === 'playing'
              ? `
            <div class="turn-timer-hud" title="Turn Timer">
              <span class="timer-icon">⏱️</span>
              <span class="timer-text" id="turn-timer-text">120s</span>
              <div class="timer-progress-track">
                <div class="timer-progress-bar" id="turn-timer-bar"></div>
              </div>
            </div>
          `
              : ''
          }

          <button id="btn-table-sound" class="btn-icon" title="Toggle Sound">
            <span>${sound.isMuted() ? '🔇' : '🔊'}</span>
          </button>

          <button id="btn-leave-table" class="btn-icon btn-leave" title="Leave Table">
            <span class="leave-text-desktop">Leave</span>
            <span class="leave-icon-mobile">✕</span>
          </button>
        </div>
      </div>

      <!-- Center Lobby Waiting Overlay -->
      ${
        isWaiting
          ? (() => {
              let hostSeatIndex = -1;
              for (let i = 0; i < 4; i++) {
                if (seats[i] && seats[i]?.user_id && !seats[i]?.is_bot) {
                  hostSeatIndex = i;
                  break;
                }
              }
              const isHost = this.localSeatIndex === hostSeatIndex;
              const hostName =
                hostSeatIndex !== -1 && seats[hostSeatIndex]
                  ? seats[hostSeatIndex]?.name
                  : 'Host';

              return `
        <div class="table-waiting-overlay">
          <div class="waiting-card">
            <h2 class="waiting-title">Game Lobby</h2>
            <p class="waiting-subtitle">Room Code: <strong class="text-gold">${this.game.room_code}</strong></p>

            <div class="waiting-seats-grid">
              ${[0, 1, 2, 3]
                .map((idx) => {
                  const s = seats[idx];
                  const occupied = s && s.user_id;
                  const isSeatHost = idx === hostSeatIndex;
                  return `
                  <div class="waiting-seat-box ${occupied ? 'occupied' : 'empty'} ${idx === this.localSeatIndex ? 'is-self' : ''}">
                    <div class="waiting-seat-num">
                      Seat ${idx + 1}
                      ${isSeatHost ? '<span class="host-badge" title="Room Host">👑 Host</span>' : ''}
                    </div>
                    <div class="waiting-seat-avatar">${occupied ? s.name.charAt(0).toUpperCase() : '👤'}</div>
                    <div class="waiting-seat-name">${occupied ? s.name : 'Waiting…'}</div>
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
                  : `<div class="waiting-host-notice">⏳ Waiting for host (<strong>${hostName}</strong>) to start…</div>`
              }
            </div>
          </div>
        </div>
      `;
            })()
          : ''
      }

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
    const comboPill = this.hudContainer.querySelector('#selected-combo-pill') as HTMLElement;

    // Update Floating Selected Combo Indicator
    if (comboPill) {
      if (this.selectedCards.length > 0) {
        const classified = classifyCombo(this.selectedCards);
        if (classified) {
          let label = classified.type.replace(/_/g, ' ').toUpperCase();
          if (classified.type === 'single') label = 'Single';
          else if (classified.type === 'pair') label = 'Pair';
          else if (classified.type === 'straight') label = 'Straight';
          else if (classified.type === 'flush') label = 'Flush';
          else if (classified.type === 'full_house') label = 'Full House';
          else if (classified.type === 'quads') label = 'Four of a Kind';
          else if (classified.type === 'straight_flush') label = 'Straight Flush';

          comboPill.textContent = `✨ ${label} (${this.selectedCards.length} cards)`;
          comboPill.style.display = 'inline-block';
        } else {
          comboPill.textContent = `${this.selectedCards.length} cards selected`;
          comboPill.style.display = 'inline-block';
        }
      } else {
        comboPill.style.display = 'none';
      }
    }

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
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate(30); } catch (_) {}
      }
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
      sound.playPass();
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
