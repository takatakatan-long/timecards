import type { HhMm, IsoDate, YearMonth } from './types';

/** 'HH:MM' を 0 時からの分数に変換する。不正な値は null */
export function parseHhMm(value: HhMm | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 分数を 'HH:MM' に戻す。24 時間を超える分は 24 時間で折り返す */
export function formatHhMm(totalMinutes: number): HhMm {
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** 分数を「8時間52分」形式にする */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}分`;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

/** 分数を小数の時間にする（例 510 → 8.5）。明細の労働時間欄で使う */
export function minutesToHours(totalMinutes: number): number {
  return totalMinutes / 60;
}

/**
 * 出勤から退勤までの分数。
 * 退勤が出勤より前なら日をまたいだものとして 24 時間を足す。
 * どちらかが欠けていれば null。
 */
export function spanMinutes(startTime: HhMm | null, endTime: HhMm | null): number | null {
  const start = parseHhMm(startTime);
  const end = parseHhMm(endTime);
  if (start === null || end === null) return null;
  return end < start ? end + 1440 - start : end - start;
}

/** ローカル時刻の Date を 'YYYY-MM-DD' にする（UTC 変換を挟まない） */
export function toIsoDate(date: Date): IsoDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** ローカル時刻の Date を 'HH:MM' にする。退勤打刻の初期値に使う */
export function toHhMm(date: Date): HhMm {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' から 'YYYY-MM' を取り出す。レコードの保存先ファイルの判定に使う */
export function yearMonthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7);
}

/** today() を通して現在日を取得する。テストで差し替えられるよう 1 箇所にまとめている */
export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

/** from〜to に含まれる 'YYYY-MM' を昇順で列挙する。月をまたぐ集計でファイルを読む範囲の決定に使う */
export function yearMonthRange(from: IsoDate, to: IsoDate): YearMonth[] {
  const result: YearMonth[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return result;
}
