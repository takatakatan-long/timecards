import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import {
  ReauthRequiredError,
  isConfigured,
  resolveDriveStatus,
  runSync,
  unsyncedCount,
} from '../data/drive/service';
import { loadConfig } from '../data/repository';
import type { Config } from '../domain/types';

interface SyncCardProps {
  /** 同期でデータが変わったら画面を読み直すために呼ぶ */
  onSynced: () => void;
  onOpenSettings: () => void;
}

/** ISO の日時を「8月29日 18:42」の形にする */
function formatSyncedAt(value: string | null): string {
  if (!value) return 'まだ同期していません';
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

/**
 * ホームに常時置く同期の状態。
 * 自動同期はしないので、最終同期日時と未同期件数を出して押し忘れに気づけるようにする。
 */
export function SyncCard({ onSynced, onOpenSettings }: SyncCardProps) {
  const [config, setConfig] = useState<Config | null>(null);
  const [pending, setPending] = useState(0);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setConfig(await loadConfig());
    setPending(await unsyncedCount());
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void refresh();
  }, [refresh]);

  // 接続先が未設定のうちは同期の仕組みごと出さない
  if (!isConfigured() || !config) return null;

  const status = resolveDriveStatus(config);

  if (status === 'disconnected') {
    return (
      <section className="card">
        <div className="section-title">同期</div>
        <div className="row__sub">
          Google Drive に接続すると、スマホと PC で同じ記録を見られます。
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={onOpenSettings}
        >
          設定から接続する
        </button>
      </section>
    );
  }

  const handleSync = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const result = await runSync();
      setMessage(`同期しました（取り込み ${result.pulled} 件 ／ 送信 ${result.pushed} 件）`);
      onSynced();
    } catch (cause) {
      setMessage(
        cause instanceof ReauthRequiredError
          ? '接続が切れています。設定から接続し直してください'
          : cause instanceof Error
            ? cause.message
            : '同期に失敗しました',
      );
    } finally {
      setRunning(false);
      await refresh();
    }
  };

  return (
    <section className="card">
      <div className="section-title">同期</div>

      {status === 'reauth' ? (
        <div className="alert" style={{ marginBottom: 'var(--space-3)' }}>
          <Icon name="alert" size={20} className="alert__icon" />
          <div>Google の接続が切れています。同期されていません。</div>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div className="row__body">
          <div className="row__title">最終同期 {formatSyncedAt(config.lastSyncedAt)}</div>
          <div className="row__sub">
            {pending > 0 ? `未同期 ${pending} 件` : '未同期はありません'}
          </div>
        </div>
        <button
          type="button"
          className="btn btn--accent"
          disabled={running}
          onClick={() => void handleSync()}
        >
          <Icon name="sync" size={20} />
          {running ? '同期中…' : '同期'}
        </button>
      </div>

      {message ? <p className="note">{message}</p> : null}
    </section>
  );
}
