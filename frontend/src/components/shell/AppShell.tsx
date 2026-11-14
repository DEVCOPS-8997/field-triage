/**
 * AppShell: layout route wrapper (renders <Outlet/> inside <main id="main">).
 *
 * - >= 1280px: full 256px glass sidebar (brand, nav, Disclaimer card in the footer)
 * - 768-1279px: 80px icon rail with tooltips; Disclaimer inline at the end of <main>
 * - < 768px: 56px top header with the brand + 64px bottom bar; Disclaimer inline at the end of <main>
 * Nav: Overview (/), Field detail (/fields/{id}, disabled with "Select a field first" when no field
 * is selected), Methodology (/methodology). Skip link is the first tab stop.
 * Focus moves to #page-title (PageHeader) on route change; content fades in over 150ms.
 */
import { useEffect, useId, useRef, type ComponentType } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { BookOpenText, LayoutDashboard, LogOut, Sprout, UserPlus, UserRound, Wheat, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../store/useAuth'
import { accountApi } from '../../api/account'
import DisclaimerImpl from '../Disclaimer'
import { Tooltip } from '../ui/Tooltip'
import { cn } from '../ui/cn'

// Disclaimer is owned by another phase; its `variant` prop is part of the UI contract.
const Disclaimer = DisclaimerImpl as unknown as ComponentType<{ variant?: 'card' | 'inline' }>

interface NavItem {
  key: 'overview' | 'field' | 'account' | 'methodology'
  label: string
  icon: LucideIcon
  to: string | null // null = disabled
  active: boolean
}

function useNavItems(): NavItem[] {
  const { pathname } = useLocation()
  const user = useAuth((s) => s.user)
  return [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, to: '/', active: pathname === '/' },
    // Saved fields are personal: the nav shows them only to signed-in users.
    user
      ? { key: 'field', label: 'My fields', icon: Wheat, to: '/my-fields', active: pathname.startsWith('/my-fields') }
      : { key: 'account', label: 'Sign in', icon: UserRound, to: '/account', active: pathname.startsWith('/account') },
    {
      key: 'methodology',
      label: 'Methodology',
      icon: BookOpenText,
      to: '/methodology',
      active: pathname.startsWith('/methodology'),
    },
  ]
}

const HELPER = 'Select a field first'

function BrandChip() {
  return (
    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[var(--radius-chip)] bg-accent/14 text-accent shadow-[inset_0_0_0_1px_rgba(74,222,128,0.35),0_0_20px_rgba(74,222,128,0.25)]">
      <Sprout size={24} strokeWidth={1.75} aria-hidden />
    </span>
  )
}

/* ------------------------------------------------------------- sidebar */
function SidebarItem({ item, helperId }: { item: NavItem; helperId: string }) {
  const Icon = item.icon
  const base =
    'relative flex min-h-[48px] w-full items-center gap-4 rounded-[var(--radius-control)] px-4 text-body font-semibold transition-colors duration-150'
  const indicator = item.active && (
    <span aria-hidden className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-accent shadow-[0_0_12px_rgba(74,222,128,0.6)]" />
  )
  if (!item.to) {
    return (
      <span
        role="link"
        aria-disabled="true"
        aria-describedby={helperId}
        className={cn(base, 'cursor-not-allowed flex-wrap py-2 text-fg-2 opacity-70')}
      >
        <Icon size={24} strokeWidth={1.75} aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span>{item.label}</span>
          <span id={helperId} className="text-label font-normal text-fg-3">
            {HELPER}
          </span>
        </span>
      </span>
    )
  }
  return (
    <Link
      to={item.to}
      aria-current={item.active ? 'page' : undefined}
      className={cn(
        base,
        item.active ? 'bg-accent/18 text-fg' : 'text-fg-2 hover:bg-glass-flat hover:text-fg',
      )}
    >
      {indicator}
      <Icon size={24} strokeWidth={1.75} aria-hidden className={item.active ? 'text-accent' : undefined} />
      {item.label}
    </Link>
  )
}

