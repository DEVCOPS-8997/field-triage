/**
 * Term: a science word with a small (i) button that opens a short plain-language definition.
 *
 * - Opens on mouse hover, on keyboard focus and on tap/click (tap again or tap outside to close).
 * - Escape closes and keeps focus on the (i) button.
 * - The definition is portalled to <body> with fixed positioning, so it never shifts layout and is
 *   not clipped by glass cards (backdrop-filter traps position:fixed otherwise).
 * - The definition element is always in the DOM (hidden when closed), so aria-describedby on the
 *   button lets screen readers read it on focus.
 *
 * Props
 * - id: GlossaryId                 key into src/lib/glossary.ts
 * - children?: ReactNode           visible word; defaults to the glossary term name
 * - iconOnly?: boolean             render only the (i) button (for places where the word is already shown)
 * - className?: string
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { GLOSSARY, type GlossaryId } from '../../lib/glossary'
import { cn } from './cn'

export interface TermProps {
  id: GlossaryId
  children?: ReactNode
  iconOnly?: boolean
  className?: string
}

const GAP = 6
const MARGIN = 16
const MAX_W = 300

export function Term({ id, children, iconOnly = false, className }: TermProps) {
  const entry = GLOSSARY[id]
  const popId = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pinned, setPinned] = useState(false) // opened by tap/click: stays until tapped again / outside / Esc
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null)

  const place = useCallback(() => {
    const b = btn.current
    if (!b) return
    const r = b.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = window.innerHeight
    const width = Math.min(MAX_W, vw - MARGIN * 2)
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - width / 2), vw - MARGIN - width)
    const popH = pop.current?.offsetHeight ?? 140
    const above = r.bottom + GAP + popH > vh && r.top - GAP - popH > 0
    setPos({ top: above ? r.top - GAP - popH : r.bottom + GAP, left, width, above })
  }, [])

  const show = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }, [])
  const hideSoon = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => {
      setOpen(false)
      setPinned(false)
    }, 150)
  }, [])
  const close = useCallback(() => {
    window.clearTimeout(closeTimer.current)
    setOpen(false)
    setPinned(false)
  }, [])

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Measure after the popover renders, then re-place on scroll / resize while open.
  useLayoutEffect(() => {
    if (!open) return
    place()
    const onMove = () => place()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        btn.current?.focus({ preventScroll: true })
      }
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (btn.current?.contains(t) || pop.current?.contains(t)) return
      close()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, close])

  if (!entry) return <>{children}</>
  const label = children ?? entry.term

  const popover = (
    <div
      ref={pop}
      id={popId}
      role="tooltip"
      hidden={!open}
      onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && hideSoon()}
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, width: pos.width }
          : { position: 'fixed', top: -9999, left: -9999, width: MAX_W }
      }
      // display class follows `open`: the hidden attribute alone would lose to display:flex
      className={cn(
        open ? 'flex' : 'hidden',
        'glass-strong z-[1300] flex-col gap-1 rounded-[var(--radius-control,1rem)] p-3 text-left text-[14px] leading-[1.45] font-normal normal-case tracking-normal text-[color:var(--color-fg,#ecfdf3)] shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
      )}
    >
      <span className="font-semibold">{entry.term}</span>
      <span className="text-[color:var(--color-fg-2,#b4cfc0)]">{entry.what}</span>
      <span className="text-[color:var(--color-fg-2,#b4cfc0)]">
        <span className="font-semibold text-[color:var(--color-accent,#4ade80)]">Why it matters: </span>
        {entry.why}
      </span>
    </div>
  )

  return (
    <span data-component="Term" className={cn('inline', className)}>
      {!iconOnly && label}
      <button
        ref={btn}
        type="button"
        aria-label={`What is ${entry.term}?`}
        aria-describedby={popId}
        aria-expanded={open}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && !pinned && hideSoon()}
        onFocus={(e) => {
          // keyboard focus only; a tap is handled by onClick
          if (e.currentTarget.matches(':focus-visible')) show()
        }}
        onBlur={(e) => {
          if (pop.current?.contains(e.relatedTarget as Node)) return
          if (!pinned) hideSoon()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (open && pinned) close()
          else {
            setPinned(true)
            show()
          }
        }}
        className={cn(
          // 24px hit area; negative margins keep the line height unchanged (no layout shift)
          'relative -my-1 ml-0.5 inline-flex h-6 w-6 cursor-help items-center justify-center rounded-full align-middle',
          'text-[color:var(--color-fg-3,#9bbba8)] hover:text-[color:var(--color-accent,#4ade80)]',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--color-accent,#4ade80)]',
          open && 'text-[color:var(--color-accent,#4ade80)]',
        )}
      >
        <Info size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      {typeof document !== 'undefined' ? createPortal(popover, document.body) : null}
    </span>
  )
}

export default Term
