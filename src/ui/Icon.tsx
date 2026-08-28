/*
 * 線画アイコン。絵文字は使わない方針なので、必要なものをここに足していく。
 * すべて 24×24 の座標系で、線の色は currentColor に従う（置いた場所の文字色になる）。
 */

export type IconName =
  | 'list' // 出勤一覧表
  | 'calendar' // 出勤予定
  | 'printer' // 明細出力
  | 'settings' // 設定
  | 'sync' // 同期
  | 'alert' // 打刻漏れなどの警告
  | 'chevron-right' // 行の送り
  | 'clock'; // 時刻

interface IconProps {
  name: IconName;
  /** 一辺の大きさ（px） */
  size?: number;
  className?: string;
}

const PATHS: Record<IconName, React.ReactNode> = {
  list: (
    <>
      <path d="M8 6h12M8 12h12M8 18h12" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V3h10v6" />
      <path d="M7 19H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="15" width="10" height="6" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
    </>
  ),
  sync: (
    <>
      <path d="M20 11a8 8 0 0 0-14-4.5L3.5 9" />
      <path d="M4 13a8 8 0 0 0 14 4.5L20.5 15" />
      <path d="M3.5 4.5V9H8M20.5 19.5V15H16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 2.8 20h18.4z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.4h.01" />
    </>
  ),
  'chevron-right': <path d="m9.5 5 7 7-7 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.4l3.4 2" />
    </>
  ),
};

export function Icon({ name, size = 24, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
