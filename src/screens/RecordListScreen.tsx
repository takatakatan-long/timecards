import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { Icon } from '../ui/Icon';
import { RecordDialog } from '../ui/RecordDialog';
import type { RecordDialogValues } from '../ui/RecordDialog';
import {
  deleteRecord,
  listRecordsByTerm,
  listStaff,
  listTerms,
  loadConfig,
  updateRecord,
  workPlaceSuggestions,
} from '../data/repository';
import { isUnresolved } from '../domain/status';
import {
  formatDateLabel,
  formatDuration,
  formatMonthLabel,
  formatTimeLabel,
  minutesToHours,
  today,
  yearMonthOf,
} from '../domain/time';
import { rawWorkMinutes, recordWage, roundedWorkMinutes, summarize } from '../domain/wage';
import { DEFAULT_CONFIG } from '../domain/types';
import type { AttendanceRecord, Config, Staff, Term } from '../domain/types';
import './records.css';

interface RecordListScreenProps {
  onBack: () => void;
}

/** 労働時間の表示。小数と時分を併記して検算しやすくする */
function hoursLabel(minutes: number): string {
  return `${minutesToHours(minutes).toFixed(2)} h（${formatDuration(minutes)}）`;
}

/**
 * 出勤一覧表。
 * 過去の記録を確認し、行から修正する画面。
 * 締め日は設けず、集計は期 × スタッフ（その期の初出勤日〜最終出勤日）で行う。
 */
