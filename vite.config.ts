import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Rutas relativas: el mismo build sirve en GitHub Pages
  // (/world-quake-globe/) y en cualquier raiz.
  base: './',
  plugins: [react()],
  server: { port: 5173, open: true },
  // El worker de MapLibre es ESM y se carga como modulo.
  worker: { format: 'es' },
})
