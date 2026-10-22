import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/* Сборка для приложения на ПК (vite build --mode desktop, см. desktop/): из index.html
   убираем Яндекс Метрику (решение автора: в приложении для ПК статистики нет) и подсказки
   для iPhone. Сайт и Android-приложение собираются как раньше */
function desktopHtml() {
  return {
    name: 'nexa-desktop-html',
    transformIndexHtml(html) {
      return html
        .replace(/<!-- Yandex\.Metrika counter -->[\s\S]*?<!-- \/Yandex\.Metrika counter -->/, '')
        .replace(/<noscript>[\s\S]*?mc\.yandex\.ru[\s\S]*?<\/noscript>/, '')
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  // Яндекс Метрики нет в приложениях (ПК и Android): её запись сессий (webvisor) следит за каждым
  // изменением страницы и движением пальца — в приложении это заметно тормозило. На сайте — как раньше
  plugins: [react(), ...(mode === 'desktop' || mode === 'android' ? [desktopHtml()] : [])],
  // Весь интерфейс в одном файле — около 500 КБ, это нормально; не предупреждаем
  build: { chunkSizeWarningLimit: 800 },
}))
