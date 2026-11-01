import type { ReactNode } from 'react'

/** Page frame: a left-aligned Fraunces title, a lead line, and the content, with the tab bar's height reserved. */
export function Screen({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-6 px-4 pb-28 pt-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h2 text-on-dark">{title}</h1>
        {lead ? <p className="text-body text-on-dark-dim">{lead}</p> : null}
      </header>
      {children}
    </main>
  )
}
