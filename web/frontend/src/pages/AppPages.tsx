import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Checkbox, EmptyState, ErrorState, Field, LoadingState, LogViewer, RiskScore, StageTracker } from '../components/ui';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { AuditEvent, Finding, Plan, Roe, Run, Target } from '../lib/types';

function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.get<T>(path).then((result) => { if (active) setData(result); }).catch((caught: Error) => { if (active) setError(caught.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, revision]);
  return { data, loading, error, reload: () => setRevision((value) => value + 1) };
}

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: ReactNode; action?: ReactNode }) {
  return <header className="app-page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</header>;
}

function StatusBadge({ value }: { value: string }) {
  const tone = value === 'approved' || value === 'verified' || value === 'complete' ? 'success' : value === 'rejected' || value === 'blocked' || value === 'failed' ? 'critical' : value === 'needs_review' || value === 'running' || value === 'pending' ? 'warning' : 'neutral';
  return <Badge tone={tone}>{value.replaceAll('_', ' ')}</Badge>;
}

export function DashboardPage() {
  const { data, loading, error, reload } = useApi<{ runs: Run[]; reports: Array<{ id: string; run_id: string }>; targetCount: number; plan: Plan; scansUsed: number }>('/dashboard');
  if (loading) return <LoadingState label="Loading workspace overview" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const runs = data?.runs ?? [];
  return <><PageHeader eyebrow="WORKSPACE / OVERVIEW" title="Dashboard" detail="Your test activity, approved scope, and recent report." action={<Link className="button button-primary" to="/app/targets/new">Start a new security test</Link>} />
    <div className="stats-grid"><div className="stat"><span>Test runs</span><strong>{runs.length}</strong></div><div className="stat"><span>Targets</span><strong>{data?.targetCount ?? 0}</strong></div><div className="stat"><span>Current plan</span><strong>{data?.plan.name ?? 'Free'}</strong></div><div className="stat"><span>Scans this month</span><strong>{data?.scansUsed ?? 0} / {data?.plan.scans ?? 0}</strong></div></div>
    <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><h2>Recent test runs</h2><Link to="/app/runs">All runs</Link></div>{runs.length ? <ul className="inline-list">{runs.slice(0, 5).map((run) => <li key={run.id}><Link to={`/app/runs/${run.id}`}><span className="mono">{run.id}</span><span className="small"> · {run.stage}</span></Link><StatusBadge value={run.status} /></li>)}</ul> : <EmptyState title="No test runs yet. Start your first security test." />}</section>
      <section className="panel"><div className="panel-heading"><h2>Latest report</h2></div>{data?.reports[0] ? <p><Link to={`/app/reports/${data.reports[0].id}`}>Open report for <code>{data.reports[0].run_id}</code></Link></p> : <EmptyState title="No reports yet." />}</section></div>
    <section className="section-block"><span className="section-kicker">SAFE START</span><h2>Permission before activity</h2><p className="small">A test needs a verified target and an approved Rules of Engagement (ROE) document with a scope token. The connected engine is not available in this build.</p><div className="hero-actions"><Link className="button button-secondary" to="/app/targets">Review targets</Link><Link className="button button-secondary" to="/app/roe/new">Submit ROE document</Link></div></section>
  </>;
}

