import { spanMinutes } from './time';
import type { AttendanceRecord, RoundingRule } from './types';

/**
 * 丸めの単位に合わせて分数を丸める。
 * 対象は 1 日の労働時間の合計であり、出勤・退勤それぞれの時刻は丸めない。
 * 例: 8:00〜16:52 → 532 分 → 15 分切り捨て → 525 分（8.75h）
 */
export function roundMinutes(totalMinutes: number, rule: RoundingRule): number {
  const unit = rule.unitMinutes;
  if (unit <= 1) return totalMinutes;
  switch (rule.direction) {
    case 'ceil':
      return Math.ceil(totalMinutes / unit) * unit;
    case 'round':
      return Math.round(totalMinutes / unit) * unit;
    case 'floor':
    default:
      return Math.floor(totalMinutes / unit) * unit;
  }
}

/** 1 日の労働時間（丸め前の分数）。休憩は仕様上常に 0 だが式には残してある */
export function rawWorkMinutes(record: AttendanceRecord): number | null {
  const span = spanMinutes(record.startTime, record.endTime);
  if (span === null) return null;
  return Math.max(0, span - record.breakMinutes);
}

/** 1 日の労働時間（丸め後の分数） */
export function roundedWorkMinutes(
  record: AttendanceRecord,
  rule: RoundingRule,
): number | null {
  const raw = rawWorkMinutes(record);
  if (raw === null) return null;
  return roundMinutes(raw, rule);
}

/**
 * 賃金（円）。時給 × 分 は整数のまま計算し、最後に 60 で割って四捨五入する。
 * 浮動小数点の誤差を金額に持ち込まないための順序。
 */
export function wageOf(roundedMinutes: number, hourlyWage: number): number {
  return Math.round((hourlyWage * roundedMinutes) / 60);
}

/** 1 レコードの賃金。時給スナップショットが無い（＝未確定の予定）なら null */
export function recordWage(record: AttendanceRecord, rule: RoundingRule): number | null {
  if (record.hourlyWage === null) return null;
  const minutes = roundedWorkMinutes(record, rule);
  if (minutes === null) return null;
  return wageOf(minutes, record.hourlyWage);
}

export interface WageSummary {
  /** 出勤日数（労働時間が確定している日の数） */
  workDays: number;
  /** 丸め前の労働時間合計（分） */
  rawMinutes: number;
  /** 丸め後の労働時間合計（分）。日ごとに丸めてから足す */
  roundedMinutes: number;
  /** 支給額（円） */
  amount: number;
  /** 打刻漏れの件数。集計に含められなかったレコード */
  unresolvedCount: number;
}

/**
 * 複数レコードの集計。丸めは日ごとに適用してから合計する
 * （合計してから丸めると日ごとの金額と合わなくなるため）。
 */
export function summarize(
  records: AttendanceRecord[],
  rule: RoundingRule,
): WageSummary {
  const summary: WageSummary = {
    workDays: 0,
    rawMinutes: 0,
    roundedMinutes: 0,
    amount: 0,
    unresolvedCount: 0,
  };
  for (const record of records) {
    if (record.deleted) continue;
    const raw = rawWorkMinutes(record);
    if (raw === null || record.kind !== 'actual') {
      summary.unresolvedCount += 1;
      continue;
    }
    const rounded = roundMinutes(raw, rule);
    summary.workDays += 1;
    summary.rawMinutes += raw;
    summary.roundedMinutes += rounded;
    summary.amount += record.hourlyWage === null ? 0 : wageOf(rounded, record.hourlyWage);
  }
  return summary;
}
