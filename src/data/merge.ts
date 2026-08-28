/**
 * レコード単位のマージ。
 *
 * 同期は Google Drive のファイル単位で行うが、2 台の端末が別々の行を触っていた場合に
 * ファイルごと上書きすると片方の入力が消える。そこで id をキーに突き合わせ、
 * updatedAt の新しい方を採用する。
 *
 * 論理削除（deleted: true）も 1 つの更新として扱うため、削除が同期で復活しない。
 */
import type { Syncable } from '../domain/types';

export interface MergeResult<T> {
  merged: T[];
  /** 相手側の値を採用した件数。同期後の報告に使う */
  incoming: number;
  /** こちらの値を残した件数 */
  outgoing: number;
}

export function mergeById<T extends Syncable>(local: T[], remote: T[]): MergeResult<T> {
  const byId = new Map<string, T>();
  for (const item of local) {
    byId.set(item.id, item);
  }
  let incoming = 0;
  let outgoing = 0;
  for (const item of remote) {
    const mine = byId.get(item.id);
    if (!mine) {
      byId.set(item.id, item);
      incoming += 1;
      continue;
    }
    if (item.updatedAt > mine.updatedAt) {
      byId.set(item.id, item);
      incoming += 1;
    } else if (mine.updatedAt > item.updatedAt) {
      outgoing += 1;
    }
    // updatedAt が同じなら中身も同じとみなし、どちらも数えない
  }
  return { merged: [...byId.values()], incoming, outgoing };
}

/** 最後の同期以降に更新されたもの。同期の未反映件数の表示に使う */
export function changedSince<T extends Syncable>(
  items: T[],
  lastSyncedAt: string | null,
): T[] {
  if (!lastSyncedAt) return items;
  return items.filter((item) => item.updatedAt > lastSyncedAt);
}
