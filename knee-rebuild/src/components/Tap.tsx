/**
 * A yes/no tap that says which it is in words and with a mark, so the state never rides on color.
 * A long label ("Bosu or balance pad, if your club has one", a red flag's sentence) wraps in its own
 * box; the mark keeps its one line beside it, so "✓ Here" never splits into "✓" over "HERE".
 */
export function Tap({ label, value, onChange, yes = 'Yes', no = 'No' }: { label: string; value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`tap flex w-full items-center justify-between gap-4 rounded-sm border px-4 py-3 text-left text-body ${value ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'}`}
    >
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 whitespace-nowrap font-mono text-small uppercase tracking-[0.22em]">{value ? `✓ ${yes}` : `○ ${no}`}</span>
    </button>
  )
}
