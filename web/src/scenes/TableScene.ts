import { Application, Container, Graphics } from 'pixi.js';
import {
  GameHeartbeat,
  getCurrentUser,
  fetchGame,
  fetchPlayerHand,
  playCards,
  passTurn,
  startGame,
  subscribeToGame,
  type GameRecord,
  type MoveRecord,
} from '../net/pb';
import { GameController } from '../application/GameController';
import { HandFan } from '../render/HandFan';
import { SeatView } from '../render/SeatView';
import { PileView } from '../render/PileView';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import { escapeHtml } from '../ui/escape';
import {
  Card,
  CardCombo,
  Room,
  Seat,
  TurnTimer,
  PUBLIC_LOBBY_AUTOSTART_MS,
} from '../domain';

export interface TableSceneCallbacks {
  onGameFinished: (game: GameRecord, localSeatIndex: number) => void;
  onLeaveTable: () => void;
}

export class TableScene {
  private app: Application;
  private game: GameRecord;
  private localSeatIndex: number;
  private callbacks: TableSceneCallbacks;
  private controller: GameController;

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
    this.controller = new GameController(game, localSeatIndex, this.handCards);

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

    // Synchronize local seat index with server auth
    const current = getCurrentUser();
    if (current?.id && this.game.seats) {
      const serverSeat = this.game.seats.findIndex((s) => s && s.user_id === current.id);
      if (serverSeat >= 0 && serverSeat !== this.localSeatIndex) {
        this.localSeatIndex = serverSeat;
        this.controller.setLocalSeatIndex(serverSeat);
      }
    }

    this.renderHud();
    this.resize(window.innerWidth, window.innerHeight);

    // Initial game state apply
    this.applyGameState();

    // Fetch initial hand if playing
    if (this.game.status === 'playing') {
      try {
        this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
        this.controller.setLocalHand(this.handCards);
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

    // 1. Draw Luxury Casino Felt & Tabletop Rail
    this.tableBg.clear();

    // Deep luxury dark felt backdrop
    this.tableBg.rect(0, 0, width, height);
    this.tableBg.fill({ color: 0x05120d });

    if (isPortrait) {
      // Mobile Portrait: Center table felt with generous spacing
      const tableW = Math.min(width * 0.94, 400);
      const tableH = Math.min(height * 0.74, 630);
      const tableRadius = tableW * 0.38;
      const feltCy = Math.round(height * 0.46);

      // Outer rail bumper (leather/wood)
      this.tableBg.roundRect(cx - tableW / 2 - 4, feltCy - tableH / 2 - 4, tableW + 8, tableH + 8, tableRadius + 4);
      this.tableBg.fill({ color: 0x0a1c14 });
      this.tableBg.stroke({ width: 2, color: 0x143425 });

      // Outer brass trim
      this.tableBg.roundRect(cx - tableW / 2, feltCy - tableH / 2, tableW, tableH, tableRadius);
      this.tableBg.fill({ color: 0x07271a });
      this.tableBg.stroke({ width: 2, color: 0xd97706, alpha: 0.75 });

      // Inner felt baize ring
      this.tableBg.roundRect(cx - tableW / 2 + 6, feltCy - tableH / 2 + 6, tableW - 12, tableH - 12, tableRadius - 4);
      this.tableBg.stroke({ width: 1, color: 0x104d33, alpha: 0.6 });

      // 2. Position Seats in Top-Arc Layout below sleek top bar
      const topArcY = Math.max(105, height * 0.125);

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
          sv.position.set(width * 0.18, topArcY + 16);
        } else if (relPos === 2) {
          // Center Top Opponent
          sv.visible = true;
          sv.layoutForPosition('top_arc');
          sv.position.set(width * 0.50, topArcY + 6);
        } else if (relPos === 3) {
          // Right Opponent
          sv.visible = true;
          sv.layoutForPosition('top_arc');
          sv.position.set(width * 0.82, topArcY + 16);
        }
      }

      // 3. Position Center Pile comfortably above HandFan
      const pileY = Math.round(height * 0.41);
      this.tableBg.circle(cx, pileY, tableW * 0.26);
      this.tableBg.fill({ color: 0x093020, alpha: 0.5 });
      this.tableBg.stroke({ width: 1.2, color: 0x15803d, alpha: 0.35 });

      // Inner dashed accent ring
      this.tableBg.circle(cx, pileY, tableW * 0.24);
      this.tableBg.stroke({ width: 0.8, color: 0xd97706, alpha: 0.25 });

      this.pileView.position.set(cx, pileY);
      this.handFan.resize(width, height);
    } else {
      // Landscape / Desktop Layout: Classic 4-side casino oval
      const tableW = Math.min(width * 0.94, 1140);
      const tableH = Math.min(height * 0.88, 740);
      const tableRadius = Math.min(tableW, tableH) * 0.28;

      // Outer rail bumper
      this.tableBg.roundRect(cx - tableW / 2 - 6, cy - tableH / 2 - 6, tableW + 12, tableH + 12, tableRadius + 4);
      this.tableBg.fill({ color: 0x0a1c14 });
      this.tableBg.stroke({ width: 2, color: 0x143425 });

      // Brass rail trim
      this.tableBg.roundRect(cx - tableW / 2, cy - tableH / 2, tableW, tableH, tableRadius);
      this.tableBg.fill({ color: 0x07271a });
      this.tableBg.stroke({ width: 3, color: 0xd97706, alpha: 0.8 });

      // Inner baize border
      this.tableBg.roundRect(cx - tableW / 2 + 8, cy - tableH / 2 + 8, tableW - 16, tableH - 16, tableRadius - 6);
      this.tableBg.stroke({ width: 1, color: 0x104d33, alpha: 0.5 });

      // Center Trick Area Watermark
      const centerR = Math.min(tableW, tableH) * 0.24;
      this.tableBg.circle(cx, cy, centerR);
      this.tableBg.fill({ color: 0x093020, alpha: 0.5 });
      this.tableBg.stroke({ width: 1.2, color: 0x15803d, alpha: 0.35 });

      this.tableBg.circle(cx, cy, centerR - 6);
      this.tableBg.stroke({ width: 0.8, color: 0xd97706, alpha: 0.25 });

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
    const room = new Room({
      code: '',
      seats: seats?.map((s, idx) =>
        s
          ? new Seat({
              index: idx,
              userId: s.user_id,
              name: s.name,
              isBot: s.is_bot,
              connected: s.connected,
            })
          : null
      ),
    });
    return room.hostSeatIndex;
  }

