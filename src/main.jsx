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
// Облегчённый режим (слабый телефон, экономия заряда) — до первого кадра
initLite()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>,
)
