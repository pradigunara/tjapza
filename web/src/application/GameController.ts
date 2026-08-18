import {
  CardCombo,
  Hand,
  Trick,
  CapsaGame,
  type GameSeat,
} from '../domain';
import {
  playCards,
  passTurn,
  type GameRecord,
} from '../net/pb';
import { sound } from '../audio/sound';
import { toast } from '../ui/toast';

/**
 * Application Controller: Bridges pure Domain models with UI scenes & network I/O.
 */
export class GameController {
  private game: CapsaGame;
  private localHand: Hand;
  private localSeatIndex: number;

  constructor(initialGameRecord?: GameRecord, localSeatIndex = 0, handCards: number[] = []) {
    this.localSeatIndex = localSeatIndex;
    this.localHand = new Hand(handCards);
    this.game = initialGameRecord
      ? GameController.dtoToDomain(initialGameRecord)
      : new CapsaGame();
  }

  // --- State Mappers ---

  public static dtoToDomain(dto: GameRecord): CapsaGame {
    const seats: GameSeat[] = (dto.seats || []).map((s) => ({
      userId: s ? s.user_id : null,
      name: s ? s.name : '',
      isBot: Boolean(s && s.is_bot),
      connected: Boolean(s && s.connected),
    }));

    let lastCombo: CardCombo | null = null;
    if (dto.last_combo && dto.last_combo.cards && dto.last_combo.cards.length > 0) {
      lastCombo = CardCombo.evaluate(dto.last_combo.cards);
    }

    const trick = new Trick({
      lastCombo,
      leaderSeatIndex: dto.leader_index ?? 0,
      passedSeats: dto.passed_seats || [],
      passCount: dto.pass_count ?? 0,
      lastPlaySeatIndex: dto.last_combo?.seat_index ?? dto.leader_index ?? 0,
    });

    return new CapsaGame({
      id: dto.id,
      status: dto.status,
      seats,
      counts: dto.counts || [13, 13, 13, 13],
      turnIndex: dto.turn_index ?? 0,
      leaderIndex: dto.leader_index ?? 0,
      trick,
      winnerRanks: dto.winner_ranks || [],
      roomCode: dto.room_code || '',
      isPublic: dto.is_public ?? false,
    });
  }

  // --- State Updaters ---

  public updateGameFromDto(dto: GameRecord): void {
    this.game = GameController.dtoToDomain(dto);
  }

  public setLocalHand(cards: number[]): void {
    this.localHand = new Hand(cards);
  }

  public setLocalSeatIndex(seatIndex: number): void {
    this.localSeatIndex = seatIndex;
  }

  // --- Getters ---

  public get domainGame(): CapsaGame {
    return this.game;
  }

  public get domainHand(): Hand {
    return this.localHand;
  }

  public get isMyTurn(): boolean {
    return this.game.status === 'playing' && this.game.turnIndex === this.localSeatIndex;
  }

  public get isOpeningMove(): boolean {
    return this.game.isOpeningMove;
  }

  // --- Actions & Validation ---

  public canPlayCards(selectedCodes: number[]): { valid: boolean; reason?: string; combo?: CardCombo } {
    if (!this.isMyTurn) {
      return { valid: false, reason: 'Not your turn to play.' };
    }

    if (selectedCodes.length === 0) {
      return { valid: false, reason: 'Select cards to play.' };
    }

    const combo = CardCombo.evaluate(selectedCodes);
    if (!combo) {
      return { valid: false, reason: 'Selected cards do not form a valid combination.' };
    }

    if (!this.localHand.hasCards(selectedCodes)) {
      return { valid: false, reason: 'Cards are not in your hand.' };
    }

    if (this.game.isOpeningMove && !combo.containsCardCode(0)) {
      return { valid: false, reason: 'Opening play must contain 3♦.' };
    }

    if (this.game.trick.lastCombo && !combo.canBeat(this.game.trick.lastCombo)) {
      return { valid: false, reason: `Cannot beat ${this.game.trick.lastCombo.description}.` };
    }

    return { valid: true, combo };
  }

  public canPassTurn(): { valid: boolean; reason?: string } {
    if (!this.isMyTurn) {
      return { valid: false, reason: 'Not your turn.' };
    }
    if (this.game.isOpeningMove) {
      return { valid: false, reason: 'Cannot pass on opening move.' };
    }
    if (this.game.trick.isFresh) {
      return { valid: false, reason: 'You are the trick leader and must play a card.' };
    }
    if (this.game.trick.hasPlayerPassed(this.localSeatIndex)) {
      return { valid: false, reason: 'You have already passed in this trick.' };
    }
    return { valid: true };
  }

  public findHintCombo(selectedCodes: number[] = []): CardCombo | null {
    const playable = this.localHand.findPlayableCombos(
      this.game.trick.lastCombo,
      this.game.isOpeningMove
    );

    if (playable.length === 0) return null;

    if (selectedCodes.length > 0) {
      const matching = playable.find((p) =>
        selectedCodes.every((code) => p.containsCardCode(code))
      );
      if (matching) return matching;
    }

    return playable[0];
  }

  // --- Network Move Execution ---

  public async executePlay(selectedCodes: number[]): Promise<boolean> {
    const check = this.canPlayCards(selectedCodes);
    if (!check.valid) {
      toast.warning(check.reason || 'Invalid play');
      return false;
    }

    try {
      await playCards(this.game.id, this.localSeatIndex, selectedCodes);
      this.localHand = this.localHand.remove(selectedCodes);
      sound.playCardSnap();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to play cards');
      return false;
    }
  }

  public async executePass(): Promise<boolean> {
    const check = this.canPassTurn();
    if (!check.valid) {
      toast.warning(check.reason || 'Cannot pass');
      return false;
    }

    try {
      await passTurn(this.game.id, this.localSeatIndex);
      sound.playPass();
      return true;
    } catch (err: any) {
      toast.error(err?.message || 'Failed to pass');
      return false;
    }
  }
}
