import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../ui/AppShell';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';
import {
  createStaff,
  createTerm,
  currentTerm,
  listStaff,
  loadConfig,
  patchConfig,
  updateStaff,
} from '../data/repository';
import { today } from '../domain/time';
import type { Config, Staff, Term } from '../domain/types';

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
  const [termDialogOpen, setTermDialogOpen] = useState(false);
  const [staffDialog, setStaffDialog] = useState<Staff | 'new' | null>(null);

  const reload = useCallback(async () => {
    const config: Config = await loadConfig();
    setTerm(await currentTerm());
    setStaff(await listStaff(true));
    setBusinessName(config.businessName);
    setSavedName(config.businessName);
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
          <p className="note">
            期を変えると、以後の記録は新しい期に属します。過去の期は削除されず、いつでも明細を出し直せます。
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
