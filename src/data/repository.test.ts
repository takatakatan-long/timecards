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
  clockIn,
  clockInWithoutPlan,
  createPlan,
  createStaff,
  getRecord,
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
