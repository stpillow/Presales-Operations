/** Shown when data/program.json fails validation. Imports nothing that needs the program. */
export function ProgramError({ error }: { error: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[36rem] flex-col gap-4 px-4 py-12">
      <h1 className="font-display text-h2 text-on-dark">The program data did not validate</h1>
      <p className="text-body text-on-dark-dim">The app cannot run until data/program.json matches its schema. The validator said:</p>
      <pre className="whitespace-pre-wrap font-mono text-small text-on-dark">{error}</pre>
    </main>
  )
}
