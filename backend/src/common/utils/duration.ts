/**
 * Parses a short duration string (`900`, `30s`, `15m`, `24h`, `30d`) into
 * seconds.
 *
 * The JWT configuration (`JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`,
 * `WALLET_SESSION_EXPIRES_IN`) is expressed in this format, and the same
 * value has to be reported to clients as `expiresIn` seconds. Keeping one
 * parser means the token's real lifetime and the advertised lifetime cannot
 * disagree.
 *
 * A plain number is treated as seconds. An unparseable value falls back to
 * `fallbackSeconds` rather than silently issuing a token with no expiry.
 */
export function parseDurationToSeconds(
  value: string | number | undefined | null,
  fallbackSeconds: number,
): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : fallbackSeconds;
  }

  if (!value) {
    return fallbackSeconds;
  }

  const match = /^\s*(\d+)\s*([smhd]?)\s*$/i.exec(value);
  if (!match) {
    return fallbackSeconds;
  }

  const amount = Number.parseInt(match[1], 10);
  if (!Number.isFinite(amount) || amount <= 0) {
    return fallbackSeconds;
  }

  switch (match[2].toLowerCase()) {
    case 'd':
      return amount * 24 * 60 * 60;
    case 'h':
      return amount * 60 * 60;
    case 'm':
      return amount * 60;
    case 's':
    default:
      return amount;
  }
}