export function TargetsPage() {
  const { data, loading, error, reload } = useApi<{ targets: Target[] }>('/targets');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [challenge, setChallenge] = useState<{ name: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setBusy(true);
    try { const result = await api.post<{ message: string; verificationRecord: { name: string; value: string } | null }>('/targets', { url, label, verificationMethod: 'dns' }); setMessage(result.message); setChallenge(result.verificationRecord); setUrl(''); setLabel(''); reload(); }
    catch (caught) { setMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  async function verify(id: string) {
    try { const result = await api.post<{ message: string }>(`/targets/${id}/verify`, {}); setMessage(result.message); reload(); }
    catch (caught) { setMessage((caught as Error).message); }
  }
  return <><PageHeader eyebrow="WORKSPACE / TARGETS" title="Targets" detail="Register targets you own and prove control before requesting a test." action={<Link className="button button-secondary" to="/app/roe/new">Upload ROE</Link>} />
    <section className="panel"><div className="panel-heading"><h2>Add a target</h2></div><p className="small">Add a website you own or are allowed to test. A DNS TXT challenge must be published before the target can be used.</p><form className="form-stack" onSubmit={addTarget}><Field label="Target URL" name="target-url" type="url" required hint="Include http:// or https://. Restricted infrastructure is blocked." value={url} onChange={(e) => setUrl(e.target.value)} /><Field label="Target label" name="target-label" required value={label} onChange={(e) => setLabel(e.target.value)} /><Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add and verify target'}</Button></form>{message && <Alert tone={challenge ? 'neutral' : 'warning'}>{message}{challenge && <div className="challenge-record"><span>TXT name</span><code>{challenge.name}</code><span>TXT value</span><code>{challenge.value}</code></div>}</Alert>}</section>
    <section className="section-block"><div className="section-heading"><h2>Registered targets</h2></div>{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.targets.length ? <EmptyState title="No targets registered." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Target</th><th scope="col">Verification</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead><tbody>{data.targets.map((target) => <tr key={target.id}><td data-label="Target"><strong>{target.label}</strong><br /><code>{target.url}</code>{target.status === 'pending' && target.verification_token && <p className="small">Publish TXT <code>_penflowai-challenge.{new URL(target.url).hostname}</code> with value <code>{target.verification_token}</code>.</p>}</td><td data-label="Verification">{target.verification_method}</td><td data-label="Status"><StatusBadge value={target.status} /></td><td data-label="Action">{target.status === 'pending' && <Button variant="quiet" onClick={() => void verify(target.id)}>Verify DNS proof</Button>}</td></tr>)}</tbody></table></div>}</section>
  </>;
}

export function RoeNewPage() {
  const { data, loading, error, reload } = useApi<{ targets: Target[] }>('/targets');
  const roeList = useApi<{ roes: Roe[] }>('/roe');
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [attestation, setAttestation] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const firstInvalid = Object.keys(fieldErrors)[0];
    const target = firstInvalid === 'targets' ? document.querySelector<HTMLInputElement>('input[name="targetIds"]') : document.getElementById(firstInvalid) as HTMLInputElement | null;
    target?.focus();
  }, [fieldErrors]);
  function toggleTarget(id: string) { setTargetIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setErrorMessage(''); setFieldErrors({});
    if (!file) { setFieldErrors({ document: 'Choose a PDF or DOCX document.' }); return; }
    if (!targetIds.length) { setFieldErrors({ targets: 'Choose at least one verified target.' }); return; }
    if (!attestation) { setFieldErrors({ attestation: 'Confirm that you have written permission.' }); return; }
    const form = new FormData(); form.set('document', file); form.set('targetIds', targetIds.join(',')); form.set('attestation', 'true');
    setBusy(true);
    try { const result = await api.postForm<{ roe: Roe }>('/roe', form); navigate(`/app/roe/${result.roe.id}`); }
    catch (caught) { setErrorMessage((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <><PageHeader eyebrow="WORKSPACE / AUTHORIZATION" title="Upload ROE document" detail="A Rules of Engagement document records written permission and the exact target scope." />
    <div className="alert alert-warning">Parts of this document may be processed by an AI service when connected. Do not include passwords or secret keys. This development build does not send files to an AI provider.</div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : <form className="form-stack section-block" onSubmit={submit} noValidate>
      {errorMessage && <div className="error-summary" role="alert" aria-live="polite">{errorMessage}</div>}
      <div className="field"><label htmlFor="roe-document">ROE document <span className="required-word">required · PDF or DOCX · max 5 MB</span></label><input id="roe-document" name="document" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-describedby={fieldErrors.document ? 'document-error' : undefined} />{fieldErrors.document && <p className="field-error" id="document-error">{fieldErrors.document}</p>}</div>
      <fieldset className="panel"><legend>Verified targets <span className="required-word">required</span></legend><p className="small">Only verified targets can be included in this ROE.</p>{(data?.targets ?? []).filter((target) => target.status === 'verified').map((target) => <Checkbox key={target.id} id={`target-${target.id}`} name="targetIds" checked={targetIds.includes(target.id)} onChange={() => toggleTarget(target.id)} label={<>{target.label} · <code>{target.url}</code></>} />)}{fieldErrors.targets && <p className="field-error">{fieldErrors.targets}</p>}</fieldset>
      <Checkbox name="attestation" checked={attestation} onChange={(event) => setAttestation(event.target.checked)} error={fieldErrors.attestation} label={<>I own these systems or have written permission to test them, and this document is genuine and unaltered. <strong>required</strong></>} />
      <Button type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Upload ROE document'}</Button>
    </form>}
    <section className="section-block"><div className="section-heading"><h2>Your ROE documents</h2></div>{roeList.loading ? <LoadingState label="Loading ROE records" /> : roeList.error ? <ErrorState message={roeList.error} onRetry={roeList.reload} /> : !roeList.data?.roes.length ? <EmptyState title="No ROE documents yet." /> : <ul className="inline-list">{roeList.data.roes.map((roe) => <li key={roe.id}><Link to={`/app/roe/${roe.id}`}><code>{roe.id}</code> · {roe.file_name}</Link><StatusBadge value={roe.status} /></li>)}</ul>}</section>
  </>;
}

function parseJsonArray(value: string | undefined): string[] {
  try { const parsed = JSON.parse(value ?? '[]'); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; }
}
function roeStep(status: Roe['status']) { return status === 'checking' ? 1 : status === 'needs_review' || status === 'rejected' ? 2 : 3; }

export function RoeStatusPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ roe: Roe }>(`/roe/${id}`);
  if (loading) return <LoadingState label="Loading authorization status" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const roe = data?.roe;
  if (!roe) return <EmptyState title="This ROE document was not found." />;
  const reasons = parseJsonArray(roe.reasons_json);
  const scope = parseJsonArray(roe.scope_json);
  const step = roeStep(roe.status);
  return <><PageHeader eyebrow={`WORKSPACE / ROE / ${roe.id}`} title="Authorization status" detail={roe.file_name} action={roe.status === 'rejected' ? <Link className="button button-secondary" to="/app/roe/new">Upload a corrected document</Link> : undefined} />
    <div className="panel"><div className="panel-heading"><h2>ROE verdict</h2><StatusBadge value={roe.status} /></div><ol className="roe-rail">{['Submitted', 'Automated check', 'Manual review', 'Scope token'].map((label, index) => <li key={label} className={index <= step ? 'is-current' : ''}>{String(index + 1).padStart(2, '0')} · {label}</li>)}</ol>
      <p><strong>Automated decision:</strong> {roe.automated_decision}{roe.confidence !== null && <> · confidence <code>{roe.confidence.toFixed(2)}</code></>}</p>
      {reasons.length > 0 ? <><h3>Automated check reasons</h3><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></> : <p className="small">No automated check reasons were recorded.</p>}
      {roe.reviewer_id && <div className="section-block"><h3>Manual review</h3><p><strong>Decision:</strong> {roe.decision?.replaceAll('_', ' ')}</p><p><strong>Reviewer:</strong> {roe.reviewer_id === 'usr_sana' ? 'Sana Malik' : 'Assigned reviewer'}</p><p><strong>Note:</strong> {roe.note}</p><p className="small">{roe.decided_at ? new Date(roe.decided_at).toLocaleString() : ''}</p></div>}
    </div>
    <section className="panel"><div className="panel-heading"><h2>Approved scope</h2></div>{scope.length ? <ul className="scope-list">{scope.map((target) => <li key={target}><code>{target}</code></li>)}</ul> : <p className="small">No target scope is attached.</p>}
      {roe.scope_token ? <div className="scope-token" style={{ marginTop: 18 }}><strong>Scope token issued</strong><p className="small">Issued {roe.scope_token_issued_at ? new Date(roe.scope_token_issued_at).toLocaleString() : ''}. The displayed value is a stored token hash.</p><code>{roe.scope_token}</code></div> : <div className="scope-none" style={{ marginTop: 18 }}><strong>No token issued</strong><p className="small" style={{ margin: '5px 0 0' }}>No security test can start until this ROE is approved and a scope token is issued.</p></div>}
      <div className="section-block"><h3>Start security test</h3><p className="small">Read-only targets from this ROE. A run can start only after approval.</p><Button disabled={!roe.scope_token} aria-describedby="roe-start-reason" onClick={async () => { try { const result = await api.post<{ run: Run }>('/runs', { roeId: roe.id }); window.location.assign(`/app/runs/${result.run.id}`); } catch { reload(); } }}>Start security test</Button><span id="roe-start-reason" className="sr-only">{!roe.scope_token ? 'Disabled because no approved scope token has been issued.' : 'This approved ROE has a scope token.'}</span></div>
    </section>
  </>;
}

export function RunsPage() {
  const { data, loading, error, reload } = useApi<{ runs: Run[] }>('/runs');
  return <><PageHeader eyebrow="WORKSPACE / ACTIVITY" title="Test runs" detail="Run status and approved scope. Execution is simulated in this build." action={<Link className="button button-primary" to="/app/targets/new">Start a new security test</Link>} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.runs.length ? <EmptyState title="No test runs yet. Start your first security test." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Run</th><th scope="col">Status</th><th scope="col">Stage</th><th scope="col">Started</th><th scope="col">Scope</th></tr></thead><tbody>{data.runs.map((run) => <tr key={run.id}><td data-label="Run"><Link to={`/app/runs/${run.id}`}><code>{run.id}</code></Link></td><td data-label="Status"><StatusBadge value={run.status} /></td><td data-label="Stage">{run.stage}</td><td data-label="Started">{new Date(run.started_at).toLocaleString()}</td><td data-label="Scope"><code>{parseJsonArray(run.scope_json).join(', ')}</code></td></tr>)}</tbody></table></div>}</>;
}

