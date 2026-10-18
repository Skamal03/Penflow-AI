import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import type { Plan } from '../lib/types';
import { Alert, Badge, Button, Checkbox, EmptyState, ErrorState, Field, LoadingState } from '../components/ui';
import { renderLegalMarkdown } from './LegalPages';
import accessibilityText from '../content/legal/accessibility.md?raw';
import securityText from '../content/legal/security.md?raw';

type PublicKind = 'home' | 'how' | 'features' | 'pricing' | 'waitlist' | 'about' | 'contact' | 'security' | 'accessibility';

export function PublicPage({ kind }: { kind: PublicKind }) {
  if (kind === 'pricing') return <PricingPage />;
  if (kind === 'waitlist') return <WaitlistPage />;
  const pages: Record<Exclude<PublicKind, 'pricing' | 'waitlist'>, ReactNode> = {
    home: <HomePage />,
    how: <HowPage />,
    features: <FeaturesPage />,
    about: <AboutPage />,
    contact: <ContactPage />,
    security: <SecurityPage />,
    accessibility: <AccessibilityPage />,
  };
  return pages[kind];
}

function HomePage() {
  return <>
    <section className="page-wrap hero">
      <div><span className="early-label">Early access · Product in development</span><h1>Security testing that starts with permission.</h1><p className="lede">PenflowAI is a web security testing project designed to check authorization, keep testing within an approved scope, and explain findings in plain language.</p><div className="hero-actions"><Link className="button button-primary" to="/waitlist">Join the early access waitlist</Link><Link className="button button-secondary" to="/how-it-works">See how it works</Link></div><p className="small" style={{ marginTop: 18 }}>For systems you own or have written permission to test.</p></div>
      <div className="hero-side"><span className="section-kicker">THE CONTROL PATH</span><ol className="pipeline-list"><li><span className="pipeline-num">01</span><strong>Permission document</strong><span className="pipeline-state">ROE</span></li><li><span className="pipeline-num">02</span><strong>Review and approval</strong><span className="pipeline-state">CHECK</span></li><li><span className="pipeline-num">03</span><strong>Approved target list</strong><span className="pipeline-state">SCOPE</span></li><li><span className="pipeline-num">04</span><strong>Findings and audit trail</strong><span className="pipeline-state">REPORT</span></li></ol><p className="small" style={{ marginTop: 18, marginBottom: 0 }}>The web workflow is under development. Scan execution is not connected.</p></div>
    </section>
    <section className="page-wrap section-block"><div className="section-heading"><div><span className="section-kicker">DESIGNED AROUND THREE CHECKS</span><h2>Governance before automation</h2></div></div><div className="public-grid"><article><span className="mono small">01 / AUTHORIZATION</span><h3>Check the permission first</h3><p>Rules of Engagement (ROE) documents go through automated checks and a human review path for flagged cases.</p></article><article><span className="mono small">02 / SCOPE</span><h3>Keep the target boundary explicit</h3><p>The intended workflow uses verified targets and a scope token before a run can begin.</p></article><article><span className="mono small">03 / EXPLANATION</span><h3>Make results reviewable</h3><p>Findings pair a score with evidence and plain-language context. AI output still needs human review.</p></article></div></section>
  </>;
}

function HowPage() {
  const steps = [
    ['Submit a Rules of Engagement document', 'The requester identifies verified targets, provides written authorization, and confirms the attestation.'],
    ['Check the document', 'Automated checks look for missing or inconsistent fields. Flagged documents go to a reviewer.'],
    ['Approve scope', 'A scope token is issued only after approval. Without it, a security test cannot start.'],
    ['Run within the boundary', 'The planned engine stages are Recon, Scan, Identify, and Verify. Scope Guard blocks requests outside the approved list.'],
    ['Review findings', 'Evidence, threat context, risk rationale, and an audit trail are presented for human review.'],
  ];
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">WORKFLOW · EARLY ACCESS</span><h1>From written permission to a reviewable result.</h1><p className="lede">Testing is only for systems you own or have written permission to test. The engine is not connected in this build; activity shown in the workspace is seeded and simulated.</p></div><div className="section-block"><ol className="pipeline-list">{steps.map(([title, detail], index) => <li key={title} style={{ gridTemplateColumns: '40px 1fr' }}><span className="pipeline-num">{String(index + 1).padStart(2, '0')}</span><div><strong>{title}</strong><p className="small" style={{ margin: '4px 0 12px' }}>{detail}</p></div></li>)}</ol><p className="small" style={{ marginTop: 20 }}>Text alternative: ROE document → automated check and manual review → scope token → Scope Guard → Recon → Scan → Identify → Verify → findings and report.</p></div></section>;
}

