import type { ReactNode } from 'react';
import './ui.css';

interface AppShellProps {
  title: string;
  /** 現在の期の名称。日常の画面は現在の期しか扱わないので常に見える位置に出す */
  termName?: string | null;
  /** 見出し帯の右側に置く操作（同期ボタンなど） */
  headerAction?: ReactNode;
  children: ReactNode;
}

/**
 * 全画面共通の外枠。見出し帯と、幅を揃えた本文の器だけを持つ。
 * スマホと PC で同じ構造を使い、幅と並べ方だけを CSS で切り替える。
 */
export function AppShell({ title, termName, headerAction, children }: AppShellProps) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__inner">
          <div>
            <h1 className="app-header__title">{title}</h1>
            {termName ? <p className="app-header__term">{termName}</p> : null}
          </div>
          {headerAction}
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
