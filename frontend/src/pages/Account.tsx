import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogIn, LogOut, MailCheck, MapPinned, Ruler, ShieldCheck, UserPlus } from 'lucide-react'
import { accountApi } from '../api/account'
import { accountsEnabled } from '../lib/supabase'
import { useAuth } from '../store/useAuth'
import PageHeader from '../components/shell/PageHeader'
import { Button } from '../components/ui/Button'
import { Notice } from '../components/ui/Notice'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Ltr } from '../components/ui/Ltr'
import { useI18n } from '../lib/i18n'

export const inputCls =
  'min-h-[44px] w-full rounded-[var(--radius-control)] border border-[color:var(--color-control-border,rgba(190,242,220,0.25))] bg-[rgba(0,0,0,0.25)] px-3 text-body text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none'

export function AccountsNotConfigured() {
  const { t, rich } = useI18n()
  return (
    <Notice tone="warn" title={t('account.notConfiguredTitle')}>
      {rich('account.notConfiguredBody', {
        vars: <Ltr>VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY</Ltr>,
        file: <Ltr>frontend/.env</Ltr>,
        readme: <Ltr>supabase/README.md</Ltr>,
      })}
    </Notice>
  )
}

/** Sign in or create an account. An account is only needed to save your own fields. */
export default function Account() {
  const [params] = useSearchParams()
  const { t, rich } = useI18n()
  const [mode, setMode] = useState<'signup' | 'login'>(params.get('mode') === 'login' ? 'login' : 'signup')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const user = useAuth((s) => s.user)
  const navigate = useNavigate()
  const next = params.get('next') || '/my-fields'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await accountApi.signup(name, email, password)
        if (needsConfirmation) {
          setConfirmSent(true)
          return
        }
      } else {
        await accountApi.login(email, password)
      }
      navigate(next)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col">
        <PageHeader
          title={t('account.yourAccount')}
          subtitle={rich('account.signedInAs', { name: user.name, email: <Ltr>{user.email}</Ltr> })}
        />
        <div className="glass flex flex-col gap-4 p-6">
          <Link to="/my-fields" className={buttonClasses('primary')}>
            <MapPinned size={20} strokeWidth={1.75} aria-hidden /> {t('account.goToMyFields')}
          </Link>
          <Button
            icon={LogOut}
            onClick={async () => {
              await accountApi.logout()
              navigate('/')
            }}
          >
            {t('nav.signOut')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid w-full max-w-[980px] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col">
        <PageHeader
          title={mode === 'signup' ? t('account.createTitle') : t('account.signInTitle')}
          subtitle={t('account.subtitle')}
        />
        <ul className="m-0 flex list-none flex-col gap-4 p-0 text-body text-fg-2">
          <li className="flex gap-3">
            <MapPinned size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>{t('account.benefitMark')}</span>
          </li>
          <li className="flex gap-3">
            <Ruler size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>{t('account.benefitMeasure')}</span>
          </li>
          <li className="flex gap-3">
            <ShieldCheck size={22} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0 text-accent" />
            <span>{t('account.benefitPrivate')}</span>
          </li>
        </ul>
      </div>

      {!accountsEnabled ? (
        <AccountsNotConfigured />
      ) : confirmSent ? (
        <div className="glass flex flex-col gap-3 p-6">
          <MailCheck size={32} strokeWidth={1.75} aria-hidden className="text-accent" />
          <h2 className="m-0 text-heading font-semibold text-fg">{t('account.checkEmail')}</h2>
          <p className="m-0 text-body text-fg-2">
            {rich('account.confirmSent', {
              email: (
                <strong className="text-fg">
                  <Ltr>{email}</Ltr>
                </strong>
              ),
            })}
          </p>
          <Button
            onClick={() => {
              setConfirmSent(false)
              setMode('login')
            }}
          >
            {t('account.confirmedSignIn')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="glass flex flex-col gap-4 p-6" noValidate>
          <SegmentedControl
            label={t('account.actionLabel')}
            value={mode}
            onChange={(m) => {
              setMode(m)
              setError(null)
            }}
            options={[
              { value: 'signup', label: t('nav.createAccount') },
              { value: 'login', label: t('nav.signIn') },
            ]}
          />
          {mode === 'signup' && (
            <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
              {t('account.name')}
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </label>
          )}
          <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
            {t('account.email')}
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1 text-label font-semibold text-fg-2">
            {t('account.password')}
            <input
              className={inputCls}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            {mode === 'signup' && <span className="font-normal text-fg-3">{t('account.passwordHint')}</span>}
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={busy}
            icon={mode === 'signup' ? UserPlus : LogIn}
            disabled={!email || !password || (mode === 'signup' && (!name.trim() || password.length < 8))}
          >
            {mode === 'signup' ? t('nav.createAccount') : t('nav.signIn')}
          </Button>
        </form>
      )}
    </div>
  )
}
