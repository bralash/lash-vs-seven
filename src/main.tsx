import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { touchProfile } from './lib/profile'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/lobby.css'
import './styles/match.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// your name and when you were last here, for the admin page
touchProfile()
