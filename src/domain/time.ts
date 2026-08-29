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

/**
 * 画面に出す時刻。保存は 'HH:MM' の 0 埋めだが、表示は 8:00 のように先頭の 0 を落とす。
 * 明細と画面の表記を仕様書の書き方に揃えるため。
 */
export function formatTimeLabel(value: HhMm | null | undefined): string {
  if (!value) return '';
  return value.replace(/^0/, '');
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

/** 曜日の表示。日曜始まりで並べる */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 'YYYY-MM' を「2026年8月」にする */
export function formatMonthLabel(month: YearMonth): string {
  const [year, monthPart] = month.split('-');
  return `${Number(year)}年${Number(monthPart)}月`;
}

/** 'YYYY-MM-DD' を「8月3日（月）」にする */
export function formatDateLabel(date: IsoDate): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}月${Number(day)}日（${WEEKDAY_LABELS[weekdayOf(date)]}）`;
}

/** 曜日番号（0 = 日曜）。文字列から Date を作る箇所をここに閉じ込める */
export function weekdayOf(date: IsoDate): number {
  return new Date(`${date}T00:00:00`).getDay();
}

/** その月の最初と最後の日。月別の読み込み範囲に使う */
export function monthBounds(month: YearMonth): { from: IsoDate; to: IsoDate } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** 月送り。delta に -1 / +1 を渡す */
export function shiftMonth(month: YearMonth, delta: number): YearMonth {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const shifted = new Date(year, monthNumber - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

/** 日付をずらす。予定のコピーで使う */
export function addDays(date: IsoDate, days: number): IsoDate {
  const shifted = new Date(`${date}T00:00:00`);
  shifted.setDate(shifted.getDate() + days);
  return toIsoDate(shifted);
}

/** from から to までの日数。予定のコピーでずらす量の計算に使う */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T00:00:00`).getTime();
  return Math.round((toTime - fromTime) / 86_400_000);
}

/** from から to までの日付を昇順で列挙する。両端を含む */
export function dateRange(from: IsoDate, to: IsoDate): IsoDate[] {
  const days = daysBetween(from, to);
  if (days < 0) return [];
  return Array.from({ length: days + 1 }, (_, index) => addDays(from, index));
}

/**
 * 月カレンダーの升目。日曜始まりで、前後の月にはみ出した分は null にする。
 * PC 表示のカレンダーで使う。予定は日付で管理しており、週は日付を見やすく並べるための枠でしかない。
 */
export function calendarGrid(month: YearMonth): (IsoDate | null)[] {
  const { from, to } = monthBounds(month);
  const lastDay = Number(to.slice(8, 10));
  const cells: (IsoDate | null)[] = new Array(weekdayOf(from)).fill(null);
  for (let day = 1; day <= lastDay; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
