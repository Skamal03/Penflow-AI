import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { sampleReport } from '../data/sample-report';
import type { ReportFinding, ScanReport, SeverityKey } from '../lib/reportTypes';

/** Same five levels, colours and wording as core/reporting/schema.py. */
function levelFor(report: ScanReport, key: SeverityKey) {
  return report.severity_scale.find((level) => level.key === key) ?? report.severity_scale[report.severity_scale.length - 1];
}

function sevStyle(colour: string): CSSProperties {
  return { '--c': colour } as CSSProperties;
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function SeverityPill({ report, finding }: { report: ScanReport; finding: ReportFinding }) {
  const level = levelFor(report, finding.severity_key);
  return (
    <span className="rp-badge" style={sevStyle(level.colour)}>
      <span aria-hidden="true">{level.icon}</span> {finding.severity}
    </span>
  );
}

function FindingCard({ report, finding, technical }: { report: ScanReport; finding: ReportFinding; technical: boolean }) {
  const level = levelFor(report, finding.severity_key);
  return (
    <details className="rp-card" style={sevStyle(level.colour)}>
      <summary>
        <SeverityPill report={report} finding={finding} />
        <span className="rp-card-title">{finding.name}</span>
        <span className="rp-card-meta">
          <code>{finding.tool}</code> · {finding.url}
        </span>
        {finding.text_source === 'fallback' && <span className="rp-auto">auto-text</span>}
      </summary>
      <div className="rp-card-body">
        <p>{finding.summary}</p>
        <div className="rp-fix">
          <h4>What to do</h4>
          <p>{finding.mitigation}</p>
        </div>
        {technical && (finding.technical_note || finding.evidence) && (
          <div className="rp-technical">
            {finding.technical_note && <><h4>Technical note</h4><p>{finding.technical_note}</p></>}
            {finding.evidence && <><h4>Evidence</h4><pre>{finding.evidence}</pre></>}
          </div>
        )}
      </div>
    </details>
  );
}

export function ReportPage({ report = sampleReport }: { report?: ScanReport }) {
  const [severity, setSeverity] = useState<'all' | SeverityKey>('all');
  const [technical, setTechnical] = useState(false);

  const findings = useMemo(
    () => [...report.findings].sort((a, b) => a.severity_rank - b.severity_rank || a.name.localeCompare(b.name)),
    [report],
  );
  const shown = useMemo(
    () => (severity === 'all' ? findings : findings.filter((finding) => finding.severity_key === severity)),
    [findings, severity],
  );

  useEffect(() => {
    // Save-as-PDF should always show the full detail, never a collapsed card.
    const openAll = () => {
      document.querySelectorAll<HTMLDetailsElement>('.rp-card').forEach((card) => { card.open = true; });
    };
    window.addEventListener('beforeprint', openAll);
    return () => window.removeEventListener('beforeprint', openAll);
  }, []);

  const overall = report.overall;
  const ran = report.tools.filter((tool) => tool.status === 'ok').length;

  return (
    <div className="rp">
      <header className="app-page-header">
        <div>
          <span className="eyebrow">WORKSPACE / REPORT</span>
          <h1>Security assessment report</h1>
          <p>
            Engine report for {report.target}. Rendered from the sample <code>report.json</code> produced by
            {' '}<code>core/reporting</code>; the backend will serve this file in a later phase.
          </p>
        </div>
        <button className="button button-secondary" onClick={() => window.print()}>Download PDF</button>
      </header>

      <section className="rp-cover">
        <span className="rp-brand">PenflowAI</span>
        <h2>Security assessment report</h2>
        <p className="rp-target">{report.target}</p>
        <p className="rp-meta">
          {dateLabel(report.generated_at)} · Duration {duration(report.duration_seconds)} · Run {report.run_id}
        </p>
        <span className="rp-overall" style={sevStyle(overall.colour)}>
          <span aria-hidden="true">{overall.icon}</span> {overall.label}
        </span>
      </section>

      <section className="panel">
        <h2>Executive summary</h2>
        <p>{report.executive_summary}</p>
        <ul className="rp-facts">
          <li>Total findings <strong>{report.counts.total}</strong></li>
          <li>Critical <strong>{report.counts.critical}</strong></li>
          <li>High <strong>{report.counts.high}</strong></li>
          <li>Tools that ran <strong>{ran} of {report.tools.length}</strong></li>
        </ul>
      </section>

      <section className="panel">
        <h2>Severity scale</h2>
        <div className="rp-scale">
          {report.severity_scale.map((level) => (
            <div key={level.key} className={`rp-seg${level.key === overall.key ? ' is-overall' : ''}`} style={sevStyle(level.colour)}>
              <span className="rp-seg-bar" aria-hidden="true" />
              {level.key === overall.key && <span className="rp-marker">Overall</span>}
              <span className="rp-seg-count">{report.counts[level.key]}</span>
              <span className="rp-seg-label">{level.label}</span>
            </div>
          ))}
        </div>
        <ul className="rp-legend">
          {report.severity_scale.map((level) => (
            <li key={level.key}>
              <span className="rp-dot" style={sevStyle(level.colour)} aria-hidden="true" />
              <span>
                <strong>{level.label}</strong> — {level.meaning} <span className="rp-muted">({level.fix})</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel rp-controls">
        <div className="rp-chips" role="group" aria-label="Filter findings by severity">
          <button type="button" className="rp-chip" aria-pressed={severity === 'all'} onClick={() => setSeverity('all')}>
            All ({report.counts.total})
          </button>
          {report.severity_scale.map((level) => (
            <button
              key={level.key}
              type="button"
              className="rp-chip"
              aria-pressed={severity === level.key}
              onClick={() => setSeverity(level.key)}
            >
              {level.label} ({report.counts[level.key]})
            </button>
          ))}
        </div>
        <label className="rp-toggle">
          <input type="checkbox" checked={technical} onChange={(event) => setTechnical(event.target.checked)} />
          Show technical detail
        </label>
      </section>

      <section className="panel">
        <h2>Findings</h2>
        <p className="small" aria-live="polite">Showing {shown.length} of {findings.length} findings</p>
        {shown.length === 0 ? (
          <p className="small">
            {findings.length === 0
              ? 'No findings were produced. Check the tool coverage section below.'
              : 'No findings at this severity. Choose “All” to see the rest.'}
          </p>
        ) : (
          shown.map((finding) => (
            <FindingCard key={finding.id} report={report} finding={finding} technical={technical} />
          ))
        )}
      </section>

      <section className="panel">
        <h2>Tool coverage</h2>
        <p>{report.coverage_note}</p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th scope="col">Tool</th><th scope="col">Status</th><th scope="col">Findings</th><th scope="col">Detail</th></tr>
            </thead>
            <tbody>
              {report.tools.map((tool) => (
                <tr key={tool.name}>
                  <td><strong>{tool.name}</strong></td>
                  <td>{tool.status}</td>
                  <td>{tool.count}</td>
                  <td>{tool.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="rp-footer">
        <p>
          AI-assisted text, verify before acting. Generated by PenflowAI (schema {report.schema_version}).
          {!report.ai.used && ' AI text was not used for this report.'}
        </p>
        <p><Link to="/app/reports">Back to reports</Link></p>
      </footer>
    </div>
  );
}
