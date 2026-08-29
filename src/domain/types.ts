/**
 * ドメインの型定義。
 *
 * 保存する値の約束事:
 * - 日付は 'YYYY-MM-DD'、時刻は 'HH:MM' の文字列で持つ（Date 型は保存しない）。
 *   タイムゾーンの影響を受けず、JSON にそのまま書けるため。
 * - 金額は円の整数。小数は使わない。
 * - 打刻は丸めない生の時刻を保存する。15 分丸めは表示・計算時に適用する。
 */

/** 'YYYY-MM-DD' */
export type IsoDate = string;
/** 'HH:MM'（24 時間表記） */
export type HhMm = string;
/** ISO 8601 の日時文字列（UTC）。レコードの更新時刻に使う */
export type IsoDateTime = string;
/** 'YYYY-MM' */
export type YearMonth = string;

/** 同期時にレコード単位でマージするために全レコードが持つ共通項目 */
export interface Syncable {
  /** UUID */
  id: string;
  /** 最終更新時刻。マージ時は新しい方を採用する */
  updatedAt: IsoDateTime;
  /** 論理削除。物理削除すると同期で復活してしまうため実際には消さない */
  deleted: boolean;
}

/** スタッフ。期をまたいで永続する（再雇用時に登録し直さない） */
export interface Staff extends Syncable {
  name: string;
  /** 時給（円）。改定しても過去のレコードには遡らない */
  hourlyWage: number;
  /** 在籍中なら true。false でも記録は残り、過去の明細は再出力できる */
  active: boolean;
}

/** 期（有期雇用の 1 サイクル）。集計と明細出力はこの内側だけで行う */
export interface Term extends Syncable {
  /** ユーザーが手入力する名称。自動命名はしない */
  name: string;
  startDate: IsoDate;
  /** 締めた日。未締めなら null。締めても修正はできる */
  closedDate: IsoDate | null;
}

/**
 * 予定と実績。同一構造を kind で区別する。
 * - plan: 出勤予定。startTime のみを持つ（退勤は毎日変動するため予定にしない）
 * - actual: 実績。出勤を打刻すると plan から昇格する
 */
export type RecordKind = 'plan' | 'actual';

export interface AttendanceRecord extends Syncable {
  termId: string;
  staffId: string;
  date: IsoDate;
  kind: RecordKind;
  /** 出勤時刻（生の値。丸めない） */
  startTime: HhMm | null;
  /** 退勤時刻（生の値。未打刻なら null） */
  endTime: HhMm | null;
  /** 作業場所。毎日異なるため記録 1 件ごとに持つ */
  workPlace: string;
  /** 休憩時間。仕様上は常に 0。将来の拡張のために場所だけ確保している */
  breakMinutes: number;
  /**
   * 実績確定時点の時給のスナップショット（円）。
   * plan の段階では null。時給改定を過去に遡らせないためにレコード側で持つ。
   */
  hourlyWage: number | null;
}

/** 丸めの方向 */
export type RoundingDirection = 'floor' | 'ceil' | 'round';

export interface RoundingRule {
  /** 丸めの単位（分）。既定 15 */
  unitMinutes: number;
  /** 既定は切り捨て */
  direction: RoundingDirection;
  /** 丸めの対象。1 日の労働時間合計に対して適用する */
  target: 'dailyTotal';
}

/** Google Drive の接続状態。「同期したつもりで繋がっていない」を検知するため要再認証を独立させる */
export type DriveStatus = 'disconnected' | 'connected' | 'reauth';

export interface DriveSettings {
  status: DriveStatus;
  accountName: string | null;
  folderName: string | null;
}

export interface Config {
  currentTermId: string | null;
  rounding: RoundingRule;
  /**
   * 事業者名。初期値は空文字。
   * 未入力なら明細に欄ごと出さない。ソースコードには一切埋め込まない。
   */
  businessName: string;
  /**
   * 端末をまたいで共有する設定の更新時刻。
   * 同期では新しい側を採用する。drive と lastSyncedAt は端末ごとの値なので対象外。
   */
  updatedAt: IsoDateTime;
  /** 接続状態。端末ごとに異なるので同期しない */
  drive: DriveSettings;
  /** 最終同期日時。端末ごとに異なるので同期しない */
  lastSyncedAt: IsoDateTime | null;
}

/** 端末をまたいで共有する設定の項目。同期の対象はこれだけ */
export const SHARED_CONFIG_KEYS = ['currentTermId', 'rounding', 'businessName'] as const;

export const DEFAULT_CONFIG: Config = {
  currentTermId: null,
  updatedAt: '1970-01-01T00:00:00.000Z',
  rounding: { unitMinutes: 15, direction: 'floor', target: 'dailyTotal' },
  businessName: '',
  drive: { status: 'disconnected', accountName: null, folderName: null },
  lastSyncedAt: null,
};
