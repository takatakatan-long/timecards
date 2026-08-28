/**
 * JSON の入出力。
 *
 * Google Drive 上のファイル構成をそのまま表現する形にしてある。
 *   config.json / terms.json / staff.json / records/YYYY-MM.json
 * バックアップはこれらを 1 つのオブジェクトにまとめて書き出す。
 * JSON は BOM なし UTF-8。
 */
import {
  STORE_RECORDS,
  STORE_STAFF,
  STORE_TERMS,
  clearStores,
  getAll,
  putAll,
} from './db';
import { groupRecordsByMonth, loadConfig, saveConfig } from './repository';
import type { AttendanceRecord, Config, Staff, Term } from '../domain/types';

/** バックアップファイルの形。将来の形式変更に備えて version を持たせる */
export interface BackupFile {
  version: 1;
  exportedAt: string;
  config: Config;
  terms: Term[];
  staff: Staff[];
  /** キーは 'YYYY-MM'。Drive 上の records/YYYY-MM.json に対応する */
  records: Record<string, AttendanceRecord[]>;
}

export async function exportBackup(): Promise<BackupFile> {
  const [config, terms, staff, records] = await Promise.all([
    loadConfig(),
    getAll<Term>(STORE_TERMS),
    getAll<Staff>(STORE_STAFF),
    getAll<AttendanceRecord>(STORE_RECORDS),
  ]);
  const grouped: Record<string, AttendanceRecord[]> = {};
  for (const [month, monthRecords] of groupRecordsByMonth(records)) {
    grouped[month] = monthRecords;
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    config,
    terms,
    staff,
    records: grouped,
  };
}

/** ダウンロード用の文字列。BOM は付けない */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(text: string): BackupFile {
  const parsed = JSON.parse(text) as Partial<BackupFile>;
  if (parsed.version !== 1) {
    throw new Error('対応していないバックアップ形式です');
  }
  if (!parsed.config || !Array.isArray(parsed.terms) || !Array.isArray(parsed.staff)) {
    throw new Error('バックアップの中身が壊れています');
  }
  return parsed as BackupFile;
}

export function flattenRecords(backup: BackupFile): AttendanceRecord[] {
  return Object.values(backup.records ?? {}).flat();
}

/**
 * 復元。既存のデータを消してから入れ直す。
 * 誤操作の影響が大きいので、呼ぶ側で必ず確認を取ること。
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await clearStores([STORE_TERMS, STORE_STAFF, STORE_RECORDS]);
  await Promise.all([
    putAll(STORE_TERMS, backup.terms),
    putAll(STORE_STAFF, backup.staff),
    putAll(STORE_RECORDS, flattenRecords(backup)),
  ]);
  await saveConfig(backup.config);
}