function Sidebar({ items }: { items: NavItem[] }) {
  const helperId = useId()
  return (
    <aside
      data-component="Sidebar"
      className="glass-strong fixed inset-y-0 left-0 z-[1100] hidden w-[256px] flex-col gap-8 rounded-none! border-y-0! border-l-0! p-4 xl:flex"
    >
      <Link to="/" className="flex min-h-[48px] items-center gap-2 rounded-[var(--radius-control)] no-underline">
        <BrandChip />
        <span className="flex flex-col">
          <span className="font-display text-heading font-semibold text-fg">Field Shift</span>
          <span className="text-label font-normal text-fg-3">Advisor</span>
        </span>
      </Link>
      <nav aria-label="Primary" className="flex-1">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((it) => (
            <li key={it.key}>
              <SidebarItem item={it} helperId={`${helperId}-${it.key}`} />
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        <AccountBox />
        <Disclaimer variant="card" />
      </div>
    </aside>
  )
}

/** Sidebar account block: "Create account" for visitors, name + sign out for signed-in users. */
function AccountBox() {
  const user = useAuth((s) => s.user)
  if (!user) {
    return (
      <Link
        to="/account"
        className="flex min-h-[48px] items-center gap-3 rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-4 text-label font-semibold text-fg no-underline hover:bg-accent/18"
      >
        <UserPlus size={20} strokeWidth={1.75} aria-hidden className="text-accent" />
        <span className="flex flex-col">
          Create account
          <span className="font-normal text-fg-3">to save your fields</span>
        </span>
      </Link>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] bg-glass-flat px-3 py-2">
      <span className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-accent/18 font-semibold text-accent">
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <Link to="/account" className="flex min-w-0 flex-1 flex-col no-underline">
        <span className="truncate text-label font-semibold text-fg">{user.name}</span>
        <span className="truncate text-[12px] text-fg-3">{user.email}</span>
      </Link>
      <Tooltip content="Sign out" side="top">
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => void accountApi.logout()}
          className="flex size-[36px] items-center justify-center rounded-full text-fg-2 hover:bg-[rgba(255,255,255,0.08)] hover:text-fg"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden />
        </button>
      </Tooltip>
    </div>
  )
}

/* ----------------------------------------------------------------- rail */
function Rail({ items }: { items: NavItem[] }) {
  const helperId = useId()
  return (
    <aside
      data-component="IconRail"
      className="glass-strong fixed inset-y-0 left-0 z-[1100] hidden w-[80px] flex-col items-center gap-8 rounded-none! border-y-0! border-l-0! py-4 md:flex xl:hidden"
    >
      <Link to="/" aria-label="Field Shift Advisor, overview" className="rounded-[var(--radius-chip)]">
        <BrandChip />
      </Link>
      <nav aria-label="Primary">
        <ul className="m-0 flex list-none flex-col items-center gap-2 p-0">
          {items.map((it) => {
            const Icon = it.icon
            const cls = cn(
              'relative flex size-[48px] items-center justify-center rounded-[var(--radius-control)] transition-colors duration-150',
              it.active ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-glass-flat hover:text-fg',
            )
            return (
              <li key={it.key}>
                <Tooltip content={it.to ? it.label : `${it.label}: ${HELPER}`} side="right">
                  {it.to ? (
                    <Link to={it.to} aria-label={it.label} aria-current={it.active ? 'page' : undefined} className={cls}>
                      {it.active && (
                        <span aria-hidden className="absolute -left-4 top-2 bottom-2 w-1 rounded-full bg-accent" />
                      )}
                      <Icon size={24} strokeWidth={1.75} aria-hidden />
                    </Link>
                  ) : (
                    <span
                      role="link"
                      aria-label={it.label}
                      aria-disabled="true"
                      aria-describedby={`${helperId}-h`}
                      title={HELPER}
                      className={cn(cls, 'cursor-not-allowed opacity-50')}
                    >
                      <Icon size={24} strokeWidth={1.75} aria-hidden />
                      <span id={`${helperId}-h`} className="sr-only">
                        {HELPER}
                      </span>
                    </span>
                  )}
                </Tooltip>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}

/* ------------------------------------------------------------ phone UI */
function MobileHeader() {
  return (
    <header
      data-component="MobileHeader"
      className="glass-strong fixed inset-x-0 top-0 z-[1100] flex h-[56px] items-center gap-2 rounded-none! border-x-0! border-t-0! px-4 md:hidden"
    >
      <Link to="/" className="flex items-center gap-2 no-underline">
        <span className="flex size-[40px] items-center justify-center rounded-[var(--radius-chip)] bg-accent/14 text-accent">
          <Sprout size={20} strokeWidth={1.75} aria-hidden />
        </span>
        <span className="font-display text-heading font-semibold text-fg">Field Shift</span>
        <span className="text-label font-normal text-fg-3">Advisor</span>
      </Link>
      <MobileAccount />
    </header>
  )
}

function MobileAccount() {
  const user = useAuth((s) => s.user)
  return (
    <Link
      to="/account"
      aria-label={user ? `Account: ${user.name}` : 'Create account or sign in'}
      className="ml-auto flex size-[40px] items-center justify-center rounded-full bg-accent/14 font-semibold text-accent no-underline"
    >
      {user ? user.name.slice(0, 1).toUpperCase() : <UserPlus size={20} strokeWidth={1.75} aria-hidden />}
    </Link>
  )
}

function BottomBar({ items }: { items: NavItem[] }) {
  const helperId = useId()
  return (
    <nav
      aria-label="Primary"
      data-component="BottomBar"
      className="glass-strong fixed inset-x-0 bottom-0 z-[1100] rounded-none! border-x-0! border-b-0! pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="m-0 grid h-[64px] list-none grid-cols-3 p-0">
        {items.map((it) => {
          const Icon = it.icon
          const cls = cn(
            'relative flex h-full w-full flex-col items-center justify-center gap-1 text-label font-semibold',
            it.active ? 'text-accent' : 'text-fg-2',
          )
          const pill = it.active && (
            <span aria-hidden className="absolute left-1/2 top-0 h-1 w-8 -translate-x-1/2 rounded-full bg-accent" />
          )
          return (
            <li key={it.key} className="min-w-0">
              {it.to ? (
                <Link to={it.to} aria-current={it.active ? 'page' : undefined} className={cls}>
                  {pill}
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                  {it.label}
                </Link>
              ) : (
                <span
                  role="link"
                  aria-disabled="true"
                  aria-describedby={`${helperId}-h`}
                  title={HELPER}
                  className={cn(cls, 'cursor-not-allowed opacity-50')}
                >
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                  {it.label}
                  <span id={`${helperId}-h`} className="sr-only">
                    {HELPER}
                  </span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/* ---------------------------------------------------------------- shell */
export function AppShell() {
  const items = useNavItems()
  const { pathname } = useLocation()
  const first = useRef(true)

  // Move focus to the page title after client-side navigation (not on first load).
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const id = requestAnimationFrame(() => document.getElementById('page-title')?.focus({ preventScroll: false }))
    window.scrollTo({ top: 0 })
    return () => cancelAnimationFrame(id)
  }, [pathname])

  return (
    <div data-component="AppShell" className="min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />
      <a
        href="#main"
        className="glass-strong fixed left-4 top-4 z-[1300] -translate-y-[200%] rounded-[var(--radius-control)] px-4 py-2 text-label font-semibold text-fg focus:translate-y-0"
      >
        Skip to main content
      </a>
      <Sidebar items={items} />
      <Rail items={items} />
      <MobileHeader />
      <main
        id="main"
        tabIndex={-1}
        className="min-w-0 pt-[72px] pb-[calc(64px+env(safe-area-inset-bottom)+16px)] outline-none md:pl-[80px] md:pt-0 md:pb-0 xl:pl-[256px]"
      >
        <div key={pathname} className="fsa-fade-in mx-auto w-full max-w-[1440px] px-4 md:px-6 md:py-6 xl:px-8 xl:py-8">
          <Outlet />
          <div className="mt-8 xl:hidden">
            <Disclaimer variant="inline" />
          </div>
        </div>
      </main>
      <BottomBar items={items} />
    </div>
  )
}

export default AppShell
