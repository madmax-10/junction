import { IconContext } from '@phosphor-icons/react'
import { MotionConfig } from 'motion/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from './app/App.tsx'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <IconContext.Provider value={{ weight: 'fill' }}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </IconContext.Provider>
    </MotionConfig>
  </StrictMode>,
)
