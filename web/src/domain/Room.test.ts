import { describe, expect, test } from 'bun:test';
import { Room, RoomCode, Seat, seatsFromSnapshot } from './index';

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

  test('seatsFromSnapshot maps DTO seats and counts into four Seat entities', () => {
    const seats = seatsFromSnapshot(
      [
        { user_id: 'u1', name: 'Alice', is_bot: false, connected: true },
        { user_id: null, name: 'Bot 2', is_bot: true, connected: true },
        null,
      ],
      [10, 13, 0, 7]
    );
    expect(seats).toHaveLength(4);
    expect(seats[0].userId).toBe('u1');
    expect(seats[0].cardCount).toBe(10);
    expect(seats[1].isBot).toBe(true);
    expect(seats[2].isOccupied).toBe(false);
    expect(seats[3].isOccupied).toBe(false);
    expect(seats[3].cardCount).toBe(0);
  });
});
