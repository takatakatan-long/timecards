/**
 * レコード ID の採番。
 * 同期時にレコード単位でマージするため、端末をまたいで衝突しない UUID を使う。
 * crypto.randomUUID は https / localhost でのみ使えるので、それ以外では乱数から組み立てる。
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** レコードの updatedAt に入れる現在時刻 */
export function nowStamp(now: Date = new Date()): string {
  return now.toISOString();
}
