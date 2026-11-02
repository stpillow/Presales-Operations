import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CrashScreen, ErrorBoundary } from './ErrorBoundary.tsx'

/*
 * There is no DOM in the test run (Vitest runs under node), and React's server renderer doesn't run
 * error boundaries, so the boundary is driven the way React drives it: getDerivedStateFromError
 * turns a throw into state, and render() with that state is rendered to markup.
 */

const thrown = new Error('Cannot read properties of undefined (reading "slots")')
thrown.stack = 'Error: Cannot read properties of undefined\n    at SlotCard (PhaseSessions.tsx:42:17)'

const markup = (screen: Parameters<typeof CrashScreen>[0]['screen']) => {
  const boundary = new ErrorBoundary({ screen, children: createElement('p', null, 'the screen') })
  boundary.state = ErrorBoundary.getDerivedStateFromError(thrown)
  return renderToStaticMarkup(boundary.render())
}

describe('ErrorBoundary', () => {
  it('turns a throw into the fallback, keeping nothing of the error', () => {
    expect(ErrorBoundary.getDerivedStateFromError(thrown)).toEqual({ failed: true })
  })

  it('renders the screen as it is until something throws', () => {
    const boundary = new ErrorBoundary({ screen: 'week', children: createElement('p', null, 'the screen') })
    expect(renderToStaticMarkup(boundary.render())).toBe('<p>the screen</p>')
  })

  it('shows a sentence in words naming the screen, with Today and Reload, and never the error or its stack', () => {
    const html = markup('program')
    expect(html).toContain('Program stopped')
    expect(html).toContain('Something on the Program screen went wrong, so it stopped rather than show you something wrong. Everything already saved stays on this phone.')
    expect(html).toContain('>Today</button>')
    expect(html).toContain('>Reload</button>')
    expect(html).not.toContain('the screen')
    for (const leak of ['Cannot read', 'slots', 'PhaseSessions', 'at SlotCard', 'Error:']) expect(html).not.toContain(leak)
  })

  it('says the same of the whole app when no screen is named', () => {
    expect(markup(null)).toContain('The app stopped')
  })
})
