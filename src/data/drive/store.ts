/**
 * Google Drive を同期の保存先として使うための実装。
 * sync.ts の RemoteStore を満たす形にしてあるので、同期の筋道自体はここに依存しない。
 *
 * 置き方は仕様どおり。
 *   出勤簿/config.json  terms.json  staff.json  records/YYYY-MM.json
 */
import { ReauthRequiredError, currentToken, forgetToken } from './auth';
import { RECORDS_PREFIX } from '../sync';
import type { RemoteStore } from '../sync';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Drive 上の置き場所の名前。利用者が Drive を覗いたときに分かるようにしておく */
export const ROOT_FOLDER_NAME = '出勤簿';
export const RECORDS_FOLDER_NAME = 'records';

interface DriveFile {
  id: string;
  name: string;
}

async function call(path: string, init: RequestInit = {}, base = API): Promise<Response> {
  const token = currentToken();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    // 許可が切れている。手元の許可を捨てて、再認証を促す
    forgetToken();
    throw new ReauthRequiredError();
  }
  if (!response.ok) {
    throw new Error(`Google Drive との通信に失敗しました（${response.status}）`);
  }
  return response;
}

function quote(value: string): string {
  return value.replace(/'/g, "\\'");
}

async function findChild(name: string, parentId: string): Promise<DriveFile | null> {
  const query = `name='${quote(name)}' and '${parentId}' in parents and trashed=false`;
  const response = await call(
    `/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=10`,
  );
  const body = (await response.json()) as { files?: DriveFile[] };
  return body.files?.[0] ?? null;
}

async function createFolder(name: string, parentId: string): Promise<DriveFile> {
  const response = await call('/files?fields=id,name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return (await response.json()) as DriveFile;
}

async function ensureFolder(name: string, parentId: string): Promise<DriveFile> {
  return (await findChild(name, parentId)) ?? (await createFolder(name, parentId));
}

/**
 * JSON を 1 ファイルとして書き、そのファイルの id を返す。BOM は付けない。
 * 作成直後の id は応答から受け取る。検索し直すと、Drive 側の反映が遅れたときに
 * 見つからず、同じ名前のファイルを二重に作ってしまうため。
 */
async function writeJson(
  name: string,
  parentId: string,
  data: unknown,
  existingId: string | null,
): Promise<string> {
  const metadata = existingId ? {} : { name, parents: [parentId] };
  const boundary = 'timecards-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(data)}\r\n` +
    `--${boundary}--`;

  const response = await call(
    existingId
      ? `/files/${existingId}?uploadType=multipart&fields=id`
      : '/files?uploadType=multipart&fields=id',
    {
      method: existingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    UPLOAD,
  );
  const created = (await response.json()) as { id?: string };
  return created.id ?? existingId ?? '';
}

/** 接続中のアカウント名。取れなくても同期はできるので、失敗しても止めない */
export async function fetchAccountName(): Promise<string | null> {
  try {
    const response = await call('/about?fields=user(displayName,emailAddress)');
    const body = (await response.json()) as {
      user?: { displayName?: string; emailAddress?: string };
    };
    return body.user?.emailAddress ?? body.user?.displayName ?? null;
  } catch {
    return null;
  }
}

/**
 * Drive を保存先として使う口。
 * フォルダとファイルの id は 1 回の同期のあいだ覚えておき、無駄な問い合わせを減らす。
 */
export class DriveStore implements RemoteStore {
  private rootId: string | null = null;
  private recordsId: string | null = null;
  private readonly fileIds = new Map<string, string>();

  /** 置き場所を用意する。初回は Drive にフォルダを作る */
  private async folders(): Promise<{ rootId: string; recordsId: string }> {
    if (this.rootId && this.recordsId) {
      return { rootId: this.rootId, recordsId: this.recordsId };
    }
    const root = await ensureFolder(ROOT_FOLDER_NAME, 'root');
    const records = await ensureFolder(RECORDS_FOLDER_NAME, root.id);
    this.rootId = root.id;
    this.recordsId = records.id;
    return { rootId: root.id, recordsId: records.id };
  }

  /** 'records/2026-08.json' のような道筋を、置き場所とファイル名に分ける */
  private async locate(path: string): Promise<{ parentId: string; name: string }> {
    const { rootId, recordsId } = await this.folders();
    if (path.startsWith(RECORDS_PREFIX)) {
      return { parentId: recordsId, name: path.slice(RECORDS_PREFIX.length) };
    }
    return { parentId: rootId, name: path };
  }

  private async fileId(path: string): Promise<string | null> {
    const cached = this.fileIds.get(path);
    if (cached) return cached;
    const { parentId, name } = await this.locate(path);
    const found = await findChild(name, parentId);
    if (found) this.fileIds.set(path, found.id);
    return found?.id ?? null;
  }

  async read(path: string): Promise<unknown | null> {
    const id = await this.fileId(path);
    if (!id) return null;
    const response = await call(`/files/${id}?alt=media`);
    const text = await response.text();
    if (text.trim() === '') return null;
    try {
      return JSON.parse(text);
    } catch {
      // 壊れたファイルで同期全体を止めない。無かったものとして扱い、正しい内容で上書きする
      return null;
    }
  }

  async write(path: string, data: unknown): Promise<void> {
    const { parentId, name } = await this.locate(path);
    const id = await this.fileId(path);
    const writtenId = await writeJson(name, parentId, data, id);
    if (writtenId) this.fileIds.set(path, writtenId);
  }

  async listRecordMonths(): Promise<string[]> {
    const { recordsId } = await this.folders();
    const query = `'${recordsId}' in parents and trashed=false`;
    const response = await call(
      `/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1000`,
    );
    const body = (await response.json()) as { files?: DriveFile[] };
    const months: string[] = [];
    for (const file of body.files ?? []) {
      const match = /^(\d{4}-\d{2})\.json$/.exec(file.name);
      if (match) {
        months.push(match[1]);
        this.fileIds.set(`${RECORDS_PREFIX}${file.name}`, file.id);
      }
    }
    return months;
  }
}
