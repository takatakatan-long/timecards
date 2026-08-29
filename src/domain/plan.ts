import { addDays } from './time';
import type { AttendanceRecord, IsoDate } from './types';

/**
 * 出勤予定画面で出す 3 つの状態。
 * - planned: これからの予定
 * - fixed: 打刻して実績が確定したもの
 * - missed: 過去日に残った予定。そのまま打刻漏れの定義になる
 */
export type PlanState = 'planned' | 'fixed' | 'missed';

export function planStateOf(record: AttendanceRecord, todayDate: IsoDate): PlanState {
  if (record.kind === 'actual') return 'fixed';
  return record.date < todayDate ? 'missed' : 'planned';
}

export const PLAN_STATE_LABEL: Record<PlanState, string> = {
  planned: '予定',
  fixed: '確定',
  missed: '未確定',
};

/** 日付ごとにまとめる。予定のない日は現れないので、そのまま「予定のある日だけ」の並びになる */
export function groupByDate(records: AttendanceRecord[]): [IsoDate, AttendanceRecord[]][] {
  const groups = new Map<IsoDate, AttendanceRecord[]>();
  for (const record of records) {
    const bucket = groups.get(record.date);
    if (bucket) bucket.push(record);
    else groups.set(record.date, [record]);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * 予定のコピーで、実際に複製する分だけを選ぶ。
 * ずらした先に同じスタッフの記録がすでにあれば飛ばす（二重登録を防ぐため）。
 * 実績として確定した記録もコピー元にできる（働いた日の並びをそのまま先の日付へ写す使い方）。
 */
export function plansToCopy(
  source: AttendanceRecord[],
  existing: AttendanceRecord[],
  shiftDays: number,
): AttendanceRecord[] {
  const taken = new Set(existing.map((record) => `${record.date}|${record.staffId}`));
  return source.filter((record) => {
    if (!record.startTime) return false;
    return !taken.has(`${addDays(record.date, shiftDays)}|${record.staffId}`);
  });
}
