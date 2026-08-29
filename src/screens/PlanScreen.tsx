import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import {
  DuplicateRecordError,
  copyPlans,
  createPlan,
  currentTerm,
  deleteRecord,
  listRecordsBetween,
  listStaff,
  updateRecord,
} from '../data/repository';
import { PLAN_STATE_LABEL, groupByDate, planStateOf, plansToCopy } from '../domain/plan';
import {
  WEEKDAY_LABELS,
  addDays,
  calendarGrid,
  daysBetween,
  formatDateLabel,
  formatMonthLabel,
  formatTimeLabel,
  monthBounds,
  shiftMonth,
  today,
  yearMonthOf,
} from '../domain/time';
import type { AttendanceRecord, IsoDate, Staff, Term } from '../domain/types';
import './plan.css';

interface PlanScreenProps {
  onBack: () => void;
}

/**
 * 出勤予定画面。
 * 予定が持つのは出勤時刻だけ（退勤は毎日変動するのでホームの打刻で扱う）。
 * スマホは日付順のリスト、PC は月カレンダー。同じデータを並べ方だけ変えて出す。
 */
export function PlanScreen({ onBack }: PlanScreenProps) {
  const todayDate = today();
  const [month, setMonth] = useState(yearMonthOf(todayDate));
  const [term, setTerm] = useState<Term | undefined>(undefined);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  const reload = useCallback(async () => {
    const loadedTerm = await currentTerm();
    setTerm(loadedTerm);
    setStaff(await listStaff());
    if (!loadedTerm) {
      setRecords([]);
      return;
    }
    const { from, to } = monthBounds(month);
    const loaded = await listRecordsBetween(from, to);
    // 日常の画面には現在の期のものだけを出す
    setRecords(loaded.filter((record) => record.termId === loadedTerm.id));
  }, [month]);

  useEffect(() => {
    // IndexedDB からの読み込みなので描画中には決められない
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  const staffName = (id: string) => staff.find((member) => member.id === id)?.name ?? '（不明）';
  const grouped = groupByDate(records);

  return (
    <AppShell
      title="出勤予定"
      termName={term?.name ?? null}
      headerAction={
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          戻る
        </button>
      }
    >
      <div className="month-nav">
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          前の月
        </button>
        <div className="month-nav__label">{formatMonthLabel(month)}</div>
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          次の月
        </button>
      </div>

      {!term ? (
        <p className="empty">先に設定で期を作成してください。</p>
      ) : (
        <>
          {/* スマホ: 日付順のリスト。予定のない日は行ごと出さない */}
          <section className="plan-list">
            {grouped.length === 0 ? (
              <p className="empty">この月の予定はまだありません</p>
            ) : (
              grouped.map(([date, dayRecords]) => (
                <div className="card card--flush plan-day" key={date}>
                  <div className="plan-day__head">{formatDateLabel(date)}</div>
                  {dayRecords.map((record) => {
                    const state = planStateOf(record, todayDate);
                    return (
                      <div className="row" key={record.id}>
                        <div className="row__body">
                          <div className="row__title">{staffName(record.staffId)}</div>
                          <div className="row__sub">出勤 {formatTimeLabel(record.startTime)}</div>
                        </div>
                        <span className={`chip chip--${state}`}>
                          {state === 'missed' ? <Icon name="alert" size={13} /> : null}
                          {PLAN_STATE_LABEL[state]}
                        </span>
                        <button
                          type="button"
                          className="btn btn--quiet"
                          onClick={() => setEditing(record)}
                        >
                          変更
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>

          {/* PC: 月カレンダー。中身はリストと同じデータ */}
          <section className="plan-calendar card">
            <div className="plan-calendar__grid">
              {WEEKDAY_LABELS.map((label) => (
                <div className="plan-calendar__weekday" key={label}>
                  {label}
                </div>
              ))}
              {calendarGrid(month).map((date, index) => (
                <div
                  className={`plan-calendar__cell${date === todayDate ? ' is-today' : ''}${
                    date ? '' : ' is-blank'
                  }`}
                  key={date ?? `blank-${index}`}
                >
                  {date ? (
                    <>
                      <div className="plan-calendar__date">{Number(date.slice(8, 10))}</div>
                      {records
                        .filter((record) => record.date === date)
                        .map((record) => {
                          const state = planStateOf(record, todayDate);
                          return (
                            <button
                              type="button"
                              className={`plan-calendar__entry is-${state}`}
                              key={record.id}
                              onClick={() => setEditing(record)}
                            >
                              {formatTimeLabel(record.startTime)} {staffName(record.staffId)}
                            </button>
                          );
                        })}
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <div className="plan-actions">
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={staff.length === 0}
              onClick={() => setAddOpen(true)}
            >
              予定を追加
            </button>
            <button
              type="button"
              className="btn btn--quiet btn--block"
              onClick={() => setCopyOpen(true)}
            >
              予定をコピー
            </button>
          </div>
          {staff.length === 0 ? (
            <p className="note">スタッフが登録されていません。設定から登録してください。</p>
          ) : null}
        </>
      )}

      {addOpen && term ? (
        <PlanDialog
          staff={staff}
          defaultDate={`${month}-01` <= todayDate && todayDate <= monthBounds(month).to ? todayDate : `${month}-01`}
          error={addError}
          onClose={() => {
            setAddOpen(false);
            setAddError(null);
          }}
          onSubmit={async (values) => {
            try {
              await createPlan({ termId: term.id, ...values });
            } catch (cause) {
              // 同じ人が同じ日に二重に並ぶと打刻も集計も破綻するため登録しない
              if (cause instanceof DuplicateRecordError) {
                setAddError(
                  `${staffName(values.staffId)} は ${formatDateLabel(values.date)} にすでに登録があります。時刻を変えるならその予定を選んで変更してください。`,
                );
                return;
              }
              throw cause;
            }
            setAddOpen(false);
            setAddError(null);
            await reload();
          }}
        />
      ) : null}

      {editing ? (
        <PlanEditDialog
          record={editing}
          staffName={staffName(editing.staffId)}
          todayDate={todayDate}
          onClose={() => setEditing(null)}
          onSave={async (startTime) => {
            await updateRecord(editing.id, { startTime });
            setEditing(null);
            await reload();
          }}
          onDelete={async () => {
            await deleteRecord(editing.id);
            setEditing(null);
            await reload();
          }}
        />
      ) : null}

      {copyOpen && term ? (
        <CopyDialog
          termId={term.id}
          onClose={() => setCopyOpen(false)}
          onDone={async () => {
            setCopyOpen(false);
            await reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}

/** 予定の登録。入力項目は日付・スタッフ・出勤時刻の 3 つだけ */
function PlanDialog({
  staff,
  defaultDate,
  error,
  onClose,
  onSubmit,
}: {
  staff: Staff[];
  defaultDate: IsoDate;
  /** 登録できなかった理由。二重登録のときに出す */
  error: string | null;
  onClose: () => void;
  onSubmit: (values: { staffId: string; date: IsoDate; startTime: string }) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [staffId, setStaffId] = useState(staff[0]?.id ?? '');
  // 出勤時刻は都度入力する。前回の値を自動で埋めない
  const [startTime, setStartTime] = useState('');

  return (
    <Modal title="予定を追加" onClose={onClose}>
      <label className="field">
        <span className="field__label">日付</span>
        <input
          type="date"
          className="field__input"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">スタッフ</span>
        <select
          className="field__input"
          value={staffId}
          onChange={(event) => setStaffId(event.target.value)}
        >
          {staff.map((member) => (
            <option value={member.id} key={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">出勤時刻</span>
        <input
          type="time"
          className="field__input"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>
      {error ? (
        <div className="alert">
          <Icon name="alert" size={20} className="alert__icon" />
          <div>{error}</div>
        </div>
      ) : null}

      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!date || !staffId || !startTime}
          onClick={() => onSubmit({ date, staffId, startTime })}
        >
          登録
        </button>
      </div>
    </Modal>
  );
}

/** 予定の変更と削除。削除はスタッフ 1 人ずつ（天候による個別の中止に対応するため） */
function PlanEditDialog({
  record,
  staffName,
  todayDate,
  onClose,
  onSave,
  onDelete,
}: {
  record: AttendanceRecord;
  staffName: string;
  todayDate: IsoDate;
  onClose: () => void;
  onSave: (startTime: string) => void;
  onDelete: () => void;
}) {
  const [startTime, setStartTime] = useState(record.startTime ?? '');
  const state = planStateOf(record, todayDate);

  return (
    <Modal title="予定の変更" onClose={onClose}>
      <p className="modal__subject">
        {formatDateLabel(record.date)}　{staffName}
      </p>
      {state === 'fixed' ? (
        <p className="note">
          この日はすでに打刻されています。実績の修正はホームまたは出勤一覧表から行ってください。
        </p>
      ) : null}
      <label className="field">
        <span className="field__label">出勤時刻</span>
        <input
          type="time"
          className="field__input"
          value={startTime}
          disabled={state === 'fixed'}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>
      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={state === 'fixed' || !startTime}
          onClick={() => onSave(startTime)}
        >
          保存
        </button>
      </div>
      <button type="button" className="modal__revert" onClick={onDelete}>
        この予定を削除
      </button>
    </Modal>
  );
}

/**
 * 予定をコピーする。
 * 出勤日が流動的で繰り返しパターンに乗らないため、繰り返し登録は設けない。
 * 週などの単位は使わず、コピー元の期間とコピー先の開始日を日付で指定する。
 */
function CopyDialog({
  termId,
  onClose,
  onDone,
}: {
  termId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const todayDate = today();
  const [from, setFrom] = useState(addDays(todayDate, -7));
  const [to, setTo] = useState(addDays(todayDate, -1));
  const [target, setTarget] = useState(todayDate);
  const [result, setResult] = useState<string | null>(null);

  const sourceDays = daysBetween(from, to) + 1;
  const shiftDays = daysBetween(from, target);
  const valid = sourceDays > 0 && shiftDays !== 0;

  const run = async () => {
    const source = (await listRecordsBetween(from, to)).filter(
      (record) => record.termId === termId,
    );
    const existing = (await listRecordsBetween(target, addDays(target, sourceDays - 1))).filter(
      (record) => record.termId === termId,
    );
    const targets = plansToCopy(source, existing, shiftDays);
    if (targets.length === 0) {
      setResult('コピーする予定がありませんでした（コピー元が空か、すでに登録済みです）');
      return;
    }
    await copyPlans(targets, shiftDays);
    setResult(`${targets.length} 件の予定をコピーしました`);
  };

  return (
    <Modal title="予定をコピー" onClose={onClose}>
      <label className="field">
        <span className="field__label">コピー元の開始日</span>
        <input
          type="date"
          className="field__input"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">コピー元の終了日</span>
        <input
          type="date"
          className="field__input"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">コピー先の開始日</span>
        <input
          type="date"
          className="field__input"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </label>
      <p className="note">
        {valid
          ? `${sourceDays} 日分（${formatDateLabel(from)}〜${formatDateLabel(to)}）を ${formatDateLabel(target)} から並べ直します。すでに同じ人の記録がある日は飛ばします。`
          : '終了日は開始日以降を、コピー先には別の日付を指定してください。'}
      </p>
      {result ? <p className="note">{result}</p> : null}
      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={result ? onDone : onClose}>
          {result ? '閉じる' : 'キャンセル'}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!valid}
          onClick={() => void run()}
        >
          コピー
        </button>
      </div>
    </Modal>
  );
}
