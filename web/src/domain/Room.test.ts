import { describe, expect, test } from 'bun:test';
import { Room, RoomCode, Seat } from './index';

describe('Room & RoomCode & Seat Entities', () => {
  test('RoomCode generates 6-char uppercase unambiguous string and validates', () => {
    const code = RoomCode.generate();
    expect(code.value.length).toBe(6);
    expect(RoomCode.isValid(code.value)).toBe(true);
    expect(RoomCode.isValid('ABC')).toBe(false);
    expect(RoomCode.isValid('INVALID!')).toBe(false);
  });

  test('Room determines host as lowest connected human and checks start permission', () => {
    const room = new Room({
      code: 'XYZ123',
      seats: [
        Seat.createBot(0),
        new Seat({ index: 1, userId: 'u1', name: 'Alice', isBot: false, connected: true }),
        new Seat({ index: 2, userId: 'u2', name: 'Bob', isBot: false, connected: true }),
        Seat.createEmpty(3),
      ],
    });

    expect(room.hostSeatIndex).toBe(1);
    expect(room.isHost(1)).toBe(true);
    expect(room.isHost(2)).toBe(false);
    expect(room.canStart(1).allowed).toBe(true);
    expect(room.canStart(2).allowed).toBe(false);
    expect(room.humanCount).toBe(2);
    expect(room.botCount).toBe(1);
    expect(room.isFull).toBe(false);

    const filled = room.withFilledBots();
    expect(filled.isFull).toBe(true);
    expect(filled.botCount).toBe(2);
  });
});
