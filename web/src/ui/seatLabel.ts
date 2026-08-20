export function seatDisplayName(
  seat: { name?: string; is_bot?: boolean } | null | undefined,
  seatIndex: number
): string {
  return seat?.name || (seat?.is_bot ? 'Bot' : `Seat ${seatIndex + 1}`);
}

export function formatSeatLabel(
  seatIndex: number,
  seat: { name?: string; is_bot?: boolean } | null | undefined,
  opts?: { you?: boolean }
): string {
  const label = `${seatIndex + 1} | ${seatDisplayName(seat, seatIndex)}`;
  return opts?.you ? `${label} (You)` : label;
}
