import { useEffect } from 'react';

interface ToastProps {
  message: string;
  /** 「変更」を押したときの動作。省略すると表示しない */
  onAction?: () => void;
  actionLabel?: string;
  onClose: () => void;
  /** 自動で消えるまでの時間（ミリ秒） */
  duration?: number;
}

/**
 * 打刻の直後に「8:00 で記録しました ［変更］」を出すための表示。
 *
 * 事前確認のダイアログを挟まない代わりにこれを出す。
 * タップ 1 回で確定する速さを保ったまま、間違えたときに取り返せるようにするため。
 */
export function Toast({
  message,
  onAction,
  actionLabel = '変更',
  onClose,
  duration = 6000,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timer);
  }, [onClose, duration, message]);

  return (
    <div className="toast" role="status">
      <span className="toast__message">{message}</span>
      {onAction ? (
        <button type="button" className="toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