export function RunMonitorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<{ run: Run; roe: Roe; events: AuditEvent[]; simulated: boolean }>(`/runs/${id}`);
  const [clock, setClock] = useState(Date.now());
  const [visibleEvents, setVisibleEvents] = useState(0);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 900);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!data?.events.length) return;
    setVisibleEvents((count) => Math.min(data.events.length, Math.max(count, 1)));
    if (data.run.status !== 'running') { setVisibleEvents(data.events.length); return; }
    const timer = window.setInterval(() => setVisibleEvents((count) => Math.min(data.events.length, count + 1)), 900);
    return () => window.clearInterval(timer);
  }, [data?.events.length, data?.run.status]);
  if (loading) return <LoadingState label="Loading run monitor" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const run = data?.run;
  const roe = data?.roe;
  if (!run || !roe) return <EmptyState title="This test run was not found." />;
  const elapsed = Math.max(0, Math.floor((clock - new Date(run.started_at).getTime()) / 1000));
  const scope = parseJsonArray(run.scope_json);
  async function startAgain() {
    try { const result = await api.post<{ run: Run }>('/runs', { roeId: run!.roe_id }); navigate(`/app/runs/${result.run.id}`); }
    catch (caught) { setActionError((caught as Error).message); }
  }
  async function stopRun() {
    try { await api.post(`/runs/${run!.id}/stop`, {}); reload(); }
    catch (caught) { setActionError((caught as Error).message); }
  }
  return <><PageHeader eyebrow={`WORKSPACE / RUNS / ${run.id}`} title="Run monitor" detail={<span>Simulated live view — engine not connected. <code>{run.id}</code></span>} action={run.status === 'running' ? <Button variant="danger" onClick={() => void stopRun()}>Stop test</Button> : <Link className="button button-secondary" to={`/app/findings/${run.id}`}>View findings</Link>} />
    {actionError && <Alert tone="danger" role="alert">{actionError}</Alert>}
    <section className="panel"><div className="panel-heading"><h2>Run state</h2><StatusBadge value={run.status} /></div><div className="stats-grid"><div className="stat"><span>Current stage</span><strong>{run.stage}</strong></div><div className="stat"><span>Elapsed</span><strong>{Math.floor(elapsed / 60)}m {elapsed % 60}s</strong></div><div className="stat"><span>Started</span><strong style={{ fontSize: 16 }}>{new Date(run.started_at).toLocaleTimeString()}</strong></div><div className="stat"><span>Engine</span><strong style={{ fontSize: 16 }}>Not connected</strong></div></div><div style={{ marginTop: 20 }}><StageTracker current={run.stage} /></div></section>
    <section className="panel"><div className="panel-heading"><h2>Approved scope summary</h2></div><ul className="scope-list">{scope.map((target) => <li key={target}><code>{target}</code></li>)}</ul>{roe.scope_token ? <p className="small" style={{ marginTop: 12 }}>Scope token issued · hash <code>{roe.scope_token.slice(0, 20)}…</code></p> : <div className="scope-none"><strong>No token issued</strong><p>The test cannot start until a reviewer approves this scope.</p></div>}<Button disabled={!roe.scope_token || run.status === 'running' || run.status === 'complete'} aria-describedby="start-disabled-reason" onClick={() => void startAgain()}>{run.status === 'running' ? 'Test in progress' : 'Start security test'}</Button><span id="start-disabled-reason" className="sr-only">{!roe.scope_token ? 'An approved ROE and scope token are required.' : run.status === 'complete' ? 'This run is already complete.' : run.status === 'running' ? 'A run is already in progress.' : ''}</span></section>
    <section className="section-block"><div className="section-heading"><div><span className="section-kicker">AUDIT TRAIL</span><h2>Action log</h2></div><Link to={`/app/findings/${run.id}`}>Findings</Link></div><LogViewer events={(data?.events ?? []).slice(0, visibleEvents)} /></section>
  </>;
}

