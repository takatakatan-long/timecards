import { useCallback, useEffect, useState } from 'react';
import {
  currentTerm,
  listRecordsByTerm,
  listStaff,
  loadConfig,
} from '../data/repository';
import { today } from '../domain/time';
import { unresolvedRecords } from '../domain/status';
import type { AttendanceRecord, Config, Staff, Term } from '../domain/types';

export interface HomeData {
  config: Config | null;
  term: Term | undefined;
  staff: Staff[];
  /** 当日のレコードを staffId で引ける形にしたもの */
  todayRecords: Map<string, AttendanceRecord>;
  /** 打刻漏れ（過去日に残った予定・退勤なし） */
  unresolved: AttendanceRecord[];
  todayDate: string;
  loading: boolean;
  error: string | null;
  /** 打刻のあとに呼んで画面を最新にする */
  reload: () => Promise<void>;
}

/**
 * ホーム画面が必要とするデータをまとめて読む。
 * 日常の画面には現在の期のものだけを出すので、ここで期による絞り込みまで済ませる。
 */
export function useHomeData(): HomeData {
  const [config, setConfig] = useState<Config | null>(null);
  const [term, setTerm] = useState<Term | undefined>(undefined);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [todayRecords, setTodayRecords] = useState<Map<string, AttendanceRecord>>(new Map());
  const [unresolved, setUnresolved] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const todayDate = today();

  const reload = useCallback(async () => {
    try {
      const [loadedConfig, loadedTerm, loadedStaff] = await Promise.all([
        loadConfig(),
        currentTerm(),
        listStaff(),
      ]);
      setConfig(loadedConfig);
      setTerm(loadedTerm);
      setStaff(loadedStaff);

      if (!loadedTerm) {
        setTodayRecords(new Map());
        setUnresolved([]);
        return;
      }

      const records = await listRecordsByTerm(loadedTerm.id);
      const byStaff = new Map<string, AttendanceRecord>();
      for (const record of records) {
        if (record.date === todayDate) byStaff.set(record.staffId, record);
      }
      setTodayRecords(byStaff);
      setUnresolved(unresolvedRecords(records, todayDate));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [todayDate]);

  useEffect(() => {
    // IndexedDB という外部の入れ物から読むための効果。
    // 読み込みは非同期なので、描画中に値を決めることはできない。
    // oxlint-disable-next-line react/set-state-in-effect
    void reload();
  }, [reload]);

  return {
    config,
    term,
    staff,
    todayRecords,
    unresolved,
    todayDate,
    loading,
    error,
    reload,
  };
}
