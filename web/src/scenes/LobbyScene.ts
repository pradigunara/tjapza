import {
  getCurrentUser,
  createGuestSession,
  login,
  signup,
  loginWithGoogle,
  logout,
  updateDisplayName,
  createRoom,
  joinRoom,
  quickPlay,
  type AuthUser,
  type GameRecord,
} from '../net/pb';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';
import { escapeHtml } from '../ui/escape';
import { modelManager } from '../ai/ModelManager';
import type { ModelProgress, ModelStatus } from '../ai/types';

export interface LobbyCallbacks {
  onGameJoined: (game: GameRecord, localSeatIndex: number) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export class LobbyScene {
  private container: HTMLElement;
  private callbacks: LobbyCallbacks;
  private currentUser: AuthUser | null = null;
  private isLoading = false;
  private isAiEnabled = false;
  private aiStatus: ModelStatus = 'unloaded';
  private aiProgress: ModelProgress = { progress: 0 };
  private unsubscribeAiProgress?: () => void;
  private unsubscribeAiStatus?: () => void;

  constructor(callbacks: LobbyCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'tjapza-lobby';
    this.container.className = 'tjapza-lobby-container';
  }

  public async mount(parent: HTMLElement): Promise<void> {
    parent.appendChild(this.container);

    try {
      this.isAiEnabled = localStorage.getItem('tjapza_enable_ai_bot') === 'true';
    } catch {
      this.isAiEnabled = false;
    }
    this.aiStatus = modelManager.getStatus();
    this.aiProgress = modelManager.getProgress();

    this.unsubscribeAiProgress = modelManager.onProgress((progress) => {
      this.aiProgress = progress;
      this.render();
    });

    this.unsubscribeAiStatus = modelManager.onStatusChange((status) => {
      this.aiStatus = status;
      this.render();
    });

    if (this.isAiEnabled && this.aiStatus !== 'ready') {
      modelManager.init().catch((err) => {
        console.warn('AI initialization failed:', err);
      });
    }

    // Fetch or create guest session
    this.currentUser = getCurrentUser();
    if (!this.currentUser) {
      this.currentUser = await createGuestSession();
    }

    this.render();
  }

  public unmount(): void {
    if (this.unsubscribeAiProgress) {
      this.unsubscribeAiProgress();
      this.unsubscribeAiProgress = undefined;
    }
    if (this.unsubscribeAiStatus) {
      this.unsubscribeAiStatus();
      this.unsubscribeAiStatus = undefined;
    }
    this.container.remove();
  }

  private render(): void {
    const isMuted = sound.isMuted();
    const displayName = this.currentUser?.display_name || 'Player';
    const isGuest = this.currentUser?.isGuest ?? true;
    const isAiDownloading = this.isAiEnabled && this.aiStatus === 'downloading';
    const isAiReady = this.isAiEnabled && this.aiStatus === 'ready';
    const progressPct = Math.round(this.aiProgress.progress);

    const playButtonDisabled = this.isLoading || isAiDownloading;
    const playButtonText = isAiDownloading
      ? `Downloading AI Brain (${progressPct}%)...`
      : this.isLoading
        ? 'Finding Match…'
        : 'Play Now';

    const createButtonDisabled = isAiDownloading;
    const createButtonText = isAiDownloading
      ? `Downloading AI Brain (${progressPct}%)...`
      : 'Create Room';

    this.container.innerHTML = `
      <div class="lobby-backdrop"></div>
      <div class="lobby-content">
        <!-- Top Navbar -->
        <header class="lobby-header">
          <div class="lobby-brand">
            <div class="logo-emblem">2</div>
            <div class="brand-text">
              <h1 class="brand-title">TJAPZA</h1>
              <span class="brand-sub">Capsa Banting · Big Two</span>
            </div>
          </div>

          <div class="header-actions">
            <button id="btn-how-to-play" class="btn-icon-text" title="How to Play Rules">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>Rules</span>
            </button>

            <button id="btn-sound-toggle" class="btn-icon" title="Toggle Sound">
              ${
                isMuted
                  ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/></svg>`
                  : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`
              }
            </button>

            <!-- Profile Badge -->
            <div class="profile-badge" id="profile-badge">
              <div class="profile-avatar">${escapeHtml(displayName.charAt(0).toUpperCase())}</div>
              <div class="profile-info">
                <div class="profile-name-row">
                  <span class="profile-name" id="profile-display-name">${escapeHtml(displayName)}</span>
                  <button id="btn-edit-name" class="btn-micro" title="Edit Name">✎</button>
                </div>
                <span class="profile-type">${isGuest ? 'Guest Account' : 'Online User'}</span>
              </div>
              <button id="btn-auth-menu" class="btn-auth-trigger">
                ${isGuest ? 'Log In' : 'Log Out'}
              </button>
            </div>
          </div>
        </header>

        <!-- Main Card Hub -->
        <main class="lobby-main">
          <!-- Advanced AI Bot Banner -->
          <div class="lobby-ai-banner">
            <div class="ai-banner-header">
              <label class="ai-toggle-label">
                <input type="checkbox" id="toggle-ai-bot" ${this.isAiEnabled ? 'checked' : ''} />
                <span class="ai-toggle-title">🧠 Advanced AI Bot</span>
              </label>
              ${isAiReady ? `<div class="ai-badge-ready">✓ Advanced AI Ready</div>` : ''}
            </div>
            ${
              isAiDownloading
                ? `
              <div class="ai-download-bar-wrap">
                <div class="ai-download-meta">
                  <span class="ai-stage-label">${escapeHtml(this.aiProgress.stage || 'Downloading AI Brain…')}</span>
                  <span class="ai-progress-numbers">
                    ${progressPct}%
                    ${
                      this.aiProgress.bytesLoaded && this.aiProgress.totalBytes
                        ? `(${formatBytes(this.aiProgress.bytesLoaded)} / ${formatBytes(this.aiProgress.totalBytes)})`
                        : ''
                    }
                  </span>
                </div>
                <div class="ai-progress-track">
                  <div class="ai-progress-fill" style="width: ${Math.max(0, Math.min(100, this.aiProgress.progress))}%;"></div>
                </div>
              </div>
            `
                : ''
            }
          </div>

          <div class="lobby-cards-grid">
            <!-- 1. Quick Play -->
            <div class="lobby-card card-quickplay">
              <div class="card-glow"></div>
              <div class="card-body">
                <div class="card-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                </div>
                <h2 class="card-title">Quick Match</h2>
                <p class="card-desc">Jump straight into a 4-player game. Bots will auto-fill any empty seats after 12s.</p>
                <button id="btn-quick-play" class="btn-primary btn-gold btn-lg ${this.isLoading || isAiDownloading ? 'loading' : ''}" ${playButtonDisabled ? 'disabled' : ''}>
                  ${playButtonText}
                </button>
              </div>
            </div>

            <!-- 2. Create Private Room -->
            <div class="lobby-card card-create">
              <div class="card-body">
                <div class="card-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>
                </div>
                <h2 class="card-title">Create Room</h2>
                <p class="card-desc">Generate a private 6-character room code to invite friends, or start with bots.</p>
                <button id="btn-create-room" class="btn-secondary btn-lg" ${createButtonDisabled ? 'disabled' : ''}>
                  ${createButtonText}
                </button>
              </div>
            </div>

            <!-- 3. Join with Code -->
            <div class="lobby-card card-join">
              <div class="card-body">
                <div class="card-icon-wrap">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d4af37" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg>
                </div>
                <h2 class="card-title">Join Room</h2>
                <p class="card-desc">Enter a 6-character room code provided by your friend.</p>
                <div class="join-input-group">
                  <input
                    type="text"
                    id="input-room-code"
                    placeholder="ROOM CODE"
                    maxlength="6"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button id="btn-join-room" class="btn-accent">Join</button>
                </div>
              </div>
            </div>
          </div>
        </main>

        <!-- Footer Info -->
        <footer class="lobby-footer">
          <span>Capsa Banting · Play with friends, or fill empty seats with bots</span>
        </footer>
      </div>

      <!-- Modals Container -->
      <div id="lobby-modal-root"></div>
    `;

    this.attachEvents();
  }

  private attachEvents(): void {
    // Sound toggle
    const btnSound = this.container.querySelector('#btn-sound-toggle');
    btnSound?.addEventListener('click', () => {
      sound.toggleMute();
      this.render();
    });

    // Rules modal
    const btnRules = this.container.querySelector('#btn-how-to-play');
    btnRules?.addEventListener('click', () => {
      sound.playClick();
      this.showRulesModal();
    });

    // Edit name button
    const btnEditName = this.container.querySelector('#btn-edit-name');
    btnEditName?.addEventListener('click', () => {
      sound.playClick();
      this.showEditNameModal();
    });

    // Auth trigger (Log in or Log out)
    const btnAuth = this.container.querySelector('#btn-auth-menu');
    btnAuth?.addEventListener('click', () => {
      sound.playClick();
      if (this.currentUser?.isGuest) {
        this.showAuthModal();
      } else {
        logout();
        toast.info('Logged out. Switched to guest mode.');
        createGuestSession().then((u) => {
          this.currentUser = u;
          this.render();
        });
      }
    });

    // AI Bot Toggle
    const toggleAi = this.container.querySelector('#toggle-ai-bot') as HTMLInputElement | null;
    toggleAi?.addEventListener('change', (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      this.isAiEnabled = checked;
      try {
        localStorage.setItem('tjapza_enable_ai_bot', checked ? 'true' : 'false');
      } catch (err) {
        console.warn('Failed to save AI bot preference to localStorage:', err);
      }
      if (checked) {
        modelManager.init().catch((err) => {
          console.warn('AI initialization failed:', err);
        });
      }
      this.render();
    });

    const isAiDownloading = this.isAiEnabled && this.aiStatus === 'downloading';

    // Quick Play
    const btnQuickPlay = this.container.querySelector('#btn-quick-play');
    btnQuickPlay?.addEventListener('click', async () => {
      if (this.isLoading || isAiDownloading) return;
      sound.playClick();
      this.isLoading = true;
      this.render();

      try {
        toast.info('Searching for available table…');
        const res = await quickPlay();
        this.callbacks.onGameJoined(res.game, res.seat_index);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to join quick match');
      } finally {
        this.isLoading = false;
        this.render();
      }
    });

    // Create Room
    const btnCreateRoom = this.container.querySelector('#btn-create-room');
    btnCreateRoom?.addEventListener('click', async () => {
      if (isAiDownloading) return;
      sound.playClick();
      try {
        toast.info('Creating private room…');
        const res = await createRoom(false);
        this.callbacks.onGameJoined(res.game, res.seat_index);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to create room');
      }
    });

    // Join Room
    const btnJoinRoom = this.container.querySelector('#btn-join-room');
    const inputRoomCode = this.container.querySelector('#input-room-code') as HTMLInputElement;

    const handleJoin = async () => {
      const code = inputRoomCode.value.trim().toUpperCase();
      if (!code) {
        toast.warning('Please enter a 6-character room code');
        inputRoomCode.focus();
        return;
      }
      sound.playClick();
      try {
        toast.info(`Joining room ${code}…`);
        const res = await joinRoom(code);
        this.callbacks.onGameJoined(res.game, res.seat_index);
      } catch (err: any) {
        toast.error(err?.message || 'Room not found or game already started');
      }
    };

    btnJoinRoom?.addEventListener('click', handleJoin);
    inputRoomCode?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleJoin();
    });
    inputRoomCode?.addEventListener('input', () => {
      inputRoomCode.value = inputRoomCode.value.toUpperCase();
    });
  }

  private showEditNameModal(): void {
    const modalRoot = this.container.querySelector('#lobby-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Edit Display Name</h3>
            <button class="modal-close" id="btn-close-name-modal">✕</button>
          </div>
          <div class="modal-body">
            <label class="modal-label">Your Name</label>
            <input
              type="text"
              id="input-display-name"
              class="modal-input"
              value="${this.currentUser?.display_name || ''}"
              maxlength="16"
            />
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" id="btn-cancel-name">Cancel</button>
            <button class="btn-primary" id="btn-save-name">Save Name</button>
          </div>
        </div>
      </div>
    `;

    const input = modalRoot.querySelector('#input-display-name') as HTMLInputElement;
    input.focus();
    input.select();

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#btn-close-name-modal')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#btn-cancel-name')?.addEventListener('click', closeModal);

    const saveName = async () => {
      const newName = input.value.trim();
      if (!newName) {
        toast.warning('Name cannot be empty');
        return;
      }
      try {
        await updateDisplayName(newName);
        if (this.currentUser) this.currentUser.display_name = newName;
        toast.success(`Display name updated to "${newName}"`);
        closeModal();
        this.render();
      } catch (err: any) {
        toast.error('Failed to update name');
      }
    };

    modalRoot.querySelector('#btn-save-name')?.addEventListener('click', saveName);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveName();
      if (e.key === 'Escape') closeModal();
    });
  }

  private showAuthModal(): void {
    const modalRoot = this.container.querySelector('#lobby-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card auth-modal">
          <div class="modal-header">
            <h3>Sign In / Create Account</h3>
            <button class="modal-close" id="btn-close-auth-modal">✕</button>
          </div>
          <div class="modal-body">
            <button id="btn-google-login" class="btn-oauth-google">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              <span>Continue with Google</span>
            </button>

            <div class="modal-divider"><span>OR</span></div>

            <div class="form-group">
              <label>Email</label>
              <input type="email" id="auth-email" class="modal-input" placeholder="you@example.com" />
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="auth-password" class="modal-input" placeholder="••••••••" />
            </div>

            <div class="auth-btn-row">
              <button id="btn-email-login" class="btn-primary">Sign In</button>
              <button id="btn-email-signup" class="btn-secondary">Create Account</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#btn-close-auth-modal')?.addEventListener('click', closeModal);

    // Google OAuth2
    modalRoot.querySelector('#btn-google-login')?.addEventListener('click', async () => {
      try {
        const u = await loginWithGoogle();
        this.currentUser = u;
        toast.success(`Welcome back, ${u.display_name}!`);
        closeModal();
        this.render();
      } catch (err: any) {
        toast.error('Google Sign-In cancelled or failed');
      }
    });

    // Email login
    modalRoot.querySelector('#btn-email-login')?.addEventListener('click', async () => {
      const email = (modalRoot.querySelector('#auth-email') as HTMLInputElement).value.trim();
      const pass = (modalRoot.querySelector('#auth-password') as HTMLInputElement).value;
      if (!email || !pass) {
        toast.warning('Please enter both email and password');
        return;
      }
      try {
        const u = await login(email, pass);
        this.currentUser = u;
        toast.success(`Logged in as ${u.display_name}`);
        closeModal();
        this.render();
      } catch (err: any) {
        toast.error(err?.message || 'Invalid email or password');
      }
    });

    // Email signup
    modalRoot.querySelector('#btn-email-signup')?.addEventListener('click', async () => {
      const email = (modalRoot.querySelector('#auth-email') as HTMLInputElement).value.trim();
      const pass = (modalRoot.querySelector('#auth-password') as HTMLInputElement).value;
      if (!email || !pass || pass.length < 8) {
        toast.warning('Password must be at least 8 characters');
        return;
      }
      try {
        const u = await signup(email, pass);
        this.currentUser = u;
        toast.success(`Account created! Welcome, ${u.display_name}`);
        closeModal();
        this.render();
      } catch (err: any) {
        toast.error(err?.message || 'Failed to create account');
      }
    });
  }

  private showRulesModal(): void {
    const modalRoot = this.container.querySelector('#lobby-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card rules-modal">
          <div class="modal-header">
            <h3>How to Play Capsa Banting (Big Two)</h3>
            <button class="modal-close" id="btn-close-rules-modal">✕</button>
          </div>
          <div class="modal-body rules-content">
            <h4>1. Objective</h4>
            <p>Shed all 13 cards in your hand before your opponents. The first player to empty their hand wins 1st Place!</p>

            <h4>2. Card Hierarchy</h4>
            <p><strong>Ranks (Low to High):</strong> 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, <strong>2 (Highest)</strong></p>
            <p><strong>Suits (Low to High):</strong> ♦ Diamonds &lt; ♣ Clubs &lt; ♥ Hearts &lt; ♠ Spades</p>

            <h4>3. Opening Play</h4>
            <p>The player holding <strong>3♦</strong> must open the first trick of the game with a combination containing 3♦.</p>

            <h4>4. Legal Combinations</h4>
            <ul>
              <li><strong>Single:</strong> 1 card. Compared by rank, then suit.</li>
              <li><strong>Pair:</strong> 2 cards of identical rank. Compared by rank, then highest suit.</li>
              <li><strong>5-Card Combinations</strong> (Ranked from lowest to highest):
                <ol>
                  <li><strong>Straight:</strong> 5 consecutive cards (e.g. A-2-3-4-5 up to J-Q-K-A-2).</li>
                  <li><strong>Flush:</strong> 5 cards of the same suit.</li>
                  <li><strong>Full House:</strong> 3 of a kind + 1 pair. Compared by 3-of-a-kind rank.</li>
                  <li><strong>Four of a Kind:</strong> 4 of a kind + 1 kicker card.</li>
                  <li><strong>Straight Flush:</strong> 5 consecutive cards of the same suit.</li>
                </ol>
              </li>
            </ul>

            <h4>5. Trick Lifecycle & Passing</h4>
            <p>Follow clockwise. Players must play a higher combination of the same type (or higher 5-card category). You may pass at any time. When all other players pass consecutively, the trick clears and the winner leads a fresh hand.</p>
          </div>
          <div class="modal-footer">
            <button class="btn-primary" id="btn-got-it">Got it!</button>
          </div>
        </div>
      </div>
    `;

    const closeModal = () => {
      modalRoot.innerHTML = '';
    };

    modalRoot.querySelector('#btn-close-rules-modal')?.addEventListener('click', closeModal);
    modalRoot.querySelector('#btn-got-it')?.addEventListener('click', closeModal);
  }
}
