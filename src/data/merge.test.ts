import { describe, expect, it } from 'vitest';
import { changedSince, mergeById } from './merge';
import type { Syncable } from '../domain/types';

interface Item extends Syncable {
  value: string;
}

function item(id: string, updatedAt: string, value: string, deleted = false): Item {
  return { id, updatedAt, value, deleted };
}

describe('mergeById', () => {
  it('相手にしか無いものを取り込む', () => {
    const result = mergeById(
      [item('a', '2026-08-01T00:00:00.000Z', 'local')],
      [item('b', '2026-08-01T00:00:00.000Z', 'remote')],
    );
    expect(result.merged).toHaveLength(2);
    expect(result.incoming).toBe(1);
  });

  it('同じ id なら updatedAt が新しい方を採る', () => {
    const result = mergeById(
      [item('a', '2026-08-01T00:00:00.000Z', 'local')],
      [item('a', '2026-08-02T00:00:00.000Z', 'remote')],
    );
    expect(result.merged[0].value).toBe('remote');
    expect(result.incoming).toBe(1);
  });

  it('こちらが新しければ残す', () => {
    const result = mergeById(
      [item('a', '2026-08-03T00:00:00.000Z', 'local')],
      [item('a', '2026-08-02T00:00:00.000Z', 'remote')],
    );
    expect(result.merged[0].value).toBe('local');
    expect(result.outgoing).toBe(1);
  });

  it('2台が別々の行を触っていても両方残る', () => {
    const result = mergeById(
      [
        item('a', '2026-08-03T00:00:00.000Z', 'PCで修正'),
        item('b', '2026-08-01T00:00:00.000Z', 'もとの値'),
      ],
      [
        item('a', '2026-08-01T00:00:00.000Z', 'もとの値'),
        item('b', '2026-08-03T00:00:00.000Z', 'スマホで修正'),
      ],
    );
    const byId = Object.fromEntries(result.merged.map((r) => [r.id, r.value]));
    expect(byId).toEqual({ a: 'PCで修正', b: 'スマホで修正' });
  });

  it('論理削除も更新として扱うので、同期で復活しない', () => {
    const result = mergeById(
      [item('a', '2026-08-01T00:00:00.000Z', 'x')],
      [item('a', '2026-08-02T00:00:00.000Z', 'x', true)],
    );
    expect(result.merged[0].deleted).toBe(true);
  });
});

describe('changedSince', () => {
  it('最終同期より後に更新されたものを返す', () => {
    const items = [
      item('a', '2026-08-01T00:00:00.000Z', 'old'),
      item('b', '2026-08-05T00:00:00.000Z', 'new'),
    ];
    expect(changedSince(items, '2026-08-03T00:00:00.000Z').map((i) => i.id)).toEqual(['b']);
  });

  it('一度も同期していなければ全件が未同期', () => {
    const items = [item('a', '2026-08-01T00:00:00.000Z', 'x')];
    expect(changedSince(items, null)).toHaveLength(1);
  });
});
