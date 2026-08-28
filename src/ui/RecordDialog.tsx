import { useState } from 'react';
import { Modal } from './Modal';
import type { HhMm } from '../domain/types';

export interface RecordDialogValues {
  startTime: HhMm;
  endTime: HhMm | null;
  workPlace: string;
}

interface RecordDialogProps {
  title: string;
  staffName: string;
  initial: RecordDialogValues;
  /** 作業場所の入力補完。過去の入力履歴から渡す */
  suggestions: string[];
  onSubmit: (values: RecordDialogValues) => void;
  /** 打刻を取り消して予定の状態に戻す。予定が無かった記録では渡さない */
  onRevert?: () => void;
  onClose: () => void;
}

/**
 * 打刻した時刻と作業場所の修正。
 * 実勤務が予定とずれたとき、退勤時刻を直したいとき、
 * 予定の無い日に手入力で記録するときの入り口を兼ねる。
 */
export function RecordDialog({
  title,
  staffName,
  initial,
  suggestions,
  onSubmit,
  onRevert,
  onClose,
}: RecordDialogProps) {
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime ?? '');
  const [workPlace, setWorkPlace] = useState(initial.workPlace);

  const canSubmit = startTime !== '';

  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal__subject">{staffName}</p>

      <label className="field">
        <span className="field__label">出勤</span>
        <input
          type="time"
          className="field__input"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">退勤</span>
        <input
          type="time"
          className="field__input"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">作業場所</span>
        <input
          type="text"
          className="field__input"
          list="work-place-suggestions"
          value={workPlace}
          placeholder="例: 第一圃場"
          onChange={(event) => setWorkPlace(event.target.value)}
        />
      </label>
      {/* 過去の入力履歴から候補を出す。自由入力は妨げない */}
      <datalist id="work-place-suggestions">
        {suggestions.map((place) => (
          <option value={place} key={place} />
        ))}
      </datalist>

      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({ startTime, endTime: endTime === '' ? null : endTime, workPlace })
          }
        >
          保存
        </button>
      </div>

      {onRevert ? (
        <button type="button" className="modal__revert" onClick={onRevert}>
          打刻を取り消して予定に戻す
        </button>
      ) : null}
    </Modal>
  );
}
