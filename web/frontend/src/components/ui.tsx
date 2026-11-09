import { useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import type { AuditEvent, Role } from '../lib/types';

export function SkipLink() {
  return <a className="skip-link" href="#main-content">Skip to main content</a>;
}

export function handleMagnetic(e: React.MouseEvent<HTMLElement>) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = Math.max(-6, Math.min(6, (e.clientX - (rect.left + rect.width / 2)) * 0.25));
  const y = Math.max(-6, Math.min(6, (e.clientY - (rect.top + rect.height / 2)) * 0.25));
  e.currentTarget.style.transform = `translate(${x}px, ${y - 2}px)`;
}

export function resetMagnetic(e: React.MouseEvent<HTMLElement>) {
  e.currentTarget.style.transform = '';
}

export function Button({ variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger' }) {
  return (
    <button
      className={`button button-${variant} ${props.className ?? ''}`}
      onMouseMove={variant === 'primary' ? handleMagnetic : undefined}
      onMouseLeave={variant === 'primary' ? resetMagnetic : undefined}
      {...props}
    />
  );
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

export function LucideIcon({ name, size = 18, className = '' }: { name: string; size?: number; className?: string }) {
  const icons: Record<string, JSX.Element> = {
    dashboard: <><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></>,
    targets: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    runs: <><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></>,
    reports: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></>,
    billing: <><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></>,
    settings: <><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></>,
    roe: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></>,
    queue: <><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    tools: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>,
    models: <><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/></>,
    audit: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>,
    'shield-check': <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    'file-search': <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="m13.25 16.25 2.25 2.25"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    layers: <><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5"/><path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {icons[name] ?? icons.activity}
    </svg>
  );
}

const setCardPointerVars = (e: React.PointerEvent<HTMLDivElement>) => {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--card-x', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--card-y', `${e.clientY - rect.top}px`);
};

export function GlassCard({ children, className = '', stagger = 0, onPointerMove, ...props }: HTMLAttributes<HTMLDivElement> & { stagger?: number }) {
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    setCardPointerVars(e);
    if (onPointerMove) onPointerMove(e);
  };
  return (
    <div
      className={`glass-card ${className}`}
      style={{ '--stagger': stagger } as React.CSSProperties}
      onPointerMove={handlePointerMove}
      {...props}
    >
      {children}
    </div>
  );
}

export function NeoCard({ children, className = '', onPointerMove, ...props }: HTMLAttributes<HTMLDivElement>) {
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    setCardPointerVars(e);
    if (onPointerMove) onPointerMove(e);
  };
  return (
    <div className={`neo-card ${className}`} onPointerMove={handlePointerMove} {...props}>
      {children}
    </div>
  );
}

export function usePointerVars() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const root = document.documentElement;
    let targetX = -999;
    let targetY = -999;
    let currentX = -999;
    let currentY = -999;
    let rafId: number | null = null;
    let isRunning = false;

    const loop = () => {
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) {
        currentX = targetX;
        currentY = targetY;
        root.style.setProperty('--mx', `${currentX}px`);
        root.style.setProperty('--my', `${currentY}px`);
        isRunning = false;
        rafId = null;
        return;
      }
      currentX += dx * 0.15;
      currentY += dy * 0.15;
      root.style.setProperty('--mx', `${currentX}px`);
      root.style.setProperty('--my', `${currentY}px`);
      rafId = requestAnimationFrame(loop);
    };

    const onPointerMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (currentX === -999) {
        currentX = targetX;
        currentY = targetY;
        root.style.setProperty('--mx', `${currentX}px`);
        root.style.setProperty('--my', `${currentY}px`);
      }
      if (!isRunning) {
        isRunning = true;
        rafId = requestAnimationFrame(loop);
      }
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);
}

export function PointerVars() {
  usePointerVars();
  return null;
}

