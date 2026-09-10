import { describe, expect, it } from 'vitest';
import { isUnresolved, resolveClockInTime, rowStatusOf, unresolvedRecords } from './status';
import type { AttendanceRecord } from './types';

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'r1',
    termId: 't1',
    staffId: 's1',
    date: '2026-08-03',
    kind: 'plan',
    startTime: '08:00',
    endTime: null,
    workPlace: '',
    breakMinutes: 0,
    hourlyWage: null,
    updatedAt: '2026-08-03T09:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('rowStatusOf', () => {
  it('予定あり・打刻なしは未打刻', () => {
    expect(rowStatusOf(record({ kind: 'plan' }))).toBe('planned');
  });

  it('出勤済み・退勤なしは勤務中', () => {
    expect(rowStatusOf(record({ kind: 'actual', endTime: null }))).toBe('working');
  });

  it('出勤・退勤とも完了なら記録済', () => {
    expect(rowStatusOf(record({ kind: 'actual', endTime: '17:00' }))).toBe('finished');
  });

  it('レコードが無い、または論理削除済みなら予定なし', () => {
    expect(rowStatusOf(null)).toBe('none');
    expect(rowStatusOf(record({ deleted: true }))).toBe('none');
  });
});

describe('isUnresolved', () => {
  const todayDate = '2026-08-10';

  it('過去日に残った予定は打刻漏れ', () => {
    expect(isUnresolved(record({ date: '2026-08-09', kind: 'plan' }), todayDate)).toBe(true);
  });

  it('過去日で退勤が無いものも打刻漏れ', () => {
    expect(
      isUnresolved(record({ date: '2026-08-09', kind: 'actual', endTime: null }), todayDate),
    ).toBe(true);
  });

  it('当日はまだ勤務中でありうるので対象外', () => {
    expect(isUnresolved(record({ date: todayDate, kind: 'plan' }), todayDate)).toBe(false);
    expect(
      isUnresolved(record({ date: todayDate, kind: 'actual', endTime: null }), todayDate),
    ).toBe(false);
  });

  it('未来の予定は打刻漏れではない', () => {
    expect(isUnresolved(record({ date: '2026-08-20' }), todayDate)).toBe(false);
  });

  it('過去日でも完了していれば対象外', () => {
    expect(
      isUnresolved(record({ date: '2026-08-09', kind: 'actual', endTime: '17:00' }), todayDate),
    ).toBe(false);
  });
});

describe('unresolvedRecords', () => {
  it('打刻漏れだけを抜き出す', () => {
    const records = [
      record({ id: 'a', date: '2026-08-09', kind: 'plan' }),
      record({ id: 'b', date: '2026-08-09', kind: 'actual', endTime: '17:00' }),
      record({ id: 'c', date: '2026-08-20', kind: 'plan' }),
    ];
    expect(unresolvedRecords(records, '2026-08-10').map((r) => r.id)).toEqual(['a']);
  });
});

describe('resolveClockInTime', () => {
  it('押すのが遅れても予定時刻を採る', () => {
    expect(resolveClockInTime('08:00', '08:35')).toBe('08:00');
  });

  it('予定より早く押しても予定時刻を採る', () => {
    // 早めに集まって準備をしてから予定時刻に始めるため、押した時刻では実態とずれる。
    // 本当に早くから働いた日は、記録を開いて手で直す
    expect(resolveClockInTime('08:00', '07:30')).toBe('08:00');
  });

  it('予定ちょうどなら予定時刻', () => {
    expect(resolveClockInTime('08:00', '08:00')).toBe('08:00');
  });

  it('予定が無ければ押した時刻', () => {
    // 基準になる予定が存在しないため
    expect(resolveClockInTime(null, '07:30')).toBe('07:30');
  });
});
