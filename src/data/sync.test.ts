// 擬似的な IndexedDB を用意してから、同期の中核を通しで動かす
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CONFIG_PATH,
  RECORDS_PREFIX,
  STAFF_PATH,
  TERMS_PATH,
  mergeConfig,
  recordsPath,
  sharedConfig,
  syncAll,
} from './sync';
import type { RemoteStore } from './sync';
import { STORE_RECORDS, STORE_STAFF, STORE_TERMS, clearStores, getAll, put } from './db';
import { loadConfig, patchConfig, saveConfig } from './repository';
import { DEFAULT_CONFIG } from '../domain/types';
import type { AttendanceRecord, Config, Staff } from '../domain/types';

/** その場かぎりの保存先。Google Drive の代わりに使う */
function memoryStore(initial: Record<string, unknown> = {}): RemoteStore & {
  files: Record<string, unknown>;
} {
  const files: Record<string, unknown> = { ...initial };
  return {
    files,
    read: async (path) => (path in files ? files[path] : null),
    write: async (path, data) => {
      files[path] = data;
    },
    listRecordMonths: async () =>
      Object.keys(files)
        .filter((path) => path.startsWith(RECORDS_PREFIX))
        .map((path) => path.slice(RECORDS_PREFIX.length, -'.json'.length)),
  };
}

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'r1',
    termId: 't1',
    staffId: 's1',
    date: '2026-08-20',
    kind: 'actual',
    startTime: '08:00',
    endTime: '17:00',
    workPlace: '第一圃場',
    breakMinutes: 0,
    hourlyWage: 1200,
    updatedAt: '2026-08-20T09:00:00.000Z',
    deleted: false,
    ...over,
  };
}

function staff(over: Partial<Staff> = {}): Staff {
  return {
    id: 's1',
    name: '田中 太郎',
    hourlyWage: 1200,
    active: true,
    updatedAt: '2026-08-01T00:00:00.000Z',
    deleted: false,
    ...over,
  };
}

beforeEach(async () => {
  await clearStores([STORE_RECORDS, STORE_STAFF, STORE_TERMS]);
  await saveConfig({ ...DEFAULT_CONFIG });
});

describe('sharedConfig', () => {
  it('端末ごとの値は送らない', async () => {
    const config: Config = {
      ...DEFAULT_CONFIG,
      businessName: '〇〇農園',
      lastSyncedAt: '2026-08-29T00:00:00.000Z',
      drive: { status: 'connected', accountName: 'me@example.com', folderName: '出勤簿' },
    };
    const shared = sharedConfig(config);
    expect(shared).toHaveProperty('businessName', '〇〇農園');
    expect(shared).not.toHaveProperty('lastSyncedAt');
    expect(shared).not.toHaveProperty('drive');
  });
});

