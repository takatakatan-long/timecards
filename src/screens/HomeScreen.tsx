import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { Icon } from '../ui/Icon';
import { Toast } from '../ui/Toast';
import { RecordDialog } from '../ui/RecordDialog';
import type { RecordDialogValues } from '../ui/RecordDialog';
import { useHomeData } from '../app/useHomeData';
import {
  clockIn,
  clockInWithoutPlan,
  clockOut,
  revertToPlan,
  updateRecord,
  workPlaceSuggestions,
} from '../data/repository';
import { rowStatusOf } from '../domain/status';
import { formatDateLabel, formatTimeLabel, toHhMm } from '../domain/time';
import type { AttendanceRecord, Staff } from '../domain/types';
import type { Screen } from '../App';

interface HomeScreenProps {
  onNavigate: (screen: Screen) => void;
}

/** ダイアログで編集中の対象。record が null なら予定の無い日の新規打刻 */
interface EditTarget {
  title: string;
  staff: Staff;
  record: AttendanceRecord | null;
  initial: RecordDialogValues;
  canRevert: boolean;
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const data = useHomeData();
  const [toast, setToast] = useState<{ message: string; onAction?: () => void } | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    void workPlaceSuggestions().then(setSuggestions);
  }, [data.todayRecords]);

  const refresh = useCallback(async () => {
    await data.reload();
    setSuggestions(await workPlaceSuggestions());
  }, [data]);

  /** 記録済・勤務中の行をタップしたときの修正 */
  const openEdit = (staff: Staff, record: AttendanceRecord) => {
    setEditing({
      title: '記録の修正',
      staff,
      record,
      initial: {
        startTime: record.startTime ?? '',
        endTime: record.endTime,
        workPlace: record.workPlace,
      },
      // 予定から昇格したものだけ予定に戻せる
      canRevert: record.kind === 'actual',
    });
  };

  /**
   * 出勤の打刻。予定があればタップ 1 回で予定時刻のまま確定する。
   * 事前確認は挟まず、直後のトーストで取り返せるようにしている。
   */
  const handleClockIn = async (staff: Staff, record: AttendanceRecord | undefined) => {
    if (!record) {
      // 予定が無い日。時刻を手入力してもらう
      setEditing({
        title: '出勤を記録',
        staff,
        record: null,
        initial: { startTime: toHhMm(new Date()), endTime: null, workPlace: '' },
        canRevert: false,
      });
      return;
    }
    const saved = await clockIn(record.id);
    await refresh();
    setToast({
      message: `${staff.name} ${formatTimeLabel(saved.startTime)} で出勤を記録しました`,
      onAction: () => openEdit(staff, saved),
    });
  };

  /** 退勤の打刻。打刻した時点の実時刻を初期値にする */
  const handleClockOut = async (staff: Staff, record: AttendanceRecord) => {
    const endTime = toHhMm(new Date());
    const saved = await clockOut(record.id, endTime);
    await refresh();
    setToast({
      message: `${staff.name} ${formatTimeLabel(endTime)} で退勤を記録しました`,
      onAction: () => openEdit(staff, saved),
    });
  };

  const handleSubmit = async (values: RecordDialogValues) => {
    if (!editing) return;
    if (editing.record) {
      await updateRecord(editing.record.id, {
        kind: 'actual',
        startTime: values.startTime,
        endTime: values.endTime,
        workPlace: values.workPlace,
      });
    } else if (data.term) {
      const created = await clockInWithoutPlan({
        termId: data.term.id,
        staffId: editing.staff.id,
        date: data.todayDate,
        startTime: values.startTime,
      });
      if (values.endTime || values.workPlace) {
        await updateRecord(created.id, {
          endTime: values.endTime,
          workPlace: values.workPlace,
        });
      }
    }
    setEditing(null);
    setToast(null);
    await refresh();
  };

  const handleRevert = async () => {
    if (!editing?.record) return;
    await revertToPlan(editing.record.id);
    setEditing(null);
    setToast(null);
    await refresh();
  };

  const termName = data.term?.name ?? null;

  return (
    <AppShell title="出勤簿" termName={termName}>
      {data.loading ? <p className="empty">読み込み中…</p> : null}

      {data.error ? (
        <div className="alert">
          <Icon name="alert" size={20} className="alert__icon" />
          <div>{data.error}</div>
        </div>
      ) : null}

      {!data.loading && !data.term ? (
        <section className="card">
          <div className="row__title">期がまだ作成されていません</div>
          <p className="row__sub">
            記録は「期」ごとに分けて保存します。設定から最初の期を作成してください。
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => onNavigate({ name: 'settings' })}
          >
            設定を開く
          </button>
        </section>
      ) : null}

      {!data.loading && data.term && data.staff.length === 0 ? (
        <section className="card">
          <div className="row__title">スタッフが登録されていません</div>
          <p className="row__sub">設定でスタッフと時給を登録すると、この画面に打刻の行が並びます。</p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => onNavigate({ name: 'settings' })}
          >
            設定を開く
          </button>
        </section>
      ) : null}

      {data.unresolved.length > 0 ? (
        <div className="alert">
          <Icon name="alert" size={20} className="alert__icon" />
          <div>
            打刻漏れが {data.unresolved.length} 件あります（
            {data.unresolved
              .slice(0, 3)
              .map((record) => formatDateLabel(record.date))
              .join('・')}
            {data.unresolved.length > 3 ? ' ほか' : ''}）
          </div>
        </div>
      ) : null}

      {data.term && data.staff.length > 0 ? (
        <section>
          <div className="section-title">本日 {formatDateLabel(data.todayDate)}</div>
          <div className="card card--flush">
            {data.staff.map((staff) => {
              const record = data.todayRecords.get(staff.id);
              const status = rowStatusOf(record);
              return (
                <div className="row" key={staff.id}>
                  <div className="row__body">
                    <div className="row__title">{staff.name}</div>
                    <div className="row__sub">
                      {status === 'planned' ? (
                        <span className="chip">
                          <Icon name="clock" size={14} />
                          予定 {formatTimeLabel(record?.startTime)}
                        </span>
                      ) : null}
                      {status === 'working' ? `出勤 ${formatTimeLabel(record?.startTime)}` : null}
                      {status === 'finished'
                        ? `${formatTimeLabel(record?.startTime)} 〜 ${formatTimeLabel(
                            record?.endTime,
                          )}${record?.workPlace ? ` ／ ${record.workPlace}` : ''}`
                        : null}
                      {status === 'none' ? (
                        <span className="chip chip--plain">予定なし</span>
                      ) : null}
                    </div>
                  </div>

                  {/* その時に押すべきボタンだけを出す。出勤と退勤を並べない */}
                  {status === 'planned' || status === 'none' ? (
                    <button
                      type="button"
                      className="btn btn--stamp btn--primary"
                      onClick={() => void handleClockIn(staff, record)}
                    >
                      出勤
                    </button>
                  ) : null}
                  {status === 'working' && record ? (
                    <button
                      type="button"
                      className="btn btn--stamp btn--accent"
                      onClick={() => void handleClockOut(staff, record)}
                    >
                      退勤
                    </button>
                  ) : null}
                  {status === 'finished' && record ? (
                    <button
                      type="button"
                      className="btn btn--quiet"
                      onClick={() => openEdit(staff, record)}
                    >
                      修正
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="section-title">メニュー</div>
        <div className="card card--flush">
          <button type="button" className="row" onClick={() => onNavigate({ name: 'records' })}>
            <Icon name="list" size={22} className="row__icon" />
            <div className="row__body">
              <div className="row__title">出勤一覧表</div>
              <div className="row__sub">過去の記録の確認と修正・人件費の集計</div>
            </div>
            <Icon name="chevron-right" size={20} className="row__chevron" />
          </button>
          <button type="button" className="row" onClick={() => onNavigate({ name: 'plans' })}>
            <Icon name="calendar" size={22} className="row__icon" />
            <div className="row__body">
              <div className="row__title">出勤予定</div>
              <div className="row__sub">出勤日と出勤時刻の登録</div>
            </div>
            <Icon name="chevron-right" size={20} className="row__chevron" />
          </button>
          <button
            type="button"
            className="row"
            disabled={!data.term}
            onClick={() =>
              data.term && onNavigate({ name: 'print', termId: data.term.id, staffId: 'all' })
            }
          >
            <Icon name="printer" size={22} className="row__icon" />
            <div className="row__body">
              <div className="row__title">明細出力</div>
              <div className="row__sub">現在の期・全員分を印刷</div>
            </div>
            <Icon name="chevron-right" size={20} className="row__chevron" />
          </button>
          <button type="button" className="row" onClick={() => onNavigate({ name: 'settings' })}>
            <Icon name="settings" size={22} className="row__icon" />
            <div className="row__body">
              <div className="row__title">設定</div>
              <div className="row__sub">期・スタッフ・時給</div>
            </div>
            <Icon name="chevron-right" size={20} className="row__chevron" />
          </button>
        </div>
      </section>

      {toast ? (
        <Toast
          message={toast.message}
          onAction={toast.onAction}
          onClose={() => setToast(null)}
        />
      ) : null}

      {editing ? (
        <RecordDialog
          title={editing.title}
          staffName={editing.staff.name}
          initial={editing.initial}
          suggestions={suggestions}
          onSubmit={(values) => void handleSubmit(values)}
          onRevert={editing.canRevert ? () => void handleRevert() : undefined}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </AppShell>
  );
}