export function FindingsPage() {
  const { runId = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ findings: Finding[] }>(`/runs/${runId}/findings`);
  return <><PageHeader eyebrow={`WORKSPACE / FINDINGS / ${runId}`} title="Findings" detail="Severity is paired with evidence and a business and threat-intelligence rationale." action={<Link className="button button-secondary" to={`/app/runs/${runId}`}>Back to run monitor</Link>} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.findings.length ? <EmptyState title="No findings for this run." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Severity / finding</th><th scope="col">Component</th><th scope="col">Risk score</th><th scope="col">Threat signal</th></tr></thead><tbody>{data.findings.map((finding) => <tr key={finding.id}><td data-label="Finding"><Badge tone={finding.severity === 'critical' ? 'critical' : finding.severity === 'high' ? 'high' : finding.severity === 'medium' ? 'medium' : 'low'}>{finding.severity}</Badge><strong style={{ display: 'block', marginTop: 8 }}>{finding.title}</strong><details className="finding-details"><summary>Evidence and score rationale</summary><p>{finding.plain_language}</p><p><strong>Why this score:</strong> {finding.score_rationale}</p><p><strong>Evidence:</strong> {finding.evidence}</p>{finding.cve_id && <p><strong>CVE:</strong> <code>{finding.cve_id}</code></p>}</details></td><td data-label="Component"><code>{finding.component}</code></td><td data-label="Risk score"><RiskScore score={finding.risk_score} /></td><td data-label="Threat signal">{finding.actively_exploited ? <Badge tone="critical">KEV · Actively exploited</Badge> : <Badge>Not flagged KEV</Badge>}</td></tr>)}</tbody></table></div>}</>;
}

