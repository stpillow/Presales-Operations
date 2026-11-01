import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ProgramError } from './components/ProgramError.tsx'
import { seedError } from './program/seed.ts'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('index.html has no #root element')
const root = createRoot(rootElement)

if (seedError) {
  // Nothing that reads the program has been loaded yet, so this screen can always render.
  root.render(
    <StrictMode>
      <ProgramError error={seedError} />
    </StrictMode>,
  )
} else {
  void import('./App.tsx').then(({ App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
