export interface SeatProps {
  index: number;
  userId?: string | null;
  user_id?: string | null;
  name: string;
  isBot?: boolean;
  is_bot?: boolean;
  connected?: boolean;
  cardCount?: number;
  card_count?: number;
}

export class Seat {
  public readonly index: number;
  public readonly userId: string | null;
  public readonly name: string;
  public readonly isBot: boolean;
  public readonly connected: boolean;
  public readonly cardCount: number;
  public readonly isHuman: boolean;
  public readonly isOccupied: boolean;
  public readonly isReady: boolean;
  public readonly initial: string;

  constructor(props: SeatProps) {
    this.index = props.index;
    this.userId = props.userId ?? props.user_id ?? null;
    const isBot = Boolean(props.isBot ?? props.is_bot);
    this.name = (props.name || '').trim() || (isBot ? `Bot ${props.index + 1}` : `Seat ${props.index + 1}`);
    this.isBot = isBot;
    this.connected = props.connected !== undefined ? Boolean(props.connected) : true;
    this.cardCount = props.cardCount ?? props.card_count ?? 13;

    this.isHuman = !this.isBot && this.userId !== null;
    this.isOccupied = this.isBot || this.userId !== null;
    this.isReady = this.isBot || (this.connected && this.userId !== null);
    this.initial = this.name.charAt(0).toUpperCase() || '?';
  }

  public toJSON(): { user_id: string | null; name: string; is_bot: boolean; connected: boolean } {
    return {
      user_id: this.userId,
      name: this.name,
      is_bot: this.isBot,
      connected: this.connected,
    };
  }

  public withCardCount(count: number): Seat {
    return new Seat({
      index: this.index,
      userId: this.userId,
      name: this.name,
      isBot: this.isBot,
      connected: this.connected,
      cardCount: count,
    });
  }

  public withConnection(connected: boolean): Seat {
    return new Seat({
      index: this.index,
      userId: this.userId,
      name: this.name,
      isBot: this.isBot,
      connected,
      cardCount: this.cardCount,
    });
  }

  public static createEmpty(index: number): Seat {
    return new Seat({
      index,
      userId: null,
      name: `Seat ${index + 1}`,
      isBot: false,
      connected: false,
      cardCount: 0,
    });
  }

  public static createBot(index: number, name?: string): Seat {
    return new Seat({
      index,
      userId: null,
      name: name ?? `Bot ${index + 1}`,
      isBot: true,
      connected: true,
      cardCount: 13,
    });
  }
}

/** Four seats from a game snapshot (DTO seats + counts). Empty slots become vacant. */
export function seatsFromSnapshot(
  seats: Array<SeatProps | Record<string, any> | null | undefined> | undefined,
  counts?: number[]
): Seat[] {
  const out: Seat[] = [];
  for (let i = 0; i < 4; i++) {
    const s = seats?.[i];
    out.push(
      s
        ? new Seat({
            index: i,
            userId: s.userId ?? s.user_id ?? null,
            name: s.name ?? '',
            isBot: s.isBot ?? s.is_bot,
            connected: s.connected,
            cardCount: counts?.[i] ?? s.cardCount ?? s.card_count ?? 0,
          })
        : Seat.createEmpty(i)
    );
  }
  return out;
}
