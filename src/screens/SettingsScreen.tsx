import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import {
  closeTerm,
  createStaff,
  createTerm,
  currentTerm,
  listRecordsByTerm,
  listStaff,
  loadConfig,
  patchConfig,
  updateStaff,
} from '../data/repository';
import { unresolvedRecords } from '../domain/status';
import { DataSection } from './settings/DataSection';
import { WageSection } from './settings/WageSection';
import { today } from '../domain/time';
import {
  connect as connectDrive,
  disconnect as disconnectDrive,
  isConfigured as isDriveConfigured,
  resolveDriveStatus,
} from '../data/drive/service';
import { DEFAULT_CONFIG } from '../domain/types';
import type { Config, DriveStatus, Staff, Term } from '../domain/types';

interface SettingsScreenProps {
  onBack: () => void;
}

/**
 * 設定画面。
 * 現時点では「期」と「スタッフ」だけ。賃金計算・事業者・Google Drive・データは後の工程で足す。
 */
export function SettingsScreen({ onBack }: SettingsScreenProps) {
  const [term, setTerm] = useState<Term | undefined>(undefined);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [businessName, setBusinessName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [closeOpen, setCloseOpen] = useState(false);
  const [drive, setDrive] = useState<{ status: DriveStatus; accountName: string | null; folderName: string | null } | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState<string | null>(null);
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [staffDialog, setStaffDialog] = useState<Staff | 'new' | null>(null);

  const reload = useCallback(async () => {
    const config: Config = await loadConfig();
    setConfig(config);
    setTerm(await currentTerm());
    setStaff(await listStaff(true));
    setBusinessName(config.businessName);
    setSavedName(config.businessName);
    setDrive({ ...config.drive, status: resolveDriveStatus(config) });
  }, []);

  useEffect(() => {
    // 同上。IndexedDB からの読み込みなので描画中には決められない
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  return (
    <AppShell
      title="設定"
      termName={term?.name ?? null}
      headerAction={
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          戻る
        </button>
      }
    >
      <section>
        <div className="section-title">期</div>
        <div className="card">
          {term ? (
            <>
              <div className="row__title">{term.name}</div>
              <div className="row__sub">
                開始 {term.startDate}
                {term.closedDate ? ` ／ 締め ${term.closedDate}` : ' ／ 進行中'}
              </div>
            </>
          ) : (
            <div className="row__sub">まだ期がありません。最初の期を作成してください。</div>
          )}
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 'var(--space-3)' }}
            onClick={() => setTermDialogOpen(true)}
          >
            新しい期を作成
          </button>
          {term && !term.closedDate ? (
            <button
              type="button"
              className="btn btn--quiet btn--block"
              style={{ marginTop: 'var(--space-2)' }}
              onClick={() => setCloseOpen(true)}
            >
              期を締める
            </button>
          ) : null}
          <p className="note">
            期を変えると、以後の記録は新しい期に属します。過去の期は削除されず、いつでも明細を出し直せます。
            締めたあとでも記録は修正できます（後から誤りが見つかることがあるため、締めても鍵はかけません）。
          </p>
        </div>
      </section>

      <section>
        <div className="section-title">スタッフ</div>
        <div className="card card--flush">
          {staff.length === 0 ? (
            <p className="empty">まだ登録がありません</p>
          ) : (
            staff.map((member) => (
              <button
                type="button"
                className="row"
                key={member.id}
                onClick={() => setStaffDialog(member)}
              >
                <div className="row__body">
                  <div className="row__title">
                    {member.name}
                    {member.active ? null : <span className="chip chip--plain">終了</span>}
                  </div>
                  <div className="row__sub">時給 {member.hourlyWage.toLocaleString()} 円</div>
                </div>
                <Icon name="chevron-right" size={20} className="row__chevron" />
              </button>
            ))
          )}
        </div>
        <button
          type="button"
          className="btn btn--quiet btn--block"
          style={{ marginTop: 'var(--space-3)' }}
          onClick={() => setStaffDialog('new')}
        >
          スタッフを追加
        </button>
        <p className="note">
          時給の改定は過去の記録に遡りません。記録には打刻した時点の時給が保存されます。
        </p>
      </section>

      <section>
        <div className="section-title">事業者</div>
        <div className="card">
          <label className="field">
            <span className="field__label">事業者名</span>
            <input
              type="text"
              className="field__input"
              value={businessName}
              placeholder="未入力"
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={businessName === savedName}
            onClick={() =>
              void patchConfig({ businessName: businessName.trim() }).then((next) => {
                setBusinessName(next.businessName);
                setSavedName(next.businessName);
              })
            }
          >
            保存
          </button>
          <p className="note">
            明細のヘッダーに印字します。未入力のままなら、明細にその欄を出しません。
            この値は端末内と Google Drive にのみ保存されます。
          </p>
        </div>
      </section>

      <WageSection rule={config.rounding} onSaved={() => void reload()} />

      {isDriveConfigured() ? (
        <section>
          <div className="section-title">Google Drive</div>
          <div className="card">
            {drive?.status === 'connected' ? (
              <>
                <div className="row__title">接続中</div>
                <div className="row__sub">
                  {drive.accountName ?? 'Google アカウント'}
                  {drive.folderName ? ` ／ 保存先 ${drive.folderName}` : ''}
                </div>
                <button
                  type="button"
                  className="btn btn--quiet btn--block"
                  style={{ marginTop: 'var(--space-3)' }}
                  disabled={driveBusy}
                  onClick={() =>
                    void (async () => {
                      setDriveBusy(true);
                      try {
                        await disconnectDrive();
                        setDriveMessage('接続を解除しました');
                        await reload();
                      } finally {
                        setDriveBusy(false);
                      }
                    })()
                  }
                >
                  接続を解除
                </button>
              </>
            ) : null}

            {drive?.status === 'reauth' ? (
              <div className="alert" style={{ marginBottom: 'var(--space-3)' }}>
                <Icon name="alert" size={20} className="alert__icon" />
                <div>
                  接続が切れています。この状態では同期されません。接続し直してください。
                </div>
              </div>
            ) : null}

            {drive?.status !== 'connected' ? (
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={driveBusy}
                onClick={() =>
                  void (async () => {
                    setDriveBusy(true);
                    setDriveMessage(null);
                    try {
                      await connectDrive();
                      setDriveMessage('接続しました');
                      await reload();
                    } catch (cause) {
                      setDriveMessage(
                        cause instanceof Error ? cause.message : '接続できませんでした',
                      );
                    } finally {
                      setDriveBusy(false);
                    }
                  })()
                }
              >
                {drive?.status === 'reauth' ? '接続し直す' : 'Googleアカウントに接続'}
              </button>
            ) : null}

            {driveMessage ? <p className="note">{driveMessage}</p> : null}
            <p className="note">
              同期は自動では行いません。ホームの「同期」を押したときだけ、Drive とやり取りします。
              このアプリが読み書きできるのは、Drive の中でもこのアプリが作ったファイルだけです。
            </p>
          </div>
        </section>
      ) : null}

      <DataSection onRestored={() => void reload()} />

      {closeOpen && term ? (
        <CloseTermDialog
          term={term}
          onClose={() => setCloseOpen(false)}
          onClosed={async () => {
            setCloseOpen(false);
            await reload();
          }}
        />
      ) : null}

      {termDialogOpen ? (
        <TermDialog
          onClose={() => setTermDialogOpen(false)}
          onSaved={async () => {
            setTermDialogOpen(false);
            await reload();
          }}
        />
      ) : null}

      {staffDialog ? (
        <StaffDialog
          target={staffDialog}
          onClose={() => setStaffDialog(null)}
          onSaved={async () => {
            setStaffDialog(null);
            await reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}

/** 期の作成。名称はユーザーが手入力する（自動命名はしない） */
function TermDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const startDate = today();
  // 開始日を元にした候補を初期値に置くが、必ず編集できるようにする
  const [name, setName] = useState(`${Number(startDate.slice(0, 4))}年 ${Number(startDate.slice(5, 7))}月〜`);
  const [start, setStart] = useState(startDate);

  return (
    <Modal title="新しい期を作成" onClose={onClose}>
      <label className="field">
        <span className="field__label">名称</span>
        <input
          type="text"
          className="field__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">開始日</span>
        <input
          type="date"
          className="field__input"
          value={start}
          onChange={(event) => setStart(event.target.value)}
        />
      </label>
      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={name.trim() === ''}
          onClick={() => void createTerm(name.trim(), start).then(onSaved)}
        >
          作成
        </button>
      </div>
    </Modal>
  );
}

/** スタッフの追加と編集。完全削除は用意しない（記録の集計が壊れるため） */
function StaffDialog({
  target,
  onClose,
  onSaved,
}: {
  target: Staff | 'new';
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = target === 'new' ? null : target;
  const [name, setName] = useState(existing?.name ?? '');
  const [wage, setWage] = useState(String(existing?.hourlyWage ?? ''));
  const [active, setActive] = useState(existing?.active ?? true);

  const wageNumber = Number(wage);
  const canSave = name.trim() !== '' && Number.isInteger(wageNumber) && wageNumber > 0;

  const save = async () => {
    if (existing) {
      await updateStaff(existing.id, { name: name.trim(), hourlyWage: wageNumber, active });
    } else {
      await createStaff(name.trim(), wageNumber);
    }
    onSaved();
  };

  return (
    <Modal title={existing ? 'スタッフの編集' : 'スタッフを追加'} onClose={onClose}>
      <label className="field">
        <span className="field__label">氏名</span>
        <input
          type="text"
          className="field__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="field">
        <span className="field__label">時給（円）</span>
        <input
          type="number"
          inputMode="numeric"
          className="field__input"
          value={wage}
          onChange={(event) => setWage(event.target.value)}
        />
      </label>
      {existing ? (
        <label className="field field--inline">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
          />
          <span className="field__label">在籍中</span>
        </label>
      ) : null}
      {existing && !active ? (
        <p className="note">
          終了にすると打刻の一覧や絞り込みの選択肢から消えますが、記録は残り、過去の明細は出し直せます。
        </p>
      ) : null}
      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          キャンセル
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!canSave}
          onClick={() => void save()}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}

/**
 * 期を締める。
 * 打刻漏れが残っていたら警告するが、止めはしない
 * （埋められない記録漏れがあっても締められるようにするため。明細出力と同じ扱い）。
 */
function CloseTermDialog({
  term,
  onClose,
  onClosed,
}: {
  term: Term;
  onClose: () => void;
  onClosed: () => void;
}) {
  const todayDate = today();
  const [closedDate, setClosedDate] = useState(todayDate);
  const [unresolved, setUnresolved] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const records = await listRecordsByTerm(term.id);
      // oxlint-disable-next-line react/set-state-in-effect
      setUnresolved(unresolvedRecords(records, todayDate).length);
    })();
  }, [term.id, todayDate]);

  return (
    <Modal title="期を締める" onClose={onClose}>
      <p className="modal__subject">{term.name}</p>

      {unresolved !== null && unresolved > 0 ? (
        <div className="alert" style={{ marginBottom: 'var(--space-3)' }}>
          <Icon name="alert" size={20} className="alert__icon" />
          <div>
            打刻漏れが {unresolved} 件残っています。この分は集計と明細に入りません。
            このまま締めることもできます。
          </div>
        </div>
      ) : null}

      <label className="field">
        <span className="field__label">締め日</span>
        <input
          type="date"
          className="field__input"
          value={closedDate}
          onChange={(event) => setClosedDate(event.target.value)}
        />
      </label>

      <p className="note">
        締めても記録は修正でき、明細も出し直せます。日常の画面に別の期を出すには、
        あらためて「新しい期を作成」してください。
      </p>

      <div className="modal__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          やめる
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!closedDate}
          onClick={() => void closeTerm(term.id, closedDate).then(onClosed)}
        >
          締める
        </button>
      </div>
    </Modal>
  );
}
