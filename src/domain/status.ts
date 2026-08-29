import { parseHhMm } from './time';
import type { AttendanceRecord, HhMm, IsoDate } from './types';

/**
 * ホーム画面のスタッフ行が取る状態。
 * その時に押すべきボタンだけを出すため、行ごとにこの 3 状態（＋予定なし）を判定する。
 */
export type RowStatus =
  /** 予定あり・打刻なし。予定時刻をチップ表示し「出勤」だけを出す */
  | 'planned'
  /** 出勤済み・退勤なし。出勤時刻を表示し「退勤」だけを出す */
  | 'working'
  /** 出勤・退勤とも完了。ボタンを消し、行タップで修正 */
  | 'finished'
  /** その日の予定も実績もない */
  | 'none';

export function rowStatusOf(record: AttendanceRecord | null | undefined): RowStatus {
  if (!record || record.deleted) return 'none';
  if (record.kind === 'plan') return 'planned';
  if (!record.endTime) return 'working';
  return 'finished';
}

/**
 * 打刻漏れかどうか。定義は 2 つ。
 * 1. 過去日に残った kind: 'plan'（出勤を押し忘れた）
 * 2. 出勤済みだが退勤時刻がない過去日のレコード
 * 当日はまだ勤務中でありうるので対象にしない。
 */
export function isUnresolved(record: AttendanceRecord, todayDate: IsoDate): boolean {
  if (record.deleted) return false;
  if (record.date >= todayDate) return false;
  if (record.kind === 'plan') return true;
  return !record.endTime;
}

export function unresolvedRecords(
  records: AttendanceRecord[],
  todayDate: IsoDate,
): AttendanceRecord[] {
  return records.filter((record) => isUnresolved(record, todayDate));
}

/**
 * 出勤打刻で確定させる時刻を決める。
 *
 * 予定時刻をそのまま使うのが基本。作業に追われてボタンを押すのが遅れがちで、
 * 押した時刻をそのまま採ると実際より遅い出勤として記録されてしまうため。
 *
 * ただし予定より早く来て打刻した場合は、押した時刻を採る。
 * 早く働き始めた分を予定時刻に切り上げてしまうと、その分の賃金が支払われないため。
 *
 * つまり「予定と実際の早いほう」を採用する。
 */
export function resolveClockInTime(
  planTime: HhMm | null,
  stampedTime: HhMm,
): HhMm {
  const plan = parseHhMm(planTime);
  const stamped = parseHhMm(stampedTime);
  if (plan === null) return stampedTime;
  if (stamped === null) return planTime as HhMm;
  return stamped < plan ? stampedTime : (planTime as HhMm);
}
