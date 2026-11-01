import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet'

const styles: Record<Variant, string> = {
  primary: 'bg-paper text-on-light',
  secondary: 'bg-navy-lift text-on-dark border border-on-dark-faint',
  quiet: 'bg-transparent text-on-dark-dim underline underline-offset-4',
}

/** A 44 px tap target with a word on it. Meaning comes from the label, never from color alone. */
export function Button({
  variant = 'secondary',
  wide = false,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; wide?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`tap rounded-sm px-6 py-3 font-sans text-body font-medium disabled:opacity-50 ${styles[variant]} ${wide ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
