import { describe, expect, it } from 'vitest';
import { rawWorkMinutes, recordWage, roundMinutes, summarize, wageOf } from './wage';
import type { AttendanceRecord, RoundingRule } from './types';

const rule15Floor: RoundingRule = {
  unitMinutes: 15,
  direction: 'floor',
  target: 'dailyTotal',
};

function record(over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 'r1',
    termId: 't1',
    staffId: 's1',
    date: '2026-08-03',
    kind: 'actual',
    startTime: '08:00',
    endTime: '17:00',
    workPlace: '第一圃場',
    breakMinutes: 0,
    hourlyWage: 1200,
    updatedAt: '2026-08-03T09:00:00.000Z',
    deleted: false,
    ...over,
  };
}

describe('roundMinutes', () => {
  it('15分切り捨て（既定）', () => {
    // 仕様書の例: 8:00〜16:52 は 532 分 → 525 分（8.75h）
    expect(roundMinutes(532, rule15Floor)).toBe(525);
    expect(roundMinutes(525, rule15Floor)).toBe(525);
    expect(roundMinutes(14, rule15Floor)).toBe(0);
  });

  it('切り上げと四捨五入も選べる', () => {
    expect(roundMinutes(532, { ...rule15Floor, direction: 'ceil' })).toBe(540);
    expect(roundMinutes(532, { ...rule15Floor, direction: 'round' })).toBe(525);
    expect(roundMinutes(533, { ...rule15Floor, direction: 'round' })).toBe(540);
  });

  it('単位を変えられる（1分単位なら丸めない）', () => {
    expect(roundMinutes(532, { ...rule15Floor, unitMinutes: 1 })).toBe(532);
    expect(roundMinutes(532, { ...rule15Floor, unitMinutes: 30 })).toBe(510);
  });
});

describe('rawWorkMinutes', () => {
  it('出勤から退勤までの分数', () => {
    expect(rawWorkMinutes(record({ startTime: '08:00', endTime: '16:52' }))).toBe(532);
  });

  it('退勤が未記録なら null', () => {
    expect(rawWorkMinutes(record({ endTime: null }))).toBeNull();
  });

  it('日をまたいだら24時間を足す', () => {
    expect(rawWorkMinutes(record({ startTime: '22:00', endTime: '02:00' }))).toBe(240);
  });
});

describe('wageOf', () => {
  it('時給×分を整数のまま計算する', () => {
    expect(wageOf(525, 1200)).toBe(10500);
    // 8.75h × 1030円 = 9012.5 → 9013（四捨五入）
    expect(wageOf(525, 1030)).toBe(9013);
  });

  it('金額に小数が残らない', () => {
    expect(Number.isInteger(wageOf(105, 1111))).toBe(true);
  });
});

describe('recordWage', () => {
  it('丸め後の時間に対して時給を掛ける', () => {
    const r = record({ startTime: '08:00', endTime: '16:52', hourlyWage: 1200 });
    expect(recordWage(r, rule15Floor)).toBe(10500);
  });

  it('時給スナップショットが無ければ null', () => {
    expect(recordWage(record({ hourlyWage: null }), rule15Floor)).toBeNull();
  });
});

describe('summarize', () => {
  it('合計してから丸めるのではなく、日ごとに丸めてから足す', () => {
    const records = [
      record({ id: 'a', date: '2026-08-03', startTime: '08:00', endTime: '16:52' }), // 532 → 525
      record({ id: 'b', date: '2026-08-04', startTime: '08:00', endTime: '16:08' }), // 488 → 480
    ];
    const summary = summarize(records, rule15Floor);
    expect(summary.workDays).toBe(2);
    expect(summary.rawMinutes).toBe(1020);
    // 合計 1020 分をまとめて丸めると 1020 のままになるが、日ごとに丸めるので 1005 になる。
    // 一覧表に出す日ごとの金額を足した額と、明細の合計額を必ず一致させるための順序。
    expect(summary.roundedMinutes).toBe(1005);
    expect(summary.amount).toBe(10500 + 9600);
  });

  it('時給が違う日が混ざっても日ごとに正しく計算する', () => {
    const records = [
      record({ id: 'a', date: '2026-08-03', endTime: '17:00', hourlyWage: 1000 }), // 540分 = 9h
      record({ id: 'b', date: '2026-08-04', endTime: '17:00', hourlyWage: 1200 }), // 540分 = 9h
    ];
    expect(summarize(records, rule15Floor).amount).toBe(9000 + 10800);
  });

  it('未確定（予定のまま・退勤なし）は集計に入れず件数だけ数える', () => {
    const records = [
      record({ id: 'a' }),
      record({ id: 'b', kind: 'plan', endTime: null }),
      record({ id: 'c', endTime: null }),
    ];
    const summary = summarize(records, rule15Floor);
    expect(summary.workDays).toBe(1);
    expect(summary.unresolvedCount).toBe(2);
  });

  it('論理削除されたレコードは無視する', () => {
    const summary = summarize([record({ deleted: true })], rule15Floor);
    expect(summary.workDays).toBe(0);
    expect(summary.unresolvedCount).toBe(0);
  });
});
