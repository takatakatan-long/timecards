import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatTimeLabel,
  formatHhMm,
  parseHhMm,
  spanMinutes,
  toHhMm,
  toIsoDate,
  yearMonthOf,
  yearMonthRange,
} from './time';

describe('parseHhMm', () => {
  it('分数に直す', () => {
    expect(parseHhMm('08:00')).toBe(480);
    expect(parseHhMm('8:05')).toBe(485);
    expect(parseHhMm('00:00')).toBe(0);
  });

  it('不正な値は null', () => {
    expect(parseHhMm('')).toBeNull();
    expect(parseHhMm(null)).toBeNull();
    expect(parseHhMm('25:00')).toBeNull();
    expect(parseHhMm('08:60')).toBeNull();
    expect(parseHhMm('8時')).toBeNull();
  });
});

describe('formatHhMm', () => {
  it('ゼロ埋めして返す', () => {
    expect(formatHhMm(485)).toBe('08:05');
    expect(formatHhMm(0)).toBe('00:00');
  });
});

describe('formatDuration', () => {
  it('時間と分に分ける', () => {
    expect(formatDuration(532)).toBe('8時間52分');
    expect(formatDuration(480)).toBe('8時間');
    expect(formatDuration(45)).toBe('45分');
  });
});

describe('formatTimeLabel', () => {
  it('先頭の 0 を落として表示する', () => {
    expect(formatTimeLabel('08:00')).toBe('8:00');
    expect(formatTimeLabel('16:52')).toBe('16:52');
    expect(formatTimeLabel('00:30')).toBe('0:30');
  });

  it('未記録なら空文字', () => {
    expect(formatTimeLabel(null)).toBe('');
  });
});

describe('spanMinutes', () => {
  it('欠けていれば null', () => {
    expect(spanMinutes('08:00', null)).toBeNull();
    expect(spanMinutes(null, '17:00')).toBeNull();
  });

  it('日をまたぐ場合', () => {
    expect(spanMinutes('23:30', '00:30')).toBe(60);
  });
});

describe('toIsoDate / toHhMm', () => {
  it('ローカル時刻のまま文字列にする（UTC 変換を挟まない）', () => {
    const date = new Date(2026, 7, 3, 8, 5); // 2026-08-03 08:05 ローカル
    expect(toIsoDate(date)).toBe('2026-08-03');
    expect(toHhMm(date)).toBe('08:05');
  });
});

describe('yearMonthRange', () => {
  it('年をまたいで列挙する', () => {
    expect(yearMonthRange('2026-11-20', '2027-02-05')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('同じ月なら1件', () => {
    expect(yearMonthRange('2026-08-01', '2026-08-31')).toEqual(['2026-08']);
  });

  it('yearMonthOf と組み合わせて読み込むファイルを決める', () => {
    expect(yearMonthOf('2026-08-03')).toBe('2026-08');
  });
});
