import PocketBase, { LocalAuthStore, type RecordModel } from 'pocketbase';

// Base URL detection: use environment variable or relative in production, fallback to 8090 in dev
const PB_URL =
  ((import.meta as any).env && (import.meta as any).env.VITE_PB_URL) ||
  (typeof window !== 'undefined' &&
  (window.location.port === '3000' || window.location.port === '5173')
    ? 'http://127.0.0.1:8090'
    : '/');

function getSessionStorageKey(): string {
  if (typeof window === 'undefined') return 'pb_auth';
  try {
    let tabId = window.sessionStorage.getItem('tjapza_tab_id');
    if (!tabId) {
      tabId = Math.random().toString(36).substring(2, 10);
      window.sessionStorage.setItem('tjapza_tab_id', tabId);
    }
    return `pb_auth_${tabId}`;
  } catch {
    return 'pb_auth';
  }
}

export const pb = new PocketBase(PB_URL, new LocalAuthStore(getSessionStorageKey()));
// Disable auto-cancellation so concurrent game ticks, hand fetches, and moves don't cancel each other
pb.autoCancellation(false);

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------

export interface SeatInfo {
  user_id: string | null;
  name: string;
  is_bot: boolean;
  connected: boolean;
}

export interface LastCombo {
  type: string;
  power: number;
  cards: number[];
  seat_index: number;
}

export interface GameRecord extends RecordModel {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  room_code: string;
  is_public: boolean;
  seats: (SeatInfo | null)[];
  turn_index: number;
  leader_index: number;
  last_combo: LastCombo | null;
  pass_count: number;
  passed_seats?: number[];
  counts: number[];
  turn_started_at: string;
  winner_ranks: number[];
  rematch_game_id?: string;
  created: string;
  updated: string;
}

export interface HandRecord extends RecordModel {
  id: string;
  game_id: string;
  user_id: string;
  seat_index: number;
  cards: number[];
}

export interface MoveRecord extends RecordModel {
  id: string;
  game_id: string;
  seat_index: number;
  action: 'play' | 'pass' | 'tick';
  cards: number[];
  combo_type: string;
  combo_power: number;
  created: string;
}

export interface ResultRecord extends RecordModel {
  id: string;
  game_id: string;
  user_id: string | null;
  seat_index: number;
  rank: number;
  is_bot: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string;
  name?: string;
  avatar?: string;
  isGuest?: boolean;
}

// -----------------------------------------------------------------------------
// Auth Helpers
// -----------------------------------------------------------------------------

function authUserFromRecord(rec: RecordModel): AuthUser {
  const email = rec.email || '';
  const isGuest = email.endsWith('@tjapza.local');
  return {
    id: rec.id,
    email,
    display_name:
      rec.display_name || rec.name || (isGuest ? 'Guest Player' : email.split('@')[0]) || 'Player',
    avatar: rec.avatar,
    isGuest,
  };
}

export function getCurrentUser(): AuthUser | null {
  if (!pb.authStore.isValid || !pb.authStore.record) {
    return null;
  }
  return authUserFromRecord(pb.authStore.record);
}

export function isLoggedIn(): boolean {
  return pb.authStore.isValid && !!pb.authStore.record;
}

export async function login(email: string, pass: string): Promise<AuthUser> {
  const authData = await pb.collection('users').authWithPassword(email, pass);
  return authUserFromRecord(authData.record);
}

export async function signup(email: string, pass: string, displayName?: string): Promise<AuthUser> {
  await pb.collection('users').create({
    email,
    password: pass,
    passwordConfirm: pass,
    display_name: displayName || email.split('@')[0],
  });
  return login(email, pass);
}

