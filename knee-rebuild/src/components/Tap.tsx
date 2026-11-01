/** A yes/no tap that says which it is in words and with a mark, so the state never rides on color. */
export function Tap({ label, value, onChange, yes = 'Yes', no = 'No' }: { label: string; value: boolean; onChange: (v: boolean) => void; yes?: string; no?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`tap flex w-full items-center justify-between gap-4 rounded-sm border px-4 py-3 text-left text-body ${value ? 'border-paper bg-navy-lift text-on-dark' : 'border-on-dark-faint bg-transparent text-on-dark-dim'}`}
    >
      <span>{label}</span>
      <span className="font-mono text-small uppercase tracking-[0.22em]">{value ? `✓ ${yes}` : `○ ${no}`}</span>
    </button>
  )
}
