import { describe, expect, test } from 'bun:test';
import { isStaleGameSnapshot, shouldShowPlayOnPile } from './tableSync';

describe('isStaleGameSnapshot', () => {
  test('drops a snapshot older than the one already applied', () => {
    expect(isStaleGameSnapshot('2026-08-20 12:00:02.000Z', '2026-08-20 12:00:01.000Z')).toBe(true);
  });

  test('applies a newer snapshot', () => {
    expect(isStaleGameSnapshot('2026-08-20 12:00:01.000Z', '2026-08-20 12:00:02.000Z')).toBe(false);
  });

  test('applies a same-timestamp snapshot so a trick-clear in the same second is not dropped', () => {
    // Rapid bot passes later in the game can share an `updated` second/ms.
    // Treating equality as stale leaves last_combo on screen after the winner
    // already has the lead again.
    expect(
      isStaleGameSnapshot('2026-08-20 12:00:01.123Z', '2026-08-20 12:00:01.123Z')
    ).toBe(false);
  });
});

describe('shouldShowPlayOnPile', () => {
  const winningPlay = [40]; // e.g. 2♠

  test('does not resurrect a discarded pile when a late play SSE arrives after trick conclusion', () => {
    // Winner already has the lead (last_combo cleared). The play that won the
    // trick is delivered afterwards and must not put those cards back.
    expect(
      shouldShowPlayOnPile({
        lastCombo: null,
        moveCards: winningPlay,
        moveCreated: '2026-08-20 12:00:01.000Z',
        gameUpdated: '2026-08-20 12:00:02.000Z',
      })
    ).toBe(false);
  });

  test('does not resurrect a discarded pile when the concluding play shares the clear timestamp', () => {
    expect(
      shouldShowPlayOnPile({
        lastCombo: null,
        moveCards: winningPlay,
        moveCreated: '2026-08-20 12:00:02.000Z',
        gameUpdated: '2026-08-20 12:00:02.000Z',
      })
    ).toBe(false);
  });

  test('still shows a new lead whose game snapshot has not arrived yet', () => {
    expect(
      shouldShowPlayOnPile({
        lastCombo: null,
        moveCards: [8],
        moveCreated: '2026-08-20 12:00:03.000Z',
        gameUpdated: '2026-08-20 12:00:02.000Z',
      })
    ).toBe(true);
  });

  test('shows a play that matches the authoritative pile', () => {
    expect(
      shouldShowPlayOnPile({
        lastCombo: { cards: winningPlay },
        moveCards: winningPlay,
        moveCreated: '2026-08-20 12:00:01.000Z',
        gameUpdated: '2026-08-20 12:00:01.000Z',
      })
    ).toBe(true);
  });

  test('does not overlay a stale play from a previous trick onto a newer pile', () => {
    expect(
      shouldShowPlayOnPile({
        lastCombo: { cards: [12, 13] },
        moveCards: winningPlay,
        moveCreated: '2026-08-20 12:00:01.000Z',
        gameUpdated: '2026-08-20 12:00:03.000Z',
      })
    ).toBe(false);
  });
});