describe('mergeConfig', () => {
  const local: Config = {
    ...DEFAULT_CONFIG,
    businessName: '手元の名前',
    updatedAt: '2026-08-10T00:00:00.000Z',
  };

  it('相手が新しければ相手を採る', () => {
    const merged = mergeConfig(local, {
      businessName: '相手の名前',
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    expect(merged.businessName).toBe('相手の名前');
  });

  it('相手が古ければ手元を残す', () => {
    const merged = mergeConfig(local, {
      businessName: '相手の名前',
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    expect(merged.businessName).toBe('手元の名前');
  });

  it('相手のファイルが無ければ手元のまま', () => {
    expect(mergeConfig(local, null).businessName).toBe('手元の名前');
  });

  it('端末ごとの値は相手の内容で上書きしない', () => {
    const withDevice: Config = { ...local, lastSyncedAt: '2026-08-09T00:00:00.000Z' };
    const merged = mergeConfig(withDevice, {
      businessName: '相手の名前',
      updatedAt: '2026-08-11T00:00:00.000Z',
      lastSyncedAt: '1999-01-01T00:00:00.000Z',
    });
    expect(merged.lastSyncedAt).toBe('2026-08-09T00:00:00.000Z');
  });
});

describe('syncAll', () => {
  it('保存先が空なら手元の内容を送る', async () => {
    await put(STORE_STAFF, staff());
    await put(STORE_RECORDS, record());
    const remote = memoryStore();

    const result = await syncAll(remote, new Date('2026-08-29T10:00:00.000Z'));

    expect(remote.files[STAFF_PATH]).toHaveLength(1);
    expect(remote.files[recordsPath('2026-08')]).toHaveLength(1);
    expect(result.syncedAt).toBe('2026-08-29T10:00:00.000Z');
    expect((await loadConfig()).lastSyncedAt).toBe('2026-08-29T10:00:00.000Z');
  });

  it('相手にしか無い記録を取り込む', async () => {
    const remote = memoryStore({
      [STAFF_PATH]: [staff()],
      [recordsPath('2026-08')]: [record({ id: 'remote-1' })],
    });

    await syncAll(remote);

    const local = await getAll<AttendanceRecord>(STORE_RECORDS);
    expect(local.map((r) => r.id)).toEqual(['remote-1']);
    expect(await getAll<Staff>(STORE_STAFF)).toHaveLength(1);
  });

  it('2 台が別々の行を触っていても、どちらも消えない', async () => {
    // 手元で 8/20 を修正、相手は 8/21 を追加していた状況
    await put(STORE_RECORDS, record({ id: 'a', updatedAt: '2026-08-29T09:00:00.000Z' }));
    const remote = memoryStore({
      [recordsPath('2026-08')]: [
        record({ id: 'a', workPlace: '古い値', updatedAt: '2026-08-20T09:00:00.000Z' }),
        record({ id: 'b', date: '2026-08-21' }),
      ],
    });

    const result = await syncAll(remote);

    const local = await getAll<AttendanceRecord>(STORE_RECORDS);
    expect(local.map((r) => r.id).sort()).toEqual(['a', 'b']);
    // 新しい方（手元）が残る
    expect(local.find((r) => r.id === 'a')?.workPlace).toBe('第一圃場');
    expect(result.pulled).toBeGreaterThan(0);
    expect(result.pushed).toBeGreaterThan(0);
  });

  it('相手が新しければ手元を上書きする', async () => {
    await put(STORE_RECORDS, record({ workPlace: '古い値', updatedAt: '2026-08-20T09:00:00.000Z' }));
    const remote = memoryStore({
      [recordsPath('2026-08')]: [
        record({ workPlace: '新しい値', updatedAt: '2026-08-29T09:00:00.000Z' }),
      ],
    });

    await syncAll(remote);

    const local = await getAll<AttendanceRecord>(STORE_RECORDS);
    expect(local[0].workPlace).toBe('新しい値');
  });

  it('論理削除が相手にも伝わり、同期で復活しない', async () => {
    await put(STORE_RECORDS, record({ deleted: true, updatedAt: '2026-08-29T09:00:00.000Z' }));
    const remote = memoryStore({
      [recordsPath('2026-08')]: [record({ updatedAt: '2026-08-20T09:00:00.000Z' })],
    });

    await syncAll(remote);

    const local = await getAll<AttendanceRecord>(STORE_RECORDS);
    expect(local[0].deleted).toBe(true);
    expect((remote.files[recordsPath('2026-08')] as AttendanceRecord[])[0].deleted).toBe(true);
  });

  it('月をまたぐ記録はファイルを分けて置く', async () => {
    await put(STORE_RECORDS, record({ id: 'a', date: '2026-08-20' }));
    await put(STORE_RECORDS, record({ id: 'b', date: '2026-09-02' }));

    const result = await syncAll(memoryStore());

    expect(result.files).toContain(recordsPath('2026-08'));
    expect(result.files).toContain(recordsPath('2026-09'));
  });

  it('相手にしか無い月のファイルも読みに行く', async () => {
    const remote = memoryStore({
      [recordsPath('2026-07')]: [record({ id: 'old', date: '2026-07-15' })],
    });

    await syncAll(remote);

    const local = await getAll<AttendanceRecord>(STORE_RECORDS);
    expect(local.map((r) => r.id)).toEqual(['old']);
  });

  it('設定も同期し、事業者名が相手から届く', async () => {
    const remote = memoryStore({
      [CONFIG_PATH]: { businessName: '相手の名前', updatedAt: '2030-01-01T00:00:00.000Z' },
    });

    await syncAll(remote);

    expect((await loadConfig()).businessName).toBe('相手の名前');
  });

  it('接続状態だけを変えても、相手の設定を上書きしない', async () => {
    await patchConfig({ businessName: '手元の名前' });
    const afterEdit = await loadConfig();
    // 接続状態は端末ごとの値なので、触っても共有設定の更新時刻は進めない
    await patchConfig({ drive: { status: 'connected', accountName: 'me', folderName: '出勤簿' } });
    expect((await loadConfig()).updatedAt).toBe(afterEdit.updatedAt);
  });

  it('期の一覧も同期する', async () => {
    const remote = memoryStore({
      [TERMS_PATH]: [
        {
          id: 't9',
          name: '相手が作った期',
          startDate: '2026-01-01',
          closedDate: null,
          updatedAt: '2026-01-01T00:00:00.000Z',
          deleted: false,
        },
      ],
    });

    await syncAll(remote);

    expect((await getAll(STORE_TERMS)).map((t) => (t as { id: string }).id)).toEqual(['t9']);
  });
});
