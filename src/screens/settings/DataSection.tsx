import { useRef, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import {
  exportBackup,
  flattenRecords,
  parseBackup,
  restoreBackup,
  serializeBackup,
} from '../../data/backup';
import type { BackupFile } from '../../data/backup';
import { today } from '../../domain/time';

interface DataSectionProps {
  /** 復元でデータが入れ替わったら画面を読み直すために呼ぶ */
  onRestored: () => void;
}

/**
 * データの書き出しと復元。
 *
 * Drive 同期は 2 台を揃える仕組みであってバックアップではない。
 * 片方で誤って消すと、同期でもう片方からも消える。
 * そのため、独立した控えを取る手段を別に用意する。
 */
export function DataSection({ onRestored }: DataSectionProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupFile | null>(null);

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const backup = await exportBackup();
      const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `出勤簿バックアップ-${today()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('バックアップを書き出しました');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '書き出しに失敗しました');
    } finally {
      setBusy(false);
    }
  };

  /** 読み込んだ内容を先に見せる。中身を確かめてから入れ替えられるようにするため */
  const handleFile = async (file: File) => {
    setMessage(null);
    try {
      setPending(parseBackup(await file.text()));
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'ファイルを読めませんでした');
    }
  };

  const handleRestore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setPending(null);
      setMessage('復元しました');
      onRestored();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '復元に失敗しました');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="section-title">データ</div>
      <div className="card">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={busy}
          onClick={() => void handleExport()}
        >
          バックアップを書き出す
        </button>
        <button
          type="button"
          className="btn btn--quiet btn--block"
          style={{ marginTop: 'var(--space-2)' }}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          バックアップから復元
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // 同じファイルを選び直せるように、読み終えたら選択を空に戻す
            event.target.value = '';
            if (file) void handleFile(file);
          }}
        />

        {message ? <p className="note">{message}</p> : null}

        <p className="note">
          全データを 1 つの JSON として書き出します。
          Google Drive の同期は 2 台を揃える仕組みであってバックアップではありません
          （片方で消した記録は、同期するともう片方からも消えます）。
          区切りのよいときに書き出して、端末の外に置いておいてください。
        </p>
      </div>

      {pending ? (
        <Modal title="この内容で復元しますか" onClose={() => setPending(null)}>
          <div className="alert" style={{ marginBottom: 'var(--space-3)' }}>
            <Icon name="alert" size={20} className="alert__icon" />
            <div>
              いま端末にある記録はすべて消え、この内容に置き換わります。元には戻せません。
            </div>
          </div>
          <dl className="summary__grid">
            <div>
              <dt>書き出した日時</dt>
              <dd>{new Date(pending.exportedAt).toLocaleString('ja-JP')}</dd>
            </div>
            <div>
              <dt>期</dt>
              <dd>{pending.terms.length} 件</dd>
            </div>
            <div>
              <dt>スタッフ</dt>
              <dd>{pending.staff.length} 名</dd>
            </div>
            <div>
              <dt>記録</dt>
              <dd>{flattenRecords(pending).length} 件</dd>
            </div>
          </dl>
          <div className="modal__actions">
            <button type="button" className="btn btn--quiet" onClick={() => setPending(null)}>
              やめる
            </button>
            <button
              type="button"
              className="btn btn--accent"
              disabled={busy}
              onClick={() => void handleRestore()}
            >
              復元する
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
