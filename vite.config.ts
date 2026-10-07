import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // public/classic/ is the original site, copied as-is to /classic/ — no need to watch it
  server: { watch: { ignored: ['**/public/classic/**'] } },
})
