import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // legacy/ is the recovered old site — reference only, never bundled
  server: { watch: { ignored: ['**/legacy/**'] } },
})
