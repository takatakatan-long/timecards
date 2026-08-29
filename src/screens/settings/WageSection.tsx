import { useState } from 'react';
import { patchConfig } from '../../data/repository';
import { formatDuration } from '../../domain/time';
import { roundMinutes } from '../../domain/wage';
import type { RoundingDirection, RoundingRule } from '../../domain/types';

interface WageSectionProps {
  rule: RoundingRule;
  onSaved: () => void;
}

const UNITS = [1, 5, 10, 15, 30, 60];

const DIRECTIONS: { value: RoundingDirection; label: string }[] = [
  { value: 'floor', label: '切り捨て' },
  { value: 'ceil', label: '切り上げ' },
  { value: 'round', label: '四捨五入' },
];

/**
 * 賃金計算の丸め方。
 *
 * 労基法上は 1 分単位の支払いが原則で、日ごとの切り捨ては是正指導の対象になり得る。
 * 運用の希望に合わせて 15 分・切り捨てを既定にしつつ、
 * 単位と方向をいつでも変えられるようにしてある。
 */
export function WageSection({ rule, onSaved }: WageSectionProps) {
  const [unitMinutes, setUnitMinutes] = useState(rule.unitMinutes);
  const [direction, setDirection] = useState<RoundingDirection>(rule.direction);
  const [saved, setSaved] = useState(false);

  const changed = unitMinutes !== rule.unitMinutes || direction !== rule.direction;
  // 設定の効き方が一目で分かるよう、仕様書の例（8:00〜16:52）で試算を出す
  const example = roundMinutes(532, { unitMinutes, direction, target: 'dailyTotal' });

  const save = async () => {
    await patchConfig({ rounding: { unitMinutes, direction, target: 'dailyTotal' } });
    setSaved(true);
    onSaved();
  };

  return (
    <section>
      <div className="section-title">賃金計算</div>
      <div className="card">
        <label className="field">
          <span className="field__label">丸めの単位</span>
          <select
            className="field__input"
            value={unitMinutes}
            onChange={(event) => {
              setUnitMinutes(Number(event.target.value));
              setSaved(false);
            }}
          >
            {UNITS.map((unit) => (
              <option value={unit} key={unit}>
                {unit === 1 ? '1 分（丸めない）' : `${unit} 分`}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">丸めの方向</span>
          <select
            className="field__input"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as RoundingDirection);
              setSaved(false);
            }}
          >
            {DIRECTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounding-note">
          <div>
            <span>例: 8:00 〜 16:52 に働いた日</span>
            <span>{formatDuration(532)}</span>
          </div>
          <div>
            <span>この設定での労働時間</span>
            <span>
              {(example / 60).toFixed(2)} h（{formatDuration(example)}）
            </span>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: 'var(--space-3)' }}
          disabled={!changed}
          onClick={() => void save()}
        >
          保存
        </button>
        {saved && !changed ? <p className="note">保存しました</p> : null}

        <p className="note">
          丸めるのは 1 日の労働時間の合計です。出勤・退勤それぞれの時刻は丸めません。
          設定を変えると、過去の記録の集計と明細も新しい設定で計算し直されます
          （打刻は丸める前の時刻で保存しているため）。
        </p>
        <p className="note">
          労働基準法では 1 分単位での賃金支払いが原則です。日ごとの切り捨ては是正指導の
          対象になり得ます（認められている例外は、1 ヶ月の合計に対する 30 分未満の切り捨て・
          以上の切り上げのみ）。ご確認のうえ設定してください。
        </p>
        <p className="note">
          時給の改定は過去に遡りません。記録には打刻した時点の時給が保存されています。
        </p>
      </div>
    </section>
  );
}