  private async handleGameUpdate(game: GameRecord): Promise<void> {
    const wasWaiting = this.game.status === 'waiting';
    const prevHost = this.getHostSeatIndex(this.game.seats || []);
    const nextHost = this.getHostSeatIndex(game.seats || []);

    this.game = game;

    // Synchronize local seat index with server seats if authenticated
    const current = getCurrentUser();
    if (current?.id && game.seats) {
      const serverSeat = game.seats.findIndex((s) => s && s.user_id === current.id);
      if (serverSeat >= 0 && serverSeat !== this.localSeatIndex) {
        this.localSeatIndex = serverSeat;
        this.controller.setLocalSeatIndex(serverSeat);
      }
    }

    this.controller.updateGameFromDto(game);
    this.applyGameState();

    if (wasWaiting && game.status === 'waiting' && prevHost !== nextHost && nextHost === this.localSeatIndex) {
      toast.info('You are now the room host 👑');
    }

    if (wasWaiting && game.status === 'playing') {
      this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
      this.controller.setLocalHand(this.handCards);
      this.handFan.setCards(this.handCards);
      this.renderHud();
      sound.playDeal();
    }

    if (game.status === 'playing') {
      const currentTurnSeat = game.seats?.[game.turn_index];
      if (currentTurnSeat?.is_bot) {
        this.heartbeat?.triggerImmediate(900);
      }
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
        const passedSeats = this.game.passed_seats || [];
        sv.setHasPassed(passedSeats.includes(i) && counts[i] > 0);
      }
    }

