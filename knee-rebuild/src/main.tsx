import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
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
  // App's own boundary names the screen that threw; this one catches the app shell itself (storage, the tab bar).
  void import('./App.tsx').then(({ App }) =>
    root.render(
      <StrictMode>
        <ErrorBoundary screen={null}>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    ),
  )
}
