import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isFramed, showFramedNotice } from './frameGuard'
import { Root } from './ui/Root'
import './index.css'

const root = document.getElementById('root')!

// Never run inside another site's frame, where clicks could be tricked onto the app's buttons
if (isFramed(window)) showFramedNotice(root, window.location.href)
else
  createRoot(root).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  )
