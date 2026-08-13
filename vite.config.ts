import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-source.svg'],
      manifest: {
        name: '출첵벌금 — 우리 과 출석 지킴이',
        short_name: '출첵벌금',
        description: '그룹 친구들과 시간표를 공유하고, 수업마다 출석 도장을 찍는 앱',
        start_url: '/',
        display: 'standalone',
        background_color: '#F7F5F0',
        theme_color: '#1F3D2B',
        lang: 'ko',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      // Supabase API 요청까지 캐시하면 오래된 데이터가 보일 수 있어서
      // 정적 자산(코드/이미지)만 캐시하고, API 호출은 항상 네트워크로 보낸다.
      workbox: {
        navigateFallbackDenylist: [/^\/auth\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
