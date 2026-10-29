import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // host: true binds the dev server to 0.0.0.0 (not just localhost) and allowedHosts: true
  // skips Vite's Host-header check, so the app is reachable at the server's LAN/public IP,
  // not just from a browser on the server itself.
  server: {
    host: true,
    allowedHosts: true,
  },
})
