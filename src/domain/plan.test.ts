import { describe, expect, it } from 'vitest';
import { groupByDate, planStateOf, plansToCopy } from './plan';
import type { AttendanceRecord } from './types';

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'r1',
    termId: 't1',
    staffId: 's1',
    date: '2026-08-10',
    kind: 'plan',
    startTime: '08:00',
    endTime: null,
    workPlace: '',
    breakMinutes: 0,
    hourlyWage: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('planStateOf', () => {
  const todayDate = '2026-08-10';

  it('未来の予定は「予定」', () => {
    expect(planStateOf(record({ date: '2026-08-20' }), todayDate)).toBe('planned');
  });

  it('当日の予定はまだ打刻できるので「予定」', () => {
    expect(planStateOf(record({ date: todayDate }), todayDate)).toBe('planned');
  });

  it('打刻済みは「確定」', () => {
    expect(planStateOf(record({ kind: 'actual' }), todayDate)).toBe('fixed');
  });

  it('過去日に残った予定は「未確定」＝打刻漏れ', () => {
    expect(planStateOf(record({ date: '2026-08-09' }), todayDate)).toBe('missed');
  });
});

describe('groupByDate', () => {
  it('日付ごとにまとめて日付順に並べる', () => {
    const grouped = groupByDate([
      record({ id: 'b', date: '2026-08-12' }),
      record({ id: 'a', date: '2026-08-10' }),
      record({ id: 'c', date: '2026-08-10', staffId: 's2' }),
    ]);
    expect(grouped.map(([date, items]) => [date, items.length])).toEqual([
      ['2026-08-10', 2],
      ['2026-08-12', 1],
    ]);
  });
});

describe('plansToCopy', () => {
  it('コピー先に同じ人の記録があれば飛ばす', () => {
    const source = [
      record({ id: 'a', date: '2026-08-03', staffId: 's1' }),
      record({ id: 'b', date: '2026-08-04', staffId: 's2' }),
    ];
    const existing = [record({ id: 'x', date: '2026-08-10', staffId: 's1' })];
    // 7 日ずらすと a は 8/10 の s1 とぶつかる
    expect(plansToCopy(source, existing, 7).map((r) => r.id)).toEqual(['b']);
  });

  it('同じ日でも人が違えばコピーする', () => {
    const source = [record({ id: 'a', date: '2026-08-03', staffId: 's1' })];
    const existing = [record({ id: 'x', date: '2026-08-10', staffId: 's2' })];
    expect(plansToCopy(source, existing, 7)).toHaveLength(1);
  });

  it('出勤時刻の無い記録はコピーしない', () => {
    const source = [record({ id: 'a', startTime: null })];
    expect(plansToCopy(source, [], 7)).toHaveLength(0);
  });
});
