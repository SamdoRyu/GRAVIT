// Small shared presentational pieces. OWNER: ui-builder.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export function Empty({ icon = 'inbox', title, hint, action }: { icon?: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {hint && <span className="empty-hint">{hint}</span>}
      {action}
    </div>
  )
}

/** Number that eases to its new value. */
export function AnimatedNumber({ value, duration = 450 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const shownRef = useRef(value)
  useEffect(() => {
    from.current = shownRef.current
    if (from.current === value) return
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const v = Math.round(from.current + (value - from.current) * eased)
      shownRef.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown}</>
}

/** Text that stays a native control but accepts only a labelled wrapper. */
export function Field({ label, error, children, className }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`fld ${className ?? ''}`}>
      <span className="fld-label">{label}</span>
      {children}
      {error && <em className="fld-error">{error}</em>}
    </label>
  )
}
