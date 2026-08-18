import { Seat, type SeatProps } from './Seat';
import { RoomCode } from './RoomCode';

export interface RoomProps {
  id?: string;
  code: string | RoomCode;
  isPublic?: boolean;
  status?: 'waiting' | 'playing' | 'finished';
  seats?: (Seat | SeatProps | null | Record<string, any>)[];
}

/**
 * Pure Entity representing a Capsa Banting Game Room Lobby.
 */
export class Room {
  public readonly id: string;
  public readonly code: RoomCode;
  public readonly isPublic: boolean;
  public readonly status: 'waiting' | 'playing' | 'finished';
  public readonly seats: Seat[];
  public readonly hostSeatIndex: number;
  public readonly humanCount: number;
  public readonly botCount: number;
  public readonly isFull: boolean;

  constructor(props: RoomProps) {
    this.id = props.id ?? '';
    this.code = props.code instanceof RoomCode ? props.code : new RoomCode(props.code);
    this.isPublic = Boolean(props.isPublic);
    this.status = props.status ?? 'waiting';

    const rawSeats = props.seats ?? [];
    this.seats = [];
    let host = -1;
    let humans = 0;
    let bots = 0;

    for (let i = 0; i < 4; i++) {
      const s = rawSeats[i];
      let seatInstance: Seat;
      if (s instanceof Seat) {
        seatInstance = s;
      } else if (s != null && typeof s === 'object') {
        const obj = s as Record<string, any>;
        seatInstance = new Seat({
          index: obj.index ?? i,
          userId: obj.userId ?? obj.user_id ?? null,
          name: obj.name ?? '',
          isBot: obj.isBot ?? obj.is_bot ?? false,
          connected: obj.connected !== undefined ? Boolean(obj.connected) : true,
          cardCount: obj.cardCount ?? obj.card_count ?? 13,
        });
      } else {
        seatInstance = Seat.createEmpty(i);
      }

      this.seats.push(seatInstance);
      if (seatInstance.isHuman && seatInstance.connected && host === -1) {
        host = i;
      }
      if (seatInstance.isHuman && seatInstance.connected) {
        humans++;
      }
      if (seatInstance.isBot) {
        bots++;
      }
    }

    this.hostSeatIndex = host;
    this.humanCount = humans;
    this.botCount = bots;
    this.isFull = humans + bots === 4;
  }

  public isHost(seatIndex: number): boolean {
    return this.hostSeatIndex === seatIndex;
  }

  public get occupiedCount(): number {
    return this.seats.filter((s) => s.isOccupied).length;
  }

  public get firstAvailableSeatIndex(): number {
    for (let i = 0; i < this.seats.length; i++) {
      if (!this.seats[i].isOccupied) {
        return i;
      }
    }
    return -1;
  }

  public canStart(requestingSeatIndex: number): { allowed: boolean; reason?: string } {
    if (this.status !== 'waiting') {
      return { allowed: false, reason: 'Game has already started' };
    }
    if (this.hostSeatIndex !== requestingSeatIndex) {
      return { allowed: false, reason: 'Only the room host can start the match' };
    }
    if (this.humanCount === 0) {
      return { allowed: false, reason: 'At least one human player is required' };
    }
    return { allowed: true };
  }

  public withFilledBots(): Room {
    const nextSeats = this.seats.map((s, idx) => {
      if (!s.isOccupied) {
        return Seat.createBot(idx);
      }
      return s;
    });

    return new Room({
      id: this.id,
      code: this.code,
      isPublic: this.isPublic,
      status: this.status,
      seats: nextSeats,
    });
  }
}
