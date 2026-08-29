/**
 * 画面から呼ぶデータ操作をまとめた層。
 * 画面は IndexedDB のことを知らず、この関数群だけを使う。
 */
import {
  CONFIG_KEY,
  STORE_CONFIG,
  STORE_RECORDS,
  STORE_STAFF,
  STORE_TERMS,
  getAll,
  getAllByIndex,
  getByKey,
  put,
  putAll,
} from './db';
import { newId, nowStamp } from './id';
import { toHhMm, toIsoDate, yearMonthOf } from '../domain/time';
import { resolveClockInTime } from '../domain/status';
import { DEFAULT_CONFIG, SHARED_CONFIG_KEYS } from '../domain/types';
import type { AttendanceRecord, Config, HhMm, IsoDate, Staff, Term } from '../domain/types';

// ---------------------------------------------------------------- config

export async function loadConfig(): Promise<Config> {
  const stored = await getByKey<Config>(STORE_CONFIG, CONFIG_KEY);
  // 保存済みの値に無い項目は既定値で埋める（後から設定項目が増えても壊れないように）
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    rounding: { ...DEFAULT_CONFIG.rounding, ...stored?.rounding },
    drive: { ...DEFAULT_CONFIG.drive, ...stored?.drive },
  };
}

export async function saveConfig(config: Config): Promise<void> {
  await put(STORE_CONFIG, config, CONFIG_KEY);
}

export async function patchConfig(patch: Partial<Config>): Promise<Config> {
  const current = await loadConfig();
  // 端末ごとの値（接続状態・最終同期日時）だけを触った場合は更新時刻を進めない。
  // 進めてしまうと、中身が変わっていないのに同期で相手の設定を上書きしてしまうため。
  const touchesShared = SHARED_CONFIG_KEYS.some((key) => key in patch);
  const next: Config = {
    ...current,
    ...patch,
    updatedAt: touchesShared ? nowStamp() : current.updatedAt,
  };
  await saveConfig(next);
  return next;
}

// ---------------------------------------------------------------- staff