const featureRows = [
  ['Server-side account sessions and role checks', 'Authentication uses database-backed sessions and the API checks roles on protected routes.', 'Built'],
  ['ROE review workflow', 'The demo includes approval, correction, rejection, and a scope-token gate.', 'In progress'],
  ['Scope Guard enforcement', 'The app demonstrates an out-of-scope request being refused before it is sent.', 'In progress'],
  ['Risk rationale and audit record', 'Seeded lab findings show evidence, score context, and a blocked-request log.', 'In progress'],
  ['Live security testing engine', 'The Python engine is not connected to this web application.', 'Planned'],
  ['External CVE and KEV feed updates', 'Threat intelligence integration is not live in this build.', 'Planned'],
];
function FeaturesPage() {
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">FEATURE STATUS</span><h1>A clear view of what exists today.</h1><p className="lede">PenflowAI is in development. These labels distinguish working web features from simulated workflow and future engine work.</p></div><div className="section-block">{featureRows.map(([title, copy, status]) => <article key={title} className="feature-row"><div><h3>{title}</h3><p>{copy}</p></div><Badge tone={status === 'Built' ? 'success' : status === 'In progress' ? 'warning' : 'neutral'}>{status}</Badge></article>)}</div></section>;
}

function WaitlistPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [updates, setUpdates] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (fieldError) document.getElementById('email')?.focus(); }, [fieldError]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setFieldError('');
    try { const response = await api.post<{ message: string }>('/waitlist', { email, name, role, updatesOptIn: updates }); setDone(true); setError(response.message); }
    catch (caught) { const err = caught as ApiError; setError(err.message); setFieldError(err.fields.email ?? ''); }
    finally { setBusy(false); }
  }
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">EARLY ACCESS</span><h1>Join the waitlist.</h1><p className="lede">We will use your email only to tell you when early access opens. You can unsubscribe at any time. See the <Link to="/legal/privacy">Privacy Policy</Link>.</p></div><div className="section-block">{done ? <Alert tone="success">{error}</Alert> : <form className="form-stack" onSubmit={submit} noValidate>
    {error && <div className="error-summary" role="alert" aria-live="polite">{error}</div>}
    <Field label="Email address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} />
    <Field label="Name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
    <Field label="What best describes you?" name="role" value={role} onChange={(e) => setRole(e.target.value)} />
    <Checkbox name="updates" checked={updates} onChange={(e) => setUpdates(e.target.checked)} label="Also send me occasional product updates (optional)." />
    <Button type="submit" disabled={busy}>{busy ? 'Adding your email…' : 'Join the waitlist'}</Button>
  </form>}</div></section>;
}

function AboutPage() {
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">ABOUT PENFLOWAI</span><h1>A final-year project in development.</h1><p className="lede">PenflowAI explores how authorization checks, enforced scope, and threat-aware risk context can shape a web security testing workflow.</p></div><div className="section-block"><h2>Project status</h2><p className="small">This prototype has been designed for practice lab targets such as OWASP Juice Shop and DVWA. The web app is separate from the planned Python engine, which is not connected here. There are no customer claims or production-readiness claims.</p><h2 style={{ marginTop: 30 }}>Responsible persons</h2><p className="small">Project contributors named in the academic materials: Muhammad Sunnan and Hamza Ahmad Baig. PenflowAI is not a registered business. Registration, tax, address, and support details are not provided here.</p><p className="small">Contact: <span className="placeholder-chip">[project email]</span></p></div></section>;
}

function ContactPage() {
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">CONTACT</span><h1>Get in touch.</h1><p className="lede">The project email address has not been provided. No personal or student email is published here.</p></div><div className="section-block"><p>For privacy requests: <span className="placeholder-chip">[privacy email]</span></p><p>For an accessibility issue: <span className="placeholder-chip">[accessibility email]</span></p><p>For responsible disclosure: <span className="placeholder-chip">[security email]</span></p></div></section>;
}

function SecurityPage() {
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">SECURITY · RESPONSIBLE USE</span><h1>Scope is a safety boundary.</h1><p className="lede">Use PenflowAI only on systems you own or have clear written permission to test.</p></div><div className="section-block"><h2>Current controls</h2><ul><li>Database-backed accounts and role checks for the web API.</li><li>Passwords are stored as salted bcrypt hashes.</li><li>State-changing requests require a CSRF token.</li><li>ROE files are stored outside the web root with a size and type limit.</li><li>Seeded scan activity is simulated; no network scan engine is connected.</li></ul><p className="small">Hosting location and external providers are not selected. Do not submit sensitive or production ROE documents to this development build.</p><h2 style={{ marginTop: 30 }}>Responsible disclosure draft</h2><div className="legal-content">{renderLegalMarkdown(securityText)}</div></div></section>;
}

function AccessibilityPage() {
  return <section className="page-wrap narrow"><div className="page-intro"><span className="eyebrow">ACCESSIBILITY</span><h1>Accessibility statement.</h1><p className="lede">This draft is not a claim of WCAG conformance. Testing status must be completed before publication.</p></div><div className="section-block legal-content">{renderLegalMarkdown(accessibilityText)}</div></section>;
}

function PricingPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Plan | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { api.get<{ plans: Plan[] }>('/plans').then((data) => setPlans(data.plans)).catch((caught: Error) => setError(caught.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (selected && dialog && !dialog.open) dialog.showModal();
    if (!selected && dialog?.open) dialog.close();
  }, [selected]);
  async function confirmPlan() {
    if (!selected) return;
    setBusy(true); setMessage('');
    try { const result = await api.post<{ message: string }>('/billing/plan-requests', { planId: selected.id }); setMessage(result.message); setSelected(null); }
    catch (caught) { setMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  function choose(plan: Plan) {
    if (!user || user.role !== 'requester') { navigate('/waitlist'); return; }
    setMessage(''); setSelected(plan);
  }
  return <section className="page-wrap"><div className="page-intro"><span className="eyebrow">PLANS · EARLY ACCESS</span><h1>Planned plans.</h1><p className="lede">The figures below are launch plans, not an active checkout. No payment is collected today.</p><p className="pricing-note">Early access — plans and prices shown are for launch. Nothing is charged today.</p></div>
    {loading ? <LoadingState label="Loading plan data" /> : error ? <ErrorState message={error} /> : !plans.length ? <EmptyState title="Plan data is not available." /> : <>
      <fieldset className="pricing-toggle"><legend>Billing period</legend><label><input type="radio" name="period" value="monthly" checked={period === 'monthly'} onChange={() => setPeriod('monthly')} /> Monthly</label><label><input type="radio" name="period" value="yearly" checked={period === 'yearly'} onChange={() => setPeriod('yearly')} /> Yearly <span className="small">2 months free</span></label></fieldset>
      <div className="table-wrap"><table className="data-table pricing-table"><thead><tr><th scope="col">Plan</th><th scope="col">Price / {period === 'monthly' ? 'month' : 'year'}</th><th scope="col">Target segment</th><th scope="col">Seats / apps</th><th scope="col">Scans / month</th><th scope="col">Core security guardrails</th><th scope="col">Report type</th><th scope="col">Action-log retention</th><th scope="col">Request</th></tr></thead><tbody>{plans.map((plan) => {
        const usd = period === 'monthly' ? plan.monthlyUsd : plan.yearlyUsd;
        const pkr = period === 'monthly' ? plan.monthlyPkr : plan.yearlyPkr;
        const savingUsd = plan.yearlyUsd === null ? 0 : plan.monthlyUsd * 12 - plan.yearlyUsd;
        const savingPkr = plan.yearlyPkr === null ? 0 : plan.monthlyPkr * 12 - plan.yearlyPkr;
        return <tr key={plan.id}><td data-label="Plan"><strong>{plan.name}</strong>{plan.recommended && <span className="recommended-label">Recommended</span>}</td><td data-label="Price"><span className="price-cell"><strong>{usd === null ? 'n/a' : `$${usd}`}</strong>{plan.id !== 'free' && <span>{pkr === null ? 'n/a' : `PKR ${pkr.toLocaleString()}`}</span>}{period === 'yearly' && savingUsd > 0 && <span>Save ${savingUsd} (PKR {savingPkr.toLocaleString()}), equivalent to 2 months free.</span>}</span></td><td data-label="Target segment">{plan.segment}</td><td data-label="Seats / apps">{plan.seats}</td><td data-label="Scans / month">{plan.scans}</td><td data-label="Security guardrails">{plan.guardrails}</td><td data-label="Report type">{plan.report}</td><td data-label="Log retention">{plan.retention}</td><td data-label="Request"><Button variant="secondary" onClick={() => choose(plan)}>Choose {plan.name}</Button></td></tr>;
      })}</tbody></table></div><p className="small">Pricing shown is for launch planning. No card fields, checkout, tax calculation, or subscription activation are available. See the <Link to="/legal/refunds">Refund and Cancellation Policy</Link>.</p>
      {message && <Alert tone={message.startsWith('Billing is not live') ? 'success' : 'warning'}>{message}</Alert>}
      {selected && <dialog className="plan-dialog" ref={dialogRef} aria-labelledby="plan-dialog-title" onCancel={(event) => { event.preventDefault(); setSelected(null); }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setSelected(null); } }} onClose={() => setSelected(null)}><span className="eyebrow">PLAN REQUEST</span><h2 id="plan-dialog-title">Request {selected.name}</h2><p>Nothing will be charged. This records a pending request for launch.</p>{message && <Alert tone="danger" role="alert">{message}</Alert>}<div className="dialog-actions"><Button variant="secondary" onClick={() => setSelected(null)}>Keep current plan</Button><Button onClick={() => void confirmPlan()} disabled={busy}>{busy ? 'Recording…' : `Record ${selected.name} request`}</Button></div></dialog>}
    </>}
  </section>;
}
