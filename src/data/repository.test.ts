// 擬似的な IndexedDB を用意してから、保存の処理を実際に動かす
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  STORE_RECORDS,
  STORE_STAFF,
  STORE_TERMS,
  clearStores,
} from './db';
import {
  DuplicateRecordError,
  clockIn,
  clockInWithoutPlan,
  createPlan,
  createStaff,
  createTerm,
  getRecord,
  listRecordsByTerm,
  plansStrandedBy,
  revertToPlan,
  updateRecord,
} from './repository';
import type { Staff } from '../domain/types';

let staff: Staff;

beforeEach(async () => {
  await clearStores([STORE_RECORDS, STORE_STAFF, STORE_TERMS]);
  staff = await createStaff('田中 太郎', 1200);
});

/**
 * 時給は「実績になった時点の値」をレコードへ焼き付ける。
 * これが抜けると労働時間だけ集計され、金額が 0 のまま静かにずれるので、
 * 実績になりうる経路をすべて押さえておく。
 */
describe('時給の焼き付け', () => {
  it('出勤の打刻で焼き付く', async () => {
    const plan = await createPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '08:30',
    });
    expect(plan.hourlyWage).toBeNull();

    const stamped = await clockIn(plan.id);
    expect(stamped.hourlyWage).toBe(1200);
  });

  it('予定の無い日の打刻で焼き付く', async () => {
    const record = await clockInWithoutPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '08:30',
    });
    expect(record.hourlyWage).toBe(1200);
  });

  it('修正画面から予定を実績へ直したときも焼き付く', async () => {
    // 打刻ボタンを通らない経路。ここが抜けていて金額が 0 になっていた
    const plan = await createPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '08:30',
    });

    const fixed = await updateRecord(plan.id, {
      kind: 'actual',
      startTime: '08:30',
      endTime: '18:00',
      workPlace: '稲吉追原',
    });

    expect(fixed.hourlyWage).toBe(1200);
  });

  it('時給が空のまま残っている記録は、開いて保存し直せば入る', async () => {
    const record = await clockInWithoutPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '09:00',
    });
    // すでに壊れた状態を作る（修正前のアプリで記録された分にあたる）
    await updateRecord(record.id, { hourlyWage: null, kind: 'plan' });
    expect((await getRecord(record.id))?.hourlyWage).toBeNull();

    const resaved = await updateRecord(record.id, { kind: 'actual', endTime: '13:00' });
    expect(resaved.hourlyWage).toBe(1200);
  });

  it('すでに焼き付いた時給は、あとで時給を改定しても書き換えない', async () => {
    const record = await clockInWithoutPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '08:30',
    });
    // 時給を上げてから、その記録の作業場所だけを直す
    await createStaff('別の人', 2000);
    const edited = await updateRecord(record.id, { workPlace: 'ライスセンター' });
    expect(edited.hourlyWage).toBe(1200);
  });

  it('予定へ戻したら時給も外れる', async () => {
    const plan = await createPlan({
      termId: 't1',
      staffId: staff.id,
      date: '2026-09-03',
      startTime: '08:30',
    });
    await clockIn(plan.id);
    const reverted = await revertToPlan(plan.id);
    expect(reverted.kind).toBe('plan');
    expect(reverted.hourlyWage).toBeNull();
  });
});

/**
 * 1 人が 1 日に持てる記録は 1 件だけ。ただし判定は期の内側で行う。
 * 期をまたいで弾くと、前の期に残った予定が新しい期の記録を妨げ、
 * その予定は画面に出ていないため理由が分からなくなる。
 */
describe('同じ日の重複', () => {
  it('同じ期の同じ日には 2 件登録できない', async () => {
    await createPlan({ termId: 't1', staffId: staff.id, date: '2026-09-01', startTime: '08:30' });
    await expect(
      createPlan({ termId: 't1', staffId: staff.id, date: '2026-09-01', startTime: '09:00' }),
    ).rejects.toBeInstanceOf(DuplicateRecordError);
  });

  it('別の期になら同じ日に登録できる', async () => {
    // 前の期に残った予定が、新しい期の記録を妨げてはいけない
    await createPlan({ termId: '前の期', staffId: staff.id, date: '2026-09-01', startTime: '09:00' });
    const record = await clockInWithoutPlan({
      termId: '新しい期',
      staffId: staff.id,
      date: '2026-09-01',
      startTime: '08:30',
    });
    expect(record.hourlyWage).toBe(1200);
  });

  it('別の人なら同じ日に登録できる', async () => {
    const other = await createStaff('鈴木 花子', 1100);
    await createPlan({ termId: 't1', staffId: staff.id, date: '2026-09-01', startTime: '08:30' });
    const second = await createPlan({
      termId: 't1',
      staffId: other.id,
      date: '2026-09-01',
      startTime: '08:30',
    });
    expect(second.staffId).toBe(other.id);
  });
});

describe('期を作るときに取り残される予定', () => {
  beforeEach(async () => {
    await createPlan({ termId: '前の期', staffId: staff.id, date: '2026-09-01', startTime: '09:00' });
    await createPlan({ termId: '前の期', staffId: staff.id, date: '2026-08-20', startTime: '08:00' });
  });

  it('開始日以降に残る予定を数える', async () => {
    const stranded = await plansStrandedBy('2026-08-31');
    expect(stranded.map((r) => r.date)).toEqual(['2026-09-01']);
  });

  it('開始日より前の予定は前の期のものとして残す', async () => {
    const stranded = await plansStrandedBy('2026-08-31');
    expect(stranded.some((r) => r.date === '2026-08-20')).toBe(false);
  });

  it('引き継ぐと新しい期の予定になる', async () => {
    const term = await createTerm('2026年 稲刈り', '2026-08-31', 'move');
    const records = await listRecordsByTerm(term.id);
    expect(records.map((r) => r.date)).toEqual(['2026-09-01']);
  });

  it('削除を選ぶと消える', async () => {
    const term = await createTerm('2026年 稲刈り', '2026-08-31', 'delete');
    expect(await listRecordsByTerm(term.id)).toHaveLength(0);
    expect(await plansStrandedBy('2026-08-31')).toHaveLength(0);
  });

  it('残すを選べば前の期のまま', async () => {
    await createTerm('2026年 稲刈り', '2026-08-31', 'keep');
    expect(await plansStrandedBy('2026-08-31')).toHaveLength(1);
  });
});
