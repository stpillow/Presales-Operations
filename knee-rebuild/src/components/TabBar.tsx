import { navigate, type Route } from '../app/router.ts'

const TABS: { name: Route['name']; label: string }[] = [
  { name: 'today', label: 'Today' },
  { name: 'week', label: 'Week' },
  { name: 'progress', label: 'Progress' },
  { name: 'gates', label: 'Gates' },
  { name: 'more', label: 'More' },
]

const MORE: Route['name'][] = ['more', 'morning', 'run', 'program', 'settings']

/** Bottom tabs, words only, 44 px, with the active tab underlined (shape, not color). */
export function TabBar({ route }: { route: Route }) {
  const active = (name: Route['name']) => route.name === name || (name === 'today' && route.name === 'session') || (name === 'more' && MORE.includes(route.name))
  return (
    <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 border-t border-on-dark-faint bg-navy pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-[36rem]">
        {TABS.map((tab) => (
          <li key={tab.name} className="flex-1">
            <button
              type="button"
              aria-current={active(tab.name) ? 'page' : undefined}
              onClick={() => navigate({ name: tab.name } as Route)}
              className={`tap w-full py-3 font-mono text-small uppercase tracking-[0.22em] ${active(tab.name) ? 'text-on-dark underline decoration-2 underline-offset-8' : 'text-on-dark-muted'}`}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
