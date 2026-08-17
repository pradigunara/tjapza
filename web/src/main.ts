import { Application } from 'pixi.js';
import './index.css';
import {
  ensureAuth,
  joinRoom,
  type GameRecord,
} from './net/pb';
import { LobbyScene } from './scenes/LobbyScene';
import { TableScene } from './scenes/TableScene';
import { ResultsScene } from './scenes/ResultsScene';
import { toast } from './ui/toast';

class TjapzaApp {
  private app: Application;
  private rootEl: HTMLElement;

  private currentLobbyScene: LobbyScene | null = null;
  private currentTableScene: TableScene | null = null;
  private currentResultsScene: ResultsScene | null = null;

  constructor() {
    this.app = new Application();
    this.rootEl = document.getElementById('app') || document.body;
  }

  public async init(): Promise<void> {
    // 1. Initialize PixiJS v8 Application
    await this.app.init({
      resizeTo: window,
      backgroundColor: 0x07130e,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
    });

    this.rootEl.appendChild(this.app.canvas);

    // 2. Setup Resize Handler
    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this.currentTableScene?.resize(window.innerWidth, window.innerHeight);
    });

    // 3. Ensure Auth
    await ensureAuth();

    // 4. Check URL Params for direct join (?room=ABC123 or ?game=...)
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room') || params.get('game');

    if (roomParam) {
      try {
        toast.info(`Connecting to room ${roomParam}…`);
        const res = await joinRoom(roomParam);
        this.openTable(res.game, res.seat_index);
        return;
      } catch (err: any) {
        toast.error(err?.message || 'Could not join room from link');
      }
    }

    // Default to Lobby Scene
    this.openLobby();
  }

  public openLobby(): void {
    this.cleanupCurrentScenes();

    // Reset URL
    if (window.history.pushState) {
      window.history.pushState({}, '', window.location.pathname);
    }

    this.currentLobbyScene = new LobbyScene({
      onGameJoined: (game, seatIndex) => this.openTable(game, seatIndex),
    });

    this.currentLobbyScene.mount(this.rootEl);
  }

  public openTable(game: GameRecord, localSeatIndex: number): void {
    this.cleanupCurrentScenes();

    // Update URL with room code
    if (game.room_code && window.history.pushState) {
      window.history.pushState({}, '', `?room=${game.room_code}`);
    }

    this.currentTableScene = new TableScene(
      this.app,
      game,
      localSeatIndex,
      {
        onGameFinished: (finishedGame, seatIdx) => this.openResults(finishedGame, seatIdx),
        onLeaveTable: () => this.openLobby(),
      }
    );

    this.currentTableScene.mount(this.rootEl);
  }

  public openResults(game: GameRecord, localSeatIndex: number): void {
    if (this.currentResultsScene) return;

    this.currentResultsScene = new ResultsScene(
      game,
      localSeatIndex,
      {
        onRematchStarted: (newGame, seatIdx) => this.openTable(newGame, seatIdx),
        onReturnToLobby: () => this.openLobby(),
      }
    );

    this.currentResultsScene.mount(this.rootEl);
  }

  private cleanupCurrentScenes(): void {
    if (this.currentResultsScene) {
      this.currentResultsScene.unmount();
      this.currentResultsScene = null;
    }
    if (this.currentTableScene) {
      this.currentTableScene.unmount();
      this.currentTableScene = null;
    }
    if (this.currentLobbyScene) {
      this.currentLobbyScene.unmount();
      this.currentLobbyScene = null;
    }
  }
}

// Bootstrap Application
const app = new TjapzaApp();
app.init().catch((err) => {
  console.error('Fatal initialization error:', err);
  toast.error('Failed to initialize Tjapza client. Please reload the page.');
});
