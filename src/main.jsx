import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDesktopLinks } from './lib/desktop.js'

// Приложение для ПК: чужие ссылки — во внешний браузер (на сайте и в Android ничего не делает)
installDesktopLinks()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
