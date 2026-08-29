/**
 * Google の認証。
 *
 * ブラウザだけで完結させるため、Google Identity Services のトークン方式を使う。
 * 秘密鍵を持たない代わりに、得られる許可は 1 時間ほどで切れる。
 * 切れたら「要再認証」として扱い、ホームの同期状態にも警告を出す
 * （手動同期なので「同期したつもりで繋がっていない」が起こり得るため）。
 *
 * 要求する権限は drive.file だけ。**このアプリが作ったファイルにしか触れない**ので、
 * 利用者の他の Drive の中身は読めない。
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_KEY = 'timecards.google.token';

/** ビルド時に埋め込む OAuth クライアント ID。未設定なら接続機能を出さない */
export const CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

export function isConfigured(): boolean {
  return CLIENT_ID !== '';
}

interface StoredToken {
  accessToken: string;
  /** 期限（ミリ秒）。少し手前で切れた扱いにする */
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void;
}

interface GoogleGlobal {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        prompt?: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
      revoke: (token: string, done: () => void) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleGlobal;
  }
}

let scriptPromise: Promise<GoogleGlobal> | null = null;

/** Google の認証スクリプトを読み込む。オフラインでは失敗するので、その旨を伝える */
function loadGis(): Promise<GoogleGlobal> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(window.google);
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('Google の認証機能を読み込めませんでした'));
    };
    script.onerror = () =>
      reject(new Error('Google に接続できませんでした。通信できる場所で試してください'));
    document.head.append(script);
  });
  return scriptPromise;
}

function readStoredToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    // 期限が近いものは切れた扱いにして、同期の途中で失敗しないようにする
    return token.expiresAt > Date.now() + 60_000 ? token : null;
  } catch {
    return null;
  }
}

function storeToken(token: StoredToken | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // 保存できなくても動作はする（次回また許可を求めるだけ）
  }
}

/** 今すぐ使える許可があるか。ホームや設定の状態表示に使う */
export function hasValidToken(): boolean {
  return readStoredToken() !== null;
}

/**
 * 許可を得る。
 * interactive を false にすると画面を出さずに試み、
 * すでに許可済みなら黙って取り直す（期限切れからの復帰に使う）。
 */
export async function requestToken(interactive = true): Promise<string> {
  const stored = readStoredToken();
  if (stored) return stored.accessToken;
  if (!isConfigured()) {
    throw new Error('Google の接続先が設定されていません');
  }

  const google = await loadGis();
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error ?? 'Google の許可を得られませんでした'));
          return;
        }
        const token: StoredToken = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        };
        storeToken(token);
        resolve(token.accessToken);
      },
      error_callback: (error) =>
        reject(new Error(error.type === 'popup_closed' ? '接続を中止しました' : 'Google の許可を得られませんでした')),
    });
    // 画面を出さない場合は、すでに許可済みのときだけ通る
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

/** 許可を捨てる。接続解除で使う */
export async function signOut(): Promise<void> {
  const stored = readStoredToken();
  storeToken(null);
  if (!stored) return;
  try {
    const google = await loadGis();
    await new Promise<void>((resolve) => google.accounts.oauth2.revoke(stored.accessToken, resolve));
  } catch {
    // 取り消しに失敗しても手元の許可は捨ててあるので、そのまま終える
  }
}

/** 期限切れで再認証が要る状態 */
export class ReauthRequiredError extends Error {
  constructor() {
    super('Google の接続が切れています。設定から接続し直してください');
    this.name = 'ReauthRequiredError';
  }
}

/** 保存済みの許可を返す。無ければ再認証を促す */
export function currentToken(): string {
  const stored = readStoredToken();
  if (!stored) throw new ReauthRequiredError();
  return stored.accessToken;
}

/** 期限切れを検知したときに呼ぶ。次回は必ず取り直す */
export function forgetToken(): void {
  storeToken(null);
}
