import { AppShell } from './ui/AppShell';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/Icon';

/**
 * ホーム画面。
 * 現時点ではレイアウトと配色の確認用で、中身は仮の値を直書きしている。
 * 打刻するスタッフ行とデータの読み書きは次の工程で入れる。
 */

/** ホームからの導線。「出勤退勤の記録」は出勤一覧表に統合しているので置かない */
const MENU: { name: IconName; title: string; sub: string }[] = [
  { name: 'list', title: '出勤一覧表', sub: '過去の記録の確認と修正・人件費の集計' },
  { name: 'calendar', title: '出勤予定', sub: '出勤日と出勤時刻の登録' },
  { name: 'printer', title: '明細出力', sub: '期 × スタッフ 1 名で印刷' },
  { name: 'settings', title: '設定', sub: '期・スタッフ・時給・同期' },
];

function SyncStatus() {
  return (
    <section className="card">
      <div className="section-title">同期</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <div className="row__body">
          <div className="row__title">最終同期 2026-08-28 18:42</div>
          <div className="row__sub">未同期 3 件</div>
        </div>
        <button type="button" className="btn btn--accent">
          <Icon name="sync" size={20} />
          同期
        </button>
      </div>
    </section>
  );
}

function App() {
  return (
    <AppShell title="出勤簿" termName="2026年 夏期">
      <div className="alert">
        <Icon name="alert" size={20} className="alert__icon" />
        <div>打刻漏れが 1 件あります（8月27日）</div>
      </div>

      <SyncStatus />

      <section>
        <div className="section-title">本日 8月29日（土）</div>
        <div className="card card--flush">
          {/* 仮の行。3 状態の出し分けは次の工程で実装する */}
          <div className="row">
            <div className="row__body">
              <div className="row__title">田中 太郎</div>
              <div className="row__sub">
                <span className="chip">
                  <Icon name="clock" size={14} />
                  予定 8:00
                </span>
              </div>
            </div>
            <button type="button" className="btn btn--stamp btn--primary">
              出勤
            </button>
          </div>
          <div className="row">
            <div className="row__body">
              <div className="row__title">鈴木 花子</div>
              <div className="row__sub">出勤 8:00</div>
            </div>
            <button type="button" className="btn btn--stamp btn--accent">
              退勤
            </button>
          </div>
          <div className="row">
            <div className="row__body">
              <div className="row__title">佐藤 次郎</div>
              <div className="row__sub">8:00 〜 16:52 ／ 第一圃場</div>
            </div>
            <Icon name="chevron-right" size={20} className="row__chevron" />
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">メニュー</div>
        <div className="card card--flush">
          {MENU.map((entry) => (
            <button type="button" className="row" key={entry.title}>
              <Icon name={entry.name} size={22} className="row__icon" />
              <div className="row__body">
                <div className="row__title">{entry.title}</div>
                <div className="row__sub">{entry.sub}</div>
              </div>
              <Icon name="chevron-right" size={20} className="row__chevron" />
            </button>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

export default App;
