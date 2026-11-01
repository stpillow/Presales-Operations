import { useEffect, useState } from 'react'

export type Route =
  | { name: 'today' }
  | { name: 'session'; workoutId: string }
  | { name: 'morning' }
  | { name: 'run' }
  | { name: 'week' }
  | { name: 'progress' }
  | { name: 'gates' }
  | { name: 'program' }
  | { name: 'settings' }
  | { name: 'more' }

/** Hash routes, so the home-screen app keeps a working back gesture without a server rewrite. */
export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [head, arg] = parts
  switch (head) {
    case 'session': {
      if (!arg) return { name: 'today' }
      try {
        return { name: 'session', workoutId: decodeURIComponent(arg) }
      } catch {
        // A malformed escape (a link cut off when copied) lands on Today instead of a blank app.
        return { name: 'today' }
      }
    }
    case 'morning':
    case 'run':
    case 'week':
    case 'progress':
    case 'gates':
    case 'program':
    case 'settings':
    case 'more':
      return { name: head }
    default:
      return { name: 'today' }
  }
}

export function routeHash(route: Route): string {
  return route.name === 'session' ? `#/session/${encodeURIComponent(route.workoutId)}` : `#/${route.name}`
}

export function navigate(route: Route): void {
  window.location.hash = routeHash(route)
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
