import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Весь интерфейс в одном файле — около 500 КБ, это нормально; не предупреждаем
  build: { chunkSizeWarningLimit: 800 },
}))
