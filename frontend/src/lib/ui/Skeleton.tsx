/** Spec Skeleton: glass-flat block, pulses (static under reduced motion). */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      data-component="Skeleton"
      aria-hidden="true"
      className={`rounded-[var(--radius-control,1rem)] bg-[color:var(--color-glass-flat,rgba(255,255,255,0.04))] motion-safe:animate-pulse ${className}`}
    />
  )
}

export default Skeleton
