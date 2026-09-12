import { defineConfig } from 'vite'
import { publicConfig } from './src/lib/security.js'
import { loadEnv } from 'vite'
import fs from 'node:fs'

export default defineConfig(({ mode, command }) => {
  if (mode === 'production' && command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
    publicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, true)
  }
  const headers = Object.fromEntries(JSON.parse(fs.readFileSync(new URL('./vercel.json', import.meta.url))).headers[0].headers.map(({key,value}) => [key,value]))
  return { build: { sourcemap: false }, server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1', headers }, test: { include: ['tests/**/*.test.js'], testTimeout: 30000, hookTimeout: 30000 } }
})
