import { Component, type ReactNode } from 'react'
import { navigate, parseHash, type Route } from '../app/router.ts'
import { Button } from './Button.tsx'
import { Screen } from './Screen.tsx'
import { crashWords } from './ErrorBoundary.helpers.ts'

interface Props {
  /** The screen inside, named in the fallback; null for the app itself. */
  screen: Route['name'] | null
  /** The route it shows (`routeHash`): a new one starts the boundary fresh, so a tab tapped after a throw opens that screen. */
  resetKey?: string
  children: ReactNode
}

interface State {
  failed: boolean
  key?: string | undefined
}

/**
 * Catches a throw while a screen renders, so one bad row or a bug shows a sentence in words with
 * Today and Reload, and the tab bar and the update prompt around it keep working, instead of the
 * whole app going blank. Nothing of the error is kept or shown: React reports it to the console.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey }

  static getDerivedStateFromError(_error: unknown): State {
    return { failed: true }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey }
  }

  private readonly today = (): void => {
    if (parseHash(window.location.hash).name === 'today') {
      this.setState({ failed: false })
      return
    }
    // The hash change lands first, so what renders next is Today, not the screen that threw again.
    window.addEventListener('hashchange', () => this.setState({ failed: false }), { once: true })
    navigate({ name: 'today' })
  }

  private readonly reload = (): void => {
    window.location.reload()
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return <CrashScreen screen={this.props.screen} onToday={this.today} onReload={this.reload} />
  }
}

/** The fallback: the screen by name, what happened in words, and the two ways on. */
export function CrashScreen({ screen, onToday, onReload }: { screen: Route['name'] | null; onToday: () => void; onReload: () => void }) {
  const words = crashWords(screen)
  return (
    <Screen title={words.title} lead={words.sentence}>
      <p className="text-body text-on-dark">{words.next}</p>
      <div className="flex flex-col gap-3">
        <Button variant="primary" wide onClick={onToday}>
          Today
        </Button>
        <Button wide onClick={onReload}>
          Reload
        </Button>
      </div>
    </Screen>
  )
}
