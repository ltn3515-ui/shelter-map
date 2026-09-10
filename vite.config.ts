import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      // 새 배포가 있으면 기존에 열려 있던 탭에서도 서비스워커가 즉시 활성화되도록 한다.
      // 이게 없으면 새로고침해도 예전 버전이 계속 캐시에서 서빙되어, 매번 수동으로
      // 서비스워커를 해제하고 캐시를 지워야 하는 문제가 생긴다.
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: '잠깐',
        short_name: '잠깐',
        description: '주변 무더위쉼터·한파쉼터를 찾아주는 지도',
        theme_color: '#1B6E78',
        background_color: '#1B6E78',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
