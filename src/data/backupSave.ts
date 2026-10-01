/**
 * バックアップファイルの保存。
 *
 * ブラウザは「どこに保存したか」をアプリへ教えない決まりなので、
 * 正確な保存先のパスを表示することはできない。
 * 代わりに、保存先を自分で選べる手段を優先し、選べない場合は
 * 端末ごとの「たどり方」の目安を案内する。
 *
 * 優先順:
 *   1. 保存先を選ぶ画面（showSaveFilePicker。PC の Chrome / Edge）
 *   2. 共有シート（navigator.share。スマホ）
 *   3. 通常のダウンロード
 */

export type Platform = 'android' | 'ios' | 'desktop';

/**
 * - saved: 保存先を選ぶ画面で保存した（ファイル名だけ分かる）
 * - shared: 共有シートへ渡した（選んだ保存先は分からない）
 * - downloaded: ダウンロードした
 * - cancelled: 利用者が選択画面を閉じた
 * - blocked: ボタンを押してから時間が空き、共有画面を開けなかった
 */
export type SaveResult = 'saved' | 'shared' | 'downloaded' | 'cancelled' | 'blocked';

export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  // iPad は Mac を名乗ることがある。Mac にタッチ画面は無いので、タッチ点数で見分ける
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios';
  return 'desktop';
}

/** ダウンロードしたファイルのたどり方。実際の場所は設定や機種で変わるため、あくまで目安 */
export function downloadHint(platform: Platform): string {
  switch (platform) {
    case 'android':
      return '「ファイル」アプリの「ダウンロード」に入っているのが一般的です。';
    case 'ios':
      return '「ファイル」アプリの「ダウンロード」に入っているのが一般的です。';
    case 'desktop':
      return 'ブラウザの「ダウンロード」フォルダに入っているのが一般的です。';
  }
}

/** 書き出し後に画面へ出す案内文 */
export function saveMessage(result: SaveResult, fileName: string, platform: Platform): string {
  switch (result) {
    case 'saved':
      return `「${fileName}」を、選んだ場所に保存しました。`;
    case 'shared':
      return (
        `「${fileName}」を共有しました。選んだ保存先に入っています。` +
        '（保存先の場所はアプリからは分かりません）'
      );
    case 'downloaded':
      return (
        `「${fileName}」をダウンロードしました。${downloadHint(platform)}` +
        '見つからないときは、ブラウザのダウンロード履歴から開けます。'
      );
    case 'cancelled':
      return '保存を取りやめました。';
    case 'blocked':
      return '保存先を選ぶ画面を開けませんでした。もう一度押してください。';
  }
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    name: string;
    createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
  }>;
}

function errorName(cause: unknown): string {
  return cause instanceof Error ? cause.name : '';
}

function canShareFile(file: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

/** 保存手段の優先順に従ってファイルを保存する */
export async function saveBackupFile(file: File): Promise<SaveResult> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: file.name,
        types: [{ description: 'バックアップ', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      return 'saved';
    } catch (cause) {
      if (errorName(cause) === 'AbortError') return 'cancelled';
      if (errorName(cause) === 'SecurityError') return 'blocked';
      // 選択画面を使えない環境だった。次の手段へ進む
    }
  }

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (cause) {
      if (errorName(cause) === 'AbortError') return 'cancelled';
      // ボタンを押した直後でないと共有画面は開けない。呼び出し側でもう一度押してもらう
      if (errorName(cause) === 'NotAllowedError') return 'blocked';
      // 共有に失敗した場合はダウンロードへ進む
    }
  }

  download(file);
  return 'downloaded';
}