export function RecordListScreen({ onBack }: RecordListScreenProps) {
  const todayDate = today();
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [terms, setTerms] = useState<Term[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  // 絞り込み。既定は現在の期・全員・期の全期間
  const [termId, setTermId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string>('all');
  const [month, setMonth] = useState<string>('');

  /** 期・スタッフ・設定は画面を開いたときに 1 度だけ読む */
  useEffect(() => {
    void (async () => {
      const [loadedConfig, loadedTerms, loadedStaff, places] = await Promise.all([
        loadConfig(),
        listTerms(),
        // 終了したスタッフの記録も過去の期には残るので、名前を引けるよう全員を読む
        listStaff(true),
        workPlaceSuggestions(),
      ]);
      setConfig(loadedConfig);
      setTerms(loadedTerms);
      setStaff(loadedStaff);
      setSuggestions(places);
      // 既定は現在の期
      setTermId(loadedConfig.currentTermId ?? loadedTerms[0]?.id ?? null);
    })();
  }, []);

  /** 記録は期が変わるたびに読み直す。修正のあとにも呼ぶ */
  const reloadRecords = useCallback(async () => {
    setRecords(termId ? await listRecordsByTerm(termId) : []);
  }, [termId]);

  useEffect(() => {
    // IndexedDB からの読み込みなので描画中には決められない
    // oxlint-disable-next-line react/set-state-in-effect
    void reloadRecords();
  }, [reloadRecords]);

  const staffName = (id: string) => staff.find((member) => member.id === id)?.name ?? '（不明）';

  /** 絞り込んだ結果。スタッフを選ぶとその期の全期間、月を指定するとその月だけ */
  const filtered = useMemo(
    () =>
      records.filter((record) => {
        if (staffId !== 'all' && record.staffId !== staffId) return false;
        if (month && yearMonthOf(record.date) !== month) return false;
        return true;
      }),
    [records, staffId, month],
  );

  const summary = summarize(filtered, config.rounding);
  const unresolvedCount = filtered.filter((record) => isUnresolved(record, todayDate)).length;

  // 雇用期間はスタッフマスタに持たず、期の中の実記録から導出する
  const workedDates = filtered
    .filter((record) => record.kind === 'actual')
    .map((record) => record.date)
    .sort();
  const periodLabel =
    workedDates.length > 0
      ? `${formatDateLabel(workedDates[0])} 〜 ${formatDateLabel(workedDates[workedDates.length - 1])}`
      : '出勤の記録なし';

  const openEdit = (record: AttendanceRecord) => setEditing(record);

  const handleSubmit = async (values: RecordDialogValues) => {
    if (!editing) return;
    await updateRecord(editing.id, {
      kind: 'actual',
      startTime: values.startTime,
      endTime: values.endTime,
      workPlace: values.workPlace,
    });
    setEditing(null);
    await reloadRecords();
    setSuggestions(await workPlaceSuggestions());
  };

  return (
    <AppShell
      title="出勤一覧表"
      termName={terms.find((term) => term.id === termId)?.name ?? null}
      headerAction={
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          戻る
        </button>
      }
    >
      <section className="card filters">
        <label className="field">
          <span className="field__label">期</span>
          <select
            className="field__input"
            value={termId ?? ''}
            onChange={(event) => {
              setTermId(event.target.value);
              setMonth('');
            }}
          >
            {terms.map((term) => (
              <option value={term.id} key={term.id}>
                {term.name}
                {term.closedDate ? '（締め済）' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">スタッフ</span>
          <select
            className="field__input"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
          >
            <option value="all">全員</option>
            {staff.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
                {member.active ? '' : '（終了）'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">期間</span>
          <input
            type="month"
            className="field__input"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        {month ? (
          <button type="button" className="btn btn--quiet" onClick={() => setMonth('')}>
            期の全期間に戻す
          </button>
        ) : null}
      </section>

      {/* 人件費サマリー。ホームには置かず、この画面の上部に出す */}
      <section className="card summary">
        <div className="section-title">
          {staffId === 'all' ? '全員' : staffName(staffId)}
          {'　'}
          {month ? formatMonthLabel(month) : periodLabel}
        </div>
        <dl className="summary__grid">
          <div>
            <dt>出勤日数</dt>
            <dd>{summary.workDays} 日</dd>
          </div>
          <div>
            <dt>実働時間</dt>
            <dd>{hoursLabel(summary.roundedMinutes)}</dd>
          </div>
          <div>
            <dt>支給額</dt>
            <dd className="summary__amount">{summary.amount.toLocaleString()} 円</dd>
          </div>
        </dl>
        {unresolvedCount > 0 ? (
          <div className="alert" style={{ marginTop: 'var(--space-3)' }}>
            <Icon name="alert" size={20} className="alert__icon" />
            <div>
              打刻漏れが {unresolvedCount} 件あります。この分は集計に入っていません。
            </div>
          </div>
        ) : null}
      </section>

      <section className="card card--flush">
        {filtered.length === 0 ? (
          <p className="empty">記録がありません</p>
        ) : (
          filtered.map((record) => {
            const unresolved = isUnresolved(record, todayDate);
            const minutes = roundedWorkMinutes(record, config.rounding);
            const wage = recordWage(record, config.rounding);
            return (
              <button
                type="button"
                className={`row record-row${unresolved ? ' is-unresolved' : ''}`}
                key={record.id}
                onClick={() => openEdit(record)}
              >
                <div className="row__body">
                  <div className="row__title">
                    {unresolved ? <Icon name="alert" size={16} className="record-row__warn" /> : null}
                    {formatDateLabel(record.date)}
                    {staffId === 'all' ? `　${staffName(record.staffId)}` : ''}
                  </div>
                  <div className="row__sub">
                    {record.startTime ? formatTimeLabel(record.startTime) : '—'} 〜{' '}
                    {record.endTime ? formatTimeLabel(record.endTime) : '未記録'}
                    {record.workPlace ? `　／　${record.workPlace}` : ''}
                  </div>
                </div>
                <div className="record-row__figures">
                  {/* 一覧では丸め後だけを出す。丸め前は修正画面で併記する */}
                  <div className="record-row__hours">
                    {minutes === null ? '—' : `${minutesToHours(minutes).toFixed(2)} h`}
                  </div>
                  <div className="record-row__wage">
                    {wage === null ? '' : `${wage.toLocaleString()} 円`}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </section>

      <p className="note">
        {`労働時間は 1 日の合計を ${config.rounding.unitMinutes} 分単位で${
          config.rounding.direction === 'floor'
            ? '切り捨て'
            : config.rounding.direction === 'ceil'
              ? '切り上げ'
              : '四捨五入'
        }しています。`}
      </p>

      {editing ? (
        <RecordDialog
          title="記録の修正"
          staffName={`${formatDateLabel(editing.date)}　${staffName(editing.staffId)}`}
          initial={{
            startTime: editing.startTime ?? '',
            endTime: editing.endTime,
            workPlace: editing.workPlace,
          }}
          suggestions={suggestions}
          info={<RoundingNote record={editing} config={config} />}
          onSubmit={(values) => void handleSubmit(values)}
          revertLabel="この記録を削除"
          onRevert={
            editing.kind === 'plan'
              ? undefined
              : () =>
                  void (async () => {
                    await deleteRecord(editing.id);
                    setEditing(null);
                    await reloadRecords();
                  })()
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </AppShell>
  );
}

/** 丸め前と丸め後を併記する。金額の根拠を説明できる状態にするため */
function RoundingNote({ record, config }: { record: AttendanceRecord; config: Config }) {
  const raw = rawWorkMinutes(record);
  const rounded = roundedWorkMinutes(record, config.rounding);
  const wage = recordWage(record, config.rounding);
  if (raw === null || rounded === null) {
    return <p className="note">退勤が未記録のため、労働時間と金額は計算できません。</p>;
  }
  return (
    <div className="rounding-note">
      <div>
        <span>実際の勤務</span>
        <span>{hoursLabel(raw)}</span>
      </div>
      <div>
        <span>丸め後</span>
        <span>{hoursLabel(rounded)}</span>
      </div>
      {record.hourlyWage !== null ? (
        <div>
          <span>
            時給 {record.hourlyWage.toLocaleString()} 円 ×{' '}
            {minutesToHours(rounded).toFixed(2)} h
          </span>
          <span>{wage?.toLocaleString()} 円</span>
        </div>
      ) : null}
    </div>
  );
}
