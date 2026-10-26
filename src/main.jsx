import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDesktopLinks } from './lib/desktop.js'
import { initLite } from './lib/lite.js'

// Приложение для ПК: чужие ссылки — во внешний браузер (на сайте и в Android ничего не делает)
installDesktopLinks()
// Облегчённый режим (слабый телефон, экономия заряда) — до первого кадра
initLite()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
