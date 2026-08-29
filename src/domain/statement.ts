import { isUnresolved } from './status';
import { minutesToHours, spanMinutes } from './time';
import { roundedWorkMinutes, summarize } from './wage';
import type { AttendanceRecord, IsoDate, RoundingRule, Staff } from './types';

/**
 * 明細 1 枚分の内容。出力単位は期 × スタッフ 1 名。
 * 画面から切り離してあるので、組み立て方だけをテストできる。
 */
export interface StatementLine {
  date: IsoDate;
  /** 勤務時間帯（例 8:00〜16:52） */
  startTime: string;
  endTime: string;
  /** 労働時間。明細行は検算しやすさを優先して小数のみ */
  hours: number;
  workPlace: string;
}

export interface Statement {
  staff: Staff;
  /** その期における初出勤日〜最終出勤日。雇用期間は実記録から導く */
  from: IsoDate | null;
  to: IsoDate | null;
  /**
   * 適用された時給。通常は 1 つ。
   * 期の途中で改定された場合に備えて配列で持ち、ヘッダーに併記する。
   */
  hourlyWages: number[];
  workDays: number;
  /** 労働時間合計（丸め後の分） */
  totalMinutes: number;
  amount: number;
  lines: StatementLine[];
  /** 明細に含められなかった未確定の記録。出力前の警告に使う */
  unresolved: AttendanceRecord[];
}

/**
 * 1 名分の明細を組み立てる。
 * 集計は期の内側だけで行うため、渡す records は必ず 1 つの期に絞っておくこと。
 */
export function buildStatement(
  staff: Staff,
  records: AttendanceRecord[],
  rule: RoundingRule,
  todayDate: IsoDate,
): Statement {
  const mine = records
    .filter((record) => record.staffId === staff.id && !record.deleted)
    .sort((a, b) => a.date.localeCompare(b.date));
  const actual = mine.filter(
    (record) => record.kind === 'actual' && spanMinutes(record.startTime, record.endTime) !== null,
  );
  const summary = summarize(mine, rule);

  const lines: StatementLine[] = actual.map((record) => ({
    date: record.date,
    startTime: record.startTime ?? '',
    endTime: record.endTime ?? '',
    hours: minutesToHours(roundedWorkMinutes(record, rule) ?? 0),
    workPlace: record.workPlace,
  }));

  const hourlyWages = [
    ...new Set(
      actual
        .map((record) => record.hourlyWage)
        .filter((wage): wage is number => wage !== null),
    ),
  ].sort((a, b) => a - b);

  return {
    staff,
    from: actual[0]?.date ?? null,
    to: actual.at(-1)?.date ?? null,
    hourlyWages,
    workDays: summary.workDays,
    totalMinutes: summary.roundedMinutes,
    amount: summary.amount,
    lines,
    unresolved: mine.filter((record) => isUnresolved(record, todayDate)),
  };
}

/** 記録のあるスタッフだけを明細の対象にする（在籍中でも出勤が無ければ出さない） */
export function staffWithRecords(staff: Staff[], records: AttendanceRecord[]): Staff[] {
  const ids = new Set(records.filter((record) => !record.deleted).map((r) => r.staffId));
  return staff.filter((member) => ids.has(member.id));
}
