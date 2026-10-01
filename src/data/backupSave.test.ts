import { describe, expect, it } from 'vitest';
import { detectPlatform, downloadHint, saveMessage } from './backupSave';

describe('detectPlatform', () => {
  it('Android を見分ける', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126')).toBe('android');
  });

  it('iPhone を見分ける', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari')).toBe(
      'ios',
    );
  });

  it('Mac を名乗る iPad はタッチ点数で見分ける', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari';
    expect(detectPlatform(mac, 5)).toBe('ios');
    expect(detectPlatform(mac, 0)).toBe('desktop');
  });

  it('Windows は PC', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126')).toBe('desktop');
  });
});

describe('saveMessage', () => {
  const name = '出勤簿バックアップ-2026-10-02.json';

  it('ダウンロード時は端末ごとのたどり方と、履歴からも開ける旨を添える', () => {
    const text = saveMessage('downloaded', name, 'android');
    expect(text).toContain(name);
    expect(text).toContain(downloadHint('android'));
    expect(text).toContain('ダウンロード履歴');
  });

  it('共有時は保存先がアプリから分からないことを伝える', () => {
    expect(saveMessage('shared', name, 'ios')).toContain('アプリからは分かりません');
  });

  it('取りやめは短く伝える', () => {
    expect(saveMessage('cancelled', name, 'desktop')).toBe('保存を取りやめました。');
  });
});
