import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [{ find: /^\.\.\/lib\/supabase$/, replacement: fileURLToPath(new URL('./story-preview-client.ts', import.meta.url)) }] },
})
