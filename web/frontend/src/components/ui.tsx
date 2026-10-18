import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import type { AuditEvent, Role } from '../lib/types';

export function SkipLink() {
  return <a className="skip-link" href="#main-content">Skip to main content</a>;
}

export function Button({ variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return <button className={`button button-${variant} ${props.className ?? ''}`} {...props} />;
}

export function Field({ label, hint, error, required, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; required?: boolean }) {
  const fieldId = id ?? props.name;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return <div className="field">
    <label htmlFor={fieldId}>{label}{required && <span className="required-word">required</span>}</label>
    {hint && <p className="field-hint" id={hintId}>{hint}</p>}
    <input id={fieldId} aria-invalid={Boolean(error)} aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined} {...props} />
    {error && <p className="field-error" id={errorId}>{error}</p>}
  </div>;
}

export function Checkbox({ id, label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }) {
  const fieldId = id ?? props.name;
  return <div className="checkbox-field">
    <input id={fieldId} type="checkbox" aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldId}-error` : undefined} {...props} />
    <label htmlFor={fieldId}>{label}</label>
    {error && <p className="field-error" id={`${fieldId}-error`}>{error}</p>}
  </div>;
}

export function Alert({ children, tone = 'neutral', role = 'status' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger'; role?: 'status' | 'alert' }) {
  return <div className={`alert alert-${tone}`} role={role}>{children}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'critical' | 'high' | 'medium' | 'low' | 'success' | 'warning' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-index">NO RECORDS</span><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}

export function LoadingState({ label = 'Loading data' }: { label?: string }) {
  return <div className="loading-state" aria-busy="true"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <Alert tone="danger" role="alert"><strong>Could not load this view.</strong> {message}{onRetry && <> <button className="text-button" onClick={onRetry}>Try again</button></>}</Alert>;
}

export function StageTracker({ current }: { current: string }) {
  const stages = ['recon', 'scan', 'identify', 'verify'];
  const currentIndex = stages.indexOf(current);
  return <ol className="stage-tracker" aria-label="Test stages">
    {stages.map((stage, index) => <li key={stage} className={`${index < currentIndex ? 'is-complete' : ''} ${index === currentIndex ? 'is-current' : ''}`} aria-current={index === currentIndex ? 'step' : undefined}>
      <span className="stage-number">{String(index + 1).padStart(2, '0')}</span><span>{stage[0].toUpperCase() + stage.slice(1)}</span>
    </li>)}
  </ol>;
}

export function RiskScore({ score }: { score: number }) {
  return <div className="risk-score"><strong>{score}</strong><span className="risk-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} /></span><span className="sr-only">Risk score {score} out of 100</span></div>;
}

export function LogViewer({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <EmptyState title="No audit events yet." />;
  return <ol className="log-list">
    {events.map((event) => <li key={event.id} className={event.blocked ? 'log-entry is-blocked' : 'log-entry'}>
      <div className="log-meta"><time>{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time><span className="log-actor">{event.actor}</span><span>{event.action.replaceAll('_', ' ')}</span>{Boolean(event.blocked) && <Badge tone="critical">BLOCKED</Badge>}</div>
      <code className="log-target">{event.target}</code>
      <p>{event.detail}</p>
    </li>)}
  </ol>;
}

const legalLinks = [
  ['/legal/privacy', 'Privacy'], ['/legal/terms', 'Terms'], ['/legal/cookies', 'Cookies'],
  ['/legal/refunds', 'Refunds'], ['/legal/acceptable-use', 'Acceptable use'], ['/accessibility', 'Accessibility'], ['/security', 'Security'],
];

export function SiteHeader() {
  const { user } = useSession();
  return <header className="site-header">
    <Link className="wordmark" to="/" aria-label="PenflowAI home"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link>
    <nav className="site-nav" aria-label="Main navigation">
      <NavLink to="/how-it-works">How it works</NavLink><NavLink to="/features">Features</NavLink><NavLink to="/pricing">Pricing</NavLink>
    </nav>
    <div className="header-actions">{user ? <Link className="button button-secondary" to="/app/dashboard">Open workspace</Link> : <><Link className="quiet-link" to="/login">Log in</Link><Link className="button button-primary" to="/waitlist">Join waitlist</Link></>}</div>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-top"><div><Link className="wordmark" to="/"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link><p>PenflowAI is in early access development.</p><p>For systems you own or have written permission to test.</p></div><div className="footer-meta"><span>Operated by: [founders' names]</span><span>Contact: [project email]</span><span>© 2026 PenflowAI</span></div></div>
    <nav className="footer-links" aria-label="Legal and information">{legalLinks.map(([href, label]) => <Link key={href} to={href}>{label}</Link>)}<Link to="/about">About</Link><Link to="/contact">Contact</Link></nav>
  </footer>;
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  return <><SkipLink /><SiteHeader /><main id="main-content" tabIndex={-1}>{children ?? <Outlet />}</main><SiteFooter /></>;
}

const requesterNav = [
  ['/app/dashboard', 'Dashboard'], ['/app/targets', 'Targets'], ['/app/runs', 'Test runs'], ['/app/reports', 'Reports'], ['/app/billing', 'Billing'], ['/app/settings', 'Settings'],
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { user, signOut, switchRole } = useSession();
  const navigate = useNavigate();
  const [noticeVisible, setNoticeVisible] = useState(() => sessionStorage.getItem('engine-notice-dismissed') !== '1');
  const [switchError, setSwitchError] = useState('');
  const showRoleSwitch = import.meta.env.DEV && import.meta.env.VITE_DEV_ROLE_SWITCH === 'true';
  const roleLinks = user?.role === 'requester' ? requesterNav : user?.role === 'reviewer' ? [['/admin/review-queue', 'Review queue']] : [['/admin/review-queue', 'Review queue'], ['/admin/users', 'Users'], ['/admin/tools', 'Tools'], ['/admin/models', 'Models'], ['/admin/audit-log', 'Audit log']];

  async function leave() {
    await signOut();
    navigate('/');
  }

  return <><SkipLink /><div className="app-frame">
    <header className="app-topbar"><Link className="wordmark" to="/app/dashboard"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link><div className="app-user"><span className="user-dot" aria-hidden="true" />{user?.displayName}<span className="role-label">{user?.role}</span><button className="text-button" onClick={() => void leave()}>Log out</button></div></header>
    {noticeVisible && <div className="honesty-banner" role="status"><span><strong>Engine not connected</strong> — scan activity shown is simulated from seeded data.</span><button className="banner-dismiss" aria-label="Dismiss engine status for this session" onClick={() => { sessionStorage.setItem('engine-notice-dismissed', '1'); setNoticeVisible(false); }}>Dismiss</button></div>}
    <div className="app-layout"><aside className="app-sidebar"><div className="sidebar-label">Workspace</div><nav aria-label="Workspace navigation">{roleLinks.map(([to, label]) => <NavLink key={to} end={to === '/app/dashboard'} to={to}>{label}</NavLink>)}{user?.role === 'requester' && <NavLink to="/app/roe/new">Submit ROE</NavLink>}</nav>
      {showRoleSwitch && <div className="dev-switch"><label htmlFor="dev-role">Development control</label><select id="dev-role" value={user?.role ?? 'requester'} onChange={(event) => { setSwitchError(''); void switchRole(event.target.value as Role).catch(() => setSwitchError('Role switch is unavailable.')); }}><option value="requester">Requester</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option></select>{switchError && <p className="field-error">{switchError}</p>}</div>}
      <div className="sidebar-bottom"><span className="system-state"><i /> Early access</span><span>Workspace ID · {user?.id.slice(-6)}</span></div>
    </aside><main id="main-content" className="app-main" tabIndex={-1}>{children ?? <Outlet />}</main></div>
    <footer className="app-footer"><span>PenflowAI · development workspace</span><span>Only test systems you own or have written permission to test.</span></footer>
  </div></>;
}

export function AccessDenied({ role }: { role?: Role }) {
  const message = role === 'requester'
    ? 'Your role can access its own dashboard, targets, ROE documents, runs, findings, reports, billing, and settings.'
    : role === 'reviewer'
      ? 'Your role can access the ROE review queue. Administrator screens and requester workspaces are restricted.'
      : 'Your administrator role can access staff tools, model information, users, and the global audit log.';
  const destination = role === 'requester' ? '/app/dashboard' : role === 'reviewer' ? '/admin/review-queue' : '/admin/users';
  return <section className="page-wrap narrow"><span className="eyebrow">403 · ACCESS CONTROL</span><h1>This page is not available to your role.</h1><p>{message}</p><Link className="button button-secondary" to={destination}>Go to an available page</Link></section>;
}

export function NotFound() {
  return <section className="page-wrap narrow"><span className="eyebrow">404 · ROUTE NOT FOUND</span><h1>This route does not exist.</h1><p>Check the address or return to an available PenflowAI page.</p><Link className="button button-secondary" to="/app/dashboard">Return to workspace</Link></section>;
}
