import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * GitHub Pages はリポジトリ名の下（/timecards/）で配信されるため、
 * 生成するリンクの先頭にその分を付ける。
 * 開発サーバーはルート配信なので、本番ビルドのときだけ付ける。
 */
const base = process.env.NODE_ENV === 'production' ? '/timecards/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // ビルドしたファイルを先に取り込んでおき、電波が無くても起動できるようにする
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Google Fonts は外部から読むので、一度取得したら手元に残す
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: '出勤簿',
        short_name: '出勤簿',
        description: '有期雇用スタッフの出勤・退勤と賃金を記録する出勤簿',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        // 起動時の下地。設計方針の生成りに合わせる
        background_color: '#faf7f0',
        theme_color: '#2f6b3f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
