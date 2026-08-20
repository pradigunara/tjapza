import { describe, test, expect } from 'bun:test';
import {
  comboPill,
  hostSeatIndexFromSeats,
  lobbyCountdownSecs,
  tableHudHtml,
  type TableHudGame,
  type TableHudState,
} from './TableHud';
import { PUBLIC_LOBBY_AUTOSTART_MS } from '../domain';

function seat(name: string, userId: string | null = 'u1', isBot = false): TableHudGame['seats'][0] {
  return { user_id: userId, name, is_bot: isBot, connected: true };
}

function waitingGame(over: Partial<TableHudGame> = {}): TableHudGame {
  return {
    status: 'waiting',
    room_code: 'ABCD',
    is_public: false,
    seats: [seat('Ada', 'ada'), null, null, null],
    ...over,
  };
}

function playingGame(over: Partial<TableHudGame> = {}): TableHudGame {
  return {
    status: 'playing',
    room_code: 'ABCD',
    is_public: false,
    seats: [seat('Ada', 'ada'), seat('Bot', 'b1', true), seat('Bot2', 'b2', true), seat('Bot3', 'b3', true)],
    counts: [13, 13, 13, 13],
    turn_started_at: new Date().toISOString(),
    ...over,
  };
}

function hudState(over: Partial<TableHudState> = {}): TableHudState {
  return {
    game: waitingGame(),
    localSeatIndex: 0,
    isMyTurn: false,
    selectedCards: [],
    canPlay: false,
    canPass: false,
    isProcessingMove: false,
    soundMuted: false,
    ...over,
  };
}

describe('hostSeatIndexFromSeats', () => {
  test('first connected human is host', () => {
    expect(hostSeatIndexFromSeats([seat('Ada', 'ada'), seat('Bot', 'b', true), null, null])).toBe(0);
  });

  test('skips bots and empty seats', () => {
    expect(hostSeatIndexFromSeats([seat('Bot', 'b', true), null, seat('Bo', 'bo'), null])).toBe(2);
  });
});

describe('comboPill', () => {
  test('hidden when nothing is selected', () => {
    expect(comboPill([])).toEqual({ visible: false, text: '' });
  });

  test('names a classified combo', () => {
    const pill = comboPill([0]); // 3♦
    expect(pill.visible).toBe(true);
    expect(pill.text).toContain('1 cards');
    expect(pill.text.startsWith('✨ ')).toBe(true);
  });

  test('falls back for an unclassified selection', () => {
    const pill = comboPill([0, 4, 8]);
    expect(pill.visible).toBe(true);
    expect(pill.text).toBe('3 cards selected');
  });
});

describe('lobbyCountdownSecs', () => {
  test('counts down from public autostart window', () => {
    const created = new Date(1_000_000).toISOString();
    expect(lobbyCountdownSecs(created, 1_000_000)).toBe(PUBLIC_LOBBY_AUTOSTART_MS / 1000);
    expect(lobbyCountdownSecs(created, 1_000_000 + 25_000)).toBe(5);
    expect(lobbyCountdownSecs(created, 1_000_000 + PUBLIC_LOBBY_AUTOSTART_MS)).toBe(0);
  });
});

describe('tableHudHtml', () => {
  test('waiting host sees start button and room code, not the action bar', () => {
    const html = tableHudHtml(hudState());
    expect(html).toContain('Game Lobby');
    expect(html).toContain('ABCD');
    expect(html).toContain('btn-start-game');
    expect(html).toContain('Ada');
    expect(html).not.toContain('btn-action-play');
    expect(html).toContain('icon-sound-on');
  });

  test('waiting guest in a private room waits for the host by name', () => {
    const html = tableHudHtml(
      hudState({
        localSeatIndex: 1,
        game: waitingGame({
          seats: [seat('Ada', 'ada'), seat('Bo', 'bo'), null, null],
        }),
      })
    );
    expect(html).toContain('Waiting for host');
    expect(html).toContain('Ada');
    expect(html).not.toContain('btn-start-game');
    expect(html).not.toContain('quickplay-timer-sec');
  });

  test('waiting public guest sees autostart countdown and force-start', () => {
    const html = tableHudHtml(
      hudState({
        localSeatIndex: 1,
        game: waitingGame({
          is_public: true,
          seats: [seat('Ada', 'ada'), seat('Bo', 'bo'), null, null],
        }),
      })
    );
    expect(html).toContain('quickplay-timer-sec');
    expect(html).toContain('btn-force-start-game');
    expect(html).not.toContain('btn-start-game');
  });

  test('playing human table shows action bar and turn timer, not lobby', () => {
    const html = tableHudHtml(
      hudState({
        game: playingGame(),
        isMyTurn: true,
      })
    );
    expect(html).not.toContain('Game Lobby');
    expect(html).toContain('btn-action-play');
    expect(html).toContain('btn-action-pass');
    expect(html).toContain('turn-timer-text');
    expect(html).toContain('is-my-turn');
  });

  test('all-bot playing table shows fast-forward instead of the turn timer', () => {
    const html = tableHudHtml(
      hudState({
        game: playingGame({
          seats: [
            seat('B0', 'b0', true),
            seat('B1', 'b1', true),
            seat('B2', 'b2', true),
            seat('B3', 'b3', true),
          ],
        }),
      })
    );
    expect(html).toContain('Fast Forward');
    expect(html).not.toContain('turn-timer-text');
  });

  test('muted flag swaps the sound icon', () => {
    const html = tableHudHtml(hudState({ soundMuted: true }));
    expect(html).toContain('icon-sound-off');
    expect(html).not.toContain('icon-sound-on');
  });

  test('renders AI host badge when isAiReady is true', () => {
    const html = tableHudHtml(hudState({ isAiReady: true }));
    expect(html).toContain('table-ai-badge');
    expect(html).toContain('badge-ai-text');
    expect(html).toContain('AI');
  });

  test('does not render AI host badge when isAiReady is false or undefined', () => {
    const html = tableHudHtml(hudState({ isAiReady: false }));
    expect(html).not.toContain('table-ai-badge');
  });
});
