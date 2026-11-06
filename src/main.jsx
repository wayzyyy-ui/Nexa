import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDesktopLinks } from './lib/desktop.js'
import { initLite } from './lib/lite.js'
import { installCrashReports } from './lib/crashes.js'
import { CrashBoundary } from './ui/crash.jsx'

// Отчёты о сбоях без личных данных (src/lib/crashes.js) — как можно раньше, чтобы поймать и сбой запуска
installCrashReports()
// Приложение для ПК: чужие ссылки — во внешний браузер (на сайте и в Android ничего не делает)
installDesktopLinks()
// Айфон приближает страницу, когда шрифт поля меньше 16 px. maximum-scale на iOS отключает только это:
// пальцами приближать по-прежнему можно. На Android ставить нельзя — там он запретил бы приближение совсем
if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
  const vp = document.querySelector('meta[name="viewport"]')
  if (vp) vp.content += ", maximum-scale=1"
}
// Облегчённый режим (слабый телефон, экономия заряда) — до первого кадра
initLite()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>,
)
