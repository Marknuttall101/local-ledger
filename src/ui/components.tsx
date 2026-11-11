import { useEffect, useRef, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-black/10 bg-surface p-5 ${className}`}>{children}</div>
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger'
const BUTTON: Record<ButtonKind, string> = {
  primary: 'bg-brand text-white hover:bg-[#184f95] shadow-sm',
  secondary: 'bg-white text-ink border border-black/15 hover:bg-black/[0.03]',
  ghost: 'text-ink-2 hover:bg-black/[0.05]',
  danger: 'bg-bad text-white hover:bg-[#962424]',
}

export function Button({
  kind = 'secondary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'px-2.5 py-1 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[kind]} ${sizes[size]} ${className}`}
    />
  )
}

export function StatTile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className={`mt-1 text-sm ${tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-muted'}`}>{sub}</div>}
    </Card>
  )
}

/** Open modals, newest last, so Escape only closes the one on top */
const openModals: object[] = []

export function Modal({ children, onClose, wide }: { children: ReactNode; onClose?: () => void; wide?: boolean }) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const me = {}
    openModals.push(me)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openModals[openModals.length - 1] === me && close.current?.()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openModals.splice(openModals.indexOf(me), 1)
    }
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl bg-surface p-6 shadow-xl`}>
        {children}
      </div>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' }) {
  const tones = {
    neutral: 'bg-black/[0.06] text-ink-2',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    brand: 'bg-brand-soft text-brand',
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="py-12 text-center">
      <div className="text-lg font-medium">{title}</div>
      {children && <div className="mx-auto mt-2 max-w-md text-ink-2">{children}</div>}
    </Card>
  )
}

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
}

/** Visible lock + short privacy promise, repeated wherever files are dropped */
export function PrivacyNote({ className = '' }: { className?: string }) {
  return (
    <p className={`flex items-center justify-center gap-1.5 text-sm text-ink-2 ${className}`}>
      <svg viewBox="0 0 20 20" className="size-4 text-good" fill="currentColor" aria-hidden>
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
      </svg>
      Your file is read on this device and never uploaded.
    </p>
  )
}
