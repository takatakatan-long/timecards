import { describe, expect, it } from 'vitest';
import { buildStatement, staffWithRecords } from './statement';
import type { AttendanceRecord, RoundingRule, Staff } from './types';

const rule: RoundingRule = { unitMinutes: 15, direction: 'floor', target: 'dailyTotal' };
const todayDate = '2026-09-10';

const tanaka: Staff = {
  id: 's1',
  name: '田中 太郎',
  hourlyWage: 1200,
  active: true,
  updatedAt: '2026-08-01T00:00:00.000Z',
  deleted: false,
};

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'r1',
    termId: 't1',
    staffId: 's1',
    date: '2026-08-20',
    kind: 'actual',
    startTime: '08:00',
    endTime: '16:52',
    workPlace: '第一圃場',
    breakMinutes: 0,
    hourlyWage: 1200,
    updatedAt: '2026-08-20T09:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('buildStatement', () => {
  it('明細行は日付・勤務時間帯・労働時間・作業場所を持つ', () => {
    const statement = buildStatement(tanaka, [record()], rule, todayDate);
    expect(statement.lines).toEqual([
      {
        date: '2026-08-20',
        startTime: '08:00',
        endTime: '16:52',
        hours: 8.75,
        workPlace: '第一圃場',
      },
    ]);
  });

  it('雇用期間は記録から導く（初出勤日〜最終出勤日）', () => {
    const statement = buildStatement(
      tanaka,
      [
        record({ id: 'b', date: '2026-09-02' }),
        record({ id: 'a', date: '2026-08-20' }),
      ],
      rule,
      todayDate,
    );
    expect(statement.from).toBe('2026-08-20');
    expect(statement.to).toBe('2026-09-02');
  });

  it('合計は時給 × 労働時間で検算できる', () => {
    const statement = buildStatement(
      tanaka,
      [record({ id: 'a' }), record({ id: 'b', date: '2026-08-21', endTime: '17:00' })],
      rule,
      todayDate,
    );
    expect(statement.workDays).toBe(2);
    expect(statement.totalMinutes).toBe(525 + 540);
    expect(statement.amount).toBe(10500 + 10800);
  });

  it('他のスタッフの記録は混ざらない', () => {
    const statement = buildStatement(
      tanaka,
      [record({ id: 'a' }), record({ id: 'b', staffId: 's2' })],
      rule,
      todayDate,
    );
    expect(statement.lines).toHaveLength(1);
  });

  it('未確定の記録は明細に載せず、警告用に取り分ける', () => {
    const statement = buildStatement(
      tanaka,
      [
        record({ id: 'a' }),
        record({ id: 'b', date: '2026-08-24', endTime: null }),
        record({ id: 'c', date: '2026-08-25', kind: 'plan', endTime: null }),
      ],
      rule,
      todayDate,
    );
    expect(statement.lines).toHaveLength(1);
    expect(statement.unresolved.map((r) => r.id)).toEqual(['b', 'c']);
    expect(statement.amount).toBe(10500);
  });

  it('期の途中で時給が変わったら両方をヘッダーに出せるようにする', () => {
    const statement = buildStatement(
      tanaka,
      [record({ id: 'a', hourlyWage: 1200 }), record({ id: 'b', date: '2026-09-01', hourlyWage: 1300 })],
      rule,
      todayDate,
    );
    expect(statement.hourlyWages).toEqual([1200, 1300]);
  });

  it('論理削除した記録は出さない', () => {
    const statement = buildStatement(tanaka, [record({ deleted: true })], rule, todayDate);
    expect(statement.lines).toHaveLength(0);
    expect(statement.amount).toBe(0);
  });
});

describe('staffWithRecords', () => {
  it('記録のあるスタッフだけを対象にする', () => {
    const suzuki: Staff = { ...tanaka, id: 's2', name: '鈴木 花子' };
    expect(staffWithRecords([tanaka, suzuki], [record()]).map((s) => s.id)).toEqual(['s1']);
  });
});