export async function createGuestSession(preferredName?: string): Promise<AuthUser> {
  // If already logged in as guest, reuse
  const current = getCurrentUser();
  if (current) {
    if (preferredName && preferredName !== current.display_name) {
      await updateDisplayName(preferredName);
      current.display_name = preferredName;
    }
    return current;
  }

  // Generate unique guest credentials
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const guestEmail = `guest_${randomSuffix}@tjapza.local`;
  const guestPass = `tjapza_guest_${randomSuffix}_${Date.now()}`;
  const guestName = preferredName?.trim() || `Player ${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await pb.collection('users').create({
      email: guestEmail,
      password: guestPass,
      passwordConfirm: guestPass,
      display_name: guestName,
    });
    return await login(guestEmail, guestPass);
  } catch (err) {
    console.warn('Guest creation fallback:', err);
    // In case of error (e.g. email collision), retry once
    const retrySuffix = Math.random().toString(36).substring(2, 9);
    const retryEmail = `guest_${retrySuffix}@tjapza.local`;
    const retryPass = `tjapza_pass_${retrySuffix}`;
    await pb.collection('users').create({
      email: retryEmail,
      password: retryPass,
      passwordConfirm: retryPass,
      display_name: guestName,
    });
    return await login(retryEmail, retryPass);
  }
}

export async function loginWithGoogle(): Promise<AuthUser> {
  const authData = await pb.collection('users').authWithOAuth2({ provider: 'google' });
  return authUserFromRecord(authData.record);
}

export async function updateDisplayName(name: string): Promise<void> {
  if (!pb.authStore.record) return;
  await pb.collection('users').update(pb.authStore.record.id, {
    display_name: name.trim(),
  });
}

export function logout(): void {
  pb.authStore.clear();
}

// -----------------------------------------------------------------------------
// Room & Matchmaking APIs
// -----------------------------------------------------------------------------

export async function ensureAuth(displayName?: string): Promise<AuthUser> {
  let user = getCurrentUser();
  if (!user) {
    user = await createGuestSession(displayName);
  }
  return user;
}

export async function createRoom(
  isPublic = false
): Promise<{ game: GameRecord; seat_index: number }> {
  await ensureAuth();
  const res = await pb.send<{ game: GameRecord; seat_index: number }>(
    '/api/tjapza/room/create',
    {
      method: 'POST',
      body: { is_public: isPublic },
    }
  );
  return res;
}

export async function joinRoom(
  codeOrId: string
): Promise<{ game: GameRecord; seat_index: number }> {
  await ensureAuth();
  const clean = codeOrId.trim();
  const isCode = clean.length === 6 && !clean.includes('-');
  const body = isCode ? { room_code: clean.toUpperCase() } : { game_id: clean };

  const res = await pb.send<{ game: GameRecord; seat_index: number }>(
    '/api/tjapza/room/join',
    {
      method: 'POST',
      body,
    }
  );
  return res;
}

export async function startGame(gameId: string): Promise<{ game: GameRecord }> {
  await ensureAuth();
  const res = await pb.send<{ game: GameRecord }>('/api/tjapza/room/start', {
    method: 'POST',
    body: { game_id: gameId },
  });
  return res;
}

export async function quickPlay(): Promise<{ game: GameRecord; seat_index: number }> {
  await ensureAuth();
  const res = await pb.send<{ game: GameRecord; seat_index: number }>(
    '/api/tjapza/quickplay',
    {
      method: 'POST',
    }
  );
  return res;
}

export async function rematch(gameId: string): Promise<{ game: GameRecord }> {
  await ensureAuth();
  const res = await pb.send<{ game: GameRecord }>('/api/tjapza/rematch', {
    method: 'POST',
    body: { game_id: gameId },
  });
  return res;
}

// -----------------------------------------------------------------------------
// In-Game Actions
// -----------------------------------------------------------------------------

export async function fetchGame(gameId: string): Promise<GameRecord> {
  return await pb.collection('games').getOne<GameRecord>(gameId);
}

export async function fetchPlayerHand(gameId: string, seatIndex: number): Promise<number[]> {
  try {
    const current = getCurrentUser();
    let filter = `game_id = "${gameId}" && seat_index = ${seatIndex}`;
    if (current?.id) {
      filter = `game_id = "${gameId}" && (seat_index = ${seatIndex} || user_id = "${current.id}")`;
    }
    const hand = await pb.collection('hands').getFirstListItem<HandRecord>(filter);
    return hand.cards || [];
  } catch (err) {
    return [];
  }
}

export async function fetchResults(gameId: string): Promise<ResultRecord[]> {
  try {
    return await pb.collection('results').getFullList<ResultRecord>({
      filter: `game_id = "${gameId}"`,
      sort: 'rank',
    });
  } catch (err) {
    return [];
  }
}

export async function fetchMoves(gameId: string): Promise<MoveRecord[]> {
  try {
    return await pb.collection('moves').getFullList<MoveRecord>({
      filter: `game_id = "${gameId}" && action != "tick"`,
      sort: 'created',
    });
  } catch (err) {
    return [];
  }
}

export async function playCards(
  gameId: string,
  seatIndex: number,
  cards: number[]
): Promise<MoveRecord> {
  return await pb.collection('moves').create<MoveRecord>({
    game_id: gameId,
    seat_index: seatIndex,
    action: 'play',
    cards,
  });
}

export async function passTurn(gameId: string, seatIndex: number): Promise<MoveRecord> {
  return await pb.collection('moves').create<MoveRecord>({
    game_id: gameId,
    seat_index: seatIndex,
    action: 'pass',
    cards: [],
  });
}

export async function sendTick(gameId: string, seatIndex: number): Promise<MoveRecord> {
  return await pb.collection('moves').create<MoveRecord>({
    game_id: gameId,
    seat_index: seatIndex >= 0 && seatIndex <= 3 ? seatIndex : 0,
    action: 'tick',
    cards: [],
  });
}

// -----------------------------------------------------------------------------
// Realtime SSE Subscriptions
// -----------------------------------------------------------------------------

export interface SubscriptionHandlers {
  onGameUpdate?: (game: GameRecord) => void;
  onMoveCreated?: (move: MoveRecord) => void;
  onHandUpdate?: (cards: number[]) => void;
}

export function subscribeToGame(
  gameId: string,
  localSeatIndex: number,
  handlers: SubscriptionHandlers
): () => void {
  let isUnsubscribed = false;

  // 1. Subscribe to specific game record
  pb.collection('games')
    .subscribe<GameRecord>(gameId, (e) => {
      if (isUnsubscribed) return;
      if (e.action === 'update' || e.action === 'create') {
        handlers.onGameUpdate?.(e.record);
      }
    })
    .catch((err) => console.warn('Games SSE subscribe error:', err));

  // 2. Subscribe to moves for this game
  pb.collection('moves')
    .subscribe<MoveRecord>('*', (e) => {
      if (isUnsubscribed) return;
      if (e.action === 'create' && e.record.game_id === gameId) {
        handlers.onMoveCreated?.(e.record);
      }
    })
    .catch((err) => console.warn('Moves SSE subscribe error:', err));

  // 3. Subscribe to hands for the local player
  pb.collection('hands')
    .subscribe<HandRecord>('*', (e) => {
      if (isUnsubscribed) return;
      if (
        (e.action === 'update' || e.action === 'create') &&
        e.record.game_id === gameId &&
        e.record.seat_index === localSeatIndex
      ) {
        handlers.onHandUpdate?.(e.record.cards || []);
      }
    })
    .catch((err) => console.warn('Hands SSE subscribe error:', err));

  // Return unsubscribe cleanup function
  return () => {
    isUnsubscribed = true;
    pb.collection('games').unsubscribe(gameId).catch(() => {});
    pb.collection('moves').unsubscribe('*').catch(() => {});
    pb.collection('hands').unsubscribe('*').catch(() => {});
  };
}