export function ReportsPage() {
  const { data, loading, error, reload } = useApi<{ reports: Array<{ id: string; run_id: string; generated_at: string }> }>('/reports');
  return <><PageHeader eyebrow="WORKSPACE / REPORTS" title="Reports" detail="Report text is generated from seeded data in this build; the report engine is not connected." />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.reports.length ? <EmptyState title="No reports yet." /> : <ul className="inline-list">{data.reports.map((report) => <li key={report.id}><Link to={`/app/reports/${report.id}`}><code>{report.id}</code> · {report.run_id}</Link><span className="small">{new Date(report.generated_at).toLocaleDateString()}</span></li>)}</ul>}</>;
}

function renderMarkdown(markdown: string) {
  return markdown.split('\n').map((line, index) => {
    if (!line.trim()) return null;
    if (line.startsWith('# ')) return <h1 key={index}>{line.slice(2)}</h1>;
    if (line.startsWith('## ')) return <h2 key={index}>{line.slice(3)}</h2>;
    if (line.startsWith('- ')) return <p key={index}>• {line.slice(2)}</p>;
    if (/^\d+\. /.test(line)) return <p key={index}>{line}</p>;
    return <p key={index}>{line}</p>;
  });
}

export function ReportViewPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useApi<{ report: { id: string; run_id: string; markdown: string; generated_at: string } }>(`/reports/${id}`);
  if (loading) return <LoadingState label="Loading report" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data?.report) return <EmptyState title="This report was not found." />;
  return <><PageHeader eyebrow={`WORKSPACE / REPORTS / ${id}`} title="Security test report" detail={`Run ${data.report.run_id} · ${new Date(data.report.generated_at).toLocaleString()}`} action={<button className="button button-secondary" onClick={() => window.print()}>Print / save as PDF</button>} /><article className="panel report-content">{renderMarkdown(data.report.markdown)}<p className="small">AI-assisted content may be incomplete or incorrect. Review evidence before acting. This report is seeded and illustrative.</p></article><p><a href={`/api/reports/${id}`} download={`${id}.json`}>Download report data (JSON)</a></p></>;
}

