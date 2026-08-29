import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { getTerm, listRecordsByTerm, listStaff, loadConfig } from '../data/repository';
import { buildStatement, staffWithRecords } from '../domain/statement';
import type { Statement } from '../domain/statement';
import {
  formatDateLabel,
  formatDuration,
  formatTimeLabel,
  minutesToHours,
  today,
} from '../domain/time';
import { DEFAULT_CONFIG } from '../domain/types';
import type { Config, Term } from '../domain/types';
import './print.css';

interface PrintScreenProps {
  termId: string;
  /** 'all' なら記録のあるスタッフ全員を 1 名 1 ページで出す */
  staffId: string;
  onBack: () => void;
}

/**
 * 明細出力。
 * HTML を組み、ブラウザの印刷機能で出す。ボタンを押すとまず画面に出るのでプレビューを兼ねる。
 * 印刷はモノクロ前提なので、色に意味を持たせない。
 */
export function PrintScreen({ termId, staffId, onBack }: PrintScreenProps) {
  const todayDate = today();
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [term, setTerm] = useState<Term | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [warned, setWarned] = useState(false);

  useEffect(() => {
    void (async () => {
      const [loadedConfig, loadedTerm, allStaff, records] = await Promise.all([
        loadConfig(),
        getTerm(termId),
        listStaff(true),
        listRecordsByTerm(termId),
      ]);
      setConfig(loadedConfig);
      setTerm(loadedTerm);
      const targets =
        staffId === 'all'
          ? staffWithRecords(allStaff, records)
          : allStaff.filter((member) => member.id === staffId);
      setStatements(
        targets.map((member) =>
          buildStatement(member, records, loadedConfig.rounding, todayDate),
        ),
      );
      setLoading(false);
    })();
  }, [termId, staffId, todayDate]);

  const unresolvedTotal = statements.reduce(
    (sum, statement) => sum + statement.unresolved.length,
    0,
  );

  if (loading) {
    return <p className="empty">読み込み中…</p>;
  }

  return (
    <div className="print-screen">
      {/* 印刷には出さない操作列 */}
      <div className="print-toolbar">
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          戻る
        </button>
        <div className="print-toolbar__title">
          明細 ／ {term?.name ?? ''} ／ {statements.length} 名
        </div>
        <button type="button" className="btn btn--primary" onClick={() => window.print()}>
          印刷
        </button>
      </div>

      {statements.length === 0 ? (
        <p className="empty">対象の記録がありません</p>
      ) : (
        statements.map((statement) => (
          <StatementPage
            statement={statement}
            businessName={config.businessName}
            key={statement.staff.id}
          />
        ))
      )}

      {/*
        未確定の記録が残っていても出力は止めない。
        止めてしまうと、埋められない記録漏れが残った過去の期の明細を二度と出せなくなるため。
      */}
      {!warned && unresolvedTotal > 0 ? (
        <Modal title="未確定の記録があります" onClose={() => setWarned(true)}>
          <p className="modal__subject">
            打刻が済んでいない記録が {unresolvedTotal} 件あります。
            この分は明細に含まれず、支給額にも入りません。
          </p>
          <div className="modal__actions">
            <button type="button" className="btn btn--quiet" onClick={onBack}>
              戻って修正する
            </button>
            <button type="button" className="btn btn--primary" onClick={() => setWarned(true)}>
              このまま出力する
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/** 明細 1 枚。1 名 1 ページで改ページする */
function StatementPage({
  statement,
  businessName,
}: {
  statement: Statement;
  businessName: string;
}) {
  const period =
    statement.from && statement.to
      ? `${formatDateLabel(statement.from)} 〜 ${formatDateLabel(statement.to)}`
      : '出勤の記録なし';

  return (
    <article className="print-page">
      <h1 className="print-page__title">出勤簿・支給明細</h1>

      <table className="print-header">
        <tbody>
          <tr>
            <th>氏名</th>
            <td>{statement.staff.name}</td>
          </tr>
          {/* 事業者名は未入力なら欄ごと出さない */}
          {businessName ? (
            <tr>
              <th>事業者</th>
              <td>{businessName}</td>
            </tr>
          ) : null}
          <tr>
            <th>期間</th>
            <td>{period}</td>
          </tr>
          <tr>
            <th>時給</th>
            <td>
              {statement.hourlyWages.length === 0
                ? '—'
                : statement.hourlyWages.map((wage) => `${wage.toLocaleString()} 円`).join(' ／ ')}
            </td>
          </tr>
          <tr>
            <th>出勤日数</th>
            <td>{statement.workDays} 日</td>
          </tr>
          <tr>
            <th>労働時間</th>
            <td>
              {minutesToHours(statement.totalMinutes).toFixed(2)} h（
              {formatDuration(statement.totalMinutes)}）
            </td>
          </tr>
          <tr>
            <th>支給額</th>
            <td className="print-header__amount">{statement.amount.toLocaleString()} 円</td>
          </tr>
        </tbody>
      </table>

      <table className="print-lines">
        <thead>
          <tr>
            <th>日付</th>
            <th>勤務時間帯</th>
            <th className="is-number">労働時間</th>
            <th>作業場所</th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line) => (
            <tr key={`${line.date}-${line.startTime}`}>
              <td>{formatDateLabel(line.date)}</td>
              <td>
                {formatTimeLabel(line.startTime)}〜{formatTimeLabel(line.endTime)}
              </td>
              {/* 行ごとの金額は出さない（合計のみ）。画面の一覧表とは意図的に違える */}
              <td className="is-number">{line.hours.toFixed(2)}</td>
              <td>{line.workPlace}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
