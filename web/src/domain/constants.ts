/**
 * Capsa Banting (Big Two) Domain Constants
 */

export type Suit = 0 | 1 | 2 | 3;
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const SUIT_DIAMONDS: Suit = 0;
export const SUIT_CLUBS: Suit = 1;
export const SUIT_HEARTS: Suit = 2;
export const SUIT_SPADES: Suit = 3;

export const RANK_3: Rank = 0;
export const RANK_4: Rank = 1;
export const RANK_5: Rank = 2;
export const RANK_6: Rank = 3;
export const RANK_7: Rank = 4;
export const RANK_8: Rank = 5;
export const RANK_9: Rank = 6;
export const RANK_10: Rank = 7;
export const RANK_J: Rank = 8;
export const RANK_Q: Rank = 9;
export const RANK_K: Rank = 10;
export const RANK_A: Rank = 11;
export const RANK_2: Rank = 12;

export const CARD_3D = 0; // 3♦ (Rank 0, Suit 0)

export const SUIT_SYMBOLS = ['♦', '♣', '♥', '♠'] as const;
export const SUIT_NAMES = ['D', 'C', 'H', 'S'] as const;
export const RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;

export type ComboType =
  | 'single'
  | 'pair'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'quads'
  | 'straight_flush';

export const CATEGORY_TIERS: Record<ComboType, number> = {
  single: 0,
  pair: 0,
  straight: 1,
  flush: 2,
  full_house: 3,
  quads: 4,
  straight_flush: 5,
};

// Game Timing Constants
export const TURN_TIMEOUT_SECS = 60; // 60s human turn timer
export const TURN_TIMEOUT_MS = TURN_TIMEOUT_SECS * 1000; // 60,000 ms
export const PUBLIC_LOBBY_AUTOSTART_SECS = 30; // 30s public lobby auto-fill countdown
export const PUBLIC_LOBBY_AUTOSTART_MS = PUBLIC_LOBBY_AUTOSTART_SECS * 1000; // 30,000 ms

/**
 * Safe JSON parser with fallback supporting strings, byte arrays (Goja types.JSONRaw), and objects.
 */
export function parseJSON<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  // Handle Goja types.JSONRaw byte arrays ([]byte)
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'number') {
    try {
      let str = '';
      for (let i = 0; i < val.length; i++) {
        str += String.fromCharCode(val[i]);
      }
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }
  if (typeof val === 'object') {
    return val as T;
  }
  return fallback;
}

