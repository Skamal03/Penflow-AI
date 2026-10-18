import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AccessDenied, AppShell, NotFound, PublicLayout } from './components/ui';
import { useSession } from './lib/session';
import type { Role } from './lib/types';
import { LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from './pages/AuthPages';
import {
  AdminPage, BillingPage, DashboardPage, FindingsPage, ReportViewPage, ReportsPage,
  ReviewQueuePage, RoeNewPage, RoeStatusPage, RunMonitorPage, RunsPage, SettingsPage, TargetsPage,
} from './pages/AppPages';
import { LegalPage } from './pages/LegalPages';
import { PublicPage } from './pages/PublicPages';

function RequireSession() {
  const { user, loading } = useSession();
  const location = useLocation();
  if (loading) return <div className="app-main" aria-busy="true">Loading account…</div>;
  if (!user) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}

function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useSession();
  if (!user || !roles.includes(user.role)) return <AccessDenied role={user?.role} />;
  return children;
}

function RouteFocus() {
  const location = useLocation();
  useEffect(() => {
    const path = location.pathname;
    const titles: Record<string, string> = {
      '/': 'PenflowAI — AI-orchestrated web penetration testing',
      '/how-it-works': 'How it works · PenflowAI',
      '/features': 'Features · PenflowAI',
      '/pricing': 'Pricing · PenflowAI',
      '/waitlist': 'Waitlist · PenflowAI',
      '/about': 'About · PenflowAI',
      '/contact': 'Contact · PenflowAI',
      '/security': 'Security · PenflowAI',
      '/accessibility': 'Accessibility · PenflowAI',
      '/app/dashboard': 'Dashboard · PenflowAI',
      '/app/targets': 'Targets · PenflowAI',
      '/app/targets/new': 'Add target · PenflowAI',
      '/app/roe/new': 'Upload ROE · PenflowAI',
      '/app/runs': 'Test runs · PenflowAI',
      '/app/reports': 'Reports · PenflowAI',
      '/app/billing': 'Billing · PenflowAI',
      '/app/settings': 'Settings · PenflowAI',
      '/admin/review-queue': 'Review queue · PenflowAI',
      '/admin/users': 'Users · PenflowAI',
      '/admin/tools': 'Tools · PenflowAI',
      '/admin/models': 'Models · PenflowAI',
      '/admin/audit-log': 'Audit log · PenflowAI',
      '/login': 'Log in · PenflowAI',
      '/signup': 'Sign up · PenflowAI',
      '/reset-password': 'Reset password · PenflowAI',
      '/verify-email': 'Verify email · PenflowAI',
      '/legal/privacy': 'Privacy · PenflowAI',
      '/legal/terms': 'Terms · PenflowAI',
      '/legal/cookies': 'Cookies · PenflowAI',
      '/legal/refunds': 'Refunds · PenflowAI',
      '/legal/acceptable-use': 'Acceptable use · PenflowAI',
    };
    const dynamicTitle = path.startsWith('/app/runs/') ? 'Run monitor · PenflowAI'
      : path.startsWith('/app/findings/') ? 'Findings · PenflowAI'
      : path.startsWith('/app/reports/') ? 'Report · PenflowAI'
      : path.startsWith('/app/roe/') ? 'ROE status · PenflowAI'
      : path.startsWith('/legal/') ? 'Legal draft · PenflowAI'
      : undefined;
    document.title = titles[path] ?? dynamicTitle ?? 'Not found · PenflowAI';
    const heading = document.querySelector<HTMLElement>('#main-content h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [location.pathname]);
  return null;
}

function CatchAll() {
  const { user } = useSession();
  return user ? <AppShell><NotFound /></AppShell> : <PublicLayout><NotFound /></PublicLayout>;
}

export function AppRouter() {
  return <><RouteFocus /><Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<PublicPage kind="home" />} />
      <Route path="/how-it-works" element={<PublicPage kind="how" />} />
      <Route path="/features" element={<PublicPage kind="features" />} />
      <Route path="/pricing" element={<PublicPage kind="pricing" />} />
      <Route path="/waitlist" element={<PublicPage kind="waitlist" />} />
      <Route path="/about" element={<PublicPage kind="about" />} />
      <Route path="/contact" element={<PublicPage kind="contact" />} />
      <Route path="/security" element={<PublicPage kind="security" />} />
      <Route path="/accessibility" element={<PublicPage kind="accessibility" />} />
      <Route path="/legal/:slug" element={<LegalPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
    </Route>
    <Route element={<RequireSession />}>
      <Route element={<AppShell />}>
        <Route path="/app" element={<Navigate to="/app/dashboard" replace />} />
        <Route path="/app/dashboard" element={<RoleGate roles={['requester']}><DashboardPage /></RoleGate>} />
        <Route path="/app/targets" element={<RoleGate roles={['requester']}><TargetsPage /></RoleGate>} />
        <Route path="/app/targets/new" element={<RoleGate roles={['requester']}><TargetsPage /></RoleGate>} />
        <Route path="/app/roe/new" element={<RoleGate roles={['requester']}><RoeNewPage /></RoleGate>} />
        <Route path="/app/roe/:id" element={<RoleGate roles={['requester']}><RoeStatusPage /></RoleGate>} />
        <Route path="/app/runs" element={<RoleGate roles={['requester']}><RunsPage /></RoleGate>} />
        <Route path="/app/runs/:id" element={<RoleGate roles={['requester']}><RunMonitorPage /></RoleGate>} />
        <Route path="/app/findings/:runId" element={<RoleGate roles={['requester']}><FindingsPage /></RoleGate>} />
        <Route path="/app/reports" element={<RoleGate roles={['requester']}><ReportsPage /></RoleGate>} />
        <Route path="/app/reports/:id" element={<RoleGate roles={['requester']}><ReportViewPage /></RoleGate>} />
        <Route path="/app/billing" element={<RoleGate roles={['requester']}><BillingPage /></RoleGate>} />
        <Route path="/app/settings" element={<SettingsPage />} />
        <Route path="/admin/review-queue" element={<RoleGate roles={['reviewer', 'admin']}><ReviewQueuePage /></RoleGate>} />
        <Route path="/admin/users" element={<RoleGate roles={['admin']}><AdminPage kind="users" /></RoleGate>} />
        <Route path="/admin/tools" element={<RoleGate roles={['admin']}><AdminPage kind="tools" /></RoleGate>} />
        <Route path="/admin/models" element={<RoleGate roles={['admin']}><AdminPage kind="models" /></RoleGate>} />
        <Route path="/admin/audit-log" element={<RoleGate roles={['admin']}><AdminPage kind="audit-log" /></RoleGate>} />
      </Route>
    </Route>
    <Route path="*" element={<CatchAll />} />
  </Routes></>;
}