export function BackgroundOrbs() {
  return (
    <div className="bg-canvas" aria-hidden="true">
      <div className="orb orb-lime" />
      <div className="orb orb-violet" />
      <div className="orb orb-cyan" />
      <div className="grid-reveal" />
      <div className="noise-overlay" />
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-pulse-icon" aria-hidden="true">{icon ?? <LucideIcon name="activity" size={24} />}</div>
      <span className="empty-index">NO RECORDS</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
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

export function ScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(total > 0 ? (window.scrollY / total) * 100 : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return <div className="scroll-progress-bar" style={{ width: `${progress}%` }} aria-hidden="true" />;
}

export function PublicBackground() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const handleScroll = () => setOffset(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return (
    <div className="public-bg-canvas" aria-hidden="true">
      <div className="neo-blob blob-lime" style={{ transform: `translateY(${offset * 0.2}px)` }} />
      <div className="neo-blob blob-violet" style={{ transform: `translateY(${offset * 0.4}px)` }} />
      <div className="faint-grid" />
      <div className="grid-reveal" />
    </div>
  );
}

export function RevealSection({ children, className = '', ...props }: HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section ref={ref} className={`reveal-section ${revealed ? 'is-revealed' : ''} ${className}`} {...props}>
      {children}
    </section>
  );
}

export function SiteHeader() {
  const { user } = useSession();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return <header className={`site-header neo-nav-pill ${scrolled ? 'is-scrolled' : ''}`}>
    <Link className="wordmark" to="/" aria-label="PenflowAI home"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link>
    <nav className="site-nav" aria-label="Main navigation">
      <NavLink to="/how-it-works">How it works</NavLink><NavLink to="/features">Features</NavLink><NavLink to="/pricing">Pricing</NavLink>
    </nav>
    <div className="header-actions">{user ? <Link className="button button-secondary" to="/app/dashboard">Open workspace <span className="button-arrow" aria-hidden="true">→</span></Link> : <><Link className="quiet-link" to="/login">Log in</Link><Link className="button button-primary" to="/waitlist" onMouseMove={handleMagnetic} onMouseLeave={resetMagnetic}>Join waitlist</Link></>}</div>
  </header>;
}

export function SiteFooter() {
  return <footer className="site-footer">
    <div className="footer-top"><div><Link className="wordmark" to="/"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link><p>PenflowAI is in early access development.</p><p>For systems you own or have written permission to test.</p></div><div className="footer-meta"><span>Operated by: [founders' names]</span><span>Contact: [project email]</span><span>© 2026 PenflowAI</span></div></div>
    <nav className="footer-links" aria-label="Legal and information">{legalLinks.map(([href, label]) => <Link key={href} to={href}>{label}</Link>)}<Link to="/about">About</Link><Link to="/contact">Contact</Link></nav>
  </footer>;
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  return <><ScrollProgress /><PublicBackground /><SkipLink /><div className="public-shell"><SiteHeader /><main id="main-content" tabIndex={-1}>{children ?? <Outlet />}</main><SiteFooter /></div></>;
}

const requesterNav = [
  ['/app/dashboard', 'Dashboard'], ['/app/targets', 'Targets'], ['/app/runs', 'Test runs'], ['/app/reports', 'Reports'], ['/app/billing', 'Billing'], ['/app/settings', 'Settings'],
];

const navIconMap: Record<string, string> = {
  '/app/dashboard': 'dashboard',
  '/app/targets': 'targets',
  '/app/runs': 'runs',
  '/app/reports': 'reports',
  '/app/billing': 'billing',
  '/app/settings': 'settings',
  '/app/roe/new': 'roe',
  '/admin/review-queue': 'queue',
  '/admin/users': 'users',
  '/admin/tools': 'tools',
  '/admin/models': 'models',
  '/admin/audit-log': 'audit',
};

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

  return <><SkipLink /><BackgroundOrbs /><div className="app-frame">
    <header className="app-topbar">
      <Link className="wordmark" to="/app/dashboard"><span className="wordmark-glyph" aria-hidden="true"><i /><i /></span><span>penflow</span></Link>
      <div className="app-user-bar glass-panel">
        <span className="user-dot" aria-hidden="true" />
        <span className="user-name">{user?.displayName}</span>
        <span className="role-label">{user?.role}</span>
        <button className="text-button" onClick={() => void leave()}>Log out</button>
      </div>
    </header>
    {noticeVisible && (
      <div className="honesty-banner glass-panel" role="status">
        <div className="banner-content">
          <span className="amber-dot" aria-hidden="true" />
          <span><strong>Engine not connected</strong> — scan activity shown is simulated from seeded data.</span>
        </div>
        <button className="banner-dismiss" aria-label="Dismiss engine status for this session" onClick={() => { sessionStorage.setItem('engine-notice-dismissed', '1'); setNoticeVisible(false); }}>Dismiss</button>
      </div>
    )}
    <div className="app-layout">
      <aside className="app-sidebar floating-nav glass-panel" aria-label="Workspace navigation">
        <nav aria-label="Workspace links">
          {roleLinks.map(([to, label]) => (
            <NavLink key={to} end={to === '/app/dashboard'} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label={label}>
              <span className="nav-glow-bar" aria-hidden="true" />
              <LucideIcon name={navIconMap[to] ?? 'activity'} size={20} className="nav-icon" />
              <span className="nav-tooltip" role="tooltip">{label}</span>
            </NavLink>
          ))}
          {user?.role === 'requester' && (
            <NavLink to="/app/roe/new" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} aria-label="Submit ROE">
              <span className="nav-glow-bar" aria-hidden="true" />
              <LucideIcon name="roe" size={20} className="nav-icon" />
              <span className="nav-tooltip" role="tooltip">Submit ROE</span>
            </NavLink>
          )}
        </nav>
        {showRoleSwitch && <div className="dev-switch"><label htmlFor="dev-role">Role</label><select id="dev-role" value={user?.role ?? 'requester'} onChange={(event) => { setSwitchError(''); void switchRole(event.target.value as Role).catch(() => setSwitchError('Role switch is unavailable.')); }}><option value="requester">Requester</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option></select>{switchError && <p className="field-error">{switchError}</p>}</div>}
      </aside>
      <main id="main-content" className="app-main" tabIndex={-1}>{children ?? <Outlet />}</main>
    </div>
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