export function BillingPage() {
  const { data, loading, error, reload } = useApi<{ plan: Plan; scansUsed: number; invoices: unknown[]; planRequests: Array<{ id: string; plan_id: string; status: string }> }>('/billing');
  const [message, setMessage] = useState('');
  async function cancel(id: string) {
    try { const result = await api.post<{ message: string }>(`/billing/plan-requests/${id}/cancel`, {}); setMessage(result.message); reload(); }
    catch (caught) { setMessage((caught as Error).message); }
  }
  if (loading) return <LoadingState label="Loading billing status" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  return <><PageHeader eyebrow="WORKSPACE / BILLING" title="Billing" detail="Early access plan and usage. Billing is not live; no payment method is collected." action={<Link className="button button-secondary" to="/pricing">View launch plans</Link>} />
    <section className="panel"><div className="panel-heading"><h2>Current plan · {data?.plan.name}</h2><Badge tone="warning">Launch plan</Badge></div><div className="usage-row"><span>Scans used</span><div className="usage-track" aria-label={`${data?.scansUsed ?? 0} of ${data?.plan.scans ?? 0} scans used`}><span style={{ width: `${Math.min(100, (data?.scansUsed ?? 0) / Math.max(1, data?.plan.scans ?? 1) * 100)}%` }} /></div><span>{data?.scansUsed ?? 0} / {data?.plan.scans ?? 0}</span></div><p className="small">Usage counts are seeded demo data; no scan engine is connected.</p></section>
    <section className="panel"><div className="panel-heading"><h2>Invoices</h2></div>{data?.invoices.length ? <p>Invoice records available.</p> : <EmptyState title="No invoices — billing is not live." />}</section>
    <section className="panel"><div className="panel-heading"><h2>Plan requests</h2></div>{data?.planRequests.length ? <ul className="inline-list">{data.planRequests.map((request) => <li key={request.id}><span>{request.plan_id} · <StatusBadge value={request.status} /></span>{request.status === 'pending_activation' && <Button variant="quiet" onClick={() => void cancel(request.id)}>Cancel plan request</Button>}</li>)}</ul> : <EmptyState title="No pending plan requests." />}{message && <Alert>{message}</Alert>}</section>
  </>;
}

export function SettingsPage() {
  const { user, refresh, signOut } = useSession();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setError('');
    try { await api.put('/me', { displayName }); await refresh(); setMessage('Profile updated.'); }
    catch (caught) { setError((caught as Error).message); }
  }
  async function deleteAccount() {
    if (!window.confirm('Delete your account and data? This action cannot be undone.')) return;
    try { await api.delete('/me'); await signOut().catch(() => undefined); navigate('/'); }
    catch (caught) { setError((caught as Error).message); }
  }
  return <><PageHeader eyebrow="WORKSPACE / SETTINGS" title="Settings" detail="Manage account details and request an export or deletion." />{message && <Alert tone="success">{message}</Alert>}{error && <Alert tone="danger" role="alert">{error}</Alert>}
    <section className="panel"><h2>Profile</h2><form className="form-stack" onSubmit={save}><Field label="Display name" name="displayName" autoComplete="name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /><Field label="Email address" name="email" type="email" autoComplete="email" value={user?.email ?? ''} disabled /><p className="small">Multi-factor authentication is not available in this development build.</p><Button type="submit">Save profile</Button></form></section>
    <section className="panel"><h2>Your data</h2><p className="small">Export your account records as JSON. Account deletion removes application data; billing records are not active in early access.</p><div className="hero-actions"><a className="button button-secondary" href="/api/me/export" target="_blank" rel="noreferrer">Download my data</a><Button variant="danger" onClick={() => void deleteAccount()}>Delete my account and data</Button></div></section>
  </>;
}

