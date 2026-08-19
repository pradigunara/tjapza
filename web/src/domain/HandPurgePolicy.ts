/**
 * Ephemeral hand-cleanup contract shared with the PocketBase hooks
 * (pb/pb_hooks/domain.js is bundled from this barrel).
 *
 * A hand may be purged ONLY when its related game is explicitly finished or
 * waiting, or confirmed absent. Anything else — actively playing, an unknown
 * status, or an unresolved (transient) lookup — MUST keep the hand: deleting
 * hands of an actively playing game bricks human plays and bot ticks with
 * permanent hand-not-found loops. Deletion uses an allowlist, never a
 * denylist, so new/unknown statuses fail safe.
 */

/** status null = game record confirmed absent (deleted / dangling relation) */
export type HandGameResolution =
  | { resolved: true; status: string | null }
  /** lookup failed transiently — game state unknown, be conservative */
  | { resolved: false };

const PURGEABLE_GAME_STATUSES: Record<string, true> = {
  waiting: true,
  finished: true,
};

export function shouldPurgeHand(game: HandGameResolution): boolean {
  if (!game.resolved) return false;
  if (game.status === null) return true; // orphaned hand, game confirmed absent
  return PURGEABLE_GAME_STATUSES[game.status] === true;
}
