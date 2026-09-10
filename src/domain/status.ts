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
 * **予定があれば、押した時刻に関わらず予定時刻で確定する。**
 *
 * 現場では早めに集まって準備や段取りをしてから、予定の時刻に仕事を始める。
 * そのためボタンを押した実時刻で記録すると、結局あとから予定時刻へ直すことになり、
 * 毎回の手直しが発生していた。それなら最初から予定時刻で確定させたほうが早い。
 *
 * 予定より早く働き始めた日は、記録を開いて出勤時刻を手で入力する
 * （例外のほうを直す形にして、日常の手間を減らしている）。
 *
 * 予定が無い日は押した時刻を使う。基準になる予定が存在しないため。
 */
export function resolveClockInTime(
  planTime: HhMm | null,
  stampedTime: HhMm,
): HhMm {
  return parseHhMm(planTime) === null ? stampedTime : (planTime as HhMm);
}
