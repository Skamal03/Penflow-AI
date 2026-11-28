import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';

function useTokenFromHash(): string {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}

export function LoginPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const signedInUser = await signIn(email, password);
      const requestedPath = params.get('returnTo') ?? '';
      const defaultPath = signedInUser.role === 'requester' ? '/app/dashboard'
        : signedInUser.role === 'reviewer' ? '/admin/review-queue' : '/admin/users';
      const allowedReturnPath = requestedPath.startsWith('/') && !requestedPath.startsWith('//')
        && (signedInUser.role === 'requester' ? requestedPath.startsWith('/app/')
          : signedInUser.role === 'reviewer' ? requestedPath === '/admin/review-queue'
            : requestedPath.startsWith('/admin/'));
      navigate(allowedReturnPath ? requestedPath : defaultPath, { replace: true });
    }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · DEVELOPMENT BUILD</span><h1>Log in.</h1><p className="small">Authentication uses a server-side session in this development build. Scan execution is not connected.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <div className="error-summary" role="alert" aria-live="polite">{error}</div>}<Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><Field label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</Button></form><div className="auth-links"><Link to="/forgot-password">Forgot password?</Link><Link to="/signup">Create an account</Link></div></section>;
}

export function SignupPage() {
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState('freelance');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const firstInvalid = Object.keys(fields)[0];
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }, [fields]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setFields({}); setBusy(true);
    try { await signUp({ email, password, displayName, accountType, acceptedTerms }); setMessage('Check your email to continue. If an account already uses this address, we sent a notice instead.'); }
    catch (caught) { const apiError = caught as ApiError; setError(apiError.message); setFields(apiError.fields ?? {}); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · EARLY ACCESS</span><h1>Create an account.</h1><p className="small">We use your email to run your account, confirm your address, and send service messages.</p>
    {message ? <><Alert tone="success">{message}</Alert><div className="auth-links"><Link to="/login">Go to log in</Link></div></> : <form className="form-stack" onSubmit={submit} noValidate>
      {error && <div className="error-summary" role="alert" aria-live="polite"><strong>{error}</strong>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([key, detail]) => <li key={key}><a href={`#${key}`}>{key}: {detail}</a></li>)}</ul>}</div>}
      <Field label="Name" name="displayName" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} required hint="At least 12 characters. Avoid common passwords." value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} />
      <div className="field"><label htmlFor="accountType">What best describes you?</label><select id="accountType" value={accountType} onChange={(e) => setAccountType(e.target.value)}><option value="freelance">Freelance security professional</option><option value="software_team">Software team</option><option value="agency">Agency or consultancy</option><option value="student">Student or researcher</option></select></div>
      <Checkbox name="acceptedTerms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} error={fields.acceptedTerms} label={<>I am 18 or older and I agree to the <Link to="/legal/terms">Terms and Conditions</Link> and <Link to="/legal/acceptable-use">Acceptable Use Policy</Link>. I have read the <Link to="/legal/privacy">Privacy Policy</Link>. <strong>required</strong></>} />
      <Button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</Button>
    </form>}
    <div className="auth-links"><Link to="/login">Already have an account? Log in</Link></div></section>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { const result = await api.post<{ message: string }>('/auth/forgot-password', { email }); setMessage(result.message); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Reset your password.</h1><p className="small">Enter the address you signed up with. If an account uses it, we send a single-use link that expires in 30 minutes.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <Alert tone="danger" role="alert">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}{!message && <><Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><Button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button></>}</form><div className="auth-links"><Link to="/login">Return to log in</Link><Link to="/signup">Create an account</Link></div></section>;
}

export function ResetPasswordPage() {
  const token = useTokenFromHash();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setFieldError(''); setMessage('');
    try { const result = await api.post<{ message: string }>('/auth/reset-password', { token, newPassword: password }); setMessage(result.message); setPassword(''); }
    catch (caught) { const apiError = caught as ApiError; setError(apiError.message); setFieldError(apiError.fields.password ?? ''); }
    finally { setBusy(false); }
  }
  if (!token) return <section className="auth-wrap"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Reset your password.</h1><Alert tone="warning">This page needs a reset link. Request a new one to continue.</Alert><div className="auth-links"><Link to="/forgot-password">Request a reset link</Link><Link to="/login">Return to log in</Link></div></section>;
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>Choose a new password.</h1><p className="small">The link works once and expires 30 minutes after it was sent. All signed-in sessions will be signed out.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <Alert tone="danger" role="alert">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}{!message && <><Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} required hint="At least 12 characters. Avoid common passwords." value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} /><Button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button></>}</form><div className="auth-links"><Link to="/login">Return to log in</Link></div></section>;
}

export function VerifyEmailPage() {
  const token = useTokenFromHash();
  const { refresh } = useSession();
  const started = useRef(false);
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>(token ? 'busy' : 'idle');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.post<{ message: string }>('/auth/verify-email', { token })
      .then(async (result) => { setMessage(result.message); setStatus('done'); await refresh(); })
      .catch((caught: Error) => { setMessage(caught.message); setStatus('error'); });
  }, [token]);
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · EMAIL</span><h1>Verify your email.</h1>
    {!token && <><Alert tone="warning">This page needs a verification link.</Alert><div className="auth-links"><Link to="/login">Log in</Link></div></>}
    {token && status === 'busy' && <p className="small" aria-live="polite">Confirming your address…</p>}
    {token && status === 'done' && <><Alert tone="success">{message}</Alert><div className="auth-links"><Link to="/app/dashboard">Go to your dashboard</Link></div></>}
    {token && status === 'error' && <><Alert tone="danger" role="alert">{message}</Alert><p className="small">Verification links expire after 24 hours and work once. Sign in and resend the message from your dashboard.</p><div className="auth-links"><Link to="/login">Log in</Link></div></>}
  </section>;
}
