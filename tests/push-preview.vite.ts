import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./push-preview-client.ts', import.meta.url))
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['tests/push-preview.html'] },
  resolve: { alias: [{ find: /^\.\.\/lib\/(auth|push|supabase)$/, replacement: fixture }] },
})
