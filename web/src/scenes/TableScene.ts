import { Application, Container, Graphics } from 'pixi.js';
import {
  getCurrentUser,
  fetchGame,
  fetchMoves,
  fetchPlayerHand,
  startGame,
  subscribeToGame,
  type GameRecord,
  type LastCombo,
  type MoveRecord,
} from '../net/pb';
import {
  GameHeartbeat,
  GameController,
  effectiveLastCombo,
  isStaleGameSnapshot,
  shouldShowPlayOnPile,
} from '../application';
import { HandFan } from '../render/HandFan';
import { SeatView } from '../render/SeatView';
import { PileView } from '../render/PileView';
import { computeTableLayout, drawTableFelt, pulseTurnGlow } from '../render/tableLayout';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import { formatSeatLabel } from '../ui/seatLabel';
import { MoveHistoryModal } from '../ui/MoveHistoryModal';
import { TableHud, hostSeatIndexFromSeats, type TableHudState } from '../ui/TableHud';
import { modelManager } from '../ai/ModelManager';

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
  private tableTurnGlow: Graphics;
  private tablePulseTime = 0;
  private tableBounds = { x: 0, y: 0, w: 0, h: 0, r: 0 };
  private seatViews: SeatView[] = [];
  private pileView: PileView;
  private handFan: HandFan;

  // DOM HUD Overlay
  private hud: TableHud;
  private historyModal: MoveHistoryModal = new MoveHistoryModal();

  // Game Engine & State
  private handCards: number[] = [];
  private selectedCards: number[] = [];
  private moves: MoveRecord[] = [];
  private isProcessingMove = false;
  private heartbeat: GameHeartbeat | null = null;
  private unsubscribeMoves?: () => void;
  private unsubscribeAi?: () => void;
  private lastTurnIndex = -1;
  private updateSeq = 0;
  private reconcileTimer?: number;

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

    this.tableTurnGlow = new Graphics();
    this.rootContainer.addChild(this.tableTurnGlow);

    // 4 Seats
    for (let i = 0; i < 4; i++) {
      const sv = new SeatView(i, i === this.localSeatIndex);
      this.seatViews.push(sv);
      this.rootContainer.addChild(sv);
    }

    // Center Trick Pile
    this.pileView = new PileView();
    this.pileView.onPileClick = () => {
      this.openMoveHistoryModal();
    };
    this.rootContainer.addChild(this.pileView);

    // Player Hand Fan
    this.handFan = new HandFan();
    this.rootContainer.addChild(this.handFan);

    this.setupHandFanEvents();

    // 2. DOM HUD
    this.hud = new TableHud({
      onHistory: () => this.openMoveHistoryModal(),
      onCopyRoomCode: () => {
        sound.playClick();
        navigator.clipboard?.writeText(this.game.room_code || '');
        toast.success(`Copied room code: ${this.game.room_code}`);
      },
      onToggleSound: () => {
        sound.toggleMute();
        this.hud.render(this.hudState());
      },
      onLeave: () => {
        sound.playClick();
        if (confirm('Leave current table and return to lobby?')) {
          this.callbacks.onLeaveTable();
        }
      },
      onShareRoom: () => {
        sound.playClick();
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${this.game.room_code}`;
        navigator.clipboard?.writeText(shareUrl);
        toast.success('Room link copied to clipboard!');
      },
      onStartGame: () => this.handleStartGame(),
      onPlay: () => this.handlePlayAction(),
      onPass: () => this.handlePassAction(),
      onHint: () => this.handleHintAction(),
      onDeselect: () => {
        sound.playClick();
        this.handFan.clearSelection();
      },
    });

    // 3. Ticker loop
    this.tickerCallback = (ticker) => this.update(ticker.deltaTime);
    this.app.ticker.add(this.tickerCallback);

    // 4. Timer update interval
    this.timerInterval = window.setInterval(() => this.hud.updateTimer(this.hudState()), 500);
  }

  public async mount(parentEl: HTMLElement): Promise<void> {
    this.app.stage.addChild(this.rootContainer);
    parentEl.appendChild(this.hud.element);

    this.syncLocalSeat(this.game);

    // Fetch past moves in this match
    fetchMoves(this.game.id)
      .then((m) => {
        this.moves = m;
      })
      .catch(() => {});

    this.hud.render(this.hudState());
    this.resize(window.innerWidth, window.innerHeight);

    // Initial game state apply
    this.applyGameState();

    // Fetch initial hand if playing
    if (this.game.status === 'playing') {
      try {
        this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
        this.controller.setLocalHand(this.handCards);
        this.handFan.setCards(this.handCards);
        this.hud.updateActionState(this.hudState());
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
            this.controller.setLocalHand(cards);
            this.handFan.setCards(cards);
            this.hud.updateActionState(this.hudState());
          },
        }
      );
    } catch (err) {
      console.error('Failed to subscribe realtime moves:', err);
    }

    // Start Client-driven Heartbeat
    this.heartbeat = new GameHeartbeat(
      this.game.id,
      () => this.game,
      () => this.localSeatIndex,
      () => this.controller.domainGame
    );
    this.heartbeat.start();

    // Subscribe to AI status changes to update Table HUD badge
    this.unsubscribeAi = modelManager.onStatusChange(() => {
      this.hud.render(this.hudState());
    });

    // Authoritative reconcile poll: heals any missed SSE game update (dead
    // stream, dropped reconnect) so the client can never stall on a stale turn.
    this.reconcileTimer = window.setInterval(() => {
      if (this.game.status !== 'finished') {
        this.reconcileFromServer();
      }
    }, 5000);

    // Reconcile state when the tab becomes visible again (missed SSE while
    // backgrounded), then refresh the local hand — a timeout auto-play may
    // have changed it while away.
    this.visibilityHandler = async () => {
      if (document.visibilityState !== 'visible' || !this.game?.id) return;
      await this.reconcileFromServer();
      if (this.game.status !== 'playing') return;
      const seq = this.updateSeq;
      try {
        const hand = await fetchPlayerHand(this.game.id, this.localSeatIndex);
        if (seq !== this.updateSeq) return; // superseded or unmounted
        if (JSON.stringify(hand) !== JSON.stringify(this.handCards)) {
          this.handCards = hand;
          this.controller.setLocalHand(hand);
          this.handFan.setCards(hand);
          this.hud.updateActionState(this.hudState());
        }
      } catch {}
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  public unmount(): void {
    // Invalidate any in-flight update: post-await resumes must not touch
    // destroyed Pixi containers / HUD nodes.
    this.updateSeq++;
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
    if (this.unsubscribeAi) {
      this.unsubscribeAi();
      this.unsubscribeAi = undefined;
    }
    if (this.heartbeat) {
      this.heartbeat.stop();
      this.heartbeat = null;
    }
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = undefined;
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

    this.historyModal.close();
    this.app.stage.removeChild(this.rootContainer);
    this.rootContainer.destroy({ children: true });
    this.hud.remove();
  }

  private setupHandFanEvents(): void {
    this.handFan.onSelectionChanged = (selected) => {
      this.selectedCards = selected;
      this.hud.updateActionState(this.hudState());
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

    const layout = computeTableLayout(this.viewWidth, this.viewHeight, this.localSeatIndex);
    this.tableBounds = layout.tableBounds;
    drawTableFelt(this.tableBg, layout);

    for (let i = 0; i < 4; i++) {
      const sv = this.seatViews[i];
      const place = layout.seats[i];
      sv.visible = place.visible;
      if (place.visible) {
        sv.layoutForPosition(place.layout);
        sv.position.set(place.x, place.y);
      }
    }

    this.pileView.position.set(layout.pile.x, layout.pile.y);
    this.handFan.resize(this.viewWidth, this.viewHeight);
  }

  /** Center pile, or null when the trick is discarded / a fresh lead. */
  private get lastCombo(): LastCombo | null {
    return effectiveLastCombo(this.game.last_combo);
  }

  private getHostSeatIndex(seats: GameRecord['seats']): number {
    return hostSeatIndexFromSeats(seats);
  }

  private hudState(): TableHudState {
    const isMyTurn = this.controller.isMyTurn;
    return {
      game: this.game,
      localSeatIndex: this.localSeatIndex,
      isMyTurn,
      selectedCards: this.selectedCards,
      canPlay: isMyTurn && this.selectedCards.length > 0 && this.controller.canPlayCards(this.selectedCards).valid,
      canPass: isMyTurn && this.controller.canPassTurn().valid,
      isProcessingMove: this.isProcessingMove,
      soundMuted: sound.isMuted(),
      isAiReady: modelManager.isReady(),
    };
  }

  private syncLocalSeat(game: GameRecord): void {
    const current = getCurrentUser();
    if (!current?.id || !game.seats) return;
    const serverSeat = game.seats.findIndex((s) => s && s.user_id === current.id);
    if (serverSeat >= 0 && serverSeat !== this.localSeatIndex) {
      this.localSeatIndex = serverSeat;
      this.controller.setLocalSeatIndex(serverSeat);
    }
  }

  private async handleGameUpdate(game: GameRecord): Promise<void> {
    // Monotonic guard: ignore snapshots strictly older than the applied one.
    // Equal timestamps still apply so a same-second trick-clear (last_combo
    // null) is not dropped when bots pass rapidly later in the game.
    if (
      this.game?.id === game.id &&
      isStaleGameSnapshot(this.game.updated, game.updated)
    ) {
      return;
    }

    const seq = ++this.updateSeq;
    const wasWaiting = this.game.status === 'waiting';
    const wasFinished = this.game.status === 'finished';
    const prevHost = this.getHostSeatIndex(this.game.seats || []);
    const nextHost = this.getHostSeatIndex(game.seats || []);

    this.game = game;
    this.syncLocalSeat(game);
    this.controller.updateGameFromDto(game);

    if (wasWaiting && game.status === 'waiting' && prevHost !== nextHost && nextHost === this.localSeatIndex) {
      toast.info('You are now the room host 👑');
    }

    if (game.status === 'playing' && (wasWaiting || this.handCards.length === 0)) {
      const cards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
      // A newer update superseded this snapshot while awaiting: discard it
      if (seq !== this.updateSeq) return;
      this.handCards = cards;
      this.controller.setLocalHand(cards);
      this.handFan.setCards(cards);
      this.hud.render(this.hudState());
      sound.playDeal();
    }

    this.applyGameState();

    if (game.status === 'playing') {
      const currentTurnSeat = game.seats?.[game.turn_index];
      if (currentTurnSeat?.is_bot) {
        this.heartbeat?.triggerBotTurn();
      }
    }

    if (game.status === 'finished' && !wasFinished) {
      this.callbacks.onGameFinished(game, this.localSeatIndex);
    }
  }

  /**
   * Fetches the authoritative game record and applies it (stale-guarded in
   * handleGameUpdate). Runs every 5s and after every local move.
   */
  private async reconcileFromServer(): Promise<void> {
    if (!this.game?.id) return;
    try {
      const fresh = await fetchGame(this.game.id);
      await this.handleGameUpdate(fresh);
    } catch {
      // Transient network failure — the next interval retries
    }
  }

  private handleMoveCreated(move: MoveRecord): void {
    if (move.action !== 'tick') {
      const exists = this.moves.some((m) => m.id === move.id);
      if (!exists) {
        this.moves.push(move);
      }
    }

    const seats = this.game.seats || [];
    const seatName = formatSeatLabel(move.seat_index, seats[move.seat_index]);

    if (move.action === 'play') {
      const lastCombo = this.lastCombo;
      const showOnPile = shouldShowPlayOnPile({
        lastCombo,
        moveCards: move.cards || [],
        moveCreated: move.created,
        gameUpdated: this.game.updated,
      });

      if (!showOnPile) {
        // Trick already discarded (winner is leading again). A late play
        // SSE from the concluded trick must not resurrect the center pile.
        if (!lastCombo) this.pileView.clearPile();
        return;
      }

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
      if (!this.lastCombo) this.pileView.clearPile();
    }
  }

  public async openMoveHistoryModal(): Promise<void> {
    sound.playClick();
    try {
      const fresh = await fetchMoves(this.game.id);
      if (fresh.length >= this.moves.length) {
        this.moves = fresh;
      }
    } catch {}

    this.historyModal.show({
      container: document.body,
      roomCode: this.game.room_code,
      seats: this.game.seats || [],
      localSeatIndex: this.localSeatIndex,
      moves: this.moves,
    });
  }

  private applyGameState(): void {
    const seats = this.game.seats || [];
    const counts = this.game.counts || [13, 13, 13, 13];
    const winnerRanks = this.game.winner_ranks || [];
    const currentTurn = this.game.turn_index;
    const lastCombo = this.lastCombo;

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
        sv.setPlayerInfo('Empty', false, false);
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
    if (lastCombo) {
      const pName = formatSeatLabel(lastCombo.seat_index, seats[lastCombo.seat_index]);
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
    this.hud.render(this.hudState());
  }

  private async handleStartGame(): Promise<void> {
    sound.playClick();
    try {
      toast.info('Starting game with bots…');
      const res = await startGame(this.game.id);
      this.game = res.game;
      this.controller.updateGameFromDto(this.game);
      this.handCards = await fetchPlayerHand(this.game.id, this.localSeatIndex);
      this.controller.setLocalHand(this.handCards);
      this.handFan.setCards(this.handCards);
      this.hud.render(this.hudState());
      this.applyGameState();
      sound.playDeal();
      if (this.game.status === 'playing') {
        const currentTurnSeat = this.game.seats?.[this.game.turn_index];
        if (currentTurnSeat?.is_bot) {
          this.heartbeat?.triggerBotTurn();
        }
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start game');
    }
  }

  private async handlePlayAction(): Promise<void> {
    if (this.isProcessingMove) return;

    this.isProcessingMove = true;
    this.hud.updateActionState(this.hudState());

    const played = [...this.selectedCards];
    try {
      const ok = await this.controller.executePlay(played);
      if (ok) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate(30); } catch (_) {}
        }
        this.handCards = this.controller.domainHand.cardCodes;
        this.handFan.setCards(this.handCards);
        this.handFan.clearSelection();
      }
    } finally {
      this.isProcessingMove = false;
      this.hud.updateActionState(this.hudState());
      this.heartbeat?.triggerImmediate(250);
      this.reconcileFromServer();
    }
  }

  private async handlePassAction(): Promise<void> {
    if (this.isProcessingMove) return;

    this.isProcessingMove = true;
    this.hud.updateActionState(this.hudState());

    try {
      const ok = await this.controller.executePass();
      if (ok) this.handFan.clearSelection();
    } finally {
      this.isProcessingMove = false;
      this.hud.updateActionState(this.hudState());
      this.heartbeat?.triggerImmediate(250);
      this.reconcileFromServer();
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

    this.tablePulseTime = pulseTurnGlow(
      this.tableTurnGlow,
      this.tableBounds,
      this.tablePulseTime,
      delta,
      this.controller.isMyTurn
    );
  }
}
