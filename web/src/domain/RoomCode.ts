/**
 * Pure Value Object for Room Codes.
 * Generates and validates unambiguous uppercase room codes.
 */
export class RoomCode {
  // Unambiguous character set (omits 0, O, 1, I, L)
  public static readonly CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  public static readonly CODE_LENGTH = 6;

  public readonly value: string;

  constructor(code: string) {
    const cleaned = RoomCode.clean(code);
    this.value = cleaned;
  }

  public static clean(input: string): string {
    return (input || '').trim().toUpperCase();
  }

  public static isValid(code: string): boolean {
    const cleaned = RoomCode.clean(code);
    if (cleaned.length !== RoomCode.CODE_LENGTH) return false;
    for (let i = 0; i < cleaned.length; i++) {
      if (RoomCode.CHARSET.indexOf(cleaned[i]) === -1) {
        return false;
      }
    }
    return true;
  }

  public static generate(randomFn: () => number = Math.random): RoomCode {
    let code = '';
    for (let i = 0; i < RoomCode.CODE_LENGTH; i++) {
      const idx = Math.floor(randomFn() * RoomCode.CHARSET.length);
      code += RoomCode.CHARSET.charAt(idx);
    }
    return new RoomCode(code);
  }

  public toString(): string {
    return this.value;
  }
}