/** 既定では在籍中のみ。終了したスタッフも記録は残るので includeInactive で取り出せる */
export async function listStaff(includeInactive = false): Promise<Staff[]> {
  const all = await getAll<Staff>(STORE_STAFF);
  return all
    .filter((s) => !s.deleted && (includeInactive || s.active))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function createStaff(name: string, hourlyWage: number): Promise<Staff> {
  const staff: Staff = {
    id: newId(),
    name,
    hourlyWage,
    active: true,
    updatedAt: nowStamp(),
    deleted: false,
  };
  await put(STORE_STAFF, staff);
  return staff;
}

export async function updateStaff(
  id: string,
  patch: Partial<Omit<Staff, 'id'>>,
): Promise<Staff> {
  const current = await getByKey<Staff>(STORE_STAFF, id);
  if (!current) throw new Error(`スタッフが見つかりません: ${id}`);
  const next: Staff = { ...current, ...patch, id, updatedAt: nowStamp() };
  await put(STORE_STAFF, next);
  return next;
}

// ---------------------------------------------------------------- terms

export async function listTerms(): Promise<Term[]> {
  const all = await getAll<Term>(STORE_TERMS);
  return all
    .filter((t) => !t.deleted)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function getTerm(id: string): Promise<Term | undefined> {
  const term = await getByKey<Term>(STORE_TERMS, id);
  return term && !term.deleted ? term : undefined;
}

/** 新しい期を作成し、以後の記録の所属先にする。名称はユーザーの手入力を受け取る */
export async function createTerm(name: string, startDate: IsoDate): Promise<Term> {
  const term: Term = {
    id: newId(),
    name,
    startDate,
    closedDate: null,
    updatedAt: nowStamp(),
    deleted: false,
  };
  await put(STORE_TERMS, term);
  await patchConfig({ currentTermId: term.id });
  return term;
}

/** 期を締める。締めても記録の修正はできる（ロックはかけない） */
export async function closeTerm(id: string, closedDate: IsoDate): Promise<Term> {
  const current = await getByKey<Term>(STORE_TERMS, id);
  if (!current) throw new Error(`期が見つかりません: ${id}`);
  const next: Term = { ...current, closedDate, updatedAt: nowStamp() };
  await put(STORE_TERMS, next);
  return next;
}

export async function currentTerm(): Promise<Term | undefined> {
  const config = await loadConfig();
  if (!config.currentTermId) return undefined;
  return getTerm(config.currentTermId);
}

// ---------------------------------------------------------------- records

function alive(records: AttendanceRecord[]): AttendanceRecord[] {
  return records.filter((r) => !r.deleted);
}

export async function listRecordsByDate(date: IsoDate): Promise<AttendanceRecord[]> {
  return alive(await getAllByIndex<AttendanceRecord>(STORE_RECORDS, 'date', date));
}

/** 日付の範囲で取り出す。両端を含む */
export async function listRecordsBetween(
  from: IsoDate,
  to: IsoDate,
): Promise<AttendanceRecord[]> {
  const range = IDBKeyRange.bound(from, to);
  const records = await getAllByIndex<AttendanceRecord>(STORE_RECORDS, 'date', range);
  return alive(records).sort((a, b) => a.date.localeCompare(b.date));
}

/** 期の全レコード。集計と明細出力は必ずこの単位の内側で行う */
export async function listRecordsByTerm(termId: string): Promise<AttendanceRecord[]> {
  const records = await getAllByIndex<AttendanceRecord>(STORE_RECORDS, 'termId', termId);
  return alive(records).sort((a, b) => a.date.localeCompare(b.date));
}

/** 明細の出力単位である期 × スタッフ 1 名 */
export async function listRecordsByTermAndStaff(
  termId: string,
  staffId: string,
): Promise<AttendanceRecord[]> {
  const records = await getAllByIndex<AttendanceRecord>(
    STORE_RECORDS,
    'termId_staffId',
    [termId, staffId],
  );
  return alive(records).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getRecord(id: string): Promise<AttendanceRecord | undefined> {
  return getByKey<AttendanceRecord>(STORE_RECORDS, id);
}

/**
 * 同じ日の同じスタッフの記録を探す。
 * 1 人が 1 日に持てる記録は 1 件だけという前提を守るために使う。
 */
export async function findRecordByDateAndStaff(
  date: IsoDate,
  staffId: string,
): Promise<AttendanceRecord | undefined> {
  const records = await getAllByIndex<AttendanceRecord>(STORE_RECORDS, 'date_staffId', [
    date,
    staffId,
  ]);
  return alive(records)[0];
}

/** 同じ日・同じスタッフの記録がすでにあるときに投げる */
export class DuplicateRecordError extends Error {
  /** すでに存在していた記録。呼び出し側が案内に使う */
  existing: AttendanceRecord;

  constructor(existing: AttendanceRecord) {
    super('その日にはすでに記録があります');
    this.name = 'DuplicateRecordError';
    this.existing = existing;
  }
}

/**
 * 出勤予定を 1 件登録する。入力項目は日付・スタッフ・出勤時刻の 3 つ。
 * 同じ人が同じ日に二重に並ぶと打刻も集計も破綻するため、既にあれば登録しない。
 */
export async function createPlan(input: {
  termId: string;
  staffId: string;
  date: IsoDate;
  startTime: HhMm;
}): Promise<AttendanceRecord> {
  const existing = await findRecordByDateAndStaff(input.date, input.staffId);
  if (existing) throw new DuplicateRecordError(existing);
  const record: AttendanceRecord = {
    id: newId(),
    termId: input.termId,
    staffId: input.staffId,
    date: input.date,
    kind: 'plan',
    startTime: input.startTime,
    endTime: null,
    workPlace: '',
    breakMinutes: 0,
    hourlyWage: null,
    updatedAt: nowStamp(),
    deleted: false,
  };
  await put(STORE_RECORDS, record);
  return record;
}

export async function updateRecord(
  id: string,
  patch: Partial<Omit<AttendanceRecord, 'id'>>,
): Promise<AttendanceRecord> {
  const current = await getRecord(id);
  if (!current) throw new Error(`記録が見つかりません: ${id}`);
  const next: AttendanceRecord = { ...current, ...patch, id, updatedAt: nowStamp() };
  await put(STORE_RECORDS, next);
  return next;
}

/** 論理削除。物理削除すると同期で復活してしまうため deleted を立てるだけにする */
export async function deleteRecord(id: string): Promise<void> {
  await updateRecord(id, { deleted: true });
}

/**
 * 出勤の打刻。予定を実績に昇格させる。
 *
 * 確定する時刻は予定と実際の早いほう（resolveClockInTime を参照）。
 * startTime を渡した場合はその値をそのまま使う（修正画面からの手入力）。
 * このときの時給をレコードに焼き付け、後の時給改定が過去に遡らないようにする。
 */
export async function clockIn(
  recordId: string,
  options: { startTime?: HhMm; stampedAt?: Date } = {},
): Promise<AttendanceRecord> {
  const record = await getRecord(recordId);
  if (!record) throw new Error(`記録が見つかりません: ${recordId}`);
  const staff = await getByKey<Staff>(STORE_STAFF, record.staffId);
  const startTime =
    options.startTime ??
    resolveClockInTime(record.startTime, toHhMm(options.stampedAt ?? new Date()));
  return updateRecord(recordId, {
    kind: 'actual',
    startTime,
    hourlyWage: record.hourlyWage ?? staff?.hourlyWage ?? null,
  });
}

/** 予定が無い日の出勤打刻。急な人手増や予定の入れ忘れに対応する */
export async function clockInWithoutPlan(input: {
  termId: string;
  staffId: string;
  date: IsoDate;
  startTime: HhMm;
}): Promise<AttendanceRecord> {
  const existing = await findRecordByDateAndStaff(input.date, input.staffId);
  if (existing) throw new DuplicateRecordError(existing);
  const staff = await getByKey<Staff>(STORE_STAFF, input.staffId);
  const record: AttendanceRecord = {
    id: newId(),
    termId: input.termId,
    staffId: input.staffId,
    date: input.date,
    kind: 'actual',
    startTime: input.startTime,
    endTime: null,
    workPlace: '',
    breakMinutes: 0,
    hourlyWage: staff?.hourlyWage ?? null,
    updatedAt: nowStamp(),
    deleted: false,
  };
  await put(STORE_RECORDS, record);
  return record;
}

/** 退勤の打刻。打刻した時点の実時刻が初期値で、手動修正できる */
export async function clockOut(
  recordId: string,
  endTime: HhMm,
  workPlace?: string,
): Promise<AttendanceRecord> {
  const patch: Partial<AttendanceRecord> = { kind: 'actual', endTime };
  if (workPlace !== undefined) patch.workPlace = workPlace;
  return updateRecord(recordId, patch);
}

/** 打刻の取り消し。直後の「［変更］」から予定の状態に戻すときに使う */
export async function revertToPlan(recordId: string): Promise<AttendanceRecord> {
  return updateRecord(recordId, { kind: 'plan', endTime: null, hourlyWage: null });
}

/** 予定をまとめてコピーする。shiftDays の分だけ日付をずらす */
export async function copyPlans(
  sourceRecords: AttendanceRecord[],
  shiftDays: number,
): Promise<AttendanceRecord[]> {
  const copies = sourceRecords.map((source) => {
    const date = new Date(`${source.date}T00:00:00`);
    date.setDate(date.getDate() + shiftDays);
    const shifted: AttendanceRecord = {
      ...source,
      id: newId(),
      date: toIsoDate(date),
      kind: 'plan',
      endTime: null,
      workPlace: '',
      hourlyWage: null,
      updatedAt: nowStamp(),
      deleted: false,
    };
    return shifted;
  });
  await putAll(STORE_RECORDS, copies);
  return copies;
}

/** 作業場所の入力補完に使う候補。過去の入力履歴から新しい順に取り出す */
export async function workPlaceSuggestions(limit = 20): Promise<string[]> {
  const all = alive(await getAll<AttendanceRecord>(STORE_RECORDS));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const record of all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const place = record.workPlace.trim();
    if (!place || seen.has(place)) continue;
    seen.add(place);
    result.push(place);
    if (result.length >= limit) break;
  }
  return result;
}

/** バックアップと同期で月別ファイルに振り分けるためのグループ化 */
export function groupRecordsByMonth(
  records: AttendanceRecord[],
): Map<string, AttendanceRecord[]> {
  const groups = new Map<string, AttendanceRecord[]>();
  for (const record of records) {
    const key = yearMonthOf(record.date);
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  return groups;
}
