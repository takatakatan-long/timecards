/**
 * 手動同期の中核。
 *
 * Google Drive そのものには依存させず、読み書きの口（RemoteStore）だけを受け取る。
 * こうしておくと、Google に繋がなくても同期の筋道をテストできる。
 *
 * 競合はファイルごと上書きせず、レコード単位で updatedAt の新しい側を採る。
 * 2 台が別々の行を触っていても、どちらの入力も消えないようにするため。
 */
import {
  STORE_RECORDS,
  STORE_STAFF,
  STORE_TERMS,
  getAll,
  putAll,
} from './db';
import { loadConfig, saveConfig } from './repository';
import { mergeById } from './merge';
import { yearMonthOf } from '../domain/time';
import { SHARED_CONFIG_KEYS } from '../domain/types';
import type { AttendanceRecord, Config, Staff, Term } from '../domain/types';

/** Drive 上のファイル構成をそのまま表した読み書きの口 */
export interface RemoteStore {
  /** 無ければ null を返す */
  read(path: string): Promise<unknown | null>;
  write(path: string, data: unknown): Promise<void>;
  /** records/ にある 'YYYY-MM' の一覧 */
  listRecordMonths(): Promise<string[]>;
}

export interface SyncResult {
  /** 相手から取り込んだ件数 */
  pulled: number;
  /** こちらから送った件数 */
  pushed: number;
  /** 書き換えたファイル */
  files: string[];
  syncedAt: string;
}

export const CONFIG_PATH = 'config.json';
export const TERMS_PATH = 'terms.json';
export const STAFF_PATH = 'staff.json';

export const RECORDS_PREFIX = 'records/';

export function recordsPath(month: string): string {
  return `${RECORDS_PREFIX}${month}.json`;
}

/** 同期対象の設定だけを取り出す。接続状態や最終同期日時は端末ごとの値なので送らない */
export function sharedConfig(config: Config): Record<string, unknown> {
  const shared: Record<string, unknown> = { updatedAt: config.updatedAt };
  for (const key of SHARED_CONFIG_KEYS) {
    shared[key] = config[key];
  }
  return shared;
}

/** 設定は更新時刻の新しい側をまるごと採る（項目ごとの突き合わせはしない） */
export function mergeConfig(local: Config, remote: unknown): Config {
  if (!remote || typeof remote !== 'object') return local;
  const incoming = remote as Partial<Config>;
  if (!incoming.updatedAt || incoming.updatedAt <= local.updatedAt) return local;
  const merged: Config = { ...local, updatedAt: incoming.updatedAt };
  for (const key of SHARED_CONFIG_KEYS) {
    if (incoming[key] !== undefined) {
      // 型はキーごとに異なるが、対象は共有する設定のキーに限っている
      (merged as unknown as Record<string, unknown>)[key] = incoming[key];
    }
  }
  return merged;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * 全体を 1 度に同期する。
 * 押し忘れを避けるため自動では行わず、ユーザーが押したときにだけ呼ぶ。
 */
export async function syncAll(remote: RemoteStore, now: Date = new Date()): Promise<SyncResult> {
  const files: string[] = [];
  let pulled = 0;
  let pushed = 0;

  // ---- 設定
  const localConfig = await loadConfig();
  const mergedConfig = mergeConfig(localConfig, await remote.read(CONFIG_PATH));
  if (mergedConfig.updatedAt !== localConfig.updatedAt) pulled += 1;
  else if (localConfig.updatedAt !== '1970-01-01T00:00:00.000Z') pushed += 1;
  await remote.write(CONFIG_PATH, sharedConfig(mergedConfig));
  files.push(CONFIG_PATH);

  // ---- 期とスタッフ（論理削除も 1 つの更新として運ぶので、消したものも含めて送る）
  const localTerms = await getAll<Term>(STORE_TERMS);
  const termMerge = mergeById(localTerms, asArray<Term>(await remote.read(TERMS_PATH)));
  await putAll(STORE_TERMS, termMerge.merged);
  await remote.write(TERMS_PATH, termMerge.merged);
  files.push(TERMS_PATH);
  pulled += termMerge.incoming;
  pushed += termMerge.outgoing;

  const localStaff = await getAll<Staff>(STORE_STAFF);
  const staffMerge = mergeById(localStaff, asArray<Staff>(await remote.read(STAFF_PATH)));
  await putAll(STORE_STAFF, staffMerge.merged);
  await remote.write(STAFF_PATH, staffMerge.merged);
  files.push(STAFF_PATH);
  pulled += staffMerge.incoming;
  pushed += staffMerge.outgoing;

  // ---- 勤怠（月別ファイル。競合の範囲を月に閉じ込めるための分割）
  const localRecords = await getAll<AttendanceRecord>(STORE_RECORDS);
  const months = new Set<string>(await remote.listRecordMonths());
  for (const record of localRecords) {
    months.add(yearMonthOf(record.date));
  }

  const toStore: AttendanceRecord[] = [];
  for (const month of [...months].sort()) {
    const path = recordsPath(month);
    const mine = localRecords.filter((record) => yearMonthOf(record.date) === month);
    const merge = mergeById(mine, asArray<AttendanceRecord>(await remote.read(path)));
    await remote.write(path, merge.merged);
    files.push(path);
    toStore.push(...merge.merged);
    pulled += merge.incoming;
    pushed += merge.outgoing;
  }
  await putAll(STORE_RECORDS, toStore);

  const syncedAt = now.toISOString();
  await saveConfig({ ...mergedConfig, lastSyncedAt: syncedAt });

  return { pulled, pushed, files, syncedAt };
}