export function ReviewQueuePage() {
  const { data, loading, error, reload } = useApi<{ queue: Array<Roe & { owner_name: string; owner_email: string }> }>('/review');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  async function decide(id: string, decision: 'approve' | 'reject' | 'request_correction') {
    const note = notes[id]?.trim() ?? '';
    if (!note) { setMessages((current) => ({ ...current, [id]: decision === 'reject' ? 'A note is required when rejecting a document.' : 'Add a review note before submitting this decision.' })); return; }
    setBusy(id); setMessages((current) => ({ ...current, [id]: '' }));
    try { await api.post(`/review/${id}`, { decision, note }); setMessages((current) => ({ ...current, [id]: `Decision recorded: ${decision.replaceAll('_', ' ')}.` })); reload(); }
    catch (caught) { setMessages((current) => ({ ...current, [id]: (caught as Error).message })); }
    finally { setBusy(''); }
  }
  return <><PageHeader eyebrow="STAFF / ROE REVIEW" title="Review queue" detail="Review flagged authorization documents. Every decision is recorded in the audit log." />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : !data?.queue.length ? <EmptyState title="No documents need review." /> : data.queue.map((roe) => <article className="panel" key={roe.id}><div className="panel-heading"><div><h2>{roe.file_name}</h2><p className="small">{roe.owner_name} · {roe.owner_email} · <code>{roe.id}</code></p></div><Badge tone="warning">Confidence {roe.confidence?.toFixed(2)}</Badge></div><h3>Automated check reasons</h3><ul>{parseJsonArray(roe.reasons_json).map((reason) => <li key={reason}>{reason}</li>)}</ul><p><strong>Accepted attestation:</strong> The requester confirms ownership or written permission and that the document is genuine and unaltered.</p><label className="field"><span>Reviewer note <span className="required-word">required for every decision</span></span><textarea value={notes[roe.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [roe.id]: event.target.value }))} /></label>{messages[roe.id] && <Alert tone={messages[roe.id].startsWith('Decision') ? 'success' : 'danger'} role={messages[roe.id].startsWith('Decision') ? 'status' : 'alert'}>{messages[roe.id]}</Alert>}<div className="hero-actions"><Button disabled={busy === roe.id} onClick={() => void decide(roe.id, 'approve')}>Approve</Button><Button variant="danger" disabled={busy === roe.id} onClick={() => void decide(roe.id, 'reject')}>Reject</Button><Button variant="secondary" disabled={busy === roe.id} onClick={() => void decide(roe.id, 'request_correction')}>Ask for a corrected document</Button></div></article>)}</>;
}

export function AdminPage({ kind }: { kind: 'users' | 'tools' | 'models' | 'audit-log' }) {
  const endpoint = kind === 'audit-log' ? '/admin/audit-log' : `/admin/${kind}`;
  const { data, loading, error, reload } = useApi<Record<string, Array<Record<string, unknown>>>>(endpoint);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [actor, setActor] = useState('');
  const events = (data?.events ?? []) as unknown as AuditEvent[];
  const filtered = useMemo(() => events.filter((event) => (!blockedOnly || Boolean(event.blocked)) && (!actor || event.actor === actor)), [events, blockedOnly, actor]);
  const titles = { users: 'Users', tools: 'Tools registry', models: 'Model versions', 'audit-log': 'Audit log' };
  return <><PageHeader eyebrow="STAFF / ADMINISTRATION" title={titles[kind]} detail={kind === 'audit-log' ? 'All workspace audit events, including the single refused out-of-scope request.' : 'Read-only operational view. Engine integrations are not connected.'} />{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={reload} /> : kind === 'audit-log' ? <><div className="panel"><div className="field"><label htmlFor="audit-actor">Filter by actor</label><select id="audit-actor" value={actor} onChange={(event) => setActor(event.target.value)}><option value="">All actors</option>{['requester', 'agent', 'scope_guard', 'reviewer', 'system'].map((value) => <option key={value}>{value}</option>)}</select></div><Checkbox name="blockedOnly" checked={blockedOnly} onChange={(event) => setBlockedOnly(event.target.checked)} label="Show blocked events only" /></div><LogViewer events={filtered} /></> : kind === 'users' ? <><AdminRows kind="users" rows={data?.users ?? []} /><section className="section-block"><div className="section-heading"><h2>Waitlist entries</h2></div><AdminRows kind="waitlist" rows={data?.waitlist ?? []} /></section></> : <AdminRows kind={kind} rows={data?.[kind] ?? []} />}</>;
}

function AdminRows({ kind, rows }: { kind: string; rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return <EmptyState title={`No ${kind} records are available.`} />;
  const keys = Object.keys(rows[0]);
  return <div className="table-wrap"><table className="data-table"><thead><tr>{keys.map((key) => <th scope="col" key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{keys.map((key) => <td key={key} data-label={key.replaceAll('_', ' ')}>{String(row[key] ?? '—')}</td>)}</tr>)}</tbody></table></div>;
}
