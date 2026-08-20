/**
 * Client table-sync helpers.
 *
 * Game snapshots and play-move SSE events can arrive out of order. After a
 * trick is won the authoritative `last_combo` is null (fresh lead). A late
 * play event from the concluded trick must not put those cards back in the
 * center pile — that is what makes the winner think they have not won yet.
 */

export type LastComboLike = { cards?: number[] } | null | undefined;

/** True when the DTO has cards on the center pile. Empty `cards` is no pile. */
export function hasPile(lastCombo: LastComboLike): boolean {
  return Boolean(lastCombo?.cards?.length);
}

/** Null when last_combo is missing or has no cards (discarded pile / fresh lead). */
export function effectiveLastCombo<T extends { cards?: number[] }>(
  lastCombo: T | null | undefined
): T | null {
  return hasPile(lastCombo) ? lastCombo! : null;
}

function sameCardSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort((x, y) => x - y);
  const bs = [...b].sort((x, y) => x - y);
  return as.every((c, i) => c === bs[i]);
}

/** True when `incomingUpdated` is strictly older than the snapshot already applied. */
export function isStaleGameSnapshot(
  currentUpdated?: string,
  incomingUpdated?: string
): boolean {
  if (!currentUpdated || !incomingUpdated) return false;
  return incomingUpdated < currentUpdated;
}

export function shouldShowPlayOnPile(opts: {
  lastCombo: { cards?: number[] } | null | undefined;
  moveCards: number[];
  moveCreated?: string;
  gameUpdated?: string;
}): boolean {
  const { lastCombo, moveCards, moveCreated, gameUpdated } = opts;
  const moveIsNewer = Boolean(moveCreated && gameUpdated && moveCreated > gameUpdated);

  if (hasPile(lastCombo)) {
    if (sameCardSet(lastCombo!.cards!, moveCards)) return true;
    // Different combo than the authoritative pile: overlay only if this play
    // is newer than the snapshot (the matching game update has not arrived).
    if (!moveCreated || !gameUpdated) return true;
    return moveIsNewer;
  }

  // Fresh lead / discarded pile. Only show if this play is strictly newer
  // than the snapshot that cleared the pile (a new lead in flight).
  return moveIsNewer;
}
