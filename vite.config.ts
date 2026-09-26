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
        id: '/',
        name: 'No Excuse — Attendance & Fine Tracker',
        short_name: 'No Excuse',
        description: 'Share schedules, check in to class, and manage group fines together.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#F7F5F0',
        theme_color: '#1F3D2B',
        lang: 'en',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
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
