/**
 * 画面から呼ぶ Google Drive の操作。
 * 認証・保存先・同期処理をひとまとめにして、画面は状態と結果だけを見ればよいようにする。
 */
import {
  ReauthRequiredError,
  forgetToken,
  hasValidToken,
  isConfigured,
  requestToken,
  signOut,
} from './auth';
import { DriveStore, ROOT_FOLDER_NAME, fetchAccountName } from './store';
import { syncAll } from '../sync';
import type { SyncResult } from '../sync';
import { STORE_RECORDS, STORE_STAFF, STORE_TERMS, getAll } from '../db';
import { loadConfig, patchConfig } from '../repository';
import { changedSince } from '../merge';
import type { Config, DriveStatus, Syncable } from '../../domain/types';

export { ReauthRequiredError, isConfigured };

/**
 * 画面に出す接続状態。
 * 設定に残っている状態と、いま実際に許可を持っているかを突き合わせて決める。
 * 手動同期のため「繋がっているつもりで切れている」が起こり得るので、
 * 期限切れは未接続と分けて扱う。
 */
export function resolveDriveStatus(config: Config): DriveStatus {
  if (config.drive.status === 'disconnected') return 'disconnected';
  return hasValidToken() ? 'connected' : 'reauth';
}

/** Google アカウントに接続する。画面を出して許可を求める */
export async function connect(): Promise<Config> {
  await requestToken(true);
  const accountName = await fetchAccountName();
  return patchConfig({
    drive: { status: 'connected', accountName, folderName: ROOT_FOLDER_NAME },
  });
}

/** 接続を解除する。記録そのものは端末にも Drive にも残る */
export async function disconnect(): Promise<Config> {
  await signOut();
  return patchConfig({
    drive: { status: 'disconnected', accountName: null, folderName: null },
  });
}

/**
 * 同期する。自動では行わず、押されたときにだけ呼ぶ。
 * 許可が切れていれば、まず画面を出さずに取り直しを試みる。
 */
export async function runSync(): Promise<SyncResult> {
  try {
    if (!hasValidToken()) {
      // すでに許可済みなら、画面を出さずに取り直せる
      await requestToken(false);
    }
    const result = await syncAll(new DriveStore());
    await patchConfig({
      drive: { ...(await loadConfig()).drive, status: 'connected' },
    });
    return result;
  } catch (cause) {
    if (cause instanceof ReauthRequiredError) {
      forgetToken();
      const config = await loadConfig();
      await patchConfig({ drive: { ...config.drive, status: 'reauth' } });
    }
    throw cause;
  }
}

/**
 * まだ Drive に送っていない件数。
 * 手動同期なので押し忘れが起こる。ホームに出して気づけるようにする。
 */
export async function unsyncedCount(): Promise<number> {
  const config = await loadConfig();
  const [records, staff, terms] = await Promise.all([
    getAll<Syncable>(STORE_RECORDS),
    getAll<Syncable>(STORE_STAFF),
    getAll<Syncable>(STORE_TERMS),
  ]);
  return changedSince([...records, ...staff, ...terms], config.lastSyncedAt).length;
}
