import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Checkbox, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';

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
    try { await signIn(email, password); navigate(params.get('returnTo') || '/app/dashboard', { replace: true }); }
    catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · DEVELOPMENT BUILD</span><h1>Log in.</h1><p className="small">Authentication uses a server-side session in this development build. Scan execution is not connected.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <div className="error-summary" role="alert" aria-live="polite">{error}</div>}<Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /><Field label="Password" name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</Button></form><div className="auth-links"><Link to="/reset-password">Forgot password?</Link><Link to="/signup">Create an account</Link></div></section>;
}

export function SignupPage() {
  const { signUp } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accountType, setAccountType] = useState('freelance');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const firstInvalid = Object.keys(fields)[0];
    if (firstInvalid) document.getElementById(firstInvalid)?.focus();
  }, [fields]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setFields({}); setBusy(true);
    try { await signUp({ email, password, displayName, accountType, acceptedTerms }); navigate('/app/dashboard', { replace: true }); }
    catch (caught) { const apiError = caught as ApiError; setError(apiError.message); setFields(apiError.fields ?? {}); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · EARLY ACCESS</span><h1>Create an account.</h1><p className="small">We use your email to run your account and send service messages. Verification email delivery is simulated in the server log.</p><form className="form-stack" onSubmit={submit} noValidate>
    {error && <div className="error-summary" role="alert" aria-live="polite"><strong>{error}</strong>{Object.keys(fields).length > 0 && <ul>{Object.entries(fields).map(([key, message]) => <li key={key}><a href={`#${key}`}>{key}: {message}</a></li>)}</ul>}</div>}
    <Field label="Name" name="displayName" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
    <Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fields.email} />
    <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} required hint="At least 12 characters. Avoid common passwords." value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} />
    <div className="field"><label htmlFor="accountType">What best describes you?</label><select id="accountType" value={accountType} onChange={(e) => setAccountType(e.target.value)}><option value="freelance">Freelance security professional</option><option value="software_team">Software team</option><option value="agency">Agency or consultancy</option><option value="student">Student or researcher</option></select></div>
    <Checkbox name="acceptedTerms" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} error={fields.acceptedTerms} label={<>I am 18 or older and I agree to the <Link to="/legal/terms">Terms and Conditions</Link> and <Link to="/legal/acceptable-use">Acceptable Use Policy</Link>. I have read the <Link to="/legal/privacy">Privacy Policy</Link>. <strong>required</strong></>} />
    <Button type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create my account'}</Button>
  </form><div className="auth-links"><Link to="/login">Already have an account? Log in</Link></div></section>;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = token ? await api.post<{ message: string }>('/auth/complete-reset', { token, password }) : await api.post<{ message: string }>('/auth/password-reset', { email });
      setMessage(result.message);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT RECOVERY</span><h1>{token ? 'Choose a new password.' : 'Reset your password.'}</h1><p className="small"><strong>[dev only]</strong> Email delivery is not configured. Reset links are written to the server log, not sent by email.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <Alert tone="danger" role="alert">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}{token ? <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(e) => setPassword(e.target.value)} /> : <Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}<Button type="submit" disabled={busy}>{busy ? 'Working…' : token ? 'Update password' : 'Request reset link'}</Button></form><div className="auth-links"><Link to="/login">Return to log in</Link></div></section>;
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = token ? await api.post<{ message: string }>('/auth/complete-verification', { token }) : await api.post<{ message: string }>('/auth/verify-email', { email });
      setMessage(result.message);
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="auth-wrap"><span className="eyebrow">ACCOUNT · EMAIL</span><h1>{token ? 'Verify your email.' : 'Email verification.'}</h1><p className="small"><strong>[dev only]</strong> Email delivery is not configured. Verification links are written to the server log.</p><form className="form-stack" onSubmit={submit} noValidate>{error && <Alert tone="danger" role="alert">{error}</Alert>}{message && <Alert tone="success">{message}</Alert>}{!token && <Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}<Button type="submit" disabled={busy}>{busy ? 'Working…' : token ? 'Verify email' : 'Request verification link'}</Button></form><div className="auth-links"><Link to="/login">Log in</Link></div></section>;
}
