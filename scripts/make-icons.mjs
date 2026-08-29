/**
 * PWA 用のアイコン（PNG）を作る。
 *
 * 画像編集ソフトを使わずに済むよう、図形を計算して直接 PNG を書き出す。
 * 配色は設計方針の主色（緑 #2f6b3f）に合わせてある。
 * アイコンを描き直したくなったら、このファイルの draw() を編集して
 *   node scripts/make-icons.mjs
 * を実行する。
 *
 * 出力先: public/icon-192.png / icon-512.png / icon-maskable-512.png / apple-touch-icon.png
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const GREEN = [0x2f, 0x6b, 0x3f];
const CREAM = [0xfa, 0xf7, 0xf0];

// ---------------------------------------------------------------- 図形

/** 角丸四角形の内側なら true（p は 0〜1 の座標） */
function inRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return Math.hypot(dx, dy) <= radius;
}

/** 点と線分の距離 */
function distanceToSegment(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

/**
 * 1 点の色を決める。座標は 0〜1。
 * 図柄は時計。出勤簿＝時刻を記録するもの、という意味で選んでいる。
 */
function draw(x, y, { rounded, inset }) {
  // maskable 用は端が切り取られるので、図柄を中央へ寄せる
  const cx = 0.5;
  const cy = 0.5;
  const scale = inset;

  const background = rounded ? inRoundedSquare(x, y, 0.22) : true;
  if (!background) return null; // 透明

  const distance = Math.hypot(x - cx, y - cy) / scale;

  // 文字盤（縁取り）
  const ringOuter = 0.34;
  const ringInner = 0.28;
  if (distance <= ringOuter && distance >= ringInner) return CREAM;

  // 針。短針は 8 時方向ではなく上と右に伸ばし、時計だと一目で分かる形にする
  const hand = (x2, y2, width) =>
    distanceToSegment(x, y, cx, cy, cx + x2 * scale, cy + y2 * scale) <= width * scale;
  if (hand(0, -0.19, 0.035)) return CREAM; // 長針（12 時方向）
  if (hand(0.14, 0.04, 0.035)) return CREAM; // 短針（3 時すぎ方向）

  return GREEN;
}

// ---------------------------------------------------------------- PNG 出力

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // ビット深度
  header[9] = 6; // カラータイプ RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // フィルタなし
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 3×3 で細かく見て平均を取り、縁のギザギザを抑える */
function render(size, options) {
  const samples = 3;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const color = draw(
            (px + (sx + 0.5) / samples) / size,
            (py + (sy + 0.5) / samples) / size,
            options,
          );
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }
      const total = samples * samples;
      const offset = (py * size + px) * 4;
      // 透明部分と混ざって暗くならないよう、色は不透明だった分だけで平均する
      const opaque = a / 255 || 1;
      pixels[offset] = Math.round(r / opaque);
      pixels[offset + 1] = Math.round(g / opaque);
      pixels[offset + 2] = Math.round(b / opaque);
      pixels[offset + 3] = Math.round(a / total);
    }
  }
  return encodePng(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ['icon-192.png', 192, { rounded: true, inset: 1 }],
  ['icon-512.png', 512, { rounded: true, inset: 1 }],
  // maskable は端を切り取られるので、図柄を小さくして中央に収める
  ['icon-maskable-512.png', 512, { rounded: false, inset: 0.72 }],
  ['apple-touch-icon.png', 180, { rounded: false, inset: 1 }],
];

for (const [name, size, options] of outputs) {
  writeFileSync(join(OUT_DIR, name), render(size, options));
  console.log(`${name} (${size}x${size})`);
}