    // Update Pile
    if (lastCombo && lastCombo.cards && lastCombo.cards.length > 0) {
      const pName = seats[lastCombo.seat_index]?.name;
      this.pileView.setCombo(lastCombo, pName);

      // Restrict selection to match target combo length (1 for single, 2 for pair, 5 for 5-card combo)
      const len = lastCombo.cards.length;
      if (len === 1) {
        this.handFan.setMaxSelectionLimit(1);
      } else if (len === 2) {
        this.handFan.setMaxSelectionLimit(2);
      } else {
        this.handFan.setMaxSelectionLimit(5);
      }
    } else {
      this.pileView.clearPile();
      // Pile is empty / user opens trick: allow up to 5 cards selection
      this.handFan.setMaxSelectionLimit(5);
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
              ? (() => {
                  const counts = this.game.counts || [13, 13, 13, 13];
                  let hasActiveHuman = false;
                  for (let s = 0; s < 4; s++) {
                    const st = seats[s];
                    if (st && !st.is_bot && st.user_id && counts[s] > 0) {
                      hasActiveHuman = true;
                      break;
                    }
                  }
                  if (!hasActiveHuman) {
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
                      <span class="timer-text" id="turn-timer-text">120s</span>
                      <div class="timer-progress-track">
                        <div class="timer-progress-bar" id="turn-timer-bar"></div>
                      </div>
                    </div>
                  `;
                })()
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
            <p class="waiting-subtitle">Room Code: <strong class="text-gold">${escapeHtml(this.game.room_code)}</strong></p>

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
                  : this.game.is_public
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

    // Waiting: Start Game (Host or Force-Start after 30s)
    const handleStartGame = async () => {
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
    };

    const btnStart = this.hudContainer.querySelector('#btn-start-game');
    btnStart?.addEventListener('click', handleStartGame);

    const btnForceStart = this.hudContainer.querySelector('#btn-force-start-game');
    btnForceStart?.addEventListener('click', handleStartGame);

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
      this.handCards = Card.sortCodes(this.handCards);
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
        const classified = CardCombo.evaluate(this.selectedCards);
        if (classified) {
          comboPill.textContent = `✨ ${classified.description} (${this.selectedCards.length} cards)`;
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
    const canPlay = isMyTurn && this.selectedCards.length > 0 && this.controller.canPlayCards(this.selectedCards).valid;

    btnPlay.disabled = !canPlay || this.isProcessingMove;
    if (canPlay) {
      btnPlay.classList.add('ready');
    } else {
      btnPlay.classList.remove('ready');
    }

    // 2. Pass Button Validation
    const canPass = isMyTurn && this.controller.canPassTurn().valid;
    btnPass.disabled = !canPass || this.isProcessingMove;

    // 3. Hint Button
    if (btnHint) {
      btnHint.disabled = !isMyTurn || this.isProcessingMove;
    }
  }

  private updateTimerUI(): void {
    // 1. Lobby Waiting Countdown for Public Quickplay
    if (this.game.status === 'waiting' && this.game.is_public && this.game.created) {
      const createdTime = new Date(this.game.created).getTime();
      const elapsed = Math.max(0, Date.now() - createdTime);
      const remainingMs = Math.max(0, PUBLIC_LOBBY_AUTOSTART_MS - elapsed);
      const secondsLeft = Math.ceil(remainingMs / 1000);

      const qpSec = this.hudContainer.querySelector('#quickplay-timer-sec');
      const qpWrap = this.hudContainer.querySelector('#quickplay-countdown-wrap') as HTMLElement;
      const btnForce = this.hudContainer.querySelector('#btn-force-start-game') as HTMLElement;

      if (qpSec) {
        qpSec.textContent = `${secondsLeft}s`;
      }
      if (secondsLeft === 0) {
        if (qpWrap) qpWrap.style.display = 'none';
        if (btnForce) btnForce.style.display = 'inline-block';
      }
      return;
    }

    if (this.game.status !== 'playing' || !this.game.turn_started_at) return;

    const timer = new TurnTimer(this.game.turn_started_at);
    const secondsLeft = timer.getRemainingSecs();
    const pct = Math.min(100, Math.max(0, (1.0 - timer.getProgress()) * 100));
    const statusColor = timer.getStatusColor();

    const textEl = this.hudContainer.querySelector('#turn-timer-text');
    const barEl = this.hudContainer.querySelector('#turn-timer-bar') as HTMLElement;

    if (textEl) {
      textEl.textContent = `${secondsLeft}s`;
    }
    if (barEl) {
      barEl.style.width = `${pct}%`;
      barEl.style.backgroundColor = statusColor;
    }
  }

  private async handlePlayAction(): Promise<void> {
    if (this.isProcessingMove) return;

    const check = this.controller.canPlayCards(this.selectedCards);
    if (!check.valid) {
      toast.error(check.reason || 'Invalid move');
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
      this.controller.setLocalHand(this.handCards);
      this.handFan.setCards(this.handCards);
      this.handFan.clearSelection();
    } catch (err: any) {
      toast.error(err?.message || 'Play rejected by server');
    } finally {
      this.isProcessingMove = false;
      this.updateHudActionState();
      this.heartbeat?.triggerImmediate(250);
    }
  }

  private async handlePassAction(): Promise<void> {
    if (this.isProcessingMove) return;

    const check = this.controller.canPassTurn();
    if (!check.valid) {
      toast.warning(check.reason || 'Cannot pass');
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
      this.heartbeat?.triggerImmediate(250);
    }
  }

  private handleHintAction(): void {
    sound.playClick();
    const hint = this.controller.findHintCombo(this.selectedCards);

    if (hint && hint.cards.length > 0) {
      this.handFan.setSelectedCards(hint.cardCodes);
      toast.info(`Hint: Selected ${hint.description}`);
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
